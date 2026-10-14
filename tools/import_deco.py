"""把使用者素材庫的裝飾 PNG 轉成網頁用 webp，並寫出 deco.json 清單。
原始檔不會被修改。重跑會覆蓋 web/assets/deco/。

用法：python tools/import_deco.py
"""
import json, re
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'web' / 'assets' / 'deco'
SOURCES = [
    (Path(r'D:\素材庫\星羽幻想卡背_無字PNG\01_卡背'), 'back', 900),
    (Path(r'D:\素材庫\星羽幻想卡背_無字PNG\04_圖示'), 'icon', 420),
    (Path(r'D:\素材庫\星羽幻想卡背_無字PNG\05_裝飾分隔'), 'ornament', 700),
    (Path(r'D:\素材庫\Default\f00feac4-e116-41d1-baa3-12dd8678e8ad\裝飾'), 'ornament', 1100),
]

# 橫式／方形卡背（同一套設計，各有直式對應）：依檔名排序後的順序 → 對應的直式卡背、名稱
SHAPED = [
    (Path(r'D:\素材庫\幻想卡背橫板'), 'l', ['a04', 'b01', 'c01', 'e02', 'g01', 'a02', 'd01', 'f02']),
    (Path(r'D:\素材庫\幻想卡背方形'), 's', ['b01', 'a04', 'c01', 'e02', 'g01', 'a02', 'd01', 'f02']),
]
DESIGN = {'a04': '四芒星光', 'b01': '星河漩渦', 'c01': '流光銀河', 'e02': '藤蔓星徽', 'g01': '星環羅盤', 'a02': '銀藤星河', 'd01': '金羽星河', 'f02': '雙藤星魂'}


def rounded_card(f, max_side, inset=.018, rad=.05):
    """去掉外圍留白，裁成圓角卡片（透明底）"""
    im = Image.open(f).convert('RGB')
    W, H = im.size
    d = round(min(W, H) * inset)
    im = im.crop((d, d, W - d, H - d))
    im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    w, h = im.size
    s = 4
    m = Image.new('L', (w * s, h * s), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * s - 1, h * s - 1), radius=round(min(w, h) * rad * s), fill=255)
    im = im.convert('RGBA')
    im.putalpha(m.resize((w, h), Image.Resampling.LANCZOS))
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    items = []
    for folder, kind, max_side in SOURCES:
        if not folder.exists():
            print('略過（找不到）：', folder)
            continue
        for f in sorted(folder.glob('*.png')):
            code = f.stem.split('_')[0]
            label = f.stem.split('_')[-1]
            if '卡框' in f.stem:
                kind_i = 'frame'
            elif '羽毛' in f.stem:
                kind_i = 'feather'
            elif '徽章' in f.stem or '垂飾' in f.stem or '垂墜' in f.stem:
                kind_i = 'badge'
            elif '分隔' in f.stem:
                kind_i = 'divider'
            else:
                kind_i = kind
            name = f'{kind_i}-{code.lower()}.webp'
            im = Image.open(f).convert('RGBA')
            im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            im.save(OUT / name, 'WEBP', quality=90, method=6)
            items.append({'id': f'{kind_i}-{code.lower()}', 'file': f'assets/deco/{name}', 'kind': kind_i, 'name': label, 'w': im.width, 'h': im.height})
            print(name, im.size)
            if kind_i == 'back':   # 橫式卡背：轉 90° 另存（橫圖卡片、橫式閃卡背面用）
                lname = f'{kind_i}-{code.lower()}-l.webp'
                lim = im.rotate(90, expand=True)
                lim.save(OUT / lname, 'WEBP', quality=90, method=6)
                items.append({'id': f'{kind_i}-{code.lower()}-l', 'file': f'assets/deco/{lname}', 'kind': 'back-l', 'name': label + '（橫）', 'w': lim.width, 'h': lim.height})
    for folder, shape, pairs in SHAPED:
        if not folder.exists():
            print('略過（找不到）：', folder)
            continue
        for f, pair in zip(sorted(folder.glob('*.png')), pairs):
            im = rounded_card(f, 1000)
            name = f'back{shape}-{pair}.webp'
            im.save(OUT / name, 'WEBP', quality=90, method=6)
            kind = 'back-l' if shape == 'l' else 'back-s'
            label = DESIGN[pair] + ('（橫）' if shape == 'l' else '（方）')
            items.append({'id': f'back{shape}-{pair}', 'file': f'assets/deco/{name}', 'kind': kind, 'shape': shape, 'pair': f'back-{pair}', 'name': label, 'w': im.width, 'h': im.height})
            print(name, im.size)
    (OUT / 'deco.json').write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'共 {len(items)} 件')


if __name__ == '__main__':
    main()
