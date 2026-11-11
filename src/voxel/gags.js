// Ambient street life + crime-level shenanigans, written as generator scripts.
import * as THREE from 'three';
import { wait, tween, all, race, waitUntil, ease, clamp, lerp, TAU, sculpt, piece, MAT } from './kit.js';
import { makePerson, makeDog, makeCat, makeBird, item } from './cast.js';
import { makeCar, makeBike, makeScooter, makeHeli, makeBoat } from './props.js';

const X0 = -24, X1 = 24, EX0 = X0 + 0.5, EX1 = X1 - 0.5;
const E = Math.PI / 2, W = -Math.PI / 2; // headings: +x, −x

// ---------------------------------------------------------------- movement primitives
export function* go(ctx, a, x, z, speed = a.speed, stop = 0.06) {
  for (;;) {
    const p = a.g.position, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d <= stop) return;
    const dt = yield;
    const s = Math.min(d, speed * dt);
    p.x += (dx / d) * s;
    p.z += (dz / d) * s;
    if (!a.air) p.y = 0;
    a.heading = Math.atan2(dx, dz);
    a.moving = speed;
  }
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
function* chase(ctx, a, tgt, speed, stop = 1.0, timeout = 12) {
  let t = 0;
  while (t < timeout && tgt.alive) {
    const dt = yield;
    t += dt;
    const p = a.g.position, q = tgt.g.position, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d <= stop) return true;
    const s = Math.min(d - stop * 0.9, speed * dt);
    p.x += (dx / d) * s; p.z += (dz / d) * s;
    if (!a.air) p.y = ctx.L.yAt(p.z);
    a.heading = Math.atan2(dx, dz);
    a.moving = speed;
  }
  return false;
}
function* popIn(ctx, a, dur = 0.28) {
  const s = a.baseScale;
  yield* tween(dur, (t) => a.g.scale.setScalar(Math.max(0.001, s * t)), ease.outBack);
}
function* popOut(ctx, a) {
  const s = a.g.scale.x;
  yield* tween(0.18, (t) => a.g.scale.setScalar(Math.max(0.001, s * (1 - t))), ease.inQuad);
  ctx.despawn(a);
}
function* enter(ctx, a, x, z, y) {
  ctx.spawn(a, x, z, y);
  a.g.scale.setScalar(0.001);
  yield* popIn(ctx, a);
}
const edgeOf = (a) => (a.g.position.x < 0 ? EX0 : EX1);
function* leave(ctx, a, speed = a.speed, toX = null) {
  if (!a.alive) return;
  yield* go(ctx, a, toX ?? edgeOf(a), a.g.position.z, speed);
  yield* popOut(ctx, a);
}
function* hop(a, h = 0.6, dur = 0.3) {
  const y0 = a.g.position.y;
  yield* tween(dur, (t) => (a.g.position.y = y0 + Math.sin(t * Math.PI) * h));
  a.g.position.y = y0;
}
const say = (ctx, a, str, o = {}) => ctx.fx.text(str, a, o);
const at = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- set-piece toolkit
const noop = () => {};
/** Stand-in for the director's camera: the same methods, all inert. A set piece plays identically without a camera. */
const NOCAM = { on: false, shot: noop, wide: noop, close: noop, low: noop, ots: noop, track: noop, top: noop, two: noop, card: noop, freeze: noop, release: noop };
const camFor = (ctx, name) => (ctx.cam && ctx.cam(name)) || NOCAM;
const pt = (x, z) => ({ x, z }); // a street-space point the camera can follow (mutate it to move the shot)
const faceTo = (a, x, z) => { a.heading = Math.atan2(x - a.g.position.x, z - a.g.position.z); };
const yell = (ctx, a, str, color = '#ff6b6b', size = 15) => { ctx.sfx('hey'); say(ctx, a, str, { size, color }); };

/** Put a borrowed or scripted person back into neutral. */
function tidy(a) {
  if (a.drop) a.drop();
  a.pose = null; a.air = false; a.arms = 'swing'; a.gait = 'walk';
  a.g.visible = true; a.g.rotation.x = 0; a.g.rotation.z = 0;
  a.g.scale.setScalar(a.baseScale || a.scale || 0.9);
  a.g.position.y = 0;
}
/** Like needPed, but never waits: borrow a walker near cx if one is there. */
function takePed(ctx, xr = 13, filter = null, cx = 0) {
  const ok = (p) => !p.busy && p.alive && Math.abs(p.g.position.x - cx) < xr && Math.abs(p.exitX - p.g.position.x) > 6 && (!filter || filter(p));
  let p = ctx.peds.find(ok);
  if (!p && ctx.amb) {
    const off = ctx.amb.sc - ctx.sc;
    const q = ctx.amb.peds.find((a) => !a.busy && a.alive && Math.abs(a.g.position.x + off - cx) < xr && (!filter || filter(a)));
    if (q) { rehome(q, ctx); p = q; }
  }
  if (p) p.busy = true;
  return p || null;
}

/**
 * Everything a set piece spawns, adds, borrows or runs is registered here, so one `free()` in a `finally`
 * cleans up on every exit path (finished, cancelled half-way, early return).
 */
function rig(ctx) {
  const { L, rnd } = ctx;
  const actors = new Set(), objs = new Set(), peds = new Set(), tasks = new Set(), keep = new Set();
  let closed = false, policeClosed = false, cops = 0;
  const R = {
    spawn(a, x, z, y) { ctx.spawn(a, x, z, y); actors.add(a); return a; },
    *enter(a, x, z, y) { R.spawn(a, x, z, y); a.g.scale.setScalar(0.001); yield* popIn(ctx, a); },
    *out(a) { if (a.alive) yield* popOut(ctx, a); actors.delete(a); },
    *leave(a, speed, toX) { yield* leave(ctx, a, speed, toX); actors.delete(a); },
    /** walk a few metres in one direction, then pop away (a short exit that does not need the street edge) */
    *away(a, dx, speed = 3.6) { if (!a.alive) return; yield* go(ctx, a, clamp(a.g.position.x + dx, EX0, EX1), a.g.position.z, speed); yield* R.out(a); },
    gone(a) { if (a.alive) ctx.despawn(a); actors.delete(a); },
    add(o) { ctx.world.add(o); objs.add(o); return o; },
    rm(o) { if (objs.delete(o)) ctx.world.remove(o); },
    /** survives a normal finish (lasting damage such as a tag); still removed if the script is cancelled */
    stay(o) { keep.add(o); },
    borrow(p) { peds.add(p); return p; },
    give(p) { if (peds.delete(p)) { tidy(p); release(ctx, p); } },
    run(g) { const t = ctx.run(g); if (!t.done) tasks.add(t); return t; },
    stop(t) { ctx.runner.stop(t); tasks.delete(t); },
    *settle(max = 10) { yield* waitUntil(() => { for (const t of tasks) if (!t.done) return false; return true; }, max); },
    *close() { if (!closed) { closed = true; ctx.road.closed++; } yield* waitUntil(() => ctx.road.vehicles.size === 0, 6); },
    open() { if (closed) { closed = false; policeClosed = false; ctx.road.closed = Math.max(0, ctx.road.closed - 1); } },
    /** A police car crosses. It closes the road to ambient traffic first, unless someone else holds it (then it skips). */
    *police(fromDir, z, speed = 11, delay = 0) {
      yield* wait(delay);
      if (L.kind === 'ped') return;
      if (!closed && ctx.road.closed > 0) return;
      if (!closed) { policeClosed = true; yield* R.close(); }
      cops++;
      try {
        const car = makeCar(rnd, 'police', L.night);
        car.siren = true;
        ctx.sfx('siren', 3);
        yield* R.enter(car, fromDir > 0 ? X0 + 2.5 : X1 - 2.5, z, 0);
        car.face(fromDir > 0 ? E : W);
        say(ctx, car, 'WEE-OO!', { color: '#7db8ff', size: 16 });
        yield* go(ctx, car, fromDir > 0 ? X1 - 2.5 : X0 + 2.5, z, speed);
        yield* R.out(car);
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
          yield* go(ctx, p, p.g.position.x < x ? EX0 : EX1, p.lineZ, 7.5);
          yield* R.out(p);
        })());
      }
    },
    *cop(target, speed = 5.6, delay = 0.6, line = null) {
      yield* wait(delay);
      if (!target.alive) return;
      const cop = makePerson(rnd, { kind: 'cop' }), fromLeft = target.heading > 0;
      yield* R.enter(cop, fromLeft ? EX0 : EX1, target.g.position.z);
      ctx.sfx('whistle');
      say(ctx, cop, line || rnd.pick(['HALT!', 'STOP!', 'POLITIE!', 'STA STIL!']), { color: '#7db8ff', size: 15 });
      yield* chase(ctx, cop, target, speed, 0.8, 14);
      yield* R.leave(cop, speed, fromLeft ? EX1 : EX0);
    },
    free(done = false) {
      for (const t of tasks) ctx.runner.stop(t);
      tasks.clear();
      for (const o of objs) if (!(done && keep.has(o))) ctx.world.remove(o);
      objs.clear();
      for (const a of actors) if (a.alive) ctx.despawn(a);
      actors.clear();
      for (const p of peds) if (p.alive) { tidy(p); release(ctx, p); }
      peds.clear();
      R.open();
      if (ctx.wanted && !ctx.wanted.alive) ctx.wanted = null;
    },
  };
  return R;
}

