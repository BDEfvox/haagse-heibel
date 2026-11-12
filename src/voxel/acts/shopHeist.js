// Shoplifting: the cart of goodies. Storyboard: storyboards/shopHeist.md; every B(...) below is one beat of it.
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
  const { doorway } = T;

  const gateProp = () => piece((v, gl) => {
    for (const sx of [-0.8, 0.8]) { v.box(sx, 0, 0, 0.12, 2.1, 0.12, '#cfd8dc'); gl.box(sx, 2.1, 0, 0.18, 0.16, 0.18, '#ff2d2d'); } // 2.1 m: taller than a 2 m person
    v.box(0, 2.1, 0, 1.72, 0.06, 0.12, '#b0bec5');
  }, 21);
  const cartProp = () => sculpt((v) => {
    v.box(0, 0.28, 0, 1.0, 0.05, 0.62, '#9aa5ad');
    v.box(0, 0.3, 0.3, 1.0, 0.4, 0.04, '#b8c2c9'); v.box(0, 0.3, -0.3, 1.0, 0.4, 0.04, '#b8c2c9');
    v.box(-0.5, 0.3, 0, 0.04, 0.4, 0.62, '#b8c2c9'); v.box(0.5, 0.3, 0, 0.04, 0.4, 0.62, '#b8c2c9');
    v.box(0, 0.78, -0.4, 0.9, 0.05, 0.05, '#d62828');
    v.box(-0.42, 0.28, -0.4, 0.05, 0.5, 0.05, '#9aa5ad'); v.box(0.42, 0.28, -0.4, 0.05, 0.5, 0.05, '#9aa5ad');
    for (const sx of [-0.4, 0.4]) for (const sz of [-0.25, 0.25]) v.box(sx, 0, sz, 0.1, 0.24, 0.1, '#1c1c1c');
  });

  /** Shops with a real door and room along the pavement for the getaway; each with the direction the cart runs. */
  const heistShops = (ctx) => once(ctx, 'heist', () => heistShops0(ctx));
  function heistShops0(ctx) {
    const out = [];
    for (const s of S.housesNear(ctx, 0, 24, { door: true, shop: true, tower: false })) {
      if (s.shop === 'BANK' || !s.leaf) continue; // (a shop unit with a real, modelled door)
      const dzr = s.door.z, cz = Math.min(dzr + 1.3, padZ(ctx, 'walkB1', s.door.x)), want = s.x > 0 ? -1 : 1;
      const a = S.runway(ctx, s.door.x, cz, want, 14, 0.7), b = S.runway(ctx, s.door.x, cz, -want, 14, 0.7);
      const la = Math.abs(a - s.door.x), lb = Math.abs(b - s.door.x);
      if (la >= 9 && (la >= lb || lb < 9)) out.push({ s, dir: want, edge: a, cz });
      else if (lb >= 9) out.push({ s, dir: -want, edge: b, cz });
    }
    return out;
  }

  return {
    w: [0, 0, 0, 3, 2], crime: 2,
    avail: (ctx) => heistShops(ctx).length > 0,
    stage: { pave: { side: 'far', len: 10, depth: 1.2 }, anchor: 'shop', reach: 10 },
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'shopHeist'), R = rig(ctx), spots = heistShops(ctx);
      if (!spots.length) return;
      const sx0 = ctx.stage ? ctx.stage.x : 0; // (read before the first yield)
      const pickd = rnd.pick(spots.slice().sort((p, q) => Math.abs(p.s.door.x - sx0) - Math.abs(q.s.door.x - sx0)).slice(0, 2)), s = pickd.s;
      let done = false;
      try {
        const dw = doorway(ctx, R, s); // the shop's real door: it opens on a dark doorway, the leaf is the door's own colour
        const dir = pickd.dir, hd = dir > 0 ? E : W;
        const dx = s.door.x, dzr = s.door.z, gz = dzr + 0.55, cz = pickd.cz, cx = clamp(dx + dir * 2.0, EX0 + 1, EX1 - 1);
        const door = pt(dx, dzr + 0.6), edge = pickd.edge;
        const rob = makePerson(rnd, { kind: 'robber' }), keeper = makePerson(rnd, { kind: 'chef' });
        const gate = R.add(gateProp());
        gate.position.set(dx, 0.001, gz);
        const cart = R.add(cartProp());
        cart.position.set(cx, 0.001, cz); cart.rotation.y = hd;
        const stack = []; // loot standing on the cart: [mesh, local x, local y]
        let sway = 0, swayOn = true, ang = 0, t = 0;
        R.run((function* () {
          while (swayOn) {
            const dt = yield;
            t += dt;
            ang = sway * Math.sin(t * 6.5);
            const cp = cart.position;
            for (const [m, lx, ly] of stack) {
              m.position.set(cp.x + lx * Math.cos(ang) + ly * Math.sin(ang), cp.y + 0.3 + ly * Math.cos(ang), cp.z);
              m.rotation.z = -ang;
            }
          }
        })());
        const addLoot = (m, ly) => { R.add(m); stack.push([m, rnd.range(-0.12, 0.12), ly]); m.position.set(cart.position.x, 0.6 + ly, cart.position.z); sway = 0.012 * stack.length * stack.length; };

        const B = beatsFor(ctx, 'shopHeist');

        // ---- 1. set-up: the shopkeeper sweeps the pavement, back half turned
        B('1 sweeping: the shopkeeper sweeps in front of his shop', [keeper, door]);
        cam.wide(door, { dist: 13, el: 0.25, y: 1.7, az: -dir * 0.25 }); // (the shop's own sign in the picture: 2.7 m up; tight, so the frame's edge is a few metres away)
        const sweep = R.run((function* () {
          yield* R.enter(keeper, dx, dzr);
          keeper.hold(item.broom());
          keeper.mood = 'happy';
          yield* go(ctx, keeper, dx - dir * 2.3, cz + 0.5, 2.4);
          keeper.arms = 'spray'; keeper.heading = 0;
          say(ctx, keeper, '*veeg veeg*', { size: 12, color: '#cfe8ff' });
          for (;;) { yield* tween(1.2, (u) => { keeper.g.position.x = dx - dir * (2.3 + 0.5 * Math.sin(u * Math.PI * 2)); }); }
        })());
        yield* wait(1.2);
        B('1b casing: the customer tiptoes up to the cart', [rob]);
        const rx0 = clamp(dx - dir * 8, EX0, EX1);
        yield* waitUntil(() => T.seen(ctx, rx0, padZ(ctx, 'walkB1', rx0)) && !T.seen(ctx, dx - dir * 19, padZ(ctx, 'walkB1', rx0)), 1.5); // (the tight shot is up before he walks into it)
        yield* R.enter(rob, rx0, padZ(ctx, 'walkB1', rx0), undefined, { from: 'edge', speed: 4.4 });
        cam.track(rob, { dist: 9.5, el: 0.14, az: dir * 0.5, lead: 1.5, cut: 1.0 });
        yield* tiptoe(ctx, rob, cx - dir * 1.4, cz, 3.0);
        rob.heading = 0; rob.mood = 'sly';
        yield* lookAround(rob, 0.8, 0.28);

        // ---- 2. reveal
        B('2 reveal: the customer grins at us', [rob]);
        rob.heading = 0; rob.mood = 'smug'; rob.arms = 'rub';
        cam.hero(rob, { dist: 6 });
        cam.card('DE KLANT', 'Always right. Never pays.', 1.9);
        cam.freeze(0.7);
        ctx.sfx('sting');
        say(ctx, rob, 'ik kijk alleen', { size: 12, color: '#b9fbc0' });
        yield* wait(0.5);
        yield* laugh(ctx, rob, 1.0, 'he');
        rob.arms = 'swing';

        // ---- 3. the spree: each trip into the shop, back with something bigger on the cart
        // in through the real shop door (it is open for the whole spree), a rummage behind the wall, and out again
        const doorWalk = function* (inside = null) {
          rob.arms = 'swing'; rob.mood = 'sly';
          yield* go(ctx, rob, dx, gz + 0.1, 4);
          yield* go(ctx, rob, dw.out.x, dw.out.z, 3);
          yield* dw.passIn(rob, 2.2);
          ctx.fx.text('*rommel*', at(dx, 2.3, dzr), { size: 14, color: '#ffe08a', dur: 0.8 }); // he is in there, ransacking: we hear it
          if (inside) yield* inside();
          yield* wait(0.55);
        };
        let doorHeld = false;
        const outAgain = function* () { yield* dw.passOut(rob, 2.0); };
        for (let i = 0; i < 2; i++) {
          if (i === 0) {
            B('3 the spree: first trip into the shop, out with a box', [rob, door, cart]);
            cam.shot({ on: [rob, door, cart], dist: 11, el: 0.4, az: -dir * 0.3, fit: true });
          } else {
            B('3b second trip: bigger box, the pile grows', [rob, cart]);
            cam.dolly([rob, cart], { dist: 8, el: 0.2, az: dir * 0.35, fit: true });
          }
          yield* wait(0.3);
          if (!doorHeld) { doorHeld = true; yield* dw.open(); }
          yield* doorWalk();
          const m = lootBox(i + 1);
          m.scale.setScalar(1.3);
          rob.hold(m, 'front'); rob.arms = 'carry'; rob.mood = 'smug';
          yield* outAgain();
          yield* go(ctx, rob, cx - dir * 0.8, cz, 4);
          rob.drop();
          ctx.sfx('yoink', 1.2);
          say(ctx, rob, ['YOINK', 'EN DIT!'][i], { size: 14, color: '#ffd60a' });
          addLoot(m, 0.15 + stack.length * 0.34);
          rob.arms = 'rub';
          rob.squash(0.12);
          yield* hop(rob, 0.12, 0.15);
          yield* wait(0.3);
        }
        ctx.incident(2);
        ctx.news(`Television leaves ${s.shop} without paying`);
        B('3c the pile: the tower of goods wobbles, he gloats', [rob, cart]);
        cam.ground(cart, { dist: 6.5, el: 0.08, az: -dir * 0.5 });
        rob.lookAt = keeper;
        yield* wait(0.3);
        yield* laugh(ctx, rob, 1.0, 'he');
        rob.lookAt = null; rob.arms = 'swing';

        // ---- 4. the television, with its security tag still on
        B('4 the television walks out: the gate lights up', [rob, gate]);
        const tv = item.tv();
        tv.scale.setScalar(1.25);
        yield* doorWalk(function* () {
          cam.shot({ on: [door, gate], y: 1.0, dist: 7.5, el: 0.12, az: -dir * 0.4, fit: true });
          yield* wait(0.3);
        });
        rob.hold(tv, 'front'); rob.arms = 'carry'; rob.mood = 'smug';
        ctx.wanted = rob;
        yield* outAgain();
        yield* go(ctx, rob, dx, gz + 0.9, 2.2);
        B('4b the beep: frozen in the light of the gate', [rob, gate]);
        cam.crash(rob);
        yield* wait(0.3);
        ctx.sfx('alarm');
        ctx.fx.text('PIEP! PIEP! PIEP!', at(dx, 2.5, gz), { size: 18, color: '#ff6b6b', dur: 1.8 });
        ctx.shake(0.15);
        const gblink = R.run((function* () { let u = 0; for (;;) { u += yield; gate.children[1].visible = Math.floor(u * 6) % 2 === 0; } })());
        rob.moving = 0; rob.mood = 'scared'; rob.lookAt = pt(dx, gz);
        yield* wait(0.9); // frozen mid-step, tension

        // ---- 5. complication: the shopkeeper turns round, very slowly
        B('5 niks aan de hand: the shopkeeper turns round, very slowly', [keeper, rob]);
        cam.two(keeper, rob, { az: -dir * 0.2, el: 0.12 });
        yield* wait(0.3);
        rob.lookAt = null; rob.mood = 'sly';
        yield* lookAround(rob, 0.9, 0.3);
        say(ctx, rob, '...niks aan de hand', { size: 12, color: '#b9fbc0' });
        R.stop(sweep);
        keeper.heading = hd;
        yield* wait(0.6);
        keeper.heading = Math.atan2(rob.g.position.x - keeper.g.position.x, 3);
        keeper.lookAt = rob; keeper.mood = 'shock';
        B('5b the keeper sees it', [keeper]);
        cam.crash(keeper);
        yield* wait(0.3);
        yield* doubleTake(ctx, keeper, 'HÈ?!');
        keeper.arms = 'fist'; keeper.mood = 'angry';
        yell(ctx, keeper, 'DIEF! HOUD HEM TEGEN!', '#ff6b6b', 14);
        rob.lookAt = keeper; rob.mood = 'scared';
        yield* wait(0.4);
        B('5c bystanders gasp, one films it', [rob, keeper, door]);
        cam.wide([rob, keeper], { dist: 13, el: 0.25, az: dir * 0.2, fit: true });
        yield* wait(0.3);
        const crowd = gather(ctx, R, dx, 2, 14);
        crowd.forEach((c, i) => { if (i) { faceTo(c, dx, gz); c.arms = 'up'; c.mood = 'shock'; say(ctx, c, 'OEI!', { size: 13, color: '#fff' }); } else filmIt(c, dx, gz); });
        // the television goes on top of the pile; he grabs the cart and runs
        B('5d the grab: the TV goes on the pile, he takes the cart', [rob, cart]);
        cam.shot({ on: [rob, cart], dist: 9, el: 0.25, az: -dir * 0.4, fit: true });
        yield* wait(0.3);
        rob.drop();
        addLoot(tv, 0.15 + stack.length * 0.34 + 0.1);
        ctx.sfx('yoink');
        rob.mood = 'sly';
        yield* go(ctx, rob, cx - dir * 1.2, cz + 0.05, 4.5);

        // ---- 6. the getaway: a shopping cart with a leaning tower of goods, dropping things as it goes
        B('6 the getaway: the tower sways, a box works loose', [rob, cart]);
        cam.track(rob, { dist: 10, el: 0.14, az: dir * 0.55, fov: 34, shake: 0.4, lead: 3 });
        rob.arms = 'carry'; rob.heading = hd; rob.lookAt = keeper; rob.mood = 'happy';
        const chaseT = R.run(chase(ctx, keeper, rob, 5.6, 0.9, 12));
        cackle(ctx, rob, 1.4, 'he');
        let spill = 0, spillT = 0.5, cut = false;
        const x0 = rob.g.position.x;
        yield* goEach(ctx, rob, edge, cz, 6.4, (dt) => {
          const rp = rob.g.position;
          cart.position.set(rp.x + dir * 1.15, 0.001, rp.z); cart.rotation.y = rob.heading;
          sway = Math.min(0.5, sway + dt * 0.12);
          spillT -= dt;
          if (spillT < 0 && spill < 1 && stack.length >= 3) { // one box works loose from the middle of the pile
            spill++;
            const [m] = stack.splice(1, 1)[0];
            ctx.sfx('clatter');
            R.run(arc(m, rp.x - dir * 2, 0.05, cz + 0.5, 1.4, 0.6, 5));
            rob.mood = 'shock';
            say(ctx, rob, 'OEPS', { size: 13, color: '#fff' });
          }
          const trav = Math.abs(rp.x - x0);
          if (!cut && trav > 4.4) { // the shot changes well before the pile comes down
            cut = true;
            B('7 the crash: the whole tower comes down', [rob, cart]);
            cam.dutch([rob, cart], { dist: 9, az: dir * 0.4, fit: true });
          }
          if (trav > 7.5) return true;
        });
        R.stop(chaseT);
        rob.lookAt = null;
        R.run(go(ctx, keeper, rob.g.position.x - dir * 2.6, cz, 6.5));
        ctx.sfx('slam'); ctx.shake(0.5);
        cam.freeze(0.6);
        swayOn = false;
        R.stop(gblink);
        // the avalanche
        const rp = rob.g.position;
        stack.forEach(([m], i) => {
          R.run(arc(m, rp.x + rnd.range(-3, 3) * (i + 1) * 0.5, 0.05, cz + rnd.range(-1.2, 1.2), rnd.range(1.5, 3), rnd.range(0.7, 1.1), rnd.range(-8, 8)));
          m.rotation.z = 0;
        });
        ctx.fx.puff(rp.x, 0.2, cz);
        R.panic(rp.x, 12, 3);
        ctx.fx.sparks(rp.x + dir, 0.6, cz, 10);
        ctx.fx.text('KLETTER-KLETTER-BOEM!', at(rp.x, 2.5, cz), { size: 20, color: '#ffd60a' });
        ctx.fx.cash(rp.x, 1.15, cz, 10, 3, 5);
        ctx.sfx('clatter'); ctx.sfx('thud');
        R.run(tween(0.6, (u) => { cart.rotation.z = (dir > 0 ? -1 : 1) * 1.4 * ease.outQuad(u); cart.position.y = 0.3 * u; }));
        yield* tumble(ctx, rob, rp.x + dir * 1.4, cz + 0.1, 1.0, 0.6);
        // one box lands on his head
        const hat = lootBox(5); hat.scale.setScalar(1.1);
        rob.hold(hat, 'head');
        ctx.sfx('bonk');
        say(ctx, rob, '★ ★', { size: 16, color: '#ffe066', dur: 1 });

        B('7b stars: a box on his head', [rob]);
        cam.close(rob, { dist: 4.5 });
        yield* wait(0.3);
        R.run(seeStars(ctx, rob, 1.2));
        yield* wait(0.9);

        // ---- 8. comeuppance: the law, and the broom
        ctx.news(`Shoplifter's cart of goodies collapses on ${ctx.st.name}; shopkeeper "swept up before the police arrived"`);
        const cop = makePerson(rnd, { kind: 'cop' });
        B('8 the law arrives: POLITIE, the keeper stands over him', [cop, rob, keeper]);
        cam.wide([rob, keeper], { dist: 14, el: 0.22, az: -dir * 0.2, fit: true });
        yield* wait(0.3);
        yield* R.enter(cop, clamp(rp.x - dir * 9, EX0, EX1), cz, undefined, { from: 'edge' });
        ctx.sfx('whistle');
        cop.arms = 'stop'; cop.mood = 'angry';
        say(ctx, cop, 'POLITIE! BLIJF ZITTEN!', { size: 14, color: '#7db8ff' });
        if (lv >= 5) {
          if (L.kind !== 'ped') R.run(R.police(dir, L.chaseZ, 11, 0.3));
          R.run(R.cop(rob, 6, 0.5, 'DIT IS DE POLITIE!'));
        }
        yield* go(ctx, cop, rp.x - dir * 1.4, cz, 7);
        cop.heading = hd; cop.arms = 'hips';
        yield* waitUntil(() => Math.abs(keeper.g.position.x - (rp.x - dir * 2.6)) < 0.3, 3);

        // reverse spree: the shopkeeper sweeps all the goods back to the door
        B('9 uitverkoop: the broom sweeps the goods back into the shop', [keeper, door]);
        cam.shot({ on: [keeper, door], y: 1.2, dist: 12, el: 0.3, az: dir * 0.3, fit: true });
        yield* wait(0.3);
        keeper.arms = 'spray'; keeper.lookAt = null; keeper.mood = 'smug';
        ctx.sfx('whoosh');
        ctx.fx.text('UITVERKOOP!', at(dx, 3.4, dzr), { size: 22, color: '#ffd60a', dur: 2 });
        for (const [m] of stack) R.run((function* () { const g1 = dw.at(0, -0.7); yield* wait(rnd.range(0, 0.5)); yield* arc(m, g1.x, 0.8, g1.z, 1.2, 0.9, 5); R.rm(m); })()); // (into the dark doorway: gone behind the wall, not on the doorstep)
        yield* wait(1.1);

        B('9b the bill: the keeper presents it', [keeper, rob]);
        cam.two(keeper, rob, { az: dir * 0.2, el: 0.1 });
        yield* wait(0.3);
        keeper.arms = 'point';
        yell(ctx, keeper, 'DAT IS DAN €1.249,95!', '#ffd166', 13);
        rob.drop();
        yield* wait(0.5);
        B('9c contant?: a very small voice', [rob]);
        cam.face(rob);
        yield* wait(0.3);
        rob.arms = 'beg'; rob.mood = 'sad'; rob.lookAt = keeper;
        say(ctx, rob, 'contant?', { size: 12, color: '#cfe8ff' });
        ctx.sfx('womp');
        yield* wait(0.9);
        yield* getUp(rob, 'sad');
        rob.arms = 'up'; rob.lookAt = null;

        // the broom escorts him out
        B('10 the broom escorts him out', [rob, cop, keeper]);
        cam.wide([rob, cop, keeper], { dist: 14, el: 0.2, az: dir * 0.25, fit: true });
        yield* wait(0.3);
        keeper.arms = 'push';
        for (const c of crowd) R.give(c);
        R.run(R.away(cop, dir * 6, 3.6));
        yield* wait(0.3);
        R.run(R.away(rob, dir * 6, 3.6));
        R.run(R.out(keeper));
        // the cart is wheeled back into the shop through its door (it disappears behind the wall, not in thin air)
        R.run((function* () {
          const cp = cart.position, c0 = { x: cp.x, z: cp.z }, inn = dw.at(0, -0.9), mid = dw.at(0, 0.7);
          yield* tween(0.9, (u) => { cp.x = lerp(c0.x, mid.x, u); cp.z = lerp(c0.z, mid.z, u); cart.rotation.y = lerp(cart.rotation.y, dw.heading + Math.PI, u); });
          yield* tween(0.5, (u) => { cp.x = lerp(mid.x, inn.x, u); cp.z = lerp(mid.z, inn.z, u); });
          R.rm(cart);
        })());
        cam.wide(door, { dist: 14, el: 0.25, az: 0.05 });
        R.stop(gblink); gate.children[1].visible = true;
        yield* wait(1.8); // (the payoff has landed: the camera lets go; the rig walks the cast off and shuts the shop door)
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
