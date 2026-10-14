// Danbooru 詞庫、隨機規則、組出最後送給 NovelAI 的提示詞
// 詞庫來源：Danbooru 的 tag group 維基頁（分類）＋ tags API（確認 TAG 存在、使用次數 ≥ 150），已去掉成人與獵奇類 TAG
import { expandRandom } from './nai.js';

let LIB = null, loading = null;
/** 載入詞庫（約 170KB，第一次用到才下載） → [{ id, name, icon, cats: [{ id, name, tags: [[en, zh, count]] }] }] */
export function loadTags() {
  if (LIB) return Promise.resolve(LIB);
  return loading ??= fetch(new URL('../data/tags.json', import.meta.url)).then(r => {
    if (!r.ok) throw new Error('詞庫載入失敗');
    return r.json();
  }).then(d => {
    LIB = d;
    LIB.cat = {}; LIB.tag = new Map();
    for (const g of d) for (const c of g.cats) {
      c.group = g; LIB.cat[c.id] = c;
      for (const [en, zh, n] of c.tags) LIB.tag.set(en, { en, zh, n, cat: c });
    }
    return LIB;
  }).catch(e => { loading = null; throw e; });
}
export const tagsReady = () => LIB;

export const splitTags = t => String(t || '').split(',').map(x => x.trim()).filter(Boolean);
export const normTag = t => t.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- 隨機規則 ----------
// rule = { id, cat: 詞庫 id 或 'custom', name?, list?: [自訂 TAG], pool?: [只從這些挑], min, max, on }
export function rulePool(rule) {
  if (rule.cat === 'custom') return (rule.list || []).filter(Boolean);
  if (rule.pool?.length) return rule.pool;
  return LIB?.cat[rule.cat]?.tags.map(t => t[0]).filter(t => /[a-z]{2}/.test(t)) || [];   // 整個詞庫抽的時候跳過 ^_^、!? 這類純符號
}
/** 自訂清單大多是哪個詞庫的 TAG（過半才算），用來幫沒取名字的清單自動取名 */
export function guessCat(list = []) {
  if (!LIB || !list.length) return null;
  const n = {};
  for (const opt of list) { const t = LIB.tag.get(normTag(splitTags(opt)[0] || '')); if (t) n[t.cat.id] = (n[t.cat.id] || 0) + 1; }
  const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] / list.length >= .5) return LIB.cat[best[0]];
  // 同一大類但分散在幾個詞庫（例如髮長＋髮型）→ 回傳大類
  const g = {};
  for (const [id, k] of Object.entries(n)) g[LIB.cat[id].group.id] = (g[LIB.cat[id].group.id] || 0) + k;
  const bg = Object.entries(g).sort((a, b) => b[1] - a[1])[0];
  return bg && bg[1] / list.length >= .5 ? { group: LIB.find(x => x.id === bg[0]), name: '綜合' } : null;
}
const AUTO_NAME = /^隨機選項 \d+$/;
export function ruleName(rule) {
  if (rule.cat === 'custom') {
    if (rule.name && !AUTO_NAME.test(rule.name)) return rule.name;
    const c = guessCat(rule.list);
    return c ? `${c.group.name}・${c.name}` : rule.name || '自訂清單';
  }
  const c = LIB?.cat[rule.cat];
  return c ? `${c.group.name}・${c.name}` : rule.cat;
}
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
/** 依規則抽 TAG；已經在 exclude 裡的不會再抽（不放回、不重複） */
export function rollRules(rules = [], exclude = new Set()) {
  const out = [], seen = new Set([...exclude].map(normTag));
  for (const r of rules) {
    if (r.on === false) continue;
    const pool = rulePool(r).filter(t => !seen.has(normTag(t)));
    const lo = Math.max(0, +r.min || 0), hi = Math.max(lo, +r.max || lo);
    let n = Math.min(pool.length, randInt(lo, hi));
    while (n-- > 0) {
      const t = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      seen.add(normTag(t)); out.push(t);
    }
  }
  return out;
}

