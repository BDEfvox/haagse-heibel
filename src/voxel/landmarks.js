// Buildings that look like what they are: churches, mills, stations, fuel stations, walls, rides, statues.
// Pure drawing code: every function draws boxes into tagged Vox builders (see kit.js) and nothing else.
// Conventions: metres, y up, buildings drawn from y = 0 (the shader seats them on the terrain), every box
// tagged with setB(centreX, centreZ, height + 2, halfDepth) so the cutaway shader can flatten them.
import * as THREE from 'three';
import { inRing, obbOf, rectsOf } from './geo.js';

const _c = new THREE.Color();
const shade = (hex, k) => '#' + _c.set(hex).multiplyScalar(k).getHexString();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const hexOf = (n, fb) => (n >= 0 ? '#' + (n & 0xffffff).toString(16).padStart(6, '0') : fb);
const HALF = Math.PI / 2;

const BRICKS = ['#9c4a37', '#a85a3f', '#8a4a3a', '#b0654a', '#7d4538'];
const STONE = '#d9d2c3', CONC = '#a9a59c', SLATE = '#4f545c', GLASS = '#9fd0e6', DARK = '#1f2328';
const BRIGHT = ['#e63946', '#ffb703', '#3a86ff', '#2a9d8f', '#f4a261', '#8338ec', '#fb5607'];
const NL = ['#ae1c28', '#ffffff', '#21468b']; // Dutch flag

// ------------------------------------------------------------------ shape helpers (local frame of the current setT)
/** Roof with a ridge: stepped boxes that shrink across the short side. */
function gable(v, x, y, z, w, d, rise, n, col, alongX, vary = 0.05) {
  for (let i = 0; i < n; i++) {
    const k = 1 - (i * 0.92) / n;
    v.box(x, y + (i * rise) / n, z, alongX ? w + 0.3 : w * k + 0.3, rise / n, alongX ? d * k + 0.3 : d + 0.3, col, vary);
  }
}
/** Hipped roof: every side steps in. */
function hip(v, x, y, z, w, d, rise, n, col, vary = 0.05) {
  const inset = (Math.min(w, d) / 2) * 0.9 / n;
  for (let i = 0; i < n; i++) {
    v.box(x, y + (i * rise) / n, z, Math.max(0.3, w - 2 * inset * i + 0.3), rise / n, Math.max(0.3, d - 2 * inset * i + 0.3), col, vary);
  }
}
/** Pyramid / cone / spire: boxes shrinking to a point. */
function pyramid(v, x, y, z, w, d, h, n, col, vary = 0.04) {
  for (let i = 0; i < n; i++) {
    const k = 1 - i / n;
    v.box(x, y + (i * h) / n, z, Math.max(0.22, w * k), h / n, Math.max(0.22, d * k), col, vary);
  }
}
/** Half-ball dome from stacked boxes. */
function dome(v, x, y, z, r, n, col, vary = 0.04) {
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * HALF, rr = Math.max(0.25, r * Math.cos(a));
    v.box(x, y + (i * r) / n, z, rr * 2, r / n, rr * 2, col, vary);
  }
}
/** Onion dome: bulges, then narrows to a tip. */
function onion(v, x, y, z, r, h, n, col, vary = 0.04) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const rr = Math.max(0.2, r * (1 - t) * (1 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 2.2))));
    v.box(x, y + (i * h) / n, z, rr * 2, h / n, rr * 2, col, vary);
  }
}
/** Barrel roof across the short side (rise over width), steps following a circle arc. */
function arch(v, x, y, z, len, wid, rise, n, col, alongX = true, vary = 0.04) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, ww = wid * Math.sqrt(1 - t * t * 0.72);
    v.box(x, y + (i * rise) / n, z, alongX ? len + 0.2 : ww, rise / n, alongX ? ww : len + 0.2, col, vary);
  }
}
/** A line of cubes from (x0, y0) to (x1, y1) in the xy plane at depth z (stairs for diagonals). */
function line(v, x0, y0, x1, y1, z, th, dz, col, steps) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  if (dy < 1e-6 || dx < 1e-6) {
    v.box((x0 + x1) / 2, Math.min(y0, y1), z, Math.max(th, dx), Math.max(th, dy), dz, col);
    return;
  }
  const n = steps || Math.max(2, Math.round(Math.hypot(dx, dy) / (th * 1.4)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    v.box(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - th / 2, z, th * 1.15, th * 1.15, dz, col);
  }
}

// ------------------------------------------------------------------ building context
/** Frame with the long axis of the footprint along local x, front towards +z. */
function mkCtx(v, gl, b, col, rnd, night) {
  const o = b.o, sw = o.d > o.w;
  const th = Math.atan2(-o.uz, o.ux) + (sw ? HALF : 0);
  const rects = (b.rects && b.rects.length ? b.rects : [{ x: 0, z: 0, w: o.w, d: o.d }])
    .map((r) => (sw ? { x: -r.z, z: r.x, w: r.d, d: r.w } : { x: r.x, z: r.z, w: r.w, d: r.d }));
  let main = rects[0];
  for (const r of rects) if (r.w * r.d > main.w * main.d) main = r;
  const cs = Math.cos(th), sn = Math.sin(th);
  const c = {
    v, gl, rnd, night, col, b, o, th, rects, main,
    L: Math.max(o.w, o.d), D: Math.min(o.w, o.d), h: Math.max(2.4, b.h || 6), area: b.area || o.w * o.d,
    rad: Math.min(o.w, o.d) / 2,
    // local -> scene
    wp: (lx, lz) => [o.cx + lx * cs + lz * sn, o.cz - lx * sn + lz * cs],
    tag(top) { v.setB(o.cx, o.cz, top + 2, c.rad); gl.setB(o.cx, o.cz, top + 2, c.rad); },
  };
  v.setT(th, o.cx, o.cz); gl.setT(th, o.cx, o.cz);
  c.tag(c.h);
  return c;
}
const winMode = (h) => (h <= 3.4 ? 0 : h > 24 ? 2 : 1);
/** The walls: one box per footprint rectangle, windows painted on by the shader. */
function body(c, hgt, wall, mode = winMode(hgt)) {
  const v = c.v;
  for (const r of c.rects) {
    v.setW(mode);
    v.box(r.x, 0, r.z, r.w, hgt, r.d, wall, 0.035);
    v.setW(0);
  }
}
/** Flat roof: light edge, dark membrane. */
function flatTop(c, hgt, wall, rects = c.rects) {
  const v = c.v;
  for (const r of rects) {
    v.box(r.x, hgt, r.z, r.w + 0.15, 0.3, r.d + 0.15, shade(wall, 0.85));
    if (Math.min(r.w, r.d) > 2) v.box(r.x, hgt + 0.3, r.z, r.w - 0.5, 0.08, r.d - 0.5, '#4a4e57');
  }
}
/** Biggest rectangles first, at most n. */
const top = (c, n) => c.rects.slice().sort((a, b) => b.w * b.d - a.w * a.d).slice(0, n);
const flag = (v, x, y, z, H, dir = 1) => {
  v.box(x, y, z, 0.16, H, 0.16, '#d6d6d6');
  v.box(x, y + H, z, 0.3, 0.3, 0.3, '#e6c34a');
  for (let i = 0; i < 3; i++) v.box(x + dir * 1.25, y + H - 0.55 * (i + 1), z, 2.4, 0.55, 0.08, NL[i]);
};

