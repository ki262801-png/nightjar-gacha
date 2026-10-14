// 全域狀態、事件、卡片資料操作
import { db } from './db.js';
import { DEFAULT_PARAMS, setToken, setCustomApi } from './nai.js';
import { uid, makeThumb } from './util.js';
import { randomName } from './names.js';

const ASSET_ADDON = {
  SSR: 'masterpiece, intricate details, glowing gems, luxurious',
  SR: 'detailed, polished',
  R: '',
};

const RARITY_ADDON = {
  SSR: 'masterpiece, dramatic lighting, intricate details, detailed background, glowing particles',
  SR: 'detailed, beautiful lighting',
  R: '',
};

export const DEFAULT_BANNERS = [
  {
    id: 'banner-moon', name: '月下幻想 · 角色池', subtitle: 'MOONLIT FANTASIA',
    artist: '',
    prompt: '1girl, solo, looking at viewer, upper body, cinematic lighting',
    random: [
      { id: 'r-moon-1', cat: 'hairstyle', pool: ['twintails', 'side ponytail', 'high ponytail', 'single braid', 'twin braids', 'double bun', 'hime cut', 'bob cut', 'hair down', 'half updo'], min: 1, max: 1, on: true },
      { id: 'r-moon-2', cat: 'haircolor', pool: ['grey hair', 'black hair', 'blue hair', 'red hair', 'blonde hair', 'pink hair', 'white hair', 'purple hair', 'gradient hair', 'streaked hair'], min: 1, max: 1, on: true },
      { id: 'r-moon-3', cat: 'eyecolor', pool: null, min: 1, max: 1, on: true },
      { id: 'r-moon-4', cat: 'custom', name: '服裝', list: ['gothic lolita, black dress', 'white dress', 'military uniform', 'kimono', 'witch hat, robe', 'maid', 'serafuku', 'qipao'], min: 1, max: 1, on: true },
      { id: 'r-moon-5', cat: 'custom', name: '場景', list: ['night sky, full moon', 'cathedral, stained glass', 'flower field', 'rain, city, neon lights', 'starry sky, nebula', 'library', 'cherry blossoms, shrine'], min: 1, max: 1, on: true },
      { id: 'r-moon-6', cat: 'headwear', pool: ['hair ribbon', 'hair flower', 'hairclip', 'tiara', 'hairband', 'hair bow', 'beret', 'witch hat', 'crown', 'veil'], min: 0, max: 2, on: true },
    ],
    negative: '', characters: [], useCoords: false, rarityAddon: { ...RARITY_ADDON }, rates: { SSR: 3, SR: 15 }, cover: null,
  },
  {
    id: 'banner-scene', name: '夜航風景 · 場景池', subtitle: 'NIGHT VOYAGE',
    artist: '',
    prompt: 'no humans, scenery, wide shot, depth of field',
    random: [
      { id: 'r-scene-1', cat: 'building', pool: ['city', 'lighthouse', 'shrine', 'clock tower', 'castle', 'ruins', 'bridge', 'train station', 'cathedral', 'floating city', 'tower'], min: 1, max: 1, on: true },
      { id: 'r-scene-2', cat: 'weather', pool: ['shooting star', 'falling petals', 'fog', 'rain', 'snow', 'full moon', 'crescent moon', 'milky way', 'nebula', 'cloudy sky', 'gradient sky', 'autumn leaves'], min: 1, max: 2, on: true },
      { id: 'r-scene-3', cat: 'light', pool: ['moonlight', 'light rays', 'dappled sunlight', 'lamppost', 'candlelight', 'twilight', 'sunbeam', 'starry sky', 'sunset', 'aurora', 'night'], min: 0, max: 1, on: true },
    ],
    negative: '', characters: [], useCoords: false, rarityAddon: { ...RARITY_ADDON }, rates: { SSR: 3, SR: 15 }, cover: null,
  },

  {
    id: 'banner-items', name: '素材工坊 · 道具池', subtitle: 'ARTIFACT FORGE', kind: 'asset', transparent: true, model: 'nai-diffusion-5-full', size: 'square',
    prompt: 'no humans, single object, centered, <ornate sword|crystal potion bottle|antique key|spell book|jeweled crown|pocket watch|magic staff|rose in glass dome|lantern|treasure chest>, <gold and sapphire|silver and amethyst|obsidian and ruby|ivory and pearl>, game item icon, detailed, isolated object',
    negative: 'character, human, text watermark, background scenery', characters: [], useCoords: false, rarityAddon: { ...ASSET_ADDON }, rates: { SSR: 3, SR: 15 }, cover: null,
  },
  {
    id: 'banner-deco', name: '裝飾邊框池', subtitle: 'ORNAMENT ATELIER', kind: 'asset', transparent: true, model: 'nai-diffusion-5-full', size: 'square',
    prompt: 'no humans, decorative <ornate frame border|lace corner ornament|ribbon banner|floral wreath|gothic filigree divider|crest emblem|art nouveau border|chain and gem garland>, <gold leaf|silver filigree|rose gold|black iron and gold>, symmetrical, isolated, ui decoration',
    negative: 'character, human, text watermark, background scenery', characters: [], useCoords: false, rarityAddon: { ...ASSET_ADDON }, rates: { SSR: 3, SR: 15 }, cover: null,
  },
  {
    id: 'banner-text', name: '文字標題池', subtitle: 'TYPOGRAPHY', kind: 'asset', transparent: true, model: 'nai-diffusion-5-full', size: 'landscape',
    prompt: 'no humans, text "<NIGHTJAR|ARCANA|SSR|FANTASIA|LEGEND>", <ornate gothic lettering|elegant calligraphy logo|metallic 3d title logo|neon sign lettering|engraved gold typography>, title logo, centered, isolated',
    negative: 'character, human, text watermark, background scenery', characters: [], useCoords: false, rarityAddon: { ...ASSET_ADDON }, rates: { SSR: 3, SR: 15 }, cover: null,
  },
  {
    id: 'banner-fx', name: '光效美化池', subtitle: 'LIGHT & SPARKLE', kind: 'asset', transparent: true, model: 'nai-diffusion-5-full', size: 'square',
    prompt: 'no humans, <magic circle|sparkle burst|glowing particles|light rays|star cluster|crystal shards|flower petals swirl|feather scatter|bubbles>, <golden light|blue glow|rainbow iridescent|pink glow>, effect overlay, isolated, glowing',
    negative: 'character, human, text watermark, background scenery', characters: [], useCoords: false, rarityAddon: { ...ASSET_ADDON }, rates: { SSR: 3, SR: 15 }, cover: null,
  },
];

