// The city's street life: walkers, cyclists, cars, trams, parked cars and lamp posts on every street around the
// camera, the open street included. One system for the whole city, kept alive when the focus moves to another
// street, so nothing about the traffic depends on which street happens to be open.
// Thousands of figures are drawn as a few instanced meshes; limbs swing in the vertex shader; each figure follows
// a lane derived from the real road map: pavements beside the carriageway, the right-hand side of the road, cycle
// paths, tram tracks. A gag that needs a passer-by takes one out of the crowd (see take/adopt) and puts them back.
import * as THREE from 'three';
import { clamp } from './kit.js';
import { PERSON_K, SKINS, SHIRTS, PANTS, HAIRS } from './cast.js';
import { zebrasOn, U, LAMP_KIND, LAMP_GLSL } from './world.js';
import { ARCHETYPES, spotAt } from './districts.js';
import { PERSON as G_PERSON, WHEEL as G_WHEEL, ALL as G_ALL } from './ground.js';

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
// [10, 11] eyes, [12, 13] hair, the archetype's extras, and last the phone (two boxes, see PHONE). Figures face +z; their
// left arm is the one at +x.
const SHOE = '#2a2a2a';
const legs = (shorts, shoe = SHOE) => [-1, 1].flatMap((sd, i) => (shorts
  ? [[sd * 0.2, 0.38, 0, 0.3, 0.32, 0.32, W_, 2, i + 1, 0.7], [sd * 0.2, 0, 0, 0.28, 0.38, 0.3, W_, 3, i + 1, 0.7]]
  : [[sd * 0.2, 0, 0, 0.3, 0.7, 0.32, W_, 2, i + 1, 0.7]]).concat([[sd * 0.2, 0, 0.05, 0.32, 0.14, 0.44, shoe, 0, i + 1, 0.7]]));