// ------------------------------------------------------------------ free-standing shapes (centre at local 0, 0)
function windmillShape(v, H, s0, wall) {
  const n = 6, sh = H / n;
  for (let i = 0; i < n; i++) v.box(0, i * sh, 0, s0 * (1 - 0.38 * i / (n - 1)), sh, s0 * (1 - 0.38 * i / (n - 1)), wall, 0.03);
  const st = s0 * 0.62;
  v.box(0, H * 0.3, 0, s0 * 1.3, 0.3, s0 * 1.3, '#4a3b30');
  v.box(0, H, 0, st * 1.2, 1.1, st * 1.2, '#3b2f2a');
  pyramid(v, 0, H + 1.1, 0, st * 1.2, st * 1.2, st * 0.8, 3, '#2f2a27');
  const hubY = H + 0.5, hz = st * 0.6 + 0.6, len = clamp(H * 0.55, 6, 15), step = (len * 0.707) / 6;
  v.box(0, hubY - 0.5, hz, 1, 1, 1.2, '#3b2f2a');
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    for (let i = 1; i <= 6; i++) v.box(sx * i * step, hubY + sy * i * step - step * 0.6, hz + 0.3, step * 1.25, step * 1.25, 0.3, i % 2 ? '#e9e1cf' : '#6b4a2f');
  }
  return H + 1.1 + st * 0.8 + len * 0.707;
}
function lighthouseShape(v, gl, H, s0, night) {
  const n = 7, sh = H / n;
  for (let i = 0; i < n; i++) {
    const s = s0 * (1 - 0.38 * i / (n - 1));
    v.box(0, i * sh, 0, s, sh, s, i === 3 ? '#e8e4da' : '#8f2d26', 0.03);
  }
  const st = s0 * 0.62;
  v.box(0, H, 0, st * 1.55, 0.5, st * 1.55, '#2a2d33');
  v.box(0, H + 0.5, 0, st * 1.3, 0.25, st * 1.3, '#555a62');
  (night ? gl : v).box(0, H + 0.75, 0, st * 0.9, 2.4, st * 0.9, night ? '#fff3b0' : '#bfe3ee');
  v.box(0, H + 3.15, 0, st * 1.2, 0.4, st * 1.2, '#2a2d33');
  pyramid(v, 0, H + 3.55, 0, st * 1.0, st * 1.0, 1.4, 2, '#2a2d33');
  v.box(0, H + 4.95, 0, 0.14, 1, 0.14, '#555');
  return H + 6;
}
function waterTowerShape(v, H, s) {
  const tankH = H * 0.28, shaft = H - tankH;
  v.box(0, 0, 0, s, shaft, s, '#b8b4aa', 0.03);
  v.box(0, shaft * 0.5, 0, s * 1.15, 0.5, s * 1.15, '#a39f95');
  v.box(0, shaft, 0, s * 2.3, tankH, s * 2.3, '#c9c5b8', 0.03);
  v.box(0, shaft + tankH * 0.5, 0, s * 2.4, 0.4, s * 2.4, '#8f8b82');
  pyramid(v, 0, H, 0, s * 2.4, s * 2.4, s * 0.9, 3, '#5d646d');
  return H + s * 0.9;
}
function towerShape(v, gl, H, s, night) {
  v.box(0, 0, 0, s * 1.5, 1, s * 1.5, '#8f8b82');
  v.box(0, 1, 0, s, H * 0.86 - 1, s, '#b8b4aa', 0.03);
  v.setW(2); v.box(0, H * 0.86, 0, s * 2.1, 2.2, s * 2.1, '#8fa3ad'); v.setW(0);
  v.box(0, H * 0.86 + 2.2, 0, s * 2.3, 0.3, s * 2.3, '#555a62');
  const m = H * 0.28;
  v.box(0, H * 0.86 + 2.5, 0, 0.35, m, 0.35, '#c8cdd2');
  gl.box(0, H * 0.86 + 2.5 + m, 0, 0.5, 0.5, 0.5, '#ff3b3b');
  return H * 0.86 + 3.5 + m;
}
function chimneyShape(v, H) {
  const n = 8, sh = H / n, d0 = clamp(H * 0.12, 2.5, 6);
  for (let i = 0; i < n; i++) {
    const s = d0 * (1 - 0.45 * i / (n - 1));
    const band = i >= n - 4;
    v.box(0, i * sh, 0, s, sh, s, band ? (i % 2 ? '#ffffff' : '#e63946') : '#a8472f', 0.04);
  }
  const s = d0 * 0.55;
  v.box(0, H, 0, s * 1.15, 0.35, s * 1.15, '#3b3f45');
  return H + 0.35;
}
function mastShape(v, gl, H) {
  const n = 4, sh = H / n;
  for (let i = 0; i < n; i++) {
    const s = 1.1 - 0.15 * i;
    v.box(0, i * sh, 0, s, sh, s, i % 2 ? '#ffffff' : '#e63946');
  }
  for (const f of [0.55, 0.8]) v.box(0, H * f, 0, 3.6 * (1.25 - f), 0.3, 0.3, '#c8cdd2');
  gl.box(0, H, 0, 0.55, 0.55, 0.55, '#ff3b3b');
  return H + 0.6;
}

