"""Private feedback submissions and validated image attachments."""
import base64
import binascii
from io import BytesIO
import json
import os
from pathlib import Path
import shutil
import warnings
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from starlette.concurrency import run_in_threadpool

from backend.auth import ready_user
from backend.database import ROOT, database

router = APIRouter(prefix='/api/feedbacks')
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_REQUEST_BYTES = 36 * 1024 * 1024
MAX_PIXELS = 20_000_000
FORMATS = {'PNG': ('png', 'image/png'), 'JPEG': ('jpg', 'image/jpeg'), 'WEBP': ('webp', 'image/webp')}


class Attachment(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=200)
    data: str = Field(min_length=1, max_length=7 * 1024 * 1024)


class FeedbackBody(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    feedback_type: Literal['agent_bug', 'agent_improvement', 'new_agent', 'other']
    agent_id: str | None = Field(default=None, max_length=64)
    content: str = Field(min_length=1, max_length=10000)
    images: list[Attachment] = Field(default_factory=list, max_length=5)

    @model_validator(mode='after')
    def agent_required(self):
        if self.feedback_type in ('agent_bug', 'agent_improvement'):
            if not self.agent_id:
                raise ValueError('Agent를 선택해 주세요.')
        elif self.agent_id is not None:
            raise ValueError('이 유형에는 Agent를 선택할 수 없습니다.')
        return self


def storage_root():
    return Path(os.getenv('AX_FEEDBACKS_DIR', str(ROOT / 'feedbacks'))).resolve()


def prepare_image(attachment):
    """Decode and re-encode actual raster pixels; never trust extensions or MIME."""
    try:
        raw = base64.b64decode(attachment.data, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(422, '이미지 데이터를 읽을 수 없습니다.') from None
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, '이미지는 파일당 5MB까지 첨부할 수 있습니다.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as source:
                fmt = source.format
                if fmt not in FORMATS or source.width * source.height > MAX_PIXELS:
                    raise HTTPException(422, 'PNG, JPG, WebP 이미지(2,000만 화소 이하)만 첨부할 수 있습니다.')
                if getattr(source, 'n_frames', 1) != 1:
                    raise HTTPException(422, '움직이는 이미지는 지원하지 않습니다. 정지 이미지를 첨부해 주세요.')
                source.load()
                img = ImageOps.exif_transpose(source).convert('RGB' if fmt == 'JPEG' else 'RGBA')
                img.info.clear()
                output = BytesIO()
                img.save(output, format=fmt)
                clean = output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, '손상되었거나 지원하지 않는 이미지입니다.') from None
    if len(clean) > 10 * 1024 * 1024:
        raise HTTPException(413, '처리 후 이미지 크기가 큽니다. 해상도를 줄여 다시 첨부해 주세요.')
    extension, mime = FORMATS[fmt]
    image_id = str(uuid4())
    return {'image_id': image_id, 'filename': image_id + '.' + extension,
            'name': attachment.name, 'content_type': mime, 'size': len(clean)}, clean


def save_feedback(body, user, registry):
    agent = registry.get(body.agent_id) if body.agent_id else None
    if body.agent_id and agent is None:
        raise HTTPException(422, '현재 이용 가능한 Agent를 선택해 주세요.')
    prepared = [prepare_image(image) for image in body.images]
    feedback_id = str(uuid4())
    root = storage_root()
    folder = root / feedback_id
    metadata = [meta for meta, _ in prepared]
    try:
        if prepared:
            root.mkdir(parents=True, exist_ok=True, mode=0o700)
            folder.mkdir(mode=0o700)
            for meta, data in prepared:
                file = folder / meta['filename']
                with file.open('xb') as stream:
                    stream.write(data)
                file.chmod(0o600)
        with database() as db:
            db.execute('''INSERT INTO platform.feedbacks
                (feedback_id,feedback_type,agent_id,agent_name,content,images,created_by)
                VALUES (%s,%s,%s,%s,%s,%s,%s)''',
                (feedback_id, body.feedback_type, body.agent_id, agent.name if agent else None,
                 body.content, Jsonb(metadata), user['user_id']))
    except Exception:
        if folder.exists():
            shutil.rmtree(folder)
        raise
    return {'feedback_id': feedback_id}


@router.post('', status_code=201)
async def create_feedback(request: Request, user=Depends(ready_user)):
    # The app's same-origin/X-AX-Request middleware guards this mutation.
    if request.headers.get('content-type', '').split(';')[0].strip() != 'application/json':
        raise HTTPException(415, 'JSON 요청만 지원합니다.')
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_REQUEST_BYTES:
            raise HTTPException(413, '첨부 용량이 너무 큽니다. 이미지를 줄여 주세요.')
    try:
        body = FeedbackBody.model_validate(json.loads(raw))
    except (ValueError, ValidationError):
        raise HTTPException(422, '유형, Agent, 내용(1~10,000자)과 이미지(최대 5장)를 확인해 주세요.') from None
    return await run_in_threadpool(save_feedback, body, user, request.app.state.agent_registry)


@router.get('')
def list_feedbacks(page: int = Query(1, ge=1), user=Depends(ready_user)):
    where, params = ('TRUE', ()) if user['is_admin'] else ('f.created_by=%s', (user['user_id'],))
    with database() as db:
        total = db.execute('SELECT count(*) AS n FROM platform.feedbacks f WHERE ' + where, params).fetchone()['n']
        rows = db.execute('''SELECT f.feedback_id,f.feedback_type,f.agent_name,f.content,f.images,f.created_at,
                u.full_name AS author_name FROM platform.feedbacks f
                LEFT JOIN platform.users u ON u.user_id=f.created_by WHERE ''' + where +
                ' ORDER BY f.created_at DESC,f.feedback_id DESC LIMIT 10 OFFSET %s', (*params, (page - 1) * 10)).fetchall()
    for row in rows:
        for image in row['images']:
            image.pop('filename', None)
            image['url'] = f"/api/feedbacks/{row['feedback_id']}/images/{image['image_id']}"
    return {'feedbacks': rows, 'total': total, 'page': page, 'page_size': 10}


@router.get('/{feedback_id}/images/{image_id}')
def read_image(feedback_id: UUID, image_id: UUID, user=Depends(ready_user)):
    with database() as db:
        row = db.execute('SELECT created_by,images FROM platform.feedbacks WHERE feedback_id=%s', (str(feedback_id),)).fetchone()
    if not row or (not user['is_admin'] and row['created_by'] != user['user_id']):
        raise HTTPException(404, '이미지를 찾을 수 없습니다.')
    meta = next((item for item in row['images'] if item['image_id'] == str(image_id)), None)
    if meta is None:
        raise HTTPException(404, '이미지를 찾을 수 없습니다.')
    root = storage_root()
    file = (root / str(feedback_id) / meta['filename']).resolve()
    if not file.is_relative_to(root / str(feedback_id)) or not file.is_file():
        raise HTTPException(404, '이미지를 찾을 수 없습니다.')
    return FileResponse(file, media_type=meta['content_type'], headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})
