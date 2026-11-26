import base64
import binascii
import json
import subprocess
import sys
from pathlib import Path

from fastapi import HTTPException


def source_material(source):
    try:
        raw = base64.b64decode(source.data, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(422, '첨부 파일을 읽을 수 없습니다.') from None
    if len(raw) > 8 * 1024**2:
        raise HTTPException(413, '8 MB 이하의 문서를 첨부해 주세요.')
    try:
        proc = subprocess.run([sys.executable, '-m', 'backend.sources.worker', source.name],
                              cwd=Path(__file__).resolve().parents[2], input=raw, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=24)
    except subprocess.TimeoutExpired:
        raise HTTPException(422, '자료 분석 시간이 초과되었습니다. 작은 문서로 시도해 주세요.') from None
    if proc.returncode == 2:
        raise HTTPException(422, '자료 본문은 60,000자까지 사용할 수 있습니다.')
    if proc.returncode == 3:
        raise HTTPException(422, '문서 이미지는 서로 다른 48개, 추출 크기 합계 20 MiB까지 사용할 수 있습니다. 문서를 나누어 주세요.')
    if proc.returncode:
        raise HTTPException(422, '첨부 자료를 읽지 못했습니다. 파일 상태를 확인하거나 문서를 나누어 주세요.')
    material = json.loads(proc.stdout)
    if not material['text'] and not material['images']:
        raise HTTPException(422, '자료에서 본문을 읽을 수 없습니다. 텍스트가 있는 파일이나 작성 요청을 사용해 주세요.')
    return material
