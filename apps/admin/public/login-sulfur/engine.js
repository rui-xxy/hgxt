// ============================================================
//  恒光 · 衡阳基地 —— 动态设计短片  "以硫为源"
//  1920×1080 · 64s · 120 BPM (1 bar = 2s)
//  Engine: deterministic draw(t) on Canvas 2D
// ============================================================
const W = 1920, H = 1080, DUR = 64, BPM = 120, BEAT = 60 / BPM;

// ---- palette: blue & white ----
const COL = {
  paper: '#F5F8FC', white: '#FFFFFF',
  ink: '#0A1D3D', ink2: '#47597A', ink3: '#8D9CB6',
  blue: '#0A6CE0', deep: '#0B2F8C', navy: '#06173F',
  cyan: '#27B4F5', pale: '#D5E3F5', pale2: '#E9F0FA',
  green: '#4DB82B'
};
const F = {
  serif: '"Noto Serif CJK SC", serif',
  sans: '"Noto Sans CJK SC", sans-serif',
  num: '"Inter Display", "Inter", sans-serif',
  mono: '"DejaVu Sans Mono", monospace'
};

// ---- math / easing ----
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const E = {
  lin: t => t,
  inQ: t => t * t, outQ: t => 1 - (1 - t) * (1 - t),
  ioQ: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  inC: t => t * t * t, outC: t => 1 - Math.pow(1 - t, 3),
  ioC: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQuart: t => 1 - Math.pow(1 - t, 4),
  ioQuint: t => t < .5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2,
  outExpo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inExpo: t => t <= 0 ? 0 : Math.pow(2, 10 * t - 10),
  ioExpo: t => t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: t => { if (t <= 0) return 0; if (t >= 1) return 1; const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
const P = (t, a, b, e = E.lin) => e(clamp((t - a) / (b - a)));
// in-hold-out envelope
const env = (t, a, b, c, d, ei = E.outC, eo = E.inC) => t < a || t > d ? 0 : t < b ? ei(clamp((t - a) / (b - a))) : t <= c ? 1 : 1 - eo(clamp((t - c) / (d - c)));

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---- text ----
function font(o) { return `${o.w || 400} ${o.s || 24}px ${o.f || F.sans}`; }
function setT(ctx, o) {
  ctx.font = font(o); ctx.textAlign = o.a || 'left'; ctx.textBaseline = o.bl || 'alphabetic';
  ctx.letterSpacing = (o.ls || 0) + 'px'; ctx.fillStyle = o.c || COL.ink;
}
function T(ctx, str, x, y, o = {}) {
  if (o.al === 0) return;
  ctx.save(); setT(ctx, o); if (o.al != null) ctx.globalAlpha *= o.al;
  ctx.fillText(str, x, y); ctx.restore();
}
function MW(ctx, str, o) { ctx.save(); setT(ctx, o); const w = ctx.measureText(str).width - (o.ls || 0); ctx.restore(); return w; }
// mask-up reveal; p in 0..1 (eased internally)
function TUp(ctx, str, x, y, o, p, out = 0) {
  if (p <= 0 || out >= 1) return;
  const s = o.s || 24, e = E.outExpo(clamp(p)), w = MW(ctx, str, o);
  const x0 = o.a === 'center' ? x - w / 2 : o.a === 'right' ? x - w : x;
  ctx.save(); ctx.beginPath(); ctx.rect(x0 - 20, y - s * 1.2, w + 40, s * 1.55); ctx.clip();
  const oy = (1 - e) * s * 1.3 - E.inC(clamp(out)) * s * 1.3;
  T(ctx, str, x, y + oy, o); ctx.restore();
}
// per-character stagger (fade + rise + slight blur-less scale)
function TChars(ctx, str, x, y, o, t, t0, st = 0.035, dur = 0.55, rise = 0.5) {
  const chars = [...str]; ctx.save(); const baseA = ctx.globalAlpha; setT(ctx, { ...o, a: 'left' });
  const ls = o.ls || 0; let total = 0; const ws = chars.map(c => { const w = ctx.measureText(c).width; total += w; return w; });
  total -= ls;
  let cx = o.a === 'center' ? x - total / 2 : o.a === 'right' ? x - total : x;
  const s = o.s || 24;
  chars.forEach((c, i) => {
    const p = clamp((t - t0 - i * st) / dur);
    if (p > 0) {
      const e = E.outQuart(p);
      ctx.globalAlpha = baseA * (o.al == null ? 1 : o.al) * e;
      if (o.colFn) ctx.fillStyle = o.colFn(i, c);
      ctx.fillText(c, cx, y + (1 - e) * s * rise);
    }
    cx += ws[i];
  });
  ctx.restore();
}
function typeOn(str, p) { const n = Math.floor([...str].length * clamp(p)); return [...str].slice(0, n).join(''); }

// ---- chemical formula with subscripts:  H_2SO_4 , C_{16}H_{12}O_2 ----
function parseFormula(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    if (s[i] === '_') {
      i++;
      if (s[i] === '{') { const j = s.indexOf('}', i); out.push({ t: s.slice(i + 1, j), sub: 1 }); i = j + 1; }
      else { let j = i; while (j < s.length && /[0-9]/.test(s[j])) j++; if (j === i) j = i + 1; out.push({ t: s.slice(i, j), sub: 1 }); i = j; }
    } else { let j = i; while (j < s.length && s[j] !== '_') j++; out.push({ t: s.slice(i, j), sub: 0 }); i = j; }
  }
  return out;
}
function formulaW(ctx, s, o) {
  return parseFormula(s).reduce((w, p) => w + MW(ctx, p.t, { ...o, s: p.sub ? o.s * 0.6 : o.s }), 0);
}
function drawFormula(ctx, s, x, y, o) {
  const parts = parseFormula(s); const w = formulaW(ctx, s, o);
  let cx = o.a === 'center' ? x - w / 2 : o.a === 'right' ? x - w : x;
  for (const p of parts) {
    const so = { ...o, a: 'left', s: p.sub ? o.s * 0.6 : o.s };
    T(ctx, p.t, cx, y + (p.sub ? o.s * 0.2 : 0), so);
    cx += MW(ctx, p.t, so);
  }
  return w;
}

// ---- polylines / paths ----
function cubic(p0, p1, p2, p3, n = 32) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return pts;
}
function quad(p0, c, p1, n = 32) { return cubic(p0, [p0[0] + 2 / 3 * (c[0] - p0[0]), p0[1] + 2 / 3 * (c[1] - p0[1])], [p1[0] + 2 / 3 * (c[0] - p1[0]), p1[1] + 2 / 3 * (c[1] - p1[1])], p1, n); }
function withLen(pts) {
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, L, len: L[L.length - 1] };
}
function pointAt(pl, f) {
  const d = clamp(f) * pl.len; let i = 1; while (i < pl.L.length - 1 && pl.L[i] < d) i++;
  const a = pl.pts[i - 1], b = pl.pts[i], seg = (pl.L[i] - pl.L[i - 1]) || 1, u = (d - pl.L[i - 1]) / seg;
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), Math.atan2(b[1] - a[1], b[0] - a[0])];
}
function strokePartial(ctx, pl, f0, f1 = null) {
  // draws from f0..f1 if f1 given, else 0..f0
  let a = 0, b = f0; if (f1 != null) { a = f0; b = f1; }
  if (b <= a || b <= 0) return;
  const da = a * pl.len, db = b * pl.len;
  ctx.beginPath(); let started = false;
  for (let i = 0; i < pl.pts.length; i++) {
    const d = pl.L[i];
    if (d < da) continue;
    if (!started) { const p = pointAt(pl, a); ctx.moveTo(p[0], p[1]); started = true; }
    if (d > db) { const p = pointAt(pl, b); ctx.lineTo(p[0], p[1]); break; }
    ctx.lineTo(pl.pts[i][0], pl.pts[i][1]);
  }
  if (!started) { const p = pointAt(pl, a), q = pointAt(pl, b); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
  ctx.stroke();
}
// parse simple SVG path (M, L, C, Z — absolute) to polylines
function svgToPolys(d, n = 20) {
  const tok = d.match(/[MLCZ]|-?\d*\.?\d+/g); const polys = []; let cur = null, i = 0, pos = [0, 0], start = [0, 0], cmd = '';
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    if (/[MLCZ]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M') { pos = [num(), num()]; start = pos; cur = [pos]; polys.push(cur); cmd = 'L'; }
    else if (cmd === 'L') { pos = [num(), num()]; cur.push(pos); }
    else if (cmd === 'C') { const p1 = [num(), num()], p2 = [num(), num()], p3 = [num(), num()]; cubic(pos, p1, p2, p3, n).slice(1).forEach(p => cur.push(p)); pos = p3; }
    else if (cmd === 'Z') { cur.push(start); pos = start; }
  }
  return polys;
}

// ---- 3D cube ----
const CUBE_V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const CUBE_F = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 5, 1, 0], [3, 2, 6, 7], [1, 5, 6, 2], [4, 0, 3, 7]];
const CUBE_E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
function rot3(v, yaw, pitch, roll = 0) {
  let [x, y, z] = v, c, s;
  c = Math.cos(roll); s = Math.sin(roll); [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(yaw); s = Math.sin(yaw); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(pitch); s = Math.sin(pitch); [y, z] = [y * c - z * s, y * s + z * c];
  return [x, y, z];
}
// light from upper-left-front
function faceShade(n) { const L = [-0.45, -0.75, 0.5]; const l = Math.hypot(...L); return clamp((n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / l * 0.5 + 0.5); }
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp(pa >> 16, pb >> 16, t)), g = Math.round(lerp(pa >> 8 & 255, pb >> 8 & 255, t)), bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${g},${bl})`;
}
// draw solid/wire cube. o: {fill:0..1, wire:0..1, lw, edgeP (0..1 progressive edges), dark, light, stroke}
function drawCube(ctx, cx, cy, s, yaw, pitch, roll, o = {}) {
  const V = CUBE_V.map(v => rot3([v[0] * s, v[1] * s, v[2] * s], yaw, pitch, roll));
  const fill = o.fill ?? 1, wire = o.wire ?? 0;
  if (fill > 0) {
    const faces = CUBE_F.map(f => {
      const a = V[f[0]], b = V[f[1]], c = V[f[2]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [-(u[1] * w[2] - u[2] * w[1]), -(u[2] * w[0] - u[0] * w[2]), -(u[0] * w[1] - u[1] * w[0])]; const nl = Math.hypot(...n) || 1;
      return { f, n: n.map(x => x / nl), z: f.reduce((m, i) => m + V[i][2], 0) / 4 };
    }).filter(fc => fc.n[2] > 0).sort((a, b) => a.z - b.z);
    ctx.save(); ctx.globalAlpha *= fill;
    for (const fc of faces) {
      ctx.beginPath(); fc.f.forEach((i, k) => k ? ctx.lineTo(cx + V[i][0], cy + V[i][1]) : ctx.moveTo(cx + V[i][0], cy + V[i][1])); ctx.closePath();
      ctx.fillStyle = mixHex(o.dark || COL.deep, o.light || '#5AB0FA', faceShade(fc.n)); ctx.fill();
      if (o.seam) { ctx.strokeStyle = o.seam; ctx.lineWidth = o.seamW || 1; ctx.stroke(); }
    }
    ctx.restore();
  }
  if (wire > 0) {
    ctx.save(); ctx.globalAlpha *= wire; ctx.strokeStyle = o.stroke || COL.blue; ctx.lineWidth = o.lw || 2; ctx.lineCap = 'round';
    CUBE_E.forEach((e, k) => {
      const ep = o.edgeP == null ? 1 : clamp(o.edgeP * 12 - k * 0.55, 0, 1);
      if (ep <= 0) return;
      const a = V[e[0]], b = V[e[1]]; const back = (a[2] + b[2]) / 2 < -s * 0.2;
      ctx.globalAlpha = wire * (back ? 0.28 : 1);
      ctx.beginPath(); ctx.moveTo(cx + a[0], cy + a[1]); ctx.lineTo(cx + lerp(a[0], b[0], ep), cy + lerp(a[1], b[1], ep)); ctx.stroke();
    });
    ctx.restore();
  }
  return V;
}

// ---- background ----
function drawGrid(ctx, a = 1, col = '11,108,224', off = [0, 0]) {
  if (a <= 0) return;
  ctx.save(); ctx.lineWidth = 1;
  const ox = ((off[0] % 40) + 40) % 40, oy = ((off[1] % 40) + 40) % 40;
  ctx.strokeStyle = `rgba(${col},${0.045 * a})`; ctx.beginPath();
  for (let x = ox; x <= W; x += 40) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); }
  for (let y = oy; y <= H; y += 40) { ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); }
  ctx.stroke();
  const ox2 = ((off[0] % 200) + 200) % 200, oy2 = ((off[1] % 200) + 200) % 200;
  ctx.strokeStyle = `rgba(${col},${0.075 * a})`; ctx.beginPath();
  for (let x = ox2; x <= W; x += 200) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); }
  for (let y = oy2; y <= H; y += 200) { ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); }
  ctx.stroke();
  ctx.fillStyle = `rgba(${col},${0.32 * a})`;
  for (let x = ox2; x <= W; x += 200) for (let y = oy2; y <= H; y += 200) { ctx.fillRect(x - 4, y, 9, 1); ctx.fillRect(x, y - 4, 1, 9); }
  ctx.restore();
}
