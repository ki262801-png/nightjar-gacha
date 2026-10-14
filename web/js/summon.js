// 召喚演出：每生一張圖 = 抽出一張卡
import { h, esc, sleep, sparkle, toast, reducedMotion, ICON } from './util.js';
import { state, save, rollRarity, addCard, updateCard, nameMode } from './store.js';
import { buildPayload, generate, demoImage, hasToken, effectiveParams } from './nai.js';
import { composePrompt } from './promptlib.js';
import { cardEl, cardBack, rarityVisible } from './cards.js';
import { rarityColor } from './theme.js';
import { bannerKind, assetLabel, randomName } from './names.js';
import { SummonFX } from './summonfx.js';

const RCOLOR = new Proxy({}, { get: (_, r) => rarityColor(r) || '#c9d6f0' });

function sigil() {
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  const ring = (r, n, cls) => `<g class="${cls}">${Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2;
    return `<text x="${200 + Math.cos(a) * r}" y="${200 + Math.sin(a) * r}" transform="rotate(${a * 180 / Math.PI + 90} ${200 + Math.cos(a) * r} ${200 + Math.sin(a) * r})">${runes[i % runes.length]}</text>`;
  }).join('')}</g>`;
  return `<svg class="sigil" viewBox="0 0 400 400" aria-hidden="true">
    <circle cx="200" cy="200" r="190" class="s-line"/><circle cx="200" cy="200" r="176" class="s-line thin"/>
    ${ring(163, 36, 's-runes')}
    <circle cx="200" cy="200" r="148" class="s-line"/>
    <g class="s-star"><polygon points="${Array.from({ length: 7 }, (_, i) => { const a = i * 4 / 7 * Math.PI * 2 - Math.PI / 2; return `${200 + Math.cos(a) * 146},${200 + Math.sin(a) * 146}`; }).join(' ')}" class="s-line thin"/></g>
    <circle cx="200" cy="200" r="88" class="s-line thin"/>
    ${ring(76, 18, 's-runes small')}
  </svg>`;
}

