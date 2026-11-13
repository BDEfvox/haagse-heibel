// Dev tool: the city's crowd alone, headless under Node (no browser, no stage, no scenes, no camera: so nothing is ever "seen"
// and everything may appear, restart or leave anywhere), on the finest-level tiles around a street, counting what
// scripts/dev-count.mjs counts for the crowd, with its definitions: person pairs closer than 0.45 m (a standing group's own members
// are staged), inside a drawn building (the ring, the street fronts and their backs, else the rect cover), inside furniture (the core:
// half the FURN radius, a parked car shrunk by 0.15 m, a post's radius), a barrier, water, feet (people: the foot boxes; vehicles: the
// wheels, a wheel on a rail bar left out and counted in `rail`), vehicles inside each other (`vv`), and `inside` (a walker in any of
// building / furniture / barrier / water). Plus how many walkers, cyclists and cars the crowd holds, and what Crowd.update costs.
// It loads a COPY of the source (the snapshot tool's patches), so any src directory can be compared, e.g. an older worktree's.
//   node scripts/dev-crowd-sim.mjs [--src src] [--streets "Grote Markt;Bierkade"] [--secs 70] [--json out.json] [--cam] [--det] [--seed n] [--maxped n]
// --cam: a camera as the stage's (30 degrees, 1.6 wide, 70 m from the spot, 0.7 rad up): the crowd's _seen then holds for what it
//   frames, so nothing may appear, vanish or restart there; `still20` counts vehicles standing still for more than 20 s in view
//   (per minute) and `stillMax` the longest such wait (s). Crowd.update is timed with a real clock (the stubs freeze performance).
// --det: lane clearing's time budget counted in looks at the clock, not milliseconds: the same work every frame and every run (for
//   comparing counts between trees; the times it prints are then not what a browser would see).
// Streets known by name: the four of dev-count (their spot, from the counter's own records), Plein, Weimarstraat and Strandweg (the
// centre and bearing of streets.geojson); others with --at mx,my,dx,dy.
// Rates are per minute of crowd time over the samples (one every 5 frames of 1/30 s, after 10 s to settle), within 80 m of the spot.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepare } from './snapshot/lib/prepare.mjs';
import { installStubs } from './snapshot/lib/stubs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, '..');
const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
const SPOTS = { Plein: [1052.5, 1112.7, -0.515, 0.857], Weimarstraat: [-1504.1, 465.1, 0.743, 0.669], Strandweg: [-1874.3, 4228.1, 0.906, 0.423], 'Grote Marktstraat': [1019.385, 822.164, -0.87, -0.493], 'Grote Markt': [594.309, 678.797, 0.699, -0.715], Torenstraat: [325.512, 923.654, -0.615, 0.788], Bierkade: [1244.498, 501.945, 0.814, 0.581] };
const streets = (typeof opt.streets === 'string' ? opt.streets : 'Grote Marktstraat;Grote Markt;Torenstraat;Bierkade').split(';').map((s) => s.trim()).filter(Boolean);
const SECS = +(opt.secs || 70), R = 80, DT = 1 / 30;
const srcDir = path.resolve(typeof opt.src === 'string' ? opt.src : path.join(REPO, 'src'));

