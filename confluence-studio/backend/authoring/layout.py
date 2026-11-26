import hashlib
import json
import subprocess
import sys
from pathlib import Path

from lxml import etree

from .storage import AC, RI, fragment, validate_storage


def formula_name(latex):
    return 'math-' + hashlib.sha256(latex.encode()).hexdigest()[:24] + '.png'


def spacer(node):
    return (node is not None and node.tag == 'p' and not ''.join(node.itertext()).strip()
            and all(child.tag == 'br' for child in node))


HEADINGS = {'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}
BLOCKS = HEADINGS | {'p', 'table', 'ul', 'ol', 'pre', 'blockquote', 'hr',
                    f'{{{AC}}}structured-macro', f'{{{AC}}}image'}


def space_blocks(root):
    # Work only on document flow. Rows, list items and macro bodies retain their layout.
    previous = None
    for node in list(root):
        if spacer(node):
            if spacer(previous) and not (previous.tail or '').strip() and not (node.tail or '').strip():
                root.remove(node)
                continue
        elif previous is not None and not spacer(previous) and not (previous.tail or '').strip():
            if previous.tag in BLOCKS and node.tag in BLOCKS:
                starts_chapter = node.tag in {'h1', 'h2'}
                if previous.tag not in HEADINGS or starts_chapter:
                    node.addprevious(etree.fromstring(b'<p><br/></p>'))
        previous = node


def prepare_layout(storage, image_names):
    root = validate_storage(storage, image_names)
    space_blocks(root)

    targets = []
    existing = set()
    for node in root.iterdescendants():
        if node.tag == 'code' and not len(node) and (node.text or '').startswith('latex:'):
            latex = node.text[6:].strip()
        elif node.tag == f'{{{AC}}}image' and node.get(f'{{{AC}}}alt') is not None:
            latex = node.get(f'{{{AC}}}alt').strip()
            if formula_name(latex) == node[0].get(f'{{{RI}}}filename'):
                existing.add(latex)
                continue
        else:
            continue
        targets.append((node, latex))

    expressions = list(dict.fromkeys(latex for _, latex in targets
                                     if 0 < len(latex) <= 1500 and latex not in existing))
    expressions = expressions[:max(0, 32 - len(existing))]
    rendered = {}
    if expressions:
        try:
            worker = subprocess.run([sys.executable, '-m', 'backend.authoring.formula_worker'],
                                    cwd=Path(__file__).resolve().parents[2], input=json.dumps(expressions),
                                    capture_output=True, text=True, timeout=10)
            if worker.returncode == 0:
                rendered = json.loads(worker.stdout)
        except subprocess.TimeoutExpired:
            pass

    assets = {}
    for node, latex in targets:
        name = formula_name(latex)
        node.clear(keep_tail=True)
        if latex in rendered or latex in existing:
            node.tag = f'{{{AC}}}image'
            node.set(f'{{{AC}}}alt', latex)
            etree.SubElement(node, f'{{{RI}}}attachment').set(f'{{{RI}}}filename', name)
            if latex in rendered:
                assets[name] = {'name': name, 'data': rendered[latex], 'latex': latex}
        else:
            node.tag = 'code'
            node.text = 'latex: ' + latex
    return fragment(root), list(assets.values())
