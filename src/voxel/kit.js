// Core voxel toolkit: merged box builder, seeded RNG, easing, generator-based scripting.
import * as THREE from 'three';

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const TAU = Math.PI * 2;

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function makeRng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(f.range(lo, hi + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}

export const ease = {
  lin: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
  },
};

// ---------------------------------------------------------------- materials
export const MAT = {
  solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  water: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.86 }),
};

// ---------------------------------------------------------------- Vox builder
const _c = new THREE.Color();
const FACES = [
  // each: 4 corner selectors (0 = min, 1 = max per axis) + normal
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, -1]],
];

/**
 * Collects coloured boxes and bakes them into one mesh. x/z = centre, y = bottom.
 * `tags`: also record a per-vertex `aB` attribute (centre x, centre z, height, half-depth) used by the cutaway shader,
 * and `aW`, which lets the shader paint windows on plain walls (see setW).
 * `setT` places following boxes in a rotated/translated frame, so one mesh can hold things at any angle.
 */
export class Vox {
  constructor(seed = 1, tags = false) {
    // typed arrays that grow by doubling: a big scene is millions of numbers, and plain arrays cost several times the memory
    this.cap = 256; // vertices
    this.pos = new Float32Array(this.cap * 3);
    this.nor = new Float32Array(this.cap * 3);
    this.col = new Float32Array(this.cap * 3);
    this.tag = tags ? new Float32Array(this.cap * 4) : null;
    this.wtag = tags ? new Float32Array(this.cap) : null;
    this.Wm = 0;
    this.idx = new Uint32Array((this.cap / 4) * 6);
    this.B = null;
    this.T = null;
    this.n = 0;
    this._s = seed >>> 0 || 1;
  }
  _grow() {
    const grow = (a, len) => { const b = new a.constructor(len); b.set(a); return b; };
    this.cap *= 2;
    this.pos = grow(this.pos, this.cap * 3);
    this.nor = grow(this.nor, this.cap * 3);
    this.col = grow(this.col, this.cap * 3);
    if (this.tag) this.tag = grow(this.tag, this.cap * 4);
    if (this.wtag) this.wtag = grow(this.wtag, this.cap);
    this.idx = grow(this.idx, (this.cap / 4) * 6);
  }
  _rand() {
    this._s = (Math.imul(this._s, 1664525) + 1013904223) >>> 0;
    return this._s / 4294967296;
  }
  /** Frame for following boxes: rotate by `angle` about Y, then move to (x, y, z). Pass nothing to reset. */
  setT(angle, x = 0, z = 0, y = 0) {
    this.T = angle === undefined ? null : { c: Math.cos(angle), s: Math.sin(angle), x, y, z };
    return this;
  }
  /** Cutaway tag for following boxes: the owning building's centre, height and half-depth. */
  setB(cx, cz, h, r = 0) {
    this.B = cx === undefined ? null : [cx, cz, h, r];
    return this;
  }
  /**
   * Painted windows for the walls of following boxes: 0 none, 1 a grid of windows, 2 ribbons of glass (towers).
   * Each wall vertex stores ±(wall length + 1000 × mode); the shader turns that into a position along the wall.
   */
  setW(mode = 0) {
    this.Wm = mode;
    return this;
  }
  /** vary: random lightness jitter (0..1) to give flat colours a hand-placed feel. */
  box(x, y, z, w, h, d, color, vary = 0) {
    if (this.n + 24 > this.cap) this._grow();
    _c.set(color);
    if (vary) _c.multiplyScalar(1 + (this._rand() * 2 - 1) * vary);
    const X0 = x - w / 2, X1 = x + w / 2, Y1 = y + h, Z0 = z - d / 2, Z1 = z + d / 2;
    const T = this.T, B = this.B, pos = this.pos, nor = this.nor, col = this.col, tag = this.tag, idx = this.idx;
    const wt = this.wtag, wm = wt ? this.Wm : 0;
    const r = _c.r, g = _c.g, bl = _c.b;
    let n = this.n;
    for (let fi = 0; fi < 6; fi++) {
      const f = FACES[fi];
      let nx = f[4][0], nz = f[4][2];
      const ny = f[4][1];
      if (T) { const a = nx * T.c + nz * T.s; nz = -nx * T.s + nz * T.c; nx = a; }
      // side walls only: faces 0 and 1 run along z, faces 4 and 5 along x
      const wl = wm ? (fi < 2 ? d : fi > 3 ? w : 0) : 0, wv = wl > 0 ? wl + 1000 * wm : 0, wa = fi < 2 ? 2 : 0;
      for (let k = 0; k < 4; k++, n++) {
        const s = f[k];
        if (wt) wt[n] = wv ? (s[wa] ? wv : -wv) : 0;
        let px = s[0] ? X1 : X0, py = s[1] ? Y1 : y, pz = s[2] ? Z1 : Z0;
        if (T) { const a = px * T.c + pz * T.s + T.x; pz = -px * T.s + pz * T.c + T.z; px = a; py += T.y; }
        const o = n * 3;
        pos[o] = px; pos[o + 1] = py; pos[o + 2] = pz;
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
        col[o] = r; col[o + 1] = g; col[o + 2] = bl;
        if (tag && B) { const t = n * 4; tag[t] = B[0]; tag[t + 1] = B[1]; tag[t + 2] = B[2]; tag[t + 3] = B[3]; }
      }
      const q = (n / 4 - 1) * 6, v0 = n - 4;
      idx[q] = v0; idx[q + 1] = v0 + 1; idx[q + 2] = v0 + 2; idx[q + 3] = v0; idx[q + 4] = v0 + 2; idx[q + 5] = v0 + 3;
    }
    this.n = n;
    return this;
  }
  get empty() {
    return this.n === 0;
  }
  geometry() {
    const g = new THREE.BufferGeometry(), n = this.n;
    // exact-size copies, so the oversized build buffers can be freed straight away
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 3), 3));
    if (this.tag) g.setAttribute('aB', new THREE.BufferAttribute(this.tag.slice(0, n * 4), 4));
    if (this.wtag) g.setAttribute('aW', new THREE.BufferAttribute(this.wtag.slice(0, n), 1));
    const ni = (n / 4) * 6;
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? this.idx.slice(0, ni) : Uint16Array.from(this.idx.subarray(0, ni)), 1));
    return g;
  }
  mesh(mat = MAT.solid, cast = true, receive = true) {
    const m = new THREE.Mesh(this.geometry(), mat);
    m.castShadow = cast && mat !== MAT.glow;
    m.receiveShadow = receive && mat !== MAT.glow;
    return m;
  }
}

