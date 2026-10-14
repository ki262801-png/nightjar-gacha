// 讀取使用者電腦裡的游標檔：Windows 的 .cur / .ico、動畫游標 .ani，或一般圖片（PNG / SVG / GIF / WebP）
// 統一轉成瀏覽器能當游標用的 PNG（最大 128×128），並讀出熱點（游標實際點擊的那一點）
// .ani 會拆成一張張影格與每格的停留時間，由 theme.js 輪播成動畫

const MAX = 128;

/** 讀 ICO / CUR 檔頭：每個尺寸的寬高與熱點（CUR 才有熱點，ICO 為 0,0） */
function icoEntries(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 6 || v.getUint16(0, true) !== 0) return null;
  const type = v.getUint16(2, true), n = v.getUint16(4, true);
  if ((type !== 1 && type !== 2) || !n) return null;
  const list = [];
  for (let i = 0; i < n && 6 + i * 16 + 16 <= v.byteLength; i++) {
    const o = 6 + i * 16;
    list.push({ w: v.getUint8(o) || 256, h: v.getUint8(o + 1) || 256, x: type === 2 ? v.getUint16(o + 4, true) : 0, y: type === 2 ? v.getUint16(o + 6, true) : 0 });
  }
  return { type, list };
}

function decode(blob) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('無法讀取這個圖片')); };
    img.src = url;
  });
}

/** 一張圖（含 ICO/CUR）→ { url: PNG data URL, x, y } */
async function frameFrom(buf, mime, hotspot = null) {
  const blob = new Blob([buf], { type: mime });
  const head = mime === 'image/x-icon' ? icoEntries(buf) : null;
  let img;
  try { img = await decode(blob); }
  catch {
    // 瀏覽器解不開（少數舊格式）：直接拿原檔當游標
    const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    const e = head?.list[0];
    return { url, x: e?.x || 0, y: e?.y || 0, w: e?.w || 32, h: e?.h || 32 };
  }
  const nw = img.naturalWidth || 32, nh = img.naturalHeight || 32;
  const s = Math.min(1, MAX / Math.max(nw, nh));
  const c = document.createElement('canvas'); c.width = Math.round(nw * s); c.height = Math.round(nh * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  let x = 0, y = 0;
  if (head) {
    const e = head.list.find(e => e.w === nw) || head.list.reduce((a, b) => (b.w > a.w ? b : a));
    x = e.x * (nw / e.w); y = e.y * (nh / e.h);
  } else if (hotspot) { x = hotspot.x; y = hotspot.y; }
  return { url: c.toDataURL('image/png'), x: Math.round(x * s), y: Math.round(y * s), w: c.width, h: c.height };
}

/** 解析 .ani（RIFF ACON） */
async function parseAni(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'ACON') throw new Error('不是有效的 .ani 動畫游標');
  let jif = 10, rates = null, seq = null; const icons = [];
  const walk = (start, end) => {
    for (let o = start; o + 8 <= end;) {
      const id = tag(o), size = v.getUint32(o + 4, true), body = o + 8;
      if (id === 'anih' && size >= 36) jif = v.getUint32(body + 28, true) || 10;
      else if (id === 'rate') rates = Array.from({ length: size / 4 }, (_, i) => v.getUint32(body + i * 4, true));
      else if (id === 'seq ') seq = Array.from({ length: size / 4 }, (_, i) => v.getUint32(body + i * 4, true));
      else if (id === 'LIST' && tag(body) === 'fram') walk(body + 4, body + size);
      else if (id === 'icon') icons.push(buf.slice(body, body + size));
      o = body + size + (size & 1);
    }
  };
  walk(12, buf.byteLength);
  if (!icons.length) throw new Error('.ani 裡沒有找到影格');
  const frames = [];
  for (const ic of icons) frames.push(await frameFrom(ic, 'image/x-icon'));
  const order = seq && seq.length ? seq.filter(i => i < frames.length) : frames.map((_, i) => i);
  return {
    frames: order.map(i => frames[i]),
    delays: order.map((_, k) => Math.max(16, ((rates && rates[k]) || jif) * 1000 / 60)),   // 單位是 1/60 秒
  };
}

/** 主入口：回傳 { name, frames: [{url, x, y}], delays: [ms] } */
export async function readCursorFile(file) {
  const buf = await file.arrayBuffer(), name = file.name;
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'ani') return { name, ...(await parseAni(buf)) };
  if (ext === 'cur' || ext === 'ico') return { name, frames: [await frameFrom(buf, 'image/x-icon')], delays: [0] };
  const mime = file.type || (ext === 'svg' ? 'image/svg+xml' : 'image/png');
  return { name, frames: [await frameFrom(buf, mime, { x: 0, y: 0 })], delays: [0] };
}
