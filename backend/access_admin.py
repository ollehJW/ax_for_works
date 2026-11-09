from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from backend.admin import admin_user
from backend.database import database

router=APIRouter(prefix='/api/admin/access',dependencies=[Depends(admin_user)])
KST=ZoneInfo('Asia/Seoul')

def period_bounds(days, instant=None):
    today=(instant or datetime.now(timezone.utc)).astimezone(KST).date()
    start=today-timedelta(days=days-1)
    return start,today,datetime.combine(start,datetime.min.time(),KST),datetime.combine(today+timedelta(days=1),datetime.min.time(),KST)

@router.get('')
def access(request: Request, days: int=Query(7), service: str=Query('all',max_length=64),
           page: int=Query(1,ge=1,le=1000000), snapshot: int | None=Query(None,ge=0)):
    # IDs follow the public gateway prefixes; presentation names come from the catalog.
    if days not in (7,30):
        raise HTTPException(422,'조회 기간은 7일 또는 30일입니다.')
    from urllib.parse import urlsplit
    services={'platform':'AX for Works'}
    for agent in request.app.state.agent_registry.values():
        services[urlsplit(str(agent.url)).path.strip('/').split('/')[0]]=agent.name
    if service!='all' and service not in services:
        raise HTTPException(422,'서비스를 확인해 주세요.')
    first,last,start,end=period_bounds(days)
    with database() as db:
        # One consistent view for chart, summary, total and page.
        db.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        upper=snapshot if snapshot is not None else db.execute('SELECT COALESCE(MAX(event_id),0) AS n FROM platform.access_events').fetchone()['n']
        clauses=['occurred_at >= %s','occurred_at < %s','event_id <= %s']
        params=[start,end,upper]
        if service!='all':
            clauses.append('service_id=%s');params.append(service)
        where=' AND '.join(clauses)
        summary=db.execute('SELECT count(*) AS events,count(DISTINCT user_id) AS visitors FROM platform.access_events WHERE '+where,params).fetchone()
        daily=db.execute("""SELECT (occurred_at AT TIME ZONE 'Asia/Seoul')::date AS day,
            count(DISTINCT user_id) AS visitors FROM platform.access_events WHERE """+where+' GROUP BY 1 ORDER BY 1',params).fetchall()
        total=summary['events'];pages=max(1,(total+9)//10);actual_page=min(page,pages)
        rows=db.execute("""SELECT event_id,user_id,employee_id,full_name,team_name,service_id,event_kind,occurred_at
            FROM platform.access_events WHERE """+where+' ORDER BY occurred_at DESC,event_id DESC LIMIT 10 OFFSET %s',
            (*params,(actual_page-1)*10)).fetchall()
        started=db.execute('SELECT started_at FROM platform.access_collection WHERE singleton=TRUE').fetchone()['started_at']
    counts={row['day']:row['visitors'] for row in daily}
    series=[{'day':first+timedelta(days=i),'visitors':counts.get(first+timedelta(days=i),0)} for i in range(days)]
    return {'days':days,'service':service,'series':series,'summary':summary,'events':rows,
            'page':actual_page,'page_size':10,'total':total,'pages':pages,'snapshot':upper,
            'collection_started_at':started,'services':[{'id':key,'name':value} for key,value in services.items()]}
