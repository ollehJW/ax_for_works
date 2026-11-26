"""Compact, content-free display tree from the masked Confluence storage sample."""
from lxml import html


def visual_layout(sample):
    root = html.fragment_fromstring(sample, create_parent='div')
    containers = {'table', 'tr', 'th', 'td', 'ul', 'ol', 'li', 'blockquote'}
    macros = {'info', 'tip', 'note', 'warning', 'panel', 'code', 'expand', 'toc'}

    def blocks(parent):
        result = []
        for node in parent:
            tag = node.tag
            if tag in {'ac:parameter', 'colgroup'}:
                continue
            if tag in {'thead', 'tbody', 'tfoot', 'div', 'section', 'ac:layout', 'ac:rich-text-body'}:
                result.extend(blocks(node))
                continue
            block = {}
            if tag in containers:
                if tag in {'td', 'th'}:
                    for key in ('rowspan', 'colspan'):
                        value = node.get(key, '')
                        if value.isascii() and value.isdigit() and len(value) <= 2:
                            block[key] = max(1, int(value))
            elif tag in {'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}:
                label = ''.join(node.itertext()).strip()
                result.append({'type': 'heading', 'level': int(tag[1]), 'label': label if '[내용]' not in label else ''})
                continue
            elif tag == 'ac:structured-macro':
                kind = node.get('ac:name')
                tag = kind if kind in macros else 'panel'
            elif tag == 'ac:layout-section':
                tag = 'columns'
            elif tag == 'ac:layout-cell':
                tag = 'column'
            elif tag == 'ac:image':
                result.append({'type': 'image'})
                continue
            elif tag == 'hr':
                result.append({'type': 'divider'})
                continue
            elif tag in {'p', 'pre', 'ac:plain-text-body'}:
                if any(n.tag == 'ac:image' for n in node.iterdescendants()):
                    result.append({'type': 'image'})
                elif ''.join(node.itertext()).strip():
                    result.append({'type': 'line'})
                continue
            else:
                result.extend(blocks(node))
                continue
            block.update(type=tag, children=blocks(node))
            if not block['children'] and tag in {'td', 'th', 'li', 'blockquote'}:
                block['children'] = [{'type': 'line'}]
            result.append(block)
        return result

    return blocks(root) or [{'type': 'line'}]
