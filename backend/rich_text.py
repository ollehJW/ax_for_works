"""Allow only document formatting in board HTML."""
import re
import nh3
from html.parser import HTMLParser

TAGS = {'p','br','strong','b','em','i','u','s','span','h2','h3','ul','ol','li','blockquote','hr','a'}

def clean_html(value):
    return nh3.clean(value, tags=TAGS, attributes={'span': {'style'}, 'a': {'href', 'title'}, 'ol': {'start'}},
                     clean_content_tags={'script','style','iframe','object','svg','math'},
                     url_schemes={'http','https','mailto'}, filter_style_properties={'color','background-color'},
                     link_rel='noopener noreferrer')

class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]
    def handle_data(self, data):
        self.parts.append(data)

def has_text(value):
    parser=Text();parser.feed(value)
    return bool(re.sub(r'[\s\u200b\u200c\u200d\ufeff]', '', ''.join(parser.parts)))
