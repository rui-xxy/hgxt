'use strict';
/* =====================================================================
   湖南恒光化工 · 15s Motion Showreel
   Deterministic canvas renderer: renderAt(frame) draws one frame.
   128 BPM → 1 bar = 1.875 s; every cut lands on the grid.
   ===================================================================== */
const W = 1920, H = 1080, FPS = 60, DUR = 15;
const BPM = 128, BEAT = 60 / BPM, BAR = BEAT * 4;
const T1 = BAR, T2 = BAR * 2, T3 = BAR * 3, T4 = BAR * 4, T5 = BAR * 5, T6 = BAR * 6, T7 = BAR * 6 + BEAT * 3;

/* ---------------- utils ---------------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const E = {
  lin: x => x,
  inCubic: x => x * x * x,
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inOutCubic: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outQuart: x => 1 - Math.pow(1 - x, 4),
  inQuart: x => x * x * x * x,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  inOutExpo: x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outBack: (x, s = 1.70158) => { const c3 = s + 1; return 1 + c3 * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); },
  outElastic: x => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
};
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; }
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------------- palette ---------------- */
const C = {
  bg: '#030915', green: '#6CC833', lime: '#9BE04A', teal: '#00B08A', cyan: '#1FC6EA', blue: '#0A84E0',
  navy: '#26359E', deep: '#0A1838', white: '#F2F7FF', sulfur: '#FFD21F', amber: '#FFB01F'
};
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; }
function mixHex(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; }
const BRAND = ['#86D63A', '#1DB46E', '#00A9B5', '#0A84E0', '#2D45C0'];
function brandAt(t) { t = clamp(t) * (BRAND.length - 1); const i = Math.min(BRAND.length - 2, Math.floor(t)); return mixHex(BRAND[i], BRAND[i + 1], t - i); }
function brandGrad(ctx, x0, y0, x1, y1, a = 1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  BRAND.forEach((c, i) => { const [r, gg, b] = hexRgb(c); g.addColorStop(i / (BRAND.length - 1), `rgba(${r},${gg},${b},${a})`); });
  return g;
}

/* ---------------- fonts ---------------- */
const F = {
  cn: (s, w = 900) => `${w} ${s}px "Noto Sans CJK SC"`,
  num: (s, w = 900) => `${w} ${s}px "Inter Display"`,
  lat: (s, w = 600) => `${w} ${s}px "Inter"`,
  mono: (s) => `${s}px "DejaVu Sans Mono"`,
};

/* ---------------- canvases ---------------- */
const main = document.getElementById('c');
const ctxM = main.getContext('2d');
function mk(w = W, h = H) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const layer = mk(), lctx = layer.getContext('2d');
const tmp = mk(), tctx = tmp.getContext('2d');
const bl1 = mk(W / 4, H / 4), bl2 = mk(W / 8, H / 8);
const logoC = mk(1200, 860), logoX = logoC.getContext('2d');
const noiseC = mk(512, 512);
(function () {
  const nx = noiseC.getContext('2d'), id = nx.createImageData(512, 512), r = rng(7);
  for (let i = 0; i < id.data.length; i += 4) { const v = Math.floor(r() * 255); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  nx.putImageData(id, 0, 0);
})();
let noisePat = null;

const IMG = {};
let META = null;
function loadImg(k, src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => { IMG[k] = im; res(); }; im.onerror = rej; im.src = src; }); }

/* ---------------- text helpers ---------------- */
function richParts(str) {
  const parts = []; let i = 0;
  while (i < str.length) {
    if (str[i] === '_') { let j = i + 1; while (j < str.length && /[0-9]/.test(str[j])) j++; parts.push({ t: str.slice(i + 1, j), sub: true }); i = j; }
    else { let j = i; while (j < str.length && str[j] !== '_') j++; parts.push({ t: str.slice(i, j), sub: false }); i = j; }
  }
  return parts;
}
function drawRich(ctx, str, x, y, size, fontFn, align = 'left', measureOnly = false) {
  const parts = richParts(str); const ws = [];
  let w = 0;
  for (const p of parts) { ctx.font = fontFn(p.sub ? size * 0.6 : size); const m = ctx.measureText(p.t).width; ws.push(m); w += m; }
  if (measureOnly) return w;
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const sa = ctx.textAlign; ctx.textAlign = 'left';
  parts.forEach((p, k) => { ctx.font = fontFn(p.sub ? size * 0.6 : size); ctx.fillText(p.t, cx, y + (p.sub ? size * 0.2 : 0)); cx += ws[k]; });
  ctx.textAlign = sa; return w;
}
// per-character rise-in reveal through a mask
function revealText(ctx, text, x, y, size, font, t, t0, o = {}) {
  const stagger = o.stagger ?? 0.035, dur = o.dur ?? 0.5, align = o.align || 'left', spacing = o.spacing ?? 0;
  const rise = o.rise ?? 1.05, ease = o.ease || E.outExpo;
  ctx.font = font;
  const chars = [...text], ws = chars.map(ch => ctx.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  if (o.measure) return total;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.save();
  if (o.clip !== false) { ctx.beginPath(); ctx.rect(cx - size, y - size * 1.08, total + size * 2, size * 1.42); ctx.clip(); }
  ctx.textAlign = 'left'; ctx.fillStyle = o.fill || C.white;
  const ga = o.alpha ?? 1;
  chars.forEach((ch, i) => {
    const p = ease(prog(t, t0 + i * stagger, t0 + i * stagger + dur));
    if (p > 0) { ctx.globalAlpha = ga * clamp(p * 1.6); ctx.fillText(ch, cx, y + (1 - p) * size * rise); }
    cx += ws[i] + spacing;
  });
  ctx.restore();
  return total;
}
// typewriter
function typeText(ctx, text, x, y, font, t, t0, cps, o = {}) {
  const chars = [...text]; const n = Math.floor(clamp((t - t0) * cps, 0, chars.length));
  ctx.font = font; ctx.fillStyle = o.fill || C.white; ctx.textAlign = o.align || 'left';
  const s = chars.slice(0, n).join('');
  ctx.fillText(s, x, y);
  if (t > t0 && (n < chars.length || Math.floor(t * 4) % 2 === 0) && (o.cursor !== false)) {
    const full = ctx.measureText(text).width, w = ctx.measureText(s).width;
    const sx = o.align === 'center' ? x - full / 2 + w : x + w;
    ctx.fillStyle = o.cursorColor || C.cyan; const fs = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)[1]);
    ctx.fillRect(sx + 4, y - fs * 0.82, fs * 0.5, fs * 0.95);
  }
}
// right-aligned counter in a fixed box so units never jitter
function drawCounter(ctx, value, finalValue, x, y, size, fontFn) {
  ctx.font = fontFn(size);
  const box = ctx.measureText(String(finalValue)).width;
  ctx.textAlign = 'right'; ctx.fillText(String(value), x + box, y); ctx.textAlign = 'left';
  return box;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function hexPath(ctx, x, y, r, rot = -Math.PI / 2) { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = rot + k * TAU / 6; k ? ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a)); } ctx.closePath(); }
