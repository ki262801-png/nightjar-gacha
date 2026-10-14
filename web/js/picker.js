// 從收藏挑一張卡（或上傳）：左邊依卡冊分類（全部 / 待收納 / 每本卡冊），右邊可再篩稀有度、搜尋卡名
import { h, esc, modal, blobURL, pickFiles, ICON } from './util.js';
import { allCards, addCard } from './store.js';
import { db } from './db.js';

let lastShelf = 'all';     // 記住上次看的卡冊

/** 回傳卡片物件；withLives 時也能選「LIVE 動態作品」，回傳 { pickedLive } */
export async function pickCard(title = '選擇卡片', { allowUpload = true, withLives = false } = {}) {
  const cards = (await allCards()).sort((a, b) => b.createdAt - a.createdAt);
  const albums = (await db.all('albums')).sort((a, b) => (a.order ?? 1e15 + a.createdAt) - (b.order ?? 1e15 + b.createdAt));
  const perPage = a => (a.orient === 'landscape' ? 6 : 9);
  const lives = withLives ? (await db.all('lives')).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)) : [];
  if (lastShelf === 'lives' && !withLives) lastShelf = 'all';
  if (!['all', 'loose', 'lives'].includes(lastShelf) && !albums.some(a => a.id === lastShelf)) lastShelf = 'all';
  const shelves = [
    { id: 'all', name: '全部卡片', n: cards.length, cls: 'all' },
    ...(withLives ? [{ id: 'lives', name: 'LIVE 動態作品', n: lives.length, cls: 'lives' }] : []),
    { id: 'loose', name: '待收納', n: cards.filter(c => !c.albumId).length, cls: 'loose' },
    ...albums.map(a => ({ id: a.id, name: a.name, n: cards.filter(c => c.albumId === a.id).length, color: a.color })),
  ];
  const tile = c => `<button class="bg-tile" data-id="${c.id}" data-r="${c.rarity}"><img src="${blobURL('thumb:' + c.id, c.thumb)}" alt="" loading="lazy"><span>${esc(c.name)}</span><em>${c.rarity}</em>${c.liveId || c.craft ? `<i class="pk-tags">${c.liveId ? '<b>LIVE</b>' : ''}${c.craft ? '<b>✦ 閃卡</b>' : ''}</i>` : ''}</button>`;
  const liveTile = l => `<button class="bg-tile" data-live="${l.id}"><img src="${blobURL('live:' + l.id, l.thumb)}" alt="" loading="lazy"><span>${esc(l.name)}</span><i class="pk-tags"><b>LIVE</b>${(l.parts || []).length ? `<b>${l.parts.length} 部件</b>` : ''}${l.depth ? '<b>3D</b>' : ''}</i></button>`;
  const body = h(`<div class="bg-picker pick-shelf">
    <aside class="ps-albums">${shelves.map(s => `<button class="ps-album ${s.id === lastShelf ? 'on' : ''} ${s.cls || ''}" data-shelf="${s.id}">
      <i class="ps-dot ${s.color ? 'c-' + s.color : ''}"></i><span>${esc(s.name)}</span><b>${s.n}</b></button>`).join('')}</aside>
    <div class="ps-main">
      <div class="ps-tools"><div class="filter-row seg small">${['全部', 'SSR', 'SR', 'R'].map((r, i) => `<button class="${i ? '' : 'on'}" data-r="${r}">${r}</button>`).join('')}</div>
        <input class="field ps-search" placeholder="搜尋卡名" autocomplete="off"></div>
      <div class="ps-grid"></div>
    </div></div>`);
  let rar = '全部', query = '';
  const render = () => {
    const grid = body.querySelector('.ps-grid');
    const ok = c => (rar === '全部' || c.rarity === rar) && (!query || (c.name || '').toLowerCase().includes(query));
    let html = '';
    if (lastShelf === 'lives') {
      const list = lives.filter(l => !query || (l.name || '').toLowerCase().includes(query));
      html = `<p class="muted small ps-note">做好的動態作品：點一下回到工坊繼續修改（部件、深度、特效、圖層都會還原）</p><div class="bg-grid">${list.map(liveTile).join('')}</div>` + (list.length ? '' : '<p class="muted pad">還沒有保存的動態作品</p>');
    } else if (lastShelf === 'all' || lastShelf === 'loose') {
      const list = cards.filter(c => (lastShelf === 'all' || !c.albumId) && ok(c));
      html = `<div class="bg-grid">${allowUpload ? `<button class="bg-tile upload">${ICON.upload}<span>上傳圖片</span></button>` : ''}${list.map(tile).join('')}</div>`
        + (list.length ? '' : `<p class="muted pad">${lastShelf === 'loose' ? '待收納區是空的' : '沒有符合的卡片'}</p>`);
    } else {
      // 卡冊：照卡袋順序排，每一頁一個小標題
      const album = albums.find(a => a.id === lastShelf), pp = perPage(album);
      const list = cards.filter(c => c.albumId === album.id && ok(c)).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
      const pages = new Map();
      for (const c of list) { const p = Math.floor((c.slot ?? 0) / pp); if (!pages.has(p)) pages.set(p, []); pages.get(p).push(c); }
      html = [...pages].map(([p, cs]) => `<h5 class="pick-h">第 ${p + 1} 頁</h5><div class="bg-grid">${cs.map(tile).join('')}</div>`).join('')
        || '<p class="muted pad">這本卡冊還沒有符合的卡片</p>';
    }
    grid.innerHTML = html;
    grid.scrollTop = 0;
    grid.querySelectorAll('.bg-tile[data-id]').forEach(t => t.onclick = () => body._close(cards.find(c => c.id === t.dataset.id)));
    grid.querySelectorAll('.bg-tile[data-live]').forEach(t => t.onclick = () => body._close({ pickedLive: t.dataset.live }));
    grid.querySelector('.upload')?.addEventListener('click', async () => {
      const [file] = await pickFiles('image/*');
      if (!file) return;
      body._close(await addCard({ blob: file, rarity: 'R', name: file.name.replace(/\.\w+$/, ''), source: 'upload' }));
    });
  };
  return modal({
    title, body, wide: true,
    onOpen: (b, close) => {
      body._close = close;
      b.querySelectorAll('.ps-album').forEach(btn => btn.onclick = () => {
        lastShelf = btn.dataset.shelf;
        b.querySelectorAll('.ps-album').forEach(x => x.classList.toggle('on', x === btn));
        render();
      });
      b.querySelectorAll('.filter-row button').forEach(btn => btn.onclick = () => {
        rar = btn.dataset.r;
        b.querySelectorAll('.filter-row button').forEach(x => x.classList.toggle('on', x === btn));
        render();
      });
      const search = b.querySelector('.ps-search');
      search.oninput = () => { query = search.value.trim().toLowerCase(); render(); };
      render();
    },
  });
}
