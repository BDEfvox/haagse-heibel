// Facts about the spot a gag plays on, worked out from what is really there, so a gag never hangs a balcony on a
// tree or lets somebody run through a house. Everything is in street space (x along the street from the spot,
// z across it, negative = far side with the house fronts). Every helper degrades to "unknown, assume clear" when
// the world (`ctx.W`) or one of its functions is missing, so a gag never throws because of a missing fact.
//
//   ctx.W.path.xz(s, v)     street space -> scene x, z      (s = ctx.sc + x)
//   ctx.W.clsAt(x, z)       ground class (ctx.W.C), 255 = unknown
//   ctx.W.solid.get(x, z)   > 0 (and < 255) = a building stands there; 255 = outside the built area
//   ctx.W.treeNear(x, z, r) a tree trunk within r metres
//   ctx.W.props             furniture { kind, x, z } in scene coordinates (kinds and sizes: FURN below)
//   ctx.W.anchors.parked / .lamps   the whole street's parked cars and lamp posts { s, z }
//   ctx.crowd.obstacles(x, z, r, out)   optional: standing groups, waiting vehicles... [x, z, radius, height, ...] in scene coordinates
// Besides ground, buildings and trees, a spot has an OBSTACLE PICTURE (`obstacles(ctx)`): everything that stands there. The
// placement helpers, the walking route, the lane finder and the stage scan (`findStage`) all read it.

const X0 = -23.5, X1 = 23.5;

const NAMES = {
  walk: ['LAND', 'GRASS', 'SAND', 'DUNE', 'PLAZA', 'PARKING', 'DIRT', 'FOOT', 'PED', 'WALK', 'CURB', 'KLINKER', 'PITCH', 'FARM'],
  road: ['ASPHALT', 'KLINKER', 'SERVICE', 'CYCLE', 'BIKELANE', 'MARK', 'CURB', 'PARKING', 'RAILBED', 'RAIL'],
  water: ['WATER', 'SEA'],
  beach: ['SAND', 'DUNE'],
  park: ['GRASS', 'FOREST', 'PITCH', 'FARM'],
  square: ['PLAZA', 'PED'],
};
NAMES.open = [...NAMES.walk, ...NAMES.road];

const TABS = new WeakMap();
/** Lookup tables by ground class, built once per class table. */
function tables(C) {
  let t = TABS.get(C);
  if (t) return t;
  t = {};
  for (const k of Object.keys(NAMES)) {
    const a = new Uint8Array(256);
    for (const n of NAMES[k]) if (C[n] !== undefined) a[C[n]] = 1;
    t[k] = a;
  }
  TABS.set(C, t);
  return t;
}
const world = (ctx) => { const W = ctx && ctx.W; return W && W.path && typeof W.path.xz === 'function' ? W : null; };
const scene = (ctx, W, x, z) => W.path.xz(ctx.sc + x, z);

/** The ground class under a street-space point (255 = unknown). */
export function groundAt(ctx, x, z) {
  const W = world(ctx);
  if (!W || typeof W.clsAt !== 'function') return 255;
  const p = scene(ctx, W, x, z);
  const c = W.clsAt(p[0], p[1]);
  return c === undefined || c === null ? 255 : c;
}
/** True when a building is known to stand at the point. */
export function builtAt(ctx, x, z) {
  const W = world(ctx);
  if (!W) return false;
  const p = scene(ctx, W, x, z);
  if (W.solid && typeof W.solid.get === 'function') { const v = W.solid.get(p[0], p[1]); if (v > 0 && v < 255) return true; }
  return !!(W.C && typeof W.clsAt === 'function' && W.clsAt(p[0], p[1]) === W.C.BUILDING);
}
/** True when something is known to be there to stand in: a trunk within r metres. */
export function treeAt(ctx, x, z, r = 0.8) {
  const W = world(ctx);
  if (!W || typeof W.treeNear !== 'function') return false;
  const p = scene(ctx, W, x, z);
  return !!W.treeNear(p[0], p[1], r);
}
/** Is the ground at the point road (lanes, cycle lanes, tram bed)? Unknown counts as road. */
export function roadAt(ctx, x, z) {
  const W = world(ctx);
  if (!W || !W.C) return true;
  const c = groundAt(ctx, x, z);
  return c === 255 || tables(W.C).road[c] === 1;
}
// ---------------------------------------------------------------- what stands there: the obstacle picture
/**
 * Everything that stands on the street and takes room, as [height, footprint radius] in metres, by prop kind. ONE table
 * (the stage's own `FURN` in stage.js has the same numbers for the camera). Unknown kinds count as FURN_DEFAULT.
 * A radius of 0 (signs) or a height under 0.2 m is not an obstacle.
 */
export const FURN = {
  bench: [1.0, 0.9], bin: [0.95, 0.4], box: [1.5, 0.7], mailbox: [1.35, 0.4], parasol: [2.5, 1.2], rack: [1.25, 1.7], sign: [0, 0],
  stall: [2.6, 1.6], stop: [2.6, 1.8], terrace: [2.6, 1.6], mstall: [2.6, 1.8], kiosk: [3.2, 2.6], picnic: [0.8, 1.5], orac: [1.1, 0.5],
  column: [3.1, 0.65], mupi: [2.2, 0.7], meter: [1.6, 0.35], charger: [1.3, 0.55], trolleys: [1.9, 1.6], rackpark: [1.3, 2.4],
  mast: [6.0, 0.2], tlight: [3.2, 0.2],
  // not in the stage's table, but they stand in the city
  statue: [3.5, 1.1], fountain: [1.4, 2.2], shelter: [2.6, 1.8], hydrant: [0.8, 0.25], bollard: [0.9, 0.2], planter: [0.9, 0.6],
  lamp: [5.0, 0.25], pole: [5.0, 0.2], tree: [6.0, 0.35], fence: [1.0, 0.3], stand: [2.2, 1.2], island: [0.3, 1.0],
};
export const FURN_DEFAULT = [1.1, 0.6];
export const furnOf = (kind) => FURN[kind] || FURN_DEFAULT;
/** Kinds big enough to hide somebody behind (an entrance from behind a thing, see gags.js). */
const HIDING = new Set(['stall', 'mstall', 'kiosk', 'stop', 'shelter']);

const PICS = new WeakMap();
const CS = 0.4;     // cell of the walking grid, metres
const INF = 0.58;   // a walker's clearance in the grid: a 0.3 m body plus the half diagonal of a cell
const PSPAN = 38;   // the picture reaches this far along the street from the spot

