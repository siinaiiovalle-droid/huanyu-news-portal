from PIL import Image
import glob, os

for f in sorted(glob.glob('assets/shop/_raw/*.jpg')):
    im = Image.open(f).convert('RGB')
    s = min(im.size)
    x = (im.width - s) // 2
    y = (im.height - s) // 2
    im = im.crop((x, y, x + s, y + s)).resize((1200, 1200), Image.LANCZOS)
    out = 'assets/shop/' + os.path.basename(f)
    im.save(out, 'JPEG', quality=90, optimize=True)
    print(os.path.basename(out), os.path.getsize(out) // 1024, 'KB')
