// 召喚頁 → 卡池提示詞：三區提示詞（畫師串 / 圖片提示詞 / 隨機詞庫）、Danbooru 詞庫、快速組合、自動完成、智慧翻譯、🎲 隨機提示詞
import { esc, uid, toast, modal, ICON } from '../util.js';
import { save } from '../store.js';
import { PROMPT_LIBRARY } from '../presets.js';
import { loadTags, tagsReady, splitTags, normTag, rulePool, ruleName, rollRules, composePrompt, estimateTokens, TOKEN_LIMIT, extractAngles, offlineTranslate, searchTags } from '../promptlib.js';
import { aiReady, aiTranslate, MODES } from '../aitrans.js';
import { state } from '../store.js';

// 版面狀態（換卡池、重畫時保留）
const ui = { panel: '', rules: false, group: 'people', cat: 'count', target: 'pos', q: '', quick: 0 };

const hasAngles = b => /<[^<>]*\|[^<>]*>/.test(b.prompt || '');
const angleRules = b => (b.random || []).filter(r => r.angle);

// ---------- HTML ----------
/** 展開 / 收起的提示（所有可以點開的區塊都用同一個樣式） */
export const discHint = () => `<span class="disc-hint"><em class="d-open">展開</em><em class="d-close">收起</em><i>▾</i></span>`;
const zoneHead = (title, note, acts = '') => `<div class="zh"><b>${title}</b>${note ? `<small>${note}</small>` : ''}${acts ? `<div class="zh-acts">${acts}</div>` : ''}</div>`;
const area = (bind, rows, placeholder) => `<textarea class="field" rows="${rows}" data-bind="${bind}" placeholder="${esc(placeholder)}"></textarea>`;

export const promptZonesHTML = b => {
  const on = (b.random || []).filter(r => r.on !== false).length;
  const showAngle = hasAngles(b) || angleRules(b).length;
  const libBtn = (p, icon, name) => `<button class="btn ghost small pz-lib ${ui.panel === p ? 'on' : ''}" data-p="${p}" aria-expanded="${ui.panel === p}">${icon}${name}<i class="lib-chev">▾</i></button>`;
  return `<div class="span2 pz">
  <div class="pz-head"><b>提示詞結構</b>
    <div class="pz-acts">
      <button class="btn ghost small pz-trans">${ICON.sparkles}智慧翻譯</button>
      <button class="btn ghost small pz-dice" title="像 NovelAI 的骰子：按一下就把 ② 換成一組隨機內容">${ICON.dice}隨機提示詞</button>
      <button class="btn ghost small pz-undo hidden" title="回到按骰子之前">↶ 復原</button>
    </div>
    <small>召喚時依序合併成一段送出：<i class="z1">① 畫師串</i> → <i class="z2">② 圖片提示詞</i> → <i class="z3">③ 隨機詞</i> → 稀有度加成 → 品質詞。打字時會自動提示 Danbooru TAG（↑↓ 選、Enter 或 Tab 確定）。</small></div>
  <div class="pz-zone z1" data-hint="畫風、畫師標籤放這裡；從詞庫加 TAG、隨機詞都不會動到這一區">
    ${zoneHead('① 畫師串', '選填；畫風、artist: 標籤')}
    ${area('banner.artist', 2, 'artist:xxx, artist:yyy')}</div>
  <div class="pz-zone z2" data-hint="每一張都要出現的內容">
    ${zoneHead('② 圖片提示詞', '', libBtn('dan', ICON.book, 'Danbooru 詞庫') + libBtn('quick', ICON.layers, '快速組合'))}
    ${area('banner.prompt', 4, '1girl, solo, …')}
    ${showAngle ? `<label class="fld toggle pz-angle" title="開：把 <A|B|C> 拆成下面的隨機規則；關：還原成 <A|B|C> 寫法"><input type="checkbox" ${!hasAngles(b) && angleRules(b).length ? 'checked' : ''}><i class="sw"></i><span>&lt;…|…&gt; 轉成隨機規則</span></label>` : ''}
    <div class="tl ${ui.panel ? '' : 'hidden'}">
      <div class="tl-top"><div class="seg small tl-target" title="點 TAG 時加到哪裡"><button data-v="pos" class="${ui.target === 'pos' ? 'on' : ''}">加到 ② 圖片提示詞</button><button data-v="neg" class="${ui.target === 'neg' ? 'on' : ''}">加到負面</button></div>
        <button class="btn ghost small tl-close">收起 ▴</button></div>
      <div class="tl-body"></div>
    </div></div>
  <div class="pz-zone zn" data-hint="會接在「NAI 參數」裡選的預設負面詞後面">
    ${zoneHead('負面提示詞', '不想出現的內容；接在「NAI 參數」的預設負面詞後面')}
    ${area('banner.negative', 2, 'lowres, bad hands, …')}</div>
  <div class="pz-zone z3 disc ${ui.rules ? 'open' : ''}">
    <button class="rr-toggle disc-head" aria-expanded="${ui.rules}"><span>③ 隨機詞庫</span><em>${on ? `${on} 條啟用` : '未使用'}</em>${discHint()}<small>每次召喚從啟用的詞庫各抽幾個 TAG</small></button>
    <div class="rr-body"><div class="rr-list">${rulesHTML(b)}</div>
      <button class="btn ghost small rr-add">${ICON.plus}新增隨機規則</button></div></div>
  <div class="pz-final">
    <div class="pf-meter"><span class="pf-label">預估長度</span><div class="pf-bar"><i></i></div><b class="pf-n">—</b></div>
    <div class="row wrap"><button class="btn ghost small pf-roll">${ICON.dice}預覽召喚時會送出的內容</button><button class="btn ghost small pf-again hidden">${ICON.dice}再抽一次</button><button class="btn ghost small pf-hide hidden">收起預覽 ▴</button><small class="muted">NovelAI V4 以上提示詞上限約 ${TOKEN_LIMIT} tokens，超過的部分會被忽略</small></div>
    <p class="pf-out mono hidden"></p>
  </div>
</div>`;
};

