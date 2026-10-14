// LiveStage：把一張圖變成「動態皮膚」
// - 深度視差：用深度圖做光線步進（ray-march），近處遮擋遠處，不是單純位移
// - 部件形變：每個部件是一張柔邊遮罩 + 動作（呼吸、擺動、飄動、漂浮、眨眼、看向游標）
// - 前景粒子與掃光
import { loadImage, clamp } from './util.js';

export const PART_TYPES = [
  { id: 'wave', name: '飄動', hint: '頭髮、裙擺、緞帶：支點放在根部，越遠擺越大', pivot: 'top' },
  { id: 'breath', name: '呼吸', hint: '胸口、肩膀：以支點為底緩慢起伏', pivot: 'bottom' },
  { id: 'sway', name: '擺動', hint: '頭部、手臂、耳環：繞支點小角度旋轉', pivot: 'bottom' },
  { id: 'blink', name: '眨眼', hint: '只塗眼睛範圍；支點自動放在眼睛中線', pivot: 'center' },
  { id: 'float', name: '漂浮', hint: '飾品、光球、整個人物：上下輕浮', pivot: 'center' },
  { id: 'follow', name: '看向游標', hint: '臉或眼睛：隨游標方向微微偏移', pivot: 'center' },
];
const TYPE_INDEX = { breath: 0, sway: 1, wave: 2, float: 3, blink: 4, follow: 5 };
export const MAX_PARTS = 8;
export const TINTS = ['none', 'warm', 'cool', 'vintage', 'mono', 'dream', 'starry', 'tealorange', 'japan', 'faded', 'kodak', 'fuji', 'cyber', 'sunset', 'forest', 'sepia', 'noir', 'bleach', 'candy'];
export const PARTICLES = [['none', '無'], ['dust', '光塵'], ['sparkle', '星光'], ['stars', '星星'], ['fireflies', '螢火蟲'], ['petal', '花瓣'], ['leaves', '落葉'], ['feathers', '羽毛'],
  ['snow', '雪'], ['crystals', '冰晶'], ['rain', '雨絲'], ['bubbles', '泡泡'], ['embers', '火星'], ['shooting', '流星'], ['hearts', '愛心'], ['butterflies', '蝴蝶'],
  ['bokeh', '散景光斑'], ['confetti', '彩紙'], ['lanterns', '天燈'], ['notes', '音符'], ['dandelion', '蒲公英'], ['orbs', '魔法光球'], ['runes', '浮現符文'],
  // v39 新增
  ['maple', '楓葉'], ['ginkgo', '銀杏葉'], ['roses', '玫瑰花瓣'], ['snowflake', '雪花結晶'], ['pollen', '花粉光點'], ['ash', '灰燼'], ['smoke', '煙霧'],
  ['clouds', '雲朵'], ['moons', '月牙'], ['starfall', '落星'], ['gems', '寶石碎片'], ['glitter', '金粉閃片'], ['coins', '金幣'], ['ribbons', '彩帶'],
  ['balloons', '氣球'], ['planes', '紙飛機'], ['birds', '飛鳥'], ['bats', '蝙蝠'], ['ghosts', '小幽靈'], ['fish', '小魚'], ['jellyfish', '水母'],
  ['code', '數位雨'], ['pixels', '像素方塊'], ['hexagons', '科技六角']];
const SIDEWAYS = new Set(['clouds', 'birds', 'bats', 'fish', 'planes']);   // 橫向移動的粒子
// 羽毛粒子用素材庫的羽毛圖
const featherImg = new Image();
featherImg.src = 'assets/deco/feather-f09.webp';

const FX_UNIFORMS = [['glitch', 'uGlitch'], ['scan', 'uScan'], ['wave', 'uWave'], ['caustic', 'uCaustic'], ['aurora', 'uAurora'], ['flash', 'uFlash'], ['pixel', 'uPixel'], ['prism', 'uPrism'], ['neon', 'uNeon'], ['tilt', 'uTilt'], ['hue', 'uHue'], ['frost', 'uFrost']];

export const DEFAULT_FX = {
  parallax: 0.045, focus: 0.5, motion: 'mouse', motionSpeed: 0.6, sweep: 0.0,
  particles: 'none', particleCount: 40, vignette: 0.0, breathe: 0.0,
  bloom: 0, chroma: 0, grain: 0, fog: 0, leak: 0, tint: 'none', tintAmount: .6, rays: 0, particles2: 'none', particles3: 'none', rain: 0, rainFog: 0,
  glitch: 0, scan: 0, wave: 0, caustic: 0, aurora: 0, flash: 0, pixel: 0, prism: 0, neon: 0, tilt: 0, hue: 0, frost: 0,
  exposure: 0, contrast: 0, saturation: 0, temperature: 0, sharpen: 0, sweepSpeed: 1, particleSize: 1, particleSpeed: 1, particleOpacity: 1, wind: 0,
  // v38：進階調色、風格化、鏡頭
  tintG: 0, vibrance: 0, shadows: 0, highlights: 0, fade: 0, splitAmt: 0, splitShadow: .55, splitHigh: .08,
  posterize: 0, halftone: 0, ink: 0, oil: 0, sketch: 0, dither: 0, emboss: 0, thermal: 0, nightvision: 0, watercolor: 0, invert: 0, duotone: 0, duoDark: .7, duoLight: .12,
  dof: 0, flare: 0, fisheye: 0, zoomBlur: 0,
};

const VS = `attribute vec2 aPos; varying vec2 vUv;
void main(){ vUv = vec2(aPos.x*.5+.5, .5-aPos.y*.5); gl_Position = vec4(aPos,0.,1.); }`;

/** 部件形變的 GLSL（LiveStage 與閃卡共用）；宿主 shader 需宣告 uMaskA/uMaskB/uA/uB/uC/uCount/uAspect/uTime/uLook */
export const DEFORM_CHUNK = `uniform float uPoke;   // 戳一下：部件暫時晃得更大
float shade = 0.;

float maskAt(int i, vec2 uv){
  vec4 m = i < 4 ? texture2D(uMaskA, uv) : texture2D(uMaskB, uv);
  int c = i < 4 ? i : i - 4;
  return c == 0 ? m.r : c == 1 ? m.g : c == 2 ? m.b : m.a;
}
vec2 toSq(vec2 d){ return d * vec2(uAspect, 1.); }
vec2 fromSq(vec2 d){ return d / vec2(uAspect, 1.); }

vec2 deform(vec2 uv){
  vec2 acc = vec2(0.);
  for (int i = 0; i < 8; i++) {
    if (i >= uCount) break;
    float w = maskAt(i, uv);
    if (w < .003) continue;
    vec4 a = uA[i]; vec4 b = uB[i];
    float type = a.x, amp = a.w * (1. + uPoke * 2.); vec2 piv = a.yz;
    float t = uTime * b.x * 6.2831853 + b.y;
    vec2 d = toSq(uv - piv);
    vec2 res = uv;
    if (type < .5) {            // 呼吸
      float s = amp * .03 * (.5 - .5 * cos(t));
      res = piv + fromSq(d / vec2(1. + s * .45, 1. + s));
    } else if (type < 1.5) {    // 擺動
      float ang = amp * .055 * sin(t);
      float c = cos(-ang), sn = sin(-ang);
      res = piv + fromSq(vec2(c * d.x - sn * d.y, sn * d.x + c * d.y));
    } else if (type < 2.5) {    // 飄動
      float dist = length(d);
      float k = smoothstep(0., 1., dist / max(b.w, .05));
      float wave = sin(t - dist * 9.) * .7 + sin(t * 1.63 - dist * 15. + 1.3) * .3;
      vec2 dir = vec2(cos(b.z), sin(b.z));
      res = uv - fromSq(dir * amp * .022 * wave * k);
    } else if (type < 3.5) {    // 漂浮
      res = uv - vec2(0., amp * .012 * sin(t));
    } else if (type < 4.5) {    // 眨眼
      float cyc = fract(uTime * b.x * .22 + b.y);
      float cl = smoothstep(0., .035, cyc) * (1. - smoothstep(.05, .1, cyc)) * amp;
      float s = mix(1., .06, cl);
      float H = max(uC[i].x, .004);
      res = vec2(uv.x, piv.y + clamp((uv.y - piv.y) / s, -H, H));
      shade += w * cl * exp(-pow((uv.y - piv.y) / (H * .22), 2.)) * .55;
    } else {                    // 看向游標
      res = uv - fromSq(uLook * amp * .014);
    }
    acc += (res - uv) * w;
    acc += vec2(sin(uTime * 23. + float(i)), cos(uTime * 19. + float(i))) * .004 * uPoke * w;
  }
  return uv + acc;
}

`;

