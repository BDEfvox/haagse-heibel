// What is over the city and belongs to no street: the police helicopter, the clouds, the stork on its chimney.
// The stage owns it (like the city's crowd) and carries it over when the focus moves to another street, so nothing up
// there jumps, vanishes or starts again. A helicopter lives in map metres and is written into the open street's frame
// every frame: a new frame changes nothing about where it is or which way it faces. The clouds and the stork are moved
// into the new frame once, at the swap (_rebase). The clouds are recycled round wherever the viewer is (never in view), and
// the stork leaves (out of view) once its chimney is no longer drawn in detail. Leftovers: ambient boats, gulls and pigeons that were
// in view when their street ended (or were taken off in view, stage ctx.retire) carry on here, in map metres like the helicopter,
// in the simplest believable way (a boat sails on along the water, a bird flies on and climbs away, one on the ground takes off),
// and are taken off once out of view.
// Randomness: a new helicopter's phase is the one draw gags.js startLocale has always made from the spot's ctx.rnd; where to
// fly in from or leave to is geometry; where a recycled cloud goes is Math.random (nothing else depends on it).
import * as THREE from 'three';
import { makeHeli } from './props.js';
import { makeBird } from './cast.js';
import { Vox, sculpt, disposeTree, lerp } from './kit.js';
import { sfx } from '../audio.js';

const ALONG = 17, ACROSS = 9, ALT = 16; // the figure of eight over the spot and the height gags.js heli() has always flown
const CLIMB = 42;                       // metres over the ground when it flies across the blocks (to another street, in, or away)
const VMAX = 22, ACC = 10, YAW = 2.5;   // m/s, m/s², rad/s: on station it needs ~9 m/s and ~5 m/s², so only a change of street feels them
const GLIDE = 2.5;                      // s: a new patrol (another street, or away) blends in over this long
const VLEAVE = 40;                      // m/s: on its way out it speeds up (with the same capped acceleration, so smoothly)
// A helicopter on its way out is taken off only once the fog has all but swallowed it: FOG_GONE of the way from the fog's start to
// its end (at 110 m that is about 2.9 km, where its 9 m rotor is 3-4 pixels of nearly sky-coloured haze). Being outside the picture
// is not enough: the viewer can turn round, and a helicopter that just happened to be out of frame at the swap must not be missing.
const FOG_GONE = 0.9;
// the cloud field: clouds stand 380-2600 m from the point the camera looks at (as stage.js always made them); one that has drifted
// (or been left behind by the viewer) beyond CLOUD_OUT is moved, out of view, to a new place in the field
const CLOUD_R0 = 380, CLOUD_R1 = 2600, CLOUD_OUT = 2800;
const STORK_FAR = 600; // m from the camera's target: a stork farther than this (and out of view) leaves even if its chimney is still drawn
const TILE = 256;      // (world.js tiles)
const BOAT_DEC = 0.8;  // m/s²: a leftover boat slows to a stop at this rate where the water ends ahead of it
const SEE_FAR = 600;   // m: a leftover farther than this from the camera is under a pixel and may go even inside the picture
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
const _v = new THREE.Vector3(), _a = [0, 0], _b = [0, 0], _c = [0, 0], _d = [0, 0], _s = [0, 0], _q = [0, 0], _m = [0, 0], _f = {};
// map metres <-> scene coordinates of a frame, written into o (world.js frame S and M without a new array each time)
const toS = (F, mx, my, o) => { const a = mx - F.ox, b = my - F.oy; o[0] = a * F.dx + b * F.dy; o[1] = a * F.dy - b * F.dx; return o; };
const toM = (F, x, z, o) => { o[0] = F.ox + x * F.dx + z * F.dy; o[1] = F.oy + x * F.dy - z * F.dx; return o; };
const sm = (k) => k * k * (3 - 2 * k);
/** The blend of one patrol into the next: flat to the second derivative at 0, so the frame after a swap flies exactly as the frame before. */
const blend = (k) => k * k * k * (k * (k * 6 - 15) + 10);
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** A direction in scene axes to map axes, and back, written into o: the frame's linear part is its own inverse (world.js hAt). */
const lin = (F, a, b, o = [0, 0]) => { o[0] = a * F.dx + b * F.dy; o[1] = a * F.dy - b * F.dx; return o; };
/** The scene yaw (rotation.y) of a map direction in frame F. */
const yawOf = (F, hx, hy) => Math.atan2(hx * F.dx + hy * F.dy, hx * F.dy - hy * F.dx);
/** Where a patrol (or a fixed point { fx, fy }) wants the helicopter at phase t, in map metres. */
function target(Q, t, o) {
  if (Q.fx !== undefined) { o[0] = Q.fx; o[1] = Q.fy; return o; }
  const a = Math.cos(t) * ALONG, b = Q.zc + Math.sin(t * 1.3) * ACROSS;
  o[0] = Q.cx + Q.ux * a + Q.nx * b; o[1] = Q.cy + Q.uy * a + Q.ny * b;
  return o;
}

