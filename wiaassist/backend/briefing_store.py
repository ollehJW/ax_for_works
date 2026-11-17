"""Encrypted briefing material and durable manual workflow state."""
import uuid
import json
from datetime import datetime,timezone
from . import store,chat_store,mail_sync,mail_eval


def list_items(uid,account,include_completed=False):
    with store.database() as db:
        rows=db.execute('''SELECT * FROM wiaassist.briefing_items WHERE user_id=%s AND graph_user_id=%s AND merged_into IS NULL
            AND (%s OR state<>'completed') ORDER BY event_at DESC,item_id''',(uid,account,include_completed)).fetchall()
    result=[]
    for r in rows:
        content=chat_store.decode(r['content'])
        events=chat_store.decode(r['calendar_override']) if r['calendar_override'] is not None else content.get('events',[])
        events=[dict(e,id=e.get('id') or 'auto-'+str(i),title=e.get('title') or content['title']) for i,e in enumerate(events)]
        result.append(dict(content,id=r['item_id'],state=r['state'],source_ids=r['source_ids'],events=events,
            calendar_revision=r['calendar_revision'],calendar_manual=r['calendar_override'] is not None))
    return result


def set_state(uid,account,item_id,state):
    with store.database() as db:
        # Same account lock as generation: a completed/pinned click cannot be overwritten.
        db.execute('SELECT user_id FROM wiaassist.graph_connections WHERE user_id=%s FOR UPDATE',(uid,))
        row=db.execute('''SELECT state FROM wiaassist.briefing_items WHERE user_id=%s AND graph_user_id=%s
            AND item_id=%s AND merged_into IS NULL FOR UPDATE''',(uid,account,item_id)).fetchone()
        if not row:return False
        if row['state']=='completed' and state!='completed':return False
        db.execute('UPDATE wiaassist.briefing_items SET state=%s,updated_at=now() WHERE item_id=%s',(state,item_id))
    return True


def set_calendar(uid,account,item_id,events,revision):
    with store.database() as db:
        connection=db.execute('SELECT graph_user_id,is_active FROM wiaassist.graph_connections WHERE user_id=%s FOR UPDATE',(uid,)).fetchone()
        if not connection or not connection['is_active'] or connection['graph_user_id']!=account:return 'missing'
        row=db.execute("SELECT * FROM wiaassist.briefing_items WHERE user_id=%s AND graph_user_id=%s AND item_id=%s AND merged_into IS NULL AND state<>'completed' FOR UPDATE",(uid,account,item_id)).fetchone()
        if not row:return 'missing'
        if row['calendar_revision']!=revision:return 'conflict'
        previous=chat_store.decode(row['calendar_override']) if row['calendar_override'] is not None else []
        known={e['id'] for e in previous}
        saved=[]
        for event in events:
            value=dict(event)
            if value.get('id') not in known:value['id']=str(uuid.uuid4())
            saved.append(value)
        if len({e['id'] for e in saved})!=len(saved):return 'conflict'
        db.execute('UPDATE wiaassist.briefing_items SET calendar_override=%s,calendar_revision=calendar_revision+1,updated_at=now() WHERE item_id=%s',
            (chat_store.encode(saved),item_id))
    return 'ok'


def start(uid,account):
    with store.database() as db:
        c=db.execute('SELECT graph_user_id,is_active FROM wiaassist.graph_connections WHERE user_id=%s FOR UPDATE',(uid,)).fetchone()
        if not c or c['graph_user_id']!=account or not c['is_active']:return None
        if db.execute("SELECT 1 FROM wiaassist.briefing_jobs WHERE user_id=%s AND graph_user_id=%s AND status='running'",(uid,account)).fetchone():return None
        if db.execute("SELECT 1 FROM wiaassist.chat_jobs WHERE user_id=%s AND graph_user_id=%s AND status='running'",(uid,account)).fetchone():return None
        return db.execute('''INSERT INTO wiaassist.briefing_jobs(job_id,user_id,graph_user_id,progress) VALUES(%s,%s,%s,%s::jsonb) RETURNING *''',
            (str(uuid.uuid4()),uid,account,json.dumps({'mail':'pending','chats':'pending','briefing':'pending'}))).fetchone()


