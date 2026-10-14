// 召喚引導：小魚以外的粒子小精靈（星星、愛心、小貓、菱形光晶）
// 和小魚（intro.js 的 Fish）用同一組介面：head / scale / alpha / mode / swim / t、steer、place、reform、dissolve、draw，
// 所以 summonfx.js 的「躍進卡面 → 卡面裡游 → 翻牌時躍出」劇本可以直接套用
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** 設定頁的選項：[id, 名稱, 圖示] */
export const GUIDES = [
  ['fish', '小魚', '🐟'],
  ['star', '星星', '⭐'],
  ['heart', '愛心', '💗'],
  ['cute', '小貓', '🐱'],
  ['simple', '簡潔光晶', '◇'],
  ['none', '不要', '✕'],
];

// 形狀都畫在 128×128 的格子裡，中心 (64, 64)
const STYLE = {
  star: {
    hues: [44, 50, 38, 200], sat: 100, light: 76, round: false, spin: .5, fill: 260, edge: 200,
    path(g) {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 23 : 58; g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r); }
      g.closePath();
    },
  },
  heart: {
    hues: [335, 345, 355, 315], sat: 100, light: 76, round: true, beat: true, fill: 300, edge: 170,
    path(g) {
      g.beginPath(); g.moveTo(64, 112);
      g.bezierCurveTo(20, 84, 6, 58, 18, 36); g.bezierCurveTo(30, 14, 56, 16, 64, 38);
      g.bezierCurveTo(72, 16, 98, 14, 110, 36); g.bezierCurveTo(122, 58, 108, 84, 64, 112); g.closePath();
    },
  },
  cute: {
    hues: [330, 280, 200, 45], sat: 90, light: 82, round: true, fill: 320, edge: 160,
    path(g) {
      g.beginPath();
      g.moveTo(26, 52); g.lineTo(30, 14); g.lineTo(54, 34);   // 左耳
      g.lineTo(74, 34); g.lineTo(98, 14); g.lineTo(102, 52);  // 右耳
      g.arc(64, 70, 42, -.2, Math.PI + .2); g.closePath();
    },
    holes(g) {                                                 // 眼睛和鼻子挖空，看得出是小貓
      g.beginPath(); g.ellipse(48, 68, 5.5, 7, 0, 0, TAU); g.ellipse(80, 68, 5.5, 7, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(59, 82); g.lineTo(69, 82); g.lineTo(64, 88); g.closePath(); g.fill();
    },
  },
  simple: {
    hues: [200, 215, 230], sat: 55, light: 86, round: false, spin: .25, outline: true, fill: 0, edge: 300,
    path(g) {
      g.beginPath(); g.moveTo(64, 8); g.lineTo(104, 64); g.lineTo(64, 120); g.lineTo(24, 64); g.closePath();
      g.moveTo(64, 44); g.lineTo(78, 64); g.lineTo(64, 84); g.lineTo(50, 64); g.closePath();
    },
  },
};

/** 把形狀取樣成光點座標（-0.5 ~ 0.5） */
function sampleShape(st) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d', { willReadFrequently: true });
  const pick = (n, draw) => {
    g.clearRect(0, 0, 128, 128); g.fillStyle = g.strokeStyle = '#fff';
    draw();
    const d = g.getImageData(0, 0, 128, 128).data, pts = [];
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (d[(y * 128 + x) * 4 + 3] > 128) pts.push([x, y]);
    const out = [];
    for (let i = 0; i < n && pts.length; i++) { const [x, y] = pts[Math.floor(Math.random() * pts.length)]; out.push([(x + Math.random()) / 128 - .5, (y + Math.random()) / 128 - .5]); }
    return out;
  };
  const fill = st.fill ? pick(st.fill, () => { st.path(g); g.fill(); if (st.holes) { g.globalCompositeOperation = 'destination-out'; st.holes(g); g.globalCompositeOperation = 'source-over'; } }) : [];
  const edge = pick(st.edge, () => {
    st.path(g); g.lineWidth = st.outline ? 4 : 3; g.lineJoin = 'round'; g.stroke();
    if (st.holes) { g.lineWidth = 2; g.beginPath(); g.ellipse(48, 68, 7, 8.5, 0, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(80, 68, 7, 8.5, 0, 0, TAU); g.stroke(); }
  });
  return { fill, edge };
}

