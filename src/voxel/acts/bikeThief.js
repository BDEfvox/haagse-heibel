// Bike theft. Storyboard: storyboards/bikeThief.md; every B(...) below is one beat of it.
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

  /** How far (metres) one can ride away from this rack, best direction first: { dir, edge }. Null if neither way has room. */
  const escapeFrom = (ctx, r, prefer) => once(r, 'esc' + prefer, () => escapeFrom0(ctx, r, prefer));
  function escapeFrom0(ctx, r, prefer) {
    const lane = r.z + 0.9, a = S.runway(ctx, r.x, lane, prefer, 24, 0.6), b = S.runway(ctx, r.x, lane, -prefer, 24, 0.6);
    const la = Math.abs(a - r.x), lb = Math.abs(b - r.x);
    if (la >= 10 && (la >= lb || lb < 10)) return { dir: prefer, edge: a - prefer * 0.6, len: la }; // ~9 m is what the chase and the fall need
    if (lb >= 10) return { dir: -prefer, edge: b + prefer * 0.6, len: lb };
    return null;
  }

  /** Where the real bike stands in the rack (just beside the thief's spot). */
  const bike0pt = (r, rz, dir) => ({ x: r.x - dir * 0.6, z: rz + 0.55, y: 0.5 });

  return {
    w: [0, 0, 3, 2, 2], crime: 1, need: ['racks'],
    // a rack with room to ride off along it (no tree, wall or water within a few metres), else this gag is not played here
    avail: (ctx) => ctx.L.racks.some((r) => escapeFrom(ctx, r, r.x > 0 ? -1 : 1)),
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'bikeThief'), R = rig(ctx);
      const racks = L.racks.filter((q) => escapeFrom(ctx, q, q.x > 0 ? -1 : 1)), r = rnd.pick(racks.length ? racks : L.racks);
      let done = false, res = null;
      try {
        const esc = escapeFrom(ctx, r, r.x > 0 ? -1 : 1) || { dir: r.x > 0 ? -1 : 1, edge: r.x > 0 ? EX0 + 0.6 : EX1 - 0.6 };
        const dir = esc.dir, rz = r.z + 0.35, edge = esc.edge; // he comes from the far side and escapes along the pavement
        const look = { shirt: rnd.pick(['#e84a5f', '#2a9d8f', '#f4a261', '#457b9d']), hair: rnd.pick(['#2b1d14', '#c58b3c', '#a33b20']), skin: rnd.pick(['#f2c9a0', '#c98e62', '#7a4f33']) };
        const th = makePerson(rnd, { kind: rnd.chance(0.6) ? 'raccoon' : 'robber' });

        const B = beatsFor(ctx, 'bikeThief'), rackPt = pt(r.x, r.z);

        // ---- 1. casing the rack: walks past, looks around, doubles back
        B('1 casing: the thief sneaks past the rack and doubles back', [th, rackPt]);
        cam.wide(rackPt, { dist: 20, el: 0.32, az: -dir * 0.3, hold: 4 });
        const sx = clamp(r.x - dir * 10, EX0, EX1), px2 = clamp(r.x + dir * 2.5, EX0, EX1);
        yield* R.enter(th, sx, padZ(ctx, 'walkB0', sx));
        yield* wait(0.6);
        cam.track(th, { dist: 9, el: 0.14, az: dir * 0.5, lead: 1.5, cut: 1.0, hold: 7 });
        const pass = spotNear(ctx, px2, padZ(ctx, 'walkB0', px2));
        yield* tiptoe(ctx, th, pass.x, pass.z, 3.0);
        th.heading = Math.PI; th.mood = 'sly';
        yield* lookAround(th, 1.0, 0.3);
        yield* tiptoe(ctx, th, r.x, rz, 3.0, false);

        // ---- 2. reveal
        B('2 reveal: the thief shows us the cutters', [th]);
        th.gait = 'walk'; th.heading = 0; th.mood = 'smug';
        th.hold(item.cutters()); th.arms = 'hold';
        cam.hero(th, { dist: 6, hold: 3 });
        cam.card('DE KNIPPER', 'Bike economy, Hague edition', 1.9);
        cam.freeze(0.7);
        ctx.sfx('sting');
        say(ctx, th, 'hehehe', { size: 13, color: '#b9fbc0' });
        yield* wait(0.5);
        ctx.sfx('snip');
        yield* laugh(ctx, th, 1.0, 'he');
        th.heading = Math.PI;

        // ---- 3. first lock: snip, snip, SNIP. It is the wrong bike
        B('3 first lock: snip, snip, SNIP', [th, { x: r.x, z: r.z - 0.8, y: 0.9 }]);
        th.mood = 'focus';
        cam.shot({ on: [th, { x: r.x, z: r.z - 0.8, y: 0.9 }], y: 0.9, dist: 6.5, el: 0.3, az: 0.5, fit: true, hold: 3.2, drift: { dist: -0.3 } });
        yield* wait(0.3);
        for (let i = 0; i < 3; i++) {
          ctx.sfx('snip'); ctx.fx.sparks(r.x, 0.9, r.z - 0.8, i === 2 ? 9 : 4); // lock on the 1.86 m bike parked at r.z - 1.15 .. r.z + 0.2
          yield* hop(th, 0.08, 0.16);
          yield* wait(0.12);
        }
        ctx.fx.text('KNIP!', at(r.x, 2.2, r.z), { size: 18, color: '#ffe08a' });
        B('3b the kid\'s bike: the thief rides off on something far too small', [th]);
        const kpt = pt(r.x - dir * 0.9, rz + 0.55);
        cam.shot({ on: [th, kpt], y: 0.6, dist: 7, el: 0.15, az: -dir * 0.4, fit: true, hold: 2.6 });
        yield* wait(0.3);
        const kid = makeBike(rnd, null, '#ff70a6');
        kid.body.scale.setScalar(0.55 * 1.19); // makeBike's own body scale is 1.19
        yield* R.enter(kid, r.x - dir * 0.9, rz + 0.55, 0.001); // (a hair above the ground: parked at the rack, never nudged away)
        kid.face(dir > 0 ? E : W);
        yield* wait(0.3);
        mount(kid, th, 0.12);
        th.mood = 'happy';
        ctx.sfx('bell');
        say(ctx, th, 'YOINK!', { size: 20, color: '#ffd60a' });
        ctx.incident();
        // someone has noticed: a balcony, a shop door, a bench or a passer-by, whatever this spot really has
        res = resident(ctx, R, r.x, look, { at: { x: r.x, z: r.z } });
        const noticed = R.run(res.notice('HÉ! MIJN KINDERFIETS!'));
        cam.track([th, kid], { dist: 8, el: 0.15, az: -dir * 0.5, lead: 1, hold: 3 });
        yield* rideTo(ctx, kid, th, r.x + dir * 3.6, rz + 0.55, 2.6, null, 0.12);
        yield* waitUntil(() => noticed.done, 4); // a passer-by needs a moment to walk up and shout; the others are there already
        B('3c noticed: the owner shouts, the thief does a double take', [th, res.owner]);
        cam.ots(th, res.owner, { hold: 2.8 });
        yield* wait(0.3);
        th.lookAt = res.owner;
        yield* doubleTake(ctx, th, '?!');
        B('3d too small: the thief is sitting on a toy', [th, kid]);
        cam.shot({ on: [th, kid], y: 0.6, dist: 7, el: 0.12, az: dir * 0.3, fit: true, hold: 3.2 });
        yield* wait(0.3);
        dismount(th, kid.g.position.x - dir * 0.6, kid.g.position.z);
        th.arms = 'up'; th.heading = 0; th.mood = 'shock';
        say(ctx, th, 'TE KLEIN!', { size: 15, color: '#fff' });
        ctx.sfx('bonk');
        yield* tween(0.25, (t) => { kid.g.rotation.z = (dir > 0 ? -1 : 1) * 1.45 * ease.outQuad(t); kid.g.position.y = 0.2 * t; });
        th.squash(0.2);
        yield* wait(0.4);
        th.arms = 'shrug'; th.mood = 'sad';
        say(ctx, th, 'sorry...', { size: 12, color: '#cfe8ff' });
        yield* wait(0.5);
        yield* res.calm('nou, goed');
        th.lookAt = null;

        // ---- 4. the real bike
        B('4 the real bike: SNIP, the lock falls', [th, bike0pt(r, rz, dir)]);
        th.heading = Math.PI; th.mood = 'focus'; th.arms = 'hold';
        yield* go(ctx, th, r.x - dir * 0.3, rz, 3);
        th.heading = Math.PI;
        cam.dolly([th, bike0pt(r, rz, dir)], { y: 0.8, dist: 6, el: 0.25, az: -0.5, fit: true, hold: 2.6 });
        yield* wait(0.3);
        ctx.sfx('snip'); ctx.fx.sparks(r.x, 0.9, r.z - 0.8, 12);
        ctx.fx.text('KNIP!', at(r.x, 2.2, r.z), { size: 22, color: '#ffe08a' });
        ctx.shake(0.15);
        yield* wait(0.4);
        const bike = makeBike(rnd);
        yield* R.enter(bike, r.x - dir * 0.6, rz + 0.55, 0.001);
        bike.face(dir > 0 ? E : W);
        const chain = chainObj(R, 6);
        chain.place(bike.g.position.x, 0.3, bike.g.position.z);
        mount(bike, th);
        ctx.wanted = th;
        th.mood = 'smug';
        ctx.sfx('yoink'); ctx.sfx('bell');
        say(ctx, th, 'YOINK!', { size: 22, color: '#ffd60a' });
        ctx.news(`Bike stolen on ${ctx.st.name}. Witnesses: "ja, dat gebeurt"`);

        // ---- 5. the owner comes out; he gloats; then the getaway, with the cut lock still dragging sparks
        const own2 = res.second;
        R.run(res.rush('MIJN ECHTE FIETS!!', () => { const tx = clamp(kid.g.position.x + dir * 5.5, EX0, EX1); return { x: tx, z: padZ(ctx, 'walkB1', tx) }; }, { size: 17, speed: 6.2 }));
        B('4b gloat: the thief sniggers on his stolen bike', [th, bike]);
        cam.hero(th, { dist: 6, hold: 2 });
        yield* wait(0.3);
        yield* laugh(ctx, th, 1.0, 'he');
        B('5 the getaway: the chain rattles, sparks, and the kid\'s bike lies right in the way', [th, bike, kid]);
        cam.ground([bike, kid], { dist: 8, az: -dir * 0.4, fit: true, hold: 3.2 });
        yield* wait(0.3);
        let spark = 0, rattle = 0, snag = false, tow = 0, cut = false;
        yield* rideTo(ctx, bike, th, edge, rz + 0.55, 8.2, (dt) => {
          const q = bike.g.position, h = bike.g.rotation.y;
          chain.update(q.x - Math.sin(h) * 0.95, 0.3, q.z - Math.cos(h) * 0.95);
          const tl = chain.tail.position;
          spark -= dt; rattle -= dt;
          if (spark < 0) { spark = 0.07; ctx.fx.sparks(tl.x, 0.08, tl.z, 2); }
          if (rattle < 0) { rattle = 0.45; ctx.sfx('clatter'); }
          if (!snag && dir * (tl.x - kid.g.position.x) > 0) {
            snag = true;
            ctx.sfx('bell');
            say(ctx, th, 'KLING!', { size: 16, color: '#bfe9ff' });
            kid.g.rotation.z = 0; kid.g.position.y = 0;
          }
          if (snag) { // the discarded kid's bike is caught on the chain and dragged along
            tow += dt;
            kid.g.position.x = tl.x; kid.g.position.z = tl.z; kid.heading = h; kid.moving = 6;
            if (!cut && tow > 0.05) { // the shot changes before the catapult
              cut = true;
              B('6 the catapult: the bike stops dead, the thief does not', [th, bike]);
              cam.dutch([th, bike], { dist: 10, az: -dir * 0.4, fit: true, hold: 3.8 });
            }
            if (tow > 0.75) return true;
          }
        });
        // the catapult
        ctx.sfx('skid'); ctx.shake(0.35);
        cam.freeze(0.4);
        const bq = bike.g.position, lx = bq.x + dir * 3.2, lz = bq.z;
        th.pose = null;
        const tx0 = bq.x;
        ctx.sfx('boing');
        bike.g.rotation.order = 'YXZ';
        R.run(tween(0.9, (t) => { bike.g.rotation.x = t * TAU; bike.g.position.y = Math.sin(t * Math.PI) * 0.7; bike.g.position.x = tx0 + dir * 0.9 * t; }));
        yield* tumble(ctx, th, lx, lz, 1.9, 0.85);
        ctx.fx.puff(lx, 0.1, lz, '#e8e8e8');
        ctx.fx.text('PLOF!', at(lx, 1.3, lz), { size: 26, color: '#ffd60a' });
        kid.moving = 0; kid.g.rotation.z = 0;
        bike.g.rotation.x = 0; bike.g.position.y = 0;
        B('6b stars: the thief sits in the dust', [th]);
        cam.close(th, { dist: 4.5, hold: 2.2 });
        yield* wait(0.3);
        say(ctx, th, '★ ★', { size: 16, color: '#ffe066', dur: 1 });
        R.run(seeStars(ctx, th, 1.4));
        yield* wait(0.5);

        // ---- 6. comeuppance, scaled by level
        yield* R.settle(6);
        const cop = lv >= 4 ? makePerson(rnd, { kind: 'cop' }) : null;
        let copHere = false;
        if (cop) {
          R.run((function* () {
            yield* R.enter(cop, dir > 0 ? EX0 : EX1, lz);
            ctx.sfx('whistle');
            say(ctx, cop, 'POLITIE!', { color: '#7db8ff', size: 15 });
            yield* go(ctx, cop, lx - dir * 1.3, lz, 6.4);
            copHere = true;
          })());
          if (lv >= 5 && L.kind !== 'ped') R.run(R.police(dir, L.chaseZ, 11, 0.4));
        }
        B('7 the owner arrives: DAT WORDT 60 EURO', [own2, th]);
        cam.two(own2, th, { az: -dir * 0.2, hold: 3.4 });
        yield* waitUntil(() => Math.abs(own2.g.position.x - lx) < 3.2, 3);
        yield* wait(0.3);
        faceTo(own2, lx, lz);
        own2.arms = 'fist'; own2.mood = 'angry'; own2.lookAt = th;
        yell(ctx, own2, 'DAT WORDT €60!', '#ff6b6b', 15);
        yield* wait(0.5);
        th.arms = 'up'; th.mood = 'scared'; th.lookAt = own2;
        say(ctx, th, 'ik... eh...', { size: 12, color: '#cfe8ff' });
        if (cop) {
          yield* waitUntil(() => copHere, 6);
          B('8 busted: the cop is standing over him', [cop, th]);
          cam.two(cop, th, { az: dir * 0.25, hold: 3.6 });
          yield* wait(0.3);
          cop.arms = 'hips'; cop.mood = 'smug';
          yield* getUp(th, 'scared');
          th.arms = 'up'; th.lookAt = cop;
          say(ctx, th, 'BUSTED!', { size: 24, color: '#7db8ff' });
          cam.freeze(0.5);
          ctx.fx.burst(lx, 1.2, lz, { n: 12, colors: ['#ffd60a', '#fff'], speed: 5, up: 7, glow: true, size: [0.1, 0.18] });
          ctx.news('Bike thief caught after dragging own evidence 14 metres. Owner: "€60 for the lock"');
          ctx.sfx('cuff');
          yield* wait(1.4);
          own2.arms = 'swing'; own2.lookAt = null; th.lookAt = null;
          B('9 epilogue: led away, the owner takes his bikes home', [cop, th]);
          cam.wide(pt(lx, lz), { dist: 15, el: 0.28, az: dir * 0.2, hold: 3.4 });
          yield* wait(0.3);
          R.run(R.away(cop, dir * 6, 3.2));
          yield* wait(0.3);
          R.run(R.away(th, dir * 6, 3.2));
          R.run(R.out(bike)); R.run(R.out(kid));
          yield* res.home();
        } else {
          // the walk of shame: owner wheels the bike home, the kid's bike still rattling along on the chain
          yield* wait(0.3);
          yield* getUp(th, 'sad');
          th.arms = 'swing'; th.lookAt = null; own2.lookAt = null;
          const rackX = r.x - dir * 0.6;
          ctx.sfx('hey');
          B('8 the walk of shame: the owner wheels the bike home, the kid\'s bike in tow', [bike, own2, kid]);
          cam.track(bike, { dist: 9, el: 0.15, az: -dir * 0.4, hold: 4.4, lead: 1 });
          R.run((function* () { // owner pushes the bike back, kid's bike in tow
            own2.arms = 'carry';
            yield* goEach(ctx, bike, rackX, rz + 0.55, 3.0, () => {
              const q = bike.g.position, h = bike.g.rotation.y;
              chain.update(q.x - Math.sin(h) * 0.95, 0.3, q.z - Math.cos(h) * 0.95);
              const tl = chain.tail.position;
              kid.g.position.x = tl.x; kid.g.position.z = tl.z; kid.heading = h; kid.moving = 2;
              own2.g.position.set(q.x - dir * 0.2, 0, q.z + 0.9); own2.heading = bike.heading; own2.moving = 2;
            });
          })());
          R.run(go(ctx, th, rackX - dir * 3, rz + 1.2, 3.0));
          ctx.news('Bike thief marched home by owner, towing a child\'s bike. "Still €60," says owner');
          yield* R.settle(10);
          B('9 epilogue: EN NU WEG', [own2, th]);
          cam.two(own2, th, { hold: 2.6 });
          yield* wait(0.3);
          own2.arms = 'fist'; own2.mood = 'angry';
          yell(ctx, own2, 'EN NU WEG!', '#ff6b6b', 15);
          th.mood = 'sad';
          yield* wait(0.6);
          R.run(R.away(th, -dir * 6, 3.6));
          own2.arms = 'swing';
          R.run(R.out(bike)); R.run(R.out(kid));
          yield* res.home();
        }
        cam.wide(pt(r.x, r.z), { dist: 24, hold: 2 });
        yield* R.settle(10);
        yield* wait(0.6);
        done = true;
      } finally {
        cam.release();
        if (res) res.cleanup();
        R.free(done);
      }
    },
  };
}
