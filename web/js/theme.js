// 白晝 / 夜航主題切換：View Transitions + 形狀展開（圓、方、三角、菱形、六角、矩形、星形）
// 形狀的 clip-path 算法改寫自使用者提供的 AnimatedThemeToggler（Magic UI）：
// 座標全部換算成百分比，避免 Windows 150% 等非整數縮放下第一次切換位置偏移。
import { state, save, emit } from './store.js';
import { reducedMotion } from './util.js';

/** 配色：[id, 名稱, 說明, 預覽色] */
export const THEMES = [
  ['day', '白晝', '象牙紙 · 墨藍', ['#f3eee4', '#34507f', '#a47b3a']],
  ['night', '夜航', '深夜 · 燙金', ['#0c0d12', '#d6b475', '#cf4c60']],
  ['lavender', '霧紫晨曦', '霧白 · 薰衣紫 · 蜜桃粉', ['#fcfdfd', '#767892', '#a0b1de', '#fdd3d9', '#e7d5e3']],
  ['coral', '汽水珊瑚', '純白 · 薄荷藍 · 珊瑚紅', ['#ffffff', '#75d2d7', '#e95453', '#f3a3a2', '#a1dde0']],
];
const THEME_COLORS = { day: '#f3eee4', night: '#0d0e13', lavender: '#f4f1f6', coral: '#f4fafa' };
/** 側欄開關：夜航 ↔ 上次用的淺色配色 */
export const toggledTheme = () => state.settings.theme === 'night' ? (state.settings.lightTheme || 'day') : 'night';

export const TRANSITIONS = [
  ['circle', '圓形'], ['square', '方形'], ['triangle', '三角'], ['diamond', '菱形'],
  ['hexagon', '六角'], ['rectangle', '矩形'], ['star', '星形'], ['random', '隨機'],
];

const collapsed = (pt, n) => `polygon(${Array(n).fill(pt).join(', ')})`;

function clipPaths(variant, cx, cy, maxR, vw, vh) {
  const X = x => `${(x / vw) * 100}%`, Y = y => `${(y / vh) * 100}%`, P = (x, y) => `${X(x)} ${Y(y)}`;
  const toR = r => `${(r / (Math.hypot(vw, vh) / Math.SQRT2)) * 100}%`;
  switch (variant) {
    case 'square': {
      const half = Math.max(Math.max(cx, vw - cx), Math.max(cy, vh - cy)) * 1.05;
      return [collapsed(P(cx, cy), 4), `polygon(${[P(cx - half, cy - half), P(cx + half, cy - half), P(cx + half, cy + half), P(cx - half, cy + half)].join(', ')})`];
    }
    case 'triangle': {
      const s = maxR * 2.2, dx = Math.sqrt(3) / 2 * s;
      return [collapsed(P(cx, cy), 3), `polygon(${[P(cx, cy - s), P(cx + dx, cy + .5 * s), P(cx - dx, cy + .5 * s)].join(', ')})`];
    }
    case 'diamond': {
      const R = maxR * Math.SQRT2;
      return [collapsed(P(cx, cy), 4), `polygon(${[P(cx, cy - R), P(cx + R, cy), P(cx, cy + R), P(cx - R, cy)].join(', ')})`];
    }
    case 'hexagon': {
      const R = maxR * Math.SQRT2;
      const v = Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 3; return P(cx + R * Math.cos(a), cy + R * Math.sin(a)); });
      return [collapsed(P(cx, cy), 6), `polygon(${v.join(', ')})`];
    }
    case 'rectangle': {
      const hw = Math.max(cx, vw - cx), hh = Math.max(cy, vh - cy);
      return [collapsed(P(cx, cy), 4), `polygon(${[P(cx - hw, cy - hh), P(cx + hw, cy - hh), P(cx + hw, cy + hh), P(cx - hw, cy + hh)].join(', ')})`];
    }
    case 'star': {
      const R = maxR * Math.SQRT2 * 1.03;
      const star = r => `polygon(${Array.from({ length: 5 }, (_, i) => {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5, b = a + Math.PI / 5;
        return `${P(cx + r * Math.cos(a), cy + r * Math.sin(a))}, ${P(cx + r * .42 * Math.cos(b), cy + r * .42 * Math.sin(b))}`;
      }).join(', ')})`;
      return [star(Math.max(2, R * .025)), star(R)];
    }
    default:
      return [`circle(0% at ${P(cx, cy)})`, `circle(${toR(maxR)} at ${P(cx, cy)})`];
  }
}