function newPic(ctx, np) {
  const L = ctx.L || {}, sc = ctx.sc || 0;
  const lo = Math.max(-34, L.sA != null ? L.sA - sc + 0.5 : -34), hi = Math.min(34, L.sB != null ? L.sB - sc - 0.5 : 34);
  const z0 = (L.zB != null ? L.zB : -16) - 2, z1 = (L.zF != null ? L.zF : 16) + 2;
  return {
    np, asked: 0, n: 0, nStat: 0, X: [], Z: [], HX: [], HZ: [], H: [], T: [], K: [], OX: [], OZ: [], cars: [], lamps: [],
    lo, hi, z0, z1, nx: Math.max(2, Math.ceil((hi - lo) / CS)), nz: Math.max(2, Math.ceil((z1 - z0) / CS)),
    grids: new Map(), gnd: null, tmp: null, g: null, par: null, mark: null, stamp: 0, heapF: [], heapI: [], out: null,
  };
}
function addShape(pic, t, x, z, hx, hz, h, kind, ox = x, oz = z) {
  const i = pic.n++;
  pic.X[i] = x; pic.Z[i] = z; pic.HX[i] = hx; pic.HZ[i] = hz; pic.H[i] = h; pic.T[i] = t; pic.K[i] = kind; pic.OX[i] = ox; pic.OZ[i] = oz;
}
function buildStatic(ctx, pic) {
  const L = ctx.L || {}, W = world(ctx), sc = ctx.sc || 0, A = W && W.anchors;
  // parked cars and lamp posts: the whole street's list when the stage has one (the spot's own lists stop short of its edges)
  const parked = A && A.parked && A.parked.length ? A.parked.map((c) => ({ x: c.s - sc, z: c.z })) : L.parked || [];
  for (const c of parked) {
    if (!Number.isFinite(c.x) || Math.abs(c.x) > PSPAN || Math.abs(c.z) > 24) continue;
    for (const dx of [-1.5, 0, 1.5]) addShape(pic, 0, c.x + dx, c.z, 0.97, 0.97, 1.5, 'car', c.x, c.z); // (no heading known: three circles along the street)
    pic.cars.push(c.x, c.z);
  }
  const lamps = A && A.lamps && A.lamps.length ? A.lamps.map((c) => ({ x: c.s - sc, z: c.z })) : L.lamps || [];
  for (const c of lamps) {
    if (!Number.isFinite(c.x) || Math.abs(c.x) > PSPAN || Math.abs(c.z) > 24) continue;
    addShape(pic, 0, c.x, c.z, 0.25, 0.25, 5, 'lamp');
    pic.lamps.push(c.x, c.z);
  }
  const furn = (kind, x, z) => {
    const f = furnOf(kind);
    if (f[1] > 0 && f[0] >= 0.2) addShape(pic, 0, x, z, f[1], f[1], f[0], kind);
  };
  if (W && Array.isArray(W.props) && W.props.length) {
    const c = W.path.xz(sc, 0), R = PSPAN + 14;
    for (const p of W.props) {
      if (Math.abs(p.x - c[0]) > R || Math.abs(p.z - c[1]) > R) continue;
      const f = furnOf(p.kind);
      if (!(f[1] > 0) || f[0] < 0.2) continue;
      const q = W.path.project(p.x, p.z), x = q.s - sc;
      if (Math.abs(x) > PSPAN || Math.abs(q.v) > 24) continue;
      furn(p.kind, x, q.v);
    }
  } else {
    for (const b of L.bins || []) furn('bin', b.x, b.z);
    for (const b of L.benches || []) furn('bench', b.x, b.z);
    for (const b of L.racks || []) furn('rack', b.x, b.z - 1.7);
    for (const b of L.stalls || []) furn('stall', b.x, b.z + 1.3);
    if (L.box) furn('box', L.box.x, L.box.z);
  }
  pic.nStat = pic.n;
}
/** The moving-and-standing part: the crowd's own list (parked cars, lamps, standing groups, waiting vehicles) when it has one. */
function crowdShapes(ctx, pic) {
  for (const k of ['X', 'Z', 'HX', 'HZ', 'H', 'T', 'K', 'OX', 'OZ']) pic[k].length = pic.nStat;
  pic.n = pic.nStat;
  pic.grids.clear();
  const cr = ctx.crowd, W = world(ctx);
  if (!cr || typeof cr.obstacles !== 'function' || !W) return;
  const out = pic.out || (pic.out = []), sc = ctx.sc || 0, c = W.path.xz(sc, 0);
  out.length = 0;
  let n = cr.obstacles(c[0], c[1], PSPAN + 4, out);
  n = Math.min(Number.isFinite(n) ? n : out.length / 4, Math.floor(out.length / 4));
  for (let i = 0; i < n; i++) {
    const ox = out[i * 4], oz = out[i * 4 + 1], r = out[i * 4 + 2], h = out[i * 4 + 3];
    if (!(r > 0)) continue;
    const q = W.path.project(ox, oz), x = q.s - sc;
    if (Math.abs(x) > PSPAN || Math.abs(q.v) > 24) continue;
    let dup = false;
    for (let k = 0; k < pic.cars.length && !dup; k += 2) dup = Math.abs(pic.cars[k] - x) < 2.7 && Math.abs(pic.cars[k + 1] - q.v) < 1.5;
    for (let k = 0; k < pic.lamps.length && !dup; k += 2) dup = Math.abs(pic.lamps[k] - x) < 0.6 && Math.abs(pic.lamps[k + 1] - q.v) < 0.6;
    if (!dup) addShape(pic, 0, x, q.v, Math.max(r, 0.2), Math.max(r, 0.2), Number.isFinite(h) ? h : 1.5, 'crowd');
  }
}
/**
 * The obstacle picture of a spot, in street space: every standing thing as a shape { X, Z, HX, HZ (circle: radius in both), H, T, K }.
 * Built lazily, cached with the ctx (the static part until the world's prop list changes, the crowd part every few hundred asks).
 */
export function obstacles(ctx) {
  let pic = PICS.get(ctx);
  const W = world(ctx), np = W && Array.isArray(W.props) ? W.props.length : -1;
  if (pic && pic.np === np && ++pic.asked < 30000) {
    if (pic.asked % 400 === 0) crowdShapes(ctx, pic);
    return pic;
  }
  pic = newPic(ctx, np);
  PICS.set(ctx, pic);
  buildStatic(ctx, pic);
  crowdShapes(ctx, pic);
  return pic;
}
/** Take a fresh look at the moving part of the picture (the crowd's standing groups and waiting vehicles): after `R.close()`, say. */
export function refreshCrowd(ctx) { const pic = PICS.get(ctx); if (pic) crowdShapes(ctx, pic); }

/** Distance from a point to the edge of shape i (negative inside). */
function gapTo(pic, i, px, pz) {
  const dx = Math.abs(px - pic.X[i]), dz = Math.abs(pz - pic.Z[i]);
  if (pic.T[i] === 0) return Math.hypot(dx, dz) - pic.HX[i];
  const ex = dx - pic.HX[i], ez = dz - pic.HZ[i];
  return ex > 0 || ez > 0 ? Math.hypot(ex > 0 ? ex : 0, ez > 0 ? ez : 0) : Math.max(ex, ez);
}
const pos = (e) => (e.g && e.g.position ? [e.g.position.x, e.g.position.z] : Array.isArray(e) ? e : [e.x, e.z]);
/** Is shape i the thing the caller said it is deliberately at? (an anchor, an actor, a point; `r` widens it, default 2 m) */
function ignored(pic, i, ign) {
  for (const e of ign) {
    if (!e) continue;
    const [ex, ez] = pos(e);
    if (Number.isFinite(ex) && Number.isFinite(ez) && Math.hypot(pic.OX[i] - ex, pic.OZ[i] - ez) <= (e.r ?? 2)) return true;
  }
  return false;
}
/**
 * Does something stand within r metres of (x, z)? `ign` lists what to leave out (see `ignore` in clearSpot), `near` = { x, z, r }
 * lets whatever already touches that point stay as close as it is there but no closer (the place a walker starts from).
 */
