import base64
import io
import unittest
from zipfile import ZipFile

from fastapi import HTTPException
from PIL import Image

from backend.authoring.prompts import system_prompt
from backend.authoring.storage import place_images, preview_storage, safe_view, validate_storage
from backend.sources.worker import material


def package(parts):
    buf = io.BytesIO()
    with ZipFile(buf, 'w') as archive:
        for name, value in parts.items():
            archive.writestr(name, value)
    return buf.getvalue()


def rels(target, key='r1'):
    return f'<Relationships><Relationship Id="{key}" Target="{target}"/></Relationships>'


REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'


class AuthoringTests(unittest.TestCase):
    def test_format_routing(self):
        names = ['a.DOCX', 'a.md', 'a.xlsx', 'a.html', 'a.pdf', 'a.pptx']
        self.assertEqual(len({system_prompt(n) for n in names + [None]}), 7)
        self.assertEqual(system_prompt('a.HTM'), system_prompt('a.html'))

    def test_office_source_evidence(self):
        buf = io.BytesIO()
        Image.new('RGB', (10, 12), 'blue').save(buf, format='PNG')
        picture = buf.getvalue()
        table = '<tbl><tr><tc><p><t>거리</t></p></tc><tc><p><t>30 m</t></p></tc></tr></tbl>'
        body = f'<root xmlns:r="{REL}">{table}<oMath><f><num><t>x</t></num><den><t>2</t></den></f></oMath><blip r:embed="r1"/></root>'
        docs = {
            'docx': {'word/document.xml':body, 'word/_rels/document.xml.rels':rels('media/figure.png'),
                     'word/media/figure.png':picture},
            'pptx': {'ppt/presentation.xml':f'<root xmlns:r="{REL}"><sldIdLst><sldId r:id="r1"/></sldIdLst></root>',
                     'ppt/_rels/presentation.xml.rels':rels('slides/slide3.xml'), 'ppt/slides/slide3.xml':body,
                     'ppt/slides/_rels/slide3.xml.rels':rels('../media/figure.png'),'ppt/media/figure.png':picture},
            'xlsx': {'xl/workbook.xml':f'<root xmlns:r="{REL}"><sheet name="비용" r:id="r1"/></root>',
                     'xl/_rels/workbook.xml.rels':rels('worksheets/sheet1.xml'),
                     'xl/worksheets/sheet1.xml':f'<root xmlns:r="{REL}"><row><c r="B3"><f>A1+A2</f><v>12</v></c></row><drawing r:id="r1"/></root>',
                     'xl/worksheets/_rels/sheet1.xml.rels':rels('../drawings/d.xml'),
                     'xl/drawings/d.xml':f'<root xmlns:r="{REL}"><blip r:embed="r1"/></root>',
                     'xl/drawings/_rels/d.xml.rels':rels('../media/figure.png'), 'xl/media/figure.png':picture}}
        for kind, parts in docs.items():
            with self.subTest(kind=kind):
                result = material(package(parts), 'a.' + kind)
                image, = result['images']
                self.assertEqual(base64.b64decode(image['data']), picture)
                if kind == 'xlsx':
                    self.assertIn('=A1+A2 [저장된 값: 12]', result['text'])
                else:
                    self.assertIn('거리 | 30 m', result['text'])
                    self.assertIn('f(num(x) den(2))', result['text'])

    def test_scanned_pdf_can_be_the_only_evidence(self):
        buf = io.BytesIO()
        Image.new('RGB', (40, 32), 'red').save(buf, format='PDF')
        source = material(buf.getvalue(), 'a.pdf')
        image, = source['images']
        self.assertEqual(image['locations'], ['PDF 1쪽'])
        storage = place_images('<p>그림 설명</p>', [image])
        converted, markers = preview_storage(storage, {image['name']})
        self.assertNotIn('ri:attachment', converted)
        self.assertIn('data-studio-image="' + image['name'] + '"', safe_view(converted, markers))
        with self.assertRaises(HTTPException):
            validate_storage(storage, set())

    def test_markup_tables_math_and_remote_references(self):
        md = '|x|y|\n|-|-|\n|1|2|\n$x^2$ ![도식](https://example.org/p.png)'
        self.assertEqual(material(md.encode(), 'test.md')['text'], md)
        sample = '<table><tr><td>x</td><td>y</td></tr></table><math><msup><mi>x</mi><mn>2</mn></msup></math><img alt="도식" src="https://example.org/p.png">'
        result = material(sample.encode(), 'test.htm')
        self.assertIn('x | y', result['text'])
        self.assertIn('msup(x 2)', result['text'])
        self.assertIn('도식 https://example.org/p.png', result['text'])
        self.assertEqual(result['images'], [])
        validate_storage('<p>x<sup>2</sup></p>')