function rulesHTML(b) {
  const rs = b.random || [];
  if (!rs.length) return '<p class="muted small rr-empty">還沒有隨機規則。按「新增隨機規則」，或在 Danbooru 詞庫的分類上按「🎲 設為隨機」。</p>';
  return rs.map((r, i) => {
    const pool = rulePool(r), lib = r.cat !== 'custom';
    return `<div class="rr ${r.on === false ? 'off' : ''}" data-i="${i}">
      <label class="rr-on" title="啟用 / 停用"><input type="checkbox" ${r.on === false ? '' : 'checked'}><i class="sw"></i></label>
      <div class="rr-main"><b><span class="rr-kind ${lib ? 'lib' : 'own'}">${lib ? '詞庫' : '自訂'}</span>${esc(ruleName(r))}</b>
        <small>${lib ? (r.pool?.length ? `自選 ${r.pool.length} 個` : `整個詞庫 ${pool.length || '…'} 個`) : `${pool.length} 個選項`}<span class="rr-peek">${esc(pool.slice(0, 4).join('、'))}${pool.length > 4 ? '…' : ''}</span></small></div>
      <div class="rr-n" title="每次抽幾個（最少～最多）"><span>抽</span><input class="field num" type="number" min="0" max="20" value="${+r.min || 0}" data-k="min"><span>～</span><input class="field num" type="number" min="0" max="20" value="${+r.max || 0}" data-k="max"><span>個</span></div>
      <button class="btn ghost small rr-edit">${lib ? '選範圍' : '編輯'}</button>
      <button class="icon-btn ghost rr-del" aria-label="刪除">${ICON.trash}</button></div>`;
  }).join('');
}

function danHTML() {
  const L = tagsReady();
  const g = L.find(x => x.id === ui.group) || L[0];
  const c = g.cats.find(x => x.id === ui.cat) || g.cats[0];
  ui.group = g.id; ui.cat = c.id;
  return `<div class="tl-groups">${L.map(x => `<button data-g="${x.id}" class="${x.id === g.id ? 'on' : ''}"><i>${x.icon}</i>${esc(x.name)}</button>`).join('')}</div>
    <div class="tl-cats">${g.cats.map(x => `<button data-c="${x.id}" class="${x.id === c.id ? 'on' : ''}">${esc(x.name)}</button>`).join('')}</div>
    <div class="tl-bar"><label class="lib-search">${ICON.search}<input class="field tl-q" placeholder="搜尋全部 TAG（中文或英文）" value="${esc(ui.q)}" autocomplete="off"></label>
      <button class="btn ghost small tl-rule" title="每次召喚從「${esc(c.name)}」隨機抽">🎲 把「${esc(c.name)}」設為隨機</button></div>
    <div class="tl-tags"></div>
    <small class="fld-note">點一下加入、再點一下拿掉；亮起來代表已經在提示詞裡。也可以拖到提示詞框。</small>`;
}

