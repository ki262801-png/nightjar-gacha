// 共用小工具：DOM、圖片、提示、對話框、星光粒子
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 圖片 ----------
const urlCache = new Map();
/** 為 Blob 取得可重用的 object URL（以 key 快取，避免記憶體外洩） */
export function blobURL(key, blob) {
  if (!blob) return '';
  const hit = urlCache.get(key);
  if (hit && hit.blob === blob) return hit.url;
  if (hit) URL.revokeObjectURL(hit.url);
  const url = URL.createObjectURL(blob);
  urlCache.set(key, { blob, url });
  return url;
}
export function dropURL(key) {
  const hit = urlCache.get(key);
  if (hit) { URL.revokeObjectURL(hit.url); urlCache.delete(key); }
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('圖片載入失敗'));
    img.src = src instanceof Blob ? URL.createObjectURL(src) : src;
  });
}

export const canvasToBlob = (canvas, type = 'image/png', q) => new Promise(r => canvas.toBlob(r, type, q));

export async function makeThumb(blob, max = 480) {
  const img = await loadImage(blob);
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  // 偵測透明背景（V5 透明素材）
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] < 200) clear++;
  return { blob: await canvasToBlob(c, 'image/webp', .86), width: img.naturalWidth, height: img.naturalHeight, alpha: clear > d.length / 16 * .02 };
}

export const blobToDataURL = blob => new Promise((res, rej) => {
  const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob);
});
export const dataURLToBase64 = d => d.slice(d.indexOf(',') + 1);
export function bytesToBase64(buf) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** 讀圖並重新編碼成指定尺寸的 PNG base64（cover 裁切），NovelAI 圖生圖用 */
export async function imageToPngBase64(src, w, h, mode = 'cover', fill = '#000') {
  const img = await loadImage(src);
  if (!w || !h) { // 0 = 原尺寸（長邊上限 1536）
    const s = Math.min(1, 1536 / Math.max(img.naturalWidth, img.naturalHeight));
    w = Math.round(img.naturalWidth * s); h = Math.round(img.naturalHeight * s);
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const s = mode === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  if (mode !== 'cover') { g.fillStyle = fill; g.fillRect(0, 0, w, h); }
  g.drawImage(img, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
  return dataURLToBase64(c.toDataURL('image/png'));
}

export async function sha1(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function pickFiles(accept = 'image/*', multiple = false) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.multiple = multiple;
    input.onchange = () => resolve([...input.files]);
    input.click();
  });
}

// ---------- 提示 ----------
export function toast(msg, kind = 'info', ms = 3200) {
  const root = document.getElementById('toast-root');
  const el = h(`<div class="toast toast-${kind}" role="status"><span class="toast-dot"></span><span></span></div>`);
  el.lastChild.textContent = msg;
  root.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); el.addEventListener('transitionend', () => el.remove(), { once: true }); }, ms);
}

