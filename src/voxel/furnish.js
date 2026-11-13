// Street furniture as part of the map: racks, benches, bins, mailboxes, transformer boxes, market stalls, street-name
// signs, tram/bus shelters, café terraces with their people, beach parasols, and everything else a place of that kind
// has (see DETAIL.md for the list and the level of detail of each kind of place), drawn into a tile's own builders.
// Every street has them, placed by the same rules from the tile's own data, so the city looks the same whichever street
// is in focus. The open street only looks up what stands along it (the `props` list returned here) to hand anchors to
// the cutscene scripts and to draw its obstacle picture (setting.js `obstacles`); the end of the list holds what only
// stands in the way (statues, fountains, shelters, planters), added after all placing is done.
//
// Frame of every prop: local +z points from the prop towards the centre line of its road (so a bench's back is to the
// houses, a shelter's glass is at the back), local x runs along the street. Tile coordinates: x east, z south, metres.
// Terraces use the frame of their facade: local +z points out of the building into the street or square.
//
// Everything here is a pure function of the tile's data and its key (position-seeded dice), so a tile looks the same
// every time it is built. By night the furniture stands where it stands by day (the same `props`, the same seats taken):
// the night rolls every die the day rolls and counts every box the day counts against the budget. What only the day shows
// (the second drink or the vase some tables have, open market stalls, crates, shoppers, the basket on a picnic table) is then counted but not drawn (the `ghost`
// builder), and what only the night shows (shut stalls, with dice of their own; candles; a boat's riding light) is not
// counted (`nightOnly`). Otherwise `night` only changes which boxes glow (the `gl` builder: never a real light), and fewer
// people stay at the picnics; the same lamps, strings and lanterns are there by day, unlit.
import * as THREE from 'three';
import * as P from './props.js';
import { makeRng, hashStr, clamp } from './kit.js';
import { POI_CATS, POI_FLAG } from './poicats.js';
import { placesFor, placeHas } from './places.js';
import { SKINS, SHIRTS, PANTS, HAIRS } from './cast.js';

const STALLS = { HARING: ['#21468b', '#ffffff'], FRIET: ['#e63946', '#ffd166'], BLOEM: ['#ff70a6', '#ffffff'], VIS: ['#1d6fa5', '#ffffff'] };
const TILE = 256, EDGE = 2;
const SHOPPY = new Set([1, 2, 3, 4, 6]); // poi kinds that make a street busy
const TERRACE_KINDS = new Set([1, 2, 6]); // old data (no `ps`): bar, restaurant/cafe, coffee shop
// poi categories (poicats.js) that can have a terrace when the map says so, and the ones a curated place may force one on
const EAT = new Set(['restaurant', 'cafe', 'pub', 'ice_cream', 'terrace', 'snackbar', 'burger', 'pizza', 'kebab', 'sandwich', 'bakery', 'coffeeshop', 'fish', 'asian', 'roti', 'chicken']);
const FORCE = new Set(['restaurant', 'cafe', 'pub', 'ice_cream', 'terrace', 'bakery', 'coffeeshop']);
const TAU = Math.PI * 2;

// (the people palettes come from cast.js, the same ones the crowd uses: seated people match the walkers)
const WARM = ['#ffd98a', '#ffe9a8', '#ffc45e', '#fff1c1'];

// ---------------------------------------------------------------- polylines
function prep(a) {
  const n = a.length >> 1, cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(a[i * 2] - a[i * 2 - 2], a[i * 2 + 1] - a[i * 2 - 1]);
  return { a, n, cum, len: cum[n - 1] };
}
function posAt(pl, s, out) {
  const { a, n, cum } = pl;
  s = clamp(s, 0, pl.len);
  let i = 0;
  while (i < n - 2 && cum[i + 1] < s) i++;
  const l = cum[i + 1] - cum[i] || 1e-6, t = (s - cum[i]) / l;
  out.x = a[i * 2] + (a[i * 2 + 2] - a[i * 2]) * t;
  out.z = a[i * 2 + 1] + (a[i * 2 + 3] - a[i * 2 + 1]) * t;
  return out;
}
const _p = {}, _q = {};
/** Point and smoothed unit tangent at arc length s. */
function frameAt(pl, s, out = {}) {
  posAt(pl, s, out);
  posAt(pl, s - 2.5, _p); posAt(pl, s + 2.5, _q);
  let tx = _q.x - _p.x, tz = _q.z - _p.z;
  const l = Math.hypot(tx, tz) || 1;
  out.tx = tx / l; out.tz = tz / l;
  return out;
}

// ================================================================ builders (all draw at the origin of the current frame)
const pick = (r, a) => a[Math.floor(r() * a.length)];
let CHEAP = false; // the big terrace fields are drawn with fewer boxes per table and chair (no feet, no shins, no tableware)
const FWD = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // facing 0..3: +z, +x, -z, -x
/** A box in a figure's own frame: a to the right, b forward (quarter-turn facing o.f), all scaled by o.k. */
function fb(v, o, a, b, y, w, h, l, c) {
  const k = o.k, F = FWD[o.f], cx = o.x + (F[1] * a + F[0] * b) * k, cz = o.z + (-F[0] * a + F[1] * b) * k, odd = o.f & 1;
  v.box(cx, o.y + y * k, cz, (odd ? l : w) * k, h * k, (odd ? w : l) * k, c);
}
/** The dice of one person: clothes from the crowd's palettes. */
function lookOf(r) {
  return { skin: pick(r, SKINS), shirt: pick(r, SHIRTS), pants: pick(r, PANTS), hair: pick(r, HAIRS), style: r(), hat: pick(r, ['#2b2b2b', '#e63946', '#1d3557', '#e9c46a', '#ffffff']) };
}
function head(v, o, L, y, lean = 0) {
  fb(v, o, 0, lean, y, 0.22, 0.22, 0.22, L.skin);
  const s = L.style;
  if (s < 0.5) fb(v, o, 0, lean - 0.01, y + 0.17, 0.24, 0.09, 0.25, L.hair);
  else if (s < 0.75) { fb(v, o, 0, lean - 0.01, y + 0.17, 0.24, 0.09, 0.25, L.hair); fb(v, o, 0, lean - 0.12, y - 0.14, 0.24, 0.34, 0.06, L.hair); }
  else if (s < 0.88) { fb(v, o, 0, lean, y + 0.2, 0.3, 0.05, 0.3, L.hat); fb(v, o, 0, lean, y + 0.16, 0.22, 0.06, 0.22, L.hat); }
  // else: bald
}
/** A seated person (origin = the middle of the chair seat, facing o.f). pose: rest, sip, phone, lean, back. */
function seated(v, o, L, pose, glass = '#e8a317') {
  const lean = pose === 'lean' ? 0.1 : 0;
  if (!CHEAP) fb(v, o, 0, 0.32, 0, 0.30, 0.46, 0.14, L.pants);
  fb(v, o, 0, CHEAP ? 0.2 : 0.12, CHEAP ? 0.0 : 0.46, 0.30, CHEAP ? 0.61 : 0.15, CHEAP ? 0.36 : 0.44, L.pants);
  fb(v, o, 0, -0.04 + lean, 0.5, 0.38, 0.55, 0.22, L.shirt);
  head(v, o, L, 1.05, lean);
  if (pose === 'sip') {
    fb(v, o, 0, 0.16, 0.7, 0.5, 0.1, 0.36, L.shirt);
    fb(v, o, 0.24, 0.3, 0.8, 0.1, 0.3, 0.1, L.shirt);
    fb(v, o, 0.24, 0.32, 1.0, 0.08, 0.12, 0.08, glass);
  } else if (pose === 'phone') {
    fb(v, o, 0, 0.14, 0.68, 0.5, 0.1, 0.34, L.shirt);
    fb(v, o, 0.12, 0.3, 0.8, 0.1, 0.3, 0.1, L.shirt);
    fb(v, o, 0.12, 0.34, 1.05, 0.07, 0.11, 0.02, '#111');
  } else if (pose === 'back') {
    fb(v, o, 0, 0.0, 0.5, 0.5, 0.5, 0.12, L.shirt);
  } else {
    fb(v, o, 0, 0.18 + lean, 0.7, 0.5, 0.1, 0.4, L.shirt);
  }
}
/** A standing person. pose: idle, tray, drink, phone, cone, bag. */
function standing(v, o, L, pose, extra = '#e8a317') {
  if (CHEAP) { // a few boxes: legs in one, no left arm
    fb(v, o, 0, 0, 0, 0.3, 0.82, 0.17, L.pants);
    fb(v, o, 0, 0, 0.82, 0.40, 0.62, 0.22, L.shirt);
    head(v, o, L, 1.46);
    if (pose === 'bag') { fb(v, o, 0.26, 0, 0.8, 0.1, 0.56, 0.12, L.shirt); fb(v, o, 0.32, 0.04, 0.35, 0.1, 0.4, 0.3, extra); }
    else if (pose === 'trolley') { fb(v, o, 0.0, 0.55, 0.15, 0.45, 0.7, 0.35, extra); fb(v, o, 0.0, 0.4, 0.85, 0.45, 0.04, 0.05, '#555'); }
    else fb(v, o, 0.26, 0.1, 0.9, 0.1, 0.5, 0.12, L.shirt);
    return;
  }
  fb(v, o, -0.09, 0, 0, 0.15, 0.82, 0.17, L.pants);
  fb(v, o, 0.09, 0, 0, 0.15, 0.82, 0.17, L.pants);
  fb(v, o, 0, 0, 0.82, 0.40, 0.62, 0.22, L.shirt);
  head(v, o, L, 1.46);
  fb(v, o, -0.26, 0, 0.8, 0.1, 0.56, 0.12, L.shirt);
  if (pose === 'tray') {
    fb(v, o, 0.26, 0.25, 1.15, 0.1, 0.1, 0.5, L.shirt);
    fb(v, o, 0.26, 0.6, 1.25, 0.4, 0.03, 0.4, '#c9ccd1');
    fb(v, o, 0.18, 0.55, 1.28, 0.07, 0.12, 0.07, '#e8a317'); fb(v, o, 0.34, 0.65, 1.28, 0.07, 0.12, 0.07, '#f5f0c8'); fb(v, o, 0.28, 0.5, 1.28, 0.07, 0.1, 0.07, '#a31621');
  } else if (pose === 'drink') {
    fb(v, o, 0.26, 0.15, 1.1, 0.1, 0.1, 0.32, L.shirt);
    fb(v, o, 0.26, 0.34, 1.1, 0.08, 0.14, 0.08, extra);
  } else if (pose === 'phone') {
    fb(v, o, 0.26, 0.1, 1.05, 0.1, 0.3, 0.1, L.shirt);
    fb(v, o, 0.26, 0.16, 1.34, 0.07, 0.11, 0.02, '#111');
  } else if (pose === 'cone') {
    fb(v, o, 0.26, 0.15, 1.1, 0.1, 0.1, 0.3, L.shirt);
    fb(v, o, 0.26, 0.32, 1.1, 0.06, 0.12, 0.06, '#d9a15b'); fb(v, o, 0.26, 0.32, 1.22, 0.11, 0.1, 0.11, extra);
  } else if (pose === 'bag') {
    fb(v, o, 0.26, 0, 0.8, 0.1, 0.56, 0.12, L.shirt);
    fb(v, o, 0.32, 0.04, 0.35, 0.1, 0.4, 0.3, extra);
  } else fb(v, o, 0.26, 0, 0.8, 0.1, 0.56, 0.12, L.shirt);
}
const person = (v, x, z, f, k = 1, y = 0) => ({ x, z, f, k, y });
/** Somebody lying on a towel (a sunbather). */
function lying(v, x, z, f, L, towel) {
  const o = person(v, x, z, f);
  fb(v, o, 0, 0, 0, 0.8, 0.03, 1.9, towel);
  fb(v, o, 0, -0.1, 0.03, 0.32, 0.14, 0.55, L.shirt);
  fb(v, o, 0, 0.5, 0.03, 0.3, 0.12, 0.5, L.pants);
  fb(v, o, 0, -0.6, 0.03, 0.2, 0.2, 0.2, L.skin);
  fb(v, o, 0, -0.62, 0.17, 0.22, 0.07, 0.22, L.hair);
}

const CHAIRCOL = { wicker: ['#b08a5a', '#9c7448', '#c4a373'], wood: ['#8a5a34', '#a0703f', '#6d4a2c'], bistro: ['#2b2b2b', '#3a3f47', '#5b4636', '#7a1f2b'] };
function chair(v, x, z, f, kind, c) {
  const o = person(v, x, z, f);
  if (kind === 'wicker') {
    fb(v, o, 0, 0, 0, 0.42, 0.4, 0.42, c);
    fb(v, o, 0, -0.17, 0.4, 0.44, 0.55, 0.1, c);
  } else {
    if (!CHEAP) fb(v, o, 0, 0, 0, 0.3, 0.42, 0.06, c);
    fb(v, o, 0, 0, 0.42, 0.4, 0.04, 0.4, kind === 'wood' ? c : '#cfc6b4');
    fb(v, o, 0, -0.18, 0.46, 0.4, 0.38, 0.04, c);
  }
}
function tableRound(v, x, z, d, h, top, base = '#4a4a4f') {
  if (!CHEAP) v.box(x, 0, z, 0.38, 0.03, 0.38, base);
  v.box(x, 0.03, z, 0.07, h - 0.03, 0.07, base);
  v.box(x, h, z, d, 0.05, d, top);
}
function tableSquare(v, x, z, d, h, top, base = '#4a4a4f') {
  if (!CHEAP) v.box(x, 0, z, 0.4, 0.03, 0.4, base);
  v.box(x, 0.03, z, 0.07, h - 0.03, 0.07, base);
  v.box(x, h, z, d, 0.05, d, top);
}
/** A long wooden table with a bench each side, along x (f 0/2) or z (f 1/3). */
function tableLong(v, x, z, len, f, top, wood) {
  const o = person(v, x, z, f);
  fb(v, o, 0, 0, 0.74, len, 0.06, 0.78, top);
  if (CHEAP) fb(v, o, 0, 0, 0, len * 0.7, 0.44, 0.9, wood);
  else for (const s of [-1, 1]) fb(v, o, s * (len / 2 - 0.25), 0, 0, 0.08, 0.74, 0.62, wood);
  for (const s of [-1, 1]) {
    fb(v, o, 0, s * 0.6, 0.44, len, 0.05, 0.3, wood);
    if (!CHEAP) for (const e of [-1, 1]) fb(v, o, e * (len / 2 - 0.3), s * 0.6, 0, 0.06, 0.44, 0.24, wood);
  }
}
function drink(v, gl, night, x, z, y, r) {
  const c = r() < 0.55 ? '#e8a317' : r() < 0.5 ? '#f5f0c8' : r() < 0.5 ? '#a31621' : '#fff';
  v.box(x, y, z, 0.07, 0.12, 0.07, c);
}
function candle(v, gl, night, x, z, y) {
  v.box(x, y, z, 0.1, 0.07, 0.1, night ? '#b39a6a' : '#d8d2bf');
  if (night) gl.box(x, y + 0.07, z, 0.07, 0.06, 0.07, '#ffb35c');
}

/** Parasol canopies. kind: sq, round, big, stripe, sail. (x, z) centre; s the canopy size; h the pole height. */
function parasol(v, kind, x, z, s, h, cols) {
  const [a, b = a] = cols;
  if (kind === 'big') {
    v.box(x, 0, z, 0.3, 0.06, 0.3, '#444');
    v.box(x, 0.06, z, 0.1, h - 0.06, 0.1, '#555');
    v.box(x, h, z, s * 1.25, 0.1, s, a);
    v.box(x, h - 0.1, z, s * 1.25 + 0.1, 0.1, s + 0.1, b);
    v.box(x, h + 0.1, z, s * 0.6, 0.1, s * 0.5, b);
  } else if (kind === 'round') {
    v.box(x, 0, z, 0.3, 0.05, 0.3, '#555');
    v.box(x, 0.05, z, 0.06, h, 0.06, '#d8d4c8');
    v.box(x, h, z, s, 0.08, s, a); v.box(x, h + 0.08, z, s * 0.75, 0.08, s * 0.75, a); v.box(x, h + 0.16, z, s * 0.4, 0.08, s * 0.4, b);
  } else if (kind === 'stripe') {
    v.box(x, 0, z, 0.3, 0.05, 0.3, '#555');
    v.box(x, 0.05, z, 0.06, h, 0.06, '#e4e4e4');
    const n = 5, w = s / n;
    for (let i = 0; i < n; i++) v.box(x - s / 2 + w * (i + 0.5), h, z, w, 0.1, s, i % 2 ? b : a);
    v.box(x, h + 0.1, z, s * 0.35, 0.1, s * 0.35, a);
  } else if (kind === 'sail') {
    for (const sx of [-1, 1]) v.box(x + sx * s * 0.5, 0, z - s * 0.4, 0.08, h + 0.35, 0.08, '#555');
    v.box(x, h + 0.3, z, s * 1.1, 0.06, s * 0.9, a);
  } else {
    v.box(x, 0, z, 0.3, 0.05, 0.3, '#555');
    v.box(x, 0.05, z, 0.06, h, 0.06, '#ddd');
    v.box(x, h, z, s, 0.1, s, a); v.box(x, h + 0.1, z, s * 0.55, 0.1, s * 0.55, b === a ? P.shade(a, 0.88) : b);
  }
}
function heater(v, gl, night, x, z) {
  v.box(x, 0, z, 0.38, 0.05, 0.38, '#2c2c30');
  v.box(x, 0.05, z, 0.1, 2.0, 0.1, '#9aa5ad');
  v.box(x, 2.05, z, 0.62, 0.07, 0.62, '#8c969e');
  v.box(x, 2.12, z, 0.34, 0.14, 0.34, '#707a82');
  (night ? gl : v).box(x, 1.98, z, 0.44, 0.05, 0.44, night ? '#ff8a3a' : '#7d3b1f');
}
/** A string of festoon lights from (x0, z0) to (x1, z1) (along one axis), `y0`/`y1` high at the ends, sagging between. */
function festoon(v, gl, night, x0, z0, x1, z1, y0, y1, bulb = WARM[0]) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  if (L < 0.5) return;
  const nb = Math.max(1, Math.round(L / 1.1)), nw = Math.max(1, Math.ceil(L / 3)), alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), sag = clamp(L * 0.06, 0.15, 0.7);
  const yAtT = (t) => y0 + (y1 - y0) * t - sag * 4 * t * (1 - t);
  for (let i = 0; i < nw; i++) { // the wire in a few straight pieces
    const t = (i + 0.5) / nw, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (alongX) v.box(x, yAtT(t), z, L / nw + 0.02, 0.03, 0.03, '#2a2a2e'); else v.box(x, yAtT(t), z, 0.03, 0.03, L / nw + 0.02, '#2a2a2e');
  }
  for (let i = 0; i < nb; i++) { // the bulbs hang on it
    const t = (i + 0.5) / nb;
    (night ? gl : v).box(x0 + (x1 - x0) * t, yAtT(t) - 0.11, z0 + (z1 - z0) * t, 0.11, 0.11, 0.11, night ? bulb : '#d6d1bf');
  }
}
function pole(v, x, z, h, c = '#2d3036') {
  v.box(x, 0, z, 0.28, 0.1, 0.28, c);
  v.box(x, 0.1, z, 0.1, h, 0.1, c);
}
function lantern(v, gl, night, x, y, z, s = 1, col = '#c1121f') {
  v.box(x, y + 0.5 * s, z, 0.3 * s, 0.05, 0.3 * s, '#d6a400');
  (night ? gl : v).box(x, y + 0.05 * s, z, 0.4 * s, 0.45 * s, 0.4 * s, night ? '#ff4b3a' : col);
  v.box(x, y, z, 0.3 * s, 0.05, 0.3 * s, '#d6a400');
  v.box(x, y - 0.3 * s, z, 0.04, 0.3 * s, 0.04, '#e0b000');
}
function planterBox(v, x, z, r, w = 1.1) {
  const c = pick(r, ['#8a8d8f', '#6e7276', '#4b5b50', '#a8a49a']);
  v.box(x, 0, z, w, 0.62, 0.6, c);
  const g = pick(r, ['#3f9a52', '#4caf50', '#2e7d4f']);
  v.box(x, 0.62, z, w * 0.88, 0.5, 0.46, g);
  if (r() < 0.55) for (let i = 0; i < 3; i++) v.box(x - w * 0.3 + i * w * 0.3, 1.1, z, 0.12, 0.14, 0.12, pick(r, ['#ff3b5c', '#ffcc00', '#ff8fab', '#c77dff', '#ffffff']));
}
function menuBoard(v, x, z, r) {
  v.box(x, 0, z, 0.55, 0.95, 0.08, '#262626');
  v.box(x, 0.65, z + 0.05, 0.42, 0.03, 0.01, '#f4f4f4');
  v.box(x, 0.5, z + 0.05, 0.34, 0.03, 0.01, pick(r, ['#f4f4f4', '#ffd166', '#8ecae6']));
  v.box(x, 0.35, z + 0.05, 0.38, 0.03, 0.01, '#f4f4f4');
}

