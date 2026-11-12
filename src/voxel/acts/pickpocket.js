// Pickpocketing: a fat wallet in a back pocket, a pickpocket on tiptoe, a moth for a payday, and a cop with his hand up.
// Storyboard: storyboards/pickpocket.md. Every B(...) below is one beat of it, with who must be on screen.
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

  /** A fat, bright wallet: far easier to read from across the street than item.wallet(). */
  const mkWallet = () => sculpt((v) => {
    v.box(0, 0, 0, 0.32, 0.22, 0.09, '#ff5a1f');
    v.box(0, 0.09, 0.047, 0.12, 0.08, 0.02, '#ffd60a');
    v.box(0, 0.0, 0.047, 0.32, 0.03, 0.02, '#ffd60a');
  });
  /** A moth: a body and two wings that flap (wl / wr). */
  const mkMoth = () => {
    const g = new THREE.Group();
    g.add(sculpt((v) => v.box(0, 0, 0, 0.05, 0.05, 0.16, '#5b4636')));
    g.userData.wl = sculpt((v) => v.box(-0.11, 0, 0, 0.22, 0.02, 0.15, '#e6dcc4'));
    g.userData.wr = sculpt((v) => v.box(0.11, 0, 0, 0.22, 0.02, 0.15, '#e6dcc4'));
    g.add(g.userData.wl, g.userData.wr);
    g.scale.setScalar(1.8);
    return g;
  };

  // what is in the wallet (a moth flies out, a very long receipt unrolls, or one lonely coin rolls away)
  const mkCoin = () => sculpt((v) => { v.box(0, 0, 0, 0.16, 0.025, 0.16, '#ffd60a'); v.box(0, 0.02, 0, 0.1, 0.012, 0.1, '#e0a800'); });

  return {
    w: [0, 0, 3, 2, 2], crime: 1,
    // a strip of pavement the victim can stroll along and the thief can run down
    stage: { pave: { side: 'any', len: 10, depth: 1.2 } },
    *run(ctx) {
      const stageX = ctx.stage ? ctx.stage.x : 0; // (read before the first yield)
      const { rnd } = ctx, cam = camFor(ctx, 'pickpocket'), B = beatsFor(ctx, 'pickpocket'), R = rig(ctx);
      // the victim: somebody near who still has pavement ahead (no waiting), or an invented one who walks in while the first shot holds
      let ped = takePed(ctx, 14, (p) => Math.abs(p.exitX - p.g.position.x) > 9.5, stageX);
      const invented = !ped;
      let inDir = rnd.sign(), inX = clamp(stageX - inDir * 3.5, EX0 + 1, EX1 - 1), inZ = 0;
      if (invented) {
        ped = makePerson(rnd, { kind: T.extraKind ? T.extraKind(ctx) : 'civ' });
        const nm = rnd.chance(0.5) ? 'walkF0' : 'walkB1', sp0 = spotNear(ctx, inX, padZ(ctx, nm, inX));
        inX = sp0.x; inZ = sp0.z;
      } else R.borrow(ped);
      const vw = mkWallet();
      let done = false;
      try {
        const pp = ped.g.position;
        const dir = invented ? inDir : Math.sign(ped.exitX - pp.x) || 1, hd = dir > 0 ? E : W, fd = -dir; // fd: the way the thief runs off
        const lz = invented ? inZ : ped.lineZ ?? pp.z;
        const cap = (p, q) => (dir > 0 ? Math.min(p, q) : Math.max(p, q));
        const limit = invented ? S.runway(ctx, inX, lz, dir, 16, 0.5) - dir * 1.0 : cap(ped.exitX - dir * 1.2, S.runway(ctx, pp.x, lz, dir, 16, 0.5) - dir * 0.4);
        const thief = makePerson(rnd, { kind: rnd.pick(['robber', 'hoodie']) });
        const cop = makePerson(rnd, { kind: 'cop' });
        const prize = rnd.pick(['moth', 'receipt', 'coin']);
        let arrived = !invented, thiefIn = false, vTask = null, tTask = null;
        if (invented) {
          // he walks in from out of the frame (a brisk stroll) while the opening shot holds the place he is coming to
          vTask = R.run((function* () { yield* waitUntil(() => T.seen(ctx, inX, lz) && !T.seen(ctx, inX - inDir * 16, lz), 2); yield* R.enter(ped, inX, lz, undefined, { speed: 3.4 }); ped.heading = hd; arrived = true; })());
        }

        // the victim is driven by hand so that we can slow him down and stop him; he never walks off the end of the street
        let pv = 1.25;
        ped.heading = hd; ped.mood = 'whistle';
        const walker = R.run((function* () {
          for (;;) {
            const dt = yield;
            if (!ped.alive) return;
            if (!arrived) continue;
            if (pv > 0 && (limit - pp.x) * dir > 0) { pp.x += dir * pv * dt; ped.heading = hd; ped.moving = pv; }
            pp.y = 0;
          }
        })());
        // the thief stays `near` metres behind him, at the victim's pace plus whatever it takes to close the gap
        let near = 2.6;
        const mkTail = () => R.run((function* () {
          for (;;) {
            const dt = yield;
            if (!thief.alive || !ped.alive) return;
            const tq = thief.g.position, gap = (pp.x - tq.x) * dir, sp = clamp((gap - near) * 3 + Math.max(0, pv), 0, 3.4);
            tq.x += dir * sp * dt;
            tq.z += (pp.z - tq.z) * Math.min(1, dt * 4);
            thief.heading = hd; thief.moving = sp;
          }
        })());
        // he follows the victim in from out of the frame, a few seconds behind
        tTask = R.run((function* () {
          yield* wait(invented ? 1.4 : 0.6);
          const tx = clamp((invented ? inX : pp.x) - dir * (invented ? 3.4 : 3.2), EX0, EX1);
          yield* R.enter(thief, tx, lz, undefined, { speed: 3.8 });
          thief.heading = hd; thief.lookAt = ped; thief.gait = 'sneak'; thief.arms = 'sneak'; thief.mood = 'sly';
          thiefIn = true;
        })());
        let tail = null;

        // the wallet sticks out of the back pocket: right hip if he walks east, left hip if west (always the camera's side)
        vw.position.set(0.25 * dir, 0.72, -0.26);
        vw.rotation.z = 0.12 * dir;
        ped.b.add(vw);

        // ---- 1. the mark: a fat wallet, a whistling victim, a pickpocket falling in behind on tiptoe
        // (an invented victim is still walking in: the first shot holds the place he is coming to, then follows him)
        B('1 the mark: wallet in the back pocket, a victim strolls along', invented ? [pt(inX, lz)] : [ped]);
        if (invented) cam.wide(pt(inX, lz), { dist: 10, el: 0.22, az: -dir * 0.5 }); // (tight on the place he is coming to: the frame's edge is a few metres away)
        else cam.track(ped, { dist: 8, el: 0.1, az: -dir * 0.8, y: 0.9, lead: 1.2, fov: 34, hold: 2.2 });
        yield* waitUntil(() => arrived || (vTask && vTask.done), 40);
        if (invented) {
          cam.track(ped, { dist: 8, el: 0.1, az: -dir * 0.8, y: 0.9, lead: 1.2, fov: 34, cut: 0.8, hold: 2.2 });
          yield* wait(0.9);
        }
        yield* waitUntil(() => thiefIn || tTask.done, 40);
        B('1b the tail: the pickpocket creeps up behind him', [ped, thief]);
        tail = mkTail();
        cam.shot({ on: [ped, thief], dist: 8, el: 0.1, az: -dir * 0.7, y: 0.95, fov: 34, fit: true, cut: 0.6, hold: 5 });
        yield* wait(1.2);
        yield* waitUntil(() => (pp.x - thief.g.position.x) * dir < near + 0.2, 6);

        // ---- 2. the reveal: he turns to us and wiggles his fingers (the victim stops to look at his phone)
        B('2 reveal: the pickpocket grins at us', [thief]);
        pv = 0; ped.arms = 'phone'; ped.mood = 'focus';
        R.stop(tail);
        thief.lookAt = null; thief.gait = 'walk'; thief.heading = 0.25; thief.mood = 'sly'; thief.arms = 'rub';
        cam.hero(thief, { hold: 3.2 });
        cam.card('DE ZAKKENROLLER', 'Fingers faster than the Dutch tax office.', 2.1);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        yield* laugh(ctx, thief, 1.0, 'he');
        thief.arms = 'sneak'; thief.heading = hd; thief.mood = 'focus';

        // ---- 3. the lift: close on the pocket, the hand dives in, the wallet slides out
        B('3 the lift: the hand reaches in and the wallet slides out', [ped, thief, vw]);
        cam.shot({ on: ped, y: 0.75, dist: 3.4, el: 0.06, az: -dir * 1.0, fov: 38, hold: 3.6 });
        yield* wait(0.35);
        pv = 1.1; near = 0.8; ped.arms = 'swing'; ped.mood = 'whistle';
        const tail2 = mkTail();
        yield* waitUntil(() => (pp.x - thief.g.position.x) * dir < 1.0, 3);
        thief.arms = 'reach'; thief.mood = 'focus';
        yield* wait(0.4);
        ctx.sfx('swish');
        yield* tween(0.3, (u) => { vw.position.y = 0.72 + u * 0.3; vw.position.z = -0.26 - u * 0.12; vw.rotation.z = (0.12 + u * 0.6) * dir; });
        ped.b.remove(vw);
        vw.rotation.set(0, 0, 0);
        thief.hold(vw);
        thief.arms = 'hold'; thief.mood = 'smug';
        ctx.sfx('yoink');
        say(ctx, thief, 'YOINK!', { size: 22, color: '#ffd60a' });
        ctx.wanted = thief;
        ctx.incident();
        ctx.news('Pickpocket nabs wallet containing €5 and nine loyalty cards');
        yield* wait(0.9);
        // the victim strolls on, whistling; the thief lets him go
        R.stop(tail2);
        yield* wait(0.9);
        pv = 0;

        // ---- 4. the gloat: he opens the wallet... a moth, a receipt, and a very sad face
        B('4 the gloat: the wallet holds a moth and a receipt', [thief, vw]);
        thief.heading = 0.3; thief.mood = 'smug'; thief.arms = 'hold';
        cam.close(thief, { y: 1.35, dist: 6, fov: 28, hold: 6.5 });
        yield* wait(0.3);
        yield* laugh(ctx, thief, 0.7, 'he');
        ctx.sfx('tick');
        thief.mood = 'happy';
        yield* wait(0.3);
        const tp = thief.g.position, hx = tp.x, hz = tp.z + 0.35;
        thief.mood = 'shock';
        ctx.sfx('gasp');
        if (prize === 'moth') {
          const moth = R.add(mkMoth());
          moth.position.set(hx, 1.2, hz);
          thief.lookAt = moth;
          R.run((function* () {
            yield* tween(2.0, (u) => {
              moth.position.set(hx + Math.sin(u * 13) * 0.4 + u * 0.5, 1.2 + u * 1.5 + Math.sin(u * 9) * 0.15, hz + Math.cos(u * 11) * 0.25);
              moth.rotation.y = u * 18;
              const f = Math.sin(u * 140) * 0.9;
              moth.userData.wl.rotation.z = f; moth.userData.wr.rotation.z = -f;
            });
            R.rm(moth);
          })());
          yield* wait(1.0);
        } else if (prize === 'coin') {
          // one lonely coin falls out and rolls away down the pavement; he watches it go
          const coin = R.add(mkCoin());
          coin.position.set(hx, 1.0, hz);
          thief.lookAt = coin;
          R.run((function* () {
            yield* arc(coin, hx + dir * 0.5, 0.03, hz + 0.3, 0.4, 0.4, 0);
            ctx.sfx('coin');
            const x1 = hx + dir * 3.2;
            yield* tween(1.6, (u) => { coin.position.x = lerp(hx + dir * 0.5, x1, ease.outQuad(u)); coin.position.y = 0.03 + Math.abs(Math.sin(u * 14)) * 0.08 * (1 - u); coin.rotation.y = u * 20; });
            R.rm(coin);
          })());
          yield* wait(1.0);
        } else yield* wait(0.4);
        thief.lookAt = null;
        // ...and then a receipt, drifting out (a long one, if that is all there is)
        const paper = R.add(item.paper());
        paper.position.set(hx, 1.0, hz);
        if (prize === 'receipt') paper.scale.set(1, 3.2, 1);
        ctx.sfx('tick');
        R.run(arc(paper, hx + fd * 0.5, 0.03, hz + 0.3, 0.5, 1.1, 5));
        thief.mood = 'sad'; thief.arms = 'shrug'; thief.shakeT = 1.2;
        ctx.sfx('womp');
        say(ctx, thief, prize === 'coin' ? 'EEN CENT?! EN EEN BON?!' : 'ALLEEN EEN BON?!', { size: 15, color: '#cfe8ff' });
        yield* wait(1.0);

        // the cop is not far: he starts walking in now (out of the picture) and will stand where the thief runs
        const tx0 = tp.x, ra = S.runway(ctx, tx0, lz, fd, 12, 0.5);
        let cx = clamp(fd > 0 ? Math.min(tx0 + fd * 13, ra) : Math.max(tx0 + fd * 13, ra), EX0 + 1, EX1 - 1);
        if (Math.abs(cx - tx0) < 5) cx = clamp(tx0 + fd * 5.5, EX0 + 1, EX1 - 1);
        let copIn = false;
        const copTask = R.run((function* () {
          yield* R.enter(cop, cx, lz, undefined, { speed: 2.8 });
          cop.heading = hd; cop.arms = 'swing'; cop.mood = 'neutral'; cop.gait = 'walk';
          copIn = true;
        })());

        // ---- 5. the pat: the victim feels for his wallet, freezes, turns
        B('5 the pat: the victim pats his pockets and freezes', [ped]);
        ped.heading = hd; ped.arms = 'swing'; ped.mood = 'whistle'; ped.lookAt = null;
        cam.crash(ped, { hold: 4.2 });
        yield* wait(0.7);
        ped.arms = 'hips'; ctx.sfx('tick'); ped.squash(0.12);
        yield* wait(0.4);
        ped.arms = 'shrug'; ped.mood = 'neutral'; ctx.sfx('tick'); ped.squash(0.12);
        yield* wait(0.4);
        ped.arms = 'swing';
        yield* fright(ctx, ped, '?!');
        ped.lookAt = thief; ped.heading = hd + Math.PI; ped.mood = 'angry';
        yield* wait(0.3);
        ctx.sfx('hey');
        ped.arms = 'point';
        yell(ctx, ped, 'MIJN PORTEMONNEE!', '#ff6b6b', 16);
        yield* wait(0.8);
        say(ctx, ped, 'DIEF!', { size: 22, color: '#ff6b6b' });
        thief.lookAt = ped;
        yield* wait(0.4);

        // ---- 6. the chase: he bolts, laughing over his shoulder, straight into a raised police hand
        B('6 the chase: running, laughing, the victim hot on his heels, a cop standing ahead', [thief, ped, pt(cx, lz)]);
        R.stop(walker);
        yield* fright(ctx, thief, 'OEPS');
        thief.mood = 'happy'; thief.arms = 'hold';
        yield* waitUntil(() => copTask.done, 40);
        cam.shot({ on: [thief, ped, pt(cx, lz)], dist: 10, el: 0.1, az: fd * 0.55, y: 1.0, fov: 34, lead: 2.5, shake: 0.5, fit: true, cut: 0.4, hold: 6 });
        const dustT = R.run(runDust(ctx, thief));
        cackle(ctx, thief, 2.4, 'ha');
        const pchase = R.run((function* () {
          yield* wait(0.3);
          ped.arms = 'fist'; ped.lookAt = null;
          yield* chase(ctx, ped, thief, 5.7, 1.2, 8);
        })());
        yield* wait(0.3);
        let warned = false, cut = false;
        yield* goEach(ctx, thief, cx, lz, 5.6, () => {
          const d = Math.abs(thief.g.position.x - cop.g.position.x);
          if (!warned && d < 6.5) { warned = true; cop.arms = 'stop'; cop.mood = 'angry'; ctx.sfx('whistle'); }
          if (!cut && d < 3.4) {
            cut = true;
            B('6b the fall: straight into the raised hand', [thief, cop]);
            cam.dutch([thief, cop], { dist: 8, az: fd * 0.3, face: false, fit: true, cut: 0.2, hold: 2.6 });
          }
          return d < 1.1;
        });
        R.stop(dustT);
        // BONK: he runs into the hand, the wallet flies out of his grip and arcs back over the street
        ctx.sfx('bonk'); ctx.shake(0.35); cam.freeze(0.4, 0.08);
        ctx.fx.text('BONK!', at(tp.x, 2.4, lz), { size: 30, color: '#ffd60a' });
        ctx.fx.pips(tp.x, 1.9, lz, 8);
        thief.lookAt = null;
        thief.drop();
        const wp = R.add(mkWallet());
        wp.position.set(tp.x, 1.3, tp.z);
        R.stop(pchase);
        ped.moving = 0; ped.arms = 'reach'; ped.lookAt = wp;
        const tumbled = R.run(tumble(ctx, thief, tp.x - fd * 1.8, lz, 1.0, 0.6));
        yield* wait(0.95);
        B('6c the wallet flies back', [wp, ped]);
        cam.shot({ on: [wp, ped], dist: 7, el: 0.15, az: -fd * 0.4, y: 0.6, fov: 40, fit: true, cut: 0.3, hold: 2.6 });
        yield* arc(wp, pp.x, 1.05, pp.z, 2.6, 1.0, 8);
        R.rm(wp);
        ctx.sfx('tada');
        ped.hold(mkWallet());
        ped.lookAt = null; ped.arms = 'cheer'; ped.mood = 'happy'; ped.squash(0.25);
        say(ctx, ped, 'HA! MIJN PORTEMONNEE!', { size: 15, color: '#b9fbc0' });
        yield* waitUntil(() => tumbled.done, 3);

        // ---- 7. epilogue: cuffs and stars, the victim counts the loyalty cards, satisfied
        B('7 epilogue: the cop cuffs him', [cop, thief]);
        cam.two(cop, thief, { az: fd * 0.2, hold: 4 });
        cop.arms = 'hips'; cop.mood = 'smug';
        yield* go(ctx, cop, tp.x + fd * 0.9, lz + 0.15, 2.8);
        cop.heading = tp.x - cop.g.position.x > 0 ? E : W; cop.lookAt = thief;
        ctx.sfx('cuff');
        say(ctx, cop, 'GEARRESTEERD.', { size: 15, color: '#7db8ff' });
        R.run(seeStars(ctx, thief, 1.8));
        yield* wait(1.0);
        ctx.news('Pickpocket caught after running into police officer. Wallet recovered: a moth and a receipt');
        // the victim comes over and counts his cards
        const counting = R.run((function* () {
          yield* go(ctx, ped, tp.x - fd * 3.0, lz, 2.4);
          ped.arms = 'count'; ped.mood = 'happy'; ped.heading = Math.PI;
          ctx.sfx('tick');
          say(ctx, ped, '1, 2, 3... 9!', { size: 14, color: '#fff3b0' });
          yield* wait(1.4);
          ped.nodT = 1.2; ped.mood = 'smug';
          say(ctx, ped, 'KLOPT.', { size: 14, color: '#b9fbc0' });
        })());
        yield* wait(0.6);
        B('7b the victim counts his loyalty cards, satisfied, and the culprit is led off', [cop, thief, ped]);
        cam.wide([cop, thief, ped], { dist: 15, el: 0.3, az: fd * 0.2, fit: true });
        yield* getUp(thief, 'sad');
        thief.arms = 'swing'; cop.lookAt = null; cop.arms = 'point';
        ctx.sfx('womp');
        yield* wait(0.8);
        cop.arms = 'swing';
        R.run(R.away(thief, fd * 6, 2.4));
        R.run((function* () { yield* wait(0.4); yield* R.away(cop, fd * 6, 2.4); })());
        yield* wait(1.2);
        yield* waitUntil(() => counting.done, 3);
        // satisfied, he strolls on his way; the camera lets go and the rig walks the rest off
        ped.arms = 'swing'; ped.mood = 'whistle';
        if (invented) R.run(R.away(ped, dir * 14, 2.8)); else R.give(ped); // (he strolls on his way, out of the picture)
        yield* wait(0.5);
        done = true;
      } finally {
        cam.release();
        if (vw.parent) vw.parent.remove(vw);
        R.free(done);
      }
    },
  };
}
