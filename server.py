"""夜航卡舍 · 抽卡模擬器 — 本機伺服器

只做兩件事：
1. 提供 web/ 內的前端檔案。
2. 把前端的 NovelAI 請求轉發到官方 API（瀏覽器直接呼叫會被 CORS 擋下）。

Token 只放在每次請求的標頭裡經過，本伺服器不寫檔、不記錄。
只監聽 127.0.0.1，不對外開放。只用 Python 標準函式庫。
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import base64, copy, io, json, os, re, shutil, socket, ssl, subprocess, sys, threading, time, urllib.error, urllib.parse, urllib.request, uuid, webbrowser, zipfile

WEB = Path(__file__).resolve().parent / 'web'
NAI_IMAGE = 'https://image.novelai.net'
NAI_API = 'https://api.novelai.net'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8765
MAX_BODY = 80 * 1024 * 1024
SERVER_VERSION = 3  # 前端會檢查；舊伺服器要重開才有新 API
# See-through（D:\see-through）本機圖層拆分；可用環境變數 SEETHROUGH_ROOT 改路徑
ST_ROOT = Path(os.environ.get('SEETHROUGH_ROOT', r'D:\see-through'))
ST_PY = ST_ROOT / '.venv' / 'python.exe'
ST_JOBS = Path(__file__).resolve().parent / 'st_jobs'
st_jobs, st_lock = {}, threading.Lock()

STATUS_TEXT = {
    400: '參數被 NovelAI 拒絕',
    401: 'Token 無效或已過期',
    402: 'Anlas 不足或訂閱方案不支援此設定',
    403: '請求被 NovelAI 拒絕',
    409: '帳號已有其他生成進行中，請稍候',
    429: '請求太頻繁，請稍後再手動重試',
    500: 'NovelAI 伺服器錯誤',
    503: 'NovelAI 暫時無法服務',
}


def network_error(error):
    reason = getattr(error, 'reason', error)
    if isinstance(reason, ssl.SSLError):
        return 'HTTPS 憑證驗證失敗：請檢查系統時間或代理設定'
    if isinstance(reason, (TimeoutError, socket.timeout)):
        return '連線 NovelAI 逾時，結果未知；請先到官網確認再決定是否重抽'
    if isinstance(reason, socket.gaierror):
        return '無法解析 NovelAI 網域，請檢查網路或 DNS'
    if isinstance(reason, ConnectionRefusedError):
        return '連線被拒絕，請檢查網路或代理'
    return '無法連線到 NovelAI，請檢查網路或代理設定'


def multipart(payload):
    """V5 模型改用 multipart：圖片欄位以檔案上傳，其餘放在 request JSON。"""
    body = copy.deepcopy(payload)
    boundary = 'Nightjar' + uuid.uuid4().hex
    parts = []

    def part(name, data, mime):
        head = (f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="blob"\r\n'
                f'Content-Type: {mime}\r\n\r\n').encode()
        parts.append(head + data + b'\r\n')

    for key in ['image', 'mask']:
        if body['parameters'].get(key):
            part(key, base64.b64decode(body['parameters'][key]), 'image/png')
            body['parameters'][key] = key
    part('request', json.dumps(body).encode('utf-8'), 'application/json')
    return b''.join(parts) + f'--{boundary}--\r\n'.encode(), 'multipart/form-data; boundary=' + boundary


def nai_request(url, token, payload=None, accept='application/json', method='POST'):
    headers = {'Authorization': 'Bearer ' + token, 'Accept': accept, 'User-Agent': 'NightjarGacha/1.0'}
    data = None
    if payload is not None:
        if url.endswith('/ai/generate-image') and str(payload.get('model', '')).startswith('nai-diffusion-5'):
            data, ctype = multipart(payload)
        else:
            data, ctype = json.dumps(payload).encode('utf-8'), 'application/json'
        headers['Content-Type'] = ctype
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=300) as resp:
        return resp.read(96 * 1024 * 1024)


def custom_base(value):
    """自訂 API 位址（設定頁的「自訂 API 位址」）：只接受 https，或本機的 http；去掉結尾的 / 與 NovelAI 路徑"""
    v = (value or '').strip().rstrip('/')
    for tail in ('/ai/generate-image', '/ai/encode-vibe', '/user/subscription'):
        if v.endswith(tail):
            v = v[: -len(tail)]
    u = urllib.parse.urlparse(v)
    local = u.hostname in ('localhost', '127.0.0.1', '::1')
    if not u.hostname or (u.scheme != 'https' and not (u.scheme == 'http' and local)) or u.query or u.fragment:
        raise ValueError('自訂 API 位址格式不正確：請填 https:// 開頭的網址')
    return v


def extract_png(raw):
    if raw.startswith(b'PK'):
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            names = [i for i in archive.infolist() if i.filename.lower().endswith('.png')]
            if not names:
                raise ValueError('NovelAI 沒有回傳 PNG 圖片')
            return archive.read(names[0])
    if raw.startswith(b'\x89PNG'):
        return raw
    body = json.loads(raw)
    return base64.b64decode(body['images'][0]['image'])


def st_available():
    return (ST_ROOT / 'run_local.py').exists() and ST_PY.exists()


def st_env():
    env = os.environ.copy()
    env.update(HF_HOME=str(ST_ROOT / '.cache' / 'huggingface'), TORCH_HOME=str(ST_ROOT / '.cache' / 'torch'),
               PYTHONUTF8='1', PYTHONUNBUFFERED='1', HF_HUB_OFFLINE='1', HF_HUB_DISABLE_PROGRESS_BARS='1')
    env['PATH'] = str(ST_ROOT / '.venv') + os.pathsep + str(ST_ROOT / '.venv' / 'Library' / 'bin') + os.pathsep + env.get('PATH', '')
    return env


def st_worker(job):
    """背景執行 See-through，再用它的 venv 跑後處理。一次只跑一個（共用顯卡）。"""
    jd = job['dir']
    out = jd / 'out'
    cmd = [str(ST_PY), '-u', str(ST_ROOT / 'run_local.py'), '--srcp', str(jd / 'input.png'), '--save_dir', str(out),
           '--resolution', str(job['resolution']), '--resolution_depth', '768', '--no_group_offload']
    for flag, sub in [('--repo_id_layerdiff', 'layerdiff-nf4'), ('--repo_id_depth', 'marigold-nf4')]:
        if (ST_ROOT / 'models' / sub).exists():
            cmd += [flag, str(ST_ROOT / 'models' / sub)]
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    try:
        with st_lock:
            job['status'] = 'running'
            job['proc'] = subprocess.Popen(cmd, cwd=ST_ROOT, env=st_env(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                           text=True, encoding='utf-8', errors='replace', creationflags=flags)
            for line in job['proc'].stdout:
                line = line.strip()
                if line:
                    job['log'].append(line[-300:])
                    del job['log'][:-40]
            code = job['proc'].wait()
            if job.get('cancelled'):
                raise RuntimeError('已取消')
            if code != 0:
                raise RuntimeError(f'See-through 結束代碼 {code}；常見原因是顯示記憶體不足，可改用 768 解析度再試')
            job['log'].append('整理圖層中…')
            post = subprocess.run([str(ST_PY), str(Path(__file__).resolve().parent / 'seethrough_post.py'), str(out), str(jd), str(job['resolution'])],
                                  env=st_env(), capture_output=True, text=True, encoding='utf-8', errors='replace', creationflags=flags)
            if post.returncode != 0:
                raise RuntimeError('圖層整理失敗：' + (post.stderr or post.stdout).strip()[-300:])
            job['status'] = 'done'
            job['log'].append(post.stdout.strip())
    except Exception as error:
        job['status'] = 'error'
        job['error'] = str(error)
    finally:
        job['proc'] = None
        job['ended'] = time.time()


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css',
        '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm',
        '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        # 只記錄路徑與狀態，不記錄標頭（Token 在標頭裡）
        sys.stdout.write('[%s] %s\n' % (self.log_date_time_string(), fmt % args))

    def send_json(self, status, obj):
        raw = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def send_bytes(self, raw, ctype):
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path, _, query = self.path.partition('?')
        if path == '/api/version':
            return self.send_json(200, {'version': SERVER_VERSION, 'seethrough': st_available(), 'seethroughRoot': str(ST_ROOT)})
        if path.startswith('/api/seethrough/'):
            q = {k: v[0] for k, v in urllib.parse.parse_qs(query).items()}
            try:
                return self.seethrough_get(path, q)
            except (KeyError, ValueError, OSError) as error:
                return self.send_json(404, {'error': str(error) or '找不到任務'})
        return super().do_GET()

    def seethrough_get(self, path, q):
        if path == '/api/seethrough/status':
            busy = any(j['status'] in ('queued', 'running') for j in st_jobs.values())
            return self.send_json(200, {'available': st_available(), 'root': str(ST_ROOT), 'busy': busy})
        job = st_jobs[q.get('id', '')]
        if path == '/api/seethrough/job':
            info = {'status': job['status'], 'log': job['log'][-6:], 'error': job.get('error'),
                    'elapsed': round((job.get('ended') or time.time()) - job['started'])}
            if job['status'] == 'done':
                info['result'] = json.loads((job['dir'] / 'layers.json').read_text(encoding='utf-8'))
            return self.send_json(200, info)
        if path == '/api/seethrough/file':
            name = q.get('name', '')
            if not re.fullmatch(r'[\w\-. ]+\.png', name):
                raise ValueError('檔名不合法')
            f = job['dir'] / 'depth.png' if name == 'depth.png' else job['dir'] / 'layers' / name
            return self.send_bytes(f.read_bytes(), 'image/png')
        raise KeyError('找不到此 API')

    def seethrough_post(self, path):
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_BODY:
            return self.send_json(413, {'error': '圖片太大'})
        body = json.loads(self.rfile.read(length) or b'{}')
        if path == '/api/seethrough/cancel':
            job = st_jobs.get(body.get('id', ''))
            if job and job.get('proc'):
                job['cancelled'] = True
                job['proc'].kill()
            return self.send_json(200, {'ok': True})
        if not st_available():
            return self.send_json(400, {'error': f'找不到 See-through（{ST_ROOT}）。請確認已安裝，或設定環境變數 SEETHROUGH_ROOT'})
        if any(j['status'] in ('queued', 'running') for j in st_jobs.values()):
            return self.send_json(409, {'error': '已有一個拆層任務在進行中，請等它完成'})
        raw = base64.b64decode(body['image'])
        res = int(body.get('resolution', 1024))
        if res not in (768, 1024, 1280):
            res = 1024
        jid = uuid.uuid4().hex[:12]
        jd = ST_JOBS / jid
        jd.mkdir(parents=True, exist_ok=True)
        (jd / 'input.png').write_bytes(raw)
        # 只保留最近 6 個任務的檔案
        old = sorted((p for p in ST_JOBS.iterdir() if p.is_dir() and p.name != jid), key=lambda p: p.stat().st_mtime)[:-5]
        for p in old:
            shutil.rmtree(p, ignore_errors=True)
            st_jobs.pop(p.name, None)
        job = {'id': jid, 'dir': jd, 'status': 'queued', 'log': ['準備中…首次載入模型需要一點時間'], 'resolution': res, 'started': time.time()}
        st_jobs[jid] = job
        threading.Thread(target=st_worker, args=(job,), daemon=True).start()
        return self.send_json(200, {'id': jid})

    def do_POST(self):
        path = self.path.split('?')[0]
        if path in ('/api/seethrough/run', '/api/seethrough/cancel'):
            try:
                return self.seethrough_post(path)
            except (KeyError, ValueError, json.JSONDecodeError) as error:
                return self.send_json(400, {'error': str(error) or '請求格式錯誤'})
        routes = {'/api/nai/generate': self.generate, '/api/nai/encode-vibe': self.encode_vibe,
                  '/api/nai/subscription': self.subscription}
        if path not in routes:
            return self.send_json(404, {'error': '找不到此 API'})
        token = self.headers.get('X-NAI-Token', '').strip()
        if not token:
            return self.send_json(400, {'error': '請先在「設定」輸入 NovelAI Persistent API Token'})
        # 自訂 API 位址：只接受這個網頁自己發出的請求（別的網站不能借本機伺服器當代理）
        self.up_image, self.up_api = NAI_IMAGE, NAI_API
        if self.headers.get('X-NJ-Upstream-Image'):
            origin = self.headers.get('Origin', '')
            if origin and origin not in (f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}'):
                return self.send_json(403, {'error': '只接受本機網頁的請求'})
            try:
                self.up_image = custom_base(self.headers.get('X-NJ-Upstream-Image'))
                self.up_api = custom_base(self.headers.get('X-NJ-Upstream-Api') or self.up_image)
            except ValueError as error:
                return self.send_json(400, {'error': str(error)})
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_BODY:
            return self.send_json(413, {'error': '請求太大（參考圖可能過大）'})
        try:
            body = json.loads(self.rfile.read(length) or b'{}')
            routes[path](token, body)
        except urllib.error.HTTPError as error:
            detail = ''
            try:
                info = json.loads(error.read(65536) or b'{}')
                detail = str(info.get('message') or info.get('error') or '')[:300]
            except Exception:
                pass
            text = STATUS_TEXT.get(error.code, 'NovelAI 回傳錯誤')
            self.send_json(error.code if 400 <= error.code < 600 else 502,
                           {'error': f'{text}（HTTP {error.code}）' + (f'：{detail}' if detail else ''), 'status': error.code})
        except (TimeoutError, urllib.error.URLError, OSError) as error:
            self.send_json(502, {'error': network_error(error)})
        except (ValueError, KeyError, json.JSONDecodeError) as error:
            self.send_json(400, {'error': str(error) or '請求格式錯誤'})

    def generate(self, token, payload):
        raw = nai_request(self.up_image + '/ai/generate-image', token, payload, accept='application/zip')
        self.send_bytes(extract_png(raw), 'image/png')

    def encode_vibe(self, token, payload):
        raw = nai_request(self.up_image + '/ai/encode-vibe', token, payload, accept='application/octet-stream')
        self.send_bytes(raw, 'application/octet-stream')

    def subscription(self, token, _body):
        raw = nai_request(self.up_api + '/user/subscription', token, None, method='GET')
        self.send_bytes(raw, 'application/json')


def main():
    try:
        server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError:
        print(f'連接埠 {PORT} 已被佔用：可能是舊的抽卡模擬器伺服器還開著。')
        print('請先關掉舊的黑色伺服器視窗（或在工作管理員結束 python.exe），再重新開啟本程式。')
        input('按 Enter 關閉…')
        return
    url = f'http://127.0.0.1:{PORT}/'
    print(f'夜航卡舍 · 抽卡模擬器已啟動：{url}')
    print('關閉此視窗即可停止。')
    if '--no-browser' not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
