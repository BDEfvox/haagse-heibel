// Statue kit core: palette, drawing state, the frame stack, boxes and limbs. No DOM, importable in node.
// Everything the kit draws goes through bx(): statue-local metres -> the Vox builders, honouring the landmark's own frame.

export const MATS = {
  bronze: '#5f6b4e', bronzeDark: '#3d4435', bronzeGold: '#caa63c', stone: '#d4cdbd', granite: '#8b8f93',
  granitePink: '#a98a84', marble: '#ece9e2', basalt: '#2b2d31', corten: '#8a4a2b', steel: '#4a4f57',
  stainless: '#cfd6dc', concrete: '#a9a59c', brick: '#8f5546', wood: '#7a5a3a', water: '#8fd3e8',
  glass: '#9fd0e6', white: '#f2f2f2', black: '#1d1f22', red: '#c8342b', blue: '#2f5fb3', yellow: '#f0c419',
  green: '#3f8f4a', orange: '#e8822b',
};
export const BLOCKY = new Set(['stone', 'granite', 'granitePink', 'marble', 'concrete', 'basalt', 'brick']);

// Names the validator checks against.
export const POSES = ['stand', 'point', 'arm-up', 'arms-up', 'hips', 'read', 'hold', 'sit', 'sit-ground', 'kneel', 'lie', 'walk', 'run', 'dance', 'think', 'salute', 'carry', 'embrace', 'fall'];
export const HATS = ['tricorn', 'tall', 'cap', 'helmet', 'crown', 'feather', 'brim', 'scarf'];
export const HAIRS = ['long', 'bun', 'mullet', 'quiff'];
export const HOLDS = ['sword', 'staff', 'flag', 'book', 'paper', 'hat', 'wreath', 'torch', 'child', 'bag', 'ball', 'fish', 'basket', 'bird', 'instrument', 'rifle', 'tool'];
export const FIG_OPTS = ['rotY', 'robe', 'cloak', 'hat', 'hair', 'hold', 'child', 'slim', 'bulky', 'nude', 'col2', 'wings', 'seat'];
export const HORSE_OPTS = ['rider', 'riderOpts', 'rear', 'rotY'];
export const PLINTH_STYLES = ['plain', 'stepped', 'classic', 'rock', 'column'];
export const ANIMALS = ['dog', 'cat', 'bird', 'stork', 'heron', 'gull', 'duck', 'swan', 'owl', 'lion', 'horse', 'cow', 'sheep', 'goat', 'pig', 'deer', 'bear', 'seal', 'fish', 'whale', 'frog', 'rabbit', 'elephant', 'monkey', 'turtle', 'snail', 'rhino'];

// One-time console warning in dev for things the kit does not know; never throws.
const warned = new Set();
export const hooks = { warn: null };
export function warn(msg) {
  if (warned.has(msg)) return;
  warned.add(msg);
  if (hooks.warn) hooks.warn(msg);
  let dev = false;
  try { dev = !!(import.meta.env && import.meta.env.DEV); } catch (e) { /* not under vite */ }
  if (dev && typeof console !== 'undefined') console.warn('[statues] ' + msg);
}

const shadeCache = new Map();
/** Multiply a #rrggbb colour by k (clamped), cached. */
export function shade(hex, k) {
  const key = hex + '|' + k;
  let r = shadeCache.get(key);
  if (r) return r;
  let h = hex;
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  const n = parseInt(h.slice(1, 7), 16);
  const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  r = '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
  shadeCache.set(key, r);
  return r;
}

/** Material name or hex string -> hex string. */
export function C(c) {
  if (typeof c === 'string') {
    const m = MATS[c];
    if (m) return m;
    if (c[0] === '#') return c;
    warn('unknown colour ' + c);
    return '#999999';
  }
  if (c !== undefined && c !== null) warn('bad colour ' + c);
  return '#999999';
}

// ------------------------------------------------------------------ state
export const S = {
  v: null, gl: null, night: false, lod: 0, rnd: null,
  Tv: null, Tg: null,
  f: null,        // current frame { x, y, z, c, s, deg }
  n: 0, maxY: 0, r: 0,
};
export const ROOT = { x: 0, y: 0, z: 0, c: 1, s: 0, deg: 0 };

export function begin(v, gl, night, lod, rnd) {
  S.v = v; S.gl = gl; S.night = !!night; S.lod = lod | 0; S.rnd = rnd;
  S.Tv = v.T || null; S.Tg = gl && gl.T ? gl.T : S.Tv;
  S.f = ROOT; S.n = 0; S.maxY = 0; S.r = 0;
}

