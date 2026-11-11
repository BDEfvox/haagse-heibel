// The city's street life: walkers, cyclists, cars, trams, parked cars and lamp posts on every street around the
// camera, the open street included. One system for the whole city, kept alive when the focus moves to another
// street, so nothing about the traffic depends on which street happens to be open.
// Thousands of figures are drawn as a few instanced meshes; limbs swing in the vertex shader; each figure follows
// a lane derived from the real road map: pavements beside the carriageway, the right-hand side of the road, cycle
// paths, tram tracks. A gag that needs a passer-by takes one out of the crowd (see take/adopt) and puts them back.
import * as THREE from 'three';
import { clamp } from './kit.js';
import { PERSON_K } from './cast.js';
import { zebrasOn } from './world.js';
import { ARCHETYPES, spotAt } from './districts.js';

export const SKINS = ['#f2c9a0', '#e8b48a', '#c98e62', '#9a6642', '#f7d7b5', '#7a4f33'];
export const SHIRTS = ['#e84a5f', '#2a9d8f', '#f4a261', '#457b9d', '#e9c46a', '#9d4edd', '#ff7aa2', '#3a86ff', '#ffffff', '#52b788', '#fb8500'];
export const PANTS = ['#2b3a55', '#3d405b', '#6b705c', '#1d3557', '#5c4033', '#22223b', '#4a4e69'];
export const HAIRS = ['#2b1d14', '#5a3825', '#c58b3c', '#e6c36a', '#111111', '#a33b20', '#cfcfcf'];
const CARS = ['#b3261e', '#d9d9d6', '#2f3a48', '#3a6ea5', '#8a8f96', '#1c1f24', '#f1f1ee', '#5b6b52', '#7a2b2b', '#c9a227', '#30343f', '#c9d1d6', '#1d3557'];
const BIKES = ['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#111111', '#ff70a6', '#8ecae6'];
const lin = (list) => list.map((h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; });
const _hex = new Map();
const rgbOf = (h) => { let c = _hex.get(h); if (!c) { const k = new THREE.Color(h); _hex.set(h, (c = [k.r, k.g, k.b])); } return c; };
const P_SKIN = lin(SKINS), P_SHIRT = lin(SHIRTS), P_PANTS = lin(PANTS), P_HAIR = lin(HAIRS), P_CAR = lin(CARS), P_BIKE = lin(BIKES);

// ---------------------------------------------------------------- models
const FACES = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, -1]],
];
/**
 * Boxes → one geometry. Each box: [x, y (bottom), z, w, h, d, colour, part, limb, pivotY].
 * part: 0 keeps its own colour, 1-4 take the instance's colours, 5 glows. limb: 1/2 legs, 3/4 arms (they swing about pivotY).
 */
