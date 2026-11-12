// Ambient street life + crime-level shenanigans, written as generator scripts.
import * as THREE from 'three';
import { wait, tween, all, race, waitUntil, ease, clamp, lerp, TAU, sculpt, piece, MAT } from './kit.js';
import { makePerson, makeDog, makeCat, makeBird, item, SKINS, SHIRTS, PANTS, HAIRS } from './cast.js';
import { makeCar, makeBike, makeScooter, makeFatbike, makeHeli, makeBoat } from './props.js';
import * as S from './setting.js';
import * as ACTS from './acts/index.js';

const X0 = -24, X1 = 24, EX0 = X0 + 0.5, EX1 = X1 - 0.5;
const E = Math.PI / 2, W = -Math.PI / 2; // headings: +x, −x

// ---------------------------------------------------------------- what the viewer can see
// `ctx.inView(x, z, y, margin)` and `ctx.watched()` come from the stage; when they are missing everything counts as in view.
const seen = (ctx, x, z, y = 1, margin = 0.08) => (typeof ctx.inView === 'function' ? !!ctx.inView(x, z, y, margin) : true);
const watching = (ctx) => (typeof ctx.watched === 'function' ? !!ctx.watched() : true);
const CAR_TYPES = new Set(['car', 'police', 'van', 'taxi']);
const isCar = (a) => !!a.vehicle && CAR_TYPES.has(a.type);

// ---------------------------------------------------------------- movement primitives
/** One straight leg at constant speed; finishes on arrival (within `stop`). Returns true when `each` ended it. */
function* leg(ctx, a, x, z, speed, stop = 0.06, each = null) {
  for (;;) {
    const p = a.g.position, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d <= stop) return false;
    const dt = yield;
    const s = Math.min(d, speed * dt);
    p.x += (dx / d) * s;
    p.z += (dz / d) * s;
    if (!a.air) p.y = 0;
    a.heading = Math.atan2(dx, dz);
    a.moving = speed;
    if (each && each(dt, s) === true) return true;
  }
}
/** Flying things, boats, helicopters and anyone standing on something (`air`) do not walk round the street furniture. */
const exempt = (ctx, a, o) => (o && o.straight) || a.air || a.fly || a.rigid || a.type === 'boat' || a.type === 'heli' || a.type === 'tram' || ctx.id === 'amb' || !ctx.L;
/**
 * The way a walker takes to (x, z): null = straight on; otherwise waypoints [[x, z], ...] round whatever stands in the way
 * (S.route; what the walker already touches, `o.ignore` and `a.ignore` do not count). Empty = nowhere to go, stay put.
 */
function walkRoute(ctx, a, x, z, o) {
  if (exempt(ctx, a, o)) return null;
  const p = a.g.position;
  if (Math.hypot(x - p.x, z - p.z) < 0.6) return null;
  const r = S.route(ctx, p.x, p.z, x, z, { ignore: (o && o.ignore) || a.ignore || null });
  return r.straight ? null : r.pts;
}
/** Follow waypoints with `go` semantics; `each` as in goEach. */
function* followRoute(ctx, a, pts, speed, stop, each) {
  for (let i = 0; i < pts.length; i++) if (yield* leg(ctx, a, pts[i][0], pts[i][1], speed, i === pts.length - 1 ? stop : 0.25, each)) return;
}
/** A car going straight, or bent round whatever is parked on the way. Stops at the last clear point when there is no line. */
function* goCar(ctx, a, x, z, speed, stop, o) {
  const p = a.g.position;
  if (!(o && o.straight) && ctx.id !== 'amb' && ctx.L) {
    const half = (a.wid || 1.85) / 2 + 0.12, off = Math.max(0, (a.len || 4.4) / 2 - half), ign = (o && o.ignore) || a.ignore || null;
    const b = S.bend(ctx, [[p.x, p.z], [x, z]], { half, off, ignore: ign, road: !(o && o.road === false) });
    if (b && b.length > 2) { yield* drive(ctx, a, b.slice(1), speed, { free: true }); return; }
    if (!b) {
      const q = S.carReach(ctx, p.x, p.z, x, z, { half, off, ignore: ign });
      if (Math.hypot(q[0] - p.x, q[1] - p.z) < 0.1) { yield; return; }
      yield* leg(ctx, a, q[0], q[1], speed, stop, null);
      return;
    }
  }
  yield* leg(ctx, a, x, z, speed, stop, null);
}
/**
 * Walk (or drive) to (x, z) at `speed` and finish on arrival. Round parked cars, shelters, terrace tables, lamp posts and the
 * rest of the obstacle picture (setting.js `obstacles`) on a detour worked out once per call; if there is no way, it stops at
 * the last clear point of the straight line. `o`: { ignore: [things the walker is deliberately AT], straight: true (opt out) }.
 */
function* go(ctx, a, x, z, speed = a.speed, stop = 0.06, o = null) {
  if (isCar(a)) { yield* goCar(ctx, a, x, z, speed, stop, o); return; }
  const pts = walkRoute(ctx, a, x, z, o);
  if (!pts) { yield* leg(ctx, a, x, z, speed, stop, null); return; }
  if (!pts.length) { yield; return; }
  yield* followRoute(ctx, a, pts, speed, stop, null);
}
function* fly(a, x, y, z, speed) {
  for (;;) {
    const p = a.g.position, dx = x - p.x, dy = y - p.y, dz = z - p.z, d = Math.hypot(dx, dy, dz);
    if (d <= 0.1) return;
    const dt = yield;
    const s = Math.min(d, speed * dt);
    p.x += (dx / d) * s; p.y += (dy / d) * s; p.z += (dz / d) * s;
    if (Math.hypot(dx, dz) > 0.2) a.heading = Math.atan2(dx, dz);
    a.moving = speed;
  }
}
/**
 * Run after a target until within `stop` of it (or `timeout` seconds). The way round things is looked up a few times a second
 * (at most four), not every frame. Returns true when it caught up.
 */
function* chase(ctx, a, tgt, speed, stop = 1.0, timeout = 12, o = null) {
  let t = 0, re = 0, wp = null, wi = 0;
  const can = !exempt(ctx, a, o) && !isCar(a);
  while (t < timeout && tgt.alive) {
    const dt = yield;
    t += dt;
    const p = a.g.position, q = tgt.g.position, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d <= stop) return true;
    let tx = q.x, tz = q.z, last = true;
    if (can) {
      if ((re -= dt) <= 0) {
        re = 0.26;
        const r = S.route(ctx, p.x, p.z, q.x, q.z, { ignore: (o && o.ignore) || a.ignore || null });
        wp = r.straight ? null : r.pts; wi = 0;
      }
      if (wp) {
        while (wi < wp.length - 1 && Math.hypot(wp[wi][0] - p.x, wp[wi][1] - p.z) < 0.3) wi++;
        if (!wp.length) { a.moving = 0; continue; }
        tx = wp[wi][0]; tz = wp[wi][1]; last = wi === wp.length - 1;
      }
    }
    const ex = tx - p.x, ez = tz - p.z, e = Math.hypot(ex, ez) || 1e-6;
    const s = last && tx === q.x && tz === q.z ? Math.min(d - stop * 0.9, speed * dt) : Math.min(e, speed * dt);
    p.x += (ex / e) * s; p.z += (ez / e) * s;
    if (!a.air) p.y = ctx.L.yAt(p.z);
    a.heading = Math.atan2(ex, ez);
    a.moving = speed;
  }
  return false;
}
/** Scale up from nothing. Only for things that are MEANT to appear by magic or effect (a prop from a pocket, a puff of smoke). */
function* popIn(ctx, a, dur = 0.28) {
  const s = a.baseScale;
  yield* tween(dur, (t) => a.g.scale.setScalar(Math.max(0.001, s * t)), ease.outBack);
}
/** Shrink to nothing and remove. Only for things that are MEANT to vanish by magic or effect; people and vehicles use `exitOut`. */
function* popOut(ctx, a) {
  const s = a.g.scale.x;
  yield* tween(0.18, (t) => a.g.scale.setScalar(Math.max(0.001, s * (1 - t))), ease.inQuad);
  ctx.despawn(a);
}

// ---------------------------------------------------------------- entrances and exits that the viewer can follow
/** Walking out from x along z in direction dir (+1/-1): the first point out of the frame, then `pad` metres further. { x, hidden }. */
function outPoint(ctx, x, z, dir, pad = 3, y = 1) {
  const L = ctx.L, sc = ctx.sc || 0;
  const lim = dir > 0 ? Math.min(L.x1 + 30, L.sB != null ? L.sB - sc - 0.5 : 1e9) : Math.max(L.x0 - 30, L.sA != null ? L.sA - sc + 0.5 : -1e9);
  let px = x, run = 0;
  for (let d = 0; ; d++) {
    px = x + dir * d;
    if (dir * (px - lim) >= 0) return { x: lim, hidden: !seen(ctx, lim, z, y) };
    if (!seen(ctx, px, z, y)) { if (++run >= 2) break; } else run = 0;
  }
  const ox = dir > 0 ? Math.min(lim, px + pad) : Math.max(lim, px - pad);
  return { x: ox, hidden: !seen(ctx, ox, z, y) };
}
/** The house whose real front door (one with a leaf we can open: not a tower's glass front) is within maxD metres of (x, z), or null. */
function doorNear(ctx, x, z, maxD) {
  let best = null, bd = maxD;
  for (const h of ctx.L.houses || []) {
    if (!h.door || !h.leaf || h.tower) continue;
    const d = Math.hypot(h.door.x - x, h.door.z - z);
    if (d <= bd) { best = h; bd = d; }
  }
  return best;
}

// ---------------------------------------------------------------- real doors and windows that open
const DARK = '#0a090c';
const LIT_GLASS = new Set(['#ffd97a', '#ffe9a8', '#ffc45e', '#fff1c1']);
/**
 * A real front door (`'door'`, also shop doors) or first-floor window (`'window'`) of a house record `h` (ctx.L.houses[i]) that can open.
 * The real door is part of the merged street front and cannot swing, so opening shows a dark doorway ON the real door (a pane the size of
 * the door or glass, just proud of it) and a leaf of the real door's own colour and size (a window: two white sashes with the real glass) swung out
 * on its hinge; closed, nothing extra is visible. People walk out of and into the pane: they start behind the wall, so they come out of the dark.
 * Reference counted: every `yield* open()` needs a `yield* close()`. Shared by everything that uses the same door.
 *   .at(lx, lz) street point lx along the facade (right as seen from the street), lz out from the door face · .out the pavement spot in front
 *   · .inside a spot behind the wall · .heading facing out · .bell { x, z, y } and .bellStand (doors of homes only) · .y0 the sill (windows)
 *   open() close() passOut(a) passIn(a) press() · windows: pose(a, u) retreat(a) · force() shuts at once.
 */
