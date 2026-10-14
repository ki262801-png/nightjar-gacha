// NovelAI 參數表、請求組裝、與本機轉發伺服器溝通
import { bytesToBase64, imageToPngBase64, sha1, canvasToBlob } from './util.js';
import { naiRoute, relayURL } from './env.js';

export const MODELS = [
  { id: 'nai-diffusion-4-5-full', name: 'V4.5 Full', ver: 4.5, charRef: true },
  { id: 'nai-diffusion-4-5-curated', name: 'V4.5 Curated', ver: 4.5 },
  { id: 'nai-diffusion-4-full', name: 'V4 Full', ver: 4 },
  { id: 'nai-diffusion-4-curated-preview', name: 'V4 Curated', ver: 4 },
  { id: 'nai-diffusion-3', name: 'V3 Anime', ver: 3 },
  { id: 'nai-diffusion-furry-3', name: 'V3 Furry', ver: 3 },
  { id: 'nai-diffusion-5-full', name: 'V5 Full', ver: 5 },
  { id: 'nai-diffusion-5-curated', name: 'V5 Curated', ver: 5 },
];
export const modelInfo = id => MODELS.find(m => m.id === id) || MODELS[0];

export const SAMPLERS = [
  ['k_euler_ancestral', 'Euler Ancestral'], ['k_euler', 'Euler'], ['k_dpmpp_2s_ancestral', 'DPM++ 2S Ancestral'],
  ['k_dpmpp_2m_sde', 'DPM++ 2M SDE'], ['k_dpmpp_2m', 'DPM++ 2M'], ['k_dpmpp_sde', 'DPM++ SDE'], ['ddim_v3', 'DDIM（僅 V3）'],
];
export const SCHEDULES = [['karras', 'Karras'], ['exponential', 'Exponential'], ['polyexponential', 'Polyexponential'], ['native', 'Native（僅 V3）']];

export const SIZES = [
  ['portrait', '直式 832×1216', 832, 1216], ['landscape', '橫式 1216×832', 1216, 832], ['square', '方形 1024×1024', 1024, 1024],
  ['portrait-l', '大直式 1024×1536', 1024, 1536], ['landscape-l', '大橫式 1536×1024', 1536, 1024], ['square-l', '大方形 1472×1472', 1472, 1472],
  ['portrait-s', '小直式 512×768', 512, 768], ['custom', '自訂', 0, 0],
];

const QUALITY = {
  'nai-diffusion-3': 'best quality, amazing quality, very aesthetic, absurdres',
  'nai-diffusion-furry-3': '{best quality}, {amazing quality}',
  'nai-diffusion-4-curated-preview': 'rating:general, amazing quality, very aesthetic, absurdres',
  'nai-diffusion-4-full': 'no text, best quality, very aesthetic, absurdres',
  'nai-diffusion-4-5-curated': 'location, masterpiece, no text, -0.8::feet::, rating:general',
  'nai-diffusion-4-5-full': 'location, very aesthetic, masterpiece, no text',
  'nai-diffusion-5-full': 'very aesthetic, masterpiece, no text',
  'nai-diffusion-5-curated': 'very aesthetic, masterpiece, no text',
};

