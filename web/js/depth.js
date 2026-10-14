// 深度估計：在瀏覽器內跑 Depth Anything（Transformers.js），第一次會下載模型並由瀏覽器快取
// 精度：直接拿模型輸出的浮點深度，存成 16 位元（紅 = 高位、綠 = 低位、藍 = 高位，舊程式當灰階讀也大致正確），
//       調整遠近、對比時先在浮點上算完才轉成 8 位元，拉大對比也不會出現一圈一圈的色階
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
export const DEPTH_MODELS = [
  { id: 'onnx-community/depth-anything-v2-small', name: 'V2 Small（快，約 25–50 MB）', gpu: 'fp16', cpu: 'q8' },
  { id: 'onnx-community/depth-anything-v2-base', name: 'V2 Base（較精細，約 100–190 MB）', gpu: 'fp16', cpu: 'q8' },
  { id: 'onnx-community/depth-anything-v2-large', name: 'V2 Large（最精細，約 230–330 MB，建議有顯卡）', gpu: 'q4f16', gpu32: 'q4', cpu: 'q8' },
  { id: 'onnx-community/depth-anything-v3-small', name: 'V3 Small（2025 新版，整體遠近關係較準，約 100 MB）', v3: true },
];
export const DEPTH_RES = [[518, '標準 518（快）'], [770, '高 770（細節多，約慢 2 倍）'], [1036, '超高 1036（頭髮、邊緣最細，慢）']];
let cached = { key: '', pipe: null, v3: null, T: null };

async function gpuInfo() {
  if (!navigator.gpu) return null;
  try { const a = await navigator.gpu.requestAdapter(); return a ? { f16: a.features.has('shader-f16') } : null; } catch { return null; }
}

/** 回傳 16 位元編碼的深度畫布（越亮越近）；opts.res = 推論解析度（短邊），opts.flipAvg = 左右翻轉再算一次取平均 */
export async function estimateDepth(source, { model = DEPTH_MODELS[0].id, res = 518, flipAvg = false, onProgress } = {}) {
  const T = await import(TRANSFORMERS);
  T.env.allowLocalModels = false;
  const files = {};
  const progress = e => {
    if (e.status === 'progress' && e.total) {
      files[e.file] = [e.loaded, e.total];
      const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
      onProgress?.(`下載模型 ${(l / 1048576).toFixed(1)} / ${(t / 1048576).toFixed(1)} MB`, l / t);
    }
  };
  const info = DEPTH_MODELS.find(m => m.id === model) || DEPTH_MODELS[0];
  const gpu = await gpuInfo();
  const key = model + (gpu ? ':gpu' + (gpu.f16 ? '16' : '32') : ':cpu');
  if (info.v3) return estimateV3(T, source, info, { gpu, key, res, flipAvg, onProgress, progress });
  if (cached.key !== key) {
    onProgress?.('載入深度模型…', 0);
    let pipe = null;
    if (gpu) {
      const dtype = gpu.f16 ? info.gpu : (info.gpu32 || 'fp32');
      try { pipe = await T.pipeline('depth-estimation', model, { device: 'webgpu', dtype, progress_callback: progress }); }
      catch (e) { console.warn('WebGPU 失敗，改用 CPU', e); }
    }
    pipe ??= await T.pipeline('depth-estimation', model, { device: 'wasm', dtype: info.cpu, progress_callback: progress });
    cached = { key, pipe, T };
  }
  const pipe = cached.pipe;
  pipe.processor.image_processor.size = { height: res, width: res };   // 短邊縮到這個大小再推論（保持比例）
  const img = source instanceof Blob ? await T.RawImage.fromBlob(source) : await T.RawImage.read(source);
  onProgress?.('分析深度中…', 1);
  const run = async im => { const out = await pipe(im); const p = out.predicted_depth; return { data: p.data, w: p.dims.at(-1), h: p.dims.at(-2) }; };
  const a = await run(img);
  if (flipAvg) {                                        // 左右翻轉再算一次、翻回來平均：比較穩定，雜訊少
    onProgress?.('翻轉再分析一次…', 1);
    averageFlipped(a, await run(await flipImage(T, img)));
  }
  return encode16(a.data, a.w, a.h);
}

/** Depth Anything V3：Transformers.js 還沒有現成的流程，自己做前處理、直接跑 ONNX。
 *  V3 輸出的是「距離」（越大越遠），轉成倒數 = 越亮越近，和 V2 一致 */
