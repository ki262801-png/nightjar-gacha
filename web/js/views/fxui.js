// 工坊 → 特效：分類分頁、已啟用列、一鍵風格（用目前的圖產生縮圖）
import { esc, toast, modal, ICON } from '../util.js';
import { LiveStage, PARTICLES, DEFAULT_FX } from '../live.js';
import { sliderNote, toggle, select } from '../forms.js';

// ---------- 效果定義：[key, 名稱, min, max, step, 說明] ----------
const S = (key, name, min, max, step, note) => ({ key, name, min, max, step, note });
export const TINT_OPTS = [['none', '原色'], ['warm', '暖陽'], ['cool', '冷月'], ['vintage', '復古'], ['mono', '黑白'], ['dream', '夢幻粉'], ['starry', '星夜紫'],
  ['tealorange', '青橙電影'], ['japan', '日系清新'], ['faded', '褪色底片'], ['kodak', '暖調底片'], ['fuji', '富士綠'], ['cyber', '賽博粉藍'], ['sunset', '黃昏金'],
  ['forest', '森林'], ['sepia', '舊照片'], ['noir', '黑色電影'], ['bleach', '漂白'], ['candy', '糖果']];

export const FX_SECTIONS = [
  { id: 'style', name: '風格', icon: '✦' },
  { id: 'particles', name: '粒子', icon: '❄', items: [
    S('particleCount', '粒子數量', 5, 160, 1, '主要粒子的數量，第二種約六成、第三種約四成'),
    S('particleSize', '粒子大小', .3, 3, .05, '所有粒子一起放大縮小'),
    S('particleSpeed', '粒子速度', 0, 3, .05, '0 = 停在空中，越大飄得越快'),
    S('particleOpacity', '粒子透明度', 0, 1, .01, '整層粒子（含光束）的濃淡'),
    S('wind', '風向', -1, 1, .01, '負值往左吹、正值往右吹；雨絲也會跟著斜')] },
  { id: 'filter', name: '動態濾鏡', icon: '≋', items: [
    S('aurora', '極光', 0, 1, .01, '畫面上方一條飄動的綠紫色極光帶'),
    S('caustic', '水底光紋', 0, 1, .01, '像在水裡：畫面輕輕晃動，地上有流動的光紋'),
    S('wave', '熱浪', 0, 1, .01, '空氣扭曲的晃動感，適合火焰、沙漠'),
    S('flash', '閃電', 0, 1, .01, '每隔一陣子畫面閃兩下白光'),
    S('prism', '稜鏡彩虹', 0, 1, .01, '斜斜流過的彩虹光帶'),
    S('neon', '霓虹描邊', 0, 1, .01, '沿著輪廓發出會變色的霓虹光'),
    S('hue', '色相流轉', 0, 1, .01, '整張圖的顏色緩慢循環變換'),
    S('frost', '窗邊結霜', 0, 1, .01, '四周像玻璃結了霜'),
    S('rain', '窗上雨滴', 0, 1, .01, '隔著下雨的窗戶看：水滴滑落、折射後面的畫面'),
    S('rainFog', '玻璃霧氣', 0, 1, .01, '玻璃起霧變模糊；水滴滑過的地方會被擦清楚'),
    S('glitch', '故障', 0, 1, .01, '隨機橫條錯位與紅藍分離'),
    S('scan', '掃描線', 0, 1, .01, '老電視的掃描線與閃爍'),
    S('breathe', '呼吸縮放', 0, 2, .05, '整張圖緩慢放大縮小')] },
  { id: 'light', name: '光影鏡頭', icon: '☀', items: [
    S('rays', '光束', 0, 2, .01, '從左上方斜射進來的柔和光柱'),
    S('flare', '鏡頭光斑', 0, 1, .01, '左上的光源與一串彩色光圈，像逆光拍攝'),
    S('bloom', '柔光暈', 0, 2, .01, '讓亮部向外發光，畫面更夢幻'),
    S('leak', '漏光', 0, 2, .01, '角落緩慢流動的暖色光，像底片漏光'),
    S('sweep', '掃光', 0, 2, .01, '一道光定期掃過畫面，像閃卡反光'),
    S('sweepSpeed', '掃光速度', .2, 4, .05, '1 = 約 11 秒掃一次'),
    S('dof', '背景虛化', 0, 1, .01, '遠處模糊、人物清楚，像大光圈人像（需要先有深度圖）'),
    S('fog', '景深霧', 0, 1, .01, '遠處淡淡泛白（需要深度圖）'),
    S('tilt', '移軸模糊', 0, 1, .01, '上下模糊、中間清楚，像微縮模型'),
    S('zoomBlur', '放射模糊', 0, 1, .01, '從中心往外的速度感'),
    S('fisheye', '魚眼 / 枕形', -1, 1, .01, '正值中間鼓起像魚眼鏡頭，負值往內凹'),
    S('chroma', '色差', 0, 1, .01, '畫面邊緣紅藍分離，增加鏡頭感'),
    S('vignette', '暗角', 0, 1, .01, '四周壓暗，視線集中到中間')] },
  { id: 'grade', name: '調色', icon: '◐', items: [
    S('tintAmount', '色調強度', 0, 1, .01, '0 = 原色，1 = 完全套用上面的色調'),
    S('exposure', '曝光', -1, 1, .01, '整體變亮或變暗'),
    S('contrast', '對比', -1, 1, .01, '正值更鮮明、負值更柔和霧面'),
    S('shadows', '陰影', -1, 1, .01, '正值把暗部提亮看清楚，負值壓得更深'),
    S('highlights', '高光', -1, 1, .01, '負值救回過亮的地方，正值讓亮部更亮'),
    S('saturation', '飽和度', -1, 1, .01, '-1 = 黑白，正值顏色更濃'),
    S('vibrance', '自然飽和', -1, 1, .01, '只加強原本偏淡的顏色，膚色比較不會過頭'),
    S('temperature', '色溫', -1, 1, .01, '負值偏冷藍、正值偏暖黃'),
    S('tintG', '色調', -1, 1, .01, '負值偏綠、正值偏洋紅'),
    S('fade', '褪色', 0, 1, .01, '黑色變灰、整體霧面，像放久的照片'),
    S('splitAmt', '分離色調', 0, 1, .01, '暗部和亮部各染一種顏色（下面兩條選顏色）'),
    { key: 'splitShadow', name: '　暗部顏色', hue: true }, { key: 'splitHigh', name: '　亮部顏色', hue: true },
    S('sharpen', '銳利化', 0, 1, .01, '線條和細節更清楚；太大會出現白邊'),
    S('grain', '底片顆粒', 0, 1, .01, '細微的動態雜訊，膠片質感')] },
  { id: 'stylize', name: '風格化', icon: '✎', items: [
    S('posterize', '色調分離', 0, 1, .01, '顏色變成一塊一塊，像海報或賽璐璐'),
    S('halftone', '漫畫網點', 0, 1, .01, '印刷網點，越大點越粗'),
    S('ink', '漫畫描線', 0, 1, .01, '沿著輪廓加上黑色線條'),
    S('oil', '油畫', 0, 1, .01, '筆觸色塊、細節被抹平'),
    S('watercolor', '水彩', 0, 1, .01, '顏色暈開、邊緣積色、紙紋'),
    S('sketch', '鉛筆素描', 0, 1, .01, '黑白線稿與排線陰影'),
    S('emboss', '浮雕', 0, 1, .01, '像刻在石板或金屬上'),
    S('pixel', '像素化', 0, 1, .01, '變成像素格子，越大格子越粗'),
    S('dither', '抖色', 0, 1, .01, '只用少數顏色加點陣，像老遊戲'),
    S('duotone', '雙色調', 0, 1, .01, '只用兩種顏色表現明暗（下面兩條選顏色）'),
    { key: 'duoDark', name: '　暗色', hue: true }, { key: 'duoLight', name: '　亮色', hue: true },
    S('thermal', '熱成像', 0, 1, .01, '依亮度變成紫紅黃的熱感應色'),
    S('nightvision', '夜視鏡', 0, 1, .01, '綠色夜視與雜訊'),
    S('invert', '反相', 0, 1, .01, '顏色反過來，像底片負片')] },
];
const META = {};
for (const sec of FX_SECTIONS) for (const it of sec.items || []) META[it.key] = { ...it, sec: sec.id };
Object.assign(META, { particles: { name: '粒子', sec: 'particles' }, particles2: { name: '第二種粒子', sec: 'particles' }, particles3: { name: '第三種粒子', sec: 'particles' }, tint: { name: '色調', sec: 'grade' } });
// 這些是設定值而不是效果，不算「已啟用」，套用風格時也不重設
const NOT_EFFECT = new Set(['parallax', 'focus', 'motion', 'motionSpeed', 'particleCount', 'particleSize', 'particleSpeed', 'particleOpacity', 'sweepSpeed', 'tintAmount', 'splitShadow', 'splitHigh', 'duoDark', 'duoLight', 'useLayers', 'layersTop', 'wind']);
const KEEP_ON_PRESET = new Set(['parallax', 'focus', 'motion', 'motionSpeed', 'useLayers', 'layersTop', 'breathe']);

