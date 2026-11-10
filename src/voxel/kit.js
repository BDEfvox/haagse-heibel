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

/** Collects coloured boxes and bakes them into one mesh. x/z = centre, y = bottom. */
export class Vox {
  constructor(seed = 1) {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.n = 0;
    this._s = seed >>> 0 || 1;
  }
  _rand() {
    this._s = (Math.imul(this._s, 1664525) + 1013904223) >>> 0;
    return this._s / 4294967296;
  }
  /** vary: random lightness jitter (0..1) to give flat colours a hand-placed feel. */
  box(x, y, z, w, h, d, color, vary = 0) {
    _c.set(color);
    if (vary) _c.multiplyScalar(1 + (this._rand() * 2 - 1) * vary);
    const X = [x - w / 2, x + w / 2], Y = [y, y + h], Z = [z - d / 2, z + d / 2];
    for (const f of FACES) {
      const nrm = f[4];
      // gentle fake AO: undersides and lower verts a touch darker
      for (let k = 0; k < 4; k++) {
        const s = f[k];
        this.pos.push(X[s[0]], Y[s[1]], Z[s[2]]);
        this.nor.push(nrm[0], nrm[1], nrm[2]);
        this.col.push(_c.r, _c.g, _c.b);
      }
      const n = this.n;
      this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      this.n += 4;
    }
    return this;
  }
  get empty() {
    return this.n === 0;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
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
export function signTexture(text, { fg = '#fff', bg = '#1d4ed8', pad = 6, px = 16, border = null } = {}) {
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
