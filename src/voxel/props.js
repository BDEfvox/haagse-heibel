// Buildings, street furniture and vehicles — the Hague voxel kit.
import * as THREE from 'three';
import { Vox, MAT, sculpt, piece, makeSign, TAU } from './kit.js';
import { makePerson } from './cast.js';

const _c = new THREE.Color();
export const shade = (hex, k) => '#' + _c.set(hex).multiplyScalar(k).getHexString();

const BRICK = ['#9a6452', '#8f5a4a', '#b08064', '#80524a', '#d8b07a', '#e9e2d3', '#74504a', '#c9a070', '#a47058'];
const DOORS = ['#1f5b3a', '#1d3557', '#8d0801', '#2b2b2b', '#6a4c93', '#0b6e4f', '#e0a100'];
const ROOFS = ['#c8553d', '#8a3b2e', '#4a4e57', '#a44a3f', '#d9693f'];
const AWN = [['#e63946', '#ffffff'], ['#2a9d8f', '#ffffff'], ['#f4a261', '#ffffff'], ['#3a86ff', '#ffffff'], ['#ffb703', '#023047'], ['#52b788', '#ffffff']];
const STONE = '#efe9dc';
const LIT = ['#ffd97a', '#ffe9a8', '#ffc45e', '#fff1c1'];

function win(v, gl, x, y, z, w, h, night, rnd, litChance = 0.6) {
  v.box(x, y - 0.08, z + 0.04, w + 0.18, h + 0.18, 0.1, '#f6f3ec');
  const lit = night && rnd.chance(litChance);
  (lit ? gl : v).box(x, y, z + 0.07, w, h, 0.08, lit ? rnd.pick(LIT) : night ? '#1c2a44' : '#8fc7e8');
  v.box(x, y + h / 2 - 0.03, z + 0.09, w, 0.06, 0.07, '#f6f3ec');
  v.box(x, y - 0.14, z + 0.14, w + 0.3, 0.08, 0.2, STONE);
  return lit;
}

