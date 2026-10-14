// 繁 / 簡切換：介面原本用繁體寫，切到簡體時，把畫面上的文字（含之後新出現的）即時轉成簡體
// 先換用語（設定 → 设置、影片 → 视频…），再逐字轉換；切回繁體時還原成原本的文字
// 不會動到輸入框裡的內容（提示詞、卡名等使用者資料），也不會改到存檔的資料
import { CHARS, PHRASES } from './t2s-data.js';

const charMap = new Map();
const CH = Array.from(CHARS);   // 以「字」為單位（有些字在 JS 裡佔兩個字元）
for (let i = 0; i < CH.length; i += 2) charMap.set(CH[i], CH[i + 1]);
const phraseMap = new Map(PHRASES);
const phraseRe = new RegExp(PHRASES.map(([k]) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const HAN = /[㐀-鿿豈-﫿]/;

/** 繁體字串 → 簡體 */
export function toHans(s) {
  if (!s || !HAN.test(s)) return s;
  s = s.replace(phraseRe, m => phraseMap.get(m) || m);
  let out = '';
  for (const ch of s) out += charMap.get(ch) || ch;
  return out;
}

const ATTRS = ['placeholder', 'title', 'aria-label', 'data-hint', 'data-tip', 'alt'];
const SKIP = 'script, style, textarea, code, [data-no-i18n]';
const original = new WeakMap();         // 節點 → 原本的繁體文字
const origAttr = new WeakMap();         // 元素 → { 屬性: 原本的值 }
let observer = null, active = false, origTitle = '';

function convertText(node) {
  const v = node.nodeValue;
  if (!v || !HAN.test(v) || node.parentElement?.closest(SKIP)) return;
  const t = toHans(v);
  if (t === v) return;
  if (!original.has(node) || toHans(original.get(node)) !== v) original.set(node, v);
  node.nodeValue = t;
}
function convertAttrs(el) {
  if (el.closest?.(SKIP)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (!v || !HAN.test(v)) continue;
    const t = toHans(v);
    if (t === v) continue;
    const o = origAttr.get(el) || {};
    if (!(a in o) || toHans(o[a]) !== v) o[a] = v;
    origAttr.set(el, o);
    el.setAttribute(a, t);
  }
}
function convertTree(root) {
  if (root.nodeType === 3) return convertText(root);
  if (root.nodeType !== 1 && root.nodeType !== 11) return;
  if (root.nodeType === 1) convertAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? convertText(n) : convertAttrs(n);
}
function restoreTree(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 3) { const o = original.get(n); if (o !== undefined && toHans(o) === n.nodeValue) n.nodeValue = o; }
    else { const o = origAttr.get(n); if (o) for (const a in o) if (toHans(o[a]) === n.getAttribute(a)) n.setAttribute(a, o[a]); }
  }
}

/** lang = 'hant'（繁體，預設）或 'hans'（簡體） */
export function applyLang(lang) {
  const want = lang === 'hans';
  document.documentElement.lang = want ? 'zh-Hans' : 'zh-Hant';
  document.documentElement.dataset.lang = want ? 'hans' : 'hant';
  if (want === active) return;
  active = want;
  if (want) {
    origTitle = document.title; document.title = toHans(document.title);
    convertTree(document.body);
    observer = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') convertText(m.target);
        else if (m.type === 'attributes') convertAttrs(m.target);
        else m.addedNodes.forEach(convertTree);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    loadHansFonts();
  } else {
    observer?.disconnect(); observer = null;
    if (origTitle) document.title = origTitle;
    restoreTree(document.body);
  }
}

/** 簡體字形用思源簡體（Noto SC），第一次切換時才載入 */
let fontsLoaded = false;
function loadHansFonts() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@500;700;900&display=swap';
  document.head.append(l);
}
