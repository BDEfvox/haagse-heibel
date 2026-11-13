// The walking character: one person the viewer drops on the street and walks round the city (the Walk button, stage.js walk mode).
// He obeys the one rule the crowd obeys: W.ground.at (ground.js) says where a person may stand and how high the ground is there.
// Nothing else decides where he may go: he steps up kerbs and stairs (at most STEP up or down), is stopped by buildings as drawn,
// water, fences, features, furniture, posts and parked cars, and slides along what stops him. People and vehicles of the crowd and
// the actors of the scenes are round obstacles he does not walk into (they make room for him: stage.js _brief puts him in the
// crowd's blocker list, like an actor on stage).
// Like the helicopter (overhead.js) he lives in MAP metres and is written into whichever street's frame is open every frame, so a
// focus shift changes nothing about where he is, which way he faces or how far into his stride he is.
// Randomness: his own generator with a fixed seed (he looks the same at every drop); nothing the city builds draws from it.
// Per frame: no allocation; a few W.ground.at calls per sub-step (sub-steps of at most SUB metres).
import { makePerson } from './cast.js';
import { makeRng, hashStr, disposeTree } from './kit.js';
import { PERSON, ALL, STANDING } from './ground.js';

export const WALK = 2.4, RUN = 5.0;   // m/s: a brisk walk (the crowd walks about 1.3), a run
const ACC = 12, DEC = 16;             // m/s²: speeding up, slowing down
const TURN = 10;                      // 1/s: how fast he turns to face where he goes
const R = 0.25;                       // m: his footprint for W.ground.at (the radius the ground's author gave the character)
const BODY = 0.25;                    // m: his body against other people and vehicles (two bodies: 0.5 m, wider than the counter's 0.45)
const STEP = 0.45;                    // m: the most he steps up or down in one go (kerbs 0.14, stairs 0.14-0.3; a quay or a wall top: no)
const SUB = 0.12;                     // m: the longest sub-step (half the footprint: a fence cell can never be stepped over)
const MAXSUB = 24;
const FALL = 0.049;                   // m: stepping down he is lowered as fast as a foot falls: never more than this over the ground
const UNSTICK = 1, UNSTICK_R = 2;     // s, m: stuck in something that appeared under him this long: put on the nearest free spot within this
const NEAR = 4;                       // m: crowd agents within this are obstacles this frame (read from the crowd's 8 m grid: crowd.gridNear)
// the stride of makePerson's walk: legs 0.7 units long at scale 1.25 * PERSON_K = 0.9 (0.63 m), phase speed 3.2 + 1.9 mv rad/s,
// swing amplitude 0.45 + 0.11 mv rad: the feet move at FOOT(mv) m/s. MV(v) inverts it, so the feet do not slide on the ground.
const LEG = 0.63;
const FOOT = (mv) => ((3.2 + 1.9 * mv) * 2 * LEG * Math.sin(Math.min(1.15, 0.45 + 0.11 * mv))) / Math.PI;
const MVT = new Float32Array(81); // mv for v = 0, 0.1, ... 8 m/s
for (let i = 0, mv = 0; i < MVT.length; i++) { const v = i * 0.1; while (FOOT(mv) < v && mv < 12) mv += 0.005; MVT[i] = mv; }
const MV = (v) => { const f = Math.min(MVT.length - 1.001, Math.max(0, v * 10)), i = Math.floor(f); return MVT[i] + (MVT[i + 1] - MVT[i]) * (f - i); };
// his look: the site's own yellow over dark blue, a cap. No crowd shirt is this saturated a yellow, so he reads as the player from afar
export const LOOK = { kind: 'civ', shirt: '#ffd60a', pants: '#1d3557', skin: '#e8b48a', hair: '#2b1d14', hat: 'cap' };
const SEED = 'heibel|walker';