/** Dutch row house with its front face at z, facing +z. Returns anchors. */
export function house(v, gl, o) {
  const { x, z, w, rnd, night } = o;
  const depth = o.depth ?? 5, floors = o.floors ?? 3, y0 = o.y ?? 0.15;
  const gh = 2.6, fh = 2.2, H = gh + (floors - 1) * fh, zc = z - depth / 2;
  const wall = o.wall || rnd.pick(BRICK);
  const roof = o.roof || rnd.pick(['flat', 'flat', 'pitch', 'step', 'bell']);
  const roofCol = o.roofCol || rnd.pick(ROOFS);
  const out = { x, w, top: y0 + H, sign: null };

  v.box(x, y0, zc, w - 0.08, H, depth, wall, 0.03);
  v.box(x, y0, zc + 0.05, w - 0.02, 0.34, depth, shade(wall, 0.62));
  v.box(x, y0 + gh - 0.12, z + 0.03, w - 0.08, 0.12, 0.1, STONE);

  const cols = Math.max(2, Math.round(w / 1.75)), sp = w / cols;
  const cx = (c) => x - w / 2 + sp * (c + 0.5);
  for (let f = 1; f < floors; f++) {
    for (let c = 0; c < cols; c++) win(v, gl, cx(c), y0 + gh + (f - 1) * fh + 0.62, z, 0.9, 1.2, night, rnd);
  }
  out.win = { x: cx(rnd.int(0, cols - 1)), y: y0 + gh + 0.62, z: z + 0.2 };

  // ground floor
  const doorCol = rnd.pick(DOORS);
  if (o.shop) {
    const dx = x + w / 2 - 0.85, gw = w - 2.2, gx = x - w / 2 + 0.45 + gw / 2;
    v.box(gx, y0 + 0.4, z + 0.04, gw + 0.2, 1.75, 0.1, '#f6f3ec');
    (night ? gl : v).box(gx, y0 + 0.5, z + 0.07, gw, 1.55, 0.08, night ? '#ffe9a8' : '#a9dcf5');
    // goods in the window
    for (let i = 0; i < Math.floor(gw / 0.6); i++) v.box(gx - gw / 2 + 0.35 + i * 0.6, y0 + 0.5, z + 0.13, 0.3, rnd.range(0.25, 0.7), 0.06, rnd.pick(['#e63946', '#ffb703', '#2a9d8f', '#9d4edd', '#fb8500', '#ffffff']));
    v.box(dx, y0, z + 0.05, 0.9, 1.85, 0.1, doorCol);
    (night ? gl : v).box(dx, y0 + 0.9, z + 0.08, 0.6, 0.75, 0.06, night ? '#ffe9a8' : '#a9dcf5');
    const [a, b] = o.awn || rnd.pick(AWN);
    const n = Math.floor((w - 0.3) / 0.42);
    for (let i = 0; i < 3; i++) {
      for (let s = 0; s < n; s++) v.box(x - (n * 0.42) / 2 + 0.21 + s * 0.42, y0 + gh - 0.32 - i * 0.13, z + 0.2 + i * 0.3, 0.42, 0.1, 0.32, s % 2 ? a : b);
    }
    out.sign = makeSign(o.shop, 0.44, { bg: o.signBg || shade(a, 0.75), fg: '#ffffff' });
    out.sign.position.set(x, y0 + gh + 0.2, z + 0.14);
    out.door = { x: dx, z: z + 0.9 };
    out.shop = o.shop;
  } else {
    const dc = rnd.int(0, cols - 1), dx = cx(dc);
    v.box(dx, y0, z + 0.03, 1.14, 2.25, 0.08, '#f6f3ec');
    v.box(dx, y0, z + 0.06, 0.9, 1.8, 0.1, doorCol);
    v.box(dx + 0.28, y0 + 0.9, z + 0.12, 0.08, 0.08, 0.04, '#e9c46a');
    (night && rnd.chance(0.5) ? gl : v).box(dx, y0 + 1.84, z + 0.07, 0.86, 0.3, 0.06, night ? '#ffd97a' : '#8fc7e8');
    v.box(dx, y0, z + 0.3, 1.3, 0.12, 0.5, '#bdb6aa');
    for (let c = 0; c < cols; c++) if (c !== dc) win(v, gl, cx(c), y0 + 0.78, z, 0.95, 1.4, night, rnd, 0.75);
    out.door = { x: dx, z: z + 0.9 };
  }

  // roof
  const ry = y0 + H;
  if (roof === 'flat') {
    v.box(x, ry, zc + 0.1, w + 0.12, 0.3, depth + 0.3, STONE);
    v.box(x, ry + 0.3, zc, w - 0.3, 0.08, depth - 0.3, '#4a4e57');
    out.top = ry + 0.38;
  } else if (roof === 'pitch') {
    const n = 5, D = depth + 0.3;
    for (let i = 0; i < n; i++) v.box(x, ry + i * 0.36, zc, w - 0.04, 0.36, D - (i * D * 0.92) / n, roofCol, 0.05);
    v.box(x, ry + 0.2, z - 0.75, 1.3, 1.0, 1.1, '#f6f3ec');
    (night && rnd.chance(0.5) ? gl : v).box(x, ry + 0.4, z - 0.2, 0.9, 0.6, 0.06, night ? '#ffd97a' : '#8fc7e8');
    v.box(x, ry + 1.2, z - 0.75, 1.5, 0.1, 1.3, shade(roofCol, 0.8));
    out.top = ry + n * 0.36;
  } else {
    // gable facing the street (stepped or bell), pitched roof running back
    const n = 5, W = w - 0.3;
    for (let i = 0; i < n; i++) v.box(x, ry + i * 0.42, zc - 0.2, W - (i * W * 0.9) / n, 0.42, depth - 0.4, roofCol, 0.05);
    if (roof === 'step') {
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        const sw = (w - 0.08) * (1 - i / (steps + 0.4));
        v.box(x, ry + i * 0.5, z - 0.22, sw, 0.5, 0.44, wall, 0.03);
        v.box(x, ry + (i + 1) * 0.5 - 0.06, z - 0.22, sw + 0.1, 0.08, 0.5, STONE);
      }
      win(v, gl, x, ry + 0.25, z, 0.6, 0.6, night, rnd);
      out.top = ry + steps * 0.5;
    } else {
      v.box(x, ry, z - 0.22, w * 0.52, 1.7, 0.44, wall, 0.03);
      v.box(x - w * 0.36, ry, z - 0.22, w * 0.2, 0.8, 0.44, STONE);
      v.box(x + w * 0.36, ry, z - 0.22, w * 0.2, 0.8, 0.44, STONE);
      v.box(x - w * 0.3, ry + 0.8, z - 0.22, w * 0.1, 0.5, 0.44, STONE);
      v.box(x + w * 0.3, ry + 0.8, z - 0.22, w * 0.1, 0.5, 0.44, STONE);
      v.box(x, ry + 1.7, z - 0.22, w * 0.6, 0.16, 0.5, STONE);
      v.box(x, ry + 1.86, z - 0.22, w * 0.3, 0.2, 0.44, STONE);
      win(v, gl, x, ry + 0.45, z, 0.6, 0.7, night, rnd);
      out.top = ry + 2.06;
    }
  }
  const chx = x + w * 0.27 * (rnd.chance(0.5) ? 1 : -1);
  v.box(chx, ry + 0.2, zc - 0.8, 0.6, 1.5, 0.6, shade(wall, 0.85));
  v.box(chx, ry + 1.7, zc - 0.8, 0.72, 0.12, 0.72, STONE);
  out.chimney = { x: chx, y: ry + 1.82, z: zc - 0.8 };
  return out;
}