// ------------------------------------------------------------------ building types
function church(c) {
  const { v, rnd, L, D, main } = c;
  const wall = rnd.pick(BRICKS), hn = Math.max(c.h, 6);
  if (c.area < 150) { // a chapel with a small roof turret
    body(c, hn, wall, 1);
    const m = main;
    gable(v, m.x, hn, m.z, m.w, m.d, clamp(Math.min(m.w, m.d) * 0.55, 2, 5), 4, c.col.roof, m.w >= m.d);
    const ty = hn + clamp(Math.min(m.w, m.d) * 0.55, 2, 5) * 0.8;
    v.box(m.x, ty, m.z, 1.5, 2.2, 1.5, wall);
    pyramid(v, m.x, ty + 2.2, m.z, 1.8, 1.8, 2.6, 4, SLATE);
    c.tag(ty + 5);
    return true;
  }
  const rise = clamp(main.d * 0.5, 2, 9);
  const tw = Math.min(Math.max(5, D * 0.3), main.d * 0.9, main.w * 0.4);
  const Ht = clamp(hn * rnd.range(2, 2.5), hn + 8, 75);
  const sH = clamp(tw * 1.8, 6, 24);
  let s = rnd.chance(0.5) ? 1 : -1;
  const at = (sg) => main.x + sg * (main.w / 2 - tw / 2);
  if (!inRing(c.b.ring, ...c.wp(at(s), main.z)) && inRing(c.b.ring, ...c.wp(at(-s), main.z))) s = -s;
  const tx = at(s);
  c.tag(Ht + sH + 3);
  body(c, hn, wall, 1);
  gable(v, main.x - s * tw * 0.5, hn, main.z, main.w - tw, main.d, rise, 5, c.col.roof, true);
  for (const r of c.rects) if (r !== main) flatTop(c, hn, wall, [r]);
  v.setW(1); v.box(tx, 0, main.z, tw, Ht, tw, wall, 0.03); v.setW(0);
  v.box(tx, Ht - 2.8, main.z, tw + 0.25, 2.2, tw + 0.25, '#2d2a28');
  v.box(tx, Ht - 0.6, main.z, tw + 0.5, 0.6, tw + 0.5, shade(wall, 1.15));
  pyramid(v, tx, Ht, main.z, tw * 0.95, tw * 0.95, sH, 7, rnd.chance(0.4) ? '#5f8f7b' : c.col.roof);
  v.box(tx, Ht + sH, main.z, 0.2, 2, 0.2, '#e6c34a');
  v.box(tx, Ht + sH + 1.2, main.z, 0.9, 0.2, 0.2, '#e6c34a');
  return true;
}
function mosque(c) {
  const { v, rnd, L, D, main } = c;
  const hb = Math.max(c.h, 7), wall = '#efece4';
  body(c, hb, wall, 1);
  flatTop(c, hb, wall);
  const r = clamp(Math.min(main.w, main.d) * 0.32, 3, 12), nm = c.area > 600 ? 2 : 1;
  const dm = hb + 0.3;
  dome(v, main.x, dm, main.z, r, 6, '#aebfb9');
  v.box(main.x, dm + r, main.z, 0.2, 2, 0.2, '#e6c34a');
  let mh = clamp(hb + rnd.range(12, 20), 18, 40);
  const xs = nm === 2 ? [-1, 1] : [rnd.pick([-1, 1])];
  c.tag(Math.max(mh, dm + r + 2));
  for (const sx of xs) {
    const mx = clamp(main.x + sx * (main.w / 2 + 0.2), -L / 2 - 1, L / 2 + 1), mz = main.z + main.d / 2 - 0.2;
    v.box(mx, 0, mz, 2.2, 3, 2.2, wall);
    v.box(mx, 3, mz, 1.5, mh - 3, 1.5, wall, 0.03);
    v.box(mx, mh * 0.72, mz, 2.6, 0.45, 2.6, '#c9c4b8');
    v.box(mx, mh, mz, 1.9, 0.3, 1.9, '#c9c4b8');
    pyramid(v, mx, mh + 0.3, mz, 1.6, 1.6, 3.4, 3, '#8fa3ad');
    v.box(mx, mh + 3.7, mz, 0.12, 1.2, 0.12, '#e6c34a');
  }
  return true;
}
function otherWorship(c) {
  const { v, rnd, main } = c;
  const hb = Math.max(c.h, 5), wall = rnd.pick(['#e9e2d3', '#d8b07a', '#c98b5e']);
  body(c, hb, wall, 1);
  if (rnd.chance(0.5)) {
    flatTop(c, hb, wall);
    const r = clamp(Math.min(main.w, main.d) * 0.28, 2.5, 7);
    dome(v, main.x, hb + 0.3, main.z, r, 5, '#c9b27c');
    v.box(main.x, hb + 0.3 + r, main.z, 0.16, 1.4, 0.16, '#e6c34a');
    c.tag(hb + r + 2);
  } else {
    gable(v, main.x, hb, main.z, main.w, main.d, clamp(main.d * 0.4, 1.5, 5), 4, c.col.roof, main.w >= main.d);
    for (const r of c.rects) if (r !== main) flatTop(c, hb, wall, [r]);
    c.tag(hb + 5);
  }
  return true;
}
function fuelKiosk(c) {
  const { v, rnd } = c;
  const hh = clamp(c.h, 2.8, 4), wall = '#e6e2d6', band = rnd.pick(['#ffcc00', '#00a651', '#e63946', '#0072ce']);
  body(c, hh, wall, 0);
  flatTop(c, hh, wall);
  for (const r of top(c, 4)) {
    v.box(r.x, hh - 1.0, r.z, r.w + 0.3, 0.7, r.d + 0.3, band);
    v.box(r.x, 0.6, r.z + r.d / 2 + 0.03, r.w * 0.7, 1.8, 0.08, c.night ? '#7a8a96' : '#7fb2c8');
  }
  c.tag(hh);
  return true;
}
function station(c) {
  const { v, gl, rnd, L, D, main, night } = c;
  const hw = clamp(c.h, 6, 12), wall = rnd.pick(['#b5523b', '#c98b5e', '#d9d2c3']);
  body(c, hw, wall, 1);
  const rise = clamp(main.d * 0.28, 2, 6);
  arch(v, main.x, hw, main.z, main.w, main.d, rise, 5, '#6f8896');
  for (const r of c.rects) if (r !== main) flatTop(c, hw, wall, [r]);
  for (const sx of [-1, 1]) v.box(main.x + sx * (main.w / 2 + 0.1), 0.4, main.z, 0.3, hw + rise * 0.7, main.d * 0.85, GLASS);
  const zf = main.z + main.d / 2;
  v.box(main.x, hw - 3.4, zf + 0.25, 2.2, 2.2, 0.5, '#f1efe8');
  (night ? gl : v).box(main.x, hw - 3.1, zf + 0.55, 1.5, 1.5, 0.1, night ? '#fff1c1' : '#ffffff');
  v.box(main.x, 0, zf + 1.4, clamp(main.w * 0.3, 6, 20), 0.35, 2.8, '#4a4e57');
  c.tag(hw + rise);
  return true;
}
function school(c) {
  const { v, rnd, L, main } = c;
  if (c.area < 200) return false;
  const hh = Math.max(c.h, 6), wall = rnd.pick(['#b5523b', '#c98b5e', '#d8b07a', '#a8472f']);
  body(c, hh, wall);
  flatTop(c, hh, wall);
  const zf = main.z + main.d / 2, ac = rnd.pick(BRIGHT);
  v.box(main.x, 3.1, zf + 1.1, 4.4, 0.3, 2.4, ac);
  for (const sx of [-1, 1]) v.box(main.x + sx * 2, 0, zf + 2, 0.2, 3.1, 0.2, '#d6d6d6');
  const fx = main.x - main.w / 2 + 1.2;
  v.box(fx, 0, zf + 1.2, 0.14, 7, 0.14, '#d6d6d6');
  for (let i = 0; i < 3; i++) v.box(fx + 0.8, 6.9 - 0.4 * i, zf + 1.2, 1.5, 0.4, 0.06, NL[i]);
  c.tag(hh + 1);
  return true;
}
function hospital(c) {
  const { v, gl, rnd, main, night } = c;
  const hh = Math.max(c.h, 8), wall = rnd.pick(['#e8eef1', '#d7e0e5', '#e3ded3']);
  body(c, hh, wall);
  flatTop(c, hh, wall);
  const zf = main.z + main.d / 2 - 0.6;
  v.box(main.x - main.w * 0.2, hh + 0.3, zf, 4.2, 2.6, 0.5, '#f8f8f8');
  (night ? gl : v).box(main.x - main.w * 0.2, hh + 0.9, zf + 0.3, 2, 0.6, 0.1, '#e63946');
  (night ? gl : v).box(main.x - main.w * 0.2, hh + 0.2 + 0.4, zf + 0.3, 0.6, 1.6, 0.1, '#e63946');
  let topH = hh + 3;
  if (c.area > 600) {
    const s = clamp(Math.min(main.w, main.d) * 0.55, 6, 11), hx = main.x + main.w * 0.18, hz = main.z - main.d * 0.05;
    v.box(hx, hh + 0.3, hz, s, 0.15, s, '#3a3f46');
    const l = s * 0.5;
    v.box(hx - l * 0.4, hh + 0.45, hz, 0.7, 0.05, l, '#ffffff');
    v.box(hx + l * 0.4, hh + 0.45, hz, 0.7, 0.05, l, '#ffffff');
    v.box(hx, hh + 0.45, hz, l * 0.8, 0.05, 0.7, '#ffffff');
    (night ? gl : v).box(hx + s / 2 - 0.2, hh + 0.45, hz + s / 2 - 0.2, 0.3, 0.3, 0.3, night ? '#ffd0d0' : '#e63946');
  }
  c.tag(topH);
  return true;
}
function prison(c) {
  const { v, rnd, L, D, main } = c;
  const hh = clamp(c.h, 6, 18), wall = '#a9a59c';
  body(c, hh, wall, 0);
  flatTop(c, hh, wall);
  if (c.rects.length === 1 || main.w * main.d > c.area * 0.8) {
    const zf = main.z + main.d / 2 + 0.03, n = Math.min(7, Math.max(2, Math.floor(main.w / 5)));
    for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) {
      v.box(main.x - main.w / 2 + ((i + 0.5) * main.w) / n, hh * (r ? 0.3 : 0.65), zf, 0.5, 1.4, 0.08, DARK);
    }
  }
  if (c.area > 1500) {
    const wx = main.w / 2 - 1.4, wz = main.d / 2 - 1.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = main.x + sx * wx, z = main.z + sz * wz;
      v.box(x, hh + 0.3, z, 1.1, 3, 1.1, '#8f8b82');
      v.box(x, hh + 3.3, z, 2.6, 1.8, 2.6, '#6f6b63');
      v.box(x, hh + 5.1, z, 3, 0.4, 3, DARK);
    }
    c.tag(hh + 6);
  } else c.tag(hh + 1);
  return true;
}
function windmillB(c) {
  const H = c.h >= 12 ? Math.min(c.h, 30) : 18, s0 = clamp(c.D * 0.8, 4, 9);
  const t = windmillShape(c.v, H, s0, c.rnd.pick(['#e3dccb', '#b5523b', '#5a4a3e']));
  c.tag(t);
  return true;
}
function lighthouseB(c) {
  const H = c.h >= 20 ? Math.min(c.h, 45) : 30, s0 = clamp(c.D * 0.7, 4, 7);
  c.tag(H + 7);
  lighthouseShape(c.v, c.gl, H, s0, c.night);
  return true;
}
function waterTowerB(c) {
  const H = clamp(Math.max(c.h, 20), 18, 40), s = clamp(c.D * 0.45, 3, 6);
  c.tag(H + s);
  waterTowerShape(c.v, H, s);
  return true;
}
function towerB(c) {
  const H = clamp(c.h, 15, 80), s = clamp(c.D * 0.5, 2, 5);
  c.tag(H * 1.2 + 4);
  towerShape(c.v, c.gl, H, s, c.night);
  return true;
}
function stadium(c) {
  const { v, gl, rnd, L, D, main, night } = c;
  if (c.area > 8000) {
    const sd = clamp(D * 0.2, 6, 25), hs = clamp(c.h, 12, 24), n = 4;
    const pw = Math.max(8, L - 2 * sd), pd = Math.max(8, D - 2 * sd);
    v.box(0, 0, 0, pw, 0.2, pd, '#3f8f3a', 0.04);
    v.box(0, 0.2, 0, 0.3, 0.05, pd, '#ffffff');
    v.box(0, 0.2, 0, 8, 0.05, 8, '#3f8f3a');
    for (let i = 0; i < n; i++) {
      const hi = (hs * (i + 1)) / n, off = (i + 0.5) * (sd / n);
      for (const sz of [-1, 1]) v.box(0, 0, sz * (pd / 2 + off), pw + 2 * off + 1, hi, sd / n + 0.05, i % 2 ? '#8a99a8' : '#6f7f90', 0.05);
      for (const sx of [-1, 1]) v.box(sx * (pw / 2 + off), 0, 0, sd / n + 0.05, hi, pd, i % 2 ? '#8a99a8' : '#6f7f90', 0.05);
    }
    for (const sz of [-1, 1]) v.box(0, hs, sz * (pd / 2 + sd * 0.75), pw + sd * 1.5, 0.4, sd * 0.55, '#d9d6cf');
    for (const sx of [-1, 1]) v.box(sx * (pw / 2 + sd * 0.75), hs, 0, sd * 0.55, 0.4, pd, '#d9d6cf');
    const mh = hs + 14;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (L / 2 - 1.5), z = sz * (D / 2 - 1.5);
      v.box(x, 0, z, 0.9, mh, 0.9, '#9aa0a6');
      (night ? gl : v).box(x, mh, z, 3.4, 1.4, 0.8, night ? '#fffbe0' : '#e8e8e8');
    }
    c.tag(mh + 2);
    return true;
  }
  const hh = clamp(c.h, 5, 9), wall = rnd.pick(['#cfd8dc', '#b8c4cc', '#d7c9b8']);
  body(c, hh, wall, 0);
  const rise = clamp(main.d * 0.28, 1.5, 5);
  arch(v, main.x, hh, main.z, main.w, main.d, rise, 4, '#7f8d97', main.w >= main.d);
  for (const r of c.rects) if (r !== main) flatTop(c, hh, wall, [r]);
  v.box(main.x, 0.5, main.z + main.d / 2 + 0.03, main.w * 0.5, 2.4, 0.08, GLASS);
  c.tag(hh + rise);
  return true;
}
function parking(c) {
  const { v, rnd, L, D, main } = c;
  const nf = clamp(Math.round(Math.max(c.h, 6) / 3), 2, 8), fh = 3.0;
  const rs = top(c, 3);
  for (const r of rs) {
    for (let i = 0; i < nf; i++) v.box(r.x, i * fh + fh - 1.2, r.z, r.w, 1.2, r.d, i % 2 ? '#c3bfb6' : '#b7b3aa', 0.03);
    v.box(r.x, nf * fh, r.z, r.w, 0.3, r.d, '#c3bfb6');
    const pxs = r.w > 30 ? [-1, -0.33, 0.33, 1] : [-1, 1];
    for (const px of pxs) for (const sz of [-1, 1]) v.box(r.x + px * (r.w / 2 - 0.4), 0, r.z + sz * (r.d / 2 - 0.4), 0.7, nf * fh, 0.7, '#6e6c68');
    v.box(r.x, 0, r.z, r.w - 1.2, 0.3, r.d - 1.2, '#55575c');
  }
  const m = main, rx = m.x + m.w / 2 + 0.6;
  for (let i = 0; i < 4; i++) v.box(rx - i * 1.8 + 0.8, 0, m.z, 1.8, nf * fh * (0.95 - i * 0.2), Math.min(6, m.d * 0.6), '#9a968d');
  c.tag(nf * fh + 1);
  return true;
}
function greenhouse(c) {
  const { v, rnd, main } = c;
  const hh = clamp(c.h, 3, 5);
  for (const r of c.rects) v.box(r.x, 0, r.z, r.w, hh, r.d, '#a8d5d0', 0.03);
  const bays = clamp(Math.round(main.d / 3.5), 1, 6), bd = main.d / bays, rise = clamp(bd * 0.35, 0.8, 1.6);
  for (let b = 0; b < bays; b++) {
    const z = main.z - main.d / 2 + (b + 0.5) * bd;
    v.box(main.x, hh, z, main.w, rise * 0.5, bd - 0.1, '#b9e0da');
    v.box(main.x, hh + rise * 0.5, z, main.w, rise * 0.5, bd * 0.4, '#c8e8e2');
    v.box(main.x, hh + rise, z, main.w + 0.1, 0.14, 0.2, '#f1f5f4');
  }
  for (const r of c.rects) { v.box(r.x, 0, r.z, r.w + 0.1, 0.35, r.d + 0.1, '#8f9aa0'); }
  c.tag(hh + rise);
  return true;
}
function supermarket(c) {
  const { v, gl, rnd, main, night } = c;
  const hh = clamp(c.h, 4, 7), wall = rnd.pick(['#ddd7ca', '#c9c4b8', '#e6e2d6']), band = rnd.pick(['#00a0e2', '#ffc400', '#e63946', '#0072ce', '#2a9d8f']);
  body(c, hh, wall, 0);
  flatTop(c, hh, wall);
  for (const r of top(c, 4)) v.box(r.x, hh - 1.6, r.z, r.w + 0.3, 1.2, r.d + 0.3, band);
  const zf = main.z + main.d / 2;
  v.box(main.x, 0.5, zf + 0.03, main.w * 0.6, 2.8, 0.1, night ? '#b9a66a' : '#7fb2c8');
  v.box(main.x, 3.6, zf + 1.6, Math.min(10, main.w * 0.4), 0.3, 3.2, band);
  for (const sx of [-1, 1]) v.box(main.x + sx * Math.min(4.7, main.w * 0.19), 0, zf + 2.9, 0.25, 3.6, 0.25, '#d6d6d6');
  v.box(main.x + main.w / 2 - 1, 0, zf + 2.5, 0.4, 6, 0.4, '#6b7280');
  (night ? gl : v).box(main.x + main.w / 2 - 1, 5, zf + 2.5, 1.4, 1.6, 0.5, band);
  c.tag(hh + 1);
  return true;
}
function museum(c) {
  const { v, gl, rnd, main, night } = c;
  const hh = Math.max(c.h, 8), wall = rnd.pick(['#e3ded3', '#d9d2c3', '#cfc4b0', '#b5523b']);
  body(c, hh, wall, 1);
  flatTop(c, hh, wall);
  gable(v, main.x, hh + 0.4, main.z, main.w * 0.8, main.d * 0.8, 1.6, 2, '#7f8d97', main.w >= main.d);
  const zf = main.z + main.d / 2, pw = clamp(main.w * 0.6, 6, 28), n = clamp(Math.floor(pw / 3.5) + 1, 3, 8), ch = Math.min(hh - 1.2, 9);
  v.box(main.x, 0, zf + 1.9, pw + 1, 0.4, 3.8, '#c9c4b8');
  v.box(main.x, 0.4, zf + 1.6, pw, 0.4, 3.0, '#d9d2c3');
  for (let i = 0; i < n; i++) v.box(main.x - pw / 2 + 0.7 + (i * (pw - 1.4)) / (n - 1), 0.8, zf + 2.8, 0.8, ch, 0.8, '#efe9dc');
  v.box(main.x, 0.8 + ch, zf + 1.9, pw + 0.6, 1.0, 3.4, '#d9d2c3');
  (night ? gl : v).box(main.x, 0.8, zf + 0.06, 3, 3.2, 0.08, night ? '#ffd97a' : '#6f8896');
  c.tag(hh + 3);
  return true;
}
function government(c) {
  const { v, rnd, main, L } = c;
  const hh = Math.max(c.h, 9), wall = rnd.pick(['#d9d2c3', '#e3ded3', '#cfc4b0', '#b5523b']);
  body(c, hh, wall, 1);
  flatTop(c, hh, wall);
  const cw = main.w * 0.4, cd = main.d * 0.72, ch = clamp(hh * 0.3, 2.5, 5);
  v.setW(1); v.box(main.x, hh, main.z, cw, ch, cd, wall, 0.03); v.setW(0);
  gable(v, main.x, hh + ch, main.z, cw, cd, 1.8, 2, '#5d646d', true);
  const zf = main.z + main.d / 2;
  v.box(main.x, 0, zf + 1.2, Math.min(main.w * 0.5, 14), 0.5, 2.6, '#c9c4b8');
  v.box(main.x, 0.5, zf + 1.4, Math.min(main.w * 0.4, 10), 0.4, 1.8, '#d9d2c3');
  const H = 9;
  flag(v, main.x + cw / 2 - 1, hh + ch + 1.8, main.z, H, 1);
  c.tag(hh + ch + 2 + H);
  return true;
}
function bunker(c) {
  const { v, main } = c;
  const hh = clamp(c.h, 2, 4);
  for (const r of top(c, 2)) {
    v.box(r.x, 0, r.z, r.w, hh * 0.6, r.d, '#8b8b84', 0.04);
    v.box(r.x, hh * 0.6, r.z, r.w - 1.2, hh * 0.25, r.d - 1.2, '#7d7d76', 0.04);
    v.box(r.x, hh * 0.85, r.z, Math.max(0.5, r.w - 3), hh * 0.15 + 0.2, Math.max(0.5, r.d - 3), '#6f7a54', 0.08);
  }
  v.box(main.x, hh * 0.25, main.z + main.d / 2 + 0.03, Math.min(main.w * 0.5, 3), 0.3, 0.1, DARK);
  c.tag(hh);
  return true;
}
function fireStation(c) {
  const { v, gl, rnd, main, night } = c;
  const hh = Math.max(c.h, 7), wall = rnd.pick(['#b5523b', '#a8472f', '#c98b5e']);
  body(c, hh, wall);
  flatTop(c, hh, wall);
  const zf = main.z + main.d / 2 + 0.04, n = clamp(Math.floor(main.w / 5), 2, 5);
  for (let i = 0; i < n; i++) {
    const x = main.x - main.w / 2 + ((i + 0.5) * main.w) / n;
    v.box(x, 0, zf, 3.8, 4.4, 0.1, '#d62828');
    v.box(x, 4.4, zf, 4, 0.3, 0.14, '#f1efe8');
  }
  const tx = main.x + main.w / 2 - 1.6;
  v.box(tx, hh, main.z - main.d / 2 + 1.6, 2.6, 5, 2.6, shade(wall, 0.9));
  (night ? gl : v).box(main.x, 4.9, zf + 0.05, 2.2, 0.5, 0.1, night ? '#ff5050' : '#d62828');
  c.tag(hh + 5);
  return true;
}
function police(c) {
  const { v, gl, rnd, main, night } = c;
  const hh = Math.max(c.h, 6), wall = rnd.pick(['#e3e6e8', '#cfd8dc', '#d7c9b8']);
  body(c, hh, wall);
  flatTop(c, hh, wall);
  for (const r of top(c, 4)) v.box(r.x, hh - 2.4, r.z, r.w + 0.2, 1.1, r.d + 0.2, '#1d4ed8');
  const zf = main.z + main.d / 2;
  (night ? gl : v).box(main.x, 2.6, zf + 0.25, 1.1, 1.1, 0.4, night ? '#4f8bff' : '#1d4ed8');
  c.tag(hh + 1);
  return true;
}
function canopy(c) {
  const { v, rnd } = c;
  const hc = clamp(c.h, 3, 12), col = c.col.roof;
  let posts = 0;
  for (const r of top(c, 4)) {
    v.box(r.x, hc, r.z, r.w + 0.4, 0.35, r.d + 0.4, col, 0.04);
    v.box(r.x, hc + 0.35, r.z, r.w + 0.4, 0.15, r.d + 0.4, shade(col, 0.8));
    const nx = Math.max(2, Math.ceil(r.w / 8) + 1), nz = Math.max(2, Math.ceil(r.d / 8) + 1);
    for (let i = 0; i < nx && posts < 16; i++) for (let j = 0; j < nz && posts < 16; j++) {
      if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
      v.box(r.x - r.w / 2 + 0.4 + (i * (r.w - 0.8)) / (nx - 1), 0, r.z - r.d / 2 + 0.4 + (j * (r.d - 0.8)) / (nz - 1), 0.3, hc, 0.3, '#8f8b82');
      posts++;
    }
  }
  c.tag(hc + 0.5);
  return true;
}
function hotel(c) {
  const { v, gl, rnd, main, night } = c;
  const hh = Math.max(c.h, 9), wall = rnd.pick(['#e3e6e8', '#cfd8dc', '#d7c9b8', '#b5523b', '#9fb0ba']);
  body(c, hh, wall);
  flatTop(c, hh, wall);
  const zf = main.z + main.d / 2, col = rnd.pick(BRIGHT);
  v.box(main.x, 3.2, zf + 1.4, Math.min(8, main.w * 0.4), 0.3, 2.8, col);
  for (const sx of [-1, 1]) v.box(main.x + sx * Math.min(3.7, main.w * 0.18), 0, zf + 2.5, 0.25, 3.2, 0.25, '#d6d6d6');
  v.box(main.x, hh + 0.3, zf - 0.6, Math.min(8, main.w * 0.5), 1.8, 0.5, '#2b2f36');
  (night ? gl : v).box(main.x, hh + 0.6, zf - 0.3, Math.min(7, main.w * 0.45), 1.2, 0.1, night ? '#ffd97a' : col);
  c.tag(hh + 3);
  return true;
}
function industrial(c) {
  const { v, rnd, main } = c;
  const hh = clamp(c.h, 5, 12), wall = rnd.pick(['#9aa6ad', '#b0b7bb', '#8f99a1', '#c4bfb4']);
  body(c, hh, wall, 0);
  for (const r of c.rects) if (r !== main) flatTop(c, hh, wall, [r]);
  const col = c.col.roof;
  let rise = 1.6;
  if (main.w >= 16 && main.d >= 12) { // saw-tooth
    const n = clamp(Math.floor(main.w / 8), 2, 8), tw = main.w / n;
    rise = 2.4;
    for (let i = 0; i < n; i++) {
      const x = main.x - main.w / 2 + (i + 0.5) * tw;
      v.box(x, hh, main.z, tw, 0.9, main.d, col, 0.04);
      v.box(x + tw * 0.15, hh + 0.9, main.z, tw * 0.55, 1.5, main.d, col, 0.04);
      v.box(x - tw * 0.12, hh + 0.9, main.z, 0.15, 1.5, main.d * 0.96, GLASS);
    }
  } else gable(v, main.x, hh, main.z, main.w, main.d, rise, 2, col, main.w >= main.d);
  const zf = main.z + main.d / 2 + 0.04, nd = clamp(Math.floor(main.w / 12), 1, 3);
  for (let i = 0; i < nd; i++) v.box(main.x - main.w / 2 + ((i + 0.5) * main.w) / nd, 0, zf, 4, Math.min(4.2, hh - 0.5), 0.1, '#8d99ae');
  c.tag(hh + rise + 1);
  return true;
}
function castle(c) {
  const { v, rnd, main, L, D } = c;
  const hh = Math.max(c.h, 8), wall = rnd.pick(['#b5523b', '#a8472f', '#9c4a37', '#cfc4b0']);
  body(c, hh, wall, 1);
  const rise = clamp(main.d * 0.55, 3, 10);
  gable(v, main.x, hh, main.z, main.w, main.d, rise, 6, c.col.roof, true);
  for (const r of c.rects) if (r !== main) flatTop(c, hh, wall, [r]);
  const ts = clamp(Math.min(main.w, main.d) * 0.16, 2.6, 4.2), th = hh + 4, ch = ts * 1.3;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = main.x + sx * (main.w / 2 - ts / 2 + 0.3), z = main.z + sz * (main.d / 2 - ts / 2 + 0.3);
    v.setW(1); v.box(x, 0, z, ts, th, ts, shade(wall, 0.95), 0.03); v.setW(0);
    pyramid(v, x, th, z, ts + 0.5, ts + 0.5, ch * 1.3, 4, SLATE);
  }
  for (let i = 0; i < 5; i++) {
    const w = main.d * (1 - i * 0.18) * 0.92;
    v.box(main.x + main.w / 2 - 0.4, hh + i * 1.1, main.z, 0.7, 1.1, Math.max(0.8, w), wall);
  }
  c.tag(th + ch * 1.3 + 2);
  return true;
}

