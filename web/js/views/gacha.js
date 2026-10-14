// 召喚頁：卡池、完整 NovelAI 參數、召喚按鈕
import { h, esc, uid, toast, confirmBox, modal, blobURL, blobToDataURL, pickFiles, ICON } from '../util.js';
import { db } from '../db.js';
import { state, save, on, activeBanner, allCards, DEFAULT_BANNERS } from '../store.js';
import { MODELS, SAMPLERS, SCHEDULES, SIZES, UC_NAMES, modelInfo, expandRandom, hasToken, effectiveParams } from '../nai.js';
import { ASSET_TIPS } from '../presets.js';
import { promptZonesHTML, wirePromptUI, discHint } from './promptui.js';
import { splitText, countUp, rotateWords } from '../textfx.js';
let stopKicker = () => { };
import { slider, toggle, select, text, bindAll, hints } from '../forms.js';
import { cardBack, seal, ornament } from '../cards.js';
import { pickCard } from '../picker.js';
import { runSummon } from '../summon.js';
import { openCardDetail } from '../carddetail.js';

let el, tab = 'prompt', off = [];

export async function mount(root) {
  el = h(`<section class="view gacha">
    <aside class="banner-list panel">
      <div class="side-title"><span>卡池</span><button class="icon-btn ghost add-banner" title="新增卡池">${ICON.plus}</button></div>
      <div class="banner-items"></div>
      <p class="side-foot muted">提示詞分三區：畫師串、圖片提示詞、隨機詞庫；召喚時會合併成一段送出。</p>
    </aside>
    <div class="gacha-main">
      <div class="banner-hero"></div>
      <div class="gacha-panel panel">
        <div class="tabs" role="tablist">
          ${[['prompt', '卡池提示詞'], ['chars', '多角色'], ['rarity', '稀有度'], ['nai', 'NAI 參數'], ['refs', '參考圖']].map(([k, t]) => `<button role="tab" data-tab="${k}">${t}</button>`).join('')}
        </div>
        <div class="tab-body"></div>
        <div class="hint-bar">把滑鼠移到設定上可看說明</div>
      </div>
    </div>
  </section>`);
  root.append(el);
  el.querySelector('.add-banner').onclick = addBanner;
  el.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderTab(); });
  hints(el.querySelector('.gacha-panel'), el.querySelector('.hint-bar'));
  off.push(on('cards', () => renderHero()));
  renderList(); renderHero(); renderTab();
}

export function unmount() { stopKicker(); off.forEach(f => f()); off = []; }

function renderList() {
  const box = el.querySelector('.banner-items');
  box.innerHTML = '';
  state.banners.forEach(b => {
    const item = h(`<button class="banner-item ${b.id === state.activeBanner ? 'on' : ''} ${b.transparent ? 'is-asset' : ''}"><i class="bi-seal">${seal()}</i><span><b>${esc(b.name)}</b><small>${esc(b.subtitle || '')}</small>
      <span class="bi-more"><i>SSR</i> ${b.rates.SSR}% · <i>SR</i> ${b.rates.SR}%${b.transparent ? ' · V5 透明素材' : ''}${b.model ? ` · ${esc(modelInfo(b.model).name)}` : ''}<br>${esc(expandRandom(b.prompt).slice(0, 46))}…</span></span></button>`);
    item.onclick = () => { state.activeBanner = b.id; save('activeBanner'); renderList(); renderHero(); renderTab(); };
    box.append(item);
  });
}

async function addBanner() {
  const kind = await modal({
    title: '新增卡池', body: `<div class="choice-list">
      <button class="choice" data-k="char"><b>${ICON.gacha} 角色 / 場景卡池</b><small>一般插畫，使用「NAI 參數」裡的模型與尺寸</small></button>
      <button class="choice" data-k="asset"><b>${ICON.sparkles} 透明素材卡池（V5）</b><small>道具、裝飾、文字、光效等去背素材，固定用 V5 並輸出透明背景</small></button></div>`,
    onOpen: (bd, close) => bd.querySelectorAll('.choice').forEach(c => c.onclick = () => close(c.dataset.k)),
  });
  if (!kind) return;
  const base = kind === 'asset' ? DEFAULT_BANNERS.find(x => x.transparent) : DEFAULT_BANNERS[0];
  const b = { ...structuredClone(base), id: uid('banner-'), name: kind === 'asset' ? '新的素材池' : '新的卡池', subtitle: kind === 'asset' ? 'NEW ASSETS' : 'NEW BANNER',
    prompt: kind === 'asset' ? 'no humans, single object, centered, isolated, ' : '1girl, solo, <smile|serious|closed eyes>, ', cover: null };
  state.banners.push(b); state.activeBanner = b.id;
  save('banners'); save('activeBanner');
  tab = 'prompt';
  renderList(); renderHero(); renderTab();
}

let heroTimer = 0;
const heroLater = () => { clearTimeout(heroTimer); heroTimer = setTimeout(renderHero, 300); };