/** Modern tower block, front at z. */
export function tower(v, gl, o) {
  const { x, z, w, rnd, night } = o;
  const depth = o.depth ?? 5, floors = o.floors ?? 9, y0 = o.y ?? 0.15, fh = 1.5, gh = 2.8;
  const H = gh + floors * fh, zc = z - depth / 2;
  const body = rnd.pick(['#cfd8dc', '#b8c4cc', '#e3ded3', '#9fb0ba', '#d7c9b8', '#8fa3ad']);
  const accent = rnd.pick(['#e76f51', '#2a9d8f', '#457b9d', '#f4a261', '#6d597a']);
  v.box(x, y0, zc, w - 0.1, H, depth, body, 0.02);
  (night ? gl : v).box(x, y0 + 0.3, z + 0.05, w - 1, gh - 0.8, 0.08, night ? '#ffe9a8' : '#a9dcf5');
  v.box(x, y0 + gh - 0.3, z + 0.3, w - 0.4, 0.2, 0.7, accent);
  const cells = Math.floor((w - 0.8) / 0.85), cw = (w - 0.8) / cells;
  for (let f = 0; f < floors; f++) {
    const y = y0 + gh + f * fh + 0.35;
    for (let c = 0; c < cells; c++) {
      const lit = night && rnd.chance(0.45);
      (lit ? gl : v).box(x - (w - 0.8) / 2 + cw * (c + 0.5), y, z + 0.05, cw - 0.12, 0.85, 0.06, lit ? rnd.pick(LIT) : night ? '#1c2a44' : '#8fc7e8');
    }
    // side windows
    for (let c = 0; c < 3; c++) {
      const lit = night && rnd.chance(0.4);
      (lit ? gl : v).box(x + w / 2 - 0.02, y, zc - 1.4 + c * 1.4, 0.06, 0.85, 0.9, lit ? rnd.pick(LIT) : night ? '#1c2a44' : '#7fb9db');
    }
  }
  v.box(x, y0 + H, zc, w + 0.1, 0.25, depth + 0.1, shade(body, 0.8));
  v.box(x - w * 0.2, y0 + H + 0.25, zc, 1.4, 0.7, 1.4, '#8d99a6');
  v.box(x + w * 0.25, y0 + H + 0.25, zc + 0.6, 0.12, 2.6, 0.12, '#555');
  gl.box(x + w * 0.25, y0 + H + 2.85, zc + 0.6, 0.22, 0.22, 0.22, '#ff3b3b');
  return { x, w, top: y0 + H + 0.25, door: { x, z: z + 0.9 }, win: { x, y: y0 + gh + 0.4, z: z + 0.2 }, tower: true };
}

