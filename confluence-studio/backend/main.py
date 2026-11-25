import hashlib
import os
import re
import ssl
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import quote, urlencode, urlsplit

import httpx
import psycopg
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, Field, SecretStr


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


def decrypt_token(encrypted):
    try:
        return cipher().decrypt(bytes(encrypted)).decode("ascii")
    except InvalidToken:
        raise HTTPException(503, "저장된 토큰을 읽을 수 없습니다. 서비스 관리자에게 문의해 주세요.") from None


def confluence_get(token, path):
    base = os.environ["CONFLUENCE_BASE_URL"].rstrip("/")
    if urlsplit(base).scheme != "https":
        raise RuntimeError("Confluence requires an HTTPS endpoint")
    try:
        with httpx.Client(verify=ssl.create_default_context(), timeout=6, follow_redirects=False) as client:
            return client.get(base + path,
                                  headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
    except httpx.RequestError:
        raise HTTPException(503, "Confluence에 접속할 수 없습니다. 잠시 후 다시 확인해 주세요.") from None


def current_profile(token):
    response = confluence_get(token, "/rest/api/user/current")
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
    return JSONResponse({"detail": "입력값을 확인해 주세요."}, status_code=422)


@app.get("/api/health")
def health():
    with database() as db:
        db.execute("SELECT user_id FROM confluence_studio.connections LIMIT 0")
        db.execute("SELECT space_key FROM confluence_studio.registered_spaces LIMIT 0")
    cipher()
    return {"ok": True}


def connected(row, db, user_id, key):
    spaces = db.execute("""SELECT space_key, name FROM confluence_studio.registered_spaces
            WHERE user_id=%s AND confluence_user_key=%s ORDER BY name,space_key""",
            (user_id, key)).fetchall()
    return {"state": "connected", "spaces": spaces, "display_name": row["display_name"],
            "connected_date": row["connected_date"], "last_verified_at": row["last_verified_at"]}


@app.get("/api/connection")
def connection(user_id: str = Depends(account)):
    with database() as db:
        row = db.execute("SELECT token FROM confluence_studio.connections WHERE user_id=%s",
                         (user_id,)).fetchone()
    if not row:
        return {"state": "missing"}
    token = decrypt_token(row["token"])
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
        return connected(latest, db, user_id, key)


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
        return connected(row, db, user_id, key)


class SpaceInput(BaseModel):
    space_key: str


@app.post("/api/spaces")
def register_space(body: SpaceInput, user_id: str = Depends(account)):
    key = body.space_key.strip()
    if not key or len(key) > 255 or not re.fullmatch(r"~?[\w.-]+", key) or key in {".", ".."}:
        raise HTTPException(422, "Confluence 스페이스 키를 입력해 주세요.")
    with database() as db:
        connection = db.execute("""SELECT token, confluence_user_key FROM confluence_studio.connections
                WHERE user_id=%s""", (user_id,)).fetchone()
    if not connection:
        raise HTTPException(409, "Confluence 계정을 먼저 연결해 주세요.")
    response = confluence_get(decrypt_token(connection["token"]), "/rest/api/space/" + key)
    if response.status_code == 401:
        raise HTTPException(409, "Confluence 토큰을 다시 확인해 주세요.")
    if response.status_code in (403, 404):
        raise HTTPException(422, "스페이스를 찾을 수 없거나 조회 권한이 없습니다.")
    if response.status_code != 200:
        raise HTTPException(503, "Confluence에서 스페이스를 확인하지 못했습니다.")
    try:
        space = response.json()
    except ValueError:
        space = None
    if (not isinstance(space, dict) or not isinstance(space.get("key"), str)
            or space["key"].casefold() != key.casefold() or not isinstance(space.get("name"), str)
            or not space["name"]):
        raise HTTPException(503, "Confluence 스페이스 정보를 확인하지 못했습니다.")
    with database() as db:
        current = db.execute("""SELECT user_id FROM confluence_studio.connections
                WHERE user_id=%s AND token=%s AND confluence_user_key=%s FOR UPDATE""",
                (user_id, connection["token"], connection["confluence_user_key"])).fetchone()
        if not current:
            raise HTTPException(409, "연결 정보가 변경되었습니다. 다시 확인해 주세요.")
        return db.execute("""INSERT INTO confluence_studio.registered_spaces
                (user_id,confluence_user_key,space_key,name) VALUES (%s,%s,%s,%s)
                ON CONFLICT (user_id,confluence_user_key,space_key) DO UPDATE SET name=excluded.name
                RETURNING space_key,name""", (user_id, connection["confluence_user_key"],
                                              space["key"], space["name"])).fetchone()


class PageBranch(BaseModel):
    space_key: str = Field(min_length=1, max_length=255)
    parent_id: str | None = Field(default=None, pattern=r"^[0-9]{1,20}$")
    start: int = Field(default=0, ge=0, le=2147483647)


@app.post("/api/pages")
def page_branch(body: PageBranch, user_id: str = Depends(account)):
    with database() as db:
        row = db.execute("""SELECT c.token FROM confluence_studio.connections c
            JOIN confluence_studio.registered_spaces s USING (user_id, confluence_user_key)
            WHERE c.user_id=%s AND s.space_key=%s""", (user_id, body.space_key)).fetchone()
    if not row:
        raise HTTPException(404, "등록한 스페이스를 확인해 주세요.")
    params = {"limit": 50, "start": body.start, "expand": "space"}
    if body.parent_id:
        path = f"/rest/api/content/{body.parent_id}/child/page"
    else:
        path = "/rest/api/space/" + quote(body.space_key, safe="") + "/content/page"
        params["depth"] = "root"
    response = confluence_get(decrypt_token(row["token"]), path + "?" + urlencode(params))
    if response.status_code == 401:
        raise HTTPException(409, "Confluence 토큰을 다시 확인해 주세요.")
    if response.status_code in (403, 404):
        raise HTTPException(404, "페이지를 조회할 수 없습니다. 스페이스와 권한을 확인해 주세요.")
    if response.status_code != 200:
        raise HTTPException(503, "Confluence에서 페이지를 불러오지 못했습니다.")
    try:
        data = response.json()
        results = data["results"]
        if not isinstance(results, list):
            raise ValueError
        pages = []
        for item in results:
            if item["space"]["key"] != body.space_key:
                raise HTTPException(404, "선택한 스페이스의 페이지가 아닙니다.")
            pages.append({"id": str(item["id"]), "title": item["title"]})
        more = data.get("_links", {}).get("next") and results
    except (ValueError, KeyError, TypeError, AttributeError):
        raise HTTPException(502, "Confluence 페이지 목록을 읽을 수 없습니다.") from None
    return {"pages": pages, "next_start": body.start + len(results) if more else None}