/** Borrow up to n walkers near x to watch. */
function gather(ctx, R, x, n, xr = 14) {
  const out = [];
  for (let i = 0; i < n; i++) { const p = takePed(ctx, xr, null, x); if (!p) break; out.push(R.borrow(p)); }
  return out;
}
const filmIt = (p, tx, tz) => { faceTo(p, tx, tz); p.hold(item.phone()); p.arms = 'hold'; };

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
/** go() with a per-frame callback (return true to stop). */
function* goEach(ctx, a, x, z, speed, each) {
  for (;;) {
    const p = a.g.position, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d <= 0.06) return;
    const dt = yield;
    const s = Math.min(d, speed * dt);
    p.x += (dx / d) * s; p.z += (dz / d) * s;
    if (!a.air) p.y = 0;
    a.heading = Math.atan2(dx, dz);
    a.moving = speed;
    if (each && each(dt, s) === true) return;
  }
}
/** A person riding a bike that is a separate actor: the rider is parked on the saddle every frame. */
// (saddle top 1.05 m at 0.30 m behind the bike's centre; hip sits 0.05 m above it, see makeBike)
const seat = (bike, rider, y = 0.52) => {
  const b = bike.g.position, h = bike.g.rotation.y;
  rider.g.position.set(b.x - Math.sin(h) * 0.28, b.y + y, b.z - Math.cos(h) * 0.28);
  rider.heading = h;
};
function* rideTo(ctx, bike, rider, x, z, speed, each, y = 0.52) {
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
const mount = (bike, rider, y = 0.52) => { rider.air = true; rider.pose = 'ride'; rider.arms = 'swing'; rider.g.rotation.order = 'YXZ'; seat(bike, rider, y); };
const dismount = (rider, x, z) => { rider.pose = null; rider.air = false; rider.g.position.set(x, 0, z); };
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
function spawnPed(ctx, atX = null, opts = {}) {
  const { L, rnd } = ctx, ex0 = L.x0 + 0.5, ex1 = L.x1 - 0.5;
  const dir = opts.dir ?? rnd.sign();
  const r = rnd();
  const a = makePerson(rnd, { kind: opts.kind || (r < 0.12 ? 'kid' : r < 0.22 ? 'granny' : 'civ') });
  a.dir = dir; a.exitX = dir > 0 ? ex1 : ex0;
  a.walkSpeed = a.kind === 'granny' ? rnd.range(1.0, 1.3) : rnd.range(1.35, 2.0); // a stroll, at life size
  const x = atX ?? (dir > 0 ? ex0 : ex1);
  if (opts.z != null) { a.lineZ = opts.z + rnd.range(-0.15, 0.15); a.fixedZ = true; a.side = a.lineZ >= 0 ? 1 : -1; }
  else { a.side = rnd.sign(); a.wf = rnd.range(0.15, 0.85); a.lineZ = paveZ(ctx, a, x); }
  ctx.spawn(a, x, a.lineZ);
  a.face(dir > 0 ? E : W);
  ctx.peds.push(a);
  ctx.run((function* () {
    a.g.scale.setScalar(0.001);
    yield* popIn(ctx, a);
    yield* stroll(a, true);
  })());
  return a;
}
function unped(ctx, a) {
  const list = (a.ctx || ctx).peds, i = list.indexOf(a);
  if (i >= 0) list.splice(i, 1);
}
/** Is something driving or riding towards the spot at arc length s? (People look before they cross. Some of them.) */
function traffic(ctx, s, reach) {
  const hb = ctx.L.hw + ctx.L.bw;
  for (const a of ctx.all()) {
    if (!a.vehicle || !a.alive || !a.vNow) continue;
    const q = a.g.position, ds = a.ctx.sc + q.x - s;
    if (Math.abs(q.z) < hb && Math.abs(ds) < reach && ds * a.vNow < 0) return true;
  }
  return false;
}
/** Is a vehicle standing or passing right where a walker is about to step (s along, z across)? Nobody walks through a car. */
function carAt(ctx, s, z) {
  for (const a of ctx.all()) {
    if (!a.vehicle || !a.alive || !a.ctx || a.air) continue;
    const q = a.g.position;
    if (Math.abs(a.ctx.sc + q.x - s) < (a.len || 1.8) / 2 + 0.45 && Math.abs(q.z - z) < (a.wid || 0.6) / 2 + 0.4) return true;
  }
  return false;
}
/** How often a walker steps into the road without looking, per look (twice a second): rougher streets, more of it. */
const jayRate = (ctx) => 0.0016 * (0.5 + 0.3 * ctx.level) * clamp(ctx.mix?.factor?.carChase ?? 1, 0.6, 2.2);
/**
 * Walk along the pavement to the end of the street. The line follows the real pavement, crosses side streets,
 * and now and then the walker crosses over on purpose: at a zebra after looking, or anywhere without.
 */
function* stroll(a, keepSide = false) {
  if (!keepSide) { a.side = a.g.position.z >= 0 ? 1 : -1; a.wf ??= 0.5; }
  a.cross = null;
  let look = 0.5 + Math.random();
  while (!a.busy && a.alive) {
    const c = a.ctx, L = c.L, p = a.g.position, dx = a.exitX - p.x;
    if (Math.abs(dx) < 0.12) { unped(c, a); yield* popOut(c, a); return; }
    const dt = yield;
    if (a.busy || !a.alive) return;
    const sp = a.walkSpeed, s = c.sc + p.x, fwd = Math.sign(dx);
    let lat = sp * 0.7, along = 1;
    if (a.cross) {
      const X = a.cross;
      if (X.wait > 0) {
        // at the kerb, waiting for a gap
        X.wait -= dt;
        if (X.wait > 0 && traffic(c, s, 15)) { a.heading = Math.atan2(0, -a.side); continue; }
        X.wait = 0;
      }
      a.lineZ = c.L.walkAt ? c.L.walkAt(X.to, a.wf, s) : -a.lineZ;
      lat = sp; along = 0.12;
      // a car in the way (queueing, or just passing): let it go first
      if (carAt(c, s, p.z + Math.sign(a.lineZ - p.z) * 0.7) && !carAt(c, s, p.z)) { a.heading = Math.atan2(0, Math.sign(a.lineZ - p.z)); continue; }
      if (Math.abs(a.lineZ - p.z) < 0.2) { a.side = X.to; a.cross = null; }
    } else {
      if (!a.fixedZ) a.lineZ = paveZ(c, a, p.x);
      if ((look -= dt) <= 0) {
        look = 0.5;
        if (L.kind !== 'ped' && !a.fixedZ && L.walkAt && s > L.sA + 5 && s < L.sB - 5) {
          const zebra = L.zebras && L.zebras.some((z) => Math.abs(z - s) < 1.3);
          if (zebra ? Math.random() < 0.25 : Math.random() < jayRate(c)) a.cross = { to: -a.side, wait: zebra || Math.random() < 0.35 ? 3.5 : 0 };
        }
      }
    }
    const dz = a.lineZ - p.z;
    p.x += fwd * Math.min(Math.abs(dx), sp * dt * along);
    // sideways only if that does not mean walking into the flank of a car or a bike
    if (Math.abs(dz) < 0.3 || !carAt(c, s, p.z + Math.sign(dz) * 0.5) || carAt(c, s, p.z)) p.z += clamp(dz, -lat * dt, lat * dt);
    p.y = 0;
    a.heading = Math.atan2(fwd * along, clamp(dz, -1, 1) * (a.cross ? 1 : 0.6));
    a.moving = sp;
  }
}
function release(ctx, a) {
  if (!a.alive) return;
  a.busy = false; a.arms = 'swing'; a.gait = 'walk';
  if (ctx.amb) rehome(a, ctx.amb);
  ctx.run(stroll(a));
}
/** Borrow a pedestrian who still has some street ahead of them (spawns one if needed). */
function* needPed(ctx, xr = 13, filter = null) {
  const ok = (p) => !p.busy && p.alive && Math.abs(p.g.position.x) < xr && Math.abs(p.exitX - p.g.position.x) > 8 && (!filter || filter(p));
  let p = ctx.peds.find(ok);
  if (!p && ctx.amb) {
    const off = ctx.amb.sc - ctx.sc;
    const q = ctx.amb.peds.find((a) => !a.busy && a.alive && Math.abs(a.g.position.x + off) < xr && (!filter || filter(a)));
    if (q) { rehome(q, ctx); p = q; }
  }
  if (!p) {
    const np = spawnPed(ctx, null, { kind: 'civ' });
    yield* waitUntil(() => ok(np) || !np.alive, 9);
    p = np.alive && !np.busy ? np : ctx.peds.find(ok);
  }
  if (p) p.busy = true;
  return p || null;
}
function panic(ctx, x, r = 16) {
  if (ctx.amb) {
    const off = ctx.amb.sc - ctx.sc;
    for (const a of [...ctx.amb.peds]) if (!a.busy && a.alive && Math.abs(a.g.position.x + off - x) <= r) rehome(a, ctx);
  }
  for (const a of [...ctx.peds]) {
    if (a.busy || !a.alive || Math.abs(a.g.position.x - x) > r) continue;
    a.busy = true;
    unped(ctx, a);
    ctx.run((function* () {
      a.arms = 'up';
      if (Math.random() < 0.4) say(ctx, a, ctx.rnd.pick(['AAAH!', 'HELP!', 'OEI!', 'WEG HIER!']), { size: 13, color: '#fff' });
      yield* go(ctx, a, a.g.position.x < x ? EX0 : EX1, a.lineZ, 7.5);
      yield* popOut(ctx, a);
    })());
  }
}

function* pedSpawner(ctx) {
  const { L, rnd, st } = ctx, len = L.x1 - L.x0;
  const busy = clamp(((st.shops || 0) + (st.food || 0) + (st.bars || 0)) / Math.max(1, (st.len || 200) / 100) / 4, 0, 1);
  const cap = Math.min(64, Math.round(((5 + busy * 9 + (L.kind === 'ped' ? 4 : 0)) * len) / 48));
  for (let i = 0; i < Math.round(cap * 0.7); i++) spawnPed(ctx, rnd.range(L.x0 + 3, L.x1 - 3));
  for (;;) {
    yield* wait(Math.max(0.3, (rnd.range(1.2, 3.6) * (1.4 - busy * 0.8) * 48) / len));
    if (ctx.peds.length < cap) spawnPed(ctx);
  }
}

// ---- traffic on the open street looks where it is going
const isWalker = (a) => !!a.head && !a.vehicle;
/**
 * The nearest thing in a vehicle's way: { gap (metres of clear road in front of its nose), v (how fast that
 * thing moves the same way), a (who) }, or null. Everyone on stage counts, and so do passing trams.
 */
function inTheWay(ctx, me, dir, half, wid, reach) {
  const p = me.g.position, s0 = ctx.sc + p.x, z0 = p.z, far = reach + half + 8;
  let best = null;
  for (const a of ctx.all()) {
    if (a === me || !a.alive || a.air || !a.ctx) continue;
    const q = a.g.position;
    if (q.y > 1.6) continue;
    const fw = (a.ctx.sc + q.x - s0) * dir;
    if (fw <= 0 || fw > far) continue;
    const r = a.vehicle ? (a.wid || 0.7) / 2 : 0.3, ext = a.vehicle ? (a.len || 1.8) / 2 : 0.3;
    if (Math.abs(q.z - z0) > wid / 2 + r + 0.12) continue;
    const gap = fw - half - ext;
    if (!best || gap < best.gap) best = { gap, v: (a.vNow || 0) * dir, a };
  }
  for (const l of ctx.trams()) {
    const q = l.a.g.position, pr = ctx.toStreet(q.x, q.z), fw = (pr.s - s0) * dir;
    if (fw <= 0 || fw > far + 14 || Math.abs(pr.v - z0) > wid / 2 + 1.5) continue;
    const t = ctx.tangent(pr.s), al = Math.abs(Math.sin(l.a.heading) * t.tx + Math.cos(l.a.heading) * t.tz); // along the street, or crossing it?
    const gap = fw - half - (2 + ((l.a.len || 27) / 2 - 2) * al);
    if (!best || gap < best.gap) best = { gap, v: al > 0.7 ? l.speed * l.dir * dir * 0.5 : 0, a: l.a };
  }
  return best;
}
/** Knocked over by a car or a bike: up in the air, stars, a shaken fist, and on they walk. Nobody is hurt here. */
function bonk(ctx, a, veh, v, dir) {
  const c = a.ctx, bike = veh.type === 'bike' || veh.type === 'scooter';
  a.busy = true;
  unped(c, a);
  c.sfx('bonk');
  say(c, a, bike ? 'BOINK!' : 'BONK!', { size: 20, color: '#ffd166' });
  c.shake(bike ? 0.15 : 0.3);
  c.incident(1);
  c.news(c.rnd.pick(bike
    ? [`Cyclist and jaywalker meet on ${c.st.name}. Both blame the other`, `Bell rung too late on ${c.st.name}. Dignity lightly dented`]
    : [`Jaywalker bonked on ${c.st.name}. Walks it off`, `Driver on ${c.st.name}: "came out of nowhere". Pedestrian: "came out of a shop"`, `Bumper meets trousers on ${c.st.name}. Trousers lodge complaint`]));
  c.run((function* () {
    const p = a.g.position, x0 = p.x, z0 = p.z, fly = clamp(v * (bike ? 0.25 : 0.45), 0.8, 3.2) * dir, side = (z0 >= veh.g.position.z ? 1 : -1) * (bike ? 0.9 : 1.3), up = bike ? 0.9 : 1.7;
    a.arms = 'up'; a.air = true; a.cross = null;
    a.g.rotation.order = 'YXZ';
    yield* tween(bike ? 0.5 : 0.75, (t) => { p.x = x0 + fly * t; p.z = z0 + side * t; p.y = Math.sin(t * Math.PI) * up; a.g.rotation.x = t * Math.PI * 2; });
    a.g.rotation.x = 0; p.y = 0; a.air = false;
    if (!a.alive) return;
    a.pose = 'sit'; a.arms = 'swing';
    c.sfx('thud');
    c.fx.puff(p.x, 0.2, p.z);
    say(c, a, '★ ★ ★', { size: 13, color: '#ffe066', dur: 1.5 });
    yield* wait(bike ? 0.9 : 1.4);
    a.pose = null;
    yield* hop(a, 0.35, 0.25);
    a.arms = 'fist';
    c.sfx('hey');
    say(c, a, c.rnd.pick(['HÉ!', 'KIJK UIT!', 'ASO!', 'MIJN BROEK!', 'ZAG JE ME NIET?!']), { size: 13, color: '#ff6b6b' });
    yield* wait(0.9);
    if (!a.alive) return;
    // back on their feet and off the road
    a.arms = 'swing'; a.busy = false;
    if (!c.peds.includes(a)) c.peds.push(a);
    yield* stroll(a);
  })());
}
/**
 * Drive (or ride) along the lane at offset z to toX, braking for whatever is in the way. Returns false if it
 * got stuck for good. A walker who steps out right under the wheels may get bonked.
 */
function* cruise(ctx, veh, toX, z, speed, bike = false) {
  const dir = Math.sign(toX - veh.g.position.x) || 1, half = (veh.len || (bike ? 1.86 : 4.4)) / 2, wid = veh.wid || (bike ? 0.6 : 1.85);
  const brake = bike ? 7 : 9, keep = bike ? 0.8 : 1.5;
  let v = speed, stuck = 0, honk = 0;
  for (;;) {
    const p = veh.g.position;
    if ((toX - p.x) * dir <= 0.05) { veh.vNow = 0; return true; }
    const dt = yield;
    const ob = inTheWay(ctx, veh, dir, half, wid, (v * v) / (2 * brake) + keep + 1);
    let target = speed;
    honk -= dt;
    if (ob) {
      const room = ob.gap - keep;
      target = room <= 0 ? 0 : Math.min(speed, Math.max(0, ob.v) + room * 1.5);
      const walker = isWalker(ob.a);
      if (walker && target < v - 1 && v > 2.5 && honk <= 0) {
        honk = 4;
        ctx.sfx(bike ? 'bell' : 'honk');
        if (Math.random() < 0.5) say(ctx, veh, bike ? 'TRING!' : 'TOET!', { size: 13, color: '#fff', off: bike ? 1.9 : 2.1 });
      }
      if (ob.gap < 0.3) {
        // no room left. An unwary walker gets bonked now and then; otherwise this stops dead, tyres squealing
        const amb = ctx.amb || ctx;
        if (walker && v > 2.4 && !ob.a.busy && ob.a.walkSpeed && ob.a.alive && (amb._bonkAt ?? -99) < ctx.now() - 22) { amb._bonkAt = ctx.now(); bonk(ctx, ob.a, veh, v, dir); v *= 0.25; }
        else { if (v > 3 && !bike) ctx.sfx('skid'); v = 0; }
      }
    }
    v += clamp(target - v, -brake * 1.4 * dt, (bike ? 2.2 : 3) * dt);
    if (v < 0) v = 0;
    if (v < 0.15 && target < 0.15) { stuck += dt; if (stuck > 8) { veh.vNow = 0; return false; } } else stuck = 0;
    p.x += dir * v * dt;
    p.z += clamp(z - p.z, -dt, dt);
    if (!veh.air) p.y = 0;
    veh.heading = dir > 0 ? E : W;
    veh.moving = v;
    veh.vNow = v * dir;
  }
}
/** Is there room to appear at (x, z)? Nothing pops up on top of a queue. */
function roomAt(ctx, x, z, r) {
  const s = ctx.sc + x;
  for (const a of ctx.all()) if (a.alive && a.ctx && Math.abs(a.ctx.sc + a.g.position.x - s) < r && Math.abs(a.g.position.z - z) < 1.6) return false;
  return true;
}
/** A passing car. It vanishes in a puff when it reaches a stretch a gag has closed off. */
function* drive(ctx, car, z, dir, speed) {
  const { L } = ctx, half = (car.len || 4.4) / 2 + 0.6, x0 = dir > 0 ? L.x0 + half : L.x1 - half;
  if (!roomAt(ctx, x0, z, half + 4)) return;
  ctx.spawn(car, x0, z, 0);
  car.face(dir > 0 ? E : W);
  car.g.scale.setScalar(0.001);
  ctx.road.vehicles.add(car);
  yield* popIn(ctx, car, 0.35);
  const inWin = new Set();
  const watch = (function* () {
    for (;;) {
      yield;
      const s = ctx.sc + car.g.position.x;
      for (const c of ctx.locales || []) {
        const near = Math.abs(s - c.sc) < 28;
        if (near && c.road.closed > 0) return;
        if (near) { c.road.vehicles.add(car); inWin.add(c); }
        else if (inWin.has(c)) { c.road.vehicles.delete(car); inWin.delete(c); }
      }
    }
  })();
  yield* race(cruise(ctx, car, dir > 0 ? L.x1 - half : L.x0 + half, z, speed), watch);
  for (const c of inWin) c.road.vehicles.delete(car);
  ctx.road.vehicles.delete(car);
  car.vNow = 0;
  yield* popOut(ctx, car);
}
function* carSpawner(ctx) {
  const { L, rnd } = ctx;
  if (L.kind === 'ped') return;
  const major = L.kind === 'major', len = L.x1 - L.x0;
  const oneWay = rnd.sign(), maxMinor = Math.floor(len / 170) + 1;
  yield* wait(rnd.range(0.2, 1.2));
  for (;;) {
    if (major) {
      const dir = rnd.sign();
      // a long road must not fill up with hundreds of cars
      if (ctx.road.vehicles.size < Math.min(26, Math.ceil(len / 70))) ctx.run(drive(ctx, makeCar(rnd, rnd.chance(0.1) ? 'taxi' : rnd.chance(0.08) ? 'van' : 'car', L.night), dir > 0 ? L.laneF : L.laneB, dir, rnd.range(7, 8.5)));
    } else if (ctx.road.vehicles.size < maxMinor) {
      ctx.run(drive(ctx, makeCar(rnd, 'car', L.night), L.laneF, oneWay, 5));
    }
    yield* wait(major ? rnd.range(2.2, 5.5) : rnd.range(7, 14));
  }
}
function* bikeSpawner(ctx) {
  const { L, rnd } = ctx, len = L.x1 - L.x0, cap = Math.min(22, Math.ceil(len / 45));
  let riding = 0;
  yield* wait(rnd.range(0.2, 2));
  for (;;) {
    const dir = rnd.sign(), z = dir > 0 ? L.bikeF : L.bikeB, x0 = dir > 0 ? L.x0 + 1.1 : L.x1 - 1.1;
    if (riding < cap && roomAt(ctx, x0, z, 3)) {
      const bike = makeBike(rnd, makePerson(rnd, { scale: 1.2 }));
      riding++;
      ctx.run((function* () {
        try {
          yield* enter(ctx, bike, x0, z, 0);
          bike.face(dir > 0 ? E : W);
          if (rnd.chance(0.12)) ctx.sfx('bell');
          yield* cruise(ctx, bike, dir > 0 ? L.x1 - 1.1 : L.x0 + 1.1, z, rnd.range(4.4, 6.2), true);
          bike.vNow = 0;
          yield* popOut(ctx, bike);
        } finally { riding--; }
      })());
    }
    yield* wait(rnd.range(2.5, 7) * clamp(140 / len, 0.45, 1));
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
    yield* enter(ctx, boat, dir > 0 ? X0 + 2.4 : X1 - 2.4, z, L.canal.y);
    boat.face(dir > 0 ? E : W);
    yield* go(ctx, boat, dir > 0 ? X1 - 2.4 : X0 + 2.4, z, 2.6);
    yield* popOut(ctx, boat);
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
    ctx.spawn(g, dir > 0 ? X0 - 4 : X1 + 4, z, y);
    g.face(dir > 0 ? E : W);
    if (rnd.chance(0.3)) ctx.sfx('squawk');
    ctx.run((function* () {
      yield* fly(g, dir > 0 ? X1 + 4 : X0 - 4, y + rnd.range(-2, 2), z + rnd.range(-5, 5), rnd.range(5, 8));
      ctx.despawn(g);
    })());
  }
}
function* pigeons(ctx) {
  const { L, rnd } = ctx;
  const birds = [];
  for (let i = 0; i < 3; i++) {
    const b = makeBird(rnd, 'pigeon');
    ctx.spawn(b, rnd.range(-18, 18), L.walkF[0] - 0.4 + rnd.range(-0.2, 0.2));
    b.face(rnd.range(0, TAU));
    birds.push(b);
  }
  for (;;) {
    yield* wait(rnd.range(1.5, 4));
    const b = rnd.pick(birds);
    yield* go(ctx, b, clamp(b.g.position.x + rnd.range(-2.5, 2.5), -21, 21), L.walkF[0] - 0.4 + rnd.range(-0.25, 0.25), 1.6);
  }
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
  const car = makeCar(ctx.rnd, 'police', ctx.L.night);
  car.siren = true;
  ctx.sfx('siren', 3);
  yield* enter(ctx, car, fromDir > 0 ? X0 + 2.5 : X1 - 2.5, z, 0);
  car.face(fromDir > 0 ? E : W);
  say(ctx, car, 'WEE-OO!', { color: '#7db8ff', size: 16 });
  yield* go(ctx, car, fromDir > 0 ? X1 - 2.5 : X0 + 2.5, z, speed);
  yield* popOut(ctx, car);
}
function* footCop(ctx, target, speed = 5.6, delay = 0.6) {
  yield* wait(delay);
  if (!target.alive) return;
  const cop = makePerson(ctx.rnd, { kind: 'cop' });
  const fromLeft = target.heading > 0; // chase from behind
  yield* enter(ctx, cop, fromLeft ? EX0 : EX1, target.g.position.z);
  ctx.sfx('whistle');
  say(ctx, cop, ctx.rnd.pick(['HALT!', 'STOP!', 'POLITIE!', 'STA STIL!']), { color: '#7db8ff', size: 15 });
  yield* chase(ctx, cop, target, speed, 0.8, 14);
  yield* leave(ctx, cop, speed, fromLeft ? EX1 : EX0);
}

// ---------------------------------------------------------------- the gags
const G = {};

G.napCat = {
  w: [3, 2, 1, 0, 0], need: ['benches'],
  *run(ctx) {
    const { L, rnd } = ctx, b = rnd.pick(L.benches), cat = makeCat(rnd);
    cat.speed = 2.6;
    yield* enter(ctx, cat, rnd.chance(0.5) ? EX0 : EX1, L.walkB[0]);
    yield* go(ctx, cat, b.x + 1.5, b.z + 0.5);
    cat.pose = 'sleep';
    ctx.focus(b.x, b.z, 0.62, 4);
    ctx.news('Cat begins scheduled 16-hour nap');
    for (let i = 0; i < 5; i++) { say(ctx, cat, 'Z', { size: 13 + i * 3, color: '#cfe8ff', off: 0.7, rise: 1.8, dur: 1.5 }); ctx.sfx('zzz'); yield* wait(1.0); }
    cat.pose = null;
    yield* leave(ctx, cat);
  },
};

G.pigeonLady = {
  w: [3, 2, 1, 0.4, 0], need: ['benches'],
  *run(ctx) {
    const { L, rnd } = ctx, b = rnd.pick(L.benches);
    const gran = makePerson(rnd, { kind: 'granny' });
    gran.speed = 1.9;
    yield* enter(ctx, gran, rnd.chance(0.5) ? EX0 : EX1, L.walkB[0]);
    yield* go(ctx, gran, b.x, b.z + 0.7);
    gran.air = true; gran.pose = 'sit'; gran.heading = 0;
    gran.g.position.set(b.x, L.yAt(b.z) + 0.32, b.z + 0.12);
    ctx.news('Local oma feeds pigeons. Council "monitoring the situation"');
    ctx.focus(b.x, b.z + 1, 0.6, 5);
    const birds = [];
    for (let i = 0; i < 5; i++) {
      const p = makeBird(rnd, 'pigeon');
      p.fly = true;
      ctx.spawn(p, b.x + rnd.range(-9, 9), b.z + 6, 9 + i);
      birds.push(p);
      ctx.run((function* () {
        yield* wait(i * 0.25);
        yield* fly(p, b.x + rnd.range(-1.8, 1.8), L.yAt(b.z), b.z + rnd.range(1.3, 2.4), 7);
        p.fly = false;
      })());
    }
    for (let i = 0; i < 6; i++) {
      gran.arms = i % 2 ? 'hold' : 'swing';
      ctx.fx.burst(b.x, 0.95, b.z + 0.8, { n: 4, colors: ['#e9c46a', '#d9b382'], speed: 2.5, up: 3, size: [0.05, 0.08], life: [0.5, 0.8] });
      yield* wait(1.0);
    }
    for (const p of birds) {
      p.fly = true;
      ctx.run((function* () { yield* fly(p, p.g.position.x + rnd.range(-12, 12), 13, p.g.position.z + 6, 8); ctx.despawn(p); })());
    }
    gran.pose = null; gran.air = false; gran.arms = 'swing';
    gran.g.position.set(b.x, L.yAt(b.z), b.z + 0.8);
    yield* leave(ctx, gran);
  },
};

G.boredCop = {
  w: [3, 2, 1, 0, 0],
  *run(ctx) {
    const { L, rnd } = ctx, cop = makePerson(rnd, { kind: 'cop' });
    cop.speed = 1.8;
    const dir = rnd.sign();
    yield* enter(ctx, cop, dir > 0 ? EX0 : EX1, L.walkF[0]);
    yield* go(ctx, cop, rnd.range(-6, 6), L.walkF[0]);
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
  *run(ctx) {
    const { L, rnd } = ctx, kid = makePerson(rnd, { kind: 'kid' });
    const dir = rnd.sign(), z = L.walkF[1];
    const bal = item.balloon(rnd.pick(['#ff4d6d', '#ffd60a', '#4cc9f0', '#b5179e']));
    kid.b.add(bal);
    bal.position.set(0.62, 0.8, 0);
    yield* enter(ctx, kid, dir > 0 ? EX0 : EX1, z);
    yield* go(ctx, kid, rnd.range(-5, 5), z, 2.4);
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
      yield* tween(5, (t) => { bal.position.y = wp.y + t * 16; bal.position.x = x0 + Math.sin(t * 9) * 0.8 + t * 3; });
      ctx.world.remove(bal);
    })());
    for (let i = 0; i < 3; i++) yield* hop(kid, 0.7, 0.35);
    yield* wait(0.5);
    kid.arms = 'swing';
    yield* leave(ctx, kid, 1.6, dir > 0 ? EX1 : EX0);
  },
};

G.seagullFries = {
  w: [0, 3, 2, 1, 1], crime: 1,
  *run(ctx) {
    const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'seagullFries'), R = rig(ctx);
    let done = false;
    try {
      const ped = yield* needPed(ctx, 10);
      if (!ped) return;
      R.borrow(ped);
      const p = ped.g.position, px = p.x, pz = p.z, side = rnd.sign(), toMid = px > 0 ? -1 : 1;
      const sky = (x, y, z) => { const g = makeBird(rnd, 'gull'); g.fly = true; R.spawn(g, x, z, y); g.face(x > px ? W : E); return g; };

      // 1. set-up: a happy customer with a paper cone of chips
      cam.wide(ped, { dist: 20, hold: 3.6 });
      const fries = ped.hold(item.fries());
      ped.arms = 'hold'; ped.heading = 0;
      say(ctx, ped, 'mmm, patat', { size: 12, color: '#ffe08a' });
      for (let i = 0; i < 2; i++) { yield* hop(ped, 0.12, 0.2); ctx.sfx('pop', 1.4); yield* wait(0.45); }

      // 2. reconnaissance: one gull makes a slow pass overhead, then hangs in the air to the side
      let dived = false;
      const scout = sky(px + side * 24, 12, pz + 9);
      cam.low(ped, { dist: 9, hold: 3.2 });
      R.run((function* () {
        yield* fly(scout, px + side * 3, 7, pz + 2, 10);
        ctx.sfx('squawk');
        say(ctx, scout, 'kraai?', { size: 12, color: '#cfe8ff', off: 0.6 });
        yield* fly(scout, px - side * 8, 9, pz + 6, 7);
        scout.face(side > 0 ? E : W);
        yield* waitUntil(() => dived, 14);
      })());
      yield* wait(0.8);
      ped.heading = side > 0 ? 0.9 : -0.9; // glances up
      yield* wait(0.45);
      ped.heading = 0;
      yield* doubleTake(ctx, ped, 'hm?');

      // 3. the wingman lands behind the customer and waddles up
      const wing = makeBird(rnd, 'gull');
      wing.fly = true;
      R.spawn(wing, px - side * 20, pz + 7, 8);
      const land = pt(px - side * 2.2, pz + 1.0);
      yield* fly(wing, land.x, 0, land.z, 11);
      wing.fly = false; wing.face(0);
      ctx.sfx('squawk');
      cam.close(wing, { dist: 6, hold: 2.1 });
      cam.card('DE HANDLANGER', 'Waddle first. Ask never.', 1.8);
      cam.freeze(0.6);
      ctx.sfx('sting');
      yield* wait(0.6);
      yield* go(ctx, wing, px - side * 0.9, pz - 0.9, 2.2);
      wing.face(0);
      yield* wait(0.3);
      ped.heading = Math.PI;
      yield* doubleTake(ctx, ped, '?!');
      ped.heading = Math.PI;
      ped.arms = 'fist';
      yell(ctx, ped, 'KSST! WEG!', '#ff6b6b', 14);
      cam.ots(ped, wing, { hold: 2 });
      wing.fly = true;
      R.run((function* () { yield* fly(wing, px - side * 3.2, 1.6, pz - 2.2, 6); wing.fly = false; })());
      yield* wait(0.4);

      // 4. the dive, in slow motion
      dived = true;
      ctx.slowmo(0.3, 1.0);
      cam.track(scout, { hold: 2.2, lead: 1.2 });
      ctx.sfx('whoosh');
      say(ctx, scout, 'KRAAAAI', { size: 16, color: '#ffd60a', off: 0.6 });
      yield* fly(scout, px + 0.5, p.y + 1.3, pz + 0.55, 12.5); // hand height of a 2 m person
      ped.drop();
      scout.b.add(fries);
      fries.position.set(0, 0.25, 0.55);
      ctx.sfx('yoink');
      say(ctx, scout, 'YOINK!', { size: 22, color: '#ffd60a', off: 0.6 });
      ctx.fx.puff(px, 1.2, pz);
      ctx.incident();
      ped.heading = 0; ped.arms = 'up';
      // a mid-air tug of war over the last chip
      cam.ots(ped, scout, { hold: 2.2 });
      let boing = 0;
      yield* tween(1.0, (t) => {
        scout.g.position.set(px + 0.5 + t * 0.9 + Math.sin(t * 22) * 0.3, 1.35 + t * 1.1 + Math.sin(t * 30) * 0.08, pz + 0.55);
        p.y = Math.abs(Math.sin(t * 13)) * 0.4;
        if (t > boing) { boing += 0.28; ctx.sfx('boing'); ctx.fx.burst(px + 0.6, 1.4, pz + 0.6, { n: 3, colors: ['#ffd166'], speed: 2, up: 3, size: [0.05, 0.09], life: [0.5, 0.8] }); }
      });
      p.y = 0;
      let last = null;
      for (let i = 0; i < 3; i++) {
        const f = R.add(item.fries());
        f.scale.setScalar(0.7); f.position.set(px + 0.5, 1.4, pz + 0.5);
        R.run(arc(f, px + rnd.range(-1.6, 1.6), 0.02, pz + rnd.range(0.4, 1.3), 0.8, 0.5, rnd.range(-5, 5)));
        if (i === 0) last = f; // the one left for later
      }
      yield* fly(scout, px + side * 3, 4.5, pz + 4, 8);
      yell(ctx, ped, rnd.pick(['HEY!!', 'ROTMEEUW!', 'MIJN PATAT!']), '#ff6b6b', 17);
      ctx.news(`Seagull strikes again on ${ctx.st.name}: fries gone in 0.4 seconds`);
      yield* wait(0.3);

      // 5. the flock arrives
      const n = 2 + lv;
      cam.top(ped, { dist: 22, hold: 2.8 });
      const flock = [];
      for (let i = 0; i < n; i++) {
        const g = sky(px + rnd.range(-26, 26), rnd.range(13, 17), pz + rnd.range(6, 12));
        flock.push(g);
        ctx.sfx('squawk');
      }
      flock.push(scout);
      const flee = pt(clamp(px + toMid * 8, -18, 18), p.z);
      flock.forEach((g, i) => R.run((function* () {
        const ph = rnd.range(0, TAU), r = rnd.range(3.5, 6), y = rnd.range(5, 8);
        // circle overhead...
        yield* tween(1.5, (t) => {
          const a = ph + t * 7 * (i % 2 ? 1 : -1), tx = px + Math.cos(a) * r, tz = pz + Math.sin(a) * r * 0.7;
          const q = g.g.position, k = Math.min(1, 0.16 + t * 0.2);
          q.x += (tx - q.x) * k; q.y += (y - q.y) * k * 0.7; q.z += (tz - q.z) * k;
          g.heading = a + (i % 2 ? Math.PI : 0) + 1.57;
        });
        // ...then dive-bomb the customer, who is running for it
        let t = 0;
        while (t < 2.6) {
          const dt = yield;
          t += dt;
          const q = g.g.position, tp = p, off = Math.sin(t * 5 + ph) * 1.3;
          const tx = tp.x + off, ty = 1.65 + Math.abs(Math.sin(t * 6 + i)) * 0.75, tz = tp.z + 0.6;
          const dx = tx - q.x, dy = ty - q.y, dz = tz - q.z, d = Math.hypot(dx, dy, dz) || 1, s = Math.min(d, 9.5 * dt);
          q.x += dx / d * s; q.y += dy / d * s; q.z += dz / d * s;
          g.heading = Math.atan2(dx, dz); g.moving = 9;
        }
        yield* fly(g, g.g.position.x + rnd.range(-30, 30), 14, g.g.position.z + 12, 9);
        R.gone(g);
      })()));
      yield* wait(1.4);
      cam.track(ped, { hold: 3.4, lead: 2 });
      ped.arms = 'up';
      let poops = 0, pt0 = 0;
      yield* goEach(ctx, ped, flee.x, flee.z, 6.6, (dt) => {
        pt0 -= dt;
        if (lv >= 4 && poops < 2 && pt0 < 0 && rnd.chance(0.04)) {
          poops++; pt0 = 0.6;
          ctx.sfx('pop', 0.6);
          ctx.fx.puff(p.x, 2.0, p.z, '#ffffff');
          ctx.fx.text('KLETS!', ped, { size: 18, color: '#ffffff' });
        }
      });
      if (lv >= 4 && poops === 0) { ctx.sfx('pop', 0.6); ctx.fx.puff(p.x, 2.0, p.z, '#ffffff'); ctx.fx.text('KLETS!', ped, { size: 18, color: '#ffffff' }); }
      ped.arms = 'swing';
      yield* go(ctx, ped, px + toMid * 3, pz, 3.6);

      // 6. aftermath: out of breath, then the last chip goes to a pigeon
      cam.wide(pt(px, pz), { dist: 18, hold: 3 });
      ped.heading = 0;
      say(ctx, ped, '*hijg*', { size: 13, color: '#cfe8ff' });
      yield* wait(0.5);
      if (lv >= 4) {
        const cop = makePerson(rnd, { kind: 'cop' }), cw = cop.hold(item.wafel());
        cop.arms = 'hold';
        yield* R.enter(cop, clamp(px - toMid * 8, EX0, EX1), pz);
        yield* go(ctx, cop, px - toMid * 2.5, pz, 4);
        cop.heading = 0;
        ctx.sfx('whistle');
        say(ctx, cop, 'MEEUWEN? ECHT?', { size: 14, color: '#7db8ff' });
        yield* wait(0.6);
        const thief = sky(cop.g.position.x + 8, 9, cop.g.position.z + 6);
        cam.track(thief, { hold: 1.6 });
        yield* fly(thief, cop.g.position.x + 0.5, 1.3, cop.g.position.z + 0.5, 12);
        cop.drop();
        thief.b.add(cw); cw.position.set(0, 0.25, 0.55);
        ctx.sfx('yoink');
        say(ctx, thief, 'YOINK!', { size: 20, color: '#ffd60a', off: 0.6 });
        cop.arms = 'up';
        R.run((function* () { yield* fly(thief, thief.g.position.x + 26, 13, thief.g.position.z + 8, 11); R.gone(thief); })());
        yell(ctx, cop, 'MIJN STROOPWAFEL!', '#7db8ff', 14);
        yield* wait(0.8);
        cop.arms = 'swing';
        R.run(R.away(cop, toMid * -6, 3.2));
      }
      // the pigeon, patient and unremarkable, walks off with the one chip that is left
      const pig = makeBird(rnd, 'pigeon');
      R.spawn(pig, px + side * 5, pz + 1.4, 0);
      pig.face(side > 0 ? W : E);
      const lx = last.position.x, lz = last.position.z;
      cam.low(pt(lx, lz), { dist: 7, hold: 2.2 });
      yield* go(ctx, pig, lx, lz, 2.4);
      yield* wait(0.3);
      R.rm(last);
      const stolen = item.fries();
      stolen.scale.setScalar(0.7);
      pig.b.add(stolen); stolen.position.set(0, 0.2, 0.4);
      ctx.sfx('pop', 1.3);
      yield* wait(0.3);
      cam.close(ped, { hold: 2.2 });
      cam.freeze(0.6);
      faceTo(ped, lx, lz);
      yield* doubleTake(ctx, ped, '...');
      say(ctx, ped, 'SERIEUS?!', { size: 18, color: '#ff6b6b' });
      ctx.sfx('hey');
      R.run((function* () { yield* go(ctx, pig, lx + side * 6, lz + 1, 3); R.gone(pig); })());
      yield* wait(1.0);
      R.give(ped);
      yield* R.settle(10);
      done = true;
    } finally {
      cam.release();
      R.free(done);
    }
  },
};