// ---------- 粒子：分類＋圖示 ----------
const P_ICON = { rain: '🌧️', snow: '❄️', snowflake: '❅', crystals: '💠', clouds: '☁️', bubbles: '🫧', petal: '🌸', roses: '🌹', leaves: '🍂', maple: '🍁', ginkgo: '🍃',
  dandelion: '🌼', feathers: '🪶', pollen: '🌻', dust: '✧', sparkle: '✨', stars: '⭐', fireflies: '🌟', bokeh: '🔆', orbs: '🔮', runes: 'ᚱ', shooting: '☄️', starfall: '🌠',
  moons: '🌙', confetti: '🎊', ribbons: '🎀', balloons: '🎈', lanterns: '🏮', hearts: '💗', notes: '🎵', coins: '🪙', gems: '💎', glitter: '✦', butterflies: '🦋',
  birds: '🕊️', bats: '🦇', fish: '🐟', jellyfish: '🪼', ghosts: '👻', embers: '🔥', ash: '▪', smoke: '🌫️', planes: '✈️', code: '💻', pixels: '👾', hexagons: '⬡' };
export const P_GROUPS = [
  ['天氣', ['rain', 'snow', 'snowflake', 'crystals', 'clouds', 'bubbles']],
  ['花葉', ['petal', 'roses', 'leaves', 'maple', 'ginkgo', 'dandelion', 'feathers', 'pollen']],
  ['光點・魔法', ['dust', 'sparkle', 'stars', 'fireflies', 'bokeh', 'orbs', 'runes', 'shooting', 'starfall', 'moons']],
  ['慶典', ['confetti', 'ribbons', 'balloons', 'lanterns', 'hearts', 'notes', 'coins', 'gems', 'glitter']],
  ['生物', ['butterflies', 'birds', 'bats', 'fish', 'jellyfish', 'ghosts']],
  ['火・科技', ['embers', 'ash', 'smoke', 'planes', 'code', 'pixels', 'hexagons']],
];
const pName = id => PARTICLES.find(x => x[0] === id)?.[1] || '無';
const SLOTS = [['particles', '主要'], ['particles2', '第二種'], ['particles3', '第三種']];
const slotsHTML = fx => `<div class="p-slots">${SLOTS.map(([k, n]) => {
  const v = fx[k] && fx[k] !== 'none' ? fx[k] : '';
  return `<div class="p-slot ${v ? 'on' : ''}" data-key="${k}"><button class="ps-pick" title="選擇${n}粒子"><i>${v ? P_ICON[v] || '•' : '＋'}</i><span><small>${n}</small><b>${v ? esc(pName(v)) : '未選'}</b></span></button>${v ? '<button class="ps-x" title="拿掉">✕</button>' : ''}</div>`;
}).join('')}</div>`;
let pGroup = 0;
/** 粒子選擇視窗：分類分頁＋大圖示格子，點一下就選好 */
function pickParticle(cur, title) {
  return modal({
    title, cls: 'p-pick-modal',
    body: `<div class="p-pick">
      <div class="p-tabs">${P_GROUPS.map(([g, list], i) => `<button data-g="${i}" class="${i === pGroup ? 'on' : ''}">${g}<span>${list.length}</span></button>`).join('')}</div>
      ${P_GROUPS.map(([, list], i) => `<div class="p-grid ${i === pGroup ? '' : 'hidden'}" data-g="${i}">${list.map(id => `<button class="p-tile ${id === cur ? 'on' : ''}" data-id="${id}"><i>${P_ICON[id] || '•'}</i><b>${esc(pName(id))}</b></button>`).join('')}</div>`).join('')}
      <div class="row"><button class="btn ghost small p-none">不要粒子</button></div></div>`,
    onOpen: (bd, close) => {
      bd.querySelectorAll('.p-tabs button').forEach(b => b.onclick = () => {
        pGroup = +b.dataset.g;
        bd.querySelectorAll('.p-tabs button').forEach(x => x.classList.toggle('on', x === b));
        bd.querySelectorAll('.p-grid').forEach(gr => gr.classList.toggle('hidden', gr.dataset.g !== b.dataset.g));
      });
      bd.querySelectorAll('.p-tile').forEach(t => t.onclick = () => close(t.dataset.id));
      bd.querySelector('.p-none').onclick = () => close('none');
    },
  });
}
// 打開時先切到目前選的那一類
const groupOf = id => Math.max(0, P_GROUPS.findIndex(([, l]) => l.includes(id)));

