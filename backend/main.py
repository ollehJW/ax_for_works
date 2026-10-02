"""AX for Works: configurable Agent directory and production React hosting."""
import json
import os
import logging
from urllib.parse import urlsplit

import psycopg
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

from backend.gateway import lifespan, register_gateway
from backend.auth import router as auth_router, ready_user
from backend.database import database

ROOT = Path(__file__).resolve().parent.parent


class Agent(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str = Field(pattern=r"^[a-z][a-z0-9-]*$", max_length=64)
    name: str = Field(min_length=1)
    enabled: bool = True
    url: HttpUrl
    sub: str
    desc: str
    title: str
    detail: str
    tint: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    d: str
    preview: str
    meta: str
    tag: str
    row1: str
    text1: str
    row2: str
    text2: str
    note: str

    @field_validator("url")
    @classmethod
    def secure_destination(cls, value):
        if value.scheme != "https" or value.username or value.password:
            raise ValueError("Agent URL must use HTTPS without credentials")
        return value


def load_agents(path: Path) -> list[Agent]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("Agent configuration must be a list")
    agents = [Agent.model_validate(item) for item in raw]
    if len({a.id for a in agents}) != len(agents):
        raise ValueError("Agent IDs must be unique")
    return agents


def create_app(config_path: Path | None = None, dist_path: Path | None = None, gateway_config_path: Path | None = None):
    agents = load_agents(config_path or Path(os.getenv("AX_AGENTS_CONFIG", ROOT / "config/agents.json")))
    registry = {a.id: a for a in agents if a.enabled}
    app = FastAPI(lifespan=lifespan, title="AX for Works", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)

    app.include_router(auth_router)

    @app.exception_handler(psycopg.Error)
    async def database_error(request, exc):
        logging.getLogger('uvicorn.error').error('Platform database request failed: %s', type(exc).__name__)
        return JSONResponse({'detail': '계정 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'}, status_code=503)

    @app.middleware("http")
    async def headers(request, call_next):
        if request.url.path.startswith('/api/auth/') and request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
            origin = request.headers.get('origin')
            try:
                valid_origin = not origin or (urlsplit(origin).scheme in {'http', 'https'} and urlsplit(origin).netloc == request.headers.get('host'))
            except ValueError:
                valid_origin = False
            if request.headers.get('X-AX-Request') != '1' or not valid_origin:
                return JSONResponse({'detail': '허용되지 않은 요청입니다.'}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable" if request.url.path.startswith("/assets/") and response.status_code == 200 else "no-store"
        return response

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "service": "AX for Works", "agent_count": len(registry), "gateway_config": app.state.gateway_config.status()}

    @app.get('/api/ready')
    def readiness():
        with database() as db:
            db.execute('SELECT 1 FROM platform.users LIMIT 1')
        return {'status': 'ok', 'database': 'ok'}

    @app.get("/api/agents", dependencies=[Depends(ready_user)])
    def list_agents():
        return {"agents": [{**a.model_dump(mode="json", exclude={"url", "enabled"}), "launch_url": f"/api/agents/{a.id}/launch"} for a in registry.values()]}

    @app.get("/api/agents/{agent_id}/launch", dependencies=[Depends(ready_user)])
    def launch(agent_id: str):
        agent = registry.get(agent_id)
        if agent is None:
            raise HTTPException(status_code=404, detail="사용할 수 없는 Agent입니다.")
        return RedirectResponse(str(agent.url), status_code=302)

    register_gateway(app, gateway_config_path)

    # Mount only built frontend assets; never expose repository files or config.
    dist = dist_path or ROOT / "frontend/dist"
    if dist.is_dir():
        @app.get('/login', include_in_schema=False)
        def login_page():
            return FileResponse(dist / 'index.html')

        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app


app = create_app()
