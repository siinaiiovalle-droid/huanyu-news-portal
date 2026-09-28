import json, urllib.request, urllib.parse, io, os
from PIL import Image

UA = {'User-Agent': 'Mozilla/5.0'}
OUT = 'assets/shop'
SIZE = 1200
Q = json.load(open('tools/_shop_queries.json', encoding='utf8'))
def search(q):
    u = 'https://api.openverse.org/v1/images/?q=' + urllib.parse.quote(q)
    u += '&page_size=30&mature=false'
    d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30))
    return d.get('results', [])


def pick(rs, used):
    for r in rs:
        w, h = r.get('width') or 0, r.get('height') or 0
        u = r.get('url') or ''
        if min(w, h) < 900:
            continue
        if not u.lower().endswith(('.jpg', '.jpeg')):
            continue
        if u in used:
            continue
        return u
    return None


def save(url, path):
    raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    s = min(im.size)
    im = im.crop(((im.width - s) // 2, (im.height - s) // 2,
                  (im.width - s) // 2 + s, (im.height - s) // 2 + s))
    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    im.save(path, 'JPEG', quality=88, optimize=True)
    return len(raw)


used = set()
for pid, q in Q.items():
    rs = search(q)
    for i in range(1, 4):
        u = pick(rs, used)
        if not u:
            print(pid, i, 'no candidate')
            break
        used.add(u)
        p = os.path.join(OUT, pid + '_' + str(i) + '.jpg')
        try:
            save(u, p)
            print(pid, i, 'ok', os.path.getsize(p) // 1024, 'KB')
        except Exception as e:
            print(pid, i, 'fail', str(e)[:40])




