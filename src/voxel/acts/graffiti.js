// Vandalism: the tag. Storyboard: storyboards/graffiti.md; every B(...) below is one beat of it.
import * as THREE from 'three';
import { wait, tween, all, race, waitUntil, ease, clamp, lerp, TAU, sculpt, piece, MAT } from '../kit.js';
import { makePerson, makeDog, makeCat, makeBird, item } from '../cast.js';
import { makeCar, makeBike, makeScooter } from '../props.js';
import * as S from '../setting.js';

/**
 * A finished tag stays on the wall (lasting damage), so it is baked into ONE mesh: the same boxes, colours and places as the
 * pixel meshes it was sprayed with (each pixel's final transform applied to its vertices), one geometry and one draw call
 * instead of one per pixel. Pixels that are not visible are left out (none are, once the scene is done).
 */
const _v = new THREE.Vector3(), _nm = new THREE.Matrix3();
function bakeTag(tg) {
  const ms = tg.children.filter((m) => m.isMesh && m.visible && m.geometry && m.geometry.index);
  if (ms.length < 2) return;
  let nv = 0, ni = 0;
  for (const m of ms) { nv += m.geometry.attributes.position.count; ni += m.geometry.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let o = 0, k = 0;
  for (const m of ms) {
    m.updateMatrix();
    _nm.getNormalMatrix(m.matrix);
    const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, Cl = g.attributes.color, I = g.index;
    for (let i = 0; i < P.count; i++) {
      const q = (o + i) * 3;
      _v.fromBufferAttribute(P, i).applyMatrix4(m.matrix); pos[q] = _v.x; pos[q + 1] = _v.y; pos[q + 2] = _v.z;
      _v.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); nor[q] = _v.x; nor[q + 1] = _v.y; nor[q + 2] = _v.z;
      col[q] = Cl.getX(i); col[q + 1] = Cl.getY(i); col[q + 2] = Cl.getZ(i);
    }
    for (let i = 0; i < I.count; i++) idx[k++] = I.getX(i) + o;
    o += P.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const baked = new THREE.Mesh(geo, ms[0].material); // MAT.glow, shared: never disposed with the tag
  baked.castShadow = ms[0].castShadow; baked.receiveShadow = ms[0].receiveShadow;
  for (const m of [...tg.children]) { tg.remove(m); if (m.geometry) m.geometry.dispose(); }
  tg.add(baked);
}

/** `T` is the set-piece toolkit of gags.js (see ACTS.md). */
export default function (T) {
  const {
    X0, X1, EX0, EX1, E, W, go, fly, chase, popIn, popOut, enter, edgeOf, walkOff, leave, hop, say, at, camFor, pt, faceTo,
    yell, padZ, once, spotNear, padSpot, tidy, takePed, rig, gather, filmIt, resident, lookAround, doubleTake, arc, goEach,
    seat, rideTo, mount, dismount, lineObj, lootBox, beatsFor, flip, laugh, cackle, leap, tumble, getUp,
    seeStars, fright, tiptoe, shoulder, noteTrail, runDust, skid, drive, handbrake, exhaust, spawnPed, unped, stroll,
    release, needPed,
  } = T;

  const TAG = ['111 111 111', '1 1   1 1 1', '1 1  1  1 1', '1 1 1   1 1', '111 1   111']; // "070"
  const UNDER = ['11111111111']; // the critic's "improvement": a gold underline
  /**
   * What the tag goes on (the module's "wall" choice): the transformer box with room left, else a plain house wall
   * (a real front, no shop sign, clear of its own door and window, pavement in front). { x, z (the wall's face), y, tags, wall }.
   */
  function canvasFor(ctx, near = 0) {
    const L = ctx.L;
    if (L.box && (L.box.tags || 0) < 3) return L.box;
    const hs = L.houses.filter((h) => !h.shop && !h.tower && h.w >= 5 && Math.abs(h.x) < 14 && ((h.canvas && h.canvas.tags) || 0) < 3).sort((p, q) => Math.abs(p.x - near) - Math.abs(q.x - near));
    for (const h of hs) {
      // along the wall in 0.6 m steps from the middle outwards, clear of the front door and the window
      for (let k = 0; k <= 12; k++) {
        const off = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.6, x = h.x + off;
        if (Math.abs(off) > h.w / 2 - 1.0 || Math.abs(x - h.door.x) < 1.4 || Math.abs(x - h.win.x) < 1.4 || Math.abs(x) > 15) continue;
        if (!S.housesNear(ctx, h.win.x, 0.2, { balcony: false }).includes(h)) continue; // a real wall
        if (!S.clearSpot(ctx, x, h.z + 0.9, 0.7)) continue; // room to stand in front of it
        return (h.canvas ||= { x, z: h.z, y: 0, tags: 0, wall: true, house: h });
      }
    }
    return null;
  }

  return {
    w: [0, 0, 3, 2, 1.5], crime: 1,
    // 10 m of pavement with room to stand in front of the wall, run off along it and slip
    stage: { pave: { side: 'any', len: 10, depth: 1.6 } },
    avail: (ctx) => !!canvasFor(ctx),
    *run(ctx) {
      const stageX = ctx.stage ? ctx.stage.x : 0; // (read before the first yield)
      const { L, rnd } = ctx, lv = ctx.level, bx = canvasFor(ctx, stageX), cam = camFor(ctx, 'graffiti'), R = rig(ctx);
      if (!bx) return;
      const n = bx.tags || 0, col = ['#ff006e', '#3a86ff', '#ffbe0b'][n];
      let done = false, counted = false;
      const critEnd = flip(ctx, 'critic', 0.35); // second ending: the cop arrests the critic, who is holding the can
      try {
        bx.tags = n + 1; counted = true;
        const dir = rnd.sign(), spot = pt(bx.x, bx.z);
        const walk = bx.wall ? 'walkB1' : 'walkF1'; // the pavement the cast walks on: the house side for a wall, the camera side for the box
        const sz = bx.z + 0.75, lookX = clamp(bx.x + dir * 6.5, EX0 + 1, EX1 - 1), px = 0.15, by = bx.y || 0;
        const x0 = bx.x - (11 * px) / 2 + px / 2 + n * 0.08, y0 = by + 1.3 - n * 0.1, tz = bx.z + 0.03 + n * 0.02;
        const kid = makePerson(rnd, { kind: 'hoodie', shirt: rnd.pick(['#3a3a3a', '#5a189a', '#1b4332']) });
        const lookout = makePerson(rnd, { kind: 'hoodie', shirt: rnd.pick(['#7a2e0e', '#264653', '#6a040f']), scale: 1.1 });
        const tg = R.add(new THREE.Group()); // the tag lives in this group, positioned so it warps with the street
        tg.position.set(bx.x, 0.0001, tz);
        const pix = (gx, gy, color, h = 0.2) => { const m = sculpt((v) => v.box(0, -h, 0, px, h, 0.04, color), MAT.glow); m.position.set(gx, gy, 0); tg.add(m); return m; };

        const B = beatsFor(ctx, 'graffiti'), tagPt = { x: bx.x, z: bx.z + 0.05, y: by + 1.1 };

        // ---- 1. set-up: a lookout takes position; the tagger creeps in from the other side
        B('1 set-up: the wall that is going to be tagged, the lookout and the tagger walk in', [tagPt]);
        cam.wide(spot, { dist: 14, el: 0.3, az: 0.3 * dir }); // (tight on the wall: the frame's edges are a few metres away, so both of them are in the picture within a second or two)
        const look = spotNear(ctx, lookX, padZ(ctx, walk, lookX)), kpos = spotNear(ctx, bx.x - 1.3, sz);
        const kx0 = clamp(bx.x - dir * 5, EX0, EX1);
        yield* waitUntil(() => T.seen(ctx, kx0, padZ(ctx, walk, kx0)) && !T.seen(ctx, bx.x - dir * 19, padZ(ctx, walk, kx0)), 2); // (the tight shot is up before anybody walks into it)
        R.run((function* () {
          yield* R.enter(lookout, look.x, look.z, undefined, { speed: 3.4 });
          lookout.heading = dir > 0 ? E : W; lookout.arms = 'sneak'; lookout.mood = 'whistle';
          say(ctx, lookout, '♪ doe-niks ♪', { size: 12, color: '#cfe8ff' });
          for (let i = 0; i < 3; i++) yield* lookAround(lookout, 0.7, 0.3);
        })());
        yield* R.enter(kid, kx0, padZ(ctx, walk, kx0), undefined, { speed: 3.8 });
        B('1b the tagger creeps up to the wall', [kid]);
        cam.track(kid, { dist: 9.5, el: 0.14, az: -dir * 0.5, lead: 1.5, cut: 1.0 });
        yield* tiptoe(ctx, kid, kpos.x, kpos.z, 3.6);

        // ---- 2. reveal and warm-up: face to the lens, shake the can
        B('2 reveal: the tagger shakes his can at us', [kid]);
        kid.gait = 'walk'; kid.heading = 0; kid.mood = 'smug';
        kid.hold(item.spray());
        cam.hero(kid, { dist: 6 });
        cam.card('DE SPUITER', 'Self-taught. Self-appointed.', 1.9);
        cam.freeze(0.7);
        ctx.sfx('sting');
        kid.arms = 'fist';
        yield* wait(0.4);
        for (let i = 0; i < 3; i++) { ctx.sfx('clatter'); if (i === 1) say(ctx, kid, 'klak klak', { size: 12, color: '#cfe8ff' }); kid.squash(0.1); yield* wait(0.38); }
        kid.arms = 'spray'; kid.mood = 'focus';
        kid.heading = Math.PI + 0.5;
        yield* wait(0.3);

        // ---- 3. the tag, stroke by stroke, with the camera creeping in
        B('3 the tag: stroke by stroke, the paint sparks', [kid, tagPt]);
        cam.shot({ on: [kid, tagPt], y: by + 1.1, dist: 8, el: 0.22, az: 0.3 * dir, fit: true, drift: { dist: -0.35 } });
        yield* wait(0.3);
        let kx = kid.g.position.x;
        for (let c = 0; c < 11; c++) {
          ctx.sfx('spray');
          for (let r = 0; r < 5; r++) {
            if (TAG[r][c] !== '1') continue;
            pix(x0 - bx.x + c * px, y0 - r * 0.2 - 0.0, col);
            ctx.fx.sparks(x0 + c * px, y0 - r * 0.2 - 0.1, tz + 0.2, 1, [col, '#ffffff']);
          }
          const nx = bx.x - 0.85 + (c / 10) * 1.7, from = kx;
          yield* tween(0.2, (t) => { kid.g.position.x = lerp(from, nx, t); });
          kx = nx;
          if (c === 7) { ctx.sfx('whistle'); say(ctx, lookout, 'psst!', { size: 12, color: '#b9fbc0' }); kid.lookAt = null; }
        }
        kid.arms = 'swing'; kid.mood = 'happy';
        ctx.incident();
        say(ctx, kid, 'ZO DAN!', { size: 14, color: col });
        // fresh paint drips and a puddle
        for (let i = 0; i < 3; i++) {
          const dc = 1 + i * 4 + (i % 2), d = pix(x0 - bx.x + dc * px, y0 - 1.0, col, 1);
          d.scale.y = 0.001;
          R.run(tween(1.4 + i * 0.3, (t) => { d.scale.y = Math.max(0.001, (0.25 + i * 0.12) * t); }, ease.outQuad));
        }
        const pud = R.add(sculpt((v) => v.box(0, 0, 0, 0.9, 0.02, 0.5, col)));
        const pp = spotNear(ctx, bx.x + 0.4, bx.z + 1.15, 0.5);
        pud.position.set(pp.x, 0.02, pp.z);
        pud.scale.setScalar(0.001);
        R.run(tween(0.7, (t) => pud.scale.setScalar(Math.max(0.001, t)), ease.outQuad));
        // a critic wanders in from the side while he steps back to admire his work (straight through the puddle)
        const critic = takePed(ctx, 9, null, bx.x - dir * 4);
        let cr = critic;
        const vs = spotNear(ctx, bx.x - dir * 2.3, bx.z + 2.2), vx = vs.x, vz = vs.z;
        let crHere = false;
        if (critic) R.borrow(critic);
        else cr = makePerson(rnd, { kind: T.extraKind ? T.extraKind(ctx) : 'civ' });
        R.run((function* () {
          if (!critic) { const cx0 = clamp(bx.x - dir * 8, EX0, EX1); yield* R.enter(cr, cx0, padZ(ctx, walk, cx0)); }
          yield* go(ctx, cr, vx, vz, 3.6);
          crHere = true;
        })());
        B('3b the puddle: he steps back, straight through the wet paint', [kid, pud]);
        cam.ground([kid, pud], { dist: 6.5, el: 0.08, az: -0.4 * dir, fit: true });
        yield* wait(0.3);
        yield* laugh(ctx, kid, 0.9, 'he');
        const prints = [];
        let wet = false, lastPx = 0, lastPz = 0, flip = 1;
        const track = (dt, s) => {
          const q = kid.g.position;
          if (!wet && Math.abs(q.x - pud.position.x) < 0.6 && Math.abs(q.z - pud.position.z) < 0.3) { wet = true; lastPx = q.x; lastPz = q.z; }
          if (wet && prints.length < 22 && Math.hypot(q.x - lastPx, q.z - lastPz) > 0.34) {
            lastPx = q.x; lastPz = q.z; flip = -flip;
            const f = R.add(sculpt((v) => v.box(0, 0, 0, 0.22, 0.02, 0.14, col)));
            f.position.set(q.x + Math.cos(kid.g.rotation.y) * 0.12 * flip, 0.025, q.z - Math.sin(kid.g.rotation.y) * 0.12 * flip);
            f.rotation.y = kid.g.rotation.y;
            prints.push(f);
          }
        };
        const back = spotNear(ctx, bx.x + 0.1, bx.z + 1.9);
        yield* goEach(ctx, kid, back.x, back.z, 1.6, track);
        kid.heading = Math.PI; kid.arms = 'swing';
        yield* waitUntil(() => crHere, 5);

        // ---- 4. the critic's verdict
        B('4 the verdict: the critic frowns at the tag', [cr, kid]);
        cam.ots(kid, cr);
        cr.heading = Math.PI; cr.arms = 'hold'; cr.mood = 'focus';
        kid.lookAt = cr; kid.mood = 'smug';
        yield* wait(0.3);
        say(ctx, cr, 'hmm...', { size: 13, color: '#cfe8ff' });
        yield* lookAround(cr, 0.35, 0.35);
        ctx.fx.text('★☆☆☆☆', at(vx, 2.3, vz), { size: 20, color: '#ffe066', dur: 1.6 });
        say(ctx, cr, rnd.pick(['"Het mist diepgang."', '"Ik zie Banksy niet."', '"Mijn nichtje kan dit ook."']), { size: 13, color: '#fff', dur: 1.8 });
        ctx.sfx('gasp');
        cr.mood = 'smug';
        yield* wait(0.9);
        B('4b WAT?!: the artist takes it personally', [kid]);
        cam.crash(kid);
        yield* wait(0.3);
        kid.arms = 'fist'; kid.mood = 'angry';
        yell(ctx, kid, 'WAT?!', col, 16);
        // ...and improves it
        yield* wait(0.6);
        const can = kid.drop();
        cr.hold(can);
        cr.arms = 'spray';
        say(ctx, kid, 'HÉ!', { size: 15, color: '#fff' });
        // the law walks in from the side the lookout is NOT watching (he faces the other way), starting now, out of the picture
        const cop = makePerson(rnd, { kind: 'cop' });
        const cx1 = clamp(bx.x - dir * 11, EX0, EX1);
        let copIn = false;
        const copTask = R.run((function* () { yield* wait(0.8); yield* R.enter(cop, cx1, padZ(ctx, walk, cx1), undefined, { speed: 3 }); copIn = true; })());
        B('4c the improvement: the critic adds a gold underline', [cr, tagPt]);
        cam.dolly([cr, tagPt], { y: by + 1.1, dist: 7, el: 0.22, az: -0.3 * dir, fit: true });
        yield* go(ctx, cr, bx.x + 0.1, sz, 3.2);
        cr.heading = Math.PI;
        yield* wait(0.3);
        for (let c = 0; c < 11; c++) {
          ctx.sfx('spray');
          for (let r = 0; r < 1; r++) {
            if (UNDER[r][c] !== '1') continue;
            pix(x0 - bx.x + c * px, y0 - 1.03, '#ffd60a', 0.08);
            ctx.fx.sparks(x0 + c * px, y0 - 1.07, tz + 0.2, 1, ['#ffd60a', '#ffffff']);
          }
          yield* wait(0.09);
        }
        say(ctx, cr, 'Beter.', { size: 15, color: '#fff' });
        kid.arms = 'up'; kid.mood = 'shock'; kid.lookAt = null;
        ctx.sfx('boing');
        yield* all(hop(kid, 0.5, 0.35), wait(0.5));
        // (in the second ending the critic is left holding the can: that is what the cop finds)
        if (critEnd) { cr.arms = 'hold'; cr.mood = 'smug'; } else { R.discard(cr); cr.arms = 'swing'; }

        // ---- 5. the law arrives, and the lookout was looking the wrong way (he watches the street end, the cop comes from behind the wall)
        B('5 the law arrives: FWEEET, and the lookout was looking the wrong way', [pt(cx1, padZ(ctx, walk, cx1)), kid, lookout]);
        cam.wide([pt(cx1, padZ(ctx, walk, cx1)), kid, lookout], { dist: 16, el: 0.25, az: dir * 0.2, fit: true });
        yield* waitUntil(() => copTask.done, 40);
        yield* wait(0.9);
        ctx.sfx('whistle');
        cop.arms = 'stop'; cop.mood = 'angry';
        say(ctx, cop, 'FWEEET! HÉ JIJ!', { size: 15, color: '#7db8ff' });
        lookout.lookAt = cop; lookout.mood = 'shock'; faceTo(lookout, cop.g.position.x, cop.g.position.z);
        yell(ctx, lookout, 'AGENT!!!', '#b9fbc0', 16);
        const kidOut = dir > 0 ? EX1 : EX0; // they flee away from the cop
        kid.lookAt = cop;
        yield* wait(0.35);
        yield* fright(ctx, kid, 'OEPS');
        kid.arms = 'swing'; kid.lookAt = null;
        lookout.arms = 'swing'; lookout.lookAt = null;
        R.run(R.leave(lookout, 7.4, kidOut));
        // from above: the paint trail zig-zags away
        B('5b the flight: wet footprints zig-zag away', [kid]);
        cam.high(kid, { dist: 14, az: -dir * 0.3 });
        const flee = R.run((function* () {
          yield* goEach(ctx, kid, S.runway(ctx, kid.g.position.x, kid.g.position.z, kidOut > 0 ? 1 : -1, 24), padZ(ctx, walk, kidOut), 7.4, (dt) => {
            const q = kid.g.position;
            if (prints.length < 22 && Math.hypot(q.x - lastPx, q.z - lastPz) > 0.38) {
              lastPx = q.x; lastPz = q.z; flip = -flip;
              const f = R.add(sculpt((v) => v.box(0, 0, 0, 0.22, 0.02, 0.14, col)));
              f.position.set(q.x, 0.025, q.z + 0.13 * flip); f.rotation.y = kid.g.rotation.y;
              prints.push(f);
            }
          });
          yield* R.out(kid);
        })());
        const cp = cop.g.position;
        cop.arms = 'swing'; cop.mood = 'focus';
        yield* wait(1.0);
        if (!critEnd) {
          // the cop follows the footprints to the tag and the puddle, and walks right into it
          B('6 the slip: the cop finds the puddle', [cop, pud]);
          cam.ground([cop, pud], { dist: 7, el: 0.1, az: -dir * 0.4, fit: true });
          yield* go(ctx, cop, pud.position.x - dir * 1.2, pud.position.z, 4.6);
          cop.heading = dir > 0 ? E : W; cop.lookAt = pud.position;
          yield* lookAround(cop, 0.8, 0.28);
          say(ctx, cop, 'VOETAFDRUKKEN?', { size: 13, color: '#7db8ff' });
          yield* wait(0.4);
          cop.lookAt = null;
          yield* goEach(ctx, cop, pud.position.x + dir * 0.2, pud.position.z, 2.6, () => Math.abs(cp.x - pud.position.x) < 0.45);
          // whoops: his boot finds the paint
          ctx.sfx('skid'); ctx.sfx('boing');
          say(ctx, cop, 'WHOEAH!', { size: 20, color: '#ffffff' });
          yield* tumble(ctx, cop, cp.x + dir * 1.6, cp.z, 0.9, 0.6);
          ctx.shake(0.3);
          ctx.fx.puff(cp.x, 0.1, cp.z, col);
          ctx.fx.text('PLOF!', cop, { size: 24, color: '#ffd60a' });
          cop.heading = 0;
          say(ctx, cop, '★ ★', { size: 15, color: '#ffe066', dur: 1 });
          B('6b stars: the cop sits in the paint', [cop]);
          cam.close(cop, { dist: 4.5 });
          if (lv >= 4) R.run(R.cop(kid, 7, 0.3, 'POLITIE!'));
          if (lv >= 5 && L.kind !== 'ped') R.run(R.police(-dir, L.chaseZ, 11, 0.5));
          yield* wait(0.3);
          R.run(seeStars(ctx, cop, 1.0));
          yield* wait(1.1);
          // ---- 7. punchline: blue-booted cop, smug critic, a gold underline on the tag
          B('7 punchline: Zie je wel. Kunst. The tag, the critic, the cop in the paint', [cr, cop, tagPt]);
          cam.wide([cr, cop, tagPt], { dist: 14, el: 0.22, az: 0.2 * dir, fit: true });
          yield* wait(0.3);
          yield* getUp(cop, 'sad');
          cop.arms = 'swing';
          cr.mood = 'smug'; cr.arms = 'hips'; cr.lookAt = tagPt;
          say(ctx, cr, 'Zie je wel. Kunst.', { size: 13, color: '#fff' });
          yield* laugh(ctx, cr, 1.0, 'ha');
          ctx.news('Unknown artist tags "070" on transformer box. Critics: "derivative", then "improved"');
          cr.lookAt = null;
          R.give(critic ? cr : null);
          yield* wait(0.3);
          B('8 exit: the cop squelches off, the tag shines', [cop, tagPt]);
          cam.wide(spot, { dist: 18 });
          R.run(R.away(cop, -dir * 6, 3.6));
          if (!critic) R.run(R.away(cr, dir * 6, 3.4));
        } else {
          // the cop skips the footprints: the man holding the spray can next to a fresh tag is the one in front of him
          B('6 the arrest: the cop finds the critic holding the can', [cop, cr]);
          cam.two(cop, cr, { az: -dir * 0.25 });
          yield* go(ctx, cop, cr.g.position.x - dir * 1.1, cr.g.position.z, 4.2);
          faceTo(cop, cr.g.position.x, cr.g.position.z); cop.arms = 'point'; cop.mood = 'smug'; cop.lookAt = cr;
          cr.lookAt = cop; cr.mood = 'shock'; cr.arms = 'up';
          say(ctx, cop, 'IK ZIE HET. DE SPUITBUS.', { size: 13, color: '#7db8ff' });
          yield* wait(0.9);
          R.discard(cr);
          say(ctx, cr, 'MAAR... HET IS KUNST!', { size: 15, color: '#fff' });
          ctx.sfx('cuff'); ctx.shake(0.2);
          cop.arms = 'hips';
          yield* wait(0.8);
          ctx.news('Art critic arrested at scene of "improved" tag. "Het mist diepgang," he repeats');
          cr.mood = 'sad'; cr.arms = 'swing';
          B('7 punchline: the critic is led away past his own gold underline', [cr, cop, tagPt]);
          cam.wide([cr, cop, tagPt], { dist: 14, el: 0.22, az: 0.2 * dir, fit: true });
          yield* wait(0.3);
          R.run(R.away(cop, -dir * 8, 2.8));
          R.run((function* () { yield* wait(0.3); yield* R.away(cr, -dir * 8, 2.8); })());
          yield* wait(0.8);
          B('8 exit: the cop marches him off, the tag shines', [tagPt]);
          cam.wide(spot, { dist: 18 });
        }
        // the wet footprints and the puddle dry up and fade while the camera takes its last look; then it lets go and the rig walks the rest off
        yield* tween(0.8, (t) => { for (const f of prints) f.scale.setScalar(Math.max(0.001, 1 - t)); pud.scale.setScalar(Math.max(0.001, 1 - t)); });
        for (const f of prints) R.rm(f);
        R.rm(pud);
        R.stay(tg);
        bakeTag(tg); // it stays: one mesh from here on
        yield* wait(1.4);
        done = true;
      } finally {
        cam.release();
        if (counted && !done) bx.tags = n;
        R.free(done);
      }
    },
  };
}