const HEAVY45 = 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';
const HEAVY45C = 'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page';
const HEAVY3 = 'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]';
const FURRY = '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic';
const HUMAN = ', @_@, mismatched pupils, glowing eyes, bad anatomy';
// 預設負面詞（UC Preset），與官網一致：0 Heavy / 1 Light / 2 Furry / 3 Human / 4 None
const UC = {
  'nai-diffusion-4-5-full': [HEAVY45, 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page', FURRY, HEAVY45 + HUMAN, ''],
  'nai-diffusion-4-5-curated': [HEAVY45C, 'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page', FURRY, HEAVY45C + HUMAN, ''],
  'nai-diffusion-4-full': ['blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks', 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing', FURRY, '', ''],
  'nai-diffusion-4-curated-preview': ['blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts', 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature', FURRY, '', ''],
  'nai-diffusion-3': [HEAVY3, 'lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing', FURRY, HEAVY3 + ', bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes', ''],
  'nai-diffusion-furry-3': ['{{worst quality}}, [displeasing], {unusual pupils}, guide lines, {{unfinished}}, {bad}, url, artist name, {{tall image}}, mosaic, {sketch page}, comic panel, impact (font), [dated], {logo}, ych, {what}, {where is your god now}, {distorted text}, repeated text, {floating head}, {1994}, {widescreen}, absolutely everyone, sequence, {compression artifacts}, hard translated, {cropped}, {commissioner name}, unknown text, high contrast', '{worst quality}, guide lines, unfinished, bad, url, tall image, widescreen, compression artifacts, unknown text', FURRY, '', ''],
  'nai-diffusion-5-full': [HEAVY45, 'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::', FURRY, HEAVY45 + HUMAN, ''],
};
UC['nai-diffusion-5-curated'] = UC['nai-diffusion-5-full'];
export const UC_NAMES = ['Heavy（強）', 'Light（輕）', 'Furry Focus', 'Human Focus', '不使用'];

export const DEFAULT_PARAMS = {
  model: 'nai-diffusion-4-5-full', size: 'portrait', width: 832, height: 1216,
  steps: 28, scale: 5, cfg_rescale: 0, sampler: 'k_euler_ancestral', noise_schedule: 'karras',
  seed: -1, qualityToggle: true, ucPreset: 0, variety: false, sm: false, sm_dyn: false, decrisp: false,
  img2img: { enabled: false, image: '', strength: 0.7, noise: 0 },
  vibes: [], normalizeVibes: true,
  charRef: { enabled: false, image: '', strength: 1, fidelity: 1, styleAware: true },
  demo: false,
};

/** 套用卡池的模型 / 尺寸 / 透明背景覆寫 */
export function effectiveParams(params, banner) {
  const p = { ...params, transparent: !!banner?.transparent };
  if (banner?.model) p.model = banner.model;
  const sz = banner?.size && SIZES.find(s => s[0] === banner.size);
  if (sz && sz[2]) { p.width = sz[2]; p.height = sz[3]; }
  if (p.transparent && modelInfo(p.model).ver >= 5) { p.noise_schedule = 'karras'; p.vibes = []; }
  return p;
}

/** 卡池提示詞的隨機語法：<A|B|C> 每次抽卡隨機挑一個，可巢狀 */
export function expandRandom(text) {
  let s = String(text || ''), guard = 0;
  const re = /<([^<>]*)>/;
  while (re.test(s) && guard++ < 200) {
    s = s.replace(re, (_, body) => { const opts = body.split('|'); return opts[Math.floor(Math.random() * opts.length)].trim(); });
  }
  return s.replace(/\s*,\s*,+/g, ',').trim();
}
const joinTags = (...xs) => xs.map(x => (x || '').trim().replace(/^,|,$/g, '').trim()).filter(Boolean).join(', ');

export function validate(p) {
  const w = +p.width, h = +p.height;
  if (w % 64 || h % 64 || w < 64 || h < 64 || w > 2048 || h > 2048) throw new Error('寬高須為 64 的倍數，介於 64–2048');
  if (w * h > 3145728) throw new Error('總像素超過 NovelAI 上限（約 1792×1792）');
  if (p.steps < 1 || p.steps > 50) throw new Error('步數須在 1–50 之間');
  const v = modelInfo(p.model).ver;
  if (v >= 4 && p.noise_schedule === 'native') throw new Error('V4 以上不支援 Native 噪點排程');
  if (v >= 4 && p.sampler === 'ddim_v3') throw new Error('DDIM 只支援 V3');
  if (v >= 5 && p.noise_schedule !== 'karras') throw new Error('V5 目前只支援 Karras');
  if (v >= 5 && p.vibes.some(x => x.enabled !== false)) throw new Error('V5 尚未接入 Vibe Transfer，請先停用參考圖');
  if (p.transparent && v < 5) throw new Error('透明背景需要 V5 模型');
}

/** 組出送往 /ai/generate-image 的完整請求 */
export async function buildPayload({ params: p, prompt, negative, characters = [], useCoords = false, seed }) {
  validate(p);
  const m = modelInfo(p.model), v = m.ver;
  const width = +p.width, height = +p.height;
  seed = seed ?? (p.seed >= 0 ? +p.seed : Math.floor(Math.random() * 4294967295));
  let input = p.qualityToggle ? joinTags(prompt, QUALITY[m.id]) : joinTags(prompt);
  if (p.transparent) input = joinTags(input, 'transparent background, has alpha');
  if (!input) throw new Error('提示詞是空的');
  const uc = joinTags((UC[m.id] || [])[p.ucPreset] || '', negative);

  const params = {
    params_version: v >= 5 ? 4 : 3, width, height, scale: +p.scale, sampler: p.sampler, steps: +p.steps, seed,
    n_samples: 1, ucPreset: +p.ucPreset, qualityToggle: !!p.qualityToggle,
    dynamic_thresholding: v < 4 && !!p.decrisp, controlnet_strength: 1, legacy: false, add_original_image: true,
    cfg_rescale: +p.cfg_rescale, noise_schedule: p.noise_schedule, legacy_v3_extend: false,
    skip_cfg_above_sigma: p.variety ? (v < 4 ? 19 : +(19.343056794463642 * Math.sqrt(width * height / 1011712)).toFixed(4)) : null,
    negative_prompt: uc, deliberate_euler_ancestral_bug: false, prefer_brownian: true,
  };
  if (v < 4) Object.assign(params, { sm: !!p.sm, sm_dyn: !!(p.sm && p.sm_dyn), uncond_scale: 1 });

  if (v >= 4) {
    const chars = characters.filter(c => c.enabled !== false && c.prompt.trim()).slice(0, 6)
      .map(c => ({ prompt: expandRandom(c.prompt), uc: c.uc || '', center: { x: +c.x || .5, y: +c.y || .5 } }));
    Object.assign(params, {
      autoSmea: false, use_coords: useCoords && chars.length > 0, legacy_uc: false,
      normalize_reference_strength_multiple: !!p.normalizeVibes, inpaintImg2ImgStrength: 1,
      characterPrompts: chars.map(c => ({ ...c, enabled: true })),
      v4_prompt: { caption: { base_caption: input, char_captions: chars.map(c => ({ char_caption: c.prompt, centers: [c.center] })) }, use_coords: useCoords && chars.length > 0, use_order: true },
      v4_negative_prompt: { caption: { base_caption: uc, char_captions: chars.map(c => ({ char_caption: c.uc, centers: [c.center] })) }, legacy_uc: false },
    });
  }
  if (v >= 5) {
    // 依目前 V5 介面：移除舊欄位、改用 straight alpha 參數
    for (const k of ['ucPreset', 'qualityToggle', 'sm', 'sm_dyn', 'autoSmea']) delete params[k];
    Object.assign(params, { straight_alpha: !!p.transparent, tag_hint_transparent_background: !!p.transparent, image_format: 'png' });
  }

  let action = 'generate';
  if (p.img2img.enabled && p.img2img.image) {
    action = 'img2img';
    Object.assign(params, {
      image: await imageToPngBase64(p.img2img.image, width, height), strength: +p.img2img.strength,
      noise: +p.img2img.noise, extra_noise_seed: seed,
    });
  }

  const vibes = (p.vibes || []).filter(x => x.enabled !== false && x.image);
  if (vibes.length) {
    const encoded = [];
    for (const vb of vibes) encoded.push(v >= 4 ? await encodeVibe(vb, m.id) : await imageToPngBase64(vb.image, 448, 448, 'contain'));
    params.reference_image_multiple = encoded;
    params.reference_information_extracted_multiple = vibes.map(x => +x.info);
    params.reference_strength_multiple = vibes.map(x => +x.strength);
  }

  if (p.charRef.enabled && p.charRef.image) {
    if (!m.charRef) throw new Error('角色參考（Precise Reference）目前只支援 V4.5 Full');
    if (vibes.length) throw new Error('角色參考不能和 Vibe Transfer 同時使用');
    const img = await loadSize(p.charRef.image);
    const r = img.w / img.h;
    const [cw, ch] = r > 1.2 ? [1536, 1024] : r < .83 ? [1024, 1536] : [1472, 1472];
    Object.assign(params, {
      director_reference_images: [await imageToPngBase64(p.charRef.image, cw, ch, 'contain')],
      director_reference_descriptions: [{ caption: { base_caption: p.charRef.styleAware ? 'character&style' : 'character', char_captions: [] }, legacy_uc: false }],
      director_reference_information_extracted: [1],
      director_reference_strength_values: [+p.charRef.strength],
      director_reference_secondary_strength_values: [+(1 - p.charRef.fidelity).toFixed(3)],
    });
  }
  return { input, model: m.id, action, parameters: params, use_new_shared_trial: true };
}

async function loadSize(src) {
  const img = new Image(); img.src = src; await img.decode();
  return { w: img.naturalWidth, h: img.naturalHeight };
}

// ---------- 與本機伺服器溝通 ----------
let token = '';
export const setToken = t => { token = (t || '').trim(); };

// ---------- 自訂 API 位址（進階）：改送到第三方中轉；位址與金鑰只存在這個瀏覽器 ----------
let custom = { on: false, image: '', api: '', key: '' };
/** 只留下網址的根（貼完整的 …/ai/generate-image 也可以） */
export const cleanBase = u => String(u || '').trim().replace(/\/+$/, '').replace(/\/(ai\/generate-image|ai\/encode-vibe|user\/subscription)$/, '');
export function setCustomApi(c) {
  custom = { on: !!c?.on, image: cleanBase(c?.image), api: cleanBase(c?.api) || cleanBase(c?.image), key: String(c?.key || '').trim() };
}
export const customApi = () => ({ ...custom });
const usingCustom = () => custom.on && !!custom.image;
/** 目前要用的金鑰：自訂模式用自訂金鑰，否則用官方 Token */
const activeKey = () => usingCustom() ? custom.key : token;
export const hasToken = () => !!activeKey();

// ---------- 線上版：經由 Cloudflare 中繼直接呼叫 NovelAI（本機版由 server.py 代勞的部分在這裡做） ----------
const STATUS_TEXT = { 400: '參數被 NovelAI 拒絕', 401: 'Token 無效或已過期', 402: 'Anlas 不足或訂閱方案不支援此設定', 403: '請求被 NovelAI 拒絕',
  409: '帳號已有其他生成進行中，請稍候', 429: '請求太頻繁，請稍後再手動重試', 500: 'NovelAI 伺服器錯誤', 503: 'NovelAI 暫時無法服務' };
const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/** V5 模型改用 multipart：圖片欄位以檔案上傳，其餘放在 request JSON（和 server.py 的 multipart() 相同） */
function v5Form(payload) {
  const body = structuredClone(payload), fd = new FormData();
  for (const key of ['image', 'mask']) {
    if (body.parameters?.[key]) { fd.append(key, new Blob([b64ToBytes(body.parameters[key])], { type: 'image/png' }), 'blob'); body.parameters[key] = key; }
  }
  fd.append('request', new Blob([JSON.stringify(body)], { type: 'application/json' }), 'blob');
  return fd;
}

/** NovelAI 回傳的 zip / png / json 取出第一張 PNG（和 server.py 的 extract_png() 相同） */
async function extractPng(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  if (u8[0] === 0x89 && u8[1] === 0x50) return new Blob([u8], { type: 'image/png' });
  if (u8[0] === 0x50 && u8[1] === 0x4b) {                  // zip：從中央目錄找 .png
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('NovelAI 回傳的壓縮檔格式不正確');
    let p = dv.getUint32(eocd + 16, true);
    const n = dv.getUint16(eocd + 10, true), dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      if (name.toLowerCase().endsWith('.png')) {
        const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
        const data = u8.subarray(start, start + csize);
        if (method === 0) return new Blob([data], { type: 'image/png' });
        const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
        return new Blob([out], { type: 'image/png' });
      }
      p += 46 + nlen + xlen + clen;
    }
    throw new Error('NovelAI 沒有回傳 PNG 圖片');
  }
  const json = JSON.parse(new TextDecoder().decode(u8));
  return new Blob([b64ToBytes(json.images[0].image)], { type: 'image/png' });
}

/** 瀏覽器直接呼叫 NovelAI 格式的 API。bases = { image, api }；who = 錯誤訊息裡的名稱 */
async function directCall(bases, key, path, body, as, who = 'NovelAI 中繼') {
  const req = {
    '/api/nai/generate': () => ({ url: '/ai/generate-image', accept: 'application/zip', body: String(body.model || '').startsWith('nai-diffusion-5') ? v5Form(body) : JSON.stringify(body) }),
    '/api/nai/encode-vibe': () => ({ url: '/ai/encode-vibe', accept: 'application/octet-stream', body: JSON.stringify(body) }),
    '/api/nai/subscription': () => ({ url: '/user/subscription', accept: 'application/json', method: 'GET' }),
  }[path]();
  const headers = { Authorization: 'Bearer ' + key, Accept: req.accept };
  if (typeof req.body === 'string') headers['Content-Type'] = 'application/json';
  const base = req.url === '/user/subscription' ? bases.api : bases.image;
  let res;
  try { res = await fetch(base + req.url, { method: req.method || 'POST', headers, body: req.body }); }
  catch {
    throw new Error(who === '自訂 API'
      ? '連不到自訂 API：可能是網址錯誤，或對方沒有開放網頁直接連線（CORS）。這種情況只有本機版能用，可以在設定按「測試連線」確認'
      : '連不到 NovelAI 中繼，請檢查網路；如果一直失敗，可能是中繼網址設定錯誤');
  }
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = String(j.message || j.error || '').slice(0, 300); } catch { }
    throw new Error(`${STATUS_TEXT[res.status] || 'NovelAI 回傳錯誤'}（HTTP ${res.status}）${detail ? '：' + detail : ''}`);
  }
  if (as === 'json') return res.json();
  const buf = await res.arrayBuffer();
  if (path === '/api/nai/generate') return extractPng(buf);
  return as === 'buffer' ? buf : new Blob([buf]);
}

