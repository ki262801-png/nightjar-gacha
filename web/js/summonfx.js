// 召喚演出的粒子層：背景光塵、星空躍遷、往卡片聚集的能量、閃電、翻開時的火花／碎晶／衝擊波／鏡頭光暈、
// 飛進收集列的彗星尾、SSR 星雨與金羽紙花，還有開場那隻粒子小魚（躍進卡面 → 粒子波紋 → 卡背由光點聚出來）
// 兩張 2D canvas（疊加混色）：後層在卡片後面，前層蓋在卡片上面；不另開 WebGL
import { reducedMotion } from './util.js';
import { Fish, hueAt } from './intro.js';
import { ShapeGuide } from './guides.js';

const rgb = hex => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex || '') || [0, 'c9', 'd6', 'f0'];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const bez = (a, c, b, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
const GOLD = [[255, 214, 130], [255, 170, 210], [255, 245, 220], [190, 210, 255]];

export class SummonFX {
  /** host：後層（卡片後面）；frontHost：前層要插在哪個元素後面（蓋在卡片上） */
  constructor(host, frontAfter = null) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'summon-fx';
    host.append(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.front = document.createElement('canvas');
    this.front.className = 'summon-fx front';
    if (frontAfter) frontAfter.after(this.front); else host.append(this.front);
    this.gf = this.front.getContext('2d');
    this.color = rgb('#c9d6f0');
    this.motes = []; this.sparks = []; this.rings = []; this.rays = []; this.comets = [];
    this.shards = []; this.bolts = []; this.flares = []; this.novas = []; this.flakes = [];
    this.charge = { x: 0, y: 0, s: 0 };
    this.warp = 0; this.warpTarget = 0; this.focus = null;
    this.starRainUntil = 0; this.flakeUntil = 0;
    this.guide = 'fish';   // 召喚引導：fish / star / heart / cute / simple（none 由 summon.js 直接略過）
    this.fish = null; this.fs = null; this.fishRings = []; this.rippleDots = []; this.time = 0;
    this.alive = true;
    this.calm = reducedMotion();
    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize);
    this.resize();
    for (let i = 0; i < 70; i++) this.motes.push(this.mote(true));
    this.stars = Array.from({ length: this.calm ? 0 : 240 }, () => this.star(true));
    this.prev = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = innerWidth; this.H = innerHeight;
    for (const c of [this.canvas, this.front]) { c.width = this.W * this.dpr; c.height = this.H * this.dpr; }
  }

  setColor(hex) { this.color = rgb(hex); }
  /** 能量往 (x, y) 聚集；s = 0 關掉，越大越密 */
  setCharge(x, y, s) { this.charge = { x, y, s }; if (s > 0) this.focus = { x, y }; }
  /** 星空躍遷：0 = 慢慢漂，1 以上 = 星星拉成光線往畫面外衝 */
  setWarp(level, x, y) { this.warpTarget = this.calm ? 0 : level; if (x != null) this.focus = { x, y }; }
  mote(initial) {
    return { x: rand(0, this.W), y: initial ? rand(0, this.H) : this.H + 10, r: rand(.4, 1.8), vy: rand(-18, -5), vx: rand(-4, 4),
      tw: rand(0, 6.28), white: Math.random() < .5 };
  }
  star(initial) {
    return { x: rand(-1, 1), y: rand(-1, 1), z: initial ? rand(.08, 1) : 1, pz: 1, r: rand(.5, 1.5), white: Math.random() < .6 };
  }

  /** 翻開：放射火花 + 碎晶 + 多道衝擊波 + 光芒 + 鏡頭光暈（SR / SSR 更多） */
  burst(x, y, rarity = 'R') {
    if (this.calm) return;
    const big = rarity === 'SSR', mid = rarity === 'SR';
    const n = big ? 220 : mid ? 120 : 55;
    const power = big ? 1.7 : mid ? 1.25 : .9;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(120, 680) * power;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0, max: rand(.6, 1.6) * (big ? 1.35 : 1),
        size: rand(1, 3.4), star: Math.random() < .3, white: Math.random() < .35, drag: rand(1.6, 3), front: Math.random() < .55, gold: big && Math.random() < .35 });
    }
    // 碎晶：像玻璃碎片一樣旋轉飛散
    const ns = big ? 46 : mid ? 26 : 10;
    for (let i = 0; i < ns; i++) {
      const a = rand(0, TAU), sp = rand(200, 760) * power;
      this.shards.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: rand(0, TAU), vr: rand(-9, 9), s: rand(6, 18) * (big ? 1.3 : 1),
        life: 0, max: rand(.7, 1.3), k: rand(.3, .8), gold: big && Math.random() < .5 });
    }
    this.ring(x, y, null, power);
    setTimeout(() => this.ring(x, y, '#ffffff', power * .8), 90);
    setTimeout(() => this.ring(x, y, null, power * .6), 200);
    if (big) setTimeout(() => this.ring(x, y, '#ffd98a', power * 1.1), 320);
    this.nova(x, y, big ? 520 : mid ? 380 : 240, big ? .9 : .7);
    if (rarity !== 'R') {
      for (let i = 0; i < (big ? 26 : 12); i++) this.rays.push({ x, y, a: rand(0, TAU), len: rand(.5, 1) * Math.hypot(this.W, this.H) * .7, w: rand(.01, .04), life: 0, max: rand(.6, 1.1), spin: rand(-.15, .15) });
      this.flare(x, y, big ? 1 : .7);
    }
  }

  ring(x, y, hex = null, power = 1) {
    if (this.calm) return;
    this.rings.push({ x, y, r: 10, vr: 900 * power, life: 0, max: .75, c: hex ? rgb(hex) : null, w: 6 * power });
  }

  /** 爆開的大光球（泛光） */
  nova(x, y, R = 300, a = .8, front = false) {
    if (this.calm) return;
    this.novas.push({ x, y, R, a, life: 0, max: .7, front });
  }

  /** 變形鏡頭光暈：一條橫向光帶 + 沿著對角線的光斑 */
  flare(x, y, k = 1) {
    if (this.calm) return;
    this.flares.push({ x, y, k, life: 0, max: 1.3 });
  }

  /** 閃電：從 a 打到 b（折線，閃爍後消失） */
  bolt(x0, y0, x1, y1, hex = null) {
    if (this.calm) return;
    const pts = [[x0, y0], [x1, y1]];
    let rough = Math.hypot(x1 - x0, y1 - y0) * .22;
    for (let it = 0; it < 5; it++, rough *= .55) {
      for (let i = pts.length - 1; i > 0; i--) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const nx = -(by - ay), ny = bx - ax, L = Math.hypot(nx, ny) || 1, o = rand(-1, 1) * rough;
        pts.splice(i, 0, [(ax + bx) / 2 + nx / L * o, (ay + by) / 2 + ny / L * o]);
      }
    }
    this.bolts.push({ pts, life: 0, max: rand(.22, .38), c: hex ? rgb(hex) : null });
  }

  /** 卡片四周隨機打幾道閃電 */
  zap(rect, n = 4, hex = null) {
    if (this.calm || !rect) return;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2, R = Math.hypot(rect.width, rect.height) * .9;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const ex = cx + Math.cos(a) * rect.width * .5, ey = cy + Math.sin(a) * rect.height * .5;
      setTimeout(() => this.bolt(cx + Math.cos(a + rand(-.3, .3)) * R, cy + Math.sin(a + rand(-.3, .3)) * R, ex, ey, hex), i * 60);
    }
  }

  /** 彗星：從 a 飛到 b，沿路灑光點 */
  comet(x0, y0, x1, y1, dur = .45) {
    if (this.calm) return;
    this.comets.push({ x0, y0, x1, y1, t: 0, dur, cx: (x0 + x1) / 2 + rand(-120, 120), cy: Math.min(y0, y1) - rand(40, 140) });
  }

  // ---------- 粒子小魚 ----------
  /** 小魚在卡片旁邊由光點聚成，游一小段後躍進卡面 → 粒子波紋擴散，卡背從中心往外一格一格由光點聚出來。
   *  rect = 卡片位置（restRect），img = 卡背圖（沒有就用內建紋章的配色）；卡背快聚好時 resolve */
  async fishEnter(rect, img, quick = false) {
    if (this.calm) return;
    if (img && !(img.complete && img.naturalWidth)) await Promise.race([img.decode?.().catch(() => { }), new Promise(r => setTimeout(r, 400))]);
    const S = Math.min(rect.width, rect.height);
    if (!this.fish) this.fish = this.guide === 'fish' ? new Fish(rect.cx, rect.cy, clamp(S * .62, 70, 170)) : new ShapeGuide(rect.cx, rect.cy, clamp(S * .62, 70, 170), this.guide);
    const f = this.fish, base = clamp(S * .62, 60, 200) / f.size;
    const side = Math.random() < .5 ? -1 : 1;
    const sx = clamp(rect.cx + side * (rect.width * .5 + S * .5), 50, this.W - 50), sy = clamp(rect.top + rect.height * .95, 60, this.H - 30);
    f.scale = base; f.swim = 1;
    f.reform(sx, sy, side > 0 ? -Math.PI * .7 : -Math.PI * .3);   // 頭朝上、斜向卡片
    const swim = quick ? .3 : .65, leap = quick ? .5 : .7, build = quick ? .55 : .85;
    this.fs = { mode: 'enter', t: 0, rect, sx, sy, side, base, swim, leap, build, targets: this.sampleBack(rect, img) };
    return new Promise(res => {
      this.fs.done = res;
      setTimeout(res, (swim + leap + build) * 1000 + 700);   // 分頁在背景時畫面不更新，保險
    });
  }

  /** 卡背取樣：每格一顆光點，顏色跟卡背一樣（含目前的卡背色調） */
  sampleBack(rect, img) {
    const w = rect.width, h = rect.height, cell = Math.max(4, Math.sqrt(w * h / 1700));
    const cols = Math.max(4, Math.round(w / cell)), rows = Math.max(4, Math.round(h / cell)), cw = w / cols, ch = h / rows;
    let px = null;
    if (img?.naturalWidth) try {
      const c = document.createElement('canvas'); c.width = cols; c.height = rows;
      const x = c.getContext('2d', { willReadFrequently: true });
      const ir = img.naturalWidth / img.naturalHeight, br = w / h;
      const dw = ir > br ? w : h * ir, dh = ir > br ? w / ir : h;   // 卡背是 object-fit: contain
      const flt = (getComputedStyle(img).filter || '').replace(/drop-shadow\((?:[^()]|\([^()]*\))*\)/g, '').trim();
      if (flt && flt !== 'none') x.filter = flt;
      x.drawImage(img, (w - dw) / 2 / cw, (h - dh) / 2 / ch, dw / cw, dh / ch);
      px = x.getImageData(0, 0, cols, rows).data;
    } catch { px = null; }
    const out = [], cx = rect.left + w / 2, cy = rect.top + h / 2, maxD = Math.hypot(w, h) / 2;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      let c;
      if (px) { const o = (j * cols + i) * 4; if (px[o + 3] < 90) continue; c = `rgb(${px[o]},${px[o + 1]},${px[o + 2]})`; }
      else {
        const e = Math.min(i, j, cols - 1 - i, rows - 1 - j);
        if ((i < 1 || i > cols - 2) && (j < 1 || j > rows - 2)) continue;   // 圓角
        c = e < 1 ? '#d6b475' : e < 2 ? '#3a3248' : Math.random() < .05 ? '#f4e2b0' : '#1b1d2b';
      }
      const x = rect.left + (i + .5) * cw, y = rect.top + (j + .5) * ch, d = Math.hypot(x - cx, y - cy) / maxD;
      const a = Math.atan2(y - cy, x - cx), r0 = rand(0, 26);
      out.push({ x, y, c, s: Math.max(cw, ch) * .95, d, sx: cx + Math.cos(a) * r0, sy: cy + Math.sin(a) * r0, sw: rand(-1, 1), g: Math.random() < .12 });
    }
    return out;
  }

  /** 粒子波紋：幾圈和小魚同色的水波 + 一圈往外散的光點 */
  fishRipple(x, y, p = 1) {
    if (this.calm) return;
    const pick = () => this.fish?.randHue ? this.fish.randHue() + rand(-8, 8) : hueAt(Math.random());   // 波紋跟引導小精靈同色
    const hue = pick();
    for (let k = 0; k < 3; k++) this.fishRings.push({ x, y, life: -k * .15, max: 1.3, p, hue: hue + k * 22 });
    const n = Math.round(80 * p);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rand(-.05, .05);
      this.rippleDots.push({ x, y, a, r: rand(2, 10), v: rand(170, 300) * p, life: 0, max: rand(.7, 1.2), hue: pick(), s: rand(1.4, 2.8) });
    }
  }

  /** 蓄力升級時，卡片裡的小魚嚇一跳、加速游 */
  fishStartle() {
    const fs = this.fs;
    if (!fs || fs.mode !== 'inside') return;
    fs.startle = .8; fs.target = null;
    const h = this.fish.head; this.fishRipple(h.x, h.y, .45);
  }

  /** 翻牌：小魚從卡面裡躍出、化成光點散開；回傳是否有小魚 */
  fishLeapOut(dur = .5) {
    const fs = this.fs;
    if (!fs) return false;
    const f = this.fish, r = fs.rect;
    if (fs.mode === 'build') {                         // 卡背還在聚形就要翻了：小魚直接在卡面中間聚形躍出
      fs.done?.(); fs.done = null;
      f.scale = fs.base * .82; f.reform(r.cx, r.cy + r.height * .15, -Math.PI / 2);
    } else if (fs.mode !== 'inside') { this.fishVanish(); return false; }
    const h = f.head;
    fs.mode = 'out'; fs.t = 0; fs.dur = dur;
    fs.leap = { sx: h.x, sy: h.y, ex: r.cx, ey: r.cy - r.height * .08, cx: (h.x + r.cx) / 2, cy: r.top - r.height * .45, s0: f.scale, s1: fs.base * 1.5 };
    f.alpha = 1;
    return true;
  }

  /** 馬上讓小魚化成光點（跳過演出、關閉時） */
  fishVanish() {
    const fs = this.fs;
    if (!fs) return;
    fs.done?.();
    if (this.fish.mode === 'body' && this.fish.alpha > .05) { this.fish.dissolve(); fs.mode = 'free'; fs.t = 0; }
    else this.fs = null;
  }

  /** 小魚的劇本與繪製（前層） */
  drawFish(dt) {
    const g = this.gf, fs = this.fs, f = this.fish;
    // 水波
    for (let i = this.fishRings.length - 1; i >= 0; i--) {
      const r = this.fishRings[i]; r.life += dt;
      if (r.life < 0) continue;
      if (r.life > r.max) { this.fishRings.splice(i, 1); continue; }
      const k = r.life / r.max, rad = 8 + (1 - (1 - k) ** 2) * 260 * r.p;
      g.strokeStyle = `hsla(${r.hue},100%,80%,${(1 - k) * .7})`; g.lineWidth = 2 * (1 - k) + .4;
      g.beginPath(); g.arc(r.x, r.y, rad, 0, TAU); g.stroke();
    }
    for (let i = this.rippleDots.length - 1; i >= 0; i--) {
      const d = this.rippleDots[i]; d.life += dt;
      if (d.life > d.max) { this.rippleDots.splice(i, 1); continue; }
      d.r += d.v * dt; d.v *= Math.exp(-2.2 * dt);
      const a = (1 - d.life / d.max), x = d.x + Math.cos(d.a) * d.r, y = d.y + Math.sin(d.a) * d.r;
      g.fillStyle = `hsla(${d.hue},100%,82%,${a})`; g.fillRect(x - d.s / 2, y - d.s / 2, d.s, d.s);
    }
    if (!fs || !f) return;
    fs.t += dt; f.t += dt;
    const r = fs.rect;
    if (fs.mode === 'enter') {                         // 在卡片旁聚形，往上游一小段
      f.steer(fs.sx - fs.side * r.width * .1, fs.sy - r.height * .45, dt, 170 * fs.base, 3);
      if (fs.t >= fs.swim) {
        const h = f.head;
        fs.mode = 'leap'; fs.t = 0;
        fs.jump = { sx: h.x, sy: h.y, cx: (h.x + r.cx) / 2, cy: Math.min(h.y, r.top) - r.height * .25 };
      }
    } else if (fs.mode === 'leap') {                   // 一躍，鑽進卡面（越來越小，像潛進水裡）
      const k = Math.min(1, fs.t / fs.leap), e = ease(k), j = fs.jump;
      f.place(bez(j.sx, j.cx, r.cx, e), bez(j.sy, j.cy, r.cy, e));
      f.scale = fs.base * (1 + .3 * Math.sin(Math.PI * k)) * (1 - .55 * k ** 3);
      if (k >= 1) {
        f.alpha = 0; fs.mode = 'build'; fs.t = 0;
        this.fishRipple(r.cx, r.cy, clamp(Math.max(r.width, r.height) / 260, .8, 1.6));
        for (let i = 0; i < 40; i++) { const a = rand(-Math.PI, 0), sp = rand(120, 420); this.sparks.push({ x: r.cx, y: r.cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rand(.5, 1), size: rand(1, 2.4), white: true, drag: 2.4, front: true }); }
      }
    } else if (fs.mode === 'build') {                  // 卡背由光點聚出來
      const B = fs.build, fade = fs.t > B ? clamp(1 - (fs.t - B) / .45, 0, 1) : 1;
      for (const q of fs.targets) {
        const k = clamp((fs.t - q.d * B * .45) / (B * .5), 0, 1);
        if (k <= 0) continue;
        const e = 1 - (1 - k) ** 3, sw = Math.sin(Math.PI * k) * 18 * q.sw;
        const dx = q.x - q.sx, dy = q.y - q.sy, L = Math.hypot(dx, dy) || 1;
        const x = q.sx + dx * e - dy / L * sw, y = q.sy + dy * e + dx / L * sw;
        const a = Math.min(1, k * 3) * fade;
        if (a < .02) continue;
        g.globalAlpha = a; g.fillStyle = q.c;
        const s = q.s * (.45 + .55 * e);
        g.fillRect(x - s / 2, y - s / 2, s, s);
        if (q.g && k > .6 && k < 1) { g.globalAlpha = a * (1 - k) * 2.5; g.fillStyle = '#fff'; g.fillRect(x - s * .3, y - s * .3, s * .6, s * .6); }
      }
      g.globalAlpha = 1;
      if (fs.t >= B * .8 && fs.done) { fs.done(); fs.done = null; }
      if (fs.t >= B + .45) {                           // 小魚在卡面裡重新聚形
        fs.mode = 'inside'; fs.t = 0; fs.target = null;
        f.scale = fs.base * .82;
        f.reform(r.cx + rand(-.15, .15) * r.width, r.cy + rand(-.15, .15) * r.height, rand(0, TAU));
        f.alpha = 0;
      }
    } else if (fs.mode === 'inside') {                 // 在卡面裡悠游（被卡片的形狀框住）
      f.alpha = Math.min(1, f.alpha + dt * 1.5);
      const h = f.head, startled = (fs.startle || 0) > 0;
      if (startled) fs.startle -= dt;
      if (!fs.target || Math.hypot(fs.target.x - h.x, fs.target.y - h.y) < 24 * fs.base) {
        const m = startled ? .12 : .22;
        fs.target = { x: r.left + r.width * rand(m, 1 - m), y: r.top + r.height * rand(m, 1 - m) };
      }
      f.swim = startled ? 2.3 : 1;
      f.steer(fs.target.x, fs.target.y, dt, (startled ? 230 : 75) * fs.base, startled ? 4.5 : 2);
    } else if (fs.mode === 'out') {                    // 從卡面裡躍出來
      const k = Math.min(1, fs.t / fs.dur), e = ease(k), j = fs.leap;
      f.place(bez(j.sx, j.cx, j.ex, e), bez(j.sy, j.cy, j.ey, e));
      f.scale = j.s0 + (j.s1 - j.s0) * e; f.swim = 1.6;
      if (k >= 1) { f.dissolve(); f.swim = 1; fs.mode = 'free'; fs.t = 0; this.fishRipple(j.ex, j.ey, 1.3); }
    } else if (fs.mode === 'free') {
      if (fs.t > 1.4) { f.alpha = 0; this.fs = null; return; }
    }
    if (f.alpha <= 0 || fs.mode === 'build') return;
    if (fs.mode === 'inside') {
      g.save(); g.beginPath();
      if (g.roundRect) g.roundRect(r.left, r.top, r.width, r.height, Math.min(r.width, r.height) * .05); else g.rect(r.left, r.top, r.width, r.height);
      g.clip();
      f.draw(g, this.time, dt);
      g.restore();
    } else f.draw(g, this.time, dt);
  }

  starRain(ms = 2500) { if (!this.calm) this.starRainUntil = performance.now() + ms; }
  /** SSR：金色羽片／菱形紙花從上面飄下來 */
  confetti(ms = 3000) { if (!this.calm) this.flakeUntil = performance.now() + ms; }

  loop(now) {
    if (!this.alive) return;
    requestAnimationFrame(this.loop);   // 先排下一格：就算這一格畫圖出錯，動畫也不會整個停住
    const dt = clamp((now - this.prev) / 1000, 0, .05); this.prev = Math.max(this.prev, now); this.time += dt;   // rAF 的時間戳可能比建立時還早
    const d = this.dpr, [cr, cg, cb] = this.color;
    for (const c of [this.g, this.gf]) { c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, this.W, this.H); c.globalCompositeOperation = 'lighter'; }
    const g = this.g, gf = this.gf;
    const col = (a, white) => white ? `rgba(255,255,255,${a})` : `rgba(${cr},${cg},${cb},${a})`;
    const gold = (i, a) => { const c = GOLD[i % GOLD.length]; return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

    // 星空躍遷
    this.warp += (this.warpTarget - this.warp) * Math.min(1, dt * (this.warpTarget > this.warp ? 2.2 : 5));
    const f = this.focus || { x: this.W / 2, y: this.H * .52 }, S = Math.max(this.W, this.H) * .5;
    const speed = .025 + this.warp * 1.4;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.pz = s.z; s.z -= speed * dt;
      if (s.z <= .03) { this.stars[i] = this.star(false); continue; }
      const x = f.x + s.x / s.z * S, y = f.y + s.y / s.z * S;
      if (x < -50 || x > this.W + 50 || y < -50 || y > this.H + 50) { this.stars[i] = this.star(false); continue; }
      const a = Math.min(1, (1 - s.z) * 1.6) * (.35 + Math.min(.6, this.warp * .5));
      if (this.warp > .12) {
        const px = f.x + s.x / s.pz * S, py = f.y + s.y / s.pz * S;
        const L = Math.min(1, this.warp) * 6;   // 拉長光線
        g.strokeStyle = col(a, s.white); g.lineWidth = s.r * (1.2 - s.z);
        g.beginPath(); g.moveTo(x + (px - x) * L, y + (py - y) * L); g.lineTo(x, y); g.stroke();
      } else {
        g.fillStyle = col(a * .8, s.white);
        g.beginPath(); g.arc(x, y, s.r * (1.3 - s.z), 0, TAU); g.fill();
      }
    }

    // 背景光塵
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.x += m.vx * dt; m.y += m.vy * dt; m.tw += dt * 2;
      if (m.y < -10) { this.motes[i] = this.mote(false); continue; }
      const a = .25 + .35 * Math.sin(m.tw) ** 2;
      g.fillStyle = col(a, m.white);
      g.beginPath(); g.arc(m.x, m.y, m.r, 0, TAU); g.fill();
    }

    // 泛光
    for (let i = this.novas.length - 1; i >= 0; i--) {
      const n = this.novas[i];
      n.life += dt; if (n.life > n.max) { this.novas.splice(i, 1); continue; }
      const t = n.life / n.max, R = n.R * (.4 + .9 * Math.sqrt(t)), a = n.a * (1 - t) ** 2;
      const G = n.front ? gf : g;
      const gr = G.createRadialGradient(n.x, n.y, 0, n.x, n.y, R);
      gr.addColorStop(0, col(a, true)); gr.addColorStop(.25, col(a * .7, false)); gr.addColorStop(1, col(0, false));
      G.fillStyle = gr; G.beginPath(); G.arc(n.x, n.y, R, 0, TAU); G.fill();
    }

    // 光芒（慢慢轉）
    for (let i = this.rays.length - 1; i >= 0; i--) {
      const r = this.rays[i];
      r.life += dt; if (r.life > r.max) { this.rays.splice(i, 1); continue; }
      r.a += r.spin * dt;
      const a = Math.sin(Math.PI * r.life / r.max) * .38;
      const gr = g.createLinearGradient(r.x, r.y, r.x + Math.cos(r.a) * r.len, r.y + Math.sin(r.a) * r.len);
      gr.addColorStop(0, col(a, true)); gr.addColorStop(.3, col(a * .7, false)); gr.addColorStop(1, col(0, false));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(r.x, r.y);
      g.lineTo(r.x + Math.cos(r.a - r.w) * r.len, r.y + Math.sin(r.a - r.w) * r.len);
      g.lineTo(r.x + Math.cos(r.a + r.w) * r.len, r.y + Math.sin(r.a + r.w) * r.len);
      g.closePath(); g.fill();
    }

    // 能量聚集：從外圈螺旋吸進卡片
    const c = this.charge;
    if (c.s > 0 && !this.calm) {
      const spawn = c.s * 80 * dt, n = Math.min(24, Math.floor(spawn) + (Math.random() < spawn % 1 ? 1 : 0));
      for (let k = 0; k < n; k++) {
        const a = rand(0, TAU), R = rand(180, 460);
        this.sparks.push({ x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R, inward: true, a, R, spin: rand(1.2, 2.4) * (Math.random() < .5 ? 1 : -1),
          life: 0, max: 9, size: rand(1, 2.4), white: Math.random() < .4, tx: c.x, ty: c.y, speed: rand(160, 320) * (.7 + c.s * .4), front: Math.random() < .3 });
      }
    }

    // 火花
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i], G = p.front ? gf : g;
      p.life += dt;
      if (p.inward) {
        p.R -= p.speed * dt; p.a += p.spin * dt * (1 + 200 / Math.max(30, p.R));
        const ox = p.x, oy = p.y;
        p.x = p.tx + Math.cos(p.a) * p.R; p.y = p.ty + Math.sin(p.a) * p.R;
        if (p.R < 18) { this.sparks.splice(i, 1); continue; }
        const a = Math.min(1, p.life * 3) * Math.min(1, p.R / 60) * .9;
        G.strokeStyle = col(a, p.white); G.lineWidth = p.size;
        G.beginPath(); G.moveTo(ox, oy); G.lineTo(p.x, p.y); G.stroke();
        continue;
      }
      if (p.life > p.max) { this.sparks.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + 140 * dt;
      const ox = p.x, oy = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.life / p.max;
      const fill = p.gold ? gold(i, a) : col(a, true);
      if (p.star) {
        const L = p.size * 4 * (.6 + .4 * Math.sin(p.life * 18));
        G.fillStyle = fill;
        G.beginPath(); G.moveTo(p.x, p.y - L); G.quadraticCurveTo(p.x, p.y, p.x + L, p.y); G.quadraticCurveTo(p.x, p.y, p.x, p.y + L);
        G.quadraticCurveTo(p.x, p.y, p.x - L, p.y); G.quadraticCurveTo(p.x, p.y, p.x, p.y - L); G.fill();
      } else {
        G.strokeStyle = p.gold ? fill : col(a, p.white); G.lineWidth = p.size * a + .3;
        G.beginPath(); G.moveTo(ox - p.vx * .02, oy - p.vy * .02); G.lineTo(p.x, p.y); G.stroke();
      }
    }

    // 粒子小魚與卡背聚形
    gf.globalCompositeOperation = 'source-over';
    this.drawFish(dt);
    gf.globalCompositeOperation = 'lighter';

    // 碎晶
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life += dt; if (s.life > s.max) { this.shards.splice(i, 1); continue; }
      const k = Math.exp(-2.2 * dt);
      s.vx *= k; s.vy = s.vy * k + 120 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
      const a = (1 - s.life / s.max), flick = .55 + .45 * Math.abs(Math.sin(s.rot * 2));   // 轉到某些角度會反光
      gf.save(); gf.translate(s.x, s.y); gf.rotate(s.rot); gf.scale(1, s.k + (1 - s.k) * Math.abs(Math.cos(s.rot)));
      gf.fillStyle = s.gold ? gold(i, a * .55 * flick) : col(a * .45 * flick, false);
      gf.strokeStyle = s.gold ? gold(i + 1, a) : col(a * flick, true); gf.lineWidth = 1;
      gf.beginPath(); gf.moveTo(0, -s.s); gf.lineTo(s.s * .55, s.s * .4); gf.lineTo(-s.s * .45, s.s * .55); gf.closePath(); gf.fill(); gf.stroke();
      gf.restore();
    }

    // 衝擊波
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt; if (r.life > r.max) { this.rings.splice(i, 1); continue; }
      r.r += r.vr * dt; r.vr *= Math.exp(-3 * dt);
      const a = (1 - r.life / r.max) * .8;
      gf.strokeStyle = r.c ? `rgba(${r.c[0]},${r.c[1]},${r.c[2]},${a})` : col(a, false);
      gf.lineWidth = r.w * (1 - r.life / r.max) + .5;
      gf.beginPath(); gf.arc(r.x, r.y, r.r, 0, TAU); gf.stroke();
      gf.strokeStyle = r.c ? `rgba(${r.c[0]},${r.c[1]},${r.c[2]},${a * .25})` : col(a * .25, false);   // 外側柔光
      gf.lineWidth = r.w * 4 * (1 - r.life / r.max);
      gf.beginPath(); gf.arc(r.x, r.y, r.r + r.w, 0, TAU); gf.stroke();
    }

    // 閃電
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life += dt; if (b.life > b.max) { this.bolts.splice(i, 1); continue; }
      const a = (1 - b.life / b.max) * (Math.random() < .25 ? .35 : 1);
      const cc = b.c ? `rgba(${b.c[0]},${b.c[1]},${b.c[2]},` : `rgba(${cr},${cg},${cb},`;
      for (const [w, al, white] of [[7, .18, false], [2.6, .6, false], [1, 1, true]]) {
        gf.strokeStyle = white ? `rgba(255,255,255,${a * al})` : cc + (a * al) + ')'; gf.lineWidth = w;
        gf.beginPath(); b.pts.forEach(([x, y], j) => j ? gf.lineTo(x, y) : gf.moveTo(x, y)); gf.stroke();
      }
    }

    // 鏡頭光暈
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const fl = this.flares[i];
      fl.life += dt; if (fl.life > fl.max) { this.flares.splice(i, 1); continue; }
      const t = fl.life / fl.max, a = (t < .08 ? t / .08 : (1 - t) ** 1.5) * fl.k;
      const half = this.W * (.35 + .4 * Math.min(1, t * 3));
      for (const [h, al] of [[2.5, .9], [14, .25], [48, .08]]) {
        const gr = gf.createLinearGradient(fl.x - half, 0, fl.x + half, 0);
        gr.addColorStop(0, col(0, false)); gr.addColorStop(.5, col(a * al, al > .5)); gr.addColorStop(1, col(0, false));
        gf.fillStyle = gr; gf.fillRect(fl.x - half, fl.y - h / 2, half * 2, h);
      }
      // 光斑：從光源往畫面中心的反方向排開
      const cx = this.W / 2, cy = this.H / 2, vx = cx - fl.x, vy = cy - fl.y;
      [[.5, 26, .14], [1.2, 14, .2], [1.6, 40, .08], [2.1, 18, .12]].forEach(([u, r, al], j) => {
        const x = fl.x + vx * u + (j - 1.5) * 40 * t, y = fl.y + vy * u + 30 * (u - 1);
        gf.fillStyle = j % 2 ? col(a * al, false) : gold(j, a * al);
        gf.beginPath();
        for (let q = 0; q < 6; q++) { const th = q / 6 * TAU + .5; gf[q ? 'lineTo' : 'moveTo'](x + Math.cos(th) * r, y + Math.sin(th) * r); }
        gf.closePath(); gf.fill();
      });
    }

    // 彗星尾
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const m = this.comets[i];
      m.t += dt / m.dur;
      if (m.t >= 1) { this.comets.splice(i, 1); continue; }
      const t = m.t, u = 1 - t;
      const x = u * u * m.x0 + 2 * u * t * m.cx + t * t * m.x1, y = u * u * m.y0 + 2 * u * t * m.cy + t * t * m.y1;
      for (let k = 0; k < 4; k++) this.sparks.push({ x: x + rand(-6, 6), y: y + rand(-6, 6), vx: rand(-40, 40), vy: rand(-40, 20), life: 0, max: rand(.3, .7), size: rand(.8, 2), white: Math.random() < .5, drag: 3, front: true });
      const gr = gf.createRadialGradient(x, y, 0, x, y, 22);
      gr.addColorStop(0, col(.9, true)); gr.addColorStop(.4, col(.5, false)); gr.addColorStop(1, col(0, false));
      gf.fillStyle = gr; gf.beginPath(); gf.arc(x, y, 22, 0, TAU); gf.fill();
    }

    // SSR 星雨
    if (now < this.starRainUntil && Math.random() < .8) {
      this.sparks.push({ x: rand(0, this.W), y: -10, vx: rand(-30, 30), vy: rand(80, 220), life: 0, max: rand(2, 3.5), size: rand(1.5, 3.2), star: true, white: Math.random() < .5, drag: .2, front: Math.random() < .4, gold: Math.random() < .4 });
    }
    // 金羽紙花
    if (now < this.flakeUntil && Math.random() < .55) {
      this.flakes.push({ x: rand(-40, this.W + 40), y: -20, vy: rand(60, 140), sway: rand(20, 60), ph: rand(0, TAU), rot: rand(0, TAU), vr: rand(-4, 4), s: rand(4, 9), c: Math.floor(rand(0, 4)), life: 0, max: rand(4, 7), feather: Math.random() < .35 });
    }
    for (let i = this.flakes.length - 1; i >= 0; i--) {
      const p = this.flakes[i];
      p.life += dt; if (p.life > p.max || p.y > this.H + 30) { this.flakes.splice(i, 1); continue; }
      p.y += p.vy * dt; p.ph += dt * 2; p.rot += p.vr * dt;
      const x = p.x + Math.sin(p.ph) * p.sway, flip = Math.cos(p.rot * 1.7);   // 翻面時寬度變化
      const a = Math.min(1, p.life * 2, (p.max - p.life) * 1.5) * (.55 + .45 * Math.abs(flip));
      gf.save(); gf.translate(x, p.y); gf.rotate(p.rot * .4); gf.scale(Math.max(.15, Math.abs(flip)), 1);
      gf.fillStyle = gold(p.c, a);
      gf.beginPath();
      if (p.feather) { gf.ellipse(0, 0, p.s * .45, p.s * 1.8, 0, 0, TAU); }
      else { gf.moveTo(0, -p.s); gf.lineTo(p.s * .6, 0); gf.lineTo(0, p.s); gf.lineTo(-p.s * .6, 0); gf.closePath(); }
      gf.fill(); gf.restore();
    }

    for (const cx of [g, gf]) cx.globalCompositeOperation = 'source-over';
  }

  destroy() {
    this.alive = false;
    removeEventListener('resize', this.resize);
    this.canvas.remove(); this.front.remove();
  }
}
