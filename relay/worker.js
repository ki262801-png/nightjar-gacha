// 夜航卡舍 · NovelAI 中繼（Cloudflare Worker）
// 只做一件事：把線上版網頁送來的請求原封不動轉給 NovelAI，再把結果原封不動傳回去。
// - 只允許三個 NovelAI 位址（生圖、Vibe 編碼、查詢訂閱），其他一律拒絕
// - 不儲存、不記錄任何東西（沒有資料庫、沒有 console.log）；Token 只在轉送時經過
// - ALLOWED_ORIGINS 設成你的網站網址，就只有你的網站能使用這個中繼（多個用逗號分隔；* = 不限制）

const ROUTES = {
  '/ai/generate-image': 'https://image.novelai.net',
  '/ai/encode-vibe': 'https://image.novelai.net',
  '/user/subscription': 'https://api.novelai.net',
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
    const originOk = allowed.includes('*') || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk ? (origin || '*') : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!originOk) return new Response(JSON.stringify({ error: '這個中繼只開放給指定的網站使用' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });

    const url = new URL(request.url);
    const upstream = ROUTES[url.pathname];
    if (!upstream) return new Response(JSON.stringify({ error: '不支援的位址' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });

    const headers = new Headers({ 'User-Agent': 'NightjarGacha/1.0' });
    for (const h of ['Authorization', 'Content-Type', 'Accept']) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    let res;
    try {
      res = await fetch(upstream + url.pathname, {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      });
    } catch {
      return new Response(JSON.stringify({ error: '中繼連不到 NovelAI，請稍後再試' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const out = new Headers(cors);
    out.set('Content-Type', res.headers.get('Content-Type') || 'application/octet-stream');
    out.set('Cache-Control', 'no-store');
    return new Response(res.body, { status: res.status, headers: out });
  },
};