// ---------------------------------------------------------------- greenery & furniture
const GREENS = ['#4caf50', '#43a047', '#66bb6a', '#2e9e55', '#58b368'];
export function tree(v, x, z, rnd, y = 0.15, autumn = false) {
  const h = rnd.range(1.3, 2.0), g = autumn ? rnd.pick(['#e9a23b', '#d9622b', '#c94f2e', '#8fae3a']) : rnd.pick(GREENS);
  v.box(x, y, z, 0.42, h, 0.42, '#7a5234', 0.05);
  const s = rnd.range(0.85, 1.15);
  v.box(x, y + h, z, 2.2 * s, 0.8, 2.2 * s, shade(g, 0.86), 0.05);
  v.box(x, y + h + 0.8, z, 2.7 * s, 1.0, 2.7 * s, g, 0.05);
  v.box(x + rnd.range(-0.2, 0.2), y + h + 1.8, z + rnd.range(-0.2, 0.2), 1.9 * s, 0.8, 1.9 * s, shade(g, 1.1), 0.05);
  v.box(x, y + h + 2.6, z, 0.9 * s, 0.4, 0.9 * s, shade(g, 1.18));
}
export function bush(v, x, z, rnd, y = 0.15, s = 1) {
  const g = rnd.pick(GREENS);
  v.box(x, y, z, 1.0 * s, 0.6 * s, 0.9 * s, shade(g, 0.9), 0.06);
  v.box(x + 0.1, y + 0.6 * s, z, 0.6 * s, 0.3 * s, 0.6 * s, g, 0.06);
}
export function tulips(v, x, z, rnd, y = 0.15, n = 5, spread = 0.9) {
  for (let i = 0; i < n; i++) {
    const px = x + rnd.range(-spread, spread), pz = z + rnd.range(-spread * 0.4, spread * 0.4);
    v.box(px, y, pz, 0.06, 0.3, 0.06, '#3a9d4a');
    v.box(px, y + 0.3, pz, 0.18, 0.2, 0.18, rnd.pick(['#ff3b5c', '#ffcc00', '#ff8fab', '#ff7b00', '#c77dff', '#ffffff']));
  }
}
export function lamp(v, gl, x, z, night, y = 0.15, side = 1) {
  v.box(x, y, z, 0.24, 0.3, 0.24, '#263a33');
  v.box(x, y + 0.3, z, 0.13, 3.5, 0.13, '#2f4a40');
  v.box(x, y + 3.7, z + side * 0.35, 0.13, 0.1, 0.8, '#2f4a40');
  v.box(x, y + 3.52, z + side * 0.7, 0.4, 0.18, 0.4, '#263a33');
  (night ? gl : v).box(x, y + 3.4, z + side * 0.7, 0.3, 0.14, 0.3, night ? '#ffe9a8' : '#f4f1ea');
  return { x, y: y + 3.3, z: z + side * 0.7 };
}
export function bench(v, x, z, y = 0.15, rot = 0) {
  const w = rot ? 0.5 : 1.7, d = rot ? 1.7 : 0.5;
  v.box(x, y + 0.36, z, w, 0.1, d, '#b07a45');
  if (rot) { v.box(x, y, z - 0.7, 0.4, 0.36, 0.1, '#444'); v.box(x, y, z + 0.7, 0.4, 0.36, 0.1, '#444'); v.box(x - 0.22, y + 0.46, z, 0.08, 0.5, d, '#b07a45'); }
  else { v.box(x - 0.7, y, z, 0.1, 0.36, 0.4, '#444'); v.box(x + 0.7, y, z, 0.1, 0.36, 0.4, '#444'); v.box(x, y + 0.46, z - 0.22, w, 0.5, 0.08, '#b07a45'); }
}
export function bin(v, x, z, y = 0.15) {
  v.box(x, y, z, 0.5, 0.8, 0.5, '#2e7d4f');
  v.box(x, y + 0.8, z, 0.58, 0.1, 0.58, '#1f5a38');
  v.box(x, y + 0.5, z + 0.26, 0.3, 0.1, 0.02, '#111');
}
export function bollard(v, x, z, y = 0.15) {
  v.box(x, y, z, 0.2, 0.7, 0.2, '#3d3d3d');
  v.box(x, y + 0.7, z, 0.26, 0.1, 0.26, '#e9c46a');
}
export function mailbox(v, x, z, y = 0.15) {
  v.box(x, y, z, 0.2, 0.5, 0.2, '#555');
  v.box(x, y + 0.5, z, 0.7, 0.8, 0.5, '#f77f00');
  v.box(x, y + 1.0, z + 0.26, 0.4, 0.06, 0.02, '#222');
}
export function hedge(v, x, z, len, y = 0.15) {
  for (let i = 0; i < len; i++) v.box(x + i - len / 2 + 0.5, y, z, 1.0, 0.7, 0.5, '#3f9a52', 0.07);
}
export function atm(v, gl, x, z, y = 0.15) {
  v.box(x, y, z + 0.2, 1.1, 2.0, 0.4, '#dfe6ea');
  v.box(x, y + 2.0, z + 0.25, 1.2, 0.3, 0.5, '#005eb8');
  gl.box(x, y + 1.1, z + 0.41, 0.7, 0.5, 0.02, '#59d0ff');
  v.box(x, y + 0.7, z + 0.42, 0.6, 0.24, 0.06, '#9aa5ad');
  v.box(x + 0.34, y + 0.4, z + 0.41, 0.26, 0.08, 0.02, '#222');
}
/** Bicycle scale shared by the ridden bike and the parked ones (about 1.85 m long, 0.67 m wheels). */
const BK = 1.19;
/** One bicycle drawn into a Vox. Frame runs along z (front = +z) if alongZ, else along x (front = +x). */
function bikeBox(v, alongZ, x, y, z, col, dir = 1) {
  const k = BK;
  // (lateral, up, forward) -> box
  const B = (f, up, h, w, l, c) => {
    if (alongZ) v.box(x, y + up * k, z + dir * f * k, w * k, h * k, l * k, c);
    else v.box(x + dir * f * k, y + up * k, z, l * k, h * k, w * k, c);
  };
  B(-0.5, 0, 0.56, 0.08, 0.56, '#1f1f1f');
  B(0.5, 0, 0.56, 0.08, 0.56, '#1f1f1f');
  B(0, 0.3, 0.1, 0.08, 0.9, col);
  B(-0.25, 0.36, 0.46, 0.08, 0.08, col);
  B(-0.25, 0.8, 0.08, 0.16, 0.3, '#2b2b2b');
  B(0.4, 0.36, 0.62, 0.08, 0.08, col);
  B(0.4, 0.96, 0.07, 0.5, 0.07, '#2b2b2b');
}
/** Static parked bicycle drawn into a Vox (lying along x), same size as the ridden one. */
export function bikeStatic(v, x, z, col, y = 0.15) {
  bikeBox(v, false, x, y, z, col);
}
export function bikeRack(v, x, z, rnd, n = 4, y = 0.15) {
  for (let i = 0; i < n; i++) {
    const px = x + (i - (n - 1) / 2) * 0.8;
    v.box(px, y, z - 0.6, 0.06, 0.6, 0.06, '#9aa5ad');
    if (rnd.chance(0.8)) {
      // bikes parked perpendicular to the street, front wheel toward -z, locked to the rack post
      const col = rnd.pick(['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#111', '#ff70a6', '#8ecae6']);
      bikeBox(v, true, px, y, z + 0.55, col, -1);
    }
  }
}
/** Market stall (haring / friet / bloemen). Front faces +z if face = 1, −z if −1. */
export function stall(g, v, x, z, label, colors, y = 0.15, face = 1) {
  const [a, b] = colors;
  v.box(x, y, z, 2.6, 1.0, 1.3, '#f1e9d8');
  v.box(x, y + 1.0, z, 2.7, 0.1, 1.4, '#8d6e4c');
  for (const sx of [-1.2, 1.2]) for (const sz of [-0.55, 0.55]) v.box(x + sx, y + 1.1, z + sz, 0.1, 1.3, 0.1, '#eeeeee');
  for (let i = 0; i < 7; i++) v.box(x - 1.26 + i * 0.42, y + 2.4, z, 0.42, 0.14, 1.9, i % 2 ? a : b);
  for (let i = 0; i < 7; i++) v.box(x - 1.26 + i * 0.42, y + 2.25, z + face * 0.95, 0.42, 0.16, 0.08, i % 2 ? b : a);
  for (let i = 0; i < 4; i++) v.box(x - 0.9 + i * 0.6, y + 1.1, z + face * 0.2, 0.36, 0.14, 0.5, i % 2 ? '#c9d6df' : '#ffd166');
  const s = makeSign(label, 0.4, { bg: a, fg: '#ffffff' });
  s.position.set(x, y + 2.75, z + face * 1.0);
  if (face < 0) s.rotation.y = Math.PI;
  g.add(s);
}
export function terrace(v, x, z, rnd, y = 0.15) {
  const col = rnd.pick(['#e63946', '#ffb703', '#2a9d8f', '#ffffff']);
  v.box(x, y, z, 0.12, 0.7, 0.12, '#666');
  v.box(x, y + 0.7, z, 0.9, 0.08, 0.9, '#d9c7a3');
  for (const [dx, dz] of [[-0.8, 0], [0.8, 0]]) {
    v.box(x + dx, y, z + dz, 0.42, 0.42, 0.42, '#7a5234');
    v.box(x + dx * 1.22, y + 0.42, z + dz, 0.08, 0.5, 0.42, '#7a5234');
  }
  v.box(x, y + 0.78, z, 0.08, 1.7, 0.08, '#ddd');
  v.box(x, y + 2.3, z, 2.2, 0.12, 2.2, col);
  v.box(x, y + 2.42, z, 1.2, 0.12, 1.2, shade(col, 0.9));
}
export function tramStop(v, gl, x, z, night, y = 0.15) {
  v.box(x, y + 2.3, z, 3.4, 0.12, 1.2, '#c8102e');
  for (const sx of [-1.6, 1.6]) v.box(x + sx, y, z - 0.5, 0.12, 2.3, 0.12, '#555');
  v.box(x, y + 0.3, z - 0.55, 3.2, 1.7, 0.06, '#bfe3f2');
  v.box(x, y + 0.4, z - 0.2, 2.2, 0.1, 0.4, '#8d6e4c');
  (night ? gl : v).box(x + 1.3, y + 1.2, z - 0.5, 0.5, 0.8, 0.08, night ? '#fff1c1' : '#fafafa');
}
export function streetSign(g, v, x, z, text, y = 0.15) {
  v.box(x, y, z, 0.12, 2.8, 0.12, '#8d99a6');
  const s = makeSign(text, 0.5, { bg: '#1747b0', fg: '#ffffff', border: '#ffffff', pad: 8 });
  s.position.set(x, y + 2.75, z + 0.08);
  g.add(s);
  v.box(x, y + 2.47, z, s.userData.w + 0.1, 0.56, 0.08, '#12357f');
}

