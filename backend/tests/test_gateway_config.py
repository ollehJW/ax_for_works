from http.cookiejar import CookieJar
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
import yaml

from backend.gateway import NoCookies
from backend.gateway_config import load_gateway_config
from backend.main import create_app
from fastapi.testclient import TestClient


class GatewayConfigTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.path = Path(directory) / 'config.yaml'
        self.route = {'prefix': '/news', 'upstream': 'https://news.example:9802', 'read_timeout_seconds': 90}
        self.save([self.route])

    def save(self, routes):
        # Editors often replace the file rather than writing the original inode.
        replacement = self.path.with_suffix('.tmp')
        replacement.write_text(yaml.safe_dump({'version': 1, 'gateways': routes}))
        replacement.replace(self.path)

    def client(self, handler=None):
        self.requests = []
        def default_handler(request):
            self.requests.append(request)
            return httpx.Response(200, stream=httpx.ByteStream(str(request.url).encode()))
        upstream = httpx.AsyncClient(transport=httpx.MockTransport(handler or default_handler), cookies=CookieJar(policy=NoCookies()))
        self.enterContext(patch('backend.gateway.httpx.AsyncClient', return_value=upstream))
        return self.enterContext(TestClient(create_app(gateway_config_path=self.path), base_url='https://portal.test'))

    def test_route_add_change_disable_and_remove_without_restart(self):
        client = self.client()
        self.assertEqual(client.get('/news/api/health').text, 'https://news.example:9802/api/health')
        self.assertEqual(self.requests[-1].extensions['timeout']['read'], 90)
        self.assertEqual(client.get('/new-agent/api/health').status_code, 404)
        new_route = {'prefix': '/new-agent', 'upstream': 'http://another.example:8080'}
        self.save([self.route, new_route])
        self.assertEqual(client.get('/new-agent/api/health').text, 'http://another.example:8080/api/health')
        self.save([{**new_route, 'upstream': 'https://changed.example'}])
        self.assertEqual(client.get('/new-agent/api/health').text, 'https://changed.example/api/health')
        self.assertEqual(client.get('/news/api/health').status_code, 404)
        self.save([{**new_route, 'enabled': False}])
        self.assertEqual(client.get('/new-agent/api/health').status_code, 404)
        self.save([])
        self.assertEqual(client.get('/api/health').json()['gateway_config'], {'status': 'ok', 'active_routes': 0})

    def test_invalid_yaml_keeps_last_valid_routes_then_recovers(self):
        client = self.client()
        self.path.write_text('gateways: [broken yaml')
        self.assertEqual(client.get('/news/api/health').status_code, 200)
        self.assertEqual(client.get('/api/health').json()['gateway_config']['status'], 'last_known_good')
        self.path.unlink()
        self.assertEqual(client.get('/news/api/health').status_code, 200)
        self.save([{'prefix': '/recovered', 'upstream': 'https://recovered.example'}])
        self.assertEqual(client.get('/recovered/api/health').status_code, 200)
        self.assertEqual(client.get('/news/api/health').status_code, 404)
        self.assertEqual(client.get('/api/health').json()['gateway_config']['status'], 'ok')

    def test_partial_invalid_config_does_not_apply_any_changes(self):
        client = self.client()
        self.save([{'prefix': '/other', 'upstream': 'https://other.example'}, {**self.route, 'unknown_option': True}])
        self.assertEqual(client.get('/news/api/health').status_code, 200)
        self.assertEqual(client.get('/other/api/health').status_code, 404)

    def test_redirect_hosts_and_cookie_scope_follow_new_configuration(self):
        def handler(request):
            return httpx.Response(307, stream=httpx.ByteStream(b''), headers=[
                ('location', 'https://internal.example:9001/api/login'),
                ('set-cookie', 'session=value; Path=/api; HttpOnly; Secure'),
            ])
        self.save([{**self.route, 'redirect_hosts': ['internal.example:9001']}])
        response = self.client(handler).get('/news/api/test', follow_redirects=False)
        self.assertEqual(response.headers['location'], '/news/api/login')
        self.assertIn('Path=/news/api', response.headers['set-cookie'])

    def test_invalid_settings_are_rejected(self):
        for change in [
            {'prefix': '/api'}, {'prefix': '/assets'}, {'prefix': '/'}, {'prefix': '/news/'},
            {'prefix': '/nested/news'}, {'upstream': 'file:///tmp/a'}, {'upstream': 'https://host/path'},
            {'upstream': 'https://name:password@host'}, {'upstream': 'https://host?query=1'},
            {'redirect_hosts': ['https://host']}, {'redirect_hosts': ['host:not-a-port']},
            {'read_timeout_seconds': 0}, {'enabled': 'false'}, {'read_timout_seconds': 30},
        ]:
            with self.subTest(change=change):
                self.save([{**self.route, **change}])
                with self.assertRaises(ValueError):
                    load_gateway_config(self.path)
        self.save([self.route, self.route])
        with self.assertRaises(ValueError):
            load_gateway_config(self.path)

    def test_duplicate_yaml_keys_and_invalid_initial_config_fail(self):
        self.path.write_text('version: 1\ngateways: []\ngateways: []\n')
        with self.assertRaisesRegex(ValueError, 'Duplicate YAML key'):
            create_app(gateway_config_path=self.path)
        self.path.unlink()
        with self.assertRaises(FileNotFoundError):
            create_app(gateway_config_path=self.path)

    def test_config_is_not_public_and_prefix_matches_whole_segments(self):
        client = self.client()
        self.assertEqual(client.get('/config/config.yaml').status_code, 404)
        self.assertEqual(client.get('/news-other/api/health').status_code, 404)
        self.assertEqual(client.get('/news/api/health').status_code, 200)
        self.assertEqual(client.get('/%6eews/api/health').status_code, 400)
