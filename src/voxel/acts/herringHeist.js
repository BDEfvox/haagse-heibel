// The herring heist: a dog steals a herring from the stall, then a gull steals it from the dog.
// Storyboard: storyboards/herringHeist.md. Every B(...) below is one beat of it, with who must be on screen.
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

  /** A herring, long axis along x (it hangs crosswise in a beak). */
  const herring = () => sculpt((v) => {
    v.box(-0.25, 0, -0.07, 0.5, 0.12, 0.14, '#b8c7d1');
    v.box(-0.25, 0.1, -0.07, 0.4, 0.03, 0.14, '#8fa3ad');
    v.box(0.25, -0.02, -0.04, 0.12, 0.2, 0.08, '#8fa3ad');
    v.box(-0.27, 0.04, -0.08, 0.04, 0.04, 0.16, '#111');
  });
  /** A little display table with a tray of herring (the stall's counter, wherever it stands). */
  const table = () => sculpt((v) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) v.box(sx * 0.5 - 0.04, 0, sz * 0.25 - 0.04, 0.08, 0.8, 0.08, '#6b4a2f');
    v.box(-0.6, 0.8, -0.34, 1.2, 0.06, 0.68, '#8a5a35');
    v.box(-0.5, 0.86, -0.26, 1.0, 0.03, 0.52, '#e8eef2');
    v.box(-0.5, 0.89, -0.26, 1.0, 0.08, 0.03, '#21468b');
  });
  const ladle = () => sculpt((v) => { v.box(-0.02, 0, -0.02, 0.04, 0.7, 0.04, '#8a8f95'); v.box(-0.1, 0.7, -0.1, 0.2, 0.08, 0.2, '#b8bec5'); });

  return {
    w: [0, 2, 2, 1, 1], crime: 1,
    avail: (ctx) => ctx.L.stalls.length > 0,
    *run(ctx) {
      const { L, rnd } = ctx, cam = camFor(ctx, 'herringHeist'), B = beatsFor(ctx, 'herringHeist'), R = rig(ctx);
      const s = rnd.pick(L.stalls), zz = Math.min(s.z, L.s0 - 0.6);
      const dir = s.x > 0 ? -1 : 1;                     // the way the dog runs: towards the middle of the street
      const tx = s.x - dir * 0.2, ty = 0.9;             // the herring table
      let done = false;
      try {
        const dog = makeDog(rnd), keeper = makePerson(rnd, { kind: 'chef' });
        const tablePt = pt(tx, zz);
        const tbl = R.add(table());
        tbl.position.set(tx, 0, zz);
        const hero = R.add(herring());                  // the herring in question
        hero.position.set(tx + dir * 0.3, ty, zz);
        const loose = R.add(herring());                 // the one the dog will knock off the tray
        loose.position.set(tx - dir * 0.2, ty, zz + 0.1); loose.rotation.y = 0.5;
        for (const [px, pz, ry] of [[-dir * 0.3, -0.12, -0.3], [dir * 0.05, -0.1, 0.2]]) {
          const f = R.add(herring()); f.position.set(tx + px, ty, zz + pz); f.rotation.y = ry;
        }
        const kx = tx, kz = zz - 0.8;
        const sitX = tx - dir * 1.7, sitZ = zz + 0.35;

        // ---- 1. the stall: the keeper arranges his herring proudly, the dog stares
        B('1 the stall: keeper, dog and a tray of herring', [keeper, dog, tablePt]);
        cam.wide(tablePt, { dist: 15, el: 0.2, az: dir * 0.25, hold: 5.5 });
        yield* R.enter(keeper, kx, kz);
        keeper.heading = 0; keeper.mood = 'happy'; keeper.arms = 'reach';
        yield* R.enter(dog, sitX, sitZ);
        dog.face(dir > 0 ? E : W);
        for (let i = 0; i < 2; i++) { keeper.squash(0.1); ctx.sfx('pop', 1.3); yield* wait(0.5); }
        keeper.arms = 'rub';
        say(ctx, keeper, 'VERSE HARING!', { size: 15, color: '#ffe08a' });
        yield* wait(0.9);
        keeper.arms = 'hips'; keeper.mood = 'smug';
        yield* wait(0.7);

        // ---- 2. reveal: the innocent face
        B('2 reveal: the dog, looking angelic', [dog]);
        dog.heading = 0;
        cam.low(dog, { dist: 3.8, el: -0.02, az: dir * 0.3, y: 0.4, fov: 36, hold: 3 });
        cam.card('DE HARINGDIEF', 'Butter would not melt. Herring would.', 2.1);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        yield* hop(dog, 0.14, 0.2);
        yield* wait(0.2);
        yield* hop(dog, 0.14, 0.2);
        yield* wait(0.4);

        // ---- 3. the grab: a bark at nothing behind the keeper, a leap, YOINK
        B('3 the grab: the dog distracts the keeper and snatches the herring', [dog, hero]);
        cam.shot({ on: [dog, hero], y: 0.6, dist: 6.5, el: 0.05, az: dir * 0.5, fov: 38, fit: true, cut: 0.8, hold: 5 });
        const bait = { x: tx + dir * 3, z: kz - 3 };
        dog.heading = Math.atan2(bait.x - sitX, bait.z - sitZ);
        yield* wait(0.3);
        ctx.sfx('bark');
        say(ctx, dog, 'WOEF!', { size: 16, color: '#fff', off: 1.0 });
        yield* hop(dog, 0.2, 0.18);
        ctx.sfx('bark');
        say(ctx, dog, 'WOEF WOEF!', { size: 16, color: '#fff', off: 1.0 });
        yield* hop(dog, 0.2, 0.18);
        keeper.lookAt = bait; keeper.arms = 'swing'; keeper.mood = 'shock';
        yield* wait(0.2);
        keeper.heading = Math.PI; keeper.lookAt = bait; keeper.arms = 'point';
        say(ctx, keeper, 'hè?', { size: 15, color: '#fff' });
        yield* wait(0.6);
        // creep up to the table, back turned on the keeper
        const gx = tx + dir * 0.3, gz = zz + 0.72;
        yield* go(ctx, dog, gx, gz, 1.8);
        dog.heading = Math.PI;
        yield* wait(0.2);
        const dp = dog.g.position;
        dog.air = true;
        // the leap: up to table height, snap, down again
        let grabbed = false, mouthFish = null;
        yield* tween(0.45, (u) => {
          dp.y = Math.sin(u * Math.PI) * 0.55;
          if (!grabbed && u > 0.45) {
            grabbed = true;
            R.rm(hero);
            const fish = herring();
            dog.b.add(fish);
            fish.position.set(0, 0.42, 0.72);
            mouthFish = fish;
            ctx.sfx('yoink');
            say(ctx, dog, 'YOINK!', { size: 24, color: '#ffd60a', off: 1.0 });
            ctx.shake(0.15);
            // the dog's paws send another herring flying off the tray
            R.run(arc(loose, tx + dir * 3.1, 0.05, zz + 0.6, 1.1, 0.8, 9));
          }
        });
        dp.y = 0; dog.air = false;
        ctx.incident(1);
        ctx.news(`Dog steals ${s.label === 'HARING' ? 'herring' : 'snack'}, shows zero remorse`);
        yield* wait(0.25);
        keeper.lookAt = null;
        keeper.heading = 0; keeper.arms = 'up'; keeper.mood = 'angry';
        yield* doubleTake(ctx, keeper, 'MIJN HARING!');

        // ---- 4. the chase: dog trots off, head high; the keeper slips on the fish that flew off
        B('4 the chase: the dog trots off with the fish, the keeper follows', [dog]);
        const farX = clamp(tx + dir * 11, EX0, EX1), runZ = zz + 0.6;
        dog.speed = 4.4;
        const dogRun = R.run(go(ctx, dog, farX, runZ, 4.4));
        cam.track(dog, { dist: 9, el: 0.1, az: -dir * 0.5, lead: 2.5, fov: 34, shake: 0.3, hold: 3 });
        ctx.sfx('bark');
        const lad = keeper.hold(ladle());
        keeper.arms = 'fist';
        yell(ctx, keeper, rnd.pick(['KOM TERUG!', 'HÉ! HOND!', 'STOP DIEF!']), '#ff6b6b', 15);
        yield* wait(0.8);
        const slipX = tx + dir * 3.1;
        let slipped = false;
        R.run(goEach(ctx, keeper, slipX + dir * 3, runZ, 5.2, () => {
          if (!slipped && Math.abs(keeper.g.position.x - (slipX - dir * 0.2)) < 0.5) { slipped = true; return true; }
        }));
        yield* waitUntil(() => slipped, 4);
        B('4b the keeper slips on a herring', [keeper, loose]);
        cam.dutch(keeper, { dist: 7, el: 0.1, az: dir * 0.3, y: 0.8, hold: 3.5 });
        ctx.sfx('boing');
        keeper.drop();
        const flung = R.add(ladle());
        flung.position.set(keeper.g.position.x, 1.2, keeper.g.position.z);
        R.run(arc(flung, slipX + dir * 5, 0.0, runZ - 1.2, 3, 1.1, 8));
        yield* tumble(ctx, keeper, slipX + dir * 2.2, runZ, 1.4, 0.7);
        say(ctx, keeper, 'AAAH!', { size: 18, color: '#fff' });
        R.run(seeStars(ctx, keeper, 2.6));
        yield* waitUntil(() => dogRun.done, 5);

        // ---- 5. the gull: a dive, a snatch, a swap
        B('5 the gull: it drops out of the sky and takes the herring', [dog]);
        dog.heading = dir > 0 ? E : W;
        const gull = makeBird(rnd, 'gull');
        gull.fly = true; gull.air = true;
        const gx0 = clamp(dp.x + dir * 10, EX0, EX1);
        R.spawn(gull, gx0, runZ - 3, 11);
        gull.face(gx0 > dp.x ? W : E);
        cam.shot({ on: [dog, pt(gx0, runZ)], y: 3.5, dist: 13, el: 0.12, az: -dir * 0.4, fov: 38, fit: true, cut: 0.9, hold: 2.2 });
        ctx.sfx('squawk');
        yield* wait(0.5);
        const mouth = () => ({ x: dp.x + Math.sin(dog.heading) * 0.55, z: dp.z + Math.cos(dog.heading) * 0.55 });
        const swoopTo = mouth();
        const swoop = R.run(fly(gull, swoopTo.x + Math.sin(dog.heading) * 0.45, 0.62, swoopTo.z + Math.cos(dog.heading) * 0.45, 12));
        yield* wait(1.0);
        cam.close(dog, { dist: 4, el: 0.06, az: -dir * 0.5, y: 0.5, fov: 36, cut: 0.4, hold: 2.5 });
        B('5b the swap: the gull snatches the herring out of the dog\'s mouth', [gull, dog]);
        yield* waitUntil(() => swoop.done, 3);
        const gp = gull.g.position;
        ctx.sfx('squawk');
        ctx.fx.burst(gp.x, 0.6, gp.z, { n: 14, colors: ['#ffffff', '#cfd8e0'], speed: 3, up: 2, size: 0.1 }); // feathers
        ctx.shake(0.15);
        // the fish changes beaks
        if (mouthFish) { dog.b.remove(mouthFish); gull.b.add(mouthFish); mouthFish.position.set(0, 0.34, 0.66); }
        say(ctx, gull, 'KRAA!', { size: 20, color: '#ffd60a', off: 1.0 });
        yield* hop(dog, 0.4, 0.25);
        yield* wait(0.35);
        R.run((function* () {
          yield* fly(gull, gp.x + dir * 10, 6, gp.z - 4, 9);
          yield* fly(gull, gp.x + dir * 28, 12, gp.z - 8, 11);
          R.gone(gull);
        })());
        dog.heading = dir > 0 ? E : W;
        say(ctx, dog, '?!', { size: 20, color: '#fff', off: 1.0 });
        yield* wait(0.9);
        // both look up at the gull
        B('5c both look up at the gull', [dog, keeper]);
        cam.two(keeper, dog, { fit: true, dist: 9, el: 0.1, az: dir * 0.3, hold: 3.2 });
        keeper.lookAt = { x: gp.x + dir * 6, z: gp.z - 4 };
        dog.heading = Math.atan2(dir * 6, -4);
        keeper.mood = 'sad'; keeper.arms = 'swing';
        yield* wait(1.4);

        // ---- 6. epilogue
        B('6 epilogue: sad trombone, a pat on the head, a small fish, back to the stall', [keeper, dog]);
        ctx.sfx('womp');
        yield* getUp(keeper, 'sad');
        keeper.lookAt = null;
        cam.wide(pt((tx + farX) / 2, zz), { dist: 18, el: 0.2, az: -dir * 0.25, cut: 0.9, hold: 8 });
        yield* wait(0.6);
        yield* go(ctx, keeper, dp.x - dir * 1.1, dp.z - 0.3, 2.6);
        keeper.heading = Math.atan2(dir, 0.3); keeper.lookAt = dog; keeper.arms = 'reach'; keeper.mood = 'happy';
        dog.heading = Math.atan2(-dir, 0);
        keeper.squash(0.12);
        yield* hop(dog, 0.2, 0.2);
        say(ctx, keeper, 'toe maar...', { size: 13, color: '#cfe8ff' });
        yield* wait(0.9);
        // a small herring from his pocket, for the dog
        const treat = R.add(herring());
        treat.scale.setScalar(0.6);
        treat.position.set(keeper.g.position.x, 1.0, keeper.g.position.z);
        keeper.arms = 'point';
        ctx.sfx('swish');
        yield* arc(treat, dp.x, 0.4, dp.z, 0.5, 0.45, 3);
        R.rm(treat);
        ctx.sfx('gulp');
        yield* hop(dog, 0.3, 0.22);
        say(ctx, dog, 'WOEF!', { size: 15, color: '#b9fbc0', off: 1.0 });
        keeper.arms = 'swing';
        yield* wait(0.6);
        // together back to the stall
        R.run(go(ctx, dog, sitX, sitZ, 2.4));
        yield* go(ctx, keeper, kx, kz + 0.1, 2.4);
        keeper.heading = 0; keeper.mood = 'happy';
        yield* R.settle(8);
        dog.face(dir > 0 ? E : W);
        yield* wait(0.8);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