// ---------------------------------------------------------------- vehicles
function vehicleActor(g, extra = {}) {
  const a = {
    g, heading: 0, moving: 0, t: 0, alive: true, speed: 8, vehicle: true,
    face(h) { this.heading = h; g.rotation.y = h; },
    update(dt) {
      this.t += dt;
      const mv = this.moving;
      this.moving = 0;
      let d = this.heading - g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * Math.min(1, dt * 9);
      if (this.body) this.body.position.y = mv > 0 ? Math.abs(Math.sin(this.t * 16)) * 0.035 : 0;
      if (this.tick) this.tick(dt, mv);
    },
    ...extra,
  };
  return a;
}

const CARCOLS = ['#e63946', '#f4a261', '#2a9d8f', '#3a86ff', '#ffd166', '#8338ec', '#f1faee', '#ff70a6', '#06d6a0', '#577590'];
/** type: car | police | van | taxi. Forward +z. */
export function makeCar(rnd, type = 'car', night = false) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const col = type === 'police' ? '#f8f9fa' : type === 'van' ? '#30343f' : type === 'taxi' ? '#ffd60a' : rnd.pick(CARCOLS);
  const van = type === 'van';
  // modelled at the old small size, then body is scaled up to a real car (4.4 x 1.85 x 1.5; van 5.2 x 2.0 x 2.2)
  const L = van ? 3.9 : 3.3, W = 1.6;
  const SX = van ? 2.0 / W : 1.85 / W, SY = van ? 2.2 / 1.78 : 1.5 / 1.33, SZ = van ? 5.2 / L : 4.4 / L;
  body.scale.set(SX, SY, SZ);
  const solid = new Vox(3), gl = new Vox(4);
  solid.box(0, 0.28, 0, W, van ? 0.75 : 0.55, L, col);
  if (van) {
    solid.box(0, 1.03, -0.3, W - 0.06, 0.75, L - 0.9, col);
    solid.box(0, 1.1, L / 2 - 0.5, W - 0.2, 0.5, 0.08, '#9fd4ee');
    solid.box(0, 0.5, -L / 2 - 0.01, 1.2, 1.1, 0.04, '#3d4250');
  } else {
    solid.box(0, 0.83, -0.2, W - 0.14, 0.5, 1.7, col);
    solid.box(0, 0.88, 0.67, W - 0.3, 0.38, 0.04, '#9fd4ee');
    solid.box(0, 0.88, -1.07, W - 0.3, 0.38, 0.04, '#9fd4ee');
    solid.box(W / 2 - 0.07, 0.88, -0.2, 0.04, 0.36, 1.4, '#9fd4ee');
    solid.box(-W / 2 + 0.07, 0.88, -0.2, 0.04, 0.36, 1.4, '#9fd4ee');
  }
  if (type === 'police') {
    // Dutch striping: blue + orange-red slashes
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
      solid.box(sx * (W / 2 + 0.005), 0.42, -1.1 + i * 0.62, 0.03, 0.3, 0.26, i % 2 ? '#0057b8' : '#ff5a1f');
    }
    solid.box(0, 0.84, L / 2 - 0.3, W - 0.3, 0.02, 0.5, '#0057b8');
    solid.box(0, 1.33, -0.2, 1.0, 0.1, 0.3, '#333');
  }
  if (type === 'taxi') solid.box(0, 1.33, -0.2, 0.5, 0.18, 0.24, '#111');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) solid.box(sx * (W / 2 - 0.12), 0, sz * (L / 2 - 0.7), 0.3, 0.56, 0.6, '#1c1c1c');
  solid.box(0, 0.3, L / 2, W - 0.1, 0.16, 0.08, '#444');
  (night ? gl : solid).box(-0.5, 0.5, L / 2 + 0.01, 0.3, 0.16, 0.04, night ? '#fff6c9' : '#fff3b0');
  (night ? gl : solid).box(0.5, 0.5, L / 2 + 0.01, 0.3, 0.16, 0.04, night ? '#fff6c9' : '#fff3b0');
  gl.box(-0.5, 0.5, -L / 2 - 0.01, 0.3, 0.14, 0.04, '#ff2d2d');
  gl.box(0.5, 0.5, -L / 2 - 0.01, 0.3, 0.14, 0.04, '#ff2d2d');
  body.add(solid.mesh());
  body.add(gl.mesh(MAT.glow));
  const a = vehicleActor(g, { body, type, len: L * SZ, wid: W * SX, hgt: van ? 2.2 : 1.5 });
  if (type === 'police') {
    const red = sculpt((v) => v.box(-0.3, 1.43, -0.2, 0.36, 0.16, 0.26, '#ff2d2d'), MAT.glow);
    const blue = sculpt((v) => v.box(0.3, 1.43, -0.2, 0.36, 0.16, 0.26, '#2d7bff'), MAT.glow);
    body.add(red, blue);
    const light = new THREE.PointLight('#3b82ff', 0, 14, 1.6);
    light.position.set(0, 2.4, 0);
    g.add(light);
    a.siren = false;
    a.tick = function () {
      const on = this.siren, f = Math.floor(this.t * 7) % 2;
      red.visible = !on || f === 0;
      blue.visible = !on || f === 1;
      light.intensity = on ? 40 : 0;
      light.color.set(f ? '#3b82ff' : '#ff3b3b');
    };
  }
  return a;
}

