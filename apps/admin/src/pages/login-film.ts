/* eslint-disable */
// @ts-nocheck
/** Ported from the provided login-demo.html; the film is isolated from the app UI. */
/*!
 * 恒光 · 化 —— 一镜到底的粒子影片（登录页左侧）
 * Hengguang "Transformation" — a one-take, real-time particle film.
 *
 * 零依赖 · WebGL2 · 65,536 粒光点自始至终不增不减
 * 用法： const film = mountHgxtFilm(document.querySelector('#left'), { brand:true });
 *        film.destroy() 卸载
 */

const TAU = Math.PI * 2;
const TEXW = 256;

/* ------------------------------------------------------------------ */
/*  剧本：十个章节，一条物质的旅程                                       */
/* ------------------------------------------------------------------ */
// tin  = 由上一幕「化」入本幕的时长（秒）
// hold = 本幕成形后停留的时长（秒）
// cam  = 机位：t 目标点 / d 距离 / az 方位 / el 俯仰 / *v 每秒漂移 / ap 光圈（景深）
// look = 影调：bg0 中心底色 / bg1 边缘底色（线性空间）/ trail 拖影 / bloom 辉光
// tr   = 入场转化：sweep 扫掠方向，amt 扫掠占比，flight 飞行湍流，swirl 漩涡，flash 飞行时增亮
const SEQ = [
  {
    key: 'ore', ch: '矿', tin: 3.6, hold: 5.0,
    cap: '一粒矿石，沉睡亿万年。',
    anno: 'FeS₂ · 硫铁矿 · 含硫 30–42%',
    cam: { t: [0, 0.0, 0], d: 4.3, az: -0.38, azv: 0.03, el: 0.17, elv: -0.004, fov: 34, ap: 0.010, dv: -0.012 },
    look: { bg0: [0.020, 0.016, 0.012], bg1: [0.002, 0.002, 0.002], trail: 0.30, bloom: 0.55 },
    tr: { sweep: [0, -1, 0], amt: 0.7, flight: 0.8, swirl: 1.2, flash: 0.7 },
  },
  {
    key: 'fire', ch: '火', tin: 2.8, hold: 4.4,
    cap: '投入九百度的烈火，',
    anno: '沸腾焙烧 · 800–920 ℃ · 矿渣化为铁精粉',
    cam: { t: [0, 0.22, 0], d: 4.5, az: -0.16, azv: 0.025, el: 0.03, elv: 0.0, fov: 36, ap: 0.012, dv: -0.012 },
    look: { bg0: [0.026, 0.008, 0.003], bg1: [0.003, 0.001, 0.001], trail: 0.62, bloom: 0.8 },
    tr: { sweep: [0, 1, 0], amt: 0.92, flight: 0.35, swirl: 0.5, flash: 0.6, lift: 0.7 },
  },
  {
    key: 'light', ch: '光', tin: 2.6, hold: 4.4,
    cap: '火未熄灭，化作了光。',
    anno: '余热锅炉 56 t/h · 汽轮发电 6000 kW',
    cam: { t: [0, 0.16, 0], d: 4.95, az: 0.18, azv: -0.02, el: 0.07, elv: 0.0, fov: 36, ap: 0.012, dv: -0.012 },
    look: { bg0: [0.012, 0.014, 0.022], bg1: [0.001, 0.001, 0.002], trail: 0.78, bloom: 0.85 },
    tr: { sweep: [0, 1, 0], amt: 0.85, flight: 0.55, swirl: 1.8, flash: 0.45, lift: 0.5 },
  },
  {
    key: 'catalyst', ch: '媒', tin: 2.8, hold: 4.4,
    cap: '气，穿过四重触媒，',
    anno: 'SO₂ → SO₃ · 四段转化 · 两转两吸',
    cam: { t: [0, 0.0, 0], d: 5.3, az: 0.12, azv: 0.035, el: 0.36, elv: 0.0, fov: 36, ap: 0.010, dv: -0.012 },
    look: { bg0: [0.020, 0.012, 0.006], bg1: [0.001, 0.001, 0.001], trail: 0.55, bloom: 0.6 },
    tr: { sweep: [0, -1, 0], amt: 0.85, flight: 0.6, swirl: 1.0, flash: 0.5, lift: -0.25 },
  },
  {
    key: 'acid', ch: '酸', tin: 2.6, hold: 3.6,
    cap: '凝成一滴酸。',
    anno: 'H₂SO₄ · 98% · 吸收率 99.95%',
    cam: { t: [0, 0.06, 0], d: 3.8, az: 0.0, azv: 0.035, el: 0.06, elv: 0.0, fov: 34, ap: 0.014, dv: -0.012 },
    look: { bg0: [0.006, 0.014, 0.032], bg1: [0.000, 0.001, 0.003], trail: 0.32, bloom: 0.65 },
    tr: { sweep: [0, 0, 0], amt: 0.0, flight: 0.6, swirl: 1.6, flash: 0.5, radial: 1 },
  },
  {
    key: 'net', ch: '网', tin: 2.2, hold: 7.2,
    cap: '此处之余，即彼处所需。',
    anno: '发烟硫酸 · 稀硫酸 · CO₂ · 余热 —— 在车间之间流转',
    cam: { t: [0.03, 0, -0.30], d: 3.95, az: 0.0, azv: 0.018, el: 0.98, elv: -0.006, fov: 38, ap: 0.009, dv: -0.010 },
    look: { bg0: [0.006, 0.016, 0.024], bg1: [0.000, 0.001, 0.002], trail: 0.62, bloom: 0.6 },
    tr: { sweep: [0, 1, 0], amt: 0.85, flight: 0.45, swirl: 0.6, flash: 0.55, lift: -0.3 },
  },
  {
    key: 'salt', ch: '盐', tin: 2.6, hold: 4.6,
    cap: '废酸，结晶为盐；',
    anno: '稀硫酸 + MgO → MgSO₄·7H₂O · 15 万 t/a',
    cam: { t: [0, 0.12, 0], d: 4.1, az: 0.3, azv: 0.04, el: 0.12, elv: 0.0, fov: 36, ap: 0.012, dv: -0.012 },
    look: { bg0: [0.008, 0.014, 0.024], bg1: [0.000, 0.001, 0.002], trail: 0.32, bloom: 0.6 },
    tr: { sweep: [0, 0, 0], amt: 0.0, flight: 0.3, swirl: 0.8, flash: 0.5, radial: 1 },
  },
  {
    key: 'crystal', ch: '晶', tin: 2.6, hold: 4.8,
    cap: '废气，封存为晶。',
    anno: 'CO₂ → Mg₄Al₂(OH)₁₂CO₃·4H₂O · 镁铝水滑石',
    cam: { t: [0, 0.0, 0], d: 4.2, az: -0.28, azv: 0.04, el: 0.42, elv: 0.0, fov: 36, ap: 0.012, dv: -0.012 },
    look: { bg0: [0.006, 0.020, 0.016], bg1: [0.000, 0.002, 0.001], trail: 0.38, bloom: 0.6 },
    tr: { sweep: [0, 1, 0], amt: 0.8, flight: 0.6, swirl: 1.2, flash: 0.55 },
  },
  {
    key: 'loop', ch: '环', tin: 2.8, hold: 5.2,
    cap: '没有一粒被浪费，\n一切只是在转化。',
    anno: 'Rien ne se perd, rien ne se crée, tout se transforme. —— 拉瓦锡',
    cam: { t: [0, 0.04, 0], d: 4.8, az: 0.0, azv: 0.0, el: 0.0, elv: 0.0, fov: 36, ap: 0.010, dv: -0.010 },
    look: { bg0: [0.012, 0.012, 0.016], bg1: [0.001, 0.001, 0.001], trail: 0.72, bloom: 0.7 },
    tr: { sweep: [0, 1, 0], amt: 0.85, flight: 0.6, swirl: 1.4, flash: 0.55 },
  },
  {
    key: 'logo', ch: '恒', tin: 3.0, hold: 8.0, final: true,
    cam: { t: [0, 0.34, 0], d: 4.3, az: 0.0, azv: 0.0, el: 0.0, elv: 0.0, fov: 36, ap: 0.006, dv: -0.008 },
    look: { bg0: [0.008, 0.012, 0.020], bg1: [0.000, 0.001, 0.002], trail: 0.28, bloom: 0.55 },
    tr: { sweep: [0, 0, 0], amt: 0.0, flight: 0.35, swirl: 0.3, flash: 0.65, radial: 2 },
  },
];

// 开场：星尘（仅首次播放）
const INTRO = {
  key: 'intro',
  cam: { t: [0, 0.0, 0], d: 5.6, az: -0.6, azv: 0.03, el: 0.2, elv: 0.0, fov: 34, ap: 0.012, dv: -0.01 },
  look: { bg0: [0.004, 0.004, 0.005], bg1: [0.0, 0.0, 0.0], trail: 0.5, bloom: 0.5 },
};
const INTRO_ID = 10;

const FINAL = {
  title: '恒光化工',
  tag: '化而不灭，是为恒光。',
  co: '湖南恒光化工有限公司',
};

/* ------------------------------------------------------------------ */
/*  全厂物料网络（依据各车间操作规程与上下游关系整理）                    */
/* ------------------------------------------------------------------ */
const NODES = [
  { name: '硫酸', sub: '酸源 · 汽源 · 回收中心', p: [0.0, 0, 0.66], col: [1.0, 0.74, 0.36], r: 0.16, on: 0.0 },
  { name: '氨基磺酸', side: 'l', sub: '2 万 t/a', p: [-0.76, 0, -0.16], col: [0.92, 0.94, 1.0], r: 0.10, on: 1.55 },
  { name: '二乙基蒽醌', sub: '5000 t/a', p: [0.80, 0, -0.04], col: [1.0, 0.86, 0.46], r: 0.10, on: 1.55 },
  { name: '硫酸镁', sub: '15 万 t/a', p: [0.24, 0, -1.0], col: [0.42, 0.78, 1.0], r: 0.11, on: 1.75 },
  { name: '镁铝水滑石', side: 'l', sub: '1.2 万 t/a', p: [-0.86, 0, -1.30], col: [0.42, 1.0, 0.62], r: 0.10, on: 3.0 },
];
// a → b，bend 为弯曲度（相对弦长），w 流宽，wt 粒子占比，sp 流速，st 开始时间
const EDGES = [
  { a: 0, b: 1, bend: 0.16, col: [1.0, 0.80, 0.52], w: 0.030, wt: 0.17, sp: 0.20, st: 0.25 },
  { a: 0, b: 2, bend: -0.15, col: [1.0, 0.80, 0.52], w: 0.028, wt: 0.15, sp: 0.20, st: 0.25, label: '发烟硫酸' },
  { a: 1, b: 3, bend: 0.20, col: [0.34, 0.74, 1.0], w: 0.034, wt: 0.16, sp: 0.18, st: 1.6, label: '55% 稀硫酸', lside: -1 },
  { a: 0, b: 3, bend: -0.10, col: [0.34, 0.74, 1.0], w: 0.018, wt: 0.09, sp: 0.15, st: 0.35 },
  { a: 1, b: 4, bend: -0.22, col: [0.48, 1.0, 0.66], w: 0.030, wt: 0.16, sp: 0.19, st: 1.6, label: 'CO₂ 1100 t/a' },
  { a: 2, b: 0, bend: -0.34, col: [1.0, 0.52, 0.20], w: 0.014, wt: 0.12, sp: 0.16, st: 1.6,  },
  { a: 0, b: 1, bend: 0.46, col: [1.0, 0.36, 0.16], w: 0.013, wt: 0.15, sp: 0.16, st: 0.25, label: '余热' },
  { a: 0, b: 0, bend: 0, col: [0, 0, 0], w: 0, wt: 0, sp: 0, st: 99 }, // padding
];
(function buildEdges() {
  for (const e of EDGES) {
    const A = NODES[e.a].p, B = NODES[e.b].p;
    const dx = B[0] - A[0], dz = B[2] - A[2];
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len, pz = dx / len;
    e.p0 = A; e.p2 = B;
    e.p1 = [(A[0] + B[0]) / 2 + px * e.bend * len, 0, (A[2] + B[2]) / 2 + pz * e.bend * len];
  }
})();
function bez(e, s) {
  const o = 1 - s;
  return [0, 1, 2].map(i => o * o * e.p0[i] + 2 * o * s * e.p1[i] + s * s * e.p2[i]);
}

// 「环」上的六种物态（与章节呼应）
const RING_STAGES = ['矿', '火', '光', '酸', '盐', '晶'];