function model(list, sx = 1, sy = 1, sz = 1) {
  const n = list.length * 24, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), part = new Float32Array(n * 3), idx = new Uint16Array(list.length * 36), c = new THREE.Color();
  let v = 0, q = 0;
  for (const [x, y, z, w, h, d, color, pt = 0, limb = 0, pivot = 0] of list) {
    c.set(color);
    const lo = [x - w / 2, y, z - d / 2], hi = [x + w / 2, y + h, z + d / 2];
    for (const f of FACES) {
      const v0 = v;
      for (let k = 0; k < 4; k++, v++) {
        const s = f[k], o = v * 3;
        pos[o] = (s[0] ? hi[0] : lo[0]) * sx; pos[o + 1] = (s[1] ? hi[1] : lo[1]) * sy; pos[o + 2] = (s[2] ? hi[2] : lo[2]) * sz;
        nor[o] = f[4][0]; nor[o + 1] = f[4][1]; nor[o + 2] = f[4][2];
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
        part[o] = pt; part[o + 1] = limb; part[o + 2] = pivot * sy;
      }
      idx[q++] = v0; idx[q++] = v0 + 1; idx[q++] = v0 + 2; idx[q++] = v0; idx[q++] = v0 + 2; idx[q++] = v0 + 3;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
const W_ = '#ffffff';
// the same figure the cast module builds, as one mesh: shirt = colour 1, trousers 2, skin 3, hair 4.
// Written as pieces so the archetypes can swap some of them: [0..3] legs and shoes, [4] torso, [5..8] arms, [9] head,
// [10, 11] eyes, [12, 13] hair. Figures face +z; their left arm is the one at +x.
const SHOE = '#2a2a2a';
const legs = (shorts, shoe = SHOE) => [-1, 1].flatMap((sd, i) => (shorts
  ? [[sd * 0.2, 0.38, 0, 0.3, 0.32, 0.32, W_, 2, i + 1, 0.7], [sd * 0.2, 0, 0, 0.28, 0.38, 0.3, W_, 3, i + 1, 0.7]]
  : [[sd * 0.2, 0, 0, 0.3, 0.7, 0.32, W_, 2, i + 1, 0.7]]).concat([[sd * 0.2, 0, 0.05, 0.32, 0.14, 0.44, shoe, 0, i + 1, 0.7]]));
const arms = (bare) => [-1, 1].flatMap((sd, i) => [[sd * 0.51, 0.96, 0, 0.24, 0.5, 0.28, W_, bare ? 3 : 1, i + 3, 1.46], [sd * 0.51, 0.76, 0, 0.22, 0.2, 0.26, W_, 3, i + 3, 1.46]]);
const TORSO = [0, 0.7, 0, 0.78, 0.8, 0.46, W_, 1];
const HEAD = [[0, 1.5, 0, 0.66, 0.62, 0.62, W_, 3], [-0.16, 1.8, 0.31, 0.11, 0.13, 0.03, '#1b1b1b'], [0.16, 1.8, 0.31, 0.11, 0.13, 0.03, '#1b1b1b']];
const HAIR = [[0, 2.06, -0.02, 0.7, 0.14, 0.66, W_, 4], [0, 1.7, -0.3, 0.7, 0.4, 0.08, W_, 4]];
/** The standard figure with optional changes: { shorts, bare, shoe, hair: false, extra: [boxes] }. */
const figure = (o = {}) => [...legs(o.shorts, o.shoe), TORSO, ...arms(o.bare), ...HEAD, ...(o.hair === false ? [] : HAIR), ...(o.extra || [])];
const PERSON = () => model(figure());
// Boxes on a limb swing with it: pass the limb number and pivot (arms 3 = right, 4 = left at +x, pivot 1.46; legs 1/2, pivot 0.7).
const onArm = (x, y, z, w, h, d, c, limb = 4) => [x, y, z, w, h, d, c, 0, limb, 1.46];
const onLeg = (x, y, z, w, h, d, c, limb) => [x, y, z, w, h, d, c, 0, limb, 0.7];
// "HH": the parody monogram on a chest, two letters made of three bars each
const monogram = (z, c, y0 = 1.0) => [-0.2, 0.2].flatMap((cx) => [[cx - 0.08, y0 + 0.15, z, 0.05, 0.3, 0.02, c], [cx + 0.08, y0 + 0.15, z, 0.05, 0.3, 0.02, c], [cx, y0 + 0.28, z, 0.11, 0.045, 0.02, c]]);
const MODELS = {
  person: () => model(figure()),
  // Straat Niffo: beige/brown tracksuit with an "HH" monogram and a green-red stripe down sleeves and legs, cap or hood
  niffo: () => model(figure({
    shoe: '#e9e9e4',
    extra: [...monogram(0.235, '#4b2e16'), ...monogram(-0.235, '#4b2e16'),
      ...[3, 4].flatMap((l) => { const sd = l === 3 ? -1 : 1; return [onArm(sd * 0.64, 0.96, -0.05, 0.03, 0.5, 0.07, '#1d8a4f', l), onArm(sd * 0.64, 0.96, 0.05, 0.03, 0.5, 0.07, '#d62839', l)]; }),
      ...[1, 2].flatMap((l) => { const sd = l === 1 ? -1 : 1; return [onLeg(sd * 0.36, 0, -0.05, 0.03, 0.7, 0.07, '#1d8a4f', l), onLeg(sd * 0.36, 0, 0.05, 0.03, 0.7, 0.07, '#d62839', l)]; }),
      [0, 2.0, 0.39, 0.62, 0.06, 0.3, '#1a1a1a'], [0, 2.1, 0.0, 0.74, 0.1, 0.7, W_, 4]], // cap: crown in the hair colour, visor in front
  })),
  niffoHood: () => model(figure({
    shoe: '#e9e9e4', hair: false,
    extra: [...monogram(0.235, '#4b2e16'),
      ...[3, 4].flatMap((l) => { const sd = l === 3 ? -1 : 1; return [onArm(sd * 0.64, 0.96, -0.05, 0.03, 0.5, 0.07, '#1d8a4f', l), onArm(sd * 0.64, 0.96, 0.05, 0.03, 0.5, 0.07, '#d62839', l)]; }),
      ...[1, 2].flatMap((l) => { const sd = l === 1 ? -1 : 1; return [onLeg(sd * 0.36, 0, -0.05, 0.03, 0.7, 0.07, '#1d8a4f', l), onLeg(sd * 0.36, 0, 0.05, 0.03, 0.7, 0.07, '#d62839', l)]; }),
      [0, 2.09, -0.02, 0.76, 0.16, 0.72, W_, 1], [0, 1.6, -0.3, 0.76, 0.6, 0.14, W_, 1], [-0.37, 1.7, 0.0, 0.06, 0.5, 0.5, W_, 1], [0.37, 1.7, 0.0, 0.06, 0.5, 0.5, W_, 1]], // hood up
  })),
  // Haagse Harry: a mullet (short on top, long at the back and over the ears), a dark jacket with a stork badge on the
  // upper left sleeve (+x), pale jeans and white trainers
  harry: () => model(figure({
    shoe: '#f0f0ee',
    extra: [[0, 1.76, -0.37, 0.52, 0.66, 0.16, W_, 4], [-0.34, 1.7, -0.08, 0.06, 0.3, 0.3, W_, 4], [0.34, 1.7, -0.08, 0.06, 0.3, 0.3, W_, 4],
      [0, 1.44, 0.0, 0.82, 0.12, 0.5, '#15171c'], [0, 0.98, 0.235, 0.5, 0.1, 0.02, '#0f1114'],
      // the badge: a dark patch with a tiny white stork (red bill and legs)
      onArm(0.655, 1.28, 0, 0.04, 0.2, 0.2, '#101010'), onArm(0.685, 1.3, -0.01, 0.03, 0.11, 0.12, '#f4f4f4'), onArm(0.685, 1.34, 0.085, 0.03, 0.03, 0.1, '#d4202a'), onArm(0.685, 1.2, -0.02, 0.03, 0.09, 0.03, '#d4202a')],
  })),
  civil: () => model(figure({ shoe: '#15171c', extra: [[0, 1.0, 0.235, 0.18, 0.5, 0.02, '#f4f4f4'], [0, 0.98, 0.245, 0.06, 0.46, 0.02, '#b5232d'], [0.62, 0.4, 0.1, 0.1, 0.36, 0.5, '#3b2a20'], [0.62, 0.74, 0.1, 0.04, 0.06, 0.2, '#222']] })),
  tourist: () => model(figure({
    hair: false,
    extra: [[0, 2.08, 0, 0.7, 0.14, 0.66, W_, 4], [0, 2.02, 0, 1.0, 0.05, 1.0, '#e9dba8'], [0, 2.07, 0, 0.72, 0.16, 0.68, '#e9dba8'], [0, 1.7, -0.3, 0.7, 0.4, 0.08, W_, 4],
      [0, 0.85, -0.34, 0.58, 0.64, 0.22, '#e07a2f'], [0, 1.0, -0.47, 0.4, 0.3, 0.06, '#b85d1c'], [0, 1.3, 0.24, 0.52, 0.04, 0.02, '#222'], [0, 1.0, 0.29, 0.28, 0.17, 0.14, '#222'], [0, 1.0, 0.39, 0.11, 0.11, 0.08, '#9ec9d9']],
  })),
  jogger: () => model(figure({ shorts: true, bare: true, shoe: '#f7f7f7', extra: [[0, 1.96, 0, 0.71, 0.08, 0.67, '#ff4d6d'], [0, 1.0, 0.236, 0.4, 0.2, 0.02, '#ffffff']] })),
  pensionerTrolley: () => model(figure({ extra: [[0.74, 0.1, 0.2, 0.34, 0.6, 0.28, '#7a2e3a'], [0.74, 0.1, 0.34, 0.2, 0.3, 0.02, '#e6d9b8'], [0.74, 0.0, 0.2, 0.3, 0.1, 0.1, '#222'], [0.66, 0.7, 0.05, 0.04, 0.3, 0.04, '#333']] })),
  pensionerRollator: () => model(figure({ extra: [[0, 0.88, 0.7, 0.72, 0.05, 0.06, '#7a7f86'], [-0.34, 0.0, 0.7, 0.05, 0.88, 0.05, '#7a7f86'], [0.34, 0.0, 0.7, 0.05, 0.88, 0.05, '#7a7f86'], [0, 0.5, 0.82, 0.6, 0.05, 0.3, '#c0392b'], [-0.34, 0.0, 1.0, 0.05, 0.5, 0.05, '#7a7f86'], [0.34, 0.0, 1.0, 0.05, 0.5, 0.05, '#7a7f86']] })),
  surfer: () => model(figure({ extra: [[0.66, 0.05, 0.0, 0.07, 1.9, 0.5, '#f2c230'], [0.66, 0.05, 0.0, 0.08, 1.9, 0.07, '#d62828'], [0.66, 0.0, -0.18, 0.1, 0.18, 0.12, '#1b1b1b']] })),
  courier: () => model(figure({ hair: false, extra: [[0, 2.08, 0, 0.74, 0.18, 0.7, '#1b1b1b'], [0, 1.7, -0.3, 0.7, 0.4, 0.08, W_, 4], [0, 1.02, -0.42, 0.8, 0.76, 0.56, '#1fb6a8'], [0, 1.02, -0.71, 0.8, 0.12, 0.02, '#0c6c64'], [0, 1.5, -0.42, 0.8, 0.06, 0.5, '#168f84']] })),
  shopper: () => model(figure({ extra: [[0.72, 0.0, 0.14, 0.38, 0.78, 0.3, '#c43b3b'], [0.72, 0.34, 0.3, 0.26, 0.2, 0.02, '#fff4e0'], [0.72, 0.78, 0.14, 0.32, 0.12, 0.24, '#4c9a2a'], [0.72, 0.0, 0.14, 0.34, 0.1, 0.1, '#222'], [-0.6, 0.38, 0.04, 0.22, 0.32, 0.14, '#e9c46a'], [-0.6, 0.7, 0.04, 0.03, 0.18, 0.03, '#b08d3a']] })),
};
const modelGeo = (() => { const m = {}; return (key) => (m[key] ||= (MODELS[key] || MODELS.person)()); })();
// 4.4 x 1.85 x 1.5 m, the size of the cars the gags drive (body = colour 1)
const CAR = () => model([
  [0, 0.28, 0, 1.6, 0.55, 3.3, W_, 1], [0, 0.83, -0.2, 1.46, 0.5, 1.7, W_, 1],
  [0, 0.88, 0.67, 1.3, 0.38, 0.04, '#9fd4ee'], [0, 0.88, -1.07, 1.3, 0.38, 0.04, '#9fd4ee'],
  [0.73, 0.88, -0.2, 0.04, 0.36, 1.4, '#9fd4ee'], [-0.73, 0.88, -0.2, 0.04, 0.36, 1.4, '#9fd4ee'],
  [0.68, 0, 0.95, 0.3, 0.56, 0.6, '#1c1c1c'], [-0.68, 0, 0.95, 0.3, 0.56, 0.6, '#1c1c1c'], [0.68, 0, -0.95, 0.3, 0.56, 0.6, '#1c1c1c'], [-0.68, 0, -0.95, 0.3, 0.56, 0.6, '#1c1c1c'],
  [0, 0.3, 1.65, 1.5, 0.16, 0.08, '#444444'],
  [-0.5, 0.5, 1.66, 0.3, 0.16, 0.04, '#fff3b0', 5], [0.5, 0.5, 1.66, 0.3, 0.16, 0.04, '#fff3b0', 5],
  [-0.5, 0.5, -1.66, 0.3, 0.14, 0.04, '#ff2d2d', 5], [0.5, 0.5, -1.66, 0.3, 0.14, 0.04, '#ff2d2d', 5],
], 1.156, 1.13, 1.333);
const BIKE = () => model([
  [0, 0, -0.5, 0.08, 0.56, 0.56, '#1f1f1f'], [0, 0, 0.5, 0.08, 0.56, 0.56, '#1f1f1f'],
  [0, 0.3, 0, 0.08, 0.1, 0.9, W_, 1], [0, 0.36, -0.25, 0.08, 0.46, 0.08, W_, 1], [0, 0.8, -0.25, 0.16, 0.08, 0.3, '#2b2b2b'],
  [0, 0.36, 0.4, 0.08, 0.62, 0.08, W_, 1], [0, 0.96, 0.4, 0.5, 0.07, 0.07, '#2b2b2b'], [0, 0.62, 0.62, 0.3, 0.2, 0.26, '#8d6e4c'],
], 1.19, 1.19, 1.19);
const RIDER_Y = 0.52, RIDER_Z = -0.28, RIDER_S = 1.2 * PERSON_K;
// Fat-bike (20 x 4 inch tyres, long moped-style bench seat, big round headlight). Real metres, front towards +z.
const FATBIKE = () => model([
  [0, 0, -0.6, 0.13, 0.7, 0.7, '#121212'], [0, 0, 0.6, 0.13, 0.7, 0.7, '#121212'], [0, 0.18, -0.6, 0.15, 0.3, 0.3, '#8d9299'], [0, 0.18, 0.6, 0.15, 0.3, 0.3, '#8d9299'],
  [0, 0.3, 0.0, 0.16, 0.14, 1.0, W_, 1], [0, 0.42, -0.1, 0.2, 0.3, 0.62, '#202226'], [0, 0.4, 0.62, 0.1, 0.62, 0.1, '#202226'],
  [0, 0.78, -0.3, 0.27, 0.12, 0.96, '#17171a'], [0, 0.7, -0.78, 0.22, 0.1, 0.12, W_, 1], [0, 0.55, 0.62, 0.22, 0.05, 0.34, W_, 1],
  [0, 0.9, 0.52, 0.08, 0.3, 0.08, '#202226'], [0, 1.18, 0.5, 0.64, 0.06, 0.07, '#202226'],
  [0, 1.0, 0.68, 0.26, 0.26, 0.12, '#fff6c8', 5], [0, 0.82, -0.8, 0.16, 0.07, 0.04, '#ff2d2d', 5],
]);
// Cargo bike (bakfiets): long, a wooden box with two helmeted children in front of the rider
const CARGO = () => model([
  [0, 0, -0.95, 0.07, 0.62, 0.62, '#1f1f1f'], [0, 0, 1.5, 0.07, 0.5, 0.5, '#1f1f1f'],
  [0, 0.34, -0.1, 0.07, 0.1, 2.3, W_, 1], [0, 0.4, -0.5, 0.07, 0.62, 0.07, W_, 1], [0, 0.98, -0.5, 0.14, 0.07, 0.3, '#2b2b2b'],
  [0, 0.4, 1.4, 0.07, 0.5, 0.07, W_, 1], [0, 1.0, 0.1, 0.55, 0.07, 0.07, '#2b2b2b'], [0, 0.4, 0.5, 0.06, 0.64, 0.06, W_, 1],
  [0, 0.34, 0.72, 0.95, 0.1, 1.0, '#8d6e4c'], [-0.47, 0.44, 0.72, 0.05, 0.42, 1.0, '#a8845c'], [0.47, 0.44, 0.72, 0.05, 0.42, 1.0, '#a8845c'],
  [0, 0.44, 1.22, 0.95, 0.42, 0.05, '#a8845c'], [0, 0.44, 0.22, 0.95, 0.42, 0.05, '#a8845c'],
  [-0.2, 0.5, 0.62, 0.3, 0.4, 0.28, '#f4a261'], [-0.2, 0.9, 0.62, 0.28, 0.26, 0.28, '#ffd166'], [0.2, 0.5, 0.95, 0.3, 0.38, 0.28, '#2a9d8f'], [0.2, 0.88, 0.95, 0.28, 0.26, 0.28, '#e63946'],
  [0, 0.88, -0.98, 0.14, 0.07, 0.04, '#ff2d2d', 5],
]);
// where the rider sits on each: y offset of the figure's origin, z of the driver, z of a passenger (0 = none)
const RIDE = { bike: { y: RIDER_Y, z: RIDER_Z, z2: 0 }, fatbike: { y: 0.33, z: -0.1, z2: -0.5 }, cargo: { y: 0.4, z: -0.46, z2: 0 } };
const BIKES_ = { bike: () => BIKE(), fatbike: FATBIKE, cargo: CARGO };
// a street lamp; its arm reaches along +x (towards the road). At night the head glows.
const LAMP = (night) => model([
  [0, 0, 0, 0.16, 4.7, 0.16, '#3d434c'], [0.4, 4.6, 0, 0.9, 0.1, 0.12, '#3d434c'],
  [0.78, 4.44, 0, 0.44, 0.16, 0.3, night ? '#ffe9a8' : '#dfe4e8', night ? 5 : 0],
]);
// one section of an HTM tram (red skirt, cream top), 5.4 m long; a tram is five of these following the track
const TRAM = (night) => model([
  [0, 0.3, 0, 2.4, 1.05, 5.2, '#c8102e'], [0, 1.35, 0, 2.4, 1.6, 5.2, '#f3ecd9'], [0, 2.95, 0, 2.15, 0.2, 5.0, '#8d99a6'],
  [1.21, 1.6, 0, 0.03, 0.95, 4.4, night ? '#ffe9a8' : '#3b5b7a', night ? 5 : 0], [-1.21, 1.6, 0, 0.03, 0.95, 4.4, night ? '#ffe9a8' : '#3b5b7a', night ? 5 : 0],
  [0, 0.05, -1.5, 2.0, 0.3, 0.9, '#222222'], [0, 0.05, 1.5, 2.0, 0.3, 0.9, '#222222'],
  [0, 0.5, 2.7, 1.8, 2.0, 0.3, '#333333'],
]);
const TRAM_SEG = 5.5, TRAM_N = 5;

function crowdMat() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aPart;\nattribute vec4 iAnim;\nattribute vec3 iC1;\nattribute vec3 iC2;\nattribute vec3 iC3;\nattribute vec3 iC4;\nvarying float vGlow;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        vGlow = aPart.x > 4.5 ? 1.0 : 0.0;
        vColor.rgb *= aPart.x < 0.5 || aPart.x > 4.5 ? vec3(1.0) : aPart.x < 1.5 ? iC1 : aPart.x < 2.5 ? iC2 : aPart.x < 3.5 ? iC3 : iC4;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float limb = aPart.y, ride = iAnim.z;
          if (limb > 0.5) {
            float sgn = (limb < 1.5 || limb > 3.5) ? 1.0 : -1.0;
            bool leg = limb < 2.5;
            float ang = sgn * sin(iAnim.x) * iAnim.y * (leg ? 1.0 : 0.9);
            // iAnim.z: 0 walking, 1 riding, 2 talking with the hands, 3 looking at a phone, 4 hands in pockets (standing: the legs stay still)
            if (ride > 3.5) ang = leg ? 0.0 : 0.12;
            else if (ride > 2.5) ang = leg ? 0.0 : (sgn > 0.0 ? -1.0 + 0.06 * sin(iAnim.x * 1.3) : 0.0);
            else if (ride > 1.5) ang = leg ? 0.0 : (sgn > 0.0 ? -0.45 - 0.45 * sin(iAnim.x * 0.7 + 1.0) : -0.4 - 0.5 * sin(iAnim.x));
            else if (ride > 0.5) ang = leg ? -1.1 + sgn * 0.5 * sin(iAnim.x) : -1.1;
            float ca = cos(ang), sa = sin(ang);
            vec2 q = vec2(transformed.y - aPart.z, transformed.z);
            transformed.y = aPart.z + q.x * ca - q.y * sa;
            transformed.z = q.x * sa + q.y * ca;
          }
          transformed.y += abs(sin(iAnim.x)) * 0.1 * min(1.0, iAnim.y * 2.0) * (1.0 - min(ride, 1.0));
          // iAnim.w tips the whole figure over backwards about its feet (someone knocked off their feet)
          if (iAnim.w != 0.0) { float ct = cos(iAnim.w), st = sin(iAnim.w); vec2 r = transformed.yz; transformed.y = r.x * ct - r.y * st; transformed.z = r.x * st + r.y * ct; }
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, vColor.rgb, vGlow);\n\t#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'crowd3';
  return mat;
}
let _shared = null;
const shared = () => (_shared ||= { person: PERSON(), car: CAR(), bike: BIKE(), fatbike: null, cargo: null, lampDay: LAMP(false), lampNight: LAMP(true), tramDay: TRAM(false), tramNight: TRAM(true), mat: crowdMat() });

