// 卡膜紋理：啟動時用程式隨機畫一次，存成 CSS 變數（不重複的自然紋理，避免格子狀圖樣看起來廉價）
function canvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')]; }
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function glitter() {
  const [c, g] = canvas(256);
  for (let i = 0; i < 420; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = .35 + Math.pow(rnd(), 3) * 1.4, a = .25 + rnd() * .75;
    g.fillStyle = `rgba(255,255,255,${a})`;
    for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill(); }
  }
  for (let i = 0; i < 9; i++) { // 少量四芒閃光
    const x = rnd() * 256, y = rnd() * 256, L = 3 + rnd() * 4;
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath(); g.moveTo(x, y - L); g.quadraticCurveTo(x, y, x + L, y); g.quadraticCurveTo(x, y, x, y + L); g.quadraticCurveTo(x, y, x - L, y); g.quadraticCurveTo(x, y, x, y - L); g.fill();
  }
  return c.toDataURL();
}

/** 冰裂紋：Voronoi 邊界，可無縫拼貼 */
function cracked() {
  const N = 220, [c, g] = canvas(N), pts = [];
  for (let i = 0; i < 16; i++) pts.push([rnd() * N, rnd() * N]);
  const all = [];
  for (const [x, y] of pts) for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) all.push([x + dx, y + dy]);
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let d1 = 1e9, d2 = 1e9;
    for (const [px, py] of all) { const d = Math.hypot(px - x, py - y); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
    const e = d2 - d1;
    const a = e < 1.4 ? (1 - e / 1.4) : e < 5 ? (1 - (e - 1.4) / 3.6) * .12 : 0;
    const k = (y * N + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

function stars() {
  const [c, g] = canvas(300);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * 300, y = rnd() * 300, r = Math.pow(rnd(), 4) * 1.6 + .25;
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 3);
    gr.addColorStop(0, `rgba(255,255,255,${.4 + rnd() * .6})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3, 0, 7); g.fill();
  }
  return c.toDataURL();
}

function noise() {
  const [c, g] = canvas(160);
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) { const v = rnd() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

export function installFilmTextures() {
  const root = document.documentElement.style;
  root.setProperty('--tex-glitter', `url(${glitter()})`);
  root.setProperty('--tex-cracked', `url(${cracked()})`);
  root.setProperty('--tex-stars', `url(${stars()})`);
  root.setProperty('--tex-noise', `url(${noise()})`);
}