let busy = false;
export function applyTheme(theme, ev, { variant, duration } = {}) {
  const set = () => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.tone = theme === 'night' ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme] || '#0d0e13');
    if (state.settings.theme !== theme) { state.settings.theme = theme; if (theme !== 'night') state.settings.lightTheme = theme; save('settings'); }
    try { localStorage.setItem('nightjar-theme', theme); } catch { }
    emit('theme', theme);
    applyCursor();
  };
  if (!ev || !document.startViewTransition || reducedMotion() || busy) return set();
  const vw = innerWidth, vh = innerHeight;
  let x = ev.clientX, y = ev.clientY;
  const btn = ev.currentTarget instanceof Element ? ev.currentTarget.getBoundingClientRect() : null;
  if ((x == null || (x === 0 && y === 0)) && btn) { x = btn.left + btn.width / 2; y = btn.top + btn.height / 2; }
  x ??= vw / 2; y ??= vh / 2;
  let shape = variant || state.settings.themeTransition || 'circle';
  if (shape === 'random') shape = TRANSITIONS[Math.floor(Math.random() * (TRANSITIONS.length - 1))][0];
  const ms = duration || state.settings.themeDuration || 700;
  const maxR = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));
  const clip = clipPaths(shape, x, y, maxR, vw, vh);
  const root = document.documentElement;
  // 先用 CSS 把新畫面夾成起始形狀，避免動畫開始前閃一下整個新主題
  root.style.setProperty('--vt-clip-from', clip[0]);
  root.style.setProperty('--vt-duration', ms + 'ms');
  root.dataset.themeVt = 'active';
  busy = true;
  const vt = document.startViewTransition(set);
  vt.finished.finally(() => { busy = false; delete root.dataset.themeVt; root.style.removeProperty('--vt-clip-from'); }).catch(() => { });
  vt.ready.then(() => root.animate({ clipPath: clip }, { duration: ms, easing: shape === 'star' ? 'linear' : 'cubic-bezier(.65,0,.35,1)', fill: 'forwards', pseudoElement: '::view-transition-new(root)' })).catch(() => { });
}

/** 按鈕漣漪：任何按鈕、分頁、導覽點下去時從點擊處擴散一圈 */
export function installRipple() {
  const SEL = '.btn, .icon-btn, .seg button, .tabs button, .menu-big, .nav a, .banner-item, .film-sw, .finish-sw, .choice, .book, .album-tab, .page-nav, .theme-switch';
  document.addEventListener('pointerdown', e => {
    if (state.settings.ripple === false || reducedMotion() || e.button !== 0) return;
    const t = e.target.closest(SEL);
    if (!t || t.disabled) return;
    const r = t.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2.2;
    const host = t.querySelector(':scope > .ripple-host') || t.appendChild(Object.assign(document.createElement('span'), { className: 'ripple-host' }));
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    host.append(dot);
    dot.addEventListener('animationend', () => dot.remove());
  }, { passive: true });
}

/** 空白處點擊波紋：點在沒有互動的地方，從點擊處擴散兩圈細環
 *  畫在一張固定不動的透明畫布上（不是每次點擊都新增 / 刪除元素），避免和 WebGL 畫面疊在一起時閃屏 */
