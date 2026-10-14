// 卡冊：書架 → 打開的雙頁卡冊 → 放大單頁；直式 / 橫式卡冊；把卡片拖進透明卡袋
import { h, esc, uid, toast, modal, promptBox, confirmBox, sparkle, pickFiles, sleep, reducedMotion, clamp, ICON } from '../util.js';
import { db } from '../db.js';
import { on, allCards, addCard, updateCard } from '../store.js';
import { cardEl, cardInBox, aspectOf, fitBox, ornament } from '../cards.js';
import { openCardDetail } from '../carddetail.js';
import { shotKey, renderCraftShot } from '../holo.js';

const COLORS = [['crimson', '緋紅'], ['navy', '深藍'], ['forest', '墨綠'], ['ivory', '象牙'], ['plum', '紫晶'], ['walnut', '胡桃']];
const LAYOUT = {
  portrait: { cols: 3, rows: 3, pocketAr: 2 / 3, pageAr: .66, name: '直式' },
  landscape: { cols: 2, rows: 3, pocketAr: 3 / 2, pageAr: .94, name: '橫式' },
};
let el, albums = [], albumId = null, page = 0, mode = 'shelf', cards = [], trayMode = 'loose', rarFilter = '全部', off = [], busy = false;
let trayOpen = false, seenLoose = -1, flipping = false, renderLater = false;
const cur = () => albums.find(a => a.id === albumId) || albums[0];
const lay = () => LAYOUT[cur()?.orient] || LAYOUT.portrait;
const perPage = () => lay().cols * lay().rows;
const pps = () => (mode === 'page' || innerWidth < 900 ? 1 : 2);