/* ------------------------------------------------------------------ */
/*  形态生成：每一幕都是同一批粒子的另一种排列                           */
/*  P = (x,y,z,size)   A = (参数..., class + 0.9*frac)   A.w = -1 为尘埃   */
/* ------------------------------------------------------------------ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) {
  let u = 0; while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r());
}
function hash1(x) { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function eulerMat(x, y, z) {
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  return [cy * cz, cz * sx * sy - cx * sz, cx * cz * sy + sx * sz,
    cy * sz, cx * cz + sx * sy * sz, -cz * sx + cx * sy * sz,
    -sy, cy * sx, cx * cy];
}
function mulM(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
function mulMT(m, v) { return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

/* 01 矿 —— 黄铁矿晶簇：互相贯穿的立方体，晶面带交错条纹 */
function genPyrite(n, r, put) {
  const cubes = [
    { c: [0.0, -0.06, 0.0], h: 0.58, e: [0.22, 0.58, 0.10] },
    { c: [0.56, 0.42, -0.24], h: 0.35, e: [0.75, 0.25, 0.48] },
    { c: [-0.60, -0.40, 0.30], h: 0.31, e: [-0.32, 1.02, 0.26] },
    { c: [-0.30, 0.56, -0.40], h: 0.24, e: [0.42, -0.52, 0.90] },
    { c: [0.50, -0.56, 0.42], h: 0.20, e: [1.10, 0.32, -0.22] },
    { c: [0.08, 0.70, 0.40], h: 0.15, e: [0.20, 0.90, 0.40] },
    { c: [-0.78, 0.16, 0.48], h: 0.12, e: [0.90, 0.10, 0.70] },
    { c: [0.86, -0.08, 0.30], h: 0.10, e: [0.30, 0.60, 1.20] },
  ].map(c => ({ ...c, M: eulerMat(c.e[0], c.e[1], c.e[2]) }));
  const wts = cubes.map(c => c.h * c.h);
  const wsum = wts.reduce((a, b) => a + b, 0);
  let i = 0, guard = 0;
  while (i < n && guard++ < n * 20) {
    let x = r() * wsum, ci = 0;
    while (ci < cubes.length - 1 && x > wts[ci]) { x -= wts[ci]; ci++; }
    const cb = cubes[ci], h = cb.h;
    const L = [0, 0, 0], Nl = [0, 0, 0];
    const ty = r();
    let size, cls, br;
    if (ty < 0.2) { // 棱
      const a = Math.floor(r() * 3), b = (a + 1) % 3, c = (a + 2) % 3;
      const sb = r() < 0.5 ? -1 : 1, sc = r() < 0.5 ? -1 : 1;
      L[a] = (r() * 2 - 1) * h; L[b] = sb * h; L[c] = sc * h;
      Nl[b] = sb; Nl[c] = sc;
      size = 0.0105; cls = 1; br = 0.75 + 0.25 * r();
    } else if (ty < 0.84) { // 条纹（相邻晶面互相垂直）
      const f = Math.floor(r() * 3), s = r() < 0.5 ? -1 : 1, d = (f + 1) % 3, q = (f + 2) % 3;
      const nlev = Math.max(3, Math.floor((2 * h) / 0.036));
      const k = Math.floor(r() * nlev);
      L[f] = s * (h + (k & 1) * 0.0035);
      L[d] = (r() * 2 - 1) * h * 0.99;
      L[q] = -h + (k + 0.5) * ((2 * h) / nlev) + gauss(r) * 0.002;
      Nl[f] = s;
      size = 0.0068; cls = 0; br = 0.35 + 0.65 * hash1(ci * 131 + f * 17 + (s > 0 ? 7 : 0) + k * 3.1);
    } else { // 晶面光泽
      const f = Math.floor(r() * 3), s = r() < 0.5 ? -1 : 1, d = (f + 1) % 3, q = (f + 2) % 3;
      L[f] = s * h; L[d] = (r() * 2 - 1) * h; L[q] = (r() * 2 - 1) * h;
      Nl[f] = s;
      size = 0.0055; cls = 2; br = 0.3 + 0.4 * r();
    }
    const lp = mulM(cb.M, L);
    const p = [cb.c[0] + lp[0], cb.c[1] + lp[1], cb.c[2] + lp[2]];
    let inside = false;
    for (let j = 0; j < cubes.length && !inside; j++) {
      if (j === ci) continue;
      const cj = cubes[j];
      const q = mulMT(cj.M, [p[0] - cj.c[0], p[1] - cj.c[1], p[2] - cj.c[2]]);
      const m = cj.h - 0.002;
      if (Math.abs(q[0]) < m && Math.abs(q[1]) < m && Math.abs(q[2]) < m) inside = true;
    }
    if (inside) continue;
    const nn = norm3(mulM(cb.M, Nl));
    put(i++, p[0], p[1], p[2], size, nn[0], nn[1], nn[2], cls + 0.9 * br, p[0], p[1]);
  }
  while (i < n) { put(i++, 0, 0, 0, 0.005, 0, 1, 0, 2.3, 0, 0); }
}

/* 02 火 —— 沸腾焙烧：上升的火焰、下沉的矿渣（铁精粉）、翻滚的床层 */
function genFire(n, r, put) {
  for (let i = 0; i < n; i++) {
    const u = r();
    if (u < 0.70) {
      const rad = 0.62 * Math.pow(r(), 0.75), a = r() * TAU, ph = r();
      put(i, rad * Math.cos(a), rad * Math.sin(a), ph, 0.0092 + 0.006 * r(), 0.15 + 0.15 * r(), r(), 0, 0 + 0.9 * r(),
        rad * Math.cos(a), -0.8 + ph * 2.35);
    } else if (u < 0.78) {
      const rad = 0.5 * Math.sqrt(r()), a = r() * TAU, ph = r();
      put(i, rad * Math.cos(a), rad * Math.sin(a), ph, 0.0065, 0.16 + 0.12 * r(), r(), 0, 3 + 0.9 * r(),
        rad * Math.cos(a), -0.6 + ph * 3.1);
    } else if (u < 0.88) {
      const x = (r() * 2 - 1) * 0.7, z = (r() * 2 - 1) * 0.7, ph = r();
      put(i, x, z, ph, 0.0072, 0.06 + 0.06 * r(), r(), 0, 1 + 0.9 * r(), x, 1.15 - ph * 2.1);
    } else {
      const rad = 1.0 * Math.sqrt(r()), a = r() * TAU;
      put(i, rad * Math.cos(a), -0.86 + gauss(r) * 0.025, rad * Math.sin(a), 0.0082, r(), r(), 0, 2 + 0.9 * r(),
        rad * Math.cos(a), -0.86);
    }
  }
}

/* 03 光 —— 汽轮机转子：叶片、轮毂、围带、主轴，以及向外辐射的光 */
function genTurbine(n, r, put) {
  const NB = 40;
  for (let i = 0; i < n; i++) {
    const u = r();
    if (u < 0.5) {
      const b = Math.floor(r() * NB);
      const rr = 0.3 + 0.9 * Math.pow(r(), 0.85);
      const th = (b / NB) * TAU + 0.62 * (rr - 0.3) + (r() - 0.5) * 0.028;
      const z = (r() - 0.5) * 0.05;
      put(i, rr, th, z, 0.0082, 0, 0, 0, 0 + 0.9 * r(), rr * Math.cos(th), rr * Math.sin(th));
    } else if (u < 0.57) {
      const rr = 0.03 + 0.25 * Math.pow(r(), 0.8), th = r() * TAU;
      put(i, rr, th, gauss(r) * 0.03, 0.0085, 0, 0, 0, 1 + 0.9 * r(), rr * Math.cos(th), rr * Math.sin(th));
    } else if (u < 0.66) {
      const rr = 1.22 + gauss(r) * 0.006, th = r() * TAU;
      put(i, rr, th, (r() - 0.5) * 0.09, 0.0075, 0, 0, 0, 2 + 0.9 * r(), rr * Math.cos(th), rr * Math.sin(th));
    } else if (u < 0.93) {
      const a = (Math.floor(r() * 72) / 72) * TAU + gauss(r) * 0.006, ph = r();
      const rr = 1.3 + ph * 2.0;
      put(i, a, ph, gauss(r) * 0.015, 0.0085, 0, 0, 0, 3 + 0.9 * r(), rr * Math.cos(a), rr * Math.sin(a));
    } else {
      const z = -1.4 + 2.8 * r();
      put(i, gauss(r) * 0.012, gauss(r) * 0.012, z, 0.0065, 0, 0, 0, 4 + 0.9 * r(), 0, 0);
    }
  }
}

/* 04 媒 —— 四段转化器：钒触媒床层 + 自上而下穿过的气流 */
const BEDS = [0.84, 0.28, -0.28, -0.84];
function genCatalyst(n, r, put) {
  const sp = 0.05;
  for (let i = 0; i < n; i++) {
    const u = r();
    if (u < 0.5) {
      const k = Math.floor(r() * 4);
      let x, z;
      for (; ;) {
        const rad = Math.sqrt(r()) * 1.0, a = r() * TAU;
        x = rad * Math.cos(a); z = rad * Math.sin(a);
        const j = Math.round(z / (sp * 0.866));
        const off = (j & 1) * sp * 0.5;
        x = Math.round((x - off) / sp) * sp + off; z = j * sp * 0.866;
        if (x * x + z * z <= 1.0) break;
      }
      x += gauss(r) * 0.0015; z += gauss(r) * 0.0015;
      const y = BEDS[k] + (r() - 0.5) * 0.04;
      put(i, x, y, z, 0.0076, k, 0, 0, 0 + 0.9 * r(), x, y);
    } else if (u < 0.56) {
      const k = Math.floor(r() * 4), a = r() * TAU;
      const x = 1.035 * Math.cos(a), z = 1.035 * Math.sin(a), y = BEDS[k] + gauss(r) * 0.006;
      put(i, x, y, z, 0.007, k, 0, 0, 1 + 0.9 * r(), x, y);
    } else if (u < 0.61) {
      const a = r() * TAU, y = -1.3 + 2.6 * r();
      put(i, 1.12 * Math.cos(a), y, 1.12 * Math.sin(a), 0.0055, 0, 0, 0, 3 + 0.9 * r(), 1.12 * Math.cos(a), y);
    } else {
      const sid = Math.floor(r() * 150);
      const rad = Math.sqrt(hash1(sid * 3.1 + 0.7)) * 0.93, a = hash1(sid * 7.7 + 1.3) * TAU, ph = r();
      const x = rad * Math.cos(a) + gauss(r) * 0.004, z = rad * Math.sin(a) + gauss(r) * 0.004;
      put(i, x, z, ph, 0.0078, 0.10 + 0.05 * hash1(sid * 1.9), hash1(sid * 5.3), 0, 2 + 0.9 * r(), x, 1.5 - ph * 3.0);
    }
  }
}

/* 05 酸 —— 一滴硫酸：斐波那契球面 + 内部缓慢的涡流 */
function genDrop(n, r, put) {
  const ns = Math.floor(n * 0.72);
  for (let i = 0; i < n; i++) {
    if (i < ns) {
      const y = 1 - (2 * (i + 0.5)) / ns, rad = Math.sqrt(1 - y * y), th = i * 2.399963229728653;
      const d = norm3([rad * Math.cos(th) + gauss(r) * 0.002, y + gauss(r) * 0.002, rad * Math.sin(th) + gauss(r) * 0.002]);
      put(i, d[0], d[1], d[2], 0.0074, 0, 0, 0, 0 + 0.9 * r(), d[0] * 0.8, d[1] * 0.8);
    } else {
      let x, y, z;
      do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1);
      put(i, x, y, z, 0.006, 0, 0, 0, 1 + 0.9 * r(), x * 0.8, y * 0.8);
    }
  }
}

/* 06 网 —— 全厂物料网络：发烟硫酸 / 稀硫酸 / CO₂ / 废气 / 低温余热 */
function genNetwork(n, r, put) {
  const ew = EDGES.map(e => e.wt);
  const ewSum = ew.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) {
    const u = r();
    if (u < 0.6) {
      let x = r() * ewSum, e = 0;
      while (e < EDGES.length - 1 && x > ew[e]) { x -= ew[e]; e++; }
      const E = EDGES[e];
      const s0 = r();
      const b = bez(E, s0);
      put(i, e, s0, gauss(r) * 0.6, 0.0078, E.sp * (0.8 + 0.4 * r()), gauss(r), 0, 0 + 0.9 * r(), b[0], -b[2]);
    } else if (u < 0.76) {
      const k = Math.floor(r() * NODES.length * 1.0);
      const nd = NODES[k];
      const f = Math.pow(r(), 0.7);
      put(i, k, r() * TAU, f, 0.0085, r(), gauss(r), 0, 1 + 0.9 * r(), nd.p[0], -nd.p[2]);
    } else if (u < 0.9) {
      const k = Math.floor(r() * NODES.length), nd = NODES[k];
      put(i, k, r() * TAU, r(), 0.0065, 0.18 + 0.32 * r(), (r() - 0.5) * 1.6, 0, 2 + 0.9 * r(), nd.p[0], -nd.p[2]);
    } else {
      const ring = Math.floor(r() * 3), a = r() * TAU;
      put(i, a, ring, gauss(r) * 0.006, 0.0065, 0, 0, 0, 3 + 0.9 * r(), NODES[0].p[0] + Math.cos(a), -NODES[0].p[2] - Math.sin(a));
    }
  }
}

