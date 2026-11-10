// The stage: renderer, lights, camera rig, intro pop-in, and the context handed to gag scripts.
import * as THREE from 'three';
import { makeRng, hashStr, Runner, ease, clamp, lerp, Vox } from './kit.js';
import { buildStreet } from './street.js';
import { Fx } from './fx.js';
import { startShow } from './gags.js';
import { sfx } from '../audio.js';

const SKY = {
  1: { top: '#6ec3ff', bot: '#d9f2ff', sun: '#fff6e0', sunI: 2.15, hs: '#e6f5ff', hg: '#b7c690', hI: 1.5, pos: [-16, 30, 22] },
  2: { top: '#5bb8ff', bot: '#eaf7ff', sun: '#fff1cc', sunI: 2.2, hs: '#e6f5ff', hg: '#c0c090', hI: 1.45, pos: [-20, 26, 20] },
  3: { top: '#ffab66', bot: '#ffecc9', sun: '#ffe6c2', sunI: 2.25, hs: '#fff1df', hg: '#bfa27e', hI: 1.45, pos: [-28, 18, 17] },
  4: { top: '#3d2a7a', bot: '#ff8a66', sun: '#ffa573', sunI: 1.8, hs: '#b79cf0', hg: '#6e5378', hI: 1.5, pos: [-26, 13, 20], night: true },
  5: { top: '#060a22', bot: '#2c1b5c', sun: '#a9bdff', sunI: 1.3, hs: '#6f83e6', hg: '#2c2752', hI: 1.3, pos: [-14, 30, 18], night: true, stars: true },
};
const AZ0 = 0.42, EL0 = 0.56;

export class Stage {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.overlay = root.querySelector('.stage-fx');
    this.flashEl = root.querySelector('.stage-flash');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
    this.sun = new THREE.DirectionalLight('#fff', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -36; sc.right = 36; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.hemi = new THREE.HemisphereLight('#fff', '#888', 1);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.world = null;
    this.running = false;
    this.user = { az: 0, el: 0, zoom: 1 };
    this.rig = { az: AZ0, el: EL0, dist: 80, tx: 0, ty: 1.5, tz: 0 };
    this._bindInput();
    new ResizeObserver(() => this._resize()).observe(root);
    this._tick = this._tick.bind(this);
  }

