import base64
import os
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException

from backend.authoring.publish import Publication, publish


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.name = 'pdf-' + 'a' * 24 + '.png'
        self.body = Publication(title=' 새 글 ', space_key='TEAM', parent_id='42',
                                storage=f'<p><ac:image><ri:attachment ri:filename="{self.name}"/></ac:image></p>',
                                images=[{'name': self.name, 'data': base64.b64encode(b'\x89PNG\r\n\x1a\n').decode()}])
        self.enterContext(patch.dict(os.environ, CONFLUENCE_BASE_URL='https://example.test'))
        self.enterContext(patch('backend.authoring.publish.database'))
        self.enterContext(patch('backend.authoring.publish.decrypt_token', return_value='test'))
        parent = self.enterContext(patch('backend.authoring.publish.confluence_get'))
        parent.return_value = httpx.Response(200, json={'space': {'key': 'TEAM'}})
        client = self.enterContext(patch('backend.authoring.publish.httpx.Client'))
        self.post = client.return_value.__enter__.return_value.post
        self.post.return_value.json.return_value = {'id': '73'}

    def test_page_and_attachment(self):
        result = publish(self.body, 'test')
        self.assertEqual(result, {'url': 'https://example.test/pages/viewpage.action?pageId=73'})
        create, upload = self.post.call_args_list
        self.assertEqual(create.kwargs['json']['ancestors'], [{'id': '42'}])
        self.assertEqual(create.kwargs['json']['title'], '새 글')
        self.assertEqual(create.kwargs['json']['body']['storage']['value'], self.body.storage)
        self.assertEqual(upload.kwargs['files'][0][1][0], self.name)

    def test_missing_asset_prevents_creation(self):
        self.body.images.clear()
        with self.assertRaises(HTTPException):
            publish(self.body, 'test')
        self.post.assert_not_called()

    def test_attachment_failure_returns_created_page(self):
        self.post.side_effect = [self.post.return_value, httpx.ReadTimeout('timeout')]
        result = publish(self.body, 'test')
        self.assertIn('warning', result)
        self.assertIn('pageId=73', result['url'])