G.doorbell = {
  w: [0, 3, 2, 1, 0.5], crime: 1,
  avail: (ctx) => ctx.L.houses.some((h) => !h.shop && !h.tower),
  *run(ctx) {
    const { L, rnd } = ctx;
    const h = rnd.pick(L.houses.filter((hh) => !hh.shop && !hh.tower && Math.abs(hh.door.x) < 18));
    if (!h) return;
    const kid = makePerson(rnd, { kind: 'kid' });
    const dir = h.door.x > 0 ? -1 : 1;
    yield* enter(ctx, kid, dir > 0 ? EX0 : EX1, L.walkB[0]);
    kid.gait = 'sneak'; kid.arms = 'sneak';
    yield* go(ctx, kid, h.door.x, h.door.z, 3);
    kid.heading = Math.PI;
    yield* wait(0.3);
    ctx.sfx('dingdong');
    ctx.fx.text('DING DONG!', at(h.door.x, 3, h.door.z - 0.6), { size: 18, color: '#ffe08a' });
    yield* wait(0.35);
    kid.gait = 'walk'; kid.arms = 'swing';
    say(ctx, kid, 'hihihi', { size: 13, color: '#b9fbc0' });
    ctx.incident();
    ctx.news('Belletje-lellen wave continues; prime suspect is nine');
    ctx.run(leave(ctx, kid, 7.5, dir > 0 ? EX0 : EX1));
    yield* wait(1.0);
    const owner = makePerson(rnd, { kind: rnd.pick(['civ', 'granny']) });
    yield* enter(ctx, owner, h.door.x, h.door.z);
    owner.heading = 0;
    say(ctx, owner, '?!', { size: 20, color: '#fff' });
    yield* wait(0.6); owner.heading = E; yield* wait(0.6); owner.heading = W; yield* wait(0.6); owner.heading = 0;
    owner.arms = 'fist';
    say(ctx, owner, rnd.pick(['RAKKERS!', 'ALWEER?!', 'TUIG!']), { size: 14, color: '#ff6b6b' });
    ctx.sfx('hey');
    yield* wait(1.2);
    yield* popOut(ctx, owner);
  },
};

G.parkingTicket = {
  w: [0, 2, 2, 1, 0], crime: 1,
  avail: (ctx) => ctx.L.parked.length > 0 && ctx.L.houses.length > 0,
  *run(ctx) {
    const { L, rnd } = ctx, car = rnd.pick(L.parked), cop = makePerson(rnd, { kind: 'cop' });
    const z = L.hw + L.bw + 0.75;
    yield* enter(ctx, cop, car.x > 0 ? EX1 : EX0, L.walkF[0]);
    yield* go(ctx, cop, car.x, z, 2.6);
    cop.heading = Math.PI; cop.arms = 'hold';
    say(ctx, cop, '*krabbel*', { size: 12, color: '#cfe8ff' });
    yield* wait(1.3);
    const t = item.ticket();
    t.position.set(car.x + 1.05, 0.97, car.z); // on the bonnet by the windscreen of the 4.4 m car
    ctx.world.add(t);
    ctx.sfx('coin');
    ctx.fx.text('BON! €109', at(car.x, 2.4, car.z), { size: 18, color: '#ffe066' });
    ctx.incident();
    ctx.news('Parking fine issued. Motorist "was only gone for a minute"');
    cop.arms = 'swing';
    const owner = makePerson(rnd, {});
    const h = L.houses.reduce((a, b) => (Math.abs(b.door.x - car.x) < Math.abs(a.door.x - car.x) ? b : a));
    yield* enter(ctx, owner, h.door.x, h.door.z);
    owner.arms = 'up';
    say(ctx, owner, 'NEEE! IK STA ER NET!', { size: 13, color: '#ff6b6b' });
    ctx.sfx('hey');
    yield* go(ctx, owner, car.x + 1.2, z + 0.3, 6);
    owner.heading = W;
    yield* wait(0.4);
    say(ctx, cop, 'helaas', { size: 12, color: '#cfe8ff' });
    yield* wait(1.2);
    ctx.run(leave(ctx, cop, 2.4));
    owner.arms = 'fist';
    yield* wait(1.6);
    owner.arms = 'swing';
    yield* go(ctx, owner, h.door.x, h.door.z, 2.6);
    yield* popOut(ctx, owner);
    ctx.world.remove(t);
  },
};

G.herringHeist = {
  w: [0, 2, 2, 1, 1], crime: 1,
  avail: (ctx) => ctx.L.stalls.length > 0,
  *run(ctx) {
    const { L, rnd } = ctx, s = rnd.pick(L.stalls), dog = makeDog(rnd);
    const dir = s.x > 0 ? -1 : 1, zz = Math.min(s.z, L.s0 - 0.6);
    dog.speed = 4;
    yield* enter(ctx, dog, dir > 0 ? EX0 : EX1, L.walkF[1]);
    yield* go(ctx, dog, s.x, zz, 4);
    dog.heading = 0;
    yield* hop(dog, 0.6, 0.3);
    const fish = sculpt((v) => { v.box(0, 0, 0, 0.5, 0.12, 0.14, '#b8c7d1'); v.box(0.3, 0, 0, 0.12, 0.2, 0.06, '#8fa3ad'); });
    dog.b.add(fish);
    fish.position.set(0, 0.42, 0.72);
    ctx.sfx('yoink');
    say(ctx, dog, 'YOINK!', { size: 20, color: '#ffd60a', off: 1.0 });
    ctx.incident();
    ctx.news(`Dog steals ${s.label === 'HARING' ? 'herring' : 'snack'}, shows zero remorse`);
    const chef = makePerson(rnd, { kind: 'chef' });
    ctx.run(leave(ctx, dog, 7.5, dir > 0 ? EX1 : EX0));
    ctx.sfx('bark');
    yield* enter(ctx, chef, s.x + 0.8, zz);
    chef.arms = 'fist';
    say(ctx, chef, rnd.pick(['KOM TERUG!', 'MIJN HARING!', 'HÉ! HOND!']), { size: 15, color: '#ff6b6b' });
    ctx.sfx('hey');
    yield* go(ctx, chef, dir > 0 ? EX1 - 6 : EX0 + 6, L.walkF[1], 5);
    chef.arms = 'swing';
    say(ctx, chef, '*zucht*', { size: 12, color: '#cfe8ff' });
    yield* wait(1);
    yield* go(ctx, chef, s.x + 0.8, zz, 2.4);
    yield* popOut(ctx, chef);
  },
};

G.bikeThief = {
  w: [0, 0, 3, 2, 2], crime: 1, need: ['racks'],
  *run(ctx) {
    const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'bikeThief'), R = rig(ctx), r = rnd.pick(L.racks);
    let done = false;
    try {
      const dir = r.x > 0 ? -1 : 1; // he comes from the far side and escapes across the street
      const rz = r.z + 0.35, edge = dir > 0 ? EX1 - 0.6 : EX0 + 0.6;
      const home = L.houses.length
        ? L.houses.reduce((a, b) => (Math.abs(b.door.x - r.x) < Math.abs(a.door.x - r.x) ? b : a))
        : { win: { x: clamp(r.x - dir * 4, EX0, EX1), y: 3, z: L.zH }, door: { x: clamp(r.x - dir * 4, EX0, EX1), z: L.walkB[1] } };
      const look = { shirt: rnd.pick(['#e84a5f', '#2a9d8f', '#f4a261', '#457b9d']), hair: rnd.pick(['#2b1d14', '#c58b3c', '#a33b20']), skin: rnd.pick(['#f2c9a0', '#c98e62', '#7a4f33']) };
      const th = makePerson(rnd, { kind: rnd.chance(0.6) ? 'raccoon' : 'robber' });

      // 1. casing the rack: walks past, looks around, doubles back
      cam.wide(pt(r.x, r.z), { dist: 22, hold: 4 });
      yield* R.enter(th, clamp(r.x - dir * 10, EX0, EX1), L.walkB[0]);
      th.gait = 'sneak'; th.arms = 'sneak';
      yield* go(ctx, th, r.x + dir * 2.5, L.walkB[0], 3.2);
      th.heading = Math.PI;
      yield* lookAround(th, 1.0, 0.3);
      yield* go(ctx, th, r.x, rz, 3.2);

      // 2. reveal
      th.gait = 'walk'; th.heading = 0;
      th.hold(item.cutters()); th.arms = 'hold';
      cam.low(th, { dist: 6, hold: 2.4 });
      cam.card('DE KNIPPER', 'Bike economy, Hague edition', 1.9);
      cam.freeze(0.7);
      ctx.sfx('sting');
      say(ctx, th, 'hehehe', { size: 13, color: '#b9fbc0' });
      yield* wait(0.6);
      th.heading = Math.PI;

      // 3. first lock: snip, snip, SNIP. It is the wrong bike
      cam.shot({ on: th, dist: 7, el: 0.35, az: 0.5, hold: 2.6, drift: { dist: -0.3 } });
      yield* wait(0.2);
      for (let i = 0; i < 3; i++) {
        ctx.sfx('snip'); ctx.fx.sparks(r.x, 0.9, r.z - 0.8, i === 2 ? 9 : 4); // lock on the 1.86 m bike parked at r.z - 1.15 .. r.z + 0.2
        yield* hop(th, 0.08, 0.16);
        yield* wait(0.12);
      }
      ctx.fx.text('KNIP!', at(r.x, 2.2, r.z), { size: 18, color: '#ffe08a' });
      const kid = makeBike(rnd, null, '#ff70a6');
      kid.body.scale.setScalar(0.55 * 1.19); // makeBike's own body scale is 1.19
      yield* R.enter(kid, r.x - dir * 0.9, rz + 0.55, 0);
      kid.face(dir > 0 ? E : W);
      mount(kid, th, 0.12);
      ctx.sfx('bell');
      say(ctx, th, 'YOINK!', { size: 20, color: '#ffd60a' });
      ctx.incident();
      // someone upstairs has noticed
      const owner = makePerson(rnd, look);
      owner.air = true;
      let balcony = null;
      R.run((function* () {
        yield* wait(0.6);
        // a little balcony to stand on, so nobody hovers in front of their own window
        balcony = R.add(piece((v) => {
          const bx = home.win.x, by = home.win.y - 0.42, bz = home.win.z + 0.45;
          v.box(bx, by, bz, 1.5, 0.12, 0.9, '#d6d0c2');
          v.box(bx, by + 0.12, bz + 0.42, 1.5, 1.0, 0.07, '#2f3640'); // 1 m railing for a 2 m person
          v.box(bx - 0.72, by + 0.12, bz, 0.07, 1.0, 0.9, '#2f3640');
          v.box(bx + 0.72, by + 0.12, bz, 0.07, 1.0, 0.9, '#2f3640');
        }));
        yield* R.enter(owner, home.win.x, home.win.z + 0.35, home.win.y - 0.3);
        owner.heading = 0; owner.arms = 'fist';
        yell(ctx, owner, 'HÉ! MIJN KINDERFIETS!', '#ff6b6b', 15);
      })());
      yield* rideTo(ctx, kid, th, r.x + dir * 3.6, rz + 0.55, 2.6, null, 0.12);
      cam.ots(th, owner, { hold: 2.6 });
      yield* doubleTake(ctx, th, '?!');
      dismount(th, kid.g.position.x - dir * 0.6, kid.g.position.z);
      th.arms = 'up'; th.heading = 0;
      say(ctx, th, 'TE KLEIN!', { size: 15, color: '#fff' });
      ctx.sfx('bonk');
      yield* tween(0.25, (t) => { kid.g.rotation.z = (dir > 0 ? -1 : 1) * 1.45 * ease.outQuad(t); kid.g.position.y = 0.2 * t; });
      yield* wait(0.4);
      th.arms = 'hold';
      say(ctx, th, 'sorry...', { size: 12, color: '#cfe8ff' });
      yield* wait(0.5);
      say(ctx, owner, 'nou, goed', { size: 12, color: '#cfe8ff' });
      owner.arms = 'swing';
      yield* wait(0.5);
      yield* R.out(owner);
      if (balcony) R.rm(balcony);

      // 4. the real bike
      th.heading = Math.PI;
      yield* go(ctx, th, r.x - dir * 0.3, rz, 3);
      th.heading = Math.PI;
      cam.shot({ on: th, dist: 6, el: 0.3, az: -0.5, hold: 2.2 });
      yield* wait(0.3);
      ctx.sfx('snip'); ctx.fx.sparks(r.x, 0.9, r.z - 0.8, 12);
      ctx.fx.text('KNIP!', at(r.x, 2.2, r.z), { size: 22, color: '#ffe08a' });
      ctx.shake(0.15);
      const bike = makeBike(rnd);
      yield* R.enter(bike, r.x - dir * 0.6, rz + 0.55, 0);
      bike.face(dir > 0 ? E : W);
      const chain = chainObj(R, 6);
      chain.place(bike.g.position.x, 0.3, bike.g.position.z);
      mount(bike, th);
      ctx.wanted = th;
      ctx.sfx('yoink'); ctx.sfx('bell');
      say(ctx, th, 'YOINK!', { size: 22, color: '#ffd60a' });
      ctx.news(`Bike stolen on ${ctx.st.name}. Witnesses: "ja, dat gebeurt"`);

      // 5. the getaway, with the cut lock still dragging sparks. The owner comes out of the front door
      const own2 = makePerson(rnd, look);
      R.run((function* () {
        yield* R.enter(own2, home.door.x, home.door.z);
        own2.arms = 'up';
        yell(ctx, own2, 'MIJN ECHTE FIETS!!', '#ff6b6b', 17);
        yield* goEach(ctx, own2, kid.g.position.x + dir * 5.5, L.walkB[1], 6.2);
        own2.arms = 'swing';
      })());
      cam.track(th, { hold: 4, lead: 3 });
      let spark = 0, rattle = 0, snag = false, tow = 0;
      yield* rideTo(ctx, bike, th, edge, rz + 0.55, 8.2, (dt) => {
        const q = bike.g.position, h = bike.g.rotation.y;
        chain.update(q.x - Math.sin(h) * 0.95, 0.3, q.z - Math.cos(h) * 0.95);
        const tl = chain.tail.position;
        spark -= dt; rattle -= dt;
        if (spark < 0) { spark = 0.07; ctx.fx.sparks(tl.x, 0.08, tl.z, 2); }
        if (rattle < 0) { rattle = 0.45; ctx.sfx('clatter'); }
        if (!snag && dir * (tl.x - kid.g.position.x) > 0) {
          snag = true;
          ctx.sfx('bell');
          say(ctx, th, 'KLING!', { size: 16, color: '#bfe9ff' });
          kid.g.rotation.z = 0; kid.g.position.y = 0;
        }
        if (snag) { // the discarded kid's bike is caught on the chain and dragged along
          tow += dt;
          kid.g.position.x = tl.x; kid.g.position.z = tl.z; kid.heading = h; kid.moving = 6;
          if (tow > 0.4) return true;
        }
      });
      // the catapult
      ctx.sfx('skid'); ctx.shake(0.35);
      cam.wide(pt(bike.g.position.x + dir * 2, rz), { dist: 18, hold: 2.5 });
      cam.freeze(0.4);
      const bq = bike.g.position, lx = bq.x + dir * 3.2, lz = bq.z;
      th.pose = null; th.arms = 'up'; th.air = true;
      const tx0 = bq.x, ty0 = th.g.position.y;
      ctx.sfx('boing');
      bike.g.rotation.order = 'YXZ';
      R.run(tween(0.9, (t) => { bike.g.rotation.x = t * TAU; bike.g.position.y = Math.sin(t * Math.PI) * 0.7; bike.g.position.x = tx0 + dir * 0.9 * t; }));
      yield* tween(0.85, (t) => {
        th.g.position.set(lerp(tx0, lx, t), lerp(ty0, 0.2, t) + Math.sin(t * Math.PI) * 1.9, lz);
        th.g.rotation.x = t * 1.45 + Math.sin(t * Math.PI) * 4;
      });
      ctx.sfx('thud'); ctx.shake(0.35);
      ctx.fx.puff(lx, 0.1, lz, '#e8e8e8');
      ctx.fx.text('PLOF!', at(lx, 1.3, lz), { size: 26, color: '#ffd60a' });
      kid.moving = 0; kid.g.rotation.z = 0;
      bike.g.rotation.x = 0; bike.g.position.y = 0;
      yield* wait(0.6);
      // sits up, stars circling
      th.g.rotation.x = 0; th.air = true; th.pose = 'sit'; th.g.position.y = 0.23; th.arms = 'swing';
      say(ctx, th, '★ ★', { size: 16, color: '#ffe066', dur: 1 });
      cam.close(th, { hold: 1.8 });

      // 6. comeuppance, scaled by level
      yield* R.settle(6);
      const cop = lv >= 4 ? makePerson(rnd, { kind: 'cop' }) : null;
      let copHere = false;
      if (cop) {
        R.run((function* () {
          yield* R.enter(cop, dir > 0 ? EX0 : EX1, lz);
          ctx.sfx('whistle');
          say(ctx, cop, 'POLITIE!', { color: '#7db8ff', size: 15 });
          yield* go(ctx, cop, lx - dir * 1.3, lz, 6.4);
          copHere = true;
        })());
        if (lv >= 5 && L.kind !== 'ped') R.run(R.police(dir, L.chaseZ, 11, 0.4));
      }
      yield* waitUntil(() => Math.abs(own2.g.position.x - lx) < 3.2, 3);
      faceTo(own2, lx, lz);
      own2.arms = 'fist';
      yell(ctx, own2, 'DAT WORDT €60!', '#ff6b6b', 15);
      yield* wait(0.5);
      th.arms = 'up';
      say(ctx, th, 'ik... eh...', { size: 12, color: '#cfe8ff' });
      if (cop) {
        yield* waitUntil(() => copHere, 6);
        th.pose = null; th.air = false; th.g.position.y = 0;
        th.arms = 'up';
        say(ctx, th, 'BUSTED!', { size: 24, color: '#7db8ff' });
        cam.close(th, { hold: 1.8 });
        cam.freeze(0.5);
        ctx.fx.burst(lx, 1.2, lz, { n: 12, colors: ['#ffd60a', '#fff'], speed: 5, up: 7, glow: true, size: [0.1, 0.18] });
        ctx.news('Bike thief caught after dragging own evidence 14 metres. Owner: "€60 for the lock"');
        yield* wait(1.4);
        own2.arms = 'swing';
        R.run(R.away(cop, dir * 6, 3.2));
        yield* wait(0.3);
        R.run(R.away(th, dir * 6, 3.2));
        R.run(R.out(bike)); R.run(R.out(kid));
        yield* go(ctx, own2, home.door.x, home.door.z, 4.5);
        yield* R.out(own2);
      } else {
        // the walk of shame: owner wheels the bike home, the kid's bike still rattling along on the chain
        yield* wait(0.3);
        th.pose = null; th.air = false; th.g.position.y = 0;
        th.arms = 'swing';
        const rackX = r.x - dir * 0.6;
        ctx.sfx('hey');
        cam.track(bike, { hold: 4, lead: 1 });
        R.run((function* () { // owner pushes the bike back, kid's bike in tow
          own2.arms = 'carry';
          yield* goEach(ctx, bike, rackX, rz + 0.55, 3.0, () => {
            const q = bike.g.position, h = bike.g.rotation.y;
            chain.update(q.x - Math.sin(h) * 0.95, 0.3, q.z - Math.cos(h) * 0.95);
            const tl = chain.tail.position;
            kid.g.position.x = tl.x; kid.g.position.z = tl.z; kid.heading = h; kid.moving = 2;
            own2.g.position.set(q.x - dir * 0.2, 0, q.z + 0.9); own2.heading = bike.heading; own2.moving = 2;
          });
        })());
        R.run(go(ctx, th, rackX - dir * 3, rz + 1.2, 3.0));
        ctx.news('Bike thief marched home by owner, towing a child\'s bike. "Still €60," says owner');
        yield* R.settle(10);
        own2.arms = 'fist';
        yell(ctx, own2, 'EN NU WEG!', '#ff6b6b', 15);
        yield* wait(0.6);
        R.run(R.away(th, -dir * 6, 3.6));
        own2.arms = 'swing';
        R.run(R.out(bike)); R.run(R.out(kid));
        yield* go(ctx, own2, home.door.x, home.door.z, 4.5);
        yield* R.out(own2);
      }
      cam.wide(pt(r.x, r.z), { dist: 24, hold: 2 });
      yield* R.settle(10);
      yield* wait(0.6);
      done = true;
    } finally {
      cam.release();
      R.free(done);
    }
  },
};