const DRAW = {
  1: church, 2: mosque, 3: otherWorship, 4: fuelKiosk, 5: station, 6: school, 7: hospital, 8: prison,
  9: windmillB, 10: lighthouseB, 11: waterTowerB, 12: towerB, 13: stadium, 14: parking, 15: greenhouse,
  16: supermarket, 17: museum, 18: government, 19: bunker, 20: fireStation, 21: police, 22: canopy,
  23: hotel, 24: industrial, 25: castle,
};
export const TYPED = new Set(Object.keys(DRAW).map(Number));

/**
 * Draw a building of a known type. b = { ring, o, rects, h, area, year, roof }, col = { wall, roof }.
 * Returns true if it drew the whole building, false to fall back to the plain block.
 */
export function drawTyped(v, gl, b, type, col, rnd, night) {
  const fn = DRAW[type];
  if (!fn || !b || !b.o || !b.ring || b.ring.length < 3) return false;
  if (!(b.o.w > 0.5 && b.o.d > 0.5)) return false;
  const c = mkCtx(v, gl, b, col, rnd, night);
  let ok = false;
  try {
    ok = fn(c) !== false;
  } finally {
    v.setT(); gl.setT();
  }
  return ok;
}

// ------------------------------------------------------------------ OSM building parts
function partRoof(v, r, y, shape, rh, col, ctxWall) {
  const sm = Math.min(r.w, r.d), alongX = r.w >= r.d;
  switch (shape) {
    case 1: {
      const h = rh || clamp(sm * 0.35, 1, 6);
      gable(v, r.x, y, r.z, r.w, r.d, h, clamp(Math.round(h / 0.6), 2, 6), col, alongX);
      return h;
    }
    case 2: {
      const h = rh || clamp(sm * 0.35, 1, 6);
      hip(v, r.x, y, r.z, r.w, r.d, h, clamp(Math.round(h / 0.6), 2, 6), col);
      return h;
    }
    case 3: case 6: {
      const h = rh || clamp(sm, 2, 25);
      const spire = h > sm * 1.5;
      pyramid(v, r.x, y, r.z, r.w + 0.2, r.d + 0.2, h, clamp(Math.round(h / 1.2), spire ? 6 : 3, 12), col);
      return h;
    }
    case 4: {
      const h = rh || sm / 2, rr = Math.min(sm / 2, Math.max(h, sm / 2));
      dome(v, r.x, y, r.z, rr, clamp(Math.round(rr * 1.2), 3, 8), col);
      return rr;
    }
    case 5: {
      const h = rh || sm * 0.9;
      onion(v, r.x, y, r.z, sm / 2, h, clamp(Math.round(h / 0.8), 5, 10), col);
      return h;
    }
    case 7: {
      const h = rh || clamp(sm * 0.2, 1, 5), n = clamp(Math.round(h / 0.7), 2, 5);
      for (let i = 0; i < n; i++) {
        const dd = Math.max(0.3, r.d * (1 - i / n));
        v.box(r.x, y + (i * h) / n, r.z + r.d / 2 - dd / 2, r.w + 0.2, h / n, dd, col, 0.04);
      }
      return h;
    }
    default: {
      v.box(r.x, y, r.z, r.w + 0.12, 0.25, r.d + 0.12, shade(ctxWall, 0.85));
      return 0.25;
    }
  }
}
/**
 * OpenStreetMap building parts: extruded between min and h - roofH, with a roof by shape code.
 * cx, cz, top: tag centre and height for the whole building.
 */
