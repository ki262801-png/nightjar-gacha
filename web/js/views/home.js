// 首頁：輪播自己抽到的卡或 LIVE 動態作品，按鈕切換下一張
import { h, esc, modal, toast, blobURL, pickFiles, ICON } from '../util.js';
import { db } from '../db.js';
import { state, save, allCards, addCard, on } from '../store.js';
import { LiveStage, hydrateLive, blobToCanvas } from '../live.js';
import { HoloCard } from '../holo.js';
import { processDepth } from '../depth.js';
import { seal, rarityBadge, ornament, rarityVisible } from '../cards.js';
import { modelInfo } from '../nai.js';
import { splitText, decrypt, countUp } from '../textfx.js';

let el, stage = null, typer = 0, autoTimer = 0, off = [], seq = 0;

const PLATE_STYLES = [['classic', '經典'], ['minimal', '簡約'], ['card', '卡片'], ['vertical', '直書'], ['magazine', '雜誌'], ['ribbon', '緞帶'], ['neon', '霓光'], ['frame', '金框'], ['hidden', '隱藏']];
/** 名牌的裝飾零件：四角花飾、印章、期數標籤（各種樣式自己決定要不要顯示） */
export const PLATE_DECOR = '<i class="pl-corner c1"></i><i class="pl-corner c2"></i><i class="pl-corner c3"></i><i class="pl-corner c4"></i><span class="pl-seal"></span><span class="pl-vol"></span>';
const SEAL_CHAR = { SSR: '極', SR: '稀', R: '常' };
export { PLATE_STYLES };
/** 手機版和電腦版的名牌樣式分開存；手機預設不顯示名牌（畫面小，會擋到圖） */
export const plateStyleKey = () => document.documentElement.dataset.layout === 'mobile' ? 'plateStyleMobile' : 'plateStyle';
export const plateStyleNow = () => state.settings[plateStyleKey()] || (plateStyleKey() === 'plateStyleMobile' ? 'hidden' : 'classic');

