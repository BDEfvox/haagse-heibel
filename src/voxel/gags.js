// Ambient street life + crime-level shenanigans, written as generator scripts.
import * as THREE from 'three';
import { wait, tween, all, race, waitUntil, ease, clamp, TAU, sculpt, MAT } from './kit.js';
import { makePerson, makeDog, makeCat, makeBird, item } from './cast.js';
import { makeCar, makeTram, makeBike, makeScooter, makeHeli, makeBoat } from './props.js';

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
    if (!a.air) p.y = ctx.L.yAt(p.z);
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
function spawnPed(ctx, atX = null, opts = {}) {
  const { L, rnd } = ctx;
  const dir = opts.dir ?? rnd.sign();
  const z = (opts.z ?? rnd.pick([...L.walkB, ...L.walkF])) + rnd.range(-0.15, 0.15);
  const r = rnd();
  const a = makePerson(rnd, { kind: opts.kind || (r < 0.12 ? 'kid' : r < 0.22 ? 'granny' : 'civ') });
  a.dir = dir; a.lineZ = z; a.exitX = dir > 0 ? EX1 : EX0; a.walkSpeed = a.speed;
  ctx.spawn(a, atX ?? (dir > 0 ? EX0 : EX1), z);
  a.face(dir > 0 ? E : W);
  ctx.peds.push(a);
  ctx.run((function* () {
    a.g.scale.setScalar(0.001);
    yield* popIn(ctx, a);
    yield* stroll(ctx, a);
  })());
  return a;
}
function unped(ctx, a) {
  const i = ctx.peds.indexOf(a);
  if (i >= 0) ctx.peds.splice(i, 1);
}
function* stroll(ctx, a) {
  while (!a.busy && a.alive) {
    const p = a.g.position, dx = a.exitX - p.x;
    if (Math.abs(dx) < 0.12) { unped(ctx, a); yield* popOut(ctx, a); return; }
    const dt = yield;
    const sp = a.walkSpeed, dz = a.lineZ - p.z;
    p.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
    p.z += clamp(dz, -sp * dt * 0.7, sp * dt * 0.7);
    p.y = ctx.L.yAt(p.z);
    a.heading = Math.atan2(Math.sign(dx), clamp(dz, -1, 1) * 0.6);
    a.moving = sp;
  }
}
function release(ctx, a) {
  if (!a.alive) return;
  a.busy = false; a.arms = 'swing'; a.gait = 'walk';
  ctx.run(stroll(ctx, a));
}
/** Borrow a pedestrian who still has some street ahead of them (spawns one if needed). */
function* needPed(ctx, xr = 13, filter = null) {
  const ok = (p) => !p.busy && p.alive && Math.abs(p.g.position.x) < xr && Math.abs(p.exitX - p.g.position.x) > 8 && (!filter || filter(p));
  let p = ctx.peds.find(ok);
  if (!p) {
    const np = spawnPed(ctx, null, { kind: 'civ' });
    yield* waitUntil(() => ok(np) || !np.alive, 9);
    p = np.alive && !np.busy ? np : ctx.peds.find(ok);
  }
  if (p) p.busy = true;
  return p || null;
}
function panic(ctx, x, r = 16) {
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
  const { L, rnd, st } = ctx;
  const busy = clamp(((st.shops || 0) + (st.food || 0) + (st.bars || 0)) / Math.max(1, (st.len || 200) / 100) / 4, 0, 1);
  const cap = Math.round(5 + busy * 9 + (L.kind === 'ped' ? 4 : 0));
  for (let i = 0; i < Math.round(cap * 0.6); i++) spawnPed(ctx, rnd.range(X0 + 3, X1 - 3));
  for (;;) {
    yield* wait(rnd.range(1.2, 3.6) * (1.4 - busy * 0.8));
    if (ctx.peds.length < cap) spawnPed(ctx);
  }
}
function* drive(ctx, car, z, dir, speed) {
  const half = (car.len || 3.4) / 2 + 0.6;
  ctx.spawn(car, dir > 0 ? X0 + half : X1 - half, z, 0);
  car.face(dir > 0 ? E : W);
  car.g.scale.setScalar(0.001);
  ctx.road.vehicles.add(car);
  yield* popIn(ctx, car, 0.35);
  yield* go(ctx, car, dir > 0 ? X1 - half : X0 + half, z, speed);
  ctx.road.vehicles.delete(car);
  yield* popOut(ctx, car);
}
function* carSpawner(ctx) {
  const { L, rnd } = ctx;
  if (L.kind === 'ped') return;
  const major = L.kind === 'major';
  yield* wait(rnd.range(0.5, 2));
  for (;;) {
    if (!ctx.road.closed) {
      if (major) {
        const dir = rnd.sign();
        ctx.run(drive(ctx, makeCar(rnd, rnd.chance(0.1) ? 'taxi' : rnd.chance(0.08) ? 'van' : 'car', L.night), dir > 0 ? L.laneF : L.laneB, dir, 7));
      } else if (ctx.road.vehicles.size === 0) {
        ctx.run(drive(ctx, makeCar(rnd, 'car', L.night), L.laneF, rnd.sign(), 5));
      }
    }
    yield* wait(major ? rnd.range(2.2, 5.5) : rnd.range(7, 14));
  }
}
function* tramSpawner(ctx) {
  const { L, rnd } = ctx;
  if (!L.tram) return;
  let dir = rnd.sign();
  yield* wait(rnd.range(3, 7));
  for (;;) {
    if (!ctx.road.closed) {
      ctx.sfx('ding');
      yield* drive(ctx, makeTram(L.night), dir > 0 ? L.tramF : L.tramB, dir, 7.5);
      dir = -dir;
    }
    yield* wait(rnd.range(9, 18));
  }
}
function* bikeSpawner(ctx) {
  const { L, rnd } = ctx;
  yield* wait(rnd.range(0.2, 2));
  for (;;) {
    const dir = rnd.sign();
    const bike = makeBike(rnd, makePerson(rnd, { scale: 1.2 }));
    ctx.run((function* () {
      const z = dir > 0 ? L.bikeF : L.bikeB;
      yield* enter(ctx, bike, dir > 0 ? EX0 + 0.6 : EX1 - 0.6, z, 0);
      bike.face(dir > 0 ? E : W);
      if (rnd.chance(0.12)) ctx.sfx('bell');
      yield* go(ctx, bike, dir > 0 ? EX1 - 0.6 : EX0 + 0.6, z, rnd.range(4.6, 6.4));
      yield* popOut(ctx, bike);
    })());
    yield* wait(rnd.range(2.5, 7));
  }
}
function* boatSpawner(ctx) {
  const { L, rnd } = ctx;
  if (!L.canal) return;
  yield* wait(rnd.range(1, 5));
  for (;;) {
    const dir = rnd.sign(), boat = makeBoat(rnd);
    boat.air = true;
    const z = L.canal.z + (dir > 0 ? -0.7 : 0.6) - 0.4;
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
    yield* wait(L.strip === 'beach' ? rnd.range(1.5, 4) : rnd.range(5, 11));
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
    ctx.spawn(b, rnd.range(-18, 18), L.walkF[0] - 0.7 + rnd.range(-0.2, 0.2));
    b.face(rnd.range(0, TAU));
    birds.push(b);
  }
  for (;;) {
    yield* wait(rnd.range(1.5, 4));
    const b = rnd.pick(birds);
    yield* go(ctx, b, clamp(b.g.position.x + rnd.range(-2.5, 2.5), -21, 21), L.walkF[0] - 0.7 + rnd.range(-0.25, 0.25), 1.6);
  }
}
function* heli(ctx) {
  const { L, rnd } = ctx;
  const h = makeHeli();
  h.air = true;
  ctx.spawn(h, X0 - 10, L.zc, 13);
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
  yield* waitUntil(() => ctx.road.vehicles.size === 0, 10);
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
  w: [3, 2, 1, 0, 0],
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
  w: [3, 2, 1, 0.4, 0],
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
  avail: (ctx) => ctx.L.parked.length > 0,
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
  w: [0, 0, 3, 2, 2], crime: 1,
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
    const h = L.houses.reduce((a, b) => (Math.abs(b.door.x - r.x) < Math.abs(a.door.x - r.x) ? b : a));
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
  *run(ctx) {
    const { L, rnd } = ctx;
    const pool = L.houses.filter((h) => !h.tower && Math.abs(h.x) < 15);
    const h = rnd.pick(pool.length ? pool : L.houses);
    const dir = h.x > 0 ? -1 : 1;
    // alarm lamp
    const lamp = sculpt((v) => v.box(h.x - h.w / 2 + 0.4, 2.9, L.zH + 0.2, 0.3, 0.3, 0.3, '#ff2d2d'), MAT.glow);
    ctx.world.add(lamp);
    ctx.sfx('alarm');
    ctx.fx.text('WEE-OO! WEE-OO!', at(h.x, h.top + 0.5, L.zH), { size: 18, color: '#ff6b6b', dur: 2 });
    const blink = ctx.run((function* () { let t = 0; for (;;) { t += yield; lamp.visible = Math.floor(t * 6) % 2 === 0; } })());
    const rob = makePerson(rnd, { kind: 'robber' });
    rob.hold(item.sack(), 'back');
    rob.air = true;
    yield* enter(ctx, rob, h.win.x, h.win.z + 0.35, h.win.y - 0.3);
    rob.heading = 0;
    ctx.focus(h.x, L.zH + 2, 0.62, 3.2, 2);
    say(ctx, rob, 'hehehe', { size: 14, color: '#b9fbc0' });
    yield* wait(0.5);
    const y0 = rob.g.position.y, yg = L.yAt(L.zH + 1.5);
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
    ctx.fx.text('ALARM!', at(s.x, 4.2, L.zH), { size: 18, color: '#ff6b6b', dur: 1.6 });
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
    ctx.run(go(ctx, vic, 0, wz, 2.0));
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
    yield* leave(ctx, vic, 2);
  },
};

