// 閃卡工藝：全息鐳射 + 分層景深的 3D 閃卡
// 材質公式移植自 RuiC-card-skill（MIT, © 2026 HRuiCcc）的 Three.js 查看器：
// 視角相位的鐳射光譜、掃光帶、閃粉、線稿發光、邊緣亮邊、主體 / 背景分層視差。
// 這裡改寫成不依賴 Three.js 的 WebGL，卡片幾何用 CSS 3D 旋轉，視角向量傳進 shader。
import { loadImage, clamp, reducedMotion } from './util.js';
import { textLayer } from './craftlayers.js';
import { compositeGroup, alphaMask, stickersToLayers, isDefaultPlace } from './layers.js';
import { LiveStage, DEFORM_CHUNK, DEFAULT_FX, TINTS, packPartMasks, partUniforms, blobToCanvas } from './live.js';
import { cardBack } from './cards.js';

export const FINISHES = [
  ['pearl', '珍珠', '偏白的柔和彩虹，最百搭'],
  ['silver', '銀箔', '去色的金屬銀光，適合黑白或冷色圖'],
  ['gold', '燙金', '暖金色箔面，隨角度流動'],
  ['aurora', '極光', '綠紫偏移的全息，夜景很搭'],
  ['rose', '玫瑰金', '粉金色調，柔和可愛'],
  ['original', '原畫', '關掉鐳射，只保留立體景深'],
];

// 手感工藝：燙金 / 打凸 / 壓紋 / UV（任何圖層、卡框文字、或從原圖取範圍都可以加工）
export const CRAFT_KINDS = [['none', '無'], ['gold', '燙金'], ['silver', '燙銀'], ['rose', '玫瑰金'], ['copper', '古銅'], ['black', '黑燙'], ['holo', '幻彩燙'],
  ['emboss', '打凸'], ['deboss', '壓紋'], ['uv', 'UV 亮油']];
const FOIL_IDX = { gold: 1, silver: 2, rose: 3, copper: 4, black: 5, holo: 6 };
export const PAPERS = [['none', '無'], ['linen', '亞麻'], ['canvas', '畫布'], ['leather', '皮革'], ['watercolor', '水彩紙'], ['velvet', '絲絨']];
export const IMG_SOURCES = [['bright', '亮的地方'], ['dark', '暗的地方'], ['color', '某個顏色'], ['line', '線稿輪廓'], ['depth', '近處（需要深度圖）']];
const CRAFT_KEYS = ['frameCraft', 'imgCraft', 'imgSrc', 'imgThr', 'imgColor', 'imgAmt'];

export const DEFAULT_CRAFT = {
  finish: 'pearl', foil: .65, stripe: 1, angle: 32, sharp: 10, flake: .5, edge: .5, line: .5, gloss: .25,
  subjectDepth: .28, bgDepth: -.2, subjectScale: 1.06, fxDepth: .45, frame: 'classic', frameColor: 'gold', auto: true,
  maskSource: 'depth3d', maskThreshold: .5,
  showName: true, showSubtitle: true, showRarity: true, showSerial: true, showPlate: true, flavor: '', textPos: 'bottom', textFont: 'serif', textColor: 'light', textSize: 1,
  stickers: [],
  frameCraft: 'none', imgCraft: 'none', imgSrc: 'bright', imgThr: .7, imgColor: '#d4af37', imgAmt: 1, paper: 'none', paperAmt: .5, craftH: .6, craftShine: 1,
};

/** [欄位, 名稱, 最小, 最大, 間距, 小解說] */
export const CRAFT_PARAMS = [
  ['foil', '鐳射強度', 0, 2, .01, '彩虹反光有多明顯；0 = 幾乎看不到，超過 1 會更飽和刺眼'],
  ['stripe', '條紋密度', .3, 5, .05, '光譜條紋的疏密；越大條紋越細越多'],
  ['angle', '條紋角度', -90, 90, 1, '彩虹條紋的傾斜方向（度）'],
  ['sharp', '光帶銳利度', 1, 40, 1, '掃過的亮帶寬窄；越大越細、越像一道光'],
  ['flake', '閃粉', 0, 2, .01, '細碎亮點的多寡，轉動時一顆顆閃；超過 1 會更密更亮'],
  ['gloss', '光澤', 0, 2, .01, '像覆膜一樣的白色反光，跟著角度滑過卡面'],
  ['edge', '邊緣亮邊', 0, 1.5, .01, '卡片四邊的鐳射邊框亮度與寬度'],
  ['line', '線稿發光', 0, 2, .01, '沿著人物輪廓線的發光，需有主體遮罩'],
  ['subjectDepth', '主體景深', -.6, .8, .01, '人物浮出卡面的程度；正值往前、負值往後'],
  ['bgDepth', '背景景深', -.8, .4, .01, '背景退後的程度；負值越大越深'],
  ['subjectScale', '主體縮放', .8, 1.4, .01, '人物相對背景的大小，略大會更有浮雕感'],
  ['fxDepth', '前景素材景深', -.4, 1, .01, '放在「人物前面」的素材浮出多少；比主體景深大就會更靠前'],
];

const VS = `attribute vec2 aPos; varying vec2 vUv;
void main(){ vUv = vec2(aPos.x*.5+.5, .5-aPos.y*.5); gl_Position = vec4(aPos,0.,1.); }`;

