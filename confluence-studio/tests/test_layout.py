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
        self.assertEqual(prepared.count('<p><br/></p>'), 1)
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
        self.assertEqual(prepare_layout(storage, set()), (storage, []))
        validate_storage(storage)