/* 07 盐 —— 七水硫酸镁：放射状生长的针柱状晶簇，立于母液之上 */
function genEpsom(n, r, put) {
  const needles = [];
  for (let k = 0; k < 66; k++) {
    const base = [gauss(r) * 0.09, -0.72, gauss(r) * 0.09];
    const th = Math.pow(r(), 0.85) * 1.12, az = r() * TAU;
    const dir = [Math.sin(th) * Math.cos(az), Math.cos(th), Math.sin(th) * Math.sin(az)];
    const len = (0.55 + 1.0 * r()) * (1 - 0.38 * th / 1.12);
    const w = 0.016 + 0.028 * r();
    let u0 = norm3(cross(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    let v0 = cross(dir, u0);
    const roll = r() * TAU, cr = Math.cos(roll), sr = Math.sin(roll);
    const U = [u0[0] * cr + v0[0] * sr, u0[1] * cr + v0[1] * sr, u0[2] * cr + v0[2] * sr];
    const V = cross(dir, U);
    needles.push({ base, dir, len, w, U, V, tip: w * 1.8, wt: len * Math.sqrt(w / 0.03) });
  }
  const wsum = needles.reduce((a, b) => a + b.wt, 0);
  const nNeedle = Math.floor(n * 0.86);
  for (let i = 0; i < n; i++) {
    if (i < nNeedle) {
      let x = r() * wsum, k = 0;
      while (k < needles.length - 1 && x > needles[k].wt) { x -= needles[k].wt; k++; }
      const nd = needles[k];
      const t = r();
      let along, cu, cv, size;
      if (t < 0.48) { // 棱
        cu = r() < 0.5 ? -1 : 1; cv = r() < 0.5 ? -1 : 1; along = r() * nd.len; size = 0.0082;
      } else if (t < 0.8) { // 面
        if (r() < 0.5) { cu = r() < 0.5 ? -1 : 1; cv = r() * 2 - 1; } else { cv = r() < 0.5 ? -1 : 1; cu = r() * 2 - 1; }
        along = r() * nd.len; size = 0.005;
      } else { // 锥顶
        const f = r();
        cu = (r() < 0.5 ? -1 : 1) * (1 - f); cv = (r() < 0.5 ? -1 : 1) * (1 - f);
        along = nd.len + f * nd.tip; size = 0.0085;
      }
      const p = [0, 1, 2].map(j => nd.base[j] + nd.dir[j] * along + (nd.U[j] * cu + nd.V[j] * cv) * nd.w);
      const s = Math.min(0.999, along / (nd.len + nd.tip));
      put(i, p[0], p[1], p[2], size, nd.base[0], nd.base[1], nd.base[2], s * 0.999, p[0], p[1]);
    } else {
      const rad = 1.45 * Math.sqrt(r()), a = r() * TAU;
      put(i, rad * Math.cos(a), -0.74, rad * Math.sin(a), 0.0058, 0, 0, 0, 1 + 0.9 * r(), rad * Math.cos(a), -0.74 - rad * 0.3);
    }
  }
}

/* 08 晶 —— 镁铝水滑石：六层带蜂窝阳离子有序排布的层板，CO₃²⁻ 被捕获进层间 */
function genLDH(n, r, put) {
  const LAY = 6, GAP = 0.235, R = 0.95, a = 0.085, S3 = Math.sqrt(3);
  const inside = (x, z, rr) => Math.abs(z) <= rr * S3 / 2 && S3 * Math.abs(x) + Math.abs(z) <= S3 * rr;
  const Mg = [], Al = [], edges = [];
  const key = (i, j) => i * 1000 + j;
  const site = new Map();
  for (let j = -16; j <= 16; j++) for (let i = -24; i <= 24; i++) {
    const x = i * a + j * a * 0.5, z = j * a * 0.866;
    if (!inside(x, z, R)) continue;
    const isAl = (((i - j) % 3) + 3) % 3 === 0;
    site.set(key(i, j), { x, z, isAl });
    (isAl ? Al : Mg).push([x, z]);
  }
  for (const [k, s] of site) {
    if (s.isAl) continue;
    const i = Math.round(k / 1000), j = k - i * 1000;
    for (const [di, dj] of [[1, 0], [0, 1], [-1, 1]]) {
      const o = site.get(key(i + di, j + dj));
      if (o && !o.isAl) edges.push([s.x, s.z, o.x, o.z]);
    }
  }
  const hexV = [];
  for (let k = 0; k < 6; k++) hexV.push([R * 1.04 * Math.cos(k * TAU / 6), R * 1.04 * Math.sin(k * TAU / 6)]);
  for (let i = 0; i < n; i++) {
    const u = r();
    if (u < 0.64) {
      const l = Math.floor(r() * LAY), y = (l - 2.5) * GAP, shift = (l % 2) * a * 0.5;
      const v = r();
      if (v < 0.07) {
        const s = Al[Math.floor(r() * Al.length)];
        const x = s[0] + gauss(r) * 0.003 + shift, z = s[1] + gauss(r) * 0.003;
        put(i, x, y, z, 0.0125, 0, 0, 0, 1 + 0.9 * r(), x, y + z * 0.3);
      } else if (v < 0.19) {
        const s = Mg[Math.floor(r() * Mg.length)];
        const x = s[0] + gauss(r) * 0.003 + shift, z = s[1] + gauss(r) * 0.003;
        put(i, x, y, z, 0.0095, 0, 0, 0, 0 + 0.9 * 0.95, x, y + z * 0.3);
      } else {
        const e = edges[Math.floor(r() * edges.length)], f = r();
        const x = e[0] + (e[2] - e[0]) * f + gauss(r) * 0.0015 + shift, z = e[1] + (e[3] - e[1]) * f + gauss(r) * 0.0015;
        put(i, x, y, z, 0.0055, 0, 0, 0, 0 + 0.9 * (0.25 + 0.15 * r()), x, y + z * 0.3);
      }
    } else if (u < 0.69) {
      const l = Math.floor(r() * LAY), y = (l - 2.5) * GAP, k = Math.floor(r() * 6), f = r();
      const A = hexV[k], B = hexV[(k + 1) % 6];
      const x = A[0] + (B[0] - A[0]) * f, z = A[1] + (B[1] - A[1]) * f;
      put(i, x, y, z, 0.0072, 0, 0, 0, 4 + 0.9 * r(), x, y + z * 0.3);
    } else if (u < 0.92) {
      // 碳酸根：C + 3O，整体从外部飞入层间
      const mol = Math.floor(r() * 420);
      const mr = mulberry32(mol * 9973 + 17);
      const g = Math.floor(mr() * 5), y = (g - 2) * GAP;
      let cx, cz;
      do { cx = (mr() * 2 - 1) * 0.85; cz = (mr() * 2 - 1) * 0.85; } while (!inside(cx, cz, 0.82));
      const ang = mr() * TAU;
      const atom = Math.floor(r() * 4);
      let x = cx + gauss(r) * 0.0025, z = cz + gauss(r) * 0.0025;
      if (atom > 0) { const aa = ang + atom * TAU / 3; x += Math.cos(aa) * 0.03; z += Math.sin(aa) * 0.03; }
      const od = mr() * TAU, dist = 2.3 + mr() * 1.2;
      const off = [Math.cos(od) * dist, (mr() - 0.5) * 1.6, Math.sin(od) * dist];
      put(i, x, y, z, atom === 0 ? 0.0105 : 0.0078, off[0], off[1], off[2], 2 + 0.9 * mr(), x, y + z * 0.3);
    } else {
      const g = Math.floor(r() * 5), y = (g - 2) * GAP + gauss(r) * 0.02;
      let x, z;
      do { x = (r() * 2 - 1) * 0.9; z = (r() * 2 - 1) * 0.9; } while (!inside(x, z, 0.88));
      put(i, x, y, z, 0.0058, 0, 0, 0, 3 + 0.9 * r(), x, y + z * 0.3);
    }
  }
}

/* 09 环 —— 编织的光环：沿环流动，颜色依次经过矿、火、光、酸、盐、晶 */
function genRing(n, r, put) {
  const NS = 36;
  for (let i = 0; i < n; i++) {
    const u0 = r();
    if (r() < 0.91) {
      const k = Math.floor(r() * NS);
      put(i, u0, k / NS, gauss(r) * 0.012, 0.0074, r(), r(), 0, 0 + 0.9 * r(), 1.02 * Math.cos(u0 * TAU), 1.02 * Math.sin(u0 * TAU));
    } else {
      put(i, u0, r(), gauss(r) * 0.02, 0.0095, r(), r(), 0, 1 + 0.9 * r(), 1.02 * Math.cos(u0 * TAU), 1.02 * Math.sin(u0 * TAU));
    }
  }
}

/* 10 恒 —— 恒光标志：从标志图像采样，颜色取自原标志 */
const LOGO_W = 1.62, LOGO_CY = 0.42;
function genLogo(n, r, put, img) {
  const { w, h, data } = img;
  const fill = [], edge = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = data[(y * w + x) * 4 + 3] / 255;
    if (a > 0.5) fill.push(y * w + x);
    if (a > 0.12 && a < 0.88) edge.push(y * w + x);
  }
  const sc = LOGO_W / w;
  const toLin = v => Math.pow(v / 255, 2.2);
  const pix = (idx, jit) => {
    const x = idx % w, y = Math.floor(idx / w);
    const px = (x + 0.5 + (r() - 0.5) * jit - w / 2) * sc;
    const py = -(y + 0.5 + (r() - 0.5) * jit - h / 2) * sc + LOGO_CY;
    const o = idx * 4;
    let cr = toLin(data[o]), cg = toLin(data[o + 1]), cb = toLin(data[o + 2]);
    // 在暗底上提亮深色部分，保持色相
    const lum = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
    const k = Math.max(1, 0.085 / Math.max(lum, 1e-3));
    cr = Math.min(1, cr * k); cg = Math.min(1, cg * k); cb = Math.min(1, cb * k);
    return [px, py, cr, cg, cb];
  };
  for (let i = 0; i < n; i++) {
    const u = r();
    if (u < 0.82 && fill.length) {
      const q = pix(fill[Math.floor(r() * fill.length)], 1.0);
      put(i, q[0], q[1], gauss(r) * 0.012, 0.0072, q[2], q[3], q[4], 0 + 0.9 * r(), q[0], q[1]);
    } else if (u < 0.92 && edge.length) {
      const q = pix(edge[Math.floor(r() * edge.length)], 0.6);
      put(i, q[0], q[1], gauss(r) * 0.006, 0.0068, q[2], q[3], q[4], 1 + 0.9 * r(), q[0], q[1]);
    } else {
      const a = r() * TAU, rad = 1.02 + gauss(r) * 0.008;
      put(i, a, rad, gauss(r) * 0.01, 0.0062, 0, 0, 0, 2 + 0.9 * r(), Math.cos(a) * rad, LOGO_CY + Math.sin(a) * rad);
    }
  }
}
// 标志未就绪时的占位（极少出现）
function genLogoPlaceholder(n, r, put) {
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, rad = 0.7 + gauss(r) * 0.05;
    put(i, Math.cos(a) * rad, Math.sin(a) * rad + LOGO_CY, 0, 0.007, 0.2, 0.5, 0.9, 0 + 0.9 * r(), Math.cos(a) * rad, Math.sin(a) * rad);
  }
}

/* 开场星尘 */
function genIntro(n, r, put) {
  for (let i = 0; i < n; i++) {
    let x, y, z;
    do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1);
    const R = 3.0;
    put(i, x * R, y * R * 0.8, z * R, 0.004 + 0.006 * r(), 0, 0, 0, -1, x * R, y * R);
  }
}

/* 组装：加入尘埃，并用希尔伯特曲线按屏幕位置排序，使转化时粒子就近流动 */
function hilbert(nn, x, y) {
  let d = 0;
  for (let s = nn >> 1; s > 0; s >>= 1) {
    const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) { x = nn - 1 - x; y = nn - 1 - y; }
      const t = x; x = y; y = t;
    }
  }
  return d;
}
function buildLayer(N, seed, gen, opt = {}) {
  const r = mulberry32(seed);
  const dustFrac = opt.dust ?? 0.07;
  const nd = Math.round(N * dustFrac), nm = N - nd;
  const P = new Float32Array(N * 4), A = new Float32Array(N * 4), K = new Float32Array(N * 2);
  const put = (i, p0, p1, p2, p3, a0, a1, a2, a3, kx, ky) => {
    const o = i * 4;
    P[o] = p0; P[o + 1] = p1; P[o + 2] = p2; P[o + 3] = p3;
    A[o] = a0; A[o + 1] = a1; A[o + 2] = a2; A[o + 3] = a3;
    K[i * 2] = kx; K[i * 2 + 1] = ky;
  };
  gen(nm, r, put, opt.img);
  const dc = opt.dustCenter || [0, 0, 0];
  for (let i = nm; i < N; i++) {
    const x = dc[0] + (r() * 2 - 1) * 2.8, y = dc[1] + (r() * 2 - 1) * 2.3, z = dc[2] + (r() * 2 - 1) * 2.9 - 0.2;
    put(i, x, y, z, 0.004 + 0.008 * r() * r(), 0, 0, 0, -1, x, y);
  }
  // 排序
  const rho = opt.mix ?? 0.12;
  const keys = new Float64Array(N);
  const G = 1024;
  for (let i = 0; i < N; i++) {
    const gx = Math.max(0, Math.min(G - 1, Math.floor(((K[i * 2] + 2.4) / 4.8) * G)));
    const gy = Math.max(0, Math.min(G - 1, Math.floor(((K[i * 2 + 1] + 2.4) / 4.8) * G)));
    const hk = hilbert(G, gx, gy) / (G * G);
    const k = Math.floor((hk * (1 - rho) + r() * rho) * 1073741824);
    keys[i] = k * 65536 + i;
  }
  keys.sort();
  const Po = new Float32Array(N * 4), Ao = new Float32Array(N * 4);
  for (let j = 0; j < N; j++) {
    const i = keys[j] % 65536;
    Po.set(P.subarray(i * 4, i * 4 + 4), j * 4);
    Ao.set(A.subarray(i * 4, i * 4 + 4), j * 4);
  }
  return [Po, Ao];
}