async function renderHero() {
  const hero = el.querySelector('.banner-hero');
  const b = activeBanner(), s = state.stats;
  const p = effectiveParams(state.params, b);
  const cards = await allCards();
  const cover = (b.cover && cards.find(c => c.id === b.cover)) || cards.find(c => c.bannerId === b.id && c.rarity === 'SSR') || cards.find(c => c.bannerId === b.id);
  const recent = cards.filter(c => c.source === 'gacha').slice(0, 10);
  const pity = state.settings.pitySSR || 60;
  const rR = Math.max(0, 100 - b.rates.SSR - b.rates.SR);
  const status = p.demo ? ['demo', '示範模式（不連 NovelAI）'] : hasToken() ? ['ok', `NovelAI · ${modelInfo(p.model).name} · ${p.width}×${p.height}${p.transparent ? ' · 透明背景' : ''}`] : ['warn', '未設定 Token，將以示範模式召喚'];
  hero.innerHTML = `
    <div class="hero-bg">${cover ? `<img src="${blobURL('full:' + cover.id, cover.blob)}" alt="">` : ''}</div>
    <div class="hero-outline" aria-hidden="true">${esc((b.subtitle || b.name).toUpperCase())}</div>
    <div class="hero-art ${cover?.alpha ? 'alpha' : ''}">${cover ? `<img src="${blobURL('full:' + cover.id, cover.blob)}" alt="" style="object-fit:${cover.alpha || (cover.width / cover.height) > 1.15 ? 'contain' : 'cover'}">` : ''}</div>
    <div class="hero-info">
      <small class="hero-kicker fx-shiny"></small>
      <h2 class="hero-name">${esc(b.name)}</h2>
      ${ornament('hero-divider')}
      <div class="hero-rates"><span class="rar-badge r-SSR">SSR</span>${b.rates.SSR}%<span class="rar-badge r-SR">SR</span>${b.rates.SR}%<span class="rar-badge r-R">R</span>${rR.toFixed(1).replace(/\.0$/, '')}%
        <label class="hero-showrar" title="這個卡池抽出的卡，卡面上要不要顯示稀有度標誌（單張卡可以在卡片詳情另外決定）"><input type="checkbox" ${b.showRarity !== false ? 'checked' : ''}><span>卡片顯示稀有度</span></label></div>
      <div class="pity"><div class="pity-bar"><i style="width:${Math.min(100, s.sinceSSR / pity * 100)}%"></i></div>
        <span>距離 SSR 保底還有 <b class="pity-n">${Math.max(0, pity - s.sinceSSR)}</b> 抽 · 每 10 抽必得 SR 以上</span></div>
      <div class="hero-status ${status[0]}"><i></i>${esc(status[1])}</div>
      <div class="summon-btns">
        <button class="btn summon-one">${ICON.gacha}<span>召喚 ×1</span></button>
        <div class="multi-wrap">
          <button class="icon-btn ghost minus" aria-label="減少">−</button>
          <button class="btn primary summon-n">${ICON.sparkles}<span>召喚 ×<b>${state.settings.pullCount}</b></span></button>
          <button class="icon-btn ghost plus" aria-label="增加">+</button>
        </div>
      </div>
    </div>
    ${cover ? '' : `<div class="hero-placeholder"><div class="hp-card"></div></div>`}
    <div class="hero-recent">${recent.length ? '<small>最近召喚</small>' : ''}${recent.map(c => `<button class="mini r-${c.rarity}" data-id="${c.id}" title="${esc(c.name)}"><img src="${blobURL('thumb:' + c.id, c.thumb)}" alt=""></button>`).join('')}</div>`;
  stopKicker(); stopKicker = rotateWords(hero.querySelector('.hero-kicker'), [':// LIMITED SUMMON', ':// RATE UP · SSR ' + b.rates.SSR + '%', ':// ' + (b.subtitle || 'NIGHT VOYAGE')]);
  splitText(hero.querySelector('.hero-name'), b.name, { mode: 'rise', stagger: 45 });
  countUp(hero.querySelector('.pity-n'), Math.max(0, pity - s.sinceSSR), { duration: 700 });
  if (!cover) hero.querySelector('.hp-card').append(cardBack('SSR', '', (+p.width || 832) / (+p.height || 1216)));
  hero.querySelector('.hero-showrar input').onchange = e => {
    b.showRarity = e.target.checked; save('banners');
    const t = el.querySelector('[data-bind="banner.showRarity"]'); if (t) t.checked = b.showRarity;
    toast(b.showRarity ? `「${b.name}」的卡會顯示稀有度標誌` : `「${b.name}」的卡不顯示稀有度標誌（單張卡可在卡片詳情另外決定）`, 'ok', 2400);
  };
  hero.querySelector('.summon-one').onclick = () => summon(1);
  hero.querySelector('.summon-n').onclick = () => summon(state.settings.pullCount);
  const setN = d => { state.settings.pullCount = Math.min(10, Math.max(2, state.settings.pullCount + d)); save('settings'); hero.querySelector('.summon-n b').textContent = state.settings.pullCount; };
  hero.querySelector('.minus').onclick = () => setN(-1);
  hero.querySelector('.plus').onclick = () => setN(1);
  hero.querySelectorAll('.mini').forEach(m => m.onclick = () => openCardDetail(m.dataset.id));
}

async function summon(n) {
  const b = activeBanner();
  if (!b.prompt.trim() && !(b.artist || '').trim() && !(b.random || []).some(r => r.on !== false)) { toast('這個卡池還沒有提示詞', 'warn'); tab = 'prompt'; renderTab(); return; }
  const real = !state.params.demo && hasToken();
  if (real && n > 1 && !await confirmBox(`將連續送出 <b>${n}</b> 次 NovelAI 生圖請求，每一次都會依你的方案計算 Anlas。<br>任一次失敗會立刻停下，不會自動重試。`, { ok: `召喚 ${n} 次` })) return;
  await runSummon(b, n);
  renderHero();
}

