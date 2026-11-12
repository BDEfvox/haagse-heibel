// Road accident: the fender bender
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

  /** Speed profile for drive(): hold v0, then ease down to v1 over the last part of the line (the nose dives as it brakes). */
  const braking = (v0, from, v1) => (u) => (u < from ? v0 : lerp(v0, v1, (u - from) / (1 - from)));

  const HALF = 1.03; // half a car body plus a hand: what a driving line must keep clear either side
  const SPAN = 17;   // the scene plays between -SPAN and +SPAN around the stage centre

  /** A straight run along a line that has been measured clear, at v(u) m/s (u = progress 0..1), the nose diving as it brakes. */
  function* run1(ctx, car, x1, z1, v, o) {
    const p = car.g.position, x0 = p.x, z0 = p.z, D = Math.hypot(x1 - x0, z1 - z0);
    if (D < 0.05) return;
    car.heading = Math.atan2(x1 - x0, z1 - z0);
    let s = 0;
    while (s < D - 0.02) {
      const dt = yield;
      const sp = typeof v === 'function' ? v(s / D) : v;
      s = Math.min(D, s + sp * dt);
      p.x = x0 + ((x1 - x0) * s) / D; p.z = z0 + ((z1 - z0) * s) / D; p.y = 0;
      car.moving = sp;
      if (o && o.each && o.each(dt, s / D) === true) break;
    }
    car.moving = 0;
  }
  /** `drive` with a way out: when drive finds no line it does not move, so the car takes the measured straight line instead. */
  function* driveOr(ctx, car, x1, z1, v, o) {
    const ok = yield* drive(ctx, car, [[x1, z1]], v, o);
    if (ok === false) yield* run1(ctx, car, x1, z1, v, o);
  }
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
    yield* go(ctx, a, p.x, p.z + side * 1.15, 3.4);
    ctx.sfx('door');
    a.air = true; a.pose = null;
    const x0 = a.g.position.x, z0 = a.g.position.z, y0 = a.g.position.y;
    yield* tween(0.45, (u) => { a.g.position.set(lerp(x0, p.x, u), lerp(y0, -0.55, u), lerp(z0, p.z, u)); });
    R.gone(a);
  }

  return {
    w: [0, 1.2, 2, 2, 2], crime: 1, lock: 'road',
    avail: (ctx) => (ctx.L.kind !== 'ped' || ctx.L.hw >= 3.4) && ctx.L.hw >= 2.0 && S.laneFor(ctx, 1, -SPAN, SPAN, HALF) != null, // (laneFor itself wants road under the whole line)
    stage: { road: { len: 2 * SPAN } },
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'fenderBender'), B = beatsFor(ctx, 'fenderBender'), R = rig(ctx);
      const ox = ctx.stage ? ctx.stage.x : 0, laneS = ctx.stage ? ctx.stage.lane : null; // read before the first yield
      let done = false;
      try {
        const dir = rnd.sign();
        yield* R.close();
        // the line all three cars drive in: the stage's free one, else the nearest free line to the street's own
        const z = laneS != null && S.laneClear(ctx, laneS, ox - SPAN, ox + SPAN, HALF) ? laneS : S.laneFor(ctx, dir, ox - SPAN, ox + SPAN, HALF);
        if (z == null) return;
        // the people's line beside the cars: the side with clear ground along the whole row
        const sgn = [z > 0 ? -1 : 1, z > 0 ? 1 : -1].find((g) => [-9, -6, -3, 0, 3, 6].every((d) => S.clearSpot(ctx, ox + d, z + g * 1.6, 0.4, { ground: 'open' }))) ?? (z > 0 ? 1 : -1);
        const sz = z + sgn * 1.6;
        const a = makeCar(rnd, 'car', L.night), b = makeCar(rnd, rnd.chance(0.3) ? 'taxi' : 'car', L.night), c3 = makeCar(rnd, 'car', L.night);
        const xs = ox + dir * rnd.range(1, 5), x0 = clamp(ox - dir * 13, EX0 + 1, EX1 - 1), x1 = clamp(ox + dir * 17, EX0 + 1, EX1 - 1);
        const heading = dir > 0 ? E : W, gap = a.len + 0.2, bx = xs - dir * gap, ix = xs - dir * (gap / 2); // bumper to bumper (cars are 4.4 m long)
        // a line for passing police cars: free along the street and at least 2.4 m from the one the stopped cars stand in (null: none comes)
        const passLine = () => { const lim = Math.max(0, L.hw - 0.95); for (let q = -lim; q <= lim + 1e-6; q += 0.2) if (Math.abs(q - z) >= 2.4 && S.laneClear(ctx, q, ox - SPAN, ox + SPAN, HALF)) return +q.toFixed(2); return null; };
        const zIn = passLine(), zOut = zIn;
        const spot = pt(xs - dir * 1.5, z);

        // ---- 1. the pigeon: it flies in from beyond the frame and lands in the lane, in no hurry
        const bkind = rnd.pick(['pigeon', 'gull']), BN = bkind === 'gull' ? 'MEEUW' : 'DUIF', bn = bkind === 'gull' ? 'meeuw' : 'duif';
        const bird = makeBird(rnd, bkind);
        const px = xs + dir * 3.9, lq = spotNear(ctx, px - dir * 1.5, z - sgn * 1.4, 0.3), landZ = lq.z;
        bird.fly = true; bird.air = true;
        let bsx = clamp(px - dir * 14, EX0 + 1, EX1 - 1);
        for (let d = 14; d <= 30 && seen(ctx, bsx, landZ, 6, 0.15) && watching(ctx); d += 2) bsx = clamp(px - dir * d, EX0 + 1, EX1 - 1);
        R.spawn(bird, bsx, landZ, 6);
        const lookX = pt(px, z);
        B('1 the ' + bn + ' flies in and lands in the lane', [lookX]);
        cam.wide(spot, { dist: 20 });
        yield* fly(bird, lq.x - dir * 1.5, 0.3, landZ, 8);
        yield* fly(bird, lq.x, 0, landZ, 3.5);
        bird.fly = false; bird.air = false; bird.g.position.y = 0;
        bird.face(dir > 0 ? W : E);
        B('1b the ' + bn + ' wanders into the lane', [bird, lookX]);
        cam.ground(bird, { dist: 5.5, az: dir * 0.5, cut: 0.6 });
        yield* wait(0.3);
        yield* go(ctx, bird, px, z, 2.2);
        yield* hop(bird, 0.1, 0.16); yield* wait(0.3); // pecking at nothing

        // ---- 2. car A rolls up, its driver on the phone
        B('2 car A rolls up, the driver is on his phone', [a]);
        yield* R.enter(a, x0, z, 0, { dir, speed: 10 });
        a.face(heading);
        cam.chase(a, dir, { dist: 7.5 });
        say(ctx, a, '*appje*', { size: 13, color: '#cfe8ff' });
        yield* wait(0.4);
        const dA = Math.abs(xs - a.g.position.x);
        const brakeFrom = clamp(1 - 6.5 / dA, 0.4, 0.85);
        let braked = false;
        yield* driveOr(ctx, a, xs, z, braking(8.5, brakeFrom, 0.7), {
          each: (dt, u) => { if (!braked && u > brakeFrom) { braked = true; ctx.sfx('skid'); ctx.shake(0.12); say(ctx, a, 'EEN ' + BN + '!', { size: 14, color: '#fff' }); } },
        });
        a.jolt(0.5); // the nose dips as he stops

        // ---- 3. nose to beak: he honks, the pigeon does not budge
        B('3 car A stops for the pigeon; the pigeon holds its ground', [a, bird]);
        cam.shot({ on: [a, bird], fit: true, dist: 8, el: 0.05, az: dir * 1.1, y: 0.5, cut: 0.4 });
        yield* wait(0.4);
        ctx.sfx('honk'); say(ctx, a, 'TUUT', { size: 13, color: '#ffd166' });
        bird.face(dir > 0 ? W : E);
        yield* wait(0.4);
        bird.face(0);
        yield* hop(bird, 0.15, 0.2);
        say(ctx, bird, 'rrrk', { size: 11, color: '#cfe8ff' });
        yield* wait(0.5);

        // ---- 4. car B closes in, radio loud, driver singing along
        B('4 car B bears down, radio on', [b]);
        yield* R.enter(b, x0, z, 0, { dir, speed: 12 });
        b.face(heading);
        cam.nose(b, dir, { dist: 8 });
        say(ctx, b, '♪ la la la ♪', { size: 12, color: '#cfe8ff' });
        yield* wait(0.4);
        const dB = Math.abs(bx - b.g.position.x);
        let near = false, slowed = false;
        yield* driveOr(ctx, b, bx, z, braking(10, 0.55, 5.5), {
          each: (dt, u) => {
            const left = dB * (1 - u);
            if (!near && left < 7.5) {
              near = true;
              B('5 the bump: both cars in one frame', [a, b]);
              cam.shot({ on: [a, b], fit: true, dist: 11, el: 0.06, az: dir * 1.2, y: 0.6, cut: 0.2 });
            }
            if (near && !slowed && left < 5) { slowed = true; ctx.slowmo(0.2, 1.6); }
            if (left < 2.6 && !b._brk) { b._brk = true; say(ctx, b, '!!', { size: 18, color: '#fff' }); ctx.sfx('skid'); }
          },
        });

        // ---- 5. the bump, in slow motion. Bumpers fall off, steam rises, a horn gives up
        ctx.sfx('slam'); ctx.shake(0.5);
        b.jolt(0.8); a.jolt(0.6);
        cam.freeze(0.5);
        ctx.fx.text('BONK!', at(ix, 2.6, z), { size: 30, color: '#ffd60a' });
        ctx.fx.burst(ix, 0.7, z, { n: 16, colors: ['#ddd', '#888', '#ff3b3b', '#ffd166'], speed: 5, up: 6, size: [0.08, 0.2] });
        ctx.fx.sparks(ix, 0.8, z, 10);
        ctx.incident();
        a.hazard = b.hazard = true;
        R.run(go(ctx, a, xs + dir * 0.5, z, 4));
        const bumps = [];
        for (const k of [1, -1]) {
          const bm = R.add(item.bumper());
          bm.position.set(ix, 0.45, z);
          bumps.push(bm);
          const lx = ix + k * dir * rnd.range(0.8, 2.0), lz = z + sgn * 1.3; // on the ground beside the cars, on the side the drivers will stand
          R.run((function* () {
            yield* arc(bm, lx, 0.05, lz, 1.7, 0.9, k * 7);
            ctx.sfx('clatter');
            yield* arc(bm, lx + k * dir * 0.5, 0.05, lz, 0.35, 0.3, k * 1.5);
          })());
        }
        const smoke = R.run((function* () { for (;;) { ctx.fx.smoke(b.g.position.x + dir * 2.1, 1.15, z, 2, ['#888', '#666'], 0.4); yield* wait(0.2); } })());
        ctx.sfx('honk'); say(ctx, b, 'TUUUT!', { size: 15, color: '#ffd166' });
        yield* wait(0.9);

        // ---- 6. the debris: bumpers on the tarmac, steam from the bonnet
        B('6 two bumpers lie in the road, steam rises', [bumps[0], bumps[1], b]);
        cam.ground(pt(ix, z), { dist: 8, az: dir * 0.9, fit: true, cut: 0.5 });
        yield* wait(1.0);
        if (lv >= 4) R.panic(xs, 14, 3);
        ctx.news(`Fender-bender on ${ctx.st.name}. Both drivers "had right of way"`);

        // ---- 7. the culprit: the pigeon, unbothered
        B('7 the ' + bn + ', the culprit, unbothered', [bird]);
        bird.face(0);
        cam.hero(bird, { dist: 4.5, cut: 0.4 });
        cam.card('DE ' + BN, bkind === 'gull' ? 'Wanted a chip. Caused everything.' : 'Did nothing. Caused everything.', 1.9);
        yield* wait(0.4);
        say(ctx, bird, 'rrrk', { size: 11, color: '#cfe8ff' });
        yield* hop(bird, 0.12, 0.2);
        yield* wait(0.9);

        // ---- 8. the argument: out of the cars, fists up
        const d1 = makePerson(rnd, {}), d2 = makePerson(rnd, {});
        B('8 both drivers jump out and start shouting', [d1, d2]);
        yield* all(emerge(ctx, R, d1, a, a.g.position.x, sz), emerge(ctx, R, d2, b, b.g.position.x, sz));
        d1.heading = dir > 0 ? W : E; d2.heading = dir > 0 ? E : W;
        d1.arms = d2.arms = 'fist'; d1.mood = d2.mood = 'angry';
        d1.lookAt = d2; d2.lookAt = d1;
        cam.two(d1, d2, { dist: 10, el: 0.1 });
        ctx.sfx('pop');
        const crowd = gather(ctx, R, xs, 2, 14);
        for (const g of crowd) filmIt(g, xs - dir * 1.5, sz);
        yield* wait(0.9);
        const lines = ['KIJK UIT JE DOPPEN!', 'JIJ REMDE ZOMAAR!', 'ER LIEP EEN ' + BN + '!', 'EEN ' + BN + '?!'];
        for (let i = 0; i < 4; i += (i === 1 ? 2 : 1)) {
          const sp = i % 2 ? d1 : d2, other = i % 2 ? d2 : d1;
          if (i % 2) cam.ots(d1, d2, { cut: 0.3 }); else cam.ots(d2, d1, { cut: 0.3 });
          yield* wait(0.3);
          sp.arms = 'point'; other.arms = 'fist';
          yell(ctx, sp, lines[i], i % 2 ? '#ffb4a2' : '#ff6b6b', 14);
          faceTo(sp, other.g.position.x, sz);
          if (i === 3) other.emote('shock', 1.0);
          yield* hop(sp, 0.18, 0.2);
          yield* wait(0.5);
        }
        d1.lookAt = d2.lookAt = null;

        // ---- 9. escalation: each fetches a bumper
        const b1 = bumps[0], b2 = bumps[1];
        B('9 each driver fetches a bumper', [d1, d2, b1, b2]);
        cam.two(d1, d2, { dist: 12, el: 0.12, fit: true });
        yield* wait(0.4);
        d1.arms = d2.arms = 'swing';
        yield* all(go(ctx, d1, b1.position.x, sz, 4.5), go(ctx, d2, b2.position.x, sz, 4.5));
        R.rm(b1); R.rm(b2);
        d1.hold(item.bumper()); d2.hold(item.bumper());
        d1.arms = d2.arms = 'hold'; d1.mood = d2.mood = 'sly';
        yell(ctx, d1, 'EN DIE DEUK DAN?!', '#ff6b6b', 13);
        yield* wait(0.5);

        // ---- 10. the duel (a third car is already on its way, honking; and a cop, whistling, is on his)
        const c3In = R.run((function* () { yield* wait(1.2); ctx.sfx('honk'); yield* R.enter(c3, x0, z, 0, { dir, speed: 11 }); c3.face(heading); })());
        B('10 the bumper duel', [d1, d2]);
        cam.dutch([d1, d2], { dist: 7.5, fit: true, az: dir * 0.2, cut: 0.4 });
        yield* wait(0.3);
        yield* all(go(ctx, d1, xs - dir * 0.2, sz, 4), go(ctx, d2, xs - dir * 1.4, sz, 4));
        faceTo(d1, d2.g.position.x, sz); faceTo(d2, d1.g.position.x, sz);
        for (let i = 0; i < 3; i++) {
          ctx.sfx('bonk'); ctx.fx.sparks(xs - dir * 0.8, 1.1, sz, 6); ctx.fx.text('KLANG!', at(xs - dir * 0.8, 2.3, sz), { size: 18, color: '#ffd60a' });
          d1.squash(0.15); d2.squash(0.15);
          yield* all(hop(d1, 0.25, 0.28), hop(d2, 0.25, 0.28));
          yield* wait(0.1);
        }

        // ---- 11. a third car, honking, who also did not see anything
        let cop = lv >= 3 ? makePerson(rnd, { kind: 'cop' }) : null;
        // the cop is on his way before anybody needs him: a whistle, then he runs in from out of the frame while driver three shouts
        const copIn = cop ? R.run((function* () { yield* wait(3.0); if (T.entryTime(ctx, cop, clamp(xs + dir * 8, EX0, EX1), sz, { speed: 5.5, dir: -dir }) > 4) { cop = null; return; } /* (too far to come on cue: the driver brings the form instead) */ ctx.sfx('whistle'); yield* R.enter(cop, clamp(xs + dir * 8, EX0, EX1), sz, undefined, { speed: 5.5, dir: -dir }); })()) : null;
        B('11 a third car comes honking', [pt(xs - dir * 9, z)]);
        d1.lookAt = d2.lookAt = pt(xs - dir * 9, z);
        yield* waitUntil(() => c3In.done, 8);
        d1.lookAt = d2.lookAt = c3;
        cam.nose(c3, dir, { dist: 8 });
        ctx.sfx('honk'); say(ctx, c3, 'HÉ! DOORRIJDEN!', { size: 13, color: '#ffd166' });
        R.discard(d1); R.discard(d2);
        d1.arms = d2.arms = 'stop'; d1.mood = d2.mood = 'scared';
        yield* wait(0.9);
        const tx = b.g.position.x - dir * (b.len + 0.1), dC = Math.abs(tx - c3.g.position.x);
        let nearC = false;
        yield* driveOr(ctx, c3, tx, z, braking(11, 0.55, 5), {
          each: (dt, u) => {
            if (!nearC && dC * (1 - u) < 6.5) {
              nearC = true;
              B('12 the second bump: B shoved into A', [c3, b, a]);
              cam.shot({ on: [a, b, c3], fit: true, dist: 12, el: 0.06, az: dir * 1.2, y: 0.6, cut: 0.2 });
            }
          },
        });
        ctx.sfx('slam'); ctx.shake(0.4);
        c3.jolt(0.9); b.jolt(0.6); a.jolt(0.4);
        c3.hazard = true;
        ctx.fx.text('TIK!', at(tx + dir * (b.len / 2), 2.4, z), { size: 22, color: '#ffd60a' });
        ctx.fx.sparks(tx + dir * (b.len / 2), 0.8, z, 6);
        R.run(go(ctx, b, b.g.position.x + dir * 0.5, z, 4));
        R.run(go(ctx, a, a.g.position.x + dir * 0.5, z, 4)); // the shove goes down the whole line together: the gaps between them stay as they were
        R.run((function* () { yield* wait(0.2); ctx.sfx('slam'); a.jolt(0.3); })());
        yield* wait(0.3);
        d1.lookAt = d2.lookAt = null;
        yield* all(doubleTake(ctx, d1, 'NOG EEN?!'), doubleTake(ctx, d2, 'WAT NU?!'));
        d1.mood = d2.mood = 'shock';
        const d3 = makePerson(rnd, { kind: rnd.chance(0.4) ? 'chef' : 'civ' });
        B('13 driver three storms out', [c3, d1, d2]);
        cam.close(c3, { dist: 6, cut: 0.3 });
        yield* emerge(ctx, R, d3, c3, c3.g.position.x, sz);
        d3.arms = 'fist'; d3.mood = 'angry'; d3.heading = dir > 0 ? E : W;
        yell(ctx, d3, 'JULLIE STONDEN STIL!', '#ffb4a2', 13);
        d1.arms = d2.arms = 'fist';
        yield* wait(1.0);
        R.stop(smoke);

        // ---- 14. paperwork
        let clip = null;
        B('14 the form: somebody brings paper', [cop ? pt(xs + dir * 2.6, sz) : d1]);
        if (cop) {
          cam.track(pt(xs + dir * 5, sz), { dist: 9, lead: 1 });
          yield* waitUntil(() => copIn.done, 10);
          yield* go(ctx, cop, xs + dir * 2.6, sz, 5.5);
          cop.heading = dir > 0 ? W : E;
          cop.mood = 'focus';
          say(ctx, cop, 'RUSTIG! FORMULIERTJE INVULLEN.', { size: 13, color: '#7db8ff' });
          clip = cop.hold(item.paper());
          cop.arms = 'hold';
        } else {
          cam.close(d1, { dist: 6 });
          d1.mood = 'sad';
          say(ctx, d1, 'Zullen we... het formulier?', { size: 12, color: '#cfe8ff' });
          clip = d1.hold(item.paper());
          d1.arms = 'hold';
        }
        d1.arms = d2.arms = d3.arms = 'swing'; d1.mood = d2.mood = d3.mood = 'sad';
        yield* wait(0.6);
        ctx.fx.text('SCHADEFORMULIER ✎', at(xs - dir * 1.3, 2.4, sz), { size: 13, color: '#fff' });
        ctx.sfx('coin');
        yield* wait(0.6);

        // ---- 15. a gust of wind: the form takes off
        B('15 a gust: papers everywhere', [d1, d2, d3, spot]);
        const src = cop || d1;
        R.discard(src);
        cam.high(spot, { dist: 18, el: 0.55, cut: 0.3 });
        yield* wait(0.3);
        ctx.fx.text('FWOEF!', at(xs, 3.2, sz), { size: 24, color: '#e8f7ff' });
        ctx.sfx('whoosh');
        ctx.fx.dust(xs - dir * 4, 0.4, sz, dir * 6, 0, 10);
        const dest = [], sheets = [];
        for (let i = 0; i < 6; i++) {
          const pp = R.add(item.paper());
          pp.position.set(src.g.position.x, 1.0, src.g.position.z);
          sheets.push(pp);
          const q = [xs + rnd.range(-5, 5), 0.03, z + rnd.range(-2.2, 2.2)];
          dest.push(q);
          R.run(arc(pp, q[0], q[1], q[2], rnd.range(1.5, 3), rnd.range(1.1, 1.7), rnd.range(-9, 9)));
        }
        for (const g of [d1, d2, d3]) { g.mood = 'shock'; g.lookAt = pt(xs, z); }
        yield* wait(1.4);

        // ---- 16. everybody goes for the same sheet
        const target = dest[0], other = dest[1];
        B('16 three people, one sheet of paper', [d1, d2, d3, pt(target[0], sz)]);
        cam.two(d1, d2, { dist: 12, fit: true, cut: 0.3 });
        for (const g of [d1, d2, d3]) { g.arms = 'up'; g.lookAt = null; g.mood = 'focus'; }
        yield* wait(0.5);
        yield* all(
          goEach(ctx, d1, target[0] - dir * 0.5, sz, 5.5),
          goEach(ctx, d2, target[0] + dir * 0.5, sz, 5.5),
          goEach(ctx, d3, other[0], sz, 5.5),
        );
        ctx.sfx('bonk'); ctx.shake(0.25);
        ctx.fx.text('BONK!', at(target[0], 2.2, sz), { size: 24, color: '#ffd60a' });
        R.rm(sheets[1]);
        d3.hold(item.paper()); d3.arms = 'wave'; d3.mood = 'smug';
        R.run(all(tumble(ctx, d1, target[0] - dir * 1.8, sz), tumble(ctx, d2, target[0] + dir * 1.8, sz)));
        say(ctx, d3, 'GOT IT!', { size: 15, color: '#b9fbc0' });
        R.run(laugh(ctx, d3, 1.4, 'he'));
        yield* wait(0.7);
        R.run(seeStars(ctx, d1, 1.2)); R.run(seeStars(ctx, d2, 1.2));
        yield* wait(0.7);
        yield* all(getUp(d1, 'sad'), getUp(d2, 'sad'));

        // ---- 17. the pigeon strolls through the middle of the circle. Level decides how it all ends
        B('17 the pigeon strolls through the circle', [bird, d1, d2]);
        cam.close(bird, { cut: 0.4 });
        const pace = R.run(go(ctx, bird, xs - dir * 1.5, sz, 2));
        yield* wait(0.9);
        say(ctx, bird, 'rrrk', { size: 11, color: '#cfe8ff' });
        ctx.sfx('squawk');
        d1.lookAt = d2.lookAt = d3.lookAt = bird;
        if (lv >= 4) {
          if (zIn != null) R.run(R.police(-dir, zIn, 10, 0.2));
          if (lv >= 5 && zOut != null) R.run(R.police(dir, zOut, 12, 1.2));
        }
        d1.arms = d2.arms = d3.arms = 'swing';
        yield* wait(0.5);
        if (cop) {
          cop.mood = 'smug';
          say(ctx, cop, 'Dank u. De ' + bn + ' is getuige.', { size: 12, color: '#7db8ff' });
        } else {
          say(ctx, d1, 'sorry', { size: 12, color: '#cfe8ff' });
          say(ctx, d2, 'ook sorry', { size: 12, color: '#cfe8ff' });
        }
        d1.mood = d2.mood = d3.mood = 'happy';

        // ---- 18. the limping convoy leaves, hazards blinking: the first car pulls away, then the camera lets go and the rig drives the rest off
        B('18 everybody gets back in, hazard lights blinking', [a, b, c3]);
        cam.wide(spot, { dist: 22, cut: 0.6 });
        yield* wait(0.5);
        R.stop(pace);
        d1.lookAt = d2.lookAt = d3.lookAt = null;
        R.run((function* () { // the culprit leaves over the roofs
          bird.fly = true; bird.air = true;
          yield* fly(bird, xs - dir * 3, 6, sz - 3, 6);
          yield* fly(bird, xs - dir * 3 - dir * 14, 9, sz - 3, 7);
          R.gone(bird);
        })());
        if (cop) R.run(R.away(cop, dir * 7, 6));
        for (const g of crowd) R.give(g); // the onlookers go back to the street
        yield* all(sink(ctx, R, d1, a, sgn), sink(ctx, R, d2, b, sgn), sink(ctx, R, d3, c3, sgn)); // everybody gets back in
        ctx.fx.smoke(b.g.position.x, 0.5, z, 5, ['#888', '#666'], 0.4);
        ctx.sfx('honk');
        R.run(driveOr(ctx, a, x1, z, (u) => 1.5 + 7.5 * Math.min(1, u * 3))); // squats under power, then out: the rig takes them on out of the frame
        yield* wait(0.3);
        R.run(driveOr(ctx, b, x1, z, (u) => 1.5 + 7.5 * Math.min(1, u * 3)));
        yield* wait(0.6);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