/** HTM tram: red skirt, cream top. Forward +z. */
export function makeTram(night = false) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const v = new Vox(5), gl = new Vox(6);
  const seg = 5.2, n = 5, W = 2.4; // 5 segments, about 27.5 m long, 2.4 m wide, 3.3 m high
  const win = night ? '#ffe9a8' : '#3b5b7a';
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * (seg + 0.3);
    v.box(0, 0.3, z, W, 1.0, seg, '#c8102e');
    v.box(0, 1.3, z, W, 1.8, seg, '#f3ecd9');
    v.box(0, 3.1, z, W - 0.2, 0.2, seg - 0.2, '#8d99a6');
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 4; k++) (night ? gl : v).box(sx * (W / 2 + 0.005), 1.65, z - seg / 2 + 0.7 + k * 1.2, 0.03, 1.0, 0.9, win);
      v.box(sx * (W / 2 + 0.005), 0.4, z, 0.03, 2.2, 0.8, '#f3ecd9'); // door
    }
    v.box(0, 0.05, z - 1.6, W - 0.4, 0.4, 1.0, '#222');
    v.box(0, 0.05, z + 1.6, W - 0.4, 0.4, 1.0, '#222');
    if (i < n - 1) v.box(0, 0.4, z + seg / 2 + 0.15, W - 0.6, 2.3, 0.3, '#333');
  }
  const front = ((n - 1) / 2) * (seg + 0.3) + seg / 2;
  (night ? gl : v).box(0, 1.65, front + 0.01, W - 0.5, 1.0, 0.04, win);
  (night ? gl : v).box(0, 1.65, -front - 0.01, W - 0.5, 1.0, 0.04, win);
  gl.box(-0.75, 0.7, front + 0.02, 0.3, 0.2, 0.04, '#fff6c9');
  gl.box(0.75, 0.7, front + 0.02, 0.3, 0.2, 0.04, '#fff6c9');
  v.box(0, 3.3, 0, 0.12, 0.8, 1.6, '#444'); // pantograph
  v.box(0, 4.1, 0, 1.4, 0.06, 0.1, '#444');
  body.add(v.mesh(), gl.mesh(MAT.glow));
  const s = makeSign('HTM', 0.4, { bg: '#111', fg: '#ffb703', pad: 4 });
  s.position.set(0, 2.8, front + 0.03);
  body.add(s);
  return vehicleActor(g, { body, type: 'tram', len: n * (seg + 0.3), wid: W, hgt: 3.3 });
}