async function estimateV3(T, source, info, { gpu, key, res, flipAvg, onProgress, progress }) {
  if (cached.key !== key) {
    onProgress?.('載入深度模型…', 0);
    let model = null;
    if (gpu) { try { model = await T.AutoModel.from_pretrained(info.id, { device: 'webgpu', dtype: 'fp32', progress_callback: progress }); } catch (e) { console.warn('WebGPU 失敗，改用 CPU', e); } }
    model ??= await T.AutoModel.from_pretrained(info.id, { device: 'wasm', dtype: 'fp32', progress_callback: progress });
    const proc = await T.AutoImageProcessor.from_pretrained('onnx-community/depth-anything-v2-small');   // 同樣的 ImageNet 前處理、14 的倍數
    cached = { key, v3: { model, proc }, T };
  }
  const { model, proc } = cached.v3;
  proc.size = { height: res, width: res };
  const img = source instanceof Blob ? await T.RawImage.fromBlob(source) : await T.RawImage.read(source);
  onProgress?.('分析深度中…', 1);
  const run = async im => {
    const { pixel_values } = await proc(im);
    const out = await model.sessions.model.run({ pixel_values: pixel_values.unsqueeze(1).ort_tensor });   // [批次, 視角, 3, 高, 寬]
    const pd = out.predicted_depth, data = pd.data ?? await pd.getData();
    const inv = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) inv[i] = 1 / Math.max(1e-4, data[i]);
    return { data: inv, w: pd.dims.at(-1), h: pd.dims.at(-2) };
  };
  const a = await run(img);
  if (flipAvg) {
    onProgress?.('翻轉再分析一次…', 1);
    const b = await run(await flipImage(T, img));
    averageFlipped(a, b);
  }
  return encode16(a.data, a.w, a.h);
}

async function flipImage(T, img) {
  const c = img.toCanvas(), f = document.createElement('canvas'); f.width = c.width; f.height = c.height;
  const fg = f.getContext('2d'); fg.translate(f.width, 0); fg.scale(-1, 1); fg.drawImage(c, 0, 0);
  return T.RawImage.fromCanvas(f);
}
function averageFlipped(a, b) {
  if (b.w !== a.w || b.h !== a.h) return;
  const out = new Float32Array(a.data.length);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const i = y * a.w + x; out[i] = (a.data[i] + b.data[y * a.w + (a.w - 1 - x)]) / 2; }
  a.data = out;
}

/** 浮點深度 → 16 位元畫布 */
function encode16(data, w, h) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < data.length; i++) { const v = data[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const k = 65535 / Math.max(1e-6, mx - mn);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let i = 0; i < w * h; i++) {
    const v = Math.round((data[i] - mn) * k), hi = v >> 8;
    d[i * 4] = hi; d[i * 4 + 1] = v & 255; d[i * 4 + 2] = hi; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** 讀深度畫布成 0~1 浮點（自動判斷 16 位元或一般灰階）；同一張畫布會快取 */
const floatCache = new WeakMap();
function readDepth(raw) {
  const hit = floatCache.get(raw);
  if (hit) return hit;
  const w = raw.width, h = raw.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(raw, 0, 0);
  const d = g.getImageData(0, 0, w, h).data, n = w * h;
  // 一般灰階深度圖 R = G = B；16 位元編碼的 R = B、G 是低位元組（會和 R 差很多）
  let enc = 0, gray = 0;
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 4000))) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
    if (Math.abs(r - b) <= 1 && Math.abs(r - gg) > 3) enc++; else if (r === gg && gg === b) gray++;
  }
  const is16 = enc > gray * .5 && enc > 20;
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = is16 ? (d[i * 4] * 256 + d[i * 4 + 1]) / 65535 : d[i * 4] / 255;
  const out = { f, w, h, is16 };
  floatCache.set(raw, out);
  return out;
}

/** 雙線性取樣縮放浮點圖 */
function resample({ f, w, h }, W, H) {
  if (W === w && H === h) return Float32Array.from(f);
  const o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.max(0, (y + .5) * h / H - .5)), y0 = Math.floor(sy), y1 = Math.min(h - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.max(0, (x + .5) * w / W - .5)), x0 = Math.floor(sx), x1 = Math.min(w - 1, x0 + 1), fx = sx - x0;
      const a = f[y0 * w + x0] + (f[y0 * w + x1] - f[y0 * w + x0]) * fx, b = f[y1 * w + x0] + (f[y1 * w + x1] - f[y1 * w + x0]) * fx;
      o[y * W + x] = a + (b - a) * fy;
    }
  }
  return o;
}

/** 聯合雙邊濾波：用原圖的顏色當參考，只和「顏色相近的鄰居」平均。
 *  同一塊顏色裡的深度雜訊被抹平，顏色交界（人物輪廓、髮絲）的深度邊緣保持銳利並對齊原圖 */
