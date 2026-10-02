import unittest
from unittest.mock import patch
from http.cookiejar import CookieJar

import httpx
from fastapi.testclient import TestClient

from backend.main import create_app
from backend.gateway import NoCookies, without_hop, response_headers


class ChunkStream(httpx.AsyncByteStream):
    async def __aiter__(self):
        yield b'event: progress\ndata: {"done":false}\n\n'
        yield b'event: done\ndata: {"done":true}\n\n'


class GatewayTests(unittest.TestCase):
    def client(self, handler):
        self.enterContext(patch('backend.gateway.current_user', return_value={'must_change_password': False}))
        upstream = httpx.AsyncClient(transport=httpx.MockTransport(handler), cookies=CookieJar(policy=NoCookies()))
        self.enterContext(patch('backend.gateway.httpx.AsyncClient', return_value=upstream))
        return self.enterContext(TestClient(create_app(), base_url='https://portal.test'))

    def test_mount_redirect_preserves_query_and_only_two_services_are_mounted(self):
        def unreachable(request):
            self.fail('Redirect should not request upstream')
        client = self.client(unreachable)
        response = client.get('/wianews?source=portal', follow_redirects=False)
        self.assertEqual(response.status_code, 308)
        self.assertEqual(response.headers['location'], '/wianews/?source=portal')
        self.assertEqual(client.get('/wianews-other').status_code, 404)
        self.assertEqual(client.get('/wiameet/api/health').status_code, 404)

    def test_proxy_preserves_body_query_origin_and_host(self):
        async def handler(request):
            self.assertEqual(str(request.url), 'https://dev-axforwork.wia.co.kr:9902/api/prompts?filter=a%2Fb')
            self.assertEqual(await request.aread(), b'{"title":"draft"}')
            self.assertEqual(request.headers['host'], 'portal.test')
            self.assertEqual(request.headers['origin'], 'https://portal.test')
            self.assertEqual(request.headers['x-forwarded-prefix'], '/wiacoding')
            self.assertNotIn('forwarded', request.headers)
            return httpx.Response(201, stream=httpx.ByteStream(b'{"ok":true}'), headers={'Content-Type': 'application/json'})
        response = self.client(handler).post('/wiacoding/api/prompts?filter=a%2Fb', content=b'{"title":"draft"}', headers={'origin': 'https://portal.test', 'content-type': 'application/json', 'forwarded': 'host=evil'})
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()['ok'])
        self.assertNotIn('content-security-policy', response.headers)

    def test_login_cookie_is_scoped_and_does_not_leak_between_users(self):
        calls = []
        def handler(request):
            calls.append(request.headers.get('cookie', ''))
            return httpx.Response(200, stream=httpx.ByteStream(b'{}'), headers=[
                ('set-cookie', 'wiacoding_auth=secret; HttpOnly; Path=/api; SameSite=strict; Secure'),
                ('set-cookie', 'other=; Max-Age=0; Path=/api; Secure'),
            ])
        client = self.client(handler)
        response = client.post('/wiacoding/api/auth/login', json={})
        cookies = response.headers.get_list('set-cookie')
        self.assertEqual(len(cookies), 2)
        self.assertIn('Path=/wiacoding/api', cookies[0])
        self.assertIn('HttpOnly', cookies[0])
        self.assertIn('Max-Age=0', cookies[1])
        client.get('/wiacoding/api/auth/me')
        self.assertIn('wiacoding_auth=secret', calls[-1])
        client.cookies.clear()
        client.get('/wiacoding/api/auth/me')
        self.assertEqual(calls[-1], '')
        self.assertEqual(len(client.app.state.gateway_client.cookies), 0)

    def test_streams_events_and_preserves_content_headers(self):
        def handler(request):
            return httpx.Response(200, stream=ChunkStream(), headers={'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache'})
        response = self.client(handler).post('/wianews/api/samples/test/collect')
        self.assertEqual(response.headers['content-type'], 'text/event-stream')
        self.assertIn('event: progress', response.text)
        self.assertIn('event: done', response.text)

    def test_range_requests_and_partial_response_are_preserved(self):
        def handler(request):
            self.assertEqual(request.headers['range'], 'bytes=0-3')
            return httpx.Response(206, stream=httpx.ByteStream(b'test'), headers={'content-range': 'bytes 0-3/100', 'content-length': '4', 'content-type': 'video/mp4'})
        response = self.client(handler).get('/wianews/media/intro.mp4', headers={'range': 'bytes=0-3'})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, b'test')
        self.assertEqual(response.headers['content-range'], 'bytes 0-3/100')

    def test_redirects_stay_inside_mount(self):
        def handler(request):
            return httpx.Response(307, headers={'location': 'https://dev-axforwork.wia.co.kr:9802/api/login?next=x#app'}, stream=httpx.ByteStream(b''))
        response = self.client(handler).get('/wianews/api/redirect', follow_redirects=False)
        self.assertEqual(response.headers['location'], '/wianews/api/login?next=x#app')

    def test_unavailable_service_returns_502(self):
        def handler(request):
            raise httpx.ConnectError('connection unavailable', request=request)
        self.assertEqual(self.client(handler).get('/wiacoding/api/health').status_code, 502)

    def test_timeout_returns_504(self):
        def handler(request):
            raise httpx.ReadTimeout('timeout', request=request)
        self.assertEqual(self.client(handler).get('/wianews/api/health').status_code, 504)

    def test_connection_specific_headers_are_removed(self):
        self.assertEqual(without_hop([(b'connection', b'custom, keep-alive'), (b'custom', b'private'), (b'content-type', b'text/plain')]), [(b'content-type', b'text/plain')])


class RedirectTests(unittest.TestCase):
    def test_upstream_and_public_absolute_redirects_keep_service_prefix(self):
        for destination in [
            'https://portal.test/api/auth/me',
            'https://127.0.0.1:9801/api/auth/me',
            '/api/auth/me',
            '/wianews/api/auth/me',
        ]:
            with self.subTest(destination=destination):
                headers = response_headers([(b'location', destination.encode())], '/wianews',
                                           'https://dev-axforwork.wia.co.kr:9802', 'portal.test', ['127.0.0.1:9801'])
                self.assertEqual(headers, [(b'location', b'/wianews/api/auth/me')])
        external = [(b'location', b'https://external.example/article')]
        self.assertEqual(response_headers(external, '/wianews', 'https://dev-axforwork.wia.co.kr:9802', 'portal.test'), external)
