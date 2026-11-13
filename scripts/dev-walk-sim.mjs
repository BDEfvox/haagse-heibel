// Dev tool: the walking character (src/voxel/walker.js) headless under Node, on the real finest-level tiles and W.ground, with the
// city's crowd around him (its parked cars, walkers, bikes, cars and trams: walker.js treats them as the browser does, and the crowd
// sees him in its blocker list as the stage's _brief puts him there). He is steered along a route of map-metre waypoints the way a
// player would: the camera is turned (Q/E, 1.3 rad/s) to stay behind him, W is held, and while the way to go is far off (more than 0.4 rad)
// the eight-way keys nearest it, so the
// input is the key handler's input. Half-way (a waypoint marked `swap`) the scene frame changes to another street's, as a focus shift
// does: his place in map metres must not jump.
// Counted per frame (with dev-count's definitions where it has them): inside a drawn building (footprint ring, street fronts and
// backs, rect cover), inside furniture (the core: half the FURN radius; a parked car shrunk by 0.15 m; a lamp post; a trunk), a
// barrier, water; the feet against W.hAt (sink: a contact point more than 0.15 m under the ground; float: all of them more than
// 0.15 m above it); the largest jump between frames in map metres; blocked time; the nearest crowd walker.
//   node scripts/dev-walk-sim.mjs [--src src] [--json out.json] [--route name] [--map cx,cy,r]
// --map prints the ground classes round a map point (2 m a character) instead, to choose waypoints.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepare } from './snapshot/lib/prepare.mjs';
import { installStubs } from './snapshot/lib/stubs.mjs';
import { ROUTE, SPOTS, pursue } from './dev-walk-route.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, '..');
const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
const DT = 1 / 60;
const srcDir = path.resolve(typeof opt.src === 'string' ? opt.src : path.join(REPO, 'src'));

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'heibel-walksim-'));
process.on('exit', () => fs.rmSync(work, { recursive: true, force: true }));
const prep = prepare({ srcDir, work, modules: path.join(REPO, 'node_modules'), scriptsFrom: null });
fs.appendFileSync(path.join(prep.srcWork, 'voxel/world.js'), '\nexport { ensureTile as __s_ensureTile, classAt as __s_classAt, surfaceAt as __s_surfaceAt, treeNearMap as __s_treeNearMap, WET as __s_WET, _byNum as __s_byNum, tileNum as __s_tileNum };\n');
const stubs = installStubs({ dataDir: path.join(REPO, 'public/data'), modules: path.join(REPO, 'node_modules') });
const imp = (f) => import(pathToFileURL(path.join(prep.srcWork, f)).href);
const world = await imp('voxel/world.js'), crowdM = await imp('voxel/crowd.js'), setting = await imp('voxel/setting.js'), geo = await imp('voxel/geo.js');
const groundM = await imp('voxel/ground.js'), walkerM = await imp('voxel/walker.js');
const C = world.C, city = await world.__h_loadCity();
const CLS = Object.fromEntries(Object.entries(C).map(([k, v]) => [v, k]));
const readTile = (key) => { const p = path.join(REPO, 'public/data/world/tiles', key + '.json'); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const built = new Map();
function build(key) {
  if (built.has(key)) return built.get(key);
  const t = readTile(key);
  stubs.rnd.reset();
  const c = t ? world.__s_ensureTile(city, key, t, 0, false, false) : null;
  built.set(key, c);
  if (c) addFurn(c);
  return c;
}
const tileAt = (mx, my) => world.__s_byNum.get(world.__s_tileNum(Math.floor(mx / 256), Math.floor(my / 256))) || null;
const around = (mx, my, n, fn) => { const tx = Math.floor(mx / 256), ty = Math.floor(my / 256); for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) fn((tx + a) + '_' + (ty + b)); };

// ---- what the tiles draw (as dev-crowd-sim / dev-count): buildings, furniture (map metres), barriers
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
const FURN = [], BARS = []; // map metres
function addFurn(c) {
  for (const q of c.props || []) { const f = setting.furnOf(q.kind); if (!(f[1] > 0) || f[0] < 0.2) continue; FURN.push({ x: c.ox + q.x, y: c.oy + 256 - q.z, r: f[1], kind: q.kind }); }
  for (const e of c.src.x || []) { const th = [0.3, 0.3, 0.08, 0.8, 0.6][e[0]] ?? 0.3; for (let i = 2; i + 3 < e.length; i += 2) BARS.push([c.ox + e[i] / 10, c.oy + e[i + 1] / 10, c.ox + e[i + 2] / 10, c.oy + e[i + 3] / 10, th]); }
}

