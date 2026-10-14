// 開場動畫：全黑的水裡游出一隻「賽博粒子」小魚（像青光閃鱗的稻田魚，由幾百顆會閃的光點組成）
// 點水面 → 和小魚同色的波紋，小魚好奇地游過去看；點到小魚 → 牠一躍到畫面中央、化成光點消失、水花濺起 → 浮出「請進」
// 按下請進 → 畫面像水面般向外散開露出遊戲 → 光點重新聚成小魚，繞場一圈，跳進左上角的圖標裡融為一體
import { reducedMotion } from './util.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const bez = (a, c, b, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
// 夢幻色盤：粉 → 紫 → 藍紫 → 青
const HUES = [330, 295, 260, 220, 190];
export const hueAt = (k, shift = 0) => { const f = clamp(k, 0, 1) * (HUES.length - 1), i = Math.min(HUES.length - 2, Math.floor(f)); return HUES[i] + (HUES[i + 1] - HUES[i]) * (f - i) + shift; };

/** 粒子小魚：頭帶著一串脊椎點走，身體由附著在脊椎上的光點組成 */
export class Fish {
  constructor(x, y, size) {
    this.N = 12; this.size = size; this.scale = 1; this.alpha = 0;   // 脊椎點少一點，擺動才是一整條柔順的弧，不會 Z 字形
    this.ang = 0; this.speed = 70; this.t = 0; this.swim = 1;
    this.mode = 'body';          // body：正常；free：散成光點；reform：光點聚回魚身
    this.pts = Array.from({ length: this.N }, (_, i) => ({ x: x - i * size / this.N, y }));
    // 光點：身體沒有外框，形狀完全由光點的疏密長出來（中間密、邊緣稀）；魚鰭的光點沿著鰭條排成扇形
    this.parts = [];
    const gauss = () => { let a = 0; for (let k = 0; k < 4; k++) a += Math.random(); return (a - 2) / 1.15; };
    const base = () => ({ ph: rand(0, TAU), rate: rand(2, 7), sz: rand(.7, 1.5), warm: Math.random() < .07, glint: Math.random() < .045 });
    for (let n = 0; n < 560;) {                        // 身體：寬的地方放比較多
      const u = Math.random();
      if (Math.random() > this.width(u) / (this.size * .1)) continue;
      this.parts.push({ ...base(), kind: 'body', u, v: clamp(gauss() * .8, -1.2, 1.2), k: clamp(u * .7 + rand(-.15, .3), 0, 1) });
      n++;
    }
    for (let n = 0; n < 70; n++) this.parts.push({ ...base(), kind: 'line', u: rand(.03, .98), v: gauss() * .12, k: clamp(.55 + rand(0, .45), 0, 1), sz: rand(.9, 1.7) });
    // 背鰭：身體後半段沿背脊的一道細光
    for (let n = 0; n < 34; n++) this.parts.push({ ...base(), kind: 'dorsal', u: rand(.5, .86), v: rand(-.1, .1), k: rand(.6, 1), sz: rand(.6, 1.1) });
    // 魚鰭：胸鰭（大、會拍）、腹鰭（小）、尾鰭（扇形）
    this.fins = [
      { u: .18, side: -1, len: .4, spread: 1.05, theta: 1.0, flap: .32, freq: 4.2, rays: 9, per: 16 },
      { u: .18, side: 1, len: .4, spread: 1.05, theta: 1.0, flap: .32, freq: 4.2, rays: 9, per: 16 },
      { u: .52, side: -1, len: .15, spread: .55, theta: .75, flap: .22, freq: 5, rays: 5, per: 9 },
      { u: .52, side: 1, len: .15, spread: .55, theta: .75, flap: .22, freq: 5, rays: 5, per: 9 },
      { u: 1, side: 0, len: .36, spread: .9, theta: 0, flap: .25, freq: 8, rays: 11, per: 16 },
    ];
    this.fins.forEach((f, fi) => {
      for (let r = 0; r < f.rays; r++) for (let n = 0; n < f.per; n++)
        this.parts.push({ ...base(), kind: 'fin', fi, ray: r, r: Math.pow((n + .3 + Math.random() * .4) / f.per, .9), k: clamp(.3 + r / f.rays * .5 + rand(0, .2), 0, 1), sz: rand(.55, 1.05) });
    });
  }
  get head() { return this.pts[0]; }
  get seg() { return this.size * this.scale / (this.N - 1); }
  width(u) {
    const S = this.size * this.scale;
    return S * .1 * (u < .18 ? .6 + .4 * Math.sin(u / .18 * Math.PI / 2) : .28 + .72 * Math.pow(Math.cos((u - .18) / .82 * Math.PI / 2), 1.3));
  }