/** 開始召喚 count 次 */
export async function runSummon(banner, count) {
  const params = effectiveParams(state.params, banner);
  const demo = params.demo || !hasToken();
  const ar = Math.min(2.4, Math.max(.42, (+params.width || 832) / (+params.height || 1216)));
  if (!params.demo && !hasToken()) { toast('尚未輸入 NovelAI Token，已改用示範模式抽卡', 'warn', 4200); }

  const el = h(`<div class="summon ${count > 1 ? 'multi' : 'single'}" style="--rc:${RCOLOR.R}">
    <div class="summon-bg"><div class="summon-nebula"><i></i><i></i><i></i></div><div class="summon-glow"></div>${sigil()}<div class="summon-floor">${sigil()}</div><div class="summon-rays"></div><div class="summon-prism"></div><div class="summon-flash"></div></div>
    <div class="summon-top">
      <div class="summon-title"><small>${esc(banner.subtitle || 'SUMMON')}</small><b>${esc(banner.name)}</b><i class="st-orn"></i></div>
      <div class="summon-status"><span class="pbar"><i class="progress-fill"></i></span><span class="st-text">準備召喚…</span><span class="st-time"></span></div>
    </div>
    <div class="summon-stage"></div>
    ${count > 1 ? `<div class="summon-strip">${Array.from({ length: count }, (_, i) => `<i class="sm-cell" style="--i:${i}"><b>${i + 1}</b></i>`).join('')}</div>` : ''}
    <div class="summon-bottom">${count > 1 ? '<button class="btn ghost small summon-skip">跳過演出 ▸▸</button>' : ''}</div>
    <button class="icon-btn ghost summon-close" aria-label="關閉">${ICON.x}</button>
  </div>`);
  document.getElementById('overlay-root').append(el);
  el._fx = new SummonFX(el.querySelector('.summon-bg'), el.querySelector('.summon-stage'));
  el._fx.guide = state.settings.summonGuide || 'fish';
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => el.classList.add('in'), 60);
  const stageEl = el.querySelector('.summon-stage');
  // 依生圖比例排版：橫圖每列少放幾張，卡片高度算到剛好塞進畫面
  const mobile = document.documentElement.dataset.layout === 'mobile';
  const cols = count === 1 ? 1 : Math.min(count, mobile ? (ar > 1.15 ? 2 : 3) : ar > 1.15 ? 4 : 5), rows = Math.ceil(count / cols);
  let phase = count > 1 ? 'spot' : 'grid';
  const layout = () => {
    if (phase === 'spot') {   // 十連：一張一張在中間翻開
      stageEl.style.setProperty('--sh', Math.max(160, Math.min(innerHeight - 360, innerWidth * .7 / ar, 560)) + 'px');
      return;
    }
    if (mobile && count > 1) {   // 手機：試 2～5 欄，挑卡片最大、又能全部塞進畫面的排法
      const H = stageEl.clientHeight - 24, W = innerWidth - 28;
      let best = [0, 3];
      for (let c = 2; c <= 5; c++) {
        const r = Math.ceil(count / c), v = Math.min(250, (H - (r - 1) * 10) / r, (W - (c - 1) * 8) / c / ar);
        if (v > best[0]) best = [v, c];
      }
      stageEl.style.setProperty('--cols', best[1]);
      stageEl.style.setProperty('--sh', Math.max(70, best[0]) + 'px');
      return;
    }
    const sh = count === 1
      ? (mobile ? Math.min(stageEl.clientHeight - 24, innerWidth * .8 / ar, 620)   // 手機：照實際剩下的高度，下面的命名框跑出來時卡片會縮小讓位
        : Math.min(innerHeight * .58, innerWidth * .78 / ar, 620))
      : Math.min(250, (innerHeight - (mobile ? 300 : 330)) / rows, (innerWidth - (mobile ? 32 : 100) - (cols - 1) * (mobile ? 10 : 20)) / cols / ar);
    stageEl.style.setProperty('--sh', Math.max(90, sh) + 'px');
  };
  layout(); addEventListener('resize', layout);
  const ro = mobile ? new ResizeObserver(layout) : null;
  ro?.observe(stageEl);
  if (!mobile) stageEl.style.setProperty('--cols', cols);
  stageEl.style.setProperty('--ar', ar);
  const stText = el.querySelector('.st-text'), stTime = el.querySelector('.st-time');
  let cancelled = false, finished = false;
  const close = () => { removeEventListener('resize', layout); ro?.disconnect(); el.classList.remove('in'); setTimeout(() => { el._fx?.destroy(); el.remove(); }, 400); };
  el.querySelector('.summon-close').onclick = () => {
    if (finished) return close();
    cancelled = true; stText.textContent = '本次請求完成後停止…';
  };

  el.style.setProperty('--ar', ar);
  if (count > 1) {
    stageEl.classList.add('spot');
    const results = await multiSequence({ el, stageEl, banner, params, demo, count, ar, stText, stTime, isCancelled: () => cancelled });
    finished = true;
    el.querySelector('.pbar')?.remove();
    el.querySelector('.summon-skip')?.remove();
    if (results.length) stText.textContent = `召喚完成 · 獲得 ${results.length} 張${cancelled ? '（已中止其餘）' : ''}`;
    phase = 'grid'; layout();
    await showAll(el, stageEl, results, ar);
    finishUI(el, results, close);
    return;
  }

  const slots = Array.from({ length: count }, (_, i) => {
    const slot = h(`<div class="slot" style="--d:${i * 60}ms"><i class="slot-halo"></i><div class="slot-flip"><div class="slot-face back"></div><div class="slot-face front"></div></div><div class="slot-label"></div></div>`);
    slot.querySelector('.back').append(...backFace(ar));
    stageEl.append(slot);
    return slot;
  });

  const results = [];
  const t0 = performance.now();
  const timer = setInterval(() => { stTime.textContent = ((performance.now() - t0) / 1000).toFixed(0) + 's'; }, 500);
  for (let i = 0; i < count; i++) {
    if (cancelled) break;
    const slot = slots[i];
    const before = { ...state.stats };
    const rarity = rollRarity(banner);
    slot.classList.add('charging');
    el.style.setProperty('--rc', '#c9d6f0');
    el._fx.setColor('#c9d6f0');
    const appear = fishIn(el, slot, i > 0);
    const prompt = await composePrompt(banner, rarity);
    stText.textContent = `召喚中 ${i + 1} / ${count} · ${demo ? '示範模式繪製中' : '等待 NovelAI 繪製'}`;
    try {
      let blob, seed, payload;
      if (demo) {
        seed = Math.floor(Math.random() * 4294967295);
        blob = await demoImage(+params.width || 832, +params.height || 1216, rarity, seed, params.transparent);
      } else {
        payload = await buildPayload({ params, prompt, negative: banner.negative, characters: banner.characters, useCoords: banner.useCoords });
        seed = payload.parameters.seed;
        blob = await generate(payload);
      }
      const card = await addCard({
        blob, rarity, prompt: payload?.input || prompt, negative: payload?.parameters.negative_prompt || banner.negative,
        seed, model: demo ? '' : params.model, bannerId: banner.id, demo, nameKind: bannerKind(banner), assetLabel: assetLabel(banner),
      });
      results.push(card);
      await appear;
      slot.classList.remove('charging');
      await reveal(el, slot, card, count === 1);
    } catch (err) {
      await appear; el._fx.fishVanish();
      slot.classList.remove('charging'); slot.classList.add('failed');
      slot.querySelector('.slot-label').textContent = '召喚失敗';
      stText.textContent = err.message;
      toast(err.message, 'error', 7000);
      // 失敗不自動重試，也不繼續消耗額度
      for (let k = i + 1; k < count; k++) slots[k].classList.add('skipped');
      // 失敗那一抽不計入抽數與保底
      Object.assign(state.stats, before); save('stats');
      break;
    }
  }
  if (cancelled) slots.slice(results.length).forEach(s => s.classList.add('skipped'));
  clearInterval(timer);
  finished = true;
  el.querySelector('.pbar').remove();
  if (results.length) stText.textContent = `召喚完成 · 獲得 ${results.length} 張${cancelled ? '（已中止其餘）' : ''}`;
  finishUI(el, results, close);
}

