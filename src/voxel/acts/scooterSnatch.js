// Street robbery: two men on a scooter swoop at a granny's handbag. Granny is not having it.
// Storyboard: storyboards/scooterSnatch.md. Every B(...) below is one beat of it, with who must be on screen.
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

  /** Which sides can host a scooter run: a real bike lane or road to ride on (not a square, park, beach or pedestrian street) and a pavement for the victim. */
  const scooterSides = (ctx) => once(ctx, 'scooter', () => scooterSides0(ctx));
  const scooterSides0 = (ctx) => ({
    okF: ctx.L.kind !== 'ped' && S.roadHere(ctx, ctx.L.bikeF) && !!padSpot(ctx, 'walkF0', 0, 0.7, 12),
    okB: ctx.L.kind !== 'ped' && S.roadHere(ctx, ctx.L.bikeB) && !!padSpot(ctx, 'walkB1', 0, 0.7, 12),
  });

  /** The handbag, scaled up so the audience can follow it. Hung from the hand rather than standing on it. */
  const mkPurse = () => { const p = item.purse(); p.scale.setScalar(1.5); return p; };
  const grip = (a, o) => { a.hold(o); o.position.y = -0.9; return o; };
  const mkShoe = () => { const s = item.shoe(); s.scale.setScalar(1.8); return s; };

  return {
    w: [0, 0, 0, 3, 2], crime: 2,
    avail: (ctx) => { const q = scooterSides(ctx); return q.okF || q.okB; },
    *run(ctx) {
      const { L, rnd } = ctx, cam = camFor(ctx, 'scooterSnatch'), B = beatsFor(ctx, 'scooterSnatch'), R = rig(ctx);
      const { okF, okB } = scooterSides(ctx);
      if (!okF && !okB) return;
      const dir = okF && okB ? rnd.sign() : okF ? 1 : -1, hd = dir > 0 ? E : W;
      const z = dir > 0 ? L.bikeF : L.bikeB, wz = dir > 0 ? padZ(ctx, 'walkF0', 0) : padZ(ctx, 'walkB1', 0);
      const toward = Math.sign(wz - z) || 1; // from the lane towards the pavement
      const gx = rnd.range(-2, 2), zg = wz - toward * 0.85; // where granny stands, and the line the scooter swoops along
      const stopX = gx + dir * 10.5, crashX = stopX + dir * 3.2, gw = { x: gx + dir * 4.2, z: wz }; // where it parks, where it falls, where granny waits for her bag
      let done = false;
      try {
        const vic = makePerson(rnd, { kind: 'granny' });
        const r1 = makePerson(rnd, { kind: 'robber', scale: 1.1 }), r2 = makePerson(rnd, { kind: 'robber', scale: 1.1 });
        const sc = makeScooter(rnd, [r1, r2]);
        const cop = makePerson(rnd, { kind: 'cop' });

        // ---- 1. granny: she toddles along with a big handbag on her arm, humming
        B('1 granny: toddling along with her big handbag', [vic]);
        cam.wide(pt(gx + dir * 2, wz), { dist: 16, el: 0.3, az: dir * 0.3, hold: 1.4 });
        yield* R.enter(vic, clamp(gx + dir * 9, EX0, EX1), wz);
        grip(vic, mkPurse());
        vic.mood = 'happy'; vic.heading = -hd;
        cam.dolly(vic, { dist: 9, az: 0.1, y: 1.1, hold: 5.5 });
        say(ctx, vic, '♪ hm hm hmmm ♪', { size: 13, color: '#ffd6f2' });
        yield* go(ctx, vic, gx, wz, 1.7);
        vic.arms = 'swing';
        const looking = R.run(lookAround(vic));
        say(ctx, vic, '♪ la la la ♪', { size: 13, color: '#ffd6f2' });

        // ---- 2. the buzz: the scooter revs at the far end of the lane, then comes at us
        B('2 the buzz: the scooter and both masked riders', [sc, r1, r2]);
        const sx = clamp(gx - dir * 20.5, EX0 + 1, EX1 - 1);
        yield* R.enter(sc, sx, z, 0);
        sc.face(hd);
        ctx.wanted = sc;
        r1.arms = 'drive'; r2.arms = 'drive'; r1.mood = 'sly'; r2.mood = 'sly';
        cam.nose(sc, dir, { hold: 3.2 });
        cam.card('DE TASJESDIEVEN', 'Two wheels, four hands, zero manners.', 2.0);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        ctx.sfx('rev');
        for (let i = 0; i < 3; i++) { exhaust(ctx, sc, 3); sc.jolt(-0.5, 0); sc.moving = 4; yield* wait(0.3); }
        say(ctx, r2, 'PSSST... TAS!', { size: 13, color: '#b9fbc0' });
        R.run(laugh(ctx, r1, 0.6, 'he'));

        // the swoop: a real curve towards the kerb and out again, so the scooter leans one way and then the other
        let n1 = null, n2 = null, bag = null;
        let snatched = false, reach = false, wh = 0, whT = 0, whJ = 0, spd = 6;
        const route = [
          [gx - dir * 9, z],
          [gx - dir * 3.6, lerp(z, zg, 0.6)],
          [gx - dir * 0.2, zg],
          [gx + dir * 4, lerp(zg, z, 0.55)],
          [stopX, z],
        ];
        ctx.sfx('screech');
        const swoop = R.run(drive(ctx, sc, route, () => spd, {
          each: (dt) => {
            const rel = (sc.g.position.x - gx) * dir;
            if (!reach && rel > -3.3) { reach = true; r2.arms = 'reach'; r2.mood = 'laugh'; }
            if (!snatched && rel > -0.05) snatched = true;
            if (wh === 0) {
              spd = rel > 2 ? 10 : 6 + 4 * clamp((rel + 20.5) / 12, 0, 1);
              if (rel > 2) { wh = 1; whT = 0; whJ = 0; }
            }
            if (wh === 1) { // wheelie: the throttle goes wide open and the nose comes up
              whT += dt; whJ -= dt; spd = 14;
              if (whJ <= 0) { sc.jolt(-1.1, 0); whJ = 0.12; }
              if (whT > 0.45) wh = 2;
            } else if (wh === 2) { // ...and the brakes go on: the nose dives
              const rem = Math.max(0, (stopX - sc.g.position.x) * dir);
              spd = Math.min(14, Math.sqrt(10 * rem) + 0.5);
            }
          },
        }));
        yield* waitUntil(() => (sc.g.position.x - gx) * dir > -6.5, 6);

        // ---- 3. the snatch: chase cam alongside, slow motion at the grab
        B('3 the snatch: the scooter leans in, the pillion grabs', [sc, r2, vic]);
        cam.chase(sc, dir, { hold: 3 });
        yield* waitUntil(() => snatched, 3);
        R.stop(looking);
        ctx.slowmo(0.25, 0.7);
        ctx.sfx('yoink');
        vic.drop();
        grip(r2, mkPurse());
        r2.arms = 'cheer';
        say(ctx, sc, 'YOINK!', { size: 24, color: '#ffd60a' });
        ctx.incident(2);
        ctx.news('Scooter duo snatches handbag. Contents: pepermunt, tissues');
        R.run((function* () { // granny spins like a top, twice
          const r0 = vic.g.rotation.y;
          vic.arms = 'up'; vic.mood = 'shock';
          yield* tween(0.8, (t) => { vic.g.rotation.y = r0 + t * TAU * 2; vic.heading = vic.g.rotation.y; }, ease.outQuad);
          vic.heading = hd; vic.g.rotation.y = hd;
          vic.mood = 'dizzy'; vic.arms = 'swing';
          yield* tween(0.9, (t) => { vic.g.rotation.z = Math.sin(t * TAU * 2) * 0.14 * (1 - t); });
          vic.g.rotation.z = 0;
        })());
        yield* wait(1.0);

        // ---- 4. the gloat: the bag held up like a trophy, both laugh, the wheelie
        B('4 the gloat: bag held up high, laughing, wheelie', [sc, r1, r2]);
        r1.mood = 'laugh'; r2.mood = 'laugh';
        cam.track(sc, { dist: 6.5, el: 0.06, az: dir * 0.75, y: 1.1, lead: 1.5, fov: 40, shake: 0.6, hold: 3.2 });
        yield* wait(0.3);
        cackle(ctx, r1, 1.6, 'ha');
        cackle(ctx, r2, 1.8, 'ha');
        ctx.sfx('rev');
        yield* waitUntil(() => swoop.done, 8);
        r1.lookAt = vic; r2.lookAt = vic; r2.arms = 'cheer';
        yield* wait(0.9);

        // ---- 5. granny's revenge: brows down, a shoe comes off, and it flies
        B("5 granny's revenge: the shoe comes off", [vic]);
        vic.heading = hd; vic.mood = 'angry'; vic.arms = 'fist'; vic.gait = 'walk';
        cam.crash(vic, { hold: 2.6 });
        yield* wait(0.5);
        ctx.sfx('hey');
        say(ctx, vic, 'WAT?!', { size: 20, color: '#ff6b6b' });
        yield* wait(0.5);
        vic.hold(mkShoe());
        yield* hop(vic, 0.2, 0.25);
        vic.arms = 'up'; vic.squash(0.15);
        yield* wait(0.5);
        B('5b the shoe flies', [vic, sc]);
        const vp = vic.g.position;
        cam.shot({ on: [vic, sc], dist: 14, el: 0.1, az: -dir * 0.15, y: 1.0, fov: 40, fit: true, cut: 0.3, hold: 3 });
        yield* wait(0.35);
        vic.drop();
        const shoe = R.add(mkShoe());
        shoe.position.set(vp.x + dir * 0.3, 1.5, vp.z);
        vic.arms = 'push'; ctx.sfx('swish');
        R.run(go(ctx, vic, gw.x, gw.z, 2.6));
        yield* arc(shoe, sc.g.position.x - dir * 0.35, 1.55, sc.g.position.z, 3.2, 1.0, 14);
        // BONK on the driver's head
        ctx.sfx('bonk'); ctx.shake(0.3);
        ctx.fx.text('BONK!', at(sc.g.position.x - dir * 0.35, 2.7, sc.g.position.z), { size: 30, color: '#ffd60a' });
        ctx.fx.pips(sc.g.position.x - dir * 0.35, 2.2, sc.g.position.z, 8);
        r1.lookAt = null; r1.mood = 'dizzy'; r1.arms = 'up'; r1.emote('shock', 1);
        r2.lookAt = null; r2.mood = 'shock';
        R.run(arc(shoe, sc.g.position.x + dir * 1.2, 0.04, sc.g.position.z + toward * 1.4, 0.8, 0.5, 9));
        yield* wait(0.6);

        // ---- 6. the fall: it wobbles, slides and tips; the bag sails up into granny's hands
        B('6 the fall: the scooter tips over', [sc, r1, r2]);
        cam.ground(sc, { dist: 6, az: dir * 0.5, cut: 0.2, hold: 3.4 });
        yield* wait(0.35);
        const x0 = sc.g.position.x, side = dir; // side * 1.3: it goes down on the camera's side, so the riders land towards us
        ctx.sfx('screech');
        yield* tween(1.3, (u) => {
          const e = ease.outQuad(u);
          sc.g.position.x = x0 + dir * 2.0 * e;
          sc.moving = 4 * (1 - u);
          sc.lean = Math.sin(u * TAU * 2.5) * 0.4 * (0.3 + u);
          sc.heading = hd + Math.sin(u * TAU * 2) * 0.4 * u;
        });
        // down she goes: the lean runs away with her, sparks fly, and the riders are thrown off
        const x1 = sc.g.position.x;
        let swapped = false;
        yield* tween(0.8, (u) => {
          sc.g.position.x = x1 + dir * 1.2 * ease.outQuad(u);
          sc.moving = 3 * (1 - u);
          sc.lean = lerp(0.3, side * 1.3, ease.inQuad(u));
          ctx.fx.sparks(sc.g.position.x, 0.12, sc.g.position.z, 1);
          if (!swapped && u > 0.75) {
            swapped = true;
            // swap the two seated riders for two fresh robbers (the old ones are part of the scooter), thrown clear
            const l = sc.g.rotation.z, h = sc.g.rotation.y, sp = sc.g.position;
            const where = (i) => {
              const lx = -0.64 * Math.sin(l), ly = 0.64 * Math.cos(l), lz = -0.35 - i * 0.5;
              return { x: sp.x + lx * Math.cos(h) + lz * Math.sin(h), y: sp.y + ly, z: sp.z - lx * Math.sin(h) + lz * Math.cos(h) };
            };
            const w0 = where(0), w1 = where(1);
            r2.drop();
            r1.g.visible = false; r2.g.visible = false;
            n1 = makePerson(rnd, { kind: 'robber', scale: 1.1 }); n2 = makePerson(rnd, { kind: 'robber', scale: 1.1 });
            R.spawn(n1, w0.x, w0.z, Math.max(0, w0.y - 0.3)); R.spawn(n2, w1.x, w1.z, Math.max(0, w1.y - 0.3));
            ctx.sfx('crash'); ctx.shake(0.4);
            bag = R.add(mkPurse());
            bag.position.set(w1.x, w1.y + 0.6, w1.z);
            R.run(tumble(ctx, n1, crashX + dir * 0.5, z + 0.9, 1.2, 0.7));
            R.run(tumble(ctx, n2, crashX + dir * 2.0, z + 1.1, 1.0, 0.8));
            ctx.fx.text('KRAAAK!', at(sp.x, 1.6, sp.z), { size: 24, color: '#ffd60a' });
          }
        });
        sc.lean = side * 1.3; sc.moving = 0;
        ctx.fx.dust(sc.g.position.x, 0, sc.g.position.z, 0, 0, 8);
        // the bag sails up... and into granny's waiting hands
        B('6b the bag lands in granny\'s hands', [bag, vic]);
        vic.heading = hd; vic.arms = 'reach'; vic.mood = 'neutral'; vic.lookAt = bag;
        cam.shot({ on: [bag, vic], dist: 12, el: 0.2, az: -dir * 0.2, y: 0.8, fov: 38, fit: true, cut: 0.3, hold: 3.2 });
        yield* wait(0.3);
        yield* arc(bag, gw.x, 1.0, gw.z, 5, 1.5, 7);
        R.rm(bag);
        grip(vic, mkPurse());
        ctx.sfx('tada');
        vic.lookAt = null; vic.arms = 'cheer'; vic.mood = 'happy'; vic.squash(0.25);
        say(ctx, vic, 'HA! MIJN TAS!', { size: 16, color: '#b9fbc0' });
        yield* wait(0.9);

        // ---- 7. the law: a cop arrives, the two sit dazed, and granny whacks each once
        B('7 the law: cop, two dazed robbers and granny', [vic, n1, n2, cop]);
        R.run(seeStars(ctx, n1, 6)); R.run(seeStars(ctx, n2, 6));
        R.spawn(cop, clamp(gw.x - dir * 6, EX0, EX1), wz);
        cop.g.scale.setScalar(0.001);
        R.run(popIn(ctx, cop));
        cam.shot({ on: [vic, n1, n2, cop], dist: 16, el: 0.22, az: -dir * 0.3, y: 1.0, fov: 36, fit: true, cut: 0.5, hold: 6 });
        ctx.sfx('whistle');
        say(ctx, cop, 'POLITIE! WAT IS HIER GEBEURD?', { size: 14, color: '#7db8ff' });
        vic.arms = 'swing'; vic.mood = 'angry';
        const copGo = R.run(go(ctx, cop, n1.g.position.x - dir * 2.4, z + 0.4, 5));
        yield* go(ctx, vic, n1.g.position.x - dir * 0.9, n1.g.position.z - 0.2, 2.8);
        yield* waitUntil(() => copGo.done, 4);
        const whack = function* (n, line) {
          vic.heading = Math.atan2(n.g.position.x - vic.g.position.x, n.g.position.z - vic.g.position.z);
          vic.arms = 'up'; vic.mood = 'angry';
          yield* wait(0.4);
          vic.arms = 'push';
          ctx.sfx('bonk');
          yell(ctx, vic, line, '#ff6b6b', 17);
          ctx.fx.text('KLAP!', at(n.g.position.x, 1.9, n.g.position.z), { size: 22, color: '#ffd60a' });
          ctx.fx.pips(n.g.position.x, 1.6, n.g.position.z, 6);
          n.squash(0.35); n.emote('shock', 0.8); n.shakeT = 0.8;
          yield* hop(vic, 0.15, 0.2);
          vic.arms = 'swing';
        };
        yield* whack(n1, 'SCHOFT!');
        yield* wait(0.3);
        // the wince: the camera goes to the cop just before the second whack lands
        cam.close(cop, { y: 1.5, dist: 6.5, fov: 30, hold: 1.7 });
        cop.lookAt = vic;
        yield* wait(0.4);
        yield* go(ctx, vic, n2.g.position.x - dir * 0.9, n2.g.position.z - 0.2, 2.8);
        yield* whack(n2, 'SCHOFTEN!');
        cop.mood = 'sad'; cop.arms = 'cover'; cop.squash(0.2);
        ctx.sfx('womp');
        yield* wait(1.1);
        cop.arms = 'hips'; cop.lookAt = null; cop.mood = 'smug';
        ctx.news('Granny recovers own handbag, assists with arrest. Officer: "Strictly speaking, that was assault"');

        // ---- 8. epilogue: granny toddles on, humming; the cop leads the pair away with the scooter
        B('8 epilogue: granny toddles on, the cop leads the robbers off', [vic]);
        cam.wide(pt(crashX - dir * 4, wz), { dist: 18, el: 0.3, az: -dir * 0.2, hold: 5 });
        R.run((function* () {
          yield* getUp(n1, 'sad'); n1.arms = 'swing';
          yield* wait(0.2);
          yield* getUp(n2, 'sad'); n2.arms = 'swing';
          cop.arms = 'point'; cop.mood = 'neutral';
          R.run(R.away(n1, dir * 6, 2.4));
          yield* wait(0.3);
          R.run(R.away(n2, dir * 6, 2.4));
          yield* wait(0.5);
          yield* R.away(cop, dir * 6, 2.4);
        })());
        vic.mood = 'happy';
        say(ctx, vic, '♪ hm hm hmmm ♪', { size: 13, color: '#ffd6f2' });
        yield* wait(0.7);
        ctx.sfx('tick');
        R.run((function* () { yield* wait(1.2); sc.moving = 0; ctx.fx.puff(sc.g.position.x, 0.4, sc.g.position.z); yield* R.out(sc); })());
        R.run((function* () { yield* go(ctx, vic, clamp(gw.x - dir * 8, EX0, EX1), wz, 1.9); yield* R.out(vic); })());
        yield* R.settle(10);
        yield* wait(0.3);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