// ---- cells of a terrace: each returns nothing, draws its table, chairs, drinks, people at local (x, z)
const STYLES = {
  bistro: { cp: 1.9, rp: 2.1, hd: 1.0, par: true },
  sq4: { cp: 2.05, rp: 2.15, hd: 1.05, par: true },
  bench: { cp: 3.2, rp: 2.2, hd: 1.0, par: true },
  high: { cp: 1.5, rp: 1.6, hd: 0.8, par: false },
  lounge: { cp: 2.6, rp: 2.3, hd: 1.0, par: true },
  bistro2: { cp: 1.9, rp: 1.0, hd: 0.36, par: false },
};
const POSES = ['rest', 'rest', 'rest', 'sip', 'sip', 'phone', 'lean', 'lean', 'back'];
const STANDS = ['idle', 'drink', 'drink', 'phone'];
/** Seat people on the chair spots of one cell. S = the terrace's scene (v, gl, night, r, occ, chair, cols ...). */
function sit(S, x, z, f, kid = false) {
  const { v, r } = S;
  chair(v, x, z, f, S.chairKind, S.chairCol);
  if (r() < S.occ) seated(v, kid ? person(v, x, z, f, 0.66) : person(v, x, z, f), lookOf(r), pick(r, POSES));
}
const SIDE = { n: [0, -1, 0], s: [0, 1, 2], e: [1, 0, 3], w: [-1, 0, 1] }; // chair offset (x, z) and the facing that looks at the table
function cellDraw(S, style, x, z) {
  const { v, gl, night, r } = S;
  const top = S.top, d = S.dishes;
  // S.dv: the builder of what only the day shows (by night the ghost, which only counts); S.nightOnly: what only the night shows
  if (style === 'bistro' || style === 'bistro2') {
    tableRound(v, x, z, style === 'bistro' ? 0.7 : 0.6, 0.72, top);
    const sides = style === 'bistro2' ? [SIDE.e, SIDE.w] : r() < 0.35 ? [SIDE.s, SIDE.n, SIDE.e] : [SIDE.s, SIDE.n];
    for (const [dx, dz, f] of sides) sit(S, x + dx * 0.62, z + dz * 0.62, f, r() < 0.04);
    if (d) drink(v, gl, night, x - 0.12, z, 0.77, r);
    if (d) drink(S.dv, gl, night, x + 0.12, z + 0.05, 0.77, r); // by night a candle stands there instead
    if (night) S.nightOnly(() => candle(v, gl, night, x + 0.08, z + 0.05, 0.77));
  } else if (style === 'sq4') {
    tableSquare(v, x, z, 0.82, 0.74, top);
    for (const [dx, dz, f] of [SIDE.s, SIDE.n, SIDE.e, SIDE.w]) if (r() < 0.88) sit(S, x + dx * 0.66, z + dz * 0.66, f, r() < 0.04);
    if (d) { drink(v, gl, night, x - 0.2, z - 0.1, 0.79, r); drink(v, gl, night, x + 0.2, z + 0.15, 0.79, r); }
    if (r() < 0.5) S.dv.box(x, 0.79, z, 0.1, 0.18, 0.1, pick(r, ['#ffd166', '#ff70a6', '#8ecae6', '#ffffff'])); // a flower in a vase (a candle by night)
    if (night) S.nightOnly(() => candle(v, gl, night, x, z, 0.79));
  } else if (style === 'bench') {
    const along = r() < 0.5 ? 0 : 2; // always along x in the terrace's frame: the quarter turn only mirrors it
    tableLong(v, x, z, 2.4, along, top, S.wood);
    for (const s of [-1, 1]) for (const a of [-0.6, 0.6]) {
      if (r() < S.occ) seated(v, person(v, x + a, z + s * 0.6, s > 0 ? 2 : 0), lookOf(r), pick(r, POSES));
      if (d && r() < 0.8) drink(v, gl, night, x + a * 1.1, z + s * 0.2, 0.8, r);
    }
    if (night) S.nightOnly(() => { candle(v, gl, night, x - 0.5, z, 0.8); candle(v, gl, night, x + 0.5, z, 0.8); });
  } else if (style === 'high') {
    tableRound(v, x, z, 0.62, 1.05, top, '#3b3b3f');
    const n = r() < S.occ + 0.2 ? 2 + (r() < 0.4 ? 1 : 0) : 0;
    const spots = [[0.62, 0, 3], [-0.62, 0, 1], [0, 0.62, 2], [0, -0.62, 0]];
    for (let i = 0; i < 4; i++) {
      const [dx, dz, f] = spots[(i + Math.floor(r() * 4)) % 4];
      if (i < n) standing(v, person(v, x + dx, z + dz, f), lookOf(r), pick(r, STANDS), r() < 0.5 ? '#e8a317' : '#f5f0c8');
    }
    drink(v, gl, night, x - 0.12, z, 1.1, r); drink(v, gl, night, x + 0.1, z + 0.1, 1.1, r);
    if (night) S.nightOnly(() => candle(v, gl, night, x, z - 0.1, 1.1));
  } else { // lounge
    v.box(x, 0, z, 0.8, 0.36, 0.8, S.top);
    v.box(x, 0.36, z, 0.7, 0.03, 0.7, '#e9e2d0');
    for (const [dx, dz, f] of [SIDE.s, SIDE.n]) {
      const px = x + dx * 0.95, pz = z + dz * 0.95, o = person(v, px, pz, f);
      fb(v, o, 0, 0, 0, 0.74, 0.32, 0.7, S.chairCol);
      fb(v, o, 0, -0.3, 0.32, 0.74, 0.5, 0.14, S.chairCol);
      fb(v, o, 0, 0.0, 0.32, 0.64, 0.08, 0.56, pick(r, ['#e9e2d0', '#d9b99b', '#9fb4c7']));
      if (r() < S.occ) seated(v, { ...o, y: 0.1 }, lookOf(r), pick(r, POSES));
    }
    if (d) drink(v, gl, night, x, z, 0.4, r);
    if (night) S.nightOnly(() => candle(v, gl, night, x + 0.15, z, 0.4));
  }
}
const COLS = {
  dark: [['#262b36'], ['#2c2f38', '#1f2330'], ['#3a2f2a'], ['#1f3b45']],
  cream: [['#efe6cf', '#e0d4b3'], ['#eadfc4', '#f3ecd9'], ['#f3ecd9']],
  brand: [['#c1121f'], ['#e85d04'], ['#1d6fa5'], ['#2a7f62'], ['#7b2d8f'], ['#d4a017'], ['#111827'], ['#e56b8f']],
  striped: [['#c1121f', '#ffffff'], ['#1d6fa5', '#ffffff'], ['#2a7f62', '#f4f1e8'], ['#e85d04', '#fbeed4']],
  straw: [['#c9a766', '#b89455'], ['#d1b077', '#bd9a5c']],
};
const TOPS = ['#a9824f', '#8d6e4c', '#f1ede2', '#3b3b3f', '#c9c2b2', '#7f9a8a'];
// ---- small pieces of other kinds of place (all at the origin of the current frame, front towards +z)
const ORAC = [['#7d8287', '#3a6ea5'], ['#7d8287', '#4a8a52'], ['#7d8287', '#9a9fa3'], ['#53705c', '#d9a21b']];
function orac(v, r, vr) {
  const [a, b] = ORAC[vr % ORAC.length];
  const twin = r() < 0.3;
  for (let i = 0; i < (twin ? 2 : 1); i++) {
    const x = i * 0.75 - (twin ? 0.375 : 0), bb = twin && i ? ORAC[(vr + 1) % ORAC.length][1] : b;
    v.box(x, 0, 0, 0.62, 1.05, 0.62, a);
    v.box(x, 1.05, 0, 0.7, 0.07, 0.7, P.shade(a, 0.8));
    v.box(x, 0.62, 0.32, 0.3, 0.24, 0.03, bb); v.box(x, 0.7, 0.34, 0.22, 0.07, 0.02, '#1b1b1b');
  }
}
function peperbus(v, gl, night, r, vr) {
  const body = ['#2d5a3d', '#232a35', '#4a5160'][vr % 3], H = 2.9 + (vr % 2) * 0.3;
  v.box(0, 0, 0, 0.95, 0.3, 0.95, body);
  v.box(0, H - 0.1, 0, 1.15, 0.28, 1.15, body);
  v.box(0, H + 0.18, 0, 0.8, 0.12, 0.8, P.shade(body, 0.8));
  const poster = pick(r, ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#f8f9fa', '#9d4edd']);
  for (const [dx, dz, w, d] of [[0, 0.5, 0.82, 0.04], [0, -0.5, 0.82, 0.04], [0.5, 0, 0.04, 0.82], [-0.5, 0, 0.04, 0.82]]) {
    v.box(dx, 0.3, dz, w, H - 0.4, d, body);
    (night ? gl : v).box(dx * 1.02, 0.45, dz * 1.02, w * 0.9, H - 0.7, d, poster);
  }
}
function mupi(v, gl, night, r, vr) {
  const body = ['#3a3f47', '#59616b', '#1f4a8a'][vr % 3];
  v.box(0, 0, 0, 0.2, 0.4, 0.2, body);
  v.box(0, 0.4, 0, 1.2, 1.9, 0.16, body);
  const c1 = pick(r, ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#ffffff', '#ff9f1c']), c2 = pick(r, ['#2b2d42', '#ef476f', '#118ab2', '#f4f1de']);
  for (const s of [-1, 1]) {
    (night ? gl : v).box(0, 0.55, s * 0.09, 1.0, 1.6, 0.02, c1);
    v.box(0, 1.5, s * 0.1, 0.8, 0.3, 0.01, c2);
  }
}
function meter(v, gl, night, r, vr) {
  if (vr === 0) { // pay and display machine
    v.box(0, 0, 0, 0.5, 1.55, 0.34, '#1f4a8a');
    v.box(0, 1.55, 0, 0.56, 0.1, 0.4, '#173766');
    (night ? gl : v).box(0, 1.15, 0.18, 0.3, 0.2, 0.02, night ? '#7ee0ff' : '#bfe3f2');
    v.box(0, 0.8, 0.18, 0.28, 0.12, 0.02, '#cfd6dc');
    v.box(0, 1.6, 0.0, 0.3, 0.3, 0.03, '#1f4a8a'); v.box(0, 1.62, 0.02, 0.2, 0.2, 0.02, '#fff');
  } else if (vr === 1) { // old post meter
    v.box(0, 0, 0, 0.09, 1.2, 0.09, '#555');
    v.box(0, 1.2, 0, 0.26, 0.34, 0.2, '#8a9199');
    v.box(0, 1.3, 0.11, 0.14, 0.12, 0.02, '#e9e2d0');
  } else { // payment pillar with a canopy
    v.box(0, 0, 0, 0.42, 1.4, 0.3, '#2f3a3a');
    v.box(0, 1.4, 0, 0.6, 0.06, 0.5, '#20282a');
    (night ? gl : v).box(0, 1.0, 0.16, 0.26, 0.16, 0.02, night ? '#7bffb0' : '#bde8cf');
    v.box(0, 0.65, 0.16, 0.26, 0.2, 0.02, '#aab4b8');
  }
}
function charger(v, gl, night, r, vr) {
  const acc = ['#3bd16f', '#2a9df4', '#f2f2f2', '#ffb703'][vr % 4], pair = r() < 0.5;
  for (let i = 0; i < (pair ? 2 : 1); i++) {
    const x = i * 0.9 - (pair ? 0.45 : 0);
    v.box(x, 0, 0, 0.26, 1.3, 0.22, '#2e3339');
    v.box(x, 1.3, 0, 0.3, 0.1, 0.26, '#1f2328');
    (night ? gl : v).box(x, 1.0, 0.12, 0.12, 0.2, 0.02, night ? acc : P.shade(acc, 0.7));
    v.box(x, 0.8, 0.12, 0.14, 0.1, 0.02, '#c8cdd2');
  }
}
/** Bollards across a street end. Three kinds: steel with a reflective band, concrete block, retractable with a red top. */
function bollardRow(v, w, vr) {
  const n = Math.max(2, Math.round(w / 1.6));
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (w / n);
    if (vr === 0) { v.box(x, 0, 0, 0.16, 0.85, 0.16, '#6e7478'); v.box(x, 0.6, 0, 0.18, 0.08, 0.18, '#f5d33f'); v.box(x, 0.85, 0, 0.2, 0.04, 0.2, '#555a5e'); }
    else if (vr === 1) { v.box(x, 0, 0, 0.42, 0.65, 0.42, '#9a9a94'); v.box(x, 0.65, 0, 0.36, 0.06, 0.36, '#86867f'); }
    else { v.box(x, 0, 0, 0.2, 0.9, 0.2, '#2f3338'); v.box(x, 0.9, 0, 0.22, 0.1, 0.22, '#c1121f'); }
  }
}
function flagpole(v, r, nl, y0 = 0) {
  const H = 6.5 + r() * 1.5, FL = [['#ae1c28', '#ffffff', '#21468b'], ['#003399', '#ffcc00'], ['#006b3c', '#ffffff', '#ffd23f'], ['#c1121f', '#c1121f'], ['#111827', '#e9c46a'], ['#ffffff', '#1d6fa5']];
  for (let i = 0; i < nl; i++) {
    const x = (i - (nl - 1) / 2) * 1.7, f = FL[Math.floor(r() * FL.length)];
    v.box(x, 0, 0, 0.3, 0.12, 0.3, '#555');
    v.box(x, 0.12, 0, 0.08, H, 0.08, '#e4e6e8');
    v.box(x, H + 0.1, 0, 0.14, 0.14, 0.14, '#e0b000');
    const k = f.length;
    for (let j = 0; j < k; j++) v.box(x + 0.7, H - 0.12 - ((j + 0.5) * 1.0) / k + 0.5, 0, 1.3, 1.0 / k, 0.03, f[j]);
  }
}
function trolleys(v, r, vr) {
  const hc = ['#2f6fb0', '#f5c400', '#c1121f', '#2e7d4f'][vr % 4], n = 4 + Math.floor(r() * 4);
  for (const sx of [-1, 1]) for (const z of [-0.5, 0.5]) v.box(sx * 1.45, 0, z, 0.08, 1.8, 0.08, '#6e7478');
  v.box(0, 1.8, 0, 3.2, 0.08, 1.4, '#8a9199');
  v.box(0, 1.88, 0, 3.0, 0.04, 1.2, hc);
  v.box(0, 0.6, -0.68, 3.0, 1.2, 0.04, P.shade('#bfe3f2', 0.95));
  for (let i = 0; i < n; i++) {
    const x = -1.2 + i * 0.36 * (6 / Math.max(n, 6));
    v.box(x, 0.15, 0, 0.34, 0.7, 0.6, '#b4bcc3');
    v.box(x, 0.85, -0.3, 0.34, 0.06, 0.05, hc);
  }
}
/** Mooring post (cast iron), chain post and so on, for a canal quay. */
function quayPost(v, vr) {
  if (vr === 0) { v.box(0, 0, 0, 0.24, 0.8, 0.24, '#2b2d30'); v.box(0, 0.8, 0, 0.3, 0.1, 0.3, '#f2f0ea'); }
  else if (vr === 1) { v.box(0, 0, 0, 0.3, 0.85, 0.3, '#9a9d96'); v.box(0, 0.85, 0, 0.34, 0.08, 0.34, '#8a8c86'); }
  else { v.box(0, 0, 0, 0.18, 0.95, 0.18, '#5d4630'); v.box(0, 0.95, 0, 0.22, 0.06, 0.22, '#46321f'); }
}
function mooring(v, vr) {
  if (vr === 0) { v.box(0, 0, 0, 0.3, 0.45, 0.3, '#2b2d30'); v.box(0, 0.45, 0, 0.42, 0.12, 0.18, '#2b2d30'); }
  else { v.box(0, 0, 0, 0.22, 0.4, 0.22, '#4b4f54'); v.box(0, 0.4, 0, 0.34, 0.1, 0.34, '#3b3f44'); v.box(0, 0.5, 0, 0.18, 0.14, 0.18, '#f2f0ea'); }
}
function boat(v, gl, night, r, len, vr) {
  const hull = pick(r, ['#1e3a5f', '#2f4f3a', '#2b2b2b', '#7a1f2b', '#f2f0ea', '#4a6fa5']), stripe = pick(r, ['#f2f0ea', '#e9c46a', '#c1121f']);
  v.box(0, -0.15, 0, len, 0.75, 2.5, hull);
  v.box(0, 0.6, 0, len + 0.1, 0.1, 2.6, stripe);
  if (vr === 0) { // open sloep: benches and an engine
    v.box(0, 0.6, 0, len * 0.6, 0.12, 1.6, '#c9a066');
    for (const s of [-1, 1]) v.box(s * len * 0.2, 0.7, 0, 0.3, 0.2, 1.6, '#8a5a34');
    v.box(-len * 0.45, 0.7, 0, 0.4, 0.5, 0.5, '#222');
  } else if (vr === 1) { // cabin cruiser
    v.box(-len * 0.1, 0.7, 0, len * 0.5, 0.9, 1.9, '#f4f1ea');
    v.box(-len * 0.1, 1.6, 0, len * 0.52, 0.12, 2.0, hull);
    (night ? gl : v).box(-len * 0.1, 1.05, 0.96, len * 0.4, 0.35, 0.04, night ? '#ffd98a' : '#9ec5d6');
    (night ? gl : v).box(-len * 0.1, 1.05, -0.96, len * 0.4, 0.35, 0.04, night ? '#ffd98a' : '#9ec5d6');
  } else { // houseboat with a greenhouse and plants
    v.box(0, 0.7, 0, len * 0.8, 1.5, 2.2, pick(r, ['#8a6a4d', '#5a7a5a', '#ded6c4']));
    v.box(0, 2.2, 0, len * 0.84, 0.12, 2.4, '#4a4e57');
    (night ? gl : v).box(0, 1.2, 1.12, len * 0.6, 0.6, 0.04, night ? '#ffd98a' : '#9ec5d6');
    for (let i = 0; i < 3; i++) planterBox(v, -len * 0.3 + i * len * 0.3, 1.2, r, 0.8);
  }
}
function goalPosts(v, w = 7.3, h = 2.44) {
  for (const s of [-1, 1]) v.box(s * w / 2, 0, 0, 0.12, h, 0.12, '#f2f2f2');
  v.box(0, h, 0, w + 0.12, 0.12, 0.12, '#f2f2f2');
  v.box(0, 0.05, -1.6, w, 0.04, 0.04, '#d6d6d6'); v.box(0, h - 0.05, -1.6, w, 0.04, 0.04, '#d6d6d6');
  for (const s of [-1, 1]) { v.box(s * w / 2, h - 0.05, -0.8, 0.04, 0.04, 1.6, '#d6d6d6'); v.box(s * w / 2, 0.05, -0.8, 0.04, 0.04, 1.6, '#d6d6d6'); }
}
function hoop(v, vr) {
  const c = ['#c1121f', '#1d6fa5', '#e85d04'][vr % 3];
  v.box(0, 0, 0, 0.14, 3.0, 0.14, '#4a4e57');
  v.box(0, 2.7, 0.15, 1.2, 0.8, 0.06, '#f4f4f4'); v.box(0, 2.8, 0.19, 0.5, 0.4, 0.03, c);
  v.box(0, 2.7, 0.42, 0.45, 0.05, 0.45, '#e85d04');
}
function crateStack(v, r, w = 0.5) {
  const cols = ['#9a7b4f', '#c9a066', '#7d8e57', '#b5503c'];
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    v.box(r.range(-0.1, 0.1), i * 0.3, r.range(-0.1, 0.1), w, 0.3, w * 0.8, cols[Math.floor(r() * 2)]);
  }
  v.box(0, n * 0.3, 0, w * 0.9, 0.08, w * 0.7, pick(r, ['#e63946', '#ffd166', '#ff9f1c', '#8ecae6', '#b7e4c7', '#7d8e57']));
}
function container(v, r, len = 6, high = 1) {
  const c = pick(r, ['#2a5d8f', '#b5503c', '#4a7d4f', '#d4a017', '#6e7478', '#7a1f2b']);
  for (let i = 0; i < high; i++) {
    v.box(0, i * 2.6, 0, len, 2.5, 2.4, i % 2 ? P.shade(c, 0.85) : c);
    for (let k = 0; k < 6; k++) v.box(-len / 2 + (k + 0.5) * (len / 6), i * 2.6, 1.21, 0.05, 2.5, 0.02, P.shade(c, 0.75));
  }
}
function pallets(v, r) {
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    v.box(i * 1.3, 0, 0, 1.2, 0.14, 0.8, '#b08a52');
    if (r() < 0.8) v.box(i * 1.3, 0.14, 0, 1.1, r.range(0.5, 1.4), 0.7, pick(r, ['#e9e2d0', '#cfd6dc', '#b8b09a', '#a3b1c2']));
  }
}
function mastPole(v, gl, night, r, vr, h, armLen) {
  const c = ['#5d6a63', '#6b7078', '#44494f'][vr % 3];
  v.box(0, 0, 0, 0.3, 0.2, 0.3, '#8a8d8f');
  v.box(0, 0.2, 0, 0.14, h, 0.14, c);
  v.box(0, h - 0.4, armLen / 2, 0.08, 0.08, armLen, c);
  v.box(0, h - 0.8, armLen * 0.5, 0.05, 0.05, armLen * 0.9, '#5a5f66');
  if (vr === 2) (night ? gl : v).box(0, h - 0.45, 0.45, 0.3, 0.1, 0.5, night ? '#ffe9a8' : '#e6e2d4');
}
function trafficLight(v, gl, night, r, st, vr) {
  v.box(0, 0, 0, 0.14, 3.2, 0.14, '#3a3e44');
  v.box(0, 2.4, 0.12, 0.3, 0.9, 0.2, '#1f2226');
  const L = [['#ff3b30', 0.85], ['#ffb703', 0.85], ['#2ee06a', 0.85]];
  for (let i = 0; i < 3; i++) {
    const on = i === st;
    (on && night ? gl : v).box(0, 2.45 + (2 - i) * 0.28, 0.23, 0.17, 0.17, 0.03, on ? L[i][0] : P.shade(L[i][0], 0.3));
  }
  if (vr === 1) { v.box(0, 3.0, 0.9, 0.08, 0.08, 1.8, '#3a3e44'); v.box(0, 2.6, 1.7, 0.3, 0.9, 0.2, '#1f2226'); (night ? gl : v).box(0, 2.9, 1.82, 0.17, 0.17, 0.03, night ? L[st][0] : P.shade(L[st][0], 0.8)); }
  if (vr === 2) { v.box(0, 1.5, -0.1, 0.5, 0.5, 0.04, '#1d6fa5'); v.box(0, 1.55, -0.07, 0.38, 0.38, 0.02, '#f4f4f4'); }
}
function signPost(v, r, vr) {
  v.box(0, 0, 0, 0.08, 2.6, 0.08, '#8d99a6');
  if (vr === 0) { v.box(0, 1.9, 0.06, 1.1, 0.4, 0.04, '#1747b0'); v.box(0, 1.95, 0.09, 0.9, 0.04, 0.01, '#fff'); v.box(0, 1.82, 0.09, 0.7, 0.04, 0.01, '#fff'); v.box(0, 2.35, 0.06, 0.55, 0.55, 0.03, '#d62828'); v.box(0, 2.43, 0.08, 0.35, 0.08, 0.02, '#fff'); }
  else if (vr === 1) { v.box(0, 2.0, 0.06, 0.6, 0.6, 0.03, '#ffffff'); v.box(0, 2.0, 0.08, 0.5, 0.5, 0.02, '#c1121f'); v.box(0, 2.2, 0.1, 0.3, 0.08, 0.02, '#fff'); }
  else { v.box(0, 2.1, 0.06, 0.6, 0.6, 0.03, '#1747b0'); v.box(0, 2.25, 0.09, 0.14, 0.34, 0.02, '#fff'); v.box(0, 2.1, 0.09, 0.3, 0.1, 0.02, '#fff'); }
}
function picnic(v, r, vr, len = 1.8) {
  const w = ['#a9824f', '#5b8a5a', '#d9d2c1'][vr % 3];
  v.box(0, 0.72, 0, len, 0.07, 0.75, w);
  for (const s of [-1, 1]) {
    v.box(0, 0.42, s * 0.62, len, 0.06, 0.28, w);
    for (const e of [-1, 1]) {
      v.box(e * (len / 2 - 0.25), 0, s * 0.62, 0.07, 0.42, 0.07, '#6d4a2c');
    }
  }
  for (const e of [-1, 1]) v.box(e * (len / 2 - 0.25), 0, 0, 0.07, 0.72, 0.07, '#6d4a2c');
}
function lounger(v, c) {
  v.box(0, 0.12, 0.2, 0.7, 0.2, 1.0, '#f4f1e8');
  v.box(0, 0.12, -0.55, 0.7, 0.2, 0.6, c);
  v.box(0, 0.32, -0.9, 0.7, 0.4, 0.1, c);
  v.box(0, 0.32, 0.0, 0.66, 0.04, 0.5, c);
}
function windbreak(v, w, c1, c2) {
  for (const s of [-1, 1]) v.box(s * w / 2, 0, 0, 0.06, 1.35, 0.06, '#c8c0aa');
  const n = Math.round(w / 0.5);
  for (let i = 0; i < n; i++) v.box(-w / 2 + (i + 0.5) * (w / n), 0.2, 0, w / n, 1.0, 0.03, i % 2 ? c1 : c2);
}
/** An open market stall (by night `stallShut` stands in its place). Front towards +z. */
function marketStall(v, r, vr, w) {
  const A = [['#e63946', '#ffffff'], ['#2a9d8f', '#ffffff'], ['#f4a261', '#ffffff'], ['#3a86ff', '#ffffff'], ['#ffb703', '#023047'], ['#52b788', '#ffffff'], ['#1d6fa5', '#ffffff'], ['#7b2d8f', '#f4f1e8']];
  const [a, b] = pick(r, A), d = 1.5;
  v.box(0, 0, 0.1, w, 0.95, d - 0.4, vr === 3 ? '#cfe5ee' : '#cdbfa3'); // counter
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) v.box(sx * (w / 2 - 0.05), 0.95, sz * (d / 2 - 0.1), 0.07, 1.45, 0.07, '#d8d8d8');
  const n = Math.round(w / 0.4);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    if (vr === 2) v.box(x, 2.4, 0, w / n, 0.06, d + 0.2, i % 2 ? '#e8edf0' : '#b9c7cf'); // plain tarp
    else v.box(x, 2.38 + (vr === 1 ? 0.05 : 0), 0, w / n, 0.08, d + 0.2, i % 2 ? a : b);
    if (vr !== 2) v.box(x, 2.2, d / 2 + 0.12, w / n, 0.2, 0.04, i % 2 ? b : a);
  }
  // goods in front
  const kind = vr;
  if (kind === 0) { // fruit and vegetables in crates
    for (let i = 0; i < Math.floor(w / 0.6); i++) v.box(-w / 2 + 0.4 + i * 0.6, 0.95, 0.4, 0.5, 0.12, 0.42, pick(r, ['#d62828', '#f77f00', '#52b788', '#ffd166', '#7d8e57', '#9d4edd']));
    for (let i = 0; i < 3; i++) v.box(-w / 2 + 0.4 + i * 0.9, 0, 0.9, 0.5, 0.3, 0.4, '#9a7b4f');
  } else if (kind === 1) { // clothes on a rail
    v.box(0, 1.9, 0.5, w * 0.9, 0.04, 0.04, '#8a9199');
    for (let i = 0; i < Math.floor(w / 0.35); i++) v.box(-w / 2 + 0.3 + i * 0.35, 1.0, 0.5, 0.2, 0.9, 0.06, pick(r, SHIRTS));
  } else if (kind === 3) { // fish on ice
    v.box(0, 0.95, 0.3, w * 0.9, 0.1, 0.7, '#e8f2f6');
    for (let i = 0; i < Math.floor(w / 0.5); i++) v.box(-w / 2 + 0.35 + i * 0.5, 1.05, 0.3, 0.34, 0.06, 0.16, pick(r, ['#8a9ba8', '#c9d3da', '#d9a15b']));
  } else { // household goods
    for (let i = 0; i < Math.floor(w / 0.45); i++) v.box(-w / 2 + 0.3 + i * 0.45, 0.95, 0.35, 0.3, 0.2 + r() * 0.25, 0.3, pick(r, ['#ff70a6', '#8ecae6', '#ffd166', '#e9e2d0', '#52b788']));
  }
}