/** 抽一張：示範模式或 NovelAI；回傳卡片 */
async function drawOne(banner, params, demo) {
  const rarity = rollRarity(banner);
  const prompt = await composePrompt(banner, rarity);
  let blob, seed, payload;
  if (demo) {
    seed = Math.floor(Math.random() * 4294967295);
    blob = await demoImage(+params.width || 832, +params.height || 1216, rarity, seed, params.transparent);
  } else {
    payload = await buildPayload({ params, prompt, negative: banner.negative, characters: banner.characters, useCoords: banner.useCoords });
    seed = payload.parameters.seed;
    blob = await generate(payload);
  }
  return addCard({
    blob, rarity, prompt: payload?.input || prompt, negative: payload?.parameters.negative_prompt || banner.negative,
    seed, model: demo ? '' : params.model, bannerId: banner.id, demo, nameKind: bannerKind(banner), assetLabel: assetLabel(banner),
  });
}

/** 卡背 + 只在卡片形狀上掃過的流光（圖片卡背用它自己當遮罩） */
function backFace(ar) {
  const back = cardBack('', '', ar);
  const sheen = h('<i class="back-sheen"></i>');
  const img = back.querySelector('img');
  if (img) { const m = `url("${img.getAttribute('src')}") center / contain no-repeat`; sheen.style.mask = m; sheen.style.webkitMask = m; }
  else sheen.classList.add('rounded');
  return [back, sheen];
}
const center = node => { const r = node.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
/** 元素不算進場動畫（縮放、位移）時的位置與大小 */
const restRect = node => {
  const r = node.getBoundingClientRect(), w = node.offsetWidth, hh = node.offsetHeight;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  return { left: cx - w / 2, top: cy - hh / 2, width: w, height: hh, cx, cy };
};
/** 粒子小魚躍進卡面 → 粒子波紋 → 卡背由光點聚出來；之後小魚在卡面裡游，直到翻牌時躍出
 *  （減少動態效果或跳過演出時直接顯示卡背） */
async function fishIn(el, slot, quick, skip = false) {
  const fx = el._fx;
  if (skip || reducedMotion() || fx.guide === 'none') {
    setTimeout(() => { if (!slot.isConnected) return; const r = restRect(slot); fx.setCharge(r.cx, r.cy, .35); }, 60);
    return;
  }
  slot.classList.add('assembling');
  await sleep(40);   // 等版面排好再量位置
  const r = restRect(slot);
  fx.setWarp(.06, r.cx, r.cy);
  await fx.fishEnter(r, slot.querySelector('.back-img'), quick);
  slot.classList.remove('assembling'); slot.classList.add('assembled');
  fx.setCharge(r.cx, r.cy, .35);
}

/** SR / SSR 翻開時，大大的稀有度字樣砸進畫面 */
function stamp(el, slot, rarity) {
  if (!slot.isConnected || !el.isConnected) return;
  const r = slot.getBoundingClientRect();
  const s = h(`<div class="rar-stamp r-${rarity}" data-no-i18n style="left:${r.left + r.width / 2}px;top:${r.top + r.height * .46}px"><b>${rarity}</b><small>${rarity === 'SSR' ? 'SUPERIOR SUPER RARE' : 'SUPER RARE'}</small></div>`);
  el.append(s);
  slot._stamp = s;
  setTimeout(() => s.remove(), 1900);
}

const makeSlot = (ar, d = 0) => {
  const slot = h(`<div class="slot" style="--d:${d}ms"><i class="slot-halo"></i><div class="slot-flip"><div class="slot-face back"></div><div class="slot-face front"></div></div><div class="slot-label"></div></div>`);
  slot.querySelector('.back').append(...backFace(ar));
  return slot;
};

/** 十連：中間一次只翻一張，看完飛進下方的收集列；生圖在背景接著跑 */
async function multiSequence({ el, stageEl, banner, params, demo, count, ar, stText, isCancelled }) {
  const results = [], queue = [];
  let genDone = false, wake = null, fast = reducedMotion();
  const ping = () => { const w = wake; wake = null; w?.(); };
  const skipBtn = el.querySelector('.summon-skip');
  if (skipBtn) skipBtn.onclick = () => { fast = true; skipBtn.disabled = true; skipBtn.textContent = '快速翻開中…'; ping(); };
  const minis = [...el.querySelectorAll('.summon-strip .sm-cell')];

  const gen = (async () => {
    for (let i = 0; i < count; i++) {
      if (isCancelled()) break;
      const before = { ...state.stats };
      stText.textContent = `召喚中 ${i + 1} / ${count} · ${demo ? '示範模式繪製中' : '等待 NovelAI 繪製'}`;
      minis[i]?.classList.add('pending');
      try {
        const card = await drawOne(banner, params, demo);
        results.push(card); queue.push({ card }); ping();
      } catch (err) {
        stText.textContent = err.message;
        toast(err.message, 'error', 7000);
        Object.assign(state.stats, before); save('stats');    // 失敗那一抽不計入抽數與保底，也不自動重試
        queue.push({ error: err }); ping();
        break;
      }
    }
    genDone = true; ping();
  })();

  for (let k = 0; k < count; k++) {
    const spot = makeSlot(ar);
    stageEl.append(spot);
    spot.classList.add('charging');
    el.style.setProperty('--rc', '#c9d6f0');
    el._fx.setColor('#c9d6f0');
    const appear = fishIn(el, spot, k > 0, fast);
    while (!queue.length && !genDone) await new Promise(r => { wake = r; });
    await appear;
    if (!queue.length) { spot.remove(); break; }
    const item = queue.shift();
    spot.classList.remove('charging');
    if (item.error) {
      spot.classList.add('failed'); spot.querySelector('.slot-label').textContent = '召喚失敗';
      await sleep(900); spot.remove();
      break;
    }
    const card = item.card;
    await reveal(el, spot, card, false, fast);
    const cap = h(`<div class="spot-cap r-${card.rarity}">${banner.showRarity !== false ? `<span class="rar-badge r-${card.rarity}">${card.rarity}</span>` : ''}${card.name ? `<b>${esc(card.name)}</b>` : ''}</div>`);
    if (!fast) { stageEl.append(cap); cap.style.top = spot.getBoundingClientRect().bottom - stageEl.getBoundingClientRect().top + 14 + 'px'; }
    // 看一下再收進收集列；點卡片或按「跳過演出」可以馬上下一張
    if (!fast) {
      const hold = card.rarity === 'SSR' ? 2200 : card.rarity === 'SR' ? 1500 : 950;
      spot.onclick = ping;
      await Promise.race([sleep(hold), new Promise(r => { wake = r; })]);
    }
    const mini = minis[k];
    if (mini) {
      const a = spot.getBoundingClientRect(), b = mini.getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2), sc = b.height / a.height;
      const dur = fast ? 160 : 460;
      cap.remove(); spot._stamp?.remove();
      el._fx.comet(a.left + a.width / 2, a.top + a.height / 2, b.left + b.width / 2, b.top + b.height / 2, dur / 1000);
      const anim = spot.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: .4 }], { duration: dur, easing: 'cubic-bezier(.55,0,.3,1)', fill: 'forwards' });
      await Promise.race([anim.finished, sleep(dur + 120)]);
      mini.classList.remove('pending'); mini.classList.add('got', 'r-' + card.rarity);
      mini.style.setProperty('--rc', RCOLOR[card.rarity]);
      mini.append(cardEl(card, {}));
      if (card.rarity !== 'R') el._fx.ring(b.left + b.width / 2, b.top + b.height / 2, RCOLOR[card.rarity], .35);
    }
    cap.remove();
    spot.remove();
  }
  await gen;
  el._fx.fishVanish(); el._fx.setWarp(0); el._fx.setCharge(0, 0, 0);
  minis.forEach(m => { if (!m.classList.contains('got')) m.classList.add('skipped'); });
  return results;
}

