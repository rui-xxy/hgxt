// ============================================================
//  Scenes 4–8   环 · 智 · 誉 · 地 · 光   + HUD
// ============================================================

// ---------- S4 环 : the closed loop → vortex ----------
const S4 = (() => {
  const C = RING.C, RR = RING.R;
  const rotA = t => 5.4 * E.inC(P(t, 33.0, 35.45));
  const radR = t => RR * (1 - E.inQ(P(t, 33.25, 35.45)));
  function nodePos(k, t) {
    const a = RING.ang[k] * Math.PI / 180 + rotA(t), r = radR(t);
    return [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r, a];
  }
  const FLOWS = [
    { from: 'sulf', to: 'H', bend: 78, label: '稀硫酸', t0: 24.5 },
    { from: 'sulf', to: 'ldh', bend: 'outer', label: 'CO₂', t0: 26.5 },
    { from: 'H', to: 'iron', bend: -70, label: '焙烧渣', t0: 28.5 },
    { from: 'H', to: 'sulf', bend: 78, label: '低温余热', t0: 30.5 },
  ];
  const CALL = [
    { tag: 'LOOP 01 · 稀酸回用', title: '废酸不废', m: '1 : 3.5', d: '每吨氨基磺酸副产约 3.5 吨稀酸，回送制酸与硫酸镁车间' },
    { tag: 'LOOP 02 · 碳资源化', title: '以废治废', m: '6000 t/a', d: '合成副产 CO₂ 净化后专管输送，作水滑石碳化原料' },
    { tag: 'LOOP 03 · 固废利用', title: '废渣变现', m: '20.15 万 t/a', d: '焙烧渣经弱氧焙烧、磁选，转为铁精粉外售' },
    { tag: 'LOOP 04 · 热耦合', title: '热量接力', m: '', d: '干吸工序低温余热经除盐水闭路循环，为氨基磺酸供热' },
  ];
  const R = rng(21);
  const PARTS = Array.from({ length: 170 }, () => ({ a0: R() * Math.PI * 2, r0: 330 + R() * 650, d: R() * 0.7, s: 0.8 + R() * 1.6, z: R() }));

  function endpoint(k, t, hs, toward) {
    if (k === 'H') { const a = Math.atan2(toward[1] - hs.y, toward[0] - hs.x); return [hs.x + Math.cos(a) * (hs.r + 8), hs.y + Math.sin(a) * (hs.r + 8)]; }
    const n = nodePos(k, t); const a = Math.atan2(toward[1] - n[1], toward[0] - n[0]); return [n[0] + Math.cos(a) * 16, n[1] + Math.sin(a) * 16];
  }
  function flowPath(fl, t, hs) {
    const pA = fl.from === 'H' ? [hs.x, hs.y] : nodePos(fl.from, t), pB = fl.to === 'H' ? [hs.x, hs.y] : nodePos(fl.to, t);
    const a = endpoint(fl.from, t, hs, pB), b = endpoint(fl.to, t, hs, pA);
    let c;
    if (fl.bend === 'outer') {
      const m = (RING.ang[fl.from] + RING.ang[fl.to]) / 2 * Math.PI / 180 + rotA(t);
      c = [C[0] + Math.cos(m) * radR(t) * 1.55, C[1] + Math.sin(m) * radR(t) * 1.55];
    } else {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      c = [mx - dy / l * fl.bend, my + dx / l * fl.bend];
    }
    return withLen(quad(a, c, b, 36));
  }
  function arrow(ctx, pl, col) {
    const q = pointAt(pl, 1), p = pointAt(pl, 0.97); const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(a); ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-11, -6); ctx.lineTo(-8, 0); ctx.lineTo(-11, 6); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function draw(ctx, t) {
    if (t < 23.3 || t > 36.05) return;
    const hs = heartState(t);
    const morph = P(t, 23.4, 24.4, E.ioC);
    const vort = P(t, 33.0, 35.45);
    const labA = P(t, 24.0, 24.6) * (1 - P(t, 33.0, 33.4));
    const spokeA = 1 - P(t, 34.4, 35.2);

    // vortex particles (behind)
    if (t > 32.9) {
      const pa = P(t, 32.9, 33.5);
      PARTS.forEach(p => {
        const u = E.inC(P(t, 33.0 + p.d, 35.5));
        const f = (uu) => { const ang = p.a0 + 4.2 * uu * p.s + (t - 33) * 0.35; const r = p.r0 * (1 - uu) + 4; return [hs.x + Math.cos(ang) * r, hs.y + Math.sin(ang) * r * 0.92]; };
        const al = pa * (1 - P(u, 0.85, 1)) * (0.35 + 0.65 * p.z);
        if (al <= 0) return;
        ctx.strokeStyle = p.z > 0.6 ? `rgba(39,180,245,${al})` : `rgba(10,108,224,${al})`; ctx.lineWidth = 1 + p.z * 2; ctx.lineCap = 'round';
        ctx.beginPath(); for (let j = 0; j <= 6; j++) { const q = f(Math.max(0, u - j * 0.006 - 0.004)); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke();
      });
    }

    // spokes / morphing branches
    PRODUCTS.forEach((p, i) => {
      const n = nodePos(p.k, t);
      let pl;
      if (morph < 1) {
        const y = ROW.y(i);
        const A = [[hs.x + hs.r + 10, hs.y], [hs.x + hs.r + 180, hs.y], [ROW.ax - 170, y], [ROW.ax, y]];
        const ang = Math.atan2(n[1] - hs.y, n[0] - hs.x);
        const s0 = [hs.x + Math.cos(ang) * (hs.r + 8), hs.y + Math.sin(ang) * (hs.r + 8)], s1 = [n[0] - Math.cos(ang) * 15, n[1] - Math.sin(ang) * 15];
        const B = [s0, [lerp(s0[0], s1[0], 1 / 3), lerp(s0[1], s1[1], 1 / 3)], [lerp(s0[0], s1[0], 2 / 3), lerp(s0[1], s1[1], 2 / 3)], s1];
        const Q = A.map((a, k) => [lerp(a[0], B[k][0], morph), lerp(a[1], B[k][1], morph)]);
        pl = withLen(cubic(Q[0], Q[1], Q[2], Q[3], 30));
        ctx.strokeStyle = `rgba(10,108,224,${lerp(1, 0.35, morph)})`; ctx.lineWidth = 1.6; strokePartial(ctx, pl, 1);
      } else if (spokeA > 0) {
        const ang = Math.atan2(n[1] - hs.y, n[0] - hs.x);
        const s0 = [hs.x + Math.cos(ang) * (hs.r + 8), hs.y + Math.sin(ang) * (hs.r + 8)], s1 = [n[0] - Math.cos(ang) * 15, n[1] - Math.sin(ang) * 15];
        pl = withLen([s0, s1]);
        ctx.strokeStyle = `rgba(10,108,224,${0.35 * spokeA})`; ctx.lineWidth = 1.5; strokePartial(ctx, pl, 1);
        if (vort < 0.3) for (let k = 0; k < 2; k++) {
          const f = ((t * 0.6 + k / 2 + i * 0.17) % 1); const q = pointAt(pl, f);
          ctx.fillStyle = `rgba(10,108,224,${Math.sin(f * Math.PI) * spokeA * (1 - vort * 3)})`; ctx.beginPath(); ctx.arc(q[0], q[1], 2.6, 0, 7); ctx.fill();
        }
      }
    });

    // exhaust gas: all → heart (32.2+)
    const gas = P(t, 32.0, 32.5) * (1 - P(t, 33.1, 33.6));
    if (gas > 0) {
      PRODUCTS.forEach((p, i) => {
        const n = nodePos(p.k, t);
        for (let k = 0; k < 4; k++) {
          const f = ((t * 0.9 + k / 4 + i * 0.11) % 1);
          const x = lerp(n[0], hs.x, f), y = lerp(n[1], hs.y, f);
          ctx.fillStyle = `rgba(71,89,122,${gas * Math.sin(f * Math.PI) * 0.8})`; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
        }
      });
      T(ctx, '废气统一接入制酸系统处置', hs.x, hs.y + hs.r + 54, { f: F.sans, w: 500, s: 18, c: COL.ink2, a: 'center', ls: 2, al: gas });
    }

    // return flows
    const flA = 1 - P(t, 33.0, 33.6);
    if (flA > 0) FLOWS.forEach((fl, k) => {
      const fp = P(t, fl.t0, fl.t0 + 0.7, E.ioC);
      if (fp <= 0) return;
      const pl = flowPath(fl, t, hs);
      const active = t < fl.t0 + 2.0;
      ctx.save(); ctx.globalAlpha = flA; ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(39,180,245,${active ? 0.22 : 0.12})`; ctx.lineWidth = active ? 12 : 8; strokePartial(ctx, pl, fp);
      ctx.strokeStyle = COL.cyan; ctx.lineWidth = 2.6; ctx.setLineDash([10, 9]); ctx.lineDashOffset = -t * 46; strokePartial(ctx, pl, fp); ctx.setLineDash([]);
      if (fp >= 1) arrow(ctx, pl, COL.cyan);
      const m = pointAt(pl, 0.5);
      const la = P(t, fl.t0 + 0.45, fl.t0 + 0.8);
      if (la > 0) {
        const ts = { f: F.sans, w: 500, s: 16, c: COL.deep, a: 'center', ls: 2 };
        const w = MW(ctx, fl.label, ts) + 24;
        ctx.globalAlpha = flA * la; ctx.fillStyle = COL.paper; ctx.strokeStyle = COL.cyan; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.roundRect(m[0] - w / 2, m[1] - 15, w, 30, 15); ctx.fill(); ctx.stroke();
        T(ctx, fl.label, m[0], m[1] + 6, ts);
      }
      ctx.restore();
    });

    // nodes + trails
    PRODUCTS.forEach((p, i) => {
      const n = nodePos(p.k, t);
      if (vort > 0) {
        ctx.lineCap = 'round';
        for (let j = 1; j < 22; j++) {
          const a = nodePos(p.k, t - (j - 1) * 0.02), b = nodePos(p.k, t - j * 0.02);
          ctx.strokeStyle = `rgba(10,108,224,${(1 - j / 22) * 0.8 * P(t, 33.1, 33.6)})`; ctx.lineWidth = 6 * (1 - j / 22) * (1 - vort * 0.5);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
      }
      const na = morph * (1 - P(t, 35.1, 35.45));
      if (na <= 0) return;
      const act = FLOWS.some(fl => (fl.from === p.k || fl.to === p.k) && t > fl.t0 && t < fl.t0 + 2.0);
      const nr = 11 * (1 - vort * 0.4);
      ctx.save(); ctx.globalAlpha = na;
      ctx.fillStyle = act || vort > 0 ? COL.blue : COL.paper; ctx.strokeStyle = COL.blue; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(n[0], n[1], nr, 0, 7); ctx.fill(); ctx.stroke();
      if (act) { const ph = ((t * 1.4) % 1); ctx.strokeStyle = `rgba(10,108,224,${1 - ph})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(n[0], n[1], nr + ph * 22, 0, 7); ctx.stroke(); }
      ctx.restore();
      if (labA > 0) {
        const a = n[2], cs = Math.cos(a), sn = Math.sin(a);
        const al = cs > 0.35 ? 'left' : cs < -0.35 ? 'right' : 'center';
        const lx = n[0] + cs * 28, ly = n[1] + sn * 30 + (sn > 0.5 ? 18 : sn < -0.5 ? -4 : 7);
        T(ctx, p.name, lx, ly, { f: F.sans, w: 500, s: 21, c: act ? COL.blue : COL.ink, a: al, ls: 2, al: labA });
      }
    });

    // titles
    const tA = P(t, 24.3, 24.9) * (1 - P(t, 33.0, 33.4));
    T(ctx, typeOn('04 · CIRCULAR ECONOMY / 循环经济', P(t, 24.3, 24.9)), 164, 150, { f: F.mono, s: 14, c: COL.ink3, ls: 3, al: 1 - P(t, 34.9, 35.3) });
    TUp(ctx, '每一份副产，都有去处', 160, 232, { f: F.serif, w: 700, s: 58, c: COL.ink, ls: 6 }, P(t, 24.4, 25.1), P(t, 31.75, 32.1));
    if (t > 32.2) TUp(ctx, '吃干榨净，变废为宝', 160, 238, { f: F.serif, w: 900, s: 70, c: COL.ink, ls: 8 }, P(t, 32.0, 32.7), P(t, 34.9, 35.3));

    // callouts
    const cOut = 1 - P(t, 32.0, 32.6);
    if (cOut > 0) CALL.forEach((c, k) => {
      const t0 = FLOWS[k].t0 + 0.3, y0 = 300 + k * 142;
      if (t < t0) return;
      const focus = k === 3 ? 1 : 1 - 0.55 * P(t, FLOWS[k + 1].t0 + 0.2, FLOWS[k + 1].t0 + 0.6);
      ctx.save(); ctx.globalAlpha = cOut * focus;
      T(ctx, typeOn(c.tag, P(t, t0, t0 + 0.4)), 1222, y0, { f: F.mono, s: 13, c: COL.blue, ls: 2 });
      TUp(ctx, c.title, 1220, y0 + 50, { f: F.serif, w: 700, s: 36, c: COL.ink, ls: 4 }, P(t, t0 + 0.1, t0 + 0.7));
      if (c.m) TUp(ctx, c.m, 1780, y0 + 50, { f: F.num, w: 300, s: 40, c: COL.blue, a: 'right' }, P(t, t0 + 0.25, t0 + 0.85));
      T(ctx, c.d, 1222, y0 + 88, { f: F.sans, s: 18, c: COL.ink2, ls: 1, al: P(t, t0 + 0.35, t0 + 0.8) });
      ctx.strokeStyle = COL.pale; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1220, y0 + 112); ctx.lineTo(lerp(1220, 1780, P(t, t0, t0 + 0.8, E.outC)), y0 + 112); ctx.stroke();
      ctx.restore();
    });
  }
  return { draw };
})();