export async function mount(root) {
  el = h(`<section class="view home v3">
    <div class="home-stage"></div>
    <div class="home-empty hidden">
      <img class="empty-badge deco" src="assets/deco/badge-b03.webp" alt="">
      <p>首頁背景還空著</p>
      <small>抽一張卡，或到工坊做一個 LIVE 動態，再回來設為背景</small>
    </div>
    <div class="home-shade"></div>
    <div class="home-frame"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i></div>
    <header class="home-top ui">
      <div class="home-mark"><b>Confidential.</b><span>For insiders only</span></div>
      <div class="home-tools">
        <div class="home-chips"></div>
        <button class="icon-btn glass fit-btn" title="切換：填滿畫面 / 完整顯示">${ICON.image}</button>
        <button class="icon-btn glass bg-btn home-bg-btn" title="選擇首頁背景（可多張輪播）">${ICON.layers}</button>
        <button class="icon-btn glass plate-btn" title="文字底襯：自動 / 深底白字 / 淺底黑字 / 無">Aa</button>
        <button class="icon-btn glass plate-style-btn" title="名牌樣式：經典 / 簡約 / 卡片 / 直書 / 雜誌 / 緞帶 / 霓光 / 金框 / 隱藏（設定 → 首頁 可以預覽）">✎</button>
        <button class="icon-btn glass zen-btn" title="沉浸模式：隱藏介面（再按一次或按 H 顯示）">${ICON.sparkles}</button>
        <a class="icon-btn glass guide-btn" href="guide.html" target="_blank" rel="noopener" title="玩法介紹（另開分頁）">?</a>
      </div>
    </header>
    <div class="home-quote ui">
      ${ornament('quote-deco')}
      <p class="quote-text"></p>
    </div>
    <div class="home-plate ui">${PLATE_DECOR}
      <img class="deco plate-feather" src="assets/deco/feather-f10.webp" alt="">
      <div class="plate-name"></div>
      ${ornament('plate-divider')}
      <div class="plate-en"></div>
      <div class="plate-meta"></div>
      <div class="plate-script"></div>
    </div>
    <div class="home-slider ui">
      <button class="icon-btn ghost slide-prev" aria-label="上一張">${ICON.left}</button>
      <div class="slide-track" title="點一下跳到那個位置"><i class="st-seg"></i></div>
      <button class="icon-btn ghost slide-next" aria-label="下一張">${ICON.right}</button>
      <button class="icon-btn ghost slide-all" title="看全部縮圖，直接跳到某一張"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg></button>
      <div class="slide-thumbs hidden"></div>
    </div>
    <nav class="home-dock ui">
      <a class="dock-btn primary" href="#gacha" data-tip="召喚 · SUMMON">${ICON.gacha}<span class="dock-label">召喚<small>SUMMON</small></span></a>
      <a class="dock-btn" href="#album" data-tip="卡冊 · COLLECTION">${ICON.album}<span class="dock-label">卡冊<small>COLLECTION</small></span></a>
      <a class="dock-btn" href="#workshop" data-tip="工坊 · ATELIER">${ICON.workshop}<span class="dock-label">工坊<small>ATELIER</small></span></a>
    </nav>
    <div class="home-hint">移動滑鼠或按 H 顯示介面</div>
  </section>`);
  root.append(el);
  wireHomeFx();
  el.querySelector('.home-bg-btn').onclick = () => pickBackground().then(changed => changed && render());
  const PLATES = [['auto', '自動（依配色）'], ['dark', '深底白字'], ['light', '淺底黑字'], ['none', '無底襯']];
  const applyPlate = () => {
    const v = state.settings.homePlate || 'auto';
    el.dataset.plate = v === 'auto' ? (state.settings.theme === 'night' ? 'dark' : 'light') : v;
  };
  applyPlate();
  off.push(on('theme', applyPlate));
  const applyPlateStyle = () => { el.dataset.plateStyle = plateStyleNow(); el.style.setProperty('--plate-scale', state.settings.plateScale || 1.15); };
  applyPlateStyle();
  addEventListener('layout:change', applyPlateStyle); off.push(() => removeEventListener('layout:change', applyPlateStyle));
  el.querySelector('.plate-style-btn').onclick = () => {
    const i = PLATE_STYLES.findIndex(p => p[0] === plateStyleNow());
    const next = PLATE_STYLES[(i + 1) % PLATE_STYLES.length];
    state.settings[plateStyleKey()] = next[0]; save('settings'); applyPlateStyle();
    toast('名牌樣式：' + next[1], 'info', 1400);
  };
  el.querySelector('.plate-btn').onclick = () => {
    const i = PLATES.findIndex(p => p[0] === (state.settings.homePlate || 'auto'));
    state.settings.homePlate = PLATES[(i + 1) % PLATES.length][0]; save('settings'); applyPlate();
    toast('文字底襯：' + PLATES[(i + 1) % PLATES.length][1], 'info', 1400);
  };
  el.querySelector('.fit-btn').onclick = () => {
    const list = slides(), cur = list[state.settings.homeIndex || 0];
    const now = (cur?.fit || state.settings.homeFit || 'cover') === 'cover' ? 'contain' : 'cover';
    if (cur) cur.fit = now; else state.settings.homeFit = now;
    save('settings'); render();
    toast(now === 'cover' ? '填滿畫面' : '完整顯示（不裁切）', 'info', 1400);
  };
  // 介面自動淡出：一段時間沒動作就只留圖片
  let idleTimer = 0;
  const wake = () => {
    el.classList.remove('idle');
    clearTimeout(idleTimer);
    if (state.settings.homeUiAutoHide !== false && !el.classList.contains('zen')) idleTimer = setTimeout(() => el.classList.add('idle'), 4000);
  };
  const setZen = on => { el.classList.toggle('zen', on); if (!on) wake(); };
  el.querySelector('.zen-btn').onclick = e => { e.stopPropagation(); setZen(true); };
  el.addEventListener('click', e => { if (el.classList.contains('zen') && !e.target.closest('a,button')) setZen(false); });
  addEventListener('pointermove', wake); off.push(() => { removeEventListener('pointermove', wake); clearTimeout(idleTimer); });
  const onH = e => { if (e.key === 'h' || e.key === 'H') { if (e.target.closest('input,textarea')) return; setZen(!el.classList.contains('zen')); } };
  addEventListener('keydown', onH); off.push(() => removeEventListener('keydown', onH));
  wake();
  el.querySelector('.slide-prev').onclick = () => step(-1);
  el.querySelector('.slide-next').onclick = () => step(1);
  const onKey = e => { if (e.target.closest('input,textarea') || document.querySelector('.modal-wrap')) return; if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
  addEventListener('keydown', onKey); off.push(() => removeEventListener('keydown', onKey));
  off.push(on('cards', () => renderChips()));
  await render();
}

/** 首頁和圖片互動：拖曳擦玻璃、點擊水波 / 星火 / 戳一下、游標光點拖尾 */
function wireHomeFx() {
  let down = null, moved = false, lastTrail = 0, hinted = false;
  const live = () => (stage instanceof LiveStage ? stage : null);
  const uvOf = (s, x, y) => { const r = s.canvas.getBoundingClientRect(); return [(x - r.left) / r.width, (y - r.top) / r.height]; };
  const blocked = e => e.target.closest('.ui, button, a, input, select, textarea, .modal-wrap, .home-holo, .slide-thumbs');
  const opt = () => ({ wipe: true, ripple: true, sparks: true, poke: true, trail: true, ...state.settings.homeFx });
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || blocked(e)) return;
    down = { x: e.clientX, y: e.clientY }; moved = false;
  });
  el.addEventListener('pointermove', e => {
    const s = live(); if (!s) return;
    const o = opt(), now = performance.now();
    if (down) {
      if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) moved = true;
      if (moved && o.wipe && (s.fx.rainFog > 0 || s.fx.rain > 0)) {
        const [u0, v0] = uvOf(s, down.x, down.y), [u1, v1] = uvOf(s, e.clientX, e.clientY);
        const n = Math.max(1, Math.ceil(Math.hypot(e.clientX - down.x, e.clientY - down.y) / 12));
        for (let k = 1; k <= n; k++) s.wipeAt(u0 + (u1 - u0) * k / n, v0 + (v1 - v0) * k / n);
        down.x = e.clientX; down.y = e.clientY;
      }
    }
    if (o.trail && !blocked(e) && now - lastTrail > 28) { lastTrail = now; s.trailAt(...uvOf(s, e.clientX, e.clientY)); }
  });
  const onUp = e => {
    if (!down || !el?.isConnected) return;
    const wasMoved = moved; down = null;
    const s = live(); if (!s || wasMoved || blocked(e)) return;
    const o = opt(), [u, v] = uvOf(s, e.clientX, e.clientY);
    if (o.ripple) s.ripple(u, v);
    if (o.sparks) s.sparkBurst(u, v);
    if (o.poke) s.poke();
    if (!hinted && o.wipe && (s.fx.rainFog > 0 || s.fx.rain > 0)) { hinted = true; toast('按住拖曳可以擦玻璃', 'info', 2200); }
  };
  addEventListener('pointerup', onUp); off.push(() => removeEventListener('pointerup', onUp));
}

