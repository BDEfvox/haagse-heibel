// Dev tool: contact sheets of models side by side on a real street, in a headless Chrome on the dev server.
// It opens a street, hides the crowd (walkers, riders, cars, trams; the lamp posts stay) and the scene props, puts a row of
// test objects on the middle of the road and photographs them with the free camera's own lens (30 degrees), by day or by
// night. Each object is labelled in the picture. A dev tool: nothing in src/ imports it.
//
// usage (dev server `heibel-audit` on http://localhost:5190 must be up; only ONE renderer at a time: no sweep, no live tab on the site):
//   node scripts/dev-sheet.mjs <out-prefix> --set fatbike|niffo|items [--time HH:MM] [--street name|#id] [--turn rad]
//                             [--settle secs] [--seed s] [--w 1440 --h 900] [--hud]
//   <out-prefix>  path and file-name start of the pictures: <prefix>-<set>-<HHMM>-<shot>.png
//   --set fatbike the acted makeBike (one rider), makeFatbike (one rider, two riders) and the crowd's instanced BIKE and
//                 FATBIKE with their riders (built from the crowd's own model and shader), seen three-quarter front;
//                 pictures at 15 m (acted and crowd apart), 40 m and 90 m (all six)
//   --set niffo   the acted niffo with cap and with hood, the crowd's `niffo` and `niffoHood`, front and back, at 8 m and 30 m
//   --set items   every hand-held item of cast.js in a person's hand, in the pose the scenes use for it (and the crowd's
//                 filming pose 7), at the wide shot (30 m, 30 degree lens) and the close shot (8 m with a 26 degree lens,
//                 photographed as the same magnification: 6.9 m with the free camera's 30 degrees); two sheets, one cell each
//   --time        the time of day as `&t=` takes it (default 14:00; 23:00 for night)
//   --street      a street name as `?q=` finds it, or `#<id>` (see dev-shot.mjs); default Weimarstraat
//   --turn        override the objects' turn away from facing the camera (radians; fatbike default -0.8 = three-quarter front)
//   --hud         keep the site's overlays (default: everything but the 3D canvas is hidden)
// The first thing printed is a self-check of the page internals the tool relies on (window.__heibel.stage, its crowd's pools,
// the crowd's rider seats parsed from /src/voxel/crowd.js, the modules it imports); a missing one stops the run with its name.
import fs from 'node:fs';
import { launch, args } from './dev-lib.mjs';

const A = args();
const prefix = A._[0], set = A.set;
const usage = 'usage: node scripts/dev-sheet.mjs <out-prefix> --set fatbike|niffo|items [--time HH:MM] [--street name|#id] [--turn rad] [--settle secs] [--seed s] [--w 1440 --h 900] [--hud]';
if (!prefix || !set || set === true) { console.error(usage); process.exit(2); }
const time = A.time && A.time !== true ? String(A.time) : '14:00';
const street = A.street && A.street !== true ? String(A.street) : 'Weimarstraat';
const width = +A.w || 1440, height = +A.h || 900;
const settle = A.settle !== undefined && A.settle !== true ? +A.settle : 3;
const seed = A.seed !== undefined && A.seed !== true ? A.seed : null;
const turnArg = A.turn !== undefined && A.turn !== true ? +A.turn : null;
if (!/^\d{1,2}:\d{2}$/.test(time)) { console.error('--time needs HH:MM'); process.exit(2); }