// ---- the made-up cases first (no tiles: a ground made here that answers W.ground's question the same way, centre and four points
// at r): what the real route may never show. Each must hold, or the walk fails.
//   stairs     0.3 m steps every 0.4 m, up and down: never drawn under the ground under his feet, never more than 0.05 m over it
//   ledge      walking along a 0.8 m wall top 0.3 m beside him (higher than he may step): not drawn on top of it
//   car        a parked car's place appears under him: he only steps out, the way that is free (never deeper in), within 1.2 s
//   building   a building cell appears under him: within 1.5 s he is put on a free spot within 2 m
//   walled     a building all round him: he is given up (lost), so the stage takes him away with a message
const UNIT = {};
{
  const BLD = groundM.BUILDING, PARK = groundM.PARKED, STAND = groundM.STANDING;
  const fake = (terrain, discs) => {
    const G = { cls: 0, bits: 0, dyn: null, ready: () => true };
    const pt = (x, z, ign) => { for (const d of discs) if ((x - d.x) ** 2 + (z - d.z) ** 2 < d.r * d.r && d.bit & ~ign) { G.bits = d.bit; return NaN; } G.bits = 0; return terrain(x, z); };
    G.at = (x, z, r = 0.25, who = 0, ign = 0) => { let h = pt(x, z, ign); if (h !== h || !(r > 0)) return h; for (let k = 0; k < 4; k++) { const q = pt(k === 0 ? x + r : k === 1 ? x - r : x, k === 2 ? z + r : k === 3 ? z - r : z, ign); if (q !== q) return NaN; if (q > h) h = q; } return h; };
    return { frame: { ox: 0, oy: 0, dx: 1, dy: 0 }, ground: G, hAt: terrain };
  };
  // the counter's measure: his drawn matrix, the centre and four shoe corners against the ground (only ground he may stand on: a
  // corner over the ledge, higher than he may step, is the ledge's, not his)
  const feet = (w, Wf, lim = Infinity) => { w.g.updateMatrixWorld(true); const e = w.g.matrixWorld.elements, x = e[12], y = e[13], z = e[14]; let hi = Wf.hAt(x, z); for (const [lx, lz] of [[-0.36, -0.17], [0.36, -0.17], [-0.36, 0.27], [0.36, 0.27]]) { const h = Wf.hAt(e[0] * lx + e[8] * lz + x, e[2] * lx + e[10] * lz + z); if (h > hi && h <= lim) hi = h; } return { y, d: y - hi, x, z }; };
  const run = (Wf, w, secs, ix, iy, each) => { for (let i = 0; i < secs * 60; i++) { w.step(Wf, 1 / 60, ix, iy, Math.PI, false); if (each) each(i); } };
  { // stairs: up for 3 m, flat, then back down
    const Wf = fake((x, z) => (z < 1 ? 0 : z < 4 ? Math.floor((z - 1) / 0.4 + 1) * 0.3 : 8 * 0.3), []);
    const w = new walkerM.Walker(); w.place(Wf, 0, 0, 0, 1);
    let lo = Infinity, hi = -Infinity;
    const f = () => { const q = feet(w, Wf); lo = Math.min(lo, q.d); hi = Math.max(hi, q.d); };
    run(Wf, w, 2.5, 0, 1, f); run(Wf, w, 2.5, 0, -1, f);
    UNIT.stairs = { ok: lo > -1e-6 && hi < 0.05, under: +(-lo).toFixed(3), over: +hi.toFixed(3) }; w.dispose();
  }
  { // ledge: a 0.8 m wall top at x > 0.55 (his centre at 0.25 walks along it)
    const Wf = fake((x) => (x > 0.55 ? 0.8 : 0), []);
    const w = new walkerM.Walker(); w.place(Wf, 0.25, 0, 0, 1);
    let top = -Infinity; run(Wf, w, 2, 0, 1, () => { top = Math.max(top, w.y); });
    UNIT.ledge = { ok: top < 0.05, maxY: +top.toFixed(3) }; w.dispose();
  }
  { // a parked car's place appears under him (its centre 0.6 m to his right): input straight ahead, along the car
    const discs = [], Wf = fake(() => 0, discs);
    const w = new walkerM.Walker(); w.place(Wf, 0, 0, 0, 1);
    discs.push({ x: 0.6, z: 0, r: 1.2, bit: PARK });
    let deeper = 0, d0 = 0.6, out = -1, along = 0;
    run(Wf, w, 3, 0, 1, (i) => { const p = w.g.position, d = Math.hypot(p.x - 0.6, p.z); if (d < d0 - 1e-6 && d < 1.2) deeper++; d0 = d; if (out < 0 && Wf.ground.at(p.x, p.z, 0.25) === Wf.ground.at(p.x, p.z, 0.25)) out = i / 60; if (out < 0) along = Math.max(along, Math.abs(p.z)); });
    UNIT.car = { ok: !deeper && out >= 0 && out < 1.2 && along < 0.3, deeperSteps: deeper, outAfterS: +out.toFixed(2), alongCarM: +along.toFixed(2) }; w.dispose(); void STAND;
  }
  { // a building cell appears under him
    const discs = [], Wf = fake(() => 0, discs);
    const w = new walkerM.Walker(); w.place(Wf, 0, 0, 0, 1);
    discs.push({ x: 0.2, z: 0.1, r: 0.9, bit: BLD });
    let when = -1; run(Wf, w, 2, 0, 0, (i) => { if (when < 0 && w.moves) when = i / 60; });
    const p = w.g.position, d = Math.hypot(p.x, p.z);
    UNIT.building = { ok: when >= 0 && when < 1.5 && d <= 2.01 && !w.lost && Wf.ground.at(p.x, p.z, 0.25) === Wf.ground.at(p.x, p.z, 0.25), movedAfterS: +when.toFixed(2), movedM: +d.toFixed(2) }; w.dispose();
  }
  { // walled in: a building all round
    const discs = [], Wf = fake(() => 0, discs);
    const w = new walkerM.Walker(); w.place(Wf, 0, 0, 0, 1);
    discs.push({ x: 0, z: 0, r: 4, bit: BLD });
    run(Wf, w, 1.5, 0, 1);
    UNIT.walled = { ok: w.lost, lost: w.lost }; w.dispose();
  }
  console.log('made-up cases: ' + JSON.stringify(UNIT));
}
const UNIT_OK = Object.values(UNIT).every((u) => u.ok);
if (opt.unit) { console.log(UNIT_OK ? 'CASES PASS' : 'CASES FAIL'); process.exit(UNIT_OK ? 0 : 1); }

