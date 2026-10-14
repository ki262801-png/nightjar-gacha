import json, glob
zh = {}
for f in sorted(glob.glob('zh*.txt')):
    for line in open(f, encoding='utf-8'):
        line = line.rstrip('\n')
        if not line: continue
        if line.endswith('=-'): zh[line[:-2]] = '-'; continue
        k, v = ('=_=', line[4:]) if line.startswith('=_==') else line.split('=', 1)
        zh[k] = v
cats = json.load(open('cats.json', encoding='utf-8'))
G = [
 ('people', '人物', '♛', [('count', '人數'), ('race', '種族・異種'), ('job', '職業身分'), ('skin', '膚色'), ('ears', '獸耳・耳朵'), ('wings', '翅膀')]),
 ('hair', '頭髮', '✿', [('hairlen', '髮長'), ('hairstyle', '髮型・綁法'), ('bangs', '瀏海・鬢髮'), ('hairtex', '髮質・捲度'), ('haircolor', '髮色')]),
 ('face', '臉部', '◉', [('eyecolor', '瞳色'), ('eyestyle', '眼型・瞳孔'), ('expr', '表情'), ('emote', '漫畫符號・嘴型'), ('gaze', '視線'), ('makeup', '妝容')]),
 ('wear', '服裝', '👗', [('top', '上衣・外套'), ('bottom', '裙子・褲子'), ('uniform', '制服・角色服'), ('traditional', '傳統服飾'), ('swim', '泳裝・連身服'), ('fashion', '時尚風格'), ('sleeves', '袖子'), ('legwear', '襪子・腿部'), ('shoes', '鞋子'), ('print', '服裝印花')]),
 ('acc', '配件', '💍', [('headwear', '帽子・頭飾'), ('neckwear', '領口・頸飾'), ('jewelry', '飾品・小配件'), ('clothmisc', '耳飾・手部・細節'), ('gloves', '手套'), ('eyewear', '眼鏡'), ('armor', '鎧甲')]),
 ('act', '動作', '✋', [('pose', '姿勢'), ('arms', '手臂動作'), ('gesture', '手勢'), ('duo', '雙人互動'), ('action', '動作行為'), ('holding', '手持物品'), ('holdweapon', '手持武器')]),
 ('camera', '鏡頭構圖', '🎥', [('angle', '視角'), ('framing', '取景範圍'), ('composition', '構圖・焦點'), ('format', '作品形式'), ('subject', '題材')]),
 ('scene', '場景', '🏰', [('bg', '背景類型'), ('indoor', '室內'), ('building', '建築・城市'), ('nature', '自然地形'), ('weather', '天空・天氣・季節'), ('holiday', '節慶活動')]),
 ('light', '光影色彩', '◐', [('light', '光線・時間'), ('color', '色調'), ('fire', '火焰・燈火')]),
 ('style', '畫風', '🎨', [('artstyle', '畫風・效果'), ('pattern', '傳統紋樣')]),
 ('item', '物品', '⚔', [('weapon', '冷兵器'), ('gun', '槍砲'), ('tech', '科技・載具'), ('symbol', '符號'), ('drink', '飲品・餐具')]),
 ('food', '食物', '🍰', [('fruit', '蔬菜水果'), ('meal', '料理'), ('sweets', '甜點零食')]),
 ('life', '動植物', '🐾', [('animal', '動物'), ('flower', '花卉'), ('plant', '植物')]),
]
used = set(); out = []; total = 0
for gid, gname, icon, cl in G:
    gc = []
    for cid, cname in cl:
        rows = [(t, zh[t], n) for t, n in cats.get(cid, []) if zh.get(t, '-') != '-' and t not in used]
        used.update(t for t, _, _ in rows); total += len(rows)
        gc.append({'id': cid, 'name': cname, 'tags': [[t.replace('_', ' ') if len(t) > 3 else t, z, n] for t, z, n in rows]})
    out.append({'id': gid, 'name': gname, 'icon': icon, 'cats': gc})
missing = set(cats) - {c for _, _, _, cl in G for c, _ in cl}
print('total', total, 'unused cats', missing)
json.dump(out, open('tags_final.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
import os; print(os.path.getsize('tags_final.json'))
