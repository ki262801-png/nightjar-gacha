"""把「功能介紹與玩法.html」包成網站上的獨立頁面 web/guide.html
修改介紹內容後重跑一次：python tools/make_guide.py，再照平常部署"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / '功能介紹與玩法.html').read_text(encoding='utf-8')

# 標題、說明
title_end = src.index('</title>') + len('</title>')
title, body = src[:title_end], src[title_end:]

# 開頭加「開始玩」按鈕、結尾加回網站的連結
body = body.replace(
    '<span class="pill">電腦、手機都能玩</span>\n      </div>',
    '<span class="pill">電腦、手機都能玩</span>\n      </div>\n'
    '      <div class="cta"><a class="go" href="./">開始玩</a><a class="go ghost" href="./#gacha">直接去召喚</a></div>', 1)
body = body.replace(
    '<footer>夜航卡舍 · Nightjar Arcana',
    '<footer><a href="./">回到夜航卡舍</a>　｜　夜航卡舍 · Nightjar Arcana', 1)
# 沒有選過語言時，跟著網站本身的繁 / 簡設定
body = body.replace(
    "  if (!start) { try { start = localStorage.getItem('nj-guide-lang'); } catch (e) {} }",
    "  if (!start) { try { start = localStorage.getItem('nj-guide-lang') || localStorage.getItem('nightjar-lang'); } catch (e) {} }", 1)

import re
icon = re.search(r'<link rel="icon"[^>]*>', (ROOT / 'web' / 'index.html').read_text(encoding='utf-8')).group(0)   # 跟網站同一個圖示

extra_css = """<style>
body { margin: 0; }
img { max-width: 100%; }
[hidden] { display: none !important; }
:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
.cta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
.go { display: inline-flex; align-items: center; padding: 10px 22px; border-radius: 99px; background: var(--gold); color: var(--paper); font-weight: 700; text-decoration: none; font-size: 15px; }
.go.ghost { background: none; color: var(--gold); border: 1px solid var(--gold); }
.go:hover { filter: brightness(1.08); }
.go:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
footer a { color: var(--gold); }
</style>"""

page = f"""<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="夜航卡舍：用自己的 NovelAI 帳號玩 AI 抽卡，收藏卡冊、做 LIVE 動態卡與 3D 閃卡。功能介紹與玩法。">
{icon}
{title}
{extra_css}
</head>
<body>
{body.strip()}
</body>
</html>
"""
out = ROOT / 'web' / 'guide.html'
out.write_text(page, encoding='utf-8')
print('wrote', out.name, len(page.encode('utf-8')), 'bytes')