// ------------------------------------------------------------------------------------------------ the sets
// Colours of the crowd's figures as the crowd tints them (districts.js archetypes; a plain walker from the cast palettes).
const NIFFO = { shirt: '#c8aa7c', pants: '#c0a276', skin: '#e8b48a', hair: '#151515' };
const CIV = { shirt: '#457b9d', pants: '#2b3a55', skin: '#f2c9a0', hair: '#5a3825' };
// Cell kinds (built in the page, see pageSetup):
//   bike     makeBike(rnd, makePerson(rnd, rider))                       fatbike  makeFatbike(rnd, riders.map(makePerson))
//   person   makePerson(rnd, person) holding item.<item>(...args) at `where` with `arms` (and `scale`, `y` as the scene sets them)
//   crowdRide   the crowd's instanced vehicle `vehicle` with `riders` figures of model `model` (seats and pose as RIDE in crowd.js)
//   crowdFigure the crowd's instanced figure `model`, pose `pose` (iAnim.z)
// turn: radians away from facing the camera (0 = facing it, PI = its back).
const SETS = {
  fatbike: {
    spacing: 3.2,
    cells: [
      { label: 'bike + rider (makeBike)', kind: 'bike', seed: 21, rider: { kind: 'civ', seed: 22 }, turn: -0.8 },
      { label: 'fat-bike, 1 rider (makeFatbike)', kind: 'fatbike', seed: 23, riders: [{ kind: 'niffo', seed: 24 }], turn: -0.8 },
      { label: 'fat-bike, 2 riders (makeFatbike)', kind: 'fatbike', seed: 25, riders: [{ kind: 'niffo', seed: 26, hat: 'cap' }, { kind: 'niffo', seed: 27, hat: 'hood' }], turn: -0.8 },
      { label: 'crowd BIKE + rider', kind: 'crowdRide', vehicle: 'bike', model: 'person', riders: 1, col: '#e63946', look: CIV, turn: -0.8 },
      { label: 'crowd FATBIKE, 1 rider', kind: 'crowdRide', vehicle: 'fatbike', model: 'niffo', riders: 1, col: '#ff6b00', look: NIFFO, turn: -0.8 },
      { label: 'crowd FATBIKE, 2 riders', kind: 'crowdRide', vehicle: 'fatbike', model: 'niffoHood', riders: 2, col: '#151515', look: NIFFO, turn: -0.8 },
    ],
    shots: [
      { name: '15m-acted', on: [0, 1, 2], dist: 15, el: 0.55, crop: 'frame' },
      { name: '15m-crowd', on: [3, 4, 5], dist: 15, el: 0.55, crop: 'frame' },
      { name: '40m', on: 'all', dist: 40, el: 0.55, crop: 'frame' },
      { name: '90m', on: 'all', dist: 90, el: 0.55, crop: 'frame' },
    ],
  },
  niffo: {
    spacing: 1.4,
    cells: [
      { label: 'acted niffo, cap', kind: 'person', person: { kind: 'niffo', seed: 31, hat: 'cap' }, turn: 0 },
      { label: 'acted niffo, hood', kind: 'person', person: { kind: 'niffo', seed: 32, hat: 'hood' }, turn: 0 },
      { label: 'crowd niffo', kind: 'crowdFigure', model: 'niffo', look: NIFFO, pose: 0, turn: 0 },
      { label: 'crowd niffoHood', kind: 'crowdFigure', model: 'niffoHood', look: NIFFO, pose: 0, turn: 0 },
      { label: 'acted niffo, cap (back)', kind: 'person', person: { kind: 'niffo', seed: 31, hat: 'cap' }, turn: Math.PI },
      { label: 'acted niffo, hood (back)', kind: 'person', person: { kind: 'niffo', seed: 32, hat: 'hood' }, turn: Math.PI },
      { label: 'crowd niffo (back)', kind: 'crowdFigure', model: 'niffo', look: NIFFO, pose: 0, turn: Math.PI },
      { label: 'crowd niffoHood (back)', kind: 'crowdFigure', model: 'niffoHood', look: NIFFO, pose: 0, turn: Math.PI },
    ],
    shots: [
      { name: 'front-8m', on: [0, 1, 2, 3], dist: 8, el: 0.12, crop: 'frame' },
      { name: 'back-8m', on: [4, 5, 6, 7], dist: 8, el: 0.12, crop: 'frame' },
      { name: 'all-30m', on: 'all', dist: 30, el: 0.42, crop: 'frame' },
    ],
  },
};
const S = SETS[set];
if (!S) { console.error(`unknown --set "${set}" (one of: ${Object.keys(SETS).join(', ')})`); process.exit(2); }
if (turnArg !== null) for (const c of S.cells) c.turn = c.turn === Math.PI ? Math.PI + turnArg : turnArg;

