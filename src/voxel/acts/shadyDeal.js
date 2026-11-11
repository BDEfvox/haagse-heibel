// The street deal: a man in a long coat sells "oregano" from inside it, until the law sniffs the air.
// Storyboard: storyboards/shadyDeal.md. Every B(...) below is one beat of it, with who must be on screen.
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

  const COLS = ['#7cfc9a', '#ffe066', '#ff8fab', '#8fd3ff'];
  /** One glowing jar, big enough to see on the pavement. */
  const mkJar = (c) => {
    const j = sculpt((v) => { v.box(0, 0, 0, 0.14, 0.18, 0.14, c); v.box(0, 0.18, 0, 0.16, 0.05, 0.16, '#ffffff'); }, MAT.glow);
    j.scale.setScalar(1.6);
    return j;
  };

  return {
    w: [0, 0, 1.4, 2, 2], crime: 1,
    avail: (ctx) => !!padSpot(ctx, 'walkF1', 0, 1.0, 14),
    *run(ctx) {
      const { L, rnd } = ctx, cam = camFor(ctx, 'shadyDeal'), B = beatsFor(ctx, 'shadyDeal'), R = rig(ctx);
      const spot = padSpot(ctx, 'walkF1', rnd.range(-7, 7), 1.0, 14);
      if (!spot) return;
      const x = spot.x, z = spot.z, side0 = rnd.sign();
      let done = false;
      try {
        const dealer = makePerson(rnd, { kind: 'hoodie', shirt: '#4a3b2a' });
        const cop = makePerson(rnd, { kind: 'cop' });
        // the coat: a shut front panel, or flaps held open on rows of glowing jars
        const shut = sculpt((v) => v.box(0, 0.55, 0.28, 0.78, 0.9, 0.06, '#3a2d20'));
        const flaps = sculpt((v) => { v.box(-0.42, 0.45, 0.26, 0.1, 0.95, 0.16, '#3a2d20'); v.box(0.42, 0.45, 0.26, 0.1, 0.95, 0.16, '#3a2d20'); });
        const wares = sculpt((v) => { for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) v.box(-0.27 + c * 0.18, 0.74 + r * 0.3, 0.26, 0.13, 0.19, 0.09, COLS[(r * 4 + c) % 4]); }, MAT.glow);
        dealer.b.add(shut, flaps, wares);
        flaps.visible = false; wares.visible = false;
        const coat = (open) => { shut.visible = !open; flaps.visible = open; wares.visible = open; };

        // ---- 1. loitering: he saunters up, leans, and looks up and down the street, far too casual
        B('1 loitering: the dealer looks up and down the street', [dealer]);
        cam.wide(pt(x, z), { dist: 16, el: 0.3, az: 0.25, hold: 1.4 });
        yield* R.enter(dealer, clamp(x - side0 * 7, EX0, EX1), z);
        dealer.gait = 'sneak'; dealer.mood = 'whistle';
        cam.dolly(dealer, { dist: 12, az: 0.15, y: 1.3, hold: 4.6 });
        yield* go(ctx, dealer, x, z, 2.6);
        dealer.gait = 'walk'; dealer.heading = 0.2; dealer.arms = 'cross'; dealer.mood = 'whistle';
        yield* wait(0.3);
        dealer.lookAt = { x: x - 8, z }; yield* wait(0.7);
        dealer.lookAt = { x: x + 8, z }; yield* wait(0.8);
        dealer.lookAt = { x: x - 8, z }; yield* wait(0.5);
        dealer.lookAt = null;
        say(ctx, dealer, 'psst...', { size: 12, color: '#b9fbc0' });

        // the customer is fetched now, so that he does not stand about in the street waiting for us
        let ped = null, arrived = false, left = side0 < 0;
        const finder = R.run((function* () {
          const p = yield* needPed(ctx, 12);
          if (!p) return;
          R.borrow(p);
          ped = p;
          left = p.g.position.x < x;
          const ps = spotNear(ctx, x + (left ? -1.2 : 1.2), z - 0.2);
          yield* go(ctx, p, ps.x, ps.z, 2.6);
          arrived = true;
        })());

        // ---- 2. the reveal: the coat opens on rows of glowing jars
        B('2 reveal: the coat opens on glowing jars', [dealer]);
        dealer.heading = 0; dealer.mood = 'sly'; dealer.arms = 'hips';
        coat(true);
        ctx.sfx('swish');
        cam.hero(dealer, { hold: 3.4 });
        cam.card('DE KRUIDENMAN', 'Everything is oregano. Officially.', 2.1);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        yield* laugh(ctx, dealer, 1.0, 'he');
        dealer.arms = 'hips';
        say(ctx, dealer, rnd.pick(['OREGANO. ECHT WAAR.', '"KRUIDEN"', 'VERS UIT DE... TUIN']), { size: 14, color: '#b9fbc0' });

        // ---- 3. the customer: psst, a sniff, HATSJOE, and a wad changes hands
        B('3 the customer: peers, sniffs a jar, money changes hands', [dealer]);
        yield* waitUntil(() => arrived || finder.done, 14);
        if (!ped || !arrived) { // nobody came: the dealer shuts his coat and slinks off
          coat(false); dealer.mood = 'sad';
          yield* R.leave(dealer, 3, clamp(x + side0 * 12, EX0, EX1));
          done = true;
          return;
        }
        const cs = left ? -1 : 1; // which side of the dealer the customer stands on
        ped.heading = left ? 1.2 : -1.2; dealer.heading = left ? -0.8 : 0.8;
        dealer.arms = 'wave'; dealer.lookAt = ped; ped.lookAt = dealer; ped.mood = 'focus';
        cam.two(ped, dealer, { az: 0, y: 1.2, hold: 3.6 });
        ctx.sfx('tick');
        say(ctx, dealer, 'psst... kom eens kijken', { size: 12, color: '#b9fbc0' });
        yield* wait(0.9);
        // a jar goes across and the customer sniffs it
        dealer.arms = 'hips';
        const jarA = R.add(mkJar(COLS[0]));
        jarA.position.set(x, 1.1, z + 0.3);
        yield* arc(jarA, ped.g.position.x - cs * 0.1, 1.15, ped.g.position.z + 0.25, 0.3, 0.4, 5);
        R.rm(jarA);
        const hold1 = mkJar(COLS[0]);
        ped.hold(hold1); ped.arms = 'hold';
        for (let i = 0; i < 2; i++) { ctx.sfx('tick'); ped.squash(0.12); yield* wait(0.35); }
        const pp = ped.g.position;
        ctx.sfx('boing');
        say(ctx, ped, 'HATSJOE!', { size: 24, color: '#b9fbc0' });
        ctx.fx.smoke(pp.x, 1.6, pp.z + 0.2, 12, ['#7cfc9a', '#5a8f3c', '#3f6f2a'], 0.5);
        ctx.fx.burst(pp.x, 1.5, pp.z, { n: 10, colors: ['#5a8f3c', '#7cfc9a', '#3f6f2a'], speed: 3, up: 4, size: [0.05, 0.1] });
        ped.mood = 'shock'; ped.shakeT = 0.8;
        yield* hop(ped, 0.3, 0.26);
        ped.mood = 'happy';
        yield* wait(0.5);
        // the handover, close
        cam.shot({ on: [ped, dealer], dist: 5.4, el: 0.05, y: 1.15, fov: 30, hold: 2.6 });
        yield* wait(0.35);
        const wad1 = R.add(item.wad());
        wad1.scale.setScalar(1.6);
        wad1.position.set(pp.x + cs * 0.2, 1.05, pp.z + 0.2);
        ctx.sfx('swish');
        yield* arc(wad1, x, 1.1, z + 0.3, 0.4, 0.5, 6);
        R.rm(wad1);
        const wad2 = item.wad(); wad2.scale.setScalar(1.6);
        dealer.hold(wad2); dealer.arms = 'count'; dealer.mood = 'happy'; dealer.lookAt = null;
        ctx.sfx('kaching');
        ctx.fx.cash(x, 1.2, z + 0.3, 4, 1.6, 2.5);
        ctx.incident();
        ctx.news(`Man sells "oregano" on ${ctx.st.name} at suspicious mark-up`);
        ped.arms = 'swing'; ped.lookAt = null; ped.nodT = 1;
        yield* wait(0.9);

        // ---- 4. the law: a cop strolls up behind; the customer sees him first, the dealer snaps his coat shut
        B('4 the law: the cop strolls up, the customer points, the dealer whistles', [cop, dealer, ped]);
        const cd = -cs, cx0 = clamp(x + cd * 11, EX0, EX1), copX = x + cd * 1.35;
        R.spawn(cop, cx0, padZ(ctx, 'walkF0', cx0));
        cop.g.scale.setScalar(0.001);
        R.run(popIn(ctx, cop));
        cop.heading = cd > 0 ? W : E; cop.mood = 'smug'; cop.gait = 'strut';
        cam.shot({ on: [ped, dealer, cop], dist: 16, el: 0.2, az: -cd * 0.15, y: 1.2, fov: 34, fit: true, cut: 0.4, hold: 4.2 });
        yield* wait(0.3);
        const cwalk = R.run(go(ctx, cop, copX, z, 2.6));
        yield* waitUntil(() => Math.abs(cop.g.position.x - x) < 6, 6);
        ped.lookAt = cop;
        yield* doubleTake(ctx, ped, 'HÈ!');
        ped.arms = 'point'; ped.mood = 'shock';
        yield* wait(0.3);
        dealer.lookAt = cop;
        cam.crash(dealer, { hold: 3 });
        yield* wait(0.35);
        yield* doubleTake(ctx, dealer, 'HÈ?!');
        coat(false);
        ctx.sfx('slam');
        ctx.fx.burst(x, 1.2, z + 0.3, { n: 10, colors: ['#5a8f3c', '#7cfc9a', '#3f6f2a'], speed: 3, up: 4, size: [0.05, 0.1] });
        dealer.drop();
        dealer.arms = 'cross'; dealer.lookAt = null; dealer.heading = 0; dealer.mood = 'whistle';
        say(ctx, dealer, '♪ fluit fluit ♪', { size: 14, color: '#ffffff' });
        say(ctx, dealer, 'NIKS!', { size: 16, color: '#ffffff', off: 0.6 });
        ctx.wanted = dealer;
        ped.arms = 'swing'; ped.lookAt = null; ped.mood = 'happy';
        yield* waitUntil(() => cwalk.done, 4);
        cop.gait = 'walk'; cop.heading = cd > 0 ? W : E; cop.lookAt = dealer; cop.mood = 'focus';
        yield* wait(0.5);

        // ---- 5. the tap: sniff, tap, and the jars fall out one by one, then all at once
        B('5 the tap: jars clatter onto the pavement', [dealer, cop]);
        const jars = [];
        const fl = -cd; // the way the dealer runs: away from the cop, on the camera side of the customer
        const jx = x + fl * 2.2, jz = z + 0.9 * (2.2 / 11), slipIdx = 4;
        const spots = [[x - 0.6, z + 0.35], [x + 0.5, z + 0.25], [x - 0.15, z + 0.55], [x + 1.0, z + 0.4], [jx, jz], [x + 0.2, z + 0.15]];
        const dropJar = (i) => {
          const c = COLS[i % 4], jo = R.add(mkJar(c)), s = spots[i];
          jo.position.set(x, 1.1, z + 0.3);
          jars[i] = { o: jo, x: s[0], z: s[1], c };
          return R.run((function* () {
            yield* arc(jo, s[0], 0.02, s[1], 0.35, 0.4, 6 + i);
            ctx.sfx('clatter'); ctx.fx.dust(s[0], 0, s[1], 0, 0, 2);
            yield* arc(jo, s[0] + (i % 2 ? 0.15 : -0.15), 0.02, s[1], 0.15, 0.18, 2);
          })());
        };
        cam.ground(pt(x, z + 0.3), { dist: 5.4, az: -cd * 0.25, y: 0.5, cut: 0.3, hold: 3.6 });
        yield* wait(0.35);
        for (let i = 0; i < 2; i++) { cop.squash(0.1); ctx.sfx('tick'); ctx.fx.text('snif', at(cop.g.position.x, 2.1, cop.g.position.z), { size: 14, color: '#cfe8ff', dur: 0.6 }); yield* wait(0.3); }
        cop.arms = 'point';
        yield* wait(0.3);
        ctx.sfx('tick'); cop.squash(0.12);
        dropJar(0);
        yield* wait(0.6);
        ctx.sfx('tick'); cop.squash(0.12);
        dropJar(1);
        yield* wait(0.6);
        cop.arms = 'hips';
        for (let i = 2; i < 6; i++) { dropJar(i); yield* wait(0.17); }
        ctx.shake(0.12);
        yield* wait(0.5);
        cam.face(dealer, { hold: 1.6 });
        dealer.heading = 0; dealer.mood = 'shock'; dealer.arms = 'up';
        ctx.fx.pips(x, 1.9, z, 6, ['#bfe9fb', '#ffffff']);
        yield* wait(0.6);
        say(ctx, dealer, '...OREGANO?', { size: 14, color: '#ffffff' });
        yield* wait(0.9);

        // ---- 6. the run: he bolts, skids on his own jar and goes down in a green cloud; the cop sneezes too
        B('6 the run: the dealer slips on his own jar', [dealer, cop]);
        const fx1 = clamp(x + fl * 11, EX0, EX1);
        dealer.arms = 'swing'; dealer.mood = 'scared';
        ctx.sfx('hey');
        say(ctx, cop, 'HALT!', { size: 18, color: '#7db8ff' });
        cop.lookAt = null; cop.arms = 'swing'; cop.mood = 'angry';
        cam.shot({ on: [dealer, cop], dist: 10, el: 0.1, az: fl * 0.5, y: 1.0, fov: 34, lead: 2.5, shake: 0.5, fit: true, cut: 0.3, hold: 4.2 });
        const dust = R.run(runDust(ctx, dealer));
        const pchase = R.run((function* () { yield* wait(0.4); cop.mood = 'angry'; yield* chase(ctx, cop, dealer, 5.6, 1.0, 8); })());
        yield* wait(0.3);
        let dutch = false;
        yield* goEach(ctx, dealer, fx1, z + 0.9, 6.6, () => {
          const d = Math.abs(dealer.g.position.x - jx);
          if (!dutch && d < 2.6) {
            dutch = true;
            B('6b the slip', [dealer, jars[slipIdx].o]);
            cam.dutch([dealer, cop], { dist: 8, az: fl * 0.3, face: false, fit: true, cut: 0.2, hold: 2.6 });
          }
          return d < 0.3;
        });
        R.stop(dust);
        // whoops: the jar skates away and he goes down in a green cloud
        const dp = dealer.g.position;
        ctx.sfx('boing');
        say(ctx, dealer, 'WOEPS!', { size: 20, color: '#ffffff' });
        ctx.fx.smoke(dp.x, 0.6, dp.z, 16, ['#7cfc9a', '#5a8f3c', '#3f6f2a'], 0.6);
        R.run(arc(jars[slipIdx].o, jx + fl * 3.2, 0.02, jz, 0.5, 0.7, 9));
        R.stop(pchase);
        yield* tumble(ctx, dealer, dp.x + fl * 2.2, z + 1.0, 0.9, 0.6);
        ctx.fx.smoke(dealer.g.position.x, 0.5, dealer.g.position.z, 14, ['#7cfc9a', '#5a8f3c', '#3f6f2a'], 0.6);
        // the cop arrives at the cloud, and sneezes
        R.run((function* () {
          yield* chase(ctx, cop, dealer, 5.6, 1.4, 4);
          cop.arms = 'swing'; cop.mood = 'shock';
          yield* wait(0.2);
          ctx.sfx('gasp');
          say(ctx, cop, 'HA... HA...', { size: 14, color: '#cfe8ff' });
          yield* wait(0.5);
          say(ctx, cop, 'HATSJOE!', { size: 24, color: '#b9fbc0' });
          ctx.sfx('boing'); cop.squash(0.3);
          yield* hop(cop, 0.35, 0.28);
          ctx.fx.smoke(cop.g.position.x, 1.5, cop.g.position.z, 8, ['#7cfc9a', '#5a8f3c'], 0.5);
          cop.mood = 'sad';
        })());
        yield* wait(2.1);

        // ---- 7. epilogue: cuffs and stars; the customer pockets one last jar and strolls on
        B('7 epilogue: the cop leads him off, the customer pockets a jar', [cop, dealer]);
        cam.two(cop, dealer, { az: fl * 0.2, hold: 3 });
        yield* go(ctx, cop, dealer.g.position.x - fl * 0.9, dealer.g.position.z, 2.6);
        cop.heading = fl > 0 ? E : W; cop.lookAt = dealer; cop.mood = 'smug'; cop.arms = 'hips';
        ctx.sfx('cuff');
        say(ctx, cop, 'KOM MAAR MEE, MEESTER KRUID.', { size: 13, color: '#7db8ff' });
        R.run(seeStars(ctx, dealer, 1.8));
        ctx.news('Dealer caught after slipping on own stock. Sniffing officer: "I am on antihistamines now"');
        yield* wait(1.2);
        // the customer: he looks at the jars, and picks the nearest one that is left
        let best = null;
        for (let i = 0; i < jars.length; i++) {
          if (!jars[i] || i === slipIdx) continue;
          const d = Math.abs(jars[i].x - ped.g.position.x);
          if (!best || d < best.d) best = { d, i };
        }
        const jr = jars[best ? best.i : 0];
        cam.close(ped, { y: 1.3, dist: 6.5, fov: 30, cut: 0.4, hold: 3.4 });
        R.run((function* () {
          yield* getUp(dealer, 'sad'); dealer.arms = 'swing';
          cop.lookAt = null; cop.arms = 'point';
          R.run(R.away(dealer, fl * 7, 2.4));
          yield* wait(0.4);
          yield* R.away(cop, fl * 7, 2.4);
        })());
        ped.mood = 'happy'; ped.arms = 'swing'; ped.lookAt = null;
        yield* go(ctx, ped, jr.x, jr.z - 0.45, 2.0);
        ped.heading = 0;
        ped.arms = 'reach'; ped.squash(0.25); ped.mood = 'focus';
        yield* wait(0.5);
        R.rm(jr.o);
        ped.hold(mkJar(jr.c));
        ped.arms = 'shrug'; ped.mood = 'smug'; ped.squash(0.15);
        ctx.sfx('tick');
        say(ctx, ped, 'voor de zekerheid.', { size: 13, color: '#b9fbc0' });
        yield* wait(0.9);
        ped.hold(mkJar(jr.c), 'back');
        ped.arms = 'swing'; ped.mood = 'whistle';
        ctx.sfx('gulp');
        cam.wide(pt(x, z), { dist: 18, el: 0.3, az: 0.2, hold: 4 });
        R.give(ped);
        yield* R.settle(8);
        yield* wait(0.5);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