/**
 * 組出完整提示詞：畫師串 → 圖片提示詞（<A|B> 先展開）→ 隨機規則抽到的詞 → 稀有度加成
 * （品質詞、透明背景詞由 buildPayload 接在最後）
 */
export async function composePrompt(banner, rarity) {
  if (banner.random?.some(r => r.on !== false && r.cat !== 'custom')) await loadTags();
  const artist = expandRandom(banner.artist || ''), main = expandRandom(banner.prompt || '');
  const picks = rollRules(banner.random, new Set([...splitTags(artist), ...splitTags(main)]));
  return [artist, main, picks.join(', '), rarity ? banner.rarityAddon?.[rarity] || '' : '']
    .map(s => s.trim().replace(/^,|,$/g, '').trim()).filter(Boolean).join(', ');
}

/**
 * 粗估 NovelAI V4 以上用的 T5 token 數（上限 512）
 * T5 的 sentencepiece 大約是：英文單字 1～3 個、標點 1 個、中日文每個字 1～2 個
 */
export function estimateTokens(text) {
  let n = 0;
  for (const w of String(text || '').match(/[A-Za-z]+|\d+|[぀-ヿ㐀-鿿]|[^\sA-Za-z\d]/g) || []) {
    if (/^[A-Za-z]+$/.test(w)) n += w.length <= 5 ? 1 : w.length <= 10 ? 2 : 3;
    else if (/^\d+$/.test(w)) n += Math.ceil(w.length / 2);
    else if (/[぀-ヿ㐀-鿿]/.test(w)) n += 1.5;
    else n += 1;
  }
  return Math.round(n);
}
export const TOKEN_LIMIT = 512;

/** 把提示詞裡最外層的 <A|B|C> 拆出來變成「自訂清單」規則（每個抽 1 個） */
export function extractAngles(prompt) {
  const rules = [];
  let rest = '', depth = 0, buf = '';
  for (const ch of String(prompt || '')) {
    if (ch === '<') { if (depth++ === 0) { buf = ''; continue; } }
    if (ch === '>' && depth > 0) { if (--depth === 0) { rules.push(buf); continue; } }
    if (depth > 0) buf += ch; else rest += ch;
  }
  const clean = splitTags(rest).join(', ');
  return {
    prompt: clean,
    rules: rules.map((body, i) => ({ id: 'r' + Date.now().toString(36) + i, cat: 'custom', name: `隨機選項 ${i + 1}`, list: body.split('|').map(s => s.trim()).filter(Boolean), min: 1, max: 1, on: true })),
  };
}