export function hitsObst(ctx, x, z, r = 0.45, ign = null, near = null) {
  const pic = obstacles(ctx);
  for (let i = 0; i < pic.n; i++) {
    let re = pic.HX[i] < 0.35 ? Math.min(r, 0.45) : r; // a thin post (lamp, pole, bollard) only needs a person's width beside it
    if (pic.H[i] < 0.2 || Math.abs(pic.X[i] - x) > pic.HX[i] + re || Math.abs(pic.Z[i] - z) > pic.HZ[i] + re) continue;
    if (near) { const gn = gapTo(pic, i, near.x, near.z); if (gn < near.r) re = Math.min(re, gn - 0.05); } // what the start already touches: you may stay as close as you are, not closer
    if (gapTo(pic, i, x, z) >= re) continue;
    if (ign && ign.length && ignored(pic, i, ign)) continue;
    return true;
  }
  return false;
}
/** The shapes of the picture that a person could hide behind: [{ x, z, r, h }] (stalls, kiosks, shelters, vans). */
export function hiders(ctx, minH = 2.0) {
  const pic = obstacles(ctx), out = [];
  for (let i = 0; i < pic.n; i++) if (pic.H[i] >= minH && pic.HX[i] >= 1.0 && (HIDING.has(pic.K[i]) || pic.K[i] === 'crowd')) out.push({ x: pic.X[i], z: pic.Z[i], r: pic.HX[i], h: pic.H[i] });
  return out;
}

/** Do at least `need` of the points along a lane (x from..to, every 4 m) lie on road, with nothing standing on the line? opt: { half: 0.5, ignore, obst: false } */
export function roadHere(ctx, z, from = -20, to = 20, need = 0.6, opt = {}) {
  let n = 0, k = 0;
  for (let x = from; x <= to; x += 4, k++) if (roadAt(ctx, x, z) && (opt.obst === false || !hitsObst(ctx, x, z, opt.half ?? 0.5, opt.ignore))) n++;
  return k === 0 || n / k >= need;
}

/**
 * Is there room to stand at (x, z) with radius r? Walkable ground (opt.ground 'walk', the default) or any open
 * ground including road ('open'), no building, no water, no tree trunk, and nothing standing there: no parked car,
 * lamp post, bin, bench, shelter, terrace table... (the obstacle picture). Unknown ground counts as clear.
 * opt.ignore: a list of things the caller is deliberately AT (an anchor { x, z }, an actor, a [x, z] point; `r` widens, default 2 m),
 * so a scene that tips over a bin or breaks into a car does not fail on it. opt.obst === false skips the standing things.
 */
export function clearSpot(ctx, x, z, r = 0.6, opt = {}) {
  const W = world(ctx);
  const standing = () => opt.obst === false || !hitsObst(ctx, x, z, r, opt.ignore, opt.near);
  if (!W) return standing();
  const tb = W.C ? tables(W.C)[opt.ground || 'walk'] : null;
  const pts = r > 0 ? [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] : [[0, 0]];
  if (r >= 1) pts.push([r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]);
  for (const [dx, dz] of pts) {
    if (builtAt(ctx, x + dx, z + dz)) return false;
    if (tb) { const c = groundAt(ctx, x + dx, z + dz); if (c !== 255 && !tb[c]) return false; }
  }
  if (opt.trees !== false && treeAt(ctx, x, z, r + 0.3)) return false;
  return standing();
}

const ANG = [0, Math.PI, Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4, (-3 * Math.PI) / 4, Math.PI / 2, -Math.PI / 2];
/**
 * The nearest clear spot to (x, z), nudged mostly along the street (rings of growing radius, squashed across it),
 * or null when nothing within `tries` rings is clear. opt: { ground, bias (+1/-1: try that way along the street first),
 * step (ring spacing, 0.7), flat (how much of the ring is allowed across the street, 0.5), ignore, obst }.
 */
export function findSpot(ctx, x, z, r = 0.6, tries = 14, opt = {}) {
  if (clearSpot(ctx, x, z, r, opt)) return { x, z };
  const step = opt.step ?? 0.7, flat = opt.flat ?? 0.5, bias = opt.bias ?? 1;
  const lo = (ctx.L && ctx.L.x0 != null ? ctx.L.x0 : -24) + 0.5, hi = (ctx.L && ctx.L.x1 != null ? ctx.L.x1 : 24) - 0.5;
  for (let k = 1; k <= tries; k++) {
    const d = k * step;
    for (const a of ANG) {
      const cx = x + Math.cos(a) * d * bias, cz = z + Math.sin(a) * d * flat;
      if (cx < lo || cx > hi) continue;
      if (clearSpot(ctx, cx, cz, r, opt)) return { x: cx, z: cz };
    }
  }
  return null;
}
/** Like findSpot but never null: the point itself when nothing clear is near (for things that must happen anyway). */
export function spotOr(ctx, x, z, r = 0.6, tries = 8, opt = {}) {
  return findSpot(ctx, x, z, r, tries, opt) || { x, z };
}
/** A spot for an actor to appear at: open ground (road allowed), a short nudge along the street only. */
export function nudge(ctx, x, z, r = 0.5, opt = {}) {
  return findSpot(ctx, x, z, r, 5, { ground: 'open', flat: 0.25, ...opt }) || { x, z };
}

/**
 * How far one can walk (or ride) from x along the line z in direction dir (+1/-1) over open ground, at most `max`
 * metres. Returns the x of the last clear metre (x itself when blocked at once). Whatever already touches the start
 * is left out, and a lamp post or bin on the line does not end the run when there is room to go round it (0.7 m to
 * either side), because the walking helpers go round things.
 */
export function runway(ctx, x, z, dir, max = 24, r = 0.45, opt = {}) {
  const lo = (ctx.L && ctx.L.x0 != null ? ctx.L.x0 : -24) + 0.5, hi = (ctx.L && ctx.L.x1 != null ? ctx.L.x1 : 24) - 0.5;
  const o = { ground: 'open', ignore: opt.ignore, obst: opt.obst, near: { x, z, r: r + 0.1 } };
  let last = x;
  for (let d = 1; d <= max; d++) {
    const cx = x + dir * d;
    if (cx < lo || cx > hi) { last = dir > 0 ? hi : lo; break; }
    if (!(clearSpot(ctx, cx, z, r, o) || (opt.obst !== false && (clearSpot(ctx, cx, z + 0.7, r, o) || clearSpot(ctx, cx, z - 0.7, r, o))))) break;
    last = cx;
  }
  return last;
}

/**
 * Is the straight line between two street-space points open ground all the way (sampled every half metre), with nothing
 * standing on it? What touches either end (the bench you walk to, the car you start at) is left out; opt.ignore adds more.
 */
export function lineClear(ctx, x0, z0, x1, z1, r = 0.45, opt = {}) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5));
  const o = { ground: 'open', ignore: opt.ignore, obst: opt.obst };
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (!clearSpot(ctx, x, z, r, { ...o, near: i * 2 < n ? { x: x0, z: z0, r } : { x: x1, z: z1, r } })) return false;
  }
  return true;
}

