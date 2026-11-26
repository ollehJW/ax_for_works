import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from backend.templates.layout import visual_layout
from backend.templates.routes import page_path, structure


class TemplateTests(unittest.TestCase):
    @patch.dict(os.environ, CONFLUENCE_BASE_URL='https://wiki.example/wiki')
    def test_page_links(self):
        for path in ['spaces/LAB/pages/98404/Test','pages/viewpage.action?pageId=98404','x/ZIAB']:
            self.assertTrue(page_path('https://wiki.example/wiki/'+path).startswith('/rest/api/content/98404?'))
        self.assertIn('spaceKey=LAB&title=Hello+World',page_path('https://wiki.example/wiki/display/LAB/Hello+World'))
        with self.assertRaises(HTTPException):
            page_path('https://external.example/wiki/pages/22')

    def test_structure_keeps_layout_only(self):
        shape = structure('<h2>개요</h2><p>Company confidential</p><ac:structured-macro ac:name="info">'
                          '<table><tr><th>담당자</th><td style="text-align:center">Alice</td></tr></table>'
                          '<ri:attachment ri:filename="private.png"/></ac:structured-macro>')
        for expected in ('개요','담당자','ac:name="info"','text-align:center','[내용]'):
            self.assertIn(expected,shape)
        for secret in ('Company confidential','Alice','private.png'):
            self.assertNotIn(secret,shape)

    def test_visual_layout_keeps_order_without_body_values(self):
        layout = visual_layout(structure('<h2>Private title</h2><ol><li>Private task</li></ol>'
            '<table><tr><th colspan="2">Private column</th></tr></table>'
            '<ac:structured-macro ac:name="info"><ac:rich-text-body><p>Secret</p></ac:rich-text-body></ac:structured-macro>'))
        self.assertEqual([block['type'] for block in layout], ['heading','ol','table','info'])
        self.assertEqual(layout[2]['children'][0]['children'][0]['colspan'], 2)
        self.assertEqual(layout[3]['children'], [{'type':'line'}])
        self.assertNotIn('Private', str(layout))
        self.assertNotIn('Secret', str(layout))
