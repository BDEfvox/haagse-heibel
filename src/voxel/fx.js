// Particles (voxel debris, smoke, cash, sparks) and comic-book text pops.
import * as THREE from 'three';
import { TAU } from './kit.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

class Pool {
  constructor(scene, cap, mat, owner) {
    this.cap = cap;
    this.owner = owner;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.parts = [];
    this.free = [];
    for (let i = cap - 1; i >= 0; i--) this.free.push(i);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) { this.mesh.setMatrixAt(i, _m); this.mesh.setColorAt(i, _c.set('#fff')); }
    scene.add(this.mesh);
  }
  emit(o) {
    if (!this.free.length) return;
    const i = this.free.pop();
    this.mesh.setColorAt(i, _c.set(o.color));
    this.mesh.instanceColor.needsUpdate = true;
    this.parts.push({
      i, x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      rx: Math.random() * TAU, ry: Math.random() * TAU, rz: Math.random() * TAU,
      wx: (Math.random() - 0.5) * (o.spin ?? 10), wy: (Math.random() - 0.5) * (o.spin ?? 10), wz: (Math.random() - 0.5) * (o.spin ?? 10),
      sx: o.sx ?? o.size ?? 0.2, sy: o.sy ?? o.size ?? 0.2, sz: o.sz ?? o.size ?? 0.2,
      life: o.life ?? 1.2, age: 0, g: o.g ?? 22, drag: o.drag ?? 0.2, grow: o.grow || 0, bounce: o.bounce ?? 0.4, floor: (o.floor ?? 0.02) + (o.floor < -50 ? 0 : this.owner.ground(o.x, o.z)), flutter: o.flutter || 0,
    });
  }
  update(dt) {
    const ps = this.parts;
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k];
      p.age += dt;
      if (p.age >= p.life) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(p.i, _m);
        this.free.push(p.i);
        ps[k] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.vy -= p.g * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vz *= d;
      if (p.flutter) { p.vy = Math.max(p.vy, -p.flutter); p.vx += Math.sin(p.age * 6 + p.i) * dt * 3; p.vz += Math.cos(p.age * 5 + p.i * 2) * dt * 3; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor && p.vy < 0 && p.g > 0) {
        p.y = p.floor;
        p.vy = -p.vy * p.bounce;
        p.vx *= 0.6; p.vz *= 0.6;
        p.wx *= 0.5; p.wy *= 0.5; p.wz *= 0.5;
        if (Math.abs(p.vy) < 0.6) { p.vy = 0; p.wx = p.wy = p.wz = 0; }
      }
      p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
      const t = p.age / p.life;
      const k2 = (p.grow ? 1 + p.grow * t : 1) * (t > 0.75 ? (1 - t) / 0.25 : 1) * Math.min(1, p.age * 14);
      _e.set(p.rx, p.ry, p.rz);
      _q.setFromEuler(_e);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.sx * k2, p.sy * k2, p.sz * k2));
      this.mesh.setMatrixAt(p.i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}

