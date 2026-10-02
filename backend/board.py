"""Authenticated announcements and patch notes; administrator-only publishing."""
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from backend.auth import ready_user
from backend.database import database

router = APIRouter(prefix='/api/board', dependencies=[Depends(ready_user)])
Kind = Literal['notice', 'patch']

class PostBody(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    category: Kind
    title: str = Field(min_length=1, max_length=160)
    content: str = Field(min_length=1, max_length=30000)

    @field_validator('title', 'content')
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError('내용을 입력해 주세요.')
        return value


def editor(request: Request, user=Depends(ready_user)):
    if not user['is_admin']:
        raise HTTPException(403, '관리자만 게시글을 작성하거나 수정할 수 있습니다.')
    origin = request.headers.get('origin')
    if request.headers.get('x-ax-request') != '1' or (origin and (urlsplit(origin).scheme not in ('http', 'https') or urlsplit(origin).netloc != request.headers.get('host'))):
        raise HTTPException(403, '허용되지 않은 요청입니다.')
    return user


@router.get('')
def posts(category: Kind = 'notice', page: int = Query(1, ge=1), q: str = Query('', max_length=100)):
    where = 'category=%s AND (%s=\'\' OR strpos(lower(title),lower(%s))>0)'
    params = (category, q.strip(), q.strip())
    with database() as db:
        total = db.execute('SELECT count(*) AS n FROM platform.board_posts WHERE '+where, params).fetchone()['n']
        rows = db.execute('SELECT post_id,category,title,created_at,updated_at FROM platform.board_posts WHERE '+where+' ORDER BY created_at DESC,post_id DESC LIMIT 10 OFFSET %s', (*params, (page-1)*10)).fetchall()
    return {'posts': rows, 'total': total, 'page': page, 'page_size': 10}


@router.get('/{post_id}')
def post(post_id: UUID):
    with database() as db:
        row = db.execute('SELECT post_id,category,title,content,created_at,updated_at FROM platform.board_posts WHERE post_id=%s', (str(post_id),)).fetchone()
    if not row:
        raise HTTPException(404, '게시글을 찾을 수 없습니다.')
    return row


@router.post('', status_code=201)
def create(body: PostBody, user=Depends(editor)):
    with database() as db:
        row = db.execute('''INSERT INTO platform.board_posts (post_id,category,title,content,created_by)
            VALUES (%s,%s,%s,%s,%s) RETURNING post_id''', (str(uuid4()),body.category,body.title,body.content,user['user_id'])).fetchone()
    return row


@router.put('/{post_id}')
def update(post_id: UUID, body: PostBody, user=Depends(editor)):
    with database() as db:
        row = db.execute('''UPDATE platform.board_posts SET category=%s,title=%s,content=%s,updated_at=now()
            WHERE post_id=%s RETURNING post_id''', (body.category,body.title,body.content,str(post_id))).fetchone()
    if not row:
        raise HTTPException(404, '게시글을 찾을 수 없습니다.')
    return row
