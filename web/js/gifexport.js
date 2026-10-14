// GIF 輸出：閃卡（逐格畫出一圈無縫循環的傾斜反光）與 LIVE 動態（即時擷取）
// 編碼用 gifenc（MIT，© Matt DesLauriers，https://github.com/mattdesl/gifenc）：每一格各自挑 256 色，畫質比共用色盤好
const GIFENC = 'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js';

export const GIF_QUALITY = [
  ['std', '標準：長邊 480、15 fps（檔案小，適合聊天軟體）', { max: 480, fps: 15 }],
  ['hd', '高清：長邊 720、20 fps', { max: 720, fps: 20 }],
  ['uhd', '超清：長邊 960、24 fps（檔案很大）', { max: 960, fps: 24 }],
];
export const qualityOf = id => (GIF_QUALITY.find(q => q[0] === id) || GIF_QUALITY[1])[2];

const nextTick = () => new Promise(r => setTimeout(r, 0));

/** 把一串畫格（canvas / ImageBitmap）編成 GIF。transparent = 保留透明（圓角外面） */
export async function encodeGif(frames, { w, h, fps = 15, transparent = false, onProgress } = {}) {
  const { GIFEncoder, quantize, applyPalette } = await import(GIFENC);
  const gif = GIFEncoder();
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  const delay = Math.round(1000 / fps);
  for (let i = 0; i < frames.length; i++) {
    g.clearRect(0, 0, w, h);
    g.drawImage(frames[i], 0, 0, w, h);
    frames[i].close?.();                                  // ImageBitmap 用完就釋放記憶體
    const { data } = g.getImageData(0, 0, w, h);
    const palette = quantize(data, 256, transparent ? { format: 'rgba4444', oneBitAlpha: true } : { format: 'rgb565' });
    const index = applyPalette(data, palette, transparent ? 'rgba4444' : 'rgb565');
    const ti = transparent ? palette.findIndex(p => p[3] === 0) : -1;
    gif.writeFrame(index, w, h, { palette, delay, ...(ti >= 0 ? { transparent: true, transparentIndex: ti } : {}), dispose: transparent ? 2 : -1 });
    onProgress?.((i + 1) / frames.length);
    if (i % 3 === 2) await nextTick();
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

const fitSize = (w, h, max) => { const s = Math.min(1, max / Math.max(w, h)); return [Math.max(2, Math.round(w * s)), Math.max(2, Math.round(h * s))]; };

/** 閃卡 GIF：沿著一個「8 字」路徑傾斜一圈（頭尾銜接、無縫循環），每格用同一套 WebGL 效果畫 */
export async function holoGif(holo, { quality = 'hd', seconds = 3, onProgress } = {}) {
  if (!holo?.base) throw new Error('閃卡還沒準備好');
  const q = qualityOf(quality);
  const [w, h] = fitSize(holo.base.width, holo.base.height, q.max);
  const n = Math.max(8, Math.round(seconds * q.fps));
  const c = holo.canvas, keep = [c.width, c.height, holo.rx, holo.ry, holo.time];
  const r = Math.min(w, h) * .05;                         // 圓角，和卡片外觀一致
  const frames = [];
  holo.capturing = true;
  try {
    c.width = w; c.height = h;
    for (let i = 0; i < n; i++) {
      const t = i / n * Math.PI * 2;
      holo.ry = Math.sin(t) * 22; holo.rx = Math.sin(t * 2) * 9;   // 8 字形：左右擺一圈、上下擺兩次
      holo.time = keep[4] + i / q.fps;
      holo.draw();
      const f = document.createElement('canvas'); f.width = w; f.height = h;
      const fg = f.getContext('2d');
      fg.beginPath(); fg.roundRect ? fg.roundRect(0, 0, w, h, r) : fg.rect(0, 0, w, h); fg.clip();
      fg.drawImage(c, 0, 0);
      frames.push(f);
      onProgress?.((i + 1) / n * .4);
      if (i % 4 === 3) await nextTick();
    }
  } finally {
    [c.width, c.height, holo.rx, holo.ry, holo.time] = keep; holo.capturing = false;
  }
  return encodeGif(frames, { w, h, fps: q.fps, transparent: true, onProgress: f => onProgress?.(.4 + f * .6) });
}

/** LIVE 動態 GIF：即時擷取幾秒（只取圖片範圍，不含預覽外框） */
export function liveGif(stage, opts = {}) {
  return stage.withImageSize(() => liveGifNow(stage, opts), qualityOf(opts.quality || 'hd').max);   // 用圖片本身的大小畫，GIF 不受預覽視窗大小限制
}
async function liveGifNow(stage, { quality = 'hd', seconds = 4, onProgress } = {}) {
  const q = qualityOf(quality);
  const rect = stage.imageRect();
  const [w, h] = fitSize(rect.w, rect.h, q.max);
  const frames = [], n = Math.max(4, Math.round(seconds * q.fps));
  const buf = document.createElement('canvas'); buf.width = w; buf.height = h;
  const bg = buf.getContext('2d');
  stage.play();
  let last = 0;
  await new Promise(resolve => {
    stage.onFrame = () => {
      const now = performance.now();
      if (now - last < 1000 / q.fps - 2) return;
      last = now;
      bg.clearRect(0, 0, w, h);
      bg.drawImage(stage.canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
      bg.drawImage(stage.fxCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
      frames.push(createImageBitmap(buf));
      onProgress?.(frames.length / n * .4);
      if (frames.length >= n) { stage.onFrame = null; resolve(); }
    };
  });
  const bitmaps = await Promise.all(frames);
  return encodeGif(bitmaps, { w, h, fps: q.fps, onProgress: f => onProgress?.(.4 + f * .6) });
}

/** 選 GIF 品質與長度；取消回傳 null */
export async function askGif(title, { seconds = 4, max = 8, note = '' } = {}) {
  const { modal, h } = await import('./util.js');
  const body = h(`<div class="gif-ask">
    ${note ? `<p class="modal-text">${note}</p>` : ''}
    <div class="choice-list">${GIF_QUALITY.map(([id, n], i) => `<button class="choice ${i === 1 ? 'on' : ''}" data-v="${id}"><b>${n.split('：')[0]}</b><small>${n.split('：')[1]}</small></button>`).join('')}</div>
    <label class="fld slider"><span>長度（秒） <em>越長檔案越大</em></span><div class="slider-row"><input type="range" class="gif-sec" min="1" max="${max}" step="1" value="${seconds}"><output class="num gif-sec-out">${seconds}</output></div></label>
  </div>`);
  return modal({
    title, body,
    actions: [{ label: '取消', value: null, kind: 'ghost' }, { label: '開始製作', kind: 'primary', value: b => ({ quality: b.querySelector('.choice.on').dataset.v, seconds: +b.querySelector('.gif-sec').value }) }],
    onOpen: b => {
      b.querySelectorAll('.choice').forEach(c => c.onclick = () => b.querySelectorAll('.choice').forEach(x => x.classList.toggle('on', x === c)));
      const s = b.querySelector('.gif-sec'); s.oninput = () => { b.querySelector('.gif-sec-out').textContent = s.value; };
    },
  });
}
