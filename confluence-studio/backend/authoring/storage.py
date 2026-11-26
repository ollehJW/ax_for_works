import re
import secrets

from fastapi import HTTPException
from lxml import etree, html


AC = 'http://atlassian.com/content'
RI = 'http://atlassian.com/resource/identifier'
ASSET_NAME = re.compile(r'(?:pdf|docx|xlsx|pptx|math)-[a-f0-9]{24}\.(?:png|jpg)')
TAGS = set('p h1 h2 h3 h4 h5 h6 strong em b i sub sup ul ol li blockquote table tbody thead tr th td br hr pre code'.split())
MACROS = {'panel', 'info', 'note', 'warning', 'tip', 'expand', 'code', 'toc'}


def validate_storage(value, image_names=()):
    try:
        root = etree.fromstring((f'<root xmlns:ac="{AC}" xmlns:ri="{RI}">' + value + '</root>').encode(),
                                etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False))
        if not len(root) or len(value) > 100000 or (not ''.join(root.itertext()).strip() and not root.findall(f'.//{{{AC}}}image')):
            raise ValueError
        for node in root.iterdescendants():
            if not isinstance(node.tag, str):
                raise ValueError
            if node.tag == f'{{{AC}}}image' and len(node) == 1 and node[0].tag == f'{{{RI}}}attachment':
                if not node.attrib or (set(node.attrib) == {f'{{{AC}}}alt'} and
                        node[0].get(f'{{{RI}}}filename', '').startswith('math-')):
                    continue
            if (node.tag == f'{{{RI}}}attachment' and node.getparent().tag == f'{{{AC}}}image'
                    and set(node.attrib) == {f'{{{RI}}}filename'} and not len(node)
                    and node.get(f'{{{RI}}}filename') in image_names):
                continue
            if node.tag in TAGS and not node.attrib:
                continue
            name = node.get(f'{{{AC}}}name')
            if set(node.attrib) == {f'{{{AC}}}name'} and (
                node.tag == f'{{{AC}}}structured-macro' and name in MACROS or
                node.tag == f'{{{AC}}}parameter' and name in {'title', 'language'}
            ):
                continue
            if not node.attrib and node.tag in {f'{{{AC}}}rich-text-body', f'{{{AC}}}plain-text-body'}:
                continue
            raise ValueError
        return root
    except (ValueError, etree.XMLSyntaxError):
        raise HTTPException(422, '지원하지 않는 Storage Format입니다. 형식과 요소를 확인해 주세요.') from None


def place_images(storage, images):
    for image in images:
        name = image['name']
        token = f'[[image:{name}]]'
        reference = f'<ac:image><ri:attachment ri:filename="{name}" /></ac:image>'
        if token in storage:
            storage = storage.replace(token, reference)
        else:
            storage += f'<p>{reference}</p>'
    return storage


def fragment(root):
    wrapped = etree.tostring(root, encoding='unicode')
    return wrapped.split('>', 1)[1].rsplit('</root>', 1)[0]


def preview_storage(storage, names):
    root = validate_storage(storage, names)
    markers = {}
    if not root.findall(f'.//{{{AC}}}image'):
        return storage, markers
    for image in root.iter(f'{{{AC}}}image'):
        marker = 'studio-image-' + secrets.token_hex(16)
        markers[marker] = image[0].get(f'{{{RI}}}filename')
        image.clear(keep_tail=True)
        image.tag = 'strong'
        image.text = marker
    return fragment(root), markers


def safe_view(value, markers=None):
    # Keep static Confluence layout and text only. Never run provider-supplied markup in the Studio origin.
    root = html.fragment_fromstring(value, create_parent='div')
    for node in list(root.iterdescendants()):
        if not isinstance(node.tag, str) or node.tag in {'script','style','iframe','object','svg','form','template'}:
            node.drop_tree()
        elif node.tag not in TAGS | {'div','span','section','a','details','summary','caption','colgroup','col'}:
            node.drop_tag()
        else:
            for key in list(node.attrib):
                if key not in {'class','colspan','rowspan'}:
                    del node.attrib[key]
    for node in root.iter('strong', 'b'):
        if markers and node.text in markers and not len(node):
            node.tag = 'span'
            node.set('data-studio-image', markers[node.text])
            node.text = None
    return html.tostring(root, encoding='unicode')