  steer(tx, ty, dt, speed = 90, turn = 2.4) {
    const h = this.head;
    const want = Math.atan2(ty - h.y, tx - h.x);
    this.ang += clamp(wrap(want - this.ang), -turn * dt, turn * dt);
    this.speed += (speed - this.speed) * (1 - Math.exp(-dt * 2.5));
    h.x += Math.cos(this.ang) * this.speed * dt;
    h.y += Math.sin(this.ang) * this.speed * dt;
    this.follow();
  }
  place(x, y) {
    const h = this.head, dx = x - h.x, dy = y - h.y;
    if (Math.hypot(dx, dy) > .01) this.ang = Math.atan2(dy, dx);
    h.x = x; h.y = y; this.follow();
  }
  /** 整條魚瞬間放到某處（重新聚形用） */
  reset(x, y, ang) {
    this.ang = ang;
    this.pts.forEach((p, i) => { p.x = x - Math.cos(ang) * i * this.seg; p.y = y - Math.sin(ang) * i * this.seg; });
  }
  follow() {
    const s = this.seg;
    for (let i = 1; i < this.N; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      b.x = a.x + dx / d * s; b.y = a.y + dy / d * s;
    }
  }
  /** 畫面上的脊椎（含擺尾） */
  spine() {
    const N = this.N, S = this.size * this.scale;
    return this.pts.map((p, i) => {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(N - 1, i + 1)];
      const tx = a.x - b.x, ty = a.y - b.y, tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl, u = i / (N - 1);
      const sway = Math.sin(this.t * 5.2 - u * 2.4) * S * .065 * Math.pow(u, 1.6) * this.swim;   // 波長比魚身長：整條輕輕甩，不會來回折
      return { x: p.x + nx * sway, y: p.y + ny * sway, nx, ny, tx: tx / tl, ty: ty / tl };
    });
  }
  /** 光點在魚身上的位置 */
  partPos(p, P) {
    const N = this.N, S = this.size * this.scale;
    const at = u => {                                   // 脊椎上 u 處的位置、法線、往尾巴的方向
      const f = clamp(u, 0, 1) * (N - 1), i = Math.min(N - 2, Math.floor(f)), q = f - i, A = P[i], B = P[i + 1];
      return { x: A.x + (B.x - A.x) * q, y: A.y + (B.y - A.y) * q, nx: A.nx + (B.nx - A.nx) * q, ny: A.ny + (B.ny - A.ny) * q, bx: -(A.tx + (B.tx - A.tx) * q), by: -(A.ty + (B.ty - A.ty) * q) };
    };
    if (p.kind === 'fin') {
      const f = this.fins[p.fi], c = at(f.u);
      const w = f.side ? this.width(f.u) * .9 : 0;
      const ox = c.x + c.nx * f.side * w, oy = c.y + c.ny * f.side * w;
      // 鰭的中心方向：從「往後」朝外側轉 theta，再加上拍動
      const th = f.side ? f.side * (f.theta + Math.sin(this.t * f.freq + f.side) * f.flap) : Math.sin(this.t * f.freq) * f.flap;
      const ca = Math.atan2(c.by, c.bx) + th * (f.side ? 1 : 1);
      const ang = ca + (p.ray / Math.max(1, f.rays - 1) - .5) * f.spread + Math.sin(this.t * f.freq - p.ray * .4) * .14 * p.r;
      const len = f.len * S * (f.side ? 1 : 1 + .1 * Math.sin(p.ray / (f.rays - 1) * Math.PI));
      return { x: ox + Math.cos(ang) * p.r * len, y: oy + Math.sin(ang) * p.r * len };
    }
    const c = at(p.u);
    let v = p.v;
    if (p.kind === 'dorsal') v += Math.sin(this.t * 7 - p.u * 9) * .25 * (p.u - .5);
    const w = this.width(p.u) * v;
    return { x: c.x + c.nx * w, y: c.y + c.ny * w };
  }
  /** 點到魚了嗎 */
  hit(x, y) {
    if (this.mode !== 'body' || this.alpha < .5) return false;
    const P = this.spine(), N = this.N;
    for (let i = 0; i < N; i++) if (Math.hypot(x - P[i].x, y - P[i].y) < this.width(i / (N - 1)) + 18) return true;
    const t = P[N - 1];
    return Math.hypot(x - t.x, y - t.y) < this.size * this.scale * .28;
  }
  /** 化成光點散開 */
  dissolve() {
    const P = this.spine();
    for (const p of this.parts) {
      const w = this.partPos(p, P), a = rand(0, TAU), sp = rand(40, 320);
      Object.assign(p, { wx: w.x, wy: w.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80 });
    }
    this.mode = 'free'; this.freeT = 0;
  }
  /** 光點從四周聚回魚身 */
  reform(x, y, ang) {
    this.reset(x, y, ang);
    for (const p of this.parts) {
      const a = rand(0, TAU), r = rand(60, 260);
      p.wx = x + Math.cos(a) * r; p.wy = y + Math.sin(a) * r;
    }
    this.mode = 'reform'; this.reformT = 0; this.alpha = 1;
  }

  draw(g, time, dt) {
    if (this.alpha <= 0) return;
    const N = this.N, S = this.size * this.scale, shift = Math.sin(time * .35) * 14;
    const P = this.spine();
    g.save();
    g.globalAlpha = this.alpha;
    let bodyA = 1;                                   // 半透明魚身與鰭（散開時淡掉）
    if (this.mode === 'free') { this.freeT += dt; bodyA = 0; }
    if (this.mode === 'reform') { this.reformT += dt; bodyA = clamp((this.reformT - .5) / .4, 0, 1); if (this.reformT > .9) this.mode = 'body'; }

    // 身體沒有外框也沒有填色：形狀完全交給下面的光點

    // 光點（疊加發光，像閃鱗）
    g.globalAlpha = this.alpha;
    g.globalCompositeOperation = 'lighter';
    const glitch = Math.sin(time * 1.6) > .975, gU = (time * 3) % 1;
    const px = Math.max(1.3, S / 90);
    for (const p of this.parts) {
      let x, y;
      if (this.mode === 'body') { const w = this.partPos(p, P); x = w.x; y = w.y; }
      else if (this.mode === 'free') {
        p.vx *= Math.exp(-1.6 * dt); p.vy = p.vy * Math.exp(-1.6 * dt) + 25 * dt; p.wx += p.vx * dt; p.wy += p.vy * dt; x = p.wx; y = p.wy;
      } else {
        const w = this.partPos(p, P), k = ease(clamp(this.reformT / .8, 0, 1));
        x = p.wx + (w.x - p.wx) * k; y = p.wy + (w.y - p.wy) * k;
      }
      const tw = p.kind === 'fin' ? .55 + .45 * Math.sin(time * p.rate + p.ph) : .3 + .7 * Math.pow(.5 + .5 * Math.sin(time * p.rate + p.ph), 3);
      const fade = this.mode === 'free' ? clamp(1 - this.freeT / 1.3, 0, 1) : 1;
      const edge = p.kind === 'body' ? 1 - Math.min(1, Math.abs(p.v)) ** 2 * .65 : p.kind === 'fin' ? 1 - p.r * .55 : 1;
      const a = tw * fade * edge * (p.kind === 'line' ? 1 : p.kind === 'fin' ? .95 : .85);
      if (a < .03) continue;
      if (glitch && Math.abs(p.u - gU) < .08) { x += 4; g.fillStyle = `rgba(255,80,200,${a})`; }
      else if (p.warm) g.fillStyle = `hsla(${32 + shift * .5},100%,72%,${a})`;
      else g.fillStyle = `hsla(${hueAt(p.k, shift)},100%,${p.kind === 'line' ? 88 : 78}%,${a})`;
      const s = p.sz * px * (p.kind === 'line' ? 1.2 : 1);   // 鰭的光點本身就比較小
      g.fillRect(x - s / 2, y - s / 2, s, s);                       // 方形像素，帶一點賽博感
      if (p.glint && tw > .85) {                                      // 偶爾一顆閃出十字光
        g.fillStyle = `rgba(255,255,255,${(tw - .85) * 5 * fade})`;
        g.fillRect(x - s * 3, y - .5, s * 6, 1); g.fillRect(x - .5, y - s * 3, 1, s * 6);
      }
    }
    g.globalCompositeOperation = 'source-over';
    // 游動時灑出的星光：游得越快灑越多，從身體和尾巴飄出來、閃一閃就淡掉
    this.trail ??= [];
    const h0 = P[0], mv = this.lastHead ? Math.hypot(h0.x - this.lastHead.x, h0.y - this.lastHead.y) / Math.max(dt, .001) : 0;
    this.lastHead = { x: h0.x, y: h0.y };
    if (this.mode === 'body' && this.alpha > .3) {
      let n = dt * (6 + Math.min(mv, 600) * .09);
      while (n > 0) {
        if (n >= 1 || Math.random() < n) {
          const src = this.parts[Math.floor(Math.random() * this.parts.length)];
          if (src.kind !== 'fin' || src.fi === 4) {
            const w = this.partPos(src, P), a = rand(0, TAU);
            this.trail.push({ x: w.x, y: w.y, vx: Math.cos(a) * rand(4, 18), vy: Math.sin(a) * rand(4, 18) - 6, life: 0, max: rand(.7, 1.6), s: rand(.6, 1.3) * px, k: Math.random(), ph: rand(0, TAU) });
          }
        }
        n -= 1;
      }
    }
    g.globalCompositeOperation = 'lighter';
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const q = this.trail[i]; q.life += dt;
      if (q.life > q.max) { this.trail.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= .97; q.vy *= .97;
      const a = Math.sin(Math.PI * q.life / q.max) * (.6 + .4 * Math.sin(time * 9 + q.ph)) * this.alpha;
      const L = q.s * 3.2;
      g.fillStyle = `hsla(${hueAt(q.k, shift)},100%,88%,${a})`;
      g.beginPath(); g.moveTo(q.x, q.y - L); g.quadraticCurveTo(q.x, q.y, q.x + L, q.y); g.quadraticCurveTo(q.x, q.y, q.x, q.y + L); g.quadraticCurveTo(q.x, q.y, q.x - L, q.y); g.quadraticCurveTo(q.x, q.y, q.x, q.y - L); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }
}