export class ShapeGuide {
  constructor(x, y, size, kind) {
    this.st = STYLE[kind] || STYLE.star;
    this.kind = kind; this.size = size; this.scale = 1; this.alpha = 0;
    this.ang = -Math.PI / 2; this.speed = 70; this.t = 0; this.swim = 1; this.mode = 'body';
    this.pos = { x, y }; this.vx = 0; this.mv = 0; this.lastPos = null;
    const { fill, edge } = sampleShape(this.st);
    const base = () => ({ ph: rand(0, TAU), rate: rand(2, 6), sz: rand(.7, 1.4), hue: this.st.hues[Math.floor(Math.random() * this.st.hues.length)] + rand(-6, 6), glint: Math.random() < .05 });
    this.parts = [...fill.map(([u, v]) => ({ ...base(), u, v, edge: false })), ...edge.map(([u, v]) => ({ ...base(), u, v, edge: true, sz: rand(.9, 1.5) }))];
    this.trail = [];
  }
  get head() { return this.pos; }
  /** 波紋、星光用的顏色 */
  randHue() { return this.st.hues[Math.floor(Math.random() * this.st.hues.length)]; }
  get D() { return this.size * this.scale * .62; }   // 形狀直徑（小魚的 size 是身長，形狀小一點才平衡）

  steer(tx, ty, dt, speed = 90, turn = 2.4) {
    const want = Math.atan2(ty - this.pos.y, tx - this.pos.x);
    this.ang += clamp(wrap(want - this.ang), -turn * dt, turn * dt);
    this.speed += (speed - this.speed) * (1 - Math.exp(-dt * 2.5));
    const vx = Math.cos(this.ang) * this.speed, vy = Math.sin(this.ang) * this.speed;
    this.pos.x += vx * dt; this.pos.y += vy * dt;
  }
  place(x, y) { this.pos.x = x; this.pos.y = y; }
  reset(x, y, ang) { this.pos = { x, y }; this.ang = ang; }
  /** 目前每顆光點在畫面上的位置 */
  partXY(p, rot, k) {
    const D = this.D * k, c = Math.cos(rot), s = Math.sin(rot);
    const x = p.u * D, y = p.v * D;
    return { x: this.pos.x + x * c - y * s, y: this.pos.y + x * s + y * c };
  }
  pose() {
    const st = this.st, t = this.t;
    let rot = Math.sin(t * 1.4) * .14 * this.swim + clamp(this.vx / 900, -.25, .25);   // 輕輕搖擺，往哪邊走就往哪邊斜
    if (st.spin) rot += Math.sin(t * st.spin) * .35;
    let k = 1 + Math.sin(t * 2.2) * .03;
    if (st.beat) { const b = (t * 1.6) % 1; k *= 1 + .1 * Math.exp(-b * 14) + .06 * Math.exp(-Math.max(0, b - .18) * 14) * (b > .18); }   // 撲通撲通
    return { rot, k };
  }
  dissolve() {
    const { rot, k } = this.pose();
    for (const p of this.parts) {
      const w = this.partXY(p, rot, k), a = Math.atan2(w.y - this.pos.y, w.x - this.pos.x) + rand(-.4, .4), sp = rand(60, 320);
      Object.assign(p, { wx: w.x, wy: w.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60 });
    }
    this.mode = 'free'; this.freeT = 0;
  }
  reform(x, y, ang) {
    this.reset(x, y, ang);
    for (const p of this.parts) { const a = rand(0, TAU), r = rand(60, 240); p.wx = x + Math.cos(a) * r; p.wy = y + Math.sin(a) * r; }
    this.mode = 'reform'; this.reformT = 0; this.alpha = 1;
  }