// ---------------------------------------------------------------- walking round things
function grid(pic, inf) {
  let b = pic.grids.get(inf);
  if (!b) { b = new Uint8Array(pic.nx * pic.nz); stamp(pic, inf, null, b); pic.grids.set(inf, b); }
  return b;
}
/** Mark the cells whose centre lies within `inf0` of a shape; `per` (Map shape -> inflation, -1 = leave out) overrides it for single shapes. */
function stamp(pic, inf0, per, out) {
  const { nx, nz, lo, z0 } = pic;
  for (let i = 0; i < pic.n; i++) {
    if (pic.H[i] < 0.2) continue;
    const inf = per && per.has(i) ? per.get(i) : inf0;
    if (inf < 0) continue;
    const hx = pic.HX[i] + inf, hz = pic.HZ[i] + inf;
    const i0 = Math.max(0, Math.floor((pic.X[i] - hx - lo) / CS)), i1 = Math.min(nx - 1, Math.floor((pic.X[i] + hx - lo) / CS));
    const j0 = Math.max(0, Math.floor((pic.Z[i] - hz - z0) / CS)), j1 = Math.min(nz - 1, Math.floor((pic.Z[i] + hz - z0) / CS));
    for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) if (gapTo(pic, i, lo + (k + 0.5) * CS, z0 + (j + 0.5) * CS) < inf) out[j * nx + k] = 1;
  }
  return out;
}
function groundBlocked(ctx, pic, i, j) {
  const g = pic.gnd || (pic.gnd = new Uint8Array(pic.nx * pic.nz)), k = j * pic.nx + i;
  let v = g[k];
  if (!v) { v = clearSpot(ctx, pic.lo + (i + 0.5) * CS, pic.z0 + (j + 0.5) * CS, 0.1, { ground: 'open', obst: false }) ? 1 : 2; g[k] = v; }
  return v === 2;
}
/** A query over the walking grid: q.blk = the standing things, the ground behind it, and a 1.3 m carve-out round the start and goal. */
function cellFree(q, i, j) {
  const pic = q.pic;
  if (i < 0 || j < 0 || i >= pic.nx || j >= pic.nz) return true; // (outside the grid nothing is known: clear)
  if (q.blk[j * pic.nx + i]) return false;
  const x = pic.lo + (i + 0.5) * CS, z = pic.z0 + (j + 0.5) * CS;
  if (Math.hypot(x - q.ax, z - q.az) < 1.3 || Math.hypot(x - q.bx, z - q.bz) < 1.3) return true;
  return !groundBlocked(q.ctx, pic, i, j);
}
const free = (q, x, z) => cellFree(q, Math.floor((x - q.pic.lo) / CS), Math.floor((z - q.pic.z0) / CS));
/** Fraction (0..1) along the line where it first meets something, or 2 when the line is clear. */
function losAt(q, x0, z0, x1, z1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.2));
  for (let s = 0; s <= n; s++) if (!free(q, x0 + ((x1 - x0) * s) / n, z0 + ((z1 - z0) * s) / n)) return s / n;
  return 2;
}
function nearestFree(q, x, z, toward = null) {
  const pic = q.pic, i0 = Math.floor((x - pic.lo) / CS), j0 = Math.floor((z - pic.z0) / CS);
  if (cellFree(q, i0, j0)) return [i0, j0];
  for (let r = 1; r <= 6; r++) {
    let best = null, bd = 1e9;
    for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
      if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || !cellFree(q, i, j)) continue;
      // (of the free cells around a blocked goal, the ones on the side we come from are nearer to get to)
      const d = Math.hypot(i - i0, j - j0) + (toward ? 0.35 * Math.hypot(pic.lo + (i + 0.5) * CS - toward.x, pic.z0 + (j + 0.5) * CS - toward.z) / CS : 0);
      if (d < bd) { bd = d; best = [i, j]; }
    }
    if (best) return best;
  }
  return null;
}
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
/** A* over the grid from cell (si, sj) to (gi, gj). Returns the cell centres as [[x, z], ...] or null. Scratch arrays live in the picture. */
function astar(q, si, sj, gi, gj) {
  const pic = q.pic, { nx, nz } = pic, N = nx * nz;
  const G = pic.g || (pic.g = new Float32Array(N)), P = pic.par || (pic.par = new Int32Array(N)), M = pic.mark || (pic.mark = new Int32Array(N));
  const st = ++pic.stamp, hf = pic.heapF, hi = pic.heapI;
  hf.length = 0; hi.length = 0;
  const push = (f, id) => {
    let c = hf.length;
    hf.push(f); hi.push(id);
    while (c > 0) { const p = (c - 1) >> 1; if (hf[p] <= f) break; hf[c] = hf[p]; hi[c] = hi[p]; c = p; }
    hf[c] = f; hi[c] = id;
  };
  const pop = () => {
    const id = hi[0], lf = hf.pop(), li = hi.pop(), n = hf.length;
    if (n) {
      let c = 0;
      for (;;) {
        let k = 2 * c + 1;
        if (k >= n) break;
        if (k + 1 < n && hf[k + 1] < hf[k]) k++;
        if (hf[k] >= lf) break;
        hf[c] = hf[k]; hi[c] = hi[k]; c = k;
      }
      hf[c] = lf; hi[c] = li;
    }
    return id;
  };
  const H = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
  const s0 = sj * nx + si, g0 = gj * nx + gi;
  G[s0] = 0; P[s0] = -1; M[s0] = st;
  push(H(si, sj), s0);
  let found = false, guard = 0;
  while (hf.length && guard++ < N * 4) {
    const cur = pop(), ci = cur % nx, cj = (cur - ci) / nx;
    if (cur === g0) { found = true; break; }
    for (const [dx, dz, c] of NB) {
      const ni = ci + dx, nj = cj + dz;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || !cellFree(q, ni, nj)) continue;
      if (dx && dz && (!cellFree(q, ci + dx, cj) || !cellFree(q, ci, cj + dz))) continue; // no cutting corners
      const id = nj * nx + ni, g = G[cur] + c;
      if (M[id] === st && g >= G[id]) continue;
      M[id] = st; G[id] = g; P[id] = cur;
      push(g + H(ni, nj), id);
    }
  }
  if (!found) return null;
  const out = [];
  for (let id = g0; id >= 0; id = P[id]) { const i = id % nx; out.push([pic.lo + (i + 0.5) * CS, pic.z0 + ((id - i) / nx + 0.5) * CS]); }
  return out.reverse();
}
/**
 * A walking route over the spot's obstacle picture from (x0, z0) to (x1, z1) for something about a person wide.
 * Returns { pts: [[x, z], ...] (the last is the goal), ok, straight }. A clear straight line is `{ pts: [goal], straight: true }`;
 * a blocked one is searched on a 0.4 m grid (A*, then pulled straight between corners) and keeps >= 0.3 m from every standing
 * thing. Shapes that already touch the start or the goal are part of where you are going and do not count (as does opt.ignore);
 * a goal inside a blocked cell is reached by walking the last metre straight. No route: ok is false and pts runs only to the last
 * clear point of the straight line (possibly empty), so nobody walks through anything.
 */
