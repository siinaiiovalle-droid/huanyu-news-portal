"""临时校验：把订单页截图里疑似商品缩略图的区域打成 14x14 灰度矩阵，肉眼（数值）判断是照片还是渐变块。
照片：数值无规律跳变；渐变色块：沿一个方向单调平滑变化。
"""
import numpy as np
from PIL import Image

SHOT = r"D:\dev\apps\huanyu\screenshots\orders_real.png"
a = np.asarray(Image.open(SHOT).convert("L"), dtype=np.float32)

regions = {
    "卡片商品图 y456": (36, 456, 252, 672),
    "卡片商品图 y700": (36, 700, 252, 916),
    "卡片商品图 y1000": (36, 1000, 252, 1216),
}
for name, (x0, y0, x1, y1) in regions.items():
    block = a[y0:y1, x0:x1]
    h, w = block.shape
    ys = np.linspace(0, h, 15).astype(int)
    xs = np.linspace(0, w, 15).astype(int)
    grid = np.array([[block[ys[j]:ys[j + 1], xs[i]:xs[i + 1]].mean() for i in range(14)] for j in range(14)])
    print("==", name, "std", round(float(block.std()), 1))
    for row in grid:
        print(" ".join(f"{int(v):3d}" for v in row))
