// 卡片外觀：稀有度邊框、全息反光、3D 傾斜、卡背與封蠟紋章
import { h, esc, blobURL, reducedMotion } from './util.js';
import { state } from './store.js';

// 扁平封蠟：實色花形外輪廓 + 細線紋章，顏色跟著配色變（--seal / --seal-hi）
const SEAL_T = `<svg class="seal-svg" viewBox="0 0 100 100" aria-hidden="true">
  <path d="M50.00,3.00 L54.44,4.92 L58.51,7.24 L63.15,6.65 L67.99,6.58 L71.35,10.05 L74.22,13.75 L78.74,14.98 L83.23,16.77 L85.02,21.26 L86.25,25.78 L89.95,28.65 L93.42,32.01 L93.35,36.85 L92.76,41.49 L95.08,45.56 L97.00,50.00 L95.08,54.44 L92.76,58.51 L93.35,63.15 L93.42,67.99 L89.95,71.35 L86.25,74.22 L85.02,78.74 L83.23,83.23 L78.74,85.02 L74.22,86.25 L71.35,89.95 L67.99,93.42 L63.15,93.35 L58.51,92.76 L54.44,95.08 L50.00,97.00 L45.56,95.08 L41.49,92.76 L36.85,93.35 L32.01,93.42 L28.65,89.95 L25.78,86.25 L21.26,85.02 L16.77,83.23 L14.98,78.74 L13.75,74.22 L10.05,71.35 L6.58,67.99 L6.65,63.15 L7.24,58.51 L4.92,54.44 L3.00,50.00 L4.92,45.56 L7.24,41.49 L6.65,36.85 L6.58,32.01 L10.05,28.65 L13.75,25.78 L14.98,21.26 L16.77,16.77 L21.26,14.98 L25.78,13.75 L28.65,10.05 L32.01,6.58 L36.85,6.65 L41.49,7.24 L45.56,4.92Z" style="fill:var(--seal)"/>
  <circle cx="50" cy="50" r="34.5" fill="none" style="stroke:var(--seal-hi)" stroke-width="1.6" opacity=".9"/>
  <circle cx="50" cy="50" r="30" fill="none" style="stroke:var(--seal-hi)" stroke-width="1.1" stroke-dasharray=".1 3.2" stroke-linecap="round" opacity=".85"/>
  <path d="M39 63V38l22 25V38" fill="none" style="stroke:var(--seal-hi)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M50 19l1.8 3.2L50 25.4l-1.8-3.2zM50 74.6l1.8 3.2L50 81l-1.8-3.2z" style="fill:var(--seal-hi)"/>
</svg>`;
export const seal = () => SEAL_T;

/** 程式繪製的分隔飾：中間菱形 + 兩側漸隱細線與小圓點（顏色跟主題） */
let ornN = 0;
export const ornament = (cls = '') => { const n = ++ornN; return `<svg class="orn ${cls}" viewBox="0 0 240 18" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
  <defs><linearGradient id="ornL${n}" x1="0" x2="1"><stop offset="0" stop-color="currentColor" stop-opacity="0"/><stop offset="1" stop-color="currentColor"/></linearGradient>
  <linearGradient id="ornR${n}" x1="1" x2="0"><stop offset="0" stop-color="currentColor" stop-opacity="0"/><stop offset="1" stop-color="currentColor"/></linearGradient></defs>
  <path d="M8 9H102" stroke="url(#ornL${n})" stroke-width="1"/><path d="M138 9H232" stroke="url(#ornR${n})" stroke-width="1"/>
  <circle cx="98" cy="9" r="1.6" fill="currentColor"/><circle cx="142" cy="9" r="1.6" fill="currentColor"/>
  <path d="M120 1.5L126.5 9L120 16.5L113.5 9Z" fill="none" stroke="currentColor" stroke-width="1.1"/>
  <path d="M120 5.5L123 9L120 12.5L117 9Z" fill="currentColor"/>
  <path d="M106 9l4-2.4v4.8zM134 9l-4-2.4v4.8z" fill="currentColor" opacity=".8"/>
</svg>`; };

