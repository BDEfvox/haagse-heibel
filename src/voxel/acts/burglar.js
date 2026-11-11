// Burglary: in through the window, out with the swag bag, and a laugh that lasts exactly as long as it takes the law to arrive.
// Storyboard: STORYBOARDS.md, "burglar". Every B(...) below is one beat of it, with who must be on screen.
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

  /** Houses with a real first-floor window, a clear landing under it and at least nine clear metres of pavement to run along. */
  const plans = (ctx) => once(ctx, 'burglar', () => {
    const out = [];
    for (const h of S.housesNear(ctx, 0, 15, { tower: false })) {
      const wx = h.win.x, lz = Math.min(h.win.z + 1.5, padZ(ctx, 'walkB1', wx));
      if (!S.clearSpot(ctx, wx, lz, 0.6, { ground: 'open' })) continue;
      const want = wx > 0 ? -1 : 1;
      const a = S.runway(ctx, wx, lz, want, 16, 0.6), b = S.runway(ctx, wx, lz, -want, 16, 0.6);
      const la = Math.abs(a - wx), lb = Math.abs(b - wx);
      if (la >= 9 && (la >= lb || lb < 9)) out.push({ h, dir: want, len: la, lz });
      else if (lb >= 9) out.push({ h, dir: -want, len: lb, lz });
    }
    return out;
  });
  const balcony = (wx, wy, wz) => piece((v) => {
    const by = wy - 0.42, bz = wz + 0.45;
    v.box(wx, by, bz, 1.6, 0.12, 0.9, '#d6d0c2');
    v.box(wx, by + 0.12, bz + 0.42, 1.6, 0.9, 0.07, '#2f3640');
    v.box(wx - 0.77, by + 0.12, bz, 0.07, 0.9, 0.9, '#2f3640');
    v.box(wx + 0.77, by + 0.12, bz, 0.07, 0.9, 0.9, '#2f3640');
  });
  const vase = () => sculpt((v) => { v.box(0, 0, 0, 0.2, 0.1, 0.2, '#3a86ff'); v.box(0, 0.1, 0, 0.3, 0.26, 0.3, '#4f9bff'); v.box(0, 0.36, 0, 0.16, 0.12, 0.16, '#3a86ff'); v.box(0, 0.48, 0, 0.06, 0.2, 0.06, '#3a9d4a'); v.box(0, 0.66, 0, 0.16, 0.14, 0.16, '#ff5d8f'); });

  return {
    w: [0, 0, 0, 3, 2], crime: 2,
    avail: (ctx) => plans(ctx).length > 0,
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'burglar'), B = beatsFor(ctx, 'burglar'), R = rig(ctx), list = plans(ctx);
      if (!list.length) return;
      const plan = rnd.pick(list), h = plan.h, dir = plan.dir, hd = dir > 0 ? E : W, lz = plan.lz;
      const wx = h.win.x, wy = h.win.y, wz = h.win.z, by = wy - 0.3, bz = wz + 0.35; // by, bz: standing on the balcony
      const win = { x: wx, z: wz + 0.4, y: wy + 0.4 }, land = pt(wx, lz);
      let done = false;
      try {
        const rob = makePerson(rnd, { kind: 'robber' });
        R.add(balcony(wx, wy, wz));
        // the room behind the window: dark until somebody is in there
        const room = R.add(sculpt((v) => v.box(wx, wy + 0.05, wz + 0.03, 0.9, 1.15, 0.05, '#ffe9a8'), MAT.glow));
        room.visible = false;

        // ---- 1. casing: he creeps along the fronts with a crowbar, stops under the window, checks both ways
        B('1 casing: creeping up under the window', [rob]);
        cam.wide(land, { dist: 20, el: 0.34, az: -dir * 0.3, hold: 3 });
        const x0 = clamp(wx - dir * 10, EX0, EX1);
        yield* R.enter(rob, x0, lz);
        rob.hold(item.crowbar());
        cam.track(rob, { dist: 10, el: 0.14, az: -dir * 0.5, lead: 1.5, cut: 1.2, hold: 8 });
        yield* tiptoe(ctx, rob, wx - dir * 0.5, lz, 2.9);
        rob.heading = Math.PI; rob.lookAt = win;
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

        // ---- 3. up and in: a leap onto the balcony, the crowbar in the frame, and he is gone
        B('3 the climb: up onto the balcony and in', [rob, win]);
        cam.shot({ on: [rob, win], y: 0.6, dist: 12, el: 0.1, az: -dir * 0.45, fov: 36, fit: true, cut: 0.8, hold: 7 });
        rob.heading = Math.PI; rob.mood = 'focus';
        yield* wait(0.25);
        yield* leap(ctx, rob, wx, bz, 1.3, 0.55, by);
        rob.heading = Math.PI; rob.arms = 'push';
        ctx.sfx('clatter');
        say(ctx, rob, '*KRAK*', { size: 16, color: '#ffd60a' });
        ctx.fx.sparks(wx, wy + 0.4, wz + 0.15, 6);
        yield* wait(0.5);
        ctx.sfx('swish');
        yield* tween(0.3, (u) => { rob.g.position.z = lerp(bz, wz - 0.2, u); rob.g.scale.setScalar(Math.max(0.001, rob.baseScale * (1 - u * 0.9))); });
        rob.g.visible = false;
        rob.drop();
        ctx.incident(2);
        ctx.news(`Burglar lets himself in on ${ctx.st.name}; "the window was basically open"`);

        // ---- 4. rummaging: the light goes on and off, things come flying out, and then the bag
        B('4 inside: noises, a vase and the cat come flying out', [win]);
        cam.shot({ on: win, y: 0, dist: 9.5, el: 0.06, az: -dir * 0.25, fov: 34, drift: { dist: -0.35 }, hold: 6 });
        const flick = R.run((function* () { for (;;) { room.visible = true; yield* wait(rnd.range(0.12, 0.4)); room.visible = false; yield* wait(rnd.range(0.05, 0.16)); } })());
        const noises = [['*rommel rommel*', 'clatter'], ['BONK!', 'bonk'], ['KLETTER!', 'glass']];
        for (let i = 0; i < 3; i++) {
          ctx.sfx(noises[i][1]);
          ctx.fx.text(noises[i][0], at(wx + rnd.range(-0.5, 0.5), wy + 1.3, wz + 0.3), { size: 16, color: '#ffe08a', dur: 0.9 });
          ctx.shake(0.06);
          if (i === 1) { // a vase sails out and smashes on the pavement
            const vs = R.add(vase());
            vs.position.set(wx, wy + 0.5, wz + 0.4);
            R.run((function* () {
              yield* arc(vs, wx + dir * 1.6, 0.02, lz + 0.5, 1.0, 0.7, 7);
              ctx.sfx('glass'); ctx.fx.shards(wx + dir * 1.6, 0.2, lz + 0.5, 12, 3.5);
              R.rm(vs);
            })());
          }
          if (i === 2) { // ...and the cat, who lands on her feet and walks off offended
            const cat = makeCat(rnd);
            R.spawn(cat, wx, bz, by + 0.3);
            cat.air = true;
            ctx.sfx('meow');
            say(ctx, cat, 'MIAUW!', { size: 14, color: '#fff', off: 0.8 });
            R.run((function* () {
              const p = cat.g.position, sx = wx - dir * 1.3;
              yield* tween(0.6, (u) => { p.x = lerp(wx, sx, u); p.z = lerp(bz, lz + 0.3, u); p.y = lerp(by + 0.3, 0, u) + Math.sin(u * Math.PI) * 1.0; cat.g.rotation.x = u * TAU; });
              cat.g.rotation.x = 0; cat.air = false; p.y = 0;
              ctx.fx.dust(sx, 0, lz + 0.3, 0, 0, 3);
              yield* wait(0.3);
              yield* go(ctx, cat, clamp(sx - dir * 7, EX0, EX1), lz + 0.4, 3.4);
              yield* R.out(cat);
            })());
          }
          yield* wait(0.75);
        }
        R.stop(flick);
        room.visible = true;

        B('4b the loot: he is back at the window with a bulging bag', [rob, win]);
        rob.g.visible = true;
        rob.g.position.set(wx, by, bz);
        rob.g.scale.setScalar(rob.baseScale);
        rob.heading = 0; rob.mood = 'happy';
        const carried = item.moneybag(1.2);
        rob.hold(carried, 'front'); rob.arms = 'carry';
        rob.squash(0.2);
        ctx.sfx('kaching');
        say(ctx, rob, 'HEBBES!', { size: 18, color: '#b9fbc0' });
        yield* wait(0.9);
        // the bag goes first: over the railing, onto the pavement, bounce, a puff of banknotes
        const bag = R.add(item.moneybag(1.2)), bagAt = { x: wx + dir * 1.0, z: lz + 0.15 };
        rob.drop(); rob.arms = 'push';
        bag.position.set(wx, by + 1.0, bz + 0.5);
        ctx.sfx('swish');
        cam.ground(bagAt, { dist: 6.5, az: -dir * 0.6, cut: 0.5, hold: 3 });
        B('4c the bag hits the pavement', [bagAt]);
        yield* arc(bag, bagAt.x, 0.02, bagAt.z, 0.9, 0.55, 3);
        ctx.sfx('thud'); ctx.fx.cash(bagAt.x, 0.6, bagAt.z, 6, 2.5, 4); ctx.fx.dust(bagAt.x, 0, bagAt.z, 0, 0, 5);
        yield* arc(bag, bagAt.x + dir * 0.35, 0.02, bagAt.z, 0.3, 0.25, 1);
        rob.arms = 'swing';
        yield* leap(ctx, rob, wx - dir * 0.1, lz + 0.1, 0.8, 0.5, 0);
        rob.air = false;
        room.visible = false;

        // ---- 5. the gloat: bag over the shoulder, and he laughs
        B('5 the gloat: bag over his shoulder, laughing', [rob]);
        yield* go(ctx, rob, bagAt.x - dir * 0.2, bagAt.z + 0.25, 3.4);
        R.rm(bag);
        shoulder(rob, item.moneybag(1.2));
        rob.squash(0.15);
        rob.heading = 0.5; rob.mood = 'smug';
        ctx.wanted = rob;
        cam.hero(rob, { az: 0.75, dist: 5.6, y: 1.5, face: false, back: true, hold: 4 });
        yield* wait(0.35);
        yield* laugh(ctx, rob, 2.0, 'ha');

        // ---- 6. the owner: the light goes on behind him
        B('6 the owner appears on the balcony', [rob, win]);
        const owner = makePerson(rnd, { kind: rnd.pick(['granny', 'civ']), shirt: '#f1e3c6' });
        const cap = item.nightcap(); cap.position.set(0, 0.62, 0); owner.head.add(cap);
        room.visible = true;
        const lamp = R.add(sculpt((v) => v.box(h.x - h.w / 2 + 0.4, Math.min(wy + 1.6, 4.4), h.z + 0.2, 0.3, 0.3, 0.3, '#ff2d2d'), MAT.glow));
        const blink = R.run((function* () { let u = 0; for (;;) { u += yield; lamp.visible = Math.floor(u * 6) % 2 === 0; } })());
        owner.air = true;
        yield* R.enter(owner, wx, bz, by);
        owner.heading = 0; owner.lookAt = rob; owner.mood = 'shock';
        cam.shot({ on: [rob, win], y: 0.9, dist: 11, el: 0.1, az: -dir * 0.35, fov: 36, fit: true, hold: 4 });
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
        const stopX = wx + dir * Math.min(plan.len - 1.5, 10.5), busted = flip(ctx, 'busted', lv < 5 ? 0.7 : 0.5);
        const cop = makePerson(rnd, { kind: 'cop' });
        const trail = R.run(noteTrail(ctx, rob, 0.16)), dust = R.run(runDust(ctx, rob));
        cam.track(rob, { dist: 10.5, el: 0.12, az: dir * 0.55, lead: 3, fov: 34, shake: 0.5, hold: 8 });
        // the owner comes down and out of the front door, slippers and all
        const pursuit = R.run((function* () {
          yield* wait(0.5);
          yield* R.out(owner);
          owner.air = false;
          yield* R.enter(owner, h.door.x, h.door.z, 0.001);
          owner.arms = 'fist'; owner.mood = 'angry';
          yell(ctx, owner, 'HOUD DE DIEF!', '#ff6b6b', 14);
          yield* go(ctx, owner, stopX - dir * 4.2, lz + 0.2, 5.4);
        })());
        if (busted) R.run((function* () { yield* wait(0.9); yield* R.enter(cop, clamp(stopX + dir * 1.1, EX0, EX1), lz); cop.heading = -hd; cop.arms = 'stop'; cop.mood = 'angry'; })());
        cackle(ctx, rob, 2.4, 'ha');
        let looked = false;
        yield* goEach(ctx, rob, stopX, lz, 6.6, () => {
          if (!looked && Math.abs(rob.g.position.x - wx) > 4) { looked = true; rob.lookAt = owner; } // glances back, still laughing
        });
        R.stop(trail); R.stop(dust);

        if (busted) {
          // ---- 8a. the long arm: he is looking the wrong way
          B('8 busted: straight into the long arm of the law', [rob, cop]);
          cam.dutch([rob, cop], { dist: 8, az: dir * 0.3, face: false, fit: true, hold: 2.4 });
          ctx.sfx('bonk'); ctx.shake(0.35); cam.freeze(0.5, 0.08);
          ctx.fx.text('BONK!', at(stopX, 2.4, lz), { size: 30, color: '#ffd60a' });
          ctx.fx.pips(stopX, 1.9, lz, 8);
          rob.lookAt = null;
          const sack = R.add(item.moneybag(1.2)), rp = rob.g.position;
          rob.drop();
          sack.position.set(rp.x, 1.5, rp.z);
          // the bag keeps going: up, open, raining money, and down into the owner's arms
          R.run((function* () {
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
          yield* R.settle(4);
          cam.two(cop, rob, { az: dir * 0.2, hold: 3.4 });
          yield* go(ctx, cop, rob.g.position.x + dir * 0.9, lz + 0.15, 2.6);
          cop.heading = -hd; cop.lookAt = rob;
          say(ctx, cop, 'INGEREKEND.', { size: 16, color: '#7db8ff' });
          ctx.sfx('cuff');
          R.run(seeStars(ctx, rob, 1.6));
          yield* wait(1.3);
          ctx.news('Burglar caught after running into a police officer. Officer: "I just stood there"');
          B('9 epilogue: the owner hugs the bag, the burglar is led off', [rob, owner]);
          cam.wide(pt(stopX - dir * 2.5, lz), { dist: 15, el: 0.3, az: dir * 0.2, hold: 4 });
          yield* getUp(rob, 'sad');
          rob.arms = 'beg'; cop.lookAt = null; cop.arms = 'point';
          ctx.sfx('womp');
          yield* wait(0.7);
          cop.arms = 'swing'; rob.arms = 'swing';
          R.run(R.away(rob, dir * 5, 2.6));
          R.run((function* () { yield* wait(0.35); yield* R.away(cop, dir * 5, 2.6); })());
          owner.mood = 'happy';
          R.run((function* () { yield* wait(0.6); yield* go(ctx, owner, h.door.x, h.door.z, 2.8); yield* R.out(owner); })());
        } else {
          // ---- 8b. clean away: the law is half a minute late
          B('8 clean away: gone round the corner, still laughing', [rob]);
          const far = wx + dir * (plan.len - 0.3);
          R.run((function* () { yield* goEach(ctx, rob, far, lz, 7); yield* R.out(rob); })());
          cackle(ctx, rob, 1.6, 'ha');
          yield* waitUntil(() => !rob.alive, 4);
          B('9 epilogue: the owner shakes a fist, the law arrives late', [owner]);
          cam.close(owner, { hold: 2.2 });
          owner.arms = 'fist'; owner.mood = 'angry';
          yell(ctx, owner, 'IK KRIJG JE NOG WEL!', '#ff6b6b', 14);
          ctx.news(`Burglar gets away from ${ctx.st.name} with the savings; owner "would know that laugh anywhere"`);
          yield* wait(1.2);
          yield* R.enter(cop, clamp(wx - dir * 6, EX0, EX1), lz);
          cam.two(cop, owner, { hold: 3 });
          yield* go(ctx, cop, owner.g.position.x - dir * 1.3, lz + 0.2, 5);
          cop.lookAt = owner; cop.arms = 'shrug'; cop.mood = 'sad';
          say(ctx, cop, 'net te laat...', { size: 13, color: '#cfe8ff' });
          owner.lookAt = cop; owner.arms = 'facepalm'; owner.mood = 'sad';
          ctx.sfx('womp');
          yield* wait(1.6);
          cop.lookAt = owner.lookAt = null; cop.arms = owner.arms = 'swing';
          R.run(R.away(cop, -dir * 5, 3));
          R.run((function* () { yield* go(ctx, owner, h.door.x, h.door.z, 2.8); yield* R.out(owner); })());
        }
        R.stop(blink); R.stop(pursuit);
        yield* R.settle(9);
        yield* wait(0.3);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