// ---- a patched copy of the source that loads under Node, with the internals this tool reads exported
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'heibel-crowdsim-'));
process.on('exit', () => fs.rmSync(work, { recursive: true, force: true }));
const prep = prepare({ srcDir, work, modules: path.join(REPO, 'node_modules'), scriptsFrom: null });
fs.appendFileSync(path.join(prep.srcWork, 'voxel/world.js'), '\nexport { ensureTile as __s_ensureTile, classAt as __s_classAt, surfaceAt as __s_surfaceAt, treeNearMap as __s_treeNearMap, WET as __s_WET, _byNum as __s_byNum, tileNum as __s_tileNum };\n');
const stubs = installStubs({ dataDir: path.join(REPO, 'public/data'), modules: path.join(REPO, 'node_modules') });
const imp = (f) => import(pathToFileURL(path.join(prep.srcWork, f)).href);
const world = await imp('voxel/world.js'), crowdM = await imp('voxel/crowd.js'), setting = await imp('voxel/setting.js'), geo = await imp('voxel/geo.js');
const groundM = fs.existsSync(path.join(prep.srcWork, 'voxel/ground.js')) ? await imp('voxel/ground.js') : null;
const C = world.C, city = await world.__h_loadCity();
const readTile = (key) => { const p = path.join(REPO, 'public/data/world/tiles', key + '.json'); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const built = new Map();
function build(key) {
  if (built.has(key)) return built.get(key);
  const t = readTile(key);
  stubs.rnd.reset();
  const c = t ? world.__s_ensureTile(city, key, t, 0, false, false) : null;
  built.set(key, c); return c;
}
const tileAt = (mx, my) => world.__s_byNum.get(world.__s_tileNum(Math.floor(mx / 256), Math.floor(my / 256))) || null;

// ---- the drawn buildings (as dev-count: near version for street fronts), furniture, barriers
const boxy = (o) => o.fill >= 0.72 && (1 - o.fill) * o.w * o.d < 45;
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const BLD = new Map();
function tileB(key) {
  if (BLD.has(key)) return BLD.get(key);
  const c = built.get(key) || null, t = c ? c.src : readTile(key);
  if (!t) { BLD.set(key, null); return null; }
  const [tx, ty] = key.split('_').map(Number), F = world.frontsOf(key, t), list = [];
  (t.b || []).forEach((e, bi) => {
    const ring = []; for (let i = 3; i + 1 < e.length; i += 2) ring.push([e[i] / 10, 256 - e[i + 1] / 10]);
    if (ring.length < 3) return;
    const o = geo.obbOf(ring);
    list.push({ ring, o, rects: boxy(o) ? [{ x: 0, z: 0, w: o.w, d: o.d }] : geo.rectsOf(ring, o), units: F.byB.get(bi) || null, parts: !!(t.bp && t.bp[bi]) });
  });
  const T = { tx, ty, list }; BLD.set(key, T); return T;
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
function inBuilding(mx, my) {
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const T = tileB((Math.floor(mx / 256) + a) + '_' + (Math.floor(my / 256) + b));
    if (!T) continue;
    const x = mx - T.tx * 256, z = T.ty * 256 + 256 - my;
    for (const B of T.list) {
      const o = B.o; if (Math.abs(x - o.cx) > o.w + o.d || Math.abs(z - o.cz) > o.w + o.d) continue;
      if (inRing(x, z, B.ring)) return 'footprint';
      if (B.parts) continue;
      if (B.units ? inUnits(x, z, B.units) : inRects(x, z, o, B.rects)) return B.units ? 'facade' : 'block';
    }
  }
  return null;
}

const out = { when: new Date().toISOString(), src: srcDir, secs: SECS, streets: [] };
for (const street of streets) {
  const sp = typeof opt.at === 'string' ? opt.at.split(',').map(Number) : SPOTS[street];
  if (!sp) { console.log(street + ': unknown spot (give --at mx,my,dx,dy)'); continue; }
  const [fox, foy, fdx, fdy] = sp;
  const frame = { ox: fox, oy: foy, dx: fdx, dy: fdy, M: (x, z) => [fox + x * fdx + z * fdy, foy + x * fdy - z * fdx], S: (mx, my) => { const a = mx - fox, b = my - foy; return [a * fdx + b * fdy, a * fdy - b * fdx]; } };
  const M = frame.M, tx0 = Math.floor(fox / 256), ty0 = Math.floor(foy / 256), keys = [];
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const k = (tx0 + a) + '_' + (ty0 + b); build(k); if (Math.abs(a) <= 1 && Math.abs(b) <= 1) keys.push(k); }
  const W = { frame, C, city, night: false, clsAt: (x, z) => { const m = M(x, z); return world.__s_classAt(m[0], m[1]); }, hAt: (x, z) => { const m = M(x, z); return world.__s_surfaceAt(city, m[0], m[1]); }, treeNear: (x, z, r = 1.2) => { const m = M(x, z); return world.__s_treeNearMap(m[0], m[1], r); } };
  if (groundM) W.ground = groundM.makeGround({ frame, city, tileAt, C, WET: world.__s_WET });
  stubs.rnd.reset();
  const crowd = new crowdM.Crowd(W, {});
  if (opt.seed) crowd.seed = (1234567 + 7919 * +opt.seed) >>> 0; // (--seed: another draw of the crowd, for counts averaged over several)
  if (opt.maxped) crowd.max[0] = +opt.maxped; // (--maxped n: a lower walker cap, as a street that has the cap reached by its neighbours in the browser)
  if (opt.cam) {
    const THREE = await import('three'), cam = new THREE.PerspectiveCamera(30, 1.6, 1, 9000), y0 = W.hAt(0, 0) + 1.5, az = 0.4, el = 0.7, dist = 70;
    cam.position.set(Math.sin(az) * Math.cos(el) * dist, y0 + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    cam.lookAt(0, y0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    crowd.cam = cam;
  }
  const clr = [];
  if (crowd._clearLanes && !crowd._clearStep) { const f0 = crowd._clearLanes.bind(crowd); crowd._clearLanes = (o) => { const t1 = process.hrtime.bigint(); f0(o); clr.push(Number(process.hrtime.bigint() - t1) / 1e6); }; } // (older trees: the job ran in one go)
  const ta = process.hrtime.bigint();
  for (const k of keys) { const c = built.get(k); if (c) crowd.addTile(c); }
  const addMs = Number(process.hrtime.bigint() - ta) / 1e6 / keys.length;
  // furniture near the spot, in scene coordinates: props (FURN radius, core half of it), trunks; barriers (t.x)
  const furn = [], bars = [];
  for (const [k, c] of built) {
    if (!c) continue;
    for (const q of c.props || []) { const f = setting.furnOf(q.kind); if (!(f[1] > 0) || f[0] < 0.2) continue; const p = frame.S(c.ox + q.x, c.oy + 256 - q.z); if (Math.hypot(p[0], p[1]) < R + 10) furn.push({ x: p[0], z: p[1], r: f[1], kind: q.kind }); }
    for (const e of c.src.x || []) { const th = [0.3, 0.3, 0.08, 0.8, 0.6][e[0]] ?? 0.3; for (let i = 2; i + 3 < e.length; i += 2) { const p = frame.S(c.ox + e[i] / 10, c.oy + e[i + 1] / 10), q = frame.S(c.ox + e[i + 2] / 10, c.oy + e[i + 3] / 10); if (Math.hypot(p[0], p[1]) < R + 30) bars.push([p[0], p[1], q[0], q[1], th]); } }
  }
  const isPost = (k) => k === 'lamp' || k === 'tree';
  function standing(x, z) {
    // furniture core / barrier at scene (x, z): 'kind' | 'barrier' | null (as dev-count's furnHit)
    for (const f of furn) { const d = Math.hypot(x - f.x, z - f.z); if (d < f.r / 2) return f.kind; }
    for (const o of crowd.owners.values()) {
      if (!o.on) continue;
      const wait = o.pend.length ? new Set(o.pend) : null;
      for (let i = 0; i + 3 < o.parked.length; i += 4) { if (wait && wait.has(i)) continue; const dx = x - o.parked[i], dz = z - o.parked[i + 1]; if (Math.abs(dx) > 3 || Math.abs(dz) > 3) continue; const fx = Math.sin(o.parked[i + 2]), fz = Math.cos(o.parked[i + 2]), u = Math.abs(dx * fx + dz * fz), v = Math.abs(dx * fz - dz * fx); if (u < 2.2 - 0.15 && v < 0.925 - 0.15) return 'parkedCar'; }
      for (let i = 0; i + 3 < o.lamps.length; i += 4) { if (wait && wait.has(-1 - i)) continue; if (Math.hypot(x - o.lamps[i], z - o.lamps[i + 1]) < ([0.2, 0.35, 0.15, 0.2][o.lamps[i + 3]] ?? 0.2)) return 'lamp'; }
    }
    if (W.treeNear(x, z, 0.35)) return 'tree';
    for (const [ax, az, bx, bz, th] of bars) { const ex = bx - ax, ez = bz - az, l = ex * ex + ez * ez || 1e-9, u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l)); if (Math.hypot(ax + ex * u - x, az + ez * u - z) < th / 2 + 0.15) return 'barrier'; }
    return null;
  }
  const FEET = [[-0.36, -0.17], [0.36, -0.17], [-0.36, 0.27], [0.36, 0.27]];
  const xf = (m, o, lx, lz) => [m[o] * lx + m[o + 8] * lz + m[o + 12], m[o + 2] * lx + m[o + 10] * lz + m[o + 14]];
  const T = { samples: 0, people: 0, pairs: 0, pairEv: 0, bld: 0, core: 0, barrier: 0, wet: 0, sink: 0, float: 0, rail: 0, vv: 0, inside: 0, why: {}, ms: [], held: { walk: 0, bike: 0, car: 0, tram: 0, near: 0 } };
  const bump = (k) => { T.why[k] = (T.why[k] || 0) + 1; };
  let last = new Set();
  const hist = new Map();
  const order = new Map();
  globalThis.performance.now = () => Number(process.hrtime.bigint()) / 1e6; // (a real clock for the run: lane clearing keeps to a time budget)
  if (opt.det) { let vt = 0; globalThis.performance.now = () => (vt += 0.05); } // (--det: a clock that ticks per look, so lane clearing does the same work every frame and every run: for comparing counts, not times)
  const stillT = new Map();
  let fr20 = 0, frN = 0;
  for (let step = 0; step * DT < SECS; step++) {
    const t0 = process.hrtime.bigint();
    crowd.update(DT, 0, 0, 60);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    T.msMax = Math.max(T.msMax || 0, ms); // (every frame, the first ones too: the street is filled then)
    frN++; if (ms > 20) fr20++;
    for (const a of crowd.agents) {
      if (a.dead || !a.vis || a.kind === 0 || a.fixed) continue;
      if (a.v < 0.3 && crowd._seen(a.x, a.z)) { const t2 = (stillT.get(a) || 0) + DT; stillT.set(a, t2); if (t2 > 20 && t2 - DT <= 20) { T.still20 = (T.still20 || 0) + 1; if (process.env.STILLDBG) { const rem = a.dir > 0 ? a.lane.len - a.s : a.s; console.log('STILL', street, 'kind', a.kind, 'held', a.held, 'jw', (a.jw || 0).toFixed(1), 'wait', (a.wait || 0).toFixed(1), 'rem', rem.toFixed(1), 'lanelen', a.lane.len.toFixed(0), 'nx', !!a.nx, 'sb', a.sb, 'hold', a.hold, 'xz', a.x.toFixed(1), a.z.toFixed(1), 'cls', a.lane.cls); const hx = Math.sin(a.hd), hz = Math.cos(a.hd); let best = null, bd = 30; for (const b of crowd.agents) { if (b === a || b.dead || !b.vis) continue; const dx = b.x - a.x, dz = b.z - a.z, fw = dx * hx + dz * hz, lt = Math.abs(dx * hz - dz * hx); if (fw > 0.3 && fw < bd && lt < 2.5) { bd = fw; best = b; } } if (best) console.log('   ahead', bd.toFixed(1), 'kind', best.kind, 'v', best.v.toFixed(2), 'held', best.held, 'wait', (best.wait || 0).toFixed(1), 'jw', (best.jw || 0).toFixed(1), 'cross', !!best.cross, 'sm', best.sm, 'samelane', best.lane === a.lane, 'hdDot', (Math.sin(best.hd) * hx + Math.cos(best.hd) * hz).toFixed(2)); } } T.stillMax = Math.max(T.stillMax || 0, t2); if (a.kind === 4) T.tramMax = Math.max(T.tramMax || 0, t2); }
      else stillT.delete(a);
    }
    const now = step * DT;
    for (const a of crowd.agents) {
      if (a.dead || a.kind !== 0) continue;
      let h = hist.get(a);
      if (!h) { hist.set(a, (h = { born: now, lane: a.lane, dir: a.dir, hop: -9, turn: -9 })); continue; }
      if (a.lane !== h.lane) { h.lane = a.lane; h.dir = a.dir; h.hop = now; }
      else if (a.dir !== h.dir) { if (now - h.turn < 1 && now >= 10) T.pingPong = (T.pingPong || 0) + 1; if (now >= 10) T.turns = (T.turns || 0) + 1; h.dir = a.dir; h.turn = now; }
    }
    if (step * DT < 10) continue;
    T.ms.push(ms);
    if (step % 5) continue;
    T.samples++;
    const P = [], V = [];
    for (const a of crowd.agents) {
      if (!a.dead) { const k = a.kind === 0 ? 'aWalk' : a.kind === 1 ? 'aBike' : a.kind === 2 ? (a.fixed ? 'aParked' : 'aCar') : a.kind === 4 ? 'aTram' : 'aOther'; T.held[k] = (T.held[k] || 0) + 1; }
      if (a.dead || !a.vis) continue;
      if (a.kind === 0) T.held.walk++; else if (a.kind === 1) T.held.bike++; else if (a.kind === 2) T.held.car++; else if (a.kind === 4) T.held.tram++;
      if (!order.has(a)) order.set(a, order.size);
      if (a.kind === 0) {
        if (a.down > 0) continue;
        const m = a.pp.m, o = a.slot * 16; if (!(m[o + 5] > 1e-4)) continue;
        const x = m[o + 12], z = m[o + 14]; if (x * x + z * z > R * R) continue;
        P.push({ id: 'a' + order.get(a), a, x, z, y: m[o + 13], m, o });
      } else if (a.kind === 1 || a.kind === 2) {
        const pool = a.kind === 2 ? crowd.cars : a.vp, m = pool.m, o = a.slot * 16; if (!(m[o + 5] > 1e-4)) continue;
        const x = m[o + 12], z = m[o + 14]; if (x * x + z * z > R * R) continue;
        const fh = Math.hypot(m[o + 8], m[o + 10]) || 1, car = a.kind === 2;
        V.push({ id: 'v' + order.get(a), a, x, z, y: m[o + 13], m, o, fx: m[o + 8] / fh, fz: m[o + 10] / fh, hl: car ? 2.2 : 0.93, hw: car ? 0.925 : 0.3, wheels: car ? [[-0.79, -1.27], [0.79, -1.27], [-0.79, 1.27], [0.79, 1.27]] : [[0, -0.6], [0, 0.6]] });
      }
    }
    for (const o of crowd.owners.values()) if (o.on) for (const g of o.groups) if (g.shown) for (const mm of g.members) { const m = mm.pp.m, q = mm.slot * 16, x = m[q + 12], z = m[q + 14]; if (x * x + z * z < R * R) P.push({ id: 'g' + g.x.toFixed(1) + mm.hd.toFixed(2), g, x, z, y: m[q + 13], m, o: q }); }
    T.held.near += P.length; T.people += P.length;
    for (const o of crowd.owners.values()) if (o.on) for (const g of o.groups) { T.gPlan = (T.gPlan || 0) + g.members.length; if (g.shown) T.gShown = (T.gShown || 0) + g.members.length; }
    const cur = new Set();
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const A = P[i], B = P[j], d = Math.hypot(A.x - B.x, A.z - B.z);
      if (d >= 0.45) continue;
      if (A.g && A.g === B.g && A.g.sm !== 1) continue; // a standing group's own members: staged
      T.pairs++;
      if (d < 0.15) { // a deep pair: where (2 m cells of map metres), and the stretch of lane the walker is in
        T.deep = (T.deep || 0) + 1;
        const mm = M((A.x + B.x) / 2, (A.z + B.z) / 2), ck = Math.round(mm[0] / 2) * 2 + ',' + Math.round(mm[1] / 2) * 2;
        const c = (T.deepAt ||= new Map()).get(ck) || { n: 0, pocket: null, ids: new Set() }; c.n++; c.ids.add(A.id); c.ids.add(B.id);
        const q = A.a || B.a;
        if (q && q.lane && q.lane.blk && !c.pocket) { const bl = q.lane.blk, i0 = Math.round(q.s * 2); let lo = i0, hi = i0; while (lo > 0 && !bl[lo - 1]) lo--; while (hi < bl.length - 1 && !bl[hi + 1]) hi++; c.pocket = { len: +((hi - lo) * 0.5).toFixed(1), lane: +q.lane.len.toFixed(1), blocked: bl.reduce((x, v) => x + (v ? 1 : 0), 0) }; }
        T.deepAt.set(ck, c);
      }
      const k = A.id < B.id ? A.id + '|' + B.id : B.id + '|' + A.id; cur.add(k);
      if (!last.has(k)) {
        T.pairEv++;
        // where a new overlap comes from: a walker that just appeared, just joined another lane, just turned round, or none of these
        const now2 = step * DT, why = [A, B].map((q) => { const h = q.a && hist.get(q.a); return !h ? 'group' : now2 - h.born < 1.5 ? 'spawned' : now2 - h.hop < 1.5 ? 'joined' : now2 - h.turn < 1.5 ? 'turned' : ''; }).filter(Boolean);
        bump('pairEvent.' + (why.length ? [...new Set(why)].sort().join('+') : 'walking'));
      }
      bump('pair.' + (A.a && B.a ? (A.a.lane === B.a.lane ? (A.a.dir === B.a.dir ? 'sameLaneSameWay' : 'sameLaneOncoming') : 'otherLanes') + (Math.abs(A.a.lat) + Math.abs(B.a.lat) > 0.5 ? '.stepped' : '.notStepped') + (A.a.cross || B.a.cross ? '.crossing' : '') + (A.a.sm || B.a.sm ? '.stage' : '') : 'withGroup'));
    }
    last = cur;
    for (const p of P) {
      const mm = M(p.x, p.z), hint = p.g ? 'group' : p.a.cross ? 'crossing' : Math.abs(p.a.lat) > 0.3 ? 'sidestep' : Math.abs(p.a.ox) + Math.abs(p.a.oz) > 0.3 ? 'offLane' : p.a.sm ? 'stage' : 'onLane';
      let inside = null;
      const b = inBuilding(mm[0], mm[1]);
      if (b) { T.bld++; bump('bld.' + b + '.' + hint); inside = 'building'; }
      const s = standing(p.x, p.z);
      if (s === 'barrier') { T.barrier++; bump('barrier.' + hint); inside ||= 'barrier'; }
      else if (s) { T.core++; bump('core.' + s + '.' + hint); inside ||= 'furniture'; }
      const cls = W.clsAt(p.x, p.z);
      if (cls === C.WATER || cls === C.SEA) { T.wet++; inside ||= 'water'; }
      if (inside) T.inside++;
      const hc = W.hAt(p.x, p.z);
      let hi = hc; for (const [lx, lz] of FEET) { const q = xf(p.m, p.o, lx, lz), h = W.hAt(q[0], q[1]); if (h > hi) hi = h; }
      if (hi - p.y > 0.15) { T.sink++; bump('sink.' + hint); }
      if (p.y - hi > 0.15) { T.float++; bump('float.' + hint); }
    }
    for (const v of V) {
      let hi = -Infinity, up = 0, rail = 0;
      for (const [lx, lz] of v.wheels) { const q = xf(v.m, v.o, lx, lz); if (W.clsAt(q[0], q[1]) === C.RAIL) { rail++; continue; } const h = W.hAt(q[0], q[1]); if (h > hi) hi = h; if (v.y - h > 0.15) up++; }
      if (rail) T.rail++;
      if (hi > -Infinity && hi - v.y > 0.15) { T.sink++; bump('sink.vehicle'); }
      if (up >= 2) { T.float++; bump('float.vehicle'); }
    }
    if (step % 15 === 0) { // the whole crowd, every third sample: vehicles inside each other anywhere (circle test, three along a car)
      const AV = crowd.agents.filter((a) => !a.dead && a.vis && (a.kind === 1 || a.kind === 2));
      const circ = (a) => { const sx = Math.sin(a.hd), sz = Math.cos(a.hd), r = a.kind === 2 ? 0.9 : 0.3, o = a.kind === 2 ? 1.3 : 0.45; return [[a.x + sx * o, a.z + sz * o, r], [a.x, a.z, r], [a.x - sx * o, a.z - sz * o, r]]; };
      for (let i = 0; i < AV.length; i++) for (let j = i + 1; j < AV.length; j++) {
        const A = AV[i], B = AV[j];
        if (Math.abs(A.x - B.x) > 5 || Math.abs(A.z - B.z) > 5) continue;
        let hit = false;
        for (const p of circ(A)) for (const q of circ(B)) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < p[2] + q[2] - 0.2) hit = true;
        if (!hit) continue;
        const c = Math.sin(A.hd) * Math.sin(B.hd) + Math.cos(A.hd) * Math.cos(B.hd);
        T.vvAll = (T.vvAll || 0) + 3;
        bump('vvAll.' + (A.kind === 2 ? 'car' : 'bike') + (B.kind === 2 ? 'Car' : 'Bike') + (Math.abs(c) < 0.7 ? '.crossing' : A.lane === B.lane ? '.sameLane' : c < 0 ? '.oncoming' : '.sameWay') + (A.v < 0.3 && B.v < 0.3 ? '.bothStill' : ''));
        T.why['vvAll.' + (A.kind === 2 ? 'car' : 'bike') + (B.kind === 2 ? 'Car' : 'Bike') + (Math.abs(c) < 0.7 ? '.crossing' : A.lane === B.lane ? '.sameLane' : c < 0 ? '.oncoming' : '.sameWay') + (A.v < 0.3 && B.v < 0.3 ? '.bothStill' : '')] += 2; // (sampled every third sample)
      }
      let pk = 0; for (const o of crowd.owners.values()) for (const a of o.agents) if (a.fixed && a.kind === 2) pk++; T.parkedUp = (T.parkedUp || 0) + pk * 3;
    }
    for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
      const A = V[i], B = V[j];
      if (Math.abs(A.x - B.x) > A.hl + B.hl || Math.abs(A.z - B.z) > A.hl + B.hl) continue;
      const dx = B.x - A.x, dz = B.z - A.z;
      let sep = false;
      for (const [ax, az] of [[A.fx, A.fz], [A.fz, -A.fx], [B.fx, B.fz], [B.fz, -B.fx]]) {
        const d = Math.abs(dx * ax + dz * az), ra = A.hl * Math.abs(A.fx * ax + A.fz * az) + A.hw * Math.abs(A.fz * ax - A.fx * az), rb = B.hl * Math.abs(B.fx * ax + B.fz * az) + B.hw * Math.abs(B.fz * ax - B.fx * az);
        if (d > ra + rb - 0.2) { sep = true; break; }
      }
      if (sep) continue;
      T.vv++;
      bump('vv.' + (A.a.ghost > 0 || B.a.ghost > 0 ? 'passThrough' : Math.abs(A.fx * B.fx + A.fz * B.fz) < 0.7 ? 'crossing' : A.a.lane === B.a.lane ? (Math.min(A.a.s, B.a.s) < 4 ? 'laneStart' : 'sameLane') : 'otherLanes'));
    }
  }
  const per = 60 / (T.samples * 5 * DT), ms = T.ms.slice().sort((a, b) => a - b);
  const row = { street, samples: T.samples, n: +(T.people / T.samples).toFixed(1) };
  for (const k of ['pairs', 'pairEv', 'bld', 'core', 'barrier', 'wet', 'sink', 'float', 'rail', 'vv', 'inside', 'vvAll']) row[k] = +((T[k] || 0) * per).toFixed(1);
  row.parkedUp = +((T.parkedUp || 0) / T.samples).toFixed(0);
  row.alive = Object.fromEntries(['aWalk', 'aBike', 'aCar', 'aTram'].map((k) => [k.slice(1).toLowerCase(), +((T.held[k] || 0) / T.samples).toFixed(0)]));
  row.held = { walk: +(T.held.walk / T.samples).toFixed(0), bike: +(T.held.bike / T.samples).toFixed(0), car: +(T.held.car / T.samples).toFixed(0), tram: +(T.held.tram / T.samples).toFixed(0) };
  row.addTileMs = +addMs.toFixed(1);
  { // the walkers the crowd means to hold: the sum over its walking lanes of density x length x the district's share (x pedK), owners on
    const DP = { 2: 1.5, 3: 1.5, 4: 1.3, 5: 0.9, 6: 0.85, 7: 0.7, 8: 4.2, 11: 0.5 };
    let w = 0; for (const o of crowd.owners.values()) if (o.on) for (const l of o.lanes) if (l.kind === 0 && !l.dead) w += ((DP[l.cls] || 0) * l.len * crowd._info(l).mult * (o.pedK || 1)) / 100;
    row.walkersMeant = +w.toFixed(1);
    row.deep = +((T.deep || 0) * per).toFixed(1); // (pairs closer than 0.15 m, per minute as pairs)
    row.deepTop = [...(T.deepAt || new Map())].sort((p, q) => q[1].n - p[1].n).slice(0, 4).map(([k, c]) => ({ at: k, n: c.n, ids: c.ids.size, pocket: c.pocket }));
    row.groupMembers = { shown: +((T.gShown || 0) / T.samples).toFixed(1), planned: +((T.gPlan || 0) / T.samples).toFixed(1) };
  }
  { // the same for the vehicles (bike, car, tram), with _fill's densities
    const DV = { 1: { 3: 0.5, 4: 0.5, 5: 0.35, 6: 0.25, 7: 0.2, 10: 1.0 }, 2: { 1: 2.0, 2: 1.9, 3: 1.6, 4: 1.2, 5: 0.7, 6: 0.3, 7: 0.14, 9: 0.04, 13: 0.2 }, 4: { 1: 0.14 } }, m = { 1: 0, 2: 0, 4: 0 };
    for (const o of crowd.owners.values()) if (o.on) for (const l of o.lanes) if (DV[l.kind] && !l.dead) m[l.kind] += ((DV[l.kind][l.cls] || 0) * l.len * crowd._info(l).mult) / 100;
    row.vehiclesMeant = { bike: +m[1].toFixed(1), car: +m[2].toFixed(1), tram: +m[4].toFixed(1) };
  }
  row.msMax = +(T.msMax || 0).toFixed(1); row.frames20 = fr20; row.still20 = +((T.still20 || 0) * 60 / SECS).toFixed(1); row.stillMax = +(T.stillMax || 0).toFixed(0); row.tramMax = +(T.tramMax || 0).toFixed(0); row.turns = +((T.turns || 0) * 60 / (SECS - 10)).toFixed(1); row.pingPong = +((T.pingPong || 0) * 60 / (SECS - 10)).toFixed(1);
  { let L = 0; for (const o of crowd.owners.values()) for (const l of o.lanes) if (l.kind === 0) L += l.len * (o.pedK || 1); row.pedLaneDensityM = +L.toFixed(0); } // (walking lane metres the crowd fills, cut lanes' share included)
  row.clearLanesMs = clr.length ? { n: clr.length, mean: +(clr.reduce((p, q) => p + q, 0) / clr.length).toFixed(1), max: +Math.max(...clr).toFixed(1) } : null;
  row.ms = { mean: +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(3), p50: +ms[ms.length >> 1].toFixed(3), p99: +ms[Math.floor(ms.length * 0.99)].toFixed(3) };
  row.why = Object.fromEntries(Object.entries(T.why).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [k, +(v * per).toFixed(1)]));
  out.streets.push(row);
  console.log(`${street.padEnd(18)} n ${String(row.n).padStart(5)}  pair ${row.pairs} pEv ${row.pairEv} bld ${row.bld} core ${row.core} bar ${row.barrier} wet ${row.wet} sink ${row.sink} float ${row.float} rail ${row.rail} vv ${row.vv} in! ${row.inside} | vvAll ${row.vvAll} parked ${row.parkedUp} | alive ${JSON.stringify(row.alive)} visible ${JSON.stringify(row.held)} | update ms ${JSON.stringify(row.ms)} | addTile ${row.addTileMs} ms | lane clearing ${JSON.stringify(row.clearLanesMs)} | worst update ${row.msMax} ms (${row.frames20} frames > 20 ms) | still>20s in view ${row.still20}/min, longest ${row.stillMax} s (tram ${row.tramMax} s) | turns/min ${row.turns} ping-pong ${row.pingPong} | PED lane m ${row.pedLaneDensityM} | walkers meant ${row.walkersMeant} | deep ${row.deep} ${JSON.stringify(row.deepTop)} | group members ${JSON.stringify(row.groupMembers)} vehicles meant ${JSON.stringify(row.vehiclesMeant)}`);
  console.log('   ' + JSON.stringify(row.why));
}
if (typeof opt.json === 'string') fs.writeFileSync(opt.json, JSON.stringify(out, null, 1));
