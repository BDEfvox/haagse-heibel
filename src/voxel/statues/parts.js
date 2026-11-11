// The part types of a recipe (see kit.js for the schema) and the interpreter that draws a list of parts.
import { S, C, bx, B, BG, shade, limb, cylinder, frame, inFrame, clamp, warn, PLINTH_STYLES, ANIMALS, MATS } from './core.js';
import { figure, bust, head, horse, animal } from './figures.js';

// argument spec per part type: n number, c colour, s string, p point list, o object; '?' optional.
export const SPEC = {
  box: 'n n n n n n c n?', cyl: 'n n n n n c', cone: 'n n n n n c', taper: 'n n n n n n n c n?', ball: 'n n n n c',
  ring: 'n n n n n c n?', disc: 'n n n n n c n?', arch: 'n n n n n n n c n?', slab: 'n n n n n n c n? n?',
  beam: 'n n n n n n n c', curve: 'p n c',
  plinth: 'n n n c s?', steps: 'n n n c', paving: 'n n c', fence: 'n n n c',
  fig: 'n n n n c s o?', bust: 'n n n n c o?', head: 'n n n n c', horse: 'n n n n c o?', animal: 's n n n n c n?',
  hand: 'n n n n c', boat: 'n n n n c n?', anchor: 'n n n n c', bell: 'n n n n c', cross: 'n n n n c', flame: 'n n n n',
  wreath: 'n n n n c', tree: 'n n n n c', chair: 'n n n n c n?', bench: 'n n n n c n?', letters: 'n n n s n c n?',
  wall: 'n n n n n n c n?', plaque: 'n n n n n c n?', basin: 'n n n n n c b?', jet: 'n n n n', pool: 'n n n n n',
};

const lcg = (seed) => { let a = (Math.abs(Math.round(seed * 1000)) + 7) >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };

// ------------------------------------------------------------------ letters (3 x 5 block capitals)
const FONT = {
  A: '.#./#.#/###/#.#/#.#', B: '##./#.#/##./#.#/##.', C: '.##/#../#../#../.##', D: '##./#.#/#.#/#.#/##.', E: '###/#../##./#../###',
  F: '###/#../##./#../#..', G: '.##/#../#.#/#.#/.##', H: '#.#/#.#/###/#.#/#.#', I: '###/.#./.#./.#./###', J: '..#/..#/..#/#.#/.#.',
  K: '#.#/#.#/##./#.#/#.#', L: '#../#../#../#../###', M: '#.#/###/###/#.#/#.#', N: '##./#.#/#.#/#.#/#.#', O: '.#./#.#/#.#/#.#/.#.',
  P: '##./#.#/##./#../#..', Q: '.#./#.#/#.#/##./.##', R: '##./#.#/##./#.#/#.#', S: '.##/#../.#./..#/##.', T: '###/.#./.#./.#./.#.',
  U: '#.#/#.#/#.#/#.#/###', V: '#.#/#.#/#.#/#.#/.#.', W: '#.#/#.#/###/###/#.#', X: '#.#/#.#/.#./#.#/#.#', Y: '#.#/#.#/.#./.#./.#.',
  Z: '###/..#/.#./#../###', 0: '###/#.#/#.#/#.#/###', 1: '.#./##./.#./.#./###', 2: '##./..#/.#./#../###', 3: '##./..#/.#./..#/##.',
  4: '#.#/#.#/###/..#/..#', 5: '###/#../##./..#/##.', 6: '.##/#../###/#.#/###', 7: '###/..#/.#./.#./.#.', 8: '###/#.#/###/#.#/###',
  9: '###/#.#/###/..#/##.', '-': '.../.../###/.../...', '.': '.../.../.../.../.#.', "'": '.#./.#./.../.../...',
};
function letters(x, y, z, text, h, col, rotY) {
  const s = String(text).toUpperCase().slice(0, 12), p = h / 5, hex = C(col), dep = Math.max(0.04, p * 0.6);
  const total = s.length * 4 * p - p;
  inFrame(x, y, z, rotY || 0, () => {
    for (let i = 0; i < s.length; i++) {
      const g = FONT[s[i]];
      if (!g) continue;
      const rows = g.split('/'), x0 = -total / 2 + i * 4 * p;
      for (let r = 0; r < 5; r++) {
        let c = 0;
        while (c < 3) {
          if (rows[r][c] !== '#') { c++; continue; }
          let e = c;
          while (e < 3 && rows[r][e] === '#') e++;
          bx(x0 + ((c + e) / 2) * p, (4 - r) * p, 0, (e - c) * p, p, dep, hex);
          c = e;
        }
      }
    }
  });
}

