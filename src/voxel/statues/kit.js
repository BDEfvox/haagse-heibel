// Statue kit: draws a landmark recipe (data) as boxes into the tile's feature mesh. Pure functions, no DOM at import.
//
// ============================================================================================================
// STATUE RECIPES: the contract between this kit and the recipe files
// ============================================================================================================
// # Statue recipes: the contract between the kit (src/voxel/statues/kit.js) and the recipe files
// 
// A recipe file is `src/voxel/statues/recipes-<n>.js`:
// 
// ```js
// // One entry per landmark, keyed by its OpenStreetMap id (the ids in src/voxel/statues/ids.json).
// export default {
//   'node/123456': { name: 'Jantje', parts: [ ['plinth', 0.9, 1.1, 0.9, 'stone', 'classic'], ['fig', 0, 1.1, 0, 1.2, 'bronze', 'point', { hat: 'feather', child: true }] ] },
// };
// ```
// 
// Fields of a recipe: `name` (string, for debugging), `parts` (array, drawn in order), optional `face` (compass degrees
// the front looks towards: 0 north, 90 east; leave it out when unknown and the kit turns the front to the nearest street),
// optional `far` (array of parts: a cheap silhouette of at most 6 boxes for distant tiles; the kit derives one when absent).
// 
// Local space: metres, origin on the ground at the landmark's centre, `x` to the viewer's right when looking at the
// front, `y` up, `+z` towards the viewer (the front). A part's `y` is the height of its BOTTOM. Sizes are full sizes
// (w along x, h up, d along z). Keep a whole landmark under about 350 boxes; a normal statue needs 20 to 80.
// 
// Colours: a material name or a hex string. Materials: `bronze` (green-brown patina), `bronzeDark`, `bronzeGold`
// (polished/gilded), `stone` (light grey-beige), `granite` (grey), `granitePink`, `marble` (white), `basalt` (near black),
// `corten` (rust), `steel` (painted dark grey), `stainless` (bright), `concrete`, `brick`, `wood`, `water`, `glass`,
// `white`, `black`, `red`, `blue`, `yellow`, `green`, `orange`.
// 
// ## Parts
// 
// Geometry (everything is made of boxes; `rotY` is degrees about the vertical axis, optional, default 0):
// - `['box', x, y, z, w, h, d, col, rotY]`
// - `['cyl', x, y, z, r, h, col]` upright cylinder (drawn as an octagon of boxes)
// - `['cone', x, y, z, r, h, col]` stepped taper to a point; `['taper', x, y, z, w, d, h, topScale, col, rotY]` a block that narrows to `topScale` (0..1) at the top (obelisks, needles)
// - `['ball', x, y, z, r, col]` stepped sphere, `y` = bottom
// - `['ring', x, y, z, R, t, col, rotY]` upright ring (outer radius R, thickness t), standing on `y`; `['disc', x, y, z, R, t, col, rotY]` upright disc
// - `['arch', x, y, z, w, h, t, d, col, rotY]` a gate: two legs and a lintel (opening w - 2t wide)
// - `['slab', x, y, z, w, h, d, col, rotY, lean]` an upright plate; `lean` degrees tilts it backwards in steps (0 = vertical)
// - `['beam', x0, y0, z0, x1, y1, z1, t, col]` a straight bar of thickness t between two points (drawn as a chain of small boxes): tubes, spikes, diagonal steel
// - `['curve', [[x, y, z], ...], t, col]` a bar through several points (loops, waves, ribbons)
// 
// Bases:
// - `['plinth', w, h, d, col, style]` at the origin; style `plain` | `stepped` (two or three steps then the block) | `classic` (base, shaft, cornice) | `rock` (rough boulder) | `column` (round shaft with capital, w = diameter)
// - `['steps', w, d, n, col]` n low steps at the origin, the top one w x d
// - `['paving', w, d, col]` a flat slab 0.08 m high around the base
// - `['fence', w, d, h, col]` a low railing around the base
// 
// Figures (heights in metres; a life-size adult is 1.8, heroic statues 2.5 to 3.5):
// - `['fig', x, y, z, h, col, pose, opts]`
//   - pose: `stand` | `point` (one arm stretched forward) | `arm-up` (one arm raised) | `arms-up` | `hips` | `read` (book or paper in both hands) | `hold` (see opts.hold) | `sit` (on a chair or block that the kit draws; opts.seat = colour) | `sit-ground` | `kneel` | `lie` | `walk` | `run` | `dance` | `think` (chin on hand, usually with sit) | `salute` | `carry` (something on the shoulder) | `embrace` (use for a pair: draws two figures holding each other) | `fall`
//   - opts (all optional): `rotY`, `robe: true` (long coat, gown or skirt: legs become one block), `cloak: true`, `hat: 'tricorn' | 'tall' | 'cap' | 'helmet' | 'crown' | 'feather' | 'brim' | 'scarf'`, `hair: 'long' | 'bun' | 'mullet' | 'quiff'`, `hold: 'sword' | 'staff' | 'flag' | 'book' | 'paper' | 'hat' | 'wreath' | 'torch' | 'child' | 'bag' | 'ball' | 'fish' | 'basket' | 'bird' | 'instrument' | 'rifle' | 'tool'`, `child: true` (child proportions), `slim: true` (elongated modern figure), `bulky: true` (block-like, heavy), `nude: true` (no clothes detail, smooth), `col2` (second colour for clothes or base), `wings: true`
// - `['bust', x, y, z, h, col, opts]` head and shoulders (opts.hat, opts.hair as above)
// - `['head', x, y, z, h, col]` a head alone
// - `['horse', x, y, z, h, col, opts]` h = height to the top of the horse's head; opts: `rider: <pose or null>`, `riderOpts: {...fig opts}`, `rear: true` (rearing), `rotY`
// - `['animal', kind, x, y, z, size, col, rotY]` kind: `dog` | `cat` | `bird` | `stork` | `heron` | `gull` | `duck` | `swan` | `owl` | `lion` | `horse` | `cow` | `sheep` | `goat` | `pig` | `deer` | `bear` | `seal` | `fish` | `whale` | `frog` | `rabbit` | `elephant` | `monkey` | `turtle` | `snail` | `rhino` ; size = body length
// - `['hand', x, y, z, h, col]`, `['boat', x, y, z, len, col, rotY]`, `['anchor', x, y, z, h, col]`, `['bell', x, y, z, h, col]`, `['cross', x, y, z, h, col]`, `['flame', x, y, z, h]` (glows at night), `['wreath', x, y, z, r, col]`, `['tree', x, y, z, h, col]` (a stylised sculpted tree), `['chair', x, y, z, h, col, rotY]`, `['bench', x, y, z, w, col, rotY]`, `['letters', x, y, z, text, h, col, rotY]` (block capitals, each letter a few boxes; at most 12 characters)
// 
// Walls, plaques, water:
// - `['wall', x, y, z, w, h, d, col, rotY]` a wall (drawn with a slightly darker cap)
// - `['plaque', x, y, z, w, h, col, rotY]` a thin plate with a hint of lettering (lines), for name plates on walls and plinths
// - `['basin', x, y, z, r, h, col, square]` a fountain basin with water in it (square = true for a rectangular one of side 2r)
// - `['jet', x, y, z, h]` a water jet (white-blue, slightly glowing at night); `['pool', x, y, z, w, d]` flat water
// 
// Anything a recipe needs beyond this list: compose it from the geometry parts.
//
// ------------------------------------------------------------------------------------------------------------
// How the kit reads the schema where it was silent
// ------------------------------------------------------------------------------------------------------------
// - fig h: standing height for standing poses; for sit / kneel / sit-ground it is the height of the posed figure
//   (top of the head above `y`); for lie it is the length. `think` sits when opts.seat is given, else stands.
// - sit: opts.seat is a colour. A stone-like seat (stone granite granitePink marble concrete basalt brick, a hex string,
//   or no seat) is drawn as a block; any other (bronze, wood, steel ...) as an armchair with back and arms.
// - The act arm (pointing, raising, holding) is the one at +x. opts.hold attaches to the act hand in any pose; a
//   `stand` figure with a staff, sword, flag, torch, wreath, child ... gets the arm of `hold`.
// - horse: h is the top of the head (ears); the horse faces +z (rotY turns it: 90 faces +x). The rider's pose can be any
//   fig pose except the sitting ones (legs always astride); rider height is 0.74 of the horse.
// - animal: size is the body length, the head points to +z; rotY 90 turns it to +x.
// - Unknown part types, poses, options and materials are ignored with one console warning in dev, never an error.
// - Orientation: the caller decides where the front looks (recipe.face, else a hint about the nearest street, else
//   south = 180); see statueRot().