async function relayCall(path, body, as) {
  const relay = relayURL();
  return directCall({ image: relay, api: relay }, token, path, body, as);
}

async function call(path, body, as = 'blob') {
  const route = await naiRoute();
  if (usingCustom()) {
    // 自訂位址：本機版交給本機伺服器轉送（不受 CORS 限制）；線上版由瀏覽器直接連
    if (route !== 'local') return directCall(custom, custom.key, path, body, as, '自訂 API');
    return localCall(path, body, as, { 'X-NJ-Upstream-Image': custom.image, 'X-NJ-Upstream-Api': custom.api });
  }
  if (route === 'relay') return relayCall(path, body, as);
  if (route === 'none') throw new Error('連不到本機伺服器：請用「啟動抽卡模擬器.cmd」開啟（線上版則需要在 config.js 設定 NovelAI 中繼網址）');
  return localCall(path, body, as);
}

async function localCall(path, body, as, extra = {}) {
  let res;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NAI-Token': activeKey(), ...extra }, body: JSON.stringify(body || {}) });
  } catch {
    throw new Error('連不到本機伺服器：請用「啟動抽卡模擬器.cmd」開啟，而不是直接開 HTML 檔');
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { }
    if (res.status === 404 || res.status === 501) msg = '本機伺服器沒有回應 NovelAI 介面：請用「啟動抽卡模擬器.cmd」開啟';
    throw new Error(msg);
  }
  return as === 'json' ? res.json() : as === 'buffer' ? res.arrayBuffer() : res.blob();
}

