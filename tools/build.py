"""打包工具：同一份程式產出兩種版本，原本的資料夾完全不動。

  python tools/build.py online --relay https://nightjar-relay.xxx.workers.dev --notes "新增分享參數"
      → dist/online/       上傳到 Cloudflare Pages 的線上版（自動寫入中繼網址、版本號、快取設定）

  python tools/build.py local
      → dist/夜航卡舍_本機版_日期.zip   可以直接傳給朋友的本機版（解壓後雙擊「啟動抽卡模擬器.cmd」）

  python tools/build.py all --relay ...      兩個都做

  python tools/build.py publish --notes "這次更新了什麼"
      → 打包線上版並直接上傳到 Cloudflare Pages（需要 Node.js，第一次要先 npx wrangler login）

中繼網址第一次填過之後會記在 tools/deploy.json，之後可以省略 --relay。
"""
import argparse
import json
import shutil
import subprocess
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
DIST = ROOT / 'dist'
SAVED = ROOT / 'tools' / 'deploy.json'

# 打包時略過的東西：測試檔、拆層工作暫存、打包結果本身
SKIP_NAMES = {'__pycache__', 'st_jobs', 'dist', 'deploy.json', '.DS_Store', 'Thumbs.db'}


def skip(path: Path) -> bool:
    return path.name in SKIP_NAMES or path.name.startswith('_')


def copy_tree(src: Path, dst: Path):
    for p in src.rglob('*'):
        rel = p.relative_to(src)
        if any(skip(Path(part)) for part in rel.parts):
            continue
        out = dst / rel
        if p.is_dir():
            out.mkdir(parents=True, exist_ok=True)
        else:
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, out)


def build_online(relay: str, notes: str):
    # 預設用網站自己的 /relay（Pages Functions，和網站同網址）；也可以指定獨立的 Worker 中繼網址
    relay = relay or '/relay'
    out = DIST / 'online'
    if out.exists():
        shutil.rmtree(out)
    copy_tree(WEB, out)
    # Pages Functions：wrangler 會在執行目錄找 functions/，所以放在 dist/functions（和 dist/online 並排）
    fn = DIST / 'functions'
    if fn.exists():
        shutil.rmtree(fn)
    shutil.copytree(ROOT / 'relay' / 'functions', fn)
    (out / 'config.js').write_text(
        '// 線上版設定（由 tools/build.py 產生）\nwindow.NJ_CONFIG = {\n  relay: ' + json.dumps(relay.rstrip('/')) + ',\n};\n', encoding='utf-8')
    version = time.strftime('%Y%m%d-%H%M%S')
    (out / 'version.json').write_text(json.dumps({'version': version, 'notes': notes}, ensure_ascii=False), encoding='utf-8')
    # Cloudflare Pages 的快取規則：程式與樣式每次都向伺服器確認有沒有新版（沒變就用快取，很快）；素材圖可以快取一週
    (out / '_headers').write_text(
        '/*\n  Cache-Control: no-cache\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n'
        '/assets/*\n  Cache-Control: public, max-age=604800\n', encoding='utf-8')
    count = sum(1 for p in out.rglob('*') if p.is_file())
    print(f'線上版完成：{out}（{count} 個檔案，版本 {version}）')
    print('下一步：把這個資料夾上傳到 Cloudflare Pages（見 部署說明.md）')


def build_local():
    DIST.mkdir(exist_ok=True)
    name = f'夜航卡舍_本機版_{time.strftime("%Y%m%d")}.zip'
    target = DIST / name
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in ROOT.rglob('*'):
            rel = p.relative_to(ROOT)
            if any(skip(Path(part)) for part in rel.parts) or rel.parts[0] == 'relay' or p.is_dir():
                continue
            z.write(p, Path('夜航卡舍') / rel)
    print(f'本機版完成：{target}（{target.stat().st_size / 1048576:.1f} MB）')
    print('朋友解壓後，雙擊「夜航卡舍/啟動抽卡模擬器.cmd」即可（需要 Python 3；See-through 需另外安裝）')


def publish(project: str):
    """用 wrangler 把 dist/online 上傳到 Cloudflare Pages"""
    out = DIST / 'online'
    cmd = f'npx --yes wrangler@4 pages deploy online --project-name {project} --branch main --commit-dirty=true'
    print('上傳中：', cmd)
    r = subprocess.run(cmd, shell=True, cwd=DIST)   # 在 dist 執行，wrangler 才會一起部署 dist/functions 裡的中繼
    if r.returncode:
        raise SystemExit('上傳失敗：確認已經 npx wrangler login，以及專案名稱正確')
    print(f'完成！網址：https://{project}.pages.dev（已開著網頁的玩家會看到「有新版本」提示）')


def main():
    ap = argparse.ArgumentParser(description='夜航卡舍打包工具')
    ap.add_argument('what', choices=['online', 'local', 'all', 'publish'])
    ap.add_argument('--project', default='', help='Cloudflare Pages 專案名稱（第一次之後會記住）')
    ap.add_argument('--relay', default='', help='Cloudflare Worker 中繼網址')
    ap.add_argument('--notes', default='', help='這次更新的簡短說明（會顯示在「有新版本」提示上）')
    a = ap.parse_args()
    saved = json.loads(SAVED.read_text(encoding='utf-8')) if SAVED.exists() else {}
    relay = a.relay or saved.get('relay', '')
    project = a.project or saved.get('project', 'nightjar-gacha')
    if a.relay or a.project:
        SAVED.write_text(json.dumps({**saved, 'relay': relay, 'project': project}, ensure_ascii=False, indent=1), encoding='utf-8')
    if a.what in ('online', 'all', 'publish'):
        build_online(relay, a.notes)
    if a.what == 'publish':
        publish(project)
    if a.what in ('local', 'all'):
        build_local()


if __name__ == '__main__':
    main()
