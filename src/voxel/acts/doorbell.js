// Belletje trek: two kids ring a doorbell and run; the second time the resident is waiting behind the door (with a bucket, or a dog).
// Storyboard: storyboards/doorbell.md. Every B(...) below is one beat of it, with who must be on screen.
// The door is the building's REAL door: T.doorway(...) (gags.js) opens it (a dark doorway on the real door and a leaf of its colour
// swung out) and the resident steps out of that doorway and goes back into it. The bell is the real plate beside the door.
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
  const { doorway } = T;

  /** A grey bucket, full to the brim with water when `full`. */
  const bucket = (full) => sculpt((v) => {
    v.box(-0.2, 0, -0.2, 0.4, 0.04, 0.4, '#8d99a6');
    v.box(-0.2, 0.04, -0.2, 0.4, 0.32, 0.04, '#9aa5b1'); v.box(-0.2, 0.04, 0.16, 0.4, 0.32, 0.04, '#9aa5b1');
    v.box(-0.2, 0.04, -0.16, 0.04, 0.32, 0.32, '#9aa5b1'); v.box(0.16, 0.04, -0.16, 0.04, 0.32, 0.32, '#9aa5b1');
    if (full) v.box(-0.16, 0.04, -0.16, 0.32, 0.28, 0.32, '#4f9bff');
  });

  // what a crouching kid can hide behind (the obstacle picture, setting.js): a thing of at least 0.9 m that stands in the way of the doorstep
  const HIDERS = new Set(['car', 'bin', 'box', 'mailbox', 'bench', 'rack', 'rackpark', 'stall', 'mstall', 'kiosk', 'stop', 'shelter', 'trolleys', 'planter', 'orac', 'charger', 'column', 'statue']);
  /** Places 3.5 to 9.5 m along from the doorstep where the thing stands exactly between the doorstep and the kid. */
  const hideSpots = (ctx, dw) => {
    const pic = S.obstacles(ctx), out = [];
    for (let i = 0; i < pic.n; i++) {
      if (!HIDERS.has(pic.K[i]) || pic.H[i] < 0.9 || pic.T[i] !== 0) continue;
      const ox = pic.X[i], oz = pic.Z[i], vx = ox - dw.out.x, vz = oz - dw.out.z, l = Math.hypot(vx, vz);
      if (Math.abs(vx) < 3.5 || Math.abs(vx) > 9.5 || l < 1) continue;
      const r = pic.HX[i] + 0.6, hx = ox + (vx / l) * r, hz = oz + (vz / l) * r;
      if (Math.abs(hx) > EX1 - 1 || !S.clearSpot(ctx, hx, hz, 0.4, { ground: 'open' })) continue;
      if (!S.route(ctx, dw.bellStand.x, dw.bellStand.z, hx, hz).ok) continue;
      out.push({ x: hx, z: hz, ox, oz, kind: pic.K[i], d: Math.abs(vx) });
    }
    // the ones on the house side of the street first (no crossing of the road), then by distance
    out.sort((p, q) => (Math.sign(p.oz) === Math.sign(dw.z) ? 0 : 1) - (Math.sign(q.oz) === Math.sign(dw.z) ? 0 : 1) || p.d - q.d);
    return out.slice(0, 6);
  };
  /** Houses with a real door and bell, a clear doorstep and a hiding place along the way. */
  const plans = (ctx) => once(ctx, 'doorbell', () => {
    const out = [];
    for (const h of S.housesNear(ctx, 0, 20, { door: true, shop: false, tower: false })) {
      if (!h.leaf || !h.leaf.bell) continue;
      const dw = doorway(ctx, null, h);
      if (!dw || !dw.bell) continue;
      if (!S.clearSpot(ctx, dw.bellStand.x, dw.bellStand.z, 0.3, { ground: 'open' }) || !S.clearSpot(ctx, dw.out.x, dw.out.z, 0.35, { ground: 'open' })) continue;
      const hides = hideSpots(ctx, dw);
      if (hides.length) out.push({ h, hides });
    }
    return out;
  });

  return {
    w: [0, 3, 2, 1, 0.5], crime: 1,
    avail: (ctx) => plans(ctx).length > 0, // needs a real front door with a bell, and somewhere to hide
    stage: { pave: { side: 'far', len: 10, depth: 1.2 }, anchor: 'home', reach: 8 },
    *run(ctx) {
      const { L, rnd } = ctx, cam = camFor(ctx, 'doorbell'), B = beatsFor(ctx, 'doorbell'), R = rig(ctx);
      const sx0 = ctx.stage ? ctx.stage.x : 0; // (read before the first yield)
      const list = plans(ctx).slice().sort((p, q) => Math.abs(p.h.door.x - sx0) - Math.abs(q.h.door.x - sx0));
      if (!list.length) return;
      const plan = rnd.pick(list.slice(0, 2)), h = plan.h, hide = rnd.pick(plan.hides.slice(0, 3));
      let done = false;
      try {
        const dw = doorway(ctx, R, h), out = dw.out, bell = dw.bell, bs = dw.bellStand;
        const dir = hide.x > out.x ? 1 : -1, doorPt = pt(out.x, dw.z), bellPt = pt(bell.x, bell.z), hidePt = pt(hide.x, hide.z);
        const toWall = dw.heading + Math.PI, wall = pt(out.x, dw.z - 1);
        const dog = flip(ctx, 'dog', 0.4);
        const a = makePerson(rnd, { kind: 'kid' }), b = makePerson(rnd, { kind: 'kid' }); // a is the brave one
        const owner = makePerson(rnd, { kind: rnd.pick(['granny', 'civ']), shirt: '#8e5a9b' });
        const hound = dog ? makeDog(rnd) : null;

        // ---- 1. the dare: creeping along the fronts, a push in the back, giggles
        B('1 the dare: two kids creep along, one pushes the other', [doorPt]);
        const px = clamp(out.x - dir * 5.5, EX0, EX1), pz = padZ(ctx, 'walkB0', px);
        cam.wide(pt(out.x - dir * 1.5, dw.z), { dist: 9, el: 0.22, az: -dir * 0.3 }); // (tight on the door: the frame's edge is a few metres away, so the kids are in the picture almost at once)
        yield* waitUntil(() => T.seen(ctx, px, pz) && !T.seen(ctx, out.x - dir * 17, pz), 2); // (the tight shot is up before anybody walks into it)
        R.run(R.enter(b, clamp(px - dir * 1.1, EX0, EX1), pz, undefined, { from: 'edge', speed: 4.2 }));
        yield* R.enter(a, px, pz, undefined, { from: 'edge', speed: 4.2 });
        yield* R.settle(4);
        B('1b the dare: one pushes the other', [a, b]);
        b.lookAt = a;
        cam.two(a, b, { dist: 8, el: 0.1, az: dir * 0.55, cut: 0.8 });
        const stopX = out.x - dir * 2.6, stopZ = padZ(ctx, 'walkB0', stopX);
        R.run(tiptoe(ctx, b, stopX - dir * 1.1, stopZ, 2.5, false));
        yield* tiptoe(ctx, a, stopX, stopZ, 2.5, false);
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
        cam.hero(a);
        cam.card('BELLETJE TREK', 'Nine years old. Zero regrets.', 2.1);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        yield* laugh(ctx, a, 0.9, 'he');
        a.arms = 'swing';

        // ---- 3. the ring: tiptoe to the bell beside the door, stretch, finger on the button, DING DONG
        B('3 the ring: on tiptoe, finger on the real bell', [a, bellPt]);
        cam.shot({ on: [a, bellPt], y: 1.15, dist: 3.4, el: 0.02, az: Math.sign(dw.f.tx) * -1.0, fov: 32, fit: true, cut: 0.8 }); // from the side: the finger, the bell and the door behind
        yield* go(ctx, a, bs.x, bs.z, 2.2);
        a.heading = toWall; a.mood = 'focus'; a.arms = 'reach';
        a.air = true;
        const ap = a.g.position;
        yield* tween(0.5, (u) => { ap.y = u * 0.14; });
        yield* wait(0.35);
        a.squash(0.1);
        R.run(dw.press());
        ctx.fx.text('DING DONG!', at(bell.x, 2.3, bell.z + 0.3), { size: 22, color: '#ffe08a' });
        ctx.shake(0.1);
        ctx.incident(1);
        ctx.news('Belletje-lellen wave continues; prime suspect is nine');
        yield* wait(0.5);
        ap.y = 0; a.air = false;

        // ---- 4. the run: both bolt laughing and crouch behind the thing, peeking
        B('4 the run: both kids bolt, laughing, and hide', [a, b]);
        a.arms = 'swing'; a.mood = 'happy';
        cam.track([a, b], { dist: 10, el: 0.12, az: dir * 0.5, lead: 2, fov: 34, shake: 0.4 });
        const trailA = R.run(runDust(ctx, a)), trailB = R.run(runDust(ctx, b));
        cackle(ctx, a, 1.5, 'ha'); cackle(ctx, b, 1.5, 'ha');
        const hb = S.findSpot(ctx, hide.x + dir * 0.5, hide.z, 0.35, 8, { ground: 'open' }) || { x: hide.x + dir * 0.6, z: hide.z };
        const goB = R.run(go(ctx, b, hb.x, hb.z, 6.4, 0.06, { ignore: [{ x: hide.ox, z: hide.oz }] }));
        yield* go(ctx, a, hide.x, hide.z, 6.6, 0.06, { ignore: [{ x: hide.ox, z: hide.oz }] });
        yield* waitUntil(() => goB.done, 3); // (not R.settle: the dust trails run for ever)
        R.stop(trailA); R.stop(trailB);
        a.pose = 'crouch'; b.pose = 'crouch';
        faceTo(a, out.x, dw.z); faceTo(b, out.x, dw.z);
        a.mood = 'sly'; b.mood = 'sly';
        a.lookAt = { x: out.x, z: dw.z }; b.lookAt = { x: out.x, z: dw.z };
        a.squash(0.2); b.squash(0.2);
        B('4b hiding: crouched behind it, peeking at the door', [a, b]);
        cam.ground(hidePt, { dist: 5.5, el: 0.04, az: dir * 0.3, y: 0.5 });
        say(ctx, b, 'sst!', { size: 13, color: '#fff' });
        yield* wait(0.9);

        // ---- 5. the door: it opens on a dark doorway; the resident looks left, right, up, shrugs, goes back in
        B('5 the door: it opens and the resident looks around', [doorPt]);
        owner.heading = dw.heading; owner.mood = 'neutral';
        R.spawn(owner, dw.inside.x, dw.inside.z, 0); owner._doorway = dw; // (behind the wall: hidden until she steps out of the dark)
        cam.shot({ on: doorPt, y: 1.0, dist: 7, el: 0.05, az: -dir * 0.25, fov: 36, cut: 0.9 });
        yield* wait(0.4);
        yield* dw.open();
        yield* dw.passOut(owner, 1.3, 0.55);
        B('5b the door: the resident peers out', [owner]);
        cam.close(owner, { dist: 6, el: 0.05, az: -dir * 0.25, y: 1.0 });
        say(ctx, owner, '?!', { size: 20, color: '#fff' });
        yield* wait(0.5);
        owner.heading = E; yield* wait(0.4);
        owner.heading = W; yield* wait(0.4);
        owner.heading = dw.heading; owner.lookAt = { x: out.x, z: dw.z + 8 };
        yield* hop(owner, 0.18, 0.2); // up at the window
        yield* wait(0.3);
        owner.lookAt = null;
        owner.arms = 'shrug';
        say(ctx, owner, 'hm...', { size: 13, color: '#cfe8ff' });
        yield* wait(0.8);
        owner.arms = 'swing';
        yield* dw.passIn(owner, 1.4); // back in, the door shuts; she waits behind it
        if (!dog) { owner.hold(bucket(true), 'front'); owner.arms = 'carry'; } // (the bucket is in her hands behind the door)
        yield* dw.close();

        // ---- 6. again: the kids confer; the brave one creeps back for another go
        B('6 again: the kids confer, then the brave one creeps back', [a, b]);
        cam.two(a, b, { dist: 6.5, el: 0.22, az: dir * 0.2, cut: 0.7 });
        yield* wait(0.3);
        a.pose = null; a.lookAt = null; a.mood = 'happy'; a.arms = 'rub';
        b.lookAt = null; b.mood = 'scared';
        b.shakeT = 1.0; say(ctx, b, 'NEE!', { size: 15, color: '#fff' });
        yield* wait(0.5);
        a.nodT = 1.0; say(ctx, a, 'nog één keer!', { size: 13, color: '#b9fbc0' });
        ctx.sfx('snigger');
        yield* wait(0.5);
        B('6b the brave one creeps back to the bell', [a, bellPt]);
        cam.shot({ on: [a, bellPt], y: 1.0, dist: 9, el: 0.08, az: dir * 0.4, fov: 36, fit: true, cut: 0.9 });
        a.arms = 'sneak';
        yield* tiptoe(ctx, a, bs.x, bs.z, 4.2, false);
        a.heading = toWall; a.arms = 'reach'; a.mood = 'sly';
        B('6b2 finger on the bell again, and the door is about to fly open', [a, bellPt]);
        cam.shot({ on: [a, bellPt], y: 1.15, dist: 3.8, el: 0.02, az: Math.sign(dw.f.tx) * -1.0, fov: 32, fit: true, cut: 0.6 });
        yield* wait(0.9);

        // ---- the door flies open: the resident has been waiting right behind it
        const kp = a.g.position;
        let wet = null;
        if (!dog) {
          // 6c bucket
          owner.mood = 'smug';
          ctx.sfx('slam'); ctx.shake(0.25);
          R.run(dw.open());
          yield* wait(0.25);
          yield* dw.passOut(owner, 3.0, 0.5);
          owner.heading = dw.heading; owner.mood = 'angry';
          B('6c the door flies open: the resident with the bucket', [owner, a]);
          cam.two(owner, a, { dist: 5.5, el: 0.05, az: -dir * 0.3, cut: 0.6, quick: true });
          say(ctx, owner, 'HAH! DAAR!', { size: 18, color: '#ff6b6b' });
          yield* wait(0.5);
          owner.arms = 'push';
          R.discard(owner);
          // the pail swings out: a wave of water flies across to the kid
          const wave = R.add(sculpt((v) => v.box(-0.45, 0, -0.3, 0.9, 0.45, 0.6, '#4f9bff')));
          const pail2 = R.add(bucket(false));
          const op = owner.g.position;
          pail2.position.set(op.x, 1.1, op.z + 0.3);
          const w0 = { x: op.x, y: 1.2, z: op.z + 0.3 };
          R.run(arc(pail2, op.x + dir * 0.9, 0.0, op.z + 1.3, 1.1, 0.75, 6));
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
          B('6d splash: the kid stands there dripping', [a]);
          cam.crash(a, { dist: 4.5 });
          yield* wait(0.5);
          a.arms = 'swing';
          wet = R.run((function* () { for (;;) { ctx.fx.pips(kp.x, 0.9, kp.z, 2, ['#4f9bff', '#9ad0ff'], 0.07); yield* wait(0.35); } })());
          owner.arms = 'hips'; owner.mood = 'smug';
          yield* wait(1.1);

          // ---- 7. the last laugh
          B('7 the last laugh: the resident laughs and goes in', [owner]);
          cam.close(owner, { dist: 5.5, el: 0.05, az: -dir * 0.3, y: 1.0 });
          owner.arms = 'swing';
          yield* wait(0.3);
          yield* laugh(ctx, owner, 1.4, 'ha');
          owner.arms = 'rub'; owner.mood = 'smug';
          say(ctx, owner, 'zo.', { size: 14, color: '#b9fbc0' });
          yield* wait(0.5);
          owner.arms = 'swing';
          yield* dw.passIn(owner, 1.4);
          R.gone(owner);
          yield* dw.close();
          ctx.news('Doorbell prankster, nine, gets a bucket of water in return; "worth it", he says');
        } else {
          // 6c dog
          hound._doorway = dw;
          R.spawn(hound, dw.at(0.3, -1.0).x, dw.at(0.3, -1.0).z, 0);
          hound.heading = dw.heading;
          owner.mood = 'smug';
          ctx.sfx('slam'); ctx.shake(0.25);
          R.run(dw.open());
          yield* wait(0.25);
          yield* dw.passOut(owner, 3.0, 0.5);
          owner.heading = dw.heading; owner.mood = 'angry'; owner.arms = 'point';
          B('6c the door flies open: the resident and the dog', [owner, a]);
          cam.two(owner, a, { dist: 5.5, el: 0.05, az: -dir * 0.3, cut: 0.6, quick: true });
          yell(ctx, owner, 'PAK ZE, BRUNO!', '#ff6b6b', 17);
          ctx.sfx('bark');
          yield* wait(0.4);
          R.run(dw.passOut(hound, 5.5, 1.0)); // out of the dark and over the threshold
          a.arms = 'up'; a.mood = 'scared'; a.heading = dw.heading;
          yield* fright(ctx, a, 'AAAH!');
          // both kids run for it, the dog after them
          B('6d the chase: the kids run, the dog after them', [a, b]);
          cam.track([a, hound], { dist: 9, el: 0.1, az: dir * 0.5, lead: 2, fov: 34, shake: 0.3 });
          const runA = R.away(a, dir * 9, 6.8);
          R.run(runA);
          b.pose = null; b.mood = 'scared'; b.arms = 'up';
          R.run(R.away(b, dir * 9, 6.4));
          ctx.sfx('bark');
          yield* wait(0.3);
          yield* chase(ctx, hound, a, 6.2, 1.0, 2.4, { ignore: [{ x: out.x, z: dw.z }] });
          say(ctx, hound, 'WOEF!', { size: 16, color: '#fff' });
          ctx.sfx('bark');
          yield* wait(0.7);
          owner.arms = 'hips';
          cam.close(owner, { dist: 5.5, el: 0.05, az: -dir * 0.3, y: 1.0 });
          B('7 the last laugh: the resident laughs, the dog trots home', [owner]);
          yield* laugh(ctx, owner, 1.4, 'ha');
          owner.arms = 'swing';
          say(ctx, owner, 'brave hond.', { size: 14, color: '#b9fbc0' });
          R.run(R.out(hound)); // trots back through the door
          yield* wait(0.9);
          yield* dw.passIn(owner, 1.4);
          R.gone(owner);
          yield* wait(0.4);
          ctx.news('Doorbell pranksters, both nine, meet the neighbourhood dog; the dog "was not impressed"');
        }

        // ---- 7b. the kids go: the dry one laughs, the wet one squelches off (the dog ending has them away already)
        if (!dog) {
          B('7b both kids: one laughs, the wet one squelches off', [a, b]);
          cam.wide(pt((kp.x + hide.x) / 2, kp.z), { dist: 11, el: 0.22, az: dir * 0.06 }); // (across the street: the frame's edges are near, the kids are soon out of it)
          b.pose = null; b.mood = 'happy'; faceTo(b, kp.x, kp.z);
          cackle(ctx, b, 1.8, 'ha');
          yield* wait(0.2);
          a.mood = 'sad'; a.heading = dir * Math.PI / 2;
          say(ctx, a, '*splurp*', { size: 13, color: '#9ad0ff' });
          ctx.sfx('womp');
          yield* wait(0.9);
          R.stop(wet);
          const drip = R.run((function* () {
            for (;;) {
              yield* wait(0.55);
              if (!a.alive) return;
              const q = a.g.position;
              ctx.fx.pips(q.x, 0.1, q.z, 2, ['#4f9bff'], 0.07);
              say(ctx, a, '*splurp*', { size: 11, color: '#9ad0ff' });
            }
          })());
          R.run(R.away(a, dir * 6, 2.8));
          yield* wait(0.5);
          R.run(R.away(b, dir * 7, 3.4));
          yield* wait(1.2);
          R.stop(drip); // (the payoff has landed: the camera lets go and the rig walks the kids off)
        }
        yield* wait(0.3);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