const TAG = ['111 111 111', '1 1   1 1 1', '1 1  1  1 1', '1 1 1   1 1', '111 1   111']; // "070"
const UNDER = ['11111111111']; // the critic's "improvement": a gold underline
G.graffiti = {
  w: [0, 0, 3, 2, 1.5], crime: 1,
  avail: (ctx) => !!ctx.L.box && (ctx.L.box.tags || 0) < 3,
  *run(ctx) {
    const { L, rnd } = ctx, lv = ctx.level, bx = L.box, cam = camFor(ctx, 'graffiti'), R = rig(ctx);
    const n = bx.tags || 0, col = ['#ff006e', '#3a86ff', '#ffbe0b'][n];
    let done = false, counted = false;
    try {
      bx.tags = n + 1; counted = true;
      const dir = rnd.sign(), spot = pt(bx.x, bx.z);
      const sz = bx.z + 0.75, lookX = clamp(bx.x + dir * 6.5, EX0 + 1, EX1 - 1), px = 0.15, by = bx.y || 0;
      const x0 = bx.x - (11 * px) / 2 + px / 2 + n * 0.08, y0 = by + 1.3 - n * 0.1, tz = bx.z + 0.03 + n * 0.02;
      const kid = makePerson(rnd, { kind: 'hoodie', shirt: rnd.pick(['#3a3a3a', '#5a189a', '#1b4332']) });
      const lookout = makePerson(rnd, { kind: 'hoodie', shirt: rnd.pick(['#7a2e0e', '#264653', '#6a040f']), scale: 1.1 });
      const tg = R.add(new THREE.Group()); // the tag lives in this group, positioned so it warps with the street
      tg.position.set(bx.x, 0.0001, tz);
      const pix = (gx, gy, color, h = 0.2) => { const m = sculpt((v) => v.box(0, -h, 0, px, h, 0.04, color), MAT.glow); m.position.set(gx, gy, 0); tg.add(m); return m; };

      // 1. set-up: a lookout takes position; the tagger creeps in from the other side
      cam.wide(spot, { dist: 22, hold: 4.5 });
      R.run((function* () {
        yield* R.enter(lookout, clamp(bx.x + dir * 14, EX0, EX1), L.walkF[1]);
        yield* go(ctx, lookout, lookX, L.walkF[1], 3);
        lookout.heading = dir > 0 ? E : W; lookout.arms = 'sneak';
        say(ctx, lookout, '♪ doe-niks ♪', { size: 12, color: '#cfe8ff' });
        for (let i = 0; i < 3; i++) yield* lookAround(lookout, 0.7, 0.3);
      })());
      yield* R.enter(kid, clamp(bx.x - dir * 13, EX0, EX1), L.walkF[1]);
      kid.gait = 'sneak'; kid.arms = 'sneak';
      yield* go(ctx, kid, bx.x - 1.3, sz, 3.4);

      // 2. reveal and warm-up: face to the lens, shake the can
      kid.gait = 'walk'; kid.heading = 0;
      kid.hold(item.spray());
      cam.low(kid, { dist: 6, hold: 2.5 });
      cam.card('DE SPUITER', 'Self-taught. Self-appointed.', 1.9);
      cam.freeze(0.7);
      ctx.sfx('sting');
      kid.arms = 'fist';
      for (let i = 0; i < 3; i++) { ctx.sfx('clatter'); if (i === 1) say(ctx, kid, 'klak klak', { size: 12, color: '#cfe8ff' }); yield* wait(0.38); }
      kid.arms = 'spray';
      kid.heading = Math.PI + 0.5;
      yield* wait(0.3);

      // 3. the tag, stroke by stroke, with the camera creeping in
      cam.shot({ on: spot, y: by + 1.1, dist: 8, el: 0.22, az: 0.3 * dir, hold: 5, drift: { dist: -0.35 } });
      let kx = kid.g.position.x;
      for (let c = 0; c < 11; c++) {
        ctx.sfx('spray');
        for (let r = 0; r < 5; r++) {
          if (TAG[r][c] !== '1') continue;
          pix(x0 - bx.x + c * px, y0 - r * 0.2 - 0.0, col);
          ctx.fx.sparks(x0 + c * px, y0 - r * 0.2 - 0.1, tz + 0.2, 1, [col, '#ffffff']);
        }
        const nx = bx.x - 0.85 + (c / 10) * 1.7, from = kx;
        yield* tween(0.2, (t) => { kid.g.position.x = lerp(from, nx, t); });
        kx = nx;
        if (c === 7) { ctx.sfx('whistle'); say(ctx, lookout, 'psst!', { size: 12, color: '#b9fbc0' }); }
      }
      kid.arms = 'swing';
      ctx.incident();
      say(ctx, kid, 'ZO DAN!', { size: 14, color: col });
      // fresh paint drips and a puddle
      for (let i = 0; i < 3; i++) {
        const dc = 1 + i * 4 + (i % 2), d = pix(x0 - bx.x + dc * px, y0 - 1.0, col, 1);
        d.scale.y = 0.001;
        R.run(tween(1.4 + i * 0.3, (t) => { d.scale.y = Math.max(0.001, (0.25 + i * 0.12) * t); }, ease.outQuad));
      }
      const pud = R.add(sculpt((v) => v.box(0, 0, 0, 0.9, 0.02, 0.5, col)));
      pud.position.set(bx.x + 0.4, 0.02, bx.z + 1.15);
      pud.scale.setScalar(0.001);
      R.run(tween(0.7, (t) => pud.scale.setScalar(Math.max(0.001, t)), ease.outQuad));
      // a critic wanders in from the side while he steps back to admire his work (straight through the puddle)
      const critic = takePed(ctx, 9, null, bx.x - dir * 4);
      let cr = critic;
      const vx = bx.x - dir * 2.3, vz = bx.z + 2.2;
      let crHere = false;
      if (critic) R.borrow(critic);
      else cr = makePerson(rnd, { kind: 'civ' });
      R.run((function* () {
        if (!critic) yield* R.enter(cr, clamp(bx.x - dir * 8, EX0, EX1), L.walkF[0]);
        yield* go(ctx, cr, vx, vz, 3.6);
        crHere = true;
      })());
      yield* wait(0.3);
      const prints = [];
      let wet = false, lastPx = 0, lastPz = 0, flip = 1;
      const track = (dt, s) => {
        const q = kid.g.position;
        if (!wet && Math.abs(q.x - pud.position.x) < 0.6 && Math.abs(q.z - pud.position.z) < 0.3) { wet = true; lastPx = q.x; lastPz = q.z; }
        if (wet && prints.length < 22 && Math.hypot(q.x - lastPx, q.z - lastPz) > 0.34) {
          lastPx = q.x; lastPz = q.z; flip = -flip;
          const f = R.add(sculpt((v) => v.box(0, 0, 0, 0.22, 0.02, 0.14, col)));
          f.position.set(q.x + Math.cos(kid.g.rotation.y) * 0.12 * flip, 0.025, q.z - Math.sin(kid.g.rotation.y) * 0.12 * flip);
          f.rotation.y = kid.g.rotation.y;
          prints.push(f);
        }
      };
      yield* goEach(ctx, kid, bx.x + 0.1, bx.z + 1.9, 1.6, track);
      kid.heading = Math.PI; kid.arms = 'swing';
      yield* waitUntil(() => crHere, 5);

      // 4. the critic's verdict
      cam.ots(kid, cr, { hold: 3.4 });
      cr.heading = Math.PI; cr.arms = 'hold';
      yield* wait(0.3);
      say(ctx, cr, 'hmm...', { size: 13, color: '#cfe8ff' });
      yield* lookAround(cr, 0.35, 0.35);
      ctx.fx.text('★☆☆☆☆', at(vx, 2.3, vz), { size: 20, color: '#ffe066', dur: 1.6 });
      say(ctx, cr, rnd.pick(['"Het mist diepgang."', '"Ik zie Banksy niet."', '"Mijn nichtje kan dit ook."']), { size: 13, color: '#fff', dur: 1.8 });
      ctx.sfx('gasp');
      yield* wait(0.9);
      kid.arms = 'fist';
      yell(ctx, kid, 'WAT?!', col, 16);
      // ...and improves it
      yield* wait(0.6);
      const can = kid.drop();
      cr.hold(can);
      cr.arms = 'spray';
      say(ctx, kid, 'HÉ!', { size: 15, color: '#fff' });
      yield* go(ctx, cr, bx.x + 0.1, sz, 3.2);
      cr.heading = Math.PI;
      cam.shot({ on: spot, y: by + 1.1, dist: 7, el: 0.22, az: -0.3 * dir, hold: 2.4 });
      for (let c = 0; c < 11; c++) {
        ctx.sfx('spray');
        for (let r = 0; r < 1; r++) {
          if (UNDER[r][c] !== '1') continue;
          pix(x0 - bx.x + c * px, y0 - 1.03, '#ffd60a', 0.08);
          ctx.fx.sparks(x0 + c * px, y0 - 1.07, tz + 0.2, 1, ['#ffd60a', '#ffffff']);
        }
        yield* wait(0.09);
      }
      say(ctx, cr, 'Beter.', { size: 15, color: '#fff' });
      kid.arms = 'up';
      ctx.sfx('boing');
      yield* all(hop(kid, 0.5, 0.35), wait(0.5));
      cr.drop(); cr.arms = 'swing';

      // 5. the law arrives, and the lookout was looking the wrong way
      const cop = makePerson(rnd, { kind: 'cop' });
      yield* R.enter(cop, clamp(bx.x + dir * 11, EX0, EX1), L.walkF[1]);
      ctx.sfx('whistle');
      say(ctx, cop, 'FWEEET! HÉ JIJ!', { size: 15, color: '#7db8ff' });
      yell(ctx, lookout, 'AGENT!!!', '#b9fbc0', 16);
      cam.ots(cop, kid, { hold: 1.2 });
      const kidOut = dir > 0 ? EX0 : EX1; // they flee away from the cop
      yield* wait(0.35);
      kid.arms = 'swing';
      say(ctx, kid, 'OEPS', { size: 14, color: '#fff' });
      lookout.arms = 'swing';
      R.run(R.leave(lookout, 7.4, kidOut));
      // overhead: the paint trail zig-zags away
      cam.top(spot, { dist: 24, hold: 3.4 });
      let sk = 0;
      const flee = R.run((function* () {
        yield* goEach(ctx, kid, kidOut, L.walkF[1], 7.4, (dt) => {
          const q = kid.g.position;
          if (prints.length < 22 && Math.hypot(q.x - lastPx, q.z - lastPz) > 0.38) {
            lastPx = q.x; lastPz = q.z; flip = -flip;
            const f = R.add(sculpt((v) => v.box(0, 0, 0, 0.22, 0.02, 0.14, col)));
            f.position.set(q.x, 0.025, q.z + 0.13 * flip); f.rotation.y = kid.g.rotation.y;
            prints.push(f);
          }
        });
        yield* R.out(kid);
      })());
      // the cop heads straight for the tag and the puddle
      const cp = cop.g.position;
      yield* go(ctx, cop, bx.x + dir * 1.6, pud.position.z, 5.2);
      cop.heading = Math.PI;
      yield* lookAround(cop, 0.8, 0.28);
      say(ctx, cop, 'VOETAFDRUKKEN?', { size: 13, color: '#7db8ff' });
      yield* wait(0.3);
      // whoops
      cop.g.rotation.order = 'YXZ';
      ctx.sfx('skid'); ctx.sfx('boing');
      say(ctx, cop, 'WHOEAH!', { size: 20, color: '#ffffff' });
      const sx = cp.x;
      yield* tween(0.6, (t) => { cp.x = sx - dir * 2.4 * t; cop.g.rotation.x = -1.0 * Math.sin(t * Math.PI * 0.9); cp.y = Math.sin(t * Math.PI) * 0.5; cop.moving = 0; });
      cp.y = 0; cop.g.rotation.x = 0;
      ctx.sfx('thud'); ctx.shake(0.3);
      ctx.fx.puff(cp.x, 0.1, cp.z, col);
      ctx.fx.text('PLOF!', cop, { size: 24, color: '#ffd60a' });
      cop.pose = 'sit'; cop.air = true; cp.y = 0.23; cop.heading = 0;
      say(ctx, cop, '★ ★', { size: 15, color: '#ffe066', dur: 1 });
      cam.close(cop, { hold: 1.8 });
      if (lv >= 4) R.run(R.cop(kid, 7, 0.3, 'POLITIE!'));
      if (lv >= 5 && L.kind !== 'ped') R.run(R.police(-dir, L.chaseZ, 11, 0.5));
      yield* wait(1.4);
      // 6. punchline: blue-booted cop, smug critic, a gold underline on the tag
      cop.pose = null; cop.air = false; cp.y = 0; cop.arms = 'swing';
      say(ctx, cr, 'Zie je wel. Kunst.', { size: 13, color: '#fff' });
      ctx.news('Unknown artist tags "070" on transformer box. Critics: "derivative", then "improved"');
      cam.wide(spot, { dist: 22, hold: 3 });
      R.give(critic ? cr : null);
      yield* wait(0.6);
      R.run(R.away(cop, dir * 6, 3.6));
      if (!critic) R.run(R.away(cr, -dir * 6, 3.4));
      yield* R.settle(10);
      // the wet footprints dry up and fade
      yield* tween(0.5, (t) => { for (const f of prints) f.scale.setScalar(Math.max(0.001, 1 - t)); });
      for (const f of prints) R.rm(f);
      R.rm(pud);
      R.stay(tg);
      yield* wait(0.4);
      done = true;
    } finally {
      cam.release();
      if (counted && !done) bx.tags = n;
      R.free(done);
    }
  },
};

G.pickpocket = {
  w: [0, 0, 3, 2, 2], crime: 1,
  *run(ctx) {
    const { rnd } = ctx;
    const ped = yield* needPed(ctx, 9);
    if (!ped) return;
    const dir = ped.dir, thief = makePerson(rnd, { kind: 'robber' });
    const p = ped.g.position;
    yield* enter(ctx, thief, clamp(p.x - dir * 7, EX0, EX1), ped.lineZ);
    thief.gait = 'sneak'; thief.arms = 'sneak';
    const got = yield* raceChase(ctx, ped, thief);
    if (!got) { yield* leave(ctx, thief, 6); release(ctx, ped); return; }
    thief.gait = 'walk';
    thief.hold(item.wallet());
    thief.arms = 'hold';
    ctx.sfx('yoink');
    say(ctx, thief, 'YOINK!', { size: 22, color: '#ffd60a' });
    ctx.wanted = thief;
    ctx.incident();
    ctx.news('Pickpocket nabs wallet containing €5 and nine loyalty cards');
    ctx.run(leave(ctx, thief, 7.8, dir > 0 ? EX0 : EX1));
    yield* wait(0.6);
    ped.heading = dir > 0 ? W : E;
    ped.arms = 'fist';
    ctx.sfx('hey');
    say(ctx, ped, rnd.pick(['HÉ! DIEF!', 'HOUD DE DIEF!', 'MIJN PORTEMONNEE!']), { size: 15, color: '#ff6b6b' });
    yield* wait(0.5);
    if (ctx.level >= 4) ctx.run(footCop(ctx, thief, 7, 0));
    ped.exitX = dir > 0 ? EX0 : EX1;
    ped.walkSpeed = 5.2;
    release(ctx, ped);
    ped.arms = 'fist';
    yield* wait(3);
  },
};
function* raceChase(ctx, ped, thief) {
  // ped ambles on while the thief tiptoes up behind
  let caught = false;
  yield* race(
    go(ctx, ped, ped.exitX, ped.lineZ, 1.5),
    (function* () { caught = yield* chase(ctx, thief, ped, 3.6, 0.85, 9); })()
  );
  return caught;
}

G.burglar = {
  w: [0, 0, 0, 3, 2], crime: 2,
  avail: (ctx) => ctx.L.houses.some((h) => !h.tower && Math.abs(h.x) < 19),
  *run(ctx) {
    const { L, rnd } = ctx;
    const pool = L.houses.filter((h) => !h.tower && Math.abs(h.x) < 15);
    const h = rnd.pick(pool.length ? pool : L.houses.filter((hh) => !hh.tower && Math.abs(hh.x) < 19));
    const zH = h.z;
    const dir = h.x > 0 ? -1 : 1;
    // alarm lamp
    const lamp = sculpt((v) => v.box(h.x - h.w / 2 + 0.4, 2.9, zH + 0.2, 0.3, 0.3, 0.3, '#ff2d2d'), MAT.glow);
    ctx.world.add(lamp);
    ctx.sfx('alarm');
    ctx.fx.text('WEE-OO! WEE-OO!', at(h.x, Math.min(h.top, 9) + 0.5, zH), { size: 18, color: '#ff6b6b', dur: 2 });
    const blink = ctx.run((function* () { let t = 0; for (;;) { t += yield; lamp.visible = Math.floor(t * 6) % 2 === 0; } })());
    const rob = makePerson(rnd, { kind: 'robber' });
    rob.hold(item.sack(), 'back');
    rob.air = true;
    yield* enter(ctx, rob, h.win.x, h.win.z + 0.35, h.win.y - 0.3);
    rob.heading = 0;
    ctx.focus(h.x, zH + 2, 0.62, 3.2, 2);
    say(ctx, rob, 'hehehe', { size: 14, color: '#b9fbc0' });
    yield* wait(0.5);
    const y0 = rob.g.position.y, yg = 0;
    yield* tween(0.45, (t) => { rob.g.position.y = y0 + (yg - y0) * ease.inQuad(t) + Math.sin(t * Math.PI) * 1.2; rob.g.position.z = h.win.z + 0.35 + t * 1.3; });
    rob.air = false;
    ctx.sfx('thud');
    ctx.fx.puff(rob.g.position.x, yg, rob.g.position.z, '#e8e8e8');
    say(ctx, rob, 'OEF!', { size: 15, color: '#fff' });
    ctx.wanted = rob;
    ctx.incident(2);
    ctx.news(`Burglar exits ${ctx.st.name} home via window "like a professional"`);
    yield* wait(0.35);
    const trail = ctx.run((function* () { for (;;) { yield* wait(0.3); if (rob.alive) ctx.fx.cash(rob.g.position.x, 1.2, rob.g.position.z, 1, 2, 4); } })());
    const busted = rnd.chance(0.35);
    ctx.run(footCop(ctx, rob, busted ? 8.4 : 5.6, 0.2));
    if (L.kind !== 'ped' && ctx.road.closed === 0) ctx.run((function* () { yield* closeRoad(ctx); yield* policeRun(ctx, dir, L.chaseZ, 9, 0); openRoad(ctx); })());
    rob.arms = 'swing';
    if (busted) {
      yield* go(ctx, rob, h.x + dir * 12, L.walkB[1], 6);
      ctx.sfx('slam');
      ctx.fx.puff(rob.g.position.x, 0.8, rob.g.position.z, '#ffe08a');
      ctx.fx.burst(rob.g.position.x, 1.15, rob.g.position.z, { n: 12, colors: ['#ffd60a', '#fff'], speed: 5, up: 7, glow: true, size: [0.1, 0.18] });
      say(ctx, rob, 'BUSTED!', { size: 26, color: '#7db8ff' });
      rob.arms = 'up';
      ctx.news('Burglar caught after 12-metre pursuit. Officer "barely winded"');
      yield* wait(1.4);
      yield* leave(ctx, rob, 3, dir > 0 ? EX0 : EX1);
    } else {
      yield* leave(ctx, rob, 7.4, dir > 0 ? EX1 : EX0);
    }
    ctx.runner.stop(trail);
    yield* wait(1.5);
    ctx.runner.stop(blink);
    ctx.world.remove(lamp);
  },
};

const gateProp = () => piece((v, gl) => {
  for (const sx of [-0.8, 0.8]) { v.box(sx, 0, 0, 0.12, 2.1, 0.12, '#cfd8dc'); gl.box(sx, 2.1, 0, 0.18, 0.16, 0.18, '#ff2d2d'); } // 2.1 m: taller than a 2 m person
  v.box(0, 2.1, 0, 1.72, 0.06, 0.12, '#b0bec5');
}, 21);
const cartProp = () => sculpt((v) => {
  v.box(0, 0.28, 0, 1.0, 0.05, 0.62, '#9aa5ad');
  v.box(0, 0.3, 0.3, 1.0, 0.4, 0.04, '#b8c2c9'); v.box(0, 0.3, -0.3, 1.0, 0.4, 0.04, '#b8c2c9');
  v.box(-0.5, 0.3, 0, 0.04, 0.4, 0.62, '#b8c2c9'); v.box(0.5, 0.3, 0, 0.04, 0.4, 0.62, '#b8c2c9');
  v.box(0, 0.78, -0.4, 0.9, 0.05, 0.05, '#d62828');
  v.box(-0.42, 0.28, -0.4, 0.05, 0.5, 0.05, '#9aa5ad'); v.box(0.42, 0.28, -0.4, 0.05, 0.5, 0.05, '#9aa5ad');
  for (const sx of [-0.4, 0.4]) for (const sz of [-0.25, 0.25]) v.box(sx, 0, sz, 0.1, 0.24, 0.1, '#1c1c1c');
});

