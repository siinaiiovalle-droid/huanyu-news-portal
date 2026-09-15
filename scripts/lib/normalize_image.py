"""把下载到的原始图片统一裁切为固定尺寸的高清 JPEG，并计算感知哈希用于全站去重。

用法：
    python normalize_image.py <源文件> <目标文件> <宽> <高> [质量]
        —— 裁切输出，并在最后一行打印目标文件的 dHash（16 位十六进制）
    python normalize_image.py --dhash <图片文件>
        —— 只计算并打印 dHash

裁切策略：按目标比例做居中裁切（cover 语义）再缩放，保证：
  * 所有配图尺寸一致（默认 1600x900），页面不出现参差不齐的缩略图；
  * 输出为渐进式 JPEG，质量默认 86，体积远小于原始 PNG。

dHash 用于"不出现重复配图"：同一张图被裁切成相同尺寸后指纹一致，
即便来自不同稿件、不同文件名也能被识别出来。
"""
import sys

from PIL import Image


def dhash(image_path: str) -> str:
    """感知哈希：转灰度 → 缩放到 9x8 → 比较相邻像素，得到 64 位指纹。"""
    with Image.open(image_path) as im:
        gray = im.convert("L").resize((9, 8), Image.LANCZOS)
        pixels = list(gray.getdata())

    bits = 0
    for row in range(8):
        for col in range(8):
            idx = row * 9 + col
            bits = (bits << 1) | (1 if pixels[idx] < pixels[idx + 1] else 0)
    return format(bits, "016x")


def normalize(src: str, dst: str, width: int, height: int, quality: int) -> str:
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
        # 批量模式：单张读失败只输出 ERROR，不能中断整批（否则整批指纹全部丢失）
        for p in args[1:]:
            try:
                print(dhash(p))
            except Exception:
                print("ERROR")
        return 0

    src, dst = args[0], args[1]
    width = int(args[2])
    height = int(args[3])
    quality = int(args[4]) if len(args) > 4 else 86
    print(normalize(src, dst, width, height, quality))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