// ---------- 一鍵風格 ----------
export const PRESET_GROUPS = [
  ['季節', [
    ['櫻花春日', { particles: 'petal', particles2: 'butterflies', bloom: .45, leak: .4, tint: 'dream', tintAmount: .35 }],
    ['夏日海風', { particles: 'sparkle', rays: .45, tint: 'japan', tintAmount: .6, vibrance: .35, exposure: .08 }],
    ['秋日午後', { particles: 'leaves', rays: .6, leak: .5, tint: 'vintage', tintAmount: .35, grain: .2 }],
    ['冬日結霜', { particles: 'snow', particles2: 'crystals', frost: .55, tint: 'cool', tintAmount: .45, bloom: .3 }],
    ['蒲公英原野', { particles: 'dandelion', rays: .5, leak: .3, bloom: .3 }],
  ]],
  ['氛圍', [
    ['雨夜霓虹', { particles: 'rain', rain: .6, rainFog: .35, tint: 'cool', tintAmount: .5, neon: .25, flash: .3, vignette: .35 }],
    ['夏夜祭典', { particles: 'lanterns', particles2: 'fireflies', particles3: 'sparkle', bloom: .5, tint: 'warm', tintAmount: .4, vignette: .3 }],
    ['極光星夜', { particles: 'stars', particles2: 'shooting', aurora: .8, tint: 'starry', tintAmount: .4, vignette: .3 }],
    ['水底幻境', { particles: 'bubbles', caustic: .8, tint: 'cool', tintAmount: .3, bloom: .3 }],
    ['夢幻散景', { particles: 'bokeh', particles2: 'sparkle', bloom: .7, prism: .4, tilt: .5 }],
    ['戀愛告白', { particles: 'hearts', particles2: 'bokeh', bloom: .5, tint: 'dream', tintAmount: .5 }],
    ['魔法覺醒', { particles: 'runes', particles2: 'orbs', particles3: 'sparkle', bloom: .6, rays: .5, prism: .2 }],
    ['熾熱戰場', { particles: 'embers', wave: .5, tint: 'warm', tintAmount: .6, bloom: .4, flash: .2 }],
    ['音樂現場', { particles: 'notes', particles2: 'confetti', neon: .5, hue: .3, bloom: .5 }],
  ]],
  ['電影感', [
    ['青橙電影', { tint: 'tealorange', tintAmount: .85, contrast: .15, vignette: .3, flare: .25 }],
    ['黑色電影', { tint: 'noir', tintAmount: 1, contrast: .2, grain: .35, vignette: .5 }],
    ['日系清新', { tint: 'japan', tintAmount: .85, exposure: .12, fade: .18, leak: .2 }],
    ['暖調底片', { tint: 'kodak', tintAmount: .8, grain: .3, fade: .15, leak: .3 }],
    ['富士綠底片', { tint: 'fuji', tintAmount: .85, grain: .25, fade: .1, vignette: .2 }],
    ['褪色回憶', { tint: 'faded', tintAmount: .9, grain: .3, vignette: .3, splitAmt: .35, splitShadow: .58, splitHigh: .1 }],
    ['黃昏金時', { tint: 'sunset', tintAmount: .8, rays: .6, flare: .45, bloom: .3 }],
    ['動作大片', { zoomBlur: .4, chroma: .3, contrast: .25, tint: 'tealorange', tintAmount: .5, vignette: .35 }],
  ]],
  ['復古', [
    ['復古 VHS', { scan: .6, glitch: .3, chroma: .5, grain: .5, tint: 'vintage', tintAmount: .4 }],
    ['舊照片', { tint: 'sepia', tintAmount: 1, grain: .45, vignette: .5, fade: .2 }],
    ['蒸氣波', { tint: 'cyber', tintAmount: .85, scan: .35, prism: .4, hue: .15 }],
    ['電玩像素', { pixel: .55, scan: .3, particles: 'confetti' }],
    ['8-bit 抖色', { dither: .7, posterize: .5, pixel: .35 }],
  ]],
  ['風格化', [
    ['漫畫網點', { halftone: .55, ink: .6, posterize: .25 }],
    ['美漫描邊', { ink: .85, posterize: .55, vibrance: .4, contrast: .1 }],
    ['水彩繪本', { watercolor: .85, fade: .08, vibrance: .15 }],
    ['油畫', { oil: .8, vibrance: .25 }],
    ['鉛筆素描', { sketch: 1 }],
    ['雙色海報', { duotone: 1, duoDark: .72, duoLight: .1, posterize: .3 }],
    ['浮雕', { emboss: 1 }],
    ['熱成像', { thermal: 1, scan: .2 }],
    ['夜視鏡', { nightvision: 1, grain: .3 }],
    ['反相負片', { invert: 1, grain: .2 }],
  ]],
  ['鏡頭', [
    ['微縮模型', { tilt: .85, saturation: .3, exposure: .08 }],
    ['大光圈人像', { dof: .85, bloom: .3, vignette: .2 }],
    ['魚眼', { fisheye: .65, vignette: .4 }],
    ['逆光', { flare: .8, rays: .5, highlights: .2, tint: 'sunset', tintAmount: .35 }],
  ]],
];

