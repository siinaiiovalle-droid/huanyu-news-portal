# -*- coding: utf-8 -*-
"""生成海报用的站点访问二维码（纯本地，无需联网）。

用法：python scripts/gen-poster-qr.py [输出路径]
默认输出 poster/qr.png，二维码内容为公网站点首页地址。
"""
import os
import sys

import qrcode
from qrcode.constants import ERROR_CORRECT_H

URL = 'https://siinaiiovalle-droid.github.io/huanyu-news-portal/'


def build(output_path):
    qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_H, box_size=24, border=2)
    qr.add_data(URL)
    qr.make(fit=True)
    img = qr.make_image(fill_color='#0b1a2e', back_color='white').convert('RGB')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path)
    print('二维码已生成:', os.path.abspath(output_path), img.size, '->', URL)


if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'poster', 'qr.png')
    build(target)