import { makeRng } from '../kit.js';
import { S, begin, hooks, MATS, POSES, HATS, HAIRS, HOLDS, FIG_OPTS, HORSE_OPTS, PLINTH_STYLES, ANIMALS } from './core.js';
import { runParts, SPEC } from './parts.js';
import { genericParts, fountainParts } from './generic.js';

export { MATS, POSES, HATS, HAIRS, HOLDS, FIG_OPTS, HORSE_OPTS, PLINTH_STYLES, ANIMALS, SPEC, hooks, makeRng };

// ------------------------------------------------------------------ far level of detail
const _far = new WeakMap();
function ext(a, bare) {
  const t = a[0], n = (i) => (typeof a[i] === 'number' ? a[i] : 0);
  switch (t) {
    case 'box': case 'wall': case 'slab': { const r = Math.hypot(n(4), n(6)) / 2; return [n(1) - r, n(2), n(3) - r, n(1) + r, n(2) + n(5), n(3) + r, a[7]]; }
    case 'cyl': case 'cone': return [n(1) - n(4), n(2), n(3) - n(4), n(1) + n(4), n(2) + n(5), n(3) + n(4), a[6]];
    case 'taper': return [n(1) - n(4) / 2, n(2), n(3) - n(5) / 2, n(1) + n(4) / 2, n(2) + n(6), n(3) + n(5) / 2, a[8]];
    case 'ball': return [n(1) - n(4), n(2), n(3) - n(4), n(1) + n(4), n(2) + 2 * n(4), n(3) + n(4), a[5]];
    case 'ring': case 'disc': return [n(1) - n(4), n(2), n(3) - n(4), n(1) + n(4), n(2) + 2 * n(4), n(3) + n(4), a[6]];
    case 'arch': return [n(1) - n(4) / 2, n(2), n(3) - n(7) / 2, n(1) + n(4) / 2, n(2) + n(5), n(3) + n(7) / 2, a[8]];
    case 'beam': { // the near level (limb) draws boxes centred on the line, each t wider than the step: the extent is the end points +- t/2
      const h = bare ? 0 : n(7) / 2;
      return [Math.min(n(1), n(4)) - h, Math.min(n(2), n(5)) - h, Math.min(n(3), n(6)) - h, Math.max(n(1), n(4)) + h, Math.max(n(2), n(5)) + h, Math.max(n(3), n(6)) + h, a[8]];
    }
    case 'curve': { // same for each segment of the polyline, t = a[2]
      if (!Array.isArray(a[1]) || !a[1].length) return null;
      const h = bare ? 0 : n(2) / 2;
      const e = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9, a[3]];
      for (const p of a[1]) for (let k = 0; k < 3; k++) { e[k] = Math.min(e[k], p[k] - h); e[k + 3] = Math.max(e[k + 3], p[k] + h); }
      return e;
    }
    case 'letters': { // parts.js letters(): s.length cells of 4p - p wide, p = h/5, centred on x, depth max(0.04, 0.6p), from y up to y + h
      if (bare) return null;
      const len = String(a[4]).slice(0, 12).length, h = n(5), p = h / 5;
      if (!len) return null;
      const r = Math.hypot(len * 4 * p - p, Math.max(0.04, p * 0.6)) / 2;
      return [n(1) - r, n(2), n(3) - r, n(1) + r, n(2) + h, n(3) + r, a[6]];
    }
    case 'fig': { const h = n(4); return [n(1) - 0.2 * h, n(2), n(3) - 0.15 * h, n(1) + 0.2 * h, n(2) + h, n(3) + 0.15 * h, a[5]]; }
    case 'bust': case 'head': { const h = n(4); return [n(1) - 0.31 * h, n(2), n(3) - 0.15 * h, n(1) + 0.31 * h, n(2) + h, n(3) + 0.15 * h, a[5]]; }
    case 'horse': { const H = n(4), up = a[6] && a[6].rider ? 1.62 : 1; return [n(1) - 0.14 * H, n(2), n(3) - 0.45 * H, n(1) + 0.14 * H, n(2) + H * up, n(3) + 0.45 * H, a[5]]; }
    case 'animal': { const L = n(5); return [n(2) - L * 0.25, n(3), n(4) - L * 0.5, n(2) + L * 0.25, n(3) + L * 0.6, n(4) + L * 0.5, a[6]]; }
    case 'hand': case 'anchor': case 'bell': case 'cross': case 'tree': case 'flame': case 'jet': { const h = n(4); return [n(1) - h * 0.25, n(2), n(3) - h * 0.25, n(1) + h * 0.25, n(2) + h, n(3) + h * 0.25, a[5] || 'stainless']; }
    case 'boat': { const L = n(4); return [n(1) - L * 0.14, n(2), n(3) - L * 0.5, n(1) + L * 0.14, n(2) + L * 0.4, n(3) + L * 0.5, a[5]]; }
    case 'chair': case 'bench': { const w = n(4); return [n(1) - w / 2, n(2), n(3) - w / 3, n(1) + w / 2, n(2) + w * 0.8, n(3) + w / 3, a[5]]; }
    case 'basin': return [n(1) - n(4), n(2), n(3) - n(4), n(1) + n(4), n(2) + n(5), n(3) + n(4), a[6]];
    case 'plaque': return [n(1) - n(4) / 2, n(2), n(3) - 0.02, n(1) + n(4) / 2, n(2) + n(5), n(3) + 0.02, a[6]];
    case 'pool': return [n(1) - n(4) / 2, n(2), n(3) - n(5) / 2, n(1) + n(4) / 2, n(2) + 0.05, n(3) + n(5) / 2, 'water'];
    case 'wreath': return [n(1) - n(4), n(2), n(3) - n(4), n(1) + n(4), n(2) + n(4) * 0.3, n(3) + n(4), a[5]];
    default: return null;
  }
}
/**
 * A 3 to 6 box silhouette for a part list: the plinth and steps, one box for what lies on the ground (walls, basins,
 * low blocks), and the rest as a lower and an upper box, in the colour of its biggest part.
 * `bare` (generic forms and fountains) keeps the old sizes: no thickness for beam and curve, no letters; recipes do not pass it.
 */