// ---- the four common kinds of street furniture, each in several looks (the gag anchors only need where they stand)
const BENCHW = ['#b07a45', '#8d6e4c', '#c19a6b', '#9a6a3a'];
function benchV(v, r, vr) {
  const len = [1.5, 1.7, 1.9, 2.1][Math.floor(r() * 4)], w = pick(r, BENCHW);
  if (vr === 0) { // slatted wood on steel feet
    v.box(0, 0.36, 0, len, 0.1, 0.5, w);
    for (const sx of [-1, 1]) v.box(sx * (len / 2 - 0.15), 0, 0, 0.1, 0.36, 0.4, '#444');
    v.box(0, 0.46, -0.22, len, 0.5, 0.08, w);
  } else if (vr === 1) { // modern steel mesh, a little lower, with a thin back
    v.box(0, 0.4, 0, len, 0.06, 0.46, '#6e7478');
    for (const sx of [-1, 1]) v.box(sx * (len / 2 - 0.1), 0, 0, 0.08, 0.4, 0.42, '#32363a');
    v.box(0, 0.5, -0.22, len, 0.38, 0.05, '#6e7478');
  } else if (vr === 2) { // concrete block with a wooden top, no back
    v.box(0, 0, 0, len, 0.38, 0.5, pick(r, ['#b9b6ad', '#a8a59c', '#c9c5ba']));
    v.box(0, 0.38, 0, len + 0.04, 0.06, 0.55, w);
  } else { // green painted park bench with arm rests
    const g = pick(r, ['#2f6b4f', '#2a5d8f', '#4a4e57']);
    v.box(0, 0.36, 0, len, 0.1, 0.5, g);
    for (const sx of [-1, 1]) { v.box(sx * (len / 2 - 0.1), 0, 0, 0.1, 0.36, 0.42, '#2b2d30'); v.box(sx * (len / 2 - 0.06), 0.46, 0, 0.07, 0.07, 0.46, g); }
    v.box(0, 0.46, -0.22, len, 0.55, 0.08, g);
  }
}
function binV(v, r, vr) {
  const k = r.range(0.92, 1.1);
  if (vr === 0) { v.box(0, 0, 0, 0.5 * k, 0.8 * k, 0.5 * k, '#2e7d4f'); v.box(0, 0.8 * k, 0, 0.58 * k, 0.1, 0.58 * k, '#1f5a38'); v.box(0, 0.5, 0.26 * k, 0.3, 0.1, 0.02, '#111'); }
  else if (vr === 1) { v.box(0, 0, 0, 0.44 * k, 0.9 * k, 0.44 * k, '#3b3f44'); v.box(0, 0.9 * k, 0, 0.5 * k, 0.07, 0.5 * k, '#222'); v.box(0, 0.7 * k, 0, 0.46 * k, 0.1, 0.46 * k, '#f77f00'); v.box(0, 0.45, 0.23 * k, 0.26, 0.1, 0.02, '#0e0e0e'); }
  else if (vr === 2) { v.box(0, 0, 0, 0.38 * k, 1.0 * k, 0.38 * k, '#8a9199'); v.box(0, 1.0 * k, 0, 0.44 * k, 0.08, 0.44 * k, '#2a2d31'); v.box(0, 0.62, 0.2 * k, 0.24, 0.12, 0.02, '#14161a'); }
  else { v.box(0, 0, 0, 0.62 * k, 0.95 * k, 0.62 * k, '#2f6fb0'); v.box(0, 0.95 * k, 0, 0.68 * k, 0.1, 0.68 * k, '#f5c400'); v.box(0, 0.6, 0.32 * k, 0.34, 0.14, 0.02, '#0f2a4a'); }
}
function mailboxV(v, r, vr) {
  const k = r.range(0.92, 1.12);
  if (vr === 0) { v.box(0, 0, 0, 0.2, 0.5, 0.2, '#555'); v.box(0, 0.5, 0, 0.7 * k, 0.8 * k, 0.5, '#f77f00'); v.box(0, 1.0, 0.26, 0.4, 0.06, 0.02, '#222'); }
  else if (vr === 1) { for (const sx of [-1, 1]) v.box(sx * 0.28, 0, 0, 0.1, 0.55, 0.1, '#555'); v.box(0, 0.55, 0, 0.8 * k, 0.9 * k, 0.5, '#e86a00'); v.box(0, 1.15, 0.26, 0.5, 0.06, 0.02, '#222'); v.box(0, 0.8, 0.26, 0.3, 0.2, 0.02, '#fff3e0'); }
  else { v.box(0, 0, 0, 0.14, 0.9, 0.14, '#4a4e57'); v.box(0, 0.9, 0, 0.5 * k, 0.5 * k, 0.4, pick(r, ['#c1121f', '#f77f00', '#1d6fa5'])); v.box(0, 1.2, 0.21, 0.32, 0.05, 0.02, '#222'); }
}
function boxV(v, r, vr) {
  const w = [2.0, 1.6, 1.2, 1.8][vr % 4] * r.range(0.95, 1.08), h = [1.5, 1.4, 1.7, 1.3][vr % 4] * r.range(0.95, 1.08), c = ['#7f9a8a', '#a7a9a0', '#5f7a68', '#8a8f94'][vr % 4];
  v.box(0, 0, 0, w, h, 0.7, c);
  v.box(0, h, 0, w + 0.1, 0.1, 0.8, P.shade(c, 0.8));
  v.box(w * 0.25, 0.2, -0.36, w * 0.35, h * 0.73, 0.03, P.shade(c, 0.9));
  if (vr % 4 === 2) v.box(-w * 0.25, 0.2, -0.36, w * 0.35, h * 0.73, 0.03, P.shade(c, 0.9));
  return { w, h };
}


const AWNS = [['#e63946', '#ffffff'], ['#2a9d8f', '#ffffff'], ['#f4a261', '#ffffff'], ['#3a86ff', '#ffffff'], ['#ffb703', '#023047'], ['#52b788', '#ffffff'], ['#1d6fa5', '#ffffff'], ['#7b2d8f', '#f4f1e8'], ['#c1121f', '#ffd166'], ['#118a7e', '#f1faee']];
/** A market stall closed for the night: bare frame with the awning folded down over the counter. Front towards +z. */
function stallShut(v, r, w) {
  const [a] = pick(r, AWNS);
  v.box(0, 0, -0.72, w, 2.2, 0.05, '#cfcfca');
  for (const sx of [-1, 1]) v.box(sx * (w / 2 - 0.05), 0, 0.7, 0.07, 2.2, 0.07, '#d8d8d8');
  v.box(0, 0.05, 0.1, w, 1.0, 1.2, P.shade(a, 0.7)); // tarp over the counter
  v.box(0, 2.2, 0, w + 0.1, 0.08, 1.6, '#b9b9b4');
}
/** The bulk market stall: ~10 boxes. kind 0 vegetables, 1 fish, 2 fabrics, 3 clothes, 4 snacks. Front towards +z, footprint w x 1.5. */
function stallCheap(v, r, kind, w) {
  const [a, b] = kind === 1 ? ['#1d6fa5', '#ffffff'] : kind === 4 ? pick(r, [['#c1121f', '#ffd166'], ['#e85d04', '#ffffff']]) : pick(r, AWNS);
  v.box(0, 0, 0.15, w, 0.92, 0.9, kind === 4 ? '#454a52' : kind === 1 ? '#cfe5ee' : '#cdbfa3');
  v.box(0, 0, -0.72, w, 2.2, 0.05, '#cfcfca');
  for (const sx of [-1, 1]) v.box(sx * (w / 2 - 0.05), 0.9, 0.68, 0.07, 1.3, 0.07, '#d8d8d8');
  v.box(-w / 4, kind === 4 ? 2.5 : 2.3, 0, w / 2 + 0.02, 0.07, 1.65, a);
  v.box(w / 4, kind === 4 ? 2.5 : 2.3, 0, w / 2 + 0.02, 0.07, 1.65, b);
  if (kind === 0) {
    for (let i = 0; i < 3; i++) v.box(-w / 3 + i * (w / 3), 0.92, 0.3, w / 3 - 0.08, 0.16, 0.5, pick(r, ['#d62828', '#f77f00', '#52b788', '#ffd166', '#7d8e57', '#9d4edd']));
    v.box(-w / 2 + 0.35, 0, 1.0, 0.5, 0.35, 0.4, '#9a7b4f'); v.box(w / 2 - 0.35, 0, 1.0, 0.5, 0.5, 0.4, '#b08a52');
  } else if (kind === 1) {
    v.box(0, 0.92, 0.3, w * 0.9, 0.1, 0.6, '#e8f2f6');
    for (let i = 0; i < 3; i++) v.box(-w / 3 + i * (w / 3), 1.02, 0.3, 0.38, 0.05, 0.16, pick(r, ['#8a9ba8', '#c9d3da', '#d9a15b']));
  } else if (kind === 2) {
    for (let i = 0; i < 4; i++) v.box(-w * 0.36 + i * (w * 0.24), 0.92, 0.35, 0.26, 0.85, 0.26, pick(r, ['#e63946', '#2a9d8f', '#ffd166', '#3a86ff', '#9d4edd', '#ff70a6']));
  } else if (kind === 3) {
    v.box(0, 1.85, 0.5, w * 0.9, 0.04, 0.04, '#8a9199');
    for (let i = 0; i < 4; i++) v.box(-w * 0.34 + i * (w * 0.23), 1.0, 0.5, 0.2, 0.85, 0.06, pick(r, SHIRTS));
  } else {
    v.box(-w / 4, 0.92, 0.15, w * 0.3, 0.25, 0.4, '#9aa5ad');
    v.box(w / 4, 1.0, 0.7, w * 0.5, 0.35, 0.05, pick(r, ['#ffd166', '#ffffff', '#ff8fab']));
  }
}

// ================================================================ the tile
/**
 * Furniture for one map tile, drawn into the tile's builders. Called once per tile at the finest level of detail.
 * Reads: key, grid, C, trees [x, z, size, ...], pois [[kind, x, y] ...] (decimetres), yAt, v, gl, group, night, lite, roads.
 * Optional (tolerated when missing): ps (flat [cat, nameIdx, flags] per poi, see poicats.js), rails, tile (the tile's raw data).
 * Returns { props }: what the cutscenes may want to use, in tile coordinates; after it, what only stands in the way (`inTheWay`).
 */
