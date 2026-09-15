"""生成轻量部署包：把图片压缩到适合公网传输的体积，其余文件原样拷贝。"""
import os
import shutil
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, ".deploy")
MAX_EDGE = int(os.environ.get("DEPLOY_MAX_EDGE", 1200))
JPEG_Q = int(os.environ.get("DEPLOY_JPEG_Q", 72))
# 单张图片体积上限：超过就继续降质量，保证整包能传上去
SIZE_CAP = int(float(os.environ.get("DEPLOY_SIZE_CAP_KB", 400)) * 1024)
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")


def compress(src, dst):
    with Image.open(src) as im:
        im.load()
        has_alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
        w, h = im.size
        if max(w, h) > MAX_EDGE:
            r = MAX_EDGE / float(max(w, h))
            im = im.resize((int(w * r), int(h * r)), Image.LANCZOS)

        if dst.lower().endswith(".png"):
            base = im.convert("RGBA") if has_alpha else im.convert("RGB")
            tmp = dst + ".tmp.png"
            base.save(tmp, "PNG", optimize=True)
            if os.path.getsize(tmp) > SIZE_CAP and not has_alpha:
                # 无透明通道的插画类图片转成调色板，体积可再降一个数量级
                base.convert("P", palette=Image.ADAPTIVE, colors=128).save(tmp, "PNG", optimize=True)
            os.replace(tmp, dst)
        else:
            if has_alpha:
                bg = Image.new("RGB", im.size, (255, 255, 255))
                bg.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[-1])
                im = bg
            else:
                im = im.convert("RGB")
            q = JPEG_Q
            tmp = dst + ".tmp.jpg"
            im.save(tmp, "JPEG", quality=q, optimize=True, progressive=True)
            while os.path.getsize(tmp) > SIZE_CAP and q > 35:
                q -= 8
                im.save(tmp, "JPEG", quality=q, optimize=True, progressive=True)
            os.replace(tmp, dst)


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT, exist_ok=True)
    copied = 0
    shrink_before = shrink_after = 0

    for entry in os.listdir(ROOT):
        src = os.path.join(ROOT, entry)
        if entry in (".deploy", "node_modules", ".git", ".codebuddy") or entry.endswith(".py"):
            continue
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(OUT, entry))
            continue
        for dirpath, dirnames, filenames in os.walk(src):
            dirnames[:] = [d for d in dirnames if d not in ("node_modules", ".git")]
            rel = os.path.relpath(dirpath, ROOT)
            os.makedirs(os.path.join(OUT, rel), exist_ok=True)
            for name in filenames:
                s = os.path.join(dirpath, name)
                d = os.path.join(OUT, rel, name)
                if name.lower().endswith(IMG_EXT):
                    before = os.path.getsize(s)
                    try:
                        compress(s, d)
                    except Exception as exc:  # 压缩失败就原样带上，别丢素材
                        print("skip", rel + "/" + name, exc, file=sys.stderr)
                        shutil.copy2(s, d)
                        continue
                    shrink_before += before
                    shrink_after += os.path.getsize(d)
                else:
                    shutil.copy2(s, d)
                copied += 1

    total = sum(
        os.path.getsize(os.path.join(p, f))
        for p, _, fs in os.walk(OUT)
        for f in fs
    )
    print(
        "files=%d size=%.2fMB (images %.2fMB -> %.2fMB)"
        % (copied, total / 1048576, shrink_before / 1048576, shrink_after / 1048576)
    )


if __name__ == "__main__":
    main()
