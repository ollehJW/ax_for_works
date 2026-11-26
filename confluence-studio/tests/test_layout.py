import base64
import io
import unittest

from PIL import Image

from backend.authoring.layout import prepare_layout
from backend.authoring.storage import preview_storage, validate_storage


class DraftLayoutTests(unittest.TestCase):
    def test_math_chapters_and_edit(self):
        storage = (r'<h2>A</h2><p><code>latex: \frac{a}{b}</code></p><h3>A1</h3>'
                   r'<h2>B</h2><p><code>latex: \begin{bmatrix}a &amp; b \\ c &amp; d\end{bmatrix}</code></p>')
        prepared, assets = prepare_layout(storage, set())
        names = {image['name'] for image in assets}
        self.assertEqual(len(names), 2)
        self.assertEqual(prepared.count('<p><br/></p>'), 2)
        self.assertIn('<p><br/></p><h2>B', prepared)
        self.assertEqual(prepare_layout(prepared, names), (prepared, []))
        for asset in assets:
            picture = Image.open(io.BytesIO(base64.b64decode(asset['data'])))
            self.assertEqual(picture.format, 'PNG')
            self.assertIsNotNone(picture.getbbox())
            self.assertIn('latex', asset)
        updated, new = prepare_layout(prepared.replace(r'\frac{a}{b}', r'\frac{c}{d}'), names)
        self.assertEqual(len(new), 1)
        self.assertNotIn(new[0]['name'], names)
        self.assertEqual(len(preview_storage(updated, names | {new[0]['name']})[1]), 2)

    def test_native_boxes_and_literal_excel_formula(self):
        macros = ''.join(f'<ac:structured-macro ac:name="{kind}"><ac:parameter ac:name="title">{title}</ac:parameter>'
                         '<ac:rich-text-body><p>문서 안내</p></ac:rich-text-body></ac:structured-macro>'
                         for kind, title in [('panel','결정'),('info','참고'),('tip','가이드'),('warning','주의')])
        storage = macros + '<p><code>=SUM(A1:A5)</code></p>'
        formatted, assets = prepare_layout(storage, set())
        self.assertEqual(assets, [])
        self.assertEqual(formatted.replace('<p><br/></p>', ''), storage)
        self.assertEqual(formatted.count('<p><br/></p>'), 4)
        validate_storage(storage)

    def test_block_spacing_is_stable_and_preserves_nested_content(self):
        table = '<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>'
        items = '<ul><li>첫째</li><li>둘째</li></ul>'
        blocks = ['<p>소개</p>', table, items, '<blockquote>인용</blockquote>', '<h2>2. 결론</h2>']
        gap = '<p><br/></p>'
        storage = '<h2>1. 개요</h2>' + ''.join(blocks) + '<p>결론 본문</p>'
        expected = '<h2>1. 개요</h2>' + gap.join(blocks) + '<p>결론 본문</p>'
        self.assertEqual(prepare_layout(storage, set()), (expected, []))
        self.assertEqual(prepare_layout(expected.replace(gap, gap * 2), set()), (expected, []))
