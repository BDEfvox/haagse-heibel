// Facts about the spot a gag plays on, worked out from what is really there, so a gag never hangs a balcony on a
// tree or lets somebody run through a house. Everything is in street space (x along the street from the spot,
// z across it, negative = far side with the house fronts). Every helper degrades to "unknown, assume clear" when
// the world (`ctx.W`) or one of its functions is missing, so a gag never throws because of a missing fact.
//
//   ctx.W.path.xz(s, v)     street space -> scene x, z      (s = ctx.sc + x)
//   ctx.W.clsAt(x, z)       ground class (ctx.W.C), 255 = unknown
//   ctx.W.solid.get(x, z)   > 0 (and < 255) = a building stands there; 255 = outside the built area
//   ctx.W.treeNear(x, z, r) a tree trunk within r metres

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
/** Do at least `need` of the points along a lane (x from..to, every 4 m) lie on road? */
export function roadHere(ctx, z, from = -20, to = 20, need = 0.6) {
  let n = 0, k = 0;
  for (let x = from; x <= to; x += 4, k++) if (roadAt(ctx, x, z)) n++;
  return k === 0 || n / k >= need;
}

/**
 * Is there room to stand at (x, z) with radius r? Walkable ground (opt.ground 'walk', the default) or any open
 * ground including road ('open'), no building, no water, no tree trunk. Unknown ground counts as clear.
 */
export function clearSpot(ctx, x, z, r = 0.6, opt = {}) {
  const W = world(ctx);
  if (!W) return true;
  const tb = W.C ? tables(W.C)[opt.ground || 'walk'] : null;
  const pts = r > 0 ? [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] : [[0, 0]];
  if (r >= 1) pts.push([r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]);
  for (const [dx, dz] of pts) {
    if (builtAt(ctx, x + dx, z + dz)) return false;
    if (tb) { const c = groundAt(ctx, x + dx, z + dz); if (c !== 255 && !tb[c]) return false; }
  }
  return !(opt.trees !== false && treeAt(ctx, x, z, r + 0.3));
}

const ANG = [0, Math.PI, Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4, (-3 * Math.PI) / 4, Math.PI / 2, -Math.PI / 2];
/**
 * The nearest clear spot to (x, z), nudged mostly along the street (rings of growing radius, squashed across it),
 * or null when nothing within `tries` rings is clear. opt: { ground, bias (+1/-1: try that way along the street first),
 * step (ring spacing, 0.7), flat (how much of the ring is allowed across the street, 0.5) }.
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
/** A spot for an actor to pop in at: open ground (road allowed), a short nudge along the street only. */
export function nudge(ctx, x, z, r = 0.5) {
  return findSpot(ctx, x, z, r, 5, { ground: 'open', flat: 0.25 }) || { x, z };
}

/**
 * How far one can walk (or ride) from x along the line z in direction dir (+1/-1) over open ground, at most `max`
 * metres. Returns the x of the last clear metre (x itself when blocked at once).
 */
export function runway(ctx, x, z, dir, max = 24, r = 0.45) {
  const lo = (ctx.L && ctx.L.x0 != null ? ctx.L.x0 : -24) + 0.5, hi = (ctx.L && ctx.L.x1 != null ? ctx.L.x1 : 24) - 0.5;
  let last = x;
  for (let d = 1; d <= max; d++) {
    const cx = x + dir * d;
    if (cx < lo || cx > hi) { last = dir > 0 ? hi : lo; break; }
    if (!clearSpot(ctx, cx, z, r, { ground: 'open' })) break;
    last = cx;
  }
  return last;
}

/** Is the straight line between two street-space points open ground all the way (sampled every metre)? */
export function lineClear(ctx, x0, z0, x1, z1, r = 0.45) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!clearSpot(ctx, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, r, { ground: 'open' })) return false;
  }
  return true;
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
