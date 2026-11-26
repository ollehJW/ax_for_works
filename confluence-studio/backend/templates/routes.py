import base64
import os
import re
from pathlib import Path
from urllib.parse import parse_qs, unquote_plus, urlencode, urlsplit

from fastapi import APIRouter, Depends, HTTPException
from lxml import etree, html
from openai import OpenAIError
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from ..authoring.routes import stream_completion
from ..authoring.storage import safe_view
from ..core.confluence import confluence_get
from ..core.db import database
from ..core.security import account, decrypt_token
from ax_llm_client import create_llm_client, deployment

router = APIRouter()
PROMPT = Path(__file__).with_name('extract.txt').read_text()


class PageInput(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class Extraction(BaseModel):
    page_id: str = Field(pattern=r'^[0-9]{1,20}$')
    version: int = Field(gt=0)


class Section(BaseModel):
    heading: str
    instruction: str


class Blueprint(BaseModel):
    name: str
    purpose: str
    sections: list[Section]
    styles: list[str]


def strict_schema(model):
    schema = model.model_json_schema()
    for obj in [schema, *schema.get('$defs', {}).values()]:
        obj['additionalProperties'] = False
    return schema


def page_path(url):
    base = urlsplit(os.environ['CONFLUENCE_BASE_URL'].rstrip('/'))
    try:
        target = urlsplit(url.strip())
        if (target.scheme != 'https' or target.hostname != base.hostname or target.username is not None
                or (target.port or 443) != (base.port or 443)):
            raise ValueError
    except ValueError:
        raise HTTPException(422, '연결된 Confluence의 페이지 URL을 입력해 주세요.') from None
    prefix = base.path.rstrip('/') + '/'
    if not target.path.startswith(prefix):
        raise HTTPException(422, 'Confluence 페이지 경로를 확인해 주세요.')
    path = target.path[len(prefix):]
    args = {'expand': 'body.view,version'}
    match = re.fullmatch(r'(?:spaces/[^/]+/)?pages/(\d{1,20})(?:/.*)?', path)
    page_id = match[1] if match else parse_qs(target.query).get('pageId', [''])[0]
    tiny = re.fullmatch(r'x/([A-Za-z0-9_-]{1,11})/?', path)
    if tiny:
        encoded = tiny[1].ljust(11, 'A') + '='
        page_id = str(int.from_bytes(base64.b64decode(encoded, altchars=b'_-'), 'little'))
    if re.fullmatch(r'[0-9]{1,20}', page_id):
        return '/rest/api/content/' + page_id + '?' + urlencode(args)
    match = re.fullmatch(r'display/([^/]+)/(.+)', path)
    if match:
        args.update(spaceKey=unquote_plus(match[1]), title=unquote_plus(match[2]), type='page')
        return '/rest/api/content?' + urlencode(args)
    raise HTTPException(422, '페이지 ID 또는 /display/ 경로가 포함된 페이지 URL을 입력해 주세요.')


def connection(user):
    with database() as db:
        row = db.execute('SELECT token, confluence_user_key FROM confluence_studio.connections WHERE user_id=%s',
                         (user,)).fetchone()
    if not row:
        raise HTTPException(409, '먼저 Confluence 계정을 연결해 주세요.')
    return decrypt_token(row['token']), row['confluence_user_key']


def fetch_page(token, path):
    response = confluence_get(token, path)
    if response.status_code in (401, 403, 404):
        raise HTTPException(403, '페이지 접근 권한과 Confluence 연결을 확인해 주세요.')
    if response.status_code != 200:
        raise HTTPException(502, 'Confluence 페이지를 불러오지 못했습니다.')
    try:
        data = response.json()
    except ValueError:
        raise HTTPException(502, 'Confluence 응답을 읽을 수 없습니다. 연결 상태를 확인해 주세요.') from None
    if 'results' in data:
        if not data['results']:
            raise HTTPException(404, '페이지를 찾을 수 없습니다.')
        data = data['results'][0]
    if data.get('type') != 'page':
        raise HTTPException(422, 'Confluence 페이지 URL을 입력해 주세요.')
    return data


def structure(storage):
    # Preserve layout evidence while withholding example values, links and attachment names.
    if not storage.strip():
        raise HTTPException(422, '본문이 비어 있어 추출할 구조가 없습니다.')
    root = html.fragment_fromstring(storage, create_parent='div')
    generic = {'개요','목적','배경','범위','절차','담당자','일정','결과','상태','비고','항목','내용','요약','결론','구분','날짜','부서'}
    for node in root.iterdescendants():
        if not isinstance(node.tag, str) or node.tag in {'script', 'style'}:
            node.drop_tree()
            continue
        attrs = dict(node.attrib)
        node.attrib.clear()
        for key in ('ac:name','ac:type','rowspan','colspan','scope'):
            if re.fullmatch(r'[a-zA-Z0-9_-]{1,40}', attrs.get(key, '')):
                node.set(key, attrs[key])
        style = re.findall(r'(?:^|;)\s*((?:text-align|background-color|color|font-weight)\s*:\s*(?:#[a-fA-F0-9]{3,8}|left|right|center|bold|normal))\s*(?=;|$)', attrs.get('style',''))
        if style:
            node.set('style',';'.join(style))
        if node.text and node.text.strip() not in generic:
            node.text = '[내용]' if node.text.strip() else ''
        node.tail = '[내용]' if (node.tail or '').strip() else ''
    root.text = '[내용]' if (root.text or '').strip() else ''
    sample = html.tostring(root, encoding='unicode')
    if len(sample) > 100000:
        raise HTTPException(422, '페이지 구조가 너무 큽니다. 더 짧은 페이지를 선택해 주세요.')
    return sample


@router.post('/api/templates/preview')
def preview(body: PageInput, user=Depends(account)):
    page = fetch_page(connection(user)[0], page_path(body.url))
    try:
        view = safe_view(page['body']['view']['value'] or '<p></p>')
    except (KeyError, TypeError, etree.ParserError):
        raise HTTPException(502, '페이지 본문을 표시할 수 없습니다.') from None
    return {'page_id': str(page['id']), 'version': page['version']['number'], 'title': page['title'], 'view': view}


@router.post('/api/templates/extract')
async def extract(body: Extraction, user=Depends(account)):
    token, key = await run_in_threadpool(connection, user)
    page = await run_in_threadpool(fetch_page, token, f'/rest/api/content/{body.page_id}?expand=body.storage,version')
    if page['version']['number'] != body.version:
        raise HTTPException(409, '원본이 변경되었습니다. 페이지를 다시 불러와 주세요.')
    sample = structure(page['body']['storage']['value'])

    async def completion():
        try:
            async with create_llm_client() as client:
                response = await client.chat.completions.create(model=deployment(), max_completion_tokens=4500,
                    messages=[{'role':'system','content':PROMPT},{'role':'user','content':sample}],
                    response_format={'type':'json_schema','json_schema':{'name':'template','strict':True,
                                    'schema':strict_schema(Blueprint)}})
            choice = response.choices[0]
            if choice.finish_reason != 'stop':
                raise ValueError
            blueprint = Blueprint.model_validate_json(choice.message.content or '')
            if not blueprint.name.strip() or not blueprint.sections:
                raise ValueError
        except (OpenAIError, ValueError, IndexError):
            return {'detail':'템플릿을 추출하지 못했습니다. 다시 시도해 주세요.'}

        def save():
            with database() as db:
                return db.execute("""INSERT INTO confluence_studio.templates
                    (user_id,confluence_user_key,page_id,version,blueprint)
                    SELECT user_id,confluence_user_key,%s,%s,%s FROM confluence_studio.connections
                    WHERE user_id=%s AND confluence_user_key=%s
                    ON CONFLICT (user_id,confluence_user_key,page_id) DO UPDATE
                    SET version=excluded.version, blueprint=excluded.blueprint
                    WHERE confluence_studio.templates.version <= excluded.version
                    RETURNING page_id, blueprint""",
                    (body.page_id, body.version, Jsonb(blueprint.model_dump()), user, key)).fetchone()
        return await run_in_threadpool(save) or {'detail':'페이지 또는 연결 정보가 변경되었습니다. 다시 확인해 주세요.'}
    return stream_completion(completion)
