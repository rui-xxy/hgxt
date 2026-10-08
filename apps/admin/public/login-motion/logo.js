/* global Path2D, window */
// Hengguang logo, vector rebuild. Source units: 113x72 reference image space.
// Mark bounds approx x:39..109, y:17..66  -> center ~ (74, 41.5)
const LOGO = {
  cx: 74, cy: 41.5,
  crescent: new Path2D('M96.3,17.15 C84.2,16.85 66.2,20.4 54.75,27 C47,31.4 39.3,38.6 39.1,47 C38.95,52.4 45.8,57.1 54.6,56.95 C56.2,53.6 57.6,49.4 60.4,46.35 C63.4,41.6 77.6,35.4 92.3,34.05 Z'),
  fold:     new Path2D('M60.9,45.9 C57.6,46.6 53.6,49.4 51.9,52.9 C50.8,55.1 51.3,57.2 53.0,57.6 L56.1,57.7 C56.5,54.9 57.7,52.0 59.4,49.6 C60.2,48.4 61.1,47.2 62.4,46.0 Z'),
  body:     new Path2D('M90.15,40.2 C80.5,40.4 69.5,42.3 62.4,46.0 C58.6,49.3 56.3,53.6 56.05,57.6 C55.8,61.9 59.4,65.4 65.6,65.95 C73.6,66.6 81.9,62.6 85.3,56.3 C86.5,54.0 87.0,51.0 87.5,48.2 Z'),
  gcut:     new Path2D('M86.2,54.55 C80.4,54.3 75.0,55.0 72.4,57.2 C70.3,59.0 71.0,61.35 74.0,61.5 C76.9,61.65 79.6,60.5 80.4,58.4 L77.9,58.15 C77.3,59.3 76.0,59.85 74.8,59.75 C73.5,59.6 73.3,58.75 74.3,58.05 C76.8,56.4 81.2,55.9 85.6,56.15 Z'),
  // pixels: [x0,y0,x1,y1] (parallelogram skewed by right-edge slant)
  upNotch: [87.3,23.5,91.8,26.7],
  upPix: [[95.7,22.0,101.9,25.4],[103.2,17.2,108.9,19.9]],
  loNotch: [82.9,44.2,88.9,47.6],
  loPix: [[89.1,43.9,94.2,47.0],[95.1,40.7,99.9,42.9]],
  skew: -0.238,
};
function logoPara(ctx, r, grow=1) {
  const [x0,y0,x1,y1] = r, s = LOGO.skew, cx=(x0+x1)/2, cy=(y0+y1)/2;
  const hw=(x1-x0)/2*grow, hh=(y1-y0)/2*grow;
  ctx.beginPath();
  ctx.moveTo(cx-hw + s*(-hh), cy-hh);
  ctx.lineTo(cx+hw + s*(-hh), cy-hh);
  ctx.lineTo(cx+hw + s*(hh), cy+hh);
  ctx.lineTo(cx-hw + s*(hh), cy+hh);
  ctx.closePath();
}
function logoGradA(ctx){ const g=ctx.createLinearGradient(40,52,98,17);
  g.addColorStop(0,'#0a7fd6'); g.addColorStop(0.22,'#0596cc'); g.addColorStop(0.42,'#04a8a4');
  g.addColorStop(0.62,'#0cb47a'); g.addColorStop(0.8,'#2fb95c'); g.addColorStop(1,'#78c436'); return g; }
function logoGradB(ctx){ const g=ctx.createLinearGradient(60,65,90,41);
  g.addColorStop(0,'#0a8ee0'); g.addColorStop(0.45,'#0a6cc0'); g.addColorStop(0.8,'#0b4a98'); g.addColorStop(1,'#063a88'); return g; }
// opts: a (crescent 0..1), b (lower 0..1), px (pixels 0..1), bg (color for cutouts), glow
function drawLogoMark(ctx, o={}) {
  const a = o.a ?? 1, b = o.b ?? 1, px = o.px ?? 1, bg = o.bg || null;
  ctx.save();
  if (a > 0) {
    ctx.save(); ctx.globalAlpha *= Math.min(1, a*1.5);
    ctx.fillStyle = logoGradA(ctx); ctx.fill(LOGO.crescent);
    ctx.restore();
  }
  if (b > 0) {
    ctx.save(); ctx.globalAlpha *= Math.min(1, b*1.5);
    ctx.fillStyle = '#1e2f86'; ctx.fill(LOGO.fold);
    ctx.fillStyle = logoGradB(ctx); ctx.fill(LOGO.body);
    // G cut
    if (bg) { ctx.fillStyle = bg; ctx.fill(LOGO.gcut); }
    else { ctx.globalCompositeOperation='destination-out'; ctx.fill(LOGO.gcut); ctx.globalCompositeOperation='source-over'; }
    ctx.restore();
  }
  // notches
  const cut = (r)=>{ logoPara(ctx,r,1.0); if(bg){ctx.fillStyle=bg; ctx.fill();} else {ctx.globalCompositeOperation='destination-out'; ctx.fill(); ctx.globalCompositeOperation='source-over';} };
  if (a>0.5) cut(LOGO.upNotch);
  if (b>0.5) cut(LOGO.loNotch);
  if (px > 0) {
    const e = (k)=>Math.max(0,Math.min(1,(px*1.6 - k*0.3)));
    ctx.fillStyle = '#6cbd3a'; logoPara(ctx, LOGO.upPix[0], e(0)); ctx.fill();
    ctx.fillStyle = '#8fcc4a'; logoPara(ctx, LOGO.upPix[1], e(1)); ctx.fill();
    ctx.fillStyle = '#123f8e'; logoPara(ctx, LOGO.loPix[0], e(0.5)); ctx.fill();
    ctx.fillStyle = '#1b3f86'; logoPara(ctx, LOGO.loPix[1], e(1.5)); ctx.fill();
  }
  ctx.restore();
}
window.drawLogoMark = drawLogoMark;
