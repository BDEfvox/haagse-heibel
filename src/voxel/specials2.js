// Hand-made drawers for real buildings of The Hague, set 2: the skyline towers, the city hall, three palaces,
// the Kunstmuseum and the Scheveningen pier. Pure drawing code (see landmarks.js for the conventions):
// everything arrives through the arguments (c = building context, K = kit of helpers).
// Orientation is never assumed. Anything placed by "where it is on the map" goes through frame(): a point given as
// (east, north) metres from the footprint's centre of mass is turned into the local frame with c.compass.


/** Map offsets (metres east / north of the footprint's centre of mass) <-> the local frame. */
function frame(c) {
  const E = c.compass(90), N = c.compass(0);
  let a = 0, sx = 0, sz = 0;
  for (const r of c.rects) { const s = r.w * r.d; a += s; sx += r.x * s; sz += r.z * s; }
  const gx = a ? sx / a : 0, gz = a ? sz / a : 0;
  return {
    gx, gz, E, N,
    toMap: (x, z) => [(x - gx) * E[0] + (z - gz) * E[1], (x - gx) * N[0] + (z - gz) * N[1]],
    toLoc: (e, n) => [gx + e * E[0] + n * N[0], gz + e * E[1] + n * N[1]],
  };
}
/** Point in polygon (flat pairs). */
function pip(poly, e, n) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > n) !== (yj > n) && e < ((xj - xi) * (n - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/**
 * Cut the real footprint into rectangles per zone (polygons in map offsets, first match wins, the rest is 'rest').
 * Samples cells of about cs metres with c.inside, merges them into runs and then into blocks.
 * Without a working c.inside it falls back to sorting c.rects by their centres.
 */
function split(c, f, cs, zones) {
  const out = { rest: [] };
  for (const [k] of zones) out[k] = [];
  const key = (x, z) => {
    const [e, n] = f.toMap(x, z);
    for (const [k, poly] of zones) if (pip(poly, e, n)) return k;
    return 'rest';
  };
  const all = [];
  if (typeof c.inside === 'function') {
    const B = bound(c.rects);
    const nx = Math.max(1, Math.ceil(B.w / cs)), nz = Math.max(1, Math.ceil(B.d / cs)), sx = B.w / nx, sz = B.d / nz;
    let prev = new Map();
    for (let j = 0; j < nz; j++) {
      const z = B.z0 + (j + 0.5) * sz, cur = new Map();
      let i = 0;
      while (i < nx) {
        const x = B.x0 + (i + 0.5) * sx;
        if (!c.inside(x, z)) { i++; continue; }
        const k = key(x, z);
        let i1 = i;
        while (i1 + 1 < nx) {
          const xx = B.x0 + (i1 + 1.5) * sx;
          if (!c.inside(xx, z) || key(xx, z) !== k) break;
          i1++;
        }
        const id = i + ':' + i1 + ':' + k, ex = prev.get(id);
        if (ex) { ex.z1 = z + sz / 2; cur.set(id, ex); } else {
          const r = { k, x0: B.x0 + i * sx, x1: B.x0 + (i1 + 1) * sx, z0: z - sz / 2, z1: z + sz / 2 };
          cur.set(id, r); all.push(r);
        }
        i = i1 + 1;
      }
      prev = cur;
    }
  }
  if (all.length) for (const r of all) out[r.k].push({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, w: r.x1 - r.x0, d: r.z1 - r.z0 });
  else for (const r of c.rects) out[key(r.x, r.z)].push(r); // no usable c.inside: sort the footprint rects instead
  // a zone that came out empty (footprint rects too coarse): give it the rect nearest to its middle
  for (const [k, poly] of zones) {
    if (out[k].length) continue;
    let ce = 0, cn = 0;
    for (const p of poly) { ce += p[0]; cn += p[1]; }
    const [lx, lz] = f.toLoc(ce / poly.length, cn / poly.length);
    let best = null, bd = Infinity;
    for (const r of c.rects) { const d = Math.hypot(r.x - lx, r.z - lz); if (d < bd) { bd = d; best = r; } }
    if (best) out[k].push(best);
  }
  return out;
}
const cellSize = (c) => Math.max(2.5, Math.min(4.5, Math.sqrt(c.area || c.L * c.D) / 10));

/** Bounding rectangle of a list of rects. */
function bound(list) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const r of list) {
    x0 = Math.min(x0, r.x - r.w / 2); x1 = Math.max(x1, r.x + r.w / 2);
    z0 = Math.min(z0, r.z - r.d / 2); z1 = Math.max(z1, r.z + r.d / 2);
  }
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, x0, x1, z0, z1 };
}
const inRects = (list, x, z) => list.some((r) => Math.abs(x - r.x) <= r.w / 2 + 0.01 && Math.abs(z - r.z) <= r.d / 2 + 0.01);