// ---------- S5 智 : DCS control room (deep blue) ----------
const S5 = (() => {
  const X0 = 160, Y0 = 368, GW = 1600, GH = 600, GAP = 24;
  const PW = (GW - GAP * 2) / 3, PH = (GH - GAP) / 2;
  const PANELS = [
    { n: '硫酸车间', v: '6000', u: 'kW', l: '余热发电 POWER' },
    { n: '二乙基蒽醌车间', v: '5000', u: 't/a', l: '设计产能 CAPACITY' },
    { n: '氨基磺酸车间', v: '2', u: '万 t/a', l: '设计产能 CAPACITY' },
    { n: '硫酸镁车间', v: '15', u: '万 t/a', l: '设计产能 CAPACITY' },
    { n: '镁铝水滑石车间', v: '1.2', u: '万 t/a', l: '设计产能 CAPACITY' },
    { n: '焦磷酸哌嗪车间', v: '1', u: '万 t/a', l: '设计产能 CAPACITY' },
  ];
  const sig = (u, s, k) => Math.sin(u * 0.9 + s) * 0.6 + Math.sin(u * 2.3 + s * 2) * 0.3 + Math.sin(u * 5.1 + s * 3 + k) * 0.12;
  function panel(ctx, i, t, x, y) {
    const p = PANELS[i];
    const ap = P(t, 36.0 + i * 0.1, 36.45 + i * 0.1, E.outC);
    if (ap <= 0) return;
    ctx.save(); ctx.globalAlpha = ap;
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.strokeStyle = 'rgba(120,185,255,0.30)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, PW, PH, 6); ctx.fill(); ctx.stroke();
    T(ctx, p.n, x + 24, y + 42, { f: F.sans, w: 500, s: 22, c: '#FFFFFF', ls: 2 });
    T(ctx, 'DCS-0' + (i + 1), x + PW - 24, y + 40, { f: F.mono, s: 13, c: COL.cyan, a: 'right', ls: 2 });
    const ph = (t * 1.3 + i * 0.37) % 1;
    ctx.fillStyle = COL.cyan; ctx.beginPath(); ctx.arc(x + PW - 112, y + 35, 4, 0, 7); ctx.fill();
    ctx.strokeStyle = `rgba(39,180,245,${1 - ph})`; ctx.beginPath(); ctx.arc(x + PW - 112, y + 35, 4 + ph * 9, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.moveTo(x, y + 62); ctx.lineTo(x + PW, y + 62); ctx.stroke();
    // chart
    const cx0 = x + 24, cx1 = x + PW - 24, cy0 = y + 84, cy1 = y + PH - 100;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.setLineDash([2, 6]);
    for (let k = 0; k <= 3; k++) { const yy = lerp(cy0, cy1, k / 3); ctx.beginPath(); ctx.moveTo(cx0, yy); ctx.lineTo(cx1, yy); ctx.stroke(); }
    ctx.setLineDash([]);
    const draw = P(t, 36.2 + i * 0.1, 37.0 + i * 0.1, E.outC);
    const cols = [COL.cyan, '#8FC2FF', 'rgba(255,255,255,0.55)'];
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = cols[k]; ctx.lineWidth = k === 0 ? 2.2 : 1.4; ctx.beginPath();
      const N = 90; let last;
      for (let j = 0; j <= N * draw; j++) {
        const u = j / N, xx = lerp(cx0, cx1, u);
        const v = sig(u * 9 + t * (0.9 + k * 0.3), i * 1.7 + k * 2.1, k);
        const yy = lerp(cy0, cy1, 0.5 + (k - 1) * 0.22) - v * (cy1 - cy0) * 0.22;
        j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); last = [xx, yy];
      }
      ctx.stroke();
      if (last && k === 0) { ctx.fillStyle = COL.cyan; ctx.beginPath(); ctx.arc(last[0], last[1], 4, 0, 7); ctx.fill(); }
    }
    // readout
    T(ctx, p.l, x + 24, y + PH - 64, { f: F.mono, s: 11, c: 'rgba(39,180,245,0.9)', ls: 2 });
    const vs = { f: F.num, w: 300, s: 46, c: '#FFFFFF' };
    T(ctx, p.v, x + 22, y + PH - 22, vs);
    T(ctx, p.u, x + 30 + MW(ctx, p.v, vs), y + PH - 24, { f: F.sans, s: 18, c: 'rgba(255,255,255,0.7)', ls: 1 });
    const chip = 'RUN · 连续运行'; const cs = { f: F.mono, s: 12, c: COL.cyan, a: 'right', ls: 1.5 };
    const cw = MW(ctx, chip, cs) + 22;
    ctx.strokeStyle = 'rgba(39,180,245,0.55)'; ctx.beginPath(); ctx.roundRect(x + PW - 24 - cw, y + PH - 44, cw, 26, 13); ctx.stroke();
    T(ctx, chip, x + PW - 35, y + PH - 26, cs);
    ctx.restore();
  }
  function draw(ctx, t) {
    if (t < 36.0 || t >= 42.0) return;
    ctx.fillStyle = COL.navy; ctx.fillRect(0, 0, W, H);
    drawGrid(ctx, 0.9, '255,255,255');
    const g = ctx.createRadialGradient(960, 540, 100, 960, 540, 1100); g.addColorStop(0, 'rgba(39,120,245,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const out = P(t, 41.55, 42.0, E.inQ);
    const e = P(t, 36.0, 37.9, E.ioC);
    const s = lerp(2.15, 1, e) * (1 + out * 0.04);
    const anchor = [X0 + PW / 2, Y0 + PH / 2];
    const dest = [lerp(960, anchor[0], e), lerp(560, anchor[1], e)];
    ctx.save(); ctx.globalAlpha = 1 - out;
    ctx.translate(dest[0], dest[1]); ctx.scale(s, s); ctx.translate(-anchor[0], -anchor[1]);
    for (let i = 0; i < 6; i++) panel(ctx, i, t, X0 + (i % 3) * (PW + GAP), Y0 + Math.floor(i / 3) * (PH + GAP));
    // scan line
    const sy = Y0 + ((t - 36.0) * 260) % (GH + 200) - 100;
    const sg = ctx.createLinearGradient(0, sy - 60, 0, sy); sg.addColorStop(0, 'rgba(39,180,245,0)'); sg.addColorStop(1, 'rgba(39,180,245,0.10)');
    ctx.fillStyle = sg; ctx.fillRect(X0, Math.max(Y0, sy - 60), GW, Math.min(60, Math.max(0, sy - Y0)));
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 1 - out;
    T(ctx, typeOn('05 · DCS CONTROL ROOM / 中控室', P(t, 37.4, 38.0)), 164, 168, { f: F.mono, s: 14, c: COL.cyan, ls: 3 });
    TChars(ctx, '六大车间，集中控制', 160, 266, { f: F.serif, w: 700, s: 70, c: '#FFFFFF', ls: 6 }, t, 37.6, 0.05, 0.6);
    T(ctx, '关键参数集中监控 · 报警联锁 · 全员持证上岗 · 三班连续化生产', 162, 318, { f: F.sans, s: 22, c: 'rgba(255,255,255,0.68)', ls: 2, al: P(t, 38.2, 38.8) });
    ctx.restore();
  }
  return { draw };
})();

