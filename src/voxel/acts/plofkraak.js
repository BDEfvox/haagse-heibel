// The cash-machine blast: a van, two men in striped shirts, a bomb, a rain of banknotes, laughing, bags thrown into the van, and a
// police car that arrives in time to take its cap off and scratch its head.
// Storyboard: storyboards/plofkraak.md. Every B(...) below is one beat of it, with who must be on screen.
import * as THREE from 'three';
import { wait, tween, all, race, waitUntil, ease, clamp, lerp, TAU, sculpt, piece, MAT } from '../kit.js';
import { makePerson, makeDog, makeCat, makeBird, item } from '../cast.js';
import { makeCar, makeBike, makeScooter } from '../props.js';
import * as S from '../setting.js';

/** `T` is the set-piece toolkit of gags.js (see ACTS.md). */
export default function (T) {
  const {
    X0, X1, EX0, EX1, E, W, go, fly, chase, popIn, popOut, enter, edgeOf, walkOff, leave, hop, say, at, camFor, pt, faceTo,
    yell, padZ, once, spotNear, padSpot, tidy, takePed, rig, gather, filmIt, resident, lookAround, doubleTake, arc, goEach,
    seat, rideTo, mount, dismount, lineObj, chainObj, vanish, lootBox, beatsFor, flip, laugh, cackle, leap, tumble, getUp,
    seeStars, fright, tiptoe, shoulder, noteTrail, runDust, moods, skid, drive, handbrake, exhaust, spawnPed, unped, stroll,
    release, needPed, panic, closeRoad, openRoad, policeRun, footCop, seen, watching,
  } = T;

  /**
   * A straight run to (x1, z1) at v m/s. o.v0 + o.ramp: pull away from that speed over `ramp` seconds (the body squats).
   * o.brake: stand on the brakes over that many seconds, stopping exactly on the spot (the nose dives).
   * o.skid: lay rubber while braking, and for o.burn seconds from the start (wheelspin).
   */
  function* dash(ctx, car, x1, z1, v, o = {}) {
    const p = car.g.position, x0 = p.x, z0 = p.z, D = Math.hypot(x1 - x0, z1 - z0);
    if (D < 0.05) return;
    const ux = (x1 - x0) / D, uz = (z1 - z0) / D, bd = o.brake || 0, bs = (v * bd) / 2, v0 = o.v0 ?? v, ramp = o.ramp || 0;
    car.heading = Math.atan2(ux, uz);
    let s = 0, t = 0, k = 0;
    while (s < D - 0.02) {
      const dt = yield;
      t += dt; k -= dt;
      let sp = ramp > 0 ? lerp(v0, v, Math.min(1, t / ramp)) : v;
      const braking = bd > 0 && D - s < bs;
      if (braking) sp = Math.min(sp, Math.max(1.5, Math.sqrt((2 * v * (D - s)) / bd)));
      s = Math.min(D, s + sp * dt);
      p.x = x0 + ux * s; p.z = z0 + uz * s; p.y = 0;
      car.moving = sp;
      if (o.skid && k <= 0 && (braking || t < (o.burn || 0))) { skid(ctx, car); k = 0.04; }
      if (o.each && o.each(dt, s / D) === true) break;
    }
    car.moving = 0;
  }
  /** Revving on the spot: the wheels spin, rubber and smoke. */
  function* burn(ctx, car, dur) {
    let t = 0, k = 0;
    ctx.sfx('rev');
    while (t < dur) {
      const dt = yield;
      t += dt; k -= dt;
      car.moving = 8;
      if (k <= 0) { skid(ctx, car); exhaust(ctx, car, 2); k = 0.07; }
    }
  }
  const HALF = 1.03;
  /** Somebody steps out of a vehicle: they start inside its body (low, so it hides them), the door goes, they step out to (tx, tz). */
  function* emerge(ctx, R, a, car, tx, tz) {
    const p = car.g.position;
    a.air = true; a.arms = 'swing';
    R.spawn(a, p.x, p.z, -0.55);
    ctx.sfx('door');
    const y1 = ctx.L.yAt ? ctx.L.yAt(tz) : 0, x0 = p.x, z0 = p.z;
    a.heading = Math.atan2(tx - x0, tz - z0);
    yield* tween(0.5, (u) => {
      const e = ease.outQuad(u);
      a.g.position.set(lerp(x0, tx, e), lerp(-0.55, y1, ease.inOut(u)), lerp(z0, tz, e));
    });
    a.air = false;
    a.squash(0.15);
  }
  /** Somebody gets back in: they walk up to the door, sink in behind the bodywork and are gone. */
  function* sink(ctx, R, a, car) {
    const p = car.g.position;
    yield* go(ctx, a, a.g.position.x, p.z + (a.g.position.z > p.z ? 1.3 : -1.3), 2.6);
    ctx.sfx('door');
    a.air = true;
    const x0 = a.g.position.x, z0 = a.g.position.z, y0 = a.g.position.y;
    yield* tween(0.45, (u) => { a.g.position.set(lerp(x0, p.x, u), lerp(y0, -0.55, u), lerp(z0, p.z, u)); });
    R.gone(a);
  }
  /** The line the van and the police car use: a free driving line along the whole street, nearest the street's own. */
  const vanLane = (ctx) => once(ctx, 'plofLane', () => {
    const L = ctx.L, hw = L.hw, lim = Math.max(0, hw - 0.95);
    let best = null;
    for (let z = -lim; z <= lim + 1e-6; z += 0.1) if (S.laneClear(ctx, z, -21, 21, HALF) && (best == null || Math.abs(z - (L.chaseZ ?? 0)) < Math.abs(best - (L.chaseZ ?? 0)))) best = +z.toFixed(2);
    return best;
  });
  /** A prop flung through the air, tumbling. */
  function* fling(o, x, y, z, h, dur) {
    const a = o.position.clone();
    yield* tween(dur, (t) => {
      o.position.set(lerp(a.x, x, t), lerp(a.y, y, t) + Math.sin(t * Math.PI) * h, lerp(a.z, z, t));
      o.rotation.x = t * TAU * 1.5; o.rotation.y = t * 9; o.rotation.z = t * 5;
    });
  }
  /** The cash machine's front panel: a steel plate with a screen, centred on its origin so it spins properly. */
  const panel = () => sculpt((v) => {
    v.box(0, -0.6, 0, 1.0, 1.2, 0.12, '#dfe6ea');
    v.box(0, 0.05, 0.07, 0.8, 0.4, 0.04, '#0f2a3a');
    v.box(0, -0.3, 0.07, 0.7, 0.2, 0.04, '#005eb8');
    v.box(0, -0.5, 0.07, 0.3, 0.06, 0.04, '#222');
  });

  return {
    w: [0, 0, 0, 0, 4], crime: 5, lock: 'road',
    avail: (ctx) => !!ctx.L.atm && !ctx.L.atm.blown && ctx.L.kind !== 'ped' && vanLane(ctx) != null, // (a van needs a real road with a free line)
    stage: { anchor: 'atm', reach: 4 },
    *run(ctx) {
      const { L, rnd } = ctx, A = L.atm, cam = camFor(ctx, 'plofkraak'), B = beatsFor(ctx, 'plofkraak'), R = rig(ctx);
      let done = false;
      try {
        A.blown = true;
        yield* R.close();
        // ---- the street: where the van stops, where its back doors are, where the robbers hide
        const by = L.yAt(A.z), road = true;
        const vdir = A.x > 0 ? 1 : -1, vf = vdir > 0 ? E : W;        // the van comes from the far end, towards the machine
        const vz = vanLane(ctx);                                         // a driving line that is free along the whole street
        const vx = clamp(A.x + vdir * 2.4, -17, 17), xr = vx - vdir * 2.9;  // xr: the back doors
        const toward = A.z < vz ? -1 : 1;                              // which way across the street the machine is
        const hz = vz - toward * 1.9, hx1 = vx + vdir * 0.3, hx2 = vx - vdir * 1.3; // hiding places: the far side of the van
        const bp = { x: A.x, z: A.z - 0.75, y: 0.95 }, atm = { x: A.x, z: A.z - 0.6, y: 1.2 };
        const van = makeCar(rnd, 'van', L.night), r1 = makePerson(rnd, { kind: 'robber' }), r2 = makePerson(rnd, { kind: 'robber' });
        ctx.wanted = van;
        ctx.news('Two men in striped shirts "just looking" at ATM');

        // ---- 1. the van rolls up, brakes (nose dives), hazards blinking; the back doors swing open
        B('1 the van: it brakes, hazards blinking, the back doors swing open', [pt(vx, vz)]);
        cam.wide(pt(vx, vz), { dist: 26, el: 0.3, az: -vdir * 0.35 });
        yield* R.enter(van, -vdir * 17, vz, 0, { dir: vdir, speed: 11 });
        van.face(vf);
        ctx.sfx('rev');
        yield* dash(ctx, van, vx, vz, 12, { brake: 0.55, skid: true });
        van.hazard = true;
        ctx.sfx('thud');
        yield* wait(0.5);
        van.doors = 1;
        ctx.sfx('door');
        yield* wait(0.4);

        B('1b the robbers hop out of the back, one hugging a bomb', [pt(xr, vz)]);
        cam.ground(pt(xr, vz), { dist: 6.5, az: -vdir * 1.0 });
        yield* wait(0.3);
        r1.hold(item.bomb(), 'front'); r1.arms = 'carry'; r2.arms = 'rub';
        r1.mood = r2.mood = 'sly';
        // they were in the back all along: they start inside the cargo area (the van's body hides them) and walk out of the open doors
        const inside = (a, k) => { R.spawn(a, vx - vdir * (0.9 + k * 0.6), vz, 0); a.heading = vdir > 0 ? W : E; };
        inside(r1, 0); inside(r2, 1);
        R.run((function* () { yield* wait(0.25); yield* go(ctx, r2, xr - vdir * 2.2, vz + 0.5, 3.2); r2.heading = 0; yield* hop(r2, 0.5, 0.3); r2.squash(0.2); })());
        yield* go(ctx, r1, xr - vdir * 1.0, vz - 0.5, 3.2);
        r1.heading = 0;
        yield* hop(r1, 0.5, 0.3);
        r1.squash(0.2);
        yield* wait(0.5);

        // ---- 2. the reveal: they look at each other, rub their hands, snigger
        B('2 reveal: DE PLOFKRAKERS', [r1, r2]);
        r1.heading = r2.heading = 0;
        r1.lookAt = r2; r2.lookAt = r1; r1.mood = r2.mood = 'smug'; r2.arms = 'rub';
        cam.hero([r1, r2], { dist: 6.4 });
        cam.card('DE PLOFKRAKERS', 'Knock, knock. Then boom.', 2.1);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        cackle(ctx, r1, 1.2, 'he');
        yield* laugh(ctx, r2, 1.2, 'he');
        r1.lookAt = r2.lookAt = null;

        // ---- 3. the charge: one tiptoes to the machine, the other keeps lookout; the fuse sparkles; both dive behind the van
        B('3 the charge: one tiptoes to the machine, the other keeps a lookout', [r1, r2]);
        cam.track(r1, { dist: 10, el: 0.14, az: 0.9, lead: 1.5 });
        r2.arms = 'sneak';
        R.run((function* () {
          yield* tiptoe(ctx, r2, A.x + vdir * 1.8, A.z + 0.9, 3.8, false);
          r2.heading = vdir > 0 ? E : W;
          yield* lookAround(r2);
        })());
        yield* tiptoe(ctx, r1, A.x - 0.2, A.z + 0.1, 3.8, false);
        r1.heading = Math.PI;
        yield* wait(0.3);
        const bomb = R.add(r1.drop());
        bomb.position.set(r1.g.position.x, by + 0.95, r1.g.position.z - 0.35); // out of his hands...
        r1.arms = 'reach';
        yield* tween(0.4, (u) => { // ...and stuck on the machine, where we can see it go
          bomb.position.set(lerp(r1.g.position.x, A.x, ease.outQuad(u)), lerp(by + 0.95, by + 0.9, u), lerp(r1.g.position.z - 0.35, A.z - 0.75, ease.outQuad(u)));
        });
        ctx.sfx('thud');
        say(ctx, r1, 'psst... rennen!', { size: 13, color: '#b9fbc0' });
        r1.arms = 'swing'; r1.gait = 'walk'; r1.mood = 'scared';
        r2.gait = 'walk'; r2.arms = 'swing'; r2.mood = 'scared';

        B('3b the fuse: 3... 2... 1...', [bp]);
        cam.shot({ on: bp, y: 0.4, dist: 4.5, el: 0.05, az: 0.3, fov: 34 });
        ctx.sfx('fuse');
        ctx.stageMode && ctx.stageMode('flee'); // the people round the machine have seen the fuse: they run
        const dive = function* (a, x) {
          yield* go(ctx, a, x, hz, 7.5);
          a.pose = 'crouch'; a.arms = 'cover'; a.mood = 'scared';
          a.squash(0.2);
        };
        for (let i = 0; i < 18; i++) {
          ctx.fx.sparks(A.x, by + 1.45, A.z - 0.75, 3);
          if (i % 6 === 0) ctx.fx.text(['3', '2', '1'][i / 6], at(A.x, 3.2, A.z), { size: 30, color: '#ffe08a', dur: 0.6, rise: 0.4 });
          if (i === 1) { R.run(dive(r1, hx1)); R.run(dive(r2, hx2)); }
          if (i === 7) {
            B('3c both dive behind the van, fingers in their ears', [r1, r2]);
            cam.two(r1, r2, { az: -vdir * 0.3 });
          }
          if (i === 13) {
            // ---- 4 begins: the picture goes wide just before the bang
            B('4 KABOOM: flash, fireball, the front panel spins away, banknotes everywhere', [atm]);
            cam.wide(atm, { dist: 24, el: 0.3, az: -vdir * 0.7 });
          }
          yield* wait(0.1);
        }

        // ---- 4. KABOOM
        R.rm(bomb);
        ctx.slowmo(0.22, 0.5);
        ctx.sfx('boom');
        ctx.flash('#ffffff', 0.5);
        ctx.shake(1.3);
        ctx.fx.fireball(A.x, by + 1, A.z - 0.6, 1.5);
        ctx.fx.burst(A.x, by + 1, A.z - 0.6, { n: 60, colors: ['#dfe6ea', '#005eb8', '#9aa5ad', '#b5523b', '#8f4a3a', '#333'], speed: 13, up: 15, size: [0.15, 0.5], life: [1.5, 3] });
        ctx.fx.cash(A.x, by + 1.5, A.z - 0.3, 120, 12, 19);
        ctx.fx.text('KABOOM!', at(A.x, 4, A.z), { size: 54, color: '#ffd60a', dur: 1.8, rise: 1.2, cls: 'huge' });
        const front = R.add(panel());
        front.position.set(A.x, by + 1.3, A.z - 0.85);
        R.run(fling(front, A.x - vdir * 3.5, by + 0.12, A.z + 5.0, 4.2, 1.2));
        const scorch = R.add(sculpt((v) => {
          v.box(A.x, by, A.zH + 0.25, 1.5, 2.5, 0.52, '#1c1c1c', 0.2);
          v.box(A.x - 0.9, by, A.zH + 0.12, 0.6, 1.5, 0.3, '#2a2a2a', 0.2);
          v.box(A.x + 0.9, by, A.zH + 0.12, 0.5, 1.9, 0.3, '#2a2a2a', 0.2);
          v.box(A.x, by + 2.5, A.zH + 0.12, 1.0, 0.7, 0.3, '#2a2a2a', 0.2);
          for (let i = 0; i < 8; i++) v.box(A.x + rnd.range(-2.2, 2.2), by, A.z + rnd.range(-0.6, 1.6), rnd.range(0.3, 0.7), rnd.range(0.15, 0.4), rnd.range(0.3, 0.7), rnd.pick(['#555', '#8f4a3a', '#dfe6ea', '#333']));
        }));
        R.stay(scorch); // lasting damage
        van.jolt(0.8, 1.0);
        ctx.incident(5);
        ctx.news(`PLOFKRAAK on ${ctx.st.name}! ATM explodes, cash rains from the sky`);
        R.panic(A.x, 12, 4);
        ctx.stageMode && ctx.stageMode('watch');
        const smoke = R.run((function* () { for (let i = 0; i < 40; i++) { ctx.fx.smoke(A.x, by + 1.6, A.z - 0.7, 2, ['#555', '#444', '#666'], 0.6); yield* wait(0.18); } })());
        yield* wait(1.4);
        B('4b the smoking hole', [atm]);
        cam.shot({ on: atm, y: 0.3, dist: 9, el: 0.12, az: -vdir * 0.3, fov: 30 });
        yield* wait(0.5);

        // ---- 5. the harvest: banknotes rain down, the robbers run into it with open bags, scooping, jumping, laughing
        B('5 the harvest: scooping notes with open bags, laughing', [r1, r2]);
        cam.orbit([r1, r2], { dist: 9 });
        r1.pose = r2.pose = null;
        r1.gait = r2.gait = 'walk';
        r1.hold(item.moneybag(1.1), 'front'); r2.hold(item.moneybag(1.1), 'front');
        r1.arms = r2.arms = 'carry'; r1.mood = r2.mood = 'happy';
        ctx.sfx('coin');
        const rain = R.run((function* () { for (let i = 0; i < 14; i++) { ctx.fx.cash(A.x + rnd.range(-0.8, 0.8), 4.5, A.z + 0.6, 6, 3, 2); yield* wait(0.22); } })());
        R.run(go(ctx, r1, A.x - 0.9, A.z + 0.6, 6.5));
        yield* go(ctx, r2, A.x + 0.9, A.z + 0.7, 6.5);
        r1.heading = 0; r2.heading = 0;
        say(ctx, r1, '€€€!', { size: 22, color: '#b9fbc0' });
        cackle(ctx, r1, 2.4, 'ha'); cackle(ctx, r2, 2.4, 'ha');
        // a few opportunists creep back and pocket notes too
        for (let i = 0; i < 2; i++) {
          const c = makePerson(rnd, {});
          R.run((function* () {
            yield* wait(0.6 + i * 0.5);
            const cx0 = i % 2 ? EX1 : EX0, cs = spotNear(ctx, A.x + (i ? 3.6 : -3.6), A.z + rnd.range(1.2, 2.2));
            yield* R.enter(c, cx0, padZ(ctx, 'walkB1', cx0));
            yield* tiptoe(ctx, c, cs.x, cs.z, 4.2, false);
            c.arms = 'up'; c.heading = 0;
            if (i === 0) say(ctx, c, 'GRATIS GELD!', { size: 15, color: '#b9fbc0' });
            for (let k = 0; k < 4; k++) { yield* hop(c, 0.45, 0.28); ctx.sfx('coin'); }
            c.arms = 'swing';
            yield* R.leave(c, 6);
          })());
        }
        for (let k = 0; k < 3; k++) { R.run(hop(r1, 0.55, 0.3)); yield* hop(r2, 0.55, 0.3); ctx.sfx('coin'); }
        B('5b the laugh', [r1]);
        r1.heading = 0; r1.arms = 'laugh';
        cam.face(r1);
        yield* wait(0.3);
        yield* laugh(ctx, r1, 1.2, 'ha');
        R.stop(rain); R.stop(smoke);

        // ---- 6. loading up: bags over their shoulders, a run to the van, the bags are thrown in, the robbers jump after them
        B('6 loading up: bags over their shoulders, running for the van', [r1, r2, van]);
        r1.drop(); r2.drop();
        shoulder(r1, item.moneybag(1.1)); shoulder(r2, item.moneybag(1.1));
        r1.mood = r2.mood = 'happy';
        cam.track([r1, r2], { dist: 11, el: 0.14, az: 0.9, lead: 2 });
        yield* wait(0.3);
        const sx = xr - vdir * 1.1;
        R.run(go(ctx, r1, sx, vz + 0.5, 7));
        yield* go(ctx, r2, sx, vz - 0.5, 7);
        r1.heading = r2.heading = vdir > 0 ? E : W;
        B('6b the bags go into the van, the doors slam', [van, r1, r2]);
        cam.ground(pt(xr - vdir * 0.5, vz), { dist: 6.5, az: -vdir * 0.8 });
        yield* wait(0.3);
        const toss = function* (a, k) {
          a.drop();
          a.arms = 'push';
          const bag = R.add(item.moneybag(1.1)), ap = a.g.position;
          bag.position.set(ap.x, 1.5, ap.z);
          ctx.sfx('swish');
          yield* arc(bag, xr + vdir * 1.4, 0.7, vz + k * 0.3, 1.4, 0.5, 5);
          ctx.sfx('thud');
          R.rm(bag);
          a.arms = 'swing';
          yield* leap(ctx, a, xr + vdir * 0.5, vz + k * 0.3, 0.8, 0.4);
          yield* go(ctx, a, vx - vdir * (0.9 + k * 0.3), vz + k * 0.3, 3.5); // into the cargo area: the van's body hides him
          R.gone(a);
        };
        R.run(toss(r1, 1));
        yield* wait(0.3);
        yield* toss(r2, -1);
        yield* wait(0.2);
        van.doors = 0;
        ctx.sfx('slam'); ctx.shake(0.15);
        van.jolt(0.4, 0.4);
        yield* wait(0.5);
        van.doors = 0.35; // one is left ajar
        yield* wait(0.2);

        // ---- 7. the getaway: the van squats, wheels spin, it fishtails away with notes fluttering out of the door
        B('7 the getaway: wheelspin, smoke, fishtail, notes flutter out', [van]);
        van.hazard = false;
        cam.chase(van, vdir);
        yield* wait(0.3);
        say(ctx, van, 'GASSEN!', { size: 16, color: '#ffd60a' });
        if (flip(ctx, 'stall', 0.4)) { // the engine coughs twice before it catches
          for (let i = 0; i < 2; i++) {
            ctx.sfx('rev'); ctx.shake(0.1); van.jolt(0.4, 0);
            ctx.fx.smoke(van.g.position.x - vdir * 2.4, 0.6, van.g.position.z, 4, ['#222', '#444'], 0.4);
            say(ctx, van, i ? 'HOEST...' : 'rrr-rr-rr', { size: 14, color: '#ffd166' });
            yield* wait(0.7);
          }
          say(ctx, r1, 'DOORTRAPPEN!', { size: 12, color: '#fff' });
        }
        yield* burn(ctx, van, 0.6);
        ctx.sfx('skid');
        const xe = vdir * 20.5, am = road ? 0.6 : 0.25;
        let drop = 0;
        const vspeed = (u) => 4 + 10 * Math.min(1, u * 2.2);
        const vEach = (dt) => {
          drop -= dt;
          if (drop < 0) {
            const p = van.g.position;
            ctx.fx.cash(p.x - vdir * 2.4, 1.3, p.z, 2, 2.5, 4);
            exhaust(ctx, van, 1);
            drop = 0.1;
          }
        };
        const weave = [[lerp(vx, xe, 0.3), vz + am], [lerp(vx, xe, 0.62), vz - am], [xe, vz]].map((q) => (S.laneClear(ctx, q[1], q[0] - 2, q[0] + 2, HALF) ? q : [q[0], vz])); // the fishtail only where the road is free
        const gone = yield* drive(ctx, van, weave, vspeed, { drift: 0.9, each: vEach });
        if (gone === false) yield* dash(ctx, van, xe, vz, 12, { v0: 1, ramp: 1.2, skid: true, burn: 0.8, each: (dt) => { vEach(dt); } }); // no line for the fishtail: the straight one, which was measured
        yield* R.out(van);
        ctx.news('Plofkraak crew flees in a van; "very polite, they waved"');

        // ---- 8. the law: a police car slides to a stop at the smoking hole; the cop scratches his head and pockets the last note
        const po = makeCar(rnd, 'police', L.night), cop = makePerson(rnd, { kind: 'cop' });
        B('8 the law: a police car slides to a stop at the smoking hole', [pt(clamp(A.x - vdir * 3.2, -16, 16), vz), atm]);
        const pstop = clamp(A.x - vdir * 3.2, -16, 16);
        const sweepOk = S.laneClear(ctx, vz, pstop - 4, pstop + 4, 2.35); // can he slide it round broadside here?
        cam.wide(pt(A.x, vz - toward * 1.2), { dist: 24, el: 0.3, az: -vdir * 0.45 });
        ctx.sfx('siren', 3); // heard before it is seen
        po.siren = true;
        yield* wait(0.8);
        yield* R.enter(po, -vdir * 17, vz, 0, { dir: vdir, speed: 12 });
        po.face(vf);
        say(ctx, po, 'WEE-OO!', { color: '#7db8ff', size: 16 });
        if (sweepOk) {
          yield* dash(ctx, po, pstop - vdir * 5, vz, 13, { v0: 5, ramp: 0.6 });
          yield* handbrake(ctx, po, 5, 1.0, Math.PI / 2, vdir * -toward);
        } else {
          yield* dash(ctx, po, pstop - vdir * 1.5, vz, 13, { v0: 5, ramp: 0.6, brake: 0.5, skid: true });
        }
        ctx.shake(0.12);
        po.siren = false;
        yield* wait(0.3);
        const cx0 = po.g.position.x - vdir * (sweepOk ? 0.3 : 0), cz0 = vz - toward * 1.8;
        yield* emerge(ctx, R, cop, po, cx0, cz0);
        B('8b the cop looks at the hole, looks down the street, scratches his head', [cop]);
        cam.close(cop);
        cop.arms = 'hips'; cop.mood = 'neutral';
        R.run(go(ctx, cop, A.x - vdir * 0.5, A.z + 1.7, 2.8));
        yield* wait(0.8);
        cop.lookAt = atm;
        yield* wait(1.0);
        cop.lookAt = { x: vdir * 20, z: vz };
        cop.shakeT = 1.0;
        yield* wait(1.0);
        cop.lookAt = null;
        cop.arms = 'facepalm'; cop.mood = 'sad';
        ctx.sfx('womp');
        yield* wait(0.8);
        // one last note floats down; he pockets it
        const cp = cop.g.position;
        ctx.fx.cash(cp.x, 3.6, cp.z + 0.2, 1, 0.2, 0.4);
        cop.lookAt = { x: cp.x, z: cp.z + 0.2 };
        cop.arms = 'reach';
        yield* wait(0.9);
        cop.lookAt = null; cop.arms = 'hips'; cop.mood = 'smug';
        cop.squash(0.2);
        ctx.sfx('kaching');
        say(ctx, cop, 'BEWIJS.', { size: 17, color: '#7db8ff' });
        ctx.news('Police: "we were this close". Suspects still at large, one note in evidence');
        yield* wait(1.2);

        // ---- 9. epilogue: the hole smokes, the alarm rings on
        B('9 epilogue: the hole smokes, the alarm rings on', [atm]);
        cam.wide(atm, { dist: 20, el: 0.3, az: -vdir * 0.45 });
        const lamp = R.add(sculpt((v) => v.box(A.x, by + 2.9, A.z - 0.7, 0.3, 0.2, 0.2, '#ff2d2d'), MAT.glow));
        const blink = R.run((function* () { let u = 0; for (;;) { u += yield; lamp.visible = Math.floor(u * 6) % 2 === 0; } })());
        const puffs = R.run((function* () { for (;;) { ctx.fx.smoke(A.x, by + 1.6, A.z - 0.7, 1, ['#555', '#444', '#666'], 0.5); yield* wait(0.2); } })());
        ctx.sfx('alarm');
        R.run((function* () { // the cop gets back in and the police car drives off to look for them (it came from the far end: it leaves the way the van went)
          yield* wait(0.5);
          yield* sink(ctx, R, cop, po);
          po.siren = true;
          const xe2 = vdir * 20.5;
          const ok2 = yield* drive(ctx, po, [[lerp(po.g.position.x, xe2, 0.4), vz], [xe2, vz]], (u) => 2 + 9 * Math.min(1, u * 2));
          if (ok2 === false) yield* dash(ctx, po, xe2, vz, 10, { v0: 1, ramp: 1.2 });
          yield* R.out(po);
        })());
        yield* wait(0.5);
        ctx.fx.text('RING RING RING', at(A.x, 4.2, A.z), { size: 20, color: '#ff6b6b', dur: 1.6 });
        yield* wait(2.4);
        R.stop(blink); R.stop(puffs);
        yield* wait(0.4); // (the camera lets go; the rig drives the police car on out of the frame)
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