export function drawParts(v, gl, parts, col, cx, cz, top, rnd, night) {
  if (!parts || !parts.length) return;
  const info = [];
  let rad = 2;
  for (const p of parts) {
    if (!p || !p.ring || p.ring.length < 3) { info.push(null); continue; }
    const o = obbOf(p.ring);
    if (!(o.w > 0.2 && o.d > 0.2)) { info.push(null); continue; }
    const rects = o.fill > 0.88 || o.w * o.d < 20 ? [{ x: 0, z: 0, w: o.w, d: o.d }] : rectsOf(p.ring, o);
    info.push({ o, rects });
    rad = Math.max(rad, Math.min(o.w, o.d) / 2);
  }
  v.setB(cx, cz, top + 2, rad); gl.setB(cx, cz, top + 2, rad);
  try {
    parts.forEach((p, i) => {
      const nf = info[i];
      if (!nf) return;
      const { o, rects } = nf;
      const th = Math.atan2(-o.uz, o.ux);
      v.setT(th, o.cx, o.cz); gl.setT(th, o.cx, o.cz);
      const y0 = Math.max(0, p.min || 0), hTop = Math.max(y0 + 0.5, p.h || y0 + 3);
      const wall = hexOf(p.wall, col.wall), roofC = hexOf(p.roofCol, col.roof);
      const shape = p.roof | 0;
      let rh = p.roofH || 0;
      const flat = shape === 0 || shape === 8 || shape > 8 || shape < 0;
      const span = hTop - y0;
      if (!flat && rh > span * 0.85) rh = span * 0.85;
      let wallTop = flat ? hTop : hTop - (rh || Math.min(span * 0.4, 3));
      if (wallTop - y0 < 0.4) wallTop = y0 + Math.min(0.4, span);
      // the roof grows from the biggest rectangle; with an unknown height it takes what is left of the part
      let big = rects[0];
      for (const r of rects) if (r.w * r.d > big.w * big.d) big = r;
      const wmin = Math.min(o.w, o.d), mode = wmin > 4 ? (hTop > 24 ? 2 : 1) : 0;
      for (const r of rects) {
        v.setW(wallTop - y0 > 3.4 ? mode : 0);
        v.box(r.x, y0, r.z, r.w, wallTop - y0, r.d, wall, 0.035);
        v.setW(0);
      }
      if (flat) {
        for (const r of rects) {
          v.box(r.x, wallTop, r.z, r.w + 0.15, 0.3, r.d + 0.15, shade(wall, 0.85));
          if (Math.min(r.w, r.d) > 2) v.box(r.x, wallTop + 0.3, r.z, r.w - 0.5, 0.08, r.d - 0.5, '#4a4e57');
        }
      } else {
        const sg = shape === 1 || shape === 2 || shape === 7;
        const rl = sg ? rects : [big];
        for (const r of rl) partRoof(v, r, wallTop, shape, rh, roofC, wall);
        if (!sg) for (const r of rects) if (r !== big) v.box(r.x, wallTop, r.z, r.w + 0.12, 0.25, r.d + 0.12, shade(wall, 0.85));
      }
    });
  } finally {
    v.setT(); gl.setT();
  }
}

