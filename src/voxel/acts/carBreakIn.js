// Theft from a car
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

  const alarmLights = (x, z) => {
    const m = sculpt((v) => { for (const sx of [-2.0, 2.0]) for (const sz of [-0.85, 0.85]) v.box(sx, 0.6, sz, 0.22, 0.2, 0.3, '#ffb000'); }, MAT.glow); // lights at the corners of a 4.4 x 1.85 m car
    m.position.set(x, 0.001, z);
    return m;
  };
  /** Room along the kerb for the raid on this car: which way he walks, where he comes in from and where he runs off to. Null if there is none. */
  const breakPlan = (ctx, car) => once(car, 'plan', () => breakPlan0(ctx, car));
  function breakPlan0(ctx, car) {
    const z = ctx.L.hw + ctx.L.bw + 0.75, pref = car.x > 0 ? -1 : 1;
    let best = null;
    for (const dir of [pref, -pref]) {
      const e = S.runway(ctx, car.x, z, dir, 24, 0.6), b = S.runway(ctx, car.x, z, -dir, 15, 0.6), fwd = Math.abs(e - car.x), back = Math.abs(b - car.x);
      if (fwd < 8 || back < 6) continue;
      const sc = Math.min(fwd, 16) + Math.min(back, 15) + (dir === pref ? 3 : 0);
      if (!best || sc > best.sc) best = { dir, z, sc, edge: e, start: b };
    }
    return best;
  }

  return {
    w: [0, 0.6, 2.5, 2.5, 2], crime: 2, need: ['parked'],
    stage: { pave: { side: 'near', len: 14, depth: 1.2 }, anchor: 'parked', reach: 14 }, // the raid runs along the near pavement, past a row of parked cars
    avail: (ctx) => ctx.L.parked.some((c) => breakPlan(ctx, c)),
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'carBreakIn'), B = beatsFor(ctx, 'carBreakIn'), R = rig(ctx);
      const cars = L.parked.filter((c) => breakPlan(ctx, c));
      if (!cars.length) return;
      const ox = ctx.stage ? ctx.stage.x : 0; // read before the first yield
      const near = cars.slice().sort((p, q) => Math.abs(p.x - ox) - Math.abs(q.x - ox)).slice(0, 3); // the target is one of the cars nearest the stage's clear strip
      const car = rnd.pick(near);
      let done = false;
      try {
        const plan = breakPlan(ctx, car), dir = plan.dir, z = plan.z, edge = plan.edge;
        const carPt = pt(car.x, car.z), winPt = { x: car.x, z: car.z + 0.5, y: 1.2 };
        // the cars he will try first: those before the target, in his direction of travel
        const row = L.parked.filter((c) => c !== car && dir * (car.x - c.x) > 2.5 && dir * (car.x - c.x) < 13).sort((p, q) => dir * (p.x - q.x));
        const decoys = row.slice(-2);
        const thief = makePerson(rnd, { kind: rnd.chance(0.5) ? 'raccoon' : 'robber' });
        // the owner has been asleep in the back seat since before the scene: sitting low inside the car, hidden by its body
        const owner = makePerson(rnd, { shirt: rnd.pick(['#9d4edd', '#457b9d', '#e9c46a']) });
        const cap = item.nightcap(); cap.position.set(0, 0.62, 0); owner.head.add(cap);
        owner.air = true; owner.pose = 'sit'; owner.mood = 'sleepy';
        R.spawn(owner, car.x, car.z + 0.15, -0.4);
        owner.heading = 0; owner.g.visible = false; // (inside the car: nothing of him shows until he sits up)
        const alarm = (c, dur) => {
          const l = R.add(alarmLights(c.x, c.z));
          return R.run((function* () {
            let t = 0, beep = 0;
            while (t < dur) { const dt = yield; t += dt; beep -= dt; l.visible = Math.floor(t * 5) % 2 === 0; if (beep < 0) { ctx.sfx('alarm'); beep = 1.7; } }
            R.rm(l);
          })());
        };
        const handle = function* (c, tries, why) {
          yield* go(ctx, thief, c.x, z, 3.2);
          thief.heading = Math.PI; thief.gait = 'walk'; thief.arms = 'hold'; thief.mood = 'focus'; thief.lookAt = pt(c.x, c.z);
          yield* wait(0.25);
          for (let i = 0; i < tries; i++) { ctx.sfx('pop', 0.6); ctx.shake(0.04); thief.squash(0.1); yield* hop(thief, 0.08, 0.14); yield* wait(0.12); }
          if (why) say(ctx, thief, why, { size: 12, color: '#cfe8ff' });
        };

        // ---- 1. set-up: a quiet row of parked cars; one of them snores
        B('1 a quiet row of parked cars; one snores', [carPt]);
        const firstX = (decoys[0] || car).x, inX = dir > 0 ? Math.max(plan.start, firstX - dir * 6.5) : Math.min(plan.start, firstX - dir * 6.5); // (he comes in a few metres before the first car he will try)
        cam.wide(pt((firstX + car.x) / 2 - dir * 2, z), { dist: 15, el: 0.25 }); // (tight on the row: the frame's edge is a few metres away, so the thief is in the picture almost at once)
        const snore = R.run((function* () { for (;;) { ctx.sfx('zzz'); ctx.fx.text('Z', at(car.x, 2.3, car.z), { size: 15, color: '#cfe8ff', rise: 1.2, dur: 1.6 }); yield* wait(1.5); } })());
        yield* waitUntil(() => T.seen(ctx, inX, padZ(ctx, 'walkF0', inX)) && !T.seen(ctx, inX - dir * 16, padZ(ctx, 'walkF0', inX)), 2); // (the tight shot is up before he walks into it)
        const inZ = padZ(ctx, 'walkF0', inX);
        // (from the side he is heading away from, when the street's end on his own side is too far to come in from: then he is just walking along the row, in either direction)
        if (T.entryTime(ctx, thief, inX, inZ, { speed: 4.0, dir }) > 3.2) yield* R.enter(thief, firstX - dir * 3, padZ(ctx, 'walkF0', firstX - dir * 3), undefined, { speed: 4.0 });
        else yield* R.enter(thief, inX, inZ, undefined, { speed: 4.0, dir });

        // ---- 2. he tiptoes in along the row
        B('2 he tiptoes along the row of cars', [thief]);
        thief.gait = 'sneak';
        cam.track(thief, { dist: 10, el: 0.12, az: -dir * 0.5, lead: 2, cut: 0.8 });
        yield* wait(0.3);
        yield* tiptoe(ctx, thief, firstX - dir * 2.5, z, 2.9);

        // ---- 3. reveal
        B('3 reveal: the car thief grins at us', [thief]);
        thief.gait = 'walk'; thief.heading = 0; thief.lookAt = null; thief.mood = 'smug'; thief.arms = 'rub';
        cam.hero(thief, { dist: 5 });
        cam.card('DE KLINKENPOETSER', 'Tries every handle. Eternal optimist.', 2);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        yield* laugh(ctx, thief, 1.1, 'he');
        say(ctx, thief, 'hehehe', { size: 13, color: '#b9fbc0' });
        thief.arms = 'hold';

        // ---- 4. down the row: locked...
        thief.gait = 'sneak';
        if (decoys[0]) {
          const c = decoys[0], cp = pt(c.x, c.z);
          B('4 first car: locked', [thief, cp]);
          cam.ots(thief, cp, { dist: 6, cut: 0.4 });
          yield* handle(c, 3, 'op slot.');
          thief.mood = 'sad'; thief.arms = 'shrug'; thief.shakeT = 1;
          yield* wait(0.8);
          thief.arms = 'hold';
        }
        // ...and a car alarm
        if (decoys[1]) {
          const c = decoys[1], cp = pt(c.x, c.z);
          B('5 second car: the alarm goes off', [thief, cp]);
          cam.shot({ on: [thief, cp], fit: true, dist: 7, el: 0.1, az: 0.5, y: 0.8, cut: 0.4 });
          yield* handle(c, 2, null);
          ctx.sfx('alarm');
          const al = alarm(c, 1.9);
          ctx.fx.text('WEE-OO! WEE-OO!', at(c.x, 2.8, c.z), { size: 17, color: '#ff6b6b', dur: 1.8 });
          ctx.shake(0.15);
          thief.arms = 'up'; thief.lookAt = null;
          yield* fright(ctx, thief, 'AAH!');
          // act natural: whistle, hands behind the back, stare at nothing
          const watcher = takePed(ctx, 12, null, c.x + dir * 3);
          B('6 act natural: whistling, innocent', watcher ? [thief, watcher] : [thief]);
          if (watcher) { R.borrow(watcher); faceTo(watcher, c.x + dir * 3, z); watcher.arms = 'cross'; watcher.mood = 'sly'; watcher.lookAt = thief; cam.two(thief, watcher, { dist: 9, cut: 0.4 }); }
          else cam.close(thief, { cut: 0.4 });
          thief.arms = 'swing'; thief.gait = 'walk'; thief.mood = 'whistle';
          yield* wait(0.4);
          yield* go(ctx, thief, c.x + dir * 3, z, 2.0);
          thief.heading = 0.6; thief.lookAt = pt(c.x + dir * 3, z - 8);
          say(ctx, thief, '♪ ik doe niks ♪', { size: 12, color: '#b9fbc0' });
          if (watcher) { yield* wait(0.5); say(ctx, watcher, 'hm.', { size: 12, color: '#cfe8ff' }); watcher.nodT = 1; }
          yield* waitUntil(() => al.done, 2.5);
          ctx.sfx('bell');
          if (watcher) { watcher.lookAt = null; R.give(watcher); }
          thief.gait = 'sneak'; thief.mood = 'sly'; thief.lookAt = null;
        }

        // ---- 7. the right car: he leans in and hears something
        B('7 the right car: he peers in through the window', [thief, carPt]);
        cam.ots(thief, carPt, { dist: 6, cut: 0.4 });
        yield* go(ctx, thief, car.x, z, 3);
        thief.heading = Math.PI; thief.arms = 'sneak'; thief.lookAt = winPt; thief.mood = 'sly';
        yield* wait(0.5);
        thief.lookAt = null; thief.heading = 0; // hears something
        yield* doubleTake(ctx, thief, '?');
        thief.heading = Math.PI; thief.lookAt = winPt; thief.mood = 'smug';
        yield* wait(0.4);
        R.stop(snore);

        // ---- 8. the window goes
        B('8 the crowbar, the window, KRAK', [thief, winPt]);
        thief.hold(item.crowbar()); thief.arms = 'up';
        cam.shot({ on: [thief, winPt], fit: true, dist: 6.5, el: 0.05, az: 0.35, y: 0.9, cut: 0.3 });
        thief.squash(0.2);
        yield* wait(0.6);
        thief.arms = 'push';
        ctx.sfx('glass'); ctx.sfx('thud');
        ctx.fx.burst(car.x, 1.2, car.z + 0.95, { n: 26, colors: ['#bfe9ff', '#ffffff', '#8fd3f4', '#e8f7ff'], speed: 5, up: 5.5, size: [0.05, 0.13], life: [0.6, 1.1], glow: true });
        ctx.fx.text('KRAK!', at(car.x, 2.4, car.z), { size: 22, color: '#bfe9ff' });
        ctx.shake(0.2);
        cam.freeze(0.3);
        ctx.wanted = thief;
        ctx.incident(2);
        const bar = thief.drop();
        if (bar) { R.add(bar); bar.position.set(car.x + dir * 0.6, 0.05, z - 0.1); bar.rotation.set(0, 0.4, Math.PI / 2); }
        thief.lookAt = null; thief.arms = 'up'; thief.mood = 'happy';
        yield* wait(0.6);

        // ---- 9. loot comes out of the window, one piece at a time, and goes into the air
        const loot = [item.radio(), item.shoe(), item.wallet()];
        loot[0].scale.setScalar(1.6); loot[1].scale.setScalar(1.8); loot[2].scale.setScalar(1.8);
        B('9 radio, shoe and wallet fly out of the window', [thief, loot[0], loot[1], loot[2]]);
        cam.close(thief, { dist: 6, y: 1.3, cut: 0.3 });
        yield* wait(0.3);
        const held = [true, true, true];
        for (let i = 0; i < 3; i++) {
          const o = R.add(loot[i]);
          o.position.set(car.x + (i - 1) * 0.4, 1.25, car.z + 0.2);
          ctx.sfx(i === 1 ? 'pop' : 'yoink', 1.1);
          R.run(arc(o, car.x + (i - 1) * 0.4, 2.0, z, 0.5, 0.45));
          yield* wait(0.38);
        }
        let ph = 0;
        thief.arms = 'up';
        const jug = R.run((function* () {
          for (;;) {
            const dt = yield;
            ph += dt * 6.5;
            const tp = thief.g.position;
            loot.forEach((o, i) => { if (held[i]) o.position.set(tp.x + Math.cos(ph + (i * TAU) / 3) * 0.5, 1.95 + Math.sin(ph + (i * TAU) / 3) * 0.4, tp.z); });
          }
        })());
        say(ctx, thief, 'JA HOOR!', { size: 15, color: '#ffd60a' });
        ctx.news(`Car window on ${ctx.st.name} loses argument with ${thief.kind === 'raccoon' ? 'a raccoon' : 'man in stripes'}`);
        yield* laugh(ctx, thief, 1.0, 'he');

        // ---- 10. the owner has been in the back seat all along
        B('10 the owner sits up in the back seat', [thief, carPt]);
        cam.two(thief, carPt, { dist: 9, cut: 0.4 });
        yield* wait(0.4);
        owner.g.visible = true;
        yield* tween(0.35, (u) => { owner.g.position.y = lerp(-0.4, 0.1, ease.outBack(u)); }); // he sits bolt upright
        owner.heading = 0; owner.arms = 'up'; owner.mood = 'shock'; thief.lookAt = owner;
        ctx.sfx('gasp');
        yell(ctx, owner, 'AAAH!', '#ffffff', 18); yell(ctx, thief, 'AAAH!', '#ffffff', 18);
        thief.mood = 'scared';
        cam.freeze(0.5);
        yield* all(hop(thief, 0.7, 0.35), wait(0.35));
        yield* wait(0.2);

        B('11 the owner leaps out, furious', [owner, thief]);
        cam.crash(owner);
        owner.arms = 'fist'; owner.mood = 'angry';
        yield* wait(0.3);
        yield* arc(owner.g, car.x + dir * 0.9, 0, z + 0.4, 1.0, 0.45); // out through the broken window
        owner.air = false; owner.pose = null;
        owner.squash(0.25);
        yell(ctx, owner, rnd.pick(['IK SLAAP HIER!', 'MIJN AUTORADIO!', 'HÉ! IK LIGT TE SLAPEN!']), '#ff6b6b', 15);

        // ---- 12. the chase: loot juggling at full speed
        B('12 the chase: juggling loot at full speed', [thief, owner]);
        cam.track(thief, { lead: 3, fit: false, cut: 0.4 });
        thief.gait = 'walk'; thief.arms = 'up'; thief.lookAt = owner; thief.mood = 'scared';
        yield* wait(0.3);
        const oc = R.run(goEach(ctx, owner, edge, z + 0.4, 5));
        const cop = lv >= 4 ? makePerson(rnd, { kind: 'cop' }) : null;
        let stopped = false;
        if (cop) R.run((function* () { yield* wait(1.2); yield* R.enter(cop, edge, z); ctx.sfx('whistle'); say(ctx, cop, 'HALT!', { size: 15, color: '#7db8ff' }); cop.heading = dir > 0 ? W : E; cop.arms = 'stop'; cop.mood = 'angry'; yield* go(ctx, cop, edge - dir * 7, z, 4.6); stopped = true; })());
        if (lv >= 5) {
          R.panic(car.x, 14, 3);
          for (const c of row) R.run((function* () { yield* wait(rnd.range(0.2, 1.0)); alarm(c, 3); })());
          if (L.kind !== 'ped') R.run(R.police(dir, L.chaseZ, 11, 0.9));
        }
        let drop = 0, dropT = 1.0;
        yield* goEach(ctx, thief, edge, z, 6.8, (dt) => {
          thief.g.position.y = Math.abs(Math.sin(ph * 0.6)) * 0.12;
          dropT -= dt;
          if (dropT < 0 && drop < 3) {
            const i = drop++; dropT = 0.95;
            held[i] = false;
            const o = loot[i], tp = thief.g.position;
            ctx.sfx(i === 0 ? 'clatter' : 'pop', 0.8);
            say(ctx, thief, ['OEPS!', 'NEE NEE NEE', 'ACH...'][i], { size: 14, color: '#fff' });
            R.run(arc(o, tp.x - dir * rnd.range(1.5, 3), 0.1, tp.z + rnd.range(-0.2, 0.3), 1.3, 0.6, rnd.range(-5, 5)));
          }
          if (cop && stopped && Math.abs(thief.g.position.x - cop.g.position.x) < 2.2) return true;
        });
        R.stop(jug);
        thief.g.position.y = 0;
        for (let i = 0; i < 3; i++) held[i] = false;
        R.stop(oc);

        // ---- 13. comeuppance
        thief.lookAt = null;
        if (cop && Math.abs(thief.g.position.x - edge) > 1.5) {
          B('13 busted: the cop steps out with the cuffs', [thief, cop]);
          cam.dutch([thief, cop], { dist: 7, fit: true, az: dir * 0.2, cut: 0.2 });
          yield* wait(0.3);
          ctx.sfx('skid'); ctx.shake(0.2);
          yield* fright(ctx, thief, null);
          thief.arms = 'up';
          say(ctx, thief, 'BUSTED!', { size: 24, color: '#7db8ff' });
          ctx.fx.burst(thief.g.position.x, 1.15, z, { n: 12, colors: ['#ffd60a', '#fff'], speed: 5, up: 7, glow: true, size: [0.1, 0.18] });
          cam.freeze(0.5);
          yield* wait(0.5);
          cop.hold(item.cuffs()); cop.arms = 'hold'; cop.mood = 'smug';
          faceTo(cop, thief.g.position.x, z); cop.lookAt = thief;
          cam.close(thief, { cut: 0.3 });
          thief.mood = 'sad'; thief.arms = 'beg';
          ctx.sfx('cuff');
          yield* wait(1.2);
        } else {
          B('13 clean away: the thief gloats', [thief]);
          thief.arms = 'swing';
          cam.hero(thief, { dist: 5, cut: 0.4 });
          yield* wait(0.4);
          thief.heading = 0; thief.mood = 'smug';
          yield* laugh(ctx, thief, 1.3, 'he');
          say(ctx, thief, '...', { size: 14, color: '#cfe8ff' });
          yield* wait(0.3);
        }

        // ---- 14. the owner, panting, collects his things
        B('14 the owner collects his things, one by one', [owner, loot[0], loot[1], loot[2]]);
        owner.mood = 'sad'; owner.arms = 'swing';
        cam.track(owner, { dist: 8, el: 0.14, lead: 1.5, cut: 0.5 });
        const rest = loot.slice().sort((p, q) => Math.abs(p.position.x - owner.g.position.x) - Math.abs(q.position.x - owner.g.position.x));
        for (const o of rest) {
          yield* go(ctx, owner, o.position.x, o.position.z + 0.3, 6);
          owner.squash(0.2); owner.heading = 0;
          R.rm(o);
          ctx.sfx('coin');
          const mine = owner.hold(o === loot[0] ? item.radio() : o === loot[1] ? item.shoe() : item.wallet());
          mine.scale.setScalar(1.3);
          owner.arms = 'hold'; owner.mood = 'happy';
          if (o === loot[0]) say(ctx, owner, 'MIJN RADIO!', { size: 14, color: '#b9fbc0' });
          yield* wait(0.35);
        }
        yield* wait(0.3);
        owner.arms = 'swing'; owner.mood = 'sleepy';
        yield* go(ctx, owner, car.x, z, 6);
        owner.heading = Math.PI;
        B('15 back to bed: yawn, and the car snores again', [owner, carPt]);
        cam.low(carPt, { dist: 8, cut: 0.5 });
        say(ctx, owner, '*geeuw*', { size: 13, color: '#cfe8ff' });
        yield* wait(0.8);
        // back in through the broken window and down into the seat, where the body hides him again
        owner.air = true;
        const ox0 = owner.g.position.x, oz0 = owner.g.position.z;
        owner.pose = 'sit';
        yield* tween(0.5, (u) => { owner.g.position.set(lerp(ox0, car.x, u), lerp(0, 0.1, Math.sin(u * Math.PI)) + lerp(0, -0.4, u), lerp(oz0, car.z + 0.15, u)); });
        R.gone(owner);
        ctx.sfx('zzz');
        ctx.fx.text('Z', at(car.x, 2.3, car.z), { size: 18, color: '#cfe8ff', rise: 1.4, dur: 1.8 });
        thief.arms = 'swing'; thief.mood = 'sad';
        R.run(R.away(thief, dir * 6, cop ? 3.4 : 6));
        if (cop) { R.discard(cop); cop.lookAt = null; cop.arms = 'swing'; R.run(R.away(cop, dir * 6, 3.4)); }
        yield* wait(0.6);
        cam.wide(pt(car.x, z), { dist: 20 });
        yield* wait(1.4); // (the payoff has landed: the camera lets go and the rig walks the thief off)
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