function renderTab() {
  el.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const body = el.querySelector('.tab-body');
  const b = activeBanner(), p = state.params;
  b.showRarity ??= true; b.artist ??= ''; b.random ??= [];
  const ctx = { banner: b, params: p, settings: state.settings };
  const ver = modelInfo(p.model).ver;
  body.dataset.ver = ver >= 5 ? '5' : ver >= 4 ? '4' : '3';
  const views = { prompt: promptTab, chars: charsTab, rarity: rarityTab, nai: naiTab, refs: refsTab };
  body.innerHTML = views[tab](b, p);
  bindAll(body, ctx, (path, v) => {
    const root = path.split('.')[0];
    save(root === 'banner' ? 'banners' : root);
    if (path === 'params.model') { if (modelInfo(v).ver >= 4 && p.noise_schedule === 'native') p.noise_schedule = 'karras'; if (modelInfo(v).ver >= 4 && p.sampler === 'ddim_v3') p.sampler = 'k_euler_ancestral'; renderTab(); }
    if (path === 'params.size') { const sz = SIZES.find(s => s[0] === v); if (sz[2]) { p.width = sz[2]; p.height = sz[3]; } renderTab(); }
    if (path === 'params.width' || path === 'params.height') { p.size = 'custom'; body.querySelector('[data-bind="params.size"]').value = 'custom'; }
    if (path === 'banner.name' || path === 'banner.subtitle') renderList();
    if (path === 'banner.useCoords' || path === 'banner.transparent' || path === 'banner.model') renderTab();
    if (path === 'banner.showRarity') { const c = el.querySelector('.hero-showrar input'); if (c) c.checked = v; }
    heroLater();
  });
  wireTab(body, b, p);
}

const promptTab = (b) => `<div class="form-grid">
  ${text('卡池名稱', 'banner.name', { max: 20 })}
  ${text('英文標題', 'banner.subtitle', { max: 28, hint: '顯示在卡池大圖上的英文字' })}
  <div class="span2 banner-kind">
    ${toggle('透明背景（需要 V5，適合道具 / 裝飾 / 文字 / 光效素材）', 'banner.transparent', ASSET_TIPS)}
    ${select('這個卡池用的模型', 'banner.model', [['', '跟隨「NAI 參數」'], ...MODELS.map(m => [m.id, m.name])], '可以讓素材池固定用 V5，角色池用 V4.5')}
    ${select('這個卡池的尺寸', 'banner.size', [['', '跟隨「NAI 參數」'], ...SIZES.filter(x => x[2]).map(x => [x[0], x[1]])], '素材常用方形，文字標題常用橫式')}
    ${b.transparent && b.model && modelInfo(b.model).ver < 5 ? '<p class="st-status warn small">透明背景需要 V5，請把模型改成 V5 Full 或 V5 Curated</p>' : ''}
  </div>
  ${promptZonesHTML(b)}
  <div class="span2 groups ${state.settings.groupsOpen === true ? '' : 'collapsed'}">${groupsHTML()}</div>
  <div class="span2 row wrap">
    <button class="btn ghost small pick-cover">${ICON.image}設定卡池封面</button>
    <button class="btn ghost small danger del-banner">${ICON.trash}刪除卡池</button>
  </div>
</div>`;

const POS = [.1, .3, .5, .7, .9];
const charsTab = (b) => `<div class="chars">
  <p class="note">${ICON.layers}多角色提示詞只在 V4 以上的模型有效。主提示詞寫場景與畫風，每個角色在這裡分開描述，避免特徵混在一起。</p>
  ${toggle('自訂角色位置（關閉＝由 AI 決定）', 'banner.useCoords', '開啟後可在九宮格點選每個角色大概站的位置')}
  <div class="char-list">${b.characters.map((c, i) => `<div class="char-item">
    <div class="char-head"><b>角色 ${i + 1}</b>${toggle('啟用', `banner.characters.${i}.enabled`)}<button class="icon-btn ghost del-char" data-i="${i}" aria-label="刪除">${ICON.trash}</button></div>
    <div class="char-body">
      <div class="char-fields">${text('角色提示詞', `banner.characters.${i}.prompt`, { area: true, rows: 2, placeholder: 'girl, silver hair, red eyes, gothic dress' })}
      ${text('角色負面詞', `banner.characters.${i}.uc`, { placeholder: '選填' })}</div>
      ${b.useCoords ? `<div class="pos-grid" data-i="${i}">${POS.map(y => POS.map(x => `<button class="${Math.abs(c.x - x) < .01 && Math.abs(c.y - y) < .01 ? 'on' : ''}" data-x="${x}" data-y="${y}"></button>`).join('')).join('')}</div>` : ''}
    </div></div>`).join('')}</div>
  ${b.characters.length < 6 ? `<button class="btn ghost add-char">${ICON.plus}新增角色</button>` : ''}
</div>`;

const rarityTab = (b) => `<div class="form-grid">
  ${slider('SSR 機率（%）', 'banner.rates.SSR', 0, 30, .5, '每一抽直接出 SSR 的機率')}
  ${slider('SR 機率（%）', 'banner.rates.SR', 0, 60, .5, '剩下的就是 R')}
  ${toggle('卡片顯示稀有度標誌', 'banner.showRarity', '關掉後，這個卡池抽出的卡（包括以前抽的）卡面上都不顯示 SSR / SR / R 標誌，召喚時也不會出現大大的稀有度字樣；單張卡可以在卡片詳情另外決定')}
  ${slider('SSR 保底抽數', 'settings.pitySSR', 10, 200, 1, '連續這麼多抽沒出 SSR，下一抽必定是 SSR（所有卡池共用）')}
  <div class="fld"><span>目前統計</span><p class="muted">累計 ${state.stats.pulls} 抽 · SSR ${state.stats.ssr} · SR ${state.stats.sr}</p></div>
  <div class="span2">${text('<span class="rar-badge r-SSR">SSR</span> 加成提示詞', 'banner.rarityAddon.SSR', { area: true, rows: 2, hint: '抽到 SSR 時接在提示詞後面，讓高稀有度的圖更華麗' })}</div>
  <div class="span2">${text('<span class="rar-badge r-SR">SR</span> 加成提示詞', 'banner.rarityAddon.SR', { area: true, rows: 2 })}</div>
  <div class="span2">${text('<span class="rar-badge r-R">R</span> 加成提示詞', 'banner.rarityAddon.R', { area: true, rows: 2 })}</div>
</div>`;

