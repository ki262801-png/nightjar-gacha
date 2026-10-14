// 設定：NovelAI Token、主題、資料管理
import { h, esc, toast, confirmBox, pickFiles, modal, download, ICON } from '../util.js';
import { db } from '../db.js';
import { state, save, allCards, nameMode } from '../store.js';
import { setToken, hasToken, subscription, setCustomApi, customApi, testCustomApi, cleanBase } from '../nai.js';
import { AI_PROVIDERS, aiConfig, setAiConfig, aiTest } from '../aitrans.js';
import { toggle, sliderNote, select, bindAll } from '../forms.js';
import { RARITY_STYLES, rarityBadge, BACK_SERIES, ornament } from '../cards.js';
import { GUIDES } from '../guides.js';
import { applyTheme, TRANSITIONS, THEMES, toggledTheme, RARITY_PRESETS, applyRarityColors, rarityColor, CURSORS, applyCursor, BACK_TONES, applyBackTone } from '../theme.js';

let el;

const SET_SECTIONS = [['conn', '連線'], ['look', '外觀'], ['cards', '卡片與卡背'], ['summon', '召喚'], ['home', '首頁'], ['cursor', '游標'], ['data', '資料']];
import { PLATE_STYLES, PLATE_DECOR, plateStyleKey, plateStyleNow } from './home.js';
/** 名牌預覽用的範例內容（和首頁同一套樣式） */
const demoPlate = () => `<div class="home-plate">${PLATE_DECOR.replace('<span class="pl-seal"></span>', '<span class="pl-seal">稀</span>').replace('<span class="pl-vol"></span>', '<span class="pl-vol">No.0012</span>')}
  <img class="deco plate-feather" src="assets/deco/feather-f10.webp" alt="">
  <div class="plate-name"><span class="pn-rar r-SR">${rarityBadge('SR', 'aura')}</span><span class="pn-zh">米蕾</span></div>
  ${ornament('plate-divider')}
  <div class="plate-en">NAME - MIREILLE</div>
  <div class="plate-meta">V5 FULL · LIVE EDITION</div>
  <div class="plate-script"><span>Banner of MOONLIT FANTASIA</span> · <span>Sealed on 2026.10.07</span></div></div>`;
const plateBg = () => { const v = state.settings.homePlate || 'auto'; return v === 'auto' ? (state.settings.theme === 'night' ? 'dark' : 'light') : v; };
let setTab = 'conn';

