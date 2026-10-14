// 閃卡工藝的平面圖層：卡框、文字、素材貼圖（人物後 / 人物前 / 最上層）
// 卡框全部用程式依卡片比例繪製，直式、橫式、方形都能共用
import { loadImage } from './util.js';
import { db } from './db.js';
import { drawLayer } from './layers.js';
import { rarityVisible } from './cards.js';

export const FRAMES = [
  ['none', '無框', '只有圖片，不加框'],
  ['classic', '經典雙線', '內外兩條細線，最百搭'],
  ['ornate', '華麗角飾', '四角加上卷葉角花'],
  ['silver', '極細銀線', '一條細線 + 角點，乾淨簡約'],
  ['gothic', '哥德尖拱', '上方尖拱窗框，適合角色卡'],
  ['blackgold', '黑金寬框', '厚實的深色框 + 金色內線，收藏卡感'],
  ['corner', '角標', '只在四角放 L 形角標，不擋畫面'],
  ['lace', '蕾絲點綴', '沿邊一圈小圓點，柔和可愛'],
  ['neon', '霓虹光框', '發光的細框，夜景很搭'],
  ['starfeather', '星羽', '細框 + 素材庫的星芒分隔飾與羽毛'],
  ['crystal', '羽晶法陣', '素材庫的羽晶卡框，自動依比例伸縮'],
];
export const FRAME_COLORS = [['gold', '金'], ['silver', '銀'], ['rose', '玫瑰金'], ['violet', '紫晶'], ['white', '白'], ['ink', '墨黑']];
export const FONTS = [['serif', '明朝體'], ['display', '古典羅馬'], ['script', '優雅手寫'], ['sans', '圓潤黑體']];
export const STICKER_LAYERS = [['back', '人物後面'], ['front', '人物前面'], ['top', '最上層（不跟視差）']];

const FONT_CSS = {
  serif: '"Noto Serif TC", serif', display: '"Cinzel", "Noto Serif TC", serif',
  script: 'italic 600 X "Cormorant Garamond", "Noto Serif TC", serif', sans: '"Noto Sans TC", sans-serif',
};
const font = (k, weight, px) => k === 'script' ? `italic 600 ${px}px "Cormorant Garamond", "Noto Serif TC", serif` : `${weight} ${px}px ${FONT_CSS[k] || FONT_CSS.serif}`;

function paint(g, color, w, h) {
  const stops = {
    gold: ['#f6e2ac', '#c99a4c', '#fff1c4', '#9a7134'], silver: ['#ffffff', '#a9aeb8', '#f4f6f9', '#7d828c'],
    rose: ['#ffe0d6', '#d58f8a', '#fff1ec', '#a86566'], violet: ['#efe1ff', '#9c7ae0', '#f6edff', '#6d4fb3'],
    white: ['#ffffff', '#e6e6ee', '#ffffff', '#cfd2dc'], ink: ['#3a3640', '#121016', '#4a4552', '#0a090c'],
  }[color] || ['#f6e2ac', '#c99a4c', '#fff1c4', '#9a7134'];
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, stops[0]); gr.addColorStop(.45, stops[1]); gr.addColorStop(.55, stops[2]); gr.addColorStop(1, stops[3]);
  return gr;
}

const imgCache = new Map();
export async function loadSrc(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  let p;
  if (src.startsWith('card:')) p = db.get('cards', src.slice(5)).then(c => c ? loadImage(c.blob) : null);
  else if (src.startsWith('asset:')) p = db.get('assets', src.slice(6)).then(a => a ? loadImage(a.blob) : null);   // 我的素材
  else p = loadImage(src).catch(() => null);
  imgCache.set(src, p);
  return p;
}

