// 工坊：把抽到的圖做成會動的 LIVE 動態（深度 3D 視差 + 部件拆分形變 + 特效）
import { h, esc, uid, toast, confirmBox, modal, sparkle, download, pickFiles, makeThumb, canvasToBlob, blobURL, loadImage, imageToPngBase64, clamp, ICON } from '../util.js';
import { db } from '../db.js';
import { state, save, updateCard, addHomeSlide, removeHomeSlide } from '../store.js';
import { LiveStage, PART_TYPES, MAX_PARTS, PARTICLES, DEFAULT_FX, maskBounds, autoPivot, hydrateLive, blobToCanvas } from '../live.js';
import { estimateDepth, processDepth, DEFAULT_DEPTH, DEPTH_MODELS, DEPTH_RES } from '../depth.js';
import { slider, sliderNote, toggle, select, text, bindAll, hints } from '../forms.js';
import { HoloCard, FINISHES, CRAFT_PARAMS, DEFAULT_CRAFT, fillBackground, shotKey, CRAFT_KINDS, PAPERS, IMG_SOURCES } from '../holo.js';
/** 手感工藝的種類按鈕；target = 'layer' / 'frame' / 'img' */
const craftKinds = (cur, target) => `<div class="ck-row">${CRAFT_KINDS.map(([k, n]) => `<button class="ck ck-${k} ${(cur || 'none') === k ? 'on' : ''}" data-ck="${k}" data-target="${target}"><i></i>${n}</button>`).join('')}</div>`;
import { FRAMES, FRAME_COLORS, FONTS } from '../craftlayers.js';
import { GROUPS, ST_NAMES, stickersToLayers, layerToBlob, compositeGroup, serializeLayers, ensureOriginalLayer, isDefaultPlace } from '../layers.js';
import { addCard } from '../store.js';
import { pickCard } from '../picker.js';
import { addAssets, allAssets, deleteAsset, renameAsset, assetUsage } from '../assets.js';
import { fxTabHTML, wireFx } from './fxui.js';

const COLORS = ['#f2b84b', '#5ec2e8', '#ef6f8e', '#8ee07a', '#b48cf0', '#f59a5b', '#5b8cf5', '#e8e05e'];
const TYPE_DEFAULTS = {
  wave: { amp: 1, speed: .35, dir: 0, feather: 14 },
  breath: { amp: 1, speed: .22, dir: 0, feather: 18 },
  sway: { amp: .8, speed: .2, dir: 0, feather: 16 },
  blink: { amp: 1, speed: 1, dir: 0, feather: 3 },
  float: { amp: 1, speed: .3, dir: 0, feather: 12 },
  follow: { amp: 1, speed: 1, dir: 0, feather: 14 },
};

let el, stage = null, proj = null, sel = null, tool = 'brush', brush = 36, mode = 'preview', sideTab = 'depth';
let showDepth = false, showMasks = true, undoStack = [], dirty = false, hoverPt = null, off = [];
let depthModel = DEPTH_MODELS[0].id, depthRes = 518, depthFlip = false, depthBusy = false, fillThr = .55, recSeconds = 6;
let holo = null, stStatus = null, stJob = null, stRes = 1024, selLayer = null;
let zoomV = { s: 1, x: 0, y: 0 }, panTool = false;

