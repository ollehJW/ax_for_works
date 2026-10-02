import json
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.main import ROOT, create_app
from backend.auth import ready_user


class PortalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.config = Path(self.temp.name) / 'agents.json'
        self.data = json.loads((ROOT / 'config/agents.json').read_text())

    def client(self):
        self.config.write_text(json.dumps(self.data))
        app = create_app(self.config)
        app.dependency_overrides[ready_user] = lambda: {'user_id': 'test-user'}
        return TestClient(app)

    def test_catalog_and_configured_destinations(self):
        client = self.client()
        catalog = client.get('/api/agents').json()['agents']
        self.assertEqual(len(catalog), 4)
        for actual, configured in zip(catalog, self.data):
            self.assertNotIn('url', actual)
            response = client.get(actual['launch_url'], follow_redirects=False)
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response.headers['location'], configured['url'])
            self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_disabled_and_unknown_agents_cannot_launch(self):
        self.data[0]['enabled'] = False
        client = self.client()
        self.assertEqual(client.get('/api/health').json()['agent_count'], 3)
        self.assertEqual(client.get('/api/agents/wiameet/launch').status_code, 404)
        self.assertEqual(client.get('/api/agents/unknown/launch').status_code, 404)

    def test_query_cannot_override_destination(self):
        response = self.client().get('/api/agents/wiameet/launch?url=https://example.org', follow_redirects=False)
        self.assertEqual(response.headers['location'], self.data[0]['url'])

    def test_additional_agent_needs_only_configuration(self):
        self.data.append({**self.data[0], 'id': 'new-agent', 'name': 'New Agent', 'url': 'https://example.org/'})
        client = self.client()
        self.assertEqual(len(client.get('/api/agents').json()['agents']), 5)
        self.assertEqual(client.get('/api/agents/new-agent/launch', follow_redirects=False).headers['location'], 'https://example.org/')

    def test_empty_catalog(self):
        self.data = []
        self.assertEqual(self.client().get('/api/agents').json(), {'agents': []})

    def test_invalid_config_rejected_before_serving(self):
        for url in ['javascript:alert(1)', 'http://example.org/', 'https://user:password@example.org/']:
            with self.subTest(url=url):
                self.data[0]['url'] = url
                with self.assertRaises(ValidationError):
                    self.client()
        self.data[0]['url'] = 'https://example.org/'
        self.data.append(self.data[0])
        with self.assertRaisesRegex(ValueError, 'unique'):
            self.client()

    def test_only_built_assets_are_exposed(self):
        client = self.client()
        response = client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('AX for Works', response.text)
        self.assertEqual(response.headers['x-content-type-options'], 'nosniff')
        for path in ['/config/agents.json', '/backend/main.py', '/.env', '/api/nonexistent', '/missing.js']:
            self.assertEqual(client.get(path).status_code, 404, path)


if __name__ == '__main__':
    unittest.main()
