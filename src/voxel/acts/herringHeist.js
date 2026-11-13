// The herring heist: a dog (or a cat) steals a herring from the stall, then a gull steals it from the thief. Or nobody does.
// Storyboard: storyboards/herringHeist.md. Every B(...) below is one beat of it, with who must be on screen.
import * as THREE from 'three';
import { wait, tween, all, race, waitUntil, ease, clamp, lerp, TAU, sculpt, piece, MAT, disposeTree } from '../kit.js';
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

  /** A herring, long axis along x (it hangs crosswise in a beak). */
  const herring = () => sculpt((v) => {
    v.box(-0.25, 0, -0.07, 0.5, 0.12, 0.14, '#b8c7d1');
    v.box(-0.25, 0.1, -0.07, 0.4, 0.03, 0.14, '#8fa3ad');
    v.box(0.25, -0.02, -0.04, 0.12, 0.2, 0.08, '#8fa3ad');
    v.box(-0.27, 0.04, -0.08, 0.04, 0.04, 0.16, '#111');
  });
  /** The keeper's crate: herring on ice. */
  const crate = () => sculpt((v) => {
    v.box(-0.3, 0, -0.2, 0.6, 0.22, 0.4, '#8a5a35');
    v.box(-0.27, 0.22, -0.17, 0.54, 0.04, 0.34, '#e8eef2');
    for (let i = 0; i < 3; i++) v.box(-0.2 + i * 0.17, 0.26, -0.1, 0.14, 0.06, 0.2, '#b8c7d1');
  });
  const ladle = () => sculpt((v) => { v.box(-0.02, 0, -0.02, 0.04, 0.7, 0.04, '#8a8f95'); v.box(-0.1, 0.7, -0.1, 0.2, 0.08, 0.2, '#b8bec5'); });
  // a herring or fish stall; a chips stall will do (the keeper brings his own crate of herring), a flower stall will not
  const isFish = (s) => s.label === 'HARING' || s.label === 'VIS' || s.label === 'FRIET';
  const fishStalls = (ctx) => (ctx.L.stalls || []).filter(isFish);

  /** Wait until the shot that was just asked for is really up (the point is in the picture): entrances are only made in view after that. */
  const shotUp = function* (ctx, x, z, y = 1) { yield* waitUntil(() => seen(ctx, x, z, y), 2); yield* wait(0.2); };

  return {
    w: [0, 2, 2, 1, 1], crime: 1,
    // a REAL herring (or fish) stall, with room on the pavement in front of it to run along
    avail: (ctx) => fishStalls(ctx).length > 0,
    stage: { anchor: 'fish', reach: 8, pave: { side: 'any', len: 4, depth: 1.2 } },
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'herringHeist'), B = beatsFor(ctx, 'herringHeist'), R = rig(ctx);
      const list = fishStalls(ctx);
      if (!list.length) return;
      const stg = ctx.stage;
      const s = stg && stg.x != null ? list.slice().sort((a, b) => Math.abs(a.x - stg.x) - Math.abs(b.x - stg.x))[0] : rnd.pick(list);
      const sx = s.x, szc = s.z + 1.3;                    // the stall's centre (setting.js: furn('stall', b.x, b.z + 1.3))
      const fn = szc > 0 ? -1 : 1;                        // the front of the stall faces the street
      const cz = szc + fn * 0.2, ty = 1.42;                // the counter: a herring lies on it at this height
      const catThief = flip(ctx, 'cat', 0.4), gullEnd = flip(ctx, 'gull', 0.65);
      // the dog runs the way along the pavement in front of the stall that has the longer clear run
      const runZ = szc + fn * 1.9;
      const ends = [1, -1].map((d) => ({ d, x: S.runway(ctx, sx, runZ, d, 8, 0.5, { ignore: [s] }) }));
      ends.sort((a, b) => Math.abs(b.x - sx) - Math.abs(a.x - sx));
      const dir = ends[0].d, farX = clamp(ends[0].x, EX0, EX1);
      let done = false;
      try {
        const thief = catThief ? makeCat(rnd) : makeDog(rnd), keeper = makePerson(rnd, { kind: 'chef' });
        thief.ignore = [s]; keeper.ignore = [s];
        const stallPt = pt(sx, szc + fn * 0.6);
        const kx = sx - dir * 1.95, kz = szc + fn * 0.55;          // the keeper works at the end of his stall
        const slots = [[-dir * 0.7, 0.1], [dir * 0.15, -0.05], [dir * 0.55, 0.12]];   // where the herring lie on the counter
        const heroX = sx + slots[2][0];
        const sitX = sx - dir * 0.6, sitZ = szc + fn * 2.0;           // where the thief waits
        const bark = (t) => { ctx.sfx(catThief ? 'meow' : 'bark'); say(ctx, thief, t ? 'MIAUW' : 'WOEF!', { size: 16, color: '#fff', off: 1.0 }); };

        // ---- 1. the keeper carries in a crate of herring and sets it out on the counter: that is where the fish come from
        B('1 the keeper carries in a crate of herring', [stallPt]);
        cam.wide(stallPt, { dist: 11, el: 0.2, az: dir * 1.1 }); // (tight on the stall: the frame's edge is a few metres away, so the keeper is in the picture almost at once)
        const cr = crate();
        keeper.hold(cr, 'front'); keeper.arms = 'carry'; keeper.mood = 'happy';
        yield* waitUntil(() => seen(ctx, kx, kz) && !seen(ctx, kx - dir * 15, kz), 2); // (the tight shot is up before he walks into it)
        yield* R.enter(keeper, kx, kz, undefined, { speed: 3.6, ignore: [s] });
        keeper.heading = Math.atan2(sx - kx, szc - kz);
        keeper.arms = 'reach';
        const fish = [];
        for (let i = 0; i < 3; i++) {
          const f = R.add(herring());
          f.position.set(kx, 1.15, kz);
          const [ox, oz] = slots[i];
          yield* arc(f, sx + ox, ty, cz + oz, 0.25, 0.3, 0);
          f.rotation.y = i * 0.5 - 0.4;
          fish.push(f);
          ctx.sfx('pop', 1.3);
          keeper.squash(0.1);
        }
        const hero = fish[2], loose = fish[1];
        R.discard(keeper);
        const crateOnGround = R.add(crate());
        crateOnGround.position.set(kx - dir * 0.7, 0, kz - fn * 0.3);
        keeper.arms = 'rub';
        say(ctx, keeper, 'VERSE HARING!', { size: 15, color: '#ffe08a' });
        yield* wait(0.5);
        keeper.arms = 'hips'; keeper.mood = 'smug'; keeper.heading = Math.atan2(sx - kx, szc - kz);

        // ---- 1b. the thief turns up and sits down in front of the counter, staring
        B('1b ' + (catThief ? 'the cat' : 'the dog') + ' trots up and sits down in front of the counter', [pt(sitX, sitZ)]);
        cam.shot({ on: [pt(sitX, sitZ), stallPt], fit: true, dist: 9, el: 0.2, az: dir * 1.1, cut: 0.4 });
        yield* wait(0.3);
        yield* R.enter(thief, sitX, sitZ, undefined, { speed: 2.6, dir: -dir, ignore: [s] });
        thief.face(Math.atan2(sx - sitX, szc - sitZ));
        yield* wait(0.8);

        // ---- 2. reveal: the innocent face
        B('2 reveal: ' + (catThief ? 'the cat' : 'the dog') + ', looking angelic', [thief]);
        thief.heading = 0;
        cam.low(thief, { dist: 4.2, el: 0.02, az: dir * 1.2, y: 0.5, fov: 36 });
        cam.card(catThief ? 'DE KATTENKWAAD' : 'DE HARINGDIEF', 'Butter would not melt. Herring would.', 2.1);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        yield* hop(thief, 0.14, 0.2);
        yield* wait(0.2);
        yield* hop(thief, 0.14, 0.2);
        yield* wait(0.4);

        // ---- 3. the grab: a noise at nothing behind the keeper, a leap, YOINK
        B('3 the grab: the keeper looks away, the thief snatches the herring', [thief, hero]);
        cam.shot({ on: [thief, hero], y: 0.9, dist: 6.5, el: 0.05, az: dir * 1.1, fov: 38, fit: true, cut: 0.8 });
        const bait = { x: sx + dir * 3.2, z: szc - fn * 3 };
        thief.heading = Math.atan2(bait.x - sitX, bait.z - sitZ);
        yield* wait(0.3);
        bark(catThief); yield* hop(thief, 0.2, 0.18);
        bark(catThief); yield* hop(thief, 0.2, 0.18);
        keeper.lookAt = bait; keeper.arms = 'swing'; keeper.mood = 'shock';
        yield* wait(0.2);
        keeper.heading = Math.atan2(bait.x - kx, bait.z - kz); keeper.arms = 'point';
        say(ctx, keeper, 'hè?', { size: 15, color: '#fff' });
        yield* wait(0.6);
        // creep up to the counter, back turned on the keeper
        const gx = heroX, gz = szc + fn * 1.2;
        yield* go(ctx, thief, gx, gz, 1.8, 0.06, { ignore: [s] });
        thief.heading = Math.atan2(0, -fn);
        yield* wait(0.2);
        const dp = thief.g.position;
        thief.air = true;
        let grabbed = false, mouthFish = null;
        const mouthZ = catThief ? 0.5 : 0.72;
        yield* tween(0.5, (u) => {
          dp.y = Math.sin(u * Math.PI) * (ty + 0.1);
          if (!grabbed && u > 0.5) {
            grabbed = true;
            R.rm(hero);
            const f = herring();
            thief.b.add(f);
            f.position.set(0, 0.42, mouthZ);
            mouthFish = f;
            ctx.sfx('yoink');
            say(ctx, thief, 'YOINK!', { size: 24, color: '#ffd60a', off: 1.0 });
            ctx.shake(0.15);
            // a paw sends another herring flying off the counter and onto the pavement
            const lq = S.findSpot(ctx, sx + dir * 3.0, runZ - fn * 0.2, 0.25, 6);
            R.run(arc(loose, lq ? lq.x : sx + dir * 2.8, 0.05, lq ? lq.z : runZ, 1.1, 0.8, 9));
          }
        });
        dp.y = 0; thief.air = false;
        ctx.incident(1);
        ctx.news(`${catThief ? 'Cat' : 'Dog'} steals ${s.label === 'HARING' ? 'herring' : 'fish'}, shows zero remorse`);
        yield* wait(0.25);
        keeper.lookAt = null;
        keeper.heading = Math.atan2(sx - kx, szc - kz); keeper.arms = 'up'; keeper.mood = 'angry';
        yield* doubleTake(ctx, keeper, 'MIJN HARING!');

        // ---- 4. the chase: the thief trots off, head high; the keeper follows with the ladle and slips on the fish that flew off
        B('4 the chase: the thief trots off with the fish, the keeper follows', [thief]);
        thief.speed = 4.4;
        const thiefRun = R.run(go(ctx, thief, farX, runZ, 4.4, 0.06, { ignore: [s] }));
        cam.track(thief, { dist: 9, el: 0.1, az: -dir * 0.5, lead: 2.5, fov: 34, shake: 0.3 });
        bark(catThief);
        const lad = keeper.hold(ladle());
        keeper.arms = 'fist';
        yell(ctx, keeper, rnd.pick(['KOM TERUG!', 'HÉ! DIEF!', 'STOP DIEF!']), '#ff6b6b', 15);
        yield* wait(0.8);
        const slipX = loose.position.x;
        let slipped = false;
        R.run(goEach(ctx, keeper, slipX + dir * 3, runZ, 5.2, () => {
          if (!slipped && Math.abs(keeper.g.position.x - (slipX - dir * 0.2)) < 0.5) { slipped = true; return true; }
        }, { ignore: [s] }));
        yield* waitUntil(() => slipped, 4);
        B('4b the keeper slips on a herring', [keeper, loose]);
        cam.dutch(keeper, { dist: 7, el: 0.1, az: dir * 0.3, y: 0.8 });
        ctx.sfx('boing');
        R.discard(keeper);
        const flung = R.add(ladle());
        flung.position.set(keeper.g.position.x, 1.2, keeper.g.position.z);
        R.run(arc(flung, slipX + dir * 4, 0.0, runZ - fn * 0.8, 3, 1.1, 8));
        yield* tumble(ctx, keeper, slipX + dir * 2.2, runZ, 1.4, 0.7);
        say(ctx, keeper, 'AAAH!', { size: 18, color: '#fff' });
        R.run(seeStars(ctx, keeper, 2.6));
        yield* wait(0.9);
        yield* waitUntil(() => thiefRun.done, 5);

        let gp = { x: dp.x, z: dp.z };
        if (gullEnd) {
          // ---- 5. the gull: a dive from beyond the frame, a snatch, a swap
          B('5 the gull: it drops out of the sky and takes the herring', [thief]);
          thief.heading = dir > 0 ? E : W;
          const gull = makeBird(rnd, 'gull');
          gull.fly = true;
          cam.shot({ on: [thief, pt(dp.x + dir * 6, runZ)], y: 1.5, dist: 13, el: 0.12, az: -dir * 0.4, fov: 38, fit: true, cut: 0.9 });
          ctx.sfx('squawk');
          yield* wait(0.5);
          const mouth = () => ({ x: dp.x + Math.sin(thief.heading) * 0.55, z: dp.z + Math.cos(thief.heading) * 0.55 });
          const m0 = mouth();
          const swoop = R.run(R.enter(gull, m0.x + Math.sin(thief.heading) * 0.45, m0.z + Math.cos(thief.heading) * 0.45, 0.62, { dir: -dir, speed: 12 }));
          yield* wait(0.9);
          B('5b the swap: the gull snatches the herring out of the thief\'s mouth', [gull, thief]);
          cam.close(thief, { dist: 4, el: 0.06, az: -dir * 0.5, y: 0.5, fov: 36, cut: 0.4 });
          yield* waitUntil(() => swoop.done, 4);
          const gq = gull.g.position;
          ctx.sfx('squawk');
          ctx.fx.burst(gq.x, 0.6, gq.z, { n: 14, colors: ['#ffffff', '#cfd8e0'], speed: 3, up: 2, size: 0.1 }); // feathers
          ctx.shake(0.15);
          if (mouthFish) { thief.b.remove(mouthFish); gull.b.add(mouthFish); mouthFish.position.set(0, 0.34, 0.66); }
          say(ctx, gull, 'KRAA!', { size: 20, color: '#ffd60a', off: 1.0 });
          yield* hop(thief, 0.4, 0.25);
          yield* wait(0.35);
          R.run((function* () {
            const q = gull.g.position;
            yield* fly(gull, q.x + dir * 6, 6, q.z - 3, 9);
            for (let i = 0; i < 6; i++) {
              yield* fly(gull, q.x + dir * 7, Math.min(q.y + 2, 16), q.z - 1, 11);
              if (!seen(ctx, q.x, q.z, q.y, 0.15)) break;
            }
            R.gone(gull);
          })());
          thief.heading = dir > 0 ? E : W;
          say(ctx, thief, '?!', { size: 20, color: '#fff', off: 1.0 });
          yield* wait(0.9);
          B('5c both look up at the gull', [thief, keeper]);
          cam.two(keeper, thief, { fit: true, dist: 9, el: 0.1, az: dir * 0.3 });
          keeper.lookAt = { x: gq.x + dir * 6, z: gq.z - 4 };
          thief.heading = Math.atan2(dir * 6, -4);
          keeper.mood = 'sad'; keeper.arms = 'swing';
          yield* wait(1.4);
        } else {
          // ---- 5. no gull: the thief sits down a long way off, and the fish is gone before the keeper arrives
          B('5 the thief gobbles the herring', [thief]);
          cam.close(thief, { dist: 4.5, el: 0.06, az: -dir * 0.4, y: 0.5, fov: 36, cut: 0.6 });
          thief.heading = 0;
          yield* wait(0.4);
          if (mouthFish) { thief.b.remove(mouthFish); disposeTree(mouthFish); mouthFish = null; } // eaten: gone for good
          ctx.sfx('gulp');
          yield* hop(thief, 0.25, 0.22);
          say(ctx, thief, catThief ? 'prr...' : '*slurp*', { size: 14, color: '#b9fbc0', off: 1.0 });
          thief.mood = 'happy';
          yield* wait(0.9);
          B('5c the keeper arrives to an empty mouth', [thief, keeper]);
          cam.two(keeper, thief, { fit: true, dist: 9, el: 0.1, az: dir * 0.3 });
          keeper.lookAt = thief;
          keeper.mood = 'sad'; keeper.arms = 'swing';
          yield* wait(1.4);
        }

        // ---- 6. epilogue: sad trombone, a pat, a small fish from his pocket... and back to the stall together
        B('6 epilogue: sad trombone, a pat on the head, a small fish, back to the stall', [keeper, thief]);
        ctx.sfx('womp');
        yield* getUp(keeper, 'sad');
        keeper.lookAt = null;
        cam.wide(pt((sx + farX) / 2, runZ), { dist: 15, el: 0.2, az: -dir * 0.25, cut: 0.9 });
        yield* wait(0.6);
        yield* go(ctx, keeper, dp.x - dir * 1.1, dp.z - 0.3, 2.6, 0.06, { ignore: [s] });
        keeper.heading = Math.atan2(dir, 0.3); keeper.lookAt = thief; keeper.arms = 'reach'; keeper.mood = 'happy';
        thief.heading = Math.atan2(-dir, 0);
        keeper.squash(0.12);
        yield* hop(thief, 0.2, 0.2);
        say(ctx, keeper, 'toe maar...', { size: 13, color: '#cfe8ff' });
        yield* wait(0.9);
        // a small herring from his apron pocket, for the thief
        const treat = R.add(herring());
        treat.scale.setScalar(0.6);
        treat.position.set(keeper.g.position.x, 1.0, keeper.g.position.z);
        keeper.arms = 'point';
        ctx.sfx('swish');
        yield* arc(treat, dp.x, 0.4, dp.z, 0.5, 0.45, 3);
        R.rm(treat);
        ctx.sfx('gulp');
        yield* hop(thief, 0.3, 0.22);
        say(ctx, thief, catThief ? 'miauw' : 'WOEF!', { size: 15, color: '#b9fbc0', off: 1.0 });
        keeper.arms = 'swing';
        yield* wait(0.6);
        // the payoff has landed: the camera lets go and the rig walks the pair off together
        keeper.mood = 'happy';
        yield* wait(0.6);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
