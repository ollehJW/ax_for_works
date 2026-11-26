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
        self.assertEqual(layout[0]['label'], '(예: Private title)')
        self.assertNotIn('Private task', str(layout))
        self.assertNotIn('Private column', str(layout))
        self.assertNotIn('Secret', str(layout))

    def test_major_examples_and_three_representative_topics(self):
        from backend.templates.routes import Blueprint
        from backend.templates.sections import align_sections
        body = ''.join(f'<h3>실제 하위 제목 {i}</h3><ul><li>행</li></ul>' for i in range(8))
        rows = '<tr><td>값</td></tr>' * 7
        sample = structure(f'<h2>장비 <em>점검</em></h2>{body}<h2>진행 일정</h2><table>{rows}</table>')
        layout = visual_layout(sample)
        labels = [block['label'] for block in layout if block['type'] == 'heading']
        self.assertEqual(labels, ['(예: 장비 점검)', '세부 주제 1', '세부 주제 2', '세부 주제 3', '(예: 진행 일정)'])
        self.assertEqual(len(layout[-1]['children']), 3)
        self.assertNotIn('실제 하위', sample)
        model = Blueprint(name='점검', purpose='보고', styles=[], sections=[
            {'heading':'S2','instruction':'일정 표'}, {'heading':'S1','instruction':'점검 목록'}])
        align_sections(model, sample)
        self.assertEqual([s.heading for s in model.sections], [labels[0], labels[-1]])
        self.assertEqual(model.sections[0].instruction, '점검 목록')