export function deriveFar(parts, bare) {
  if (!Array.isArray(parts)) return [];
  const hit = bare ? null : _far.get(parts);
  if (hit) return hit;
  const items = [];
  let top = 0;
  for (const a of parts) {
    if (!Array.isArray(a) || a[0] === 'paving' || a[0] === 'fence') continue;
    if (a[0] === 'plinth') { items.push({ base: 1, e: [-a[1] / 2, 0, -a[3] / 2, a[1] / 2, a[2], a[3] / 2, a[4]] }); top = Math.max(top, a[2]); continue; }
    if (a[0] === 'steps') { const g = (Math.max(1, a[3]) - 1) * 0.7, hh = Math.max(1, a[3]) * 0.15; items.push({ base: 1, e: [-(a[1] + g) / 2, 0, -(a[2] + g) / 2, (a[1] + g) / 2, hh, (a[2] + g) / 2, a[4]] }); continue; }
    const e = ext(a, bare);
    if (e) { items.push({ base: 0, e }); top = Math.max(top, e[4]); }
  }
  const U = (m, e) => { if (!m) return e.slice(0, 6); for (let k = 0; k < 3; k++) { m[k] = Math.min(m[k], e[k]); m[k + 3] = Math.max(m[k + 3], e[k + 3]); } return m; };
  let plinth = null, ground = null, gcol = null, mass = null, mcol = null, mvol = 0;
  for (const it of items) {
    const e = it.e, h = e[4] - e[1];
    if (it.base) { plinth = U(plinth, e); continue; }
    if (e[1] < 0.3 && h < Math.max(1.2, top * 0.3) && e[3] - e[0] > 1.5 * h) { ground = U(ground, e); if (!gcol) gcol = e[6]; continue; }
    mass = U(mass, e);
    const vol = (e[3] - e[0]) * (e[5] - e[2]) * h;
    if (vol >= mvol) { mvol = vol; mcol = e[6]; }
  }
  const col = (c, d) => c || d;
  const box = (e, c, sx = 1) => ['box', (e[0] + e[3]) / 2, e[1], (e[2] + e[5]) / 2, (e[3] - e[0]) * sx, e[4] - e[1], (e[5] - e[2]) * sx, c];
  const res = [];
  if (plinth) { // the plinth and the steps are one base box each at most
    const first = items.find((i) => i.base);
    res.push(box(plinth, col(first && first.e[6], 'stone')));
  }
  if (ground) res.push(box(ground, col(gcol, 'stone')));
  if (mass) {
    const h = mass[4] - mass[1], c = col(mcol, 'stone');
    if (h > 0.9) {
      const cut = mass[1] + h * 0.62;
      res.push(box([mass[0], mass[1], mass[2], mass[3], cut, mass[5]], c, 0.78));
      res.push(box([mass[0], cut, mass[2], mass[3], mass[4], mass[5]], c, 0.5));
    } else res.push(box(mass, c, 0.85));
  }
  if (!res.length) res.push(['box', 0, 0, 0, 1, 1.5, 1, 'stone']);
  if (!bare) _far.set(parts, res);
  return res;
}

