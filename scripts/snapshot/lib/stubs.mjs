// Deterministic browser stubs so the voxel modules load and run under Node. Install BEFORE importing any module under test.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const realNow = performance.now.bind(performance); // (for progress output only)

/**
 * opts: { dataDir: .../public/data, modules: node_modules dir (for pngjs) }
 * Returns { rnd } with counters: Math.random calls.
 */
export function installStubs({ dataDir, modules }) {
  const require = createRequire(path.join(modules, 'x.js'));
  const { PNG } = require('pngjs');

  // ---- Math.random: seeded and counted (the code under test should not use it; if it does, it stays deterministic and is reported)
  // three itself draws UUIDs from Math.random for every object it makes; those are never hashed. Calls from anywhere else
  // (the code under test) are recorded by caller, so a new use of Math.random in src/ shows up in meta.mathRandomApp.
  const rnd = { calls: 0, app: 0, callers: {}, s: 12345 };
  rnd.reset = () => { rnd.s = 12345; };
  Math.random = () => {
    rnd.calls++;
    const keep = Error.stackTraceLimit; Error.stackTraceLimit = 3;
    const line = String(new Error().stack).split('\n')[2] || '';
    Error.stackTraceLimit = keep;
    if (!line.includes('/node_modules/three/')) { rnd.app++; const k = line.replace(/^\s*at\s+/, '').replace(/.*\/(src\/)/, '$1').replace(/\)$/, ''); rnd.callers[k] = (rnd.callers[k] || 0) + 1; }
    rnd.s = (Math.imul(rnd.s, 1664525) + 1013904223) >>> 0;
    return rnd.s / 4294967296;
  };

  // ---- clocks: frozen. `performance.now() - t0 < 5` style loops then see zero elapsed time and never cut a job short.
  const FIXED = Date.UTC(2026, 5, 15, 12, 0, 0);
  const clock = { dateNow: 0 };
  Date.now = () => { clock.dateNow++; return FIXED; };
  Object.defineProperty(globalThis, 'performance', { value: { now: () => 0, mark() {}, measure() {}, timeOrigin: FIXED }, configurable: true, writable: true });

  // ---- 2d canvas: measureText width = length * 16 (as test/fronts.test.mjs), everything drawn is logged so sign textures can be hashed
  const imgOf = new WeakMap();
  const makeCtx = (canvas) => {
    const log = canvas.__log;
    const base = {
      canvas, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textBaseline: 'alphabetic', textAlign: 'start', imageSmoothingEnabled: true, globalAlpha: 1,
      measureText: (t) => ({ width: String(t).length * 16 }),
      fillRect(...a) { log.push(['fillRect', base.fillStyle, ...a]); },
      strokeRect(...a) { log.push(['strokeRect', base.strokeStyle, base.lineWidth, ...a]); },
      fillText(...a) { log.push(['fillText', base.font, base.fillStyle, base.textBaseline, ...a]); },
      drawImage(img, ...a) { imgOf.set(canvas, { img, a }); },
      getImageData(x, y, w, h) {
        const src = imgOf.get(canvas);
        if (!src) return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        const P = src.img._png, [dx, dy, dw, dh] = src.a.length >= 4 ? src.a : [0, 0, P.width, P.height];
        const out = new Uint8ClampedArray(w * h * 4);
        if (dw === P.width && dh === P.height && w === dw && h === dh) { out.set(P.data); return { width: w, height: h, data: out }; }
        // nearest-neighbour resample (the real code switches smoothing off for exactly this)
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const sx = Math.min(P.width - 1, Math.floor(((i + 0.5) * P.width) / dw)), sy = Math.min(P.height - 1, Math.floor(((j + 0.5) * P.height) / dh));
          const s = (sy * P.width + sx) * 4, o = (j * w + i) * 4;
          out[o] = P.data[s]; out[o + 1] = P.data[s + 1]; out[o + 2] = P.data[s + 2]; out[o + 3] = P.data[s + 3];
        }
        return { width: w, height: h, data: out };
      },
    };
    return new Proxy(base, {
      get(t, k) { if (k in t) return t[k]; if (typeof k === 'symbol' || k === 'then') return undefined; return (...a) => { log.push([k, ...a]); }; },
      set(t, k, v) { t[k] = v; return true; },
    });
  };
  const makeCanvas = () => {
    const c = { width: 300, height: 150, style: {}, __log: [], getContext() { return (c.__ctx ||= makeCtx(c)); }, toDataURL() { return 'data:,'; }, addEventListener() {}, remove() {} };
    return c;
  };
  const node = (tag) => (tag === 'canvas' ? makeCanvas() : { tagName: String(tag).toUpperCase(), style: {}, children: [], appendChild() {}, remove() {}, addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {} } });
  globalThis.document = { createElement: node, hidden: false, body: node('body'), documentElement: node('html'), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };

  // ---- Image: reads the PNGs of the world with pngjs
  globalThis.Image = class {
    set src(u) { this._src = u; }
    get src() { return this._src; }
    async decode() {
      const p = path.join(dataDir, String(this._src).replace(/^\.?\/?data\//, ''));
      this._png = PNG.sync.read(fs.readFileSync(p));
      this.naturalWidth = this.width = this._png.width; this.naturalHeight = this.height = this._png.height;
    }
  };

  // ---- fetch: the world files of the repository
  globalThis.fetch = async (u) => {
    const p = path.join(dataDir, String(u).replace(/^\.?\/?data\//, ''));
    if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => null };
    const txt = fs.readFileSync(p, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(txt), text: async () => txt };
  };

  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: globalThis.matchMedia, location: { search: '', href: 'http://localhost/' } };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.location = globalThis.window.location;
  globalThis.__harness = { furn: null };
  return { rnd, clock };
}