// ------------------------------------------------------------------ point features
function fuelStation(v, gl, f, rnd, night) {
  const len = f.b > 4 ? f.b : 18, wid = f.c > 3 ? f.c : 9, hc = 5;
  const band = rnd.pick(['#ffcc00', '#00a651', '#e63946', '#0072ce']);
  (night ? gl : v).box(0, hc, 0, len + 0.3, 1.0, wid + 0.3, band);
  v.box(0, hc + 1.0, 0, len, 0.2, wid, '#e8e8e8');
  v.box(0, hc - 0.35, 0, len - 0.4, 0.35, wid - 0.4, '#cfd2d6');
  const px = len / 2 - 1.2, pz = wid / 2 - 1.2;
  const posts = len > 14 ? [[-px, -pz], [px, -pz], [-px, pz], [px, pz], [0, -pz], [0, pz]] : [[-px, -pz], [px, -pz], [-px, pz], [px, pz]];
  for (const [x, z] of posts) v.box(x, 0, z, 0.5, hc - 0.35, 0.5, '#d6d6d6');
  const ni = clamp(Math.round(len / 6), 2, 4);
  for (let i = 0; i < ni; i++) {
    const x = -len / 2 + ((i + 0.5) * len) / ni;
    v.box(x, 0, 0, 1.1, 0.25, Math.min(4.5, wid - 2), '#9a968d');
    for (const sz of [-1, 1]) {
      v.box(x, 0.25, sz * Math.min(1.2, wid * 0.14), 0.6, 1.6, 0.5, rnd.pick(['#e63946', '#2a9d8f', '#3a86ff']));
      v.box(x, 1.3, sz * Math.min(1.2, wid * 0.14), 0.62, 0.35, 0.52, '#222831');
    }
  }
  const tx = len / 2 + 2.2, tz = -wid / 2 - 1;
  v.box(tx, 0, tz, 0.45, 7.6, 0.45, '#6b7280');
  (night ? gl : v).box(tx, 6.2, tz, 1.8, 2.6, 0.5, band);
  for (let k = 0; k < 3; k++) (night ? gl : v).box(tx, 3.2 + k * 0.9, tz, 1.5, 0.7, 0.5, night ? '#ffd97a' : '#23262b');
  return 8;
}
function statue(v, rnd) {
  v.box(0, 0, 0, 1.9, 0.5, 1.9, '#b8b4aa');
  v.box(0, 0.5, 0, 1.4, 1.9, 1.4, '#d9d2c3');
  v.box(0, 2.4, 0, 1.7, 0.3, 1.7, '#b8b4aa');
  const bz = rnd.pick(['#5b6b4f', '#6a5a3c', '#4a5a5a']);
  v.box(-0.18, 2.7, 0, 0.3, 0.9, 0.35, bz);
  v.box(0.18, 2.7, 0, 0.3, 0.9, 0.35, bz);
  v.box(0, 3.6, 0, 0.8, 1.1, 0.45, bz);
  v.box(0.55, 4.0, 0, 0.3, 0.9, 0.3, bz);
  v.box(0, 4.7, 0, 0.45, 0.5, 0.45, bz);
  return 5.3;
}
function fountain(v, f) {
  const r = f.b > 1 ? f.b : 3;
  for (const s of [-1, 1]) {
    v.box(0, 0, s * (r - 0.3), r * 2, 0.6, 0.6, '#c9c4b8');
    v.box(s * (r - 0.3), 0, 0, 0.6, 0.6, r * 2 - 1.2, '#c9c4b8');
  }
  v.box(0, 0.05, 0, r * 2 - 1.2, 0.45, r * 2 - 1.2, '#8fd3e8');
  v.box(0, 0.4, 0, 1.2, 1.2, 1.2, '#b8b4aa');
  v.box(0, 1.6, 0, 2.2, 0.25, 2.2, '#c9c4b8');
  v.box(0, 1.85, 0, 0.5, 1.8, 0.5, '#cdeef7');
  v.box(0, 3.65, 0, 0.9, 0.4, 0.9, '#e4f6fb');
  return 4.2;
}
function shelter(v, gl, night) {
  v.box(0, 0.1, -0.7, 3.8, 2.3, 0.08, '#a8d8e8');
  v.box(0, 2.4, 0, 4.2, 0.15, 1.8, '#3b4048');
  for (const sx of [-1, 1]) {
    v.box(sx * 1.9, 0, -0.7, 0.1, 2.4, 0.1, '#6b7280');
    v.box(sx * 1.9, 0, 0.7, 0.1, 2.4, 0.1, '#6b7280');
    v.box(sx * 1.9, 0.1, -0.35, 0.06, 2.3, 0.7, '#a8d8e8');
  }
  v.box(-0.4, 0.45, -0.35, 1.8, 0.08, 0.5, '#6b4a2f');
  for (const sx of [-1.1, 0.3]) v.box(sx, 0, -0.35, 0.08, 0.45, 0.4, '#3b4048');
  v.box(2.5, 0, 0.8, 0.08, 3, 0.08, '#6b7280');
  v.box(2.5, 2.6, 0.8, 0.5, 0.5, 0.06, '#f2c200');
  (night ? gl : v).box(0, 2.28, 0, 3.4, 0.08, 0.6, night ? '#fff1c1' : '#d9d9d9');
  return 3.2;
}
function playground(v, rnd) {
  const c1 = rnd.pick(BRIGHT), c2 = rnd.pick(BRIGHT), c3 = rnd.pick(BRIGHT);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) v.box(-2 + sx * 0.5, 0, sz * 0.5, 0.15, 1.8, 0.15, c1);
  v.box(-2, 1.6, 0, 1.3, 0.2, 1.3, c2);
  v.box(-2, 1.8, -0.6, 1.3, 0.5, 0.1, c2);
  for (let i = 0; i < 5; i++) v.box(-1.1 + i * 0.5, 1.5 - i * 0.34, 0, 0.55, 0.15, 0.7, '#ffd23f');
  for (const sx of [-1, 1]) v.box(1.2 + sx * 1.4, 0, 0, 0.12, 2.3, 0.12, '#6b7280');
  v.box(1.2, 2.2, 0, 3.0, 0.12, 0.12, '#6b7280');
  for (const sz of [-0.5, 0.5]) {
    v.box(1.2 + sz * 1.2, 0.9, 0, 0.04, 1.3, 0.04, '#999');
    v.box(1.2 + sz * 1.2, 0.5, 0, 0.5, 0.1, 0.35, c3);
  }
  v.box(1, 0, 3.2, 2.6, 0.3, 2.6, '#7b5e3b');
  v.box(1, 0.1, 3.2, 2.2, 0.25, 2.2, '#e5d3a3');
  return 2.6;
}
function wheel(v, gl, f, rnd, night) {
  const H = f.b > 10 ? f.b : 45, R = H * 0.44, hub = H - R, t = 0.55, zr = 1.4;
  const rc = '#f1efe8', pts = [];
  for (let k = 0; k < 8; k++) pts.push([R * Math.cos((k * Math.PI) / 4 + Math.PI / 8) / Math.cos(Math.PI / 8) * 0.96, hub + R * Math.sin((k * Math.PI) / 4 + Math.PI / 8) / Math.cos(Math.PI / 8) * 0.96]);
  for (const z of [-zr, zr]) {
    for (let k = 0; k < 8; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[(k + 1) % 8];
      line(v, x0, y0, x1, y1, z, t, 0.35, rc, 2);
    }
  }
  line(v, -R, hub, R, hub, 0, t, 0.3, '#d6d6d6');
  line(v, 0, hub - R, 0, hub + R, 0, t, 0.3, '#d6d6d6');
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) line(v, 0, hub, sx * R * 0.7, hub + sy * R * 0.7, 0, t, 0.3, '#d6d6d6', 3);
  v.box(0, hub - 0.7, 0, 1.4, 1.4, zr * 2 + 1, '#6b7280');
  for (let k = 0; k < 8; k++) {
    const [x, y] = pts[k];
    (night && k % 2 ? gl : v).box(x, y - 2.0, 0, 1.8, 1.6, zr * 2, BRIGHT[k % BRIGHT.length]);
  }
  for (const z of [-zr - 0.6, zr + 0.6]) {
    for (const sx of [-1, 1]) line(v, sx * R * 0.6, 0, 0, hub - 0.5, z, 0.9, 0.5, '#8f98a1', 5);
  }
  v.box(0, 0, 0, R * 1.3, 0.4, zr * 2 + 2.4, '#55575c');
  return H + 2;
}
function flagpole(v, f) {
  const H = f.b > 3 ? f.b : 12;
  flag(v, 0, 0, 0, H, 1);
  return H + 0.5;
}