export function route(ctx, x0, z0, x1, z1, opt = {}) {
  const pic = obstacles(ctx), goal = [x1, z1];
  if (Math.hypot(x1 - x0, z1 - z0) < 0.3) return { pts: [goal], ok: true, straight: true };
  const inf = opt.inf ?? INF, ign = opt.ignore && opt.ignore.length ? opt.ignore : null;
  let blk = null;
  // what already touches the start or the goal may stay as close as it is there but no closer: the walker can step away from
  // it, never through it (what the caller said to `ignore` is left out altogether)
  const per = new Map();
  for (let i = 0; i < pic.n; i++) {
    if (pic.H[i] < 0.2) continue;
    if (ign && ignored(pic, i, ign)) { per.set(i, -1); continue; }
    const g0 = gapTo(pic, i, x0, z0), g1 = gapTo(pic, i, x1, z1);
    if (g0 < inf || g1 < inf) per.set(i, Math.max(0, Math.min(g0, g1) - 0.05));
  }
  if (!per.size) blk = grid(pic, inf);
  else {
    blk = pic.tmp || (pic.tmp = new Uint8Array(pic.nx * pic.nz));
    blk.fill(0);
    stamp(pic, inf, per, blk);
  }
  const q = { ctx, pic, blk, ax: x0, az: z0, bx: x1, bz: z1 };
  const t = losAt(q, x0, z0, x1, z1);
  if (t > 1) return { pts: [goal], ok: true, straight: true };
  if (x0 < pic.lo || x0 > pic.hi || x1 < pic.lo || x1 > pic.hi || z0 < pic.z0 || z0 > pic.z1 || z1 < pic.z0 || z1 > pic.z1) return { pts: [goal], ok: true, straight: true }; // off the grid: nothing known
  const s = nearestFree(q, x0, z0), g = nearestFree(q, x1, z1, { x: x0, z: z0 });
  const cells = s && g ? astar(q, s[0], s[1], g[0], g[1]) : null;
  if (!cells) {
    // no way through: walk to the last clear point of the straight line
    const f = Math.max(0, t - 0.2 / Math.max(0.2, Math.hypot(x1 - x0, z1 - z0)));
    return { pts: f > 0.001 ? [[x0 + (x1 - x0) * f, z0 + (z1 - z0) * f]] : [], ok: false, straight: false };
  }
  cells[0] = [x0, z0];
  cells.push(goal);
  // pull the string tight: from each anchor to the furthest corner it can see
  const pts = [];
  let a = 0;
  while (a < cells.length - 1) {
    let b = cells.length - 1;
    while (b > a + 1 && losAt(q, cells[a][0], cells[a][1], cells[b][0], cells[b][1]) <= 1) b--;
    pts.push(cells[b]);
    a = b;
  }
  return { pts, ok: true, straight: false };
}

// ---------------------------------------------------------------- vehicles: lanes, bending a line round parked cars
/** The shapes within `pad` metres of any point of a polyline (so a long line is not tested against the whole picture). */
function shapesNear(pic, line, pad) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of line) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const out = [];
  for (let i = 0; i < pic.n; i++) if (pic.H[i] >= 0.2 && pic.X[i] + pic.HX[i] > x0 - pad && pic.X[i] - pic.HX[i] < x1 + pad && pic.Z[i] + pic.HZ[i] > z0 - pad && pic.Z[i] - pic.HZ[i] < z1 + pad) out.push(i);
  return out;
}
/** Catmull-Rom through the points, sampled about every `step` metres. Each sample is [x, z, segment]. (drive() flies this line.) */
export function curve(P, step = 0.7) {
  const n = P.length, at = (i) => P[Math.max(0, Math.min(n - 1, i))], line = [];
  for (let i = 0; i < n - 1; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2), per = Math.max(10, Math.min(80, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / step)));
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      line.push([
        0.5 * (2 * b[0] + (c[0] - a[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (3 * b[0] - a[0] - 3 * c[0] + d[0]) * t3),
        0.5 * (2 * b[1] + (c[1] - a[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (3 * b[1] - a[1] - 3 * c[1] + d[1]) * t3),
        i,
      ]);
    }
  }
  line.push([P[n - 1][0], P[n - 1][1], Math.max(0, n - 2)]);
  return line;
}
/** Is a car of this size (three circles of radius `half`, `off` apart along its heading) blocked at the pose? `road`: its sides must also be on road. */
function carHit(ctx, pic, near, skip, ign, x, z, hd, half, off, road) {
  const sn = Math.sin(hd), cs = Math.cos(hd);
  for (const k of [-off, 0, off]) {
    const px = x + sn * k, pz = z + cs * k;
    for (const i of near) {
      const need = skip && skip.has(i) ? skip.get(i) : half; // (what touches the start or the end: as close as it is there, no closer)
      if (Math.abs(pic.X[i] - px) > pic.HX[i] + need || Math.abs(pic.Z[i] - pz) > pic.HZ[i] + need || gapTo(pic, i, px, pz) >= need) continue;
      if (ign && ignored(pic, i, ign)) continue;
      return true;
    }
    if (road && (!roadAt(ctx, px + cs * half * 0.85, pz - sn * half * 0.85) || !roadAt(ctx, px - cs * half * 0.85, pz + sn * half * 0.85))) return true;
  }
  return false;
}
/**
 * The shapes that a car at the start or at the end of a line already touches (nearer than `half` with any of its three circles):
 * Map shape -> the clearance it may keep (what it has there, less a hand), so it can drive away from them but not through them.
 */
function touching(pic, near, s0, s1, e0, e1, half, off) {
  const m = new Map(), hs = Math.atan2(s1[0] - s0[0], s1[1] - s0[1]), he = Math.atan2(e1[0] - e0[0], e1[1] - e0[1]);
  const at = (p, hd) => [-off, 0, off].map((k) => [p[0] + Math.sin(hd) * k, p[1] + Math.cos(hd) * k]);
  const A = at(s0, hs), B = at(e1, he);
  for (const i of near) {
    let g = 1e9;
    for (const c of A) g = Math.min(g, gapTo(pic, i, c[0], c[1]));
    for (const c of B) g = Math.min(g, gapTo(pic, i, c[0], c[1]));
    if (g < half) m.set(i, Math.max(0, g - 0.05));
  }
  return m;
}
function failures(ctx, pic, near, skip, ign, line, half, off, road, first) {
  let n = 0;
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], hd = Math.atan2(b[0] - a[0], b[1] - a[1]);
    if (carHit(ctx, pic, near, skip, ign, line[i][0], line[i][1], hd, half, off, road)) { if (first) return i; n++; }
  }
  return first ? -1 : n;
}
/**
 * Bend a driving line (points [[x, z], ...], the first is where the car is) so a car about `half` metres on either side of its
 * line clears every standing thing and stays on the road. Points off the road slide towards the middle of the carriageway; where
 * the curve still touches something, a point is added beside it, at the smallest sideways step that clears. What touches the
 * start or the end of the line is part of the manoeuvre. Returns the new points, or null when no line exists.
 * opt: { half (1.05), off (1.1), ignore, road (true: stay on road, only when the start is on road) }.
 */
