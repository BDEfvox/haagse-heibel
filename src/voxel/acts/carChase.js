// Reckless driving: the chase. A hatchback is flashed for speeding, slaloms down the street leaning on its springs and pulls a
// handbrake 180. What happens next depends on how much road there is (measured at the start, never assumed):
//   pass:    two clear lanes with room for two bodies and 0.6 m between them: it comes back past the (stationary) police car
//   squeeze: two lanes just wide enough: it creeps past, sparks flying, both cars holding their breath
//   reverse: one lane only: no turn, no passing; a police car shows up head-on, the speeder backs away at speed with it
//            following nose to nose, until a second one boxes him in from behind
// Then the driver is fined or bolts on foot, and the three cars leave in an order that needs no room they do not have.
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
    seat, rideTo, mount, dismount, lineObj, lootBox, beatsFor, flip, laugh, cackle, leap, tumble, getUp,
    seeStars, fright, tiptoe, shoulder, noteTrail, runDust, skid, drive, handbrake, exhaust, spawnPed, unped, stroll,
    release, needPed, seen, watching,
  } = T;

  const HALF = 1.03;      // half a car body plus a hand: what a driving line must keep clear either side
  const SPAN = 17;        // the scene plays between s = -SPAN and +SPAN around the stage centre (34 m of clear road)
  const SWEEP = 2.35;     // a car turning on the spot sweeps a circle this big (half the diagonal of 4.4 x 1.85)

  /** The street's free driving lines across x0..x1 (z values 0.1 m apart that are road and clear for a car's width), measured once. */
  const freeLines = (ctx, x0, x1) => {
    const hw = ctx.L.hw, lim = Math.max(0, hw - 0.95), out = [];
    for (let z = -lim; z <= lim + 1e-6; z += 0.1) if (S.laneClear(ctx, z, x0, x1, HALF)) out.push(+z.toFixed(2));
    return out;
  };

  /**
   * A straight run to (x1, z1) at v m/s along a line that has been measured clear. o.v0 + o.ramp: pull away from that speed over
   * `ramp` seconds (the body squats). o.brake: stand on the brakes over that many seconds, stopping exactly on the spot (the nose
   * dives). o.skid: lay rubber while braking, and for o.burn seconds from the start (wheelspin). o.back: reverse (the car keeps
   * its heading and moves the other way). o.each(dt, u) may return true to stop early.
   */
  function* dash(ctx, car, x1, z1, v, o = {}) {
    const p = car.g.position, x0 = p.x, z0 = p.z, D = Math.hypot(x1 - x0, z1 - z0);
    if (D < 0.05) return;
    const ux = (x1 - x0) / D, uz = (z1 - z0) / D, bd = o.brake || 0, bs = (v * bd) / 2, v0 = o.v0 ?? v, ramp = o.ramp || 0;
    car.heading = Math.atan2(ux, uz) + (o.back ? Math.PI : 0);
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

  // ---- people and cars: nobody pops, nobody clips
  /** Somebody steps out of a car: they start inside its body (low, so the roof hides them), the door goes, they step out to (tx, tz). */
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
  function* sink(ctx, R, a, car, side) {
    const p = car.g.position;
    yield* go(ctx, a, p.x, p.z + side * 1.15, 3.2);
    a.heading = Math.atan2(0, -side);
    ctx.sfx('door');
    a.air = true;
    const x0 = a.g.position.x, z0 = a.g.position.z, y0 = a.g.position.y;
    yield* tween(0.45, (u) => { a.g.position.set(lerp(x0, p.x, u), lerp(y0, -0.55, u), lerp(z0, p.z, u)); });
    R.gone(a);
  }

  return {
    w: [0, 0, 0.4, 1.2, 3], crime: 3, lock: 'road',
    // a real road with at least one clear driving line along the whole stretch
    avail: (ctx) => (ctx.L.kind !== 'ped' || ctx.L.hw >= 3.4) && ctx.L.hw >= 2.0 && S.laneFor(ctx, 1, -SPAN, SPAN, HALF) != null, // (laneFor itself wants road under the whole line)
    stage: { road: { len: 2 * SPAN }, cross: true },
    *run(ctx) {
      const { L, rnd } = ctx, cam = camFor(ctx, 'carChase'), B = beatsFor(ctx, 'carChase'), R = rig(ctx);
      const ox = ctx.stage ? ctx.stage.x : 0; // read before the first yield
      let done = false;
      try {
        // ---- the street: how much road there is, measured, and from that which way this goes
        const dir = rnd.sign(), fwd = dir > 0 ? E : W, X = (s) => ox + dir * s, hw = L.hw; // s = metres along the way the speeder first goes
        const ranges = [ox - SPAN, ox + SPAN];
        const zs = freeLines(ctx, ranges[0], ranges[1]);
        if (!zs.length) return;
        const hwMargin = Math.min(0.9, (zs[zs.length - 1] - zs[0]) / 2); // a car that yaws in a weave or a lane change needs room beyond its straight-ahead line
        let band = zs.filter((z) => z >= zs[0] + hwMargin - 1e-6 && z <= zs[zs.length - 1] - hwMargin + 1e-6);
        if (!band.length) band = [zs[(zs.length - 1) >> 1]]; // a narrow road with an even number of free lines: the margins meet between two of them, so take the middle one
        const okZ = (z) => band.some((q) => Math.abs(q - z) < 0.06);
        const zmin = band[0], zmax = band[band.length - 1], zc = (zmin + zmax) / 2, span = zmax - zmin;
        const laneZ = ctx.stage && ctx.stage.lane != null ? ctx.stage.lane : L.chaseZ ?? 0;
        const zL = band.reduce((b, z) => (Math.abs(z - laneZ) < Math.abs(b - laneZ) ? z : b), band[0]); // the free line nearest the stage's own
        const spd = makeCar(rnd, 'car', L.night), po1 = makeCar(rnd, 'police', L.night), po2 = makeCar(rnd, 'police', L.night);
        const CW = spd.wid || 1.85, CL = spd.len || 4.4;
        // the turn on the spot needs a free circle; look for the clear line with the most room round it
        const sh = 8, slide = 4.5, hbA = X(sh - SWEEP), hbB = X(sh + slide + SWEEP);
        const circleOk = (z) => S.laneClear(ctx, z, Math.min(hbA, hbB), Math.max(hbA, hbB), SWEEP);
        const zH = band.filter(circleOk).sort((p, q) => Math.abs(p - zc) - Math.abs(q - zc))[0];
        const room = zmax - zmin; // between the outermost usable lines (centre to centre)
        const opts = [];
        if (zH != null && room >= CW + 0.75) opts.push('pass');
        if (zH != null && room >= CW + 0.16) opts.push('squeeze');
        opts.push('reverse');
        const forced = ctx.force && opts.find((o) => ctx.force[o]);
        const mode = forced || rnd.pick(opts);
        // two lines for pass/squeeze: the speeder's (zS) and the police car's (zP, the other side of the road)
        const side0 = rnd.sign();
        let zS = side0 > 0 ? zmin : zmax, zP = side0 > 0 ? zmax : zmin;
        if (mode !== 'reverse') { // the second line: as close to the wanted spacing as the measured free lines allow (0.8 m between bodies; squeeze: just over a hand)
          const want = mode === 'squeeze' ? CW + 0.14 : CW + 0.8;
          const cand = band.filter((z) => Math.abs(z - zS) >= want).sort((p, q) => Math.abs(Math.abs(p - zS) - want) - Math.abs(Math.abs(q - zS) - want))[0];
          if (cand != null) zP = cand;
        }
        const gap = Math.abs(zP - zS) - CW;           // the bodies' side-to-side gap when two cars pass: at least 0.6 in pass mode
        const kerbSide = Math.sign(zP - zS) || 1;     // police car's side of the speeder = the way its wheels would meet the kerb
        const sT = mode === 'reverse' ? -4 : -11;    // where the speeder ends up boxed in
        const xP = -1.5;                                // the police car that is passed: where it stands (pass / squeeze)

        const st = { lawSeen: false, p1in: false, hb: false, passed: false, stopped: false, bumped: false };
        const hub = R.add(hubcap());
        hub.visible = false;
        ctx.wanted = spd;
        ctx.news(`High-speed chase on ${ctx.st.name}! Top speed: 34 km/h`);
        ctx.incident(3);

        // ---- 1. the speeding: a flash, a number, and a car that does not care
        B('1 the speeding: a flash and a number', [pt(X(-11), zc)]);
        cam.wide(pt(X(-11), zc), { dist: 24, el: 0.28, az: dir * 0.35 });
        yield* R.enter(spd, X(-13), zL, 0, { dir, speed: 12 });
        spd.face(fwd);
        yield* dash(ctx, spd, X(-10.5), zL, 12);
        ctx.flash('#ffffff', 0.25);
        ctx.sfx('ding');
        ctx.fx.text('FLITS!', at(spd.g.position.x, 3.2, spd.g.position.z), { size: 24, color: '#ffffff' });
        ctx.fx.text('94 km/u in een zone 30', at(spd.g.position.x, 2.5, spd.g.position.z), { size: 15, color: '#ff4d4d', dur: 1.6 });
        ctx.stageMode && ctx.stageMode('flee');
        // ---- 2. roar in: the car comes straight at the lens, nose lifting, weaving a little (the card and the siren play over it)
        B('2 roar in: the speeder comes straight at the lens', [spd]);
        cam.nose(spd, dir);
        R.run((function* () {
          yield* wait(0.4);
          cam.card('DE SNELHEIDSDUIVEL', 'Late for something. Probably his own trial.', 2.2);
          ctx.sfx('sting');
          yield* wait(1.2);
          ctx.sfx('siren', 3); // heard well before it is seen
        })());

        // ---- the first police car (a task of its own): in from out of the frame behind the speeder, siren on
        const behind = mode === 'reverse' ? null : R.run((function* () {
          ctx.sfx('siren', 3);
          yield* wait(0.5);
          yield* R.enter(po1, X(-16), zP, 0, { dir, speed: 11 });
          po1.face(fwd); po1.siren = true;
          st.p1in = true;
          say(ctx, po1, 'WEE-OO!', { color: '#7db8ff', size: 16 });
          R.run((function* () { yield* wait(1.0); st.lawSeen = true; })()); // he gets a second to look at it before he spins round
          // on the speeder's tail, ten metres back, until it starts to turn
          const p = po1.g.position;
          while (!st.hb) {
            const dt = yield;
            const err = dir * (spd.g.position.x - p.x) - 11 - CL / 2;
            const v = clamp(8 + err * 0.9, 3, 13);
            p.x += dir * v * dt; p.y = 0; po1.moving = v;
          }
          // it sees the speeder spin and stands on the brakes, stopping where it will be passed
          yield* wait(0.1);
          say(ctx, po1, 'HÈ?!', { size: 20, color: '#fff' });
          ctx.sfx('skid');
          yield* dash(ctx, po1, X(xP), zP, 9.5, { brake: 0.5, skid: true });
          po1.jolt(0.6, 0);
          st.stopped = true;
        })());

        // the slalom: left and right inside the lines that are really free, the body rolling hard over its wheels
        const zq = mode === 'reverse' ? zL : zH;   // where the weave ends: on the line with the free circle (turn), or the one lane (reverse)
        const endS = mode === 'reverse' ? 1.5 : sh;
        let amp = clamp(span / 2, 0, 1.25);
        while (amp > 0.2 && !(okZ(zq + amp) && okZ(zq - amp))) amp -= 0.1;
        amp = Math.min(amp, 1.0);
        const sl = amp > 0.2 ? [[-8.5, zq + amp], [-4, zq - amp], [0, zq + amp], [endS - 3, zq - amp * 0.4]].filter((q, i, all2) => q[0] < endS - 1.2 && (!i || q[0] > all2[i - 1][0])).map((q) => [X(q[0]), q[1]]).concat([[X(endS), zq]]) : [[X(endS), zq]];
        let seenLaw = false, seenSl = false;
        const lawBeat = () => { seenLaw = true; B('3b the law joins in: the police car turns up behind', [spd, po1]); cam.chase([spd, po1], dir, { fit: true }); };
        const slalom = function* (line, v) {
          return yield* drive(ctx, spd, line, v, {
            drift: 0.5,
            each: () => {
              if (!seenSl && dir * (spd.g.position.x - ox) > -6.5) {
                seenSl = true;
                B('3 the slalom: the body rolls hard over its wheels', [spd]);
                cam.chase(spd, dir);
              }
              if (!seenLaw && seenSl && st.p1in) lawBeat();
              return false;
            },
          });
        };
        let ok = yield* slalom(sl, (u) => 11 - 3 * u);
        if (!ok) { // no line for the weave: straight down the free line
          yield* dash(ctx, spd, X(endS), zq, 11);
        }

        if (mode === 'reverse') {
          // ---- 4r. a police car, head-on, from the far end: the speeder stands on the brakes
          const fz = zL;
          const p1x = X(12.5);
          const arrive = R.run((function* () {
            yield* R.enter(po1, X(17), fz, 0, { dir: -dir, speed: 10 });
            po1.face(-dir > 0 ? E : W); po1.siren = true;
            st.p1in = true;
            say(ctx, po1, 'WEE-OO!', { color: '#7db8ff', size: 16 });
            yield* dash(ctx, po1, p1x, fz, 10, { brake: 0.5, skid: true });
            po1.jolt(0.6, 0);
          })());
          B('4 head-on: a police car at the far end, the speeder stands on the brakes', [spd]);
          ctx.sfx('siren', 3);
          cam.high(pt(X(5), fz), { dist: 18, az: dir * 0.3 });
          yield* waitUntil(() => st.p1in, 6);
          say(ctx, spd, 'OEI!', { size: 18, color: '#fff' });
          ctx.sfx('skid');
          yield* dash(ctx, spd, X(5.6), fz, 10.5, { brake: 0.5, skid: true });
          spd.jolt(0.8, 0);
          yield* waitUntil(() => arrive.done, 4);
          yield* wait(0.3);

          // ---- 5r. reverse! the police car follows nose to nose; a second one blocks the way behind
          B('5 reverse: backing away flat out, the police car on his bumper', [spd, po1]);
          cam.shot({ on: [spd, po1], fit: true, dist: 13, el: 0.12, az: dir * 1.0, y: 0.7 });
          say(ctx, spd, 'ACHTERUIT!', { size: 16, color: '#ffd60a' });
          ctx.sfx('rev');
          const bs = X(sT), bz = fz;
          R.run((function* () {
            yield* wait(0.3);
            yield* R.enter(po2, X(-17), zL, 0, { dir, speed: 10 });
            po2.face(fwd); po2.siren = true;
            ctx.sfx('siren', 3);
            say(ctx, po2, 'WEE-OO!', { color: '#7db8ff', size: 16 });
            yield* dash(ctx, po2, X(sT - CL - 0.35), zL, 11, { brake: 0.5, skid: true });
            po2.jolt(0.6, 0);
          })());
          const prof = { v0: 1, ramp: 0.7, skid: true, burn: 0.7, back: true };
          R.run(dash(ctx, po1, X(12.5 - (5.6 - sT)), fz, 10, { v0: 1, ramp: 0.7, skid: true, burn: 0.7, brake: 0.5 })); // (forward: it chases him nose to nose)
          yield* dash(ctx, spd, bs, bz, 10, { ...prof, brake: 0.5 });
          st.stopped = true;
          spd.jolt(-0.7, 0);
          ctx.fx.smoke(spd.g.position.x, 0.4, spd.g.position.z, 8, ['#ddd', '#bbb'], 0.5);
          ctx.shake(0.15);
          yield* R.settle(6);
          // the police car creeps up the last two metres: a hand's width
          B('5b the gap: a hand\'s width between the bumpers', [spd, po1, po2]);
          cam.ground(pt(X(sT + CL / 2 + 1.3), zL), { dist: 6, az: dir * 0.25 });
          yield* wait(0.4);
          yield* dash(ctx, po1, X(sT + CL + 0.3), fz, 2.4);
          po1.jolt(0.7, 0);
          st.bumped = true;
          yield* wait(0.6);
        } else {
          // ---- 4. the handbrake (the cut comes a third of a second before it): he waits for the police car to show in the mirror
          if (!st.lawSeen) {
            say(ctx, spd, 'HÈ?', { size: 14, color: '#fff' });
            while (!st.lawSeen) { if (st.p1in && !seenLaw) lawBeat(); yield* burn(ctx, spd, 0.25); }
          }
          st.hb = true;
          B('4 the handbrake: a 180 in a cloud of smoke, leaning right over', [spd]);
          cam.ground(spd, { az: dir * 0.9, dist: 6.5, fov: 44 });
          ctx.sfx('skid');
          R.run((function* () { yield* wait(0.5); cam.freeze(0.8, 0.05); })()); // a held frame at full lean
          ctx.fx.text('*SKRRRT*', spd, { size: 18, color: '#fff' });
          ctx.slowmo(0.7, 1.4);
          const hbSide = rnd.sign();
          // the turn happens on the line with a free circle round it
          yield* handbrake(ctx, spd, slide, 1.2, Math.PI, hbSide);
          ctx.shake(0.12);

          // ---- 5. the pass: squats, launches back the way it came and goes by the standing police car, nose to nose, lines apart
          B(mode === 'pass' ? '5 the pass: nose to nose, the police car stands on its brakes' : '5 the squeeze: both cars hold their breath and creep by', [spd, po1]);
          cam.high(pt(X(xP + 1), (zS + zP) / 2), { dist: 17, az: dir * 0.2 });
          yield* wait(0.3);
          yield* burn(ctx, spd, 0.25);
          say(ctx, spd, 'TOT ZIENS!', { size: 15, color: '#ffd60a' });
          const x2 = spd.g.position.x;
          const back = mode === 'pass'
            ? [[X(sh + slide - 3.5), lerp(zH, zS, 0.55)], [X(4.5), zS], [X(-6.2), zS]]
            : [[X(sh + slide - 3.5), lerp(zH, zS, 0.6)], [X(5), zS], [X(3.3), zS], [X(-6.2), zS]];
          const tail = [[X(-8.5), lerp(zS, zP, 0.5)], [X(sT + 1.8), zP], [X(sT), zP]];
          let sparked = false;
          // squeeze: fast to the standing car, a crawl alongside it, then away
          const crawl = (u) => (u < 0.35 ? 6 : u < 0.47 ? lerp(6, 1.8, (u - 0.35) / 0.12) : u < 0.98 ? 1.8 : 5);
          let okA = yield* drive(ctx, spd, back, mode === 'pass' ? (u) => 3 + 7 * Math.min(1, u * 2.2) : crawl, {
            drift: 0.2,
            each: () => {
              const rel = dir * (spd.g.position.x - X(xP)); // metres along s of the speeder from the standing police car
              if (mode === 'squeeze') {
                // slow right down while the bodies are alongside, scraping
                if (Math.abs(rel) < CL + 0.5) {
                  spd.moving = 1.6;
                  if (!sparked && Math.abs(rel) < 1) {
                    sparked = true;
                    ctx.sfx('screech'); ctx.shake(0.15);
                    const mz = (zS + zP) / 2;
                    ctx.fx.sparks(spd.g.position.x, 0.7, mz, 10);
                    ctx.fx.text('KRRRRK', at(spd.g.position.x, 2.2, mz), { size: 20, color: '#ffd60a' });
                    say(ctx, po1, 'MIJN SPIEGEL!', { size: 14, color: '#fff' });
                  }
                }
              }
              return false;
            },
          });
          if (!okA) yield* dash(ctx, spd, X(xP - 8), zS, 8, { v0: 1, ramp: 0.6 });
          st.passed = true;
          // the second police car, head-on from the far end, in the line the speeder is heading for
          const p2run = R.run((function* () {
            yield* R.enter(po2, X(-17.5), zP, 0, { dir, speed: 10 });
            po2.face(fwd); po2.siren = true;
            ctx.sfx('siren', 3);
            say(ctx, po2, 'WEE-OO!', { color: '#7db8ff', size: 16 });
            yield* dash(ctx, po2, X(sT - CL - 0.6), zP, 11, { brake: 0.5, skid: true });
            po2.jolt(0.6, 0);
          })());
          const lastLeg = yield* drive(ctx, spd, tail, (u) => (u < 0.6 ? 7 : lerp(7, 1.5, (u - 0.6) / 0.4)), { drift: 0.25 });
          if (!lastLeg) yield* dash(ctx, spd, X(sT), zP, 6, { brake: 0.5, skid: true });
          spd.heading = -dir > 0 ? E : W; // squares up in his line
          spd.jolt(0.9, 0);
          ctx.fx.smoke(spd.g.position.x, 0.4, spd.g.position.z, 8, ['#ddd', '#bbb'], 0.5);
          ctx.shake(0.15);
          say(ctx, spd, 'OEI...', { size: 16, color: '#fff' });
          yield* waitUntil(() => st.stopped, 4);
          yield* waitUntil(() => p2run.done, 6);

          // ---- 6. the police car cannot turn round: it backs into him, siren blaring
          B('6 boxed in: the police car, unable to turn, reverses into the speeder\'s tail', [spd, po1, po2]);
          cam.wide(pt(X(sT + 2), zP), { dist: 24, el: 0.35, az: dir * 0.3 });
          yield* wait(0.5);
          say(ctx, po1, 'ACHTERNA!', { size: 15, color: '#7db8ff' });
          ctx.sfx('rev');
          const tailX = X(sT + CL / 2 + 0.15 + CL / 2 - 0.0);
          yield* dash(ctx, po1, X(sT + CL + 0.2), zP, 6.5, { v0: 0, ramp: 0.5, back: true, brake: 0.4, skid: true });
          po1.jolt(-0.9, 0); spd.jolt(0.5, 0);
          ctx.sfx('bonk'); ctx.shake(0.3);
          ctx.fx.text('BONK!', at(X(sT + CL / 2 + 0.1), 2.4, zP), { size: 28, color: '#ffd60a' });
          ctx.fx.sparks(X(sT + CL / 2 + 0.1), 0.7, zP, 8);
          st.bumped = true;
          // a hubcap pops off the backing car's wheel and rolls away down the street, if there is a clear line for it
          const hx = X(sT + CL + 0.2 - CL / 2 + 0.2);
          let hz = null;
          for (const hzc of [zP + kerbSide * 0.95, zP - kerbSide * 0.95]) if (hz == null && S.laneClear(ctx, hzc, Math.min(hx, X(sT + 8)) - 0.5, Math.max(hx, X(sT + 8)) + 0.5, 0.3)) hz = hzc;
          if (hz != null) {
            hub.visible = true;
            hub.position.set(hx, 0.4, zP + kerbSide * 0.9);
            R.run((function* () {
              yield* arc(hub, X(sT + CL + 2.4), 0.17, hz, 1.3, 0.5, 4);
              hub.rotation.y = 0;
              ctx.sfx('ding');
              ctx.fx.dust(hub.position.x, 0, hz, 0, 0, 3);
              const hx0 = hub.position.x, hx1 = X(sT + CL + 6);
              yield* tween(1.8, (u) => {
                hub.position.x = lerp(hx0, hx1, u);
                hub.position.y = 0.17 + Math.abs(Math.sin(u * 14)) * 0.05 * (1 - u);
                hub.rotation.z = -dir * u * 16;
              }, ease.outCubic);
            })());
          }
          yield* wait(0.5);
          if (hz != null) {
            B('6b the hubcap rolls away down the street', [hub]);
            cam.ground(hub, { dist: 6, az: -dir * 0.4 });
            yield* wait(1.3);
          }
        }

        // ---- the tableau: the speeder in the middle, one car nose to nose with him (front), one behind him (back)
        const sx = spd.g.position.x, sz = spd.g.position.z;
        const f = mode === 'reverse' ? dir : -dir;            // the way the speeder faces, in street x
        const front = mode === 'reverse' ? po1 : po2, rear = mode === 'reverse' ? po2 : po1;
        const rearFacing = mode === 'reverse' ? dir : dir;    // (the rear car faces +s in both: pass: tail to tail, reverse: nose to his tail)
        B('7 the stand-off: bumpers a hand\'s width apart', [spd, front]);
        cam.ground(pt(sx + f * (CL / 2 + 0.2), sz), { dist: 6.5, az: 0.3 });
        yield* wait(0.9);

        // who can step out where: a clear spot beside the cars, the pavement side or the road side
        const spots = (zz) => [1, -1].find((sg) => [sx, front.g.position.x, rear.g.position.x].every((xx) => S.clearSpot(ctx, xx, zz + sg * 1.75, 0.45, { ground: 'open' })));
        const sg = spots(sz);
        const zD = sg != null ? sz + sg * 1.75 : null;
        const steamers = [];
        const bolts = zD != null && flip(ctx, 'bolts', 0.45);

        if (zD == null) {
          // ---- no clear ground beside the cars: he stays put and leans on the horn
          B('8 the horn: nobody can get out, everyone leans on the horn', [spd, front]);
          cam.close(spd, { dist: 7, el: 0.1 });
          ctx.sfx('honk'); say(ctx, spd, 'TUUUT!', { size: 18, color: '#ffd166' });
          yield* wait(0.6);
          ctx.sfx('honk'); say(ctx, front, 'TUUUT!', { size: 18, color: '#ffd166' });
          yield* wait(0.6);
          ctx.sfx('honk'); say(ctx, rear, 'TUUUT!', { size: 18, color: '#ffd166' });
          ctx.news('Speeder boxed in on ' + ctx.st.name + '; all three drivers sound their horns, nobody moves');
          yield* wait(1.4);
          steamers.push(R.run(steam(ctx, spd)));
        } else {
          const driver = makePerson(rnd, { kind: 'hoodie' }), cop = makePerson(rnd, { kind: 'cop' });
          // ---- 8. the driver climbs out, hands up; a cop gets out of the car behind
          B('8 the driver climbs out, hands up, and a cop gets out behind him', [spd, rear]);
          cam.ground(pt(sx, sz + sg * 0.9), { dist: 7, az: 0.2 });
          yield* wait(0.3);
          R.run(emerge(ctx, R, cop, rear, rear.g.position.x, zD + sg * 0.1));
          yield* emerge(ctx, R, driver, spd, sx, zD);
          driver.heading = Math.atan2(rear.g.position.x - sx, 0.001); driver.arms = 'up'; driver.mood = 'sad';
          driver.squash(0.2);
          yield* wait(0.5);
          if (!bolts) {
            // ---- 8a. the ticket
            B('9 the ticket: a cop writes, with a flourish, and the ticket goes on the windscreen', [driver, cop]);
            cam.two(driver, cop, { az: 0.15 });
            cop.hold(item.pad()); cop.arms = 'write'; cop.mood = 'smug';
            cop.lookAt = driver; driver.lookAt = cop;
            yield* wait(0.4);
            say(ctx, driver, 'ik kan het uitleggen...', { size: 13, color: '#fff' });
            const cx = sx + (rear.g.position.x > sx ? 1.3 : -1.3);
            yield* go(ctx, cop, cx, zD + sg * 0.1, 2.6, 0.06);
            cop.heading = Math.atan2(sx - cop.g.position.x, 0.001);
            say(ctx, cop, 'PAPIEREN.', { size: 15, color: '#7db8ff' });
            yield* wait(1.0);
            cop.arms = 'point';
            cop.squash(0.2);
            const tk = R.add(item.ticket());
            tk.position.set(cop.g.position.x, 1.2, cop.g.position.z);
            const wx = spd.g.position.x + Math.sin(spd.g.rotation.y) * 0.35, wz = spd.g.position.z;
            yield* arc(tk, wx, 1.0, wz, 0.9, 0.45, 8);
            tk.rotation.order = 'YXZ'; tk.rotation.y = spd.g.rotation.y; tk.rotation.x = 0.8;
            ctx.sfx('thud'); ctx.shake(0.1);
            ctx.fx.text('BON! €1.249', at(spd.g.position.x, 2.7, spd.g.position.z), { size: 28, color: '#ffd60a' });
            ctx.sfx('womp');
            cop.arms = 'hips'; cop.squash(0.15);
            driver.arms = 'facepalm'; driver.lookAt = null;
            yield* wait(0.6);
            B('9b the face of a man with a ticket', [driver]);
            cam.face(driver);
            yield* wait(0.3);
            ctx.news('Speeder fined €1.249 after a chase of roughly forty metres; "I was in a hurry"');
            yield* wait(1.6);
            cop.lookAt = null; cop.arms = 'swing';
            R.run(sink(ctx, R, cop, rear, sg));
            yield* wait(0.4);
            yield* sink(ctx, R, driver, spd, sg);
          } else {
            // ---- 8b. he bolts on foot, the cop gives chase and gives up
            B('9 the bolt: he runs for it, the cop after him', [driver, cop]);
            cam.track(driver, { dist: 10, el: 0.14, az: 0.6, lead: 2 });
            const away = rear.g.position.x > sx ? -1 : 1; // away from the cop
            say(ctx, cop, 'HALT!', { size: 16, color: '#7db8ff' });
            ctx.sfx('whistle');
            cop.heading = Math.atan2(sx - cop.g.position.x, 0.001);
            driver.arms = 'swing'; driver.mood = 'scared'; driver.lookAt = cop;
            yield* wait(0.5);
            driver.lookAt = null;
            const far = clamp(sx + away * 24, EX0, EX1);
            R.run(R.leave(driver, 6.6, far));
            const caught = yield* chase(ctx, cop, driver, 5.2, 0.9, 2.6);
            cop.arms = 'cover'; cop.mood = 'sad';
            say(ctx, cop, 'ik... kan... niet... meer', { size: 12, color: '#cfe8ff' });
            ctx.news('Speeder escapes on foot; officer "not built for sprinting"');
            yield* wait(1.4);
            B('9b the cop gives up and takes the car as evidence', [cop]);
            cam.close(cop, { dist: 7 });
            cop.arms = 'hips'; cop.mood = 'neutral';
            yield* wait(0.5);
            // the car is evidence: he drives it off himself
            yield* sink(ctx, R, cop, spd, sg);
          }
          steamers.push(R.run(steam(ctx, front)));
        }

        // ---- 10. the convoy leaves in an order that needs no room it does not have
        B('10 the convoy: the front car reverses out, the others follow', [pt(sx, sz)]);
        cam.wide(pt(sx, sz), { dist: 28, el: 0.35, az: dir * 0.3 });
        yield* wait(0.9);
        for (const t of steamers) R.stop(t);
        const out = (c, mv, hold = 0) => (function* () {
          yield* wait(hold);
          if (!c.alive) return;
          // out of view and a few metres beyond: reversing cars cannot use R.out (it drives forward)
          const far = clamp(c.g.position.x + mv * 30, EX0 + 1, EX1 - 1);
          let n = 0;
          yield* dash(ctx, c, far, c.g.position.z, 5.5, { v0: 0.5, ramp: 1.0, back: true, each: () => { if (!watching(ctx) || !seen(ctx, c.g.position.x, c.g.position.z, 1, 0.25)) n += 1; return n > 20; } });
          R.gone(c);
        })();
        const fwdOut = (c, mv, hold = 0) => (function* () {
          yield* wait(hold);
          if (!c.alive) return;
          const far = clamp(c.g.position.x + mv * 30, EX0 + 1, EX1 - 1);
          let n = 0;
          yield* dash(ctx, c, far, c.g.position.z, 9, { v0: 1.5, ramp: 1.2, each: () => { if (!watching(ctx) || !seen(ctx, c.g.position.x, c.g.position.z, 1, 0.25)) n += 1; return n > 20; } });
          R.gone(c);
        })();
        // the front car faces the speeder: it backs away along the line the speeder faces
        const fm = f > 0 ? 1 : -1;
        R.run(out(front, fm, 0.2));
        if (mode === 'reverse') {
          // the speeder and the car behind it follow once the front car is out of the way
          R.run((function* () { yield* wait(3.4); yield* fwdOut(spd, fm); })());
          R.run((function* () { yield* wait(4.4); yield* fwdOut(rear, fm); })());
        } else {
          R.run(fwdOut(rear, -fm, 0.6));            // tail to tail: it simply drives off the other way
          R.run((function* () { yield* wait(3.4); yield* fwdOut(spd, fm); })());
        }
        yield* wait(0.5);

        // ---- 11. epilogue: quiet street, a single hubcap wobbles to a stop
        if (hub.visible) {
          B('11 epilogue: the street is quiet, the hubcap wobbles to a stop', [hub]);
          cam.ground(hub, { dist: 5.5, az: -dir * 0.4 });
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
        }
        B('12 the last shot: the empty street', [pt(ox, zc)]);
        cam.wide(pt(ox, zc), { dist: 34, el: 0.35, az: 0.4 });
        ctx.stageMode && ctx.stageMode('watch');
        yield* wait(1.8); // (the camera lets go; the rig drives the cars on out of the frame)
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
