// Ambient street life + crime-level shenanigans, written as generator scripts.
import * as THREE from 'three';
import { wait, tween, all, race, waitUntil, ease, clamp, lerp, TAU, sculpt, MAT } from './kit.js';
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
function spawnPed(ctx, atX = null, opts = {}) {
  const { L, rnd } = ctx, ex0 = L.x0 + 0.5, ex1 = L.x1 - 0.5;
  const dir = opts.dir ?? rnd.sign();
  const z = (opts.z ?? rnd.pick([...L.walkB, ...L.walkF])) + rnd.range(-0.15, 0.15);
  const r = rnd();
  const a = makePerson(rnd, { kind: opts.kind || (r < 0.12 ? 'kid' : r < 0.22 ? 'granny' : 'civ') });
  a.dir = dir; a.lineZ = z; a.exitX = dir > 0 ? ex1 : ex0; a.walkSpeed = a.speed;
  ctx.spawn(a, atX ?? (dir > 0 ? ex0 : ex1), z);
  a.face(dir > 0 ? E : W);
  ctx.peds.push(a);
  ctx.run((function* () {
    a.g.scale.setScalar(0.001);
    yield* popIn(ctx, a);
    yield* stroll(a);
  })());
  return a;
}
function unped(ctx, a) {
  const list = (a.ctx || ctx).peds, i = list.indexOf(a);
  if (i >= 0) list.splice(i, 1);
}
function* stroll(a) {
  while (!a.busy && a.alive) {
    const p = a.g.position, dx = a.exitX - p.x;
    if (Math.abs(dx) < 0.12) { unped(a.ctx, a); yield* popOut(a.ctx, a); return; }
    const dt = yield;
    const sp = a.walkSpeed, dz = a.lineZ - p.z;
    p.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
    p.z += clamp(dz, -sp * dt * 0.7, sp * dt * 0.7);
    p.y = 0;
    a.heading = Math.atan2(Math.sign(dx), clamp(dz, -1, 1) * 0.6);
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
/** A passing car. It vanishes in a puff when it reaches a stretch a gag has closed off. */
function* drive(ctx, car, z, dir, speed) {
  const { L } = ctx, half = (car.len || 3.4) / 2 + 0.6;
  ctx.spawn(car, dir > 0 ? L.x0 + half : L.x1 - half, z, 0);
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
  yield* race(go(ctx, car, dir > 0 ? L.x1 - half : L.x0 + half, z, speed), watch);
  for (const c of inWin) c.road.vehicles.delete(car);
  ctx.road.vehicles.delete(car);
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
      if (ctx.road.vehicles.size < Math.min(26, Math.ceil(len / 70))) ctx.run(drive(ctx, makeCar(rnd, rnd.chance(0.1) ? 'taxi' : rnd.chance(0.08) ? 'van' : 'car', L.night), dir > 0 ? L.laneF : L.laneB, dir, 7));
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
    if (riding < cap) {
      const dir = rnd.sign();
      const bike = makeBike(rnd, makePerson(rnd, { scale: 1.2 }));
      riding++;
      ctx.run((function* () {
        try {
          const z = dir > 0 ? L.bikeF : L.bikeB;
          yield* enter(ctx, bike, dir > 0 ? L.x0 + 1.1 : L.x1 - 1.1, z, 0);
          bike.face(dir > 0 ? E : W);
          if (rnd.chance(0.12)) ctx.sfx('bell');
          yield* go(ctx, bike, dir > 0 ? L.x1 - 1.1 : L.x0 + 1.1, z, rnd.range(4.6, 6.4));
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
    for (let i = 0; i < 5; i++) { say(ctx, cat, 'Z', { size: 13 + i * 3, color: '#cfe8ff', off: 1, rise: 1.8, dur: 1.5 }); ctx.sfx('zzz'); yield* wait(1.0); }
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
      ctx.fx.burst(b.x, 1.2, b.z + 0.8, { n: 4, colors: ['#e9c46a', '#d9b382'], speed: 2.5, up: 3, size: [0.05, 0.08], life: [0.5, 0.8] });
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
    const { rnd } = ctx;
    const ped = yield* needPed(ctx, 10);
    if (!ped) return;
    const fries = ped.hold(item.fries());
    ped.arms = 'hold'; ped.heading = 0;
    say(ctx, ped, 'mmm, patat', { size: 12, color: '#ffe08a' });
    const p = ped.g.position, gull = makeBird(rnd, 'gull');
    gull.fly = true;
    ctx.spawn(gull, p.x + rnd.sign() * 13, p.z + 5, 11);
    yield* wait(0.8);
    ctx.sfx('squawk');
    yield* fly(gull, p.x + 0.5, p.y + 1.7, p.z + 0.5, 13);
    ped.drop();
    gull.b.add(fries);
    fries.position.set(0, 0.25, 0.55);
    ctx.sfx('yoink');
    say(ctx, gull, 'YOINK!', { size: 22, color: '#ffd60a', off: 0.8 });
    ctx.fx.puff(p.x, p.y + 1.6, p.z);
    ctx.incident();
    ctx.news(`Seagull strikes again on ${ctx.st.name}: fries gone in 0.4 seconds`);
    ctx.run((function* () { yield* fly(gull, p.x - rnd.sign() * 30, 13, p.z + 8, 10); ctx.despawn(gull); })());
    ped.arms = 'fist';
    ctx.sfx('hey');
    yield* wait(0.3);
    say(ctx, ped, rnd.pick(['HEY!!', 'ROTMEEUW!', 'MIJN PATAT!']), { size: 17, color: '#ff6b6b' });
    yield* wait(1.6);
    release(ctx, ped);
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
    t.position.set(car.x + 0.75, 0.86, car.z);
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
    yield* hop(dog, 0.8, 0.3);
    const fish = sculpt((v) => { v.box(0, 0, 0, 0.5, 0.12, 0.14, '#b8c7d1'); v.box(0.3, 0, 0, 0.12, 0.2, 0.06, '#8fa3ad'); });
    dog.b.add(fish);
    fish.position.set(0, 0.42, 0.72);
    ctx.sfx('yoink');
    say(ctx, dog, 'YOINK!', { size: 20, color: '#ffd60a', off: 1.4 });
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
    const { L, rnd } = ctx, r = rnd.pick(L.racks);
    const dir = r.x > 0 ? -1 : 1; // approaches from the far side, escapes across the street
    const thief = makePerson(rnd, { kind: rnd.chance(0.6) ? 'raccoon' : 'robber' });
    yield* enter(ctx, thief, dir > 0 ? EX0 : EX1, L.walkB[0]);
    thief.gait = 'sneak'; thief.arms = 'sneak';
    yield* go(ctx, thief, r.x, r.z + 0.2, 3.2);
    thief.heading = Math.PI;
    for (let i = 0; i < 3; i++) { ctx.sfx('snip'); ctx.fx.sparks(r.x, 0.8, r.z - 0.4, 5); yield* wait(0.3); }
    ctx.fx.text('KNIP!', at(r.x, 2.2, r.z), { size: 18, color: '#ffe08a' });
    const kind = thief.kind;
    ctx.despawn(thief);
    const rider = makePerson(rnd, { kind });
    const bike = makeBike(rnd, rider);
    ctx.spawn(bike, r.x, r.z + 0.3);
    bike.face(dir > 0 ? E : W);
    ctx.wanted = bike;
    ctx.sfx('yoink'); ctx.sfx('bell');
    say(ctx, bike, 'YOINK!', { size: 22, color: '#ffd60a' });
    ctx.incident();
    ctx.news(`Bike stolen on ${ctx.st.name}. Witnesses: "ja, dat gebeurt"`);
    const h = L.houses.length ? L.houses.reduce((a, b) => (Math.abs(b.door.x - r.x) < Math.abs(a.door.x - r.x) ? b : a)) : { door: { x: clamp(r.x - dir * 4, EX0, EX1), z: L.walkB[0] } };
    const owner = makePerson(rnd, {});
    ctx.run((function* () {
      yield* wait(0.5);
      yield* enter(ctx, owner, h.door.x, h.door.z);
      owner.arms = 'up';
      ctx.sfx('hey');
      say(ctx, owner, 'MIJN FIETS!!', { size: 17, color: '#ff6b6b' });
      yield* go(ctx, owner, dir > 0 ? EX1 : EX0, L.walkB[1], 5.4);
      yield* popOut(ctx, owner);
    })());
    if (ctx.level >= 3) ctx.run(footCop(ctx, owner, 6, 1.4));
    yield* go(ctx, bike, dir > 0 ? EX1 - 0.6 : EX0 + 0.6, L.walkB[0], 8.5);
    yield* popOut(ctx, bike);
    yield* wait(2.5);
  },
};

const TAG = ['111 111 111', '1 1   1 1 1', '1 1  1  1 1', '1 1 1   1 1', '111 1   111']; // "070"
G.graffiti = {
  w: [0, 0, 3, 2, 1.5], crime: 1,
  avail: (ctx) => !!ctx.L.box && (ctx.L.box.tags || 0) < 3,
  *run(ctx) {
    const { L, rnd } = ctx, bx = L.box;
    const kid = makePerson(rnd, { kind: 'hoodie', shirt: rnd.pick(['#3a3a3a', '#5a189a', '#1b4332']) });
    const dir = rnd.sign();
    yield* enter(ctx, kid, dir > 0 ? EX0 : EX1, L.walkF[1]);
    yield* go(ctx, kid, bx.x - 1.3, bx.z + 0.75, 3.4);
    kid.heading = Math.PI + 0.5;
    kid.hold(item.spray());
    kid.arms = 'spray';
    const col = ['#ff006e', '#3a86ff', '#ffbe0b'][bx.tags || 0], n = bx.tags || 0;
    bx.tags = n + 1;
    const g = new THREE.Group();
    ctx.world.add(g);
    const px = 0.15, x0 = bx.x - (11 * px) / 2 + px / 2 + n * 0.08, y0 = bx.y + 1.3 - n * 0.1;
    for (let c = 0; c < 11; c++) {
      ctx.sfx('spray');
      for (let r = 0; r < 5; r++) {
        if (TAG[r][c] !== '1') continue;
        g.add(sculpt((v) => v.box(x0 + c * px, y0 - r * 0.2 - 0.2, bx.z + 0.03 + n * 0.02, px, 0.2, 0.04, col), MAT.glow));
        ctx.fx.sparks(x0 + c * px, y0 - r * 0.2, bx.z + 0.2, 1, [col, '#ffffff']);
      }
      yield* wait(0.2);
    }
    ctx.incident();
    ctx.news('Unknown artist tags "070" on transformer box. Critics: "derivative"');
    say(ctx, kid, 'ZO DAN!', { size: 14, color: col });
    yield* wait(0.5);
    const cop = makePerson(rnd, { kind: 'cop' });
    yield* enter(ctx, cop, dir > 0 ? EX0 : EX1, L.walkF[1]);
    ctx.sfx('whistle');
    say(ctx, cop, 'FWEEET! HÉ JIJ!', { size: 15, color: '#7db8ff' });
    yield* wait(0.3);
    kid.drop(); kid.arms = 'swing';
    say(ctx, kid, 'OEPS', { size: 14, color: '#fff' });
    yield* all(leave(ctx, kid, 7.6, dir > 0 ? EX1 : EX0), leave(ctx, cop, 6.2, dir > 0 ? EX1 : EX0));
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
    const trail = ctx.run((function* () { for (;;) { yield* wait(0.3); if (rob.alive) ctx.fx.cash(rob.g.position.x, 1.6, rob.g.position.z, 1, 2, 4); } })());
    const busted = rnd.chance(0.35);
    ctx.run(footCop(ctx, rob, busted ? 8.4 : 5.6, 0.2));
    if (L.kind !== 'ped' && ctx.road.closed === 0) ctx.run((function* () { yield* closeRoad(ctx); yield* policeRun(ctx, dir, L.chaseZ, 9, 0); openRoad(ctx); })());
    rob.arms = 'swing';
    if (busted) {
      yield* go(ctx, rob, h.x + dir * 12, L.walkB[1], 6);
      ctx.sfx('slam');
      ctx.fx.puff(rob.g.position.x, 1, rob.g.position.z, '#ffe08a');
      ctx.fx.burst(rob.g.position.x, 1.5, rob.g.position.z, { n: 12, colors: ['#ffd60a', '#fff'], speed: 5, up: 7, glow: true, size: [0.1, 0.18] });
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

G.shopHeist = {
  w: [0, 0, 0, 3, 2], crime: 2,
  avail: (ctx) => ctx.L.shops.some((s) => s.shop !== 'BANK'),
  *run(ctx) {
    const { L, rnd } = ctx, s = rnd.pick(L.shops.filter((x) => x.shop !== 'BANK'));
    const dir = s.x > 0 ? -1 : 1, rob = makePerson(rnd, { kind: 'robber' });
    ctx.sfx('alarm');
    ctx.fx.text('ALARM!', at(s.x, 4.2, s.z), { size: 18, color: '#ff6b6b', dur: 1.6 });
    yield* enter(ctx, rob, s.door.x, s.door.z);
    rob.hold(item.tv(), 'front');
    rob.arms = 'carry';
    ctx.wanted = rob;
    ctx.sfx('yoink');
    say(ctx, rob, 'GRATIS TV!', { size: 16, color: '#ffd60a' });
    ctx.incident(2);
    ctx.news(`Television leaves ${s.shop} without paying`);
    const keeper = makePerson(rnd, { kind: 'chef' });
    ctx.run((function* () {
      yield* wait(0.5);
      yield* enter(ctx, keeper, s.door.x, s.door.z);
      keeper.arms = 'fist';
      ctx.sfx('hey');
      say(ctx, keeper, 'DIEF! HOUD HEM TEGEN!', { size: 14, color: '#ff6b6b' });
      yield* go(ctx, keeper, dir > 0 ? EX1 : EX0, L.walkB[1], 5.2);
      yield* popOut(ctx, keeper);
    })());
    ctx.run(footCop(ctx, rob, 6.2, 1.2));
    yield* leave(ctx, rob, 6.6, dir > 0 ? EX1 : EX0);
    yield* wait(2);
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
    say(ctx, at(a, 3, L.walkF[1]), '♪ ♫ ♪', { size: 18, color: '#ffe08a' });
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
    yield* all(go(ctx, r1, A.x - dir * 1, vz - 1.1, 7.5), go(ctx, r2, A.x - dir * 1.8, vz - 1.1, 7.5));
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
G.carBreakIn = {
  w: [0, 0.6, 2.5, 2.5, 2], crime: 2, need: ['parked'],
  *run(ctx) {
    const { L, rnd } = ctx, car = rnd.pick(L.parked), dir = car.x > 0 ? -1 : 1;
    const z = L.hw + L.bw + 0.75;
    const thief = makePerson(rnd, { kind: rnd.chance(0.5) ? 'raccoon' : 'robber' });
    yield* enter(ctx, thief, clamp(car.x - dir * 12, EX0, EX1), L.walkF[0]);
    thief.gait = 'sneak'; thief.arms = 'sneak';
    yield* go(ctx, thief, car.x, z, 3.2);
    thief.heading = Math.PI;
    yield* wait(0.35);
    ctx.sfx('snip'); ctx.sfx('thud');
    ctx.fx.burst(car.x, 1.0, car.z + 0.7, { n: 16, colors: ['#bfe9ff', '#ffffff', '#8fd3f4'], speed: 4, up: 4.5, size: [0.06, 0.12], life: [0.5, 0.9] });
    ctx.fx.text('KRAK!', at(car.x, 2.4, car.z), { size: 22, color: '#bfe9ff' });
    const lights = sculpt((v) => { for (const sx of [-1.5, 1.5]) for (const sz of [-0.6, 0.6]) v.box(car.x + sx, 0.55, car.z + sz, 0.22, 0.2, 0.3, '#ffb000'); }, MAT.glow);
    ctx.world.add(lights);
    const blink = ctx.run((function* () { let t = 0, beep = 0; for (;;) { const dt = yield; t += dt; beep -= dt; lights.visible = Math.floor(t * 5) % 2 === 0; if (beep < 0) { ctx.sfx('alarm'); beep = 1.7; } } })());
    yield* wait(0.5);
    thief.gait = 'walk'; thief.arms = 'swing';
    thief.hold(item.sack(), 'back');
    ctx.wanted = thief;
    ctx.sfx('yoink');
    say(ctx, thief, 'YOINK!', { size: 22, color: '#ffd60a' });
    ctx.incident(2);
    ctx.news(`Car window on ${ctx.st.name} loses argument with ${thief.kind === 'raccoon' ? 'a raccoon' : 'man in stripes'}`);
    const h = L.houses.length ? L.houses.reduce((a, b) => (Math.abs(b.door.x - car.x) < Math.abs(a.door.x - car.x) ? b : a)) : null;
    const owner = makePerson(rnd, {});
    ctx.run((function* () {
      yield* wait(0.6);
      yield* enter(ctx, owner, h ? h.door.x : clamp(car.x + dir * 6, EX0, EX1), h ? h.door.z : L.walkB[1]);
      owner.arms = 'up';
      ctx.sfx('hey');
      say(ctx, owner, rnd.pick(['MIJN AUTORADIO!', 'NIET WEER!', 'HÉ! AFBLIJVEN!']), { size: 15, color: '#ff6b6b' });
      yield* go(ctx, owner, car.x - 1.4, z + 0.2, 5.5);
      owner.arms = 'fist';
      yield* wait(2.2);
      owner.arms = 'swing';
      if (h) { yield* go(ctx, owner, h.door.x, h.door.z, 2.6); yield* popOut(ctx, owner); } else yield* leave(ctx, owner, 2.6);
    })());
    if (ctx.level >= 3) ctx.run(footCop(ctx, thief, 6.2, 0.9));
    yield* leave(ctx, thief, 7.4, dir > 0 ? EX1 : EX0);
    yield* wait(2.6);
    ctx.runner.stop(blink);
    ctx.world.remove(lights);
  },
};

G.fenderBender = {
  w: [0, 1.2, 2, 2, 2], crime: 1, lock: 'road',
  avail: (ctx) => ctx.L.kind !== 'ped' && ctx.L.hw >= 2.2,
  *run(ctx) {
    const { L, rnd } = ctx, dir = rnd.sign();
    yield* closeRoad(ctx);
    const z = L.kind === 'major' ? (dir > 0 ? L.laneF : L.laneB) : L.laneF;
    const a = makeCar(rnd, 'car', L.night), b = makeCar(rnd, rnd.chance(0.3) ? 'taxi' : 'car', L.night);
    const xs = dir * rnd.range(1, 5), x0 = dir > 0 ? X0 + 2.6 : X1 - 2.6, x1 = dir > 0 ? X1 - 2.6 : X0 + 2.6;
    // a pigeon with no sense of urgency
    const bird = makeBird(rnd, 'pigeon');
    ctx.spawn(bird, xs + dir * 3.2, L.hw + L.bw + 0.6);
    ctx.run((function* () { yield* go(ctx, bird, xs + dir * 3.2, -(L.hw + L.bw + 0.6), 1.1); yield* wait(4); ctx.despawn(bird); })());
    yield* enter(ctx, a, x0, z, 0);
    a.face(dir > 0 ? E : W);
    yield* go(ctx, a, xs, z, 7.5);
    ctx.sfx('skid');
    say(ctx, a, 'EEN DUIF!', { size: 14, color: '#fff' });
    yield* enter(ctx, b, x0, z, 0);
    b.face(dir > 0 ? E : W);
    yield* go(ctx, b, xs - dir * 3.5, z, 10);
    const ix = xs - dir * 1.7;
    ctx.sfx('slam');
    ctx.shake(0.5);
    ctx.fx.text('BONK!', at(ix, 2.6, z), { size: 30, color: '#ffd60a' });
    ctx.fx.burst(ix, 0.7, z, { n: 16, colors: ['#ddd', '#888', '#ff3b3b', '#ffd166'], speed: 5, up: 6, size: [0.08, 0.2] });
    ctx.fx.sparks(ix, 0.8, z, 10);
    ctx.run(go(ctx, a, xs + dir * 0.9, z, 4));
    ctx.incident();
    ctx.news(`Fender-bender on ${ctx.st.name}. Both drivers "had right of way"`);
    const sz = z + (z > 0 ? 1.5 : -1.5);
    const d1 = makePerson(rnd, {}), d2 = makePerson(rnd, {});
    yield* all(enter(ctx, d1, xs + dir * 0.4, sz), enter(ctx, d2, xs - dir * 3.0, sz));
    d1.heading = dir > 0 ? W : E; d2.heading = dir > 0 ? E : W;
    d1.arms = d2.arms = 'fist';
    const lines = ['KIJK UIT JE DOPPEN!', 'JIJ REMDE ZOMAAR!', 'ER LIEP EEN DUIF!', 'EEN DUIF?!'];
    for (let i = 0; i < 4; i++) { ctx.sfx('hey'); say(ctx, i % 2 ? d1 : d2, lines[i], { size: 14, color: i % 2 ? '#ffb4a2' : '#ff6b6b' }); yield* wait(0.85); }
    const cop = makePerson(rnd, { kind: 'cop' });
    yield* enter(ctx, cop, clamp(xs + dir * 11, EX0, EX1), sz);
    ctx.sfx('whistle');
    yield* go(ctx, cop, xs + dir * 2.4, sz, 5);
    say(ctx, cop, 'RUSTIG! FORMULIERTJE INVULLEN.', { size: 13, color: '#7db8ff' });
    d1.arms = d2.arms = 'swing';
    yield* wait(1.5);
    ctx.fx.text('SCHADEFORMULIER ✎', at(xs - dir * 1.3, 2.4, sz), { size: 13, color: '#fff' });
    ctx.sfx('coin');
    yield* wait(1.2);
    yield* all(popOut(ctx, d1), popOut(ctx, d2));
    ctx.run(leave(ctx, cop, 2.6, clamp(xs + dir * 11, EX0, EX1)));
    ctx.fx.smoke(b.g.position.x, 0.5, z, 5, ['#888', '#666'], 0.4);
    yield* all(
      (function* () { yield* go(ctx, a, x1, z, 6.5); yield* popOut(ctx, a); })(),
      (function* () { yield* wait(0.8); yield* go(ctx, b, x1, z, 5); yield* popOut(ctx, b); })()
    );
    openRoad(ctx);
  },
};

G.scuffle = {
  w: [0, 0, 1.4, 2.4, 2.6], crime: 2,
  *run(ctx) {
    const { L, rnd } = ctx, x = rnd.range(-8, 8), z = rnd.pick([L.walkF[0], L.walkB[1]]);
    const a = makePerson(rnd, {}), b = makePerson(rnd, { kind: rnd.chance(0.3) ? 'chef' : 'civ' });
    yield* all(
      (function* () { yield* enter(ctx, a, x - 9, z); yield* go(ctx, a, x - 0.8, z, 4.5); })(),
      (function* () { yield* enter(ctx, b, x + 9, z); yield* go(ctx, b, x + 0.8, z, 4.5); })()
    );
    a.heading = E; b.heading = W;
    a.arms = b.arms = 'fist';
    const row = rnd.pick([['DAT IS MIJN PLEK!', 'NIETES!', 'WELLES!'], ['JIJ KEEK NAAR MIJ!', 'IK KEEK NIET!', 'WEL!'], ['AJAX!', 'ADO!', '...ZEG DAT NOG EENS']]);
    for (let i = 0; i < 3; i++) { ctx.sfx('hey'); say(ctx, i % 2 ? b : a, row[i], { size: 14, color: i % 2 ? '#ffd166' : '#ff6b6b' }); yield* wait(0.75); }
    ctx.focus(x, z, 0.6, 4.6, 2);
    a.g.visible = b.g.visible = false;
    ctx.incident(2);
    ctx.news(`Difference of opinion on ${ctx.st.name} escalates to dust cloud`);
    const cop = makePerson(rnd, { kind: 'cop' }), side = rnd.sign();
    ctx.run((function* () { yield* wait(1.3); yield* enter(ctx, cop, x + side * 10, z); ctx.sfx('whistle'); yield* go(ctx, cop, x + side * 2.4, z, 6); })());
    const words = ['POW!', 'BAM!', 'OEF!', 'AU!', 'BONK!', 'KLETS!'];
    for (let i = 0; i < 16; i++) {
      ctx.fx.smoke(x + rnd.range(-0.7, 0.7), 0.4, z + rnd.range(-0.5, 0.5), 5, ['#f1ede4', '#e4dccb', '#d8cfbd'], 0.7);
      if (i % 3 === 0) {
        ctx.fx.text(rnd.pick(words), at(x + rnd.range(-1.6, 1.6), rnd.range(1.6, 3), z), { size: 19, color: rnd.pick(['#ffd60a', '#ff6b6b', '#ffffff']), dur: 0.7 });
        ctx.sfx(rnd.pick(['thud', 'boing', 'pop']));
        ctx.shake(0.12);
      }
      if (i % 4 === 1) ctx.fx.burst(x, 1.2, z, { n: 5, colors: ['#ffd60a', '#ffffff'], speed: 5, up: 6, glow: true, size: [0.1, 0.16], life: [0.4, 0.8] });
      yield* wait(0.2);
    }
    say(ctx, cop, 'UIT ELKAAR!', { size: 17, color: '#7db8ff' });
    a.g.visible = b.g.visible = true;
    a.g.position.x = x - 1.3; b.g.position.x = x + 1.3;
    a.arms = b.arms = 'up';
    for (let i = 0; i < 2; i++) { say(ctx, i % 2 ? a : b, '★ ★', { size: 15, color: '#ffe066', dur: 0.8 }); yield* all(hop(a, 0.25, 0.4), hop(b, 0.25, 0.4)); }
    a.arms = b.arms = 'swing';
    say(ctx, a, 'sorry', { size: 12, color: '#cfe8ff' });
    yield* wait(0.6);
    say(ctx, b, 'ook sorry', { size: 12, color: '#cfe8ff' });
    yield* wait(0.9);
    ctx.run(leave(ctx, cop, 2.4, clamp(x + side * 11, EX0, EX1)));
    yield* all(leave(ctx, a, 4, clamp(x - 11, EX0, EX1)), leave(ctx, b, 4, clamp(x + 11, EX0, EX1)));
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
    ctx.fx.cash(x, 1.3, z, 3, 1.5, 2.5);
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
    ctx.fx.burst(x, 1.1, z, { n: 10, colors: ['#5a8f3c', '#7cfc9a', '#3f6f2a'], speed: 3, up: 4, size: [0.05, 0.1] });
    ctx.wanted = dealer;
    ped.arms = 'swing';
    say(ctx, ped, '♪ la la la ♪', { size: 12, color: '#cfe8ff' });
    release(ctx, ped);
    ctx.run((function* () { yield* chase(ctx, cop, dealer, 6.3, 0.8, 8); yield* leave(ctx, cop, 6, dir > 0 ? EX0 : EX1); })());
    yield* leave(ctx, dealer, 7.6, dir > 0 ? EX0 : EX1);
    yield* wait(1.5);
  },
};

G.phishing = {
  w: [0, 1.4, 2, 2, 1.6], crime: 1,
  *run(ctx) {
    const { L, rnd } = ctx;
    const ped = yield* needPed(ctx, 9);
    if (!ped) return;
    const p = ped.g.position, back = ped.lineZ < 0;
    const hacker = makePerson(rnd, { kind: 'hoodie', shirt: '#1b4332' });
    yield* enter(ctx, hacker, clamp(p.x + ped.dir * 2, -20, 20), back ? L.walkF[1] : L.walkB[0]);
    hacker.heading = back ? Math.PI : 0;
    ped.arms = 'hold'; ped.heading = back ? 0 : Math.PI;
    ctx.sfx('ding');
    say(ctx, ped, rnd.pick(['"UW PAKKET WACHT"', '"HOI MAM, NIEUW NUMMER"', '"U HEEFT GEWONNEN!"']), { size: 12, color: '#cfe8ff', dur: 1.8 });
    yield* wait(1.2);
    say(ctx, ped, '*klik*', { size: 13, color: '#ffffff' });
    const line = sculpt((v) => v.box(0, 0, 0, 1, 0.04, 0.04, '#e8f7ff'), MAT.glow), hook = item.wallet();
    ctx.world.add(line); ctx.world.add(hook);
    const hp = hacker.g.position;
    const set = (t) => {
      const bx = lerp(hp.x, p.x, t), bz = lerp(hp.z, p.z, t);
      line.position.set((hp.x + bx) / 2, 1.45, (hp.z + bz) / 2);
      line.scale.x = Math.max(0.01, Math.hypot(bx - hp.x, bz - hp.z));
      line.rotation.y = -Math.atan2(bz - hp.z, bx - hp.x);
      hook.position.set(bx, 1.3, bz);
    };
    hook.visible = false;
    hacker.arms = 'up';
    ctx.sfx('boing');
    yield* tween(0.35, set, ease.outQuad);
    ctx.fx.text('PHISHING!', at((hp.x + p.x) / 2, 3.2, (hp.z + p.z) / 2), { size: 24, color: '#7cfc9a' });
    hook.visible = true;
    ctx.sfx('yoink');
    ped.arms = 'up';
    yield* tween(0.55, (t) => set(1 - t), ease.inQuad);
    ctx.world.remove(line); ctx.world.remove(hook);
    hacker.hold(item.wallet());
    hacker.arms = 'hold';
    ctx.fx.cash(hp.x, 1.5, hp.z, 6, 2, 4);
    say(ctx, hacker, 'hehehe', { size: 14, color: '#b9fbc0' });
    ctx.incident();
    ctx.news('Phishing: resident reeled in by "your parcel is waiting" text');
    yield* wait(0.5);
    ped.arms = 'fist';
    ctx.sfx('hey');
    say(ctx, ped, rnd.pick(['MIJN SPAARGELD!', 'OPGELICHT!', 'HÈ?! €0,00?!']), { size: 15, color: '#ff6b6b' });
    ctx.wanted = hacker;
    if (ctx.level >= 4) ctx.run(footCop(ctx, hacker, 6.4, 0.5));
    yield* leave(ctx, hacker, 7.2);
    yield* wait(0.8);
    release(ctx, ped);
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
