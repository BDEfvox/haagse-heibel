// The chase that goes round and round: a robber with a swag bag, two cops, a dog and a chef, until nobody knows who is chasing whom.
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

  /** The chase loop of bennyHill for one running direction, as points; ok when every leg is open ground. */
  const bennyLoop = (ctx, dir) => once(ctx, 'benny' + dir, () => bennyLoop0(ctx, dir));
  function bennyLoop0(ctx, dir) {
    const a = dir > 0 ? EX0 : EX1, b = dir > 0 ? EX1 - 1.5 : EX0 + 1.5, a6 = a + dir * 6, b1 = b + dir * 1;
    const pts = [[a, padZ(ctx, 'walkF1', a)], [b, padZ(ctx, 'walkF1', b)], [b, padZ(ctx, 'walkB1', b)], [a6, padZ(ctx, 'walkB1', a6)], [a6, padZ(ctx, 'walkF0', a6)], [b1, padZ(ctx, 'walkF0', b1)]];
    let ok = true;
    for (let i = 1; i < pts.length && ok; i++) ok = S.lineClear(ctx, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    return { pts, ok, a };
  }

  return {
    w: [0, 0, 0, 1, 2.5], crime: 1,
    avail: (ctx) => bennyLoop(ctx, 1).ok || bennyLoop(ctx, -1).ok, // needs both pavements and the road between them open
    *run(ctx) {
      const { L, rnd } = ctx, cam = camFor(ctx, 'bennyHill'), B = beatsFor(ctx, 'bennyHill'), R = rig(ctx);
      let dir = rnd.sign(), lp = bennyLoop(ctx, dir);
      if (!lp.ok) { dir = -dir; lp = bennyLoop(ctx, dir); }
      if (!lp.ok) return;
      const [p0, p1, p2, p3] = lp.pts, a = lp.a, md = -dir; // md: the way they run along the far pavement
      const hx = lerp(p2[0], p3[0], 0.62), hz = padZ(ctx, 'walkB1', hx), hPt = pt(hx, hz); // where the pile-up happens
      const sa = Math.sign(L.chaseZ - hz) || 1; // the road side of the far pavement
      const V = 6.6, VD = 10.5, GAP = 1.75, heap = { n: 0 };
      let done = false;
      try {
        const rob = makePerson(rnd, { kind: 'robber' }), cop1 = makePerson(rnd, { kind: 'cop' }), dog = makeDog(rnd);
        const chef = makePerson(rnd, { kind: 'chef' }), cop2 = makePerson(rnd, { kind: 'cop' });
        const cast = [rob, cop1, dog, chef, cop2], chasers = [cop1, chef, cop2];

        // ---- 1. the parade: they appear in single file, the whole line from high up
        B('1 the parade: the whole line, single file', cast);
        for (let i = 0; i < cast.length; i++) {
          const x = a + dir * (9 - i * GAP);
          R.spawn(cast[i], x, padZ(ctx, 'walkF1', x));
          cast[i].g.scale.setScalar(0.001);
          cast[i].heading = Math.atan2(dir, 0);
        }
        cam.high(cast, { fit: true, el: 0.7, az: -dir * 0.3, hold: 3.4 });
        yield* all(...cast.map((m) => popIn(ctx, m)));
        const bag = shoulder(rob, item.moneybag(1.2));
        rob.mood = 'happy';
        chef.hold(item.broom()); chef.arms = 'fist'; chef.mood = 'angry';
        for (const c of [cop1, cop2]) { c.mood = 'angry'; c.arms = 'swing'; }
        ctx.wanted = rob;
        ctx.incident(1);
        ctx.news('Chase enters third lap; nobody remembers who is chasing whom');
        ctx.sfx('whistle');
        say(ctx, cop1, 'STOP!', { size: 15, color: '#7db8ff' });
        yield* wait(0.5);

        // everybody off, in order, along the first pavement
        const laugher = R.run((function* () { for (;;) { yield* laugh(ctx, rob, 1.6, 'he'); yield* wait(0.5); } })());
        const trail = R.run(noteTrail(ctx, rob, 0.16)), dust = R.run(runDust(ctx, rob));
        const barks = R.run((function* () { for (;;) { yield* wait(rnd.range(1.0, 1.8)); say(ctx, dog, 'WOEF!', { size: 14, color: '#fff', off: 1.0 }); ctx.sfx('bark'); } })());
        rob.lookAt = cop1;
        const runner = (m, speed1, speed2) => R.run((function* () {
          yield* go(ctx, m, p1[0], p1[1], speed1);
          yield* go(ctx, m, p2[0], p2[1], speed2);
        })());
        runner(cop1, V, V); runner(chef, V, V); runner(cop2, V, V);
        // the dog gets bored of third place on the way over the road
        R.run((function* () {
          yield* go(ctx, dog, p1[0], p1[1], V);
          yield* go(ctx, dog, p2[0], p2[1], VD);
          yield* go(ctx, dog, hx + md * 7, hz, VD);
          dog.heading = Math.atan2(-md, 0);
          yield* waitUntil(() => heap.n >= 2, 12);
          ctx.sfx('bark');
          yield* go(ctx, dog, hx - md * 0.9, hz, 9.5);
          dog.air = true;
          ctx.sfx('bark');
          say(ctx, dog, 'WOEF!', { size: 18, color: '#fff', off: 1.0 });
          const d0 = dog.g.position.clone();
          yield* tween(0.35, (u) => { dog.g.position.set(lerp(d0.x, hx, u), 0.95 * u + Math.sin(u * Math.PI) * 0.6, lerp(d0.z, hz, u)); });
          dog.g.position.y = 0.95;
          dog.squash(0.2);
          ctx.fx.pips(hx, 1.5, hz, 4);
          heap.n++;
        })());
        // the robber's own path: stops dead at the pile-up spot
        const robPath = R.run((function* () {
          yield* go(ctx, rob, p1[0], p1[1], V);
          yield* go(ctx, rob, p2[0], p2[1], V);
          yield* go(ctx, rob, hx, hz, V);
          // stop dead
          rob.moving = 0;
          ctx.sfx('skid'); ctx.fx.dust(hx, 0, hz, md * 2, 0, 6);
          rob.lookAt = null; rob.mood = 'shock';
          yield* tween(0.16, (u) => { rob.g.position.z = hz + sa * 1.6 * u; });
          rob.heading = Math.atan2(0, -md);
          rob.arms = 'bag'; rob.mood = 'smug';
          heap.rob = true;
        })());

        // ---- 2. the reveal: close on the laughing robber, hand-held
        B('2 reveal: the robber laughs over his shoulder, bag and all', [rob]);
        yield* wait(2.0);
        cam.close(rob, { dist: 6.5, y: 1.55, el: 0.06, lead: 1.2, shake: 0.8, fov: 34, cut: 0.4, hold: 5 });
        cam.card('DE ACHTERVOLGING', 'Everyone chases someone. Nobody knows who.', 2.1);
        cam.freeze(0.7);
        ctx.sfx('sting');
        yield* wait(2.4);

        // ---- 3. round again: across the road and back along the far pavement, the dog now leads
        yield* waitUntil(() => Math.abs(rob.g.position.x - p1[0]) < 9, 6);
        B('3 round again: across the road, the dog now leads', cast);
        cam.top(cast, { fit: true, dist: 30, az: 0, cut: 0.5, hold: 5 });
        yield* waitUntil(() => Math.abs(rob.g.position.z - hz) < 1.2 && Math.abs(rob.g.position.x - hx) < 8, 8);

        // ---- 4. the stop: the robber halts and steps aside, the others pile in
        B('4 the stop: the robber steps aside and the rest pile into each other', [hPt, cop1, chef, cop2]);
        R.stop(laugher); R.stop(trail); R.stop(dust); R.stop(barks);
        cam.dutch([hPt, cop1, chef], { dist: 9, az: dir * 0.35, el: 0.18, y: 0.8, fit: true, cut: 0.5, hold: 3.2 });
        for (let i = 0; i < chasers.length; i++) {
          const m = chasers[i];
          R.run((function* () {
            yield* goEach(ctx, m, hx, hz, V, () => Math.hypot(m.g.position.x - hx, m.g.position.z - hz) < 1.0);
            const k = ++heap.n;
            ctx.sfx('bonk');
            if (k === 1) { ctx.shake(0.4); ctx.fx.text('BOEM!', at(hx, 2.9, hz), { size: 34, color: '#ffd60a' }); cam.freeze(0.4); }
            ctx.fx.pips(hx, 1.7, hz, 6);
            yield* tumble(ctx, m, hx + rnd.range(-0.15, 0.15), hz + rnd.range(-0.15, 0.15));
            m.g.position.y += (k - 1) * 0.22; // the heap grows
            R.run(seeStars(ctx, m, 2.4));
          })());
        }
        yield* waitUntil(() => heap.n >= 4 && heap.rob, 8);
        ctx.fx.dust(hx, 0, hz, 0, 0, 10);
        yield* wait(0.8);

        // ---- 5. the tiptoe: finger to lips, away the other way, and then the laugh
        B('5 the tiptoe: away, finger to lips, then a laugh', [rob]);
        cam.track(rob, { dist: 8, el: 0.12, az: -dir * 0.4, lead: 1.4, fov: 34, cut: 0.6, hold: 6 });
        rob.lookAt = hPt; rob.mood = 'sly'; rob.arms = 'stop';
        say(ctx, rob, 'ssst...', { size: 14, color: '#cfe8ff' });
        yield* wait(0.6);
        rob.lookAt = null;
        const ex = clamp(hx - md * 8, EX0, EX1);
        yield* tiptoe(ctx, rob, ex, rob.g.position.z, 2.7);
        rob.heading = 0; rob.mood = 'happy';
        yield* laugh(ctx, rob, 1.3, 'he');

        // ---- 6. the heap wakes, points, and sets off after him; the dog now has the bag
        B('6 the heap wakes: the line again, reversed, the dog carrying the bag', cast);
        cam.wide(cast, { dist: 24, el: 0.3, az: -dir * 0.3, fit: true, cut: 0.6, hold: 8 });
        const bEnd = p1[0], zEnd = (i) => padZ(ctx, 'walkB1', bEnd) + i * 0.3;
        chasers.forEach((m, i) => R.run((function* () {
          yield* wait(i * 0.25);
          yield* getUp(m, 'angry');
          m.lookAt = rob; m.arms = 'point';
          say(ctx, m, rnd.pick(['DAAR!', 'PAK HEM!', 'HÈ!']), { size: 14, color: '#ff6b6b' });
          ctx.sfx('hey');
        })()));
        // the dog hops down, trots over and takes the bag right off his shoulder
        dog.air = false;
        dog.g.position.y = 0;
        yield* go(ctx, dog, rob.g.position.x - md * 1.2, rob.g.position.z, 7.5);
        const bag2 = item.moneybag(0.6);
        bag2.position.set(0, 0.5, 0.75);
        ctx.sfx('yoink');
        rob.drop();
        dog.b.add(bag2);
        rob.arms = 'swing'; rob.mood = 'shock'; rob.lookAt = dog;
        yield* hop(dog, 0.4, 0.25);
        yield* doubleTake(ctx, rob, 'MIJN TAS!');
        rob.lookAt = null; rob.mood = 'angry';
        // and off they go again, the other way round
        const outG = function* (m, delay, x, z, sp) { yield* wait(delay); m.lookAt = null; m.arms = m === chef ? 'fist' : 'swing'; yield* go(ctx, m, x, z, sp); yield* R.out(m); };
        R.run(outG(dog, 0, bEnd, zEnd(0), 8));
        R.run(outG(rob, 0.3, bEnd, zEnd(1), 6.6));
        for (let i = 0; i < chasers.length; i++) R.run(outG(chasers[i], 0.55 + i * 0.25, bEnd, zEnd(2 + i), 6.4));
        yield* wait(1.5);
        cam.track(dog, { dist: 9, el: 0.12, az: -dir * 0.5, lead: 2, fov: 34, cut: 0.5, hold: 4 });
        yield* wait(0.5);
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
