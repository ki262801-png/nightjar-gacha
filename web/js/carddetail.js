// 卡片詳情：依圖片比例完整顯示、命名、卡膜、稀有度標誌、閃卡工藝、加入首頁、下載、刪除
import { h, esc, modal, confirmBox, toast, download, sparkle, stripImageInfo, ICON } from './util.js';
import { db } from './db.js';
import { state, updateCard, deleteCard, addHomeSlide } from './store.js';
import { cardEl, FILMS, RARITY_STYLES, rarityBadge, aspectOf } from './cards.js';
import { modelInfo } from './nai.js';
import { HoloCard, shotKey, renderCraftShot } from './holo.js';
import { blobToCanvas, hydrateLive, LiveStage } from './live.js';
import { processDepth } from './depth.js';

/** 加入首頁：這張卡有 LIVE 動態時讓使用者選要用哪個 */
export async function chooseHomeForCard(card) {
  const lives = (await db.all('lives')).filter(l => l.cardId === card.id).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  let slide = { type: 'card', id: card.id };
  if (lives.length || card.craft) {
    const pick = await modal({
      title: '加入首頁', body: `<p class="modal-text">首頁要怎麼展示這張卡？</p>
        <div class="choice-list">${card.craft ? `<button class="choice" data-v="holo:${card.id}"><b>${ICON.sparkles} 閃卡展示</b><small>把做好的閃卡立在首頁，可以拖曳轉動、滑鼠移動時反光${card.craft.liveSync ? '，部件也會動' : ''}</small></button>` : ''}
        ${lives.map(l => `<button class="choice" data-v="live:${l.id}"><b>${ICON.play} LIVE · ${esc(l.name)}</b><small>${(l.parts || []).length} 個部件${l.depth ? ' · 3D 景深' : ''}${l.fx?.useLayers ? ' · 含圖層' : ''}</small></button>`).join('')}
        <button class="choice" data-v="card:${card.id}"><b>${ICON.image} 靜態圖片</b><small>只放這張卡的原圖</small></button></div>`,
      onOpen: (b, close) => b.querySelectorAll('.choice').forEach(c => c.onclick = () => close(c.dataset.v)),
    });
    if (!pick) return false;
    const [type, ...rest] = pick.split(':');
    slide = { type, id: rest.join(':') };
  }
  addHomeSlide(slide);
  return true;
}

