"""See-through 輸出後處理（用 See-through 自己的 .venv 執行，需要 numpy / Pillow）

把 See-through 的正方形畫布圖層裁回原圖比例，算出每層的深度中位數，
再用畫家演算法合成一張「越亮越近」的深度圖，輸出 layers.json 給前端。

用法：python seethrough_post.py <see-through 輸出資料夾> <任務資料夾> <解析度>
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

TAGS = ['front hair', 'back hair', 'headwear', 'face', 'eyebrow', 'eyelash', 'irides', 'eyewhite', 'eyewear', 'ears', 'earwear',
        'nose', 'mouth', 'neck', 'neckwear', 'topwear', 'handwear', 'bottomwear', 'legwear', 'footwear', 'tail', 'wings', 'objects']


def main():
    out_dir, job_dir, res = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])
    src = next((p.parent for p in out_dir.rglob('src_img.png')), None)
    if src is None:
        raise SystemExit('找不到 See-through 輸出（src_img.png）')
    w, h = Image.open(job_dir / 'input.png').size
    sz = max(w, h)
    px1, py1 = (sz - w) // 2, (sz - h) // 2
    k = res / sz
    box = (round(px1 * k), round(py1 * k), round((px1 + w) * k), round((py1 + h) * k))
    s = min(1.0, 1024 / max(w, h))
    tw, th = max(1, round(w * s)), max(1, round(h * s))
    layers_dir = job_dir / 'layers'
    layers_dir.mkdir(exist_ok=True)
    layers = []
    for i, tag in enumerate(TAGS):
        p = src / f'{tag}.png'
        if not p.exists():
            continue
        im = Image.open(p).convert('RGBA').crop(box).resize((tw, th), Image.Resampling.LANCZOS)
        a = np.asarray(im)[..., 3].astype(np.float32) / 255
        area = float((a > .5).mean())
        if area < .0004:
            continue
        dp = src / f'{tag}_depth.png'
        depth = .5
        dmap = None
        if dp.exists():
            dmap = np.asarray(Image.open(dp).convert('L').crop(box).resize((tw, th), Image.Resampling.BILINEAR)).astype(np.float32) / 255
            sel = dmap[a > .5]
            if sel.size:
                depth = float(np.median(sel))
        ys, xs = np.nonzero(a > .5)
        fname = f'{i:02d}_{tag.replace(" ", "_")}.png'
        im.save(layers_dir / fname)
        layers.append({'tag': tag, 'file': fname, 'depth': depth, 'area': area,
                       'bbox': [float(xs.min() / tw), float(ys.min() / th), float(xs.max() / tw), float(ys.max() / th)],
                       '_a': a, '_d': dmap})
    if not layers:
        raise SystemExit('See-through 沒有拆出任何圖層')
    # 畫家演算法：由遠（depth 大）畫到近，得到每個像素可見那一層的深度
    canvas = np.ones((th, tw), np.float32)
    for L in sorted(layers, key=lambda L: -L['depth']):
        d = L['_d'] if L['_d'] is not None else np.full((th, tw), L['depth'], np.float32)
        m = L['_a'] > .5
        canvas[m] = np.clip(d[m], 0, 1)
    near = Image.fromarray(((1 - canvas) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    near.save(job_dir / 'depth.png')
    for L in layers:
        L.pop('_a'); L.pop('_d')
    (job_dir / 'layers.json').write_text(json.dumps({'width': tw, 'height': th, 'layers': layers}, ensure_ascii=False), encoding='utf-8')
    print(f'完成：{len(layers)} 個圖層')


if __name__ == '__main__':
    main()
