// Dev tool: the clipping counter. Opens fixed streets at a fixed hour, seed and crime level in a headless Chrome, runs a fixed
// stretch of STAGE time on fast-forward with the director playing scenes as usual, and counts, per minute of stage time and split
// into the instanced crowd, the actors of scenes, the passers-by borrowed by scenes and an optional player walker:
//   pairs        two people on foot whose centres are closer than a body's width (--body, 0.45 m), both within --range of the camera
//                target; `staged` holds the deliberately close ones (a standing hanging group, two actors of the same scene), counted
//                only below half a body width; pair-samples and distinct pair-events (an overlap that lasts is one event)
//   hitVehicle   a pedestrian's centre inside the footprint of a moving vehicle (crowd car, bike, tram section, scene vehicle)
//   inBuilding   centre inside what the tiles DRAW of a building, below its roof: the footprint ring; a building with street fronts
//                whose cell has its detailed fronts built: its front units and their backs (world.js frontsOf); else its rect cover
//                b.rects (boxy: the bounding box; else rectsOf, as drawGeneric and the typed drawers draw it); a building drawn from
//                parts: the ring only. Hints footprint / facade / block. (W.solid, a 1 m raster of the rects, reaches past the walls:
//                a hit of W.solid alone is the diagnostic nearWall, not a defect.) A door scene's actor at its door: byDesign.
//   inFurniture  centre inside street furniture (tile props with setting.js FURN radii, parked cars, lamp posts, group bikes, trunks);
//                inFurnitureCore (THE metric): within half the FURN radius, inside the car shrunk by 0.15 m, inside a post's radius
//   barrier      centre within 0.15 m of a fence, wall or hedge of the tiles (t.x), beyond half its thickness
//   inWater, badGround (a class that kind may not use), onRoad (a walker on the carriageway, not crossing), crossing (by design), unknown
//                (boats, and people posed or in the air: byDesign)
//   float / sink / overhang  feet against W.hAt under the footprint (foot boxes, wheels). People: float = the whole footprint more than
//                0.15 m above the ground, sink = some contact point more than 0.15 m under it, overhang = a drop of more than 0.3 m under
//                a foot (a kerb edge, 0.15-0.3 m, is the diagnostic edge). Actors lifted in their street space (a hop, a lift: position.y >
//                0.03) are not tested (scriptLift). Vehicles: a wheel on a RAIL cell (the rails are drawn as 0.2 m bars) is left out
//                and counted in `rail`; sink = a wheel more than 0.15 m under the ground; float = two or more wheels more than 0.15 m
//                above it. Trams are not tested (their rails run under the body).
//   vv           two vehicle footprints overlapping by more than 0.2 m (not two sections of one tram, not two of one scene)
//   inside       a person (not fauna, not posed) in a building, furniture core, a barrier or water: the NOBODY-INSIDE pass line
//   Birds and animals of the scenes are the group `fauna`, not people.
// Read-only: it calls only stage._frame (the fast-forward the storyboard audit uses) and reads state; it draws no random numbers.
// Needs the dev server without auto-reload (launch config heibel-audit, http://localhost:5190; another with HEIBEL_URL) and Chrome.
// usage: node scripts/dev-count.mjs <out.json> [--streets "A;B;C;D"] [--time 14:00] [--seed count] [--lvl 4] [--secs 120]
//        [--only <gag>] [--every 5] [--range 80] [--body 0.45] [--tol 0.15] [--strict]
//   The table is printed twice: per minute of stage time, and per 1000 samples of that group (judge changes on the second: fixes
//   change where the camera goes and how many it sees). Last line: NOBODY-INSIDE PASS or FAIL (--strict: exit 1 on FAIL).
import fs from 'node:fs';
import { launch, args } from './dev-lib.mjs';

// a busy shopping street, a square with terraces, a street with a tram, a quay along a canal (see the report of the first run)
const STREETS = ['Grote Marktstraat', 'Grote Markt', 'Torenstraat', 'Bierkade'];
const A = args();
const outFile = A._[0];
if (!outFile) {
  console.error('usage: node scripts/dev-count.mjs <out.json> [--streets "A;B;C;D"] [--time 14:00] [--seed count] [--lvl 4] [--secs 120] [--only <gag>] [--every 5] [--range 80] [--body 0.45] [--tol 0.15]');
  process.exit(2);
}
const num = (v, d) => (v === undefined || v === true || !Number.isFinite(+v) ? d : +v);
const streets = (typeof A.streets === 'string' ? A.streets : STREETS.join(';')).split(';').map((s) => s.trim()).filter(Boolean);
const cfg = {
  time: typeof A.time === 'string' ? A.time : '14:00',
  seed: typeof A.seed === 'string' ? A.seed : 'count',
  lvl: num(A.lvl, 4),
  only: typeof A.only === 'string' ? A.only : null, // null: no `only` in the URL (dev-lib's default would be napCat)
  secs: num(A.secs, 120),
  every: Math.max(1, Math.round(num(A.every, 5))),
  range: num(A.range, 80),
  body: num(A.body, 0.45),
  tol: num(A.tol, 0.15), // the feet tolerance; note the pavement kerb step is 0.14 (world.js:1101)
};