export function unmount() {
  stage?.destroy(); stage = null;
  clearInterval(typer); clearInterval(autoTimer);
  off.forEach(f => f()); off = [];
}

const slides = () => state.settings.homeSlides || [];

function step(d) {
  const n = slides().length;
  if (n < 2) { if (!n) pickBackground().then(c => c && render()); return; }
  state.settings.homeIndex = (state.settings.homeIndex + d + n) % n; save('settings');
  render(d);
}

async function renderChips() {
  const cards = await allCards();
  el.querySelector('.home-chips').innerHTML = `<span class="chip">${ICON.album}<b>${cards.length}</b> 張卡</span>`;
  el.querySelectorAll('.home-chips b').forEach(b => countUp(b, +b.textContent, { duration: 800 }));
}

async function resolveSlide(s) {
  if (!s) return {};
  if (s.type === 'live') {
    const live = await db.get('lives', s.id);
    const card = live?.cardId ? await db.get('cards', live.cardId) : null;
    return live ? { live, card } : {};
  }
  const card = await db.get('cards', s.id);
  if (s.type === 'holo') return card?.craft ? { card, holo: true } : {};
  return card ? { card } : {};
}

/** 首頁的閃卡展示：模糊的卡面當背景，閃卡立在中間偏右；滑鼠在整個畫面移動都會反光 */
async function mountHolo(layer, card) {
  layer.classList.add('holo-show');
  layer.append(h(`<img class="home-holo-bg" src="${blobURL('full:' + card.id, card.blob)}" alt="">`));
  const box = h('<div class="home-holo"></div>'); layer.append(box);
  const holo = new HoloCard(box);
  const mask = card.craft.mask ? await blobToCanvas(card.craft.mask) : null;
  const depth = card.craft.depthMap ? await blobToCanvas(card.craft.depthMap) : null;
  await holo.setCard(card, card.craft, mask, depth);
  if (card.craft.liveSync && card.craft.liveId) {
    const live = await db.get('lives', card.craft.liveId);
    if (live) { const { parts } = await hydrateLive(live); holo.attachLive({ parts, fx: live.fx || {} }); }
  }
  addEventListener('pointermove', holo.onMove);
  const destroy = holo.destroy.bind(holo);
  holo.destroy = () => { removeEventListener('pointermove', holo.onMove); destroy(); };
  return holo;
}

