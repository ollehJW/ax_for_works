from functools import lru_cache
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parent
FORMATS = {'.docx': 'word', '.md': 'markdown', '.html': 'html', '.htm': 'html',
           '.xlsx': 'excel', '.pdf': 'pdf', '.pptx': 'powerpoint'}


@lru_cache(maxsize=8)
def _read(name):
    return (DIRECTORY / f'{name}.txt').read_text(encoding='utf-8').strip()


def system_prompt(filename):
    kind = FORMATS.get(Path(filename).suffix.lower()) if filename else None
    return _read('base') + ('\n\n' + _read(kind) if kind else '')


def revision_prompt():
    return system_prompt(None) + '\n\n' + _read('revision')