// ------------------------------------------------------------------ public drawing functions
function finish(opts) {
  if (opts && opts.out) { opts.out.r = Math.max(0.6, S.r); opts.out.boxes = S.n; }
  return Math.max(0.6, S.maxY);
}

/**
 * Draw a recipe in the builders' current frame (caller does setT / setB). Returns the height in metres.
 * opts: { night, lod (0 close, 1 normal, 2 far), rnd, out: {} (gets r = footprint radius, boxes = count) }.
 */
export function drawStatue(v, gl, recipe, opts) {
  opts = opts || {};
  begin(v, gl, opts.night, opts.lod, opts.rnd);
  const parts = (opts.lod | 0) >= 2 ? (recipe.far && recipe.far.length ? recipe.far : deriveFar(recipe.parts)) : recipe.parts;
  runParts(parts);
  return finish(opts);
}

/** form = the tile's form code (1 statue, 2 bust, 3 abstract, 4 obelisk, 5 war memorial, 6 stone, 7 cross, 8 column, 9 installation, 0 unknown). */
export function drawGeneric(v, gl, form, rnd, opts) {
  opts = opts || {};
  begin(v, gl, opts.night, opts.lod, rnd);
  let parts = genericParts(form, rnd);
  if ((opts.lod | 0) >= 2) parts = deriveFar(parts, true);
  runParts(parts);
  return finish(opts);
}