async function render(dir = 0) {
  const my = ++seq;
  renderChips();
  clearInterval(autoTimer);
  let list = slides();
  // 清掉已刪除的項目
  const resolved = [];
  for (const s of list) { const r = await resolveSlide(s); if (r.card || r.live) resolved.push({ s, ...r }); }
  if (resolved.length !== list.length) { state.settings.homeSlides = resolved.map(r => r.s); save('settings'); }
  if (my !== seq) return;
  let idx = Math.min(state.settings.homeIndex || 0, Math.max(0, resolved.length - 1));
  let cur = resolved[idx];
  if (!cur) {
    const cards = await allCards();
    const card = cards.find(c => c.rarity === 'SSR') || cards[0] || null;
    cur = card ? { s: { type: 'card', id: card.id }, card, auto: true } : null;
  }
  const { card, live, holo } = cur || {};
  el.querySelector('.home-empty').classList.toggle('hidden', !!cur);
  el.classList.toggle('is-empty', !cur);
  el.querySelector('.home-slider').classList.toggle('hidden', resolved.length < 2);
  // 位置指示：一條細軌道，亮起來的那一段就是目前這張（不用數字和圓點）
  const n = resolved.length, track = el.querySelector('.slide-track'), seg = track.querySelector('.st-seg');
  const segW = Math.max(12, 100 / Math.max(1, n));
  seg.style.width = segW + '%';
  seg.style.left = (n > 1 ? idx / (n - 1) * (100 - segW) : 0) + '%';
  seg.classList.toggle('is-live', !!(cur?.live || cur?.holo));
  track.onclick = e => {
    const r = track.getBoundingClientRect(), i = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (n - 1));
    if (i !== idx) { state.settings.homeIndex = i; save('settings'); render(); }
  };
  const countBtn = el.querySelector('.slide-all'), thumbs = el.querySelector('.slide-thumbs');
  thumbs.classList.add('hidden');
  countBtn.onclick = () => {
    if (!thumbs.classList.toggle('hidden')) {
      thumbs.innerHTML = resolved.map((r, i) => {
        const src = r.holo && r.card.craftShot ? blobURL('cs:' + r.card.id + ':' + (r.card.craftShotAt || 0), r.card.craftShot)
          : r.live ? blobURL('live:' + r.live.id, r.live.thumb) : blobURL('thumb:' + r.card.id, r.card.thumb || r.card.blob);
        return `<button class="${i === idx ? 'on' : ''}" data-i="${i}" title="${esc(r.card?.name || r.live?.name || '')}"><img src="${src}" alt=""><b>${i + 1}</b>${r.live ? '<em>LIVE</em>' : r.holo ? '<em>✦</em>' : ''}</button>`;
      }).join('');
      thumbs.querySelectorAll('button').forEach(t => t.onclick = () => { state.settings.homeIndex = +t.dataset.i; save('settings'); render(); });
      thumbs.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  };

  // 新背景淡入，舊的淡出後銷毀
  const holder = el.querySelector('.home-stage');
  const layer = h(`<div class="home-layer ${dir ? 'enter' : ''}" style="--dir:${dir}"></div>`);
  const old = stage, oldLayers = [...holder.children];
  holder.append(layer);
  if (cur) {
    try {
      if (holo) { stage = await mountHolo(layer, card); throw 'done'; }
      const fit = cur.s.fit || state.settings.homeFit || 'cover';
      const imgBlob = live ? (live.fx?.useLayers && live.composite) || live.image : card.blob;   // LIVE 可套用圖層合成
      if (fit === 'contain') layer.append(h(`<img class="home-backdrop" src="${blobURL('hb:' + (live?.id || card.id), imgBlob)}" alt="">`));
      const box = h('<div class="home-gl"></div>'); layer.append(box);
      stage = new LiveStage(box, { fit, pointer: 'window' });
      await stage.setImage(imgBlob);
      if (live) {
        const { rawDepth, parts } = await hydrateLive(live);
        if (rawDepth) stage.setDepth(processDepth(rawDepth, live.depthOpts, live.depthOpts?.edge > 0 ? await blobToCanvas(live.image).catch(() => null) : null));
        stage.setParts(parts);
        stage.set({ ...live.fx, vignette: Math.max(live.fx.vignette || 0, .15) });
      } else {
        stage.set({ parallax: .012, motion: 'mouse', motionSpeed: .4, breathe: .3, vignette: .12, particles: state.settings.theme === 'night' ? 'dust' : 'sparkle', particleCount: 24 });
      }
    } catch (e) { if (e !== 'done') toast('背景載入失敗：' + e.message, 'error'); }
  } else stage = null;
  if (my !== seq) { stage?.destroy(); layer.remove(); return; }
  requestAnimationFrame(() => layer.classList.remove('enter'));
  oldLayers.forEach(l => l.classList.add('leave'));
  setTimeout(() => { old?.destroy(); oldLayers.forEach(l => l.remove()); }, 650);

  const name = card?.name || live?.name || '夜航卡舍';
  const en = (live?.subtitle || card?.subtitle || (card ? `No.${String(card.serial).padStart(4, '0')}` : 'NIGHTJAR ARCANA')).toUpperCase();
  el.querySelector('.plate-name').innerHTML = `${card && rarityVisible(card) ? `<span class="pn-rar r-${card.rarity}">${rarityBadge(card.rarity, 'aura')}</span>` : ''}<span class="pn-zh">${esc(live?.name && !card ? live.name : name)}</span>`;
  el.querySelector('.plate-en').textContent = `NAME - ${en}`;
  el.querySelector('.pl-seal').textContent = card ? SEAL_CHAR[card.rarity] || '夜' : '夜';
  el.querySelector('.pl-vol').textContent = card ? `No.${String(card.serial || 0).padStart(4, '0')}` : 'NIGHTJAR';
  splitText(el.querySelector('.pn-zh'), undefined, { mode: 'blur', stagger: 70, delay: 120 });
  decrypt(el.querySelector('.plate-en'), `NAME - ${en}`, { duration: 1100 });
  el.querySelector('.plate-meta').innerHTML = `${card?.model ? esc(modelInfo(card.model).name.toUpperCase()) + ' · ' : ''}${holo ? 'HOLO EDITION' : live ? 'LIVE EDITION' : 'STILL EDITION'}${resolved.length > 1 ? ` · ${idx + 1} / ${resolved.length}` : ''}`;
  const date = new Date(card?.createdAt || live?.createdAt || Date.now());
  const banner = state.banners.find(b => b.id === card?.bannerId);
  el.querySelector('.plate-script').innerHTML = [
    banner ? `Banner of ${esc(banner.subtitle || banner.name)}` : 'Chain of Night Voyage',
    `Sealed on ${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`,
    live ? 'Breathing Arcana' : 'Silent Arcana',
  ].slice(0, 2).map(t => `<span>${t}</span>`).join(' · ');
  typeQuote(live?.quote || card?.quote || (cur ? '……今晚的星光，也是為你而亮的。' : '把第一張卡，放進這片夜色裡吧。'));
  if (state.settings.homeAuto > 0 && resolved.length > 1) autoTimer = setInterval(() => step(1), state.settings.homeAuto * 1000);
}