export function bend(ctx, P0, opt = {}) {
  const pic = obstacles(ctx), half = opt.half ?? 1.05, off = opt.off ?? 1.1, ign = opt.ignore && opt.ignore.length ? opt.ignore : null;
  let P = P0.map((p) => [p[0], p[1]]);
  if (P.length < 2) return P;
  const first = P[0], last = P[P.length - 1], road = opt.road !== false && roadAt(ctx, first[0], first[1]) && !!world(ctx);
  const near = shapesNear(pic, P, half + 4), skip = touching(pic, near, P[0], P[1], P[P.length - 2], last, half, off);
  const mid = ctx.L && ctx.L.chaseZ != null ? ctx.L.chaseZ : 0;
  for (let k = 1; k < P.length; k++) {
    if (!road || roadAt(ctx, P[k][0], P[k][1])) continue;
    let ok = false;
    for (let d = 0.25; d <= 8 && !ok; d += 0.25) {
      const z = P[k][1] + Math.sign(mid - P[k][1]) * d;
      if (roadAt(ctx, P[k][0], z)) { P[k][1] = z; ok = true; }
    }
    if (!ok) return null;
  }
  let cur = failures(ctx, pic, near, skip, ign, curve(P), half, off, road, false);
  for (let pass = 0; cur > 0 && pass < 10; pass++) {
    const line = curve(P), at = failures(ctx, pic, near, skip, ign, line, half, off, road, true);
    if (at < 0) return P;
    const q = line[at], a = line[Math.max(0, at - 1)], b = line[Math.min(line.length - 1, at + 1)];
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
    let best = null;
    for (const d of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 2, -2, 2.8, -2.8]) {
      const c = [q[0] + nx * d, q[1] + nz * d];
      if (road && !roadAt(ctx, c[0], c[1])) continue;
      const P2 = P.slice();
      P2.splice(q[2] + 1, 0, c);
      const f = failures(ctx, pic, near, skip, ign, curve(P2), half, off, road, false);
      if (f < cur && (!best || f < best.f)) { best = { P: P2, f }; if (f === 0) break; }
    }
    if (!best) return null;
    P = best.P; cur = best.f;
  }
  return cur > 0 ? null : P;
}
/**
 * Is a driving line at height z free from x0 to x1 for a car `halfWidth` either side of it: road under it (and under its sides),
 * nothing standing within halfWidth of it? opt: { ignore }.
 */
export function laneClear(ctx, z, x0 = -20, x1 = 20, halfWidth = 0.95, opt = {}) {
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  for (let x = lo; x <= hi + 1e-6; x += 0.5) {
    if (!roadAt(ctx, x, z) || !roadAt(ctx, x, z + halfWidth * 0.85) || !roadAt(ctx, x, z - halfWidth * 0.85)) return false;
    if (hitsObst(ctx, x, z, halfWidth, opt.ignore)) return false;
  }
  return true;
}
/**
 * The z of a free driving line for traffic going `dir` (+1 towards +x, -1 towards -x) over x0..x1, or null. Tries the lane the
 * traffic would use (right-hand: +x on the camera side), then the rest of the carriageway outwards from it.
 */
export function laneFor(ctx, dir = 1, x0 = -20, x1 = 20, halfWidth = 0.95, opt = {}) {
  const L = ctx.L || {}, hw = L.hw ?? 2.6;
  const pref = L.kind === 'major' ? (dir > 0 ? L.laneF ?? hw / 2 : L.laneB ?? -hw / 2) : L.chaseZ ?? 0;
  const lim = Math.max(0, hw - halfWidth), zs = [pref];
  for (let d = 0.35; d <= 2 * hw; d += 0.35) for (const s of [1, -1]) if (Math.abs(pref + s * d) <= lim + 0.01) zs.push(pref + s * d);
  if (Math.abs(pref) > lim + 0.01) zs.push(Math.max(-lim, Math.min(lim, pref)));
  for (const z of zs) if (laneClear(ctx, z, x0, x1, halfWidth, opt)) return z;
  return null;
}

/**
 * Real house fronts near x, nearest first. opt: { door: true (measure by door, not window), shop: true|false (only /
 * no shops), tower: false (no towers), reach for the standing spot not needed }. A front is only used when a building
 * really stands behind its wall (where that is known), and an invented window is never returned.
 */
export function housesNear(ctx, x, maxDist, opt = {}) {
  const out = [];
  for (const h of (ctx.L && ctx.L.houses) || []) {
    if (opt.shop === true && !h.shop) continue;
    if (opt.shop === false && h.shop) continue;
    if (opt.tower === false && h.tower) continue;
    const a = opt.door ? h.door : h.win;
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.z)) continue;
    const d = Math.abs(a.x - x);
    if (d > maxDist) continue;
    // a building must stand behind the wall (known-empty at all three depths = a made-up front: skip it)
    const W = world(ctx);
    if (W && W.solid && typeof W.solid.get === 'function') {
      let known = false, built = false;
      for (const dz of [1.2, 2.2, 3.2]) {
        const p = scene(ctx, W, a.x, a.z - dz);
        if (W.solid.get(p[0], p[1]) < 255) known = true;
        if (builtAt(ctx, a.x, a.z - dz)) built = true;
      }
      if (known && !built) continue;
    }
    if (!opt.door && opt.balcony !== false && (treeAt(ctx, a.x, a.z + 0.5, 0.7) || treeAt(ctx, a.x, a.z + 1.6, 0.7))) continue; // a window needs air in front of it (balcony, landing)
    out.push([d, h]);
  }
  return out.sort((p, q) => p[0] - q[0]).map((q) => q[1]);
}
export function houseNear(ctx, x, maxDist, opt = {}) { return housesNear(ctx, x, maxDist, opt)[0] || null; }

/** A free bench within maxDist of x (nearest), or null. A bench someone has `taken` is skipped. */
export function benchNear(ctx, x, maxDist) {
  let best = null, bd = maxDist;
  for (const b of (ctx.L && ctx.L.benches) || []) {
    const d = Math.abs(b.x - x);
    if (b.taken || d > bd) continue;
    best = b; bd = d;
  }
  return best;
}

const SURR = new WeakMap();
/**
 * What lies on each side of the street at the spot, one word each: 'houses' | 'shops' | 'park' | 'water' | 'beach' |
 * 'square' | 'open'. { far: the house side (z < 0), near: the camera side }. Cached per spot.
 */
export function surroundings(ctx) {
  const hit = SURR.get(ctx);
  if (hit && ++hit.asked < 60) return hit.v; // recomputed now and then, like the gags' other terrain questions
  const L = ctx.L || {}, W = world(ctx), hb = (L.hw || 2.6) + (L.bw || 0), out = { far: 'open', near: 'open' };
  const houses = L.houses || [], shops = L.shops || [];
  for (const sgn of [-1, 1]) {
    const n = { built: 0, water: 0, beach: 0, park: 0, square: 0 };
    let tot = 0;
    if (W && W.C) {
      const T = tables(W.C);
      for (let off = hb + 1.5; off <= hb + 13; off += 2.5) {
        for (let x = -18; x <= 18; x += 6) {
          tot++;
          const z = sgn * off;
          if (builtAt(ctx, x, z)) { n.built++; continue; }
          const c = groundAt(ctx, x, z);
          if (c === 255) continue;
          if (T.water[c]) n.water++;
          else if (T.beach[c]) n.beach++;
          else if (T.park[c] || treeAt(ctx, x, z, 2)) n.park++;
          else if (T.square[c]) n.square++;
        }
      }
    }
    if (sgn < 0 && houses.length >= 2) { n.built = Math.max(n.built, tot || 1); tot = Math.max(tot, 1); }
    let word = 'open', best = 0;
    if (tot) {
      for (const k of ['water', 'beach', 'park', 'square', 'built']) {
        const f = n[k] / tot;
        if (f >= (k === 'built' ? 0.25 : 0.3) && f > best) { best = f; word = k; }
      }
    }
    if (word === 'built') word = sgn < 0 && shops.length > 0 && shops.length * 3 >= houses.length ? 'shops' : 'houses';
    if (!W && sgn < 0 && houses.length) word = shops.length ? 'shops' : 'houses';
    out[sgn < 0 ? 'far' : 'near'] = word;
  }
  SURR.set(ctx, { v: out, asked: 0 });
  return out;
}