function glowDot(ctx, x, y, r, col, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(0.25, rgba(col, a * 0.45)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/* ---------------- global motion ---------------- */
const IMPACTS = [{ t: 0.469, a: 14, d: 0.4 }, { t: T2, a: 26, d: 0.55 }, { t: T4, a: 7, d: 0.3 }, { t: T5, a: 12, d: 0.35 }, { t: T6, a: 12, d: 0.3 }, { t: T7, a: 16, d: 0.6 }];
function shake(t) {
  let x = 0, y = 0;
  for (const s of IMPACTS) { const dt = t - s.t; if (dt >= 0 && dt < s.d) { const k = s.a * Math.pow(1 - dt / s.d, 2); x += noise1(dt * 38 + s.t * 10) * k; y += noise1(dt * 38 + s.t * 10 + 50) * k; } }
  const k = 2.5 * kick(t); x += noise1(t * 55) * k; y += noise1(t * 55 + 9) * k;
  return [x, y];
}
function kick(t) { if (t < T2 || t >= T7) return 0; const b = (t - T2) / BEAT; return Math.exp(-(b - Math.floor(b)) * BEAT * 11); }
const FLASHES = [{ t: 0.469, a: 0.5, d: 0.28 }, { t: T2, a: 0.85, d: 0.32 }, { t: T5, a: 0.28, d: 0.22 }, { t: T7, a: 1.0, d: 0.55 }];

/* ---------------- background ---------------- */
const GLOWS = [
  [[960, 500, 760, C.blue, .22], [260, 940, 620, C.teal, .10]],
  [[1520, 300, 820, C.blue, .20], [300, 820, 620, C.green, .10]],
  [[1300, 620, 900, C.teal, .17], [200, 180, 620, C.blue, .12]],
  [[1400, 440, 720, C.amber, .13], [300, 820, 700, C.blue, .14]],
  [[960, 560, 820, C.cyan, .16], [1650, 900, 600, C.green, .10]],
  [[960, 548, 720, C.green, .14], [1700, 200, 640, C.blue, .14]],
  [[480, 480, 720, C.blue, .16], [1400, 540, 720, C.teal, .12]],
  [[640, 530, 760, C.cyan, .20], [1350, 520, 820, C.green, .09]],
];
const BOUNDS = [0, T1, T2, T3, T4, T5, T6, T7, DUR + 1];
function sceneWeight(i, t) {
  const a = BOUNDS[i], b = BOUNDS[i + 1];
  return (i === 0 ? 1 : E.inOutCubic(prog(t, a - 0.2, a + 0.2))) * (1 - E.inOutCubic(prog(t, b - 0.2, b + 0.2)));
}
function drawBG(ctx, t) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const intro = E.outCubic(prog(t, 0.35, 1.2));
  GLOWS.forEach((gs, i) => {
    const w = sceneWeight(i, t) * (i === 0 ? intro : 1); if (w <= 0.001) return;
    gs.forEach(([x, y, r, col, a], k) => {
      const xx = x + noise1(t * 0.35 + k * 4 + i) * 90, yy = y + noise1(t * 0.3 + k * 7 + i * 3) * 70;
      const g = ctx.createRadialGradient(xx, yy, 0, xx, yy, r);
      g.addColorStop(0, rgba(col, a * w)); g.addColorStop(0.5, rgba(col, a * w * 0.35)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(xx - r, yy - r, r * 2, r * 2);
    });
  });
  ctx.globalCompositeOperation = 'source-over';
  // drifting dot grid
  const ga = 0.07 * intro * (1 - 0.5 * sceneWeight(7, t));
  if (ga > 0) {
    ctx.fillStyle = `rgba(160,210,255,${ga})`;
    const sp = 48, ox = (t * 14) % sp, oy = (t * 6) % sp;
    for (let y = -sp + oy; y < H + sp; y += sp) for (let x = -sp + ox; x < W + sp; x += sp) ctx.fillRect(x, y, 2, 2);
  }
}

/* =====================================================================
   SCENE 0 · 2008 落子衡阳
   ===================================================================== */
const S0 = (() => {
  const r = rng(11), parts = [];
  for (let i = 0; i < 170; i++) {
    const a = r() * TAU, sp = 300 + Math.pow(r(), 1.6) * 1700;
    parts.push({ a, sp, life: 0.45 + r() * 0.8, w: 1 + r() * 2.5, c: r() < 0.25 ? C.white : brandAt(r()), yk: 0.35 + r() * 0.3 });
  }
  const reels = [...'2008'].map((d, i) => { const seq = []; const rr = rng(100 + i); for (let k = 0; k < 14 + i * 3; k++) seq.push(Math.floor(rr() * 10)); seq.push(+d); return seq; });
  return { parts, reels };
})();
function reelPos(i, u) {
  const n = S0.reels[i].length - 1, land = 0.70 + i * 0.0586;
  return n * E.outBack(prog(u, 0.47, land), 1.2);
}
function scene0(ctx, u, t) {
  const cx = 960, cy = 470;
  const up = E.inOutCubic(prog(u, 0.94, 1.32));
  const gy = cy - 70 * up, gs = lerp(1, 0.84, up);

  /* radar */
  const ra = E.outCubic(prog(u, 0.45, 1.25));
  if (ra > 0) {
    ctx.save(); ctx.translate(cx, cy + 30);
    for (let i = 1; i <= 7; i++) {
      const rr = i * 118 * lerp(0.55, 1, ra);
      ctx.strokeStyle = rgba(C.cyan, 0.11 * ra * (1 - i / 9)); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = rgba(C.cyan, 0.08 * ra); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-900, 0); ctx.lineTo(900, 0); ctx.moveTo(0, -600); ctx.lineTo(0, 600); ctx.stroke();
    ctx.save(); ctx.rotate(u * 0.5); ctx.setLineDash([3, 13]); ctx.strokeStyle = rgba(C.cyan, 0.3 * ra); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 440, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    // tick ring
    ctx.save(); ctx.rotate(-u * 0.25); ctx.strokeStyle = rgba(C.white, 0.18 * ra); ctx.lineWidth = 1.5;
    for (let k = 0; k < 72; k++) { const a = k * TAU / 72, l = k % 6 === 0 ? 16 : 7; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 560, Math.sin(a) * 560); ctx.lineTo(Math.cos(a) * (560 - l), Math.sin(a) * (560 - l)); ctx.stroke(); }
    ctx.restore();
    // sweep
    ctx.save(); ctx.rotate(u * 2.6 - 1);
    const g = ctx.createConicGradient(0, 0, 0);
    g.addColorStop(0, rgba(C.cyan, 0)); g.addColorStop(0.82, rgba(C.cyan, 0)); g.addColorStop(0.995, rgba(C.cyan, 0.16 * ra)); g.addColorStop(1, rgba(C.cyan, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 820, 0, TAU); ctx.fill();
    ctx.restore();
    // coordinates
    const ca = E.outCubic(prog(u, 1.15, 1.45));
    ctx.globalAlpha = ca; ctx.font = F.mono(18); ctx.fillStyle = rgba(C.cyan, 0.85); ctx.textAlign = 'left';
    ctx.fillText('112.6°E', 600, -14); ctx.textAlign = 'right'; ctx.fillText('26.9°N', -600, -14);
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* shock ring + burst */
  const sp = prog(u, 0.469, 1.25);
  if (sp > 0 && sp < 1) {
    const rr = 1500 * E.outExpo(sp);
    ctx.strokeStyle = rgba(C.white, 0.55 * (1 - sp)); ctx.lineWidth = 3 + 10 * (1 - sp);
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(C.cyan, 0.4 * (1 - sp)); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, rr * 0.72, 0, TAU); ctx.stroke();
  }
  const bt = u - 0.469;
  if (bt > 0 && bt < 1.4) {
    ctx.lineCap = 'round';
    for (const p of S0.parts) {
      if (bt > p.life) continue;
      const k = 3.2, d = p.sp * (1 - Math.exp(-k * bt)) / k, v = p.sp * Math.exp(-k * bt);
      const dx = Math.cos(p.a), dy = Math.sin(p.a) * p.yk;
      const x = cx + dx * d, y = cy + dy * d, tail = Math.min(v * 0.045, 160);
      ctx.strokeStyle = p.c; ctx.globalAlpha = (1 - bt / p.life);
      ctx.lineWidth = p.w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * tail, y - dy * tail); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }

  /* ignition dot + anamorphic line */
  if (u < 0.75) {
    const p1 = prog(u, 0.10, 0.469);
    const flick = u < 0.469 ? clamp(u / 0.08) * (0.75 + 0.25 * Math.sin(u * 95)) : 1 - prog(u, 0.469, 0.75);
    glowDot(ctx, cx, cy, 40 + 260 * E.inExpo(p1), C.cyan, 0.9 * flick);
    glowDot(ctx, cx, cy, 14 + 30 * p1, C.white, flick);
    const lw = W * 1.2 * E.inExpo(p1) + 30;
    const lg = ctx.createLinearGradient(cx - lw / 2, 0, cx + lw / 2, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, `rgba(255,255,255,${flick})`); lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg; ctx.fillRect(cx - lw / 2, cy - 2, lw, 4);
    const lg2 = ctx.createLinearGradient(cx - lw / 2, 0, cx + lw / 2, 0);
    lg2.addColorStop(0, rgba(C.cyan, 0)); lg2.addColorStop(0.5, rgba(C.cyan, 0.35 * flick)); lg2.addColorStop(1, rgba(C.cyan, 0));
    ctx.fillStyle = lg2; ctx.fillRect(cx - lw / 2, cy - 14, lw, 28);
  }

  /* "2008" slot reels revealed through an opening slit */
  const open = E.outExpo(prog(u, 0.469, 0.78));
  if (open > 0) {
    ctx.save();
    ctx.translate(cx, gy); ctx.scale(gs, gs);
    const size = 330; ctx.font = F.num(size);
    const cw = ctx.measureText('0').width * 0.98, lineH = size * 0.86;
    const total = cw * 4, x0 = -total / 2;
    const slitH = lineH * 1.15 * open;
    // echo outline
    const ea = E.outCubic(prog(u, 0.95, 1.4));
    if (ea > 0) {
      ctx.save(); ctx.scale(1.06 + 0.04 * u, 1.06 + 0.04 * u); ctx.strokeStyle = rgba(C.cyan, 0.22 * ea); ctx.lineWidth = 1.5;
      ctx.textAlign = 'center'; for (let i = 0; i < 4; i++) ctx.strokeText('2008'[i], x0 + cw * (i + 0.5), size * 0.36); ctx.restore();
    }
    ctx.beginPath(); ctx.rect(-total, -slitH / 2, total * 2, slitH); ctx.clip();
    const grad = ctx.createLinearGradient(0, -size * 0.4, 0, size * 0.4);
    grad.addColorStop(0, '#FFFFFF'); grad.addColorStop(0.55, '#E8F7FF'); grad.addColorStop(1, '#7FD8F5');
    ctx.textAlign = 'center';
    for (let i = 0; i < 4; i++) {
      const pos = reelPos(i, u), vel = (pos - reelPos(i, u - 1 / 60));
      const seq = S0.reels[i], xc = x0 + cw * (i + 0.5);
      const base = Math.floor(pos);
      const blur = Math.min(Math.abs(vel), 1.1);
      for (let k = base - 1; k <= base + 2; k++) {
        if (k < 0 || k >= seq.length) continue;
        const yy = (k - pos) * lineH + size * 0.36;
        ctx.fillStyle = grad;
        if (blur > 0.03) {
          const n = 7;
          for (let g2 = 0; g2 < n; g2++) { ctx.globalAlpha = 1.7 / n; ctx.fillText(seq[k], xc, yy + (g2 / (n - 1) - 0.5) * blur * lineH); }
        } else { ctx.globalAlpha = 1; ctx.fillText(seq[k], xc, yy); }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // slit edges
    const ea2 = 1 - prog(u, 0.6, 0.95);
    if (ea2 > 0) {
      ctx.fillStyle = rgba(C.white, 0.9 * ea2);
      const hw = 900 * open;
      ctx.fillRect(cx - hw, gy - slitH * gs / 2 - 1, hw * 2, 2); ctx.fillRect(cx - hw, gy + slitH * gs / 2 - 1, hw * 2, 2);
    }
  }
  // SINCE label
  const sa = E.outCubic(prog(u, 0.82, 1.12));
  if (sa > 0) {
    ctx.save(); ctx.globalAlpha = sa; ctx.font = F.lat(22, 600); ctx.letterSpacing = `${lerp(30, 14, sa)}px`; ctx.fillStyle = C.cyan; ctx.textAlign = 'center';
    ctx.fillText('SINCE', cx + 7, gy - 190 * gs); ctx.restore();
  }
  // 落子衡阳
  const tg = ctx.createLinearGradient(700, 0, 1220, 0); tg.addColorStop(0, '#FFFFFF'); tg.addColorStop(0.55, '#FFFFFF'); tg.addColorStop(1, '#7FE3FF');
  revealText(ctx, '落子衡阳', cx, gy + 222, 96, F.cn(96), u, 1.0, { align: 'center', spacing: 18, stagger: 0.06, fill: tg });
  // location line
  if (u > 1.18) {
    ctx.save(); ctx.letterSpacing = '6px';
    typeText(ctx, '湖南 · 衡阳松木经济开发区', cx, gy + 292, F.cn(32, 500), u, 1.18, 34, { align: 'center', fill: 'rgba(220,235,255,0.82)' });
    ctx.restore();
    // pin marker
    const pa = E.outBack(prog(u, 1.22, 1.5), 2);
    if (pa > 0) {
      const px = cx, py = gy + 345;
      ctx.save(); ctx.translate(px, py); ctx.scale(pa, pa);
      ctx.strokeStyle = rgba(C.cyan, 0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.stroke();
      ctx.fillStyle = C.cyan; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill();
      const rp = (u * 1.4) % 1; ctx.strokeStyle = rgba(C.cyan, 0.6 * (1 - rp)); ctx.beginPath(); ctx.arc(0, 0, 9 + 30 * rp, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
}

/* ---------------- pixel wipe (logo motif) ---------------- */
const WIPE = (() => {
  const cell = 80, cols = 24, rows = 14, r = rng(5), cells = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const st = 1.66 + 0.21 * (i / (cols - 1)) + 0.05 * ((rows - 1 - j) / (rows - 1)) + 0.04 * r();
    cells.push({ i, j, st, col: mixHex(brandAt((1 - i / (cols - 1)) * 0.55 + (j / (rows - 1)) * 0.45).replace(/rgb\((\d+),(\d+),(\d+)\)/, (m, r, g, b) => '#' + [r, g, b].map(v => (+v).toString(16).padStart(2, '0')).join('')), '#061226', 0.42 + 0.25 * r()) });
  }
  return { cell, cols, rows, cells, cover: 0.09, hold: 0.03, unc: 0.10 };
})();
function wipeClip(ctx, t) {
  ctx.beginPath();
  for (const c of WIPE.cells) if (t < c.st + WIPE.cover) ctx.rect(c.i * WIPE.cell, c.j * WIPE.cell, WIPE.cell, WIPE.cell);
  ctx.clip();
}
function wipeSquares(ctx, t) {
  if (t < 1.6 || t > 2.2) return;
  for (const c of WIPE.cells) {
    let s = 0;
    const a = c.st, b = a + WIPE.cover, d = b + WIPE.hold, e = d + WIPE.unc;
    if (t >= a && t < b) s = E.outCubic(prog(t, a, b)); else if (t >= b && t < d) s = 1; else if (t >= d && t < e) s = 1 - E.inCubic(prog(t, d, e));
    if (s <= 0) continue;
    const sz = WIPE.cell * s, x = c.i * WIPE.cell + (WIPE.cell - sz) / 2, y = c.j * WIPE.cell + (WIPE.cell - sz) / 2;
    ctx.fillStyle = c.col; ctx.fillRect(x, y, sz + 0.5, sz + 0.5); if (s > 0.6) { ctx.fillStyle = 'rgba(190,240,255,0.35)'; ctx.fillRect(x, y, sz, 2); }
  }
}

/* =====================================================================
   SCENE 1 · 上市公司 301118.SZ  (split-flap board)
   ===================================================================== */
const S1 = (() => {
  const digits = '301118', cells = [];
  for (let i = 0; i < 6; i++) {
    const r = rng(40 + i), fs = 0.10 + i * 0.03, settle = 0.36 + i * 0.085, FL = 0.05;
    const n = Math.max(1, Math.floor((settle - fs) / FL)), seq = [];
    for (let k = 0; k < n; k++) seq.push(String(Math.floor(r() * 10)));
    seq.push(digits[i]);
    cells.push({ fs, settle, FL, seq, n });
  }
  return { cells, w: 140, h: 200, gap: 14 };
})();
function ticker(ctx, y, ang, off, a, text, col) {
  if (a <= 0) return;
  ctx.save(); ctx.translate(960, y); ctx.rotate(ang);
  const bw = 2400 * a;
  ctx.fillStyle = rgba(col, 0.10); ctx.fillRect(-bw / 2, -30, bw, 60);
  ctx.fillStyle = rgba(col, 0.45); ctx.fillRect(-bw / 2, -30, bw, 1.5); ctx.fillRect(-bw / 2, 28.5, bw, 1.5);
  ctx.beginPath(); ctx.rect(-bw / 2, -30, bw, 60); ctx.clip();
  ctx.font = F.cn(24, 700); ctx.fillStyle = 'rgba(225,240,255,0.6)'; ctx.textAlign = 'left';
  const tw = ctx.measureText(text).width;
  let x = -1300 + (((off % tw) + tw) % tw) - tw;
  while (x < 1300) { ctx.fillText(text, x, 9); x += tw; }
  ctx.restore();
}
function flapDigit(ctx, d, cx, cy, half, sy, shade) {
  const w = S1.w, h = S1.h;
  ctx.save();
  ctx.beginPath(); if (half === 'top') ctx.rect(cx - w / 2, cy - h / 2, w, h / 2); else ctx.rect(cx - w / 2, cy, w, h / 2); ctx.clip();
  ctx.translate(cx, cy); ctx.scale(1, sy);
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#16294F'); g.addColorStop(0.5, '#0E1D3C'); g.addColorStop(1, '#0A1630');
  ctx.fillStyle = g; roundRect(ctx, -w / 2, -h / 2, w, h, 14); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.font = F.num(150); ctx.textAlign = 'center';
  ctx.fillText(d, 0, 54);
  if (shade > 0) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(-w / 2, -h / 2, w, h); }
  ctx.restore();
}
function scene1(ctx, u, t) {
  // ghost numerals
  ctx.save(); ctx.font = F.num(560); ctx.textAlign = 'center'; ctx.strokeStyle = rgba(C.cyan, 0.07); ctx.lineWidth = 2;
  ctx.strokeText('301118', 960 - u * 60, 800); ctx.restore();
  // tickers
  const ta = E.outExpo(prog(u, 0.0, 0.5));
  ticker(ctx, 205, -3 * DEG, -u * 280, ta, '301118.SZ    ◆    恒光股份    ◆    HENGGUANG    ◆    衡阳基地    ◆    ', C.blue);
  ticker(ctx, 900, -3 * DEG, u * 240, ta, '硫化工    ◆    新材料    ◆    新能源材料    ◆    绿色制造    ◆    循环经济    ◆    ', C.teal);

  // label
  const la = prog(u, 0.08, 0.42);
  if (la > 0) {
    ctx.save(); ctx.font = F.cn(46); ctx.textAlign = 'center';
    const tw = ctx.measureText('上市公司 · 恒光股份旗下企业').width;
    const wx = 960 - tw / 2 - 20 + (tw + 40) * E.outCubic(la);
    ctx.beginPath(); ctx.rect(960 - tw / 2 - 20, 360, wx - (960 - tw / 2 - 20), 80); ctx.clip();
    ctx.fillStyle = C.white; ctx.fillText('上市公司 · 恒光股份旗下企业', 960, 422);
    ctx.restore();
    if (la < 1) { ctx.fillStyle = C.cyan; ctx.fillRect(wx - 3, 368, 6, 68); }
  }

  // flap board
  const totalW = 6 * S1.w + 5 * S1.gap + 28 + 230, x0 = (W - totalW) / 2, cy = 590;
  for (let i = 0; i < 6; i++) {
    const c = S1.cells[i], cx = x0 + i * (S1.w + S1.gap) + S1.w / 2;
    const pa = E.outBack(prog(u, 0.02 + i * 0.035, 0.32 + i * 0.035), 1.8);
    if (pa <= 0) continue;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(lerp(0.6, 1, pa), lerp(0.6, 1, pa)); ctx.globalAlpha = clamp(pa * 1.4); ctx.translate(-cx, -cy);
    const k = Math.floor((u - c.fs) / c.FL);
    if (u < c.fs) { flapDigit(ctx, c.seq[0], cx, cy, 'top', 1, 0); flapDigit(ctx, c.seq[0], cx, cy, 'bot', 1, 0); }
    else if (k >= c.n) { flapDigit(ctx, c.seq[c.n], cx, cy, 'top', 1, 0); flapDigit(ctx, c.seq[c.n], cx, cy, 'bot', 1, 0); }
    else {
      const cur = c.seq[k], nxt = c.seq[k + 1], f = ((u - c.fs) % c.FL) / c.FL;
      flapDigit(ctx, nxt, cx, cy, 'top', 1, 0);
      flapDigit(ctx, cur, cx, cy, 'bot', 1, 0.15);
      if (f < 0.5) flapDigit(ctx, cur, cx, cy, 'top', 1 - f * 2, f * 0.9);
      else flapDigit(ctx, nxt, cx, cy, 'bot', (f - 0.5) * 2, (1 - f) * 0.9);
    }
    // hinge + frame
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(cx - S1.w / 2, cy - 1.5, S1.w, 3);
    ctx.fillStyle = '#2A3E66'; ctx.fillRect(cx - S1.w / 2 - 3, cy - 7, 6, 14); ctx.fillRect(cx + S1.w / 2 - 3, cy - 7, 6, 14);
    const glow = Math.exp(-Math.max(0, u - c.settle) * 7) * (u >= c.settle ? 1 : 0);
    ctx.strokeStyle = rgba(C.cyan, 0.22 + 0.75 * glow); ctx.lineWidth = 1.5 + 2 * glow;
    roundRect(ctx, cx - S1.w / 2, cy - S1.h / 2, S1.w, S1.h, 14); ctx.stroke();
    ctx.restore();
  }
  // light sweep across settled board
  const sw = prog(u, 0.92, 1.35);
  if (sw > 0 && sw < 1) {
    ctx.save(); roundRect(ctx, x0, cy - S1.h / 2, 6 * S1.w + 5 * S1.gap, S1.h, 14); ctx.clip();
    const sx = lerp(x0 - 200, x0 + 1100, E.inOutCubic(sw));
    const g = ctx.createLinearGradient(sx - 120, 0, sx + 120, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(160,235,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.translate(sx, cy); ctx.transform(1, 0, -0.35, 1, 0, 0); ctx.translate(-sx, -cy); ctx.fillRect(sx - 120, cy - 120, 240, 240);
    ctx.restore();
  }
  // .SZ tag
  const tp = E.outBack(prog(u, 0.66, 0.98), 2.2);
  if (tp > 0) {
    const tx = x0 + 6 * S1.w + 5 * S1.gap + 28, tw = 230;
    ctx.save(); ctx.translate(tx + tw / 2, cy); ctx.rotate((1 - tp) * -12 * DEG); ctx.scale(tp, tp);
    const g = ctx.createLinearGradient(-tw / 2, -100, tw / 2, 100); g.addColorStop(0, '#1DB46E'); g.addColorStop(0.5, '#00A9B5'); g.addColorStop(1, '#0A6FD0');
    ctx.fillStyle = g; roundRect(ctx, -tw / 2, -S1.h / 2, tw, S1.h, 16); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.font = F.num(112); ctx.textAlign = 'center'; ctx.fillText('.SZ', 0, 40);
    ctx.restore();
  }
  // sub line
  revealText(ctx, '湖南恒光科技股份有限公司　衡阳基地重要制造主体', 960, 768, 30, F.cn(30, 500), u, 0.95, { align: 'center', stagger: 0.012, dur: 0.4, fill: 'rgba(215,232,255,0.78)', spacing: 2 });
}

/* =====================================================================
   SCENE 2 · 约300亩 衡阳生产基地 (isometric plant)
   ===================================================================== */
const ISO = { x: 1268, y: 292, s: 45 };
function isoP(gx, gy, gz) { return [ISO.x + (gx - gy) * ISO.s * 0.866, ISO.y + (gx + gy) * ISO.s * 0.5 - gz * ISO.s]; }
function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }
function shadeHex(h, k) { const [r, g, b] = hexRgb(h); return `rgb(${Math.round(clamp(r * k, 0, 255))},${Math.round(clamp(g * k, 0, 255))},${Math.round(clamp(b * k, 0, 255))})`; }
function isoBox(ctx, b, h, u) {
  const { x: gx, y: gy, w, d, col } = b; if (h <= 0.01) return;
  const P = isoP;
  const p0 = P(gx + w, gy, 0), p1 = P(gx + w, gy + d, 0), p2 = P(gx + w, gy + d, h), p3 = P(gx + w, gy, h);
  let g = ctx.createLinearGradient(0, p1[1], 0, p2[1]); g.addColorStop(0, shadeHex(col, 0.35)); g.addColorStop(1, shadeHex(col, 0.62));
  ctx.fillStyle = g; poly(ctx, [p0, p1, p2, p3]); ctx.fill();
  const q0 = P(gx, gy + d, 0), q1 = P(gx + w, gy + d, 0), q2 = P(gx + w, gy + d, h), q3 = P(gx, gy + d, h);
  g = ctx.createLinearGradient(0, q1[1], 0, q2[1]); g.addColorStop(0, shadeHex(col, 0.5)); g.addColorStop(1, shadeHex(col, 0.88));
  ctx.fillStyle = g; poly(ctx, [q0, q1, q2, q3]); ctx.fill();
  // windows on the left face
  if (b.win && h > 0.8) {
    const rows = Math.floor(h / 0.55);
    for (let r = 0; r < rows; r++) for (let c = 0; c < Math.floor(w / 0.5); c++) {
      const on = hash(r * 13 + c * 7 + b.x * 3) > 0.35 ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(u * 6 + r + c * 2 + b.y)) : 0.1;
      const z0 = 0.3 + r * 0.55, x0 = gx + 0.22 + c * 0.5;
      ctx.fillStyle = `rgba(150,230,255,${0.55 * on})`;
      poly(ctx, [P(x0, gy + d, z0), P(x0 + 0.26, gy + d, z0), P(x0 + 0.26, gy + d, z0 + 0.24), P(x0, gy + d, z0 + 0.24)]); ctx.fill();
    }
  }
  const t0 = P(gx, gy, h), t1 = P(gx + w, gy, h), t2 = P(gx + w, gy + d, h), t3 = P(gx, gy + d, h);
  g = ctx.createLinearGradient(t0[0], t0[1], t2[0], t2[1]); g.addColorStop(0, shadeHex(col, 1.35)); g.addColorStop(1, shadeHex(col, 1.0));
  ctx.fillStyle = g; poly(ctx, [t0, t1, t2, t3]); ctx.fill();
  ctx.strokeStyle = 'rgba(210,245,255,0.55)'; ctx.lineWidth = 1.2; poly(ctx, [t0, t1, t2, t3]); ctx.stroke();
  ctx.strokeStyle = 'rgba(210,245,255,0.25)'; ctx.beginPath(); ctx.moveTo(...q1); ctx.lineTo(...q2); ctx.stroke();
}
function isoCyl(ctx, c, h, u) {
  if (h <= 0.01) return;
  const [bx, by] = isoP(c.x, c.y, 0), [tx, ty] = isoP(c.x, c.y, h);
  const rx = c.r * ISO.s * 1.2247, ry = c.r * ISO.s * 0.7071;
  const g = ctx.createLinearGradient(bx - rx, 0, bx + rx, 0);
  g.addColorStop(0, shadeHex(c.col, 0.55)); g.addColorStop(0.35, shadeHex(c.col, 1.05)); g.addColorStop(0.7, shadeHex(c.col, 0.6)); g.addColorStop(1, shadeHex(c.col, 0.3));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI); ctx.lineTo(tx - rx, ty); ctx.ellipse(tx, ty, rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
  // bands
  ctx.strokeStyle = 'rgba(200,240,255,0.22)'; ctx.lineWidth = 1.2;
  for (let z = 0.6; z < h - 0.2; z += c.band || 0.9) { const [ex, ey] = isoP(c.x, c.y, z); ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI); ctx.stroke(); }
  const tg = ctx.createLinearGradient(tx - rx, ty - ry, tx + rx, ty + ry); tg.addColorStop(0, shadeHex(c.col, 1.45)); tg.addColorStop(1, shadeHex(c.col, 0.95));
  ctx.fillStyle = tg; ctx.beginPath(); ctx.ellipse(tx, ty, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(210,245,255,0.6)'; ctx.stroke();
  if (c.beacon) { const on = 0.5 + 0.5 * Math.sin(u * 9); glowDot(ctx, tx, ty - 6, 26, C.cyan, 0.7 * on); }
}
const PLANT = [
  { k: 'box', x: 1.2, y: 1.4, w: 3.0, d: 2.2, h: 2.6, col: '#0E8FB0', at: 0.05, win: true },
  { k: 'cyl', x: 6.4, y: 2.2, r: 0.85, h: 5.4, col: '#13A7C9', at: 0.28, beacon: true, band: 0.8 },
  { k: 'cyl', x: 7.9, y: 1.6, r: 0.55, h: 3.6, col: '#139AB8', at: 0.36, band: 0.7 },
  { k: 'box', x: 9.0, y: 1.0, w: 2.0, d: 2.6, h: 2.2, col: '#1B5FC8', at: 0.47, win: true },
  { k: 'box', x: 1.4, y: 5.6, w: 3.2, d: 2.4, h: 2.0, col: '#1F4FB8', at: 0.47, win: true, tag: 'power' },
  { k: 'cyl', x: 8.6, y: 5.6, r: 1.0, h: 1.8, col: '#1DB46E', at: 0.70, band: 0.6 },
  { k: 'cyl', x: 10.6, y: 5.0, r: 0.8, h: 1.6, col: '#1DB46E', at: 0.76, band: 0.6 },
  { k: 'cyl', x: 9.6, y: 7.6, r: 0.9, h: 1.7, col: '#36B85A', at: 0.82, band: 0.6 },
  { k: 'box', x: 5.6, y: 8.0, w: 2.2, d: 2.0, h: 1.3, col: '#2A3FA8', at: 0.94, win: true, tag: 'dcs' },
  { k: 'box', x: 1.8, y: 9.2, w: 2.4, d: 1.8, h: 1.6, col: '#0C86C2', at: 0.94, win: true },
  { k: 'box', x: 5.0, y: 4.6, w: 1.6, d: 1.8, h: 3.2, col: '#0A6FD0', at: 0.70, win: true },
].map(b => ({ ...b, key: b.k === 'cyl' ? b.x + b.y : b.x + b.w / 2 + b.y + b.d / 2 })).sort((a, b) => a.key - b.key);
const PIPES = [
  [[0.6, 4.7], [11.4, 4.7]],
  [[7.5, 0.6], [7.5, 11.4]],
  [[4.6, 8.9], [4.6, 4.7]],
  [[2.8, 3.6], [2.8, 4.7]],
];
function scene2(ctx, u, t) {
  /* platform slab */
  const N = 12, slab = E.outExpo(prog(u, 0.0, 0.45));
  if (slab > 0) {
    const a = P => isoP(...P);
    ctx.globalAlpha = slab;
    const L0 = isoP(0, N, 0), L1 = isoP(N, N, 0), L2 = isoP(N, N, -0.5), L3 = isoP(0, N, -0.5);
    let g = ctx.createLinearGradient(0, L0[1], 0, L2[1] + 30); g.addColorStop(0, '#123A6A'); g.addColorStop(1, '#071628');
    ctx.fillStyle = g; poly(ctx, [L0, L1, L2, L3]); ctx.fill();
    const R0 = isoP(N, 0, 0), R1 = isoP(N, N, 0), R2 = isoP(N, N, -0.5), R3 = isoP(N, 0, -0.5);
    g = ctx.createLinearGradient(0, R0[1], 0, R2[1]); g.addColorStop(0, '#0D2C55'); g.addColorStop(1, '#050F1E');
    ctx.fillStyle = g; poly(ctx, [R0, R1, R2, R3]); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // tiles ripple
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const d = Math.hypot(i + 0.5 - 6, j + 0.5 - 6);
    const a = E.outCubic(prog(u, 0.02 + d * 0.028, 0.22 + d * 0.028));
    if (a <= 0) continue;
    const lift = (1 - a) * 0.8;
    const pts = [isoP(i, j, -lift), isoP(i + 1, j, -lift), isoP(i + 1, j + 1, -lift), isoP(i, j + 1, -lift)];
    ctx.fillStyle = (i + j) % 2 ? `rgba(14,60,110,${0.55 * a})` : `rgba(10,44,86,${0.55 * a})`;
    poly(ctx, pts); ctx.fill();
    ctx.strokeStyle = rgba(C.cyan, 0.22 * a); ctx.lineWidth = 1; ctx.stroke();
  }
  // perimeter glow line
  const pe = E.inOutCubic(prog(u, 0.25, 0.8));
  if (pe > 0) {
    const pts = [isoP(0, 0, 0), isoP(N, 0, 0), isoP(N, N, 0), isoP(0, N, 0), isoP(0, 0, 0)];
    let tot = 0; const segs = []; for (let k = 0; k < 4; k++) { const l = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); segs.push(l); tot += l; }
    ctx.strokeStyle = rgba(C.cyan, 0.95); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(...pts[0]);
    let rem = tot * pe;
    for (let k = 0; k < 4 && rem > 0; k++) { const f = Math.min(1, rem / segs[k]); ctx.lineTo(lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f)); rem -= segs[k]; }
    ctx.stroke();
  }
  // pipes (ground level racks)
  const pa = E.outCubic(prog(u, 0.55, 0.9));
  if (pa > 0) {
    ctx.lineCap = 'round';
    for (const p of PIPES) {
      const a = isoP(p[0][0], p[0][1], 0.35), b = isoP(lerp(p[0][0], p[1][0], pa), lerp(p[0][1], p[1][1], pa), 0.35);
      ctx.strokeStyle = 'rgba(20,90,150,0.9)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      ctx.strokeStyle = rgba(C.cyan, 0.75); ctx.lineWidth = 2; ctx.setLineDash([10, 26]); ctx.lineDashOffset = -u * 220; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.lineCap = 'butt';
  }
  // buildings
  for (const b of PLANT) {
    const p = prog(u, b.at, b.at + 0.38);
    const h = b.h * E.outBack(p, 1.5);
    if (b.k === 'box') isoBox(ctx, b, h, u); else isoCyl(ctx, b, h, u);
    // dust ring on landing
    if (p > 0 && p < 1) {
      const [x, y] = b.k === 'box' ? isoP(b.x + b.w / 2, b.y + b.d / 2, 0) : isoP(b.x, b.y, 0);
      ctx.strokeStyle = rgba(C.cyan, 0.5 * (1 - p)); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, 40 + 120 * p, (40 + 120 * p) * 0.577, 0, 0, TAU); ctx.stroke();
    }
  }
  // callouts
  const CALL = [
    { at: 0.86, p: isoP(6.4, 2.2, 5.6), dx: 70, dy: -36, text: '硫酸装置' },
    { at: 1.02, p: isoP(1.4 + 1.6, 5.6 + 1.2, 2.1), dx: -90, dy: -110, text: '余热发电', left: true },
    { at: 1.18, p: isoP(5.6 + 1.1, 8.0 + 1.0, 1.4), dx: 80, dy: 90, text: 'DCS 中控' },
  ];
  for (const c of CALL) {
    const a = prog(u, c.at, c.at + 0.3); if (a <= 0) continue;
    const [x, y] = c.p, mx = x + c.dx, my = y + c.dy, ex = mx + (c.left ? -150 : 150);
    const e = E.outCubic(a);
    ctx.strokeStyle = 'rgba(235,248,255,0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y);
    const f1 = clamp(e * 2), f2 = clamp(e * 2 - 1);
    ctx.lineTo(lerp(x, mx, f1), lerp(y, my, f1)); if (f2 > 0) ctx.lineTo(lerp(mx, ex, f2), my); ctx.stroke();
    ctx.fillStyle = C.white; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
    const rp = (u * 1.6 + c.at) % 1; ctx.strokeStyle = rgba(C.cyan, 0.8 * (1 - rp)); ctx.beginPath(); ctx.arc(x, y, 4 + 18 * rp, 0, TAU); ctx.stroke();
    if (f2 > 0) {
      ctx.globalAlpha = f2; ctx.font = F.cn(26, 700); ctx.fillStyle = C.white; ctx.textAlign = c.left ? 'right' : 'left';
      ctx.fillText(c.text, c.left ? mx - 6 : mx + 6, my - 12); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
  }

  /* left copy */
  const X = 150;
  ctx.save();
  const la = E.outCubic(prog(u, 0.1, 0.4));
  ctx.globalAlpha = la; ctx.font = F.cn(40, 500); ctx.fillStyle = 'rgba(220,235,255,0.85)'; ctx.fillText('约', X + 6, 352);
  ctx.globalAlpha = 1;
  const v = Math.round(300 * E.outExpo(prog(u, 0.10, 1.0)));
  if (u > 0.1) {
    const g = ctx.createLinearGradient(0, 380, 0, 560); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#6FE0FF');
    ctx.fillStyle = g; const bw = drawCounter(ctx, v, 300, X - 6, 560, 250, F.num);
    ctx.font = F.cn(100); ctx.fillStyle = C.white; ctx.globalAlpha = E.outCubic(prog(u, 0.35, 0.6)); ctx.fillText('亩', X + bw + 14, 556); ctx.globalAlpha = 1;
  }
  const lw = 560 * E.outExpo(prog(u, 0.3, 0.9));
  ctx.fillStyle = brandGrad(ctx, X, 0, X + 560, 0); ctx.fillRect(X, 600, lw, 4);
  revealText(ctx, '衡阳生产基地', X, 690, 64, F.cn(64), u, 0.42, { stagger: 0.04 });
  revealText(ctx, '硫化工新材料 · 新能源材料 研发与生产', X, 748, 28, F.cn(28, 500), u, 0.6, { stagger: 0.012, fill: 'rgba(215,232,255,0.75)' });
  ctx.restore();
}

/* =====================================================================
   Molecule (H2SO4) — shared by scene 3 and scene 4 (match cut)
   ===================================================================== */
const MOL = (() => {
  const k = 1 / Math.sqrt(3);
  const add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, s) => a.map(v => v * s), nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
  const O = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(v => mul(v, k));
  const Hs = [add(O[0], mul(nrm(add(O[0], [0.5, -0.9, 0.3])), 0.62)), add(O[1], mul(nrm(add(O[1], [-0.7, 0.2, 0.8])), 0.62))];
  const atoms = [{ p: [0, 0, 0], el: 'S', r: 50 }, ...O.map(p => ({ p, el: 'O', r: 36 })), ...Hs.map(p => ({ p, el: 'H', r: 22 }))];
  const bonds = [[0, 1, 1], [0, 2, 1], [0, 3, 2], [0, 4, 2], [1, 5, 1], [2, 6, 1]];
  return { atoms, bonds };
})();
const ATOM_COL = { S: ['#FFF6B8', '#FFD21F', '#7A5600', '#3A2800'], O: ['#C4F6FF', '#1FB8E8', '#06306E', '#FFFFFF'], H: ['#FFFFFF', '#DCE6F2', '#5E6F86', '#1A2738'] };
function molRot(t) { return [t * 1.25 + 0.6, 0.38 + 0.22 * Math.sin(t * 0.8)]; }
function drawMolecule(ctx, cx, cy, sc, t, appear = () => 1, alpha = 1) {
  const [ry, rx] = molRot(t), L = 128 * sc, f = 5.5;
  const cyA = Math.cos(ry), syA = Math.sin(ry), cxA = Math.cos(rx), sxA = Math.sin(rx);
  const pr = MOL.atoms.map((a, i) => {
    let [x, y, z] = a.p;
    let x1 = x * cyA + z * syA, z1 = -x * syA + z * cyA;
    let y2 = y * cxA - z1 * sxA, z2 = y * sxA + z1 * cxA;
    const s = f / (f + z2);
    return { x: cx + x1 * L * s, y: cy + y2 * L * s, z: z2, s, a, ap: appear(i) };
  });
  const items = [];
  MOL.bonds.forEach(([i, j, o]) => items.push({ z: (pr[i].z + pr[j].z) / 2 + 0.01, bond: [i, j, o] }));
  pr.forEach((p, i) => items.push({ z: p.z, atom: i }));
  items.sort((a, b) => b.z - a.z);
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round';
  for (const it of items) {
    if (it.bond) {
      const [i, j, o] = it.bond, A = pr[i], B = pr[j];
      const ap = Math.min(A.ap, B.ap); if (ap <= 0.01) continue;
      const bx = lerp(A.x, B.x, ap), by = lerp(A.y, B.y, ap);
      const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
      g.addColorStop(0, ATOM_COL[A.a.el][1]); g.addColorStop(1, ATOM_COL[B.a.el][1]);
      ctx.strokeStyle = g; ctx.lineWidth = 9 * sc * (A.s + B.s) / 2;
      if (o === 2) {
        const dx = B.y - A.y, dy = A.x - B.x, l = Math.hypot(dx, dy) || 1, off = 7 * sc;
        for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(A.x + dx / l * off * sgn, A.y + dy / l * off * sgn); ctx.lineTo(bx + dx / l * off * sgn, by + dy / l * off * sgn); ctx.stroke(); }
      } else { ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(bx, by); ctx.stroke(); }
    } else {
      const p = pr[it.atom]; if (p.ap <= 0.01) continue;
      const r = p.a.r * sc * p.s * E.outBack(clamp(p.ap), 2.2), cols = ATOM_COL[p.a.el];
      if (r <= 0.5) continue;
      const g = ctx.createRadialGradient(p.x - r * 0.38, p.y - r * 0.42, r * 0.05, p.x, p.y, r);
      g.addColorStop(0, cols[0]); g.addColorStop(0.45, cols[1]); g.addColorStop(1, cols[2]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.2; ctx.stroke();
      if (sc > 0.5) { ctx.fillStyle = cols[3]; ctx.font = F.lat(r * 0.85, 800); ctx.textAlign = 'center'; ctx.fillText(p.a.el, p.x, p.y + r * 0.3); ctx.textAlign = 'left'; }
    }
  }
  ctx.restore();
}

/* =====================================================================
   SCENE 3 · 30万吨/年 硫铁矿制酸平台
   ===================================================================== */
const S3 = (() => { const r = rng(77), sp = []; for (let i = 0; i < 70; i++) sp.push({ x: 900 + r() * 1100, s: 60 + r() * 220, o: r() * 2000, w: 1 + r() * 2.5, a: 0.3 + r() * 0.6 }); return { sp }; })();
const MOL3 = { x: 1380, y: 440, s: 1.0 }, MOL4 = { x: 960, y: 560, s: 0.44 };
function molState3(u) {
  const m = E.inOutCubic(prog(u, 1.66, BAR));
  return { x: lerp(MOL3.x, MOL4.x, m), y: lerp(MOL3.y, MOL4.y, m), s: lerp(MOL3.s, MOL4.s, m) };
}
function scene3(ctx, u, t) {
  const out = E.inCubic(prog(u, 1.62, 1.84));
  // rising sulfur sparks
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const p of S3.sp) {
    const y = H + 40 - ((u * p.s + p.o) % (H + 80));
    ctx.fillStyle = rgba(hash(p.o) > 0.5 ? C.sulfur : C.amber, p.a * 0.5 * (1 - out) * clamp(u * 3));
    ctx.fillRect(p.x + Math.sin(u * 2 + p.o) * 20, y, p.w, p.w * 3);
  }
  ctx.restore();

  // orbit rings around molecule
  const ms = molState3(u);
  const oa = E.outCubic(prog(u, 0.15, 0.6)) * (1 - out);
  if (oa > 0) {
    ctx.save(); ctx.translate(ms.x, ms.y);
    for (let k = 0; k < 2; k++) {
      ctx.save(); ctx.rotate((k ? 28 : -32) * DEG + u * (k ? 0.4 : -0.3)); ctx.scale(1, 0.32);
      ctx.setLineDash([6, 12]); ctx.lineDashOffset = -u * 60; ctx.strokeStyle = rgba(k ? C.sulfur : C.cyan, 0.35 * oa); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, 300 * lerp(0.6, 1, oa), 0, TAU); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }
  // molecule (atoms pop on the beat)
  const app = i => prog(u, i === 0 ? 0.10 : i <= 4 ? 0.20 + (i - 1) * 0.06 : 0.50 + (i - 5) * 0.06, (i === 0 ? 0.10 : i <= 4 ? 0.20 + (i - 1) * 0.06 : 0.50 + (i - 5) * 0.06) + 0.3);
  glowDot(ctx, ms.x, ms.y, 260 * ms.s, C.sulfur, 0.16 * clamp(u * 3));
  drawMolecule(ctx, ms.x, ms.y, ms.s, t, app);

  ctx.save();
  ctx.globalAlpha = 1 - out; ctx.translate(-160 * out, 0);
  // periodic tile
  const pt = E.outBack(prog(u, 0.24, 0.55), 1.6);
  if (pt > 0) {
    ctx.save(); ctx.translate(1080, 240); ctx.scale(pt, pt); ctx.rotate((1 - pt) * 10 * DEG);
    ctx.fillStyle = 'rgba(255,210,31,0.10)'; ctx.strokeStyle = rgba(C.sulfur, 0.85); ctx.lineWidth = 2;
    roundRect(ctx, -70, -82, 140, 164, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.sulfur; ctx.font = F.mono(20); ctx.fillText('16', -56, -54);
    ctx.font = F.lat(78, 800); ctx.textAlign = 'center'; ctx.fillText('S', 0, 22);
    ctx.font = F.cn(24, 700); ctx.fillStyle = C.white; ctx.fillText('硫', 0, 56);
    ctx.font = F.mono(15); ctx.fillStyle = 'rgba(255,230,150,0.85)'; ctx.fillText('32.06', 0, 76);
    ctx.restore();
  }
  // left copy
  const X = 150;
  ctx.save(); ctx.globalAlpha *= E.outCubic(prog(u, 0.02, 0.3)); ctx.font = F.lat(20, 700); ctx.letterSpacing = '8px'; ctx.fillStyle = C.sulfur;
  ctx.fillText('PYRITE  →  SULFURIC ACID', X, 300); ctx.restore();
  if (u > 0.04) {
    const v = Math.round(30 * E.outExpo(prog(u, 0.04, 0.75)));
    const g = ctx.createLinearGradient(0, 330, 0, 540); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#FFD84A');
    ctx.fillStyle = g; const bw = drawCounter(ctx, v, 30, X - 10, 540, 280, F.num);
    ctx.save(); ctx.globalAlpha *= E.outCubic(prog(u, 0.28, 0.55)); ctx.font = F.cn(76); ctx.fillStyle = C.white; ctx.fillText('万吨/年', X + bw + 18, 536); ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,210,31,0.9)'; ctx.fillRect(X, 578, 520 * E.outExpo(prog(u, 0.25, 0.8)), 4);
  revealText(ctx, '硫铁矿制酸平台', X, 664, 62, F.cn(62), u, 0.36, { stagger: 0.035 });
  revealText(ctx, '以硫酸生产为核心 · 多装置协同生产', X, 718, 28, F.cn(28, 500), u, 0.55, { stagger: 0.012, fill: 'rgba(225,235,255,0.75)' });

  // process chain
  const nodes = [['FeS_2', '硫铁矿'], ['SO_2', '二氧化硫'], ['SO_3', '三氧化硫'], ['H_2SO_4', '硫酸']], steps = ['焙烧', '转化', '吸收'];
  const ny = 852, nx0 = 260, ndx = 466, lit = [0.30, 0.54, 0.77, 1.01];
  const la = E.outCubic(prog(u, 0.22, 0.5));
  ctx.globalAlpha *= la;
  // base line + flow
  ctx.strokeStyle = 'rgba(120,170,230,0.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(nx0, ny); ctx.lineTo(nx0 + ndx * 3, ny); ctx.stroke();
  const fl = clamp((u - lit[0]) / (lit[3] - lit[0]));
  const fg = ctx.createLinearGradient(nx0, 0, nx0 + ndx * 3, 0); fg.addColorStop(0, C.sulfur); fg.addColorStop(0.5, C.amber); fg.addColorStop(1, C.cyan);
  ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(nx0, ny); ctx.lineTo(nx0 + ndx * 3 * fl, ny); ctx.stroke();
  for (let k = 0; k < 14 && fl > 0; k++) { const px = nx0 + ((u * 420 + k * 101) % (ndx * 3 * fl + 1)); glowDot(ctx, px, ny, 10, C.white, 0.7); }
  steps.forEach((s, i) => {
    const a = E.outCubic(prog(u, lit[i] + 0.1, lit[i] + 0.3)); if (a <= 0) return;
    const x = nx0 + ndx * (i + 0.5);
    ctx.save(); ctx.globalAlpha *= a; ctx.font = F.cn(22, 500); ctx.fillStyle = 'rgba(255,225,130,0.95)'; ctx.textAlign = 'center'; ctx.fillText(s, x, ny - 18);
    ctx.fillStyle = 'rgba(255,225,130,0.95)'; ctx.beginPath(); ctx.moveTo(x + 10, ny); ctx.lineTo(x - 4, ny - 7); ctx.lineTo(x - 4, ny + 7); ctx.closePath(); ctx.fill(); ctx.restore();
  });
  nodes.forEach(([f, cn], i) => {
    const x = nx0 + ndx * i, p = E.outBack(prog(u, lit[i], lit[i] + 0.28), 2);
    if (p <= 0) return;
    const glow = Math.exp(-Math.max(0, u - lit[i]) * 5);
    ctx.save(); ctx.translate(x, ny); ctx.scale(p, p);
    ctx.fillStyle = '#0B1A33'; ctx.strokeStyle = i === 3 ? C.cyan : C.sulfur; ctx.lineWidth = 2 + 3 * glow;
    roundRect(ctx, -92, -40, 184, 80, 40); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.white; drawRich(ctx, f, 0, 14, 40, s => F.lat(s, 700), 'center');
    ctx.font = F.cn(22, 500); ctx.fillStyle = 'rgba(210,225,250,0.8)'; ctx.textAlign = 'center'; ctx.fillText(cn, 0, 76);
    ctx.restore();
    if (glow > 0.02) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowDot(ctx, x, ny, 160, i === 3 ? C.cyan : C.sulfur, 0.35 * glow); ctx.restore(); }
  });
  ctx.restore();
}

/* =====================================================================
   SCENE 4 · 硫化工产业链
   ===================================================================== */
const PROD = [
  { name: '2-乙基蒽醌', glyph: 'aq', ang: -165 },
  { name: '氨基磺酸', glyph: 'H_3NSO_3', ang: -100 },
  { name: '硫酸镁', glyph: 'MgSO_4', ang: -35 },
  { name: '镁铝水滑石', glyph: 'LDH', ang: 20 },
  { name: '焦磷酸哌嗪', glyph: 'P_2O_7', ang: 145 },
].map((p, i) => ({ ...p, x: 960 + 560 * Math.cos(p.ang * DEG), y: 560 + 300 * Math.sin(p.ang * DEG), at: 0.16 + i * 0.12 }));
function aqGlyph(ctx, x, y, r) {
  ctx.lineWidth = 2; ctx.strokeStyle = C.white;
  for (let k = -1; k <= 1; k++) { hexPath(ctx, x + k * r * Math.sqrt(3), y, r); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y - r - 8); ctx.moveTo(x, y + r); ctx.lineTo(x, y + r + 8);
  const ex = x + 1.5 * r * Math.sqrt(3), ey = y - r / 2;
  ctx.moveTo(ex + r * 0.0, ey); ctx.lineTo(ex + 9, ey - 6); ctx.lineTo(ex + 17, ey); ctx.stroke();
  ctx.font = F.lat(11, 700); ctx.fillStyle = C.cyan; ctx.textAlign = 'center'; ctx.fillText('O', x, y - r - 11); ctx.fillText('O', x, y + r + 20);
}
function bez(a, c, b, t) { const m = 1 - t; return [m * m * a[0] + 2 * m * t * c[0] + t * t * b[0], m * m * a[1] + 2 * m * t * c[1] + t * t * b[1]]; }
function scene4(ctx, u, t) {
  // hex lattice
  const ha = E.outCubic(prog(u, -0.1, 0.5));
  if (ha > 0) {
    ctx.save(); ctx.translate(960, 560); ctx.rotate(u * 0.05); ctx.strokeStyle = rgba(C.cyan, 0.05 * ha); ctx.lineWidth = 1;
    const r = 56, dx = r * Math.sqrt(3);
    for (let j = -7; j <= 7; j++) for (let i = -11; i <= 11; i++) { const x = i * dx + (j % 2 ? dx / 2 : 0), y = j * r * 1.5; hexPath(ctx, x, y, r); ctx.stroke(); }
    ctx.restore();
  }
  const cx = MOL4.x, cy = MOL4.y;
  // links
  PROD.forEach((p, i) => {
    const a = E.inOutCubic(prog(u, p.at - 0.08, p.at + 0.2)); if (a <= 0) return;
    const ang = Math.atan2(p.y - cy, p.x - cx), A = [cx + Math.cos(ang) * 130, cy + Math.sin(ang) * 130];
    const B = [p.x - Math.cos(ang) * 74, p.y - Math.sin(ang) * 74];
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, nx = -(B[1] - A[1]), ny = (B[0] - A[0]), nl = Math.hypot(nx, ny);
    const Cp = [mx + nx / nl * 50 * (i % 2 ? 1 : -1), my + ny / nl * 50 * (i % 2 ? 1 : -1)];
    ctx.strokeStyle = brandGrad(ctx, A[0], A[1], B[0], B[1], 0.85); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(...A); for (let k = 1; k <= 40; k++) { const q = bez(A, Cp, B, k / 40 * a); ctx.lineTo(...q); } ctx.stroke();
    if (a >= 1) for (let k = 0; k < 3; k++) { const q = bez(A, Cp, B, ((u * 0.9 + k / 3 + i * 0.13) % 1)); glowDot(ctx, q[0], q[1], 14, C.white, 0.8); }
  });
  // hub
  const hr = E.outExpo(prog(u, 0.0, 0.35));
  ctx.save(); ctx.translate(cx, cy);
  ctx.strokeStyle = rgba(C.cyan, 0.9); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 118, -Math.PI / 2, -Math.PI / 2 + TAU * hr); ctx.stroke();
  ctx.rotate(u * 0.8); ctx.setLineDash([2, 10]); ctx.strokeStyle = rgba(C.white, 0.5 * hr); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 142, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  drawMolecule(ctx, cx, cy, MOL4.s, t);
  ctx.save(); ctx.globalAlpha = E.outCubic(prog(u, 0.12, 0.4));
  ctx.font = F.cn(34); ctx.fillStyle = C.white; ctx.textAlign = 'center'; ctx.fillText('硫酸', cx, cy + 192);
  ctx.font = F.lat(16, 700); ctx.letterSpacing = '5px'; ctx.fillStyle = C.cyan; ctx.fillText('CORE', cx + 3, cy + 220);
  ctx.restore();
  // product nodes
  PROD.forEach((p, i) => {
    const s = E.outBack(prog(u, p.at, p.at + 0.3), 2.2); if (s <= 0) return;
    const pulse = prog(u, p.at, p.at + 0.6);
    if (pulse < 1) { ctx.strokeStyle = rgba(C.cyan, 0.7 * (1 - pulse)); ctx.lineWidth = 2; hexPath(ctx, p.x, p.y, 64 + 70 * E.outCubic(pulse)); ctx.stroke(); }
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s); ctx.rotate((1 - s) * 0.6);
    const g = ctx.createLinearGradient(0, -64, 0, 64); g.addColorStop(0, '#11264A'); g.addColorStop(1, '#081329');
    ctx.fillStyle = g; hexPath(ctx, 0, 0, 64); ctx.fill();
    ctx.strokeStyle = brandGrad(ctx, -64, -64, 64, 64); ctx.lineWidth = 3; ctx.stroke();
    if (p.glyph === 'aq') aqGlyph(ctx, -4, 2, 13);
    else { ctx.fillStyle = C.white; drawRich(ctx, p.glyph, 0, 9, p.glyph.length > 6 ? 22 : 26, z => F.lat(z, 700), 'center'); }
    ctx.restore();
    // label
    const la = prog(u, p.at + 0.1, p.at + 0.4);
    if (la > 0) {
      ctx.save(); ctx.font = F.mono(15); ctx.fillStyle = rgba(C.cyan, la); ctx.textAlign = 'center'; ctx.fillText('0' + (i + 1), p.x, p.y + 92);
      ctx.restore();
      revealText(ctx, p.name, p.x, p.y + 130, 32, F.cn(32), u, p.at + 0.12, { align: 'center', stagger: 0.02, dur: 0.4 });
    }
  });
  // title
  revealText(ctx, '硫化工产业链', 150, 228, 64, F.cn(64), u, 0.05, { stagger: 0.04 });
  revealText(ctx, '以硫酸为核心 · 延伸精细化工', 150, 282, 28, F.cn(28, 500), u, 0.25, { stagger: 0.012, fill: 'rgba(215,232,255,0.75)' });
}

/* =====================================================================
   SCENE 5 · 循环经济 / 6000kW 余热发电
   ===================================================================== */
const LOOP = [
  { t: '余热发电', en: 'WASTE-HEAT POWER' },
  { t: '稀硫酸回收利用', en: 'DILUTE ACID REUSE' },
  { t: 'CO_2资源化利用', en: 'CO2 UTILIZATION' },
  { t: '焙烧渣 → 铁精粉', en: 'CINDER TO IRON CONCENTRATE' },
  { t: '跨车间热能循环', en: 'HEAT INTEGRATION' },
];
function scene5(ctx, u, t) {
  const cx = 960, cy = 548, R = 270;
  const k = kick(t);
  // turbine blades
  const ta = E.outCubic(prog(u, 0.0, 0.4));
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(u * 5.5);
  ctx.fillStyle = rgba(C.cyan, 0.07 * ta);
  for (let b = 0; b < 14; b++) {
    ctx.save(); ctx.rotate(b * TAU / 14);
    ctx.beginPath(); ctx.moveTo(30, 0); ctx.quadraticCurveTo(120, -40, 215, -18); ctx.lineTo(215, 4); ctx.quadraticCurveTo(120, -10, 30, 14); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // decorative rings
  ctx.save(); ctx.translate(cx, cy);
  ctx.rotate(-u * 0.5); ctx.setLineDash([3, 9]); ctx.strokeStyle = rgba(C.white, 0.25 * ta); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, R + 52, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.rotate(u * 0.9);
  ctx.strokeStyle = rgba(C.cyan, 0.3 * ta);
  for (let i = 0; i < 120; i++) { const a = i * TAU / 120, l = i % 10 === 0 ? 14 : 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (R - 34), Math.sin(a) * (R - 34)); ctx.lineTo(Math.cos(a) * (R - 34 - l), Math.sin(a) * (R - 34 - l)); ctx.stroke(); }
  ctx.restore();
  // track
  ctx.strokeStyle = 'rgba(80,130,200,0.18)'; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  // segments
  const LP = [
    [960, 548 - 365, 'center'], [960 + 440, 548 - 90, 'left'], [960 + 290, 548 + 330, 'left'], [960 - 290, 548 + 330, 'right'], [960 - 440, 548 - 90, 'right'],
  ];
  LOOP.forEach((s, i) => {
    const mid = -90 + i * 72, a0 = (mid - 31) * DEG, span = 62 * DEG;
    const p = E.outCubic(prog(u, 0.04 + i * 0.1, 0.36 + i * 0.1)); if (p <= 0) return;
    const col = brandAt(i / 4);
    ctx.strokeStyle = col; ctx.lineWidth = 16 + 6 * k; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a0 + span * p); ctx.stroke();
    // arrow head
    const ae = a0 + span * p, ax = cx + Math.cos(ae) * R, ay = cy + Math.sin(ae) * R;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(ae + Math.PI / 2); ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-2, -17); ctx.lineTo(-2, 17); ctx.closePath(); ctx.fill(); ctx.restore();
    // label
    const la = prog(u, 0.12 + i * 0.1, 0.42 + i * 0.1);
    if (la > 0) {
      const [lx, ly, al] = LP[i];
      const mx = cx + Math.cos(mid * DEG) * (R + 26), my = cy + Math.sin(mid * DEG) * (R + 26);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx, my, 5, 0, TAU); ctx.fill();
      ctx.save(); ctx.globalAlpha = E.outCubic(la);
      ctx.fillStyle = C.white; drawRich(ctx, s.t, lx, ly, 32, z => F.cn(z, 900), al);
      ctx.font = F.lat(13, 700); ctx.letterSpacing = '3px'; ctx.fillStyle = col; ctx.textAlign = al; ctx.fillText(s.en, lx, ly + 28);
      ctx.restore();
    }
  });
  // comet around ring
  const ca = prog(u, 0.6, 0.9);
  if (ca > 0) {
    const ang = (-90 + (u - 0.6) * 300) * DEG;
    for (let k2 = 0; k2 < 18; k2++) { const a = ang - k2 * 0.03; glowDot(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 26 - k2, C.white, 0.5 * ca * (1 - k2 / 18)); }
  }
  // center number
  ctx.save();
  ctx.globalAlpha = E.outCubic(prog(u, 0.05, 0.3)); ctx.font = F.lat(17, 700); ctx.letterSpacing = '6px'; ctx.fillStyle = C.cyan; ctx.textAlign = 'center'; ctx.fillText('WASTE HEAT → POWER', cx + 3, cy - 84);
  ctx.restore();
  if (u > 0.08) {
    const v = Math.round(6000 * E.outExpo(prog(u, 0.08, 0.95)));
    ctx.font = F.num(140); const nw = ctx.measureText('6000').width; ctx.font = F.num(58); const kw = ctx.measureText('kW').width;
    const tot = nw + 10 + kw, x0 = cx - tot / 2;
    const g = ctx.createLinearGradient(0, cy - 60, 0, cy + 50); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#9BE04A');
    ctx.fillStyle = g; drawCounter(ctx, v, 6000, x0, cy + 48, 140, F.num);
    ctx.font = F.num(58); ctx.fillStyle = C.white; ctx.fillText('kW', x0 + nw + 10, cy + 46);
  }
  ctx.save(); ctx.globalAlpha = E.outCubic(prog(u, 0.3, 0.6)); ctx.font = F.cn(24, 500); ctx.fillStyle = 'rgba(215,232,255,0.8)'; ctx.textAlign = 'center';
  ctx.fillText('硫酸装置配套汽轮发电系统', cx, cy + 102); ctx.restore();
  // title
  revealText(ctx, '循环经济', 150, 228, 64, F.cn(64), u, 0.02, { stagger: 0.05 });
  revealText(ctx, '资源综合利用 · 绿色制造', 150, 282, 28, F.cn(28, 500), u, 0.2, { stagger: 0.012, fill: 'rgba(215,232,255,0.75)' });
}