const naiTab = (b, p) => `<div class="form-grid nai-form">
  <h4 class="span2 sec">模型與尺寸</h4>
  ${select('模型', 'params.model', MODELS.map(m => [m.id, m.name]), 'V4.5 Full 是目前最常用的動漫模型；V3 才有 SMEA')}
  ${select('尺寸', 'params.size', SIZES.map(s => [s[0], s[1]]), 'Opus 方案在 1024×1024 以內（含 832×1216）且步數 ≤ 28 時免費')}
  ${slider('寬度', 'params.width', 64, 2048, 64)}
  ${slider('高度', 'params.height', 64, 2048, 64)}
  <h4 class="span2 sec">取樣</h4>
  ${slider('步數 Steps', 'params.steps', 1, 50, 1, '越多越精細也越貴；28 是常用值')}
  ${slider('提示詞引導 Guidance', 'params.scale', 0, 10, .1, '越高越貼近提示詞，太高顏色會過飽和；V4.5 建議 4–6')}
  ${slider('引導重縮放 CFG Rescale', 'params.cfg_rescale', 0, 1, .02, '高引導時拉回過飽和的顏色，0 為關閉')}
  ${select('取樣器 Sampler', 'params.sampler', SAMPLERS, 'Euler Ancestral 最通用；DPM++ 2M SDE 細節多')}
  ${select('噪點排程 Noise Schedule', 'params.noise_schedule', SCHEDULES, 'Karras 為預設；V4 以上不支援 Native')}
  <div class="fld" data-hint="-1 代表每次隨機；固定數字可重現同一張圖（但卡池隨機詞仍會變）"><span>種子 Seed</span>
    <div class="slider-row"><input class="field num wide" type="number" min="-1" max="4294967295" step="1" data-bind="params.seed"><button class="icon-btn ghost seed-rand" title="設為隨機">${ICON.dice}</button></div></div>
  <h4 class="span2 sec">品質</h4>
  ${toggle('加入品質標籤 Quality Tags', 'params.qualityToggle', '自動在提示詞後加上該模型官方的品質詞')}
  ${select('預設負面詞 UC Preset', 'params.ucPreset', UC_NAMES.map((n, i) => [i, n]), '官方預設的負面詞組合，會放在你的負面詞前面')}
  ${toggle('Variety+', 'params.variety', '前期跳過引導，讓構圖更多樣（skip_cfg_above_sigma）')}
  <div class="v3-only">${toggle('SMEA', 'params.sm', '僅 V3：大圖構圖更穩定')}</div>
  <div class="v3-only">${toggle('SMEA DYN', 'params.sm_dyn', '僅 V3：SMEA 的變體，需先開 SMEA')}</div>
  <div class="v3-only">${toggle('Decrisp', 'params.decrisp', '僅 V3：降低高引導造成的銳利感')}</div>
  <h4 class="span2 sec">其他</h4>
  ${toggle('示範模式（不連 NovelAI，不消耗 Anlas）', 'params.demo', '用程式畫的抽象卡面跑完整抽卡流程，方便試玩')}
</div>`;

const refsTab = (b, p) => `<div class="refs">
  <section class="ref-sec">
    <div class="ref-head">${toggle('<b>圖生圖 Image2Image</b>', 'params.img2img.enabled', '以一張底圖為基礎重畫')}</div>
    <div class="ref-row">
      <div class="ref-img ${p.img2img.image ? '' : 'empty'}">${p.img2img.image ? `<img src="${p.img2img.image}" alt="">` : ICON.image}</div>
      <div class="ref-ctl">
        ${slider('重繪強度 Strength', 'params.img2img.strength', .01, .99, .01, '越高改得越多')}
        ${slider('雜訊 Noise', 'params.img2img.noise', 0, .99, .01, '加入雜訊能增加細節，太高會糊')}
        <div class="row"><button class="btn ghost small" data-pick="img2img">${ICON.album}從卡片選</button><button class="btn ghost small" data-upload="img2img">${ICON.upload}上傳</button>${p.img2img.image ? `<button class="btn ghost small" data-clear="img2img">清除</button>` : ''}</div>
      </div>
    </div>
  </section>
  <section class="ref-sec">
    <div class="ref-head"><b>Vibe Transfer 風格參考</b><span class="muted">V4 以上每張參考圖第一次使用需編碼（會花 Anlas），之後會快取</span></div>
    ${toggle('正規化參考強度', 'params.normalizeVibes', '多張參考圖時，把強度總和正規化')}
    <div class="vibe-list">${p.vibes.map((v, i) => `<div class="ref-row vibe">
      <div class="ref-img"><img src="${v.image}" alt=""></div>
      <div class="ref-ctl">
        ${toggle('啟用', `params.vibes.${i}.enabled`)}
        ${slider('擷取資訊量 Information', `params.vibes.${i}.info`, .01, 1, .01, '越高越會沿用參考圖的內容細節')}
        ${slider('參考強度 Strength', `params.vibes.${i}.strength`, .01, 1, .01, '越高畫風越像參考圖')}
        <button class="btn ghost small danger" data-del-vibe="${i}">${ICON.trash}移除</button>
      </div></div>`).join('')}</div>
    ${p.vibes.length < 16 ? `<div class="row"><button class="btn ghost small" data-pick="vibe">${ICON.album}從卡片加入</button><button class="btn ghost small" data-upload="vibe">${ICON.upload}上傳參考圖</button></div>` : ''}
  </section>
  <section class="ref-sec">
    <div class="ref-head">${toggle('<b>角色參考 Precise Reference</b>', 'params.charRef.enabled', '僅 V4.5 Full；鎖定角色外觀，不能和 Vibe 同時使用')}</div>
    <div class="ref-row">
      <div class="ref-img ${p.charRef.image ? '' : 'empty'}">${p.charRef.image ? `<img src="${p.charRef.image}" alt="">` : ICON.image}</div>
      <div class="ref-ctl">
        ${slider('參考強度 Strength', 'params.charRef.strength', 0, 1, .01)}
        ${slider('保真度 Fidelity', 'params.charRef.fidelity', 0, 1, .01, '越高越忠於參考圖的細節')}
        ${toggle('同時參考畫風（Style Aware）', 'params.charRef.styleAware')}
        <div class="row"><button class="btn ghost small" data-pick="charRef">${ICON.album}從卡片選</button><button class="btn ghost small" data-upload="charRef">${ICON.upload}上傳</button>${p.charRef.image ? `<button class="btn ghost small" data-clear="charRef">清除</button>` : ''}</div>
      </div>
    </div>
  </section>
</div>`;