export function furnishTile(o) {
  const { key, grid, C, trees, pois, yAt, v, gl, group, night, lite } = o;
  const ps = o.ps && o.ps.length >= (pois ? pois.length * 3 : 0) && o.ps.length ? o.ps : null;
  const raw = o.tile || null, rails = o.rails || [];
  const [ktx, kty] = key.split('_').map(Number), ox = ktx * TILE, oy = kty * TILE; // map metres of the tile's south-west corner
  const rnd = makeRng(hashStr('furn|' + key));
  const props = [];
  // What stands in the street without being an anchor for a scene (statues, fountains and shelters of the map, the stops and
  // planters put down here): only the obstacle picture and the camera want them. They join `props` in finish(), after
  // everything is placed, so nothing that counts props while placing (the cap below) ever sees them.
  const inTheWay = [];
  const cap = lite ? 120 : 320;
  let bonus = 0; // what a terrace field may hold on top of the tile's allowance (see the fields below)
  // By night the furniture stands where it stands by day, so every budget gate must see the day's count. What only the day
  // shows is drawn by night into the ghost, which only counts its boxes (24 vertices each, as Vox); what only the night shows
  // goes through nightOnly, which keeps its vertices out of the count. By day `lit` stays 0 and the ghost only counts the
  // shelters a stop does not get (see the stops).
  const ghost = { n: 0, box() { this.n += 24; return this; }, setT() { return this; } };
  const dayV = night ? ghost : v; // the builder of what only the day shows
  let lit = 0;
  const nightOnly = (draw) => { const n0 = v.n + gl.n; draw(); lit += v.n + gl.n - n0; };
  const used = () => v.n + gl.n + ghost.n - lit - bonus;
  const LIMIT = lite ? 30000 : 60000; // vertices of furniture a tile may hold in all
  let RESERVE = lite ? 12000 : 26000; // of which terraces and places may take this much before the generic items go in

  // ---- ground tables
  const set = (...c) => { const t = new Uint8Array(256); for (const k of c) t[k] = 1; return t; };
  const OK = set(C.WALK, C.LAND, C.PLAZA, C.GRASS, C.FOREST, C.DUNE, C.SAND, C.PARKING, C.CURB, C.FOOT, C.DIRT, C.PED);
  const GOOD = set(C.WALK, C.PED, C.PLAZA, C.LAND, C.FOOT);
  const GOODSAND = set(C.WALK, C.PED, C.PLAZA, C.LAND, C.FOOT, C.SAND);
  const SOSO = set(C.DIRT, C.GRASS, C.SAND, C.DUNE, C.FOREST, C.PITCH, C.FARM);
  const ROADY = set(C.ASPHALT, C.KLINKER, C.SERVICE, C.BIKELANE, C.CYCLE, C.MARK, C.CURB, C.PARKING, C.RAILBED, C.RAIL);

  // ---- trees: a coarse lookup so no prop stands in a trunk
  const tg = new Map();
  for (let i = 0; i + 2 < trees.length; i += 3) {
    const k = Math.floor(trees[i] / 8) * 64 + Math.floor(trees[i + 1] / 8);
    let l = tg.get(k);
    if (!l) tg.set(k, (l = []));
    l.push(trees[i], trees[i + 1]);
  }
  const treeNear = (x, z, r) => {
    const gx = Math.floor(x / 8), gz = Math.floor(z / 8);
    for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
      const l = tg.get(a * 64 + b);
      if (l) for (let i = 0; i < l.length; i += 2) if (Math.hypot(l[i] - x, l[i + 1] - z) < r) return true;
    }
    return false;
  };

  // ---- what stands where
  const taken = []; // { kind, x, z, r }
  const crowded = (kind, x, z, r, same = 0) => {
    for (const t of taken) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < r + t.r || (same && t.kind === kind && d < same)) return true;
    }
    return false;
  };
  const stand = (kind, x, z, r) => taken.push({ kind, x, z, r });
  /** Do the sample points (in the prop's frame, +z towards the road) all lie on open ground, clear of trunks and others? */
  const fits = (kind, x, z, n, pts, treeR, r, same = 0) => {
    if (x < EDGE || z < EDGE || x > TILE - EDGE || z > TILE - EDGE) return false;
    const sn = n[0], cs = n[1]; // local z -> (sin, cos)
    for (const [lx, lz] of pts) {
      const px = x + lx * cs + lz * sn, pz = z - lx * sn + lz * cs;
      if (!OK[grid.get(px, pz)]) return false;
      if (treeR && treeNear(px, pz, treeR)) return false;
      if (railSegs.length && railNear(px, pz, 1.8)) return false;
    }
    return !crowded(kind, x, z, r, same);
  };
  const frameOf = (nx, nz) => { const th = Math.atan2(nx, nz); return [Math.sin(th), Math.cos(th), th]; };
  const aim = (th, x, z) => { const y = yAt(x, z); v.setT(th, x, z, y); gl.setT(th, x, z, y); return y; };
  const holder = (th, x, z) => { const g = new THREE.Group(); g.position.set(x, yAt(x, z), z); g.rotation.y = th; group.add(g); return g; };
  const toMap = (x, z) => [ox + x, oy + TILE - z];

  // free-standing things of the tile (statues, fountains, playgrounds ...) and fences: terraces keep clear of them
  const fences = [];
  if (raw) {
    for (const e of raw.f || []) {
      const x = e[1] / 10, z = TILE - e[2] / 10, t = e[0];
      if (t === 8) stand('statue', x, z, 3.2);
      else if (t === 9) stand('fountain', x, z, clamp(e[4] / 10 * 0.5 + 1.8, 3, 14));
      else if (t === 11) stand('playground', x, z, 5.5);
      else if (t === 10) stand('shelterf', x, z, 2.4);
      else if (t === 1) stand('fuel', x, z, 9);
      else stand('feature', x, z, 1.6);
      // drawn by world.js / landmarks.js `drawFeature`; a shelter there turns by the feature's own direction (the same `rot`)
      if (t === 8 || t === 9) inTheWay.push({ kind: t === 8 ? 'statue' : 'fountain', x, z, ax: 1, az: 0, nx: 0, nz: 1 });
      else if (t === 10) {
        const rot = Number.isFinite(e[3]) ? Math.PI / 2 - (e[3] * Math.PI) / 180 : 0;
        inTheWay.push({ kind: 'stop', x, z, ax: Math.cos(rot), az: -Math.sin(rot), nx: Math.sin(rot), nz: Math.cos(rot) });
      }
    }
    for (const e of raw.x || []) {
      const a = [];
      for (let i = 2; i + 1 < e.length; i += 2) a.push(e[i] / 10, TILE - e[i + 1] / 10);
      if (a.length >= 4) fences.push(a);
    }
  }
  const barrierNear = (x, z, r) => {
    for (const a of fences) {
      for (let i = 0; i + 3 < a.length; i += 2) {
        const ax = a[i], az = a[i + 1], dx = a[i + 2] - ax, dz = a[i + 3] - az, l2 = dx * dx + dz * dz || 1e-9;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
        if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r) return true;
      }
    }
    return false;
  };

  // ---- the curated places that touch this tile
  const places = placesFor(ktx, kty);
  if (places.some((p) => p.recipes.field)) RESERVE = lite ? 6000 : 15000; // a terrace field gets most of the budget
  const placeOf = (x, z, recipe) => {
    const m = toMap(x, z);
    for (const p of places) if ((!recipe || p.recipes[recipe]) && placeHas(p, m[0], m[1])) return p;
    return null;
  };

  // tram and train tracks as segments, so nothing is put down on rails the ground grid did not paint (a track in a pedestrian street)
  const railSegs = [];
  for (const rl of rails) {
    if (!rl.a || rl.flags & 4) continue;
    for (let i = 0; i + 3 < rl.a.length; i += 2) railSegs.push(rl.a[i], rl.a[i + 1], rl.a[i + 2], rl.a[i + 3]);
  }
  const railNear = (x, z, r) => {
    for (let i = 0; i < railSegs.length; i += 4) {
      const ax = railSegs[i], az = railSegs[i + 1], dx = railSegs[i + 2] - ax, dz = railSegs[i + 3] - az, l2 = dx * dx + dz * dz || 1e-9;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r) return true;
    }
    return false;
  };

  // ---- the real streets of this tile
  const pieces = [];
  for (const r of o.roads || []) {
    if (r.cls > 8 || r.cls === 1 || r.flags & 6 || !r.a || r.a.length < 4) continue; // not along motorways either
    const pl = prep(r.a);
    if (pl.len < 8) continue;
    pl.cls = r.cls; pl.w = r.w; pl.name = r.name || '';
    pieces.push(pl);
  }
  if (!pieces.length && !(pois && pois.length) && !places.length && !rails.length) return finish();

  // shop-like points of interest, to tell a busy street from a quiet one
  const shops = [];
  for (const p of pois || []) if (SHOPPY.has(p[0])) shops.push(p[1] / 10, TILE - p[2] / 10);
  const busyAt = (x, z) => { let n = 0; for (let i = 0; i < shops.length; i += 2) if (Math.hypot(shops[i] - x, shops[i + 1] - z) < 35) n++; return n >= 3; };

  // ---- pavement scan: from a point on the centre line, look across to one side
  const cache = new Map();
  const scan = (pi, side, s) => {
    const ck = (pi * 2 + (side < 0 ? 0 : 1)) * 100000 + Math.round(s * 2);
    let r = cache.get(ck);
    if (r) return r;
    const pl = pieces[pi], f = frameAt(pl, s), nx = -f.tz * side, nz = f.tx * side;
    let e = -1, end = -1, bd = Infinity, soft = -1, sand = false;
    for (let d = 0.5; d <= 14; d += 0.3) {
      const x = f.x + nx * d, z = f.z + nz * d, c = grid.get(x, z);
      if (c === C.BUILDING) { bd = d; break; }
      if (GOOD[c]) { if (e < 0) e = d; end = d; }
      else if (e >= 0) { if (d - end > 0.9) break; }
      else if (SOSO[c]) { if (soft < 0 && d > 1.4) { soft = d; sand = c === C.SAND; } }
      else if (!ROADY[c] && d > 1.6) break; // a wall or water before any pavement
    }
    if (e >= 0 && pl.cls === 8) e = Math.max(e, 1.8); // keep the middle of a pedestrian street open for walking
    const ok = e >= 0 && end > e;
    const back = Number.isFinite(bd) && (!ok || bd - end <= 1.0) ? bd : end;
    r = { ok, e, end, bd, back, hasB: Number.isFinite(bd) && (!ok || bd - end <= 1.0), w: ok ? back - e : 0, soft, sand, nx, nz, f };
    cache.set(ck, r);
    return r;
  };

  const add = (kind, x, z, f, nx, nz, extra) => {
    props.push({ kind, x, z, ax: f.tx, az: f.tz, nx, nz, ...extra });
  };

  // ---- nearest real street to a point (for shelters and terraces)
  const nearestRoad = (x, z, maxD) => {
    let best = null, bd = maxD;
    pieces.forEach((pl, pi) => {
      for (let i = 0; i + 1 < pl.n; i++) {
        const ax = pl.a[i * 2], az = pl.a[i * 2 + 1], dx = pl.a[i * 2 + 2] - ax, dz = pl.a[i * 2 + 3] - az, l2 = dx * dx + dz * dz || 1e-9;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1), ex = ax + dx * t, ez = az + dz * t, d = Math.hypot(x - ex, z - ez);
        if (d < bd) { bd = d; best = { pi, pl, s: pl.cum[i] + t * Math.sqrt(l2), x: ex, z: ez, d }; }
      }
    });
    return best;
  };

  // ================================================================ terraces and curated places
  // The points of interest, with their category and flags where the tile has them
  const eats = [];
  (pois || []).forEach((p, i) => {
    const x = p[1] / 10, z = TILE - p[2] / 10, kind = p[0];
    let cat = null, fl = 0;
    if (ps) { cat = POI_CATS[ps[i * 3]] || 'other'; fl = ps[i * 3 + 2] | 0; }
    else if (TERRACE_KINDS.has(kind)) { cat = 'cafe'; fl = POI_FLAG.TERRACE; } // old tiles: the old rule
    eats.push({ i, x, z, kind, cat, fl });
  });
  const dig = (e, tag) => makeRng(hashStr(key + '|' + tag + '|' + e.i + '|' + Math.round(e.x * 7) + '|' + Math.round(e.z * 7)));

  /** Where is the front of a venue, and which way does it face? Direction by facade: out of the building along the way
   *  with the longest open walkable ground beyond it, leaning towards the nearest street (or the sea for a beach club). */
  // the building a point stands in (or next to), and the way the data says it fronts (bf: compass direction / 10)
  let bboxes = null;
  const frontDirOf = (px, pz) => {
    if (!raw || !raw.b || !raw.bf) return null;
    if (!bboxes) {
      bboxes = raw.b.map((e, bi) => {
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
        for (let i = 3; i + 1 < e.length; i += 2) { const x = e[i] / 10, z = TILE - e[i + 1] / 10; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
        return [x0, z0, x1, z1, bi];
      });
    }
    const inRing = (e, x, z) => {
      let c = false;
      const n = e.length;
      for (let i = 3, k = n - 2; i + 1 < n; k = i, i += 2) {
        const xi = e[i] / 10, zi = TILE - e[i + 1] / 10, xk = e[k] / 10, zk = TILE - e[k + 1] / 10;
        if ((zi > z) !== (zk > z) && x < ((xk - xi) * (z - zi)) / (zk - zi) + xi) c = !c;
      }
      return c;
    };
    for (const [ox2, oz2] of [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2], [2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4]]) {
      const x = px + ox2, z = pz + oz2;
      for (const b of bboxes) if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && inRing(raw.b[b[4]], x, z)) {
        const d = raw.bf[b[4]];
        if (d < 0 || d === undefined) return null;
        return [Math.sin((d * 10 * Math.PI) / 180), -Math.cos((d * 10 * Math.PI) / 180)];
      }
    }
    return null;
  };
  const frontOf = (e, G, sea) => {
    const px = e.x, pz = e.z, inB = grid.get(px, pz) === C.BUILDING, q = nearestRoad(px, pz, 40), bfd = sea ? null : frontDirOf(px, pz);
    let rvx = 0, rvz = 0;
    if (q && q.d > 0.5) { rvx = (q.x - px) / q.d; rvz = (q.z - pz) / q.d; }
    let best = null;
    for (let k = 0; k < (bfd ? 25 : 24); k++) {
      const th = (k / 24) * TAU, dx = k === 24 ? bfd[0] : Math.sin(th), dz = k === 24 ? bfd[1] : Math.cos(th);
      let d = 0;
      if (inB) { for (d = 0.5; d <= 22; d += 0.5) if (grid.get(px + dx * d, pz + dz * d) !== C.BUILDING) break; if (d > 22) continue; }
      else {
        let hit = -1;
        for (let t = 0.5; t <= 6; t += 0.5) if (grid.get(px - dx * t, pz - dz * t) === C.BUILDING) { hit = t; break; }
        if (hit < 0) { if (!sea) continue; d = 0; } else d = -hit + 0.6;
      }
      const bx = px + dx * d, bz = pz + dz * d;
      let run = 0;
      for (let t = 0.3; t <= 14; t += 0.3) { if (G[grid.get(bx + dx * t, bz + dz * t)]) run = t; else break; }
      if (run < 1.8) continue;
      let score = Math.min(run, 6) - Math.abs(d) * 0.4 + 1.5 * (dx * rvx + dz * rvz);
      if (bfd) score += 6 * Math.max(0, dx * bfd[0] + dz * bfd[1]) ** 2;
      if (sea) score += 3 * (dx * sea[0] + dz * sea[1]);
      if (!best || score > best.score) best = { bx, bz, nx: dx, nz: dz, score, free: !inB && d === 0, inB };
    }
    if (!best && !inB && e.cat === 'terrace' && q) best = { bx: px, bz: pz, nx: rvx, nz: rvz, score: 0, free: true, inB: false };
    return best;
  };

  const eligible = [];
  for (const e of eats) {
    const pl = placeOf(e.x, e.z, 'terraces'), plb = placeOf(e.x, e.z, 'beach');
    e.pl = pl; e.plb = plb; e.beach = !!plb;
    if (!e.cat) continue;
    const flagged = (e.fl & POI_FLAG.TERRACE) && EAT.has(e.cat);
    const forced = (pl || plb) && FORCE.has(e.cat);
    if (flagged || forced) eligible.push(e);
  }
  // beach clubs of a `beach` place also get their deck whether flagged or not
  let nTerr = 0;
  const maxTerr = lite ? 16 : 44;

  /** Build one terrace for a venue. Returns the number of table cells. */
  const buildTerrace = (e, front, nbr) => {
    const r = dig(e, 'terr'), cat = e.cat, pl = e.pl, T = pl ? pl.recipes.terraces || {} : {}, beach = e.beach, G = beach ? GOODSAND : GOOD;
    const { bx, bz, nx, nz } = front, rx = nz, rz = -nx; // local +x in tile coordinates
    const baseW = { pub: 9, restaurant: 8, cafe: 7, ice_cream: 3.8, terrace: 8, snackbar: 4.6, burger: 4.6, pizza: 4.6, kebab: 4, sandwich: 4.2, bakery: 4.2, coffeeshop: 5, fish: 4.6, asian: 6, roti: 6, chicken: 4.4 }[cat] || 6;
    let W = baseW * (T.width || 1) * r.range(0.85, 1.25);
    if (beach) W = 9 * r.range(0.9, 1.3);
    const lim = [Math.min(W / 2, nbr.l), Math.min(W / 2, nbr.r)]; // reach to the left (−x) and right (+x)
    const maxD = 11;
    const wx = (lx, lz) => bx + rx * lx + nx * lz, wz = (lx, lz) => bz + rz * lx + nz * lz;
    // how deep can tables go at each probe column?
    const runs = [], probe = 1.0;
    for (let lx = -lim[0]; lx <= lim[1] + 1e-6; lx += probe) {
      let run = 0, ended = 0;
      for (let t = 0.3; t <= maxD; t += 0.3) {
        const x = wx(lx, t), z = wz(lx, t), c = grid.get(x, z);
        if (!G[c] || treeNear(x, z, 1.7) || barrierNear(x, z, 0.6) || crowded('terr', x, z, 0.5) || railNear(x, z, 1.9)) { ended = c; break; }
        run = t;
      }
      runs.push({ lx, use: run - (ROADY[ended] ? (run < 2.3 ? 0.9 : run < 2.7 ? 1.0 : 1.3) : 0.25) }); // a walking strip is left at the kerb
    }
    if (runs.length < 3) return 0;
    const usable = (lx) => { let b = runs[0], bd = 1e9; for (const q of runs) if (Math.abs(q.lx - lx) < bd) { bd = Math.abs(q.lx - lx); b = q; } return b.use; };
    const sorted = runs.map((q) => q.use).sort((a, b) => a - b), med = sorted[Math.floor(sorted.length * 0.6)];
    if (med < 0.8) return 0;
    const narrow = med < 2.2; // a narrow pavement: one row of two-seat tables tight against the wall, the walking strip at the kerb
    // style
    const want = T.tables && T.tables !== 'mix' ? T.tables : null;
    let style;
    if (narrow) style = 'bistro2';
    else if (med < 2.4) style = med >= 1.9 && cat === 'pub' && r() < 0.6 ? 'high' : 'bistro2';
    else if (want) style = want;
    else if (beach) style = r() < 0.6 ? 'lounge' : 'bistro';
    else if (cat === 'pub') style = pick(r, ['high', 'bench', 'sq4', 'bench', 'high']);
    else if (cat === 'ice_cream' || cat === 'snackbar' || cat === 'burger' || cat === 'pizza' || cat === 'kebab' || cat === 'sandwich' || cat === 'fish') style = pick(r, ['bistro2', 'high', 'bistro']);
    else if (cat === 'cafe' || cat === 'bakery' || cat === 'coffeeshop') style = pick(r, ['bistro', 'bistro', 'sq4', 'lounge', 'bistro']);
    else style = pick(r, ['sq4', 'sq4', 'bistro', 'bench']);
    if (style === 'lounge' && med < 3) style = 'bistro';
    if (style === 'bench' && med < 2.6) style = 'sq4';
    const ST = STYLES[style];
    // scene of the terrace: the dice that make this one unlike its neighbours
    const fam = T.parasol || (beach ? 'straw' : pick(r, ['brand', 'brand', 'dark', 'striped', 'cream']));
    const pc = pick(r, COLS[fam] || COLS.brand), chairKind = T.chairs && T.chairs !== 'mix' ? T.chairs : pick(r, ['wicker', 'wood', 'bistro', 'bistro']);
    const S = {
      v, gl, night, r, dv: dayV, nightOnly, chairKind, chairCol: pick(r, CHAIRCOL[chairKind]), wood: pick(r, ['#8d6e4c', '#a9824f', '#6d4a2c']),
      top: pick(r, TOPS), dishes: cat !== 'ice_cream', occ: clamp(0.38 * (T.busy || 1) * r.range(0.7, 1.25), 0.08, 0.92), // (as full by night: the same dice)
    };
    if (style === 'lounge') { S.top = pick(r, ['#6d4a2c', '#4a4e57', '#8d6e4c']); S.chairCol = pick(r, ['#b08a5a', '#8a9a8f', '#c9b79a']); }
    const pkind = T.big ? 'big' : style === 'bistro2' || style === 'high' ? null : pick(r, ['sq', 'sq', 'round', 'stripe', 'sail', 'round'].filter((k) => k !== 'stripe' || fam === 'striped' || r() < 0.3));
    const ph = r.range(2.25, 2.6);
    const open = med > 5.2, rows = open ? Math.min(T.maxRows || 3, 6) : Math.max(1, Math.min(T.maxRows || 3, Math.floor((med - 0.5 + 0.2) / ST.rp)));
    const aisleEvery = open ? (T.big ? 2 : r() < 0.5 ? 2 : 3) : 99;
    const cols = Math.max(1, Math.floor((lim[0] + lim[1]) / ST.cp)), x0 = (lim[1] - lim[0]) / 2 - ((cols - 1) * ST.cp) / 2;
    const th = Math.atan2(nx, nz), sn = Math.sin(th), cs = Math.cos(th);
    const cells = [];
    const doorGap = front.free ? 0 : 1.0;
    for (let ri = 0; ri < rows; ri++) {
      const lz = (narrow ? 0.1 : 0.5) + ST.hd + ri * ST.rp + Math.floor(ri / aisleEvery) * 1.5;
      for (let ci = 0; ci < cols; ci++) {
        const lx = x0 + ci * ST.cp;
        if (ri === 0 && doorGap && !narrow && Math.abs(lx) < doorGap + ST.cp * 0.25 && cols > 2) continue;
        if (usable(lx) < lz + ST.hd) continue;
        // all footprint samples on open walkable ground, clear of trunks, fences and other things
        const hw = ST.cp / 2 - 0.15, hd = ST.hd - 0.1;
        let ok = true;
        for (const [sx, sz] of [[0, 0], [hw, 0], [-hw, 0], [0, hd], [0, -hd]]) {
          const x = wx(lx + sx, lz + sz), z = wz(lx + sx, lz + sz);
          if (x < EDGE || z < EDGE || x > TILE - EDGE || z > TILE - EDGE || !G[grid.get(x, z)] || treeNear(x, z, sx || sz ? 1.4 : 1.9) || barrierNear(x, z, 0.4) || railNear(x, z, 1.9)) { ok = false; break; }
        }
        if (!ok || crowded('terr', wx(lx, lz), wz(lx, lz), 1.0)) continue;
        cells.push({ lx, lz, ri, ci });
      }
    }
    if (!cells.length) return 0;
    const y0 = yAt(bx, bz) + (beach ? 0.1 : 0);
    v.setT(th, bx, bz, y0); gl.setT(th, bx, bz, y0);
    let minX = 1e9, maxX = -1e9, maxZ = 0;
    if (beach) { // a wooden deck under the whole terrace
      let a = 1e9, b = -1e9, d = 0;
      for (const c of cells) { a = Math.min(a, c.lx - ST.cp / 2); b = Math.max(b, c.lx + ST.cp / 2); d = Math.max(d, c.lz + ST.hd); }
      const nb = Math.max(2, Math.round((b - a) / 1.6)), dc = pick(r, ['#a8855a', '#9a7b52', '#b79566', '#8d7a63']);
      for (let i = 0; i < nb; i++) v.box(a + (i + 0.5) * ((b - a) / nb), -0.1, (d + 0.3) / 2, (b - a) / nb - 0.02, 0.1, d + 0.3, i % 2 ? dc : P.shade(dc, 0.9));
    }
    for (const c of cells) {
      cellDraw(S, style, c.lx, c.lz);
      if (pkind && ST.par) {
        const sz = Math.min(ST.cp - 0.2, T.big ? 3.0 : 2.6);
        parasol(v, pkind, c.lx, c.lz, sz, ph, pc);
      }
      minX = Math.min(minX, c.lx - ST.cp / 2); maxX = Math.max(maxX, c.lx + ST.cp / 2); maxZ = Math.max(maxZ, c.lz + ST.hd);
      stand('terrace', wx(c.lx, c.lz), wz(c.lx, c.lz), 1.0);
      stand('terr', wx(c.lx, c.lz), wz(c.lx, c.lz), 0.4);
    }
    const okAt = (lx, lz, rr = 0.5) => { const x = wx(lx, lz), z = wz(lx, lz); return G[grid.get(x, z)] && !treeNear(x, z, rr + 0.4) && !barrierNear(x, z, rr) && x > EDGE && z > EDGE && x < TILE - EDGE && z < TILE - EDGE; };
    // heaters in the gaps
    const hch = T.heaters !== undefined ? T.heaters : 0.3;
    if (r() < hch && ST.par) {
      const n = Math.min(4, 1 + Math.floor(cells.length / 5));
      for (let i = 0; i < n; i++) {
        const c = cells[Math.floor(r() * cells.length)], hx = c.lx + ST.cp / 2 - 0.02, hz = c.lz + (r() < 0.5 ? 0.5 : -0.5);
        if (!okAt(hx, hz, 0.3) || cells.some((q) => q !== c && Math.abs(q.lx - hx) < 0.45 && Math.abs(q.lz - hz) < 0.45)) continue;
        heater(v, gl, night, hx, hz);
      }
    }
    // a light string over the terrace, and its poles
    const lch = T.lights !== undefined ? T.lights : beach ? 0.75 : 0.35;
    if (r() < lch && cells.length >= 2) {
      const zo = maxZ + 0.4, bulb = pick(r, WARM), xa = minX - 0.3, xb = maxX + 0.3;
      if (okAt(xa, zo, 0.2) && okAt(xb, zo, 0.2) && okAt(xa, 0.3, 0.2) && okAt(xb, 0.3, 0.2)) {
        const ph2 = r.range(3.0, 3.5);
        for (const px of [xa, xb]) { pole(v, px, zo, ph2); pole(v, px, 0.3, ph2); }
        festoon(v, gl, night, xa, zo, xb, zo, ph2 + 0.1, ph2 + 0.1, bulb);
        festoon(v, gl, night, xa, 0.3, xb, 0.3, ph2 + 0.1, ph2 + 0.1, bulb);
        festoon(v, gl, night, xa, 0.3, xa, zo, ph2 + 0.1, ph2 + 0.1, bulb);
        festoon(v, gl, night, xb, 0.3, xb, zo, ph2 + 0.1, ph2 + 0.1, bulb);
        if (xb - xa > 7) { const xm = (xa + xb) / 2; if (okAt(xm, zo, 0.2) && okAt(xm, 0.3, 0.2)) { pole(v, xm, zo, ph2); pole(v, xm, 0.3, ph2); festoon(v, gl, night, xm, 0.3, xm, zo, ph2 + 0.1, ph2 + 0.1, bulb); } }
      }
    }
    // planters, wind screens along the open side
    if ((T.wind || r() < 0.3) && cells.length >= 2) {
      const zo = maxZ + 0.2;
      for (let lx = minX + 0.6; lx < maxX - 0.4; lx += T.wind ? 2.1 : 1.3) {
        if (!okAt(lx, zo, 0.3)) continue;
        if (T.wind) { v.box(lx, 0.1, zo, 2.0, 1.0, 0.04, '#bfe3f2'); v.box(lx - 1.0, 0, zo, 0.06, 1.2, 0.06, '#7a838a'); v.box(lx + 1.0, 0, zo, 0.06, 1.2, 0.06, '#7a838a'); }
        else planterBox(v, lx, zo, r, 1.1);
      }
    }
    // beach club: loungers and windbreaks on the sand beyond the deck, flags, a few beach people
    if (beach) {
      const zl = maxZ + 2.3, nl = 2 + Math.floor(r() * 5), c1 = pick(r, ['#e63946', '#1d6fa5', '#2a9d8f', '#e9c46a', '#ff70a6']), c2 = pick(r, ['#ffffff', '#ffd166', '#8ecae6']);
      for (let i = 0; i < nl; i++) {
        const lx = minX + 1 + i * 1.5;
        if (lx > maxX || !okAt(lx, zl, 0.5)) continue;
        v.setT(th, wx(lx, zl), wz(lx, zl), yAt(wx(lx, zl), wz(lx, zl)));
        lounger(v, i % 3 ? c1 : c2);
        if (r() < S.occ + 0.1) lying(v, 0.0, 0.0, 0, lookOf(r), '#f4f1e8');
        v.setT(th, bx, bz, y0);
      }
      const zw = maxZ + 4.2;
      if (r() < 0.8) for (let i = 0; i < 2; i++) {
        const lx = minX + 1.6 + i * (maxX - minX - 3.2);
        if (!okAt(lx, zw, 0.5)) continue;
        // drawn where it was tested (the builder stands at the terrace's front)
        const x = wx(lx, zw), z = wz(lx, zw);
        v.setT(th, x, z, yAt(x, z));
        windbreak(v, 3.0, pick(r, ['#e63946', '#1d6fa5', '#2a9d8f']), '#ffffff');
        v.setT(th, bx, bz, y0);
      }
      for (const lx of [minX - 0.4, maxX + 0.4]) if (okAt(lx, 0.8, 0.3) && r() < 0.8) { v.setT(th, wx(lx, 0.8), wz(lx, 0.8), yAt(wx(lx, 0.8), wz(lx, 0.8))); flagpole(v, r, 1); v.setT(th, bx, bz, y0); }
    }
    // a menu board at the door, a waiter, people standing with a drink
    if (!narrow && okAt(1.6, 0.6, 0.3) && r() < 0.8) menuBoard(v, r() < 0.5 ? 1.6 : -1.6, 0.55, r);
    if (!narrow && cells.length >= 3 && r() < 0.65) {
      const wxl = r.range(minX + 0.5, maxX - 0.5);
      if (okAt(wxl, 0.28, 0.2)) standing(v, person(v, wxl, 0.3, 0), lookOf(r), 'tray');
    }
    if (!narrow && (cat === 'pub' || cat === 'cafe' || beach) && r() < 0.55) {
      const n = 2 + Math.floor(r() * 2), gx = pick(r, [-1, 1]) * r.range(1.4, 2.4);
      for (let i = 0; i < n; i++) {
        const lx = gx + i * 0.6, lz = 0.28 + r.range(0, 0.15);
        if (okAt(lx, lz, 0.2)) standing(v, person(v, lx, lz, i % 2 ? 0 : 3), lookOf(r), pick(r, STANDS), cat === 'pub' ? '#e8a317' : '#fff');
      }
    }
    v.setT(); gl.setT();
    // anchors for the stage: one per pair of tables
    const byRow = new Map();
    for (const c of cells) { if (!byRow.has(c.ri)) byRow.set(c.ri, []); byRow.get(c.ri).push(c); }
    for (const list of byRow.values()) for (let i = 0; i < list.length; i += 2) {
      const a = list[i], b = list[Math.min(list.length - 1, i + 1)], lx = (a.lx + b.lx) / 2, lz = a.lz;
      add('terrace', wx(lx, lz), wz(lx, lz), { tx: rx, tz: rz }, nx, nz, { style, venue: cat });
    }
    nTerr++;
    return cells.length;
  };

  // ---- two passes over the venues: fronts first (so neighbours share a frontage), then drawing
  const frontList = [];
  {
    const fr = frontList;
    for (const e of eligible) {
      const sea = e.plb ? ((c) => [Math.sin((c * Math.PI) / 180), -Math.cos((c * Math.PI) / 180)])(e.plb.recipes.beach.seaward || 300) : null;
      const f = frontOf(e, e.beach ? GOODSAND : GOOD, sea);
      if (f) fr.push({ e, f });
    }
    fr.sort((p, q) => p.e.x - q.e.x || p.e.z - q.e.z);
    for (const a of fr) {
      const rx = a.f.nz, rz = -a.f.nx;
      let l = 99, rr = 99;
      for (const b of fr) {
        if (a === b) continue;
        const dxw = b.f.bx - a.f.bx, dzw = b.f.bz - a.f.bz, lat = dxw * rx + dzw * rz, nrm = dxw * a.f.nx + dzw * a.f.nz;
        if (Math.abs(nrm) > 7 || a.f.nx * b.f.nx + a.f.nz * b.f.nz < 0.3 || Math.abs(lat) > 18) continue;
        if (Math.abs(lat) < 1.5) { if (Math.abs(nrm) < 1.5 && (a.e.i > b.e.i)) { l = 0; rr = 0; } continue; }
        if (lat < 0) l = Math.min(l, Math.max(1.2, -lat / 2 - 0.15)); else rr = Math.min(rr, Math.max(1.2, lat / 2 - 0.15));
      }
      a.nbr = { l, r: rr };
    }
    for (const a of fr) {
      if (nTerr >= maxTerr || used() > RESERVE) break;
      if (a.nbr.l === 0 && a.nbr.r === 0) continue;
      buildTerrace(a.e, a.f, a.nbr);
    }
  }

  // ================================================================ recipes of the curated places
  const tileOfMap = (mx, my) => [mx - ox, oy + TILE - my];
  const inTile = (x, z, m = 3) => x > m && z > m && x < TILE - m && z < TILE - m;
  /** Is a ground sample free for an overhead pole or small furniture? */
  const freeAt = (x, z, set, treeR = 0.8) => inTile(x, z, EDGE) && set[grid.get(x, z)] && !treeNear(x, z, treeR) && !barrierNear(x, z, 0.4) && !railNear(x, z, 1.8) && !crowded('x', x, z, 0.5);
  const dirTh = (dx, dz) => Math.atan2(-dz, dx); // frame whose local +x runs along (dx, dz)
  const placeSeed = (p, tag) => makeRng(hashStr(key + '|' + p.id + '|' + tag));
  for (const pl of places) {
    const R = pl.recipes;
    // ---- strings of lights from facade to facade across the open ground
    if (R.garlands && used() < RESERVE + 4000) {
      const r = placeSeed(pl, 'garland'), dens = R.garlands.density || 1;
      let made = 0;
      const want = Math.round((lite ? 2 : 5) * dens);
      for (let t = 0; t < 140 && made < want; t++) {
        const px = r.range(8, TILE - 8), pz = r.range(8, TILE - 8);
        const m = toMap(px, pz);
        if (!placeHas(pl, m[0], m[1]) || !GOOD[grid.get(px, pz)] || crowded('x', px, pz, 1.0)) continue;
        // along a street or across the square: try a few directions and take the one that runs to a facade at both ends
        const base = r() * Math.PI;
        let best = null;
        for (let k = 0; k < 6; k++) {
          const th = base + (k * Math.PI) / 6, dx = Math.cos(th), dz = Math.sin(th);
          let a = 0, b = 0, ok = true;
          for (a = 0.5; a < 40; a += 0.5) { const c = grid.get(px + dx * a, pz + dz * a); if (c === C.BUILDING) break; if (!GOOD[c]) { ok = false; break; } }
          if (!ok || a >= 40) continue;
          for (b = 0.5; b < 40; b += 0.5) { const c = grid.get(px - dx * b, pz - dz * b); if (c === C.BUILDING) break; if (!GOOD[c]) { ok = false; break; } }
          if (!ok || b >= 40) continue;
          const L = a + b - 1.2;
          if (L < 9 || L > 42) continue;
          if (!best || L < best.L) best = { dx, dz, a, b, L };
        }
        if (!best) continue;
        const xa = px - best.dx * (best.b - 0.7), za = pz - best.dz * (best.b - 0.7), xb = px + best.dx * (best.a - 0.7), zb = pz + best.dz * (best.a - 0.7);
        if (!freeAt(xa, za, GOOD, 0.6) || !freeAt(xb, zb, GOOD, 0.6)) continue;
        if (crowded('pole', xa, za, 0.4, 7) || crowded('pole', xb, zb, 0.4, 7)) continue;
        const th = dirTh(best.dx, best.dz), h = r.range(4.2, 5.0), bulb = pick(r, WARM);
        aim(th, xa, za);
        pole(v, 0, 0, h);
        festoon(v, gl, night, 0, 0, best.L, 0, h + 0.05, h + 0.05, bulb);
        aim(th, xb, zb); pole(v, 0, 0, h);
        stand('pole', xa, za, 0.3); stand('pole', xb, zb, 0.3);
        made++;
      }
    }
    // ---- Chinese lanterns across the street
    if (R.lanterns) {
      const r = placeSeed(pl, 'lantern'), names = R.lanterns.streets;
      pieces.forEach((pc, pi) => {
        if (names && !names.includes(pc.name)) return;
        for (let s = 6 + r.range(0, 4); s < pc.len - 3; s += r.range(7.5, 10.5)) {
          if (used() > LIMIT - 3000) return;
          const f = frameAt(pc, s), m = toMap(f.x, f.z);
          if (!placeHas(pl, m[0], m[1])) continue;
          // run to the facade on both sides
          const wall = (sd) => { for (let d = 1; d < 14; d += 0.5) { const c = grid.get(f.x - f.tz * sd * d, f.z + f.tx * sd * d); if (c === C.BUILDING) return d - 0.2; if (c === C.WATER || c === 255) return -1; } return -1; };
          const wl = wall(1), wr = wall(-1);
          if (wl < 2 || wr < 2) continue;
          const ax = f.x - f.tz * wl, az = f.z + f.tx * wl, bx2 = f.x + f.tz * wr, bz2 = f.z - f.tx * wr, L = wl + wr;
          const th = dirTh(bx2 - ax, bz2 - az), y = r.range(5.0, 5.6), sc = r.range(0.95, 1.35);
          aim(th, ax, az);
          festoon(v, gl, night, 0, 0, L, 0, y, y, '#ff5a3c');
          v.box(0, y - 0.2, 0, 0.2, 0.4, 0.2, '#6b5a3a'); v.box(L, y - 0.2, 0, 0.2, 0.4, 0.2, '#6b5a3a');
          const sag = clamp(L * 0.06, 0.15, 0.7);
          const nL = Math.max(2, Math.round(L / 2.1));
          for (let i = 0; i < nL; i++) {
            const t = (i + 0.5) / nL, ly = y - sag * 4 * t * (1 - t) - 0.15;
            lantern(v, gl, night, L * t, ly - 0.45 * sc, 0, sc, r() < 0.15 ? '#e0a100' : '#c1121f');
          }
        }
      });
      v.setT(); gl.setT();
    }
    // ---- market stalls in rows along the street. By default only on the pavements (the crowd's cars drive the
    // carriageway); `inRoad: true` puts them on the road itself for a street that is closed for the market.
    if (R.market) {
      const r = placeSeed(pl, 'market'), names = R.market.streets, inRoad = !!R.market.inRoad, rShut = night ? placeSeed(pl, 'market-shut') : null;
      const MK = set(C.WALK, C.LAND, C.PLAZA, C.PED, C.FOOT, ...(inRoad ? [C.ASPHALT, C.KLINKER, C.CURB, C.MARK, C.SERVICE] : []));
      let nst = 0;
      pieces.forEach((pc, pi) => {
        if (names && !names.includes(pc.name)) return;
        for (const side of [-1, 1]) {
          let s = 3 + r.range(0, 2);
          while (s < pc.len - 3 && nst < (lite ? 4 : 8)) {
            const w = r.range(2.6, 3.4), sm = s + w / 2, f = frameAt(pc, sm), m = toMap(f.x, f.z);
            const step = w + r.range(0.15, 0.5) + (r() < 0.07 ? 5 : 0);
            if (placeHas(pl, m[0], m[1]) && r() < 0.93) {
              let x, z, nx, nz, okp = true;
              if (inRoad) {
                const offs = clamp(pc.w / 2 - 0.9, 1.9, 3.6);
                x = f.x - f.tz * side * offs; z = f.z + f.tx * side * offs; nx = f.tz * side; nz = -f.tx * side;
              } else {
                const sc = scan(pi, side, sm);
                if (!sc.ok || sc.back - sc.e < 1.7) okp = false;
                else { const off = sc.back - 0.85; x = sc.f.x - sc.f.tz * side * off; z = sc.f.z + sc.f.tx * side * off; nx = sc.f.tz * side; nz = -sc.f.tx * side; }
              }
              if (okp) {
                const fr = frameOf(nx, nz);
                const pts = [[0, 0], [w / 2 - 0.2, 0], [-w / 2 + 0.2, 0], [0, 0.7], [0, -0.7], [w / 2 - 0.2, 0.7], [-w / 2 + 0.2, -0.7]];
                let ok = inTile(x, z, EDGE);
                for (const [lx, lz] of pts) { const px = x + lx * fr[1] + lz * fr[0], pz = z - lx * fr[0] + lz * fr[1]; if (!MK[grid.get(px, pz)] || treeNear(px, pz, 1.1) || barrierNear(px, pz, 0.3) || railNear(px, pz, 1.9)) { ok = false; break; } }
                if (ok && !crowded('mstall', x, z, w / 2 + 0.2)) {
                  const vr = Math.floor(r() * 4);
                  aim(fr[2], x, z);
                  // by night the open stall, its crates and its shoppers are only counted (dayV), and the stall stands shut
                  marketStall(dayV, r, vr, w);
                  if (night) nightOnly(() => stallShut(v, rShut, w));
                  if (r() < 0.5) { dayV.setT(fr[2], x, z, yAt(x, z)); crateStack(dayV, r, 0.5); }
                  stand('mstall', x, z, w / 2 + 0.2); nst++;
                  add('mstall', x, z, f, nx, nz, { w, label: ['groente', 'kleding', 'textiel', 'vis'][vr] });
                  // a shopper or two in front (the crowd walks past them)
                  if (r() < 0.8) {
                    for (let i = 0, n = 1 + (r() < 0.5 ? 1 : 0); i < n; i++) {
                      const lx = r.range(-w / 2 + 0.3, w / 2 - 0.3), lz = 1.5 + r.range(0, 0.4);
                      const px = x + lx * fr[1] + lz * fr[0], pz = z - lx * fr[0] + lz * fr[1];
                      if (!MK[grid.get(px, pz)] || treeNear(px, pz, 0.6)) continue;
                      standing(dayV, person(dayV, lx, lz, 2, 1), lookOf(r), pick(r, ['bag', 'bag', 'idle', 'phone']), pick(r, ['#e63946', '#2a9d8f', '#f4a261', '#ffffff', '#1d3557']));
                    }
                  }
                }
              }
            }
            s += step;
          }
        }
      });

      // ---- the market ground itself: back-to-back rows of stalls with 3.5 m aisles, a wide cross aisle every ~30 m,
      // a 2 m free edge all round (the entrances), shoppers and vendors by day, everything shut at night
      const G2 = R.market.ground;
      if (G2) {
        const MG = set(C.WALK, C.LAND, C.PLAZA, C.PED, C.FOOT, C.PARKING);
        const a = (G2.angle || 0) * Math.PI / 180, ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux;
        const [sx, sz] = tileOfMap(G2.seed[0], G2.seed[1]), halfW = G2.halfW || 36, halfL = G2.halfL || 170;
        const th = Math.atan2(-uz, ux), PITCH_U = 3.4, PITCH_V = 6.5;
        const cells = [];
        const iMax = Math.ceil(halfL / PITCH_U), jMax = Math.ceil(halfW / PITCH_V);
        for (let i = -iMax; i <= iMax; i++) {
          if (((i % 9) + 9) % 9 < 2) continue; // cross aisle (6.8 m) every 30.6 m
          for (let j = -jMax; j <= jMax; j++) {
            const x = sx + ux * i * PITCH_U + vx * j * PITCH_V, z = sz + uz * i * PITCH_U + vz * j * PITCH_V;
            if (!inTile(x, z, 3)) continue;
            const m = toMap(x, z);
            if (!placeHas(pl, m[0], m[1])) continue;
            cells.push({ x, z, i, j, d: Math.hypot(i * PITCH_U, j * PITCH_V) });
          }
        }
        cells.sort((p, q) => p.d - q.d);
        const capM = used() + (lite ? 10000 : 30000), placed = [];
        const rm = placeSeed(pl, 'mground');
        CHEAP = true;
        for (const c of cells) {
          if (used() > capM || placed.length >= (lite ? 20 : 48)) break; // the same count by day and night
          const w = 2.9 + ((hashStr(key + c.i + '|' + c.j) % 5) * 0.1); // 2.9 to 3.3 m wide
          const bad = (px, pz) => !MG[grid.get(px, pz)] || treeNear(px, pz, 1.4) || barrierNear(px, pz, 0.6) || railNear(px, pz, 2.2);
          let ok = !crowded('mstall', c.x, c.z, 2.0);
          if (ok) for (const [lx, lz] of [[0, 0], [w / 2 + 2, 0], [-w / 2 - 2, 0], [0, 1.5 + 2], [0, -1.5 - 2], [w / 2 + 2, 3.5], [-w / 2 - 2, -3.5], [w / 2 + 2, -3.5], [-w / 2 - 2, 3.5]]) {
            if (bad(c.x + ux * lx + vx * lz, c.z + uz * lx + vz * lz)) { ok = false; break; }
          }
          if (!ok) continue;
          const r2 = makeRng(hashStr(key + '|ms|' + c.i + '|' + c.j)), rShut = night ? makeRng(hashStr(key + '|msshut|' + c.i + '|' + c.j)) : null;
          for (const side of [-1, 1]) { // the two stalls of a pair, fronts to opposite aisles
            const px = c.x + vx * side * 0.75, pz = c.z + vz * side * 0.75, kind = Math.floor(r2() * 5);
            aim(side > 0 ? th : th + Math.PI, px, pz);
            // by night the open stall and its vendor are only counted (dayV), and the stall stands shut
            stallCheap(dayV, r2, kind, w);
            if (r2() < 0.7) standing(dayV, person(dayV, r2.range(-w / 3, w / 3), -0.35, 0), lookOf(r2), pick(r2, ['idle', 'idle', 'phone']), '#ffffff'); // the vendor, behind the counter
            if (night) nightOnly(() => stallShut(v, rShut, w));
          }
          stand('mstall', c.x, c.z, 2.0);
          placed.push(c);
          add('mstall', c.x, c.z, { tx: ux, tz: uz }, vx, vz, { w, label: 'markt' });
        }
        // shoppers in the aisles, some with bags or a trolley (never at night: the market is closed, they are only counted)
        for (const c of placed) {
          if (used() > capM + (lite ? 1500 : 3500)) break;
          if (rm() > 0.42) continue;
          const side = rm() < 0.5 ? -1 : 1, lx = rm.range(-1.4, 1.4), lz = side * (3.25 + rm.range(-0.8, 0.8));
          const x = c.x + ux * lx + vx * lz, z = c.z + uz * lx + vz * lz;
          if (!MG[grid.get(x, z)] || treeNear(x, z, 0.5)) continue;
          aim(th, x, z);
          const face = Math.floor(rm() * 4);
          standing(dayV, person(dayV, 0, 0, face, rm() < 0.12 ? 0.62 : 1), lookOf(rm), pick(rm, ['bag', 'bag', 'trolley', 'idle', 'phone']), pick(rm, ['#e63946', '#2a9d8f', '#f4a261', '#ffffff', '#1d3557', '#8d99ae']));
        }
        CHEAP = false;
      }
      v.setT(); gl.setT();
    }
    // ---- harbour: fish stalls, crates and baskets along the quay
    if (R.stalls) {
      const r = placeSeed(pl, 'stalls');
      let made = 0;
      pieces.forEach((pc, pi) => {
        for (let s = 10 + r.range(0, 6); s < pc.len - 6; s += r.range(14, 24)) {
          if (made >= (lite ? 3 : 7) || used() > LIMIT - 4000) return;
          const f0 = frameAt(pc, s), m = toMap(f0.x, f0.z);
          if (!placeHas(pl, m[0], m[1])) continue;
          for (const side of r() < 0.5 ? [1, -1] : [-1, 1]) {
            const sc = scan(pi, side, s);
            if (!sc.ok || sc.back - sc.e < 3.2) continue;
            const off = Math.max(sc.back - 1.6, sc.e + 1.5), x = sc.f.x - sc.f.tz * side * off, z = sc.f.z + sc.f.tx * side * off, nx = sc.f.tz * side, nz = -sc.f.tx * side, fr = frameOf(nx, nz);
            if (!fits('stall', x, z, fr, [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9], [0, 0], [0, 1.6]], 2.0, 2.4, 14)) continue;
            const lab = pick(r, ['HARING', 'VIS', 'HARING', 'FRIET']);
            aim(fr[2], x, z);
            P.stall(holder(fr[2], x, z), v, 0, 0, lab, STALLS[lab], 0, 1);
            // crates and baskets beside it, a queue in front
            v.setT(fr[2], x, z, yAt(x, z));
            for (let i = 0; i < 2; i++) { v.setT(fr[2], x + (i ? 1.9 : -1.9) * fr[1], z - (i ? 1.9 : -1.9) * fr[0], yAt(x, z)); crateStack(v, r, 0.55); }
            v.setT(fr[2], x, z, yAt(x, z));
            for (let i = 0, n = Math.floor(r.range(0, 3.2)); i < n; i++) standing(v, person(v, r.range(-0.9, 0.9), 1.3 + i * 0.7, 2), lookOf(r), pick(r, ['idle', 'bag', 'phone']), '#ffffff');
            stand('stall', x, z, 2.4);
            add('stall', x, z, sc.f, nx, nz, { label: lab });
            made++;
            break;
          }
        }
      });
      v.setT(); gl.setT();
    }
    // ---- picnic and sunbathing on the grass
    if (R.picnic) {
      const r = placeSeed(pl, 'picnic'), RR = R.picnic, per = lite ? Math.ceil((RR.n || 6) / 2) : RR.n || 6, tables = RR.tables !== false;
      const rStay = night ? placeSeed(pl, 'picnic-night') : null;
      let made = 0;
      for (let t = 0; t < 260 && made < per && used() < LIMIT - 3000; t++) {
        const x = r.range(8, TILE - 8), z = r.range(8, TILE - 8), m = toMap(x, z);
        if (!placeHas(pl, m[0], m[1]) || grid.get(x, z) !== C.GRASS) continue;
        let ok = true;
        for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2.2, 2.2], [-2.2, -2.2]]) if (grid.get(x + dx, z + dz) !== C.GRASS) { ok = false; break; }
        if (!ok || treeNear(x, z, 3.2) || railNear(x, z, 4) || crowded('picnic', x, z, 3.2, 14)) continue;
        const kind = tables && r() < 0.45 ? 'table' : r() < 0.7 ? 'blanket' : 'group';
        const fq = Math.floor(r() * 4);
        aim(kind === 'table' ? fq * (Math.PI / 2) : 0, x, z);
        const home = r() < 0.9;
        // the people: by night the day's dice still roll, but only about one picnic in three keeps its people (35 in 100
        // in all); the others are only counted
        const hv = night && rStay() >= 0.35 / 0.9 ? ghost : v;
        if (kind === 'table') {
          picnic(v, r, Math.floor(r() * 3), r.range(1.6, 2.2));
          if (home) for (const s2 of [-1, 1]) for (const a of [-0.5, 0.5]) if (r() < 0.65) seated(hv, person(hv, a, s2 * 0.62, s2 > 0 ? 2 : 0), lookOf(r), pick(r, POSES));
          if (r() < 0.6) dayV.box(0.2, 0.79, 0, 0.35, 0.2, 0.3, '#c9a066'); // a picnic basket (a candle by night)
          if (night) nightOnly(() => candle(v, gl, night, 0, 0, 0.78));
          add('picnic', x, z, { tx: Math.cos(fq * (Math.PI / 2)), tz: -Math.sin(fq * (Math.PI / 2)) }, 0, 1, {});
          stand('picnic', x, z, 3.0);
        } else if (kind === 'blanket') {
          v.box(0, 0, 0, 2.0, 0.03, 2.0, pick(r, ['#e63946', '#2a9d8f', '#f4a261', '#3a86ff', '#9d4edd', '#ffd166']));
          v.box(0.7, 0.03, 0.6, 0.35, 0.28, 0.35, '#c9a066');
          if (home) { if (r() < 0.7) lying(hv, 0, 0, fq, lookOf(r), pick(r, ['#ffffff', '#ff70a6', '#8ecae6'])); else seated(hv, { ...person(hv, 0, 0, fq), y: -0.4 }, lookOf(r), pick(r, POSES)); }
          if (home && r() < 0.5) { hv.box(1.5, 0, 1.0, 0.3, 0.3, 0.3, pick(r, ['#ffffff', '#ff4d6d', '#ffd166'])); } // a ball
          stand('picnic', x, z, 2.6);
        } else {
          const n = 3 + Math.floor(r() * 3);
          for (let i = 0; i < n && home; i++) {
            const a = (i / n) * TAU + r(), px = Math.cos(a) * 1.0, pz = Math.sin(a) * 1.0;
            standing(hv, person(hv, px, pz, Math.floor(((a + Math.PI) / TAU) * 4 + 0.5) & 3, r() < 0.15 ? 0.62 : 1), lookOf(r), pick(r, ['drink', 'idle', 'phone', 'drink']));
          }
          stand('picnic', x, z, 2.2);
        }
        made++;
      }
      v.setT(); gl.setT();
    }
    // ---- a fairground / snack kiosk, exactly where the table says
    if (R.kiosk) {
      const r = placeSeed(pl, 'kiosk'), K = R.kiosk, [kx, kz] = tileOfMap(K.x, K.y);
      if (inTile(kx, kz, 8)) {
        let spot = null;
        for (let d = 0; d < 14 && !spot; d += 1.5) for (let k = 0; k < 8 && !spot; k++) {
          const x = kx + Math.cos((k / 8) * TAU) * d, z = kz + Math.sin((k / 8) * TAU) * d;
          let ok = true;
          for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -2.5], [3, 3], [-3, 3]]) if (!OK[grid.get(x + dx, z + dz)] || grid.get(x + dx, z + dz) === C.CURB || treeNear(x + dx, z + dz, 1.2) || railNear(x + dx, z + dz, 2.2)) { ok = false; break; }
          if (ok && !crowded('kiosk', x, z, 4)) spot = [x, z];
        }
        if (spot) {
          const [x, z] = spot, f = Math.floor(r() * 4), th = f * (Math.PI / 2) + r.range(-0.2, 0.2), c1 = pick(r, ['#c1121f', '#1d6fa5', '#e85d04']);
          aim(th, x, z);
          v.box(0, 0, -0.4, 4.2, 2.5, 2.4, '#f4efe2');
          v.box(0, 2.5, -0.4, 4.6, 0.25, 2.8, c1);
          for (let i = 0; i < 8; i++) v.box(-1.95 + i * 0.56, 2.15, 1.05, 0.56, 0.35, 0.08, i % 2 ? '#ffffff' : c1);
          v.box(0, 0.95, 0.95, 4.2, 0.08, 0.7, '#8d6e4c'); // counter shelf
          for (const sx of [-1.9, 1.9]) v.box(sx, 0, 1.2, 0.1, 2.15, 0.1, '#e4e4e4');
          (night ? gl : v).box(0, 2.78, 0.7, 3.4, 0.7, 0.12, night ? '#ffd166' : '#f2c14e');
          v.box(0, 3.0, 0.78, 2.6, 0.18, 0.02, c1);
          for (let i = 0; i < 6; i++) v.box(-1.2 + i * 0.48, 1.03, 1.1, 0.3, 0.2, 0.3, pick(r, ['#ffd166', '#ff70a6', '#8ecae6', '#e9e2d0']));
          // bunting
          for (let i = 0; i < 12; i++) (night && i % 3 === 0 ? gl : v).box(-3 + i * 0.5, 3.3 - 0.18 * Math.sin((i / 11) * Math.PI), 0.1, 0.22, 0.3, 0.02, pick(r, ['#e63946', '#ffd166', '#2a9d8f', '#3a86ff', '#ff70a6']));
          // queue and two high tables
          for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) standing(v, person(v, -1.0 + r.range(-0.6, 1.4), 2.4 + i * 0.75, 2, r() < 0.2 ? 0.62 : 1), lookOf(r), pick(r, ['idle', 'cone', 'phone']), pick(r, ['#ffffff', '#ff70a6', '#ffd166']));
          for (const sx of [-3.2, 3.2]) { tableRound(v, sx, 2.6, 0.62, 1.05, '#c9c2b2', '#3b3b3f'); drink(v, gl, night, sx, 2.6, 1.1, r); }
          v.setT(); gl.setT();
          stand('kiosk', x, z, 3.2);
          add('kiosk', x, z, { tx: Math.cos(th), tz: -Math.sin(th) }, Math.sin(th), Math.cos(th), {});
        }
      }
    }
    // ---- a station forecourt: bicycle parks full of bikes, bollards
    if (R.station) {
      const r = placeSeed(pl, 'station'), [sx0, sz0] = tileOfMap(pl.x, pl.y), N = R.station.racks || 6;
      let made = 0;
      for (let t = 0; t < 120 && made < N && used() < LIMIT - 3000; t++) {
        const a = r() * TAU, d = r.range(14, 70), x = sx0 + Math.cos(a) * d, z = sz0 + Math.sin(a) * d;
        if (!inTile(x, z, 4)) continue;
        const fq = Math.floor(r() * 2) * 2, th = fq * (Math.PI / 2);
        r(); // (a spare draw, kept so that every later draw of this place stays the same)
        const fr = frameOf(Math.sin(th), Math.cos(th));
        if (!fits('rack', x, z, fr, [[-2.2, -1.3], [2.2, -1.3], [-2.2, 1.9], [2.2, 1.9], [0, 0]], 1.5, 3.2, 6)) continue;
        let good = true;
        for (const [dx, dz] of [[-2.2, -1.3], [2.2, -1.3], [-2.2, 1.9], [2.2, 1.9]]) if (!GOOD[grid.get(x + dx, z + dz)]) good = false;
        if (!good) continue;
        aim(th, x, z);
        P.bikeRack(v, 0, -0.9, r, 5, 0);
        P.bikeRack(v, 0, 1.0, r, 5, 0);
        stand('rack', x, z, 3.2);
        add('rackpark', x, z, { tx: Math.cos(th), tz: -Math.sin(th) }, Math.sin(th), Math.cos(th));
        made++;
      }
      v.setT(); gl.setT();
    }
  }


  // ---- terrace fields: a curated square lays one continuous field of tables out from the cafe fronts into the square,
  // in neat rows with lanes (3 m along the facades, one every ~13 m), clear of statues and of the places' `keep` circles
  for (const pl of places) {
    const R = pl.recipes.field;
    if (!R) continue;
    const T = pl.recipes.terraces || {}, r = placeSeed(pl, 'field');
    const mine = frontList.filter((q) => q.e.pl === pl || (q.e.plb === pl));
    if (!mine.length) continue;
    // lattice angle: the way the facades run (circular mean over quarter turns)
    let sa = 0, ca = 0;
    for (const q of mine) { const a = Math.atan2(q.f.nx, q.f.nz) * 4; sa += Math.sin(a); ca += Math.cos(a); }
    const ang = Math.atan2(sa, ca) / 4, ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
    const th = Math.atan2(-uz, ux), style = R.style || 'bistro', ST = STYLES[style], reach = R.reach || 22, lane = R.lane || 13;
    const keeps = (R.keep || []).map((k) => { const q = tileOfMap(k[0], k[1]); return [q[0], q[1], k[2]]; });
    for (const e of raw && raw.f ? raw.f : []) if (e[0] === 8) keeps.push([e[1] / 10, TILE - e[2] / 10, R.statue || 12]);
    const fam = T.parasol || 'cream', big = !!T.big;
    // one scene (colours, chairs, crowd) per venue, so every cafe has its own parasols
    const scenes = new Map();
    const sceneOf = (q) => {
      let S = scenes.get(q);
      if (!S) {
        const rr = dig(q.e, 'fieldscene'), ck = T.chairs && T.chairs !== 'mix' ? T.chairs : pick(rr, ['wicker', 'wood', 'bistro']);
        S = { v, gl, night, r, dv: dayV, nightOnly, chairKind: ck, chairCol: pick(rr, CHAIRCOL[ck]), wood: pick(rr, ['#8d6e4c', '#a9824f', '#6d4a2c']), top: pick(rr, TOPS), dishes: false,
          occ: clamp(0.3 * (T.busy || 1) * rr.range(0.8, 1.2), 0.1, 0.9), pc: pick(rr, COLS[fam] || COLS.cream), pk: big ? 'big' : pick(rr, ['sq', 'sq', 'round']), ph: rr.range(2.3, 2.6) };
        scenes.set(q, S);
      }
      return S;
    };
    const cands = [];
    const cx0 = mine.reduce((a, q) => a + q.f.bx, 0) / mine.length, cz0 = mine.reduce((a, q) => a + q.f.bz, 0) / mine.length;
    const nI = Math.ceil(130 / ST.cp), nJ = Math.ceil(130 / ST.rp);
    for (let i = -nI; i <= nI; i++) for (let j = -nJ; j <= nJ; j++) {
      const lx = i * ST.cp, lz = j * ST.rp, x = cx0 + ux * lx + vx * lz, z = cz0 + uz * lx + vz * lz;
      if (!inTile(x, z, 4)) continue;
      const m = toMap(x, z);
      if (!placeHas(pl, m[0], m[1])) continue;
      // lanes
      if (lane && (((lx % lane) + lane) % lane < ST.cp * 0.6 || ((lz % lane) + lane) % lane < ST.rp * 0.6)) continue;
      if (keeps.some((k) => Math.hypot(k[0] - x, k[1] - z) < k[2])) continue;
      let best = null, bd = reach;
      for (const q of mine) { const d = Math.hypot(q.f.bx - x, q.f.bz - z); if (d < bd) { bd = d; best = q; } }
      if (!best) continue;
      cands.push({ x, z, d: bd, q: best, i, j });
    }
    cands.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
    // a square full of tables is what the place is known for: its field gets half as much again as a tile's furniture
    // allowance, and that extra is not held against the benches, bins and racks that come after it
    const base = LIMIT - (lite ? 3000 : 6000), cap = base + (lite ? 0 : 30000), before = used();
    CHEAP = true;
    const hw = ST.cp / 2 - 0.15, hd = ST.hd - 0.1;
    for (const c of cands) {
      if (used() > cap) break;
      const { x, z } = c;
      let ok = !crowded('terr', x, z, 1.0);
      if (ok) for (const [sx, sz] of [[0, 0], [hw, 0], [-hw, 0], [0, hd], [0, -hd]]) {
        const px = x + ux * sx + vx * sz, pz = z + uz * sx + vz * sz;
        // (a square's trees have high crowns: the tables stand right up to the trunks, as they do on the real squares)
        if (!GOOD[grid.get(px, pz)] || treeNear(px, pz, sx || sz ? 0.75 : 1.05) || barrierNear(px, pz, 0.4) || railNear(px, pz, 1.9)) { ok = false; break; }
      }
      if (ok) for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2.1, 2.1], [-2.1, 2.1], [2.1, -2.1], [-2.1, -2.1]]) if (grid.get(x + dx, z + dz) === C.BUILDING) { ok = false; break; } // 3 m lane along the facades
      if (!ok) continue;
      const S = sceneOf(c.q);
      aim(th, x, z);
      cellDraw(S, style, 0, 0);
      if (ST.par && (style === 'bench' || (c.i + c.j) % 2 === 0)) parasol(v, S.pk, 0, 0, Math.min(ST.cp - 0.2, big ? 3.0 : 2.6), S.ph, S.pc);
      stand('terrace', x, z, 1.0); stand('terr', x, z, 0.4);
      add('terrace', x, z, { tx: ux, tz: uz }, vx, vz, { style, venue: 'field' });
    }
    CHEAP = false;
    v.setT(); gl.setT();
    bonus += Math.max(0, used() - Math.max(before, base));
  }

  // ---- how much: a dense tile should not end up with more than `cap` props
  let blocks = 0;
  for (const pl of pieces) blocks += Math.max(0, Math.ceil(pl.len / 48)) * 2;
  const scale = Math.min(1, cap / Math.max(1, blocks * 3.2)) * (lite ? 0.75 : 1);
  const chance = (p) => rnd() < p * scale;

  // ---- block by block, both sides of every street
  const signs = new Map();
  const later = []; // the rarer kinds of furniture go in after every block has its racks, benches and bins
  pieces.forEach((pl, pi) => {
    const zebras = [];
    if (pl.len >= 45) for (let s = 20; s < pl.len - 12; s += 80) zebras.push(s);
    const nearZebra = (s, r) => zebras.some((z) => Math.abs(z - s) < r);
    // the street's own name on a blue sign near the start of the piece, one per side
    if (pl.name && pl.len > 40) {
      const seen = signs.get(pl.name) || 0;
      let made = 0;
      for (const side of rnd() < 0.5 ? [1, -1] : [-1, 1]) {
        if (seen + made >= 2) break;
        for (let t = 0; t < 6; t++) {
          const s = 3.5 + t * 3 + rnd.range(0, 1.5), sc = scan(pi, side, s);
          if (!sc.ok || sc.back - sc.e < 1.0) continue;
          const off = sc.back - (sc.hasB ? 0.45 : 0.3), x = sc.f.x - sc.f.tz * side * off, z = sc.f.z + sc.f.tx * side * off;
          const nx = sc.f.tz * side, nz = -sc.f.tx * side, fr = frameOf(nx, nz);
          if (!fits('sign', x, z, fr, [[0, 0], [0, 0.6]], 1.3, 0.5, 0)) continue;
          const th = fr[2];
          aim(th, x, z);
          P.streetSign(holder(th, x, z), v, 0, 0, pl.name.toUpperCase().slice(0, 26), 0);
          stand('sign', x, z, 0.5);
          made++;
          break;
        }
      }
      signs.set(pl.name, seen + made);
    }
    for (let b0 = 0; b0 < pl.len; b0 += 48) {
      const b1 = Math.min(pl.len, b0 + 48);
      if (b1 - b0 < 8) continue;
      const mid = (b0 + b1) / 2, mf = frameAt(pl, mid);
      const busy = pl.cls === 8 || busyAt(mf.x, mf.z);
      for (const side of [-1, 1]) {
        if (props.length >= cap || used() > LIMIT) break;
        const pickS = (pad = 3) => rnd.range(b0 + Math.min(pad, (b1 - b0) / 3), b1 - Math.min(pad, (b1 - b0) / 3));
        /** A spot at offset `off` from the centre line on this side, and the road-ward direction there. */
        const spot = (sc, off) => ({ x: sc.f.x - sc.f.tz * side * off, z: sc.f.z + sc.f.tx * side * off, nx: sc.f.tz * side, nz: -sc.f.tx * side });
        const midSc = scan(pi, side, mid);

        // bike rack against the building line (or the back of the pavement where nothing is built)
        if (chance(midSc.hasB ? 0.95 : 0.4)) {
          for (let t = 0; t < 10; t++) {
            const s = pickS(), sc = scan(pi, side, s);
            if (!sc.ok || sc.back - sc.e < 1.5) continue;
            const p = spot(sc, sc.back - 0.7), fr = frameOf(p.nx, p.nz);
            if (!fits('rack', p.x, p.z, fr, [[-1.6, -0.6], [0, -0.6], [1.6, -0.6], [-1.6, 1.3], [0, 1.3], [1.6, 1.3], [0, 0.5]], 1.3, 2.0, 5)) continue;
            aim(fr[2], p.x, p.z);
            P.bikeRack(v, 0, 0, rnd, 4, 0);
            stand('rack', p.x, p.z, 2.0);
            add('rack', p.x, p.z, sc.f, p.nx, p.nz);
            break;
          }
        }
        // bench with its back to the houses
        if (chance(midSc.hasB ? 0.7 : 0.3)) {
          for (let t = 0; t < 6; t++) {
            const s = pickS(4), sc = scan(pi, side, s);
            if (!sc.ok || sc.back - sc.e < 1.4) continue;
            const p = spot(sc, sc.back - 0.45), fr = frameOf(p.nx, p.nz);
            if (!fits('bench', p.x, p.z, fr, [[-0.8, 0], [0, 0], [0.8, 0], [0, 0.8]], 1.3, 1.4, 6)) continue;
            aim(fr[2], p.x, p.z);
            benchV(v, rnd, Math.floor(rnd() * 4));
            stand('bench', p.x, p.z, 1.4);
            add('bench', p.x, p.z, sc.f, p.nx, p.nz);
            break;
          }
        }
        // bins at the kerb
        for (let k = 0, n = chance(0.85) ? (chance(0.3) ? 2 : 1) : 0; k < n; k++) {
          for (let t = 0; t < 5; t++) {
            const s = pickS(2), sc = scan(pi, side, s);
            if (!sc.ok || nearZebra(s, 3.5)) continue;
            const p = spot(sc, sc.e + 0.45), fr = frameOf(p.nx, p.nz);
            if (!fits('bin', p.x, p.z, fr, [[0, 0]], 1.3, 0.7, 6)) continue;
            aim(fr[2], p.x, p.z);
            binV(v, rnd, Math.floor(rnd() * 4));
            stand('bin', p.x, p.z, 0.7);
            add('bin', p.x, p.z, sc.f, p.nx, p.nz);
            break;
          }
        }
        // a mailbox now and then
        if (chance(0.22)) {
          for (let t = 0; t < 4; t++) {
            const s = pickS(2), sc = scan(pi, side, s);
            if (!sc.ok || nearZebra(s, 3.5) || sc.w < 1.0) continue;
            const p = spot(sc, sc.e + 0.4), fr = frameOf(p.nx, p.nz);
            if (!fits('mailbox', p.x, p.z, fr, [[0, 0]], 1.3, 0.8, 20)) continue;
            aim(fr[2], p.x, p.z);
            mailboxV(v, rnd, Math.floor(rnd() * 3));
            stand('mailbox', p.x, p.z, 0.8);
            add('mailbox', p.x, p.z, sc.f, p.nx, p.nz);
            break;
          }
        }
        // transformer box (graffiti magnet) where the pavement is wide enough
        if (chance(0.4)) {
          for (let t = 0; t < 5; t++) {
            const s = pickS(5), sc = scan(pi, side, s);
            if (!sc.ok || sc.w < 2.0 || nearZebra(s, 3.5)) continue;
            const p = spot(sc, sc.e + 0.35 + clamp(sc.w - 1.8, 0, 0.5)), fr = frameOf(p.nx, p.nz);
            if (!fits('box', p.x, p.z, fr, [[-1.0, 0], [0, 0], [1.0, 0], [0, 0.5], [0, -0.5]], 1.3, 1.5, 12)) continue;
            aim(fr[2], p.x, p.z);
            const bx2 = boxV(v, rnd, Math.floor(rnd() * 4));
            stand('box', p.x, p.z, 1.5);
            add('box', p.x, p.z, sc.f, p.nx, p.nz, { w: +bx2.w.toFixed(2), h: +bx2.h.toFixed(2) });
            break;
          }
        }
        // a herring / chips / flower stall where there is room: busy or pedestrian streets only, rarely
        if (busy && chance(0.1)) {
          for (let t = 0; t < 6; t++) {
            const s = pickS(6), sc = scan(pi, side, s);
            let x, z, nx, nz, lab;
            if (sc.ok && sc.back - sc.e >= 3.2) {
              const p = spot(sc, Math.max(sc.back - 1.6, sc.e + 1.5));
              ({ x, z, nx, nz } = p);
            } else if (!sc.ok && sc.soft > 0 && sc.sand) {
              const p = spot(sc, sc.soft + 1.5);
              ({ x, z, nx, nz } = p);
            } else continue;
            const fr = frameOf(nx, nz);
            if (!fits('stall', x, z, fr, [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9], [0, 0], [0, 1.6]], 2.0, 2.2, 30)) continue;
            const onSand = grid.get(x, z) === C.SAND || grid.get(x + 2, z) === C.SAND || grid.get(x - 2, z) === C.SAND;
            lab = onSand ? 'HARING' : rnd.pick(['HARING', 'FRIET', 'BLOEM']);
            aim(fr[2], x, z);
            P.stall(holder(fr[2], x, z), v, 0, 0, lab, STALLS[lab], 0, 1);
            stand('stall', x, z, 2.2);
            add('stall', x, z, sc.f, nx, nz, { label: lab });
            break;
          }
        }
        // ---- the rest of what a street has (DETAIL.md): underground waste containers, advertising columns, MUPIs,
        later.push(() => {
          // parking machines, charging posts, planters. One helper tries a few spots along the block.
          const item = (kind, q) => {
            for (let t = 0; t < (q.tries || 5); t++) {
              const s = pickS(q.pad ?? 2), sc = scan(pi, side, s);
              if (!sc.ok || (q.minW && sc.w < q.minW) || nearZebra(s, 3.5)) continue;
              const p = spot(sc, q.off(sc)), fr = frameOf(p.nx, p.nz);
              if (!fits(kind, p.x, p.z, fr, q.pts, q.treeR ?? 1.3, q.r, q.same || 0)) continue;
              aim(fr[2], p.x, p.z);
              q.draw();
              stand(kind, p.x, p.z, q.r);
              if (q.rec) add(q.rec, p.x, p.z, sc.f, p.nx, p.nz, q.extra);
              else if (q.obst) q.obst(p, sc.f, fr);
              return true;
            }
            return false;
          };
          const vr3 = () => Math.floor(rnd() * 3), vr4 = () => Math.floor(rnd() * 4);
          if (chance(busy ? 0.1 : 0.34)) item('orac', { off: (sc) => sc.e + 0.55, pts: [[-0.7, 0], [0.7, 0], [0, 0.5]], r: 1.0, same: 16, draw: () => orac(v, rnd, vr4()), rec: 'orac' });
          if (busy && chance(0.2)) item('column', { off: (sc) => sc.e + 0.7, minW: 2.0, pts: [[0, 0], [0, 0.7]], r: 0.9, same: 45, draw: () => peperbus(v, gl, night, rnd, vr3()), rec: 'column' });
          if (busy && chance(0.24)) item('mupi', { off: (sc) => sc.e + 0.45, minW: 1.8, pts: [[-0.6, 0], [0.6, 0], [0, 0.3]], r: 0.9, same: 28, draw: () => mupi(v, gl, night, rnd, vr3()), rec: 'mupi' });
          if (busy && chance(0.14)) item('meter', { off: (sc) => sc.e + 0.35, pts: [[0, 0]], r: 0.7, same: 22, draw: () => meter(v, gl, night, rnd, vr3()), rec: 'meter' });
          if (chance(busy ? 0.05 : 0.1)) item('charger', { off: (sc) => sc.e + 0.4, pts: [[-0.5, 0], [0.5, 0]], r: 0.9, same: 40, draw: () => charger(v, gl, night, rnd, vr4()), rec: 'charger' });
          // planters are no anchor, but stand in the way: one entry per box, where draw() put it along the street (its count read back, no draw of its own)
          let pn = 1;
          const planters = (p, f, fr) => { for (let i = 0; i < pn; i++) { const lx = (i - (pn - 1) / 2) * 1.3; inTheWay.push({ kind: 'planter', x: p.x + lx * fr[1], z: p.z - lx * fr[0], ax: f.tx, az: f.tz, nx: p.nx, nz: p.nz }); } };
          if (pl.cls === 8 && chance(0.55)) item('planter', { off: (sc) => sc.back - 0.9, minW: 2.4, pts: [[-1.2, 0], [1.2, 0]], r: 1.5, same: 9, draw: () => { const n = (pn = 1 + Math.floor(rnd() * 3)); for (let i = 0; i < n; i++) planterBox(v, (i - (n - 1) / 2) * 1.3, 0, rnd, 1.1); }, rec: null, obst: planters });
          else if (busy && chance(0.1)) item('planter', { off: (sc) => sc.back - 0.8, minW: 2.4, pts: [[-1.2, 0], [1.2, 0]], r: 1.4, same: 20, draw: () => { planterBox(v, 0, 0, rnd, 1.2); }, rec: null, obst: planters });
          if (busy && chance(0.07)) item('bigrack', { off: (sc) => sc.back - 1.2, minW: 3.0, pts: [[-1.6, -1], [1.6, -1], [-1.6, 2.4], [1.6, 2.4]], r: 2.4, same: 24, draw: () => { P.bikeRack(v, 0, -0.8, rnd, 5, 0); P.bikeRack(v, 0, 0.9, rnd, 5, 0); }, rec: 'rackpark' });
        });
      }
    }
  });

  for (const job of later) { if (used() > LIMIT) break; job(); }

  // ---- tram and bus shelters (the old kind-9 points of interest)
  // A stop the map also has as a shelter feature (`f` type 10, drawn by landmarks.js `shelter`) gets no second shelter.
  // The feature stands on the stop's own point, and the stop is moved from there to the pavement, so both points are
  // compared with the feature at the same distance: the moved one by `fits` (its room 2.2 m and the feature's 2.4 m),
  // the stop's own point by `featured`. (A feature in a neighbouring tile is not seen here.)
  const featured = (x, z) => taken.some((t) => t.kind === 'shelterf' && Math.hypot(t.x - x, t.z - z) < 2.2 + t.r);
  for (const p of pois || []) {
    const kind = p[0], px = p[1] / 10, pz = TILE - p[2] / 10;
    if (kind !== 9) continue;
    const q = nearestRoad(px, pz, 16);
    if (!q) continue;
    const f = frameAt(q.pl, q.s), vv = (px - f.x) * -f.tz + (pz - f.z) * f.tx;
    let side = vv < 0 ? -1 : 1;
    if (Math.abs(vv) < 1.0) { const a = scan(q.pi, -1, q.s), b = scan(q.pi, 1, q.s); side = (b.ok ? b.w : 0) >= (a.ok ? a.w : 0) ? 1 : -1; }
    const sc = scan(q.pi, side, q.s);
    if (!sc.ok || sc.w < 1.6) continue;
    const off = sc.e + clamp(sc.w - 0.7, 0.8, 1.9), x = f.x - f.tz * side * off, z = f.z + f.tx * side * off, nx = f.tz * side, nz = -f.tx * side, fr = frameOf(nx, nz);
    if (!fits('stop', x, z, fr, [[-1.7, 0], [0, 0], [1.7, 0], [0, 0.7]], 1.3, 2.2, 30)) continue;
    if (featured(px, pz)) {
      // not drawn, but its room and its count stay, so nothing after it moves
      P.tramStop(ghost, ghost, 0, 0, night, 0);
      stand('stop', x, z, 2.2);
      continue;
    }
    aim(fr[2], x, z);
    P.tramStop(v, gl, 0, 0, night, 0);
    stand('stop', x, z, 2.2);
    inTheWay.push({ kind: 'stop', x, z, ax: f.tx, az: f.tz, nx, nz }); // (the one not drawn above is the map's shelter, listed with the features)
  }

  // ================================================================ whole-area passes (see DETAIL.md)
  const zr = makeRng(hashStr('areas|' + key));
  const spare = () => used() < LIMIT;
  const tanTh = (tx, tz) => Math.atan2(-tz, tx); // frame whose local +x runs along (tx, tz)

  // ---- bollards across the ends of pedestrian streets
  if (spare()) pieces.forEach((pl) => {
    if (pl.cls !== 8 || pl.len < 22) return;
    for (const s of [1.8, pl.len - 1.8]) {
      if (!spare() || zr() > 0.7) continue;
      const f = frameAt(pl, s), w = clamp(pl.w * 0.85, 3, 8);
      let ok = true;
      for (const d of [-w / 2, 0, w / 2]) { const x = f.x - f.tz * d, z = f.z + f.tx * d; if (!GOOD[grid.get(x, z)] || treeNear(x, z, 0.5)) { ok = false; break; } }
      if (!ok || crowded('bollards', f.x, f.z, w / 2, 0)) continue;
      aim(Math.atan2(-f.tx, -f.tz), f.x, f.z);
      bollardRow(v, w, Math.floor(zr() * 3));
      stand('bollards', f.x, f.z, 0.5);
    }
  });

  // ---- traffic lights and signposts where big streets meet
  if (spare()) {
    const big = pieces.filter((p) => p.cls >= 2 && p.cls <= 5 && p.len > 20);
    const ends = [];
    for (const pl of big) for (const e of [0, 1]) {
      const s = e ? pl.len : 0, f = frameAt(pl, s);
      let other = false;
      for (const q of big) if (q !== pl) { for (let i = 0; i < q.n; i++) if (Math.hypot(q.a[i * 2] - f.x, q.a[i * 2 + 1] - f.z) < 6) { other = true; break; } if (other) break; }
      if (other) ends.push({ pl, s: e ? pl.len - 7 : 7, dir: e ? 1 : -1 });
    }
    let nl = 0;
    for (const en of ends) {
      if (nl >= (lite ? 5 : 12) || !spare()) break;
      const f = frameAt(en.pl, en.s), r = makeRng(hashStr(key + '|tl|' + Math.round(f.x) + '|' + Math.round(f.z))), st = Math.floor(r() * 3), vr = Math.floor(r() * 3);
      for (const side of [-1, 1]) {
        if (r() < 0.45) continue;
        const sc = scan(pieces.indexOf(en.pl), side, en.s);
        if (!sc.ok || sc.w < 1.2) continue;
        const off = sc.e + 0.45, x = f.x - f.tz * side * off, z = f.z + f.tx * side * off, nx = f.tz * side, nz = -f.tx * side, fr = frameOf(nx, nz);
        // the light faces the traffic coming from the junction: turn it along the street
        if (!fits('tlight', x, z, fr, [[0, 0]], 1.3, 1.0, 5)) continue;
        aim(Math.atan2(-f.tx * en.dir, -f.tz * en.dir) + 0, x, z); // (+ 0: never a negative zero)
        if (r() < 0.75) trafficLight(v, gl, night, r, st, vr); else signPost(v, r, vr);
        stand('tlight', x, z, 1.0);
        add('tlight', x, z, f, nx, nz);
        nl++;
      }
    }
  }

  // ---- tram catenary masts and wires
  if (spare()) rails.forEach((rl, ri) => {
    if (rl.kind !== 1 || rl.flags & 4 || !rl.a || rl.a.length < 4) return;
    const pl = prep(rl.a);
    if (pl.len < 20) return;
    const r = makeRng(hashStr(key + '|mast|' + ri)), vr = Math.floor(r() * 3), h = r.range(5.7, 6.4);
    const masts = [];
    let s = r.range(4, 14), k = 0;
    while (s < pl.len - 3 && spare()) {
      const f = frameAt(pl, s);
      let placed = null;
      for (const side of k % 2 ? [1, -1] : [-1, 1]) {
        for (const off of [2.5, 3.4, 4.8, 6.5]) {
          const x = f.x - f.tz * side * off, z = f.z + f.tx * side * off, c = grid.get(x, z);
          if (!inTile(x, z, 2) || !(GOOD[c] || c === C.GRASS || c === C.DIRT) || treeNear(x, z, 0.7) || crowded('x', x, z, 0.5)) continue;
          placed = { x, z, nx: f.tz * side, nz: -f.tx * side, off, f }; break;
        }
        if (placed) break;
      }
      if (placed) masts.push({ ...placed, s });
      s += r.range(26, 34); k++;
    }
    masts.forEach((m, i) => {
      const fr = frameOf(m.nx, m.nz), rr = makeRng(hashStr(key + '|mm|' + ri + '|' + i));
      aim(fr[2], m.x, m.z);
      mastPole(v, gl, night, rr, rr() < 0.15 ? 2 : vr % 2, h, m.off);
      stand('mast', m.x, m.z, 0.3);
      add('mast', m.x, m.z, m.f, m.nx, m.nz);
      // the wires run along the track to the next mast
      const nxt = masts[i + 1];
      if (nxt) {
        const a = frameAt(pl, m.s), b = frameAt(pl, nxt.s), dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
        if (L > 4 && L < 45) {
          aim(tanTh(dx / L, dz / L), a.x, a.z);
          v.box(L / 2, h - 0.62, 0, L, 0.035, 0.035, '#2b2d31');
          v.box(L / 2, h - 0.08, 0, L, 0.03, 0.03, '#3a3d42');
        }
      }
    });
    v.setT(); gl.setT();
  });

  // ---- hotels fly flags; supermarkets have trolley shelters; big venues get a parking machine
  if (ps && spare()) for (const e of eats) {
    if (!spare()) break;
    if (e.cat !== 'hotel' && e.cat !== 'supermarket') continue;
    const r = dig(e, 'front');
    if (e.cat === 'hotel' && r() > 0.8) continue;
    const f = frontOf(e, GOOD, null);
    if (!f) continue;
    const rx = f.nz, rz = -f.nx;
    for (let t = 0; t < 4; t++) {
      const lat = (r() < 0.5 ? -1 : 1) * r.range(2.5, 7), dd = e.cat === 'hotel' ? 0.9 : r.range(2.8, 4.2);
      const x = f.bx + rx * lat + f.nx * dd, z = f.bz + rz * lat + f.nz * dd;
      const th = e.cat === 'hotel' ? Math.atan2(f.nx, f.nz) : Math.atan2(-f.nx, -f.nz);
      const fr = [Math.sin(th), Math.cos(th), th];
      const pts = e.cat === 'hotel' ? [[0, 0], [-1.8, 0], [1.8, 0]] : [[-1.7, 0], [1.7, 0], [0, 0], [0, 0.9], [0, -0.9]];
      if (!inTile(x, z, 3) || !fits(e.cat === 'hotel' ? 'flags' : 'trolleys', x, z, fr, pts, 1.6, 2.4, 0)) continue;
      let ok = true;
      for (const [lx, lz] of pts) if (!GOOD[grid.get(x + lx * fr[1] + lz * fr[0], z - lx * fr[0] + lz * fr[1])]) ok = false;
      if (!ok) continue;
      aim(th, x, z);
      if (e.cat === 'hotel') { flagpole(v, r, 2 + (r() < 0.5 ? 1 : 0)); stand('flags', x, z, 2.2); }
      else { trolleys(v, r, Math.floor(r() * 4)); stand('trolleys', x, z, 2.2); add('trolleys', x, z, { tx: Math.cos(th), tz: -Math.sin(th) }, -f.nx, -f.nz); }
      break;
    }
  }

  // ---- quays: chain posts, mooring bollards, moored boats with gangways
  if (spare()) {
    const water = (x, z) => grid.get(x, z) === C.WATER;
    let hasWater = false;
    for (let z = 4; z < TILE && !hasWater; z += 8) for (let x = 4; x < TILE; x += 8) if (water(x, z)) { hasWater = true; break; }
    if (hasWater) {
      const posts = [], boats = [];
      const dirs8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]];
      const hashCell = (x, z) => ((Math.imul(Math.floor(x / 22) + 977, 73856093) ^ Math.imul(Math.floor(z / 22) + 331, 19349663)) >>> 0) / 4294967296;
      for (let z = 2; z < TILE - 2; z += 1) for (let x = 2; x < TILE - 2; x += 1) {
        if (!GOOD[grid.get(x, z)]) continue;
        let nx = 0, nz = 0, n = 0;
        for (const [dx, dz] of dirs8) if (water(x + dx * 1.3, z + dz * 1.3)) { nx += dx; nz += dz; n++; }
        if (!n) continue;
        const l = Math.hypot(nx, nz);
        if (l < 0.5) continue;
        nx /= l; nz /= l;
        const mode = hashCell(x, z), cell = mode < 0.42 ? 0 : mode < 0.75 ? 1 : 2; // nothing, chain posts, mooring bollards
        if (!cell) continue;
        const space = cell === 1 ? 3.1 : 8.5;
        if (posts.some((p) => Math.hypot(p.x - x, p.z - z) < space)) continue;
        if (treeNear(x, z, 0.8) || crowded('quay', x, z, 0.4)) continue;
        posts.push({ x, z, nx, nz, cell, vr: Math.floor(hashCell(x * 3, z * 3) * 3) });
        if (posts.length > (lite ? 40 : 90)) break;
      }
      posts.forEach((p, i) => {
        if (!spare()) return;
        const th = Math.atan2(-p.nx, -p.nz); // local +z away from the water
        aim(th, p.x, p.z);
        if (p.cell === 1) quayPost(v, p.vr); else mooring(v, p.vr % 2);
        stand('quay', p.x, p.z, 0.4);
      });
      // chains between neighbouring posts
      for (let i = 0; i < posts.length && spare(); i++) for (let j = i + 1; j < posts.length; j++) {
        const a = posts[i], b = posts[j];
        if (a.cell !== 1 || b.cell !== 1) continue;
        const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
        if (L < 2.2 || L > 4.6 || a.nx * b.nx + a.nz * b.nz < 0.7) continue;
        aim(tanTh(dx / L, dz / L), a.x, a.z);
        const top = a.vr === 2 ? 0.8 : 0.72;
        v.box(L * 0.25, top - 0.1, 0, L * 0.5 + 0.02, 0.05, 0.05, '#25282b');
        v.box(L * 0.75, top - 0.1, 0, L * 0.5 + 0.02, 0.05, 0.05, '#25282b');
        v.box(L * 0.5, top - 0.22, 0, 0.08, 0.05, 0.05, '#25282b');
      }
      v.setT(); gl.setT();
      // boats on the water beside the quay
      const cand = posts.filter((p) => p.cell > 0);
      for (const p of cand) {
        if (boats.length >= (lite ? 3 : 8) || !spare()) break;
        const r = makeRng(hashStr(key + '|boat|' + Math.round(p.x) + '|' + Math.round(p.z)));
        if (r() > 0.35) continue;
        const len = pick(r, [6.5, 8, 10.5, 13]), tx = -p.nz, tz = p.nx;
        const cx = p.x + p.nx * 3.0, cz = p.z + p.nz * 3.0;
        let ok = true;
        for (let t = -len / 2; t <= len / 2 && ok; t += 1.5) for (const lat of [-1.6, 0, 1.6]) if (!water(cx + tx * t + p.nx * lat, cz + tz * t + p.nz * lat)) { ok = false; break; }
        if (!ok || boats.some((b) => Math.hypot(b.x - cx, b.z - cz) < 7 + (b.len + len) / 2 * 0.5)) continue;
        const th = tanTh(tx, tz);
        const y = yAt(cx, cz);
        v.setT(th, cx, cz, y - 0.12); gl.setT(th, cx, cz, y - 0.12);
        const vr = len > 11 ? 2 : r() < 0.5 ? 0 : 1;
        boat(v, gl, night, r, len, vr);
        if (night && vr !== 2) nightOnly(() => gl.box(len * 0.46, 1.2, 0, 0.12, 0.12, 0.12, '#ff5a4a')); // the riding light
        // a gangway to the quay for the big ones
        if (vr === 2 || r() < 0.3) {
          const lz = Math.sin(th) * -p.nx + Math.cos(th) * -p.nz; // which local side faces the quay
          v.box(len * 0.2, 0.5, (lz > 0 ? 1 : -1) * 2.0, 0.7, 0.05, 1.7, '#9a7b4f');
        }
        v.setT(); gl.setT();
        boats.push({ x: cx, z: cz, len });
      }
    }
  }

  // ---- pitches: football fields with goals and lines, courts with fences and hoops
  if (spare()) {
    const NP = 256, seen = new Uint8Array(NP * NP);
    const pit = (i, j) => i >= 0 && j >= 0 && i < NP && j < NP && grid.get(i + 0.5, j + 0.5) === C.PITCH;
    let made = 0;
    for (let j0 = 0; j0 < NP && made < (lite ? 2 : 4); j0 += 2) for (let i0 = 0; i0 < NP; i0 += 2) {
      if (seen[j0 * NP + i0] || !pit(i0, j0)) continue;
      const stack = [[i0, j0]], cells = [];
      seen[j0 * NP + i0] = 1;
      while (stack.length) {
        const [i, j] = stack.pop();
        cells.push(i, j);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= NP || b >= NP || seen[b * NP + a] || !pit(a, b)) continue;
          seen[b * NP + a] = 1; stack.push([a, b]);
        }
      }
      const n = cells.length / 2;
      if (n < 220 || n > 14000) continue;
      let mx = 0, mz = 0;
      for (let k = 0; k < cells.length; k += 2) { mx += cells[k]; mz += cells[k + 1]; }
      mx /= n; mz /= n;
      let sxx = 0, sxz = 0, szz = 0;
      for (let k = 0; k < cells.length; k += 2) { const dx = cells[k] - mx, dz = cells[k + 1] - mz; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; }
      const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ax = Math.cos(ang), az = Math.sin(ang);
      let u0 = 1e9, u1 = -1e9, w0 = 1e9, w1 = -1e9;
      for (let k = 0; k < cells.length; k += 2) { const dx = cells[k] - mx, dz = cells[k + 1] - mz, u = dx * ax + dz * az, w = -dx * az + dz * ax; u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w); }
      const ul = u1 - u0 + 1, wl = w1 - w0 + 1, uc = (u0 + u1) / 2, wc = (w0 + w1) / 2;
      if (n / (ul * wl) < 0.62) continue; // not a rectangle
      const ctrX = mx + uc * ax - wc * az, ctrZ = mz + uc * az + wc * ax;
      const major = ul >= wl ? [ax, az] : [-az, ax], L2 = Math.max(ul, wl), W2 = Math.min(ul, wl);
      const th = tanTh(major[0], major[1]), r = makeRng(hashStr(key + '|pitch|' + Math.round(ctrX) + '|' + Math.round(ctrZ)));
      const big = n >= 2200 && L2 > 70, mid = n >= 800, hl = L2 / 2 - 1.0, hw = W2 / 2 - 1.0, lw = 0.12, lc = '#f4f4ee';
      const line = (x, z, w, d) => v.box(x, 0.03, z, w, 0.03, d, lc);
      // a goal or hoop at the end s (+1 or -1) of the long axis, its mouth towards the middle
      const atEnd = (s, back, draw) => {
        const gx = ctrX + major[0] * (hl - back) * s, gz = ctrZ + major[1] * (hl - back) * s;
        aim(Math.atan2(-s * major[0], -s * major[1]), gx, gz);
        draw();
      };
      aim(th, ctrX, ctrZ);
      if (big || mid) {
        line(0, -hw, 2 * hl, lw); line(0, hw, 2 * hl, lw); line(-hl, 0, lw, 2 * hw); line(hl, 0, lw, 2 * hw); line(0, 0, lw, 2 * hw);
        const pa = big ? 16.5 : 12, ga = big ? 5.5 : 4, pw = big ? 20.2 : 14;
        for (const s of [-1, 1]) {
          const ex = s * hl;
          line(ex - s * pa, 0, lw, pw * 2); line(ex - s * pa / 2, pw, pa, lw); line(ex - s * pa / 2, -pw, pa, lw);
          line(ex - s * ga, 0, lw, ga * 2); line(ex - s * ga / 2, ga, ga, lw); line(ex - s * ga / 2, -ga, ga, lw);
        }
        const cr = big ? 9.15 : 6;
        for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; line(Math.cos(a) * cr, Math.sin(a) * cr, 1.1, lw); }
        line(0, 0, 0.4, 0.4);
        for (const s of [-1, 1]) for (const t2 of [-1, 1]) { v.box(s * hl, 0, t2 * hw, 0.05, 1.5, 0.05, '#e9e9e9'); v.box(s * hl + 0.12, 1.2, t2 * hw, 0.25, 0.25, 0.03, '#e63946'); }
        if (big) for (const s of [-1, 1]) {
          const zz = (hw + 3.2) * s;
          v.box(0, 0, zz, 4.2, 0.45, 0.45, '#2b4a7a'); v.box(0, 0.45, zz + s * 0.2, 4.4, 0.06, 0.8, '#d6d6d6'); v.box(0, 1.5, zz + s * 0.2, 4.4, 0.08, 1.0, '#4a5a73');
          v.box(-2.1, 0, zz + s * 0.2, 0.08, 1.5, 0.08, '#bbb'); v.box(2.1, 0, zz + s * 0.2, 0.08, 1.5, 0.08, '#bbb');
        }
        for (const s of [-1, 1]) atEnd(s, 0, () => goalPosts(v, big ? 7.32 : 5.0, big ? 2.44 : 2.0));
      } else {
        // a court: lines, a fence round it with a gate, hoops or mini goals at the ends
        line(0, -hw + 0.3, 2 * hl, lw); line(0, hw - 0.3, 2 * hl, lw); line(-hl + 0.3, 0, lw, 2 * hw); line(hl - 0.3, 0, lw, 2 * hw); line(0, 0, lw, 2 * hw - 0.6);
        const fc = pick(r, ['#2f4f3a', '#6b7280', '#3b4048', '#1d4f7a']), fh = 3.0 + (r() < 0.4 ? 1 : 0);
        const hx = L2 / 2 - 0.1, hz = W2 / 2 - 0.1, gate = r() < 0.5 ? 0 : 1;
        const perim = [[-hx, -hz, hx, -hz], [hx, -hz, hx, hz], [hx, hz, -hx, hz], [-hx, hz, -hx, -hz]];
        perim.forEach(([x0, z0, x1, z1], si) => {
          const sl = Math.hypot(x1 - x0, z1 - z0), nseg = Math.max(1, Math.round(sl / 3.2)), along = Math.abs(x1 - x0) > Math.abs(z1 - z0), sw = sl / nseg;
          for (let q = 0; q <= nseg; q++) { const t = q / nseg; v.box(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.08, fh, 0.08, fc); }
          for (let q = 0; q < nseg; q++) {
            if (si === gate * 2 && q === Math.floor(nseg / 2)) continue; // the gate
            const t = (q + 0.5) / nseg, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
            v.box(px, fh - 0.08, pz, along ? sw : 0.05, 0.06, along ? 0.05 : sw, fc);
            v.box(px, 0.05, pz, along ? sw : 0.05, 0.06, along ? 0.05 : sw, fc);
            v.box(px, 0.9, pz, along ? sw : 0.03, 0.05, along ? 0.03 : sw, P.shade(fc, 1.2));
          }
        });
        const hoops = L2 / W2 > 1.35 && r() < 0.7, hv = Math.floor(r() * 3);
        for (const s of [-1, 1]) atEnd(s, 0.6, () => (hoops ? hoop(v, hv) : goalPosts(v, 3.0, 2.0)));
      }
      v.setT(); gl.setT();
      stand('pitch', ctrX, ctrZ, Math.min(L2, W2) / 2);
      made++;
    }
  }

  // ---- playgrounds get a fence with a gate, a bench and a bin outside
  if (raw && spare()) for (const e of raw.f || []) {
    if (e[0] !== 11 || !spare()) continue;
    const x = e[1] / 10, z = TILE - e[2] / 10, rot = Math.PI / 2 - (e[3] * Math.PI) / 180;
    const r = makeRng(hashStr(key + '|pg|' + Math.round(x) + '|' + Math.round(z)));
    const fc = pick(r, ['#2f7d4f', '#1d6fa5', '#c1121f', '#6b7280', '#e0a100']);
    aim(rot, x, z);
    const cx = 0, cz = 1.9, hx = 4.7, hz = 4.6, gateSide = Math.floor(r() * 4);
    const perim = [[-hx, -hz, hx, -hz], [hx, -hz, hx, hz], [hx, hz, -hx, hz], [-hx, hz, -hx, -hz]];
    perim.forEach(([x0, z0, x1, z1], si) => {
      const sl = Math.hypot(x1 - x0, z1 - z0), nseg = Math.round(sl / 1.4), along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      for (let q = 0; q <= nseg; q++) {
        const t = q / nseg, px = cx + x0 + (x1 - x0) * t, pz = cz + z0 + (z1 - z0) * t;
        if (si === gateSide && Math.abs(t - 0.5) < 0.12) continue;
        v.box(px, 0, pz, 0.07, 1.05, 0.07, fc);
        if (q < nseg) { const t2 = (q + 0.5) / nseg; v.box(cx + x0 + (x1 - x0) * t2, 0.95, cz + z0 + (z1 - z0) * t2, along ? sl / nseg : 0.05, 0.07, along ? 0.05 : sl / nseg, fc); }
      }
    });
    P.bench(v, hx + 1.0, cz, 0, 1); P.bin(v, hx + 1.0, cz + 1.4, 0);
    v.setT(); gl.setT();
  }

  // ---- park paths: benches, bins and lamps (lit at night) where a footpath runs through grass
  if (spare()) {
    const paths = [];
    for (const rd of o.roads || []) if ((rd.cls === 11 || rd.cls === 12) && !(rd.flags & 6) && rd.a && rd.a.length >= 4) { const pl = prep(rd.a); if (pl.len >= 22) paths.push(pl); }
    let made = 0;
    paths.forEach((pl, pi) => {
      const r = makeRng(hashStr(key + '|path|' + pi));
      let k = 0;
      for (let s = r.range(6, 14); s < pl.len - 4 && made < (lite ? 14 : 34) && spare(); s += r.range(20, 28), k++) {
        const f = frameAt(pl, s), side = k % 2 ? 1 : -1;
        const gl1 = grid.get(f.x - f.tz * 7, f.z + f.tx * 7) === C.GRASS, gl2 = grid.get(f.x + f.tz * 7, f.z - f.tx * 7) === C.GRASS;
        if (!(gl1 || gl2) || !(grid.get(f.x, f.z) !== C.WATER)) continue;
        const sd = gl1 ? 1 : -1, off = 1.7 + r() * 0.4, x = f.x - f.tz * sd * off, z = f.z + f.tx * sd * off, nx = f.tz * sd, nz = -f.tx * sd, fr = frameOf(nx, nz);
        if (!fits('pbench', x, z, fr, [[0, 0], [0.9, 0], [-0.9, 0]], 1.4, 1.4, 14)) continue;
        const roll = r();
        aim(fr[2], x, z);
        if (roll < 0.4) { benchV(v, r, Math.floor(r() * 4)); if (r() < 0.6) { v.setT(fr[2], x + 1.4 * fr[1], z - 1.4 * fr[0], yAt(x, z)); binV(v, r, Math.floor(r() * 4)); v.setT(fr[2], x, z, yAt(x, z)); } add('bench', x, z, f, nx, nz); }
        else if (roll < 0.8) { P.lamp(v, gl, 0, 0, night, 0, 1); }
        else { P.lamp(v, gl, 0, 0, night, 0, 1); v.setT(fr[2], x + 1.6 * fr[1], z - 1.6 * fr[0], yAt(x, z)); benchV(v, r, Math.floor(r() * 4)); v.setT(fr[2], x, z, yAt(x, z)); }
        stand('pbench', x, z, 1.4);
        made++;
      }
    });
    v.setT(); gl.setT();
  }

  // ---- industrial yards: containers, pallets
  if (raw && raw.bt && spare()) {
    const IND = set(C.LAND, C.PARKING, C.PLAZA, C.WALK, C.DIRT);
    let made = 0;
    (raw.b || []).forEach((e, bi) => {
      if (raw.bt[bi] !== 24 || made > (lite ? 8 : 18) || !spare()) return;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = 3; i + 1 < e.length; i += 2) { const x = e[i] / 10, z = TILE - e[i + 1] / 10; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      if ((x1 - x0) * (z1 - z0) < 300) return;
      const r = makeRng(hashStr(key + '|ind|' + bi));
      for (let t = 0; t < 14 && made <= 18; t++) {
        const side = Math.floor(r() * 4), off = r.range(3.5, 9);
        const x = side === 0 ? x0 - off : side === 1 ? x1 + off : r.range(x0, x1), z = side === 2 ? z0 - off : side === 3 ? z1 + off : r.range(z0, z1);
        const kind = r() < 0.55 ? 'container' : 'pallets', f = Math.floor(r() * 4), th = f * (Math.PI / 2);
        const len = kind === 'container' ? (r() < 0.5 ? 6 : 12) : 3.6, fr = frameOf(Math.sin(th), Math.cos(th));
        const pts = [[0, 0], [len / 2 - 0.3, 0], [-len / 2 + 0.3, 0], [0, 1.2], [0, -1.2]];
        let ok = inTile(x, z, 3);
        for (const [lx, lz] of pts) { const px = x + lx * fr[1] + lz * fr[0], pz = z - lx * fr[0] + lz * fr[1]; if (!IND[grid.get(px, pz)] || treeNear(px, pz, 1.2)) { ok = false; break; } }
        if (!ok || crowded('yard', x, z, len / 2 + 0.5)) continue;
        aim(th, x, z);
        if (kind === 'container') container(v, r, len, r() < 0.4 ? 2 : 1); else pallets(v, r);
        stand('yard', x, z, len / 2 + 0.5);
        made++;
      }
    });
    v.setT(); gl.setT();
  }

  // ---- beach life on any sand in the tile
  {
    let par = 0;
    const maxPar = lite ? 6 : 14;
    for (let t = 0; t < 160 && par < maxPar; t++) {
      const x = rnd.range(4, TILE - 4), z = rnd.range(4, TILE - 4);
      if (grid.get(x, z) !== C.SAND || grid.get(x + 2, z) !== C.SAND || grid.get(x - 2, z + 2) !== C.SAND || grid.get(x + 2, z - 2) !== C.SAND) continue;
      if (treeNear(x, z, 2.5) || crowded('parasol', x, z, 2.2, 7)) continue;
      const c = rnd.pick(['#e63946', '#ffb703', '#3a86ff', '#ff70a6', '#06d6a0']);
      v.setT(0, 0, 0, yAt(x, z));
      v.box(x, 0, z, 0.08, 2.0, 0.08, '#eee');
      for (let k = 0; k < 4; k++) v.box(x - 0.9 + k * 0.6, 2.0, z, 0.6, 0.12, 2.2, k % 2 ? c : '#ffffff');
      v.box(x, 2.12, z, 1.2, 0.12, 1.2, c);
      v.box(x + 1.3, 0, z, 0.8, 0.3, 0.9, '#f1faee'); v.box(x + 1.3, 0.3, z - 0.35, 0.8, 0.8, 0.2, c);
      v.box(x - 1.2, 0, z + 0.3, 1.5, 0.05, 0.8, rnd.pick(['#ff70a6', '#8ecae6', '#ffd166']));
      stand('parasol', x, z, 2.2);
      add('parasol', x, z, { tx: 1, tz: 0 }, 0, 1);
      par++;
    }
  }
  return finish();

  function finish() {
    v.setT(); gl.setT();
    for (const s of inTheWay) props.push(s);
    // every table of every terrace (props has one anchor per pair of tables): what the ground raster blocks (ground.js)
    const cells = [];
    for (const q of taken) if (q.kind === 'terrace') cells.push(q.x, q.z);
    return { props, cells };
  }
}