/** One instanced mesh with a free list of slots. */
class Pool {
  constructor(geo, mat, cap, anim) {
    // instanced attributes live on a private copy of the geometry, so pools can come and go while the model stays
    const g = geo.clone();
    this.cap = cap;
    this.c1 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    g.setAttribute('iC1', this.c1);
    if (anim) {
      this.c2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      this.c3 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      this.c4 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      this.anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      this.anim.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iC2', this.c2); g.setAttribute('iC3', this.c3); g.setAttribute('iC4', this.c4); g.setAttribute('iAnim', this.anim);
    } else {
      // The shader is shared with the people, and reads these for every pool. A pool that leaves them out gets whatever
      // the graphics driver has lying around (by the book 0, 0, 0, 1: every car and lamp post tipped over by a radian),
      // so cars, bikes, lamp posts and trams carry their own, all zeros: no limbs, no tipping, no extra colours.
      for (const k of ['iC2', 'iC3', 'iC4']) g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
      g.setAttribute('iAnim', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    }
    this.mesh = new THREE.InstancedMesh(g, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.array.fill(0);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.m = this.mesh.instanceMatrix.array;
    this.free = [];
    for (let i = cap - 1; i >= 0; i--) this.free.push(i);
    this.dirty = false;
    this.hi = 0; // highest slot ever used + 1: only these are drawn (the free list hands out low slots first)
    this.mesh.count = 0;
  }
  take() { if (!this.free.length) return -1; const i = this.free.pop(); if (i >= this.hi) { this.hi = i + 1; this.mesh.count = this.hi; } return i; }
  give(i) { this.hide(i); this.free.push(i); }
  hide(i) { const o = i * 16; this.m[o] = this.m[o + 5] = this.m[o + 10] = 0; this.dirty = true; }
  /** Stand slot i at (x, y, z), facing `hd`, at scale s. */
  put(i, x, y, z, hd, s) {
    const m = this.m, o = i * 16, c = Math.cos(hd) * s, sn = Math.sin(hd) * s;
    m[o] = c; m[o + 1] = 0; m[o + 2] = -sn; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = sn; m[o + 9] = 0; m[o + 10] = c; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    this.dirty = true;
  }
  tint(attr, i, c) { const a = attr.array, o = i * 3; a[o] = c[0]; a[o + 1] = c[1]; a[o + 2] = c[2]; attr.needsUpdate = true; }
  flush() {
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = false; }
    if (this.anim && this.hi) this.anim.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.dispose(); }
}

// ---------------------------------------------------------------- lanes
const STEP = 3; // lanes are resampled to points this far apart
/** Shift a polyline sideways (positive = to the right of its direction) and resample it evenly. */
function laneLine(a, off, rev) {
  const n = a.length >> 1;
  const ox = new Float64Array(n), oz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    let ax = a[i * 2] - a[i0 * 2], az = a[i * 2 + 1] - a[i0 * 2 + 1], bx = a[i1 * 2] - a[i * 2], bz = a[i1 * 2 + 1] - a[i * 2 + 1];
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    ax /= la; az /= la; bx /= lb; bz /= lb;
    if (i === 0) { ax = bx; az = bz; }
    if (i === n - 1) { bx = ax; bz = az; }
    let tx = ax + bx, tz = az + bz;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const k = off / Math.max(0.5, tx * ax + tz * az); // wider on the outside of a bend, capped
    ox[i] = a[i * 2] - tz * k; oz[i] = a[i * 2 + 1] + tx * k;
  }
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(ox[i] - ox[i - 1], oz[i] - oz[i - 1]);
  const m = Math.max(2, Math.round(len / STEP) + 1), out = new Float32Array(m * 2);
  let seg = 1, acc = 0, sl = Math.hypot(ox[1] - ox[0], oz[1] - oz[0]);
  for (let k = 0; k < m; k++) {
    const s = (len * k) / (m - 1);
    while (seg < n - 1 && s > acc + sl) { acc += sl; seg++; sl = Math.hypot(ox[seg] - ox[seg - 1], oz[seg] - oz[seg - 1]); }
    const t = sl > 1e-6 ? clamp((s - acc) / sl) : 0, j = rev ? m - 1 - k : k;
    out[j * 2] = ox[seg - 1] + (ox[seg] - ox[seg - 1]) * t; out[j * 2 + 1] = oz[seg - 1] + (oz[seg] - oz[seg - 1]) * t;
  }
  return out;
}

// The archetypes of districts.js, with their colours turned into the linear rgb the shader wants
const _arch = new Map();
function archOf(id) {
  if (!id) return null;
  let A = _arch.get(id);
  if (A === undefined) {
    const d = ARCHETYPES[id];
    A = d ? { id, def: d, models: d.models || [d.model || 'person'], bike: d.bike || 'bike', rider: d.kind === 'rider' } : null;
    _arch.set(id, A);
  }
  return A;
}
const ixOf = (r, n) => Math.min(n - 1, Math.floor(r * n));
/** Distance from (x, z) to the nearest segment of a pavement or bike lane of this owner, or Infinity if none is within r. */
function lanesWithin(o, x, z, r) {
  for (const l of o.lanes) {
    if (l.kind !== PED && l.kind !== BIKE_) continue;
    const p = l.pts;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2] - ax, bz = p[i + 3] - az, ll = bx * bx + bz * bz || 1, u = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / ll)), dx = ax + bx * u - x, dz = az + bz * u - z;
      if (dx * dx + dz * dz < r * r) return true;
    }
  }
  return false;
}
const GOOD_N = 8; // members of a group at most 6, ring checks use 8 points

export const PED = 0, BIKE_ = 1, CAR_ = 2, TRAM_ = 4;
const CELL = 8, GN = 256; // collision grid: 8 m cells, about 2 km across

export class Crowd {
  constructor(W, { lite = false } = {}) {
    this.W = W;
    const S = shared(), k = lite ? 0.3 : 1;
    this.k = k;
    this.night = W.night;
    // one pool per figure model: the plain people, plus one for each archetype look that gets used (made on first use)
    this.people = new Pool(S.person, S.mat, Math.round(1150 * k), true);
    this.pools = new Map([['person', this.people]]); // model id → people pool
    this.vpools = new Map(); // bike model id → pool of vehicles ('bike' is this.bikes)
    this.cars = new Pool(S.car, S.mat, Math.round(1350 * k), false);
    this.bikes = new Pool(S.bike, S.mat, Math.round(270 * k), false);
    this.vpools.set('bike', this.bikes);
    this.lamps = new Pool(W.night ? S.lampNight : S.lampDay, S.mat, Math.round(1000 * k), false);
    this.trams = new Pool(W.night ? S.tramNight : S.tramDay, S.mat, Math.round(120 * k), false);
    this.max = { [PED]: Math.round(780 * k), [BIKE_]: Math.round(250 * k), [CAR_]: Math.round(320 * k), [TRAM_]: Math.round(22 * k), parked: Math.round(980 * k) };
    this.count = { [PED]: 0, [BIKE_]: 0, [CAR_]: 0, [TRAM_]: 0, parked: 0 };
    this.group = new THREE.Group();
    this.group.add(this.people.mesh, this.cars.mesh, this.bikes.mesh, this.lamps.mesh, this.trams.mesh);
    this.owners = new Map(); // tile key → { lanes, parked, lamps, agents, groups, hot, pend, cx, cz, r, on }
    this.agents = [];
    this.ends = new Map(); // lane ends by 6 m cell, for finding the way on at a junction
    this.pedIx = null; // pavement points by 4 m cell, for crossing the road (built when first needed)
    this.head = new Int32Array(GN * GN); this.next = new Int32Array(4096);
    this.t = 0; this.tick = 0; this.seed = 1234567;
    this.hidden = false;
    // what the stage tells the crowd every frame
    this.blockers = []; // actors on stage: { x, z, r }
    this.zones = []; // stretches of road a gag has closed: { x, z, r }
    this.jay = 0.004; // chance per second that a walker crosses the road without looking
    this.onBonk = null; // (x, y, z, byBike) when someone is knocked over
    this.bonkAt = -99;
    // continuity: nothing appears or vanishes where the camera can see it (see _seen)
    this.cam = null; this.fr = new THREE.Frustum(); this.pv = new THREE.Matrix4();
    this.cx = 0; this.cy = 0; this.cz = 0; this.gy = 0; this.far2 = 360 * 360; this.warm = true;
    this.onFoot = false; this.goodT = null;
    this.riders = []; // fat-bikes on the pavement this frame (walkers step aside for them)
    this.people.mesh.onBeforeRender = (r, sc, cam) => { if (cam.isPerspectiveCamera) this.cam = cam; }; // the camera that draws the scene (not the shadow's)
  }
  /** The people pool for a figure model. Pools are made on first use. */
  _pool(model, A) {
    let p = this.pools.get(model);
    if (!p) {
      p = new Pool(modelGeo(model), shared().mat, Math.max(8, Math.round((A?.def.cap || 40) * this.k)), true);
      this.pools.set(model, p); this.group.add(p.mesh);
      p.mesh.visible = !this.hidden;
    }
    return p;
  }
  /** The vehicle pool for a bike model ('bike', 'fatbike', 'cargo'). */
  _vpool(key) {
    let p = this.vpools.get(key);
    if (!p) {
      const S = shared();
      S[key] ||= BIKES_[key]();
      p = new Pool(S[key], S.mat, Math.round((key === 'fatbike' ? 150 : 50) * this.k) + 8, false);
      this.vpools.set(key, p); this.group.add(p.mesh);
      p.mesh.visible = !this.hidden;
    }
    return p;
  }
  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  _cls(x, z) { return this.W.clsAt(x, z); }