/** The facade of the footprint facing a compass bearing, found by walking out from the centre of mass until the footprint
 *  ends (so the middle of a courtyard plan is the middle front, not a wing tip). put() draws a box relative to it
 *  (a = offset along the facade, o = offset OUTWARD from the wall, dp = depth, wa = width along it). */
function facade(c, deg) {
  const [dx, dz] = c.compass(deg);
  const ax = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
  const s = (ax === 'x' ? dx : dz) >= 0 ? 1 : -1;
  const f = frame(c);
  const at = (p, q) => (ax === 'x' ? [p, q] : [q, p]);
  let p = ax === 'x' ? f.gx : f.gz, mid = ax === 'x' ? f.gz : f.gx;
  if (!inRects(c.rects, ...at(p, mid))) { p = ax === 'x' ? c.main.x : c.main.z; mid = ax === 'x' ? c.main.z : c.main.x; }
  for (let i = 0; i < 600 && inRects(c.rects, ...at(p + s * 0.5, mid)); i++) p += s * 0.5;
  const pos = p;
  let lo = mid, hi = mid;
  for (let i = 0; i < 400 && inRects(c.rects, ...at(pos - s * 0.8, lo - 0.5)); i++) lo -= 0.5;
  for (let i = 0; i < 400 && inRects(c.rects, ...at(pos - s * 0.8, hi + 0.5)); i++) hi += 0.5;
  mid = (lo + hi) / 2;
  const span = hi - lo;
  const put = (b, a, y, o, wa, h, dp, col, vary) => {
    const pp = pos + s * o, q = mid + a;
    if (ax === 'z') b.box(q, y, pp, wa, h, dp, col, vary);
    else b.box(pp, y, q, dp, h, wa, col, vary);
  };
  const [fx, fz] = at(pos, mid);
  return { ax, s, pos, mid, span, put, x: fx, z: fz };
}
/** Stepped triangular pediment on a facade. */
function pediment(f, v, y, wid, rise, col) {
  const n = Math.max(3, Math.round(rise / 0.7));
  for (let i = 0; i < n; i++) f.put(v, 0, y + (i * rise) / n, 0.45, wid * (1 - i / n), rise / n, 1.1, col, 0.02);
}
const walls = (c, list, h, col, mode, vary = 0.035) => {
  for (const r of list) { c.v.setW(mode); c.v.box(r.x, 0, r.z, r.w, h, r.d, col, vary); c.v.setW(0); }
};
const lid = (c, list, h, col) => {
  for (const r of list) {
    c.v.box(r.x, h, r.z, r.w + 0.2, 0.35, r.d + 0.2, K_shade(col, 0.85));
    if (Math.min(r.w, r.d) > 2.5) c.v.box(r.x, h + 0.35, r.z, r.w - 0.6, 0.08, r.d - 0.6, '#555a62');
  }
};
let K_shade = (col) => col; // set from K on every draw

/** Tower crown made of shrinking steps on top of a rect. Returns the tip height. */
function stepCrown(c, B, y, steps, col, shrink = 0.8) {
  let yy = y, k = 1;
  for (const h of steps) {
    k *= shrink;
    c.v.box(B.x, yy, B.z, Math.max(1.2, B.w * k), h, Math.max(1.2, B.d * k), col, 0.02);
    yy += h;
  }
  return yy;
}

// ---------------------------------------------------------------------------------------------------- Hoftoren
// Zones in metres east/north of the centre of mass of the footprint.
const HOF_TOWER = [[-48, 4], [-38, -8], [-36, -11], [-26, -25], [-20, -28], [-12, -23], [-7, -29], [4, -20], [-3, -12], [-5, -11], [-25, 7], [-29, 8], [-43, 7], [-46, 2]];
const HOF_WING = [[-2, -12], [4, -20], [33, 3], [32, 11], [24, 25], [21, 32], [6, 54], [0, 60], [-3, 59], [-4, 50], [-3, 42], [10, 20], [11, 15], [9, 8], [-2, -7]];

