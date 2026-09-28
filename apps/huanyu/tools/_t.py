import urllib.request
for u in ["https://source.unsplash.com/featured/?tshirt",
          "https://loremflickr.com/1200/1200/tshirt",
          "https://picsum.photos/1200"]:
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=20)
        print(u, r.status, r.geturl()[:90])
    except Exception as e:
        print(u, 'FAIL', str(e)[:60])