function jointBilateral(v, G, w, h, r, sc) {
  const out = new Float32Array(w * h);
  const step = r > 4 ? 2 : 1, ss = 1 / (2 * (r * .6) ** 2);
  const ox = [], oy = [], ow = [];
  for (let dy = -r; dy <= r; dy += step) for (let dx = -r; dx <= r; dx += step) { ox.push(dx); oy.push(dy); ow.push(Math.exp(-(dx * dx + dy * dy) * ss)); }
  const n = ox.length, OX = Int32Array.from(ox), OY = Int32Array.from(oy), OW = Float32Array.from(ow);
  const LUT = new Float32Array(1025), inv = 1 / (2 * sc * sc);   // 顏色距離² (0~3) → 權重
  for (let k = 0; k <= 1024; k++) LUT[k] = Math.exp(-(k / 1024 * 3) * inv);
  const toK = 1024 / 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, i3 = i * 3, r0 = G[i3], g0 = G[i3 + 1], b0 = G[i3 + 2];
    let sum = 0, wt = 0;
    for (let k = 0; k < n; k++) {
      const xx = x + OX[k], yy = y + OY[k];
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx, j3 = j * 3, dr = G[j3] - r0, dg = G[j3 + 1] - g0, db = G[j3 + 2] - b0;
      const c = LUT[Math.min(1024, ((dr * dr + dg * dg + db * db) * toK) | 0)] * OW[k];
      sum += v[j] * c; wt += c;
    }
    out[i] = sum / wt;
  }
  return out;
}

const guideCache = new WeakMap();
function guideRGB(img, w, h) {
  const hit = guideCache.get(img);
  if (hit && hit.w === w && hit.h === h) return hit.G;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, G = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { G[i * 3] = d[i * 4] / 255; G[i * 3 + 1] = d[i * 4 + 1] / 255; G[i * 3 + 2] = d[i * 4 + 2] / 255; }
  guideCache.set(img, { w, h, G });
  return G;
}

/** 邊緣貼合（在調整曲線之前做，結果依「深度圖 + 強度」快取） */
const edgeCache = new WeakMap();
function refineEdges(raw, v, guide, w, h, edge) {
  const hit = edgeCache.get(raw);
  if (hit && hit.edge === edge && hit.w === w && hit.guide === guide) return Float32Array.from(hit.v);
  const G = guideRGB(guide, w, h);
  const r = Math.max(2, Math.round(w / 700 * (2 + edge * 4)));
  let out = jointBilateral(v, G, w, h, r, .03 + (1 - edge) * .09);
  if (edge > .6) out = jointBilateral(out, G, w, h, 2, .04);   // 強一點時再修一次
  edgeCache.set(raw, { edge, w, guide, v: out });
  return Float32Array.from(out);
}

/** near / far：裁切；gamma：遠近對比；sep：主體分離（S 曲線）；layers：分成幾層（0 = 連續）；
 *  edge：邊緣貼合（需要 guide = 原圖）；blur：柔化；invert：反轉 */
export const DEFAULT_DEPTH = { near: 1, far: 0, gamma: 1, blur: 3, invert: false, sep: 0, layers: 0, edge: 0 };

/** 調整深度，輸出 8 位元灰階畫布（長邊最多 1024）；guide = 原圖（用於邊緣貼合，可省略） */
export function processDepth(raw, o = DEFAULT_DEPTH, guide = null) {
  o = { ...DEFAULT_DEPTH, ...o };
  const src = readDepth(raw);
  const s = Math.min(1, 1024 / Math.max(src.w, src.h));
  const w = Math.round(src.w * s), h = Math.round(src.h * s);
  let v = resample(src, w, h);
  if (o.edge > 0 && guide) v = refineEdges(raw, v, guide, w, h, o.edge);
  const near = Math.max(o.near, o.far + .02), far = o.far, gm = o.gamma, sep = o.sep || 0, L = Math.round(o.layers || 0);
  const ex = 1 + sep * 3;
  for (let i = 0; i < v.length; i++) {
    let x = Math.min(1, Math.max(0, (v[i] - far) / (near - far)));
    if (sep > 0) x = x < .5 ? .5 * Math.pow(2 * x, ex) : 1 - .5 * Math.pow(2 * (1 - x), ex);   // 中間拉開：主體和背景分得更清楚
    x = Math.pow(x, gm);
    if (L >= 2) x = Math.round(x * (L - 1)) / (L - 1);   // 分層：像紙雕一樣一片一片
    v[i] = x;
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  for (let i = 0; i < v.length; i++) { const x = (o.invert ? 1 - v[i] : v[i]) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = x; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  if (o.blur > 0) {
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const tg = t.getContext('2d');
    tg.filter = `blur(${o.blur * w / 1024}px)`;
    tg.drawImage(c, 0, 0);
    return t;
  }
  return c;
}