// ---- --map: the ground classes round a point
if (typeof opt.map === 'string') {
  const [cx, cy, r] = opt.map.split(',').map(Number), CH = { WATER: '~', SEA: '~', BUILDING: '#', ASPHALT: '=', KLINKER: '=', SERVICE: '-', CYCLE: 'c', BIKELANE: 'c', MARK: '=', CURB: ':', WALK: '.', PED: ',', PLAZA: 'p', FOOT: 'f', GRASS: 'g', FOREST: 'g', LAND: ' ', RAIL: 'r', RAILBED: 'r', PARKING: 'P', DIRT: 'd' };
  around(cx, cy, Math.ceil(r / 256) + 1, build);
  const lines = [];
  for (let y = cy + r; y >= cy - r; y -= 2) { let s = ''; for (let x = cx - r; x <= cx + r; x += 2) { const k = CLS[world.__s_classAt(x, y)] || '?'; s += CH[k] ?? '?'; } lines.push(`${String(Math.round(y)).padStart(5)} ${s}`); }
  console.log('x from ' + (cx - r) + ' to ' + (cx + r) + ' by 2 m; legend ' + JSON.stringify(CH));
  console.log(lines.join('\n'));
  process.exit(0);
}

// ---- --walk: where he may stand round a point (1 m a character): '#' building, '~' water, '|' barrier, 'x' other blocker (furniture,
// post, feature), else the ground's height above the terrain in decimetres (a kerb shows as a change of digit)
if (typeof opt.walk === 'string') {
  const [cx, cy, r] = opt.walk.split(',').map(Number);
  around(cx, cy, Math.ceil(r / 256) + 1, build);
  const G = groundM.makeGround({ frame: mkFrame([0, 0, 1, 0]), city, tileAt, C, WET: world.__s_WET }), lines = [];
  for (let y = cy + r; y >= cy - r; y -= 1) {
    let s = '';
    for (let x = cx - r; x <= cx + r; x += 1) {
      const h = G.at(x, -y, 0.25), b = G.bits;
      if (h !== h) s += b & groundM.BUILDING ? '#' : b & groundM.WATER ? '~' : b & groundM.BARRIER ? '|' : 'x';
      else s += String(Math.max(0, Math.min(9, Math.round((h - city.landAt(x, y)) * 10))));
    }
    lines.push(`${String(Math.round(y)).padStart(5)} ${s}`);
  }
  console.log('x from ' + (cx - r) + ' to ' + (cx + r) + ' by 1 m');
  console.log(lines.join('\n'));
  process.exit(0);
}
// ---- --probe mx,my: W.ground.at(.., 0.25) heights (cm) on a 0.25 m grid round a point ('---' blocked, with its bits)
if (typeof opt.probe === 'string') {
  const [cx, cy] = opt.probe.split(',').map(Number);
  around(cx, cy, 1, build);
  const G = groundM.makeGround({ frame: mkFrame([0, 0, 1, 0]), city, tileAt, C, WET: world.__s_WET });
  for (let y = cy + 2; y >= cy - 2.01; y -= 0.25) { let s = String(y.toFixed(2)).padStart(8) + ' '; for (let x = cx - 2; x <= cx + 2.01; x += 0.25) { const h = G.at(x, -y, 0.25); s += h === h ? String(Math.round(h * 100)).padStart(4) : ('b' + G.bits).padStart(4); } console.log(s); }
  console.log('x from ' + (cx - 2) + ' by 0.25; cls at centre ' + (CLS[world.__s_classAt(cx, cy)] || '?'));
  process.exit(0);
}
// ---- the street: a frame (map <-> scene) and its W, as world.js makes them
// (world.js frames are unit vectors: the recorded ones are rounded)
function mkFrame([ox, oy, dx0, dy0]) { const l = Math.hypot(dx0, dy0), dx = dx0 / l, dy = dy0 / l; return { ox, oy, dx, dy, M: (x, z) => [ox + x * dx + z * dy, oy + x * dy - z * dx], S: (mx, my) => { const a = mx - ox, b = my - oy; return [a * dx + b * dy, a * dy - b * dx]; } }; }
function mkW(spot) {
  const frame = mkFrame(spot), M = frame.M;
  const W = { frame, C, city, night: false, clsAt: (x, z) => { const m = M(x, z); return world.__s_classAt(m[0], m[1]); }, hAt: (x, z) => { const m = M(x, z); return world.__s_surfaceAt(city, m[0], m[1]); }, treeNear: (x, z, r = 1.2) => { const m = M(x, z); return world.__s_treeNearMap(m[0], m[1], r); } };
  W.ground = groundM.makeGround({ frame, city, tileAt, C, WET: world.__s_WET });
  return W;
}
const R0 = ROUTE[typeof opt.route === 'string' ? opt.route : 'default'];
if (!R0) { console.error('unknown route'); process.exit(2); }
let W = mkW(SPOTS[R0.frames[0]]);
stubs.rnd.reset();
const crowd = new crowdM.Crowd(W, {});
const added = new Set();
const feed = (mx, my) => around(mx, my, 1, (k) => { if (added.has(k)) return; const c = build(k); added.add(k); if (c) crowd.addTile(c); });
// every tile along the route, its crowd filled (parked cars on their kerbs): the planner below walks round them too
{
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of R0.pts) { x0 = Math.min(x0, q.at[0]); x1 = Math.max(x1, q.at[0]); y0 = Math.min(y0, q.at[1]); y1 = Math.max(y1, q.at[1]); }
  for (let mx = x0 - 130; mx <= x1 + 130; mx += 128) for (let my = y0 - 130; my <= y1 + 130; my += 128) { feed(mx, my); around(mx, my, 1, build); }
  const c = W.frame.S((x0 + x1) / 2, (y0 + y1) / 2);
  for (let i = 0; i < 400; i++) crowd.update(DT, c[0], c[1], 60);
}