const STARS = { SSR: 5, SR: 4, R: 3 };

/** 卡膜：疊在卡面上的表面處理 */
export const FILMS = [
  ['auto', '依稀有度', 'SSR 鐳射、SR 稜鏡、R 無膜'],
  ['none', '無膜', '原圖原色，不加任何反光'],
  ['gloss', '亮面', '像上了光油，傾斜時一道白光滑過'],
  ['matte', '霧面', '柔和顆粒感，降低反光與對比'],
  ['laser', '鐳射', '彩虹全息，隨角度流動'],
  ['prism', '稜鏡', '斜向稜鏡條紋，色散分光'],
  ['glitter', '星砂', '細碎閃粉，轉動時一顆顆亮起'],
  ['cracked', '碎冰', '冰裂紋路的反光，經典收藏卡膜'],
  ['galaxy', '銀河', '散景星點與淡淡星雲'],
  ['gold', '金箔', '暖金色箔面，邊緣最亮'],
  ['ripple', '水波', '同心圓水紋，從游標處擴散'],
];
export const filmOf = card => (!card.film || card.film === 'auto') ? ({ SSR: 'laser', SR: 'prism', R: 'none' }[card.rarity] || 'none') : card.film;

/** 稀有度標誌樣式 */
export const RARITY_STYLES = [
  ['aura', '光暈字'], ['pill', '膠囊'], ['gem', '寶石'], ['crest', '盾徽'], ['ribbon', '斜角緞帶'],
  ['stars', '星級'], ['seal', '封蠟'], ['foil', '燙金字'], ['tag', '吊牌'],
  ['crown', '皇冠'], ['wing', '羽翼'], ['hex', '六角晶'], ['neon', '霓虹框'], ['moon', '月牙'],
  ['rosette', '花窗'], ['orbit', '星軌'], ['stamp', '郵戳'], ['pixel', '像素'], ['hanko', '印章'],
];
const HANKO = { SSR: '極', SR: '稀', R: '常' };
export const rarityStyleOf = card => (card.rarityStyle && card.rarityStyle !== 'auto' && card.rarityStyle !== 'none') ? card.rarityStyle : (state.settings.rarityStyle || 'aura');
/** 這張卡要不要顯示稀有度：單張卡選了「不顯示」就不顯示、選了樣式就顯示；「自動」跟著抽出它的卡池（卡池可以關掉稀有度顯示） */
export function rarityVisible(card) {
  if (!card) return false;
  if (card.rarityStyle === 'none') return false;
  if (card.rarityStyle && card.rarityStyle !== 'auto') return true;
  const banner = card.bannerId && state.banners.find(b => b.id === card.bannerId);
  return banner?.showRarity !== false;
}
export const rarityScaleOf = card => card.rarityScale || state.settings.rarityScale || 1.2;

