// 互動閃卡匯出：把閃卡在不同傾斜角度的畫面（同一套 WebGL 鐳射效果）打包成「一個 HTML 檔」
// 任何人用瀏覽器打開都能玩：滑鼠移動傾斜、拖曳 360° 翻到卡背、手機可用陀螺儀；不需要網路、不需要這個網站
import { esc } from './util.js';

export const EXPORT_QUALITY = [
  ['light', '輕量：5×5 角度，約 1–2 MB', { cols: 5, rows: 5, max: 560 }],
  ['standard', '標準：9×7 角度，約 4–7 MB', { cols: 9, rows: 7, max: 760 }],
  ['fine', '精細：13×9 角度，約 12–18 MB', { cols: 13, rows: 9, max: 960 }],
];

const toDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

/** 卡背：把目前的卡背（含卡背色調）畫成一張圖；內建紋章回傳 null（播放器自己畫） */
async function backImage(holo) {
  const img = holo.back?.querySelector('img');
  if (!img) return null;
  try {
    if (!img.complete) await img.decode();
    const c = document.createElement('canvas');
    const s = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext('2d');
    const flt = (getComputedStyle(img).filter || '').replace(/drop-shadow\((?:[^()]|\([^()]*\))*\)/g, '').trim();
    if (flt && flt !== 'none') g.filter = flt;
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', .88);
  } catch { return null; }
}

/** 產生互動閃卡 HTML；onProgress(0~1) */
export async function exportInteractive(holo, { card, quality = 'standard', onProgress } = {}) {
  const q = (EXPORT_QUALITY.find(x => x[0] === quality) || EXPORT_QUALITY[1])[2];
  const grid = await holo.captureGrid({ ...q, onProgress: f => onProgress?.(f * .9) });
  if (!grid) throw new Error('閃卡還沒準備好');
  const frames = [];
  for (const b of grid.frames) frames.push(await toDataURL(b));
  onProgress?.(.95);
  const data = {
    frames, cols: grid.cols, rows: grid.rows, rx: grid.rx, ry: grid.ry, w: grid.width, h: grid.height,
    back: await backImage(holo), alpha: !!holo.alpha,
  };
  const name = card?.name || '閃卡', sub = card?.subtitle || '';
  const html = viewerHTML(data, name, sub, card?.rarity || '');
  onProgress?.(1);
  return new Blob([html], { type: 'text/html' });
}

