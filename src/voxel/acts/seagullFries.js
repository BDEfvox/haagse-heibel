// The gull that steals the fries. Three different middles (decoy and dive, a well-aimed bomb and a thief, a pincer) and three endings
// (the flock, the cop's stroopwafel, the patient pigeon), so two plays in a row look different.
// Storyboard: storyboards/seagullFries.md. Every B(...) below is one beat of it, with who must be on screen.
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
    release, needPed,
  } = T;
  const { entryTime, seen, watching, outPoint, extraKind } = T;

  const blob = () => sculpt((v) => { v.box(0, 0, 0, 0.1, 0.16, 0.1, '#ffffff'); v.box(0.01, 0.16, 0, 0.06, 0.06, 0.06, '#e6e2d4'); });
  const splat = () => sculpt((v) => { v.box(0, 0.6, 0, 0.34, 0.05, 0.34, '#ffffff'); v.box(0.12, 0.5, 0.18, 0.12, 0.12, 0.08, '#ffffff'); v.box(-0.1, 0.5, 0.2, 0.08, 0.16, 0.06, '#f1efe6'); });

  /** Wait until the shot that was just asked for is really up (the point is in the picture): entrances are only made in view after that. */
  const shotUp = function* (ctx, x, z, y = 1) { yield* waitUntil(() => seen(ctx, x, z, y), 2); yield* wait(0.2); };

  return {
    w: [0, 3, 2, 1, 1], crime: 1,
    stage: { pave: { side: 'any', len: 8, depth: 1.6 } },
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'seagullFries'), B = beatsFor(ctx, 'seagullFries'), R = rig(ctx);
      const stg = ctx.stage; // read before the first yield
      // the three middles and the three endings are chosen up front (flip: the audit can force any of them)
      const mid = flip(ctx, 'poop', 0.34) ? 'poop' : flip(ctx, 'pincer', 0.5) ? 'pincer' : 'decoy';
      const end = flip(ctx, 'flock', 0.34) ? 'flock' : flip(ctx, 'cop', 0.5) ? 'cop' : 'pigeon';
      let done = false;
      try {
        // the customer is an ordinary pedestrian: borrow one who stands near, else invent one who walks in already holding the chips
        let ped = takePed(ctx, 10, (q) => q.kind === 'civ' || q.kind === 'granny');
        const invented = !ped;
        let px, pz;
        if (ped) { R.borrow(ped); px = ped.g.position.x; pz = ped.g.position.z; }
        else {
          const sx = stg && stg.x != null ? stg.x : rnd.range(-4, 4), q = padSpot(ctx, 'walkF1', sx, 0.8, 12) || padSpot(ctx, 'walkB0', sx, 0.8, 12) || spotNear(ctx, sx, padZ(ctx, 'walkF1', sx), 0.8);
          ped = makePerson(rnd, { kind: 'civ' }); px = q.x; pz = q.z;
        }
        const p = ped.g.position, side = rnd.sign(), toMid = px > 0 ? -1 : 1;
        const gull = (x, y, z, dir, speed = 9) => { // a gull that flies in over the edge of the frame and on to (x, y, z)
          const g = makeBird(rnd, 'gull'); g.fly = true;
          // (the shot that shows the arrival is up first, and then the bird comes over the frame edge)
          const t = R.run((function* () { yield* wait(0.5); yield* shotUp(ctx, x, z, Math.min(y, 1.5)); yield* R.enter(g, x, z, y, { dir, speed }); })());
          return { g, t };
        };
        const flyOut = function* (g, away, speed = 9) { // ...and out the same way: on and up until it is out of the frame
          const q = g.g.position;
          for (let i = 0; i < 8; i++) {
            yield* fly(g, q.x + away * 7, Math.min(q.y + 1.6, 16), q.z + 1.5, speed);
            if (!seen(ctx, q.x, q.z, q.y, 0.15)) break;
          }
          R.gone(g);
        };
        const flyAway = (g, away, speed = 9) => R.run(flyOut(g, away, speed));
        const rain = (x, y, z) => { // chips fly out of the cone and land round the customer; returns the one left for later
          let last = null;
          for (let i = 0; i < 3; i++) {
            const f = R.add(item.fries());
            f.scale.setScalar(i === 0 ? 1.0 : 0.7); f.position.set(x, y, z);
            const q = S.findSpot(ctx, px + rnd.range(-1.5, 1.5), pz + rnd.range(0.4, 1.2), 0.2, 6);
            R.run(arc(f, q ? q.x : px + 0.6 * (i - 1), 0.02, q ? q.z : pz + 0.8, 0.8, 0.5, rnd.range(-5, 5)));
            if (i === 0) last = f;
          }
          return last;
        };

        // ---- 1. set-up: a happy customer with a paper cone of chips
        B('1 a happy customer with a cone of chips', [pt(px, pz)]);
        cam.wide(pt(px, pz), { dist: invented ? 12 : 18 });
        const fries = ped.hold(item.fries());
        fries.scale.setScalar(1.3);
        ped.arms = 'hold'; ped.heading = 0; ped.mood = 'happy';
        yield* shotUp(ctx, px, pz);
        if (invented) { yield* R.enter(ped, px, pz, undefined, { speed: 2.6 }); ped.heading = 0; }
        yield* wait(invented ? 0.5 : 1.1);
        B('1b mmm, patat', [ped]);
        cam.close(ped, { dist: 6, y: 1.1, cut: 0.5 });
        yield* wait(0.3);
        say(ctx, ped, 'mmm, patat', { size: 12, color: '#ffe08a' });
        for (let i = 0; i < 2; i++) { yield* hop(ped, 0.12, 0.2); ctx.sfx('pop', 1.4); yield* wait(0.4); }

        // the scout: in over the edge of the frame, a slow pass overhead, then hanging in the air to the side
        let dived = false;
        const sc = gull(px + side * 3, 7, pz + 2, -side, 9), scout = sc.g;
        B('2 a gull makes a slow pass overhead', [ped]);
        cam.shot({ on: [ped, pt(px + side * 3, pz + 2)], fit: true, dist: 12, el: 0.4, az: 0.2, cut: 0.5 });
        yield* wait(0.3);
        yield* waitUntil(() => sc.t.done, 5);
        ctx.sfx('squawk');
        say(ctx, scout, 'kraai?', { size: 12, color: '#cfe8ff', off: 0.6 });
        R.run((function* () {
          yield* fly(scout, px - side * 8, 9, pz + 6, 7);
          scout.face(side > 0 ? E : W);
          yield* waitUntil(() => dived, 14);
        })());
        ped.lookAt = scout; // glances up
        yield* wait(0.8);
        ped.lookAt = null;
        ped.mood = 'neutral';
        yield* doubleTake(ctx, ped, 'hm?');
        ped.mood = 'sly';

        let thief = scout, last = null, rainAt = { x: px + 0.5, y: 1.4, z: pz + 0.5 };
        if (mid === 'decoy') {
          // ---- 3. the wingman lands behind the customer and waddles up
          const wing = makeBird(rnd, 'gull'); wing.fly = true;
          const land = pt(px - side * 2.2, pz + 1.0);
          B('3 the wingman lands and waddles up', [land]);
          cam.shot({ on: land, y: 0.6, dist: 6, el: 0.1, cut: 0.4 });
          yield* shotUp(ctx, land.x, land.z, 0.6);
          yield* R.enter(wing, land.x, land.z, 0, { dir: side, speed: 11 });
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
          cam.ots(ped, wing, { cut: 0.3 });
          yield* wait(0.3);
          ped.heading = Math.PI; ped.mood = 'shock';
          yield* doubleTake(ctx, ped, '?!');
          ped.heading = Math.PI;
          ped.arms = 'fist'; ped.mood = 'angry';
          yell(ctx, ped, 'KSST! WEG!', '#ff6b6b', 14);
          wing.fly = true;
          R.run((function* () { yield* fly(wing, px - side * 3.2, 1.6, pz - 2.2, 6); yield* flyOut(wing, -side); })());
          yield* wait(0.9);
          ped.heading = 0; ped.arms = 'hold'; ped.mood = 'smug'; // that showed him. Back to the chips

          // ---- 4. the dive, in slow motion: the scout was the plan all along
          B('5 the scout dives', [ped]);
          cam.shot({ on: [scout, ped], fit: true, dist: 11, el: 0.12, az: side * 0.5, cut: 0.3 });
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
        } else if (mid === 'poop') {
          // ---- 3. the bomber: it hangs right over the customer and lets go
          B('3 the gull lines up over his head', [ped]);
          dived = true;
          cam.shot({ on: [ped, scout], fit: true, dist: 11, el: 0.35, az: side * 0.3, cut: 0.4 });
          yield* wait(0.3);
          R.run(fly(scout, px + 0.1, 5.2, pz + 0.1, 6));
          ped.lookAt = null; ped.mood = 'happy';
          cam.card('DE BOMMENWERPER', 'Aim: excellent. Conscience: none.', 1.8);
          cam.freeze(0.6);
          ctx.sfx('sting');
          yield* wait(0.9);
          B('3b the bomb', [ped]);
          cam.shot({ on: ped, y: 1.6, dist: 6, el: 0.2, az: 0.1, cut: 0.4 });
          yield* wait(0.4);
          const bomb = R.add(blob());
          bomb.position.set(px + 0.1, 5.0, pz + 0.1);
          ctx.sfx('whoosh');
          yield* tween(0.7, (t) => { bomb.position.y = lerp(5.0, 2.05, t * t); });
          R.rm(bomb);
          ctx.sfx('pop', 0.6);
          ctx.fx.burst(px, 2.1, pz, { n: 10, colors: ['#ffffff', '#e6e2d4'], speed: 2.5, up: 2, size: [0.06, 0.12], life: [0.4, 0.8] });
          ctx.fx.text('KLETS!', ped, { size: 20, color: '#ffffff' });
          const sp = splat(); ped.head.add(sp);
          ped.squash(0.2); ped.mood = 'shock'; ped.arms = 'hold'; ped.lookAt = scout;
          yield* wait(0.8);
          B('3c wiped: the cone is in one hand, the other is busy', [ped]);
          ped.mood = 'angry'; ped.arms = 'facepalm'; ped.heading = 0;
          yell(ctx, ped, 'HÈ! KIJK UIT!', '#ff6b6b', 15);
          yield* wait(0.9);

          // ---- 4. while he looks up, the accomplice comes in low
          const th = gull(px + side * 0.6, 1.35, pz - 0.5, -side, 10), g2 = th.g;
          thief = g2;
          B('4 the second gull: in low, behind his back', [ped]);
          cam.shot({ on: [ped, pt(px, pz - 0.5)], fit: true, dist: 9, el: 0.1, az: -side * 0.45, cut: 0.4 });
          yield* wait(0.3);
          ped.lookAt = scout;
          yield* waitUntil(() => th.t.done, 4);
          ped.drop();
          g2.b.add(fries);
          fries.position.set(0, 0.25, 0.55);
          ctx.sfx('yoink');
          say(ctx, g2, 'YOINK!', { size: 22, color: '#ffd60a', off: 0.6 });
          ctx.fx.puff(px, 1.2, pz);
          ctx.incident();
          ped.heading = 0; ped.lookAt = null; ped.arms = 'up'; ped.mood = 'shock';
          ped.squash(0.25);
          R.run((function* () { yield* wait(0.5); yield* flyOut(scout, side); })()); // the bomber leaves the way it came
          rainAt = { x: px + 0.2, y: 1.5, z: pz - 0.3 };
        } else {
          // ---- 3. the pincer: one gull from each side
          dived = true;
          const g1 = gull(px - 0.6, 1.4, pz + 0.5, 1, 10), g2 = gull(px + 0.6, 1.4, pz + 0.5, -1, 10);
          thief = g1.g;
          const sc2 = g2.g;
          B('3 the pincer: a gull from each side', [ped]);
          cam.shot({ on: [ped, pt(px - 3, pz), pt(px + 3, pz)], fit: true, dist: 12, el: 0.15, az: 0.15, cut: 0.4 });
          yield* wait(0.3);
          ped.lookAt = null; ped.mood = 'happy';
          flyAway(scout, -side, 5); // the scout drifts off over the roofs: it was only the lookout
          yield* waitUntil(() => g1.t.done && g2.t.done, 4);
          cam.card('DE TANG', 'Two gulls, one cone, no negotiations.', 1.8);
          cam.freeze(0.6);
          ctx.sfx('sting');
          yield* wait(0.8);
          B('4 the tug: both beaks on the cone', [ped, thief, sc2]);
          cam.shot({ on: [ped, thief, sc2], fit: true, dist: 6, el: 0.1, az: 0.1, cut: 0.4 });
          yield* wait(0.3);
          ctx.sfx('squawk');
          ped.mood = 'shock'; ped.arms = 'hold';
          say(ctx, thief, 'KRAA!', { size: 16, color: '#ffd60a', off: 0.6 }); say(ctx, sc2, 'KRAA!', { size: 16, color: '#fff3b0', off: 0.6 });
          let boing = 0;
          yield* tween(1.3, (t) => {
            const w = Math.sin(t * 24) * 0.12;
            thief.g.position.set(px - 0.6 + w, 1.4 + Math.sin(t * 17) * 0.08, pz + 0.5);
            sc2.g.position.set(px + 0.6 - w, 1.4 + Math.sin(t * 17 + 2) * 0.08, pz + 0.5);
            p.y = Math.abs(Math.sin(t * 13)) * 0.3;
            if (t > boing) { boing += 0.3; ctx.sfx('boing'); }
          });
          p.y = 0;
          // the cone tears: the bigger half goes to one gull, chips to the other beak, none to the customer
          ped.drop();
          thief.b.add(fries); fries.position.set(0, 0.25, 0.55);
          ctx.sfx('yoink');
          say(ctx, thief, 'YOINK!', { size: 22, color: '#ffd60a', off: 0.6 });
          ctx.fx.puff(px, 1.2, pz);
          ctx.incident();
          ped.heading = 0; ped.arms = 'up'; ped.mood = 'shock';
          ped.squash(0.25);
          flyAway(sc2, 1);
          rainAt = { x: px, y: 1.4, z: pz + 0.5 };
        }

        // ---- 5. the gull gloats; chips rain down
        B('6 tug of war over the cone', [ped, thief]);
        cam.ots(ped, thief, { cut: 0.2 });
        yield* wait(0.3);
        ped.mood = 'angry';
        let boing = 0;
        const g0 = thief.g.position.clone();
        yield* tween(0.9, (t) => {
          thief.g.position.set(g0.x + t * 0.9 + Math.sin(t * 22) * 0.3, Math.max(g0.y, 1.35) + t * 1.1 + Math.sin(t * 30) * 0.08, g0.z);
          p.y = Math.abs(Math.sin(t * 13)) * 0.4;
          if (t > boing) { boing += 0.28; ctx.sfx('boing'); ctx.fx.burst(thief.g.position.x, 1.4, thief.g.position.z, { n: 3, colors: ['#ffd166'], speed: 2, up: 3, size: [0.05, 0.09], life: [0.5, 0.8] }); }
        });
        p.y = 0;

        B('7 the gull gloats with the cone in its beak', [thief]);
        cam.hero(thief, { dist: 5, cut: 0.2 });
        thief.face(0);
        yield* wait(0.3);
        say(ctx, thief, 'KAA-KAA-KAA', { size: 16, color: '#fff3b0', off: 0.6 });
        ctx.sfx('squawk');
        yield* hop(thief, 0.2, 0.18);
        const tp = thief.g.position;
        last = rain(tp.x, tp.y, tp.z);
        yield* hop(thief, 0.2, 0.18);
        flyAway(thief, side);
        yield* wait(0.5);

        B('8 the chips on the pavement, and the customer', [ped]);
        cam.ground(pt(px, pz + 0.8), { dist: 6.5, az: side * 0.5, fit: true, cut: 0.3 });
        yield* wait(0.5);
        ped.arms = 'fist'; ped.mood = 'angry';
        yell(ctx, ped, rnd.pick(['HEY!!', 'ROTMEEUW!', 'MIJN PATAT!']), '#ff6b6b', 17);
        ped.shakeT = 1;
        ctx.news(`Seagull strikes again on ${ctx.st.name}: fries gone in 0.4 seconds`);
        yield* wait(0.5);

        // ---- 6. the ending
        if (end === 'flock') {
          // the flock arrives from beyond the frame and dive-bombs the customer, who runs for it
          const n = 2 + Math.min(3, Math.ceil(lv / 2));
          B('9 the flock arrives', [ped]);
          cam.high(ped, { dist: 22, cut: 0.4 });
          const flock = [];
          for (let i = 0; i < n; i++) {
            const a = rnd.range(0, TAU), rr = rnd.range(3.5, 6);
            flock.push(gull(px + Math.cos(a) * rr, rnd.range(5, 8), pz + Math.sin(a) * rr * 0.7, rnd.sign(), 10));
            ctx.sfx('squawk');
          }
          ped.lookAt = flock[0].g; ped.mood = 'scared'; ped.arms = 'up';
          const flee = pt(S.runway(ctx, px, p.z, toMid, 8), p.z); // runs along the pavement as far as it is clear
          flock.forEach((f, i) => R.run((function* () {
            const g = f.g;
            yield* waitUntil(() => f.t.done, 5);
            const ph = rnd.range(0, TAU), r = rnd.range(3.5, 6), y = rnd.range(5, 8);
            yield* tween(1.3, (t) => { // circle overhead...
              const a = ph + t * 7 * (i % 2 ? 1 : -1), tx = px + Math.cos(a) * r, tz = pz + Math.sin(a) * r * 0.7;
              const q = g.g.position, k = Math.min(1, 0.16 + t * 0.2);
              q.x += (tx - q.x) * k; q.y += (y - q.y) * k * 0.7; q.z += (tz - q.z) * k;
              g.heading = a + (i % 2 ? Math.PI : 0) + 1.57;
            });
            let t = 0; // ...then dive-bomb the customer
            while (t < 2.4) {
              const dt = yield;
              t += dt;
              const q = g.g.position, off = Math.sin(t * 5 + ph) * 1.3;
              const tx = p.x + off, ty = 1.65 + Math.abs(Math.sin(t * 6 + i)) * 0.75, tz = p.z + 0.6;
              const dx = tx - q.x, dy = ty - q.y, dz = tz - q.z, d = Math.hypot(dx, dy, dz) || 1, s = Math.min(d, 9.5 * dt);
              q.x += dx / d * s; q.y += dy / d * s; q.z += dz / d * s;
              g.heading = Math.atan2(dx, dz); g.moving = 9;
            }
            yield* flyOut(g, rnd.sign());
          })()));
          yield* wait(1.4);

          B('10 the customer runs for it', [ped]);
          cam.track(ped, { lead: 2, cut: 0.4 });
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
          ped.arms = 'swing';
          yield* go(ctx, ped, p.x + toMid * 3, pz, 3.6);
          B('11 aftermath: out of breath', [ped]);
          cam.close(ped, { dist: 6, cut: 0.4 });
          ped.heading = 0; ped.arms = 'hips'; ped.mood = 'sleepy';
          yield* wait(0.3);
          say(ctx, ped, '*hijg*', { size: 13, color: '#cfe8ff' });
          ped.squash(0.15);
          yield* wait(1.2);
        } else if (end === 'cop') {
          // a cop strolls up, savouring a stroopwafel, and the second gull is watching
          const cop = makePerson(rnd, { kind: 'cop' }), cw = cop.hold(item.wafel());
          cw.scale.setScalar(1.4);
          cop.arms = 'hold'; cop.mood = 'happy';
          const cx = clamp(px - toMid * 3, EX0, EX1), cq = spotNear(ctx, cx, pz, 0.5);
          B('12 a cop strolls up, savouring a stroopwafel', [pt(cq.x, cq.z), ped]);
          cam.two(pt(cq.x, cq.z), ped, { dist: 10, cut: 0.4 });
          yield* shotUp(ctx, cq.x, cq.z);
          yield* R.enter(cop, cq.x, cq.z, undefined, { speed: 2.6, dir: toMid });
          cop.heading = 0;
          ctx.sfx('whistle');
          cop.mood = 'smug';
          say(ctx, cop, 'MEEUWEN? ECHT?', { size: 14, color: '#7db8ff' });
          yield* wait(0.7);
          const th2 = gull(cop.g.position.x + 0.5, 1.3, cop.g.position.z + 0.5, -toMid, 12), t2 = th2.g;
          B('13 the second gull snatches the waffle', [cop]);
          cam.shot({ on: [cop, ped], fit: true, dist: 10, el: 0.12, az: 0.4, cut: 0.3 });
          yield* waitUntil(() => th2.t.done, 4);
          cop.drop();
          cw.scale.setScalar(1.0);
          t2.b.add(cw); cw.position.set(0, 0.25, 0.55);
          ctx.sfx('yoink');
          say(ctx, t2, 'YOINK!', { size: 20, color: '#ffd60a', off: 0.6 });
          cop.arms = 'up'; cop.mood = 'shock';
          cop.squash(0.25);
          flyAway(t2, -toMid, 11);
          yield* wait(0.5);
          cop.mood = 'angry'; cop.arms = 'fist';
          yell(ctx, cop, 'MIJN STROOPWAFEL!', '#7db8ff', 14);
          yield* wait(0.9);
          cop.arms = 'swing'; cop.mood = 'sad';
          R.run(R.away(cop, toMid * -6, 3.2));
          B('13b the customer shrugs', [ped]);
          cam.close(ped, { cut: 0.4 });
          ped.heading = 0; ped.mood = 'sad'; ped.arms = 'shrug'; ped.shakeT = 1;
          yield* wait(1.3);
        } else {
          // the pigeon, patient and unremarkable, walks in from the edge and off with the one chip that is left
          const pig = makeBird(rnd, 'pigeon');
          const lx = last.position.x, lz = last.position.z;
          B('14 the pigeon walks up to the last chip', [last]);
          cam.ground(pt(lx, lz), { dist: 6, az: side * 0.4, cut: 0.4 });
          yield* wait(0.3);
          const pg = spotNear(ctx, lx + side * 4, lz + 0.3, 0.3);
          yield* shotUp(ctx, pg.x, pg.z);
          yield* R.enter(pig, pg.x, pg.z, 0, { dir: -side, speed: 2.4 });
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
          cam.close(ped, { cut: 0.3 });
          cam.freeze(0.6);
          faceTo(ped, lx, lz); ped.mood = 'shock'; ped.arms = 'swing';
          yield* doubleTake(ctx, ped, '...');
          say(ctx, ped, 'SERIEUS?!', { size: 18, color: '#ff6b6b' });
          ctx.sfx('hey');
          ped.arms = 'shrug'; ped.mood = 'sad'; ped.shakeT = 1;
          pig.fly = true;
          R.run((function* () { yield* wait(0.4); yield* flyOut(pig, side, 6); })()); // it flies off with the chip, the way it came
          yield* wait(1.2);
        }
        ped.arms = 'swing'; ped.mood = 'neutral'; ped.lookAt = null;
        R.give(ped);
        yield* R.settle(2); // (the cop of the last ending walks off on his own: the picture does not wait for him)
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
