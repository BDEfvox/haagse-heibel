// Ambient street life + crime-level shenanigans, written as generator scripts.
import * as THREE from 'three';
import { wait, tween, all, race, waitUntil, ease, clamp, lerp, TAU, sculpt, piece, MAT } from './kit.js';
import { makePerson, makeDog, makeCat, makeBird, item } from './cast.js';
import { makeCar, makeBike, makeScooter, makeFatbike, makeHeli, makeBoat } from './props.js';
import { SKINS, SHIRTS, PANTS, HAIRS } from './crowd.js';
import * as S from './setting.js';
import * as ACTS from './acts/index.js';

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
  if (!y) { const q = S.nudge(ctx, x, z); x = q.x; z = q.z; } // never pop in on a tree or a wall
  ctx.spawn(a, x, z, y);
  a.g.scale.setScalar(0.001);
  yield* popIn(ctx, a);
}
const edgeOf = (a) => (a.g.position.x < 0 ? EX0 : EX1);
/** Where a walker on this line gets to when heading for x: the end of the clear ground if that comes first. */
function* walkOff(ctx, a, tx, speed, z0 = a.g.position.z) {
  const p = a.g.position, d = Math.sign(tx - p.x), full = Math.abs(tx - p.x);
  let bx = tx, bz = z0, best = -1;
  if (d) {
    // the line itself first, then lines a little to either side (round a tree trunk), keeping the longest
    for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
      const e = S.runway(ctx, p.x, z0 + off, d, full), len = Math.abs(e - p.x);
      if (len > best + 0.01) { best = len; bx = e; bz = z0 + off; }
      if (len >= full - 0.01) break;
    }
  }
  yield* go(ctx, a, bx, bz, speed);
}
function* leave(ctx, a, speed = a.speed, toX = null) {
  if (!a.alive) return;
  yield* walkOff(ctx, a, toX ?? edgeOf(a), speed);
  yield* popOut(ctx, a);
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
  a.pose = null; a.air = false; a.arms = 'swing'; a.gait = 'walk';
  a.mood = 'neutral'; a.lookAt = null; a.laughT = 0; a.nodT = 0; a.shakeT = 0; // faces go back to neutral too
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
  const actors = new Set(), objs = new Set(), peds = new Set(), tasks = new Set(), keep = new Set();
  let closed = false, policeClosed = false, cops = 0;
  const R = {
    spawn(a, x, z, y) { ctx.spawn(a, x, z, y); actors.add(a); return a; },
    *enter(a, x, z, y) {
      if (!y) { const q = S.nudge(ctx, x, z); x = q.x; z = q.z; }
      R.spawn(a, x, z, y); a.g.scale.setScalar(0.001); yield* popIn(ctx, a);
    },
    *out(a) { if (a.alive) yield* popOut(ctx, a); actors.delete(a); },
    *leave(a, speed, toX) { yield* leave(ctx, a, speed, toX); actors.delete(a); },
    /** walk a few metres in one direction, then pop away (a short exit that does not need the street edge) */
    *away(a, dx, speed = 3.6) { if (!a.alive) return; yield* walkOff(ctx, a, clamp(a.g.position.x + dx, EX0, EX1), speed); yield* R.out(a); },
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
      if (L.kind === 'ped' || !S.roadHere(ctx, z)) return;
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
          yield* walkOff(ctx, p, p.g.position.x < x ? EX0 : EX1, 7.5, p.lineZ);
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
 *   balcony   a real house front with a window within 9 m of x      appears on a little balcony, comes out of the door later
 *   shop      a real shop door within 10 m                          the shopkeeper steps out of the door
 *   bench     a free bench within 9 m                               the person sitting there jumps up
 *   door      a real house or shop door within 12 m (no notice)     somebody comes out of the door
 *   passerby  nothing                                               a walker from the crowd (or a new one) stops and shouts
 * Generators: notice(line), calm(line), rush(line, to(), { speed, size }), home(). `owner` is who notices, `second`
 * who rushes in later (the same person for a passer-by). o.at = { x, z } is the thing being looked at, o.allow the variants.
 */
const PREF = { balcony: ['houses'], shop: ['shops'], bench: ['park', 'square', 'beach', 'water', 'open'], door: ['houses', 'shops'], passerby: [] };
function resident(ctx, R, x, look, o = {}) {
  const { rnd } = ctx, allow = o.allow || ['balcony', 'shop', 'bench', 'passerby'];
  const far = S.surroundings(ctx).far;
  const fits = {
    balcony: () => { const h = S.houseNear(ctx, x, 9, { tower: false }); return h && Math.abs(h.door.x - x) <= 16 ? { h } : null; },
    shop: () => { const h = S.houseNear(ctx, x, 10, { door: true, shop: true }); return h ? { h } : null; },
    bench: () => { const b = S.benchNear(ctx, x, 9); return b ? { b } : null; },
    door: () => { const h = S.houseNear(ctx, x, 12, { door: true, tower: false }); return h ? { h } : null; },
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
  let balcony = null, acquired = false;
  if (kind === 'bench') { spec.b.taken = true; res.cleanup = () => { spec.b.taken = false; }; }

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
      const h = spec.h, a = res.owner;
      // a little balcony to stand on, so nobody hovers in front of their own window
      balcony = R.add(piece((v) => {
        const bx = h.win.x, by = h.win.y - 0.42, bz = h.win.z + 0.45;
        v.box(bx, by, bz, 1.5, 0.12, 0.9, '#d6d0c2');
        v.box(bx, by + 0.12, bz + 0.42, 1.5, 1.0, 0.07, '#2f3640'); // 1 m railing for a 2 m person
        v.box(bx - 0.72, by + 0.12, bz, 0.07, 1.0, 0.9, '#2f3640');
        v.box(bx + 0.72, by + 0.12, bz, 0.07, 1.0, 0.9, '#2f3640');
      }));
      a.air = true;
      yield* R.enter(a, h.win.x, h.win.z + 0.35, h.win.y - 0.3);
      a.heading = 0; a.arms = 'fist';
    } else if (kind === 'shop') {
      yield* R.enter(res.owner, door.x, door.z, 0.001); // (a hair above the ground: the door is where it is, never nudged)
      res.owner.heading = 0; res.owner.arms = 'fist';
    } else if (kind === 'bench') {
      const a = res.owner, b = spec.b;
      a.air = true; a.pose = 'sit';
      yield* R.enter(a, b.x, b.z + 0.12, 0.32);
      a.heading = 0;
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
    yield* R.out(a);
    if (balcony) { R.rm(balcony); balcony = null; }
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
  R.spawn(bike, x, z, 0);
  bike.face(E);
  return { bike, rider, passenger };
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
    if (smoke && Math.random() < 0.6) ctx.fx.dust(x, 0.05, z, -sn * 1.2, -cs * 1.2, 1, '#e9e9e9');
  }
}
/**
 * Drive a vehicle along a smooth line through street-space points [[x, z], ...] (the first point is where it is now).
 * `speed` is metres per second, or a function of progress 0..1 (brake into the bend, power out of it). The car rolls,
 * dives and squats on its springs by itself; where it corners hard it lays rubber and smoke. o.each(dt, u) runs every
 * frame; return true to stop early. o.drift (0..1) slides the tail out in the bends.
 */
function* drive(ctx, car, pts, speed = 12, o = {}) {
  const P = [[car.g.position.x, car.g.position.z], ...pts], n = P.length;
  const at = (i) => P[clamp(i, 0, n - 1)];
  // Catmull-Rom through the points, sampled into a polyline with running length
  const line = [], per = 14;
  for (let i = 0; i < n - 1; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      line.push([
        0.5 * (2 * b[0] + (c[0] - a[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (3 * b[0] - a[0] - 3 * c[0] + d[0]) * t3),
        0.5 * (2 * b[1] + (c[1] - a[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (3 * b[1] - a[1] - 3 * c[1] + d[1]) * t3),
      ]);
    }
  }
  line.push(P[n - 1]);
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
/**
 * A passer-by the gags are done with (or have not picked yet) walks on along the pavement. Unless a gag has asked
 * for them to be kept, they join the city's crowd again as soon as there is pavement under their feet.
 */
function* stroll(a, keepSide = false) {
  if (!keepSide) { a.side = a.g.position.z >= 0 ? 1 : -1; a.wf ??= 0.5; }
  let tryT = 0.4;
  while (!a.busy && a.alive) {
    const c = a.ctx, p = a.g.position, dx = a.exitX - p.x;
    if (Math.abs(dx) < 0.12) { unped(c, a); if (!c.demote || !c.demote(a)) yield* popOut(c, a); return; }
    const dt = yield;
    if (a.busy || !a.alive) return;
    if (!a.keep && (tryT -= dt) <= 0) { tryT = 0.5; if (c.demote && c.demote(a)) { unped(c, a); return; } }
    const sp = a.walkSpeed, fwd = Math.sign(dx);
    if (!a.fixedZ) a.lineZ = paveZ(c, a, p.x);
    const dz = a.lineZ - p.z;
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
    yield* waitUntil(() => ok(np) || !np.alive, 9);
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
      if (Math.random() < 0.4) say(ctx, a, ctx.rnd.pick(['AAAH!', 'HELP!', 'OEI!', 'WEG HIER!']), { size: 13, color: '#fff' });
      yield* walkOff(ctx, a, a.g.position.x < x ? EX0 : EX1, 7.5, a.lineZ);
      a.arms = 'swing';
      if (!ctx.demote || !ctx.demote(a)) yield* popOut(ctx, a);
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
    const b = makeBird(rnd, 'pigeon'), px = rnd.range(-18, 18), q = spotNear(ctx, px, padZ(ctx, 'walkF0', px) - 0.4 + rnd.range(-0.2, 0.2), 0.3);
    ctx.spawn(b, q.x, q.z);
    b.face(rnd.range(0, TAU));
    birds.push(b);
  }
  for (;;) {
    yield* wait(rnd.range(1.5, 4));
    const b = rnd.pick(birds);
    const nx = clamp(b.g.position.x + rnd.range(-2.5, 2.5), -21, 21), q = S.findSpot(ctx, nx, padZ(ctx, 'walkF0', nx) - 0.4 + rnd.range(-0.25, 0.25), 0.3, 4);
    if (q) yield* go(ctx, b, q.x, q.z, 1.6);
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
  if (!S.roadHere(ctx, z)) return; // no road here: no police car
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

/** The set-piece toolkit, handed to the scenes in ./acts (they cannot import this file: it imports them). */
const T = {
  X0, X1, EX0, EX1, E, W, go, fly, chase, popIn, popOut, enter,
  edgeOf, walkOff, leave, hop, say, at, camFor, pt, faceTo, yell, padZ, once,
  spotNear, padSpot, tidy, takePed, rig, gather, filmIt, resident, lookAround, doubleTake, arc, goEach,
  extraKind, fatbike, seat, rideTo, mount, dismount, lineObj, chainObj, vanish, lootBox, beatsFor, flip, laugh, cackle, leap,
  tumble, getUp, seeStars, fright, tiptoe, shoulder, noteTrail, runDust, moods, skid, drive, handbrake,
  exhaust, spawnPed, unped, stroll, release, needPed, panic, closeRoad, openRoad, policeRun, footCop,
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
      yield* tween(5, (t) => { bal.position.y = wp.y + t * 16; bal.position.x = x0 + Math.sin(t * 9) * 0.8 + t * 3; });
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
/** The road at one spot, as the gags see it: they close it, and wait until the city's traffic has cleared it. */
const roadOf = (ctx) => ({ closed: 0, vehicles: { get size() { return ctx.trafficNear ? ctx.trafficNear() : 0; }, add() {}, delete() {}, has: () => false } });
/** The street as a whole. Its walkers, bikes, cars and trams belong to the city's crowd (crowd.js), not to the street. */
export function startAmbient(ctx) {
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
