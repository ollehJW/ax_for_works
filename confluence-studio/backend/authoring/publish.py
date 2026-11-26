import base64
import os
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..core.confluence import confluence_get
from ..core.db import database
from ..core.security import account, decrypt_token
from .storage import ASSET_NAME, RI, validate_storage

router = APIRouter()


class ImageAsset(BaseModel):
    name: str = Field(max_length=64)
    data: str = Field(max_length=32000000)


class Publication(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    space_key: str = Field(min_length=1, max_length=255)
    parent_id: str = Field(pattern=r'^[0-9]{1,20}$')
    storage: str = Field(min_length=1, max_length=100000)
    images: list[ImageAsset] = Field(default_factory=list, max_length=80)


def attachments(body):
    names = {image.name for image in body.images}
    root = validate_storage(body.storage, names)
    referenced = {node.get(f'{{{RI}}}filename') for node in root.iter(f'{{{RI}}}attachment')}
    if names != referenced or len(names) != len(body.images):
        raise HTTPException(422, '본문과 첨부 이미지가 일치하지 않습니다.')
    files = []
    for image in body.images:
        if not ASSET_NAME.fullmatch(image.name):
            raise HTTPException(422, '첨부 이미지 이름을 확인해 주세요.')
        try:
            data = base64.b64decode(image.data, validate=True)
        except ValueError:
            raise HTTPException(422, '첨부 이미지를 읽을 수 없습니다.') from None
        png = image.name.endswith('.png')
        if not data.startswith(b'\x89PNG\r\n\x1a\n' if png else b'\xff\xd8\xff'):
            raise HTTPException(422, '첨부 이미지 형식을 확인해 주세요.')
        files.append(('file', (image.name, data, 'image/png' if png else 'image/jpeg')))
    return files


@router.post('/api/draft/publish')
def publish(body: Publication, user_id=Depends(account)):
    title = body.title.strip()
    if not title:
        raise HTTPException(422, '페이지 제목을 입력해 주세요.')
    with database() as db:
        row = db.execute("""SELECT c.token FROM confluence_studio.connections c
            JOIN confluence_studio.registered_spaces s USING (user_id, confluence_user_key)
            WHERE c.user_id=%s AND s.space_key=%s""", (user_id, body.space_key)).fetchone()
    if not row:
        raise HTTPException(404, '등록한 스페이스를 선택해 주세요.')
    token = decrypt_token(row['token'])
    parent = confluence_get(token, f'/rest/api/content/{body.parent_id}?expand=space')
    if parent.status_code != 200 or parent.json().get('space', {}).get('key') != body.space_key:
        raise HTTPException(422, '상위 페이지의 위치와 접근 권한을 확인해 주세요.')
    files = attachments(body)
    base = os.environ['CONFLUENCE_BASE_URL'].rstrip('/')
    payload = {'type': 'page', 'title': title, 'space': {'key': body.space_key},
               'ancestors': [{'id': body.parent_id}],
               'body': {'storage': {'representation': 'storage', 'value': body.storage}}}
    with httpx.Client(headers={'Authorization': 'Bearer ' + token}, timeout=45) as client:
        try:
            response = client.post(base + '/rest/api/content', json=payload)
            if response.status_code in (400, 409):
                raise HTTPException(409, '같은 제목의 페이지가 있는지, 작성 위치가 올바른지 확인해 주세요.')
            if response.status_code in (401, 403):
                raise HTTPException(403, 'Confluence 연결 및 페이지 작성 권한을 확인해 주세요.')
            response.raise_for_status()
            page_id = str(response.json()['id'])
            if not page_id.isdecimal():
                raise ValueError
        except (httpx.HTTPError, KeyError, ValueError):
            raise HTTPException(502, '작성 결과를 확인하지 못했습니다. 다시 작성하기 전에 상위 페이지를 확인해 주세요.') from None
        result = {'url': base + '/pages/viewpage.action?' + urlencode({'pageId': page_id})}
        if files:
            try:
                uploaded = client.post(base + f'/rest/api/content/{page_id}/child/attachment',
                                       headers={'X-Atlassian-Token': 'no-check'}, files=files)
                uploaded.raise_for_status()
            except httpx.HTTPError:
                result['warning'] = '페이지가 작성되었습니다. Confluence에서 첨부 이미지의 업로드 상태를 확인해 주세요.'
        return result