/* ------------------------------------------------------------------ */
/*  着色器                                                             */
/* ------------------------------------------------------------------ */
const GLSL_NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const VS_PARTICLES = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
layout(location=0) in vec4 aRand;

uniform sampler2DArray uData;
uniform int uA, uB;
uniform float uMix, uTA, uTB, uTime, uGain;
uniform mat4 uView, uProj;
uniform vec3 uCamPos;
uniform float uPxScale, uFocus, uAperture, uMaxSize, uLensShift, uMinSize;
uniform vec3 uSweep, uSweepC;
uniform float uSweepAmt, uFlight, uSwirl, uFlash, uRadial, uLift;
uniform float uHeat;
uniform vec3 uDust[11];
uniform vec3 uE0[8], uE1[8], uE2[8], uECol[8];
uniform float uEW[8], uESt[8];
uniform vec3 uNode[5], uNodeCol[5];
uniform float uNodeR[5], uNodeOn[5];

out vec3 vCol;
out float vAlpha;
out float vSharp;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;
${GLSL_NOISE}

mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,s,-s,c); }
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }

struct Pt { vec3 p; vec3 c; float s; };

vec3 fireRamp(float T){
  T = clamp(T, 0., 1.);
  vec3 c = mix(vec3(0.16,0.012,0.0), vec3(1.0,0.20,0.02), smoothstep(0.0,0.42,T));
  c = mix(c, vec3(1.0,0.52,0.10), smoothstep(0.38,0.72,T));
  c = mix(c, vec3(1.0,0.88,0.62), smoothstep(0.72,1.0,T));
  return c;
}
vec3 journey(float u){
  vec3 J[7] = vec3[7](
    vec3(1.0,0.64,0.24),  // 矿 金
    vec3(1.0,0.26,0.05),  // 火 橙
    vec3(1.0,0.92,0.80),  // 光 白
    vec3(0.26,0.52,1.0),  // 酸 蓝
    vec3(0.42,0.90,1.0),  // 盐 青
    vec3(0.36,1.0,0.50),  // 晶 绿
    vec3(1.0,0.64,0.24));
  float x = fract(u)*6.0;
  int i = int(floor(x));
  float f = smoothstep(0.15, 0.85, fract(x));
  return mix(J[i], J[i+1], f);
}

/* ---------- 尘埃 ---------- */
Pt sDust(vec4 P, vec4 R, float t, int id){
  vec3 p = P.xyz + 0.16*vec3(sin(t*0.21+R.x*TAU), sin(t*0.17+R.y*TAU), sin(t*0.13+R.z*TAU));
  float tw = 0.55 + 0.45*sin(t*(0.6+R.z)+R.w*TAU);
  return Pt(p, uDust[id]*(0.35+1.3*R.y)*tw, P.w);
}

/* ---------- 01 矿 ---------- */
Pt sPyrite(vec4 P, vec4 A, vec4 R, float t){
  float cls = floor(A.w); float br = fract(A.w)/0.9;
  float ang = 0.5 + t*0.19;
  vec3 p = P.xyz, n = A.xyz;
  p.xz = rot(ang)*p.xz; n.xz = rot(ang)*n.xz;
  float tx = 0.12*sin(t*0.23);
  p.yz = rot(tx)*p.yz; n.yz = rot(tx)*n.yz;
  vec3 V = normalize(uCamPos - p);
  vec3 L1 = normalize(vec3(-0.55, 0.80, 0.50));
  vec3 L2 = normalize(vec3(0.9, -0.15, 0.35));
  vec3 Lm = normalize(vec3(sin(t*0.55)*0.9, 0.35, cos(t*0.55)));
  float ndv = dot(n, V);
  float d1 = max(dot(n,L1),0.), d2 = max(dot(n,L2),0.);
  float s1 = pow(max(dot(n, normalize(L1+V)),0.), 40.);
  float s3 = pow(max(dot(n, normalize(Lm+V)),0.), 70.);
  vec3 gold = vec3(1.0,0.66,0.26);
  vec3 c = gold*(0.035 + 0.42*d1 + 0.14*d2)*(0.5+0.7*br);
  c += vec3(1.0,0.84,0.58)*(s1*1.8 + s3*3.2)*(0.45+0.55*br);
  c += vec3(0.30,0.42,0.70)*pow(1.0-abs(ndv), 4.0)*0.22;
  vec3 Rf = reflect(-V, n);
  float env = 0.10*smoothstep(-0.4, 0.9, Rf.y) + 0.5*exp(-pow((Rf.y - 0.12)*4.5, 2.0));
  c += gold*env*0.42*(0.4+0.6*br);
  if (cls > 0.5 && cls < 1.5) c *= 1.45;
  if (cls > 1.5) c *= 0.55;
  c *= mix(0.12, 1.0, smoothstep(-0.25, 0.2, ndv));   // 背面压暗，得到实体感
  // 升温：自下而上烧红
  float h = clamp(uHeat*2.0 - (p.y + 0.95)*0.6, 0., 1.);
  c = mix(c, fireRamp(0.12 + 0.62*h)*(0.2 + 0.55*h), h*0.96);
  return Pt(p + vec3(0.0, 0.02*sin(t*0.5), 0.0), c, P.w);
}

/* ---------- 02 火 ---------- */
Pt sFire(vec4 P, vec4 A, vec4 R, float t){
  float cls = floor(A.w); float rr = fract(A.w)/0.9;
  vec3 p; vec3 c; float s = P.w;
  if (cls < 0.5){
    float u = fract(P.z + t*A.x);
    float y = -0.80 + u*2.35;
    float taper = 1.0 - 0.70*pow(u, 0.85);
    vec2 xz = P.xy*taper;
    vec3 q = vec3(xz.x*1.25, y*0.95 - t*1.15, xz.y*1.25);
    vec3 w = vec3(snoise(q), snoise(q+vec3(11.3,4.1,7.7)), snoise(q+vec3(3.7,19.1,13.3)));
    p = vec3(xz.x, y, xz.y) + vec3(w.x, w.y*0.4, w.z)*(0.06 + 0.26*u + 0.24*u*u);
    p.xz = rot(u*2.0 + t*0.35 + A.y*0.4)*p.xz;
    float nf = snoise(p*vec3(2.2,1.5,2.2) - vec3(0.0, t*1.7, 0.0));
    float mask = smoothstep(-0.2, 0.5, nf + 0.38 - u*0.85);
    float nf2 = snoise(p*vec3(5.0,2.2,5.0) - vec3(0.0, t*2.6, 0.0));
    mask *= 0.45 + 0.55*smoothstep(-0.45, 0.55, nf2);
    float T = clamp((1.0 - u)*0.85 + mask*0.15, 0.0, 1.0);
    float fl = 0.8 + 0.2*sin(t*13.0 + rr*40.0);
    c = fireRamp(T)*(pow(T,1.6)*0.9 + 0.012)*fl*smoothstep(0.0, 0.08, u)*(0.06 + 0.94*mask);
    s *= 0.75 + 1.3*u;
  } else if (cls < 1.5){
    float u = fract(P.z + t*A.x);
    float y = 1.15 - u*2.1;
    p = vec3(P.x + 0.05*sin(t*1.3+rr*20.), y, P.y + 0.05*cos(t*1.1+rr*17.));
    c = vec3(0.85,0.13,0.02)*(0.18+0.25*(0.5+0.5*sin(t*4.+rr*30.)))*smoothstep(0.,0.12,u)*smoothstep(1.,0.85,u);
  } else if (cls < 2.5){
    float bub = abs(sin(t*2.4 + P.x*9.0 + P.z*7.0 + rr*6.));
    float pop = pow(bub, 6.0);
    p = vec3(P.x, P.y + 0.04*bub*bub + 0.10*pop*rr, P.z);
    float rad = length(P.xz);
    c = vec3(1.0,0.36,0.06)*(0.12 + 0.55*bub*bub + 0.6*pop)*smoothstep(1.05, 0.5, rad);
  } else {
    float u = fract(P.z + t*A.x*1.7);
    float y = -0.6 + u*3.1;
    vec3 q = vec3(P.x*2.0, y*1.3 - t*0.8, P.y*2.0 + rr*10.0);
    p = vec3(P.x*0.6, y, P.y*0.6) + vec3(snoise(q), 0.0, snoise(q+vec3(7.1,3.3,1.7)))*(0.1 + 0.5*u);
    c = vec3(1.0,0.62,0.22)*pow(1.0-u, 1.4)*1.5*(0.6+0.4*sin(t*20.0+rr*60.0));
    s *= 0.8;
  }
  return Pt(p, c, s);
}

/* ---------- 03 光 ---------- */
Pt sTurbine(vec4 P, vec4 A, vec4 R, float t){
  float cls = floor(A.w); float rr = fract(A.w)/0.9;
  float phi = 0.6*t + 0.27*t*t;
  float on = smoothstep(0.4, 3.4, t);
  vec3 l; vec3 c; float s = P.w;
  if (cls < 0.5){
    float a = P.y + phi;
    l = vec3(P.x*cos(a), P.x*sin(a), P.z);
    float g = pow(0.5+0.5*cos(a - 2.3), 14.0);
    c = vec3(0.55,0.66,0.95)*(0.07 + 0.22*P.x) + vec3(1.0,0.9,0.74)*g*1.3;
  } else if (cls < 1.5){
    float a = P.y + phi*1.3;
    l = vec3(P.x*cos(a), P.x*sin(a), P.z);
    c = vec3(1.0,0.86,0.66)*(0.18 + 0.55*on)*(0.4 + 2.2*smoothstep(0.12, 0.28, P.x));
  } else if (cls < 2.5){
    float a = P.y + phi*0.15;
    l = vec3(P.x*cos(a), P.x*sin(a), P.z);
    c = vec3(0.70,0.82,1.0)*(0.3 + 0.9*on)*(0.55+0.45*sin(a*7.0 - t*3.0));
  } else if (cls < 3.5){
    float fr = fract(P.y + t*0.30);
    float rad = 1.3 + fr*1.7;
    float a = P.x + phi*0.02;
    l = vec3(rad*cos(a), rad*sin(a), P.z*(1.0+fr*3.0));
    c = vec3(1.0,0.84,0.58)*pow(1.0-fr,2.3)*1.15*on*(0.55+0.45*sin(P.x*37.0+t*2.0));
    s *= 1.0 + fr;
  } else {
    l = P.xyz;
    c = vec3(0.8,0.85,1.0)*0.22*(0.4+on);
  }
  l.xz = rot(-0.62)*l.xz;
  l.yz = rot(0.20)*l.yz;
  return Pt(l + vec3(0.0, 0.16, 0.0), c, s);
}

/* ---------- 04 媒 ---------- */
Pt sCatalyst(vec4 P, vec4 A, vec4 R, float t){
  float cls = floor(A.w); float rr = fract(A.w)/0.9;
  vec3 p; vec3 c; float s = P.w;
  if (cls < 0.5){
    float g = 0.5+0.5*sin(t*2.2 - A.x*1.45);
    p = P.xyz;
    c = vec3(1.0,0.40,0.08)*(0.07 + 0.5*pow(g,3.0))*(0.6+0.8*rr);
  } else if (cls < 1.5){
    float g = 0.5+0.5*sin(t*2.2 - A.x*1.45);
    p = P.xyz;
    c = vec3(1.0,0.60,0.26)*(0.45+0.9*g);
  } else if (cls < 2.5){
    float u = fract(P.z + t*A.x);
    float y = 1.3 - u*2.6;
    float passed = step(y,0.84)+step(y,0.28)+step(y,-0.28)+step(y,-0.84);
    float nr = exp(-pow((y-0.84)/0.05,2.))+exp(-pow((y-0.28)/0.05,2.))+exp(-pow((y+0.28)/0.05,2.))+exp(-pow((y+0.84)/0.05,2.));
    p = vec3(P.x + 0.025*sin(y*7.0 + A.y*20.0 + t), y, P.y + 0.025*cos(y*6.0 + A.y*13.0));
    vec3 so2 = vec3(1.0,0.82,0.35)*0.2, so3 = vec3(0.60,0.80,1.0)*0.6;
    c = mix(so2, so3, passed/4.0) + vec3(1.0,0.78,0.48)*nr*1.2;
    c *= smoothstep(0.0,0.06,u)*smoothstep(-1.25,-0.98,y);
  } else {
    p = P.xyz;
    c = vec3(0.65,0.48,0.32)*0.07;
  }
  p.xz = rot(t*0.10)*p.xz;
  return Pt(p, c, s);
}

