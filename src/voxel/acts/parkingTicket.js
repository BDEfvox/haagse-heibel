// The parking fine: a warden writes the ticket of a lifetime; the owner arrives one second too late and makes it worse.
// Storyboard: storyboards/parkingTicket.md. Every B(...) below is one beat of it, with who must be on screen.
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

  /** A parking slip, big enough to read (a red stripe makes it look official). */
  const slip = () => {
    const t = item.ticket();
    t.add(sculpt((v) => v.box(-0.07, 0.02, -0.1, 0.14, 0.012, 0.05, '#d62828')));
    t.scale.setScalar(1.8);
    return t;
  };

  return {
    w: [0, 2, 2, 1, 0], crime: 1,
    avail: (ctx) => ctx.L.parked.length > 0,
    *run(ctx) {
      const { L, rnd } = ctx, cam = camFor(ctx, 'parkingTicket'), B = beatsFor(ctx, 'parkingTicket'), R = rig(ctx);
      const car = rnd.pick(L.parked), cop = makePerson(rnd, { kind: 'cop' });
      let res = null, done = false;
      try {
        const z = L.hw + L.bw + 0.75;
        // who owns the car: somebody from the nearest real door, or (no door in reach) a walker who spots the cop
        res = resident(ctx, R, car.x, { kind: rnd.pick(['civ', 'granny']) }, { allow: ['door', 'passerby'], at: { x: car.x, z } }); // (the owner is the one who is laughed at: never one of the district's extras)
        const wd = Math.abs(car.x) < 11 ? (flip(ctx, 'wd', 0.5) ? 1 : -1) : (car.x > 0 ? 1 : -1); // the way the warden strolls (either way when the car is in the middle, else towards the nearer end)
        const tx = car.x + 1.05, screen = { x: tx, y: 0.97, z: car.z }; // the windscreen end of the 4.4 m car
        const carPt = pt(car.x, car.z);
        const toCar = Math.atan2(0, car.z - z);               // heading from the pavement to the car

        // ---- 1. the patrol: pad in hand, peering at windscreens, checking his watch
        B('1 the patrol: the warden strolls along the cars', [cop, carPt]);
        cam.wide(carPt, { dist: 10, el: 0.22, az: -wd * 0.08 }); // (tight on the car: the frame's edge is a few metres away, so the warden is in the picture almost at once)
        cop.hold(item.pad()); cop.arms = 'write'; cop.gait = 'strut'; cop.mood = 'focus'; // (the pad is in his hand from the first step)
        yield* waitUntil(() => T.seen(ctx, tx - wd * 3.4, z) && !T.seen(ctx, tx - wd * 3.4 - wd * 15, z), 2); // (the tight shot is up before anybody walks into it)
        yield* R.enter(cop, clamp(tx - wd * 3.4, EX0, EX1), z, undefined, { from: 'edge', speed: 4.2 });
        cam.track(cop, { dist: 8, el: 0.1, az: wd * 0.5, lead: 2, cut: 0.9 });
        cop.heading = toCar; cop.lookAt = screen;
        say(ctx, cop, 'hmm...', { size: 13, color: '#cfe8ff' });
        cop.nodT = 0.9;
        yield* wait(0.7);
        cop.arms = 'phone'; cop.lookAt = null; cop.heading = toCar - wd * 0.7; // checks his watch
        say(ctx, cop, '*tik tik*', { size: 12, color: '#cfe8ff' });
        yield* wait(0.6);
        cop.arms = 'write'; cop.heading = toCar; cop.lookAt = screen; cop.mood = 'sly';
        yield* go(ctx, cop, tx - wd * 0.7, z, 2.4);
        cop.heading = toCar;

        // ---- 2. reveal
        B('2 reveal: smug look to camera, pen clicked', [cop]);
        cop.lookAt = null; cop.heading = 0; cop.mood = 'smug'; cop.gait = 'walk';
        cam.hero(cop);
        cam.card('DE BOA', 'Gives you a ticket for being right there.', 2.1);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(0.5);
        ctx.sfx('tick');
        say(ctx, cop, '*klik*', { size: 15, color: '#ffe066' });
        cop.squash(0.12);
        yield* wait(0.9);

        // ---- 3. the ticket: a flourish, a tear, a slap under the wiper
        B('3 the ticket: written, torn off and slapped on the windscreen', [cop, screen]);
        cam.shot({ on: [cop, screen], y: 0.95, dist: 7, el: 0.03, az: wd * 0.5, fov: 38, fit: true, cut: 0.8 });
        cop.heading = toCar; cop.mood = 'focus';
        yield* wait(0.3);
        for (let i = 0; i < 3; i++) { ctx.sfx('typing'); cop.squash(0.06); yield* wait(0.3); }
        ctx.sfx('swish');
        say(ctx, cop, '*ritsj*', { size: 14, color: '#fff' });
        const t = R.add(slip());
        const cp = cop.g.position;
        t.position.set(cp.x + wd * 0.2, 1.1, cp.z + 0.2);
        const ticketAt = { x: screen.x, y: 1.02, z: screen.z };
        const a0 = t.position.clone();
        yield* tween(0.2, (u) => { t.position.set(a0.x, a0.y + u * 0.4, a0.z); t.rotation.y = u * 1.0; }); // held up for a second
        cop.arms = 'push';
        yield* tween(0.35, (u) => {
          t.position.set(lerp(a0.x, ticketAt.x, u), lerp(a0.y + 0.4, ticketAt.y, u) + Math.sin(u * Math.PI) * 0.3, lerp(a0.z, ticketAt.z, u));
          t.rotation.x = u * 0.6; t.rotation.y = 1.0 + u * 1.2;
        });
        ctx.sfx('slam'); ctx.shake(0.12); cop.squash(0.2);
        ctx.fx.dust(ticketAt.x, 1.0, ticketAt.z, 0, 0, 4);
        yield* wait(0.2);
        ctx.sfx('kaching');
        ctx.fx.text('BON! €109', at(tx, 2.5, car.z), { size: 24, color: '#ffe066' });
        ctx.fx.cash(tx, 1.4, car.z, 5, 2, 3);
        ctx.incident(1);
        ctx.news('Parking fine issued. Motorist "was only gone for a minute"');
        cop.arms = 'hips'; cop.mood = 'smug';
        yield* wait(1.0);

        // ---- 4. the owner bursts out and skids to a stop
        let owner = res.second; // (a passer-by who is borrowed from the crowd replaces him inside rush)
        const spot = { x: tx + wd * 1.5, z: z + 0.05 };
        if (res.doorway) {
          // the cause is seen: the real door of the house opens and the owner bursts out of the dark, looking for his car
          const dp = pt(res.doorway.out.x, res.doorway.z);
          B('4 the owner: the front door flies open', [dp]);
          cam.shot({ on: dp, y: 1.1, dist: 7.5, el: 0.06, az: -wd * 0.3, fov: 36, cut: 0.9 });
          R.run(res.rush('NEEE! IK STA ER NET!', () => spot, { speed: 6.4, size: 14 }));
          yield* wait(1.5);
        } else {
          B('4 the owner: NEEE! IK STA ER NET!', [res.second]);
          cam.dolly(carPt, { dist: 12, el: 0.18, az: -wd * 0.4, cut: 0.8 });
          R.run(res.rush('NEEE! IK STA ER NET!', () => spot, { speed: 6.4, size: 14 }));
          yield* wait(0.7);
        }
        owner = res.second;
        B('4b the owner runs for his car', [owner]);
        cam.track(owner, { dist: 8, el: 0.1, az: -wd * 0.5, lead: 2 });
        yield* R.settle(8);
        owner.heading = Math.atan2(-wd, 0);
        cop.lookAt = owner; cop.arms = 'cross'; cop.mood = 'smug';
        ctx.sfx('skid'); owner.squash(0.35);
        ctx.fx.dust(owner.g.position.x, 0, owner.g.position.z, wd, 0, 8);
        cam.crash(owner, { dist: 4.5 });
        owner.mood = 'shock';
        yield* wait(0.9);

        // ---- 5. the plea: hands together, the watch, the slow no, the knees
        B('5 the plea: owner begs, warden shakes his head', [owner, cop]);
        cam.orbit([owner, cop], { fit: true, dist: 7, el: 0.1 });
        owner.lookAt = cop; owner.arms = 'beg'; owner.mood = 'sad';
        cop.heading = Math.atan2(wd, 0);
        say(ctx, owner, 'alsjeblieft...', { size: 14, color: '#fff' });
        yield* wait(1.0);
        owner.arms = 'point'; owner.heading = Math.atan2(-wd, 0);
        say(ctx, owner, 'MAAR HET IS 1 MINUUT!', { size: 13, color: '#ffd60a' });
        owner.shakeT = 0.6;
        yield* wait(0.9);
        cop.arms = 'cross'; cop.shakeT = 1.6; cop.mood = 'smug';
        say(ctx, cop, 'nee.', { size: 16, color: '#7db8ff' });
        yield* wait(1.2);
        owner.arms = 'beg'; owner.mood = 'sad';
        ctx.sfx('womp');
        owner.squash(0.2);
        owner.pose = 'crouch'; // down on his knees
        say(ctx, owner, '*SNIK*', { size: 14, color: '#9ad0ff' });
        yield* wait(0.9);

        // ---- 6. the second ticket; he faints
        B('6 the second ticket: the owner faints flat on his back', [cop, owner]);
        cam.dutch([cop, owner], { fit: true, dist: 7, az: wd * 0.3 });
        cop.lookAt = owner; cop.mood = 'sly';
        yield* wait(0.3);
        cop.arms = 'write';
        yield* wait(0.2);
        for (let i = 0; i < 3; i++) { ctx.sfx('typing'); yield* wait(0.25); }
        say(ctx, cop, 'voetpad geblokkeerd', { size: 13, color: '#cfe8ff' });
        yield* wait(0.5);
        const t2 = R.add(slip());
        const c2 = cop.g.position, op = owner.g.position;
        t2.position.set(c2.x - wd * 0.1, 1.0, c2.z);
        ctx.sfx('swish');
        cop.arms = 'push';
        const b0 = t2.position.clone();
        yield* tween(0.45, (u) => {
          t2.position.set(lerp(b0.x, op.x, u), lerp(b0.y, 0.9, u) + Math.sin(u * Math.PI) * 0.5, lerp(b0.z, op.z, u));
          t2.rotation.y = u * 5; t2.rotation.x = u * 0.5;
        });
        ctx.sfx('kaching');
        ctx.fx.text('BON #2! €109', at(op.x, 2.2, op.z), { size: 22, color: '#ffe066' });
        owner.arms = 'up'; owner.mood = 'shock';
        yield* wait(0.4);
        ctx.sfx('gasp');
        yield* wait(0.3);
        // out cold: backwards, flat; the slip flutters down onto his chest
        cam.ground(owner, { dist: 5, el: 0.0, az: wd * 0.3, y: 0.3, cut: 0.7 });
        B('6b the owner lies flat out', [owner]);
        owner.pose = null; owner.air = true; owner.mood = 'dizzy'; owner.arms = 'swing';
        owner.g.rotation.order = 'YXZ';
        const ox = op.x, oz = op.z;
        yield* tween(0.5, (u) => { owner.g.rotation.x = -u * (Math.PI / 2); op.y = 0.2 * u; }, ease.inQuad);
        ctx.sfx('thud'); ctx.shake(0.2);
        ctx.fx.dust(ox, 0, oz, 0, 0, 7);
        ctx.fx.pips(ox, 0.7, oz, 6);
        const t2a = t2.position.clone();
        yield* tween(0.7, (u) => {
          t2.position.set(lerp(t2a.x, ox, u) + Math.sin(u * 9) * 0.1, lerp(t2a.y, 0.45, u), lerp(t2a.z, oz + wd * 0, u));
          t2.rotation.y += 0.1; t2.rotation.x = 0.1;
        });
        yield* wait(0.9);

        // ---- 7. epilogue
        B('7 epilogue: warden strolls off whistling, the owner sits up with both tickets', [cop, owner]);
        cam.wide(pt(tx + wd * 0.8, z), { dist: 11, el: 0.28, az: wd * 0.1 });
        cop.lookAt = null; cop.arms = 'swing'; cop.gait = 'strut'; cop.mood = 'whistle';
        ctx.sfx('whistle');
        say(ctx, cop, '*fluit fluit*', { size: 13, color: '#7db8ff' });
        R.run(R.away(cop, wd * 9, 2.6));
        yield* wait(1.0);
        // the owner sits up; the wind brings him the first ticket too
        R.rm(t2);
        owner.g.rotation.x = 0; owner.g.rotation.order = 'XYZ';
        owner.pose = 'sit'; op.y = 0.23; owner.mood = 'sad'; owner.arms = 'swing';
        owner.hold(slip(), 'handL');
        ctx.sfx('womp');
        yield* wait(0.5);
        const t1 = t;
        const q0 = t1.position.clone();
        yield* tween(0.8, (u) => {
          t1.position.set(lerp(q0.x, op.x, u), lerp(q0.y, 0.9, u) + Math.sin(u * Math.PI) * 0.6, lerp(q0.z, op.z, u));
          t1.rotation.y += 0.25;
        });
        R.rm(t1);
        owner.hold(slip());
        owner.arms = 'hold';
        say(ctx, owner, '*zucht*', { size: 15, color: '#cfe8ff' });
        owner.nodT = 0.8;
        yield* wait(1.6);
        // the payoff has landed: the camera lets go and the rig walks both of them off
        done = true;
      } finally {
        cam.release();
        if (res) res.cleanup();
        R.free(done);
      }
    },
  };
}
