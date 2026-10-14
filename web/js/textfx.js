// 文字動效（參考 React Bits 的 Text Animations，改寫成不依賴框架的版本）
// splitText：逐字彈起 / 模糊淡入；decrypt：亂碼解密；countUp：數字滾動；rotateWords：輪播字詞
// shiny / gradient 是純 CSS（class：fx-shiny、fx-gradient）
import { reducedMotion } from './util.js';
import { state } from './store.js';

const enabled = () => state.settings.textFx !== false && !reducedMotion();

/** 逐字出現：mode = 'rise'（由下彈起）| 'blur'（模糊淡入）| 'pop'（縮放彈出） */
export function splitText(el, text = el.textContent, { mode = 'rise', stagger = 38, delay = 0 } = {}) {
  if (!el) return;
  if (!enabled()) { el.textContent = text; return; }
  el.textContent = '';
  el.classList.add('fx-split');
  [...text].forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'fx-ch fx-' + mode;
    s.textContent = ch === ' ' ? ' ' : ch;
    s.style.animationDelay = delay + i * stagger + 'ms';
    el.append(s);
  });
}

/** 亂碼解密：先顯示隨機字元，再從左到右逐漸變成正確文字 */
export function decrypt(el, text = el.textContent, { duration = 900, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·◆✦' } = {}) {
  if (!el) return;
  if (!enabled()) { el.textContent = text; return; }
  const t0 = performance.now();
  clearInterval(el._dec);
  el._dec = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / duration);
    const n = Math.floor(text.length * p);
    el.textContent = text.slice(0, n) + [...text.slice(n)].map(c => c === ' ' ? ' ' : chars[Math.floor(Math.random() * chars.length)]).join('');
    if (p >= 1) { clearInterval(el._dec); el.textContent = text; }
  }, 40);
}

/** 數字從 0 滾到目標值 */
export function countUp(el, to, { duration = 900, decimals = 0, suffix = '' } = {}) {
  if (!el) return;
  if (!enabled()) { el.textContent = to.toFixed(decimals) + suffix; return; }
  const t0 = performance.now();
  const tick = now => {
    const p = Math.min(1, (now - t0) / duration), e = 1 - Math.pow(1 - p, 3);
    el.textContent = (to * e).toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(tick); else el.textContent = to.toFixed(decimals) + suffix;
  };
  requestAnimationFrame(tick);
  setTimeout(() => { el.textContent = to.toFixed(decimals) + suffix; }, duration + 200);   // 視窗在背景時也會停在正確數字
}

/** 輪播字詞：每隔一段時間換下一個詞，逐字由下翻上來 */
export function rotateWords(el, words, { interval = 2600 } = {}) {
  if (!el || !words.length) return () => { };
  let i = 0;
  splitText(el, words[0], { mode: 'rise', stagger: 30 });
  if (!enabled() || words.length < 2) return () => { };
  const t = setInterval(() => { i = (i + 1) % words.length; splitText(el, words[i], { mode: 'rise', stagger: 30 }); }, interval);
  return () => clearInterval(t);
}
