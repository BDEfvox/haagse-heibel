// Fights and threats: the scuffle. Two strangers, one pavement, a rolling dust cloud and a granny who backed a draw.
// Storyboard: storyboards/scuffle.md. Every B(...) below is one beat of it, with who must be on screen.
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

  /** Places on the pavement with room for the ring of onlookers and the rolling dust cloud; each with the directions the cloud can roll. */
  const scuffleSpots = (ctx) => once(ctx, 'scuffle', () => scuffleSpots0(ctx));
  function scuffleSpots0(ctx) {
    const out = [];
    for (const nm of ['walkF0', 'walkB1']) {
      for (const x of [0, -5, 5, -8, 8, -3, 3]) {
        const z = padZ(ctx, nm, x);
        if (!S.lineClear(ctx, x - 4, z, x + 4, z, 0.5) || !S.clearSpot(ctx, x, z + (nm === 'walkF0' ? 1.5 : -1.5), 0.8, { ground: 'open' })) continue;
        const sides = [-1, 1].filter((sd) => Math.abs(S.runway(ctx, x, z, sd, 9, 0.5) - x) >= 7);
        if (sides.length) out.push({ x, z, sides });
      }
    }
    return out;
  }

  return {
    w: [0, 0, 1.4, 2.4, 2.6], crime: 2,
    avail: (ctx) => scuffleSpots(ctx).length > 0,
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'scuffle'), B = beatsFor(ctx, 'scuffle'), R = rig(ctx);
      const spotsAt = scuffleSpots(ctx);
      if (!spotsAt.length) return;
      let done = false;
      try {
        const sp0 = rnd.pick(spotsAt), x = sp0.x + rnd.range(-0.5, 0.5), z = sp0.z, side = rnd.pick(sp0.sides);
        const cc = pt(x, z); // the camera follows this point; it rolls along with the dust cloud later
        const a = makePerson(rnd, {}), b = makePerson(rnd, { kind: rnd.chance(0.3) ? 'chef' : 'civ' });

        // ---- 1. set-up: two pedestrians, one pavement, both looking at something else
        B('1 set-up: two strangers walk towards each other', [a, b]);
        cam.wide(cc, { dist: 24, hold: 2.4 });
        a.hold(item.phone()); a.arms = 'hold'; a.mood = 'neutral';
        b.hold(item.wafel()); b.arms = 'hold'; b.mood = 'happy';
        yield* all(R.enter(a, x - 9, z), R.enter(b, x + 9, z));
        a.heading = E; b.heading = W;
        // closer: both in the picture before they meet
        cam.two(a, b, { dist: 12, el: 0.12, fit: true, hold: 3.4, drift: { dist: -1.5 } });
        yield* wait(0.4);
        yield* all(go(ctx, a, x - 0.65, z, 4.4), go(ctx, b, x + 0.65, z, 4.4));
        a.heading = E; b.heading = W;

        B('1b the bump: OEF', [a, b]);
        ctx.sfx('thud'); ctx.shake(0.15);
        ctx.fx.text('OEF!', at(x, 2.2, z), { size: 20, color: '#fff' });
        a.mood = b.mood = 'shock'; a.lookAt = b; b.lookAt = a;
        a.squash(0.25); b.squash(0.25);
        yield* all(hop(a, 0.2, 0.25), hop(b, 0.2, 0.25));
        a.drop(); b.drop();
        a.arms = b.arms = 'fist';
        yield* wait(0.3);

        // ---- 2. the argument: faces from neutral to angry, over the shoulder, then close on each in turn
        const row = rnd.pick([['DAT IS MIJN PLEK!', 'NIETES!', 'WELLES!', 'JIJ LOOPT IN DE WEG!', 'JIJ BENT ER NIET EENS!'], ['JIJ KEEK NAAR MIJ!', 'IK KEEK NIET!', 'WEL!', 'NIET!', 'KOM DAN!'], ['AJAX!', 'ADO!', '...ZEG DAT NOG EENS', 'ADO!!', 'DAN KOM JE TOCH?']]);
        for (let i = 0; i < 5; i++) {
          const sp = i % 2 ? b : a, other = i % 2 ? a : b;
          if (i === 0) { B('2a first words, over the shoulder', [a, b]); cam.ots(a, b, { hold: 1.8, cut: 0.3 }); }
          else if (i === 1) { B('2b the answer, other shoulder', [a, b]); cam.ots(b, a, { hold: 1.8, cut: 0.3 }); }
          else if (i === 2) { B('2c the first face turns red', [sp]); cam.close(sp, { hold: 1.8 }); }
          else if (i === 3) { B('2d the other face answers', [sp]); cam.close(sp, { hold: 1.8 }); }
          else { B('2e nose to nose', [a, b]); cam.dutch([a, b], { fit: true, dist: 6, hold: 2.2 }); }
          yield* wait(0.3);
          sp.mood = 'angry'; sp.arms = 'point'; sp.lookAt = other;
          other.mood = i >= 1 ? 'angry' : 'shock'; other.arms = 'fist'; other.lookAt = sp;
          yell(ctx, sp, row[i], i % 2 ? '#ffd166' : '#ff6b6b', 14 + i);
          sp.squash(0.12);
          yield* hop(sp, 0.15 + i * 0.03, 0.2);
          if (i === 1 || i === 4) { // a shove, with both of them in the picture
            const o = other.g.position, px0 = o.x, dd = other === a ? -1 : 1;
            ctx.sfx('thud'); ctx.shake(0.1 * (i + 1));
            yield* tween(0.2, (t) => { o.x = px0 + dd * 0.3 * Math.sin(t * Math.PI); });
          }
          yield* wait(0.45);
        }

        // ---- 3. word gets round: spectators gather, a granny takes bets
        B('3 word gets round: the crowd gathers', [a, b]);
        const mob = gather(ctx, R, x, 2, 15);
        const bookie = makePerson(rnd, { kind: 'granny' });
        let bookieHere = false;
        // where the onlookers stand (relative to the fight), each nudged to ground that is really clear
        const spots = [[-3.0, 1.5], [3.1, 1.4], [-1.2, -1.7], [1.6, -1.6]].map(([dx, dz]) => { const q = spotNear(ctx, x + dx, z + dz); return [q.x - x, q.z - z]; });
        const spectators = [];
        cam.wide(cc, { dist: 15, el: 0.3, hold: 2.6 });
        R.run((function* () {
          yield* R.enter(bookie, clamp(x + side * 11, EX0, EX1), z + 1.0);
          bookie.hold(item.paper()); bookie.arms = 'hold'; bookie.mood = 'sly';
          yield* go(ctx, bookie, x + spots[3][0], z + spots[3][1], 3);
          faceTo(bookie, x, z); bookie.lookAt = cc; bookieHere = true;
          yell(ctx, bookie, 'WIE WINT? NOTEER!', '#b9fbc0', 13);
        })());
        spectators.push([bookie, 3]);
        mob.forEach((p, i) => { spectators.push([p, i]); R.run(go(ctx, p, x + spots[i][0], z + spots[i][1], 3.2)); });
        // too few passers-by? the street provides
        for (let i = mob.length; i < 2; i++) {
          const extra = makePerson(rnd, { kind: i ? 'kid' : 'civ' });
          spectators.push([extra, i]);
          R.run((function* () { yield* R.enter(extra, clamp(x - side * 10, EX0, EX1), z + 1); yield* go(ctx, extra, x + spots[i][0], z + spots[i][1], 3.4); })());
        }
        // the two keep glaring while the audience arrives
        a.arms = b.arms = 'fist'; a.mood = b.mood = 'angry';
        yield* wait(1.6);

        B('3b the title card', [a, b]);
        cam.orbit([a, b], { dist: 8, fit: true, hold: 3.2, el: 0.2 });
        yield* wait(0.3);
        cam.card('DE KEMPHANEN', 'Two egos, one pavement.', 1.9);
        cam.freeze(0.6);
        ctx.sfx('sting');
        yield* wait(0.9);
        yield* waitUntil(() => bookieHere, 3);
        const film = mob[0];
        for (const [p, i] of spectators) {
          if (!p.alive) continue;
          faceTo(p, x, z); p.lookAt = cc; p.mood = 'happy';
          if (p === film) filmIt(p, x, z); else p.arms = i % 2 ? 'up' : 'hold';
          ctx.fx.cash(p.g.position.x, 1.2, p.g.position.z, 2, 1.5, 2.5);
        }

        B('3c the bets', [bookie, film || bookie]);
        cam.low(bookie, { dist: 8, hold: 2.2 });
        yield* wait(0.3);
        ctx.sfx('coin');
        say(ctx, film || bookie, '10 OP DE CHEF!', { size: 13, color: '#b9fbc0' });
        bookie.squash(0.2);
        yield* wait(0.7);

        // ---- 4. squaring up: noses together, a rooster's wobble, one long breath
        B('4 squaring up: noses together', [a, b]);
        cam.orbit([a, b], { dist: 5.5, fit: true, el: 0.1, hold: 3.2 });
        yield* wait(0.3);
        a.heading = E; b.heading = W;
        a.arms = b.arms = 'fist'; a.mood = b.mood = 'angry'; a.lookAt = b; b.lookAt = a;
        ctx.sfx('gasp');
        yield* tween(0.8, (t) => { a.g.position.x = x - 0.65 + 0.25 * t; b.g.position.x = x + 0.65 - 0.25 * t; a.g.position.y = Math.abs(Math.sin(t * 14)) * 0.08; b.g.position.y = Math.abs(Math.sin(t * 14 + 1)) * 0.08; });
        a.g.position.y = b.g.position.y = 0;
        yield* wait(0.5); // the hold before the payoff
        ctx.incident(2);
        ctx.news(`Difference of opinion on ${ctx.st.name} escalates to dust cloud`);

        // ---- 5. the cartoon dust cloud: limbs, stars, flying shoes. It rolls down the pavement
        B('5 the dust cloud rolls down the pavement', [cc]);
        cam.track(cc, { hold: 5, lead: 1 });
        yield* wait(0.3);
        a.g.visible = b.g.visible = false;
        ctx.slowmo(0.5, 0.35);
        ctx.sfx('slam'); ctx.sfx('bonk');
        if (lv >= 4) R.panic(x, 12, 3);
        const words = ['POW!', 'BAM!', 'OEF!', 'AU!', 'BONK!', 'KLETS!', 'KRAK!'];
        let tt = 0, nxt = 0, k = 0, high = false;
        const shoes = [];
        while (tt < 4.2) {
          const dt = yield;
          tt += dt; nxt -= dt;
          cc.x += side * Math.min(2.6, tt * 1.1) * dt;
          cc.z += Math.sin(tt * 3.1) * 0.35 * dt;
          if (!high && tt > 2.5) { high = true; cam.high(cc, { dist: 13, hold: 3 }); }
          spectators.forEach(([p, i], j) => {
            if (!p.alive) return;
            const tx = cc.x + spots[j % 4][0] * 0.9, tz = cc.z + spots[j % 4][1] * 0.9, q = p.g.position;
            q.x += (tx - q.x) * Math.min(1, dt * 3); q.z += (tz - q.z) * Math.min(1, dt * 3);
            p.moving = 2.5; faceTo(p, cc.x, cc.z);
          });
          if (nxt < 0) {
            nxt = 0.14; k++;
            ctx.fx.smoke(cc.x + rnd.range(-0.7, 0.7), 0.4, cc.z + rnd.range(-0.5, 0.5), 5, ['#f1ede4', '#e4dccb', '#d8cfbd'], 0.8);
            if (k % 3 === 0) {
              ctx.fx.text(rnd.pick(words), at(cc.x + rnd.range(-1.6, 1.6), rnd.range(1.2, 2.4), cc.z), { size: 19, color: rnd.pick(['#ffd60a', '#ff6b6b', '#ffffff']), dur: 0.7 });
              ctx.sfx(rnd.pick(['thud', 'boing', 'pop', 'bonk']));
              ctx.shake(0.12);
            }
            if (k % 4 === 1) ctx.fx.burst(cc.x, 0.9, cc.z, { n: 5, colors: ['#ffd60a', '#ffffff'], speed: 5, up: 6, glow: true, size: [0.1, 0.16], life: [0.4, 0.8] });
            // limbs poke out of the cloud (voxel arms and legs in skin tones and shirt colours)
            if (k % 2 === 0) ctx.fx.burst(cc.x, 0.8, cc.z, { n: 3, colors: ['#f2c9a0', '#c98e62', '#e84a5f', '#457b9d', '#2b3a55'], speed: 6, up: 5, size: [0.16, 0.3], life: [0.3, 0.6] });
            if ((k === 4 || k === 12) && shoes.length < 2) {
              const sh = R.add(item.shoe());
              sh.position.set(cc.x, 0.9, cc.z);
              shoes.push(sh);
              R.run(arc(sh, cc.x + rnd.range(-4, 4), 0.02, cc.z + rnd.range(-1.5, 1.5), 3.5, 1.0, rnd.range(-9, 9)));
            }
            if (k === 8) { bookie.arms = 'up'; say(ctx, bookie, 'DOORGAAN!', { size: 13, color: '#b9fbc0' }); ctx.sfx('coin'); }
          }
        }
        ctx.sfx('pang');
        ctx.fx.puff(cc.x, 0.6, cc.z, '#f1ede4');
        ctx.fx.smoke(cc.x, 0.6, cc.z, 14, ['#f1ede4', '#e4dccb', '#d8cfbd'], 1.0);

        // ---- 6. the cloud clears: both flung out, sitting dazed with stars, a shoe in one hand. Level decides who shows up
        B('6 the cloud clears: both flung out, dizzy', [a, b]);
        cam.dutch(cc, { dist: 9, el: 0.2, hold: 3.4 });
        yield* wait(0.4); // the cloud still hides them; the picture is ready before they appear
        a.g.position.set(cc.x, 0, cc.z); b.g.position.set(cc.x, 0, cc.z);
        a.g.visible = b.g.visible = true;
        a.lookAt = b.lookAt = null; a.arms = b.arms = 'up';
        yield* all(tumble(ctx, a, cc.x - 1.1, cc.z + 0.3), tumble(ctx, b, cc.x + 1.1, cc.z - 0.3));
        a.heading = b.heading = 0;
        a.hold(item.shoe()); a.arms = 'hold'; b.arms = 'facepalm';
        R.run(seeStars(ctx, a, 2.6)); R.run(seeStars(ctx, b, 2.2));
        for (let i = 0; i < 2; i++) { say(ctx, i % 2 ? a : b, '★ ★', { size: 15, color: '#ffe066', dur: 0.9 }); yield* wait(0.5); }

        B('6b the law arrives', [a, b]);
        const cop = makePerson(rnd, { kind: 'cop' });
        cam.shot({ on: [a, b], dist: 11, el: 0.22, az: side * 0.4, fit: true, hold: 3 });
        yield* wait(0.3);
        yield* R.enter(cop, clamp(cc.x - side * 9, EX0, EX1), cc.z);
        ctx.sfx('whistle');
        cop.mood = 'angry'; cop.arms = 'stop';
        yell(ctx, cop, 'UIT ELKAAR!', '#7db8ff', 17);
        a.lookAt = b.lookAt = cop; a.mood = b.mood = 'scared'; a.arms = b.arms = 'up';
        yield* go(ctx, cop, cc.x - side * 2.4, cc.z, 6);
        cop.heading = side > 0 ? E : W; cop.arms = 'hips';
        const cop2 = lv >= 4 ? makePerson(rnd, { kind: 'cop' }) : null;
        if (cop2) {
          R.run((function* () { yield* R.enter(cop2, clamp(cc.x + side * 12, EX0, EX1), cc.z + 0.6); ctx.sfx('whistle'); cop2.arms = 'hips'; cop2.mood = 'angry'; yield* go(ctx, cop2, cc.x + side * 2.6, cc.z + 0.6, 6); cop2.heading = side > 0 ? W : E; })());
        }
        if (lv >= 5 && L.kind !== 'ped') R.run(R.police(side, L.chaseZ, 11, 0.2));

        B('6c sheepish: sorry', [a, b]);
        cam.two(a, b, { dist: 6.5, el: 0.1, fit: true, hold: 2.2 });
        yield* wait(0.4);
        a.lookAt = b; b.lookAt = a; a.mood = b.mood = 'sad'; a.arms = b.arms = 'swing';
        say(ctx, a, 'sorry', { size: 12, color: '#cfe8ff' });
        yield* wait(0.7);
        say(ctx, b, 'ook sorry', { size: 12, color: '#cfe8ff' });
        yield* wait(0.7);

        // ---- 7. the bets are settled: the granny backed a draw
        B('7 the granny backed a draw', [bookie]);
        cam.low(bookie, { dist: 8, hold: 2.6 });
        yield* wait(0.3);
        ctx.sfx('coin');
        ctx.fx.cash(bookie.g.position.x, 1.05, bookie.g.position.z, 22, 3, 6);
        bookie.arms = 'up'; bookie.mood = 'laugh';
        yell(ctx, bookie, 'GELIJKSPEL! OMA WINT!', '#b9fbc0', 15);
        cackle(ctx, bookie, 1.4, 'ha');
        for (const [p] of spectators) if (p !== bookie && p.alive) { p.arms = 'fist'; p.mood = 'sad'; say(ctx, p, 'ACH...', { size: 12, color: '#cfe8ff' }); }
        yield* wait(1.2);

        // ---- 8. aftermath: the law makes two men shake hands, then everybody wanders off
        B('8 the law makes them shake hands', [a, b, cop]);
        cam.shot({ on: [a, b, cop], dist: 9, el: 0.15, fit: true, hold: 3.4 });
        yield* wait(0.3);
        say(ctx, cop, lv >= 4 ? 'MEEKOMEN, DE HEREN.' : 'HAND GEVEN. NU.', { size: 13, color: '#7db8ff' });
        cop.arms = 'point';
        a.drop();
        yield* all(getUp(a, 'sad'), getUp(b, 'sad'));
        a.arms = b.arms = 'swing';
        yield* all(go(ctx, a, cc.x - 0.4, cc.z, 1.4), go(ctx, b, cc.x + 0.4, cc.z, 1.4));
        a.heading = E; b.heading = W; a.arms = b.arms = 'reach'; a.lookAt = b; b.lookAt = a;
        yield* wait(0.5);
        a.mood = b.mood = 'happy'; cop.arms = 'hips'; cop.mood = 'smug';
        ctx.sfx('ding'); a.squash(0.15); b.squash(0.15);
        yield* wait(0.8);

        B('8b everybody goes home', [a, b, cop]);
        cam.wide(pt(cc.x, cc.z), { dist: 22, hold: 3 });
        yield* wait(0.3);
        a.lookAt = b.lookAt = cop.lookAt = null; a.arms = b.arms = 'swing'; a.mood = b.mood = 'neutral';
        for (const [p] of spectators) if (p.alive) { p.lookAt = null; p.mood = 'neutral'; p.arms = 'swing'; }
        for (const [p] of spectators) if (p.alive && mob.includes(p)) R.give(p);
        const out = (p, dx) => R.away(p, dx, lv >= 4 ? 2.8 : 4);
        R.run(out(a, -6));
        R.run(out(b, 6));
        for (const [p] of spectators) if (p.alive && !mob.includes(p)) R.run(R.away(p, rnd.sign() * 6, 3.4));
        yield* wait(0.8);
        R.run(R.away(cop, -side * 6, 3));
        if (cop2 && cop2.alive) R.run(R.away(cop2, side * 6, 3));
        yield* R.settle(12);
        for (const sh of shoes) R.rm(sh);
        yield* wait(0.3);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
