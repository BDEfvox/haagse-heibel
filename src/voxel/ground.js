// "May something stand here, and how high is the ground under it?" The one question the crowd, the scenes and the
// walking character ask about the city (W.ground.at). It reads one byte per half-metre cell of every finest-level tile (256 KB a
// tile; the same on a phone), built when the tile is built (buildOcc), saying what stands there:
//   BUILDING  what the tile DRAWS of a building, not only its footprint: the ring, the street fronts and their backs (frontsOf),
//             the rect cover b.rects (drawGeneric, the typed drawers); also the parts of a neighbouring tile's buildings that
//             reach into this tile (spill, joined when either tile is registered: joinOcc)
//   WATER     the ground class WATER / SEA
//   BARRIER   fences, walls and hedges of the map (t.x)
//   FEATURE   statues, fountains, shelters (the props the map's features became)
//   FURN      street furniture by its drawn size (FOOT below), and every table of a terrace (`cells` of furnishTile)
//   POST      lamp posts, tree trunks, bollards, masts
//   PARKED    parked cars and the parked bikes of groups: not in the raster but asked of the crowd (`dyn.parkedAt`), which owns them
// A tile without the raster (not at the finest level) answers from its ground class only (buildings, water).
// Nothing here draws a random number or changes what the city builds.

export const BUILDING = 1, WATER = 2, BARRIER = 4, FEATURE = 8, FURN = 16, POST = 32, PARKED = 64;
/** The standing things (scenes keep their own picture of them, with wider clearances). */
export const STANDING = FEATURE | FURN | POST | PARKED;
/** Everything: `at(x, z, r, who, ALL)` is the height under the footprint whatever stands there. */
export const ALL = 127;
/** Who asks: a person (or anyone on foot), or a wheel (a rail bar counts as the road it lies in). */
export const PERSON = 0, WHEEL = 1;

const TILE = 256, OCC_CELL = 0.5, OCC_N = TILE / OCC_CELL;
// what each kind of furniture covers on the ground: [half length along its `a` axis, half width along its `n` axis]
// (0 width = a round thing of that radius). Sizes from the drawing code of furnish.js / props.js.
const FOOT = {
  bench: [0.95, 0.32], bin: [0.3, 0], box: [0.5, 0.35], mailbox: [0.3, 0.25], rack: [1.6, 0.85], stall: [1.4, 0.9],
  stop: [1.7, 0.75], mstall: [1.5, 1.0], kiosk: [1.7, 1.5], picnic: [0.9, 0.75], orac: [0.45, 0], column: [0.6, 0],
  mupi: [0.65, 0.22], meter: [0.18, 0], charger: [0.3, 0], trolleys: [1.3, 0.55], rackpark: [2.2, 1.1], mast: [0.15, 0],
  tlight: [0.15, 0], statue: [1.0, 0], fountain: [2.2, 0], shelter: [1.7, 0.75], hydrant: [0.2, 0], bollard: [0.12, 0],
  planter: [0.55, 0.45], lamp: [0.15, 0], pole: [0.12, 0], stand: [1.1, 0.7], parasol: [0.12, 0],
};
const FEAT = new Set(['statue', 'fountain', 'stop', 'shelter']);
const POSTK = new Set(['mast', 'tlight', 'hydrant', 'bollard', 'lamp', 'pole', 'parasol', 'meter']);
const NOT = new Set(['sign', 'terrace', 'island', 'terr']); // (terraces come table by table from `cells`; signs and islands stand nowhere)