// map metres <-> scene coordinates of a frame (world.js frame S and M), written into o; the linear part is its own inverse (overhead.js)
const toS = (F, mx, my, o) => { const a = mx - F.ox, b = my - F.oy; o[0] = a * F.dx + b * F.dy; o[1] = a * F.dy - b * F.dx; return o; };
const lin = (F, a, b, o) => { o[0] = a * F.dx + b * F.dy; o[1] = a * F.dy - b * F.dx; return o; };
const _s = [0, 0], _q = [0, 0], _n = [0, 0], _sn = [0, 0], _sp = [0, 0];

export class Walker {
  static made = 0;
  constructor() {
    this.id = ++Walker.made;        // (which drop this is: the tools compare steps only within one walk)
    this.a = makePerson(makeRng(hashStr(SEED)), LOOK);
    this.g = this.a.g;
    this.g.name = 'walker';
    this.mx = 0; this.my = 0;       // where he is, map metres
    this.hx = 0; this.hy = 1;       // which way he faces, a map unit vector
    this.vx = 0; this.vy = 0;       // his velocity, map metres per second
    this.y = 0;                     // drawn height (absolute: the same in every frame)
    this.hg = 0;                    // the ground he stands on (W.ground.at under his footprint)
    this.heading = 0;               // compass heading (radians, 0 = north, clockwise): for readers
    this.speed = 0;                 // m/s actually walked this frame
    this.blocked = false;           // something stopped (part of) this frame's step
    this.stuck = false;             // he stands where nobody may stand (something appeared under him): only ways out are allowed
    this.cls = 255;                 // the ground class under him (W.ground.cls)
    this.alive = true;
    this.circ = new Float64Array(3 * 96); this.nc = 0; // round obstacles this frame: x, z, radius (scene coordinates)
    this._add = this._mkAdd();
    this.stuckT = 0;                // seconds stuck so far
    this.lost = false;              // stuck, and no free spot within UNSTICK_R: the stage takes him away (with a message)
    this.moves = 0;                 // how often he was put on a free spot because he was stuck (for the tools)
    this.fresh = false;             // the first frame in a new frame (a focus shift): the stage's blocker list is still the old one's
    this._trams = []; this._tramT = 0; // the crowd's trams, looked up twice a second (a tram is 27 m long: the grid holds its first section)
  }
  /**
   * Find where he may stand nearest scene (x, z) of street W, within `reach` metres (rings 0.5 m apart, the ground ready there).
   * Writes the scene point into `out`; false when there is none.
   */
  static spot(W, x, z, reach, out) {
    const G = W.ground;
    if (!G) return false;
    for (let rr = 0; rr <= reach; rr += 0.5) {
      const n = rr === 0 ? 1 : Math.ceil((2 * Math.PI * rr) / 0.5);
      for (let i = 0; i < n; i++) {
        const an = (i / n) * Math.PI * 2, px = x + Math.sin(an) * rr, pz = z + Math.cos(an) * rr;
        if (!G.ready(px, pz)) continue;
        const h = G.at(px, pz, R + 0.1); // (a little room round him)
        if (h === h) { out[0] = px; out[1] = pz; return true; }
      }
    }
    return false;
  }
  /** Stand him at scene (x, z) of street W (a spot from Walker.spot), facing the scene direction (fx, fz). */
  place(W, x, z, fx, fz) {
    const F = W.frame, G = W.ground;
    this.mx = F.ox + x * F.dx + z * F.dy; this.my = F.oy + x * F.dy - z * F.dx;
    lin(F, fx, fz, _q);
    const l = Math.hypot(_q[0], _q[1]) || 1;
    this.hx = _q[0] / l; this.hy = _q[1] / l;
    this.vx = this.vy = 0;
    this.hg = G.at(x, z, R);
    this.y = this._feet(G, x, z);
    this._write(W, 0);
  }
  /** A new frame: the drawn turn (rotation.y) is written from the map heading every frame, so nothing to carry over but this. */
  rebase(W2) { this._write(W2, 0); this.fresh = true; }
  /**
   * One frame. ix, iy: the input (right, forward), length up to 1 (analogue); az: the camera's bearing on screen (stage rig.az: the
   * camera stands at (sin az, cos az) from what it looks at); run: Shift or the stick past its rim. crowd (optional): the city's crowd
   * (its agents are obstacles); B (optional): the stage's blocker list (actors on stage), `self` the entry that is his own.
   */
  step(W, dt, ix, iy, az, run, crowd = null, B = null, self = null) {
    const F = W.frame, G = W.ground;
    toS(F, this.mx, this.my, _s);
    let x = _s[0], z = _s[1];
    this.blocked = false;
    this.waiting = false; // (a step refused only because the ground there is not built at its finest level yet: he waits for it)
    // ---- the velocity he wants, camera-relative: forward is away from the camera, right is the screen's right
    let m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; m = 1; }
    const sp = run ? RUN : WALK, sa = Math.sin(az), ca = Math.cos(az);
    const wx = (ca * ix - sa * iy) * sp, wz = (-sa * ix - ca * iy) * sp;
    lin(F, this.vx, this.vy, _q);
    let vx = _q[0], vz = _q[1];
    let ddx = wx - vx, ddz = wz - vz;
    const dl = Math.hypot(ddx, ddz), cap = (m > 0.01 && wx * vx + wz * vz >= 0 ? ACC : DEC) * dt;
    if (dl > cap) { ddx *= cap / dl; ddz *= cap / dl; }
    vx += ddx; vz += ddz;
    if (m <= 0.01 && vx * vx + vz * vz < 0.0025) vx = vz = 0;
    // ---- the move, in sub-steps, each one asked of W.ground
    const hc = G ? G.at(x, z, R) : 0;
    this.stuck = hc !== hc;
    if (!this.stuck) { this.hg = hc; this.stuckT = 0; }
    else if (G) {
      // something appeared under him (a parked car's place, a group's bike, a neighbour tile's building painted in later): he may only
      // step out of it, the way that is free (_normal, kept in _sn), within the step limit; after UNSTICK s he is put on the nearest
      // free spot within UNSTICK_R; none: lost (the stage takes him away)
      this._normal(G, x, z); _sn[0] = _n[0]; _sn[1] = _n[1];
      if ((this.stuckT += dt) > UNSTICK) {
        if (Walker.spot(W, x, z, UNSTICK_R, _sp)) { x = _sp[0]; z = _sp[1]; this.hg = G.at(x, z, R); this.stuck = false; this.stuckT = 0; this.moves++; vx = vz = 0; }
        else this.lost = true;
      }
    }
    this._gather(crowd, this.fresh ? null : B, self, x, z, dt);
    this.fresh = false;
    const x0 = x, z0 = z, d = Math.hypot(vx, vz) * dt;
    if (G && d > 1e-6) {
      const n = Math.min(MAXSUB, Math.ceil(d / SUB)), sx = (vx * dt) / n, sz = (vz * dt) / n;
      for (let k = 0; k < n; k++) {
        if (this._ok(G, x, z, x + sx, z + sz)) { x += sx; z += sz; continue; }
        this.blocked = true;
        // slide: keep the part of the step that does not point into what blocks
        this._normal(G, x, z);
        const dn = sx * _n[0] + sz * _n[1];
        if (dn < 0 && (_n[0] || _n[1])) { const tx = sx - dn * _n[0], tz = sz - dn * _n[1]; if (tx * tx + tz * tz > 1e-8 && this._ok(G, x, z, x + tx, z + tz)) { x += tx; z += tz; continue; } }
        // else round it: the step turned by 30, 60, then 90 degrees, first to the side that is free (a post, a corner, a bin)
        const side = sx * _n[1] - sz * _n[0] > 0 ? -1 : 1;
        let moved = false;
        for (let q = 1; q <= 6 && !moved; q++) {
          const an = side * (q & 1 ? 1 : -1) * Math.ceil(q / 2) * (Math.PI / 6), c = Math.cos(an), sn = Math.sin(an), tx = sx * c - sz * sn, tz = sx * sn + sz * c;
          if (this._ok(G, x, z, x + tx, z + tz)) { x += tx; z += tz; moved = true; }
        }
        if (moved) continue;
        break; // nowhere to go: he stands
      }
      if (this.blocked) { vx = (x - x0) / dt; vz = (z - z0) / dt; } // (pushing against a wall does not build up speed)
    }
    this.speed = Math.hypot(x - x0, z - z0) / (dt || 1);
    // ---- back to map metres
    lin(F, vx, vz, _q); this.vx = _q[0]; this.vy = _q[1];
    this.mx = F.ox + x * F.dx + z * F.dy; this.my = F.oy + x * F.dy - z * F.dx;
    // ---- he faces where he goes (the turn is smoothed on the map heading, never on rotation.y: a new frame cannot make him spin)
    if (this.speed > 0.2 || m > 0.3) {
      if (this.speed <= 0.2) lin(F, wx, wz, _q); // (pushing against a wall: he turns to where he is told to go)
      const want = this.speed > 0.2 ? Math.atan2(this.vx, this.vy) : Math.atan2(_q[0], _q[1]), cur = Math.atan2(this.hx, this.hy);
      let dh = want - cur; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const an = cur + dh * Math.min(1, dt * TURN);
      this.hx = Math.sin(an); this.hy = Math.cos(an);
    }
    // ---- standing height: never under the ground under his feet (up a kerb or a stair step at once: the walk cycle makes it a step;
    // the camera's aim height eases, stage.js), and stepping down lowered as fast as a foot falls (never more than FALL over it)
    lin(F, this.hx, this.hy, _q);
    const t = G ? this._feet(G, x, z, Math.atan2(_q[0], _q[1])) : W.hAt(x, z); // (his shoes as they will be drawn this frame)
    if (!(dt > 0) || t >= this.y || this.y - t > 1.5) this.y = t;
    else this.y = Math.max(t, Math.min(t + FALL, this.y - 1.5 * dt)); // (and the last few centimetres at 1.5 m/s: two frames)
    if (G) { G.at(x, z, 0, PERSON, ALL); this.cls = G.cls; }
    this._write(W, dt);
  }
  /**
   * The drawn height: the highest ground under his centre and his four shoe corners (what is drawn touching the ground, and what
   * the clipping counter measures), but a shoe corner over ground higher than his footprint's by more than STEP (a ledge he may not
   * stand on: he was stopped beside it) does not lift him onto it.
   */
  _feet(G, x, z, yaw = this.g.rotation.y) {
    const lim = this.hg + STEP;
    let t = G.at(x, z, 0, PERSON, ALL);
    const sc = this.g.scale.x, c = Math.cos(yaw) * sc, sn = Math.sin(yaw) * sc;
    for (let k = 0; k < 4; k++) { const lx = k & 1 ? 0.36 : -0.36, lz = k & 2 ? 0.27 : -0.17, h = G.at(x + c * lx + sn * lz, z - sn * lx + c * lz, 0, PERSON, ALL); if (h > t && h <= lim) t = h; }
    return t;
  }
  /** May he go from scene (x, z) to (nx, nz)? (W.ground, the step limit, the people and vehicles round him.) Sets this.hg when yes. */
  _ok(G, x, z, nx, nz) {
    if (!G.ready(nx, nz)) { this.waiting = true; return false; } // (a tile not at its finest level: its furniture and drawn walls are not known there)
    if (this.stuck && (nx - x) * _sn[0] + (nz - z) * _sn[1] <= 0) return false; // (stuck: only steps out, the way that is free)
    const h = this.stuck ? G.at(nx, nz, R, PERSON, STANDING) : G.at(nx, nz, R);
    if (h !== h) return false;
    if (Math.abs(h - this.hg) > STEP) return false;
    const C = this.circ;
    for (let i = 0; i < this.nc; i++) {
      const cx = C[i * 3], cz = C[i * 3 + 1], rr = C[i * 3 + 2] + BODY, dn = (nx - cx) * (nx - cx) + (nz - cz) * (nz - cz);
      if (dn < rr * rr && dn < (x - cx) * (x - cx) + (z - cz) * (z - cz)) return false; // (closer than two bodies, and getting closer)
    }
    if (this.stuck) { const hc = G.at(nx, nz, R); if (hc === hc) this.stuck = false; this.hg = hc === hc ? hc : h; } else this.hg = h;
    return true;
  }
  /** Which way is free from scene (x, z): a unit normal into _n, pointing away from what blocks (probes like W.ground.away's, finer: two rings of 16; no array). */
  _normal(G, x, z) {
    let nx = 0, nz = 0;
    for (let ring = 0; ring < 2; ring++) {
      const dd = R + (ring ? 0.35 : 0.1);
      for (let k = 0; k < 16; k++) {
        const an = ((k + ring * 0.5) * Math.PI) / 8, sx = Math.sin(an), sz = Math.cos(an), px = x + sx * dd, pz = z + sz * dd;
        const h = G.ready(px, pz) ? G.at(px, pz, 0) : NaN;
        if (h !== h || Math.abs(h - this.hg) > STEP) { nx -= sx * (ring ? 1 : 2); nz -= sz * (ring ? 1 : 2); }
      }
    }
    const C = this.circ;
    for (let i = 0; i < this.nc; i++) {
      const ex = x - C[i * 3], ez = z - C[i * 3 + 1], rr = C[i * 3 + 2] + BODY + 0.2, e2 = ex * ex + ez * ez;
      if (e2 < rr * rr && e2 > 1e-8) { const e = Math.sqrt(e2); nx += (ex / e) * 2; nz += (ez / e) * 2; }
    }
    const l = Math.hypot(nx, nz);
    if (l > 1e-6) { _n[0] = nx / l; _n[1] = nz / l; } else { _n[0] = 0; _n[1] = 0; }
  }
  /**
   * The round obstacles near (x, z) this frame: the crowd's people and vehicles from its 8 m grid (crowd.gridNear: the 3 x 3 cells
   * round him, no search over everyone), its trams (a short list made twice a second), the actors on stage (B).
   */
  _gather(crowd, B, self, x, z, dt = 0) {
    this.nc = 0;
    const add = this._add;
    if (crowd) {
      this._gx = x; this._gz = z;
      if (crowd.gridNear) crowd.gridNear(x, z, this._cell || (this._cell = (px, pz, kind, a) => {
        const ex = px - this._gx, ez = pz - this._gz;
        if (ex * ex + ez * ez > NEAR * NEAR + 9 || kind === 4) return;
        if (kind === 0 || kind === -1) { if (!(a && a.down > 0)) this._add(px, pz, 0.25); return; }
        const sx = Math.sin(a.hd), sz = Math.cos(a.hd);
        if (kind === 2) for (let k = -1; k <= 1; k++) this._add(px + sx * 1.35 * k, pz + sz * 1.35 * k, 0.95);
        else for (let k = -1; k <= 1; k += 2) this._add(px + sx * 0.5 * k, pz + sz * 0.5 * k, 0.4);
      }));
      // the trams: two circles per section along the track (crowd.js obstacles); the list itself is looked up only twice a second
      if ((this._tramT -= dt) <= 0) { this._tramT = 0.5; const T = this._trams; T.length = 0; for (let i = 0; i < crowd.agents.length; i++) { const a = crowd.agents[i]; if (a.kind === 4 && !a.dead) T.push(a); } }
      for (let i = 0; i < this._trams.length; i++) {
        const a = this._trams[i];
        if (a.dead || !a.vis || (a.x - x) * (a.x - x) + (a.z - z) * (a.z - z) > 40 * 40) continue;
        for (let q = 0; q < 5; q++) { crowd._lp(a.lane, a.s - a.dir * q * 5.5); const cx = crowd._px + a.ox, cz = crowd._pz + a.oz; for (let k = -1; k <= 1; k += 2) { const px = cx + crowd._ux * 1.3 * k, pz = cz + crowd._uz * 1.3 * k; if ((px - x) * (px - x) + (pz - z) * (pz - z) < (NEAR + 1.3) * (NEAR + 1.3)) add(px, pz, 1.25); } }
      }
    }
    if (B) for (let i = 0; i < B.length; i++) { const b = B[i]; if (b === self) continue; if ((b.x - x) * (b.x - x) + (b.z - z) * (b.z - z) < (NEAR + b.r) * (NEAR + b.r)) add(b.x, b.z, b.r > 0.5 ? b.r : 0.25); }
  }
  /** (one round obstacle into this.circ; made once in the constructor: no closure per frame) */
  _mkAdd() { return (cx, cz, r) => { const C = this.circ, n = this.nc; if (n * 3 < C.length) { C[n * 3] = cx; C[n * 3 + 1] = cz; C[n * 3 + 2] = r; this.nc = n + 1; } }; }
  /** Write him into street W's frame: position, the turn (rotation.y, written: see step), the walk cycle. */
  _write(W, dt) {
    const F = W.frame, a = this.a;
    toS(F, this.mx, this.my, _s);
    a.g.position.set(_s[0], this.y, _s[1]);
    lin(F, this.hx, this.hy, _q);
    a.face(Math.atan2(_q[0], _q[1]));
    this.heading = Math.atan2(this.hx, this.hy);
    a.moving = this.speed > 0.15 ? MV(this.speed) : 0;
    if (dt > 0) a.update(dt);
  }
  /** Scene position of a frame, written into o (for the stage and the tools). */
  at(F, o) { return toS(F, this.mx, this.my, o); }
  dispose() {
    this.alive = false;
    this.g.parent?.remove(this.g);
    disposeTree(this.g);
  }
}