// ------------------------------------------------------------------ bases
function plinth(w, h, d, col, style) {
  const c = C(col), cd = shade(c, 0.85), cl = shade(c, 1.08);
  if (style !== undefined && !PLINTH_STYLES.includes(style)) { warn('unknown plinth style ' + style); style = 'plain'; }
  switch (style) {
    case 'stepped': {
      const a = Math.min(0.14 * h, 0.35);
      bx(0, 0, 0, w, a, d, cd); bx(0, a, 0, w * 0.92, a, d * 0.92, c);
      bx(0, a * 2, 0, w * 0.8, h - a * 2, d * 0.8, c);
      break;
    }
    case 'classic': {
      const b = h * 0.14, k = h * 0.14, sh = h - b - k;
      bx(0, 0, 0, w, b, d, cd); bx(0, b, 0, w * 0.8, sh, d * 0.8, c); bx(0, b + sh, 0, w * 0.96, k * 0.6, d * 0.96, cl); bx(0, b + sh + k * 0.6, 0, w * 0.9, k * 0.4, d * 0.9, cd);
      break;
    }
    case 'rock': {
      const r = lcg(w * 31 + h * 17 + d * 5);
      bx(0, 0, 0, w, h * 0.45, d, cd, 0);
      bx(w * 0.04 * (r() - 0.5), h * 0.4, d * 0.04 * (r() - 0.5), w * 0.85, h * 0.35, d * 0.8, c, (r() - 0.5) * 40);
      bx(w * 0.08 * (r() - 0.5), h * 0.7, d * 0.08 * (r() - 0.5), w * 0.6, h * 0.3, d * 0.55, cl, (r() - 0.5) * 60);
      break;
    }
    case 'column': {
      const r = w / 2;
      bx(0, 0, 0, w * 1.45, h * 0.06, w * 1.45, cd);
      cylinder(0, h * 0.06, 0, r, h * 0.84, c);
      bx(0, h * 0.9, 0, w * 1.28, h * 0.04, w * 1.28, cl); bx(0, h * 0.94, 0, w * 1.12, h * 0.06, w * 1.12, cd);
      break;
    }
    default: bx(0, 0, 0, w, h, d, c);
  }
}
function steps(w, d, n, col) {
  const c = C(col), N = clamp(Math.round(n), 1, 8);
  for (let i = 0; i < N; i++) {
    const g = (N - 1 - i) * 0.35;
    bx(0, i * 0.15, 0, w + 2 * g, 0.15, d + 2 * g, i % 2 ? c : shade(c, 0.93));
  }
}
function fence(w, d, h, col) {
  const c = C(col), per = 2 * (w + d), sp = Math.max(1.2, per / 36);
  const post = (px, pz) => bx(px, 0, pz, 0.08, h, 0.08, c);
  for (const sz of [-1, 1]) {
    const n = Math.max(1, Math.round(w / sp));
    for (let i = 0; i <= n; i++) post(-w / 2 + (w * i) / n, sz * d / 2);
    bx(0, h - 0.06, sz * d / 2, w, 0.05, 0.05, c); bx(0, h * 0.4, sz * d / 2, w, 0.03, 0.03, c);
  }
  for (const sx of [-1, 1]) {
    const n = Math.max(1, Math.round(d / sp));
    for (let i = 1; i < n; i++) post(sx * w / 2, -d / 2 + (d * i) / n);
    bx(sx * w / 2, h - 0.06, 0, 0.05, 0.05, d, c); bx(sx * w / 2, h * 0.4, 0, 0.03, 0.03, d, c);
  }
}

