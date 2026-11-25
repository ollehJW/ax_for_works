"""Extract draft source text in a bounded, short-lived worker. No remote resources."""
import io
import json
import posixpath
import re
import resource
import sys
from pathlib import PurePosixPath
from zipfile import ZipFile

from lxml import etree, html
from pypdf import PdfReader

LIMIT = 60000


def xml(data):
    return etree.fromstring(data, etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False))


def office_text(raw, ext):
    with ZipFile(io.BytesIO(raw)) as archive:
        if sum(f.file_size for f in archive.infolist()) > 64 * 1024**2 or len(archive.infolist()) > 5000:
            raise ValueError
        names = archive.namelist()
        if ext == '.xlsx':
            strings = []
            if 'xl/sharedStrings.xml' in names:
                strings = [''.join(si.itertext()) for si in xml(archive.read('xl/sharedStrings.xml'))]
            book = xml(archive.read('xl/workbook.xml'))
            rels = {r.get('Id'): r.get('Target') for r in xml(archive.read('xl/_rels/workbook.xml.rels'))}
            for sheet in book.xpath('//*[local-name()="sheet"]'):
                rel = next(v for k, v in sheet.attrib.items() if k.endswith('}id'))
                target = rels[rel]
                path = posixpath.normpath(posixpath.join('xl', target)).lstrip('/')
                yield sheet.get('name', '')
                for row in xml(archive.read(path)).xpath('//*[local-name()="row"]'):
                    cells = []
                    for cell in row:
                        value = ''.join(cell.xpath('./*[local-name()="v"]/text() | .//*[local-name()="t"]/text()'))
                        if cell.get('t') == 's' and value:
                            value = strings[int(value)]
                        cells.append(cell.get('r', '') + ': ' + value)
                    yield ' | '.join(cells)
        else:
            parts = ['word/document.xml'] if ext == '.docx' else sorted(
                (n for n in names if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)),
                key=lambda n: int(re.search(r'\d+', n).group()))
            for name in parts:
                for paragraph in xml(archive.read(name)).xpath('//*[local-name()="p"]'):
                    yield ''.join(paragraph.xpath('.//*[local-name()="t"]/text()'))


def extract(raw, ext):
    if ext in ('.docx', '.pptx', '.xlsx'):
        parts = office_text(raw, ext)
    elif ext == '.pdf':
        reader = PdfReader(io.BytesIO(raw))
        parts = (page.extract_text() or '' for page in reader.pages)
    elif ext in ('.html', '.htm'):
        doc = html.fromstring(raw.decode('utf-8-sig'))
        for node in doc.xpath('//script|//style|//template|//noscript'):
            node.drop_tree()
        parts = doc.itertext()
    elif ext == '.md':
        parts = [raw.decode('utf-8-sig')]
    else:
        raise ValueError
    chunks, size = [], 0
    for part in parts:
        if part.strip():
            chunks.append(part.strip())
            size += len(chunks[-1]) + 1
            if size > LIMIT:
                raise OverflowError
    return '\n'.join(chunks)


if __name__ == '__main__':
    resource.setrlimit(resource.RLIMIT_AS, (600 * 1024**2,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (8, 9))
    try:
        print(json.dumps(extract(sys.stdin.buffer.read(), PurePosixPath(sys.argv[1]).suffix.lower())))
    except OverflowError:
        sys.exit(2)
    except Exception:
        sys.exit(1)
