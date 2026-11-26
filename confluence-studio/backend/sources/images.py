import base64
import hashlib
import io

from PIL import Image


class ImageLimit(ValueError):
    pass


class Images:
    def __init__(self, kind):
        self.kind = kind
        self.items = {}
        self.total = 0

    def add(self, data, location):
        digest = hashlib.sha256(data).hexdigest()[:24]
        if digest not in self.items:
            picture = Image.open(io.BytesIO(data))
            if picture.format in ('PNG', 'JPEG'):
                ext = 'png' if picture.format == 'PNG' else 'jpg'
            else:
                ext = 'png'
                out = io.BytesIO()
                picture.convert('RGBA').save(out, format='PNG')
                data = out.getvalue()
            self.total += len(data)
            if self.total > 20 * 1024**2 or len(self.items) >= 48:
                raise ImageLimit
            thumb = picture.convert('RGBA')
            thumb.thumbnail((1200, 1200))
            rgb = Image.new('RGB', thumb.size, 'white')
            rgb.paste(thumb, mask=thumb.getchannel('A'))
            out = io.BytesIO()
            rgb.save(out, format='JPEG', quality=80)
            self.items[digest] = {'name': f'{self.kind}-{digest}.{ext}', 'locations': [],
                                  'data': base64.b64encode(data).decode(),
                                  'thumbnail': base64.b64encode(out.getvalue()).decode()}
        entry = self.items[digest]
        if location not in entry['locations']:
            entry['locations'].append(location)
        return entry['name']