// ---------------------------------------------------------------- the raster
/** OR `bit` into the cells (of a w x h raster of `cell` metres) whose centre lies inside the polygon (flat [x, z, ...], tile metres). */
const XS = []; // (scratch of fillPoly)
export function fillPoly(occ, w, h, cell, flat, bit) {
  const n = flat.length >> 1;
  if (n < 3) return;
  let z0 = Infinity, z1 = -Infinity;
  for (let i = 1; i < flat.length; i += 2) { if (flat[i] < z0) z0 = flat[i]; if (flat[i] > z1) z1 = flat[i]; }
  const j0 = Math.max(0, Math.floor(z0 / cell - 0.5)), j1 = Math.min(h - 1, Math.ceil(z1 / cell));
  const xs = XS;
  for (let j = j0; j <= j1; j++) {
    const zc = (j + 0.5) * cell;
    xs.length = 0;
    for (let i = 0, k = n - 1; i < n; k = i++) {
      const za = flat[k * 2 + 1], zb = flat[i * 2 + 1];
      if ((za <= zc) === (zb <= zc)) continue;
      xs.push(flat[k * 2] + ((zc - za) / (zb - za)) * (flat[i * 2] - flat[k * 2]));
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] / cell - 0.5)), i1 = Math.min(w - 1, Math.floor(xs[k + 1] / cell - 0.5));
      for (let i = i0, o = j * w + i0; i <= i1; i++, o++) occ[o] |= bit;
    }
  }
}
/** OR `bit` into the cells whose centre lies within r of (x, z). */
export function fillDisc(occ, w, h, cell, x, z, r, bit) {
  r = Math.max(r, cell * 0.71); // (a thin post still takes the cell it stands in)
  const j0 = Math.max(0, Math.floor((z - r) / cell)), j1 = Math.min(h - 1, Math.floor((z + r) / cell));
  for (let j = j0; j <= j1; j++) {
    const dz = (j + 0.5) * cell - z, q = r * r - dz * dz;
    if (q < 0) continue;
    const hw = Math.sqrt(q), i0 = Math.max(0, Math.ceil((x - hw) / cell - 0.5)), i1 = Math.min(w - 1, Math.floor((x + hw) / cell - 0.5));
    for (let i = i0, o = j * w + i0; i <= i1; i++, o++) occ[o] |= bit;
  }
}
/** The corners of an oriented box: centre, unit axis (ax, az), half length along it, half width across. */
export function boxPoly(cx, cz, ax, az, hl, hw) {
  const nx = -az, nz = ax;
  return [cx + ax * hl + nx * hw, cz + az * hl + nz * hw, cx - ax * hl + nx * hw, cz - az * hl + nz * hw, cx - ax * hl - nx * hw, cz - az * hl - nz * hw, cx + ax * hl - nx * hw, cz + az * hl - nz * hw];
}
/** The polygons a building is drawn as, in tile metres: ring, rect cover, street fronts and backs (see the header). */
function drawnPolys(b, units) {
  const out = [], o = b.o;
  const flat = []; for (const p of b.ring) flat.push(p[0], p[1]);
  out.push(flat);
  if (b.parts) return out; // (drawn from its parts, inside the ring)
  for (const r of b.rects) { const cx = o.cx + r.x * o.ux - r.z * o.uz, cz = o.cz + r.x * o.uz + r.z * o.ux; out.push(boxPoly(cx, cz, o.ux, o.uz, r.w / 2, r.d / 2)); }
  if (units) for (const u of units) {
    out.push(boxPoly(u.cx, u.cz, -u.nz, u.nx, u.w / 2, u.d / 2));
    if (u.backs) { const k = u.backs, ux = Math.cos(k.th), uz = -Math.sin(k.th); for (const r of k.list) out.push(boxPoly(k.cx + r.x * ux - r.z * uz, k.cz + r.x * uz + r.z * ux, ux, uz, r.w / 2, r.d / 2)); }
  }
  return out;
}
const outside = (flat, m) => { for (let i = 0; i < flat.length; i += 2) if (flat[i] < m || flat[i] > TILE - m || flat[i + 1] < m || flat[i + 1] > TILE - m) return true; return false; };

/**
 * The raster of one finest-level tile. o: { grid, C, buildings: [{ ring, o, rects, parts, bi }], fronts (frontsOf result or null),
 * props, cells (terrace table centres [x, z, ...]), trees (flat [x, z, size]), lamps (lampsOf: { a: [x, z, dx, dz, kind] }), barriers (t.x) }.
 * Returns { occ, spill }: spill = the drawn polygons of this tile's buildings that reach beyond its edges (tile metres).
 */
