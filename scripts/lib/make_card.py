# -*- coding: utf-8 -*-
"""
寰宇新闻网 —— 品牌配图卡生成器

用途：当稿件既没有采集源原文配图、也抓不到原文页图片、图库检索也没命中时，
      用 Pillow 生成一张"带标题与频道"的品牌配图卡兜底。

为什么用它兜底：
  1) 内容对应：卡片上直接印文章标题与频道名，不会出现"随机风景图配时政新闻"；
  2) 绝不重复：每张卡片按稿件 ID 与标题生成，色彩、纹理、文字都不同；
  3) 零网络依赖：不依赖任何图库接口，离线也能出图，采集链路不会被网络拖垮。

用法：
  python make_card.py <输出路径> --title "标题" --channel 财经 --seed abc123 [--width 1600] [--height 900]
  成功时在 stdout 打印 16 位 dHash 指纹。
"""
import argparse
import hashlib
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

# 频道主题色（深色起始色 -> 亮色结束色），视觉上区分栏目
PALETTES = {
    'china': ((10, 44, 88), (26, 110, 178)),
    'world': ((12, 40, 76), (26, 120, 148)),
    'finance': ((16, 62, 54), (38, 138, 100)),
    'tech': ((26, 28, 78), (74, 62, 162)),
    'sports': ((88, 38, 20), (206, 112, 40)),
    'entertainment': ((78, 20, 68), (188, 62, 140)),
    'auto': ((26, 36, 58), (92, 112, 152)),
    'culture': ((58, 34, 24), (152, 100, 58)),
    'health': ((16, 64, 74), (40, 148, 158)),
    'video': ((18, 22, 44), (92, 62, 142)),
    'square': ((22, 38, 66), (64, 104, 160)),
    'headline': ((36, 16, 30), (150, 50, 90)),
}
DEFAULT_PALETTE = ((20, 40, 70), (62, 102, 162))

FONT_CANDIDATES = [
    (r'C:\Windows\Fonts\msyhbd.ttc', 0),   # 微软雅黑 粗体
    (r'C:\Windows\Fonts\msyh.ttc', 0),     # 微软雅黑
    (r'C:\Windows\Fonts\simhei.ttf', 0),   # 黑体
    ('/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc', 0),
    ('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 0),
]


def load_font(size):
    for path, index in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=index)
            except Exception:
                continue
    return ImageFont.load_default()


def seed_ints(seed, count):
    """从稿件 ID 派生一组稳定的伪随机数，保证同一篇稿件的卡片可复现"""
    digest = hashlib.sha256(seed.encode('utf-8')).digest()
    return [digest[i] for i in range(count)]


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def gradient(size, c0, c1, angle=35):
    """线性渐变背景：先画小图再放大，避免逐像素循环拖慢出图速度"""
    w, h = size
    sw, sh = 48, 27
    small = Image.new('RGB', (sw, sh))
    px = small.load()
    rad = math.radians(angle)
    dx, dy = math.cos(rad), math.sin(rad)
    span = abs(dx) + abs(dy) or 1
    for y in range(sh):
        for x in range(sw):
            t = (dx * (x / (sw - 1)) + dy * (y / (sh - 1))) / span
            px[x, y] = lerp(c0, c1, min(1.0, max(0.0, t)))
    return small.resize(size, Image.BICUBIC)


def wrap(text, font, max_width, draw, max_lines=3):
    lines, cur = [], ''
    for ch in text:
        trial = cur + ch
        if draw.textlength(trial, font=font) <= max_width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and draw.textlength(last + '…', font=font) > max_width:
            last = last[:-1]
        lines[-1] = last + '…'
    return lines


def make_card(out_path, title, channel_label, channel_key, seed, width=1600, height=900):
    c0, c1 = PALETTES.get(channel_key, DEFAULT_PALETTE)
    img = gradient((width, height), c0, c1)
    draw = ImageDraw.Draw(img, 'RGBA')
    r = seed_ints(seed or title, 6)

    # 纹理：低透明度斜线 + 大圆弧，厚度与角度由 seed 决定
    step = 90 + r[0] % 70
    for x in range(-height, width, step):
        draw.line([(x, height), (x + height, 0)], fill=(255, 255, 255, 10), width=2)
    draw.ellipse(
        [width - 420 - r[1] % 160, -220 + r[2] % 120, width + 220, 420 + r[3] % 140],
        outline=(255, 255, 255, 26), width=3
    )
    draw.ellipse(
        [-260 + r[4] % 120, height - 320 + r[5] % 90, 320, height + 200],
        outline=(255, 255, 255, 18), width=2
    )

    # 顶部频道标签
    badge_font = load_font(38)
    pad_x, pad_y = 34, 16
    bw = draw.textlength(channel_label, font=badge_font) + pad_x * 2
    bh = 38 + pad_y * 2
    x0, y0 = 110, 96
    draw.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=bh // 2, fill=(255, 255, 255, 46))
    draw.text((x0 + pad_x, y0 + pad_y - 4), channel_label, font=badge_font, fill=(255, 255, 255, 240))

    # 标题（自动换行，最多 3 行）
    title_font = load_font(84 if len(title) <= 22 else 72)
    max_w = width - 110 * 2 - 60
    lines = wrap(title or '寰宇新闻网', title_font, max_w, draw, max_lines=3)
    line_h = int(title_font.size * 1.32)
    total_h = line_h * len(lines)
    ty = (height - total_h) // 2 + 10
    draw.rounded_rectangle([110, ty - 6, 120, ty + total_h - 8], radius=5, fill=(255, 255, 255, 220))
    for i, line in enumerate(lines):
        draw.text((168, ty + i * line_h), line, font=title_font, fill=(255, 255, 255, 250))

    # 底部品牌字标
    brand_font = load_font(40)
    draw.line([(110, height - 150), (110 + 96, height - 150)], fill=(255, 255, 255, 200), width=4)
    draw.text((110, height - 132), '寰宇新闻网', font=brand_font, fill=(255, 255, 255, 235))
    small = load_font(26)
    draw.text((110 + draw.textlength('寰宇新闻网', font=brand_font) + 26, height - 122),
              'HUANYU NEWS · 洞察世界 传递真相 连接未来', font=small, fill=(255, 255, 255, 170))

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    img.save(out_path, 'JPEG', quality=88, optimize=True, progressive=True)

    # 输出指纹，交给 Node 侧做全站去重
    from PIL import Image as _Image
    small_img = _Image.open(out_path).convert('L').resize((9, 8), _Image.LANCZOS)
    px = list(small_img.tobytes())
    bits = 0
    for row in range(8):
        for col in range(8):
            bits = (bits << 1) | (1 if px[row * 9 + col] < px[row * 9 + col + 1] else 0)
    print(format(bits, '016x'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--title', default='')
    ap.add_argument('--channel', default='')
    ap.add_argument('--key', default='')
    ap.add_argument('--seed', default='')
    ap.add_argument('--width', type=int, default=1600)
    ap.add_argument('--height', type=int, default=900)
    args = ap.parse_args()
    make_card(args.out, args.title, args.channel, args.key, args.seed, args.width, args.height)


if __name__ == '__main__':
    main()