function viewerHTML(D, name, sub, rarity) {
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(name)} · 互動閃卡</title>
<style>
:root { color-scheme: dark; --w: 300px; --h: 450px; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: radial-gradient(ellipse at 50% 38%, #24203a 0%, #0c0b14 62%, #050509 100%); color: #f1e9d6;
  font-family: system-ui, -apple-system, "Segoe UI", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; touch-action: none; user-select: none; -webkit-user-select: none; }
.stage { position: fixed; inset: 0; display: grid; place-items: center; perspective: 1500px; }
.card { position: relative; width: var(--w); height: var(--h); transform-style: preserve-3d; cursor: grab; will-change: transform; }
.card.grab { cursor: grabbing; }
.face { position: absolute; inset: 0; border-radius: 16px; overflow: hidden; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.front { box-shadow: 0 30px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08); }
.alpha .front { box-shadow: none; overflow: visible; filter: drop-shadow(0 24px 30px rgba(0,0,0,.5)); }
.front canvas { display: block; width: 100%; height: 100%; }
.glare { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: soft-light; opacity: var(--go, .5);
  background: radial-gradient(circle at var(--gx, 50%) var(--gy, 40%), rgba(255,255,255,.75), rgba(255,255,255,0) 52%); }
.alpha .glare { display: none; }
.back { transform: rotateY(180deg); background: #0f1020; box-shadow: 0 30px 70px rgba(0,0,0,.55); }
.back img { width: 100%; height: 100%; object-fit: contain; display: block; }
.back.plain { background: radial-gradient(circle, rgba(214,180,117,.28), transparent 55%), linear-gradient(160deg, #1d1f2e, #0d0e16); box-shadow: inset 0 0 0 2px #c99a4c, inset 0 0 0 9px #0d0e16, inset 0 0 0 10px rgba(214,180,117,.5), 0 30px 70px rgba(0,0,0,.55); display: grid; place-items: center; }
.back.plain b { font: 600 13px Georgia, serif; letter-spacing: .4em; color: #d6b475; opacity: .8; }
.shadow { position: fixed; left: 50%; top: calc(50% + var(--h) / 2 + 26px); width: calc(var(--w) * .8); height: 26px; transform: translateX(-50%); border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0,0,0,.55), transparent 70%); filter: blur(6px); pointer-events: none; }
.cap { position: fixed; left: 0; right: 0; bottom: max(18px, env(safe-area-inset-bottom)); text-align: center; pointer-events: none; }
.cap b { display: block; font: 600 18px Georgia, "Noto Serif TC", serif; letter-spacing: .18em; }
.cap small { display: block; margin-top: 2px; font-size: 11px; letter-spacing: .35em; opacity: .65; text-transform: uppercase; }
.cap em { display: block; margin-top: 10px; font-style: normal; font-size: 11.5px; opacity: .45; letter-spacing: .1em; }
.rar { display: inline-block; margin-bottom: 6px; padding: 2px 10px; border-radius: 99px; font: 700 11px Georgia, serif; letter-spacing: .2em; color: #1d160b; background: linear-gradient(135deg, #f3dc9f, #cfa253); }
.rar.R { background: linear-gradient(135deg, #dfe6f3, #9aa8c2); } .rar.SR { background: linear-gradient(135deg, #e7d3ff, #a487e0); }
.gyro { position: fixed; top: 16px; right: 16px; padding: 8px 14px; border-radius: 99px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: inherit; font-size: 13px; display: none; }
.loading { position: fixed; inset: 0; display: grid; place-items: center; font-size: 13px; letter-spacing: .2em; opacity: .6; }
</style></head><body>
<div class="loading">載入中…</div>
<div class="stage"><div class="card${D.alpha ? ' alpha' : ''}"><div class="face front"><canvas></canvas><i class="glare"></i></div>${D.back ? `<div class="face back"><img alt="" src="${D.back}"></div>` : '<div class="face back plain"><b>NIGHTJAR · ARCANA</b></div>'}</div></div>
<div class="shadow"></div>
<div class="cap">${rarity ? `<span class="rar ${esc(rarity)}">${esc(rarity)}</span>` : ''}<b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}<em>移動滑鼠傾斜 · 拖曳可以翻到背面 · 手機可用陀螺儀</em></div>
<button class="gyro">開啟陀螺儀</button>
<script>
const D = ${JSON.stringify({ ...D, frames: undefined, back: undefined })};
D.frames = ${JSON.stringify(D.frames)};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const card = document.querySelector('.card'), cv = document.querySelector('canvas'), g = cv.getContext('2d'), root = document.documentElement;
cv.width = D.w; cv.height = D.h;
const A = document.createElement('canvas'), B = document.createElement('canvas');
A.width = B.width = D.w; A.height = B.height = D.h;
const ga = A.getContext('2d'), gb = B.getContext('2d');
const imgs = D.frames.map(src => { const i = new Image(); i.src = src; return i; });
Promise.all(imgs.map(i => i.decode().catch(() => {}))).then(() => document.querySelector('.loading').remove());
// 版面：卡片佔畫面 7 成高
function fit() {
  const ar = D.w / D.h; let h = innerHeight * .68, w = h * ar;
  if (w > innerWidth * .82) { w = innerWidth * .82; h = w / ar; }
  root.style.setProperty('--w', w + 'px'); root.style.setProperty('--h', h + 'px');
}
fit(); addEventListener('resize', fit);
const F = (i, j) => imgs[clamp(j, 0, D.rows - 1) * D.cols + clamp(i, 0, D.cols - 1)];
// 依傾斜角度，在相鄰四張之間混合
function paint(px, py) {
  const fi = clamp((py + D.ry) / (2 * D.ry), 0, 1) * (D.cols - 1), fj = clamp((D.rx - px) / (2 * D.rx), 0, 1) * (D.rows - 1);
  const i0 = Math.floor(fi), j0 = Math.floor(fj), i1 = Math.min(i0 + 1, D.cols - 1), j1 = Math.min(j0 + 1, D.rows - 1), fx = fi - i0, fy = fj - j0;
  for (const [c, j] of [[ga, j0], [gb, j1]]) { c.globalAlpha = 1; c.clearRect(0, 0, D.w, D.h); c.drawImage(F(i0, j), 0, 0); if (fx > .01) { c.globalAlpha = fx; c.drawImage(F(i1, j), 0, 0); } }
  g.globalAlpha = 1; g.clearRect(0, 0, D.w, D.h); g.drawImage(A, 0, 0); if (fy > .01) { g.globalAlpha = fy; g.drawImage(B, 0, 0); }
}
let rx = 0, ry = 0, hx = 0, hy = 0, hoverT = 0, baseRy = 0, baseRx = 0, vry = 0, vrx = 0, dragging = false, lastDrag = 0, gyro = null, t = 0, prev = performance.now();
addEventListener('pointermove', e => {
  if (dragging || e.pointerType === 'touch') return;
  hy = clamp((e.clientX / innerWidth - .5) * 2.2, -1, 1) * D.ry; hx = clamp(-(e.clientY / innerHeight - .5) * 2.2, -1, 1) * D.rx; hoverT = performance.now();
});
card.addEventListener('pointerdown', e => {
  e.preventDefault(); dragging = true; card.classList.add('grab');
  let px = e.clientX, py = e.clientY, pt = performance.now();
  const move = ev => { const now = performance.now(), dt = Math.max(8, now - pt), dx = ev.clientX - px, dy = ev.clientY - py;
    baseRy += dx * .55; baseRx = clamp(baseRx - dy * .4, -60, 60); vry = dx * .55 / dt * 16; vrx = -dy * .4 / dt * 16; px = ev.clientX; py = ev.clientY; pt = now; };
  const up = () => { dragging = false; lastDrag = performance.now(); card.classList.remove('grab'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
});
// 陀螺儀（iPhone 要先按按鈕允許）
const onTilt = e => { if (e.beta == null) return; gyro = { x: clamp((e.beta - 40) * .6, -D.rx, D.rx), y: clamp(e.gamma * .8, -D.ry, D.ry) }; };
const gbtn = document.querySelector('.gyro');
const touch = matchMedia('(pointer: coarse)').matches;
if (touch && window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
  gbtn.style.display = 'block';
  gbtn.onclick = () => DeviceOrientationEvent.requestPermission().then(s => { if (s === 'granted') { addEventListener('deviceorientation', onTilt); gbtn.remove(); } });
} else if (touch) addEventListener('deviceorientation', onTilt);
function frame(now) {
  const dt = Math.min(.05, Math.max(0, now - prev) / 1000); prev = now; t += dt;
  if (!dragging) {
    baseRy += vry; baseRx = clamp(baseRx + vrx, -60, 60); vry *= .93; vrx *= .9; if (Math.abs(vry) < .02) vry = 0;
    if (lastDrag && now - lastDrag > 4000 && !vry) {            // 一陣子沒碰就轉回正面
      const front = Math.round(baseRy / 360) * 360; const k = 1 - Math.exp(-dt * 2);
      baseRy += (front - baseRy) * k; baseRx *= 1 - k;
      if (Math.abs(front - baseRy) < .3) { baseRy = front; lastDrag = 0; }
    }
  }
  let tx, ty;
  if (dragging || lastDrag) { tx = 0; ty = 0; }
  else if (gyro) { tx = gyro.x; ty = gyro.y; }
  else if (hoverT && now - hoverT < 2000) { tx = hx; ty = hy; }
  else { tx = Math.sin(t * .53) * D.rx * .35; ty = Math.sin(t * .42) * D.ry * .65; }   // 沒人動時自己輕輕搖
  const k = dragging ? 1 : 1 - Math.exp(-dt * 7);
  rx += (tx + baseRx - rx) * k; ry += (ty + baseRy - ry) * k;
  card.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
  const fy = ((ry % 360) + 540) % 360 - 180;                    // 正面的角度（-180 ~ 180）
  if (Math.abs(fy) < 100) paint(rx, clamp(fy, -D.ry, D.ry));
  root.style.setProperty('--gx', (50 + fy * 1.6) + '%'); root.style.setProperty('--gy', (45 - rx * 1.8) + '%');
  root.style.setProperty('--go', (.25 + Math.min(.45, (Math.abs(fy) + Math.abs(rx)) / 60)).toFixed(3));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script>
<!-- 由「夜航卡舍」的閃卡工藝匯出 -->
</body></html>`;
}
