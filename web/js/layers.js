// 圖層系統（像 PSD）：每個圖層屬於 最上層 / 外圍 / 主體 / 背景 其中一組
// 閃卡工藝用這四組做出三層景深：背景往後、主體浮起、外圍最靠前，最上層固定在卡邊
import { loadImage, canvasToBlob, uid } from './util.js';
import { loadSrc } from './craftlayers.js';

export const GROUPS = [
  ['top', '最上層', '固定在卡上、不跟視差，例如浮水印、角標'],
  ['outer', '外圍', '離你最近、視差最大，例如飄落的羽毛、前景花草'],
  ['subject', '主體', '人物或主角本身'],
  ['bg', '背景', '最遠的一層，可以換成別張圖'],
];

export const ST_NAMES = {
  'front hair': '前髮', 'back hair': '後髮', headwear: '頭飾', face: '臉', eyebrow: '眉毛', eyelash: '睫毛', irides: '瞳孔', eyewhite: '眼白',
  eyewear: '眼鏡', ears: '耳朵', earwear: '耳飾', nose: '鼻子', mouth: '嘴', neck: '脖子', neckwear: '頸飾', topwear: '上衣', handwear: '手部',
  bottomwear: '下裝', legwear: '腿部', footwear: '鞋子', tail: '尾巴', wings: '翅膀', objects: '物件',
};

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/** 舊版素材貼圖（stickers）轉成圖層 */
export function stickersToLayers(stickers = []) {
  const map = { back: 'bg', front: 'outer', top: 'top' };
  return stickers.map(s => ({ id: s.id || uid('ly'), name: s.name || '素材', group: map[s.layer] || 'outer', visible: true, opacity: s.opacity ?? 1, full: false,
    x: s.x, y: s.y, w: s.w, rot: s.rot || 0, flip: !!s.flip, ar: s.ar || 1, src: s.src, kind: 'asset' }));
}

export async function layerImage(l) {
  if (l.img) return l.img;
  if (l.blob) { l.img = await loadImage(l.blob); return l.img; }
  if (l.src) { l.img = await loadSrc(l.src); return l.img; }
  return null;
}

export const hasCrop = l => !!l.crop && (l.crop.l > 0 || l.crop.t > 0 || l.crop.r > 0 || l.crop.b > 0);
export const isDefaultPlace = l => (l.x ?? .5) === .5 && (l.y ?? .5) === .5 && (l.w ?? 1) === 1 && !l.rot && !l.flip && !hasCrop(l);

/** 以 (0,0) 為中心畫出 sw×sh 的圖；有裁切時只畫保留的區塊（位置不變，像遮罩） */
function blit(g, img, sw, sh, crop) {
  if (!crop) { g.drawImage(img, -sw / 2, -sh / 2, sw, sh); return; }
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const fw = Math.max(.01, 1 - crop.l - crop.r), fh = Math.max(.01, 1 - crop.t - crop.b);
  g.drawImage(img, crop.l * iw, crop.t * ih, fw * iw, fh * ih, -sw / 2 + crop.l * sw, -sh / 2 + crop.t * sh, fw * sw, fh * sh);
}

/** 把一個圖層畫到 W×H 的畫布上。整張圖層預設鋪滿，移動 / 縮放 / 旋轉後以卡片比例變形；其他依位置 / 大小 / 旋轉 */
export async function drawLayer(g, W, H, l, override = null) {
  const img = override || await layerImage(l);
  if (!img) return;
  g.save();
  g.globalAlpha = l.opacity ?? 1;
  if (l.full && isDefaultPlace(l)) g.drawImage(img, 0, 0, W, H);
  else if (l.full) {
    const sw = (l.w ?? 1) * W, sh = (l.w ?? 1) * H;
    g.translate((l.x ?? .5) * W, (l.y ?? .5) * H); g.rotate((l.rot || 0) * Math.PI / 180); g.scale(l.flip ? -1 : 1, 1);
    blit(g, img, sw, sh, hasCrop(l) ? l.crop : null);
  } else {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const sw = l.w * W, sh = sw * ih / iw;
    g.translate(l.x * W, l.y * H); g.rotate((l.rot || 0) * Math.PI / 180); g.scale(l.flip ? -1 : 1, 1);
    blit(g, img, sw, sh, hasCrop(l) ? l.crop : null);
  }
  g.restore();
}

/** 合成某一組的圖層（陣列順序 = 由下到上） */
export async function compositeGroup(layers, group, W, H, base = null, overrides = null) {
  const c = canvasOf(W, H), g = c.getContext('2d');
  if (base) g.drawImage(base, 0, 0, W, H);
  for (const l of layers) if (l.group === group && l.visible !== false) await drawLayer(g, W, H, l, overrides?.get(l.id));
  return c;
}

/** 原圖圖層：沒有的話補一個（放在主體組最下面）。已有拆層部件時預設隱藏，避免人物重複 */
export function ensureOriginalLayer(layers, { cardId, imageBlob }) {
  if (layers.some(l => l.kind === 'original')) return layers;
  const hasSubject = layers.some(l => l.group === 'subject' && l.visible !== false);
  return [{ id: uid('ly'), name: '原圖', group: 'subject', visible: !hasSubject, opacity: 1, full: true, kind: 'original',
    ...(cardId ? { src: 'card:' + cardId } : { blob: imageBlob }), x: .5, y: .5, w: 1, rot: 0, flip: false }, ...layers];
}

/** 由圖片的 alpha 做白色遮罩 */
export function alphaMask(src) {
  const m = canvasOf(src.width, src.height), g = m.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, m.width, m.height);
  return m;
}

/** 單一圖層輸出成裁到內容範圍的透明 PNG（存成素材卡用） */
export async function layerToBlob(l, W, H) {
  const c = canvasOf(W, H);
  await drawLayer(c.getContext('2d'), W, H, { ...l, opacity: 1 });
  const g = c.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const out = canvasOf(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return canvasToBlob(out);
}

/** 存進資料庫前：拿掉執行期的圖片物件 */
export const serializeLayers = layers => (layers || []).map(({ img, ...l }) => l);
