import sys
from PIL import Image

for f in sys.argv[1:]:
    im = Image.open(f).convert('RGB').resize((120, 120))
    px = list(im.getdata())
    n = float(len(px))
    d = sum(1 for r, g, b in px if r < 70 and g < 70 and b < 70) / n
    y = sum(1 for r, g, b in px if r > 170 and g > 130 and b < 110) / n
    print('%-24s dark=%.2f yellow=%.2f' % (f, d, y))