// ------------------------------------------------------------------ geometry
function taper(x, y, z, w, d, h, top, col, rot) {
  const c = C(col), n = clamp(Math.round(h / 0.45), 2, 12), t = clamp(top, 0, 1);
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n, s = 1 + (t - 1) * f;
    bx(x, y + (h * i) / n, z, Math.max(0.04, w * s), h / n + 0.005, Math.max(0.04, d * s), c, rot || 0);
  }
  if (t < 0.15) { /* a pointed top is just the narrowest step */ }
}
function cone(x, y, z, r, h, col) {
  const c = C(col), n = clamp(Math.round(h / 0.3), 3, 8);
  for (let i = 0; i < n; i++) {
    const rr = r * (1 - (i + 0.5) / n);
    if (r > 0.5) cylinder(x, y + (h * i) / n, z, Math.max(0.03, rr), h / n + 0.005, c); else bx(x, y + (h * i) / n, z, Math.max(0.05, rr * 2), h / n + 0.005, Math.max(0.05, rr * 2), c);
  }
}
function ball(x, y, z, r, col) {
  const c = C(col), n = clamp(Math.round(r * 5), 2, 6);
  for (let i = 0; i < n; i++) {
    const t = -1 + (2 * i + 1) / n, rad = Math.sqrt(Math.max(0.05, 1 - t * t)), y0 = y + (r * 2 * i) / n;
    if (r >= 0.4) cylinder(x, y0, z, r * rad, (r * 2) / n + 0.005, c); else bx(x, y0, z, r * 2 * rad * 0.95, (r * 2) / n + 0.005, r * 2 * rad * 0.95, c);
  }
}
function ring(x, y, z, R, t, col, rot) {
  const c = C(col), n = clamp(Math.round(R * 7), 8, 24), s = Math.max(t, (2 * Math.PI * R * 1.05) / n);
  inFrame(x, y + R, z, rot || 0, () => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      bx(R * Math.cos(a), R * Math.sin(a) - s / 2, 0, s, s, t, c);
    }
  });
}
function disc(x, y, z, R, t, col, rot) {
  const c = C(col), n = clamp(Math.round(R * 4), 3, 10);
  inFrame(x, y + R, z, rot || 0, () => {
    for (let i = 0; i < n; i++) {
      const yy = -R + (2 * R * (i + 0.5)) / n, w = 2 * Math.sqrt(Math.max(0.01, R * R - yy * yy));
      bx(0, yy - R / n, 0, w, (2 * R) / n + 0.005, t, c);
    }
  });
}
function arch(x, y, z, w, h, t, d, col, rot) {
  const c = C(col);
  inFrame(x, y, z, rot || 0, () => {
    for (const s of [-1, 1]) bx(s * (w / 2 - t / 2), 0, 0, t, h - t, d, c);
    bx(0, h - t, 0, w, t, d, shade(c, 1.05));
  });
}
function slab(x, y, z, w, h, d, col, rot, lean) {
  const c = C(col);
  inFrame(x, y, z, rot || 0, () => {
    const L = +lean || 0;
    if (L < 2) { bx(0, 0, 0, w, h, d, c); return; }
    const n = clamp(Math.ceil(h / 0.5), 2, 8), tn = Math.tan((L * Math.PI) / 180);
    for (let i = 0; i < n; i++) bx(0, (h * i) / n, -((h * (i + 0.5)) / n) * tn, w, h / n + 0.005, d, c);
  });
}
function beam(x0, y0, z0, x1, y1, z1, t, col) { limb(x0, y0, z0, x1, y1, z1, t, C(col)); }
function curve(pts, t, col) {
  const c = C(col);
  if (!Array.isArray(pts)) return;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (a && b) limb(a[0], a[1], a[2], b[0], b[1], b[2], t, c);
  }
}