/** A child frame at (x, y, z) in the current frame, turned deg degrees (positive turns the front towards +x). */
export function frame(x, y, z, deg = 0) {
  const p = S.f, gx = p.x + x * p.c + z * p.s, gz = p.z - x * p.s + z * p.c, d = p.deg + deg, a = (d * Math.PI) / 180;
  return { x: gx, y: p.y + y, z: gz, c: Math.cos(a), s: Math.sin(a), deg: d };
}
/** Run fn inside a child frame. */
export function inFrame(x, y, z, deg, fn) {
  const old = S.f;
  S.f = frame(x, y, z, deg);
  try { fn(); } finally { S.f = old; }
}

const R2D = Math.PI / 180;
/**
 * A box in the current frame. (x, z) centre, y bottom, sizes full. col must already be a hex string.
 * g = true draws into the glow builder. rot = extra degrees about the vertical.
 */
export function bx(x, y, z, w, h, d, col, rot = 0, g = false) {
  const F = S.f;
  const gx = F.x + x * F.c + z * F.s, gz = F.z - x * F.s + z * F.c, gy = F.y + y;
  const a = F.deg + rot;
  let ww = w, dd = d;
  const k = a / 90;
  if (Math.abs(k - Math.round(k)) < 1e-6) {
    if (Math.round(k) & 1) { ww = d; dd = w; }
    put(gx, gy, gz, ww, h, dd, col, 0, g);
  } else put(gx, gy, gz, w, h, d, col, a, g);
}
function put(gx, gy, gz, w, h, d, col, deg, g) {
  // a malformed part (a missing argument) must never put NaN into the tile's mesh; flat or negative sizes become thin plates
  if (!isFinite(gx + gy + gz + w + h + d) || w === undefined || h === undefined || d === undefined) { warn('skipped a box with bad numbers: ' + [gx, gy, gz, w, h, d].join(',')); return; }
  if (!(w >= 0.02 && h >= 0.02 && d >= 0.02)) {
    if (!(w > 0 && h > 0 && d > 0)) warn('box with a flat or negative size: ' + [gx, gy, gz, w, h, d].join(','));
    w = Math.max(0.02, Math.abs(w)); h = Math.max(0.02, Math.abs(h)); d = Math.max(0.02, Math.abs(d));
  }
  const t = g && S.gl ? S.gl : S.v;
  S.n++;
  const hw = w / 2, hd = d / 2;
  const ex = Math.abs(gx) + (deg ? Math.hypot(hw, hd) : hw), ez = Math.abs(gz) + (deg ? Math.hypot(hw, hd) : hd);
  if (ex > S.r) S.r = ex;
  if (ez > S.r) S.r = ez;
  if (gy + h > S.maxY) S.maxY = gy + h;
  if (!deg) { t.box(gx, gy, gz, w, h, d, col); return; }
  const T0 = t === S.v ? S.Tv : S.Tg, saved = t.T;
  let sx = gx, sz = gz, ang = (deg * Math.PI) / 180, y0 = 0;
  if (T0) {
    sx = gx * T0.c + gz * T0.s + T0.x; sz = -gx * T0.s + gz * T0.c + T0.z; y0 = T0.y || 0;
    ang += Math.atan2(T0.s, T0.c);
  }
  t.setT(ang, sx, sz, y0);
  t.box(0, gy, 0, w, h, d, col);
  t.T = saved;
}

/** Box with a material (or hex) given; resolves the name. */
export const B = (x, y, z, w, h, d, c, rot = 0, g = false) => bx(x, y, z, w, h, d, C(c), rot, g);
/** Night-glowing box: glow builder at night, solid otherwise. */
export const BG = (x, y, z, w, h, d, c, rot = 0) => bx(x, y, z, w, h, d, c, rot, S.night);

/** A bar of thickness t between two points: a stepped chain of boxes (col is a hex string). */
export function limb(x0, y0, z0, x1, y1, z1, t, col, g = false) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
  const big = Math.max(ax, ay, az);
  const second = ax + ay + az - big - Math.min(ax, ay, az);
  const n = Math.max(1, Math.min(60, Math.ceil(second / Math.max(t, 0.02))));
  const sx = ax / n + t, sy = ay / n + t, sz = az / n + t;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    bx(x0 + dx * f, y0 + dy * f - sy / 2, z0 + dz * f, sx, sy, sz, col, 0, g);
  }
}

/** Octagon-ish cylinder out of 1 or 2 boxes (2 for r >= 0.16). */
export function cylinder(x, y, z, r, h, col, g = false) {
  if (r < 0.16) { bx(x, y, z, r * 2, h, r * 2, col, 0, g); return; }
  const a = r * 1.848; // 2 * cos(22.5deg) * r
  bx(x, y, z, a, h, a, col, 0, g);
  bx(x, y, z, a, h, a, col, 45, g);
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** One-time warning for option keys the kit does not know. */
export function checkKeys(o, allowed, what) {
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) if (k !== '_ride' && !allowed.includes(k)) warn('unknown option ' + k + ' for ' + what);
}
