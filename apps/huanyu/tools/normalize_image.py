"""把下载到的原始图片统一裁切为高清 JPEG，并输出 dHash 用于去重。

用法：
    python normalize_image.py <源文件> <目标文件> <宽> <高> [质量]
        —— 居中裁切（cover 语义）+ LANCZOS 缩放 + 渐进式 JPEG，最后一行打印目标文件 dHash
    python normalize_image.py --dhash <图片文件>
        —— 只计算 dHash

dHash：灰度 → 9x8 → 比较相邻像素，得到 64 位（16 位十六进制）指纹。
同一张图被裁成相同尺寸后指纹一致；汉明距离 ≤6 视为重复。
"""
import sys

from PIL import Image


def dhash(image_path: str) -> str:
    with Image.open(image_path) as im:
        gray = im.convert("L").resize((9, 8), Image.LANCZOS)
        pixels = list(gray.getdata())

    bits = 0
    for row in range(8):
        for col in range(8):
            idx = row * 9 + col
            bits = (bits << 1) | (1 if pixels[idx] < pixels[idx + 1] else 0)
    return format(bits, "016x")


def normalize(src: str, dst: str, width: int, height: int, quality: int = 88) -> str:
    with Image.open(src) as image:
        image = image.convert("RGB")
        src_w, src_h = image.size
        if src_w <= 0 or src_h <= 0:
            raise SystemExit("源图尺寸异常")

        target_ratio = width / height
        src_ratio = src_w / src_h
        if src_ratio > target_ratio:
            crop_w = max(1, int(round(src_h * target_ratio)))
            left = (src_w - crop_w) // 2
            image = image.crop((left, 0, left + crop_w, src_h))
        else:
            crop_h = max(1, int(round(src_w / target_ratio)))
            top = (src_h - crop_h) // 2
            image = image.crop((0, top, src_w, top + crop_h))

        image = image.resize((width, height), Image.LANCZOS)
        image.save(dst, "JPEG", quality=quality, optimize=True, progressive=True)

    return dhash(dst)


def main() -> int:
    args = sys.argv[1:]
    if not args:
        raise SystemExit("用法：normalize_image.py <源> <目标> <宽> <高> [质量] | --dhash <图片>")

    if args[0] == "--dhash":
        for p in args[1:]:
            try:
                print(dhash(p))
            except Exception:
                print("ERROR")
        return 0

    src, dst = args[0], args[1]
    width = int(args[2])
    height = int(args[3])
    quality = int(args[4]) if len(args) > 4 else 88
    print(normalize(src, dst, width, height, quality))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