G.shopHeist = {
  w: [0, 0, 0, 3, 2], crime: 2,
  avail: (ctx) => ctx.L.shops.some((s) => s.shop !== 'BANK'),
  *run(ctx) {
    const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'shopHeist'), R = rig(ctx), s = rnd.pick(L.shops.filter((x) => x.shop !== 'BANK'));
    let done = false;
    try {
      const dir = s.x > 0 ? -1 : 1, hd = dir > 0 ? E : W;
      const dx = s.door.x, dzr = s.door.z, gz = dzr + 0.55, cz = Math.min(dzr + 1.3, L.walkB[1]), cx = clamp(dx + dir * 2.0, EX0 + 1, EX1 - 1);
      const door = pt(dx, dzr + 0.6), edge = dir > 0 ? EX1 : EX0;
      const rob = makePerson(rnd, { kind: 'robber' }), keeper = makePerson(rnd, { kind: 'chef' });
      const gate = R.add(gateProp());
      gate.position.set(dx, 0.001, gz);
      const cart = R.add(cartProp());
      cart.position.set(cx, 0.001, cz); cart.rotation.y = hd;
      const stack = []; // loot standing on the cart: [mesh, local x, local y]
      let sway = 0, swayOn = true, ang = 0, t = 0;
      R.run((function* () {
        while (swayOn) {
          const dt = yield;
          t += dt;
          ang = sway * Math.sin(t * 6.5);
          const cp = cart.position;
          for (const [m, lx, ly] of stack) {
            m.position.set(cp.x + lx * Math.cos(ang) + ly * Math.sin(ang), cp.y + 0.3 + ly * Math.cos(ang), cp.z);
            m.rotation.z = -ang;
          }
        }
      })());
      const addLoot = (m, ly) => { R.add(m); stack.push([m, rnd.range(-0.12, 0.12), ly]); m.position.set(cart.position.x, 0.6 + ly, cart.position.z); sway = 0.012 * stack.length * stack.length; };

      // 1. set-up: the shopkeeper sweeps the pavement, back half turned
      cam.wide(door, { dist: 22, hold: 4 });
      const sweep = R.run((function* () {
        yield* R.enter(keeper, dx, dzr);
        keeper.hold(item.broom());
        yield* go(ctx, keeper, dx - dir * 2.3, cz + 0.5, 2.4);
        keeper.arms = 'spray'; keeper.heading = 0;
        say(ctx, keeper, '*veeg veeg*', { size: 12, color: '#cfe8ff' });
        for (;;) { yield* tween(1.2, (u) => { keeper.g.position.x = dx - dir * (2.3 + 0.5 * Math.sin(u * Math.PI * 2)); }); }
      })());
      yield* R.enter(rob, clamp(dx - dir * 14, EX0, EX1), L.walkB[1]);
      rob.gait = 'sneak'; rob.arms = 'sneak';
      yield* go(ctx, rob, cx - dir * 1.4, cz, 3.2);
      rob.gait = 'walk'; rob.heading = 0;
      yield* lookAround(rob, 0.8, 0.28);

      // 2. reveal
      rob.heading = 0; rob.arms = 'hold';
      cam.low(rob, { dist: 6, hold: 2.4 });
      cam.card('DE KLANT', 'Always right. Never pays.', 1.9);
      cam.freeze(0.7);
      ctx.sfx('sting');
      say(ctx, rob, 'ik kijk alleen', { size: 12, color: '#b9fbc0' });
      yield* wait(1.1);

      // 3. the spree: each trip into the shop, back with something bigger on the cart
      const doorWalk = function* () {
        rob.arms = 'swing';
        yield* go(ctx, rob, dx, gz + 0.1, 4);
        rob.g.visible = false;
        ctx.sfx('dingdong');
        yield* wait(0.45);
        rob.g.visible = true;
      };
      cam.shot({ on: pt((cx + dx) / 2, cz), dist: 12, el: 0.5, hold: 3.2 });
      for (let i = 0; i < 2; i++) {
        yield* doorWalk();
        const m = lootBox(i + 1);
        rob.hold(m, 'front'); rob.arms = 'carry';
        yield* go(ctx, rob, cx - dir * 0.8, cz, 4);
        rob.drop();
        ctx.sfx('yoink', 1.2);
        say(ctx, rob, ['YOINK', 'EN DIT!'][i], { size: 14, color: '#ffd60a' });
        addLoot(m, 0.15 + stack.length * 0.34);
        yield* hop(rob, 0.12, 0.15);
      }
      ctx.incident(2);
      ctx.news(`Television leaves ${s.shop} without paying`);
      // the television, with its security tag still on
      yield* doorWalk();
      const tv = item.tv();
      rob.hold(tv, 'front'); rob.arms = 'carry';
      ctx.wanted = rob;
      cam.close(rob, { hold: 3.2, drift: { dist: -0.6 } });
      ctx.sfx('alarm');
      yield* go(ctx, rob, dx, gz + 0.9, 3);
      // PIEP PIEP PIEP: the gate lights up with the robber half-way through it
      ctx.fx.text('PIEP! PIEP! PIEP!', at(dx, 2.5, gz), { size: 18, color: '#ff6b6b', dur: 1.8 });
      ctx.shake(0.15);
      const gblink = R.run((function* () { let u = 0; for (;;) { u += yield; gate.children[1].visible = Math.floor(u * 6) % 2 === 0; } })());
      rob.moving = 0;
      yield* wait(0.9); // frozen mid-step, tension

      // 4. complication: the shopkeeper turns round, very slowly
      yield* lookAround(rob, 0.9, 0.3);
      say(ctx, rob, '...niks aan de hand', { size: 12, color: '#b9fbc0' });
      R.stop(sweep);
      keeper.heading = hd;
      yield* wait(0.6);
      keeper.heading = Math.atan2(rob.g.position.x - keeper.g.position.x, 3);
      cam.ots(keeper, rob, { hold: 2.6 });
      yield* doubleTake(ctx, keeper, 'HÈ?!');
      keeper.arms = 'fist';
      yell(ctx, keeper, 'DIEF! HOUD HEM TEGEN!', '#ff6b6b', 14);
      const crowd = gather(ctx, R, dx, 2, 14);
      crowd.forEach((c, i) => { if (i) { faceTo(c, dx, gz); c.arms = 'up'; say(ctx, c, 'OEI!', { size: 13, color: '#fff' }); } else filmIt(c, dx, gz); });
      // the television goes on top of the pile; he grabs the cart and runs
      rob.drop();
      addLoot(tv, 0.15 + stack.length * 0.34 + 0.1);
      ctx.sfx('yoink');
      yield* go(ctx, rob, cx - dir * 1.2, cz + 0.05, 4.5);

      // 5. the getaway: a shopping cart with a leaning tower of goods, dropping things as it goes
      cam.track(rob, { hold: 5, lead: 3 });
      rob.arms = 'carry'; rob.heading = hd;
      const chaseT = R.run(chase(ctx, keeper, rob, 5.6, 0.9, 12));
      let spill = 0, spillT = 0.5;
      const x0 = rob.g.position.x;
      yield* goEach(ctx, rob, edge, cz, 6.4, (dt) => {
        const rp = rob.g.position;
        cart.position.set(rp.x + dir * 1.15, 0.001, rp.z); cart.rotation.y = rob.heading;
        sway = Math.min(0.5, sway + dt * 0.12);
        spillT -= dt;
        if (spillT < 0 && spill < 1 && stack.length >= 3) { // one box works loose from the middle of the pile
          spill++;
          const [m] = stack.splice(1, 1)[0];
          ctx.sfx('clatter');
          R.run(arc(m, rp.x - dir * 2, 0.05, cz + 0.5, 1.4, 0.6, 5));
          say(ctx, rob, 'OEPS', { size: 13, color: '#fff' });
        }
        if (Math.abs(rp.x - x0) > 7.5) return true;
      });
      R.stop(chaseT);
      R.run(go(ctx, keeper, rob.g.position.x - dir * 2.6, cz, 6.5));
      ctx.sfx('slam'); ctx.shake(0.5);
      cam.freeze(0.7);
      cam.wide(pt(rob.g.position.x, cz), { dist: 20, hold: 3 });
      swayOn = false;
      R.stop(gblink);
      // the avalanche
      const rp = rob.g.position;
      let hat = null;
      stack.forEach(([m], i) => {
        R.run(arc(m, rp.x + rnd.range(-3, 3) * (i + 1) * 0.5, 0.05, cz + rnd.range(-1.2, 1.2), rnd.range(1.5, 3), rnd.range(0.7, 1.1), rnd.range(-8, 8)));
        m.rotation.z = 0;
      });
      // one box lands on his head
      hat = lootBox(5); hat.scale.setScalar(0.8);
      rob.hold(hat, 'head');
      rob.arms = 'up';
      ctx.fx.puff(rp.x, 0.2, cz);
      R.panic(rp.x, 12, 3);
      ctx.fx.sparks(rp.x + dir, 0.6, cz, 10);
      ctx.fx.text('KLETTER-KLETTER-BOEM!', at(rp.x, 2.5, cz), { size: 20, color: '#ffd60a' });
      ctx.fx.cash(rp.x, 1.15, cz, 10, 3, 5);
      ctx.sfx('clatter'); ctx.sfx('thud');
      R.run(tween(0.6, (u) => { cart.rotation.z = (dir > 0 ? -1 : 1) * 1.4 * ease.outQuad(u); cart.position.y = 0.3 * u; }));
      rob.pose = 'sit'; rob.air = true; rp.y = 0.23;
      say(ctx, rob, '★ ★', { size: 16, color: '#ffe066', dur: 1 });
      yield* wait(0.9);

      // 6. comeuppance: the law, and the broom
      ctx.news(`Shoplifter's cart of goodies collapses on ${ctx.st.name}; shopkeeper "swept up before the police arrived"`);
      const cop = makePerson(rnd, { kind: 'cop' });
      yield* R.enter(cop, clamp(rp.x - dir * 9, EX0, EX1), cz);
      ctx.sfx('whistle');
      say(ctx, cop, 'POLITIE! BLIJF ZITTEN!', { size: 14, color: '#7db8ff' });
      if (lv >= 5) {
        if (L.kind !== 'ped') R.run(R.police(dir, L.chaseZ, 11, 0.3));
        R.run(R.cop(rob, 6, 0.5, 'DIT IS DE POLITIE!'));
      }
      cam.ots(keeper, rob, { hold: 2.4 });
      yield* go(ctx, cop, rp.x - dir * 1.4, cz, 7);
      cop.heading = hd;
      yield* waitUntil(() => Math.abs(keeper.g.position.x - (rp.x - dir * 2.6)) < 0.3, 3);
      // reverse spree: the shopkeeper sweeps all the goods back to the door
      keeper.arms = 'spray';
      ctx.sfx('whoosh');
      ctx.fx.text('UITVERKOOP!', at(dx, 3.4, dzr), { size: 22, color: '#ffd60a', dur: 2 });
      for (const [m] of stack) R.run((function* () { yield* wait(rnd.range(0, 0.5)); yield* arc(m, dx, 0.8, dzr + 0.3, 1.2, 0.8, 5); R.rm(m); })());
      yield* wait(1.0);
      yell(ctx, keeper, 'DAT IS DAN €1.249,95!', '#ffd166', 13);
      rob.pose = null; rob.air = false; rp.y = 0;
      rob.drop();
      rob.arms = 'up';
      say(ctx, rob, 'contant?', { size: 12, color: '#cfe8ff' });
      cam.close(rob, { hold: 2 });
      yield* wait(0.8);
      // the broom escorts him out
      for (const c of crowd) R.give(c);
      R.run(R.away(cop, dir * 6, 3.6));
      yield* wait(0.3);
      R.run(R.away(rob, dir * 6, 3.6));
      R.run(R.out(keeper));
      R.run(vanish(R, cart, 0.4));
      cam.wide(door, { dist: 22, hold: 2 });
      R.stop(gblink); gate.children[1].visible = true;
      yield* R.settle(10);
      yield* wait(0.4);
      done = true;
    } finally {
      cam.release();
      R.free(done);
    }
  },
};

G.scooterSnatch = {
  w: [0, 0, 0, 3, 2], crime: 2,
  *run(ctx) {
    const { L, rnd } = ctx, dir = rnd.sign();
    const z = dir > 0 ? L.bikeF : L.bikeB, wz = dir > 0 ? L.walkF[0] : L.walkB[1];
    const vic = makePerson(rnd, { kind: 'granny' });
    const purse = vic.hold(item.purse());
    yield* enter(ctx, vic, dir > 0 ? EX1 : EX0, wz);
    const walk = ctx.run(go(ctx, vic, 0, wz, 2.0));
    yield* wait(2.5);
    const r1 = makePerson(rnd, { kind: 'robber', scale: 1.1 }), r2 = makePerson(rnd, { kind: 'robber', scale: 1.1 });
    const sc = makeScooter(rnd, [r1, r2]);
    yield* enter(ctx, sc, dir > 0 ? EX0 + 1 : EX1 - 1, z, 0);
    sc.face(dir > 0 ? E : W);
    ctx.wanted = sc;
    ctx.sfx('skid');
    r2.arms = 'wave';
    let snatched = false;
    yield* race(
      go(ctx, sc, dir > 0 ? EX1 - 1 : EX0 + 1, z, 10),
      (function* () {
        for (;;) {
          yield;
          if (!snatched && Math.abs(sc.g.position.x - vic.g.position.x) < 0.9) {
            snatched = true;
            vic.drop();
            r2.hold(purse);
            ctx.sfx('yoink');
            say(ctx, sc, 'YOINK!', { size: 24, color: '#ffd60a' });
            ctx.incident(2);
            ctx.news('Scooter duo snatches handbag. Contents: pepermunt, tissues');
            ctx.run((function* () {
              const r0 = vic.g.rotation.y;
              vic.arms = 'up';
              yield* tween(0.7, (t) => { vic.g.rotation.y = r0 + t * TAU * 2; vic.heading = vic.g.rotation.y; });
              vic.heading = 0;
              ctx.sfx('hey');
              say(ctx, vic, 'MIJN TAS! SCHOFTEN!', { size: 15, color: '#ff6b6b' });
            })());
          }
        }
      })()
    );
    yield* popOut(ctx, sc);
    if (L.kind !== 'ped' && ctx.road.closed === 0) ctx.run((function* () { yield* closeRoad(ctx); yield* policeRun(ctx, dir, L.chaseZ, 11, 0); openRoad(ctx); })());
    yield* wait(2.2);
    vic.arms = 'fist';
    yield* wait(1.2);
    vic.arms = 'swing';
    ctx.runner.stop(walk);
    yield* leave(ctx, vic, 2.6);
  },
};

G.fireworks = {
  w: [0, 0, 0.6, 2, 2.5], crime: 1, need: ['bins'],
  *run(ctx) {
    const { L, rnd } = ctx, bin = rnd.pick(L.bins), kid = makePerson(rnd, { kind: 'hoodie', scale: 1.05 });
    const dir = rnd.sign();
    yield* enter(ctx, kid, dir > 0 ? EX0 : EX1, L.walkF[0]);
    yield* go(ctx, kid, bin.x - dir * 0.9, bin.z + 0.9, 4);
    kid.heading = Math.atan2(dir, -1);
    kid.arms = 'hold';
    const rocket = sculpt((v) => { v.box(0, 0, 0, 0.16, 0.6, 0.16, '#e63946'); v.box(0, 0.6, 0, 0.2, 0.2, 0.2, '#ffd60a'); }, MAT.glow);
    rocket.position.set(bin.x, 1.1, bin.z);
    ctx.world.add(rocket);
    yield* wait(0.5);
    ctx.sfx('fuse');
    kid.arms = 'swing';
    ctx.run(go(ctx, kid, bin.x - dir * 5, L.walkF[1], 6.5));
    for (let i = 0; i < 12; i++) { ctx.fx.sparks(bin.x, 1.15, bin.z, 2); yield* wait(0.1); }
    kid.heading = Math.atan2(dir, 0); kid.arms = 'up';
    for (let k = 0; k < 3; k++) {
      ctx.sfx('rocket');
      const x = bin.x + (k ? rnd.range(-5, 5) : 0), zz = bin.z + (k ? rnd.range(-6, 2) : 0), top = rnd.range(11, 14);
      rocket.visible = k === 0;
      yield* tween(0.6, (t) => {
        const y = 1.1 + t * (top - 1.1);
        if (k === 0) rocket.position.set(bin.x + (x - bin.x) * t, y, bin.z + (zz - bin.z) * t);
        ctx.fx.sparks(bin.x + (x - bin.x) * t, y, bin.z + (zz - bin.z) * t, 1);
      }, ease.outQuad);
      rocket.visible = false;
      ctx.sfx('pang');
      ctx.fx.firework(x, top, zz);
      ctx.flash('rgba(255,240,200,0.25)', 0.25);
      ctx.fx.text(k === 0 ? 'PANG!' : rnd.pick(['KNAL!', 'BOEM!', 'FIEEEW!']), at(x, top - 1, zz), { size: 24, color: '#ffe08a' });
      if (k === 0) { ctx.incident(); ctx.news('Illegal fireworks reported. It is not even December'); ctx.fx.burst(bin.x, 1, bin.z, { n: 10, colors: ['#2e7d4f', '#1f5a38', '#999'], speed: 4, up: 9 }); }
      yield* wait(0.45);
    }
    ctx.world.remove(rocket);
    for (const p of ctx.peds) if (!p.busy && Math.random() < 0.3) say(ctx, p, 'OOOH!', { size: 12, color: '#fff' });
    kid.arms = 'swing';
    ctx.run(footCop(ctx, kid, 6.4, 0.2));
    yield* wait(0.6);
    yield* leave(ctx, kid, 7.4, dir > 0 ? EX0 : EX1);
  },
};

G.carChase = {
  w: [0, 0, 0.4, 1.2, 3], crime: 3, lock: 'road',
  avail: (ctx) => ctx.L.hw >= 2.2,
  *run(ctx) {
    const { L, rnd } = ctx;
    yield* closeRoad(ctx);
    let dir = rnd.sign();
    ctx.news(`High-speed chase on ${ctx.st.name}! Top speed: 34 km/h`);
    ctx.incident(3);
    for (let pass = 0; pass < 2; pass++) {
      const van = makeCar(rnd, 'van', L.night);
      const zc = L.chaseZ, x0 = dir > 0 ? X0 + 2.6 : X1 - 2.6, x1 = dir > 0 ? X1 - 2.6 : X0 + 2.6;
      ctx.sfx('skid');
      yield* enter(ctx, van, x0, zc, 0);
      van.face(dir > 0 ? E : W);
      ctx.wanted = van;
      say(ctx, van, pass ? 'ANDERE KANT OP!' : 'GASSEN!', { size: 16, color: '#ffd60a' });
      const sway = L.kind === 'minor' ? 0.25 : 1.1;
      const runVan = (function* () {
        let t = 0, drop = 0;
        while (Math.abs(van.g.position.x - x1) > 0.3) {
          const dt = yield;
          t += dt; drop -= dt;
          const p = van.g.position, nx = p.x + dir * 13 * dt, nz = zc + Math.sin(t * 5) * sway;
          van.heading = Math.atan2(nx - p.x, nz - p.z);
          p.x = dir > 0 ? Math.min(nx, x1) : Math.max(nx, x1); p.z = nz;
          van.moving = 13;
          if (drop < 0) { ctx.fx.cash(p.x - dir * 2, 1.4, p.z, 2, 3, 5); ctx.fx.smoke(p.x - dir * 2.2, 0.3, p.z, 1, ['#ddd', '#bbb'], 0.3); drop = 0.12; }
        }
        yield* popOut(ctx, van);
      })();
      ctx.shake(0.12);
      yield* all(runVan, policeRun(ctx, dir, zc - (L.kind === 'minor' ? 0 : 0.5), 12.4, 0.75), policeRun(ctx, dir, zc + (L.kind === 'minor' ? 0 : 0.6), 12, 1.5));
      dir = -dir;
      yield* wait(0.6);
    }
    openRoad(ctx);
  },
};

G.bennyHill = {
  w: [0, 0, 0, 1, 2.5], crime: 1,
  *run(ctx) {
    const { L, rnd } = ctx, dir = rnd.sign();
    const cast = [makePerson(rnd, { kind: 'robber' }), makePerson(rnd, { kind: 'cop' }), makeDog(rnd), makePerson(rnd, { kind: 'chef' }), makePerson(rnd, { kind: 'cop' })];
    cast[0].hold(item.sack(), 'back');
    cast[3].arms = 'fist';
    ctx.wanted = cast[0];
    ctx.news('Chase enters third lap; nobody remembers who is chasing whom');
    ctx.incident();
    const a = dir > 0 ? EX0 : EX1, b = dir > 0 ? EX1 - 1.5 : EX0 + 1.5;
    const path = function* (m, delay) {
      yield* wait(delay);
      yield* enter(ctx, m, a, L.walkF[1]);
      yield* go(ctx, m, b, L.walkF[1], 6.8);
      yield* go(ctx, m, b, L.walkB[1], 6.8);
      yield* go(ctx, m, a + dir * 6, L.walkB[1], 6.8);
      yield* go(ctx, m, a + dir * 6, L.walkF[0], 6.8);
      yield* go(ctx, m, b + dir * 1, L.walkF[0], 6.8);
      yield* popOut(ctx, m);
    };
    ctx.sfx('whistle');
    say(ctx, at(a, 2.4, L.walkF[1]), '♪ ♫ ♪', { size: 18, color: '#ffe08a' });
    yield* all(...cast.map((m, i) => path(m, i * 0.36)));
  },
};

