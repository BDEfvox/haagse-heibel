// Burglary: in through the front door with a crowbar, out with the swag bag, and a laugh that lasts exactly as long as it takes the law to arrive.
// Storyboard: storyboards/burglar.md. Every B(...) below is one beat of it, with who must be on screen.
// The door (and the window the owner leans out of) are the building's REAL ones: T.doorway / T.windowAt (gags.js) open them on a dark
// doorway; everyone who is "inside" stands behind the wall and walks out of the dark.
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
  const { doorway, windowAt, entryTime } = T;

  /** Homes with a real front door, a clear doorstep and at least nine clear metres of pavement to run along (and which way). */
  const plans = (ctx) => once(ctx, 'burglar', () => {
    const out = [];
    for (const h of S.housesNear(ctx, 0, 20, { door: true, shop: false, tower: false })) {
      if (!h.leaf) continue;
      const dw = doorway(ctx, null, h);
      if (!dw) continue;
      const lz = Math.min(dw.out.z, padZ(ctx, 'walkB1', dw.out.x));
      if (!S.clearSpot(ctx, dw.out.x, dw.out.z, 0.45, { ground: 'open' }) || !S.clearSpot(ctx, dw.out.x, lz, 0.5, { ground: 'open' })) continue;
      const want = dw.out.x > 0 ? -1 : 1;
      const a = S.runway(ctx, dw.out.x, lz, want, 16, 0.6), b = S.runway(ctx, dw.out.x, lz, -want, 16, 0.6);
      const la = Math.abs(a - dw.out.x), lb = Math.abs(b - dw.out.x);
      if (la >= 9 && (la >= lb || lb < 9)) out.push({ h, dir: want, len: la, lz });
      else if (lb >= 9) out.push({ h, dir: -want, len: lb, lz });
    }
    return out;
  });
  const vase = () => sculpt((v) => { v.box(0, 0, 0, 0.2, 0.1, 0.2, '#3a86ff'); v.box(0, 0.1, 0, 0.3, 0.26, 0.3, '#4f9bff'); v.box(0, 0.36, 0, 0.16, 0.12, 0.16, '#3a86ff'); v.box(0, 0.48, 0, 0.06, 0.2, 0.06, '#3a9d4a'); v.box(0, 0.66, 0, 0.16, 0.14, 0.16, '#ff5d8f'); });

  return {
    w: [0, 0, 0, 3, 2], crime: 2,
    avail: (ctx) => plans(ctx).length > 0,
    stage: { pave: { side: 'far', len: 9, depth: 1.2 }, anchor: 'home', reach: 8 },
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'burglar'), B = beatsFor(ctx, 'burglar'), R = rig(ctx), list = plans(ctx);
      const sx0 = ctx.stage ? ctx.stage.x : 0; // (read before the first yield)
      if (!list.length) return;
      const plan = rnd.pick(list.slice().sort((p, q) => Math.abs(p.h.door.x - sx0) - Math.abs(q.h.door.x - sx0)).slice(0, 2));
      const h = plan.h, dir = plan.dir, hd = dir > 0 ? E : W, lz = plan.lz;
      let done = false;
      try {
        const dw = doorway(ctx, R, h), dx = dw.out.x, doorPt = pt(dx, dw.z), toWall = dw.heading + Math.PI;
        const win = h.sash && flip(ctx, 'window', 0.65) ? windowAt(ctx, R, h) : null; // the owner leans out of the real window, or comes out of the door
        const rob = makePerson(rnd, { kind: 'robber' });
        const owner = makePerson(rnd, { kind: rnd.pick(['granny', 'civ']), shirt: '#f1e3c6' });
        const cap = item.nightcap(); cap.position.set(0, 0.62, 0); owner.head.add(cap);
        const lockSide = dw.at(0.45, 0.55); // beside the door handle

        // ---- 1. casing: he creeps along the fronts with a crowbar, stops at the door, checks both ways
        B('1 casing: creeping up to the front door', [doorPt]);
        cam.wide(doorPt, { dist: 11, el: 0.3, az: -dir * 0.3 }); // (tight on the door: the frame's edge is a few metres away, so the burglar is in the picture almost at once)
        const x0 = clamp(dx - dir * 6, EX0, EX1);
        yield* waitUntil(() => T.seen(ctx, x0, lz) && !T.seen(ctx, dx - dir * 17, lz), 2); // (the tight shot is up before he walks into it)
        yield* R.enter(rob, x0, lz, undefined, { from: 'edge', speed: 4.6 });
        rob.hold(item.crowbar());
        B('1b casing: tiptoeing up to the door', [rob]);
        cam.track(rob, { dist: 10, el: 0.14, az: -dir * 0.5, lead: 1.5, cut: 1.2 });
        yield* tiptoe(ctx, rob, lockSide.x - dir * 0.5, lockSide.z, 2.9);
        rob.heading = toWall; rob.lookAt = pt(dx, dw.z);
        yield* wait(0.5);

        // ---- 2. the reveal
        B('2 reveal: the burglar grins at us', [rob]);
        rob.lookAt = null; rob.heading = 0; rob.mood = 'smug'; rob.arms = 'rub';
        cam.hero(rob, { hold: 3 });
        cam.card('DE INBREKER', 'Lets himself in. Never wipes his feet.', 2.1);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        yield* laugh(ctx, rob, 1.1, 'he');
        rob.arms = 'swing';

        // ---- 3. the jemmy: crowbar in the door frame, KRAK, the door swings open on the dark, and he is in
        B('3 the break-in: the crowbar in the door, KRAK, in he goes', [rob, doorPt]);
        cam.shot({ on: [rob, doorPt], y: 1.0, dist: 8, el: 0.08, az: -dir * 0.4, fov: 36, fit: true, cut: 0.8 });
        rob.heading = toWall; rob.mood = 'focus'; rob.arms = 'push';
        yield* go(ctx, rob, lockSide.x, lockSide.z, 1.8);
        rob.heading = toWall;
        yield* wait(0.4);
        ctx.sfx('clatter');
        say(ctx, rob, '*KRAK*', { size: 16, color: '#ffd60a' });
        ctx.fx.sparks(lockSide.x, 1.0, dw.z + 0.2, 6);
        ctx.shake(0.12);
        yield* wait(0.3);
        yield* dw.open();
        rob.arms = 'sneak'; rob.mood = 'sly';
        yield* go(ctx, rob, dx, dw.out.z, 1.8);
        yield* dw.passIn(rob, 1.5);
        rob.drop();
        ctx.incident(2);
        ctx.news(`Burglar lets himself in on ${ctx.st.name}; "the door was basically open"`);

        // ---- 4. rummaging: things come flying out of the open door, and then the cat
        B('4 inside: noises, a vase and the cat come flying out', [doorPt]);
        cam.shot({ on: doorPt, y: 1.1, dist: 8.5, el: 0.06, az: -dir * 0.25, fov: 34, drift: { dist: -0.35 } });
        const noises = [['*rommel rommel*', 'clatter'], ['BONK!', 'bonk'], ['KLETTER!', 'glass']];
        for (let i = 0; i < 3; i++) {
          ctx.sfx(noises[i][1]);
          ctx.fx.text(noises[i][0], at(dx + rnd.range(-0.4, 0.4), 2.4, dw.z + 0.4), { size: 16, color: '#ffe08a', dur: 0.9 });
          ctx.shake(0.06);
          if (i === 1) { // a vase sails out of the door and smashes on the pavement
            const vs = R.add(vase()), a0 = dw.at(0, -0.7), a1 = dw.at(dir * 1.0, 1.6);
            vs.position.set(a0.x, 1.2, a0.z);
            R.run((function* () {
              yield* arc(vs, a1.x, 0.02, a1.z, 0.9, 0.7, 7);
              ctx.sfx('glass'); ctx.fx.shards(a1.x, 0.2, a1.z, 12, 3.5);
              R.rm(vs);
            })());
          }
          if (i === 2) { // ...and the cat, who bolts out of the doorway and walks off offended
            const cat = makeCat(rnd), c0 = dw.at(0.2, -0.8);
            R.spawn(cat, c0.x, c0.z, 0);
            ctx.sfx('meow');
            say(ctx, cat, 'MIAUW!', { size: 14, color: '#fff', off: 0.8 });
            R.run((function* () {
              yield* dw.passOut(cat, 4.5, 1.2);
              yield* go(ctx, cat, clamp(dw.out.x - dir * 7, EX0, EX1), lz + 0.4, 3.4);
              yield* R.out(cat);
            })());
          }
          yield* wait(0.75);
        }

        B('4b the loot: he steps out of the dark with a bulging bag', [rob, doorPt]);
        const carried = item.moneybag(1.2);
        rob.hold(carried, 'front'); rob.arms = 'carry'; rob.mood = 'happy';
        rob.squash(0.2);
        cam.shot({ on: [rob, doorPt], y: 1.0, dist: 6.5, el: 0.05, az: -dir * 0.3, fov: 34, fit: true, cut: 0.8 });
        ctx.sfx('kaching');
        say(ctx, rob, 'HEBBES!', { size: 18, color: '#b9fbc0' });
        const outT = R.run(dw.passOut(rob, 1.3));
        yield* wait(0.9);
        ctx.fx.cash(rob.g.position.x, 1.2, rob.g.position.z, 6, 2.5, 4); // the bag leaks banknotes over the threshold
        ctx.sfx('thud');
        yield* waitUntil(() => outT.done, 3); // (not R.settle: the cat is still walking off)

        // ---- 5. the gloat: bag over the shoulder, and he laughs
        B('5 the gloat: bag over his shoulder, laughing', [rob]);
        yield* go(ctx, rob, dx - dir * 0.9, lz, 3.2);
        rob.drop();
        shoulder(rob, item.moneybag(1.2));
        rob.squash(0.15);
        rob.heading = 0.5; rob.mood = 'smug';
        ctx.wanted = rob;
        cam.hero(rob, { az: 0.75, dist: 5.6, y: 1.5, face: false, back: true });
        yield* wait(0.35);
        yield* laugh(ctx, rob, 1.8, 'ha');

        // ---- 6. the owner: the window opens above him, in a nightcap
        const stopX = dx + dir * Math.min(plan.len - 1.5, 10.5), busted = flip(ctx, 'busted', lv < 5 ? 0.7 : 0.5);
        const cop = makePerson(rnd, { kind: 'cop' });
        owner._doorway = dw;
        if (busted) { // the law is on its way: he comes in along the street from out of the frame, and is standing there when the chase gets to him
          const cx = clamp(stopX + dir * 1.1, EX0, EX1);
          R.run((function* () {
            yield* R.enter(cop, cx, lz, undefined, { speed: 6.5, dir: -dir, from: 'edge' });
            cop.heading = -hd; cop.arms = 'hips'; cop.mood = 'whistle'; cop.lookAt = pt(cx - dir * 6, lz); // looking the wrong way
          })());
        }
        B(win ? '6 the owner leans out of the window' : '6 the owner appears in the dark doorway', [rob, doorPt]);
        const q = win ? win.inside : dw.inside;
        R.spawn(owner, q.x, q.z, 0);
        owner.heading = dw.heading; owner.lookAt = rob; owner.mood = 'shock';
        cam.shot({ on: [rob, doorPt], y: win ? 2.0 : 1.0, dist: 11, el: 0.12, az: -dir * 0.35, fov: 36, fit: true, cut: 0.8 });
        if (win) {
          win.pose(owner, 0);
          yield* win.open();
          yield* tween(0.6, (u) => win.pose(owner, u), ease.outQuad);
        } else {
          yield* dw.passOut(owner, 1.4, 0.45);
        }
        yield* doubleTake(ctx, owner, 'HÈ?!');
        owner.mood = 'angry'; owner.arms = 'fist';
        ctx.sfx('alarm');
        yell(ctx, owner, 'MIJN SPAARGELD! DIEF!', '#ff6b6b', 15);
        rob.lookAt = owner;
        yield* fright(ctx, rob, 'OEPS');
        rob.lookAt = null;

        // ---- 7. the getaway: he runs, laughing over his shoulder, notes fluttering out of the bag
        B('7 the getaway: running and laughing, notes flying', [rob]);
        rob.mood = 'happy';
        const trail = R.run(noteTrail(ctx, rob, 0.16)), dust = R.run(runDust(ctx, rob));
        cam.track(rob, { dist: 10.5, el: 0.12, az: dir * 0.55, lead: 3, fov: 34, shake: 0.5 });
        // the owner comes down and out through the front door, slippers and all (still inside the building: nobody sees the stairs)
        const pursuit = R.run((function* () {
          yield* wait(0.4);
          if (win) {
            yield* win.retreat(owner);
            R.run(win.close());
            const d0 = dw.inside;
            owner.air = false; owner.g.rotation.x = 0; owner.g.position.set(d0.x, 0, d0.z); // (down the stairs, behind the wall)
          }
          owner.arms = 'fist'; owner.mood = 'angry'; owner.lookAt = null;
          yield* dw.passOut(owner, 2.6);
          yell(ctx, owner, 'HOUD DE DIEF!', '#ff6b6b', 14);
          yield* go(ctx, owner, stopX - dir * 4.2, lz + 0.2, 5.4);
        })());
        cackle(ctx, rob, 2.4, 'ha');
        let looked = false;
        yield* goEach(ctx, rob, stopX, lz, 6.6, () => {
          if (!looked && Math.abs(rob.g.position.x - dx) > 4) { looked = true; rob.lookAt = owner; } // glances back, still laughing
        });
        R.stop(trail); R.stop(dust);

        if (busted) {
          // ---- 8a. the long arm: he is looking the wrong way
          yield* waitUntil(() => !cop.offstage, 4);
          B('8 busted: straight into the long arm of the law', [rob, cop]);
          cam.dutch([rob, cop], { dist: 8, az: dir * 0.3, face: false, fit: true });
          ctx.sfx('bonk'); ctx.shake(0.35); cam.freeze(0.5, 0.08);
          ctx.fx.text('BONK!', at(stopX, 2.4, lz), { size: 30, color: '#ffd60a' });
          ctx.fx.pips(stopX, 1.9, lz, 8);
          rob.lookAt = null; cop.lookAt = null;
          const sack = R.add(item.moneybag(1.2)), rp = rob.g.position;
          rob.drop();
          sack.position.set(rp.x, 1.5, rp.z);
          // the bag keeps going: up, open, raining money, and down into the owner's arms
          const sackT = R.run((function* () {
            const ox = stopX - dir * 4.2, oz = lz + 0.2;
            let burst = false;
            const a0 = sack.position.clone();
            yield* tween(1.0, (u) => {
              sack.position.set(lerp(a0.x, ox, u), lerp(a0.y, 1.25, u) + Math.sin(u * Math.PI) * 3.2, lerp(a0.z, oz, u));
              sack.rotation.z = u * TAU * 1.5;
              if (!burst && u > 0.45) { burst = true; ctx.fx.cash(sack.position.x, sack.position.y, sack.position.z, 34, 5, 6); ctx.sfx('coin'); }
            });
            R.rm(sack);
            if (owner.alive) { owner.hold(item.moneybag(1.2), 'front'); owner.arms = 'carry'; owner.mood = 'happy'; owner.squash(0.25); ctx.sfx('tada'); say(ctx, owner, 'MIJN SPAARGELD!', { size: 15, color: '#b9fbc0' }); }
          })());
          yield* tumble(ctx, rob, stopX - dir * 1.7, lz + 0.1, 1.0, 0.6);
          cop.arms = 'hips'; cop.mood = 'smug';
          yield* waitUntil(() => sackT.done, 3); // (not R.settle: the owner is still running up)
          cam.two(cop, rob, { az: dir * 0.2 });
          yield* go(ctx, cop, rob.g.position.x + dir * 0.9, lz + 0.15, 2.6);
          cop.heading = -hd; cop.lookAt = rob;
          say(ctx, cop, 'INGEREKEND.', { size: 16, color: '#7db8ff' });
          ctx.sfx('cuff');
          R.run(seeStars(ctx, rob, 1.6));
          yield* wait(1.3);
          ctx.news('Burglar caught after running into a police officer. Officer: "I just stood there"');
          B('9 epilogue: the owner hugs the bag, the burglar is led off', [rob, owner]);
          cam.wide(pt(stopX - dir * 2.5, lz), { dist: 15, el: 0.3, az: dir * 0.2 });
          yield* getUp(rob, 'sad');
          rob.arms = 'beg'; cop.lookAt = null; cop.arms = 'point';
          ctx.sfx('womp');
          yield* wait(0.7);
          cop.arms = 'swing'; rob.arms = 'swing';
          R.run(R.away(rob, dir * 5, 2.6));
          R.run((function* () { yield* wait(0.35); yield* R.away(cop, dir * 5, 2.6); })());
          owner.mood = 'happy';
          R.run((function* () { yield* wait(0.6); yield* go(ctx, owner, dw.out.x, dw.out.z, 2.8); owner.drop(); yield* R.out(owner); })());
        } else {
          // ---- 8b. clean away: the law is half a minute late
          B('8 clean away: gone round the corner, still laughing', [rob]);
          const far = dx + dir * (plan.len - 0.3);
          R.run(R.enter(cop, clamp(dx - dir * 6, EX0, EX1), lz, undefined, { speed: 6, dir, from: 'edge' })); // (the law is on its way, late: he is walking in while the thief goes)
          R.run((function* () { yield* goEach(ctx, rob, far, lz, 7); yield* R.out(rob); })());
          cackle(ctx, rob, 1.6, 'ha');
          yield* waitUntil(() => !rob.alive, 4);
          B('9 epilogue: the owner shakes a fist, the law arrives late', [owner]);
          cam.close(owner, {});
          owner.arms = 'fist'; owner.mood = 'angry';
          yell(ctx, owner, 'IK KRIJG JE NOG WEL!', '#ff6b6b', 14);
          ctx.news(`Burglar gets away from ${ctx.st.name} with the savings; owner "would know that laugh anywhere"`);
          yield* wait(1.2);
          yield* waitUntil(() => !cop.offstage, 8);
          B('9b epilogue: the cop gets there too late', [cop, owner]);
          cam.two(cop, owner, {});
          yield* go(ctx, cop, owner.g.position.x - dir * 1.3, lz + 0.2, 5);
          cop.lookAt = owner; cop.arms = 'shrug'; cop.mood = 'sad';
          say(ctx, cop, 'net te laat...', { size: 13, color: '#cfe8ff' });
          owner.lookAt = cop; owner.arms = 'facepalm'; owner.mood = 'sad';
          ctx.sfx('womp');
          yield* wait(1.6);
          cop.lookAt = owner.lookAt = null; cop.arms = owner.arms = 'swing';
          R.run(R.away(cop, -dir * 5, 3));
          R.run((function* () { yield* go(ctx, owner, dw.out.x, dw.out.z, 2.8); yield* R.out(owner); })());
        }
        R.stop(pursuit);
        yield* wait(0.8); // (the payoff has landed: the camera lets go, the rig walks the cast off and shuts the door behind the owner)
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
