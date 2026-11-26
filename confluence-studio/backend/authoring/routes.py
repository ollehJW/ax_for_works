import asyncio
import contextlib
import json
import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from lxml import etree
from openai import OpenAIError
from starlette.concurrency import run_in_threadpool

from ax_llm_client import create_llm_client, deployment
from ..core.db import database
from ..core.security import account, decrypt_token
from ..sources.reader import source_material
from .layout import prepare_layout
from .prompts import revision_prompt, system_prompt
from .schemas import DraftRequest, PreviewRequest, RevisionRequest
from .storage import RI, ASSET_NAME, place_images, preview_storage, safe_view, validate_storage

router = APIRouter()
SCHEMA = {'type': 'object', 'properties': {k: {'type': 'string'} for k in ('title', 'storage')},
          'required': ['title', 'storage'], 'additionalProperties': False}


def connected_token(user_id=Depends(account)):
    with database() as db:
        row = db.execute('SELECT token FROM confluence_studio.connections WHERE user_id=%s',(user_id,)).fetchone()
    if not row:
        raise HTTPException(409, '먼저 Confluence 계정을 연결해 주세요.')
    return decrypt_token(row['token'])

async def complete(prompt, content, schema=SCHEMA):
    async with create_llm_client() as client:
        answer = await client.chat.completions.create(
            model=deployment(), max_completion_tokens=8000,
            messages=[{'role':'system','content':prompt}, {'role':'user','content':content}],
            response_format={'type':'json_schema','json_schema':{'name':'studio_draft','strict':True,'schema':schema}})
    choice = answer.choices[0]
    if choice.finish_reason != 'stop':
        raise ValueError
    result = json.loads(choice.message.content or '')
    if not isinstance(result['title'],str) or not result['title'].strip() or not isinstance(result['storage'],str):
        raise ValueError
    return result


@router.post('/api/draft')
async def generate(body: DraftRequest, token=Depends(connected_token)):
    material = await run_in_threadpool(source_material, body.source) if body.source else {'text': '', 'images': []}
    images = material['images']
    if not material['text'] and not images and not body.instructions.strip():
        raise HTTPException(422, '작성 요청을 입력하거나 자료를 첨부해 주세요.')

    async def completion():
        try:
            content = [{'type': 'text', 'text': json.dumps({'instructions': body.instructions,
                        'source_text': material['text']}, ensure_ascii=False)}]
            for image in images:
                content.append({'type':'text','text':f"Source image {image['name']}; location: {image['locations']}"})
                content.append({'type':'image_url','image_url':{
                    'url':'data:image/jpeg;base64,' + image['thumbnail']}})
            result = await complete(system_prompt(body.source.name if body.source else None), content)
            storage = place_images(result['storage'], images)
            storage, formulas = await run_in_threadpool(prepare_layout, storage, {i['name'] for i in images})
            validate_storage(storage, {i['name'] for i in images + formulas})
            return {'title':result['title'].strip(), 'storage':storage,
                    'images':[{k:v for k,v in i.items() if k != 'thumbnail'} for i in images + formulas]}
        except (OpenAIError, ValueError, TypeError, KeyError, IndexError, HTTPException) as exc:
            logging.getLogger(__name__).warning('Draft failed: %s status=%s',type(exc).__name__,getattr(exc,'status_code',None))
            return {'detail':'초안 생성에 실패했습니다. 작성 요청을 확인한 뒤 다시 시도해 주세요.'}

    return stream_completion(completion)


def stream_completion(completion):
    async def stream():
        task = asyncio.create_task(completion())
        try:
            # JSON whitespace keeps the gateway connection active while the model is working.
            yield b' '
            while not task.done():
                await asyncio.wait({task}, timeout=6)
                if not task.done():
                    yield b' '
            yield json.dumps(task.result(),ensure_ascii=False).encode()
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
    return StreamingResponse(stream(),media_type='application/json',headers={'X-Accel-Buffering':'no'})

@router.post('/api/draft/revise')
async def revise(body: RevisionRequest, token=Depends(connected_token)):
    names = set(body.image_names)
    if not body.message.strip() or any(not ASSET_NAME.fullmatch(name) for name in names):
        raise HTTPException(422, '수정 요청과 자료 이미지를 확인해 주세요.')
    validate_storage(body.storage, names)

    async def revision():
        try:
            schema = {**SCHEMA, 'properties': {**SCHEMA['properties'], 'reply': {'type': 'string'}},
                      'required': ['title', 'storage', 'reply']}
            result = await complete(revision_prompt(), body.model_dump_json(exclude={'parent_id'}), schema)
            storage, formulas = await run_in_threadpool(prepare_layout, result['storage'], names)
            root = validate_storage(storage, names | {asset['name'] for asset in formulas})
            used = sorted({node.get(f'{{{RI}}}filename') for node in root.iter(f'{{{RI}}}attachment')})
            return {'title': result['title'].strip()[:255], 'storage': storage, 'formulas': formulas,
                    'image_names': used, 'reply': result['reply']}
        except (OpenAIError, ValueError, TypeError, KeyError, IndexError, HTTPException) as exc:
            logging.getLogger(__name__).warning('Revision failed: %s', type(exc).__name__)
            return {'detail': '초안을 수정하지 못했습니다. 수정 요청을 다시 보내 주세요.'}

    return stream_completion(revision)


@router.post('/api/draft/preview')
def preview(body: PreviewRequest, token=Depends(connected_token)):
    if any(not ASSET_NAME.fullmatch(name) for name in body.image_names):
        raise HTTPException(422, '자료 이미지 이름을 확인해 주세요.')
    names = set(body.image_names)
    formatted, formulas = prepare_layout(body.storage, names)
    storage, markers = preview_storage(formatted, names | {i['name'] for i in formulas})
    base = os.environ['CONFLUENCE_BASE_URL'].rstrip('/')
    if not base.startswith('https://'):
        raise HTTPException(503, 'Confluence 주소를 확인해 주세요.')
    payload = {'representation':'storage','value':storage}
    if body.parent_id:
        payload['content'] = {'id':body.parent_id}
    try:
        reply = httpx.post(base+'/rest/api/contentbody/convert/view',json=payload,timeout=12,
                           headers={'Authorization':'Bearer '+token,'Accept':'application/json'})
        if reply.status_code == 401:
            raise HTTPException(409,'Confluence 토큰을 다시 연결해 주세요.')
        reply.raise_for_status()
        value = reply.json()['value']
        if not isinstance(value,str) or not value.strip():
            raise ValueError
        return {'view':safe_view(value, markers), 'storage':formatted, 'formulas':formulas}
    except (httpx.HTTPError, KeyError, TypeError, ValueError, etree.ParserError):
        raise HTTPException(502,'Confluence 미리보기를 불러오지 못했습니다. 초안은 그대로 사용할 수 있습니다.') from None