export function rarityBadge(rarity, style = 'pill') {
  const stars = '★'.repeat(STARS[rarity] || 3);
  const inner = {
    aura: `<i class="rb-swirl"></i><b>${rarity}</b><i class="rb-spark">✦</i>`,
    gem: `<i class="rb-shape"></i><b>${rarity}</b>`,
    crest: `<i class="rb-shape"></i><b>${rarity}</b>`,
    ribbon: `<b>${rarity}</b>`,
    stars: `<b>${stars}</b>`,
    seal: `<i class="rb-shape"></i><b>${rarity}</b>`,
    foil: `<b>${rarity}</b>`,
    tag: `<b>${rarity}</b><small>${stars}</small>`,
    crown: `<svg class="rb-ico" viewBox="0 0 24 12"><path d="M2 11 3.6 2.5l4.6 4.6L12 .8l3.8 6.3 4.6-4.6L22 11Z"/></svg><b>${rarity}</b>`,
    wing: `<svg class="rb-ico l" viewBox="0 0 14 10"><path d="M14 6C10 1 5 0 0 1c3 1.2 4.2 2.8 3.6 4.6C6.5 4.6 10 5.6 14 6Z"/></svg><b>${rarity}</b><svg class="rb-ico r" viewBox="0 0 14 10"><path d="M14 6C10 1 5 0 0 1c3 1.2 4.2 2.8 3.6 4.6C6.5 4.6 10 5.6 14 6Z"/></svg>`,
    hex: `<i class="rb-shape"></i><b>${rarity}</b>`,
    neon: `<b>${rarity}</b>`,
    moon: `<svg class="rb-ico" viewBox="0 0 20 20"><path d="M13 1a9 9 0 1 0 6 15A7.5 7.5 0 0 1 13 1Z"/></svg><b>${rarity}</b>`,
    rosette: `<svg class="rb-ico" viewBox="0 0 32 32">${Array.from({ length: 8 }, (_, i) => `<ellipse cx="16" cy="7" rx="4.2" ry="7" transform="rotate(${i * 45} 16 16)"/>`).join('')}<circle cx="16" cy="16" r="7.5" class="rb-core"/></svg><b>${rarity}</b>`,
    orbit: `<i class="rb-ring"></i><b>${rarity}</b>`,
    stamp: `<b>${rarity}</b><small>${stars}</small>`,
    pixel: `<b>${rarity}</b>`,
    hanko: `<b>${HANKO[rarity] || rarity}</b>`,
  }[style] || `<b>${rarity}</b>`;
  return `<span class="tcg-rarity rb-${style}">${inner}</span>`;
}

/** 圖片長寬比（夾在合理範圍內） */
export const aspectOf = card => Math.min(2.4, Math.max(.42, (card.width || 2) / (card.height || 3)));

/** 讓寬高比 ar 的卡片完整放進寬高比 boxAr 的框：回傳百分比尺寸 */
export function fitBox(ar, boxAr) {
  return ar > boxAr ? { w: 100, h: boxAr / ar * 100 } : { w: ar / boxAr * 100, h: 100 };
}

export function cardEl(card, { name = true, tilt = false, cls = '', full = false, holo = true } = {}) {
  const ar = aspectOf(card);
  // 卡片設定成「卡冊顯示閃卡」時，用套用工藝時存下的閃卡截圖（已含卡框、名字，不再疊卡膜與標誌）
  if (holo && card.show === 'holo' && card.craftShot) {
    const el = h(`<div class="tcg is-holo r-${card.rarity} ${ar > 1.15 ? 'landscape' : ar > .87 ? 'square' : 'portrait'} ${cls}" data-id="${card.id}" style="--ar:${ar}">
      <div class="tcg-inner"><img class="tcg-art" src="${blobURL('cs:' + card.id + ':' + (card.craftShotAt || 0), card.craftShot)}" alt="${esc(card.name)}" draggable="false">
      <div class="holo-sheen"></div><div class="tcg-glare"></div>
      <span class="tcg-tags">${card.liveId ? '<span class="tcg-live" title="有 LIVE 動態"><b>LIVE</b></span>' : ''}</span></div></div>`);
    if (tilt) attachTilt(el);
    return el;
  }
  const src = full ? blobURL('full:' + card.id, card.blob) : blobURL('thumb:' + card.id, card.thumb || card.blob);
  const el = h(`<div class="tcg r-${card.rarity} ${ar > 1.15 ? 'landscape' : ar > .87 ? 'square' : 'portrait'} ${card.alpha ? 'alpha' : ''} ${cls}" data-id="${card.id}" style="--ar:${ar};--rb-scale:${rarityScaleOf(card)}">
    <div class="tcg-inner">
      <img class="tcg-art" src="${src}" alt="${esc(card.name)}" draggable="false">
      <div class="tcg-film film-${filmOf(card)}"></div><div class="tcg-glare"></div>
      <div class="tcg-frame"></div>
      ${rarityVisible(card) ? rarityBadge(card.rarity, rarityStyleOf(card)) : ''}
      <span class="tcg-tags">${card.liveId ? '<span class="tcg-live" title="有 LIVE 動態"><b>LIVE</b></span>' : ''}${card.craft ? '<span class="tcg-craft" title="已套用閃卡工藝"><b>✦ 工藝</b></span>' : ''}</span>
      ${name && (card.name || card.subtitle) ? `<div class="tcg-name"><span class="tcg-stars">${'✦'.repeat(STARS[card.rarity])}</span><b>${esc(card.name)}</b>${card.subtitle ? `<small>${esc(card.subtitle)}</small>` : ''}</div>` : ''}
    </div></div>`);
  if (tilt) attachTilt(el);
  return el;
}

