// 夜航卡舍 · NovelAI 中繼（Cloudflare Pages Functions 版：和網站同一個網址，例如 https://nightjar-gacha.pages.dev/relay/ai/generate-image）
// 規則和 relay/worker.js 一樣：
// - 只允許三個 NovelAI 位址（生圖、Vibe 編碼、查詢訂閱），其他一律拒絕
// - 只接受來自同一個網站的請求（別的網站不能借用）
// - 不儲存、不記錄任何東西；Token 只在轉送時經過
// 由 tools/build.py 複製到 dist/functions，跟著網站一起部署

const ROUTES = {
  '/ai/generate-image': 'https://image.novelai.net',
  '/ai/encode-vibe': 'https://image.novelai.net',
  '/user/subscription': 'https://api.novelai.net',
};
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  // 瀏覽器從別的網站發來的請求會帶上那個網站的 Origin；同網站的 GET 有時不帶 Origin，也放行
  if (origin && origin !== url.origin) return json(403, { error: '這個中繼只開放給本網站使用' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  const path = url.pathname.replace(/^\/relay/, '');
  const upstream = ROUTES[path];
  if (!upstream) return json(404, { error: '不支援的位址' });

  const headers = new Headers({ 'User-Agent': 'NightjarGacha/1.0' });
  for (const h of ['Authorization', 'Content-Type', 'Accept']) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  let res;
  try {
    res = await fetch(upstream + path, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });
  } catch {
    return json(502, { error: '中繼連不到 NovelAI，請稍後再試' });
  }
  const out = new Headers({ 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': 'no-store' });
  return new Response(res.body, { status: res.status, headers: out });
}
