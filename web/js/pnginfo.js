// 讀出圖片裡的生成資訊（全部在瀏覽器裡做，不會上傳）
// 支援：NovelAI 的 PNG 文字區塊（Description / Comment）、NovelAI 藏在透明度最低位元的隱寫資訊（stealth_pngcomp / stealth_pnginfo）、
//      Stable Diffusion WebUI 的 parameters 文字區塊
const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

async function inflate(bytes, format) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const utf8 = b => new TextDecoder('utf-8').decode(b);

/** PNG 的 tEXt / zTXt / iTXt 區塊 → { 關鍵字: 文字 } */
async function pngText(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), out = {};
  if (!PNG_SIG.every((v, i) => u8[i] === v)) return null;
  let p = 8;
  while (p + 8 <= u8.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(...u8.subarray(p + 4, p + 8)), data = u8.subarray(p + 8, p + 8 + len);
    p += 12 + len;
    if (type === 'IEND') break;
    try {
      if (type === 'tEXt') { const z = data.indexOf(0); out[utf8(data.subarray(0, z))] = utf8(data.subarray(z + 1)); }   // NovelAI 其實寫的是 UTF-8
      else if (type === 'zTXt') { const z = data.indexOf(0); out[utf8(data.subarray(0, z))] = utf8(await inflate(data.subarray(z + 2), 'deflate')); }
      else if (type === 'iTXt') {
        const z = data.indexOf(0), key = utf8(data.subarray(0, z)), comp = data[z + 1];
        let q = z + 3; q = data.indexOf(0, q) + 1; q = data.indexOf(0, q) + 1;
        const body = data.subarray(q);
        out[key] = utf8(comp ? await inflate(body, 'deflate') : body);
      }
    } catch { }
  }
  return out;
}

/** 透明度最低位元的隱寫資訊（NovelAI 下載的 PNG 都有） */
async function stealth(blob) {
  let bmp;
  try { bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); } catch { return null; }
  const { width: w, height: h } = bmp;
  const cv = new OffscreenCanvas(w, h), ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0); bmp.close?.();
  const px = ctx.getImageData(0, 0, w, h).data;
  // 位元順序：一欄一欄（x 外層、y 內層）
  let i = 0;
  const total = w * h;
  const bit = () => { if (i >= total) throw 0; const x = Math.floor(i / h), y = i % h; i++; return px[(y * w + x) * 4 + 3] & 1; };
  const bytes = n => { const b = new Uint8Array(n); for (let k = 0; k < n; k++) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bit(); b[k] = v; } return b; };
  try {
    const magic = String.fromCharCode(...bytes(15));
    if (magic !== 'stealth_pngcomp' && magic !== 'stealth_pnginfo') return null;
    let bits = 0; for (let k = 0; k < 32; k++) bits = (bits * 2) + bit();
    if (bits <= 0 || bits > total) return null;
    const data = bytes(Math.floor(bits / 8));
    return utf8(magic === 'stealth_pngcomp' ? await inflate(data, 'gzip') : data);
  } catch { return null; }
}

const tryJSON = s => { try { return JSON.parse(s); } catch { return null; } };

/** SD WebUI 的 parameters 文字 → 結果 */
function parseA1111(t) {
  const lines = t.split('\n'), iNeg = lines.findIndex(l => l.startsWith('Negative prompt:')), iSet = lines.findLastIndex(l => /^Steps: \d+/.test(l));
  const prompt = lines.slice(0, iNeg >= 0 ? iNeg : iSet >= 0 ? iSet : lines.length).join('\n').trim();
  const negative = iNeg >= 0 ? lines.slice(iNeg, iSet >= 0 ? iSet : lines.length).join('\n').replace(/^Negative prompt:\s*/, '').trim() : '';
  const params = {};
  if (iSet >= 0) for (const m of lines[iSet].matchAll(/([\w ]+): ([^,]+)/g)) params[m[1].trim()] = m[2].trim();
  return { source: 'Stable Diffusion WebUI', prompt, negative, characters: [], params: { steps: +params.Steps || undefined, scale: +params['CFG scale'] || undefined, seed: +params.Seed || undefined, sampler: params.Sampler, size: params.Size }, raw: t };
}

/** NovelAI 的 Comment JSON → 結果 */
function parseNAI(c, meta = {}) {
  const v4 = c.v4_prompt?.caption, v4n = c.v4_negative_prompt?.caption;
  return {
    source: meta.Source || meta.Software || 'NovelAI',
    prompt: v4?.base_caption ?? c.prompt ?? meta.Description ?? '',
    negative: v4n?.base_caption ?? c.uc ?? '',
    characters: (v4?.char_captions || []).map((ch, i) => ({ prompt: ch.char_caption || '', uc: v4n?.char_captions?.[i]?.char_caption || '', x: ch.centers?.[0]?.x ?? .5, y: ch.centers?.[0]?.y ?? .5 })),
    useCoords: !!c.v4_prompt?.use_coords,
    params: { steps: c.steps, scale: c.scale, cfg_rescale: c.cfg_rescale, seed: c.seed, sampler: c.sampler, noise_schedule: c.noise_schedule, width: c.width, height: c.height, model: meta.Source },
    raw: JSON.stringify(c, null, 2),
  };
}

/** 讀出圖片的生成資訊；沒有的話回傳 null */
export async function readImageMeta(blob) {
  const buf = await blob.arrayBuffer();
  const text = await pngText(buf);
  if (text) {
    const c = text.Comment && tryJSON(text.Comment);
    if (c) return parseNAI(c, text);
    if (text.parameters) return parseA1111(text.parameters);
    if (text.Description) return { source: text.Source || text.Software || 'PNG', prompt: text.Description, negative: '', characters: [], params: {}, raw: JSON.stringify(text, null, 2) };
  }
  const s = await stealth(blob);
  if (s) {
    const o = tryJSON(s);
    if (o) {
      const c = typeof o.Comment === 'string' ? tryJSON(o.Comment) : o.Comment;
      if (c) return parseNAI(c, o);
      if (o.prompt || o.v4_prompt) return parseNAI(o);
    }
    if (/Steps: \d+/.test(s)) return parseA1111(s);
  }
  return null;
}

/** 把 NovelAI 的 Source（例如 NovelAI Diffusion V4.5 4BDE2A90）對到模型 id */
export function modelFromSource(src = '') {
  const m = String(src).match(/V(\d)(?:\.(\d))?/i);
  if (!m) return '';
  const v = m[1] + (m[2] ? '-' + m[2] : ''), curated = /curated/i.test(src);
  return { '3': 'nai-diffusion-3', '4': curated ? 'nai-diffusion-4-curated-preview' : 'nai-diffusion-4-full', '4-5': curated ? 'nai-diffusion-4-5-curated' : 'nai-diffusion-4-5-full', '5': curated ? 'nai-diffusion-5-curated' : 'nai-diffusion-5-full' }[v] || '';
}