export async function mount(root) {
  el = h(`<section class="view album" data-mode="shelf">
    <div class="album-top">
      <div class="at-shelf"><h2 class="view-title">${ICON.book}書架</h2>${ornament('shelf-deco')}<span class="muted">點一本卡冊打開</span></div>
      <div class="at-open">
        <button class="btn ghost small back-shelf">${ICON.left}書架</button>
        <h2 class="view-title album-name"></h2><span class="chip orient-chip"></span>
        <div class="seg small zoom-seg"><button data-z="spread">雙頁</button><button data-z="page">${ICON.target}放大單頁</button></div>
      </div>
      <div class="album-tools">
        <div class="zoom-ctl"><button class="icon-btn ghost small zoom-out" title="縮小">−</button><button class="btn ghost small zoom-reset" title="回到 100%（雙擊卡冊空白處也可以）">100%</button><button class="icon-btn ghost small zoom-in" title="放大">+</button></div>
        <div class="seg small orient-seg" title="卡袋方向"><button data-o="portrait">直式</button><button data-o="landscape">橫式</button></div>
        <button class="btn ghost small rename">${ICON.edit}改名</button>
        <div class="color-dots">${COLORS.map(([c, n]) => `<button class="dot c-${c}" data-color="${c}" title="${n}"></button>`).join('')}</div>
        <button class="btn ghost small danger del-album" title="刪除卡冊">${ICON.trash}</button>
      </div>
    </div>
    <div class="shelf-view"></div>
    <aside class="mini-shelf" aria-label="切換卡冊"></aside>
    <div class="binder-wrap">
      <button class="page-nav prev" aria-label="上一頁">${ICON.left}</button>
      <div class="binder"><div class="cover-edge"></div><div class="pages"></div></div>
      <button class="page-nav next" aria-label="下一頁">${ICON.right}</button>
    </div>
    <div class="tray panel">
      <button class="tray-handle" title="打開 / 收起待收納抽屜"><i class="th-chev"></i><span>待收納</span><b class="n-loose2"></b></button>
      <div class="tray-head">
        <div class="seg small"><button data-mode="loose">待收納 <b class="n-loose"></b></button><button data-mode="all">全部卡片 <b class="n-all"></b></button></div>
        <span class="muted tray-hint">按住卡片拖進卡袋；拖回抽屜就會取出；在頁面空白處拖曳可以翻頁</span>
        <div class="tray-tools">
          <div class="seg small rar-filter">${['全部', 'SSR', 'SR', 'R'].map(r => `<button data-r="${r}">${r}</button>`).join('')}</div>
          <button class="btn ghost small expand-tray" title="展開成多列，方便看全部">${ICON.layers}<span>展開</span></button>
          <button class="btn ghost small import">${ICON.upload}匯入圖片</button>
        </div>
      </div>
      <div class="tray-cards"></div>
    </div>
  </section>`);
  root.append(el);
  el.querySelector('.prev').onclick = () => turn(-1);
  el.querySelector('.next').onclick = () => turn(1);
  el.querySelector('.back-shelf').onclick = closeAlbum;
  el.querySelectorAll('.zoom-seg button').forEach(b => b.onclick = () => setZoom(b.dataset.z));
  el.querySelector('.rename').onclick = renameAlbum;
  el.querySelectorAll('.orient-seg button').forEach(b => b.onclick = () => changeOrient(b.dataset.o));
  el.querySelector('.zoom-in').onclick = () => zoomBy(1.25);
  el.querySelector('.zoom-out').onclick = () => zoomBy(.8);
  el.querySelector('.zoom-reset').onclick = resetView;
  wireZoomPan();
  el.querySelector('.del-album').onclick = deleteAlbum;
  el.querySelectorAll('.color-dots .dot').forEach(d => d.onclick = async () => { const a = cur(); a.color = d.dataset.color; await db.put('albums', a); renderBinderShell(); });
  el.querySelectorAll('.tray-head .seg button').forEach(b => b.onclick = () => { trayMode = b.dataset.mode; renderTray(); });
  el.querySelector('.import').onclick = importImages;
  el.querySelectorAll('.rar-filter button').forEach(b => b.onclick = () => { rarFilter = b.dataset.r; renderTray(); });
  el.querySelector('.tray-handle').onclick = () => setTray(!trayOpen);
  el.querySelector('.expand-tray').onclick = () => {
    const t = el.querySelector('.tray'); t.classList.toggle('expanded');
    el.querySelector('.expand-tray span').textContent = t.classList.contains('expanded') ? '收合' : '展開';
  };
  // 滾輪上下滾 = 待收納區左右捲動（沒有展開時）
  const trayBox = el.querySelector('.tray-cards');
  trayBox.addEventListener('wheel', e => {
    if (el.querySelector('.tray').classList.contains('expanded') || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault(); trayBox.scrollLeft += e.deltaY;
  }, { passive: false });
  off.push(on('cards', () => { if (!busy) refresh(); }));
  const ro = new ResizeObserver(() => { if (mode === 'shelf') return; if (flipping) renderLater = true; else renderPages(); });   // 翻頁中途先不重畫
  ro.observe(el.querySelector('.binder-wrap')); off.push(() => ro.disconnect());
  const onKey = e => {
    if (e.target.closest('input,textarea') || document.querySelector('.modal-wrap')) return;
    if (mode === 'shelf') return;
    if (e.key === 'ArrowLeft') turn(-1);
    if (e.key === 'ArrowRight') turn(1);
    if (e.key === 'Escape') mode === 'page' && !isMobile() ? setZoom('spread') : closeAlbum();
  };
  addEventListener('keydown', onKey); off.push(() => removeEventListener('keydown', onKey));
  await refresh();
  setMode(mode === 'shelf' || !albumId ? 'shelf' : mode);
}

export function unmount() { off.forEach(f => f()); off = []; }

async function refresh() {
  albums = (await db.all('albums')).sort((a, b) => (a.order ?? 1e15 + a.createdAt) - (b.order ?? 1e15 + b.createdAt));
  albums.forEach(a => { a.orient ??= 'portrait'; });
  if (albumId && !albums.find(a => a.id === albumId)) { albumId = null; mode = 'shelf'; }
  cards = await allCards();
  refreshStaleShots();
  if (mode === 'shelf') renderShelf();
  else { renderBinderShell(); renderPages(); }
  renderTray();
}

const reshooting = new Set();
async function refreshStaleShots() {
  const stale = cards.filter(c => c.craft && c.craftShot && c.craftShotKey !== shotKey(c) && !reshooting.has(c.id));
  for (const c of stale) {
    reshooting.add(c.id);
    try {
      const shot = await renderCraftShot(c);
      if (shot) await updateCard(c.id, { craftShot: shot, craftShotAt: Date.now(), craftShotKey: shotKey(c) });
    } catch { }
    reshooting.delete(c.id);
  }
}

function setMode(m) {
  mode = m;
  resetView();
  el.dataset.mode = m;
  if (m === 'shelf') renderShelf();
  else { renderBinderShell(); renderPages(); renderTray(); }
  el.querySelectorAll('.zoom-seg button').forEach(b => b.classList.toggle('on', b.dataset.z === m));
  setTimeout(() => dispatchEvent(new Event('pills:refresh')), 30);
}

// ---------- 書架 ----------
function renderShelf() {
  const box = el.querySelector('.shelf-view');
  const per = Math.max(3, Math.floor((box.clientWidth || innerWidth - 200) / 110));
  const items = [...albums.map(a => ({ a })), { add: true }];
  const rows = [];
  for (let i = 0; i < items.length; i += per) rows.push(items.slice(i, i + per));
  if (rows.length < 2) rows.push([]);
  box.innerHTML = `<div class="bookcase">${rows.map(row => `<div class="shelf-row"><div class="shelf-books">${row.map(it => it.add
    ? `<button class="book add" title="新增卡冊">${ICON.plus}<span>新卡冊</span></button>`
    : bookHTML(it.a)).join('')}</div><div class="shelf-board"></div></div>`).join('')}</div>`;
  box.querySelectorAll('.book[data-id]').forEach(b => b.addEventListener('pointerdown', e => bookPointer(e, b)));
  box.querySelector('.book.add').onclick = newAlbum;
}

function bookHTML(a) {
  const n = cards.filter(c => c.albumId === a.id).length;
  const ssr = cards.filter(c => c.albumId === a.id && c.rarity === 'SSR').length;
  return `<button class="book c-${a.color} o-${a.orient}" data-id="${a.id}" title="${esc(a.name)}">
    <i class="book-band"></i><span class="book-title">${esc(a.name)}</span>
    <span class="book-meta">${n}${ssr ? ` · ✦${ssr}` : ''}</span><i class="book-band b2"></i>
    <span class="book-orient">${LAYOUT[a.orient].name}</span></button>`;
}

async function newAlbum() {
  const body = h(`<div class="new-album">
    <label class="fld"><span>名稱</span><input class="field" name="name" value="新的卡冊" maxlength="16"></label>
    <div class="fld"><span>版式 <em>決定卡袋的方向</em></span><div class="orient-pick">
      <button class="on" data-o="portrait"><i class="op-p"></i><b>直式</b><small>3×3 直卡袋，放直圖</small></button>
      <button data-o="landscape"><i class="op-l"></i><b>橫式</b><small>2×3 橫卡袋，放橫圖</small></button></div></div>
    <div class="fld"><span>封面顏色</span><div class="color-dots">${COLORS.map(([c, n], i) => `<button class="dot c-${c} ${i === albums.length % COLORS.length ? 'on' : ''}" data-color="${c}" title="${n}"></button>`).join('')}</div></div>
  </div>`);
  const res = await modal({
    title: '新增卡冊', body,
    actions: [{ label: '取消', value: null, kind: 'ghost' }, {
      label: '建立', kind: 'primary', value: b => ({
        name: b.querySelector('[name=name]').value.trim() || '新的卡冊',
        orient: b.querySelector('.orient-pick .on').dataset.o,
        color: b.querySelector('.color-dots .on')?.dataset.color || 'crimson',
      }),
    }],
    onOpen: b => {
      b.querySelectorAll('.orient-pick button').forEach(x => x.onclick = () => b.querySelectorAll('.orient-pick button').forEach(y => y.classList.toggle('on', y === x)));
      b.querySelectorAll('.color-dots .dot').forEach(x => x.onclick = () => b.querySelectorAll('.color-dots .dot').forEach(y => y.classList.toggle('on', y === x)));
    },
  });
  if (!res) return;
  await db.put('albums', { id: uid('album-'), ...res, order: albums.length, createdAt: Date.now() });
  await refresh();
}

const isMobile = () => document.documentElement.dataset.layout === 'mobile';
async function openAlbum(id, bookEl) {
  albumId = id; page = 0;
  const from = bookEl?.getBoundingClientRect();
  setMode(isMobile() ? 'page' : 'spread');   // 手機一次看一頁，卡片才夠大
  if (!from || reducedMotion()) return;
  // 書從書架抽出、放大成打開的卡冊
  const binder = el.querySelector('.binder');
  const to = binder.getBoundingClientRect();
  binder.animate([
    { transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / to.width},${from.height / to.height})`, opacity: .6, borderRadius: '6px' },
    { transform: 'none', opacity: 1 },
  ], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
  el.querySelector('.pages').animate([{ transform: 'scaleX(.05)', opacity: 0 }, { transform: 'scaleX(.05)', opacity: 0, offset: .4 }, { transform: 'none', opacity: 1 }], { duration: 640, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

async function closeAlbum() {
  if (busy) return;
  const binder = el.querySelector('.binder');
  if (!reducedMotion()) await binder.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.35) translateY(30%)', opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => { });
  binder.getAnimations().forEach(a => a.cancel());
  setMode('shelf');
  if (!reducedMotion()) {
    const book = el.querySelector(`.book[data-id="${albumId}"]`);
    book?.animate([{ transform: 'translateY(-26px) scale(1.06)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  }
}

function setZoom(z) {
  if (z === mode || (z === 'spread' && isMobile())) return;   // 手機只看單頁
  if (z === 'spread') page -= page % 2;
  setMode(z);
  if (!reducedMotion()) el.querySelector('.binder').animate([{ transform: z === 'page' ? 'scale(.82)' : 'scale(1.12)', opacity: .6 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

// ---------- 打開的卡冊 ----------
// ---------- 書架上拖曳卡冊排序 ----------
function bookPointer(e, book) {
  if (e.button !== 0) return;
  const sx = e.clientX, sy = e.clientY;
  let dragging = false, target = null;
  const books = [...el.querySelectorAll('.shelf-view .book[data-id]')];
  const move = ev => {
    if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
    dragging = true;
    book.classList.add('dragging-book');
    book.style.transform = `translate(${ev.clientX - sx}px, ${ev.clientY - sy - 18}px) rotate(${Math.max(-8, Math.min(8, (ev.clientX - sx) / 30))}deg)`;
    // 找最靠近游標的另一本書，插到它的左邊或右邊
    let best = null, bd = 1e9;
    for (const b of books) {
      if (b === book) continue;
      const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = Math.hypot(ev.clientX - cx, (ev.clientY - cy) * 1.5);
      if (d < bd) { bd = d; best = { b, after: ev.clientX > cx }; }
    }
    books.forEach(b => b.classList.remove('ins-before', 'ins-after'));
    target = best && bd < 260 ? best : null;
    if (target) target.b.classList.add(target.after ? 'ins-after' : 'ins-before');
  };
  const up = async () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    books.forEach(b => b.classList.remove('ins-before', 'ins-after'));
    if (!dragging) return openAlbum(book.dataset.id, book);
    book.classList.remove('dragging-book'); book.style.transform = '';
    if (!target) return;
    const list = [...albums], from = list.findIndex(a => a.id === book.dataset.id);
    const [m] = list.splice(from, 1);
    let to = list.findIndex(a => a.id === target.b.dataset.id) + (target.after ? 1 : 0);
    list.splice(to, 0, m);
    for (let i = 0; i < list.length; i++) if (list[i].order !== i) { list[i].order = i; await db.put('albums', list[i]); }
    albums = list;
    renderShelf();
    el.querySelector(`.book[data-id="${m.id}"]`)?.animate([{ transform: 'translateY(-16px) scale(1.05)' }, { transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
}

// ---------- 打開卡冊時左邊的小書架：直接切換卡冊，也能把卡片拖到書背上收進去 ----------
function renderMiniShelf() {
  const box = el.querySelector('.mini-shelf');
  if (!box) return;
  box.innerHTML = `<div class="ms-books">${albums.map(a => `<button class="mini-book c-${a.color} ${a.id === albumId ? 'on' : ''}" data-id="${a.id}" title="${esc(a.name)}（${LAYOUT[a.orient || 'portrait'].name} · ${cards.filter(c => c.albumId === a.id).length} 張）">
    <i class="mb-band"></i><span>${esc(a.name)}</span><small>${cards.filter(c => c.albumId === a.id).length}</small>${a.orient === 'landscape' ? '<em class="mb-l"></em>' : ''}</button>`).join('')}
    <button class="mini-book add" title="新增卡冊">${ICON.plus}</button></div><div class="ms-board"></div>`;
  box.querySelectorAll('.mini-book[data-id]').forEach(b => b.onclick = () => switchAlbum(b.dataset.id));
  box.querySelector('.mini-book.add').onclick = newAlbum;
}

async function switchAlbum(id) {
  if (id === albumId || busy) return;
  const binder = el.querySelector('.binder');
  if (!reducedMotion()) await binder.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-30px) scale(.97)' }], { duration: 160, easing: 'ease-in' }).finished;
  albumId = id; page = 0;
  setMode(mode);
  if (!reducedMotion()) binder.animate([{ opacity: 0, transform: 'translateX(30px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

/** 卡片丟到小書架的書背上：放進那本卡冊的第一個空卡袋 */
async function fileIntoAlbum(card, toId) {
  const target = albums.find(a => a.id === toId);
  const used = new Set(cards.filter(c => c.albumId === toId && c.id !== card.id).map(c => c.slot));
  let slot = 0; while (used.has(slot)) slot++;
  await updateCard(card.id, { albumId: toId, slot });
  cards = await allCards();
  renderPages(); renderTray(); renderBinderShell();
  toast(`已收進「${target.name}」第 ${Math.floor(slot / (LAYOUT[target.orient || 'portrait'].cols * LAYOUT[target.orient || 'portrait'].rows)) + 1} 頁`, 'ok', 2200);
}

function renderBinderShell() {
  renderMiniShelf();
  const a = cur();
  if (!a) return;
  el.querySelector('.binder').dataset.color = a.color;
  el.querySelector('.album-name').textContent = a.name;
  el.querySelector('.orient-chip').textContent = `${LAYOUT[a.orient].name} · ${cards.filter(c => c.albumId === a.id).length} 張`;
  el.querySelectorAll('.album-tools .color-dots .dot').forEach(d => d.classList.toggle('on', d.dataset.color === a.color));
  el.querySelectorAll('.orient-seg button').forEach(b => b.classList.toggle('on', b.dataset.o === a.orient));
}

function pageCount() {
  const mine = cards.filter(c => c.albumId === albumId);
  const maxSlot = mine.reduce((m, c) => Math.max(m, c.slot ?? 0), -1);
  let n = Math.max(2, Math.floor((maxSlot + 1) / perPage()) + 2);
  if (n % 2) n++;
  return n;
}

/** 做出一頁；live = false 時是翻頁動畫用的靜態複本（卡片不能拖） */
function buildPage(pageIdx, side, live = true) {
  const L = lay();
  const bySlot = new Map(cards.filter(c => c.albumId === albumId).map(c => [c.slot, c]));
  const pg = h(`<div class="page ${side}"><div class="pockets"></div><div class="page-no">— ${pageIdx + 1} —</div>
    ${live && mode === 'spread' ? `<button class="page-zoom icon-btn ghost" title="放大這一頁">${ICON.target}</button>` : ''}</div>`);
  const pockets = pg.querySelector('.pockets');
  for (let i = 0; i < perPage(); i++) {
    const slot = pageIdx * perPage() + i;
    const pocket = h(`<div class="pocket" ${live ? `data-slot="${slot}"` : ''}><div class="pocket-card"></div><div class="sleeve"></div></div>`);
    const card = bySlot.get(slot);
    if (card) {
      const node = cardInBox(card, L.pocketAr, { name: true });
      pocket.querySelector('.pocket-card').append(live ? makeDraggable(node, card, { type: 'pocket', slot }) : node);
    }
    pockets.append(pocket);
  }
  if (live) pg.querySelector('.page-zoom')?.addEventListener('click', () => { page = pageIdx; setZoom('page'); });
  return pg;
}

function renderPages() {
  if (mode === 'shelf' || !cur()) return;
  const n = pps(), total = pageCount(), L = lay();
  if (n === 2) page -= page % 2;
  page = Math.max(0, Math.min(page, total - n));
  const wrap = el.querySelector('.binder-wrap');
  const nav = isMobile() ? 2 * 38 + 8 : 2 * 64 + 36;   // 手機的翻頁鈕比較小，留給卡冊更多空間
  const availH = wrap.clientHeight - (isMobile() ? 16 : 36), availW = wrap.clientWidth - nav - (n === 2 ? 26 : 0);
  if (availH < 40) return; // 尚未排版完成，等 ResizeObserver 再畫
  const pageH = Math.max(160, Math.min(availH, availW / n / L.pageAr));
  const pagesEl = el.querySelector('.pages');
  pagesEl.innerHTML = '';
  pagesEl.classList.toggle('single', n === 1);
  pagesEl.style.setProperty('--page-h', pageH + 'px');
  pagesEl.style.setProperty('--page-ar', L.pageAr);
  pagesEl.style.setProperty('--cols', L.cols); pagesEl.style.setProperty('--rows', L.rows);
  pagesEl.style.setProperty('--pocket-ar', L.pocketAr);
  for (let k = 0; k < n; k++) {
    pagesEl.append(buildPage(page + k, n === 2 ? (k ? 'right' : 'left') : 'solo'));
    if (n === 2 && k === 0) pagesEl.append(h(`<div class="rings">${'<i></i>'.repeat(4)}</div>`));
  }
  el.querySelector('.prev').disabled = page <= 0;
  el.querySelector('.next').disabled = page + n >= total;
}

/** 翻頁：做一片「書頁」疊在要翻的那頁上，正面是目前這頁、背面是下一頁；t = 0 → 1 是翻動進度 */
function startFlip(d) {
  if (mode === 'shelf' || flipping) return null;
  const n = pps(), total = pageCount(), next = page + d * n;
  if (next < 0 || next > total - n) return null;
  const pagesEl = el.querySelector('.pages');
  const pgs = [...pagesEl.querySelectorAll(':scope > .page')];
  if (pgs.length !== n) return null;
  const blank = () => h(`<div class="page solo leaf-blank"></div>`);
  let host, front, back, under, origin = 'left', from = 0, to = -180;
  if (n === 2) {
    if (d > 0) { host = pgs[1]; front = buildPage(page + 1, 'right', false); back = buildPage(page + 2, 'left', false); under = buildPage(page + 3, 'right', false); }
    else { host = pgs[0]; front = buildPage(page, 'left', false); back = buildPage(page - 1, 'right', false); under = buildPage(page - 2, 'left', false); origin = 'right'; to = 180; }
  } else {
    host = pgs[0];
    if (d > 0) { front = buildPage(page, 'solo', false); back = blank(); under = buildPage(page + 1, 'solo', false); }
    else { front = buildPage(page - 1, 'solo', false); back = blank(); under = buildPage(page, 'solo', false); from = -180; to = 0; }
  }
  flipping = true;
  const leaf = h(`<div class="leaf"><div class="leaf-face front"></div><div class="leaf-face back"></div></div>`);
  leaf.querySelector('.front').append(front); leaf.querySelector('.back').append(back);
  Object.assign(leaf.style, { left: host.offsetLeft + 'px', top: host.offsetTop + 'px', width: host.offsetWidth + 'px', height: host.offsetHeight + 'px', transformOrigin: origin + ' center' });
  host.replaceWith(under);
  pagesEl.append(leaf);
  pagesEl.classList.add('flipping');
  let t = 0;
  const angle = tt => from + (to - from) * tt;
  const set = tt => {
    t = clamp(tt, 0, 1);
    const a = angle(t);
    leaf.style.transform = `rotateY(${a}deg)`;
    leaf.style.setProperty('--shade', Math.abs(Math.sin(a * Math.PI / 180)).toFixed(3));
  };
  set(0);
  const finish = async (complete, ms = 380) => {
    const end = complete ? 1 : 0;
    if (!reducedMotion() && ms > 0) {
      const dur = ms * Math.max(.35, Math.abs(end - t));
      const a = leaf.animate([{ transform: `rotateY(${angle(t)}deg)` }, { transform: `rotateY(${angle(end)}deg)` }], { duration: dur, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
      await Promise.race([a.finished, sleep(dur + 120)]);
    }
    pagesEl.classList.remove('flipping');
    flipping = false;
    if (complete) page = next;
    if (complete || renderLater || !under.isConnected) renderPages();
    else { under.replaceWith(host); leaf.remove(); }
    renderLater = false;
  };
  return { set, finish, get t() { return t; } };
}

async function turn(d) {
  const f = startFlip(d);
  if (f) await f.finish(true, 520);
}

function setTray(open) {
  trayOpen = open;
  el.querySelector('.tray').classList.toggle('open', open);
  seenLoose = cards.filter(c => !c.albumId).length;
}

function renderTray() {
  const loose = cards.filter(c => !c.albumId);
  el.querySelector('.n-loose').textContent = loose.length;
  el.querySelector('.n-loose2').textContent = loose.length || '';
  el.querySelector('.tray-handle').classList.toggle('has', loose.length > 0);
  // 有新的待收納卡片時自動拉開抽屜；收完了就自動收起
  if (mode !== 'shelf') {
    if (seenLoose >= 0 && loose.length > seenLoose && !trayOpen) setTray(true);
    else if (!loose.length && trayOpen && trayMode === 'loose' && !el.classList.contains('dragging')) setTray(false);
    if (seenLoose < 0) { seenLoose = loose.length; if (loose.length && !isMobile()) setTray(true); }   // 手機上抽屜會蓋住卡冊，預設收著
    seenLoose = Math.min(seenLoose, loose.length);
  }
  el.querySelector('.n-all').textContent = cards.length;
  el.querySelectorAll('.tray-head .seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === trayMode));
  el.querySelectorAll('.rar-filter button').forEach(b => b.classList.toggle('on', b.dataset.r === rarFilter));
  const list = (trayMode === 'loose' ? loose : cards).filter(c => rarFilter === '全部' || c.rarity === rarFilter);
  const box = el.querySelector('.tray-cards');
  box.innerHTML = '';
  if (!list.length) {
    box.append(h(`<div class="tray-empty"><i></i><span>${trayMode === 'loose' ? '待收納區是空的 — 新抽到的卡會先來這裡' : '還沒有任何卡片'}</span></div>`));
    return;
  }
  const ar = lay().pocketAr;
  list.forEach(c => {
    const wrap = h(`<div class="tray-slot ${c.albumId ? 'placed' : ''} ${Math.abs(aspectOf(c) - ar) > .5 ? 'mismatch' : ''}" title="${esc(c.name)}"></div>`);
    wrap.style.width = `calc(var(--tray-h) * ${aspectOf(c)})`;
    wrap.append(makeDraggable(cardEl(c, { name: true }), c, { type: 'tray' }));
    box.append(wrap);
  });
}

// ---------- 拖放 ----------
function makeDraggable(node, card, origin) {
  node.classList.add('draggable');
  node.addEventListener('pointerdown', e => {
    if (e.button !== 0 || busy) return;
    e.preventDefault();
    startPointer(e, node, card, origin);
  });
  return node;
}

function startPointer(e, node, card, origin) {
  const sx = e.clientX, sy = e.clientY;
  let drag = null, lastX = sx, vx = 0, hover = null, flipTimer = 0;
  const move = ev => {
    if (!drag) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (mode === 'shelf') return;
      drag = beginDrag(node, card, sx, sy);
      if (origin.type === 'tray') el.querySelector('.tray').classList.add('tucked');
    }
    vx = vx * .7 + (ev.clientX - lastX) * .3; lastX = ev.clientX;
    const target = hitTest(ev.clientX, ev.clientY);
    if (target !== hover) {
      hover?.classList.remove('hover'); hover = target; hover?.classList.add('hover');
      clearTimeout(flipTimer);
      if (hover?.classList.contains('page-nav')) flipTimer = setTimeout(() => { turn(hover.classList.contains('next') ? 1 : -1); hover = null; }, 550);
    }
    positionGhost(drag, ev.clientX, ev.clientY, vx, hover);
  };
  const up = async ev => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    clearTimeout(flipTimer);
    if (!drag) { openCardDetail(card.id).then(() => refresh()); return; }
    hover?.classList.remove('hover');
    await drop(drag, card, origin, hitTest(ev.clientX, ev.clientY));
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

/** 卡片在卡袋裡的實際大小（依卡片比例放進卡袋框） */
function boxInPocket(card, r) {
  const { w, h: hh } = fitBox(aspectOf(card), r.width / r.height);
  const W = r.width * w / 100, H = r.height * hh / 100;
  return { W, H, x: r.left + (r.width - W) / 2, y: r.top + (r.height - H) / 2 };
}

function beginDrag(node, card, x, y) {
  const r = node.getBoundingClientRect();
  const pocket = el.querySelector('.pocket .pocket-card')?.getBoundingClientRect() || r;
  const { W, H } = boxInPocket(card, pocket);
  const ghost = cardEl(card, { name: true, cls: 'drag-ghost' });
  ghost.style.width = W + 'px'; ghost.style.height = H + 'px';
  document.getElementById('fx-root').append(ghost);
  node.classList.add('drag-src');
  el.classList.add('dragging');
  const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
  return { ghost, node, w: W, h: H, ox: fx * W, oy: fy * H, x, y, rot: 0 };
}

function hitTest(x, y) {
  const t = document.elementFromPoint(x, y);
  return t?.closest('.pocket') || t?.closest('.mini-book[data-id]') || t?.closest('.tray') || t?.closest('.page-nav:not(:disabled)') || null;
}

function positionGhost(d, x, y, vx, hover) {
  let tx = x - d.ox, ty = y - d.oy;
  d.rot = Math.max(-14, Math.min(14, vx * .9));
  let lift = 1.06;
  if (hover?.classList.contains('pocket')) {
    // 靠近卡袋時被袋口輕輕導正：對齊角度、往袋口中心吸
    const b = boxInPocket({ width: d.w, height: d.h }, hover.querySelector('.pocket-card').getBoundingClientRect());
    tx += (b.x - tx) * .35; ty += (b.y - b.H * .2 - ty) * .25;
    d.rot *= .25; lift = 1.0;
  }
  d.ghost.style.transform = `translate(${tx}px,${ty}px) rotate(${d.rot}deg) scale(${lift})`;
}

async function drop(d, card, origin, target) {
  busy = true;
  const { ghost } = d;
  const finish = () => { ghost.remove(); d.node.classList.remove('drag-src'); el.classList.remove('dragging'); el.querySelector('.tray').classList.remove('tucked'); busy = false; };
  let autoFlip = false;
  try {
    if (target?.classList.contains('pocket')) {
      const slot = +target.dataset.slot;
      const b = boxInPocket(card, target.querySelector('.pocket-card').getBoundingClientRect());
      await ghost.animate([{ transform: ghost.style.transform }, { transform: `translate(${b.x}px,${b.y - b.H * .24}px) rotate(0deg) scale(1)` }],
        { duration: reducedMotion() ? 1 : 170, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished;
      const occupant = cards.find(c => c.albumId === albumId && c.slot === slot && c.id !== card.id);
      if (occupant) {
        if (origin.type === 'pocket' && card.albumId === albumId) await updateCard(occupant.id, { slot: origin.slot });
        else await updateCard(occupant.id, { albumId: null, slot: null });
      }
      await updateCard(card.id, { albumId, slot });
      cards = await allCards();
      ghost.remove();
      renderPages(); renderTray(); renderBinderShell();
      const placed = el.querySelector(`.pocket[data-slot="${slot}"] .tcg`);
      placed?.classList.add('inserting');
      setTimeout(() => placed?.classList.remove('inserting'), 520);
      setTimeout(() => sparkle(b.x + b.W / 2, b.y + 4, { count: card.rarity === 'SSR' ? 18 : 10, spread: 60 }), 330);
      if (Math.abs(aspectOf(card) - lay().pocketAr) > .5) toast(`這張是${aspectOf(card) > 1 ? '橫' : '直'}圖，放進${lay().name}卡袋會縮小顯示；可以另開一本${aspectOf(card) > 1 ? '橫' : '直'}式卡冊`, 'info', 3600);
      if (occupant) toast(origin.type === 'pocket' ? `已和「${occupant.name}」交換位置` : `「${occupant.name}」回到待收納區`, 'info', 2200);
      // 眼前的卡袋都放滿了、還有卡片待收納：自動翻到下一頁
      if (origin.type !== 'pocket' && !occupant) {
        const n = pps(), pp = perPage(), used = new Set(cards.filter(c => c.albumId === albumId).map(c => c.slot));
        let full = true;
        for (let k = page * pp; k < (page + n) * pp; k++) if (!used.has(k)) { full = false; break; }
        if (full && cards.some(c => !c.albumId)) autoFlip = true;
      }
    } else if (target?.classList.contains('mini-book')) {
      const r = target.getBoundingClientRect();
      await ghost.animate([{ transform: ghost.style.transform, opacity: 1 }, { transform: `translate(${r.left}px,${r.top + r.height * .2}px) rotate(0deg) scale(.25)`, opacity: 0 }], { duration: 260, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).finished;
      target.animate([{ transform: 'scale(1.15)' }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.3,1.6,.5,1)' });
      await fileIntoAlbum(card, target.dataset.id);
    } else if (target?.classList.contains('tray') && card.albumId) {
      const r = el.querySelector('.tray-cards').getBoundingClientRect();
      await ghost.animate([{ transform: ghost.style.transform, opacity: 1 }, { transform: `translate(${r.left + 12}px,${r.top + 6}px) rotate(-4deg) scale(.9)`, opacity: .2 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished;
      await updateCard(card.id, { albumId: null, slot: null });
      cards = await allCards();
      renderPages(); renderTray(); renderBinderShell();
    } else {
      if (!d.node.isConnected) { await ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished; return; }
      const r = d.node.getBoundingClientRect();
      await ghost.animate([{ transform: ghost.style.transform }, { transform: `translate(${r.left}px,${r.top}px) rotate(0deg) scale(${r.width / d.w})` }], { duration: reducedMotion() ? 1 : 300, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'forwards' }).finished;
    }
  } finally { finish(); }
  if (autoFlip) { await sleep(520); toast(pps() === 2 ? '這兩頁放滿了，翻到下一頁' : '這一頁放滿了，翻到下一頁', 'info', 1600); turn(1); }
}

// ---------- 卡冊管理 ----------
async function renameAlbum() {
  const a = cur();
  const name = await promptBox('卡冊名稱', a.name);
  if (!name) return;
  a.name = name; await db.put('albums', a); renderBinderShell();
}

async function deleteAlbum() {
  const a = cur();
  if (albums.length <= 1) return toast('至少保留一本卡冊', 'warn');
  if (!await confirmBox(`刪除卡冊「${esc(a.name)}」？裡面的卡片會回到待收納區，不會被刪除。`, { ok: '刪除卡冊', danger: true })) return;
  busy = true;
  for (const c of cards.filter(c => c.albumId === a.id)) await updateCard(c.id, { albumId: null, slot: null });
  await db.del('albums', a.id);
  busy = false; albumId = null; mode = 'shelf';
  await refresh(); setMode('shelf');
}

async function importImages() {
  const files = await pickFiles('image/*', true);
  if (!files.length) return;
  busy = true;
  for (const f of files) await addCard({ blob: f, rarity: 'R', name: f.name.replace(/\.\w+$/, '').slice(0, 24), source: 'upload' });
  busy = false;
  toast(`已匯入 ${files.length} 張到待收納區`, 'ok');
  trayMode = 'loose'; refresh();
}

// ---------- 改變既有卡冊的版式 ----------
async function changeOrient(o) {
  const a = cur();
  if (!a || a.orient === o) return;
  const mine = cards.filter(c => c.albumId === a.id).sort((x, y) => x.slot - y.slot);
  if (mine.length && !await confirmBox(`把「${esc(a.name)}」改成${LAYOUT[o].name}卡冊？每頁卡袋數會改變，裡面的 ${mine.length} 張卡會依原本順序重新排好。`, { ok: `改成${LAYOUT[o].name}` })) return;
  busy = true;
  a.orient = o; await db.put('albums', a);
  for (let i = 0; i < mine.length; i++) if (mine[i].slot !== i) await updateCard(mine[i].id, { slot: i });
  busy = false; page = 0;
  cards = await allCards();
  renderBinderShell(); renderPages(); renderTray();
  toast(`已改成${LAYOUT[o].name}卡冊`, 'ok', 1800);
}

// ---------- 滾輪縮放、拖曳平移 ----------
let view = { s: 1, x: 0, y: 0 };
function applyView() {
  const b = el.querySelector('.binder');
  b.style.setProperty('--vs', view.s); b.style.setProperty('--vx', view.x + 'px'); b.style.setProperty('--vy', view.y + 'px');
  el.querySelector('.zoom-reset').textContent = Math.round(view.s * 100) + '%';
  el.querySelector('.binder-wrap').classList.toggle('zoomed', view.s !== 1 || view.x || view.y);
}
function resetView() { view = { s: 1, x: 0, y: 0 }; if (el) applyView(); }
function zoomAt(qx, qy, factor) {
  const wrap = el.querySelector('.binder-wrap').getBoundingClientRect();
  const cx = wrap.left + wrap.width / 2, cy = wrap.top + wrap.height / 2;
  const s2 = Math.min(3.5, Math.max(.5, view.s * factor));
  const lx = (qx - cx - view.x) / view.s, ly = (qy - cy - view.y) / view.s;
  view = { s: s2, x: qx - cx - lx * s2, y: qy - cy - ly * s2 };
  applyView();
}
function zoomBy(f) { const r = el.querySelector('.binder-wrap').getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); }
/** 手動翻頁：抓住頁面往書背方向拖，書頁跟著手翻起來；放開時超過一半（或甩得夠快）就翻過去 */
function pageDrag(e, pg) {
  const sx = e.clientX, W = pg.getBoundingClientRect().width;
  let f = null, d = 0, lastX = sx, lastT = performance.now(), vel = 0, dead = false;
  const move = ev => {
    const dx = ev.clientX - sx;
    if (!f && !dead) {
      if (Math.abs(dx) < 8) return;
      d = pps() === 2 ? (pg.classList.contains('right') ? 1 : -1) : (dx < 0 ? 1 : -1);
      f = startFlip(d);
      if (!f) { dead = true; return; }
      el.querySelector('.binder-wrap').classList.add('page-dragging');
    }
    if (!f) return;
    const now = performance.now();
    vel = vel * .6 + (ev.clientX - lastX) / Math.max(8, now - lastT) * .4; lastX = ev.clientX; lastT = now;
    f.set((d > 0 ? -dx : dx) / (W * 1.4));
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    el.querySelector('.binder-wrap').classList.remove('page-dragging');
    if (!f) return;
    const flick = d > 0 ? vel < -.5 : vel > .5;
    f.finish(f.t > .45 || (flick && f.t > .05));
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

function wireZoomPan() {
  const wrap = el.querySelector('.binder-wrap');
  wrap.addEventListener('wheel', e => {
    if (mode === 'shelf') return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * .0016));
  }, { passive: false });
  wrap.addEventListener('dblclick', e => { if (!e.target.closest('.tcg, .page-nav, .page-zoom')) resetView(); });
  wrap.addEventListener('pointerdown', e => {
    if (mode === 'shelf' || e.target.closest('.tcg, .page-nav, .page-zoom, button') || (e.button !== 0 && e.button !== 1)) return;
    e.preventDefault();
    const pg = e.target.closest('.pages > .page');
    if (pg && e.button === 0 && !e.shiftKey && !flipping) return pageDrag(e, pg);
    // 頁面以外的地方（或 Shift / 中鍵）按住拖曳 = 平移卡冊
    const sx = e.clientX - view.x, sy = e.clientY - view.y;
    wrap.classList.add('panning');
    const move = ev => { view.x = ev.clientX - sx; view.y = ev.clientY - sy; applyView(); };
    const up = () => { wrap.classList.remove('panning'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
}