// ---------- S6 誉 : credentials on the beat ----------
const S6 = (() => {
  const CARDS = [
    { bg: 'w', tag: 'INTELLECTUAL PROPERTY / 知识产权' },
    { bg: 'b', tag: '恒光股份 · 2022', main: '国家知识产权优势企业', s: 100 },
    { bg: 'w', tag: '恒光股份 · 工业和信息化部', main: '国家级绿色工厂', s: 128 },
    { bg: 'b', tag: '衡阳丰联 · 2023 · 第十一批', main: '湖南省新材料企业', s: 120 },
    { bg: 'w', tag: '湖南恒光化工', main: '安全生产标准化二级企业', s: 90 },
    { bg: 'b', tag: '衡阳基地', lines: ['省级企业技术中心', '省级绿色工厂', '省级节水标杆企业'] },
    { bg: 'w', tag: 'SZSE CHINEXT · 2021.11.18' },
  ];
  const T0 = k => 42 + k;
  const TL = [['2008', '恒光化工落户松木工业园'], ['2017', '衡阳丰联成立'], ['2018', '湖南省科技进步奖'], ['2021', '恒光股份创业板上市'], ['2024', '老挝海外基地设立'], ['2025', '集团营收创 15 亿元新高']];
  function card(ctx, k, t) {
    const c = CARDS[k], dark = c.bg === 'b', lt = t - T0(k);
    ctx.fillStyle = dark ? COL.deep : COL.paper; ctx.fillRect(0, 0, W, H);
    if (dark) { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0D4FCF'); g.addColorStop(1, '#0A2A80'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    drawGrid(ctx, dark ? 0.8 : 1, dark ? '255,255,255' : '11,108,224');
    const ink = dark ? '#FFFFFF' : COL.ink, sub = dark ? 'rgba(255,255,255,0.7)' : COL.ink2, acc = dark ? '#9FD3FF' : COL.blue;
    // honour seal (rotating ring of type)
    if (k < 6) {
      const sx = 1560, sy = 560, sc = 0.94 + 0.06 * E.outC(clamp(lt / 0.5));
      ctx.save(); ctx.translate(sx, sy); ctx.scale(sc, sc); ctx.rotate(t * 0.12 + k * 0.4);
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(10,108,224,0.14)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 270, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 200, 0, 7); ctx.stroke();
      for (let q = 0; q < 120; q++) { const a = q / 120 * Math.PI * 2, l = q % 10 === 0 ? 16 : 7; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 200, Math.sin(a) * 200); ctx.lineTo(Math.cos(a) * (200 + l), Math.sin(a) * (200 + l)); ctx.stroke(); }
      const txt = 'HENGGUANG · HENGYANG BASE · 恒光 · 衡阳基地 · SINCE 2008 · ';
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(10,108,224,0.26)'; ctx.font = `400 15px ${F.mono}`; ctx.textAlign = 'center'; ctx.letterSpacing = '0px';
      const ch = [...txt]; ch.forEach((cch, q) => { const a = q / ch.length * Math.PI * 2; ctx.save(); ctx.rotate(a); ctx.translate(0, -238); ctx.fillText(cch, 0, 5); ctx.restore(); });
      ctx.restore();
      T(ctx, String(k + 1).padStart(2, '0'), sx, sy + 40, { f: F.num, w: 100, s: 130, c: dark ? 'rgba(255,255,255,0.22)' : 'rgba(10,108,224,0.18)', a: 'center' });
      T(ctx, '/ 06', sx, sy + 84, { f: F.mono, s: 13, c: dark ? 'rgba(255,255,255,0.4)' : COL.ink3, a: 'center', ls: 3 });
    }
    T(ctx, typeOn(c.tag, clamp(lt / 0.3)), 164, 330, { f: F.mono, s: 16, c: acc, ls: 3 });
    ctx.fillStyle = acc; ctx.fillRect(164, 350, 60 * E.outC(clamp(lt / 0.4)), 3);
    if (k === 0) {
      const v = 90 * E.outExpo(clamp((lt - 0.05) / 0.5));
      const ns = { f: F.num, w: 100, s: 400, c: COL.blue, ls: -10 };
      TUp(ctx, String(Math.round(v)), 140, 720, ns, clamp(lt / 0.35));
      TUp(ctx, '项专利', 140 + MW(ctx, '90', ns) + 40, 716, { f: F.serif, w: 900, s: 84, c: ink, ls: 8 }, clamp((lt - 0.12) / 0.4));
      T(ctx, '恒光化工 51 项 ＋ 衡阳丰联 39 项', 164, 800, { f: F.sans, s: 24, c: sub, ls: 3, al: clamp((lt - 0.25) / 0.3) });
    } else if (k === 5) {
      c.lines.forEach((l, j) => TUp(ctx, l, 156, 500 + j * 112, { f: F.serif, w: 900, s: 84, c: ink, ls: 8 }, clamp((lt - j * 0.1) / 0.4)));
    } else if (k === 6) {
      const ns = { f: F.num, w: 200, s: 250, c: ink, ls: -6 };
      TUp(ctx, '301118', 144, 610, ns, clamp(lt / 0.4));
      TUp(ctx, '.SZ', 144 + MW(ctx, '301118', ns) + 10, 610, { f: F.num, w: 300, s: 110, c: COL.blue }, clamp((lt - 0.12) / 0.4));
      T(ctx, '深交所创业板上市公司 · 恒光股份', 164, 690, { f: F.serif, w: 600, s: 40, c: ink, ls: 4, al: clamp((lt - 0.2) / 0.35) });
      // timeline
      const y = 880, x0 = 164, x1 = 1756;
      const lp = E.ioC(clamp((lt - 0.2) / 1.5));
      ctx.strokeStyle = COL.pale; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.strokeStyle = COL.blue; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(lerp(x0, x1, lp), y); ctx.stroke();
      TL.forEach((it, j) => {
        const x = lerp(x0, x1 - 250, j / (TL.length - 1));
        const on = clamp(((lerp(x0, x1, lp)) - x) / 60);
        ctx.fillStyle = on > 0 ? COL.blue : COL.paper; ctx.strokeStyle = on > 0 ? COL.blue : COL.ink3; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 6 + 2 * E.outBack(on), 0, 7); ctx.fill(); ctx.stroke();
        TUp(ctx, it[0], x - 2, y - 26, { f: F.num, w: 300, s: 34, c: ink }, on);
        T(ctx, it[1], x, y + 42, { f: F.sans, s: 18, c: sub, ls: 1, al: on });
      });
      const hd = pointAt(withLen([[x0, y], [x1, y]]), lp);
      ctx.fillStyle = COL.cyan; ctx.beginPath(); ctx.arc(hd[0], y, 5, 0, 7); ctx.fill();
    } else {
      TUp(ctx, c.main, 152, 620, { f: F.serif, w: 900, s: c.s, c: ink, ls: 8 }, clamp(lt / 0.42));
    }
  }
  function draw(ctx, t) {
    if (t < 42 || t >= 50.6) return;
    let k = Math.min(6, Math.floor(t - 42));
    // previous card underneath during wipe
    const lt = t - T0(k);
    if (k > 0 && lt < 0.2) {
      card(ctx, k - 1, T0(k) - 0.001);
      const e = E.outExpo(clamp(lt / 0.2));
      ctx.save(); ctx.beginPath(); ctx.rect(W * (1 - e), 0, W * e + 1, H); ctx.clip(); card(ctx, k, t); ctx.restore();
      ctx.fillStyle = CARDS[k].bg === 'b' ? COL.cyan : COL.blue; ctx.fillRect(W * (1 - e) - 6, 0, 6, H);
    } else card(ctx, k, t);
    // fade to S7
    const fo = P(t, 50.0, 50.6);
    if (fo > 0) { ctx.fillStyle = `rgba(245,248,252,${fo})`; ctx.fillRect(0, 0, W, H); drawGrid(ctx, fo); }
  }
  const isDark = t => t >= 42 && t < 50 && CARDS[Math.min(6, Math.floor(t - 42))].bg === 'b' && (t - Math.floor(t)) > 0.1;
  return { draw, isDark };
})();