/** 在畫面座標 (x,y) 迸出星光 */
export function sparkle(x, y, { count = 14, color = 'var(--gold)', spread = 70 } = {}) {
  if (reducedMotion()) return;
  const layer = document.getElementById('fx-root');
  for (let i = 0; i < count; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    const a = Math.random() * Math.PI * 2, d = spread * (.4 + Math.random() * .8);
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--c:${color};--s:${.5 + Math.random()}`;
    s.style.animationDelay = Math.random() * 80 + 'ms';
    layer.append(s);
    s.addEventListener('animationend', () => s.remove());
  }
}

// ---------- 對話框 ----------
export function modal({ title = '', body = '', actions = [], wide = false, cls = '', onOpen, closeButton = false } = {}) {
  return new Promise(resolve => {
    const root = document.getElementById('overlay-root');
    const el = h(`<div class="modal-wrap ${cls}"><div class="modal-backdrop"></div>
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        ${title ? `<header class="modal-head"><h3>${title}</h3><button class="icon-btn ghost modal-x" aria-label="關閉">${ICON.x}</button></header>` : closeButton ? `<button class="icon-btn modal-x floating" aria-label="關閉（Esc）" title="關閉（Esc）">${ICON.x}</button>` : ''}
        <div class="modal-body"></div>
        ${actions.length ? '<footer class="modal-foot"></footer>' : ''}
      </div></div>`);
    const bodyEl = el.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
    const close = v => {
      el.classList.remove('in');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => el.remove(), 260);
      resolve(v);
    };
    const onKey = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    el.querySelector('.modal-backdrop').onclick = () => close(null);
    el.querySelector('.modal-x')?.addEventListener('click', () => close(null));
    const foot = el.querySelector('.modal-foot');
    actions.forEach(a => {
      const b = h(`<button class="btn ${a.kind || ''}">${a.label}</button>`);
      b.onclick = async () => {
        if (a.value instanceof Function) { const v = await a.value(bodyEl); if (v !== undefined) close(v); }
        else close(a.value);
      };
      foot.append(b);
    });
    root.append(el);
    requestAnimationFrame(() => el.classList.add('in'));
    onOpen?.(bodyEl, close);
  });
}

export const confirmBox = (msg, { ok = '確定', danger = false, title = '請確認' } = {}) =>
  modal({ title, body: `<p class="modal-text">${msg}</p>`, actions: [{ label: '取消', value: false, kind: 'ghost' }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }] });

export const promptBox = (title, value = '', placeholder = '') => modal({
  title,
  body: `<input class="field" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="40">`,
  actions: [{ label: '取消', value: null, kind: 'ghost' }, { label: '確定', kind: 'primary', value: b => b.querySelector('input').value.trim() }],
  onOpen: (b, close) => { const i = b.querySelector('input'); i.focus(); i.select(); i.onkeydown = e => { if (e.key === 'Enter') close(i.value.trim()); }; }
});

// ---------- 圖示（線性、圓角端點） ----------
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICON = {
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  scan: svg('<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><circle cx="11" cy="11" r="3.2"/><path d="m13.4 13.4 2.6 2.6"/>'),
  home: svg('<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>'),
  gacha: svg('<path d="M12 3l2.4 5.2L20 9l-4.2 3.9L17 19l-5-2.9L7 19l1.2-6.1L4 9l5.6-.8z"/>'),
  album: svg('<rect x="4" y="3.5" width="15" height="17" rx="2.5"/><path d="M8 3.5v17"/><path d="M11.5 8.5h4M11.5 12h4"/>'),
  workshop: svg('<path d="M14.5 5.5l4 4"/><path d="M4 20l1-4.5L15.8 4.7a1.6 1.6 0 0 1 2.3 0l1.2 1.2a1.6 1.6 0 0 1 0 2.3L8.5 19z"/><path d="M4 20l4.5-1"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  left: svg('<path d="M15 5l-7 7 7 7"/>'),
  right: svg('<path d="M9 5l7 7-7 7"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r=".9" fill="currentColor"/><circle cx="15" cy="15" r=".9" fill="currentColor"/><circle cx="15" cy="9" r=".9" fill="currentColor"/><circle cx="9" cy="15" r=".9" fill="currentColor"/>'),
  image: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-8.5 8.5"/>'),
  upload: svg('<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
  download: svg('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
  trash: svg('<path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2"/><path d="M6.5 7l.9 12a2 2 0 0 0 2 1.8h5.2a2 2 0 0 0 2-1.8l.9-12"/>'),
  edit: svg('<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/>'),
  brush: svg('<path d="M18.5 3.5a2 2 0 0 1 2.8 2.8L12 15.6 8.4 12z"/><path d="M8.4 12C6 12 4.5 13.6 4.5 16c0 1.6-1 2.6-2 3 4 1 8 .5 9.5-3.4"/>'),
  eraser: svg('<path d="M8.5 20H20"/><path d="M4.6 15.4 14 6a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 20H8.4z"/><path d="M9 11l6 6"/>'),
  target: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>'),
  play: svg('<path d="M7 4.8v14.4a1 1 0 0 0 1.5.9l11.3-7.2a1 1 0 0 0 0-1.8L8.5 3.9A1 1 0 0 0 7 4.8z"/>'),
  pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1.3"/><rect x="14" y="4.5" width="4" height="15" rx="1.3"/>'),
  layers: svg('<path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="M2.5 12.5 12 17.5l9.5-5"/><path d="M2.5 16.5 12 21.5l9.5-5"/>'),
  depth: svg('<path d="M3 17l5-9 4 6 3-4 6 7z"/><circle cx="17" cy="6" r="2"/>'),
  sparkles: svg('<path d="M10 3.5 11.6 8 16 9.5l-4.4 1.6L10 15.5 8.4 11.1 4 9.5 8.4 8z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>'),
  film: svg('<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M7.5 4v16M16.5 4v16M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>'),
  wand: svg('<path d="M4 20 15.5 8.5"/><path d="M14 4v3M19.5 9.5h-3M17.5 5.5l-2 2M11 6l1 1M18 13l-1-1"/>'),
  heart: svg('<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>'),
  sliders: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>'),
};

/** 去掉圖片裡可以解析的生成資訊：
 *  1. 重新存成 PNG（不保留 tEXt / iTXt / EXIF 等文字區塊）
 *  2. 抹掉藏在透明度最低位元的「隱寫」資訊（NovelAI 的 stealth pnginfo）：不透明處統一 255，其他處最低位元歸零（肉眼看不出差別）
 *  顏色像素完全不動 */
export async function stripImageInfo(blob) {
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0); bmp.close?.();
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 254 ? 255 : d[i] & 0xFE;
  g.putImageData(img, 0, 0);
  return canvasToBlob(c, 'image/png');
}