/** A point feature at (x, z). f = { type, x, z, a, b, c, rot }. */
export function drawFeature(v, gl, f, rnd, night) {
  if (!f || f.type === 13 || !(f.type >= 1 && f.type <= 12)) return;
  v.setT(f.rot || 0, f.x, f.z); gl.setT(f.rot || 0, f.x, f.z);
  v.setB(f.x, f.z, 8, 3); gl.setB(f.x, f.z, 8, 3);
  const tag = (t, r) => { v.setB(f.x, f.z, t + 2, r); gl.setB(f.x, f.z, t + 2, r); };
  try {
    let t = 0;
    switch (f.type) {
      case 1: tag(8, Math.min(5, ((f.c > 3 ? f.c : 9)) / 2)); fuelStation(v, gl, f, rnd, night); break;
      case 2: { const H = f.b > 8 ? f.b : 22; tag(H + 14, 4); t = windmillShape(v, H, clamp(H * 0.3, 4, 8), rnd.pick(['#e3dccb', '#b5523b'])); break; }
      case 3: { const H = f.b > 12 ? f.b : 30; tag(H + 7, 3); lighthouseShape(v, gl, H, clamp(H * 0.2, 4, 7), night); break; }
      case 4: { const H = f.b > 12 ? f.b : 28; tag(H + 4, 3); waterTowerShape(v, H, clamp(H * 0.16, 3, 6)); break; }
      case 5: { const H = f.b > 5 ? f.b : 40; tag(H + 1, 1.5); mastShape(v, gl, H); break; }
      case 6: { const H = f.b > 8 ? f.b : 35; tag(H + 1, 2.5); chimneyShape(v, H); break; }
      case 7: { const H = f.b > 10 ? f.b : 45; tag(H + 3, 3); wheel(v, gl, f, rnd, night); break; }
      case 8: tag(6, 1); statue(v, rnd); break;
      case 9: tag(5, f.b > 1 ? f.b : 3); fountain(v, f); break;
      case 10: tag(3.5, 1); shelter(v, gl, night); break;
      case 11: tag(3, 3); playground(v, rnd); break;
      case 12: tag((f.b > 3 ? f.b : 12) + 1, 0.5); flagpole(v, f); break;
      default: break;
    }
  } finally {
    v.setT(); gl.setT(); v.setB(); gl.setB();
  }
}