// ---------------------------------------------------------------- the stage scan: where on this spot does a scene fit?
const STAGES = new WeakMap();
/** The pavement's middle line on a side (+1 camera side, -1 house side) at x. */
function padLine(ctx, sgn, x) {
  const L = ctx.L || {};
  if (typeof L.walkAt === 'function') { const z = L.walkAt(sgn, 0.5, (ctx.sc || 0) + x); if (Number.isFinite(z)) return z; }
  const w = sgn < 0 ? L.walkB : L.walkF;
  return w ? (w[0] + w[1]) / 2 : sgn * ((L.hw ?? 2.6) + (L.bw ?? 0) + 1.5);
}
function walkable(ctx, x, z) {
  const W = world(ctx);
  if (!W) return true;
  if (builtAt(ctx, x, z)) return false;
  const c = groundAt(ctx, x, z);
  return c === 255 || !W.C || tables(W.C).walk[c] === 1;
}
const anchorsOf = (ctx, kind) => {
  const L = ctx.L || {};
  switch (kind) {
    case 'door': return (L.houses || []).filter((h) => h.door).map((h) => h.door.x);
    case 'home': return (L.houses || []).filter((h) => h.door && h.leaf && !h.shop && !h.tower).map((h) => h.door.x); // an ordinary front door with a modelled leaf
    case 'shop': return (L.houses || []).filter((h) => h.door && h.leaf && h.shop && h.shop !== 'BANK' && !h.tower).map((h) => h.door.x);
    case 'fish': return (L.stalls || []).filter((a) => a.label === 'HARING' || a.label === 'VIS' || a.label === 'FRIET').map((a) => a.x);
    case 'rack': return (L.racks || []).map((a) => a.x);
    case 'bench': return (L.benches || []).filter((a) => !a.taken).map((a) => a.x);
    case 'bin': return (L.bins || []).map((a) => a.x);
    case 'parked': return (L.parked || []).map((a) => a.x);
    case 'stall': return (L.stalls || []).map((a) => a.x);
    case 'atm': return L.atm ? [L.atm.x] : [];
    default: return [];
  }
};
/** Per column: how long a run of free columns (including this one) reaches each way. */
function runs(free) {
  const n = free.length, left = new Int16Array(n), right = new Int16Array(n);
  for (let i = 0; i < n; i++) left[i] = free[i] ? (i ? left[i - 1] : 0) + 1 : 0;
  for (let i = n - 1; i >= 0; i--) right[i] = free[i] ? (i < n - 1 ? right[i + 1] : 0) + 1 : 0;
  return { left, right };
}
const JUTS = new WeakMap();
/**
 * Does a building stand in the street's own ground on the camera's side within 6 m of x (a block jutting into a square,
 * a pavilion, an old house that stands forward of its row)? The camera films from that side: a scene played there is
 * seen through the building or round it, and whoever steps behind its corner is gone. So the stage scan never takes
 * such a place, and a scene does not borrow a passer-by who walks there. (On the far side such a block is just
 * backdrop.) Ordinary streets have none.
 */