const R = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Fx {
  constructor(scene, camera, overlay) {
    this.camera = camera;
    this.overlay = overlay;
    /** Height of the ground at a scene position (debris lands on it). */
    this.ground = () => 0;
    /** Camera distance: comic text shrinks and fades as the camera pulls away. */
    this.zoom = 60;
    this.alpha = 1;
    this.solid = new Pool(scene, 900, new THREE.MeshLambertMaterial(), this);
    this.glow = new Pool(scene, 500, new THREE.MeshBasicMaterial({ toneMapped: false }), this);
    this.texts = [];
    this.shakeAmt = 0;
  }
  /** Chunky debris explosion. */
  burst(x, y, z, { n = 20, colors = ['#fff'], speed = 8, up = 8, size = [0.12, 0.3], life = [0.8, 1.6], glow = false, g = 24, spread = 0.3 } = {}) {
    const pool = glow ? this.glow : this.solid;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = R(0.2, 1) * speed;
      pool.emit({ x: x + R(-spread, spread), y: y + R(0, spread), z: z + R(-spread, spread), vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: R(0.4, 1) * up, color: pick(colors), size: R(size[0], size[1]), life: R(life[0], life[1]), g });
    }
  }
  smoke(x, y, z, n = 8, colors = ['#e8e8e8', '#cfcfcf', '#bdbdbd'], size = 0.5) {
    for (let i = 0; i < n; i++) {
      this.solid.emit({ x: x + R(-0.4, 0.4), y: y + R(0, 0.4), z: z + R(-0.4, 0.4), vx: R(-1, 1), vz: R(-1, 1), vy: R(1, 3), color: pick(colors), size: R(size * 0.6, size * 1.3), life: R(0.7, 1.5), g: -1.5, drag: 1.5, grow: 1.6, spin: 2 });
    }
  }
  puff(x, y, z, col = '#ffffff') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      this.solid.emit({ x, y: y + 0.2, z, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, vy: R(0.5, 2), color: col, size: R(0.18, 0.3), life: 0.45, g: 0, drag: 4, spin: 4 });
    }
  }
  cash(x, y, z, n = 30, speed = 7, up = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = R(0.2, 1) * speed;
      this.solid.emit({ x, y, z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: R(0.5, 1) * up, color: pick(['#6ab04c', '#7bc96f', '#badc58', '#58a04a']), sx: 0.42, sy: 0.03, sz: 0.22, life: R(2.6, 4.5), g: 14, drag: 0.8, flutter: 2.2, bounce: 0, spin: 9 });
    }
  }
  confetti(x, y, z, n = 40) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = R(1, 6);
      this.glow.emit({ x, y, z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: R(4, 11), color: pick(['#ff006e', '#ffbe0b', '#3a86ff', '#8338ec', '#06d6a0', '#fb5607']), sx: 0.2, sy: 0.03, sz: 0.14, life: R(1.5, 2.8), g: 12, flutter: 2.5, drag: 1, bounce: 0 });
    }
  }
  sparks(x, y, z, n = 4, colors = ['#fff3b0', '#ffd166', '#ff9f1c']) {
    for (let i = 0; i < n; i++) {
      this.glow.emit({ x, y, z, vx: R(-3, 3), vz: R(-3, 3), vy: R(1, 5), color: pick(colors), size: R(0.06, 0.13), life: R(0.25, 0.55), g: 14, bounce: 0.3 });
    }
  }
  fireball(x, y, z, scale = 1) {
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * TAU, b = R(0, Math.PI / 2), s = R(2, 11) * scale;
      this.glow.emit({ x, y, z, vx: Math.cos(a) * Math.cos(b) * s, vz: Math.sin(a) * Math.cos(b) * s, vy: Math.sin(b) * s + 2, color: pick(['#fff3b0', '#ffd166', '#ff9f1c', '#ff5400', '#ff2d2d']), size: R(0.3, 0.9) * scale, life: R(0.35, 0.8), g: 4, drag: 3, grow: 1.2, spin: 6 });
    }
    this.smoke(x, y + 0.5, z, 26, ['#555', '#444', '#777', '#333'], 1.0 * scale);
  }
  firework(x, y, z, col) {
    const cols = col || pick([['#ff006e', '#ffb3d1'], ['#3a86ff', '#bfe0ff'], ['#ffbe0b', '#fff3b0'], ['#06d6a0', '#c8ffe9'], ['#c77dff', '#f0d9ff']]);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * TAU, b = R(-Math.PI / 2, Math.PI / 2), s = R(5, 9);
      this.glow.emit({ x, y, z, vx: Math.cos(a) * Math.cos(b) * s, vz: Math.sin(a) * Math.cos(b) * s, vy: Math.sin(b) * s, color: pick(cols), size: R(0.12, 0.22), life: R(0.9, 1.6), g: 5, drag: 1.6, floor: -99 });
    }
  }
  /** Comic text at a world position (Vector3-like or object with .position). */
  text(str, at, { color = '#ffffff', size = 22, dur = 1.3, rise = 1.4, rot = null, cls = '', off = null } = {}) {
    const el = document.createElement('div');
    el.className = 'comic ' + cls;
    const inner = document.createElement('span');
    inner.textContent = str;
    inner.style.color = color;
    inner.style.fontSize = size + 'px';
    inner.style.setProperty('--rot', (rot ?? R(-10, 10)) + 'deg');
    inner.style.animationDuration = dur + 's';
    el.appendChild(inner);
    this.overlay.appendChild(el);
    const src = at.isVector3 ? at.clone() : at;
    this.texts.push({ el, src, t: 0, dur, rise, off: off ?? (at.isVector3 ? 0 : 2.9) });
    if (this.texts.length > 14) this._kill(0);
  }
  _kill(i) {
    this.texts[i].el.remove();
    this.texts.splice(i, 1);
  }
  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }
  update(dt) {
    this.solid.update(dt);
    this.glow.update(dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * (1.2 + this.shakeAmt * 2.4));
    const w = this.overlay.clientWidth, h = this.overlay.clientHeight;
    // words belong to the street: from further away they shrink, then slowly fade out
    const want = 1 - Math.min(1, Math.max(0, (this.zoom - 115) / 150));
    this.alpha += (want - this.alpha) * Math.min(1, dt * 1.6);
    const a = this.alpha < 0.02 ? 0 : this.alpha, sc = Math.min(1.1, Math.max(0.5, 78 / this.zoom));
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t > t.dur) { this._kill(i); continue; }
      if (t.src.isVector3) _p.copy(t.src);
      else { const o = t.src.g || t.src; o.updateWorldMatrix(true, false); _p.setFromMatrixPosition(o.matrixWorld); }
      _p.y += t.off + (t.t / t.dur) * t.rise;
      _p.project(this.camera);
      t.el.style.visibility = _p.z > 1 || a === 0 ? 'hidden' : '';
      t.el.style.opacity = a;
      t.el.style.transform = `translate(${((_p.x + 1) / 2) * w}px, ${((1 - _p.y) / 2) * h}px) scale(${sc.toFixed(3)})`;
    }
  }
  dispose() {
    this.solid.dispose();
    this.glow.dispose();
    this.texts.forEach((t) => t.el.remove());
    this.texts = [];
  }
}
