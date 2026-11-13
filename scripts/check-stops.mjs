// check-stops.mjs: counts how bus and tram stop shelters (and, with --other, other directed street furniture) sit in the
// procedural city. A dev tool, read only: it counts, it does not gate (exit code 0 unless it cannot run).
//
// WHAT IT CHECKS
//  Two kinds of stop shelter, both measured at their real drawn place, heading and footprint:
//   feature  tile `f` type 10, drawn by landmarks.js `shelter` through drawFeature at the place and heading world.js
//            shelterPlaces gives it (the tile data has a = 0 for every shelter: no heading of its own; older code drew it at
//            the map node with rot = PI/2 - a). Footprint: the roof, 4.2 x 1.8 m, long axis = local x, open side = local +z
//            (back glass at z -0.7). One the drawer leaves out is not measured (its old drawing into a throwaway builder,
//            `dry`, is not counted); their number is printed.
//   furnish  shelters placed by furnish.js from the kind-9 points of interest (`stand('stop', ...)`, drawn with
//            props.js `tramStop`). Footprint: the roof, 3.4 x 1.2 m, long axis = local x, open side = local +z (back glass
//            at z -0.55). Placed with local +z towards the street it snapped to. A stop that keeps its room but is not drawn
//            (the map has a shelter there, or it found no place) calls no `aim` and is not measured; their number is printed.
//  For each shelter:
//   angle    smallest angle (0..90 deg) between its long axis and the nearest street centre line or rail (tile `r` classes
//            1-9 and 13, and `l`, tunnels left out, within 25 m, neighbour tiles included). If there is none, a footpath/cycleway/track
//            (classes 10-12) within 25 m is used and marked kind 'path'.
//   facing   the open side faces that line (open-side normal . direction to the nearest point on the line > 0).
//   ground   share of footprint samples (0.25 m step) on each ground class of the tile's own class grid, as buildTile paints it
//            (0.5 m cells, after paintBase + paintTop): pave (WALK, PLAZA, PED, FOOT, CURB), land (class 0, plain ground),
//            carriage (ASPHALT, KLINKER, SERVICE, MARK, BIKELANE), cycle (CYCLE), rail (RAILBED, RAIL), water (WATER, SEA),
//            building, other. There is no platform class in the grid: a platform is whatever the tile paints there
//            (usually WALK/PLAZA).
//            GROUND RULE: walkable = pave + land. The grid paints only 1.8 m of WALK beyond a kerb (paintBase: the road
//            stroked r.w + 4.4 wide, over LAND/PLAZA/PARKING only), and the plain urban ground beyond it is LAND, which
//            furnish.js also treats as pavement (GOOD). A 1.8 m deep roof set back from the kerb therefore reaches LAND
//            behind the WALK strip even where the pavement is real. The old rule (pave only) is printed alongside.
//   kerb     gap in metres from the footprint to the nearest carriageway cell (cell centre minus half a cell, never below 0),
//            and `railGap` the same to the nearest RAILBED/RAIL cell. KERB RULE: the nearer of the two counts (a tram
//            platform stands beside the rail bed, a bus shelter beside the carriageway); the old rule (carriageway only,
//            so every platform beside a track was "far") is printed alongside.
//   overlaps building ring (tile `b`), barrier (`x`, with its thickness), carriageway / cycle lane / rail bed / water cells
//            (share >= OVERLAP_SHARE of the samples), tree trunk (the drawn trees of buildTile), another shelter (centre
//            within 4.6 m = furnish's own crowding rule; pairs within 15 m are counted too), other furniture (the
//            `stand` list of furnish.js, centre within PROP_HALF of the footprint, or within the piece's own half size
//            KIND_HALF for the bigger kinds: a terrace table, a kiosk with its tables, a row of bollards), a street lamp
//            (the posts of world.js lampsOf, as buildTile returns them, within LAMP_R).
//  A shelter has a PROBLEM when: angle > MAX_ANGLE; not facing; walkable share < MIN_PAVE; kerb > KERB_MAX or < KERB_MIN; no
//  line within reach; or any overlap. Each kind of problem is counted separately. The nearest line comes from this tile and
//  its eight neighbours, while the code places a shelter from its own tile only: near a tile edge the two can disagree.
//  Worst-twenty score (higher = worse): 100 building + 100 carriageway + 80 water + 60 rail + 50 barrier + 40 cycle lane
//  + 20 each tree / double / furniture + 10 not facing + 10 no line + angle/9 (0..10) + 10 x (1 - pave share)
//  + 2 x min(kerb excess, 5 m), where overlaps count 1 when present.
//  --other (angle and facing are measured against the street the piece was placed along, recorded from furnish's own scan; nearest line where it has none): (ground: LAND counts as pavement there, as furnish.js GOOD does) the same measurements for benches (street 'bench', park 'pbench'), bike racks, traffic lights, street-name signs,
//  market/street stalls, taken from the recorded `stand` calls (furnish.js) with the heading actually drawn. What "correct"
//  means per kind is in OTHER_RULES below (printed with the result).
//
// HOW IT RUNS (no browser, nothing under src/ is edited)
//  It copies --src to a temp directory under the system temp dir, patches the COPY (production flags, hooks: the type-10
//  case of drawFeature, furnish's `aim`, `stand`, `scan` and stop loop; every patch must match or the tool stops, except the
//  one for a step older code does not have), imports buildTile
//  from the copy, builds each tile at lod 0 by day, measures what the hooks and the returned grid/roads/rails/trees saw,
//  and deletes the copy at the end. Without --other only tiles that have a type-10 feature or a kind-9 point are built.
//
// USAGE  node scripts/check-stops.mjs [--src <srcDir>] [--repo <repoDir>] [--out <file.json>] [--tiles key,key] [--other] [--quiet] [--strict]
//  --src   code to check (default: the src next to this script). --repo: where public/data and node_modules are (default: the
//  script's own repo). --out: JSON with totals, histograms, the worst twenty and every shelter. --quiet: no progress on stderr.
//  --strict: the old ground and kerb rules are the main ones. All 3,180 tiles take about two to four minutes.
//  Example: node scripts/check-stops.mjs --out /tmp/stops.json --other > /tmp/stops.txt
//
// HOW TO READ THE OUTPUT
//  Positions: tile-local (x east, z south from the tile's NW corner, metres) and MAP metres: map x = tx*256 + x,
//  map y = ty*256 + (256 - z) (world.js buildTile `mt`, placeTile). heading = compass bearing of the open side (0 = north,
//  90 = east). `Problems` counts shelters per kind of problem (a shelter can have several); `clean` has none; the line
//  "under the old rule" gives the same counts with pavement = pave only and kerb = carriageway only.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