/** Build a mesh from a callback that draws into a fresh Vox. */
export function sculpt(fn, mat = MAT.solid, seed = 7) {
  const v = new Vox(seed);
  fn(v);
  return v.mesh(mat);
}

/** A Group holding a solid mesh plus optional glow mesh drawn by fn(v, glow). */
export function piece(fn, seed = 7) {
  const g = new THREE.Group();
  const v = new Vox(seed), gl = new Vox(seed + 1);
  fn(v, gl);
  if (!v.empty) g.add(v.mesh());
  if (!gl.empty) g.add(gl.mesh(MAT.glow));
  return g;
}

// ---------------------------------------------------------------- text signs
const signCache = new Map();
/** Free every cached sign texture (call when no scene is using them). */
export function clearSigns() {
  for (const t of signCache.values()) t.dispose();
  signCache.clear();
}
function signTexture(text, { fg = '#fff', bg = '#1d4ed8', pad = 6, px = 16, border = null } = {}) {
  const key = [text, fg, bg, pad, px, border].join('|');
  if (signCache.has(key)) return signCache.get(key);
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `${px}px "Press Start 2P", monospace`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = px + pad * 2;
  c.width = w;
  c.height = h;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }
  ctx.font = font;
  ctx.fillStyle = fg;
  ctx.textBaseline = 'top';
  ctx.fillText(text, pad, pad + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.aspect = w / h;
  signCache.set(key, tex);
  return tex;
}

/** Flat sign facing +z, `height` world units tall. */
export function makeSign(text, height = 0.6, opts = {}) {
  const tex = signTexture(text, opts);
  const w = height * tex.userData.aspect;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, height),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );
  m.userData.w = w;
  return m;
}

// ---------------------------------------------------------------- scripting
/** Runs generator "scripts"; each `yield` hands control back until next frame and returns dt. */
export class Runner {
  constructor() {
    this.tasks = new Set();
  }
  run(gen) {
    const t = { gen, done: false };
    const r = gen.next();
    if (r.done) t.done = true;
    else this.tasks.add(t);
    return t;
  }
  update(dt) {
    for (const t of this.tasks) {
      let r;
      try {
        r = t.gen.next(dt);
      } catch (e) {
        console.error('script error', e);
        r = { done: true };
      }
      if (r.done) {
        t.done = true;
        this.tasks.delete(t);
      }
    }
  }
  stop(t) {
    if (!t || t.done) return;
    try {
      t.gen.return();
    } catch (e) { /* ignore */ }
    t.done = true;
    this.tasks.delete(t);
  }
  clear() {
    for (const t of [...this.tasks]) this.stop(t);
  }
}

export function* wait(t) {
  while (t > 0) t -= yield;
}
export function* tween(dur, fn, e = ease.lin) {
  let t = 0;
  fn(e(0));
  while (t < dur) {
    t += yield;
    fn(e(Math.min(1, t / dur)));
  }
}
export function* all(...gens) {
  const live = [];
  for (const g of gens) if (!g.next().done) live.push(g);
  while (live.length) {
    const dt = yield;
    for (let i = live.length - 1; i >= 0; i--) if (live[i].next(dt).done) live.splice(i, 1);
  }
}
/** Runs until the first finishes, then cancels the rest. */
export function* race(...gens) {
  let over = false;
  for (const g of gens) if (g.next().done) over = true;
  while (!over) {
    const dt = yield;
    for (const g of gens) if (g.next(dt).done) over = true;
  }
  for (const g of gens) g.return();
}
export function* waitUntil(fn, timeout = 30) {
  let t = 0;
  while (!fn() && t < timeout) t += yield;
}