G.plofkraak = {
  w: [0, 0, 0, 0, 4], crime: 5, lock: 'road',
  avail: (ctx) => ctx.L.atm && !ctx.L.atm.blown,
  *run(ctx) {
    const { L, rnd } = ctx, A = L.atm, dir = A.x > 0 ? -1 : 1;
    A.blown = true;
    ctx.road.closed++;
    const r1 = makePerson(rnd, { kind: 'robber' }), r2 = makePerson(rnd, { kind: 'robber' });
    r1.gait = r2.gait = 'sneak'; r1.arms = 'carry'; r2.arms = 'sneak';
    r1.hold(item.bomb(), 'front');
    ctx.spawn(r2, dir > 0 ? EX0 : EX1, L.walkB[1]); r2.g.scale.setScalar(0.001);
    ctx.run(popIn(ctx, r2));
    yield* enter(ctx, r1, dir > 0 ? EX0 : EX1, L.walkB[0]);
    ctx.wanted = r1;
    ctx.news('Two men in striped shirts "just looking" at ATM');
    yield* all(go(ctx, r1, A.x - 0.2, A.z - 0.1, 3.8), go(ctx, r2, A.x + dir * 1.6, A.z + 0.5, 3.8));
    r1.heading = Math.PI; r2.heading = dir > 0 ? W : E;
    yield* wait(0.3);
    const bomb = r1.drop();
    bomb.position.set(A.x, L.yAt(A.z), A.z - 0.75);
    ctx.world.add(bomb);
    ctx.sfx('thud');
    say(ctx, r1, 'psst... rennen!', { size: 13, color: '#b9fbc0' });
    ctx.focus(A.x, A.z + 1, 0.5, 5.4, 3);
    ctx.sfx('fuse');
    r1.gait = r2.gait = 'walk'; r1.arms = r2.arms = 'swing';
    ctx.run(go(ctx, r1, A.x - dir * 7, L.walkB[1], 7.5));
    ctx.run(go(ctx, r2, A.x - dir * 8.2, L.walkB[0], 7.5));
    for (let i = 0; i < 18; i++) {
      ctx.fx.sparks(A.x, L.yAt(A.z) + 0.85, A.z - 0.75, 3);
      if (i % 6 === 0) ctx.fx.text(['3', '2', '1'][i / 6], at(A.x, 3.2, A.z), { size: 30, color: '#ffe08a', dur: 0.6, rise: 0.4 });
      yield* wait(0.1);
    }
    r1.arms = r2.arms = 'up';
    // KABOOM
    ctx.world.remove(bomb);
    ctx.slowmo(0.22, 0.5);
    ctx.sfx('boom');
    ctx.flash('#ffffff', 0.5);
    ctx.shake(1.3);
    const by = L.yAt(A.z);
    ctx.fx.fireball(A.x, by + 1, A.z - 0.6, 1.5);
    ctx.fx.burst(A.x, by + 1, A.z - 0.6, { n: 60, colors: ['#dfe6ea', '#005eb8', '#9aa5ad', '#b5523b', '#8f4a3a', '#333'], speed: 13, up: 15, size: [0.15, 0.5], life: [1.5, 3] });
    ctx.fx.cash(A.x, by + 1.5, A.z - 0.3, 120, 12, 19);
    ctx.fx.text('KABOOM!', at(A.x, 4, A.z), { size: 54, color: '#ffd60a', dur: 1.8, rise: 1.2, cls: 'huge' });
    const scorch = sculpt((v) => {
      v.box(A.x, by, A.zH + 0.25, 1.5, 2.5, 0.52, '#1c1c1c', 0.2);
      v.box(A.x - 0.9, by, A.zH + 0.12, 0.6, 1.5, 0.3, '#2a2a2a', 0.2);
      v.box(A.x + 0.9, by, A.zH + 0.12, 0.5, 1.9, 0.3, '#2a2a2a', 0.2);
      v.box(A.x, by + 2.5, A.zH + 0.12, 1.0, 0.7, 0.3, '#2a2a2a', 0.2);
      for (let i = 0; i < 8; i++) v.box(A.x + rnd.range(-2.2, 2.2), by, A.z + rnd.range(-0.6, 1.6), rnd.range(0.3, 0.7), rnd.range(0.15, 0.4), rnd.range(0.3, 0.7), rnd.pick(['#555', '#8f4a3a', '#dfe6ea', '#333']));
    });
    ctx.world.add(scorch);
    ctx.incident(5);
    ctx.news(`PLOFKRAAK on ${ctx.st.name}! ATM explodes, cash rains from the sky`);
    panic(ctx, A.x, 12);
    const smoke = ctx.run((function* () { for (let i = 0; i < 50; i++) { ctx.fx.smoke(A.x, by + 1.6, A.z - 0.7, 2, ['#555', '#444', '#666'], 0.6); yield* wait(0.18); } })());
    yield* wait(1.2);
    // opportunists
    for (let i = 0; i < 3; i++) {
      const c = makePerson(rnd, {});
      ctx.run((function* () {
        yield* wait(0.4 + i * 0.4);
        yield* enter(ctx, c, i % 2 ? EX1 : EX0, L.walkB[1]);
        yield* go(ctx, c, A.x + rnd.range(-3.5, 3.5), A.z + rnd.range(0.6, 2), 6.5);
        c.arms = 'up'; c.heading = 0;
        if (i === 0) say(ctx, c, 'GRATIS GELD!', { size: 16, color: '#b9fbc0' });
        for (let k = 0; k < 5; k++) { yield* hop(c, 0.5, 0.3); ctx.sfx('coin'); }
        c.arms = 'swing';
        yield* leave(ctx, c, 6);
      })());
    }
    // robbers grab the loot
    r1.arms = r2.arms = 'swing';
    yield* all(go(ctx, r1, A.x - 0.8, A.z + 0.2, 7), go(ctx, r2, A.x + 0.8, A.z + 0.2, 7));
    r1.hold(item.sack(), 'back'); r2.hold(item.sack(), 'back');
    ctx.sfx('coin');
    say(ctx, r1, '€€€!', { size: 22, color: '#b9fbc0' });
    yield* waitUntil(() => ctx.road.vehicles.size === 0, 6);
    // getaway
    const road = L.kind !== 'ped';
    const vz = road ? L.chaseZ : L.walkB[1] + 1.4;
    const van = makeCar(rnd, 'van', L.night);
    ctx.sfx('skid');
    yield* enter(ctx, van, dir > 0 ? X0 + 2.6 : X1 - 2.6, vz, 0);
    van.face(dir > 0 ? E : W);
    yield* go(ctx, van, A.x - dir * 1, vz, 14);
    ctx.fx.smoke(van.g.position.x - dir * 2, 0.3, vz, 6, ['#ddd', '#bbb'], 0.4);
    say(ctx, van, 'INSTAPPEN!', { size: 15, color: '#ffd60a' });
    yield* all(go(ctx, r1, A.x - dir * 1, vz - van.wid / 2 - 0.5, 7.5), go(ctx, r2, A.x - dir * 1.8, vz - van.wid / 2 - 0.5, 7.5));
    ctx.run(popOut(ctx, r1));
    yield* popOut(ctx, r2);
    ctx.wanted = van;
    ctx.sfx('skid');
    const flee = (function* () {
      let drop = 0;
      const x1 = dir > 0 ? X1 - 2.6 : X0 + 2.6;
      while (Math.abs(van.g.position.x - x1) > 0.3) {
        const dt = yield;
        drop -= dt;
        const p = van.g.position;
        p.x = dir > 0 ? Math.min(p.x + 13.5 * dt, x1) : Math.max(p.x - 13.5 * dt, x1);
        van.moving = 13;
        if (drop < 0) { ctx.fx.cash(p.x - dir * 2, 1.4, p.z, 2, 3, 5); drop = 0.1; }
      }
      yield* popOut(ctx, van);
    })();
    yield* all(flee, policeRun(ctx, dir, vz, 12.6, 0.9), policeRun(ctx, dir, vz, 12.2, 1.8));
    ctx.road.closed = Math.max(0, ctx.road.closed - 1);
    ctx.news('Police: "we were this close". Suspects still at large');
    yield* wait(2);
    ctx.runner.stop(smoke);
  },
};

// ---------------------------------------------------------------- gags for specific kinds of crime
const alarmLights = (x, z) => {
  const m = sculpt((v) => { for (const sx of [-2.0, 2.0]) for (const sz of [-0.85, 0.85]) v.box(sx, 0.6, sz, 0.22, 0.2, 0.3, '#ffb000'); }, MAT.glow); // lights at the corners of a 4.4 x 1.85 m car
  m.position.set(x, 0.001, z);
  return m;
};
G.carBreakIn = {
  w: [0, 0.6, 2.5, 2.5, 2], crime: 2, need: ['parked'],
  *run(ctx) {
    const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'carBreakIn'), R = rig(ctx), car = rnd.pick(L.parked);
    let done = false;
    try {
      const dir = car.x > 0 ? -1 : 1, z = L.hw + L.bw + 0.75, edge = dir > 0 ? EX1 : EX0;
      // the cars he will try first: those before the target, in his direction of travel
      const row = L.parked.filter((c) => c !== car && dir * (car.x - c.x) > 2.5 && dir * (car.x - c.x) < 13).sort((p, q) => dir * (p.x - q.x));
      const decoys = row.slice(-2);
      const thief = makePerson(rnd, { kind: rnd.chance(0.5) ? 'raccoon' : 'robber' });
      const alarm = (c, dur) => {
        const l = R.add(alarmLights(c.x, c.z));
        return R.run((function* () {
          let t = 0, beep = 0;
          while (t < dur) { const dt = yield; t += dt; beep -= dt; l.visible = Math.floor(t * 5) % 2 === 0; if (beep < 0) { ctx.sfx('alarm'); beep = 1.7; } }
          R.rm(l);
        })());
      };
      const handle = function* (c, tries, why) {
        yield* go(ctx, thief, c.x, z, 3.2);
        thief.heading = Math.PI; thief.gait = 'walk'; thief.arms = 'hold';
        yield* wait(0.25);
        for (let i = 0; i < tries; i++) { ctx.sfx('pop', 0.6); ctx.shake(0.04); yield* hop(thief, 0.08, 0.14); yield* wait(0.12); }
        if (why) say(ctx, thief, why, { size: 12, color: '#cfe8ff' });
      };

      // 1. set-up: a quiet row of parked cars; one of them snores
      cam.wide(pt(car.x - dir * 3, z), { dist: 26, hold: 4.2 });
      const snore = R.run((function* () { for (;;) { ctx.sfx('zzz'); ctx.fx.text('Z', at(car.x, 2.3, car.z), { size: 15, color: '#cfe8ff', rise: 1.2, dur: 1.6 }); yield* wait(1.5); } })());
      yield* R.enter(thief, clamp(car.x - dir * 15, EX0, EX1), L.walkF[0]);
      thief.gait = 'sneak'; thief.arms = 'sneak';
      const firstX = (decoys[0] || car).x;
      yield* go(ctx, thief, firstX - dir * 2.5, z, 3.2);

      // 2. reveal
      thief.gait = 'walk'; thief.arms = 'hold'; thief.heading = 0;
      cam.low(thief, { dist: 6, hold: 2.4 });
      cam.card('DE KLINKENPOETSER', 'Tries every handle. Eternal optimist.', 2);
      cam.freeze(0.7);
      ctx.sfx('sting');
      say(ctx, thief, 'hehehe', { size: 13, color: '#b9fbc0' });
      yield* wait(1.0);

      // 3. down the row: locked, locked, and a car alarm
      cam.shot({ on: thief, dist: 6.5, el: 0.3, az: 0.6, hold: 2.4 });
      thief.gait = 'sneak';
      if (decoys[0]) {
        yield* handle(decoys[0], 3, 'op slot.');
        thief.arms = 'up'; yield* wait(0.4); thief.arms = 'hold';
      }
      cam.top(pt(car.x - dir * 3, z), { dist: 24, hold: 4 });
      if (decoys[1]) {
        yield* handle(decoys[1], 2, null);
        ctx.sfx('alarm');
        const al = alarm(decoys[1], 1.9);
        ctx.fx.text('WEE-OO! WEE-OO!', at(decoys[1].x, 2.8, decoys[1].z), { size: 17, color: '#ff6b6b', dur: 1.8 });
        ctx.shake(0.15);
        thief.arms = 'up';
        yield* hop(thief, 0.8, 0.3);
        // act natural: whistle, hands behind the back, stare at nothing
        thief.arms = 'swing'; thief.gait = 'walk';
        yield* go(ctx, thief, decoys[1].x + dir * 3, z, 2.2);
        thief.heading = 0.6;
        say(ctx, thief, '♪ ik doe niks ♪', { size: 12, color: '#b9fbc0' });
        const watcher = takePed(ctx, 12, null, thief.g.position.x);
        if (watcher) { R.borrow(watcher); faceTo(watcher, thief.g.position.x, z); watcher.arms = 'hold'; say(ctx, watcher, 'hm.', { size: 12, color: '#cfe8ff' }); }
        yield* waitUntil(() => al.done, 2.5);
        ctx.sfx('bell');
        if (watcher) R.give(watcher);
        thief.gait = 'sneak';
      }

      // 4. the wrong car: the window goes, and out comes the loot (and a sleeper)
      yield* go(ctx, thief, car.x, z, 3);
      thief.heading = Math.PI; thief.arms = 'sneak';
      cam.ots(thief, pt(car.x, car.z), { hold: 3.2 });
      yield* wait(0.5);
      thief.heading = 0; // hears something
      yield* doubleTake(ctx, thief, '?');
      thief.heading = Math.PI;
      yield* wait(0.4);
      R.stop(snore);
      ctx.sfx('glass'); ctx.sfx('thud');
      ctx.fx.burst(car.x, 1.2, car.z + 0.95, { n: 26, colors: ['#bfe9ff', '#ffffff', '#8fd3f4', '#e8f7ff'], speed: 5, up: 5.5, size: [0.05, 0.13], life: [0.6, 1.1], glow: true });
      ctx.fx.text('KRAK!', at(car.x, 2.4, car.z), { size: 22, color: '#bfe9ff' });
      ctx.shake(0.2);
      ctx.wanted = thief;
      ctx.incident(2);
      cam.close(thief, { hold: 2.2 });
      thief.arms = 'up';
      yield* wait(0.7);
      // loot comes out of the window, one piece at a time, and goes into the air
      const loot = [item.radio(), item.shoe(), item.wallet()];
      loot[2].scale.setScalar(1.8);
      const held = [true, true, true];
      for (let i = 0; i < 3; i++) {
        const o = R.add(loot[i]);
        o.position.set(car.x + (i - 1) * 0.4, 1.25, car.z + 0.2);
        ctx.sfx(i === 1 ? 'pop' : 'yoink', 1.1);
        R.run(arc(o, car.x + (i - 1) * 0.4, 2.0, z, 0.5, 0.45));
        yield* wait(0.38);
      }
      let ph = 0;
      thief.arms = 'up';
      const jug = R.run((function* () {
        for (;;) {
          const dt = yield;
          ph += dt * 6.5;
          const tp = thief.g.position;
          loot.forEach((o, i) => { if (held[i]) o.position.set(tp.x + Math.cos(ph + (i * TAU) / 3) * 0.5, 1.95 + Math.sin(ph + (i * TAU) / 3) * 0.4, tp.z); });
        }
      })());
      say(ctx, thief, 'JA HOOR!', { size: 15, color: '#ffd60a' });
      ctx.news(`Car window on ${ctx.st.name} loses argument with ${thief.kind === 'raccoon' ? 'a raccoon' : 'man in stripes'}`);
      yield* wait(0.5);
      // the owner has been in the back seat all along
      const owner = makePerson(rnd, { shirt: rnd.pick(['#9d4edd', '#457b9d', '#e9c46a']) });
      owner.hold(item.nightcap(), 'head');
      owner.air = true;
      cam.two(thief, pt(car.x, car.z), { dist: 9, hold: 2.4, cut: 0.25 });
      yield* R.enter(owner, car.x, car.z, 0.7);
      owner.heading = 0; owner.arms = 'up';
      ctx.sfx('gasp');
      yell(ctx, owner, 'AAAH!', '#ffffff', 18); yell(ctx, thief, 'AAAH!', '#ffffff', 18);
      cam.freeze(0.5);
      yield* all(hop(thief, 0.7, 0.35), wait(0.35));
      yield* wait(0.2);
      owner.arms = 'fist';
      yield* arc(owner.g, car.x + dir * 0.9, 0, z + 0.4, 1.0, 0.45);
      owner.air = false;
      yell(ctx, owner, rnd.pick(['IK SLAAP HIER!', 'MIJN AUTORADIO!', 'HÉ! IK LIGT TE SLAPEN!']), '#ff6b6b', 15);

      // 5. the chase: loot juggling at full speed
      cam.track(thief, { hold: 4.5, lead: 3 });
      thief.gait = 'walk'; thief.arms = 'up';
      const oc = R.run(goEach(ctx, owner, edge, z + 0.4, 5));
      const cop = lv >= 4 ? makePerson(rnd, { kind: 'cop' }) : null;
      let stopped = false;
      if (cop) R.run((function* () { yield* wait(1.2); yield* R.enter(cop, edge, z); ctx.sfx('whistle'); say(ctx, cop, 'HALT!', { size: 15, color: '#7db8ff' }); cop.heading = dir > 0 ? W : E; yield* go(ctx, cop, edge - dir * 7, z, 4.6); stopped = true; })());
      if (lv >= 5) {
        R.panic(car.x, 14, 3);
        for (const c of row) R.run((function* () { yield* wait(rnd.range(0.2, 1.0)); alarm(c, 3); })());
        if (L.kind !== 'ped') R.run(R.police(dir, L.chaseZ, 11, 0.9));
      }
      let drop = 0, dropT = 1.0, spikes = 0;
      yield* goEach(ctx, thief, edge, z, 6.8, (dt) => {
        thief.g.position.y = Math.abs(Math.sin(ph * 0.6)) * 0.12;
        dropT -= dt;
        if (dropT < 0 && drop < 3) {
          const i = drop++; dropT = 0.95;
          held[i] = false;
          const o = loot[i], tp = thief.g.position;
          ctx.sfx(i === 0 ? 'clatter' : 'pop', 0.8);
          say(ctx, thief, ['OEPS!', 'NEE NEE NEE', 'ACH...'][i], { size: 14, color: '#fff' });
          R.run(arc(o, tp.x - dir * rnd.range(1.5, 3), 0.1, tp.z + rnd.range(-0.2, 0.3), 1.3, 0.6, rnd.range(-5, 5)));
        }
        if (cop && stopped && Math.abs(thief.g.position.x - cop.g.position.x) < 2.2) return true;
      });
      R.stop(jug);
      thief.g.position.y = 0;
      for (let i = 0; i < 3; i++) held[i] = false;

      // 6. comeuppance
      R.stop(oc);
      if (cop && Math.abs(thief.g.position.x - edge) > 1.5) {
        ctx.sfx('skid'); ctx.shake(0.2);
        thief.arms = 'up';
        say(ctx, thief, 'BUSTED!', { size: 24, color: '#7db8ff' });
        cam.close(thief, { hold: 1.8 });
        cam.freeze(0.5);
        ctx.fx.burst(thief.g.position.x, 1.15, z, { n: 12, colors: ['#ffd60a', '#fff'], speed: 5, up: 7, glow: true, size: [0.1, 0.18] });
        yield* wait(1.2);
      } else {
        thief.arms = 'swing';
        yield* wait(0.3);
        cam.close(thief, { hold: 1.8 });
        say(ctx, thief, '...', { size: 14, color: '#cfe8ff' });
        yield* wait(0.8);
      }
      // the owner, panting, collects his things and goes back to bed
      cam.wide(pt(car.x, z), { dist: 22, hold: 4 });
      yield* R.settle(6);
      yield* go(ctx, owner, loot[0].position.x, loot[0].position.z + 0.3, 6);
      owner.arms = 'hold'; owner.heading = 0;
      say(ctx, owner, 'MIJN RADIO!', { size: 14, color: '#b9fbc0' });
      // everything else comes home on its own
      for (let i = 0; i < 3; i++) {
        const o = loot[i];
        R.run((function* () { yield* wait(i * 0.25); yield* arc(o, owner.g.position.x, 1.2, owner.g.position.z, 1.2, 0.5, 4); R.rm(o); ctx.sfx('coin'); })());
      }
      yield* wait(0.9);
      owner.arms = 'swing';
      yield* go(ctx, owner, car.x, z, 6);
      owner.heading = Math.PI;
      say(ctx, owner, '*geeuw*', { size: 13, color: '#cfe8ff' });
      yield* wait(0.6);
      yield* R.out(owner);
      ctx.sfx('zzz');
      ctx.fx.text('Z', at(car.x, 2.3, car.z), { size: 18, color: '#cfe8ff', rise: 1.4, dur: 1.8 });
      thief.arms = 'swing';
      R.run(R.away(thief, dir * 6, cop ? 3.4 : 6));
      if (cop) R.run(R.away(cop, dir * 6, 3.4));
      yield* R.settle(10);
      yield* wait(0.5);
      done = true;
    } finally {
      cam.release();
      R.free(done);
    }
  },
};