function hoftoren(c, K) {
  const { v, gl, night } = c;
  K_shade = K.shade;
  const f = frame(c);
  const z = split(c, f, cellSize(c), [['t', HOF_TOWER], ['w', HOF_WING]]);
  const tw = z.t, wg = z.w, rest = z.rest;
  const Ht = 142, cut = 38, hs = Ht - cut, Hw = 65, Hb = 22;
  // low base and the wing
  walls(c, rest, Hb, '#d8d2c2', 1); lid(c, rest, Hb, '#d8d2c2');
  walls(c, wg, Hw, '#c9cdc8', 2, 0.02); lid(c, wg, Hw, '#c9cdc8');
  // the slim glass slab
  walls(c, tw, hs, '#86a29a', 2, 0.02);
  for (const r of tw) for (const y of [hs * 0.34, hs * 0.67]) v.box(r.x, y, r.z, r.w + 0.3, 0.9, r.d + 0.3, '#d8d4c6');
  // the slanted top: columns that rise towards the high (south) end, ending in a needle
  const B = bound(tw), u = c.compass(180), cs = Math.max(3.5, Math.sqrt((B.w * B.d) / 55));
  const cells = [];
  for (let x = B.x0 + cs / 2; x < B.x1; x += cs) for (let z = B.z0 + cs / 2; z < B.z1; z += cs) {
    if (inRects(tw, x, z)) cells.push({ x, z, t: x * u[0] + z * u[1] });
  }
  let tMin = Infinity, tMax = -Infinity;
  for (const q of cells) { tMin = Math.min(tMin, q.t); tMax = Math.max(tMax, q.t); }
  let peak = null;
  for (const q of cells) {
    const k = tMax > tMin ? (q.t - tMin) / (tMax - tMin) : 1, h = 2 + (cut - 11) * k;
    v.box(q.x, hs, q.z, cs + 0.05, h, cs + 0.05, k > 0.5 ? '#9db8b0' : '#86a29a', 0.02);
    if (!peak || q.t > peak.t) peak = { ...q, h };
  }
  let top = Ht;
  if (peak) {
    v.box(peak.x, hs + peak.h, peak.z, 1.4, 4, 1.4, '#d8d4c6');
    v.box(peak.x, hs + peak.h + 4, peak.z, 0.5, 8, 0.5, '#c8cdd2');
    (night ? gl : v).box(peak.x, hs + peak.h + 12, peak.z, 0.6, 0.6, 0.6, night ? '#ff4040' : '#c8cdd2');
    top = hs + peak.h + 13;
  }
  c.tag(top);
  return true;
}

// ---------------------------------------------------------------------------------------------------- Strijkijzer
function strijkijzer(c, K) {
  const { v, gl, night } = c;
  K_shade = K.shade;
  const H = Math.max(c.h, 128), hc = H - 12;
  // podium and brick shaft
  walls(c, c.rects, 7, '#a0867a', 1, 0.03);
  for (const r of c.rects) {
    v.setW(1);
    v.box(r.x, 7, r.z, r.w - 0.3, hc - 7, r.d - 0.3, '#8a4a3a', 0.04);
    v.setW(0);
    for (const y of [hc * 0.33, hc * 0.66]) v.box(r.x, y, r.z, r.w, 0.7, r.d, '#b78b78');
    v.box(r.x, hc - 0.8, r.z, r.w + 0.3, 0.8, r.d + 0.3, '#b78b78');
  }
  // the glass crown: a slender lantern, stepping in
  const B = bound(c.rects);
  const gy = hc;
  v.box(B.x, gy, B.z, B.w * 0.9, 8, B.d * 0.9, '#9fd0e6', 0.02);
  v.box(B.x, gy + 8, B.z, B.w * 0.7, 2.5, B.d * 0.7, '#8fbcd2', 0.02);
  if (night) gl.box(B.x, gy + 0.5, B.z, B.w * 0.75, 7, B.d * 0.75, '#bfe6ff');
  v.box(B.x, gy + 10.5, B.z, B.w * 0.9, 0.6, B.d * 0.9, '#c8cdd2');
  v.box(B.x, gy + 11.1, B.z, 0.35, 5, 0.35, '#c8cdd2');
  (night ? gl : v).box(B.x, gy + 16.1, B.z, 0.55, 0.55, 0.55, night ? '#ff4040' : '#c8cdd2');
  c.tag(gy + 17);
  return true;
}

// ---------------------------------------------------------------------------------------------------- Zurichtoren
const ZUR_TOWER = [[-3, 24], [15, 27], [24, 14], [17, -2], [1, -4], [-10, 10]];