/** A fountain: its recipe when there is one, else a variant by the feature's dice (f.b above 1 = radius). opts: { lod, rnd, out }. */
export function drawFountain(v, gl, f, recipe, night, opts) {
  opts = opts || {};
  if (recipe) return drawStatue(v, gl, recipe, { night, lod: opts.lod, rnd: opts.rnd, out: opts.out });
  const rnd = opts.rnd || makeRng(Math.imul(Math.round((f.x || 0) * 10), 73856093) ^ Math.imul(Math.round((f.z || 0) * 10), 19349663));
  begin(v, gl, night, opts.lod, rnd);
  let parts = fountainParts(f, rnd);
  if ((opts.lod | 0) >= 2) parts = deriveFar(parts, true);
  runParts(parts);
  return finish(opts);
}

// ------------------------------------------------------------------ orientation
/** Radians for setT(...) so that the statue's front (+z) looks towards compass bearing `face` (0 north, 90 east); default south. */
export function statueRot(face) {
  const f = typeof face === 'number' && isFinite(face) ? face : 180;
  return Math.PI - (f * Math.PI) / 180;
}
/**
 * Compass bearing from (x, z) (tile metres, z to the south) towards the nearest street, or null when none is within `reach`.
 * roads = [{ a: Float32Array of x, z pairs }] as in the tile's `roads`.
 */
export function faceNearestRoad(roads, x, z, reach = 60) {
  let best = reach * reach, bx = 0, bz = 0, found = false;
  for (const r of roads || []) {
    const a = r && r.a;
    if (!a) continue;
    for (let i = 0; i + 3 < a.length; i += 2) {
      const x0 = a[i], z0 = a[i + 1], dx = a[i + 2] - x0, dz = a[i + 3] - z0, l2 = dx * dx + dz * dz;
      let t = l2 > 1e-9 ? ((x - x0) * dx + (z - z0) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = x0 + dx * t, pz = z0 + dz * t, d2 = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d2 < best) { best = d2; bx = px - x; bz = pz - z; found = true; }
    }
  }
  if (!found) return null;
  return ((Math.atan2(bx, -bz) * 180) / Math.PI + 360) % 360;
}