/**
 * The on-screen stick (#walk-stick, touch screens): writes into out { x, y, run } the input the keys would give (x right, y forward,
 * length up to 1), from a finger on the disc. Pointer events with capture on the stick itself, so its touches never reach the
 * canvas (whose own gestures still turn and zoom the camera). A dead zone in the middle; the speed grows with the push; past the rim
 * (1.25 x its radius) he runs. Let go: up, cancel, lost capture (the stick hidden), the page left.
 */
export function bindStick(el, out) {
  const knob = el.firstElementChild;
  let id = null, cx = 0, cy = 0, rad = 1;
  const show = (dx, dy, run) => { if (knob) knob.style.transform = dx || dy ? `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` : ''; el.classList.toggle('run', run); };
  const move = (e) => {
    const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy), m = d / rad;
    const k = m < 0.12 ? 0 : Math.min(1, (m - 0.12) / 0.76); // (dead zone 12 %, full speed at 88 % of the radius)
    out.x = d > 0 ? (dx / d) * k : 0; out.y = d > 0 ? (-dy / d) * k : 0; out.run = m > 1.25;
    const c = Math.min(1, m);
    show(d > 0 ? (dx / d) * c * rad : 0, d > 0 ? (dy / d) * c * rad : 0, out.run);
  };
  const end = (e) => { if (e && e.pointerId !== id) return; id = null; out.x = out.y = 0; out.run = false; show(0, 0, false); };
  el.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId;
    try { el.setPointerCapture(id); } catch (err) { /* not a live pointer */ }
    const b = el.getBoundingClientRect(), kr = knob ? knob.offsetWidth / 2 : 0;
    cx = b.left + b.width / 2; cy = b.top + b.height / 2; rad = Math.max(10, b.width / 2 - kr * 0.5);
    e.preventDefault();
    move(e);
  });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return () => end(null);
}