// ------------------------------------------------------------------ barriers
const DEF_H = { 1: 2.2, 2: 1.8, 3: 1.4, 4: 4 };
/** Barriers. list = [{ kind, h, a: Float32Array of x, z pairs }]; kind 1 wall, 2 fence, 3 hedge, 4 city / retaining wall. */
export function drawBarriers(v, list, rnd) {
  if (!list) return;
  try {
    for (const bar of list) {
      const a = bar && bar.a;
      if (!a || a.length < 4) continue;
      const kind = bar.kind >= 1 && bar.kind <= 4 ? bar.kind : 1;
      const h = bar.h > 0.2 ? Math.min(bar.h, 12) : DEF_H[kind];
      const tall = h >= 4;
      const wallCol = kind === 4 ? '#a39b8c' : rnd.pick(['#a8472f', '#9c4a37', '#b0654a', '#a9a59c', '#c4bfb4']);
      const capCol = tall ? '#3b3f45' : kind === 4 ? '#c1b9a8' : shade(wallCol, 1.25);
      const fenceCol = rnd.pick(['#2f4f3a', '#6b7280', '#3b4048']);
      const thick = kind === 1 ? 0.3 : kind === 2 ? 0.08 : kind === 3 ? 0.8 : 0.6;
      for (let i = 0; i + 3 < a.length; i += 2) {
        const x0 = a[i], z0 = a[i + 1], x1 = a[i + 2], z1 = a[i + 3];
        const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
        if (!(len > 0.05) || !isFinite(len)) continue;
        const n = Math.ceil(len / 6), l = len / n, th = Math.atan2(-dz, dx);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, cx = x0 + dx * t, cz = z0 + dz * t;
          v.setT(th, cx, cz);
          v.setB(cx, cz, h + 2, Math.max(0.5, thick / 2));
          if (kind === 2) {
            v.box(0, 0.15, 0, l + 0.02, Math.max(0.3, h - 0.3), thick, fenceCol);
            v.box(-l / 2, 0, 0, 0.14, h + 0.1, 0.14, shade(fenceCol, 0.8));
            if (l > 3.2) v.box(0, 0, 0, 0.14, h + 0.1, 0.14, shade(fenceCol, 0.8));
          } else if (kind === 3) {
            v.box(0, 0, 0, l + 0.02, h, thick, '#3d6b2e', 0.12);
          } else {
            v.box(0, 0, 0, l + 0.02, h, thick, wallCol, 0.04);
            v.box(0, h, 0, l + 0.02, tall ? 0.3 : 0.12, thick + 0.14, capCol);
          }
        }
      }
    }
  } finally {
    v.setT(); v.setB();
  }
}