function zurichtoren(c, K) {
  const { v, gl, night } = c;
  K_shade = K.shade;
  const f = frame(c);
  const z = split(c, f, cellSize(c), [['t', ZUR_TOWER]]);
  const tw = z.t, rest = z.rest;
  const Hw = 58;
  walls(c, rest, 22, '#a85a3f', 1); lid(c, rest, 22, '#a85a3f');
  for (const r of tw) {
    v.setW(1);
    v.box(r.x, 0, r.z, r.w, Hw, r.d, '#9c4a37', 0.04);
    v.setW(0);
    v.box(r.x, Hw * 0.5, r.z, r.w + 0.25, 0.7, r.d + 0.25, '#c9b79c');
  }
  const B = bound(tw);
  // eaves, then the "lemon squeezer": a pointed pavilion roof that narrows on a hollow curve
  v.box(B.x, Hw, B.z, B.w + 1.6, 1.1, B.d + 1.6, '#c9b79c');
  v.box(B.x, Hw + 1.1, B.z, B.w + 0.6, 0.8, B.d + 0.6, '#5d646d');
  const n = 11, hr = 24, y0 = Hw + 1.9;
  for (let i = 0; i < n; i++) {
    const s = Math.pow(1 - i / n, 1.45);
    v.box(B.x, y0 + (i * hr) / n, B.z, Math.max(0.9, (B.w + 0.2) * s), hr / n + 0.02, Math.max(0.9, (B.d + 0.2) * s), i % 2 ? '#7f9a96' : '#8aa6a2', 0.02);
  }
  v.box(B.x, y0 + hr, B.z, 0.3, 4, 0.3, '#c8cdd2');
  (night ? gl : v).box(B.x, y0 + hr + 4, B.z, 0.45, 0.45, 0.45, night ? '#ff4040' : '#c8cdd2');
  c.tag(y0 + hr + 5);
  return true;
}

// ---------------------------------------------------------------------------------------------------- Castalia
const CAS_W1 = [[-18, 6], [-4, -13], [-22, -27], [-36, -8]];
const CAS_M = [[-12, 10], [3, -8], [-4, -13], [-18, 6]];
const CAS_W2 = [[6, 24], [21, 5], [3, -8], [-12, 10]];

function castalia(c, K) {
  const { v } = c;
  K_shade = K.shade;
  const f = frame(c);
  const z = split(c, f, cellSize(c), [['w1', CAS_W1], ['w2', CAS_W2], ['m', CAS_M]]);
  const w1 = z.w1, w2 = z.w2, mid = z.m, rest = z.rest;
  const Hw = 70, Hm = 82, rise = 34, brick = '#7b3b30';
  walls(c, rest, 30, '#8a4a3a', 1); lid(c, rest, 30, '#8a4a3a');
  walls(c, mid, Hm, brick, 1); lid(c, mid, Hm, brick);
  for (const r of mid) v.box(r.x, Hm - 1.4, r.z, r.w + 0.3, 0.8, r.d + 0.3, '#c9b79c');
  for (const list of [w1, w2]) {
    walls(c, list, Hw, brick, 1);
    const B = bound(list);
    for (const r of list) v.box(r.x, Hw - 1.2, r.z, r.w + 0.3, 0.8, r.d + 0.3, '#c9b79c');
    // the steep pointed gable, ridge across the slab so the triangle faces the long side
    K.gable(v, B.x, Hw, B.z, B.w, B.d, rise, 10, '#5d666f', false, 0.03);
    v.box(B.x, Hw + rise - 0.6, B.z, 0.35, 3, B.d * 0.2, '#c8cdd2');
  }
  c.tag(Hw + rise + 3);
  return true;
}

// ---------------------------------------------------------------------------------------------------- JuBi towers
const JUBI_A = [[18, -26], [-4, -43], [-43, -8], [-7, 4]];
const JUBI_B = [[5, 55], [36, 15], [15, 9], [-28, 29]];

function jubi(c, K) {
  const { v, gl, night } = c;
  K_shade = K.shade;
  const f = frame(c);
  const z = split(c, f, cellSize(c), [['a', JUBI_A], ['b', JUBI_B]]);
  const ta = z.a, tb = z.b, rest = z.rest;
  const Hb = 28, Ht = 128;
  walls(c, rest, Hb, '#b3bdc2', 2, 0.02); lid(c, rest, Hb, '#b3bdc2');
  const towers = [[ta, '#8a4a3a', '#b78b78', 1], [tb, '#e0dacb', '#c9c3b4', 2]];
  let top = 0;
  for (const [list, col, band, mode] of towers) {
    for (const r of list) {
      v.setW(mode);
      v.box(r.x, 0, r.z, r.w, Ht, r.d, col, 0.03);
      v.setW(0);
      for (const y of [Ht * 0.25, Ht * 0.5, Ht * 0.75]) v.box(r.x, y, r.z, r.w + 0.3, 0.7, r.d + 0.3, band);
    }
    const B = bound(list);
    // stepped, tapering crown
    v.box(B.x, Ht, B.z, B.w + 0.6, 1, B.d + 0.6, band);
    const tip = stepCrown(c, B, Ht + 1, [3.5, 3.5, 3, 2.5], band, 0.78);
    (night ? gl : v).box(B.x, tip, B.z, 0.4, 4, 0.4, night ? '#ffd0d0' : '#c8cdd2');
    top = Math.max(top, tip + 4);
    if (night) gl.box(B.x, Ht + 1.2, B.z, B.w * 0.6, 3, B.d * 0.6, '#fff1c1');
  }
  c.tag(top);
  return true;
}