function openable(ctx, h, key) {
  const win = key === 'window', f = win ? h.sash : h.leaf;
  if (!f || h.tower) return null;
  const slot = win ? '_ww' : '_dw';
  if (h[slot]) return h[slot];
  const step = !win && !f.shop, w = f.w, yb = win ? f.y : f.y + (step ? 0.12 : 0), hh = win ? f.h : f.h - (step ? 0.12 : 0);
  const maxA = win ? 1.9 : 1.75;
  const P = (lx, lz) => ({ x: f.x + lx * f.tx + lz * f.nx, z: f.z + lx * f.tz + lz * f.nz });
  const d = { h, f, kind: key, users: 0, angle: 0, target: 0, task: null, root: null, pivots: [], heading: Math.atan2(f.nx, f.nz), at: P, y0: f.y, w, openFor: 0 };
  d.out = P(0, 0.9); d.inside = P(0, -0.6);
  if (!win && f.bell) {
    d.bell = { x: f.bell.x, z: f.bell.z, y: f.bell.y };
    d.bellStand = { x: f.bell.x + f.nx * 0.5, z: f.bell.z + f.nz * 0.5 };
  }
  const build = () => {
    const root = new THREE.Group();
    root.position.set(f.x, 0, f.z);
    root.rotation.y = f.psi;
    root.visible = false;
    root.add(sculpt((v) => v.box(0, yb, 0.05, w, hh, 0.01, !win && ctx.L.night ? '#2e2216' : DARK)));
    d.pivots = [];
    if (!win) {
      const piv = new THREE.Group();
      piv.position.set(-w / 2, 0, 0.075);
      piv.add(piece((v, gl) => {
        v.box(w / 2, yb, 0, w, hh, 0.05, f.col);
        if (f.shop) (f.lit ? gl : v).box(w / 2, f.y + 0.9, 0.03, 0.6, 0.75, 0.02, f.glass || '#a9dcf5');
        else v.box(w / 2 + 0.28, f.y + 0.9, 0.04, 0.08, 0.08, 0.04, '#e9c46a');
      }));
      root.add(piv); d.pivots.push([piv, -1]);
    } else {
      for (const sd of [-1, 1]) {
        const piv = new THREE.Group(), cx = -sd * w / 4;
        piv.position.set(sd * w / 2, 0, 0.075);
        piv.add(piece((v, gl) => {
          v.box(cx, yb, 0, w / 2, hh, 0.04, '#f6f3ec');
          (LIT_GLASS.has(f.glass) ? gl : v).box(cx, yb + 0.07, 0.025, w / 2 - 0.14, hh - 0.14, 0.02, f.glass || '#8fc7e8');
        }));
        root.add(piv); d.pivots.push([piv, sd]);
      }
    }
    return root;
  };
  const apply = () => {
    if (!d.root) return;
    d.root.visible = d.angle > 0.002;
    for (const [piv, sg] of d.pivots) piv.rotation.y = sg * d.angle;
  };
  const teardown = () => { if (d.root) { ctx.world.remove(d.root); d.root = null; d.pivots = []; } };
  function* anim() {
    for (;;) {
      const dt = yield;
      const dd = d.target - d.angle, sp = (dd > 0 ? 4.2 : 3.6) * dt;
      d.angle += clamp(dd, -sp, sp);
      apply();
      if (d.target === 0 && d.angle <= 0.0005) { d.angle = 0; teardown(); return; }
    }
  }
  const ensure = () => {
    if (!d.root) { d.root = build(); ctx.world.add(d.root); }
    if (!d.task || d.task.done) d.task = ctx.run(anim());
  };
  d.open = function* () {
    d.users++; d.target = maxA; ensure();
    if (d.angle < 0.01) ctx.sfx(win ? 'swish' : 'door');
    yield* waitUntil(() => d.angle >= maxA * 0.9, 2);
  };
  d.close = function* () {
    d.users = Math.max(0, d.users - 1);
    if (d.users > 0) return;
    d.target = 0;
    yield* waitUntil(() => d.users > 0 || d.angle <= 0.002, 2);
    if (d.users === 0 && !win) ctx.sfx('door');
  };
  d.force = () => { d.users = 0; d.target = 0; d.angle = 0; teardown(); };
  /** metres out from the door face (negative = inside) */
  d.lz = (p) => (p.x - f.x) * f.nx + (p.z - f.z) * f.nz;
  d.lx = (p) => (p.x - f.x) * f.tx + (p.z - f.z) * f.tz;
  const stepY = (lz) => (step ? 0.12 * clamp((lz + 0.1) / 0.1, 0, 1) * clamp((0.4 - lz) / 0.1, 0, 1) : 0);
  /** From behind the wall (spawn the actor at .inside) out through the open door to the pavement spot in front of it (or only to `z1` metres out). */
  d.passOut = function* (a, speed = 1.5, z1 = 0.9) {
    const p = a.g.position, z0 = d.lz(p), x0 = d.lx(p), dur = Math.max(0.25, (z1 - z0) / speed);
    a.offstage = true;
    yield* tween(dur, (u) => {
      const lz = lerp(z0, z1, u), q = P(lerp(x0, 0, clamp(u * 2, 0, 1)), lz);
      p.x = q.x; p.z = q.z; p.y = stepY(lz); a.heading = d.heading; a.moving = speed;
      if (lz > 0.25) a.offstage = false;
    });
    p.y = 0; a.offstage = false;
  };
  /** From the pavement into the open doorway and on into the dark; the caller removes the actor afterwards (it is hidden by the wall by then). */
  d.passIn = function* (a, speed = 1.5) {
    const p = a.g.position, z0 = d.lz(p), x0 = d.lx(p), z1 = -0.65, dur = Math.max(0.25, (z0 - z1) / speed);
    yield* tween(dur, (u) => {
      const lz = lerp(z0, z1, u), q = P(lerp(x0, 0, clamp(u * 3, 0, 1)), lz);
      p.x = q.x; p.z = q.z; p.y = stepY(lz); a.heading = d.heading + Math.PI; a.moving = speed;
      if (lz < 0.25) a.offstage = true;
    });
  };
  /** A press on the bell: the button lights for a moment. */
  d.press = function* () {
    if (!d.bell) return;
    const g = sculpt((v) => v.box(0, -0.045, 0, 0.09, 0.09, 0.03, '#fff3a0'), MAT.glow);
    g.position.set(d.bell.x + f.nx * 0.03, d.bell.y, d.bell.z + f.nz * 0.03);
    g.rotation.y = f.psi;
    ctx.world.add(g);
    ctx.sfx('dingdong');
    yield* wait(0.45);
    ctx.world.remove(g);
  };
  /** A window: stand the person inside (u = 0) or leaning out over the sill (u = 1). They start behind the wall, so only the part that leans out shows. */
  d.pose = (a, u) => {
    const sc = a.g.scale.x, hp = 0.95 * sc, th = 0.55 * u, floor = f.y - 0.62, lz0 = lerp(-0.75, -0.04, u);
    const q = P(0, lz0 - hp * Math.sin(th));
    a.g.rotation.order = 'YXZ';
    a.air = true; a.heading = d.heading;
    a.g.position.set(q.x, floor + hp - hp * Math.cos(th), q.z);
    a.g.rotation.x = th;
  };
  d.retreat = function* (a) { yield* tween(0.6, (u) => d.pose(a, 1 - u), ease.inQuad); a.g.rotation.x = 0; };
  h[slot] = d;
  return d;
}
/** The door of a house record as a doorway you can open (see openable); null for a tower or a front without a modelled door. `R` makes it close when the script ends. */
function doorway(ctx, R, h) { const d = h ? openable(ctx, h, 'door') : null; if (d && R) R.guard(d); return d; }
/** The first-floor window of a house record as a window you can open; null when the front has no first floor. */
function windowAt(ctx, R, h) { const d = h ? openable(ctx, h, 'window') : null; if (d && R) R.guard(d); return d; }
/** The nearest house record with a real door within maxD of x along the street (opt: { shop: true | false }), or null. */
function doorHouse(ctx, x, maxD = 12, opt = {}) {
  return S.housesNear(ctx, x, maxD, { door: true, tower: false, shop: opt.shop }).find((h) => h.leaf) || null;
}
/** The foot of something tall enough to hide a person (a stall, a kiosk, a shelter), on the side away from the camera. */
function hideBehind(ctx, x, z) {
  let best = null, bd = 16;
  for (const s of S.hiders(ctx, 2.0)) {
    const d = Math.hypot(s.x - x, s.z - z), hz = s.z - s.r - 0.6;
    if (d > bd || !S.clearSpot(ctx, s.x, hz, 0.35, { ground: 'open', ignore: [{ x: s.x, z: s.z, r: s.r + 0.6 }] })) continue;
    best = { x: s.x, z: hz }; bd = d;
  }
  return best;
}
const brisk = (a, o) => (o && o.speed) || (a.vehicle ? (a.two ? 6.5 : Math.min(a.speed || 9, 10)) : clamp(a.speed || 3, 2.6, 3.6));
/**
 * Bring `a` on stage at (x, z) so that nothing appears in view. Not watched, or the point out of view: it simply stands there
 * (no scale pop). In view: from a real door close by (`o.from = 'door'`, or a point within 1.2 m of one), else from the nearest
 * point outside the frame along its line (`o.dir` = the way it is travelling when it arrives, so a car arrives heading the way
 * the scene wants it), else from behind a stall or shelter; it walks (drives) in at a brisk pace, round things, and this
 * returns when it gets to (x, z). `y` above 0.05 (a balcony, a bench) cannot walk in and pops in by magic. `o`: { speed,
 * from: 'edge' | 'door' | 'auto', dir, now, exact (do not nudge off a tree), ignore }.
 */
function* enterTo(ctx, a, x, z, y, o, spawn) {
  o = o || {};
  const high = y > 0.05, veh = !!a.vehicle;
  if (!y && !o.exact && !veh) { const q = S.nudge(ctx, x, z, 0.5, { ignore: o.ignore }); x = q.x; z = q.z; }
  if (!watching(ctx) || !seen(ctx, x, z, high ? y + 1 : 1)) { spawn(a, x, z, y); return; }
  if (a.fly) { // a bird: over the edge of the frame, then on to where it is wanted
    const side = o.dir ? -Math.sign(o.dir) : ctx.rnd.sign(), hy = Math.max(y, 3), q = outPoint(ctx, x, z, side, 6, hy);
    spawn(a, q.x, z, hy + 2);
    a.offstage = true;
    yield* fly(a, x, y, z, o.speed || 7);
    a.offstage = false;
    return;
  }
  if (high) { spawn(a, x, z, y); a.g.scale.setScalar(0.001); yield* popIn(ctx, a); return; }
  const doorish = o.from === 'door' || (y > 0 && y <= 0.05);
  const door = !veh && o.from !== 'edge' ? doorNear(ctx, x, z, doorish ? 8 : 1.2) : null;
  const dw = door ? openable(ctx, door, 'door') : null;
  if (dw) {
    // the door opens on a dark doorway; the person starts behind the wall and steps out of it, over the threshold
    yield* dw.open();
    spawn(a, dw.inside.x, dw.inside.z, 0);
    a.offstage = true; a._doorway = dw;
    a.heading = dw.heading;
    yield* dw.passOut(a, 1.5);
    ctx.run((function* () { yield* wait(0.5); yield* dw.close(); })());
    if (Math.hypot(x - dw.out.x, z - dw.out.z) > 0.35) yield* go(ctx, a, x, z, brisk(a, o) * 0.85, 0.06, { ignore: o.ignore });
    a.offstage = false;
    return;
  }
  const sides = o.dir ? [-Math.sign(o.dir)] : x < 0 ? [-1, 1] : [1, -1], pad = veh ? 6 : 2.5;
  let best = null;
  for (const sd of sides) {
    const q = outPoint(ctx, x, z, sd, pad, veh ? 0.8 : 1);
    q.d = Math.abs(q.x - x);
    if (!best || (q.hidden && !best.hidden) || (q.hidden === best.hidden && q.d < best.d)) best = q;
  }
  let sx = best.x, sz = z, hid = false;
  if (!best.hidden && !veh) { const h = hideBehind(ctx, x, z); if (h) { sx = h.x; sz = h.z; hid = true; } }
  if (!veh && !hid && !a.air) { const q = S.nudge(ctx, sx, sz, 0.35, { ignore: o.ignore }); sx = q.x; sz = q.z; }
  spawn(a, sx, sz, y);
  a.offstage = true;
  const h0 = Math.atan2(x - sx, z - sz);
  if (a.face) a.face(h0); else a.heading = h0;
  yield* go(ctx, a, x, z, brisk(a, o), 0.06, { ignore: o.ignore });
  a.offstage = false;
}
/**
 * How many seconds `R.enter(a, x, z, y, o)` would take right now: 0 when it appears at once (not watched, point out of view),
 * about 1.5 for a door, else the walk from the nearest out-of-frame point. Use it to start an entrance early enough
 * (`R.run(R.enter(...))` this many seconds before the beat that needs the actor).
 */
function entryTime(ctx, a, x, z, o = {}) {
  if (!watching(ctx) || !seen(ctx, x, z, 1)) return 0;
  if (!a.vehicle && o.from !== 'edge' && !a.fly && doorNear(ctx, x, z, o.from === 'door' ? 8 : 1.2)) return 2.2;
  const veh = !!a.vehicle, sides = o.dir ? [-Math.sign(o.dir)] : [-1, 1];
  let d = 1e9;
  for (const sd of sides) d = Math.min(d, Math.abs(outPoint(ctx, x, z, sd, veh ? 6 : 2.5, veh ? 0.8 : 1).x - x));
  return d / (a.fly ? (o.speed || 7) : brisk(a, o));
}
/** Bring someone on without tracking them (the rig's `R.enter` tracks). See enterTo. */
function* enter(ctx, a, x, z, y, o) {
  yield* enterTo(ctx, a, x, z, y, o, (q, px, pz, py) => ctx.spawn(q, px, pz, py));
}
/**
 * Take `a` off stage so that nothing vanishes in view. Out of view (or not watched): it is handed back to the crowd if it
 * came from there, else removed. In view: through the door it came from if it is near it; a person standing high steps back
 * through the window; otherwise it walks (drives) on along its way until it is out of the frame and a few metres beyond
 * (if the camera follows it to the end of the playable range it is handed back to the crowd there, else it goes on).
 * Only then is it removed. `o`: { speed, now, edge (not the door) }.
 */
