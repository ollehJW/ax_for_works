import hashlib
import os
import ssl
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import psycopg
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, SecretStr


app = FastAPI(title="Confluence Studio", docs_url=None, redoc_url=None, openapi_url=None)


@contextmanager
def database():
    with psycopg.connect(host=os.environ["AX_DB_HOST"], port=os.getenv("AX_DB_PORT", "5432"),
                         dbname=os.environ["AX_DB_NAME"], user=os.environ["AX_DB_USER"],
                         password=os.environ["AX_DB_PASSWORD"], connect_timeout=5,
                         options="-c timezone=UTC -c statement_timeout=10000",
                         application_name="confluence_studio", row_factory=dict_row) as db:
        yield db


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


def current_profile(token):
    base = os.environ["CONFLUENCE_BASE_URL"].rstrip("/")
    if urlsplit(base).scheme != "https":
        raise RuntimeError("Confluence requires an HTTPS endpoint")
    try:
        with httpx.Client(verify=ssl.create_default_context(), timeout=6, follow_redirects=False) as client:
            response = client.get(base + "/rest/api/user/current",
                                  headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
    except httpx.RequestError:
        raise HTTPException(503, "Confluence에 접속할 수 없습니다. 잠시 후 다시 확인해 주세요.") from None
    if response.status_code in (401, 403):
        return None
    if response.status_code != 200:
        raise HTTPException(503, "Confluence가 현재 사용자 확인 요청을 처리하지 못했습니다.")
    try:
        person = response.json()
    except ValueError:
        person = None
    if isinstance(person, dict) and person.get("type") == "anonymous":
        return None
    if not isinstance(person, dict) or person.get("type") != "known" or not person.get("userKey"):
        raise HTTPException(503, "Confluence의 사용자 정보를 확인할 수 없습니다.")
    return person["userKey"], person.get("displayName") or person.get("username") or person["userKey"]


@app.middleware("http")
async def request_checks(request, call_next):
    if request.method == "POST" and (request.headers.get("x-studio-request") != "1"
                                     or request.headers.get("sec-fetch-site") == "cross-site"):
        return JSONResponse({"detail": "허용되지 않은 요청입니다."}, status_code=403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def invalid_body(request, exc):
    return JSONResponse({"detail": "토큰 입력값을 확인해 주세요."}, status_code=422)


@app.get("/api/health")
def health():
    with database() as db:
        db.execute("SELECT user_id FROM confluence_studio.connections LIMIT 0")
    cipher()
    return {"ok": True}


def connected(row):
    return {"state": "connected", "display_name": row["display_name"],
            "connected_date": row["connected_date"], "last_verified_at": row["last_verified_at"]}


@app.get("/api/connection")
def connection(user_id: str = Depends(account)):
    with database() as db:
        row = db.execute("SELECT token FROM confluence_studio.connections WHERE user_id=%s",
                         (user_id,)).fetchone()
    if not row:
        return {"state": "missing"}
    try:
        token = cipher().decrypt(bytes(row["token"])).decode("ascii")
    except InvalidToken:
        raise HTTPException(503, "저장된 토큰을 읽을 수 없습니다. 서비스 관리자에게 문의해 주세요.") from None
    profile = current_profile(token)
    if profile is None:
        return {"state": "invalid"}
    key, name = profile
    with database() as db:
        latest = db.execute("""UPDATE confluence_studio.connections SET last_verified_at=now(),
                confluence_user_key=%s,display_name=%s WHERE user_id=%s AND token=%s
                RETURNING display_name,connected_date,last_verified_at""",
                (key,name,user_id,row["token"])).fetchone()
    if not latest:
        raise HTTPException(409, "연결 정보가 변경되었습니다. 다시 확인해 주세요.")
    return connected(latest)


class TokenInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: SecretStr


@app.post("/api/connection")
def connect(body: TokenInput, user_id: str = Depends(account)):
    token = body.token.get_secret_value().strip()
    if not 1 <= len(token) <= 8192 or not all(33 <= ord(c) <= 126 for c in token):
        raise HTTPException(422, "Access Token 값을 확인해 주세요.")
    profile = current_profile(token)
    if profile is None:
        raise HTTPException(422, "토큰이 만료되었거나 유효하지 않습니다. 새 토큰을 입력해 주세요.")
    key, name = profile
    with database() as db:
        row = db.execute("""INSERT INTO confluence_studio.connections
                (user_id, token, confluence_user_key, display_name) VALUES (%s,%s,%s,%s)
                ON CONFLICT (user_id) DO UPDATE SET token=excluded.token,
                confluence_user_key=excluded.confluence_user_key,display_name=excluded.display_name,
                connected_date=excluded.connected_date,last_verified_at=excluded.last_verified_at
                RETURNING display_name,connected_date,last_verified_at""",
                (user_id,cipher().encrypt(token.encode("ascii")),key,name)).fetchone()
    return connected(row)
