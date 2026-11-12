// The chase that goes round and round: a robber with a swag bag, then a cop, a dog, a chef and a second cop, each of whom joins the
// line for a reason you can see, until nobody knows who is chasing whom. Two passes along one pavement, the turn out of frame.
// Storyboard: storyboards/bennyHill.md. Every B(...) below is one beat of it, with who must be on screen.
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
  const { entryTime, seen, watching, outPoint, extraKind } = T;

  const PAIR = { walkF1: 'walkF0', walkF0: 'walkF1', walkB0: 'walkB1', walkB1: 'walkB0' };
  /** A pavement line with 20 m or more of open ground along it (and the other lane of that pavement for the way back). */
  const lines = (ctx) => once(ctx, 'bennyLine', () => {
    const out = [];
    for (const nm of ['walkF1', 'walkB0', 'walkF0', 'walkB1']) {
      let best = null;
      for (const x0 of [0, 3, -3, 6, -6]) {
        const z = padZ(ctx, nm, x0);
        if (!S.clearSpot(ctx, x0, z, 0.45)) continue;
        const lo = S.runway(ctx, x0, z, -1, 24, 0.45), hi = S.runway(ctx, x0, z, 1, 24, 0.45);
        if (hi - lo >= 20 && (!best || hi - lo > best.hi - best.lo)) best = { nm, z, lo, hi };
      }
      if (best) out.push(best);
    }
    return out;
  });

  /** Wait until the shot that was just asked for is really up (the point is in the picture): entrances are only made in view after that. */
  const shotUp = function* (ctx, x, z, y = 1) { yield* waitUntil(() => seen(ctx, x, z, y), 2); yield* wait(0.2); };

  return {
    w: [0, 0, 0, 1, 2.5], crime: 1,
    stage: { pave: { side: 'any', len: 20, depth: 2 } },
    avail: (ctx) => lines(ctx).length > 0,
    *run(ctx) {
      const { L, rnd } = ctx, cam = camFor(ctx, 'bennyHill'), B = beatsFor(ctx, 'bennyHill'), R = rig(ctx);
      const stg = ctx.stage; // read before the first yield
      const opts = lines(ctx).slice();
      if (!opts.length) return;
      if (stg && stg.side) opts.sort((a, b) => (Math.sign(a.z) === (stg.side === 'near' ? 1 : -1) ? 0 : 1) - (Math.sign(b.z) === (stg.side === 'near' ? 1 : -1) ? 0 : 1));
      const ln = opts[0], d = rnd.sign();                      // d: the way they run in the first pass
      const loE = Math.max(ln.lo, EX0), hiE = Math.min(ln.hi, EX1), half = Math.min(11, (hiE - loE) / 2 - 0.5);  // about 22 m of it: enough for two passes and the joins
      const mid0 = clamp(stg && stg.x != null ? stg.x : 0, loE + half, hiE - half);
      const zA = ln.z, xNear = mid0 - d * half, xFar = mid0 + d * half;
      const zO = padZ(ctx, PAIR[ln.nm], (xNear + xFar) / 2);   // the other lane of the pavement: the way back
      const span = xFar - xNear, at1 = (u) => xNear + span * u;
      const hx = at1(0.42), heapPt = pt(hx, zO);                // where the pile-up happens (second pass)
      const V = 5.0, GAP = 1.7;
      const heap = { n: 0, rob: false, go: false };
      let done = false;
      try {
        const rob = makePerson(rnd, { kind: 'robber' }), cop1 = makePerson(rnd, { kind: 'cop' }), dog = makeDog(rnd);
        const chef = makePerson(rnd, { kind: 'chef' }), cop2 = makePerson(rnd, { kind: 'cop' });
        const chain = [rob];                                    // the line as it is now, head first
        const tail = () => chain[chain.length - 1];
        // each runner chases the one in front of it, which keeps the gap and takes the way round whatever is in the road
        const follow = (m, leader, sp = V * 1.04) => R.run((function* () {
          m.lookAt = null;
          while (!heap.go && m.alive && leader.alive) yield* chase(ctx, m, leader, sp, GAP, 0.4);
        })());
        const join = (m) => { const l = tail(); chain.push(m); return follow(m, l); };

        // the dog is already dozing by the kerb when the scene starts; the chef's door (a real one, if the street has one) is ahead on the way back
        const dogAt = S.findSpot(ctx, at1(0.3), zA + (zA > 0 ? -0.8 : 0.8), 0.4, 8) || { x: at1(0.3), z: zA };
        const dogX = dogAt.x;
        // whoever is already standing at the spot only appears at once while that point is out of the picture; in view they walk in
        const arrive = (m, x, z, dirIn) => {
          if (watching(ctx) && seen(ctx, x, z, 1)) return R.run(R.enter(m, x, z, undefined, { speed: 3.2, dir: dirIn }));
          R.spawn(m, x, z); return { done: true };
        };
        const dogArr = arrive(dog, dogAt.x, dogAt.z, -d);
        dog.face(d > 0 ? W : E);
        const doors = S.housesNear(ctx, at1(0.62), 6, { door: true }).filter((h) => h.door && S.clearSpot(ctx, h.door.x, zO, 0.4, { ground: 'open' }));
        const door = doors.length ? doors[0] : null;
        const chefX = door ? door.door.x : at1(0.62), cop2X = at1(0.45);
        const zone = pt(at1(0.55), zO);
        // the second cop is already there too, off the line of both passes, watching (stroopwafel in hand); without a door the chef is as well
        const aside = (zO > zA ? 1 : -1) * 1.1;
        const cop2At = S.findSpot(ctx, cop2X, zO + aside, 0.4, 8) || S.findSpot(ctx, cop2X, zA - aside, 0.4, 8);
        const hasCop2 = !!cop2At;
        if (hasCop2) { arrive(cop2, cop2At.x, cop2At.z, d); cop2.face(d > 0 ? W : E); cop2.hold(item.wafel()); cop2.arms = 'hold'; cop2.mood = 'happy'; }
        const chefAt = door ? null : (S.findSpot(ctx, chefX, zO + aside, 0.4, 8) || S.findSpot(ctx, chefX, zA - aside, 0.4, 8));
        if (chefAt) { arrive(chef, chefAt.x, chefAt.z, d); chef.face(d > 0 ? W : E); }

        // ---- 1. the robber bursts in with the swag bag, laughing, and a cop is right behind him
        B('1 the robber runs in with the bag, a cop on his heels', [pt(at1(0.3), zA)]);
        cam.wide(pt(at1(0.3), zA), { dist: 14, el: 0.25, az: -d * 0.3 });
        shoulder(rob, item.moneybag(1.2));
        rob.mood = 'happy'; rob.lookAt = cop1;
        cop1.mood = 'angry'; cop1.arms = 'swing';
        chef.hold(item.broom()); chef.arms = 'fist';
        ctx.wanted = rob;
        yield* shotUp(ctx, at1(0.3), zA);
        const laugher = R.run((function* () { for (;;) { yield* laugh(ctx, rob, 1.6, 'he'); yield* wait(0.5); } })());
        const trail = R.run(noteTrail(ctx, rob, 0.16)), dust = R.run(runDust(ctx, rob));
        const robRun = R.run((function* () {
          yield* R.enter(rob, xNear, zA, undefined, { speed: V, dir: d });
          yield* go(ctx, rob, xFar, zA, V);
        })());
        R.run((function* () {
          yield* wait(1.2);
          ctx.sfx('whistle');
          yield* R.enter(cop1, xNear, zA, undefined, { speed: V * 1.2, dir: d });
          chain.push(cop1);
          say(ctx, cop1, 'STOP!', { size: 15, color: '#7db8ff' });
          follow(cop1, rob, V * 1.3);
        })());
        ctx.incident(1);
        ctx.news('Chase enters third lap; nobody remembers who is chasing whom');
        // the dog dozes until the cop has gone by, then it wakes, wonders, and falls in behind him
        let dogIn = false;
        R.run((function* () {
          yield* waitUntil(() => dogArr.done, 6);
          yield* waitUntil(() => cop1.alive && chain.includes(cop1) && d * (cop1.g.position.x - dogX) > -1.6, 10);
          ctx.sfx('bark');
          say(ctx, dog, 'WOEF?', { size: 16, color: '#fff', off: 1.0 });
          dog.mood = 'happy'; yield* hop(dog, 0.3, 0.2);
          dog.speed = V; dogIn = true;
          join(dog);
          say(ctx, dog, 'WOEF WOEF!', { size: 14, color: '#fff', off: 1.0 });
        })());
        yield* waitUntil(() => dogIn, 9);
        yield* wait(1.4);

        // ---- 2. the reveal: close on the laughing robber, hand-held
        B('2 reveal: the robber laughs over his shoulder, bag and all', [rob]);
        cam.close(rob, { dist: 6.5, y: 1.55, el: 0.06, lead: 1.2, shake: 0.8, fov: 34, cut: 0.4 });
        cam.card('DE ACHTERVOLGING', 'Everyone chases someone. Nobody knows who.', 2.1);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(1.0);
        yield* waitUntil(() => robRun.done, 8); // (the close-up stays on him until he has run the whole first pass)

        // ---- 3. round again: out of the frame at the far end, and back on the other lane of the pavement. A chef and a cop are waiting up the street.
        B('3 round again: the line comes back along the other lane; up the street a chef steps out and a cop strolls in', [zone]);
        cam.shot({ on: zone, dist: 13, el: 0.22, az: d * 0.2, cut: 0.6 });
        const robBack = R.run((function* () {
          yield* waitUntil(() => robRun.done, 14);
          yield* go(ctx, rob, xFar, zO, V * 0.92);
          yield* go(ctx, rob, hx, zO, V * 0.92);
          rob.moving = 0; // stop dead
          ctx.sfx('skid'); ctx.fx.dust(hx, 0, zO, -d * 2, 0, 6);
          rob.lookAt = null; rob.mood = 'shock';
          heap.rob = true;
        })());
        const chefIn = R.run((function* () {
          if (door) yield* R.enter(chef, door.door.x, door.door.z, 0.001, { from: 'door' });
          else if (!chefAt) yield* R.enter(chef, chefX, zO, undefined, { speed: 3.2, dir: -d });
          chef.arms = 'fist'; chef.mood = 'neutral';
          chef.lookAt = { x: chefX + d * 6, z: zO };
        })());
        if (hasCop2) { cop2.lookAt = { x: cop2X + d * 6, z: zO }; }
        yield* waitUntil(() => chefIn.done, 6);
        yield* wait(0.4);
        // the line is heard coming back: the chef sees it first and joins
        yield* waitUntil(() => robRun.done && d * (rob.g.position.x - chefX) < 5, 12);
        chef.lookAt = rob; chef.mood = 'shock';
        yield* waitUntil(() => d * (tail().g.position.x - chefX) < 0.9, 8);
        say(ctx, chef, 'WAAR RENNEN WE HEEN?', { size: 13, color: '#ffd166' });
        ctx.sfx('hey');
        chef.mood = 'angry';
        join(chef);
        // ...and the second cop, who stood aside and watched the whole line go by, falls in at the back
        if (hasCop2) {
          yield* waitUntil(() => d * (tail().g.position.x - cop2.g.position.x) < 0.9, 8);
          cop2.lookAt = tail(); cop2.drop();
          say(ctx, cop2, 'HÈ?! PAK HEM!', { size: 14, color: '#7db8ff' });
          ctx.sfx('whistle');
          cop2.arms = 'point'; cop2.mood = 'angry';
          join(cop2);
        }
        yield* wait(0.6);

        // ---- 4. the stop: the robber halts dead and steps aside, the others pile into each other
        yield* waitUntil(() => heap.rob, 10);
        B('4 the stop: the robber steps aside and the rest pile into each other', [heapPt]);
        heap.go = true;
        R.stop(laugher); R.stop(trail); R.stop(dust);
        const sdz = [1, -1].find((sg) => S.clearSpot(ctx, hx, zO + sg * 1.5, 0.45, { ground: 'open' })) || 0;
        R.run((function* () { yield* tween(0.16, (u) => { rob.g.position.z = zO + sdz * 1.5 * u; }); rob.heading = Math.atan2(-d, 0); rob.arms = 'bag'; rob.mood = 'smug'; })());
        cam.dutch([heapPt, tail()], { dist: 9, az: d * 0.35, el: 0.18, y: 0.8, fit: true, cut: 0.5 });
        const crashers = chain.slice(1);
        for (const m of crashers) {
          R.run((function* () {
            yield* goEach(ctx, m, hx, zO, V * 1.05, () => Math.hypot(m.g.position.x - hx, m.g.position.z - zO) < 1.0);
            const k = ++heap.n;
            ctx.sfx('bonk');
            if (k === 1) { ctx.shake(0.4); ctx.fx.text('BOEM!', at(hx, 2.9, zO), { size: 34, color: '#ffd60a' }); cam.freeze(0.4); }
            ctx.fx.pips(hx, 1.7, zO, 6);
            yield* tumble(ctx, m, hx + rnd.range(-0.15, 0.15), zO + rnd.range(-0.15, 0.15));
            m.g.position.y += (k - 1) * 0.2; // the heap grows
            R.run(seeStars(ctx, m, 2.4));
          })());
        }
        yield* waitUntil(() => heap.n >= crashers.length, 9);
        ctx.fx.dust(hx, 0, zO, 0, 0, 10);
        yield* wait(0.8);

        // ---- 5. the tiptoe: finger to lips, away the way they came, and then the laugh
        B('5 the tiptoe: away, finger to lips, then a laugh', [rob]);
        cam.track(rob, { dist: 8, el: 0.12, az: -d * 0.4, lead: 1.4, fov: 34, cut: 0.6 });
        rob.lookAt = heapPt; rob.mood = 'sly'; rob.arms = 'stop';
        say(ctx, rob, 'ssst...', { size: 14, color: '#cfe8ff' });
        yield* wait(0.6);
        rob.lookAt = null;
        const ex = clamp(hx + d * 7, EX0, EX1);
        yield* tiptoe(ctx, rob, ex, rob.g.position.z, 2.7);
        rob.heading = 0; rob.mood = 'happy';
        yield* laugh(ctx, rob, 1.2, 'he');

        // ---- 6. the heap wakes, points, and sets off after him; the dog now has the bag
        B('6 the heap wakes: the dog takes the bag (or they all run the wrong way)', [rob, dog]);
        cam.wide(pt(hx + d * 3, zO), { dist: 20, el: 0.3, az: -d * 0.3, fit: true, cut: 0.6 });
        crashers.forEach((m, i) => R.run((function* () {
          yield* wait(i * 0.25);
          yield* getUp(m, 'angry');
          m.lookAt = rob; m.arms = 'point';
          say(ctx, m, rnd.pick(['DAAR!', 'PAK HEM!', 'HÈ!']), { size: 14, color: '#ff6b6b' });
          ctx.sfx('hey');
        })()));
        const lost = flip(ctx, 'lost', 0.4);
        let order;
        if (lost) {
          // ...but they run off the wrong way and nobody notices: the robber keeps the bag, tiptoes out and laughs all the way
          rob.lookAt = null; rob.mood = 'happy'; rob.arms = 'bag';
          R.run((function* () { yield* wait(0.8); yield* laugh(ctx, rob, 1.0, 'he'); yield* R.leave(rob, 4.2, d > 0 ? EX1 : EX0); })());
          order = crashers;
        } else {
          // the dog hops down, trots over and takes the bag right off his shoulder
          dog.air = false; dog.g.position.y = 0;
          yield* go(ctx, dog, rob.g.position.x - d * 1.2, rob.g.position.z, 7.5);
          const bag2 = item.moneybag(0.6);
          bag2.position.set(0, 0.5, 0.75);
          ctx.sfx('yoink');
          rob.drop();
          dog.b.add(bag2);
          rob.arms = 'swing'; rob.mood = 'shock'; rob.lookAt = dog;
          yield* hop(dog, 0.4, 0.25);
          yield* doubleTake(ctx, rob, 'MIJN TAS!');
          rob.lookAt = null; rob.mood = 'angry';
          order = [dog, rob, ...crashers.filter((m) => m !== dog)];
        }
        // and off they go again: the other way round, the dog first and each one behind the one in front (or, when lost, out the wrong end)
        heap.go = false;
        const outRun = (m, leader, i) => R.run((function* () {
          yield* wait(i * 0.3);
          m.lookAt = null; m.arms = m === chef ? 'fist' : 'swing';
          if (leader) yield* chase(ctx, m, leader, 6.2, GAP, 1.0);
          yield* R.leave(m, i === 0 ? 8 : 6.2, lost ? (d > 0 ? EX0 : EX1) : (d > 0 ? EX1 : EX0));
        })());
        order.forEach((m, i) => outRun(m, order[i - 1] || null, i));
        yield* wait(1.2);
        B('6b they run off, the dog in the lead', [dog]);
        cam.track(dog, { dist: 9, el: 0.12, az: -d * 0.5, lead: 2, fov: 34, cut: 0.5 });
        yield* wait(1.2);
        yield* R.settle(9);
        yield* wait(0.3);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
