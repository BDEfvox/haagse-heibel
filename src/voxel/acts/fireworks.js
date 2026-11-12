// Illegal fireworks in a bin: a rocket bigger than his sense, a fuse that goes out, and a lid that comes back down.
// Storyboard: storyboards/fireworks.md. Every B(...) below is one beat of it, with who must be on screen.
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

  const TOP = 0.95; // top of the bin
  // the rocket: about 1.1 m, origin at the bottom of its stick
  const bigRocket = () => sculpt((v) => {
    v.box(0, 0, 0, 0.04, 0.5, 0.04, '#b08550'); // stick
    v.box(0, 0.3, 0, 0.17, 0.5, 0.17, '#e63946'); // body
    v.box(0, 0.5, 0, 0.18, 0.07, 0.18, '#ffffff'); // band
    v.box(0, 0.8, 0, 0.13, 0.14, 0.13, '#ffd60a'); // cone
    v.box(0, 0.94, 0, 0.07, 0.12, 0.07, '#ffd60a');
    v.box(0, 0.3, 0, 0.3, 0.1, 0.03, '#c1121f'); // fins
    v.box(0, 0.3, 0, 0.03, 0.1, 0.3, '#c1121f');
  });
  const binLid = () => sculpt((v) => {
    v.box(0, 0, 0, 0.6, 0.07, 0.6, '#1f5a38');
    v.box(0, 0.07, 0, 0.18, 0.05, 0.08, '#2e7d4f');
  });

  /** A cheap lighter: red body, a glowing flame on top. */
  const mkLighter = () => piece((v, gl) => { v.box(0, 0, 0, 0.05, 0.11, 0.03, '#d90429'); gl.box(0, 0.11, 0, 0.035, 0.06, 0.035, '#ffd60a'); });

  return {
    w: [0, 0, 0.6, 2, 2.5], crime: 1, need: ['bins'],
    // a bin, with 12 m of pavement along it for the lad, his mates, and the cop to stand about on
    stage: { pave: { side: 'any', len: 12, depth: 1.6 }, anchor: 'bin', reach: 10 },
    *run(ctx) {
      const stageX = ctx.stage ? ctx.stage.x : 0; // (read before the first yield)
      const { L, rnd } = ctx, cam = camFor(ctx, 'fireworks'), B = beatsFor(ctx, 'fireworks'), R = rig(ctx);
      if (!L.bins || !L.bins.length) return;
      const bin = L.bins.slice().sort((p, q) => Math.abs(p.x - stageX) - Math.abs(q.x - stageX))[0], dir = bin.x > 0 ? 1 : -1; // the lad comes from the middle of the street
      const stand = S.findSpot(ctx, bin.x, bin.z + 1.2, 0.5, 8, { ignore: [bin] }) || spotNear(ctx, bin.x, bin.z + 1.2), sx = stand.x, sz = stand.z;
      const binPt = pt(bin.x, bin.z), sky = pt(bin.x, bin.z);
      const ex = clamp(sx - dir * 5, EX0, EX1), retreat = (k) => clamp(sx - dir * k, EX0, EX1);
      let done = false;
      try {
        const lad = makePerson(rnd, { kind: 'hoodie', scale: 1.05 });
        const m1 = makePerson(rnd, { kind: 'hoodie' }), m2 = makePerson(rnd, { kind: 'hoodie' });
        const rocket = bigRocket(), lid = R.add(binLid());
        lid.position.set(bin.x, TOP, bin.z);
        let launched = false;

        // ---- 1. the plan: sneaking up to the bin with a huge rocket, two mates filming behind him (all three walk in from out of the frame)
        B('1 the plan: the bin on the pavement, a lad with a huge rocket sneaks up on it', [binPt]);
        cam.wide(binPt, { dist: 11, el: 0.3, az: -dir * 0.3 }); // (tight on the bin: the frame's edge is a few metres away, so the lad is in the picture almost at once)
        lad.ignore = [bin]; m1.ignore = [bin]; m2.ignore = [bin];
        lad.hold(rocket, 'front'); rocket.position.set(0.12, 0.35, 0.5);
        lad.arms = 'carry'; lad.gait = 'sneak'; lad.mood = 'sly';
        const arrived = new Set();
        const comeIn = (a, k, delay, jit) => R.run((function* () {
          yield* waitUntil(() => T.seen(ctx, ex, sz) && !T.seen(ctx, sx - dir * 17, sz), 2); // (the tight shot is up before anybody walks into it)
          yield* wait(delay);
          yield* R.enter(a, clamp(ex - dir * k, EX0, EX1), sz + jit, undefined, { speed: 3.6 });
          arrived.add(a);
        })());
        const ladTask = comeIn(lad, 0, 0, 0); comeIn(m1, 1.5, 0.5, rnd.range(-0.2, 0.3)); comeIn(m2, 2.6, 1.0, rnd.range(-0.2, 0.3));
        yield* waitUntil(() => ladTask.done, 40);
        for (const m of [m1, m2]) { m.hold(item.phone()); m.arms = 'hold'; m.lookAt = lad; m.mood = 'happy'; }
        B('1b the plan: two mates follow with phones up', [lad, binPt]);
        cam.track(lad, { dist: 9, el: 0.12, az: -dir * 0.5, lead: 1.4, cut: 1.0 });
        const follow = (m, k) => R.run((function* () {
          yield* waitUntil(() => arrived.has(m), 20);
          yield* go(ctx, m, retreat(k), sz + 0.2, 2.2);
          m.lookAt = binPt;
        })());
        follow(m1, 3.3); follow(m2, 4.6);
        yield* wait(0.3);
        yield* go(ctx, lad, sx, sz, 2.6);
        faceTo(lad, bin.x, bin.z);
        lad.lookAt = null;
        yield* wait(0.3);

        // ---- 2. the reveal: grin to camera, rocket held up like a trophy
        B('2 reveal: the grin, the rocket held up like a trophy', [lad]);
        lad.gait = 'walk'; lad.heading = 0; lad.mood = 'smug';
        cam.hero(lad, { hold: 3.2 });
        cam.card('DE VUURWERKBENDE', 'Rocket: huge. Plan: a bin.', 2.1);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        yield* tween(0.4, (u) => { rocket.position.y = lerp(0.35, 0.8, u); });
        lad.squash(0.2);
        yield* laugh(ctx, lad, 1.0, 'he');
        yield* tween(0.3, (u) => { rocket.position.y = lerp(0.8, 0.35, u); });

        // ---- 3. the fuse: planted in the bin, lit, everybody backs off with fingers in their ears
        B('3 the fuse: planted in the bin and lit', [binPt, lad]);
        cam.ground(binPt, { dist: 4.6, el: 0.03, az: -dir * 0.5, y: 0.9, cut: 0.6, hold: 4 });
        faceTo(lad, bin.x, bin.z);
        lad.mood = 'focus'; lad.lookAt = binPt;
        yield* wait(0.4);
        lad.drop();
        R.add(rocket);
        rocket.position.set(sx, 1.0, sz - 0.5);
        lad.arms = 'reach';
        ctx.sfx('thud');
        const rx = bin.x, rBase = TOP - 0.35;
        yield* tween(0.5, (u) => { rocket.position.set(lerp(sx, rx, u), lerp(1.0, rBase, u) + Math.sin(u * Math.PI) * 0.25, lerp(sz - 0.5, bin.z, u)); }, ease.outQuad);
        rocket.position.set(rx, rBase, bin.z);
        ctx.fx.dust(bin.x, TOP, bin.z, 0, 0, 3);
        yield* wait(0.3);
        // he takes a lighter out of his pocket and holds the flame to the fuse
        const lighter = mkLighter();
        lad.hold(lighter, 'handL');
        ctx.sfx('tick');
        lad.squash(0.1);
        yield* wait(0.5);
        ctx.sfx('fuse');
        const fuseY = TOP + 0.22;
        ctx.fx.sparks(bin.x + 0.09, fuseY, bin.z, 6);
        const fuse = R.run((function* () { for (;;) { ctx.fx.sparks(bin.x + 0.09, fuseY, bin.z, 2); yield* wait(0.1); } })());
        ctx.stageMode('flee'); // the people about see what he is up to and back off
        yield* wait(0.5);
        lad.drop();
        // he runs back, the mates cover their ears
        lad.lookAt = null; lad.mood = 'scared'; lad.arms = 'swing';
        R.run((function* () {
          yield* go(ctx, lad, retreat(6), sz, 5.5);
          faceTo(lad, bin.x, bin.z);
          lad.pose = 'crouch'; lad.arms = 'cover';
        })());
        for (const [m, k] of [[m1, 7.5], [m2, 9]]) {
          R.run((function* () {
            m.lookAt = binPt; m.mood = 'scared';
            yield* go(ctx, m, retreat(k), sz + 0.2, 4.2);
            faceTo(m, bin.x, bin.z);
            m.arms = 'cover';
            if (m === m2) m.pose = 'crouch';
          })());
        }
        B('3b ears covered: all three backed off', [lad, m1, m2, binPt]);
        cam.wide([lad, m1, m2, binPt], { dist: 15, el: 0.25, az: -dir * 0.3, fit: true, cut: 0.7, hold: 4 });
        yield* wait(1.5);

        // ---- 4. the fizzle: the sparks die, pfff, and he creeps back to look
        B('4 the fizzle: nothing, and he leans over the bin', [lad, binPt]);
        R.stop(fuse);
        ctx.stageMode('watch'); // nothing is happening: the people about creep back to look
        ctx.sfx('womp');
        ctx.fx.puff(bin.x + 0.09, fuseY, bin.z);
        say(ctx, at(bin.x, TOP + 1.5, bin.z), 'pfff...', { size: 16, color: '#cfd8dc' });
        cam.dolly(lad, { dist: 8, el: 0.12, y: 1.4, az: -dir * 0.3, fov: 36, drift: { dist: -1.8 }, fit: true, cut: 0.5, hold: 7 });
        yield* wait(0.7);
        lad.pose = null; lad.mood = 'neutral'; lad.arms = 'shrug'; lad.shakeT = 1;
        for (const m of [m1, m2]) { m.pose = null; m.arms = 'hold'; m.mood = 'happy'; m.lookAt = lad; }
        yield* wait(0.6);
        lad.gait = 'sneak'; lad.mood = 'sly'; lad.arms = 'sneak';
        yield* go(ctx, lad, sx, sz, 2.6);
        lad.gait = 'walk'; lad.arms = 'hips'; lad.mood = 'focus';
        faceTo(lad, bin.x, bin.z);
        yield* wait(0.3);
        // leaning right over the bin, nose at the rocket
        yield* tween(0.6, (u) => { lad.g.rotation.x = -0.75 * u; }, ease.outQuad);
        lad.lookAt = binPt;
        yield* wait(0.6);

        // ---- 5. WHOOSH: it goes off after all
        // who the lid will find: the lad who leans over the bin, or (sometimes) the mate crouching further back
        const wearer = flip(ctx, 'mateLid', 0.3) ? m1 : lad, others = [lad, m1, m2].filter((a) => a !== wearer);
        B('5 WHOOSH: the rocket goes past his nose, the lid flies off', [lad]);
        cam.crash(lad, { hold: 1.5 });
        yield* wait(0.35);
        ctx.sfx('fuse');
        for (let i = 0; i < 4; i++) { ctx.fx.sparks(bin.x + 0.09, fuseY, bin.z, 6); yield* wait(0.05); }
        launched = true;
        ctx.stageMode('flee');
        lad.mood = 'shock'; lad.lookAt = null; lad.arms = 'up';
        ctx.sfx('rocket'); ctx.shake(0.35);
        ctx.fx.text('WHOOOSH!', at(bin.x, 2.4, bin.z), { size: 26, color: '#ffe08a' });
        ctx.fx.smoke(bin.x, TOP, bin.z, 8, ['#e9e9e9', '#bdbdbd'], 0.5);
        // he is blown upright
        R.run((function* () { yield* tween(0.2, (u) => { lad.g.rotation.x = -0.75 * (1 - u); }); lad.g.rotation.x = 0; lad.squash(0.35); })());
        // the lid spins up and away, then comes down exactly where `wearer` is standing
        let landed = false;
        const lidAt = { x: wearer.g.position.x, z: wearer.g.position.z };
        R.run((function* () {
          const a0 = lid.position.clone();
          yield* tween(3.0, (u) => {
            lid.position.set(lerp(a0.x, lidAt.x, u) + Math.sin(u * Math.PI) * 0.8, lerp(a0.y, 1.95, u) + Math.sin(u * Math.PI) * 8, lerp(a0.z, lidAt.z, u));
            lid.rotation.set(u * TAU * 3, u * TAU * 2, u * TAU);
          });
          lid.rotation.set(0, 0, 0);
          R.rm(lid);
          wearer.hold(lid, 'head');
          lid.position.set(0, 0.62, 0);
          landed = true;
        })());
        // the rocket itself: straight up out of the bin (a camera at the foot of the street follows it)
        const top = rnd.range(11, 13), rpt = { x: rx, z: bin.z, y: rBase };
        const flight = R.run(tween(1.3, (u) => {
          const y = rBase + u * (top - rBase);
          rpt.x = rx + Math.sin(u * 9) * 0.12 * u; rpt.y = y; rpt.z = bin.z;
          rocket.position.set(rpt.x, y, rpt.z);
          rocket.rotation.y = u * TAU * 2;
          ctx.fx.sparks(rpt.x, y, rpt.z, 2);
        }, ease.inQuad));
        yield* wait(0.6);
        B('5b the rocket climbs out of the bin and bursts high above the street', [rpt]);
        cam.shot({ on: rpt, dist: 13, el: -0.14, fov: 56, cut: 0.4, hold: 4 });
        yield* waitUntil(() => flight.done, 2);
        R.rm(rocket);
        ctx.incident(1);
        ctx.news('Illegal fireworks reported on ' + ctx.st.name + '. It is not even December');
        ctx.sfx('pang');
        ctx.fx.firework(rpt.x, top, bin.z);
        ctx.flash('rgba(255,240,200,0.3)', 0.25);
        ctx.fx.text('PANG!', at(rpt.x, top - 1.2, bin.z), { size: 26, color: '#ffe08a' });
        yield* wait(0.55);
        for (let k = 0; k < 2; k++) {
          const bx = bin.x + rnd.range(-5, 5), bz = bin.z - rnd.range(0, 5), by = rnd.range(9, 12);
          ctx.sfx('pang');
          ctx.fx.firework(bx, by, bz);
          ctx.flash('rgba(255,240,200,0.2)', 0.2);
          ctx.fx.text(rnd.pick(['KNAL!', 'BOEM!', 'FIEEEW!']), at(bx, by - 1.2, bz), { size: 22, color: '#ffe08a' });
          yield* wait(0.5);
        }
        ctx.stageMode('watch'); // the crowd that ran comes back to look
        for (const p of ctx.peds) if (!p.busy && rnd.chance(0.3)) say(ctx, p, 'OOOH!', { size: 12, color: '#fff' });

        // ---- 6. the lid comes down on somebody's head; the cop is already on his way in (out of the picture)
        const cop = makePerson(rnd, { kind: 'cop' }), cx = clamp(lidAt.x + dir * 4.6, EX0, EX1), wz = lidAt.z;
        let copIn = false;
        const copTask = R.run((function* () { yield* R.enter(cop, cx, wz, undefined, { speed: 2.8 }); copIn = true; })());
        B('6 the lid: BONK, right on ' + (wearer === lad ? 'his' : 'a mate\'s') + ' head', [wearer]);
        cam.close(wearer, { dist: 7, y: 1.7, cut: 0.4, hold: 2.4 });
        for (const m of [m1, m2]) { m.mood = 'happy'; m.lookAt = wearer === m ? lad : wearer; }
        yield* waitUntil(() => landed, 4);
        ctx.sfx('bonk'); ctx.shake(0.3);
        ctx.fx.text('BONK!', at(lidAt.x, 2.7, lidAt.z), { size: 30, color: '#ffd60a' });
        ctx.fx.pips(lidAt.x, 2.0, lidAt.z, 8);
        wearer.arms = 'swing'; wearer.mood = 'dizzy'; wearer.pose = null; wearer.squash(0.4);
        R.run(seeStars(ctx, wearer, 2.4));
        yield* wait(0.9);
        B('6b the others fall about laughing', [others[0], others[1]]);
        cam.two(others[0], others[1], { az: dir * 0.2, hold: 2.8 });
        for (const m of others) { m.arms = 'point'; m.pose = null; m.mood = 'happy'; m.lookAt = wearer; }
        ctx.sfx('laugh');
        cackle(ctx, others[0], 2.2, 'ha');
        yield* laugh(ctx, others[1], 2.2, 'ha');

        // ---- 7. the law: the others scatter, the one with the lid over his eyes walks straight into the cop
        yield* waitUntil(() => copTask.done, 40);
        B('7 the law: a cop, the others scatter, the lid-wearer walks into him', [wearer, cop]);
        faceTo(cop, lidAt.x, wz); cop.arms = 'stop'; cop.mood = 'angry';
        ctx.sfx('whistle');
        say(ctx, cop, 'POLITIE!', { size: 16, color: '#7db8ff' });
        cam.wide([wearer, cop], { dist: 15, el: 0.25, az: dir * 0.3, fit: true, cut: 0.5, hold: 3 });
        for (const m of others) {
          m.lookAt = cop; m.arms = 'up'; m.mood = 'scared'; m.pose = null; m.gait = 'walk';
          R.run((function* () {
            yield* wait(rnd.range(0.05, 0.25));
            say(ctx, m, rnd.pick(['WEG!', 'RENNEN!', 'AAH!']), { size: 14, color: '#fff' });
            m.lookAt = null;
            yield* goEach(ctx, m, clamp(m.g.position.x + (m.g.position.x >= cop.g.position.x ? 1 : -1) * 20, EX0, EX1), m.g.position.z + rnd.range(-0.3, 0.3), 7);
            yield* R.out(m);
          })());
        }
        yield* wait(0.9);
        // the lid has slid down over his eyes
        lid.position.set(0, 0.5, 0.1); lid.rotation.x = 0.5;
        wearer.arms = 'reach'; wearer.mood = 'scared'; wearer.lookAt = null; wearer.gait = 'stagger';
        cam.two(cop, wearer, { az: dir * 0.2, cut: 0.4, hold: 3.6 });
        yield* wait(0.3);
        yield* goEach(ctx, wearer, cx - dir * 0.7, wz, 2.6);
        ctx.sfx('thud'); ctx.shake(0.2);
        wearer.squash(0.3); cop.squash(0.2);
        wearer.gait = 'walk'; wearer.arms = 'swing';
        ctx.fx.pips(wearer.g.position.x, 1.8, wz, 4);
        yield* wait(0.5);
        cop.arms = 'reach'; cop.mood = 'smug';
        yield* wait(0.4);
        const lid2 = wearer.drop();
        if (lid2) {
          R.add(lid2);
          lid2.rotation.set(0, 0, 0);
          lid2.position.set(wearer.g.position.x, 1.85, wz);
          yield* tween(0.4, (u) => { lid2.position.set(lerp(wearer.g.position.x, cop.g.position.x, u), lerp(1.85, 1.5, u) + Math.sin(u * Math.PI) * 0.5, wz); });
          R.rm(lid2);
        }
        wearer.mood = 'shock'; wearer.lookAt = cop;
        say(ctx, cop, 'MEEKOMEN.', { size: 18, color: '#7db8ff' });
        ctx.sfx('cuff');
        yield* wait(0.5);
        yield* fright(ctx, wearer, 'OEPS');
        wearer.mood = 'sad'; wearer.arms = 'beg';
        ctx.sfx('womp');
        yield* wait(0.6);

        B('7b the culprit is led off', [wearer, cop]);
        cam.wide(pt(lidAt.x, wz), { dist: 16, el: 0.3, az: dir * 0.2 });
        wearer.lookAt = null; wearer.arms = 'swing'; cop.arms = 'swing'; cop.lookAt = null;
        R.run(R.away(wearer, -dir * 10, 2.6));
        R.run((function* () { yield* wait(0.5); yield* R.away(cop, -dir * 10, 2.6); })());
        yield* wait(2.0); // (the payoff has landed: the camera lets go and the rig walks the pair off)
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