export async function mount(root) {
  state.settings.nameMode ??= nameMode();
  state.settings.layout ??= 'auto';
  state.settings.plateStyle ??= 'classic'; state.settings.homePlate ??= 'auto'; state.settings.plateScale ??= 1.15;
  const cards = await allCards();
  const lives = await db.all('lives');
  el = h(`<section class="view settings">
    <nav class="set-nav">${SET_SECTIONS.map(([k, n]) => `<button data-sec="${k}">${n}</button>`).join('')}</nav>
    <div class="set-sec" data-sec="conn">
      <a class="panel set-card wide guide-link" href="guide.html" target="_blank" rel="noopener">${ICON.book}<span><b>第一次玩？看玩法介紹</b><small>五分鐘上手、召喚與提示詞、卡冊、工坊、常見問題（另開分頁）</small></span><i>→</i></a>
      <div class="panel set-card wide">
        <h3>${ICON.key}NovelAI 連線</h3>
        <p class="muted">到 NovelAI 官網 → 帳號設定 → <b>Get Persistent API Token</b> 取得 Token（以 <code>pst-</code> 開頭）。<span class="local-only">Token 只會送到這台電腦上的本機伺服器，再轉給 NovelAI。</span><span class="online-only">Token 只存在你自己的瀏覽器；生成時經由中繼原封不動轉給 NovelAI，中繼不會保存或記錄任何東西。圖片與卡片也都只存在你的瀏覽器。</span></p>
        <div class="token-row">
          <input class="field token" type="password" autocomplete="off" spellcheck="false" placeholder="pst-xxxxxxxx">
          <button class="btn primary apply">${ICON.check}套用</button>
        </div>
        ${toggle('記住在這個瀏覽器（存在本機 IndexedDB；共用電腦請勿開啟）', 'settings.rememberToken')}
        <div class="row wrap">
          <button class="btn ghost small check">${ICON.sparkles}查詢 Anlas 餘額</button>
          <button class="btn ghost small danger clear-token">清除 Token</button>
        </div>
        <p class="conn-status muted"></p>
        <details class="custom-api" ${state.settings.customApi?.on ? 'open' : ''}>
          <summary>自訂 API 位址（進階）<span class="ca-badge ${state.settings.customApi?.on ? 'on' : ''}">${state.settings.customApi?.on ? '使用中' : '官方'}</span></summary>
          <p class="muted small">改送到第三方中轉或自架的 NovelAI 相容 API。位址和金鑰只存在你的瀏覽器，不會寫進網站，其他人看不到。<b>注意</b>：第三方轉售 NovelAI 額度通常違反 NovelAI 使用條款；你的提示詞和圖片也會經過對方的伺服器。</p>
          <div class="seg small ca-mode"><button data-v="off" class="${state.settings.customApi?.on ? '' : 'on'}">官方 NovelAI</button><button data-v="on" class="${state.settings.customApi?.on ? 'on' : ''}">自訂位址</button></div>
          <label class="fld"><span>生圖位址 <em>會自動接上 /ai/generate-image；貼完整網址也可以</em></span><input class="field ca-image" spellcheck="false" autocomplete="off" placeholder="https://example.com" value="${esc(state.settings.customApi?.image || '')}"></label>
          <label class="fld"><span>帳號 API 位址 <em>查 Anlas 餘額用；留空 = 和生圖位址相同</em></span><input class="field ca-api" spellcheck="false" autocomplete="off" placeholder="（留空）" value="${esc(state.settings.customApi?.api || '')}"></label>
          <label class="fld"><span>金鑰 <em>是否記住跟著上面的「記住在這個瀏覽器」</em></span><input class="field ca-key" type="password" spellcheck="false" autocomplete="off" placeholder="對方給你的金鑰" value="${esc(state.settings.customApi?.key || '')}"></label>
          <div class="row wrap"><button class="btn primary small ca-save">${ICON.check}儲存並套用</button><button class="btn ghost small ca-test">${ICON.sparkles}測試連線</button></div>
          <div class="ca-result"></div>
        </details>
      </div>
      <div class="panel set-card wide ai-card">
        <h3>${ICON.sparkles}智慧翻譯（選用）</h3>
        <p class="muted">在「召喚 → 卡池提示詞 → ✨ 智慧翻譯」把中文構圖描述轉成英文 / 日文提示詞。不填也能用「詞庫對照」（離線、免費，只轉成 TAG）。
          要寫成自然語句需要一個 AI 金鑰：<b>金鑰只存在這個瀏覽器</b>，翻譯時從你的瀏覽器直接送到該服務，不經過本站、也不會進備份。Google Gemini 在 aistudio.google.com 可以免費申請。</p>
        <label class="fld"><span>服務</span><select class="field ai-provider">${AI_PROVIDERS.map(([v, n]) => `<option value="${v}" ${aiConfig().provider === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="fld"><span>位址 <em>一般不用改；OpenAI 相容服務請填它的 /v1 位址</em></span><input class="field ai-base" spellcheck="false" autocomplete="off" value="${esc(aiConfig().base)}"></label>
        <label class="fld"><span>模型</span><input class="field ai-model" spellcheck="false" autocomplete="off" value="${esc(aiConfig().model)}"></label>
        <label class="fld"><span>金鑰</span><input class="field ai-key" type="password" spellcheck="false" autocomplete="off" placeholder="貼上你的 API 金鑰" value="${esc(aiConfig().key)}"></label>
        <div class="row wrap"><button class="btn primary small ai-save">${ICON.check}儲存</button><button class="btn ghost small ai-test">${ICON.sparkles}測試</button><button class="btn ghost small danger ai-clear">清除金鑰</button></div>
        <p class="ai-status muted small"></p>
      </div>
    </div>
    <div class="set-sec" data-sec="look">
      <div class="panel set-card ">
        <h3>${ICON.sun}主題與配色</h3>
        <div class="theme-pick">
          ${THEMES.map(([id, n, d, cols]) => `<button data-theme="${id}"><i class="tp-sw">${cols.map(c => `<span style="background:${c}"></span>`).join('')}</i><b>${n}</b><small>${d}</small></button>`).join('')}
        </div>
        <div class="fld"><span>切換動效 <em>白晝 / 夜航切換時新主題用什麼形狀展開</em></span>
          <div class="vt-pick">${TRANSITIONS.map(([id, n]) => `<button data-vt="${id}" class="${(state.settings.themeTransition || 'circle') === id ? 'on' : ''}"><i class="vt-${id}"></i><span>${n}</span></button>`).join('')}</div></div>
        ${sliderNote('動效時間（毫秒）', 'settings.themeDuration', 250, 1600, 50, '越大展開越慢、越有儀式感')}
        <div class="row wrap"><button class="btn ghost small vt-try">${ICON.sparkles}試看看</button></div>
        ${select('版面', 'settings.layout', [['auto', '自動（依螢幕寬度）'], ['mobile', '手機版'], ['desktop', '電腦版']], '自動：手機、窄視窗用手機版，電腦用電腦版。在手機上選「電腦版」會縮小顯示完整版面；在電腦上選「手機版」會用手機寬度預覽')}
        ${select('介面文字', 'settings.lang', [['hant', '繁體中文'], ['hans', '简体中文']], '也可以用左側欄底部的「繁 / 简」按鈕切換；只改介面顯示，不會改到你輸入的提示詞與卡名')}
      </div>
      <div class="panel set-card ">
        <h3>${ICON.sparkles}點擊與文字效果</h3>
        ${toggle('按鈕點擊漣漪', 'settings.ripple', '點按鈕時從點擊處擴散一圈光暈')}
        ${toggle('空白處點擊波紋', 'settings.clickWaves', '點在沒有按鈕的地方，也會從點擊處擴散兩圈細環')}
        ${toggle('文字動效（逐字浮現、解密、數字滾動）', 'settings.textFx', '標題、名牌與數字的入場動畫')}
      </div>
    </div>
    <div class="set-sec" data-sec="cards">
      <div class="panel set-card ">
        <h3>${ICON.gacha}稀有度標誌</h3>
        <p class="muted">所有卡片預設使用的稀有度樣式；單張卡也可以在卡片詳情裡另外指定。</p>
        ${sliderNote('標誌大小', 'settings.rarityScale', .6, 2.2, .05, '所有卡片上稀有度標誌的大小；單張卡可在卡片詳情另外調整')}
        <div class="fld"><span>稀有度配色 <em>影響標誌、卡框、召喚光芒</em></span>
          <div class="rc-row">${['SSR', 'SR', 'R'].map(r => `<label class="rc-pick"><input type="color" data-rc="${r}" value="${rarityColor(r)}"><b class="r-${r}">${r}</b></label>`).join('')}</div>
          <div class="rc-presets">${RARITY_PRESETS.map(([n, c], i) => `<button class="rc-preset" data-i="${i}" title="${n}"><i style="background:${c.SSR}"></i><i style="background:${c.SR}"></i><i style="background:${c.R}"></i><span>${n}</span></button>`).join('')}</div></div>
        <div class="rs-grid big">${RARITY_STYLES.map(([id, n]) => `<button class="rs-sw ${(state.settings.rarityStyle || 'pill') === id ? 'on' : ''}" data-rs="${id}"><span class="rs-demo">${['SSR', 'SR', 'R'].map(r => `<span class="r-${r}">${rarityBadge(r, id)}</span>`).join('')}</span><small>${n}</small></button>`).join('')}</div>
      </div>
      <div class="panel set-card ">
        <h3>${ICON.album}卡背</h3>
        <p class="muted">召喚時翻牌前看到的卡背，會跟著卡池設定的圖片尺寸自動換成直式、橫式或方形。橫式和方形選「同系列」就會配合直式卡背的款式。</p>
        <div class="seg back-tabs">${[['p', '直式'], ['l', '橫式'], ['s', '方形']].map(([k, n], i) => `<button class="${i ? '' : 'on'}" data-shape="${k}">${n}</button>`).join('')}</div>
        <div class="back-grid" data-shape="p"></div>
        <div class="back-tone"><span class="bt-label">卡背色調</span>${BACK_TONES.map(([id, n, c]) => `<button class="bt-sw ${(state.settings.backTone || 'original') === id ? 'on' : ''}" data-tone="${id}" title="${n}"><i style="background:${c}"></i><small>${n}</small></button>`).join('')}</div>
      </div>
      <div class="panel set-card ">
        <h3>${ICON.edit}新卡命名</h3>
        ${select('新抽到的卡怎麼命名', 'settings.nameMode', [['auto', '自動隨機命名'], ['number', '未命名 + 編號（未命名 No.0001）'], ['none', '不命名（名字留白）']], '自動：角色池取人名、場景池取地名。不命名：名字留白，卡片上也不顯示名牌，單抽後也不會跳出命名欄。道具 / 裝飾 / 文字 / 光效這類素材池一律只標「道具 No.0134」')}
        <div class="name-sub ${nameMode() === 'auto' ? '' : 'hidden'}">${toggle('英文名 / 稱號也一起取', 'settings.autoSubtitle', '首頁名牌上的大字，例如 ARIA、SERENADE')}</div>
        <div class="row wrap"><button class="btn ghost small name-all">🎲 替現有的「未命名」或沒有名字的卡片取名</button></div>
      </div>
    </div>
    <div class="set-sec" data-sec="summon">
      <div class="panel set-card ">
        <h3>${ICON.sparkles}召喚演出</h3>
        <p class="muted">召喚時躍進卡面、讓卡背由光點聚出來的小精靈；卡背樣式在「卡片與卡背」。</p>
        <div class="back-tone guide-pick"><span class="bt-label">召喚引導 <em>抽卡時躍進卡面、讓卡背由光點聚出來的小精靈</em></span>${GUIDES.map(([id, n, ic]) => `<button class="bt-sw gd-sw ${(state.settings.summonGuide || 'fish') === id ? 'on' : ''}" data-guide="${id}"><i class="gd-ic">${ic}</i><small>${n}</small></button>`).join('')}</div>
      </div>
    </div>
    <div class="set-sec" data-sec="home">
      <div class="panel set-card ">
        <h3>${ICON.play}開場動畫</h3>
        ${toggle('開場動畫（打開網頁時播放）', 'settings.intro', '打開網頁時，夢幻小魚從黑暗中游出來的入場動畫。關掉就直接進首頁；開場畫面左下角也可以勾「下次不要播放」')}
        <div class="row wrap"><button class="btn ghost small replay-intro">${ICON.play}重播開場動畫</button></div>
      </div>
      <div class="panel set-card plate-panel">
        <h3>${ICON.home}首頁名牌</h3>
        <p class="muted">首頁右下角顯示卡名的名牌。首頁右上角的「✎」和「Aa」按鈕也可以直接切換。</p>
        <div class="fld"><span>名牌樣式 <em>點一下就套用，首頁會直接換成這個樣子${document.documentElement.dataset.layout === 'mobile' ? '（手機版另外記，預設隱藏）' : ''}</em></span>
          <div class="plate-pick">${PLATE_STYLES.map(([id, n]) => `<button data-ps="${id}" class="${plateStyleNow() === id ? 'on' : ''}"><div class="home v3 plate-demo" data-plate-style="${id}" data-plate="${plateBg()}">${demoPlate()}</div><small>${n}</small></button>`).join('')}</div></div>
        ${sliderNote('名牌大小', 'settings.plateScale', .8, 1.6, .05, '首頁名牌整體放大或縮小（手機上會自動縮回原本大小）')}
        ${select('文字底襯', 'settings.homePlate', [['auto', '自動（依配色）'], ['dark', '深底白字'], ['light', '淺底黑字'], ['none', '無底襯']], '名牌和台詞後面的半透明底，讓字在亮或暗的圖上都看得清楚')}
      </div>
      <div class="panel set-card ">
        <h3>${ICON.sparkles}首頁互動</h3>
        <p class="muted">在首頁背景上（LIVE 或卡片）可以做的事。</p>
        ${toggle('拖曳擦玻璃', 'settings.homeFx.wipe', '有「玻璃霧氣 / 雨滴」時，按住拖曳把霧擦掉，幾秒後慢慢重新起霧')}
        ${toggle('點擊水波', 'settings.homeFx.ripple', '點一下，畫面從那裡泛起一圈圈水波')}
        ${toggle('點擊星火', 'settings.homeFx.sparks', '點一下迸出一小撮星光')}
        ${toggle('戳一下', 'settings.homeFx.poke', '點一下，LIVE 部件（頭髮、身體…）會晃得更大，整張圖也輕輕彈一下')}
        ${toggle('游標光點拖尾', 'settings.homeFx.trail', '滑鼠移過畫面時留下一串細小光點')}
      </div>
    </div>
    <div class="set-sec" data-sec="cursor">
      <div class="panel set-card wide">
        <h3>${ICON.edit}游標</h3>
        ${select('游標樣式', 'settings.cursor', CURSORS, '網站專屬的滑鼠游標，顏色跟著主題；可點擊的地方會換成另一個圖示。也可以用自己電腦裡的游標檔')}
        ${select('拖曳游標', 'settings.dragCursor', [['theme', '主題手掌（跟著主題配色）'], ['system', '瀏覽器預設的手']], '拖曳卡片、卡冊、閃卡時顯示的手：張開 = 可以拖，握拳 = 拖曳中')}
        <div class="cur-custom ${state.settings.cursor === 'custom' ? '' : 'hidden'}">
          <p class="muted small">選電腦裡的游標檔：Windows 內建的在 <code>C:\\Windows\\Cursors</code>（例如 aero_arrow.cur、aero_link.cur），下載的游標包也可以。支援 .cur、.ani（動畫）、.ico、PNG、SVG；.cur 會自動讀出點擊位置，圖片可以自己調熱點。</p>
          ${sliderNote('游標大小', 'settings.cursorSize', 16, 64, 1, 'Windows 預設約 32；檔案裡的大圖會自動縮成這個大小')}
          ${[['def', '一般游標'], ['ptr', '可點擊時（連結、按鈕）'], ['drag', '拖曳時（可留空，用主題手掌）']].map(([k, n]) => `<div class="cur-slot" data-slot="${k}">
            <span class="cur-prev"></span><div class="cur-meta"><b>${n}</b><small class="cur-info"></small></div>
            <label class="cur-hot" title="以檔案原圖的像素計算">熱點 X <input type="number" class="field cur-x" min="0" max="127"></label><label class="cur-hot">Y <input type="number" class="field cur-y" min="0" max="127"></label>
            <button class="btn ghost small cur-pick">${ICON.upload}選擇檔案</button><button class="btn ghost small cur-clear">清除</button></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="set-sec" data-sec="data">
      <div class="panel set-card ">
        <h3>${ICON.book}收藏資料</h3>
        <p class="muted">所有卡片、卡冊與動態作品都只存在這個瀏覽器（IndexedDB）。清除瀏覽器網站資料會一併刪除，重要的卡片請記得下載備份。</p>
        <div class="stat-grid">
          <div><b>${cards.length}</b><small>卡片</small></div>
          <div><b>${cards.filter(c => c.rarity === 'SSR').length}</b><small>SSR</small></div>
          <div><b>${lives.length}</b><small>動態作品</small></div>
          <div><b>${state.stats.pulls}</b><small>累計抽數</small></div>
        </div>
      </div>
      <div class="panel set-card ">
        <h3>${ICON.download}備份與重設</h3>
        <div class="fld"><span>備份 <em>資料只存在這個瀏覽器：換電腦、換瀏覽器或清除網站資料前，記得先匯出</em></span></div>
        <div class="row wrap">
          <button class="btn small backup-export">${ICON.download}匯出備份</button>
          <button class="btn ghost small backup-import">${ICON.upload}匯入備份</button>
        </div>
        <small class="fld-note">備份檔（.njbak）包含所有卡片、卡冊、動態作品、閃卡與設定，不含 NovelAI Token。</small>
        <div class="row wrap">
          <button class="btn ghost small reset-stats">重設抽卡統計與保底</button>
          <button class="btn ghost small danger wipe">${ICON.trash}清除全部資料</button>
        </div>
      </div>
      <div class="panel set-card ">
        <h3>${ICON.sliders}小提醒</h3>
        <ul class="tips">
          <li>每抽一次就是一次 NovelAI 生圖。Opus 方案在 1024×1024 以內、28 步以下通常免費。</li>
          <li>失敗不會自動重試，也不會計入保底。</li>
          <li>沒有 Token 也能用「示範模式」試玩整個流程。</li>
          <li>工坊的深度分析在瀏覽器內執行，首次需下載約 27 MB 的模型。</li>
        </ul>
      </div>
    </div>
  </section>`);
  root.append(el);
  // 分類分頁：一次只看一類，記住上次看的
  const showSec = k => {
    setTab = SET_SECTIONS.some(x => x[0] === k) ? k : 'conn';
    el.querySelectorAll('.set-nav button').forEach(b => b.classList.toggle('on', b.dataset.sec === setTab));
    el.querySelectorAll('.set-sec').forEach(x => x.classList.toggle('hidden', x.dataset.sec !== setTab));
    try { sessionStorage.setItem('nj-set-tab', setTab); } catch { }
    const nav = el.querySelector('.set-nav'), on = nav.querySelector('.on');   // 手機上分類列可以左右滑：把選到的那個捲到中間
    if (on && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
  };
  el.querySelectorAll('.set-nav button').forEach(b => b.onclick = () => { showSec(b.dataset.sec); el.scrollIntoView?.({ block: 'start' }); });
  try { setTab = sessionStorage.getItem('nj-set-tab') || setTab; } catch { }
  showSec(setTab);
  const tokenInput = el.querySelector('.token');
  tokenInput.value = state.settings.rememberToken ? state.settings.token : '';
  el.querySelector('.replay-intro')?.addEventListener('click', () => import('../intro.js').then(m => m.runIntro()));
  wireCustomCursor();
  el.querySelector('.backup-export')?.addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const { exportBackup } = await import('../backup.js');
      const { blob, counts } = await exportBackup();
      const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      download(blob, `夜航卡舍備份_${stamp}.njbak`);
      toast(`已匯出：卡片 ${counts.cards} 張、卡冊 ${counts.albums} 本、動態作品 ${counts.lives} 個${counts.assets ? `、素材 ${counts.assets} 張` : ''}（${(blob.size / 1048576).toFixed(1)} MB）`, 'ok', 4000);
    } catch (err) { toast('匯出失敗：' + err.message, 'error'); }
    btn.disabled = false;
  });
  el.querySelector('.backup-import')?.addEventListener('click', async () => {
    const [file] = await pickFiles('.njbak');
    if (!file) return;
    try {
      const { readBackup, importBackup } = await import('../backup.js');
      const data = await readBackup(file);
      const c = data.counts, when = new Date(data.manifest.exportedAt).toLocaleString('zh-TW');
      const mode = await modal({
        title: '匯入備份', body: `<p class="modal-text">「${esc(file.name)}」（${when} 匯出）：卡片 <b>${c.cards}</b> 張、卡冊 <b>${c.albums}</b> 本、動態作品 <b>${c.lives}</b> 個${c.assets ? `、素材 <b>${c.assets}</b> 張` : ''}。</p>
          <p class="modal-text"><b>合併</b>：加進目前的收藏，目前的設定不變（同一張卡會以備份為準）。<br><b>完全還原</b>：先清空這個瀏覽器的所有資料，再換成備份的內容（連設定一起）。</p>`,
        actions: [{ label: '取消', kind: 'ghost', value: null }, { label: '完全還原', kind: 'ghost danger', value: 'replace' }, { label: '合併', kind: 'primary', value: 'merge' }],
      });
      if (!mode) return;
      if (mode === 'replace' && !await confirmBox('完全還原會先刪除目前所有的卡片與設定，確定嗎？', { ok: '清空並還原', danger: true })) return;
      toast('匯入中…', 'info', 2000);
      await importBackup(data, mode);
      toast('匯入完成，重新載入中…', 'ok', 1500);
      setTimeout(() => location.reload(), 900);
    } catch (err) { toast('匯入失敗：' + err.message, 'error', 6000); }
  });
  el.querySelector('.name-all')?.addEventListener('click', async e => {
    const { randomName, bannerKind, assetLabel } = await import('../names.js');
    const { updateCard } = await import('../store.js');
    const all = await allCards(), taken = new Set(all.map(c => c.name));
    const todo = all.filter(c => !c.name || /^未命名/.test(c.name));
    if (!todo.length) return toast('沒有「未命名」的卡片', 'info', 1800);
    if (!await confirmBox(`要替 ${todo.length} 張「未命名」卡片隨機取名嗎？素材類（透明背景）的卡會改成「道具 No.0134」這種標籤。之後還是可以在卡片詳情自己改。`, { ok: '取名' })) return;
    for (const c of todo) {
      const banner = state.banners.find(b => b.id === c.bannerId);
      const kind = c.alpha && !banner ? 'asset' : bannerKind(banner);
      const no = String(c.serial || 0).padStart(4, '0');
      if (kind === 'asset') { await updateCard(c.id, { name: `${assetLabel(banner)} No.${no}` }); continue; }
      const r = randomName(kind, c.rarity, taken); taken.add(r.name);
      await updateCard(c.id, { name: r.name, ...(state.settings.autoSubtitle !== false && !c.subtitle ? { subtitle: r.subtitle } : {}) });
    }
    toast(`已替 ${todo.length} 張卡片取名`, 'ok', 2400);
  });
  bindAll(el, { settings: state.settings }, path => {
    if (path === 'settings.layout') import('../theme.js').then(m => { m.applyLayout(); dispatchEvent(new Event('layout:change')); });
    if (path === 'settings.homePlate') el.querySelectorAll('.plate-demo').forEach(d => { d.dataset.plate = plateBg(); });
    if (path === 'settings.nameMode') el.querySelector('.name-sub').classList.toggle('hidden', state.settings.nameMode !== 'auto');
    if (path === 'settings.lang') import('../app.js').then(m => m.setLang(state.settings.lang));
    if (path === 'settings.cursorSize' || path === 'settings.dragCursor') applyCursor();
    if (path === 'settings.cursor') { applyCursor(); el.querySelector('.cur-custom').classList.toggle('hidden', state.settings.cursor !== 'custom'); }
    if (path !== 'settings.rememberToken') save('settings');
    if (path === 'settings.rememberToken') {
      if (state.settings.customApi) state.settings.customApi.key = state.settings.rememberToken ? customApi().key : '';
      state.settings.token = state.settings.rememberToken && hasToken() ? tokenInput.value.trim() : '';
      save('settings');
    }
  });
  const status = el.querySelector('.conn-status');
  const showStatus = () => {
    const c = customApi(), host = (() => { try { return new URL(c.image).host; } catch { return c.image; } })();
    status.textContent = c.on && c.image
      ? (hasToken() ? `● 使用自訂 API（${host}）` : `○ 已選自訂 API（${host}），但還沒有填金鑰`)
      : hasToken() ? '● 已套用 Token（本次瀏覽工作階段）' : '○ 尚未套用 Token：召喚會使用示範模式';
    status.classList.toggle('ok', hasToken());
  };
  wireCustomApi(() => showStatus());
  wireAi();
  showStatus();
  el.querySelector('.apply').onclick = () => {
    const t = tokenInput.value.trim();
    if (!t) return toast('請先貼上 Token', 'warn');
    setToken(t);
    state.settings.token = state.settings.rememberToken ? t : ''; save('settings');
    if (state.params.demo) { state.params.demo = false; save('params'); }
    showStatus(); toast('已套用 Token', 'ok');
  };
  el.querySelector('.clear-token').onclick = () => { setToken(''); tokenInput.value = ''; state.settings.token = ''; save('settings'); showStatus(); };
  el.querySelector('.check').onclick = async e => {
    if (!hasToken()) return toast('請先套用 Token', 'warn');
    const b = e.currentTarget; b.disabled = true;
    try {
      const s = await subscription();
      status.textContent = `● 連線成功 · Anlas 餘額 ${s.anlas.toLocaleString()}${s.active ? '' : ' · 訂閱未啟用'}`;
      status.classList.add('ok');
    } catch (err) { status.textContent = '✕ ' + err.message; status.classList.remove('ok'); }
    finally { b.disabled = false; }
  };
  el.querySelectorAll('.vt-pick button').forEach(b => b.onclick = () => {
    state.settings.themeTransition = b.dataset.vt; save('settings');
    el.querySelectorAll('.vt-pick button').forEach(x => x.classList.toggle('on', x === b));
  });
  el.querySelector('.vt-try').onclick = ev => {
    applyTheme(toggledTheme(), ev);
    setTimeout(() => el.querySelectorAll('.theme-pick button').forEach(x => x.classList.toggle('on', x.dataset.theme === state.settings.theme)), 50);
  };
  fetch('assets/deco/deco.json').then(r => r.json()).then(list => {
    const grid = el.querySelector('.back-grid');
    const KEY = { p: 'cardBack', l: 'cardBackL', s: 'cardBackS' };
    const sw = (id, inner, name, cur) => `<button class="back-sw ${cur === id ? 'on' : ''}" data-back="${id}">${inner}<small>${name}</small></button>`;
    const render = shape => {
      const key = KEY[shape], cur = state.settings[key] || (shape === 'p' ? 'default' : 'auto');
      grid.dataset.shape = shape;
      const items = shape === 'p' ? list.filter(d => d.kind === 'back') : list.filter(d => d.shape === shape);
      const p = state.settings.cardBack || 'default';   // 「同系列」：跟著直式卡背的款式
      const auto = p === 'default' ? '<span class="bs-default"></span>' : `<img src="assets/deco/back${shape}-${BACK_SERIES[p] || 'a04'}.webp" alt="">`;
      grid.innerHTML = (shape === 'p' ? '' : sw('auto', auto, '同系列', cur))
        + sw('default', '<span class="bs-default"></span>', '夜航紋章', cur)
        + items.map(d => sw(d.id, `<img src="${d.file}" alt="">`, d.name.replace(/（[橫方]）$/, ''), cur)).join('');
      grid.querySelectorAll('.back-sw').forEach(b => b.onclick = () => {
        state.settings[key] = b.dataset.back; save('settings');
        if (shape === 'p') render('p'); else grid.querySelectorAll('.back-sw').forEach(x => x.classList.toggle('on', x === b));
      });
    };
    el.querySelectorAll('.back-tabs button').forEach(b => b.onclick = () => {
      el.querySelectorAll('.back-tabs button').forEach(x => x.classList.toggle('on', x === b));
      render(b.dataset.shape);
    });
    render('p');
  }).catch(() => { });
  el.querySelectorAll('.bt-sw[data-tone]').forEach(b => b.onclick = () => {
    state.settings.backTone = b.dataset.tone; save('settings'); applyBackTone();
    el.querySelectorAll('.bt-sw[data-tone]').forEach(x => x.classList.toggle('on', x === b));
  });
  el.querySelectorAll('.plate-pick > button').forEach(b => b.onclick = () => {
    state.settings[plateStyleKey()] = b.dataset.ps; save('settings');
    el.querySelectorAll('.plate-pick > button').forEach(x => x.classList.toggle('on', x === b));
  });
  el.querySelectorAll('.gd-sw').forEach(b => b.onclick = () => {
    state.settings.summonGuide = b.dataset.guide; save('settings');
    el.querySelectorAll('.gd-sw').forEach(x => x.classList.toggle('on', x === b));
  });
  const setRC = c => { state.settings.rarityColors = { ...(state.settings.rarityColors || {}), ...c }; save('settings'); applyRarityColors(); el.querySelectorAll('[data-rc]').forEach(i => i.value = rarityColor(i.dataset.rc)); };
  el.querySelectorAll('[data-rc]').forEach(i => i.oninput = () => setRC({ [i.dataset.rc]: i.value }));
  el.querySelectorAll('.rc-preset').forEach(b => b.onclick = () => setRC({ ...RARITY_PRESETS[+b.dataset.i][1] }));
  el.querySelectorAll('.rs-grid .rs-sw').forEach(b => b.onclick = () => {
    state.settings.rarityStyle = b.dataset.rs; save('settings');
    el.querySelectorAll('.rs-grid .rs-sw').forEach(x => x.classList.toggle('on', x === b));
    toast('已套用到所有沒有單獨設定的卡片', 'ok', 1800);
  });
  el.querySelectorAll('.theme-pick button').forEach(b => {
    b.classList.toggle('on', b.dataset.theme === state.settings.theme);
    b.onclick = ev => { applyTheme(b.dataset.theme, ev); el.querySelectorAll('.theme-pick button').forEach(x => x.classList.toggle('on', x === b)); };
  });
  el.querySelector('.reset-stats').onclick = async () => {
    if (!await confirmBox('重設累計抽數與保底計數？卡片不受影響。')) return;
    Object.assign(state.stats, { pulls: 0, sinceSSR: 0, sinceSR: 0, ssr: 0, sr: 0 }); save('stats'); toast('已重設', 'ok');
  };
  el.querySelector('.wipe').onclick = async () => {
    if (!await confirmBox('真的要刪除<b>所有</b>卡片、卡冊、動態作品與設定嗎？此動作無法復原。', { ok: '全部刪除', danger: true })) return;
    for (const s of ['cards', 'albums', 'lives', 'kv']) await db.clear(s);
    location.reload();
  };
}

export function unmount() { }

/** 自訂游標：上傳 .cur / .ani / 圖片，預覽、調熱點 */
function wireCustomCursor() {
  const box = el.querySelector('.cur-custom');
  if (!box) return;
  const cc = () => (state.settings.customCursor ??= {});
  const sync = () => box.querySelectorAll('.cur-slot').forEach(slot => {
    const set = cc()[slot.dataset.slot], f = set?.frames?.[0];
    slot.querySelector('.cur-prev').innerHTML = f ? `<img src="${f.url}" alt="">` : '';
    slot.querySelector('.cur-info').textContent = f ? `${set.name}${set.frames.length > 1 ? ` · 動畫 ${set.frames.length} 格` : ''} · ${f.w || 32}×${f.h || 32}` : (slot.dataset.slot === 'drag' ? '尚未選擇（用主題手掌）' : '尚未選擇（沒選時用系統游標）');
    slot.querySelector('.cur-x').value = f ? f.x : ''; slot.querySelector('.cur-y').value = f ? f.y : '';
    slot.querySelectorAll('.cur-hot input').forEach(i => { i.disabled = !f; });
  });
  sync();
  box.querySelectorAll('.cur-slot').forEach(slot => {
    const k = slot.dataset.slot;
    slot.querySelector('.cur-pick').onclick = async () => {
      const [file] = await pickFiles('.cur,.ani,.ico,.png,.svg,.gif,.webp,image/*');
      if (!file) return;
      try {
        const { readCursorFile } = await import('../cursorfile.js');
        cc()[k] = await readCursorFile(file);
        state.settings.cursor = 'custom';
        el.querySelector('[data-bind="settings.cursor"]').value = 'custom';
        save('settings'); applyCursor(); sync();
        toast(`已套用「${file.name}」`, 'ok', 1800);
      } catch (e) { toast('讀取游標檔失敗：' + e.message, 'error'); }
    };
    slot.querySelector('.cur-clear').onclick = () => { delete cc()[k]; save('settings'); applyCursor(); sync(); };
    slot.querySelectorAll('.cur-hot input').forEach(inp => inp.onchange = () => {
      const set = cc()[k]; if (!set) return;
      const x = Math.max(0, +slot.querySelector('.cur-x').value || 0), y = Math.max(0, +slot.querySelector('.cur-y').value || 0);
      set.frames.forEach(f => { f.x = Math.min(x, (f.w || 32) - 1); f.y = Math.min(y, (f.h || 32) - 1); });
      save('settings'); applyCursor();
    });
  });
}

/** 智慧翻譯的 AI 金鑰（只存在這個瀏覽器） */
function wireAi() {
  const box = el.querySelector('.ai-card');
  if (!box) return;
  const q = c => box.querySelector(c), status = q('.ai-status');
  q('.ai-provider').onchange = () => {
    const p = AI_PROVIDERS.find(x => x[0] === q('.ai-provider').value);
    q('.ai-base').value = p[2]; q('.ai-model').value = p[3];
  };
  const read = () => ({ provider: q('.ai-provider').value, base: q('.ai-base').value.trim(), model: q('.ai-model').value.trim(), key: q('.ai-key').value.trim() });
  q('.ai-save').onclick = () => { setAiConfig(read()); toast('已儲存（只存在這個瀏覽器）', 'ok'); };
  q('.ai-clear').onclick = () => { q('.ai-key').value = ''; setAiConfig(read()); status.textContent = ''; toast('已清除金鑰', 'ok'); };
  q('.ai-test').onclick = async e => {
    setAiConfig(read());
    const btn = e.currentTarget; btn.disabled = true; status.textContent = '測試中…';
    try { const t = await aiTest(); status.textContent = '✓ 可以使用（回應：' + t.slice(0, 20) + '）'; }
    catch (err) { status.textContent = '✕ ' + err.message; }
    finally { btn.disabled = false; }
  };
}

/** 自訂 API 位址（進階） */
function wireCustomApi(onChange) {
  const box = el.querySelector('.custom-api');
  if (!box) return;
  const q = c => box.querySelector(c);
  let mode = state.settings.customApi?.on ? 'on' : 'off';
  box.querySelectorAll('.ca-mode button').forEach(b => b.onclick = () => {
    mode = b.dataset.v;
    box.querySelectorAll('.ca-mode button').forEach(x => x.classList.toggle('on', x === b));
  });
  const read = () => ({ on: mode === 'on', image: q('.ca-image').value.trim(), api: q('.ca-api').value.trim(), key: q('.ca-key').value.trim() });
  const valid = u => { try { const x = new URL(cleanBase(u)); return x.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(x.hostname); } catch { return false; } };
  q('.ca-save').onclick = () => {
    const c = read();
    if (c.on && !valid(c.image)) return toast('生圖位址要是 https:// 開頭的網址', 'warn');
    if (c.api && !valid(c.api)) return toast('帳號 API 位址要是 https:// 開頭的網址', 'warn');
    setCustomApi(c);
    state.settings.customApi = { on: c.on, image: c.image, api: c.api, key: state.settings.rememberToken ? c.key : '' };
    save('settings');
    const badge = q('.ca-badge'); badge.textContent = c.on ? '使用中' : '官方'; badge.classList.toggle('on', c.on);
    if (c.on && state.params.demo && c.key) { state.params.demo = false; save('params'); }
    onChange();
    toast(c.on ? '已改用自訂 API 位址' : '已改回官方 NovelAI', 'ok');
  };
  q('.ca-test').onclick = async e => {
    const c = read(), out = q('.ca-result'), btn = e.currentTarget;
    if (!valid(c.image)) return toast('先填生圖位址（https:// 開頭）', 'warn');
    btn.disabled = true; out.innerHTML = '<p class="muted small">測試中…（不會花 Anlas）</p>';
    try {
      const r = await testCustomApi(c);
      const row = (label, v, yes, no, unk = '無法判斷') => `<li class="${v === true ? 'ok' : v === false ? 'bad' : 'unk'}"><b>${v === true ? '✓' : v === false ? '✕' : '？'}</b><span>${label}</span><em>${v === true ? yes : v === false ? no : unk}</em></li>`;
      out.innerHTML = `<ul class="ca-checks">
        ${row('NovelAI 原生格式', r.native, '是：路徑和回應都和官方一樣', '不是：需要另外轉換，目前不能用')}
        ${row('開放網頁直接連線（CORS）', r.cors, '有開', '沒有開（或連不到）')}
        ${row('線上版能不能用', r.online, '可以', '不行')}
        ${row('本機版能不能用', r.local, '可以', '不行', '要用本機版（啟動抽卡模擬器.cmd）開才測得到')}
      </ul>${r.notes.map(n => `<p class="small ca-note">${esc(n)}</p>`).join('')}`;
    } catch (err) {
      out.innerHTML = `<p class="small ca-note bad">${esc(err.message)}</p>`;
    } finally { btn.disabled = false; }
  };
}