/** Bicycle group (forward +z); rider optional. */
export function makeBike(rnd, rider = null, col = null) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  col = col || rnd.pick(['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#111111', '#ff70a6', '#8ecae6']);
  body.add(sculpt((v) => {
    v.box(0, 0, -0.5, 0.08, 0.56, 0.56, '#1f1f1f');
    v.box(0, 0, 0.5, 0.08, 0.56, 0.56, '#1f1f1f');
    v.box(0, 0.3, 0, 0.08, 0.1, 0.9, col);
    v.box(0, 0.36, -0.25, 0.08, 0.46, 0.08, col);
    v.box(0, 0.8, -0.25, 0.16, 0.08, 0.3, '#2b2b2b');
    v.box(0, 0.36, 0.4, 0.08, 0.62, 0.08, col);
    v.box(0, 0.96, 0.4, 0.5, 0.07, 0.07, '#2b2b2b');
    v.box(0, 0.62, 0.62, 0.3, 0.2, 0.26, '#8d6e4c'); // crate
  }));
  body.scale.setScalar(BK); // 1.86 m long, 0.67 m wheels, handlebar at 1.14 m; saddle top 1.05 m at z = -0.30
  const a = vehicleActor(g, { body, type: 'bike', len: 1.86 });
  if (rider) {
    // rider hip (model y 0.7 * 0.9 = 0.63 m, minus 0.045 m ride bob) rests 0.05 m above the saddle top
    rider.g.position.set(0, 0.52, -0.28);
    rider.g.rotation.y = 0;
    rider.pose = 'ride';
    rider.heading = 0;
    g.add(rider.g);
    a.rider = rider;
    a.tick = (dt) => rider.update(dt);
  }
  return a;
}

export function makeScooter(rnd, riders = []) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const col = rnd.pick(['#ffd60a', '#ef476f', '#118ab2', '#f8f9fa', '#06d6a0']);
  body.add(sculpt((v) => {
    v.box(0, 0, -0.6, 0.18, 0.46, 0.46, '#1f1f1f');
    v.box(0, 0, 0.6, 0.18, 0.46, 0.46, '#1f1f1f');
    v.box(0, 0.3, -0.25, 0.44, 0.4, 1.0, col);
    v.box(0, 0.7, -0.35, 0.4, 0.12, 0.8, '#222');
    v.box(0, 0.3, 0.45, 0.4, 0.8, 0.14, col);
    v.box(0, 1.1, 0.45, 0.7, 0.08, 0.08, '#222');
  }));
  body.add(sculpt((v) => v.box(0, 0.8, 0.53, 0.2, 0.14, 0.04, '#fff6c9'), MAT.glow));
  body.scale.setScalar(1.15); // 1.9 m long, seat top 0.94 m at z = -0.40
  const a = vehicleActor(g, { body, type: 'scooter', len: 1.9 });
  riders.forEach((r, i) => {
    // seated hip = 0.25 m above the origin (sit pose); put it 0.05 m below the seat top (the seat box is thick)
    r.g.position.set(0, 0.64, -0.35 - i * 0.5);
    r.g.rotation.y = 0;
    r.heading = 0;
    r.pose = 'sit';
    g.add(r.g);
  });
  a.riders = riders;
  a.tick = (dt) => riders.forEach((r) => r.update(dt));
  return a;
}

