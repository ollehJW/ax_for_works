import re
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..core.confluence import confluence_get
from ..core.db import database
from ..core.security import account, decrypt_token

router = APIRouter()


class SpaceInput(BaseModel):
    space_key: str


@router.post("/api/spaces")
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


@router.post("/api/pages")
def page_branch(body: PageBranch, user_id: str = Depends(account)):
    with database() as db:
        row = db.execute("""SELECT c.token FROM confluence_studio.connections c
            JOIN confluence_studio.registered_spaces s USING (user_id, confluence_user_key)
            WHERE c.user_id=%s AND s.space_key=%s""", (user_id, body.space_key)).fetchone()
    if not row:
        raise HTTPException(404, "등록한 스페이스를 확인해 주세요.")
    params = {"limit": 50, "start": body.start, "expand": "space,children.page"}
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
            children = item.get("children", {}).get("page", {})
            preview = children.get("results")
            has_children = None
            if isinstance(preview, list):
                has_children = bool(preview or children.get("size") or children.get("_links", {}).get("next"))
            pages.append({"id": str(item["id"]), "title": item["title"], "has_children": has_children})
        more = data.get("_links", {}).get("next") and results
    except (ValueError, KeyError, TypeError, AttributeError):
        raise HTTPException(502, "Confluence 페이지 목록을 읽을 수 없습니다.") from None
    return {"pages": pages, "next_start": body.start + len(results) if more else None}
