import io
import posixpath
from zipfile import ZipFile

from lxml import etree
from PIL import UnidentifiedImageError

REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def xml(data):
    return etree.fromstring(data, etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False))


def tag(node):
    return etree.QName(node).localname if isinstance(node.tag, str) else ''


def math_source(node):
    if not len(node):
        return node.text or ''
    children = ' '.join(filter(None, (math_source(child) for child in node)))
    return f'{tag(node)}({children})' if children else ''


class Office:
    def __init__(self, archive, images):
        self.archive = archive
        self.images = images
        self.names = set(archive.namelist())
        self.relationships = {}

    def related(self, part):
        if part not in self.relationships:
            folder, filename = posixpath.split(part)
            name = posixpath.join(folder, '_rels', filename + '.rels')
            rows = xml(self.archive.read(name)) if name in self.names else []
            self.relationships[part] = {
                row.get('Id'): posixpath.normpath(posixpath.join(folder, row.get('Target', ''))).lstrip('/')
                for row in rows if row.get('TargetMode') != 'External'}
        return self.relationships[part]

    def content(self, node, part, location):
        kind = tag(node)
        if kind in ('oMath', 'oMathPara'):
            return math_source(node)
        if kind == 't':
            return node.text or ''
        if kind == 'tab':
            return '\t'
        if kind in ('blip', 'chart', 'drawing'):
            ref = node.get(REL+'embed') or node.get(REL+'id')
            target = self.related(part).get(ref)
            if target in self.names and kind == 'blip':
                try:
                    name = self.images.add(self.archive.read(target), location)
                    return f' [[image:{name}]] '
                except UnidentifiedImageError:
                    return ' [이미지: ' + posixpath.basename(target) + '] '
            if target in self.names and kind in ('drawing', 'chart'):
                root = xml(self.archive.read(target))
                if kind == 'chart':
                    lines = []
                    for series in root.xpath('//*[local-name()="ser"]'):
                        for field in series:
                            values = field.xpath('.//*[local-name()="v"]/text()')
                            if values:
                                lines.append(tag(field) + ': ' + ' | '.join(values))
                    return '\n[차트 데이터]\n' + '\n'.join(lines) + '\n'
                return self.content(root, target, location)
        if kind == 'tbl':
            rows = []
            for row in node:
                if tag(row) == 'tr':
                    rows.append(' | '.join(self.content(cell, part, location).strip()
                                           for cell in row if tag(cell) == 'tc'))
            return '\n[표]\n' + '\n'.join(rows) + '\n'
        text = ''.join(self.content(c, part, location) for c in node)
        return text + '\n' if kind in ('p', 'sp', 'br') else text

    def sheets(self):
        strings = []
        if 'xl/sharedStrings.xml' in self.names:
            strings = [''.join(si.itertext()) for si in xml(self.archive.read('xl/sharedStrings.xml'))]
        book = 'xl/workbook.xml'
        for sheet in xml(self.archive.read(book)).xpath('//*[local-name()="sheet"]'):
            location = sheet.get('name', '')
            part = self.related(book)[sheet.get(REL+'id')]
            root = xml(self.archive.read(part))
            yield '[시트] ' + location
            for row in root.xpath('//*[local-name()="row"]'):
                cells = []
                for cell in row:
                    value = ''.join(cell.xpath('./*[local-name()="v"]/text() | .//*[local-name()="t"]/text()'))
                    if cell.get('t') == 's' and value:
                        value = strings[int(value)]
                    formula = cell.xpath('./*[local-name()="f"]/text()')
                    if formula:
                        value = '=' + formula[0] + (f' [저장된 값: {value}]' if value else '')
                    cells.append(cell.get('r', '') + ': ' + value)
                yield ' | '.join(cells)
            for drawing in root.xpath('//*[local-name()="drawing"]'):
                yield self.content(drawing, part, location)


def office_parts(raw, kind, images):
    with ZipFile(io.BytesIO(raw)) as archive:
        if sum(f.file_size for f in archive.infolist()) > 64 * 1024**2 or len(archive.infolist()) > 5000:
            raise ValueError
        doc = Office(archive, images)
        if kind == 'xlsx':
            yield from doc.sheets()
        elif kind == 'docx':
            part = 'word/document.xml'
            yield doc.content(xml(archive.read(part)), part, 'Word 본문')
        else:
            book = 'ppt/presentation.xml'
            for index, slide in enumerate(xml(archive.read(book)).xpath('//*[local-name()="sldIdLst"]/*'), 1):
                part = doc.related(book)[slide.get(REL+'id')]
                location = f'슬라이드 {index}'
                yield '[' + location + ']'
                yield doc.content(xml(archive.read(part)), part, location)