export const DEFAULT_GROUPS = [
  { id: 'g-quality', name: '高畫質', text: 'masterpiece, best quality, amazing quality, very aesthetic, absurdres', color: 'gold' },
  { id: 'g-light', name: '電影光影', text: 'cinematic lighting, rim light, volumetric light, depth of field', color: 'blue' },
  { id: 'g-bad', name: '常用負面', text: 'lowres, bad anatomy, bad hands, extra digits, fewer digits, jpeg artifacts, watermark, signature, blurry', color: 'red' },
];

export const state = {
  settings: { theme: 'night', homeBg: null, homeSlides: [], homeIndex: 0, homeAuto: 0, homeFit: 'cover', rememberToken: false, token: '', pullCount: 10, pitySSR: 60, rarityStyle: 'aura', rarityScale: 1.2, homeUiAutoHide: true, cardBack: 'default', cardBackL: 'auto', cardBackS: 'auto', backTone: 'original', summonGuide: 'fish', themeTransition: 'circle', themeDuration: 700, ripple: true, textFx: true, seededBanners: [], clickWaves: true, intro: true, cursor: 'system', cursorSize: 32, dragCursor: 'theme', autoName: true, autoSubtitle: true, lang: 'hant',
    homeFx: { wipe: true, ripple: true, sparks: true, poke: true, trail: true } },
  params: structuredClone(DEFAULT_PARAMS),
  banners: structuredClone(DEFAULT_BANNERS),
  activeBanner: 'banner-moon',
  stats: { pulls: 0, sinceSSR: 0, sinceSR: 0, serial: 0, ssr: 0, sr: 0 },
  promptGroups: [],
};

// ---------- 事件 ----------
const listeners = {};
export const on = (ev, fn) => ((listeners[ev] ??= new Set()).add(fn), () => listeners[ev].delete(fn));
export const emit = (ev, data) => listeners[ev]?.forEach(fn => fn(data));

// ---------- 讀寫 ----------
export async function loadState() {
  for (const k of ['settings', 'params', 'banners', 'activeBanner', 'stats']) {
    const v = await db.kvGet(k);
    if (v === undefined) continue;
    state[k] = (typeof v === 'object' && !Array.isArray(v) && v) ? { ...state[k], ...v } : v;
  }
  state.params = { ...structuredClone(DEFAULT_PARAMS), ...state.params };
  for (const k of ['img2img', 'charRef']) state.params[k] = { ...DEFAULT_PARAMS[k], ...state.params[k] };
  if (!state.banners.length) state.banners = structuredClone(DEFAULT_BANNERS);
  // 新版內建卡池（例如 V5 透明素材池）補進舊存檔，但不覆蓋使用者改過的
  const seeded = new Set(state.settings.seededBanners || []);
  if (!seeded.size) state.banners.forEach(b => seeded.add(b.id));
  for (const b of DEFAULT_BANNERS) if (!seeded.has(b.id)) { if (!state.banners.find(x => x.id === b.id)) state.banners.push(structuredClone(b)); seeded.add(b.id); }
  state.settings.seededBanners = [...seeded];
  // 舊版單一首頁背景 → 多張輪播
  if (state.settings.homeBg && !state.settings.homeSlides?.length) state.settings.homeSlides = [state.settings.homeBg];
  state.settings.homeBg = null;
  state.settings.homeFx = { wipe: true, ripple: true, sparks: true, poke: true, trail: true, ...state.settings.homeFx };
  // v3：稀有度預設改成光暈字（只遷移一次）
  if (!state.settings.v3) { if (state.settings.rarityStyle === 'pill') state.settings.rarityStyle = 'aura'; state.settings.v3 = true; }
  state.promptGroups = (await db.kvGet('promptGroups')) || DEFAULT_GROUPS;
  if (!state.banners.find(b => b.id === state.activeBanner)) state.activeBanner = state.banners[0].id;
  if (state.settings.rememberToken && state.settings.token) setToken(state.settings.token);
  if (state.settings.customApi) setCustomApi(state.settings.customApi);   // 自訂 API 位址（金鑰有勾「記住」才會存）
  const albums = await db.all('albums');
  if (!albums.length) await db.put('albums', { id: 'album-main', name: '我的卡冊', color: 'crimson', orient: 'portrait', createdAt: Date.now() });
}