def progress(job_id,value,status='running'):
    with store.database() as db:
        db.execute("UPDATE wiaassist.briefing_jobs SET progress=%s::jsonb,status=%s,updated_at=now() WHERE job_id=%s AND status='running'",(json.dumps(value),status,job_id))


def job(uid,account):
    with store.database() as db:
        return db.execute('SELECT * FROM wiaassist.briefing_jobs WHERE user_id=%s AND graph_user_id=%s ORDER BY created_at DESC LIMIT 1',(uid,account)).fetchone()


def interrupted():
    with store.database() as db:
        db.execute("UPDATE wiaassist.briefing_jobs SET status='interrupted',updated_at=now() WHERE status='running'")


def purge(uid):
    with store.database() as db:
        db.execute('DELETE FROM wiaassist.briefing_items WHERE user_id=%s',(uid,))
        db.execute('DELETE FROM wiaassist.briefing_jobs WHERE user_id=%s',(uid,))


def event(date,time,kind):
    date=mail_eval.date_value(str(date)) if date else None
    if not date:return None
    return {'date':date,'time':str(time)[:5] if time else None,'kind':kind}


def sources(uid,account):
    mails=store.mail_page(uid,account,mail_sync.window_start(),301,0,3)
    with store.database() as db:
        rows=db.execute('''SELECT h.*,a.content AS area_content FROM wiaassist.chat_history h JOIN wiaassist.chat_areas a ON a.area_id=h.area_id
            WHERE h.user_id=%s AND h.graph_user_id=%s ORDER BY h.event_at DESC LIMIT 301''',(uid,account)).fetchall()
    if len(mails)+len(rows)>300:raise ValueError('Too much briefing material')
    result=[];hist={r['history_id']:r for r in rows}
    # Only leaf histories are new briefing material; parents supply identity for stable state.
    parents={r['parent_id'] for r in rows if r['parent_id']}
    for r in mails:
        c=r['content'];d=r.get('evaluation_details') or {}
        result.append({'key':'mail:'+r['message_id'],'source_ids':['mail:'+r['message_id']],
            'kind':'mail','title':c.get('subject',''),'description':r.get('summary') or c.get('preview',''),
            'event_at':r['received_at'],'category':r['category'],'evidence':d.get('evidence',''),
            'schedule':event(d.get('scheduled_date'),d.get('scheduled_time'),'meeting') if d.get('meeting_kind')!='cancellation' else None,
            'deadline':event(r.get('due_date'),r.get('due_time'),'deadline') if d.get('due_kind')!='meeting' else None,
            'status':d.get('status'),'meeting_kind':d.get('meeting_kind'),'references':[{'kind':'mail','id':r['message_id'],'title':c.get('subject',''),'thread_id':r.get('conversation_id')}],
            'url':None})
    for r in rows:
        if r['history_id'] in parents:continue
        h=chat_store.decode(r['content']);ids=[];current=r
        while current and 'chat:'+current['history_id'] not in ids:
            ids.append('chat:'+current['history_id']);current=hist.get(current['parent_id'])
        cancelled=(h.get('relevance') or {}).get('meeting_kind')=='cancellation'
        result.append({'key':'chat:'+r['history_id'],'source_ids':ids,'kind':'chat','title':h['title'],'description':h['description'],
            'event_at':r['event_at'].isoformat(),'category':h['category'],'evidence':h.get('evidence',''),
            'schedule':event(h.get('due_date'),h.get('due_time'),'meeting') if h['category']=='schedule' and not cancelled else None,
            'deadline':event(h.get('due_date'),h.get('due_time'),'deadline') if h['category']!='schedule' else None,
            'status':'cancelled' if cancelled else None,'references':[{'kind':'chat','id':r['history_id'],'title':h['title'],
                'area':chat_store.decode(r['area_content'])['name'],'sources':h.get('sources',[]),'evidence':h.get('evidence','')}]})
    incoming_keys={k for s in result for k in s['source_ids']}
    incoming_threads={r.get('thread_id') for s in result for r in s.get('references',[]) if r.get('thread_id')}
    previous=[h for h in list_items(uid,account,True) if h['state']!='completed'
        or incoming_keys.intersection(h['source_ids'])
        or incoming_threads.intersection(r.get('thread_id') for r in h.get('references',[]) if r.get('thread_id'))]
    if len(result)+len(previous)>300:raise ValueError('Too much briefing material')
    for h in previous:
        result.append({'key':'saved:'+h['id'],'source_ids':h['source_ids'],'kind':'saved','item_id':h['id'],
            'title':h['title'],'description':h['description'],'event_at':h['event_at'],'category':h.get('category','work'),
            'schedule':next((e for e in h.get('events',[]) if e['kind']=='meeting'),None),
            'deadline':next((e for e in h.get('events',[]) if e['kind']=='deadline'),None),
            'state':h['state'],'references':h.get('references',[]),'status':h.get('status')})
    return result