function* exitOut(ctx, a, o = {}) {
  if (!a.alive) return;
  const p = a.g.position, veh = !!a.vehicle;
  const gone = () => { a.offstage = false; if (a.alive) ctx.despawn(a); };
  a.offstage = true;
  if (o.now || !watching(ctx) || !seen(ctx, p.x, p.z, 1)) {
    if (!veh && a.look && ctx.demote) { unped(ctx, a); if (ctx.demote(a)) return; }
    gone();
    return;
  }
  if (a.fly) { // a bird flies on past the edge of the frame, and only then is it gone
    const hx0 = Math.sin(a.heading ?? 0), dir0 = o.dir || (Math.abs(hx0) > 0.3 ? Math.sign(hx0) : p.x < 0 ? -1 : 1), fy = Math.max(p.y, 5) + 3;
    const q = outPoint(ctx, p.x, p.z, dir0, 6, fy);
    yield* fly(a, q.x, fy, p.z, o.speed || 7);
    gone();
    return;
  }
  const hb = (ctx.L.hw || 2.6) + (ctx.L.bw || 0);
  if (!veh && p.y > 0.6 && Math.abs(p.z) > hb + 1) { // up on a balcony: back in through the window
    const z0 = p.z, dz = p.z < 0 ? -1 : 1;
    yield* tween(0.5, (u) => { p.z = z0 + dz * 0.9 * u; });
    gone();
    return;
  }
  if (a._doorway && !o.edge && Math.hypot(p.x - a._doorway.out.x, p.z - a._doorway.out.z) < 14) {
    // back in through the door they came out of: it opens, they step over the threshold into the dark, it shuts
    const dw = a._doorway;
    if (dw.lz(p) < -0.2) { gone(); return; } // (still behind the wall: nothing to see)
    yield* go(ctx, a, dw.out.x, dw.out.z, o.speed || 3.2, 0.06);
    yield* dw.open();
    yield* dw.passIn(a, 1.5);
    gone();
    ctx.run((function* () { yield* wait(0.3); yield* dw.close(); })());
    return;
  }
  const hx = Math.sin(a.heading ?? 0), sp = o.speed || brisk(a, null), pad = veh ? 6 : 3;
  let dir = Math.abs(hx) > 0.3 ? Math.sign(hx) : 0, q;
  if (dir) q = outPoint(ctx, p.x, p.z, dir, pad, veh ? 0.8 : 1);
  else {
    const q1 = outPoint(ctx, p.x, p.z, 1, pad, veh ? 0.8 : 1), q2 = outPoint(ctx, p.x, p.z, -1, pad, veh ? 0.8 : 1);
    const pickFirst = q1.hidden !== q2.hidden ? q1.hidden : Math.abs(q1.x - p.x) <= Math.abs(q2.x - p.x);
    dir = pickFirst ? 1 : -1; q = pickFirst ? q1 : q2;
  }
  const z = p.z, edge = dir > 0 ? EX1 : EX0;
  if (!veh && a.look && ctx.demote && dir * (q.x - edge) > 0 && dir * (edge - p.x) > 0) {
    yield* go(ctx, a, edge, z, sp, 0.1);
    if (seen(ctx, p.x, p.z, 1)) { unped(ctx, a); if (ctx.demote(a)) return; } // the camera is still on them: they carry on as one of the crowd
  }
  yield* go(ctx, a, q.x, z, sp, 0.1);
  if (Math.abs(p.x - q.x) > 0.5 && seen(ctx, p.x, p.z, 1)) yield* go(ctx, a, q.x, z, sp, 0.1, { straight: true }); // blocked on the way: carry on regardless rather than vanish in view
  gone();
}
const edgeOf = (a) => (a.g.position.x < 0 ? EX0 : EX1);
/** Where a walker on this line gets to when heading for x: the end of the clear ground if that comes first. */
function* walkOff(ctx, a, tx, speed, z0 = a.g.position.z) {
  const p = a.g.position, d = Math.sign(tx - p.x), full = Math.abs(tx - p.x);
  let bx = tx, bz = z0, best = -1;
  if (d) {
    // the line itself first, then lines a little to either side (round a tree trunk), keeping the longest
    // (only the ground counts here: the standing things are walked round by go)
    for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
      const e = S.runway(ctx, p.x, z0 + off, d, full, 0.45, { obst: false }), len = Math.abs(e - p.x);
      if (len > best + 0.01) { best = len; bx = e; bz = z0 + off; }
      if (len >= full - 0.01) break;
    }
  }
  yield* go(ctx, a, bx, bz, speed);
}
/** Walk off the spot (to `toX`, default the near end) and on until out of the frame, then remove. */
function* leave(ctx, a, speed = a.speed, toX = null) {
  if (!a.alive) return;
  yield* walkOff(ctx, a, toX ?? edgeOf(a), speed);
  yield* exitOut(ctx, a, { speed });
}
function* hop(a, h = 0.6, dur = 0.3) {
  const y0 = a.g.position.y;
  yield* tween(dur, (t) => (a.g.position.y = y0 + Math.sin(t * Math.PI) * h));
  a.g.position.y = y0;
}
/** A comic word over someone's head. Their mouth moves with it (sound words in *stars* and symbols excepted). */
const say = (ctx, a, str, o = {}) => {
  if (a && a.head && /[a-zA-Z]{2}/.test(str) && str[0] !== '*') a.talk = Math.min(1.3, 0.3 + str.length * 0.05);
  ctx.fx.text(str, a, o);
};
const at = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- set-piece toolkit
const noop = () => {};
/** Stand-in for the director's camera: the same methods, all inert. A set piece plays identically without a camera. */
const NOCAM = { on: false, card: noop, freeze: noop, release: noop };
for (const k of ['shot', 'wide', 'close', 'low', 'ots', 'track', 'top', 'two', 'hero', 'face', 'crash', 'dolly', 'orbit', 'nose', 'chase', 'ground', 'high', 'dutch']) NOCAM[k] = noop;
const camFor = (ctx, name) => (ctx.cam && ctx.cam(name)) || NOCAM;
const pt = (x, z) => ({ x, z }); // a street-space point the camera can follow (mutate it to move the shot)
const faceTo = (a, x, z) => { a.heading = Math.atan2(x - a.g.position.x, z - a.g.position.z); };
const yell = (ctx, a, str, color = '#ff6b6b', size = 15) => { ctx.sfx('hey'); say(ctx, a, str, { size, color }); };

// ---------------------------------------------------------------- the setting (see setting.js)
// The four walking lines of the cross-section, as the REAL pavement runs at x (L.walkAt); the nominal lines are the fallback.
// B = house side (z < 0), F = camera side; 0 = the line further from the road... except F0/B1 which hug the kerb side.
const WALKS = { walkB0: [-1, 0.7], walkB1: [-1, 0.3], walkF0: [1, 0.3], walkF1: [1, 0.7] };
const padZ = (ctx, k, x = 0) => (ctx.L.walkAt ? ctx.L.walkAt(WALKS[k][0], WALKS[k][1], ctx.sc + x) : ctx.L[k.slice(0, 5)][+k[5]]);
/**
 * Remember a terrain question about `obj` (a spot, a rack, a car) for a while: the director asks every gag's `avail`
 * every few seconds, and the ground does not change under it. Entries are recomputed after a number of asks (no clock, so runs stay repeatable) so tiles that stream in later are seen.
 */
const ASKED = new WeakMap();
function once(obj, key, fn, calls = 40) {
  let m = ASKED.get(obj);
  if (!m) ASKED.set(obj, (m = new Map()));
  const hit = m.get(key);
  if (hit && ++hit.n < calls) return hit.v;
  const v = fn();
  m.set(key, { v, n: 0 });
  return v;
}
/** A clear spot near (x, z) for something that must happen anyway: nudged if needed, the point itself if nothing is clear. */
const spotNear = (ctx, x, z, r = 0.6) => S.spotOr(ctx, x, z, r, 10);
/** A clear spot on the given pavement line near x (null if the pavement is blocked there). */
const padSpot = (ctx, k, x, r = 0.6, tries = 10) => S.findSpot(ctx, x, padZ(ctx, k, x), r, tries);

/** Put a borrowed or scripted person back into neutral. */
function tidy(a) {
  if (a.drop) a.drop();
  a.pose = null; a.air = false; a.arms = 'swing'; a.gait = 'walk'; a.offstage = false;
  a.mood = 'neutral'; a.lookAt = null; a.laughT = 0; a.nodT = 0; a.shakeT = 0; // faces go back to neutral too
  a.g.visible = true; a.g.rotation.x = 0; a.g.rotation.z = 0;
  a.g.scale.setScalar(a.baseScale || a.scale || 0.9);
  a.g.position.y = 0;
}
/** Like needPed, but never waits: borrow a walker near cx if one is there. */
function takePed(ctx, xr = 13, filter = null, cx = 0) {
  const ok = (p) => !p.busy && p.alive && Math.abs(p.g.position.x - cx) < xr && Math.abs(p.exitX - p.g.position.x) > 6 && !S.jutNear(ctx, p.g.position.x) && (!filter || filter(p)); // (not somebody the camera would have to film round a building)
  let p = ctx.peds.find(ok);
  if (!p && ctx.amb) {
    const off = ctx.amb.sc - ctx.sc;
    const q = ctx.amb.peds.find((a) => !a.busy && a.alive && Math.abs(a.g.position.x + off - cx) < xr && !S.jutNear(ctx, a.g.position.x + off) && (!filter || filter(a)));
    if (q) { rehome(q, ctx); p = q; }
  }
  if (!p) p = fromCrowd(ctx, cx, xr, ok);
  if (p) { p.busy = true; p.keep = true; }
  return p || null;
}

/**
 * Everything a set piece spawns, adds, borrows or runs is registered here, so one `free()` in a `finally`
 * cleans up on every exit path (finished, cancelled half-way, early return).
 */
function rig(ctx) {
  const { L, rnd } = ctx;
  const actors = new Set(), objs = new Set(), peds = new Set(), tasks = new Set(), keep = new Set(), guards = new Set();
  let closed = false, policeClosed = false, cops = 0;
  const R = {
    spawn(a, x, z, y) { ctx.spawn(a, x, z, y); actors.add(a); return a; },
    /**
     * Bring someone on stage; returns when they stand at (x, z). Nothing appears in view: out of view (or unwatched) they just
     * stand there, in view they come in from a door, from out of the frame or from behind a stall (see enterTo). `o`: { speed,
     * from: 'edge' | 'door' | 'auto', dir (the way they travel on arrival; cars!), now, exact, ignore }.
     */
    *enter(a, x, z, y, o) { yield* enterTo(ctx, a, x, z, y, o, (q, px, pz, py) => R.spawn(q, px, pz, py)); },
    /** Take someone off stage: they walk (drive) on until out of the frame, then go (see exitOut). `o`: { speed, now, edge }. */
    *out(a, o) { if (a.alive) yield* exitOut(ctx, a, o); actors.delete(a); },
    *leave(a, speed, toX) { yield* leave(ctx, a, speed, toX); actors.delete(a); },
    /** walk a few metres in one direction, then on out of the frame (a short exit that does not need the street edge) */
    *away(a, dx, speed = 3.6) { if (!a.alive) return; yield* walkOff(ctx, a, clamp(a.g.position.x + dx, EX0, EX1), speed); yield* R.out(a, { speed }); },
    gone(a) { if (a.alive) ctx.despawn(a); actors.delete(a); },
    add(o) { ctx.world.add(o); objs.add(o); return o; },
    /** a real door or window (doorway/windowAt) the script opens: shut when the script ends (waits for those still walking through it) or is cancelled */
    guard(d) { if (d) guards.add(d); return d; },
    rm(o) { if (objs.delete(o)) ctx.world.remove(o); },
    /** survives a normal finish (lasting damage such as a tag); still removed if the script is cancelled */
    stay(o) { keep.add(o); },
    borrow(p) { peds.add(p); return p; },
    give(p) { if (peds.delete(p)) { tidy(p); release(ctx, p); } },
    run(g) { const t = ctx.run(g); if (!t.done) tasks.add(t); return t; },
    stop(t) { ctx.runner.stop(t); tasks.delete(t); },
    *settle(max = 10) { yield* waitUntil(() => { for (const t of tasks) if (!t.done) return false; return true; }, max); },
    *close() { if (!closed) { closed = true; ctx.road.closed++; } yield* waitUntil(() => ctx.road.vehicles.size === 0, 6); S.refreshCrowd(ctx); /* (the traffic that waited is gone: look again) */ },
    open() { if (closed) { closed = false; policeClosed = false; ctx.road.closed = Math.max(0, ctx.road.closed - 1); } },
    /** A police car crosses. It closes the road to ambient traffic first, unless someone else holds it (then it skips). */
    *police(fromDir, z, speed = 11, delay = 0) {
      yield* wait(delay);
      if (L.kind === 'ped' || !S.roadHere(ctx, z)) return;
      if (!closed && ctx.road.closed > 0) return;
      if (!closed) { policeClosed = true; yield* R.close(); }
      cops++;
      try {
        // the line it drives: the one asked for, or a free one (no free line, no police car)
        const x0 = fromDir > 0 ? X0 + 2.5 : X1 - 2.5, x1 = fromDir > 0 ? X1 - 2.5 : X0 + 2.5;
        const lz = S.laneClear(ctx, z, Math.min(x0, x1), Math.max(x0, x1)) ? z : S.laneFor(ctx, fromDir, Math.min(x0, x1), Math.max(x0, x1));
        if (lz == null) return;
        const car = makeCar(rnd, 'police', L.night);
        car.siren = true;
        ctx.sfx('siren', 3); // heard before it is seen
        if (watching(ctx)) yield* wait(0.9);
        yield* R.enter(car, x0, lz, 0, { dir: fromDir });
        car.face(fromDir > 0 ? E : W);
        say(ctx, car, 'WEE-OO!', { color: '#7db8ff', size: 16 });
        yield* go(ctx, car, x1, lz, speed);
        yield* R.out(car, { speed });
      } finally {
        cops--;
        if (policeClosed && cops === 0) { policeClosed = false; R.open(); }
      }
    },
    /** Walkers near x run for it (like panic(), but tracked so a cancelled gag still tidies them up). */
    panic(x, r = 14, n = 5) {
      for (let i = 0; i < n; i++) {
        const p = takePed(ctx, r, null, x);
        if (!p) break;
        unped(ctx, p);
        peds.add(p);
        R.run((function* () {
          p.arms = 'up';
          if (rnd.chance(0.4)) say(ctx, p, rnd.pick(['AAAH!', 'HELP!', 'OEI!', 'WEG HIER!']), { size: 13, color: '#fff' });
          yield* walkOff(ctx, p, p.g.position.x < x ? EX0 : EX1, 7.5, p.lineZ);
          yield* R.out(p);
        })());
      }
    },
    *cop(target, speed = 5.6, delay = 0.6, line = null) {
      yield* wait(delay);
      if (!target.alive) return;
      const cop = makePerson(rnd, { kind: 'cop' }), fromLeft = target.heading > 0;
      ctx.sfx('whistle'); // heard first, then he runs in from out of the frame
      yield* R.enter(cop, fromLeft ? EX0 : EX1, target.g.position.z, undefined, { dir: fromLeft ? 1 : -1, speed });
      say(ctx, cop, line || rnd.pick(['HALT!', 'STOP!', 'POLITIE!', 'STA STIL!']), { color: '#7db8ff', size: 15 });
      yield* chase(ctx, cop, target, speed, 0.8, 14);
      yield* R.leave(cop, speed, fromLeft ? EX1 : EX0);
    },
    free(done = false) {
      for (const t of tasks) ctx.runner.stop(t);
      tasks.clear();
      for (const o of objs) if (!(done && keep.has(o))) ctx.world.remove(o);
      objs.clear();
      for (const g of guards) {
        if (done) ctx.run((function* () { yield* waitUntil(() => g.users === 0, 25); if (g.users > 0) { g.force(); return; } yield* waitUntil(() => g.angle <= 0.002, 3); })());
        else g.force();
      }
      guards.clear();
      // a normal finish never takes anybody off in view: whoever is still standing there walks (drives) off on their own
      for (const a of actors) {
        if (!a.alive) continue;
        if (done && watching(ctx) && seen(ctx, a.g.position.x, a.g.position.z, 1) && !a.fly) {
          if (!a.vehicle && a.g.position.y < 0.6) { a.pose = null; a.air = false; a.g.position.y = 0; a.g.rotation.x = 0; a.g.rotation.z = 0; } // (not left sitting, or standing on air, when it walks off)
          ctx.run(exitOut(ctx, a));
        } else ctx.despawn(a);
      }
      actors.clear();
      for (const p of peds) if (p.alive) { tidy(p); release(ctx, p); }
      peds.clear();
      R.open();
      if (ctx.wanted && !ctx.wanted.alive) ctx.wanted = null;
    },
  };
  return R;
}

