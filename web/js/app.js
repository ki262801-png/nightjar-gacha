// 進入點：載入資料、側欄導覽、路由
import { loadState, state, save } from './store.js';
import { applyLang } from './i18n.js';
import { h, ICON, toast, reducedMotion } from './util.js';
import { runIntro } from './intro.js';
import { localServer, relayURL } from './env.js';
import { applyTheme, installRipple, installPills, installClickWaves, toggledTheme, applyRarityColors, applyCursor, applyBackTone, wireLayout } from './theme.js';
import { seal } from './cards.js';
import { installFilmTextures } from './films.js';

const VIEWS = {
  home: () => import('./views/home.js'),
  gacha: () => import('./views/gacha.js'),
  album: () => import('./views/album.js'),
  parse: () => import('./views/parse.js'),
  workshop: () => import('./views/workshop.js'),
  settings: () => import('./views/settings.js'),
};
const NAV = [['home', '首頁', ICON.home], ['gacha', '召喚', ICON.gacha], ['album', '卡冊', ICON.album], ['parse', '解析', ICON.scan], ['workshop', '工坊', ICON.workshop], ['settings', '設定', ICON.settings]];

let current = null, seq = 0;

function renderRail() {
  const rail = document.querySelector('.rail');
  rail.innerHTML = `
    <a class="brand" href="#home" aria-label="夜航卡舍">${seal()}<span><b>夜航卡舍</b><small>NIGHTJAR</small></span></a>
    <nav class="nav">${NAV.map(([k, t, i]) => `<a href="#${k}" data-view="${k}"><span class="ni">${i}</span><span class="nt">${t}</span></a>`).join('')}</nav>
    <button class="lang-switch" data-no-i18n title="切換繁體 / 简体"><b class="ls-hant">繁</b><b class="ls-hans">简</b></button>
    <button class="theme-switch" aria-label="切換淺色 / 夜航">
      <span class="ts-track"><span class="ts-knob">${ICON.sun}${ICON.moon}</span></span>
    </button>`;
  rail.querySelector('.theme-switch').onclick = e => applyTheme(toggledTheme(), e);
  rail.querySelector('.lang-switch').onclick = () => setLang(state.settings.lang === 'hans' ? 'hant' : 'hans');
}

/** 繁 / 簡切換（存進設定，也記在 localStorage 讓下次開啟時先套用） */
export function setLang(lang) {
  state.settings.lang = lang; save('settings');
  try { localStorage.setItem('nightjar-lang', lang); } catch { }
  applyLang(lang);
  const sel = document.querySelector('[data-bind="settings.lang"]'); if (sel) sel.value = lang;
}

async function route() {
  const id = ++seq;
  const raw = location.hash.slice(1) || 'home';
  const [name0, qs] = raw.split('?');
  const name = VIEWS[name0] ? name0 : 'home';
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.view === name));
  document.body.dataset.view = name;
  const mod = await VIEWS[name]();
  if (id !== seq) return;
  const main = document.getElementById('view');
  try { current?.unmount?.(); } catch (e) { console.error(e); }
  const holder = h('<div class="view-holder entering"></div>');
  // 所有舊頁面都收掉（快速連點時，上一頁可能還在載入中，不能只收第一個）
  for (const old of [...main.children]) { if (old.classList.contains('leaving')) continue; old.classList.add('leaving'); setTimeout(() => old.remove(), 260); }
  main.append(holder);
  current = mod;
  try { await mod.mount(holder, new URLSearchParams(qs || '')); }
  catch (e) { console.error(e); toast('頁面載入失敗：' + e.message, 'error', 6000); }
  setTimeout(() => holder.classList.remove('entering'), 30);
}

// 開場動畫要接手畫面前，先用黑幕蓋住，避免閃一下首頁
const bootCover = document.createElement('div');
bootCover.className = 'boot-cover';
document.body.append(bootCover);

async function init() {
  try { await loadState(); }
  catch (e) { toast('無法讀取瀏覽器資料庫：' + e.message, 'error', 8000); }
  if (state.settings.intro !== false && !reducedMotion()) { runIntro(); setTimeout(() => bootCover.remove(), 50); }
  else { bootCover.classList.add('out'); setTimeout(() => bootCover.remove(), 500); }
  applyLang(state.settings.lang || 'hant');
  applyTheme(state.settings.theme);
  applyBackTone();
  wireLayout();
  applyRarityColors();
  applyCursor();
  renderRail();
  installRipple();
  installClickWaves();
  installPills();
  installFilmTextures();
  addEventListener('hashchange', route);
  await route();
  // 本機版：檢查伺服器版本（舊伺服器沒有 See-through 等新 API）；線上版：標記一下，本機限定功能會自動隱藏
  localServer().then(v => {
    window.__server = v;
    if (!v && relayURL()) { document.documentElement.dataset.online = '1'; return; }
    if (!v || v.version < 3) toast('本機伺服器是舊版本：請關閉黑色的伺服器視窗，再重新開啟「啟動抽卡模擬器.cmd」，新功能（See-through 等）才會生效', 'warn', 15000);
  });
  watchForUpdates();
  document.body.classList.add('ready');
}

/** 有新版本提示：部署時會產生 version.json；網站更新後，開著的頁面會跳出「有新版本」 */
function watchForUpdates() {
  let current = null, shown = false;
  const check = async () => {
    if (shown) return;
    const v = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (!v?.version) return;                       // 本機版沒有 version.json：不檢查
    if (current === null) { current = v.version; return; }
    if (v.version !== current) {
      shown = true;
      const bar = h(`<div class="update-bar"><span>✦ 有新版本${v.notes ? `：${v.notes}` : ''}</span><button class="btn small primary">重新整理</button><button class="icon-btn ghost small" aria-label="稍後">✕</button></div>`);
      bar.querySelector('.btn').onclick = () => location.reload();
      bar.querySelector('.icon-btn').onclick = () => bar.remove();
      document.body.append(bar);
    }
  };
  check();
  setInterval(check, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}

init();