G.fenderBender = {
  w: [0, 1.2, 2, 2, 2], crime: 1, lock: 'road',
  avail: (ctx) => ctx.L.kind !== 'ped' && ctx.L.hw >= 2.2,
  *run(ctx) {
    const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'fenderBender'), R = rig(ctx);
    let done = false;
    try {
      const dir = rnd.sign();
      yield* R.close();
      const z = L.kind === 'major' ? (dir > 0 ? L.laneF : L.laneB) : L.laneF;
      const sz = z + (z > 0 ? 1.5 : -1.5);
      const a = makeCar(rnd, 'car', L.night), b = makeCar(rnd, rnd.chance(0.3) ? 'taxi' : 'car', L.night), c3 = makeCar(rnd, 'car', L.night);
      const xs = dir * rnd.range(1, 5), x0 = dir > 0 ? X0 + 2.6 : X1 - 2.6, x1 = dir > 0 ? X1 - 2.6 : X0 + 2.6;
      const heading = dir > 0 ? E : W, gap = a.len + 0.2, bx = xs - dir * gap, ix = xs - dir * (gap / 2); // bumper to bumper (cars are 4.4 m long)
      const clampZ = (q) => clamp(q, -(L.hw - 0.95), L.hw - 0.95);
      const zIn = clampZ(z + (z > 0 ? -2.05 : 2.05)); // a lane clear of the 1.85 m wide stopped cars
      const zOut = L.kind === 'major' ? -z : clampZ(z + (z > 0 ? 2.05 : -2.05));
      const spot = pt(xs - dir * 1.5, z);
      let impact = false, slowed = false;

      // 1. set-up: a pigeon in no hurry, one driver on the phone, one humming along to the radio
      cam.wide(spot, { dist: 30, hold: 4.6 });
      const bird = makeBird(rnd, 'pigeon');
      R.spawn(bird, xs + dir * 3.2, L.hw + L.bw + 0.6); // placed at the kerb, then wanders into the lane
      R.run(go(ctx, bird, xs + dir * 3.2, z, 1.5));
      R.run((function* () {
        yield* wait(1.7);
        yield* R.enter(b, x0, z, 0);
        b.face(heading);
        say(ctx, b, '♪ la la la ♪', { size: 12, color: '#cfe8ff' });
        yield* goEach(ctx, b, bx, z, 10, () => {
          if (!slowed && Math.abs(b.g.position.x - bx) < 6.5) {
            slowed = true;
            ctx.slowmo(0.2, 1.6);
            cam.shot({ on: [a, b], dist: 11, el: 0.18, az: 1.3, hold: 3, y: 0.7 });
          }
        });
        impact = true;
      })());
      yield* R.enter(a, x0, z, 0);
      a.face(heading);
      say(ctx, a, '*appje*', { size: 13, color: '#cfe8ff' });
      yield* go(ctx, a, xs, z, 7.5);
      ctx.sfx('skid');
      say(ctx, a, 'EEN DUIF!', { size: 14, color: '#fff' });
      yield* waitUntil(() => impact, 8);

      // 2. the bump, in slow motion. Bumpers fall off, steam rises, a horn gives up
      ctx.sfx('slam'); ctx.shake(0.5);
      cam.freeze(0.5);
      ctx.fx.text('BONK!', at(ix, 2.6, z), { size: 30, color: '#ffd60a' });
      ctx.fx.burst(ix, 0.7, z, { n: 16, colors: ['#ddd', '#888', '#ff3b3b', '#ffd166'], speed: 5, up: 6, size: [0.08, 0.2] });
      ctx.fx.sparks(ix, 0.8, z, 10);
      ctx.incident();
      R.run(go(ctx, a, xs + dir * 0.9, z, 4));
      const bumps = [];
      for (const k of [1, -1]) {
        const bm = R.add(item.bumper());
        bm.position.set(ix, 0.45, z);
        bumps.push(bm);
        const lx = ix + k * dir * rnd.range(1.5, 3), lz = z + rnd.range(-0.5, 0.5);
        R.run((function* () {
          yield* arc(bm, lx, 0.05, lz, 1.7, 0.9, k * 7);
          ctx.sfx('clatter');
          yield* arc(bm, lx + k * dir * 0.5, 0.05, lz, 0.35, 0.3, k * 1.5);
        })());
      }
      R.run((function* () { for (let i = 0; i < 18; i++) { ctx.fx.smoke(b.g.position.x + dir * 2.1, 1.15, z, 2, ['#888', '#666'], 0.4); yield* wait(0.2); } })());
      ctx.sfx('honk'); say(ctx, b, 'TUUUT!', { size: 15, color: '#ffd166' });
      bird.face(0);
      say(ctx, bird, 'rrrk', { size: 11, color: '#cfe8ff' });
      cam.low(bird, { dist: 6, hold: 2.3 });
      cam.card('DE DUIF', 'Did nothing. Caused everything.', 1.9);
      if (lv >= 4) R.panic(xs, 14, 3);
      ctx.news(`Fender-bender on ${ctx.st.name}. Both drivers "had right of way"`);
      let cHit = false;
      R.run((function* () {
        yield* wait(4.2);
        yield* R.enter(c3, x0, z, 0);
        c3.face(heading);
        ctx.sfx('honk'); say(ctx, c3, 'HÉ! DOORRIJDEN!', { size: 13, color: '#ffd166' });
        yield* goEach(ctx, c3, bx - dir * gap, z, 11);
        ctx.sfx('skid');
        cHit = true;
      })());
      yield* wait(0.9);

      // 3. the argument
      const d1 = makePerson(rnd, {}), d2 = makePerson(rnd, {});
      yield* all(R.enter(d1, xs + dir * 0.4, sz), R.enter(d2, xs - dir * 3.0, sz));
      d1.heading = dir > 0 ? W : E; d2.heading = dir > 0 ? E : W;
      d1.arms = d2.arms = 'fist';
      ctx.sfx('pop');
      const crowd = gather(ctx, R, xs, 2, 14);
      for (const g of crowd) filmIt(g, xs - dir * 1.5, sz);
      const lines = ['KIJK UIT JE DOPPEN!', 'JIJ REMDE ZOMAAR!', 'ER LIEP EEN DUIF!', 'EEN DUIF?!'];
      for (let i = 0; i < 4; i++) {
        const sp = i % 2 ? d1 : d2, other = i % 2 ? d2 : d1;
        if (i % 2) cam.ots(d1, d2, { hold: 1.8, cut: 0.3 }); else cam.ots(d2, d1, { hold: 1.8, cut: 0.3 });
        yell(ctx, sp, lines[i], i % 2 ? '#ffb4a2' : '#ff6b6b', 14);
        faceTo(sp, other.g.position.x, sz);
        yield* hop(sp, 0.18, 0.2);
        yield* wait(0.55);
      }
      // escalation: each fetches a bumper and they fence with them
      cam.two(d1, d2, { dist: 11, hold: 3 });
      const b1 = bumps[0], b2 = bumps[1];
      yield* all(go(ctx, d1, b1.position.x, sz, 4.5), go(ctx, d2, b2.position.x, sz, 4.5));
      R.rm(b1); R.rm(b2);
      d1.hold(item.bumper()); d2.hold(item.bumper());
      yell(ctx, d1, 'EN DIE DEUK DAN?!', '#ff6b6b', 13);
      yield* all(go(ctx, d1, xs - dir * 0.2, sz, 4), go(ctx, d2, xs - dir * 1.4, sz, 4));
      faceTo(d1, d2.g.position.x, sz); faceTo(d2, d1.g.position.x, sz);
      for (let i = 0; i < 3; i++) {
        ctx.sfx('bonk'); ctx.fx.sparks(xs - dir * 0.8, 1.1, sz, 6); ctx.fx.text('KLANG!', at(xs - dir * 0.8, 2.3, sz), { size: 18, color: '#ffd60a' });
        yield* all(hop(d1, 0.25, 0.28), hop(d2, 0.25, 0.28));
        yield* wait(0.1);
      }

      // 4. complication: a third car, honking, who also did not see anything
      yield* waitUntil(() => cHit, 8);
      cam.track(c3, { hold: 2, lead: 1 });
      ctx.sfx('slam'); ctx.shake(0.4);
      ctx.fx.text('TIK!', at(bx - dir * (gap / 2), 2.4, z), { size: 22, color: '#ffd60a' });
      ctx.fx.sparks(bx - dir * (gap / 2), 0.8, z, 6);
      R.run(go(ctx, b, b.g.position.x + dir * 0.5, z, 4));
      R.run((function* () { yield* wait(0.2); ctx.sfx('slam'); yield* go(ctx, a, a.g.position.x + dir * 0.45, z, 4); })());
      yield* all(doubleTake(ctx, d1, 'NOG EEN?!'), doubleTake(ctx, d2, 'WAT NU?!'));
      const d3 = makePerson(rnd, { kind: rnd.chance(0.4) ? 'chef' : 'civ' });
      yield* R.enter(d3, bx - dir * (gap + 1.7), sz);
      d3.arms = 'fist'; d3.heading = dir > 0 ? E : W;
      yell(ctx, d3, 'JULLIE STONDEN STIL!', '#ffb4a2', 13);
      d1.drop(); d2.drop();
      d1.arms = d2.arms = 'fist';
      yield* wait(0.9);

      // 5. paperwork, and a gust of wind
      const cop = lv >= 3 ? makePerson(rnd, { kind: 'cop' }) : null;
      let clip = null;
      if (cop) {
        yield* R.enter(cop, clamp(xs + dir * 8, EX0, EX1), sz);
        ctx.sfx('whistle');
        yield* go(ctx, cop, xs + dir * 2.6, sz, 5.5);
        cop.heading = dir > 0 ? W : E;
        say(ctx, cop, 'RUSTIG! FORMULIERTJE INVULLEN.', { size: 13, color: '#7db8ff' });
        clip = cop.hold(item.paper());
        cop.arms = 'hold';
      } else {
        say(ctx, d1, 'Zullen we... het formulier?', { size: 12, color: '#cfe8ff' });
        clip = d1.hold(item.paper());
        d1.arms = 'hold';
      }
      d1.arms = d2.arms = d3.arms = 'swing';
      yield* wait(0.6);
      ctx.fx.text('SCHADEFORMULIER ✎', at(xs - dir * 1.3, 2.4, sz), { size: 13, color: '#fff' });
      ctx.sfx('coin');
      yield* wait(0.6);
      const src = cop || d1;
      src.drop();
      cam.top(spot, { dist: 22, hold: 3.4 });
      ctx.fx.text('FWOEF!', at(xs, 3.2, sz), { size: 24, color: '#e8f7ff' });
      ctx.sfx('whoosh');
      const dest = [];
      for (let i = 0; i < 6; i++) {
        const pp = R.add(item.paper());
        pp.position.set(src.g.position.x, 1.0, src.g.position.z);
        const q = [xs + rnd.range(-5, 5), 0.03, z + rnd.range(-2.2, 2.2)];
        dest.push(q);
        R.run(arc(pp, q[0], q[1], q[2], rnd.range(1.5, 3), rnd.range(1.1, 1.7), rnd.range(-9, 9)));
      }
      yield* wait(1.0);
      // everybody goes for the same sheet
      for (const g of [d1, d2, d3]) g.arms = 'up';
      const target = dest[0], other = dest[1];
      yield* wait(0.6);
      cam.two(d1, d2, { dist: 12, hold: 2.5 });
      yield* all(
        goEach(ctx, d1, target[0] - dir * 0.5, sz, 5.5),
        goEach(ctx, d2, target[0] + dir * 0.5, sz, 5.5),
        goEach(ctx, d3, other[0], sz, 5.5),
      );
      ctx.sfx('bonk'); ctx.shake(0.25);
      ctx.fx.text('BONK!', at(target[0], 2.2, sz), { size: 24, color: '#ffd60a' });
      say(ctx, d1, '★ ★', { size: 14, color: '#ffe066', dur: 0.9 }); say(ctx, d2, '★ ★', { size: 14, color: '#ffe066', dur: 0.9 });
      yield* all(hop(d1, 0.3, 0.3), hop(d2, 0.3, 0.3));
      d3.arms = 'wave';
      say(ctx, d3, 'GOT IT!', { size: 15, color: '#b9fbc0' });
      yield* wait(0.6);

      // 6. the pigeon strolls through the middle of the circle. Level decides how it all ends
      cam.close(bird, { hold: 2.2 });
      const stroll = R.run(go(ctx, bird, xs - dir * 1.5, sz, 2));
      yield* wait(0.9);
      say(ctx, bird, 'rrrk', { size: 11, color: '#cfe8ff' });
      ctx.sfx('squawk');
      if (lv >= 4) {
        if (L.kind !== 'ped') R.run(R.police(-dir, zIn, 10, 0.2));
        if (lv >= 5) R.run(R.police(dir, zOut, 12, 1.2));
      }
      d1.arms = d2.arms = d3.arms = 'swing';
      yield* wait(0.5);
      if (cop) {
        say(ctx, cop, 'Dank u. De duif is getuige.', { size: 12, color: '#7db8ff' });
      } else {
        say(ctx, d1, 'sorry', { size: 12, color: '#cfe8ff' });
        say(ctx, d2, 'ook sorry', { size: 12, color: '#cfe8ff' });
      }
      cam.wide(spot, { dist: 28, hold: 4 });
      yield* wait(0.9);
      R.stop(stroll);
      R.run((function* () { bird.fly = true; bird.air = true; yield* fly(bird, xs - dir * 3, 6, sz - 3, 6); R.gone(bird); })());
      yield* all(R.out(d1), R.out(d2), R.out(d3));
      if (cop) R.run(R.away(cop, dir * 7, 4));
      ctx.fx.smoke(b.g.position.x, 0.5, z, 5, ['#888', '#666'], 0.4);
      ctx.sfx('honk');
      // the limping convoy leaves, the last car dragging a bumper's worth of embarrassment
      yield* all(
        (function* () { yield* go(ctx, a, x1, z, 9); yield* R.out(a); })(),
        (function* () { yield* wait(0.4); yield* go(ctx, b, x1, z, 8); yield* R.out(b); })(),
        (function* () { yield* wait(0.8); yield* go(ctx, c3, x1, z, 9); yield* R.out(c3); })(),
      );
      yield* R.settle(10);
      yield* wait(0.4);
      done = true;
    } finally {
      cam.release();
      R.free(done);
    }
  },
};

G.scuffle = {
  w: [0, 0, 1.4, 2.4, 2.6], crime: 2,
  *run(ctx) {
    const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'scuffle'), R = rig(ctx);
    let done = false;
    try {
      const x = rnd.range(-8, 8), z = rnd.pick([L.walkF[0], L.walkB[1]]), side = rnd.sign();
      const cc = pt(x, z); // the camera follows this point; it rolls along with the dust cloud later
      const a = makePerson(rnd, {}), b = makePerson(rnd, { kind: rnd.chance(0.3) ? 'chef' : 'civ' });

      // 1. set-up: two pedestrians, one pavement, both looking elsewhere
      cam.wide(cc, { dist: 24, hold: 3.6 });
      a.hold(item.phone()); a.arms = 'hold';
      b.hold(item.wafel()); b.arms = 'hold';
      yield* all(
        (function* () { yield* R.enter(a, x - 9, z); yield* go(ctx, a, x - 0.65, z, 4.4); })(),
        (function* () { yield* R.enter(b, x + 9, z); yield* go(ctx, b, x + 0.65, z, 4.4); })(),
      );
      a.heading = E; b.heading = W;
      ctx.sfx('thud'); ctx.shake(0.15);
      ctx.fx.text('OEF!', at(x, 2.2, z), { size: 20, color: '#fff' });
      yield* all(hop(a, 0.2, 0.25), hop(b, 0.2, 0.25));
      a.drop(); b.drop();
      a.arms = b.arms = 'fist';

      // 2. the argument, over the shoulder, with a shove or two
      const row = rnd.pick([['DAT IS MIJN PLEK!', 'NIETES!', 'WELLES!', 'JIJ LOOPT IN DE WEG!', 'JIJ BENT ER NIET EENS!'], ['JIJ KEEK NAAR MIJ!', 'IK KEEK NIET!', 'WEL!', 'NIET!', 'KOM DAN!'], ['AJAX!', 'ADO!', '...ZEG DAT NOG EENS', 'ADO!!', 'DAN KOM JE TOCH?']]);
      for (let i = 0; i < 5; i++) {
        const sp = i % 2 ? b : a, other = i % 2 ? a : b;
        if (i % 2) cam.ots(b, a, { hold: 1.6, cut: 0.3 }); else cam.ots(a, b, { hold: 1.6, cut: 0.3 });
        yell(ctx, sp, row[i], i % 2 ? '#ffd166' : '#ff6b6b', 14 + i);
        yield* hop(sp, 0.15 + i * 0.03, 0.2);
        if (i >= 2) { // a shove
          const o = other.g.position, px0 = o.x, dd = other === a ? -1 : 1;
          ctx.sfx('thud'); ctx.shake(0.1 * i);
          yield* tween(0.2, (t) => { o.x = px0 + dd * 0.3 * Math.sin(t * Math.PI); });
        }
        yield* wait(0.35);
      }

      // 3. word gets round: spectators gather, and a granny takes bets
      const mob = gather(ctx, R, x, 2, 15);
      const bookie = makePerson(rnd, { kind: 'granny' });
      const spots = [[-3.0, 1.5], [3.1, 1.4], [-1.2, -1.7], [1.6, -1.6]];
      const spectators = [];
      R.run((function* () {
        yield* R.enter(bookie, clamp(x + side * 11, EX0, EX1), z + 1.0);
        bookie.hold(item.paper()); bookie.arms = 'hold';
        yield* go(ctx, bookie, x + spots[3][0], z + spots[3][1], 3);
        faceTo(bookie, x, z);
        yell(ctx, bookie, 'WIE WINT? NOTEER!', '#b9fbc0', 13);
      })());
      spectators.push([bookie, 3]);
      mob.forEach((p, i) => { spectators.push([p, i]); R.run(go(ctx, p, x + spots[i][0], z + spots[i][1], 3.2)); });
      // too few passers-by? the street provides
      for (let i = mob.length; i < 2; i++) {
        const extra = makePerson(rnd, { kind: i ? 'kid' : 'civ' });
        spectators.push([extra, i]);
        R.run((function* () { yield* R.enter(extra, clamp(x - side * 10, EX0, EX1), z + 1); yield* go(ctx, extra, x + spots[i][0], z + spots[i][1], 3.4); })());
      }
      cam.shot({ on: [a, b], dist: 9, el: 0.35, hold: 3.2, drift: { dist: -0.8 } });
      cam.card('DE KEMPHANEN', 'Two egos, one pavement.', 1.9);
      cam.freeze(0.6);
      ctx.sfx('sting');
      yield* wait(1.2);
      for (const [p, i] of spectators) {
        if (!p.alive) continue;
        faceTo(p, x, z); p.arms = i % 2 ? 'up' : 'hold';
        ctx.fx.cash(p.g.position.x, 1.2, p.g.position.z, 2, 1.5, 2.5);
      }
      ctx.sfx('coin');
      say(ctx, mob[0] || bookie, '10 OP DE CHEF!', { size: 13, color: '#b9fbc0' });
      yield* wait(0.8);
      // squaring up: noses together, a rooster's wobble, one long breath
      a.heading = E; b.heading = W;
      a.arms = b.arms = 'up';
      ctx.sfx('gasp');
      yield* tween(0.8, (t) => { a.g.position.x = x - 0.65 + 0.25 * t; b.g.position.x = x + 0.65 - 0.25 * t; a.g.position.y = Math.abs(Math.sin(t * 14)) * 0.08; b.g.position.y = Math.abs(Math.sin(t * 14 + 1)) * 0.08; });
      a.g.position.y = b.g.position.y = 0;
      yield* wait(0.5); // the hold before the payoff
      ctx.incident(2);
      ctx.news(`Difference of opinion on ${ctx.st.name} escalates to dust cloud`);

      // 4. the cartoon dust cloud: limbs, stars, flying shoes. It rolls down the pavement
      a.g.visible = b.g.visible = false;
      cam.track(cc, { hold: 5, lead: 1 });
      ctx.slowmo(0.5, 0.35);
      ctx.sfx('slam'); ctx.sfx('bonk');
      if (lv >= 4) R.panic(x, 12, 3);
      const words = ['POW!', 'BAM!', 'OEF!', 'AU!', 'BONK!', 'KLETS!', 'KRAK!'];
      let T = 0, nxt = 0, k = 0;
      const shoes = [];
      while (T < 4.2) {
        const dt = yield;
        T += dt; nxt -= dt;
        cc.x += side * Math.min(2.6, T * 1.1) * dt;
        cc.z += Math.sin(T * 3.1) * 0.35 * dt;
        spectators.forEach(([p, i], j) => {
          if (!p.alive) return;
          const tx = cc.x + spots[j % 4][0] * 0.9, tz = cc.z + spots[j % 4][1] * 0.9, q = p.g.position;
          q.x += (tx - q.x) * Math.min(1, dt * 3); q.z += (tz - q.z) * Math.min(1, dt * 3);
          p.moving = 2.5; faceTo(p, cc.x, cc.z);
        });
        if (nxt < 0) {
          nxt = 0.14; k++;
          ctx.fx.smoke(cc.x + rnd.range(-0.7, 0.7), 0.4, cc.z + rnd.range(-0.5, 0.5), 5, ['#f1ede4', '#e4dccb', '#d8cfbd'], 0.8);
          if (k % 3 === 0) {
            ctx.fx.text(rnd.pick(words), at(cc.x + rnd.range(-1.6, 1.6), rnd.range(1.2, 2.4), cc.z), { size: 19, color: rnd.pick(['#ffd60a', '#ff6b6b', '#ffffff']), dur: 0.7 });
            ctx.sfx(rnd.pick(['thud', 'boing', 'pop', 'bonk']));
            ctx.shake(0.12);
          }
          if (k % 4 === 1) ctx.fx.burst(cc.x, 0.9, cc.z, { n: 5, colors: ['#ffd60a', '#ffffff'], speed: 5, up: 6, glow: true, size: [0.1, 0.16], life: [0.4, 0.8] });
          // limbs poke out of the cloud (voxel arms and legs in skin tones and shirt colours)
          if (k % 2 === 0) ctx.fx.burst(cc.x, 0.8, cc.z, { n: 3, colors: ['#f2c9a0', '#c98e62', '#e84a5f', '#457b9d', '#2b3a55'], speed: 6, up: 5, size: [0.16, 0.3], life: [0.3, 0.6] });
          if ((k === 4 || k === 12) && shoes.length < 2) {
            const sh = R.add(item.shoe());
            sh.position.set(cc.x, 0.9, cc.z);
            shoes.push(sh);
            R.run(arc(sh, cc.x + rnd.range(-4, 4), 0.02, cc.z + rnd.range(-1.5, 1.5), 3.5, 1.0, rnd.range(-9, 9)));
          }
          if (k === 8) { say(ctx, bookie, 'DOORGAAN!', { size: 13, color: '#b9fbc0' }); ctx.sfx('coin'); }
        }
      }
      ctx.sfx('pang');
      ctx.fx.puff(cc.x, 0.6, cc.z, '#f1ede4');
      ctx.fx.smoke(cc.x, 0.6, cc.z, 14, ['#f1ede4', '#e4dccb', '#d8cfbd'], 1.0);

      // 5. the cloud clears: both on the ground, dazed. Level decides who shows up
      a.g.visible = b.g.visible = true;
      a.g.position.set(cc.x - 0.9, 0.23, cc.z); b.g.position.set(cc.x + 0.9, 0.23, cc.z);
      a.air = b.air = true; a.pose = b.pose = 'sit'; a.arms = b.arms = 'up';
      a.heading = b.heading = 0;
      cam.two(a, b, { dist: 11, hold: 3 });
      for (let i = 0; i < 2; i++) { say(ctx, i % 2 ? a : b, '★ ★', { size: 15, color: '#ffe066', dur: 0.9 }); yield* wait(0.7); }
      const cop = makePerson(rnd, { kind: 'cop' });
      yield* R.enter(cop, clamp(cc.x - side * 9, EX0, EX1), cc.z);
      ctx.sfx('whistle');
      yell(ctx, cop, 'UIT ELKAAR!', '#7db8ff', 17);
      yield* go(ctx, cop, cc.x - side * 2.4, cc.z, 6);
      cop.heading = side > 0 ? E : W;
      a.arms = b.arms = 'swing';
      const cop2 = lv >= 4 ? makePerson(rnd, { kind: 'cop' }) : null;
      if (cop2) {
        R.run((function* () { yield* R.enter(cop2, clamp(cc.x + side * 12, EX0, EX1), cc.z + 0.6); ctx.sfx('whistle'); yield* go(ctx, cop2, cc.x + side * 2.6, cc.z + 0.6, 6); cop2.heading = side > 0 ? W : E; })());
      }
      if (lv >= 5 && L.kind !== 'ped') R.run(R.police(side, L.chaseZ, 11, 0.2));
      yield* wait(0.6);
      say(ctx, a, 'sorry', { size: 12, color: '#cfe8ff' });
      yield* wait(0.6);
      say(ctx, b, 'ook sorry', { size: 12, color: '#cfe8ff' });
      yield* wait(0.8);
      // the bets are settled: the granny backed a draw
      cam.low(bookie, { dist: 8, hold: 2.4 });
      ctx.sfx('coin');
      ctx.fx.cash(bookie.g.position.x, 1.05, bookie.g.position.z, 22, 3, 6);
      bookie.arms = 'up';
      yell(ctx, bookie, 'GELIJKSPEL! OMA WINT!', '#b9fbc0', 15);
      for (const [p] of spectators) if (p !== bookie && p.alive) { p.arms = 'fist'; say(ctx, p, 'ACH...', { size: 12, color: '#cfe8ff' }); }
      yield* wait(1.0);

      // 6. aftermath: everybody wanders off, the law makes two men shake hands
      a.pose = b.pose = null; a.air = b.air = false; a.g.position.y = b.g.position.y = 0;
      for (const [p] of spectators) if (p.alive && mob.includes(p)) R.give(p);
      cam.wide(pt(cc.x, cc.z), { dist: 22, hold: 3 });
      a.heading = E; b.heading = W;
      a.arms = b.arms = 'wave';
      say(ctx, cop, lv >= 4 ? 'MEEKOMEN, DE HEREN.' : 'HAND GEVEN. NU.', { size: 13, color: '#7db8ff' });
      yield* wait(1.0);
      a.arms = b.arms = 'swing';
      const out = (p, dx) => R.away(p, dx, lv >= 4 ? 2.8 : 4);
      R.run(out(a, -6));
      R.run(out(b, 6));
      for (const [p] of spectators) if (p.alive && !mob.includes(p)) R.run(R.away(p, rnd.sign() * 6, 3.4));
      yield* wait(0.8);
      R.run(R.away(cop, -side * 6, 3));
      if (cop2 && cop2.alive) R.run(R.away(cop2, side * 6, 3));
      yield* R.settle(12);
      for (const sh of shoes) R.rm(sh);
      yield* wait(0.3);
      done = true;
    } finally {
      cam.release();
      R.free(done);
    }
  },
};

G.shadyDeal = {
  w: [0, 0, 1.4, 2, 2], crime: 1,
  *run(ctx) {
    const { L, rnd } = ctx, z = L.walkF[1], x = rnd.range(-7, 7), dir = rnd.sign();
    const dealer = makePerson(rnd, { kind: 'hoodie', shirt: '#4a3b2a' });
    yield* enter(ctx, dealer, clamp(x - dir * 9, EX0, EX1), z);
    dealer.gait = 'sneak';
    yield* go(ctx, dealer, x, z, 3);
    dealer.gait = 'walk'; dealer.heading = Math.PI;
    say(ctx, dealer, 'psst...', { size: 12, color: '#b9fbc0' });
    const ped = yield* needPed(ctx, 12);
    if (!ped) { yield* leave(ctx, dealer, 3, clamp(x + dir * 9, EX0, EX1)); return; }
    const left = ped.g.position.x < x;
    yield* go(ctx, ped, x + (left ? -1.1 : 1.1), z - 0.2, 2.6);
    ped.heading = left ? E : W; dealer.heading = left ? W : E;
    const wares = sculpt((v) => { for (let i = 0; i < 3; i++) v.box(-0.22 + i * 0.22, 0.95 + (i % 2) * 0.22, 0.26, 0.14, 0.16, 0.05, ['#7cfc9a', '#ffe066', '#ff8fab'][i]); }, MAT.glow);
    dealer.b.add(wares);
    dealer.arms = 'up';
    say(ctx, dealer, rnd.pick(['OREGANO. ECHT WAAR.', '"KRUIDEN"', 'VERS UIT DE... TUIN']), { size: 14, color: '#b9fbc0' });
    yield* wait(1.3);
    ped.arms = 'hold';
    ctx.sfx('coin');
    ctx.fx.cash(x, 1.0, z, 3, 1.5, 2.5);
    ctx.incident();
    ctx.news(`Man sells "oregano" on ${ctx.st.name} at suspicious mark-up`);
    yield* wait(0.8);
    const cop = makePerson(rnd, { kind: 'cop' });
    yield* enter(ctx, cop, clamp(x + dir * 10, EX0, EX1), L.walkF[0]);
    ctx.sfx('whistle');
    say(ctx, cop, 'HÉ! WAT IS DAT DAAR?', { size: 15, color: '#7db8ff' });
    yield* wait(0.35);
    dealer.b.remove(wares);
    dealer.arms = 'swing';
    say(ctx, dealer, 'NIKS!', { size: 15, color: '#ffffff' });
    ctx.fx.burst(x, 0.85, z, { n: 10, colors: ['#5a8f3c', '#7cfc9a', '#3f6f2a'], speed: 3, up: 4, size: [0.05, 0.1] });
    ctx.wanted = dealer;
    ped.arms = 'swing';
    say(ctx, ped, '♪ la la la ♪', { size: 12, color: '#cfe8ff' });
    release(ctx, ped);
    ctx.run((function* () { yield* chase(ctx, cop, dealer, 6.3, 0.8, 8); yield* leave(ctx, cop, 6, dir > 0 ? EX0 : EX1); })());
    yield* leave(ctx, dealer, 7.6, dir > 0 ? EX0 : EX1);
    yield* wait(1.5);
  },
};