const quickHTML = () => `<div class="lib-tabs">${PROMPT_LIBRARY.map((c, i) => `<button class="${i === ui.quick ? 'on' : ''}" data-q="${i}"><i>${c.icon}</i>${c.name}</button>`).join('')}</div>
  <div class="lib-chips">${PROMPT_LIBRARY[ui.quick].items.map(it => typeof it === 'string' ? `<span class="lib-h">${esc(it)}</span>`
    : `<button class="chip lib-chip" draggable="true" data-tags="${esc(it[1])}" title="${esc(it[1])}">＋ ${esc(it[0])}</button>`).join('')}</div>
  <small class="fld-note">整組常用寫法。帶 &lt;…|…&gt; 的每次召喚前先在你的瀏覽器裡挑好一個，NovelAI 只會收到挑中的那個詞。</small>`;

// 🎲 隨機提示詞（沒有隨機規則時用這份配方；已經有規則的類別會跳過，留給召喚時抽）
const DICE = [
  { cat: 'custom', list: ['1girl, solo', '1girl, solo', '1girl, solo', '1boy, solo', '2girls', '1girl, 1boy'], min: 1, max: 1, key: 'count' },
  { cat: 'hairlen', pool: ['long hair', 'short hair', 'medium hair', 'very long hair'], min: 1, max: 1 },
  { cat: 'hairstyle', min: 0, max: 1 },
  { cat: 'haircolor', pool: ['black hair', 'blonde hair', 'brown hair', 'blue hair', 'pink hair', 'white hair', 'grey hair', 'purple hair', 'red hair', 'green hair', 'orange hair', 'aqua hair', 'gradient hair', 'streaked hair'], min: 1, max: 1 },
  { cat: 'eyecolor', min: 1, max: 1 },
  { cat: 'expr', pool: ['smile', 'blush', 'open mouth', 'closed eyes', 'grin', 'light smile', 'serious', 'expressionless', 'pout', 'surprised', 'smirk', 'embarrassed', 'happy', 'sleepy'], min: 1, max: 1 },
  { cats: ['top', 'uniform', 'traditional', 'fashion'], min: 1, max: 1 },
  { cat: 'headwear', min: 0, max: 1 },
  { cat: 'jewelry', min: 0, max: 1 },
  { cat: 'pose', pool: ['standing', 'sitting', 'kneeling', 'lying', 'leaning forward', 'walking', 'running', 'squatting', 'floating', 'jumping', 'crossed legs', 'head tilt'], min: 1, max: 1 },
  { cat: 'framing', pool: ['upper body', 'cowboy shot', 'full body', 'portrait', 'close-up'], min: 1, max: 1 },
  { cat: 'angle', pool: ['from side', 'from above', 'from below', 'dutch angle', 'from behind'], min: 0, max: 1 },
  { cats: ['indoor', 'building', 'nature'], min: 1, max: 1 },
  { cat: 'weather', min: 0, max: 1 },
  { cat: 'light', min: 0, max: 1 },
];
const looksLikeCount = r => r.cat === 'count';
function rollDice(b) {
  const L = tagsReady(), used = new Set((b.random || []).filter(r => r.on !== false).map(r => r.cat));
  const rules = [];
  for (const d of DICE) {
    if (d.key === 'count' ? (b.random || []).some(r => r.on !== false && looksLikeCount(r)) : d.cats ? d.cats.some(c => used.has(c)) : used.has(d.cat)) continue;
    if (d.cats) rules.push({ cat: 'custom', list: d.cats.flatMap(c => L.cat[c].tags.map(t => t[0]).filter(t => /[a-z]{2}/.test(t))), min: d.min, max: d.max });
    else rules.push(d);
  }
  return rollRules(rules).join(', ');
}

const fmt = t => `<b>${esc(t.zh)}</b><small>${esc(t.en)}</small>`;