const timers = {};
export function save(key) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    let v = state[key];
    if (key === 'settings' && !v.rememberToken) v = { ...v, token: '' };
    db.kvSet(key, structuredClone(v));
  }, 250);
}

/** 加入 / 移除首頁輪播 */
export function addHomeSlide(slide, { only = false } = {}) {
  const list = only ? [] : (state.settings.homeSlides || []).filter(x => !(x.type === slide.type && x.id === slide.id));
  list.push(slide);
  state.settings.homeSlides = list;
  state.settings.homeIndex = list.length - 1;
  save('settings');
}
export function removeHomeSlide(type, id) {
  state.settings.homeSlides = (state.settings.homeSlides || []).filter(x => !(x.type === type && x.id === id));
  state.settings.homeIndex = 0;
  save('settings');
}

export const activeBanner = () => state.banners.find(b => b.id === state.activeBanner) || state.banners[0];

// ---------- 卡片 ----------
/** 新卡的命名方式：auto 自動隨機、number「未命名 No.0001」、none 留白（舊設定 autoName: false 視為 number） */
export const nameMode = () => state.settings.nameMode || (state.settings.autoName === false ? 'number' : 'auto');

export async function addCard(data) {
  const { blob: thumb, width, height, alpha } = await makeThumb(data.blob, 520);
  state.stats.serial += 1; save('stats');
  // 名字：素材類卡池用「道具 No.0134」；命名方式是「自動」就隨機取一個；「編號」是「未命名 No.0001」；「不命名」就留白
  const no = String(state.stats.serial).padStart(4, '0');
  let name = data.name, subtitle = data.subtitle || '';
  const mode = nameMode();
  if (!name) {
    if (data.nameKind === 'asset') name = `${data.assetLabel || '素材'} No.${no}`;
    else if (data.nameKind && mode === 'none') name = '';
    else if (data.nameKind && mode === 'auto') {
      const taken = new Set((await db.all('cards')).map(c => c.name));
      const r = randomName(data.nameKind, data.rarity, taken);
      name = r.name;
      if (state.settings.autoSubtitle !== false && !subtitle) subtitle = r.subtitle;
    } else name = `未命名 No.${no}`;
  }
  const card = {
    id: uid('c'), serial: state.stats.serial, name,
    subtitle, quote: '', rarity: data.rarity || 'R', blob: data.blob, thumb, width, height,
    prompt: data.prompt || '', negative: data.negative || '', seed: data.seed ?? null, model: data.model || '',
    bannerId: data.bannerId || null, demo: !!data.demo, source: data.source || 'gacha',
    createdAt: Date.now(), albumId: null, slot: null, depth: null, alpha, film: 'auto', rarityStyle: 'auto', liveId: null, craft: null,
  };
  await db.put('cards', card);
  emit('cards');
  return card;
}

export async function updateCard(id, patch) {
  const card = await db.get('cards', id);
  if (!card) return null;
  Object.assign(card, patch);
  await db.put('cards', card);
  emit('cards', card);
  return card;
}

export async function deleteCard(id) {
  await db.del('cards', id);
  removeHomeSlide('card', id);
  emit('cards');
}

export const allCards = async () => (await db.all('cards')).sort((a, b) => b.createdAt - a.createdAt);

/** 依保底與機率決定稀有度 */
export function rollRarity(banner) {
  const s = state.stats, rates = banner.rates || { SSR: 3, SR: 15 };
  s.pulls += 1; s.sinceSSR += 1; s.sinceSR += 1;
  const r = Math.random() * 100;
  let rarity = 'R';
  if (s.sinceSSR >= (state.settings.pitySSR || 60) || r < rates.SSR) rarity = 'SSR';
  else if (s.sinceSR >= 10 || r < rates.SSR + rates.SR) rarity = 'SR';
  if (rarity === 'SSR') { s.sinceSSR = 0; s.sinceSR = 0; s.ssr += 1; }
  if (rarity === 'SR') { s.sinceSR = 0; s.sr += 1; }
  save('stats');
  return rarity;
}

export const RARITY_LABEL = { SSR: 'SSR', SR: 'SR', R: 'R' };