G.fireworks = {
  w: [0, 0, 0, 2, 2.5], crime: 1,
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
  w: [0, 0, 0, 0.7, 3], crime: 3, lock: 'road',
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
      v.box(A.x, by, L.zH + 0.25, 1.5, 2.5, 0.52, '#1c1c1c', 0.2);
      v.box(A.x - 0.9, by, L.zH + 0.12, 0.6, 1.5, 0.3, '#2a2a2a', 0.2);
      v.box(A.x + 0.9, by, L.zH + 0.12, 0.5, 1.9, 0.3, '#2a2a2a', 0.2);
      v.box(A.x, by + 2.5, L.zH + 0.12, 1.0, 0.7, 0.3, '#2a2a2a', 0.2);
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

// ---------------------------------------------------------------- the director
const SIGNATURE = { 1: 'pigeonLady', 2: 'seagullFries', 3: 'bikeThief', 4: 'burglar', 5: 'plofkraak' };
const PACE = { 1: { gap: [3.5, 6], max: 1 }, 2: { gap: [3, 5], max: 1 }, 3: { gap: [2.2, 4], max: 2 }, 4: { gap: [1.6, 3], max: 3 }, 5: { gap: [1.2, 2.4], max: 4 } };

function* director(ctx) {
  const { rnd, level } = ctx, pace = PACE[level], locks = new Set();
  let active = 0;
  const recent = [];
  const launch = (name) => {
    const g = G[name];
    active++;
    if (g.lock) locks.add(g.lock);
    recent.push(name);
    if (recent.length > 3) recent.shift();
    ctx.run((function* () {
      try { yield* g.run(ctx); } finally { active--; if (g.lock) locks.delete(g.lock); }
    })());
  };
  yield* wait(2.4);
  const sig = SIGNATURE[level];
  if (!G[sig].avail || G[sig].avail(ctx)) launch(sig);
  for (;;) {
    yield* wait(rnd.range(pace.gap[0], pace.gap[1]));
    if (active >= pace.max) continue;
    const opts = Object.keys(G).filter((n) => G[n].w[level - 1] > 0 && !recent.includes(n) && !(G[n].lock && locks.has(G[n].lock)) && (!G[n].avail || G[n].avail(ctx)));
    if (!opts.length) { recent.shift(); continue; }
    let tot = opts.reduce((s, n) => s + G[n].w[level - 1], 0), r = rnd() * tot;
    let pickN = opts[0];
    for (const n of opts) { r -= G[n].w[level - 1]; if (r <= 0) { pickN = n; break; } }
    launch(pickN);
  }
}

/** Kick off everything that moves. `only` forces a single gag (debug). */
export function startShow(ctx, only = null) {
  ctx.peds = [];
  ctx.road = { closed: 0, vehicles: new Set() };
  ctx.wanted = null;
  ctx.run(pedSpawner(ctx));
  ctx.run(carSpawner(ctx));
  ctx.run(tramSpawner(ctx));
  ctx.run(bikeSpawner(ctx));
  ctx.run(boatSpawner(ctx));
  ctx.run(gullSpawner(ctx));
  ctx.run(pigeons(ctx));
  if (ctx.level >= 5) ctx.run(heli(ctx));
  if (only && G[only]) {
    ctx.run((function* () { for (;;) { yield* wait(2); if (!G[only].avail || G[only].avail(ctx)) yield* G[only].run(ctx); yield* wait(2); } })());
  } else ctx.run(director(ctx));
}
export const GAG_NAMES = Object.keys(G);