const FS = `precision highp float;
varying vec2 vUv;
uniform sampler2D uImage, uDepth, uMaskA, uMaskB, uWipe;
uniform float uHasWipe;
uniform vec4 uRip[4];   // 點擊水波：x, y, 開始時間, 強度
uniform vec2 uFit;        // 螢幕→圖片 uv 縮放
uniform float uZoom, uTime, uParallax, uFocus, uDolly, uAspect, uSweep, uVignette, uBreathe, uBloom, uChroma, uGrain, uFog, uLeak, uTint, uTintAmt;
uniform vec2 uCam, uLook;
uniform float uRain, uRainFog, uScreenAr, uSharpen, uSweepSpeed;
uniform vec4 uGrade;   // 曝光, 對比, 飽和度, 色溫
uniform vec4 uGrade2;  // 色調(綠↔洋紅), 自然飽和, 陰影, 高光
uniform vec4 uGrade3;  // 褪色, 分離色調強度, 暗部色相, 亮部色相
uniform vec4 uStyle1;  // 色調分離, 網點, 漫畫描線, 油畫
uniform vec4 uStyle2;  // 素描, 抖色, 浮雕, 熱成像
uniform vec4 uStyle3;  // 夜視, 水彩, 反相, 雙色調
uniform vec4 uDuo;     // 雙色調：暗色色相, 亮色色相
uniform vec4 uLens;    // 背景虛化, 鏡頭光斑, 魚眼, 放射模糊
uniform float uGlitch, uScan, uWave, uCaustic, uAurora, uFlash, uPixel, uPrism, uNeon, uTilt, uHue, uFrost;
uniform int uHasDepth, uCount;
uniform vec4 uA[8]; // type, pivot.x, pivot.y, amp
uniform vec4 uB[8]; // speed, phase, dir, reach
uniform vec4 uC[8]; // halfHeight, -, -, -
${DEFORM_CHUNK}
// ---- 窗上雨滴：q 是螢幕座標（x 已乘上寬高比），回傳 (水滴高度, 被水痕擦乾淨的程度) ----
float rh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
vec2 rainField(vec2 q, float t){
  float hgt = 0., clear = 0.;
  // 靜止的小水珠：一格一顆，慢慢出現再消失
  for (int L = 0; L < 2; L++) {
    float sc = L == 0 ? 16. : 27.;
    vec2 g = q * sc + float(L) * 7.3, id = floor(g), f = fract(g) - .5;
    float n = rh(id + float(L) * 3.7);
    if (n > uRain * (L == 0 ? .36 : .2)) continue;
    vec2 o = vec2(rh(id + 3.1), rh(id + 7.7)) - .5;
    float life = fract(t * .05 + rh(id + 5.3));
    float r = (.1 + .16 * rh(id + 1.7)) * smoothstep(0., .1, life) * smoothstep(1., .75, life);
    hgt += smoothstep(r, r * .2, length((f - o * .4) * vec2(1., .9))) * .7;   // 位移 + 半徑不超出格子，水珠才不會被切成方形
  }
  // 滑落的大水滴：每一欄一滴，左右微微蛇行，上方留下擦乾淨的水痕與殘留的小水珠
  for (int L = 0; L < 2; L++) {
    float cols = L == 0 ? 3.2 : 5.1;
    float cx = q.x * cols + float(L) * .37, ci = floor(cx), cn = rh(vec2(ci, 9. + float(L)));
    if (cn > uRain * .75) continue;
    float spd = .035 + .05 * rh(vec2(ci, 4.));
    float yd = fract(t * spd + cn * 3.) * 1.5 - .25;
    float wig = sin(q.y * 7. + cn * 20.) * .1 + sin(q.y * 19. + cn * 7.) * .04;
    float dx = (fract(cx) - .5 - wig) / cols;
    float r = .018 + .012 * rh(vec2(ci, 2.));
    vec2 d = vec2(dx, (q.y - yd) * .8);
    hgt += smoothstep(r, r * .25, length(d)) * 1.3;
    float up = yd - q.y;                                                   // 水滴上方的距離
    float lane = smoothstep(r * .9, r * .3, abs(dx)) * smoothstep(0., .01, up) * smoothstep(.6, .05, up);
    clear = max(clear, lane);
    float cell = floor(q.y * 34.), fy = fract(q.y * 34.) - .5;
    float bead = smoothstep(.32, .05, length(vec2(dx * 34. * 1.2, fy))) * step(.45, rh(vec2(ci, cell))) * lane;
    hgt += bead * .55;
  }
  return vec2(hgt, clear);
}

vec3 SMP(vec2 q){ return texture2D(uImage, clamp(q, vec2(.0005), vec2(.9995))).rgb; }
float LUM(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
vec3 HUE(float h){ return clamp(abs(mod(h * 6. + vec3(0., 4., 2.), 6.) - 3.) - 1., 0., 1.); }
float EDGE(vec2 q, float w){                // Sobel 邊緣強度
  vec2 e = vec2(w / uAspect, w);
  float tl = LUM(SMP(q - e)), tr = LUM(SMP(q + vec2(e.x, -e.y))), bl = LUM(SMP(q + vec2(-e.x, e.y))), br = LUM(SMP(q + e));
  float t = LUM(SMP(q - vec2(0., e.y))), b = LUM(SMP(q + vec2(0., e.y))), l = LUM(SMP(q - vec2(e.x, 0.))), r = LUM(SMP(q + vec2(e.x, 0.)));
  return length(vec2(tr + 2. * r + br - tl - 2. * l - bl, bl + 2. * b + br - tl - 2. * t - tr));
}
float M2(float x, float y){ return mod(2. * x + 3. * y, 4.); }

vec2 parallax(vec2 uv){
  vec2 off = uCam * uParallax + (uv - .5) * uDolly;
  if (uHasDepth == 0) return uv - off * .35;
  const int N = 28;
  float prevH = 1.;
  vec2 prevP = uv - off * (1. - uFocus);
  float prevD = texture2D(uDepth, prevP).r;
  for (int i = 1; i <= N; i++) {
    float hgt = 1. - float(i) / float(N);
    vec2 p = uv - off * (hgt - uFocus);
    float dv = texture2D(uDepth, p).r;
    if (dv >= hgt) {
      float a = (prevD - prevH) / ((prevD - prevH) - (dv - hgt) - 1e-5);
      return mix(prevP, p, clamp(a, 0., 1.));
    }
    prevH = hgt; prevP = p; prevD = dv;
  }
  return prevP;
}

void main(){
  vec2 uv = (vUv - .5) * uFit + .5;
  float inside = step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.);
  uv = (uv - .5) / (1. + uZoom + uBreathe * (.5 - .5 * cos(uTime * .5))) + .5;
  uv = (uv - .5) / (1. + uPoke * .012 * sin(uTime * 22.)) + .5;   // 戳一下：整張輕輕彈一下
  if (uLens.z != 0.) {                      // 魚眼（正值中間鼓起）／枕形（負值）
    vec2 d = uv - .5, da = d * vec2(uAspect, 1.) / max(uAspect, 1.);
    uv = .5 + d * (1. + uLens.z * (dot(da, da) * 1.6 - .32));
  }
  vec2 p = parallax(deform(uv));
  // ---- 點擊水波：從點擊處擴散的一圈圈波紋 ----
  float ripLight = 0.;
  for (int k = 0; k < 4; k++) {
    vec4 rp = uRip[k];
    if (rp.w <= 0.) continue;
    float age = uTime - rp.z;
    if (age < 0. || age > 3.) continue;
    vec2 dd = (vUv - rp.xy) * vec2(uScreenAr, 1.);
    float dist = length(dd), front = age * .45;
    float wv = sin((dist - front) * 70.) * exp(-pow((dist - front) / .07, 2.)) * exp(-age * 1.3) * rp.w;
    p += normalize(dd + 1e-5) * wv * .006 * vec2(1. / uScreenAr, 1.) * uFit;
    ripLight += wv;
  }
  // ---- 畫面扭曲類濾鏡 ----
  if (uWave > 0.) p += vec2(sin(vUv.y * 38. + uTime * 3.1), cos(vUv.x * 29. + uTime * 2.6)) * .0028 * uWave;            // 熱浪
  if (uCaustic > 0.) p += vec2(sin(vUv.y * 11. + uTime * 1.3) + sin(vUv.x * 7. + uTime * .9), cos(vUv.x * 9. + uTime * 1.1) + cos(vUv.y * 13. - uTime * .7)) * .0018 * uCaustic;   // 水底
  float glt = 0.;
  if (uGlitch > 0.) {                       // 故障：隨機橫條錯位
    float row = floor(vUv.y * 36.), tk = floor(uTime * 9.);
    glt = step(1. - uGlitch * .3, rh(vec2(row, tk)));
    p.x += (rh(vec2(row + 3., tk)) - .5) * .08 * uGlitch * glt;
  }
  if (uPixel > 0.) { vec2 pn = vec2(uAspect, 1.) * mix(260., 34., uPixel); p = (floor(p * pn) + .5) / pn; }   // 像素化
  p = clamp(p, vec2(.0005), vec2(.9995));
  float fogAmt = 0.;
  if (uRain > 0. || uRainFog > 0.) {        // 窗上雨滴：水滴像小透鏡折射後面的畫面，其他地方起霧
    vec2 q = vec2(vUv.x * uScreenAr, vUv.y);
    float e = .0016;
    float wp = uHasWipe > .5 ? texture2D(uWipe, vUv).a : 0.;   // 擦過的玻璃：霧與水珠暫時消失
    vec2 r0 = rainField(q, uTime);
    float hx = rainField(q + vec2(e, 0.), uTime).x, hy = rainField(q + vec2(0., e), uTime).x;
    vec2 nrm = vec2(hx - r0.x, hy - r0.x) / e * (1. - wp);
    r0.x *= 1. - wp;
    p = clamp(p - nrm * .0006 * vec2(1. / uScreenAr, 1.) * uFit, vec2(.0005), vec2(.9995));   // 螢幕位移換算成圖片 uv
    fogAmt = uRainFog * (1. - clamp(r0.x * 2.5 + r0.y, 0., 1.)) * (1. - wp);
  }
  vec4 col = texture2D(uImage, p);
  if (fogAmt > .01) {                       // 霧面玻璃：周圍取樣模糊
    vec4 acc = col;
    for (int k = 0; k < 12; k++) {
      float a = float(k) * .5236 + .3, rr = (k < 6 ? .0035 : .008) * fogAmt;
      acc += texture2D(uImage, clamp(p + vec2(cos(a) / uScreenAr, sin(a)) * rr * uFit, .0005, .9995));
    }
    col = mix(col, acc / 13., clamp(fogAmt * 1.1, 0., .85));   // 最濃也保留一點清晰度
    col.rgb = mix(col.rgb, col.rgb * .86 + .08, fogAmt * .3);
  }
  col.rgb += ripLight * .06;
  // ---- 風格化（需要重新取樣原圖的放前面，之後的調色仍然有效） ----
  if (uStyle1.w > 0.) {                     // 油畫（Kuwahara：四個方向取變化最小的平均）
    vec2 s = vec2(1. / uAspect, 1.) * (.0012 + .0022 * uStyle1.w);
    vec3 m0 = vec3(0.), m1 = m0, m2 = m0, m3 = m0, q0 = m0, q1 = m0, q2 = m0, q3 = m0;
    for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
      vec2 o = vec2(float(i), float(j)) * s;
      vec3 c0 = SMP(p - o); m0 += c0; q0 += c0 * c0;
      vec3 c1 = SMP(p + vec2(o.x, -o.y)); m1 += c1; q1 += c1 * c1;
      vec3 c2 = SMP(p + vec2(-o.x, o.y)); m2 += c2; q2 += c2 * c2;
      vec3 c3 = SMP(p + o); m3 += c3; q3 += c3 * c3;
    }
    m0 /= 9.; m1 /= 9.; m2 /= 9.; m3 /= 9.;
    float v0 = dot(q0 / 9. - m0 * m0, vec3(1.)), v1 = dot(q1 / 9. - m1 * m1, vec3(1.)), v2 = dot(q2 / 9. - m2 * m2, vec3(1.)), v3 = dot(q3 / 9. - m3 * m3, vec3(1.));
    vec3 o = m0; float mv = v0;
    if (v1 < mv) { mv = v1; o = m1; } if (v2 < mv) { mv = v2; o = m2; } if (v3 < mv) { o = m3; }
    col.rgb = mix(col.rgb, o, clamp(uStyle1.w * 1.6, 0., 1.));
  }
  if (uStyle3.y > 0.) {                     // 水彩：暈開、色塊、邊緣積色、紙紋
    vec3 acc = SMP(p);
    for (int k = 0; k < 8; k++) { float a = float(k) * .785; acc += SMP(p + vec2(cos(a) / uAspect, sin(a)) * .0045); }
    vec3 w = acc / 9.;
    w = mix(w, floor(w * 6. + .5) / 6., .45);
    w *= 1. - smoothstep(.12, .5, EDGE(p, .0018)) * .3;
    float paper = rh(floor(vUv * vec2(uScreenAr, 1.) * 420.)) * .5 + rh(floor(vUv * vec2(uScreenAr, 1.) * 90.) + 3.) * .5;
    w = mix(w, vec3(1.), .1) * (.93 + .07 * paper);
    col.rgb = mix(col.rgb, w, uStyle3.y);
  }
  if (uStyle2.x > 0.) {                     // 鉛筆素描
    float l = LUM(SMP(p)), ed = EDGE(p, .0012);
    float pencil = 1. - smoothstep(.06, .42, ed);
    float hatch = mix(.72 + .28 * step(.5, fract((vUv.x * uScreenAr + vUv.y) * 95.)), 1., smoothstep(.25, .6, l));
    float s = pencil * hatch * mix(.82, 1., smoothstep(.15, .7, l));
    col.rgb = mix(col.rgb, vec3(s) * vec3(.99, .97, .93), uStyle2.x);
  }
  if (uStyle2.z > 0.) {                     // 浮雕
    vec2 e = vec2(.0016 / uAspect, .0016);
    float g = .5 + (LUM(SMP(p - e)) - LUM(SMP(p + e))) * 3.;
    col.rgb = mix(col.rgb, vec3(g) * vec3(1., .97, .92), uStyle2.z);
  }
  if (uTilt > 0.) {                         // 移軸：上下模糊、中間清楚
    float tb = smoothstep(.12, .45, abs(vUv.y - .5)) * uTilt;
    if (tb > .01) {
      vec4 acc = col;
      for (int k = 0; k < 8; k++) { float a = float(k) * .785; acc += texture2D(uImage, clamp(p + vec2(cos(a) / uAspect, sin(a)) * .01 * tb, .0005, .9995)); }
      col = mix(col, acc / 9., clamp(tb * 1.3, 0., 1.));
    }
  }
  if (uGlitch > 0.) {                       // 故障：紅藍分離
    float sh = (.002 + glt * .012) * uGlitch;
    col.r = texture2D(uImage, clamp(p + vec2(sh, 0.), .0005, .9995)).r;
    col.b = texture2D(uImage, clamp(p - vec2(sh, 0.), .0005, .9995)).b;
  }
  if (uSharpen > 0.) {                      // 銳利化：和周圍平均值的差放大
    vec2 e = vec2(1.2 / 1000.) * uFit;
    vec3 bl = (texture2D(uImage, clamp(p + vec2(e.x, 0.), .0005, .9995)).rgb + texture2D(uImage, clamp(p - vec2(e.x, 0.), .0005, .9995)).rgb
      + texture2D(uImage, clamp(p + vec2(0., e.y), .0005, .9995)).rgb + texture2D(uImage, clamp(p - vec2(0., e.y), .0005, .9995)).rgb) * .25;
    col.rgb += (col.rgb - bl) * uSharpen * 1.6;
  }
  if (uChroma > 0.) {                       // 色差：紅藍通道往外偏
    vec2 dir = (vUv - .5) * uChroma * .012;
    col.r = texture2D(uImage, clamp(p + dir, .0005, .9995)).r;
    col.b = texture2D(uImage, clamp(p - dir, .0005, .9995)).b;
  }
  if (uLens.w > 0.) {                       // 放射模糊：往畫面中心拉出速度感
    vec3 acc = col.rgb;
    for (int k = 1; k < 10; k++) acc += SMP(.5 + (p - .5) * (1. - float(k) * .007 * uLens.w));
    col.rgb = acc / 10.;
  }
  if (uLens.x > 0. && uHasDepth == 1) {     // 背景虛化：越遠越糊（需要深度圖）
    float far = 1. - smoothstep(.2, .8, texture2D(uDepth, p).r), rr = far * uLens.x * .012;
    if (rr > .0004) {
      vec3 acc = col.rgb;
      for (int k = 0; k < 12; k++) { float a = float(k) * .5236 + .2; acc += SMP(p + vec2(cos(a) / uAspect, sin(a)) * rr * (k < 6 ? .5 : 1.)); }
      col.rgb = acc / 13.;
    }
  }
  if (uBloom > 0.) {                        // 柔光：取周圍亮部疊加
    vec3 acc = vec3(0.);
    for (int k = 0; k < 8; k++) {
      float a = float(k) * .785398;
      vec3 c = texture2D(uImage, clamp(p + vec2(cos(a), sin(a)) * .009, .0005, .9995)).rgb;
      acc += max(c - .55, 0.);
    }
    col.rgb += acc / 8. * uBloom * 1.6;
  }
  col.rgb *= 1. - shade;
  if (uFog > 0. && uHasDepth == 1) {        // 景深霧：遠處泛白
    float dz = texture2D(uDepth, p).r;
    col.rgb = mix(col.rgb, vec3(.86, .88, .95), (1. - smoothstep(.15, .75, dz)) * uFog * .55);
  }
  if (uSweep > 0.) {
    float pos = fract(uTime * .09 * uSweepSpeed) * 2.6 - .8;
    float q = vUv.x * .75 + vUv.y * .45;
    float band = exp(-pow((q - pos) / .07, 2.)) + .4 * exp(-pow((q - pos + .12) / .025, 2.));
    float dep = uHasDepth == 1 ? texture2D(uDepth, p).r : .7;
    col.rgb += band * uSweep * .32 * (.4 + .6 * dep);
  }
  if (uNeon > 0.) {                         // 霓虹描邊：沿著輪廓發出流動的彩色光
    vec2 e = vec2(.0016, 0.);
    float lx = dot(texture2D(uImage, clamp(p + e.xy, .0005, .9995)).rgb - texture2D(uImage, clamp(p - e.xy, .0005, .9995)).rgb, vec3(.333));
    float ly = dot(texture2D(uImage, clamp(p + e.yx, .0005, .9995)).rgb - texture2D(uImage, clamp(p - e.yx, .0005, .9995)).rgb, vec3(.333));
    float ed = smoothstep(.04, .25, length(vec2(lx, ly)));
    vec3 nc = .55 + .45 * cos(6.283 * (vUv.x * .6 + vUv.y * .4 + uTime * .15 + vec3(0., .33, .67)));
    col.rgb += nc * ed * uNeon * 1.2;
  }
  if (uCaustic > 0.) {                      // 水底光紋
    vec2 q = vUv * vec2(uScreenAr, 1.) * 7.;
    float c = sin(q.x + uTime * .9 + sin(q.y * 1.3 + uTime * .7)) + sin(q.y * 1.1 - uTime * .8 + sin(q.x * .9 - uTime * .5));
    c = pow(max(0., c * .5), 4.);
    col.rgb = mix(col.rgb, col.rgb * vec3(.82, .97, 1.08), uCaustic * .5) + vec3(.55, .85, 1.) * c * .35 * uCaustic;
  }
  if (uAurora > 0.) {                       // 極光帶
    float wv = sin(vUv.x * 5. + uTime * .35) * .06 + sin(vUv.x * 11. - uTime * .25) * .03;
    float band = exp(-pow((vUv.y - .2 - wv) / .09, 2.));
    float streak = .55 + .45 * sin(vUv.x * 60. + sin(vUv.x * 9. + uTime) * 3. + uTime * 1.5);
    vec3 ac = mix(vec3(.2, 1., .62), vec3(.62, .35, 1.), .5 + .5 * sin(vUv.x * 3. + uTime * .3));
    col.rgb += ac * band * streak * uAurora * .5;
  }
  if (uPrism > 0.) {                        // 稜鏡彩虹光
    float q = vUv.x * .8 - vUv.y * .6 + uTime * .04;
    vec3 rb = .5 + .5 * cos(6.283 * (q * 3. + vec3(0., .33, .67)));
    col.rgb += rb * pow(max(0., sin(q * 8.17)), 6.) * uPrism * .35;
  }
  if (uFlash > 0.) {                        // 閃電：每隔一陣子閃兩下
    float t = fract(uTime * .11 + .3);
    float fl = smoothstep(0., .008, t) * (1. - smoothstep(.008, .04, t)) + .7 * smoothstep(.055, .06, t) * (1. - smoothstep(.06, .1, t));
    col.rgb += vec3(.82, .88, 1.) * fl * uFlash * .7;
  }
  if (uHue > 0.) {                          // 色相流轉
    float ang = uTime * .35 * uHue + vUv.x * 1.5 * uHue;
    vec3 yiq = mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312) * col.rgb;
    float hh = atan(yiq.z, yiq.y) + ang, ch = length(yiq.yz);
    col.rgb = mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703) * vec3(yiq.x, ch * cos(hh), ch * sin(hh));
  }
  // 調色板：曝光 / 對比 / 飽和度 / 色溫
  col.rgb *= exp2(uGrade.x);
  col.rgb = (col.rgb - .5) * (1. + uGrade.y) + .5;
  col.rgb = mix(vec3(dot(col.rgb, vec3(.299, .587, .114))), col.rgb, 1. + uGrade.z);
  col.rgb += vec3(.07, .02, -.07) * uGrade.w;
  col.rgb = max(col.rgb, 0.);
  {                                         // 進階調色：色調、自然飽和、陰影 / 高光、褪色、分離色調
    float l = LUM(col.rgb);
    col.rgb += vec3(.04, -.05, .04) * uGrade2.x;
    float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
    col.rgb = mix(vec3(l), col.rgb, 1. + uGrade2.y * (1. - clamp(sat, 0., 1.)) * 1.3);
    col.rgb += uGrade2.z * .3 * (1. - smoothstep(0., .55, l));
    col.rgb += uGrade2.w * .25 * smoothstep(.45, 1., l);
    col.rgb = mix(col.rgb, col.rgb * .8 + .14, uGrade3.x);
    if (uGrade3.y > 0.) col.rgb += ((HUE(uGrade3.z) - .5) * (1. - l) * .35 + (HUE(uGrade3.w) - .5) * l * .3) * uGrade3.y;
    col.rgb = max(col.rgb, 0.);
  }
  if (uTint > .5) {                         // 調色
    vec3 c = col.rgb; float l = dot(c, vec3(.299, .587, .114)); vec3 t = c;
    if (uTint < 1.5) t = c * vec3(1.08, 1., .86) + vec3(.03, .01, 0.);                       // 暖陽
    else if (uTint < 2.5) t = c * vec3(.88, .98, 1.1) + vec3(0., .01, .03);                  // 冷月
    else if (uTint < 3.5) t = mix(vec3(l), vec3(l * 1.07, l * .92, l * .74), .9) + .03;      // 復古
    else if (uTint < 4.5) t = vec3(l);                                                        // 黑白
    else if (uTint < 5.5) t = mix(c, vec3(1., .86, .95), .18) * 1.04;                        // 夢幻
    else if (uTint < 6.5) t = c * vec3(.92, .9, 1.12) + vec3(.04, 0., .06);                  // 星夜
    else if (uTint < 7.5) t = mix(c * vec3(.84, 1., 1.1) + vec3(0., .02, .05), c * vec3(1.14, 1., .8) + vec3(.04, .01, 0.), smoothstep(.2, .8, l));   // 青橙電影
    else if (uTint < 8.5) t = (mix(c, vec3(l), .22) * 1.06 + vec3(.02, .05, .07) - .5) * .86 + .56;   // 日系清新
    else if (uTint < 9.5) t = mix((c - .5) * .74 + .52 + vec3(.04, .02, .06), vec3(l), .22);        // 褪色底片
    else if (uTint < 10.5) t = (c * vec3(1.1, 1.02, .86) + vec3(.03, 0., -.02) - .5) * 1.08 + .5;   // 暖調底片
    else if (uTint < 11.5) t = c * vec3(.94, 1.06, .98) + vec3(0., .025, .015);                      // 富士綠
    else if (uTint < 12.5) t = mix(c * vec3(.82, .9, 1.22), c * vec3(1.22, .8, 1.1), vUv.x) + vec3(.03, 0., .06);   // 賽博粉藍
    else if (uTint < 13.5) t = c * vec3(1.16, .98, .76) + vec3(.06, .02, 0.);                        // 黃昏金
    else if (uTint < 14.5) t = mix(c * vec3(.9, 1.06, .88) + vec3(0., .02, 0.), vec3(l), .15);      // 森林
    else if (uTint < 15.5) t = vec3(l) * vec3(1.07, .86, .62) + vec3(.05, .03, 0.);                  // 舊照片
    else if (uTint < 16.5) t = vec3(smoothstep(.1, .85, l));                                          // 黑色電影
    else if (uTint < 17.5) t = (mix(c, vec3(l), .55) - .5) * 1.3 + .5;                               // 漂白
    else t = mix(vec3(l), c, 1.45) * 1.03 + vec3(.04, 0., .04);                                       // 糖果
    col.rgb = mix(c, t, uTintAmt);
  }
  // ---- 風格化（套在調色之後） ----
  if (uStyle3.w > 0.) {                     // 雙色調
    float l = LUM(col.rgb);
    vec3 dk = mix(vec3(.04), HUE(uDuo.x), .55) * .55, lt = mix(vec3(1.), HUE(uDuo.y), .35);
    col.rgb = mix(col.rgb, mix(dk, lt, smoothstep(.04, .96, l)), uStyle3.w);
  }
  if (uStyle2.w > 0.) {                     // 熱成像
    float l = LUM(col.rgb);
    vec3 th = l < .25 ? mix(vec3(0., 0., .12), vec3(.3, 0., .6), l / .25) : l < .5 ? mix(vec3(.3, 0., .6), vec3(.92, .05, .3), (l - .25) / .25)
      : l < .75 ? mix(vec3(.92, .05, .3), vec3(1., .62, 0.), (l - .5) / .25) : mix(vec3(1., .62, 0.), vec3(1., 1., .85), (l - .75) / .25);
    col.rgb = mix(col.rgb, th, uStyle2.w);
  }
  if (uStyle3.x > 0.) {                     // 夜視鏡
    float g = LUM(col.rgb) * 1.6 + (rh(vUv * 700. + fract(uTime * 9.)) - .5) * .14;
    vec3 nv = vec3(.18, 1., .28) * g * smoothstep(.95, .3, length(vUv - .5)) * (.9 + .1 * sin(gl_FragCoord.y * 1.5));
    col.rgb = mix(col.rgb, nv, uStyle3.x);
  }
  if (uStyle1.x > 0.) {                     // 色調分離
    float lv = mix(12., 3., uStyle1.x);
    col.rgb = mix(col.rgb, floor(col.rgb * lv + .5) / lv, clamp(uStyle1.x * 3., 0., 1.));
  }
  if (uStyle1.y > 0.) {                     // 漫畫網點（45 度）
    float cell = mix(110., 42., uStyle1.y);
    vec2 g = mat2(.7071, -.7071, .7071, .7071) * (vUv * vec2(uScreenAr, 1.) * cell);
    float l = LUM(col.rgb), r = sqrt(max(0., 1. - l)) * .62;
    float dt = smoothstep(r, r - .09, length(fract(g) - .5));
    col.rgb = mix(col.rgb, mix(vec3(.98, .96, .91), col.rgb * .82, dt), clamp(uStyle1.y * 1.6, 0., 1.));
  }
  if (uStyle2.y > 0.) {                     // 抖色（像素遊戲感）
    vec2 fc = floor(gl_FragCoord.xy / mix(1., 3., uStyle2.y));
    float b = (4. * M2(mod(fc.x, 2.), mod(fc.y, 2.)) + M2(mod(floor(fc.x / 2.), 2.), mod(floor(fc.y / 2.), 2.))) / 16.;
    col.rgb = mix(col.rgb, floor(col.rgb * 3. + b) / 3., clamp(uStyle2.y * 2., 0., 1.));
  }
  if (uStyle1.z > 0.) col.rgb *= 1. - smoothstep(.14, .5, EDGE(p, .0013)) * uStyle1.z;   // 漫畫描線：輪廓加黑線
  if (uStyle3.z > 0.) col.rgb = mix(col.rgb, 1. - clamp(col.rgb, 0., 1.), uStyle3.z);    // 反相
  if (uLens.y > 0.) {                       // 鏡頭光斑：左上的光源與一串光圈
    vec2 L = vec2(.16 + .04 * sin(uTime * .21), .13 + .02 * cos(uTime * .17)), ar = vec2(uScreenAr, 1.);
    col.rgb += vec3(1., .9, .72) * exp(-length((vUv - L) * ar) * 9.) * .7 * uLens.y;
    col.rgb += vec3(1., .85, .7) * exp(-abs(vUv.y - L.y) * 90.) * exp(-abs(vUv.x - L.x) * 2.5) * .35 * uLens.y;
    for (int k = 1; k < 5; k++) {
      vec2 gp = L + (vec2(.5) - L) * float(k) * .52;
      float rr = .02 + .025 * float(k), d = length((vUv - gp) * ar);
      col.rgb += HUE(float(k) * .17 + .05) * smoothstep(rr, rr * .7, d) * .07 * uLens.y;
    }
  }
  if (uLeak > 0.) {                         // 漏光：邊緣緩慢流動的暖色光
    float lk = smoothstep(.55, 0., distance(vUv, vec2(.08 + .1 * sin(uTime * .21), .15 + .1 * cos(uTime * .17))));
    float lk2 = smoothstep(.5, 0., distance(vUv, vec2(.95, .9 + .06 * sin(uTime * .13))));
    col.rgb += (vec3(1., .55, .3) * lk + vec3(.9, .4, .8) * lk2 * .7) * uLeak * .45;
  }
  if (uGrain > 0.) {                        // 底片顆粒
    float n = fract(sin(dot(vUv * 1000. + fract(uTime * 7.3), vec2(12.9898, 78.233))) * 43758.5453);
    col.rgb += (n - .5) * uGrain * .12;
  }
  if (uVignette > 0.) {
    float v = smoothstep(1.15, .35, length((vUv - .5) * vec2(1.1, 1.)) * 1.25);
    col.rgb *= mix(1., v, uVignette);
  }
  if (uScan > 0.) {                         // CRT 掃描線
    col.rgb *= 1. - uScan * .22 * (.5 + .5 * sin(gl_FragCoord.y * 1.6));
    col.rgb *= 1. - uScan * .05 * rh(vec2(floor(uTime * 24.), 1.));
  }
  if (uFrost > 0.) {                        // 窗邊結霜
    vec2 fu = clamp(uv, 0., 1.);                // 以圖片邊緣為準（完整顯示時也看得到）
    float ed = min(min(fu.x, 1. - fu.x), min(fu.y, 1. - fu.y));
    vec2 fq = fu * vec2(uAspect, 1.);
    float nz = rh(floor(fq * 160.)), nz2 = rh(floor(fq * 40.) + 7.);
    float fr = smoothstep(.2 * uFrost + .02, 0., ed + (nz2 - .5) * .06);
    col.rgb = mix(col.rgb, vec3(.86, .93, 1.) * (.8 + .2 * nz), fr * .8);
  }
  gl_FragColor = vec4(col.rgb * col.a * inside, inside * col.a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader 錯誤：' + gl.getShaderInfoLog(s));
  return s;
}

function texFrom(gl, tex, source, unit, mip = false) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  // WebGL2 可對非 2 次方尺寸做 mipmap，縮小顯示時才不會顆粒閃爍
  const canMip = mip && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (canMip) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, canMip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/** 依部件遮罩的範圍推算預設支點 */
export function maskBounds(canvas) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const { data, width, height } = g.getImageData(0, 0, canvas.width, canvas.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1, sx = 0, sy = 0, n = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    if (data[(y * width + x) * 4 + 3] > 60) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; sx += x; sy += y; n++;
    }
  }
  if (!n) return null;
  return { x0: x0 / width, y0: y0 / height, x1: x1 / width, y1: y1 / height, cx: sx / n / width, cy: sy / n / height };
}

export function autoPivot(type, b) {
  if (!b) return { x: .5, y: .5 };
  const mid = (b.x0 + b.x1) / 2;
  if (type === 'wave') return { x: mid, y: b.y0 };
  if (type === 'breath' || type === 'sway') return { x: mid, y: b.y1 };
  return { x: b.cx, y: (b.y0 + b.y1) / 2 };
}

/** 把最多 8 個部件遮罩（含羽化）打包進兩張 RGBA 材質的 ImageData */
export function packPartMasks(parts) {
  const mw = parts[0].mask.width, mh = parts[0].mask.height;
  const packs = [new ImageData(mw, mh), new ImageData(mw, mh)];
  const tmp = document.createElement('canvas'); tmp.width = mw; tmp.height = mh;
  const tg = tmp.getContext('2d', { willReadFrequently: true });
  parts.forEach((p, i) => {
    tg.clearRect(0, 0, mw, mh);
    tg.filter = p.feather > 0 ? `blur(${p.feather * mw / 512}px)` : 'none';
    tg.drawImage(p.mask, 0, 0, mw, mh);
    tg.filter = 'none';
    const src = tg.getImageData(0, 0, mw, mh).data, dst = packs[i >> 2].data, ch = i & 3;
    for (let k = 0; k < src.length; k += 4) dst[k + ch] = src[k + 3];
    if (!p.bounds) p.bounds = maskBounds(p.mask);
  });
  return packs;
}

/** 部件動作參數 → shader uniform 陣列 */
export function partUniforms(parts, aspect) {
  const A = new Float32Array(32), B = new Float32Array(32), C = new Float32Array(32);
  parts.forEach((p, i) => {
    const piv = p.pivot || autoPivot(p.type, p.bounds);
    A.set([TYPE_INDEX[p.type] ?? 0, piv.x, piv.y, p.amp], i * 4);
    const reach = p.bounds ? Math.max(.05, Math.hypot((p.bounds.x1 - p.bounds.x0) * aspect, p.bounds.y1 - p.bounds.y0)) : .4;
    B.set([p.speed, p.phase || 0, (p.dir ?? 0) * Math.PI / 180, reach], i * 4);
    C.set([p.bounds ? (p.bounds.y1 - p.bounds.y0) * .5 + .004 : .03, 0, 0, 0], i * 4);
  });
  return { A, B, C };
}

export class LiveStage {
  constructor(container, { fit = 'contain', pointer = 'self', background = null, dpr = 0 } = {}) {
    this.container = container;
    this.dprOverride = dpr;
    this.fit = fit;
    this.fx = { ...DEFAULT_FX };
    this.parts = [];
    this.time = 0; this.playing = true; this.alive = true;
    this.cam = { x: 0, y: 0 }; this.camTarget = { x: 0, y: 0 }; this.look = { x: 0, y: 0 };
    this.lastPointer = 0; this.imgW = 1; this.imgH = 1; this.hasImage = false; this.hasDepth = false;
    this.background = background;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'live-gl';
    this.canvas._stage = this;   // 方便除錯時從畫面元素找回舞台
    this.fxCanvas = document.createElement('canvas');
    this.fxCanvas.className = 'live-fx';
    container.append(this.canvas, this.fxCanvas);
    const opts = { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false };
    const gl = this.gl = this.canvas.getContext('webgl2', opts) || this.canvas.getContext('webgl', opts);
    if (!gl) throw new Error('瀏覽器不支援 WebGL');
    const prog = this.prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uImage', 'uDepth', 'uMaskA', 'uMaskB', 'uFit', 'uZoom', 'uTime', 'uParallax', 'uFocus', 'uDolly', 'uAspect', 'uSweep', 'uVignette', 'uBreathe', 'uBloom', 'uChroma', 'uGrain', 'uFog', 'uLeak', 'uTint', 'uTintAmt', 'uCam', 'uLook', 'uHasDepth', 'uCount', 'uA', 'uB', 'uC', 'uRain', 'uRainFog', 'uScreenAr', 'uGlitch', 'uScan', 'uWave', 'uCaustic', 'uAurora', 'uFlash', 'uPixel', 'uPrism', 'uNeon', 'uTilt', 'uHue', 'uFrost', 'uWipe', 'uHasWipe', 'uRip', 'uPoke', 'uSharpen', 'uSweepSpeed', 'uGrade', 'uGrade2', 'uGrade3', 'uStyle1', 'uStyle2', 'uStyle3', 'uDuo', 'uLens'])
      this.u[n] = gl.getUniformLocation(prog, n);
    this.tex = { image: gl.createTexture(), depth: gl.createTexture(), maskA: gl.createTexture(), maskB: gl.createTexture() };
    const blank = document.createElement('canvas'); blank.width = blank.height = 1;
    texFrom(gl, this.tex.image, blank, 0); texFrom(gl, this.tex.depth, blank, 1);
    texFrom(gl, this.tex.maskA, blank, 2); texFrom(gl, this.tex.maskB, blank, 3);
    gl.uniform1i(this.u.uImage, 0); gl.uniform1i(this.u.uDepth, 1); gl.uniform1i(this.u.uMaskA, 2); gl.uniform1i(this.u.uMaskB, 3);
    this.tex.wipe = gl.createTexture(); texFrom(gl, this.tex.wipe, blank, 4); gl.uniform1i(this.u.uWipe, 4);
    this.ripples = []; this.pokeV = 0; this.bursts = []; this.wipeUntil = 0;

    this.particles = [];
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    const target = pointer === 'window' ? window : pointer instanceof Element ? pointer : container;
    this.onMove = e => {
      const r = container.getBoundingClientRect();
      this.camTarget.x = clamp(((e.clientX - r.left) / r.width - .5) * 2, -1.2, 1.2);
      this.camTarget.y = clamp(((e.clientY - r.top) / r.height - .5) * 2, -1.2, 1.2);
      this.lastPointer = performance.now();
    };
    this.onOri = e => {
      if (e.gamma == null) return;
      this.camTarget.x = clamp(e.gamma / 25, -1, 1); this.camTarget.y = clamp((e.beta - 45) / 25, -1, 1);
      this.lastPointer = performance.now();
    };
    target.addEventListener('pointermove', this.onMove);
    window.addEventListener('deviceorientation', this.onOri);
    this.pointerTarget = target;
    this.prev = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    if (this.fixedSize) return;                         // 錄影中：維持圖片本身的大小
    const r = this.container.getBoundingClientRect();
    const dpr = this.dprOverride || Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    for (const c of [this.canvas, this.fxCanvas]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.draw();
  }

  async setImage(src) {
    const img = src instanceof HTMLImageElement || src instanceof HTMLCanvasElement ? src : await loadImage(src);
    this.imgW = img.naturalWidth || img.width; this.imgH = img.naturalHeight || img.height;
    this.image = img;
    texFrom(this.gl, this.tex.image, img, 0, true);
    this.hasImage = true;
    this.draw();
  }

  /** 深度圖：灰階，越亮越近；傳 null 取消 */
  setDepth(canvas) {
    this.hasDepth = !!canvas;
    if (canvas) texFrom(this.gl, this.tex.depth, canvas, 1);
    this.draw();
  }

  /** parts: [{type, pivot:{x,y}, amp, speed, phase, dir, reach, feather, mask: canvas, enabled}] */
  setParts(parts) {
    this.parts = parts.filter(p => p.enabled !== false && p.mask).slice(0, MAX_PARTS);
    if (!this.parts.length) { this.draw(); return; }
    const packs = packPartMasks(this.parts);
    // 以原始位元組上傳（不經 canvas），alpha 也當資料通道用，不會被 premultiply 清掉
    this.uploadMask(this.tex.maskA, packs[0], 2);
    this.uploadMask(this.tex.maskB, packs[1], 3);
    this.draw();
  }

  uploadMask(tex, imageData, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, imageData.width, imageData.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(imageData.data.buffer));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  set(fx) {
    const prevP = this.fx.particles, prevN = this.fx.particleCount;
    Object.assign(this.fx, fx);

    this.draw();
  }

  play() { this.playing = true; }
  pause() { this.playing = false; this.draw(); }

  loop(now) {
    if (!this.alive) return;
    const dt = Math.min(.05, (now - this.prev) / 1000);
    this.prev = now;
    if (this.playing) {
      this.time += dt;
      this.pokeV *= Math.exp(-dt * 2.2);
      if (this.wipeCv && now < this.wipeUntil) {          // 擦過的地方慢慢重新起霧
        const g = this.wipeCv.getContext('2d');
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = `rgba(0,0,0,${Math.min(1, dt * .16)})`;
        g.fillRect(0, 0, this.wipeCv.width, this.wipeCv.height); g.globalCompositeOperation = 'source-over';
        texFrom(this.gl, this.tex.wipe, this.wipeCv, 4);
      }
      this.updateCamera(dt, now);
      this.draw();
      this.drawParticles(dt);
      this.onFrame?.();
    }
    requestAnimationFrame(this.loop);
  }

  updateCamera(dt, now) {
    const f = this.fx, t = this.time * f.motionSpeed;
    let tx = 0, ty = 0;
    const idle = now - this.lastPointer > 2500;
    switch (f.motion) {
      case 'mouse': if (idle) { tx = Math.sin(t * .9) * .55; ty = Math.sin(t * .63) * .3; } else { tx = this.camTarget.x; ty = this.camTarget.y; } break;
      case 'orbit': tx = Math.cos(t * 1.4); ty = Math.sin(t * 1.4) * .6; break;
      case 'sway': tx = Math.sin(t * 1.4); break;
      case 'nod': ty = Math.sin(t * 1.4); break;
      case 'dolly': break;
    }
    const k = 1 - Math.exp(-dt * 5);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    const lx = idle ? Math.sin(t * .7) * .4 : this.camTarget.x, ly = idle ? 0 : this.camTarget.y;
    this.look.x += (lx - this.look.x) * k; this.look.y += (ly - this.look.y) * k;
  }

  fitScale() {
    const cw = this.canvas.width, ch = this.canvas.height;
    const ca = cw / ch, ia = this.imgW / this.imgH;
    if (this.fit === 'cover') return ca > ia ? [1, ia / ca] : [ca / ia, 1];
    return ca > ia ? [ca / ia, 1] : [1, ia / ca];
  }

  draw() {
    const gl = this.gl, u = this.u, f = this.fx;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.hasImage) return;
    const [fx, fy] = this.fitScale();
    gl.uniform2f(u.uFit, fx, fy);
    const dolly = f.motion === 'dolly' && !this.rest ? Math.sin(this.time * f.motionSpeed * 1.2) * f.parallax * 1.6 : 0;
    // 只放大到剛好遮住視差位移的邊緣，避免圖片被裁太多
    gl.uniform1f(u.uZoom, this.rest ? 0 : f.parallax * (this.fit === 'cover' ? (this.hasDepth ? 1.2 : .8) : .5) + Math.abs(dolly) * .5 + .001);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uParallax, f.parallax);
    gl.uniform1f(u.uFocus, f.focus);
    gl.uniform1f(u.uDolly, dolly);
    gl.uniform1f(u.uAspect, this.imgW / this.imgH);
    gl.uniform1f(u.uSweep, this.rest ? 0 : f.sweep);
    gl.uniform1f(u.uVignette, f.vignette);
    gl.uniform1f(u.uBreathe, this.rest ? 0 : f.breathe * .025);
    const fxOn = !this.rest;
    gl.uniform1f(u.uBloom, fxOn ? f.bloom || 0 : 0); gl.uniform1f(u.uChroma, fxOn ? f.chroma || 0 : 0);
    gl.uniform1f(u.uGrain, fxOn ? f.grain || 0 : 0); gl.uniform1f(u.uFog, fxOn ? f.fog || 0 : 0); gl.uniform1f(u.uLeak, fxOn ? f.leak || 0 : 0);
    for (const [k, un] of FX_UNIFORMS) gl.uniform1f(u[un], fxOn ? f[k] || 0 : 0);
    gl.uniform1f(u.uSharpen, f.sharpen || 0); gl.uniform1f(u.uSweepSpeed, f.sweepSpeed ?? 1);
    gl.uniform4f(u.uGrade, f.exposure || 0, f.contrast || 0, f.saturation || 0, f.temperature || 0);
    const on = k => fxOn ? +f[k] || 0 : 0;
    gl.uniform4f(u.uGrade2, f.tintG || 0, f.vibrance || 0, f.shadows || 0, f.highlights || 0);
    gl.uniform4f(u.uGrade3, f.fade || 0, f.splitAmt || 0, f.splitShadow ?? .55, f.splitHigh ?? .08);
    gl.uniform4f(u.uStyle1, on('posterize'), on('halftone'), on('ink'), on('oil'));
    gl.uniform4f(u.uStyle2, on('sketch'), on('dither'), on('emboss'), on('thermal'));
    gl.uniform4f(u.uStyle3, on('nightvision'), on('watercolor'), on('invert'), on('duotone'));
    gl.uniform4f(u.uDuo, f.duoDark ?? .7, f.duoLight ?? .12, 0, 0);
    gl.uniform4f(u.uLens, on('dof'), on('flare'), on('fisheye'), on('zoomBlur'));
    gl.uniform1f(u.uHasWipe, this.wipeCv && performance.now() < this.wipeUntil ? 1 : 0);
    gl.uniform1f(u.uPoke, this.rest ? 0 : this.pokeV);
    const rip = new Float32Array(16);
    this.ripples = this.ripples.filter(r => this.time - r.t < 3);
    this.ripples.slice(-4).forEach((r, i) => rip.set([r.u, r.v, r.t, r.s], i * 4));
    gl.uniform4fv(u.uRip, rip);
    gl.uniform1f(u.uRain, fxOn ? f.rain || 0 : 0); gl.uniform1f(u.uRainFog, fxOn ? f.rainFog || 0 : 0); gl.uniform1f(u.uScreenAr, this.canvas.width / this.canvas.height);
    gl.uniform1f(u.uTint, fxOn ? TINTS.indexOf(f.tint || 'none') : 0); gl.uniform1f(u.uTintAmt, f.tintAmount ?? .6);
    // rest：編輯遮罩時顯示靜止原圖
    gl.uniform2f(u.uCam, this.rest ? 0 : this.cam.x, this.rest ? 0 : this.cam.y);
    gl.uniform2f(u.uLook, this.look.x, this.look.y);
    gl.uniform1i(u.uHasDepth, this.hasDepth ? 1 : 0);
    gl.uniform1i(u.uCount, this.rest ? 0 : this.parts.length);
    const { A, B, C } = partUniforms(this.parts, this.imgW / this.imgH);
    gl.uniform4fv(u.uA, A); gl.uniform4fv(u.uB, B); gl.uniform4fv(u.uC, C);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---------- 互動（首頁用）：u, v 都是畫面座標 0~1 ----------
  /** 擦玻璃：在霧面上擦出一塊清楚的地方，之後慢慢重新起霧 */
  wipeAt(u, v, r = .055) {
    if (!this.wipeCv) { this.wipeCv = document.createElement('canvas'); this.wipeCv.width = this.wipeCv.height = 256; }
    const c = this.wipeCv, g = c.getContext('2d'), ar = this.canvas.width / this.canvas.height;
    g.save(); g.translate(u * c.width, v * c.height); g.scale(r * c.width / ar, r * c.height);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.55, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
    texFrom(this.gl, this.tex.wipe, c, 4);
    this.wipeUntil = performance.now() + 25000;
  }
  /** 點擊水波 */
  ripple(u, v, s = 1) { this.ripples.push({ u, v, t: this.time, s }); if (this.ripples.length > 4) this.ripples.shift(); }
  /** 戳一下：部件與整張圖晃一下 */
  poke(s = 1) { this.pokeV = Math.min(1.6, this.pokeV + s); }
  /** 點擊星火 */
  sparkBurst(u, v) {
    const x = u * this.fxCanvas.width, y = v * this.fxCanvas.height, dpr = Math.min(devicePixelRatio || 1, 2);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, sp = (60 + Math.random() * 220) * dpr;
      this.bursts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40 * dpr, life: 0, max: .6 + Math.random() * .7, s: .6 + Math.random(), star: Math.random() < .5, hue: Math.random() });
    }
  }
  /** 游標光點拖尾 */
  trailAt(u, v) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.bursts.push({ x: u * this.fxCanvas.width + (Math.random() - .5) * 8 * dpr, y: v * this.fxCanvas.height + (Math.random() - .5) * 8 * dpr,
      vx: (Math.random() - .5) * 20 * dpr, vy: (10 + Math.random() * 20) * dpr, life: 0, max: .5 + Math.random() * .5, s: .4 + Math.random() * .5, star: Math.random() < .3, hue: Math.random(), trail: true });
  }
  drawBursts(g, dt) {
    if (!this.bursts.length) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    g.save(); g.globalCompositeOperation = 'lighter';
    this.bursts = this.bursts.filter(p => (p.life += dt) < p.max);
    for (const p of this.bursts) {
      const k = Math.exp(-(p.trail ? 1.5 : 3) * dt);
      p.vx *= k; p.vy = p.vy * k + (p.trail ? 0 : 160 * dpr * dt); p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.life / p.max, r = p.s * dpr * (p.trail ? 2.2 : 3);
      g.fillStyle = p.hue > .5 ? `rgba(255,236,190,${a})` : `rgba(210,225,255,${a})`;
      if (p.star) {
        const L = r * 2.2;
        g.beginPath(); g.moveTo(p.x, p.y - L); g.quadraticCurveTo(p.x, p.y, p.x + L, p.y); g.quadraticCurveTo(p.x, p.y, p.x, p.y + L); g.quadraticCurveTo(p.x, p.y, p.x - L, p.y); g.quadraticCurveTo(p.x, p.y, p.x, p.y - L); g.fill();
      } else { g.beginPath(); g.arc(p.x, p.y, r * .7, 0, 7); g.fill(); }
    }
    g.restore();
  }

  // ---------- 粒子 ----------
  spawn(initial, type) {
    const W = this.fxCanvas.width, H = this.fxCanvas.height;
    const up = ['embers', 'sparkle', 'bubbles', 'hearts', 'lanterns', 'notes', 'orbs', 'smoke', 'jellyfish', 'pixels', 'balloons'].includes(type);
    const p = { type, x: Math.random() * W, y: initial ? Math.random() * H : (up ? H + 10 : -10), s: .5 + Math.random(), a: Math.random() * 6.28, life: 0 };
    p.vx = (Math.random() - .5) * 12;
    p.vy = ({ petal: 28, snow: 22, dust: -6, sparkle: -14, embers: -36, fireflies: 0, leaves: 34, feathers: 18, rain: 520, bubbles: -30, shooting: 0,
      hearts: -22, stars: 4, bokeh: -4, confetti: 70, lanterns: -18, notes: -26, dandelion: 8, crystals: 26, orbs: -16, runes: -3,
      maple: 30, ginkgo: 26, roses: 30, snowflake: 20, ash: 14, smoke: -12, starfall: 45, gems: 40, glitter: 45, coins: 60, ribbons: 50,
      balloons: -28, jellyfish: -10, code: 170, pixels: -24, moons: 0, hexagons: 0, ghosts: -6 }[type] ?? 10) * (.6 + Math.random() * .8);
    if (type === 'dust' || type === 'fireflies' || type === 'pollen') p.vy = (Math.random() - .5) * 10;
    if (SIDEWAYS.has(type)) {                         // 從左或右邊進場，橫著飛過畫面
      const dir = Math.random() < .5 ? 1 : -1, sp = { clouds: 10, birds: 70, bats: 60, fish: 35, planes: 55 }[type];
      p.vx = dir * sp * (.7 + Math.random() * .6); p.vy = type === 'planes' ? 12 + Math.random() * 14 : (Math.random() - .5) * 6;
      p.x = initial ? Math.random() * W : dir > 0 ? -30 : W + 30;
      p.y = Math.random() * H * (type === 'birds' || type === 'bats' || type === 'clouds' ? .6 : 1);
      if (type === 'clouds') p.s = 1.2 + Math.random() * 1.3;
    }
    if (type === 'code') { p.glyph = () => 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789'[Math.floor(Math.random() * 30)]; p.trail = Array.from({ length: 5 }, p.glyph); }
    if (type === 'rain') { p.vx = -60; p.s = .6 + Math.random() * .6; }
    if (type === 'shooting') { p.x = Math.random() * W * 1.2; p.y = Math.random() * H * .5; p.vx = -(500 + Math.random() * 400); p.vy = 220 + Math.random() * 160; p.wait = initial ? Math.random() * 6 : 2 + Math.random() * 7; }
    p.hue = Math.random();
    // 有壽命的粒子：在畫面任意處淡入淡出
    const lifeSpan = { runes: [4, 7], bokeh: [8, 14], stars: [4, 8], butterflies: [10, 18], moons: [6, 10], hexagons: [3, 6], ghosts: [7, 11] }[type];
    if (lifeSpan) {
      p.max = lifeSpan[0] + Math.random() * (lifeSpan[1] - lifeSpan[0]);
      p.x = Math.random() * W; p.y = Math.random() * H;
      p.life = initial ? Math.random() * p.max : 0;
    }
    if (type === 'dandelion') p.vx = 18 + Math.random() * 30;
    if (type === 'butterflies') { p.vx = (Math.random() - .5) * 40; p.vy = (Math.random() - .5) * 20; }
    if (type === 'confetti') p.vx = (Math.random() - .5) * 30;
    if (type === 'runes') p.glyph = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'[Math.floor(Math.random() * 24)];
    return p;
  }

  drawParticles(dt) {
    const g = this.fxCanvas.getContext('2d'), W = this.fxCanvas.width, H = this.fxCanvas.height;
    dt *= this.fx.particleSpeed ?? 1;
    const op = String(this.fx.particleOpacity ?? 1);
    if (this.fxCanvas.style.opacity !== op) this.fxCanvas.style.opacity = op;
    const wind = (this.fx.wind || 0) * 70, psize = this.fx.particleSize ?? 1;
    g.clearRect(0, 0, W, H);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const t = this.time;
    if (this.fx.rays > 0 && !this.rest) this.drawRays(g, W, H, t);
    if (this.bursts) this.drawBursts(g, dt);
    const types = [this.fx.particles, this.fx.particles2, this.fx.particles3].filter(x => x && x !== 'none');
    if (!types.length) { this.particles = []; return; }
    const n = Math.round(this.fx.particleCount);
    const want = types.flatMap((ty, k) => Array(k ? Math.round(n * (k === 1 ? .6 : .4)) : n).fill(ty));
    if (this.particles.length !== want.length || this.particles.some((p, i) => p.type !== want[i])) this.particles = want.map(ty => this.spawn(true, ty));
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i], type = p.type;
      p.life += dt;
      if (type === 'shooting') {
        if (p.wait > 0) { p.wait -= dt; continue; }
        p.x += p.vx * dt * dpr; p.y += p.vy * dt * dpr;
        if (p.y > H + 40 || p.x < -200) { this.particles[i] = this.spawn(false, type); continue; }
        const len = 90 * dpr, nx = p.vx / Math.hypot(p.vx, p.vy), ny = p.vy / Math.hypot(p.vx, p.vy);
        const gr = g.createLinearGradient(p.x, p.y, p.x - nx * len, p.y - ny * len);
        gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(180,200,255,0)');
        g.strokeStyle = gr; g.lineWidth = 1.6 * dpr; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - nx * len, p.y - ny * len); g.stroke();
        continue;
      }
      if (type === 'rain') {
        p.x += (p.vx + wind * 2) * dt * dpr; p.y += p.vy * dt * dpr;
        if (p.y > H + 20) { this.particles[i] = this.spawn(false, type); continue; }
        g.strokeStyle = 'rgba(210,225,255,.35)'; g.lineWidth = p.s * dpr; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - 4 * dpr, p.y - 18 * dpr * p.s); g.stroke();
        continue;
      }
      const wander = { fireflies: 26, leaves: 22, feathers: 22, butterflies: 45, dandelion: 16, hearts: 14, lanterns: 8, bokeh: 4, confetti: 18,
        maple: 24, ginkgo: 20, roses: 18, ash: 14, pollen: 16, smoke: 8, ribbons: 22, balloons: 6, jellyfish: 6, bats: 30, ghosts: 12, clouds: 1, birds: 3, fish: 4, planes: 4, code: 0, moons: 2, hexagons: 0 }[type] ?? 10;
      p.x += (p.vx + wind + Math.sin(t * .8 + p.a) * wander + this.cam.x * -6 * p.s) * dt * dpr;
      p.y += (p.vy + (type === 'fireflies' ? Math.cos(t * .6 + p.a * 2) * 14 : 0)) * dt * dpr;
      p.a += dt * (type === 'petal' || type === 'leaves' || type === 'maple' || type === 'roses' ? 1.4 : type === 'coins' || type === 'glitter' ? 3.2 : type === 'feathers' ? .5 : .6);
      if (p.y > H + 40 || p.y < -40 || p.x < -40 || p.x > W + 40 || (p.max && p.life > p.max)) { this.particles[i] = this.spawn(false, type); continue; }
      const fade = p.max ? Math.sin(Math.PI * Math.min(1, p.life / p.max)) : 1;
      const r = p.s * dpr * psize;
      g.save(); g.translate(p.x, p.y);
      if (type === 'petal') {
        g.rotate(p.a); g.scale(1, .55 + .45 * Math.sin(p.a * 1.7));
        g.fillStyle = p.hue > .5 ? 'rgba(255,190,205,.85)' : 'rgba(255,224,232,.8)';
        g.beginPath(); g.ellipse(0, 0, 5 * r, 3 * r, 0, 0, 7); g.fill();
      } else if (type === 'snow') {
        g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(0, 0, 1.8 * r, 0, 7); g.fill();
      } else if (type === 'sparkle') {
        const tw = .4 + .6 * Math.abs(Math.sin(t * 2 + p.a * 3));
        g.globalAlpha = tw; g.fillStyle = p.hue > .6 ? '#fff6dc' : '#ffe1a0';
        const L = 5 * r * tw;
        g.beginPath(); g.moveTo(0, -L); g.quadraticCurveTo(0, 0, L, 0); g.quadraticCurveTo(0, 0, 0, L); g.quadraticCurveTo(0, 0, -L, 0); g.quadraticCurveTo(0, 0, 0, -L); g.fill();
      } else if (type === 'fireflies') {
        const pulse = .3 + .7 * Math.pow(Math.abs(Math.sin(t * 1.3 + p.a * 5)), 3);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, 7 * r);
        gr.addColorStop(0, `rgba(240,255,170,${.95 * pulse})`); gr.addColorStop(.25, `rgba(200,255,120,${.45 * pulse})`); gr.addColorStop(1, 'rgba(160,255,100,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 7 * r, 0, 7); g.fill();
      } else if (type === 'leaves') {
        g.rotate(p.a); g.scale(1, .5 + .5 * Math.sin(p.a * 1.3));
        g.fillStyle = ['rgba(214,120,60,.85)', 'rgba(232,170,70,.85)', 'rgba(190,80,50,.8)'][Math.floor(p.hue * 3)];
        g.beginPath(); g.moveTo(-6 * r, 0); g.quadraticCurveTo(0, -4 * r, 6 * r, 0); g.quadraticCurveTo(0, 4 * r, -6 * r, 0); g.fill();
      } else if (type === 'feathers') {
        g.rotate(Math.sin(p.a) * .9 + .6); g.globalAlpha = .85;
        const fw = 16 * r, fh = fw * 1.16;
        if (featherImg.complete && featherImg.naturalWidth) g.drawImage(featherImg, -fw / 2, -fh / 2, fw, fh);
      } else if (type === 'bubbles') {
        g.strokeStyle = 'rgba(220,240,255,.55)'; g.lineWidth = .8 * dpr;
        g.beginPath(); g.arc(0, 0, 4 * r, 0, 7); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(-1.4 * r, -1.4 * r, 1 * r, 0, 7); g.fill();
      } else if (type === 'hearts') {
        g.rotate(Math.sin(p.a) * .3); g.globalAlpha = .85; g.fillStyle = p.hue > .5 ? '#ff8fb3' : '#ffc1d6';
        const s = 4 * r;
        g.beginPath(); g.moveTo(0, s * .9); g.bezierCurveTo(-s * 1.6, -s * .2, -s * .6, -s * 1.4, 0, -s * .5); g.bezierCurveTo(s * .6, -s * 1.4, s * 1.6, -s * .2, 0, s * .9); g.fill();
      } else if (type === 'butterflies') {
        const fl = Math.abs(Math.sin(t * 9 + p.a * 3)), s = 5 * r;
        g.globalAlpha = fade; g.rotate(Math.sin(p.a) * .4);
        g.fillStyle = ['rgba(150,200,255,.85)', 'rgba(255,190,230,.85)', 'rgba(255,230,150,.85)'][Math.floor(p.hue * 3)];
        g.scale(fl * .9 + .1, 1);
        const wing = (x, y, rx, ry, rot) => { g.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); g.ellipse(x, y, rx, ry, rot, 0, 7); };
        g.beginPath(); wing(-s * .6, -s * .3, s * .7, s * .5, -.5); wing(s * .6, -s * .3, s * .7, s * .5, .5); wing(-s * .4, s * .35, s * .45, s * .35, .4); wing(s * .4, s * .35, s * .45, s * .35, -.4); g.fill();
      } else if (type === 'stars') {
        g.globalAlpha = fade * (.6 + .4 * Math.sin(t * 3 + p.a * 5)); g.fillStyle = p.hue > .5 ? '#fff4c8' : '#dfe8ff'; g.rotate(p.a * .3);
        const R1 = 5 * r, R2 = 2.2 * r;
        g.beginPath(); for (let k = 0; k < 10; k++) { const ang = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? R2 : R1; g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); } g.closePath(); g.fill();
      } else if (type === 'bokeh') {
        const a = fade * .35, rad = (10 + p.s * 18) * dpr;
        const c = ['255,214,170', '170,210,255', '255,180,220', '200,255,220'][Math.floor(p.hue * 4)];
        const gr = g.createRadialGradient(0, 0, rad * .2, 0, 0, rad);
        gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(.75, `rgba(${c},${a * .7})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rad, 0, 7); g.fill();
      } else if (type === 'confetti') {
        g.rotate(p.a * 2); g.scale(1, Math.sin(p.a * 3)); g.fillStyle = `hsl(${Math.floor(p.hue * 360)},80%,65%)`; g.fillRect(-3 * r, -1.6 * r, 6 * r, 3.2 * r);
      } else if (type === 'lanterns') {
        const fl = .8 + .2 * Math.sin(t * 6 + p.a * 5), w = 7 * r, hh = 10 * r;
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, hh * 2.2);
        gr.addColorStop(0, `rgba(255,190,110,${.35 * fl})`); gr.addColorStop(1, 'rgba(255,150,80,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, hh * 2.2, 0, 7); g.fill();
        g.fillStyle = `rgba(255,${Math.round(170 + 40 * fl)},110,.95)`;
        g.beginPath(); g.moveTo(-w * .7, -hh * .5); g.lineTo(w * .7, -hh * .5); g.lineTo(w * .5, hh * .5); g.lineTo(-w * .5, hh * .5); g.closePath(); g.fill();
      } else if (type === 'notes') {
        g.rotate(Math.sin(p.a) * .4); g.globalAlpha = .8; g.fillStyle = p.hue > .5 ? '#fff' : '#ffe6a8';
        g.font = `${Math.round(12 * r)}px serif`; g.textAlign = 'center'; g.fillText(p.hue > .66 ? '♪' : p.hue > .33 ? '♫' : '♬', 0, 0);
      } else if (type === 'dandelion') {
        g.rotate(Math.sin(p.a) * .5); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = .7 * dpr;
        const s = 4 * r;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, s * 1.6);
        for (let k = 0; k < 9; k++) { const ang = -Math.PI / 2 + (k - 4) * .32; g.moveTo(0, 0); g.lineTo(Math.cos(ang) * s, Math.sin(ang) * s); }
        g.stroke();
      } else if (type === 'crystals') {
        g.rotate(p.a); g.strokeStyle = 'rgba(210,235,255,.85)'; g.lineWidth = .9 * dpr;
        const s = 4.5 * r;
        g.beginPath();
        for (let k = 0; k < 3; k++) {
          const ang = k * Math.PI / 3, cx = Math.cos(ang) * s, cy = Math.sin(ang) * s;
          g.moveTo(-cx, -cy); g.lineTo(cx, cy);
          g.moveTo(cx * .6 - cy * .25, cy * .6 + cx * .25); g.lineTo(cx * .8, cy * .8); g.lineTo(cx * .6 + cy * .25, cy * .6 - cx * .25);
        }
        g.stroke();
      } else if (type === 'orbs') {
        const pulse = .7 + .3 * Math.sin(t * 2 + p.a * 4), rad = 6 * r, c = p.hue > .5 ? '170,140,255' : '120,220,255';
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad * 2);
        gr.addColorStop(0, `rgba(255,255,255,${.9 * pulse})`); gr.addColorStop(.25, `rgba(${c},${.6 * pulse})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rad * 2, 0, 7); g.fill();
        g.strokeStyle = `rgba(${c},${.5 * pulse})`; g.lineWidth = .8 * dpr; g.beginPath(); g.arc(0, 0, rad * 1.3, t + p.a, t + p.a + 4); g.stroke();
      } else if (type === 'runes') {
        g.globalAlpha = fade * .85; g.fillStyle = '#bfe4ff'; g.shadowColor = '#7fc8ff'; g.shadowBlur = 8 * dpr;
        g.font = `${Math.round(14 * r)}px serif`; g.textAlign = 'center'; g.fillText(p.glyph, 0, 0);
      } else if (type === 'maple') {                       // 楓葉：五尖的葉形
        g.rotate(p.a); g.scale(1, .55 + .45 * Math.sin(p.a * 1.3));
        g.fillStyle = ['rgba(214,60,40,.88)', 'rgba(232,110,40,.88)', 'rgba(190,40,50,.85)'][Math.floor(p.hue * 3)];
        const s = 5.5 * r;
        g.beginPath(); for (let k = 0; k < 10; k++) { const ang = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? s * .45 : s * (k === 0 ? 1.1 : .95); g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); } g.closePath(); g.fill();
        g.strokeStyle = 'rgba(120,30,20,.6)'; g.lineWidth = .6 * dpr; g.beginPath(); g.moveTo(0, s * .3); g.lineTo(0, s * 1.3); g.stroke();
      } else if (type === 'ginkgo') {                      // 銀杏：扇形葉
        g.rotate(p.a); g.scale(1, .6 + .4 * Math.sin(p.a * 1.5));
        g.fillStyle = p.hue > .5 ? 'rgba(250,206,60,.9)' : 'rgba(236,180,40,.88)';
        const s = 5.5 * r;
        g.beginPath(); g.moveTo(0, s * .7); g.arc(0, s * .7, s * 1.2, -Math.PI * .82, -Math.PI * .18); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(180,130,30,.7)'; g.lineWidth = .7 * dpr; g.beginPath(); g.moveTo(0, s * .7); g.lineTo(0, s * 1.4); g.stroke();
      } else if (type === 'roses') {                       // 玫瑰花瓣：深紅、有捲邊
        g.rotate(p.a); g.scale(1, .5 + .5 * Math.sin(p.a * 1.7));
        g.fillStyle = p.hue > .5 ? 'rgba(170,20,45,.9)' : 'rgba(210,40,70,.88)';
        g.beginPath(); g.moveTo(0, -5 * r); g.bezierCurveTo(6 * r, -5 * r, 5 * r, 4 * r, 0, 5 * r); g.bezierCurveTo(-5 * r, 4 * r, -6 * r, -5 * r, 0, -5 * r); g.fill();
        g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(-1.5 * r, -1.5 * r, 1.6 * r, 2.6 * r, -.4, 0, 7); g.fill();
      } else if (type === 'snowflake') {                   // 雪花結晶：六角分枝
        g.rotate(p.a * .4); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = .9 * dpr; g.lineCap = 'round';
        const s = 5 * r;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const ang = k * Math.PI / 3, c = Math.cos(ang), sn = Math.sin(ang);
          g.moveTo(0, 0); g.lineTo(c * s, sn * s);
          for (const f of [.45, .72]) { const bx = c * s * f, by = sn * s * f, l = s * (.85 - f) * .9;
            g.moveTo(bx, by); g.lineTo(bx + Math.cos(ang + .7) * l, by + Math.sin(ang + .7) * l);
            g.moveTo(bx, by); g.lineTo(bx + Math.cos(ang - .7) * l, by + Math.sin(ang - .7) * l); }
        }
        g.stroke();
      } else if (type === 'pollen') {                      // 花粉：小小的暖黃光點
        const pulse = .5 + .5 * Math.sin(t * 2.4 + p.a * 6), rad = 2.6 * r;
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad * 2);
        gr.addColorStop(0, `rgba(255,248,200,${.9 * pulse + .1})`); gr.addColorStop(.4, `rgba(255,220,120,${.4 * pulse})`); gr.addColorStop(1, 'rgba(255,200,80,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rad * 2, 0, 7); g.fill();
      } else if (type === 'ash') {                         // 灰燼：灰色碎片，邊緣偶爾還有火光
        g.rotate(p.a * 1.5); g.scale(1, .5 + .5 * Math.sin(p.a * 2));
        g.fillStyle = p.hue > .85 ? 'rgba(255,140,80,.8)' : `rgba(${110 + p.hue * 60 | 0},${105 + p.hue * 55 | 0},${100 + p.hue * 50 | 0},.75)`;
        g.beginPath(); g.moveTo(-2.4 * r, -1.2 * r); g.lineTo(2 * r, -1.8 * r); g.lineTo(2.6 * r, 1.4 * r); g.lineTo(-1.6 * r, 1.8 * r); g.closePath(); g.fill();
      } else if (type === 'smoke') {                       // 煙霧：大而淡、慢慢擴散
        const rad = (14 + p.s * 16) * dpr * (1 + Math.min(1.5, p.life * .08)), a = .12 * Math.max(0, 1 - p.life * .03);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad);
        gr.addColorStop(0, `rgba(220,220,230,${a})`); gr.addColorStop(1, 'rgba(220,220,230,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rad, 0, 7); g.fill();
      } else if (type === 'clouds') {                      // 雲朵：幾個圓疊在一起
        const s = 9 * r; g.globalAlpha = .55; g.fillStyle = '#fff';
        g.beginPath(); for (const [cx, cy, cr] of [[-1.2, .25, .7], [-.4, -.2, .95], [.6, -.05, .8], [1.3, .3, .6], [0, .4, .8]]) { g.moveTo(cx * s + cr * s, cy * s); g.arc(cx * s, cy * s, cr * s, 0, 7); } g.fill();
      } else if (type === 'moons') {                       // 月牙：淡入淡出
        g.globalAlpha = fade * .85; g.rotate(-.5 + Math.sin(p.a) * .2); g.fillStyle = p.hue > .5 ? '#fff1c2' : '#e6ecff';
        g.shadowColor = g.fillStyle; g.shadowBlur = 8 * dpr;
        const s = 6 * r, d = s * .62, hy = Math.sqrt(s * s - d * d / 4), th = Math.atan2(hy, d / 2);   // 兩個圓相減：外圓左半邊 + 內圓左半邊
        g.beginPath(); g.arc(0, 0, s, th, Math.PI * 2 - th); g.arc(d, 0, s, Math.atan2(-hy, -d / 2), Math.atan2(hy, -d / 2), true); g.closePath(); g.fill();
      } else if (type === 'starfall') {                    // 落星：金色五角星翻轉落下
        g.rotate(p.a); g.scale(Math.cos(p.a * 1.6), 1); g.fillStyle = p.hue > .5 ? '#ffd45c' : '#fff0a6';
        const R1 = 5.5 * r, R2 = 2.3 * r;
        g.beginPath(); for (let k = 0; k < 10; k++) { const ang = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? R2 : R1; g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); } g.closePath(); g.fill();
      } else if (type === 'gems') {                        // 寶石碎片：菱形加高光
        g.rotate(p.a); const s = 4.5 * r, hue = Math.floor(p.hue * 6) * 60;
        g.fillStyle = `hsla(${hue},85%,62%,.9)`;
        g.beginPath(); g.moveTo(0, -s * 1.3); g.lineTo(s * .8, 0); g.lineTo(0, s * 1.3); g.lineTo(-s * .8, 0); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(0, -s * 1.3); g.lineTo(s * .8, 0); g.lineTo(0, -s * .2); g.closePath(); g.fill();
      } else if (type === 'glitter') {                     // 金粉閃片：翻轉時一閃一閃
        g.rotate(p.a * .7); const fl = Math.abs(Math.cos(p.a)); g.scale(1, .2 + .8 * fl);
        g.fillStyle = `rgba(255,${200 + 55 * fl | 0},${110 + 120 * fl | 0},${.55 + .45 * fl})`; g.fillRect(-1.8 * r, -1.8 * r, 3.6 * r, 3.6 * r);
      } else if (type === 'coins') {                       // 金幣：翻轉的圓片
        const sx = Math.cos(p.a), s = 4.5 * r; g.scale(Math.abs(sx) * .9 + .1, 1);
        g.fillStyle = sx > 0 ? '#f5c542' : '#d9a420'; g.beginPath(); g.arc(0, 0, s, 0, 7); g.fill();
        g.strokeStyle = 'rgba(160,110,10,.8)'; g.lineWidth = .8 * dpr; g.beginPath(); g.arc(0, 0, s * .7, 0, 7); g.stroke();
      } else if (type === 'ribbons') {                     // 彩帶：彎彎的長條
        g.rotate(p.a * .8); g.strokeStyle = `hsl(${Math.floor(p.hue * 360)},80%,65%)`; g.lineWidth = 2 * r; g.lineCap = 'round';
        const L = 9 * r; g.beginPath(); g.moveTo(-L, 0); g.bezierCurveTo(-L * .3, -L * .6 * Math.sin(t * 3 + p.a), L * .3, L * .6 * Math.sin(t * 3 + p.a), L, 0); g.stroke();
      } else if (type === 'balloons') {                    // 氣球：上升、繩子跟著晃
        const s = 6 * r, sw = Math.sin(t * 1.5 + p.a) * .15; g.rotate(sw);
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = .6 * dpr; g.beginPath(); g.moveTo(0, s * 1.2); g.quadraticCurveTo(s * .4, s * 2.2, 0, s * 3.2); g.stroke();
        g.fillStyle = `hsla(${Math.floor(p.hue * 360)},75%,62%,.9)`; g.beginPath(); g.ellipse(0, 0, s * .85, s * 1.1, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(-s * .3, -s * .4, s * .18, s * .3, -.4, 0, 7); g.fill();
      } else if (type === 'planes') {                      // 紙飛機
        if (p.vx < 0) g.scale(-1, 1);
        g.rotate(.18 + Math.sin(t * 1.2 + p.a) * .08); const s = 7 * r;
        g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.moveTo(s, 0); g.lineTo(-s, -s * .55); g.lineTo(-s * .45, 0); g.lineTo(-s, s * .3); g.closePath(); g.fill();
        g.fillStyle = 'rgba(200,210,230,.9)'; g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * .45, 0); g.lineTo(-s * .7, s * .45); g.closePath(); g.fill();
      } else if (type === 'birds' || type === 'bats') {    // 飛鳥 / 蝙蝠剪影：翅膀拍動
        if (p.vx < 0) g.scale(-1, 1);
        const flap = Math.sin(t * (type === 'bats' ? 14 : 8) + p.a * 5), s = (type === 'bats' ? 5 : 6) * r;
        g.fillStyle = type === 'bats' ? 'rgba(25,20,35,.9)' : 'rgba(30,30,40,.8)';
        g.beginPath(); g.moveTo(-s * .3, 0);
        if (type === 'bats') { g.lineTo(-s, -s * .6 * flap); g.lineTo(-s * .7, s * .1); g.lineTo(-s * .4, -s * .1); g.lineTo(0, s * .3); g.lineTo(s * .4, -s * .1); g.lineTo(s * .7, s * .1); g.lineTo(s, -s * .6 * flap); g.lineTo(s * .3, 0); }
        else { g.quadraticCurveTo(-s * .7, -s * .8 * flap, -s * 1.3, -s * .3 * flap); g.quadraticCurveTo(-s * .6, -s * .1, 0, s * .15); g.quadraticCurveTo(s * .6, -s * .1, s * 1.3, -s * .3 * flap); g.quadraticCurveTo(s * .7, -s * .8 * flap, s * .3, 0); }
        g.closePath(); g.fill();
      } else if (type === 'ghosts') {                      // 小幽靈：飄上去、淡入淡出
        g.globalAlpha = fade * .75; g.rotate(Math.sin(t + p.a) * .15); const s = 6 * r;
        g.fillStyle = '#f4f6ff'; g.beginPath(); g.arc(0, -s * .2, s, Math.PI, 0);
        for (let k = 0; k <= 4; k++) g.lineTo(s - k * s / 2, s * (.9 + (k % 2 ? -.25 : 0) + .1 * Math.sin(t * 4 + k)));
        g.closePath(); g.fill();
        g.fillStyle = '#2a2a3a'; g.beginPath(); g.arc(-s * .35, -s * .2, s * .14, 0, 7); g.arc(s * .35, -s * .2, s * .14, 0, 7); g.fill();
      } else if (type === 'fish') {                        // 小魚：尾巴擺動
        if (p.vx < 0) g.scale(-1, 1);
        const s = 5 * r, wag = Math.sin(t * 9 + p.a * 4) * .35;
        g.fillStyle = ['rgba(255,150,80,.88)', 'rgba(120,200,255,.85)', 'rgba(255,220,120,.88)'][Math.floor(p.hue * 3)];
        g.beginPath(); g.ellipse(0, 0, s, s * .5, 0, 0, 7); g.fill();
        g.beginPath(); g.moveTo(-s * .8, 0); g.lineTo(-s * 1.6, -s * .55 + wag * s); g.lineTo(-s * 1.6, s * .55 + wag * s); g.closePath(); g.fill();
        g.fillStyle = 'rgba(20,20,30,.8)'; g.beginPath(); g.arc(s * .5, -s * .1, s * .1, 0, 7); g.fill();
      } else if (type === 'jellyfish') {                   // 水母：鐘形一縮一放、觸手飄動
        const pulse = 1 + Math.sin(t * 2.2 + p.a * 3) * .12, s = 6 * r;
        const c = p.hue > .5 ? '255,170,230' : '150,210,255';
        g.strokeStyle = `rgba(${c},.45)`; g.lineWidth = .8 * dpr;
        g.beginPath(); for (let k = -2; k <= 2; k++) { g.moveTo(k * s * .3, s * .2); g.quadraticCurveTo(k * s * .3 + Math.sin(t * 2 + k + p.a) * s * .4, s * 1.2, k * s * .25, s * 2.2); } g.stroke();
        const gr = g.createRadialGradient(0, -s * .2, 0, 0, 0, s * 1.2 * pulse);
        gr.addColorStop(0, `rgba(255,255,255,.7)`); gr.addColorStop(.6, `rgba(${c},.45)`); gr.addColorStop(1, `rgba(${c},.1)`);
        g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, s * 1.1 * pulse, s * .75 / pulse, 0, Math.PI, 0); g.closePath(); g.fill();
      } else if (type === 'code') {                        // 數位雨：綠色字元往下掉，後面拖一串淡掉的字
        if (Math.random() < dt * 6) { p.trail.pop(); p.trail.unshift(p.glyph()); }
        const fs = Math.round(11 * r); g.font = `${fs}px monospace`; g.textAlign = 'center';
        p.trail.forEach((ch, k) => { g.fillStyle = k ? `rgba(80,255,140,${.6 - k * .11})` : 'rgba(210,255,225,.95)'; g.fillText(ch, 0, -k * fs); });
      } else if (type === 'pixels') {                      // 像素方塊：往上浮、偶爾閃
        const s = 3 * r * (1 + Math.floor(p.hue * 3) * .5); g.globalAlpha = .55 + .45 * Math.abs(Math.sin(t * 2 + p.a * 4));
        g.fillStyle = ['#7ff3ff', '#ff7fd6', '#b4ff7f', '#ffe27f'][Math.floor(p.hue * 4)]; g.fillRect(-s / 2, -s / 2, s, s);
      } else if (type === 'hexagons') {                    // 科技六角：淡入淡出的線框
        g.globalAlpha = fade * .8; g.rotate(p.a * .2); g.strokeStyle = p.hue > .5 ? '#7fe0ff' : '#a99bff'; g.lineWidth = 1 * dpr;
        g.shadowColor = g.strokeStyle; g.shadowBlur = 6 * dpr;
        const s = 7 * r; g.beginPath(); for (let k = 0; k < 6; k++) { const ang = k * Math.PI / 3; g.lineTo(Math.cos(ang) * s, Math.sin(ang) * s); } g.closePath(); g.stroke();
      } else if (type === 'embers') {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, 4 * r);
        gr.addColorStop(0, 'rgba(255,214,150,.95)'); gr.addColorStop(.4, 'rgba(255,110,70,.5)'); gr.addColorStop(1, 'rgba(255,60,40,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 4 * r, 0, 7); g.fill();
      } else {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, 5 * r);
        gr.addColorStop(0, 'rgba(255,240,200,.75)'); gr.addColorStop(1, 'rgba(255,230,180,0)');
        g.globalAlpha = .5 + .5 * Math.sin(t + p.a * 4);
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 5 * r, 0, 7); g.fill();
      }
      g.restore();
    }
  }

  /** 光束：從上方斜射的柔和光柱 */
  drawRays(g, W, H, t) {
    g.save();
    g.globalCompositeOperation = 'screen';
    const ox = W * .18, oy = -H * .15;
    for (let k = 0; k < 6; k++) {
      const ang = .55 + k * .13 + Math.sin(t * .15 + k) * .03;
      const w = .035 + .02 * Math.sin(t * .3 + k * 1.7);
      const a = this.fx.rays * (.10 + .06 * Math.sin(t * .4 + k * 2.1));
      const L = Math.hypot(W, H) * 1.3;
      const gr = g.createLinearGradient(ox, oy, ox + Math.cos(ang) * L, oy + Math.sin(ang) * L);
      gr.addColorStop(0, `rgba(255,244,220,${a})`); gr.addColorStop(1, 'rgba(255,244,220,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(ang - w) * L, oy + Math.sin(ang - w) * L);
      g.lineTo(ox + Math.cos(ang + w) * L, oy + Math.sin(ang + w) * L);
      g.closePath(); g.fill();
    }
    g.restore();
  }

  /** 圖片實際在畫布上的範圍（「完整顯示」時，左右或上下會有留白，不該錄進去） */
  imageRect() {
    const cw = this.canvas.width, ch = this.canvas.height;
    if (this.fit === 'cover') return { x: 0, y: 0, w: cw, h: ch };
    const [fx, fy] = this.fitScale(), w = Math.round(cw / fx), h = Math.round(ch / fy);
    return { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), w, h };
  }

  /** 錄影 / GIF 時，暫時改用「圖片本身的大小」來畫（長邊最多 max），輸出解析度就跟圖片一樣，不受預覽視窗大小影響；
   *  畫面上用 object-fit 維持比例，看起來不會變形。結束後恢復成預覽大小 */
  async withImageSize(fn, max = 1920) {
    const s = Math.min(1, max / Math.max(this.imgW, this.imgH));
    const w = Math.max(2, Math.round(this.imgW * s / 2) * 2), h = Math.max(2, Math.round(this.imgH * s / 2) * 2);
    this.fixedSize = { w, h };
    for (const c of [this.canvas, this.fxCanvas]) { c.width = w; c.height = h; c.style.objectFit = 'contain'; }
    this.particles = [];                                // 粒子依畫布大小重新分布
    this.draw();
    try { return await fn(); }
    finally {
      this.fixedSize = null;
      for (const c of [this.canvas, this.fxCanvas]) c.style.objectFit = '';
      this.particles = [];
      this.resize();
    }
  }

  /** 錄成 WebM：用圖片本身的大小畫，每一幀把 WebGL 畫面與粒子層合成（只取圖片範圍） */
  record(seconds = 6, bg = '#000', max = 1920) {
    return this.withImageSize(() => this.recordNow(seconds, bg), max);
  }

  async recordNow(seconds = 6, bg = '#000') {
    const out = document.createElement('canvas');
    const R = this.imageRect();
    out.width = R.w - (R.w % 2); out.height = R.h - (R.h % 2);
    const g = out.getContext('2d');
    const stream = out.captureStream(30);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const done = new Promise(r => rec.onstop = r);
    this.onFrame = () => { g.fillStyle = bg; g.fillRect(0, 0, out.width, out.height); g.drawImage(this.canvas, R.x, R.y, out.width, out.height, 0, 0, out.width, out.height); g.drawImage(this.fxCanvas, R.x, R.y, out.width, out.height, 0, 0, out.width, out.height); };
    this.play();
    rec.start(200);
    await new Promise(r => setTimeout(r, seconds * 1000));
    rec.stop(); await done;
    this.onFrame = null;
    return new Blob(chunks, { type: 'video/webm' });
  }

  snapshot() {
    const out = document.createElement('canvas'), R = this.imageRect();
    out.width = R.w; out.height = R.h;
    const g = out.getContext('2d');
    g.drawImage(this.canvas, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h); g.drawImage(this.fxCanvas, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h);
    return out;
  }

  destroy() {
    this.alive = false;
    this.ro.disconnect();
    this.pointerTarget.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('deviceorientation', this.onOri);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.remove(); this.fxCanvas.remove();
  }
}

export async function blobToCanvas(blob) {
  const img = await loadImage(blob);
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  URL.revokeObjectURL(img.src);
  return c;
}

/** 由已存的動態作品（DB 物件）組回可播放的資料；rawDepth 需再經 processDepth */
export async function hydrateLive(live) {
  const rawDepth = live.depth ? await blobToCanvas(live.depth) : null;
  const parts = [];
  for (const p of live.parts || []) parts.push({ ...p, mask: await blobToCanvas(p.maskBlob), bounds: null });
  return { rawDepth, parts };
}