  // ------------------------------------------------------------ building lanes
  /** A streamed tile's roads and tracks (given in the tile's own coordinates). A tile that is already known is left alone. */
  addTile(t) {
    if (this.owners.has(t.key)) { this.owners.get(t.key).seen = this.t; return; }
    const W = this.W, f = W.frame, TILE = 256, ctr = f.S(t.ox + TILE / 2, t.oy + TILE / 2), toScene = (x, z) => f.S(t.ox + x, t.oy + TILE - z);
    const o = { id: t.key, lanes: [], parked: [], lamps: [], agents: new Set(), groups: [], hot: [], pend: [], cx: ctr[0], cz: ctr[1], r: 190, on: false, seen: this.t };
    // places where people gather, from the tile's points of interest (kinds 1 bar, 2 cafe/snack bar, 6 coffee shop, 8 bench)
    // and benches that were furnished: flat [x, z, tag] with tag 1 bench, 2 bar, 3 snack
    for (const e of t.pois || []) {
      const tag = e[0] === 8 ? 1 : e[0] === 1 ? 2 : e[0] === 2 || e[0] === 6 ? 3 : 0;
      if (tag) { const p = f.S(t.ox + e[1] / 10, t.oy + e[2] / 10); o.hot.push(p[0], p[1], tag); }
    }
    for (const q of t.props || []) if (q.kind === 'bench') { const p = toScene(q.x, q.z); o.hot.push(p[0], p[1], 1); }
    const C = W.C, walk = new Uint8Array(256), road = new Uint8Array(256);
    for (const k of [C.WALK, C.LAND, C.PLAZA, C.FOOT, C.PED, C.CURB, C.DIRT]) walk[k] = 2;
    for (const k of [C.ASPHALT, C.KLINKER, C.SERVICE, C.CYCLE, C.BIKELANE, C.MARK, C.PARKING, C.RAILBED, C.RAIL]) { walk[k] = 1; road[k] = 1; }
    walk[255] = 2; // no tile there yet: give the benefit of the doubt
    /** Cut a lane into the stretches that are allowed (test() → 2 fine, 1 passable for a short way, 0 no). */
    const split = (pts, kind, cls, test, extra) => {
      const n = pts.length >> 1;
      let a = -1, lastGood = -1, soft = 0;
      const close = (b) => {
        if (a >= 0 && b - a >= 2) {
          const p = pts.slice(a * 2, (b + 1) * 2), m = b - a + 1;
          let len = 0;
          for (let i = 1; i < m; i++) len += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
          const lane = { pts: p, n: m, len, step: len / (m - 1), kind, cls, owner: o, dead: false, side: 0, rw: 0, zeb: null, info: null, heldAt: -99, ...extra };
          if (lane.zeb) lane.zeb = lane.zeb.map((s) => s - a * STEP).filter((s) => s > 2 && s < len - 2);
          o.lanes.push(lane);
          this._end(lane, 0, true); this._end(lane, 1, true);
        }
        a = -1;
      };
      for (let i = 0; i < n; i++) {
        const q = test(pts[i * 2], pts[i * 2 + 1]);
        if (q === 2) { if (a < 0) a = i; lastGood = i; soft = 0; }
        else if (q === 1 && a >= 0 && ++soft <= 5) { /* a crossing: carry on */ }
        else { close(lastGood); soft = 0; }
      }
      close(lastGood);
    };
    const yes = () => 2, walkable = (x, z) => walk[this._cls(x, z)];
    const conv = (src) => { const a = new Float32Array(src.length); for (let i = 0; i + 1 < a.length; i += 2) { const p = toScene(src[i], src[i + 1]); a[i] = p[0]; a[i + 1] = p[1]; } return a; };
    for (const rd of t.roads) {
      const cls = rd.cls, fl = rd.flags;
      if (cls > 13 || cls === 12 || fl & 4 || rd.a.length < 4) continue;
      const a = conv(rd.a);
      // a steady coin for this piece of road, from the map data itself (so it lands the same whichever street is open)
      const w = Math.max(rd.w || 6, 1.5), one = !!(fl & 1), h = ((rd.a[0] * 73.1 + rd.a[1] * 37.7) % 1 + 1) % 1;
      if (cls <= 5 || cls === 13) {
        // through roads: keep right, one lane each way
        split(laneLine(a, one ? Math.min(1.6, w / 6) : w / 4, false), CAR_, cls, yes);
        if (!one) split(laneLine(a, -w / 4, true), CAR_, cls, yes);
      } else if (cls === 6 || cls === 7 || cls === 9) {
        // small streets: one car at a time down the middle, parked cars along one kerb
        const rev = !one && h < 0.5, park = cls !== 9 && w >= 5;
        split(laneLine(a, park ? (rev ? -0.7 : 0.7) : 0, rev), CAR_, cls, yes);
        if (park) {
          const line = laneLine(a, (rev ? 1 : -1) * (w / 2 - 0.98), !rev), n = line.length >> 1;
          for (let i = 1; i + 1 < n; i += 2) {
            const x = line[i * 2], z = line[i * 2 + 1], coin = ((rd.a[0] * 13.7 + i * 0.618) % 1 + 1) % 1;
            if (coin > 0.5 || !road[this._cls(x, z)]) continue;
            o.parked.push(x, z, Math.atan2(line[i * 2 + 2] - line[i * 2 - 2], line[i * 2 + 3] - line[i * 2 - 1]), Math.floor(coin * 2 * P_CAR.length));
          }
        }
      }
      if (cls === 10) {
        split(laneLine(a, one ? 0 : 0.6, false), BIKE_, cls, yes);
        if (!one) split(laneLine(a, -0.6, true), BIKE_, cls, yes);
      } else if (cls >= 3 && cls <= 7) {
        const park = (cls === 6 || cls === 7) && w >= 5, rev = !one && h < 0.5;
        split(laneLine(a, w / 2 - 0.6, false), BIKE_, cls, yes);
        // on a small street with parking the kerb on that side is taken: ride just left of the cars instead
        if (!one) split(laneLine(a, park && !rev ? -0.75 : -(w / 2 - 0.6), true), BIKE_, cls, yes);
      }
      if (cls >= 2 && cls <= 7) {
        // lamp posts at the kerb, every 30 m, the two sides staggered
        for (const side of [1, -1]) {
          const line = laneLine(a, side * (w / 2 + 0.7), false), n = line.length >> 1;
          for (let i = side > 0 ? 3 : 8; i + 1 < n; i += 10) {
            const x = line[i * 2], z = line[i * 2 + 1];
            if (walk[this._cls(x, z)] !== 2) continue;
            const dx = line[i * 2 + 2] - x, dz = line[i * 2 + 3] - z; // the road lies to the left of a right-hand kerb line
            o.lamps.push(x, z, Math.atan2(side * dx, side * dz));
          }
        }
        // pavements on both sides; walkers can cross from one to the other, at the zebras by preference
        let len = 0;
        for (let i = 2; i + 1 < a.length; i += 2) len += Math.hypot(a[i] - a[i - 2], a[i + 1] - a[i - 1]);
        const zeb = zebrasOn(len);
        split(laneLine(a, w / 2 + 1.35, false), PED, cls, walkable, { side: 1, rw: w, zeb });
        split(laneLine(a, -(w / 2 + 1.35), false), PED, cls, walkable, { side: -1, rw: w, zeb });
      } else if (cls === 8) {
        split(laneLine(a, w / 4, false), PED, cls, walkable);
        split(laneLine(a, -w / 4, false), PED, cls, walkable);
      } else if (cls === 11) split(laneLine(a, 0, false), PED, cls, walkable);
    }
    // tram tracks: each rail line is one direction of travel
    for (const rl of t.rails || []) {
      if (rl.kind === 2 || rl.flags & 4 || rl.a.length < 4) continue;
      split(laneLine(conv(rl.a), 0, false), TRAM_, 1, yes);
    }
    this.owners.set(t.key, o);
    this.pedIx = null;
  }
  _end(lane, e, add) {
    const i = e ? lane.n - 1 : 0, key = Math.floor(lane.pts[i * 2] / 6) * 65536 + Math.floor(lane.pts[i * 2 + 1] / 6);
    let bin = this.ends.get(key);
    if (add) { if (!bin) this.ends.set(key, (bin = [])); bin.push(lane, e); }
    else if (bin) { for (let k = bin.length - 2; k >= 0; k -= 2) if (bin[k] === lane && bin[k + 1] === e) bin.splice(k, 2); if (!bin.length) this.ends.delete(key); }
  }
  remove(id) {
    const o = this.owners.get(id);
    if (!o) return;
    this._empty(o);
    for (const l of o.lanes) { l.dead = true; this._end(l, 0, false); this._end(l, 1, false); }
    this.owners.delete(id);
    this.pedIx = null;
  }
  /** Forget tiles that are no longer on screen (`live` has the keys that are). */
  prune(live) {
    for (const id of [...this.owners.keys()]) if (!live.has(id) && this.t - this.owners.get(id).seen > 3) this.remove(id);
  }
  /**
   * The focus moved to another street, whose scene has its own origin and orientation: carry every lane, post and
   * figure over to it. Nobody on the street notices.
   */
  rebase(W2) {
    const f1 = this.W.frame, f2 = W2.frame;
    const mv = (x, z) => { const m = f1.M(x, z); return f2.S(m[0], m[1]); };
    const o0 = mv(0, 0), o1 = mv(0, 1), turn = Math.atan2(o1[0] - o0[0], o1[1] - o0[1]); // what a heading of 0 becomes
    this.ends.clear();
    for (const o of this.owners.values()) {
      const c = mv(o.cx, o.cz);
      o.cx = c[0]; o.cz = c[1]; o.seen = this.t;
      for (const l of o.lanes) {
        for (let i = 0; i + 1 < l.pts.length; i += 2) { const p = mv(l.pts[i], l.pts[i + 1]); l.pts[i] = p[0]; l.pts[i + 1] = p[1]; }
        this._end(l, 0, true); this._end(l, 1, true);
      }
      for (let i = 0; i < o.parked.length; i += 4) { const p = mv(o.parked[i], o.parked[i + 1]); o.parked[i] = p[0]; o.parked[i + 1] = p[1]; o.parked[i + 2] += turn; }
      for (let i = 0; i < o.lamps.length; i += 3) { const p = mv(o.lamps[i], o.lamps[i + 1]); o.lamps[i] = p[0]; o.lamps[i + 1] = p[1]; o.lamps[i + 2] += turn; }
      for (let i = 0; i < o.hot.length; i += 3) { const p = mv(o.hot[i], o.hot[i + 1]); o.hot[i] = p[0]; o.hot[i + 1] = p[1]; }
      for (const g of o.groups) {
        const c = mv(g.x, g.z); g.x = c[0]; g.z = c[1];
        for (const m of g.members) { const q = mv(m.x, m.z); m.x = q[0]; m.z = q[1]; m.hd += turn; m.want += turn; }
        for (const b of g.bikes) { const q = mv(b.x, b.z); b.x = q[0]; b.z = q[1]; b.hd += turn; }
      }
      for (const a of o.agents) {
        if (a.fixed) { const p = mv(a.x, a.z); a.x = p[0]; a.z = p[1]; a.hd += turn; (a.kind === 3 ? this.lamps : this.cars).put(a.slot, a.x, W2.hAt(a.x, a.z), a.z, a.hd, 1); }
      }
    }
    for (const a of this.agents) {
      if (a.dead) continue;
      const p = mv(a.x, a.z), q = mv(a.x + a.ox, a.z + a.oz);
      a.ox = q[0] - p[0]; a.oz = q[1] - p[1]; a.x = p[0]; a.z = p[1]; a.hd += turn;
      if (a.cross) { const u = mv(a.cross.x0, a.cross.z0), w = mv(a.cross.x1, a.cross.z1); a.cross.x0 = u[0]; a.cross.z0 = u[1]; a.cross.x1 = w[0]; a.cross.z1 = w[1]; }
      if (a.fall) { const u = mv(a.fall.x0, a.fall.z0), w = mv(a.fall.x0 + a.fall.vx, a.fall.z0 + a.fall.vz); a.fall.x0 = u[0]; a.fall.z0 = u[1]; a.fall.vx = w[0] - u[0]; a.fall.vz = w[1] - u[1]; if (a.fall.to) { const e = mv(a.fall.to.x1, a.fall.to.z1); a.fall.to.x1 = e[0]; a.fall.to.z1 = e[1]; } }
    }
    this.W = W2;
    for (const o of this.owners.values()) for (const g of o.groups) if (g.shown) this._gPut(g);
    this.pedIx = null;
    this.blockers = []; this.zones = [];
  }

