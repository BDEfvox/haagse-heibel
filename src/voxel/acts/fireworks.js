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

  return {
    w: [0, 0, 0.6, 2, 2.5], crime: 1, need: ['bins'],
    *run(ctx) {
      const { L, rnd } = ctx, cam = camFor(ctx, 'fireworks'), B = beatsFor(ctx, 'fireworks'), R = rig(ctx);
      if (!L.bins || !L.bins.length) return;
      const bin = rnd.pick(L.bins), dir = bin.x > 0 ? 1 : -1; // the lad comes from the middle of the street
      const stand = spotNear(ctx, bin.x, bin.z + 1.2), sx = stand.x, sz = stand.z;
      const binPt = pt(bin.x, bin.z), sky = pt(bin.x, bin.z);
      const ex = clamp(sx - dir * 8.5, EX0, EX1), retreat = (k) => clamp(sx - dir * k, EX0, EX1);
      let done = false;
      try {
        const lad = makePerson(rnd, { kind: 'hoodie', scale: 1.05 });
        const m1 = makePerson(rnd, { kind: 'hoodie' }), m2 = makePerson(rnd, { kind: 'hoodie' });
        const rocket = bigRocket(), lid = R.add(binLid());
        lid.position.set(bin.x, TOP, bin.z);
        let launched = false;

        // ---- 1. the plan: sneaking up to the bin with a huge rocket, two mates filming behind him
        B('1 the plan: sneaking to the bin with a huge rocket', [lad, binPt]);
        cam.wide(binPt, { dist: 18, el: 0.3, az: -dir * 0.3, hold: 2.4 });
        yield* R.enter(lad, ex, sz);
        lad.hold(rocket, 'front'); rocket.position.set(0.12, 0.35, 0.5);
        lad.arms = 'carry'; lad.gait = 'sneak'; lad.mood = 'sly';
        for (const [m, k] of [[m1, 1.6], [m2, 2.9]]) {
          yield* R.enter(m, clamp(ex - dir * k, EX0, EX1), sz + rnd.range(-0.2, 0.3));
          m.hold(item.phone()); m.arms = 'hold'; m.lookAt = lad; m.mood = 'happy';
        }
        cam.track(lad, { dist: 9, el: 0.12, az: -dir * 0.5, lead: 1.4, cut: 1.0, hold: 7 });
        const follow = (m, k) => R.run((function* () {
          yield* go(ctx, m, retreat(k), sz + 0.2, 2.2);
          m.lookAt = binPt;
        })());
        follow(m1, 3.3); follow(m2, 4.6);
        yield* wait(0.3);
        yield* go(ctx, lad, sx, sz, 2.3);
        faceTo(lad, bin.x, bin.z);
        lad.lookAt = null;
        yield* wait(0.4);

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
        ctx.sfx('fuse');
        const fuseY = TOP + 0.22;
        const fuse = R.run((function* () { for (;;) { ctx.fx.sparks(bin.x + 0.09, fuseY, bin.z, 2); yield* wait(0.1); } })());
        yield* wait(0.5);
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
        ctx.sfx('womp');
        ctx.fx.puff(bin.x + 0.09, fuseY, bin.z);
        say(ctx, at(bin.x, TOP + 1.5, bin.z), 'pfff...', { size: 16, color: '#cfd8dc' });
        cam.dolly(lad, { dist: 8, el: 0.12, y: 1.4, az: -dir * 0.3, fov: 36, drift: { dist: -3.2 }, cut: 0.5, hold: 7 });
        yield* wait(0.9);
        lad.pose = null; lad.mood = 'neutral'; lad.arms = 'shrug'; lad.shakeT = 1;
        for (const m of [m1, m2]) { m.pose = null; m.arms = 'hold'; m.mood = 'happy'; m.lookAt = lad; }
        yield* wait(0.8);
        lad.gait = 'sneak'; lad.mood = 'sly'; lad.arms = 'sneak';
        yield* go(ctx, lad, sx, sz, 2.0);
        lad.gait = 'walk'; lad.arms = 'hips'; lad.mood = 'focus';
        faceTo(lad, bin.x, bin.z);
        yield* wait(0.3);
        // leaning right over the bin, nose at the rocket
        yield* tween(0.8, (u) => { lad.g.rotation.x = -0.75 * u; }, ease.outQuad);
        lad.lookAt = binPt;
        yield* wait(0.8);

        // ---- 5. WHOOSH: it goes off after all
        B('5 WHOOSH: the rocket goes past his nose, the lid flies off', [lad]);
        cam.crash(lad, { hold: 1.5 });
        yield* wait(0.35);
        ctx.sfx('fuse');
        for (let i = 0; i < 4; i++) { ctx.fx.sparks(bin.x + 0.09, fuseY, bin.z, 6); yield* wait(0.05); }
        launched = true;
        lad.mood = 'shock'; lad.lookAt = null; lad.arms = 'up';
        ctx.sfx('rocket'); ctx.shake(0.35);
        ctx.fx.text('WHOOOSH!', at(bin.x, 2.4, bin.z), { size: 26, color: '#ffe08a' });
        ctx.fx.smoke(bin.x, TOP, bin.z, 8, ['#e9e9e9', '#bdbdbd'], 0.5);
        // he is blown upright
        R.run((function* () { yield* tween(0.2, (u) => { lad.g.rotation.x = -0.75 * (1 - u); }); lad.g.rotation.x = 0; lad.squash(0.35); })());
        // the lid spins up and away, then comes down exactly where he is standing
        let landed = false;
        R.run((function* () {
          const x1 = sx, z1 = sz, a0 = lid.position.clone();
          yield* tween(2.3, (u) => {
            lid.position.set(lerp(a0.x, x1, u) + Math.sin(u * Math.PI) * 0.8, lerp(a0.y, 1.95, u) + Math.sin(u * Math.PI) * 8, lerp(a0.z, z1, u));
            lid.rotation.set(u * TAU * 3, u * TAU * 2, u * TAU);
          });
          lid.rotation.set(0, 0, 0);
          R.rm(lid);
          lad.hold(lid, 'head');
          lid.position.set(0, 0.62, 0);
          landed = true;
        })());
        // the rocket itself
        const top = rnd.range(11, 13);
        yield* tween(0.8, (u) => {
          const y = rBase + u * (top - rBase);
          rocket.position.set(rx + u * 1.2, y, bin.z - u * 1.0);
          rocket.rotation.y = u * TAU * 2;
          ctx.fx.sparks(rx + u * 1.2, y, bin.z - u * 1.0, 2);
        }, ease.inQuad);
        R.rm(rocket);
        ctx.incident(1);
        ctx.news('Illegal fireworks reported on ' + ctx.st.name + '. It is not even December');
        B('5b the bursts: PANG, and two more lighting up everything', [sky]);
        cam.shot({ on: sky, y: 4.5, dist: 14, el: -0.2, fov: 62, drift: { fov: -6 }, cut: 0.4, hold: 4 });
        ctx.sfx('pang');
        ctx.fx.firework(rx + 1.2, top, bin.z - 1.0);
        ctx.flash('rgba(255,240,200,0.3)', 0.25);
        ctx.fx.text('PANG!', at(rx + 1.2, top - 1.2, bin.z - 1.0), { size: 26, color: '#ffe08a' });
        yield* wait(0.55);
        for (let k = 0; k < 2; k++) {
          const bx = bin.x + rnd.range(-5, 5), bz = bin.z - rnd.range(0, 5), by = rnd.range(9, 12);
          ctx.sfx('pang');
          ctx.fx.firework(bx, by, bz);
          ctx.flash('rgba(255,240,200,0.2)', 0.2);
          ctx.fx.text(rnd.pick(['KNAL!', 'BOEM!', 'FIEEEW!']), at(bx, by - 1.2, bz), { size: 22, color: '#ffe08a' });
          yield* wait(0.5);
        }
        for (const p of ctx.peds) if (!p.busy && rnd.chance(0.3)) say(ctx, p, 'OOOH!', { size: 12, color: '#fff' });

        // ---- 6. the lid comes down on his head
        B('6 the lid: BONK, right on his head', [lad]);
        cam.close(lad, { dist: 7, y: 1.7, cut: 0.4, hold: 2.4 });
        for (const m of [m1, m2]) { m.mood = 'happy'; m.lookAt = lad; }
        yield* waitUntil(() => landed, 4);
        ctx.sfx('bonk'); ctx.shake(0.3);
        ctx.fx.text('BONK!', at(sx, 2.7, sz), { size: 30, color: '#ffd60a' });
        ctx.fx.pips(sx, 2.0, sz, 8);
        lad.arms = 'swing'; lad.mood = 'dizzy'; lad.squash(0.4);
        R.run(seeStars(ctx, lad, 2.4));
        yield* wait(0.9);
        B('6b the mates fall about laughing', [m1, m2]);
        cam.two(m1, m2, { az: dir * 0.2, hold: 2.8 });
        for (const m of [m1, m2]) m.arms = 'point';
        ctx.sfx('laugh');
        cackle(ctx, m1, 2.2, 'ha');
        yield* laugh(ctx, m2, 2.2, 'ha');

        // ---- 7. the law: the mates scatter, the lad, lid over his eyes, walks straight into the cop
        B('7 the law: a cop, the mates scatter, the lad walks into him', [lad]);
        const cop = makePerson(rnd, { kind: 'cop' }), cx = clamp(sx + dir * 4.6, EX0, EX1);
        yield* R.enter(cop, cx, sz);
        faceTo(cop, sx, sz); cop.arms = 'stop'; cop.mood = 'angry';
        ctx.sfx('whistle');
        say(ctx, cop, 'POLITIE!', { size: 16, color: '#7db8ff' });
        cam.wide([lad, cop, m1, m2], { dist: 15, el: 0.25, az: dir * 0.3, fit: true, cut: 0.5, hold: 3 });
        for (const m of [m1, m2]) {
          m.lookAt = cop; m.arms = 'up'; m.mood = 'scared';
          R.run((function* () {
            yield* wait(rnd.range(0.05, 0.25));
            say(ctx, m, rnd.pick(['WEG!', 'RENNEN!', 'AAH!']), { size: 14, color: '#fff' });
            m.lookAt = null;
            yield* goEach(ctx, m, clamp(sx - dir * 20, EX0, EX1), m.g.position.z + rnd.range(-0.3, 0.3), 7);
            yield* R.out(m);
          })());
        }
        yield* wait(0.5);
        // the lid has slid down over his eyes
        lid.position.set(0, 0.5, 0.1); lid.rotation.x = 0.5;
        lad.arms = 'reach'; lad.mood = 'scared'; lad.lookAt = null; lad.gait = 'stagger';
        cam.two(cop, lad, { az: dir * 0.2, cut: 0.4, hold: 3.6 });
        yield* wait(0.3);
        yield* goEach(ctx, lad, cx - dir * 0.7, sz, 2.6);
        ctx.sfx('thud'); ctx.shake(0.2);
        lad.squash(0.3); cop.squash(0.2);
        lad.gait = 'walk'; lad.arms = 'swing';
        ctx.fx.pips(lad.g.position.x, 1.8, sz, 4);
        yield* wait(0.5);
        cop.arms = 'reach'; cop.mood = 'smug';
        yield* wait(0.4);
        const lid2 = lad.drop();
        if (lid2) {
          R.add(lid2);
          lid2.rotation.set(0, 0, 0);
          lid2.position.set(lad.g.position.x, 1.85, sz);
          yield* tween(0.4, (u) => { lid2.position.set(lerp(lad.g.position.x, cop.g.position.x, u), lerp(1.85, 1.5, u) + Math.sin(u * Math.PI) * 0.5, sz); });
          R.rm(lid2);
        }
        lad.mood = 'shock'; lad.lookAt = cop;
        say(ctx, cop, 'MEEKOMEN.', { size: 18, color: '#7db8ff' });
        ctx.sfx('cuff');
        yield* wait(0.5);
        yield* fright(ctx, lad, 'OEPS');
        lad.mood = 'sad'; lad.arms = 'beg';
        ctx.sfx('womp');
        yield* wait(0.6);

        B('7b the lad is led off', [lad, cop]);
        cam.wide(pt(sx, sz), { dist: 16, el: 0.3, az: dir * 0.2, hold: 3 });
        lad.lookAt = null; lad.arms = 'swing'; cop.arms = 'swing'; cop.lookAt = null;
        R.run(R.away(lad, -dir * 10, 2.6));
        R.run((function* () { yield* wait(0.5); yield* R.away(cop, -dir * 10, 2.6); })());
        yield* wait(2.2);
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
