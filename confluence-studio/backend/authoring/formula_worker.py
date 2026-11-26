"""Render a batch of draft equations offline, with bounded resources."""
import base64
import json
import resource
import sys

from lxml import etree


def render(latex):
    import resvg_py
    import ziamath

    svg = ziamath.Latex(latex, size=20, margin=4).svg()
    root = etree.fromstring(svg.encode())
    width, height = float(root.get('width')), float(root.get('height'))
    if not (0 < width <= 2600 and 0 < height <= 1200 and width * height < 900000):
        raise ValueError
    # The font renderer emits paths and local glyph references only.
    for node in root.iter():
        if etree.QName(node).localname not in {'svg','symbol','g','use','path','rect','line','polygon','circle','ellipse','title','defs','polyline'}:
            raise ValueError
        for attr, value in node.attrib.items():
            if (etree.QName(attr).localname == 'href' and not value.startswith('#')) or 'url(' in value.lower():
                raise ValueError
    png = resvg_py.svg_to_bytes(svg_string=svg, skip_system_fonts=True)
    return base64.b64encode(png).decode()


if __name__ == '__main__':
    resource.setrlimit(resource.RLIMIT_CPU, (6, 8))
    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024**2,) * 2)
    results = {}
    for formula in json.load(sys.stdin):
        try:
            results[formula] = render(formula)
        except Exception:
            continue
    print(json.dumps(results))
