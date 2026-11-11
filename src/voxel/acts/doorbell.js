// Belletje trek: two kids ring a doorbell and run; the second time the resident is waiting with a bucket.
// Storyboard: storyboards/doorbell.md. Every B(...) below is one beat of it, with who must be on screen.
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

  const houses = (ctx) => S.housesNear(ctx, 0, 18, { door: true, shop: false, tower: false });
  /** A grey bucket, full to the brim with water when `full`. */
  const bucket = (full) => sculpt((v) => {
    v.box(-0.2, 0, -0.2, 0.4, 0.04, 0.4, '#8d99a6');
    v.box(-0.2, 0.04, -0.2, 0.4, 0.32, 0.04, '#9aa5b1'); v.box(-0.2, 0.04, 0.16, 0.4, 0.32, 0.04, '#9aa5b1');
    v.box(-0.2, 0.04, -0.16, 0.04, 0.32, 0.32, '#9aa5b1'); v.box(0.16, 0.04, -0.16, 0.04, 0.32, 0.32, '#9aa5b1');
    if (full) v.box(-0.16, 0.04, -0.16, 0.32, 0.28, 0.32, '#4f9bff');
  });
  /** Where the kids hide: behind a bin 3.5 to 8 m past the door if there is one, otherwise a clear bit of pavement 5 to 7 m on. */
  const hideSpot = (ctx, h, dir, rnd) => {
    let best = null, bd = 99;
    for (const b of ctx.L.bins || []) {
      const d = (b.x - h.door.x) * dir;
      if (d >= 3.5 && d <= 8 && d < bd && Number.isFinite(b.z)) { bd = d; best = b; }
    }
    if (best) return { x: best.x, z: best.z + 0.75, bin: true };
    const hx = clamp(h.door.x + dir * rnd.range(5, 7), EX0 + 1, EX1 - 1), hz = padZ(ctx, 'walkB0', hx);
    const p = S.findSpot(ctx, hx, hz, 0.5, 10, { ground: 'open' });
    return { x: p ? p.x : hx, z: p ? p.z : hz, bin: false };
  };

  return {
    w: [0, 3, 2, 1, 0.5], crime: 1,
    avail: (ctx) => houses(ctx).length > 0, // needs a real front door
    *run(ctx) {
      const { L, rnd } = ctx, cam = camFor(ctx, 'doorbell'), B = beatsFor(ctx, 'doorbell'), R = rig(ctx);
      const h = rnd.pick(houses(ctx));
      if (!h) return;
      const dx = h.door.x, dz = h.door.z, dir = dx > 0 ? -1 : 1, doorPt = pt(dx, dz);
      let done = false;
      try {
        const hide = hideSpot(ctx, h, dir, rnd);
        const hidePt = pt(hide.x, hide.z);
        const a = makePerson(rnd, { kind: 'kid' }), b = makePerson(rnd, { kind: 'kid' }); // a is the brave one
        const owner = makePerson(rnd, { kind: rnd.pick(['granny', 'civ']), shirt: '#8e5a9b' });
        // the bell, and the hall light that shows when the door is open
        const bellX = dx + 0.5, bellZ = dz + 0.3;
        R.add(sculpt((v) => v.box(bellX - 0.05, 1.1, dz - 0.25, 0.1, 0.1, 0.05, '#ffd60a'), MAT.glow));
        const hall = R.add(sculpt((v) => v.box(dx - 0.5, 0, dz - 0.15, 1.0, 2.0, 0.05, '#ffe9a8'), MAT.glow));
        hall.visible = false;

        // ---- 1. the dare: creeping along the fronts, a push in the back, giggles
        B('1 the dare: two kids creep along, one pushes the other', [a, b]);
        const sx = clamp(dx - dir * 7, EX0, EX1), sz = padZ(ctx, 'walkB0', sx);
        cam.wide(doorPt, { dist: 18, el: 0.25, az: -dir * 0.3, hold: 1.4 });
        yield* R.enter(a, sx, sz);
        yield* R.enter(b, sx - dir * 1.0, sz);
        b.lookAt = a;
        cam.two(a, b, { dist: 8, el: 0.1, az: dir * 0.55, cut: 0.8, hold: 6 });
        const bt = R.run(tiptoe(ctx, b, dx - dir * 3.4, padZ(ctx, 'walkB0', dx), 1.9, false));
        yield* tiptoe(ctx, a, dx - dir * 2.3, padZ(ctx, 'walkB0', dx), 1.9);
        yield* R.settle(4);
        // b gives a shove, a stumbles forward, both snigger
        b.arms = 'push'; b.mood = 'happy'; a.lookAt = b;
        say(ctx, b, 'ga nou!', { size: 13, color: '#b9fbc0' });
        yield* wait(0.3);
        ctx.sfx('boing');
        a.squash(0.2);
        yield* hop(a, 0.2, 0.2);
        a.lookAt = null; b.lookAt = null; b.arms = 'sneak';
        say(ctx, a, 'hihihi', { size: 13, color: '#b9fbc0' });
        yield* wait(0.6);

        // ---- 2. reveal
        B('2 reveal: the brave one grins at us', [a]);
        a.heading = 0; a.mood = 'smug'; a.arms = 'rub';
        cam.hero(a, { hold: 3 });
        cam.card('BELLETJE TREK', 'Nine years old. Zero regrets.', 2.1);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        yield* laugh(ctx, a, 0.9, 'he');
        a.arms = 'swing';

        // ---- 3. the ring: tiptoe, stretch, DING DONG
        B('3 the ring: on tiptoe, finger on the bell', [a, doorPt]);
        cam.low(a, { dist: 5, el: 0.04, az: -dir * 0.35, y: 0.9, fov: 38, cut: 0.7, hold: 4.5 });
        yield* wait(0.3);
        yield* go(ctx, a, bellX, bellZ, 2.2);
        a.heading = Math.PI; a.mood = 'focus'; a.arms = 'reach';
        a.air = true;
        yield* tween(0.5, (u) => { a.g.position.y = u * 0.14; });
        yield* wait(0.35);
        a.squash(0.1);
        ctx.sfx('dingdong');
        ctx.fx.text('DING DONG!', at(dx, 2.4, dz - 0.3), { size: 22, color: '#ffe08a' });
        ctx.shake(0.1);
        ctx.incident(1);
        ctx.news('Belletje-lellen wave continues; prime suspect is nine');
        yield* wait(0.45);
        a.g.position.y = 0; a.air = false;

        // ---- 4. the run: both bolt laughing and crouch out of sight, peeking
        B('4 the run: both kids bolt, laughing, and hide', [a, b]);
        a.arms = 'swing'; a.mood = 'happy'; a.heading = 0;
        cam.track([a, b], { dist: 10, el: 0.12, az: dir * 0.5, lead: 2, fov: 34, shake: 0.4, hold: 3 });
        const trailA = R.run(runDust(ctx, a)), trailB = R.run(runDust(ctx, b));
        cackle(ctx, a, 1.5, 'ha'); cackle(ctx, b, 1.5, 'ha');
        R.run(go(ctx, b, hide.x + dir * 0.8, hide.z, 6.4));
        yield* go(ctx, a, hide.x, hide.z, 6.6);
        yield* R.settle(4);
        R.stop(trailA); R.stop(trailB);
        a.pose = 'crouch'; b.pose = 'crouch';
        a.heading = faceDir(a, dx, dz); b.heading = faceDir(b, dx, dz);
        a.mood = 'sly'; b.mood = 'sly';
        a.lookAt = { x: dx, z: dz }; b.lookAt = { x: dx, z: dz };
        a.squash(0.2); b.squash(0.2);
        cam.ground(hidePt, { dist: 5, el: 0.04, az: dir * 0.3, y: 0.5, hold: 3 });
        say(ctx, b, 'sst!', { size: 13, color: '#fff' });
        yield* wait(0.9);

        // ---- 5. the door: the resident looks left, right, shrugs, goes back in
        B('5 the door: the resident looks around', [owner]);
        cam.close(owner, { dist: 6, el: 0.05, az: -dir * 0.25, y: 1.0, hold: 5 });
        owner.heading = 0;
        owner.mood = 'neutral';
        hall.visible = true;
        ctx.sfx('door');
        yield* R.enter(owner, dx, dz, 0.001);
        owner.heading = 0;
        yield* wait(0.3);
        say(ctx, owner, '?!', { size: 20, color: '#fff' });
        yield* wait(0.4);
        owner.heading = E; yield* wait(0.55);
        owner.heading = W; yield* wait(0.55);
        owner.heading = 0; owner.lookAt = { x: dx, z: dz + 8 };
        yield* hop(owner, 0.18, 0.2); // up at the window
        yield* wait(0.3);
        owner.lookAt = null;
        owner.arms = 'shrug';
        say(ctx, owner, 'hm...', { size: 13, color: '#cfe8ff' });
        yield* wait(0.9);
        owner.arms = 'swing';
        ctx.sfx('door');
        yield* R.out(owner);
        hall.visible = false;

        // ---- 6. again: the kid cannot resist; the resident was waiting with a bucket
        B('5b the kids confer in their hiding place', [a, b]);
        cam.two(a, b, { dist: 5.5, el: 0.04, az: dir * 0.2, cut: 0.7, hold: 3 });
        yield* wait(0.3);
        a.pose = null; a.lookAt = null; a.mood = 'happy'; a.arms = 'rub';
        b.lookAt = null; b.mood = 'scared';
        b.shakeT = 1.1; say(ctx, b, 'NEE!', { size: 15, color: '#fff' });
        yield* wait(0.9);
        a.nodT = 1.0; say(ctx, a, 'nog één keer!', { size: 13, color: '#b9fbc0' });
        ctx.sfx('snigger');
        yield* wait(1.0);

        B('6 again: the brave one creeps back for another go', [a, doorPt]);
        cam.shot({ on: [a, doorPt], y: 0.8, dist: 12, el: 0.08, az: dir * 0.4, fov: 36, fit: true, cut: 0.8, hold: 8 });
        a.arms = 'sneak';
        const kx = dx + 0.1, kz = dz + 0.95;
        yield* tiptoe(ctx, a, kx, kz, 2.2);
        a.heading = Math.PI; a.arms = 'reach'; a.mood = 'sly';
        yield* wait(0.5);
        // the door flies open: the resident has been waiting behind it
        const pail = bucket(true);
        owner.hold(pail, 'front'); owner.arms = 'carry'; owner.mood = 'smug';
        hall.visible = true;
        ctx.sfx('slam'); ctx.shake(0.25);
        yield* R.enter(owner, dx, dz, 0.001);
        owner.heading = 0; owner.mood = 'angry';
        say(ctx, owner, 'HAH! DAAR!', { size: 18, color: '#ff6b6b' });
        yield* wait(0.3);
        owner.arms = 'push';
        owner.drop();
        // the pail swings out: a wave of water flies across to the kid
        const wave = R.add(sculpt((v) => v.box(-0.45, 0, -0.3, 0.9, 0.45, 0.6, '#4f9bff')));
        const pail2 = R.add(bucket(false));
        pail2.position.set(dx, 1.1, dz + 0.4);
        const kp = a.g.position, w0 = { x: dx, y: 1.2, z: dz + 0.5 };
        R.run(arc(pail2, dx + dir * 0.9, 0.0, dz + 1.3, 1.1, 0.75, 6));
        ctx.sfx('swish');
        yield* tween(0.32, (u) => {
          wave.position.set(lerp(w0.x, kp.x, u), lerp(w0.y, 1.0, u) + Math.sin(u * Math.PI) * 0.25, lerp(w0.z, kp.z, u));
          wave.scale.set(1 + u * 0.6, 1 + u * 0.3, 1 + u);
        });
        R.rm(wave);
        ctx.sfx('splash');
        ctx.fx.burst(kp.x, 1.1, kp.z, { n: 44, colors: ['#4f9bff', '#9ad0ff', '#ffffff'], speed: 4, up: 3, size: 0.12 });
        ctx.fx.pips(kp.x, 1.2, kp.z, 10, ['#4f9bff', '#9ad0ff']);
        ctx.fx.mark(kp.x, 0, kp.z, 0, { w: 1.2, l: 1.2, color: '#4f9bff', life: 6 });
        ctx.fx.text('SPLASH!', at(kp.x, 2.4, kp.z), { size: 28, color: '#9ad0ff' });
        ctx.shake(0.3);
        a.arms = 'up'; a.mood = 'shock'; a.squash(0.35);
        cam.crash(a, { dist: 4.5, hold: 2.6 });
        B('6b splash: the kid stands there dripping', [a, owner]);
        yield* wait(0.5);
        a.arms = 'swing';
        const drip = R.run((function* () { for (;;) { ctx.fx.pips(kp.x, 0.9, kp.z, 2, ['#4f9bff', '#9ad0ff'], 0.07); yield* wait(0.35); } })());
        owner.arms = 'hips'; owner.mood = 'smug';
        yield* wait(1.3);

        // ---- 7. the last laugh
        B('7 the last laugh: the resident laughs, shuts the door', [owner]);
        cam.close(owner, { dist: 5.5, el: 0.05, az: -dir * 0.3, y: 1.0, hold: 3.2 });
        owner.arms = 'swing';
        yield* wait(0.3);
        yield* laugh(ctx, owner, 1.6, 'ha');
        owner.arms = 'rub'; owner.mood = 'smug';
        say(ctx, owner, 'zo.', { size: 14, color: '#b9fbc0' });
        yield* wait(0.6);
        owner.arms = 'swing';
        ctx.sfx('door');
        yield* R.out(owner);
        hall.visible = false;
        ctx.news('Doorbell prankster, nine, gets a bucket of water in return; "worth it", he says');

        B('7b both kids: one laughs, the wet one squelches off', [a, b]);
        cam.wide(pt((kx + hide.x) / 2, kz), { dist: 15, el: 0.2, az: dir * 0.3, hold: 5 });
        b.pose = null; b.mood = 'happy'; b.heading = faceDir(b, kx, kz);
        cackle(ctx, b, 1.8, 'ha');
        yield* wait(0.2);
        a.mood = 'sad'; a.heading = dir * Math.PI / 2;
        say(ctx, a, '*splurp*', { size: 13, color: '#9ad0ff' });
        ctx.sfx('womp');
        yield* wait(0.9);
        R.stop(drip);
        const wet = R.run(squelch(a));
        R.run(R.away(a, dir * 6, 1.7));
        yield* wait(0.5);
        R.run(R.away(b, dir * 7, 2.6));
        yield* R.settle(10);
        R.stop(wet);
        yield* wait(0.3);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }

      /** the heading that faces (x, z) from where a stands */
      function faceDir(p, x, z) { return Math.atan2(x - p.g.position.x, z - p.g.position.z); }
      /** squelchy footsteps: a *splurp* now and then and a few drops */
      function* squelch(p) {
        for (;;) {
          yield* wait(0.55);
          if (!p.alive) return;
          const q = p.g.position;
          ctx.fx.pips(q.x, 0.1, q.z, 2, ['#4f9bff'], 0.07);
          say(ctx, p, '*splurp*', { size: 11, color: '#9ad0ff' });
        }
      }
    },
  };
}