// ---------- 版面狀態 ----------
const ui = { sec: 'style', group: '季節' };

const hueField = it => `<div class="fld slider hue-fld" data-key="${it.key}"><span>${it.name}</span>
  <div class="slider-row"><input type="range" min="0" max="1" step=".01" data-bind="proj.fx.${it.key}"><input class="num" type="number" min="0" max="1" step=".01" data-bind="proj.fx.${it.key}"></div></div>`;
const control = it => it.hue ? hueField(it) : `<div class="fx-ctl" data-key="${it.key}">${sliderNote(it.name, 'proj.fx.' + it.key, it.min, it.max, it.step, it.note)}</div>`;

const isOn = (fx, k) => !NOT_EFFECT.has(k) && k in DEFAULT_FX && (typeof DEFAULT_FX[k] === 'string' ? fx[k] && fx[k] !== DEFAULT_FX[k] : Math.abs((+fx[k] || 0) - (+DEFAULT_FX[k] || 0)) > .001);
function activeHTML(fx) {
  const keys = Object.keys(DEFAULT_FX).filter(k => isOn(fx, k) && META[k]);
  if (!keys.length) return '<span class="fx-none">還沒有套用任何效果，從下面挑一個風格或分類開始</span>';
  return keys.map(k => {
    const v = fx[k], label = typeof v === 'string' ? (k === 'tint' ? TINT_OPTS.find(x => x[0] === v)?.[1] : PARTICLES.find(x => x[0] === v)?.[1]) || v : (+v).toFixed(2).replace(/\.?0+$/, '');
    return `<span class="fx-on" data-key="${k}"><button class="fo-go" title="跳到這個設定">${esc(META[k].name.trim())}<em>${esc(String(label))}</em></button><button class="fo-x" title="關掉">✕</button></span>`;
  }).join('') + `<button class="fx-clear">全部清除</button>`;
}