// ------------------------------------------------------------------ thresholds
const MAX_ANGLE = 15;       // degrees between long axis and the line
const MIN_PAVE = 0.8;       // share of the footprint on pavement / platform
const KERB_MAX = 3.5;       // metres from footprint to carriageway
const KERB_MIN = 0.2;
const OVERLAP_SHARE = 0.05; // share of samples on a surface before it counts as an overlap
const REACH = 25;           // metres to look for a street or track
const DOUBLE_R = 4.6;       // furnish's crowding rule: stop (2.2) + feature shelter (2.4)
const NEAR_R = 15;
const PROP_HALF = 0.6;      // half footprint assumed for another prop standing near a shelter
// half sizes (m) of the pieces bigger than that (furnish.js HIDE_HALF for those it can hide; the others from their drawers)
const KIND_HALF = { bench: 1.05, box: 0.7, rack: 1.3, orac: 0.75, planter: 1.3, bigrack: 1.7, pbench: 1.05, trolleys: 1.7, flags: 1.8, stall: 1.4,
  kiosk: 4.6, yard: 2, terrace: 1.3, terr: 0.6, picnic: 2.4, parasol: 1.4, bollards: 4, mstall: 1.6, pole: 0.3 };
const LAMP_R = 0.35;
const TREE_R = 0.35;
const STEP = 0.25;          // sampling step over a footprint
const BARRIER_T = { 1: 0.3, 2: 0.08, 3: 0.8, 4: 0.6 }; // thickness as drawn (landmarks.js drawBarriers)
const TILE = 256;
const realNow = Date.now.bind(Date); // (the stubs freeze Date.now)

// ground classes (world.js C)
const K = { LAND: 0, WATER: 1, SEA: 10, PLAZA: 8, ASPHALT: 20, KLINKER: 21, SERVICE: 22, CYCLE: 23, FOOT: 24, PED: 25, RAILBED: 27, RAIL: 28, WALK: 30, CURB: 31, MARK: 32, BIKELANE: 34, BUILDING: 40 };
const mk = (...c) => { const t = new Uint8Array(256); for (const k of c) t[k] = 1; return t; };
const PAVE = mk(K.WALK, K.PLAZA, K.PED, K.FOOT, K.CURB), CARRIAGE = mk(K.ASPHALT, K.KLINKER, K.SERVICE, K.MARK, K.BIKELANE),
  CYCLE = mk(K.CYCLE), RAILC = mk(K.RAILBED, K.RAIL), WATERC = mk(K.WATER, K.SEA);
const KERB_CELLS = mk(K.ASPHALT, K.KLINKER, K.SERVICE, K.MARK, K.BIKELANE);

// footprints: half length (local x), half depth (local z), centre offset in local z. The open/front side is local +z.
const FOOT = {
  feature: { hx: 2.1, hz: 0.9, cz: 0 },   // landmarks.js shelter(): roof 4.2 x 1.8
  furnish: { hx: 1.7, hz: 0.6, cz: 0 },   // props.js tramStop(): roof 3.4 x 1.2
  bench: { hx: 1.05, hz: 0.3, cz: 0 },    // furnish.js benchV: up to 2.1 x 0.5
  pbench: { hx: 1.05, hz: 0.3, cz: 0 },
  rack: { hx: 1.25, hz: 0.9, cz: 0.2 },   // props.js bikeRack n=4: posts at z -0.6, bikes to z +1.1
  rackpark: { hx: 1.7, hz: 1.6, cz: 0.05 }, // station: two racks of five, z -0.9 and +1.0
  tlight: { hx: 0.15, hz: 0.15, cz: 0 },  // the post
  sign: { hx: 0.25, hz: 0.15, cz: 0.05 }, // props.js streetSign: the post (the board hangs overhead)
  stall: { hx: 1.35, hz: 1.0, cz: 0 },    // props.js stall: 2.7 x 1.4 roof, awning to z +0.95
  mstall: { hx: 1.4, hz: 1.0, cz: 0 },    // approximate (market stalls vary in width)
};
// what "correct" means per kind: expect = wanted angle of the long axis to the street (0 along, 90 across, null = no rule),
// front = the front side should face the street, pave = should stand on pavement.
const OTHER_RULES = {
  bench: { expect: 0, front: true, pave: true, note: 'back to the houses, seat facing the street, along it' },
  pbench: { expect: 0, front: true, pave: false, paths: true, note: 'park bench beside a footpath (nearest line may be that path), seat facing it, on grass is fine' },
  rack: { expect: 0, front: null, pave: true, note: 'street rack, row along the street; bikes stand across it, so no front' },
  rackpark: { expect: null, front: null, pave: true, note: 'station bike park: turned to a multiple of 90 deg by design, no street rule' },
  tlight: { expect: 90, front: null, pave: true, note: 'drawn looking along the street (traffic from the junction): long axis ACROSS the street, 90 expected' },
  sign: { expect: 0, front: true, pave: true, note: 'street-name board, face towards the street, along it; the footprint is the post' },
  stall: { expect: 0, front: true, pave: false, note: 'herring/chips stall, front towards the street; may stand on sand' },
  mstall: { expect: null, front: null, pave: false, note: 'market place layout (grid of the market), no street rule; counted for overlaps only' },
};

// ------------------------------------------------------------------ arguments
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const flag = (n) => args.includes('--' + n);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(opt('repo') || path.join(here, '..'));
const srcDir = path.resolve(opt('src') || path.join(repo, 'src'));
const outFile = opt('out'), quiet = flag('quiet'), OTHER = flag('other'), STRICT = flag('strict');
const only = opt('tiles') ? opt('tiles').split(',').map((s) => s.trim()).filter(Boolean) : null;
const log = (...a) => { if (!quiet) process.stderr.write(a.join(' ') + '\n'); };
const tilesDir = path.join(repo, 'public', 'data', 'world', 'tiles');
const dataDir = path.join(repo, 'public', 'data');
const modules = path.join(repo, 'node_modules');
if (!fs.existsSync(tilesDir) || !fs.existsSync(modules) || !fs.existsSync(srcDir)) { console.error('cannot run: need ' + tilesDir + ', ' + modules + ' and ' + srcDir); process.exit(2); }

