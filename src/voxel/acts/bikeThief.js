// Bike theft. Storyboard: storyboards/bikeThief.md; every B(...) below is one beat of it.
// The fall at the end always has a CAUSE that is planted on screen first and in frame when it happens:
//   chain  a second, thick chain is still padlocked round the rack and goes bar-taut at the end of its length
//   lamp   he looks back to gloat and rides into a lamp post (shown ahead of him in the wide and in a plant shot)
//   kid    the child's bike he threw down lies across his path (shown lying there in a plant shot)
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
    const lane = r.z + 0.9, a = S.runway(ctx, r.x, lane, prefer, 24, 0.6, { ignore: [r] }), b = S.runway(ctx, r.x, lane, -prefer, 24, 0.6, { ignore: [r] });
    const la = Math.abs(a - r.x), lb = Math.abs(b - r.x);
    if (la >= 10 && (la >= lb || lb < 10)) return { dir: prefer, edge: a - prefer * 0.6, len: la }; // ~9 m is what the chase and the fall need
    if (lb >= 10) return { dir: -prefer, edge: b + prefer * 0.6, len: lb };
    return null;
  }

  /** A lamp post of this spot that stands on the thief's pavement 5 to 11 m along his getaway, with an open line to it; else null. */
  function lampAhead(ctx, r, dir, esc) {
    const lane = r.z + 0.9;
    return (ctx.L.lamps || []).find((l) => {
      const d = dir * (l.x - r.x);
      return d >= 5 && d <= Math.min(esc.len - 1.2, 11) && Math.abs(l.z - lane) < 2.4 && Math.abs(l.x) < EX1 - 3 &&
        S.lineClear(ctx, r.x + dir * 0.6, lane, l.x - dir * 1.0, l.z, 0.3, { ground: 'open', ignore: [l, r] });
    }) || null;
  }

  /** A row of chain links between two street-space points: lies on the ground when slack, a straight bar at the height of the ends when taut. */
  const mkChain = (R, n, col, thick = 1) => {
    const segs = [];
    for (let i = 0; i < n; i++) { const s = R.add(sculpt((v) => v.box(0, 0, 0, 0.13, 0.1 * thick, 0.13 * thick, col))); s.visible = false; segs.push(s); }
    return {
      segs,
      /** from a to b; `len` is how long the chain really is (slack when the ends are closer than that) */
      set(ax, ay, az, bx, by, bz, len) {
        const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), sag = clamp(Math.sqrt(Math.max(0, len * len - d * d)) * 0.45, 0, 0.5);
        segs.forEach((s, i) => {
          const t = (i + 0.5) / n;
          s.visible = true;
          s.position.set(ax + dx * t, Math.max(0.06, ay + (by - ay) * t - sag * Math.sin(Math.PI * t)), az + dz * t);
          s.rotation.y = -Math.atan2(dz, dx);
          s.scale.x = Math.max(1, (d / n / 0.13) * 0.92);
        });
      },
    };
  };
  const padlock = () => sculpt((v) => { v.box(0, 0, 0, 0.2, 0.2, 0.1, '#ffd60a'); v.box(0, 0.2, 0, 0.12, 0.1, 0.06, '#3a3f45'); });

  return {
    w: [0, 0, 3, 2, 2], crime: 1, need: ['racks'],
    // a rack with 10 m of clear pavement along it to ride off on, and the room that takes
    stage: { pave: { side: 'far', len: 10, depth: 1.2 }, anchor: 'rack', reach: 10 },
    // a rack with room to ride off along it (no tree, wall or water within a few metres), else this gag is not played here
    avail: (ctx) => ctx.L.racks.some((r) => escapeFrom(ctx, r, r.x > 0 ? -1 : 1)),
    *run(ctx) {
      const stageX = ctx.stage ? ctx.stage.x : 0; // (read before the first yield)
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'bikeThief'), R = rig(ctx), seen = T.seen || (() => true);
      const racks = L.racks.filter((q) => escapeFrom(ctx, q, q.x > 0 ? -1 : 1)).sort((p, q) => Math.abs(p.x - stageX) - Math.abs(q.x - stageX));
      const r = racks.length ? racks[0] : L.racks[0];
      let done = false, res = null;
      try {
        const esc = escapeFrom(ctx, r, r.x > 0 ? -1 : 1) || { dir: r.x > 0 ? -1 : 1, edge: r.x > 0 ? EX0 + 0.6 : EX1 - 0.6, len: 10 };
        const dir = esc.dir, hd = dir > 0 ? E : W, rz = r.z + 0.35, z0 = rz + 0.55; // he comes from the house side and escapes along the pavement (z0 = his lane)
        const look = { shirt: rnd.pick(['#e84a5f', '#2a9d8f', '#f4a261', '#457b9d']), hair: rnd.pick(['#2b1d14', '#c58b3c', '#a33b20']), skin: rnd.pick(['#f2c9a0', '#c98e62', '#7a4f33']) };
        const th = makePerson(rnd, { kind: rnd.chance(0.6) ? 'raccoon' : 'robber' });
        th.ignore = [r];

        // ---- what makes him fall: decided now, planted before it happens
        const lamp = lampAhead(ctx, r, dir, esc);
        const cause = flip(ctx, 'fallChain', 0.4) ? 'chain' : lamp && flip(ctx, 'fallLamp', 0.55) ? 'lamp' : 'kid';
        const lampPt = lamp ? { x: lamp.x, z: lamp.z, y: 1.3 } : null;
        const A = { x: r.x, y: 0.4, z: r.z - 1.2 }; // the rack bar the chains are fastened to
        const kidEnd = { x: r.x + dir * 3.4, z: cause === 'kid' ? z0 : z0 + 1.0 }; // where the child's bike is dumped (across his lane, or beside it)
        let kz = kidEnd.z;
        if (cause !== 'kid') for (const zz of [z0 + 1.0, z0 - 0.8, z0 + 1.6]) if (S.clearSpot(ctx, kidEnd.x, zz, 0.6, { ground: 'open', ignore: [r] })) { kz = zz; break; }
        kidEnd.z = kz;
        // the real bike: where it stops (from the cause), and where he lands
        const LEN = 5.2, dzA = z0 - A.z, chainStop = A.x + dir * Math.sqrt(Math.max(1, LEN * LEN - dzA * dzA)) + dir * 0.95;
        const stopX = cause === 'chain' ? chainStop : cause === 'lamp' ? lamp.x - dir * 1.05 : kidEnd.x - dir * 1.15;
        const stopZ = cause === 'lamp' ? lamp.z : z0;
        let lx = stopX + dir * 1.5, lz = stopZ;
        for (const k of [3.2, 2.6, 2.0, 1.4]) {
          const cx = stopX + dir * (cause === 'lamp' ? k * 0.7 + 1.1 : k);
          if (S.clearSpot(ctx, cx, stopZ, 0.55, { ground: 'open', ignore: [r, lamp, { x: kidEnd.x, z: kidEnd.z }] })) { lx = cx; break; }
        }
        lx = clamp(lx, EX0 + 1, EX1 - 1);

        // ---- the bikes stand at the rack when the scene starts (nothing rolls in by itself)
        const bike = makeBike(rnd), kid = makeBike(rnd, null, '#ff70a6');
        kid.body.scale.setScalar(0.55 * 1.19); // makeBike's own body scale is 1.19
        R.spawn(bike, r.x - dir * 1.0, z0, 0); bike.face(hd);
        R.spawn(kid, r.x + dir * 0.3, z0 + 0.8, 0); kid.face(hd);
        const rearOf = (b, back) => ({ x: b.g.position.x - dir * back, y: 0.3, z: b.g.position.z });
        // the cheap locks: thin chains from the rack bar to each bike (the first is the child's bike's, the second the real bike's)
        const lockKid = mkChain(R, 9, '#4a5057', 0.6), lockBike = mkChain(R, 11, '#4a5057', 0.6);
        const kr = rearOf(kid, 0.5), br = rearOf(bike, 0.9);
        lockKid.set(A.x + dir * 0.5, A.y, A.z, kr.x, kr.y, kr.z, 2.0);
        lockBike.set(A.x - dir * 0.4, A.y, A.z, br.x, br.y, br.z, 2.6);
        // the thick one: padlocked round the rack bar and through the real bike's rear wheel; he does not notice it
        let thick = null, plock = null;
        if (cause === 'chain') {
          thick = mkChain(R, 26, '#ffb703', 2.2);
          plock = R.add(padlock()); plock.scale.setScalar(1.7); plock.position.set(A.x, A.y - 0.15, A.z);
          thick.set(A.x, A.y, A.z, br.x, br.y, br.z, LEN);
        }
        const B = beatsFor(ctx, 'bikeThief'), rackPt = pt(r.x, r.z - 0.4);

        // ---- 1. casing the rack: walks past, looks around, doubles back (the lamp, if it is the cause, is in the wide shot)
        B('1 casing: the thief sneaks past the rack and doubles back', [rackPt]);
        cam.wide(cause === 'lamp' ? pt((r.x + lampPt.x) / 2, (r.z + lampPt.z) / 2) : rackPt, { dist: 14, el: 0.3, az: -dir * 0.3 }); // (the lamp post that will matter is in the picture)
        const sx = clamp(r.x - dir * 4.5, EX0, EX1), px2 = clamp(r.x + dir * 2.5, EX0, EX1);
        yield* waitUntil(() => seen(ctx, sx, padZ(ctx, 'walkB0', sx)) && !seen(ctx, r.x - dir * 18, padZ(ctx, 'walkB0', sx)), 2); // (the tight shot is up before he walks into it)
        const pass = spotNear(ctx, px2, padZ(ctx, 'walkB0', px2));
        yield* R.enter(th, pass.x, pass.z, undefined, { speed: 3.8, dir }); // (the walk-in is the walk past the rack)
        cam.track(th, { dist: 9, el: 0.14, az: dir * 0.5, lead: 1.5, cut: 1.0 });
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

        // ---- 3. first lock: snip, snip, SNIP. It is the child's bike
        const lk = { x: A.x + dir * 0.3, z: A.z + 0.5, y: 0.5 };
        B('3 first lock: snip, snip, SNIP', [th, lk]);
        th.mood = 'focus';
        cam.shot({ on: [th, lk], y: 0.7, dist: 6.5, el: 0.3, az: 0.5, fit: true, hold: 3.2, drift: { dist: -0.3 } });
        yield* wait(0.3);
        for (let i = 0; i < 3; i++) {
          ctx.sfx('snip'); ctx.fx.sparks(lk.x, 0.45, lk.z, i === 2 ? 9 : 4);
          yield* hop(th, 0.08, 0.16);
          yield* wait(0.12);
        }
        ctx.fx.text('KNIP!', at(r.x, 2.2, r.z), { size: 18, color: '#ffe08a' });
        kr.x = kid.g.position.x - dir * 0.5;
        lockKid.set(A.x + dir * 0.5, A.y, A.z + 0.3, A.x + dir * 0.9, 0.06, A.z + 0.6, 3); // the cut chain slithers down to the foot of the rack
        B('3b the kid\'s bike: the thief rides off on something far too small', [th, kid]);
        cam.shot({ on: [th, kid], y: 0.6, dist: 7, el: 0.15, az: -dir * 0.4, fit: true, hold: 2.6 });
        yield* wait(0.3);
        yield* go(ctx, th, kid.g.position.x - dir * 0.35, kid.g.position.z - 0.5, 2.6);
        mount(kid, th, 0.12);
        th.mood = 'happy';
        ctx.sfx('bell');
        say(ctx, th, 'YOINK!', { size: 20, color: '#ffd60a' });
        ctx.incident();
        // someone has noticed: a balcony, a shop door, a bench or a passer-by, whatever this spot really has
        res = resident(ctx, R, r.x, look, { at: { x: r.x, z: r.z } });
        const noticed = R.run(res.notice('HÉ! MIJN KINDERFIETS!'));
        cam.track([th, kid], { dist: 8, el: 0.15, az: -dir * 0.5, lead: 1, hold: 3 });
        yield* rideTo(ctx, kid, th, kidEnd.x, kidEnd.z, 2.6, null, 0.12);
        yield* waitUntil(() => noticed.done, 4); // a passer-by needs a moment to walk up and shout; the others are there already
        B('3c noticed: the owner shouts, the thief does a double take', [th, res.owner]);
        cam.ots(th, res.owner, { hold: 2.8 });
        yield* wait(0.3);
        th.lookAt = res.owner;
        yield* doubleTake(ctx, th, '?!');
        B('3d too small: the thief is sitting on a toy, he throws it down', [th, kid]);
        cam.shot({ on: [th, kid], y: 0.6, dist: 7, el: 0.12, az: dir * 0.3, fit: true, hold: 3.2 });
        yield* wait(0.3);
        dismount(th, kid.g.position.x - dir * 0.6, kid.g.position.z);
        th.arms = 'up'; th.heading = 0; th.mood = 'shock';
        say(ctx, th, 'TE KLEIN!', { size: 15, color: '#fff' });
        ctx.sfx('bonk');
        kid.heading = kid.g.rotation.y + (cause === 'kid' ? Math.PI / 2 : 0); // across his lane, if that is what trips him
        kid.lean = 1.45;  // it topples (the bike's own roll spring follows `lean`)
        th.squash(0.2);
        yield* wait(0.4);
        th.arms = 'shrug'; th.mood = 'sad';
        say(ctx, th, 'sorry...', { size: 12, color: '#cfe8ff' });
        yield* wait(0.3);
        yield* res.calm('nou, goed');
        th.lookAt = null;

        // ---- 4. the real bike: SNIP, the thin lock falls
        const realLk = { x: A.x - dir * 0.4, z: A.z + 0.5, y: 0.5 };
        B('4 the real bike: SNIP, the lock falls', [th, realLk]);
        th.heading = Math.PI; th.mood = 'focus'; th.arms = 'hold';
        yield* go(ctx, th, r.x - dir * 0.4, rz, 3);
        th.heading = Math.PI;
        cam.dolly([th, realLk], { y: 0.7, dist: 6, el: 0.25, az: -0.5, fit: true, hold: 2.6 });
        yield* wait(0.3);
        ctx.sfx('snip'); ctx.fx.sparks(realLk.x, 0.45, realLk.z, 12);
        ctx.fx.text('KNIP!', at(r.x, 2.2, r.z), { size: 22, color: '#ffe08a' });
        ctx.shake(0.15);
        lockBike.set(A.x - dir * 0.4, A.y, A.z + 0.3, A.x - dir * 0.8, 0.06, A.z + 0.7, 3);
        yield* wait(0.5);
        ctx.wanted = th;
        ctx.news(`Bike stolen on ${ctx.st.name}. Witnesses: "ja, dat gebeurt"`);

        // he walks to the real bike and mounts it (the cheap lock lies cut on the ground behind him)
        yield* go(ctx, th, bike.g.position.x - dir * 0.3, bike.g.position.z - 0.5, 3);
        mount(bike, th);
        th.mood = 'smug';
        ctx.sfx('yoink'); ctx.sfx('bell');
        say(ctx, th, 'YOINK!', { size: 22, color: '#ffd60a' });
        yield* wait(0.3);

        R.run(res.rush('MIJN ECHTE FIETS!!', () => { const t = spotNear(ctx, lx - dir * 2.4, lz + 0.3); return { x: t.x, z: t.z }; }, { size: 17, speed: 6.8 })); // (the owner is on his way from here on, so that he is there when the thief lands)
        // ---- 4a. the plant: the thing that will bring him down is shown, and he does not see it
        const own2 = res.second;
        let causePt;
        const midChain = pt(A.x + dir * Math.abs(chainStop - dir * 0.95 - A.x) * 0.5, (A.z + z0) / 2);
        if (cause === 'chain') {
          causePt = pt(r.x + dir * 1.0, r.z - 0.2);
          B('4a the padlock: a second, thick chain is still locked round the rack', [pt(A.x, A.z), pt(br.x, br.z)]);
          cam.shot({ on: [pt(A.x, A.z + 0.2), pt(br.x, br.z)], y: 0.3, dist: 4.2, el: 0.2, az: dir * 0.5, fit: true, cut: 0.8, hold: 2 });
          ctx.sfx('clatter'); ctx.sfx('tick');
          yield* wait(0.5);
          ctx.fx.text('*KLINK*', at(A.x, 1.2, A.z), { size: 15, color: '#ffe08a' });
          th.mood = 'smug'; th.heading = hd; th.lookAt = null;
          yield* wait(1.0);
        } else if (cause === 'lamp') {
          causePt = lampPt;
          B('4a ahead: a lamp post stands on his way out', [lampPt, bike]);
          cam.shot({ on: [lampPt, bike], y: 1.0, dist: 8, el: 0.1, az: -dir * 1.15, fit: true, cut: 0.8, hold: 2 });
          ctx.sfx('tick');
          yield* wait(1.4);
        } else {
          causePt = kid;
          B('4a in his way: the child\'s bike he threw down lies across the lane', [kid, bike]);
          cam.ground([kid, bike], { dist: 7, az: dir * 0.35, fit: true, cut: 0.8, hold: 2 });
          ctx.sfx('tick');
          yield* wait(1.4);
        }
        // ---- 4b. he gloats; the owner is coming (rushes in from where the owner really is) and he looks back at him
        B('4b gloat: the thief sniggers on his stolen bike', [th, bike]);
        cam.hero(th, { dist: 6, hold: 2 });
        yield* wait(0.3);
        th.lookAt = own2;
        yield* laugh(ctx, th, 1.0, 'he');

        // ---- 5. the getaway: he looks back over his shoulder, laughing, and does not watch where he is going
        B('5 the getaway: he rides off looking back', cause === 'lamp' ? [th, bike, lampPt] : cause === 'chain' ? [th, bike, midChain] : [th, bike, kid]);
        cam.ground(cause === 'chain' ? [bike, midChain] : cause === 'lamp' ? [bike, lampPt] : [bike, kid], { dist: 8, az: -dir * 0.4, fit: true, hold: 3.2 });
        yield* wait(0.5);
        th.lookAt = own2;
        cackle(ctx, th, 2.2, 'he');
        let v = 0, rattle = 0, pre = false;
        const bq = bike.g.position;
        const fallOn = cause === 'chain' ? [bike, midChain] : cause === 'lamp' ? [bike, lampPt] : [bike, kid];
        const fallSubj = cause === 'chain' ? [th, bike, midChain] : cause === 'lamp' ? [th, bike, lampPt] : [th, bike, kid];
        const rideTarget = { x: stopX, z: stopZ };
        yield* (function* () {
          for (;;) {
            const dx = rideTarget.x - bq.x, dz = rideTarget.z - bq.z, d = Math.hypot(dx, dz);
            if (d <= 0.06) return;
            const dt = yield;
            v = Math.min(7.2, v + 4.6 * dt);
            const s = Math.min(d, v * dt);
            if (!pre && d - s < v * 0.55) { // the shot for the fall starts about half a second BEFORE it, low, with the cause and the bike in it
              pre = true;
              B('6 the fall: the cause stops the bike dead, the thief does not', fallSubj);
              cam.ground(fallOn, { dist: 6, az: -dir * 0.5, roll: 0.14, fit: true, quick: true, hold: 3.8 });
            }
            bq.x += (dx / d) * s; bq.z += (dz / d) * s; bq.y = 0;
            bike.heading = Math.atan2(dx, dz); bike.moving = v;
            seat(bike, th);
            rattle -= dt;
            if (cause === 'chain') {
              const rr = rearOf(bike, 0.9);
              thick.set(A.x, A.y, A.z, rr.x, rr.y, rr.z, LEN);
              if (rattle < 0) { rattle = 0.3; ctx.sfx('clatter'); }
            }
          }
        })();
        // ---- 6. the fall: the bike stops dead against the cause, the thief does not (the shot began just before, in the ride loop)
        ctx.sfx('skid'); ctx.shake(0.35);
        bike.moving = 0;
        if (cause === 'chain') { ctx.sfx('clatter'); ctx.fx.sparks(bq.x - dir * 0.9, 0.3, bq.z, 12); ctx.fx.text('ZING!', at(bq.x - dir * 2, 1.2, bq.z), { size: 22, color: '#ffe08a' }); }
        else if (cause === 'lamp') { ctx.sfx('bonk'); ctx.fx.text('KLONG!', at(lamp.x, 2.4, lamp.z), { size: 26, color: '#ffd60a' }); ctx.fx.pips(lamp.x, 1.6, lamp.z, 8); }
        else { ctx.sfx('bonk'); ctx.fx.text('KLETS!', at(kid.g.position.x, 1.0, kid.g.position.z), { size: 22, color: '#ffd60a' }); ctx.fx.sparks(kid.g.position.x, 0.3, kid.g.position.z, 6); }
        cam.freeze(0.4);
        th.lookAt = null; th.pose = null;
        ctx.sfx('boing');
        bike.g.rotation.order = 'YXZ';
        const tx0 = bq.x;
        R.run(tween(0.9, (t) => {
          bike.g.rotation.x = t * TAU; bike.g.position.y = Math.sin(t * Math.PI) * 0.7;
          if (cause !== 'chain') bike.g.position.x = tx0 - dir * 0.4 * t; // it rebounds off what it hit
          if (cause === 'chain') { const rr = rearOf(bike, 0.9); thick.set(A.x, A.y, A.z, rr.x, 0.3 + bike.g.position.y * 0.5, rr.z, LEN); }
        }));
        yield* tumble(ctx, th, lx, lz, 1.9, 0.85);
        ctx.fx.puff(lx, 0.1, lz, '#e8e8e8');
        ctx.fx.text('PLOF!', at(lx, 1.3, lz), { size: 26, color: '#ffd60a' });
        bike.g.rotation.x = 0; bike.g.position.y = 0;
        bike.lean = 1.45; // lies on its side
        if (cause === 'kid') kid.lean = 1.45;
        B('6b stars: the thief sits in the dust', [th]);
        cam.close(th, { dist: 4.5, hold: 2.2 });
        yield* wait(0.3);
        say(ctx, th, '★ ★', { size: 16, color: '#ffe066', dur: 1 });
        R.run(seeStars(ctx, th, 1.4));
        yield* wait(0.5);
        // ...and the viewer sees what did it, once more (the cause, with the wreck beside it)
        const reasonPt = cause === 'chain' ? midChain : cause === 'lamp' ? lampPt : kid;
        B('6c the reason: ' + (cause === 'chain' ? 'the chain, still tight round the rack' : cause === 'lamp' ? 'the lamp post' : 'the child\'s bike across the lane'), [reasonPt, bike]);
        cam.ground([reasonPt, bike], { dist: 7, az: dir * 0.35, fit: true, hold: 1.8 });
        yield* wait(1.3);

        // ---- 7. comeuppance, scaled by level (or forced by the audit)
        const copEnd = flip(ctx, 'cop', lv >= 4 ? 1 : 0);
        const cop = copEnd ? makePerson(rnd, { kind: 'cop' }) : null;
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
        B('7 the owner arrives: DAT WORDT 60 EURO', [th]);
        cam.two(own2, th, { az: -dir * 0.2, hold: 3.4 });
        yield* waitUntil(() => Math.abs(own2.g.position.x - lx) < 3.4 && !own2.offstage, 8);
        yield* wait(0.3);
        faceTo(own2, lx, lz);
        own2.arms = 'fist'; own2.mood = 'angry'; own2.lookAt = th;
        yell(ctx, own2, 'DAT WORDT €60!', '#ff6b6b', 15);
        yield* wait(0.5);
        th.arms = 'up'; th.mood = 'scared'; th.lookAt = own2;
        say(ctx, th, 'ik... eh...', { size: 12, color: '#cfe8ff' });
        // the owner takes the bikes home: the child's bike on the tow, wheeled out of the picture (the thief trudges behind if he has no cop)
        const wheelHome = function* (tow) {
          if (cause === 'chain') { // he unlocks the padlock first: click, and the chain falls slack
            own2.arms = 'carry';
            yield* go(ctx, own2, A.x, A.z + 0.9, 3.2, 0.06, { ignore: [r] });
            ctx.sfx('tick'); ctx.fx.sparks(A.x, A.y, A.z, 4);
            thick.set(A.x, A.y, A.z, A.x - dir * 0.3, 0.06, A.z + 0.6, 6);
            if (plock) plock.position.set(A.x - dir * 0.2, 0.05, A.z + 0.4);
            yield* wait(0.3);
          }
          bike.lean = 0; kid.lean = 0;
          const sd = Math.abs(S.runway(ctx, bq.x, bq.z, 1, 16, 0.6) - bq.x) >= Math.abs(S.runway(ctx, bq.x, bq.z, -1, 16, 0.6) - bq.x) ? 1 : -1;
          own2.arms = 'carry';
          yield* go(ctx, own2, bq.x - sd * 0.2, bq.z + 0.9, 3.4);
          if (tow) { tow.lookAt = null; tow.arms = 'swing'; tow.mood = 'sad'; }
          const tx = sd > 0 ? EX1 : EX0;
          let el = 0;
          yield* goEach(ctx, bike, tx, bq.z, 3.6, (dt) => {
            el += dt;
            const q = bike.g.position, h = bike.g.rotation.y;
            own2.g.position.set(q.x, 0, q.z + 0.9); own2.heading = bike.heading; own2.moving = 3;
            kid.g.position.set(q.x - Math.sin(h) * 1.5, 0, q.z - Math.cos(h) * 1.5); kid.heading = h; kid.moving = 3;
            if (tow) { tow.g.position.set(q.x - Math.sin(h) * 3.2, 0, q.z + 0.5); tow.heading = h; tow.moving = 3; }
            return el > 2.2 && !seen(ctx, q.x, q.z, 1) && !seen(ctx, kid.g.position.x, kid.g.position.z, 1);
          });
          R.gone(bike); R.gone(kid);
          if (tow) R.gone(tow);
          yield* R.out(own2);
        };
        if (cop) {
          yield* waitUntil(() => copHere, 14);
          B('8 busted: the cop is standing over him', [cop, th]);
          cam.two(cop, th, { az: dir * 0.25, hold: 3.6 });
          yield* wait(0.3);
          cop.arms = 'hips'; cop.mood = 'smug';
          yield* getUp(th, 'scared');
          th.arms = 'up'; th.lookAt = cop;
          say(ctx, th, 'BUSTED!', { size: 24, color: '#7db8ff' });
          cam.freeze(0.5);
          ctx.fx.burst(lx, 1.2, lz, { n: 12, colors: ['#ffd60a', '#fff'], speed: 5, up: 7, glow: true, size: [0.1, 0.18] });
          ctx.news('Bike thief caught after riding away from his own mistake. Owner: "€60 for the lock"');
          ctx.sfx('cuff');
          yield* wait(1.2);
          own2.arms = 'swing'; own2.lookAt = null; th.lookAt = null;
          B('9 epilogue: led away, the owner takes his bikes home', [cop, th]);
          cam.wide(pt(lx, lz), { dist: 15, el: 0.28, az: dir * 0.2 });
          yield* wait(0.3);
          const home = R.run(wheelHome(null));
          R.run(R.away(cop, dir * 6, 3.8));
          yield* wait(0.3);
          R.run(R.away(th, dir * 6, 3.8));
          yield* waitUntil(() => home.done, 4); // (after that the camera lets go and the rig walks the rest off)
        } else {
          // the walk of shame: no cop, the owner marches the thief home behind the bikes
          yield* wait(0.3);
          yield* getUp(th, 'sad');
          th.arms = 'swing'; th.lookAt = null; own2.lookAt = null;
          ctx.sfx('hey');
          own2.arms = 'fist'; own2.mood = 'angry';
          yell(ctx, own2, 'EN NU WEG!', '#ff6b6b', 15);
          ctx.news('Bike thief marched home by owner. "Still €60," says owner');
          yield* wait(0.5);
          B('8 the walk of shame: the owner wheels the bikes home, the thief trudges behind', [own2, bike]);
          const home = R.run(wheelHome(th));
          cam.track(own2, { dist: 10, el: 0.15, az: -dir * 0.4, lead: 1 });
          yield* wait(3.0);
          // the camera stays on the street while they walk out of it (so they are really out of the picture when they go)
          B('9 epilogue: the street, with the thief and the bikes walking out of it', [pt(r.x, r.z)]);
          cam.wide(pt(r.x, r.z), { dist: 24, el: 0.3 });
          yield* wait(1.0);
          yield* waitUntil(() => home.done, 4);
        }
        yield* wait(0.5);
        done = true;
      } finally {
        cam.release();
        if (res) res.cleanup();
        R.free(done);
      }
    },
  };
}