// ---------- 離線翻譯：中文描述 → Danbooru TAG（用詞庫的中文名對照） ----------
const SYN = {
  '女孩': '1girl', '少女': '1girl', '女生': '1girl', '女性': '1girl', '男孩': '1boy', '少年': '1boy', '男生': '1boy', '男性': '1boy',
  '兩個女孩': '2girls', '兩個女生': '2girls', '兩個男孩': '2boys', '一個人': 'solo', '單人': 'solo', '風景': 'scenery', '沒有人': 'no humans',
  '銀髮': 'grey hair', '銀色頭髮': 'grey hair', '金色頭髮': 'blonde hair', '黑色頭髮': 'black hair', '白色頭髮': 'white hair', '紅色頭髮': 'red hair',
  '藍色頭髮': 'blue hair', '粉色頭髮': 'pink hair', '粉髮': 'pink hair', '紫色頭髮': 'purple hair', '綠色頭髮': 'green hair', '棕色頭髮': 'brown hair',
  '紅色眼睛': 'red eyes', '藍色眼睛': 'blue eyes', '金色眼睛': 'yellow eyes', '金眼': 'yellow eyes', '綠色眼睛': 'green eyes', '紫色眼睛': 'purple eyes',
  '笑': 'smile', '笑容': 'smile', '開心': 'happy', '哭': 'crying', '看著鏡頭': 'looking at viewer', '看鏡頭': 'looking at viewer', '回眸': 'looking back',
  '半身': 'upper body', '全身像': 'full body', '大頭照': 'portrait', '俯瞰': 'from above', '仰角': 'from below', '夜景': 'night, cityscape',
  '下雨': 'rain', '雨天': 'rain', '下雪': 'snow', '雪天': 'snow', '晚上': 'night', '夜裡': 'night', '早上': 'morning', '黃昏': 'dusk', '傍晚': 'evening',
  '貓': 'cat', '狗': 'dog', '花': 'flower', '劍': 'sword', '魔法': 'magic', '魔法陣': 'magic circle', '女僕裝': 'maid', '水手服': 'serafuku',
  '眼鏡': 'glasses', '雙馬尾': 'twintails', '馬尾': 'ponytail', '長頭髮': 'long hair', '短頭髮': 'short hair',
  '回頭': 'looking back', '回眸一笑': 'looking back, smile', '側臉': 'profile', '背影': 'from behind', '坐著': 'sitting', '站著': 'standing', '躺著': 'lying',
  '月光': 'moonlight', '陽光': 'sunlight', '星空': 'starry sky', '夜空': 'night sky', '櫻花': 'cherry blossoms', '城市': 'city', '教室': 'classroom', '海邊': 'beach', '森林': 'forest',
};
let zhIndex = null;
function buildZhIndex() {
  const m = new Map();
  for (const [en, t] of LIB.tag) {
    const names = [t.zh, t.zh.replace(/（.*?）/g, '')];
    for (const z of t.zh.split(/[／・]/)) names.push(z.replace(/（.*?）/g, ''));
    for (const z of names) { const k = z.trim(); if (k.length >= 1 && !/^[\x00-\x7f]+$/.test(k) && (!m.has(k) || t.n > LIB.tag.get(m.get(k)).n)) m.set(k, en); }
  }
  for (const [k, v] of Object.entries(SYN)) m.set(k, v);
  return [...m.entries()].sort((a, b) => b[0].length - a[0].length);
}
// 顏色＋名詞：「白色洋裝」→ white dress（詞庫裡真的有這個 TAG 才用）
const COLORS = [['水藍色', 'aqua'], ['水藍', 'aqua'], ['粉紅色', 'pink'], ['粉紅', 'pink'], ['粉色', 'pink'], ['咖啡色', 'brown'], ['白色', 'white'], ['黑色', 'black'], ['紅色', 'red'], ['藍色', 'blue'], ['綠色', 'green'], ['黃色', 'yellow'],
  ['紫色', 'purple'], ['橘色', 'orange'], ['橙色', 'orange'], ['棕色', 'brown'], ['褐色', 'brown'], ['灰色', 'grey'], ['銀色', 'silver'], ['金色', 'gold'],
  ['白', 'white'], ['黑', 'black'], ['紅', 'red'], ['藍', 'blue'], ['綠', 'green'], ['黃', 'yellow'], ['紫', 'purple'], ['橘', 'orange'], ['棕', 'brown'], ['灰', 'grey'], ['銀', 'silver'], ['金', 'gold']];
const NOUNS = [['長頭髮', 'hair', 'long hair'], ['短頭髮', 'hair', 'short hair'], ['長髮', 'hair', 'long hair'], ['短髮', 'hair', 'short hair'], ['捲髮', 'hair', 'curly hair'], ['頭髮', 'hair'], ['髮', 'hair'],
  ['眼睛', 'eyes'], ['眼眸', 'eyes'], ['瞳孔', 'eyes'], ['瞳', 'eyes'], ['眼', 'eyes'], ['洋裝', 'dress'], ['連衣裙', 'dress'], ['禮服', 'dress'], ['裙子', 'skirt'], ['裙', 'skirt'], ['帽子', 'hat'], ['帽', 'hat'],
  ['手套', 'gloves'], ['翅膀', 'wings'], ['長襪', 'thighhighs'], ['襪子', 'socks'], ['和服', 'kimono'], ['緞帶', 'ribbon'], ['蝴蝶結', 'bow'], ['領帶', 'necktie'], ['領結', 'bowtie'], ['外套', 'jacket'],
  ['襯衫', 'shirt'], ['披風', 'cape'], ['斗篷', 'cloak'], ['圍巾', 'scarf'], ['鞋子', 'footwear'], ['靴子', 'boots'], ['背景', 'background'], ['皮膚', 'skin'], ['指甲', 'nails'], ['花', 'flower'], ['火焰', 'fire'], ['鎧甲', 'armor']];
