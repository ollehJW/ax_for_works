from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, SecretStr

from ..core.confluence import current_profile
from ..core.db import database
from ..core.security import account, cipher, decrypt_token

router = APIRouter()


def connected(row, db, user_id, key):
    spaces = db.execute("""SELECT space_key, name FROM confluence_studio.registered_spaces
            WHERE user_id=%s AND confluence_user_key=%s ORDER BY name,space_key""",
            (user_id, key)).fetchall()
    templates = db.execute("""SELECT page_id, blueprint FROM confluence_studio.templates
            WHERE user_id=%s AND confluence_user_key=%s ORDER BY blueprint->>'name',page_id""", (user_id,key)).fetchall()
    return {"state": "connected", "spaces": spaces, "templates": templates, "display_name": row["display_name"],
            "connected_date": row["connected_date"], "last_verified_at": row["last_verified_at"]}


@router.get("/api/connection")
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


@router.post("/api/connection")
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