// ------------------------------------------------------------------------------------------------ page side
/** Runs in the page: finds the internals, imports the modules, builds every cell. Returns { rows, cells } (rows: [name, ok, note]). */
async function pageSetup(spec) {
  const rows = [], need = (name, ok, note = '') => { rows.push([name, !!ok, note]); return !!ok; };
  const H = window.__heibel, st = H && H.stage;
  if (!need('window.__heibel.stage', st)) return { rows };
  const W = st.W, C = st.crowd;
  need('stage.W.path.xz / .at (geo.js:41)', W && W.path && typeof W.path.xz === 'function' && typeof W.path.at === 'function');
  need('stage.W.hAt (world.js:1653)', W && typeof W.hAt === 'function');
  need('stage.locales[0].sc (a spot on the street)', st.locales && st.locales.length && typeof st.locales[0].sc === 'number');
  need('stage.scene, stage.camera, stage.renderer.domElement', st.scene && st.camera && st.renderer && st.renderer.domElement);
  need('stage.rig / stage.goal, stage._setMode', st.rig && st.goal && typeof st._setMode === 'function');
  need('stage.crowd.people (a Pool: put/tint/take/flush, c1-c4, anim)', C && C.people && ['put', 'tint', 'take', 'flush'].every((k) => typeof C.people[k] === 'function') && C.people.c4 && C.people.anim);
  need('stage.crowd.bikes, ._vpool(key), ._pool(model) (crowd.js:430-440)', C && C.bikes && typeof C._vpool === 'function' && typeof C._pool === 'function');
  need('stage.scene.fog.color (a THREE.Color, for the crowd tints)', st.scene && st.scene.fog && st.scene.fog.color && typeof st.scene.fog.color.clone === 'function');
  if (rows.some((r) => !r[1])) return { rows };
  let cast, props, kit;
  try { cast = await import('/src/voxel/cast.js'); props = await import('/src/voxel/props.js'); kit = await import('/src/voxel/kit.js'); } catch (e) { need('import /src/voxel/cast.js, props.js, kit.js', false, String(e)); return { rows }; }
  need('cast.js: makePerson, item, PERSON_K', typeof cast.makePerson === 'function' && cast.item && typeof cast.PERSON_K === 'number');
  need('props.js: makeBike, makeFatbike', typeof props.makeBike === 'function' && typeof props.makeFatbike === 'function');
  need('kit.js: makeRng', typeof kit.makeRng === 'function');
  if (rows.some((r) => !r[1])) return { rows };
  // the crowd's rider seats, from its own source (the dev server serves it)
  let RIDE = null, RIDER_S = null, how = 'parsed from /src/voxel/crowd.js';
  try {
    const txt = await (await fetch('/src/voxel/crowd.js')).text();
    const m1 = txt.match(/const RIDER_Y = ([-\d.]+), RIDER_Z = ([-\d.]+), RIDER_S = ([\d.]+) \* PERSON_K;/), m2 = txt.match(/const RIDE = (\{.*\});/);
    if (m1 && m2) { RIDE = new Function('RIDER_Y', 'RIDER_Z', 'return ' + m2[1])(+m1[1], +m1[2]); RIDER_S = +m1[3] * cast.PERSON_K; }
  } catch (e) { /* the fallback below */ }
  if (!RIDE) { RIDE = { bike: { y: 0.52, z: -0.28, z2: 0 }, fatbike: { y: 0.33, z: -0.1, z2: -0.5 }, cargo: { y: 0.4, z: -0.46, z2: 0 } }; RIDER_S = 1.2 * cast.PERSON_K; how = 'NOT FOUND in /src/voxel/crowd.js: fallback constants used'; }
  need('crowd RIDE seats and rider pose', RIDE.bike && RIDE.fatbike, how + ': ' + JSON.stringify(RIDE) + ' RIDER_S ' + RIDER_S.toFixed(3));

  const Color = st.scene.fog.color.constructor, V = st.camera.position.constructor, Obj3D = Object.getPrototypeOf(st.scene.constructor.prototype).constructor; // (THREE.Color, Vector3, Object3D: the page's own three)
  const rgb = (h) => { const c = new Color(h); return [c.r, c.g, c.b]; };
  const Pool = C.people.constructor, mat = C.people.mesh.material;
  const old = window.__sheet;
  if (old && old.root) { st.scene.remove(old.root); for (const p of old.pools) st.scene.remove(p.mesh); }
  const root = new Obj3D();
  st.scene.add(root);
  // pools of our own, made from the crowd's model geometry and its material (so the crowd's shader draws them), added to the scene
  const pools = [], poolOf = new Map();
  const pool = (key, anim) => {
    if (poolOf.has(key)) return poolOf.get(key);
    const src = anim ? (key === 'person' ? C.people : C._pool(key)) : key === 'bike' ? C.bikes : C._vpool(key);
    const p = new Pool(src.mesh.geometry, mat, 12, anim);
    p.mesh.renderOrder = 1;
    st.scene.add(p.mesh); pools.push(p); poolOf.set(key, p);
    return p;
  };
  const tintFig = (p, i, L) => { p.tint(p.c1, i, rgb(L.shirt)); p.tint(p.c2, i, rgb(L.pants)); p.tint(p.c3, i, rgb(L.skin)); p.tint(p.c4, i, rgb(L.hair)); };
  const setAnim = (p, i, ph, amp, pose, tip) => { const a = p.anim.array, o = i * 4; a[o] = ph; a[o + 1] = amp; a[o + 2] = pose; a[o + 3] = tip; };

  // the row: along the street through the first spot, on the middle of the road; the camera stands on the +v side (as the street view does)
  const n = spec.cells.length, sc = st.locales[0].sc, f = {};
  const cells = [];
  for (let i = 0; i < n; i++) {
    const c = spec.cells[i], s = sc + (i - (n - 1) / 2) * spec.spacing;
    const p = W.path.xz(s, 0, [0, 0]);
    W.path.at(s, f);
    const face = Math.atan2(-f.tz, f.tx), hd = face + (c.turn || 0), y = W.hAt(p[0], p[1]);
    const cell = { i, label: c.label, x: p[0], y, z: p[1], hd, face, obj: null, box: null };
    const rnd = kit.makeRng(c.seed || 1 + i);
    try {
      if (c.kind === 'bike' || c.kind === 'fatbike' || c.kind === 'person') {
        let a, upd;
        if (c.kind === 'bike') { const r = cast.makePerson(kit.makeRng(c.rider.seed), c.rider); a = props.makeBike(rnd, r); upd = (dt) => { a.update(dt); a.tick && a.tick(dt); }; }
        else if (c.kind === 'fatbike') { const rs = c.riders.map((q) => cast.makePerson(kit.makeRng(q.seed), q)); a = props.makeFatbike(rnd, rs); upd = (dt) => { a.update(dt); a.tick && a.tick(dt); }; }
        else {
          a = cast.makePerson(kit.makeRng(c.person.seed), c.person);
          if (c.item) {
            const fn = cast.item[c.item];
            if (typeof fn !== 'function') throw new Error('no item.' + c.item);
            const o = fn(...(c.args || []));
            if (c.where === 'body') { a.b.add(o); o.position.set(...(c.at || [0.62, 0.8, 0])); } else a.hold(o, c.where || 'hand');
            if (c.scale) o.scale.setScalar(c.scale);
            if (c.y !== undefined) o.position.y = c.y;
          }
          if (c.arms) a.arms = c.arms;
          upd = (dt) => a.update(dt);
        }
        a.g.position.set(cell.x, y, cell.z);
        a.face(hd);
        for (let k = 0; k < 40; k++) { a.moving = 0; upd(0.05); }
        a.face(hd);
        root.add(a.g);
        cell.obj = a.g;
      } else if (c.kind === 'crowdRide') {
        const rd = RIDE[c.vehicle] || RIDE.bike, vp = pool(c.vehicle, false), fp = pool(c.model, true);
        const slot = vp.take(), sn = Math.sin(hd), cs = Math.cos(hd);
        vp.put(slot, cell.x, y, cell.z, hd, 1);
        vp.tint(vp.c1, slot, rgb(c.col));
        for (let k = 0; k < (c.riders || 1); k++) {
          const dz = k ? rd.z2 : rd.z, r = fp.take();
          fp.put(r, cell.x + sn * dz, y + rd.y, cell.z + cs * dz, hd, RIDER_S * (k ? 0.97 : 1));
          tintFig(fp, r, c.look); setAnim(fp, r, 0.8 + k * 1.7, 0, rd.pose || 1, 0);
        }
        cell.local = { x: 0.45, y0: 0, y1: 2.1, z: 1.0 };
      } else if (c.kind === 'crowdFigure') {
        const fp = pool(c.model, true), r = fp.take(), s = 1.25 * cast.PERSON_K;
        fp.put(r, cell.x, y, cell.z, hd, s);
        tintFig(fp, r, c.look); setAnim(fp, r, 0.8, c.pose ? 1 : 0, c.pose || 0, 0);
        cell.local = { x: 0.6 * s, y0: 0, y1: 2.25 * s, z: 0.6 * s };
      } else throw new Error('unknown cell kind ' + c.kind);
    } catch (e) { need('cell ' + i + ' ' + c.label, false, String(e && e.stack || e).slice(0, 300)); }
    cells.push(cell);
  }
  for (const p of pools) p.flush();
  root.updateMatrixWorld(true);
  // the box of each cell, in world space (eight corners), for its label and crop
  const corners = (b) => [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new V(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z));
  for (const cell of cells) {
    const pts = [];
    if (cell.obj) {
      cell.obj.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        for (const q of corners(m.geometry.boundingBox)) pts.push(q.applyMatrix4(m.matrixWorld));
      });
    } else if (cell.local) {
      const L = cell.local, sn = Math.sin(cell.hd), cs = Math.cos(cell.hd);
      for (const [lx, ly, lz] of [[-1, 0, -1], [1, 0, -1], [-1, 0, 1], [1, 0, 1], [-1, 1, -1], [1, 1, -1], [-1, 1, 1], [1, 1, 1]]) {
        const ax = lx * L.x, az = lz * L.z;
        pts.push(new V(cell.x + ax * cs + az * sn, cell.y + (ly ? L.y1 : L.y0), cell.z - ax * sn + az * cs));
      }
    }
    cell.pts = pts;
  }
  // hide the crowd's moving parts (the lamp posts stay, so the night looks as it does) and the scene props: layer 31 is never drawn
  const hide = () => {
    const ms = [C.people, C.cars, C.bikes, C.trams, ...C.pools.values(), ...C.vpools.values()].filter(Boolean).map((p) => p.mesh);
    if (C.beams) ms.push(C.beams);
    for (const m of ms) m.layers.set(31);
    if (st.dyn) st.dyn.visible = false;
  };
  hide();
  // labels: one layer over the canvas
  let lay = document.getElementById('__sheetLabels');
  if (!lay) { lay = document.createElement('div'); lay.id = '__sheetLabels'; document.body.appendChild(lay); }
  lay.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;font:600 13px/1.25 Menlo,monospace;';
  if (!spec.hud) { // everything that is not on the canvas's line of ancestors goes (the HUD, pins, toasts, the map)
    let el = st.renderer.domElement;
    while (el && el !== document.body) { for (const sib of el.parentElement ? el.parentElement.children : []) if (sib !== el && sib !== lay && sib.tagName !== 'SCRIPT') sib.style.visibility = 'hidden'; el = el.parentElement; }
  }
  window.__sheet = { root, pools, cells, hide, lay };
  need('cells built', cells.length === n && cells.every((c) => c.pts && c.pts.length), cells.length + ' of ' + n);
  return { rows, cells: cells.map((c) => ({ i: c.i, label: c.label, x: +c.x.toFixed(2), z: +c.z.toFixed(2), hd: +c.hd.toFixed(3), pts: c.pts.length })) };
}