export async function mount(root, query) {
  el = h(`<section class="view workshop">
    <div class="ws-main panel">
      <div class="ws-toolbar">
        <button class="btn small src-btn">${ICON.image}<span>選擇圖片</span></button>
        <span class="ws-title muted"></span>
        <div class="grow"></div>
        <div class="tools hidden">
          <button class="icon-btn ghost" data-tool="brush" title="畫筆（B）">${ICON.brush}</button>
          <button class="icon-btn ghost" data-tool="erase" title="橡皮擦（E）">${ICON.eraser}</button>
          <button class="icon-btn ghost" data-tool="pivot" title="設定支點（P）">${ICON.target}</button>
          <input class="brush-size" type="range" min="4" max="140" step="1" title="筆刷大小">
          <button class="icon-btn ghost undo" title="復原（Ctrl+Z）">${ICON.left}</button>
          <span class="tool-sep"></span>
          <button class="icon-btn ghost zm-out" title="縮小">−</button>
          <button class="btn ghost small zm-reset" title="回到 100%（雙擊畫面空白處也可以）">100%</button>
          <button class="icon-btn ghost zm-in" title="放大">+</button>
          <button class="icon-btn ghost zm-pan" title="平移（按住滑鼠中鍵拖曳也可以）">✋</button>
        </div>
        <div class="seg mode-seg"><button data-mode="edit">${ICON.edit}編輯</button><button data-mode="preview">${ICON.play}預覽</button></div>
      </div>
      <div class="ws-stage">
        <div class="ws-zoom"><div class="ws-live"></div><canvas class="ws-paint"></canvas></div>
        <div class="ws-holo"></div>
        <div class="sticker-ov hidden"></div>
        <div class="layer-hint hidden">拖曳移動 · 角落縮放 · 上方圓鈕旋轉 · 四邊裁切</div>
        <div class="ws-empty">
          <div class="we-art">${ICON.workshop}</div>
          <h3>動態工坊</h3>
          <p>選一張抽到的卡，用 AI 分析深度做出 3D 視差，<br>再把頭髮、胸口、眼睛分成部件，讓牠像動態皮膚一樣動起來。</p>
          <button class="btn primary src-btn2">${ICON.album}從卡片開始</button>
          <div class="we-lives"></div>
        </div>
      </div>
      <div class="ws-progress hidden"><i></i><span></span></div>
    </div>
    <aside class="ws-side panel">
      <div class="tabs">${[['depth', '深度 3D'], ['layers', '圖層'], ['parts', 'LIVE 拆件'], ['fx', '特效'], ['craft', '閃卡工藝'], ['out', '保存輸出']].map(([k, t]) => `<button data-tab="${k}">${t}</button>`).join('')}</div>
      <div class="ws-tab-body"></div>
      <div class="hint-bar">把滑鼠移到設定上可看說明</div>
    </aside>
  </section>`);
  root.append(el);
  el.querySelector('.src-btn').onclick = chooseSource;
  el.querySelector('.src-btn2').onclick = chooseSource;
  el.querySelectorAll('.ws-side .tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  el.querySelectorAll('.mode-seg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  el.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  const bs = el.querySelector('.brush-size'); bs.value = brush; bs.oninput = () => { brush = +bs.value; drawOverlay(); };
  el.querySelector('.undo').onclick = undo;
  hints(el.querySelector('.ws-side'), el.querySelector('.ws-side .hint-bar'));
  wirePaint();
  const onKey = e => {
    if (!proj || e.target.closest('input,textarea,select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    if (sideTab === 'parts') { if (e.key === 'b') setTool('brush'); if (e.key === 'e') setTool('erase'); if (e.key === 'p') setTool('pivot'); }
    if (e.key === ' ') { e.preventDefault(); setMode(mode === 'edit' ? 'preview' : 'edit'); }
  };
  addEventListener('keydown', onKey); off.push(() => removeEventListener('keydown', onKey));
  const ro = new ResizeObserver(() => layoutPaint()); ro.observe(el.querySelector('.ws-stage')); off.push(() => ro.disconnect());
  // 把圖片檔拖到工坊畫面上：存進「我的素材」並直接加成圖層
  const stageEl = el.querySelector('.ws-stage');
  stageEl.addEventListener('dragover', e => { if (proj && e.dataTransfer.types.includes('Files')) { e.preventDefault(); stageEl.classList.add('file-over'); } });
  stageEl.addEventListener('dragleave', e => { if (!stageEl.contains(e.relatedTarget)) stageEl.classList.remove('file-over'); });
  stageEl.addEventListener('drop', async e => {
    stageEl.classList.remove('file-over');
    if (!proj || !e.dataTransfer.files.length) return;
    e.preventDefault();
    const { added, skipped } = await addAssets([...e.dataTransfer.files]);
    if (skipped.length) toast('略過：' + skipped.join('、'), 'warn', 5000);
    if (!added.length) return;
    if (sideTab !== 'layers') setTab('layers');
    for (const a of added) await addLayerPicker({ src: 'asset:' + a.id, name: a.name, ar: String(a.width / a.height), alpha: a.alpha ? '1' : '' });
    toast(`已加入 ${added.length} 個素材圖層（也存進「我的上傳」了）`, 'ok', 2600);
  });

  if (proj) await rebuildStage();
  else renderEmptyLives();
  if (query.get('card')) await openCardForEdit(query.get('card'));
  if (query.get('live')) await openLive(query.get('live'));
  if (query.get('tab')) sideTab = query.get('tab');
  setTab(sideTab); setMode(mode); setTool(tool);
  syncTitle();
}

export function unmount() {
  stage?.destroy(); stage = null;
  holo?.destroy(); holo = null;
  off.forEach(f => f()); off = [];
}

// ---------- 專案 ----------
function newProject(imageBlob, w, hgt, extra = {}) {
  return {
    liveId: null, name: '', cardId: null, subtitle: '', quote: '',
    imageBlob, imgW: w, imgH: hgt, rawDepth: null, depthOpts: { ...DEFAULT_DEPTH }, depthCanvas: null,
    parts: [], fx: { ...DEFAULT_FX, motion: 'mouse', parallax: .045, vignette: .1 }, craft: { ...DEFAULT_CRAFT }, stMask: null, layers: [], ...extra,
  };
}

async function chooseSource() {
  if (dirty && !await confirmBox('目前的作品還沒保存，要換一張圖嗎？', { ok: '換圖' })) return;
  const res = await pickCard('選擇要加工的卡片或動態作品', { withLives: true });
  if (!res) return;
  if (res.pickedLive) return openLive(res.pickedLive);
  // 這張卡已經做過 LIVE：問要繼續修改，還是從原圖重新開始
  const lastLive = await latestLiveOf(res);
  if (lastLive) {
    const pick = await modal({
      title: '這張卡已經有動態作品', body: `<p class="modal-text">「${esc(lastLive.name)}」${(lastLive.parts || []).length ? `有 ${lastLive.parts.length} 個部件` : ''}${lastLive.depth ? '、3D 深度' : ''}。要繼續修改它，還是從原圖重新開始？</p>`,
      actions: [{ label: '取消', kind: 'ghost', value: null }, { label: '從原圖重新開始', kind: 'ghost', value: 'new' }, { label: '繼續修改動態作品', kind: 'primary', value: 'live' }],
    });
    if (!pick) return;
    if (pick === 'live') return openLive(lastLive.id, res);
  }
  await loadCard(res.id);
}

/** 這張卡最近保存的 LIVE 作品 */
async function latestLiveOf(card) {
  const lives = (await db.all('lives')).filter(l => l.cardId === card.id).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  return lives[0] || null;
}

/** 從卡冊 / 卡片詳情進來：有保存過的 LIVE 作品就接著改它（連同閃卡工藝的設定），沒有才從原圖開始 */
async function openCardForEdit(id) {
  const card = await db.get('cards', id);
  if (!card) return toast('找不到這張卡', 'error');
  const live = (card.liveId && await db.get('lives', card.liveId)) || await latestLiveOf(card);
  if (live) {
    await openLive(live.id, card);
    toast(`已載入保存的「${live.name}」，接著修改${card.craft ? '（閃卡工藝的設定也一起載入）' : ''}；想從原圖重新開始，按左上「選擇圖片」`, 'ok', 4200);
  } else {
    await loadCard(id);
    if (card.craft) toast('已載入這張卡的閃卡工藝設定，接著修改', 'ok', 2600);
  }
}

/** 把卡片上保存的閃卡工藝（參數、圖層、See-through 遮罩、立體深度）放回目前的專案 */
async function restoreCraft(card, { keepLayers = false } = {}) {
  if (!card?.craft) return;
  const { mask, depthMap, layers: savedLayers, stickers: oldStickers, ...craft } = card.craft;
  proj.craft = { ...DEFAULT_CRAFT, ...craft };
  if (!keepLayers) proj.layers = ensureOriginalLayer(savedLayers ? savedLayers.map(l => ({ ...l })) : stickersToLayers(oldStickers), { cardId: card.id });
  if (mask && craft.maskSource === 'seethrough' && !proj.stMask) proj.stMask = await blobToCanvas(mask).catch(() => null);
  // 沒有 LIVE 深度時，用閃卡保存的深度圖（已經調整過，所以不再柔化、貼合）
  if (depthMap && !proj.rawDepth) {
    proj.rawDepth = await blobToCanvas(depthMap).catch(() => null);
    if (proj.rawDepth) { proj.depthOpts = { ...DEFAULT_DEPTH, blur: 0, edge: 0 }; proj.depthCanvas = processDepth(proj.rawDepth, proj.depthOpts); }
  }
}

async function loadCard(id) {
  const card = await db.get('cards', id);
  if (!card) return toast('找不到這張卡', 'error');
  const img = await loadImage(card.blob); URL.revokeObjectURL(img.src);
  proj = newProject(card.blob, img.naturalWidth, img.naturalHeight, { cardId: card.id, name: card.name + ' · LIVE', subtitle: card.subtitle, quote: card.quote,
    layers: ensureOriginalLayer([], { cardId: card.id }) });
  await restoreCraft(card);
  sel = null; undoStack = []; dirty = false;
  await rebuildStage();
  setTab('depth'); setMode('preview');
  history.replaceState(null, '', '#workshop');
}

async function openLive(id, card = null) {
  const live = await db.get('lives', id);
  if (!live) return;
  card ??= live.cardId ? await db.get('cards', live.cardId) : null;
  const img = await loadImage(live.image); URL.revokeObjectURL(img.src);
  const { rawDepth, parts } = await hydrateLive(live);
  proj = newProject(live.image, img.naturalWidth, img.naturalHeight, {
    liveId: live.id, name: live.name, cardId: live.cardId, subtitle: live.subtitle || '', quote: live.quote || '',
    rawDepth, depthOpts: { ...DEFAULT_DEPTH, ...live.depthOpts }, fx: { ...DEFAULT_FX, ...live.fx },
    parts: parts.map(p => ({ ...p })), layers: ensureOriginalLayer((live.layers || []).map(l => ({ ...l })), { cardId: live.cardId, imageBlob: live.image }),
  });
  if (rawDepth) proj.depthCanvas = processDepth(rawDepth, proj.depthOpts, await depthGuide());
  // 閃卡工藝的設定也一起放回來（圖層以 LIVE 作品保存的為準；LIVE 沒有圖層時用閃卡的）
  await restoreCraft(card, { keepLayers: (live.layers || []).length > 0 });
  sel = proj.parts[0]?.id || null; undoStack = []; dirty = false;
  await rebuildStage();
  history.replaceState(null, '', '#workshop');
  setTab(sideTab);
}

async function rebuildStage() {
  stage?.destroy(); stage = null;
  holo?.destroy(); holo = null;
  el.querySelector('.ws-empty').classList.toggle('hidden', !!proj);
  if (!proj) return;
  stage = new LiveStage(el.querySelector('.ws-live'), { fit: 'contain', pointer: el.querySelector('.ws-stage') });
  await stage.setImage(proj.fx.useLayers ? await layerComposite() : proj.imageBlob);
  stage.setDepth(proj.depthCanvas);
  stage.setParts(proj.parts);
  stage.set(proj.fx);
  stage.rest = mode === 'edit';
  if (['craft', 'layers'].includes(sideTab)) stage.pause();
  layoutPaint();
  syncTitle();
}

function syncTitle() {
  el.querySelector('.ws-title').textContent = proj ? `${proj.name || '未命名作品'}${dirty ? ' ·（未保存）' : ''}` : '';
}
const touch = () => { dirty = true; syncTitle(); };

async function renderEmptyLives() {
  const lives = (await db.all('lives')).sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const box = el.querySelector('.we-lives');
  box.innerHTML = lives.length ? `<small>繼續編輯</small><div>${lives.map(l => `<button data-id="${l.id}" title="${esc(l.name)}"><img src="${blobURL('live:' + l.id, l.thumb)}" alt=""></button>`).join('')}</div>` : '';
  box.querySelectorAll('button').forEach(b => b.onclick = () => openLive(b.dataset.id));
}

// ---------- 模式 / 工具 / 分頁 ----------
function setMode(m) {
  mode = m;
  el.querySelectorAll('.mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  if (stage) { stage.rest = m === 'edit'; stage.draw(); }
  el.querySelector('.ws-paint').classList.toggle('hidden', m !== 'edit' && !showDepth);
  el.querySelector('.tools').classList.toggle('hidden', !(m === 'edit' && sideTab === 'parts'));
  el.querySelector('.ws-stage').classList.toggle('editing', m === 'edit' && sideTab === 'parts');
  drawOverlay();
}

function setTool(t) {
  tool = t;
  el.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  el.querySelector('.ws-stage').dataset.tool = t;
}

function setTab(t) {
  if (t !== 'parts' && zoomV.s !== 1) resetZoom();
  sideTab = t;
  const holoTab = (t === 'craft' || t === 'layers') && !!proj;
  el.querySelector('.ws-stage').classList.toggle('crafting', holoTab);
  el.querySelector('.mode-seg').classList.toggle('hidden', holoTab);
  el.querySelector('.sticker-ov').classList.toggle('hidden', t !== 'layers');
  el.querySelector('.layer-hint').classList.toggle('hidden', t !== 'layers');
  holo?.setEditing(t === 'layers');
  if (stage) holoTab ? stage.pause() : stage.play();
  if (holoTab) ensureHolo().then(() => { holo?.setEditing(t === 'layers'); syncHoloLive(); setTimeout(drawLayerOverlay, 450); });
  el.querySelectorAll('.ws-side .tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  if (t === 'parts' && proj) setMode('edit');
  else if (proj && mode === 'edit' && t !== 'parts') setMode('preview');
  else setMode(mode);
  renderSide();
}

// ---------- 側欄 ----------
function renderSide() {
  const body = el.querySelector('.ws-tab-body');
  if (!proj) { body.innerHTML = `<p class="muted pad">先選一張圖片。</p>`; return; }
  const views = { depth: depthTab, layers: layersTab, parts: partsTab, fx: () => fxTabHTML(proj), craft: craftTab, out: outTab };
  body.innerHTML = views[sideTab]();
  const ctx = { proj, part: proj.parts.find(p => p.id === sel), layer: proj.layers.find(x => x.id === selLayer), ui: { fillThr, recSeconds, showDepth, showMasks, stRes, res: depthRes, flipAvg: depthFlip } };
  bindAll(body, ctx, (path, v) => {
    touch();
    if (path.startsWith('proj.depthOpts')) reprocessDepth(false, path === 'proj.depthOpts.edge' ? 300 : 60);   // 邊緣貼合比較花時間，放開一下再算
    if (path.startsWith('proj.fx')) { stage.set(proj.fx); if (holo?.live) holo.updateLiveFx(proj.fx); }
    if (path === 'proj.fx.useLayers' || path === 'proj.fx.layersTop') { refreshStageImage(); if (path === 'proj.fx.useLayers') renderSide(); }
    if (path.startsWith('part.')) {
      if (path === 'part.type') { Object.assign(ctx.part, TYPE_DEFAULTS[v]); ctx.part.pivot = null; renderSide(); }
      if (path === 'part.name') renderPartList(body);
      pushParts();
    }
    if (path === 'ui.res') depthRes = +v;
    if (path === 'ui.flipAvg') depthFlip = v;
    if (path === 'ui.fillThr') fillThr = v;
    if (path === 'ui.recSeconds') recSeconds = v;
    if (path === 'ui.showDepth') { showDepth = v; setMode(mode); }
    if (path === 'ui.showMasks') { showMasks = v; drawOverlay(); }
    if (path === 'proj.name') syncTitle();
    if (path.startsWith('layer.')) { pushLayers(); drawLayerOverlay(); if (path === 'layer.name' || path === 'layer.opacity') renderLayerList(body); }
    if (path === 'proj.craft.liveSync') syncHoloLive();
    if (path.startsWith('proj.craft')) {
      holo?.set(proj.craft);
      if (path === 'proj.craft.maskSource') { refreshHoloMask(); renderSide(); }
      if (path === 'proj.craft.paper' || path === 'proj.craft.imgSrc') renderSide();   // 會多出 / 少掉相關的滑桿
      if (path === 'proj.craft.maskThreshold') refreshHoloMask(true);
    }
    if (path === 'ui.stRes') stRes = +v;
  });
  wireSide(body);
}

const depthTab = () => `
  <div class="ws-sec">
    <h4>AI 深度分析</h4>
    <p class="note">${ICON.depth}在瀏覽器內執行 Depth Anything V2，第一次需下載模型（之後會快取）。越亮越近。有顯卡（WebGPU）時快很多。</p>
    ${select('深度模型', 'ui.model', DEPTH_MODELS.map(m => [m.id, m.name]), 'Small 幾秒就好；Base / Large 的深度層次和遠近關係比較準，但第一次下載比較久')}
    ${select('推論解析度', 'ui.res', DEPTH_RES.map(([v, n]) => [String(v), n]), '越高頭髮、手指、衣服邊緣越細；圖片本身不大時，超過原圖短邊就沒有幫助')}
    ${toggle('左右翻轉再算一次取平均（更穩定，時間 ×2）', 'ui.flipAvg', '減少模型偶爾的怪異亮塊或歪斜，深度比較對稱自然')}
    <div class="row wrap">
      <button class="btn primary small run-depth" ${depthBusy ? 'disabled' : ''}>${ICON.wand}${proj.rawDepth ? '重新分析' : '分析深度'}</button>
      <button class="btn ghost small up-depth">${ICON.upload}上傳深度圖</button>
      ${proj.rawDepth ? `<button class="btn ghost small danger rm-depth">${ICON.trash}移除</button>` : ''}
    </div>
    ${proj.rawDepth && proj.depthCanvas ? `<div class="depth-thumb"><img src="${proj.depthCanvas.toDataURL()}" alt="深度圖"></div>` : ''}
  </div>
  ${proj.rawDepth ? `<div class="ws-sec">
    <h4>深度調整</h4>
    ${toggle('在畫面上顯示深度圖', 'ui.showDepth')}
    ${slider('近端裁切', 'proj.depthOpts.near', .3, 1, .01, '比這更亮的都當作最近；調低可讓主體更突出')}
    ${slider('遠端裁切', 'proj.depthOpts.far', 0, .7, .01, '比這更暗的都當作最遠；調高可讓背景整片平貼')}
    ${slider('遠近對比', 'proj.depthOpts.gamma', .3, 3, .05, '小於 1 讓中景往前、大於 1 讓中景往後')}
    ${slider('主體分離', 'proj.depthOpts.sep', 0, 1, .01, '把中間的深度往兩邊推開：主體更往前、背景更往後，距離感更明確；太高會像剪紙')}
    ${slider('景深層數', 'proj.depthOpts.layers', 0, 12, 1, '0 = 連續的深度；2–12 = 分成幾片，像立體紙雕或舞台佈景，搭配「邊緣柔化」讓接縫柔和')}
    ${slider('邊緣貼合', 'proj.depthOpts.edge', 0, 1, .01, '用原圖當參考，讓深度的邊緣貼齊人物輪廓、同一塊平面不再有雜訊；轉動時邊緣比較不會被拉扯')}
    ${slider('邊緣柔化', 'proj.depthOpts.blur', 0, 16, .5, '柔化深度邊緣，減少轉動時邊緣拉扯；太高會讓主體變平')}
    ${toggle('反轉深度', 'proj.depthOpts.invert', '深度圖若是「越暗越近」請打開')}
  </div>` : ''}
  <div class="ws-sec">
    <h4>3D 鏡頭</h4>
    ${select('鏡頭運動', 'proj.fx.motion', [['mouse', '跟隨滑鼠 / 陀螺儀'], ['orbit', '自動環繞'], ['sway', '左右搖擺'], ['nod', '上下點頭'], ['dolly', '推拉縮放'], ['still', '靜止']], '沒有移動滑鼠時，「跟隨滑鼠」會自己緩慢漂移')}
    ${slider('立體強度', 'proj.fx.parallax', 0, .14, .002, '轉動時的位移量；太大會在邊緣看到拉扯')}
    ${slider('焦點深度', 'proj.fx.focus', 0, 1, .01, '這個深度的東西保持不動；0.5 左右最自然，1 = 以最前面為軸')}
    ${slider('運動速度', 'proj.fx.motionSpeed', .1, 2, .05)}
  </div>`;

const partsTab = () => {
  const part = proj.parts.find(p => p.id === sel);
  const tdef = part && PART_TYPES.find(t => t.id === part.type);
  return `
  <div class="ws-sec st-sec">
    <h4>${ICON.wand}AI 自動拆層 <span class="muted small">See-through</span></h4>
    <p class="note">${ICON.layers}用本機的 See-through 把人物拆成頭髮、臉、眼睛、衣服等圖層，自動做成部件，並換上更乾淨的分層深度。需要 NVIDIA 顯卡，約 2–5 分鐘。</p>
    <div class="row wrap">
      ${select('解析度', 'ui.stRes', [[768, '768（快、省顯存）'], [1024, '1024（推薦）'], [1280, '1280（精細）']], '越高越精細，但更慢、更吃顯示記憶體')}
    </div>
    <div class="row wrap">
      ${stJob ? `<button class="btn ghost small danger st-cancel">${ICON.x}取消拆層</button>` : `<button class="btn primary small st-run" ${stStatus && !stStatus.available ? 'disabled' : ''}>${ICON.wand}開始自動拆層</button>`}
    </div>
    <p class="st-status small ${stStatus && !stStatus.available ? 'warn' : 'muted'}">${stStatus ? (stStatus.available ? `已找到 See-through：${esc(stStatus.root)}` : stStatus.online ? '線上版沒有 See-through 自動拆層（需要在自己電腦安裝本機版與 NVIDIA 顯卡）；可以用畫筆手動塗出部件' : stStatus.outdated ? '本機伺服器是舊版，還沒有 See-through 功能：請關閉黑色伺服器視窗，重新開啟「啟動抽卡模擬器.cmd」' : `找不到 See-through（${esc(stStatus.root)}），請確認安裝位置，或設定環境變數 SEETHROUGH_ROOT`) : '檢查 See-through 中…'}</p>
  </div>
  <div class="ws-sec">
    <h4>部件 <span class="muted">${proj.parts.length}/${MAX_PARTS}</span></h4>
    <p class="note">${ICON.layers}選一個部件，在圖上塗出它的範圍，再設定怎麼動。按空白鍵切換編輯 / 預覽。</p>
    <div class="part-list"></div>
    <div class="row wrap">
      <button class="btn ghost small add-part" ${proj.parts.length >= MAX_PARTS ? 'disabled' : ''}>${ICON.plus}新增部件</button>
      ${proj.parts.length ? '' : `<button class="btn primary small tpl-parts">${ICON.sparkles}套用常見部件</button>`}
      ${toggle('顯示遮罩', 'ui.showMasks')}
    </div>
  </div>
  ${part ? `<div class="ws-sec part-edit">
    <h4><i class="pdot" style="background:${part.color}"></i>${esc(part.name)}</h4>
    ${text('名稱', 'part.name', { max: 12 })}
    <div class="fld"><span>動作</span><div class="type-grid">${PART_TYPES.map(t => `<button class="${t.id === part.type ? 'on' : ''}" data-type="${t.id}" data-hint="${esc(t.hint)}">${t.name}</button>`).join('')}</div></div>
    <p class="muted small">${esc(tdef.hint)}</p>
    ${slider('幅度', 'part.amp', 0, 3, .05)}
    ${slider('速度', 'part.speed', .05, 2, .01, part.type === 'blink' ? '眨眼頻率：1 ≈ 每 4.5 秒一次' : '每秒幾個循環')}
    ${part.type === 'blink' || part.type === 'follow' ? '' : slider('相位', 'part.phase', 0, 6.28, .05, '讓多個部件錯開節奏，看起來更自然')}
    ${part.type === 'wave' ? slider('飄動方向（度）', 'part.dir', -180, 180, 1, '0 = 左右飄、90 = 上下飄') : ''}
    ${slider('邊緣羽化', 'part.feather', 0, 40, 1, '遮罩邊緣越柔，動起來越不會撕裂')}
    <div class="row wrap">
      <button class="btn ghost small reset-pivot">${ICON.target}支點：${part.pivot ? '手動（點此改回自動）' : '自動'}</button>
      <button class="btn ghost small clear-mask">${ICON.eraser}清空遮罩</button>
      <button class="btn ghost small danger del-part">${ICON.trash}</button>
    </div>
    ${proj.depthCanvas ? `<div class="fill-depth">${slider('以深度選取（門檻）', 'ui.fillThr', .05, .95, .01, '把比門檻更近的區域加入這個部件，例如選出整個人物做漂浮或呼吸')}<button class="btn ghost small do-fill">${ICON.wand}加入遮罩</button></div>` : ''}
  </div>` : ''}`;
};

const craftTab = () => {
  const c = proj.craft;
  const need = (c.maskSource === 'depth' || c.maskSource === 'depth3d') && !proj.depthCanvas ? '還沒有深度圖：先到「深度 3D」分頁按「分析深度」'
    : c.maskSource === 'parts' && !proj.parts.length ? '還沒有部件：先在「LIVE 拆件」建立部件或執行自動拆層'
      : c.maskSource === 'seethrough' && !proj.stMask ? '還沒有 See-through 結果：先在「LIVE 拆件」按「開始自動拆層」' : '';
  return `
  <div class="ws-sec">
    <h4>${ICON.sparkles}閃卡工藝</h4>
    <p class="note">${ICON.sparkles}把卡片做成會隨角度流光的 3D 全息閃卡。把滑鼠移到預覽上可以轉動卡片。材質公式移植自 RuiC-card-skill（MIT）。</p>
    <div class="fld"><span>卡面質感</span><div class="finish-grid">${FINISHES.map(([id, n, hint]) => `<button class="finish-sw ${c.finish === id ? 'on' : ''}" data-finish="${id}"><i class="fs-${id}"></i><b>${n}</b><small>${hint}</small></button>`).join('')}</div></div>
  </div>
  <div class="ws-sec">
    <h4>分層</h4>
    ${select('人物立體方式', 'proj.craft.maskSource', [['depth3d', '深度圖立體（推薦：逐像素浮起、不切割）'], ['depth', '用深度門檻切出人物'], ['parts', '用 LIVE 部件的範圍切出人物'], ['seethrough', '用 See-through 角色圖層切出人物'], ['none', '不分層（整張當一層）']])}
    ${c.maskSource === 'depth3d'
      ? `<small class="fld-note">原圖用自己的深度圖做連續景深，不會有切割邊；素材不吃深度圖，依「圖層」分頁的組別放在前中後：背景組最後面、主體組素材與人物最近處同高、外圍組最前面。「主體景深」是最近處浮起的量，「背景景深」是最遠處退後的量</small>`
      : `<small class="fld-note">切出人物後，人物和背景各是一片平面，轉動時前後錯開${proj.layers.some(l => l.group === 'subject' && l.visible !== false) ? `；目前使用「圖層」分頁主體組（${proj.layers.filter(l => l.group === 'subject').length} 層）當人物範圍` : ''}</small>`}
    ${c.maskSource === 'depth' ? sliderNote('深度門檻', 'proj.craft.maskThreshold', .05, .95, .01, '比這更近的區域算人物；調高只留最前面的部分') : ''}
    ${need ? `<p class="st-status warn small">${need}</p>` : ''}
  </div>
  <div class="ws-sec"><h4>鐳射與光澤</h4>${CRAFT_PARAMS.slice(0, 8).map(([k, n, a, b, st, note]) => sliderNote(n, 'proj.craft.' + k, a, b, st, note)).join('')}</div>
  <div class="ws-sec"><h4>立體層次</h4>${CRAFT_PARAMS.slice(8).map(([k, n, a, b, st, note]) => sliderNote(n, 'proj.craft.' + k, a, b, st, note)).join('')}</div>
  <div class="ws-sec">
    <h4>${ICON.layers}素材與分層</h4>
    <p class="note">${ICON.layers}素材貼圖、人物與背景的上下關係，都在「圖層」分頁像 PSD 一樣安排；素材會依「背景 / 主體 / 外圍」放在不同深度，原圖則依上面的「人物立體方式」。目前 ${proj.layers.length} 個圖層。</p>
    <button class="btn ghost small go-layers">${ICON.layers}前往圖層分頁</button>
  </div>
  <div class="ws-sec">
    <h4>${ICON.sparkles}手感工藝</h4>
    <p class="note">${ICON.sparkles}<span>燙金、燙銀、打凸、壓紋、UV 亮油。可以加在三個地方：<b>任何圖層</b>（到「圖層」分頁點一個圖層，例如上傳的簽名、LOGO、花紋）、下面的<b>卡框與文字</b>，或<b>直接從原圖取範圍</b>（例如把圖裡亮亮的飾品變成真的燙金）。轉動卡片時燙箔會反光、凸紋會有陰影。</span></p>
    <div class="fld"><span>卡框與文字</span>${craftKinds(c.frameCraft, 'frame')}</div>
    <div class="fld"><span>從原圖取範圍 <em>選了加工方式才會生效</em></span>${craftKinds(c.imgCraft, 'img')}</div>
    ${c.imgCraft && c.imgCraft !== 'none' ? `
      ${select('依據', 'proj.craft.imgSrc', IMG_SOURCES, '用原圖的哪個特徵決定加工範圍')}
      ${c.imgSrc === 'color' ? `<label class="fld"><span>顏色 <em>跟這個顏色接近的地方</em></span><input type="color" class="field ck-color" value="${esc(c.imgColor || '#d4af37')}"></label>` : ''}
      ${sliderNote('門檻', 'proj.craft.imgThr', .05, .95, .01, '越高範圍越小；調到只剩想加工的地方')}
      ${sliderNote('強度', 'proj.craft.imgAmt', .1, 1, .01, '燙箔覆蓋程度或凸起深淺')}
      ${c.imgSrc === 'depth' && !proj.depthCanvas ? '<p class="st-status warn small">「近處」需要深度圖：先到「深度 3D」分頁分析</p>' : ''}` : ''}
    ${select('整張紙紋', 'proj.craft.paper', PAPERS, '整張卡面的紙張質感，斜著看會更明顯')}
    ${c.paper && c.paper !== 'none' ? sliderNote('紙紋深淺', 'proj.craft.paperAmt', 0, 1, .01, '紋路的凹凸程度') : ''}
    ${sliderNote('立體高度', 'proj.craft.craftH', 0, 1.5, .01, '打凸、壓紋、燙箔邊緣的斜面有多明顯')}
    ${sliderNote('金屬光澤', 'proj.craft.craftShine', 0, 2, .01, '燙箔和 UV 亮油的反光強度')}
  </div>
  <div class="ws-sec">
    <h4>卡框</h4>
    <div class="frame-grid">${FRAMES.map(([id, n, hint]) => `<button class="frame-sw ${c.frame === id ? 'on' : ''}" data-frame="${id}" title="${esc(hint)}"><i class="fr-${id}"></i><span>${n}</span></button>`).join('')}</div>
    <small class="fld-note">${esc((FRAMES.find(f => f[0] === c.frame) || FRAMES[0])[2])}。卡框依卡片比例繪製，直式、橫式都能用，不跟視差移動</small>
    <div class="fld"><span>卡框顏色</span><div class="seg small frame-colors">${FRAME_COLORS.map(([v, n]) => `<button data-fc="${v}" class="${(c.frameColor || 'gold') === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
  </div>
  <div class="ws-sec">
    <h4>文字</h4>
    <div class="toggle-grid">
      ${toggle('卡名', 'proj.craft.showName')}${toggle('英文名 / 稱號', 'proj.craft.showSubtitle')}
      ${toggle('稀有度', 'proj.craft.showRarity')}${toggle('編號', 'proj.craft.showSerial')}
      ${toggle('文字底襯', 'proj.craft.showPlate', '文字後面的漸層底色，讓字在亮圖上也看得清楚')}
    </div>
    ${text('附加文字（選填）', 'proj.craft.flavor', { max: 40, placeholder: '例如：「鎖鏈，欺騙，命運……」', hint: '顯示在卡名下方的小字' })}
    <div class="fld"><span>文字位置</span><div class="seg small text-pos"><button data-tp="bottom" class="${c.textPos !== 'top' ? 'on' : ''}">下方</button><button data-tp="top" class="${c.textPos === 'top' ? 'on' : ''}">上方</button></div></div>
    ${select('字體', 'proj.craft.textFont', FONTS)}
    ${select('文字顏色', 'proj.craft.textColor', [['light', '白色（暗圖）'], ['dark', '墨色（亮圖）'], ['gold', '跟卡框同色']])}
    ${sliderNote('文字大小', 'proj.craft.textSize', .6, 1.6, .05, '卡名、稱號、編號一起縮放')}
    ${toggle('沒碰的時候自動輕輕擺動', 'proj.craft.auto')}
  </div>
  <div class="ws-sec">
    <h4>${ICON.play}動態閃卡</h4>
    ${toggle('結合 LIVE 拆件：卡面跟著部件動作、並疊上粒子特效', 'proj.craft.liveSync', '開啟後閃卡會同時有 LIVE 動態和全息鐳射；保存時會一起保存 LIVE 作品')}
    <small class="fld-note">${proj.parts.length ? `目前有 ${proj.parts.length} 個 LIVE 部件` : '還沒有 LIVE 部件：先到「LIVE 拆件」建立，或只用特效'}。「特效」分頁的粒子、光束、極光、稜鏡、閃電、水底光紋、漏光、結霜、掃描線、調色、色相、顆粒、暗角都會疊到閃卡上（熱浪、故障、像素化、移軸、霓虹、雨滴等需要重新取樣的不套用）。動態只套用在「原圖」圖層上（主體組只有原圖、且沒有移動縮放時）</small>
    ${proj.craft.liveSync && holo && holo.liveOK === false ? '<p class="st-status warn small">主體組有其他圖層或原圖被移動過，這時卡面不會動（粒子仍會顯示）</p>' : ''}
  </div>
  <div class="ws-sec">
    <div class="row wrap">
      <button class="btn primary apply-craft">${ICON.check}套用到卡片</button>
      <button class="btn holo-home">${ICON.home}放到首頁展示</button>
      <button class="btn ghost small reset-craft">恢復預設</button>
      <button class="btn ghost small craft-shot">${ICON.download}截圖 PNG</button>
      <button class="btn ghost small craft-export">${ICON.download}匯出互動閃卡 HTML</button>
      <button class="btn ghost small craft-gif">${ICON.film}匯出 GIF</button>
    </div>
    <small class="fld-note">套用後，卡冊會顯示做好的閃卡（卡片詳情可以改回原圖）；「放到首頁展示」會套用並把閃卡立在首頁。「匯出互動閃卡」會存成一個 .html 檔，傳給別人用瀏覽器打開就能轉著看（滑鼠傾斜、拖曳翻面、手機陀螺儀），不需要這個網站</small>
  </div>`;
};

const outTab = () => `
  <div class="ws-sec">
    <h4>作品資訊</h4>
    ${text('作品名稱', 'proj.name', { max: 24 })}
    ${text('英文名 / 稱號', 'proj.subtitle', { max: 28, hint: '設為首頁時，名牌上的大字' })}
    ${text('台詞', 'proj.quote', { area: true, rows: 2, hint: '設為首頁時會以打字效果顯示' })}
    <div class="row wrap">
      <button class="btn primary save-live">${ICON.check}${proj.liveId ? '儲存' : '保存動態作品'}</button>
      ${proj.liveId ? `<button class="btn ghost small save-as">另存新作品</button>` : ''}
      <button class="btn set-home">${ICON.home}設為首頁背景</button>
    </div>
  </div>
  <div class="ws-sec">
    <h4>匯出</h4>
    ${toggle('包含圖層（背景 / 主體 / 外圍素材）', 'proj.fx.useLayers', '和「特效 → 圖層合成」是同一個開關；開啟後預覽、保存、設為首頁、WebM 與 PNG 都會帶上圖層')}
    ${proj.fx.useLayers ? toggle('也包含最上層', 'proj.fx.layersTop') : ''}
    ${slider('影片長度（秒）', 'ui.recSeconds', 2, 20, 1)}
    <div class="row wrap"><button class="btn ghost small rec">${ICON.film}錄製 WebM</button><button class="btn ghost small rec-gif">${ICON.film}錄製 GIF</button><button class="btn ghost small shot">${ICON.download}截圖 PNG</button></div>
  </div>
  <div class="ws-sec">
    <h4>${ICON.sparkles}分享參數</h4>
    <p class="note">${ICON.sparkles}把這個作品的特效、閃卡工藝、深度設定、部件動作打包成一串分享碼或一個小檔案（不含圖片與遮罩），別人貼上就能套用同樣的風格。</p>
    <div class="row wrap">
      <button class="btn small share-copy">複製分享碼</button>
      <button class="btn ghost small share-file">${ICON.download}下載參數檔</button>
      <button class="btn ghost small share-apply">${ICON.upload}套用別人的參數</button>
    </div>
  </div>
  <div class="ws-sec">
    <h4>我的動態作品</h4>
    <div class="live-list"></div>
  </div>`;

function renderPartList(body) {
  const list = body.querySelector('.part-list');
  if (!list) return;
  list.innerHTML = proj.parts.map(p => `<div class="part-row ${p.id === sel ? 'on' : ''}" data-id="${p.id}">
    <i class="pdot" style="background:${p.color}"></i><b>${esc(p.name)}</b><small>${PART_TYPES.find(t => t.id === p.type).name}</small>
    <label class="mini-sw" title="啟用"><input type="checkbox" ${p.enabled !== false ? 'checked' : ''}><i class="sw"></i></label></div>`).join('') || '<p class="muted small">還沒有部件</p>';
  list.querySelectorAll('.part-row').forEach(r => {
    r.onclick = e => { if (e.target.closest('.mini-sw')) return; sel = r.dataset.id; renderSide(); drawOverlay(); };
    r.querySelector('input').onchange = e => { proj.parts.find(p => p.id === r.dataset.id).enabled = e.target.checked; touch(); pushParts(); drawOverlay(); };
  });
}

function wireSide(body) {
  const q = s => body.querySelector(s);
  // 深度
  const modelSel = q('[data-bind="ui.model"]');
  if (modelSel) { modelSel.value = depthModel; modelSel.onchange = () => { depthModel = modelSel.value; }; }
  q('.run-depth')?.addEventListener('click', runDepth);
  q('.up-depth')?.addEventListener('click', async () => {
    const [f] = await pickFiles('image/*');
    if (!f) return;
    proj.rawDepth = await blobToCanvas(f); touch(); reprocessDepth(true);
  });
  q('.rm-depth')?.addEventListener('click', () => { proj.rawDepth = proj.depthCanvas = null; stage.setDepth(null); showDepth = false; touch(); renderSide(); setMode(mode); });
  // 部件
  renderPartList(body);
  q('.add-part')?.addEventListener('click', addPartMenu);
  q('.tpl-parts')?.addEventListener('click', () => {
    [['頭髮', 'wave'], ['胸口', 'breath'], ['頭部', 'sway'], ['眼睛', 'blink']].forEach(([n, t]) => addPart(t, n));
    sel = proj.parts[0].id; renderSide(); toast('已加入 4 個部件，依序在圖上塗出範圍吧', 'info', 4000);
  });
  body.querySelectorAll('.type-grid button').forEach(b => b.onclick = () => {
    const part = proj.parts.find(p => p.id === sel);
    part.type = b.dataset.type; Object.assign(part, TYPE_DEFAULTS[part.type]); part.pivot = null;
    touch(); pushParts(); renderSide(); drawOverlay();
  });
  q('.reset-pivot')?.addEventListener('click', () => { const p = cur(); if (p.pivot) { p.pivot = null; touch(); pushParts(); renderSide(); drawOverlay(); } else { setTool('pivot'); toast('在圖上點一下設定支點', 'info'); } });
  q('.clear-mask')?.addEventListener('click', () => { const p = cur(); snapshot(p); p.mask.getContext('2d').clearRect(0, 0, p.mask.width, p.mask.height); touch(); pushParts(); drawOverlay(); });
  q('.del-part')?.addEventListener('click', () => { proj.parts = proj.parts.filter(p => p.id !== sel); sel = proj.parts[0]?.id || null; touch(); pushParts(); renderSide(); drawOverlay(); });
  q('.do-fill')?.addEventListener('click', fillFromDepth);
  // 輸出
  q('.save-live')?.addEventListener('click', e => saveLive(false, e));
  q('.save-as')?.addEventListener('click', e => saveLive(true, e));
  q('.set-home')?.addEventListener('click', async e => {
    const id = await saveLive(false, e);
    if (!id) return;
    addHomeSlide({ type: 'live', id });
    toast('已設為首頁背景', 'ok');
  });
  q('.rec')?.addEventListener('click', record);
  q('.rec-gif')?.addEventListener('click', async e => {
    const { askGif, liveGif } = await import('../gifexport.js');
    const o = await askGif('錄製 LIVE 動態 GIF', { seconds: Math.min(8, recSeconds), max: 10, note: '會即時錄下預覽畫面（只取圖片範圍，不含旁邊的留白），錄完再轉成 GIF。' });
    if (!o) return;
    const btn = e.target.closest('button'); btn.disabled = true;
    const was = mode; setMode('preview');
    try {
      const blob = await liveGif(stage, { ...o, onProgress: f => progress(f < .4 ? `錄製中…` : `轉成 GIF ${Math.round((f - .4) / .6 * 100)}%`, f) });
      download(blob, `${(proj.name || 'live').replace(/[\\/:*?"<>|]/g, '_')}.gif`);
      toast(`已匯出 GIF（${(blob.size / 1048576).toFixed(1)} MB）`, 'ok', 3000);
    } catch (err) { console.error(err); toast('GIF 製作失敗：' + err.message, 'error', 6000); }
    finally { progress(); btn.disabled = false; setMode(was); }
  });
  q('.share-copy')?.addEventListener('click', async () => {
    const code = await encodeShare(collectShare());
    try { await navigator.clipboard.writeText(code); toast(`已複製分享碼（${code.length} 字），貼給朋友就能套用`, 'ok', 2600); }
    catch { await modal({ title: '分享碼', body: `<textarea class="field share-out" rows="5" readonly>${esc(code)}</textarea>`, actions: [{ label: '關閉', kind: 'primary', value: true }] }); }
  });
  q('.share-file')?.addEventListener('click', () => {
    const data = collectShare();
    download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `${(proj.name || '工坊參數').replace(/[\\/:*?"<>|]/g, '_')}.njfx`);
  });
  q('.share-apply')?.addEventListener('click', applyShareDialog);
  q('.shot')?.addEventListener('click', async () => download(await canvasToBlob(stage.snapshot()), `${proj.name || 'live'}.png`));
  if (q('.live-list')) renderLiveList(q('.live-list'));
  // 閃卡工藝
  body.querySelectorAll('.finish-sw').forEach(b => b.onclick = () => {
    proj.craft.finish = b.dataset.finish; touch(); holo?.set(proj.craft);
    body.querySelectorAll('.finish-sw').forEach(x => x.classList.toggle('on', x === b));
  });
  q('.apply-craft')?.addEventListener('click', applyCraft);
  q('.holo-home')?.addEventListener('click', async e => {
    if (!await applyCraft(e)) return;
    addHomeSlide({ type: 'holo', id: proj.cardId });
    toast('已放到首頁輪播：首頁會展示這張閃卡', 'ok', 2600);
  });
  body.querySelectorAll('.frame-sw').forEach(b => b.onclick = () => { proj.craft.frame = b.dataset.frame; touch(); holo?.set(proj.craft); renderSide(); });
  body.querySelectorAll('.frame-colors button').forEach(b => b.onclick = () => { proj.craft.frameColor = b.dataset.fc; touch(); holo?.set(proj.craft); body.querySelectorAll('.frame-colors button').forEach(x => x.classList.toggle('on', x === b)); });
  body.querySelectorAll('.text-pos button').forEach(b => b.onclick = () => { proj.craft.textPos = b.dataset.tp; touch(); holo?.set(proj.craft); body.querySelectorAll('.text-pos button').forEach(x => x.classList.toggle('on', x === b)); });
  if (sideTab !== 'fx') q('.go-layers')?.addEventListener('click', () => setTab('layers'));
  if (sideTab === 'fx') wireFx(body, { proj, stage, touch, rerender: renderSide, setTab, onFx: () => { if (holo?.live) holo.updateLiveFx(proj.fx); }, imageKey: () => `${proj.cardId || proj.id}-${stageImgSeq}-${proj.depthCanvas ? 'd' : ''}` });
  wireLayers(body);
  q('.reset-craft')?.addEventListener('click', () => { proj.craft = { ...DEFAULT_CRAFT, maskSource: proj.craft.maskSource }; holo?.set({ ...proj.craft, layers: proj.layers }); refreshHoloMask(); renderSide(); });
  q('.craft-export')?.addEventListener('click', exportHoloHTML);
  q('.craft-gif')?.addEventListener('click', async () => {
    if (!holo?.base) return toast('閃卡還沒準備好', 'warn');
    const { askGif, holoGif } = await import('../gifexport.js');
    const o = await askGif('匯出閃卡 GIF', { seconds: 3, max: 6, note: '卡片會沿著「8 字」路徑傾斜一圈，頭尾無縫銜接，可以一直循環播放；圓角外面是透明的。' });
    if (!o) return;
    try {
      const blob = await holoGif(holo, { ...o, onProgress: f => progress(`製作閃卡 GIF ${Math.round(f * 100)}%`, f) });
      download(blob, `${(proj.name || 'card').replace(/[\\/:*?"<>|]/g, '_')}_閃卡.gif`);
      toast(`已匯出 GIF（${(blob.size / 1048576).toFixed(1)} MB）`, 'ok', 3000);
    } catch (err) { console.error(err); toast('GIF 製作失敗：' + err.message, 'error', 6000); }
    finally { progress(); }
  });
  q('.craft-shot')?.addEventListener('click', async () => holo && download(await canvasToBlob(holo.snapshot()), `${proj.name || 'card'}-holo.png`));
  // See-through
  q('.st-run')?.addEventListener('click', runSeeThrough);
  q('.st-cancel')?.addEventListener('click', () => stJob && fetch('/api/seethrough/cancel', { method: 'POST', body: JSON.stringify({ id: stJob }) }));
  if (sideTab === 'parts' && !stStatus && document.documentElement.dataset.online) { stStatus = { available: false, online: true }; renderSide(); }
  if (sideTab === 'parts' && !stStatus) fetch('/api/seethrough/status').then(r => r.ok ? r.json() : { available: false, outdated: true }).catch(() => ({ available: false, outdated: true })).then(s => { stStatus = s; if (sideTab === 'parts') renderSide(); });
}

const cur = () => proj.parts.find(p => p.id === sel);

async function addPartMenu() {
  const t = await modal({
    title: '新增部件', body: `<div class="type-pick">${PART_TYPES.map(t => `<button class="tp" data-t="${t.id}"><b>${t.name}</b><small>${t.hint}</small></button>`).join('')}</div>`,
    onOpen: (b, close) => b.querySelectorAll('.tp').forEach(x => x.onclick = () => close(x.dataset.t)),
  });
  if (!t) return;
  addPart(t, PART_TYPES.find(x => x.id === t).name);
  sel = proj.parts.at(-1).id; renderSide(); setTool('brush');
}

function addPart(type, name) {
  const s = 512 / Math.max(proj.imgW, proj.imgH);
  const mask = document.createElement('canvas');
  mask.width = Math.round(proj.imgW * s); mask.height = Math.round(proj.imgH * s);
  const used = new Set(proj.parts.map(p => p.color));
  proj.parts.push({ id: uid('p'), name, type, color: COLORS.find(c => !used.has(c)) || COLORS[0], mask, pivot: null, phase: Math.random() * 3, enabled: true, ...TYPE_DEFAULTS[type] });
  touch();
}

function pushParts() {
  proj.parts.forEach(p => { p.bounds = null; });
  stage?.setParts(proj.parts);
}

// ---------- 深度 ----------
async function runDepth() {
  depthBusy = true; renderSide();
  progress('準備中…', 0);
  try {
    const first = !proj.rawDepth;
    proj.rawDepth = await estimateDepth(proj.imageBlob, { model: depthModel, res: depthRes, flipAvg: depthFlip, onProgress: (t, f) => progress(t, f) });
    if (first && !proj.depthOpts.edge) proj.depthOpts.edge = .45;   // 新分析的深度預設貼齊輪廓
    touch();
    reprocessDepth(true);
    toast('深度分析完成，移動滑鼠看看立體效果', 'ok');
  } catch (e) {
    console.error(e);
    toast('深度分析失敗：' + e.message, 'error', 6000);
  } finally {
    depthBusy = false; progress(); renderSide();
  }
}

let depthTimer = 0;
/** 邊緣貼合用的原圖（只載入一次） */
async function depthGuide() {
  if (!proj) return null;
  if (!proj.guide && proj.imageBlob) proj.guide = await blobToCanvas(proj.imageBlob).catch(() => null);
  return proj.guide;
}
function reprocessDepth(now, delay = 60) {
  clearTimeout(depthTimer);
  if (proj && !proj.guide && proj.depthOpts?.edge > 0) depthGuide().then(g => g && reprocessDepth(true));   // 原圖載好後再貼合一次（先照常算）
  const run = () => {
    if (!proj?.rawDepth) return;
    proj.depthCanvas = processDepth(proj.rawDepth, proj.depthOpts, proj.guide);
    stage.setDepth(proj.depthCanvas);
    holo?.setDepthMap(proj.depthCanvas);
    const thumb = el.querySelector('.depth-thumb img');
    if (thumb) thumb.src = proj.depthCanvas.toDataURL();
    drawOverlay();
    if (now) renderSide();
  };
  if (now) run(); else depthTimer = setTimeout(run, delay);
}

function fillFromDepth() {
  const p = cur(); if (!p || !proj.depthCanvas) return;
  snapshot(p);
  const w = p.mask.width, hh = p.mask.height;
  const t = document.createElement('canvas'); t.width = w; t.height = hh;
  const tg = t.getContext('2d', { willReadFrequently: true });
  tg.drawImage(proj.depthCanvas, 0, 0, w, hh);
  const d = tg.getImageData(0, 0, w, hh);
  const g = p.mask.getContext('2d', { willReadFrequently: true });
  const m = g.getImageData(0, 0, w, hh);
  const thr = fillThr * 255;
  for (let i = 0; i < d.data.length; i += 4) if (d.data[i] >= thr) { m.data[i] = m.data[i + 1] = m.data[i + 2] = 255; m.data[i + 3] = 255; }
  g.putImageData(m, 0, 0);
  touch(); pushParts(); drawOverlay();
}

/** 閃卡工藝 → 互動閃卡 HTML（在多個傾斜角度各畫一張，播放器依角度混合） */
async function exportHoloHTML() {
  if (!holo?.base) return toast('閃卡還沒準備好', 'warn');
  const { EXPORT_QUALITY, exportInteractive } = await import('../holoexport.js');
  const body = h(`<div><p class="modal-text">會把目前的閃卡效果（鐳射、圖層、景深、粒子…）在不同傾斜角度各畫一張，打包成一個 .html 檔。對方用瀏覽器打開就能用滑鼠傾斜、拖曳翻到卡背，手機可以用陀螺儀；不需要網路，也不需要這個網站。角度越多轉起來越滑順，檔案也越大。</p>
    <div class="choice-list">${EXPORT_QUALITY.map(([id, n]) => `<button class="choice" data-v="${id}"><b>${n.split('：')[0]}</b><small>${n.split('：')[1] || ''}</small></button>`).join('')}</div></div>`);
  const quality = await modal({ title: '匯出互動閃卡', body, onOpen: (b, close) => b.querySelectorAll('.choice').forEach(x => x.onclick = () => close(x.dataset.v)) });
  if (!quality) return;
  const card = proj.cardId ? await db.get('cards', proj.cardId).catch(() => null) : null;
  try {
    const blob = await exportInteractive(holo, {
      card: { name: card?.name || proj.name, subtitle: card?.subtitle || proj.subtitle, rarity: card?.rarity }, quality,
      onProgress: f => progress(`製作互動閃卡 ${Math.round(f * 100)}%`, f),
    });
    download(blob, `${(card?.name || proj.name || 'card').replace(/[\\/:*?"<>|]/g, '_')}_互動閃卡.html`);
    toast(`已匯出互動閃卡（${(blob.size / 1048576).toFixed(1)} MB）`, 'ok', 3200);
  } catch (e) {
    console.error(e); toast('匯出失敗：' + e.message, 'error', 6000);
  } finally { progress(); }
}

function progress(text, frac) {
  const bar = el.querySelector('.ws-progress');
  bar.classList.toggle('hidden', text == null);
  if (text == null) return;
  bar.querySelector('span').textContent = text;
  bar.querySelector('i').style.width = `${Math.round((frac ?? 0) * 100)}%`;
}

// ---------- 繪製遮罩 ----------
function imageRect() {
  const z = el.querySelector('.ws-zoom');
  const st = { width: z.offsetWidth, height: z.offsetHeight };   // 未縮放的排版尺寸
  if (!proj) return null;
  const s = Math.min(st.width / proj.imgW, st.height / proj.imgH);
  const w = proj.imgW * s, hh = proj.imgH * s;
  return { x: (st.width - w) / 2, y: (st.height - hh) / 2, w, h: hh, st };
}

function layoutPaint() {
  const c = el?.querySelector('.ws-paint');
  const r = imageRect();
  if (!c || !r) return;
  const dpr = Math.min(devicePixelRatio || 1, 2) * Math.min(zoomV.s, 4);   // 放大時畫布解析度跟著提高，遮罩邊緣才清楚
  Object.assign(c.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  c.width = Math.round(r.w * dpr); c.height = Math.round(r.h * dpr);
  drawOverlay();
}

let overlayRaf = 0;
function drawOverlay() {
  cancelAnimationFrame(overlayRaf);
  overlayRaf = requestAnimationFrame(() => {
    const c = el?.querySelector('.ws-paint');
    if (!c || !proj) return;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    if (showDepth && proj.depthCanvas) { g.globalAlpha = mode === 'edit' ? .6 : .92; g.drawImage(proj.depthCanvas, 0, 0, c.width, c.height); g.globalAlpha = 1; }
    if (mode !== 'edit') return;
    if (showMasks) for (const p of proj.parts) {
      if (p.enabled === false && p.id !== sel) continue;
      const t = tint(p);
      g.globalAlpha = p.id === sel ? .55 : .22;
      g.drawImage(t, 0, 0, c.width, c.height);
    }
    g.globalAlpha = 1;
    const p = cur();
    if (p && sideTab === 'parts') {
      const piv = p.pivot || autoPivot(p.type, maskBounds(p.mask));
      const x = piv.x * c.width, y = piv.y * c.height, r = 9 * (c.width / parseFloat(c.style.width)) / zoomV.s;
      g.strokeStyle = '#fff'; g.lineWidth = r / 3.5; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = r;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.moveTo(x - r * 1.8, y); g.lineTo(x + r * 1.8, y); g.moveTo(x, y - r * 1.8); g.lineTo(x, y + r * 1.8); g.stroke();
      g.fillStyle = p.color; g.beginPath(); g.arc(x, y, r / 2.4, 0, 7); g.fill();
      g.shadowBlur = 0;
      if (hoverPt && tool !== 'pivot') {
        const k = c.width / parseFloat(c.style.width) / zoomV.s;
        g.strokeStyle = tool === 'erase' ? 'rgba(255,255,255,.9)' : p.color; g.lineWidth = 1.5 * k;
        g.setLineDash(tool === 'erase' ? [4 * k, 4 * k] : []);
        g.beginPath(); g.arc(hoverPt.x * c.width, hoverPt.y * c.height, brush / 2 * k, 0, 7); g.stroke();
        g.setLineDash([]);
      }
    }
  });
}

function tint(p) {
  p._tint ??= document.createElement('canvas');
  const t = p._tint;
  if (t.width !== p.mask.width) { t.width = p.mask.width; t.height = p.mask.height; }
  const g = t.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, t.width, t.height);
  g.drawImage(p.mask, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = p.color; g.fillRect(0, 0, t.width, t.height);
  return t;
}

function snapshot(p) {
  undoStack.push({ id: p.id, data: p.mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, p.mask.width, p.mask.height) });
  if (undoStack.length > 30) undoStack.shift();
}

function undo() {
  const u = undoStack.pop();
  if (!u) return;
  const p = proj.parts.find(x => x.id === u.id);
  if (p) { p.mask.getContext('2d').putImageData(u.data, 0, 0); pushParts(); drawOverlay(); }
}

function wirePaint() {
  const c = el.querySelector('.ws-paint');
  const norm = e => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, rw: r.width }; };
  let painting = false, last = null;
  const stamp = (p, a, b) => {
    const g = p.mask.getContext('2d');
    g.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    g.fillStyle = '#fff';
    const rad = brush / 2 * p.mask.width / a.rw;
    const dx = (b.x - a.x) * p.mask.width, dy = (b.y - a.y) * p.mask.height;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (rad * .35)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      g.beginPath(); g.arc((a.x + (b.x - a.x) * t) * p.mask.width, (a.y + (b.y - a.y) * t) * p.mask.height, rad, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  };
  c.addEventListener('pointerdown', e => {
    if (mode !== 'edit' || sideTab !== 'parts' || panTool || e.button !== 0) return;
    const p = cur();
    if (!p) { toast('先在右側新增或選擇一個部件', 'warn'); return; }
    const pt = norm(e);
    if (tool === 'pivot') { p.pivot = { x: pt.x, y: pt.y }; touch(); pushParts(); renderSide(); drawOverlay(); return; }
    c.setPointerCapture(e.pointerId);
    snapshot(p); painting = true; last = pt;
    stamp(p, pt, pt); drawOverlay();
  });
  c.addEventListener('pointermove', e => {
    hoverPt = norm(e);
    if (painting) { const p = cur(); const pt = norm(e); stamp(p, last, pt); last = pt; }
    drawOverlay();
  });
  const end = () => { if (painting) { painting = false; touch(); pushParts(); } };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  c.addEventListener('pointerleave', () => { hoverPt = null; drawOverlay(); });
  c.addEventListener('wheel', e => {
    if (sideTab !== 'parts' || !(e.ctrlKey || e.metaKey)) return;   // Ctrl + 滾輪 = 筆刷大小；一般滾輪交給縮放
    e.preventDefault(); e.stopPropagation();
    brush = Math.max(4, Math.min(140, brush - Math.sign(e.deltaY) * 4));
    el.querySelector('.brush-size').value = brush; drawOverlay();
  }, { passive: false });
  wireZoom();
}

// ---------- LIVE 拆件畫面的縮放 / 平移（方便畫遮罩） ----------
function applyZoom() {
  const z = el?.querySelector('.ws-zoom'); if (!z) return;
  z.style.transform = `translate(${zoomV.x}px, ${zoomV.y}px) scale(${zoomV.s})`;
  el.querySelector('.zm-reset').textContent = Math.round(zoomV.s * 100) + '%';
  clearTimeout(applyZoom.t);
  applyZoom.t = setTimeout(() => { stage?.resize(); layoutPaint(); }, 120);
}
function resetZoom() { zoomV = { s: 1, x: 0, y: 0 }; applyZoom(); }
function zoomAt(qx, qy, f) {
  const z = el.querySelector('.ws-zoom'), st = el.querySelector('.ws-stage').getBoundingClientRect();
  const cx = st.left + z.offsetWidth / 2, cy = st.top + z.offsetHeight / 2;
  const s2 = Math.min(8, Math.max(1, zoomV.s * f));
  const lx = (qx - cx - zoomV.x) / zoomV.s, ly = (qy - cy - zoomV.y) / zoomV.s;
  zoomV = s2 === 1 ? { s: 1, x: 0, y: 0 } : { s: s2, x: qx - cx - lx * s2, y: qy - cy - ly * s2 };
  applyZoom();
}
function wireZoom() {
  const stEl = el.querySelector('.ws-stage');
  const center = () => { const r = stEl.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  el.querySelector('.zm-in').onclick = () => zoomAt(...center(), 1.3);
  el.querySelector('.zm-out').onclick = () => zoomAt(...center(), 1 / 1.3);
  el.querySelector('.zm-reset').onclick = resetZoom;
  el.querySelector('.zm-pan').onclick = () => { panTool = !panTool; el.querySelector('.zm-pan').classList.toggle('on', panTool); stEl.classList.toggle('pan-tool', panTool); };
  stEl.addEventListener('wheel', e => {
    if (sideTab !== 'parts' || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * .0016));
  }, { passive: false });
  stEl.addEventListener('dblclick', e => { if (sideTab === 'parts' && (panTool || e.target === stEl || e.target.classList.contains('ws-zoom'))) resetZoom(); });
  stEl.addEventListener('pointerdown', e => {
    if (sideTab !== 'parts' || !(e.button === 1 || (e.button === 0 && panTool))) return;
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX - zoomV.x, sy = e.clientY - zoomV.y;
    stEl.classList.add('panning');
    const move = ev => { zoomV.x = ev.clientX - sx; zoomV.y = ev.clientY - sy; applyZoom(); };
    const up = () => { stEl.classList.remove('panning'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }, true);
}

// ---------- 分享工坊參數：特效 / 閃卡工藝 / 深度設定 / 部件動作（不含任何圖片） ----------
const CRAFT_SKIP = ['layers', 'mask', 'depthMap', 'liveId', 'stickers', 'liveSync'];
function collectShare() {
  const craft = Object.fromEntries(Object.entries(proj.craft).filter(([k]) => !CRAFT_SKIP.includes(k)));
  const { useLayers, layersTop, ...fx } = proj.fx;
  return {
    app: 'nightjar-workshop', v: 1, name: proj.name || '',
    fx, craft, depthOpts: { ...proj.depthOpts },
    parts: proj.parts.map(p => ({ name: p.name, type: p.type, amp: p.amp, speed: p.speed, phase: p.phase, dir: p.dir, feather: p.feather })),
  };
}
const b64url = u8 => { let bin = ''; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
async function encodeShare(data) {
  const raw = new TextEncoder().encode(JSON.stringify(data));
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  return 'NJFX1:' + b64url(z);
}
async function decodeShare(text) {
  text = text.trim();
  if (text.startsWith('{')) return JSON.parse(text);
  const m = text.match(/NJFX1:([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('看不懂這段分享碼（應該是 NJFX1: 開頭）');
  const raw = await new Response(new Blob([unb64url(m[1])]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  return JSON.parse(new TextDecoder().decode(raw));
}
async function applyShareDialog() {
  if (!proj) return;
  const body = h(`<div class="share-dlg">
    <p class="modal-text">貼上分享碼，或選一個 .njfx 參數檔。</p>
    <textarea class="field share-in" rows="4" placeholder="NJFX1:…"></textarea>
    <div class="row wrap"><button class="btn ghost small share-load">${ICON.upload}選擇參數檔</button><span class="muted small share-what"></span></div>
    <div class="share-picks">${[['fx', '特效（粒子、濾鏡、光影、調色…）'], ['craft', '閃卡工藝（質感、鐳射、卡框、文字…）'], ['depth', '深度設定'], ['parts', '部件動作（依部件名稱對應，例如「頭髮」）']]
      .map(([k, n]) => `<label class="fld toggle"><input type="checkbox" data-k="${k}" checked><i class="sw"></i><span>${n}</span></label>`).join('')}</div>
  </div>`);
  let data = null;
  const show = async () => {
    try { data = await decodeShare(body.querySelector('.share-in').value); }
    catch (e) { data = null; body.querySelector('.share-what').textContent = body.querySelector('.share-in').value.trim() ? e.message : ''; return; }
    if (data?.app !== 'nightjar-workshop') { data = null; body.querySelector('.share-what').textContent = '這不是工坊參數'; return; }
    body.querySelector('.share-what').textContent = `✓ 讀到「${data.name || '未命名作品'}」的參數：${data.parts?.length || 0} 個部件動作`;
  };
  body.querySelector('.share-in').addEventListener('input', show);
  body.querySelector('.share-load').onclick = async () => {
    const [f] = await pickFiles('.njfx,.json');
    if (f) { body.querySelector('.share-in').value = await f.text(); show(); }
  };
  const ok = await modal({ title: '套用別人的參數', body, actions: [{ label: '取消', kind: 'ghost', value: null }, { label: '套用', kind: 'primary', value: true }] });
  if (!ok) return;
  if (!data) return toast('沒有讀到有效的分享碼', 'warn');
  const on = k => body.querySelector(`[data-k="${k}"]`).checked;
  if (on('fx') && data.fx) { Object.assign(proj.fx, data.fx); stage?.set(proj.fx); if (holo?.live) holo.updateLiveFx(proj.fx); }
  if (on('craft') && data.craft) { Object.assign(proj.craft, data.craft); holo?.set({ ...proj.craft, forceLayers: true }); }
  if (on('depth') && data.depthOpts) { Object.assign(proj.depthOpts, data.depthOpts); reprocessDepth(true); }
  let matched = 0;
  if (on('parts') && data.parts?.length) {
    for (const sp of data.parts) {
      const p = proj.parts.find(x => x.name === sp.name) || proj.parts.find(x => x.type === sp.type && !x._shared);
      if (!p) continue;
      Object.assign(p, { type: sp.type, amp: sp.amp, speed: sp.speed, phase: sp.phase, dir: sp.dir, feather: sp.feather }); p._shared = true; matched++;
    }
    proj.parts.forEach(p => delete p._shared);
    pushParts();
  }
  touch(); renderSide();
  toast(`已套用參數${on('parts') && data.parts?.length ? `（部件動作對應到 ${matched} / ${data.parts.length} 個）` : ''}`, 'ok', 2800);
}

// ---------- 保存 / 輸出 ----------
async function saveLive(asNew, e) {
  if (!proj) return null;
  const btn = e?.currentTarget; if (btn) btn.disabled = true;
  try {
    const id = (!asNew && proj.liveId) || uid('live-');
    const old = proj.liveId && !asNew ? await db.get('lives', id) : null;
    const composite = proj.fx.useLayers ? await canvasToBlob(await layerComposite()) : null;
    const live = {
      id, name: proj.name || '未命名作品', subtitle: proj.subtitle, quote: proj.quote, cardId: proj.cardId,
      image: proj.imageBlob, composite: composite || null, thumb: (await makeThumb(composite || proj.imageBlob, 420)).blob,
      depth: proj.rawDepth ? await canvasToBlob(proj.rawDepth) : null, depthOpts: { ...proj.depthOpts },
      parts: await Promise.all(proj.parts.map(async p => ({
        id: p.id, name: p.name, type: p.type, color: p.color, pivot: p.pivot, amp: p.amp, speed: p.speed, phase: p.phase,
        dir: p.dir, feather: p.feather, enabled: p.enabled !== false, maskBlob: await canvasToBlob(p.mask),
      }))),
      fx: { ...proj.fx }, layers: serializeLayers(proj.layers), createdAt: old?.createdAt || Date.now(), updatedAt: Date.now(),
    };
    await db.put('lives', live);
    // 卡片記住最新的 LIVE 作品：卡冊裡「加入首頁」時就能選 LIVE
    if (proj.cardId) await updateCard(proj.cardId, { liveId: id });
    proj.liveId = id; dirty = false; syncTitle();
    if (e) sparkle(e.clientX, e.clientY);
    toast(asNew ? '已另存新作品' : '已保存', 'ok', 1800);
    if (sideTab === 'out') renderSide();
    return id;
  } catch (err) {
    toast('保存失敗：' + err.message, 'error');
    return null;
  } finally { if (btn) btn.disabled = false; }
}

async function renderLiveList(box) {
  const lives = (await db.all('lives')).sort((a, b) => b.createdAt - a.createdAt);
  box.innerHTML = lives.map(l => `<div class="live-item ${l.id === proj?.liveId ? 'on' : ''}" data-id="${l.id}">
    <img src="${blobURL('live:' + l.id, l.thumb)}" alt=""><span><b>${esc(l.name)}</b><small>${(l.parts || []).length} 部件${l.depth ? ' · 3D' : ''}</small></span>
    <button class="icon-btn ghost open" title="開啟">${ICON.edit}</button><button class="icon-btn ghost del" title="刪除">${ICON.trash}</button></div>`).join('') || '<p class="muted small">還沒有保存的作品</p>';
  box.querySelectorAll('.live-item').forEach(r => {
    r.querySelector('.open').onclick = async () => {
      if (dirty && !await confirmBox('目前的作品還沒保存，要開啟另一個嗎？', { ok: '開啟' })) return;
      openLive(r.dataset.id);
    };
    r.querySelector('.del').onclick = async () => {
      if (!await confirmBox('刪除這個動態作品？原本的卡片不會受影響。', { ok: '刪除', danger: true })) return;
      await db.del('lives', r.dataset.id);
      removeHomeSlide('live', r.dataset.id);
      const live = lives.find(l => l.id === r.dataset.id);
      if (live?.cardId) { const card = await db.get('cards', live.cardId); if (card?.liveId === live.id) await updateCard(card.id, { liveId: null }); }
      if (proj?.liveId === r.dataset.id) proj.liveId = null;
      renderLiveList(box);
    };
  });
}

async function record(e) {
  if (typeof MediaRecorder === 'undefined') return toast('這個瀏覽器不支援錄影', 'error');
  const btn = e.currentTarget; btn.disabled = true;
  const was = mode; setMode('preview');
  progress(`錄製中（${recSeconds} 秒）…`, 0);
  const t0 = performance.now();
  const tick = setInterval(() => progress(`錄製中（${recSeconds} 秒）…`, (performance.now() - t0) / (recSeconds * 1000)), 200);
  try {
    const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#000';
    const blob = await stage.record(recSeconds, bg);
    download(blob, `${proj.name || 'live'}.webm`);
  } catch (err) { toast('錄製失敗：' + err.message, 'error'); }
  finally { clearInterval(tick); progress(); btn.disabled = false; setMode(was); }
}

// ---------- 圖層分頁（像 PSD 的分組圖層） ----------
const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9M6.3 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/></svg>';

const layersTab = () => {
  const L = proj.layers, sl = L.find(x => x.id === selLayer);
  return `
  <div class="ws-sec">
    <h4>${ICON.layers}圖層 <span class="muted small">${L.length} 層</span></h4>
    <p class="note">${ICON.layers}像 PSD 一樣把圖層放進「最上層 / 外圍 / 主體 / 背景」。閃卡工藝會讓背景往後退、主體浮起、外圍最靠前。拖曳圖層列可以調整順序或換組；在左邊卡片上可以直接拖曳素材。</p>
    <div class="row wrap">
      <button class="btn ghost small add-layer">${ICON.plus}加入素材 / 圖片</button>
      <button class="btn ghost small add-original" title="把原圖當成一個圖層">${ICON.image}原圖</button>

    </div>
  </div>
  <div class="ws-sec layer-groups"></div>
  ${sl ? `<div class="ws-sec layer-edit">
    <h4>${esc(sl.name)} <span class="muted small">${sl.full ? '整張對齊' : '可移動素材'}</span></h4>
    ${text('名稱', 'layer.name', { max: 16 })}
    <div class="fld"><span>放在哪一組</span><div class="seg small ly-group">${GROUPS.map(([g, n]) => `<button data-g="${g}" class="${sl.group === g ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    ${sliderNote('不透明度', 'layer.opacity', 0, 1, .01, '調低可以做成淡淡的疊影或光暈')}
    <div class="fld craft-fld"><span>手感工藝 <em>在「閃卡工藝」裡轉動卡片時，燙箔會反光、打凸 / 壓紋會有立體陰影</em></span>${craftKinds(sl.craft, 'layer')}</div>
    ${sl.craft && sl.craft !== 'none' ? sliderNote('加工強度', 'layer.craftAmt', .1, 1, .01, '燙箔的覆蓋程度、凸起或壓凹的深淺') : ''}
    ${sl.craft && sl.craft !== 'none' && sl.group !== 'top' ? '<small class="fld-note">提示：手感工藝是做在卡面上的。這個圖層在「' + (GROUPS.find(g => g[0] === sl.group)?.[1] || '') + '」組，轉動卡片時會有視差，燙箔可能和圖案稍微錯開；放到「最上層」會完全貼合</small>' : ''}
    ${sl.full ? `${sliderNote('大小', 'layer.w', .1, 3, .01, '1 = 剛好鋪滿卡片；也可以在卡上用滾輪縮放')}
         ${sliderNote('旋轉', 'layer.rot', -180, 180, 1, '角度；也可以在卡上 Shift + 滾輪')}
         ${toggle('水平翻轉', 'layer.flip')}
         <button class="btn ghost small ly-reset">${ICON.target}重設成鋪滿卡片</button>
         ${sl.crop ? '<button class="btn ghost small ly-uncrop">取消裁切</button>' : ''}
         ${sl.kind === 'original' && sl.group === 'subject' ? '<small class="fld-note">原圖在主體組時，會用「閃卡工藝 → 主體遮罩來源」切出人物，背景自動補洞並跟著原圖一起移動</small>' : ''}`
      : `${sliderNote('大小', 'layer.w', .03, 1.6, .01, '佔卡片寬度的比例；也可以在卡上用滾輪縮放')}
         ${sliderNote('旋轉', 'layer.rot', -180, 180, 1, '角度；也可以在卡上 Shift + 滾輪')}
         ${toggle('水平翻轉', 'layer.flip')}
         ${sl.crop ? '<button class="btn ghost small ly-uncrop">取消裁切</button>' : ''}`}
    <small class="fld-note">在卡上拖曳外框：四邊小把手裁切、角落縮放、上方圓鈕旋轉</small>
    <div class="row wrap">
      <button class="btn ghost small ly-save" title="把這個圖層存成一張透明素材卡，之後可以重複使用">${ICON.download}存成素材卡</button>
      <button class="btn ghost small ly-dup">複製</button>
      <button class="btn ghost small danger ly-del">${ICON.trash}刪除</button>
    </div>
  </div>` : ''}
  <div class="ws-sec">
    <div class="row wrap">
      <button class="btn small flatten">${ICON.check}合成成新卡片</button>
      ${L.length ? `<button class="btn ghost small danger clear-layers">清空圖層</button>` : ''}
    </div>
    <small class="fld-note">合成會把所有看得到的圖層壓成一張新卡片（不含卡框和文字），可以拿去收藏、當背景或再加工</small>
  </div>`;
};

function layerThumb(l) {
  if (l.thumbBlob) return blobURL('lyt:' + l.id, l.thumbBlob);
  if (l.blob) return blobURL('ly:' + l.id, l.blob);
  if (l.src && !/^(card|asset):/.test(l.src)) return l.src;
  return '';
}

function renderLayerList(body) {
  const box = body.querySelector('.layer-groups');
  if (!box) return;
  box.innerHTML = GROUPS.map(([g, n, hint]) => {
    const rows = proj.layers.filter(l => l.group === g).reverse();
    return `<div class="lg" data-group="${g}">
      <div class="lg-head" title="${esc(hint)}"><b>${n}</b><small>${esc(hint)}</small><span>${rows.length}</span></div>
      <div class="lg-list">${rows.map(l => `<div class="ly-row ${l.id === selLayer ? 'on' : ''} ${l.visible === false ? 'off' : ''}" draggable="true" data-id="${l.id}">
        <button class="ly-eye" title="${l.visible === false ? '顯示' : '隱藏'}">${l.visible === false ? EYE_OFF : EYE}</button>
        <img src="${layerThumb(l)}" data-card="${l.src?.startsWith('card:') ? l.src.slice(5) : ''}" data-asset="${l.src?.startsWith('asset:') ? l.src.slice(6) : ''}" alt="">
        <span class="ly-name"><b>${esc(l.name)}</b><small>${l.full ? '整張' : '素材'}${l.kind === 'st' ? ' · 拆層' : ''}</small></span>
        <span class="ly-op">${Math.round((l.opacity ?? 1) * 100)}%</span></div>`).join('') || '<div class="ly-empty">拖曳圖層到這裡</div>'}</div></div>`;
  }).join('');
  box.querySelectorAll('img[data-card]').forEach(im => { if (im.dataset.card) db.get('cards', im.dataset.card).then(c => { if (c) im.src = blobURL('thumb:' + c.id, c.thumb); }); });
  box.querySelectorAll('img[data-asset]').forEach(im => { if (im.dataset.asset) db.get('assets', im.dataset.asset).then(a => { if (a) im.src = blobURL('ast:' + a.id, a.thumb); }); });
  box.querySelectorAll('.ly-row').forEach(r => {
    const l = proj.layers.find(x => x.id === r.dataset.id);
    r.onclick = e => {
      if (e.target.closest('.ly-eye')) { l.visible = l.visible === false; pushLayers(); renderLayerList(body); drawLayerOverlay(); return; }
      selLayer = l.id; renderSide(); drawLayerOverlay();
    };
    r.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-nj-layer', l.id); e.dataTransfer.effectAllowed = 'move'; r.classList.add('dragging'); });
    r.addEventListener('dragend', () => r.classList.remove('dragging'));
  });
  // 拖放：放在某列上 = 插到它的上方或下方；放在組上 = 移到該組最上面
  box.querySelectorAll('.lg').forEach(gEl => {
    gEl.addEventListener('dragover', e => {
      if (!e.dataTransfer.types.includes('application/x-nj-layer')) return;
      e.preventDefault();
      box.querySelectorAll('.drop-above, .drop-below, .lg.drop').forEach(x => x.classList.remove('drop-above', 'drop-below', 'drop'));
      const row = e.target.closest('.ly-row');
      if (row) { const r = row.getBoundingClientRect(); row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below'); }
      else gEl.classList.add('drop');
    });
    gEl.addEventListener('dragleave', e => { if (!gEl.contains(e.relatedTarget)) gEl.classList.remove('drop'); });
    gEl.addEventListener('drop', e => {
      const id = e.dataTransfer.getData('application/x-nj-layer');
      if (!id) return;
      e.preventDefault();
      const row = e.target.closest('.ly-row');
      const L = proj.layers, moving = L.find(x => x.id === id);
      L.splice(L.indexOf(moving), 1);
      moving.group = gEl.dataset.group;
      if (row && row.dataset.id !== id) {
        const target = L.find(x => x.id === row.dataset.id), r = row.getBoundingClientRect();
        const above = e.clientY < r.top + r.height / 2;      // 畫面上方 = 陣列中比較後面（疊在上面）
        L.splice(L.indexOf(target) + (above ? 1 : 0), 0, moving);
      } else L.push(moving);
      pushLayers(); renderSide(); drawLayerOverlay();
    });
  });
}

function wireLayers(body) {
  const q = s => body.querySelector(s);
  if (!q('.layer-groups') && !q('.go-layers')) return;
  renderLayerList(body);
  q('.add-layer')?.addEventListener('click', () => addLayerPicker());
  q('.add-original')?.addEventListener('click', () => {
    const hasSubject = proj.layers.some(l => l.group === 'subject');
    const orig = proj.layers.find(l => l.kind === 'original');
    if (orig) { orig.visible = true; selLayer = orig.id; pushLayers(); renderSide(); drawLayerOverlay(); toast('原圖圖層已顯示並選取，可以在卡上拖曳、滾輪縮放', 'info', 2600); return; }
    proj.layers.splice(hasSubject ? 0 : proj.layers.length, 0, { id: uid('ly'), name: '原圖', group: hasSubject ? 'bg' : 'subject', visible: true, opacity: 1, full: true, blob: proj.imageBlob, kind: 'original', x: .5, y: .5, w: 1, rot: 0 });
    pushLayers(); renderSide();
  });
  q('.go-st')?.addEventListener('click', () => { setTab('parts'); toast('在上方按「開始自動拆層」，完成後圖層會自動出現在「圖層」分頁', 'info', 4000); });
  body.querySelectorAll('.ck').forEach(b => b.onclick = () => {
    const k = b.dataset.ck, t = b.dataset.target;
    if (t === 'layer') {
      const l = proj.layers.find(x => x.id === selLayer); if (!l) return;
      l.craft = k; l.craftAmt ??= 1; pushLayers();
    } else {
      proj.craft[t === 'frame' ? 'frameCraft' : 'imgCraft'] = k; touch(); holo?.set(proj.craft);
    }
    renderSide();
  });
  q('.ck-color')?.addEventListener('input', e => { proj.craft.imgColor = e.target.value; touch(); holo?.set({ imgColor: e.target.value }); });
  body.querySelectorAll('.ly-group button').forEach(b => b.onclick = () => {
    const l = proj.layers.find(x => x.id === selLayer); if (!l) return;
    proj.layers.splice(proj.layers.indexOf(l), 1); l.group = b.dataset.g; proj.layers.push(l);
    pushLayers(); renderSide(); drawLayerOverlay();
  });
  q('.ly-reset')?.addEventListener('click', () => { const l = proj.layers.find(x => x.id === selLayer); Object.assign(l, { x: .5, y: .5, w: 1, rot: 0, flip: false }); delete l.crop; pushLayers(); renderSide(); drawLayerOverlay(); });
  q('.ly-uncrop')?.addEventListener('click', () => { const l = proj.layers.find(x => x.id === selLayer); delete l.crop; pushLayers(); renderSide(); drawLayerOverlay(); });
  q('.ly-del')?.addEventListener('click', () => { proj.layers = proj.layers.filter(x => x.id !== selLayer); selLayer = null; pushLayers(); renderSide(); drawLayerOverlay(); });
  q('.ly-dup')?.addEventListener('click', () => {
    const l = proj.layers.find(x => x.id === selLayer); if (!l) return;
    const c = { ...l, id: uid('ly'), name: l.name + ' 複本', x: (l.x ?? .5) + .04, y: (l.y ?? .5) + .04 };
    proj.layers.splice(proj.layers.indexOf(l) + 1, 0, c); selLayer = c.id; pushLayers(); renderSide(); drawLayerOverlay();
  });
  q('.ly-save')?.addEventListener('click', async e => {
    const l = proj.layers.find(x => x.id === selLayer); if (!l) return;
    const [W, H] = layerCanvasSize();
    const blob = await layerToBlob(l, W, H);
    if (!blob) return toast('這個圖層是空的', 'warn');
    await addCard({ blob, rarity: 'R', name: l.name.slice(0, 20), source: 'part' });
    sparkle(e.clientX, e.clientY);
    toast(`「${l.name}」已存成素材卡（在待收納區，也能在「加入素材」裡選到）`, 'ok', 3600);
  });
  q('.flatten')?.addEventListener('click', flattenToCard);
  q('.clear-layers')?.addEventListener('click', async () => {
    if (!await confirmBox('清空所有圖層？原圖與卡片不會受影響。', { ok: '清空', danger: true })) return;
    proj.layers = []; selLayer = null; pushLayers(); renderSide(); drawLayerOverlay();
  });
}

function layerCanvasSize() {
  const s = Math.min(1, 1400 / Math.max(proj.imgW, proj.imgH));
  return [Math.round(proj.imgW * s), Math.round(proj.imgH * s)];
}

let layerTimer = 0, stageImgTimer = 0;
function pushLayers() {
  touch();
  clearTimeout(layerTimer);
  layerTimer = setTimeout(() => holo?.set({ layers: proj.layers }), 60);
  if (proj.fx.useLayers) { clearTimeout(stageImgTimer); stageImgTimer = setTimeout(refreshStageImage, 300); }
}

/** 把圖層合成成一張圖（LIVE 用；部件遮罩以原圖尺寸對齊） */
async function layerComposite(withTop = proj.fx.layersTop) {
  const [W, H] = layerCanvasSize();
  const L = proj.layers.filter(l => l.visible !== false);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!L.some(l => (l.group === 'bg' || l.group === 'subject') && l.full)) { const im = await loadImage(proj.imageBlob); g.drawImage(im, 0, 0, W, H); URL.revokeObjectURL(im.src); }
  for (const grp of withTop ? ['bg', 'subject', 'outer', 'top'] : ['bg', 'subject', 'outer']) { const part = await compositeGroup(L, grp, W, H); g.drawImage(part, 0, 0); part.width = 0; }
  return c;
}

let stageImgSeq = 0;
async function refreshStageImage() {
  if (!stage || !proj) return;
  const seq = ++stageImgSeq;
  const src = proj.fx.useLayers ? await layerComposite() : proj.imageBlob;
  if (seq !== stageImgSeq || !stage) return;
  const old = stage.image;
  await stage.setImage(src);
  if (old instanceof HTMLCanvasElement && old !== src) old.width = 0;
}

async function flattenToCard(e) {
  const [W, H] = layerCanvasSize();
  const L = proj.layers.filter(l => l.visible !== false);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!L.some(l => l.group === 'bg' && l.full) && !L.some(l => l.group === 'subject' && l.full)) { const im = await loadImage(proj.imageBlob); g.drawImage(im, 0, 0, W, H); URL.revokeObjectURL(im.src); }
  for (const grp of ['bg', 'subject', 'outer', 'top']) g.drawImage(await compositeGroup(L, grp, W, H), 0, 0);
  const card = proj.cardId ? await db.get('cards', proj.cardId) : null;
  await addCard({ blob: await canvasToBlob(c), rarity: card?.rarity || 'R', name: ((card?.name || proj.name || '合成') + ' · 合成').slice(0, 24), source: 'compose' });
  sparkle(e.clientX, e.clientY);
  toast('已合成成新卡片，放在卡冊的待收納區', 'ok', 3200);
}

let decoList = null;
const assetTile = a => `<div class="bg-tile st-pick up-tile" data-src="asset:${a.id}" data-name="${esc(a.name)}" data-ar="${a.width / a.height}" data-alpha="${a.alpha ? 1 : ''}" data-asset-id="${a.id}" title="${esc(a.name)}（${a.width}×${a.height}${a.alpha ? '，透明背景' : ''}）${a.credit ? esc(`\n來源：${a.credit.source}${a.credit.set ? '・' + a.credit.set : ''}\n授權：${a.credit.license || '見來源頁'}${a.credit.author ? '\n作者：' + a.credit.author : ''}`) : ''}">
  <img src="${blobURL('ast:' + a.id, a.thumb)}" alt="" loading="lazy"><span>${esc(a.name)}</span>${a.alpha ? '<em class="up-alpha">透明</em>' : ''}${a.credit ? '<em class="up-cc" title="網路素材，有授權條件">CC</em>' : ''}
  <i class="up-acts"><button class="up-bg" title="整張鋪滿，當背景">當背景</button><button class="up-ren" title="改名">✎</button><button class="up-del" title="刪除這個素材">${ICON.trash}</button></i></div>`;

async function addLayerPicker(preset = null) {
  decoList ??= await fetch('assets/deco/deco.json').then(r => r.json()).catch(() => []);
  const cards = (await db.all('cards')).sort((a, b) => b.createdAt - a.createdAt);
  const assets = cards.filter(c => c.alpha);
  let mine = await allAssets();
  const kinds = [['feather', '羽毛飄帶'], ['badge', '徽章垂飾'], ['divider', '分隔飾'], ['icon', '星芒圖示'], ['frame', '卡框'], ['back', '卡背（當背景）'], ['back-l', '橫式卡背（當背景）'], ['back-s', '方形卡背（當背景）']];
  const tile = (src, name, data) => `<button class="bg-tile st-pick" ${data}><img src="${src}" alt=""><span>${esc(name)}</span></button>`;
  const body = h(`<div class="bg-picker">
    <div class="seg"><button class="on" data-tab="up">我的上傳 <b class="up-count">${mine.length}</b></button><button data-tab="mine">透明素材 / 部件 <b>${assets.length}</b></button>${proj.stParts?.length ? `<button data-tab="st">拆層部件 <b>${proj.stParts.length}</b></button>` : ''}<button data-tab="deco">素材庫裝飾 <b>${decoList.length}</b></button><button data-tab="all">所有卡片 <b>${cards.length}</b></button></div>
    <p class="muted small">點一下素材會變成可以移動、縮放、旋轉的貼圖；「當背景」會整張鋪滿。上傳的圖片只存在這個瀏覽器，不會變成卡片、也不會出現在卡冊。</p>
    <div data-pane="up" class="up-pane">
      <div class="bg-grid small up-grid"><button class="bg-tile up-add">${ICON.upload}<span>上傳圖片（可多選）</span></button>${mine.map(assetTile).join('')}</div>
      <p class="muted small up-hint">也可以把圖片檔直接拖進這個視窗，或拖到工坊畫面上。支援 PNG（透明背景會自動判斷）、JPG、WebP、GIF（取第一格）；單張最大 25 MB。</p>
    </div>
    <div data-pane="mine" class="hidden"><div class="bg-grid small">${assets.map(c => tile(blobURL('thumb:' + c.id, c.thumb), c.name, `data-src="card:${c.id}" data-name="${esc(c.name)}" data-ar="${c.width / c.height}" data-alpha="1"`)).join('') || '<p class="muted pad">還沒有透明素材。可以用素材卡池（V5 透明背景）抽，或在圖層上按「存成素材卡」。</p>'}</div></div>
    ${proj.stParts?.length ? `<div data-pane="st" class="hidden"><div class="bg-grid small">${proj.stParts.map((sp, i) => tile(blobURL('stp:' + i + sp.name, sp.thumbBlob), sp.name, `data-st="${i}" data-name="${esc(sp.name)}"`)).join('')}</div></div>` : ''}
    <div data-pane="deco" class="hidden">${kinds.map(([k, n]) => { const list = decoList.filter(d => d.kind === k); return list.length ? `<h5 class="pick-h">${n}</h5><div class="bg-grid small">${list.map(d => tile(d.file, d.name, `data-src="${d.file}" data-name="${esc(d.name)}" data-ar="${d.w / d.h}" data-kind="${k}"`)).join('')}</div>` : ''; }).join('')}</div>
    <div data-pane="all" class="hidden"><div class="bg-grid small">${cards.map(c => tile(blobURL('thumb:' + c.id, c.thumb), c.name, `data-src="card:${c.id}" data-name="${esc(c.name)}" data-ar="${c.width / c.height}" data-alpha="${c.alpha ? 1 : ''}"`)).join('')}</div></div>
  </div>`);
  const pick = preset || await modal({
    title: '加入圖層', body, wide: true,
    onOpen: (b, close) => {
      const tabs = b.querySelectorAll('.seg button');
      tabs.forEach(x => x.onclick = () => { tabs.forEach(y => y.classList.toggle('on', y === x)); b.querySelectorAll('[data-pane]').forEach(pn => pn.classList.toggle('hidden', pn.dataset.pane !== x.dataset.tab)); });
      const wire = root => root.querySelectorAll('.st-pick').forEach(t => t.onclick = e => {
        if (e.target.closest('.up-acts')) return;
        close({ ...t.dataset });
      });
      wire(b);
      const grid = b.querySelector('.up-grid');
      const wireUp = () => grid.querySelectorAll('.up-tile').forEach(t => {
        const id = t.dataset.assetId;
        t.querySelector('.up-bg').onclick = e => { e.stopPropagation(); close({ ...t.dataset, asBg: '1' }); };
        t.querySelector('.up-ren').onclick = async e => {
          e.stopPropagation();
          const a = mine.find(x => x.id === id), name = prompt('素材名稱', a?.name || '');
          if (!name?.trim()) return;
          await renameAsset(id, name.trim()); a.name = name.trim().slice(0, 30);
          t.querySelector('span').textContent = a.name; t.dataset.name = a.name;
        };
        t.querySelector('.up-del').onclick = async e => {
          e.stopPropagation();
          const u = await assetUsage(id), used = u.lives + u.cards;
          if (!await confirmBox(`刪除素材「${esc(t.dataset.name)}」？${used ? `<br><b>有 ${used} 個作品的圖層用到它</b>，刪除後那些圖層會變成空白。` : ''}`, { ok: '刪除', danger: true })) return;
          await deleteAsset(id); mine = mine.filter(x => x.id !== id); t.remove();
          b.querySelector('.up-count').textContent = mine.length;
        };
      });
      wireUp();
      const upload = async files => {
        if (!files.length) return;
        const { added, skipped } = await addAssets(files);
        if (skipped.length) toast('略過：' + skipped.join('、'), 'warn', 5000);
        if (!added.length) return;
        mine = [...added, ...mine];
        grid.querySelector('.up-add').insertAdjacentHTML('afterend', added.map(assetTile).join(''));
        b.querySelector('.up-count').textContent = mine.length;
        wire(grid); wireUp();
        toast(`已上傳 ${added.length} 張素材，點一下就能加到卡面`, 'ok', 2400);
      };
      grid.querySelector('.up-add').onclick = async () => upload(await pickFiles('image/*', true));
      // 把檔案拖進視窗
      b.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); b.classList.add('file-over'); } });
      b.addEventListener('dragleave', e => { if (!b.contains(e.relatedTarget)) b.classList.remove('file-over'); });
      b.addEventListener('drop', e => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault(); b.classList.remove('file-over');
        b.querySelector('.seg [data-tab="up"]').click();
        upload([...e.dataTransfer.files]);
      });
    },
  });
  if (!pick) return;
  const ar = +pick.ar || 1;
  if (pick.st != null) {
    const sp = proj.stParts[+pick.st];
    const l = { id: uid('ly'), name: sp.name, group: 'subject', visible: true, opacity: 1, full: true, kind: 'part', blob: sp.blob, thumbBlob: sp.thumbBlob, x: .5, y: .5, w: 1, rot: 0, flip: false };
    proj.layers.push(l); selLayer = l.id; pushLayers(); renderSide(); setTimeout(drawLayerOverlay, 300);
    return;
  }
  const asBackground = !!pick.asBg || /^back(-[ls])?$/.test(pick.kind || '') || (pick.src.startsWith('card:') && !pick.alpha);
  const l = asBackground
    ? { id: uid('ly'), name: pick.name, group: 'bg', visible: true, opacity: 1, full: true, src: pick.src, kind: 'bg', x: .5, y: .5, w: 1, rot: 0, flip: false }
    : { id: uid('ly'), name: pick.name, group: pick.kind === 'divider' || pick.kind === 'icon' ? 'top' : 'outer', visible: true, opacity: 1, full: false, src: pick.src, ar, kind: 'asset',
      x: .5, y: pick.kind === 'divider' ? .12 : .5, w: pick.kind === 'icon' ? .18 : pick.kind === 'frame' ? 1 : ar > 1.6 ? .7 : .42, rot: 0, flip: false };
  proj.layers.push(l);
  selLayer = l.id;
  pushLayers(); renderSide();
  setTimeout(drawLayerOverlay, 300);
}

/** 圖層分頁時，在擺正的卡片上畫出可移動素材的外框：拖曳 / 滾輪縮放 / Shift+滾輪旋轉 */
function drawLayerOverlay() {
  const ov = el?.querySelector('.sticker-ov');
  if (!ov || sideTab !== 'layers' || !holo) return;
  const st = el.querySelector('.ws-stage').getBoundingClientRect(), r = holo.cardRect();
  Object.assign(ov.style, { left: r.left - st.left + 'px', top: r.top - st.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  ov.innerHTML = '';
  const syncInputs = s => el.querySelectorAll('[data-bind^="layer."]').forEach(i => { const k = i.dataset.bind.split('.')[1]; if (i.type !== 'checkbox' && typeof s[k] === 'number') i.value = s[k]; });
  for (const s of proj.layers.filter(l => l.visible !== false && (!l.full || l.id === selLayer))) {
    s.x ??= .5; s.y ??= .5; s.w ??= 1; s.rot ??= 0;
    const box = h(`<div class="st-box ${s.id === selLayer ? 'on' : ''} g-${s.group}" data-id="${s.id}"><span>${esc(s.name || '')} · ${GROUPS.find(g => g[0] === s.group)?.[1] || ''}</span>
      ${s.id === selLayer ? `<i class="lh rot" title="拖曳旋轉（Shift 每 15° 對齊）"></i>${['nw', 'ne', 'se', 'sw'].map(k => `<i class="lh sc ${k}" title="拖曳縮放"></i>`).join('')}${['l', 't', 'r', 'b'].map(k => `<i class="lh cr c-${k}" data-k="${k}" title="拖曳裁切"></i>`).join('')}` : ''}</div>`);
    const dims = () => { const sw = s.w * r.width; return { sw, sh: s.full ? s.w * r.height : sw / (s.ar || 1) }; };
    // 外框只框住裁切後留下的部分；旋轉中心仍是整張圖的中心
    const layout = () => {
      const { sw, sh } = dims();
      const c = s.crop || { l: 0, t: 0, r: 0, b: 0 };
      const eL = s.flip ? c.r : c.l, eR = s.flip ? c.l : c.r;
      Object.assign(box.style, { width: sw * (1 - eL - eR) + 'px', height: sh * (1 - c.t - c.b) + 'px',
        left: s.x * r.width - sw / 2 + eL * sw + 'px', top: s.y * r.height - sh / 2 + c.t * sh + 'px',
        transformOrigin: `${sw / 2 - eL * sw}px ${sh / 2 - c.t * sh}px`, transform: `rotate(${s.rot || 0}deg)` });
    };
    layout();
    const local = ev => ({ x: ev.clientX - r.left, y: ev.clientY - r.top });
    const drag = (e, onMove, done) => {
      e.preventDefault(); e.stopPropagation();
      const move = ev => { onMove(ev); layout(); pushLayers(); syncInputs(s); };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); done ? done() : drawLayerOverlay(); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    };
    box.addEventListener('pointerdown', e => {
      const hd = e.target.closest('.lh');
      const cx = s.x * r.width, cy = s.y * r.height;
      if (hd?.classList.contains('rot')) return drag(e, ev => {
        const p = local(ev);
        let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;
        if (ev.shiftKey) a = Math.round(a / 15) * 15;
        s.rot = Math.round(((a + 540) % 360 - 180) * 10) / 10;
      });
      if (hd?.classList.contains('sc')) {
        const p0 = local(e), d0 = Math.hypot(p0.x - cx, p0.y - cy) || 1, w0 = s.w;
        return drag(e, ev => { const p = local(ev); s.w = Math.min(s.full ? 3 : 1.6, Math.max(.03, w0 * Math.hypot(p.x - cx, p.y - cy) / d0)); });
      }
      if (hd?.classList.contains('cr')) {
        const k = hd.dataset.k;
        s.crop = { l: 0, t: 0, r: 0, b: 0, ...s.crop };
        return drag(e, ev => {
          const { sw, sh } = dims(), p = local(ev), a = -(s.rot || 0) * Math.PI / 180;
          const dx = p.x - cx, dy = p.y - cy;
          const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);   // 轉回圖層自己的座標
          const c = s.crop, min = .04;
          const scrL = s.flip ? 'r' : 'l', scrR = s.flip ? 'l' : 'r';                                  // 水平翻轉時畫面左邊 = 圖片右邊
          if (k === 'l') c[scrL] = clamp((lx + sw / 2) / sw, 0, 1 - c[scrR] - min);
          if (k === 'r') c[scrR] = clamp((sw / 2 - lx) / sw, 0, 1 - c[scrL] - min);
          if (k === 't') c.t = clamp((ly + sh / 2) / sh, 0, 1 - c.b - min);
          if (k === 'b') c.b = clamp((sh / 2 - ly) / sh, 0, 1 - c.t - min);
        }, () => { renderSide(); drawLayerOverlay(); });
      }
      if (selLayer !== s.id) { selLayer = s.id; renderSide(); drawLayerOverlay(); return; }
      const sx = e.clientX, sy = e.clientY, ox = s.x, oy = s.y;
      drag(e, ev => { s.x = ox + (ev.clientX - sx) / r.width; s.y = oy + (ev.clientY - sy) / r.height; });
    });
    box.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.shiftKey) s.rot = Math.round(((s.rot || 0) + Math.sign(e.deltaY || e.deltaX) * 5 + 540) % 360 - 180);
      else s.w = Math.min(s.full ? 3 : 1.6, Math.max(.03, s.w * Math.exp(-e.deltaY * .0015)));
      pushLayers(); layout(); syncInputs(s);
    }, { passive: false });
    ov.append(box);
  }
}

// ---------- 閃卡工藝 ----------
async function ensureHolo() {
  if (holo || !proj?.cardId) return;
  const card = await db.get('cards', proj.cardId);
  if (!card || !['craft', 'layers'].includes(sideTab)) return;
  holo = new HoloCard(el.querySelector('.ws-holo'));
  await holo.setCard({ ...card, name: card.name, subtitle: proj.subtitle || card.subtitle }, { ...proj.craft, layers: proj.layers }, craftMask(), proj.depthCanvas || null);
  syncHoloLive();
}

function syncHoloLive() {
  if (!holo) return;
  if (proj.craft.liveSync && sideTab === 'craft') holo.attachLive({ image: proj.imageBlob, parts: proj.parts, fx: proj.fx });
  else holo.detachLive();
}

/** 依目前設定產生主體遮罩（白色 + 透明），沒有就回傳 null */
function craftMask() {
  const c = proj.craft;
  if (c.maskSource === 'seethrough') return proj.stMask;
  if (c.maskSource === 'parts' && proj.parts.length) {
    const m0 = proj.parts[0].mask, m = document.createElement('canvas');
    m.width = m0.width; m.height = m0.height;
    const g = m.getContext('2d');
    proj.parts.filter(p => p.enabled !== false).forEach(p => g.drawImage(p.mask, 0, 0, m.width, m.height));
    return m;
  }
  if (c.maskSource === 'depth' && proj.depthCanvas) {
    const d = proj.depthCanvas, m = document.createElement('canvas');
    m.width = d.width; m.height = d.height;
    const g = m.getContext('2d', { willReadFrequently: true });
    g.drawImage(d, 0, 0);
    const img = g.getImageData(0, 0, m.width, m.height), px = img.data, thr = c.maskThreshold * 255;
    for (let i = 0; i < px.length; i += 4) { const on = px[i] >= thr; px[i] = px[i + 1] = px[i + 2] = 255; px[i + 3] = on ? 255 : 0; }
    g.putImageData(img, 0, 0);
    return m;
  }
  return null;
}

let maskTimer = 0;
function refreshHoloMask(debounce) {
  clearTimeout(maskTimer);
  const run = () => holo?.setMask(craftMask());
  if (debounce) maskTimer = setTimeout(run, 120); else run();
}

async function applyCraft(e) {
  if (!proj?.cardId) { toast('這個作品沒有對應的卡片', 'warn'); return false; }
  const mask = craftMask();
  const { stickers: _s, ...craft } = proj.craft;
  if (craft.liveSync) { const liveId = await saveLive(false); if (liveId) craft.liveId = liveId; }   // 動態閃卡需要對應的 LIVE 作品
  const before = await db.get('cards', proj.cardId);
  const shot = holo ? await holo.capture() : null;
  const depthMap = craft.maskSource === 'depth3d' && proj.depthCanvas ? await canvasToBlob(proj.depthCanvas) : null;
  await updateCard(proj.cardId, { craft: { ...craft, layers: serializeLayers(proj.layers), mask: mask ? await canvasToBlob(mask) : null, depthMap },
    ...(shot && { craftShot: shot, craftShotAt: Date.now(), craftShotKey: shotKey(holo.cardData) }), show: before?.show || 'holo' });
  if (e) sparkle(e.clientX, e.clientY);
  toast(`已套用到卡片：卡冊會顯示${(before?.show || 'holo') === 'holo' ? '閃卡' : '原圖'}（可在卡片詳情切換）`, 'ok', 3200);
  return true;
}

// ---------- See-through 自動拆層 ----------
const ST_GROUPS = [
  ['後髮', 'wave', ['back hair'], { amp: 1.1, phase: 1.3 }],
  ['前髮', 'wave', ['front hair'], { amp: .6 }],
  ['頭部', 'sway', ['face', 'ears', 'earwear', 'nose', 'mouth', 'eyebrow', 'eyelash', 'irides', 'eyewhite', 'eyewear', 'headwear', 'front hair'], { amp: .55 }],
  ['眼睛', 'blink', ['eyewhite', 'irides', 'eyelash'], {}],
  ['身體', 'breath', ['topwear', 'neck', 'neckwear', 'handwear'], { amp: .8 }],
  ['裙擺', 'wave', ['bottomwear'], { amp: .5, phase: 2 }],
  ['翅膀尾巴', 'wave', ['wings', 'tail'], { amp: 1 }],
  ['飾品', 'float', ['objects'], { amp: .6 }],
];

async function runSeeThrough() {
  if (!proj) return;
  try {
    progress('上傳圖片給 See-through…', 0);
    const image = await imageToPngBase64(proj.imageBlob, 0, 0);
    const res = await fetch('/api/seethrough/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, resolution: stRes }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'See-through 啟動失敗');
    stJob = data.id; renderSide();
    const est = { 768: 150, 1024: 230, 1280: 360 }[stRes] || 230;
    for (;;) {
      await new Promise(r => setTimeout(r, 2000));
      const j = await (await fetch('/api/seethrough/job?id=' + stJob)).json();
      const last = (j.log || []).filter(l => !/^\s*$/.test(l)).at(-1) || '';
      progress(`See-through 拆層中 ${j.elapsed}s · ${last.slice(0, 60)}`, Math.min(.97, j.elapsed / est));
      if (j.status === 'done') { await applySeeThrough(stJob, j.result); break; }
      if (j.status === 'error') throw new Error(j.error || 'See-through 失敗');
      if (!el?.isConnected) return;
    }
  } catch (err) {
    toast('自動拆層失敗：' + err.message, 'error', 8000);
  } finally {
    stJob = null; progress(); if (el?.isConnected && sideTab === 'parts') renderSide();
  }
}

async function applySeeThrough(id, result) {
  const load = name => loadImage(`/api/seethrough/file?id=${id}&name=${encodeURIComponent(name)}`);
  const layers = await Promise.all(result.layers.map(async L => ({ ...L, img: await load(L.file) })));
  const replaceParts = !proj.parts.length || await confirmBox(`See-through 拆出 ${layers.length} 個圖層。也要用它們重新做 LIVE 部件、取代目前的 ${proj.parts.length} 個部件嗎？（圖層一定會加入「圖層」分頁）`, { ok: '取代部件' });
  const s = 512 / Math.max(proj.imgW, proj.imgH);
  const mw = Math.round(proj.imgW * s), mh = Math.round(proj.imgH * s);
  const toMask = (imgs, w, h) => {
    const m = document.createElement('canvas'); m.width = w; m.height = h;
    const g = m.getContext('2d');
    imgs.forEach(im => g.drawImage(im, 0, 0, w, h));
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    return m;
  };
  const parts = [];
  for (const [name, type, tags, extra] of ST_GROUPS) {
    const imgs = layers.filter(L => tags.includes(L.tag)).map(L => L.img);
    if (!imgs.length) continue;
    const mask = toMask(imgs, mw, mh);
    if (!maskBounds(mask)) continue;
    const used = new Set(parts.map(p => p.color));
    parts.push({ id: uid('p'), name, type, color: COLORS.find(c => !used.has(c)) || COLORS[0], mask, pivot: null, phase: Math.random() * 3, enabled: true, ...TYPE_DEFAULTS[type], feather: type === 'blink' ? 2 : 8, ...extra });
  }
  if (replaceParts) { proj.parts = parts.slice(0, MAX_PARTS); sel = proj.parts[0]?.id || null; }
  proj.stMask = toMask(layers.map(L => L.img), Math.round(proj.imgW * 768 / Math.max(proj.imgW, proj.imgH)), Math.round(proj.imgH * 768 / Math.max(proj.imgW, proj.imgH)));
  const depthImg = await load('depth.png');
  const dc = document.createElement('canvas'); dc.width = depthImg.naturalWidth; dc.height = depthImg.naturalHeight;
  dc.getContext('2d').drawImage(depthImg, 0, 0);
  proj.rawDepth = dc; proj.depthOpts = { ...DEFAULT_DEPTH, blur: 2 };
  proj.depthCanvas = processDepth(dc, proj.depthOpts, proj.guide);
  stage?.setDepth(proj.depthCanvas);
  if (proj.craft.maskSource === 'depth') proj.craft.maskSource = 'seethrough';
  // 拆出的部位先保存在專案裡，只在「圖層 → 加入素材 → 拆層部件」被選到時才會變成圖層
  proj.stParts = [];
  const [W, H] = layerCanvasSize();
  for (const L of [...layers].sort((a, b) => b.depth - a.depth)) {
    const blob = await fetch(`/api/seethrough/file?id=${id}&name=${encodeURIComponent(L.file)}`).then(r => r.blob());
    proj.stParts.push({ name: ST_NAMES[L.tag] || L.tag, blob, thumbBlob: await layerToBlob({ full: true, blob }, 240, Math.round(240 * H / W)) });
  }
  touch(); pushParts(); drawOverlay();
  toast(`拆層完成：${layers.length} 個部位 → ${proj.parts.length} 個 LIVE 部件，並換上分層深度。需要的話，可以在「圖層 → 加入素材 → 拆層部件」單獨加入某個部位`, 'ok', 7000);
}