// ---------------------------------------------------------------------------------------------------- City hall (the "ice palace")
function stadhuis(c, K) {
  const { v, gl, night } = c;
  K_shade = K.shade;
  const H = K.clamp(c.h, 30, 50), white = '#f1f0ea';
  const sorted = c.rects.slice().sort((a, b) => b.w * b.d - a.w * a.d);
  const tall = new Set(sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.4))));
  const low = c.rects.filter((r) => !tall.has(r)), hi = c.rects.filter((r) => tall.has(r));
  walls(c, low, H * 0.7, white, 1, 0.015);
  walls(c, hi, H, white, 1, 0.015);
  for (const r of low) v.box(r.x, H * 0.7, r.z, r.w + 0.1, 0.3, r.d + 0.1, '#e4e2da');
  for (const r of hi) {
    v.box(r.x, H, r.z, r.w + 0.2, 0.4, r.d + 0.2, '#e4e2da');
    // the glazed light-slot in the roof
    if (Math.min(r.w, r.d) > 6) v.box(r.x, H + 0.4, r.z, Math.max(1, r.w - 3), 0.25, Math.max(1, r.d - 3), night ? '#7a8a96' : '#b9dcec');
  }
  // horizontal white fins every ~10 m of height on the big rects
  for (const r of hi.slice(0, 18)) for (const y of [H * 0.33, H * 0.66]) v.box(r.x, y, r.z, r.w + 0.12, 0.35, r.d + 0.12, '#ffffff');
  if (night) for (const r of hi.slice(0, 8)) gl.box(r.x, H + 0.5, r.z, Math.max(1, r.w - 4), 0.2, Math.max(1, r.d - 4), '#fff1c1');
  const fl = facade(c, 270);
  K.flag(v, fl.x - fl.s * (fl.ax === 'x' ? 3 : 0), H + 0.4, fl.z - fl.s * (fl.ax === 'z' ? 3 : 0), 7);
  c.tag(H + 8);
  return true;
}

// ---------------------------------------------------------------------------------------------------- Paleis Noordeinde
function noordeinde(c, K) {
  const { v, main } = c;
  K_shade = K.shade;
  const hw = K.clamp(c.h - 7, 9, 14), sand = '#dccfb0';
  walls(c, c.rects, hw, sand, 1, 0.025);
  for (const r of c.rects) {
    v.box(r.x, 0, r.z, r.w + 0.15, 1.1, r.d + 0.15, '#bdb299');
    v.box(r.x, hw - 0.6, r.z, r.w + 0.3, 0.6, r.d + 0.3, '#efe7d2');
  }
  const rise = K.roofs(c, hw, K.SLATE, { steep: 0.5, max: 9 });
  // the centre of the street (west) front: pilasters, a portico and a small pediment
  const fw = facade(c, 270), W = Math.min(fw.span * 0.34, 20);
  fw.put(v, 0, 0, 0.55, W, 1.4, 1.5, '#cfc3a6');
  fw.put(v, 0, 1.4, 0.45, W, hw - 1.4, 0.9, '#e8dfc6');
  for (let i = 0; i < 4; i++) fw.put(v, -W * 0.38 + (i * W * 0.76) / 3, 1.4, 0.95, 0.8, hw - 2.4, 0.8, '#f1ead6');
  fw.put(v, 0, hw - 1.0, 0.95, W + 0.8, 0.9, 1.4, '#efe7d2');
  pediment(fw, v, hw - 0.1, W + 0.8, 2.8, '#efe7d2');
  fw.put(v, 0, 0.4, 0.5, 2.4, 3.4, 0.4, '#4a3b30');
  // chimneys and the flag
  const sd = main.w >= main.d ? 1 : -1;
  for (const k of [-0.3, 0.3]) v.box(main.x + (main.w >= main.d ? k * main.w : 0), hw + rise * 0.45, main.z + (main.w >= main.d ? 0 : k * main.d), 1.2, rise * 0.8 + 1.5, 1.2, '#a87a62');
  K.flag(v, main.x, hw + rise * 0.96, main.z, 6, sd);
  c.tag(hw + rise + 8);
  return true;
}

