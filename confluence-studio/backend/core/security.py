import hashlib
import os
import time
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Request

from .db import database


def cipher():
    return Fernet(Path(os.environ["STUDIO_KEY_FILE"]).read_bytes().strip())


def account(request: Request):
    cookie = request.cookies.get("ax_platform_session", "")
    if not cookie or len(cookie) > 256:
        raise HTTPException(401, "AX for Works에 로그인해 주세요.")
    with database() as db:
        row = db.execute("""SELECT a.user_id,a.must_change_password
            FROM platform.sessions s JOIN platform.accounts a USING(user_id)
            WHERE s.token_hash=%s AND s.expires_at>%s AND a.is_active""",
            (hashlib.sha256(cookie.encode()).hexdigest(), time.time())).fetchone()
    if not row:
        raise HTTPException(401, "AX for Works에 다시 로그인해 주세요.")
    if row["must_change_password"]:
        raise HTTPException(403, "AX for Works에서 비밀번호를 먼저 변경해 주세요.")
    return row["user_id"]


def decrypt_token(encrypted):
    try:
        return cipher().decrypt(bytes(encrypted)).decode("ascii")
    except InvalidToken:
        raise HTTPException(503, "저장된 토큰을 읽을 수 없습니다. 서비스 관리자에게 문의해 주세요.") from None
