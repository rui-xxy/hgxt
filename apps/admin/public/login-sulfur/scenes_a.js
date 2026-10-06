// ============================================================
//  Scenes 1–3   源 · 心 · 链
// ============================================================

// ---------- shared: the "heart" (sulfuric acid) ----------
function drawHeart(ctx, x, y, r, o = {}) {
  if (r <= 0.5) return;
  ctx.save();
  if (o.glow) { ctx.shadowColor = 'rgba(39,180,245,' + (0.55 * o.glow) + ')'; ctx.shadowBlur = 60 * o.glow; }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  g.addColorStop(0, '#4FA8FA'); g.addColorStop(0.55, '#0E62D8'); g.addColorStop(1, '#0B2F8C');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (o.ring !== 0 && r < 400) {
    ctx.save(); ctx.strokeStyle = 'rgba(10,108,224,' + (0.35 * (o.ring ?? 1)) + ')'; ctx.lineWidth = Math.max(1, r / 100);
    ctx.beginPath(); ctx.arc(x, y, r * 1.12, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  const la = o.label ?? 1;
  if (la > 0 && r < 400) {
    drawFormula(ctx, 'H_2SO_4', x, y + r * 0.13, { f: F.num, w: 500, s: r * 0.42, c: '#FFFFFF', a: 'center', al: la });
    T(ctx, o.sub || '98%', x, y + r * 0.47, { f: F.mono, s: r * 0.15, c: 'rgba(255,255,255,0.75)', a: 'center', al: la, ls: r * 0.02 });
  }
}

// ---------- S1 源 : pyrite cube → shatter → acid platform ----------
const S1 = (() => {
  const R = rng(11);
  const CX = 700, CY = 450, S = 128;
  const PITCH = -0.5;
  const yawAt = t => 0.62 + t * 0.32 + 1.9 * E.inC(P(t, 3.9, 5.0));
  const TS = 5.0;
  const subs = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) {
    subs.push({ c: [(i - 1.5) * S / 2, (j - 1.5) * S / 2, (k - 1.5) * S / 2], jit: [R() - .5, R() - .5, R() - .5], spin: [(R() - .5) * 5, (R() - .5) * 5, (R() - .5) * 3], dist: 0.55 + R() * 0.8 });
  }
  const yTS = yawAt(TS);
  subs.forEach(s => {
    s.w = rot3(s.c, yTS, PITCH);
    const d = [s.w[0] / S + s.jit[0] * 1.1, s.w[1] / S + s.jit[1] * 1.1, s.w[2] / S + s.jit[2]]; const l = Math.hypot(...d) || 1;
    s.d = d.map(x => x / l);
    s.end = [CX + s.w[0] + s.d[0] * s.dist * 520, CY + s.w[1] + s.d[1] * s.dist * 420];
  });
  // 4 special cubes drift up-right (they return at the finale)
  const order = subs.map((s, i) => i).sort((a, b) => (subs[b].d[0] - subs[b].d[1]) - (subs[a].d[0] - subs[a].d[1]));
  const special = order.slice(0, 4); special.forEach((i, n) => subs[i].special = n + 1);
  const rest = subs.filter(s => !s.special).sort((a, b) => a.end[0] - b.end[0]);
  const PX0 = 160, PX1 = 1760, PY = 800;
  rest.forEach((s, m) => { s.m = m; s.tx = PX0 + (m + 0.5) / rest.length * (PX1 - PX0); s.ta = 5.85 + m * 0.013; s.tb = s.ta + 0.85; });

  function subPos(s, t) {
    const u = E.outExpo(P(t, TS, TS + 1.7));
    const drift = (t - TS) * 14;
    return [CX + s.w[0] + s.d[0] * s.dist * 520 * u + s.d[0] * drift, CY + s.w[1] + s.d[1] * s.dist * 420 * u + s.d[1] * drift, s.w[2] + s.d[2] * 300 * u];
  }
  const EQ = [470, 960, 1450];

  function draw(ctx, t) {
    if (t >= 10.2) return;
    // ---- camera for the push-in to the tank (match-cut into S2's heart) ----
    const cz = P(t, 9.25, 10.2, E.ioQuint);
    const camS = lerp(1, 2.3, cz);
    const tgt = [lerp(EQ[2], 700, cz), lerp(PY, 620, cz)];
    const fadeAll = 1 - P(t, 9.2, 9.75, E.outQ);
    ctx.save();
    ctx.translate(tgt[0], tgt[1]); ctx.scale(camS, camS); ctx.translate(-EQ[2], -PY);

    // watermark 源
    const wm = P(t, 6.8, 8.4, E.outC) * fadeAll;
    if (wm > 0) T(ctx, '源', 1890, 700 - wm * 30, { f: F.serif, w: 900, s: 700, c: '#E3ECF8', a: 'right', al: wm });

    // ---- opener: dot → wire cube ----
    if (t < TS) {
      const dot = P(t, 0.2, 0.55, E.outBack) * (1 - P(t, 0.7, 0.95));
      if (dot > 0) { ctx.fillStyle = COL.blue; ctx.beginPath(); ctx.arc(CX, CY, 7 * dot, 0, 7); ctx.fill(); }
      const ring = P(t, 0.35, 1.3, E.outC);
      if (ring > 0 && ring < 1) { ctx.strokeStyle = `rgba(10,108,224,${0.5 * (1 - ring)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(CX, CY, 20 + ring * 180, 0, 7); ctx.stroke(); }
      const edgeP = P(t, 0.65, 2.3, E.ioQ);
      const fill = P(t, 3.95, 4.85, E.ioC);
      const heat = P(t, 4.2, 5.0, E.inQ);
      const yaw = yawAt(t);
      const s = S * (0.94 + 0.06 * E.outBack(P(t, 0.65, 2.3)));
      if (heat > 0) {
        ctx.save(); const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, 420);
        g.addColorStop(0, `rgba(39,180,245,${0.28 * heat})`); g.addColorStop(1, 'rgba(39,180,245,0)');
        ctx.fillStyle = g; ctx.fillRect(CX - 420, CY - 420, 840, 840); ctx.restore();
      }
      drawCube(ctx, CX, CY, s * (1 + 0.04 * heat), yaw, PITCH, 0, { fill, wire: 1 - fill * 0.4, edgeP, lw: 2.2, seam: fill > 0 ? 'rgba(255,255,255,0.12)' : null });
      // crystal-axis dimension line
      const dim = env(t, 2.0, 2.6, 3.7, 4.1);
      if (dim > 0) {
        ctx.save(); ctx.globalAlpha = dim; ctx.strokeStyle = COL.ink3; ctx.lineWidth = 1;
        const y0 = CY + S * 1.75, x0 = CX - S * 1.15, x1 = CX + S * 1.15;
        const w = (x1 - x0) * E.outC(P(t, 2.0, 2.6));
        ctx.beginPath(); ctx.moveTo(CX - w / 2, y0); ctx.lineTo(CX + w / 2, y0);
        ctx.moveTo(CX - w / 2, y0 - 7); ctx.lineTo(CX - w / 2, y0 + 7); ctx.moveTo(CX + w / 2, y0 - 7); ctx.lineTo(CX + w / 2, y0 + 7); ctx.stroke();
        ctx.fillStyle = COL.paper; ctx.fillRect(CX - 74, y0 - 12, 148, 24);
        T(ctx, 'a = 5.42 Å', CX, y0 + 5, { f: F.mono, s: 14, c: COL.ink2, a: 'center', ls: 1 });
        ctx.restore();
      }
      // callout: FeS2 / 黄铁矿
      const co = env(t, 1.3, 1.9, 3.85, 4.25);
      if (co > 0) {
        const vx = CX + S * 1.05, vy = CY - S * 0.95;
        const lp = E.outC(P(t, 1.3, 1.9));
        ctx.save(); ctx.globalAlpha = co; ctx.strokeStyle = COL.blue; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(vx, vy, 4, 0, 7); ctx.fillStyle = COL.blue; ctx.fill();
        const ax = vx + 90 * lp, ay = vy - 70 * lp; const bx = ax + 210 * P(t, 1.6, 2.1, E.outC);
        ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(ax, ay); ctx.lineTo(bx, ay); ctx.stroke(); ctx.restore();
        const tx = vx + 104, ty = vy - 86;
        ctx.save(); ctx.globalAlpha = co;
        const p1 = P(t, 1.7, 2.4);
        if (p1 > 0) { ctx.save(); ctx.beginPath(); ctx.rect(tx - 10, ty - 90, 400, 96); ctx.clip(); drawFormula(ctx, 'FeS_2', tx, ty - 12 + (1 - E.outExpo(p1)) * 90, { f: F.num, w: 300, s: 76, c: COL.ink }); ctx.restore(); }
        TUp(ctx, '黄铁矿 · PYRITE', tx + 2, ty + 34, { f: F.sans, w: 500, s: 22, c: COL.ink, ls: 3 }, P(t, 1.9, 2.6));
        T(ctx, typeOn('CUBIC · 立方晶系', P(t, 2.1, 2.7)), tx + 2, ty + 62, { f: F.mono, s: 13, c: COL.ink3, ls: 2 });
        ctx.restore();
      }
      // headline
      const hOut = P(t, 3.9, 4.4);
      const ha = 1 - hOut;
      if (t > 2.3 && ha > 0) {
        TChars(ctx, '一块天生方正的石头', 160, 920, { f: F.serif, w: 700, s: 66, c: COL.ink, ls: 6, al: ha }, t, 2.35, 0.05, 0.6);
        T(ctx, '硫铁矿（FeS₂）天然结晶为立方体。恒光衡阳基地的故事，从它开始。', 162, 972, { f: F.sans, s: 22, c: COL.ink2, ls: 1, al: P(t, 2.9, 3.5) * ha });
      }
      // roasting tag
      const rt = env(t, 4.05, 4.3, 4.9, 5.0);
      if (rt > 0) T(ctx, typeOn('沸腾焙烧  ROASTING ▸▸▸', P(t, 4.05, 4.6)), CX, CY - S * 1.9, { f: F.mono, s: 15, c: COL.blue, a: 'center', ls: 3, al: rt });
    } else {
      // ---- shatter ----
      const yaw = yawAt(TS);
      const items = [];
      subs.forEach(s => {
        let p = subPos(s, t), half = S / 4 * (1 - 0.18 * E.outC(P(t, TS, TS + 1.2)));
        let dotA = 0;
        if (s.special) {
          const fly = E.inQ(P(t, 5.7, 8.8));
          p = [p[0] + fly * 1400, p[1] - fly * 820, p[2]];
          half = S / 4 * 0.62;
        } else {
          const u = P(t, s.ta, s.tb, E.ioC);
          if (u > 0) {
            const tgt = [s.tx, PY];
            const c = [lerp(p[0], tgt[0], 0.15), lerp(p[1], tgt[1], 0.85) + 40];
            const v = 1 - u;
            p = [v * v * p[0] + 2 * v * u * c[0] + u * u * tgt[0], v * v * p[1] + 2 * v * u * c[1] + u * u * tgt[1], p[2]];
            half *= 1 - E.inQ(u); dotA = P(u, 0.55, 1);
          }
          if (t > s.tb) {
            const fl = ((s.tx - PX0) + (t - s.tb) * 150) % (PX1 - PX0);
            p = [PX0 + fl, PY, 0]; half = 0; dotA = 1 - P(t, 9.0, 9.6);
          }
        }
        items.push({ s, p, half, dotA });
      });
      items.sort((a, b) => a.p[2] - b.p[2]);
      const flash = 1 - P(t, TS, TS + 0.35);
      for (const it of items) {
        const s = it.s;
        if (it.half > 0.5) {
          const sp = (t - TS);
          const ry = yaw + s.spin[0] * sp * 0.6 * (s.special ? 0.5 : 1), rp = PITCH + s.spin[1] * sp * 0.5, rr = s.spin[2] * sp * 0.4;
          drawCube(ctx, it.p[0], it.p[1], it.half, ry, rp, rr, { fill: 1, wire: 0, seam: 'rgba(255,255,255,0.18)', light: s.special ? '#7CC6FF' : '#5AB0FA' });
        }
        if (it.dotA > 0) { ctx.fillStyle = `rgba(10,108,224,${it.dotA})`; ctx.beginPath(); ctx.arc(it.p[0], it.p[1], 3.2, 0, 7); ctx.fill(); }
      }
      // impact flash + shock ring
      if (flash > 0) {
        ctx.save(); ctx.fillStyle = `rgba(255,255,255,${0.75 * flash * flash})`; ctx.fillRect(-W, -H, W * 3, H * 3); ctx.restore();
      }
      const sr = P(t, TS, TS + 0.9, E.outC);
      if (sr < 1) { ctx.strokeStyle = `rgba(39,180,245,${0.6 * (1 - sr)})`; ctx.lineWidth = 3 * (1 - sr) + 0.5; ctx.beginPath(); ctx.arc(CX, CY, 60 + sr * 760, 0, 7); ctx.stroke(); }
    }

    // ---- acid platform: pipe + equipment + number ----
    const pipeP = P(t, 6.25, 7.7, E.ioC);
    if (pipeP > 0) {
      ctx.save(); ctx.globalAlpha = fadeAll;
      ctx.strokeStyle = COL.blue; ctx.lineWidth = 2;
      const xe = PX0 + pipeP * (PX1 - PX0);
      ctx.beginPath(); ctx.moveTo(PX0, PY - 7); ctx.lineTo(xe, PY - 7); ctx.moveTo(PX0, PY + 7); ctx.lineTo(xe, PY + 7); ctx.stroke();
      // flow chevrons
      ctx.strokeStyle = COL.blue; ctx.lineWidth = 1.6;
      for (let k = 0; k < 14; k++) {
        const x = PX0 + ((k * 120 + t * 90) % (PX1 - PX0));
        if (x > xe - 10) continue;
        if (EQ.some(e => Math.abs(x - e) < 70)) continue;
        ctx.globalAlpha = fadeAll * 0.55; ctx.beginPath(); ctx.moveTo(x - 4, PY - 4); ctx.lineTo(x + 2, PY); ctx.lineTo(x - 4, PY + 4); ctx.stroke();
      }
      ctx.globalAlpha = fadeAll;
      // end caps
      ctx.beginPath(); ctx.moveTo(PX0, PY - 13); ctx.lineTo(PX0, PY + 13); ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    // equipment (tank survives the fade)
    if (pipeP > 0) {
      ctx.globalAlpha = fadeAll;
      // draw first two with fade; tank always
      const ga = ctx.globalAlpha;
      equipmentFaded(ctx, t, pipeP, fadeAll);
    }
    ctx.restore();

    // number block
    const nb = P(t, 7.55, 7.9) * fadeAll;
    if (nb > 0) {
      ctx.save(); ctx.globalAlpha = fadeAll;
      T(ctx, typeOn('CAPACITY / 制酸平台', P(t, 7.55, 8.1)), 164, 236, { f: F.mono, s: 14, c: COL.ink3, ls: 3 });
      const v = 300000 * E.outExpo(P(t, 7.7, 8.95));
      const ns = { f: F.num, w: 200, s: 220, c: COL.ink, ls: -4 };
      TUp(ctx, fmt(v), 150, 450, ns, P(t, 7.65, 8.3));
      const nw = MW(ctx, '300,000', ns);
      TUp(ctx, 't/a', 150 + nw + 26, 450, { f: F.num, w: 300, s: 56, c: COL.blue }, P(t, 8.3, 8.9));
      TChars(ctx, '30 万吨/年 · 硫铁矿制酸平台', 160, 530, { f: F.serif, w: 600, s: 38, c: COL.ink, ls: 4 }, t, 8.6, 0.03, 0.5);
      ctx.restore();
    }
    ctx.restore();
  }
  function equipmentFaded(ctx, t, pipeP, fadeAll) {
    // draw R-101/T-201 with fade, tank at full alpha
    ctx.save(); ctx.globalAlpha = fadeAll; equipmentSubset(ctx, t, pipeP, [0, 1], true); ctx.restore();
    ctx.save(); ctx.globalAlpha = 1; equipmentSubset(ctx, t, pipeP, [2], false, fadeAll); ctx.restore();
  }
  function equipmentSubset(ctx, t, pipeP, idx, labels, labelFade = 1) {
    const saveEQ = EQ.slice();
    // render only selected equipment by temporarily masking others
    const lab = [['沸腾焙烧', 'FLUIDIZED-BED ROASTING', 'R-101'], ['两转两吸', 'DOUBLE CONTACT / ABSORPTION', 'T-201 · T-202'], ['成品硫酸', '98% · 105% H₂SO₄', 'TK-301']];
    idx.forEach(i => {
      const x = EQ[i];
      const reach = PX0 + pipeP * (PX1 - PX0);
      const ap = clamp((reach - (x - 60)) / 120);
      if (ap <= 0) return;
      const sc = E.outBack(ap);
      ctx.save(); ctx.translate(x, PY); ctx.scale(sc, sc);
      ctx.lineWidth = 2; ctx.strokeStyle = COL.blue; ctx.fillStyle = COL.paper;
      if (i === 0) {
        ctx.beginPath(); ctx.roundRect(-44, -120, 88, 160, 10); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.roundRect(-44, -120, 88, 160, 10); ctx.clip();
        ctx.fillStyle = 'rgba(10,108,224,0.10)'; ctx.fillRect(-44, -10, 88, 50);
        ctx.fillStyle = COL.blue; const rr = rng(3);
        for (let k = 0; k < 16; k++) { const bx = -34 + rr() * 68, sp = 0.6 + rr(), by = 34 - ((rr() * 44 + t * 40 * sp) % 44); ctx.beginPath(); ctx.arc(bx, by, 2 + rr() * 2, 0, 7); ctx.fill(); }
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(-44, -10); ctx.lineTo(44, -10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-14, -120); ctx.lineTo(-14, -140); ctx.lineTo(14, -140); ctx.lineTo(14, -120); ctx.stroke();
      } else if (i === 1) {
        for (const dx of [-34, 34]) {
          ctx.beginPath(); ctx.roundRect(dx - 24, -160, 48, 200, 24); ctx.fill(); ctx.stroke();
          ctx.save(); ctx.beginPath(); ctx.rect(dx - 24, -110, 48, 90); ctx.clip(); ctx.lineWidth = 1; ctx.globalAlpha *= 0.55;
          for (let k = -6; k < 8; k++) { ctx.beginPath(); ctx.moveTo(dx - 24, -110 + k * 14); ctx.lineTo(dx + 24, -110 + k * 14 + 48); ctx.moveTo(dx + 24, -110 + k * 14); ctx.lineTo(dx - 24, -110 + k * 14 + 48); ctx.stroke(); }
          ctx.restore();
          ctx.beginPath(); ctx.moveTo(dx - 24, -110); ctx.lineTo(dx + 24, -110); ctx.moveTo(dx - 24, -20); ctx.lineTo(dx + 24, -20); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(-34, -160); ctx.lineTo(-34, -172); ctx.lineTo(34, -172); ctx.lineTo(34, -160); ctx.stroke();
      } else {
        drawHeart(ctx, 0, 0, 52, { ring: 0 });
      }
      ctx.restore();
      const la = P(ap, 0.4, 1) * labelFade;
      const tagY = i === 1 ? PY - 186 : i === 0 ? PY - 152 : PY - 72;
      T(ctx, lab[i][2], x, tagY, { f: F.mono, s: 13, c: COL.blue, a: 'center', ls: 2, al: la });
      T(ctx, lab[i][0], x, PY + 100, { f: F.sans, w: 500, s: 26, c: COL.ink, a: 'center', ls: 4, al: la });
      T(ctx, lab[i][1], x, PY + 128, { f: F.mono, s: 12, c: COL.ink3, a: 'center', ls: 1.5, al: la });
    });
  }
  return { draw, special, subs, CX, CY, S, PITCH };
})();

// ---------- heart state across S2–S4 ----------
function heartState(t) {
  if (t < 10.2) return null;
  let x = 700, y = 620, r = 120;
  if (t >= 15.6) { const u = P(t, 15.6, 16.5, E.ioC); x = lerp(700, 480, u); y = lerp(620, 610, u); r = lerp(120, 96, u); }
  if (t >= 23.4) { const u = P(t, 23.4, 24.4, E.ioC); x = lerp(480, RING.C[0], u); y = lerp(610, RING.C[1], u); r = lerp(96, 84, u); }
  // heartbeat
  let pulse = 0;
  const beats = [];
  if (t < 16.2) { for (let n = 11; n <= 15; n++) { beats.push([n, 1], [n + 0.25, 0.6]); } }
  else if (t < 33) { for (let b = 16; b < 33; b += 1) beats.push([b, 0.35]); }
  for (const [bt, amp] of beats) { const d = t - bt; if (d >= 0 && d < 0.6) pulse = Math.max(pulse, amp * Math.exp(-d * 9)); }
  r *= 1 + 0.07 * pulse;
  let glow = 0;
  if (t > 33.0) { glow = P(t, 33.0, 35.2); r *= 1 + 0.25 * E.inQ(P(t, 33.4, 35.35)); }
  if (t > 35.35) { r = lerp(r, 2400, E.inExpo(P(t, 35.35, 36.0))); }
  return { x, y, r, pulse, glow };
}

// ---------- S2 心 : the heart / energy ----------
const S2 = (() => {
  const steam = withLen([...cubic([700, 492], [700, 420], [700, 330], [780, 330], 24), ...cubic([780, 330], [900, 330], [1050, 330], [1166, 330], 12).slice(1)]);
  const power = withLen([[1314, 330], [1520, 330], [1560, 340], [1560, 380], [1560, 516]]);
  function draw(ctx, t) {
    if (t < 10.0 || t > 16.6) return;
    const out = 1 - P(t, 15.35, 15.95, E.inQ);
    const hs = heartState(t);
    // rings from lub beats
    for (let n = 11; n <= 15; n++) {
      const d = t - n; if (d < 0 || d > 1.6) continue;
      const u = E.outC(d / 1.6);
      ctx.strokeStyle = `rgba(10,108,224,${0.35 * (1 - u)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(hs.x, hs.y, hs.r + u * 360, 0, 7); ctx.stroke();
    }
    ctx.save(); ctx.globalAlpha = out;
    // title
    T(ctx, typeOn('02 · SULFURIC ACID PLANT / 硫酸车间', P(t, 10.35, 11.0)), 164, 196, { f: F.mono, s: 14, c: COL.ink3, ls: 3 });
    TChars(ctx, '全厂的心脏', 160, 306, { f: F.serif, w: 900, s: 100, c: COL.ink, ls: 6, colFn: i => i >= 3 ? COL.blue : COL.ink }, t, 10.5, 0.07, 0.6);
    T(ctx, '酸源中心 ＋ 能源中心', 164, 362, { f: F.sans, s: 26, c: COL.ink2, ls: 4, al: P(t, 11.0, 11.5) });
    // steam line
    const sp = P(t, 11.2, 12.0, E.ioC);
    if (sp > 0) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = COL.pale; ctx.lineWidth = 12; strokePartial(ctx, steam, sp);
      ctx.strokeStyle = COL.blue; ctx.lineWidth = 2.2; strokePartial(ctx, steam, sp);
      ctx.save(); ctx.setLineDash([3, 14]); ctx.lineDashOffset = -t * 70; ctx.strokeStyle = COL.cyan; ctx.lineWidth = 5; strokePartial(ctx, steam, sp); ctx.restore();
      TUp(ctx, '余热蒸汽', 800, 292, { f: F.sans, w: 500, s: 26, c: COL.ink, ls: 3 }, P(t, 11.7, 12.3));
      T(ctx, typeOn('3.45 MPa · MAX 56 t/h', P(t, 11.9, 12.5)), 940, 291, { f: F.mono, s: 15, c: COL.blue, ls: 1 });
    }
    // turbine
    const tp = P(t, 11.85, 12.4);
    if (tp > 0) {
      const sc = E.outBack(tp); const tx = 1240, ty = 330;
      ctx.save(); ctx.translate(tx, ty); ctx.scale(sc, sc);
      ctx.fillStyle = COL.paper; ctx.strokeStyle = COL.blue; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 72, 0, 7); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = COL.pale; ctx.beginPath(); ctx.arc(0, 0, 84, 0, 7); ctx.stroke();
      const d = Math.max(0, t - 12.0); const ang = d < 1.2 ? 3.3 * d * d : 3.3 * 1.44 + 7.9 * (d - 1.2);
      ctx.rotate(ang); ctx.fillStyle = COL.blue;
      for (let k = 0; k < 7; k++) {
        ctx.save(); ctx.rotate(k * Math.PI * 2 / 7);
        ctx.beginPath(); ctx.moveTo(10, -4); ctx.quadraticCurveTo(38, -22, 62, -8); ctx.quadraticCurveTo(40, -6, 10, 5); ctx.closePath(); ctx.globalAlpha *= 0.85; ctx.fill(); ctx.restore();
      }
      ctx.fillStyle = COL.deep; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
      ctx.restore();
      T(ctx, 'TG-01', tx, ty - 98, { f: F.mono, s: 13, c: COL.blue, a: 'center', ls: 2, al: P(tp, .5, 1) });
      T(ctx, '汽轮发电机组', tx, ty + 124, { f: F.sans, w: 500, s: 24, c: COL.ink, a: 'center', ls: 4, al: P(t, 12.3, 12.8) });
    }
    // power line
    const pp = P(t, 12.65, 13.3, E.ioC);
    if (pp > 0) {
      ctx.save(); ctx.strokeStyle = COL.blue; ctx.lineWidth = 2; ctx.setLineDash([16, 6, 3, 6]); ctx.lineDashOffset = -t * 40; strokePartial(ctx, power, pp); ctx.restore();
      const np = P(t, 13.2, 13.6);
      if (np > 0) {
        const nx = 1560, ny = 560; const sc = E.outBack(np);
        ctx.save(); ctx.translate(nx, ny); ctx.scale(sc, sc);
        ctx.fillStyle = COL.blue; ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(4, -24); ctx.lineTo(-12, 4); ctx.lineTo(0, 4); ctx.lineTo(-5, 24); ctx.lineTo(13, -6); ctx.lineTo(1, -6); ctx.closePath(); ctx.fill();
        ctx.restore();
        T(ctx, '全厂 ＋ 园区供电', nx, ny + 76, { f: F.sans, w: 500, s: 22, c: COL.ink, a: 'center', ls: 3, al: np });
        T(ctx, 'POWER & STEAM SUPPLY', nx, ny + 102, { f: F.mono, s: 12, c: COL.ink3, a: 'center', ls: 1.5, al: np });
      }
    }
    // 6000 kW
    if (t > 13.2) {
      const v = 6000 * E.outExpo(P(t, 13.3, 14.4));
      const ns = { f: F.num, w: 200, s: 180, c: COL.ink, ls: -3 };
      TUp(ctx, fmt(v), 990, 850, ns, P(t, 13.25, 13.9));
      TUp(ctx, 'kW', 990 + MW(ctx, '6,000', ns) + 22, 850, { f: F.num, w: 300, s: 56, c: COL.blue }, P(t, 13.8, 14.4));
      T(ctx, '余热发电装机 · 全厂用电基本自给', 996, 902, { f: F.sans, s: 22, c: COL.ink2, ls: 2, al: P(t, 14.0, 14.6) });
    }
    // statement
    if (t > 14.1) TChars(ctx, '一座酸厂，也是一座电厂。', 160, 950, { f: F.serif, w: 600, s: 44, c: COL.ink, ls: 4 }, t, 14.15, 0.045, 0.5);
    ctx.restore();
  }
  return { draw };
})();

// ---------- products ----------
const PRODUCTS = [
  { k: 'oleum', name: '发烟硫酸', f: 'H_2SO_4·SO_3', v: 10, d: 0, unit: '万 t/a', use: '105% · 磺化与精细合成原料' },
  { k: 'iron', name: '铁精粉', f: 'Fe_3O_4', v: 20.15, d: 2, unit: '万 t/a', use: '焙烧渣磁选 · 炼铁 / 水泥原料' },
  { k: 'eaq', name: '2-乙基蒽醌', f: 'C_{16}H_{12}O_2', v: 5000, d: 0, unit: 't/a', use: '蒽醌法双氧水的工作载体' },
  { k: 'sulf', name: '氨基磺酸', f: 'NH_2SO_3H', v: 2, d: 0, unit: '万 t/a', use: '清洗剂 · 电镀 · 化妆品原料' },
  { k: 'mg', name: '硫酸镁', f: 'MgSO_4·7H_2O', v: 15, d: 0, unit: '万 t/a', use: '工业 / 农业镁肥 · 饲料添加剂' },
  { k: 'ldh', name: '镁铝水滑石', f: 'Mg_6Al_2(OH)_{16}CO_3', v: 1.2, d: 1, unit: '万 t/a', use: '高分子阻燃 · PVC 热稳定剂' },
  { k: 'pp', name: '焦磷酸哌嗪', f: 'C_4H_{10}N_2·H_4P_2O_7', v: 1, d: 0, unit: '万 t/a', use: '膨胀型阻燃剂' },
];
const RING = {
  C: [700, 610], R: 280,
  ang: { sulf: -90, ldh: -38.6, pp: 12.9, eaq: 64.3, mg: 115.7, iron: 167.1, oleum: 218.6 },
};
const ROW = { x0: 960, x1: 1760, y: i => 200 + i * 112, ax: 930 };

// ---------- S3 链 : one acid, seven products ----------
const S3 = (() => {
  const tb = i => 16.05 + i * 0.5;
  function branchPts(i, hx, hy, hr, t) {
    const y = ROW.y(i);
    return withLen(cubic([hx + hr + 10, hy], [hx + hr + 180, hy], [ROW.ax - 170, y], [ROW.ax, y], 40));
  }
  function draw(ctx, t) {
    if (t < 15.8 || t > 24.6) return;
    const hs = heartState(t);
    const out = P(t, 23.25, 23.75);
    // title
    ctx.save(); ctx.globalAlpha = 1 - out;
    T(ctx, typeOn('03 · PRODUCT FAMILY / 产品谱系', P(t, 16.0, 16.6)), 164, 160, { f: F.mono, s: 14, c: COL.ink3, ls: 3 });
    TChars(ctx, '一酸七品', 156, 282, { f: F.serif, w: 900, s: 118, c: COL.ink, ls: 12, colFn: i => (i === 0 || i === 2) ? COL.blue : COL.ink }, t, 16.1, 0.09, 0.6);
    T(ctx, '以硫酸为源，延伸五条精细化工产品线', 162, 340, { f: F.sans, s: 24, c: COL.ink2, ls: 3, al: P(t, 16.8, 17.3) });
    if (hs) {
      T(ctx, '98% 浓硫酸 · 20 万 t/a', hs.x, hs.y + 150, { f: F.sans, w: 500, s: 20, c: COL.ink, a: 'center', ls: 2, al: P(t, 16.4, 16.9) });
      T(ctx, 'SULFURIC ACID · 硫酸车间', hs.x, hs.y + 176, { f: F.mono, s: 12, c: COL.ink3, a: 'center', ls: 1.5, al: P(t, 16.6, 17.1) });
    }
    ctx.restore();
    if (!hs || t > 23.4) return; // branches handed over to S4 morph
    PRODUCTS.forEach((p, i) => {
      const bp = P(t, tb(i), tb(i) + 0.45, E.ioC);
      if (bp <= 0) return;
      const pl = branchPts(i, hs.x, hs.y, 96, t);
      ctx.strokeStyle = COL.blue; ctx.lineWidth = 1.6; strokePartial(ctx, pl, bp);
      // flowing dots
      if (bp >= 1) for (let k = 0; k < 3; k++) {
        const f = ((t - tb(i)) * 0.55 + k / 3) % 1; const q = pointAt(pl, f);
        ctx.fillStyle = `rgba(10,108,224,${Math.sin(f * Math.PI)})`; ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, 7); ctx.fill();
      }
      const y = ROW.y(i), rp = P(t, tb(i) + 0.3, tb(i) + 1.0);
      if (bp >= 1) { ctx.fillStyle = COL.blue; ctx.beginPath(); ctx.arc(ROW.ax, y, 4.5, 0, 7); ctx.fill();
        const rg = P(t, tb(i) + 0.45, tb(i) + 1.2, E.outC); if (rg < 1) { ctx.strokeStyle = `rgba(10,108,224,${1 - rg})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(ROW.ax, y, 4 + rg * 22, 0, 7); ctx.stroke(); } }
      if (rp <= 0) return;
      ctx.save(); ctx.globalAlpha = 1 - out;
      // highlight sweep during hold
      const hl = env(t, 20.3 + i * 0.36, 20.45 + i * 0.36, 20.55 + i * 0.36, 20.85 + i * 0.36);
      if (hl > 0) { ctx.fillStyle = `rgba(10,108,224,${0.06 * hl})`; ctx.fillRect(ROW.x0 - 14, y - 46, ROW.x1 - ROW.x0 + 28, 92); }
      // hairline
      ctx.strokeStyle = COL.pale; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ROW.x0, y + 50); ctx.lineTo(lerp(ROW.x0, ROW.x1, E.outC(rp)), y + 50); ctx.stroke();
      // formula
      const fp = E.outExpo(P(t, tb(i) + 0.3, tb(i) + 0.9));
      ctx.save(); ctx.beginPath(); ctx.rect(ROW.x0 - 4, y - 40, 330, 70); ctx.clip();
      drawFormula(ctx, p.f, ROW.x0, y + 14 + (1 - fp) * 60, { f: F.num, w: 300, s: 32, c: COL.ink });
      ctx.restore();
      TUp(ctx, p.name, 1300, y + 4, { f: F.sans, w: 500, s: 26, c: COL.ink, ls: 3 }, P(t, tb(i) + 0.38, tb(i) + 1.0));
      T(ctx, p.use, 1301, y + 33, { f: F.sans, s: 16, c: COL.ink2, ls: 1, al: P(t, tb(i) + 0.55, tb(i) + 1.0) });
      // capacity
      const cv = p.v * E.outExpo(P(t, tb(i) + 0.4, tb(i) + 1.2));
      const us = { f: F.sans, s: 17, c: COL.ink2, a: 'right', ls: 1 };
      const uw = MW(ctx, p.unit, us);
      T(ctx, p.unit, ROW.x1, y + 12, { ...us, al: P(t, tb(i) + 0.5, tb(i) + 0.9) });
      const vs = p.d ? cv.toFixed(p.d) : fmt(cv);
      TUp(ctx, vs, ROW.x1 - uw - 10, y + 12, { f: F.num, w: 300, s: 42, c: COL.blue, a: 'right' }, P(t, tb(i) + 0.35, tb(i) + 0.9));
      ctx.restore();
    });
  }
  return { draw, branchPts, tb };
})();