// ---- the path: between each two waypoints of the route, the shortest way a person may walk (A* on half-metre cells, W.ground.at
// with a little room, steps of at most 0.4 m, kept 0.75 m clear of walls where it can be), then pulled straight where the straight
// line is clear. Written to --plan (the browser tool, scripts/dev-walk.mjs, follows the same path).
function planLeg(Wp, a, b, legName) {
  const G = Wp.ground, F = Wp.frame, CELL = 0.5, M = 120;
  const x0 = Math.min(a[0], b[0]) - M, y0 = Math.min(a[1], b[1]) - M, nx = Math.ceil((Math.abs(a[0] - b[0]) + 2 * M) / CELL), ny = Math.ceil((Math.abs(a[1] - b[1]) + 2 * M) / CELL);
  const N = nx * ny, H = new Float32Array(N).fill(NaN), PEN = new Uint8Array(N), seen = new Uint8Array(N);
  const cellH = (i) => { if (seen[i]) return H[i]; seen[i] = 1; const mx = x0 + (i % nx + 0.5) * CELL, my = y0 + (Math.floor(i / nx) + 0.5) * CELL, s = F.S(mx, my); if (!G.ready(s[0], s[1])) return NaN; const h = G.at(s[0], s[1], 0.35); H[i] = h; if (h === h) { const w = G.at(s[0], s[1], 0.8); PEN[i] = w === w ? 0 : 2; } return h; };
  const idx = (mx, my) => Math.floor((my - y0) / CELL) * nx + Math.floor((mx - x0) / CELL);
  const st = idx(a[0], a[1]), en = idx(b[0], b[1]);
  const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), heap = [], hv = [];
  const ex = en % nx, ey = Math.floor(en / nx), hh = (i) => Math.hypot(i % nx - ex, Math.floor(i / nx) - ey);
  const push = (i, f) => { heap.push(i); hv.push(f); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hv[p] <= hv[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hv[p], hv[k]] = [hv[k], hv[p]]; k = p; } };
  const pop = () => { const top = heap[0], lv = hv.pop(), li = heap.pop(); if (heap.length) { heap[0] = li; hv[0] = lv; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hv[l] < hv[m]) m = l; if (r < heap.length && hv[r] < hv[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hv[m], hv[k]] = [hv[k], hv[m]]; k = m; } } return top; };
  // the ends may stand in a blocked cell (a waypoint by a bench): they count as free
  cellH(st); cellH(en); if (!(H[st] === H[st])) { H[st] = W.hAt(...F.S(a[0], a[1])); } if (!(H[en] === H[en])) { H[en] = W.hAt(...F.S(b[0], b[1])); }
  g[st] = 0; push(st, hh(st));
  const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let found = false, it = 0;
  const done = new Uint8Array(N);
  while (heap.length && it++ < 3e7) {
    const c = pop();
    if (done[c]) continue;
    done[c] = 1;
    if (c === en) { found = true; break; }
    const cx = c % nx, cy = Math.floor(c / nx), hc = cellH(c);
    for (const [dx, dy, w] of D8) {
      const qx = cx + dx, qy = cy + dy; if (qx < 0 || qy < 0 || qx >= nx || qy >= ny) continue;
      const q = qy * nx + qx, hq = cellH(q); if (!(hq === hq) || Math.abs(hq - hc) > 0.4) continue;
      if (dx && dy && (!(cellH(cy * nx + qx) === cellH(cy * nx + qx)) || !(cellH(qy * nx + cx) === cellH(qy * nx + cx)))) continue; // (no corner cutting)
      const ng = g[c] + w * (1 + PEN[q]);
      if (ng < g[q]) { g[q] = ng; from[q] = c; push(q, ng + hh(q)); }
    }
  }
  if (!found) {
    let bi = -1, bd = Infinity; for (let i = 0; i < N; i++) if (g[i] < Infinity) { const d = hh(i); if (d < bd) { bd = d; bi = i; } }
    const q = bi >= 0 ? [x0 + (bi % nx + 0.5) * CELL, y0 + (Math.floor(bi / nx) + 0.5) * CELL] : null;
    if (q) { // what the planner saw round there: '.' reached, 'o' free but not reached, 'n' tile not ready, '#' building, '~' water, '|' barrier, 'P' parked, 'x' other
      const ci = bi % nx, cj = Math.floor(bi / nx);
      for (let j = Math.min(ny - 1, cj + 30); j >= Math.max(0, cj - 30); j -= 2) { let line = ''; for (let i = Math.max(0, ci - 40); i <= Math.min(nx - 1, ci + 40); i++) { const c = j * nx + i, mx = x0 + (i + 0.5) * CELL, my = y0 + (j + 0.5) * CELL, sc = F.S(mx, my); if (!G.ready(sc[0], sc[1])) { line += 'n'; continue; } const h = G.at(sc[0], sc[1], 0.35), b = G.bits; line += g[c] < Infinity ? '.' : h === h ? 'o' : b & 1 ? '#' : b & 2 ? '~' : b & 4 ? '|' : b & 64 ? 'P' : 'x'; } console.log(String(my0(j)).padStart(6) + ' ' + line); }
      function my0(j) { return (y0 + (j + 0.5) * CELL).toFixed(0); }
      console.log('x from ' + (x0 + (Math.max(0, ci - 40) + 0.5) * CELL).toFixed(1) + ' by 0.5 m');
    }
    throw new Error('no way from ' + a + ' to ' + b + ' (' + legName + '): nearest reached ' + (q && q.map((v) => v.toFixed(1))) + ', ' + (bd * CELL).toFixed(1) + ' m short');
  }
  const cells = []; for (let c = en; c >= 0; c = from[c]) cells.push(c);
  cells.reverse();
  const pt = (c) => [x0 + (c % nx + 0.5) * CELL, y0 + (Math.floor(c / nx) + 0.5) * CELL];
  // pull straight (with 0.7 m of room: a straight stretch keeps some 0.45 m clear of walls beyond his body, so a player who cuts a
  // corner a little does not meet the wall): from each kept point, the farthest point of the cell path still reachable in a straight, clear line
  const clear = (p, q) => { const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.ceil(L / 0.25); let hp = null; for (let k = 0; k <= n; k++) { const mx = p[0] + ((q[0] - p[0]) * k) / n, my = p[1] + ((q[1] - p[1]) * k) / n, s = F.S(mx, my); const h = G.ready(s[0], s[1]) ? G.at(s[0], s[1], 0.7) : NaN; if (!(h === h) || (hp !== null && Math.abs(h - hp) > 0.4)) return false; hp = h; } return true; };
  const out = [a]; let i = 0;
  while (i < cells.length - 1) { let j = cells.length - 1; while (j > i + 1 && !clear(out[out.length - 1], pt(cells[j]))) j--; out.push(j === cells.length - 1 ? b : pt(cells[j])); i = j; }
  return out;
}
const plan = [];
plan.push({ ...R0.pts[0] });
for (let k = 1; k < R0.pts.length; k++) {
  const A = R0.pts[k - 1], B = R0.pts[k];
  if (B.push) { plan.push({ ...B }); continue; } // (walked straight into what stops him: no path)
  const leg = planLeg(W, A.at, B.at, B.name);
  for (let q = 1; q < leg.length - 1; q++) plan.push({ name: B.name + '.' + q, at: [+leg[q][0].toFixed(2), +leg[q][1].toFixed(2)], r: 1, run: B.run });
  plan.push({ ...B });
}
const route = { ...R0, pts: plan };
if (typeof opt.plan === 'string') fs.writeFileSync(opt.plan, JSON.stringify({ route: R0.name, made: 'scripts/dev-walk-sim.mjs', pts: plan }, null, 0) + '\n');
console.log('path: ' + plan.length + ' points for ' + R0.pts.length + ' waypoints');