  draw(g, time, dt) {
    if (this.alpha <= 0) return;
    const st = this.st, { rot, k } = this.pose();
    if (this.mode === 'free') this.freeT += dt;
    if (this.mode === 'reform') { this.reformT += dt; if (this.reformT > .9) this.mode = 'body'; }
    const px = Math.max(1.4, this.D / 55);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      let x, y;
      if (this.mode === 'body') ({ x, y } = this.partXY(p, rot, k));
      else if (this.mode === 'free') {
        p.vx *= Math.exp(-1.6 * dt); p.vy = p.vy * Math.exp(-1.6 * dt) + 25 * dt; p.wx += p.vx * dt; p.wy += p.vy * dt; x = p.wx; y = p.wy;
      } else {
        const w = this.partXY(p, rot, k), e = ease(clamp(this.reformT / .8, 0, 1));
        x = p.wx + (w.x - p.wx) * e; y = p.wy + (w.y - p.wy) * e;
      }
      const tw = .45 + .55 * Math.pow(.5 + .5 * Math.sin(time * p.rate + p.ph), 2);
      const fade = this.mode === 'free' ? clamp(1 - this.freeT / 1.3, 0, 1) : 1;
      const a = tw * fade * this.alpha * (p.edge ? 1 : .7);
      if (a < .03) continue;
      g.fillStyle = `hsla(${p.hue},${st.sat}%,${p.edge ? st.light + 8 : st.light}%,${a})`;
      const s = p.sz * px;
      if (st.round) { g.beginPath(); g.arc(x, y, s * .6, 0, TAU); g.fill(); }
      else g.fillRect(x - s / 2, y - s / 2, s, s);
      if (p.glint && tw > .85) {
        g.fillStyle = `rgba(255,255,255,${(tw - .85) * 5 * fade * this.alpha})`;
        g.fillRect(x - s * 3, y - .5, s * 6, 1); g.fillRect(x - .5, y - s * 3, 1, s * 6);
      }
    }
    // 移動時灑出的星光
    // 速度：用上一格的位置算（steer 和 place 都適用）
    if (this.lastPos && dt > 0) {
      const vx = (this.pos.x - this.lastPos.x) / dt, vy = (this.pos.y - this.lastPos.y) / dt;
      this.vx += (vx - this.vx) * Math.min(1, dt * 8); this.mv = Math.hypot(vx, vy);
    }
    this.lastPos = { x: this.pos.x, y: this.pos.y };
    const mv = this.mv;
    if (this.mode === 'body' && this.alpha > .3) {
      let n = dt * (5 + Math.min(mv, 600) * .05);
      while (n > 0) {
        if (n >= 1 || Math.random() < n) {
          const src = this.parts[Math.floor(Math.random() * this.parts.length)], w = this.partXY(src, rot, k), a = rand(0, TAU);
          this.trail.push({ x: w.x, y: w.y, vx: Math.cos(a) * rand(4, 16), vy: Math.sin(a) * rand(4, 16) - 6, life: 0, max: rand(.7, 1.5), s: rand(.6, 1.3) * px, hue: this.randHue(), ph: rand(0, TAU) });
        }
        n -= 1;
      }
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const q = this.trail[i]; q.life += dt;
      if (q.life > q.max) { this.trail.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= .97; q.vy *= .97;
      const a = Math.sin(Math.PI * q.life / q.max) * (.6 + .4 * Math.sin(time * 9 + q.ph)) * this.alpha, L = q.s * 3;
      g.fillStyle = `hsla(${q.hue},${st.sat}%,88%,${a})`;
      g.beginPath(); g.moveTo(q.x, q.y - L); g.quadraticCurveTo(q.x, q.y, q.x + L, q.y); g.quadraticCurveTo(q.x, q.y, q.x, q.y + L); g.quadraticCurveTo(q.x, q.y, q.x - L, q.y); g.quadraticCurveTo(q.x, q.y, q.x, q.y - L); g.fill();
    }
    g.restore();
  }
}
