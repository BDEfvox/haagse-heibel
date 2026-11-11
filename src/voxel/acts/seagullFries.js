// The gull that steals the fries
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

  return {
    w: [0, 3, 2, 1, 1], crime: 1,
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'seagullFries'), B = beatsFor(ctx, 'seagullFries'), R = rig(ctx);
      let done = false;
      try {
        const ped = yield* needPed(ctx, 10);
        if (!ped) return;
        R.borrow(ped);
        const p = ped.g.position, px = p.x, pz = p.z, side = rnd.sign(), toMid = px > 0 ? -1 : 1;
        const sky = (x, y, z) => { const g = makeBird(rnd, 'gull'); g.fly = true; R.spawn(g, x, z, y); g.face(x > px ? W : E); return g; };

        // ---- 1. set-up: a happy customer with a paper cone of chips
        B('1 a happy customer with a cone of chips', [ped]);
        cam.wide(ped, { dist: 20, hold: 2.2 });
        const fries = ped.hold(item.fries());
        fries.scale.setScalar(1.3);
        ped.arms = 'hold'; ped.heading = 0; ped.mood = 'happy';
        yield* wait(1.0);
        cam.close(ped, { dist: 5, y: 1.1, hold: 3, cut: 0.5 });
        yield* wait(0.3);
        say(ctx, ped, 'mmm, patat', { size: 12, color: '#ffe08a' });
        for (let i = 0; i < 2; i++) { yield* hop(ped, 0.12, 0.2); ctx.sfx('pop', 1.4); yield* wait(0.45); }

        // ---- 2. reconnaissance: one gull makes a slow pass overhead, then hangs in the air to the side
        let dived = false;
        const scout = sky(px + side * 24, 12, pz + 9);
        B('2 a gull makes a slow pass overhead', [ped, scout]);
        cam.shot({ on: [ped, scout], fit: true, dist: 12, el: 0.4, az: 0.2, hold: 3.6, cut: 0.5 });
        R.run((function* () {
          yield* fly(scout, px + side * 3, 7, pz + 2, 10);
          ctx.sfx('squawk');
          say(ctx, scout, 'kraai?', { size: 12, color: '#cfe8ff', off: 0.6 });
          yield* fly(scout, px - side * 8, 9, pz + 6, 7);
          scout.face(side > 0 ? E : W);
          yield* waitUntil(() => dived, 14);
        })());
        yield* wait(0.8);
        ped.lookAt = scout; // glances up
        yield* wait(0.9);
        ped.lookAt = null;
        ped.mood = 'neutral';
        yield* doubleTake(ctx, ped, 'hm?');
        ped.mood = 'sly';

        // ---- 3. the wingman lands behind the customer and waddles up
        const wing = makeBird(rnd, 'gull');
        wing.fly = true;
        R.spawn(wing, px - side * 20, pz + 7, 8);
        const land = pt(px - side * 2.2, pz + 1.0);
        B('3 the wingman lands and waddles up', [wing]);
        cam.close(wing, { dist: 6, hold: 2.4 });
        yield* wait(0.3);
        yield* fly(wing, land.x, 0, land.z, 11);
        wing.fly = false; wing.face(0);
        ctx.sfx('squawk');
        cam.card('DE HANDLANGER', 'Waddle first. Ask never.', 1.8);
        cam.freeze(0.6);
        ctx.sfx('sting');
        yield* wait(0.6);
        yield* go(ctx, wing, px - side * 0.9, pz - 0.9, 2.2);
        wing.face(0);
        yield* hop(wing, 0.12, 0.18);
        yield* wait(0.2);

        B('4 the customer shoos the wingman', [ped, wing]);
        cam.ots(ped, wing, { hold: 2.4, cut: 0.3 });
        yield* wait(0.3);
        ped.heading = Math.PI; ped.mood = 'shock';
        yield* doubleTake(ctx, ped, '?!');
        ped.heading = Math.PI;
        ped.arms = 'fist'; ped.mood = 'angry';
        yell(ctx, ped, 'KSST! WEG!', '#ff6b6b', 14);
        wing.fly = true;
        R.run((function* () { yield* fly(wing, px - side * 3.2, 1.6, pz - 2.2, 6); wing.fly = false; })());
        yield* wait(0.6);
        ped.heading = 0; ped.arms = 'hold'; ped.mood = 'smug'; // that showed him. Back to the chips

        // ---- 4. the dive, in slow motion: the scout was the plan all along
        B('5 the scout dives', [scout, ped]);
        cam.shot({ on: [scout, ped], fit: true, dist: 11, el: 0.12, az: side * 0.5, hold: 2.4, cut: 0.3 });
        yield* wait(0.4);
        dived = true;
        ctx.slowmo(0.3, 1.0);
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
        ped.heading = 0; ped.arms = 'up'; ped.mood = 'shock';
        ped.squash(0.25);

        // ---- 5. a mid-air tug of war over the last chip
        B('6 tug of war over the cone', [ped, scout]);
        cam.ots(ped, scout, { hold: 2.2, cut: 0.2 });
        yield* wait(0.3);
        ped.mood = 'angry';
        let boing = 0;
        yield* tween(1.0, (t) => {
          scout.g.position.set(px + 0.5 + t * 0.9 + Math.sin(t * 22) * 0.3, 1.35 + t * 1.1 + Math.sin(t * 30) * 0.08, pz + 0.55);
          p.y = Math.abs(Math.sin(t * 13)) * 0.4;
          if (t > boing) { boing += 0.28; ctx.sfx('boing'); ctx.fx.burst(px + 0.6, 1.4, pz + 0.6, { n: 3, colors: ['#ffd166'], speed: 2, up: 3, size: [0.05, 0.09], life: [0.5, 0.8] }); }
        });
        p.y = 0;

        // ---- 6. the gull gloats; chips rain down
        B('7 the gull gloats with the cone in its beak', [scout]);
        cam.hero(scout, { dist: 5, hold: 2.4, cut: 0.2 });
        scout.face(0);
        yield* wait(0.3);
        say(ctx, scout, 'KAA-KAA-KAA', { size: 16, color: '#fff3b0', off: 0.6 });
        ctx.sfx('squawk');
        yield* hop(scout, 0.2, 0.18);
        let last = null;
        for (let i = 0; i < 3; i++) {
          const f = R.add(item.fries());
          f.scale.setScalar(i === 0 ? 1.0 : 0.7); f.position.set(px + 0.5, 1.4, pz + 0.5);
          R.run(arc(f, px + rnd.range(-1.6, 1.6), 0.02, pz + rnd.range(0.4, 1.3), 0.8, 0.5, rnd.range(-5, 5)));
          if (i === 0) last = f; // the one left for later
        }
        yield* hop(scout, 0.2, 0.18);
        R.run(fly(scout, px + side * 3, 4.5, pz + 4, 8));
        yield* wait(0.5);

        B('8 the chips on the pavement, and the customer', [ped, last]);
        cam.ground(pt(px, pz + 0.8), { dist: 6.5, az: side * 0.5, fit: true, hold: 2.2, cut: 0.3 });
        yield* wait(0.5);
        ped.arms = 'fist'; ped.mood = 'angry';
        yell(ctx, ped, rnd.pick(['HEY!!', 'ROTMEEUW!', 'MIJN PATAT!']), '#ff6b6b', 17);
        ped.shakeT = 1;
        ctx.news(`Seagull strikes again on ${ctx.st.name}: fries gone in 0.4 seconds`);
        yield* wait(0.5);

        // ---- 7. the flock arrives
        const n = 2 + lv;
        B('9 the flock arrives', [ped, scout]);
        cam.high(ped, { dist: 22, hold: 2.8, cut: 0.4 });
        const flock = [];
        for (let i = 0; i < n; i++) {
          const g = sky(px + rnd.range(-26, 26), rnd.range(13, 17), pz + rnd.range(6, 12));
          flock.push(g);
          ctx.sfx('squawk');
        }
        flock.push(scout);
        ped.lookAt = flock[0]; ped.mood = 'scared'; ped.arms = 'up';
        const flee = pt(S.runway(ctx, px, p.z, toMid, 8), p.z); // runs along the pavement as far as it is clear
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

        B('10 the customer runs for it', [ped]);
        cam.track(ped, { hold: 3.4, lead: 2, cut: 0.4 });
        ped.lookAt = null; ped.arms = 'up'; ped.mood = 'scared';
        yield* wait(0.3);
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

        // ---- 8. aftermath: out of breath, then the cop's waffle goes too
        B('11 aftermath: out of breath', [ped]);
        cam.close(ped, { dist: 6, hold: 2.4, cut: 0.4 });
        ped.heading = 0; ped.arms = 'hips'; ped.mood = 'sleepy';
        yield* wait(0.3);
        say(ctx, ped, '*hijg*', { size: 13, color: '#cfe8ff' });
        ped.squash(0.15);
        yield* wait(0.8);
        if (lv >= 4) {
          const cop = makePerson(rnd, { kind: 'cop' }), cw = cop.hold(item.wafel());
          cw.scale.setScalar(1.4);
          cop.arms = 'hold'; cop.mood = 'happy';
          B('12 a cop strolls up, savouring a stroopwafel', [cop, ped]);
          yield* R.enter(cop, clamp(px - toMid * 8, EX0, EX1), pz);
          cam.two(cop, ped, { dist: 10, hold: 3, cut: 0.4 });
          yield* wait(0.3);
          yield* go(ctx, cop, px - toMid * 2.5, pz, 4);
          cop.heading = 0;
          ctx.sfx('whistle');
          cop.mood = 'smug';
          say(ctx, cop, 'MEEUWEN? ECHT?', { size: 14, color: '#7db8ff' });
          yield* wait(0.6);
          const thief = sky(cop.g.position.x + 8, 9, cop.g.position.z + 6);
          B('13 the second gull snatches the waffle', [thief, cop]);
          cam.shot({ on: [thief, cop], fit: true, dist: 10, el: 0.12, az: 0.4, hold: 2.2, cut: 0.3 });
          yield* wait(0.4);
          yield* fly(thief, cop.g.position.x + 0.5, 1.3, cop.g.position.z + 0.5, 12);
          cop.drop();
          cw.scale.setScalar(1.0);
          thief.b.add(cw); cw.position.set(0, 0.25, 0.55);
          ctx.sfx('yoink');
          say(ctx, thief, 'YOINK!', { size: 20, color: '#ffd60a', off: 0.6 });
          cop.arms = 'up'; cop.mood = 'shock';
          cop.squash(0.25);
          R.run((function* () { yield* fly(thief, thief.g.position.x + 26, 13, thief.g.position.z + 8, 11); R.gone(thief); })());
          yield* wait(0.3);
          cop.mood = 'angry'; cop.arms = 'fist';
          yell(ctx, cop, 'MIJN STROOPWAFEL!', '#7db8ff', 14);
          yield* wait(0.8);
          cop.arms = 'swing'; cop.mood = 'sad';
          R.run(R.away(cop, toMid * -6, 3.2));
        }

        // ---- 9. the pigeon, patient and unremarkable, walks off with the one chip that is left
        const pig = makeBird(rnd, 'pigeon');
        const pg = spotNear(ctx, px + side * 5, pz + 1.4, 0.3);
        R.spawn(pig, pg.x, pg.z, 0);
        pig.face(side > 0 ? W : E);
        const lx = last.position.x, lz = last.position.z;
        B('14 the pigeon walks up to the last chip', [pig, last]);
        cam.ground(pt(lx, lz), { dist: 6, fit: true, az: side * 0.4, hold: 2.6, cut: 0.4 });
        yield* wait(0.3);
        yield* go(ctx, pig, lx, lz, 2.4);
        yield* wait(0.3);
        R.rm(last);
        const stolen = item.fries();
        stolen.scale.setScalar(0.9);
        pig.b.add(stolen); stolen.position.set(0, 0.2, 0.4);
        ctx.sfx('pop', 1.3);
        yield* hop(pig, 0.12, 0.18);
        yield* wait(0.3);

        B('15 the customer cannot believe it', [ped]);
        cam.close(ped, { hold: 2.4, cut: 0.3 });
        cam.freeze(0.6);
        faceTo(ped, lx, lz); ped.mood = 'shock'; ped.arms = 'swing';
        yield* doubleTake(ctx, ped, '...');
        say(ctx, ped, 'SERIEUS?!', { size: 18, color: '#ff6b6b' });
        ctx.sfx('hey');
        ped.arms = 'shrug'; ped.mood = 'sad'; ped.shakeT = 1;
        R.run((function* () { yield* go(ctx, pig, lx + side * 6, lz + 1, 3); R.gone(pig); })());
        yield* wait(1.0);
        ped.arms = 'swing'; ped.mood = 'neutral'; ped.lookAt = null;
        R.give(ped);
        yield* R.settle(10);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