/** 把卡片放進固定比例的框（卡袋、托盤…），不裁切 */
export function cardInBox(card, boxAr, opts) {
  const el = cardEl(card, opts);
  const { w, h: hh } = fitBox(aspectOf(card), boxAr);
  el.style.width = w + '%'; el.style.height = hh + '%';
  el.classList.add('boxed');
  return el;
}

// 直式卡背 → 同系列的橫式／方形卡背（沒有同款的，配一張風格接近的）
export const BACK_SERIES = { 'back-a01': 'a02', 'back-a02': 'a02', 'back-a03': 'd01', 'back-a04': 'a04', 'back-b01': 'b01', 'back-b02': 'f02', 'back-c01': 'c01',
  'back-c02': 'e02', 'back-d01': 'd01', 'back-e01': 'c01', 'back-e02': 'e02', 'back-f01': 'd01', 'back-f02': 'f02', 'back-g01': 'g01' };
/** 卡片比例 → 形狀：p 直式、l 橫式、s 方形 */
export const backShape = ar => ar > 1.15 ? 'l' : ar < .87 ? 'p' : 's';
/** 依卡片比例選卡背圖檔；回傳 null = 用內建的夜航紋章 */
export function backFile(ar = 2 / 3) {
  const s = state.settings, p = s.cardBack || 'default', shape = backShape(ar);
  if (shape === 'p') return p === 'default' ? null : p;
  const pick = (shape === 'l' ? s.cardBackL : s.cardBackS) || 'auto';
  if (pick === 'default' || (pick === 'auto' && p === 'default')) return null;
  if (pick !== 'auto') return pick;
  return `back${shape}-${BACK_SERIES[p] || 'a04'}`;
}

export function cardBack(rarity = '', cls = '', ar = 2 / 3) {
  const file = backFile(ar);
  if (file) {
    return h(`<div class="tcg-back img-back shape-${backShape(ar)} ${cls}" style="--ar:${ar}"><img class="back-img" src="assets/deco/${file}.webp" alt="" draggable="false"></div>`);
  }
  return h(`<div class="tcg-back ${rarity ? 'r-' + rarity : ''} ${cls}" style="--ar:${ar}">
    <div class="back-pattern"></div><div class="back-ring"></div>
    <div class="back-seal">${seal()}</div>
    <div class="back-text">NIGHTJAR · ARCANA</div>
  </div>`);
}

/** 滑鼠移動時卡片 3D 傾斜 + 光澤跟著跑 */
export function attachTilt(el, strength = 14) {
  if (reducedMotion()) return;
  const inner = el.querySelector('.tcg-inner') || el;
  let raf = 0;
  const move = e => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      inner.style.setProperty('--rx', `${(.5 - y) * strength}deg`);
      inner.style.setProperty('--ry', `${(x - .5) * strength}deg`);
      inner.style.setProperty('--mx', `${x * 100}%`);
      inner.style.setProperty('--my', `${y * 100}%`);
      inner.style.setProperty('--pos', `${x * 100}% ${y * 100}%`);
      el.classList.add('tilting');
    });
  };
  const leave = () => {
    cancelAnimationFrame(raf);
    el.classList.remove('tilting');
    inner.style.setProperty('--rx', '0deg'); inner.style.setProperty('--ry', '0deg');
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
}