/* =====================================================================
   SCENE 6 · 51项专利 + DCS智能化
   ===================================================================== */
function scene6(ctx, u, t) {
  const X = 150;
  const cnt = Math.round(51 * E.outExpo(prog(u, 0.02, 0.62)));
  if (u > 0.0) {
    const g = ctx.createLinearGradient(0, 300, 0, 520); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#6FE0FF');
    ctx.fillStyle = g; const bw = drawCounter(ctx, cnt, 51, X - 12, 520, 300, F.num);
    ctx.save(); ctx.globalAlpha = E.outCubic(prog(u, 0.12, 0.35)); ctx.font = F.cn(84); ctx.fillStyle = C.white; ctx.fillText('项专利', X + bw + 16, 514); ctx.restore();
  }
  // 51 cells
  const cs = 28, gp = 8, gy = 568;
  for (let i = 0; i < 51; i++) {
    const c = i % 17, r = Math.floor(i / 17), x = X + c * (cs + gp), y = gy + r * (cs + gp);
    const on = i < cnt;
    ctx.strokeStyle = 'rgba(120,180,240,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
    if (on) {
      const litAt = 0.02 + (0.62 - 0.02) * (Math.log2(1 - Math.min(0.999, (i + 1) / 51) * 0.999) / -10);
      const f = Math.exp(-Math.max(0, u - litAt) * 9);
      ctx.fillStyle = brandAt(c / 16); ctx.fillRect(x + 3, y + 3, cs - 6, cs - 6);
      if (f > 0.05) { ctx.fillStyle = `rgba(255,255,255,${f})`; ctx.fillRect(x + 3, y + 3, cs - 6, cs - 6); }
    }
  }
  revealText(ctx, '绿色制造 · 循环经济 · 智能化生产', X, 730, 30, F.cn(30, 700), u, 0.5, { stagger: 0.015, fill: 'rgba(225,240,255,0.9)' });

  // DCS panel
  const px = 1010, py = 250, pw = 760, ph = 540;
  const pa = E.outExpo(prog(u, 0.0, 0.32));
  if (pa <= 0) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(px + pw / 2 - pw / 2 * pa - 4, py - 4, pw * pa + 8, ph + 8); ctx.clip();
  ctx.fillStyle = 'rgba(8,22,48,0.82)'; roundRect(ctx, px, py, pw, ph, 14); ctx.fill();
  ctx.strokeStyle = rgba(C.cyan, 0.45); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(31,198,234,0.10)'; ctx.fillRect(px, py, pw, 64);
  ctx.font = F.lat(30, 800); ctx.fillStyle = C.white; ctx.fillText('DCS', px + 30, py + 43);
  ctx.font = F.cn(28); ctx.fillText('智能化生产', px + 112, py + 43);
  for (let i = 0; i < 3; i++) { const on = (Math.floor(u * 8) + i) % 3 !== 0; ctx.fillStyle = on ? [C.green, C.cyan, C.blue][i] : 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(px + pw - 150 + i * 22, py + 32, 6, 0, TAU); ctx.fill(); }
  ctx.font = F.mono(18); ctx.fillStyle = C.green; ctx.fillText('RUN', px + pw - 74, py + 39);
  // waveforms
  const wx = px + 30, wy = py + 96, ww = 440, wh = 220;
  ctx.strokeStyle = 'rgba(120,180,240,0.12)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(wx, wy + i * wh / 4); ctx.lineTo(wx + ww, wy + i * wh / 4); ctx.stroke(); }
  for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(wx + i * ww / 8, wy); ctx.lineTo(wx + i * ww / 8, wy + wh); ctx.stroke(); }
  [[C.green, 0.0, 26], [C.cyan, 1.7, 18], [C.blue, 3.1, 30]].forEach(([col, ph0, amp], k) => {
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let x = 0; x <= ww; x += 4) {
      const s = x / ww * 9 + u * 7 + ph0;
      const y = wy + wh * (0.25 + k * 0.25) + Math.sin(s) * amp * 0.6 + Math.sin(s * 2.3 + k) * amp * 0.3 + noise1(s * 1.5 + k * 10) * amp * 0.35;
      x ? ctx.lineTo(wx + x * pa, y) : ctx.moveTo(wx, y);
    }
    ctx.stroke();
  });
  // gauge
  const gx = px + 610, gyy = py + 206, gr = 96;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(120,180,240,0.18)'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(gx, gyy, gr, 135 * DEG, 405 * DEG); ctx.stroke();
  const gv = 0.55 + 0.25 * Math.sin(u * 3.2) + 0.08 * noise1(u * 9);
  ctx.strokeStyle = brandGrad(ctx, gx - gr, gyy, gx + gr, gyy); ctx.beginPath(); ctx.arc(gx, gyy, gr, 135 * DEG, (135 + 270 * gv * E.outCubic(prog(u, 0.05, 0.5))) * DEG); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.font = F.lat(26, 800); ctx.fillStyle = C.white; ctx.textAlign = 'center'; ctx.fillText('AUTO', gx, gyy + 9);
  ctx.font = F.mono(13); ctx.fillStyle = 'rgba(160,210,255,0.7)'; ctx.fillText('CONTROL LOOP', gx, gyy + 34); ctx.textAlign = 'left';
  // bars
  const bx = px + 30, by = py + ph - 40, bh = 160, nb = 22, bwd = (pw - 60) / nb;
  for (let i = 0; i < nb; i++) {
    const v = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(i * 0.7 + u * 6)) * (0.7 + 0.3 * noise1(i + u * 5));
    const h = bh * v * E.outCubic(prog(u, 0.05 + i * 0.01, 0.4 + i * 0.01));
    ctx.fillStyle = brandAt(i / (nb - 1)); ctx.fillRect(bx + i * bwd + 3, by - h, bwd - 6, h);
  }
  // scanline
  const sl = (u * 0.9) % 1, sy = py + 64 + (ph - 64) * sl;
  const sg = ctx.createLinearGradient(0, sy - 40, 0, sy); sg.addColorStop(0, 'rgba(31,198,234,0)'); sg.addColorStop(1, 'rgba(31,198,234,0.22)');
  ctx.fillStyle = sg; ctx.fillRect(px, sy - 40, pw, 40);
  ctx.restore();
  // corner accents
  ctx.strokeStyle = C.cyan; ctx.lineWidth = 3;
  [[px, py, 1, 1], [px + pw, py, -1, 1], [px, py + ph, 1, -1], [px + pw, py + ph, -1, -1]].forEach(([x, y, sx, sy2]) => { ctx.globalAlpha = pa; ctx.beginPath(); ctx.moveTo(x, y + 26 * sy2); ctx.lineTo(x, y); ctx.lineTo(x + 26 * sx, y); ctx.stroke(); });
  ctx.globalAlpha = 1;
}