// ------------------------------------------------------------------ a patched copy of src
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'check-stops-'));
const cleanup = () => { try { fs.rmSync(work, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sg of ['SIGINT', 'SIGTERM']) process.on(sg, () => { cleanup(); process.exit(130); });

function listJs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listJs(p, out); else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
function prepare() {
  const sw = path.join(work, 'src');
  fs.cpSync(srcDir, sw, { recursive: true });
  fs.symlinkSync(modules, path.join(work, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(work, 'package.json'), '{"name":"check-stops-work","type":"module","private":true}\n');
  for (const f of listJs(sw)) {
    let s = fs.readFileSync(f, 'utf8');
    const o = s;
    s = s.replace(/import\.meta\.env\s*&&\s*import\.meta\.env\.DEV/g, 'false').replace(/import\.meta\.env\.DEV/g, 'false').replace(/import\.meta\.env\.PROD/g, 'true').replace(/import\.meta\.env/g, '({})')
      .replace(/^\s*import\s+['"][^'"]+\.css['"];?\s*$/gm, '')
      .replace(/(import\s+[\w{}*,\s]+\s+from\s+['"][^'"]+\.json['"])(\s*;)/g, "$1 with { type: 'json' }$2");
    if (s !== o) fs.writeFileSync(f, s);
  }
  const must = (file, find, repl, label, optional = false) => {
    const f = path.join(sw, file);
    let s = fs.readFileSync(f, 'utf8');
    const i = s.indexOf(find);
    if (i < 0 && optional) return;
    if (i < 0) throw new Error(`patch "${label}" did not match in src/${file}: this checkout's code changed shape; update check-stops.mjs`);
    s = s.slice(0, i) + repl + s.slice(i + find.length);
    fs.writeFileSync(f, s);
  };
  // the type-10 case of drawFeature: record the shelter as drawn (position, builder rotation, a)
  must('voxel/landmarks.js', 'case 10: tag(3.5, 1); shelter(v, gl, night); break;',
    'case 10: tag(3.5, 1); { const h = globalThis.__chk; if (h && !v.dry) h.feat.push({ x: f.x, z: f.z, rot: f.rot || 0, a: f.a }); } shelter(v, gl, night); break;', 'drawFeature type 10');
  // furnish: remember the heading of the last aim, attach it to the next stand
  must('voxel/furnish.js', 'const aim = (th, x, z) => { ', 'const aim = (th, x, z) => { if (globalThis.__chk) globalThis.__chk.aimed = { th, x, z }; ', 'furnish aim');
  // (a piece hidden under a map shelter's roof keeps its room but is not drawn: recorded with hid, and not measured)
  const rec = (hid) => `const h = globalThis.__chk; if (h) { const a = h.aimed; h.stands.push({ kind, x, z, r, hid: ${hid}, th: a && (Math.hypot(a.x - x, a.z - z) < 2.5 || (kind === "stop" && Math.hypot(a.x - x, a.z - z) < 30)) ? a.th : null, ax: a ? a.x : null, az: a ? a.z : null, road: kind === "stop" ? h.stopRoad : undefined, own: h.scanned }); h.aimed = null; h.scanned = null; }`;
  const STAND_NEW = 'const stand = (kind, x, z, r) => { const hid = hideIf(kind, x, z); return taken.push(hid ? { kind, x, z, r, hid } : { kind, x, z, r }); };';
  if (fs.readFileSync(path.join(sw, 'voxel/furnish.js'), 'utf8').includes(STAND_NEW))
    must('voxel/furnish.js', STAND_NEW, 'const stand = (kind, x, z, r) => { const hid = hideIf(kind, x, z); ' + rec('hid') + ' return taken.push(hid ? { kind, x, z, r, hid } : { kind, x, z, r }); };', 'furnish stand');
  else must('voxel/furnish.js', 'const stand = (kind, x, z, r) => taken.push({ kind, x, z, r });', 'const stand = (kind, x, z, r) => { ' + rec('false') + ' taken.push({ kind, x, z, r }); };', 'furnish stand (older code)');
  // the street a stop snapped to (nearestRoad in the kind-9 loop): class, distance, tangent
  must('voxel/furnish.js', 'const f = frameAt(q.pl, q.s), vv =', 'const f = frameAt(q.pl, q.s), __r = (globalThis.__chk && (globalThis.__chk.stopRoad = { cls: q.pl.cls, name: q.pl.name, d: q.d, tx: f.tx, tz: f.tz })), vv =', 'furnish stop road');
  // a stop put beside its own line instead (a track, a busway, the main road at a corner): that line is the one it snapped to
  must('voxel/furnish.js', '      at = alt;', '      at = alt; if (globalThis.__chk) globalThis.__chk.stopRoad = { cls: own.L.pl.cls, name: own.L.pl.name, d: own.d, tx: alt.f.tx, tz: alt.f.tz };', 'furnish stop own line', true); // (older code has no such step)
  // the street each piece of furniture was placed along: the last scan() before its stand() (class and the centre-line frame there)
  must('voxel/furnish.js', 'const scan = (pi, side, s) => {', 'const scan = (pi, side, s) => { const __r = scan0(pi, side, s); if (globalThis.__chk) globalThis.__chk.scanned = { cls: pieces[pi].cls, x: __r.f.x, z: __r.f.z, tx: __r.f.tx, tz: __r.f.tz }; return __r; };\n  const scan0 = (pi, side, s) => {', 'furnish scan');
  // buildTile and loadCity are not exported: alias exports on the copy
  const w = path.join(sw, 'voxel/world.js');
  const ws = fs.readFileSync(w, 'utf8');
  if (!/^(?:export\s+)?function\s+buildTile\b/m.test(ws) || !/^(?:export\s+)?(?:async\s+)?function\s+loadCity\b/m.test(ws)) throw new Error('buildTile / loadCity not found in src/voxel/world.js');
  fs.writeFileSync(w, ws + '\nexport { buildTile as __c_buildTile, loadCity as __c_loadCity };\n');
  return sw;
}

// ------------------------------------------------------------------ browser stubs (frozen clock, canvas, Image via pngjs, fetch)
function installStubs() {
  const { PNG } = createRequire(path.join(modules, 'x.js'))('pngjs');
  const FIXED = Date.UTC(2026, 5, 15, 12, 0, 0);
  let s = 12345;
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  Date.now = () => FIXED;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => 0, mark() {}, measure() {}, timeOrigin: FIXED }, configurable: true, writable: true });
  const imgOf = new WeakMap();
  const makeCanvas = () => {
    const c = { width: 300, height: 150, style: {}, getContext() { return (c.__ctx ||= ctx(c)); }, toDataURL() { return 'data:,'; }, addEventListener() {}, remove() {} };
    return c;
  };
  const ctx = (canvas) => {
    const base = {
      canvas, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textBaseline: 'alphabetic', textAlign: 'start', imageSmoothingEnabled: true, globalAlpha: 1,
      measureText: (t) => ({ width: String(t).length * 16 }),
      drawImage(img, ...a) { imgOf.set(canvas, { img, a }); },
      getImageData(x, y, w, h) {
        const src = imgOf.get(canvas);
        if (!src) return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        const P = src.img._png, [, , dw, dh] = src.a.length >= 4 ? src.a : [0, 0, P.width, P.height];
        const out = new Uint8ClampedArray(w * h * 4);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const sx = Math.min(P.width - 1, Math.floor(((i + 0.5) * P.width) / dw)), sy = Math.min(P.height - 1, Math.floor(((j + 0.5) * P.height) / dh));
          const a = (sy * P.width + sx) * 4, o = (j * w + i) * 4;
          out[o] = P.data[a]; out[o + 1] = P.data[a + 1]; out[o + 2] = P.data[a + 2]; out[o + 3] = P.data[a + 3];
        }
        return { width: w, height: h, data: out };
      },
    };
    return new Proxy(base, { get(t, k) { if (k in t) return t[k]; if (typeof k === 'symbol' || k === 'then') return undefined; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
  };
  const node = (tag) => (tag === 'canvas' ? makeCanvas() : { tagName: String(tag).toUpperCase(), style: {}, children: [], appendChild() {}, remove() {}, addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {} } });
  globalThis.document = { createElement: node, hidden: false, body: node('body'), documentElement: node('html'), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.Image = class {
    set src(u) { this._src = u; }
    get src() { return this._src; }
    async decode() {
      this._png = PNG.sync.read(fs.readFileSync(path.join(dataDir, String(this._src).replace(/^\.?\/?data\//, ''))));
      this.naturalWidth = this.width = this._png.width; this.naturalHeight = this.height = this._png.height;
    }
  };
  globalThis.fetch = async (u) => {
    const p = path.join(dataDir, String(u).replace(/^\.?\/?data\//, ''));
    if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => null };
    const txt = fs.readFileSync(p, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(txt), text: async () => txt };
  };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: globalThis.matchMedia, location: { search: '', href: 'http://localhost/' } };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.location = globalThis.window.location;
  for (const k of ['error', 'warn']) console[k] = (...a) => { diag.count++; if (diag.first.length < 8) diag.first.push(k + ': ' + a.map((x) => (x && x.message) || String(x)).join(' ').slice(0, 160)); };
}
const diag = { count: 0, first: [] };

// ------------------------------------------------------------------ geometry
const deg = (r) => (r * 180) / Math.PI;
function rectOf(x, z, th, f) {
  const c = Math.cos(th), s = Math.sin(th);
  return { x, z, c, s, hx: f.hx, hz: f.hz, cz: f.cz, ux: c, uz: -s, wx: s, wz: c, mx: x + s * f.cz, mz: z + c * f.cz };
}
const toLocal = (r, px, pz) => [(px - r.x) * r.c - (pz - r.z) * r.s, (px - r.x) * r.s + (pz - r.z) * r.c];
function rectDist(r, px, pz) {
  const [lx, lz] = toLocal(r, px, pz);
  return Math.hypot(Math.max(Math.abs(lx) - r.hx, 0), Math.max(Math.abs(lz - r.cz) - r.hz, 0));
}
function samples(r) {
  const out = [], nx = Math.max(1, Math.round((2 * r.hx) / STEP)), nz = Math.max(1, Math.round((2 * r.hz) / STEP));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const lx = -r.hx + ((i + 0.5) * 2 * r.hx) / nx, lz = r.cz - r.hz + ((j + 0.5) * 2 * r.hz) / nz;
    out.push(r.x + lx * r.c + lz * r.s, r.z - lx * r.s + lz * r.c);
  }
  return out;
}
function inRingXZ(x, z, ring) {
  let inside = false;
  for (let i = 0, n = ring.length / 2, k = n - 1; i < n; k = i++) {
    const xi = ring[i * 2], zi = ring[i * 2 + 1], xk = ring[k * 2], zk = ring[k * 2 + 1];
    if ((zi > z) !== (zk > z) && x < ((xk - xi) * (z - zi)) / (zk - zi) + xi) inside = !inside;
  }
  return inside;
}
const segPoint = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return [ax + dx * t, az + dz * t, dx, dz];
};

/** nearest line among `lines` (each { a: flat xz array, kind, cls }) to (px, pz) within REACH. */
function nearest(lines, px, pz, kinds) {
  let best = null;
  for (const L of lines) {
    if (!kinds.includes(L.kind)) continue;
    const a = L.a;
    for (let i = 0; i + 3 < a.length; i += 2) {
      const ax = a[i], az = a[i + 1], bx = a[i + 2], bz = a[i + 3];
      if (Math.min(ax, bx) - REACH > px || Math.max(ax, bx) + REACH < px || Math.min(az, bz) - REACH > pz || Math.max(az, bz) + REACH < pz) continue;
      const [qx, qz, dx, dz] = segPoint(px, pz, ax, az, bx, bz), d = Math.hypot(qx - px, qz - pz);
      if (d <= REACH && (!best || d < best.d)) best = { d, qx, qz, tx: dx, tz: dz, kind: L.kind, cls: L.cls };
    }
  }
  return best;
}

// ------------------------------------------------------------------ tiles and neighbours
const tileCache = new Map();
function readTile(key) {
  if (tileCache.has(key)) return tileCache.get(key);
  const p = path.join(tilesDir, key + '.json');
  const t = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  tileCache.set(key, t);
  if (tileCache.size > 40) tileCache.delete(tileCache.keys().next().value);
  return t;
}
function linesOfTile(t, dx, dy) { // a tile's lines in the coordinates of the tile next to it (dx, dy = neighbour offset in tiles; map y grows north)
  const out = [], ox = dx * TILE, oz = -dy * TILE;
  const loc = (e, from) => { const a = []; for (let i = from; i + 1 < e.length; i += 2) a.push(e[i] / 10 + ox, TILE - e[i + 1] / 10 + oz); return a; };
  for (const e of t.r || []) {
    if (e[3] & 4 || e[0] === 20) continue;
    out.push({ a: loc(e, 4), kind: e[0] <= 9 || e[0] === 13 ? 'road' : 'path', cls: e[0] });
  }
  for (const e of t.l || []) if (!(e[1] & 4)) out.push({ a: loc(e, 2), kind: 'rail', cls: 100 + e[0] });
  return out;
}
const SEARCH = 26;
function linesAround(key, t, near) {
  const lines = linesOfTile(t, 0, 0);
  if (!near) return lines;
  const [tx, ty] = key.split('_').map(Number);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (!dx && !dy) continue;
    const nt = readTile(`${tx + dx}_${ty + dy}`);
    if (!nt) continue;
    for (const L of linesOfTile(nt, dx, dy)) {
      let hit = false;
      for (let i = 0; i + 1 < L.a.length; i += 2) if (L.a[i] > -SEARCH && L.a[i] < TILE + SEARCH && L.a[i + 1] > -SEARCH && L.a[i + 1] < TILE + SEARCH) { hit = true; break; }
      if (hit) lines.push(L);
    }
  }
  return lines;
}

// ------------------------------------------------------------------ measuring one thing
/** ctx: { c (buildTile result), t (tile json), lines, rings, bars, stands } */
function measure(ctx, item) {
  const { c } = ctx, grid = c.grid, r = rectOf(item.x, item.z, item.th, item.foot);
  const pts = samples(r), n = pts.length / 2;
  const sh = { pave: 0, land: 0, carriage: 0, cycle: 0, rail: 0, water: 0, building: 0, other: 0, outside: 0 };
  for (let i = 0; i < pts.length; i += 2) {
    const k = grid.get(pts[i], pts[i + 1]);
    if (k === 255) sh.outside++;
    else if (PAVE[k]) sh.pave++;
    else if (k === K.LAND) sh.land++;
    else if (CARRIAGE[k]) sh.carriage++;
    else if (CYCLE[k]) sh.cycle++;
    else if (RAILC[k]) sh.rail++;
    else if (WATERC[k]) sh.water++;
    else if (k === K.BUILDING) sh.building++;
    else sh.other++;
  }
  const inside = n - sh.outside;
  for (const k of Object.keys(sh)) sh[k] = k === 'outside' ? +(sh[k] / n).toFixed(3) : inside ? +(sh[k] / inside).toFixed(3) : 0;
  // nearest line
  const rule = item.rule || {};
  const kinds = rule.paths ? ['road', 'rail', 'path'] : ['road', 'rail'];
  let ln = nearest(ctx.lines, r.x, r.z, kinds);
  if (!ln) ln = nearest(ctx.lines, r.x, r.z, ['path']);
  if (item.own && item.useOwn) { // furniture: measure against the street it was placed along (its last scan), not whatever is nearest at a junction
    const o = item.own;
    ln = { d: Math.abs((r.x - o.x) * -o.tz + (r.z - o.z) * o.tx), qx: o.x, qz: o.z, tx: o.tx, tz: o.tz, kind: 'own', cls: o.cls };
  }
  const road = nearest(ctx.lines, r.x, r.z, ['road']), rail = nearest(ctx.lines, r.x, r.z, ['rail']);
  let angle = null, facing = null, line = null;
  if (ln) {
    const tl = Math.hypot(ln.tx, ln.tz) || 1, tx = ln.tx / tl, tz = ln.tz / tl;
    angle = +deg(Math.acos(Math.min(1, Math.abs(r.ux * tx + r.uz * tz)))).toFixed(1);
    facing = r.wx * (ln.qx - r.x) + r.wz * (ln.qz - r.z) > 0;
    line = { kind: ln.kind, cls: ln.cls, dist: +ln.d.toFixed(2) };
  }
  // kerb gap: nearest carriageway cell (and rail bed cell) around the footprint
  const gap = (table) => {
    const cell = grid.cell, R = 14;
    const i0 = Math.max(0, Math.floor((r.mx - R - grid.x0) / cell)), i1 = Math.min(grid.w - 1, Math.floor((r.mx + R - grid.x0) / cell));
    const j0 = Math.max(0, Math.floor((r.mz - R - grid.z0) / cell)), j1 = Math.min(grid.h - 1, Math.floor((r.mz + R - grid.z0) / cell));
    let best = Infinity;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!table[grid.a[j * grid.w + i]]) continue;
      const d = rectDist(r, grid.x0 + (i + 0.5) * cell, grid.z0 + (j + 0.5) * cell) - cell / 2;
      if (d < best) best = d;
    }
    return best === Infinity ? null : +Math.max(0, best).toFixed(2);
  };
  const kerb = gap(KERB_CELLS);
  const railGap = gap(RAILC); // (null when there is no rail bed within reach)
  // overlaps
  const ov = [];
  let bld = false;
  for (const ring of ctx.rings) {
    if (ring.x1 < r.mx - 6 || ring.x0 > r.mx + 6 || ring.z1 < r.mz - 6 || ring.z0 > r.mz + 6) continue;
    for (let i = 0; i < pts.length; i += 2) if (inRingXZ(pts[i], pts[i + 1], ring.f)) { bld = true; break; }
    if (bld) break;
  }
  if (bld) ov.push('building');
  let bar = false;
  for (const b of ctx.bars) {
    const a = b.a, th = (BARRIER_T[b.kind] || 0.3) / 2;
    for (let i = 0; i + 3 < a.length && !bar; i += 2) {
      const dx = a[i + 2] - a[i], dz = a[i + 3] - a[i + 1], len = Math.hypot(dx, dz), m = Math.max(1, Math.ceil(len / 0.2));
      if (Math.min(a[i], a[i + 2]) > r.mx + 6 || Math.max(a[i], a[i + 2]) < r.mx - 6 || Math.min(a[i + 1], a[i + 3]) > r.mz + 6 || Math.max(a[i + 1], a[i + 3]) < r.mz - 6) continue;
      for (let q = 0; q <= m; q++) if (rectDist(r, a[i] + (dx * q) / m, a[i + 1] + (dz * q) / m) <= th) { bar = true; break; }
    }
    if (bar) break;
  }
  if (bar) ov.push('barrier');
  if (sh.carriage >= OVERLAP_SHARE) ov.push('road');
  if (sh.cycle >= OVERLAP_SHARE) ov.push('cycle');
  if (sh.rail >= OVERLAP_SHARE) ov.push('rail');
  if (sh.water >= OVERLAP_SHARE) ov.push('water');
  const tr = c.trees;
  for (let i = 0; i + 2 < tr.length; i += 3) if (rectDist(r, tr[i], tr[i + 1]) < TREE_R) { ov.push('tree'); break; }
  const hits = [];
  if (item.checkFurniture) {
    for (const s of ctx.stands) {
      if (s === item.self || s.kind === 'shelterf' || s.hid || (s.kind === 'stop' && s.th == null)) continue; // (a stop not drawn, or a hidden piece, keeps only its room)
      if (rectDist(r, s.x, s.z) < Math.max(PROP_HALF, KIND_HALF[s.kind] || 0)) hits.push(s.kind);
    }
    if (hits.length) ov.push('furniture');
  }
  const lp = ctx.c.lamps && ctx.c.lamps.a; // (lampsOf: { a: [x, z, dx, dz, kind, ...] })
  if (lp && lp.length) for (let i = 0; i + 1 < lp.length; i += 5) if (Math.abs(lp[i] - r.x) < 4 && Math.abs(lp[i + 1] - r.z) < 4 && rectDist(r, lp[i], lp[i + 1]) < LAMP_R) { ov.push('lamp'); break; }
  return { r, hits, shares: sh, line, angle, facing, kerb, railGap, roadD: road ? +road.d.toFixed(1) : null, railD: rail ? +rail.d.toFixed(1) : null, overlaps: ov };
}

// ------------------------------------------------------------------ main
const hist = (vals, edges, labels) => {
  const h = Object.fromEntries(labels.map((l) => [l, 0]));
  for (const v of vals) { let i = 0; while (i < edges.length && v >= edges[i]) i++; h[labels[Math.min(i, labels.length - 1)]]++; }
  return h;
};
const ANG_E = [5, 15, 30, 60], ANG_L = ['0-5', '5-15', '15-30', '30-60', '60-90'];
const KERB_E = [0.2, 1, 2, 3.5, 6, 12], KERB_L = ['<0.2', '0.2-1', '1-2', '2-3.5', '3.5-6', '6-12', '>12 / none'];
const r1 = (v) => +v.toFixed(1), r2 = (v) => +v.toFixed(2);

async function main() {
  const t0 = realNow();
  const sw = prepare();
  installStubs();
  globalThis.__chk = null;
  const W = await import(pathToFileURL(path.join(sw, 'voxel/world.js')).href);
  const city = await W.__c_loadCity();
  const keys = (only || fs.readdirSync(tilesDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))).sort();
  log(`check-stops: ${keys.length} tiles, src ${srcDir}, repo ${repo}${OTHER ? ', with --other' : ''}`);

  const shelters = [], others = [], propKinds = {}, aVals = {};
  const info = { tiles: keys.length, built: 0, jsonF10: 0, drawnF10: 0, poi9: 0, poi9WithFeature: 0, furnishStops: 0, furnishGhosts: 0, furnishStopNoPoi: 0, hidden: 0, hiddenKinds: {}, failed: [] };
  let done = 0;
  for (const key of keys) {
    done++;
    if (done % 100 === 0) log(`  ${done}/${keys.length} tiles, ${shelters.length} shelters`);
    const t = readTile(key);
    if (!t) continue;
    const f10 = (t.f || []).filter((e) => e[0] === 10), p9 = (t.p || []).filter((p) => p[0] === 9);
    info.jsonF10 += f10.length;
    for (const e of f10) aVals[e[3]] = (aVals[e[3]] || 0) + 1;
    info.poi9 += p9.length;
    for (const p of p9) if (f10.some((e) => Math.hypot(e[1] - p[1], e[2] - p[2]) <= 10)) info.poi9WithFeature++;
    if (!OTHER && !f10.length && !p9.length) continue;
    const hook = { feat: [], stands: [], aimed: null };
    globalThis.__chk = hook;
    let c;
    try { c = W.__c_buildTile(city, key, t, false, false, 0); } catch (e) { info.failed.push(key + ': ' + String(e && e.message).slice(0, 100)); globalThis.__chk = null; continue; }
    globalThis.__chk = null;
    info.built++;
    info.drawnF10 += hook.feat.length;
    for (const p of c.props || []) propKinds[p.kind] = (propKinds[p.kind] || 0) + 1;
    const [tx, ty] = key.split('_').map(Number);
    const ctx = {
      c, t, stands: hook.stands,
      rings: (t.b || []).map((e) => { const f = []; for (let i = 3; i + 1 < e.length; i += 2) f.push(e[i] / 10, TILE - e[i + 1] / 10); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < f.length; i += 2) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1]); } return { f, x0, x1, z0, z1 }; }).filter((q) => q.f.length >= 6),
      bars: (t.x || []).map((e) => { const a = []; for (let i = 2; i + 1 < e.length; i += 2) a.push(e[i] / 10, TILE - e[i + 1] / 10); return { kind: e[0], a }; }),
    };
    const items = [];
    for (const f of hook.feat) items.push({ type: 'feature', x: f.x, z: f.z, th: f.rot, foot: FOOT.feature, checkFurniture: true, a: f.a });
    // a stop that is not drawn (the map has a shelter there, or it had no place) keeps its room but calls no `aim`: not a shelter
    for (const s of hook.stands) if (s.kind === 'stop') { if (s.th == null) { info.furnishGhosts++; continue; } items.push({ type: 'furnish', x: s.ax ?? s.x, z: s.az ?? s.z, th: s.th, foot: FOOT.furnish, checkFurniture: true, self: s, snap: s.road }); }
    const oth = [];
    info.hidden += hook.stands.filter((s) => s.hid).length;
    for (const s of hook.stands) if (s.hid) info.hiddenKinds[s.kind] = (info.hiddenKinds[s.kind] || 0) + 1;
    if (OTHER) for (const s of hook.stands) {
      if (s.hid) continue;
      let kind = s.kind === 'rack' ? (s.r > 2.5 ? 'rackpark' : 'rack') : s.kind;
      if (!OTHER_RULES[kind]) continue;
      oth.push({ type: kind, x: s.x, z: s.z, th: s.th ?? 0, noHead: s.th == null, foot: FOOT[kind], rule: OTHER_RULES[kind], self: s, own: s.own, useOwn: true });
    }
    // neighbours matter when something stands within SEARCH metres of the tile edge
    const edge = (q) => q.x < SEARCH || q.z < SEARCH || q.x > TILE - SEARCH || q.z > TILE - SEARCH;
    ctx.lines = linesAround(key, t, items.some(edge) || oth.some(edge));
    for (const it of items) {
      const m = measure(ctx, it);
      const sh = {
        id: `${key}#${it.type}#${shelters.length}`, kind: it.type, key, x: r2(it.x), z: r2(it.z), mapX: r2(tx * TILE + it.x), mapY: r2(ty * TILE + (TILE - it.z)),
        heading: r1((deg(Math.atan2(m.r.wx, -m.r.wz)) + 360) % 360), axis: r1((deg(Math.atan2(m.r.ux, -m.r.uz)) + 360) % 360),
        angle: m.angle, facing: m.facing, line: m.line, roadD: m.roadD, railD: m.railD, ground: m.shares, kerb: m.kerb, railGap: m.railGap, overlaps: m.overlaps, furniture: m.hits.length ? m.hits : undefined, noHeading: !!it.noHead,
      };
      if (it.type === 'furnish') {
        let bp = null, bd = 1e9;
        for (const p of p9) { const d = Math.hypot(p[1] / 10 - it.x, TILE - p[2] / 10 - it.z); if (d < bd) { bd = d; bp = p; } }
        sh.poiDist = bp ? r2(bd) : null;
        if (it.snap) { // the street furnish itself snapped to
          const tl = Math.hypot(it.snap.tx, it.snap.tz) || 1, c0 = Math.cos(it.th), s0 = Math.sin(it.th);
          sh.snap = { cls: it.snap.cls, name: it.snap.name || '', d: r2(it.snap.d), angle: r1(deg(Math.acos(Math.min(1, Math.abs((c0 * it.snap.tx - s0 * it.snap.tz) / tl))))) };
        }
        if (!bp || bd > 8) info.furnishStopNoPoi++;
        info.furnishStops++;
      }
      shelters.push(sh);
    }
    for (const it of oth) {
      const m = measure(ctx, it);
      others.push({ kind: it.type, key, x: r2(it.x), z: r2(it.z), noHeading: !!it.noHead, reference: m.line ? m.line.kind : null, angle: m.angle, facing: m.facing, line: m.line, ground: m.shares, overlaps: m.overlaps });
    }
    try { c.dispose(); } catch {}
  }

  // ---- doubles (global, in map metres)
  const grid = new Map();
  const cellK = (x, y) => Math.floor(x / 16) + ',' + Math.floor(y / 16);
  shelters.forEach((s, i) => { const k = cellK(s.mapX, s.mapY); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
  const pairs = [];
  shelters.forEach((s, i) => {
    const cx = Math.floor(s.mapX / 16), cy = Math.floor(s.mapY / 16);
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cy - 1; b <= cy + 1; b++) for (const j of grid.get(a + ',' + b) || []) {
      if (j <= i) continue;
      const o = shelters[j], d = Math.hypot(o.mapX - s.mapX, o.mapY - s.mapY);
      if (d < NEAR_R) pairs.push({ a: s.id, b: o.id, kinds: s.kind + '+' + o.kind, dist: r2(d), mapX: s.mapX, mapY: s.mapY });
    }
  });
  const dbl = new Set();
  for (const p of pairs) if (p.dist < DOUBLE_R) { dbl.add(p.a); dbl.add(p.b); }
  const byId = new Map(shelters.map((s) => [s.id, s]));
  for (const id of dbl) byId.get(id).overlaps.push('double');

  // ---- problems and score
  const W_OV = { building: 100, road: 100, water: 80, rail: 60, barrier: 50, cycle: 40, tree: 20, double: 20, furniture: 20, lamp: 20 };
  const classify = (s, rule, strict = STRICT) => {
    const p = [];
    const expect = rule ? rule.expect : 0;
    if (s.angle == null) p.push('noLine');
    else {
      if (expect === 0 && s.angle > MAX_ANGLE) p.push('angle');
      if (expect === 90 && s.angle < 90 - MAX_ANGLE) p.push('angle');
    }
    if (s.angle != null && (rule ? rule.front : true) === true && !s.facing) p.push('notFacing');
    if (!rule || rule.pave) if ((rule || !strict ? s.ground.pave + s.ground.land : s.ground.pave) < MIN_PAVE) p.push('ground');
    if (!rule) {
      // beside a track the edge that matters is the rail bed's (a platform), beside a street the carriageway's: the nearer of
      // the two counts (the old rule: the carriageway only)
      const k = strict ? s.kerb : s.kerb == null ? s.railGap : s.railGap == null ? s.kerb : Math.min(s.kerb, s.railGap);
      if (k == null || k > KERB_MAX) p.push('kerbFar');
      else if (k < KERB_MIN) p.push('kerbNear');
    }
    for (const o of s.overlaps) p.push('overlap:' + o);
    return p;
  };
  for (const s of shelters) {
    s.problems = classify(s, null);
    s.problemsOld = classify(s, null, true);
    s.score = r1(s.overlaps.reduce((a, o) => a + (W_OV[o] || 0), 0) + (!s.facing && s.angle != null ? 10 : 0) + (s.angle == null ? 10 : s.angle / 9) + 10 * (1 - s.ground.pave) + 2 * Math.min(5, s.kerb == null ? 5 : Math.max(0, s.kerb - KERB_MAX, KERB_MIN - s.kerb)));
  }

  const summary = {};
  for (const kind of ['feature', 'furnish', 'all']) {
    const L = shelters.filter((s) => kind === 'all' || s.kind === kind);
    const pr = {}, prOld = {};
    let clean = 0, cleanOld = 0, landOk = 0;
    for (const s of L) {
      if (!s.problems.length) clean++;
      if (!s.problemsOld.length) cleanOld++;
      for (const p of new Set(s.problems)) pr[p] = (pr[p] || 0) + 1;
      for (const p of new Set(s.problemsOld)) prOld[p] = (prOld[p] || 0) + 1;
      if (s.ground.pave + s.ground.land < MIN_PAVE) landOk++;
    }
    summary[kind] = {
      total: L.length, clean, problems: pr, cleanOldRule: cleanOld, problemsOldRule: prOld, groundBelowEvenWithLand: landOk,
      angleHist: hist(L.filter((s) => s.angle != null).map((s) => s.angle), ANG_E, ANG_L),
      kerbHist: hist(L.map((s) => (s.kerb == null ? 99 : s.kerb)), KERB_E, KERB_L),
      facingYes: L.filter((s) => s.facing === true).length, facingNo: L.filter((s) => s.facing === false).length,
      nearestKind: L.reduce((m, s) => { const k = s.line ? s.line.kind : 'none'; m[k] = (m[k] || 0) + 1; return m; }, {}),
      railNearerThanRoad: L.filter((s) => s.railD != null && (s.roadD == null || s.railD < s.roadD)).length,
      meanGround: ['pave', 'land', 'carriage', 'cycle', 'rail', 'water', 'building', 'other'].reduce((m, k) => { m[k] = L.length ? r2(L.reduce((a, s) => a + s.ground[k], 0) / L.length) : 0; return m; }, {}),
      snap: kind === 'furnish' ? (() => {
        const Q = L.filter((s) => s.snap);
        return { n: Q.length, angleHist: hist(Q.map((s) => s.snap.angle), ANG_E, ANG_L), cls: Q.reduce((m, s) => { m[s.snap.cls] = (m[s.snap.cls] || 0) + 1; return m; }, {}),
          pointToStreetMean: Q.length ? r2(Q.reduce((a, s) => a + s.snap.d, 0) / Q.length) : 0, snappedNotNearest: Q.filter((s) => !s.line || s.line.kind !== 'road' || s.line.cls !== s.snap.cls).length }; })() : undefined,
      headingCounts: kind === 'feature' ? L.reduce((m, s) => { m[s.heading] = (m[s.heading] || 0) + 1; return m; }, {}) : undefined,
    };
  }
  const worst = [...shelters].sort((a, b) => b.score - a.score).slice(0, 20).map((s) => ({ id: s.id, kind: s.kind, key: s.key, tile: { x: s.x, z: s.z }, map: { x: s.mapX, y: s.mapY }, headingDeg: s.heading, score: s.score, angle: s.angle, facing: s.facing, line: s.line, kerb: s.kerb, pave: s.ground.pave, problems: s.problems }));

  const otherSummary = {};
  if (OTHER) {
    for (const kind of Object.keys(OTHER_RULES)) {
      const L = others.filter((o) => o.kind === kind), rule = OTHER_RULES[kind], pr = {};
      let clean = 0;
      for (const o of L) {
        o.problems = o.noHeading ? ['noHeading'] : classify(o, rule);
        if (!o.problems.length) clean++;
        for (const p of new Set(o.problems)) pr[p] = (pr[p] || 0) + 1;
      }
      otherSummary[kind] = {
        total: L.length, clean, problems: pr, rule: rule.note,
        angleHist: hist(L.filter((o) => o.angle != null).map((o) => o.angle), ANG_E, ANG_L),
        facingYes: L.filter((o) => o.facing === true).length, facingNo: L.filter((o) => o.facing === false).length,
        meanPave: L.length ? r2(L.reduce((a, o) => a + o.ground.pave, 0) / L.length) : 0,
        meanLand: L.length ? r2(L.reduce((a, o) => a + o.ground.land, 0) / L.length) : 0,
      };
    }
  }

  const result = {
    meta: { src: srcDir, repo, tiles: keys.length, built: info.built, onlyTiles: only, other: OTHER, seconds: Math.round((realNow() - t0) / 1000), consoleWarnings: diag.count, firstWarnings: diag.first,
      thresholds: { MAX_ANGLE, MIN_PAVE, KERB_MAX, KERB_MIN, OVERLAP_SHARE, REACH, DOUBLE_R, NEAR_R, PROP_HALF, TREE_R },
      convention: 'tile x east, z south from NW corner (m); map x = tx*256 + x, map y = ty*256 + (256 - z); heading = compass bearing of the open side' },
    counts: { ...info, featureShelterAValues: aVals, propKinds },
    summary, doubles: { within4_6: dbl.size, pairsWithin4_6: pairs.filter((p) => p.dist < DOUBLE_R).length, pairsWithin15: pairs.length, list: pairs.slice(0, 40) },
    worst20: worst, other: OTHER ? otherSummary : undefined, otherRules: OTHER ? OTHER_RULES : undefined,
    shelters, othersCount: OTHER ? others.length : undefined,
  };
  if (outFile) { fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(result) + '\n'); }

  // ---- text report
  const out = [];
  const P = (s = '') => out.push(s);
  P(`check-stops: ${info.tiles} tiles read, ${info.built} built at lod 0 (day) in ${result.meta.seconds} s; src ${srcDir}`);
  P(`thresholds: angle > ${MAX_ANGLE} deg, pave share < ${MIN_PAVE}, kerb > ${KERB_MAX} m or < ${KERB_MIN} m, overlap = surface share >= ${OVERLAP_SHARE}, double = centres < ${DOUBLE_R} m`);
  P(`convention: tile x east / z south from the NW corner; map x = tx*256 + x, map y = ty*256 + (256 - z); heading = compass bearing of the open side`);
  P('');
  P(`feature shelters: tile data has ${info.jsonF10} type-10 entries, drawFeature drew ${info.drawnF10}; their a values: ${JSON.stringify(aVals)}`);
  P(`kind-9 points of interest: ${info.poi9}, of which ${info.poi9WithFeature} have a type-10 feature within 1 m; furnish stops drawn: ${info.furnishStops} (no poi within 8 m: ${info.furnishStopNoPoi}); stops with a room but no shelter drawn (not measured): ${info.furnishGhosts}`);
  P(`map shelters left out by the drawer (tile data minus drawn): ${info.jsonF10 - info.drawnF10}; furniture hidden under a map shelter's roof (room kept, not drawn, not measured): ${info.hidden} ${JSON.stringify(info.hiddenKinds)}`);
  if (info.failed.length) P(`tiles that failed to build: ${info.failed.length}: ${info.failed.slice(0, 5).join(' | ')}`);
  if (diag.count) P(`console warnings/errors swallowed: ${diag.count}; first: ${diag.first.slice(0, 3).join(' | ')}`);
  for (const kind of ['feature', 'furnish', 'all']) {
    const S = summary[kind];
    P('');
    P(`== ${kind}: ${S.total} shelters, ${S.clean} without any problem`);
    P(`   problems (a shelter can have several): ${JSON.stringify(S.problems)}`);
    P(`   under the old rule (pavement without LAND; kerb to the carriageway also beside a track): ${S.cleanOldRule} without any problem; ${JSON.stringify(S.problemsOldRule)}`);
    P(`   facing the line: yes ${S.facingYes}, no ${S.facingNo}; nearest line kind: ${JSON.stringify(S.nearestKind)}; a rail nearer than the nearest street: ${S.railNearerThanRoad}`);
    P(`   angle histogram: ${JSON.stringify(S.angleHist)}`);
    P(`   kerb histogram (m): ${JSON.stringify(S.kerbHist)}`);
    P(`   mean ground shares: ${JSON.stringify(S.meanGround)}; below ${MIN_PAVE} even if LAND counted as pavement: ${S.groundBelowEvenWithLand}`);
    if (S.snap) P(`   street furnish snapped to (its own angle to that street is the control: should be ~0): ${JSON.stringify(S.snap)}`);
    if (S.headingCounts) P(`   open-side headings (compass deg): ${JSON.stringify(S.headingCounts)}`);
  }
  P('');
  P(`== doubles: ${dbl.size} shelters in pairs closer than ${DOUBLE_R} m (${result.doubles.pairsWithin4_6} pairs); pairs closer than ${NEAR_R} m: ${pairs.length} (${JSON.stringify(pairs.reduce((m, p) => { m[p.kinds] = (m[p.kinds] || 0) + 1; return m; }, {}))})`);
  P('');
  P('== twenty worst (score: 100 building, 100 road, 80 water, 60 rail, 50 barrier, 40 cycle lane, 20 tree/double/furniture, 10 not facing / no line, angle/9, 10*(1-pave), 2*kerb excess)');
  P('   # kind     tile      local x,z         MAP x,y             head  angle face line        kerb pave score problems');
  worst.forEach((w, i) => P(`  ${String(i + 1).padStart(2)} ${w.kind.padEnd(8)} ${w.key.padEnd(9)} ${(w.tile.x + ',' + w.tile.z).padEnd(16)} ${(w.map.x + ',' + w.map.y).padEnd(18)} ${String(w.headingDeg).padStart(5)} ${String(w.angle).padStart(5)} ${w.facing ? 'yes ' : 'no  '} ${(w.line ? w.line.kind + w.line.cls + '@' + w.line.dist : '-').padEnd(11)} ${String(w.kerb).padStart(4)} ${w.pave.toFixed(2)} ${String(w.score).padStart(6)} ${w.problems.join(',')}`));
  if (OTHER) {
    P('');
    P('== other directed furniture (from the recorded stand calls; headings as drawn). Props kinds returned by buildTile, for reference: ' + JSON.stringify(propKinds));
    for (const [kind, S] of Object.entries(otherSummary)) {
      P(`  ${kind}: ${S.total} placed, ${S.clean} without problem; rule: ${S.rule}`);
      P(`     problems: ${JSON.stringify(S.problems)}; facing yes ${S.facingYes} no ${S.facingNo}; mean pave ${S.meanPave}, land ${S.meanLand}`);
      P(`     angle histogram: ${JSON.stringify(S.angleHist)}`);
    }
    P('  (kerb distance is not applied to other furniture: it stands at the back or the edge of the pavement by design; for a bench or sign "facing" means the front side faces the street)');
  }
  console.log(out.join('\n'));
}

try { await main(); } catch (e) { console.error('check-stops failed: ' + (e && e.stack || e)); cleanup(); process.exit(2); }
cleanup();