/* ---------- 05 酸 ---------- */
Pt sDrop(vec4 P, vec4 A, vec4 R, float t){
  float cls = floor(A.w); float rr = fract(A.w)/0.9;
  vec3 p; vec3 c; float s = P.w;
  float Rr = 0.80;
  vec3 ctr = vec3(0.0, 0.06, 0.0);
  if (cls < 0.5){
    vec3 n = P.xyz;
    n.xz = rot(t*0.18)*n.xz;
    float th = acos(clamp(n.y, -1.0, 1.0));
    vec2 dxz = n.xz/max(length(n.xz), 1e-4);
    float tear = sin(th)*pow(sin(th*0.5), 0.9);
    vec3 shp = mix(n, vec3(dxz.x*tear*1.12, cos(th)*1.1, dxz.y*tear*1.12), 0.88);
    float wob = 0.07*exp(-t*0.75)*sin(t*6.2)*(1.5*n.y*n.y-0.5);
    float rip = 0.008*sin(n.y*14.0 - t*2.2) + 0.012*snoise(n*2.2 + vec3(0.,t*0.35,0.));
    p = ctr + shp*Rr*(1.0 + wob + rip);
    vec3 V = normalize(uCamPos - p);
    float ndv = dot(n, V);
    float fres = pow(1.0 - abs(ndv), 3.4);
    vec3 L = normalize(vec3(-0.5,0.7,0.6));
    float sp = pow(max(dot(n, normalize(L+V)),0.0), 170.0);
    float back = ndv < 0.0 ? 0.28 : 1.0;
    c = vec3(0.26,0.54,1.0)*(0.008 + 1.35*fres)*back + vec3(1.0)*sp*6.0*step(0.0,ndv);
    c += vec3(0.40,0.80,1.0)*pow(max(dot(n, normalize(vec3(0.45,-0.65,0.6))),0.0),10.0)*0.22*step(0.0,ndv);
    c += vec3(0.6,0.8,1.0)*pow(max(dot(n, normalize(vec3(0.75,-0.25,0.6))),0.0),40.0)*0.5*step(0.0,ndv);
  } else {
    vec3 q = P.xyz;
    float rad = length(q.xz);
    q.xz = rot(t*(0.3 + 0.5/(0.25+rad)))*q.xz;
    q.y += 0.05*sin(t*0.9 + rad*6.0);
    p = ctr + q*Rr*0.93;
    c = vec3(0.32,0.6,1.0)*0.045*(0.5+rr);
  }
  return Pt(p, c, s);
}

/* ---------- 06 网 ---------- */
vec3 bez(int e, float s){ float o=1.0-s; return o*o*uE0[e] + 2.0*o*s*uE1[e] + s*s*uE2[e]; }
vec3 bezT(int e, float s){ return 2.0*(1.0-s)*(uE1[e]-uE0[e]) + 2.0*s*(uE2[e]-uE1[e]); }
Pt sNetwork(vec4 P, vec4 A, vec4 R, float t){
  float cls = floor(A.w); float rr = fract(A.w)/0.9;
  vec3 p; vec3 c; float s = P.w;
  if (cls < 0.5){
    int e = int(P.x + 0.5);
    float sp = fract(P.y + t*A.x);
    float front = clamp((t - uESt[e])*0.72, 0.0, 1.0);
    float sv = min(sp, front);
    vec3 T = normalize(bezT(e, sv) + vec3(1e-5));
    vec3 nrm = normalize(vec3(-T.z, 0.0, T.x));
    float w = uEW[e];
    p = bez(e, sv) + nrm*P.z*w*(0.55+0.45*sin(PI*sv)) + vec3(0.0, A.y*w*0.3, 0.0);
    float pk = pow(0.5+0.5*sin(sp*30.0 - t*5.0 + float(e)*1.7), 3.0);
    c = uECol[e]*(0.10 + 0.72*pk)*smoothstep(0.0,0.05,sv)*smoothstep(1.0,0.94,sv);
    c *= sp > front ? 0.15 : 1.0;
    c *= smoothstep(uESt[e]-0.2, uESt[e]+0.3, t);
  } else if (cls < 1.5){
    int k = int(P.x + 0.5);
    float on = smoothstep(uNodeOn[k], uNodeOn[k]+0.7, t);
    float rad = uNodeR[k]*(0.12 + 0.88*P.z)*(0.3+0.7*on);
    float a = P.y + t*(0.5 + 0.7*A.x)/(0.35 + P.z);
    p = uNode[k] + vec3(cos(a)*rad, A.y*0.012, sin(a)*rad);
    c = uNodeCol[k]*(0.10 + 1.05*pow(1.0-P.z, 2.5))*(0.15+0.85*on);
  } else if (cls < 2.5){
    int k = int(P.x + 0.5);
    float on = smoothstep(uNodeOn[k], uNodeOn[k]+1.0, t);
    float f = fract(P.z + t*0.22*(0.7+0.6*rr));
    float a = P.y + A.y*f;
    float dist = uNodeR[k]*0.9 + f*A.x*on;
    p = uNode[k] + vec3(cos(a)*dist, 0.0, sin(a)*dist);
    c = uNodeCol[k]*0.28*pow(1.0-f, 2.0)*on;
  } else {
    float tt = t - P.y*0.5;
    float rad = 0.06 + 1.15*(1.0 - exp(-max(tt,0.0)*0.9));
    float a = P.x;
    p = uNode[0] + vec3(cos(a)*(rad + P.z), 0.0, sin(a)*(rad + P.z));
    c = vec3(0.45,0.78,1.0)*(0.012 + 0.8*exp(-max(tt,0.0)*1.3))*(tt > 0.0 ? 1.0 : 0.2);
  }
  return Pt(p, c, s);
}

/* ---------- 07 盐 ---------- */
Pt sEpsom(vec4 P, vec4 A, vec4 R, float t){
  float cls = floor(A.w);
  vec3 p; vec3 c; float s = P.w;
  float ang = 0.4 + t*0.13;
  if (cls < 0.5){
    vec3 base = A.xyz; float sv = fract(A.w)/0.999;
    float h = hash11(base.x*917.3 + base.z*373.1 + 3.7);
    float g = clamp((t - 0.1 - h*1.5)/(1.3 + h*1.3), 0.0, 1.0);
    g = 1.0 - pow(1.0 - g, 2.4);
    vec3 rel = P.xyz - base;
    float k = sv <= g ? 1.0 : g / max(sv, 1e-3);
    p = base + rel*k;
    float front = sv > g ? 1.0 : 0.0;
    vec3 dir = normalize(rel + vec3(0.0,1e-4,0.0));
    p.xz = rot(ang)*p.xz; dir.xz = rot(ang)*dir.xz;
    vec3 V = normalize(uCamPos - p);
    vec3 L = normalize(vec3(-0.4,0.8,0.5));
    vec3 H = normalize(L+V);
    float th = dot(dir, H);
    float an = pow(sqrt(max(1.0 - th*th, 0.0)), 50.0);
    vec3 L2 = normalize(vec3(0.8,0.1,-0.4));
    float th2 = dot(dir, normalize(L2+V));
    float an2 = pow(sqrt(max(1.0 - th2*th2, 0.0)), 50.0);
    c = vec3(0.62,0.82,1.0)*0.085 + vec3(0.88,0.96,1.0)*an*1.7 + vec3(0.5,0.75,1.0)*an2*0.8;
    c *= mix(1.0, 0.3, front);
    c *= mix(0.02, 1.0, smoothstep(0.06, 0.62, sv*k));
    c *= mix(vec3(0.85,0.95,1.0), vec3(0.95,0.9,1.0), h);
    c += vec3(0.8,0.95,1.0)*front*0.06;
  } else {
    p = P.xyz; float rad = length(p.xz);
    p.y += 0.008*sin(rad*28.0 - t*2.0);
    p.xz = rot(ang)*p.xz;
    c = vec3(0.35,0.65,1.0)*0.06*(0.55+0.45*sin(rad*28.0 - t*2.0))*smoothstep(1.45,0.6,rad);
  }
  return Pt(p, c, s);
}

/* ---------- 08 晶 ---------- */
Pt sLDH(vec4 P, vec4 A, vec4 R, float t){
  float cls = floor(A.w); float rr = fract(A.w)/0.9;
  vec3 p = P.xyz; vec3 c; float s = P.w;
  float br = 1.0 + 0.04*sin(t*0.9);
  if (cls < 0.5){
    c = vec3(0.36,1.0,0.60)*(0.05 + 0.5*rr*rr);
  } else if (cls < 1.5){
    c = vec3(0.32,0.76,1.0)*1.0*(0.8+0.2*sin(t*2.0+rr*20.));
  } else if (cls < 2.5){
    float d = 0.25 + rr*2.4;
    float cap = smoothstep(d, d+1.6, t);
    p = P.xyz + A.xyz*(1.0 - cap);
    float flash = exp(-pow((t - d - 1.6)*3.0, 2.0));
    c = vec3(0.80,1.0,0.86)*(0.26 + 1.6*flash)*(0.35+0.65*cap);
  } else if (cls < 3.5){
    p += 0.01*vec3(sin(t*2.+rr*30.), 0.0, cos(t*1.7+rr*20.));
    c = vec3(0.3,0.6,1.0)*0.10;
  } else {
    c = vec3(0.5,1.0,0.72)*0.7;
  }
  p.y *= br;
  p.xz = rot(0.3 + t*0.11)*p.xz;
  return Pt(p, c, s);
}

/* ---------- 09 环 ---------- */
vec3 ringXf(vec3 l, float t){
  float tilt = mix(1.0, 0.0, smoothstep(0.6, 7.0, t));
  l.yz = rot(tilt)*l.yz;
  l.xy = rot(0.18*sin(t*0.25))*l.xy;
  return l + vec3(0.0, 0.04, 0.0);
}
Pt sRing(vec4 P, vec4 A, vec4 R, float t){
  float cls = floor(A.w); float rr = fract(A.w)/0.9;
  vec3 l; vec3 c; float s = P.w;
  float spin = t*0.10;
  if (cls < 0.5){
    float u = fract(P.x + t*0.045*(0.85+0.3*A.x));
    float th = u*TAU;
    float phi = TAU*P.y + 3.0*th + t*0.6;
    float rad = 0.15 + P.z;
    float Rm = 1.02 + rad*cos(phi);
    l = vec3(Rm*cos(th+spin), Rm*sin(th+spin), rad*sin(phi));
    c = journey(u)*(0.22 + 0.78*pow(0.5+0.5*cos(phi - t*1.5), 2.0))*0.85;
  } else {
    float u = fract(P.x + t*0.12*(0.8+0.4*A.x));
    float th = u*TAU;
    float rad = 0.02 + P.z;
    l = vec3((1.02+rad)*cos(th+spin), (1.02+rad)*sin(th+spin), A.y*0.06-0.03);
    c = journey(u)*1.8*(0.6+0.4*sin(t*5.0+rr*30.0));
  }
  return Pt(ringXf(l, t), c, s);
}

/* ---------- 10 恒 ---------- */
Pt sLogo(vec4 P, vec4 A, vec4 R, float t){
  float cls = floor(A.w); float rr = fract(A.w)/0.9;
  vec3 p = P.xyz; vec3 c; float s = P.w;
  if (cls < 1.5){
    p.z += 0.03*sin(t*0.9 + p.x*2.2 + p.y*1.3);
    float sh = 0.85 + 0.2*sin(t*2.3 + rr*40.0);
    float band = (p.x*0.8 + (p.y - ${LOGO_CY.toFixed(2)})*0.6) - (-1.7 + (t - 2.0)*0.95);
    float sweep = exp(-band*band*20.0);
    c = A.xyz*(cls > 0.5 ? 1.25 : 1.0)*sh*0.36 + vec3(0.85,0.95,1.0)*sweep*0.45;
  } else {
    float a = P.x + t*0.05;
    float rad = P.y;
    p = vec3(cos(a)*rad, ${LOGO_CY.toFixed(2)} + sin(a)*rad, P.z);
    c = journey(fract(a/TAU + 0.5))*0.055;
  }
  return Pt(p, c, s);
}

Pt evalScene(int id, float t, vec4 P, vec4 A, vec4 R){
  if (A.w < -0.5) return sDust(P, R, t, id);
  if (id == 0) return sPyrite(P, A, R, t);
  if (id == 1) return sFire(P, A, R, t);
  if (id == 2) return sTurbine(P, A, R, t);
  if (id == 3) return sCatalyst(P, A, R, t);
  if (id == 4) return sDrop(P, A, R, t);
  if (id == 5) return sNetwork(P, A, R, t);
  if (id == 6) return sEpsom(P, A, R, t);
  if (id == 7) return sLDH(P, A, R, t);
  if (id == 8) return sRing(P, A, R, t);
  if (id == 9) return sLogo(P, A, R, t);
  return sDust(P, R, t, 10);
}

