from PIL import Image, ImageFilter
import glob, os, sys

root = sys.argv[1] if len(sys.argv) > 1 else 'assets/shop'
for f in sorted(glob.glob(os.path.join(root, '*.jpg'))):
    im = Image.open(f).convert('RGB')
    small = im.resize((160, 160))
    colors = len(set(small.getdata()))
    e = im.convert('L').resize((300, 300)).filter(ImageFilter.FIND_EDGES)
    detail = round(sum(e.getdata()) / 90000.0, 1)
    print(os.path.basename(f), im.size, 'colors=' + str(colors), 'detail=' + str(detail))