/* =====================================================================
   SCENE 7 · LOGO resolve
   ===================================================================== */
const S7 = (() => { const r = rng(91), dust = []; for (let i = 0; i < 90; i++) dust.push({ x: r() * W, y: r() * H, s: 0.5 + r() * 2, v: 8 + r() * 24, p: r() * TAU }); return { dust }; })();
function scene7(ctx, u, t) {
  const LH = 330, ls = LH / META.h, LW = META.w * ls;
  ctx.font = F.cn(84);
  const nameW = revealText(ctx, '湖南恒光化工有限公司', 0, 0, 84, F.cn(84), 0, 0, { spacing: 4, measure: true });
  const gap = 72, total = LW + gap + nameW, gx0 = (W - total) / 2, ly = 540 - LH / 2 - 8, tx = gx0 + LW + gap;
  const push = 1 + 0.03 * E.outCubic(prog(u, 0.2, 2.34));
  ctx.save(); ctx.translate(960, 540); ctx.scale(push, push); ctx.translate(-960, -540);

  // god rays + glow
  const ga = E.outCubic(prog(u, 0.0, 0.8));
  const lcx = gx0 + LW * 0.5, lcy = ly + LH * 0.52;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  glowDot(ctx, lcx, lcy, 560, C.cyan, 0.18 * ga);
  ctx.translate(lcx, lcy); ctx.rotate(u * 0.12);
  for (let i = 0; i < 18; i++) {
    const a = i * TAU / 18 + Math.sin(i * 3.1) * 0.12, w2 = 0.03 + 0.03 * hash(i);
    const g = ctx.createRadialGradient(0, 0, 60, 0, 0, 1100); g.addColorStop(0, rgba(i % 2 ? C.cyan : C.green, 0.07 * ga)); g.addColorStop(1, rgba(C.cyan, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1100, a - w2, a + w2); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // dust
  for (const d of S7.dust) { const y = (d.y - u * d.v + H) % H, x = d.x + Math.sin(u + d.p) * 12; ctx.fillStyle = `rgba(190,235,255,${0.25 * ga * (0.5 + 0.5 * Math.sin(u * 3 + d.p))})`; ctx.fillRect(x, y, d.s, d.s); }

  /* logo build into its own canvas (for glint masking) */
  const ox = 30, oy = 30;
  logoX.setTransform(1, 0, 0, 1, 0, 0); logoX.clearRect(0, 0, logoC.width, logoC.height);
  const sw = E.inOutCubic(prog(u, 0.04, 0.66));
  const wc = [600, 430], a0 = -40 * DEG;
  if (sw > 0) {
    logoX.save(); logoX.translate(ox, oy);
    if (sw < 1) { logoX.beginPath(); logoX.moveTo(...wc); logoX.arc(wc[0], wc[1], 1400, a0, a0 - sw * TAU * 1.01, true); logoX.closePath(); logoX.clip(); }
    logoX.drawImage(IMG.body, 0, 0);
    logoX.restore();
  }
  // flying pixel square
  const sq = META.squares[0], sp = prog(u, 0.38, 0.78);
  if (sp > 0) {
    const e = E.outBack(sp, 1.6), fx = lerp(sq.x + 900, sq.x, e), fy = lerp(sq.y - 260, sq.y, e), rot = lerp(50, 0, E.outCubic(sp)) * DEG, sc = lerp(2.4, 1, E.outCubic(sp));
    for (let g = 3; g >= 0; g--) {
      const eg = E.outBack(prog(u - g * 0.018, 0.38, 0.78), 1.6);
      if (g && eg <= 0) continue;
      const gxp = lerp(sq.x + 900, sq.x, eg), gyp = lerp(sq.y - 260, sq.y, eg);
      logoX.save(); logoX.globalAlpha = g ? 0.18 : 1; logoX.translate(ox + gxp + sq.w / 2, oy + gyp + sq.h / 2); logoX.rotate(g ? rot : rot); logoX.scale(sc, sc);
      logoX.drawImage(IMG.sq0, -sq.w / 2, -sq.h / 2); logoX.restore();
    }
  }
  // glint
  const gl = prog(u, 0.98, 1.5);
  if (gl > 0 && gl < 1) {
    logoX.save(); logoX.globalCompositeOperation = 'source-atop';
    const gxp = lerp(-300, 1500, E.inOutCubic(gl));
    const g = logoX.createLinearGradient(gxp - 160, 0, gxp + 160, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    logoX.translate(gxp, 430); logoX.transform(1, 0, -0.5, 1, 0, 0); logoX.translate(-gxp, -430);
    logoX.fillStyle = g; logoX.fillRect(gxp - 160, -100, 320, 1100);
    logoX.restore();
  }
  // place logo
  const ls2 = lerp(0.84, 1, E.outExpo(prog(u, 0.0, 0.9))), lr = lerp(-7, 0, E.outExpo(prog(u, 0.0, 0.9))) * DEG;
  ctx.save(); ctx.translate(gx0 + LW / 2, ly + LH / 2); ctx.rotate(lr); ctx.scale(ls2 * ls, ls2 * ls); ctx.translate(-META.w / 2 - ox, -META.h / 2 - oy);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(logoC, 0, 0);
  // landing bloom
  const lb = Math.exp(-Math.max(0, u - 0.66) * 4) * (u > 0.66 ? 1 : 0);
  if (lb > 0.02) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 * lb; ctx.drawImage(logoC, 0, 0); }
  // sweep beam
  if (sw > 0 && sw < 1) {
    const ang = a0 - sw * TAU * 1.01;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
    ctx.translate(ox + wc[0], oy + wc[1]); ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, 0, 760, 0); g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0.3, 'rgba(200,250,255,0.9)'); g.addColorStop(1, 'rgba(120,230,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, -4, 760, 8);
    ctx.fillStyle = 'rgba(80,220,255,0.18)'; ctx.fillRect(0, -26, 700, 52);
  }
  ctx.restore();

  /* wordmark */
  const sp2 = lerp(36, 4, E.outExpo(prog(u, 0.42, 1.3)));
  const nm = ctx.createLinearGradient(tx, 0, tx + nameW, 0); nm.addColorStop(0, '#FFFFFF'); nm.addColorStop(1, '#E6F6FF');
  revealText(ctx, '湖南恒光化工有限公司', tx, 528, 84, F.cn(84), u, 0.44, { spacing: sp2, stagger: 0.035, dur: 0.55, fill: nm });
  const ul = E.outExpo(prog(u, 0.7, 1.25));
  if (ul > 0) {
    ctx.fillStyle = brandGrad(ctx, tx, 0, tx + nameW, 0); ctx.fillRect(tx, 562, nameW * ul, 4);
    glowDot(ctx, tx + nameW * ul, 564, 26, C.white, 0.8 * (1 - prog(u, 1.15, 1.4)));
  }
  revealText(ctx, '恒光股份旗下企业　｜　股票代码 301118.SZ', tx, 620, 30, F.cn(30, 500), u, 0.82, { stagger: 0.012, dur: 0.4, fill: 'rgba(220,236,255,0.82)' });
  const tg = E.outCubic(prog(u, 1.0, 1.35));
  if (tg > 0) {
    ctx.save(); ctx.globalAlpha = tg; ctx.font = F.cn(24, 500); ctx.letterSpacing = `${lerp(20, 8, tg)}px`; ctx.fillStyle = C.cyan;
    ctx.fillText('硫化工 · 新材料 · 新能源材料', tx, 676); ctx.restore();
  }
  ctx.restore();
}

/* =====================================================================
   HUD / overlays / post
   ===================================================================== */
const CHAP = [['01', '落子衡阳'], ['02', '上市公司'], ['03', '生产基地'], ['04', '制酸平台'], ['05', '产业链'], ['06', '循环经济'], ['07', '智能制造']];
const CHB = [0, T1, T2, T3, T4, T5, T6];
function drawHUD(ctx, t, fr) {
  const a = E.outCubic(prog(t, 0.5, 1.0)) * (1 - prog(t, T7 - 0.15, T7));
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  // crop marks
  ctx.strokeStyle = 'rgba(220,240,255,0.4)'; ctx.lineWidth = 2;
  [[56, 56, 1, 1], [W - 56, 56, -1, 1], [56, H - 56, 1, -1], [W - 56, H - 56, -1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x, y + 24 * sy); ctx.lineTo(x, y); ctx.lineTo(x + 24 * sx, y); ctx.stroke(); });
  // chapter
  let idx = 0; for (let i = 0; i < CHB.length; i++) if (t >= CHB[i]) idx = i;
  const ch = E.outExpo(prog(t, CHB[idx], CHB[idx] + 0.35));
  ctx.save(); ctx.beginPath(); ctx.rect(90, 70, 520, 34); ctx.clip();
  ctx.translate(0, (1 - ch) * 30);
  ctx.font = F.mono(18); ctx.fillStyle = C.cyan; ctx.fillText(`${CHAP[idx][0]} / 07`, 96, 96);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(196, 82, 1.5, 18);
  ctx.font = F.cn(20, 500); ctx.fillStyle = 'rgba(235,245,255,0.85)'; ctx.fillText(CHAP[idx][1], 212, 97);
  ctx.restore();
  // brand top-right
  ctx.font = F.cn(20, 500); ctx.fillStyle = 'rgba(235,245,255,0.85)'; ctx.textAlign = 'right'; ctx.fillText('湖南恒光化工', W - 96, 97);
  ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(W - 96 - ctx.measureText('湖南恒光化工').width - 16, 90, 4 + kick(t) * 2, 0, TAU); ctx.fill();
  ctx.textAlign = 'left';
  // timecode
  const s = Math.floor(fr / FPS), ff = fr % FPS;
  ctx.font = F.mono(17); ctx.fillStyle = 'rgba(200,225,255,0.7)';
  ctx.fillText(`TC 00:00:${String(s).padStart(2, '0')}:${String(ff).padStart(2, '0')}`, 96, H - 84);
  // progress
  const px = W - 96 - 320; ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(px, H - 92, 320, 2);
  ctx.fillStyle = brandGrad(ctx, px, 0, px + 320, 0); ctx.fillRect(px, H - 92, 320 * t / DUR, 2);
  ctx.font = F.lat(13, 700); ctx.letterSpacing = '4px'; ctx.fillStyle = 'rgba(200,225,255,0.6)'; ctx.fillText('SHOWREEL', px, H - 104);
  ctx.restore();
}
function radialLines(ctx, n, seed, a, inward, p, col) {
  const r = rng(seed); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const ang = r() * TAU, r0 = 120 + r() * 700, len = 200 + r() * 900, w = 1 + r() * 3;
    const off = inward ? (1 - p) * 900 : p * 900;
    const s = r0 + off, e2 = s + len * (0.3 + 0.7 * r());
    ctx.strokeStyle = rgba(r() < 0.3 ? C.white : col, a * (0.3 + 0.7 * r())); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(960 + Math.cos(ang) * s, 540 + Math.sin(ang) * s); ctx.lineTo(960 + Math.cos(ang) * e2, 540 + Math.sin(ang) * e2); ctx.stroke();
  }
  ctx.restore();
}
function overlays(ctx, t) {
  wipeSquares(ctx, t);
  // zoom-through into the drop
  if (t > 3.5 && t < T2 + 0.08) { const a = Math.sin(prog(t, 3.5, T2 + 0.08) * Math.PI); radialLines(ctx, 90, 3, a * 0.9, false, prog(t, 3.5, T2 + 0.08), C.cyan); }
  // whip streaks
  if (t > 5.42 && t < 5.86) {
    const a = Math.sin(prog(t, 5.42, 5.86) * Math.PI), r = rng(21);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 46; i++) {
      const y = r() * H, len = 300 + r() * 1300, x = (r() * 2400 - 300) - prog(t, 5.42, 5.86) * 2600 * (0.5 + r());
      const g = ctx.createLinearGradient(x, 0, x + len, 0); const c = r() < 0.4 ? C.white : brandAt(r());
      g.addColorStop(0, rgba(C.cyan, 0)); g.addColorStop(0.5, c.startsWith('rgb(') ? c.replace('rgb', 'rgba').replace(')', `,${0.55 * a})`) : rgba(c, 0.55 * a)); g.addColorStop(1, rgba(C.cyan, 0));
      ctx.fillStyle = g; ctx.fillRect(x, y, len, 1 + r() * 3);
    }
    ctx.restore();
  }
  // ring shock between chain → loop
  const rs = prog(t, 9.30, 9.75);
  if (rs > 0 && rs < 1) { ctx.strokeStyle = rgba(C.white, 0.6 * (1 - rs)); ctx.lineWidth = 6 * (1 - rs) + 1; ctx.beginPath(); ctx.arc(960, 548, 270 + 700 * E.outExpo(rs), 0, TAU); ctx.stroke(); }
  // implosion into the logo
  if (t > 12.35 && t < T7 + 0.05) { const p = prog(t, 12.35, T7 + 0.05); radialLines(ctx, 110, 8, Math.sin(p * Math.PI) * 0.9, true, p, C.cyan); }
  // flashes
  for (const f of FLASHES) {
    const dt = t - f.t;
    let a = 0;
    if (dt >= 0 && dt < f.d) a = f.a * Math.pow(1 - dt / f.d, 2);
    else if (dt < 0 && dt > -0.05) a = f.a * 0.6 * (1 + dt / 0.05);
    if (a > 0) { ctx.fillStyle = `rgba(235,250,255,${a})`; ctx.fillRect(0, 0, W, H); }
  }
}
function glitch(ctx, t, fr) {
  const a = prog(t, 11.17, 11.25), b = 1 - prog(t, 11.25, 11.36), k = t < 11.25 ? a : b;
  if (t < 11.17 || t > 11.36) return;
  tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.globalCompositeOperation = 'copy'; tctx.drawImage(main, 0, 0); tctx.globalCompositeOperation = 'source-over';
  const r = rng(1000 + fr);
  for (let i = 0; i < 14; i++) {
    const y = Math.floor(r() * H), h = 6 + Math.floor(r() * 90), dx = (r() * 2 - 1) * 180 * k;
    ctx.drawImage(tmp, 0, y, W, h, dx, y, W, h);
    if (r() < 0.4) { ctx.fillStyle = r() < 0.5 ? `rgba(31,198,234,${0.25 * k})` : `rgba(134,214,58,${0.22 * k})`; ctx.fillRect(0, y, W, h); }
  }
  // channel offset
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 * k; ctx.drawImage(tmp, 14 * k, 0); ctx.restore();
}
function bloom(ctx, t) {
  const b1 = bl1.getContext('2d'), b2 = bl2.getContext('2d');
  b1.globalCompositeOperation = 'copy'; b1.filter = 'brightness(1.05) contrast(2.1) blur(3px)'; b1.drawImage(main, 0, 0, W / 4, H / 4); b1.filter = 'none';
  b2.globalCompositeOperation = 'copy'; b2.filter = 'blur(6px)'; b2.drawImage(bl1, 0, 0, W / 8, H / 8); b2.filter = 'none';
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingQuality = 'high';
  const bk = 1 - 0.45 * prog(t, T7 + 0.6, T7 + 1.3);
  ctx.globalAlpha = 0.28 * bk; ctx.drawImage(bl1, 0, 0, W, H);
  ctx.globalAlpha = 0.38 * bk; ctx.drawImage(bl2, 0, 0, W, H);
  ctx.restore();
}
function finish(ctx, t, fr) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 1.0);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (!noisePat) noisePat = ctx.createPattern(noiseC, 'repeat');
  noisePat.setTransform(new DOMMatrix().translate(Math.floor(hash(fr) * 512), Math.floor(hash(fr + 0.5) * 512)));
  ctx.save(); ctx.fillStyle = noisePat;
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.16; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.022; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* =====================================================================
   scene scheduling & compositing
   ===================================================================== */