/** Page side: free camera on the cells `on` (indices), at dist / el, az = facing the row + yaw. Rig and goal both, so nothing glides. */
function pageAim(shot) {
  const st = window.__heibel.stage, W = st.W, S = window.__sheet, on = shot.on.map((i) => S.cells[i]);
  st.hooks.onRoam = null;
  S.hide();
  const tx = on.reduce((a, c) => a + c.x, 0) / on.length, tz = on.reduce((a, c) => a + c.z, 0) / on.length;
  const face = Math.atan2(on.reduce((a, c) => a + Math.sin(c.face), 0), on.reduce((a, c) => a + Math.cos(c.face), 0));
  if (st.mode !== 'free') st._setMode('free');
  const ty = W.landY(tx, tz) + 1.5; // (free mode holds the target this high above the ground)
  for (const o of [st.rig, st.goal]) Object.assign(o, { tx, tz, ty, az: face + (shot.yaw || 0), el: shot.el, dist: shot.dist, roll: 0 });
  window.__shotW = W;
  return { mode: st.mode, tx: +tx.toFixed(2), tz: +tz.toFixed(2), az: +(face + (shot.yaw || 0)).toFixed(4) };
}

/** Page side: labels under the cells `on`, and each cell's box on the screen (CSS pixels). */
function pageLabels(shot) {
  const st = window.__heibel.stage, S = window.__sheet, cam = st.camera, R = st.renderer.domElement.getBoundingClientRect();
  const r = st.rig, err = Math.abs(r.dist - shot.dist) + Math.abs(r.el - shot.el);
  S.lay.innerHTML = '';
  const out = [];
  const head = document.createElement('div');
  head.textContent = shot.title;
  head.style.cssText = 'position:absolute;left:8px;top:6px;padding:2px 6px;background:rgba(0,0,0,.72);color:#fff;';
  if (shot.crop === 'frame') S.lay.appendChild(head);
  for (const i of shot.on) {
    const c = S.cells[i];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, behind = false;
    for (const p of c.pts) {
      const q = p.clone().project(cam);
      if (q.z > 1) behind = true;
      const sx = R.left + ((q.x + 1) / 2) * R.width, sy = R.top + ((1 - q.y) / 2) * R.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const l = document.createElement('div');
    l.textContent = c.label;
    l.style.cssText = `position:absolute;left:${((x0 + x1) / 2).toFixed(0)}px;top:${(y1 + 4).toFixed(0)}px;transform:translateX(-50%);padding:1px 5px;background:rgba(0,0,0,.72);color:#fff;white-space:nowrap;`;
    S.lay.appendChild(l);
    out.push({ i, x0, y0, x1, y1: y1 + 22, behind });
  }
  return { rects: out, camErr: +err.toFixed(3), fov: +cam.fov.toFixed(2), vw: innerWidth, vh: innerHeight };
}

/** Page side: how much work the tile streamer still has (as dev-shot.mjs). */
function pagePending() {
  const st = window.__heibel.stage, W = st.W;
  if (W !== window.__shotW) return { moved: true };
  const S = W.stream;
  if (!S) return { todo: 0, jobs: 0, nostream: true };
  const want = S.want || [];
  let todo = (S.pending ? S.pending.size : 0) + (S.ready ? S.ready.size : 0) + (S.staged ? S.staged.size : 0) + (S.busy ? 1 : 0) + (S.target !== null && S.target !== undefined ? 1 : 0) + (st.tr ? 1 : 0);
  for (const k of want) { const c = S.live.get(k); if (S.failed && S.failed.has(k) && !S.live.has(k)) continue; if (!c || c.lod > S.lodOf.get(k)) todo++; }
  let jobs = 0;
  for (const c of S.live.values()) if (c.cells) for (const cell of c.cells) if (cell.job) jobs++;
  return { todo, jobs };
}

// ------------------------------------------------------------------------------------------------ node side
const hhmm = time.replace(/[^0-9]/g, '').padStart(4, '0'); // (digits only: nothing from --time reaches the path but these)
const file = (name) => `${prefix}-${set}-${hhmm}-${name}.png`;
const B = await launch({ width, height, dpr: 1, tag: 'sheet' });
try {
  const byId = street[0] === '#';
  const opened = await B.open(byId ? 'x' : street, { time, only: 'napCat', seed, query: byId ? `x=1#s=${+street.slice(1)}` : '' });
  if (!opened) throw new Error(`the street "${street}" did not open (no landing within the time limit): is the dev server up on :5190, and is the name exact?`);
  const spec = { cells: S.cells, spacing: S.spacing, hud: !!A.hud };
  const res = await B.ev(`(${pageSetup})(${JSON.stringify(spec)})`, 300000);
  console.log('self-check:\n' + res.rows.map((r) => `  ${r[1] ? 'ok     ' : 'MISSING'} ${r[0]}${r[2] ? '  (' + r[2] + ')' : ''}`).join('\n'));
  const miss = res.rows.filter((r) => !r[1]);
  if (miss.length) throw new Error('self-check failed: ' + miss.map((r) => r[0]).join('; '));
  console.log('cells: ' + res.cells.map((c) => `${c.i} ${c.label} @(${c.x}, ${c.z}) hd ${c.hd}`).join('\n       '));

  const raf = () => B.ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const waitCalm = async (first) => {
    await B.ev(`new Promise((r) => setTimeout(r, ${Math.round((first ? settle : Math.min(settle, 1.2)) * 1000)}))`);
    let calm = 0, last = '', waited = 0;
    while (waited < 45) {
      const p = await B.ev(`(${pagePending})()`);
      if (p.moved) throw new Error('the focus shifted to another street (stage.W changed)');
      const key = JSON.stringify(p);
      if (p.todo === 0 && p.jobs === 0 && key === last) calm += 0.5; else calm = 0;
      last = key;
      if (calm >= 1) return true;
      await B.ev('new Promise((r) => setTimeout(r, 500))');
      waited += 0.5;
    }
    return false;
  };
  const clipShot = async (rect) => {
    const r = await B.send('Page.captureScreenshot', { format: 'png', ...(rect ? { clip: { ...rect, scale: 1 } } : {}) });
    return Buffer.from(r.data, 'base64');
  };
  const all = S.cells.map((c, i) => i);
  let first = true;
  for (const sh of S.shots) {
    const on = sh.on === 'all' ? all : sh.on;
    const shot = { ...sh, on, title: `${set} ${sh.name} - ${sh.dist} m, el ${sh.el}, ${time} - ${street}` };
    const aim = await B.ev(`(${pageAim})(${JSON.stringify(shot)})`);
    const calm = await waitCalm(first); first = false;
    await raf();
    const lab = await B.ev(`(${pageLabels})(${JSON.stringify(shot)})`);
    await raf();
    const out = file(sh.name);
    fs.writeFileSync(out, await clipShot(null));
    const off = lab.rects.filter((q) => q.behind || q.x1 < 0 || q.x0 > lab.vw || q.y1 < 0 || q.y0 > lab.vh).map((q) => q.i);
    console.log(`${out}: target (${aim.tx}, ${aim.tz}) az ${aim.az} fov ${lab.fov}${lab.camErr > 0.05 ? ' CAMERA NOT WHERE ASKED (err ' + lab.camErr + ')' : ''}; streamer ${calm ? 'settled' : 'NOT settled'}${off.length ? '; cells out of the picture: ' + off.join(', ') : ''}`);
  }
  console.log('console errors: ' + (B.errs.length ? '\n  ' + [...new Set(B.errs)].slice(0, 10).join('\n  ') : 'none'));
} catch (e) {
  console.error('dev-sheet failed: ' + (e && e.message ? e.message : e));
  if (B.errs.length) console.error('console errors:\n  ' + [...new Set(B.errs)].slice(0, 10).join('\n  '));
  process.exitCode = 1;
} finally {
  await B.close();
}