export async function openCardDetail(id) {
  let card = await db.get('cards', id);
  if (!card) return;
  const album = card.albumId ? await db.get('albums', card.albumId) : null;
  const draft = { film: card.film || 'auto', rarityStyle: card.rarityStyle || 'auto', rarityScale: card.rarityScale || 0, rarity: card.rarity || 'R' };
  const ar = aspectOf(card);
  // 這張卡的 LIVE 動態作品（最近改過的優先；卡片記錄的那個排第一）
  const lives = (await db.all('lives')).filter(l => l.cardId === card.id).sort((a, b) => (b.id === card.liveId) - (a.id === card.liveId) || (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  const live = lives[0] || null;
  const startMode = live ? 'live' : card.craft ? 'holo' : 'card';
  const modeBtn = (m, label) => `<button data-m="${m}" class="${startMode === m ? 'on' : ''}">${label}</button>`;
  const body = h(`<div class="detail ${ar > 1.15 ? 'is-landscape' : ''}">
    <div class="detail-left">
      ${card.craft || live ? `<div class="row detail-modes"><div class="seg small detail-mode">${live ? modeBtn('live', `${ICON.play}LIVE 動態`) : ''}${card.craft ? modeBtn('holo', `${ICON.sparkles}閃卡工藝`) : ''}${modeBtn('card', '卡面')}</div>
        ${card.craft ? `<div class="seg small album-show" title="放在卡冊（和待收納區）時顯示哪一種"><span class="as-label">卡冊顯示</span><button data-s="holo" class="${card.show === 'holo' ? 'on' : ''}">閃卡</button><button data-s="image" class="${card.show !== 'holo' ? 'on' : ''}">原圖</button></div>` : ''}</div>` : ''}
      <div class="detail-card" style="--ar:${ar}"></div>
    </div>
    <div class="detail-info">
      <div class="detail-head"><span class="seg small rar-pick" title="改這張卡的稀有度（卡面標誌、卡膜、閃卡外框都會跟著變）">${['SSR', 'SR', 'R'].map(r => `<button data-r="${r}" class="r-${r} ${draft.rarity === r ? 'on' : ''}">${r}</button>`).join('')}</span>${card.origRarity && card.origRarity !== card.rarity ? `<small class="muted rar-orig">抽到時是 ${card.origRarity}</small>` : ''}<span class="muted">No.${String(card.serial).padStart(4, '0')} · ${card.width}×${card.height} · ${new Date(card.createdAt).toLocaleString('zh-TW')}</span></div>
      <label class="fld"><span>卡名 <em>取名卡關可以按 🎲</em></span><span class="name-row"><input class="field" name="name" maxlength="24" value="${esc(card.name)}"><button type="button" class="btn ghost small dice-name" title="隨機換一個名字（連英文名一起）">🎲</button></span></label>
      <label class="fld"><span>英文名 / 稱號 <em>首頁名牌上的大字</em></span><input class="field" name="subtitle" maxlength="28" value="${esc(card.subtitle)}" placeholder="例如 CATENA"></label>
      <label class="fld"><span>台詞 <em>首頁會以打字效果顯示</em></span><textarea class="field" name="quote" rows="2" maxlength="80" placeholder="「鎖鏈，欺騙，命運……」">${esc(card.quote)}</textarea></label>
      <div class="fld"><span>卡膜 <em class="film-hint"></em></span>
        <div class="film-grid">${FILMS.map(([fid, name]) => `<button class="film-sw ${draft.film === fid ? 'on' : ''}" data-film="${fid}"><i class="film-demo film-${fid === 'auto' ? 'laser' : fid}"></i><span>${name}</span></button>`).join('')}</div></div>
      <div class="fld"><span>稀有度標誌</span>
        <div class="rs-grid"><button class="rs-sw ${draft.rarityStyle === 'auto' ? 'on' : ''}" data-rs="auto" title="跟著設定裡的樣式；卡池關掉稀有度顯示時就不顯示"><span class="rs-demo">自動</span><small>跟隨卡池</small></button><button class="rs-sw ${draft.rarityStyle === 'none' ? 'on' : ''}" data-rs="none" title="這張卡不顯示稀有度標誌"><span class="rs-demo rs-none">—</span><small>不顯示</small></button>${RARITY_STYLES.map(([rid, name]) => `<button class="rs-sw ${draft.rarityStyle === rid ? 'on' : ''}" data-rs="${rid}" title="${name}"><span class="rs-demo r-${draft.rarity}">${rarityBadge(draft.rarity, rid)}</span><small>${name}</small></button>`).join('')}</div></div>
      <div class="fld slider"><span>標誌大小 <em>0 = 跟隨全域設定</em></span><div class="slider-row"><input type="range" class="rs-scale" min="0" max="2.4" step=".05" value="${draft.rarityScale}"><output class="num rs-scale-out">${draft.rarityScale || '全域'}</output></div></div>
      <div class="detail-place">${album ? `${ICON.album}收在「${esc(album.name)}」第 ${Math.floor(card.slot / (album.orient === 'landscape' ? 6 : 9)) + 1} 頁` : `${ICON.sparkles}在待收納區，等你放進卡冊`}</div>
      ${card.prompt ? `<details class="detail-prompt"><summary>生成資訊</summary>
        <p><b>模型</b> ${esc(card.model ? modelInfo(card.model).name : '—')}${card.seed != null ? ` · <b>Seed</b> ${card.seed}` : ''}${card.demo ? ' · 示範模式' : ''}</p>
        <p class="mono">${esc(card.prompt)}</p>${card.negative ? `<p class="mono dim">UC：${esc(card.negative)}</p>` : ''}
        <button class="btn ghost small copy-prompt">複製提示詞</button></details>` : ''}
      <div class="detail-actions">
        <button class="btn primary save">${ICON.check}儲存</button>
        <button class="btn set-home">${ICON.home}加入首頁</button>
        <a class="btn to-ws" href="#workshop?card=${card.id}">${ICON.workshop}LIVE 動態</a>
        <a class="btn to-craft" href="#workshop?card=${card.id}&tab=craft">${ICON.sparkles}閃卡工藝</a>
        <button class="btn ghost dl">${ICON.download}下載</button>
        ${album ? `<button class="btn ghost unplace">${ICON.left}取出卡冊</button>` : ''}
        <button class="btn ghost danger del" title="刪除">${ICON.trash}</button>
        <button class="btn ghost close-d">${ICON.x}關閉</button>
      </div>
    </div></div>`);

  const holder = body.querySelector('.detail-card');
  let holo = null, stage = null, mode = startMode;
  const stopLive = () => { stage?.destroy(); stage = null; };
  const showCard = () => {
    holo?.destroy(); holo = null; stopLive();
    holder.innerHTML = '';
    holder.append(cardEl({ ...card, ...draft }, { tilt: true, full: true, cls: 'big', holo: false }));
  };
  const showHolo = async () => {
    stopLive();
    holder.innerHTML = '';
    holo = new HoloCard(holder);
    const mask = card.craft.mask ? await blobToCanvas(card.craft.mask) : null;
    const depth = card.craft.depthMap ? await blobToCanvas(card.craft.depthMap) : null;
    await holo.setCard(card, card.craft, mask, depth);
    // 動態閃卡：載入對應的 LIVE 作品，卡面跟著部件動作並疊上粒子
    if (card.craft.liveSync && card.craft.liveId) {
      const live = await db.get('lives', card.craft.liveId);
      if (live) { const { parts } = await hydrateLive(live); await holo.attachLive({ image: live.image, parts, fx: live.fx || {} }); }
    }
    // 舊的閃卡還沒有截圖：補一張，卡冊才能顯示閃卡
    if (!card.craftShot || card.craftShotKey !== shotKey(card)) { const shot = await holo.capture(); if (shot) card = await updateCard(id, { craftShot: shot, craftShotAt: Date.now(), craftShotKey: shotKey(card) }); }
  };
  body.querySelectorAll('.album-show button').forEach(b => b.onclick = async () => {
    body.querySelectorAll('.album-show button').forEach(x => x.classList.toggle('on', x === b));
    card = await updateCard(id, { show: b.dataset.s });
    toast(b.dataset.s === 'holo' ? '卡冊會顯示做好的閃卡' : '卡冊會顯示原圖', 'ok', 1600);
  });
  /** LIVE 動態：和首頁一樣的播放方式（深度、部件動作、特效、圖層合成） */
  const showLive = async () => {
    holo?.destroy(); holo = null; stopLive();
    holder.innerHTML = '';
    const box = h('<div class="detail-live"></div>'); holder.append(box);
    stage = new LiveStage(box, { fit: 'contain' });
    await stage.setImage((live.fx?.useLayers && live.composite) || live.image);
    const { rawDepth, parts } = await hydrateLive(live);
    if (rawDepth) stage.setDepth(processDepth(rawDepth, live.depthOpts, live.depthOpts?.edge > 0 ? await blobToCanvas(live.image) : null));
    stage.setParts(parts);
    stage.set({ ...live.fx });
  };
  const setMode = async m => {
    mode = m;
    body.querySelectorAll('.detail-mode button').forEach(x => x.classList.toggle('on', x.dataset.m === m));
    try { await (m === 'live' ? showLive() : m === 'holo' ? showHolo() : showCard()); }
    catch (e) { toast((m === 'live' ? 'LIVE 動態' : '閃卡工藝') + '載入失敗：' + e.message, 'error'); showCard(); }
  };
  setMode(startMode);
  body.querySelectorAll('.detail-mode button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  const filmHint = body.querySelector('.film-hint');
  const setHint = fid => { filmHint.textContent = FILMS.find(f => f[0] === fid)?.[2] || ''; };
  setHint(draft.film);
  body.querySelectorAll('.film-sw').forEach(b => {
    b.onmouseenter = () => setHint(b.dataset.film);
    b.onmouseleave = () => setHint(draft.film);
    b.onclick = () => {
      draft.film = b.dataset.film;
      body.querySelectorAll('.film-sw').forEach(x => x.classList.toggle('on', x === b));
      if (mode === 'card') showCard();
    };
  });
  body.querySelectorAll('.rs-sw').forEach(b => b.onclick = () => {
    draft.rarityStyle = b.dataset.rs;
    body.querySelectorAll('.rs-sw').forEach(x => x.classList.toggle('on', x === b));
    if (mode === 'card') showCard();
  });

  // 改稀有度：預覽、標誌樣式的示意都跟著換
  body.querySelectorAll('.rar-pick button').forEach(b => b.onclick = () => {
    draft.rarity = b.dataset.r;
    body.querySelectorAll('.rar-pick button').forEach(x => x.classList.toggle('on', x === b));
    body.querySelectorAll('.rs-sw').forEach(sw => {
      const rid = sw.dataset.rs; if (rid === 'auto' || rid === 'none') return;
      const demo = sw.querySelector('.rs-demo'); demo.className = `rs-demo r-${draft.rarity}`; demo.innerHTML = rarityBadge(draft.rarity, rid);
    });
    if (mode === 'card') showCard();
  });
  const sc = body.querySelector('.rs-scale');
  sc.oninput = () => { draft.rarityScale = +sc.value < .5 ? 0 : +sc.value; body.querySelector('.rs-scale-out').textContent = draft.rarityScale || '全域'; if (mode === 'card') showCard(); };
  const read = () => ({ ...Object.fromEntries(['name', 'subtitle', 'quote'].map(k => [k, body.querySelector(`[name=${k}]`).value.trim()])), ...draft });
  await modal({
    body, wide: true, cls: 'detail-modal', closeButton: true,
    onOpen: (b, close) => {
      b.querySelector('.save').onclick = async e => {
        const v = read(); if (!v.name) v.name = card.name;
        if (v.rarity !== card.rarity && !card.origRarity) v.origRarity = card.rarity;   // 記住抽到時的稀有度
        const saved = await updateCard(id, v);
        if (v.rarity !== card.rarity && saved.craft) renderCraftShot(saved).then(shot => shot && updateCard(id, { craftShot: shot, craftShotAt: Date.now(), craftShotKey: shotKey(saved) })).catch(() => { });   // 閃卡外框上的稀有度也要重畫
        // 改了卡名 / 稱號：卡冊上的閃卡截圖也要重畫
        if (saved.craft && saved.craftShotKey !== shotKey(saved)) renderCraftShot(saved).then(shot => shot && updateCard(id, { craftShot: shot, craftShotAt: Date.now(), craftShotKey: shotKey(saved) })).catch(() => { });
        sparkle(e.clientX, e.clientY); close(true);
      };
      b.querySelector('.close-d').onclick = () => close(null);
      b.querySelector('.dice-name').onclick = async e => {
        e.preventDefault();
        const btn = e.currentTarget;
        const { randomName, bannerKind } = await import('./names.js');
        const kind = bannerKind(state.banners.find(x => x.id === card.bannerId));
        const r = randomName(kind === 'asset' ? 'char' : kind, card.rarity);
        b.querySelector('[name=name]').value = r.name; b.querySelector('[name=subtitle]').value = r.subtitle;
        btn.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 400, easing: 'cubic-bezier(.3,1.4,.5,1)' });
      };
      b.querySelector('.set-home').onclick = async () => {
        card = await updateCard(id, read());
        if (await chooseHomeForCard(card)) { toast(`已加入首頁輪播（共 ${state.settings.homeSlides.length} 張）`, 'ok'); }
      };
      b.querySelector('.to-ws').onclick = () => { updateCard(id, read()); close(true); };
      b.querySelector('.to-craft').onclick = () => { updateCard(id, read()); close(true); };
      b.querySelector('.dl').onclick = () => downloadMenu();
      b.querySelector('.copy-prompt')?.addEventListener('click', () => navigator.clipboard.writeText(card.prompt).then(() => toast('已複製', 'ok')));
      b.querySelector('.unplace')?.addEventListener('click', async () => { await updateCard(id, { albumId: null, slot: null }); close(true); });
      b.querySelector('.del').onclick = async () => {
        if (!await confirmBox(`確定要刪除「${esc(card.name || '這張卡')}」嗎？這張卡的圖片會一起刪除，無法復原。`, { ok: '刪除', danger: true })) return;
        await deleteCard(id); toast('已刪除', 'ok'); close(true);
      };
    },
  });
  holo?.destroy(); stopLive();

  /** 下載：原圖（NovelAI 原始檔，含生成資訊）、閃卡、LIVE 動態 */
  async function downloadMenu() {
    const safe = (card.name || 'card').replace(/[\\/:*?"<>|]/g, '_');
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[card.blob?.type] || 'png';
    const origNote = card.demo ? '示範模式畫的圖（沒有生成資訊）' : card.source === 'upload' ? '你當初上傳的檔案，原封不動' : card.source === 'compose' || card.source === 'part' ? '工坊合成出來的圖' : 'NovelAI 回傳的原始 PNG，一個位元都沒改：保留完整生成資訊（提示詞、Seed、參數），可以拖回 NovelAI 讀取';
    const opts = [['orig', `${ICON.image} 原圖（含生成資訊）.${ext}`, origNote],
      ['clean', `${ICON.image} 原圖（不含生成資訊）.png`, '同一張圖、畫質不變，但拿掉所有可以解析的資訊（文字區塊與藏在透明度裡的隱寫資訊），別人讀不出提示詞和參數']];
    if (card.craft) opts.push(['holo-png', `${ICON.sparkles} 閃卡截圖 PNG`, '微微側一點、看得到鐳射的閃卡畫面'], ['holo-gif', `${ICON.film} 閃卡 GIF`, '傾斜一圈的反光動畫，無縫循環']);
    if (live) opts.push(['live-gif', `${ICON.play} LIVE 動態 GIF`, `「${esc(live.name)}」即時錄幾秒轉成 GIF`], ['live-webm', `${ICON.play} LIVE 動態 WebM`, '畫質最好的影片檔（6 秒）']);
    const pick = await modal({
      title: '下載', body: `<div class="choice-list">${opts.map(([v, t, d]) => `<button class="choice" data-v="${v}"><b>${t}</b><small>${d}</small></button>`).join('')}</div>`,
      onOpen: (bd, close) => bd.querySelectorAll('.choice').forEach(c => c.onclick = () => close(c.dataset.v)),
    });
    if (!pick) return;
    if (pick === 'orig') return download(card.blob, `${safe}.${ext}`);
    if (pick === 'clean') { try { return download(await stripImageInfo(card.blob), `${safe}_無資訊.png`); } catch (e) { return toast('處理失敗：' + e.message, 'error'); } }
    const { askGif, holoGif, liveGif } = await import('./gifexport.js');
    const busy = (t, f) => { const el = document.querySelector('.detail-busy') || document.body.appendChild(h('<div class="detail-busy toast-like"></div>')); el.textContent = t + (f != null ? ` ${Math.round(f * 100)}%` : ''); return el; };
    try {
      if (pick === 'holo-png' || pick === 'holo-gif') {
        if (mode !== 'holo') await setMode('holo');
        if (pick === 'holo-png') { const shot = await holo.capture(1600); return download(shot, `${safe}_閃卡.webp`); }
        const o = await askGif('閃卡 GIF', { seconds: 3, max: 6 }); if (!o) return;
        const blob = await holoGif(holo, { ...o, onProgress: f => busy('製作閃卡 GIF', f) });
        download(blob, `${safe}_閃卡.gif`);
      } else {
        if (mode !== 'live') await setMode('live');
        if (pick === 'live-webm') { busy('錄製中（6 秒）…'); return download(await stage.record(6, '#000'), `${safe}_LIVE.webm`); }
        const o = await askGif('LIVE 動態 GIF', { seconds: 4, max: 10 }); if (!o) return;
        const blob = await liveGif(stage, { ...o, onProgress: f => busy(f < .4 ? '錄製中…' : '轉成 GIF', f < .4 ? null : (f - .4) / .6) });
        download(blob, `${safe}_LIVE.gif`);
      }
    } catch (e) { console.error(e); toast('製作失敗：' + e.message, 'error', 6000); }
    finally { document.querySelector('.detail-busy')?.remove(); }
  }
}