export function runIntro() {
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'intro';
    root.innerHTML = `<canvas></canvas>
      <p class="intro-hint">點一下小魚，跟著牠進去</p>
      <button class="intro-enter" hidden><b>請 進</b><small>ENTER</small></button>
      <button class="intro-skip">跳過 ›</button>
      <label class="intro-never"><input type="checkbox"><span>下次不要播放開場動畫</span></label>`;
    document.body.append(root);
    const cv = root.querySelector('canvas'), g = cv.getContext('2d');
    const hint = root.querySelector('.intro-hint'), enterBtn = root.querySelector('.intro-enter');
    let W = 0, H = 0, dpr = 1;
    const resize = () => { dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; };
    resize(); addEventListener('resize', resize);

    const S = clamp(Math.min(W, H) * .16, 90, 150);
    const fish = new Fish(W * .22, H * .68, S);
    fish.ang = -.35;
    root._fish = fish;   // 測試用
    const ripples = [], drops = [], bubbles = [], glints = [];
    let phase = 'emerge', pt = 0, time = 0, alive = true, flash = 0, curious = 0;
    let target = { x: W * .45, y: H * .5 }, leap = null, hole = 0, holeOn = false, loop = null, done = false;

    // 波紋：顏色跟小魚一樣（粉 / 紫 / 青）
    const ring = (x, y, n = 3, power = 1) => { const hue = hueAt(Math.random()); for (let k = 0; k < n; k++) ripples.push({ x, y, life: -k * .18, max: 1.8, p: power, hue: hue + k * 18 }); };
    const splash = (x, y) => {
      for (let i = 0; i < 60; i++) {
        const a = rand(-Math.PI, 0) + rand(-.3, .3), sp = rand(150, 560);
        drops.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rand(.7, 1.4), r: rand(1.2, 3.2), hue: hueAt(Math.random()) });
      }
      ring(x, y, 5, 1.5); flash = .3;
    };
    const finish = () => {
      if (done) return; done = true; alive = false;
      // 勾了「下次不要播放」：寫進設定（之後可以在「設定 → 外觀 → 開場動畫」再打開）
      if (root.querySelector('.intro-never input')?.checked) import('./store.js').then(m => { m.state.settings.intro = false; m.save('settings'); });
      root.classList.add('out');
      setTimeout(() => { root.remove(); removeEventListener('resize', resize); resolve(); }, 450);
    };
    root.querySelector('.intro-skip').onclick = e => { e.stopPropagation(); finish(); };
    root.querySelector('.intro-never').addEventListener('pointerdown', e => e.stopPropagation());   // 點勾選框不算點水面

    // 點水面：同色波紋，小魚好奇游過去看；點到小魚：牠一躍到中央
    root.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || holeOn) return;
      const x = e.clientX, y = e.clientY;
      if ((phase === 'emerge' || phase === 'idle') && fish.hit(x, y)) {
        ring(x, y, 2, .7);
        phase = 'startle'; pt = 0; hint.classList.add('gone');
        return;
      }
      ring(x, y, 3, 1);
      if (phase === 'idle' || phase === 'emerge') { target = { x, y }; curious = 1.6; }
    });
    enterBtn.onclick = e => {
      e.stopPropagation();
      enterBtn.classList.add('gone');
      holeOn = true; root.classList.add('revealing');
      ring(W / 2, H / 2, 4, 1.4);
      fish.reform(W / 2, H / 2, -Math.PI / 2);                  // 光點重新聚成小魚
      phase = 'reform'; pt = 0;
    };
    const logoTarget = () => {
      const el = document.querySelector('.rail .brand .seal-svg, .rail .brand');
      const r = el?.getBoundingClientRect();
      return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width } : { x: 50, y: 50, s: 46 };
    };

    let prev = performance.now();
    const frame = now => {
      if (!alive) return;
      const dt = Math.min(.05, (now - prev) / 1000); prev = now; time += dt; pt += dt; fish.t += dt;
      const h = fish.head;

      // ---- 劇本 ----
      if (phase === 'emerge') {                         // 從黑暗中慢慢浮現
        fish.alpha = Math.min(1, pt / 2.2);
        fish.steer(target.x, target.y, dt, curious > 0 ? 150 : 90, 1.8);
        if (pt > 3) { phase = 'idle'; pt = 0; hint.classList.add('show'); }
      } else if (phase === 'idle') {                    // 晃蕩；點過水面會好奇游過去
        if (curious > 0) curious -= dt;
        else if (Math.hypot(target.x - h.x, target.y - h.y) < 60) target = { x: W * rand(.25, .75), y: H * rand(.3, .7) };
        fish.steer(target.x, target.y, dt, curious > 0 ? 170 : 75, curious > 0 ? 3 : 1.4);
      } else if (phase === 'startle') {                 // 被點到：抖一下
        fish.swim = 2.2; fish.steer(W / 2, H / 2, dt, 40, 5);
        if (pt > .25) {
          phase = 'leap'; pt = 0; fish.swim = 1;
          leap = { sx: h.x, sy: h.y, ex: W / 2, ey: H / 2, cx: (h.x + W / 2) / 2, cy: Math.min(h.y, H / 2) - H * .26, dur: .95 };
        }
      } else if (phase === 'leap') {                    // 一躍到中央
        const k = Math.min(1, pt / leap.dur), e = ease(k);
        fish.place(bez(leap.sx, leap.cx, leap.ex, e), bez(leap.sy, leap.cy, leap.ey, e));
        fish.scale = 1 + .5 * Math.sin(Math.PI * k);
        if (k >= 1) { fish.scale = 1; splash(W / 2, H / 2); fish.dissolve(); phase = 'wait'; pt = 0; }
      } else if (phase === 'wait') {                    // 小魚化成光點消失，之後才浮出「請進」
        if (pt > 1.1 && enterBtn.hidden) { fish.alpha = 0; enterBtn.hidden = false; requestAnimationFrame(() => enterBtn.classList.add('show')); }
      } else if (phase === 'reform') {                  // 光點聚回小魚
        fish.steer(W / 2, H * .3, dt, 60, 1);
        if (pt > .9) {
          phase = 'loop'; pt = 0;
          const cx = W / 2, cy = H / 2, rr = Math.min(W, H) * .34;
          const a0 = Math.atan2(fish.head.y - cy, fish.head.x - cx);
          loop = { cx, cy, rr, a0, a: a0 };
        }
      } else if (phase === 'loop') {                    // 繞場一整圈
        loop.a += dt * 2.4;
        fish.steer(loop.cx + Math.cos(loop.a) * loop.rr * 1.25, loop.cy + Math.sin(loop.a) * loop.rr, dt, 420, 5);
        if (loop.a - loop.a0 > TAU) {
          phase = 'toLogo'; pt = 0;
          const L = logoTarget();
          leap = { sx: h.x, sy: h.y, ex: L.x, ey: L.y, cx: (h.x + L.x) / 2 + 80, cy: Math.min(h.y, L.y) - 120, dur: 1.05, s: L.s };
        }
      } else if (phase === 'toLogo') {                  // 跳進左上角的圖標，越游越小
        const k = Math.min(1, pt / leap.dur), e = ease(k);
        fish.place(bez(leap.sx, leap.cx, leap.ex, e), bez(leap.sy, leap.cy, leap.ey, e));
        const endScale = leap.s * 1.2 / S;
        fish.scale = (1 + (endScale - 1) * e) * (1 + .25 * Math.sin(Math.PI * k));
        if (k >= 1) {
          phase = 'merge'; pt = 0;
          for (let i = 0; i < 30; i++) { const a = rand(0, TAU), sp = rand(40, 200); glints.push({ x: leap.ex, y: leap.ey, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rand(.4, .9), hue: hueAt(Math.random()) }); }
          ripples.push({ x: leap.ex, y: leap.ey, life: 0, max: 1, p: .5, hue: hueAt(.4) });
          const brand = document.querySelector('.rail .brand');
          brand?.classList.add('logo-absorb'); setTimeout(() => brand?.classList.remove('logo-absorb'), 1400);
        }
      } else if (phase === 'merge') {                   // 和圖標融為一體
        fish.alpha = Math.max(0, 1 - pt / .3);
        fish.scale *= .95;
        if (pt > 1.1) finish();
      }
      if (fish.alpha > .3 && fish.mode === 'body' && Math.random() < dt * 2.5 && !holeOn) bubbles.push({ x: h.x, y: h.y, r: rand(1.2, 3), vy: rand(-26, -10), life: 0, max: rand(2, 4), ph: rand(0, 6) });

      // ---- 繪製 ----
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      if (holeOn) hole += dt * Math.hypot(W, H) * .55 * (.4 + Math.min(1, hole / 200));
      const maxR = Math.hypot(W, H) * .6;
      if (!holeOn || hole < maxR) {
        g.fillStyle = '#04040a'; g.fillRect(0, 0, W, H);
        const vg = g.createRadialGradient(W / 2, H * .55, 0, W / 2, H * .55, Math.max(W, H) * .7);
        vg.addColorStop(0, 'rgba(60,40,110,.2)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = vg; g.fillRect(0, 0, W, H);
        if (holeOn) {
          g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath();
          for (let i = 0; i <= 140; i++) {
            const a = i / 140 * TAU, r = hole + Math.sin(a * 7 + time * 4) * 14 + Math.sin(a * 13 - time * 3) * 7;
            const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r;
            i ? g.lineTo(x, y) : g.moveTo(x, y);
          }
          g.fill(); g.restore();
          for (let k = 0; k < 3; k++) {
            g.strokeStyle = `hsla(${hueAt(k / 3)},100%,85%,${.35 - k * .1})`; g.lineWidth = 2 - k * .5;
            g.beginPath(); g.arc(W / 2, H / 2, Math.max(1, hole - 10 - k * 18), 0, TAU); g.stroke();
          }
        }
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]; r.life += dt;
        if (r.life < 0) continue;
        if (r.life > r.max) { ripples.splice(i, 1); continue; }
        const k = r.life / r.max, rad = 6 + k * 240 * r.p;
        g.strokeStyle = `hsla(${r.hue},100%,80%,${(1 - k) * .65})`; g.lineWidth = 1.6 * (1 - k) + .4;
        g.beginPath(); g.ellipse(r.x, r.y, rad, rad * .62, 0, 0, TAU); g.stroke();
      }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]; b.life += dt;
        if (b.life > b.max) { bubbles.splice(i, 1); continue; }
        b.y += b.vy * dt; b.x += Math.sin(time * 2 + b.ph) * 10 * dt;
        g.strokeStyle = `rgba(230,200,255,${(1 - b.life / b.max) * .55})`; g.lineWidth = 1;
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.stroke();
      }
      fish.draw(g, time, dt);
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]; d.life += dt;
        if (d.life > d.max) { drops.splice(i, 1); continue; }
        d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        g.strokeStyle = `hsla(${d.hue},100%,88%,${1 - d.life / d.max})`; g.lineWidth = d.r;
        g.beginPath(); g.moveTo(d.x - d.vx * .015, d.y - d.vy * .015); g.lineTo(d.x, d.y); g.stroke();
      }
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = glints.length - 1; i >= 0; i--) {
        const p = glints[i]; p.life += dt;
        if (p.life > p.max) { glints.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .92; p.vy *= .92;
        g.fillStyle = `hsla(${p.hue},100%,85%,${1 - p.life / p.max})`; g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      g.restore();
      if (flash > 0) { g.fillStyle = `rgba(230,220,255,${flash})`; g.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * .9); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    if (reducedMotion()) finish();
  });
}