// ---------------------------------------------------------------------------------------------------- Mauritshuis
function mauritshuis(c, K) {
  const { v } = c;
  K_shade = K.shade;
  const m = c.main, hw = K.clamp(c.h * 0.62, 8, 14), rise = K.clamp(c.h - hw, 4, 8);
  const brick = '#8d4b3a', stone = '#e6dcc3';
  walls(c, c.rects, hw, brick, 1, 0.03);
  for (const r of c.rects) {
    v.box(r.x, 0, r.z, r.w + 0.2, 1.2, r.d + 0.2, '#bdb299');
    v.box(r.x, hw - 0.7, r.z, r.w + 0.5, 0.7, r.d + 0.5, stone);
    v.box(r.x, hw * 0.5, r.z, r.w + 0.12, 0.5, r.d + 0.12, stone);
  }
  // pale pilasters and a pediment on each long side
  const long = m.w >= m.d;
  for (const sg of [-1, 1]) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (long ? m.w : m.d) * (-0.5 + (i + 0.5) / n) * 0.82;
      const x = long ? m.x + a : m.x + sg * (m.w / 2 + 0.2), z = long ? m.z + sg * (m.d / 2 + 0.2) : m.z + a;
      v.box(x, 1.2, z, long ? 1 : 0.7, hw - 2, long ? 0.7 : 1, stone);
    }
    const pw = (long ? m.w : m.d) * 0.4, px = long ? m.x : m.x + sg * (m.w / 2 + 0.3), pz = long ? m.z + sg * (m.d / 2 + 0.3) : m.z;
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const wi = pw * (1 - i / steps), hh = 0.75;
      v.box(px, hw + i * hh, pz, long ? wi : 1.1, hh, long ? 1.1 : wi, stone, 0.02);
    }
  }
  K.hip(v, m.x, hw, m.z, m.w, m.d, rise, 6, K.SLATE);
  for (const sg of [-1, 1]) {
    const cx = long ? m.x + sg * m.w * 0.2 : m.x, cz = long ? m.z : m.z + sg * m.d * 0.2;
    v.box(cx, hw + rise * 0.5, cz, 1.6, rise * 0.5 + 4, 1.6, '#a87a62');
    v.box(cx, hw + rise + 3.8, cz, 2, 0.5, 2, '#6d5448');
  }
  c.tag(hw + rise + 5);
  return true;
}

// ---------------------------------------------------------------------------------------------------- Huis ten Bosch
function huisTenBosch(c, K) {
  const { v } = c;
  K_shade = K.shade;
  const f = frame(c);
  const B = bound(c.rects), pale = '#e6dfca';
  const centre = c.rects.filter((r) => Math.abs(r.x - B.x) < B.w * 0.17 && Math.abs(r.z - f.gz) < B.d * 0.4);
  const cs = new Set(centre.length ? centre : [c.main]);
  const wings = c.rects.filter((r) => !cs.has(r)), mid = [...cs];
  const hw = 8.5, hm = 11;
  walls(c, wings, hw, pale, 1, 0.025);
  walls(c, mid, hm, pale, 1, 0.025);
  for (const r of c.rects) {
    const h = cs.has(r) ? hm : hw;
    v.box(r.x, 0, r.z, r.w + 0.15, 1, r.d + 0.15, '#c2b9a0');
    v.box(r.x, h - 0.6, r.z, r.w + 0.3, 0.6, r.d + 0.3, '#f3eee0');
  }
  const wr = K.roofs({ ...c, rects: wings }, hw, K.SLATE, { steep: 0.4, max: 5 });
  const mb = bound(mid), mr = K.roofs({ ...c, rects: mid }, hm, K.SLATE, { steep: 0.3, max: 4 });
  // cupola: octagonal lantern (two crossed boxes), windows, a small copper dome and a finial
  const ly = hm + mr * 0.8, s = K.clamp(Math.min(mb.w, mb.d) * 0.5, 5, 10);
  v.box(mb.x, ly, mb.z, s, 1.2, s, '#f3eee0');
  v.setW(1);
  v.box(mb.x, ly + 1.2, mb.z, s * 0.8, 3.4, s * 0.8 * 0.7, pale);
  v.box(mb.x, ly + 1.2, mb.z, s * 0.8 * 0.7, 3.4, s * 0.8, pale);
  v.setW(0);
  v.box(mb.x, ly + 4.6, mb.z, s * 0.95, 0.5, s * 0.95, '#f3eee0');
  K.dome(v, mb.x, ly + 5.1, mb.z, s * 0.42, 5, '#7f9a8c');
  v.box(mb.x, ly + 5.1 + s * 0.42, mb.z, 0.2, 2.2, 0.2, '#e6c34a');
  // pediment and steps in front of the central block (towards the garden side: the long face away from the road, taken as south)
  const fs = facade(c, 180);
  fs.put(v, 0, 0, 0.8, Math.min(fs.span * 0.4, 16), 0.5, 1.6, '#cfc7b0');
  pediment(fs, v, hm - 0.1, Math.min(fs.span * 0.4, 16), 2.4, '#f3eee0');
  K.flag(v, mb.x + s, hm + mr * 0.5, mb.z, 5, 1);
  c.tag(ly + 5.1 + s * 0.42 + 3);
  return true;
}