/** 九宮格伸縮：角落等比例、四邊拉伸，中間留空（給中空卡框用） */
function nineSlice(g, img, W, H, f = { l: .3, r: .3, t: .2, b: .2 }) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const L = iw * f.l, R = iw * f.r, T = ih * f.t, B = ih * f.b;
  const s = Math.min(W / iw, H / ih) * 1.0;
  const l = L * s, r = R * s, t = T * s, b = B * s;
  const d = (sx, sy, sw, sh, dx, dy, dw, dh) => { if (sw > 0 && sh > 0 && dw > 0 && dh > 0) g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh); };
  d(0, 0, L, T, 0, 0, l, t); d(iw - R, 0, R, T, W - r, 0, r, t); d(0, ih - B, L, B, 0, H - b, l, b); d(iw - R, ih - B, R, B, W - r, H - b, r, b);
  d(L, 0, iw - L - R, T, l, 0, W - l - r, t); d(L, ih - B, iw - L - R, B, l, H - b, W - l - r, b);
  d(0, T, L, ih - T - B, 0, t, l, H - t - b); d(iw - R, T, R, ih - T - B, W - r, t, r, H - t - b);
}

async function drawFrame(g, w, h, c) {
  const u = Math.min(w, h) / 100, col = paint(g, c.frameColor || 'gold', w, h), f = c.frame;
  if (f === 'none') return;
  g.save();
  g.strokeStyle = col; g.fillStyle = col;
  const rr = (x, y, ww, hh, r) => { g.beginPath(); g.roundRect(x, y, ww, hh, r); };
  if (f === 'classic' || f === 'ornate' || f === 'starfeather') {
    g.lineWidth = u * 1.1; rr(u * 2.6, u * 2.6, w - u * 5.2, h - u * 5.2, u * 4); g.stroke();
    g.lineWidth = u * .35; g.globalAlpha = .8; rr(u * 4.4, u * 4.4, w - u * 8.8, h - u * 8.8, u * 2.8); g.stroke(); g.globalAlpha = 1;
  }
  if (f === 'ornate') {
    for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]]) {
      g.save(); g.translate(x + sx * u * 4.4, y + sy * u * 4.4); g.scale(sx, sy);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(u * 12, 0); g.quadraticCurveTo(u * 4, u * 1.5, u * 1.5, u * 4); g.quadraticCurveTo(0, u * 8, 0, u * 12); g.closePath(); g.fill();
      g.beginPath(); g.arc(u * 5, u * 5, u * 1.3, 0, 7); g.fill();
      g.restore();
    }
  }
  if (f === 'silver') {
    g.lineWidth = u * .45; rr(u * 3.2, u * 3.2, w - u * 6.4, h - u * 6.4, u * 3); g.stroke();
    for (const [x, y] of [[u * 3.2, u * 3.2], [w - u * 3.2, u * 3.2], [u * 3.2, h - u * 3.2], [w - u * 3.2, h - u * 3.2]]) {
      g.beginPath(); g.moveTo(x, y - u * 1.6); g.lineTo(x + u * 1.6, y); g.lineTo(x, y + u * 1.6); g.lineTo(x - u * 1.6, y); g.closePath(); g.fill();
    }
  }
  if (f === 'gothic') {
    const m = u * 3.4, top = m + Math.min(w, h) * .2;
    g.lineWidth = u * 1;
    g.beginPath(); g.moveTo(m, h - m); g.lineTo(m, top);
    g.quadraticCurveTo(m, m + u * 2, w / 2, m); g.quadraticCurveTo(w - m, m + u * 2, w - m, top);
    g.lineTo(w - m, h - m); g.closePath(); g.stroke();
    g.lineWidth = u * .35; g.globalAlpha = .7;
    const m2 = m + u * 1.8;
    g.beginPath(); g.moveTo(m2, h - m2); g.lineTo(m2, top + u * 1.5); g.quadraticCurveTo(m2, m2 + u * 2.5, w / 2, m2); g.quadraticCurveTo(w - m2, m2 + u * 2.5, w - m2, top + u * 1.5); g.lineTo(w - m2, h - m2); g.closePath(); g.stroke();
    g.globalAlpha = 1;
    g.beginPath(); g.moveTo(w / 2, m - u * 2.4); g.lineTo(w / 2 + u * 1.6, m); g.lineTo(w / 2, m + u * 2.4); g.lineTo(w / 2 - u * 1.6, m); g.closePath(); g.fill();
  }
  if (f === 'blackgold') {
    const bw = u * 5.5;
    g.fillStyle = 'rgba(14,12,18,.92)';
    g.beginPath(); g.rect(0, 0, w, h); g.roundRect(bw, bw, w - bw * 2, h - bw * 2, u * 2.5); g.fill('evenodd');
    g.strokeStyle = col; g.lineWidth = u * .8; rr(bw - u * .4, bw - u * .4, w - bw * 2 + u * .8, h - bw * 2 + u * .8, u * 2.8); g.stroke();
    g.lineWidth = u * .3; rr(u * 1.4, u * 1.4, w - u * 2.8, h - u * 2.8, u * 4); g.stroke();
  }
  if (f === 'corner') {
    g.lineWidth = u * 1; g.lineCap = 'round';
    const m = u * 4, L = Math.min(w, h) * .14;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
      g.beginPath(); g.moveTo(x, y + sy * L); g.lineTo(x, y); g.lineTo(x + sx * L, y); g.stroke();
      g.beginPath(); g.arc(x + sx * u * 2.2, y + sy * u * 2.2, u * .7, 0, 7); g.fill();
    }
  }
  if (f === 'lace') {
    g.lineWidth = u * .4; rr(u * 4.2, u * 4.2, w - u * 8.4, h - u * 8.4, u * 3); g.stroke();
    const step = u * 2.6;
    for (let x = u * 4; x <= w - u * 4; x += step) for (const y of [u * 2.4, h - u * 2.4]) { g.beginPath(); g.arc(x, y, u * .75, 0, 7); g.fill(); }
    for (let y = u * 4; y <= h - u * 4; y += step) for (const x of [u * 2.4, w - u * 2.4]) { g.beginPath(); g.arc(x, y, u * .75, 0, 7); g.fill(); }
  }
  if (f === 'neon') {
    const nc = { gold: '#ffd890', silver: '#e6f0ff', rose: '#ffb3c6', violet: '#c9a2ff', white: '#ffffff', ink: '#9fb7ff' }[c.frameColor] || '#c9a2ff';
    g.strokeStyle = nc; g.shadowColor = nc;
    for (const [blur, lw, a] of [[u * 4, u * 1.2, .7], [u * 1.5, u * .6, 1]]) { g.shadowBlur = blur; g.lineWidth = lw; g.globalAlpha = a; rr(u * 3.5, u * 3.5, w - u * 7, h - u * 7, u * 4); g.stroke(); }
    g.shadowBlur = 0; g.globalAlpha = 1;
  }
  if (f === 'starfeather') {
    const div = await loadSrc('assets/deco/divider-f08.webp'), fea = await loadSrc('assets/deco/feather-f09.webp');
    if (div) { const dw = Math.min(w * .5, u * 46), dh = dw * div.naturalHeight / div.naturalWidth; g.drawImage(div, (w - dw) / 2, u * 1.2, dw, dh); }
    if (fea) { const fw = Math.min(w, h) * .3, fh = fw * fea.naturalHeight / fea.naturalWidth; g.save(); g.translate(w - u * 3, h - u * 3); g.drawImage(fea, -fw, -fh, fw, fh); g.restore(); }
  }
  if (f === 'crystal') {
    const img = await loadSrc('assets/deco/frame-d02.webp');
    if (img) nineSlice(g, img, w, h);
  }
  g.restore();
}

