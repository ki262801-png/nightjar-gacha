// 執行環境：本機版（有 server.py）或線上版（靜態網站 + Cloudflare 中繼）
// 本機版：NovelAI 經由本機伺服器轉送，See-through 等本機功能可用
// 線上版：NovelAI 經由 config.js 設定的中繼網址轉送，本機功能自動隱藏
let probe = null;

/** 本機伺服器的版本資訊；不是本機版（或伺服器沒開）就是 null */
export function localServer() {
  probe ??= fetch('/api/version', { cache: 'no-store' })
    .then(r => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null))
    .catch(() => null);
  return probe;
}

/** config.js 裡設定的 NovelAI 中繼網址（線上版才有） */
export const relayURL = () => String(window.NJ_CONFIG?.relay || '').trim().replace(/\/+$/, '');

/** NovelAI 要走哪條路：local / relay / none */
export async function naiRoute() {
  if (await localServer()) return 'local';
  return relayURL() ? 'relay' : 'none';
}

/** 是否為線上版（沒有本機伺服器、但有設定中繼） */
export async function isOnline() { return (await naiRoute()) === 'relay'; }