/**
 * The kind of an INVENTED extra (a bystander the toolkit makes up instead of borrowing from the crowd): 'niffo' or 'harry'
 * with a chance that follows the district (`ctx.district.pop[id]` is the share per 100 of the crowd, as in districts.js;
 * each is capped at a half and ignored below 4 in 100), otherwise 'civ'. Missing district or pop = always 'civ'. Uses ctx.rnd.
 */
function extraKind(ctx) {
  const pop = ctx.district && ctx.district.pop;
  if (!pop) return 'civ';
  const share = (id) => { const d = +pop[id] / 100; return d >= 0.04 ? Math.min(0.5, d) : 0; };
  const pn = share('niffo'), ph = share('harry');
  if (pn + ph <= 0) return 'civ';
  const r = ctx.rnd();
  return r < pn ? 'niffo' : r < pn + ph ? 'harry' : 'civ';
}

/** Borrow up to n walkers near x to watch. */
function gather(ctx, R, x, n, xr = 14) {
  const out = [];
  for (let i = 0; i < n; i++) { const p = takePed(ctx, xr, null, x); if (!p) break; out.push(R.borrow(p)); }
  return out;
}
const filmIt = (p, tx, tz) => { faceTo(p, tx, tz); p.hold(item.phone()); p.arms = 'hold'; };

// ---------------------------------------------------------------- module: somebody who lives or sits here
/**
 * "Somebody notices, and later turns up in person." Variants say what they need at this spot; the first whose needs
 * are met is played, and the surroundings decide the order (houses: the balcony first; shops: the shopkeeper first;
 * park, square, beach...: the bench first). `passerby` needs nothing and is always possible.
 *   balcony   a real house front with a first-floor window within 9 m   the window opens (dark room), she leans out over the sill; comes out of the door later
 *   shop      a real shop door within 10 m                          the shop's own door opens and the shopkeeper steps out of it
 *   bench     a free bench within 9 m                               the person already sitting there (set there out of view, or walked to it) jumps up
 *   door      a real house or shop door within 12 m (no notice)     somebody comes out of the door
 *   passerby  nothing                                               a walker from the crowd (or a new one) stops and shouts
 * Generators: notice(line), calm(line), rush(line, to(), { speed, size }), home(). `owner` is who notices, `second`
 * who rushes in later (the same person for a passer-by). o.at = { x, z } is the thing being looked at, o.allow the variants.
 * Extra fields: `doorway` (the real door of the house or shop, a doorway() you can open yourself) and `window` (once the window variant has opened).
 */
const PREF = { balcony: ['houses'], shop: ['shops'], bench: ['park', 'square', 'beach', 'water', 'open'], door: ['houses', 'shops'], passerby: [] };
function resident(ctx, R, x, look, o = {}) {
  const { rnd } = ctx, allow = o.allow || ['balcony', 'shop', 'bench', 'passerby'];
  const far = S.surroundings(ctx).far;
  const fits = {
    // a real house front with a first-floor window that opens (and a real door to come down to)
    balcony: () => { const h = S.housesNear(ctx, x, 9, { tower: false }).find((q) => q.sash && q.leaf && Math.abs(q.door.x - x) <= 16); return h ? { h } : null; },
    shop: () => { const h = S.housesNear(ctx, x, 10, { door: true, shop: true, tower: false }).find((q) => q.leaf); return h ? { h } : null; },
    bench: () => { const b = S.benchNear(ctx, x, 9); return b ? { b } : null; },
    door: () => { const h = S.housesNear(ctx, x, 12, { door: true, tower: false }).find((q) => q.leaf); return h ? { h } : null; },
    passerby: () => ({}),
  };
  const order = allow.slice().sort((p, q) => (PREF[p].includes(far) ? 0 : 1) - (PREF[q].includes(far) ? 0 : 1));
  let kind = 'passerby', spec = {};
  for (const k of order) { const f = fits[k](); if (f) { kind = k; spec = f; break; } }
  const person = (chef) => makePerson(rnd, chef ? { kind: 'chef' } : kind === 'passerby' && !(look && look.kind) ? { ...look, kind: extraKind(ctx) } : look || {});
  const tgt = o.at || { x, z: padZ(ctx, 'walkB0', x) };
  const res = { kind, spec, owner: person(kind === 'shop'), second: null, borrowed: false, cleanup() {} };
  res.second = kind === 'passerby' ? res.owner : person(kind === 'shop');
  const door = spec.h ? spec.h.door : null;
  let win = null, acquired = false, seated = kind !== 'bench';
  if (kind === 'bench') { spec.b.taken = true; res.cleanup = () => { spec.b.taken = false; }; }
  /** the door of the house (a shop's own door too): the real one, with its leaf, bell and dark doorway */
  res.doorway = spec.h ? doorway(ctx, R, spec.h) : null;
  res.window = null;

  // the person on the bench is sitting there from the start: put there while the bench is out of view, or walked to it from out of the frame
  if (kind === 'bench') {
    const a = res.owner, b = spec.b, sit = () => { a.air = true; a.pose = 'sit'; a.heading = 0; a.g.position.set(b.x, 0.32, b.z + 0.12); };
    if (!watching(ctx) || !seen(ctx, b.x, b.z, 1)) { R.spawn(a, b.x, b.z + 0.12, 0.32); sit(); seated = true; }
    else {
      R.run((function* () {
        yield* R.enter(a, b.x, b.z + 0.9);
        a.heading = 0;
        a.pose = 'sit'; a.air = true; // (turns round and lowers itself onto the seat)
        const p = a.g.position, z0 = p.z;
        yield* tween(0.5, (u) => { p.z = lerp(z0, b.z + 0.12, u); p.y = 0.32 * u; });
        sit();
        seated = true;
      })());
    }
  }

  /** passer-by: borrow a walker nearby, or send a new one in along the pavement nearest the thing */
  const acquire = function* () {
    if (acquired) return;
    acquired = true;
    const p = takePed(ctx, 14, null, x);
    if (p) { R.borrow(p); res.owner = res.second = p; res.borrowed = true; return; }
    const a = res.owner, side = rnd.sign(), sx = clamp(x + side * 6, EX0, EX1), nm = tgt.z < 0 ? 'walkB0' : 'walkF0';
    yield* R.enter(a, sx, padZ(ctx, nm, sx));
    const to = spotNear(ctx, x + side * 2.6, padZ(ctx, nm, x + side * 2.6));
    yield* go(ctx, a, to.x, to.z, 3.4);
  };
  res.notice = function* (line) {
    yield* wait(0.6);
    if (kind === 'balcony') {
      // the first-floor window opens on a dark room and she leans out over the sill
      const a = res.owner;
      win = res.window = windowAt(ctx, R, spec.h);
      const q = win.inside;
      R.spawn(a, q.x, q.z, 0);
      win.pose(a, 0);
      a.offstage = true;
      yield* win.open();
      a.arms = 'fist';
      yield* tween(0.7, (u) => win.pose(a, u), ease.outQuad);
      a.offstage = false;
    } else if (kind === 'shop') {
      yield* R.enter(res.owner, door.x, door.z, 0.001); // (the shop's own door opens and the shopkeeper steps out of it)
      res.owner.heading = 0; res.owner.arms = 'fist';
    } else if (kind === 'bench') {
      const a = res.owner, b = spec.b;
      yield* waitUntil(() => seated, 14);
      yield* wait(0.35);
      a.pose = null; a.air = false; a.g.position.set(b.x, 0, b.z + 0.8);
      a.arms = 'fist';
      ctx.sfx('boing');
      yield* hop(a, 0.4, 0.25);
    } else {
      yield* acquire();
      faceTo(res.owner, tgt.x, tgt.z);
      res.owner.arms = 'fist';
      yield* hop(res.owner, 0.3, 0.24);
    }
    yell(ctx, res.owner, line, '#ff6b6b', o.size || 15);
  };
  res.calm = function* (line) {
    const a = res.owner;
    say(ctx, a, line, { size: 12, color: '#cfe8ff' });
    a.arms = 'swing';
    yield* wait(0.5);
    if (kind === 'passerby') return;
    if (win) { // back in over the sill, and the window shuts
      yield* win.retreat(a);
      R.gone(a);
      yield* win.close();
      win = null;
      return;
    }
    yield* R.out(a);
  };
  res.rush = function* (line, to, ro = {}) {
    if (kind === 'passerby') yield* acquire();
    else if (kind === 'bench') yield* R.enter(res.second, spec.b.x, spec.b.z + 0.9);
    else yield* R.enter(res.second, door.x, door.z, 0.001);
    const b = res.second;
    b.arms = 'up';
    yell(ctx, b, line, '#ff6b6b', ro.size || 17);
    const t = to();
    yield* goEach(ctx, b, t.x, t.z, ro.speed || 6.2);
    b.arms = 'swing';
  };
  res.home = function* () {
    const a = res.second;
    if (!a || !a.alive) return;
    if (kind === 'passerby') {
      if (res.borrowed) { R.give(a); return; }
      yield* R.away(a, (a.g.position.x < x ? -1 : 1) * 6, 3.6);
      return;
    }
    const h = kind === 'bench' ? { x: spec.b.x, z: spec.b.z + 0.9 } : door;
    yield* go(ctx, a, h.x, h.z, 4.5);
    yield* R.out(a);
  };
  return res;
}

function* lookAround(a, amp = 1.1, beat = 0.4) {
  const h = a.heading;
  a.heading = h + amp; yield* wait(beat);
  a.heading = h - amp; yield* wait(beat * 1.2);
  a.heading = h; yield* wait(beat * 0.5);
}
function* doubleTake(ctx, a, str = '?!') {
  const h = a.heading;
  a.heading = h + 0.9; yield* wait(0.16);
  a.heading = h - 0.9; yield* wait(0.16);
  a.heading = h;
  ctx.sfx('boing');
  say(ctx, a, str, { size: 20, color: '#fff' });
  yield* hop(a, 0.3, 0.24);
}
/** Move a world prop along a parabola. */
function* arc(o, x, y, z, h = 1, dur = 0.6, spin = 0) {
  const a = o.position.x, b = o.position.y, c = o.position.z, r0 = o.rotation.y;
  yield* tween(dur, (t) => {
    o.position.set(lerp(a, x, t), lerp(b, y, t) + Math.sin(t * Math.PI) * h, lerp(c, z, t));
    if (spin) o.rotation.y = r0 + spin * t;
  });
}
/** go() with a per-frame callback (return true to stop). Goes round standing things like go does (`o` as in go). */
function* goEach(ctx, a, x, z, speed, each, o = null) {
  if (isCar(a)) { yield* leg(ctx, a, x, z, speed, 0.06, each); return; } // (a car on a script of its own: use drive)
  const pts = walkRoute(ctx, a, x, z, o);
  if (!pts) { yield* leg(ctx, a, x, z, speed, 0.06, each); return; }
  if (!pts.length) { yield; return; }
  yield* followRoute(ctx, a, pts, speed, 0.06, each);
}
/** A person riding a bike that is a separate actor: the rider is parked on the saddle every frame. */
// (saddle top 1.05 m at 0.30 m behind the bike's centre; hip sits 0.05 m above it, see makeBike)
// (a vehicle may carry its own `seatY` / `seatBack`, e.g. the fat-bike)
const seat = (bike, rider, y = bike.seatY ?? 0.52) => {
  const b = bike.g.position, h = bike.g.rotation.y, back = bike.seatBack ?? 0.28;
  rider.g.position.set(b.x - Math.sin(h) * back, b.y + y, b.z - Math.cos(h) * back);
  rider.heading = h;
  rider.g.rotation.z = bike.g.rotation.z; // lean into the bend together
};
function* rideTo(ctx, bike, rider, x, z, speed, each, y = bike.seatY ?? 0.52) {
  for (;;) {
    const p = bike.g.position, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d <= 0.06) return;
    const dt = yield;
    const s = Math.min(d, speed * dt);
    p.x += (dx / d) * s; p.z += (dz / d) * s; p.y = 0;
    bike.heading = Math.atan2(dx, dz);
    bike.moving = speed;
    seat(bike, rider, y);
    if (each && each(dt, s) === true) return;
  }
}
const mount = (bike, rider, y = bike.seatY ?? 0.52) => { rider.air = true; rider.pose = 'ride'; rider.arms = 'swing'; rider.g.rotation.order = 'YXZ'; seat(bike, rider, y); };
const dismount = (rider, x, z) => { rider.pose = null; rider.air = false; rider.g.position.set(x, 0, z); };
/**
 * An electric fat-bike with a rider (and a passenger if `o.passenger`, true or an actor) already on it, spawned through the rig at (x, z).
 * Returns { bike, rider, passenger }; the riders are part of the bike (`go`/`drive`/`rideTo`-style movement moves them), the rig cleans it all up.
 * The rider is a niffo (or the district's extra kind). Facing +x until you `bike.face(...)`.
 */