/** 十連最後：全部攤開 */
async function showAll(el, stageEl, results, ar) {
  const strip = el.querySelector('.summon-strip');
  if (strip) { strip.classList.add('done'); setTimeout(() => strip.remove(), 400); }
  stageEl.classList.remove('spot');
  stageEl.innerHTML = '';
  const best = results.find(c => c.rarity === 'SSR') || results.find(c => c.rarity === 'SR') || results[0];
  if (best) el.style.setProperty('--rc', RCOLOR[best.rarity]);
  results.forEach((card, i) => {
    const slot = makeSlot(ar, i * 70);
    slot.querySelector('.front').append(cardEl(card, { tilt: true, name: true }));
    slot.style.setProperty('--rc', RCOLOR[card.rarity]);
    slot.classList.add('ready', 'flipped', 'shown', 'r-' + card.rarity);
    slot.onclick = () => import('./carddetail.js').then(m => m.openCardDetail(card.id));
    stageEl.append(slot);
    if (card.rarity !== 'R') setTimeout(() => { if (!slot.isConnected) return; el._fx.setColor(RCOLOR[card.rarity]); el._fx.burst(...center(slot), card.rarity === 'SSR' ? 'SR' : 'R'); }, i * 70 + 450);
  });
  if (best?.rarity === 'SSR') { el._fx.starRain(1800); el._fx.confetti(2600); }
  await sleep(reducedMotion() ? 0 : 400);
}