export function fxTabHTML(proj) {
  const fx = proj.fx;
  const sec = id => FX_SECTIONS.find(s => s.id === id);
  return `<div class="fx-wrap">
    <div class="fx-sticky">
      <div class="fx-active">${activeHTML(fx)}</div>
      <div class="fx-nav">${FX_SECTIONS.map(s => `<button data-sec="${s.id}" class="${ui.sec === s.id ? 'on' : ''}"><i>${s.icon}</i>${s.name}</button>`).join('')}</div>
    </div>
    <div class="fx-sec ${ui.sec === 'style' ? '' : 'hidden'}" data-sec="style">
      <div class="fx-groups">${PRESET_GROUPS.map(([g]) => `<button data-g="${g}" class="${ui.group === g ? 'on' : ''}">${g}</button>`).join('')}</div>
      <div class="fx-cards"></div>
      <small class="fld-note">縮圖是「你目前這張圖」套上該風格的樣子。套用後可以到各分類再微調；不會改到視差、動作與部件。</small>
      <div class="fx-layer-box">
        ${toggle('LIVE 畫面套用「圖層」分頁的合成結果', 'proj.fx.useLayers', '背景、主體、外圍素材會一起動')}
        ${fx.useLayers ? toggle('包含最上層（卡框、文字以外的頂層素材）', 'proj.fx.layersTop') : ''}
        <button class="btn ghost small go-layers">${ICON.layers}到圖層分頁編排</button>
      </div>
    </div>
    <div class="fx-sec ${ui.sec === 'particles' ? '' : 'hidden'}" data-sec="particles">
      <div class="fld"><span>粒子 <em>最多三種疊加，點格子挑選（共 ${PARTICLES.length - 1} 種，分 ${P_GROUPS.length} 類）</em></span>${slotsHTML(fx)}</div>
      ${sec('particles').items.map(control).join('')}
    </div>
    ${['filter', 'light', 'grade', 'stylize'].map(id => `<div class="fx-sec ${ui.sec === id ? '' : 'hidden'}" data-sec="${id}">
      ${id === 'grade' ? `<div class="fx-ctl" data-key="tint">${select('色調', 'proj.fx.tint', TINT_OPTS)}</div>` : ''}
      ${id === 'light' && !proj.depthCanvas ? '<p class="note small">「背景虛化」「景深霧」需要深度圖：先到「深度 3D」分頁按「分析深度」</p>' : ''}
      ${sec(id).items.map(control).join('')}</div>`).join('')}
  </div>`;
}