export class Overhead {
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    this.group.name = 'overhead';
    this.helis = [];
    this.left = []; // leftovers: { a, x, y (map), h (scene height), hx, hy, v, vy, mode: 'boat' | 'air' | 'ground', wait, brake }
    this.clouds = []; this.extras = []; this.nest = null; this.cloudMat = null; // (the stage and scripts/dev-swap.mjs read clouds and extras)
    this.W = null; this.due = null;
  }
  /** A street opens (or the focus moved to it): from now on everything is drawn in its frame. */
  begin(W) {
    if (this.W && this.W !== W) this._rebase(W);
    this.W = W;
    for (const h of this.helis) h.claimed = false;
    this.due = null;
  }
  /** Move what lives in scene coordinates (clouds, stork, nest) into the next street's frame (helicopters live in map metres). */
  _rebase(W2) {
    const f1 = this.W.frame, f2 = W2.frame;
    const mv = (x, z) => { const m = f1.M(x, z); return f2.S(m[0], m[1]); };
    const o0 = mv(0, 0), o1 = mv(0, 1), turn = Math.atan2(o1[0] - o0[0], o1[1] - o0[1]); // what a heading of 0 becomes (as crowd.js rebase)
    // the position through the map, rotation.y plus the turn (these objects turn about y only). Not applyMatrix4: its Euler
    // decomposition of a turn past 90 degrees comes back as (pi, pi - a, pi), and the bird's turnTo would then turn an upside-down stork
    const put = (o) => { const p = mv(o.position.x, o.position.z); o.position.x = p[0]; o.position.z = p[1]; o.rotation.y += turn; };
    for (const c of this.clouds) { put(c); const u = c.userData, q = mv(u.vx, u.vz); u.vx = q[0] - o0[0]; u.vz = q[1] - o0[1]; } // (the wind keeps its direction)
    for (const e of this.extras) { put(e.g); e.heading = (e.heading || 0) + turn; }
    if (this.nest) put(this.nest); // (geometry baked at the old street's scene coordinates on an object at the origin: this is the frame change itself)
  }
  /** The clouds, made once for the whole visit (the stage's rnd, the draws of stage.js _clouds as they always were). */
  makeClouds(rnd, nk, c0) {
    const mat = this.cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: lerp(0.92, 0.42, nk), fog: false });
    for (let i = 0; i < 22; i++) {
      const v = new Vox(i + 20), n = rnd.int(4, 7), s = rnd.range(16, 34);
      for (let k = 0; k < n; k++) {
        const w = rnd.range(2.2, 3.6) * s, h = rnd.range(1.0, 2.0) * s;
        v.box((k * 1.5 - n * 0.75 + rnd.range(-0.4, 0.4)) * s, (Math.abs(k - n / 2) < 1.2 ? 0.5 : 0) * s + rnd.range(-0.2, 0.2) * s, rnd.range(-0.8, 0.8) * s, w, h, rnd.range(1.8, 3.0) * s, '#ffffff');
      }
      const m = v.mesh(mat, false, false);
      m.geometry.computeBoundingSphere();
      m.userData.rad = m.geometry.boundingSphere.radius + m.geometry.boundingSphere.center.length(); // (round its origin, whatever its turn)
      const r = rnd.range(380, 2600), a = rnd.range(0, 6.28);
      m.position.set(c0[0] + Math.cos(a) * r, rnd.range(700, 1600), c0[1] + Math.sin(a) * r);
      m.userData.vx = rnd.range(4, 12) * rnd.sign(); m.userData.vz = 0; // drift in scene axes (a vector, so it can be turned at a swap)
      this.group.add(m);
      this.clouds.push(m);
    }
  }
  /** The stork, The Hague's mascot, and its nest on chimney c (scene coordinates). Same draws from the stage's rnd as always. */
  makeStork(rnd, c) {
    const stork = makeBird(rnd, 'stork');
    stork.g.position.set(c.x, c.y + 0.3, c.z);
    stork.g.rotation.y = rnd.range(0, 6.28);
    const nest = sculpt((v) => { v.box(c.x, c.y, c.z, 1.1, 0.3, 1.1, '#9b7653', 0.1); v.box(c.x, c.y + 0.2, c.z, 0.8, 0.14, 0.8, '#7a5a3c'); });
    this.group.add(nest, stork.g);
    this.extras.push(stork);
    this.nest = nest;
    this.storkT = 0; this.storkDrawn = false;
  }
  _dropStork() {
    for (const e of this.extras) { this.group.remove(e.g); disposeTree(e.g); e.alive = false; }
    this.extras.length = 0; // (in place: the stage's `extras` is this list)
    if (this.nest) { this.group.remove(this.nest); disposeTree(this.nest); this.nest = null; }
  }
  /** Is the chimney under the stork drawn as a detailed front (world.js Streamer _detail)? Plain fronts have no such chimney. */
  _chimneyDrawn(mx, my) {
    const tx = Math.floor(mx / TILE), ty = Math.floor(my / TILE);
    if (this._sk === undefined || this._skx !== tx || this._sky !== ty) { this._skx = tx; this._sky = ty; this._sk = tx + '_' + ty; } // (the key, made once per tile)
    const S = this.W.stream, c = S && S.live.get(this._sk);
    if (!c || c.lod !== 0 || !c.cells) return false;
    let best = null, bd = Infinity;
    for (const cell of c.cells) { const d = Math.hypot(c.ox + cell.cx - mx, c.oy + TILE - cell.cz - my); if (d < bd) { bd = d; best = cell; } }
    return !!(best && best.detail);
  }
  /** The camera's frustum, for the frame the camera was last drawn in (only used when that is the open street's frame). */
  _frustum() { const cam = this.stage.camera; return _fr.setFromProjectionMatrix(_pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); }
  /** Clouds and the stork, once per frame (only in a frame whose camera is in this frame: nothing is moved or taken off blind). */
  _skyKeep(dt) {
    const st = this.stage, r = st.rig, W = this.W;
    if (st._camFrame !== W.frame) return;
    const n = this.clouds.length;
    if (n) {
      // one cloud a frame: far out of the field and out of view? then to a new place in the field, also out of view
      // (the radius tested is doubled: the frustum is a frame old, and a fast turn must not find the moved cloud at the edge)
      const c = this.clouds[(this._ci = ((this._ci || 0) + 1) % n)], p = c.position, rad = 2 * (c.userData.rad || 400);
      if (Math.hypot(p.x - r.tx, p.z - r.tz) > CLOUD_OUT) {
        const fr = this._frustum();
        if (!fr.intersectsSphere(_sph.set(p, rad))) {
          for (let k = 0; k < 8; k++) {
            const rr = CLOUD_R0 + Math.random() * (CLOUD_R1 - CLOUD_R0), an = Math.random() * Math.PI * 2;
            _v.set(r.tx + Math.cos(an) * rr, p.y, r.tz + Math.sin(an) * rr);
            if (!fr.intersectsSphere(_sph.set(_v, rad))) { p.x = _v.x; p.z = _v.z; break; }
          }
        }
      }
    }
    const k = this.extras[0]; // the stork: every half second, is it time for it to leave (out of view)?
    if (k && (this.storkT -= dt) <= 0) {
      this.storkT = 0.5;
      // "no longer a detailed front" counts only once it has been one (the drop from the map has detailed fronts off: a fresh open
      // keeps its stork), and nothing is decided while the camera is still coming down
      const p = k.g.position, m = toM(W.frame, p.x, p.z, _m), drawn = this._chimneyDrawn(m[0], m[1]);
      if (drawn) this.storkDrawn = true;
      if (st.mode !== 'drop' && (Math.hypot(p.x - r.tx, p.z - r.tz) > STORK_FAR || (this.storkDrawn && !drawn)) && !this._frustum().intersectsSphere(_sph.set(p, 3))) this._dropStork();
    }
  }
  get hasStork() { return this.extras.length > 0; }
  /** The actors the stage animates for the overhead (it re-seeds stage.actors with them at a focus shift). */
  carried() {
    const out = [];
    for (const h of this.helis) out.push(h.a);
    for (const L of this.left) out.push(L.a);
    return out;
  }
  /** Is anything of this actor in the picture? (Its camera and its matrices must be in the same frame: the caller sees to that.) */
  seenActor(a) {
    const src = a._wrap || a.g, cam = this.stage.camera;
    src.updateWorldMatrix(true, false);
    _v.setFromMatrixPosition(src.matrixWorld);
    if (_v.distanceTo(cam.position) > SEE_FAR) return false;
    return this._frustum().intersectsSphere(_sph.set(_v, a.type === 'boat' ? 3.5 : 1.2));
  }
  /**
   * Take an ambient actor over where it is drawn now (its matrices are in this.W's frame: at a focus shift, before begin()). It leaves
   * the street's scene graph and warp(), and from now on is written into whichever frame is open.
   */
  adopt(a) {
    const F = this.W.frame, src = a._wrap || a.g;
    src.updateWorldMatrix(true, false);
    a.g.updateWorldMatrix(true, false);
    const e = src.matrixWorld.elements, ge = a.g.matrixWorld.elements;
    toM(F, e[12], e[14], _m);
    lin(F, ge[8], ge[10], _q);
    // (a bird still drawn gliding in (flap) is in the air, whatever its script thinks: it flies on from where it is drawn)
    const ql = Math.hypot(_q[0], _q[1]) || 1, sc = Math.hypot(ge[0], ge[1], ge[2]), boat = a.type === 'boat', flying = !boat && !!(a.fly || a.flap);
    a._left = true; a.flap = false; a.ctx = null;
    if (flying) a.fly = true;
    delete a.g._ctx; // (warp's link to the old spot: let the old street go)
    if (a._wrap) a._wrap.position.set(0, 0, 0); // (an arrival in progress ends where it is drawn)
    a.g.parent?.remove(a.g);
    delete a.g.updateMatrix; // (warp's street-space matrix: from now on it stands in scene coordinates)
    a.g.rotation.set(0, 0, 0); a.g.scale.setScalar(sc);
    this.group.add(a.g);
    const L = { a, x: _m[0], y: _m[1], h: e[13], hx: _q[0] / ql, hy: _q[1] / ql, v: boat ? (a.vel > 0.3 ? a.vel : 2.6) : flying ? 6.5 : 0, vy: flying ? 1.2 : 0,
      mode: boat ? 'boat' : flying ? 'air' : 'ground', wait: 0.4 + Math.random() * 1.2, brake: false };
    this.left.push(L);
    this._placeLeft(L);
  }
  _wet(mx, my) { const c = this.W.classAt ? this.W.classAt(mx, my) : 1; return c === 1 || c === 10; } // (world.js C.WATER, C.SEA)
  _placeLeft(L) {
    const F = this.W.frame, a = L.a;
    toS(F, L.x, L.y, _s);
    a.g.position.set(_s[0], L.h, _s[1]);
    a.face(yawOf(F, L.hx, L.hy));
    a.moving = L.mode === 'ground' ? 0 : L.v;
  }
  _dropLeft(i) {
    const L = this.left[i], a = L.a;
    a.alive = false;
    this.group.remove(a.g); disposeTree(a.g);
    const A = this.stage.actors, j = A.indexOf(a);
    if (j >= 0) A.splice(j, 1);
    this.left.splice(i, 1);
  }
  _leftovers(dt) {
    const st = this.stage, F = this.W.frame;
    for (let i = this.left.length - 1; i >= 0; i--) {
      const L = this.left[i], a = L.a;
      if (L.mode === 'ground') { if ((L.wait -= dt) <= 0) { L.mode = 'air'; a.fly = true; L.v = 0; L.vy = 2.2; } } // a moment, then it takes off
      else if (L.mode === 'air') { L.v = Math.min(6.5, L.v + 3 * dt); L.vy = Math.min(2.2, L.vy + 0.5 * dt); L.h += L.vy * dt; } // on, climbing away
      else {
        // a boat keeps its heading and speed along the water; where the water ends ahead within its stopping distance it slows to a
        // stop (and stays stopped) rather than sail onto the quay
        if (!L.brake && !this._wet(L.x + L.hx * (2.6 + (L.v * L.v) / (2 * BOAT_DEC)), L.y + L.hy * (2.6 + (L.v * L.v) / (2 * BOAT_DEC)))) L.brake = true;
        if (L.brake) L.v = Math.max(0, L.v - BOAT_DEC * dt);
        if (L.v > 0 && !this._wet(L.x + L.hx * 2.4, L.y + L.hy * 2.4)) L.v = 0;
      }
      L.x += L.hx * L.v * dt; L.y += L.hy * L.v * dt;
      this._placeLeft(L);
      if (st._camFrame === F && !this.seenActor(a)) this._dropLeft(i); // (never in a swap frame: then the camera is still the old street's)
    }
  }
  /** A spot as a patrol in map metres: its centre, along and across (as warp() bends them, stage.js), and the middle line zc. */
  _patrol(ctx) {
    const W = ctx.W, F = W.frame, P = W.path, c = P.xz(ctx.sc, 0), m = F.M(c[0], c[1]);
    P.at(ctx.sc, _f);
    const u = lin(F, _f.tx, _f.tz), n = lin(F, -_f.tz, _f.tx);
    return { cx: m[0], cy: m[1], ux: u[0], uy: u[1], nx: n[0], ny: n[1], zc: ctx.L.zc, ctx };
  }
  /**
   * startLocale on spot 0 of a level-5 street wants its helicopter. `phase` is the ctx.rnd draw gags.js has always made there
   * (a helicopter carried over keeps its own). `keep`: the focus moved here from another street.
   */
  want(ctx, phase, keep) {
    const P = this._patrol(ctx);
    const h = this.helis.find((q) => !q.claimed); // the one already up there (over the old street, or on its way out)
    if (h) { this._goto(h, P); h.claimed = true; h.leave = false; return; }
    if (keep) { this.due = { P, phase }; return; } // it flies in from out of sight once the camera has been drawn in this frame
    this._spawn(P, phase, P.cx - P.ux * 34 + P.nx * P.zc, P.cy - P.uy * 34 + P.ny * P.zc); // where heli() always began: X0 - 10, over zc
  }
  /** After the spots have started: a helicopter nobody claimed (the new street is quieter) flies away. */
  settle() { for (const h of this.helis) if (!h.claimed && !h.leave) this._away(h); }
  _goto(h, Q) {
    if (h.k < 1) { const kk = blend(h.k); target(h.from, h.t, _a); target(h.to, h.t, _b); h.from = { fx: lerp(_a[0], _b[0], kk), fy: lerp(_a[1], _b[1], kk) }; }
    else h.from = h.to;
    h.to = Q; h.k = 0;
  }
  /** Where the fog has all but swallowed a helicopter (see FOG_GONE): the distance from the camera at which one leaving may be taken off. */
  _goneAt() { const fog = this.stage.scene.fog; return fog.near + (fog.far - fog.near) * FOG_GONE; }
  _away(h) {
    const R = Math.max(3000, this._goneAt() * 1.5); // straight on, well past where it is taken off
    this._goto(h, { fx: h.x + h.hx * R, fy: h.y + h.hy * R });
    h.leave = true; h.claimed = false;
  }
  _spawn(P, phase, x, y) {
    const a = makeHeli();
    a.air = true; a.alive = true;
    const h = { a, x, y, vx: 0, vy: 0, hx: P.ux, hy: P.uy, t: phase, chop: 0, ax: P.cx, ay: P.cy, alt: null, w: 0, from: P, to: P, k: 1, claimed: true, leave: false };
    target(P, phase, _a);
    const ex = _a[0] - x, ey = _a[1] - y, el = Math.hypot(ex, ey);
    if (el > 0.1) { h.hx = ex / el; h.hy = ey / el; }
    this.group.add(a.g);
    this.helis.push(h);
    this.stage.actors.push(a); // the stage animates it with everyone else, once per frame (rotors, beam); the swap recorder finds it there
    this._place(h, 0);
    return h;
  }
  _drop(h) {
    h.a.alive = false;
    this.group.remove(h.a.g);
    disposeTree(h.a.g);
    const L = this.stage.actors, i = L.indexOf(h.a);
    if (i >= 0) L.splice(i, 1);
    this.helis.splice(this.helis.indexOf(h), 1);
  }
  /** Is this map point (at helicopter height over the ground, or at scene height y) in the picture? Tested in the frame the camera was last drawn in (stage._camFrame). */
  _inView(mx, my, margin = 0.15, y = null) {
    const st = this.stage, W = this.W, F = st._camFrame || W.frame, cam = st.camera;
    if (y === null) { toS(W.frame, mx, my, _q); y = W.hAt(_q[0], _q[1]) + ALT; }
    toS(F, mx, my, _q);
    _v.set(_q[0], y, _q[1]);
    if (_v.distanceTo(cam.position) > cam.far) return false;
    _v.project(cam);
    return _v.z < 1 && Math.abs(_v.x) < 1 + margin && Math.abs(_v.y) < 1 + margin;
  }
  /** Can the viewer see any of a helicopter: its body where it really flies, the lit disc on the ground, or the beam between them? */
  _heliSeen(h, margin) {
    const W = this.W, aimY = W.hAt(toS(W.frame, h.ax, h.ay, _q)[0], _q[1]);
    return this._inView(h.x, h.y, margin, h.alt) || this._inView(h.ax, h.ay, margin, aimY) || this._inView((h.x + h.ax) / 2, (h.y + h.ay) / 2, margin, (h.alt + aimY) / 2);
  }
  /** The nearest point round the patrol that the camera cannot see (to fly in from). */
  _hidden(P) {
    const st = this.stage, F = st._camFrame || this.W.frame, cp = st.camera.position;
    for (let R = Math.max(260, st.rig.dist * 2.2), i = 0; i < 4; i++, R *= 1.6) {
      let best = null, bd = Infinity;
      for (let k = 0; k < 16; k++) {
        const an = (k / 16) * Math.PI * 2, mx = P.cx + Math.cos(an) * R, my = P.cy + Math.sin(an) * R;
        if (this._inView(mx, my, 0.3)) continue;
        const s = F.S(mx, my), d = Math.hypot(s[0] - cp.x, s[1] - cp.z);
        if (d < bd) { bd = d; best = [mx, my]; }
      }
      if (best) return best;
    }
    return [P.cx - P.ux * 3000, P.cy - P.uy * 3000]; // (from very high up everything is in view: it comes from far off)
  }
  update(dt) {
    const st = this.stage, W = this.W, F = W.frame, r = st.rig;
    if (this.due && st._camFrame === F) { const { P, phase } = this.due; this.due = null; const p = this._hidden(P); this._spawn(P, phase, p[0], p[1]); }
    for (let i = this.helis.length - 1; i >= 0; i--) {
      const h = this.helis[i];
      h.t += dt * 0.42;
      if (h.k < 1) { h.k = Math.min(1, h.k + dt / GLIDE); if (h.k >= 1) h.from = h.to; } // (the old patrol, and with it the old street, is let go)
      const kk = blend(h.k);
      target(h.from, h.t, _a); target(h.to, h.t, _b);
      const tx = lerp(_a[0], _b[0], kk), ty = lerp(_a[1], _b[1], kk);
      // gags.js heli() chased its target at 1.2 x the distance per second. The same here, but capped (VMAX), no faster than it can
      // brake (sqrt(2 ACC d): the same as 1.2 d below 14 m, so on station it flies as before) and with a capped acceleration
      const ex = tx - h.x, ey = ty - h.y, td = Math.hypot(ex, ey), ws = Math.min(h.leave ? VLEAVE : VMAX, 1.2 * td, Math.sqrt(2 * ACC * td));
      const wx = td > 1e-6 ? (ex / td) * ws : 0, wy = td > 1e-6 ? (ey / td) * ws : 0;
      let ddx = wx - h.vx, ddy = wy - h.vy;
      const dv = Math.hypot(ddx, ddy), lim = ACC * dt;
      if (dv > lim) { ddx *= lim / dv; ddy *= lim / dv; }
      h.vx += ddx; h.vy += ddy;
      h.x += h.vx * dt; h.y += h.vy * dt;
      // it faces its target (as heli() did), turning at most YAW
      const fx0 = tx - h.x, fy0 = ty - h.y;
      if (fx0 * fx0 + fy0 * fy0 > 0.01) {
        const cur = Math.atan2(h.hy, h.hx);
        let d = Math.atan2(fy0, fx0) - cur;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const an = cur + Math.max(-YAW * dt, Math.min(YAW * dt, d));
        h.hx = Math.cos(an); h.hy = Math.sin(an);
      }
      // the searchlight: on station it sweeps the spot, or holds whoever is wanted there (as heli() did); away from it, the ground ahead
      h.w = sm(c01((td - 25) / 35));
      this._light(h.from, h, _c); this._light(h.to, h, _d);
      const ahx = h.x + h.hx * 12, ahy = h.y + h.hy * 12;
      const gx = lerp(lerp(_c[0], _d[0], kk), ahx, h.w), gy = lerp(lerp(_c[1], _d[1], kk), ahy, h.w);
      h.ax += (gx - h.ax) * Math.min(1, dt * 3); h.ay += (gy - h.ay) * Math.min(1, dt * 3);
      // the chop: the helicopter's own rhythm, carried over with it (so it is never heard twice at a swap), heard near the camera
      // (the spot test of stage.js near(), on the helicopter itself)
      h.chop -= dt;
      if (h.chop < 0) {
        h.chop = 2.6;
        toS(F, h.x, h.y, _s);
        if (!document.hidden && r.dist < 500 && Math.hypot(_s[0] - r.tx, _s[1] - r.tz) < Math.max(55, r.dist * 0.8)) sfx.chop?.();
      }
      this._place(h, dt);
      if (h.leave) {
        // (it never comes to a stop on the way out: the point moves on while it is close)
        if (h.k >= 1 && h.to.fx !== undefined && Math.hypot(h.to.fx - h.x, h.to.fy - h.y) < 50) h.to = { fx: h.x + h.hx * 1500, fy: h.y + h.hy * 1500 };
        // Taken off only in a frame whose camera is in this frame (never in the swap frame, whose camera is still the old street's), only
        // once nothing of it is in the picture, and only once it is as far as the fog has all but swallowed it (FOG_GONE)
        if (st._camFrame === F && st.camera.position.distanceTo(h.a.g.position) > this._goneAt() && !this._heliSeen(h, 0.3)) this._drop(h);
      }
    }
    this._leftovers(dt);
    for (let i = 0; i < this.clouds.length; i++) { const c = this.clouds[i]; c.position.x += c.userData.vx * dt; c.position.z += c.userData.vz * dt; }
    for (let i = 0; i < this.extras.length; i++) this.extras[i].update(dt);
    this._skyKeep(dt);
  }
  _light(Q, h, o) {
    if (Q.fx !== undefined) { o[0] = h.x + h.hx * 12; o[1] = h.y + h.hy * 12; return; }
    // (only on the street that is open: an old street's actors are disposed without alive = false)
    const wa = Q.ctx && Q.ctx.W === this.W && Q.ctx.wanted && Q.ctx.wanted.alive ? Q.ctx.wanted.g : null;
    if (wa) { wa.updateWorldMatrix(true, false); const e = wa.matrixWorld.elements; toM(this.W.frame, e[12], e[14], o); return; }
    const a = Math.sin(h.t * 2.1) * 14, b = Q.zc + Math.cos(h.t * 1.7) * 6;
    o[0] = Q.cx + Q.ux * a + Q.nx * b; o[1] = Q.cy + Q.uy * a + Q.ny * b;
  }
  /** Write a helicopter into the open street's frame. */
  _place(h, dt) {
    // On station 16 m over its street, as always. Flying across the blocks it climbs, or its rotor would go through four- and
    // five-storey fronts (w is 0 in a swap frame: the blend starts at the old target, so a swap does not move it)
    const W = this.W, F = W.frame, a = h.a, s = toS(F, h.x, h.y, _s), want = W.hAt(s[0], s[1]) + lerp(ALT, CLIMB, h.w);
    h.alt = h.alt == null ? want : h.alt + (want - h.alt) * Math.min(1, dt * 1.5); // (smoothed: the ground steps at every kerb and quay)
    a.g.position.set(s[0], h.alt, s[1]);
    a.face(yawOf(F, h.hx, h.hy)); // heading and rotation.y together: nothing left for the actor to turn
    const q = toS(F, h.ax, h.ay, _q);
    a.aim.set(q[0], W.hAt(q[0], q[1]), q[1]);
    a.moving = 1;
  }
  dispose() {
    for (const h of this.helis) h.a.alive = false;
    disposeTree(this.group);
    this.group.parent?.remove(this.group);
    if (this.cloudMat) this.cloudMat.dispose();
    for (const L of this.left) L.a.alive = false;
    this.helis = []; this.left = []; this.clouds = []; this.extras = []; this.nest = null; this.cloudMat = null; this.due = null;
  }
}
