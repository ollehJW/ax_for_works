"""Prepare representative sections before extracting either template representation."""
from collections import Counter
from lxml import html

HEADINGS = {f'h{n}' for n in range(1, 7)}
EMBEDDED = {'table', 'li', 'ac:structured-macro', 'blockquote'}


def representative_headings(root, page_title=None):
    """Keep all major headings and at most three sibling topics at each lower level."""
    for group in root.iter('ol', 'ul', 'table', 'ac:task-list'):
        if group.tag == 'table':
            rows = group.xpath('./tr | ./tbody/tr | ./tfoot/tr')
            items = [row for row in rows if row.find('td') is not None]
        else:
            tag = 'ac:task' if group.tag == 'ac:task-list' else 'li'
            items = [node for node in group if node.tag == tag]
        for item in items[3:]:
            item.getparent().remove(item)

    headings = [n for n in root.iterdescendants() if n.tag in HEADINGS
                and not any(p.tag in EMBEDDED for p in n.iterancestors())]
    if not headings:
        return {}
    levels = {n: int(n.tag[1]) for n in headings}
    first = headings[0]
    if (len(headings) > 1 and page_title and first.tag == 'h1'
            and ' '.join(''.join(first.itertext()).split()) == ' '.join(page_title.split())):
        del levels[first]
        first.getparent().remove(first)
    major = min(levels.values())

    counts = Counter()
    labels = {}
    omitted = set()
    skip_level = None
    for node in root.iterdescendants():
        level = levels.get(node)
        if level is not None:
            if skip_level is not None and level <= skip_level:
                skip_level = None
            if skip_level is None:
                for deeper in list(counts):
                    if deeper > level:
                        del counts[deeper]
                counts[level] += 1
                if level > major and counts[level] > 3:
                    skip_level = level
                elif level <= major:
                    original = ' '.join(''.join(node.itertext()).split())
                    labels[node] = (f'(예: {original})' if original else '섹션 제목', True)
                else:
                    role = '세부 주제' if level == major + 1 else '주요 항목'
                    labels[node] = (f'{role} {counts[level]}', False)
        if skip_level is not None:
            omitted.add(node)
    # Wrappers can span two sections. Retain the wrapper around the next kept heading.
    for heading in labels:
        omitted.difference_update(heading.iterancestors())
    for node in omitted:
        if node.getparent() not in omitted:
            node.getparent().remove(node)
    return labels


def align_sections(blueprint, sample):
    majors = html.fragment_fromstring(sample, create_parent='div').xpath('.//*[@data-section]')
    if not majors:
        return
    by_id = {s.heading.strip(): s for s in blueprint.sections}
    sections = []
    for major in majors:
        label = major.text
        section = by_id.get(major.get('data-section')) or by_id.get(label)
        if section is None:
            section = type(blueprint.sections[0])(heading=label, instruction='이 섹션의 양식에 맞춰 새 자료를 채운다.')
        sections.append(section.model_copy(update={'heading': label}))
    blueprint.sections = sections
