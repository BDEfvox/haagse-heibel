// The stage: renderer, lights, the camera (sky drop → follow the action → free roam) and the
// contexts handed to gag scripts. Gag scripts think in "street space" (x along the street, z across it);
// every object they place is bent onto the real street here.
import * as THREE from 'three';
import { makeRng, hashStr, Runner, ease, clamp, lerp, Vox, sculpt, clearSigns, MAT } from './kit.js';
import { buildWorld, preload, U, cutWeight, CUT } from './world.js';
import { localeL, ambientL } from './street.js';
import { Fx } from './fx.js';
import { startAmbient, startLocale, mixFor, playGag, GAG_NAMES } from './gags.js';
import { makeBird } from './cast.js';
import { makeCar, makeTram } from './props.js';
import { sfx } from '../audio.js';

const SKY = {
  1: { top: '#6ec3ff', bot: '#d9f2ff', sun: '#fff6e0', sunI: 2.15, hs: '#e6f5ff', hg: '#b7c690', hI: 1.5, pos: [-16, 30, 22] },
  2: { top: '#5bb8ff', bot: '#eaf7ff', sun: '#fff1cc', sunI: 2.2, hs: '#e6f5ff', hg: '#c0c090', hI: 1.45, pos: [-20, 26, 20] },
  3: { top: '#ffab66', bot: '#ffecc9', sun: '#ffe6c2', sunI: 2.25, hs: '#fff1df', hg: '#bfa27e', hI: 1.45, pos: [-28, 18, 17] },
  4: { top: '#3d2a7a', bot: '#ff8a66', sun: '#ffa573', sunI: 1.8, hs: '#b79cf0', hg: '#6e5378', hI: 1.5, pos: [-26, 13, 20], night: true, fog: '#b0688a' },
  5: { top: '#060a22', bot: '#2c1b5c', sun: '#a9bdff', sunI: 1.3, hs: '#6f83e6', hg: '#2c2752', hI: 1.3, pos: [-14, 30, 18], night: true, stars: true, fog: '#1b1444' },
};
const AZ0 = 0.4, EL0 = 0.7, FOV = 30, TAN = Math.tan((FOV / 2) * (Math.PI / 180));
const DMIN = 20, DMAX = 9000;
const sm = (x) => x * x * (3 - 2 * x);
const angDiff = (a, b) => { const d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };
const _W = new THREE.Matrix4(), _T = new THREE.Matrix4(), _f = {}, _v = new THREE.Vector3();