// ------------------------------------------------------------------------------------------------ page side
// Injected once per page as window.__count = { init, run, result }. Self-contained: it may not use anything of this module.
function pageCode() {
  const H = window.__heibel;
  const fail = (m) => { throw new Error('dev-count: ' + m); };
  const need = (v, m) => { if (!v) fail(m); return v; };
  const GROUPS = ['crowd', 'actors', 'borrowed', 'walker', 'fauna'];
  const COUNTERS = ['pairs', 'pairEvents', 'staged', 'stagedEvents', 'hitVehicle', 'inBuilding', 'inFurniture', 'inFurnitureCore',
    'inWater', 'badGround', 'onRoad', 'crossing', 'unknown', 'float', 'sink', 'overhang', 'rail', 'barrier', 'vv', 'inside', 'nearWall', 'byDesign',
    'scriptLift', 'edge'];
  const HIST = [0.15, 0.25, 0.35, 0.45, 0.55, 0.7]; // centre distances of non-staged pairs: samples closer than each
  const HB = 0.7; // the pair search radius (the widest bin)
  let TOL = 0.15; // feet tolerance (cfg.tol)
  const ids = new WeakMap();
  let nextId = 1, S = null;
  const idOf = (o, p) => { let i = ids.get(o); if (!i) { i = nextId++; ids.set(o, i); } return p + i; };
  const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;

  // crowd model sizes (crowd.js): half length (local z) and half width (local x) of each vehicle model in metres
  // car 3.3 x 1.6 scaled 1.333 / 1.156 (crowd.js:120-130); bike wheels z +-0.5 r 0.28, bars 0.5, scaled 1.19 (131-136);
  // fat-bike wheels z +-0.6 r 0.35, bars 0.64 (139-145); cargo bike z -1.26..1.75, box 0.95 (147-155); tram section 5.2 x 2.4 (169-175)
  const DIM = { car: [2.2, 0.925], bike: [0.93, 0.3], fatbike: [0.95, 0.32], cargo: [1.5, 0.48], tram: [2.6, 1.2] };
  // contact points in the model's own units (scale comes from the matrix): shoe boxes x +-0.2 (w 0.32), z 0.05 (d 0.44) (crowd.js:66,
  // cast.js:153); car wheels x +-0.68, z +-0.95 before the 1.156/1.333 scale = +-0.79, +-1.27 m (crowd.js:124); tram bogies 2.0 wide at
  // z +-1.5 (crowd.js:172); scene vehicles: warp's own axle points, 0.36 len and 0.42 wid (stage.js:160)
  const FEET = [[-0.36, -0.17], [0.36, -0.17], [-0.36, 0.27], [0.36, 0.27]];
  const WHEELS = { car: [[-0.79, -1.27], [0.79, -1.27], [-0.79, 1.27], [0.79, 1.27]], bike: [[0, -0.6], [0, 0.6]], fatbike: [[0, -0.6], [0, 0.6]],
    cargo: [[0, -0.95], [0, 1.5]], tram: [[-1, -1.5], [1, -1.5], [-1, 1.5], [1, 1.5]], bird: [[0, -0.1], [0, 0.1]] };
  const LAMP_R = [0.2, 0.35, 0.15, 0.2]; // crowd.obstacles' lamp post radii by kind (crowd.js:1474)

  const blankG = () => { const o = { sampled: 0, noFeet: 0, worstFloat: 0, worstSink: 0, worstOverhang: 0 }; for (const k of COUNTERS) o[k] = 0; return o; };
  function minute(i) {
    let M = S.min[i];
    if (!M) {
      M = S.min[i] = { minute: i, samples: 0, g: {}, d: {}, byPair: { pairs: {}, staged: {} }, hist: HIST.map(() => 0) };
      for (const g of GROUPS) { M.g[g] = blankG(); M.d[g] = {}; }
    }
    return M;
  }
  const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

  /** One flagged thing: counts, distinct ids, the kind table, the hints, and the 12 worst examples (by value, one per id key). */
  function flag(M, counter, grp, kind, x, z, idl, value, hints, t) {
    const key = idl.join('|');
    M.g[grp][counter]++;
    (M.d[grp][counter] ||= new Set()).add(key);
    bump((S.byKind[counter] ||= {}), kind);
    const ht = (S.hints[counter] ||= {});
    for (const h of hints) bump(ht, h);
    const ex = (S.ex[counter] ||= []), v = Math.abs(value);
    const j = ex.findIndex((e) => e.key === key);
    if (j >= 0) { if (v <= Math.abs(ex[j].value)) return; ex.splice(j, 1); }
    if (ex.length >= 12 && v <= Math.abs(ex[ex.length - 1].value)) return;
    const m = S.W.frame.M(x, z);
    ex.push({ key, t: r2(t), grp, kind, map: [r2(m[0]), r2(m[1])], scene: [r2(x), r2(z)], ids: idl, value: r3(value), hints: [...new Set(hints)] });
    ex.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    if (ex.length > 12) ex.length = 12;
  }

  /** x, z of the local point (lx, lz) through a column-major matrix (Pool.put, crowd.js:298-302; Object3D.matrixWorld). */
  const xf = (m, o, lx, lz) => [m[o] * lx + m[o + 8] * lz + m[o + 12], m[o + 2] * lx + m[o + 10] * lz + m[o + 14]];
  /** An instance slot as drawn: position, unit forward (local +z), scale; null when the slot is hidden (scale 0). */
  function slotOf(P, slot) {
    if (!P || !(P.m instanceof Float32Array)) fail('crowd pool matrix array (Pool.m) not found');
    if (!(slot >= 0)) return null;
    const m = P.m, o = slot * 16, sy = m[o + 5], fh = Math.hypot(m[o + 8], m[o + 10]);
    if (!(sy > 1e-4) || !(fh > 1e-6)) return null;
    return { m, o, x: m[o + 12], y: m[o + 13], z: m[o + 14], fx: m[o + 8] / fh, fz: m[o + 10] / fh, s: sy };
  }
  /** The vertex shader's walking bob (crowd.js:212), from its CPU inputs iAnim (x phase, y stride, z pose), in metres. */
  function bobOf(P, slot, s) {
    if (!P.anim || !P.anim.array) return 0;
    const an = P.anim.array, o = slot * 4, ride = an[o + 2];
    return Math.abs(Math.sin(an[o])) * 0.1 * Math.min(1, an[o + 1] * 2) * (ride > 4.5 && ride < 5.5 ? 1 : 1 - Math.min(ride, 1)) * s;
  }

  async function init(o) {
    try {
      need(H && typeof H === 'object', 'window.__heibel not found (dev server only)');
      const st = need(H.stage, '__heibel.stage not found');
      need(typeof st._frame === 'function', 'stage._frame not found');
      const W = need(st.W, 'stage.W not found (no street open)');
      need(typeof W.hAt === 'function', 'W.hAt not found');
      need(typeof W.clsAt === 'function', 'W.clsAt not found');
      const Cl = need(W.C, 'W.C (ground classes) not found');
      for (const k of ['WATER', 'SEA', 'BUILDING', 'WALK', 'LAND', 'PLAZA', 'FOOT', 'PED', 'CURB', 'DIRT', 'ASPHALT', 'KLINKER', 'SERVICE', 'CYCLE', 'BIKELANE', 'MARK', 'PARKING', 'RAILBED', 'RAIL', 'GRASS', 'SAND', 'DUNE', 'PITCH', 'FARM'])
        need(Number.isInteger(Cl[k]), 'ground class W.C.' + k + ' not found');
      need(W.solid && typeof W.solid.get === 'function' && Number.isFinite(W.solid.y0), 'W.solid (building grid with get and y0) not found');
      need(W.frame && typeof W.frame.M === 'function' && typeof W.frame.S === 'function', 'W.frame.M / W.frame.S not found');
      need(W.stream && W.stream.live instanceof Map, 'W.stream.live (the tiles on screen) not found');
      need(typeof W.treeNear === 'function', 'W.treeNear not found');
      need(W.st && typeof W.st.name === 'string', 'W.st.name not found');
      const C = need(st.crowd, 'stage.crowd not found');
      need(Array.isArray(C.agents), 'crowd.agents not found');
      need(C.owners instanceof Map, 'crowd.owners not found');
      need(Array.isArray(C.blockers), 'crowd.blockers not found');
      for (const k of ['people', 'cars', 'bikes', 'trams']) need(C[k] && C[k].m instanceof Float32Array, 'crowd.' + k + '.m (instance matrices) not found');
      need(C.people.anim && C.people.anim.array, 'crowd.people.anim (iAnim) not found');
      need(Array.isArray(st.actors), 'stage.actors not found');
      need(st.gags instanceof Set, 'stage.gags not found');
      need(st.rig && Number.isFinite(st.rig.tx) && Number.isFinite(st.rig.tz), 'stage.rig.tx / tz not found');
      need(Number.isFinite(st.time), 'stage.time not found');
      const cm = await import('/src/voxel/crowd.js');
      for (const k of ['PED', 'BIKE_', 'CAR_', 'TRAM_']) need(Number.isInteger(cm[k]), 'crowd.js export ' + k + ' not found');
      const sm = await import('/src/voxel/setting.js');
      need(sm.FURN && typeof sm.furnOf === 'function', 'setting.js FURN / furnOf not found');
      const gm = await import('/src/voxel/geo.js');
      need(typeof gm.obbOf === 'function' && typeof gm.rectsOf === 'function', 'geo.js obbOf / rectsOf not found');
      need(W.city && typeof W.city.landAt === 'function', 'W.city.landAt not found');
      const warn = [];
      const a0 = C.agents.find((a) => !a.dead && a.vis && a.kind === cm.PED);
      if (a0) {
        for (const k of ['x', 'z', 'hd', 'kind', 'slot', 'pp', 'lane', 's', 'v', 'look', 'sc', 'ox', 'oz', 'sm', 'pop', 'ghost', 'wait']) need(k in a0, 'crowd agent field ' + k + ' not found');
        need(a0.lane.pts && Number.isFinite(a0.lane.len) && Number.isFinite(a0.lane.step), 'crowd lane pts / len / step not found');
      } else warn.push('no visible crowd walker yet: agent fields not checked');
      let groups = 0, members = 0;
      for (const ow of C.owners.values()) {
        need(Array.isArray(ow.groups) && Array.isArray(ow.parked) && Array.isArray(ow.lamps) && Array.isArray(ow.pend), 'crowd owner groups / parked / lamps / pend not found');
        for (const g of ow.groups) if (g.shown) {
          groups++;
          for (const m of g.members) { members++; need('x' in m && 'z' in m && 'slot' in m && 'pp' in m && 'hd' in m, 'group member fields x, z, slot, pp, hd not found'); }
        }
      }
      for (const a of st.actors) if (a && a.alive) need(a.g && a.g.matrixWorld && a.g.matrixWorld.elements, 'actor.g.matrixWorld not found');
      // a passer-by a scene borrowed keeps the very look object the crowd agent had (crowd.take, crowd.js:992; promote, stage.js:1104):
      // every look seen on a crowd agent is remembered, so an actor wearing one is borrowed (dead agents linger in the list a while)
      const crowdLooks = new WeakSet();
      for (const a of C.agents) if (a.look) crowdLooks.add(a.look);
      TOL = Number.isFinite(o.tol) ? o.tol : 0.15;
      st.running = false; // the fast-forward drives the frames from now on (as audit.js does)
      S = {
        cfg: o, W, crowd: C, name: W.st.name, K: { PED: cm.PED, BIKE_: cm.BIKE_, CAR_: cm.CAR_, TRAM_: cm.TRAM_ }, Cl, furnOf: sm.furnOf, geo: gm, blds: new Map(), bars: [],
        t0: st.time, now: performance.now(), steps: 0, samples: 0, maxSteps: Math.ceil((o.secs / 0.0333) * 4), min: [], ex: {}, hints: {}, byKind: {},
        prev: new Map(), lastPair: new Map(), crowdLooks, actorLooks: new WeakMap(), propSig: '', props: [], modes: {}, frameErrs: [],
        walker: { seen: 0, noPos: 0, src: null }, maxActors: 0, warn, sampleErrs: [],
        sets: null,
      };
      // which ground a kind may use
      const set = (...ks) => { const a = new Uint8Array(256); for (const k of ks) a[Cl[k]] = 1; return a; };
      S.sets = {
        walk: set('WALK', 'LAND', 'PLAZA', 'FOOT', 'PED', 'CURB', 'DIRT'), // crowd walkers: walk[] = 2 (crowd.js:459)
        road: set('ASPHALT', 'KLINKER', 'SERVICE', 'CYCLE', 'BIKELANE', 'MARK', 'PARKING', 'RAILBED', 'RAIL'), // walk[] = 1, road[] (crowd.js:460)
        bike: set('ASPHALT', 'KLINKER', 'SERVICE', 'CYCLE', 'BIKELANE', 'MARK', 'PARKING', 'RAILBED', 'RAIL', 'CURB'),
        // scene people: setting.js NAMES.walk + NAMES.road (setting.js:18-27); scene cars: NAMES.road
        open: set('LAND', 'GRASS', 'SAND', 'DUNE', 'PLAZA', 'PARKING', 'DIRT', 'FOOT', 'PED', 'WALK', 'CURB', 'KLINKER', 'PITCH', 'FARM', 'ASPHALT', 'SERVICE', 'CYCLE', 'BIKELANE', 'MARK', 'RAILBED', 'RAIL'),
        sroad: set('ASPHALT', 'KLINKER', 'SERVICE', 'CYCLE', 'BIKELANE', 'MARK', 'CURB', 'PARKING', 'RAILBED', 'RAIL'),
      };
      let props = 0;
      for (const c of W.stream.live.values()) if (c && Array.isArray(c.props)) props += c.props.length;
      const kinds = {};
      for (const a of C.agents) if (!a.dead && a.vis) bump(kinds, a.kind);
      return { ok: true, street: W.st.name, mode: st.mode, time: r2(st.time), found: {
        agentsVisibleByKind: kinds, owners: C.owners.size, groupsShown: groups, members, actors: st.actors.length, blockers: C.blockers.length,
        liveTiles: W.stream.live.size, tileProps: props, streetProps: Array.isArray(W.props) ? W.props.length : null, solid: [W.solid.w, W.solid.h, r2(W.solid.y0)],
        furnKinds: Object.keys(sm.FURN).length, walkerHook: st.walker !== undefined && st.walker !== null,
      }, warn };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  }

  async function run(budgetMs) {
    const st = H.stage, w0 = performance.now();
    st.running = false;
    let k = 0;
    while (st.time - S.t0 < S.cfg.secs && S.steps < S.maxSteps) {
      try { st._frame((S.now += 33.3)); } catch (e) { S.frameErrs.push(String((e && e.message) || e).slice(0, 200)); if (S.frameErrs.length > 30) fail('stage._frame keeps throwing: ' + S.frameErrs[0]); }
      S.steps++;
      if (S.steps % S.cfg.every === 0) {
        try { sample(); } catch (e) {
          // a deliberate check (dev-count: ...) stops the street; anything else is kept with its stack and the run goes on
          if (/^dev-count:/.test(String(e && e.message))) throw e;
          S.sampleErrs.push({ t: r2(st.time - S.t0), err: String((e && e.stack) || e).slice(0, 500) });
          if (S.sampleErrs.length > 20) fail('sample() keeps throwing: ' + S.sampleErrs[0].err.slice(0, 300));
        }
      }
      if (++k % 10 === 0) {
        await new Promise((r) => setTimeout(r, 0)); // let tile loads and other promises land between frames
        if (performance.now() - w0 > budgetMs) break;
      }
    }
    return { done: !(st.time - S.t0 < S.cfg.secs) || S.steps >= S.maxSteps, t: r2(st.time - S.t0), steps: S.steps, samples: S.samples, mode: st.mode, actors: st.actors.length, sampleErrs: S.sampleErrs.length };
  }

  const BAR_T = [0.3, 0.3, 0.08, 0.8, 0.6]; // barrier thickness by kind (landmarks.js drawBarriers)
  const POSTS = new Set(['lampPost', 'tree']);
  const boxy = (o) => o.fill >= 0.72 && (1 - o.fill) * o.w * o.d < 45; // (world.js boxy)
  const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  /** The buildings of one live tile as the tile draws them (see the header), in tile-local metres, with a 16 m cell index. */
  function tileBuildings(key, c, ox, oy) {
    const t = c.src, list = [], idx = new Map(), G = S.geo, W = S.W;
    const fronts = new Map(); // bi -> { cell, units }: the street fronts of this tile and the cell that draws them
    if (Array.isArray(c.cells)) for (const cell of c.cells) for (const u of cell.units || []) { let q = fronts.get(u.bi); if (!q) fronts.set(u.bi, (q = { cell, units: [] })); q.units.push(u); }
    t.b.forEach((e, bi) => {
      const ring = []; for (let i = 3; i + 1 < e.length; i += 2) ring.push([e[i] / 10, 256 - e[i + 1] / 10]);
      if (ring.length < 3) return;
      const o = G.obbOf(ring), rects = boxy(o) ? [{ x: 0, z: 0, w: o.w, d: o.d }] : G.rectsOf(ring, o), flat = new Float64Array(ring.length * 2);
      ring.forEach((p, i) => { flat[i * 2] = p[0]; flat[i * 2 + 1] = p[1]; });
      const R = Math.hypot(o.w, o.d) / 2 + 1, B = { ring: flat, o, rects, fr: fronts.get(bi) || null, parts: !!(t.bp && t.bp[bi]), top: W.city.landAt(ox + o.cx, oy + 256 - o.cz) + e[0], x0: o.cx - R, x1: o.cx + R, z0: o.cz - R, z1: o.cz + R };
      list.push(B);
      for (let i = Math.floor(B.x0 / 16); i <= Math.floor(B.x1 / 16); i++) for (let j = Math.floor(B.z0 / 16); j <= Math.floor(B.z1 / 16); j++) { const k = i * 1000 + j; let q = idx.get(k); if (!q) idx.set(k, (q = [])); q.push(B); }
    });
    return { ox, oy, idx };
  }
  const inRects = (x, z, o, rects) => { const dx = x - o.cx, dz = z - o.cz, u = dx * o.ux + dz * o.uz, v = -dx * o.uz + dz * o.ux; for (const r of rects) if (Math.abs(u - r.x) < r.w / 2 && Math.abs(v - r.z) < r.d / 2) return true; return false; };
  function inUnits(x, z, units) {
    for (const u of units) {
      const dx = x - u.cx, dz = z - u.cz, along = dx * -u.nz + dz * u.nx, across = dx * u.nx + dz * u.nz;
      if (Math.abs(along) < u.w / 2 && Math.abs(across) < u.d / 2) return true;
      if (u.backs) { const k = u.backs, ux = Math.cos(k.th), uz = -Math.sin(k.th), ex = x - k.cx, ez = z - k.cz, uu = ex * ux + ez * uz, vv = -ex * uz + ez * ux; for (const r of k.list) if (Math.abs(uu - r.x) < r.w / 2 && Math.abs(vv - r.z) < r.d / 2) return true; }
    }
    return false;
  }
  /** Inside what is drawn of a building at scene (x, z), below its roof: 'footprint' | 'facade' | 'block' | null. */
  function inBuilding(x, z, y) {
    const m = S.W.frame.M(x, z), tx = Math.floor(m[0] / 256), ty = Math.floor(m[1] / 256);
    let res = null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const T = S.blds.get((tx + a) + '_' + (ty + b));
      if (!T) continue;
      const lx = m[0] - T.ox, lz = T.oy + 256 - m[1], q = T.idx.get(Math.floor(lx / 16) * 1000 + Math.floor(lz / 16));
      if (!q) continue;
      for (const B of q) {
        if (lx < B.x0 || lx > B.x1 || lz < B.z0 || lz > B.z1 || y > B.top - 0.3) continue; // (on the roof, or flying over it: not inside)
        if (inRing(lx, lz, B.ring)) return 'footprint';
        if (B.parts || res) continue;
        const near = B.fr && B.fr.cell.detail;
        if (near ? inUnits(lx, lz, B.fr.units) : inRects(lx, lz, B.o, B.rects)) res = near ? 'facade' : 'block';
      }
    }
    return res;
  }

  /** Street furniture near (cx, cz): circles { t: 0, x, z, r, kind } and car rectangles { t: 1, x, z, fx, fz, hl, hw, kind }, in 4 m cells. */
  function furniture(W, C, cx, cz, R) {
    const live = W.stream.live;
    let sig = '';
    for (const [key, c] of live) sig += key + (c && c.props ? 'p' : '') + (c ? c.lod : '') + ',';
    if (sig !== S.propSig) {
      // the tiles' own furniture (lod 0 tiles carry props): tile coordinates run east and south from the tile's north-west corner
      // (world.js:1686), so scene = frame.S(ox + x, oy + 256 - z) with ox, oy the tile's south-west corner in map metres
      S.propSig = sig; S.props = []; S.blds = new Map(); S.bars = [];
      for (const [key, c] of live) {
        if (!c) continue;
        let ox = c.ox, oy = c.oy;
        if (!Number.isFinite(ox) || !Number.isFinite(oy)) { const [tx, ty] = key.split('_').map(Number); ox = tx * 256; oy = ty * 256; }
        if (c.src && Array.isArray(c.src.b)) S.blds.set(key, tileBuildings(key, c, ox, oy));
        // fences, walls, hedges (tile data in decimetres from the south-west corner)
        if (c.src && Array.isArray(c.src.x)) for (const e of c.src.x) {
          const th = BAR_T[e[0]] ?? 0.3;
          for (let i = 2; i + 3 < e.length; i += 2) {
            const p = W.frame.S(ox + e[i] / 10, oy + e[i + 1] / 10), q = W.frame.S(ox + e[i + 2] / 10, oy + e[i + 3] / 10);
            S.bars.push({ t: 2, x: (p[0] + q[0]) / 2, z: (p[1] + q[1]) / 2, ax: p[0], az: p[1], bx: q[0], bz: q[1], th, kind: 'barrier' });
          }
        }
        if (!Array.isArray(c.props)) continue;
        for (const q of c.props) {
          const f = S.furnOf(q.kind);
          if (!(f[1] > 0) || f[0] < 0.2) continue; // what setting.js counts as an obstacle (setting.js:131-138)
          const p = W.frame.S(ox + q.x, oy + 256 - q.z);
          S.props.push({ t: 0, x: p[0], z: p[1], r: f[1], kind: q.kind });
        }
      }
    }
    const cell = new Map(), add = (s) => { const k = Math.floor(s.x / 4) * 100003 + Math.floor(s.z / 4); let b = cell.get(k); if (!b) cell.set(k, (b = [])); b.push(s); };
    const near = (x, z) => (x - cx) ** 2 + (z - cz) ** 2 < (R + 6) ** 2;
    for (const s of S.props) if (near(s.x, s.z)) add(s);
    for (const s of S.bars) if (near(s.x, s.z)) {
      // a segment goes into every 4 m cell its box touches
      for (let i = Math.floor((Math.min(s.ax, s.bx) - 1) / 4); i <= Math.floor((Math.max(s.ax, s.bx) + 1) / 4); i++) for (let j = Math.floor((Math.min(s.az, s.bz) - 1) / 4); j <= Math.floor((Math.max(s.az, s.bz) + 1) / 4); j++) { const k = i * 100003 + j; let b = cell.get(k); if (!b) cell.set(k, (b = [])); b.push(s); }
    }
    for (const o of C.owners.values()) {
      if (!o.on || (o.cx - cx) ** 2 + (o.cz - cz) ** 2 > (o.r + R + 10) ** 2) continue; // as crowd.obstacles (crowd.js:1477-1480)
      const wait = o.pend.length ? new Set(o.pend) : null;
      for (let i = 0; i + 3 < o.parked.length; i += 4) if (!(wait && wait.has(i)) && near(o.parked[i], o.parked[i + 1])) add({ t: 1, x: o.parked[i], z: o.parked[i + 1], fx: Math.sin(o.parked[i + 2]), fz: Math.cos(o.parked[i + 2]), hl: DIM.car[0], hw: DIM.car[1], kind: 'parkedCar' });
      for (let i = 0; i + 3 < o.lamps.length; i += 4) if (!(wait && wait.has(-1 - i)) && near(o.lamps[i], o.lamps[i + 1])) add({ t: 0, x: o.lamps[i], z: o.lamps[i + 1], r: LAMP_R[o.lamps[i + 3]] ?? 0.2, kind: 'lampPost' });
      for (const g of o.groups) if (g.shown) for (const b of g.bikes) {
        const sx = Math.sin(b.hd) * 0.45, sz = Math.cos(b.hd) * 0.45; // two circles of 0.4 (crowd.js:1483)
        add({ t: 0, x: b.x + sx, z: b.z + sz, r: 0.4, kind: 'groupBike' }); add({ t: 0, x: b.x - sx, z: b.z - sz, r: 0.4, kind: 'groupBike' });
      }
    }
    return cell;
  }
  /** The furniture hit at (x, z): { kind, q, core } (core: see the header) or null; a barrier hit is reported in `bar`. */
  function furnHit(cell, W, x, z) {
    const i0 = Math.floor(x / 4), j0 = Math.floor(z / 4);
    let best = null, bar = false;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const b = cell.get((i0 + di) * 100003 + j0 + dj);
      if (!b) continue;
      for (const s of b) {
        const dx = x - s.x, dz = z - s.z;
        if (s.t === 0) {
          const d = Math.hypot(dx, dz);
          if (d < s.r && (!best || d / s.r < best.q)) best = { kind: s.kind, q: d / s.r, core: d < (POSTS.has(s.kind) ? s.r : s.r / 2) };
        } else if (s.t === 1) {
          const u = Math.abs(dx * s.fx + dz * s.fz), v = Math.abs(dx * s.fz - dz * s.fx);
          if (u < s.hl && v < s.hw) { const q = Math.max(u / s.hl, v / s.hw); if (!best || q < best.q) best = { kind: s.kind, q, core: u < s.hl - 0.15 && v < s.hw - 0.15 }; }
        } else if (!bar) {
          const ex = s.bx - s.ax, ez = s.bz - s.az, l = ex * ex + ez * ez || 1e-9, u = Math.max(0, Math.min(1, ((x - s.ax) * ex + (z - s.az) * ez) / l));
          if (Math.hypot(s.ax + ex * u - x, s.az + ez * u - z) < s.th / 2 + 0.15) bar = true;
        }
      }
    }
    if (!best && W.treeNear(x, z, 0.35)) best = { kind: 'tree', q: 0.5, core: true }; // a trunk (FURN.tree radius 0.35)
    if (best) best.bar = bar; else if (bar) best = { kind: null, bar: true };
    return best;
  }

  function hintsOf(e, t) {
    const h = [], a = e.ref;
    if (e.src === 'agent') {
      if (a.ghost > 0) h.push('passThrough'); // the 6 s stuck rule drives through (crowd.js:1747)
      if (a.wait > 0) h.push('waiting');
      if (a.cross) h.push('crossing');
      if (a.sm) h.push('stage' + a.sm); // 1 to rim, 2 watching, 3 round the rim, 4 fleeing ... (crowd.js:731)
      if (a.pop < 1) h.push('popIn');
      if (Math.abs(a.ox) + Math.abs(a.oz) > 0.3) h.push('offLane'); // a melting offset: lane hop, adopt, stepping out
      if (Math.abs(a.lat) > 0.3) h.push('sidestep');
      if (a.held) h.push('heldAtLaneEnd');
      if (a.ut) h.push('uturn');
      if (a.pave) h.push('pavementRider');
      if (a.lane && (a.s < 3 || a.s > a.lane.len - 3)) h.push('laneEnd');
      if (a.look) { const ta = S.actorLooks.get(a.look); if (ta !== undefined && t - ta < 5) h.push('handedBack'); }
    } else if (e.src === 'member') {
      h.push(e.gref.sm === 1 ? 'groupWalking' : 'groupStanding');
      if (e.gref.wt) h.push('groupWatching');
    } else if (e.src === 'actor') {
      const a2 = a;
      if (a2.ctx && a2.ctx._gags instanceof Map) for (const n of a2.ctx._gags.keys()) h.push('gag:' + n);
      if (a2.ctx && a2.ctx.id) h.push('spot:' + a2.ctx.id);
      if (a2.pose) h.push('pose:' + a2.pose);
      if (a2.air) h.push('air');
      if (a2.vehicle && a2.type) h.push('type:' + a2.type);
    } else if (e.src === 'walker') h.push('walker');
    const m = S.W.frame.M(e.x, e.z), fx = ((m[0] % 256) + 256) % 256, fy = ((m[1] % 256) + 256) % 256;
    if (fx < 1.5 || fx > 254.5 || fy < 1.5 || fy > 254.5) h.push('tileEdge');
    return h;
  }

  function sample() {
    const st = H.stage, W = st.W, C = st.crowd, K = S.K, Cl = S.Cl, SET = S.sets;
    if (W !== S.W || C !== S.crowd || !W || W.st.name !== S.name) fail('the open street or the crowd changed during the run (now ' + (W && W.st && W.st.name) + ')');
    if (!Array.isArray(C.agents)) fail('crowd.agents not found');
    if (!Array.isArray(st.actors)) fail('stage.actors not found');
    const t = st.time - S.t0;
    if (t >= S.cfg.secs) return; // (the step that ends the run)
    const M = minute(Math.floor(t / 60));
    M.samples++; S.samples++;
    bump(S.modes, st.mode);
    const cx = st.rig.tx, cz = st.rig.tz, R2 = S.cfg.range * S.cfg.range, inR = (x, z) => (x - cx) ** 2 + (z - cz) ** 2 < R2;
    const ents = [];

    // ---- the instanced crowd: walkers, cyclists (the bike; its rider is a slot of a.pp, not an agent), cars, tram sections
    for (const a of C.agents) {
      if (a.look) S.crowdLooks.add(a.look); // (first: a walker taken since the last sample is in the list as dead for a while)
      if (a.dead || !a.vis) continue;
      if (a.kind === K.PED) {
        const e = slotOf(a.pp, a.slot);
        if (!e || !inR(e.x, e.z)) continue;
        ents.push({ id: idOf(a, 'c'), grp: 'crowd', src: 'agent', kind: 'ped', ...e, bob: bobOf(a.pp, a.slot, e.s), ref: a, noFeet: a.down > 0, noPair: a.down > 0 });
      } else if (a.kind === K.BIKE_) {
        const e = slotOf(a.vp, a.slot), bk = (a.look && DIM[a.look.ride] && a.look.ride) || 'bike';
        if (!e || !inR(e.x, e.z)) continue;
        ents.push({ id: idOf(a, 'c'), grp: 'crowd', src: 'agent', kind: bk === 'bike' ? 'bike' : bk, veh: true, hl: DIM[bk][0] * e.s, hw: DIM[bk][1] * e.s, wheels: WHEELS[bk], ...e, ref: a });
      } else if (a.kind === K.CAR_) {
        const e = slotOf(C.cars, a.slot);
        if (!e || !inR(e.x, e.z)) continue;
        ents.push({ id: idOf(a, 'c'), grp: 'crowd', src: 'agent', kind: 'car', veh: true, hl: DIM.car[0] * e.s, hw: DIM.car[1] * e.s, wheels: WHEELS.car, ...e, ref: a });
      } else if (a.kind === K.TRAM_) {
        if (!Array.isArray(a.tail)) fail('tram agent tail not found');
        a.tail.forEach((q, i) => {
          const e = slotOf(C.trams, q.slot);
          if (!e || !inR(e.x, e.z)) return;
          ents.push({ id: idOf(a, 'c') + '.' + i, grp: 'crowd', src: 'agent', kind: 'tram', veh: true, hl: DIM.tram[0] * e.s, hw: DIM.tram[1] * e.s, wheels: WHEELS.tram, ...e, ref: a });
        });
      }
    }
    // ---- hanging groups (not in crowd.agents): members stand where the plan put them
    for (const o of C.owners.values()) {
      if (!o.on) continue;
      for (const g of o.groups) {
        if (!g.shown) continue;
        for (const m of g.members) {
          if (!(m.slot >= 0) || !m.pp) continue;
          const e = slotOf(m.pp, m.slot);
          if (!e || !inR(e.x, e.z)) continue;
          if (m.look) S.crowdLooks.add(m.look);
          ents.push({ id: idOf(m, 'g'), grp: 'crowd', src: 'member', kind: 'ped', ...e, bob: bobOf(m.pp, m.slot, e.s), ref: m, gref: g });
        }
      }
    }
    // ---- scene actors (stage.actors, drawn at g.matrixWorld after warp)
    S.maxActors = Math.max(S.maxActors, st.actors.length);
    for (const a of st.actors) {
      if (!a || !a.alive || !a.g) continue;
      const el = a.g.matrixWorld && a.g.matrixWorld.elements;
      if (!el) fail('actor.g.matrixWorld not found');
      if (a.g.visible === false || a.offstage) continue;
      const x = el[12], y = el[13], z = el[14];
      if (!inR(x, z)) continue;
      const fh = Math.hypot(el[8], el[10]) || 1, s = Math.hypot(el[0], el[1], el[2]) || 1;
      const borrowed = !!(a.look && S.crowdLooks.has(a.look));
      if (a.look) S.actorLooks.set(a.look, t);
      let kind, extra = {};
      if (a.vehicle) {
        kind = a.two ? 'bike' : 'car';
        const hl = (a.len || (a.two ? 1.86 : 4.4)) / 2, hw = (a.wid || (a.two ? 0.6 : 1.85)) / 2;
        extra = { veh: true, hl, hw, wheels: [[-hw * 0.84 / s, -hl * 0.72 / s], [hw * 0.84 / s, -hl * 0.72 / s], [-hw * 0.84 / s, hl * 0.72 / s], [hw * 0.84 / s, hl * 0.72 / s]] };
      } else if (a.legL && a.head) kind = a.air || a.pose === 'ride' ? 'rider' : 'ped';
      else if ('fly' in a) kind = 'bird';
      else kind = 'animal';
      const posed = !!(a.air || a.fly || a.pose === 'sit' || a.pose === 'ride' || a.pose === 'sleep');
      // a deliberate height in the actor's street space (a hop, a jump, a lift, standing on something): no feet, no furniture test
      const lift = !a.vehicle && !posed && a.g.position && a.g.position.y > 0.03;
      const fauna = kind === 'bird' || kind === 'animal';
      ents.push({ id: idOf(a, 'a'), grp: fauna ? 'fauna' : borrowed ? 'borrowed' : 'actors', src: 'actor', kind, m: el, o: 0, x, y, z, fx: el[8] / fh, fz: el[10] / fh, s, bob: 0, ref: a, ctx: a.ctx || null,
        noFeet: posed || lift || kind === 'animal', noGround: posed || fauna, noFurn: posed || lift, posed, lift, ...extra });
    }
    // ---- the player's walker, when the page has one (a later round): its g / matrixWorld, else position, else x / z
    const wk = st.walker;
    if (wk) {
      S.walker.seen++;
      let x, y, z, el = null;
      const obj = wk.g && wk.g.matrixWorld ? wk.g : wk.matrixWorld ? wk : null;
      if (obj) { el = obj.matrixWorld.elements; x = el[12]; y = el[13]; z = el[14]; S.walker.src = 'matrixWorld'; }
      else if (wk.position && Number.isFinite(wk.position.x) && Number.isFinite(wk.position.z)) { x = wk.position.x; y = wk.position.y; z = wk.position.z; S.walker.src = 'position'; }
      else if (Number.isFinite(wk.x) && Number.isFinite(wk.z)) { x = wk.x; z = wk.z; y = wk.y; S.walker.src = 'x/z'; }
      if (x === undefined) S.walker.noPos++;
      else if (inR(x, z)) {
        const hd = Number.isFinite(wk.heading) ? wk.heading : Number.isFinite(wk.hd) ? wk.hd : 0;
        const fh = el ? Math.hypot(el[8], el[10]) || 1 : 1, fx = el ? el[8] / fh : Math.sin(hd), fz = el ? el[10] / fh : Math.cos(hd);
        const m = el || [fz, 0, -fx, 0, 0, 1, 0, 0, fx, 0, fz, 0, x, y, z, 1];
        ents.push({ id: 'w1', grp: 'walker', src: 'walker', kind: 'ped', m, o: 0, x, y: Number.isFinite(y) ? y : W.hAt(x, z), z, fx, fz, s: 1, bob: 0, ref: wk, noFeet: !Number.isFinite(y) });
      }
    }

    // speed per thing between samples (for the record), group sample counts
    const prev = S.prev, next = new Map();
    for (const e of ents) {
      const p = prev.get(e.id);
      e.spd = p ? Math.hypot(e.x - p[0], e.z - p[1]) / Math.max(1e-3, t - p[2]) : 0;
      next.set(e.id, [e.x, e.z, t]);
      M.g[e.grp].sampled++;
    }
    S.prev = next;

    // ---- 1. pairs of people on foot (spatial hash of 1 m cells; riders and the fallen are left out)
    const peds = ents.filter((e) => e.kind === 'ped' && !e.noPair);
    const cell = new Map();
    peds.forEach((e, i) => { const k = Math.floor(e.x) * 100003 + Math.floor(e.z); let b = cell.get(k); if (!b) cell.set(k, (b = [])); b.push(i); });
    const BODY = S.cfg.body, seenPairs = S.lastPair, si = S.samples;
    const blockerGap = (e) => { let d = Infinity; for (const b of C.blockers) d = Math.min(d, Math.hypot(b.x - e.x, b.z - e.z)); return d; };
    peds.forEach((A, i) => {
      const ix = Math.floor(A.x), iz = Math.floor(A.z);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const b = cell.get((ix + dx) * 100003 + iz + dz);
        if (!b) continue;
        for (const j of b) {
          if (j <= i) continue;
          const B = peds[j], d = Math.hypot(A.x - B.x, A.z - B.z);
          if (d >= HB) continue;
          const staged = (A.src === 'member' && B.src === 'member' && A.gref === B.gref && A.gref.sm !== 1)
            || (A.src === 'actor' && B.src === 'actor' && A.ctx && A.ctx === B.ctx);
          if (!staged) HIST.forEach((h, q) => { if (d < h) M.hist[q]++; });
          if (d >= (staged ? BODY / 2 : BODY)) continue;
          const bucket = staged ? 'staged' : 'pairs', evk = staged ? 'stagedEvents' : 'pairEvents';
          const [P, Q] = A.id < B.id ? [A, B] : [B, A], pk = P.id + '|' + Q.id, gk = [P.grp, Q.grp].sort().join('|');
          const fresh = seenPairs.get(pk) !== si - 1;
          seenPairs.set(pk, si);
          const hints = [...hintsOf(P, t), ...hintsOf(Q, t)];
          if (P.src === 'member' && Q.src === 'member' && P.gref === Q.gref) hints.push('sameGroup');
          if (P.src === 'actor' && Q.src === 'actor' && P.ctx === Q.ctx) hints.push('sameScene');
          for (const X of [P, Q]) if (X.src === 'actor' && (P.src !== 'actor' || Q.src !== 'actor')) { const g = blockerGap(X); hints.push(g === Infinity || g > 2 ? 'actorNotInBlockers' : g > 0.3 ? 'blockerLags' : 'blockerOk'); }
          bump(M.byPair[bucket], gk);
          flag(M, bucket, P.grp, P.kind + '|' + Q.kind, (P.x + Q.x) / 2, (P.z + Q.z) / 2, [P.id, Q.id], (staged ? BODY / 2 : BODY) - d, hints, t); // (the depth: the 12 kept are the deepest)
          if (Q.grp !== P.grp) M.g[Q.grp][bucket]++;
          if (fresh) { M.g[P.grp][evk]++; if (Q.grp !== P.grp) M.g[Q.grp][evk]++; }
        }
      }
    });
    for (const [k, v] of seenPairs) if (v < si - 1) seenPairs.delete(k);

    // ---- 2. a pedestrian inside a moving vehicle's footprint
    const vehs = ents.filter((e) => e.veh);
    for (const p of ents) {
      if (p.kind !== 'ped' || p.noPair) continue;
      for (const v of vehs) {
        const dx = p.x - v.x, dz = p.z - v.z;
        if (Math.abs(dx) > v.hl + 0.5 || Math.abs(dz) > v.hl + 0.5) continue;
        const u = dx * v.fx + dz * v.fz, w = dx * v.fz - dz * v.fx;
        if (Math.abs(u) < v.hl && Math.abs(w) < v.hw) {
          const h = [...hintsOf(p, t), 'veh:' + v.grp + '.' + v.kind];
          if (v.src === 'agent' && v.ref.ghost > 0) h.push('vehPassThrough');
          if (p.ctx && p.ctx === v.ctx) { flag(M, 'byDesign', p.grp, 'sameSceneVehicle', p.x, p.z, [p.id, v.id], 0, [...h, 'sameScene'], t); break; } // (a scene's own vehicle and actor: staged)
          flag(M, 'hitVehicle', p.grp, p.kind + '|' + v.kind, p.x, p.z, [p.id, v.id], 1 - Math.max(Math.abs(u) / v.hl, Math.abs(w) / v.hw), h, t);
          break;
        }
      }
    }

    // ---- 2b. two vehicles inside each other (oriented boxes, 0.2 m of slack each way)
    for (let i = 0; i < vehs.length; i++) for (let j = i + 1; j < vehs.length; j++) {
      const A = vehs[i], B = vehs[j];
      if (Math.abs(A.x - B.x) > A.hl + B.hl || Math.abs(A.z - B.z) > A.hl + B.hl) continue;
      if (A.ref === B.ref || (A.ctx && A.ctx === B.ctx)) continue; // (two sections of one tram; two vehicles of one scene: staged)
      const dx = B.x - A.x, dz = B.z - A.z;
      let sep = false;
      for (const [ax, az] of [[A.fx, A.fz], [A.fz, -A.fx], [B.fx, B.fz], [B.fz, -B.fx]]) {
        const d = Math.abs(dx * ax + dz * az), ra = A.hl * Math.abs(A.fx * ax + A.fz * az) + A.hw * Math.abs(A.fz * ax - A.fx * az), rb = B.hl * Math.abs(B.fx * ax + B.fz * az) + B.hw * Math.abs(B.fz * ax - B.fx * az);
        if (d > ra + rb - 0.2) { sep = true; break; }
      }
      if (sep) continue;
      const h = [];
      if ((A.src === 'agent' && A.ref.ghost > 0) || (B.src === 'agent' && B.ref.ghost > 0)) h.push('passThrough');
      if ((A.spd || 0) < 0.3 && (B.spd || 0) < 0.3) h.push('bothStill');
      if (Math.abs(A.fx * B.fx + A.fz * B.fz) < 0.7) h.push('crossing');
      for (const X of [A, B]) if (X.src === 'agent' && X.ref.lane && X.ref.s < 4) h.push('laneStart');
      flag(M, 'vv', A.grp, A.kind + '|' + B.kind, (A.x + B.x) / 2, (A.z + B.z) / 2, [A.id, B.id], Math.hypot(dx, dz), h, t);
      if (B.grp !== A.grp) M.g[B.grp].vv++;
    }

    // ---- 3-6. per thing: building, furniture, water and ground, feet
    const furn = furniture(W, C, cx, cz, S.cfg.range);
    for (const e of ents) {
      if (e.kind === 'rider') continue; // a person on a scene bike: the bike is tested
      const G = M.g[e.grp], cls = W.clsAt(e.x, e.z);
      let hints = null;
      const H_ = () => (hints ||= hintsOf(e, t));
      let inside = null; // (a person inside something solid: for the pass line)
      // building: inside what the tiles draw of it (see the header); W.solid alone is the diagnostic nearWall
      const bh = inBuilding(e.x, e.z, e.y);
      if (bh) {
        const dw = e.src === 'actor' && e.ref._doorway, atDoor = dw && dw.out && Math.hypot(e.ref.g.position.x - dw.out.x, e.ref.g.position.z - dw.out.z) < 1.5;
        if (atDoor) flag(M, 'byDesign', e.grp, 'door', e.x, e.z, [e.id], 0, [...H_(), 'door'], t);
        else { flag(M, 'inBuilding', e.grp, e.kind, e.x, e.z, [e.id], 1, [...H_(), bh], t); inside = 'building'; }
      } else {
        const sv = W.solid.get(e.x, e.z);
        if ((sv > 0 && sv < 255) || cls === Cl.BUILDING) flag(M, 'nearWall', e.grp, e.kind, e.x, e.z, [e.id], 0, H_(), t);
      }
      // furniture (and barriers)
      if (e.kind !== 'tram' && !e.noFurn) {
        const f = furnHit(furn, W, e.x, e.z);
        if (f && f.kind) {
          const h = [...H_(), 'furn:' + f.kind];
          flag(M, 'inFurniture', e.grp, e.kind + ':' + f.kind, e.x, e.z, [e.id], 1 - f.q, h, t);
          if (f.core) { flag(M, 'inFurnitureCore', e.grp, e.kind + ':' + f.kind, e.x, e.z, [e.id], 1 - f.q, h, t); inside ||= 'furniture'; }
        }
        if (f && f.bar) { flag(M, 'barrier', e.grp, e.kind, e.x, e.z, [e.id], 0, H_(), t); inside ||= 'barrier'; }
      }
      // water and ground class
      if (cls === 255) { if (!e.noGround) flag(M, 'unknown', e.grp, e.kind, e.x, e.z, [e.id], 0, H_(), t); }
      else if (cls === Cl.WATER || cls === Cl.SEA) {
        if (e.ref && (e.ref.type === 'boat' || e.ref.air || e.posed)) flag(M, 'byDesign', e.grp, 'onBoat', e.x, e.z, [e.id], 0, H_(), t); // (a boat, somebody in it)
        else if (!(e.ref && e.ref.fly)) { flag(M, 'inWater', e.grp, e.kind, e.x, e.z, [e.id], e.y - W.hAt(e.x, e.z), H_(), t); inside ||= 'water'; }
      }
      else if (cls !== Cl.BUILDING && !e.noGround && e.kind !== 'tram') {
        let ok, road = false;
        if (e.src === 'agent' || e.src === 'member') {
          if (e.kind === 'ped') { ok = SET.walk[cls] === 1; road = SET.road[cls] === 1; }
          else if (e.kind === 'car') ok = SET.road[cls] === 1;
          else ok = e.ref.pave ? SET.walk[cls] === 1 || SET.road[cls] === 1 : SET.bike[cls] === 1; // a fat-bike on the pavement walks the walkers' ground
        } else if (e.kind === 'car') ok = SET.sroad[cls] === 1;
        else ok = SET.open[cls] === 1;
        if (!ok && road) {
          // a walker on the carriageway: crossing by design when it crosses (a.cross) or its lane itself runs over road here (split
          // lets a pavement lane carry on over up to five road points, crowd.js:481); otherwise it stepped out into the road
          const a = e.ref;
          let why = null;
          if (e.src === 'agent' && a.cross) why = 'cross';
          else if (e.src === 'agent' && a.lane) {
            const L = a.lane, f = Math.max(0, Math.min(L.len, a.s)) / L.step, k = Math.min(L.n - 2, Math.floor(f)), q = f - k;
            const lx = L.pts[k * 2] + (L.pts[k * 2 + 2] - L.pts[k * 2]) * q, lz = L.pts[k * 2 + 1] + (L.pts[k * 2 + 3] - L.pts[k * 2 + 1]) * q;
            if (SET.road[W.clsAt(lx, lz)] === 1) why = 'laneOverRoad';
          }
          if (why) flag(M, 'crossing', e.grp, e.kind, e.x, e.z, [e.id], 0, [...H_(), 'why:' + why], t);
          else flag(M, 'onRoad', e.grp, e.kind, e.x, e.z, [e.id], 0, H_(), t);
        } else if (!ok) flag(M, 'badGround', e.grp, e.kind, e.x, e.z, [e.id], cls, [...H_(), 'cls:' + cls], t);
      }
      if (inside && e.kind === 'ped' && e.grp !== 'fauna' && !e.posed) flag(M, 'inside', e.grp, inside, e.x, e.z, [e.id], 0, [...H_(), inside], t);
      // feet: the footprint's contact points through the drawn matrix, against W.hAt under each
      if (e.lift) G.scriptLift++;
      if (e.kind === 'tram') continue; // (its rails run under the body)
      if (e.noFeet || (e.kind !== 'ped' && !e.veh)) { if (e.noFeet) G.noFeet++; continue; }
      // (the shader's walking bob, up to ~0.09 m, is animation: it is a hint, not part of the comparison)
      const pts = e.veh ? e.wheels : FEET, y = e.y, hc = W.hAt(e.x, e.z), bh2 = 'bob:' + r2(e.bob || 0);
      if (e.veh) {
        // wheels: one on a rail bar is left out (counted in `rail`); sink = a wheel under the ground; float = two or more in the air
        let hi = -Infinity, nUp = 0, rail = 0, up2 = 0;
        for (const [lx, lz] of pts) {
          const p = xf(e.m, e.o, lx, lz);
          if (W.clsAt(p[0], p[1]) === Cl.RAIL) { rail++; continue; }
          const h = W.hAt(p[0], p[1]);
          if (h > hi) hi = h;
          if (y - h > TOL) { nUp++; up2 = Math.max(up2, y - h); }
        }
        if (rail) flag(M, 'rail', e.grp, e.kind, e.x, e.z, [e.id], rail, H_(), t);
        if (hi > -Infinity && hi - y > TOL) { flag(M, 'sink', e.grp, e.kind, e.x, e.z, [e.id], -(hi - y), [...H_(), 'centre:' + r2(y - hc), bh2], t); G.worstSink = Math.max(G.worstSink, hi - y); }
        if (nUp >= 2) { flag(M, 'float', e.grp, e.kind, e.x, e.z, [e.id], up2, [...H_(), 'centre:' + r2(y - hc), 'wheelsUp:' + nUp], t); G.worstFloat = Math.max(G.worstFloat, up2); }
        continue;
      }
      let hi = hc, lo = hc;
      for (const [lx, lz] of pts) { const p = xf(e.m, e.o, lx, lz), h = W.hAt(p[0], p[1]); if (h > hi) hi = h; if (h < lo) lo = h; }
      const up = y - hi, down = hi - y, over = y - lo;
      if (up > TOL) { flag(M, 'float', e.grp, e.kind, e.x, e.z, [e.id], up, [...H_(), 'centre:' + r2(y - hc), bh2], t); G.worstFloat = Math.max(G.worstFloat, up); }
      else if (over > 0.3) { flag(M, 'overhang', e.grp, e.kind, e.x, e.z, [e.id], over, [...H_(), 'centre:' + r2(y - hc), bh2], t); G.worstOverhang = Math.max(G.worstOverhang, over); }
      else if (over > TOL) G.edge++;
      if (down > TOL) { flag(M, 'sink', e.grp, e.kind, e.x, e.z, [e.id], -down, [...H_(), 'centre:' + r2(y - hc), bh2], t); G.worstSink = Math.max(G.worstSink, down); }
    }
  }

  function result() {
    const st = H.stage, tEnd = st.time - S.t0, totals = {};
    for (const g of GROUPS) totals[g] = blankG();
    const minutes = S.min.filter(Boolean).map((M) => {
      const out = { minute: M.minute, secs: r2(Math.max(0, Math.min(60, tEnd - M.minute * 60))), samples: M.samples, groups: M.g, distinct: {}, avgSampled: {}, byPair: M.byPair, pairHist: M.hist };
      for (const g of GROUPS) {
        out.distinct[g] = {};
        for (const k in M.d[g]) out.distinct[g][k] = M.d[g][k].size;
        out.avgSampled[g] = M.samples ? Math.round((M.g[g].sampled / M.samples) * 10) / 10 : 0;
        for (const k in M.g[g]) totals[g][k] = /^worst/.test(k) ? Math.max(totals[g][k], M.g[g][k]) : totals[g][k] + M.g[g][k];
      }
      return out;
    });
    const avgSampled = {}, pairHist = HIST.map(() => 0);
    for (const g of GROUPS) avgSampled[g] = S.samples ? Math.round((totals[g].sampled / S.samples) * 10) / 10 : 0;
    for (const M of S.min) if (M) M.hist.forEach((v, i) => { pairHist[i] += v; });
    for (const k in S.ex) for (const e of S.ex[k]) delete e.key;
    return { street: S.name, stageSecs: r2(tEnd), steps: S.steps, samples: S.samples, every: S.cfg.every, range: S.cfg.range, body: S.cfg.body,
      unit: 'thing-samples (one thing flagged in one sample); a pair counts once per sample; samples every ' + S.cfg.every + ' steps of 33.3 ms',
      avgSampled, totals, minutes, pairHist: { below: HIST, counts: pairHist }, examples: S.ex, hints: S.hints, byKind: S.byKind,
      modes: S.modes, maxActors: S.maxActors, walker: S.walker, frameErrs: S.frameErrs.slice(0, 10), sampleErrs: S.sampleErrs, tol: TOL, warn: S.warn };
  }

  return { init, run, result };
}