export function jutNear(ctx, x) {
  let J = JUTS.get(ctx);
  if (!J) {
    const L = ctx.L || {}, edge = (L.s0 ?? 0) - 0.5, STEP = 0.5, lo = X0 - 8, n = Math.floor((X1 + 8 - lo) / STEP) + 1, jut = new Uint8Array(n), near = new Uint8Array(n), m = Math.ceil(6 / STEP);
    for (let i = 0; i < n; i++) for (let z = 0.5; z < edge; z += 0.5) if (builtAt(ctx, lo + i * STEP, z)) { jut[i] = 1; break; }
    for (let i = 0; i < n; i++) if (jut[i]) for (let k = Math.max(0, i - m); k <= Math.min(n - 1, i + m); k++) near[k] = 1;
    JUTS.set(ctx, (J = { lo, STEP, n, near }));
  }
  const i = Math.round((x - J.lo) / J.STEP);
  return i >= 0 && i < J.n && J.near[i] === 1;
}
function computeStages(ctx, need) {
  const L = ctx.L || {}, pic = obstacles(ctx), STEP = 0.5;
  const lo = Math.max(X0, pic.lo + 1), hi = Math.min(X1, pic.hi - 1), n = Math.max(1, Math.floor((hi - lo) / STEP) + 1);
  const xs = Array.from({ length: n }, (_, i) => lo + i * STEP);
  const rooms = new Float32Array(n).fill(24), side = new Array(n).fill(null), lane = new Array(n).fill(null);
  const okAll = new Uint8Array(n).fill(1), crowd = new Uint8Array(n);
  const apply = (ok, room, tag) => {
    for (let i = 0; i < n; i++) {
      if (!ok[i]) { okAll[i] = 0; continue; }
      if (room[i] < rooms[i]) rooms[i] = room[i];
      if (tag) tag(i);
    }
  };
  const windowOf = (free, len) => {
    const m = Math.max(1, Math.ceil(len / STEP)), h = Math.ceil(m / 2), { left, right } = runs(free), ok = new Uint8Array(n), room = new Float32Array(n);
    for (let i = 0; i < n; i++) if (left[i] >= h && right[i] >= h) { ok[i] = 1; room[i] = (left[i] + right[i] - 1) * STEP; }
    return { ok, room };
  };
  if (need.pave) {
    const len = need.pave.len ?? 4, depth = need.pave.depth ?? 2, sd = need.pave.side || 'any';
    const sides = sd === 'near' ? [1] : sd === 'far' ? [-1] : [1, -1];
    const best = { ok: new Uint8Array(n), room: new Float32Array(n), side: new Array(n).fill(null), crowd: new Uint8Array(n) };
    for (const sgn of sides) {
      // beside a building that juts into the street on the camera's side, the far side is the one to play on (see jutNear)
      const near = new Uint8Array(n);
      if (sgn > 0) for (let i = 0; i < n; i++) near[i] = jutNear(ctx, xs[i]) ? 1 : 0;
      // per column: the widest clear walking corridor (ground you may walk on, nothing standing in it) on this side of the street,
      // anywhere across the pavement or, on a pedestrian street or square, across the whole width. A lamp post only splits it.
      const free = new Uint8Array(n), lim = L.kind === 'ped' ? -1.5 : Math.max(0.3, (L.hw ?? 2.6) + (L.bw ?? 0) - 0.2); // (beyond the kerb: brick roads and parking bays count as walkable ground)
      for (let i = 0; i < n; i++) {
        const zc = padLine(ctx, sgn, xs[i]);
        let run = 0, widest = 0;
        for (let z = zc - 4; z <= zc + 4 + 1e-6; z += 0.25) {
          if (sgn * z <= lim || !walkable(ctx, xs[i], z) || hitsObst(ctx, xs[i], z, 0.2)) { run = 0; continue; }
          run++;
          if (run > widest) widest = run;
        }
        free[i] = widest > 0 && (widest - 1) * 0.25 + 0.3 >= depth - 1e-6 ? 1 : 0;
      }
      const w = windowOf(free, len);
      for (let i = 0; i < n; i++) if (w.ok[i] && (!best.ok[i] || (best.crowd[i] && !near[i]) || (best.crowd[i] === near[i] && w.room[i] > best.room[i]))) { best.ok[i] = 1; best.room[i] = w.room[i]; best.side[i] = sgn < 0 ? 'far' : 'near'; best.crowd[i] = near[i]; }
    }
    apply(best.ok, best.room, (i) => { side[i] = best.side[i]; });
  }
  if (need.road) {
    const len = need.road.len ?? 12, hw = L.hw ?? 2.6, lim = Math.max(0, hw - 0.95), mid = L.chaseZ ?? 0;
    const zs = [Math.max(-lim, Math.min(lim, mid))];
    for (let z = -lim; z <= lim + 1e-6; z += 0.5) zs.push(z);
    const ok = new Uint8Array(n), room = new Float32Array(n), pick = new Array(n).fill(null);
    for (const z of zs) {
      const free = new Uint8Array(n);
      for (let i = 0; i < n; i++) free[i] = roadAt(ctx, xs[i], z) && roadAt(ctx, xs[i], z + 0.8) && roadAt(ctx, xs[i], z - 0.8) && !hitsObst(ctx, xs[i], z, 0.95) ? 1 : 0;
      const w = windowOf(free, len);
      for (let i = 0; i < n; i++) if (w.ok[i] && (!ok[i] || w.room[i] > room[i] + 0.01 || (Math.abs(w.room[i] - room[i]) <= 0.01 && Math.abs(z - mid) < Math.abs(pick[i] - mid)))) { ok[i] = 1; room[i] = w.room[i]; pick[i] = z; }
    }
    apply(ok, room, (i) => { lane[i] = pick[i]; });
  }
  if (need.cross) {
    const cf = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const za = padLine(ctx, -1, xs[i]), zb = padLine(ctx, 1, xs[i]);
      let ok = 1;
      for (let z = za; z <= zb + 1e-6 && ok; z += 0.5) if ((!roadAt(ctx, xs[i], z) && !walkable(ctx, xs[i], z)) || hitsObst(ctx, xs[i], z, 0.4)) ok = 0;
      cf[i] = ok;
    }
    const reach = Math.max((need.pave?.len ?? need.road?.len ?? 6) / 2, 3) + 3, ok = new Uint8Array(n);
    for (let i = 0; i < n; i++) for (let k = 0; k < n && !ok[i]; k++) if (cf[k] && Math.abs(xs[k] - xs[i]) <= reach) ok[i] = 1;
    apply(ok, new Float32Array(n).fill(24), null);
  }
  const anchor = need.anchor ? anchorsOf(ctx, need.anchor) : null, reach = need.reach ?? 12;
  if (anchor) {
    if (!anchor.length) return [];
    const ok = new Uint8Array(n);
    for (let i = 0; i < n; i++) for (const ax of anchor) if (Math.abs(ax - xs[i]) <= reach) { ok[i] = 1; break; }
    apply(ok, new Float32Array(n).fill(24), null);
  }
  // whatever the scene needs: not beside a building that juts into the street on the camera's side (see jutNear). A scene
  // that fits nowhere else on this spot does not play here.
  for (let i = 0; i < n; i++) crowd[i] = jutNear(ctx, xs[i]) ? 1 : 0;
  const cand = [];
  for (let i = 0; i < n; i++) {
    if (!okAll[i] || crowd[i]) continue;
    let near = Math.abs(xs[i]) * 0.08;
    if (anchor) near = Math.min(...anchor.map((a) => Math.abs(a - xs[i]))) * 0.4;
    cand.push({ x: xs[i], side: side[i], room: rooms[i], lane: lane[i], score: Math.min(rooms[i], 24) - near });
  }
  cand.sort((p, q) => q.score - p.score);
  const out = [];
  for (const c of cand) {
    if (out.length >= 12) break;
    if (out.every((o) => Math.abs(o.x - c.x) >= 3)) out.push(c);
  }
  return out;
}
const needKey = (n) => JSON.stringify(n, (k, v) => (v === undefined ? null : v));
/**
 * Where on this spot can a scene with this `need` play? `need` says what free ground the scene uses:
 *   { pave: { side: 'near' | 'far' | 'any', len, depth },   a clear pavement strip len x depth metres on that side (default 4 x 2)
 *     road: { len },                                       a clear stretch of carriageway for a car (a lane 1.9 m wide, nothing in it)
 *     cross: true,                                         a clear line across the road between the two pavements, near the strip
 *     anchor: 'door' | 'shop' | 'rack' | 'bench' | 'bin' | 'parked' | 'stall' | 'atm' | null, reach }   near one of the spot's anchors (reach 12 m)
 * Returns the placement with the most room { x, side ('near' | 'far' | null), room (metres of clear run), lane (z of a free driving line,
 * with `road`) } or null when it fits nowhere. `avoid`: [{ x, r }] keeps clear of scenes already playing (default 8 m). Cached per spot and need.
 */
export function findStage(ctx, need, avoid = null) {
  if (!need) return { x: 0, side: null, room: 24, lane: null };
  let m = STAGES.get(ctx);
  if (!m) STAGES.set(ctx, (m = new Map()));
  const key = needKey(need);
  let hit = m.get(key);
  if (!hit || ++hit.n >= 40) { hit = { v: computeStages(ctx, need), n: 0 }; m.set(key, hit); }
  for (const c of hit.v) {
    if (avoid && avoid.some((a) => Math.abs(a.x - c.x) < (a.r ?? 8))) continue;
    return { x: c.x, side: c.side, room: c.room, lane: c.lane };
  }
  return null;
}
/** Does the scene fit on this spot at all? (see findStage) */
export const stageClear = (ctx, need, avoid = null) => !!findStage(ctx, need, avoid);

/**
 * How far a car can drive straight from (x0, z0) towards (x1, z1) before it would touch something: the last free pose [x, z]
 * (the start itself when blocked at once). opt: { half, off, ignore }.
 */
export function carReach(ctx, x0, z0, x1, z1, opt = {}) {
  const pic = obstacles(ctx), half = opt.half ?? 1.05, off = opt.off ?? 1.1, ign = opt.ignore && opt.ignore.length ? opt.ignore : null;
  const len = Math.hypot(x1 - x0, z1 - z0) || 1, hd = Math.atan2(x1 - x0, z1 - z0);
  const near = shapesNear(pic, [[x0, z0], [x1, z1]], half + 2), skip = touching(pic, near, [x0, z0], [x1, z1], [x0, z0], [x1, z1], half, off);
  let last = [x0, z0];
  for (let d = 0; d <= len; d += 0.5) {
    const x = x0 + ((x1 - x0) * d) / len, z = z0 + ((z1 - z0) * d) / len;
    if (carHit(ctx, pic, near, skip, ign, x, z, hd, half, off, false)) break;
    last = [x, z];
  }
  return last;
}
