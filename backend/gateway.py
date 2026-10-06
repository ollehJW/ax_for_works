"""Streaming gateway for services registered in config/config.yaml."""
from contextlib import asynccontextmanager
from http.cookiejar import CookieJar, DefaultCookiePolicy
import os
import re
import ssl
from pathlib import Path
from urllib.parse import urlsplit, urlencode
from starlette.concurrency import run_in_threadpool
from fastapi import HTTPException
import psycopg
from backend.auth import current_user

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from starlette.background import BackgroundTask

from backend.gateway_config import GatewayConfig

HOP = {b'connection', b'keep-alive', b'proxy-authenticate', b'proxy-authorization',
       b'te', b'trailer', b'transfer-encoding', b'upgrade'}


class NoCookies(DefaultCookiePolicy):
    """A shared proxy connection pool must never retain a user's cookies."""
    def set_ok(self, cookie, request):
        return False


@asynccontextmanager
async def lifespan(app):
    context = ssl.create_default_context(cafile=os.getenv('AX_UPSTREAM_CA_BUNDLE'))
    async with httpx.AsyncClient(
        verify=context, trust_env=False, follow_redirects=False,
        cookies=CookieJar(policy=NoCookies()),
        timeout=httpx.Timeout(connect=10, read=660, write=120, pool=10),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    ) as client:
        app.state.gateway_client = client
        yield


def without_hop(headers):
    blocked = set(HOP)
    for key, value in headers:
        if key.lower() == b'connection':
            blocked.update(part.strip().lower() for part in value.split(b','))
    return [(key.lower(), value) for key, value in headers if key.lower() not in blocked]


def response_headers(headers, prefix, upstream, public_host, redirect_hosts=()):
    result = []
    for key, value in without_hop(headers):
        if key == b'set-cookie' and not value.startswith((b'ax_platform_session=', b'__Host-')):
            # Preserve every Set-Cookie header, including logout expiry and flags.
            value = re.sub(rb'(?i)(;\s*path=)(/[^;]*)', lambda m: m[1] + prefix.encode() + m[2], value)
        elif key == b'location':
            location = value.decode('latin-1')
            parts = urlsplit(location)
            local_hosts = {urlsplit(upstream).netloc, public_host} | set(redirect_hosts)
            if (parts.netloc and parts.netloc in local_hosts) or (location.startswith('/') and not location.startswith('//')):
                path = parts.path or '/'
                location = path if path == prefix or path.startswith(prefix + '/') else prefix + path
                if parts.query:
                    location += '?' + parts.query
                if parts.fragment:
                    location += '#' + parts.fragment
                value = location.encode('latin-1')
        result.append((key, value))
    return result


async def proxy(request: Request, route):
    prefix = route.prefix
    upstream = str(route.upstream)
    relative = request.url.path[len(prefix):]
    document = relative in {'', '/', '/agent', '/agent/'} or ('text/html' in request.headers.get('accept', '') and not relative.startswith(('/api/', '/assets/', '/media/')))
    if route.require_login and document:
        try:
            user = await run_in_threadpool(current_user, request)
            if user['must_change_password']:
                raise HTTPException(401)
        except HTTPException:
            destination = request.url.path
            if request.url.query:
                destination += '?' + request.url.query
            return RedirectResponse('/login?' + urlencode({'next': destination}), status_code=302, headers={'Cache-Control': 'no-store'})
        except psycopg.Error:
            return JSONResponse({'detail': '계정 서비스에 연결할 수 없습니다.'}, status_code=503)

    if request.url.path == prefix:
        query = request.scope.get('query_string', b'').decode('ascii')
        return RedirectResponse(prefix + '/' + ('?' + query if query else ''), status_code=308)
    if not request.scope['raw_path'].startswith(prefix.encode() + b'/'):
        return JSONResponse({'detail': '서비스 경로 형식이 올바르지 않습니다.'}, status_code=400)
    raw_path = request.scope['raw_path'][len(prefix):]
    query = request.scope.get('query_string', b'')
    target = httpx.URL(upstream).copy_with(raw_path=raw_path + (b'?' + query if query else b''))
    headers = [(key, value) for key, value in without_hop(request.headers.raw)
               if not key.startswith(b'x-forwarded-') and key not in {b'forwarded'}]
    headers.extend([(b'x-forwarded-proto', b'https'), (b'x-forwarded-prefix', prefix.encode())])
    if request.client:
        headers.append((b'x-forwarded-for', request.client.host.encode()))
    # Preserve public Host and Origin for the Agent's CSRF checks.
    # Construct Request directly: never merge shared client cookies or headers.
    body = request.stream() if 'content-length' in request.headers or 'transfer-encoding' in request.headers else None
    outgoing = httpx.Request(request.method, target, headers=headers, content=body,
                             extensions={'timeout': {'connect': 10, 'read': route.read_timeout_seconds, 'write': 120, 'pool': 10}})
    try:
        response = await request.app.state.gateway_client.send(outgoing, stream=True)
    except httpx.TimeoutException:
        return JSONResponse({'detail': '서비스 응답 시간이 초과되었습니다.'}, status_code=504)
    except httpx.RequestError:
        return JSONResponse({'detail': '서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'}, status_code=502)

    async def chunks():
        try:
            async for chunk in response.aiter_raw():
                yield chunk
        finally:
            await response.aclose()

    result = StreamingResponse(chunks(), status_code=response.status_code,
                               background=BackgroundTask(response.aclose))
    result.raw_headers = response_headers(response.headers.raw, prefix, upstream, request.headers.get('host', ''), route.redirect_hosts)
    return result


class GatewayMiddleware:
    """Match dynamic routes before the portal router, without rebuilding it."""
    def __init__(self, app, config):
        self.app = app
        self.config = config

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'http':
            route = self.config.match(scope['path'])
            if route is not None:
                response = await proxy(Request(scope, receive=receive), route)
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


def register_gateway(app, config_path=None):
    path = config_path or Path(os.getenv('AX_GATEWAY_CONFIG', Path(__file__).resolve().parent.parent / 'config/config.yaml'))
    config = GatewayConfig(Path(path))
    app.state.gateway_config = config
    app.add_middleware(GatewayMiddleware, config=config)