// ---------- 接線 ----------
export function wirePromptUI(body, b, rerender) {
  b.random ??= []; b.artist ??= '';
  const art = body.querySelector('[data-bind="banner.artist"]'), pos = body.querySelector('[data-bind="banner.prompt"]'), neg = body.querySelector('[data-bind="banner.negative"]');
  if (!pos) return;
  const target = () => ui.target === 'neg' ? neg : pos;
  const setVal = (ta, v) => { ta.value = v; ta.dispatchEvent(new Event('input')); };
  for (const ta of [art, pos, neg]) if (ta) attachAutocomplete(ta);

  // --- 預估長度 ---
  let mt = 0;
  const meter = () => { clearTimeout(mt); mt = setTimeout(async () => {
    const full = await composePrompt(b, 'SSR');
    const n = estimateTokens(full + (state.params.qualityToggle ? ', very aesthetic, masterpiece, no text' : ''));
    const bar = body.querySelector('.pf-bar i'), lab = body.querySelector('.pf-n');
    if (!bar) return;
    bar.style.width = Math.min(100, n / TOKEN_LIMIT * 100) + '%';
    bar.parentElement.dataset.lv = n > TOKEN_LIMIT ? 'over' : n > TOKEN_LIMIT * .75 ? 'warn' : 'ok';
    lab.textContent = `約 ${n} / ${TOKEN_LIMIT}`;
  }, 250); };
  for (const ta of [art, pos]) ta?.addEventListener('input', meter);
  meter();
  const pfOut = body.querySelector('.pf-out'), pfRoll = body.querySelector('.pf-roll'), pfAgain = body.querySelector('.pf-again'), pfHide = body.querySelector('.pf-hide');
  const preview = async open => {
    pfOut.classList.toggle('hidden', !open); pfAgain.classList.toggle('hidden', !open); pfHide.classList.toggle('hidden', !open); pfRoll.classList.toggle('hidden', open);
    if (open) pfOut.textContent = await composePrompt(b, '');
  };
  pfRoll.onclick = () => preview(true);
  pfAgain.onclick = () => preview(true);
  pfHide.onclick = () => preview(false);

  // --- 🎲 隨機提示詞（像 NovelAI 的骰子） ---
  let undo = null, undoT = 0;
  const undoBtn = body.querySelector('.pz-undo');
  body.querySelector('.pz-dice').onclick = async e => {
    const btn = e.currentTarget;
    await loadTags();
    if (undo === null) undo = pos.value;
    setVal(pos, rollDice(b));
    pos.animate([{ boxShadow: '0 0 0 4px color-mix(in srgb, var(--gold) 45%, transparent)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 600 });
    btn.querySelector('svg')?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 450, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    undoBtn.classList.remove('hidden');
    clearTimeout(undoT); undoT = setTimeout(() => { undoBtn.classList.add('hidden'); undo = null; }, 20000);
  };
  undoBtn.onclick = () => { if (undo !== null) setVal(pos, undo); undo = null; undoBtn.classList.add('hidden'); };

  // --- 隨機規則 ---
  const z3 = body.querySelector('.pz-zone.z3');
  const refreshCount = () => { const n = b.random.filter(r => r.on !== false).length; z3.querySelector('.rr-toggle em').textContent = n ? `${n} 條啟用` : '未使用'; };
  z3.querySelector('.rr-toggle').onclick = e => { ui.rules = !ui.rules; z3.classList.toggle('open', ui.rules); e.currentTarget.setAttribute('aria-expanded', ui.rules); };
  const redrawRules = () => { body.querySelector('.rr-list').innerHTML = rulesHTML(b); wireRules(); refreshCount(); meter(); };
  const wireRules = () => body.querySelectorAll('.rr').forEach(row => {
    const r = b.random[+row.dataset.i];
    row.querySelector('.rr-on input').onchange = e => { r.on = e.target.checked; row.classList.toggle('off', !r.on); save('banners'); refreshCount(); meter(); };
    row.querySelectorAll('.rr-n input').forEach(inp => inp.onchange = () => {
      r[inp.dataset.k] = Math.max(0, Math.min(20, Math.round(+inp.value || 0)));
      if (+r.max < +r.min) { if (inp.dataset.k === 'min') r.max = r.min; else r.min = r.max; }
      save('banners'); redrawRules();
    });
    row.querySelector('.rr-del').onclick = () => { b.random.splice(b.random.indexOf(r), 1); save('banners'); redrawRules(); };
    row.querySelector('.rr-edit').onclick = async () => { if (await editRule(r)) { save('banners'); redrawRules(); } };
  });
  wireRules();
  if (b.random.length && !tagsReady()) loadTags().then(() => body.isConnected && redrawRules()).catch(() => { });   // 詞庫載入後才知道自訂清單屬於哪一類
  const addRule = r => { b.random.push(r); save('banners'); ui.rules = true; z3.classList.add('open'); z3.querySelector('.rr-toggle').setAttribute('aria-expanded', true); redrawRules(); };
  body.querySelector('.rr-add').onclick = async () => { const r = await newRule(); if (r && await editRule(r, true)) addRule(r); };

  // --- <…|…> 轉成隨機規則（切換，可以還原） ---
  body.querySelector('.pz-angle input')?.addEventListener('change', e => {
    if (e.target.checked) {
      const { prompt, rules } = extractAngles(b.prompt);
      if (!rules.length) { e.target.checked = false; return; }
      b.angleSaved = { from: b.prompt, to: prompt };
      b.prompt = prompt; b.random.push(...rules.map(r => ({ ...r, angle: true })));
      toast(`已把 ${rules.length} 組 <…|…> 轉成隨機規則（在 ③ 隨機詞庫裡）`, 'ok', 3000);
      ui.rules = true;
    } else {
      const back = angleRules(b);
      b.random = b.random.filter(r => !r.angle);
      if (b.angleSaved && b.angleSaved.to === b.prompt) b.prompt = b.angleSaved.from;   // 沒改過：原樣還原
      else b.prompt = [b.prompt, ...back.map(r => `<${r.list.join('|')}>`)].filter(Boolean).join(', ');
      delete b.angleSaved;
      toast('已還原成 <…|…> 寫法', 'ok', 2000);
    }
    save('banners'); rerender();
  });

  // --- 智慧翻譯 ---
  body.querySelector('.pz-trans').onclick = () => translateDialog(pos);

  // --- 詞庫 / 快速組合（按鈕打開，需要時才顯示） ---
  const tl = body.querySelector('.tl'), tbody = tl.querySelector('.tl-body');
  const inPrompt = () => new Set([...splitTags(pos.value), ...splitTags(neg?.value)].map(normTag));
  const markTags = () => { const have = inPrompt(); tbody.querySelectorAll('.tl-tag').forEach(t => t.classList.toggle('in', have.has(normTag(t.dataset.t)))); };
  const toggleTag = tag => {
    const ta = target(), list = splitTags(ta.value), k = normTag(tag), i = list.findIndex(x => normTag(x) === k);
    if (i >= 0) list.splice(i, 1); else list.push(tag);
    setVal(ta, list.join(', '));
    if (i < 0) ta.animate([{ boxShadow: '0 0 0 4px color-mix(in srgb, var(--gold) 45%, transparent)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 600 });
    markTags();
  };
  const drawTags = () => {
    const box = tbody.querySelector('.tl-tags'); if (!box) return;
    const L = tagsReady();
    const list = ui.q.trim() ? searchTags(ui.q) : L.cat[ui.cat].tags.map(([en, zh, n]) => ({ en, zh, n, cat: L.cat[ui.cat] }));
    box.innerHTML = list.length ? list.map(t => `<button class="tl-tag" draggable="true" data-t="${esc(t.en)}" title="${ui.q ? esc(t.cat.group.name + '・' + t.cat.name) : esc(t.en)}">${fmt(t)}</button>`).join('')
      : '<p class="muted small">找不到符合的 TAG</p>';
    box.querySelectorAll('.tl-tag').forEach(t => {
      t.onclick = () => toggleTag(t.dataset.t);
      t.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-nj-tags', t.dataset.t); e.dataTransfer.setData('text/plain', t.dataset.t); });
    });
    markTags();
  };
  const drawLib = () => {
    tl.classList.toggle('hidden', !ui.panel);
    body.querySelectorAll('.pz-lib').forEach(x => { x.classList.toggle('on', x.dataset.p === ui.panel); x.setAttribute('aria-expanded', x.dataset.p === ui.panel); });
    if (!ui.panel) return;
    if (ui.panel === 'quick') {
      tbody.innerHTML = quickHTML();
      tbody.querySelectorAll('[data-q]').forEach(x => x.onclick = () => { ui.quick = +x.dataset.q; drawLib(); });
      tbody.querySelectorAll('.lib-chip').forEach(c => {
        c.onclick = () => { const ta = target(), cur = ta.value.trim().replace(/,\s*$/, ''); setVal(ta, cur ? `${cur}, ${c.dataset.tags}` : c.dataset.tags); };
        c.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-nj-tags', c.dataset.tags); e.dataTransfer.setData('text/plain', c.dataset.tags); });
      });
      return;
    }
    if (!tagsReady()) { tbody.innerHTML = '<p class="muted small">詞庫載入中…</p>'; loadTags().then(() => body.isConnected && drawLib()).catch(e => { tbody.innerHTML = `<p class="small">${esc(e.message)}</p>`; }); return; }
    tbody.innerHTML = danHTML();
    tbody.querySelectorAll('[data-g]').forEach(x => x.onclick = () => { ui.group = x.dataset.g; ui.cat = tagsReady().find(g => g.id === ui.group).cats[0].id; ui.q = ''; drawLib(); });
    tbody.querySelectorAll('[data-c]').forEach(x => x.onclick = () => { ui.cat = x.dataset.c; ui.q = ''; drawLib(); });
    const q = tbody.querySelector('.tl-q');
    q.oninput = () => { ui.q = q.value; tbody.querySelector('.tl-cats').classList.toggle('dim', !!ui.q.trim()); drawTags(); };
    tbody.querySelector('.tl-rule').onclick = async () => {
      const r = { id: uid('r'), cat: ui.cat, min: 1, max: 1, on: true };
      if (await editRule(r, true)) { addRule(r); toast(`已加入隨機規則「${ruleName(r)}」`, 'ok'); }
    };
    drawTags();
  };
  body.querySelectorAll('.pz-lib').forEach(x => x.onclick = () => { ui.panel = ui.panel === x.dataset.p ? '' : x.dataset.p; drawLib(); });
  tl.querySelector('.tl-close').onclick = () => { ui.panel = ''; drawLib(); };
  tl.querySelectorAll('.tl-target button').forEach(x => x.onclick = () => { ui.target = x.dataset.v; tl.querySelectorAll('.tl-target button').forEach(y => y.classList.toggle('on', y === x)); });
  for (const ta of [pos, neg]) ta?.addEventListener('input', markTags);
  drawLib();
}

// ---------- 打字時自動提示 TAG（像 NovelAI） ----------
let acBox = null;
export function attachAutocomplete(ta) {
  if (ta._ac) return; ta._ac = true;
  let items = [], idx = 0, range = null;
  const close = () => { acBox?.remove(); acBox = null; items = []; };
  const tokenAt = () => {
    const v = ta.value, c = ta.selectionStart;
    if (c !== ta.selectionEnd) return null;
    let s = Math.max(v.lastIndexOf(',', c - 1), v.lastIndexOf('|', c - 1), v.lastIndexOf('<', c - 1), v.lastIndexOf('\n', c - 1)) + 1;
    let e = c; while (e < v.length && !/[,|>\n]/.test(v[e])) e++;
    const raw = v.slice(s, c), word = raw.trimStart();
    return { s: s + (raw.length - word.length), e, word: word.trimEnd() };
  };
  const show = () => {
    const t = tokenAt();
    if (!t || !tagsReady()) return close();
    const w = t.word, cjk = /[㐀-鿿]/.test(w);
    if (w.length < (cjk ? 1 : 2) || /^artist:/i.test(w)) return close();
    items = searchTags(w, 8).filter(x => normTag(x.en) !== normTag(w));
    if (!items.length) return close();
    range = t; idx = 0;
    if (!acBox) { acBox = document.createElement('div'); acBox.className = 'ac-box'; document.body.append(acBox); }
    acBox.innerHTML = items.map((x, i) => `<button type="button" class="${i === idx ? 'on' : ''}" data-i="${i}">${fmt(x)}<em>${esc(x.cat.name)}</em></button>`).join('');
    const r = ta.getBoundingClientRect();
    acBox.style.left = Math.max(8, Math.min(innerWidth - acBox.offsetWidth - 8, r.left)) + 'px';
    acBox.style.width = Math.min(r.width, 420) + 'px';
    const below = r.bottom + 4, h = acBox.offsetHeight;
    acBox.style.top = (below + h > innerHeight - 8 ? Math.max(8, r.top - h - 4) : below) + 'px';
    acBox.querySelectorAll('button').forEach(bn => bn.onpointerdown = ev => { ev.preventDefault(); pick(+bn.dataset.i); });
  };
  const pick = i => {
    const x = items[i]; if (!x || !range) return;
    const v = ta.value, after = v.slice(range.e), sep = /^\s*[,|>]/.test(after) || range.e < v.length && /[|>]/.test(v[range.e]) ? '' : ', ';
    ta.value = v.slice(0, range.s) + x.en + sep + after.replace(/^\s+/, sep ? '' : '');
    const caret = range.s + x.en.length + sep.length;
    ta.setSelectionRange(caret, caret);
    ta.dispatchEvent(new Event('input'));
    close();
  };
  const hl = () => acBox?.querySelectorAll('button').forEach((bn, i) => bn.classList.toggle('on', i === idx));
  ta.addEventListener('focus', () => { loadTags().catch(() => { }); });
  ta.addEventListener('input', e => { if (e.isTrusted || e.inputType) show(); });
  ta.addEventListener('keydown', e => {
    if (!acBox || !items.length || e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % items.length; hl(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; hl(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(idx); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  ta.addEventListener('blur', () => setTimeout(close, 120));
  ta.addEventListener('click', () => close());
}

// ---------- 隨機規則：新增 / 編輯 ----------
async function newRule() {
  const L = await loadTags().catch(() => null);
  return modal({
    title: '新增隨機規則',
    body: `<div class="rule-pick">
      <button class="choice" data-cat="custom"><b>✎ 自訂清單</b><small>自己寫幾個選項，每次抽一個（取代舊的 &lt;A|B|C&gt; 寫法）</small></button>
      ${L ? L.map(g => `<div class="rp-group"><small>${g.icon} ${esc(g.name)}</small><div class="rp-cats">${g.cats.map(c => `<button data-cat="${c.id}">${esc(c.name)}<span>${c.tags.length}</span></button>`).join('')}</div></div>`).join('') : '<p class="muted small">詞庫載入失敗，只能用自訂清單</p>'}
    </div>`,
    onOpen: (bd, close) => bd.querySelectorAll('[data-cat]').forEach(x => x.onclick = () => close(
      x.dataset.cat === 'custom' ? { id: uid('r'), cat: 'custom', name: '', list: [], min: 1, max: 1, on: true } : { id: uid('r'), cat: x.dataset.cat, min: 1, max: 1, on: true })),
  });
}

/** 回傳 true 代表有儲存 */
async function editRule(r, isNew = false) {
  if (r.cat === 'custom') {
    const res = await modal({
      title: isNew ? '自訂清單' : '編輯自訂清單',
      body: `<div class="new-album">
        <label class="fld"><span>名稱</span><input class="field" name="name" maxlength="16" value="${esc(r.name || '')}" placeholder="例如 服裝、場景"></label>
        <label class="fld"><span>選項 <em>一行一個；一個選項可以是好幾個 TAG（用逗號分開，會一起出現）</em></span><textarea class="field" name="list" rows="7" placeholder="gothic dress\nwhite dress\nwitch hat, robe">${esc((r.list || []).join('\n'))}</textarea></label>
        <div class="rr-n"><span>每次抽</span><input class="field num" name="min" type="number" min="0" max="20" value="${r.min ?? 1}"><span>～</span><input class="field num" name="max" type="number" min="0" max="20" value="${r.max ?? 1}"><span>個</span></div></div>`,
      actions: [{ label: '取消', value: null, kind: 'ghost' }, { label: '儲存', kind: 'primary', value: bd => ({
        name: bd.querySelector('[name=name]').value.trim(), list: bd.querySelector('[name=list]').value.split('\n').map(s => s.trim().replace(/,\s*$/, '')).filter(Boolean),
        min: +bd.querySelector('[name=min]').value || 0, max: +bd.querySelector('[name=max]').value || 0 }) }],
    });
    if (!res || !res.list.length) return false;
    Object.assign(r, res, { name: res.name || res.list.slice(0, 2).join(' / '), max: Math.max(res.min, res.max) });
    return true;
  }
  const L = await loadTags(), c = L.cat[r.cat];
  if (!c) return false;
  const sel = new Set(r.pool?.length ? r.pool : []);
  const res = await modal({
    title: `${c.group.name}・${c.name}`,
    body: `<div class="rule-edit">
      <p class="muted small">不勾任何一個 = 從整個詞庫（${c.tags.length} 個）抽。只想從其中幾個抽的話，勾起來就好。</p>
      <div class="rr-n"><span>每次抽</span><input class="field num" name="min" type="number" min="0" max="20" value="${r.min ?? 1}"><span>～</span><input class="field num" name="max" type="number" min="0" max="20" value="${r.max ?? 1}"><span>個</span></div>
      <div class="re-bar"><label class="lib-search">${ICON.search || '⌕'}<input class="field re-q" placeholder="篩選" autocomplete="off"></label>
        <button class="btn ghost small re-top">勾常用前 20</button><button class="btn ghost small re-none">全部取消</button><span class="re-n muted small"></span></div>
      <div class="re-list">${c.tags.map(([en, zh, n]) => `<label class="re-tag"><input type="checkbox" value="${esc(en)}" ${sel.has(en) ? 'checked' : ''}><b>${esc(zh)}</b><small>${esc(en)}</small><em>${fmtN(n)}</em></label>`).join('')}</div></div>`,
    actions: [{ label: '取消', value: null, kind: 'ghost' }, { label: '儲存', kind: 'primary', value: bd => ({
      pool: [...bd.querySelectorAll('.re-tag input:checked')].map(x => x.value), min: +bd.querySelector('[name=min]').value || 0, max: +bd.querySelector('[name=max]').value || 0 }) }],
    onOpen: bd => {
      const cnt = () => { const n = bd.querySelectorAll('.re-tag input:checked').length; bd.querySelector('.re-n').textContent = n ? `已勾 ${n} 個` : `從全部 ${c.tags.length} 個抽`; };
      bd.querySelector('.re-list').onchange = cnt; cnt();
      bd.querySelector('.re-q').oninput = e => { const q = e.target.value.trim().toLowerCase(); bd.querySelectorAll('.re-tag').forEach(t => { t.hidden = q && !t.textContent.toLowerCase().includes(q); }); };
      bd.querySelector('.re-none').onclick = () => { bd.querySelectorAll('.re-tag input').forEach(x => { x.checked = false; }); cnt(); };
      bd.querySelector('.re-top').onclick = () => { bd.querySelectorAll('.re-tag input').forEach((x, i) => { x.checked = i < 20; }); cnt(); };
    },
  });
  if (!res) return false;
  r.pool = res.pool.length ? res.pool : null; r.min = res.min; r.max = Math.max(res.min, res.max);
  return true;
}

// ---------- 智慧翻譯 ----------
let lastMode = 'tags';
function translateDialog(pos) {
  const ai = aiReady();
  return modal({
    title: '✨ 智慧翻譯',
    body: `<div class="tr-box">
      <label class="fld"><span>用中文描述你想要的畫面</span><textarea class="field tr-in" rows="4" placeholder="例：銀色長髮的精靈少女，穿著白色洋裝，在月光下的花田裡回頭微笑，上半身"></textarea></label>
      <div class="fld"><span>翻成</span><div class="seg small tr-mode">${MODES.map(([v, n]) => `<button data-v="${v}" class="${v === lastMode ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="row wrap"><button class="btn small tr-dict">${ICON.book}詞庫對照（離線）</button><button class="btn primary small tr-ai" ${ai ? '' : 'disabled'}>${ICON.sparkles}AI 翻譯</button>
        ${ai ? '' : '<small class="muted">AI 翻譯要先到「設定 → 連線 → 智慧翻譯」填自己的金鑰</small>'}</div>
      <div class="tr-hits"></div>
      <label class="fld"><span>結果 <em>可以直接修改</em></span><textarea class="field tr-out" rows="4"></textarea></label>
      <p class="muted small">「詞庫對照」只會把詞庫裡有的中文名換成 Danbooru TAG，不會造句；要寫成英文 / 日文句子請用 AI 翻譯。NovelAI V4.5 / V5 都看得懂自然語句，英文效果最好。</p></div>`,
    actions: [{ label: '關閉', value: null, kind: 'ghost' }, { label: '加到圖片提示詞', kind: 'primary', value: bd => bd.querySelector('.tr-out').value.trim() }],
    onOpen: bd => {
      const inp = bd.querySelector('.tr-in'), out = bd.querySelector('.tr-out'), hits = bd.querySelector('.tr-hits');
      bd.querySelectorAll('.tr-mode button').forEach(x => x.onclick = () => { lastMode = x.dataset.v; bd.querySelectorAll('.tr-mode button').forEach(y => y.classList.toggle('on', y === x)); });
      const dict = async () => {
        const r = await offlineTranslate(inp.value);
        hits.innerHTML = r.hits.length ? `<small class="muted">對到：</small>${r.hits.map(([z, e]) => `<span class="chip">${esc(z)} → ${esc(e)}</span>`).join('')}${r.rest ? `<small class="muted tr-rest">沒對到：${esc(r.rest)}</small>` : ''}` : '<small class="muted">詞庫裡沒有對到任何詞</small>';
        return r;
      };
      bd.querySelector('.tr-dict').onclick = async () => { if (!inp.value.trim()) return inp.focus(); const r = await dict(); out.value = r.tags.join(', '); };
      bd.querySelector('.tr-ai').onclick = async e => {
        if (!inp.value.trim()) return inp.focus();
        const btn = e.currentTarget; btn.disabled = true; out.value = '翻譯中…';
        try { const r = await dict(); out.value = await aiTranslate(inp.value, lastMode, r.tags); }
        catch (err) { out.value = ''; toast(err.message, 'error', 6000); }
        finally { btn.disabled = false; }
      };
      setTimeout(() => inp.focus(), 50);
    },
  }).then(v => {
    if (!v) return;
    const cur = pos.value.trim().replace(/,\s*$/, '');
    pos.value = cur ? `${cur}, ${v}` : v;
    pos.dispatchEvent(new Event('input'));
  });
}