/** 卡框 + 文字 + 最上層貼圖（不做視差，固定在卡邊） */
export async function textLayer(w, h, card, c) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  try { await Promise.all([document.fonts.load('700 40px "Noto Serif TC"'), document.fonts.load('700 30px "Cinzel"'), document.fonts.load('italic 600 30px "Cormorant Garamond"')]); } catch { }
  await drawFrame(g, w, h, c);
  const u = Math.min(w, h) / 100, k = c.textSize || 1;
  const textCol = { light: '#fbf5e6', dark: '#2a2117', gold: null }[c.textColor || 'light'];
  const gold = paint(g, c.frameColor === 'ink' ? 'gold' : c.frameColor || 'gold', w, h);
  const top = c.textPos === 'top';
  const lines = [];
  if (c.showName !== false && card.name) lines.push(['name', card.name]);
  if (c.showSubtitle !== false && card.subtitle) lines.push(['sub', card.subtitle.toUpperCase().split('').join(' ')]);
  if (c.flavor) lines.push(['flavor', c.flavor]);
  if (lines.length && c.showPlate !== false) {
    const ph = u * (8 + lines.length * 6) * k;
    const grad = top ? g.createLinearGradient(0, 0, 0, ph * 1.4) : g.createLinearGradient(0, h - ph * 1.4, 0, h);
    const shade = c.textColor === 'dark' ? '255,250,240' : '8,8,12';
    grad.addColorStop(top ? 1 : 0, `rgba(${shade},0)`); grad.addColorStop(top ? 0 : 1, `rgba(${shade},.72)`);
    g.fillStyle = grad;
    if (top) g.fillRect(0, 0, w, ph * 1.4); else g.fillRect(0, h - ph * 1.4, w, ph * 1.4);
  }
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  let y = top ? u * 12 * k : h - u * 6 * k - (lines.length - 1) * u * 6 * k;
  if (!top) {
    // 從下往上排：名字在最上
    const heights = lines.map(([t]) => (t === 'name' ? 6.4 : t === 'sub' ? 3.6 : 3.4) * u * k);
    y = h - u * 7 * k - heights.slice(1).reduce((a, b) => a + b + u * 1.6 * k, 0);
  }
  for (const [type, str] of lines) {
    const size = (type === 'name' ? 6.4 : type === 'sub' ? 3 : 3.2) * u * k;
    g.font = type === 'name' ? font(c.textFont || 'serif', 700, size) : type === 'sub' ? font('display', 700, size) : font('script', 600, size * 1.2);
    g.fillStyle = type === 'sub' ? gold : (textCol || gold);
    g.shadowColor = c.textColor === 'dark' ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.6)'; g.shadowBlur = u;
    g.fillText(str, w / 2, y, w - u * 12);
    g.shadowBlur = 0;
    y += size + u * 1.6 * k + (type === 'name' ? u * .6 : 0);
  }
  if (c.showRarity !== false && rarityVisible(card)) {
    g.font = font('display', 700, u * 4 * k); g.textAlign = 'left'; g.fillStyle = gold;
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = u * .8;
    g.fillText(card.rarity || '', u * 7, top ? h - u * 6 : u * 10.5);
  }
  if (c.showSerial !== false) {
    g.font = font('display', 700, u * 2.2 * k); g.textAlign = 'right'; g.fillStyle = gold;
    g.fillText(`No.${String(card.serial || 0).padStart(4, '0')}`, w - u * 7, top ? h - u * 6 : u * 9.5);
  }
  g.shadowBlur = 0;
  for (const l of c.layers || []) if (l.group === 'top' && l.visible !== false) await drawLayer(g, w, h, l);
  return cv;
}

/** 在畫布上畫指定圖層的素材貼圖。sticker：{src, x, y, w（佔卡寬比例）, rot, opacity, flip, layer} */
export async function drawStickers(g, W, H, stickers = [], layer) {
  for (const s of stickers.filter(x => x.layer === layer)) {
    const img = await loadSrc(s.src);
    if (!img) continue;
    const sw = s.w * W, sh = sw * (img.naturalHeight || img.height) / (img.naturalWidth || img.width);
    g.save();
    g.globalAlpha = s.opacity ?? 1;
    g.translate(s.x * W, s.y * H); g.rotate((s.rot || 0) * Math.PI / 180); g.scale(s.flip ? -1 : 1, 1);
    g.drawImage(img, -sw / 2, -sh / 2, sw, sh);
    g.restore();
  }
}

/** 前景素材層（RGBA） */
export async function fxLayer(W, H, stickers) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  await drawStickers(cv.getContext('2d'), W, H, stickers, 'front');
  return cv;
}
