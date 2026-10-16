"""Administrator-only catalog visibility and feedback triage."""
from typing import Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from backend.auth import ready_user
from backend.database import database
from backend.agent_catalog import catalog_rows


def admin_user(user=Depends(ready_user)):
    if not user['is_admin']:
        raise HTTPException(403, '관리자만 이용할 수 있습니다.')
    return user


router = APIRouter(prefix='/api/admin', dependencies=[Depends(admin_user)])
Status = Literal['received', 'reviewing', 'resolved', 'on_hold']
Kind = Literal['agent_bug','agent_improvement','new_agent','platform_inquiry','agent_usage','other']


class AgentState(BaseModel):
    model_config = ConfigDict(extra='forbid')
    enabled: StrictBool
    expected_enabled: StrictBool


@router.get('/agents')
def agents(request: Request):
    registry = request.app.state.agent_registry
    return {'agents': [{**registry[row['agent_id']].model_dump(mode='json',exclude={'url','enabled'}),
                        'enabled': row['enabled'], 'updated_at': row['updated_at'],
                        'admin_url': f"/api/admin/agents/{row['agent_id']}/launch"} for row in catalog_rows(registry)]}


@router.patch('/agents/{agent_id}')
def toggle_agent(agent_id: str, body: AgentState, request: Request, user=Depends(admin_user)):
    if agent_id not in request.app.state.agent_registry:
        raise HTTPException(404, 'Agent를 찾을 수 없습니다.')
    with database() as db:
        row = db.execute('''UPDATE platform.agents SET enabled=%s,updated_by=%s,updated_at=now()
            WHERE agent_id=%s AND enabled=%s RETURNING agent_id,enabled,updated_at''',
            (body.enabled,user['user_id'],agent_id,body.expected_enabled)).fetchone()
    if row is None:
        raise HTTPException(409, '다른 관리자가 변경했습니다. 목록을 새로고침한 후 다시 시도해 주세요.')
    return row


@router.get('/agents/{agent_id}/launch')
def admin_launch(agent_id: str, request: Request):
    agent = request.app.state.agent_registry.get(agent_id)
    if agent is None:
        raise HTTPException(404, 'Agent를 찾을 수 없습니다.')
    # All current services resolve their shared administrator session at /agent.
    url = urlsplit(str(agent.url))
    path = url.path.rstrip('/')
    if not path.endswith('/agent'):
        path += '/agent'
    return RedirectResponse(urlunsplit((url.scheme,url.netloc,path,url.query,'')),status_code=302)


def public_images(row):
    for item in row['images']:
        item.pop('filename',None)
        item['url'] = f"/api/feedbacks/{row['feedback_id']}/images/{item['image_id']}"
    return row


@router.get('/feedbacks')
def feedbacks(page: int = Query(1,ge=1), status: Status | None = None, feedback_type: Kind | None = None,
              agent_id: str = Query('',max_length=64), q: str = Query('',max_length=100),
              order: Literal['newest','oldest'] = 'newest'):
    clauses, params = [], []
    for column,value in [('status',status),('feedback_type',feedback_type),('agent_id',agent_id)]:
        if value:
            clauses.append('f.'+column+'=%s');params.append(value)
    if q.strip():
        clauses.append("(strpos(lower(f.content),lower(%s))>0 OR strpos(lower(COALESCE(u.full_name,'')),lower(%s))>0 OR strpos(lower(COALESCE(u.employee_id,'')),lower(%s))>0)")
        params.extend([q.strip()]*3)
    where=' AND '.join(clauses) or 'TRUE'
    join=' FROM platform.feedbacks f LEFT JOIN platform.users u ON u.user_id=f.created_by '
    direction='DESC' if order=='newest' else 'ASC'
    with database() as db:
        counts={row['status']:row['n'] for row in db.execute('SELECT status,count(*) AS n FROM platform.feedbacks GROUP BY status').fetchall()}
        total=db.execute('SELECT count(*) AS n'+join+'WHERE '+where,params).fetchone()['n']
        rows=db.execute('''SELECT f.feedback_id,f.feedback_type,f.agent_id,f.agent_name,f.status,
            left(f.content,200) AS preview,jsonb_array_length(f.images) AS image_count,
            f.created_at,u.full_name AS author_name''' +join+'WHERE '+where+
            f' ORDER BY f.created_at {direction},f.feedback_id {direction} LIMIT 10 OFFSET %s',(*params,(page-1)*10)).fetchall()
        options=db.execute('SELECT DISTINCT agent_id,agent_name FROM platform.feedbacks WHERE agent_id IS NOT NULL ORDER BY agent_name').fetchall()
    return {'feedbacks':rows,'total':total,'page':page,'page_size':10,'counts':counts,'agents':options}


@router.get('/feedbacks/{feedback_id}')
def feedback_detail(feedback_id: UUID):
    with database() as db:
        row=db.execute('''SELECT f.*,u.full_name AS author_name,u.employee_id AS author_employee_id,
            editor.full_name AS updated_by_name FROM platform.feedbacks f
            LEFT JOIN platform.users u ON u.user_id=f.created_by
            LEFT JOIN platform.users editor ON editor.user_id=f.updated_by WHERE feedback_id=%s''',(str(feedback_id),)).fetchone()
    if row is None:
        raise HTTPException(404,'피드백을 찾을 수 없습니다.')
    return public_images(row)


class FeedbackUpdate(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    status: Status
    reply: str = Field(max_length=10000)
    admin_note: str = Field(max_length=10000)
    revision: int = Field(ge=0,strict=True)


@router.patch('/feedbacks/{feedback_id}')
def update_feedback(feedback_id: UUID,body: FeedbackUpdate,user=Depends(admin_user)):
    with database() as db:
        row=db.execute('''UPDATE platform.feedbacks SET status=%s,reply=%s,admin_note=%s,
            updated_by=%s,updated_at=now(),revision=revision+1
            WHERE feedback_id=%s AND revision=%s RETURNING feedback_id,status,reply,admin_note,revision,updated_at''',
            (body.status,body.reply,body.admin_note,user['user_id'],str(feedback_id),body.revision)).fetchone()
        if row is None:
            exists=db.execute('SELECT 1 FROM platform.feedbacks WHERE feedback_id=%s',(str(feedback_id),)).fetchone()
            raise HTTPException(409 if exists else 404,'다른 관리자가 수정했습니다. 새로고침 후 다시 확인해 주세요.' if exists else '피드백을 찾을 수 없습니다.')
    return row