def commit(uid,account,groups):
    with store.database() as db:
        c=db.execute('SELECT graph_user_id,is_active FROM wiaassist.graph_connections WHERE user_id=%s FOR UPDATE',(uid,)).fetchone()
        if not c or c['graph_user_id']!=account or not c['is_active']:raise ValueError('Account changed')
        old=db.execute('SELECT * FROM wiaassist.briefing_items WHERE user_id=%s AND graph_user_id=%s AND merged_into IS NULL FOR UPDATE',(uid,account)).fetchall()
        used=set()
        for group in groups:
            matches=[r for r in old if set(r['source_ids'])&set(group['source_ids']) or r['item_id'] in group['existing_ids']]
            ids={r['item_id'] for r in matches}
            if used&ids:raise ValueError('Split existing briefing item')
            used|=ids
            # User-completed items never reappear; a pin survives summary refresh and merging.
            state='completed' if any(r['state']=='completed' for r in matches) else 'pinned' if any(r['state']=='pinned' for r in matches) else 'active'
            item_id=sorted(ids)[0] if ids else str(uuid.uuid4())
            keys=list(dict.fromkeys(group['source_ids']+[s for r in matches for s in r['source_ids']]))
            content={k:v for k,v in group.items() if k not in ('source_ids','existing_ids')}
            # Preserve all manually registered events when duplicate work cards merge.
            manual=[r for r in matches if r['calendar_override'] is not None]
            override=None
            if manual:
                merged_events={}
                for r in manual:
                    for e in chat_store.decode(r['calendar_override']):
                        key=(e['kind'],e['date'],e.get('time'),e.get('title'))
                        merged_events[key]=e
                override=chat_store.encode(list(merged_events.values()))
            primary=next((r for r in matches if r['item_id']==item_id),None)
            revision=(primary['calendar_revision'] if primary else 0)
            if primary and (len(matches)>1 or (not manual and chat_store.decode(primary['content']).get('events',[])!=content.get('events',[]))):revision+=1
            db.execute('''INSERT INTO wiaassist.briefing_items(item_id,user_id,graph_user_id,state,source_ids,content,event_at,calendar_override,calendar_revision)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(item_id) DO UPDATE SET source_ids=EXCLUDED.source_ids,
                content=EXCLUDED.content,event_at=EXCLUDED.event_at,state=EXCLUDED.state,calendar_override=EXCLUDED.calendar_override,calendar_revision=EXCLUDED.calendar_revision,updated_at=now()''',
                (item_id,uid,account,state,keys,chat_store.encode(content),group['event_at'],override,revision))
            for other in ids-{item_id}:db.execute('UPDATE wiaassist.briefing_items SET merged_into=%s WHERE item_id=%s',(item_id,other))