export function buildOcc(o) {
  // always half-metre cells (a phone's ground grid is 1 m: its classes are read under each half-metre cell)
  const g = o.grid, w = OCC_N, h = OCC_N, cell = OCC_CELL, a = g.a, C = o.C, occ = new Uint8Array(w * h), f = g.cell / cell;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = a[Math.floor(j / f) * g.w + Math.floor(i / f)]; if (k === C.BUILDING) occ[j * w + i] = BUILDING; else if (k === C.WATER || k === C.SEA) occ[j * w + i] = WATER; }
  const spill = [];
  for (const b of o.buildings) {
    const units = o.fronts ? o.fronts.byB.get(b.bi) || null : null;
    const P = drawnPolys(b, units);
    // (the ring itself is already there: it is the ground class BUILDING; only what is drawn beyond it, and what reaches out of the tile)
    for (let k = 0; k < P.length; k++) { const out = outside(P[k], 0); if (k || out) fillPoly(occ, w, h, cell, P[k], BUILDING); if (out) spill.push(P[k]); }
  }
  for (const e of o.barriers || []) {
    const th = [0.3, 0.3, 0.08, 0.8, 0.6][e[0]] ?? 0.3;
    for (let i = 2; i + 3 < e.length; i += 2) {
      const x0 = e[i] / 10, z0 = TILE - e[i + 1] / 10, x1 = e[i + 2] / 10, z1 = TILE - e[i + 3] / 10, l = Math.hypot(x1 - x0, z1 - z0);
      if (!(l > 0.01)) continue;
      fillPoly(occ, w, h, cell, boxPoly((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / l, (z1 - z0) / l, l / 2 + 0.05, Math.max(th / 2 + 0.05, cell * 0.71)), BARRIER); // (a thin fence still takes its cells)
    }
  }
  for (const q of o.props || []) {
    if (q.kind === 'terrace') { fillDisc(occ, w, h, cell, q.x, q.z, 0.85, FURN); continue; } // (an anchor between two tables: the chairs meet there)
    if (NOT.has(q.kind)) continue;
    const f = FOOT[q.kind], bit = FEAT.has(q.kind) ? FEATURE : POSTK.has(q.kind) ? POST : FURN;
    if (!f) { fillDisc(occ, w, h, cell, q.x, q.z, 0.4, bit); continue; } // (an unknown kind: a small round thing)
    if (!f[1]) { fillDisc(occ, w, h, cell, q.x, q.z, f[0], bit); continue; }
    let ax = q.ax, az = q.az;
    const l = Math.hypot(ax, az);
    if (l > 1e-6) { ax /= l; az /= l; } else { ax = 1; az = 0; }
    fillPoly(occ, w, h, cell, boxPoly(q.x, q.z, ax, az, f[0], f[1]), bit);
  }
  const cells = o.cells || [];
  for (let i = 0; i + 1 < cells.length; i += 2) fillDisc(occ, w, h, cell, cells[i], cells[i + 1], 0.95, FURN);
  const tr = o.trees || [];
  for (let i = 0; i + 2 < tr.length; i += 3) fillDisc(occ, w, h, cell, tr[i], tr[i + 1], 0.3, POST);
  const L = o.lamps && o.lamps.a;
  if (L) for (let i = 0; i + 4 < L.length; i += 5) fillDisc(occ, w, h, cell, L[i], L[i + 1], 0.18, POST);
  return { occ, spill };
}
/** The drawn polygons of a tile's buildings that reach beyond its edges (any level of detail: a neighbour at the finest level wants them). */
export function spillOf(buildings, fronts) {
  const spill = [];
  for (const b of buildings) for (const p of drawnPolys(b, fronts ? fronts.byB.get(b.bi) || null : null)) if (outside(p, 0)) spill.push(p);
  return spill;
}
/**
 * A tile was registered (`_byNum`): paint its buildings' spill into the rasters of its neighbours, and theirs into its own.
 * at(tx, ty): the registered tile there, or null.
 */
export function joinOcc(c, at) {
  const [tx, ty] = c.key.split('_').map(Number);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    if (!a && !b) continue;
    const n = at(tx + a, ty + b);
    if (!n || n === c) continue;
    if (c.occ && n.spill && n.spill.length) paintSpill(c, n);
    if (n.occ && c.spill && c.spill.length) paintSpill(n, c);
  }
}
function paintSpill(dst, src) {
  const dx = src.ox - dst.ox, dz = dst.oy - src.oy; // tile metres of src -> tile metres of dst
  for (const p of src.spill) {
    const q = new Array(p.length);
    for (let i = 0; i < p.length; i += 2) { q[i] = p[i] + dx; q[i + 1] = p[i + 1] + dz; }
    fillPoly(dst.occ, OCC_N, OCC_N, OCC_CELL, q, BUILDING);
  }
}