const FS = `precision highp float;
varying vec2 vUv;
uniform sampler2D tImage, tBg, tMask, tLine, tText, tFx, uMaskA, uMaskB, tSub;
uniform float uTime, uFoil, uScale, uDepth, uBgDepth, uFinish, uHasMask, uLine, uFlake, uEdge, uStripe, uAngle, uSharp, uAlpha, uFxDepth, uHasFx, uGloss, uDepthMode, uHasSub;
uniform vec4 uLv1, uLv2, uLv3, uLv4;
uniform sampler2D tCraft, tCraft2;   // 手感工藝：(燙箔, 凸起, 壓凹) / (箔的種類, UV 亮油)
uniform float uHasCraft, uPaper, uPaperAmt, uCraftH, uCraftShine;
uniform vec2 uCraftTex;   // 動態閃卡帶過來的 LIVE 濾鏡：(極光, 稜鏡, 閃電, 結霜) (掃描線, 水底光紋, 漏光, 顆粒) (調色, 調色強度, 色相流轉, 暗角)
uniform vec3 uView;
uniform vec2 uRes, uLook;
uniform float uLive, uAspect;
uniform int uCount;
uniform vec4 uA[8];
uniform vec4 uB[8];
uniform vec4 uC[8];
${DEFORM_CHUNK}
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
// 紙紋的高度（1 亞麻 2 畫布 3 皮革 4 水彩紙 5 絲絨）
float paperH(vec2 q){
  if (uPaper < 1.5) { vec2 w = q * 230.; return .5 + .2 * sin(w.x * 3.1416) * (.6 + .4 * sin(w.y * .7)) + .2 * sin(w.y * 3.1416) * (.6 + .4 * sin(w.x * .7)) + .12 * vnoise(q * 600.); }
  if (uPaper < 2.5) { vec2 w = q * 130.; return .55 * max(abs(sin(w.x * 3.1416)), abs(sin(w.y * 3.1416))) + .15 * vnoise(q * 350.); }
  if (uPaper < 3.5) {
    vec2 w = q * 42., i = floor(w), f = fract(w); float d = 1.;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 r = o + vec2(hash(i + o), hash(i + o + 7.)) - f; d = min(d, dot(r, r)); }
    return smoothstep(0., .45, sqrt(d)) * .8 + .2 * vnoise(q * 420.);
  }
  if (uPaper < 4.5) return vnoise(q * 28.) * .45 + vnoise(q * 95.) * .35 + vnoise(q * 320.) * .2;
  return vnoise(q * 700.) * .6 + vnoise(q * 230.) * .4;
}
float craftH(vec2 q){ vec3 t = texture2D(tCraft, q).rgb; return t.g - t.b - t.r * .18; }   // 燙箔會微微壓進紙面
float inside(vec2 p){ return step(0.,p.x)*step(0.,p.y)*step(p.x,1.)*step(p.y,1.); }
vec2 parallax(vec2 uv, float d){ return uv + uView.xy / max(abs(uView.z), .4) * d * .10; }
vec3 spectrum(float ph){ return .66 + .25 * cos(6.28318 * (ph + vec3(0., .33, .67))); }
float strength(){ return abs(uFinish - 5.) < .05 ? 0. : uFoil; }
vec3 film(vec2 uv){
  float a = radians(uAngle);
  vec2 r = mat2(cos(a), -sin(a), sin(a), cos(a)) * (uv - .5);
  float ph = (r.x * .85 + r.y * .55) * uStripe + uView.x * 1.5 - uView.y * .9;
  if (uFinish > 1.5 && uFinish < 2.5) {           // 燙金
    float hi = .5 + .5 * sin(ph * 6.28318), gl = .5 + .5 * cos((ph + .25) * 6.28318);
    return mix(vec3(.72,.50,.20), vec3(1.,.90,.60), hi * .7 + gl * .3);
  }
  if (uFinish > 3.5 && uFinish < 4.5) {           // 玫瑰金
    float hi = .5 + .5 * sin(ph * 6.28318);
    return mix(vec3(.78,.46,.46), vec3(1.,.86,.80), hi);
  }
  vec3 c = spectrum(ph);
  if (uFinish > 2.5 && uFinish < 3.5) c = mix(c, vec3(.35,1.,.75), .35 + .25 * sin(ph * 6.28)) * vec3(.85,1.,1.05); // 極光
  if (uFinish > .5 && uFinish < 1.5) c = vec3(dot(c, vec3(.2126,.7152,.0722)));                                     // 銀箔
  return c;
}
// 深度圖立體：沿視線逐步找交點，最近處位移 = 主體景深、最遠處 = 背景景深（tMask 在這個模式裝的是深度圖）
vec2 depthMarch(vec2 uv){
  vec2 off = uView.xy / max(abs(uView.z), .4) * .10;
  const int N = 28;
  float prevH = 1.;
  vec2 prevP = uv + off * uDepth;
  float prevD = texture2D(tMask, clamp(prevP, 0., 1.)).r;
  for (int i = 1; i <= N; i++) {
    float hgt = 1. - float(i) / float(N);
    vec2 p = uv + off * mix(uBgDepth, uDepth, hgt);
    float dz = texture2D(tMask, clamp(p, 0., 1.)).r;
    if (dz >= hgt) {
      float a = (prevD - prevH) / ((prevD - prevH) - (dz - hgt) - 1e-5);
      return mix(prevP, p, clamp(a, 0., 1.));
    }
    prevH = hgt; prevP = p; prevD = dz;
  }
  return prevP;
}
float sweep(vec2 uv){ return pow(.5 + .5 * sin((uv.x * .72 + uv.y * .45 + uView.x * 1.2 + uView.y * .6) * 6.283 * uStripe), uSharp); }
void main(){
  vec2 uv = vUv;
  vec2 dv = uLive > .5 ? deform(uv) : uv;     // 動態閃卡：LIVE 部件形變
  vec3 col;
  vec2 su = (parallax(dv, uDepth) - .5) / uScale + .5;
  float m = 0.;
  if (uDepthMode > .5) {
    // 背景組 → 原圖（深度圖逐像素位移，不切割）→ 主體組的其他素材（和人物同高的平面）
    vec2 bu = (parallax(dv, uBgDepth) - .5) / (1. + abs(uBgDepth) * .3) + .5;
    col = texture2D(tBg, clamp(bu, 0., 1.)).rgb;
    vec2 ou = depthMarch(dv);
    vec4 o = texture2D(tImage, clamp(ou, 0., 1.)) * inside(ou);
    col = mix(col, o.rgb, o.a);
    m = smoothstep(.35, .75, texture2D(tMask, clamp(ou, 0., 1.)).r) * o.a;
    su = ou;
    if (uHasSub > .5) {
      vec2 s2 = (parallax(dv, uDepth) - .5) / uScale + .5;
      vec4 sb = texture2D(tSub, clamp(s2, 0., 1.)) * inside(s2);
      col = mix(col, sb.rgb, sb.a);
      m = max(m, sb.a);
    }
  } else if (uHasMask > .5) {
    vec2 bu = (parallax(dv, uBgDepth) - .5) / (1. + abs(uBgDepth) * .3) + .5;
    vec3 bg = texture2D(tBg, clamp(bu, 0., 1.)).rgb;
    vec4 sub = texture2D(tImage, clamp(su, 0., 1.));
    m = texture2D(tMask, clamp(su, 0., 1.)).r * inside(su);
    col = mix(bg, mix(vec3(.08,.08,.11), sub.rgb, sub.a), m);
  } else {
    vec2 fu = (parallax(dv, uBgDepth * .4) - .5) / (1. + abs(uBgDepth) * .15) + .5;
    vec4 img = texture2D(tImage, clamp(fu, 0., 1.));
    col = mix(vec3(.08,.08,.11), img.rgb, mix(1., img.a, uAlpha));
    su = fu; m = 1.;
  }
  if (uHasFx > .5) {                                  // 人物前面的素材層
    vec2 eu = parallax(uv, uFxDepth);
    vec4 fx = texture2D(tFx, clamp(eu, 0., 1.)) * inside(eu);
    col = mix(col, fx.rgb, fx.a);
  }
  col *= 1. - shade;
  if (uFinish > 1.5 && uFinish < 2.5) col = col * vec3(1.02,.95,.78) + vec3(.05,.012,0.);
  vec3 foil = film(uv);
  float amount = strength();
  float lum = dot(col, vec3(.2126,.7152,.0722));
  float band = sweep(uv);
  float boost = uFinish > 1.5 && uFinish < 2.5 ? 1.7 : 1.;
  col *= 1. - amount * .21 * (1. - foil) * (.2 + band * .8);
  col += foil * amount * band * boost * (.065 + .11 * (1. - lum));
  col += foil * max(amount - 1., 0.) * (.12 + band * .35);           // 鐳射超過 1：整面更飽和
  float ew = .06 + max(uEdge - 1., 0.) * .08;
  float edge = 1. - smoothstep(.015, ew, min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y)));
  col = mix(col, foil * .75 + .21, clamp(edge * max(amount, .35) * uEdge * .7, 0., 1.));
  vec2 cell = floor(uv * uRes * .5);
  float flake = step(1. - .012 * uFlake * (1. + max(uFlake - 1., 0.) * 2.), hash(cell)) * pow(.5 + .5 * sin(hash(cell + 8.) * 30. + uView.x * 20. + uTime * .6), 10.);
  col += foil * flake * max(amount, .35) * .9 * uFlake;
  float line = 1. - smoothstep(.06, .25, texture2D(tLine, clamp(su, 0., 1.)).r);
  col += line * m * (.06 + band) * max(amount, .35) * uLine * .3;
  // 光澤：一大片柔和白光 + 一道細亮線，跟著視角滑過（像覆膜卡）
  vec2 gp = uv - .5 + uView.xy * vec2(1.6, -1.6);
  float glossSpot = exp(-dot(gp, gp) * 5.);
  float glossLine = pow(max(0., 1. - abs(gp.x * .8 + gp.y * .6) * 6.), 3.);
  col += vec3(1., .98, .95) * uGloss * (glossSpot * .16 + glossLine * .22);
  // ---- 動態閃卡：套用 LIVE 的畫面濾鏡（只有不需要重新取樣的那幾種，負擔很輕） ----
  if (uLv1.x > 0.) {
    float wv = sin(uv.x * 5. + uTime * .35) * .06 + sin(uv.x * 11. - uTime * .25) * .03;
    float bandA = exp(-pow((uv.y - .2 - wv) / .09, 2.));
    float streak = .55 + .45 * sin(uv.x * 60. + sin(uv.x * 9. + uTime) * 3. + uTime * 1.5);
    col += mix(vec3(.2, 1., .62), vec3(.62, .35, 1.), .5 + .5 * sin(uv.x * 3. + uTime * .3)) * bandA * streak * uLv1.x * .5;
  }
  if (uLv1.y > 0.) {
    float q = uv.x * .8 - uv.y * .6 + uTime * .04;
    col += (.5 + .5 * cos(6.283 * (q * 3. + vec3(0., .33, .67)))) * pow(max(0., sin(q * 8.17)), 6.) * uLv1.y * .35;
  }
  if (uLv1.z > 0.) {
    float t = fract(uTime * .11 + .3);
    col += vec3(.82, .88, 1.) * (smoothstep(0., .008, t) * (1. - smoothstep(.008, .04, t)) + .7 * smoothstep(.055, .06, t) * (1. - smoothstep(.06, .1, t))) * uLv1.z * .7;
  }
  if (uLv2.y > 0.) {
    vec2 q = uv * vec2(uRes.x / uRes.y, 1.) * 7.;
    float c = sin(q.x + uTime * .9 + sin(q.y * 1.3 + uTime * .7)) + sin(q.y * 1.1 - uTime * .8 + sin(q.x * .9 - uTime * .5));
    col = mix(col, col * vec3(.82, .97, 1.08), uLv2.y * .5) + vec3(.55, .85, 1.) * pow(max(0., c * .5), 4.) * .35 * uLv2.y;
  }
  if (uLv2.z > 0.) {
    float lk = smoothstep(.55, 0., distance(uv, vec2(.08 + .1 * sin(uTime * .21), .15 + .1 * cos(uTime * .17))));
    float lk2 = smoothstep(.5, 0., distance(uv, vec2(.95, .9 + .06 * sin(uTime * .13))));
    col += (vec3(1., .55, .3) * lk + vec3(.9, .4, .8) * lk2 * .7) * uLv2.z * .45;
  }
  if (uLv3.z > 0.) {
    float ang = uTime * .35 * uLv3.z + uv.x * 1.5 * uLv3.z;
    vec3 yiq = mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312) * col;
    float hh = atan(yiq.z, yiq.y) + ang, ch = length(yiq.yz);
    col = mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703) * vec3(yiq.x, ch * cos(hh), ch * sin(hh));
  }
  if (uLv3.x > .5) {
    vec3 c = col; float l = dot(c, vec3(.299, .587, .114)); vec3 tt = c;
    if (uLv3.x < 1.5) tt = c * vec3(1.08, 1., .86) + vec3(.03, .01, 0.);
    else if (uLv3.x < 2.5) tt = c * vec3(.88, .98, 1.1) + vec3(0., .01, .03);
    else if (uLv3.x < 3.5) tt = mix(vec3(l), vec3(l * 1.07, l * .92, l * .74), .9) + .03;
    else if (uLv3.x < 4.5) tt = vec3(l);
    else if (uLv3.x < 5.5) tt = mix(c, vec3(1., .86, .95), .18) * 1.04;
    else tt = c * vec3(.92, .9, 1.12) + vec3(.04, 0., .06);
    col = mix(c, tt, uLv3.y);
  }
  col *= exp2(uLv4.x); col = (col - .5) * (1. + uLv4.y) + .5;
  col = mix(vec3(dot(col, vec3(.299, .587, .114))), col, 1. + uLv4.z); col = max(col + vec3(.07, .02, -.07) * uLv4.w, 0.);
  if (uLv2.w > 0.) col += (hash(uv * 900. + fract(uTime * 7.3)) - .5) * uLv2.w * .12;
  if (uLv3.w > 0.) col *= mix(1., smoothstep(1.15, .35, length((uv - .5) * vec2(1.1, 1.)) * 1.25), uLv3.w);
  if (uLv2.x > 0.) col *= 1. - uLv2.x * .22 * (.5 + .5 * sin(gl_FragCoord.y * 1.6));
  if (uLv1.w > 0.) {
    float ed = min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y));
    vec2 fq = uv * vec2(uRes.x / uRes.y, 1.);
    float fr = smoothstep(.2 * uLv1.w + .02, 0., ed + (hash(floor(fq * 40.) + 7.) - .5) * .06);
    col = mix(col, vec3(.86, .93, 1.) * (.8 + .2 * hash(floor(fq * 160.))), fr * .8);
  }
  vec4 text = texture2D(tText, uv);
  col = mix(col, text.rgb, text.a);
  // ---- 手感工藝：光從左上方來，卡片轉動時光的方向跟著變 ----
  vec3 Lt = normalize(vec3(-.45 - uView.x * 1.2, -.55 + uView.y * 1.2, .7));
  if (uPaper > .5) {                                   // 紙紋
    vec2 q = uv * vec2(uRes.x / uRes.y, 1.); float e = .0012;
    float h0 = paperH(q), hx = paperH(q + vec2(e, 0.)), hy = paperH(q + vec2(0., e));
    vec3 n = normalize(vec3((h0 - hx) * uPaperAmt * 2.4, (h0 - hy) * uPaperAmt * 2.4, 1.));
    col *= 1. + (dot(n, Lt) - Lt.z) * 1.8;
    if (uPaper > 4.5) col += col * uPaperAmt * .4 * (1. - abs(uView.z)) * (.6 + .4 * h0);   // 絲絨：斜著看會泛光
  }
  if (uHasCraft > .5) {
    vec3 c0 = texture2D(tCraft, uv).rgb;
    vec2 e = uCraftTex * 1.6;
    float hx = craftH(uv + vec2(e.x, 0.)) - craftH(uv - vec2(e.x, 0.)), hy = craftH(uv + vec2(0., e.y)) - craftH(uv - vec2(0., e.y));
    if (c0.r + c0.g + c0.b > .003 || abs(hx) + abs(hy) > .002) {
      vec4 c2 = texture2D(tCraft2, uv);
      vec3 n = normalize(vec3(-hx * uCraftH * 7., -hy * uCraftH * 7., 1.));
      float diff = dot(n, Lt) - Lt.z;
      float spec = pow(max(dot(reflect(-Lt, n), vec3(0., 0., 1.)), 0.), 26.);
      float relief = clamp(max(c0.g, c0.b) * 1.5 + c0.r * .6 + (abs(hx) + abs(hy)) * 20., 0., 1.);
      col *= 1. + diff * 2.4 * relief;                 // 斜面的明暗
      col += spec * .3 * max(c0.g, c0.b) * uCraftShine;
      if (c0.r > .01) {                                // 燙箔：金屬反光，跟著角度流動
        float id = floor(c2.r * 255. / 32. + .5);
        vec3 base = id < 1.5 ? vec3(1., .78, .36) : id < 2.5 ? vec3(.86, .88, .93) : id < 3.5 ? vec3(.98, .68, .64) : id < 4.5 ? vec3(.80, .47, .27) : vec3(1.);
        float env = .5 + .5 * sin((uv.x * .9 + uv.y * .6) * 7. + uView.x * 5. - uView.y * 4.);
        float env2 = pow(.5 + .5 * sin((uv.x * .5 - uv.y * .8) * 11. - uView.x * 3. + uView.y * 6.), 3.);
        vec3 metal = base * (.36 + .78 * env) + base * env2 * .5;
        if (id > 5.5) metal = spectrum((uv.x * .8 + uv.y * .5) * 2. + uView.x * 1.6 - uView.y) * (.72 + .5 * env);   // 幻彩燙
        else if (id > 4.5) metal = vec3(.035) + vec3(.4) * env2;                                                       // 黑燙
        metal += vec3(1.) * (spec * 1.1 + env2 * .12) * uCraftShine;
        metal *= 1. + diff * 1.4;
        metal *= mix(1., .35 + 1.25 * dot(col, vec3(.299, .587, .114)), .65);   // 保留底下圖案的明暗，花紋、文字細節才看得到
        col = mix(col, metal, clamp(c0.r, 0., 1.));
      }
      if (c2.g > .01) {                                // UV 亮油：局部覆膜反光
        vec2 gp = uv - .5 + uView.xy * vec2(1.6, -1.6);
        float gs = exp(-dot(gp, gp) * 4.), gl = pow(max(0., 1. - abs(gp.x * .8 + gp.y * .6) * 5.), 3.);
        col = mix(col, col * 1.1 + .02, c2.g * .6);
        col += vec3(1.) * c2.g * (gs * .3 + gl * .55 + spec * .5) * uCraftShine;
      }
    }
  }
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('閃卡 shader 錯誤：' + gl.getShaderInfoLog(s));
  return s;
}
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/** 邊緣偵測當線稿：白底黑線 */
export function lineArt(img, max = 640) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * s), h = Math.round(img.height * s);
  const c = canvasOf(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const src = g.getImageData(0, 0, w, h), d = src.data, L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11) / 255;
  const out = g.createImageData(w, h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1];
    const gy = L[i + w - 1] + 2 * L[i + w] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - w] - L[i - w + 1];
    const v = 255 * (1 - clamp(Math.hypot(gx, gy) * 1.6 - .15, 0, 1));
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v; out.data[i * 4 + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

/** 主體區域用周圍顏色模糊填補，當背景層（避免主體位移時出現重影） */
export function fillBackground(img, mask) {
  const w = img.width, h = img.height;
  const hole = canvasOf(w, h), hg = hole.getContext('2d');
  hg.drawImage(img, 0, 0, w, h);
  hg.globalCompositeOperation = 'destination-out';
  hg.filter = `blur(${Math.round(w / 120)}px)`;
  hg.drawImage(mask, 0, 0, w, h); hg.drawImage(mask, 0, 0, w, h);
  hg.filter = 'none'; hg.globalCompositeOperation = 'source-over';
  const out = canvasOf(w, h), og = out.getContext('2d');
  og.filter = `blur(${Math.round(w / 14)}px)`;
  for (let i = 0; i < 4; i++) og.drawImage(hole, 0, 0, w, h);
  og.filter = `blur(${Math.round(w / 40)}px)`;
  og.drawImage(hole, 0, 0, w, h);
  og.filter = 'none';
  og.drawImage(hole, 0, 0, w, h);
  // 大面積的洞中間可能還有半透明：最後在底下墊一層大幅模糊的原圖，確保完全不透明
  og.globalCompositeOperation = 'destination-over';
  og.filter = `blur(${Math.round(w / 9)}px)`;
  og.drawImage(img, 0, 0, w, h);
  og.filter = 'none'; og.globalCompositeOperation = 'source-over';
  og.drawImage(hole, 0, 0, w, h);   // 邊緣再補一次原圖，避免被模糊底層蓋淡
  og.globalCompositeOperation = 'destination-over'; og.fillStyle = '#000'; og.fillRect(0, 0, w, h); og.globalCompositeOperation = 'source-over';

  return out;
}

/** 閃卡截圖上的文字依據（卡名 / 稱號）；和卡片目前的不同就代表截圖過期 */
export const shotKey = card => [card.name || '', card.subtitle || ''].join('|');

/** 在畫面外開一張閃卡、截一張圖就關掉（改名後重畫卡冊上的閃卡用） */
export async function renderCraftShot(card) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px;height:900px;pointer-events:none;';
  document.body.append(box);
  const holo = new HoloCard(box);
  try {
    const mask = card.craft.mask ? await blobToCanvas(card.craft.mask) : null;
    const depth = card.craft.depthMap ? await blobToCanvas(card.craft.depthMap) : null;
    await holo.setCard(card, card.craft, mask, depth);
    return await holo.capture();
  } finally { holo.destroy(); box.remove(); }
}

export class HoloCard {
  constructor(container) {
    this.container = container;
    this.params = { ...DEFAULT_CRAFT };
    this.rx = 0; this.ry = 0; this.tx = 0; this.ty = 0; this.time = 0; this.alive = true; this.hover = 0;
    this.wrap = document.createElement('div'); this.wrap.className = 'holo-wrap';
    this.card = document.createElement('div'); this.card.className = 'holo-card';
    this.canvas = document.createElement('canvas');
    this.shine = document.createElement('div'); this.shine.className = 'holo-shadow';
    this.card.append(this.canvas); this.wrap.append(this.shine, this.card); container.append(this.wrap);
    const gl = this.gl = this.canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true }) || this.canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('瀏覽器不支援 WebGL');
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['tImage', 'tBg', 'tMask', 'tLine', 'tText', 'tFx', 'uFxDepth', 'uHasFx', 'uTime', 'uFoil', 'uScale', 'uDepth', 'uBgDepth', 'uFinish', 'uHasMask', 'uLine', 'uFlake', 'uEdge', 'uStripe', 'uAngle', 'uSharp', 'uAlpha', 'uView', 'uRes', 'uLook', 'uLive', 'uAspect', 'uCount', 'uA', 'uB', 'uC', 'uMaskA', 'uMaskB', 'uGloss', 'tSub', 'uDepthMode', 'uHasSub', 'uLv1', 'uLv2', 'uLv3', 'uLv4', 'tCraft', 'tCraft2', 'uHasCraft', 'uPaper', 'uPaperAmt', 'uCraftH', 'uCraftShine', 'uCraftTex']) this.u[n] = gl.getUniformLocation(prog, n);
    this.tex = {};
    ['tImage', 'tBg', 'tMask', 'tLine', 'tText', 'tFx'].forEach((n, i) => { this.tex[n] = gl.createTexture(); gl.uniform1i(this.u[n], i); this.upload(n, canvasOf(1, 1)); });
    this.tex.maskA = gl.createTexture(); this.tex.maskB = gl.createTexture();
    gl.uniform1i(this.u.uMaskA, 6); gl.uniform1i(this.u.uMaskB, 7);
    this.tex.tSub = gl.createTexture(); gl.uniform1i(this.u.tSub, 8); this.upload('tSub', canvasOf(1, 1));
    for (const [n, unit] of [['tCraft', 9], ['tCraft2', 10]]) { this.tex[n] = gl.createTexture(); gl.uniform1i(this.u[n], unit); this.upload(n, canvasOf(1, 1)); }
    // 背面：轉到背後時看到卡背
    this.front = document.createElement('div'); this.front.className = 'holo-face';
    this.card.prepend(this.front); this.front.append(this.canvas);
    this.back = document.createElement('div'); this.back.className = 'holo-back';
    this.card.append(this.back);
    this.ar = 2 / 3;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container);
    this.onMove = e => {
      const r = this.card.getBoundingClientRect();
      this.ty = clamp(((e.clientX - r.left) / r.width - .5) * 2, -1.3, 1.3) * 22;
      this.tx = clamp(-((e.clientY - r.top) / r.height - .5) * 2, -1.3, 1.3) * 18;
      this.hover = performance.now();
    };
    container.addEventListener('pointermove', this.onMove);
    container.addEventListener('pointerleave', () => { this.hover = 0; });
    this.baseRy = 0; this.baseRx = 0; this.vry = 0; this.vrx = 0; this.lastDrag = 0;
    this.onDown = e => {
      if (this.editing || e.button !== 0 || !e.target.closest('.holo-card')) return;
      e.preventDefault();
      let px = e.clientX, py = e.clientY, pt = performance.now();
      this.dragging = true; this.card.classList.add('grabbing');
      const move = ev => {
        const now = performance.now(), dt = Math.max(8, now - pt);
        const dx = ev.clientX - px, dy = ev.clientY - py;
        this.baseRy += dx * .55; this.baseRx = clamp(this.baseRx - dy * .4, -70, 70);
        this.vry = dx * .55 / dt * 16; this.vrx = -dy * .4 / dt * 16;
        px = ev.clientX; py = ev.clientY; pt = now;
      };
      const up = () => { this.dragging = false; this.lastDrag = performance.now(); this.card.classList.remove('grabbing'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    };
    container.addEventListener('pointerdown', this.onDown);
    this.prev = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  upload(name, source) {
    const gl = this.gl, unit = name === 'tSub' ? 8 : name === 'tCraft' ? 9 : name === 'tCraft2' ? 10 : ['tImage', 'tBg', 'tMask', 'tLine', 'tText', 'tFx'].indexOf(name);
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.tex[name]);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const mip = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext && source.width > 1;
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** card：卡片資料；mask：主體遮罩 canvas（白 = 主體）或 null */
  async setCard(card, craft, mask = null, depth = null) {
    this.depthMap = depth;
    this.cardData = card;
    this.back.innerHTML = ''; this.back.append(cardBack('', 'holo-back-card', (card.width || 2) / (card.height || 3)));
    this.params = { ...DEFAULT_CRAFT, ...craft };
    const img = await loadImage(card.blob); URL.revokeObjectURL(img.src);
    const s = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const base = canvasOf(Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s));
    base.getContext('2d').drawImage(img, 0, 0, base.width, base.height);
    this.base = base; this.ar = base.width / base.height; this.alpha = !!card.alpha;
    this.upload('tLine', lineArt(base));
    this.mask = mask;
    this.bgFill = mask ? fillBackground(base, mask) : null; this.lastMask = mask;
    this.hasMask = !!mask;
    if (mask) this.uploadMask(mask);
    await this.refreshLayers();
    this.resize();
  }

  uploadMask(mask) {
    const m = canvasOf(this.base.width, this.base.height), g = m.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, m.width, m.height);
    g.filter = `blur(${Math.max(1, m.width / 500)}px)`;
    g.drawImage(mask, 0, 0, m.width, m.height);
    this.upload('tMask', m);
  }

  /** 原圖的深度圖（白 = 近）；「深度圖立體」模式用 */
  async setDepthMap(depth) {
    this.depthMap = depth;
    if (this.base && this.params.maskSource === 'depth3d') await this.refreshLayers();
  }

  async setMask(mask) {
    this.mask = mask; this.hasMask = !!mask;
    this.bgFill = mask ? fillBackground(this.base, mask) : null; this.lastMask = mask;
    if (mask) this.uploadMask(mask);
    await this.refreshLayers();
  }

  /** 依圖層分組重畫：背景 → tBg、主體 → tImage + 遮罩、外圍 → tFx、最上層 → 卡框文字層 */
  async refreshLayers() {
    const W = this.base.width, H = this.base.height;
    const seq = this.layerSeq = (this.layerSeq || 0) + 1;
    const temps = [];
    const layersMode = Array.isArray(this.params.layers);
    const L = (layersMode ? this.params.layers : stickersToLayers(this.params.stickers)).filter(l => l.visible !== false);
    const has = g => L.some(l => l.group === g);
    let img, bg = null, mask = null;
    const origL = L.find(l => l.kind === 'original');
    this.depthMode = layersMode && this.params.maskSource === 'depth3d' && !!this.depthMap && !!origL;
    if (this.depthMode) {
      // 深度圖立體：原圖單獨一張 + 跟著原圖位置變形的深度圖；其他主體素材另成一層平面
      const { drawLayer } = await import('./layers.js');
      const oc = canvasOf(W, H); temps.push(oc);
      await drawLayer(oc.getContext('2d'), W, H, origL, this.base);
      const dc = canvasOf(W, H), dg = dc.getContext('2d'); temps.push(dc);
      dg.fillStyle = '#000'; dg.fillRect(0, 0, W, H);
      dg.filter = `blur(${Math.max(1, W / 600)}px)`;   // 稍微柔化，邊緣不容易撕裂
      await drawLayer(dg, W, H, { ...origL, opacity: 1 }, this.depthMap);
      dg.filter = 'none';
      const others = L.filter(l => l !== origL);
      const sub = await compositeGroup(others, 'subject', W, H); temps.push(sub);
      const bgc = await compositeGroup(L, 'bg', W, H); temps.push(bgc);
      const fx = await compositeGroup(L, 'outer', W, H); temps.push(fx);
      const text = await textLayer(W, H, this.cardData, { ...this.params, layers: L }); temps.push(text);
      if (seq !== this.layerSeq) return;
      this.hasMask = false; this.hasSub = others.some(l => l.group === 'subject');
      this.upload('tImage', oc); this.upload('tMask', dc); this.upload('tBg', bgc); this.upload('tSub', sub);
      this.upload('tLine', lineArt(oc)); this.upload('tFx', fx); this.upload('tText', text);
      this.hasFx = has('outer'); this.layerList = L;
      await this.buildCraft(L, W, H, origL, text);
      this.liveOK = isDefaultPlace(origL);
      for (const c of temps) if (c && c !== this.base) c.width = 0;
      return;
    }
    if (layersMode) {
      // 原圖圖層在主體組、又有遮罩時：只取遮罩內的人物，背景自動補洞並跟著原圖的位置
      const mask0 = this.mask, orig = L.find(l => l.kind === 'original');
      const overrides = new Map();
      if (orig && orig.group === 'subject' && mask0) {
        if (this.cutFor !== mask0) {
          const cut = canvasOf(W, H), cg = cut.getContext('2d');
          cg.drawImage(this.base, 0, 0); cg.globalCompositeOperation = 'destination-in'; cg.drawImage(mask0, 0, 0, W, H);
          this.cut = cut; this.cutFor = mask0;
        }
        overrides.set(orig.id, this.cut);
      }
      const subject = await compositeGroup(L, 'subject', W, H, null, overrides); temps.push(subject);
      if (has('subject')) mask = alphaMask(subject);
      const bgc = canvasOf(W, H), bgg = bgc.getContext('2d'); temps.push(bgc);
      if (orig && orig.group === 'subject' && mask0) {
        const { drawLayer } = await import('./layers.js');
        await drawLayer(bgg, W, H, orig, this.bgFill || (this.bgFill = fillBackground(this.base, mask0)));
      }
      const bgLayers = await compositeGroup(L, 'bg', W, H); bgg.drawImage(bgLayers, 0, 0); temps.push(bgLayers);
      if (mask) { img = subject; bg = bgc; }
      else { img = bgc; }                                   // 沒有主體：整張平面
      this.liveOK = !!orig && orig.group === 'subject' && isDefaultPlace(orig) && (orig.opacity ?? 1) === 1 && L.filter(l => l.group === 'subject').length === 1;
    } else {
      mask = this.mask;
      if (mask) {
        if (mask !== this.lastMask) { this.bgFill = fillBackground(this.base, mask); this.lastMask = mask; }
        bg = await compositeGroup(L, 'bg', W, H, this.bgFill); temps.push(bg);
        img = this.base;
      } else { img = await compositeGroup(L, 'bg', W, H, this.base); temps.push(img); }
      this.liveOK = true;
    }
    const fx = await compositeGroup(L, 'outer', W, H); temps.push(fx);
    const text = await textLayer(W, H, this.cardData, { ...this.params, layers: L }); temps.push(text);
    if (seq !== this.layerSeq) return;
    this.hasMask = !!mask;
    if (mask) { this.uploadMask(mask); mask.width = 0; }
    this.upload('tImage', img);
    if (layersMode) this.upload('tLine', lineArt(img));   // 線稿要跟著圖層後的位置，否則會和畫面錯開變成暗紋
    if (bg) this.upload('tBg', bg);
    this.upload('tFx', fx);
    this.upload('tText', text);
    this.hasFx = has('outer');
    this.layerList = L;
    await this.buildCraft(L, W, H, L.find(l => l.kind === 'original'), text);
    // 上傳完就釋放暫存畫布，減少顯示記憶體（避免瀏覽器畫面變白）
    for (const c of temps) if (c && c !== this.base && c !== this.bgFill && c !== this.cut) c.width = 0;
  }

  /** 手感工藝的範圍圖：tCraft = (燙箔量, 凸起, 壓凹)、tCraft2 = (箔的種類, UV 亮油, -) */
  async buildCraft(L, W, H, origL, textCanvas) {
    const p = this.params;
    const jobs = L.filter(l => l.craft && l.craft !== 'none');
    const imgOn = p.imgCraft && p.imgCraft !== 'none', frameOn = p.frameCraft && p.frameCraft !== 'none';
    this.hasCraft = !!(jobs.length || imgOn || frameOn);
    if (!this.hasCraft) return;
    const sc = Math.min(1, 1024 / Math.max(W, H)), w = Math.max(2, Math.round(W * sc)), h = Math.max(2, Math.round(H * sc)), n = w * h;
    const foil = new Float32Array(n), emb = new Float32Array(n), deb = new Float32Array(n), uvg = new Float32Array(n), idx = new Uint8Array(n);
    const c = canvasOf(w, h), g = c.getContext('2d', { willReadFrequently: true });
    const { drawLayer } = await import('./layers.js');
    const alphaOf = () => { const d = g.getImageData(0, 0, w, h).data, a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = d[i * 4 + 3] / 255; return a; };
    const apply = (a, kind, amt = 1) => {
      const f = FOIL_IDX[kind];
      for (let i = 0; i < n; i++) {
        const v = a[i] * amt;
        if (v <= .003) continue;
        if (f) { if (v > foil[i]) foil[i] = Math.min(1, v); if (a[i] > .05) idx[i] = f; }
        else if (kind === 'emboss') emb[i] = Math.max(emb[i], Math.min(1, v));
        else if (kind === 'deboss') deb[i] = Math.max(deb[i], Math.min(1, v));
        else if (kind === 'uv') uvg[i] = Math.max(uvg[i], Math.min(1, v));
      }
    };
    for (const l of jobs) {
      g.clearRect(0, 0, w, h);
      await drawLayer(g, w, h, { ...l, opacity: 1 }, l.kind === 'original' ? this.base : null);
      apply(alphaOf(), l.craft, l.craftAmt ?? 1);
    }
    if (frameOn && textCanvas?.width) { g.clearRect(0, 0, w, h); g.drawImage(textCanvas, 0, 0, w, h); apply(alphaOf(), p.frameCraft); }
    if (imgOn) {                                   // 從原圖取範圍（跟著原圖圖層的位置）
      const drawOrig = async src => { g.clearRect(0, 0, w, h); if (origL) await drawLayer(g, w, h, { ...origL, opacity: 1 }, src); else g.drawImage(src, 0, 0, w, h); };
      let v = new Float32Array(n), cover;
      await drawOrig(this.base);
      const d = g.getImageData(0, 0, w, h).data;
      cover = new Float32Array(n); for (let i = 0; i < n; i++) cover[i] = d[i * 4 + 3] / 255;
      const src = p.imgSrc || 'bright';
      if (src === 'line') {
        const la = lineArt(c, 1024), lg = la.getContext('2d'), ld = lg.getImageData(0, 0, la.width, la.height).data;
        for (let i = 0; i < n; i++) v[i] = 1 - ld[i * 4] / 255;
      } else if (src === 'depth') {
        if (this.depthMap) { await drawOrig(this.depthMap); const dd = g.getImageData(0, 0, w, h).data; for (let i = 0; i < n; i++) v[i] = dd[i * 4] / 255; }
      } else if (src === 'color') {
        const hx = (p.imgColor || '#d4af37').replace('#', ''), tr = parseInt(hx.slice(0, 2), 16), tg = parseInt(hx.slice(2, 4), 16), tb = parseInt(hx.slice(4, 6), 16);
        for (let i = 0; i < n; i++) { const dr = d[i * 4] - tr, dg = d[i * 4 + 1] - tg, db = d[i * 4 + 2] - tb; v[i] = 1 - Math.min(1, Math.sqrt(dr * dr + dg * dg + db * db) / 200); }
      } else {
        for (let i = 0; i < n; i++) { const l = (d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114) / 255; v[i] = src === 'dark' ? 1 - l : l; }
      }
      const t = p.imgThr ?? .7, lo = t - .06, hi = t + .06;
      for (let i = 0; i < n; i++) { const x = Math.min(1, Math.max(0, (v[i] - lo) / (hi - lo))); v[i] = x * x * (3 - 2 * x) * cover[i]; }
      apply(v, p.imgCraft, p.imgAmt ?? 1);
    }
    const o1 = g.createImageData(w, h), o2 = g.createImageData(w, h);
    for (let i = 0; i < n; i++) {
      const k = i * 4;
      o1.data[k] = foil[i] * 255; o1.data[k + 1] = emb[i] * 255; o1.data[k + 2] = deb[i] * 255; o1.data[k + 3] = 255;
      o2.data[k] = idx[i] * 32; o2.data[k + 1] = uvg[i] * 255; o2.data[k + 3] = 255;
    }
    g.putImageData(o1, 0, 0);
    const soft = canvasOf(w, h), sg = soft.getContext('2d');      // 稍微柔化邊緣，凸起才有斜面
    sg.filter = `blur(${Math.max(.8, w / 900)}px)`; sg.drawImage(c, 0, 0); sg.filter = 'none';
    this.upload('tCraft', soft);
    g.putImageData(o2, 0, 0); this.upload('tCraft2', c);
    this.craftTex = [1 / w, 1 / h];
    soft.width = 0; c.width = 0;
  }

  /** 只重畫卡框文字層（切換文字選項時用，不必重新合成圖層） */
  async refreshText() {
    const W = this.base.width, H = this.base.height;
    const seq = this.textSeq = (this.textSeq || 0) + 1;
    const text = await textLayer(W, H, this.cardData, { ...this.params, layers: this.layerList || [] });
    if (seq !== this.textSeq) return;
    this.upload('tText', text);
    if (this.params.frameCraft && this.params.frameCraft !== 'none') await this.buildCraft(this.layerList || [], W, H, (this.layerList || []).find(l => l.kind === 'original'), text);
    text.width = 0;
  }

  async set(p) {
    const textKeys = ['frame', 'frameColor', 'showName', 'showSubtitle', 'showRarity', 'showSerial', 'showPlate', 'flavor', 'textPos', 'textFont', 'textColor', 'textSize'];
    const textChanged = textKeys.some(k => k in p && JSON.stringify(p[k]) !== JSON.stringify(this.params[k]));
    const layersChanged = 'layers' in p || p.forceLayers;
    Object.assign(this.params, p);
    if (!this.base) return;
    if (layersChanged) await this.refreshLayers();
    else if (textChanged) await this.refreshText();
    else if (CRAFT_KEYS.some(k => k in p)) {          // 手感工藝的範圍改了：稍等一下再重算（拉滑桿時不會一直重算）
      clearTimeout(this.craftT); this.craftT = setTimeout(() => this.refreshLayers(), 160);
    }
  }

  /** 動態閃卡：把 LIVE 部件遮罩與動作參數交給閃卡 shader 直接形變；粒子畫在卡面上的 2D 疊層 */
  attachLive({ parts = [], fx = {} }) {
    this.detachLive();
    const gl = this.gl;
    const ps = parts.filter(p => p.enabled !== false && p.mask).slice(0, 8);
    this.liveParts = ps;
    if (ps.length) {
      const packs = packPartMasks(ps);
      [[this.tex.maskA, packs[0], 6], [this.tex.maskB, packs[1], 7]].forEach(([tex, d, unit]) => {
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, d.width, d.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(d.data.buffer));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      });
      this.liveUniforms = partUniforms(ps, this.ar);
    }
    this.live = true;
    this.liveFx = { ...DEFAULT_FX, ...fx };
    const hasParticles = [fx.particles, fx.particles2, fx.particles3].some(x => x && x !== 'none') || fx.rays > 0;
    if (hasParticles) {
      this.fxOverlay = document.createElement('canvas'); this.fxOverlay.className = 'holo-fx';
      this.front.append(this.fxOverlay);
      // 借用 LiveStage 的粒子程式（只用到 fx / particles / time / cam / fxCanvas）
      this.ps = { fx: { ...DEFAULT_FX, ...fx }, particles: [], time: 0, cam: { x: 0, y: 0 }, fxCanvas: this.fxOverlay, rest: false,
        spawn: LiveStage.prototype.spawn, drawRays: LiveStage.prototype.drawRays, drawParticles: LiveStage.prototype.drawParticles };
    }
  }

  /** 特效設定改了：只更新濾鏡數值與粒子設定，不重新打包部件遮罩 */
  updateLiveFx(fx) {
    this.liveFx = { ...DEFAULT_FX, ...fx };
    const want = [fx.particles, fx.particles2, fx.particles3].some(x => x && x !== 'none') || fx.rays > 0;
    if (this.ps) this.ps.fx = { ...this.liveFx };
    else if (want) {
      this.fxOverlay = document.createElement('canvas'); this.fxOverlay.className = 'holo-fx';
      this.front.append(this.fxOverlay);
      this.ps = { fx: { ...this.liveFx }, particles: [], time: 0, cam: { x: 0, y: 0 }, fxCanvas: this.fxOverlay, rest: false,
        spawn: LiveStage.prototype.spawn, drawRays: LiveStage.prototype.drawRays, drawParticles: LiveStage.prototype.drawParticles };
    }
  }

  detachLive() {
    this.live = false; this.liveParts = []; this.ps = null; this.liveFx = null;
    this.fxOverlay?.remove(); this.fxOverlay = null;
  }

  uploadFrame(name, source) {
    const gl = this.gl, unit = ['tImage', 'tBg', 'tMask', 'tLine', 'tText', 'tFx'].indexOf(name);
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.tex[name]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }

  /** 編排素材時讓卡片擺正不動，方便對位 */
  setEditing(on) { this.editing = on; }
  cardRect() { return this.card.getBoundingClientRect(); }

  resize() {
    const r = this.container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const pad = .86;
    let w = r.width * pad, h = w / this.ar;
    if (h > r.height * pad) { h = r.height * pad; w = h * this.ar; }
    Object.assign(this.card.style, { width: w + 'px', height: h + 'px' });
    Object.assign(this.shine.style, { width: w * .8 + 'px' });
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
  }

  loop(now) {
    if (!this.alive) return;
    if (this.capturing) { this.prev = now; requestAnimationFrame(this.loop); return; }   // 匯出中：不要動到畫布
    const dt = Math.min(.05, (now - this.prev) / 1000); this.prev = now;
    this.time += dt;
    const idle = !this.hover || now - this.hover > 1800;
    if (!this.dragging) {                         // 放開後的慣性
      this.baseRy += this.vry; this.baseRx = clamp(this.baseRx + this.vrx, -70, 70);
      this.vry *= .93; this.vrx *= .9;
      if (Math.abs(this.vry) < .02) this.vry = 0;
      if (this.lastDrag && now - this.lastDrag > 4500 && !this.vry) {   // 一陣子沒碰就慢慢轉回最近的正面
        const front = Math.round(this.baseRy / 360) * 360;
        this.baseRy += (front - this.baseRy) * (1 - Math.exp(-dt * 2)); this.baseRx *= 1 - (1 - Math.exp(-dt * 2));
        if (Math.abs(front - this.baseRy) < .3) { this.baseRy = front; this.lastDrag = 0; }
      }
    }
    let tx = this.tx, ty = this.ty;
    if (this.editing) { tx = 0; ty = 0; this.baseRy = Math.round(this.baseRy / 360) * 360; this.baseRx = 0; this.vry = this.vrx = 0; }
    else if (this.dragging || this.lastDrag) { tx = 0; ty = 0; }
    else if (idle) { tx = this.params.auto ? Math.sin(this.time * .53) * 6 - 2 : 0; ty = this.params.auto ? Math.sin(this.time * .42) * 16 - 3 : 0; }
    tx += this.baseRx; ty += this.baseRy;
    const k = reducedMotion() || this.dragging ? 1 : 1 - Math.exp(-dt * 7);
    this.rx += (tx - this.rx) * k; this.ry += (ty - this.ry) * k;
    this.card.style.transform = `rotateX(${this.rx}deg) rotateY(${this.ry}deg)`;
    this.shine.style.transform = `translateX(${-this.ry * 1.5}px) scaleX(${1 - Math.abs(Math.sin(this.ry * Math.PI / 180)) * .3})`;
    this.draw();
    requestAnimationFrame(this.loop);
  }

  draw() {
    const gl = this.gl, u = this.u, p = this.params;
    if (!this.base) return;
    const liveOn = this.live && this.liveOK && this.liveParts.length > 0;
    gl.uniform1f(u.uLive, liveOn ? 1 : 0);
    const f = this.live && this.liveFx;
    if (f) {
      gl.uniform4f(u.uLv1, f.aurora || 0, f.prism || 0, f.flash || 0, f.frost || 0);
      gl.uniform4f(u.uLv2, f.scan || 0, f.caustic || 0, f.leak || 0, f.grain || 0);
      gl.uniform4f(u.uLv3, Math.max(0, TINTS.indexOf(f.tint || 'none')), f.tintAmount ?? .6, f.hue || 0, f.vignette || 0);
      gl.uniform4f(u.uLv4, f.exposure || 0, f.contrast || 0, f.saturation || 0, f.temperature || 0);
    } else { gl.uniform4f(u.uLv1, 0, 0, 0, 0); gl.uniform4f(u.uLv2, 0, 0, 0, 0); gl.uniform4f(u.uLv3, 0, 0, 0, 0); gl.uniform4f(u.uLv4, 0, 0, 0, 0); }
    if (liveOn) {
      const L = this.liveUniforms;
      gl.uniform1i(u.uCount, this.liveParts.length); gl.uniform4fv(u.uA, L.A); gl.uniform4fv(u.uB, L.B); gl.uniform4fv(u.uC, L.C);
      gl.uniform1f(u.uAspect, this.ar); gl.uniform2f(u.uLook, clamp(this.ry / 25, -1, 1), clamp(-this.rx / 20, -1, 1));
    }
    if (this.ps) {
      const o = this.fxOverlay;
      if (o.width !== this.canvas.width) { o.width = this.canvas.width; o.height = this.canvas.height; }
      this.ps.time = this.time; this.ps.cam.x = clamp(this.ry / 30, -1, 1);
      this.ps.drawParticles(1 / 60);
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // 相機在卡片座標中的方向（卡片轉 ry，相機相對轉 -ry）
    const ax = this.rx * Math.PI / 180, ay = this.ry * Math.PI / 180;
    const v = [-Math.sin(ay) * Math.cos(ax), -Math.sin(ax), Math.cos(ay) * Math.cos(ax)];
    gl.uniform3f(u.uView, v[0], v[1], v[2]);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uFoil, p.foil); gl.uniform1f(u.uScale, p.subjectScale); gl.uniform1f(u.uDepth, p.subjectDepth);
    gl.uniform1f(u.uBgDepth, p.bgDepth);
    gl.uniform1f(u.uFinish, Math.max(0, FINISHES.findIndex(f => f[0] === p.finish)));
    gl.uniform1f(u.uHasMask, this.hasMask ? 1 : 0);
    gl.uniform1f(u.uDepthMode, this.depthMode ? 1 : 0); gl.uniform1f(u.uHasSub, this.hasSub ? 1 : 0);
    gl.uniform1f(u.uLine, p.line); gl.uniform1f(u.uFlake, p.flake); gl.uniform1f(u.uEdge, p.edge);
    gl.uniform1f(u.uStripe, p.stripe); gl.uniform1f(u.uAngle, p.angle); gl.uniform1f(u.uSharp, p.sharp);
    gl.uniform1f(u.uAlpha, this.alpha ? 1 : 0);
    gl.uniform1f(u.uGloss, p.gloss ?? 0); gl.uniform1f(u.uFxDepth, p.fxDepth ?? .45); gl.uniform1f(u.uHasFx, this.hasFx ? 1 : 0);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uHasCraft, this.hasCraft ? 1 : 0);
    gl.uniform1f(u.uPaper, Math.max(0, PAPERS.findIndex(x => x[0] === (p.paper || 'none'))));
    gl.uniform1f(u.uPaperAmt, p.paperAmt ?? .5); gl.uniform1f(u.uCraftH, p.craftH ?? .6); gl.uniform1f(u.uCraftShine, p.craftShine ?? 1);
    gl.uniform2f(u.uCraftTex, ...(this.craftTex || [1 / 1024, 1 / 1024]));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  snapshot() { return this.canvas; }

  /** 擺正、用較高解析度畫一張正面截圖（卡冊顯示閃卡用） */
  async capture(max = 900) {
    if (!this.base) return null;
    const c = this.canvas, w0 = c.width, h0 = c.height, rx = this.rx, ry = this.ry;
    const s = Math.min(1, max / Math.max(this.base.width, this.base.height));
    c.width = Math.round(this.base.width * s); c.height = Math.round(this.base.height * s);
    this.rx = -6; this.ry = 10;                       // 微微側一點，讓鐳射看得出來
    this.draw();
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', .9));
    c.width = w0; c.height = h0; this.rx = rx; this.ry = ry;
    return blob;
  }

  /** 互動閃卡匯出用：在 cols × rows 個傾斜角度各畫一張（同一套 WebGL 效果），播放時依滑鼠／陀螺儀在相鄰幾張之間混合
   *  rx / ry = 上下 / 左右最大傾斜角度；回傳每張的 Blob（webp） */
  async captureGrid({ cols = 9, rows = 7, max = 720, rx = 18, ry = 24, quality = .86, onProgress } = {}) {
    if (!this.base) return null;
    const c = this.canvas, w0 = c.width, h0 = c.height, keep = [this.rx, this.ry];
    const s = Math.min(1, max / Math.max(this.base.width, this.base.height));
    this.capturing = true;
    const frames = [];
    try {
      c.width = Math.round(this.base.width * s); c.height = Math.round(this.base.height * s);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        this.rx = rows > 1 ? rx - j / (rows - 1) * rx * 2 : 0;      // 上排 = 往上仰
        this.ry = cols > 1 ? -ry + i / (cols - 1) * ry * 2 : 0;     // 左欄 = 往左轉
        this.draw();
        frames.push(await new Promise(r => c.toBlob(r, 'image/webp', quality)));
        onProgress?.(frames.length / (cols * rows));
        await new Promise(r => setTimeout(r, 0));                   // 讓畫面有機會更新進度
      }
    } finally {
      c.width = w0; c.height = h0; [this.rx, this.ry] = keep; this.capturing = false;
    }
    return { frames, cols, rows, rx, ry, width: Math.round(this.base.width * s), height: Math.round(this.base.height * s) };
  }

  destroy() {
    this.detachLive();
    this.alive = false; this.ro.disconnect();
    this.container.removeEventListener('pointermove', this.onMove);
    this.container.removeEventListener('pointerdown', this.onDown);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.wrap.remove();
  }
}