export async function generate(payload) {
  if (!activeKey()) throw new Error(usingCustom() ? '自訂 API 還沒有填金鑰（在「設定 → NovelAI 連線 → 自訂 API 位址」）' : '尚未輸入 NovelAI Token（在「設定」頁）；或開啟示範模式');
  return call('/api/nai/generate', payload);
}

const vibeMem = new Map();
async function encodeVibe(vb, model) {
  const key = await sha1(vb.image.slice(0, 200000) + '|' + vb.image.length + '|' + model + '|' + vb.info);
  vb.cache ??= {};
  if (vb.cache[key]) return vb.cache[key];
  if (vibeMem.has(key)) return vibeMem.get(key);
  const buf = await call('/api/nai/encode-vibe', { image: await imageToPngBase64(vb.image, 0, 0), information_extracted: +vb.info, model }, 'buffer');
  const b64 = bytesToBase64(buf);
  vibeMem.set(key, b64); vb.cache[key] = b64;
  return b64;
}

export async function subscription() {
  const s = await call('/api/nai/subscription', {}, 'json');
  const t = s.trainingStepsLeft || {};
  return { anlas: (t.fixedTrainingStepsLeft || 0) + (t.purchasedTrainingSteps || 0), tier: s.tier, active: s.active };
}

/** 測試自訂 API：不花 Anlas（查訂閱 + 送一個空的生圖請求，NovelAI 會在生成前就拒絕）
 *  回傳 { native, cors, online, local, notes[] } */