// ---------------------------------------------------------------- the question
/**
 * The ground of one street's scene frame. deps: { frame (f: ox, oy, dx, dy), city (landAt, waterAt), tileAt (mx, my) -> built tile,
 * C, WET, STEP }. `dyn` (set by the crowd): parkedAt(x, z) -> true when a parked car or a group's bike stands at scene (x, z).
 */
export function makeGround({ frame, city, tileAt, C, WET }) {
  const G = {
    dyn: null,
    /** the ground class at the centre of the last `at` (255 = no tile), and the blocker bits found at the point that answered */
    cls: 255, bits: 0,
    /**
     * May something of radius r stand at scene (x, z), and how high is the ground under it? Returns the height of the highest ground
     * under its footprint (the centre and four points at r: a foot on a kerb lifts the figure onto it), or NaN when it may not stand
     * there. who: PERSON | WHEEL (a rail bar counts as the road it lies in). ignore: blocker bits to leave out (ALL: height only).
     */
    at(x, z, r = 0.25, who = PERSON, ignore = 0) {
      let h = pt(x, z, who, ignore);
      if (h !== h || !(r > 0)) return h;
      const c0 = G.cls, b0 = G.bits;
      for (let k = 0; k < 4; k++) {
        const hk = pt(k === 0 ? x + r : k === 1 ? x - r : x, k === 2 ? z + r : k === 3 ? z - r : z, who, ignore);
        if (hk !== hk) { G.cls = c0; return NaN; }
        if (hk > h) h = hk;
      }
      G.cls = c0; G.bits = b0;
      return h;
    },
    /** Is the raster there (the tile at scene (x, z) is built at its finest level)? */
    ready(x, z) { const c = tileAt(frame.ox + x * frame.dx + z * frame.dy, frame.oy + x * frame.dy - z * frame.dx); return !!(c && c.occ); },
    /**
     * Which way is free from (x, z): a unit vector [nx, nz] pointing away from what blocks within r + 0.35 (eight probes; [0, 0] when
     * nothing does). A walking character slides along the edge by keeping the part of its step across this normal that does not point
     * into it.
     */
    away(x, z, r = 0.25, who = PERSON, ignore = 0) {
      let nx = 0, nz = 0;
      const d = r + 0.35;
      for (let k = 0; k < 8; k++) { const an = (k * Math.PI) / 4, sx = Math.sin(an), sz = Math.cos(an), v = pt(x + sx * d, z + sz * d, who, ignore); if (v !== v) { nx -= sx; nz -= sz; } }
      const l = Math.hypot(nx, nz);
      return l > 1e-6 ? [nx / l, nz / l] : [0, 0];
    },
  };
  function pt(x, z, who, ign) {
    const mx = frame.ox + x * frame.dx + z * frame.dy, my = frame.oy + x * frame.dy - z * frame.dx, c = tileAt(mx, my);
    if (!(ign & PARKED) && G.dyn && G.dyn.parkedAt(x, z)) { G.bits = PARKED; return NaN; }
    if (!c) { G.cls = 255; G.bits = 0; return city.landAt(mx, my) + 0.14; }
    const g = c.grid, i = Math.floor((mx - c.ox) / g.cell), j = Math.floor((c.oy + TILE - my) / g.cell);
    if (i < 0 || j < 0 || i >= g.w || j >= g.h) { G.cls = 255; G.bits = 0; return city.landAt(mx, my) + 0.14; }
    const q = j * g.w + i, cls = g.a[q], bits = c.occ ? c.occ[Math.floor((c.oy + TILE - my) / OCC_CELL) * OCC_N + Math.floor((mx - c.ox) / OCC_CELL)] : cls === C.BUILDING ? BUILDING : WET[cls] ? WATER : 0;
    G.cls = cls; G.bits = bits;
    if (bits & ~ign) return NaN;
    if (WET[cls]) return city.waterAt(mx, my);
    return city.landAt(mx, my) + (who === WHEEL && cls === C.RAIL ? 0 : g.off[q]);
  }
  return G;
}