export function installClickWaves() {
  const SKIP = 'button, a, input, textarea, select, label, summary, [contenteditable], [draggable="true"], .tcg, .pocket, .holo-card, .st-box, .ws-stage, .home-stage, .book, .bg-tile, .chip, .slot, .sm-cell, .mini-book, .ly-row, .part-row, .live-item, .tray-handle, .lib-chip, .group, .leaf, .modal-backdrop, .intro';
  let cv = null, g = null, waves = [], raf = 0, color = '#d6b475', dpr = 1;
  const size = () => { dpr = Math.min(devicePixelRatio || 1, 2); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
  const frame = now => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    waves = waves.filter(w => now - w.t0 < 900);
    for (const w of waves) for (const [delay, lw] of [[0, 1.5], [120, 1]]) {
      const k = Math.min(1, Math.max(0, (now - w.t0 - delay) / 780));
      if (k <= 0) continue;
      const e = 1 - Math.pow(1 - k, 3);
      g.globalAlpha = (1 - k) * .9; g.strokeStyle = color; g.lineWidth = lw;
      g.beginPath(); g.arc(w.x, w.y, 4 + e * 36, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
    raf = waves.length ? requestAnimationFrame(frame) : 0;
  };
  document.addEventListener('pointerdown', e => {
    if (state.settings.clickWaves === false || reducedMotion() || e.button !== 0 || e.target.closest(SKIP)) return;
    if (!cv) {
      cv = document.createElement('canvas'); cv.className = 'click-wave-layer';
      document.body.append(cv); g = cv.getContext('2d'); size(); addEventListener('resize', size);
    }
    color = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || color;
    waves.push({ x: e.clientX, y: e.clientY, t0: performance.now() });
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });
}

/** 分頁與分段選擇的滑動膠囊：選取項改變時，膠囊用彈簧曲線滑到新位置 */
export function installPills() {
  const SEL = '.tabs, .seg';
  const pending = new Set();
  let raf = 0;
  // 一開始藏起來（display:none）的分頁列：之後顯示出來、尺寸改變時再定位一次
  const ro = new ResizeObserver(list => list.forEach(e => e.target.isConnected && place(e.target, false)));
  const place = (box, animate = true) => {
    let pill = box.querySelector(':scope > .pill');
    if (!pill) { pill = document.createElement('span'); pill.className = 'pill no-anim'; box.prepend(pill); box.classList.add('has-pill'); animate = false; ro.observe(box); }
    const on = box.querySelector(':scope > button.on');
    if (!on || !on.offsetWidth) { pill.style.opacity = 0; return; }
    pill.classList.toggle('no-anim', !animate || pill.style.opacity === '0' || !pill.style.opacity);
    pill.style.width = on.offsetWidth + 'px'; pill.style.height = on.offsetHeight + 'px';
    pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    pill.style.opacity = 1;
    if (pill.classList.contains('no-anim')) { void pill.offsetWidth; setTimeout(() => pill.classList.remove('no-anim'), 30); }
  };
  const flush = () => { raf = 0; pending.forEach(b => b.isConnected && place(b)); pending.clear(); };
  const queue = box => { pending.add(box); raf ||= setTimeout(flush, 0); };
  new MutationObserver(list => {
    for (const m of list) {
      const t = m.target;
      if (m.type === 'attributes') { const box = t.closest?.(SEL); if (box && t.parentElement === box) queue(box); continue; }
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1 || n.classList?.contains('pill') || n.classList?.contains('ripple') || n.classList?.contains('ripple-host')) continue;
        if (n.matches?.(SEL)) queue(n);
        n.querySelectorAll?.(SEL).forEach(queue);
        const box = n.parentElement?.closest?.(SEL); if (box) queue(box);
      }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', () => document.querySelectorAll(SEL).forEach(b => place(b, false)));
  addEventListener('pills:refresh', () => document.querySelectorAll(SEL).forEach(b => place(b, false)));   // 版面切換後手動要求重新定位
  document.querySelectorAll(SEL).forEach(queue);
}

/** 稀有度配色：每個稀有度一個主色，自動推出漸層、光暈與描邊 */
export const RARITY_PRESETS = [
  ['經典', { R: '#7fb0ec', SR: '#a983ee', SSR: '#e9b04f' }],
  ['寶石', { R: '#3cc98a', SR: '#3f7fe0', SSR: '#e2506a' }],
  ['粉彩', { R: '#9ad8e6', SR: '#f2a6c8', SSR: '#f5c97a' }],
  ['極光', { R: '#5fd3c4', SR: '#8f7cf0', SSR: '#ff8fb1' }],
  ['銀與金', { R: '#b8c0cc', SR: '#d7c49a', SSR: '#f0c24f' }],
  ['夜櫻', { R: '#8a9bd6', SR: '#d77fae', SSR: '#ffb37a' }],
];
export function applyRarityColors() {
  const c = { ...RARITY_PRESETS[0][1], ...(state.settings.rarityColors || {}) };
  const css = Object.entries(c).map(([r, v]) => `
:root { --r-${r}: linear-gradient(135deg, color-mix(in srgb, ${v} 30%, white), ${v} 42%, color-mix(in srgb, ${v} 45%, white) 62%, color-mix(in srgb, ${v} 78%, black)); --rc-${r}: ${v}; }
.r-${r} { --rb-c: color-mix(in srgb, ${v} 72%, white); --rb-glow: color-mix(in srgb, ${v} 78%, transparent); --rb-edge: color-mix(in srgb, ${v} 70%, black); --rb-star: color-mix(in srgb, ${v} 40%, white); }`).join('');
  let el = document.getElementById('rarity-colors');
  if (!el) { el = document.createElement('style'); el.id = 'rarity-colors'; document.head.append(el); }
  el.textContent = css;
}
export const rarityColor = r => ({ ...RARITY_PRESETS[0][1], ...(state.settings.rarityColors || {}) })[r];

// ---------- 自訂游標 ----------
// 原理：CSS 的 cursor 可以指定圖片 —— cursor: url(圖片) 熱點X 熱點Y, 備用游標;
// 這裡用 SVG 即時產生（顏色跟著主題的金色 / 主色），轉成 data URL 放進 CSS 變數，
// 一般區域用「指標」、可以點的東西用「點擊」那張；圖片建議 32×32（瀏覽器上限 128×128）
export const CURSORS = [['system', '系統預設（用電腦目前的游標）'], ['star', '星光'], ['feather', '羽毛筆'], ['moon', '月牙'], ['custom', '我的游標檔（.cur / .ani / 圖片）']];
const CURSOR_SVG = {
  star: (c, o) => [
    [`<path d='M4 3v20l5.5-5 3.5 8 3.5-1.5-3.5-7.7 7.5-.3Z' fill='${c}' stroke='${o}' stroke-width='1.6' stroke-linejoin='round'/><path d='M24 4l1.2 3.8L29 9l-3.8 1.2L24 14l-1.2-3.8L19 9l3.8-1.2Z' fill='#fff' stroke='${c}' stroke-width='.8'/>`, 4, 3],
    [`<path d='M16 2l2.6 11.4L30 16l-11.4 2.6L16 30l-2.6-11.4L2 16l11.4-2.6Z' fill='${c}' stroke='${o}' stroke-width='1.5' stroke-linejoin='round'/><circle cx='16' cy='16' r='2.4' fill='#fff'/>`, 16, 16],
  ],
  feather: (c, o) => [
    [`<path d='M3 3l6 4c7-1 15 2 20 8-3 0-6 .5-8 2 2 1 4 2.5 5 5-5 0-11-2-15-7Z' fill='${c}' stroke='${o}' stroke-width='1.4' stroke-linejoin='round'/><path d='M3 3l15 11' stroke='${o}' stroke-width='1.1' fill='none'/>`, 3, 3],
    [`<path d='M3 3l6 4c7-1 15 2 20 8-3 0-6 .5-8 2 2 1 4 2.5 5 5-5 0-11-2-15-7Z' fill='${c}' stroke='${o}' stroke-width='1.4' stroke-linejoin='round'/><path d='M3 3l15 11' stroke='${o}' stroke-width='1.1' fill='none'/><path d='M8 18l.9 2.6 2.6.9-2.6.9L8 25l-.9-2.6-2.6-.9 2.6-.9Z' fill='#fff' stroke='${c}' stroke-width='.7'/>`, 3, 3],
  ],
  moon: (c, o) => [
    [`<path d='M4 3v18l5-4.6 3.4 7.6 3.2-1.4-3.4-7.4 7-.4Z' fill='${c}' stroke='${o}' stroke-width='1.5' stroke-linejoin='round'/><path d='M25 5a6 6 0 1 0 4 10 5 5 0 0 1-4-10Z' fill='#fff' stroke='${c}' stroke-width='.9'/>`, 4, 3],
    [`<path d='M19 3a13 13 0 1 0 10 21A11 11 0 0 1 19 3Z' fill='${c}' stroke='${o}' stroke-width='1.6' stroke-linejoin='round'/><circle cx='12' cy='14' r='1.6' fill='#fff'/><circle cx='15' cy='21' r='1' fill='#fff'/>`, 12, 14],
  ],
};
let cursorTimers = [], cursorGen = 0;
const scaledCache = new Map();
/** 游標檔常常內含 128～256 px 的大圖：縮成設定的大小（預設 32 px，和 Windows 預設差不多），熱點一起換算 */
async function scaleFrame(f, S) {
  const key = S + '|' + f.x + ',' + f.y + '|' + f.url.length + f.url.slice(-48);
  if (scaledCache.has(key)) return scaledCache.get(key);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = f.url; });
  const w = f.w || img.width, h = f.h || img.height, k = S / Math.max(w, h);
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
  const r = { url: c.toDataURL('image/png'), x: Math.min(c.width - 1, Math.round(f.x * k)), y: Math.min(c.height - 1, Math.round(f.y * k)) };
  scaledCache.set(key, r);
  return r;
}
/** 使用者上傳的游標：單張直接套用，多張（.ani）依每格時間輪播 */
async function applyCustomCursor(root) {
  const gen = cursorGen;
  const cc = state.settings.customCursor || {}, S = state.settings.cursorSize || 32;
  const pick = set => (set?.frames?.length ? set : null);
  const scale = async set => set && { delays: set.delays, frames: await Promise.all(set.frames.map(f => scaleFrame(f, S).catch(() => f))) };
  const def = await scale(pick(cc.def)), ptr = await scale(pick(cc.ptr)), drag = await scale(pick(cc.drag));
  if (gen !== cursorGen) return;            // 期間又改了設定
  if (!def && !ptr && !drag) { delete root.dataset.cursor; return; }
  const css = (f, fb) => `url("${f.url}") ${f.x} ${f.y}, ${fb}`;
  const run = (set, prop, fb) => {
    if (!set) { root.style.setProperty(prop, fb); return; }
    let i = 0;
    root.style.setProperty(prop, css(set.frames[0], fb));
    if (set.frames.length < 2) return;
    const tick = () => {
      i = (i + 1) % set.frames.length;
      root.style.setProperty(prop, css(set.frames[i], fb));
      cursorTimers.push(setTimeout(tick, set.delays[i] || 100));
    };
    cursorTimers.push(setTimeout(tick, set.delays[0] || 100));
  };
  run(def, '--cur-default', 'auto');
  run(ptr || def, '--cur-pointer', 'pointer');
  if (drag && state.settings.dragCursor !== 'system') { run(drag, '--cur-grab', 'grab'); run(drag, '--cur-grabbing', 'grabbing'); }
  root.dataset.cursor = 'custom';
}

/** 拖曳時的手掌：瀏覽器內建的 grab / grabbing 在 Windows 很粗糙，換成跟主題同色的手（張開 = 可以拖，握拳 = 拖曳中） */
const HAND = {
  open: `<path d='M7.6 21.5 4.9 15.6c-.6-1.4.9-2.6 2.1-1.6l2.6 2.4' />
    <rect x='9.4' y='5.2' width='3.6' height='12.5' rx='1.8'/><rect x='13.3' y='3.4' width='3.7' height='13.6' rx='1.85'/>
    <rect x='17.3' y='4.6' width='3.6' height='12.6' rx='1.8'/><rect x='21.2' y='7.6' width='3.3' height='10' rx='1.65'/>
    <path d='M8.9 14.4h15.6v6.6c0 4-3 7-7 7h-2.6c-3.4 0-6-2.6-6-6Z'/>`,
  closed: `<rect x='9' y='9.2' width='4' height='7' rx='2'/><rect x='12.8' y='8.2' width='4' height='7.6' rx='2'/>
    <rect x='16.6' y='8.6' width='4' height='7.4' rx='2'/><rect x='20.4' y='10' width='3.7' height='6.4' rx='1.85'/>
    <path d='M8.4 13.4h16v7.2c0 4-3 7-7 7h-3c-3.4 0-6-2.6-6-6Z'/><path d='M7.2 17.6c1.8-1.4 5.6-1.6 7.8.2' fill='none'/>`,
};
function handCursor(kind, c) {
  const g = HAND[kind];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32' stroke-linejoin='round' stroke-linecap='round'>`
    + `<g fill='none' stroke='rgba(0,0,0,.45)' stroke-width='3.4'>${g}</g><g fill='#ffffff' stroke='${c}' stroke-width='1.6'>${g}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, ${kind === 'open' ? 'grab' : 'grabbing'}`;
}
function applyDragCursor(root) {
  if (state.settings.dragCursor === 'system') { root.style.removeProperty('--cur-grab'); root.style.removeProperty('--cur-grabbing'); return; }
  const c = getComputedStyle(root).getPropertyValue('--gold').trim() || '#d6b475';
  root.style.setProperty('--cur-grab', handCursor('open', c));
  root.style.setProperty('--cur-grabbing', handCursor('closed', c));
}

export function applyCursor() {
  const kind = state.settings.cursor || 'system', root = document.documentElement;
  cursorTimers.forEach(clearTimeout); cursorTimers = []; cursorGen++;
  applyDragCursor(root);
  if (kind === 'custom') { applyCustomCursor(root); return; }
  if (kind === 'system' || !CURSOR_SVG[kind]) { delete root.dataset.cursor; return; }
  const cs = getComputedStyle(root), c = cs.getPropertyValue('--gold').trim() || '#d6b475';
  const o = root.dataset.tone === 'dark' ? '#ffffff' : '#1d1a2a';
  const url = ([body, x, y], fb) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>${body}</svg>`)}") ${x} ${y}, ${fb}`;
  const [def, ptr] = CURSOR_SVG[kind](c, o);
  root.style.setProperty('--cur-default', url(def, 'auto'));
  root.style.setProperty('--cur-pointer', url(ptr, 'pointer'));
  root.dataset.cursor = kind;
}

// 卡背色調：卡背原圖是星夜藍紫；也可以跟著主題，或換成其他顏色（不含綠色系）
// 換色用「漸層對應」（先轉灰階，再依亮暗套上同一色系的漸層），整張卡都在同一個色系裡，不會有雜色
export const BACK_TONES = [
  ['original', '星夜藍紫', 'linear-gradient(135deg,#3b3f9e,#8f7ae6,#d9c8ff)'],
  ['theme', '跟隨主題', 'conic-gradient(#d6b475,#e85a5a,#78d4d8,#8f7ae6,#d6b475)'],
  ['rose', '玫瑰粉', 'linear-gradient(135deg,#6a1f5c,#c8508f,#f4a6c8)', ['#1e0a24', '#6a1f5c', '#c8508f', '#f4a6c8', '#fff2f8']],
  ['crimson', '緋紅', 'linear-gradient(135deg,#5c0f1c,#b3283a,#f07a6e)', ['#1a0508', '#5c0f1c', '#b3283a', '#f07a6e', '#fff0e6']],
  ['gold', '琥珀金', 'linear-gradient(135deg,#4e3410,#a8752a,#e9c06a)', ['#140c04', '#4e3410', '#a8752a', '#e9c06a', '#fff8e6']],
  ['ice', '冰晶藍', 'linear-gradient(135deg,#123d72,#3d8ee0,#9fd6ff)', ['#050d1e', '#123d72', '#3d8ee0', '#9fd6ff', '#f4fbff']],
  ['silver', '月銀', 'linear-gradient(135deg,#3a3d4a,#8a8e9e,#e4e6ee)', ['#0c0d12', '#3a3d4a', '#8a8e9e', '#cfd2dc', '#ffffff']],
  ['noir', '墨夜', 'linear-gradient(135deg,#10111d,#2b2d48,#6c6f95)', ['#020205', '#10111d', '#2b2d48', '#6c6f95', '#d8daf0']],
];
function backToneFilters() {
  if (document.getElementById('back-tone-filters')) return;
  const ch = (stops, k) => stops.map(c => (parseInt(c.slice(1 + k * 2, 3 + k * 2), 16) / 255).toFixed(3)).join(' ');
  const defs = BACK_TONES.filter(t => t[3]).map(([id, , , st]) => `<filter id="bt-${id}" color-interpolation-filters="sRGB">
    <feColorMatrix in="SourceGraphic" type="matrix" values=".25 .55 .35 0 0  .25 .55 .35 0 0  .25 .55 .35 0 0  0 0 0 1 0" result="g"/>
    <feComponentTransfer in="g" result="m"><feFuncR type="table" tableValues="${ch(st, 0)}"/><feFuncG type="table" tableValues="${ch(st, 1)}"/><feFuncB type="table" tableValues="${ch(st, 2)}"/></feComponentTransfer>
    <feComposite in="m" in2="SourceGraphic" operator="arithmetic" k2=".9" k3=".1"/></filter>`).join('');
  document.body.insertAdjacentHTML('beforeend', `<svg id="back-tone-filters" width="0" height="0" style="position:absolute" aria-hidden="true">${defs}</svg>`);
}
export function applyBackTone() {
  backToneFilters();
  document.documentElement.dataset.backTone = state.settings.backTone || 'original';
}

// ---------- 版面：手機版 / 電腦版 ----------
// auto：依螢幕寬度（760 以下是手機版）；mobile：強制手機版（在電腦上會用手機寬度的框預覽）；desktop：強制電腦版（在手機上會縮小顯示完整版面）
const isSmallDevice = () => Math.min(screen.width, screen.height) <= 760 && matchMedia('(pointer: coarse)').matches;
export function applyLayout() {
  const pref = state.settings.layout || 'auto', root = document.documentElement;
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) meta.content = pref === 'desktop' && isSmallDevice() ? 'width=1280' : 'width=device-width, initial-scale=1, viewport-fit=cover';
  const mobile = pref === 'mobile' || (pref === 'auto' && (isSmallDevice() || innerWidth <= 760));
  root.dataset.layout = mobile ? 'mobile' : 'desktop';
  root.classList.toggle('phone-frame', pref === 'mobile' && !isSmallDevice() && innerWidth > 760);
  try { localStorage.setItem('nightjar-layout', pref); } catch { }
}
let layoutWired = false;
export function wireLayout() {
  applyLayout();
  if (layoutWired) return; layoutWired = true;
  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { const was = document.documentElement.dataset.layout; applyLayout(); if (was !== document.documentElement.dataset.layout) dispatchEvent(new Event('layout:change')); }, 150); });
}