// made and taken away twenty times: every geometry he had is disposed each time (the browser tool checks renderer.info as well)
let leak = 0;
for (let k = 0; k < 20; k++) { const w = new walkerM.Walker(), gs = []; w.g.traverse((c) => { if (c.geometry) { gs.push(c.geometry); c.geometry.addEventListener('dispose', () => { c.geometry.__gone = 1; }); } }); w.dispose(); leak += gs.filter((q) => !q.__gone).length; }
const wk = new walkerM.Walker();
const s0 = W.frame.S(route.pts[0].at[0], route.pts[0].at[1]), sp = [0, 0];
if (!walkerM.Walker.spot(W, s0[0], s0[1], 8, sp)) { console.error('nowhere to stand at the start'); process.exit(1); }
// the camera: a bearing in map terms (so a frame change keeps it), aimed from the start along the first leg
const d1 = [route.pts[1].at[0] - route.pts[0].at[0], route.pts[1].at[1] - route.pts[0].at[1]];
let camB = Math.atan2(-d1[0], -d1[1]); // map bearing of the camera FROM him (east = +x, north = +y)
const camAz = () => { const F = W.frame, a = Math.sin(camB), b = Math.cos(camB), sx = a * F.dx + b * F.dy, sz = a * F.dy - b * F.dx; return Math.atan2(sx, sz); };
{ const az = camAz(); wk.place(W, sp[0], sp[1], -Math.sin(az), -Math.cos(az)); }
const self = { x: sp[0], z: sp[1], r: 0.35 };
crowd.blockers = [self];

