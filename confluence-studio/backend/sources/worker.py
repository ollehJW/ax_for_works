"""Isolated, bounded attachment reader. Linked resources are never fetched."""
import io
import json
import resource
import sys
from pathlib import PurePosixPath

from lxml import html
from pypdf import PdfReader

from .images import ImageLimit, Images
from .office import math_source, office_parts


def pdf_parts(raw, images):
    for number, page in enumerate(PdfReader(io.BytesIO(raw)).pages, 1):
        location = f'PDF {number}쪽'
        text = page.extract_text(extraction_mode='layout') or page.extract_text() or ''
        if text.strip():
            yield '[' + location + ']\n' + text
        for asset in page.images:
            name = images.add(asset.data, location)
            yield f'[{location}] [[image:{name}]]'


def html_parts(raw):
    doc = html.fromstring(raw.decode('utf-8-sig'))
    for node in doc.xpath('//script|//style|//template|//noscript'):
        node.drop_tree()
    for node in doc.iter('img'):
        url = node.get('src', '')
        if url.startswith(('https://', 'http://')):
            node.tail = f" [이미지 참조: {node.get('alt', '')} {url}] " + (node.tail or '')
    for node in list(doc.iter('math')):
        formula = math_source(node)
        node.clear(keep_tail=True)
        node.tag = 'span'
        node.text = formula
    for cell in doc.xpath('//td|//th'):
        cell.tail = ' | ' + (cell.tail or '')
    for block in doc.xpath('//p|//tr|//h1|//h2|//h3|//div|//li|//br'):
        block.tail = '\n' + (block.tail or '')
    yield doc.text_content()


def material(raw, filename):
    kind = PurePosixPath(filename).suffix.lower().lstrip('.')
    images = Images(kind)
    if kind in ('docx', 'xlsx', 'pptx'):
        parts = office_parts(raw, kind, images)
    elif kind in ('html', 'htm'):
        parts = html_parts(raw)
    elif kind == 'md':
        parts = [raw.decode('utf-8-sig')]
    elif kind == 'pdf':
        parts = pdf_parts(raw, images)
    else:
        raise ValueError
    chunks, size = [], 0
    for part in parts:
        if part.strip():
            size += len(part.strip()) + 1
            if size > 60000:
                raise OverflowError
            chunks.append(part.strip())
    return {'text': '\n'.join(chunks), 'images': list(images.items.values())}


if __name__ == '__main__':
    resource.setrlimit(resource.RLIMIT_AS, (600 * 1024**2,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (16, 18))
    try:
        print(json.dumps(material(sys.stdin.buffer.read(), sys.argv[1])))
    except ImageLimit:
        sys.exit(3)
    except OverflowError:
        sys.exit(2)
    except Exception:
        sys.exit(1)
