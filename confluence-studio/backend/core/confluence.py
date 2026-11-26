import os
import ssl
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException


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