function fatbike(ctx, R, x, z, o = {}) {
  const { rnd } = ctx, mk = () => makePerson(rnd, { kind: rnd.chance(0.65) ? 'niffo' : extraKind(ctx) });
  const rider = mk(), passenger = o.passenger ? (o.passenger === true ? mk() : o.passenger) : null;
  const bike = makeFatbike(rnd, passenger ? [rider, passenger] : [rider]);
  // in view it comes from out of the frame (the nearest edge, or `o.from` = -1 / +1) and rides to (x, z) when you `yield* arrive()`; out of view it simply stands there
  let sx = x, face = E;
  if (watching(ctx) && seen(ctx, x, z, 0.8)) {
    const side = o.from || (x <= 0 ? -1 : 1), q = outPoint(ctx, x, z, side, 6, 0.8);
    sx = q.x; face = side < 0 ? E : W;
  }
  R.spawn(bike, sx, z, 0);
  bike.face(face);
  const arrive = function* () { if (Math.abs(sx - x) > 0.3) yield* go(ctx, bike, x, z, o.speed || 7, 0.1); bike.face(face); };
  return { bike, rider, passenger, arrive };
}
/** A thin glowing line between two street-space points: `aim(ax, ay, az, bx, by, bz)`. */
function lineObj(R, col = '#e8f7ff', w = 0.045) {
  const o = R.add(sculpt((v) => v.box(0.5, 0, 0, 1, w, w, col), MAT.glow));
  o.rotation.order = 'YZX';
  o.position.set(0, 0.5, 0);
  o.visible = false;
  o.aim = (ax, ay, az, bx, by, bz) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, h = Math.hypot(dx, dz);
    o.position.set(ax, ay, az);
    o.scale.x = Math.max(0.01, Math.hypot(h, dy));
    o.rotation.y = -Math.atan2(dz, dx);
    o.rotation.z = Math.atan2(dy, h);
  };
  return o;
}
/** A short chain that trails behind an anchor point and drags along the ground. */
function chainObj(R, n = 6) {
  const segs = [];
  for (let i = 0; i < n; i++) { const s = R.add(sculpt((v) => v.box(0, 0, 0, 0.13, 0.1, 0.13, '#aeb7bd'))); s.position.set(0, 0.4, 0); segs.push(s); }
  return {
    segs,
    tail: segs[n - 1],
    place(x, y, z) { for (const s of segs) s.position.set(x, y, z); },
    update(ax, ay, az) {
      let px = ax, py = ay, pz = az;
      for (const s of segs) {
        const q = s.position, dx = q.x - px, dz = q.z - pz, d = Math.hypot(dx, dz);
        if (d > 0.2) { q.x = px + (dx / d) * 0.2; q.z = pz + (dz / d) * 0.2; }
        q.y = Math.max(0.07, py - 0.07);
        px = q.x; py = q.y; pz = q.z;
      }
    },
  };
}
/** Shrink a prop to nothing, then remove it. */
function* vanish(R, o, dur = 0.3) {
  const s = o.scale.x;
  yield* tween(dur, (t) => o.scale.setScalar(Math.max(0.001, s * (1 - t))), ease.inQuad);
  R.rm(o);
}
/** Little loot boxes in assorted colours. */
const lootBox = (i) => sculpt((v) => {
  const c = ['#e63946', '#ffd166', '#06d6a0', '#4cc9f0', '#b5179e', '#f4a261'][i % 6];
  v.box(0, 0, 0, 0.5 - (i % 3) * 0.06, 0.28, 0.4, c);
  v.box(0, 0.28, 0, 0.1, 0.06, 0.1, '#ffffff');
});

// ---------------------------------------------------------------- acting: faces, laughter, weight
/** A storyboard beat: B('2 the grab', [thief, bag]) names what happens now and who must be seen (the dev audit measures it). */
const beatsFor = (ctx, name) => (label, subs) => { if (ctx.beat) ctx.beat(name, label, subs); };
/**
 * Laugh out loud for `dur` seconds: the body shakes, the head goes back, the mouth is wide open and HA HA HA pops
 * out. kind 'ha' = a belly laugh, 'he' = a villain's snigger. Works while running too (the legs keep going).
 */
function* laugh(ctx, a, dur = 1.4, kind = 'ha') {
  const arms0 = a.arms, still = arms0 === 'swing';
  a.laughT = dur;
  if (still && !a.held) a.arms = 'laugh';
  ctx.sfx(kind === 'he' ? 'snigger' : 'laugh');
  const w = kind === 'he' ? 'HE' : 'HA';
  let t = 0, i = 0;
  while (t < dur && a.alive) {
    if (t >= i * 0.3 && i < 6) { say(ctx, a, i % 3 === 2 ? w + '!' : w, { size: 13 + (i % 3) * 2, color: kind === 'he' ? '#b9fbc0' : '#fff3b0', dur: 0.75, rot: i % 2 ? 14 : -14, rise: 1.8 }); i++; }
    t += yield;
  }
  if (a.arms === 'laugh') a.arms = arms0;
}
/** laugh() without waiting for it. */
const cackle = (ctx, a, dur = 1.6, kind = 'ha') => ctx.run(laugh(ctx, a, dur, kind));
/** A jump with weight: crouch, leap along an arc to (x, z), land with a squash and a puff of dust. */
function* leap(ctx, a, x, z, h = 0.9, dur = 0.45, y1 = 0) {
  const p = a.g.position, x0 = p.x, y0 = p.y, z0 = p.z, wasAir = a.air;
  a.air = true;
  a.squash(0.22);
  yield* wait(0.12);
  a.heading = Math.abs(x - x0) + Math.abs(z - z0) > 0.05 ? Math.atan2(x - x0, z - z0) : a.heading;
  yield* tween(dur, (t) => { p.x = lerp(x0, x, t); p.z = lerp(z0, z, t); p.y = lerp(y0, y1, t) + Math.sin(t * Math.PI) * h; });
  p.y = y1;
  a.air = y1 > 0.01 ? true : wasAir && y1 > 0.01;
  a.squash(0.3);
  ctx.sfx('thud');
  ctx.fx.dust(p.x, y1, p.z, 0, 0, 5);
}
/** Knocked off their feet: spin through the air to (x, z) and end up sitting, seeing stars. Follow with getUp(). */
function* tumble(ctx, a, x, z, h = 1.1, dur = 0.6) {
  const p = a.g.position, x0 = p.x, z0 = p.z, r0 = a.g.rotation.x;
  a.air = true; a.arms = 'up'; a.mood = 'shock';
  yield* tween(dur, (t) => { p.x = lerp(x0, x, t); p.z = lerp(z0, z, t); p.y = Math.sin(t * Math.PI) * h; a.g.rotation.x = r0 + t * TAU; });
  a.g.rotation.x = 0;
  a.pose = 'sit'; p.y = 0.23; a.arms = 'swing'; a.mood = 'dizzy';
  a.squash(0.3);
  ctx.sfx('thud');
  ctx.fx.dust(p.x, 0, p.z, 0, 0, 6);
  ctx.fx.pips(p.x, 1.6, p.z, 5);
}
function* getUp(a, mood = 'neutral') {
  a.squash(0.15);
  yield* wait(0.2);
  a.pose = null; a.air = false; a.g.position.y = 0; a.mood = mood;
}
/** Stars circle the head for a while (after a knock). */
function* seeStars(ctx, a, dur = 1.6) {
  let t = 0, n = 0;
  a.mood = 'dizzy';
  while (t < dur && a.alive) { if (t > n * 0.35) { n++; const p = a.g.position; ctx.fx.pips(p.x, p.y + 1.75, p.z, 3); } t += yield; }
}
/** A start of fright: jump, eyes wide, a spray of sweat. */
function* fright(ctx, a, str = '!') {
  a.emote('shock', 1.4);
  ctx.sfx('gasp');
  const p = a.g.position;
  ctx.fx.pips(p.x, p.y + 1.9, p.z, 4, ['#bfe9fb', '#ffffff'], 0.09);
  if (str) say(ctx, a, str, { size: 20, color: '#fff' });
  a.squash(0.12);
  yield* hop(a, 0.35, 0.26);
}
/** Creep along on tiptoe, stopping half-way to look over both shoulders. */
function* tiptoe(ctx, a, x, z, speed = 2.6, peek = true) {
  const g0 = a.gait, a0 = a.arms, p = a.g.position;
  a.gait = 'sneak'; a.arms = 'sneak'; a.mood = 'sly';
  if (peek) {
    yield* go(ctx, a, (p.x + x) / 2, (p.z + z) / 2, speed);
    yield* lookAround(a, 1.2, 0.3);
  }
  yield* go(ctx, a, x, z, speed);
  a.gait = g0; a.arms = a0;
}
/** Sling a bag over the right shoulder (the arm goes up to hold it). */
const shoulder = (a, bag) => { a.hold(bag, 'shoulder'); a.arms = 'bag'; return bag; };
/** While this runs, banknotes flutter out of the bag someone is running with (stop it with R.stop). */
function* noteTrail(ctx, a, every = 0.22) {
  for (;;) {
    yield* wait(every);
    if (!a.alive) return;
    const p = a.g.position, h = a.g.rotation.y;
    if (a.vel > 1) ctx.fx.cash(p.x - Math.sin(h) * 0.5, p.y + 1.5, p.z - Math.cos(h) * 0.5, 1, 1.6, 2.6);
  }
}
/** While this runs, a runner kicks up dust at every other stride. */
function* runDust(ctx, a, every = 0.16) {
  for (;;) {
    yield* wait(every);
    if (!a.alive) return;
    const p = a.g.position, h = a.g.rotation.y;
    if (a.vel > 4 && p.y < 0.05) ctx.fx.dust(p.x - Math.sin(h) * 0.3, 0, p.z - Math.cos(h) * 0.3, -Math.sin(h) * 1.5, -Math.cos(h) * 1.5, 1);
  }
}
/** A coin flip that decides how a scene ends. Named, so the dev audit can force either ending (stage.force = { name: true }). */
const flip = (ctx, name, p = 0.5) => (ctx.force && name in ctx.force ? !!ctx.force[name] : ctx.rnd.chance(p));
/** Set a few faces at once: moods({ angry: [keeper], scared: [rob, mate] }). */
const moods = (m) => { for (const k in m) for (const a of [].concat(m[k])) if (a) a.mood = k; };

// ---------------------------------------------------------------- driving: lines, slides, smoke
/** Black tyre marks and smoke under the back wheels. Call it every frame while a car slides (drive() does it by itself). */
function skid(ctx, car, smoke = true) {
  const p = car.g.position, h = car.g.rotation.y, sn = Math.sin(h), cs = Math.cos(h), rear = -(car.len || 4) * 0.32, hw = (car.wid || 1.8) * 0.42;
  for (const sx of [-1, 1]) {
    const x = p.x + sn * rear + cs * sx * hw, z = p.z + cs * rear - sn * sx * hw;
    ctx.fx.mark(x, 0, z, h + (car.drift || 0), { w: 0.2, l: 0.55 });
    if (smoke && ctx.rnd() < 0.6) ctx.fx.dust(x, 0.05, z, -sn * 1.2, -cs * 1.2, 1, '#e9e9e9');
  }
}
/**
 * Drive a vehicle along a smooth line through street-space points [[x, z], ...] (the first point is where it is now).
 * `speed` is metres per second, or a function of progress 0..1 (brake into the bend, power out of it). The car rolls,
 * dives and squats on its springs by itself; where it corners hard it lays rubber and smoke. o.each(dt, u) runs every
 * frame; return true to stop early. o.drift (0..1) slides the tail out in the bends.
 */
