// 解析圖片：讀出圖片裡的生成資訊（全部在瀏覽器裡做，不會上傳），可以套用到任一個卡池
import { h, esc, toast, pickFiles, ICON } from '../util.js';
import { state, save } from '../store.js';
import { MODELS } from '../nai.js';
import { splitTags } from '../promptlib.js';
import { readImageMeta, modelFromSource } from '../pnginfo.js';
import { pickCard } from '../picker.js';

let el, url = '', last = null;

export async function mount(root) {
  el = h(`<section class="view parse">
    <header class="parse-head"><h2 class="view-title">${ICON.scan}解析圖片</h2>
      <p class="muted">讀出圖片生成時的提示詞與參數。支援 NovelAI 下載的 PNG（包括藏在透明度裡的隱寫資訊）與 Stable Diffusion WebUI 的 PNG。<b>全部在你的瀏覽器裡讀取，不會上傳。</b></p></header>
    <div class="panel ps-drop">${ICON.upload}<b>把圖片拖進來，或</b>
      <div class="row wrap"><button class="btn primary small ps-up">${ICON.upload}選擇圖片</button><button class="btn ghost small ps-card">${ICON.album}從卡冊選</button><button class="btn ghost small ps-paste">貼上圖片</button></div>
      <small class="muted">被社群網站轉存過、或 JPG / WebP 格式的圖，通常已經沒有這些資訊。</small></div>
    <div class="ps-result"></div>
  </section>`);
  root.append(el);
  el.querySelector('.ps-up').onclick = async () => { const [f] = await pickFiles('image/*'); if (f) show(f); };
  el.querySelector('.ps-card').onclick = async () => { const c = await pickCard('選一張卡', { allowUpload: false }); if (c?.blob) show(c.blob); };
  el.querySelector('.ps-paste').onclick = async () => {
    try {
      for (const it of await navigator.clipboard.read()) { const t = it.types.find(x => x.startsWith('image/')); if (t) return show(await it.getType(t)); }
      toast('剪貼簿裡沒有圖片', 'warn');
    } catch { toast('瀏覽器不允許讀剪貼簿，可以改用 Ctrl+V', 'warn'); }
  };
  const drop = el.querySelector('.ps-drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('hover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('hover'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('hover'); const f = e.dataTransfer.files[0]; if (f) show(f); });
  addEventListener('paste', onPaste);
  if (last) show(last);
}

export function unmount() { removeEventListener('paste', onPaste); }
function onPaste(e) { const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); show(f); } }

async function show(blob) {
  last = blob;
  const res = el.querySelector('.ps-result');
  res.innerHTML = '<p class="muted small">讀取中…</p>';
  let meta = null;
  try { meta = await readImageMeta(blob); } catch { }
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(blob);
  if (!meta) { res.innerHTML = `<div class="panel ps-card-box"><div class="ps-src"><img src="${url}" alt=""><p class="ps-none">這張圖沒有可讀的生成資訊。</p></div></div>`; return; }
  const P = meta.params || {}, tags = splitTags(meta.prompt), arts = tags.filter(t => /^artist:/i.test(t)), model = modelFromSource(P.model);
  const row = (k, v) => v === undefined || v === '' || v === null ? '' : `<tr><th>${k}</th><td>${esc(String(v))}</td></tr>`;
  const area = (label, v, cls) => `<label class="fld"><span>${label}<button class="btn ghost small ps-copy" data-v="${cls}">${ICON.copy || '⧉'}複製</button></span><textarea class="field mono ${cls}" rows="${Math.min(8, Math.max(2, Math.ceil(v.length / 70)))}" readonly>${esc(v)}</textarea></label>`;
  res.innerHTML = `<div class="panel ps-card-box">
      <div class="ps-src"><img src="${url}" alt=""><div><b>${esc(meta.source)}</b>
        <table class="ps-params">${row('模型', model && MODELS.find(m => m.id === model)?.name)}${row('步數', P.steps)}${row('引導', P.scale)}${row('取樣器', P.sampler)}${row('種子', P.seed)}${row('尺寸', P.width ? P.width + '×' + P.height : P.size)}</table></div></div>
      ${arts.length ? area('畫師串', arts.join(', '), 'v-art') : ''}
      ${area('正面提示詞', tags.filter(t => !/^artist:/i.test(t)).join(', ') || meta.prompt, 'v-pos')}
      ${meta.negative ? area('負面提示詞', meta.negative, 'v-neg') : ''}
      ${meta.characters?.length ? `<div class="fld"><span>多角色（${meta.characters.length}）</span>${meta.characters.map((c, i) => `<p class="mono small ps-char">${i + 1}. ${esc(c.prompt)}</p>`).join('')}</div>` : ''}
      <details class="ps-raw"><summary>原始資料</summary><pre class="mono">${esc(meta.raw || '')}</pre></details>
    </div>
    <div class="panel ps-card-box ps-apply-box">
      <h3>套用到卡池</h3>
      <label class="fld"><span>卡池</span><select class="field ps-banner">${state.banners.map(b => `<option value="${b.id}" ${b.id === state.activeBanner ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
      <div class="ps-apply">
        <label><input type="checkbox" data-a="prompt" checked> 正面提示詞（取代 ② 圖片提示詞${arts.length ? '；artist: 放進 ① 畫師串' : ''}）</label>
        ${meta.negative ? '<label><input type="checkbox" data-a="negative" checked> 負面提示詞</label>' : ''}
        ${meta.characters?.length ? '<label><input type="checkbox" data-a="chars" checked> 多角色</label>' : ''}
        <label><input type="checkbox" data-a="params"> 參數（步數、引導、取樣器、尺寸${model ? '、模型' : ''}）</label>
        <label><input type="checkbox" data-a="seed"> 固定種子</label></div>
      <div class="row wrap"><button class="btn primary ps-go">${ICON.check}套用</button></div>
    </div>`;
  res.querySelectorAll('.ps-copy').forEach(bn => bn.onclick = e => { e.preventDefault(); navigator.clipboard?.writeText(res.querySelector('.' + bn.dataset.v).value).then(() => toast('已複製', 'ok', 1200)); });
  res.querySelector('.ps-go').onclick = () => {
    const o = {}; res.querySelectorAll('.ps-apply input').forEach(x => { o[x.dataset.a] = x.checked; });
    const b = state.banners.find(x => x.id === res.querySelector('.ps-banner').value), p = state.params;
    if (o.prompt) { if (arts.length) b.artist = arts.join(', '); b.prompt = tags.filter(t => !/^artist:/i.test(t)).join(', '); }
    if (o.negative) b.negative = meta.negative;
    if (o.chars && meta.characters?.length) { b.characters = meta.characters.map(c => ({ ...c, enabled: true })); b.useCoords = !!meta.useCoords; }
    if (o.params) {
      if (P.steps) p.steps = Math.min(50, +P.steps);
      if (P.scale) p.scale = +P.scale;
      if (P.cfg_rescale !== undefined) p.cfg_rescale = +P.cfg_rescale;
      if (P.sampler && /^k_|ddim/.test(P.sampler)) p.sampler = P.sampler;
      if (P.noise_schedule) p.noise_schedule = P.noise_schedule;
      if (P.width && P.height) { p.width = +P.width; p.height = +P.height; p.size = 'custom'; }
      if (model) p.model = model;
    }
    if (o.seed && P.seed !== undefined) p.seed = +P.seed;
    save('banners'); save('params');
    toast(`已套用到「${b.name}」，到召喚頁就能用`, 'ok', 2600);
  };
}