  // ------------------------------------------------------------ people and vehicles
  _empty(o) {
    for (const a of o.agents) this._free(a, false);
    o.agents.clear();
    for (const g of o.groups) if (g.shown) this._gHide(g);
    o.groups.length = 0; o.pend.length = 0;
    o.on = false;
  }
  _free(a, unlink = true) {
    if (a.dead) return;
    a.dead = true;
    if (a.kind === 3) this.lamps.give(a.slot);
    else if (a.kind === PED) { a.pp.anim.array[a.slot * 4 + 3] = 0; a.pp.give(a.slot); }
    else if (a.kind === BIKE_) { a.vp.give(a.slot); a.pp.give(a.rider); if (a.pass >= 0) a.pp.give(a.pass); }
    else if (a.kind === TRAM_) for (const s of a.tail) this.trams.give(s.slot);
    else this.cars.give(a.slot);
    if (a.kind !== 3) this.count[a.fixed ? 'parked' : a.kind]--;
    if (unlink && a.lane) a.lane.owner.agents.delete(a);
  }
  /**
   * Would anyone watching see something appear or vanish here? Only what is inside the view (with a margin) and close
   * enough to be more than a speck counts. Everything that comes into or leaves the world does so where this is false.
   */
  _seen(x, z) {
    if (!this.cam) return false;
    const gy = this.gy, dx = x - this.cx, dy = gy - this.cy, dz = z - this.cz;
    if (dx * dx + dy * dy + dz * dz > this.far2) return false;
    const pl = this.fr.planes;
    for (let i = 0; i < 6; i++) { const q = pl[i], n = q.normal; if (n.x * x + n.y * gy + n.z * z + q.constant < -10) return false; }
    return true;
  }
  /** What a lane's district says: multiplier for the generic traffic and the archetypes that can appear on it (cached on the lane). */
  _info(lane) {
    if (lane.info) return lane.info;
    const h = lane.n >> 1, m = this.W.frame.M(lane.pts[h * 2], lane.pts[h * 2 + 1]), sp = spotAt(m[0], m[1]), k = lane.kind;
    const I = { pop: sp.pop, mult: k === PED ? sp.mult.walk : k === BIKE_ ? sp.mult.bike : k === CAR_ ? sp.mult.car : 1, ids: [], cum: [], foot: [] };
    if (k === PED || k === BIKE_) {
      let tot = 0;
      for (const id in sp.pop) {
        const A = archOf(id), d = sp.pop[id];
        if (!A || !(d > 0)) continue;
        const w = k === PED ? (A.rider ? d * (A.def.pave || 0) : d) : A.rider ? d : 0; // riders show up among walkers only if they ride on the pavement
        if (w > 0) { tot += w / 100; I.ids.push(id); I.cum.push(tot); I.foot.push(false); }
        if (k === PED && A.rider && A.def.foot) { tot += (d * A.def.foot) / 100; I.ids.push(id); I.cum.push(tot); I.foot.push(true); } // the same people on foot
      }
      if (tot > 0.92) for (let i = 0; i < I.cum.length; i++) I.cum[i] *= 0.92 / tot;
    }
    return (lane.info = I);
  }
  /** Which archetype (if any) the next person on this lane is. */
  _pick(lane) {
    const I = this._info(lane);
    if (!I.ids.length) return null;
    const r = this.rnd();
    for (let i = 0; i < I.ids.length; i++) if (r < I.cum[i]) { const A = archOf(I.ids[i]); this.onFoot = I.foot[i]; return A.rider && !this.onFoot && this.count[BIKE_] >= this.max[BIKE_] ? null : A; }
    return null;
  }
  _fill(o) {
    o.on = true;
    // parked cars and lamp posts go up as soon as nobody can see them appear (see _reveal)
    for (let i = 0; i < o.parked.length; i += 4) o.pend.push(i);
    for (let i = 0; i < o.lamps.length; i += 3) o.pend.push(-1 - i);
    this._reveal(o);
    // how many per 100 m of lane, by kind and by how big the street is
    const DENS = {
      [PED]: { 2: 1.5, 3: 1.5, 4: 1.3, 5: 0.9, 6: 0.85, 7: 0.7, 8: 4.2, 11: 0.5 },
      [BIKE_]: { 3: 0.5, 4: 0.5, 5: 0.35, 6: 0.25, 7: 0.2, 10: 1.0 },
      [CAR_]: { 1: 2.0, 2: 1.9, 3: 1.6, 4: 1.2, 5: 0.7, 6: 0.3, 7: 0.14, 9: 0.04, 13: 0.2 },
      [TRAM_]: { 1: 0.14 },
    };
    for (const lane of o.lanes) {
      const want = ((DENS[lane.kind][lane.cls] || 0) * lane.len * this._info(lane).mult) / 100;
      let n = Math.floor(want) + (this.rnd() < want % 1 ? 1 : 0);
      while (n-- > 0 && this.count[lane.kind] < this.max[lane.kind]) this._spawn(lane, this.rnd() * lane.len);
    }
    this._groups(o);
  }
  /** Put up the owner's parked cars and lamp posts that nobody would see appear. */
  _reveal(o) {
    const pend = o.pend, W = this.W;
    for (let q = pend.length - 1; q >= 0; q--) {
      const i = pend[q], lamp = i < 0, j = lamp ? -1 - i : i, x = lamp ? o.lamps[j] : o.parked[j], z = lamp ? o.lamps[j + 1] : o.parked[j + 1];
      if (!this.warm && this._seen(x, z)) continue;
      pend[q] = pend[pend.length - 1]; pend.pop();
      if (lamp) {
        const slot = this.lamps.take();
        if (slot < 0) continue;
        this.lamps.put(slot, x, W.hAt(x, z), z, o.lamps[j + 2], 1);
        o.agents.add({ kind: 3, fixed: true, slot, x, z, hd: o.lamps[j + 2], dead: false, lane: { owner: o } });
      } else {
        if (this.count.parked >= this.max.parked) continue;
        const slot = this.cars.take();
        if (slot < 0) continue;
        this.cars.put(slot, x, W.hAt(x, z), z, o.parked[j + 2], 1);
        this.cars.tint(this.cars.c1, slot, P_CAR[o.parked[j + 3] % P_CAR.length]);
        this.count.parked++;
        o.agents.add({ kind: CAR_, fixed: true, slot, x, z, hd: o.parked[j + 2], dead: false, lane: { owner: o } });
      }
    }
  }
  /** A new set of clothes for an archetype. Skin always comes from the crowd's own palette; the archetype only picks clothes. */
  _archLook(A, model) {
    const d = A.def, r = () => this.rnd(), pick = (l) => Math.floor(r() * l.length), hx = (own, all) => (own ? own[pick(own)] : all[pick(all)]);
    return {
      kind: A.id, model, shirt: pick(P_SHIRT), pants: pick(P_PANTS), skin: pick(P_SKIN), hair: pick(P_HAIR), kid: false,
      cols: { shirt: hx(d.shirt, SHIRTS), pants: hx(d.pants, PANTS), hair: hx(d.hair, HAIRS) },
    };
  }
  /** lane: the lane to stand on (for a rider it may be a pavement lane); look: given when somebody is handed back to the crowd. */
  _spawn(lane, s, look = null) {
    const kind = lane.kind, r = () => this.rnd(), pick = (l) => Math.floor(r() * l.length), rng = (v) => v[0] + r() * (v[1] - v[0]);
    this.onFoot = false;
    let A = look ? archOf(look.kind) : kind === PED || kind === BIKE_ ? this._pick(lane) : null;
    const rides = kind === BIKE_ || (A && A.rider && !(look ? !look.ride : this.onFoot)) || !!(look && look.ride), ak = rides ? BIKE_ : kind;
    const a = { kind: ak, lane, s, dir: kind === PED && r() < 0.5 ? -1 : 1, v: 0, v0: 0, slot: -1, rider: -1, pass: -1, pp: null, vp: null, rd: null, pave: rides && kind === PED, held: false, gait: 1, lean: 0, ph: r() * 6.28, hd: 0, x: 0, z: 0, ox: 0, oz: 0, lat: 0, pop: 0, wait: 0, ghost: 0, sc: 1, dead: false, vis: false, first: true, look: null, cross: null, fall: null, down: 0, think: r(), fixed: false };
    if (ak === PED) {
      let model = look?.model || 'person', pool = this.people;
      if (A) { if (!look) model = A.models[pick(A.models)]; pool = this._pool(model, A); }
      a.slot = pool.take();
      if (a.slot < 0 && A) { A = null; look = null; model = 'person'; pool = this.people; a.slot = pool.take(); } // that look is used up: a plain walker instead
      if (a.slot < 0) return null;
      a.pp = pool;
      a.look = look || (A ? this._archLook(A, model) : { shirt: pick(P_SHIRT), pants: pick(P_PANTS), skin: pick(P_SKIN), hair: pick(P_HAIR), kid: r() < 0.1 });
      a.sc = (a.look.kid ? 0.85 : 1.25) * PERSON_K * (0.94 + r() * 0.12) * (A?.def.scale || 1);
      a.v0 = a.look.kid ? 1.9 : A ? rng(A.rider ? A.def.footSpeed || [1.2, 1.8] : A.def.speed) : 1.25 + r() * 0.55;
      a.gait = A?.def.gait ?? 1; a.lean = A?.def.lean || 0;
      this._dress(pool, a.slot, a.look);
    } else if (ak === BIKE_) {
      const bk = A ? A.bike : look?.ride || 'bike';
      let model = look?.model || 'person', pool = this.people;
      if (A) { if (!look) model = A.models[pick(A.models)]; pool = this._pool(model, A); }
      a.vp = bk === 'bike' ? this.bikes : this._vpool(bk); a.pp = pool; a.rd = RIDE[bk] || RIDE.bike;
      a.slot = a.vp.take(); a.rider = pool.take();
      if (a.slot < 0 || a.rider < 0) { if (a.slot >= 0) a.vp.give(a.slot); if (a.rider >= 0) pool.give(a.rider); return null; }
      const two = a.rd.z2 && (look ? look.riders === 2 : A && r() < (A.def.twoUp || 0));
      if (two) a.pass = pool.take();
      a.look = look || (A ? this._archLook(A, model) : { shirt: pick(P_SHIRT), pants: pick(P_PANTS), skin: pick(P_SKIN), hair: pick(P_HAIR), kid: false, ride: bk });
      a.look.ride = bk; a.look.riders = a.pass >= 0 ? 2 : 1;
      if (a.pass >= 0 && !a.look.pass) { const q = A ? this._archLook(A, model) : { shirt: pick(P_SHIRT), pants: pick(P_PANTS), skin: pick(P_SKIN), hair: pick(P_HAIR), kid: false }; a.look.pass = q; }
      if (a.pass < 0) a.look.pass = null;
      a.v0 = A ? rng(a.pave ? A.def.paveSpeed || A.def.speed : A.def.speed) : 4.2 + r() * 1.6;
      const bc = A?.def.bikeCols;
      a.vp.tint(a.vp.c1, a.slot, bc ? rgbOf(bc[pick(bc)]) : P_BIKE[pick(P_BIKE)]);
      this._dress(pool, a.rider, a.look);
      if (a.pass >= 0) this._dress(pool, a.pass, a.look.pass);
    } else if (ak === TRAM_) {
      a.tail = [];
      for (let i = 0; i < TRAM_N; i++) { const slot = this.trams.take(); if (slot < 0) break; a.tail.push({ slot }); }
      if (a.tail.length < TRAM_N) { for (const t of a.tail) this.trams.give(t.slot); return null; }
      a.v0 = 8.5;
    } else {
      a.slot = this.cars.take();
      if (a.slot < 0) return null;
      a.v0 = (lane.cls <= 2 ? 11 : lane.cls <= 4 ? 9 : lane.cls === 5 ? 7.5 : 5) * (0.85 + r() * 0.3);
      this.cars.tint(this.cars.c1, a.slot, r() < 0.05 ? [1, 0.67, 0.0] : P_CAR[pick(P_CAR)]);
    }
    a.v = a.v0;
    this.count[ak]++;
    lane.owner.agents.add(a);
    this.agents.push(a);
    return a;
  }
  _dress(P, slot, k) {
    const c = k.cols;
    P.tint(P.c1, slot, c ? rgbOf(c.shirt) : P_SHIRT[k.shirt]); P.tint(P.c2, slot, c ? rgbOf(c.pants) : P_PANTS[k.pants]); P.tint(P.c3, slot, P_SKIN[k.skin]); P.tint(P.c4, slot, c ? rgbOf(c.hair) : P_HAIR[k.hair]);
  }