function* drive(ctx, car, pts, speed = 12, o = {}) {
  let P = [[car.g.position.x, car.g.position.z], ...pts];
  if (!o.free && isCar(car) && ctx.id !== 'amb' && ctx.L && !car.air) {
    // a car keeps to the carriageway and half a car width off everything that stands: the line is bent round parked cars,
    // shelters and the like; where no line exists nothing moves and the caller gets false (o.free: true drives the line as given)
    const half = (car.wid || 1.85) / 2 + 0.12, b = S.bend(ctx, P, { half, off: Math.max(0, (car.len || 4.4) / 2 - half), ignore: o.ignore || car.ignore, road: o.road !== false });
    if (!b) return false;
    P = b;
  }
  const line = S.curve(P, 0.7); // Catmull-Rom through the points, sampled into a polyline with running length
  const len = [0];
  for (let i = 1; i < line.length; i++) len.push(len[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const total = len[len.length - 1];
  let s = 0, i = 0, lastH = car.g.rotation.y, skT = 0;
  car.turnRate = 14;
  while (s < total) {
    const dt = yield;
    const u = s / total, v = typeof speed === 'function' ? speed(u) : speed;
    s = Math.min(total, s + v * dt);
    while (i < line.length - 2 && len[i + 1] < s) i++;
    const k = (s - len[i]) / Math.max(1e-4, len[i + 1] - len[i]), a = line[i], b = line[i + 1];
    const p = car.g.position;
    p.x = lerp(a[0], b[0], k); p.z = lerp(a[1], b[1], k); p.y = 0;
    const h = Math.atan2(b[0] - a[0], b[1] - a[1]);
    let dh = h - lastH; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    lastH = h;
    car.heading = h;
    car.moving = v;
    const rate = dt > 0 ? dh / dt : 0;
    if (o.drift) car.drift = clamp(-rate * 0.35 * o.drift, -0.7, 0.7);
    skT -= dt;
    if (Math.abs(rate) * v > (o.grip ?? 10) && skT <= 0) { skid(ctx, car); skT = 0.035; if (!car._scr || car._scr < car.t - 0.8) { car._scr = car.t; ctx.sfx('screech'); } }
    if (o.each && o.each(dt, u) === true) break;
  }
  car.drift = 0; car.turnRate = 0;
  return true;
}
/**
 * Handbrake turn: the car swaps ends (turns by `turn` radians, default half a circle) while sliding on along its old
 * line for `slide` metres, leaning hard, laying rubber and smoke all the way round.
 */
function* handbrake(ctx, car, slide = 7, dur = 1.15, turn = Math.PI, side = 1) {
  const p = car.g.position, h0 = car.g.rotation.y, x0 = p.x, z0 = p.z, sn = Math.sin(h0), cs = Math.cos(h0);
  ctx.sfx('screech');
  car.turnRate = 30;
  let t = 0;
  while (t < dur) {
    const dt = yield;
    t += dt;
    const u = clamp(t / dur), e = ease.outCubic(u);
    p.x = x0 + sn * slide * e; p.z = z0 + cs * slide * e;
    car.heading = h0 + side * turn * ease.inOut(u);
    car.moving = 3 + 9 * (1 - u); // the wheels keep spinning
    car.lean = side * 0.2 * Math.sin(u * Math.PI);
    skid(ctx, car);
  }
  car.lean = 0; car.turnRate = 0;
  car.jolt(0.5, -side * 0.6);
}
/** A puff from the exhaust (pulling away, revving). */
function exhaust(ctx, car, n = 3) {
  const p = car.g.position, h = car.g.rotation.y, e = car.exhaust || { x: 0, y: 0.3, z: -2 };
  ctx.fx.smoke(p.x + Math.sin(h) * e.z + Math.cos(h) * e.x, e.y, p.z + Math.cos(h) * e.z - Math.sin(h) * e.x, n, ['#d6d6d6', '#bdbdbd', '#9a9a9a'], 0.28);
}

// ---------------------------------------------------------------- ambient life
// Walkers, bikes and cars belong to one street-long "ambient" context. A gag borrows a walker by
// re-homing them into its own 48 m window (same spot in the world, different x origin) and hands them back after.
function rehome(a, to) {
  const from = a.ctx;
  if (from === to) return;
  const p = a.g.position, sign = Math.sign(a.exitX - p.x) || a.dir || 1;
  unped(from, a);
  p.x += from.sc - to.sc;
  a.exitX = sign > 0 ? to.L.x1 - 0.5 : to.L.x0 + 0.5;
  a.ctx = to; a.g._ctx = to;
  to.peds.push(a);
}
/** Where the pavement is for this walker at x (their side of the street, their place across its width). */
const paveZ = (ctx, a, x) => (ctx.L.walkAt ? ctx.L.walkAt(a.side, a.wf ?? 0.5, ctx.sc + x) : a.side * (ctx.L.hw + ctx.L.bw + 1.2));
/**
 * Take a passer-by out of the city's crowd near x (in this spot's street space) who passes the test. The crowd
 * figure becomes a full actor on the spot, looking the same; those who fail the test go straight back.
 */
function fromCrowd(ctx, cx, xr, ok) {
  if (!ctx.crowdNear) return null;
  let tries = 0;
  for (const ag of ctx.crowdNear(cx, xr)) {
    if (tries++ >= 5) break;
    const p = ctx.promote(ag);
    if (!p) continue;
    ctx.peds.push(p);
    if (!ok || ok(p)) return p;
    unped(ctx, p);
    if (!ctx.demote(p)) ctx.despawn(p);
  }
  return null;
}
/** A new passer-by walking in from the edge of the spot (used when nobody suitable is around). */
function spawnPed(ctx, atX = null, opts = {}) {
  const { L, rnd } = ctx, ex0 = L.x0 + 0.5, ex1 = L.x1 - 0.5;
  const dir = opts.dir ?? rnd.sign();
  const kind = opts.kind || (rnd() < 0.12 ? 'kid' : extraKind(ctx)), ix = (l) => Math.floor(rnd() * l.length);
  // dressed from the crowd's wardrobe, so they can melt into the crowd afterwards looking the same
  const look = { shirt: ix(SHIRTS), pants: ix(PANTS), skin: ix(SKINS), hair: ix(HAIRS), kid: kind === 'kid' };
  const a = makePerson(rnd, { kind, shirt: SHIRTS[look.shirt], pants: PANTS[look.pants], skin: SKINS[look.skin], hair: HAIRS[look.hair], hat: 'none' });
  a.look = look; a.keep = !!opts.keep;
  a.dir = dir; a.exitX = dir > 0 ? ex1 : ex0;
  a.walkSpeed = rnd.range(1.35, 2.0); // a stroll, at life size
  let x = atX ?? (dir > 0 ? ex0 : ex1);
  if (opts.z != null) { a.lineZ = opts.z + rnd.range(-0.15, 0.15); a.fixedZ = true; a.side = a.lineZ >= 0 ? 1 : -1; }
  else { a.side = rnd.sign(); a.wf = rnd.range(0.15, 0.85); a.lineZ = paveZ(ctx, a, x); }
  // nobody appears in view: a walker the viewer can see starts from out of the frame and walks on
  if (watching(ctx) && seen(ctx, x, a.lineZ, 1)) { x = outPoint(ctx, x, a.lineZ, -dir, 2.5, 1).x; if (!opts.z) a.lineZ = paveZ(ctx, a, x); }
  ctx.spawn(a, x, a.lineZ);
  a.face(dir > 0 ? E : W);
  ctx.peds.push(a);
  ctx.run(stroll(a, true));
  return a;
}
function unped(ctx, a) {
  const list = (a.ctx || ctx).peds, i = list.indexOf(a);
  if (i >= 0) list.splice(i, 1);
}
/**
 * A passer-by the gags are done with (or have not picked yet) walks on along the pavement. Unless a gag has asked
 * for them to be kept, they join the city's crowd again as soon as there is pavement under their feet.
 */
function* stroll(a, keepSide = false) {
  if (!keepSide) { a.side = a.g.position.z >= 0 ? 1 : -1; a.wf ??= 0.5; }
  let tryT = 0.4, look = 0.3;
  while (!a.busy && a.alive) {
    const c = a.ctx, p = a.g.position, dx = a.exitX - p.x;
    if (Math.abs(dx) < 0.12) { unped(c, a); if (!c.demote || !c.demote(a)) yield* exitOut(c, a); return; }
    const dt = yield;
    if (a.busy || !a.alive) return;
    if (!a.keep && (tryT -= dt) <= 0) { tryT = 0.5; if (c.demote && c.demote(a)) { unped(c, a); return; } }
    const sp = a.walkSpeed, fwd = Math.sign(dx);
    if (!a.fixedZ) a.lineZ = paveZ(c, a, p.x);
    // a lamp post, a bin, a terrace table ahead: step round it (looked at twice a second, only on a spot, not the whole-street crowd)
    if (c.id !== 'amb' && (look -= dt) <= 0) {
      look = 0.5;
      const lz = a.lineZ + (a.sideOff || 0);
      if (S.hitsObst(c, p.x + fwd * 1.1, lz, 0.4, a.ignore)) {
        let pick = null;
        for (const off of [0.8, -0.8, 1.4, -1.4]) if (S.clearSpot(c, p.x + fwd * 1.1, a.lineZ + off, 0.35, { ground: 'open', ignore: a.ignore })) { pick = off; break; }
        if (pick != null) a.sideOff = pick;
      } else if (a.sideOff && !S.hitsObst(c, p.x + fwd * 1.1, a.lineZ, 0.4, a.ignore) && !S.hitsObst(c, p.x, a.lineZ, 0.5, a.ignore)) a.sideOff = 0;
    }
    const dz = a.lineZ + (a.sideOff || 0) - p.z;
    p.x += fwd * Math.min(Math.abs(dx), sp * dt);
    p.z += clamp(dz, -sp * 0.7 * dt, sp * 0.7 * dt);
    p.y = 0;
    a.heading = Math.atan2(fwd, clamp(dz, -1, 1) * 0.6);
    a.moving = sp;
  }
}
function release(ctx, a) {
  if (!a.alive) return;
  a.busy = false; a.keep = false; a.arms = 'swing'; a.gait = 'walk';
  if (ctx.amb) rehome(a, ctx.amb);
  ctx.run(stroll(a));
}
/** Borrow a pedestrian who still has some street ahead of them (one walks in if nobody is around). */
function* needPed(ctx, xr = 13, filter = null) {
  const ok = (p) => !p.busy && p.alive && Math.abs(p.g.position.x) < xr && Math.abs(p.exitX - p.g.position.x) > 8 && (!filter || filter(p));
  let p = ctx.peds.find(ok);
  if (!p && ctx.amb) {
    const off = ctx.amb.sc - ctx.sc;
    const q = ctx.amb.peds.find((a) => !a.busy && a.alive && Math.abs(a.g.position.x + off) < xr && (!filter || filter(a)));
    if (q) { rehome(q, ctx); p = q; }
  }
  if (!p) p = fromCrowd(ctx, 0, xr, ok);
  if (!p) {
    const np = spawnPed(ctx, null, { kind: extraKind(ctx), keep: true });
    // (an invented walker may start a good way beyond the frame: allow the time it takes to walk in)
    yield* waitUntil(() => ok(np) || !np.alive, 9 + Math.max(0, Math.abs(np.g.position.x) - xr) / Math.max(0.8, np.walkSpeed || 1.4));
    p = np.alive && !np.busy ? np : ctx.peds.find(ok);
    if (!p) np.keep = false;
  }
  if (p) { p.busy = true; p.keep = true; }
  return p || null;
}
function panic(ctx, x, r = 16) {
  if (ctx.amb) {
    const off = ctx.amb.sc - ctx.sc;
    for (const a of [...ctx.amb.peds]) if (!a.busy && a.alive && Math.abs(a.g.position.x + off - x) <= r) rehome(a, ctx);
  }
  // everyone in the crowd nearby runs for it too
  if (ctx.crowdNear) for (const ag of ctx.crowdNear(x, r).slice(0, 12)) { const p = ctx.promote(ag); if (p) ctx.peds.push(p); }
  for (const a of [...ctx.peds]) {
    if (a.busy || !a.alive || Math.abs(a.g.position.x - x) > r) continue;
    a.busy = true;
    unped(ctx, a);
    ctx.run((function* () {
      a.arms = 'up';
      if (ctx.rnd() < 0.4) say(ctx, a, ctx.rnd.pick(['AAAH!', 'HELP!', 'OEI!', 'WEG HIER!']), { size: 13, color: '#fff' });
      yield* walkOff(ctx, a, a.g.position.x < x ? EX0 : EX1, 7.5, a.lineZ);
      a.arms = 'swing';
      if (!ctx.demote || !ctx.demote(a)) yield* exitOut(ctx, a);
    })());
  }
}

function* boatSpawner(ctx) {
  const { L, rnd } = ctx;
  if (!L.canal) return;
  yield* wait(rnd.range(1, 5));
  for (;;) {
    const dir = rnd.sign(), boat = makeBoat(rnd);
    boat.air = true;
    const z = L.canal.z + (dir > 0 ? -0.9 : 0.9);
    yield* enter(ctx, boat, dir > 0 ? X0 + 2.4 : X1 - 2.4, z, L.canal.y, { dir, speed: 2.6 });
    boat.face(dir > 0 ? E : W);
    yield* go(ctx, boat, dir > 0 ? X1 - 2.4 : X0 + 2.4, z, 2.6);
    yield* exitOut(ctx, boat, { speed: 2.6 });
    yield* wait(rnd.range(5, 14));
  }
}
function* gullSpawner(ctx) {
  const { L, rnd } = ctx;
  for (;;) {
    yield* wait(L.strip === 'beach' ? rnd.range(1.5, 4) : rnd.range(6, 13));
    const g = makeBird(rnd, 'gull');
    g.fly = true;
    const dir = rnd.sign(), y = rnd.range(8, 12), z = rnd.range(L.zB, L.zF);
    // it comes in over the edge of the frame and leaves over the other one (never appears or vanishes in view)
    const x0 = outPoint(ctx, 0, z, -dir, 6, y).x, x1 = outPoint(ctx, 0, z, dir, 6, y).x;
    ctx.spawn(g, x0, z, y);
    g.face(dir > 0 ? E : W);
    if (rnd.chance(0.3)) ctx.sfx('squawk');
    ctx.run((function* () {
      yield* fly(g, x1, y + rnd.range(-2, 2), z + rnd.range(-5, 5), rnd.range(5, 8));
      ctx.despawn(g);
    })());
  }
}
function* pigeons(ctx) {
  const { L, rnd } = ctx;
  const birds = [];
  for (let i = 0; i < 3; i++) {
    const b = makeBird(rnd, 'pigeon'), px = rnd.range(-18, 18), q = spotNear(ctx, px, padZ(ctx, 'walkF0', px) - 0.4 + rnd.range(-0.2, 0.2), 0.3);
    birds.push(b);
    if (watching(ctx) && seen(ctx, q.x, q.z, 0.4)) {
      // in view: they flutter down from over the edge of the frame, one after the other
      ctx.run((function* () { yield* wait(0.6 + i * 1.1 + rnd.range(0, 0.5)); yield* landBird(ctx, b, q.x, q.z); })());
    } else {
      ctx.spawn(b, q.x, q.z);
      b.face(rnd.range(0, TAU));
    }
  }
  for (;;) {
    yield* wait(rnd.range(1.5, 4));
    const b = rnd.pick(birds);
    if (!b.alive || b.fly) continue;
    const nx = clamp(b.g.position.x + rnd.range(-2.5, 2.5), -21, 21), q = S.findSpot(ctx, nx, padZ(ctx, 'walkF0', nx) - 0.4 + rnd.range(-0.25, 0.25), 0.3, 4);
    if (q) yield* go(ctx, b, q.x, q.z, 1.6);
  }
}
/** A bird comes in over the edge of the frame at height and lands at (x, z) on the ground (unwatched: it is just there). */
function* landBird(ctx, b, x, z) {
  const rnd = ctx.rnd;
  b.fly = true;
  if (!watching(ctx) || !seen(ctx, x, z, 0.4)) { ctx.spawn(b, x, z); b.fly = false; b.face(rnd.range(0, TAU)); return; }
  const side = rnd.sign(), q = outPoint(ctx, x, z, side, 6, 8);
  ctx.spawn(b, q.x, z + rnd.range(-3, 3), 8 + rnd.range(0, 2));
  b.face(side < 0 ? E : W);
  yield* fly(b, x - side * 2.5, 2.2, z, 7.5);
  yield* fly(b, x, 0, z, 3.2);
  b.fly = false;
  b.face(rnd.range(0, TAU));
}
function* heli(ctx) {
  const { L, rnd } = ctx;
  const h = makeHeli();
  h.air = true;
  ctx.spawn(h, X0 - 10, L.zc, 16);
  let t = rnd.range(0, 9), chop = 0;
  const aim = new THREE.Vector3(0, 0, 0);
  for (;;) {
    const dt = yield;
    t += dt * 0.42;
    chop -= dt;
    if (chop < 0) { ctx.sfx('chop'); chop = 2.6; }
    const tx = Math.cos(t) * 17, tz = L.zc + Math.sin(t * 1.3) * 9;
    const p = h.g.position;
    h.heading = Math.atan2(tx - p.x, tz - p.z);
    p.x += (tx - p.x) * Math.min(1, dt * 1.2);
    p.z += (tz - p.z) * Math.min(1, dt * 1.2);
    const w = ctx.wanted && ctx.wanted.alive ? ctx.wanted.g.position : null;
    const gx = w ? w.x : Math.sin(t * 2.1) * 14, gz = w ? w.z : L.zc + Math.cos(t * 1.7) * 6;
    aim.x += (gx - aim.x) * Math.min(1, dt * 3);
    aim.z += (gz - aim.z) * Math.min(1, dt * 3);
    h.aim.copy(aim);
    h.moving = 1;
  }
}

function* closeRoad(ctx) {
  ctx.road.closed++;
  yield* waitUntil(() => ctx.road.vehicles.size === 0, 6);
}
const openRoad = (ctx) => { ctx.road.closed = Math.max(0, ctx.road.closed - 1); };

function* policeRun(ctx, fromDir, z, speed = 11, delay = 0) {
  yield* wait(delay);
  if (!S.roadHere(ctx, z)) return; // no road here: no police car
  const car = makeCar(ctx.rnd, 'police', ctx.L.night);
  car.siren = true;
  ctx.sfx('siren', 3);
  if (watching(ctx)) yield* wait(0.9);
  yield* enter(ctx, car, fromDir > 0 ? X0 + 2.5 : X1 - 2.5, z, 0, { dir: fromDir });
  car.face(fromDir > 0 ? E : W);
  say(ctx, car, 'WEE-OO!', { color: '#7db8ff', size: 16 });
  yield* go(ctx, car, fromDir > 0 ? X1 - 2.5 : X0 + 2.5, z, speed);
  yield* exitOut(ctx, car, { speed });
}
function* footCop(ctx, target, speed = 5.6, delay = 0.6) {
  yield* wait(delay);
  if (!target.alive) return;
  const cop = makePerson(ctx.rnd, { kind: 'cop' });
  const fromLeft = target.heading > 0; // chase from behind
  ctx.sfx('whistle');
  yield* enter(ctx, cop, fromLeft ? EX0 : EX1, target.g.position.z, undefined, { dir: fromLeft ? 1 : -1, speed });
  say(ctx, cop, ctx.rnd.pick(['HALT!', 'STOP!', 'POLITIE!', 'STA STIL!']), { color: '#7db8ff', size: 15 });
  yield* chase(ctx, cop, target, speed, 0.8, 14);
  yield* leave(ctx, cop, speed, fromLeft ? EX1 : EX0);
}

/** The set-piece toolkit, handed to the scenes in ./acts (they cannot import this file: it imports them). */
const T = {
  X0, X1, EX0, EX1, E, W, go, fly, chase, popIn, popOut, enter, exitOut, entryTime, seen, watching, outPoint,
  edgeOf, walkOff, leave, hop, say, at, camFor, pt, faceTo, yell, padZ, once,
  spotNear, padSpot, tidy, takePed, rig, gather, filmIt, resident, lookAround, doubleTake, arc, goEach,
  extraKind, fatbike, seat, rideTo, mount, dismount, lineObj, chainObj, vanish, lootBox, beatsFor, flip, laugh, cackle, leap,
  tumble, getUp, seeStars, fright, tiptoe, shoulder, noteTrail, runDust, moods, skid, drive, handbrake,
  exhaust, spawnPed, unped, stroll, release, needPed, panic, closeRoad, openRoad, policeRun, footCop, doorway, windowAt, doorHouse,
};
// ---------------------------------------------------------------- the gags
const G = {};

G.napCat = {
  w: [3, 2, 1, 0, 0], need: ['benches'],
  avail: (ctx) => ctx.L.benches.some((b) => !b.taken),
  *run(ctx) {
    const { L, rnd } = ctx, b = rnd.pick(L.benches.filter((q) => !q.taken)), cat = makeCat(rnd);
    cat.speed = 2.6;
    b.taken = true;
    try {
      const ex = rnd.chance(0.5) ? EX0 : EX1, nap = spotNear(ctx, b.x + 1.5, b.z + 0.5, 0.4);
      yield* enter(ctx, cat, ex, padZ(ctx, 'walkB0', ex));
      yield* go(ctx, cat, nap.x, nap.z);
      cat.pose = 'sleep';
      ctx.focus(b.x, b.z, 0.62, 4);
      ctx.news('Cat begins scheduled 16-hour nap');
      for (let i = 0; i < 5; i++) { say(ctx, cat, 'Z', { size: 13 + i * 3, color: '#cfe8ff', off: 0.7, rise: 1.8, dur: 1.5 }); ctx.sfx('zzz'); yield* wait(1.0); }
      cat.pose = null;
      yield* leave(ctx, cat);
    } finally { b.taken = false; }
  },
};

G.pigeonLady = {
  w: [3, 2, 1, 0.4, 0], need: ['benches'],
  avail: (ctx) => ctx.L.benches.some((b) => !b.taken),
  *run(ctx) {
    const { L, rnd } = ctx, b = rnd.pick(L.benches.filter((q) => !q.taken));
    b.taken = true;
    try { yield* pigeonLadyAt(ctx, b); } finally { b.taken = false; }
  },
};
function* pigeonLadyAt(ctx, b) {
  {
    const { L, rnd } = ctx;
    const gran = makePerson(rnd, { kind: 'granny' });
    gran.speed = 1.9;
    const ex = rnd.chance(0.5) ? EX0 : EX1;
    yield* enter(ctx, gran, ex, padZ(ctx, 'walkB0', ex));
    yield* go(ctx, gran, b.x, b.z + 0.7);
    // she turns and lowers herself onto the bench
    gran.air = true; gran.pose = 'sit'; gran.heading = 0;
    {
      const gp = gran.g.position, z0 = gp.z, y0 = gp.y, y1 = L.yAt(b.z) + 0.32;
      yield* tween(0.5, (u) => { gp.z = lerp(z0, b.z + 0.12, u); gp.y = lerp(y0, y1, u); });
    }
    ctx.news('Local oma feeds pigeons. Council "monitoring the situation"');
    ctx.focus(b.x, b.z + 1, 0.6, 5);
    const birds = [];
    for (let i = 0; i < 5; i++) {
      const p = makeBird(rnd, 'pigeon');
      birds.push(p);
      // they come down from over the edge of the frame, not out of thin air
      ctx.run((function* () {
        yield* wait(i * 0.4);
        yield* landBird(ctx, p, b.x + rnd.range(-1.8, 1.8), b.z + rnd.range(1.3, 2.4));
      })());
    }
    for (let i = 0; i < 6; i++) {
      gran.arms = i % 2 ? 'hold' : 'swing';
      ctx.fx.burst(b.x, 0.95, b.z + 0.8, { n: 4, colors: ['#e9c46a', '#d9b382'], speed: 2.5, up: 3, size: [0.05, 0.08], life: [0.5, 0.8] });
      yield* wait(1.0);
    }
    for (const p of birds) {
      if (!p.alive) { ctx.despawn(p); continue; }
      p.fly = true;
      p.heading = rnd.pick([E, W]);
      ctx.run(exitOut(ctx, p, { speed: 8, dir: Math.sign(Math.sin(p.heading)) }));
    }
    // she gets up and walks off
    gran.pose = null; gran.arms = 'swing';
    {
      const gp = gran.g.position, z0 = gp.z, y0 = gp.y;
      yield* tween(0.5, (u) => { gp.z = lerp(z0, b.z + 0.8, u); gp.y = lerp(y0, L.yAt(b.z), u); });
      gran.air = false;
    }
    yield* leave(ctx, gran);
  }
}

G.boredCop = {
  w: [3, 2, 1, 0, 0],
  avail: (ctx) => !!padSpot(ctx, 'walkF0', 0, 0.7, 12),
  *run(ctx) {
    const { L, rnd } = ctx, cop = makePerson(rnd, { kind: 'cop' });
    cop.speed = 1.8;
    const dir = rnd.sign();
    const stand = padSpot(ctx, 'walkF0', rnd.range(-6, 6), 0.7, 12);
    if (!stand) return;
    yield* enter(ctx, cop, dir > 0 ? EX0 : EX1, padZ(ctx, 'walkF0', dir > 0 ? EX0 : EX1));
    yield* go(ctx, cop, stand.x, stand.z);
    cop.heading = 0;
    cop.hold(item.wafel());
    cop.arms = 'hold';
    say(ctx, cop, 'NOM NOM', { size: 13, color: '#ffe08a' });
    ctx.focus(cop.g.position.x, cop.g.position.z, 0.62, 3.5);
    ctx.news('Police blotter: one (1) stroopwafel consumed');
    yield* wait(2.2);
    cop.drop(); cop.arms = 'swing';
    say(ctx, cop, '*geeuw*', { size: 13, color: '#cfe8ff' });
    ctx.sfx('zzz');
    yield* wait(1.6);
    yield* leave(ctx, cop, 1.8, dir > 0 ? EX1 : EX0);
  },
};

G.balloonKid = {
  w: [2, 2, 1, 0.4, 0],
  avail: (ctx) => !!padSpot(ctx, 'walkF1', 0, 0.7, 12),
  *run(ctx) {
    const { L, rnd } = ctx, kid = makePerson(rnd, { kind: 'kid' });
    const dir = rnd.sign(), stop = padSpot(ctx, 'walkF1', rnd.range(-5, 5), 0.7, 12);
    if (!stop) return;
    const bal = item.balloon(rnd.pick(['#ff4d6d', '#ffd60a', '#4cc9f0', '#b5179e']));
    kid.b.add(bal);
    bal.position.set(0.62, 0.8, 0);
    yield* enter(ctx, kid, dir > 0 ? EX0 : EX1, padZ(ctx, 'walkF1', dir > 0 ? EX0 : EX1));
    yield* go(ctx, kid, stop.x, stop.z, 2.4);
    // balloon escapes
    const wp = new THREE.Vector3();
    bal.getWorldPosition(wp);
    ctx.toLocal(wp);
    kid.b.remove(bal);
    ctx.world.add(bal);
    bal.position.copy(wp);
    bal.scale.setScalar(kid.scale);
    ctx.sfx('boing');
    kid.arms = 'up'; kid.heading = 0;
    say(ctx, kid, 'NEEEE!', { size: 16, color: '#ff8fab' });
    ctx.focus(kid.g.position.x, kid.g.position.z, 0.66, 3);
    ctx.news('Balloon escapes custody, last seen heading for Scheveningen');
    ctx.run((function* () {
      const x0 = bal.position.x;
      let t = 0;
      while (t < 16) { // it keeps rising until it has left the picture
        t += yield;
        bal.position.y = wp.y + t * 3.2; bal.position.x = x0 + Math.sin(t * 1.8) * 0.8 + t * 0.6;
        if (t > 2 && !seen(ctx, bal.position.x, bal.position.z, bal.position.y, 0)) break;
      }
      ctx.world.remove(bal);
    })());
    for (let i = 0; i < 3; i++) yield* hop(kid, 0.7, 0.35);
    yield* wait(0.5);
    kid.arms = 'swing';
    yield* leave(ctx, kid, 1.6, dir > 0 ? EX1 : EX0);
  },
};

G.seagullFries = ACTS.seagullFries(T);

G.doorbell = ACTS.doorbell(T);

G.parkingTicket = ACTS.parkingTicket(T);

G.herringHeist = ACTS.herringHeist(T);

G.bikeThief = ACTS.bikeThief(T);

G.graffiti = ACTS.graffiti(T);

G.pickpocket = ACTS.pickpocket(T);

G.burglar = ACTS.burglar(T);

G.shopHeist = ACTS.shopHeist(T);

G.scooterSnatch = ACTS.scooterSnatch(T);

G.fireworks = ACTS.fireworks(T);

G.carChase = ACTS.carChase(T);

G.bennyHill = ACTS.bennyHill(T);

G.plofkraak = ACTS.plofkraak(T);

// ---------------------------------------------------------------- gags for specific kinds of crime
G.carBreakIn = ACTS.carBreakIn(T);

G.fenderBender = ACTS.fenderBender(T);

G.scuffle = ACTS.scuffle(T);

G.shadyDeal = ACTS.shadyDeal(T);

G.phishing = ACTS.phishing(T);

// ---------------------------------------------------------------- which crimes drive which gags
// Police categories (table 47018NED) behind each gag. Categories that cannot be made funny have no gag.
const CATS = {
  carBreakIn: ['1.2.1'], fenderBender: ['1.3.1'], bikeThief: ['1.2.3'], pickpocket: ['1.2.4'], burglar: ['1.1.1', '1.1.2', '2.4.2'],
  shopHeist: ['2.5.2', '2.5.1'], scooterSnatch: ['1.4.6'], plofkraak: ['1.4.7', '1.6.1'], graffiti: ['2.2.1'],
  fireworks: ['2.6.9', '3.6.4'], carChase: ['3.5.2', '3.5.5', '1.2.2'], doorbell: ['2.4.1'],
  scuffle: ['1.4.5', '1.4.3', '1.4.4'], shadyDeal: ['3.1.1', '2.1.1'], phishing: ['3.9.1', '3.9.2', '3.9.3', '3.7.4', '1.6.2'],
};
export const THEMES = {
  carBreakIn: 'Theft from cars', fenderBender: 'Road accidents', bikeThief: 'Bike theft', pickpocket: 'Pickpocketing', burglar: 'Burglary',
  shopHeist: 'Shoplifting', scooterSnatch: 'Street robbery', plofkraak: 'Hold-ups & blasts', graffiti: 'Vandalism',
  fireworks: 'Fireworks & disorder', carChase: 'Reckless driving', doorbell: 'Neighbour rows',
  scuffle: 'Fights & threats', shadyDeal: 'Drugs', phishing: 'Fraud & scams',
};
/**
 * From a neighbourhood's registered crimes by category (`cat`) and the city totals (`cats`): each theme's share
 * here, how that compares with the city, and the factor that scales how often its gag plays.
 */
export function mixFor(cat, cats) {
  const out = { factor: {}, share: {}, rel: {}, n: {} };
  if (!cat || !cats) return out;
  const names = Object.keys(CATS);
  const here = (n) => CATS[n].reduce((t, k) => t + (cat[k] || 0), 0), city = (n) => CATS[n].reduce((t, k) => t + (cats[k]?.city || 0), 0);
  const tb = names.reduce((t, n) => t + here(n), 0), tc = names.reduce((t, n) => t + city(n), 0);
  for (const n of names) {
    const sb = tb ? here(n) / tb : 0, sc = tc ? city(n) / tc : 0, rel = sc ? sb / sc : 1;
    out.n[n] = here(n); out.share[n] = sb; out.rel[n] = rel;
    out.factor[n] = tb < 12 ? 1 : clamp(Math.pow(sb * names.length, 0.55) * Math.pow(rel, 0.6), 0.12, 4.5);
  }
  return out;
}
const weight = (ctx, n) => G[n].w[ctx.level - 1] * (ctx.mix?.factor?.[n] ?? 1);
/**
 * The free ground a scene needs when it does not say (`stage:` next to `w`, `crime`, `avail`; `stage: false` = none): a modest
 * clear patch of pavement, about 4 x 2 m, on either side. See S.findStage for the vocabulary.
 */
const DEFAULT_STAGE = { pave: { side: 'any', len: 4, depth: 2 } };
const stageOf = (n) => (G[n].stage === false ? null : G[n].stage || DEFAULT_STAGE);
/** Scenes playing on this spot right now keep their stage x (so a second one is not put on top of the first). */
const busyStages = (ctx) => (ctx._stages && ctx._stages.size ? [...ctx._stages] : null);
const ready = (ctx, n) => {
  const g = G[n];
  return (!g.need || g.need.every((k) => ctx.L[k] && ctx.L[k].length > 0)) && (!g.avail || g.avail(ctx)) && S.stageClear(ctx, stageOf(n), busyStages(ctx));
};
/** Run a scene with its stage placement handed over: `ctx.stage = { x, side, room, lane }` (read it before the first yield). */
function* runGag(ctx, n) {
  const g = G[n], st = S.findStage(ctx, stageOf(n), busyStages(ctx)), mark = st ? { x: st.x, r: 8 } : null;
  ctx.stage = st;
  if (mark) (ctx._stages ||= new Set()).add(mark);
  try { yield* g.run(ctx); } finally { if (mark) ctx._stages.delete(mark); }
}

// ---------------------------------------------------------------- the director
const PACE = { 1: { gap: [4, 7], max: 1 }, 2: { gap: [3.5, 6], max: 1 }, 3: { gap: [2.6, 4.6], max: 1 }, 4: { gap: [2, 3.6], max: 2 }, 5: { gap: [1.5, 2.8], max: 2 } };

// ---- which scene next: never the same twice in a row, and the usual suspects a little less usual
// The opening scene used to be the single heaviest one for the neighbourhood, every time: on most streets that was the
// phishing desk or the gulls (together about a third of all openings), and six scenes could never open a street.
// Now every choice is a weighted draw. The heaviest scene is still the likeliest, rarer ones get a real chance, and
// what the viewer saw last is remembered across spots, streets and reloads (for this browser tab).
/** Tuning. `gamma` > 1 favours the heavy scenes in the OPENING draw (1 = plain weights, large = the old "always the heaviest");
 * `floor` gives every available scene at least this share of the heaviest one's weight; `seen[i]` scales a scene shown
 * i + 1 scenes ago (0 = never straight after itself). scripts/scene-rates.mjs prints what a setting does to the shares. */
export const CASTING = { gamma: 2, floor: 0.25, seen: [0, 0.35, 0.6, 0.8] };
const SEEN_KEY = 'heibel-seen';
const SEEN = (() => {
  try { const a = JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(a) ? a.filter((n) => typeof n === 'string').slice(0, CASTING.seen.length) : []; } catch (e) { return []; }
})();
const PLAYING = new Map(); // scene -> how many spots play it right now: never the same scene on two spots at once
const noteSeen = (n) => {
  const i = SEEN.indexOf(n);
  if (i >= 0) SEEN.splice(i, 1);
  SEEN.unshift(n);
  SEEN.length = Math.min(SEEN.length, CASTING.seen.length);
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(SEEN)); } catch (e) { /* private mode */ }
};
// a street opened with ?seed= must replay the same way (tests); otherwise the casting dice are free, so the same street
// does not open with the same scene every visit
const SEEDED = !!(import.meta.env && import.meta.env.DEV) && typeof location !== 'undefined' && /[?&]seed=/.test(location.search); // (a dev-server switch: the built site ignores it)
/**
 * Draw one scene from `pool`. `weightOf(name)` is its weight here, `seen` the recent history (newest first), `dice` a
 * 0..1 random function. Returns null when the pool is empty. A scene seen last is only drawn when nothing else is left.
 */