// ---- the walk
const T = { frames: 0, dist: 0, time: 0, blockedS: 0, shifts: 0, jumpMax: 0, jumpSwap: 0, hErrMax: 0, sink: 0, float: 0, bld: 0, furn: 0, bar: 0, wet: 0, minPed: Infinity, near045: 0, cls: {}, why: {}, legs: [] };
const FEET = [[-0.36, -0.17], [0.36, -0.17], [-0.36, 0.27], [0.36, 0.27]];
let wi = 1, legT = 0, legD = 0, legB = 0, prev = [wk.mx, wk.my], stall = 0, runOn = !!route.pts[1].run, pushT = 0;
const MAXT = +(opt.secs || route.maxT || 400);
const rec = [], stepMs = [];
for (let step = 0; step * DT < MAXT && wi < route.pts.length; step++) {
  const P = route.pts[wi], F = W.frame;
  // the path followed as the browser driver follows it (dev-walk-route.mjs pursue): passed points, and a point 1.5 m ahead on the path
  const pr = pursue(route.pts, wi, wk.mx, wk.my);
  const ex = pr.cx - wk.mx, ey = pr.cy - wk.my;
  // a `push` waypoint lies beyond what must stop him (the water): the leg ends once he has stood blocked for a second and a half
  if (P.push ? pushT > 1.5 : pr.wi > wi) {
    if (P.push) { const s = W.frame.S(wk.mx, wk.my); let d = Infinity; for (let r = 0.05; r < 3 && d === Infinity; r += 0.05) for (let k = 0; k < 16; k++) { const m = W.frame.M(s[0] + Math.sin(k * Math.PI / 8) * r, s[1] + Math.cos(k * Math.PI / 8) * r), c = world.__s_classAt(m[0], m[1]); if (c === C.WATER || c === C.SEA) { d = r; break; } } T.edge = { at: [+wk.mx.toFixed(2), +wk.my.toFixed(2)], waterM: +d.toFixed(2), y: +wk.y.toFixed(2) }; }
    pushT = 0;
    T.legs.push({ to: P.name, t: +legT.toFixed(1), d: +legD.toFixed(1), blockedS: +legB.toFixed(2), what: P.what });
    legT = legD = legB = 0;
    if (P.swap) {
      // the focus shift: another street's frame. Everything carried over keeps its map place (the crowd: rebase; him: rebase)
      const W2 = mkW(SPOTS[P.swap]);
      crowd.rebase(W2); W = W2; wk.rebase(W2); T.shifts++;
      const s = W.frame.S(wk.mx, wk.my); self.x = s[0]; self.z = s[1]; crowd.blockers = [self];
      const p = wk.g.position, m = W.frame.M(p.x, p.z); T.jumpSwap = Math.max(T.jumpSwap, Math.hypot(m[0] - wk.mx, m[1] - wk.my));
    }
    wi++; stall = 0;
    if (wi < route.pts.length) runOn = !!route.pts[wi].run;
    continue;
  }
  // the player: keep the camera behind him (Q/E), hold the eight-way keys nearest the way to go
  const want = Math.atan2(-ex, -ey); // camera bearing that would put the waypoint straight ahead
  let dB = want - camB; dB = Math.atan2(Math.sin(dB), Math.cos(dB));
  if (Math.abs(dB) > 0.06) camB += Math.sign(dB) * Math.min(Math.abs(dB), 1.3 * DT); // (Q / E held while the way is more than 0.06 rad off)
  const az = camAz();
  // the way to go in camera terms: forward = away from the camera, right = screen right
  const s2 = F.S(pr.cx, pr.cy), sh = F.S(wk.mx, wk.my), gx = s2[0] - sh[0], gz = s2[1] - sh[1];
  const fw = gx * -Math.sin(az) + gz * -Math.cos(az), rt = gx * Math.cos(az) + gz * -Math.sin(az);
  const offA = Math.atan2(rt, fw), oct = Math.abs(offA) < 0.4 ? 0 : Math.round(offA / (Math.PI / 4)); // 0 = W, 2 = D, -2 = A, 4 = S (W alone while the camera turns)
  const KX = [0, 1, 1, 1, 0, -1, -1, -1], KY = [1, 1, 0, -1, -1, -1, 0, 1], o8 = ((oct % 8) + 8) % 8;
  let ix = KX[o8], iy = KY[o8];
  const l = Math.hypot(ix, iy); ix /= l; iy /= l;
  // the same order as the stage: the walker steps (before the camera), then the blockers, then the crowd
  const tq = process.hrtime.bigint();
  wk.step(W, DT, ix, iy, az, runOn, crowd, crowd.blockers, self);
  stepMs.push(Number(process.hrtime.bigint() - tq) / 1e6);
  if (step % 60 === 0) { let nw = 0, nb = 0, nc = 0; for (const a of crowd.agents) if (!a.dead) { if (a.kind === 0) nw++; else if (a.kind === 1) nb++; else if (a.kind === 2 && !a.fixed) nc++; } if (nw + nb + nc > (T.crowdMax ? T.crowdMax.walk + T.crowdMax.bike + T.crowdMax.car : -1)) T.crowdMax = { walk: nw, bike: nb, car: nc }; T.circMax = Math.max(T.circMax || 0, wk.nc); }
  const ws = W.frame.S(wk.mx, wk.my); self.x = ws[0]; self.z = ws[1];
  if (opt.debug && step < +opt.debug && step >= +(opt.from || 0) && step % +(opt.every || 5) === 0) console.log('dbg', step, P.name, P.at, 'circ', Array.from(wk.circ.slice(0, wk.nc * 3)).map((v) => +v.toFixed(1)).join(','), 'in', ix.toFixed(2), iy.toFixed(2), 'az', az.toFixed(2), 'speed', wk.speed.toFixed(2), 'v', Math.hypot(wk.vx, wk.vy).toFixed(2), 'blk', wk.blocked, 'stuck', wk.stuck, 'nc', wk.nc, 'hg', wk.hg.toFixed(2), 'm', wk.mx.toFixed(3), wk.my.toFixed(3), 'sub', T.frames);
  crowd.update(DT, ws[0], ws[1], 20);
  feed(wk.mx, wk.my); around(wk.mx, wk.my, 2, build);
  // ---- the record
  const mv = Math.hypot(wk.mx - prev[0], wk.my - prev[1]);
  T.jumpMax = Math.max(T.jumpMax, mv); T.dist += mv; legD += mv; prev = [wk.mx, wk.my];
  T.frames++; T.time += DT; legT += DT;
  if (wk.blocked && wk.speed < 0.5) { T.blockedS += DT; legB += DT; }
  pushT = P.push && wk.blocked && wk.speed < 0.3 ? pushT + DT : 0;
  stall = mv < 0.002 && !P.push ? stall + DT : 0;
  // a planned point between two waypoints that he cannot reach (something stands there now that did not when it was planned): after
  // 3 s of standing blocked he heads for the next one, as a player steps round
  if (/\.\d+$/.test(P.name) && legB > 3) { T.legs.push({ to: P.name, t: +legT.toFixed(1), d: +legD.toFixed(1), blockedS: +legB.toFixed(2), skipped: true }); T.skipped = (T.skipped || 0) + 1; legT = legD = legB = 0; wi++; stall = 0; continue; }
  if (legT > 40 + pr.rem && !P.push) stall = 99; // (no progress: a leg may take its straight length in seconds plus 40)
  if (P.push && legT > 20) stall = 99;
  if (stall > 8) { T.legs.push({ to: P.name, t: +legT.toFixed(1), stuck: true, at: [+wk.mx.toFixed(1), +wk.my.toFixed(1)] }); console.log('stuck before ' + P.name + ' at ' + wk.mx.toFixed(1) + ',' + wk.my.toFixed(1)); break; }
  const cname = CLS[wk.cls] || String(wk.cls);
  T.cls[cname] = (T.cls[cname] || 0) + DT;
  // feet: through his drawn matrix (as dev-count), against W.hAt
  wk.g.updateMatrixWorld(true);
  const e = wk.g.matrixWorld.elements, x = e[12], y = e[13], z = e[14];
  // (a shoe corner over ground higher than his footprint's by more than his step limit is over a ledge he was stopped beside: left out)
  const lim = W.ground.at(x, z, 0.25, 0, 127) + 0.45;
  let hi = W.hAt(x, z);
  for (const [lx, lz] of FEET) { const px = e[0] * lx + e[8] * lz + x, pz = e[2] * lx + e[10] * lz + z, h = W.hAt(px, pz); if (h > hi && h <= lim) hi = h; }
  if (hi - y > 0.15) T.sink++;
  if (y - hi > 0.15) T.float++;
  T.hErrMax = Math.max(T.hErrMax, Math.abs(y - hi)); T.under = Math.max(T.under ?? -Infinity, hi - y); T.over = Math.max(T.over ?? -Infinity, y - hi);
  const mm = W.frame.M(x, z);
  const b = inBuilding(mm[0], mm[1]); if (b) { T.bld++; T.why['bld.' + b] = (T.why['bld.' + b] || 0) + 1; }
  const wc = world.__s_classAt(mm[0], mm[1]); if (wc === C.WATER || wc === C.SEA) T.wet++;
  for (const f of FURN) { if (Math.abs(f.x - mm[0]) > 3 || Math.abs(f.y - mm[1]) > 3) continue; if (Math.hypot(f.x - mm[0], f.y - mm[1]) < f.r / 2) { T.furn++; T.why['furn.' + f.kind] = (T.why['furn.' + f.kind] || 0) + 1; } }
  for (const o of crowd.owners.values()) {
    if (!o.on) continue;
    for (let i = 0; i + 3 < o.parked.length; i += 4) { const dx = x - o.parked[i], dz = z - o.parked[i + 1]; if (Math.abs(dx) > 3 || Math.abs(dz) > 3) continue; const fx = Math.sin(o.parked[i + 2]), fz = Math.cos(o.parked[i + 2]); if (Math.abs(dx * fx + dz * fz) < 2.05 && Math.abs(dx * fz - dz * fx) < 0.775) { T.furn++; T.why['furn.parkedCar'] = (T.why['furn.parkedCar'] || 0) + 1; } }
    for (let i = 0; i + 3 < o.lamps.length; i += 4) if (Math.hypot(x - o.lamps[i], z - o.lamps[i + 1]) < ([0.2, 0.35, 0.15, 0.2][o.lamps[i + 3]] ?? 0.2)) { T.furn++; T.why['furn.lamp'] = (T.why['furn.lamp'] || 0) + 1; }
  }
  if (W.treeNear(x, z, 0.35)) { T.furn++; T.why['furn.tree'] = (T.why['furn.tree'] || 0) + 1; }
  for (const [ax, ay, bx, by, th] of BARS) { if (Math.abs(ax - mm[0]) > 40 && Math.abs(bx - mm[0]) > 40) continue; const ux = bx - ax, uy = by - ay, L2 = ux * ux + uy * uy || 1e-9, u = Math.max(0, Math.min(1, ((mm[0] - ax) * ux + (mm[1] - ay) * uy) / L2)); if (Math.hypot(ax + ux * u - mm[0], ay + uy * u - mm[1]) < th / 2 + 0.15) { T.bar++; break; } }
  let md = Infinity;
  for (const a of crowd.agents) if (!a.dead && a.vis && a.kind === 0) { const d = Math.hypot(a.x - x, a.z - z); if (d < md) md = d; }
  T.minPed = Math.min(T.minPed, md); if (md < 0.45) T.near045++;
  if (step % 6 === 0) rec.push([+wk.mx.toFixed(2), +wk.my.toFixed(2), +wk.heading.toFixed(3), +(y - hi).toFixed(3), wk.blocked ? 1 : 0, wk.cls, +md.toFixed(2)]);
}
const done = wi >= route.pts.length;
const row = {
  stepMs: (() => { const q = stepMs.slice().sort((a, b) => a - b); return { mean: +(q.reduce((a, b) => a + b, 0) / q.length).toFixed(4), p99: +q[Math.floor(q.length * 0.99)].toFixed(4), max: +q[q.length - 1].toFixed(3) }; })(), skippedPoints: T.skipped || 0, crowdAtMost: T.crowdMax, obstaclesAtMost: T.circMax, movedWhenStuck: wk.moves,
  route: route.name, reached: done ? 'all' : route.pts[wi].name, distM: +T.dist.toFixed(1), timeS: +T.time.toFixed(1), blockedS: +T.blockedS.toFixed(2), focusShifts: T.shifts,
  maxStepM: +T.jumpMax.toFixed(3), swapJumpM: +T.jumpSwap.toFixed(4), maxHeightErrM: +T.hErrMax.toFixed(3), maxUnderM: +T.under.toFixed(3), maxOverM: +T.over.toFixed(3), sink: T.sink, float: T.float,
  inBuilding: T.bld, inFurniture: T.furn, inBarrier: T.bar, inWater: T.wet, nearestWalkerM: +T.minPed.toFixed(2), framesWalkerUnder045: T.near045, canalEdge: T.edge || null, leakedGeometries: leak,
};
console.log('leg                         time s  dist m  blocked s  tests');
// (the planned points between two waypoints of the route count towards the waypoint they lead to)
const LEGS = []; for (const L of T.legs) { const base = String(L.to).replace(/\.\d+$/, ''), last = LEGS[LEGS.length - 1]; if (last && last.to === base && !last.closed) { last.t = +(last.t + (L.t || 0)).toFixed(1); last.d = +(last.d + (L.d || 0)).toFixed(1); last.blockedS = +(last.blockedS + (L.blockedS || 0)).toFixed(2); if (L.stuck) Object.assign(last, { stuck: true, at: L.at }); if (base === L.to) { last.what = L.what; last.closed = true; } } else LEGS.push({ to: base, t: L.t || 0, d: L.d || 0, blockedS: L.blockedS || 0, what: L.what, stuck: L.stuck, at: L.at, closed: base === L.to }); }
for (const L of LEGS) console.log(`${String(L.to).padEnd(28)} ${String(L.t).padStart(6)} ${String(L.d ?? '-').padStart(7)} ${String(L.blockedS ?? '-').padStart(9)}  ${L.stuck ? 'STUCK at ' + L.at : L.what || ''}`);
console.log(JSON.stringify(row));
console.log('ground (s): ' + JSON.stringify(Object.fromEntries(Object.entries(T.cls).map(([k, v]) => [k, +v.toFixed(1)]))) + (Object.keys(T.why).length ? '  hits: ' + JSON.stringify(T.why) : ''));
const pass = done && UNIT_OK && !leak && T.under <= 0.01 && T.over <= 0.05 && !T.bld && !T.furn && !T.bar && !T.wet && !T.sink && !T.float && T.jumpSwap < 0.01;
console.log(pass ? 'WALK PASS' : 'WALK FAIL');
if (typeof opt.json === 'string') fs.writeFileSync(opt.json, JSON.stringify({ row, legs: T.legs, cls: T.cls, why: T.why, rec }, null, 0));
process.exit(pass ? 0 : 1);