export async function testCustomApi(c) {
  const image = cleanBase(c.image), api = cleanBase(c.api) || image, key = String(c.key || '').trim();
  const notes = [];
  const probe = async (url, opts) => {
    try { const r = await fetch(url, opts); let j = null; try { j = await r.clone().json(); } catch { } return { ok: true, status: r.status, json: j }; }
    catch { return { ok: false }; }
  };
  const auth = { Authorization: 'Bearer ' + key };
  // 1. 瀏覽器直接連（= 線上版的情況）
  const dSub = await probe(api + '/user/subscription', { headers: { ...auth, Accept: 'application/json' } });
  const dGen = await probe(image + '/ai/generate-image', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', Accept: 'application/zip' }, body: '{}' });
  // 2. 經本機伺服器轉送（= 本機版的情況）
  let lSub = null, lGen = null;
  if ((await naiRoute()) === 'local') {
    const hdr = { 'Content-Type': 'application/json', 'X-NAI-Token': key || 'test', 'X-NJ-Upstream-Image': image, 'X-NJ-Upstream-Api': api };
    lSub = await probe('/api/nai/subscription', { method: 'POST', headers: hdr, body: '{}' });
    lGen = await probe('/api/nai/generate', { method: 'POST', headers: { ...hdr, 'X-NJ-Probe': '1' }, body: '{}' });
  }
  const isNaiSub = j => !!j && ('tier' in j || 'trainingStepsLeft' in j || 'active' in j);
  const genSaysNai = r => r?.ok && [400, 401, 402, 403, 409, 422, 429].includes(r.status);   // 有這個位址、在生成前就檢查參數
  const genMissing = r => r?.ok && (r.status === 404 || r.status === 405);
  const cors = dSub.ok || dGen.ok;
  const reachLocal = !!(lSub?.ok && lSub.status !== 502) || !!(lGen?.ok && lGen.status !== 502);
  let native = null;
  if (isNaiSub(dSub.json) || isNaiSub(lSub?.json) || genSaysNai(dGen) || (lGen && genSaysNai(lGen) && !/找不到/.test(lGen.json?.error || ''))) native = true;
  if (genMissing(dGen) || (lGen?.ok && lGen.status === 404 && /HTTP 404/.test(lGen.json?.error || ''))) native = false;
  const subStatus = dSub.ok ? dSub.status : lSub?.ok ? (lSub.json?.status || lSub.status) : null;
  if (subStatus === 401 || subStatus === 403) notes.push('金鑰被拒絕（401 / 403）：請確認金鑰是否正確');
  else if (subStatus === 200 && isNaiSub(dSub.json || lSub?.json)) {
    const t = (dSub.json || lSub.json).trainingStepsLeft || {};
    const an = (t.fixedTrainingStepsLeft || 0) + (t.purchasedTrainingSteps || 0);
    notes.push(`帳號查詢成功${an ? `，Anlas 餘額 ${an.toLocaleString()}` : ''}`);
  } else if (subStatus === 404) notes.push('沒有「查詢餘額」的位址（/user/subscription）：不影響生圖，只是不能查 Anlas');
  if (native === false) notes.push('生圖位址回 404：對方不是 NovelAI 原生格式（例如包成 OpenAI 格式），目前無法直接使用');
  if (!cors && !reachLocal && !lSub) notes.push('瀏覽器連不到：可能是網址錯誤，或對方沒有開放 CORS（線上版無法使用；本機版可以再試一次）');
  if (!cors && !reachLocal && lSub) notes.push('本機伺服器也連不到：請確認網址是否正確、對方是否在線上');
  return { native, cors, online: cors && native !== false, local: lSub ? reachLocal && native !== false : null, notes };
}

// ---------- 示範模式：不連 NovelAI，用程式畫一張抽象卡面 ----------
export async function demoImage(width, height, rarity, seed, transparent = false) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const g = c.getContext('2d');
  const palettes = {
    R: [['#1d2b45', '#4b6a92', '#b9cbe0'], ['#24323a', '#5d7d7a', '#cfe0d6']],
    SR: [['#271a3d', '#6b4b9b', '#e2c8f5'], ['#2b1730', '#9b4b78', '#f5cfe2']],
    SSR: [['#2a1d0c', '#b0812f', '#ffeab0'], ['#3a0f17', '#c4475a', '#ffd9a8']],
  };
  const [a, b, light] = palettes[rarity][Math.floor(rnd() * 2)];
  const bg = g.createLinearGradient(0, 0, width * .3, height);
  bg.addColorStop(0, a); bg.addColorStop(.6, b); bg.addColorStop(1, a);
  g.fillStyle = bg; if (!transparent) g.fillRect(0, 0, width, height);
  for (let i = 0; i < (transparent ? 0 : 60); i++) {
    const r = rnd() * width * .09 + 4;
    g.globalAlpha = rnd() * .18;
    g.fillStyle = light; g.beginPath(); g.arc(rnd() * width, rnd() * height, r, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  const cx = width / 2, cy = height * .42, R = width * .3;
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.9);
  glow.addColorStop(0, light); glow.addColorStop(.25, light + '88'); glow.addColorStop(1, 'transparent');
  g.fillStyle = glow; if (transparent) { g.beginPath(); g.arc(cx, cy, R * 1.5, 0, 7); g.fill(); } else g.fillRect(0, 0, width, height);
  g.strokeStyle = light; g.lineWidth = Math.max(2, width / 300);
  for (let k = 0; k < 3; k++) {
    g.globalAlpha = .7 - k * .2;
    g.beginPath(); g.arc(cx, cy, R * (1 + k * .22), 0, 7); g.stroke();
  }
  const n = 5 + Math.floor(rnd() * 4);
  g.globalAlpha = .9; g.beginPath();
  for (let i = 0; i <= n * 2; i++) {
    const ang = i / (n * 2) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? R * .38 : R * .9;
    g.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
  }
  g.fillStyle = light + 'cc'; g.fill();
  const hill = g.createLinearGradient(0, height * .7, 0, height);
  hill.addColorStop(0, a + '00'); hill.addColorStop(1, a);
  g.globalAlpha = 1; g.fillStyle = hill; if (!transparent) g.fillRect(0, height * .6, width, height * .4);
  await new Promise(r => setTimeout(r, 900 + rnd() * 900));
  return canvasToBlob(c);
}
