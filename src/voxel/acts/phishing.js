// Fraud and scams: the phishing desk. A hooded phisher fishes a wallet off the pavement and reels the money in to his desk,
// gloating with his eyes shut while a cyber cop on a bike rides up behind his back.
// Storyboard: storyboards/phishing.md. Every B(...) below is one beat of it, with who must be on screen.
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
    release, needPed,
  } = T;
  const { entryTime, seen, watching, outPoint, extraKind } = T;

  const deskProp = () => piece((v, gl) => {
    for (const sx of [-0.52, 0.52]) for (const sz of [-0.28, 0.28]) v.box(sx, 0, sz, 0.07, 0.8, 0.07, '#8a8f98');
    v.box(0, 0.8, 0, 1.2, 0.06, 0.7, '#c9a26b');
    v.box(0, 0.86, 0.06, 0.52, 0.03, 0.34, '#2b2f36');
    v.box(0, 0.89, -0.12, 0.52, 0.36, 0.03, '#2b2f36');
    v.box(0.45, 0.86, 0.12, 0.16, 0.12, 0.16, '#f4f1de');
    gl.box(0, 0.93, -0.1, 0.44, 0.28, 0.02, '#7cfc9a');
  }, 11);
  const foldedDesk = () => sculpt((v) => { v.box(0, 0, 0, 0.9, 0.1, 0.6, '#c9a26b'); v.box(0, 0.1, 0, 0.7, 0.08, 0.4, '#8a8f98'); });
  const hookProp = () => sculpt((v) => v.box(0, 0, 0, 0.13, 0.13, 0.13, '#ffd60a'), MAT.glow);

  /** Wait until the shot that was just asked for is really up (the point is in the picture): entrances are only made in view after that. */
  const shotUp = function* (ctx, x, z, y = 1) { yield* waitUntil(() => seen(ctx, x, z, y), 2); yield* wait(0.2); };

  return {
    w: [0, 1.4, 2, 2, 1.6], crime: 1,
    stage: { pave: { side: 'any', len: 14, depth: 1.6 } },
    // the hacker sets up on the pavement opposite his victim, so both pavements need a clear stretch
    avail: (ctx) => !!padSpot(ctx, 'walkF1', 0, 1.2, 14) && !!padSpot(ctx, 'walkB0', 0, 1.2, 14),
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'phishing'), B = beatsFor(ctx, 'phishing'), R = rig(ctx);
      let done = false;
      try {
        // the victim is an ordinary pedestrian (never one of the district types): borrow one near, else invent one
        let ped = takePed(ctx, 9, (q) => q.kind === 'civ' && q.lineZ > 0); // (the victim is on the near pavement: the desk stands on the far one, so the camera is on the street side of him)
        const invented = !ped;
        if (ped) R.borrow(ped);
        else { ped = makePerson(rnd, { kind: 'civ' }); ped.dir = rnd.sign(); ped.lineZ = padZ(ctx, 'walkF1', 0); }
        const p = ped.g.position, back = false, dir = ped.dir, fz = 1;
        const px00 = invented ? rnd.range(-5, 5) : p.x;
        const hn = back ? 'walkF1' : 'walkB0', hs = padSpot(ctx, hn, clamp(px00 + dir * 6, -16, 16), 1.2, 14);
        if (!hs) return; // nowhere clear to set up a desk: the victim is handed back by the cleanup
        const hx = hs.x, hz = hs.z, hh = back ? Math.PI : 0;
        const dz = hz + fz * 1.0;
        const hub = pt(hx, (hz + ped.lineZ) / 2), deskPt = pt(hx, (hz + dz) / 2);
        const tipX = hx, tipY = 1.3, tipZ = hz + fz * 1.1;
        const hk = makePerson(rnd, { kind: 'hoodie', shirt: rnd.pick(['#1b4332', '#14213d', '#3a0ca3']) });

        // ---- where the cyber cop comes from: the longer side of the street, along the phisher's own pavement line
        const cs = hx > 0 ? -1 : 1;                       // he starts out on this side (x = hx + cs * ...) and rides towards the desk
        let zc = null;
        const startX = clamp(outPoint(ctx, hx + cs * 14, hz, cs, 5, 0.6).x, EX0 - 8, EX1 + 8), x1 = startX;   // (out of the frame; the line is checked from there)
        for (const zz of [hz, hz + 0.4, hz - 0.4, L.bikeF, L.bikeB, S.laneFor(ctx, -cs, Math.min(hx, x1), Math.max(hx, x1))]) {
          if (zz != null && S.lineClear(ctx, x1, zz, hx + cs * 2.4, zz, 0.4)) { zc = zz; break; }
        }
        const stopX = hx + cs * 3.3;
        const ridingIn = zc != null;
        const copBike = ridingIn ? makeBike(rnd) : null, cop = makePerson(rnd, { kind: 'cop' });
        const chaseEnd = S.runway(ctx, hx, hz, -cs, 18, 0.6);
        const flee = ridingIn && Math.abs(zc - hz) < 0.5 && Math.abs(chaseEnd - hx) >= 11 && flip(ctx, 'chase', 0.55);

        // ---- 1. set-up: a phone zombie ambles in while a hooded figure carries in a folding desk
        B('1 set-up: a phone zombie ambles in, a hooded figure carries in a desk', [hub]);
        cam.wide(hub, { dist: 10 }); // (tight on the place: the frame's edges are a few metres away, so both of them are in the picture almost at once)
        ped.hold(item.phone()); ped.arms = 'hold'; ped.heading = dir > 0 ? E : W; ped.mood = 'neutral';
        yield* waitUntil(() => seen(ctx, hx, hz) && !seen(ctx, hx - dir * 16, ped.lineZ), 2); // (the tight shot is up before anybody walks into it)
        const walk = R.run((function* () {
          if (invented) yield* R.enter(ped, hx - dir * 5, ped.lineZ, undefined, { speed: 3.2, dir });
          yield* go(ctx, ped, hx - dir * 1.8, ped.lineZ, invented ? 2.2 : 1.4);
        })());
        hk.hold(foldedDesk(), 'front'); hk.arms = 'carry'; hk.mood = 'sly';
        yield* R.enter(hk, hx, hz, undefined, { speed: 3.8, dir: -cs });
        hk.drop(); hk.arms = 'swing'; hk.heading = hh;

        B('1b the desk unfolds', [hk, deskPt]);
        cam.ground(deskPt, { dist: 6.5, el: 0.12, az: 0.35 });
        yield* wait(0.3);
        yield* lookAround(hk, 0.6, 0.22);
        const desk = R.add(deskProp());
        desk.position.set(hx, 0.001, dz); desk.rotation.y = hh + Math.PI; desk.scale.setScalar(0.001);
        ctx.sfx('clatter');
        yield* tween(0.35, (t) => desk.scale.setScalar(Math.max(0.001, t)), ease.outBack);
        ctx.fx.puff(hx, 0.2, dz);
        ctx.sfx('ding');
        yield* wait(0.3);

        // ---- 2. reveal: he turns to the lens, rubs his hands and sniggers
        B('2 reveal: the phisher grins at us', [hk]);
        hk.heading = 0;
        hk.mood = 'smug'; hk.arms = 'rub';
        cam.hero(hk, { dist: 6 });
        cam.card('DE HENGELAAR', 'Phishing, but make it literal', 2);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        yield* laugh(ctx, hk, 0.9, 'he');
        hk.arms = 'swing'; hk.heading = hh;

        // ---- 3. the bait: a text goes out, the victim reads it, delighted
        B('3 typing the bait', [hk, ped]);
        cam.two(hk, ped, { fit: true });
        hk.arms = 'write'; hk.mood = 'focus';
        yield* wait(0.3);
        for (let i = 0; i < 2; i++) { ctx.sfx('typing'); say(ctx, hk, '*klik klik*', { size: 12, color: '#b9fbc0' }); yield* wait(0.4); }
        yield* waitUntil(() => walk.done, 4);
        R.stop(walk);
        faceTo(ped, hx, hz);

        B('3b the text lands: the victim is delighted', [ped]);
        cam.close(ped, { dist: 4.5 });
        yield* wait(0.3);
        ctx.sfx('ding');
        say(ctx, ped, rnd.pick(['"UW PAKKET WACHT"', '"HOI MAM, NIEUW NUMMER"', '"U HEEFT GEWONNEN!"']), { size: 12, color: '#cfe8ff', dur: 1.8 });
        yield* doubleTake(ctx, ped, '!');
        ped.mood = 'happy'; ped.nodT = 1;
        ped.squash(0.15);
        yield* wait(0.3);

        // ---- 3c. the cast: out comes the rod, the hook flies over the pavement and bites
        B('3c the cast: the hook flies, the wallet pops out of his pocket', [hk, ped]);
        hk.hold(item.rod());
        hk.arms = 'fist'; hk.mood = 'sly';
        cam.two(hk, ped, { el: 0.2, fit: true });
        const ln = lineObj(R), hook = R.add(hookProp());
        hook.position.set(tipX, tipY, tipZ);
        yield* wait(1.0);
        hk.arms = 'hold';
        ctx.sfx('whoosh');
        ln.visible = true;
        const px = p.x, pz = p.z;
        yield* tween(0.5, (t) => {
          const x = lerp(tipX, px, t), y = lerp(tipY, 1.0, t) + Math.sin(t * Math.PI) * 0.65, z = lerp(tipZ, pz, t);
          hook.position.set(x, y, z);
          ln.aim(tipX, tipY, tipZ, x, y, z);
        }, ease.outQuad);
        ctx.sfx('boing');
        ctx.fx.text('PHISHING!', at((hx + px) / 2, 2.6, (hz + pz) / 2), { size: 24, color: '#7cfc9a' });
        ped.arms = 'up'; ped.mood = 'shock'; ped.lookAt = hk;
        ped.squash(0.25);
        const wal = R.add(item.wallet());
        wal.scale.setScalar(2); wal.position.set(px, 0.9, pz);
        ctx.sfx('pop');
        yield* wait(0.5);

        // ---- 4. reel in: the victim is dragged a few steps, the wallet travels along the line to the desk
        B('4 reeling it in along the line', [hk, ped]);
        cam.two(hk, ped, { fit: true, el: 0.5 });
        yield* wait(0.3);
        hk.arms = 'fist';
        ctx.sfx('reel');
        yield* tween(0.95, (t) => {
          const k = ease.inQuad(t);
          p.z = pz - fz * 0.8 * Math.sin(t * Math.PI * 0.5);
          const x = lerp(px, tipX, k), y = lerp(0.9, tipY, k), z = lerp(p.z, tipZ, k);
          wal.position.set(x, y, z);
          hook.position.set(x, y + 0.12, z);
          ln.aim(tipX, tipY, tipZ, x, y, z);
        });
        R.rm(wal); R.rm(hook); ln.visible = false;
        hk.drop(); // the rod is done
        const w2 = item.wallet();
        w2.scale.setScalar(1.7); w2.position.set(0, -0.78, 0.1);
        hk.armL.add(w2);
        hk.arms = 'hold';
        ctx.incident();
        ctx.wanted = hk;

        // the money comes out of the wallet and onto the desk
        B('4b the haul: a wad lands on the desk, he counts', [hk, deskPt]);
        cam.dolly([hk, deskPt], { fit: true, dist: 6.5, el: 0.1 });
        hk.heading = 0; hk.mood = 'smug';
        yield* wait(0.4);
        ctx.sfx('coin');
        ctx.fx.cash(hx, 1.2, hz, 8, 2, 4);
        const wad1 = R.add(item.wad()); wad1.scale.setScalar(2); wad1.position.set(hx, 1.0, hz);
        yield* arc(wad1, hx + 0.42, 0.9, dz - fz * 0.05, 0.6, 0.45, 3);
        hk.armL.remove(w2);
        const dw = R.add(item.wallet()); dw.scale.setScalar(2); dw.position.set(hx - 0.42, 0.9, dz);
        ctx.sfx('kaching');
        hk.arms = 'count';
        yield* laugh(ctx, hk, 1.0, 'he');
        ctx.fx.pips(hx, 1.9, hz, 4, ['#ffd60a', '#ffffff']);

        // ---- the cyber cop is on his way already: he starts from out of the frame while the victim is still shouting, at the pace
        //      that brings him about 15 m from the desk when the camera glides down the street; then he speeds up, rings, brakes in three steps
        const copV = 4.8, D0 = Math.abs(startX - hx), v1 = clamp((D0 - 15) / 5.1, 2.2, 5.2);
        let copAtStop = false;
        if (ridingIn) {
          if (Math.abs(zc - hz) > 0.5) R.run(R.close()); // (he rides on the road: the traffic waits)
          R.run((function* () {
            R.spawn(copBike, startX, zc); R.spawn(cop, startX, zc);
            copBike.face(-cs > 0 ? E : W); mount(copBike, cop); cop.mood = 'neutral';
            yield* rideTo(ctx, copBike, cop, hx + cs * 15, zc, v1);
            yield* rideTo(ctx, copBike, cop, hx + cs * 12, zc, copV);
            ctx.sfx('bell');
            yield* rideTo(ctx, copBike, cop, stopX + cs * 3, zc, copV * 0.7);
            yield* rideTo(ctx, copBike, cop, stopX + cs * 1.2, zc, copV * 0.45);
            copBike.jolt(0.5);
            yield* rideTo(ctx, copBike, cop, stopX, zc, 1.2);
            copAtStop = true;
          })());
        }

        B('4c the victim wakes up: shock, then fury', [ped]);
        cam.face(ped);
        yield* wait(0.5);
        ped.mood = 'angry'; ped.arms = 'fist'; ped.lookAt = hk; ped.shakeT = 1;
        yell(ctx, ped, rnd.pick(['MIJN SPAARGELD!', 'OPGELICHT!', 'HÈ?! €0,00?!']));
        ped.squash(0.15);
        yield* wait(0.7);

        // ---- 5. greed, and the reveal. He gloats in profile with his eyes shut, facing down the street; the camera
        //         pans along his sight line past his face and pushes in on what he cannot see: the cop, riding up.
        const camX = hx + cs * 0.8, camY = 1.7, camZ = hz + (hz < 0 ? 4.8 : -4.8); // (on the street side of him, never inside the houses) // the camera stands here for the whole reveal
        const view = (tx, tz, y, fov) => { // a shot that looks at (tx, y, tz) from the fixed camera spot
          const vx = camX - tx, vz = camZ - tz, vy = camY - y, h = Math.hypot(vx, vz);
          return { on: pt(tx, tz), y, dist: Math.hypot(h, vy), az: Math.atan2(vx, vz), el: Math.atan2(vy, h), fov };
        };
        B('5 greed: eyes shut, he gloats', [hk]);
        hk.heading = cs > 0 ? E : W; hk.mood = 'laugh'; hk.arms = 'count'; hk.lookAt = null;
        ped.lookAt = hk;
        cam.shot({ ...view(hx, hz, 1.5, 34), on: hk, free: true });
        yield* wait(0.5);
        say(ctx, hk, 'MEER!', { size: 16, color: '#ffd60a' });
        ctx.sfx('snigger');
        yield* wait(0.8);
        hk.squash(0.15);
        yield* wait(1.0); // a good second and a half in profile

        B('5b the pan: along his sight line, past his face', [pt(hx + cs * 13, zc ?? hz)]);
        cam.shot({ ...view(hx + cs * 13, zc ?? hz, 1.1, 28), cut: 1.1, free: true });
        yield* wait(1.4);

        B('5c push in: the cop, small at first and growing', ridingIn ? [cop] : [pt(hx + cs * 7, hz)]);
        cam.shot({ ...view(hx + cs * 7, zc ?? hz, 1.0, 22), cut: 0.9 });
        yield* waitUntil(() => copAtStop || !ridingIn, 7);
        if (ridingIn) { say(ctx, cop, 'POLITIE CYBERCRIME!', { size: 14, color: '#7db8ff' }); ctx.sfx('whistle'); }
        yield* wait(0.7);

        B('5d the slow turn: his eyes open, his head comes round', [hk]);
        cam.close(hk, { dist: 4.2, y: 1.4, az: -0.5 * cs });
        yield* wait(0.3);
        hk.arms = 'swing'; hk.mood = 'neutral';
        hk.lookAt = { x: hx + cs * 1.2, z: hz };
        yield* wait(0.5);
        hk.lookAt = ridingIn ? cop : null;
        yield* wait(0.5);
        B('5e the reaction', [hk]);
        cam.crash(hk, {});
        yield* wait(0.2);
        hk.arms = 'up'; hk.mood = 'shock';
        yield* doubleTake(ctx, hk, '!!');
        ctx.sfx('gasp');
        yield* wait(0.3);

        // ---- 6. the law
        const dismountCop = () => {
          copBike.jolt(0.3);
          const q = copBike.g.position;
          dismount(cop, q.x, q.z + fz * 0.7);
          faceTo(cop, hk.g.position.x, hk.g.position.z);
        };
        if (flee) {
          // he bolts, dragging his own desk; the bike goes after him
          const tow = lineObj(R, '#b9fbc0'); tow.visible = true;
          const dp = desk.position;
          B('6 the getaway: he runs dragging the desk, the bike behind him', [hk]);
          cam.track(hk, { lead: 3, dist: 9 });
          yield* wait(0.3);
          hk.mood = 'scared'; hk.arms = 'swing'; hk.lookAt = cop; hk.heading = cs > 0 ? W : E;
          say(ctx, cop, 'HALT! STOP!', { size: 15, color: '#7db8ff' });
          const exitX = clamp(chaseEnd, EX0, EX1);
          let spark = 0, caught = false;
          const bikeTask = R.run((function* () {
            yield* wait(0.35);
            yield* rideTo(ctx, copBike, cop, exitX, zc, 8.4, () => caught);
          })());
          yield* goEach(ctx, hk, exitX, hz, 7.3, (dt) => {
            const behind = hk.g.position.x + cs * 2.2;
            dp.x += (behind - dp.x) * 0.25; dp.z += (hz - dp.z) * 0.25;
            dp.y = 0.45 + Math.abs(Math.sin(hk.g.position.x * 2.2)) * 0.12;
            tow.aim(hk.g.position.x, 0.9, hz, dp.x, 0.6, dp.z);
            for (const o of [wad1, dw]) o.position.set(dp.x, dp.y + 0.45, dp.z);
            spark -= dt;
            if (spark < 0) { spark = 0.09; ctx.fx.sparks(dp.x, 0.1, dp.z, 2); }
            if (Math.abs(copBike.g.position.x - hk.g.position.x) < 1.6) { caught = true; return true; }
          });
          caught = true;
          B('6b busted: the bike skids in alongside', [hk, cop]);
          cam.dutch([hk, cop], { fit: true, dist: 7 });
          ctx.sfx('skid'); ctx.shake(0.2);
          R.stop(bikeTask);
          copBike.jolt(0.7);
          cam.freeze(0.5, 0.08);
          hk.arms = 'up'; hk.mood = 'shock'; hk.lookAt = cop;
          say(ctx, hk, 'BUSTED!', { size: 24, color: '#7db8ff' });
          ctx.fx.burst(hk.g.position.x, 1.15, hk.g.position.z, { n: 12, colors: ['#ffd60a', '#fff'], speed: 5, up: 7, glow: true, size: [0.1, 0.18] });
          ctx.news('Cybercrime unit lands the big phish: one bike, one bell, one desk');
          yield* wait(0.9);
          tow.visible = false;
          dismountCop();
          cop.arms = 'hips'; cop.mood = 'smug';
          B('6c the sulk', [hk]);
          cam.close(hk, {});
          yield* wait(0.3);
          hk.mood = 'sad'; hk.arms = 'cross'; hk.lookAt = null;
          ctx.sfx('womp');
          yield* wait(0.9);
        } else if (ridingIn) {
          // he freezes. The cop swings off the bike, hands on hips
          B('6 the cop brakes and dismounts', [hk, cop]);
          cam.two(hk, cop, { fit: true, dist: 8, el: 0.12 });
          yield* wait(0.3);
          dismountCop();
          cop.arms = 'hips'; cop.mood = 'angry';
          say(ctx, cop, 'PAPIEREN. EN DAT WALLETJE.', { size: 13, color: '#7db8ff' });
          hk.arms = 'up'; hk.mood = 'scared'; hk.lookAt = cop;
          yield* wait(0.7);
          yield* go(ctx, cop, hx + cs * 1.4, hz, 2.4);
          cop.arms = 'point'; ctx.sfx('cuff');
          hk.arms = 'beg'; hk.mood = 'sad';
          ctx.news('Cybercrime unit lands the big phish: one bike, one bell, one desk');
          yield* wait(0.9);
        } else {
          // no clear line for a bike: a foot cop jogs in instead
          B('6 the cyber cop jogs in', [hk]);
          cam.close(hk, {});
          R.run(R.cop(hk, 5.6, 0.2, 'POLITIE CYBERCRIME!'));
          hk.arms = 'up'; hk.mood = 'scared';
          ctx.news('Cybercrime unit lands the big phish');
          yield* wait(2.4);
        }

        // ---- 7. the wallet goes home
        const lawman = ridingIn ? cop : hk;
        B('7 the wallet is back', [ped]);
        cam.close(ped, { dist: 5.5, y: 1.1, cut: 0.4 });
        yield* wait(0.3);
        ped.lookAt = null; ped.arms = 'swing'; ped.mood = 'neutral';
        if (dw.parent) {
          R.rm(dw);
          const back2 = R.add(item.wallet());
          back2.scale.setScalar(2);
          const cpos = lawman.g.position;
          back2.position.set(cpos.x, 1.1, cpos.z);
          yield* arc(back2, p.x, 1.0, p.z, 1.1, 0.7, 6);
          R.rm(back2);
        }
        ped.hold(item.wallet()); ped.arms = 'cheer'; ped.mood = 'happy';
        say(ctx, ped, 'HA! TERUG!', { size: 15, color: '#b9fbc0' });
        ped.squash(0.25);
        ctx.sfx('coin');
        yield* wait(0.8);

        // ---- 8. everybody goes home: the desk folds up the way it unfolded, the cop climbs back on his bike and rides on
        B('8 everybody goes home', [hub]);
        cam.wide(hub, { dist: 15, cut: 0.5 });
        yield* wait(0.3);
        R.run((function* () {
          ctx.sfx('clatter'); ctx.fx.puff(desk.position.x, 0.4, desk.position.z);
          const objs = [desk, wad1].filter((o) => o.parent), s0 = objs.map((o) => o.scale.x);
          yield* tween(0.4, (t) => objs.forEach((o, i) => o.scale.setScalar(Math.max(0.001, s0[i] * (1 - t)))), ease.inQuad);
          for (const o of objs) R.rm(o);
        })());
        ped.arms = 'wave'; say(ctx, ped, 'doei!', { size: 12, color: '#cfe8ff' });
        R.give(ped);
        if (ridingIn) {
          R.run((function* () {
            const bp = copBike.g.position;
            yield* go(ctx, cop, bp.x, bp.z + fz * 0.7, 2.8);
            mount(copBike, cop);
            const ex = outPoint(ctx, bp.x, bp.z, -cs, 5, 0.6).x;
            yield* rideTo(ctx, copBike, cop, ex, bp.z, 5.5);
            R.gone(cop); R.gone(copBike);
          })());
        }
        R.run(R.away(hk, -cs * 7, 2.6));
        yield* wait(1.0);
        yield* R.settle(8);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