const arms = (bare) => [-1, 1].flatMap((sd, i) => [[sd * 0.51, 0.96, 0, 0.24, 0.5, 0.28, W_, bare ? 3 : 1, i + 3, 1.46], [sd * 0.51, 0.76, 0, 0.22, 0.2, 0.26, W_, 3, i + 3, 1.46]]);
const TORSO = [0, 0.7, 0, 0.78, 0.8, 0.46, W_, 1];
const HEAD = [[0, 1.5, 0, 0.66, 0.62, 0.62, W_, 3], [-0.16, 1.8, 0.31, 0.11, 0.13, 0.03, '#1b1b1b'], [0.16, 1.8, 0.31, 0.11, 0.13, 0.03, '#1b1b1b']];
const HAIR = [[0, 2.06, -0.02, 0.7, 0.14, 0.66, W_, 4], [0, 1.7, -0.3, 0.7, 0.4, 0.08, W_, 4]];
// The phone a filming bystander holds up in the left hand (pose 7): drawn twice real size, a light case and a screen that
// faces the filmer and is lit day and night (parts 9 and 10). Every figure carries it, shrunk out of sight inside its left hand
// (PH_REST, the hand's middle); in pose 7 only, the shader moves it out to PH_AT and stretches it by PH_K (crowdMat), so
// it costs two boxes per figure and no draw call or attribute. PH_SHOW is the shape it is shown in: boxes in the arm's
// hanging frame (centres), it swings up with the arm (limb 4, pivot 1.46).
const PH_REST = [0.51, 0.86, 0.0], PH_AT = [0.51, 0.72, 0.22], PH_K = [1, 0.5, 2];
const PH_SHOW = [[0.51, 0.72, 0.22, 0.17, 0.05, 0.32, '#eef2f4', 9], [0.51, 0.749, 0.225, 0.14, 0.014, 0.27, '#9fe4ff', 10]]; // case, screen
const PHONE = PH_SHOW.map(([x, y, z, w, h, d, c, pt]) => {
  const at = (v, i) => PH_REST[i] + (v - PH_AT[i]) / PH_K[i];
  return [at(x, 0), at(y, 1) - h / PH_K[1] / 2, at(z, 2), w / PH_K[0], h / PH_K[1], d / PH_K[2], c, pt, 4, 1.46];
});
/** The standard figure with optional changes: { shorts, bare, shoe, hair: false, extra: [boxes] }. */
const figure = (o = {}) => [...legs(o.shorts, o.shoe), TORSO, ...arms(o.bare), ...HEAD, ...(o.hair === false ? [] : HAIR), ...(o.extra || []), ...PHONE];
const PERSON = () => model(figure());
// Boxes on a limb swing with it: pass the limb number and pivot (arms 3 = right, 4 = left at +x, pivot 1.46; legs 1/2, pivot 0.7).
const onArm = (x, y, z, w, h, d, c, limb = 4) => [x, y, z, w, h, d, c, 0, limb, 1.46];
const onLeg = (x, y, z, w, h, d, c, limb) => [x, y, z, w, h, d, c, 0, limb, 0.7];
const MODELS = {
  person: () => model(figure()),
  // Straat Niffo: beige/brown tracksuit with a green-red stripe down sleeves and legs, cap or hood
  niffo: () => model(figure({
    shoe: '#e9e9e4',
    extra: [
      ...[3, 4].flatMap((l) => { const sd = l === 3 ? -1 : 1; return [onArm(sd * 0.64, 0.96, -0.05, 0.03, 0.5, 0.07, '#1d8a4f', l), onArm(sd * 0.64, 0.96, 0.05, 0.03, 0.5, 0.07, '#d62839', l)]; }),
      ...[1, 2].flatMap((l) => { const sd = l === 1 ? -1 : 1; return [onLeg(sd * 0.36, 0, -0.05, 0.03, 0.7, 0.07, '#1d8a4f', l), onLeg(sd * 0.36, 0, 0.05, 0.03, 0.7, 0.07, '#d62839', l)]; }),
      [0, 2.0, 0.39, 0.62, 0.06, 0.3, '#1a1a1a'], [0, 2.1, 0.0, 0.74, 0.1, 0.7, W_, 4]], // cap: crown in the hair colour, visor in front
  })),
  niffoHood: () => model(figure({
    shoe: '#e9e9e4', hair: false,
    extra: [
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
  [-0.5, 0.5, 1.66, 0.34, 0.18, 0.05, '#fff6c9', 5], [0.5, 0.5, 1.66, 0.34, 0.18, 0.05, '#fff6c9', 5],
  [-0.5, 0.5, -1.66, 0.34, 0.15, 0.05, '#ff2d2d', 5], [0.5, 0.5, -1.66, 0.34, 0.15, 0.05, '#ff2d2d', 5],
  // hazard lights (part 8): dull amber, blinking when a car waits for a long time (iC2.y)
  [-0.74, 0.58, 1.65, 0.16, 0.12, 0.06, '#9a6a18', 8], [0.74, 0.58, 1.65, 0.16, 0.12, 0.06, '#9a6a18', 8], [-0.74, 0.58, -1.65, 0.16, 0.12, 0.06, '#9a6a18', 8], [0.74, 0.58, -1.65, 0.16, 0.12, 0.06, '#9a6a18', 8],
], 1.156, 1.13, 1.333);
const BIKE = () => model([
  [0, 0, -0.5, 0.08, 0.56, 0.56, '#1f1f1f'], [0, 0, 0.5, 0.08, 0.56, 0.56, '#1f1f1f'],
  [0, 0.3, 0, 0.08, 0.1, 0.9, W_, 1], [0, 0.36, -0.25, 0.08, 0.46, 0.08, W_, 1], [0, 0.8, -0.25, 0.16, 0.08, 0.3, '#2b2b2b'],
  [0, 0.36, 0.4, 0.08, 0.62, 0.08, W_, 1], [0, 0.96, 0.4, 0.5, 0.07, 0.07, '#2b2b2b'], [0, 0.62, 0.62, 0.3, 0.2, 0.26, '#8d6e4c'],
  [0, 0.88, 0.45, 0.1, 0.09, 0.05, '#fff6c9', 5], [0, 0.55, -0.79, 0.07, 0.07, 0.04, '#ff2d2d', 5], // a small white lamp in front, a red one behind
], 1.19, 1.19, 1.19);
const RIDER_Y = 0.52, RIDER_Z = -0.28, RIDER_S = 1.2 * PERSON_K;
// Fat-bike, drawn larger than life where it counts so it reads as one from far off: fat tyres (0.60 m across, 0.28 m
// wide: about three times a real 4 inch tyre), a solid battery block in the frame colour where a bike has an open
// frame, one long flat dark bench, tall upright bars and a big round headlight. Real metres, front towards +z, the
// same numbers as makeFatbike in props.js (seat top 0.90 here: RIDE.fatbike seats the riders on it).
const FB_DARK = '#202226', FB_HUB = '#c9d1d6', FB_LAMP = '#fffbe0';
const FATBIKE = () => model([
  ...[-0.54, 0.54].flatMap((z) => [[0, 0, z, 0.28, 0.6, 0.42, '#121212'], [0, 0.09, z, 0.28, 0.42, 0.6, '#121212'], [0, 0.15, z, 0.31, 0.3, 0.3, FB_HUB]]), // tyres (two crossed boxes: rounded) and hubs
  [0, 0.24, 0.0, 0.22, 0.5, 0.4, W_, 1], [0, 0.6, 0.3, 0.16, 0.14, 0.22, W_, 1], // battery block filling the frame, nose up to the head tube
  [0, 0.76, -0.3, 0.4, 0.14, 1.04, '#17171a'], // the bench, top 0.90
  [0, 0.62, -0.54, 0.3, 0.05, 0.46, W_, 1], [0, 0.62, 0.54, 0.3, 0.05, 0.4, W_, 1], // fenders
  [-0.17, 0.3, 0.54, 0.05, 0.34, 0.06, FB_DARK], [0.17, 0.3, 0.54, 0.05, 0.34, 0.06, FB_DARK], [0, 0.62, 0.41, 0.08, 0.66, 0.08, FB_DARK], // fork blades, steering column
  [0, 1.24, 0.41, 0.74, 0.06, 0.06, FB_DARK], [0, 0.14, 0.08, 0.6, 0.04, 0.34, FB_DARK], // upright bars, footboards
  [0, 0.83, 0.55, 0.46, 0.34, 0.08, FB_DARK], [0, 0.77, 0.55, 0.34, 0.46, 0.08, FB_DARK], // headlight bezel, round-ish, 0.46 m
  [0, 0.86, 0.6, 0.4, 0.28, 0.04, FB_LAMP, 5], [0, 0.8, 0.6, 0.28, 0.4, 0.04, FB_LAMP, 5], // its lens: glows at night, 0.40 m across
  [0, 0.66, -0.84, 0.24, 0.08, 0.04, '#ff2d2d', 5],
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
// where the rider sits on each: y offset of the figure's origin, z of the driver, z of a passenger (0 = none), and the
// riders' pose (iAnim.z: 1 pedalling, 8 sitting upright with the legs held level and forward, as on makeFatbike)
const RIDE = { bike: { y: RIDER_Y, z: RIDER_Z, z2: 0, pose: 1 }, fatbike: { y: 0.33, z: -0.1, z2: -0.5, pose: 8 }, cargo: { y: 0.4, z: -0.46, z2: 0, pose: 1 } };
const BIKES_ = { bike: () => BIKE(), fatbike: FATBIKE, cargo: CARGO };
// street lamps in the three shapes of LAMP_KIND (squares use the residential one); the arm reaches along +x, towards the road.
// The head is part 6: it glows at night (uniform U.uNight in the shader), so a lamp never has to be swapped for a lit one.
const POST = '#3d434c', DAY_LAMP = '#dfe4e8';
const LAMPS = [
  () => model([[0, 0, 0, 0.14, 5.1, 0.14, POST], [0, 0.0, 0, 0.3, 0.35, 0.3, POST], [0.4, 4.98, 0, 0.84, 0.09, 0.1, POST], [0.82, 4.9, 0, 0.5, 0.16, 0.3, DAY_LAMP, 6], [0.82, 5.06, 0, 0.56, 0.05, 0.36, POST]]),
  () => model([[0, 0, 0, 0.24, 8.8, 0.24, POST], [0, 0, 0, 0.5, 0.5, 0.5, POST], [0, 8.2, 0, 0.3, 0.1, 0.3, POST], [1.0, 8.78, 0, 2.2, 0.12, 0.14, POST], [2.0, 8.66, 0, 0.8, 0.2, 0.4, DAY_LAMP, 6], [2.0, 8.86, 0, 0.86, 0.06, 0.46, POST]]),
  () => model([[0, 0, 0, 0.1, 3.5, 0.1, POST], [0.12, 3.46, 0, 0.3, 0.07, 0.08, POST], [0.2, 3.36, 0, 0.36, 0.14, 0.26, DAY_LAMP, 6], [0.2, 3.5, 0, 0.42, 0.05, 0.32, POST]]),
];
const LAMP_POOL = [0, 1, 2, 0]; // kind -> pool
// one section of an HTM tram (red skirt, cream top), 5.4 m long; a tram is five of these following the track
const TRAM = () => model([
  [0, 0.3, 0, 2.4, 1.05, 5.2, '#c8102e'], [0, 1.35, 0, 2.4, 1.6, 5.2, '#f3ecd9'], [0, 2.95, 0, 2.15, 0.2, 5.0, '#8d99a6'],
  [1.21, 1.6, 0, 0.03, 0.95, 4.4, '#3b5b7a', 7], [-1.21, 1.6, 0, 0.03, 0.95, 4.4, '#3b5b7a', 7],
  [0, 0.05, -1.5, 2.0, 0.3, 0.9, '#222222'], [0, 0.05, 1.5, 2.0, 0.3, 0.9, '#222222'],
  [0, 0.5, 2.7, 1.8, 2.0, 0.3, '#333333'],
  [-0.7, 0.75, 2.87, 0.34, 0.22, 0.05, '#fff6c9', 5], [0.7, 0.75, 2.87, 0.34, 0.22, 0.05, '#fff6c9', 5], // the headlights (the lead section only: see lit flag)
]);
const TRAM_SEG = 5.5, TRAM_N = 5;

const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;
const PH_GLSL = `\nconst vec3 PH_REST = ${v3(PH_REST)};\nconst vec3 PH_AT = ${v3(PH_AT)};\nconst vec3 PH_K = ${v3(PH_K)};\n`;
function crowdMat() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aPart;\nattribute vec4 iAnim;\nattribute vec3 iC1;\nattribute vec3 iC2;\nattribute vec3 iC3;\nattribute vec3 iC4;\nvarying float vGlow;\nvarying vec3 vLit;\nvarying vec3 vLamp;\nuniform float uNight;' + LAMP_GLSL + PH_GLSL)
      .replace('#include <color_vertex>', `#include <color_vertex>
        // parts 5 (vehicle lights: on when the instance's flag iC2.x is set), 6 (lamp heads) and 7 (tram windows) glow at night,
        // 8 (hazard lights) when iC2.y says so; 9 and 10 are the filming phone (see PHONE): its screen (10) is lit day and
        // night, as the acted phone's screen (the glow material): bright by day, glowing at night
        vGlow = aPart.x > 9.5 ? 1.0 : aPart.x > 8.5 ? 0.0 : aPart.x > 7.5 ? iC2.y : aPart.x > 4.5 ? uNight * (aPart.x < 5.5 ? iC2.x : 1.0) : 0.0;
        vLit = aPart.x > 8.5 ? vColor.rgb : aPart.x > 7.5 ? vec3(1.0, 0.62, 0.08) : aPart.x > 6.5 ? vec3(1.0, 0.8, 0.42) : aPart.x > 5.5 ? vec3(1.0, 0.82, 0.45) : vColor.rgb;
        vColor.rgb *= aPart.x < 0.5 || aPart.x > 4.5 ? vec3(1.0) : aPart.x < 1.5 ? iC1 : aPart.x < 2.5 ? iC2 : aPart.x < 3.5 ? iC3 : iC4;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        // a little warm light on whoever stands near a lamp (the lamps nearest to what the camera looks at: see U.uLampA)
        vLamp = uLampN > 0.5 ? lampLight((modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz, vec3(0.0, 1.0, 0.0), 1.0) * (aPart.x < 4.5 ? 1.0 : 0.0) : vec3(0.0);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float limb = aPart.y, ride = iAnim.z;
          // the phone (parts 9, 10) comes out of the hand only while filming (pose 7)
          if (aPart.x > 8.5 && ride > 6.5 && ride < 7.5) transformed = PH_AT + (transformed - PH_REST) * PH_K;
          if (limb > 0.5) {
            float sgn = (limb < 1.5 || limb > 3.5) ? 1.0 : -1.0;
            bool leg = limb < 2.5;
            float ang = sgn * sin(iAnim.x) * iAnim.y * (leg ? 1.0 : 0.9);
            // iAnim.z: 0 walking, 1 riding, 2 talking with the hands, 3 looking at a phone, 4 hands in pockets (standing: the legs stay still),
            // 5 running with both arms up (the legs keep their stride), 6 clapping, 7 filming with the phone held up,
            // 8 riding a fat-bike (sitting upright, hands on the high bars, the legs held level and still, as the acted rider's
            // thighs in the 'sit' pose; the instanced leg has no knee, so the whole leg goes forward: level, it passes over the
            // nose, the front fender and the fork and stops short of the headlight)
            if (ride > 7.5) ang = leg ? -1.5 : -1.1;
            else if (ride > 6.5) ang = leg ? 0.0 : (sgn > 0.0 ? -1.95 + 0.05 * sin(iAnim.x * 1.3) : -0.3);
            else if (ride > 5.5) ang = leg ? 0.0 : -1.2 + 0.3 * sin(iAnim.x * 2.6);
            else if (ride > 4.5) { if (!leg) ang = -2.6 + 0.3 * sin(iAnim.x + sgn); }
            else if (ride > 3.5) ang = leg ? 0.0 : 0.12;
            else if (ride > 2.5) ang = leg ? 0.0 : (sgn > 0.0 ? -1.0 + 0.06 * sin(iAnim.x * 1.3) : 0.0);
            else if (ride > 1.5) ang = leg ? 0.0 : (sgn > 0.0 ? -0.45 - 0.45 * sin(iAnim.x * 0.7 + 1.0) : -0.4 - 0.5 * sin(iAnim.x));
            else if (ride > 0.5) ang = leg ? -1.1 + sgn * 0.5 * sin(iAnim.x) : -1.1;
            float ca = cos(ang), sa = sin(ang);
            vec2 q = vec2(transformed.y - aPart.z, transformed.z);
            transformed.y = aPart.z + q.x * ca - q.y * sa;
            transformed.z = q.x * sa + q.y * ca;
          }
          transformed.y += abs(sin(iAnim.x)) * 0.1 * min(1.0, iAnim.y * 2.0) * ((ride > 4.5 && ride < 5.5) ? 1.0 : 1.0 - min(ride, 1.0));
          // iAnim.w tips the whole figure over backwards about its feet (someone knocked off their feet)
          if (iAnim.w != 0.0) { float ct = cos(iAnim.w), st = sin(iAnim.w); vec2 r = transformed.yz; transformed.y = r.x * ct - r.y * st; transformed.z = r.x * st + r.y * ct; }
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nvarying vec3 vLit;\nvarying vec3 vLamp;\nuniform float uNight;')
      .replace('#include <opaque_fragment>', 'outgoingLight += vColor.rgb * vLamp * (0.9 * uNight);\n\toutgoingLight = mix(outgoingLight, vLit, vGlow);\n\t#include <opaque_fragment>');
    Object.assign(sh.uniforms, { uNight: U.uNight, uLampA: U.uLampA, uLampN: U.uLampN, uLampR: U.uLampR, uFocus: U.uFocus });
  };
  mat.customProgramCacheKey = () => 'crowd6';
  return mat;
}
/**
 * The pale patch of road in front of a car that is driving: a flat fan, added to what is behind it (additive, no depth
 * write). It is one more mesh that shares the cars' own matrices and their lights-on flag, so parked cars have none.
 */
function makeBeams(cars) {
  const g = new THREE.BufferGeometry();
  // brightest on the middle line next to the car, fading to nothing at the sides and at the far end: a soft fan, no hard edges
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1.1, 0.07, 2.3, 0, 0.07, 2.3, 1.1, 0.07, 2.3, -3.2, 0.07, 10.5, 0, 0.07, 10.5, 3.2, 0.07, 10.5]), 3));
  g.setAttribute('aI', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 0.04, 0]), 1));
  g.setAttribute('iOn', cars.c2);
  g.setIndex([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4]);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: U.uNight },
    vertexShader: 'attribute vec3 iOn;\nattribute float aI;\nuniform float uNight;\nvarying float vI;\nvoid main() { vI = aI * iOn.x * uNight; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vI;\nvoid main() { gl_FragColor = vec4(vec3(1.0, 0.93, 0.7) * vI * 0.5, 1.0); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const m = new THREE.InstancedMesh(g, mat, 1);
  m.instanceMatrix = cars.mesh.instanceMatrix;
  m.count = 0; m.frustumCulled = false; m.renderOrder = 2;
  return m;
}
let _shared = null;
const shared = () => (_shared ||= { person: PERSON(), car: CAR(), bike: BIKE(), fatbike: null, cargo: null, lamps: LAMPS.map((f) => f()), tram: TRAM(), mat: crowdMat() });

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
      // (iC2.x is the lights-on flag of vehicles: see Pool.take; a pool keeps it so the headlight patches can share it)
      this.c2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      g.setAttribute('iC2', this.c2);
      for (const k of ['iC3', 'iC4']) g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
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
  take() {
    if (!this.free.length) return -1;
    const i = this.free.pop();
    if (i >= this.hi) { this.hi = i + 1; this.mesh.count = this.hi; }
    if (!this.anim) { this.c2.array[i * 3] = 1; this.c2.array[i * 3 + 1] = 0; this.c2.needsUpdate = true; } // vehicles drive with their lights on; parked cars switch them off
    return i;
  }
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
const DI8 = [1, -1, 0, 0, 1, 1, -1, -1], DJ8 = [0, 0, 1, -1, 1, -1, 1, -1];

export const PED = 0, BIKE_ = 1, CAR_ = 2, TRAM_ = 4;
const CELL = 8, GN = 256; // collision grid: 8 m cells, about 2 km across

export class Crowd {
  constructor(W, { lite = false } = {}) {
    this.W = W;
    if (W.ground) W.ground.dyn = this; // (W.ground asks the crowd where its parked cars stand: parkedAt)
    this.pkIx = new Map(); this.pkDirty = true;
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
    this.lampPools = [Math.round(2000 * k), Math.round(700 * k), Math.round(500 * k)].map((cap, i) => new Pool(S.lamps[i], S.mat, cap, false));
    this.trams = new Pool(S.tram, S.mat, Math.round(120 * k), false);
    // pale patches of road in front of the cars that are driving: one more mesh on the cars' own matrices
    this.beams = makeBeams(this.cars);
    this.max = { [PED]: Math.round(780 * k), [BIKE_]: Math.round(250 * k), [CAR_]: Math.round(320 * k), [TRAM_]: Math.round(22 * k), parked: Math.round(980 * k) };
    this.count = { [PED]: 0, [BIKE_]: 0, [CAR_]: 0, [TRAM_]: 0, parked: 0 };
    this.group = new THREE.Group();
    this.group.add(this.people.mesh, this.cars.mesh, this.bikes.mesh, ...this.lampPools.map((p) => p.mesh), this.trams.mesh, this.beams);
    this.owners = new Map(); // tile key → { lanes, parked, lamps, agents, groups, hot, pend, cx, cz, r, on }
    this.agents = [];
    this.ends = new Map(); // lane ends by 6 m cell, for finding the way on at a junction
    this.pedIx = null; // pavement points by 4 m cell, for crossing the road (built when first needed)
    this.head = new Int32Array(GN * GN); this.next = new Int32Array(4096); this.gp = new Float32Array(256);
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
    // the stage: where a scene plays (setStage). sg is the live one, sgLast stays after it ended for those still finishing their part
    this.sg = null; this.sgLast = null; this.sgId = 0;
    this.wat = []; // walkers standing at the rim watching
    this._hzPar = 0; this._fp = false; this._px = 0; this._pz = 0; this._ux = 0; this._uz = 0; this._es = 0;
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
  /**
   * The height a walker (or a group's member) stands at: the highest ground under the feet (W.ground: a foot on a kerb lifts the figure
   * onto it), eased up and down (a step up is quick, so a foot never sinks into the kerb for long). Far from the camera the centre only.
   */
  _feet(a, x, z, sc, dt, near = true, hd = a.hd) {
    const G = this.W.ground;
    let t = G ? G.at(x, z, 0, G_PERSON, G_ALL) : this.W.hAt(x, z);
    if (G && near) {
      // the four corners of the two shoes (the figure's foot boxes, x +-0.36, z -0.17..0.27 in its own units), turned with it
      const c = Math.cos(hd) * sc, sn = Math.sin(hd) * sc;
      for (let k = 0; k < 4; k++) { const lx = k & 1 ? 0.36 : -0.36, lz = k & 2 ? 0.27 : -0.17; t = Math.max(t, G.at(x + c * lx + sn * lz, z - sn * lx + c * lz, 0, G_PERSON, G_ALL)); }
    }
    if (a.gy === undefined || !(dt > 0) || Math.abs(t - a.gy) > 0.6) a.gy = t;
    else a.gy += clamp(t - a.gy, -2.5 * dt, 4 * dt);
    return a.gy;
  }
  /**
   * The height a vehicle stands at: the highest ground under its wheels (half length hl along the heading, half track hw across; hw 0 =
   * a bike, two wheels), where a rail bar counts as the road it lies in. Eased when `a` (with dt) is given.
   */
  _wheels(a, x, z, hd, hl, hw, dt) {
    const G = this.W.ground;
    if (!G) return this.W.hAt(x, z);
    const sx = Math.sin(hd), sz = Math.cos(hd);
    let t = -Infinity;
    for (let k = -1; k <= 1; k += 2) {
      if (hw > 0) for (let q = -1; q <= 1; q += 2) t = Math.max(t, G.at(x + sx * hl * k + sz * hw * q, z + sz * hl * k - sx * hw * q, 0, G_WHEEL, G_ALL));
      else t = Math.max(t, G.at(x + sx * hl * k, z + sz * hl * k, 0, G_WHEEL, G_ALL));
    }
    if (!a) return t;
    if (a.gy === undefined || !(dt > 0) || Math.abs(t - a.gy) > 0.6) a.gy = t;
    else a.gy += clamp(t - a.gy, -2 * dt, 3 * dt);
    return a.gy;
  }

  // ------------------------------------------------------------ building lanes
  /**
   * A streamed tile's roads and tracks (given in the tile's own coordinates). A tile that is already known is left alone,
   * except that a finer build of it that brought street furniture adds its benches to the gathering spots (nothing else moves).
   */
  addTile(t) {
    const W = this.W, f = W.frame, TILE = 256, toScene = (x, z) => f.S(t.ox + x, t.oy + TILE - z);
    const benches = (o) => { o.furn = true; for (const q of t.props) if (q.kind === 'bench') { const p = toScene(q.x, q.z); o.hot.push(p[0], p[1], 1); } };
    if (this.owners.has(t.key)) { const o = this.owners.get(t.key); o.seen = this.t; if (t.props && !o.furn) { benches(o); o.clean = 1; } return; } // (its lanes are cleared in update, one owner at a time)
    const ctr = f.S(t.ox + TILE / 2, t.oy + TILE / 2);
    const o = { id: t.key, lanes: [], parked: [], lamps: [], agents: new Set(), groups: [], hot: [], pend: [], cx: ctr[0], cz: ctr[1], r: 190, on: false, seen: this.t, furn: false };
    // places where people gather, from the tile's points of interest (kinds 1 bar, 2 cafe/snack bar, 6 coffee shop, 8 bench)
    // and benches that were furnished: flat [x, z, tag] with tag 1 bench, 2 bar, 3 snack
    for (const e of t.pois || []) {
      const tag = e[0] === 8 ? 1 : e[0] === 1 ? 2 : e[0] === 2 || e[0] === 6 ? 3 : 0;
      if (tag) { const p = f.S(t.ox + e[1] / 10, t.oy + e[2] / 10); o.hot.push(p[0], p[1], tag); }
    }
    if (t.props) benches(o); // (only the finest level of detail has furniture: see the start of addTile for a tile that gains it later)
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
    // A small two-way street with parking (offsets away from the parked side): the car between an oncoming cyclist just inside the parked
    // cars and a cyclist at the far kerb, with room to pass both, where the street is wide enough (5.55 m); narrower, the kerb cyclist
    // rides on the car's own line, one queue: the car follows the bike.
    const smallSt = (w) => { const b2 = -(w / 2 - 0.98) + 1.3, b1 = w / 2 - 0.6, lo = b2 + 1.325, hi = b1 - 1.325; return lo <= hi ? { car: (lo + hi) / 2, kerb: b1 } : { car: Math.max(0.7, w / 2 - 1.25), kerb: Math.max(0.7, w / 2 - 1.25) }; };
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
        // (with parking on a two-way street the car keeps to the far side, so an oncoming cyclist fits between it and the parked cars)
        split(laneLine(a, park ? (rev ? -1 : 1) * (one ? 0.7 : smallSt(w).car) : 0, rev), CAR_, cls, yes);
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
        // on a small street with parking the kerb on that side is taken: ride just inside the parked cars instead (whichever side they are)
        const L2 = park && !one ? smallSt(w) : null; // (the kerb cyclist of a two-way street with parking: see smallSt)
        split(laneLine(a, park && rev ? w / 2 - 0.98 - 1.3 : L2 ? L2.kerb : w / 2 - 0.6, false), BIKE_, cls, yes);
        if (!one) split(laneLine(a, park && !rev ? -(w / 2 - 0.98) + 1.3 : L2 ? -L2.kerb : -(w / 2 - 0.6), true), BIKE_, cls, yes);
      }
      if (cls >= 2 && cls <= 7) {
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
    // lamp posts: where the tile's own data puts them (world.js, lampsOf), turned into scene coordinates; flat [x, z, heading, kind]
    const LS = t.lamps && t.lamps.a;
    if (LS) for (let i = 0; i + 4 < LS.length; i += 5) {
      const p = toScene(LS[i], LS[i + 1]), q = toScene(LS[i] + LS[i + 2], LS[i + 1] + LS[i + 3]);
      o.lamps.push(p[0], p[1], Math.atan2(-(q[1] - p[1]), q[0] - p[0]), LS[i + 4]);
    }
    this._parkClear(o);
    this.owners.set(t.key, o);
    this.pkDirty = true;
    o.clean = 1; // (its lanes give way to the tile's furniture and drawn walls before anybody walks them: see update and _clearLanes)
    this.pedIx = null;
  }
  /**
   * A parked car is placed along its own kerb; where another road's lane runs through that place (a junction, a crossing street), it is
   * not placed at all (decided before anything is shown). Its own street's lanes are laid to pass it.
   */
  _parkClear(o) {
    const P = o.parked, keep = [];
    for (let i = 0; i + 3 < P.length; i += 4) {
      const fx = Math.sin(P[i + 2]), fz = Math.cos(P[i + 2]);
      // where it was put, else a little along its kerb, or in a free place of its kerb further on (the line has one every 6 m and the
      // coin left about half empty), else where it was after all (a car against a post is a smaller fault than a missing car: counted)
      let placed = false;
      for (const sh of [0, 1.5, -1.5, 3, -3, 6, -6, 4.5, -4.5, 9, -9, 12, -12]) {
        const x = P[i] + fx * sh, z = P[i + 1] + fz * sh;
        if (sh && this._walkT()[this._cls(x, z)] !== 1) continue; // (moved: still on the road)
        let near = false;
        for (let k = 0; k < keep.length && !near; k += 4) near = (keep[k] - x) ** 2 + (keep[k + 1] - z) ** 2 < 4.6 * 4.6;
        for (let k = i + 4; sh && k + 3 < P.length && !near; k += 4) near = (P[k] - x) ** 2 + (P[k + 1] - z) ** 2 < 4.6 * 4.6; // (nor onto the next one's place)
        if (near) continue;
        if (!this._parkHit(o, x, z, fx, fz)) { keep.push(x, z, P[i + 2], P[i + 3]); placed = true; if (sh) this.parkMoved = (this.parkMoved || 0) + 1; break; }
      }
      if (!placed) { keep.push(P[i], P[i + 1], P[i + 2], P[i + 3]); this.parkStuck = (this.parkStuck || 0) + 1; }
    }
    o.parked = keep;
  }
  /** Does a lane of the owner's cars or bikes run through a parked car standing at (x, z) facing (fx, fz)? */
  _parkHit(o, x, z, fx, fz) {
    {
      let hit = false;
      for (const l of o.lanes) {
        if (l.kind !== CAR_ && l.kind !== BIKE_ || hit) continue;
        const hw = 0.925 + (l.kind === CAR_ ? 0.925 : 0.3) - 0.2, hl = 2.2 + (l.kind === CAR_ ? 0.3 : 0.1); // (0.2 m of slack: what dev-count calls inside)
        for (let k = 0; k < l.n && !hit; k++) {
          const dx = l.pts[k * 2] - x, dz = l.pts[k * 2 + 1] - z;
          if (dx > 6 || dx < -6 || dz > 6 || dz < -6) continue;
          // the lane between this point and the next, every half metre, against the car's box widened by the vehicle's half width
          const k1 = Math.min(l.n - 1, k + 1), ex = l.pts[k1 * 2] - l.pts[k * 2], ez = l.pts[k1 * 2 + 1] - l.pts[k * 2 + 1], m = Math.max(1, Math.ceil(Math.hypot(ex, ez) / 0.5));
          for (let j = 0; j <= m && !hit; j++) { const px = dx + (ex * j) / m, pz = dz + (ez * j) / m, u = px * fx + pz * fz, v = px * fz - pz * fx; if (u < hl && u > -hl && v < hw && v > -hw) hit = true; }
        }
      }
      return hit;
    }
  }
  /** Ground classes for walkers: 2 pavement and squares, 1 road (a crossing), 0 neither (255, no tile: benefit of the doubt). */
  _walkT() {
    if (this.walkT) return this.walkT;
    const C = this.W.C, t = new Uint8Array(256);
    for (const k of [C.WALK, C.LAND, C.PLAZA, C.FOOT, C.PED, C.CURB, C.DIRT]) t[k] = 2;
    for (const k of [C.ASPHALT, C.KLINKER, C.SERVICE, C.CYCLE, C.BIKELANE, C.MARK, C.PARKING, C.RAILBED, C.RAIL]) t[k] = 1;
    t[255] = 2;
    return (this.walkT = t);
  }
  /** Room for a person (radius r) at scene (x, z): W.ground says it may stand there. True when there is no W.ground. */
  _room(x, z, r = 0.3) { const G = this.W.ground; if (!G) return true; const h = G.at(x, z, r); return h === h; }
  /** ... and on ground a walker uses: pavement, or road where `road` (the lane itself is on road there). */
  _roomWalk(x, z, road) {
    const G = this.W.ground, h = G.at(x, z, 0.3);
    if (h !== h) return false;
    const c = this._walkT()[G.cls];
    if (!(c === 2 || (road && c === 1))) return false;
    for (let k = 0; k < 4; k++) { const v = G.at(x + (k & 1 ? 0.21 : -0.21), z + (k & 2 ? 0.21 : -0.21), 0); if (v !== v) return false; } // (and the diagonals: a bench askew)
    return true;
  }
  /** Is the straight way from (x0, z0) to (x1, z1) clear for a person (checked every half metre, the ends left out)? */
  _lineFree(x0, z0, x1, z1, r = 0.25) {
    const m = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5);
    for (let k = 1; k < m; k++) if (!this._room(x0 + ((x1 - x0) * k) / m, z0 + ((z1 - z0) * k) / m, r)) return false;
    return true;
  }
  /**
   * Where a walking lane has to give way to what stands on it (furniture, posts, parked cars, fences, drawn walls: W.ground): per half
   * metre of the lane, the sideways offset (to the right of the way the lane is drawn, at most 1.5 m, on pavement) that clears a person,
   * ramped in and out (0.4 m sideways per metre), and the points where no offset clears. null when the lane is clear all along.
   */
  *_profile(lane) {
    // most lanes are clear: a quick look every metre first (a person's width and a little more), the full answer only where it is not
    const G = this.W.ground, WT = this._walkT();
    let hit = false;
    for (let s0 = 0; s0 <= lane.len && !hit; s0 += 1) { this._lp(lane, s0); const h = G.at(this._px, this._pz, 0.4); if (h !== h || WT[G.cls] === 0) hit = true; if ((s0 & 127) === 127) yield; }
    if (!hit) return null;
    const ns = Math.floor(lane.len * 2) + 1, raw = new Float32Array(ns), blk = new Uint8Array(ns);
    let prev = 0, nb = 0, any = false;
    for (let q = 0; q < ns; q++) {
      if ((q & 31) === 31) yield; // (resumable: lane clearing keeps to a time budget per frame)
      this._lp(lane, q * 0.5);
      const x = this._px, z = this._pz, nx = -this._uz, nz = this._ux, road = WT[this.W.clsAt(x, z)] === 1;
      let best = NaN;
      if (this._roomWalk(x, z, road)) best = 0;
      else for (let k = 0; k <= 12 && best !== best; k++) {
        // nearest to the offset of the point before first (a steady line), both ways
        for (const sg of k ? [1, -1] : [1]) {
          const d = prev + sg * k * 0.25;
          if (d > 1.5 || d < -1.5 || (d === 0 && prev === 0)) continue;
          if (this._roomWalk(x + nx * d, z + nz * d, road)) { best = d; break; }
        }
      }
      if (best !== best) { blk[q] = 1; nb++; raw[q] = 0; prev = 0; continue; }
      raw[q] = best; prev = best;
      if (best) any = true;
    }
    if (!any && !nb) return null;
    // the envelope: an offset reaches 0.2 m per half metre before and after the point that needs it, so a walker eases round a thing
    const ep = new Float32Array(ns), en = new Float32Array(ns);
    let e = 0, f = 0;
    for (let q = 0; q < ns; q++) { e = Math.max(raw[q] > 0 ? raw[q] : 0, e - 0.2); f = Math.min(raw[q] < 0 ? raw[q] : 0, f + 0.2); ep[q] = e; en[q] = f; }
    e = 0; f = 0;
    for (let q = ns - 1; q >= 0; q--) { e = Math.max(raw[q] > 0 ? raw[q] : 0, e - 0.2); f = Math.min(raw[q] < 0 ? raw[q] : 0, f + 0.2); ep[q] = Math.max(ep[q], e); en[q] = Math.min(en[q], f); }
    const off = new Float32Array(ns);
    for (let q = 0; q < ns; q++) {
      if (blk[q]) continue;
      let o = ep[q] > 0 && en[q] < 0 ? raw[q] : ep[q] > 0 ? ep[q] : en[q]; // (things on both sides near by: the point's own answer)
      if (o !== raw[q]) {
        this._lp(lane, q * 0.5);
        if (!this._roomWalk(this._px - this._uz * o, this._pz + this._ux * o, WT[this.W.clsAt(this._px, this._pz)] === 1)) o = raw[q];
      }
      off[q] = o;
    }
    return { off, blk: nb ? blk : null, nb };
  }
  /**
   * A walk round what blocks a lane, over W.ground's cells (A* on half-metre cells in a window of 10 m round both ends, at most 60 m a
   * side and 8000 cells looked at): points [x, z, ...] from (x0, z0) to (x1, z1), or null when there is none in the window that is not
   * much longer than the straight way (the lane is cut there then). Resumable (yields every 200 cells).
   */
  *_detour(x0, z0, x1, z1) {
    const pad = 10, X0 = Math.min(x0, x1) - pad, Z0 = Math.min(z0, z1) - pad, nx = Math.ceil((Math.max(x0, x1) + pad - X0) / 0.5), nz = Math.ceil((Math.max(z0, z1) + pad - Z0) / 0.5);
    if (nx > 120 || nz > 120) return null; // (a long blocked stretch: no way round worth the walk, the lane is cut)
    const N = nx * nz, st = new Uint8Array(N), g = new Float32Array(N).fill(Infinity), par = new Int32Array(N).fill(-1);
    const cellOf = (x, z) => { const i = Math.floor((x - X0) / 0.5), j = Math.floor((z - Z0) / 0.5); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
    const free = (c) => { if (st[c] === 0) { const i = c % nx, j = (c - i) / nx; st[c] = this._roomWalk(X0 + (i + 0.5) * 0.5, Z0 + (j + 0.5) * 0.5, false) ? 1 : 2; } return st[c] === 1; };
    const s0 = cellOf(x0, z0), s1 = cellOf(x1, z1);
    if (s0 < 0 || s1 < 0) return null;
    const hf = [], hc = [], i1 = s1 % nx, j1 = (s1 - i1) / nx;
    const H = (c) => { const i = c % nx, j = (c - i) / nx, dx = Math.abs(i - i1), dz = Math.abs(j - j1); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
    const push = (f, c) => { let k = hf.length; hf.push(f); hc.push(c); while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hf[k] = hf[p]; hc[k] = hc[p]; k = p; } hf[k] = f; hc[k] = c; };
    const pop = () => { const c = hc[0], lf = hf.pop(), lc = hc.pop(), n = hf.length; if (n) { let k = 0; for (;;) { let m = 2 * k + 1; if (m >= n) break; if (m + 1 < n && hf[m + 1] < hf[m]) m++; if (hf[m] >= lf) break; hf[k] = hf[m]; hc[k] = hc[m]; k = m; } hf[k] = lf; hc[k] = lc; } return c; };
    g[s0] = 0; push(H(s0), s0); st[s0] = 1; st[s1] = 1;
    let found = false, guard = 0;
    while (hf.length && guard++ < 8000) {
      if (guard % 200 === 0) yield;
      const c = pop();
      if (c === s1) { found = true; break; }
      const ci = c % nx, cj = (c - ci) / nx;
      for (let k = 0; k < 8; k++) {
        const di = DI8[k], dj = DJ8[k], ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const nc = nj * nx + ni;
        if (!free(nc) || (di && dj && (!free(cj * nx + ni) || !free(nj * nx + ci)))) continue;
        const ng = g[c] + (di && dj ? 1.4142 : 1);
        if (ng >= g[nc]) continue;
        g[nc] = ng; par[nc] = c; push(ng + H(nc), nc);
      }
    }
    if (!found || g[s1] * 0.5 > Math.hypot(x1 - x0, z1 - z0) * 2.5 + 15) return null;
    const cells = [];
    for (let c = s1; c >= 0; c = par[c]) { const i = c % nx; cells.push(X0 + (i + 0.5) * 0.5, Z0 + ((c - i) / nx + 0.5) * 0.5); if (c === s0) break; }
    const pts = [x0, z0];
    // pull the string tight, looking at most 12 cells on from each point (linear in the path's length)
    let a = cells.length - 2;
    while (a > 0) {
      let b = Math.max(0, a - 24);
      while (b < a - 2 && !this._lineFree(cells[a], cells[a + 1], cells[b], cells[b + 1], 0.3)) b += 2;
      pts.push(cells[b], cells[b + 1]);
      a = b;
    }
    pts.push(x1, z1);
    return pts;
  }
  /** A new walking lane of owner o along the points (resampled every 1.5 m), registered like the ones addTile makes. */
  _newLane(o, P, like) {
    let len = 0;
    for (let i = 2; i < P.length; i += 2) len += Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]);
    if (len < 6) return null;
    const m = Math.max(2, Math.round(len / 1.5) + 1), pts = new Float32Array(m * 2);
    let seg = 2, acc = 0, sl = Math.hypot(P[2] - P[0], P[3] - P[1]);
    for (let k = 0; k < m; k++) {
      const s = (len * k) / (m - 1);
      while (seg < P.length - 2 && s > acc + sl) { acc += sl; seg += 2; sl = Math.hypot(P[seg] - P[seg - 2], P[seg + 1] - P[seg - 1]); }
      const t = sl > 1e-6 ? clamp((s - acc) / sl) : 0;
      pts[k * 2] = P[seg - 2] + (P[seg] - P[seg - 2]) * t; pts[k * 2 + 1] = P[seg - 1] + (P[seg + 1] - P[seg - 1]) * t;
    }
    const lane = { pts, n: m, len, step: len / (m - 1), kind: like.kind, cls: like.cls, owner: o, dead: false, side: like.side, rw: like.rw, zeb: null, info: null, heldAt: -99 };
    if (like.zeb && like.zeb.length) {
      // the zebras of the lane it replaces, where they come to lie on this one
      const zs = [];
      for (const s0 of like.zeb) { this._lp(like, s0); let bd = 4, bs = -1; for (let k = 0; k < m; k++) { const d = Math.hypot(pts[k * 2] - this._px, pts[k * 2 + 1] - this._pz); if (d < bd) { bd = d; bs = k * lane.step; } } if (bs > 2 && bs < len - 2) zs.push(bs); }
      lane.zeb = zs;
    }
    return lane;
  }
  /**
   * Keep the owner's walking lanes off what stands on them (W.ground; the tile at its finest level). A lane nobody is on (or heading for)
   * is built again where needed: its offsets folded in, a detour round a terrace field or a block, or cut where there is no way; a lane
   * somebody is on keeps its line and gets the offsets (blended in as they walk) and its blocked points (a dead end for now: it is built
   * again later, once nobody is on it). Nothing that is shown moves.
   */
  *_clearLanes(o, dirtyOnly = false) {
    const G = this.W.ground;
    if (!G || !G.ready(o.cx, o.cz)) return;
    const usedNow = (l) => { for (const a of this.agents) if (!a.dead && (a.lane === l || (a.cross && a.cross.lane === l) || (a.fall && a.fall.to && a.fall.to.lane === l))) return true; return false; };
    let dirty = false, changed = false, len0 = 0, len1 = 0;
    for (const l of o.lanes) if (l.kind === PED) len0 += l.len;
    for (const lane of o.lanes.slice()) {
      if (lane.kind !== PED || lane.dead) continue;
      if (dirtyOnly && !lane.blk) continue; // (a retry looks only at lanes that are still blocked)
      if (dirtyOnly && usedNow(lane)) { dirty = true; continue; } // (still somebody on it: no new answer to work out, try again later)
      yield;
      const pr = yield* this._profile(lane);
      if (!pr) { lane.off = null; lane.blk = null; continue; }
      if (!pr.nb || usedNow(lane)) { lane.off = pr.off; lane.blk = pr.blk; if (pr.nb) dirty = true; continue; }
      // nobody is on it: build it again with the offsets in its points, round (or cut at) what blocks it
      const ns = pr.off.length, pieces = [];
      let cur = [];
      const at = (q) => { this._lp(lane, Math.min(lane.len, q * 0.5)); return [this._px - this._uz * pr.off[q], this._pz + this._ux * pr.off[q]]; };
      for (let q = 0; q < ns; q++) {
        if (!pr.blk[q]) { const p = at(q); cur.push(p[0], p[1]); continue; }
        let q1 = q; while (q1 + 1 < ns && pr.blk[q1 + 1]) q1++;
        let d = null;
        if (cur.length >= 2 && q1 + 1 < ns) { const b = at(q1 + 1); d = yield* this._detour(cur[cur.length - 2], cur[cur.length - 1], b[0], b[1]); }
        if (d) for (let k = 2; k < d.length - 2; k += 2) cur.push(d[k], d[k + 1]);
        else { if (cur.length >= 4) pieces.push(cur); cur = []; }
        q = q1;
      }
      if (cur.length >= 4) pieces.push(cur);
      if (lane.dead || usedNow(lane)) { lane.off = pr.off; lane.blk = pr.blk; dirty = true; continue; } // (somebody stepped on it meanwhile)
      lane.dead = true; this._end(lane, 0, false); this._end(lane, 1, false);
      o.lanes.splice(o.lanes.indexOf(lane), 1);
      changed = true;
      for (const P0 of pieces) {
        const nl0 = this._newLane(o, P0, lane);
        if (!nl0) continue;
        yield;
        const p0 = yield* this._profile(nl0);
        // (still blocked here and there, where the new points cut a corner: cut it there as well, so no lane has a dead end inside it)
        let parts = [[nl0, p0]];
        if (p0 && p0.nb) {
          parts = [];
          let cur = [];
          for (let q = 0; q < p0.off.length; q++) {
            if (p0.blk[q]) { if (cur.length >= 4) { const l2 = this._newLane(o, cur, lane); if (l2) parts.push([l2, yield* this._profile(l2)]); } cur = []; continue; }
            this._lp(nl0, Math.min(nl0.len, q * 0.5)); cur.push(this._px - this._uz * p0.off[q], this._pz + this._ux * p0.off[q]);
          }
          if (cur.length >= 4) { const l2 = this._newLane(o, cur, lane); if (l2) parts.push([l2, yield* this._profile(l2)]); }
        }
        for (const [nl, p2] of parts) {
          nl.off = p2 ? p2.off : null; nl.blk = p2 ? p2.blk : null;
          o.lanes.push(nl); this._end(nl, 0, true); this._end(nl, 1, true);
        }
      }
    }
    o.dirty = dirty;
    if (changed) {
      this.pedIx = null;
      // a lane cut where nothing gets past is shorter: the owner's walkers are spread over what is left, so the street keeps its people
      for (const l of o.lanes) if (l.kind === PED) len1 += l.len;
      o.pedK = (o.pedK || 1) * (len1 > 1 ? Math.min(2, len0 / len1) : 1);
    }
  }
  /**
   * Lane clearing, a little every frame (at most `ms` milliseconds): the job of one owner at a time, the nearest waiting one first. An owner
   * waits for it once (o.clean 1: its tile reached the finest level) before it is filled; a blocked lane somebody was on is looked at again
   * now and then (o.dirty), and only while nobody is on it.
   */
  _clearStep(x, z, ms) {
    const t0 = performance.now();
    for (;;) {
      if (!this.cj) {
        let best = null, bd = Infinity;
        for (const o of this.owners.values()) {
          if (!(o.clean === 1 || o.retry)) continue;
          if (!this.W.ground || !this.W.ground.ready(o.cx, o.cz)) continue;
          const d = Math.hypot(o.cx - x, o.cz - z);
          if (d < bd) { bd = d; best = o; }
        }
        if (!best) return;
        this.cj = this._clearLanes(best, best.clean !== 1); this.cjo = best; best.clean = 0; best.retry = false;
      }
      if (!this.owners.has(this.cjo.id)) this.cj = null; // (its tile left)
      else if (this.cj.next().done) this.cj = null;
      if (performance.now() - t0 > ms) return;
    }
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
    this.pkDirty = true;
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
    // a live stage moves with everyone else (angles around it turn with the frame)
    for (const S of this.sg === this.sgLast ? [this.sg] : [this.sg, this.sgLast]) if (S) { const c = mv(S.x, S.z), big = S.r + 26; const q = mv(S.px, S.pz); S.px = q[0]; S.pz = q[1]; S.x = c[0]; S.z = c[1]; S.x0 = c[0] - big; S.x1 = c[0] + big; S.z0 = c[1] - big; S.z1 = c[1] + big; }
    const mp = (ob, kx, kz) => { if (ob[kx] === undefined) return; const p = mv(ob[kx], ob[kz]); ob[kx] = p[0]; ob[kz] = p[1]; };
    this.ends.clear();
    for (const o of this.owners.values()) {
      const c = mv(o.cx, o.cz);
      o.cx = c[0]; o.cz = c[1]; o.seen = this.t;
      for (const l of o.lanes) {
        for (let i = 0; i + 1 < l.pts.length; i += 2) { const p = mv(l.pts[i], l.pts[i + 1]); l.pts[i] = p[0]; l.pts[i + 1] = p[1]; }
        this._end(l, 0, true); this._end(l, 1, true);
      }
      for (let i = 0; i < o.parked.length; i += 4) { const p = mv(o.parked[i], o.parked[i + 1]); o.parked[i] = p[0]; o.parked[i + 1] = p[1]; o.parked[i + 2] += turn; }
      for (let i = 0; i < o.lamps.length; i += 4) { const p = mv(o.lamps[i], o.lamps[i + 1]); o.lamps[i] = p[0]; o.lamps[i + 1] = p[1]; o.lamps[i + 2] += turn; }
      for (let i = 0; i < o.hot.length; i += 3) { const p = mv(o.hot[i], o.hot[i + 1]); o.hot[i] = p[0]; o.hot[i + 1] = p[1]; }
      for (const g of o.groups) {
        const c = mv(g.x, g.z); g.x = c[0]; g.z = c[1];
        mp(g, 'hx', 'hz'); mp(g, 'dx', 'dz'); mp(g, 'fx', 'fz');
        for (const m of g.members) { const q = mv(m.x, m.z); m.x = q[0]; m.z = q[1]; m.hd += turn; m.want += turn; mp(m, 'hx', 'hz'); mp(m, 'sx', 'sz'); }
        for (const b of g.bikes) { const q = mv(b.x, b.z); b.x = q[0]; b.z = q[1]; b.hd += turn; mp(b, 'hx', 'hz'); mp(b, 'sx', 'sz'); }
      }
      for (const a of o.agents) {
        if (a.fixed) { const p = mv(a.x, a.z); a.x = p[0]; a.z = p[1]; a.hd += turn; (a.kind === 3 ? a.lp : this.cars).put(a.slot, a.x, W2.hAt(a.x, a.z), a.z, a.hd, 1); }
      }
    }
    for (const a of this.agents) {
      if (a.dead) continue;
      const p = mv(a.x, a.z), q = mv(a.x + a.ox, a.z + a.oz);
      a.ox = q[0] - p[0]; a.oz = q[1] - p[1]; a.x = p[0]; a.z = p[1]; a.hd += turn;
      if (a.sm === 3) { const c = mv(a.ac, a.az); a.ac = c[0]; a.az = c[1]; a.ar0 += turn; }
      if (a.sm === 9) { const c = mv(a.gx, a.gz); a.gx = c[0]; a.gz = c[1]; }
      if (a.hwOn) a.hw += turn;
      if (a.cross) { const u = mv(a.cross.x0, a.cross.z0), w = mv(a.cross.x1, a.cross.z1); a.cross.x0 = u[0]; a.cross.z0 = u[1]; a.cross.x1 = w[0]; a.cross.z1 = w[1]; }
      if (a.fall) { const u = mv(a.fall.x0, a.fall.z0), w = mv(a.fall.x0 + a.fall.vx, a.fall.z0 + a.fall.vz); a.fall.x0 = u[0]; a.fall.z0 = u[1]; a.fall.vx = w[0] - u[0]; a.fall.vz = w[1] - u[1]; if (a.fall.to) { const e = mv(a.fall.to.x1, a.fall.to.z1); a.fall.to.x1 = e[0]; a.fall.to.z1 = e[1]; } }
    }
    this.W = W2;
    for (const o of this.owners.values()) for (const g of o.groups) if (g.shown) this._gPut(g);
    this.pedIx = null;
    this.blockers = []; this.zones = [];
    this.pkDirty = true;
    if (W2.ground) W2.ground.dyn = this;
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
    if (a.sm === 2 || a.sm === 9) this._unwat(a);
    if (a.kind === 3) a.lp.give(a.slot);
    else if (a.kind === PED) { a.pp.anim.array[a.slot * 4 + 3] = 0; a.pp.give(a.slot); }
    else if (a.kind === BIKE_) { a.vp.give(a.slot); a.pp.give(a.rider); if (a.pass >= 0) a.pp.give(a.pass); }
    else if (a.kind === TRAM_) for (const s of a.tail) this.trams.give(s.slot);
    else this.cars.give(a.slot);
    if (a.kind !== 3) this.count[a.fixed ? 'parked' : a.kind]--;
    if (unlink && a.lane) a.lane.owner.agents.delete(a);
  }
  /** A full people pool gives up the figure of one walker or rider that nobody can see (they leave the crowd). False if all are in view. */
  _evict(pool) {
    for (const a of this.agents) if (!a.dead && a.pp === pool && (a.kind === PED || a.kind === BIKE_) && !this._seen(a.x, a.z)) { this._free(a); return true; }
    return false;
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
    for (let i = 0; i < o.lamps.length; i += 4) o.pend.push(-1 - i);
    this._reveal(o);
    // how many per 100 m of lane, by kind and by how big the street is
    const DENS = {
      [PED]: { 2: 1.5, 3: 1.5, 4: 1.3, 5: 0.9, 6: 0.85, 7: 0.7, 8: 4.2, 11: 0.5 },
      [BIKE_]: { 3: 0.5, 4: 0.5, 5: 0.35, 6: 0.25, 7: 0.2, 10: 1.0 },
      [CAR_]: { 1: 2.0, 2: 1.9, 3: 1.6, 4: 1.2, 5: 0.7, 6: 0.3, 7: 0.14, 9: 0.04, 13: 0.2 },
      [TRAM_]: { 1: 0.14 },
    };
    // (the owner's share of each kind carried from lane to lane, not drawn per lane: a lane cut in pieces gives the street the same
    // number, and the street holds what its lanes mean, not that give or take a few)
    const acc = { [PED]: 0.5, [BIKE_]: 0.5, [CAR_]: 0.5, [TRAM_]: 0.5 };
    for (const lane of o.lanes) {
      const want = ((DENS[lane.kind][lane.cls] || 0) * lane.len * this._info(lane).mult * (lane.kind === PED ? o.pedK || 1 : 1)) / 100;
      acc[lane.kind] += want;
      let n = Math.floor(acc[lane.kind]);
      acc[lane.kind] -= n;
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
      // a post that finds no free slot stays on the waiting list (it must not count as standing there)
      if (lamp) {
        const kind = o.lamps[j + 3], lp = this.lampPools[LAMP_POOL[kind]], slot = lp.take();
        if (slot < 0) continue;
        pend[q] = pend[pend.length - 1]; pend.pop();
        lp.put(slot, x, W.hAt(x, z), z, o.lamps[j + 2], 1);
        o.agents.add({ kind: 3, fixed: true, slot, x, z, hd: o.lamps[j + 2], lk: kind, lp, dead: false, lane: { owner: o } });
      } else {
        if (this.count.parked >= this.max.parked) continue;
        const slot = this.cars.take();
        if (slot < 0) continue;
        pend[q] = pend[pend.length - 1]; pend.pop();
        this.cars.c2.array[slot * 3] = 0; // parked cars stand dark
        this.cars.put(slot, x, this._wheels(null, x, z, o.parked[j + 2], 1.27, 0.79), z, o.parked[j + 2], 1);
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
    // (a vehicle is not put on top of another one of its lane: a few car lengths on, deterministically)
    if (lane.kind !== PED) for (let k = 0; k < 6; k++) { let clash = false; for (const b of lane.owner.agents) if (b.lane === lane && !b.dead && Math.abs(b.s - s) < (lane.kind === CAR_ ? 7 : lane.kind === TRAM_ ? 30 : 3)) { clash = true; break; } if (!clash) break; s = (s + (lane.kind === CAR_ ? 7.5 : lane.kind === TRAM_ ? 31 : 3.5)) % Math.max(1, lane.len); }
    if (lane.blk) { const q0 = Math.round(s * 2); for (let d = 0; d < lane.blk.length; d++) { const q = q0 + (d & 1 ? -(d + 1) >> 1 : d >> 1); if (q >= 0 && q < lane.blk.length && !lane.blk[q]) { s = clamp(q * 0.5, 0, lane.len); break; } } } // (not on a point the lane is blocked at)
    const kind = lane.kind, r = () => this.rnd(), pick = (l) => Math.floor(r() * l.length), rng = (v) => v[0] + r() * (v[1] - v[0]);
    this.onFoot = false;
    let A = look ? archOf(look.kind) : kind === PED || kind === BIKE_ ? this._pick(lane) : null;
    const rides = kind === BIKE_ || (A && A.rider && !(look ? !look.ride : this.onFoot)) || !!(look && look.ride), ak = rides ? BIKE_ : kind;
    const a = { kind: ak, lane, s, dir: kind === PED && r() < 0.5 ? -1 : 1, v: 0, v0: 0, slot: -1, rider: -1, pass: -1, pp: null, vp: null, rd: null, pave: rides && kind === PED, held: false, gait: 1, lean: 0, ph: r() * 6.28, hd: 0, x: 0, z: 0, ox: 0, oz: 0, lat: 0, pop: 0, wait: 0, ghost: 0, sc: 1, dead: false, vis: false, first: true, look: null, cross: null, fall: null, down: 0, think: r(), fixed: false,
      // the stage: sm 0 free, 1 walking to the rim, 2 watching, 3 round the rim, 4 running away, 5 looking back, 6 lingering after the scene, 7 walking out, 8 drifting back, 9 stepping out (no lane)
      sm: 0, sg: 0, sp: 1, wd: r(), pw: 0.4, md: 0, rs: 0, tm: 0, pose: 0, tl: 0, lw: false, jl: 0, hw: 0, hwOn: false, wk: false, lkd: false,
      ac: 0, az: 0, gx: 0, gz: 0, ar0: 0, ard: 0, arR: 0, arP: 0, arL: 1, arS: 0, arV: 1, sb: false, sbT: 0, hold: 0, hz: false, tw: 0, ut: 0 };
    if (ak === PED) {
      let model = look?.model || 'person', pool = this.people;
      if (A) { if (!look) model = A.models[pick(A.models)]; pool = this._pool(model, A); }
      a.slot = pool.take();
      if (a.slot < 0 && A && !look) { A = null; model = 'person'; pool = this.people; a.slot = pool.take(); } // that look is used up: a plain walker instead (never for somebody handed back: see adopt)
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
      for (let i = 0; i < TRAM_N; i++) { const slot = this.trams.take(); if (slot < 0) break; this.trams.c2.array[slot * 3] = i === 0 ? 1 : 0; a.tail.push({ slot }); } // (only the lead section has headlights)
      if (a.tail.length < TRAM_N) { for (const t of a.tail) this.trams.give(t.slot); return null; }
      a.v0 = 8.5;
    } else {
      a.slot = this.cars.take();
      if (a.slot < 0) return null;
      a.v0 = (lane.cls <= 2 ? 11 : lane.cls <= 4 ? 9 : lane.cls === 5 ? 7.5 : 5) * (0.85 + r() * 0.3);
      this.cars.tint(this.cars.c1, a.slot, r() < 0.05 ? [1, 0.67, 0.0] : P_CAR[pick(P_CAR)]);
    }
    a.pw = A?.def.watch ?? (a.look?.kid ? 0.85 : ak === BIKE_ ? 0.3 : 0.4);
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
    if (this.W.ground) { // nothing standing there either (W.ground: furniture, posts, parked cars, fences, drawn walls)
      if (!this._room(x, z, 0.3)) return false;
      for (let k = 0; k < GOOD_N; k++) { const an = (k * Math.PI) / 4; if (!this._room(x + Math.sin(an) * rad, z + Math.cos(an) * rad, 0)) return false; }
    }
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
      if (!G_[this._cls(mx, mz)] || !this._room(mx, mz, 0.3)) continue;
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
        if (!G_[this._cls(bx, bz)] || !G_[this._cls(bx + sx, bz + sz)] || !G_[this._cls(bx - sx, bz - sz)] || lanesWithin(o, bx, bz, 1.0) || !this._room(bx + sx, bz + sz, 0.3) || !this._room(bx - sx, bz - sz, 0.3)) continue;
        const bc = A.def.bikeCols;
        bikes.push({ x: bx, z: bz, hd, col: rgbOf(bc ? bc[Math.floor(r() * bc.length)] : '#151515'), vp: null, slot: -1 });
      }
    }
    o.groups.push({ o, A, x: cx, z: cz, R, members, bikes, shown: false, retry: 0, sm: 0, wt: false, back: 0, mid: 0, tl: 0 });
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
    g.shown = true; this.pkDirty = true; // (its bikes: parkedAt)
    this._gPut(g);
  }
  _gGive(g) {
    for (const m of g.members) if (m.slot >= 0) { m.pp.give(m.slot); m.slot = -1; }
    for (const b of g.bikes) if (b.slot >= 0) { b.vp.give(b.slot); b.slot = -1; }
  }
  _gHide(g) {
    this._gGive(g);
    this.count[PED] -= g.members.length; this.count.parked -= g.bikes.length;
    g.shown = false; this.pkDirty = true;
  }
  /** Stand everybody where the plan says (also after the street frame changed). */
  _gPut(g) {
    const W = this.W;
    for (const m of g.members) { m.gy = undefined; m.y = this._feet(m, m.x, m.z, m.sc, 0); m.pp.put(m.slot, m.x, m.y, m.z, m.hd, m.sc); this._dress(m.pp, m.slot, m.look); }
    for (const b of g.bikes) { b.vp.put(b.slot, b.x, this._wheels(null, b.x, b.z, b.hd, 0.6, 0), b.z, b.hd, 1); b.vp.tint(b.vp.c1, b.slot, b.col); }
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
        const q = M[Math.floor(this.rnd() * M.length)], T = this.sg || this.sgLast;
        if (g.wt && T && this.rnd() < 0.8) m.want = Math.atan2(T.x - m.x, T.z - m.z) + (this.rnd() - 0.5) * 0.5; // watching the scene
        else m.want = q === m ? m.hd : Math.atan2(q.x - m.x, q.z - m.z);
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
    const reach = a.kind === PED || a.pave ? 5.5 : a.kind === TRAM_ ? 5 : 7.5, cx = Math.floor(x / 6), cz = Math.floor(z / 6);
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
        // (a vehicle does not jump back: a lane that starts behind this end, along a lane lying on the same way, would loop it round)
        if (a.kind !== PED && !a.pave && ((l2.pts[i2 * 2] - x) * dx + (l2.pts[i2 * 2 + 1] - z) * dz) / dl < -1.5) continue;
        const ex = l2.pts[j2 * 2] - l2.pts[i2 * 2], ez = l2.pts[j2 * 2 + 1] - l2.pts[i2 * 2 + 1], cos = (ex * dx + ez * dz) / ((Math.hypot(ex, ez) || 1) * dl);
        if (cos < (a.kind === TRAM_ ? 0.5 : -0.35)) continue; // not back the way it came (and a tram does not turn sharply)
        const w = (0.4 + Math.max(0, cos) * 2) * (0.5 + this.rnd());
        if (w <= bw) continue;
        // a walker glides over from here to there as its offset melts: only if that way is clear (W.ground)
        if ((a.kind === PED || a.pave) && d > 0.6 && !this._lineFree(x, z, l2.pts[i2 * 2], l2.pts[i2 * 2 + 1], 0.25)) continue;
        bw = w; best = [l2, e2];
      }
    }
    return best;
  }
  /**
   * Does a parked car stand at scene (x, z)? Every parked car of the tiles the crowd knows counts, up or not yet (a car not yet put up
   * stands where nobody sees it). W.ground asks this (ground.js PARKED); the index of 4 m cells is made again when tiles come or go.
   */
  parkedAt(x, z) {
    if (this.pkDirty) {
      this.pkDirty = false; this.pkIx.clear();
      const put = (px, pz, hd, hl, hw) => {
        const sx = Math.sin(hd), sz = Math.cos(hd);
        for (let ci = Math.floor((px - hl - 0.3) / 4); ci <= Math.floor((px + hl + 0.3) / 4); ci++) for (let cj = Math.floor((pz - hl - 0.3) / 4); cj <= Math.floor((pz + hl + 0.3) / 4); cj++) {
          const k = ci * 65536 + cj;
          let b = this.pkIx.get(k);
          if (!b) this.pkIx.set(k, (b = []));
          b.push(px, pz, sx, sz, hl, hw);
        }
      };
      for (const o of this.owners.values()) {
        for (let i = 0; i + 3 < o.parked.length; i += 4) put(o.parked[i], o.parked[i + 1], o.parked[i + 2], 2.3, 1.0);
        for (const g of o.groups) if (g.shown) for (const bk of g.bikes) put(bk.x, bk.z, bk.hd, 0.95, 0.35); // (a group's parked bikes)
      }
    }
    const b = this.pkIx.get(Math.floor(x / 4) * 65536 + Math.floor(z / 4));
    if (!b) return false;
    for (let k = 0; k < b.length; k += 6) {
      const dx = x - b[k], dz = z - b[k + 1], u = dx * b[k + 2] + dz * b[k + 3], v = dx * b[k + 3] - dz * b[k + 2];
      if (u < b[k + 4] && u > -b[k + 4] && v < b[k + 5] && v > -b[k + 5]) return true;
    }
    return false;
  }
  /**
   * A way over the road from where the walker stands to the pavement point `to` ([lane, index, x, z]) or a point next to it on that lane,
   * with room for a person all along (no parked car, post or anything else in the way: W.ground). The first that is clear, or null.
   */
  _crossTo(a, to) {
    const G = this.W.ground;
    if (!G || !to) return to;
    const l = to[0];
    for (const di of [0, 1, -1, 2, -2]) {
      const i = to[1] + di;
      if (i < 0 || i >= l.n) continue;
      const x1 = l.pts[i * 2], z1 = l.pts[i * 2 + 1], d = Math.hypot(x1 - a.x, z1 - a.z), m = Math.max(1, Math.ceil(d / 0.5));
      let ok = true;
      for (let k = 1; k < m && ok; k++) { const h = G.at(a.x + ((x1 - a.x) * k) / m, a.z + ((z1 - a.z) * k) / m, 0.25); if (h !== h) ok = false; }
      if (ok) return di === 0 ? to : [l, i, x1, z1];
    }
    return null;
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
    // they keep their own figure: if that look's pool is full, one of that look whom nobody can see makes room; else not yet (false)
    const A = rides ? null : archOf(look.kind);
    if (A) { const pool = this._pool(look.model || 'person', A); if (!pool.free.length && !this._evict(pool)) return false; }
    const a = this._spawn(best, clamp(bi * best.step, 0.1, best.len - 0.1), look);
    if (!a) return false;
    const j = Math.min(best.n - 2, bi), ex = best.pts[j * 2 + 2] - best.pts[j * 2], ez = best.pts[j * 2 + 3] - best.pts[j * 2 + 1];
    a.dir = ex * Math.sin(hd) + ez * Math.cos(hd) >= 0 ? 1 : -1;
    // start exactly where they stand and drift onto the lane (from the lane point they were given: _spawn may have moved them along it,
    // off a point the lane is blocked at)
    this._lp(best, a.s); a.ox = x - this._px; a.oz = z - this._pz; a.lo = 0;
    a.pop = 1; a.hd = hd; a.first = false;
    a.vis = true; a.x = x; a.z = z; // (they were on screen a moment ago as an actor: no waiting to be shown)
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
  /**
   * The lamps (with a post standing) nearest to (x, z), written into `out` (a list of Vector4: x, height of the lamp head, z,
   * reach of its light) for the shaders. Returns how many; `this.lampReach` is how far from (x, z) the set is complete.
   * Nothing is allocated: the candidates live in two small arrays.
   */
  lampSet(out, x, z, K, R) {
    const cd = (this._cd ||= new Float32Array(32)), ca = (this._ca ||= new Array(32).fill(null));
    let n = 0;
    const R2 = R * R;
    for (const o of this.owners.values()) {
      for (const a of o.agents) {
        if (a.kind !== 3 || a.dead) continue;
        const dx = a.x - x, dz = a.z - z, d2 = dx * dx + dz * dz;
        if (d2 > R2 || (n >= K && d2 >= cd[K - 1])) continue;
        let j = n < K ? n++ : K - 1;
        while (j > 0 && cd[j - 1] > d2) { cd[j] = cd[j - 1]; ca[j] = ca[j - 1]; j--; }
        cd[j] = d2; ca[j] = a;
      }
    }
    const W = this.W;
    for (let i = 0; i < n; i++) { const a = ca[i], k = LAMP_KIND[a.lk]; out[i].set(a.x, W.hAt(a.x, a.z) + k.h, a.z, k.R * 1.15); ca[i] = null; }
    this.lampReach = n >= K ? Math.sqrt(cd[K - 1]) : R;
    return n;
  }
  /** Lamp posts and parked cars that pass a test on their position (the open street takes its anchors from these). */
  props(test) {
    const lamps = [], parked = [];
    for (const o of this.owners.values()) {
      const wait = o.pend.length ? new Set(o.pend) : null; // (not up yet: not there)
      for (let i = 0; i < o.lamps.length; i += 4) if (test(o.lamps[i], o.lamps[i + 1]) && !(wait && wait.has(-1 - i))) lamps.push({ x: o.lamps[i], z: o.lamps[i + 1], kind: o.lamps[i + 3] });
      for (let i = 0; i < o.parked.length; i += 4) if (test(o.parked[i], o.parked[i + 1]) && !(wait && wait.has(i))) parked.push({ x: o.parked[i], z: o.parked[i + 1], hd: o.parked[i + 2] });
    }
    return { lamps, parked };
  }

  // ------------------------------------------------------------ the stage: a scene plays out here
  /**
   * A scene takes the camera at `s` = { x, z, r, mode } (scene coordinates of the centre, radius in metres, mode 'watch' or 'flee'), or
   * `null` when it is over. The same centre again is cheap (a changed mode is picked up by everybody on the next frame). Nothing is
   * removed or teleported: walkers stop at the rim and watch, go round or turn back, run when the mode says so; cyclists and cars wait at
   * the rim or turn round; groups that hang around walk off to the rim together. The agents a gag has taken are not in the crowd, so
   * they are not affected; one handed back inside the circle walks out like anyone else.
   */
  setStage(s) {
    const cur = this.sg;
    if (!s) { if (cur) this._stageEnd(false); return; }
    const r = Math.max(1.5, +s.r || 6), fl = s.mode === 'flee';
    // the same scene (a centre that wanders by a couple of metres, a radius that changes a little) is updated in place; a changed mode is picked up next frame
    if (cur && Math.hypot(cur.x - s.x, cur.z - s.z) < 2 && Math.abs(cur.r - r) < 1) {
      if (cur.flee !== fl) { cur.flee = fl; cur.mid++; }
      if (cur.x !== s.x || cur.z !== s.z || cur.r !== r) {
        const big = r + 26;
        cur.x = s.x; cur.z = s.z; cur.r = r; cur.r2 = r * r; cur.x0 = s.x - big; cur.x1 = s.x + big; cur.z0 = s.z - big; cur.z1 = s.z + big; cur.far2 = (r + 90) * (r + 90);
        if (Math.hypot(cur.px - s.x, cur.pz - s.z) > 1.5) { cur.mid++; cur.px = s.x; cur.pz = s.z; } // (groups plan again once it has moved a little)
      }
      return;
    }
    if (cur) this._stageEnd(true);
    const big = r + 26;
    this.sg = this.sgLast = { id: ++this.sgId, mid: 0, px: s.x, pz: s.z, x: s.x, z: s.z, r, r2: r * r, flee: fl, x0: s.x - big, x1: s.x + big, z0: s.z - big, z1: s.z + big, far2: (r + 90) * (r + 90) };
  }
  /** The scene is over (or another one replaces it, `replace`): watchers linger a moment (a few clap or shrug), traffic gets a reaction time each. */
  _stageEnd(replace) {
    const S = this.sg;
    this.sg = null;
    for (const a of this.agents) {
      if (a.dead) continue;
      if (a.sm) {
        if (replace) { this._setSm(a, 0); a.sp = 1; a.sg = 0; a.hwOn = false; }
        else if (a.sm === 4) { this._setSm(a, 0); a.sp = 1; }
        else if (a.sm !== 3 && a.sm !== 6) {
          this._setSm(a, 6); a.sp = 0; a.tm = 0.8 + this.rnd() * 1.5;
          const u = this.rnd();
          if (u < 0.18) a.pose = 6; else if (u < 0.3) a.pose = 2; // a few clap, a few shrug
        }
      }
      if (a.sb) { a.sb = false; if (!replace) a.hold = 0.35 + Math.min(3, (Math.max(0, Math.hypot(a.x - S.x, a.z - S.z) - S.r) / 6) * 0.3) + this.rnd() * 0.3; } // the front of the queue first
    }
    this.wat.length = 0;
    for (const o of this.owners.values()) for (const g of o.groups) {
      if (!g.shown) { if (g.sm || g.wt || g.hx !== undefined) { this._gSnap(g); g.hx = undefined; } g.back = 0; continue; } // (hidden: back to its place, nobody sees)
      if (!(g.sm || g.wt)) { g.back = 0; continue; }
      g.back = 1; g.tl = replace ? 0.05 : 1 + this.rnd() * 1.5;
      if (!replace) for (const m of g.members) if (this.rnd() < 0.2) m.style = 6;
    }
  }
  _setSm(a, sm) {
    const was = a.sm === 2 || a.sm === 9, will = sm === 2 || sm === 9; // (on the way to a place at the rim counts: the place is taken)
    if (was && !will) this._unwat(a);
    else if (!was && will) this.wat.push(a);
    a.sm = sm;
  }
  /** Turn round on the lane (the sideways offset is to the walker's own side, so it flips too). */
  _flip(a) { a.dir = -a.dir; a.lat = -a.lat; this._fp = !this._fp; a.tf = this.t; } // (this._fp: the caller's heading for this frame is now the other way)
  _unwat(a) { const w = this.wat, i = w.indexOf(a); if (i >= 0) { w[i] = w[w.length - 1]; w.pop(); } }
  /** Point and direction of a lane at distance s along it, into _px, _pz, _ux, _uz. */
  _lp(L, s) {
    const p = L.pts, f = clamp(s, 0, L.len) / L.step, k = Math.min(L.n - 2, Math.floor(f)), t = f - k, x0 = p[k * 2], z0 = p[k * 2 + 1], ex = p[k * 2 + 2] - x0, ez = p[k * 2 + 3] - z0, el = Math.hypot(ex, ez) || 1;
    this._px = x0 + ex * t; this._pz = z0 + ez * t; this._ux = ex / el; this._uz = ez / el;
  }
  /** Metres along the lane (direction sd) until it is outside the circle for good measure; the lane position there goes to _es. Infinity: the lane ends first. */
  _scanOut(a, sd, S) {
    const L = a.lane, p = L.pts, rr = (S.r + 1.6) * (S.r + 1.6);
    let s = a.s;
    for (let k = 1; k <= 60; k++) {
      s += sd * L.step;
      if (s < 0 || s > L.len) return Infinity;
      const i = Math.round(s / L.step), dx = p[i * 2] - S.x, dz = p[i * 2 + 1] - S.z;
      if (dx * dx + dz * dz > rr) { this._es = s; return k * L.step; }
    }
    return Infinity;
  }
  /** Does the lane, ahead of the walker (a few points), run into the circle? */
  _scanIn(L, s, d, S, n) {
    const p = L.pts, rr = (S.r + 0.4) * (S.r + 0.4);
    for (let k = 1; k <= n; k++) {
      s += d * L.step;
      if (s < 0 || s > L.len) return false;
      const i = Math.round(s / L.step), dx = p[i * 2] - S.x, dz = p[i * 2 + 1] - S.z;
      if (dx * dx + dz * dz < rr) return true;
    }
    return false;
  }
  /** Lane position where the lane, going on through the circle, comes out the other side; -1 if it does not. */
  _scanThrough(a, S) {
    const L = a.lane, p = L.pts, rin = (S.r + 0.4) * (S.r + 0.4), rout = (S.r + 2.4) * (S.r + 2.4);
    let s = a.s, inside = false;
    for (let k = 1; k <= 40; k++) {
      s += a.dir * L.step;
      if (s < 0 || s > L.len) return -1;
      const i = Math.round(s / L.step), dx = p[i * 2] - S.x, dz = p[i * 2 + 1] - S.z, d2 = dx * dx + dz * dz;
      if (d2 < rin) inside = true; else if (inside && d2 > rout) return s;
    }
    return -1;
  }
  /** Plan a walk round the rim from where the walker stands to the far side of the circle, on pavement all the way. */
  _planArc(a, S, dc, dx, dz) {
    const se = this._scanThrough(a, S);
    if (se < 0) return false;
    this._lp(a.lane, se);
    const t0 = Math.atan2(dx, dz), t1 = Math.atan2(this._px - S.x, this._pz - S.z);
    let d = t1 - t0; d = Math.atan2(Math.sin(d), Math.cos(d));
    const R = Math.max(dc, S.r + 1.2), L = Math.abs(d) * R;
    if (Math.abs(d) > 2.9 || L > 45 || L < 1) return false;
    const G = this._good(), n = Math.ceil(L / 1.2);
    for (let k = 1; k <= n; k++) {
      const th = t0 + (d * k) / n, x = S.x + Math.sin(th) * R, z = S.z + Math.cos(th) * R;
      if (!G[this._cls(x, z)] || this.W.treeNear(x, z, 0.5) || !this._room(x, z, 0.3)) return false;
    }
    a.ar0 = t0; a.ard = d; a.arR = R; a.arP = 0; a.arL = L; a.arS = se; a.ac = S.x; a.az = S.z;
    a.arV = a.kind === BIKE_ ? Math.max(1.8, a.v0 * 0.8) : Math.max(1.6, a.v0 * 1.5);
    return true;
  }
  /** Is the pavement on the other side a way round? (its lane, travelling on the way we go, does not run into the circle) */
  _crossOK(to, hx, hz, S) {
    const l = to[0], i = to[1], j = Math.min(l.n - 2, i), sign = (l.pts[j * 2 + 2] - l.pts[j * 2]) * hx + (l.pts[j * 2 + 3] - l.pts[j * 2 + 1]) * hz >= 0 ? 1 : -1;
    return !this._scanIn(l, i * l.step, sign, S, 6);
  }
  /** A cyclist turns round onto the lane that runs the other way. False if there is none close by. */
  /**
   * A tram held at the end of its track in sight (a terminus) goes back on the other track, if one starts within 6 m the other way: its last
   * section becomes the first (nothing jumps), and the tram glides over onto the other track as it pulls away (as `ut`, a cyclist's swing).
   */
  _tramBack(a, hx, hz) {
    const len = (TRAM_N - 1) * TRAM_SEG;
    let best = null, bd = 36;
    for (const o of this.owners.values()) {
      if (!o.on) continue;
      for (const l of o.lanes) {
        if (l.kind !== TRAM_ || l === a.lane || l.dead || l.len < len + 2) continue;
        const d2 = (l.pts[0] - a.x) ** 2 + (l.pts[1] - a.z) ** 2, ex = l.pts[2] - l.pts[0], ez = l.pts[3] - l.pts[1];
        if (d2 < bd && ex * hx + ez * hz < -0.5 * Math.hypot(ex, ez)) { bd = d2; best = l; }
      }
    }
    if (!best) return false;
    // where the last section stands now (it leads from here on)
    const L = a.lane, sq = a.s - a.dir * len, f = clamp(sq, 0, L.len);
    this._lp(L, f);
    const over = sq < 0 ? sq : sq > L.len ? sq - L.len : 0, tx = this._px + this._ux * over + a.ox, tz = this._pz + this._uz * over + a.oz;
    this._lp(best, len);
    a.tail.reverse();
    for (let q = 0; q < TRAM_N; q++) this.trams.c2.array[a.tail[q].slot * 3] = q === 0 ? 1 : 0;
    this.trams.c2.needsUpdate = true;
    L.owner.agents.delete(a); best.owner.agents.add(a);
    a.lane = best; a.dir = 1; a.s = len; a.ox = tx - this._px; a.oz = tz - this._pz; a.ut = 1; a.held = false; a.ht = 0; a.v = 0;
    return true;
  }
  _uturn(a, hx, hz, bd = 6.25) {
    let best = null, bi = 0; // (bd: the square of how far the lane may be; 2.5 m: no swing across the road)
    for (const o of this.owners.values()) {
      if (!o.on || (o.cx - a.x) ** 2 + (o.cz - a.z) ** 2 > (o.r + 25) ** 2) continue;
      for (const l of o.lanes) {
        if (l.kind !== a.lane.kind || l === a.lane || l.dead) continue;
        const p = l.pts;
        for (let i = 0; i + 3 < p.length; i += 2) {
          const dx = p[i] - a.x, dz = p[i + 1] - a.z, d2 = dx * dx + dz * dz;
          if (d2 >= bd) continue;
          const ex = p[i + 2] - p[i], ez = p[i + 3] - p[i + 1];
          if (ex * hx + ez * hz > -0.6 * Math.hypot(ex, ez)) continue; // it has to run the other way
          bd = d2; best = l; bi = i >> 1;
        }
      }
    }
    if (!best) return false;
    a.lane.owner.agents.delete(a); best.owner.agents.add(a);
    a.ox = a.x - best.pts[bi * 2]; a.oz = a.z - best.pts[bi * 2 + 1]; // (melts away: a smooth swing round)
    a.lane = best; a.s = clamp(bi * best.step, 0.1, best.len - 0.1); a.dir = 1; a.lat = 0; a.ut = 1;
    return true;
  }
  /** Stand at the rim and watch: one of the idle poses, some film, some lean in and out. */
  _stand(a) {
    this._setSm(a, 2); a.sp = 0;
    const u = (a.wd * 57.3 + 0.11) % 1;
    a.jl = (((a.wd * 77.7) % 1) - 0.5) * 0.3;
    a.pose = u < 0.25 ? 7 : u < 0.35 ? 3 : u < 0.65 ? 4 : 2; // film, look at the phone, hands in pockets, talk with the hands
    a.lw = (a.wd * 91.1) % 1 < 0.3;
  }
  /**
   * A free place on the rim for a watcher, near angle a0 at radius rr: 1 = right here, 2 = a few steps along the arc (in a.gx, a.gz), 0 = none
   * (pavement only, no trunk, 0.8 m from the next watcher).
   */
  _spot(a, S, rr, a0) {
    const w = this.wat;
    for (let k = 0; k < 7; k++) {
      const ang = a0 + (((k + 1) >> 1) * (k & 1 ? 1 : -1) * 0.8) / rr, x = S.x + Math.sin(ang) * rr, z = S.z + Math.cos(ang) * rr;
      if (!this._ringOK(x, z, 0.5)) continue; // pavement all round a body's width, no trunk
      let ok = true;
      for (let i = 0; i < w.length && ok; i++) { if (w[i] === a) continue; const q = w[i], dx = (q.sm === 9 ? q.gx : q.x) - x, dz = (q.sm === 9 ? q.gz : q.z) - z; if (dx * dx + dz * dz < 1.21) ok = false; }
      if (ok) for (const o of this.owners.values()) {
        if (!o.on || o.groups.length === 0 || (o.cx - x) ** 2 + (o.cz - z) ** 2 > (o.r + 5) ** 2) continue;
        for (const g of o.groups) if (g.shown && (g.x - x) ** 2 + (g.z - z) ** 2 < (g.R + 3) ** 2) for (const m of g.members) { const dx = m.x - x, dz = m.z - z; if (dx * dx + dz * dz < 1.21) { ok = false; break; } }
        if (!ok) break;
      }
      if (!ok) continue;
      if (k === 0) return 1;
      a.gx = x; a.gz = z; return 2;
    }
    return 0;
  }
  /**
   * Take a place at the rim: right here if it is free, else a free place along the arc (pavement only, not in the water, a body's width
   * from the next watcher), else a few steps back along the pavement (h points towards the circle).
   */
  _arrive(a, S, dc, dx, dz, hx, hz, lx, lz) {
    const f = this._spot(a, S, Math.max(S.r + 1.0, dc), Math.atan2(dx, dz));
    if (f === 1) this._stand(a);
    else if (f === 2 || this._back(a, hx, hz)) { a.ox = a.x - lx; a.oz = a.z - lz; a.lat = 0; this._setSm(a, 9); }
    else this._stand(a); // (no room anywhere: they stand where they are)
  }
  /** A free place a few steps back along the way the walker came (heading hx, hz points at the circle): in a.gx, a.gz. */
  _back(a, hx, hz) {
    const w = this.wat;
    for (let k = 1; k <= 8; k++) {
      const x = a.x - hx * 1.15 * k, z = a.z - hz * 1.15 * k;
      if (!this._ringOK(x, z, 0.5)) return false;
      let ok = true;
      for (let i = 0; i < w.length; i++) { const q = w[i]; if (q === a) continue; const dx = (q.sm === 9 ? q.gx : q.x) - x, dz = (q.sm === 9 ? q.gz : q.z) - z; if (dx * dx + dz * dz < 1.21) { ok = false; break; } }
      if (ok) { a.gx = x; a.gz = z; return true; }
    }
    return false;
  }
  /** No lane leads out of the circle: walk out across the ground to the nearest free pavement place at the rim, else stay and watch. */
  _stepOut(a, S, dx, dz, lx, lz) {
    a.ox = a.x - lx; a.oz = a.z - lz; a.lat = 0;
    if (a.rs < S.r + 1) a.rs = S.r + 1.3;
    const f = this._spot(a, S, a.rs, Math.atan2(dx, dz));
    if (f === 2) this._setSm(a, 9); else this._stand(a);
  }
  /**
   * One walker (or a fat-bike on the pavement) near the stage. Sets the lane direction, the speed factor `sp`, the pose and the heading;
   * returns true when it moved the walker to another lane position (the caller skips the rest of the frame).
   */
  _wStage(a, dt, hx, hz, lx, lz) {
    const S = this.sg || this.sgLast, live = this.sg !== null, r = S.r, bike = a.kind === BIKE_;
    a.hwOn = false; this._fp = false;
    const dx = a.x - S.x, dz = a.z - S.z, dc = Math.sqrt(dx * dx + dz * dz) + 0.001, out = (hx * dx + hz * dz) / dc; // out > 0: walking away
    let sm = a.sm;
    // the scene wants everyone gone: whoever is close runs outwards
    if (live && S.flee && !bike && sm !== 4 && dc < r + 6) {
      this._setSm(a, 4); a.sg = S.id; a.wk = a.wd < a.pw; a.lkd = false;
      if (out < 0) this._flip(a);
      a.sp = Math.min(6, 2.4 + a.v0 * 1.2 + a.wd * 0.9) / a.v0;
      return false;
    }
    if (sm === 0) {
      if (!live) return false;
      if (dc < r) {
        // inside when the scene starts (or walked back in): out along the lane, the shorter way and not towards the middle
        a.sg = S.id;
        const ux = hx * a.dir, uz = hz * a.dir, ra = ux * dx + uz * dz;
        const sa = this._scanOut(a, 1, S) + (ra < 0 ? 8 : 0), sb = this._scanOut(a, -1, S) + (ra > 0 ? 8 : 0);
        a.rs = r + 1.3 + a.wd * 1.1;
        if (sa === Infinity && sb === Infinity) this._stepOut(a, S, dx, dz, lx, lz); // no lane leads out: step out across the ground
        else { if ((sa <= sb ? 1 : -1) !== a.dir) this._flip(a); this._setSm(a, 7); a.sp = bike ? 1 : clamp(2.3 / a.v0, 1.4, 3.2); a.tm = 14; } // (briskly: about 2.3 m/s whoever it is)
        return false;
      }
      // (not latched: a walker who turns, hops to another lane or comes back is looked at again; the dice are the person's own, so the answer is the same)
      if (dc > r + 7 || out > -0.05 || !this._scanIn(a.lane, a.s, a.dir, S, 5)) return false; // not heading into it
      a.sg = S.id;
      const watch = !bike && a.wd < a.pw;
      if (watch) { this._setSm(a, 1); a.md = 0; a.rs = r + 1.1 + ((a.wd * 13.1) % 1) * 1.4; a.sp = 1; return false; }
      const u = bike ? (a.wd < 0.6 ? 0.8 : 0.1) : (a.wd - a.pw) / Math.max(0.01, 1 - a.pw);
      if (u >= 0.72) { this._setSm(a, 1); a.md = 1; a.rs = r + 2.2; a.sp = 1; return false; } // hurry past along the rim, if there is pavement for it
      if (u >= 0.45 && a.lane.side) {
        // over to the other pavement, if that gets round it
        const to = this._crossTo(a, this._across(a, a.x, a.z, hx * a.dir, hz * a.dir));
        if (to && Math.hypot(to[2] - S.x, to[3] - S.z) > r + 1.4 && this._crossOK(to, hx, hz, S)) {
          a.cross = { lane: to[0], i: to[1], x0: a.x, z0: a.z, x1: to[2], z1: to[3], t: 0, dur: Math.max(1, Math.hypot(to[2] - a.x, to[3] - a.z) / a.v0), wait: 1.5 };
          return false;
        }
      }
      this._flip(a); // or back the way they came
      return false;
    }
    if ((sm === 1 || sm === 2) && dc < r - 0.3) { this._setSm(a, 0); a.sp = 1; return false; } // ended up inside (a lane hop, a push): out again, as if just arrived
    if (sm === 1) {
      if (out > 0.2) { this._setSm(a, 0); a.sp = 1; return false; } // turned away (end of the lane)
      let stop = dc <= a.rs;
      if (!stop && a.md === 0) { const w = this.wat; for (let i = 0; i < w.length; i++) { const ddx = w[i].x - a.x, ddz = w[i].z - a.z; if (ddx * ddx + ddz * ddz < 1.21) { stop = true; break; } } } // (a queue of watchers, not a heap)
      if (!stop) { a.sp = 1; return false; }
      if (a.md === 1) {
        if (this._planArc(a, S, dc, dx, dz)) { a.ox = a.x - lx; a.oz = a.z - lz; a.lat = 0; this._setSm(a, 3); a.sp = a.arV / a.v0; }
        else { this._flip(a); this._setSm(a, 0); a.sp = 1; }
      } else {
        this._arrive(a, S, dc, dx, dz, out < 0 ? hx : -hx, out < 0 ? hz : -hz, lx, lz);
      }
      return false;
    }
    if (sm === 2 || sm === 5 || sm === 6) {
      a.sp = 0; a.hw = Math.atan2(-dx, -dz); a.hwOn = true;
      if (sm === 2) a.tl = a.lw ? -0.14 * (0.5 + 0.5 * Math.sin(this.t * 0.9 + a.wd * 40)) : 0; // leans in and out
      else if ((a.tm -= dt) <= 0 || (sm === 5 && live && !S.flee && a.wk)) {
        if (sm === 5 && live && !S.flee && a.wk) { if (out > 0) this._flip(a); a.rs = r + 1.1 + ((a.wd * 13.1) % 1) * 1.4; a.md = 0; this._setSm(a, 1); a.sp = 1; } // drifts back to the rim
        else { if (sm === 5 && out < 0) this._flip(a); this._setSm(a, 0); a.sp = sm === 5 ? 1.3 : 1; a.hwOn = false; }
      }
      return false;
    }
    if (sm === 3) {
      a.arP += (a.arV * dt) / a.arL;
      const P = Math.min(1, a.arP), th = a.ar0 + a.ard * P, px = a.ac + Math.sin(th) * a.arR, pz = a.az + Math.cos(th) * a.arR, sg = a.ard >= 0 ? 1 : -1;
      a.hw = Math.atan2(Math.cos(th) * sg, -Math.sin(th) * sg); a.hwOn = true; a.lat = 0; a.sp = a.arV / a.v0;
      if (P < 1) { a.ox = px - lx; a.oz = pz - lz; return false; }
      a.s = a.arS; this._lp(a.lane, a.s); a.ox = px - this._px; a.oz = pz - this._pz; a.x = px; a.z = pz;
      this._setSm(a, 0); a.sp = 1;
      return true;
    }
    if (sm === 4) {
      if (!live) { this._setSm(a, 0); a.sp = 1; }
      else if (!S.flee) {
        if (a.wk) { if (out > 0) this._flip(a); a.rs = r + 1.1 + ((a.wd * 13.1) % 1) * 1.4; a.md = 0; this._setSm(a, 1); a.sp = 1; } // back to the rim
        else { this._setSm(a, 0); a.sp = 1.2; }
      } else if (out < -0.25) { this._setSm(a, 5); a.tm = 3 + a.wd * 3; a.pose = 2; } // the lane turns back towards it: stop and look
      else if (dc >= r + 12 && !a.lkd && (a.wd * 13.7) % 1 < 0.25) { this._setSm(a, 5); a.lkd = true; a.tm = 2.5 + a.wd * 3; a.pose = a.wd < 0.5 ? 2 : 4; } // a few stop and look back
      else if (dc > r + 28) { this._setSm(a, 0); a.sp = 1.2; }
      return false;
    }
    if (sm === 7) {
      if (dc >= a.rs) {
        if (!bike && a.wd < a.pw) this._arrive(a, S, dc, dx, dz, out < 0 ? hx : -hx, out < 0 ? hz : -hz, lx, lz); else { this._setSm(a, 0); a.sp = 1; }
      } else if ((a.tm -= dt) <= 0) this._stepOut(a, S, dx, dz, lx, lz); // the lane does not lead out after all
      return false;
    }
    if (sm === 9) {
      // a few steps across the ground to a free place at the rim
      const ex = a.gx - a.x, ez = a.gz - a.z, el = Math.sqrt(ex * ex + ez * ez);
      if (el < 0.12) { this._stand(a); return false; }
      a.ox += (ex / el) * Math.min(el, 1.3 * dt); a.oz += (ez / el) * Math.min(el, 1.3 * dt); a.lat = 0; a.sp = 1.3 / a.v0;
      a.hw = Math.atan2(ex, ez); a.hwOn = true;
      return false;
    }
    return false;
  }

  // ------------------------------------------------------------ groups and the stage
  _gWt(g, on) {
    if (g.wt === on) return;
    g.wt = on;
    for (const m of g.members) { if (on) { m.s0 = m.style; if (this.rnd() < 0.3) m.style = 7; m.turn = this.rnd() * 1.2; } else if (m.s0 !== undefined) { m.style = m.s0; m.s0 = undefined; } }
  }
  /** Is the straight way from (x0, z0) to (x1, z1) on pavement all along, and never nearer to the stage's middle than dmin? */
  _pathOK(x0, z0, x1, z1, S, dmin) {
    const G = this._good(), n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0)));
    for (let k = 1; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, z = z0 + ((z1 - z0) * k) / n;
      if (!G[this._cls(x, z)] || (x - S.x) ** 2 + (z - S.z) ** 2 < dmin * dmin || !this._room(x, z, 0.3)) return false;
    }
    return true;
  }
  _gTaken(g, cx, cz) {
    for (const g2 of g.o.groups) if (g2 !== g && g2.shown) { const x = g2.sm ? g2.dx : g2.x, z = g2.sm ? g2.dz : g2.z; if ((x - cx) ** 2 + (z - cz) ** 2 < 9) return true; }
    return false;
  }
  /** Decide where the group should be now (S: the live stage, null to go home) and set it walking. */
  _gPlan(g, S) {
    if (g.hx === undefined) { g.hx = g.x; g.hz = g.z; for (const m of g.members) { m.hx = m.x; m.hz = m.z; } for (const b of g.bikes) { b.hx = b.x; b.hz = b.z; } }
    const R = g.R || 1.5;
    let want = 0;
    if (S) {
      const dh = Math.hypot(g.hx - S.x, g.hz - S.z);
      if (S.flee && dh < S.r + 8) want = 2; else if (dh < S.r + R + 0.6) want = 1;
      this._gWt(g, want === 0 && dh < S.r + 14); // outside and near: they turn to watch
    }
    let nx = g.hx, nz = g.hz;
    if (want) {
      // the nearest free place on the rim (small turns first, then further out), off the lanes if there is room, and a way there that stays on
      // pavement and never goes nearer the middle than the group is now
      const rr0 = want === 2 ? S.r + 13 + R : S.r + R + 1.1, a0 = Math.atan2(g.hx - S.x, g.hz - S.z), d0 = Math.hypot(g.x - S.x, g.z - S.z);
      let found = false;
      for (let pass = 0; pass < 2 && !found; pass++) for (let e = 0; e < 5 && !found; e++) for (let k = 0; k < 17 && !found; k++) { // (the way there is checked, so far round the circle is fine; a group right at the middle tries every side)
        const off = ((k + 1) >> 1) * 0.35 * (k & 1 ? 1 : -1), rr = rr0 + e * 1.6, cx = S.x + Math.sin(a0 + off) * rr, cz = S.z + Math.cos(a0 + off) * rr;
        if (!this._ringOK(cx, cz, R + 0.3) || this._gTaken(g, cx, cz) || (pass === 0 && lanesWithin(g.o, cx, cz, R + 0.3))) continue;
        if (!this._pathOK(g.x, g.z, cx, cz, S, Math.min(d0, S.r + 0.5) - 0.4)) continue;
        nx = cx; nz = cz; found = true;
      }
      if (!found) return; // nowhere clear to stand: they stay (a limit)
    } else if (!g.sm) return; // at home and nothing to do
    const ddx = nx - g.x, ddz = nz - g.z, L = Math.hypot(ddx, ddz);
    if (L < 0.2) { if (g.sm) { g.sm = want ? 2 : 0; } return; }
    g.dx = nx; g.dz = nz; g.run = want === 2; g.home = want === 0; g.pr = 0; g.L = L; g.fx = g.x; g.fz = g.z;
    for (const m of g.members) { m.sx = m.x; m.sz = m.z; }
    for (const b of g.bikes) { b.sx = b.x; b.sz = b.z; }
    g.sm = 1;
  }
  _gStage(g, dt) {
    const S = this.sg;
    if (S) {
      g.back = 0;
      const key = S.id * 1000 + S.mid;
      if (g.mid !== key) { g.mid = key; this._gPlan(g, S); }
    } else if (g.back && (g.tl -= dt) <= 0) {
      g.back = 0; g.mid = -1;
      this._gWt(g, false);
      this._gPlan(g, null);
    }
    if (g.sm === 1) this._gMove(g, dt);
  }
  /** Everybody of the group walks (or runs) the same way, keeping their formation; at the end they face the stage. */
  _gMove(g, dt) {
    const sp = g.run ? 4.6 : 1.5, W = this.W, S = this.sg || this.sgLast;
    g.pr += sp * dt;
    const f = Math.min(1, g.pr / g.L), ddx = g.dx - g.fx, ddz = g.dz - g.fz, hd = Math.atan2(ddx, ddz);
    g.x = g.fx + ddx * f; g.z = g.fz + ddz * f;
    for (const m of g.members) {
      m.x = m.sx + ddx * f; m.z = m.sz + ddz * f; m.y = this._feet(m, m.x, m.z, m.sc, dt);
      let dh = hd - m.hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); m.hd += clamp(dh, -7 * dt, 7 * dt);
      m.ph += dt * (3.2 + sp * 1.9);
      const an = m.pp.anim.array, o = m.slot * 4;
      an[o] = m.ph; an[o + 1] = Math.min(1.25, (0.45 + sp * 0.11) * (g.run ? 1.5 : 1)); an[o + 2] = g.run ? 5 : 0; an[o + 3] = g.run ? 0.14 : 0;
      m.pp.put(m.slot, m.x, m.y, m.z, m.hd, m.sc);
    }
    for (const b of g.bikes) { b.x = b.sx + ddx * f; b.z = b.sz + ddz * f; b.vp.put(b.slot, b.x, this._wheels(null, b.x, b.z, b.hd, 0.6, 0), b.z, b.hd, 1); }
    if (f < 1) return;
    g.sm = g.home ? 0 : 2;
    this.pkDirty = true; // (its bikes stand somewhere else now)
    if (g.home) { g.x = g.hx; g.z = g.hz; for (const m of g.members) { m.x = m.hx; m.z = m.hz; } for (const b of g.bikes) { b.x = b.hx; b.z = b.hz; } }
    else { this._gWt(g, true); for (const m of g.members) { m.want = Math.atan2(S.x - m.x, S.z - m.z) + (this.rnd() - 0.5) * 0.5; m.turn = 2 + this.rnd() * 4; } }
  }
  /** Put a group straight back where it came from (the street changes under it). */
  _gSnap(g) {
    if (g.hx === undefined) return;
    g.x = g.hx; g.z = g.hz;
    for (const m of g.members) { m.x = m.hx; m.z = m.hz; }
    for (const b of g.bikes) { b.x = b.hx; b.z = b.hz; }
    g.sm = 0; g.back = 0; g.mid = -1; this._gWt(g, false);
  }

  /**
   * What stands in the way within r of (x, z), for a scene that needs free ground: fills `out` (a plain array the caller keeps; it is emptied
   * first) with [x, z, radius, height, x, z, radius, height, ...] and returns the number of circles. Parked cars (three circles along the
   * car), lamp posts, the parked bikes of groups (two circles), standing members of groups, and everyone who stands still right now:
   * waiting vehicles (cars three circles, trams two per section, cyclists one) and watchers. Things that are not up yet are not listed.
   */
  obstacles(x, z, r, out) {
    out.length = 0;
    const lr = [0.2, 0.35, 0.15, 0.2], lh = [5.1, 8.8, 3.5, 5.1];
    const car = (cx, cz, hd) => { const sx = Math.sin(hd), sz = Math.cos(hd); for (let k = -1; k <= 1; k++) this._ob(out, x, z, r, cx + sx * 1.35 * k, cz + sz * 1.35 * k, 0.95, 1.5); };
    for (const o of this.owners.values()) {
      if (!o.on || (o.cx - x) ** 2 + (o.cz - z) ** 2 > (o.r + r + 10) ** 2) continue; // (an owner that is not up has nothing standing)
      const wait = o.pend.length ? new Set(o.pend) : null;
      for (let i = 0; i < o.parked.length; i += 4) if (!(wait && wait.has(i))) car(o.parked[i], o.parked[i + 1], o.parked[i + 2]);
      for (let i = 0; i < o.lamps.length; i += 4) if (!(wait && wait.has(-1 - i))) { const k = o.lamps[i + 3]; this._ob(out, x, z, r, o.lamps[i], o.lamps[i + 1], lr[k] ?? 0.2, lh[k] ?? 5); }
      for (const g of o.groups) {
        if (!g.shown) continue;
        for (const b of g.bikes) { const sx = Math.sin(b.hd) * 0.45, sz = Math.cos(b.hd) * 0.45; this._ob(out, x, z, r, b.x + sx, b.z + sz, 0.4, 1.25); this._ob(out, x, z, r, b.x - sx, b.z - sz, 0.4, 1.25); }
        if (g.sm !== 1) for (const m of g.members) this._ob(out, x, z, r, m.x, m.z, 0.38, m.sc * 2.2);
      }
    }
    for (const a of this.agents) {
      if (a.dead || !a.vis || a.down) continue;
      const dx = a.x - x, dz = a.z - z;
      if (dx * dx + dz * dz > (r + 30) * (r + 30)) continue;
      if (a.kind === PED) { if (a.v < 0.15 && !a.cross) this._ob(out, x, z, r, a.x, a.z, 0.38, a.sc * 2.2); }
      else if (a.v < 0.5) {
        if (a.kind === CAR_) car(a.x, a.z, a.hd);
        else if (a.kind === BIKE_) this._ob(out, x, z, r, a.x, a.z, 0.55, 1.8);
        else if (a.kind === TRAM_) for (let q = 0; q < TRAM_N; q++) { this._lp(a.lane, a.s - a.dir * q * TRAM_SEG); const cx = this._px + a.ox, cz = this._pz + a.oz; for (let k = -1; k <= 1; k += 2) this._ob(out, x, z, r, cx + this._ux * 1.3 * k, cz + this._uz * 1.3 * k, 1.25, 3); }
      }
    }
    return out.length >> 2;
  }
  _ob(out, x, z, r, px, pz, rad, h) { const dx = px - x, dz = pz - z; if (dx * dx + dz * dz < (r + rad) * (r + rad)) out.push(px, pz, rad, h); }

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
      const G = this.W.ground;
      for (const o of this.owners.values()) {
        const near = Math.hypot(o.cx - x, o.cz - z) < R + o.r;
        // (an owner whose tile has its raster fills once its lanes are clear: _clearStep, a frame or two later)
        if (near && !o.on && (o.clean === 1 || this.cjo === o && this.cj) && G && G.ready(o.cx, o.cz)) continue;
        if (near && !o.on) this._fill(o);
        else if (!near && o.on) this._empty(o);
        else if (o.on && o.pend.length) this._reveal(o);
        if (o.dirty && (this.tick & 127) === 1) o.retry = true; // (lanes blocked while somebody was on them: built again once nobody is)
      }
      if (this.agents.length > 64 && (this.tick & 255) === 1) this.agents = this.agents.filter((a) => !a.dead);
    }
    this._clearStep(x, z, 2); // (lane clearing: at most 2 ms a frame, resumable)
    // who is where: a grid for looking ahead
    const head = this.head, A = this.agents, n = A.length, gx0 = x - (GN * CELL) / 2, gz0 = z - (GN * CELL) / 2, rs = this.riders;
    // (after the agents, the grid also holds the members and parked bikes of the groups on show, as entries n + k: their place is in
    // this.gp, 2 numbers each, and walkers step round them; nothing else looks at entries past n)
    let ng = 0;
    for (const o of this.owners.values()) if (o.on) for (const g of o.groups) if (g.shown) ng += g.members.length + g.bikes.length * 2;
    if (this.next.length < n + ng) this.next = new Int32Array((n + ng) * 2);
    if (this.gp.length < ng * 2) this.gp = new Float32Array(ng * 4);
    const next = this.next, gp = this.gp;
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
    let k0 = 0;
    const gIn = (px, pz) => {
      const ci = Math.floor((px - gx0) / CELL), cj = Math.floor((pz - gz0) / CELL), q = n + k0;
      gp[k0 * 2] = px; gp[k0 * 2 + 1] = pz; k0++;
      if (ci < 0 || cj < 0 || ci >= GN || cj >= GN) return;
      const c = cj * GN + ci;
      next[q] = head[c]; head[c] = q;
    };
    if (ng) for (const o of this.owners.values()) if (o.on) for (const g of o.groups) if (g.shown) {
      for (const m of g.members) gIn(m.x, m.z);
      for (const b of g.bikes) { const sx = Math.sin(b.hd) * 0.45, sz = Math.cos(b.hd) * 0.45; gIn(b.x + sx, b.z + sz); gIn(b.x - sx, b.z - sz); }
    }
    /** No vehicle (other than agent `self`) within r of (px, pz)? (the grid of this frame) */
    const vFree = (px, pz, self, r, own = null) => { // (own: the asker's lane, whose vehicles are its own queue, left out)
      const ci = Math.floor((px - gx0) / CELL), cj = Math.floor((pz - gz0) / CELL);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const cc = ci + di, cr = cj + dj;
        if (cc < 0 || cr < 0 || cc >= GN || cr >= GN) continue;
        for (let q = head[cr * GN + cc]; q >= 0; q = next[q]) { if (q === self || q >= n) continue; const b = A[q]; if (b.kind !== PED && !b.dead && b.lane !== own && (b.x - px) ** 2 + (b.z - pz) ** 2 < r * r) return false; }
      }
      return true;
    };
    /**
     * May vehicle `self` (agent a) enter lane l2 at its end e2? Only what is ON l2 near that end, or heading along l2 there (a vehicle on
     * a lane that leads into it, or merges), within the gap the asker needs, keeps it out; traffic the other way or across does not.
     * Two that wait for each other to enter: the one earlier in the list goes (the later one, waiting itself, is let by).
     */
    const joinFree = (a, self, l2, e2, gap) => {
      const i2 = e2 ? l2.n - 1 : 0, j2 = e2 ? l2.n - 2 : 1, px = l2.pts[i2 * 2], pz = l2.pts[i2 * 2 + 1];
      const ux0 = l2.pts[j2 * 2] - px, uz0 = l2.pts[j2 * 2 + 1] - pz, ul = Math.hypot(ux0, uz0) || 1, ux = ux0 / ul, uz = uz0 / ul;
      const ci = Math.floor((px - gx0) / CELL), cj = Math.floor((pz - gz0) / CELL);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const cc = ci + di, cr = cj + dj;
        if (cc < 0 || cr < 0 || cc >= GN || cr >= GN) continue;
        for (let q = head[cr * GN + cc]; q >= 0; q = next[q]) {
          if (q === self || q >= n) continue;
          const b = A[q];
          if (b.kind === PED || b.dead || b.lane === a.lane) continue;
          if (b.lane === l2) { const ds = e2 ? l2.len - b.s : b.s; if (ds < gap && ds > -gap) return false; continue; }
          const dx = b.x - px, dz = b.z - pz;
          if (dx * dx + dz * dz > gap * gap || Math.sin(b.hd) * ux + Math.cos(b.hd) * uz < 0.5) continue; // (far, or not going this way)
          if (q > self && b.jw > 0) continue; // (waiting to enter as well, later in the list: it lets this one go first)
          return false;
        }
      }
      return true;
    };
    // the actors on stage, and the box they are all in (most figures are nowhere near it)
    const B = this.blockers, Z = this.zones;
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (const b of B) { if (b.x < bx0) bx0 = b.x; if (b.x > bx1) bx1 = b.x; if (b.z < bz0) bz0 = b.z; if (b.z > bz1) bz1 = b.z; }
    bx0 -= 14; bx1 += 14; bz0 -= 14; bz1 += 14;
    // the stage (a scene is playing): one box test per figure tells whether it is anywhere near
    const S = this.sg, hasS = S !== null, sx0 = hasS ? S.x0 : 0, sx1 = hasS ? S.x1 : 0, sz0 = hasS ? S.z0 : 0, sz1 = hasS ? S.z1 : 0;
    const hzPar = ((this.t * 1.7) | 0) & 1;
    for (let i = 0; i < n; i++) {
      const a = A[i];
      if (a.dead) continue;
      const lane = a.lane;
      // ---- where it is on its lane
      let f = a.s / lane.step, k = Math.floor(f);
      if (k >= lane.n - 1) k = lane.n - 2;
      if (k < 0) k = 0;
      const t = f - k, p = lane.pts, x0 = p[k * 2], z0 = p[k * 2 + 1], ex = p[k * 2 + 2] - x0, ez = p[k * 2 + 3] - z0;
      let lx = x0 + ex * t, lz = z0 + ez * t;
      if (lane.off) {
        // the lane gives way to what stands on it (see _clearLanes): its sideways offset here, blended in per walker
        const q = Math.round(a.s * 2), tg = lane.off[q < 0 ? 0 : q >= lane.off.length ? lane.off.length - 1 : q], e0 = Math.hypot(ex, ez) || 1;
        a.lo = (a.lo || 0) + clamp(tg - (a.lo || 0), -1.2 * dt, 1.2 * dt);
        lx -= (ez / e0) * a.lo; lz += (ex / e0) * a.lo;
      } else if (a.lo) a.lo = 0;
      const d2 = (lx - x) * (lx - x) + (lz - z) * (lz - z);
      if (!a.down) {
        if (d2 > R2) {
          if (!a.vis) continue;
          if (this.warm || !this._seen(lx, lz)) { this._hide(a); continue; } // out of range: gone, unless somebody could watch it go
        } else if (!a.vis) {
          if (!this.warm && this._seen(lx, lz)) continue; // in range, but it would be seen appearing: it waits
          a.pop = 0;
        }
      }
      const el = Math.hypot(ex, ez) || 1;
      let hx = (ex / el) * a.dir, hz = (ez / el) * a.dir;
      const inBox = a.x > bx0 && a.x < bx1 && a.z > bz0 && a.z < bz1;
      const nearS = hasS && a.x > sx0 && a.x < sx1 && a.z > sz0 && a.z < sz1;
      const inS = nearS && (a.x - S.x) * (a.x - S.x) + (a.z - S.z) * (a.z - S.z) < S.r2;

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
          // a scene is playing and the way over goes through its circle: hurry across, no time to look
          let kx = 1;
          if (nearS) {
            let hit = inS;
            if (!hit) { const ux = X.x1 - X.x0, uz = X.z1 - X.z0, tt = clamp(((S.x - X.x0) * ux + (S.z - X.z0) * uz) / (ux * ux + uz * uz || 1)), qx = X.x0 + ux * tt - S.x, qz = X.z0 + uz * tt - S.z; hit = qx * qx + qz * qz < (S.r + 1) * (S.r + 1); }
            if (hit) { kx = clamp(((1 - X.t) * X.dur) / 4.5, 2, 4.5); X.wait = 0; } // across within a few seconds
          }
          if (X.wait > 0) {
            // at the kerb, looking: is anything coming?
            X.wait -= dt;
            let coming = false;
            if (X.wait > 0) for (let q = 0; q < n && !coming; q++) { const b = A[q]; if (b.dead || !b.vis || b.kind === PED || b.v < 1) continue; const ddx = a.x - b.x, ddz = a.z - b.z, dd = Math.hypot(ddx, ddz); if (dd < 16 && (ddx * Math.sin(b.hd) + ddz * Math.cos(b.hd)) / (dd || 1) > 0.6) coming = true; }
            if (coming) { P.put(a.slot, a.x, this._feet(a, a.x, a.z, a.sc, dt), a.z, Math.atan2(X.x1 - X.x0, X.z1 - X.z0), a.sc); anim[a.slot * 4 + 1] = 0; continue; }
            X.wait = 0;
          }
          X.t += kx * dt / X.dur;
          const e = Math.min(1, X.t);
          a.x = X.x0 + (X.x1 - X.x0) * e; a.z = X.z0 + (X.z1 - X.z0) * e;
          a.hd = Math.atan2(X.x1 - X.x0, X.z1 - X.z0);
          a.v = a.v0 * kx;
          a.ph += dt * (3.2 + a.v * 1.9);
          P.put(a.slot, a.x, this._feet(a, a.x, a.z, a.sc, dt), a.z, a.hd, a.sc);
          const o = a.slot * 4;
          anim[o] = a.ph; anim[o + 1] = (0.45 + a.v * 0.11) * a.gait; anim[o + 2] = 0; anim[o + 3] = a.lean;
          if (e >= 1) {
            // arrived: carry on along the pavement there, the same way as before if that makes sense
            lane.owner.agents.delete(a); X.lane.owner.agents.add(a);
            a.lane = X.lane; a.s = clamp(X.i * X.lane.step, 0.1, X.lane.len - 0.1); a.ox = a.oz = 0; a.lat = 0; a.lo = 0; a.cross = null;
            const j = Math.min(X.lane.n - 2, X.i), qx = X.lane.pts[j * 2 + 2] - X.lane.pts[j * 2], qz = X.lane.pts[j * 2 + 3] - X.lane.pts[j * 2 + 1];
            a.dir = qx * hx + qz * hz >= 0 ? 1 : -1;
          }
          continue;
        }
        // ---- now and then: cross over. At a zebra after looking; anywhere, sometimes, without
        if ((a.think -= dt) <= 0) {
          a.think = 0.5;
          if (lane.side && a.vis && d2 < 400 * 400 && !nearS && !a.sm) {
            const zebra = lane.zeb && lane.zeb.some((s) => Math.abs(s - a.s) < 1.6);
            if (zebra ? this.rnd() < 0.06 : this.rnd() < this.jay * 0.5) {
              const to0 = this._across(a, a.x, a.z, ex / el, ez / el);
              const wt = to0 && (zebra || this.rnd() < 0.35) ? 3.5 : 0, to = this._crossTo(a, to0); // (the same draws as before; a way through what stands at the kerb)
              if (to) { a.cross = { lane: to[0], i: to[1], x0: a.x, z0: a.z, x1: to[2], z1: to[3], t: 0, dur: Math.max(1, Math.hypot(to[2] - a.x, to[3] - a.z) / a.v0), wait: wt }; continue; }
            }
          }
        }
        // ---- the lane is blocked a step ahead (furniture arrived while somebody was on it): a dead end for now, turn round
        if (lane.blk && !a.sm) { const B_ = lane.blk, q0 = Math.round(a.s * 2), q1 = Math.round((a.s + a.dir * 1.2) * 2); if (q1 >= 0 && q1 < B_.length && B_[q1] && !B_[q0 < 0 ? 0 : q0 >= B_.length ? B_.length - 1 : q0] && this.t - (a.tf ?? -9) > 2) { this._flip(a); hx = -hx; hz = -hz; this._fp = false; } } // (the same 2 s between turns as the avoidance: no back and forth)
        // ---- the scene's stage: watch it, go round, run away
        if (a.sm !== 0 || nearS) { if (this._wStage(a, dt, hx, hz, lx, lz)) continue; if (this._fp) { hx = -hx; hz = -hz; this._fp = false; } }
        // ---- people on stage are in the way: step round them, or wait
        let side = 0, slow = 1, fol = Infinity, wl = 0, onc = -1, bes = -1;
        if (inBox) for (const b of B) {
          const bx = b.x - a.x, bz = b.z - a.z, fw = bx * hx + bz * hz;
          if (fw < -0.3 || fw > 2.6 + b.r) continue;
          const lat = bx * -hz + bz * hx; // to the right of the way they walk
          if (Math.abs(lat) > 0.75 + b.r) continue;
          side += lat >= 0 ? -1 : 1;
          if (fw < 0.65 + b.r && Math.abs(lat) < 0.45 + b.r) fol = 0; // (right in front of them: stop, the scene goes first)
          else if (fw < 1.1 + b.r) slow = 0.25;
        }
        // ---- other walkers and the members of groups: step away from oncoming ones (straight ahead: to one's own right; both do,
        // so they part), follow or
        // overtake on the left those ahead, step round who stands; no room: wait, and after a while turn round. Nothing is drawn by
        // lot here: the waiting time comes from the walker's place in the list.
        if (a.vis && (a.sm === 0 || a.sm === 1 || a.sm === 4 || a.sm === 7)) {
          const ci0 = Math.floor((a.x - gx0) / CELL), cj0 = Math.floor((a.z - gz0) / CELL);
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const cc = ci0 + di, cr = cj0 + dj;
            if (cc < 0 || cr < 0 || cc >= GN || cr >= GN) continue;
            for (let q = head[cr * GN + cc]; q >= 0; q = next[q]) {
              if (q === i) continue;
              const gq = q >= n, b = gq ? null : A[q];
              if (!gq && (b.kind !== PED || b.down > 0)) continue;
              const bx = (gq ? gp[(q - n) * 2] : b.x) - a.x, bz = (gq ? gp[(q - n) * 2 + 1] : b.z) - a.z;
              if (bx > 3.2 || bx < -3.2 || bz > 3.2 || bz < -3.2) continue;
              const fw = bx * hx + bz * hz, lt = bx * -hz + bz * hx;
              if (fw < -0.25 || fw > 3 || lt > 0.8 || lt < -0.8) continue;
              // standing (a group, a watcher, someone lingering or looking back; not a walker who only waits a moment): round them
              if (gq || (b.v < 0.15 && (b.sm === 2 || b.sm === 5 || b.sm === 6))) { wl += lt >= 0 ? -0.6 : 0.6; if (fw < 0.8 && lt < 0.5 && lt > -0.5) fol = 0; continue; }
              const cs = Math.sin(b.hd) * hx + Math.cos(b.hd) * hz;
              if (cs < -0.3) { wl += lt > 0.1 ? -0.55 : 0.55; if (fw < 1.0 && lt < 0.45 && lt > -0.45) onc = q; } // coming the other way
              else if (fw < 0.15) { wl += lt >= 0 ? -0.4 : 0.4; if (lt < 0.5 && lt > -0.5) bes = q; } // beside, the same way: a little apart
              else { // going the same way, ahead: keep 0.7 m behind, or overtake on the left when faster
                if (fw < 1.5 && lt < 0.5 && lt > -0.5) fol = Math.min(fol, Math.max(0, b.v * cs * clamp((fw - 0.7) / 0.6, 0, 1.2)));
                if (a.v0 > b.v + 0.15 && fw < 2.6) wl -= 0.6;
              }
            }
          }
          if (wl !== 0) {
            wl = clamp(wl, -0.7, 0.7);
            // the side step must be ground a person may stand on (W.ground), else no step and slower
            const G = W.ground, tl = clamp(side * 1.3 + wl, -1.3, 1.3);
            const hs = G ? G.at(lx + a.ox - hz * tl, lz + a.oz + hx * tl, 0.25) : 0;
            if (hs !== hs) { wl = 0; fol = onc >= 0 ? 0 : Math.min(fol, bes >= 0 && i > bes ? A[bes].v * 0.5 : 0.6); } // (no room to step aside: wait for the other to pass, drop behind the one beside, or slow down)
          }
          // two who meet with no room to pass: the one later in the list turns round at once, the other waits for it
          const mayTurn = this.t - (a.tf ?? -9) > 2; // (one who just turned round waits rather than turn again: no back and forth)
          if (onc >= 0 && fol < 0.2 && a.sm === 0 && i > onc && mayTurn) { this._flip(a); hx = -hx; hz = -hz; fol = Infinity; wl = 0; a.bw = 0; }
          else if (fol < 0.2 && a.sm === 0 && mayTurn) { if ((a.bw = (a.bw || 0) + dt) > 1.2 + (i & 3) * 0.2) { a.bw = 0; this._flip(a); hx = -hx; hz = -hz; fol = Infinity; wl = 0; } }
          else a.bw = 0;
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
        let want = a.sm === 0 || a.sm === 1 || a.sm === 4 || a.sm === 7 ? clamp(clamp(side, -1, 1) * 1.3 + wl, -1.3, 1.3) : a.sm === 3 || a.sm === 9 ? 0 : a.jl;
        // a side step only onto ground a person may stand on (W.ground): else half of it, else stay on the line one walks
        if (W.ground && a.vis && (want > 0.05 || want < -0.05) && (want - a.lat > 0.02 || want - a.lat < -0.02)) {
          const G = W.ground, bx = lx + a.ox, bz = lz + a.oz;
          let h = G.at(bx - hz * want, bz + hx * want, 0.25);
          if (h !== h) { want *= 0.5; h = G.at(bx - hz * want, bz + hx * want, 0.25); if (h !== h) { want = a.lat > 0 === want > 0 && Math.abs(a.lat) < Math.abs(want) ? a.lat : 0; fol = Math.min(fol, onc >= 0 ? 0 : 0.8); } }
        }
        const lat0 = a.lat;
        a.lat += clamp(want - a.lat, -1.6 * dt, 1.6 * dt);
        a.lv = dt > 0 ? Math.abs(a.lat - lat0) / dt : 0; // (a side step: the legs walk it, see below)
        a.v += clamp(Math.min(a.v0 * slow * a.sp, fol) - a.v, -6 * dt, (a.sm ? 6 : 3) * dt);
      } else {
        // ---- vehicles look ahead and brake for whatever is in their way
        let target = a.v0, sT = 1e9;
        if (a.pave && (a.sm !== 0 || nearS)) { if (this._wStage(a, dt, hx, hz, lx, lz)) continue; if (this._fp) { hx = -hx; hz = -hz; this._fp = false; } target = a.v0 * a.sp; } // (fat-bikes on the pavement go round the stage like walkers)
        a.sb = false;
        if (a.vis) {
          const car = a.kind === CAR_, tram = a.kind === TRAM_;
          const reach = tram ? 9 + a.v * 1.2 : car ? 6.6 + a.v * 0.9 : 3.2 + a.v * 0.5, px = a.x + hx * reach * 0.5, pz = a.z + hz * reach * 0.5;
          const ci = Math.floor((px - gx0) / CELL), cj = Math.floor((pz - gz0) / CELL), span = tram ? 2 : 1;
          let block = 1e9, bv = 0, who = null;
          for (let dj = -span; dj <= span; dj++) for (let di = -span; di <= span; di++) {
            const cc = ci + di, cr = cj + dj;
            if (cc < 0 || cr < 0 || cc >= GN || cr >= GN) continue;
            for (let q = head[cr * GN + cc]; q >= 0; q = next[q]) {
              if (q === i || q >= n) continue; // (q >= n: a group's member on the pavement)
              const b = A[q], bx = b.x - a.x, bz = b.z - a.z, fw = bx * hx + bz * hz;
              if (fw < 0.4 && b.lane === lane && b.kind === a.kind && !tram) { const ds = (b.s - a.s) * a.dir; if ((ds > 0 || (ds === 0 && q < i)) && ds < 6) { if (block > 0.1) { block = 0.1; bv = 0; who = null; } } continue; } // (two of one lane inside each other: the one behind waits, the one in front drives out)
              if (fw < 0.4 || fw > reach) continue;
              const lat = Math.abs(bx * hz - bz * hx), lim = b.kind === PED ? (((100 >> b.sm) & 1) === 1 ? 0.8 : 1.25) : b.kind === BIKE_ ? 1.1 : car || tram ? 1.75 : 1.3;
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
          // the end of the lane ahead: the lane it goes on along is picked now, and if that lane's start is not free the vehicle brakes to
          // stop at the end (instead of stopping dead there)
          if (!a.pave) {
            const rem = a.dir > 0 ? lane.len - a.s : a.s;
            if (rem < reach + 4) {
              if (a.nxL !== lane) { a.nx = this._onward(a); a.nxL = lane; }
              const gap = tram ? 7 : car ? 7.2 : 2.8;
              if (a.nx && !joinFree(a, i, a.nx[0], a.nx[1], tram ? 8 : car ? 6 : 2.5) && rem + gap < block) { block = Math.max(0.1, rem + gap - 0.3); bv = 0; who = null; }
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
            if (!tram && fw > 0 && !inS && dd < q.r + reach && dd - q.r < block) { block = Math.max(0.1, dd - q.r); bv = 0; who = null; } // (inside a scene's circle they drive on out rather than stop at the edge of a closed stretch)
          }
          // the edge of the scene's stage: stop at the rim and wait (a car's nose a couple of metres short of it); inside the circle they just drive out
          if (nearS && !inS && !a.pave) {
            const sdx = S.x - a.x, sdz = S.z - a.z, fw = sdx * hx + sdz * hz;
            if (fw > 0) {
              const lat = Math.abs(sdx * hz - sdz * hx), lim = S.r + (car || tram ? 1.1 : 0.5);
              if (lat < lim) {
                const sB = Math.max(0.05, fw - Math.sqrt(lim * lim - lat * lat)), sGap = tram ? 4.8 : car ? 4.6 : 1.8;
                if (sB < sGap + 12) sT = sB < sGap ? 0 : Math.min(a.v0, (sB - sGap) * 1.2);
                a.sb = sB < sGap + 3.5;
              }
            }
          }
          // a vehicle inside a closed stretch leaves along its lane if anybody can see it; it is only removed where nobody would notice
          if (inside && (this.warm || !this._seen(a.x, a.z))) { this._free(a); continue; }
          if (block < 1e9 && a.ghost <= 0) {
            const gap = tram ? 7 : car ? 7.2 : 2.8; // (a car keeps room to stop behind one that stops dead at a lane end: 7.2 m centre to centre)
            target = Math.min(a.v0, block < gap ? 0 : bv + (block - gap) * 1.2);
            // no room left and still rolling: an unwary walker in the road gets knocked over, now and then
            if (who && who.kind === PED && who.cross && !who.cross.wait && !who.cross.hit && block < (car ? 4.6 : 2.3) && a.v > 2.4 && !tram && !a.pave && !nearS && this.t - this.bonkAt > 22 && d2 < 160 * 160) { // (no bonks inside a scene's stage)
              this.bonkAt = this.t;
              const X = who.cross, fly = clamp(a.v * (car ? 0.45 : 0.25), 0.8, 3.2), sd = (who.x - a.x) * hz - (who.z - a.z) * hx >= 0 ? 1 : -1;
              who.fall = { x0: who.x, z0: who.z, vx: hx * fly + hz * sd * 1.1, vz: hz * fly - hx * sd * 1.1, up: car ? 1.7 : 0.9, fly: 0.75, dur: 2.9, to: { lane: X.lane, i: X.i, x1: X.x1, z1: X.z1 } };
              who.down = 2.9; who.cross = null;
              a.v *= 0.25;
              if (this.onBonk) this.onBonk(who.x, W.hAt(who.x, who.z), who.z, !car);
            }
          }
          // stuck for a long time: nobody drives through anything. Out of sight (here and at its lane's start, which is free), it leaves
          // the jam and comes again at the start of its lane; in sight it waits (hazard lights), after 20 s it turns into the lane the
          // other way if there is one beside it, else it keeps waiting until nobody sees it go
          if (a.v < 0.3 && target < 0.3) {
            if (hasS && (a.x - S.x) * (a.x - S.x) + (a.z - S.z) * (a.z - S.z) < S.far2) a.wait = 0; // (near a scene a queue waits)
            else a.wait += dt;
            // (a car standing in a tram's way is told so, and moves on from where nobody sees it after 2 s instead of 6)
            if (tram && who && who.kind === CAR_ && a.wait > 3) who.trw = this.t;
            if ((a.wait > 6 || (car && a.wait > 2 && this.t - (a.trw ?? -9) < 1)) && this.t - lane.heldAt > 0.5) {
              const si = a.dir > 0 ? 0 : lane.n - 1, sx0 = lane.pts[si * 2], sz0 = lane.pts[si * 2 + 1], g0 = tram ? 30 : car ? 6.5 : 2.5;
              if ((this.warm || (!this._seen(a.x, a.z) && !this._seen(sx0, sz0))) && vFree(sx0, sz0, i, g0)) { a.s = a.dir > 0 ? 0 : lane.len; a.pop = 0; a.ox = a.oz = 0; a.first = true; a.wait = 0; a.v = 0; continue; }
              // or further on along its lane, past what holds it, where nobody sees it go or come (a tram's last way out: it cannot turn)
              const s2 = a.s + a.dir * (tram ? 45 : 25);
              if (s2 > 5 && s2 < lane.len - 5 && !this.warm) { this._lp(lane, s2); const x2 = this._px, z2 = this._pz; if (!this._seen(a.x, a.z) && !this._seen(x2, z2) && vFree(x2, z2, i, g0)) { a.s = s2; a.pop = 0; a.ox = a.oz = 0; a.first = true; a.wait = 0; a.v = 0; continue; } }
              if (a.wait > 20 && !tram && this._uturn(a, hx, hz)) { a.wait = 0; continue; }
            }
          } else a.wait = 0;
          if (a.ghost > 0) a.ghost -= dt;
          // waiting at the rim: a long wait puts a car's hazard lights on; a cyclist may turn round instead of waiting
          if (a.sb && a.v < 0.3) a.sbT += dt; else a.sbT = 0;
          if (a.sb && a.kind === BIKE_ && a.sbT > 0.5 + ((a.wd * 17.3) % 1) * 1.6 && a.sg !== S.id) {
            a.sg = S.id;
            if (a.wd >= 0.35 + 0.6 * a.pw && this._uturn(a, hx, hz)) continue;
          }
        }
        if (sT < target) target = sT;
        if (a.hold > 0) { a.hold -= dt; target = 0; } // (the scene is over: the queue pulls away one after another)
        if (a.kind === CAR_) {
          const hz_ = a.sbT > 6 || (a.hz && (a.sb || a.hold > 0 || a.v < 0.5));
          if (hz_ !== a.hz) { a.hz = hz_; if (!hz_) { this.cars.c2.array[a.slot * 3 + 1] = 0; this.cars.c2.needsUpdate = true; } }
          if (a.hz && this.cars.c2.array[a.slot * 3 + 1] !== hzPar) { this.cars.c2.array[a.slot * 3 + 1] = hzPar; this.cars.c2.needsUpdate = true; }
        }
        a.v += clamp(target - a.v, -(a.kind === CAR_ ? 12 : 9) * dt, (a.kind === TRAM_ ? 1.2 : 2.6) * dt);
      }
      // ---- move on
      a.s += a.sm === 3 || a.sm === 9 ? 0 : a.dir * a.v * dt;
      if (a.s > lane.len || a.s < 0) {
        const on = a.kind !== PED && !a.pave && a.nxL === lane ? a.nx : this._onward(a);
        if (on && a.kind !== PED && !a.pave && !joinFree(a, i, on[0], on[1], a.kind === CAR_ ? 6 : a.kind === TRAM_ ? 8 : 2.5)) {
          // a vehicle joins a lane only when its start is free: it waits at the end, having braked for it (and, waiting long where nobody
          // sees, starts its lane again)
          a.s = clamp(a.s, 0, lane.len); a.v = Math.min(a.v, 0.2); a.jw = (a.jw || 0) + dt;
          const si = a.dir > 0 ? 0 : lane.n - 1;
          if (a.jw > 6 && (this.warm || (!this._seen(lx, lz) && !this._seen(p[si * 2], p[si * 2 + 1]))) && vFree(p[si * 2], p[si * 2 + 1], i, a.kind === CAR_ ? 6 : 2.5)) { a.s = a.dir > 0 ? 0 : lane.len; a.pop = 0; a.ox = a.oz = 0; a.first = true; a.jw = 0; }
          else if (a.jw > 20 && a.kind !== TRAM_ && this._uturn(a, hx, hz)) a.jw = 0; // (in sight for long: into the lane the other way, if one is beside it)
          continue;
        }
        a.nxL = null; a.nx = null;
        if (on) {
          const [l2, e2] = on;
          // carry the small jump between the two lanes as an offset that melts away
          const i2 = e2 ? l2.n - 1 : 0;
          a.ox += lx - l2.pts[i2 * 2]; a.oz += lz - l2.pts[i2 * 2 + 1]; a.held = false;
          lane.owner.agents.delete(a); l2.owner.agents.add(a);
          a.lane = l2; a.dir = e2 ? -1 : 1; a.s = e2 ? l2.len : 0; a.lo = 0; a.jw = 0; // (lx held the old lane's offset: it is in ox now)
        } else if (a.kind === PED || a.pave) { a.dir = -a.dir; a.lat = -a.lat; a.s = clamp(a.s, 0, lane.len); a.tf = this.t; } // dead end: turn round
        else {
          // nowhere to go: start the lane again, but only if nobody sees it leave and come back; otherwise wait at the end
          const si = a.dir > 0 ? 0 : lane.n - 1;
          if ((this.warm || (!this._seen(lx, lz) && !this._seen(p[si * 2], p[si * 2 + 1]))) && vFree(p[si * 2], p[si * 2 + 1], i, a.kind === CAR_ ? 6 : a.kind === TRAM_ ? 8 : 2.5)) { a.s = a.dir > 0 ? 0 : lane.len; a.pop = 0; a.ox = a.oz = 0; a.first = true; a.held = false; a.ht = 0; }
          else {
            a.s = a.dir > 0 ? lane.len : 0; a.v = 0; a.held = true; lane.heldAt = this.t; a.ht = (a.ht || 0) + dt;
            // in sight at the end of its lane: a tram, after a stop as at a terminus, drives back the way it came (the same five sections,
            // from its last one on: nothing moves); a car or a cyclist turns into a lane the other way within 6 m (a smooth swing round)
            if (a.kind === TRAM_ && a.ht > 8) this._tramBack(a, hx, hz);
            else if (a.kind !== TRAM_ && a.ht > 3 && this._uturn(a, hx, hz, 36)) { a.held = false; a.ht = 0; }
            else if (a.kind !== TRAM_ && a.ht > 6) {
              // a dead end with no lane the other way (a small street has one car line): it turns round on its own lane, when nobody else is
              // on that lane (no queue to meet head-on); a queue waits until nobody sees its front go
              let alone = true;
              for (const b of lane.owner.agents) if (b !== a && b.lane === lane && !b.dead && b.kind !== PED) { alone = false; break; }
              if (alone) { a.dir = -a.dir; a.held = false; a.ht = 0; a.s = clamp(a.s, 0.1, lane.len - 0.1); }
            }
          }
        }
        continue;
      }
      const melt = Math.exp(-dt * 1.8);
      if (a.ut) { // swinging round onto the other lane: a steady sideways glide, not a snap
        const m = Math.hypot(a.ox, a.oz);
        if (m < 0.05) { a.ut = 0; a.ox = a.oz = 0; } else { const k = Math.max(0, m - 3.2 * dt) / m; a.ox *= k; a.oz *= k; }
      } else if (((620 >> a.sm) & 1) === 0) {
        // (not while standing, going round or stepping out: they keep their place off the lane). The offset melts only over ground a
        // person or vehicle may be on: across a wall, a parked car or a bench it waits (the walker steers on round it meanwhile)
        let ok = true;
        if (W.ground && a.kind === PED && (a.ox > 0.05 || a.ox < -0.05 || a.oz > 0.05 || a.oz < -0.05)) {
          const nx = lx + a.ox * melt - hz * a.lat, nz = lz + a.oz * melt + hx * a.lat, h = W.ground.at(nx, nz, 0.2);
          if (h !== h) { const h0 = W.ground.at(lx + a.ox - hz * a.lat, lz + a.oz + hx * a.lat, 0.2); ok = h0 !== h0; } // (stuck inside already: melt on out)
        }
        if (ok) { a.ox *= melt; a.oz *= melt; }
      }
      a.x = lx + a.ox - hz * a.lat; a.z = lz + a.oz + hx * a.lat;
      const want = a.hwOn ? a.hw : Math.atan2(hx, hz);
      if (a.first) { a.hd = want; a.first = false; } else { let dh = want - a.hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); a.hd += dh * Math.min(1, dt * (a.kind === PED ? 8 : 5)); }
      if (a.pop < 1) a.pop = Math.min(1, a.pop + dt * 3.2);
      a.vis = true; a.held = false;
      // standing height: walkers on the highest ground under their feet, vehicles under their wheels (W.ground); trams on the track
      const y = a.kind === PED ? this._feet(a, a.x, a.z, a.sc, a.first ? 0 : dt, d2 < 22500) : a.kind === CAR_ ? this._wheels(a, a.x, a.z, a.hd, 1.27, 0.79, dt) : a.kind === BIKE_ ? this._wheels(a, a.x, a.z, a.hd, 0.6, 0, dt) : 0, s = Math.max(0, a.pop) * (2 - Math.max(0, a.pop));
      if (a.kind === PED) {
        // (the speed the feet move at: along the way, or sideways when stepping aside while standing in front of someone)
        const ve = Math.max(a.v, a.lv || 0), P = a.pp, anim = P.anim.array, o = a.slot * 4, still = ve < 0.15 && ((100 >> a.sm) & 1) === 1;
        a.ph += dt * (still ? 1.6 : 3.2 + ve * 1.9);
        P.put(a.slot, a.x, y, a.z, a.hd, a.sc * s);
        if (a.sm === 4) { anim[o] = a.ph; anim[o + 1] = Math.min(1.25, (0.45 + a.v * 0.11) * 1.5); anim[o + 2] = 5; anim[o + 3] = 0.14; } // running away, arms up
        else if (still) { anim[o] = a.ph; anim[o + 1] = 1; anim[o + 2] = a.pose; anim[o + 3] = a.sm === 2 ? a.tl : 0; } // standing and watching
        else { anim[o] = a.ph; anim[o + 1] = ve > 0.1 ? (0.45 + ve * 0.11) * a.gait : 0; anim[o + 2] = 0; anim[o + 3] = a.v > 0.1 ? a.lean : 0; }
      } else if (a.kind === BIKE_) {
        const P = a.pp, anim = P.anim.array, rd = a.rd;
        const wait = a.sb && a.v < 0.3; // waiting at the rim of a scene: stopped, a foot down, leaning a little
        if (!wait) a.ph += dt * (2 + a.v * 1.4);
        a.vp.put(a.slot, a.x, y, a.z, a.hd, s);
        const sn = Math.sin(a.hd), cs = Math.cos(a.hd);
        P.put(a.rider, a.x + sn * rd.z, y + rd.y, a.z + cs * rd.z, a.hd, RIDER_S * s);
        let o = a.rider * 4;
        anim[o] = a.ph; anim[o + 1] = 0; anim[o + 2] = rd.pose; anim[o + 3] = wait ? 0.06 : 0;
        if (a.pass >= 0) {
          P.put(a.pass, a.x + sn * rd.z2, y + rd.y, a.z + cs * rd.z2, a.hd, RIDER_S * s * 0.97);
          o = a.pass * 4;
          anim[o] = a.ph + 1.7; anim[o + 1] = 0; anim[o + 2] = rd.pose; anim[o + 3] = 0;
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
        else {
          if (hasS || g.sm || g.back || g.wt) this._gStage(g, dt);
          if (g.sm !== 1) this._gStep(g, dt);
        }
      }
    }
    for (const q of this.pools.values()) q.flush();
    for (const q of this.vpools.values()) q.flush();
    this.cars.flush(); for (const p of this.lampPools) p.flush(); this.trams.flush();
    this.beams.count = this.cars.mesh.count; this.beams.visible = U.uNight.value > 0.02;
  }
  dispose() {
    for (const q of this.pools.values()) q.dispose();
    for (const q of this.vpools.values()) q.dispose();
    this.cars.dispose(); for (const p of this.lampPools) p.dispose(); this.trams.dispose();
    this.beams.geometry.dispose(); this.beams.material.dispose(); // (its instance matrix is the cars': disposed with them)
    this.owners.clear(); this.agents = []; this.ends.clear();
  }
}