// ---------- 提示詞組 ----------
const GROUP_COLORS = [['gold', '金'], ['blue', '藍'], ['red', '紅'], ['green', '綠'], ['purple', '紫']];
/** 詞組要加到正面還是負面（舊資料沒設定時：紅色當負面） */
const targetOf = g => g.target || (g.color === 'red' ? 'neg' : 'pos');
const TARGET_NAME = { art: '① 畫師串', pos: '② 圖片提示詞', neg: '負面' };
const groupFolders = () => [...new Set(state.promptGroups.map(g => (g.folder || '').trim()).filter(Boolean))];
async function editGroup(g = {}) {
  const tgt = targetOf(g), seg = (cls, items, cur) => `<div class="seg small ${cls}">${items.map(([v, n]) => `<button type="button" data-v="${v}" class="${cur === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const res = await modal({
    title: g.id ? '編輯詞組' : '新增詞組',
    body: `<div class="new-album">
      <label class="fld"><span>名稱</span><input class="field" name="name" maxlength="16" value="${esc(g.name || '')}" placeholder="例如 高畫質、常用負面"></label>
      <label class="fld"><span>提示詞</span><textarea class="field" name="text" rows="4" placeholder="masterpiece, best quality, ...">${esc(g.text || '')}</textarea></label>
      <div class="fld"><span>點一下時加到</span>${seg('g-target', [['art', '① 畫師串'], ['pos', '② 圖片提示詞'], ['neg', '負面提示詞']], tgt)}</div>
      <label class="fld"><span>分類 <em>選填；同一個分類的詞組會收在一起</em></span><input class="field" name="folder" maxlength="12" list="g-folder-list" value="${esc(g.folder || '')}" placeholder="例如 畫風、服裝、光影">
        <datalist id="g-folder-list">${groupFolders().map(f => `<option value="${esc(f)}">`).join('')}</datalist></label>
      <div class="fld"><span>顏色</span>${seg('g-colors', GROUP_COLORS, g.color || (tgt === 'neg' ? 'red' : 'gold'))}</div>
      <label class="fld toggle"><input type="checkbox" name="star" ${g.star ? 'checked' : ''}><i class="sw"></i><span>★ 放在「常用」，排在最前面</span></label></div>`,
    actions: [{ label: '取消', value: null, kind: 'ghost' }, { label: '儲存', kind: 'primary', value: bd => ({
      name: bd.querySelector('[name=name]').value.trim(), text: bd.querySelector('[name=text]').value.trim(),
      color: bd.querySelector('.g-colors .on').dataset.v, target: bd.querySelector('.g-target .on').dataset.v,
      folder: bd.querySelector('[name=folder]').value.trim(), star: bd.querySelector('[name=star]').checked,
    }) }],
    onOpen: bd => bd.querySelectorAll('.seg').forEach(sg => sg.querySelectorAll('button').forEach(x => x.onclick = () => {
      sg.querySelectorAll('button').forEach(y => y.classList.toggle('on', y === x));
      if (sg.classList.contains('g-target')) {                // 選負面時順手把顏色換成紅色（還能再改）
        const c = bd.querySelector(`.g-colors [data-v="${x.dataset.v === 'neg' ? 'red' : x.dataset.v === 'art' ? 'purple' : 'gold'}"]`);
        if (c) bd.querySelectorAll('.g-colors button').forEach(y => y.classList.toggle('on', y === c));
      }
    })),
  });
  if (!res || !res.text) return;
  if (g.id) Object.assign(g, res, { name: res.name || g.name });
  else state.promptGroups.push({ id: uid('g-'), ...res, name: res.name || res.text.slice(0, 10) });
  save('promptGroups'); refreshGroups();
}