async function reveal(el, slot, card, single, fastMode = false) {
  const fx = el._fx;
  const front = slot.querySelector('.front');
  front.append(cardEl(card, { tilt: true, name: !single }));
  const fast = reducedMotion() || fastMode;
  const rect = restRect(slot), cx = rect.cx, cy = rect.cy;
  // 稀有度預告：先亮 R 的光，SR / SSR 會在途中「升級」變色
  const steps = card.rarity === 'SSR' ? ['R', 'SR', 'SSR'] : card.rarity === 'SR' ? ['R', 'SR'] : ['R'];
  const total = fast ? 60 : card.rarity === 'SSR' ? 1900 : card.rarity === 'SR' ? 1200 : 600;
  slot.classList.add('ready');
  for (let k = 0; k < steps.length; k++) {
    const c = RCOLOR[steps[k]];
    el.style.setProperty('--rc', c); slot.style.setProperty('--rc', c);
    fx?.setColor(c); fx?.setCharge(cx, cy, fast ? 0 : 1 + k * .7);
    fx?.setWarp(fast ? 0 : .22 + k * .4, cx, cy);
    if (k && !fast) {
      slot.classList.remove('upgrade'); void slot.offsetWidth; slot.classList.add('upgrade');
      fx?.ring(cx, cy, c, .5);
      fx?.zap(rect, 3 + k * 3, c);   // 升級時劈下閃電
      fx?.fishStartle();             // 卡面裡的小魚嚇一跳
      fx?.nova(cx, cy, 200 + k * 80, .5, true);
    }
    if (steps[k] === 'SSR') el.classList.add('ssr-burst');
    await sleep(total / steps.length);
  }
  // 翻開前一瞬間：四周暗下來、卡片收一下、星空加速
  // 小魚從卡面裡躍出來，正好在翻開那一刻化成光點
  if (!fast) {
    const leap = card.rarity === 'R' ? .5 : .62;
    const hasFish = fx?.fishLeapOut(leap);
    el.classList.add('hush'); slot.classList.add('inhale');
    fx?.setWarp(card.rarity === 'R' ? .9 : 2, cx, cy);
    await sleep(hasFish ? leap * 1000 : card.rarity === 'R' ? 180 : 420);
    el.classList.remove('hush'); slot.classList.remove('inhale');
  } else fx?.fishVanish();
  fx?.setWarp(0);
  slot.classList.add('r-' + card.rarity);
  fx?.setCharge(0, 0, 0);
  const flash = el.querySelector('.summon-flash');
  flash.classList.remove('go'); void el.offsetWidth; flash.classList.add('go');
  slot.classList.add('flipped');
  if (!fast && card.rarity === 'SSR') { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  fx?.burst(cx, cy, card.rarity);
  if (card.rarity !== 'R' && !fast) {
    const pillar = h(`<div class="summon-pillar ${card.rarity}" style="left:${cx}px"></div>`);
    el.querySelector('.summon-bg').append(pillar);
    setTimeout(() => pillar.remove(), 1700);
  }
  if (card.rarity !== 'R' && !fast && rarityVisible(card)) setTimeout(() => stamp(el, slot, card.rarity), 280);   // 牌面轉過來時才砸下
  if (card.rarity === 'SSR' && !fast) {
    fx?.starRain(2600); fx?.confetti(3600);
    el.classList.add('ssr-glory'); setTimeout(() => el.classList.remove('ssr-glory'), 2600);
  }
  setTimeout(() => el.classList.remove('ssr-burst', 'shake'), 1400);
  slot.onclick = () => import('./carddetail.js').then(m => m.openCardDetail(card.id));
  if (single) await sleep(fast ? 0 : 700);
}

function finishUI(el, results, close) {
  const bottom = el.querySelector('.summon-bottom');
  if (!results.length) {
    bottom.append(h(`<div class="summon-actions"><button class="btn">關閉</button></div>`));
    bottom.querySelector('button').onclick = close;
    return;
  }
  if (results.length === 1 && el.classList.contains('single') && nameMode() === 'none') {   // 不命名：只留收下 / 前往卡冊
    bottom.append(h(`<div class="summon-actions"><button class="btn primary keep">${ICON.check}收下</button><a class="btn" href="#album">${ICON.album}前往卡冊</a></div>`));
    bottom.querySelector('.keep').onclick = close;
    bottom.querySelector('a').onclick = () => close();
  } else if (results.length === 1 && el.classList.contains('single')) {
    const card = results[0];
    const form = h(`<div class="name-card">
      <p class="nc-hint fx-shiny">${card.rarity === 'SSR' ? '✦ 極稀有的相遇 ✦' : '新的卡片來到你身邊'}</p>
      <div class="nc-row"><input class="field nc-name" maxlength="24" placeholder="為這張卡命名" value="${card.name.startsWith('未命名') ? '' : esc(card.name)}"><input class="field nc-sub" maxlength="28" placeholder="英文名 / 稱號（選填）" value="${esc(card.subtitle || '')}"><button class="btn ghost nc-dice" title="隨機換一個名字">🎲</button></div>
      <div class="summon-actions"><button class="btn ghost later">之後再命名</button><button class="btn primary keep">${ICON.check}收下</button><a class="btn" href="#album">${ICON.album}前往卡冊</a></div>
    </div>`);
    bottom.append(form);
    const input = form.querySelector('.nc-name');
    if (document.documentElement.dataset.layout !== 'mobile') setTimeout(() => input.focus(), 300);   // 手機不自動跳鍵盤
    const keep = async () => {
      const name = input.value.trim(), subtitle = form.querySelector('.nc-sub').value.trim();
      if (name || subtitle) await updateCard(card.id, { ...(name && { name }), ...(subtitle && { subtitle }) });
      const r = form.querySelector('.keep').getBoundingClientRect();
      sparkle(r.left + r.width / 2, r.top);
      setTimeout(close, 250);
    };
    input.onkeydown = e => { if (e.key === 'Enter') keep(); };
    form.querySelector('.nc-dice').onclick = () => {
      const kind = bannerKind(state.banners.find(b => b.id === card.bannerId));
      const r = randomName(kind === 'asset' ? 'char' : kind, card.rarity);
      input.value = r.name; form.querySelector('.nc-sub').value = r.subtitle;
    };
    form.querySelector('.keep').onclick = keep;
    form.querySelector('.later').onclick = close;
    form.querySelector('a').onclick = keep;
  } else {
    const counts = results.reduce((a, c) => (a[c.rarity]++, a), { SSR: 0, SR: 0, R: 0 });
    bottom.append(h(`<div class="summon-actions">
      <span class="sum-count">${['SSR', 'SR', 'R'].filter(r => counts[r]).map(r => `<span class="rar-badge r-${r}">${r}</span>×${counts[r]}`).join(' ')}</span>
      ${nameMode() === 'none' ? '' : '<span class="muted">點卡片可命名</span>'}
      <button class="btn primary keep">${ICON.check}全部收下</button><a class="btn" href="#album">${ICON.album}前往卡冊</a></div>`));
    bottom.querySelector('.keep').onclick = close;
    bottom.querySelector('a').onclick = () => close();
  }
}