export function makeHeli() {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  body.add(sculpt((v) => {
    v.box(0, 0.3, 0.2, 1.5, 1.3, 2.4, '#f8f9fa');
    v.box(0, 0.5, 1.2, 1.3, 0.8, 0.5, '#59b8e6');
    v.box(0, 0.75, -1.9, 0.36, 0.4, 2.2, '#f8f9fa');
    v.box(0, 0.7, -3.0, 0.1, 1.0, 0.5, '#0057b8');
    v.box(0, 0.55, 0.2, 1.54, 0.3, 2.42, '#0057b8');
    v.box(0, 0.86, 0.2, 1.55, 0.12, 2.43, '#ff5a1f');
    for (const sx of [-1, 1]) { v.box(sx * 0.6, 0, 0.2, 0.1, 0.1, 2.4, '#333'); v.box(sx * 0.6, 0.1, 0.8, 0.08, 0.2, 0.08, '#333'); v.box(sx * 0.6, 0.1, -0.4, 0.08, 0.2, 0.08, '#333'); }
    v.box(0, 1.6, 0.2, 0.2, 0.3, 0.2, '#333');
  }));
  const rotor = sculpt((v) => { v.box(0, 0, 0, 6.4, 0.06, 0.34, '#2b2b2b'); v.box(0, 0, 0, 0.34, 0.06, 6.4, '#2b2b2b'); });
  rotor.position.y = 1.9;
  rotor.castShadow = false;
  body.add(rotor);
  body.scale.setScalar(1.4); // cabin tall enough for a 2 m person
  const tailRotor = sculpt((v) => v.box(0, -0.5, 0, 0.04, 1.0, 0.14, '#2b2b2b'));
  tailRotor.position.set(0.12, 1.2, -3.0);
  body.add(tailRotor);
  // fake searchlight: cone + ground disc
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 1, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: '#fff6c9', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
  );
  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 24),
    new THREE.MeshBasicMaterial({ color: '#fff6c9', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  spot.rotation.x = -Math.PI / 2;
  g.add(beam, spot);
  const blink = sculpt((v) => v.box(0, 0.2, -0.6, 0.2, 0.14, 0.2, '#ff2d2d'), MAT.glow);
  body.add(blink);
  const a = vehicleActor(g, { body, type: 'heli', aim: new THREE.Vector3() });
  a.tick = function (dt) {
    rotor.rotation.y += dt * 30;
    tailRotor.rotation.x += dt * 40;
    body.position.y = Math.sin(this.t * 2) * 0.25;
    body.rotation.z = Math.sin(this.t * 1.3) * 0.06;
    blink.visible = Math.floor(this.t * 3) % 2 === 0;
    // beam from heli to aim point on the ground (world space → local)
    const h = g.position.y;
    const lx = this.aim.x - g.position.x, lz = this.aim.z - g.position.z;
    const c = Math.cos(-g.rotation.y), s = Math.sin(-g.rotation.y);
    const ax = lx * c + lz * s, az = -lx * s + lz * c;
    spot.position.set(ax, -h + 0.22, az);
    beam.position.set(ax / 2, -h / 2, az / 2);
    const len = Math.hypot(ax, h, az);
    beam.scale.set(1, len, 1);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-ax, h, -az).normalize());
  };
  return a;
}

export function makeBoat(rnd) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const col = rnd.pick(['#f8f9fa', '#e63946', '#1d3557', '#2a9d8f', '#ffb703']);
  body.add(sculpt((v) => {
    v.box(0, 0, 0, 1.3, 0.5, 3.0, col);
    v.box(0, 0.1, 1.7, 0.9, 0.4, 0.5, col);
    v.box(0, 0.5, 0, 1.4, 0.08, 3.1, '#8d6e4c');
    v.box(0, 0.3, 0, 1.0, 0.24, 2.4, '#d9c7a3');
    v.box(0, 0.5, -1.3, 0.3, 0.5, 0.3, '#444');
  }));
  body.scale.setScalar(1.4); // 4.2 x 1.8 m
  const skipper = makePerson(rnd, { scale: 1.25 / 1.4 }); // body is scaled 1.4
  skipper.pose = 'sit';
  skipper.g.position.set(0, 0.5, -0.6);
  body.add(skipper.g);
  const a = vehicleActor(g, { body, type: 'boat' });
  a.tick = function (dt) {
    skipper.update(dt);
    body.position.y = Math.sin(this.t * 2.4) * 0.05;
    body.rotation.z = Math.sin(this.t * 1.7) * 0.04;
  };
  return a;
}

export { piece };