// ------------------------------------------------------------------------------------------------ node side
const GROUPS = ['crowd', 'actors', 'borrowed', 'walker', 'fauna'];
const PEOPLE = ['crowd', 'actors', 'borrowed', 'walker'];
const SHOW = [['pairs', 'pair'], ['pairEvents', 'pEv'], ['staged', 'stg'], ['hitVehicle', 'hitV'], ['inBuilding', 'bld'], ['inFurniture', 'furn'],
  ['inFurnitureCore', 'core'], ['barrier', 'bar'], ['inWater', 'wet'], ['badGround', 'bad'], ['onRoad', 'road'], ['crossing', 'cross'], ['float', 'float'], ['sink', 'sink'], ['overhang', 'ovh'],
  ['rail', 'rail'], ['vv', 'vv'], ['inside', 'in!']];
const out = { when: new Date().toISOString(), cfg, streets: [], total: null };
const save = () => fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
const fmt = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
const table = (rows, per1000 = false) => {
  console.log(['street'.padEnd(18), 'group'.padEnd(9), 'n'.padStart(6), ...SHOW.map(([, h]) => h.padStart(6))].join(' '));
  for (const r of rows) console.log([r.street.slice(0, 18).padEnd(18), r.grp.padEnd(9), fmt(r.n).padStart(6), ...SHOW.map(([k]) => fmt(per1000 ? (r.T.sampled ? (r.T[k] / r.T.sampled) * 1000 : 0) : r.v[k]).padStart(6))].join(' '));
};