void main(){
  int id = gl_VertexID;
  ivec2 tc = ivec2(id % ${TEXW}, id / ${TEXW});
  vec4 PA = texelFetch(uData, ivec3(tc, uA*2), 0);
  vec4 AA = texelFetch(uData, ivec3(tc, uA*2+1), 0);
  Pt a = evalScene(uA, uTA, PA, AA, aRand);
  Pt r = a;
  if (uMix > 0.0){
    vec4 PB = texelFetch(uData, ivec3(tc, uB*2), 0);
    vec4 AB = texelFetch(uData, ivec3(tc, uB*2+1), 0);
    Pt b = evalScene(uB, uTB, PB, AB, aRand);
    float key = uRadial > 1.5
      ? fract(atan(a.p.x - uSweepC.x, a.p.y - uSweepC.y - 0.04)/TAU + 1.0)
      : (uRadial > 0.5
        ? clamp(length(a.p - uSweepC)*0.45, 0.0, 1.0)
        : clamp(dot(a.p - uSweepC, uSweep)*0.42 + 0.5, 0.0, 1.0));
    float amt = uRadial > 0.5 ? 0.85 : uSweepAmt;
    const float SPREAD = 1.25;
    float delay = mix(aRand.w, key, amt)*SPREAD;
    float e = clamp(uMix*(1.0+SPREAD) - delay, 0.0, 1.0);
    e = e*e*e*(e*(e*6.0-15.0)+10.0);
    float m = sin(PI*e);
    vec3 mid = mix(a.p, b.p, e);
    vec3 q = mid*0.45 + aRand.xyz*0.32 + vec3(0.0, uTime*0.07, 0.0);
    vec3 nz = vec3(snoise(q), snoise(q+vec3(19.1,7.3,2.9)), snoise(q+vec3(5.7,37.3,11.1)));
    mid += nz*m*uFlight;
    mid.y += m*uLift*(0.6 + 0.8*aRand.z);
    vec2 xz = mid.xz - uSweepC.xz;
    xz = rot(m*uSwirl*(0.5 + aRand.y))*xz;
    mid.xz = xz + uSweepC.xz;
    r.p = mid;
    r.c = mix(a.c, b.c, e)*mix(1.0, uFlash, m);
    r.s = mix(a.s, b.s, e);
  }
  vec4 vp = uView*vec4(r.p, 1.0);
  float depth = -vp.z;
  gl_Position = uProj*vp;
  gl_Position.y += uLensShift*gl_Position.w;
  if (depth < 0.15){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); vAlpha = 0.0; vSharp = 1.0; return; }
  float base = r.s*uPxScale/depth;
  float coc = uAperture*abs(depth - uFocus)/depth*uPxScale;
  float sz = max(sqrt(base*base + coc*coc), uMinSize);
  float en = max(base, 0.55);
  vAlpha = (en*en)/(sz*sz)*uGain;
  vSharp = clamp(base/sz*1.5 - 0.35, 0.0, 1.0);
  vCol = r.c;
  gl_PointSize = min(sz, uMaxSize);
}`;

const FS_PARTICLES = `#version 300 es
precision highp float;
in vec3 vCol; in float vAlpha; in float vSharp;
out vec4 o;
void main(){
  vec2 q = gl_PointCoord*2.0 - 1.0;
  float r2 = dot(q,q);
  if (r2 > 1.0) discard;
  float rr = sqrt(r2);
  float g = exp(-r2*5.0)*3.2;
  float disc = smoothstep(1.0, 0.8, rr)*(0.88 + 0.3*smoothstep(0.5, 0.92, rr));
  float prof = mix(disc, g, vSharp);
  o = vec4(vCol*vAlpha*prof, 1.0);
}`;

const VS_QUAD = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p*2.0 - 1.0, 0.0, 1.0);
}`;

const FS_FADE = `#version 300 es
precision mediump float;
out vec4 o;
void main(){ o = vec4(0.0); }`;

const FS_DOWN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec2 h = uTexel*0.5;
  vec3 c = texture(uTex, vUv).rgb*4.0;
  c += texture(uTex, vUv + vec2(-h.x,-h.y)*2.0).rgb;
  c += texture(uTex, vUv + vec2( h.x,-h.y)*2.0).rgb;
  c += texture(uTex, vUv + vec2(-h.x, h.y)*2.0).rgb;
  c += texture(uTex, vUv + vec2( h.x, h.y)*2.0).rgb;
  o = vec4(min(c/8.0, vec3(60.0)), 1.0);
}`;

const FS_UP = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec2 h = uTexel;
  vec3 c = vec3(0.0);
  c += texture(uTex, vUv + vec2(-h.x*2.0, 0.0)).rgb;
  c += texture(uTex, vUv + vec2(-h.x, h.y)).rgb*2.0;
  c += texture(uTex, vUv + vec2(0.0, h.y*2.0)).rgb;
  c += texture(uTex, vUv + vec2(h.x, h.y)).rgb*2.0;
  c += texture(uTex, vUv + vec2(h.x*2.0, 0.0)).rgb;
  c += texture(uTex, vUv + vec2(h.x, -h.y)).rgb*2.0;
  c += texture(uTex, vUv + vec2(0.0, -h.y*2.0)).rgb;
  c += texture(uTex, vUv + vec2(-h.x, -h.y)).rgb*2.0;
  o = vec4(c/12.0, 1.0);
}`;