  _bindInput() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, az: this.user.az, el: this.user.el }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.user.az = clamp(drag.az - (e.clientX - drag.x) * 0.005, -1.1, 1.1);
      this.user.el = clamp(drag.el + (e.clientY - drag.y) * 0.004, -0.32, 0.6);
    });
    const end = () => { drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.user.zoom = clamp(this.user.zoom * Math.exp(e.deltaY * 0.0012), 0.35, 1.3); }, { passive: false });
  }

  _resize() {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.L) this.fitDist = this._fit();
  }

  _place(az, el, dist, tx, ty, tz) {
    const ce = Math.cos(el);
    this.camera.position.set(tx + dist * Math.sin(az) * ce, ty + dist * Math.sin(el), tz + dist * Math.cos(az) * ce);
    this.camera.lookAt(tx, ty, tz);
    this.camera.updateMatrixWorld();
  }
  /** Distance at which the whole island fits the viewport. */
  _fit() {
    const L = this.L, v = new THREE.Vector3();
    let d = 80;
    const portrait = this.camera.aspect < 1;
    for (let i = 0; i < 8; i++) {
      this._place(AZ0, EL0, d, 0, 1.5, L.zc);
      let m = 0;
      for (const x of [-25, 25]) for (const y of [-2.5, 10]) for (const z of [L.zB, L.zF]) {
        v.set(x, y, z).project(this.camera);
        m = Math.max(m, Math.abs(v.x) / (portrait ? 1.7 : 1.02), Math.abs(v.y) / 0.94);
      }
      d *= m;
    }
    return d;
  }

  show(st, hooks = {}, opts = {}) {
    this.hide();
    const level = clamp(st.level || 1, 1, 5), sky = SKY[level];
    const rnd = makeRng(hashStr((st.name || '') + '|' + (st.buurt || '') + '|' + (opts.seed || '')));
    this.root.style.setProperty('--sky-top', sky.top);
    this.root.style.setProperty('--sky-bot', sky.bot);
    this.root.classList.toggle('stars', !!sky.stars);
    this.sun.color.set(sky.sun); this.sun.intensity = sky.sunI;
    this.hemi.color.set(sky.hs); this.hemi.groundColor.set(sky.hg); this.hemi.intensity = sky.hI;

    const world = (this.world = new THREE.Group());
    this.scene.add(world);
    const { pieces, L } = buildStreet(st, rnd, !!sky.night);
    this.L = L;
    this.sun.position.set(sky.pos[0], sky.pos[1], sky.pos[2] + L.zc);
    this.sun.target.position.set(0, 0, L.zc);

    // pop-in bookkeeping
    const box = new THREE.Box3(), ctr = new THREE.Vector3();
    this.pops = pieces.map((p) => {
      world.add(p.obj);
      box.setFromObject(p.obj);
      box.getCenter(ctr);
      const ground = p.kind === 'ground';
      const piv = ground ? new THREE.Vector3(0, -2, L.zc) : new THREE.Vector3(ctr.x, Math.max(0, box.min.y), ctr.z);
      const base = p.obj.position.clone(), rot = p.obj.rotation.y;
      const u = (p.x + 24) / 48;
      const delay = ground ? 0 : p.kind === 'house' ? 0.3 + u * 0.75 : 0.55 + u * 0.85 + rnd() * 0.15;
      p.obj.visible = false;
      return { obj: p.obj, piv, base, delay, t: 0, done: false, ground, house: p.kind === 'house' };
    });
    if (sky.night) {
      L.lamps.forEach((lp, i) => {
        if (i % 2) return;
        const pl = new THREE.PointLight('#ffd27a', 26, 13, 1.7);
        pl.position.set(lp.x, lp.y - 0.4, lp.z);
        world.add(pl);
      });
    }
    this._clouds(rnd, sky, L);

    this.fx = new Fx(this.scene, this.camera, this.overlay);
    // big comic words are the punchlines: nudge the camera towards them
    const text0 = this.fx.text.bind(this.fx);
    this.fx.text = (str, at, o = {}) => {
      text0(str, at, o);
      if ((o.size ?? 22) >= 20 && this.ctx) {
        const p = at.isVector3 ? at : at.g ? at.g.position : at.position;
        this.ctx.focus(p.x, p.z, 0.66, 2.4, 1);
      }
    };
    this.runner = new Runner();
    this.actors = [];
    this.time = 0;
    this.introT = 0;
    this.timeScale = 1;
    this.slow = null;
    this.focusReq = null;
    this.user = { az: 0, el: 0, zoom: 1 };
    this._resize();
    this.fitDist = this._fit();
    Object.assign(this.rig, { az: AZ0 - 0.9, el: 1.38, dist: this.fitDist * 2.2, tx: 0, ty: 1.5, tz: L.zc });

    const stage = this;
    const ctx = (this.ctx = {
      L, st, level, night: !!sky.night, rnd, fx: this.fx, runner: this.runner, world,
      run: (g) => this.runner.run(g),
      spawn(a, x, z, y) {
        a.g.position.set(x, y ?? L.yAt(z), z);
        a.baseScale = a.g.scale.x;
        a.alive = true;
        world.add(a.g);
        stage.actors.push(a);
        return a;
      },
      despawn(a) {
        a.alive = false;
        a.g.parent?.remove(a.g);
        const i = stage.actors.indexOf(a);
        if (i >= 0) stage.actors.splice(i, 1);
      },
      sfx: (name, ...args) => { if (!document.hidden) sfx[name]?.(...args); },
      focus: (x, z, zoom = 0.6, hold = 2.5, prio = 1) => {
        const f = this.focusReq;
        if (prio < 2) {
          // soft punch-ins never fight the user's own camera, interrupt each other, or fire back-to-back
          if (this.user.zoom < 0.97 || Math.abs(this.user.az) > 0.05 || this.introT < 2.6) return;
          if (f && this.time < f.until + 2.2) return;
        }
        this.focusReq = { x, z, zoom, until: this.time + hold, prio };
      },
      shake: (a) => this.fx.shake(a),
      slowmo: (scale, dur) => { this.slow = { scale, t: dur }; },
      flash: (color = '#fff', dur = 0.4) => {
        this.flashEl.style.background = color;
        this.flashEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur * 1000, easing: 'ease-out' });
      },
      news: (t) => hooks.onNews?.(t),
      incident: (n = 1) => hooks.onIncident?.(n),
    });
    this.showStartsAt = 1.15;
    this.showStarted = false;
    this.only = opts.only || null;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._tick);
  }

  _clouds(rnd, sky, L) {
    this.clouds = [];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: sky.night ? 0.5 : 0.95 });
    for (let i = 0; i < 7; i++) {
      const v = new Vox(i + 20);
      const n = rnd.int(3, 5);
      for (let k = 0; k < n; k++) v.box(k * 1.6 - n * 0.8 + rnd.range(-0.3, 0.3), rnd.range(-0.3, 0.3), rnd.range(-0.5, 0.5), rnd.range(2, 3.4), rnd.range(0.9, 1.6), rnd.range(1.6, 2.6), '#ffffff');
      const m = v.mesh(mat, false, false);
      const behind = i < 5;
      m.position.set(rnd.range(-40, 40), behind ? rnd.range(4, 15) : rnd.range(-9, -5), behind ? L.zB - rnd.range(5, 16) : L.zF + rnd.range(3, 8));
      m.userData.v = rnd.range(0.25, 0.7) * rnd.sign();
      this.world.add(m);
      this.clouds.push(m);
    }
  }

  hide() {
    this.running = false;
    if (this.runner) this.runner.clear();
    if (this.fx) { this.fx.dispose(); this.fx = null; }
    if (this.world) {
      this.world.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.scene.remove(this.world);
      this.world = null;
    }
    this.actors = [];
    this.pops = [];
    this.L = null;
  }

  _tick(now) {
    if (!this.running) return;
    requestAnimationFrame(this._tick);
    const real = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.slow) { this.slow.t -= real; if (this.slow.t <= 0) this.slow = null; }
    const target = this.slow ? this.slow.scale : 1;
    this.timeScale += (target - this.timeScale) * Math.min(1, real * 14);
    const dt = real * this.timeScale * (this.debugSpeed || 1);
    this.time += dt;
    this.introT += real;

    // pieces pop in
    let popped = 0;
    for (const p of this.pops) {
      if (p.done || this.introT < p.delay) continue;
      p.obj.visible = true;
      p.t += real;
      const dur = p.ground ? 0.7 : 0.5, u = Math.min(1, p.t / dur);
      const s = Math.max(0.001, p.ground ? ease.outBack(u) : ease.outElastic(u * 0.9 + 0.1));
      p.obj.scale.setScalar(s);
      p.obj.position.set(p.base.x * s + p.piv.x * (1 - s), p.base.y * s + p.piv.y * (1 - s) + (p.ground ? 0 : (1 - ease.outCubic(u)) * 2.5), p.base.z * s + p.piv.z * (1 - s));
      if (p.t === real && !p.ground) popped += p.house ? 2 : 1;
      if (u >= 1) { p.done = true; p.obj.scale.setScalar(1); p.obj.position.copy(p.base); }
    }
    if (popped && now - (this._lastPop || 0) > 70) { this._lastPop = now; this.ctx.sfx(popped > 1 ? 'thud' : 'pop', 0.8 + Math.random() * 0.8); }
    if (!this.showStarted && this.introT > this.showStartsAt) { this.showStarted = true; startShow(this.ctx, this.only); }

    this.runner.update(dt);
    for (let i = this.actors.length - 1; i >= 0; i--) this.actors[i].update(dt);
    if (this.L.stork) this.L.stork.update(dt);
    this.fx.update(dt);
    for (const c of this.clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 46) c.position.x = -46; if (c.position.x < -46) c.position.x = 46; }

    // camera rig
    const L = this.L, r = this.rig, it = clamp(this.introT / 1.9);
    let az = AZ0 + this.user.az + Math.sin(this.time * 0.22) * 0.05, el = clamp(EL0 + this.user.el, 0.22, 1.3);
    let dist = this.fitDist * this.user.zoom, tx = 0, ty = 1.5, tz = L.zc;
    if (this.focusReq && this.time < this.focusReq.until) {
      const f = this.focusReq;
      tx = f.x * 0.85; tz = lerp(L.zc, f.z, 0.8); dist *= f.zoom; ty = 2;
      el = Math.min(1.3, el + 0.16); // look over the front-row trees
    } else if (this.user.zoom < 0.95) {
      tx = clamp(r.tx, -18, 18);
    }
    if (it < 1) {
      // swoop from above with an overshooting zoom
      const e = ease.outCubic(it);
      az = lerp(AZ0 - 0.9, az, e); el = lerp(1.38, el, e);
      dist = this.fitDist * lerp(2.2, 1, ease.outBack(it));
      r.az = az; r.el = el; r.dist = dist;
    } else {
      const k = Math.min(1, real * 3.2);
      r.az += (az - r.az) * k * 1.6; r.el += (el - r.el) * k * 1.6; r.dist += (dist - r.dist) * k;
      r.tx += (tx - r.tx) * k; r.ty += (ty - r.ty) * k; r.tz += (tz - r.tz) * k;
    }
    const sh = this.fx.shakeAmt;
    this._place(r.az, r.el, r.dist, r.tx + (Math.random() - 0.5) * sh, r.ty + (Math.random() - 0.5) * sh, r.tz + (Math.random() - 0.5) * sh);
    this.renderer.render(this.scene, this.camera);
  }
}