/** Free the GPU buffers of an object that has left the scene for good. */
const SHARED = new Set([MAT.solid, MAT.glow, MAT.water, CUT.solid, CUT.glow, CUT.depth]);
function disposeTree(o) {
  o.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material && !SHARED.has(c.material)) c.material.dispose(); // per-object materials (signs, beams, clouds); shared ones stay
  });
}
const CALM = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Make an object live in a context's street space: its position is (x along, y up, z across) from that spot. */
function warp(obj, ctx, path) {
  obj._ctx = ctx;
  obj.updateMatrix = function () {
    const p = this.position;
    let ax = p.x, az = p.z;
    if (ax === 0 && az === 0 && p.y === 0 && !this._anch) {
      // geometry baked at street coordinates (alarm lamps, scorch marks, graffiti): anchor on its bounding box
      const geo = this.geometry || (this.children[0] && this.children[0].geometry);
      if (geo) { if (!geo.boundingBox) geo.computeBoundingBox(); const bb = geo.boundingBox; this._anch = [(bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2]; }
    }
    if (this._anch) { ax += this._anch[0]; az += this._anch[1]; }
    path.at(this._ctx.sc + ax, _f);
    this.matrix.compose(p, this.quaternion, this.scale);
    _W.makeRotationY(Math.atan2(-_f.tz, _f.tx));
    _W.setPosition(_f.x - _f.tz * az, 0, _f.z + _f.tx * az);
    _W.multiply(_T.makeTranslation(-ax, 0, -az));
    this.matrix.premultiply(_W);
    this.matrixWorldNeedsUpdate = true;
  };
}

export class Stage {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.overlay = root.querySelector('.stage-fx');
    this.flashEl = root.querySelector('.stage-flash');
    this.lite = matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 560;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lite ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#d9f2ff', 300, 3000);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 9000);
    this.sun = new THREE.DirectionalLight('#fff', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.hemi = new THREE.HemisphereLight('#fff', '#888', 1);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.lampLights = [];
    for (let i = 0; i < 5; i++) { const pl = new THREE.PointLight('#ffd27a', 0, 15, 1.7); this.lampLights.push(pl); this.scene.add(pl); }
    this.W = null;
    this.running = false;
    this.mode = 'idle';
    this._tok = 0;
    this.rig = { az: AZ0, el: EL0, dist: 80, tx: 0, ty: 1.5, tz: 0 };
    this.goal = { ...this.rig };
    this.pins = [];
    this.keys = new Set();
    this._bindInput();
    new ResizeObserver(() => this._resize()).observe(root);
    // one bad frame must not kill the page: log it, and bow out cleanly if it keeps happening
    this._errs = 0;
    this._tick = (now) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(this._tick);
      try {
        this._frame(now);
        this._errs = 0;
      } catch (e) {
        if (!this._errs++) console.error('frame error', e);
        if (this._errs > 20) { this.running = false; this.hooks?.onContextLost?.(); }
      }
    };
  }

  // ------------------------------------------------------------ input
  _take() {
    if (!this.W || this.mode === 'drop') return false;
    if (this.mode === 'follow') this._setMode('free');
    return true;
  }
  _pan(dx, dy) {
    const g = this.goal, mpp = (2 * g.dist * TAN) / (this.canvas.clientHeight || 1), kf = (dy * mpp) / Math.max(0.35, Math.sin(g.el)), kr = dx * mpp;
    g.tx += -kr * Math.cos(g.az) - kf * Math.sin(g.az);
    g.tz += kr * Math.sin(g.az) - kf * Math.cos(g.az);
    const R = this.W.region;
    g.tx = clamp(g.tx, R.x0 - 500, R.x1 + 500); g.tz = clamp(g.tz, R.z0 - 500, R.z1 + 500);
  }
  _bindInput() {
    const c = this.canvas, pts = new Map();
    let drag = null, pinch = null;
    const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, ang: Math.atan2(b.y - a.y, b.x - a.x) }; };
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.running = false; this.hooks?.onContextLost?.(); });
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, orbit: e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey, moved: false };
      else if (pts.size === 2) { drag = null; pinch = { ...two(), dist: this.goal.dist, az: this.goal.az }; }
    });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pinch && pts.size === 2) {
        if (!this._take()) return;
        const t = two();
        this.goal.dist = clamp((pinch.dist * pinch.d) / t.d, DMIN, DMAX);
        this.goal.az = pinch.az - (t.ang - pinch.ang);
        return;
      }
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.moved = true;
      if (!this._take()) return;
      if (drag.orbit) { this.goal.az -= dx * 0.005; this.goal.el = clamp(this.goal.el + dy * 0.004, 0.16, 1.5); }
      else this._pan(dx, dy);
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      pinch = null;
      drag = pts.size === 1 ? { ...[...pts.values()][0], orbit: false, moved: true } : null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('lostpointercapture', end);
    this._clearPointers = () => { pts.clear(); drag = null; pinch = null; };
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this._take()) return;
      this.goal.dist = clamp(this.goal.dist * Math.exp(e.deltaY * 0.0012), DMIN, DMAX);
    }, { passive: false });
    const key = (e, on) => {
      if (!this.running || e.target.closest?.('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '+', '-', '='].includes(k)) return;
      if (on) this.keys.add(k); else this.keys.delete(k);
      if (on) e.preventDefault();
    };
    window.addEventListener('keydown', (e) => key(e, true));
    window.addEventListener('keyup', (e) => key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }
  _keys(dt) {
    const K = this.keys;
    if (!K.size || !this._take()) return;
    const g = this.goal, px = 620 * dt;
    const x = (K.has('d') || K.has('arrowright') ? 1 : 0) - (K.has('a') || K.has('arrowleft') ? 1 : 0);
    const y = (K.has('s') || K.has('arrowdown') ? 1 : 0) - (K.has('w') || K.has('arrowup') ? 1 : 0);
    if (x || y) this._pan(-x * px, -y * px);
    if (K.has('q')) g.az += dt * 1.3;
    if (K.has('e')) g.az -= dt * 1.3;
    if (K.has('+') || K.has('=')) g.dist = clamp(g.dist * Math.exp(-dt * 1.4), DMIN, DMAX);
    if (K.has('-')) g.dist = clamp(g.dist * Math.exp(dt * 1.4), DMIN, DMAX);
  }

  _resize() {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fit = Math.max((w < h ? 16 : 27) / (this.camera.aspect * TAN), 15 / TAN) * 1.04;
  }

  /** Where the camera sits to watch one spot on the street. */
  _view(ctx) {
    const path = this.W.path, p = path.xz(ctx.sc, -(this.W.L.hw + this.W.L.bw) * 0.6 - 1.2);
    path.at(ctx.sc, _f);
    return { tx: p[0], tz: p[1], ty: 1.5, az: AZ0 + Math.atan2(-_f.tz, _f.tx), el: EL0, dist: this.fit || 65 };
  }
  _setMode(mode) {
    if (this.mode === mode) return;
    const was = this.mode;
    this.mode = mode;
    if (mode === 'free') {
      Object.assign(this.goal, this.rig);
      this.focusReq = null;
      if (was === 'follow' && this.autoFree) { this.goal.dist = Math.max(this.goal.dist, this.fit * 1.45); this.autoFree = false; }
    }
    if (mode === 'follow') {
      this.cutEnd = this.time + 30;
      // go to the freshest gag, or stay at the nearest spot
      let best = null;
      for (const g of this.gags) if (!best || g.t0 > best.t0) best = g;
      if (best) this.camCtx = best.ctx;
      else this.camCtx = this.locales.reduce((a, b) => (this._d2(b) < this._d2(a) ? b : a));
      this.lastSwitch = this.time; this.idleT = 0;
    }
    this.hooks.onMode?.(mode);
  }
  _d2(ctx) { const p = this.W.path.xz(ctx.sc, 0); return (p[0] - this.rig.tx) ** 2 + (p[1] - this.rig.tz) ** 2; }
  /** Debug: play a gag at the spot the camera is on. */
  debugPlay(name) { return this.W ? playGag(this.camCtx, name) : null; }
  get gagNames() { return GAG_NAMES; }
  /** Resume the directed camera. */
  follow() { if (this.W && this.mode === 'free') this._setMode('follow'); }
  /** Fly the free camera to a spot with something going on. */
  flyTo(ctx) {
    if (!this.W || this.mode === 'drop') return;
    if (this.mode === 'follow') this._setMode('free');
    Object.assign(this.goal, this._view(ctx));
  }

  // ------------------------------------------------------------ show
  async show(st, hooks = {}, opts = {}) {
    this.hide();
    const token = this._tok;
    const level = clamp(Math.round(+st.level) || 1, 1, 5), sky = SKY[level];
    this.hooks = hooks;
    this.root.style.setProperty('--sky-top', sky.top);
    this.root.style.setProperty('--sky-bot', sky.bot);
    this.root.classList.toggle('stars', !!sky.stars);
    let W;
    try {
      W = await buildWorld(st, opts.geometry, { night: !!sky.night, seed: opts.seed || '', lite: this.lite });
    } catch (e) {
      console.error('world build failed', e);
      return false;
    }
    if (token !== this._tok) { W.dispose(); return false; }
    try {
      this._begin(W, st, sky, level, opts);
    } catch (e) {
      console.error('scene start failed', e);
      if (!this.W) W.dispose();
      this.hide();
      return false;
    }
    return true;
  }

  _begin(W, st, sky, level, opts) {
    const hooks = this.hooks;
    this.W = W;
    this.sky = sky;
    this.sun.color.set(sky.sun); this.sun.intensity = sky.sunI;
    this.hemi.color.set(sky.hs); this.hemi.groundColor.set(sky.hg); this.hemi.intensity = sky.hI;
    this.scene.fog.color.set(sky.fog || sky.bot);
    this.sunDir = new THREE.Vector3(...sky.pos).normalize();
    this.scene.add(W.group);
    this.dyn = new THREE.Group();
    this.scene.add(this.dyn);

    const rnd = makeRng(hashStr((st.name || '') + '|' + (st.buurt || '') + '|' + (opts.seed || '') + '|stage'));
    const path = W.path, len = path.sB - path.sA;
    this.fx = new Fx(this.scene, this.camera, this.overlay);
    this.runner = new Runner();
    this.actors = [];
    this.extras = [];
    this.life = [];
    this.lifeT = { tram: rnd.range(2, 6), car: 1 };
    this.gags = new Set();
    this.time = 0;
    this.timeScale = 1;
    this.slow = null;
    this.focusReq = null;
    this.lampT = 0;
    this.mix = mixFor(opts.crime?.cat, opts.crime?.cats);
    this.only = opts.only || null;
    this._resize();

    // ---- where the gags play: the spot that was clicked, plus more along the street
    const A = W.anchors, edge = Math.min(22, len / 2), lo = path.sA + edge, hi = path.sB - edge;
    let want = (path.sA + path.sB) / 2;
    if (opts.lngLat) { const p = W.toScene(opts.lngLat[0], opts.lngLat[1]), pr = path.project(p[0], p[1]); if (pr.d < 120) want = pr.s; }
    want = clamp(want, lo, hi);
    const score = (s) => A.houses.filter((h) => Math.abs(h.s - s) < 17).length + 2 * A.benches.filter((b) => Math.abs(b.s - s) < 18).length
      + 2 * A.racks.filter((b) => Math.abs(b.s - s) < 18).length + (A.atms.some((b) => Math.abs(b.s - s) < 14) ? 4 : 0) + (A.parked.some((b) => Math.abs(b.s - s) < 16) ? 2 : 0) - Math.abs(s - want) * 0.12;
    let main = want, best = -1e9;
    for (let s = Math.max(lo, want - 26); s <= Math.min(hi, want + 26); s += 4) { const sc = score(s); if (sc > best) { best = sc; main = s; } }
    const centres = [main], n = clamp(Math.floor(len / 62), 1, this.lite ? 4 : 7);
    for (let i = 0; i < n; i++) {
      const c = n === 1 ? (lo + hi) / 2 : lerp(lo, hi, i / (n - 1));
      if (centres.every((m) => Math.abs(m - c) >= 50)) centres.push(c);
    }

    // a cash machine deserves a spot of its own (the big set piece needs one)
    for (const a of A.atms.slice(0, 3)) {
      const s = clamp(a.s, lo, hi);
      if (centres.some((m) => Math.abs(m - a.s) < 13)) continue;
      let bi = -1, bd = 1e9;
      centres.forEach((m, i) => { const d = Math.abs(m - s); if (d < bd && (i > 0 || d < 30)) { bd = d; bi = i; } });
      if (bi >= 0 && bd < 45) centres[bi] = s;
      else if (centres.every((m) => Math.abs(m - s) >= 45)) centres.push(s);
    }
    const stage = this;
    const mk = (L, sc, id) => {
      const map = (x, z) => path.xz(sc + x, z);
      const crnd = makeRng(hashStr(st.name + '|' + id + '|' + (opts.seed || '')));
      const near = () => { if (id === 'amb') return this.rig.dist < 400; const p = path.xz(sc, 0); return Math.hypot(p[0] - this.rig.tx, p[1] - this.rig.tz) < Math.max(55, this.rig.dist * 0.8) && this.rig.dist < 500; };
      const fxw = {
        text(str, at, o = {}) {
          let wp;
          if (at.isVector3) { const p = map(at.x, at.z); wp = new THREE.Vector3(p[0], at.y, p[1]); stage.fx.text(str, wp, o); }
          else { stage.fx.text(str, at, o); const ob = at.g || at; ob.updateWorldMatrix(true, false); wp = _v.setFromMatrixPosition(ob.matrixWorld); }
          // big comic words are the punchlines: nudge the camera towards them
          if ((o.size ?? 22) >= 20) stage._focus(ctx, wp.x, wp.z, 0.66, 2.4, 1);
        },
        shake: (a) => { if (near() && !CALM) stage.fx.shake(a); },
      };
      for (const k of ['burst', 'smoke', 'puff', 'cash', 'confetti', 'sparks', 'fireball', 'firework']) fxw[k] = (x, y, z, ...rest) => { const p = map(x, z); stage.fx[k](p[0], y, p[1], ...rest); };
      const ctx = {
        id, sc, L, st, level, night: !!sky.night, rnd: crnd, fx: fxw, runner: this.runner, mix: this.mix,
        world: { add: (o) => { warp(o, ctx, path); this.dyn.add(o); }, remove: (o) => { this.dyn.remove(o); disposeTree(o); } },
        run: (g) => this.runner.run(g),
        spawn(a, x, z, y) {
          a.g.position.set(x, y ?? 0, z);
          a.baseScale = a.g.scale.x;
          a.alive = true;
          a.ctx = ctx;
          warp(a.g, ctx, path);
          stage.dyn.add(a.g);
          stage.actors.push(a);
          return a;
        },
        despawn(a) {
          a.alive = false;
          a.g.parent?.remove(a.g);
          disposeTree(a.g);
          const i = stage.actors.indexOf(a);
          if (i >= 0) stage.actors.splice(i, 1);
        },
        toLocal(v) { const pr = path.project(v.x, v.z); v.x = pr.s - sc; v.z = pr.v; return v; },
        sfx: (name, ...args) => { if (!document.hidden && near()) sfx[name]?.(...args); },
        focus: (x, z, zoom = 0.6, hold = 2.5, prio = 1) => { const p = map(x, z); this._focus(ctx, p[0], p[1], zoom, hold, prio); },
        shake: (a) => { if (near() && !CALM) this.fx.shake(a); },
        slowmo: (scale, dur) => { if (near() && !CALM) this.slow = { scale, t: dur }; },
        flash: (color = '#fff', dur = 0.4) => {
          if (!near() || CALM) return; // no full-screen flashes for people who asked for reduced motion
          this.flashEl.style.background = color;
          this.flashEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur * 1000, easing: 'ease-out' });
        },
        news: (t) => hooks.onNews?.(t),
        incident: (k = 1) => hooks.onIncident?.(k),
        gagStart: (name) => {
          const g = { ctx, name, t0: this.time };
          (ctx._gags ||= new Map()).set(name, g);
          this.gags.add(g);
          if (this.mode === 'follow' && ctx !== this.camCtx && ![...this.gags].some((q) => q.ctx === this.camCtx) && this.time - this.lastSwitch > 4) { this.camCtx = ctx; this.lastSwitch = this.time; this.idleT = 0; }
        },
        gagEnd: (name) => { const g = ctx._gags?.get(name); if (g) { this.gags.delete(g); ctx._gags.delete(name); } },
      };
      return ctx;
    };
    const amb = (this.amb = mk(ambientL(W), path.len / 2, 'amb'));
    this.locales = centres.map((sc, i) => mk(localeL(W, sc), sc, 'loc' + i));
    amb.locales = this.locales;
    for (const c of this.locales) c.amb = amb;
    this.ctx = this.camCtx = this.locales[0];

    // ---- the drop from the sky
    const dur = 4.4;
    this.drop = { t: 0, dur, d0: this.lite ? 6500 : 8500, c0: path.xz((path.sA + path.sB) / 2, 0) };
    this.mode = 'drop';
    this.cutEnd = dur + 30;
    this.lastSwitch = dur; this.idleT = 0; this.autoFree = true;
    U.uGrow.value = 0.02;
    Object.assign(this.rig, { tx: this.drop.c0[0], tz: this.drop.c0[1], ty: 0, az: W.northAz, el: 1.5, dist: this.drop.d0 });

    startAmbient(amb);
    this.locales.forEach((c, i) => startLocale(c, i === 0
      ? { only: opts.only || null, delay: dur + 0.9, signature: true, withHeli: level >= 5 }
      : { delay: dur + rnd.range(6, 24), signature: rnd.chance(0.5) }));

    this._clouds(rnd, sky);
    // the stork, The Hague's mascot, on a chimney near the action
    if (A.chimneys.length) {
      const m = path.xz(main, 0), c = A.chimneys.reduce((a, b) => ((b.x - m[0]) ** 2 + (b.z - m[1]) ** 2 < (a.x - m[0]) ** 2 + (a.z - m[1]) ** 2 ? b : a));
      const stork = makeBird(rnd, 'stork');
      stork.g.position.set(c.x, c.y + 0.3, c.z);
      stork.g.rotation.y = rnd.range(0, 6.28);
      const nest = sculpt((v) => { v.box(c.x, c.y, c.z, 1.1, 0.3, 1.1, '#9b7653', 0.1); v.box(c.x, c.y + 0.2, c.z, 0.8, 0.14, 0.8, '#7a5a3c'); });
      this.dyn.add(nest, stork.g);
      this.extras.push(stork);
    }
    this.running = true;
    this.last = performance.now();
    cancelAnimationFrame(this._raf); // never two loops at once
    this._raf = requestAnimationFrame(this._tick);
  }

  _clouds(rnd, sky) {
    this.clouds = [];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: sky.night ? 0.42 : 0.92, fog: false });
    const c0 = this.drop.c0;
    for (let i = 0; i < 22; i++) {
      const v = new Vox(i + 20), n = rnd.int(4, 7), s = rnd.range(16, 34);
      for (let k = 0; k < n; k++) {
        const w = rnd.range(2.2, 3.6) * s, h = rnd.range(1.0, 2.0) * s;
        v.box((k * 1.5 - n * 0.75 + rnd.range(-0.4, 0.4)) * s, (Math.abs(k - n / 2) < 1.2 ? 0.5 : 0) * s + rnd.range(-0.2, 0.2) * s, rnd.range(-0.8, 0.8) * s, w, h, rnd.range(1.8, 3.0) * s, '#ffffff');
      }
      const m = v.mesh(mat, false, false);
      const r = rnd.range(380, 2600), a = rnd.range(0, 6.28);
      m.position.set(c0[0] + Math.cos(a) * r, rnd.range(700, 1600), c0[1] + Math.sin(a) * r);
      m.userData.v = rnd.range(4, 12) * rnd.sign();
      this.dyn.add(m);
      this.clouds.push(m);
    }
  }

  hide() {
    this._tok++;
    this.running = false;
    cancelAnimationFrame(this._raf);
    this._clearPointers?.();
    this.mode = 'idle';
    if (this.runner) this.runner.clear();
    if (this.fx) { this.fx.dispose(); this.fx = null; }
    for (const p of this.pins) p.el.remove();
    this.pins = [];
    if (this.dyn) {
      disposeTree(this.dyn);
      this.scene.remove(this.dyn);
      this.dyn = null;
    }
    if (this.W) { this.scene.remove(this.W.group); this.W.dispose(); this.W = null; clearSigns(); }
    for (const l of this.lampLights) l.intensity = 0;
    this.actors = [];
    this.gags = new Set();
    this.keys.clear();
  }

  _focus(ctx, X, Z, zoom, hold, prio) {
    if (this.mode !== 'follow') return;
    const f = this.focusReq;
    if (ctx !== this.camCtx) {
      if (prio < 2) return;
      this.camCtx = ctx; this.lastSwitch = this.time; this.idleT = 0;
    } else if (prio < 2 && f && this.time < f.until + 2.2) return;
    if (f && this.time < f.until && f.prio > prio) return;
    this.focusReq = { X, Z, zoom, until: this.time + hold, prio };
  }

  // ------------------------------------------------------------ passing trams and traffic on other streets
  _life(dt) {
    const W = this.W, T = this.lifeT, rnd = Math.random;
    T.tram -= dt; T.car -= dt;
    if (T.tram < 0 && W.tramLines.length) {
      T.tram = 7 + rnd() * 9;
      if (this.life.filter((l) => l.tram).length < 3) {
        const path = W.tramLines[Math.floor(rnd() * W.tramLines.length)], dir = rnd() < 0.5 ? 1 : -1;
        this._addLife(makeTram(W.night), path, dir, 9, 0, true);
      }
    }
    if (T.car < 0 && W.sideRoads.length) {
      T.car = 1.2 + rnd() * 2.6;
      if (this.life.filter((l) => !l.tram).length < (this.lite ? 4 : 9)) {
        const path = W.sideRoads[Math.floor(rnd() * W.sideRoads.length)], dir = rnd() < 0.5 ? 1 : -1;
        const r = makeRng((rnd() * 1e9) | 0);
        this._addLife(makeCar(r, r.chance(0.1) ? 'taxi' : r.chance(0.1) ? 'van' : 'car', W.night), path, dir, 8 + rnd() * 3, dir * 1.7, false);
      }
    }
    for (let i = this.life.length - 1; i >= 0; i--) {
      const l = this.life[i];
      l.s += l.dir * l.speed * dt;
      if (l.s < 0 || l.s > l.path.len) { this.dyn.remove(l.a.g); disposeTree(l.a.g); this.life.splice(i, 1); continue; }
      l.path.at(l.s, _f);
      l.a.g.position.set(_f.x - _f.tz * l.lane, 0, _f.z + _f.tx * l.lane);
      l.a.heading = Math.atan2(_f.tx * l.dir, _f.tz * l.dir);
      l.a.moving = l.speed;
      l.a.update(dt);
    }
  }
  _addLife(a, path, dir, speed, lane, tram) {
    const l = { a, path, dir, speed, lane, tram, s: dir > 0 ? 0.5 : path.len - 0.5 };
    path.at(l.s, _f);
    a.g.position.set(_f.x - _f.tz * lane, 0, _f.z + _f.tx * lane);
    a.g.rotation.y = a.heading = Math.atan2(_f.tx * dir, _f.tz * dir);
    this.dyn.add(a.g);
    this.life.push(l);
  }

  // ------------------------------------------------------------ "something is happening over there" pins
  _pins() {
    const show = this.mode === 'free';
    const live = show ? this.locales.filter((c) => [...this.gags].some((g) => g.ctx === c)) : [];
    while (this.pins.length < live.length) {
      const el = document.createElement('button');
      el.className = 'gag-pin';
      el.setAttribute('aria-label', 'Jump to the action');
      el.innerHTML = '<span>!</span>';
      const pin = { el, ctx: null };
      el.addEventListener('click', () => { if (pin.ctx) { this.flyTo(pin.ctx); this.hooks.onPin?.(); } });
      this.overlay.appendChild(el);
      this.pins.push(pin);
    }
    const w = this.overlay.clientWidth, h = this.overlay.clientHeight;
    this.pins.forEach((pin, i) => {
      const c = live[i];
      pin.ctx = c || null;
      if (!c) { pin.el.hidden = true; return; }
      const p = this.W.path.xz(c.sc, 0);
      _v.set(p[0], 5, p[1]).project(this.camera);
      const behind = _v.z > 1;
      let x = behind ? -_v.x : _v.x, y = behind ? -1 : _v.y;
      const off = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.86;
      const close = !off && Math.hypot(p[0] - this.rig.tx, p[1] - this.rig.tz) < this.rig.dist * 0.5 && this.rig.dist < 160;
      pin.el.hidden = close;
      x = clamp(x, -0.9, 0.9); y = clamp(y, -0.7, 0.82);
      pin.el.classList.toggle('edge', off);
      pin.el.style.transform = `translate(${((x + 1) / 2) * w}px, ${((1 - y) / 2) * h}px)`;
    });
  }

  // ------------------------------------------------------------ frame
  _frame(now) {
    const real = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    if (this.slow) { this.slow.t -= real; if (this.slow.t <= 0) this.slow = null; }
    const target = this.slow ? this.slow.scale : 1;
    this.timeScale += (target - this.timeScale) * Math.min(1, real * 14);
    const dt = real * this.timeScale * (this.debugSpeed || 1);
    this.time += dt;
    const W = this.W, r = this.rig, g = this.goal;

    this.runner.update(dt);
    for (let i = this.actors.length - 1; i >= 0; i--) this.actors[i].update(dt);
    for (const e of this.extras) e.update(dt);
    this._life(dt);
    this.fx.update(dt);
    for (const c of this.clouds) c.position.x += c.userData.v * dt;

    // ---- camera
    if (this.mode === 'drop') {
      const D = this.drop;
      if (!this.hold) D.t += real * (this.debugSpeed || 1);
      const e = clamp(D.t / D.dur), v = this._view(this.camCtx);
      r.dist = Math.exp(lerp(Math.log(D.d0), Math.log(v.dist), sm(e))) * (1 - 0.08 * Math.sin(Math.PI * clamp((e - 0.8) / 0.2)));
      r.el = lerp(1.5, v.el, sm(clamp((e - 0.3) / 0.7)));
      r.az = W.northAz + angDiff(W.northAz, v.az) * sm(clamp((e - 0.12) / 0.8));
      const k = sm(e);
      r.tx = lerp(D.c0[0], v.tx, k); r.tz = lerp(D.c0[1], v.tz, k); r.ty = 1.5 * k;
      U.uGrow.value = 0.02 + 0.98 * ease.outBack(clamp((e - 0.5) / 0.4));
      if (e > 0.55 && !D.whoosh) { D.whoosh = true; if (!document.hidden) sfx.whoosh?.(); }
      if (e >= 1) {
        U.uGrow.value = 1;
        this.mode = 'follow';
        Object.assign(g, v);
        this.fx.shake(0.22);
        if (!document.hidden) sfx.thud?.();
        this.hooks.onMode?.('follow');
      }
    } else {
      this._keys(real);
      if (this.mode === 'follow') {
        const busy = [...this.gags].some((q) => q.ctx === this.camCtx);
        this.idleT = busy ? 0 : this.idleT + real;
        if (this.idleT > 3 && this.time - this.lastSwitch > 5) {
          let nb = null;
          for (const q of this.gags) if (q.ctx !== this.camCtx && (!nb || q.t0 > nb.t0)) nb = q;
          if (nb) { this.camCtx = nb.ctx; this.lastSwitch = this.time; this.idleT = 0; this.focusReq = null; }
        }
        Object.assign(g, this._view(this.camCtx));
        g.az += Math.sin(this.time * 0.22) * 0.04;
        const f = this.focusReq;
        if (f && this.time < f.until) { g.tx = lerp(g.tx, f.X, 0.85); g.tz = lerp(g.tz, f.Z, 0.85); g.dist *= f.zoom; g.ty = 2; g.el += 0.1; }
        else if (this.time > this.cutEnd && !this.only) this._setMode('free');
      }
      const k = 1 - Math.exp(-real * (this.mode === 'free' ? 10 : 3.2));
      r.tx += (g.tx - r.tx) * k; r.tz += (g.tz - r.tz) * k; r.ty += ((g.ty ?? 1.5) - r.ty) * k;
      r.az += angDiff(r.az, g.az) * k; r.el += (g.el - r.el) * k;
      r.dist *= Math.pow(g.dist / r.dist, k);
    }
    const sh = this.fx.shakeAmt * Math.max(1, r.dist / 70), ce = Math.cos(r.el);
    const tx = r.tx + (Math.random() - 0.5) * sh, ty = r.ty + (Math.random() - 0.5) * sh, tz = r.tz + (Math.random() - 0.5) * sh;
    this.camera.position.set(tx + r.dist * Math.sin(r.az) * ce, ty + r.dist * Math.sin(r.el), tz + r.dist * Math.cos(r.az) * ce);
    this.camera.lookAt(tx, ty, tz);
    this.camera.near = clamp(r.dist * 0.04, 0.8, 80);
    this.camera.far = r.dist * 7 + 9000;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene.fog.near = r.dist * 1.6 + 180;
    this.scene.fog.far = r.dist * 7 + 2400;

    // ---- things in the way duck; shadows follow the camera
    U.uFocus.value.set(r.tx, 0, r.tz);
    U.uCamDir.value.set(Math.sin(r.az), Math.cos(r.az));
    U.uTan.value = Math.tan(clamp(r.el, 0.1, 1.45));
    U.uR.value = r.dist * 0.6 + 20;
    U.uCut.value = clamp((1.3 - r.el) / 0.15) * clamp((700 - r.dist) / 300);
    for (const s of W.signs) s.m.visible = U.uGrow.value > 0.9 && cutWeight(s.x, s.z) < 0.5;
    const half = clamp(r.dist * 0.55, 45, 260), sc = this.sun.shadow.camera;
    this.sun.castShadow = r.dist < 1300;
    if (Math.abs(half - (this._half || 0)) > half * 0.06) {
      this._half = half;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = half * 4 + 200;
      sc.updateProjectionMatrix();
      this.sun.shadow.normalBias = (half / 1024) * 1.4;
    }
    this.sun.target.position.set(r.tx, 0, r.tz);
    this.sun.position.set(r.tx + this.sunDir.x * (half * 1.7 + 60), this.sunDir.y * (half * 1.7 + 60), r.tz + this.sunDir.z * (half * 1.7 + 60));
    if (this.sky.night) {
      this.lampT -= real;
      if (this.lampT < 0) {
        this.lampT = 0.4;
        const lamps = r.dist < 260 ? W.anchors.lamps.map((l) => [l, (l.X - r.tx) ** 2 + (l.Z - r.tz) ** 2]).filter((q) => q[1] < 70 * 70).sort((a, b) => a[1] - b[1]) : [];
        this.lampLights.forEach((pl, i) => {
          const l = lamps[i];
          pl.intensity = l ? 26 : 0;
          if (l) pl.position.set(l[0].X, l[0].y - 0.4, l[0].Z);
        });
      }
    }
    this._pins();
    this.renderer.render(this.scene, this.camera);
  }
}
export { preload };