  // ------------------------------------------------------------ groups hanging around
  _good() {
    if (this.goodT) return this.goodT;
    const C = this.W.C, t = new Uint8Array(256);
    for (const k of [C.WALK, C.PED, C.PLAZA, C.LAND, C.FOOT]) t[k] = 1;
    return (this.goodT = t); // 255 (no tile there yet) is not good: nobody stands on ground that is not known
  }
  /** Is there open pavement all round (x, z) out to rad, with no trunk in the way? */
  _ringOK(x, z, rad) {
    const G = this._good();
    if (!G[this._cls(x, z)]) return false;
    for (let k = 0; k < GOOD_N; k++) { const an = (k * Math.PI) / 4; if (!G[this._cls(x + Math.sin(an) * rad, z + Math.cos(an) * rad)]) return false; }
    return !this.W.treeNear(x, z, rad + 0.45);
  }
  /** Look along the pavements for spots where an archetype with a `group` hangs around, and plan the groups (they are drawn when nobody sees them appear). */
  _groups(o) {
    const per = [];
    for (const id in ARCHETYPES) { const A = archOf(id); if (A && A.def.group) per.push(A); }
    if (!per.length) return;
    const hot = o.hot, C = this.W.C;
    for (const lane of o.lanes) {
      if (lane.kind !== PED || lane.len < 14 || (!lane.side && lane.cls !== 8 && lane.cls !== 11)) continue;
      const I = this._info(lane);
      for (const A of per) {
        const d = I.pop[A.id], G = A.def.group, near = G.near || {};
        if (!(d > 0)) continue;
        for (let s = 4 + this.rnd() * 16; s < lane.len - 3 && o.groups.length < 9; s += 11 + this.rnd() * 10) {
          const f = s / lane.step, k = Math.min(lane.n - 2, Math.floor(f)), t = f - k, p = lane.pts;
          const x = p[k * 2] + (p[k * 2 + 2] - p[k * 2]) * t, z = p[k * 2 + 1] + (p[k * 2 + 3] - p[k * 2 + 1]) * t;
          let b = 1, hb = 1;
          for (let h = 0; h < hot.length; h += 3) {
            const dx = hot[h] - x, dz = hot[h + 1] - z;
            if (dx * dx + dz * dz < 100) { const w = near[hot[h + 2] === 1 ? 'bench' : hot[h + 2] === 2 ? 'bar' : 'snack'] || 1; if (w > hb) hb = w; }
          }
          b *= hb;
          if (lane.cls === 8 || lane.cls === 11 || this._cls(x, z) === C.PLAZA) b *= near.plaza || 1;
          if (s < 8 || s > lane.len - 8) b *= near.corner || 1;
          const p0 = ((d / 100) * G.rate * 16 * (lane.side ? 1 : 0.5) * b) / 100, roll = this.rnd(), wide = near.wide || 1;
          if (roll > p0 * wide) continue;
          this._plan(o, lane, k, t, A, roll > p0 ? 'wide' : '');
        }
      }
    }
  }
  /** One group at a point of a lane (segment k, fraction t): where each person and parked vehicle stands. */
  _plan(o, lane, k, t, A, needWide) {
    const p = lane.pts, G = A.def.group, r = () => this.rnd();
    const x = p[k * 2] + (p[k * 2 + 2] - p[k * 2]) * t, z = p[k * 2 + 1] + (p[k * 2 + 3] - p[k * 2 + 1]) * t;
    const tl = Math.hypot(p[k * 2 + 2] - p[k * 2], p[k * 2 + 3] - p[k * 2 + 1]) || 1, tx = (p[k * 2 + 2] - p[k * 2]) / tl, tz = (p[k * 2 + 3] - p[k * 2 + 1]) / tl;
    const n = G.size[0] + Math.floor(r() * (G.size[1] - G.size[0] + 1)), R = 0.6 + 0.12 * n;
    // on the building side of the lane, as far from the carriageway as the pavement allows
    const sides = lane.side ? [lane.side] : r() < 0.5 ? [1, -1] : [-1, 1];
    let cx = 0, cz = 0, ok = false;
    for (const sd of sides) {
      for (const off of [R + 0.55, R + 0.2]) {
        cx = x - tz * sd * off; cz = z + tx * sd * off;
        if (this._ringOK(cx, cz, R + 0.3) && (!needWide || this._ringOK(cx, cz, 2.4)) && !lanesWithin(o, cx, cz, R + 0.1)) { ok = true; break; }
      }
      if (ok) break;
    }
    if (!ok) return false;
    for (const g of o.groups) if ((g.x - cx) ** 2 + (g.z - cz) ** 2 < 100) return false; // not on top of another group
    const G_ = this._good(), members = [], bikes = [], a0 = r() * 6.28;
    for (let i = 0; i < n; i++) {
      const an = a0 + (i / n) * 6.28 + (r() - 0.5) * 0.4, mx = cx + Math.sin(an) * R, mz = cz + Math.cos(an) * R;
      if (!G_[this._cls(mx, mz)]) continue;
      const model = A.models[Math.floor(r() * A.models.length)], look = this._archLook(A, model);
      const hd = Math.atan2(cx - mx, cz - mz) + (r() - 0.5) * 0.5;
      members.push({ x: mx, z: mz, y: 0, hd, want: hd, look, model, pp: null, slot: -1, sc: 1.25 * PERSON_K * (0.94 + r() * 0.12) * (A.def.scale || 1),
        style: r() < 0.5 ? 2 : r() < 0.6 ? 3 : 4, ph: r() * 6.28, rate: 1.6 + r() * 1.3, turn: 1 + r() * 4 });
    }
    if (members.length < 2) return false;
    if (A.rider) {
      const nb = Math.floor(G.bikes || 0) + (r() < (G.bikes || 0) % 1 ? 1 : 0);
      for (let i = 0; i < nb; i++) {
        const an = r() * 6.28, bx = cx + Math.sin(an) * (R + 1.35), bz = cz + Math.cos(an) * (R + 1.35), hd = an + 1.57 + (r() - 0.5) * 0.8, sx = Math.sin(hd) * 0.85, sz = Math.cos(hd) * 0.85;
        if (!G_[this._cls(bx, bz)] || !G_[this._cls(bx + sx, bz + sz)] || !G_[this._cls(bx - sx, bz - sz)] || lanesWithin(o, bx, bz, 1.0)) continue;
        const bc = A.def.bikeCols;
        bikes.push({ x: bx, z: bz, hd, col: rgbOf(bc ? bc[Math.floor(r() * bc.length)] : '#151515'), vp: null, slot: -1 });
      }
    }
    o.groups.push({ o, A, x: cx, z: cz, members, bikes, shown: false, retry: 0 });
    return true;
  }
  /** Draw a planned group (if the budgets and pools allow). */
  _gShow(g) {
    const A = g.A, n = g.members.length, nb = g.bikes.length;
    if (this.count[PED] + n > this.max[PED] || this.count.parked + nb > this.max.parked) { g.retry = this.t + 3; return; }
    let ok = true;
    for (const m of g.members) { m.pp = this._pool(m.model, A); m.slot = m.pp.take(); if (m.slot < 0) ok = false; }
    for (const b of g.bikes) { b.vp = this._vpool(A.bike); b.slot = b.vp.take(); if (b.slot < 0) ok = false; }
    if (!ok) { this._gGive(g); g.retry = this.t + 3; return; }
    this.count[PED] += n; this.count.parked += nb;
    g.shown = true;
    this._gPut(g);
  }
  _gGive(g) {
    for (const m of g.members) if (m.slot >= 0) { m.pp.give(m.slot); m.slot = -1; }
    for (const b of g.bikes) if (b.slot >= 0) { b.vp.give(b.slot); b.slot = -1; }
  }
  _gHide(g) {
    this._gGive(g);
    this.count[PED] -= g.members.length; this.count.parked -= g.bikes.length;
    g.shown = false;
  }
  /** Stand everybody where the plan says (also after the street frame changed). */
  _gPut(g) {
    const W = this.W;
    for (const m of g.members) { m.y = W.hAt(m.x, m.z); m.pp.put(m.slot, m.x, m.y, m.z, m.hd, m.sc); this._dress(m.pp, m.slot, m.look); }
    for (const b of g.bikes) { b.vp.put(b.slot, b.x, W.hAt(b.x, b.z), b.z, b.hd, 1); b.vp.tint(b.vp.c1, b.slot, b.col); }
  }
  /** Talking, looking at a phone, shifting their gaze from one to the next. */
  _gStep(g, dt) {
    const M = g.members;
    for (let i = 0; i < M.length; i++) {
      const m = M[i], an = m.pp.anim.array, o = m.slot * 4;
      m.ph += dt * m.rate;
      an[o] = m.ph; an[o + 1] = 1; an[o + 2] = m.style; an[o + 3] = 0;
      if ((m.turn -= dt) <= 0) {
        m.turn = 2 + this.rnd() * 5;
        const q = M[Math.floor(this.rnd() * M.length)];
        m.want = q === m ? m.hd : Math.atan2(q.x - m.x, q.z - m.z);
      }
      let dh = m.want - m.hd;
      if (dh !== 0) {
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        m.hd += clamp(dh, -1.4 * dt, 1.4 * dt);
        if (Math.abs(dh) < 0.01) m.want = m.hd;
        m.pp.put(m.slot, m.x, m.y, m.z, m.hd, m.sc);
      }
    }
  }

