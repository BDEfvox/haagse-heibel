// Reckless driving: the chase. A hatchback slaloms down the street leaning on its springs, pulls a handbrake 180, passes the
// police car nose to nose, watches it make a fool of itself, and is boxed in by a second one. Then: a ticket, or a gap.
// Storyboard: storyboards/carChase.md. Every B(...) below is one beat of it, with who must be on screen.
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
    release, needPed, panic, closeRoad, openRoad, policeRun, footCop,
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
  /** Keep going along the heading at v until until() says stop. */
  function* cruise(car, v, until, max = 10) {
    const p = car.g.position, h = car.g.rotation.y, sx = Math.sin(h), sz = Math.cos(h);
    let t = 0;
    while (t < max && !until()) { const dt = yield; t += dt; p.x += sx * v * dt; p.z += sz * v * dt; car.moving = v; }
  }
  /** Stand on the brakes: the speed goes to zero over `dur` seconds and the nose dives. */
  function* brake(ctx, car, v, dur = 0.5) {
    const p = car.g.position, h = car.g.rotation.y, sx = Math.sin(h), sz = Math.cos(h);
    let t = 0, k = 0;
    ctx.sfx('skid');
    car.jolt(0.5, 0);
    while (t < dur) {
      const dt = yield;
      t += dt; k -= dt;
      const sp = v * Math.max(0, 1 - t / dur);
      p.x += sx * sp * dt; p.z += sz * sp * dt;
      car.moving = sp;
      if (k <= 0) { skid(ctx, car); k = 0.04; }
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
  /** Steam from under the bonnet until the task is stopped. */
  function* steam(ctx, car) {
    for (;;) {
      const p = car.g.position;
      if (!car.alive) return;
      ctx.fx.smoke(p.x, 1.3, p.z, 1, ['#e8e8e8', '#cfcfcf'], 0.3);
      yield* wait(0.22);
    }
  }
  /** The hubcap: a flat silver disc standing on its edge (centred on its origin so it spins properly). */
  const hubcap = () => {
    const g = new THREE.Group();
    g.add(sculpt((v) => {
      v.box(0, -0.17, 0, 0.34, 0.34, 0.06, '#cfd6db');
      v.box(0, -0.09, 0.04, 0.16, 0.16, 0.03, '#8f9aa1');
      v.box(0, -0.09, -0.04, 0.16, 0.16, 0.03, '#8f9aa1');
    }));
    return g;
  };

  return {
    w: [0, 0, 0.4, 1.2, 3], crime: 3, lock: 'road',
    avail: (ctx) => ctx.L.kind !== 'ped' && ctx.L.hw >= 2.2 && S.roadHere(ctx, ctx.L.chaseZ, -22, 22, 0.8), // needs a real road along the whole stretch
    *run(ctx) {
      const { L, rnd } = ctx, cam = camFor(ctx, 'carChase'), B = beatsFor(ctx, 'carChase'), R = rig(ctx);
      let done = false;
      try {
        yield* R.close();
        // ---- the street: which way, how much road
        const dir = rnd.sign(), fwd = dir > 0 ? E : W, X = (s) => dir * s; // s = metres along the way the speeder first goes
        const hw = L.hw, park = L.kind === 'minor' && !!L.canPark; // parked cars from z = +0.68 on a minor street
        const lo = -hw + 0.95, hi = park ? Math.min(hw - 0.95, -0.27) : hw - 0.95; // car centres that keep the body on the road
        const mid = (lo + hi) / 2, amp = clamp((hi - lo) / 2, 0.3, 1.25);
        const zA = lo + 0.12 * (hi - lo), zB = hi; // the lane the boxed-in tableau stands in, and the lane for squeezing past
        const hbSide = rnd.sign(), kerb = park ? -1 : 1, sS = -11; // sS: where the speeder is boxed in
        const spd = makeCar(rnd, 'car', L.night), po1 = makeCar(rnd, 'police', L.night), po2 = makeCar(rnd, 'police', L.night);
        const hub = R.add(hubcap());
        hub.visible = false;
        const st = { stopped: false, turn: false, bump: false, launched: false };
        ctx.wanted = spd;
        ctx.news(`High-speed chase on ${ctx.st.name}! Top speed: 34 km/h`);
        ctx.incident(3);

        // ---- 1. roar in: the car comes straight at the lens, nose lifting, weaving a little
        B('1 roar in: the speeder comes straight at the lens', [spd]);
        cam.nose(spd, dir, { hold: 3.6 });
        yield* R.enter(spd, X(-21.4), mid, 0);
        spd.face(fwd);
        cam.card('DE SNELHEIDSDUIVEL', 'Late for something. Probably his own trial.', 2.2);
        ctx.sfx('sting');
        yield* wait(0.35);
        yield* burn(ctx, spd, 0.7);
        yield* drive(ctx, spd, [[X(-18.5), mid + amp * 0.3], [X(-15.5), mid - amp * 0.3], [X(-12.5), mid]], (u) => 3 + 8 * Math.min(1, u * 1.6));

        // ---- the police car (a task of its own): it trails the chase, is passed nose to nose, brakes, then flunks its turn
        const p1run = R.run((function* () {
          yield* wait(0.2);
          yield* R.enter(po1, X(-21.4), zB, 0);
          po1.face(fwd); po1.siren = true;
          ctx.sfx('siren', 3);
          say(ctx, po1, 'WEE-OO!', { color: '#7db8ff', size: 16 });
          // on the speeder's tail until it has gone by
          yield* cruise(po1, 8.5, () => dir * (spd.g.position.x - po1.g.position.x) < -2.2 || dir * po1.g.position.x > 19, 16);
          say(ctx, po1, 'HÈ?!', { size: 20, color: '#fff' });
          yield* brake(ctx, po1, 8.5, 0.45);
          st.stopped = true;
          yield* waitUntil(() => st.turn, 8);
          // the same turn, rather less gracefully: far too much of it, and into the kerb
          yield* wait(0.1);
          const room = 20.5 - dir * po1.g.position.x;
          yield* handbrake(ctx, po1, clamp(room - 2.5, 1.2, 3.8), 0.95, Math.PI * 1.22, -hbSide);
          po1.heading -= -hbSide * Math.PI * 0.22;
          const z0 = po1.g.position.z, kz = kerb * (hw - 0.6);
          yield* tween(0.3, (u) => { po1.g.position.z = lerp(z0, kz, u); po1.moving = 3; });
          po1.jolt(0.9, -kerb * 1.2);
          ctx.sfx('bonk'); ctx.shake(0.25);
          const px = po1.g.position.x, pz = po1.g.position.z;
          ctx.fx.sparks(px, 0.3, pz + kerb * 0.9, 6);
          say(ctx, po1, 'BONK!', { size: 22, color: '#ffd60a' });
          // the hubcap pops off, bounces and rolls away down the street
          hub.visible = true;
          hub.position.set(px, 0.4, pz + kerb * 0.95);
          const lx = clamp(px + dir * 2.5, EX0 + 1.5, EX1 - 1.5), lz = pz - kerb * 1.6;
          st.bump = true;
          R.run((function* () {
            yield* arc(hub, lx, 0.17, lz, 1.3, 0.5, 4);
            hub.rotation.y = 0;
            ctx.sfx('ding');
            ctx.fx.dust(lx, 0, lz, 0, 0, 3);
            const hx0 = hub.position.x, hx1 = clamp(hx0 + dir * 3.4, EX0 + 1, EX1 - 1);
            yield* tween(1.8, (u) => {
              hub.position.x = lerp(hx0, hx1, u);
              hub.position.y = 0.17 + Math.abs(Math.sin(u * 14)) * 0.05 * (1 - u);
              hub.rotation.z = -dir * u * 16;
            }, ease.outCubic);
          })());
          yield* wait(0.3);
          // ...and it gives chase after all
          say(ctx, po1, 'ACHTERNA!', { size: 15, color: '#7db8ff' });
          yield* dash(ctx, po1, X(sS + 4.55), zA, 12, { v0: 0, ramp: 0.7, brake: 0.5, skid: true });
        })());

        // ---- 2. the slalom: swerving left and right, the body leaning hard over its wheels
        B('2 the slalom: the body rolls hard over its wheels', [spd]);
        cam.chase(spd, dir, { hold: 1.4 });
        ctx.slowmo(0.7, 1.6);
        let seenLaw = false, seenHb = false;
        yield* drive(ctx, spd, [[X(-9), mid + amp], [X(-5.5), mid - amp], [X(-2), mid + amp], [X(1.5), mid], [X(4.2), mid], [X(8), mid]], 10.5, {
          drift: 0.5,
          each: () => {
            const sx = dir * spd.g.position.x;
            if (!seenLaw && sx > -5.5) {
              seenLaw = true;
              B('2b the law joins in: the police car turns up behind', [spd, po1]);
              cam.chase([spd, po1], dir, { fit: true, hold: 1.6 });
            }
            if (!seenHb && sx > 4.4) {
              seenHb = true;
              // ---- 3. the handbrake (the cut comes a third of a second before it)
              B('3 the handbrake: a 180 in a cloud of smoke, leaning right over', [spd]);
              cam.ground(spd, { az: dir * 0.9, dist: 6.5, fov: 44, hold: 2.8 });
            }
            return false;
          },
        });
        ctx.sfx('skid');
        R.run((function* () { yield* wait(0.5); cam.freeze(0.8, 0.05); })()); // a held frame at full lean
        ctx.fx.text('*SKRRRT*', spd, { size: 18, color: '#fff' });
        yield* handbrake(ctx, spd, 6, 1.2, Math.PI, hbSide);
        ctx.shake(0.12);

        // ---- 4. the pass: squats, launches back the way it came, passes the police car nose to nose
        B('4 the pass: nose to nose, the police car stands on its brakes', [spd, po1]);
        cam.high(pt(X(8), mid), { dist: 20, hold: 3.2 });
        yield* wait(0.3);
        yield* burn(ctx, spd, 0.25);
        say(ctx, spd, 'TOT ZIENS!', { size: 15, color: '#ffd60a' });
        st.launched = true;
        const flight = R.run(dash(ctx, spd, X(sS), zA, 8.5, { v0: 0, ramp: 0.7, brake: 0.5, burn: 0.5, skid: true }));
        // the second police car (head-on from the other end)
        const p2run = R.run((function* () {
          yield* wait(0.9);
          yield* R.enter(po2, X(-21.4), zA, 0);
          po2.face(fwd); po2.siren = true;
          ctx.sfx('siren', 3);
          say(ctx, po2, 'WEE-OO!', { color: '#7db8ff', size: 16 });
          yield* dash(ctx, po2, X(sS - 4.55), zA, 11, { brake: 0.5, skid: true });
        })());
        yield* waitUntil(() => st.stopped, 6);

        // ---- 5. the police turn: overshoots, bumps the kerb, a hubcap rolls away
        B('5 the police turn: too much handbrake, into the kerb', [po1]);
        cam.dutch(po1, { dist: 9, az: dir * 0.3, hold: 3 });
        st.turn = true;
        yield* waitUntil(() => st.bump, 6);
        B('5b the hubcap rolls away down the street', [hub]);
        cam.ground(hub, { dist: 6, az: -dir * 0.4, hold: 2 });
        yield* wait(0.6);
        yield* waitUntil(() => dir * spd.g.position.x < -5.5, 5); // cut to the tableau just before the speeder brakes

        // ---- 6. boxed in
        B('6 boxed in: it brakes hard and stops between the two', [spd, po2, po1]);
        cam.wide(pt(X(-9), mid), { dist: 27, el: 0.4, az: dir * 0.3, hold: 3.6 });
        yield* waitUntil(() => flight.done, 6);
        spd.jolt(0.9, 0);
        ctx.fx.smoke(spd.g.position.x, 0.4, spd.g.position.z, 8, ['#ddd', '#bbb'], 0.5);
        ctx.shake(0.15);
        say(ctx, spd, 'OEI...', { size: 16, color: '#fff' });
        yield* R.settle(6); // the second police car and the first one have both arrived
        yield* wait(0.3);
        B('6b the gap: a hand\'s width between the bumpers', [spd, po2]);
        cam.ground(pt(X(sS - 2.3), zA), { dist: 5.5, az: 0.25, hold: 2.6 });
        yield* wait(1.0);

        const steamers = [];
        const busted = flip(ctx, 'busted', 0.6);
        if (busted) {
          // ---- 7a. the ticket
          const zs = zA + (zA + 1.6 < hw - 0.4 ? 1.6 : -1.6);
          const driver = makePerson(rnd, { kind: 'hoodie' }), cop = makePerson(rnd, { kind: 'cop' });
          R.run(R.enter(cop, X(sS + 3.4), zs + 0.1));
          yield* R.enter(driver, X(sS - 0.3), zs);
          driver.heading = 0; driver.arms = 'up'; driver.mood = 'sad';
          driver.squash(0.2);
          ctx.sfx('door');
          yield* wait(0.3);
          B('7 the ticket: the driver climbs out, hands up, and a cop writes', [driver, cop]);
          cam.two(driver, cop, { az: 0.15, hold: 4.8 });
          cop.hold(item.pad()); cop.arms = 'write'; cop.mood = 'smug';
          cop.lookAt = driver; driver.lookAt = cop;
          yield* wait(0.4);
          say(ctx, driver, 'ik kan het uitleggen...', { size: 13, color: '#fff' });
          yield* go(ctx, cop, X(sS + 1.3), zs + 0.1, 2.6);
          cop.heading = Math.atan2(X(sS - 0.3) - cop.g.position.x, 0.001);
          say(ctx, cop, 'PAPIEREN.', { size: 15, color: '#7db8ff' });
          yield* wait(1.0);
          // the flourish, and the ticket goes onto the windscreen
          cop.arms = 'point';
          cop.squash(0.2);
          const tk = R.add(item.ticket());
          tk.position.set(cop.g.position.x, 1.2, cop.g.position.z);
          const fx = Math.sin(spd.g.rotation.y) * 0.35, wx = spd.g.position.x + fx, wz = spd.g.position.z;
          yield* arc(tk, wx, 1.0, wz, 0.9, 0.45, 8);
          tk.rotation.order = 'YXZ'; tk.rotation.y = spd.g.rotation.y; tk.rotation.x = 0.8;
          ctx.sfx('thud'); ctx.shake(0.1);
          ctx.fx.text('BON! €1.249', at(spd.g.position.x, 2.7, spd.g.position.z), { size: 28, color: '#ffd60a' });
          ctx.sfx('womp');
          cop.arms = 'hips'; cop.squash(0.15);
          driver.arms = 'facepalm'; driver.lookAt = null;
          yield* wait(0.6);
          cam.face(driver, { hold: 2.4 });
          yield* wait(0.3);
          driver.mood = 'sad';
          ctx.news('Speeder fined €1.249 after a chase of roughly forty metres; "I was in a hurry"');
          yield* wait(1.6);
          cop.lookAt = null; cop.arms = 'swing';
          R.run((function* () { yield* wait(0.3); yield* R.out(driver); })());
          R.run((function* () { yield* go(ctx, cop, X(sS + 3.4), zs + 0.1, 2.8); yield* R.out(cop); })());
          steamers.push(R.run(steam(ctx, spd)));
        } else {
          // ---- 7b. the gap: he grins, squirts through, and the police cars bump noses
          B('7 the gap: he grins, finds it and squirts through', [spd]);
          cam.chase(spd, -dir, { hold: 3 });
          yield* wait(0.3);
          say(ctx, spd, 'HEHEHE!', { size: 16, color: '#b9fbc0' });
          ctx.sfx('snigger');
          yield* burn(ctx, spd, 0.5);
          R.run((function* () {
            yield* drive(ctx, spd, [[X(sS - 1.4), (zA + zB) / 2], [X(sS - 5), zB], [X(-21), zB]], (u) => 5 + 9 * Math.min(1, u * 2.5), { drift: 0.6 });
            yield* R.out(spd);
          })());
          yield* waitUntil(() => dir * spd.g.position.x < sS - 3.5, 3);
          B('7b the bump: both police cars lurch forward and bump noses', [po1, po2]);
          cam.dutch([po1, po2], { dist: 11, hold: 2.6 });
          yield* wait(0.3);
          ctx.sfx('rev');
          R.run(dash(ctx, po1, X(sS + 2.25), zA, 6, { v0: 0, ramp: 0.3 }));
          yield* dash(ctx, po2, X(sS - 2.25), zA, 6, { v0: 0, ramp: 0.3 });
          po1.jolt(1.0, 0); po2.jolt(1.0, 0);
          ctx.sfx('bonk'); ctx.shake(0.35);
          ctx.fx.text('BONK!', at(X(sS), 2.4, zA), { size: 30, color: '#ffd60a' });
          ctx.fx.sparks(X(sS), 0.8, zA, 8);
          say(ctx, po1, 'HÈ?!', { size: 16, color: '#fff' });
          ctx.news(`Speeder escapes down ${ctx.st.name} through a gap "the width of a bumper"; police cars unhurt, pride less so`);
          yield* wait(1.4);
          steamers.push(R.run(steam(ctx, po1)), R.run(steam(ctx, po2)));
        }

        // ---- 8. epilogue: quiet street, a single hubcap wobbles to a stop
        B('8 epilogue: the street is quiet, the hubcap wobbles to a stop', [hub]);
        cam.ground(hub, { dist: 5.5, az: -dir * 0.4, hold: 3.4 });
        yield* wait(0.4);
        ctx.sfx('ding');
        const hx = hub.position.x;
        yield* tween(2.2, (u) => {
          const rx = (Math.PI / 2) * Math.pow(u, 2.2) + Math.sin(u * 34) * 0.12 * (1 - u) * Math.min(1, u * 6);
          hub.rotation.x = rx;
          hub.rotation.z += 0.02 * (1 - u);
          hub.position.y = 0.17 * Math.cos(Math.min(rx, Math.PI / 2)) + 0.03;
          hub.position.x = hx + dir * 0.25 * u;
        });
        ctx.sfx('ding');
        yield* wait(0.3);
        cam.wide(pt(0, mid), { dist: 34, el: 0.35, az: 0.4, hold: 3 });
        yield* wait(1.8);
        for (const t of steamers) R.stop(t);
        yield* R.settle(8);
        yield* wait(0.3);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