function typeQuote(text) {
  const p = el.querySelector('.quote-text');
  clearInterval(typer);
  let i = 0;
  p.textContent = '';
  p.classList.add('typing');
  typer = setInterval(() => {
    p.textContent = text.slice(0, ++i);
    if (i >= text.length) { clearInterval(typer); p.classList.remove('typing'); }
  }, 70);
}

/** 首頁背景：可多選（依點選順序輪播）、LIVE 或卡片、填滿或完整顯示 */
async function pickBackground() {
  const cards = await allCards();
  const lives = (await db.all('lives')).sort((a, b) => b.createdAt - a.createdAt);
  const picked = [...slides()];
  const crafted = cards.filter(c => c.craft);
  const key = (t, id) => t + ':' + id;
  const tile = (type, id, src, label, sub) => `<button class="bg-tile" data-type="${type}" data-id="${id}">
      <img src="${src}" alt=""><span>${esc(label)}</span>${sub ? `<em>${sub}</em>` : ''}<b class="pick-no"></b></button>`;
  const body = h(`<div class="bg-picker">
    <div class="row wrap between">
      <div class="seg"><button class="on" data-tab="live">LIVE 動態 <b>${lives.length}</b></button><button data-tab="holo">閃卡 <b>${crafted.length}</b></button><button data-tab="card">卡片 <b>${cards.length}</b></button></div>
      <div class="row wrap">
        <div class="seg small fit-seg"><button data-fit="cover">填滿畫面</button><button data-fit="contain">完整顯示</button></div>
        <label class="fld inline-sel"><span>自動輪播</span><select class="field auto-sel">${[[0, '關'], [8, '8 秒'], [15, '15 秒'], [30, '30 秒'], [60, '1 分鐘']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      </div>
    </div>
    <div class="bounce-cards"><p class="bc-empty muted small">還沒選擇 — 點下面的項目加入輪播</p></div>
    <p class="muted small">點選要放進首頁的項目（可多選，數字是輪播順序）。首頁用左右按鈕或鍵盤 ← → 切換。</p>
    <div class="bg-grid" data-pane="live">${lives.map(l => tile('live', l.id, blobURL('live:' + l.id, l.thumb), l.name, 'LIVE')).join('') || '<p class="muted pad">還沒有動態作品。到「工坊」把卡片做成 LIVE 動態後就會出現在這裡。</p>'}</div>
    <div class="bg-grid hidden" data-pane="holo">${crafted.map(c => tile('holo', c.id, c.craftShot ? blobURL('cs:' + c.id + ':' + (c.craftShotAt || 0), c.craftShot) : blobURL('thumb:' + c.id, c.thumb), c.name, '✦ 閃卡')).join('') || '<p class="muted pad">還沒有閃卡。到「工坊 → 閃卡工藝」做好後按「套用到卡片」或「放到首頁展示」。</p>'}</div>
    <div class="bg-grid hidden" data-pane="card">
      <button class="bg-tile upload">${ICON.upload}<span>上傳圖片</span></button>
      ${cards.map(c => tile('card', c.id, blobURL('thumb:' + c.id, c.thumb), c.name, (c.liveId ? 'LIVE · ' : '') + c.rarity)).join('')}</div>
  </div>`);
  let fit = state.settings.homeFit || 'cover';
  return modal({
    title: '首頁背景', body, wide: true,
    actions: [{ label: '清空', kind: 'ghost danger', value: () => { picked.length = 0; return 'apply'; } }, { label: '取消', kind: 'ghost', value: null }, { label: '套用', kind: 'primary', value: 'apply' }],
    onOpen: b => {
      const tabs = b.querySelectorAll('.seg [data-tab]');
      const show = t => { tabs.forEach(x => x.classList.toggle('on', x.dataset.tab === t)); b.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== t)); };
      tabs.forEach(x => x.onclick = () => show(x.dataset.tab));
      if (!lives.length) show('card');
      const fan = b.querySelector('.bounce-cards');
      let shown = [];
      const renderFan = () => {
        const keys = picked.map(p => key(p.type, p.id)).slice(0, 7);
        fan.querySelector('.bc-empty').classList.toggle('hidden', keys.length > 0);
        fan.querySelectorAll('.bc-card').forEach(c => { if (!keys.includes(c.dataset.k)) { c.animate([{ opacity: 1 }, { opacity: 0, transform: c.style.transform + ' scale(.4)' }], { duration: 220, fill: 'forwards' }).finished.then(() => c.remove()); } });
        const n = keys.length, step = Math.min(78, 360 / Math.max(1, n));
        keys.forEach((k, i) => {
          let c = fan.querySelector(`.bc-card[data-k="${CSS.escape(k)}"]`);
          const isNew = !c;
          if (isNew) {
            const tile = b.querySelector(`.bg-tile[data-type="${k.split(':')[0]}"][data-id="${k.split(':').slice(1).join(':')}"] img`);
            c = h(`<div class="bc-card" data-k="${k}"><img src="${tile?.src || ''}" alt=""><b>${i + 1}</b></div>`);
            fan.append(c);
          }
          const x = (i - (n - 1) / 2) * step, rot = [5, 0, -5, 5, -5, 4, -4][i % 7];
          c.dataset.x = x; c.dataset.rot = rot; c.style.zIndex = i + 1;
          c.style.transform = `translateX(${x}px) rotate(${rot}deg)`;
          c.querySelector('b').textContent = i + 1;
          if (isNew) c.animate([{ transform: `translateX(${x}px) rotate(${rot}deg) scale(0)` }, { transform: `translateX(${x}px) rotate(${rot}deg) scale(1)` }],
            { duration: 900, easing: 'linear(0, .33 5%, .86 11%, 1.12 16%, 1.2 19.5%, 1.16 23%, 1.02 30%, .95 35.5%, .94 39%, .98 47%, 1.01 55%, 1.005 66%, 1)', delay: shown.length ? 0 : i * 150, fill: 'backwards' });
        });
        shown = keys;
      };
      // hover：被指到的卡擺正放大，左右兩邊的卡被推開
      fan.addEventListener('pointerover', e => {
        const hov = e.target.closest('.bc-card'); if (!hov) return;
        const cardsEls = [...fan.querySelectorAll('.bc-card')], hi = cardsEls.indexOf(hov);
        cardsEls.forEach((c, i) => {
          const x = +c.dataset.x, rot = +c.dataset.rot;
          c.style.transform = i === hi ? `translateX(${x}px) translateY(-10px) rotate(0deg) scale(1.12)` : `translateX(${x + (i < hi ? -46 : 46)}px) rotate(${rot}deg)`;
          c.style.zIndex = i === hi ? 50 : i + 1;
        });
      });
      fan.addEventListener('pointerleave', () => fan.querySelectorAll('.bc-card').forEach((c, i) => { c.style.transform = `translateX(${c.dataset.x}px) rotate(${c.dataset.rot}deg)`; c.style.zIndex = i + 1; }));
      const sync = () => (renderFan(), b.querySelectorAll('.bg-tile[data-id]')).forEach(t => {
        const i = picked.findIndex(p => key(p.type, p.id) === key(t.dataset.type, t.dataset.id));
        t.classList.toggle('on', i >= 0);
        t.querySelector('.pick-no').textContent = i >= 0 ? i + 1 : '';
      });
      sync();
      b.querySelectorAll('.bg-tile[data-id]').forEach(t => t.onclick = () => {
        const i = picked.findIndex(p => key(p.type, p.id) === key(t.dataset.type, t.dataset.id));
        if (i >= 0) picked.splice(i, 1); else picked.push({ type: t.dataset.type, id: t.dataset.id });
        sync();
      });
      const fitBtns = b.querySelectorAll('.fit-seg button');
      fitBtns.forEach(x => { x.classList.toggle('on', x.dataset.fit === fit); x.onclick = () => { fit = x.dataset.fit; fitBtns.forEach(y => y.classList.toggle('on', y === x)); }; });
      const autoSel = b.querySelector('.auto-sel'); autoSel.value = state.settings.homeAuto || 0;
      b.querySelector('.upload').onclick = async () => {
        const files = await pickFiles('image/*', true);
        for (const file of files) {
          const card = await addCard({ blob: file, rarity: 'R', name: file.name.replace(/\.\w+$/, '').slice(0, 24), source: 'upload' });
          picked.push({ type: 'card', id: card.id });
        }
        if (files.length) toast(`已加入 ${files.length} 張卡片，按「套用」生效`, 'ok');
      };
    },
  }).then(v => {
    if (v !== 'apply') return false;
    state.settings.homeSlides = picked.map(p => ({ type: p.type, id: p.id }));
    state.settings.homeIndex = 0;
    state.settings.homeFit = fit;
    state.settings.homeAuto = +body.querySelector('.auto-sel').value;
    save('settings');
    return true;
  });
}
