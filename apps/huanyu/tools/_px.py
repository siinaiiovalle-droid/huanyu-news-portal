import urllib.request, re, sys

q = sys.argv[1]
u = 'https://unsplash.com/s/photos/' + urllib.parse.quote(q)
req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
h = urllib.request.urlopen(req, timeout=30).read().decode('utf8', 'ignore')
urls = re.findall(r'images\.unsplash\.com/photo-([0-9a-z]+-[0-9a-z]+)', h)
seen, out = set(), []
for x in urls:
    if x not in seen:
        seen.add(x)
        out.append(x)
print(len(out))
for x in out[:12]:
    print(x)