const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom;
uniform vec3 uBg0, uBg1;
uniform float uBloomStr, uExposure, uTime, uFade, uCA, uLevels;
uniform vec2 uRes;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
vec3 aces(vec3 x){ const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
void main(){
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float asp = uRes.x/uRes.y;
  vec2 da = d*vec2(asp, 1.0);
  float r = length(da);
  vec2 off = d*uCA*(0.3 + r);
  vec3 sc;
  sc.r = texture(uScene, uv - off).r;
  sc.g = texture(uScene, uv).g;
  sc.b = texture(uScene, uv + off).b;
  vec3 bl = texture(uBloom, uv).rgb/uLevels;
  vec3 bg = mix(uBg0, uBg1, smoothstep(-0.1, 1.25, r*1.2 + (uv.y - 0.5)*0.2));
  vec3 col = bg + (sc + bl*uBloomStr)*uExposure;
  col = aces(col*1.05);
  float vig = smoothstep(1.15, 0.25, r*1.15);
  col *= mix(0.62, 1.0, vig);
  col = pow(col, vec3(1.0/2.2));
  float n = hash12(gl_FragCoord.xy + fract(uTime*13.17)*vec2(173.0, 311.0)) + hash12(gl_FragCoord.yx*1.37 + fract(uTime*7.31)*91.0) - 1.0;
  col += n*0.018;
  col *= uFade;
  o = vec4(col, 1.0);
}`;

/* ------------------------------------------------------------------ */
/*  时间线                                                             */
/* ------------------------------------------------------------------ */
const DIST_MUL = 1.45, SIZE_MUL = 1.22, LENS_SHIFT = 0.15;
const STARTS = [];
let PERIOD = 0;
for (const s of SEQ) { STARTS.push(PERIOD); PERIOD += s.tin + s.hold; }
const INTRO_LEAD = 1.2; // 星尘在汇聚前的停留

// 给定全局时间 t（秒，t=0 为开场），返回当前状态
function timeline(t) {
  const first = t < PERIOD;
  let tau = ((t % PERIOD) + PERIOD) % PERIOD;
  let k = SEQ.length - 1;
  for (let i = 0; i < SEQ.length; i++) if (tau < STARTS[i] + SEQ[i].tin + SEQ[i].hold) { k = i; break; }
  const S = SEQ[k];
  const local = tau - STARTS[k];
  const prev = (k + SEQ.length - 1) % SEQ.length;
  const prevLocal = k === 0 ? tau + PERIOD - STARTS[prev] : tau - STARTS[prev];
  const st = { k, tau, local, first };
  if (local < S.tin) {
    st.a = prev; st.ta = prevLocal; st.b = k; st.tb = local; st.m = local / S.tin;
    if (k === 0 && first) { st.a = INTRO_ID; st.ta = local + INTRO_LEAD; }
  } else {
    st.a = k; st.ta = local; st.b = k; st.tb = local; st.m = 0;
  }
  return st;
}
const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (x * 6 - 15) + 10); };
const lerp = (a, b, f) => a + (b - a) * f;
const lerp3 = (a, b, f) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];

/* ------------------------------------------------------------------ */
/*  矩阵                                                               */
/* ------------------------------------------------------------------ */
function perspective(fovy, asp, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function lookAt(e, c, up) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
}
function xform(m, p) {
  const x = p[0], y = p[1], z = p[2];
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
}

function camAt(c, lt) {
  return {
    t: c.t, d: c.d * (1 + (c.dv || 0) * lt), az: c.az + (c.azv || 0) * lt, el: c.el + (c.elv || 0) * lt,
    fov: c.fov, ap: c.ap,
  };
}
function camBlend(a, b, f) {
  return { t: lerp3(a.t, b.t, f), d: lerp(a.d, b.d, f), az: lerp(a.az, b.az, f), el: lerp(a.el, b.el, f), fov: lerp(a.fov, b.fov, f), ap: lerp(a.ap, b.ap, f) };
}
const specOf = id => (id === INTRO_ID ? INTRO : SEQ[id]);

/* ------------------------------------------------------------------ */
/*  样式                                                               */
/* ------------------------------------------------------------------ */
const CSS = `
.hgf{position:relative;width:100%;height:100%;overflow:hidden;background:#050506;color:#fff;
  container-type:size;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none;
  --hgf-serif:"Noto Serif SC","Noto Serif CJK SC","Source Han Serif SC","思源宋体","Source Han Serif CN","Songti SC","STSong","SimSun",serif;
  --hgf-sans:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif;
  --pad:clamp(24px,7.9cqw,58px);font-family:var(--hgf-sans)}
.hgf canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.hgf-ui{position:absolute;inset:0;pointer-events:none}
.hgf-scrim{position:absolute;left:0;right:0;bottom:0;height:46%;pointer-events:none;
  background:linear-gradient(to top,rgba(3,3,5,.86) 0%,rgba(3,3,5,.62) 32%,rgba(3,3,5,.25) 62%,rgba(3,3,5,0) 100%)}
.hgf-brand{position:absolute;left:var(--pad);top:calc(var(--pad)*0.9);display:flex;align-items:center;gap:11px}
.hgf-brand i{width:26px;height:26px;border-radius:7px;background:#f3f2ee;color:#121212;font-style:normal;
  font-family:var(--hgf-serif);font-size:15px;line-height:26px;text-align:center;font-weight:600}
.hgf-brand b{font-family:Georgia,"Times New Roman",var(--hgf-serif);font-weight:400;font-size:20px;letter-spacing:.01em;color:#f3f2ee}
.hgf-foot{position:absolute;left:var(--pad);bottom:calc(var(--pad)*0.78);font-size:12px;color:rgba(255,255,255,.34);letter-spacing:.03em}
.hgf-cap{position:absolute;left:var(--pad);right:var(--pad);bottom:calc(var(--pad)*1.62)}
.hgf-blk{position:absolute;left:0;right:0;bottom:0;opacity:0}
.hgf-head{display:flex;align-items:center;gap:12px;margin-bottom:clamp(12px,2.4cqw,18px);font-size:11px;letter-spacing:.3em;
  color:rgba(255,255,255,.52);font-variant-numeric:tabular-nums}
.hgf-head .ln{display:block;width:46px;height:1px;background:rgba(255,255,255,.16);position:relative;overflow:hidden}
.hgf-head .ln i{position:absolute;inset:0;background:rgba(255,255,255,.8);transform-origin:0 50%;transform:scaleX(0)}
.hgf-main{font-family:var(--hgf-serif);font-weight:400;font-size:clamp(20px,4.5cqw,34px);line-height:1.5;letter-spacing:.07em;color:#f4f2ee}
.hgf-main span{display:inline-block;white-space:pre}
.hgf-anno{margin-top:clamp(10px,1.9cqw,14px);font-size:clamp(10px,1.65cqw,12px);line-height:1.6;letter-spacing:.14em;color:rgba(255,255,255,.46)}
.hgf-title{font-family:var(--hgf-serif);font-weight:400;font-size:clamp(30px,7.2cqw,54px);line-height:1.2;letter-spacing:.2em;color:#f5f3ef}
.hgf-title span{display:inline-block}
.hgf-tag{margin-top:clamp(8px,1.6cqw,12px);font-family:var(--hgf-serif);font-size:clamp(17px,3.5cqw,26px);letter-spacing:.12em;
  background:linear-gradient(90deg,#8fe06a 0%,#3cc3a8 45%,#3f8cf0 100%);-webkit-background-clip:text;background-clip:text;color:transparent;display:inline-block}
.hgf-meta{margin-top:clamp(14px,2.6cqw,20px);font-size:clamp(10px,1.6cqw,12px);letter-spacing:.12em;line-height:1.7;color:rgba(255,255,255,.42)}
.hgf-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.hgf-lb{position:absolute;left:0;top:0;white-space:nowrap;opacity:0;will-change:transform,opacity}
.hgf-lb.node{font-size:12px;letter-spacing:.14em;color:rgba(255,255,255,.88);padding-left:12px}
.hgf-lb.node::before{content:"";position:absolute;left:0;top:50%;width:6px;height:1px;background:rgba(255,255,255,.5)}
.hgf-lb.node.l{padding-left:0;padding-right:12px;text-align:right}
.hgf-lb.node.l::before{left:auto;right:0}
.hgf-lb.node small{display:block;font-size:10px;letter-spacing:.1em;color:rgba(255,255,255,.42);margin-top:2px}
.hgf-lb.edge{font-size:10px;letter-spacing:.12em;color:rgba(255,255,255,.5)}
.hgf-lb.stage{font-family:var(--hgf-serif);font-size:15px;color:rgba(255,255,255,.75);transform-origin:50% 50%}
.hgf-fallback{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,#0f1a24 0%,#040506 70%)}
.hgf-fallback img{position:absolute;left:50%;top:38%;width:38%;transform:translate(-50%,-50%);opacity:.9}
`;

/* ------------------------------------------------------------------ */
/*  挂载                                                               */
/* ------------------------------------------------------------------ */
function mountHgxtFilm(container, options = {}) {
  const opt = Object.assign({
    brand: true,          // 左上角 Hgxt 标识
    footer: true,         // 底部版权
    captions: true,       // 字幕
    labels: true,         // 车间网络/物态标签
    particles: 65536,     // 粒子数（≤65536）
    maxDpr: 2,
    speed: 1,
    start: 0,             // 起始时间（秒）
    autoplay: true,
    footerText: '© 2026 HGXT · 内部系统，仅限授权人员使用',
    brandText: 'Hgxt',
    brandMark: '化',
  }, options);
  const N = Math.min(65536, Math.max(4096, opt.particles | 0));
  const TEXH = Math.ceil(N / TEXW);
  const NTEX = TEXW * TEXH;

  if (!document.getElementById('hgf-style')) {
    const st = document.createElement('style'); st.id = 'hgf-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  const root = document.createElement('div'); root.className = 'hgf';
  const canvas = document.createElement('canvas');
  const ui = document.createElement('div'); ui.className = 'hgf-ui';
  const labelsEl = document.createElement('div'); labelsEl.className = 'hgf-labels';
  const scrim = document.createElement('div'); scrim.className = 'hgf-scrim';
  root.append(canvas, scrim, labelsEl, ui);
  container.appendChild(root);

  if (opt.brand) {
    const b = document.createElement('div'); b.className = 'hgf-brand';
    b.innerHTML = `<i>${opt.brandMark}</i><b>${opt.brandText}</b>`; ui.appendChild(b);
  }
  if (opt.footer) {
    const f = document.createElement('div'); f.className = 'hgf-foot'; f.textContent = opt.footerText; ui.appendChild(f);
  }

  /* ---------- 字幕 ---------- */
  const capEl = document.createElement('div'); capEl.className = 'hgf-cap'; ui.appendChild(capEl);
  const blocks = SEQ.map((s, i) => {
    const el = document.createElement('div'); el.className = 'hgf-blk';
    const num = String(i + 1).padStart(2, '0');
    const head = `<div class="hgf-head"><span>${num}</span><span class="ln"><i></i></span><span>${s.ch}</span></div>`;
    const chars = [];
    if (s.final) {
      el.innerHTML = head + `<div class="hgf-title"></div><div><span class="hgf-tag">${FINAL.tag}</span></div>` +
        `<div class="hgf-meta">${FINAL.co}</div>`;
      const t = el.querySelector('.hgf-title');
      for (const ch of FINAL.title) { const sp = document.createElement('span'); sp.textContent = ch; t.appendChild(sp); chars.push(sp); }
    } else {
      el.innerHTML = head + `<div class="hgf-main"></div><div class="hgf-anno"></div>`;
      const m = el.querySelector('.hgf-main');
      for (const ch of s.cap) {
        if (ch === '\n') { m.appendChild(document.createElement('br')); continue; }
        const sp = document.createElement('span'); sp.textContent = ch; m.appendChild(sp); chars.push(sp);
      }
      el.querySelector('.hgf-anno').textContent = s.anno;
    }
    capEl.appendChild(el);
    return {
      el, chars, line: el.querySelector('.ln i'), head: el.querySelector('.hgf-head'),
      anno: el.querySelector('.hgf-anno') || el.querySelector('.hgf-tag').parentNode,
      meta: el.querySelector('.hgf-meta'), state: '',
    };
  });
  if (!opt.captions) capEl.style.display = 'none';

  function updateCaptions(st) {
    const tau = st.tau;
    for (let i = 0; i < SEQ.length; i++) {
      const s = SEQ[i], b = blocks[i];
      const t0 = STARTS[i] + s.tin * 0.5;               // 入
      const tEnd = STARTS[i] + s.tin + s.hold;          // 下一幕开始
      const t1 = s.final ? tEnd - 0.45 : tEnd + 0.15;   // 出
      const lt = tau - t0;
      const vis = lt > -0.3 && tau < t1 + 0.8;
      if (!vis && b.state === 'off') continue;
      if (!vis) { b.el.style.opacity = 0; b.state = 'off'; continue; }
      b.state = 'on';
      const out = smooth((tau - (t1 - 0.6)) / 0.8);
      b.el.style.opacity = (1 - out).toFixed(3);
      b.el.style.filter = out > 0.001 ? `blur(${(out * 6).toFixed(2)}px)` : 'none';
      b.el.style.transform = `translateY(${(-out * 8).toFixed(2)}px)`;
      const hIn = smooth((lt + 0.2) / 0.8);
      b.head.style.opacity = hIn.toFixed(3);
      b.line.style.transform = `scaleX(${Math.max(0, Math.min(1, (tau - STARTS[i]) / (s.tin + s.hold))).toFixed(4)})`;
      const step = s.final ? 0.16 : 0.055;
      for (let c = 0; c < b.chars.length; c++) {
        const f = smooth((lt - 0.15 - c * step) / (s.final ? 1.1 : 0.75));
        const sp = b.chars[c].style;
        sp.opacity = f.toFixed(3);
        sp.transform = `translateY(${((1 - f) * 0.4).toFixed(3)}em)`;
        sp.filter = f < 0.999 ? `blur(${((1 - f) * 8).toFixed(2)}px)` : 'none';
      }
      const aIn = smooth((lt - 0.4 - b.chars.length * step) / 0.9);
      b.anno.style.opacity = aIn.toFixed(3);
      b.anno.style.filter = aIn < 0.999 ? `blur(${((1 - aIn) * 5).toFixed(2)}px)` : 'none';
      if (b.meta) b.meta.style.opacity = smooth((lt - 2.6) / 1.2).toFixed(3);
    }
  }

  /* ---------- 三维标签 ---------- */
  const labels = [];
  if (opt.labels) {
    NODES.forEach((nd, k) => {
      const el = document.createElement('div'); el.className = 'hgf-lb node' + (nd.side === 'l' ? ' l' : '');
      el.innerHTML = `${nd.name}<small>${nd.sub}</small>`; labelsEl.appendChild(el);
      labels.push({ el, scene: 5, kind: 'node', k, on: nd.on });
    });
    EDGES.forEach((e, k) => {
      if (!e.label) return;
      const el = document.createElement('div'); el.className = 'hgf-lb edge'; el.textContent = e.label; labelsEl.appendChild(el);
      labels.push({ el, scene: 5, kind: 'edge', k, on: e.st + 1.2 });
    });
    RING_STAGES.forEach((ch, k) => {
      const el = document.createElement('div'); el.className = 'hgf-lb stage'; el.textContent = ch; labelsEl.appendChild(el);
      labels.push({ el, scene: 8, kind: 'stage', k, on: 1.6 + k * 0.18 });
    });
  }
  function ringPoint(u, t, rad) {
    const spin = t * 0.10, th = u * TAU + spin;
    let x = rad * Math.cos(th), y = rad * Math.sin(th), z = 0;
    const tilt = lerp(1.0, 0.0, (x => { x = Math.min(1, Math.max(0, (t - 0.6) / 6.4)); return x * x * (3 - 2 * x); })());
    let c = Math.cos(tilt), s = Math.sin(tilt);
    [y, z] = [c * y - s * z, s * y + c * z];
    const a2 = 0.18 * Math.sin(t * 0.25); c = Math.cos(a2); s = Math.sin(a2);
    [x, y] = [c * x - s * y, s * x + c * y];
    return [x, y + 0.04, z];
  }
  function updateLabels(st, viewProj, W, H, lens) {
    for (const L of labels) {
      // 该标签所属场景的可见度
      let vis = 0, lt = 0;
      const sc = L.scene;
      if (st.b === sc && st.a === sc) { vis = 1; lt = st.tb; }
      else if (st.b === sc) { vis = smooth((st.m - 0.55) / 0.45); lt = st.tb; }
      else if (st.a === sc) { vis = 1 - smooth(st.m / 0.35); lt = st.ta; }
      if (vis <= 0.001) { if (L.vis !== 0) { L.el.style.opacity = 0; L.vis = 0; } continue; }
      let p;
      if (L.kind === 'node') { const nd = NODES[L.k]; p = [nd.p[0] + (nd.side === 'l' ? -1 : 1) * nd.r * 0.9, 0, nd.p[2]]; }
      else if (L.kind === 'edge') {
        const E = EDGES[L.k], b = bez(E, 0.5), b2 = bez(E, 0.52);
        let tx = b2[0] - b[0], tz = b2[2] - b[2]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const sd = E.lside || 1;
        p = [b[0] - tz * 0.075 * sd, 0, b[2] + tx * 0.075 * sd];
      }
      else p = ringPoint(L.k / 6, lt, 1.34);
      const c = xform(viewProj, p);
      if (c[3] <= 0.01) continue;
      const x = (c[0] / c[3] * 0.5 + 0.5) * W;
      const y = (1 - (c[1] / c[3] + lens) * 0.5 - 0.5) * H;
      const a = vis * smooth((lt - L.on) / 0.9);
      L.vis = a;
      const left = L.kind === 'node' && NODES[L.k].side === 'l';
      const yo = L.kind === 'node' ? -8 : (L.kind === 'stage' ? -9 : -6);
      if (left && !L.w) L.w = L.el.offsetWidth;
      const xo = L.kind === 'stage' ? -7 : (left ? -L.w : 0);
      L.el.style.opacity = a.toFixed(3);
      L.el.style.transform = `translate(${(x + xo).toFixed(1)}px,${(y + yo).toFixed(1)}px)`;
    }
  }

  /* ---------- WebGL ---------- */
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opt.preserve });
  const hasFloat = gl && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  function showFallback() {
    canvas.style.display = 'none';
    const fb = document.createElement('div'); fb.className = 'hgf-fallback';
    fb.innerHTML = `<img alt="" src="${LOGO_URL}">`;
    root.insertBefore(fb, scrim);
    labelsEl.style.display = 'none';
    blocks.forEach(b => { b.el.style.opacity = 0; });
    const fin = blocks[blocks.length - 1];
    fin.el.style.opacity = 1; fin.el.style.filter = 'none'; fin.el.style.transform = 'none';
    fin.anno.style.opacity = 1; fin.head.style.opacity = 1; fin.line.style.transform = 'scaleX(1)';
    if (fin.meta) { fin.meta.textContent = FINAL.co; fin.meta.style.opacity = 1; }
    fin.chars.forEach(c => { c.style.opacity = 1; c.style.filter = 'none'; c.style.transform = 'none'; });
  }
  const noop = { destroy() { root.remove(); }, play() { }, pause() { }, seek() { }, renderAt() { }, step() { }, ready: Promise.resolve(), time: 0, duration: PERIOD, particles: 0 };
  if (!gl) { showFallback(); return noop; }

  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
    return s;
  }
  function prog(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aRand');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  let pPart, pFade, pDown, pUp, pComp;
  try {
    pPart = prog(VS_PARTICLES, FS_PARTICLES);
    pFade = prog(VS_QUAD, FS_FADE);
    pDown = prog(VS_QUAD, FS_DOWN);
    pUp = prog(VS_QUAD, FS_UP);
    pComp = prog(VS_QUAD, FS_COMPOSITE);
  } catch (err) {
    console.warn('[hgf] WebGL 初始化失败，使用静态画面', err);
    showFallback(); return noop;
  }

  // 每粒子的随机数
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const rnd = new Float32Array(NTEX * 4);
  { const r = mulberry32(20260101); for (let i = 0; i < rnd.length; i++) rnd[i] = r(); }
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, rnd, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  const qvao = gl.createVertexArray();

  // 形态数据：2 层/幕 × 11 幕
  const LAYERS = 22;
  const dataTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, dataTex);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA32F, TEXW, TEXH, LAYERS, 0, gl.RGBA, gl.FLOAT, null);
  function upload(id, PA) {
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, dataTex);
    for (let j = 0; j < 2; j++) {
      const src = PA[j];
      const buf = src.length === NTEX * 4 ? src : (() => { const b = new Float32Array(NTEX * 4); b.set(src); return b; })();
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, id * 2 + j, TEXW, TEXH, 1, gl.RGBA, gl.FLOAT, buf);
    }
  }
  const GENS = [
    [genPyrite, { dust: 0.06 }], [genFire, { dust: 0.06 }], [genTurbine, { dust: 0.06 }], [genCatalyst, { dust: 0.06 }],
    [genDrop, { dust: 0.07 }], [genNetwork, { dust: 0.06, dustCenter: [0, 0, -0.3] }], [genEpsom, { dust: 0.06 }],
    [genLDH, { dust: 0.06 }], [genRing, { dust: 0.08 }], [genLogoPlaceholder, { dust: 0.07 }], [genIntro, { dust: 0 }],
  ];
  GENS.forEach(([g, o], id) => upload(id, buildLayer(N, 1000 + id * 7919, g, o)));
  let readyResolve; const ready = new Promise(r => (readyResolve = r));
  {
    const img = new Image();
    img.onload = () => {
      try {
        const c2 = document.createElement('canvas'); c2.width = img.naturalWidth; c2.height = img.naturalHeight;
        const x = c2.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c2.width, c2.height);
        upload(9, buildLayer(N, 1000 + 9 * 7919, genLogo, { dust: 0.07, img: { w: d.width, h: d.height, data: d.data } }));
      } catch (e) { console.warn('[hgf] logo', e); }
      readyResolve();
    };
    img.onerror = () => readyResolve();
    img.src = LOGO_URL;
  }

  // 渲染目标
  const halfType = gl.HALF_FLOAT;
  function makeRT(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (hasFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, halfType, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h };
  }
  function freeRT(rt) { if (rt) { gl.deleteTexture(rt.tex); gl.deleteFramebuffer(rt.fbo); } }
  let W = 0, H = 0, scale = Math.min(opt.maxDpr, window.devicePixelRatio || 1), accum = null, mips = [];
  const LEVELS = 6;
  function resize() {
    const cw = Math.max(1, root.clientWidth), chh = Math.max(1, root.clientHeight);
    const w = Math.max(2, Math.round(cw * scale)), h = Math.max(2, Math.round(chh * scale));
    if (w === W && h === H) return;
    W = w; H = h; canvas.width = W; canvas.height = H;
    freeRT(accum); mips.forEach(freeRT); mips = [];
    accum = makeRT(W, H);
    let mw = W, mh = H;
    for (let i = 0; i < LEVELS; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); mips.push(makeRT(mw, mh)); }
  }
  resize();
  let api = null;
  const ro = new ResizeObserver(() => { const w0 = W, h0 = H; resize(); if ((W !== w0 || H !== h0) && !playing && alive && api) api.renderAt(time); }); ro.observe(root);

  // 静态 uniform
  gl.useProgram(pPart.p);
  const U = pPart.u;
  const flat = (arr, n) => { const out = new Float32Array(n * 3); arr.forEach((v, i) => out.set(v, i * 3)); return out; };
  gl.uniform3fv(U.uE0, flat(EDGES.map(e => e.p0), 8));
  gl.uniform3fv(U.uE1, flat(EDGES.map(e => e.p1), 8));
  gl.uniform3fv(U.uE2, flat(EDGES.map(e => e.p2), 8));
  gl.uniform3fv(U.uECol, flat(EDGES.map(e => e.col), 8));
  gl.uniform1fv(U.uEW, new Float32Array(EDGES.map(e => e.w)));
  gl.uniform1fv(U.uESt, new Float32Array(EDGES.map(e => e.st)));
  gl.uniform3fv(U.uNode, flat(NODES.map(n => n.p), 5));
  gl.uniform3fv(U.uNodeCol, flat(NODES.map(n => n.col), 5));
  gl.uniform1fv(U.uNodeR, new Float32Array(NODES.map(n => n.r)));
  gl.uniform1fv(U.uNodeOn, new Float32Array(NODES.map(n => n.on)));
  gl.uniform3fv(U.uDust, flat([
    [0.55, 0.42, 0.26], [0.7, 0.28, 0.08], [0.5, 0.56, 0.75], [0.6, 0.42, 0.24], [0.32, 0.5, 0.85],
    [0.35, 0.55, 0.75], [0.45, 0.6, 0.8], [0.35, 0.7, 0.55], [0.55, 0.55, 0.6], [0.4, 0.55, 0.7], [1.4, 1.35, 1.5],
  ].map(c => c.map(v => v * 0.09)), 11));
  gl.uniform1i(U.uData, 0);

  /* ---------- 渲染一帧 ---------- */
  let time = opt.start, alive = true, playing = opt.autoplay, last = 0, raf = 0, fadeIn = opt.start > 0 ? 1 : 0;
  const perf = { acc: 0, n: 0, checked: 0 };

  function frame(t, dt) {
    const st = timeline(t);
    const A = specOf(st.a), B = specOf(st.b);
    const wC = smooth((st.m - 0.04) / 0.92);
    const cam = camBlend(camAt(A.cam, st.ta), camAt(B.cam, st.tb), st.a === st.b ? 0 : wC);
    const asp = W / H;
    let d = cam.d * DIST_MUL;
    if (asp < 0.92) d *= Math.pow(0.92 / asp, 0.85);
    cam.az += 0.012 * Math.sin(t * 0.31) + 0.006 * Math.sin(t * 0.73);
    cam.el += 0.008 * Math.sin(t * 0.27 + 1.3);
    const ce = Math.cos(cam.el);
    const eye = [cam.t[0] + d * ce * Math.sin(cam.az), cam.t[1] + d * Math.sin(cam.el), cam.t[2] + d * ce * Math.cos(cam.az)];
    const fov = cam.fov * Math.PI / 180;
    const view = lookAt(eye, cam.t, [0, 1, 0]);
    const proj = perspective(fov, asp, 0.05, 60);
    const lens = LENS_SHIFT;
    const lookF = st.a === st.b ? 0 : wC;
    const la = A.look, lb = B.look;
    const trailBase = lerp(la.trail, lb.trail, lookF) + 0.24 * Math.sin(Math.PI * st.m);
    const decay = Math.pow(Math.min(0.92, trailBase), Math.max(0.25, dt * 60));
    const tr = B.tr || SEQ[0].tr;
    const heat = st.a === 0 ? smooth((st.ta - (SEQ[0].tin + SEQ[0].hold - 1.6)) / 2.6) : 0;
    fadeIn = Math.min(1, fadeIn + dt / 1.6);

    // 1) 拖影衰减
    gl.bindVertexArray(qvao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, accum.fbo);
    gl.viewport(0, 0, W, H);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.CONSTANT_ALPHA);
    gl.blendColor(0, 0, 0, decay);
    gl.useProgram(pFade.p);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) 粒子
    gl.bindVertexArray(vao);
    gl.useProgram(pPart.p);
    gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE);
    gl.blendColor(0, 0, 0, 1 - decay);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, dataTex);
    gl.uniform1i(U.uA, st.a); gl.uniform1i(U.uB, st.b);
    gl.uniform1f(U.uMix, st.a === st.b ? 0 : st.m);
    gl.uniform1f(U.uTA, st.ta); gl.uniform1f(U.uTB, st.tb);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uGain, 1.0);
    gl.uniformMatrix4fv(U.uView, false, view);
    gl.uniformMatrix4fv(U.uProj, false, proj);
    gl.uniform3fv(U.uCamPos, eye);
    const pxScale = H / (2 * Math.tan(fov / 2));
    gl.uniform1f(U.uPxScale, pxScale * SIZE_MUL);
    gl.uniform1f(U.uFocus, d);
    gl.uniform1f(U.uAperture, cam.ap);
    gl.uniform1f(U.uMaxSize, 56 * scale);
    gl.uniform1f(U.uMinSize, 1.35 * Math.max(1, scale * 0.8));
    gl.uniform1f(U.uLensShift, lens);
    gl.uniform3fv(U.uSweep, tr.sweep);
    gl.uniform3fv(U.uSweepC, [0, 0, 0]);
    gl.uniform1f(U.uSweepAmt, tr.amt);
    gl.uniform1f(U.uFlight, tr.flight);
    gl.uniform1f(U.uSwirl, tr.swirl);
    gl.uniform1f(U.uFlash, tr.flash);
    gl.uniform1f(U.uRadial, tr.radial || 0);
    gl.uniform1f(U.uLift, tr.lift || 0);
    gl.uniform1f(U.uHeat, heat);
    gl.drawArrays(gl.POINTS, 0, N);

    // 3) 辉光：下采样
    gl.bindVertexArray(qvao);
    gl.disable(gl.BLEND);
    gl.useProgram(pDown.p);
    gl.uniform1i(pDown.u.uTex, 0);
    let src = accum;
    for (let i = 0; i < LEVELS; i++) {
      const dst = mips[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(pDown.u.uTexel, 1 / src.w, 1 / src.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = dst;
    }
    // 上采样叠加
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(pUp.p);
    gl.uniform1i(pUp.u.uTex, 0);
    for (let i = LEVELS - 2; i >= 0; i--) {
      const dst = mips[i], s2 = mips[i + 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.bindTexture(gl.TEXTURE_2D, s2.tex);
      gl.uniform2f(pUp.u.uTexel, 1 / s2.w, 1 / s2.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);

    // 4) 合成
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(pComp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, accum.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mips[0].tex);
    gl.uniform1i(pComp.u.uScene, 0); gl.uniform1i(pComp.u.uBloom, 1);
    gl.uniform3fv(pComp.u.uBg0, lerp3(la.bg0, lb.bg0, lookF));
    gl.uniform3fv(pComp.u.uBg1, lerp3(la.bg1, lb.bg1, lookF));
    gl.uniform1f(pComp.u.uBloomStr, lerp(la.bloom, lb.bloom, lookF));
    gl.uniform1f(pComp.u.uExposure, 1.0);
    gl.uniform1f(pComp.u.uTime, t);
    gl.uniform1f(pComp.u.uFade, smooth(fadeIn));
    gl.uniform1f(pComp.u.uCA, 0.0025);
    gl.uniform1f(pComp.u.uLevels, LEVELS * 0.8);
    gl.uniform2f(pComp.u.uRes, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);

    // 5) 文字层
    updateCaptions(st);
    if (labels.length) {
      const vp = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r2 = 0; r2 < 4; r2++) {
        let s = 0; for (let k = 0; k < 4; k++) s += proj[k * 4 + r2] * view[c * 4 + k]; vp[c * 4 + r2] = s;
      }
      updateLabels(st, vp, root.clientWidth, root.clientHeight, lens);
    }
    if (opt.onFrame) opt.onFrame(t, st);
  }

  let visible = true;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { visible = es[0].isIntersecting; }) : null;
  if (io) io.observe(root);

  function loop(now) {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!playing || !visible || document.hidden) return;
    time += dt * opt.speed;
    frame(time, dt);
    // 自适应分辨率
    if (perf.checked < 2) {
      perf.acc += dt; perf.n++;
      if (perf.n >= 90) {
        const avg = perf.acc / perf.n;
        if (avg > 0.024 && scale > 0.75) { scale = Math.max(0.75, scale * 0.72); resize(); }
        perf.acc = 0; perf.n = 0; perf.checked++;
      }
    }
  }
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); alive = false; cancelAnimationFrame(raf); showFallback();
  });
  const reduce = opt.respectReducedMotion !== false && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce && opt.manual !== true) {
    playing = false;
    ready.then(() => { if (alive) api.renderAt(STARTS[9] + SEQ[9].tin + 4.0); });
  } else if (opt.manual !== true) raf = requestAnimationFrame(loop);

  api = {
    ready,
    get time() { return time; },
    get duration() { return PERIOD; },
    get particles() { return N; },
    play() { playing = true; },
    pause() { playing = false; },
    seek(t) { time = t; },
    // 确定性渲染（用于导出视频）：从 t-warm 以固定步长预热拖影后渲染 t
    renderAt(t, fps = 30, warm = 0.6) {
      fadeIn = t > 0.01 ? 1 : 0;
      const dt = 1 / fps;
      for (let x = Math.max(0, t - warm); x < t - 1e-6; x += dt) frame(x, dt);
      time = t; frame(t, dt);
    },
    step(dt) { time += dt; frame(time, dt); },
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); if (io) io.disconnect();
      freeRT(accum); mips.forEach(freeRT); gl.deleteTexture(dataTex);
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      root.remove();
    },
  };
  if (reduce && opt.manual !== true) raf = requestAnimationFrame(loop);
  return api;
}


/* 恒光标志（由原始标志提取的透明 PNG，用于粒子采样与降级显示） */
const LOGO_URL = '/login-film-logo.png';

export { mountHgxtFilm };