// 顏色＋名詞的組合 TAG（已用 Danbooru API 確認存在、使用次數 ≥ 100）
const COMBOS = new Set('aqua background|aqua boots|aqua bow|aqua bowtie|aqua cape|aqua cloak|aqua dress|aqua eyes|aqua flower|aqua gloves|aqua hair|aqua hat|aqua jacket|aqua kimono|aqua nails|aqua necktie|aqua ribbon|aqua scarf|aqua shirt|aqua skin|aqua skirt|aqua socks|aqua thighhighs|aqua wings|black armor|black background|black boots|black bow|black bowtie|black cape|black cloak|black dress|black eyes|black fire|black flower|black gloves|black hair|black hat|black jacket|black kimono|black nails|black necktie|black ribbon|black scarf|black shirt|black skin|black skirt|black socks|black thighhighs|black wings|blue armor|blue background|blue boots|blue bow|blue bowtie|blue cape|blue cloak|blue dress|blue eyes|blue fire|blue flower|blue gloves|blue hair|blue hat|blue jacket|blue kimono|blue nails|blue necktie|blue ribbon|blue scarf|blue shirt|blue skin|blue skirt|blue socks|blue thighhighs|blue wings|brown armor|brown background|brown boots|brown bow|brown bowtie|brown cape|brown cloak|brown dress|brown eyes|brown flower|brown gloves|brown hair|brown hat|brown jacket|brown kimono|brown nails|brown necktie|brown ribbon|brown scarf|brown shirt|brown skirt|brown socks|brown thighhighs|brown wings|gold armor|gold boots|gold bow|gold bowtie|gold cape|gold dress|gold flower|gold gloves|gold jacket|gold nails|gold ribbon|gold skin|gold thighhighs|green armor|green background|green boots|green bow|green bowtie|green cape|green cloak|green dress|green eyes|green fire|green flower|green gloves|green hair|green hat|green jacket|green kimono|green nails|green necktie|green ribbon|green scarf|green shirt|green skin|green skirt|green socks|green thighhighs|green wings|grey armor|grey background|grey boots|grey bow|grey bowtie|grey cape|grey cloak|grey dress|grey eyes|grey flower|grey gloves|grey hair|grey hat|grey jacket|grey kimono|grey nails|grey necktie|grey ribbon|grey scarf|grey shirt|grey skin|grey skirt|grey socks|grey thighhighs|grey wings|orange armor|orange background|orange boots|orange bow|orange bowtie|orange cape|orange cloak|orange dress|orange eyes|orange fire|orange flower|orange gloves|orange hair|orange hat|orange jacket|orange kimono|orange nails|orange necktie|orange ribbon|orange scarf|orange shirt|orange skin|orange skirt|orange socks|orange thighhighs|orange wings|pink armor|pink background|pink boots|pink bow|pink bowtie|pink cape|pink cloak|pink dress|pink eyes|pink fire|pink flower|pink gloves|pink hair|pink hat|pink jacket|pink kimono|pink nails|pink necktie|pink ribbon|pink scarf|pink shirt|pink skin|pink skirt|pink socks|pink thighhighs|pink wings|purple armor|purple background|purple boots|purple bow|purple bowtie|purple cape|purple cloak|purple dress|purple eyes|purple fire|purple flower|purple gloves|purple hair|purple hat|purple jacket|purple kimono|purple nails|purple necktie|purple ribbon|purple scarf|purple shirt|purple skin|purple skirt|purple socks|purple thighhighs|purple wings|red armor|red background|red boots|red bow|red bowtie|red cape|red cloak|red dress|red eyes|red fire|red flower|red gloves|red hair|red hat|red jacket|red kimono|red nails|red necktie|red ribbon|red scarf|red shirt|red skin|red skirt|red socks|red thighhighs|red wings|silver armor|silver boots|silver dress|silver gloves|silver nails|silver skin|white armor|white background|white boots|white bow|white bowtie|white cape|white cloak|white dress|white eyes|white fire|white flower|white gloves|white hair|white hat|white jacket|white kimono|white nails|white necktie|white ribbon|white scarf|white shirt|white skin|white skirt|white socks|white thighhighs|white wings|yellow armor|yellow background|yellow boots|yellow bow|yellow bowtie|yellow cape|yellow cloak|yellow dress|yellow eyes|yellow flower|yellow gloves|yellow hat|yellow jacket|yellow kimono|yellow nails|yellow necktie|yellow ribbon|yellow scarf|yellow shirt|yellow skin|yellow skirt|yellow socks|yellow thighhighs|yellow wings'.split('|'));
const COLOR_FIX = { 'silver hair': 'grey hair', 'gold hair': 'blonde hair', 'yellow hair': 'blonde hair', 'silver eyes': 'grey eyes', 'gold eyes': 'yellow eyes' };
function colorPhrases(s, put) {
  const re = new RegExp(`(${COLORS.map(c => c[0]).join('|')})(?:的|色的)?(${NOUNS.map(n => n[0]).join('|')})`, 'g');
  return s.replace(re, (m, c, n, at) => {
    const ce = COLORS.find(x => x[0] === c)[1], nn = NOUNS.find(x => x[0] === n);
    let t = `${ce} ${nn[1]}`; t = COLOR_FIX[t] || t;
    const ok = x => LIB.tag.has(x) || COMBOS.has(x);
    if (!ok(t) && ce === 'silver') t = `grey ${nn[1]}`;
    if (!ok(t) && ce === 'gold') t = `yellow ${nn[1]}`;
    if (!ok(t)) return m;                       // 詞庫沒有這個組合就交給後面的單字對照
    put(at, m, t); if (nn[2]) put(at, m, nn[2]);
    return '　'.repeat(m.length);
  });
}
/** 回傳 { tags: [...], hits: [[中文, tag]], rest: 沒對到的文字 }；TAG 依原文出現的順序排 */
export async function offlineTranslate(text) {
  await loadTags();
  zhIndex ??= buildZhIndex();
  let s = String(text || '');
  const found = [];                                      // [位置, 中文, tag]
  const put = (at, zh, en) => found.push([at, zh, en]);
  // 英文直接保留（使用者混寫的 TAG）
  s = s.replace(/[A-Za-z][A-Za-z0-9 _\-'().:]*[A-Za-z0-9)]/g, (m, at) => { const t = normTag(m); if (t.length > 1) put(at, m, t); return '　'.repeat(m.length); });
  s = colorPhrases(s, put);
  for (const [zh, en] of zhIndex) {
    if (zh.length < 2 && !SYN[zh]) continue;
    let at = s.indexOf(zh);
    while (at >= 0) { put(at, zh, en); s = s.slice(0, at) + '　'.repeat(zh.length) + s.slice(at + zh.length); at = s.indexOf(zh); }
  }
  found.sort((a, b) => a[0] - b[0]);
  const tags = [], hits = [];
  for (const [, zh, en] of found) {
    if (!hits.some(h => h[0] === zh && h[1] === en)) hits.push([zh, en]);
    for (const t of splitTags(en)) if (!tags.includes(t)) tags.push(t);
  }
  const rest = s.replace(/[　\s，,。、！!？?「」『』（）()的了和與跟在是有著把被很又也穿戴拿裡下上中]+/g, ' ').trim();
  return { tags, hits, rest };
}

/** 在詞庫裡搜尋（中文或英文），回傳 [{ en, zh, n, cat }] */
export function searchTags(q, limit = 240) {
  if (!LIB || !q.trim()) return [];
  const k = q.trim().toLowerCase(), k2 = k.replace(/_/g, ' ');
  const out = [];
  for (const t of LIB.tag.values()) {
    const score = t.en === k2 || t.zh === k ? 3 : t.en.startsWith(k2) || t.zh.startsWith(k) ? 2 : t.en.includes(k2) || t.zh.includes(k) ? 1 : 0;
    if (score) out.push([score, t]);
  }
  return out.sort((a, b) => b[0] - a[0] || b[1].n - a[1].n).slice(0, limit).map(x => x[1]);
}