// ------------------------------------------------------------------ objects
function hand(x, y, z, h, col) {
  const c = C(col);
  inFrame(x, y, z, 0, () => {
    bx(0, h * 0.0, 0, h * 0.42, h * 0.36, h * 0.15, c);
    for (let i = 0; i < 4; i++) bx(-h * 0.15 + i * h * 0.1, h * 0.36, 0, h * 0.085, h * (0.5 - Math.abs(i - 1.5) * 0.06), h * 0.11, c);
    bx(h * 0.27, h * 0.12, 0, h * 0.14, h * 0.18, h * 0.12, c);
  });
}
function boat(x, y, z, len, col, rot) {
  const c = C(col);
  inFrame(x, y, z, rot || 0, () => {
    const w = len * 0.28;
    bx(0, 0, 0, w * 0.55, len * 0.06, len * 0.8, shade(c, 0.8));
    bx(0, len * 0.06, 0, w * 0.85, len * 0.07, len * 0.9, c);
    bx(0, len * 0.13, 0, w, len * 0.07, len, c);
    bx(0, len * 0.2, len * 0.46, w * 0.5, len * 0.07, len * 0.1, c);
    bx(0, len * 0.2, -len * 0.46, w * 0.6, len * 0.06, len * 0.1, c);
    bx(0, len * 0.2, 0, w * 0.5, len * 0.1, len * 0.3, shade(c, 1.2));
    bx(0, len * 0.2, len * 0.1, 0.04 * len, len * 0.5, 0.04 * len, '#6b4a2f');
    bx(0, len * 0.5, len * 0.1, len * 0.02, len * 0.2, len * 0.18, '#efe6cf');
  });
}
function anchor(x, y, z, h, col) {
  const c = C(col);
  inFrame(x, y, z, 0, () => {
    bx(0, h * 0.08, 0, h * 0.07, h * 0.85, h * 0.07, c);
    bx(0, h * 0.78, 0, h * 0.35, h * 0.06, h * 0.06, c);
    bx(0, h * 0.9, 0, h * 0.14, h * 0.1, h * 0.06, c);
    bx(0, h * 0.1, 0, h * 0.5, h * 0.06, h * 0.07, c);
    for (const s of [-1, 1]) { bx(s * h * 0.25, h * 0.1, 0, h * 0.07, h * 0.16, h * 0.07, c); bx(s * h * 0.3, h * 0.2, 0, h * 0.14, h * 0.06, h * 0.07, c); }
  });
}
function bell(x, y, z, h, col) {
  const c = C(col);
  inFrame(x, y, z, 0, () => {
    cylinder(0, 0, 0, h * 0.4, h * 0.1, shade(c, 0.9));
    cylinder(0, h * 0.1, 0, h * 0.35, h * 0.25, c);
    cylinder(0, h * 0.35, 0, h * 0.27, h * 0.3, c);
    cylinder(0, h * 0.65, 0, h * 0.17, h * 0.2, c);
    bx(0, h * 0.85, 0, h * 0.2, h * 0.07, h * 0.06, shade(c, 0.7));
    bx(0, h * 0.2, 0, h * 0.06, h * 0.15, h * 0.06, shade(c, 0.6));
  });
}
function cross(x, y, z, h, col) {
  const c = C(col), t = Math.max(0.1, h * 0.1);
  inFrame(x, y, z, 0, () => {
    bx(0, 0, 0, t, h, t, c);
    bx(0, h * 0.62, 0, h * 0.5, t, t, c);
  });
}
function flame(x, y, z, h) {
  inFrame(x, y, z, 0, () => {
    const gl = S.night;
    bx(0, 0, 0, h * 0.5, h * 0.35, h * 0.5, '#ff7a1a', 0, gl);
    bx(0, h * 0.3, 0, h * 0.38, h * 0.4, h * 0.38, '#ff9a2e', 0, gl);
    bx(0, h * 0.6, 0, h * 0.22, h * 0.4, h * 0.22, '#ffd35a', 0, gl);
  });
}
function wreath(x, y, z, r, col) {
  const c = C(col);
  inFrame(x, y, z, 0, () => {
    const n = 8;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; bx(r * Math.sin(a), 0, r * Math.cos(a), r * 0.6, r * 0.3, r * 0.6, c); }
    bx(r * 0.3, 0, r * 1.05, r * 0.4, r * 0.35, r * 0.25, '#c8342b');
  });
}
function tree(x, y, z, h, col) {
  const c = C(col);
  inFrame(x, y, z, 0, () => {
    bx(0, 0, 0, h * 0.1, h * 0.45, h * 0.1, '#6b4a2f');
    bx(0, h * 0.35, 0, h * 0.5, h * 0.25, h * 0.5, c);
    bx(0, h * 0.55, 0, h * 0.4, h * 0.25, h * 0.4, shade(c, 1.1));
    bx(0, h * 0.75, 0, h * 0.24, h * 0.25, h * 0.24, shade(c, 1.2));
  });
}
function chair(x, y, z, h, col, rot) {
  const c = C(col);
  inFrame(x, y, z, rot || 0, () => {
    const w = h * 0.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(sx * w * 0.42, 0, sz * w * 0.4, w * 0.1, h * 0.45, w * 0.1, c);
    bx(0, h * 0.45, 0, w, h * 0.06, w * 0.95, c);
    bx(0, h * 0.5, -w * 0.45, w, h * 0.5, w * 0.08, c);
    for (const sx of [-1, 1]) bx(sx * w * 0.5, h * 0.6, 0, w * 0.08, h * 0.05, w * 0.8, c);
  });
}
function bench(x, y, z, w, col, rot) {
  const c = C(col);
  inFrame(x, y, z, rot || 0, () => {
    bx(0, 0.4, 0, w, 0.07, 0.45, c);
    bx(0, 0.5, -0.2, w, 0.4, 0.06, c);
    for (const sx of [-1, 1]) bx(sx * (w / 2 - 0.1), 0, 0, 0.1, 0.4, 0.4, shade(c, 0.8));
  });
}
function wall(x, y, z, w, h, d, col, rot) {
  const c = C(col);
  bx(x, y, z, w, h, d, c, rot || 0);
  inFrame(x, y + h, z, rot || 0, () => bx(0, 0, 0, w + 0.06, 0.08, d + 0.1, shade(c, 0.82)));
}
function plaque(x, y, z, w, h, col, rot) {
  const c = C(col);
  inFrame(x, y, z, rot || 0, () => {
    bx(0, 0, 0, w, h, 0.04, c);
    const lines = clamp(Math.floor(h / 0.14), 1, 5), dk = shade(c, 0.55);
    for (let i = 0; i < lines; i++) bx(0, h * 0.12 + ((h * 0.76) * (i + 0.5)) / lines, 0.02, w * (i % 2 ? 0.55 : 0.75), Math.min(0.05, h * 0.08), 0.02, dk);
  });
}
function basin(x, y, z, r, h, col, square) {
  const c = C(col), t = clamp(r * 0.14, 0.18, 0.4);
  inFrame(x, y, z, 0, () => {
    if (square) {
      bx(0, 0, 0, 2 * r - t, h * 0.75, 2 * r - t, shade(c, 0.85));
      bx(0, h * 0.75, 0, 2 * r - 2 * t, h * 0.1, 2 * r - 2 * t, MATS.water);
      for (const s of [-1, 1]) { bx(0, 0, s * (r - t / 2), 2 * r, h, t, c); bx(s * (r - t / 2), 0, 0, t, h, 2 * r - 2 * t, c); }
    } else {
      cylinder(0, 0, 0, r - t * 0.5, h * 0.75, shade(c, 0.85));
      cylinder(0, h * 0.75, 0, r - t, h * 0.1, MATS.water);
      const n = clamp(Math.round(r * 4), 8, 20), rm = r - t / 2, chord = (2 * Math.PI * rm) / n;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        bx(rm * Math.sin(a), 0, rm * Math.cos(a), chord * 1.15, h, t, c, (a * 180) / Math.PI);
      }
    }
  });
}
function jet(x, y, z, h) {
  inFrame(x, y, z, 0, () => {
    const g = S.night;
    const col = g ? '#cfeeff' : '#e8f6fb';
    bx(0, 0, 0, 0.1, h * 0.85, 0.1, col, 0, g);
    bx(0, h * 0.8, 0, 0.36, h * 0.2, 0.36, col, 0, g);
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      bx(sx * 0.3, h * 0.55, sz * 0.3, 0.07 + Math.abs(sz) * 0.05, h * 0.3, 0.07 + Math.abs(sx) * 0.05, col, 0, g);
      bx(sx * 0.5, h * 0.25, sz * 0.5, 0.07, h * 0.3, 0.07, col, 0, g);
    }
  });
}
function pool(x, y, z, w, d) { bx(x, y, z, w, 0.05, d, MATS.water); }