// ---------------------------------------------------------------------------------------------------- Kunstmuseum Den Haag
function kunstmuseum(c, K) {
  const { v } = c;
  K_shade = K.shade;
  const B = bound(c.rects), f = frame(c), yellow = '#d4b363';
  const top = Math.max(c.h, 11);
  const tiers = [top, top * 0.72, top * 0.5];
  let hi = 0;
  const hs = new Map();
  for (const r of c.rects) {
    const d = Math.max(Math.abs(r.x - B.x) / (B.w / 2), Math.abs(r.z - B.z) / (B.d / 2));
    const h = d < 0.4 ? tiers[0] : d < 0.72 ? tiers[1] : tiers[2];
    hs.set(r, h);
  }
  for (const r of c.rects) {
    const h = hs.get(r);
    v.setW(1);
    v.box(r.x, 0, r.z, r.w, h, r.d, yellow, 0.035);
    v.setW(0);
    v.box(r.x, h, r.z, r.w + 0.2, 0.35, r.d + 0.2, '#e8e0cc');
    hi = Math.max(hi, h);
  }
  // the entrance on the water side (west): a low flat canopy on thin posts
  const fw = facade(c, 270);
  fw.put(v, 0, 3.4, 1.6, 12, 0.35, 3.4, '#e8e0cc');
  for (const a of [-5.5, 5.5]) fw.put(v, a, 0, 2.6, 0.5, 3.4, 0.5, '#bdb299');
  // a small stair-tower volume on the middle block
  const st = Math.min(5, B.w * 0.05);
  v.box(B.x, tiers[0], B.z, st, 3.2, st, yellow);
  c.tag(hi + 3.8);
  return true;
}

// ---------------------------------------------------------------------------------------------------- Scheveningen Pier
function pierPavilion(c, K) {
  const { v, gl, night } = c;
  K_shade = K.shade;
  const lowH = 5.4, upH = 3.4, white = '#f3f3ee';
  const sorted = c.rects.slice().sort((a, b) => b.w * b.d - a.w * a.d);
  const use = sorted.slice(0, 70);
  for (const r of use) {
    v.setW(2);
    v.box(r.x, 0, r.z, r.w, lowH, r.d, white, 0.015);
    v.setW(0);
    v.box(r.x, lowH, r.z, r.w + 0.4, 0.35, r.d + 0.4, '#dcdcd4');
    // upper deck: glass ribbon, a little inset
    if (Math.min(r.w, r.d) > 3.4) {
      v.setW(2);
      v.box(r.x, lowH + 0.35, r.z, r.w - 1.6, upH, r.d - 1.6, '#a9d4e8', 0.015);
      v.setW(0);
      v.box(r.x, lowH + 0.35 + upH, r.z, r.w - 1.0, 0.35, r.d - 1.0, white);
    }
  }
  // a row of flags along the longest side, and lights at night
  const m = c.main, long = m.w >= m.d, n = K.clamp(Math.round((long ? m.w : m.d) / 12), 2, 8);
  let topY = lowH + upH + 1;
  for (let i = 0; i < n; i++) {
    const a = (-0.5 + (i + 0.5) / n) * ((long ? m.w : m.d) - 3);
    const x = long ? m.x + a : m.x, z = long ? m.z : m.z + a;
    const sz = long ? m.d / 2 - 0.5 : m.w / 2 - 0.5;
    const px = long ? x : m.x + sz, pz = long ? m.z + sz : z;
    K.flag(v, px, lowH + 0.35, pz, 4.2 + (i % 2) * 0.6, 1);
    if (night) gl.box(px, lowH + 0.35 + 5.2, pz, 0.5, 0.5, 0.5, '#fff1c1');
  }
  if (night) for (const r of use.slice(0, 20)) gl.box(r.x, lowH - 0.7, r.z, Math.max(0.6, r.w - 1), 0.3, Math.max(0.6, r.d - 1), '#fff1c1');
  c.tag(topY + 5);
  return true;
}