  /** At the end of a lane: the lane to carry on along, if one starts close by. Returns [lane, enterAtEnd] or null. */
  _onward(a) {
    const lane = a.lane, e = a.dir > 0 ? 1 : 0, i = e ? lane.n - 1 : 0, x = lane.pts[i * 2], z = lane.pts[i * 2 + 1];
    const j = e ? lane.n - 2 : 1, dx = x - lane.pts[j * 2], dz = z - lane.pts[j * 2 + 1], dl = Math.hypot(dx, dz) || 1;
    const reach = a.kind === PED || a.pave ? 5.5 : a.kind === TRAM_ ? 4 : 7.5, cx = Math.floor(x / 6), cz = Math.floor(z / 6);
    let best = null, bw = 0;
    for (let ax = -2; ax <= 2; ax++) for (let az = -2; az <= 2; az++) {
      const bin = this.ends.get((cx + ax) * 65536 + cz + az);
      if (!bin) continue;
      for (let k = 0; k < bin.length; k += 2) {
        const l2 = bin[k], e2 = bin[k + 1];
        if (l2 === lane || l2.dead || l2.kind !== lane.kind || !l2.owner.on) continue; // (a fat-bike on the pavement stays on pavement lanes)
        if (a.kind !== PED && !a.pave && e2 !== 0) continue; // vehicles only join a lane at its start
        const i2 = e2 ? l2.n - 1 : 0, j2 = e2 ? l2.n - 2 : 1, d = Math.hypot(l2.pts[i2 * 2] - x, l2.pts[i2 * 2 + 1] - z);
        if (d > reach) continue;
        const ex = l2.pts[j2 * 2] - l2.pts[i2 * 2], ez = l2.pts[j2 * 2 + 1] - l2.pts[i2 * 2 + 1], cos = (ex * dx + ez * dz) / ((Math.hypot(ex, ez) || 1) * dl);
        if (cos < (a.kind === TRAM_ ? 0.5 : -0.35)) continue; // not back the way it came (and a tram does not turn sharply)
        const w = (0.4 + Math.max(0, cos) * 2) * (0.5 + this.rnd());
        if (w > bw) { bw = w; best = [l2, e2]; }
      }
    }
    return best;
  }
  /** The pavement on the other side of the road from a walker, if there is one: [lane, index, x, z]. */
  _across(a, x, z, ux, uz) {
    const lane = a.lane;
    if (!lane.side || !lane.rw) return null;
    if (!this.pedIx) {
      this.pedIx = new Map();
      for (const o of this.owners.values()) for (const l of o.lanes) {
        if (l.kind !== PED || !l.side) continue;
        for (let i = 0; i < l.n; i += 1) { const k = Math.floor(l.pts[i * 2] / 4) * 65536 + Math.floor(l.pts[i * 2 + 1] / 4); let b = this.pedIx.get(k); if (!b) this.pedIx.set(k, (b = [])); b.push(l, i); }
      }
    }
    // (ux, uz) is the way the lane was drawn, which is the way its road was drawn. A right-hand pavement has the road on its left
    const d = lane.rw + 2.7, tx = x + uz * lane.side * d, tz = z - ux * lane.side * d;
    let best = null, bd = 3.2;
    const cx = Math.floor(tx / 4), cz = Math.floor(tz / 4);
    for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) {
      const b = this.pedIx.get((cx + ax) * 65536 + cz + az);
      if (!b) continue;
      for (let k = 0; k < b.length; k += 2) {
        const l = b[k], i = b[k + 1];
        if (l === lane || l.dead || !l.owner.on) continue;
        const q = Math.hypot(l.pts[i * 2] - tx, l.pts[i * 2 + 1] - tz);
        if (q < bd) { bd = q; best = [l, i, l.pts[i * 2], l.pts[i * 2 + 1]]; }
      }
    }
    return best;
  }

  // ------------------------------------------------------------ for the gags
  /** Moving figures of one kind within r of a point. */
  near(x, z, r, kind) {
    const out = [];
    const kept = kind === PED; // (a walker with an accessory or a runner's gait is not offered to the stage: it would lose them on screen)
    for (const a of this.agents) if (!a.dead && a.vis && a.kind === kind && (!kept || !a.look.kind || a.look.kind === 'niffo' || a.look.kind === 'harry') && !a.down && !a.cross && (a.x - x) * (a.x - x) + (a.z - z) * (a.z - z) < r * r) out.push(a);
    return out;
  }
  /** How many vehicles are moving within r of a point. */
  traffic(x, z, r) {
    let n = 0;
    for (const a of this.agents) if (!a.dead && a.vis && a.kind !== PED && a.kind !== TRAM_ && (a.x - x) * (a.x - x) + (a.z - z) * (a.z - z) < r * r) n++;
    return n;
  }
  /**
   * Take a walker (or a rider) out of the crowd (a gag wants them): returns how they look and where they were.
   * `look` carries `kind` (the archetype id, e.g. 'niffo') when they are one; riders have `ride` ('fatbike', 'cargo', 'bike'),
   * `riders` (1 or 2) and `pass` (the passenger's look); `cols` has the hex colours of an archetype's clothes.
   */
  take(a) {
    const out = { look: a.look, x: a.x, z: a.z, hd: a.hd, speed: a.v0, scale: a.sc };
    this._free(a);
    return out;
  }
  /** Put a walker (or a rider, if the look says `ride`) back among the crowd at (x, z), heading hd. False if no path is near. */
  adopt(look, x, z, hd) {
    const rides = !!look.ride;
    if (this.people.free.length < 3) return false;
    let best = null, bd = 3.5, bi = 0;
    for (const o of this.owners.values()) {
      if (!o.on || Math.hypot(o.cx - x, o.cz - z) > o.r + 20) continue;
      for (const l of o.lanes) {
        if (l.kind !== PED && !(rides && l.kind === BIKE_)) continue;
        for (let i = 0; i < l.n; i++) { const d = Math.hypot(l.pts[i * 2] - x, l.pts[i * 2 + 1] - z); if (d < bd) { bd = d; best = l; bi = i; } }
      }
    }
    if (!best) return false;
    const a = this._spawn(best, clamp(bi * best.step, 0.1, best.len - 0.1), look);
    if (!a) return false;
    const j = Math.min(best.n - 2, bi), ex = best.pts[j * 2 + 2] - best.pts[j * 2], ez = best.pts[j * 2 + 3] - best.pts[j * 2 + 1];
    a.dir = ex * Math.sin(hd) + ez * Math.cos(hd) >= 0 ? 1 : -1;
    // start exactly where they stand and drift onto the lane
    a.ox = x - best.pts[bi * 2]; a.oz = z - best.pts[bi * 2 + 1];
    a.pop = 1; a.hd = hd; a.first = false;
    return true;
  }
  /** Parked cars within r of a point, as flat [x, z, x, z, ...] (the camera keeps them out of its sight lines). */
  parkedNear(x, z, r) {
    const out = [];
    for (const o of this.owners.values()) {
      if (Math.hypot(o.cx - x, o.cz - z) > o.r + r) continue;
      const wait = o.pend.length ? new Set(o.pend) : null; // (cars that are not up yet are not there)
      for (let i = 0; i < o.parked.length; i += 4) if ((o.parked[i] - x) ** 2 + (o.parked[i + 1] - z) ** 2 < r * r && !(wait && wait.has(i))) out.push(o.parked[i], o.parked[i + 1]);
    }
    return out;
  }
  /** Lamp posts and parked cars that pass a test on their position (the open street takes its anchors from these). */
  props(test) {
    const lamps = [], parked = [];
    for (const o of this.owners.values()) {
      const wait = o.pend.length ? new Set(o.pend) : null; // (not up yet: not there)
      for (let i = 0; i < o.lamps.length; i += 3) if (test(o.lamps[i], o.lamps[i + 1]) && !(wait && wait.has(-1 - i))) lamps.push({ x: o.lamps[i], z: o.lamps[i + 1] });
      for (let i = 0; i < o.parked.length; i += 4) if (test(o.parked[i], o.parked[i + 1]) && !(wait && wait.has(i))) parked.push({ x: o.parked[i], z: o.parked[i + 1], hd: o.parked[i + 2] });
    }
    return { lamps, parked };
  }

  // ------------------------------------------------------------ every frame
  _hide(a) {
    a.vis = false; a.cross = null;
    if (a.kind === PED) a.pp.hide(a.slot);
    else if (a.kind === BIKE_) { a.vp.hide(a.slot); a.pp.hide(a.rider); if (a.pass >= 0) a.pp.hide(a.pass); }
    else if (a.kind === TRAM_) for (const s of a.tail) this.trams.hide(s.slot);
    else this.cars.hide(a.slot);
  }
  /** x, z: what the camera looks at; dist: how far away it is. */
  update(dt, x, z, dist) {
    const W = this.W;
    this.t += dt;
    this.warm = this.t < 7; // the street is being revealed: everything may appear
    const far = dist > 1100;
    if (far !== this.hidden) { this.hidden = far; for (const p of this.pools.values()) p.mesh.visible = !far; for (const p of this.vpools.values()) p.mesh.visible = !far; }
    const R = clamp(260 + dist * 2.2, 330, 900), R2 = R * R;
    // what the viewer can see: nothing appears or vanishes inside it (see _seen)
    if (this.cam) {
      const c = this.cam, e = c.matrixWorld.elements;
      this.pv.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
      this.fr.setFromProjectionMatrix(this.pv);
      this.cx = e[12]; this.cy = e[13]; this.cz = e[14];
    }
    this.gy = W.hAt(x, z);
    this.far2 = Math.min(360, 0.88 * R) ** 2;
    // streets come into range and drop out of it as the camera moves
    if ((this.tick++ & 15) === 0) {
      for (const o of this.owners.values()) {
        const near = Math.hypot(o.cx - x, o.cz - z) < R + o.r;
        if (near && !o.on) this._fill(o);
        else if (!near && o.on) this._empty(o);
        else if (o.on && o.pend.length) this._reveal(o);
      }
      if (this.agents.length > 64 && (this.tick & 255) === 1) this.agents = this.agents.filter((a) => !a.dead);
    }
    // who is where: a grid for looking ahead
    const head = this.head, A = this.agents, n = A.length, gx0 = x - (GN * CELL) / 2, gz0 = z - (GN * CELL) / 2, rs = this.riders;
    if (this.next.length < n) this.next = new Int32Array(n * 2);
    const next = this.next;
    head.fill(-1);
    rs.length = 0;
    for (let i = 0; i < n; i++) {
      const a = A[i];
      if (a.dead || !a.vis) continue;
      if (a.pave) rs.push(a);
      const ci = Math.floor((a.x - gx0) / CELL), cj = Math.floor((a.z - gz0) / CELL);
      if (ci < 0 || cj < 0 || ci >= GN || cj >= GN) continue;
      const c = cj * GN + ci;
      next[i] = head[c]; head[c] = i;
    }
    // the actors on stage, and the box they are all in (most figures are nowhere near it)
    const B = this.blockers, Z = this.zones;
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (const b of B) { if (b.x < bx0) bx0 = b.x; if (b.x > bx1) bx1 = b.x; if (b.z < bz0) bz0 = b.z; if (b.z > bz1) bz1 = b.z; }
    bx0 -= 14; bx1 += 14; bz0 -= 14; bz1 += 14;
    for (let i = 0; i < n; i++) {
      const a = A[i];
      if (a.dead) continue;
      const lane = a.lane;
      // ---- where it is on its lane
      let f = a.s / lane.step, k = Math.floor(f);
      if (k >= lane.n - 1) k = lane.n - 2;
      if (k < 0) k = 0;
      const t = f - k, p = lane.pts, x0 = p[k * 2], z0 = p[k * 2 + 1], ex = p[k * 2 + 2] - x0, ez = p[k * 2 + 3] - z0;
      const lx = x0 + ex * t, lz = z0 + ez * t, d2 = (lx - x) * (lx - x) + (lz - z) * (lz - z);
      if (!a.down) {
        if (d2 > R2) {
          if (!a.vis) continue;
          if (this.warm || !this._seen(lx, lz)) { this._hide(a); continue; } // out of range: gone, unless somebody could watch it go
        } else if (!a.vis) {
          if (!this.warm && this._seen(lx, lz)) continue; // in range, but it would be seen appearing: it waits
          a.pop = 0;
        }
      }
      const el = Math.hypot(ex, ez) || 1, hx = (ex / el) * a.dir, hz = (ez / el) * a.dir;
      const inBox = a.x > bx0 && a.x < bx1 && a.z > bz0 && a.z < bz1;

      if (a.kind === PED) {
        const P = a.pp, anim = P.anim.array;
        // ---- someone knocked over flies, lies there, then gets up and finishes crossing
        if (a.down > 0) {
          a.down -= dt;
          const D = a.fall, e = clamp((D.dur - a.down) / D.fly), y = W.hAt(a.x, a.z);
          if (e < 1) { a.x = D.x0 + D.vx * e; a.z = D.z0 + D.vz * e; }
          P.put(a.slot, a.x, y + Math.sin(e * Math.PI) * D.up, a.z, a.hd, a.sc);
          const o = a.slot * 4;
          anim[o + 1] = 0; anim[o + 2] = 0;
          anim[o + 3] = e < 1 ? -e * Math.PI * 2 : a.down > 0.5 ? -1.45 : -1.45 * Math.max(0, a.down / 0.5); // somersault, flat on the back, up again
          if (a.down <= 0) {
            anim[o + 3] = 0;
            a.cross = D.to ? { lane: D.to.lane, i: D.to.i, x0: a.x, z0: a.z, x1: D.to.x1, z1: D.to.z1, t: 0, dur: Math.max(0.8, Math.hypot(D.to.x1 - a.x, D.to.z1 - a.z) / a.v0), wait: 0, hit: true } : null;
            a.fall = null;
          }
          continue;
        }
        // ---- crossing the road: straight over to the pavement on the other side
        if (a.cross) {
          const X = a.cross;
          if (X.lane.dead) { a.cross = null; continue; }
          if (X.wait > 0) {
            // at the kerb, looking: is anything coming?
            X.wait -= dt;
            let coming = false;
            if (X.wait > 0) for (let q = 0; q < n && !coming; q++) { const b = A[q]; if (b.dead || !b.vis || b.kind === PED || b.v < 1) continue; const ddx = a.x - b.x, ddz = a.z - b.z, dd = Math.hypot(ddx, ddz); if (dd < 16 && (ddx * Math.sin(b.hd) + ddz * Math.cos(b.hd)) / (dd || 1) > 0.6) coming = true; }
            if (coming) { P.put(a.slot, a.x, W.hAt(a.x, a.z), a.z, Math.atan2(X.x1 - X.x0, X.z1 - X.z0), a.sc); anim[a.slot * 4 + 1] = 0; continue; }
            X.wait = 0;
          }
          X.t += dt / X.dur;
          const e = Math.min(1, X.t);
          a.x = X.x0 + (X.x1 - X.x0) * e; a.z = X.z0 + (X.z1 - X.z0) * e;
          a.hd = Math.atan2(X.x1 - X.x0, X.z1 - X.z0);
          a.v = a.v0;
          a.ph += dt * (3.2 + a.v * 1.9);
          P.put(a.slot, a.x, W.hAt(a.x, a.z), a.z, a.hd, a.sc);
          const o = a.slot * 4;
          anim[o] = a.ph; anim[o + 1] = (0.45 + a.v * 0.11) * a.gait; anim[o + 2] = 0; anim[o + 3] = a.lean;
          if (e >= 1) {
            // arrived: carry on along the pavement there, the same way as before if that makes sense
            lane.owner.agents.delete(a); X.lane.owner.agents.add(a);
            a.lane = X.lane; a.s = clamp(X.i * X.lane.step, 0.1, X.lane.len - 0.1); a.ox = a.oz = 0; a.lat = 0; a.cross = null;
            const j = Math.min(X.lane.n - 2, X.i), qx = X.lane.pts[j * 2 + 2] - X.lane.pts[j * 2], qz = X.lane.pts[j * 2 + 3] - X.lane.pts[j * 2 + 1];
            a.dir = qx * hx + qz * hz >= 0 ? 1 : -1;
          }
          continue;
        }
        // ---- now and then: cross over. At a zebra after looking; anywhere, sometimes, without
        if ((a.think -= dt) <= 0) {
          a.think = 0.5;
          if (lane.side && a.vis && d2 < 400 * 400) {
            const zebra = lane.zeb && lane.zeb.some((s) => Math.abs(s - a.s) < 1.6);
            if (zebra ? this.rnd() < 0.06 : this.rnd() < this.jay * 0.5) {
              const to = this._across(a, a.x, a.z, ex / el, ez / el);
              if (to) { a.cross = { lane: to[0], i: to[1], x0: a.x, z0: a.z, x1: to[2], z1: to[3], t: 0, dur: Math.max(1, Math.hypot(to[2] - a.x, to[3] - a.z) / a.v0), wait: zebra || this.rnd() < 0.35 ? 3.5 : 0 }; continue; }
            }
          }
        }
        // ---- people on stage are in the way: step round them, or wait
        let side = 0, slow = 1;
        if (inBox) for (const b of B) {
          const bx = b.x - a.x, bz = b.z - a.z, fw = bx * hx + bz * hz;
          if (fw < -0.3 || fw > 2.6 + b.r) continue;
          const lat = bx * -hz + bz * hx; // to the right of the way they walk
          if (Math.abs(lat) > 0.75 + b.r) continue;
          side += lat >= 0 ? -1 : 1;
          if (fw < 1.1 + b.r) slow = 0.25;
        }
        // ---- a fat-bike coming down the pavement: step aside (it does not slow down for the walker's sake)
        for (let q = 0; q < rs.length; q++) {
          const b = rs[q], bx = b.x - a.x, bz = b.z - a.z;
          if (bx > 9 || bx < -9 || bz > 9 || bz < -9) continue;
          const rhx = Math.sin(b.hd), rhz = Math.cos(b.hd), ahead = -(bx * rhx + bz * rhz), off = -(bx * rhz - bz * rhx); // where I am, from the rider
          if (ahead < -1 || ahead > 9 || off > 1.0 || off < -1.0) continue;
          const push = off >= 0 ? 1 : -1; // I am on this side of its line, so I step further that way
          side += -push * (rhz * hz + rhx * hx) >= 0 ? 1 : -1;
        }
        const want = clamp(side, -1, 1) * 1.3;
        a.lat += clamp(want - a.lat, -1.6 * dt, 1.6 * dt);
        a.v += clamp(a.v0 * slow - a.v, -6 * dt, 3 * dt);
      } else {
        // ---- vehicles look ahead and brake for whatever is in their way
        let target = a.v0;
        if (a.vis) {
          const car = a.kind === CAR_, tram = a.kind === TRAM_;
          const reach = tram ? 9 + a.v * 1.2 : car ? 6.6 + a.v * 0.9 : 3.2 + a.v * 0.5, px = a.x + hx * reach * 0.5, pz = a.z + hz * reach * 0.5;
          const ci = Math.floor((px - gx0) / CELL), cj = Math.floor((pz - gz0) / CELL), span = tram ? 2 : 1;
          let block = 1e9, bv = 0, who = null;
          for (let dj = -span; dj <= span; dj++) for (let di = -span; di <= span; di++) {
            const cc = ci + di, cr = cj + dj;
            if (cc < 0 || cr < 0 || cc >= GN || cr >= GN) continue;
            for (let q = head[cr * GN + cc]; q >= 0; q = next[q]) {
              if (q === i) continue;
              const b = A[q], bx = b.x - a.x, bz = b.z - a.z, fw = bx * hx + bz * hz;
              if (fw < 0.4 || fw > reach) continue;
              const lat = Math.abs(bx * hz - bz * hx), lim = b.kind === PED ? 1.25 : b.kind === BIKE_ ? 1.1 : car || tram ? 1.75 : 1.3;
              if (lat > lim) continue;
              if (a.pave && b.kind === PED && (fw > 2.6 || lat > 0.55)) continue; // on the pavement the walkers step aside; only brake for one right in front
              if (b.kind !== PED) {
                // two vehicles each waiting for the other: the one that came first in the list goes (a tram always goes)
                const bhx = Math.sin(b.hd), bhz = Math.cos(b.hd), bf = -(bx * bhx + bz * bhz);
                if ((q > i || tram) && b.kind !== TRAM_ && bf > 0.4 && Math.abs(bx * bhz - bz * bhx) < 1.75 && hx * bhx + hz * bhz < 0.5) continue;
              }
              if (fw < block) { block = fw; who = b; bv = b.kind === PED ? 0 : Math.max(0, b.v * (hx * Math.sin(b.hd) + hz * Math.cos(b.hd))); }
            }
          }
          // actors on stage, and the edge of a stretch a gag has closed
          if (inBox) for (const b of B) {
            const bx = b.x - a.x, bz = b.z - a.z, fw = bx * hx + bz * hz;
            if (fw < 0.4 || fw > reach + b.r || Math.abs(bx * hz - bz * hx) > (car || tram ? 1.2 : 0.7) + b.r) continue;
            if (fw - b.r < block) { block = Math.max(0.1, fw - b.r); bv = 0; who = null; }
          }
          let inside = false;
          for (const q of Z) {
            const dd = Math.hypot(q.x - a.x, q.z - a.z);
            if (dd < q.r - 2) { inside = !tram; break; }
            const fw = (q.x - a.x) * hx + (q.z - a.z) * hz;
            if (!tram && fw > 0 && dd < q.r + reach && dd - q.r < block) { block = Math.max(0.1, dd - q.r); bv = 0; who = null; }
          }
          // a vehicle inside a closed stretch leaves along its lane if anybody can see it; it is only removed where nobody would notice
          if (inside && (this.warm || !this._seen(a.x, a.z))) { this._free(a); continue; }
          if (block < 1e9 && a.ghost <= 0) {
            const gap = tram ? 7 : car ? 6.3 : 2.8;
            target = Math.min(a.v0, block < gap ? 0 : bv + (block - gap) * 1.2);
            // no room left and still rolling: an unwary walker in the road gets knocked over, now and then
            if (who && who.kind === PED && who.cross && !who.cross.wait && !who.cross.hit && block < (car ? 4.6 : 2.3) && a.v > 2.4 && !tram && !a.pave && this.t - this.bonkAt > 22 && d2 < 160 * 160) {
              this.bonkAt = this.t;
              const X = who.cross, fly = clamp(a.v * (car ? 0.45 : 0.25), 0.8, 3.2), sd = (who.x - a.x) * hz - (who.z - a.z) * hx >= 0 ? 1 : -1;
              who.fall = { x0: who.x, z0: who.z, vx: hx * fly + hz * sd * 1.1, vz: hz * fly - hx * sd * 1.1, up: car ? 1.7 : 0.9, fly: 0.75, dur: 2.9, to: { lane: X.lane, i: X.i, x1: X.x1, z1: X.z1 } };
              who.down = 2.9; who.cross = null;
              a.v *= 0.25;
              if (this.onBonk) this.onBonk(who.x, W.hAt(who.x, who.z), who.z, !car);
            }
          }
          // stuck for a long time: the jam is cleared by driving through, but out of sight at 6 s and in sight only after 24 s
          if (a.v < 0.3 && target < 0.3) {
            a.wait += dt;
            if (a.wait > 6 && this.t - lane.heldAt > 0.5 && (this.warm || !this._seen(a.x, a.z) || a.wait > 24)) { a.ghost = 2.5; a.wait = 0; } // (a lane with a vehicle waiting at its dead end in sight: the others queue, they do not drive through it)
          } else a.wait = 0;
          if (a.ghost > 0) a.ghost -= dt;
        }
        a.v += clamp(target - a.v, -9 * dt, (a.kind === TRAM_ ? 1.2 : 2.6) * dt);
      }
      // ---- move on
      a.s += a.dir * a.v * dt;
      if (a.s > lane.len || a.s < 0) {
        const on = this._onward(a);
        if (on) {
          const [l2, e2] = on;
          // carry the small jump between the two lanes as an offset that melts away
          const i2 = e2 ? l2.n - 1 : 0;
          a.ox += lx - l2.pts[i2 * 2]; a.oz += lz - l2.pts[i2 * 2 + 1]; a.held = false;
          lane.owner.agents.delete(a); l2.owner.agents.add(a);
          a.lane = l2; a.dir = e2 ? -1 : 1; a.s = e2 ? l2.len : 0;
        } else if (a.kind === PED || a.pave) { a.dir = -a.dir; a.s = clamp(a.s, 0, lane.len); } // dead end: turn round
        else {
          // nowhere to go: start the lane again, but only if nobody sees it leave and come back; otherwise wait at the end
          const si = a.dir > 0 ? 0 : lane.n - 1;
          if (this.warm || (!this._seen(lx, lz) && !this._seen(p[si * 2], p[si * 2 + 1]))) { a.s = a.dir > 0 ? 0 : lane.len; a.pop = 0; a.ox = a.oz = 0; a.first = true; a.held = false; }
          else { a.s = a.dir > 0 ? lane.len : 0; a.v = 0; a.held = true; lane.heldAt = this.t; }
        }
        continue;
      }
      const melt = Math.exp(-dt * 1.8);
      a.ox *= melt; a.oz *= melt;
      a.x = lx + a.ox - hz * a.lat; a.z = lz + a.oz + hx * a.lat;
      const want = Math.atan2(hx, hz);
      if (a.first) { a.hd = want; a.first = false; } else { let dh = want - a.hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); a.hd += dh * Math.min(1, dt * (a.kind === PED ? 8 : 5)); }
      if (a.pop < 1) a.pop = Math.min(1, a.pop + dt * 3.2);
      a.vis = true; a.held = false;
      const y = W.hAt(a.x, a.z), s = Math.max(0, a.pop) * (2 - Math.max(0, a.pop));
      if (a.kind === PED) {
        const P = a.pp, anim = P.anim.array;
        a.ph += dt * (3.2 + a.v * 1.9);
        P.put(a.slot, a.x, y, a.z, a.hd, a.sc * s);
        const o = a.slot * 4;
        anim[o] = a.ph; anim[o + 1] = a.v > 0.1 ? (0.45 + a.v * 0.11) * a.gait : 0; anim[o + 2] = 0; anim[o + 3] = a.v > 0.1 ? a.lean : 0;
      } else if (a.kind === BIKE_) {
        const P = a.pp, anim = P.anim.array, rd = a.rd;
        a.ph += dt * (2 + a.v * 1.4);
        a.vp.put(a.slot, a.x, y, a.z, a.hd, s);
        const sn = Math.sin(a.hd), cs = Math.cos(a.hd);
        P.put(a.rider, a.x + sn * rd.z, y + rd.y, a.z + cs * rd.z, a.hd, RIDER_S * s);
        let o = a.rider * 4;
        anim[o] = a.ph; anim[o + 1] = 0; anim[o + 2] = 1; anim[o + 3] = 0;
        if (a.pass >= 0) {
          P.put(a.pass, a.x + sn * rd.z2, y + rd.y, a.z + cs * rd.z2, a.hd, RIDER_S * s * 0.97);
          o = a.pass * 4;
          anim[o] = a.ph + 1.7; anim[o + 1] = 0; anim[o + 2] = 1; anim[o + 3] = 0;
        }
      } else if (a.kind === TRAM_) {
        // five sections, each where the track is under it; behind the start of the lane they follow in a straight line
        for (let q = 0; q < TRAM_N; q++) {
          const sq = a.s - a.dir * q * TRAM_SEG, fq = clamp(sq, 0, lane.len) / lane.step, kq = Math.min(lane.n - 2, Math.floor(fq));
          const tq = fq - kq, qx = p[kq * 2] + (p[kq * 2 + 2] - p[kq * 2]) * tq, qz = p[kq * 2 + 1] + (p[kq * 2 + 3] - p[kq * 2 + 1]) * tq;
          const over = sq < 0 ? sq : sq > lane.len ? sq - lane.len : 0, dq = Math.hypot(p[kq * 2 + 2] - p[kq * 2], p[kq * 2 + 3] - p[kq * 2 + 1]) || 1;
          const ux = (p[kq * 2 + 2] - p[kq * 2]) / dq, uz = (p[kq * 2 + 3] - p[kq * 2 + 1]) / dq, X = qx + ux * over + a.ox, Zq = qz + uz * over + a.oz;
          this.trams.put(a.tail[q].slot, X, W.hAt(X, Zq), Zq, Math.atan2(ux * a.dir, uz * a.dir), s);
        }
      } else this.cars.put(a.slot, a.x, y, a.z, a.hd, s);
    }
    // groups hanging around: drawn once nobody would see them appear, taken down once nobody would see them go
    for (const o of this.owners.values()) {
      if (!o.on || !o.groups.length) continue;
      for (const g of o.groups) {
        const d2 = (g.x - x) * (g.x - x) + (g.z - z) * (g.z - z);
        if (!g.shown) { if (d2 < R2 && this.t >= g.retry && (this.warm || !this._seen(g.x, g.z))) this._gShow(g); }
        else if (d2 > R2 && (this.warm || !this._seen(g.x, g.z))) this._gHide(g);
        else this._gStep(g, dt);
      }
    }
    for (const q of this.pools.values()) q.flush();
    for (const q of this.vpools.values()) q.flush();
    this.cars.flush(); this.lamps.flush(); this.trams.flush();
  }
  dispose() {
    for (const q of this.pools.values()) q.dispose();
    for (const q of this.vpools.values()) q.dispose();
    this.cars.dispose(); this.lamps.dispose(); this.trams.dispose();
    this.owners.clear(); this.agents = []; this.ends.clear();
  }
}
