// Fights and threats: the scuffle. Two ordinary strangers, one pavement, a cause the viewer SEES, a dust cloud and a granny who backed a draw.
// Storyboard: storyboards/scuffle.md. Every B(...) below is one beat of it, with who must be on screen.
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
  const { entryTime, seen, watching, extraKind, outPoint } = T;

  /** Places on the pavement with room for the two walkers, the ring of onlookers and the dust cloud. */
  const scuffleSpots = (ctx) => once(ctx, 'scuffle', () => scuffleSpots0(ctx));
  function scuffleSpots0(ctx) {
    const out = [];
    for (const nm of ['walkF0', 'walkB1']) {
      for (const x of [0, -3, 3, -5, 5, -8, 8]) {
        const z = padZ(ctx, nm, x);
        if (!S.lineClear(ctx, x - 5, z, x + 5, z, 0.5) || !S.clearSpot(ctx, x, z + (nm === 'walkF0' ? 1.5 : -1.5), 0.8, { ground: 'open' })) continue;
        out.push({ x, z });
      }
    }
    return out;
  }

  // ---- the props of the three causes
  const cup = () => sculpt((v) => { v.box(0, 0, 0, 0.11, 0.07, 0.11, '#8d6e4c'); v.box(0, 0.07, 0, 0.12, 0.09, 0.12, '#f4f1e6'); v.box(0, 0.16, 0, 0.14, 0.03, 0.14, '#e63946'); });
  const note = () => sculpt((v) => { v.box(0, 0, 0, 0.34, 0.012, 0.18, '#6ab04c'); v.box(0, 0.012, 0, 0.12, 0.006, 0.12, '#f4f1e6'); v.box(-0.12, 0.012, 0, 0.05, 0.006, 0.1, '#ffd60a'); }, MAT.glow);
  const halfNote = (k) => sculpt((v) => { v.box(k * 0.09, 0, 0, 0.16, 0.012, 0.18, '#6ab04c'); v.box(k * 0.09, 0.012, 0, 0.06, 0.006, 0.12, '#f4f1e6'); }, MAT.glow);
  const sneaker = () => sculpt((v) => { v.box(0, -0.345, 0.05, 0.35, 0.16, 0.47, '#fbfbfb'); v.box(0, -0.345, 0.05, 0.357, 0.035, 0.477, '#e63946'); v.box(0, -0.2, 0.2, 0.2, 0.03, 0.1, '#e63946'); });
  const smudgeProp = () => sculpt((v) => { v.box(0, -0.19, 0.12, 0.28, 0.025, 0.3, '#3b3631'); v.box(0.1, -0.2, 0.02, 0.1, 0.02, 0.1, '#3b3631'); v.box(-0.1, -0.2, 0.02, 0.1, 0.02, 0.1, '#3b3631'); });
  const stain = () => sculpt((v) => { v.box(0.02, 0.92, 0.236, 0.42, 0.36, 0.03, '#5a3a1f'); v.box(-0.1, 0.84, 0.236, 0.16, 0.12, 0.03, '#5a3a1f'); v.box(0.14, 0.82, 0.236, 0.08, 0.2, 0.03, '#5a3a1f'); });

  /** Wait until the shot that was just asked for is really up (the point is in the picture): entrances are only made in view after that. */
  const shotUp = function* (ctx, x, z, y = 1) { yield* waitUntil(() => seen(ctx, x, z, y), 2); yield* wait(0.2); };

  return {
    w: [0, 0, 1.4, 2.4, 2.6], crime: 2,
    stage: { pave: { side: 'any', len: 12, depth: 3 } },
    avail: (ctx) => scuffleSpots(ctx).length > 0,
    *run(ctx) {
      const { L, rnd } = ctx, lv = ctx.level, cam = camFor(ctx, 'scuffle'), B = beatsFor(ctx, 'scuffle'), R = rig(ctx);
      const stg = ctx.stage; // read before the first yield
      let spotsAt = scuffleSpots(ctx).slice();
      if (!spotsAt.length) return;
      if (stg && stg.x != null) spotsAt.sort((p, q) => Math.abs(p.x - stg.x) - Math.abs(q.x - stg.x));
      let done = false;
      try {
        const sp0 = spotsAt[spotsAt.length > 1 && rnd.chance(0.35) ? 1 : 0], x = sp0.x, z = sp0.z, side = rnd.sign();
        const cc = pt(x, z); // the camera follows this point
        const cause = flip(ctx, 'shoes', 0.34) ? 'shoes' : flip(ctx, 'note', 0.5) ? 'note' : 'coffee';
        const happyEnd = flip(ctx, 'mates', 0.4);
        // two ordinary people (never one of the district types)
        const a = makePerson(rnd, { kind: 'civ', shirt: rnd.pick(['#e9c46a', '#f4a261', '#e76f51', '#ffd166']) }), b = makePerson(rnd, { kind: 'civ', shirt: rnd.pick(['#2a9d8f', '#457b9d', '#264653', '#6a4c93']) });
        const ax = x - 3.6, bx = x + 3.6;
        const cupA = cause === 'coffee' ? cup() : null;
        let stainB = null, smudge = null;
        if (cause === 'coffee') { a.hold(cupA); a.arms = 'hold'; a.mood = 'happy'; b.hold(item.phone()); b.arms = 'hold'; }
        else if (cause === 'shoes') {
          a.hold(item.phone()); a.arms = 'hold';
          b.kneeL.add(sneaker()); b.kneeR.add(sneaker());
          smudge = smudgeProp(); smudge.visible = false; b.kneeR.add(smudge);
          b.mood = 'happy'; b.gait = 'strut';
        } else { a.mood = 'neutral'; b.mood = 'neutral'; a.arms = b.arms = 'swing'; }
        const mood0 = (m) => { m.lookAt = null; };

        // ---- 1. the first man walks in, absorbed in his own business
        B('1 the first man walks in', [pt(ax, z)]);
        cam.shot({ on: pt(ax + 0.8, z), dist: 7.5, el: 0.1, az: 0.1 });
        yield* shotUp(ctx, ax + 0.8, z); // (the shot is up before anybody walks in)
        const ta = R.run((function* () { yield* R.enter(a, ax, z, undefined, { speed: 2.9, dir: 1 }); a.heading = E; })());
        yield* waitUntil(() => ta.done, 6);
        if (cause === 'coffee') { ctx.sfx('pop', 1.5); a.squash(0.1); }
        yield* wait(0.5);

        // ---- 1b. the second man walks in from the other end
        B('1b the second man walks in', [pt(bx, z)]);
        cam.shot({ on: pt(bx - 0.8, z), dist: 7.5, el: 0.1, az: -0.1 });
        yield* shotUp(ctx, bx - 0.8, z);
        const tb = R.run((function* () { yield* R.enter(b, bx, z, undefined, { speed: 2.9, dir: -1 }); b.heading = W; })());
        yield* waitUntil(() => tb.done, 6);
        if (cause === 'shoes') { ctx.fx.pips(b.g.position.x, 0.2, z, 3, ['#ffffff', '#cfe8ff']); ctx.sfx('ding'); }
        yield* wait(0.5);

        // ---- 2. the cause. Three of them; every one is shown before anybody is angry.
        const spill = pt(x, z + 0.55);
        const sidestep = function* (m, dz, dur = 0.32) { const q = m.g.position, z0 = q.z; yield* tween(dur, (u) => { q.z = z0 + dz * u; m.moving = 2; }); };
        let causeShown = null; // where the close insert looks
        if (cause === 'coffee') {
          B('2 neither steps aside: the dance', [a, b]);
          cam.two(a, b, { dist: 9, el: 0.1, fit: true, az: 0.1 });
          yield* wait(0.3);
          yield* all(go(ctx, a, x - 1.5, z, 1.7), go(ctx, b, x + 1.5, z, 2.4));
          a.heading = E; b.heading = W;
          // each tries to get past, and picks the same side
          yield* all(sidestep(a, 0.55), sidestep(b, 0.55));
          ctx.sfx('pop'); a.shakeT = 0.5; b.shakeT = 0.5;
          yield* all(sidestep(a, -1.1, 0.4), sidestep(b, -1.1, 0.4));
          a.heading = E; b.heading = W;
          yield* wait(0.2);
          // the bump
          ctx.sfx('thud'); ctx.shake(0.15);
          ctx.fx.text('OEF!', at(x, 2.2, z), { size: 20, color: '#fff' });
          a.squash(0.25); b.squash(0.25);
          const flyer = a.drop();
          flyer.position.set(a.g.position.x + 0.4, 1.2, a.g.position.z);
          R.add(flyer);
          R.run((function* () { yield* arc(flyer, spill.x, 0.02, spill.z, 1.5, 0.7, 7); })());
          stainB = stain(); b.b.add(stainB);
          ctx.fx.burst(b.g.position.x - 0.3, 1.4, b.g.position.z, { n: 18, colors: ['#5a3a1f', '#7a4f2a', '#f4f1e6'], speed: 3, up: 3, size: [0.07, 0.15], life: [0.5, 0.9] });
          a.mood = b.mood = 'shock'; a.lookAt = b; b.lookAt = a;
          yield* wait(0.7);
          B('2b the spill: coffee all over the pavement and his shirt', [spill]);
          cam.ground(spill, { dist: 4, az: 0.2, fov: 34 });
          yield* wait(0.4);
          ctx.sfx('splash');
          ctx.fx.burst(spill.x, 0.1, spill.z, { n: 14, colors: ['#5a3a1f', '#7a4f2a', '#f4f1e6'], speed: 2.2, up: 2.5, size: [0.06, 0.13], life: [0.4, 0.8] });
          ctx.fx.mark(spill.x, 0, spill.z, rnd.range(0, 3), { w: 0.9, l: 0.7, color: '#4a2f17', life: 40 });
          ctx.fx.mark(spill.x + 0.3, 0, spill.z - 0.2, rnd.range(0, 3), { w: 0.4, l: 0.5, color: '#5a3a1f', life: 40 });
          yield* wait(1.0);
          B('2c he looks down at the stain, then up at the man who did it', [b]);
          cam.close(b, { dist: 4.2, y: 1.2 });
          yield* wait(0.3);
          b.lookAt = { x: b.g.position.x - 0.3, z: b.g.position.z + 0.2 }; b.mood = 'shock'; b.arms = 'swing';
          yield* wait(0.7);
          b.lookAt = a; b.mood = 'angry';
        } else if (cause === 'shoes') {
          B('2 two men on a collision course: one stares at his shiny new trainers', [a, b]);
          cam.two(a, b, { dist: 9, el: 0.1, fit: true, az: 0.1 });
          yield* wait(0.3);
          b.lookAt = { x: b.g.position.x - 1.2, z: z + 0.15 };
          const meet = x + 0.55;
          yield* all(go(ctx, a, meet - 0.95, z - 0.2, 1.9), go(ctx, b, meet + 0.35, z - 0.2, 1.3));
          a.heading = E; b.heading = W;
          B('2b the stomp: a boot lands on a white trainer', [pt(meet - 0.1, z - 0.2)]);
          const feet = pt(meet - 0.1, z - 0.2);
          cam.ground(feet, { dist: 3.3, az: 0.25, fov: 32, y: 0.2 });
          yield* wait(0.45);
          // his lead foot comes down on the toe of the other
          yield* go(ctx, a, meet - 0.36, z - 0.2, 0.9);
          a.moving = 0;
          ctx.sfx('thud'); ctx.sfx('squawk');
          ctx.fx.dust(meet, 0, z - 0.1, 0, 0, 5);
          ctx.fx.text('KNARS!', at(meet, 0.8, z + 0.1), { size: 22, color: '#ffffff' });
          smudge.visible = true;
          b.squash(0.15);
          yield* wait(1.2);
          B('2c the slow look: down at the shoe, then up at the culprit', [b]);
          cam.close(b, { dist: 4.2, y: 1.2 });
          yield* wait(0.3);
          b.mood = 'shock'; b.lookAt = { x: meet, z: z - 0.1 };
          yield* wait(0.8);
          b.lookAt = a; b.mood = 'angry';
        } else {
          B('2 a banknote blows along the pavement', [a, b, spill]);
          cam.two(a, b, { dist: 11, el: 0.14, fit: true, az: 0.1 });
          const nt = R.add(note());
          nt.scale.setScalar(1.9);
          const from = outPoint(ctx, x, z + 0.4, -1, 3, 0.2).x;
          nt.position.set(from, 0.3, z + 0.4);
          yield* wait(0.3);
          ctx.sfx('whoosh');
          const spillN = spill;
          yield* tween(Math.min(3.2, Math.abs(x - from) / 4.5), (u) => {
            const e = ease.outQuad(u);
            nt.position.set(lerp(from, x, e), 0.22 + Math.abs(Math.sin(u * 14)) * 0.28 * (1 - u * 0.6), lerp(z + 0.4, spillN.z, e));
            nt.rotation.set(Math.sin(u * 11) * 0.5, u * 18, Math.cos(u * 9) * 0.4);
            if (Math.floor(u * 30) % 4 === 0) ctx.fx.dust(nt.position.x, 0, nt.position.z, 1.5, 0, 1);
          });
          nt.rotation.set(0, 0.6, 0); nt.position.y = 0.02;
          ctx.sfx('pop');
          // both see it: heads turn to the note, then to each other
          a.lookAt = spillN; b.lookAt = spillN; a.mood = b.mood = 'happy';
          yield* doubleTake(ctx, a, '!');
          B('2b both see it: both go for it', [a, b, spillN]);
          cam.two(a, b, { dist: 8, el: 0.12, fit: true, az: 0.1 });
          yield* wait(0.2);
          a.mood = b.mood = 'focus';
          yield* all(go(ctx, a, x - 0.5, z + 0.1, 3.4), go(ctx, b, x + 0.5, z + 0.1, 3.4));
          a.heading = E; b.heading = W;
          B('2c four hands, one banknote', [spillN]);
          cam.ground(spillN, { dist: 3.8, az: 0.2, fov: 34, y: 0.4 });
          a.arms = b.arms = 'reach';
          yield* wait(0.5);
          ctx.sfx('boing'); a.squash(0.2); b.squash(0.2);
          // tug of war: the note rips in two
          yield* tween(0.7, (u) => { a.g.position.x = x - 0.5 - 0.25 * Math.sin(u * 14); b.g.position.x = x + 0.5 + 0.25 * Math.sin(u * 14); });
          ctx.sfx('snip'); ctx.fx.text('RRRIP!', at(x, 1.4, z), { size: 22, color: '#ffffff' });
          R.rm(nt);
          const h1 = R.add(halfNote(-1)), h2 = R.add(halfNote(1));
          h1.scale.setScalar(1.9); h2.scale.setScalar(1.9);
          h1.position.set(x - 0.2, 0.9, z + 0.1); h2.position.set(x + 0.2, 0.9, z + 0.1);
          R.run(arc(h1, x - 1.0, 0.02, z + 0.5, 0.9, 0.6, 5)); R.run(arc(h2, x + 1.0, 0.02, z - 0.1, 0.9, 0.6, -5));
          a.arms = b.arms = 'swing'; a.mood = b.mood = 'shock'; a.lookAt = b; b.lookAt = a;
          yield* wait(0.9);
          B('2d the glare over two torn halves', [a, b]);
          cam.two(a, b, { dist: 6, el: 0.1, fit: true, az: 0.1 });
          yield* wait(0.4);
          a.mood = b.mood = 'angry';
          yield* wait(0.5);
        }

        // ---- 3. the argument: a word, then a shove. Now they have something to shout about.
        const rows = {
          coffee: [['MIJN KOFFIE!', 'KIJK UIT, GOZER!', 'JIJ LOOPT MET JE NEUS IN JE TELEFOON!']],
          shoes: [['MIJN NIEUWE SCHOENEN!', 'KIJK WAAR JE LOOPT!', 'ZE WAREN WIT!']],
          note: [['DAT IS MIJN BILJET!', 'IK ZAG HET EERST!', 'NIETES!']],
        }[cause][0];
        B('3 the first words, over the shoulder', [a, b]);
        cam.ots(a, b, { cut: 0.3 });
        yield* wait(0.3);
        a.mood = 'angry'; a.arms = 'point'; a.lookAt = b; b.mood = 'angry'; b.arms = 'fist'; b.lookAt = a;
        yell(ctx, b, rows[0], '#ff6b6b', 15);
        b.squash(0.12);
        yield* hop(b, 0.15, 0.2);
        yield* wait(0.6);
        yell(ctx, a, rows[1], '#ffd166', 15);
        a.squash(0.12);
        yield* hop(a, 0.15, 0.2);
        yield* wait(0.5);

        B('3b the shove and the shove back', [a, b]);
        cam.two(a, b, { dist: 7, el: 0.12, fit: true, az: 0.1 });
        yield* wait(0.3);
        yell(ctx, b, rows[2], '#ff6b6b', 16);
        b.arms = 'point';
        yield* wait(0.5);
        const sh = function* (p, q, dd) { // p shoves q (dd = the way q goes)
          const o = q.g.position, px0 = o.x;
          ctx.sfx('thud'); ctx.shake(0.18);
          p.squash(0.2);
          yield* tween(0.2, (t) => { o.x = px0 + dd * 0.4 * Math.sin(t * Math.PI * 0.75); });
        };
        yield* sh(a, b, 1);
        yield* wait(0.1);
        yield* sh(b, a, -1);
        yield* wait(0.2);

        // ---- 4. word gets round: spectators gather, a granny takes bets, the title card
        B('4 word gets round: the crowd gathers', [cc]);
        const mob = gather(ctx, R, x, 2, 15);
        const bookie = makePerson(rnd, { kind: 'granny' });
        let bookieHere = false;
        const spots = [[-3.0, 1.5], [3.1, 1.4], [-1.2, -1.7], [1.6, -1.6]].map(([dx, dz]) => { const q = spotNear(ctx, x + dx, z + dz); return [q.x - x, q.z - z]; });
        const spectators = [];
        cam.wide(cc, { dist: 15, el: 0.3 });
        R.run((function* () {
          yield* R.enter(bookie, clamp(x + side * 11, EX0, EX1), z + 1.0);
          bookie.hold(item.paper()); bookie.arms = 'hold'; bookie.mood = 'sly';
          yield* go(ctx, bookie, x + spots[3][0], z + spots[3][1], 3);
          faceTo(bookie, x, z); bookie.lookAt = cc; bookieHere = true;
          yell(ctx, bookie, 'WIE WINT? NOTEER!', '#b9fbc0', 13);
        })());
        spectators.push([bookie, 3]);
        mob.forEach((p, i) => { spectators.push([p, i]); R.run(go(ctx, p, x + spots[i][0], z + spots[i][1], 3.2)); });
        for (let i = mob.length; i < 2; i++) {
          const extra = makePerson(rnd, { kind: i ? 'kid' : extraKind(ctx) });
          spectators.push([extra, i]);
          R.run((function* () { yield* R.enter(extra, clamp(x - side * 10, EX0, EX1), z + 1); yield* go(ctx, extra, x + spots[i][0], z + spots[i][1], 3.4); })());
        }
        a.lookAt = b; b.lookAt = a; a.arms = b.arms = 'fist';
        yield* wait(1.5);

        B('4b noses together: the title card', [a, b]);
        cam.orbit([a, b], { dist: 6, fit: true, el: 0.15 });
        yield* wait(0.3);
        cam.card('DE KEMPHANEN', 'Two egos, one pavement.', 1.9);
        cam.freeze(0.6);
        ctx.sfx('sting');
        yield* wait(0.5);
        yield* waitUntil(() => bookieHere, 3);
        const film = mob[0];
        for (const [p, i] of spectators) {
          if (!p.alive) continue;
          faceTo(p, x, z); p.lookAt = cc; p.mood = 'happy';
          if (p === film) filmIt(p, x, z); else p.arms = i % 2 ? 'up' : 'hold';
          ctx.fx.cash(p.g.position.x, 1.2, p.g.position.z, 2, 1.5, 2.5);
        }
        // the one long breath
        a.heading = E; b.heading = W;
        ctx.sfx('gasp');
        yield* tween(0.7, (t) => { a.g.position.x = lerp(a.g.position.x, x - 0.4, t * 0.5); b.g.position.x = lerp(b.g.position.x, x + 0.4, t * 0.5); });
        ctx.sfx('coin');
        say(ctx, film || bookie, '10 OP DE LINKER!', { size: 13, color: '#b9fbc0' });
        bookie.squash(0.2);
        yield* wait(0.5);
        ctx.incident(2);
        ctx.news(`Difference of opinion on ${ctx.st.name} escalates to dust cloud`);

        // ---- 5. the cartoon dust cloud: limbs, stars, flying shoes. The ring of onlookers stays where it is.
        B('5 the dust cloud: limbs, stars, flying shoes', [cc]);
        cam.dutch(cc, { dist: 9, el: 0.2 });
        yield* wait(0.3);
        a.g.visible = b.g.visible = false;
        ctx.slowmo(0.5, 0.35);
        ctx.sfx('slam'); ctx.sfx('bonk');
        if (lv >= 4) R.panic(x, 12, 3);
        const words = ['POW!', 'BAM!', 'OEF!', 'AU!', 'BONK!', 'KLETS!', 'KRAK!'];
        let tt = 0, nxt = 0, k = 0, high = false;
        const shoes = [];
        const cx0 = cc.x;
        while (tt < 3.6) {
          const dt = yield;
          tt += dt; nxt -= dt;
          cc.x = cx0 + Math.sin(tt * 2.2) * 0.7;
          cc.z = z + Math.sin(tt * 3.1) * 0.25;
          if (!high && tt > 2.2) { high = true; cam.high(cc, { dist: 13 }); }
          if (nxt < 0) {
            nxt = 0.14; k++;
            ctx.fx.smoke(cc.x + rnd.range(-0.7, 0.7), 0.4, cc.z + rnd.range(-0.5, 0.5), 5, ['#f1ede4', '#e4dccb', '#d8cfbd'], 0.8);
            if (k % 3 === 0) {
              ctx.fx.text(rnd.pick(words), at(cc.x + rnd.range(-1.6, 1.6), rnd.range(1.2, 2.4), cc.z), { size: 19, color: rnd.pick(['#ffd60a', '#ff6b6b', '#ffffff']), dur: 0.7 });
              ctx.sfx(rnd.pick(['thud', 'boing', 'pop', 'bonk']));
              ctx.shake(0.12);
            }
            if (k % 4 === 1) ctx.fx.burst(cc.x, 0.9, cc.z, { n: 5, colors: ['#ffd60a', '#ffffff'], speed: 5, up: 6, glow: true, size: [0.1, 0.16], life: [0.4, 0.8] });
            if (k % 2 === 0) ctx.fx.burst(cc.x, 0.8, cc.z, { n: 3, colors: ['#f2c9a0', '#c98e62', '#e84a5f', '#457b9d', '#2b3a55'], speed: 6, up: 5, size: [0.16, 0.3], life: [0.3, 0.6] });
            if ((k === 4 || k === 12) && shoes.length < 2) {
              const shp = R.add(item.shoe());
              shp.position.set(cc.x, 0.9, cc.z);
              shoes.push(shp);
              const lx = clamp(cc.x + rnd.range(-3.5, 3.5), EX0, EX1), lq = S.findSpot(ctx, lx, z + rnd.range(-0.6, 0.6), 0.3, 6);
              R.run(arc(shp, lq ? lq.x : cc.x + 1, 0.02, lq ? lq.z : z, 3.5, 1.0, rnd.range(-9, 9)));
            }
            if (k === 8) { bookie.arms = 'up'; say(ctx, bookie, 'DOORGAAN!', { size: 13, color: '#b9fbc0' }); ctx.sfx('coin'); }
          }
        }
        ctx.sfx('pang');
        ctx.fx.puff(cc.x, 0.6, cc.z, '#f1ede4');
        ctx.fx.smoke(cc.x, 0.6, cc.z, 14, ['#f1ede4', '#e4dccb', '#d8cfbd'], 1.0);

        // ---- 6. the cloud clears: both flung out, sitting dazed with stars, a shoe in one hand
        B('6 the cloud clears: both flung out, dizzy', [a, b]);
        cam.dutch(cc, { dist: 9, el: 0.2 });
        yield* wait(0.4); // the cloud still hides them; the picture is ready before they appear
        a.g.position.set(cc.x, 0, cc.z); b.g.position.set(cc.x, 0, cc.z);
        a.g.visible = b.g.visible = true;
        a.lookAt = b.lookAt = null; a.arms = b.arms = 'up';
        yield* all(tumble(ctx, a, cc.x - 1.1, cc.z + 0.2), tumble(ctx, b, cc.x + 1.1, cc.z - 0.2));
        a.heading = b.heading = 0;
        a.hold(item.shoe()); a.arms = 'hold'; b.arms = 'facepalm';
        R.run(seeStars(ctx, a, 2.2)); R.run(seeStars(ctx, b, 1.8));
        yield* wait(0.9);

        let cop = null, cop2 = null;
        if (!happyEnd) {
          B('6b the law arrives', [a, b]);
          cop = makePerson(rnd, { kind: 'cop' });
          cam.shot({ on: [a, b], dist: 11, el: 0.22, az: side * 0.4, fit: true });
          yield* wait(0.3);
          yield* R.enter(cop, clamp(cc.x - side * 9, EX0, EX1), cc.z);
          ctx.sfx('whistle');
          cop.mood = 'angry'; cop.arms = 'stop';
          yell(ctx, cop, 'UIT ELKAAR!', '#7db8ff', 17);
          a.lookAt = b.lookAt = cop; a.mood = b.mood = 'scared'; a.arms = b.arms = 'up';
          yield* go(ctx, cop, cc.x - side * 2.4, cc.z, 6);
          cop.heading = side > 0 ? E : W; cop.arms = 'hips';
          cop2 = lv >= 4 ? makePerson(rnd, { kind: 'cop' }) : null;
          if (cop2) {
            R.run((function* () { yield* R.enter(cop2, clamp(cc.x + side * 12, EX0, EX1), cc.z + 0.6); ctx.sfx('whistle'); cop2.arms = 'hips'; cop2.mood = 'angry'; yield* go(ctx, cop2, cc.x + side * 2.6, cc.z + 0.6, 6); cop2.heading = side > 0 ? W : E; })());
          }
          if (lv >= 5 && L.kind !== 'ped') R.run(R.police(side, L.chaseZ, 11, 0.2));
        }

        B('6c sheepish: sorry', [a, b]);
        cam.two(a, b, { dist: 6.5, el: 0.1, fit: true });
        yield* wait(0.4);
        a.lookAt = b; b.lookAt = a; a.mood = b.mood = 'sad'; a.arms = b.arms = 'swing';
        say(ctx, a, 'sorry', { size: 12, color: '#cfe8ff' });
        yield* wait(0.6);
        say(ctx, b, 'ook sorry', { size: 12, color: '#cfe8ff' });
        yield* wait(0.5);

        // ---- 7. the bets are settled: the granny backed a draw
        B('7 the granny backed a draw', [bookie]);
        cam.low(bookie, { dist: 8 });
        yield* wait(0.3);
        ctx.sfx('coin');
        ctx.fx.cash(bookie.g.position.x, 1.05, bookie.g.position.z, 22, 3, 6);
        bookie.arms = 'up'; bookie.mood = 'laugh';
        yell(ctx, bookie, 'GELIJKSPEL! OMA WINT!', '#b9fbc0', 15);
        cackle(ctx, bookie, 1.4, 'ha');
        for (const [p] of spectators) if (p !== bookie && p.alive) { p.arms = 'fist'; p.mood = 'sad'; say(ctx, p, 'ACH...', { size: 12, color: '#cfe8ff' }); }
        yield* wait(1.2);

        // ---- 8. aftermath: either the law makes two men shake hands, or they find out they are the best of friends
        B('8 handshake', cop ? [a, b, cop] : [a, b]);
        cam.shot({ on: cop ? [a, b, cop] : [a, b], dist: 9, el: 0.15, fit: true });
        yield* wait(0.3);
        if (cop) { say(ctx, cop, lv >= 4 ? 'MEEKOMEN, DE HEREN.' : 'HAND GEVEN. NU.', { size: 13, color: '#7db8ff' }); cop.arms = 'point'; }
        a.drop();
        yield* all(getUp(a, 'sad'), getUp(b, 'sad'));
        a.arms = b.arms = 'swing';
        yield* all(go(ctx, a, cc.x - 0.4, cc.z, 1.4), go(ctx, b, cc.x + 0.4, cc.z, 1.4));
        a.heading = E; b.heading = W; a.arms = b.arms = 'reach'; a.lookAt = b; b.lookAt = a;
        yield* wait(0.4);
        a.mood = b.mood = 'happy';
        if (cop) { cop.arms = 'hips'; cop.mood = 'smug'; }
        ctx.sfx('ding'); a.squash(0.15); b.squash(0.15);
        if (happyEnd) {
          // a laugh, an arm round the shoulder, and off together (the thing that started it all is forgotten)
          yield* all(laugh(ctx, a, 1.0, 'ha'), laugh(ctx, b, 1.0, 'ha'));
          a.arms = b.arms = 'swing'; a.lookAt = b.lookAt = null;
          const dirOut = rnd.sign();
          R.run(R.away(a, dirOut * 7, 2.4)); R.run((function* () { yield* wait(0.15); yield* R.away(b, dirOut * 7, 2.4); })());
        } else {
          yield* wait(0.6);
          a.lookAt = b.lookAt = null; a.mood = b.mood = 'neutral';
          R.run(R.away(a, -7, lv >= 4 ? 2.8 : 4)); R.run(R.away(b, 7, lv >= 4 ? 2.8 : 4));
        }

        B('8b everybody goes home', [cc]);
        cam.wide(cc, { dist: 22 });
        yield* wait(0.3);
        for (const [p] of spectators) if (p.alive) { p.lookAt = null; p.mood = 'neutral'; p.arms = 'swing'; }
        for (const [p] of spectators) if (p.alive && mob.includes(p)) R.give(p);
        for (const [p] of spectators) if (p.alive && !mob.includes(p)) R.run(R.away(p, rnd.sign() * 6, 3.4));
        yield* wait(0.6);
        if (cop && cop.alive) R.run(R.away(cop, -side * 6, 3));
        if (cop2 && cop2.alive) R.run(R.away(cop2, side * 6, 3));
        yield* wait(1.2);
        for (const sho of shoes) R.rm(sho);
        done = true;
      } finally {
        cam.release();
        R.free(done);
      }
    },
  };
}