/** ctx: { proj, stage, touch, rerender, setTab } */
export function wireFx(body, ctx) {
  const { proj } = ctx;
  const apply = () => { ctx.touch(); ctx.stage.set(proj.fx); ctx.onFx?.(); };
  const showSec = id => {
    ui.sec = id;
    body.querySelectorAll('.fx-nav button').forEach(b => b.classList.toggle('on', b.dataset.sec === id));
    body.querySelectorAll('.fx-sec').forEach(s => s.classList.toggle('hidden', s.dataset.sec !== id));
    if (id === 'style') drawCards();
  };
  body.querySelectorAll('.fx-nav button').forEach(b => b.onclick = () => showSec(b.dataset.sec));
  body.querySelector('.go-layers')?.addEventListener('click', () => ctx.setTab('layers'));

  // 已啟用列：點名稱跳過去、✕ 關掉
  const refreshActive = () => { const a = body.querySelector('.fx-active'); a.innerHTML = activeHTML(proj.fx); wireActive(); };
  const wireActive = () => {
    body.querySelectorAll('.fx-on').forEach(c => {
      const k = c.dataset.key;
      c.querySelector('.fo-go').onclick = () => {
        showSec(META[k].sec);
        const t = body.querySelector(`.fx-sec:not(.hidden) [data-key="${k}"]`);
        if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); }
      };
      c.querySelector('.fo-x').onclick = () => { proj.fx[k] = DEFAULT_FX[k]; apply(); syncInputs(k); if (k.startsWith('particles')) redrawSlots(); refreshActive(); };
    });
    body.querySelector('.fx-clear')?.addEventListener('click', () => {
      for (const k of Object.keys(DEFAULT_FX)) if (!KEEP_ON_PRESET.has(k)) proj.fx[k] = DEFAULT_FX[k];
      proj.fxPreset = ''; apply(); ctx.rerender();
    });
  };
  const syncInputs = k => body.querySelectorAll(`[data-bind="proj.fx.${k}"]`).forEach(i => { if (i.type === 'checkbox') i.checked = !!proj.fx[k]; else i.value = proj.fx[k]; });
  wireActive();
  const wrap = body.querySelector('.fx-wrap');   // 每次重畫都是新的元素，事件不會重複綁
  const tabsH = body.closest('.ws-side')?.querySelector('.tabs')?.offsetHeight;   // 手機上分頁列也是黏在上面的，已啟用列要接在它下面
  if (tabsH) wrap.style.setProperty('--fx-top', tabsH + 'px');
  let rt = 0;
  wrap.addEventListener('input', e => { if (e.target.dataset?.bind?.startsWith('proj.fx.')) { clearTimeout(rt); rt = setTimeout(refreshActive, 150); } });
  wrap.addEventListener('change', e => { if (e.target.dataset?.bind?.startsWith('proj.fx.')) refreshActive(); });

  // 粒子格子
  const wireSlots = () => body.querySelectorAll('.p-slot').forEach(sl => {
    const k = sl.dataset.key;
    sl.querySelector('.ps-pick').onclick = async () => {
      const cur = proj.fx[k];
      if (cur && cur !== 'none') pGroup = groupOf(cur);
      const v = await pickParticle(cur, `選擇${SLOTS.find(x => x[0] === k)[1]}粒子`);
      if (!v) return;
      proj.fx[k] = v; apply(); redrawSlots(); refreshActive();
    };
    sl.querySelector('.ps-x')?.addEventListener('click', () => { proj.fx[k] = 'none'; apply(); redrawSlots(); refreshActive(); });
  });
  const redrawSlots = () => { const box = body.querySelector('.p-slots'); if (box) { box.outerHTML = slotsHTML(proj.fx); wireSlots(); } };
  wireSlots();
  // 一鍵風格
  body.querySelectorAll('.fx-groups button').forEach(b => b.onclick = () => {
    ui.group = b.dataset.g;
    body.querySelectorAll('.fx-groups button').forEach(x => x.classList.toggle('on', x === b));
    drawCards();
  });
  const drawCards = () => {
    const box = body.querySelector('.fx-cards');
    const list = PRESET_GROUPS.find(g => g[0] === ui.group)[1];
    box.innerHTML = list.map(([n]) => `<button class="fx-card ${proj.fxPreset === n ? 'on' : ''}" data-n="${esc(n)}"><span class="fc-img"><img alt="" ${thumbCache.get(thumbKey(ctx, n)) ? `src="${thumbCache.get(thumbKey(ctx, n))}"` : ''}></span><b>${esc(n)}</b></button>`).join('');
    box.querySelectorAll('.fx-card').forEach(c => c.onclick = () => {
      const preset = list.find(x => x[0] === c.dataset.n)[1];
      for (const k of Object.keys(DEFAULT_FX)) if (!KEEP_ON_PRESET.has(k)) proj.fx[k] = DEFAULT_FX[k];
      Object.assign(proj.fx, preset);
      proj.fxPreset = c.dataset.n;
      apply();
      box.querySelectorAll('.fx-card').forEach(x => x.classList.toggle('on', x === c));
      for (const k of Object.keys(DEFAULT_FX)) syncInputs(k);
      redrawSlots(); refreshActive();
      toast(`已套用「${c.dataset.n}」`, 'ok', 1200);
    });
    renderThumbs(ctx, list, box);
  };
  if (ui.sec === 'style') drawCards();
}

