from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .authoring.publish import router as publishing
from .authoring.routes import router as authoring
from .connections.routes import router as connections
from .spaces.routes import router as spaces
from .core.db import database
from .core.security import cipher


app = FastAPI(title="Confluence Studio", docs_url=None, redoc_url=None, openapi_url=None)


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


app.include_router(connections)
app.include_router(spaces)
app.include_router(authoring)
app.include_router(publishing)