export function castScene(pool, weightOf, seen, dice, opening = false, C = CASTING) {
  if (!pool.length) return null;
  const top = pool.reduce((m, n) => Math.max(m, weightOf(n)), 0);
  const score = (n, hist) => {
    let v = Math.max(weightOf(n), C.floor * top);
    if (opening) v = Math.pow(v, C.gamma);
    const i = hist ? seen.indexOf(n) : -1;
    return i >= 0 ? v * (C.seen[i] ?? 1) : v;
  };
  for (const hist of [true, false]) {
    const ws = pool.map((n) => score(n, hist)), sum = ws.reduce((t, v) => t + v, 0);
    if (!(sum > 0)) continue; // everything left was just seen: forget the history rather than play nothing
    let r = dice() * sum;
    for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  return pool[0];
}
/** For scripts/scene-rates.mjs: every scene's weights per level and whether it is a crime scene. */
export const sceneTable = () => Object.fromEntries(Object.keys(G).map((n) => [n, { w: G[n].w, crime: !!G[n].crime }]));

/** The opening scene: drawn from what this neighbourhood's figures point at (crime scenes first), heaviest likeliest. */
function signatureFor(ctx, dice) {
  const lv = ctx.level, names = Object.keys(G).filter((n) => G[n].w[lv - 1] > 0 && !PLAYING.get(n) && ready(ctx, n));
  if (!names.length) return null;
  const crime = names.filter((n) => G[n].crime), pool = lv > 1 && crime.length ? crime : names;
  return castScene(pool, (n) => weight(ctx, n), SEEN, dice, true);
}
function* director(ctx, delay = 2.4, signature = true) {
  const { rnd, level } = ctx, pace = PACE[level], locks = new Set(), dice = SEEDED ? rnd : Math.random;
  let active = 0;
  const recent = [];
  const launch = (name) => {
    const g = G[name];
    active++;
    if (g.lock) locks.add(g.lock);
    recent.push(name);
    if (recent.length > 3) recent.shift();
    noteSeen(name);
    PLAYING.set(name, (PLAYING.get(name) || 0) + 1);
    ctx.gagStart?.(name, { stage: G[name].stage || null });
    ctx.run((function* () {
      try { yield* runGag(ctx, name); } finally { active--; if (g.lock) locks.delete(g.lock); PLAYING.set(name, Math.max(0, (PLAYING.get(name) || 1) - 1)); ctx.gagEnd?.(name); }
    })());
  };
  yield* wait(delay);
  if (signature) { const sig = signatureFor(ctx, dice); if (sig) launch(sig); }
  for (;;) {
    yield* wait(rnd.range(pace.gap[0], pace.gap[1]));
    if (active >= pace.max) continue;
    if (ctx.cineBusy && ctx.cineBusy()) continue; // a set piece holds the camera here
    const opts = Object.keys(G).filter((n) => weight(ctx, n) > 0 && !recent.includes(n) && !PLAYING.get(n) && !(G[n].lock && locks.has(G[n].lock)) && ready(ctx, n));
    if (!opts.length) { recent.shift(); continue; }
    launch(castScene(opts, (n) => weight(ctx, n), SEEN, dice));
  }
}

/** Street-long background life. */
/** The road at one spot, as the gags see it: they close it, and wait until the city's traffic has cleared it. */
const roadOf = (ctx) => ({ closed: 0, vehicles: { get size() { return ctx.trafficNear ? ctx.trafficNear() : 0; }, add() {}, delete() {}, has: () => false } });
/** The street as a whole. Its walkers, bikes, cars and trams belong to the city's crowd (crowd.js), not to the street. */
export function startAmbient(ctx) {
  PLAYING.clear(); // a new street: whatever the last one was playing is gone
  ctx.peds = [];
  ctx.road = roadOf(ctx);
}
/** One spot on the street where gags play. `only` forces a single gag (debug). */
export function startLocale(ctx, { only = null, delay = 2.4, signature = true, withHeli = false } = {}) {
  ctx.peds = [];
  ctx.road = roadOf(ctx);
  ctx.wanted = null;
  ctx.run(boatSpawner(ctx));
  ctx.run(gullSpawner(ctx));
  ctx.run(pigeons(ctx));
  if (withHeli) ctx.run(heli(ctx));
  if (only && Object.hasOwn(G, only)) {
    ctx.run((function* () {
      for (;;) {
        yield* wait(2);
        if (ready(ctx, only)) { ctx.gagStart?.(only, { stage: G[only].stage || null }); try { yield* runGag(ctx, only); } finally { ctx.gagEnd?.(only); } }
        yield* wait(2);
      }
    })());
  } else ctx.run(director(ctx, delay, signature));
}
export const GAG_NAMES = Object.keys(G);
export const canPlay = (ctx, name) => Object.hasOwn(G, name) && ready(ctx, name);
/** Play one gag right now (debugging and tests). Resolves the returned task when it ends. */
export function playGag(ctx, name) {
  if (!canPlay(ctx, name)) return null;
  const state = { done: false };
  ctx.gagStart?.(name, { stage: G[name].stage || null });
  ctx.run((function* () { try { yield* runGag(ctx, name); } finally { state.done = true; ctx.gagEnd?.(name); } })());
  return state;
}

/** The toolkit for tests and tools. */
export const TOOLKIT = T;