// ---------- floating cubes (S7 → S8 finale) ----------
const LOGO_T = { k: 6.6, ox: 471.6, oy: 134.4 };
const lp = (x, y) => [LOGO_T.ox + x * LOGO_T.k, LOGO_T.oy + y * LOGO_T.k];
const TILE_ORDER = ['T2', 'F2', 'T1', 'F1'];
function cubeFloat(j, t) {
  const d = t - 50.6;
  return [-80 - j * 120 + d * 150, 168 + j * 26 + Math.sin(t * 1.4 + j * 1.3) * 8 - d * 3];
}
function drawFloatingCubes(ctx, t) {
  if (t < 50.6 || t > 58.2) return;
  TILE_ORDER.forEach((id, j) => {
    const tile = LOGO.tiles.find(q => q.id === id);
    const tc = tile.pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
    const tgt = lp(tc[0], tc[1]);
    const fs = 56.45 + j * 0.25, fe = fs + 0.6;
    let pos = cubeFloat(j, Math.min(t, fs)), u = P(t, fs, fe, E.ioC);
    if (t > fs) {
      const a = cubeFloat(j, fs); const c = [lerp(a[0], tgt[0], 0.5), Math.min(a[1], tgt[1]) - 160];
      const v = 1 - u; pos = [v * v * a[0] + 2 * v * u * c[0] + u * u * tgt[0], v * v * a[1] + 2 * v * u * c[1] + u * u * tgt[1]];
    }
    const m = P(u, 0.7, 1);
    if (m < 1) {
      const sp = t * 1.2 + j;
      drawCube(ctx, pos[0], pos[1], 15 * (1 - 0.3 * u), sp, 0.5 + Math.sin(sp) * 0.2, 0.3 * j + u * 2, { fill: 1 - m, light: '#7CC6FF', seam: 'rgba(255,255,255,0.2)' });
    }
    if (m > 0) {
      ctx.save(); ctx.globalAlpha = m; ctx.fillStyle = tile.band === 'upper' ? LOGO.grads.tileU : LOGO.grads.tileL;
      ctx.beginPath(); tile.pts.forEach((p, i) => { const q = lp(p[0], p[1]); const qq = [lerp(pos[0], q[0], m), lerp(pos[1], q[1], m)]; i ? ctx.lineTo(...qq) : ctx.moveTo(...qq); }); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  });
}
function drawLandedTiles(ctx, t, alpha = 1) {
  TILE_ORDER.forEach((id, j) => {
    const land = 57.05 + j * 0.25;
    if (t < land) return;
    const tile = LOGO.tiles.find(q => q.id === id);
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = tile.band === 'upper' ? LOGO.grads.tileU : LOGO.grads.tileL;
    ctx.beginPath(); tile.pts.forEach((p, i) => { const q = lp(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.fill();
    // snap flash
    const f = P(t, land, land + 0.4, E.outC);
    if (f < 1) {
      const tc = tile.pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]); const c = lp(tc[0], tc[1]);
      ctx.strokeStyle = `rgba(39,180,245,${1 - f})`; ctx.lineWidth = 2; const s = 1 + f * 1.6;
      ctx.beginPath(); tile.pts.forEach((p, i) => { const q = lp(p[0], p[1]); const qq = [c[0] + (q[0] - c[0]) * s, c[1] + (q[1] - c[1]) * s]; i ? ctx.lineTo(...qq) : ctx.moveTo(...qq); }); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  });
}

// ---------- S7 地 : Xiang River / Songmu ----------
const S7 = (() => {
  const river = withLen(cubic([2010, 40], [1520, 240], [1560, 780], [1060, 1150], 80));
  function offsetLine(off) {
    const pts = river.pts.map((p, i) => {
      const a = river.pts[Math.max(0, i - 1)], b = river.pts[Math.min(river.pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [p[0] - dy / l * off, p[1] + dx / l * off];
    });
    return withLen(pts);
  }
  const lines = Array.from({ length: 7 }, (_, i) => offsetLine(-54 + i * 18));
  const bankW = offsetLine(-80), bankE = offsetLine(80);
  const mk = (() => { const q = pointAt(bankW, 0.42); return [q[0] - 70, q[1] + 10]; })();
  function draw(ctx, t) {
    if (t < 50.0 || t > 55.6) return;
    const inA = P(t, 50.0, 50.6), out = P(t, 53.9, 54.6, E.outQ);
    const rp = P(t, 50.1, 51.4, E.ioC);
    ctx.save(); ctx.globalAlpha = inA * (1 - out);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = COL.pale2; ctx.lineWidth = 160; strokePartial(ctx, river, rp);
    ctx.strokeStyle = 'rgba(10,108,224,0.25)'; ctx.lineWidth = 1.2; strokePartial(ctx, bankW, rp); strokePartial(ctx, bankE, rp);
    lines.forEach((l, i) => { ctx.setLineDash([[90, 140], [40, 120], [140, 90]][i % 3]); ctx.lineDashOffset = -t * (70 + (i % 3) * 22) - i * 57; ctx.strokeStyle = `rgba(10,108,224,${0.14 + (i % 2) * 0.08})`; ctx.lineWidth = 1.4; strokePartial(ctx, l, rp); });
    ctx.setLineDash([]);
    T(ctx, '湘 江', pointAt(river, 0.72)[0] + 30, pointAt(river, 0.72)[1], { f: F.serif, w: 600, s: 24, c: COL.blue, ls: 18, al: P(t, 51.0, 51.6) });
    T(ctx, 'XIANG RIVER', pointAt(river, 0.72)[0] + 32, pointAt(river, 0.72)[1] + 24, { f: F.mono, s: 11, c: COL.ink3, ls: 2, al: P(t, 51.2, 51.8) });
    // marker
    const ma = P(t, 51.0, 51.4, E.outBack);
    if (t > 51.0) {
      for (let k = 0; k < 3; k++) { const ph = ((((t - 51 + k / 3) * 0.7) % 1) + 1) % 1; ctx.strokeStyle = `rgba(10,108,224,${0.5 * (1 - ph)})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(mk[0], mk[1], 10 + ph * 70, 0, 7); ctx.stroke(); }
      ctx.fillStyle = COL.blue; ctx.beginPath(); ctx.arc(mk[0], mk[1], 8 * ma, 0, 7); ctx.fill();
      ctx.fillStyle = COL.paper; ctx.beginPath(); ctx.arc(mk[0], mk[1], 3 * ma, 0, 7); ctx.fill();
      const lp2 = P(t, 51.3, 51.9, E.outC);
      ctx.strokeStyle = COL.blue; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(mk[0] - 14, mk[1]); ctx.lineTo(mk[0] - 14 - 160 * lp2, mk[1]); ctx.stroke();
      T(ctx, '衡阳基地', mk[0] - 190, mk[1] - 12, { f: F.sans, w: 500, s: 20, c: COL.ink, a: 'right', ls: 3, al: lp2 });
      T(ctx, 'HENGYANG BASE', mk[0] - 190, mk[1] + 14, { f: F.mono, s: 11, c: COL.ink3, a: 'right', ls: 2, al: lp2 });
    }
    // text block
    T(ctx, typeOn('07 · 湘江之滨 / ON THE XIANG RIVER', P(t, 50.4, 51.0)), 164, 330, { f: F.mono, s: 14, c: COL.ink3, ls: 3 });
    TChars(ctx, '衡阳 · 松木经开区', 156, 444, { f: F.serif, w: 900, s: 86, c: COL.ink, ls: 6 }, t, 50.55, 0.05, 0.6);
    T(ctx, '国家重点盐化工及精细化工产业基地', 162, 504, { f: F.sans, s: 26, c: COL.ink2, ls: 4, al: P(t, 51.1, 51.6) });
    const stats = [['300', '亩', '厂区占地（约）', 300], ['350', '名', '员工（约）', 350], ['2008', '', '扎根松木', 2008]];
    stats.forEach((s, i) => {
      const x = 164 + i * 300, st = 51.4 + i * 0.15;
      const v = i === 2 ? Math.round(lerp(1990, 2008, E.outExpo(P(t, st, st + 0.8)))) : Math.round(s[3] * E.outExpo(P(t, st, st + 0.8)));
      const ns = { f: F.num, w: 200, s: 92, c: COL.ink, ls: -2 };
      TUp(ctx, String(v), x - 4, 680, ns, P(t, st, st + 0.5));
      if (s[1]) T(ctx, s[1], x + MW(ctx, s[0], ns) + 8, 676, { f: F.sans, w: 500, s: 26, c: COL.blue, al: P(t, st + 0.3, st + 0.6) });
      ctx.fillStyle = COL.pale; ctx.fillRect(x, 708, 220 * P(t, st, st + 0.6, E.outC), 1);
      T(ctx, s[2], x, 738, { f: F.sans, s: 18, c: COL.ink2, ls: 2, al: P(t, st + 0.3, st + 0.7) });
    });
    ctx.restore();
  }
  return { draw };
})();

// ---------- S8 光 : the loop becomes the mark ----------
const S8 = (() => {
  let polys = null, parts = null, body = null, tmp = null;
  function init() {
    polys = [];
    for (const key of ['upper', 'lower', 'ghole']) svgToPolys(LOGO[key], 24).forEach(pl => polys.push(withLen(pl.map(p => lp(p[0], p[1])))));
    const total = polys.reduce((a, p) => a + p.len, 0);
    const R = rng(5); parts = [];
    polys.forEach((pl, pi) => {
      const n = Math.max(4, Math.round(pl.len / total * 64));
      for (let k = 0; k < n; k++) { const f = (k + 0.5) / n; parts.push({ pi, f, tgt: pointAt(pl, f), a0: R() * Math.PI * 2, r0: 650 + R() * 600, sp: (R() > 0.5 ? 1 : -1) * (2 + R() * 1.5) }); }
    });
    body = document.createElement('canvas'); body.width = W; body.height = H;
    const b = body.getContext('2d'); b.translate(LOGO_T.ox, LOGO_T.oy); b.scale(LOGO_T.k, LOGO_T.k);
    drawLogoBody(b, LOGO);
    tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
  }
  const OUT0 = 55.0, OUT1 = 56.1;
  function draw(ctx, t) {
    if (t < 54.0) return;
    if (!polys) init();
    const center = lp(74, 41.75);
    // glow
    const gl = env(t, 55.9, 56.4, 57.6, 59.5) * 0.8 + P(t, 56.2, 57.5) * 0.25;
    if (gl > 0) { const g = ctx.createRadialGradient(center[0], center[1], 40, center[0], center[1], 560); g.addColorStop(0, `rgba(39,180,245,${0.22 * gl})`); g.addColorStop(1, 'rgba(39,180,245,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    // stitching particles
    parts.forEach(p => {
      const ta = OUT0 + p.f * (OUT1 - OUT0), ts = ta - 1.15;
      const u = (t - ts) / 1.15;
      if (u <= 0) return;
      if (u >= 1) {
        const f = P(t, ta, ta + 0.3); if (f < 1) { ctx.fillStyle = `rgba(39,180,245,${1 - f})`; ctx.beginPath(); ctx.arc(p.tgt[0], p.tgt[1], 3 + f * 9, 0, 7); ctx.fill(); }
        return;
      }
      const pos = uu => { const e = 1 - E.outC(clamp(uu)); const a = p.a0 + p.sp * uu; return [p.tgt[0] + Math.cos(a) * p.r0 * e, p.tgt[1] + Math.sin(a) * p.r0 * e]; };
      ctx.lineCap = 'round';
      for (let j = 1; j < 12; j++) {
        const a = pos(u - (j - 1) * 0.022), b = pos(u - j * 0.022);
        ctx.strokeStyle = `rgba(10,108,224,${(1 - j / 12) * 0.85 * clamp(u * 4)})`; ctx.lineWidth = 2.4 * (1 - j / 12);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      const h = pos(u); ctx.fillStyle = COL.blue; ctx.beginPath(); ctx.arc(h[0], h[1], 2.6, 0, 7); ctx.fill();
    });
    // outline
    const op = P(t, OUT0, OUT1);
    const oa = 1 - P(t, 56.45, 56.95);
    if (op > 0 && oa > 0) {
      ctx.save(); ctx.globalAlpha = oa; ctx.strokeStyle = COL.blue; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      polys.forEach(pl => strokePartial(ctx, pl, op));
      if (op < 1) polys.forEach(pl => { const q = pointAt(pl, op); ctx.fillStyle = COL.cyan; ctx.beginPath(); ctx.arc(q[0], q[1], 4.5, 0, 7); ctx.fill(); });
      ctx.restore();
    }
    // colour fill: radial wipe from the bowl
    const fp = P(t, 55.95, 56.8, E.ioC);
    const fade = 1 - P(t, 63.1, 63.95);
    if (fp > 0) {
      const o = lp(46, 62), r = fp * 820;
      ctx.save(); ctx.globalAlpha = fade;
      if (fp < 1) { ctx.beginPath(); ctx.arc(o[0], o[1], r, 0, 7); ctx.clip(); }
      // light sweep
      const sw = P(t, 60.3, 61.5, E.ioQ);
      if (sw > 0 && sw < 1) {
        const tc = tmp.getContext('2d'); tc.clearRect(0, 0, W, H); tc.globalCompositeOperation = 'source-over'; tc.drawImage(body, 0, 0);
        tc.globalCompositeOperation = 'source-atop';
        const x = lerp(500, 1500, sw); const g = tc.createLinearGradient(x - 160, 0, x + 160, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.42)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        tc.fillStyle = g; tc.save(); tc.translate(x, 400); tc.transform(1, 0, -0.35, 1, 0, 0); tc.translate(-x, -400); tc.fillRect(x - 200, 0, 400, H); tc.restore();
        ctx.drawImage(tmp, 0, 0);
      } else ctx.drawImage(body, 0, 0);
      ctx.restore();
      if (fp < 1) { ctx.strokeStyle = `rgba(39,180,245,${0.8 * (1 - fp)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(o[0], o[1], r, 0, 7); ctx.stroke(); }
    }
    // shock ring
    const sr = P(t, 56.05, 57.2, E.outC);
    if (sr > 0 && sr < 1) { ctx.strokeStyle = `rgba(10,108,224,${0.35 * (1 - sr)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(center[0], center[1], 260 + sr * 700, 0, 7); ctx.stroke(); }
    drawFloatingCubes(ctx, t);
    drawLandedTiles(ctx, t, fade);
    // typography
    ctx.save(); ctx.globalAlpha = fade;
    TChars(ctx, '以硫为源 · 链接绿色未来', 960, 724, { f: F.serif, w: 700, s: 60, c: COL.ink, a: 'center', ls: 10, colFn: i => (i === 9 || i === 10) ? COL.green : COL.ink }, t, 57.9, 0.06, 0.7);
    const rl = P(t, 58.9, 59.6, E.ioC);
    if (rl > 0) { ctx.fillStyle = COL.pale; ctx.fillRect(960 - 220 * rl, 778, 440 * rl, 1); }
    TChars(ctx, '恒光股份 · 衡阳基地', 960, 840, { f: F.sans, w: 500, s: 30, c: COL.ink, a: 'center', ls: 14 }, t, 59.1, 0.04, 0.6);
    T(ctx, '湖南恒光化工有限公司  ｜  衡阳丰联精细化工有限公司', 960, 888, { f: F.sans, s: 18, c: COL.ink2, a: 'center', ls: 3, al: P(t, 59.7, 60.3) });
    T(ctx, 'HENGGUANG · HENGYANG BASE · SINCE 2008', 960, 980, { f: F.mono, s: 12, c: COL.ink3, a: 'center', ls: 4, al: P(t, 60.2, 60.8) });
    ctx.restore();
  }
  return { draw };
})();

function drawLogoBody(ctx, L) {
  const g = (spec) => { const gr = ctx.createLinearGradient(spec.from[0], spec.from[1], spec.to[0], spec.to[1]); spec.stops.forEach(s => gr.addColorStop(s[0], s[1])); return gr; };
  ctx.fillStyle = g(L.grads.upper); ctx.fill(new Path2D(L.upper));
  const comb = new Path2D(); comb.addPath(new Path2D(L.lower)); comb.addPath(new Path2D(L.ghole));
  ctx.fillStyle = g(L.grads.lower); ctx.fill(comb, 'evenodd');
  ctx.save(); ctx.clip(comb, 'evenodd'); ctx.fillStyle = g(L.grads.tail); ctx.fill(new Path2D(L.tail)); ctx.restore();
}

// ---------- HUD ----------
const CHAPTERS = [[0, '01', '源', 'SOURCE'], [10.2, '02', '心', 'CORE'], [16, '03', '链', 'CHAIN'], [24, '04', '环', 'LOOP'], [36.0, '05', '智', 'CONTROL'], [42, '06', '誉', 'MERIT'], [50, '07', '地', 'PLACE'], [54.5, '08', '光', 'LIGHT']];
function drawHUD(ctx, t) {
  const a = P(t, 0.6, 1.4) * (1 - P(t, 54.6, 55.4));
  if (a <= 0) return;
  const dark = (t >= 36.0 && t < 42) || S6.isDark(t);
  const c = dark ? 'rgba(255,255,255,0.62)' : COL.ink3, c2 = dark ? 'rgba(255,255,255,0.32)' : 'rgba(141,156,182,0.55)';
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = c; ctx.lineWidth = 1.2;
  const m = 44, L = 20;
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke(); });
  T(ctx, '恒光 · 衡阳基地', 76, 84, { f: F.sans, w: 500, s: 14, c, ls: 4 });
  T(ctx, 'HENGGUANG / HENGYANG BASE', 232, 83, { f: F.mono, s: 11, c: c2, ls: 2 });
  let ci = 0; CHAPTERS.forEach((ch, i) => { if (t >= ch[0]) ci = i; });
  const ch = CHAPTERS[ci], cp = P(t, ch[0], ch[0] + 0.5);
  T(ctx, '/ 08', W - 76, 83, { f: F.mono, s: 11, c: c2, a: 'right', ls: 2 });
  TUp(ctx, ch[3], W - 128, 83, { f: F.mono, s: 11, c, a: 'right', ls: 2.5 }, ci === 0 ? 1 : cp);
  const enW = MW(ctx, ch[3], { f: F.mono, s: 11, ls: 2.5 });
  TUp(ctx, ch[1] + '  ' + ch[2], W - 128 - enW - 18, 85, { f: F.sans, w: 500, s: 14, c, a: 'right', ls: 3 }, ci === 0 ? 1 : cp);
  // timecode
  const fr = Math.floor((t % 1) * 30), ss = Math.floor(t);
  const tc = `00:00:${String(ss).padStart(2, '0')}:${String(fr).padStart(2, '0')}`;
  T(ctx, 'TC  ' + tc, 76, H - 72, { f: F.mono, s: 11, c, ls: 2 });
  T(ctx, '120 BPM · 1920×1080', 260, H - 72, { f: F.mono, s: 11, c: c2, ls: 2 });
  // chapter progress
  const segW = 30, gap = 6, x0 = W - 76 - CHAPTERS.length * (segW + gap) + gap;
  CHAPTERS.forEach((chp, i) => {
    const s0 = chp[0], s1 = i < CHAPTERS.length - 1 ? CHAPTERS[i + 1][0] : 64;
    const f = clamp((t - s0) / (s1 - s0));
    const x = x0 + i * (segW + gap);
    ctx.fillStyle = c2; ctx.fillRect(x, H - 78, segW, 2);
    ctx.fillStyle = dark ? '#FFFFFF' : COL.blue; ctx.fillRect(x, H - 78, segW * f, 2);
  });
  ctx.restore();
}

// ---------- frame ----------
function renderFrame(ctx, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = COL.paper; ctx.fillRect(0, 0, W, H);
  const gA = P(t, 0.0, 0.8);
  drawGrid(ctx, gA);
  S1.draw(ctx, t);
  S3.draw(ctx, t);
  S4.draw(ctx, t);
  S2.draw(ctx, t);
  const hs = heartState(t);
  if (hs && t < 36.05) {
    drawHeart(ctx, hs.x, hs.y, hs.r, { glow: hs.glow, ring: P(t, 10.2, 10.8) * (1 - P(t, 35.3, 35.6)), label: 1 - P(t, 35.0, 35.5) });
    const nv = P(t, 35.5, 36.0);
    if (nv > 0) { ctx.fillStyle = `rgba(6,23,63,${nv})`; ctx.beginPath(); ctx.arc(hs.x, hs.y, hs.r + 1, 0, 7); ctx.fill(); }
  }
  S5.draw(ctx, t);
  S6.draw(ctx, t);
  S7.draw(ctx, t);
  if (t >= 50.6 && t < 54.0) drawFloatingCubes(ctx, t);
  S8.draw(ctx, t);
  drawHUD(ctx, t);
  // vignette
  const v = ctx.createRadialGradient(960, 540, 500, 960, 540, 1250);
  const dark = (t >= 36.0 && t < 42);
  v.addColorStop(0, 'rgba(10,40,110,0)'); v.addColorStop(1, dark ? 'rgba(0,6,24,0.45)' : 'rgba(10,60,150,0.07)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // opening fade-in & closing
  const fin = 1 - P(t, 0, 0.35);
  if (fin > 0) { ctx.fillStyle = `rgba(255,255,255,${fin})`; ctx.fillRect(0, 0, W, H); }
}