// ---------- 縮圖：用一個藏起來的小舞台，把每個風格套在目前的圖上拍一張 ----------
const thumbCache = new Map();
const thumbKey = (ctx, n) => `${ctx.imageKey()}|${n}`;
let thumbJob = 0;
async function renderThumbs(ctx, list, box) {
  const src = ctx.stage?.image;
  if (!src) return;
  const job = ++thumbJob;
  const todo = list.filter(([n]) => !thumbCache.has(thumbKey(ctx, n)));
  if (!todo.length) return;
  const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height, sc = 220 / Math.max(iw, ih);
  const small = document.createElement('canvas'); small.width = Math.max(2, Math.round(iw * sc)); small.height = Math.max(2, Math.round(ih * sc));
  small.getContext('2d').drawImage(src, 0, 0, small.width, small.height);
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${small.width}px;height:${small.height}px;pointer-events:none`;
  document.body.append(host);
  let st;
  try {
    st = new LiveStage(host, { fit: 'contain', dpr: 1 });
    st.pause();
    await st.setImage(small);
    if (ctx.proj.depthCanvas) st.setDepth(ctx.proj.depthCanvas);
    for (const [n, preset] of todo) {
      if (job !== thumbJob || !box.isConnected) break;
      st.particles = [];
      st.fx = { ...DEFAULT_FX, parallax: 0, particleCount: 28, ...preset };
      st.time = 3.2; st.cam = { x: 0, y: 0 };
      st.draw(); st.drawParticles(.016);
      const url = st.snapshot().toDataURL('image/jpeg', .82);
      thumbCache.set(thumbKey(ctx, n), url);
      const img = box.querySelector(`.fx-card[data-n="${CSS.escape(n)}"] img`);
      if (img) img.src = url;
      await new Promise(r => requestAnimationFrame(r));
    }
  } catch (e) { console.warn('風格縮圖失敗', e); }
  finally { st?.destroy(); host.remove(); }
}
export function clearFxThumbs() { thumbCache.clear(); }
