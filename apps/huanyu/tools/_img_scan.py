"""临时体检：App 商城/本地生活图片是否真实高清（排查纯色图、黑图、低分辨率图）。"""
import glob
import os
from PIL import Image, ImageStat

files = sorted(glob.glob(r"D:\dev\apps\huanyu\assets\shop\*.jpg")) + \
    sorted(glob.glob(r"D:\dev\apps\huanyu\assets\life\*.jpg"))
rows = []
for f in files:
    im = Image.open(f)
    std = ImageStat.Stat(im.convert("L")).stddev[0]
    rows.append((os.path.basename(f), im.size, round(std, 1), os.path.getsize(f) // 1024))

print("count", len(rows))
print("min width", min(r[1][0] for r in rows), "min height", min(r[1][1] for r in rows))
for r in rows:
    if r[2] < 12 or r[1][0] < 800:
        print("SUSPECT", r)
print("---- all ----")
for r in rows:
    print(r)