function pierTower(c, K) {
  const { v, gl, night } = c;
  K_shade = K.shade;
  const H = Math.max(c.h, 40), grey = '#8f9aa3', steel = '#6d7780';
  const m = c.main, cx = m.x, cz = m.z;
  const s0 = Math.min(6.2, Math.min(m.w, m.d) * 0.3), s1 = 3.4; // half-width of the lattice at the base / under the platform
  v.box(cx, 0, cz, s0 * 2 + 3, 1.2, s0 * 2 + 3, '#b9b4a8');
  const secs = 5, hs = (H - 6) / secs, legW = 0.55;
  for (let i = 0; i < secs; i++) {
    const y = 1.2 + i * hs, ya = y, h = hs;
    const sa = s0 + (s1 - s0) * (i / secs), sb = s0 + (s1 - s0) * ((i + 1) / secs), sm = (sa + sb) / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) v.box(cx + sx * sm, ya, cz + sz * sm, legW, h, legW, i % 2 ? grey : steel);
    // cross bracing: one diagonal on each of the four faces
    for (const sg of [-1, 1]) {
      const d = i % 2 ? 1 : -1;
      for (let k = 0; k < 5; k++) {
        const t = (k + 0.5) / 5, a = d * (t - 0.5) * 2 * sm;
        v.box(cx + a, ya + t * h, cz + sg * sm, 0.5, 0.8, 0.5, steel);
        v.box(cx + sg * sm, ya + t * h, cz + a, 0.5, 0.8, 0.5, steel);
      }
    }
    v.box(cx, ya + h - 0.2, cz, sb * 2 + 0.4, 0.3, sb * 2 + 0.4, steel);
  }
  // platform with a rail and a small cabin; a mast with a light on top
  const py = 1.2 + secs * hs;
  v.box(cx, py, cz, 10.5, 0.6, 10.5, '#aeb6bd');
  for (const sg of [-1, 1]) {
    v.box(cx, py + 0.6, cz + sg * 5.1, 10.5, 0.9, 0.18, '#d8dde0');
    v.box(cx + sg * 5.1, py + 0.6, cz, 0.18, 0.9, 10.5, '#d8dde0');
  }
  v.box(cx, py + 0.6, cz, 4.4, 2.8, 4.4, '#e4e6e8');
  v.box(cx, py + 3.4, cz, 5, 0.4, 5, steel);
  v.box(cx, py + 3.8, cz, 0.3, 6, 0.3, '#c8cdd2');
  (night ? gl : v).box(cx, py + 9.8, cz, 0.6, 0.6, 0.6, night ? '#ff4040' : '#c8cdd2');
  if (night) gl.box(cx, py + 0.65, cz, 3, 0.3, 3, '#ffe9a8');
  c.tag(py + 11);
  return true;
}

// ---------------------------------------------------------------------------------------------------- the list
// x, y: centre of the footprint's bounding box in map metres (checked against the tile data), minArea in m2.
export const SPECIALS2 = [
  { id: 'hoftoren', x: 1514.3, y: 1193.6, minArea: 2000, draw: hoftoren },
  { id: 'strijkijzer', x: 1659.5, y: 178.5, minArea: 600, draw: strijkijzer },
  { id: 'zurichtoren', x: 1408.5, y: 1152.0, minArea: 1200, draw: zurichtoren },
  { id: 'castalia', x: 1428.0, y: 1113.0, minArea: 1800, draw: castalia },
  { id: 'jubi', x: 1500.0, y: 1013.0, minArea: 3500, draw: jubi },
  { id: 'stadhuis', x: 1186.5, y: 885.6, minArea: 8000, draw: stadhuis },
  { id: 'stadhuis-b', x: 1186.2, y: 868.3, minArea: 8000, draw: stadhuis },
  { id: 'noordeinde', x: 429.1, y: 1207.7, minArea: 3000, draw: noordeinde },
  { id: 'mauritshuis', x: 978.5, y: 1157.3, minArea: 400, draw: mauritshuis },
  { id: 'huis-ten-bosch', x: 2988.2, y: 2584.2, minArea: 1500, draw: huisTenBosch },
  { id: 'kunstmuseum', x: -1321.5, y: 2195.9, minArea: 5000, draw: kunstmuseum },
  { id: 'pier-west', x: -1404.3, y: 5233.0, minArea: 1500, draw: pierPavilion },
  { id: 'pier-tower', x: -1372.5, y: 5318.4, minArea: 300, draw: pierTower },
  { id: 'pier-long', x: -1261.2, y: 5161.1, minArea: 3500, draw: pierPavilion },
];
