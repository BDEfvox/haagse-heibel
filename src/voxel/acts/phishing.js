// Fraud and scams: the phishing desk. A hooded phisher fishes wallets off the pavement and reels the money in to his desk.
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
    release, needPed, panic, closeRoad, openRoad, policeRun, footCop,
  } = T;

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

  return {
    w: [0, 1.4, 2, 2, 1.6], crime: 1,
    // the hacker sets up on the pavement opposite his victim, so both pavements need a clear stretch
    avail: (ctx) => !!padSpot(ctx, 'walkF1', 0, 1.2, 14) && !!padSpot(ctx, 'walkB0', 0, 1.2, 14),
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'phishing'), B = beatsFor(ctx, 'phishing'), R = rig(ctx);
      let done = false;
      try {
        const ped = yield* needPed(ctx, 9);
        if (!ped) return;
        R.borrow(ped);
        const p = ped.g.position, back = ped.lineZ < 0, dir = ped.dir, fz = back ? -1 : 1;
        const hn = back ? 'walkF1' : 'walkB0', hs = padSpot(ctx, hn, clamp(p.x + dir * 6, -16, 16), 1.2, 14);
        if (!hs) return; // nowhere clear to set up a desk: the victim is handed back by the cleanup
        const hx = hs.x, hz = hs.z, hh = back ? Math.PI : 0;
        const vz = back ? [padZ(ctx, 'walkB0', hx), padZ(ctx, 'walkB1', hx)] : [padZ(ctx, 'walkF0', hx), padZ(ctx, 'walkF1', hx)], dz = hz + fz * 1.0;
        const hub = pt(hx, (hz + ped.lineZ) / 2), deskPt = pt(hx, (hz + dz) / 2);
        const tipX = hx, tipY = 1.3, tipZ = hz + fz * 1.1;
        const hk = makePerson(rnd, { kind: 'hoodie', shirt: rnd.pick(['#1b4332', '#14213d', '#3a0ca3']) });

        // ---- 1. set-up: a phone zombie ambles in while a hooded figure carries in a folding desk
        B('1 set-up: a phone zombie ambles in, a hooded figure carries in a desk', [ped, hk]);
        cam.wide(hub, { dist: 26, hold: 3 });
        ped.hold(item.phone()); ped.arms = 'hold'; ped.heading = dir > 0 ? E : W; ped.mood = 'neutral';
        const walk = R.run(go(ctx, ped, hx - dir * 1.8, ped.lineZ, 1.4));
        hk.hold(foldedDesk(), 'front'); hk.arms = 'carry'; hk.mood = 'sly';
        yield* R.enter(hk, clamp(hx + dir * 7, EX0, EX1), hz);
        cam.track(hk, { dist: 11, el: 0.12, az: 0.4, lead: 1.5, cut: 0.8, hold: 3 });
        yield* go(ctx, hk, hx, hz, 3.6);
        hk.drop(); hk.arms = 'swing'; hk.heading = hh;

        B('1b the desk unfolds', [hk, deskPt]);
        cam.ground(deskPt, { dist: 6.5, el: 0.12, az: 0.35, hold: 3 });
        yield* wait(0.3);
        yield* lookAround(hk, 0.9, 0.22);
        const desk = R.add(deskProp());
        desk.position.set(hx, 0.001, dz); desk.rotation.y = hh + Math.PI; desk.scale.setScalar(0.001);
        ctx.sfx('clatter');
        yield* tween(0.35, (t) => desk.scale.setScalar(Math.max(0.001, t)), ease.outBack);
        ctx.fx.puff(hx, 0.2, dz);
        ctx.sfx('ding');
        yield* wait(0.3);

        // ---- 2. reveal: he turns to the lens, rubs his hands and sniggers
        B('2 reveal: the phisher grins at us', [hk]);
        hk.heading = 0; // turn to the lens for the reveal
        hk.mood = 'smug'; hk.arms = 'rub';
        cam.hero(hk, { dist: 6, hold: 3.6 });
        cam.card('DE HENGELAAR', 'Phishing, but make it literal', 2);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        yield* laugh(ctx, hk, 1.1, 'he');
        hk.arms = 'swing'; hk.heading = hh;

        // ---- 3. the act: a text goes out, the victim reads it, the line is cast
        B('3 typing the bait', [hk, ped]);
        cam.two(hk, ped, { fit: true, hold: 3.4 });
        hk.arms = 'write'; hk.mood = 'focus';
        yield* wait(0.3);
        for (let i = 0; i < 2; i++) { ctx.sfx('typing'); say(ctx, hk, '*klik klik*', { size: 12, color: '#b9fbc0' }); yield* wait(0.45); }
        yield* waitUntil(() => walk.done, 4);
        R.stop(walk);
        faceTo(ped, hx, hz);

        B('3b the text lands: the victim is delighted', [ped]);
        cam.close(ped, { dist: 4.5, hold: 2.2 });
        yield* wait(0.35);
        ctx.sfx('ding');
        say(ctx, ped, rnd.pick(['"UW PAKKET WACHT"', '"HOI MAM, NIEUW NUMMER"', '"U HEEFT GEWONNEN!"']), { size: 12, color: '#cfe8ff', dur: 1.8 });
        yield* doubleTake(ctx, ped, '!');
        ped.mood = 'happy'; ped.nodT = 1;
        ped.squash(0.15);
        yield* wait(0.5);

        B('3c wind-up: out comes the fishing rod', [hk]);
        hk.hold(item.rod());
        hk.arms = 'fist'; hk.mood = 'sly'; // wind-up
        cam.hero(hk, { dist: 6, az: -0.4, hold: 1.4 });
        yield* wait(0.7);

        B('3d the cast: the hook flies over the pavement', [hk, ped]);
        const ln = lineObj(R), hook = R.add(hookProp());
        hook.position.set(tipX, tipY, tipZ);
        cam.two(hk, ped, { el: 0.2, fit: true, hold: 1.8 });
        yield* wait(0.3);
        hk.arms = 'hold';
        ctx.sfx('whoosh');
        ln.visible = true;
        const px = p.x, pz = p.z;
        yield* tween(0.5, (t) => {
          const x = lerp(tipX, px, t), y = lerp(tipY, 1.0, t) + Math.sin(t * Math.PI) * 0.65, z = lerp(tipZ, pz, t);
          hook.position.set(x, y, z);
          ln.aim(tipX, tipY, tipZ, x, y, z);
        }, ease.outQuad);

        B('3e bite: the wallet pops out of his pocket', [ped]);
        cam.crash(ped, { hold: 1.6 });
        yield* wait(0.3);
        ctx.sfx('boing');
        ctx.fx.text('PHISHING!', at((hx + px) / 2, 2.6, (hz + pz) / 2), { size: 24, color: '#7cfc9a' });
        ped.arms = 'up'; ped.mood = 'shock'; ped.lookAt = hk;
        ped.squash(0.25);
        const wal = R.add(item.wallet());
        wal.scale.setScalar(2); wal.position.set(px, 0.9, pz);
        ctx.sfx('pop');
        yield* wait(0.5);

        // ---- 4. reel in: the victim gets dragged a few steps along, the wallet travels along the line
        B('4 reeling it in along the line', [wal, hk, ped]);
        cam.two(hk, ped, { fit: true, hold: 2.2, el: 0.5 });
        yield* wait(0.3);
        hk.arms = 'fist';
        ctx.sfx('reel');
        let again = false;
        yield* tween(0.95, (t) => {
          const k = ease.inQuad(t);
          p.z = pz - fz * 0.8 * Math.sin(t * Math.PI * 0.5);
          const x = lerp(px, tipX, k), y = lerp(0.9, tipY, k), z = lerp(p.z, tipZ, k);
          wal.position.set(x, y, z);
          hook.position.set(x, y + 0.12, z);
          ln.aim(tipX, tipY, tipZ, x, y, z);
          if (t > 0.5 && !again) { again = true; ctx.sfx('reel'); }
        });
        R.rm(wal); R.rm(hook); ln.visible = false;
        hk.drop(); // the rod is done
        const w2 = item.wallet();
        w2.scale.setScalar(1.7); w2.position.set(0, -0.78, 0.1);
        hk.armL.add(w2);
        hk.arms = 'hold';
        ctx.incident();
        ctx.wanted = hk;

        // the money comes out of the wallet and onto the desk: the pile starts here
        B('4b the haul: the first wad lands on the desk, he counts', [hk, deskPt]);
        const pile = [];
        const wadAt = (i) => [hx + 0.42, 0.9, dz - fz * 0.05];
        cam.dolly([hk, deskPt], { fit: true, dist: 6.5, el: 0.1, hold: 3.6 });
        hk.heading = 0; hk.mood = 'smug';
        yield* wait(0.4);
        ctx.sfx('coin');
        ctx.fx.cash(hx, 1.2, hz, 8, 2, 4);
        const wad1 = R.add(item.wad()); wad1.scale.setScalar(2); wad1.position.set(hx, 1.0, hz);
        pile.push(wad1);
        yield* arc(wad1, wadAt(0)[0], wadAt(0)[1], wadAt(0)[2], 0.6, 0.45, 3);
        hk.armL.remove(w2);
        const dw = R.add(item.wallet()); dw.scale.setScalar(2); dw.position.set(hx - 0.42, 0.9, dz);
        ctx.sfx('kaching');
        hk.arms = 'count';
        yield* laugh(ctx, hk, 1.3, 'he');
        hk.arms = 'rub';
        ctx.fx.pips(hx, 1.9, hz, 4, ['#ffd60a', '#ffffff']);
        yield* wait(0.3);

        B('4c the victim wakes up: shock, then fury', [ped]);
        cam.face(ped, { hold: 2.2 });
        yield* wait(0.5); // the shock face is held for a moment
        ped.mood = 'angry'; ped.arms = 'fist'; ped.lookAt = hk; ped.shakeT = 1;
        yell(ctx, ped, rnd.pick(['MIJN SPAARGELD!', 'OPGELICHT!', 'HÈ?! €0,00?!']));
        ped.squash(0.15);
        yield* wait(0.9);

        // ---- 5. escalation: greed. Two more phone zombies, both bite at once, and the lines tangle
        B('5 greed: MEER!', [hk]);
        cam.hero(hk, { dist: 6, az: 0.35, hold: 1.8 });
        hk.mood = 'sly'; hk.arms = 'rub';
        yield* wait(0.3);
        say(ctx, hk, 'MEER!', { size: 16, color: '#ffd60a' });
        yield* laugh(ctx, hk, 0.8, 'he');
        hk.heading = hh;

        B('5b two more phone zombies stroll up', [hk]);
        const v2 = makePerson(rnd, { kind: 'civ' }), v3 = makePerson(rnd, { kind: rnd.chance(0.4) ? 'granny' : 'civ' });
        for (const v of [v2, v3]) { v.hold(item.phone()); v.arms = 'hold'; v.mood = 'happy'; }
        v2.heading = E; v3.heading = W;
        cam.top(hub, { dist: 22, hold: 3.4 });
        const crowd = gather(ctx, R, hx, 2, 12);
        for (const c of crowd) filmIt(c, hx, hz);
        yield* all(R.enter(v2, clamp(hx - 9, EX0, EX1), vz[0]), R.enter(v3, clamp(hx + 9, EX0, EX1), vz[1]));
        yield* all(go(ctx, v2, hx - 4.2, vz[0], 3.6), go(ctx, v3, hx + 4.2, vz[1], 3.6));
        ctx.sfx('ding'); yield* wait(0.2); ctx.sfx('ding');
        say(ctx, v2, '"GRATIS!"', { size: 12, color: '#cfe8ff' }); say(ctx, v3, '"KLIK HIER"', { size: 12, color: '#cfe8ff' });
        yield* wait(0.3);

        B('5c two lines at once', [hk, v2, v3]);
        cam.shot({ on: [hk, v2, v3], fit: true, dist: 14, el: 0.2, hold: 3 });
        yield* wait(0.3);
        hk.arms = 'fist';
        say(ctx, hk, 'TWEE TEGELIJK!', { size: 16, color: '#7cfc9a' });
        yield* wait(0.35);
        const ln2 = lineObj(R, '#ffe8f7'), h2 = R.add(hookProp()), h3 = R.add(hookProp());
        ln.visible = true; ln2.visible = true;
        const hp = hk.g.position;
        const reline = () => {
          const ax = hp.x, az = hp.z + fz * 1.1;
          ln.aim(ax, tipY, az, v2.g.position.x, 1.0, v2.g.position.z); h2.position.set(v2.g.position.x, 1.0, v2.g.position.z);
          ln2.aim(ax, tipY, az, v3.g.position.x, 1.0, v3.g.position.z); h3.position.set(v3.g.position.x, 1.0, v3.g.position.z);
        };
        hk.arms = 'hold';
        ctx.sfx('whoosh');
        const a2 = v2.g.position.clone(), a3 = v3.g.position.clone();
        yield* tween(0.4, (t) => {
          const ax = hx, az = tipZ;
          h2.position.set(lerp(ax, a2.x, t), lerp(tipY, 1.0, t) + Math.sin(t * Math.PI) * 0.6, lerp(az, a2.z, t));
          h3.position.set(lerp(ax, a3.x, t), lerp(tipY, 1.0, t) + Math.sin(t * Math.PI) * 0.6, lerp(az, a3.z, t));
          ln.aim(ax, tipY, az, h2.position.x, h2.position.y, h2.position.z);
          ln2.aim(ax, tipY, az, h3.position.x, h3.position.y, h3.position.z);
        }, ease.outQuad);
        ctx.sfx('boing');
        v2.arms = v3.arms = 'up'; v2.mood = v3.mood = 'shock';
        v2.squash(0.2); v3.squash(0.2);
        yell(ctx, v2, 'AU!', '#ffb4a2', 14); yell(ctx, v3, 'HÈ?!', '#ffb4a2', 14);
        yield* wait(0.4);

        // the money of both victims travels along the lines and piles up at the desk
        B('5d the money flows in along both lines', [v2, v3, deskPt]);
        cam.shot({ on: [v2, v3, deskPt], fit: true, dist: 14, el: 0.25, hold: 2.4 });
        yield* wait(0.3);
        const wad2 = R.add(item.wad()), wad3 = R.add(item.wad());
        wad2.scale.setScalar(2); wad3.scale.setScalar(2);
        ctx.sfx('reel');
        const s2 = v2.g.position.clone(), s3 = v3.g.position.clone();
        yield* tween(0.9, (t) => {
          const k = ease.inQuad(t);
          wad2.position.set(lerp(s2.x, hx, k), lerp(1.0, tipY, k) + Math.sin(t * Math.PI) * 0.15, lerp(s2.z, tipZ, k));
          wad3.position.set(lerp(s3.x, hx, k), lerp(1.0, tipY, k) + Math.sin(t * Math.PI) * 0.15, lerp(s3.z, tipZ, k));
          wad2.rotation.y = t * 9; wad3.rotation.y = -t * 9;
          reline();
        });
        pile.push(wad2, wad3);
        wad2.rotation.set(0, 0, 0); wad3.rotation.set(0, 0, 0);
        wad2.position.set(hx + 0.42, 1.0, dz - fz * 0.05); wad3.position.set(hx + 0.42, 1.1, dz - fz * 0.05);
        ctx.sfx('coin'); ctx.sfx('kaching');
        ctx.fx.cash(hx + 0.42, 1.1, dz, 10, 2, 4);
        const bag = R.add(item.moneybag(0.8)); bag.position.set(hx - 0.1, 0.9, dz + fz * 0.15);
        pile.push(bag);
        hk.arms = 'count'; hk.mood = 'laugh';
        hk.squash(0.2);
        cackle(ctx, hk, 1.2, 'he');
        yield* wait(0.9);

        // tug-of-war: the hacker is yanked left and right
        B('5e tug-of-war: the lines pull both ways', [hk, v2, v3]);
        cam.orbit([hk, v2, v3], { fit: true, dist: 12, el: 0.2, hold: 4 });
        yield* wait(0.3);
        hk.arms = 'hold'; hk.mood = 'shock';
        yield* tween(0.65, (t) => { hp.x = hx + Math.sin(t * Math.PI * 3) * 0.7; reline(); });
        // both victims run circles around the hacker, wrapping him in line
        ctx.sfx('reel');
        const turn = TAU * 1.3;
        v2.mood = v3.mood = 'angry'; v2.arms = v3.arms = 'fist';
        yield* tween(2.2, (t) => {
          const e = ease.inOut(t), th = turn * e, r = lerp(4.2, 1.1, e), s = Math.min(1, t * 3);
          const x2 = hx + Math.cos(th + Math.PI) * r, z2 = lerp(vz[0], hz + Math.sin(th + Math.PI) * r * 0.5, s);
          const x3 = hx + Math.cos(th) * r, z3 = lerp(vz[1], hz + Math.sin(th) * r * 0.5, s);
          v2.heading = Math.atan2(x2 - v2.g.position.x, z2 - v2.g.position.z); v3.heading = Math.atan2(x3 - v3.g.position.x, z3 - v3.g.position.z);
          v2.g.position.x = x2; v2.g.position.z = z2; v3.g.position.x = x3; v3.g.position.z = z3;
          v2.moving = v3.moving = 5;
          hp.x = hx; hk.heading = hh - th;
          reline();
        });
        hk.heading = hh;

        B('5f knoop: the desk goes over, the money flies', [hk, deskPt]);
        cam.dutch([hk, deskPt], { fit: true, dist: 6.5, hold: 2.6 });
        yield* wait(0.3);
        hk.mood = 'scared'; hk.arms = 'up';
        say(ctx, hk, 'KNOOP!', { size: 22, color: '#ffd60a' });
        ctx.sfx('gasp');
        yield* wait(0.35);
        // the desk goes over, laptop and all
        ctx.sfx('slam'); ctx.shake(0.3);
        ctx.fx.sparks(hx, 0.8, dz, 12);
        ctx.fx.text('ZZZT!', at(hx, 2.2, dz), { size: 20, color: '#7cfc9a' });
        ctx.fx.cash(hx, 1.0, dz, 24, 4, 6);
        const wx = p.x - dir * 1.8;
        // every victim's money flies home: the wallet to the first, a wad each to the other two
        R.run(arc(wad2, v2.g.position.x, 0.9, v2.g.position.z, 1.4, 0.8, 6));
        R.run(arc(wad3, v3.g.position.x, 0.9, v3.g.position.z, 1.4, 0.8, -6));
        R.run(arc(wad1, wx + dir * 0.4, 0.1, p.z + 0.3, 1.2, 0.8, 5));
        R.run(arc(bag, hx + rnd.sign() * 1.6, 0.02, dz + fz * 0.8, 1.8, 0.8, 4));
        yield* tween(0.35, (t) => { desk.rotation.z = 1.45 * ease.outBack(t); desk.position.y = 0.45 * t; desk.position.x = hx + 0.3 * t; });

        B('5g the wallet is back', [ped, dw]);
        cam.shot({ on: [ped, dw], fit: true, dist: 6, el: 0.12, hold: 2.2 });
        yield* wait(0.3);
        // the wallet lands at the first victim's feet
        yield* arc(dw, wx, 0.1, p.z, 1.6, 0.7, 6);
        ctx.sfx('coin');
        yield* go(ctx, ped, wx, p.z, 3);
        R.rm(dw);
        ped.hold(item.wallet()); ped.arms = 'cheer'; ped.mood = 'happy'; ped.lookAt = null;
        say(ctx, ped, 'HA! TERUG!', { size: 15, color: '#b9fbc0' });
        ped.squash(0.25);
        yield* wait(0.3);
        v2.mood = v3.mood = 'happy';

        // ---- 6. comeuppance, scaled by level
        if (lv <= 2) {
          // calm: everyone unwinds, the laptop shows an error, the hacker is left tied up
          B('6 everyone unwinds', [hk, v2, v3]);
          cam.wide(hub, { dist: 20, hold: 2.2 });
          yield* wait(0.3);
          yield* tween(1.4, (t) => {
            const e = ease.inOut(t), th = turn * (1 - e), r = lerp(1.1, 3.6, e);
            v2.g.position.x = hx + Math.cos(th + Math.PI) * r; v2.g.position.z = hz + Math.sin(th + Math.PI) * r * 0.5;
            v3.g.position.x = hx + Math.cos(th) * r; v3.g.position.z = hz + Math.sin(th) * r * 0.5;
            v2.moving = v3.moving = 3;
            hk.heading = hh - th;
            reline();
          });
          ln.visible = false; ln2.visible = false; h2.visible = false; h3.visible = false;
          v2.arms = v3.arms = 'swing';
          hk.heading = 0;

          B('6b the phisher sits dazed, the laptop says 404', [hk, deskPt]);
          cam.shot({ on: [hk, deskPt], fit: true, dist: 7, el: 0.12, hold: 3 });
          yield* wait(0.3);
          hk.arms = 'up';
          say(ctx, hk, '★ ★', { size: 16, color: '#ffe066', dur: 0.9 });
          yield* hop(hk, 0.25, 0.4);
          hk.pose = 'sit'; hk.air = true;
          hk.g.position.y = 0.23; hk.arms = 'swing'; hk.mood = 'sad';
          hk.squash(0.25); ctx.fx.dust(hx, 0, hz, 0, 0, 5);
          ctx.fx.text('404', at(hx, 2.2, dz), { size: 26, color: '#7cfc9a' });
          say(ctx, hk, '*zucht*', { size: 12, color: '#cfe8ff' });
          R.run(seeStars(ctx, hk, 1.4));
          ctx.news('Phishing ring undone by its own knots; laptop says "404 Not Found"');
          yield* wait(1.0);

          B('6c the victims wave goodbye', [ped, v2, v3]);
          cam.wide(hub, { dist: 18, hold: 2.6 });
          yield* wait(0.3);
          v2.arms = v3.arms = 'wave'; v2.lookAt = v3.lookAt = hk;
          R.run(R.away(v2, -7, 3.6)); R.run(R.away(v3, 7, 3.6));
          say(ctx, ped, 'doei!', { size: 12, color: '#cfe8ff' });
          ped.arms = 'wave';
          R.give(ped);
          yield* wait(0.5);
          hk.pose = null; hk.air = false; hk.g.position.y = 0;
          R.run(vanish(R, desk, 0.4));
          for (const w of pile) R.run(vanish(R, w, 0.4));
          yield* wait(0.3);
          yield* R.away(hk, dir * 4, 3);
        } else {
          // the cyber cop arrives on a bike; the hacker slips the knots and escapes dragging the desk
          const flee = hx > 0 ? 1 : -1, copBike = makeBike(rnd, makePerson(rnd, { kind: 'cop' }));
          B('6 the cyber cop arrives on a bike', [copBike]);
          cam.track(copBike, { hold: 3, lead: 2 });
          R.run((function* () {
            yield* R.enter(copBike, flee > 0 ? EX0 : EX1, hz + fz * 0.4);
            copBike.face(flee > 0 ? E : W);
            ctx.sfx('bell'); ctx.sfx('whistle');
            say(ctx, copBike, 'POLITIE CYBERCRIME!', { size: 14, color: '#7db8ff' });
          })());
          yield* wait(0.7);
          ln.visible = false; ln2.visible = false; h2.visible = false; h3.visible = false;
          v2.arms = v3.arms = 'swing';
          R.run(R.away(v2, -7, 4)); R.run(R.away(v3, 7, 4));
          R.give(ped);

          B('6b the phisher spots the law', [hk]);
          cam.crash(hk, { hold: 1.6 });
          yield* wait(0.3);
          hk.arms = 'up'; hk.heading = flee > 0 ? E : W; hk.lookAt = copBike;
          yield* doubleTake(ctx, hk, '!!');
          // the desk stays tied on: a last line drags it behind
          const tow = lineObj(R, '#b9fbc0');
          tow.visible = true;
          const dp = desk.position;
          const dragDesk = () => {
            const hxp = hk.g.position.x - flee * 2.3, hzp = hk.g.position.z;
            dp.x += (hxp - dp.x) * 0.25; dp.z += (hzp - dp.z) * 0.25;
            dp.y = 0.45 + Math.abs(Math.sin(hk.g.position.x * 2.2)) * 0.12;
            tow.aim(hk.g.position.x, 0.9, hk.g.position.z, dp.x, 0.6, dp.z);
          };
          ctx.wanted = hk;
          const caught = lv >= 4;
          B('6c the getaway: he runs dragging the desk', [hk, desk]);
          cam.track(hk, { hold: 4.5, lead: 3, dist: 9 });
          yield* wait(0.3);
          if (lv >= 5 && L.kind !== 'ped') R.run(R.police(flee, L.chaseZ, 11, 1.4));
          if (lv >= 4) R.run(R.cop(hk, 7, 0.8));
          hk.arms = 'swing'; hk.mood = 'scared';
          if (!caught) cackle(ctx, hk, 1.6, 'he');
          let spark = 0;
          const exitX = flee > 0 ? EX1 : EX0;
          const bikeRun = R.run((function* () { yield* wait(0.5); yield* go(ctx, copBike, exitX, copBike.g.position.z, caught ? 9.4 : 6.2); yield* R.out(copBike); })());
          yield* goEach(ctx, hk, exitX, hz, 7.3, (dt) => {
            dragDesk();
            spark -= dt;
            if (spark < 0) { spark = 0.09; ctx.fx.sparks(dp.x, 0.1, dp.z, 2); }
            if (caught && Math.abs(copBike.g.position.x - hk.g.position.x) < 1.6) return true;
          });
          if (caught) {
            B('6d busted: the bike catches the phisher', [hk, copBike]);
            cam.dutch([hk, copBike], { fit: true, dist: 7, hold: 1.8 });
            ctx.sfx('skid'); ctx.shake(0.2);
            cam.freeze(0.5, 0.08);
            R.stop(bikeRun);
            hk.arms = 'up'; hk.mood = 'shock'; hk.lookAt = copBike;
            say(ctx, hk, 'BUSTED!', { size: 24, color: '#7db8ff' });
            ctx.fx.burst(hk.g.position.x, 1.15, hk.g.position.z, { n: 12, colors: ['#ffd60a', '#fff'], speed: 5, up: 7, glow: true, size: [0.1, 0.18] });
            ctx.news('Cybercrime unit lands the big phish: one bike, one bell, one desk');
            yield* wait(0.8);
            B('6e the sulk', [hk]);
            cam.close(hk, { hold: 1.8 });
            yield* wait(0.3);
            hk.mood = 'sad'; hk.arms = 'cross'; hk.lookAt = null;
            ctx.sfx('womp');
            yield* wait(0.9);
            tow.visible = false;
            R.run(vanish(R, desk, 0.4));
            for (const w of pile) R.run(vanish(R, w, 0.4));
            R.run(R.away(copBike, flee * 6, 4));
            R.run(R.away(hk, flee * 4, 3.4));
          } else {
            B('6d clean away: still laughing', [hk]);
            ctx.news('Phisher escapes dragging his own desk. Laptop "still booting"');
            tow.visible = false;
            R.run(vanish(R, desk, 0.4));
            for (const w of pile) R.run(vanish(R, w, 0.4));
            yield* R.out(hk);
          }
        }
        B('7 the empty pavement', [hub]);
        cam.wide(hub, { dist: 26, hold: 2 });
        yield* R.settle(10);
        yield* wait(0.6);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