// ---- 我的提示詞組：分類分頁 + 搜尋 + 精簡 / 詳細兩種顯示 ----
let groupQuery = '';
const splitTags = t => String(t || '').split(',').map(x => x.trim()).filter(Boolean);
const normTag = t => t.toLowerCase().replace(/\s+/g, ' ');
/** 這個詞組的詞是不是全部已經在提示詞框裡 */
function groupIn(ta, g) {
  if (!ta) return false;
  const have = new Set(splitTags(ta.value).map(normTag)), want = splitTags(g.text).map(normTag);
  return want.length > 0 && want.every(t => have.has(t));
}
function removeTags(ta, text) {
  const drop = new Set(splitTags(text).map(normTag));
  ta.value = splitTags(ta.value).filter(t => !drop.has(normTag(t))).join(', ');
  ta.dispatchEvent(new Event('input'));
}
function groupsVisible() {
  const f = state.settings.groupFilter || 'all', q = groupQuery.trim().toLowerCase();
  let list = state.promptGroups.filter(g =>
    f === 'all' ? true : f === 'star' ? g.star : f === 'pos' || f === 'neg' || f === 'art' ? targetOf(g) === f : f === 'f:' ? !g.folder : (g.folder || '') === f.slice(2));
  if (q) list = state.promptGroups.filter(g => [g.name, g.text, g.folder].some(x => (x || '').toLowerCase().includes(q)));
  return [...list.filter(g => g.star), ...list.filter(g => !g.star)];   // 常用排前面
}
function groupsHTML() {
  const gs = state.promptGroups, view = state.settings.groupView || 'compact';
  const folders = groupFolders();
  if ((state.settings.groupFilter || '').startsWith('f:') && state.settings.groupFilter !== 'f:' && !folders.includes(state.settings.groupFilter.slice(2))) state.settings.groupFilter = 'all';   // 分類被清空了
  const f = state.settings.groupFilter || 'all';
  const cnt = fn => gs.filter(fn).length;
  const tabs = [['all', '全部', gs.length], ['star', '★ 常用', cnt(g => g.star)], ...(cnt(g => targetOf(g) === 'art') ? [['art', '畫師串', cnt(g => targetOf(g) === 'art')]] : []), ['pos', '圖片提示詞', cnt(g => targetOf(g) === 'pos')], ['neg', '負面', cnt(g => targetOf(g) === 'neg')],
    ...folders.map(n => ['f:' + n, n, cnt(g => g.folder === n)]), ...(folders.length && cnt(g => !g.folder) ? [['f:', '未分類', cnt(g => !g.folder)]] : [])];
  const list = groupsVisible();
  const item = g => view === 'compact'
    ? `<div class="gchip c-${g.color || 'gold'} ${g.star ? 'star' : ''}" draggable="true" data-id="${g.id}" title="${esc(g.text)}${'\n'}（點一下加到${TARGET_NAME[targetOf(g)]}，再點一下拿掉）">
        <button class="gc-main"><i class="gc-dot"></i>${g.star ? '<span class="gc-star">★</span>' : ''}<b>${esc(g.name)}</b>${targetOf(g) === 'neg' ? '<em>負</em>' : targetOf(g) === 'art' ? '<em class="art">畫</em>' : ''}</button><button class="gc-more" title="更多">⋯</button></div>`
    : `<div class="group c-${g.color || 'gold'} ${g.star ? 'star' : ''}" draggable="true" data-id="${g.id}" title="${esc(g.text)}">
        <span class="g-grip">⋮⋮</span><b>${g.star ? '★ ' : ''}${esc(g.name)}${g.folder ? `<em class="g-folder">${esc(g.folder)}</em>` : ''}</b><small>${esc(g.text)}</small>
        <span class="g-acts"><button class="g-art" title="加到 ① 畫師串">＋畫</button><button class="g-pos" title="加到 ② 圖片提示詞">＋圖</button><button class="g-neg" title="加到負面">＋負</button><button class="g-more" title="更多">⋯</button></span></div>`;
  return `<div class="groups-head">
      <button class="g-fold disc-head" title="收合 / 展開">${ICON.book}<b>我的提示詞組</b><span class="g-count">${gs.length}</span>${discHint()}</button>
      <small class="muted g-tip">點一下加到它設定的區域（畫師串 / 圖片提示詞 / 負面），亮起來代表已經在裡面，再點一下拿掉；也可以拖到任何一個提示詞框</small>
      <div class="grow"></div>
      <div class="seg small g-view"><button data-v="compact" class="${view === 'compact' ? 'on' : ''}" title="精簡：只顯示名稱">精簡</button><button data-v="detail" class="${view === 'detail' ? 'on' : ''}" title="詳細：顯示提示詞內容">詳細</button></div>
      <button class="btn ghost small g-from-sel" title="把任一個提示詞框裡選取的文字存成詞組">${ICON.edit}存選取文字</button>
      <button class="btn ghost small g-new">${ICON.plus}新增詞組</button></div>
    <div class="groups-body">
      <div class="g-bar"><div class="g-tabs">${tabs.map(([k, n, c]) => `<button class="${f === k && !groupQuery ? 'on' : ''}" data-f="${esc(k)}">${esc(n)}<span>${c}</span></button>`).join('')}</div>
        <label class="lib-search g-search">${ICON.search || '⌕'}<input class="field" placeholder="搜尋詞組" value="${esc(groupQuery)}" autocomplete="off"></label></div>
      <div class="${view === 'compact' ? 'gchip-list' : 'group-list'}">${list.map(item).join('') || `<p class="muted small g-empty">${gs.length ? '這裡沒有詞組' : '還沒有詞組'}</p>`}</div>
      <small class="fld-note g-note">拖曳可以調整順序，也可以拖到上面的分頁直接換分類（拖到「★ 常用」= 加星號）</small>
    </div>`;
}
/** 只重畫詞組區（不重畫整頁，提示詞框不會失焦） */
function refreshGroups() {
  const box = el?.querySelector('.groups');
  if (!box) return renderTab();
  const focused = document.activeElement?.closest('.g-search');
  box.innerHTML = groupsHTML();
  wireGroupItems(box.closest('.tab-body') || el);
  if (focused) { const i = box.querySelector('.g-search input'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

function appendTags(ta, tags) {
  const cur = ta.value.trim().replace(/,\s*$/, '');
  ta.value = cur ? `${cur}, ${tags}` : tags;
  ta.dispatchEvent(new Event('input'));
  ta.animate([{ boxShadow: '0 0 0 4px color-mix(in srgb, var(--gold) 45%, transparent)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 600 });
}

/** 每個詞組依目前提示詞框的內容亮起 / 熄滅 */
const zoneTA = (body, t) => body.querySelector(`[data-bind="banner.${t === 'neg' ? 'negative' : t === 'art' ? 'artist' : 'prompt'}"]`);
function markGroups(body) {
  body.querySelectorAll('.groups [data-id]').forEach(n => {
    const g = state.promptGroups.find(x => x.id === n.dataset.id);
    if (g) n.classList.toggle('in', groupIn(zoneTA(body, targetOf(g)), g));
  });
}

function groupMenu(anchor, g, body) {
  document.querySelector('.g-menu')?.remove();
  const pos = body.querySelector('[data-bind="banner.prompt"]'), neg = body.querySelector('[data-bind="banner.negative"]');
  const folders = groupFolders().filter(f => f !== g.folder);
  const m = h(`<div class="g-menu" role="menu">
    <button data-a="art">＋ 加到 ① 畫師串</button><button data-a="pos">＋ 加到 ② 圖片提示詞</button><button data-a="neg">＋ 加到負面</button>
    <button data-a="star">${g.star ? '☆ 取消常用' : '★ 設為常用'}</button>
    ${folders.length || g.folder ? `<div class="g-menu-sub"><small>移到分類</small>${folders.map(f => `<button data-a="move" data-f="${esc(f)}">${esc(f)}</button>`).join('')}${g.folder ? '<button data-a="move" data-f="">（未分類）</button>' : ''}</div>` : ''}
    <button data-a="edit">${ICON.edit}編輯</button><button data-a="dup">複製一份</button><button data-a="del" class="danger">${ICON.trash}刪除</button></div>`);
  document.body.append(m);
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  m.style.left = Math.min(innerWidth - mw - 8, Math.max(8, r.right - mw)) + 'px';
  m.style.top = (r.bottom + mh + 8 > innerHeight ? r.top - mh - 6 : r.bottom + 6) + 'px';
  const close = () => { m.remove(); removeEventListener('pointerdown', outside, true); };
  const outside = e => { if (!m.contains(e.target)) close(); };
  setTimeout(() => addEventListener('pointerdown', outside, true), 0);
  m.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    close();
    const a = b.dataset.a;
    if (a === 'art') appendTags(zoneTA(body, 'art'), g.text);
    if (a === 'pos') appendTags(pos, g.text);
    if (a === 'neg') appendTags(neg, g.text);
    if (a === 'star') { g.star = !g.star; save('promptGroups'); refreshGroups(); }
    if (a === 'move') { g.folder = b.dataset.f; save('promptGroups'); refreshGroups(); }
    if (a === 'edit') editGroup(g);
    if (a === 'dup') { const list = state.promptGroups; list.splice(list.indexOf(g) + 1, 0, { ...g, id: uid('g-'), name: g.name + ' 2', star: false }); save('promptGroups'); refreshGroups(); }
    if (a === 'del') {
      if (!await confirmBox(`刪除詞組「${esc(g.name)}」？`, { ok: '刪除', danger: true })) return;
      state.promptGroups = state.promptGroups.filter(x => x.id !== g.id); save('promptGroups'); refreshGroups();
    }
  };
}

/** 詞組區裡的按鈕、分頁、拖曳（每次重畫後重新綁） */
function wireGroupItems(body) {
  const pos = body.querySelector('[data-bind="banner.prompt"]'), neg = body.querySelector('[data-bind="banner.negative"]');
  const box = body.querySelector('.groups');
  if (!pos || !box) return;
  const find = id => state.promptGroups.find(g => g.id === id);
  const fold = () => { state.settings.groupsOpen = box.classList.contains('collapsed'); save('settings'); box.classList.toggle('collapsed', !state.settings.groupsOpen); };
  box.querySelector('.g-fold').onclick = e => { e.stopPropagation(); fold(); };
  box.onclick = e => { if (box.classList.contains('collapsed') && !e.target.closest('button')) fold(); };   // 收著的時候點整條都能打開
  box.querySelectorAll('.g-view button').forEach(b => b.onclick = () => { state.settings.groupView = b.dataset.v; save('settings'); refreshGroups(); });
  box.querySelectorAll('.g-tabs button').forEach(b => {
    b.onclick = () => { state.settings.groupFilter = b.dataset.f; groupQuery = ''; save('settings'); refreshGroups(); };
    // 把詞組拖到分頁上 = 換分類 / 設為常用
    b.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-nj-group') && b.dataset.f !== 'all') { e.preventDefault(); b.classList.add('drop'); } });
    b.addEventListener('dragleave', () => b.classList.remove('drop'));
    b.addEventListener('drop', e => {
      const g = find(e.dataTransfer.getData('application/x-nj-group')); if (!g) return;
      e.preventDefault();
      const f = b.dataset.f;
      if (f === 'star') g.star = true;
      else if (f === 'pos' || f === 'neg' || f === 'art') { g.target = f; if (f === 'neg') g.color = 'red'; else if (g.color === 'red') g.color = f === 'art' ? 'purple' : 'gold'; }
      else if (f.startsWith('f:')) g.folder = f.slice(2);
      save('promptGroups'); refreshGroups();
      toast(`「${g.name}」已${f === 'star' ? '設為常用' : f.startsWith('f:') ? `移到「${f.slice(2) || '未分類'}」` : `改成加到${TARGET_NAME[f]}`}`, 'ok', 1600);
    });
  });
  const search = box.querySelector('.g-search input');
  search.oninput = () => { groupQuery = search.value; refreshGroups(); };
  box.querySelector('.g-new').onclick = () => editGroup({ folder: (state.settings.groupFilter || '').startsWith('f:') ? state.settings.groupFilter.slice(2) : '', target: state.settings.groupFilter === 'neg' ? 'neg' : undefined, star: state.settings.groupFilter === 'star' });
  box.querySelector('.g-from-sel').onclick = () => {
    const art = zoneTA(body, 'art'), ta = [art, pos, neg].find(t => t && t.selectionEnd > t.selectionStart) || null;
    const text = ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd).trim().replace(/^,|,$/g, '').trim() : '';
    if (!text) return toast('先在任一個提示詞框裡選取一段文字', 'warn');
    editGroup({ text, color: ta === neg ? 'red' : ta === art ? 'purple' : 'gold', target: ta === neg ? 'neg' : ta === art ? 'art' : 'pos' });
  };
  box.querySelectorAll('[data-id]').forEach(n => {
    const g = find(n.dataset.id);
    const ta = () => zoneTA(body, targetOf(g));
    // 精簡：點名稱 = 加入 / 再點拿掉
    n.querySelector('.gc-main')?.addEventListener('click', () => {
      if (groupIn(ta(), g)) { removeTags(ta(), g.text); toast(`已從${TARGET_NAME[targetOf(g)]}拿掉「${g.name}」`, 'info', 1400); }
      else appendTags(ta(), g.text);
      markGroups(body);
    });
    n.querySelector('.g-art')?.addEventListener('click', () => { appendTags(zoneTA(body, 'art'), g.text); markGroups(body); });
    n.querySelector('.g-pos')?.addEventListener('click', () => { appendTags(pos, g.text); markGroups(body); });
    n.querySelector('.g-neg')?.addEventListener('click', () => { appendTags(neg, g.text); markGroups(body); });
    n.querySelector('.gc-more, .g-more')?.addEventListener('click', e => { e.stopPropagation(); groupMenu(e.currentTarget, g, body); });
    n.addEventListener('contextmenu', e => { e.preventDefault(); groupMenu(n, g, body); });
    n.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-nj-tags', g.text); e.dataTransfer.setData('text/plain', g.text); e.dataTransfer.setData('application/x-nj-group', g.id); n.classList.add('dragging'); body.classList.add('drag-tags'); });
    n.addEventListener('dragend', () => { n.classList.remove('dragging'); body.classList.remove('drag-tags'); box.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); });
    // 拖到別的詞組上 = 調整順序
    n.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-nj-group')) e.preventDefault(); });
    n.addEventListener('drop', e => {
      const from = e.dataTransfer.getData('application/x-nj-group');
      if (!from || from === g.id) return;
      e.preventDefault();
      const list = state.promptGroups, a = list.findIndex(x => x.id === from), b = list.findIndex(x => x.id === g.id);
      list.splice(b, 0, list.splice(a, 1)[0]); save('promptGroups'); refreshGroups();
    });
  });
  markGroups(body);
}

function wireGroups(body) {
  const pos = body.querySelector('[data-bind="banner.prompt"]'), neg = body.querySelector('[data-bind="banner.negative"]');
  if (!pos) return;
  wireGroupItems(body);
  for (const ta of [pos, neg, zoneTA(body, 'art')]) ta?.addEventListener('input', () => markGroups(body));   // 手動改提示詞時，詞組的亮燈跟著更新
  for (const ta of [pos, neg, body.querySelector('[data-bind="banner.artist"]')].filter(Boolean)) {
    ta.classList.add('tag-drop');
    ta.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-nj-tags')) { e.preventDefault(); ta.classList.add('drop-hover'); } });
    ta.addEventListener('dragleave', () => ta.classList.remove('drop-hover'));
    ta.addEventListener('drop', e => {
      const tags = e.dataTransfer.getData('application/x-nj-tags');
      if (!tags) return;
      e.preventDefault(); ta.classList.remove('drop-hover'); body.classList.remove('drag-tags');
      appendTags(ta, tags);
    });
  }
}

function wireTab(body, b, p) {
  wireGroups(body);
  if (tab === 'prompt') wirePromptUI(body, b, renderTab);
  body.querySelector('.pick-cover')?.addEventListener('click', async () => {
    const c = await pickCard('卡池封面', { allowUpload: true });
    if (c) { b.cover = c.id; save('banners'); renderHero(); }
  });
  body.querySelector('.del-banner')?.addEventListener('click', async () => {
    if (state.banners.length <= 1) return toast('至少要保留一個卡池', 'warn');
    if (!await confirmBox(`刪除卡池「${esc(b.name)}」？已抽到的卡片不會被刪除。`, { ok: '刪除', danger: true })) return;
    state.banners = state.banners.filter(x => x.id !== b.id);
    state.activeBanner = state.banners[0].id;
    save('banners'); save('activeBanner');
    renderList(); renderHero(); renderTab();
  });
  body.querySelector('.seed-rand')?.addEventListener('click', () => { p.seed = -1; save('params'); renderTab(); });
  body.querySelector('.add-char')?.addEventListener('click', () => {
    b.characters.push({ prompt: '', uc: '', x: .5, y: .5, enabled: true }); save('banners'); renderTab();
  });
  body.querySelectorAll('.del-char').forEach(btn => btn.onclick = () => { b.characters.splice(+btn.dataset.i, 1); save('banners'); renderTab(); });
  body.querySelectorAll('.pos-grid').forEach(g => g.querySelectorAll('button').forEach(btn => btn.onclick = () => {
    const c = b.characters[+g.dataset.i]; c.x = +btn.dataset.x; c.y = +btn.dataset.y; save('banners');
    g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === btn));
  }));
  const setRef = (kind, data) => {
    if (kind === 'vibe') p.vibes.push({ image: data, info: 1, strength: .6, enabled: true, cache: {} });
    else { p[kind].image = data; p[kind].enabled = true; }
    save('params'); renderTab();
  };
  body.querySelectorAll('[data-pick]').forEach(btn => btn.onclick = async () => {
    const c = await pickCard('選擇參考圖', { allowUpload: false });
    if (c) setRef(btn.dataset.pick, await blobToDataURL(c.blob));
  });
  body.querySelectorAll('[data-upload]').forEach(btn => btn.onclick = async () => {
    const [f] = await pickFiles('image/*');
    if (f) setRef(btn.dataset.upload, await blobToDataURL(f));
  });
  body.querySelectorAll('[data-clear]').forEach(btn => btn.onclick = () => { const k = btn.dataset.clear; p[k].image = ''; p[k].enabled = false; save('params'); renderTab(); });
  body.querySelectorAll('[data-del-vibe]').forEach(btn => btn.onclick = () => { p.vibes.splice(+btn.dataset.delVibe, 1); save('params'); renderTab(); });
}