// ------------------------------------------------------------------ the interpreter
const DRAW = {
  box: (a) => B(a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8] || 0),
  cyl: (a) => cylinder(a[1], a[2], a[3], a[4], a[5], C(a[6])),
  cone: (a) => cone(a[1], a[2], a[3], a[4], a[5], a[6]),
  taper: (a) => taper(a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9]),
  ball: (a) => ball(a[1], a[2], a[3], a[4], a[5]),
  ring: (a) => ring(a[1], a[2], a[3], a[4], a[5], a[6], a[7]),
  disc: (a) => disc(a[1], a[2], a[3], a[4], a[5], a[6], a[7]),
  arch: (a) => arch(a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9]),
  slab: (a) => slab(a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9]),
  beam: (a) => beam(a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]),
  curve: (a) => curve(a[1], a[2], a[3]),
  plinth: (a) => plinth(a[1], a[2], a[3], a[4], a[5]),
  steps: (a) => steps(a[1], a[2], a[3], a[4]),
  paving: (a) => bx(0, 0, 0, a[1], 0.08, a[2], shade(C(a[3]), 0.95)),
  fence: (a) => fence(a[1], a[2], a[3], a[4]),
  fig: (a) => figure(a[1], a[2], a[3], a[4], a[5], a[6], a[7]),
  bust: (a) => bust(a[1], a[2], a[3], a[4], a[5], a[6]),
  head: (a) => head(a[1], a[2], a[3], a[4], a[5]),
  horse: (a) => horse(a[1], a[2], a[3], a[4], a[5], a[6]),
  animal: (a) => animal(a[1], a[2], a[3], a[4], a[5], a[6], a[7]),
  hand: (a) => hand(a[1], a[2], a[3], a[4], a[5]),
  boat: (a) => boat(a[1], a[2], a[3], a[4], a[5], a[6]),
  anchor: (a) => anchor(a[1], a[2], a[3], a[4], a[5]),
  bell: (a) => bell(a[1], a[2], a[3], a[4], a[5]),
  cross: (a) => cross(a[1], a[2], a[3], a[4], a[5]),
  flame: (a) => flame(a[1], a[2], a[3], a[4]),
  wreath: (a) => wreath(a[1], a[2], a[3], a[4], a[5]),
  tree: (a) => tree(a[1], a[2], a[3], a[4], a[5]),
  chair: (a) => chair(a[1], a[2], a[3], a[4], a[5], a[6]),
  bench: (a) => bench(a[1], a[2], a[3], a[4], a[5], a[6]),
  letters: (a) => letters(a[1], a[2], a[3], a[4], a[5], a[6], a[7]),
  wall: (a) => wall(a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]),
  plaque: (a) => plaque(a[1], a[2], a[3], a[4], a[5], a[6], a[7]),
  basin: (a) => basin(a[1], a[2], a[3], a[4], a[5], a[6], a[7]),
  jet: (a) => jet(a[1], a[2], a[3], a[4]),
  pool: (a) => pool(a[1], a[2], a[3], a[4], a[5]),
};

/** Draw a list of parts in the current frame. Unknown parts are skipped with a one-time warning. */
export function runParts(parts) {
  if (!Array.isArray(parts)) return;
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    if (!Array.isArray(a)) continue;
    const f = DRAW[a[0]];
    if (!f) { warn('unknown part type ' + a[0]); continue; }
    try { f(a); } catch (e) { warn('part ' + a[0] + ' failed: ' + (e && e.message)); }
  }
}
export { DRAW };
void BG; void frame; void head; void horse; void bust; void ANIMALS;
