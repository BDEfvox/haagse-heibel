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
    seat, rideTo, mount, dismount, lineObj, lootBox, beatsFor, flip, laugh, cackle, leap, tumble, getUp,
    seeStars, fright, tiptoe, shoulder, noteTrail, runDust, skid, drive, handbrake, exhaust, spawnPed, unped, stroll,
    release, needPed,
  } = T;

  const COLS = ['#7cfc9a', '#ffe066', '#ff8fab', '#8fd3ff'];
  /** One glowing jar, big enough to see on the pavement. */
  const mkJar = (c) => {
    const j = sculpt((v) => { v.box(0, 0, 0, 0.14, 0.18, 0.14, c); v.box(0, 0.18, 0, 0.16, 0.05, 0.16, '#ffffff'); }, MAT.glow);
    j.scale.setScalar(1.6);
    return j;
  };

  /**
   * Where the deal happens: along the kerb-side pavement lines, the spot with the most clear room round it AND a clear way to the
   * road (so a camera can stand and look at it), nearest the stage's centre. Null when nothing has 0.8 m of room.
   */
  function dealSpot(ctx, stageX, rnd) {
    let best = null;
    for (const nm of ['walkF1', 'walkB1']) {
      for (let dx = -9; dx <= 9; dx += 1.5) {
        const x = clamp(stageX + dx + rnd.range(-0.4, 0.4), -14, 14), z = padZ(ctx, nm, x);
        let r = 0;
        for (const rr of [3.0, 2.4, 1.8, 1.3, 0.9]) if (S.clearSpot(ctx, x, z, rr)) { r = rr; break; }
        if (!r) continue;
        const zr = z + (z > 0 ? -2.4 : 2.4); // the road side of the pavement: nothing parked there, so the camera can stand on it
        const open = S.clearSpot(ctx, x, zr, 0.8, { ground: 'open' }) ? 4 : 0;
        const score = r * 3 + open - Math.abs(dx) * 0.25;
        if (!best || score > best.score) best = { x, z, score };
      }
    }
    return best;
  }

  return {
    w: [0, 0, 1.4, 2, 2], crime: 1,
    // a clear patch of the camera-side pavement for the deal, and room either side for the customer and the cop to walk up
    stage: { pave: { side: 'any', len: 8, depth: 1.6 } },
    avail: (ctx) => !!padSpot(ctx, 'walkF1', 0, 1.0, 14),
    *run(ctx) {
      const stageX = ctx.stage ? ctx.stage.x : 0; // (read before the first yield)
      const { L, rnd } = ctx, cam = camFor(ctx, 'shadyDeal'), B = beatsFor(ctx, 'shadyDeal'), R = rig(ctx);
      // (room round the deal: the camera must be able to stand and look, so prefer a spot with 2 m of nothing about it)
      const spot = dealSpot(ctx, stageX, rnd);
      if (!spot) return;
      const x = spot.x, z = spot.z, side0 = rnd.sign();
      let done = false;
      const sneezeEnd = flip(ctx, 'sneeze', 0.35); // second ending: the oregano gets the cop instead
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
        cam.wide(pt(x - side0 * 1.5, z), { dist: 10, el: 0.25, az: 0.25 });
        dealer.gait = 'sneak'; dealer.mood = 'whistle';
        yield* waitUntil(() => T.seen(ctx, x - side0 * 3, z) && !T.seen(ctx, x - side0 * 17, z), 2); // (the tight shot is up before he walks into it)
        yield* R.enter(dealer, x - side0 * 1.5, z, undefined, { dir: side0 < 0 ? 1 : -1, speed: 3.6 });
        cam.dolly(dealer, { dist: 9, az: 0.15, y: 1.3 });
        yield* go(ctx, dealer, x, z, 2.2);
        dealer.gait = 'walk'; dealer.heading = 0.2; dealer.arms = 'cross'; dealer.mood = 'whistle';
        yield* wait(0.3);
        dealer.lookAt = { x: x - 8, z }; yield* wait(0.7);
        dealer.lookAt = { x: x + 8, z }; yield* wait(0.8);
        dealer.lookAt = { x: x - 8, z }; yield* wait(0.5);
        dealer.lookAt = null;
        say(ctx, dealer, 'psst...', { size: 12, color: '#b9fbc0' });

        // the customer is on his way now (somebody near, or a new walker from out of the frame): he arrives as the reveal ends
        let ped = takePed(ctx, 12, null, x), arrived = false, left = side0 < 0;
        const inventedCust = !ped;
        if (ped) { R.borrow(ped); left = ped.g.position.x < x; } else { ped = makePerson(rnd, { kind: T.extraKind ? T.extraKind(ctx) : 'civ' }); left = rnd.chance(0.5); }
        const finder = R.run((function* () {
          yield* wait(0.6);
          const ps = spotNear(ctx, x + (left ? -1.2 : 1.2), z - 0.2);
          if (inventedCust) yield* R.enter(ped, ps.x, ps.z, undefined, { dir: left ? 1 : -1, speed: 2.8 });
          else yield* go(ctx, ped, ps.x, ps.z, 2.8);
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
        B('3 the customer: peers, sniffs a jar, money changes hands', [dealer, pt(x + (left ? -1.2 : 1.2), z)]);
        yield* waitUntil(() => arrived || finder.done, 14);
        if (!arrived) { // nobody came: the dealer shuts his coat and slinks off
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
        // the handover, close (meanwhile a cop strolls in from the other side, out of this shot)
        let cd = -cs, copX = x + cd * 1.35;
        // (he comes in from the side where the frame's edge is near: when only the far side is a long walk away he comes up behind the customer instead)
        const copEt = (c, off) => T.entryTime(ctx, cop, x + c * off, z, { dir: c > 0 ? -1 : 1, speed: 3.0 });
        if (copEt(cd, 1.35) > 5 && copEt(-cd, 2.6) < copEt(cd, 1.35)) { cd = -cd; copX = x + cd * 2.6; }
        cop.heading = cd > 0 ? W : E; cop.mood = 'smug'; cop.gait = 'strut';
        let copIn = false;
        const copTask = R.run((function* () { yield* R.enter(cop, copX, z, undefined, { dir: cd > 0 ? -1 : 1, speed: 3.0 }); copIn = true; })());
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
        B('4 the law: the cop strolls up, the customer points, the dealer whistles', [dealer, ped, pt(x + cd * 6, z)]);
        cam.shot({ on: [ped, dealer, pt(x + cd * 6, z)], dist: 16, el: 0.2, az: -cd * 0.15, y: 1.2, fov: 34, fit: true, cut: 0.4, hold: 4.2 });
        yield* wait(0.3);
        yield* waitUntil(() => (Math.abs(cop.g.position.x - x) < 6 && !cop.offstage) || copTask.done, 40);
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
        yield* waitUntil(() => copTask.done, 40);
        cop.gait = 'walk'; cop.heading = cd > 0 ? W : E; cop.lookAt = dealer; cop.mood = 'focus';
        yield* wait(0.5);

        // ---- 5. the tap: sniff, tap, and the jars fall out one by one, then all at once
        const jars = [];
        const fl = -cd; // the way the dealer runs: away from the cop, on the camera side of the customer
        const jx = x + fl * 4.2, jz = z + (z > 0 ? 0.35 : -0.35), slipIdx = 4;
        B('5 the tap: jars clatter onto the pavement', [dealer, cop, pt(jx, jz)]);
        const spots = [[x - 0.6, z + 0.35], [x + 0.5, z + 0.25], [x - 0.15, z + 0.55], [x + 1.0, z + 0.4], [jx, jz], [x + 0.2, z + 0.15]];
        const dropJar = (i) => {
          const c = COLS[i % 4], jo = R.add(mkJar(c)), s = spots[i];
          jo.position.set(x, 1.1, z + 0.3);
          jars[i] = { o: jo, x: s[0], z: s[1], c };
          return R.run((function* () {
            yield* arc(jo, s[0], 0.02, s[1], 0.35, i === 4 ? 0.75 : 0.4, 6 + i);
            ctx.sfx('clatter'); ctx.fx.dust(s[0], 0, s[1], 0, 0, 2);
            yield* arc(jo, s[0] + (i % 2 ? 0.15 : -0.15), 0.02, s[1], 0.15, 0.18, 2);
          })());
        };
        cam.ground([pt(x, z + 0.3), pt(jx, jz)], { dist: 6.5, az: -cd * 0.25, y: 0.5, fit: true, cut: 0.3, hold: 3.6 });
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

        if (sneezeEnd) {
          // ---- 6 (second ending). the cop picks up a jar to sniff it properly, and the oregano gets HIM; the dealer strolls off whistling
          B('6 the sneeze: the cop picks up a jar to smell it and the oregano gets him', [cop, dealer]);
          const j2 = jars[2];
          cam.shot({ on: [cop, dealer, pt(j2.x, j2.z)], dist: 8, el: 0.12, az: fl * 0.3, y: 1.0, fov: 34, fit: true, hold: 3 });
          dealer.arms = 'cross'; dealer.mood = 'whistle'; dealer.lookAt = null;
          yield* go(ctx, cop, j2.x - cd * 0.5, j2.z - 0.3, 2.4);
          cop.arms = 'reach'; cop.squash(0.2);
          yield* wait(0.3);
          R.rm(j2.o);
          cop.hold(mkJar(j2.c)); cop.arms = 'hold'; cop.mood = 'focus';
          ctx.sfx('tick');
          yield* wait(0.5);
          for (let i = 0; i < 2; i++) { ctx.sfx('tick'); cop.squash(0.12); ctx.fx.text('snif', at(cop.g.position.x, 2.1, cop.g.position.z), { size: 14, color: '#cfe8ff', dur: 0.6 }); yield* wait(0.35); }
          cop.mood = 'shock';
          ctx.sfx('gasp');
          say(ctx, cop, 'HA... HA... HA...', { size: 14, color: '#cfe8ff' });
          yield* wait(0.7);
          B('6b the sneeze: HATSJOE, and the cop sits down in a green cloud', [cop]);
          cam.close(cop, { dist: 6, cut: 0.4, hold: 2.6 });
          yield* wait(0.4);
          say(ctx, cop, 'HATSJOEEE!', { size: 26, color: '#b9fbc0' });
          ctx.sfx('boing');
          ctx.fx.smoke(cop.g.position.x, 1.6, cop.g.position.z, 16, ['#7cfc9a', '#5a8f3c', '#3f6f2a'], 0.6);
          cop.drop();
          const cq = cop.g.position;
          R.run(R.away(dealer, fl * 10, 2.4)); // (the dealer strolls off whistling, hands in pockets)
          yield* tumble(ctx, cop, cq.x + cd * 1.6, cq.z, 0.7, 0.5);
          R.run(seeStars(ctx, cop, 1.8));
          ctx.news('Officer sneezes on own evidence; suspect strolls off. "Het was echt oregano," says the suspect');
          yield* wait(1.6);
          B('7 epilogue: the dealer is gone, the cop sits in the cloud', [cop]);
          cam.wide(pt(x, z), { dist: 14, el: 0.25 });
          yield* wait(1.0);
        } else {
        // ---- 6. the run: he bolts, skids on his own jar and goes down in a green cloud; the cop sneezes too
        B('6 the run: the dealer bolts, the cop after him', [dealer, cop]);
        const fx1 = clamp(x + fl * 11, EX0, EX1);
        dealer.arms = 'swing'; dealer.mood = 'scared';
        ctx.sfx('hey');
        say(ctx, cop, 'HALT!', { size: 18, color: '#7db8ff' });
        cop.lookAt = null; cop.arms = 'swing'; cop.mood = 'angry';
        cam.shot({ on: [dealer, cop], dist: 10, el: 0.1, az: fl * 0.5, y: 1.0, fov: 34, lead: 2.5, shake: 0.5, fit: true, cut: 0.3, hold: 4.2 });
        const dust = R.run(runDust(ctx, dealer));
        const pchase = R.run((function* () { yield* wait(0.4); cop.mood = 'angry'; yield* chase(ctx, cop, dealer, 5.6, 1.0, 8); })());
        yield* wait(0.7);
        let dutch = false;
        yield* goEach(ctx, dealer, fx1, jz, 6.0, () => {
          const d = Math.abs(dealer.g.position.x - jx);
          if (!dutch && d < 2.0) {
            dutch = true;
            B('6b the slip', [dealer, jars[slipIdx].o]);
            cam.dutch([dealer, jars[slipIdx].o], { dist: 7, az: fl * 0.3, face: false, fit: true, cut: 0.2, hold: 2.6 });
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
        yield* tumble(ctx, dealer, dp.x + fl * 2.2, jz + (z > 0 ? 0.5 : -0.5), 0.9, 0.6);
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
        B('7 epilogue: the cop leads him off', [cop, dealer]);
        cam.two(cop, dealer, { az: fl * 0.2, hold: 3 });
        yield* go(ctx, cop, dealer.g.position.x - fl * 0.9, dealer.g.position.z, 2.6);
        cop.heading = fl > 0 ? E : W; cop.lookAt = dealer; cop.mood = 'smug'; cop.arms = 'hips';
        ctx.sfx('cuff');
        say(ctx, cop, 'KOM MAAR MEE, MEESTER KRUID.', { size: 13, color: '#7db8ff' });
        R.run(seeStars(ctx, dealer, 1.8));
        ctx.news('Dealer caught after slipping on own stock. Sniffing officer: "I am on antihistamines now"');
        yield* wait(1.2);
        }
        // the customer: he looks at the jars, and picks the nearest one that is left
        let best = null;
        for (let i = 0; i < jars.length; i++) {
          if (!jars[i] || i === slipIdx || (sneezeEnd && i === 2)) continue;
          const d = Math.abs(jars[i].x - ped.g.position.x);
          if (!best || d < best.d) best = { d, i };
        }
        const jr = jars[best ? best.i : 0];
        R.run((function* () {
          if (sneezeEnd) { yield* getUp(cop, 'sad'); cop.arms = 'swing'; yield* R.away(cop, -fl * 7, 2.4); return; }
          yield* getUp(dealer, 'sad'); dealer.arms = 'swing';
          cop.lookAt = null; cop.arms = 'point';
          R.run(R.away(dealer, fl * 7, 2.4));
          yield* wait(0.4);
          yield* R.away(cop, fl * 7, 2.4);
        })());
        ped.mood = 'happy'; ped.arms = 'swing'; ped.lookAt = null;
        B('7b the customer pockets one last jar', [ped, pt(jr.x, jr.z)]);
        cam.shot({ on: [ped, pt(jr.x, jr.z)], y: 0.9, dist: 6.5, fov: 30, fit: true, cut: 0.5, hold: 3.4 });
        yield* go(ctx, ped, jr.x, jr.z - 0.45, 3.0);
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
        cam.wide(pt(x, z), { dist: 16, el: 0.3, az: 0.2 });
        if (inventedCust) R.run(R.away(ped, (left ? 1 : -1) * 12, 2.2)); else R.give(ped);
        yield* wait(1.6); // (the payoff has landed: the camera lets go and the rig walks the rest off)
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