function sceneList(t) {
  const L = [];
  const vel = (f) => Math.abs(f(t) - f(t - 1 / FPS));
  if (t >= 1.62 && t < T2) {
    const xf = {};
    if (t > 3.5) { const p = E.inExpo(prog(t, 3.5, T2)); xf.scale = 1 + 0.6 * p; xf.alpha = 1 - E.inCubic(prog(t, 3.58, T2)); }
    L.push({ fn: scene1, u: t - T1, xf });
  }
  if (t < 2.16) L.push({ fn: scene0, u: t, xf: { clip: t >= 1.62 ? wipeClip : null } });
  if (t >= T2 && t < T3) {
    const xf = { scale: lerp(1.22, 1, E.outExpo(prog(t, T2, T2 + 0.6))) };
    const dxf = tt => -W * 1.08 * E.inCubic(prog(tt, 5.44, T3));
    if (t > 5.44) { xf.dx = dxf(t); xf.smear = vel(dxf); }
    L.push({ fn: scene2, u: t - T2, xf });
  }
  if (t >= T3 && t < T4) {
    const xf = {};
    const dxf = tt => W * 1.08 * (1 - E.outCubic(prog(tt, T3, 5.84)));
    if (t < 5.84) { xf.dx = dxf(t); xf.smear = vel(dxf); }
    L.push({ fn: scene3, u: t - T3, xf });
  }
  if (t >= T4 && t < 9.46) {
    const xf = {};
    if (t > 9.18) { const p = E.inCubic(prog(t, 9.18, 9.44)); Object.assign(xf, { scale: 1 - 0.32 * p, rot: -0.45 * p, alpha: 1 - p }); }
    L.push({ fn: scene4, u: t - T4, xf });
  }
  if (t >= 9.26 && t < T6) {
    const p = E.outCubic(prog(t, 9.26, 9.6));
    L.push({ fn: scene5, u: t - T5, xf: { scale: lerp(1.5, 1, p), rot: lerp(0.4, 0, p), alpha: clamp(p * 1.4), cy: 548 } });
  }
  if (t >= T6 && t < T7) {
    const xf = {};
    if (t > 12.42) { const p = E.inExpo(prog(t, 12.42, T7)); Object.assign(xf, { scale: 1 - 0.5 * p, alpha: 1 - p * p }); }
    L.push({ fn: scene6, u: t - T6, xf });
  }
  if (t >= T7 - 0.02) L.push({ fn: scene7, u: t - T7, xf: {} });
  return L;
}
function compositeLayer(ctx, xf, t, sx, sy, kz) {
  const alpha = xf.alpha ?? 1; if (alpha <= 0.002) return;
  const scale = (xf.scale ?? 1) * kz, rot = xf.rot || 0, dx = xf.dx || 0, dy = xf.dy || 0, cx = xf.cx ?? 960, cy = xf.cy ?? 540;
  ctx.save();
  if (xf.clip) xf.clip(ctx, t);
  ctx.globalAlpha = alpha;
  const smear = xf.smear || 0;
  if (smear > 6) {
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.globalAlpha = 1; tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, W, H);
    const n = 14;
    tctx.filter = 'blur(1.5px)';
    for (let k = 0; k < n; k++) { tctx.globalAlpha = 1 / (k + 1); tctx.drawImage(layer, -smear * 1.8 * (k / (n - 1) - 0.5), 0); }
    tctx.globalAlpha = 1; tctx.filter = 'none';
    ctx.translate(cx + dx + sx, cy + dy + sy); ctx.rotate(rot); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
    ctx.drawImage(tmp, 0, 0);
  } else {
    ctx.translate(cx + dx + sx, cy + dy + sy); ctx.rotate(rot); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
    ctx.drawImage(layer, 0, 0);
  }
  ctx.restore();
}
function reset(c) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.letterSpacing = '0px'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.lineCap = 'butt'; c.setLineDash([]); }
function render(fr) {
  const t = fr / FPS, ctx = ctxM;
  reset(ctx);
  drawBG(ctx, t);
  const [sx, sy] = shake(t), kz = 1 + 0.012 * kick(t);
  for (const s of sceneList(t)) {
    reset(lctx); lctx.clearRect(0, 0, W, H);
    s.fn(lctx, s.u, t);
    compositeLayer(ctx, s.xf, t, sx, sy, kz);
  }
  reset(ctx);
  overlays(ctx, t);
  glitch(ctx, t, fr);
  reset(ctx);
  bloom(ctx, t);
  drawHUD(ctx, t, fr);
  finish(ctx, t, fr);
}

window.ready = (async () => {
  META = await (await fetch('logo_meta.json')).json();
  await Promise.all([loadImg('body', 'logo_body.png'), loadImg('full', 'logo_full.png'), loadImg('sq0', 'sq0.png')]);
  const fams = ['900 40px "Noto Sans CJK SC"', '700 40px "Noto Sans CJK SC"', '500 40px "Noto Sans CJK SC"', '900 40px "Inter Display"', '800 40px "Inter"', '700 40px "Inter"', '600 40px "Inter"', '40px "DejaVu Sans Mono"'];
  await Promise.all(fams.map(f => document.fonts.load(f, '湖南恒光0123SZ')));
  return true;
})();
window.renderAt = (fr) => { render(fr); return true; };
window.TOTAL = FPS * DUR;

// Browser preview: open index.html?play (renders in real time, may drop frames; the MP4 is rendered frame by frame)
if (location.search.includes('play')) {
  window.ready.then(() => {
    const start = performance.now();
    const loop = () => { const fr = Math.floor(((performance.now() - start) / 1000 * FPS) % (FPS * DUR)); render(fr); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
}