const deskProp = () => piece((v, gl) => {
  for (const sx of [-0.52, 0.52]) for (const sz of [-0.28, 0.28]) v.box(sx, 0, sz, 0.07, 0.8, 0.07, '#8a8f98');
  v.box(0, 0.8, 0, 1.2, 0.06, 0.7, '#c9a26b');
  v.box(0, 0.86, 0.06, 0.52, 0.03, 0.34, '#2b2f36');
  v.box(0, 0.89, -0.12, 0.52, 0.36, 0.03, '#2b2f36');
  v.box(0.45, 0.86, 0.12, 0.16, 0.12, 0.16, '#f4f1de');
  gl.box(0, 0.93, -0.1, 0.44, 0.28, 0.02, '#7cfc9a');
}, 11);
const foldedDesk = () => sculpt((v) => { v.box(0, 0, 0, 0.9, 0.1, 0.6, '#c9a26b'); v.box(0, 0.1, 0, 0.7, 0.08, 0.4, '#8a8f98'); });
const hookProp = () => sculpt((v) => v.box(0, 0, 0, 0.13, 0.13, 0.13, '#ffd60a'), MAT.glow);

G.phishing = {
  w: [0, 1.4, 2, 2, 1.6], crime: 1,
  *run(ctx) {
    const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'phishing'), R = rig(ctx);
    let done = false;
    try {
      const ped = yield* needPed(ctx, 9);
      if (!ped) return;
      R.borrow(ped);
      const p = ped.g.position, back = ped.lineZ < 0, dir = ped.dir, fz = back ? -1 : 1;
      const hx = clamp(p.x + dir * 6, -16, 16), hz = back ? L.walkF[1] : L.walkB[0], hh = back ? Math.PI : 0;
      const vz = back ? [L.walkB[0], L.walkB[1]] : [L.walkF[0], L.walkF[1]], dz = hz + fz * 1.0;
      const hub = pt(hx, (hz + ped.lineZ) / 2);
      const tipX = hx, tipY = 1.3, tipZ = hz + fz * 1.1;

      // 1. set-up: a phone zombie ambles in while a hooded figure carries in a folding desk
      cam.wide(hub, { dist: 26, hold: 5 });
      ped.hold(item.phone()); ped.arms = 'hold'; ped.heading = dir > 0 ? E : W;
      const walk = R.run(go(ctx, ped, hx - dir * 1.8, ped.lineZ, 1.4));
      const hk = makePerson(rnd, { kind: 'hoodie', shirt: rnd.pick(['#1b4332', '#14213d', '#3a0ca3']) });
      hk.hold(foldedDesk(), 'front'); hk.arms = 'carry';
      yield* R.enter(hk, clamp(hx + dir * 7, EX0, EX1), hz);
      yield* go(ctx, hk, hx, hz, 3.6);
      hk.drop(); hk.arms = 'swing'; hk.heading = hh;
      yield* lookAround(hk, 0.9, 0.22);
      const desk = R.add(deskProp());
      desk.position.set(hx, 0.001, dz); desk.rotation.y = hh + Math.PI; desk.scale.setScalar(0.001);
      ctx.sfx('clatter');
      yield* tween(0.35, (t) => desk.scale.setScalar(Math.max(0.001, t)), ease.outBack);
      ctx.fx.puff(hx, 0.2, dz);
      ctx.sfx('ding');

      // 2. reveal
      hk.heading = 0; // turn to the lens for the reveal
      cam.low(hk, { dist: 7, hold: 2.6 });
      cam.card('DE HENGELAAR', 'Phishing, but make it literal', 2);
      cam.freeze(0.7);
      ctx.sfx('sting');
      hk.arms = 'up';
      yield* wait(0.45);
      hk.arms = 'hold';
      say(ctx, hk, 'hehehe', { size: 14, color: '#b9fbc0' });
      yield* wait(0.4);
      hk.heading = hh;

      // 3. the act: text message goes out, the victim reads it, the line is cast
      cam.two(hk, ped, { hold: 3 });
      for (let i = 0; i < 2; i++) { ctx.sfx('typing'); say(ctx, hk, '*klik klik*', { size: 12, color: '#b9fbc0' }); yield* wait(0.45); }
      yield* waitUntil(() => walk.done, 4);
      R.stop(walk);
      faceTo(ped, hx, hz);
      ctx.sfx('ding');
      say(ctx, ped, rnd.pick(['"UW PAKKET WACHT"', '"HOI MAM, NIEUW NUMMER"', '"U HEEFT GEWONNEN!"']), { size: 12, color: '#cfe8ff', dur: 1.8 });
      yield* doubleTake(ctx, ped, '!');
      hk.hold(item.rod());
      hk.arms = 'fist'; // wind-up
      yield* wait(0.5);
      const ln = lineObj(R), hook = R.add(hookProp());
      hook.position.set(tipX, tipY, tipZ);
      cam.ots(hk, ped, { hold: 1.8 });
      hk.arms = 'hold';
      ctx.sfx('whoosh');
      ln.visible = true;
      const px = p.x, pz = p.z;
      yield* tween(0.5, (t) => {
        const x = lerp(tipX, px, t), y = lerp(tipY, 1.0, t) + Math.sin(t * Math.PI) * 0.65, z = lerp(tipZ, pz, t);
        hook.position.set(x, y, z);
        ln.aim(tipX, tipY, tipZ, x, y, z);
      }, ease.outQuad);
      ctx.sfx('boing');
      ctx.fx.text('PHISHING!', at((hx + px) / 2, 2.6, (hz + pz) / 2), { size: 24, color: '#7cfc9a' });
      cam.close(ped, { hold: 1.4 });
      ped.arms = 'up';
      const wal = R.add(item.wallet());
      wal.scale.setScalar(2); wal.position.set(px, 0.9, pz);
      ctx.sfx('pop');
      yield* wait(0.5);
      // reel in, the victim gets dragged a few steps along
      cam.two(hk, ped, { hold: 2, el: 0.55 });
      hk.arms = 'fist';
      ctx.sfx('reel');
      let again = false;
      yield* tween(0.95, (t) => {
        const k = ease.inQuad(t);
        p.z = pz - fz * 0.8 * Math.sin(t * Math.PI * 0.5);
        const x = lerp(px, tipX, k), y = lerp(0.9, tipY, k), z = lerp(p.z, tipZ, k);
        wal.position.set(x, y, z);
        hook.position.set(x, y + 0.12, z);
        ln.aim(tipX, tipY, tipZ, x, y, z);
        if (t > 0.5 && !again) { again = true; ctx.sfx('reel'); }
      });
      R.rm(wal); R.rm(hook); ln.visible = false;
      const w2 = item.wallet();
      w2.scale.setScalar(1.7); w2.position.set(0, -0.78, 0.1);
      hk.armL.add(w2);
      hk.arms = 'hold';
      ctx.sfx('coin');
      ctx.fx.cash(hx, 1.2, hz, 8, 2, 4);
      say(ctx, hk, 'hehehe', { size: 14, color: '#b9fbc0' });
      ctx.incident();
      ctx.wanted = hk;
      yield* wait(0.4);
      ped.arms = 'fist';
      yell(ctx, ped, rnd.pick(['MIJN SPAARGELD!', 'OPGELICHT!', 'HÈ?! €0,00?!']));
      yield* wait(0.4);

      // 4. escalation: greed. Two more phone zombies, both bite at once, and the lines tangle
      say(ctx, hk, 'MEER!', { size: 16, color: '#ffd60a' });
      cam.top(hub, { dist: 22, hold: 3.4 });
      const v2 = makePerson(rnd, { kind: 'civ' }), v3 = makePerson(rnd, { kind: rnd.chance(0.4) ? 'granny' : 'civ' });
      for (const v of [v2, v3]) { v.hold(item.phone()); v.arms = 'hold'; }
      v2.heading = E; v3.heading = W;
      const crowd = gather(ctx, R, hx, 2, 12);
      for (const c of crowd) filmIt(c, hx, hz);
      yield* all(R.enter(v2, clamp(hx - 9, EX0, EX1), vz[0]), R.enter(v3, clamp(hx + 9, EX0, EX1), vz[1]));
      yield* all(go(ctx, v2, hx - 4.2, vz[0], 3.6), go(ctx, v3, hx + 4.2, vz[1], 3.6));
      ctx.sfx('ding'); yield* wait(0.2); ctx.sfx('ding');
      say(ctx, v2, '"GRATIS!"', { size: 12, color: '#cfe8ff' }); say(ctx, v3, '"KLIK HIER"', { size: 12, color: '#cfe8ff' });
      yield* wait(0.3);
      hk.arms = 'fist';
      say(ctx, hk, 'TWEE TEGELIJK!', { size: 16, color: '#7cfc9a' });
      yield* wait(0.35);
      const ln2 = lineObj(R, '#ffe8f7'), h2 = R.add(hookProp()), h3 = R.add(hookProp());
      ln.visible = true; ln2.visible = true;
      const hp = hk.g.position;
      const reline = () => {
        const ax = hp.x, az = hp.z + fz * 1.1;
        ln.aim(ax, tipY, az, v2.g.position.x, 1.0, v2.g.position.z); h2.position.set(v2.g.position.x, 1.0, v2.g.position.z);
        ln2.aim(ax, tipY, az, v3.g.position.x, 1.0, v3.g.position.z); h3.position.set(v3.g.position.x, 1.0, v3.g.position.z);
      };
      hk.arms = 'hold';
      cam.two(v2, v3, { hold: 2.4 });
      ctx.sfx('whoosh');
      const a2 = v2.g.position.clone(), a3 = v3.g.position.clone();
      yield* tween(0.4, (t) => {
        const ax = hx, az = tipZ;
        h2.position.set(lerp(ax, a2.x, t), lerp(tipY, 1.0, t) + Math.sin(t * Math.PI) * 0.6, lerp(az, a2.z, t));
        h3.position.set(lerp(ax, a3.x, t), lerp(tipY, 1.0, t) + Math.sin(t * Math.PI) * 0.6, lerp(az, a3.z, t));
        ln.aim(ax, tipY, az, h2.position.x, h2.position.y, h2.position.z);
        ln2.aim(ax, tipY, az, h3.position.x, h3.position.y, h3.position.z);
      }, ease.outQuad);
      ctx.sfx('boing');
      v2.arms = v3.arms = 'up';
      yell(ctx, v2, 'AU!', '#ffb4a2', 14); yell(ctx, v3, 'HÈ?!', '#ffb4a2', 14);
      // tug-of-war: the hacker is yanked left and right
      yield* tween(0.65, (t) => { hp.x = hx + Math.sin(t * Math.PI * 3) * 0.7; reline(); });
      // both victims run circles around the hacker, wrapping him in line
      ctx.sfx('reel');
      const turn = TAU * 1.3;
      yield* tween(2.2, (t) => {
        const e = ease.inOut(t), th = turn * e, r = lerp(4.2, 1.1, e), s = Math.min(1, t * 3);
        const x2 = hx + Math.cos(th + Math.PI) * r, z2 = lerp(vz[0], hz + Math.sin(th + Math.PI) * r * 0.5, s);
        const x3 = hx + Math.cos(th) * r, z3 = lerp(vz[1], hz + Math.sin(th) * r * 0.5, s);
        v2.heading = Math.atan2(x2 - v2.g.position.x, z2 - v2.g.position.z); v3.heading = Math.atan2(x3 - v3.g.position.x, z3 - v3.g.position.z);
        v2.g.position.x = x2; v2.g.position.z = z2; v3.g.position.x = x3; v3.g.position.z = z3;
        v2.moving = v3.moving = 5;
        hp.x = hx; hk.heading = hh - th;
        reline();
      });
      hk.heading = hh;
      say(ctx, hk, 'KNOOP!', { size: 22, color: '#ffd60a' });
      ctx.sfx('gasp');
      // the desk goes over, laptop and all
      ctx.sfx('slam'); ctx.shake(0.3);
      ctx.fx.sparks(hx, 0.8, dz, 12);
      ctx.fx.text('ZZZT!', at(hx, 2.2, dz), { size: 20, color: '#7cfc9a' });
      yield* tween(0.35, (t) => { desk.rotation.z = 1.45 * ease.outBack(t); desk.position.y = 0.45 * t; desk.position.x = hx + 0.3 * t; });
      // the wallet flies out of his hand and lands at the first victim's feet
      hk.armL.remove(w2);
      const wf = R.add(item.wallet());
      wf.scale.setScalar(2); wf.position.set(hx, 1.05, hz);
      const wx = p.x - dir * 1.8;
      yield* arc(wf, wx, 0.1, p.z, 1.6, 0.7, 6);
      ctx.sfx('coin');
      cam.close(ped, { hold: 1.6 });
      yield* go(ctx, ped, wx, p.z, 3);
      ped.hold(item.wallet()); ped.arms = 'up';
      R.rm(wf);
      say(ctx, ped, 'HA! TERUG!', { size: 15, color: '#b9fbc0' });
      yield* wait(0.3);

      // 5. comeuppance, scaled by level
      if (lv <= 2) {
        // calm: everyone unwinds, the laptop shows an error, the hacker is left tied up
        cam.wide(hub, { dist: 20, hold: 5 });
        yield* tween(1.4, (t) => {
          const e = ease.inOut(t), th = turn * (1 - e), r = lerp(1.1, 3.6, e);
          v2.g.position.x = hx + Math.cos(th + Math.PI) * r; v2.g.position.z = hz + Math.sin(th + Math.PI) * r * 0.5;
          v3.g.position.x = hx + Math.cos(th) * r; v3.g.position.z = hz + Math.sin(th) * r * 0.5;
          v2.moving = v3.moving = 3;
          hk.heading = hh - th;
          reline();
        });
        ln.visible = false; ln2.visible = false; h2.visible = false; h3.visible = false;
        v2.arms = v3.arms = 'swing';
        hk.arms = 'up';
        say(ctx, hk, '★ ★', { size: 16, color: '#ffe066', dur: 0.9 });
        yield* hop(hk, 0.25, 0.4);
        hk.pose = 'sit'; hk.air = true; hk.heading = 0;
        hk.g.position.y = 0.23; hk.arms = 'swing';
        ctx.fx.text('404', at(hx, 2.2, dz), { size: 26, color: '#7cfc9a' });
        say(ctx, hk, '*zucht*', { size: 12, color: '#cfe8ff' });
        ctx.news('Phishing ring undone by its own knots; laptop says "404 Not Found"');
        yield* wait(0.7);
        R.run(R.away(v2, -7, 3.6)); R.run(R.away(v3, 7, 3.6));
        say(ctx, ped, 'doei!', { size: 12, color: '#cfe8ff' });
        R.give(ped);
        yield* wait(0.5);
        hk.pose = null; hk.air = false; hk.g.position.y = 0;
        R.run(vanish(R, desk, 0.4));
        yield* wait(0.3);
        yield* R.away(hk, dir * 4, 3);
      } else {
        // the cyber cop arrives on a bike; the hacker slips the knots and escapes dragging the desk
        const flee = hx > 0 ? 1 : -1, copBike = makeBike(rnd, makePerson(rnd, { kind: 'cop' }));
        cam.track(copBike, { hold: 3, lead: 2 });
        R.run((function* () {
          yield* R.enter(copBike, flee > 0 ? EX0 : EX1, hz + fz * 0.4);
          copBike.face(flee > 0 ? E : W);
          ctx.sfx('bell'); ctx.sfx('whistle');
          say(ctx, copBike, 'POLITIE CYBERCRIME!', { size: 14, color: '#7db8ff' });
        })());
        yield* wait(0.7);
        ln.visible = false; ln2.visible = false; h2.visible = false; h3.visible = false;
        v2.arms = v3.arms = 'swing';
        R.run(R.away(v2, -7, 4)); R.run(R.away(v3, 7, 4));
        R.give(ped);
        hk.arms = 'up'; hk.heading = flee > 0 ? E : W;
        yield* doubleTake(ctx, hk, '!!');
        // the desk stays tied on: a last line drags it behind
        const tow = lineObj(R, '#b9fbc0');
        tow.visible = true;
        const dp = desk.position;
        const dragDesk = () => {
          const hxp = hk.g.position.x - flee * 2.3, hzp = hk.g.position.z;
          dp.x += (hxp - dp.x) * 0.25; dp.z += (hzp - dp.z) * 0.25;
          dp.y = 0.45 + Math.abs(Math.sin(hk.g.position.x * 2.2)) * 0.12;
          tow.aim(hk.g.position.x, 0.9, hk.g.position.z, dp.x, 0.6, dp.z);
        };
        ctx.wanted = hk;
        cam.track(hk, { hold: 4.5, lead: 3 });
        const caught = lv >= 4;
        if (lv >= 5 && L.kind !== 'ped') R.run(R.police(flee, L.chaseZ, 11, 1.4));
        if (lv >= 4) R.run(R.cop(hk, 7, 0.8));
        hk.arms = 'swing';
        let spark = 0;
        const exitX = flee > 0 ? EX1 : EX0;
        const bikeRun = R.run((function* () { yield* wait(0.5); yield* go(ctx, copBike, exitX, copBike.g.position.z, caught ? 9.4 : 6.2); yield* R.out(copBike); })());
        yield* goEach(ctx, hk, exitX, hz, 7.3, (dt) => {
          dragDesk();
          spark -= dt;
          if (spark < 0) { spark = 0.09; ctx.fx.sparks(dp.x, 0.1, dp.z, 2); }
          if (caught && Math.abs(copBike.g.position.x - hk.g.position.x) < 1.6) return true;
        });
        if (caught) {
          ctx.sfx('skid'); ctx.shake(0.2);
          R.stop(bikeRun);
          hk.arms = 'up';
          say(ctx, hk, 'BUSTED!', { size: 24, color: '#7db8ff' });
          cam.close(hk, { hold: 1.8 });
          cam.freeze(0.6);
          ctx.fx.burst(hk.g.position.x, 1.15, hk.g.position.z, { n: 12, colors: ['#ffd60a', '#fff'], speed: 5, up: 7, glow: true, size: [0.1, 0.18] });
          ctx.news('Cybercrime unit lands the big phish: one bike, one bell, one desk');
          yield* wait(1.1);
          tow.visible = false;
          R.run(vanish(R, desk, 0.4));
          R.run(R.away(copBike, flee * 6, 4));
          R.run(R.away(hk, flee * 4, 3.4));
        } else {
          ctx.news('Phisher escapes dragging his own desk. Laptop "still booting"');
          tow.visible = false;
          R.run(vanish(R, desk, 0.4));
          yield* R.out(hk);
        }
      }
      cam.wide(hub, { dist: 26, hold: 2 });
      yield* R.settle(10);
      yield* wait(0.6);
      done = true;
    } finally {
      cam.release();
      R.free(done);
    }
  },
};

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
const ready = (ctx, n) => { const g = G[n]; return (!g.need || g.need.every((k) => ctx.L[k] && ctx.L[k].length > 0)) && (!g.avail || g.avail(ctx)); };

// ---------------------------------------------------------------- the director
const PACE = { 1: { gap: [4, 7], max: 1 }, 2: { gap: [3.5, 6], max: 1 }, 3: { gap: [2.6, 4.6], max: 1 }, 4: { gap: [2, 3.6], max: 2 }, 5: { gap: [1.5, 2.8], max: 2 } };

/** The opening gag: the one this neighbourhood's figures point at most, if this spot can host it. */
function signatureFor(ctx) {
  const lv = ctx.level, names = Object.keys(G).filter((n) => G[n].w[lv - 1] > 0 && ready(ctx, n));
  if (!names.length) return null;
  if (lv === 1) return names.includes('pigeonLady') ? 'pigeonLady' : names[0];
  const crime = names.filter((n) => G[n].crime), pool = crime.length ? crime : names;
  return pool.reduce((a, b) => (weight(ctx, b) > weight(ctx, a) ? b : a));
}
function* director(ctx, delay = 2.4, signature = true) {
  const { rnd, level } = ctx, pace = PACE[level], locks = new Set();
  let active = 0;
  const recent = [];
  const launch = (name) => {
    const g = G[name];
    active++;
    if (g.lock) locks.add(g.lock);
    recent.push(name);
    if (recent.length > 3) recent.shift();
    ctx.gagStart?.(name);
    ctx.run((function* () {
      try { yield* g.run(ctx); } finally { active--; if (g.lock) locks.delete(g.lock); ctx.gagEnd?.(name); }
    })());
  };
  yield* wait(delay);
  if (signature) { const sig = signatureFor(ctx); if (sig) launch(sig); }
  for (;;) {
    yield* wait(rnd.range(pace.gap[0], pace.gap[1]));
    if (active >= pace.max) continue;
    if (ctx.cineBusy && ctx.cineBusy()) continue; // a set piece holds the camera here
    const opts = Object.keys(G).filter((n) => weight(ctx, n) > 0 && !recent.includes(n) && !(G[n].lock && locks.has(G[n].lock)) && ready(ctx, n));
    if (!opts.length) { recent.shift(); continue; }
    let r = rnd() * opts.reduce((t, n) => t + weight(ctx, n), 0), pickN = opts[0];
    for (const n of opts) { r -= weight(ctx, n); if (r <= 0) { pickN = n; break; } }
    launch(pickN);
  }
}

/** Street-long background life. */
export function startAmbient(ctx) {
  ctx.peds = [];
  ctx.road = { closed: 0, vehicles: new Set() };
  ctx.run(pedSpawner(ctx));
  ctx.run(carSpawner(ctx));
  ctx.run(bikeSpawner(ctx));
}
/** One spot on the street where gags play. `only` forces a single gag (debug). */
export function startLocale(ctx, { only = null, delay = 2.4, signature = true, withHeli = false } = {}) {
  ctx.peds = [];
  ctx.road = { closed: 0, vehicles: new Set() };
  ctx.wanted = null;
  ctx.run(boatSpawner(ctx));
  ctx.run(gullSpawner(ctx));
  ctx.run(pigeons(ctx));
  if (withHeli) ctx.run(heli(ctx));
  if (only && Object.hasOwn(G, only)) {
    ctx.run((function* () {
      for (;;) {
        yield* wait(2);
        if (ready(ctx, only)) { ctx.gagStart?.(only); try { yield* G[only].run(ctx); } finally { ctx.gagEnd?.(only); } }
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
  ctx.gagStart?.(name);
  ctx.run((function* () { try { yield* G[name].run(ctx); } finally { state.done = true; ctx.gagEnd?.(name); } })());
  return state;
}