const B = await launch({ width: 1280, height: 800, dpr: 1, tag: 'count' });
try {
  await B.ev('1'); // the browser answers
  for (const street of streets) {
    B.errs.length = 0;
    const rec = { street, opened: false };
    out.streets.push(rec);
    process.stdout.write(`${street}: opening... `);
    try {
      rec.opened = await B.open(street, { time: cfg.time, only: cfg.only, seed: cfg.seed, lvl: cfg.lvl });
      if (!rec.opened) { rec.error = 'the street did not open (no stage.mode follow within the timeout); is the name exactly as in streets.geojson?'; console.log(rec.error); continue; }
      await B.ev(`window.__count = (${pageCode.toString()})(); 'ok'`);
      const chk = await B.ev(`window.__count.init(${JSON.stringify(cfg)})`, 60000);
      rec.selfCheck = chk;
      if (!chk || !chk.ok) { rec.error = (chk && chk.error) || 'init returned nothing'; console.log('SELF-CHECK FAILED: ' + rec.error); continue; }
      process.stdout.write(`landed (${chk.street}); running ${cfg.secs} s of stage time `);
      let r = null;
      for (let chunk = 0; chunk < 2000; chunk++) {
        r = await B.ev('window.__count.run(15000)', 90000);
        process.stdout.write('.');
        if (r.done) break;
      }
      console.log(` ${r.t} s, ${r.steps} steps, ${r.samples} samples${r.sampleErrs ? ', ' + r.sampleErrs + ' sample errors' : ''}`);
    } catch (e) {
      // the page's own message sits inside the protocol's exception details: pull it out before cutting the text short
      const msg = String(e.message || e), m = /dev-count: [^"\\]*/.exec(msg);
      rec.error = (m ? m[0] : msg).slice(0, 600);
      console.log('ERROR ' + rec.error);
    } finally {
      if (rec.selfCheck && rec.selfCheck.ok) {
        // whatever was counted is kept, also after a failure half-way
        try {
          const res = await B.ev('window.__count.result()', 60000);
          rec.openedName = res.street; delete res.street; // (the name the page opened; rec.street stays the name asked for)
          Object.assign(rec, res);
        } catch (e) { rec.resultError = String(e.message || e).slice(0, 300); }
      }
      rec.errs = [...new Set(B.errs)].slice(0, 20);
      save();
    }
  }
  // the total over every street that ran
  const tot = { stageSecs: 0, samples: 0, groups: {} };
  for (const g of GROUPS) tot.groups[g] = {};
  for (const s of out.streets) {
    if (!s.totals) continue;
    tot.stageSecs += s.stageSecs; tot.samples += s.samples;
    for (const g of GROUPS) for (const k in s.totals[g]) tot.groups[g][k] = /^worst/.test(k) ? Math.max(tot.groups[g][k] || 0, s.totals[g][k]) : (tot.groups[g][k] || 0) + s.totals[g][k];
  }
  tot.perMinute = {};
  for (const g of GROUPS) { tot.perMinute[g] = {}; for (const k in tot.groups[g]) if (!/^worst/.test(k)) tot.perMinute[g][k] = tot.stageSecs ? Math.round((tot.groups[g][k] / (tot.stageSecs / 60)) * 100) / 100 : 0; }
  out.total = tot;
  save();
  // compact table: per minute of stage time (n = things of that group sampled, on average per sample)
  const rows = [];
  for (const s of out.streets) {
    if (!s.totals) { console.log(`${s.street}: ${s.error || 'no result'}`); continue; }
    const per = s.stageSecs / 60 || 1;
    for (const g of GROUPS) {
      const T = s.totals[g];
      if (!T.sampled) continue;
      const v = {};
      for (const [k] of SHOW) v[k] = T[k] / per;
      rows.push({ street: s.street, grp: g, n: s.avgSampled[g], v, T });
    }
    if (s.errs.length) console.log(`${s.street}: ${s.errs.length} console errors (see the file)`);
  }
  for (const g of GROUPS) {
    const T = tot.groups[g];
    if (!T.sampled) continue;
    const v = {};
    for (const [k] of SHOW) v[k] = tot.perMinute[g][k];
    rows.push({ street: 'TOTAL', grp: g, n: tot.samples ? T.sampled / tot.samples : 0, v, T });
  }
  console.log(`\nper minute of stage time (thing-samples at one sample per ${cfg.every} steps); body ${cfg.body} m, range ${cfg.range} m, ${cfg.time}, seed "${cfg.seed}", level ${cfg.lvl}${cfg.only ? ', only ' + cfg.only : ''}`);
  table(rows);
  console.log('\nthe same per 1000 samples of the group (n = samples per minute / 365 or so)');
  table(rows, true);
  // the pass line: nobody (people, not fauna, not posed) inside a building, furniture, a barrier or water
  let inside = 0;
  for (const g of PEOPLE) inside += (tot.groups[g] && tot.groups[g].inside) || 0;
  const why = {};
  for (const s of out.streets) for (const e of (s.examples && s.examples.inside) || []) for (const h of e.hints) if (/^(building|furniture|barrier|water|furn:|footprint|facade|block)/.test(h)) why[h] = (why[h] || 0) + 1;
  out.pass = { inside, ok: inside === 0, examples: why };
  save();
  console.log(`\nNOBODY-INSIDE: ${inside === 0 ? 'PASS' : 'FAIL'} (${inside} person-samples inside a building, furniture core, barrier or water${inside ? '; kinds in the examples: ' + JSON.stringify(why) : ''})`);
  console.log(`written: ${outFile}`);
  if (A.strict && inside > 0) process.exitCode = 1;
} finally {
  await B.close();
}
