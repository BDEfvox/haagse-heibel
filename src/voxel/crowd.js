// The city's background life: walkers, cyclists, moving and parked cars on every street around the camera,
// not only on the street that is open. Thousands of figures are drawn as three instanced meshes (a handful of
// draw calls), their limbs swing in the vertex shader, and each one follows a lane derived from the real road
// map: pavements beside the carriageway, the right-hand side of the road, cycle paths.
import * as THREE from 'three';
import { clamp } from './kit.js';
import { PERSON_K } from './cast.js';

const SKINS = ['#f2c9a0', '#e8b48a', '#c98e62', '#9a6642', '#f7d7b5', '#7a4f33'];
const SHIRTS = ['#e84a5f', '#2a9d8f', '#f4a261', '#457b9d', '#e9c46a', '#9d4edd', '#ff7aa2', '#3a86ff', '#ffffff', '#52b788', '#fb8500'];
const PANTS = ['#2b3a55', '#3d405b', '#6b705c', '#1d3557', '#5c4033', '#22223b', '#4a4e69'];
const HAIRS = ['#2b1d14', '#5a3825', '#c58b3c', '#e6c36a', '#111111', '#a33b20', '#cfcfcf'];
const CARS = ['#e63946', '#f4a261', '#2a9d8f', '#3a86ff', '#ffd166', '#8338ec', '#f1faee', '#ff70a6', '#06d6a0', '#577590', '#30343f', '#c9d1d6', '#1d3557'];
const BIKES = ['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#111111', '#ff70a6', '#8ecae6'];
const lin = (list) => list.map((h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; });
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
// the same figure the cast module builds, as one mesh: shirt = colour 1, trousers 2, skin 3, hair 4
const PERSON = () => model([
  [-0.2, 0, 0, 0.3, 0.7, 0.32, W_, 2, 1, 0.7], [-0.2, 0, 0.05, 0.32, 0.14, 0.44, '#2a2a2a', 0, 1, 0.7],
  [0.2, 0, 0, 0.3, 0.7, 0.32, W_, 2, 2, 0.7], [0.2, 0, 0.05, 0.32, 0.14, 0.44, '#2a2a2a', 0, 2, 0.7],
  [0, 0.7, 0, 0.78, 0.8, 0.46, W_, 1],
  [-0.51, 0.96, 0, 0.24, 0.5, 0.28, W_, 1, 3, 1.46], [-0.51, 0.76, 0, 0.22, 0.2, 0.26, W_, 3, 3, 1.46],
  [0.51, 0.96, 0, 0.24, 0.5, 0.28, W_, 1, 4, 1.46], [0.51, 0.76, 0, 0.22, 0.2, 0.26, W_, 3, 4, 1.46],
  [0, 1.5, 0, 0.66, 0.62, 0.62, W_, 3],
  [-0.16, 1.8, 0.31, 0.11, 0.13, 0.03, '#1b1b1b'], [0.16, 1.8, 0.31, 0.11, 0.13, 0.03, '#1b1b1b'],
  [0, 2.06, -0.02, 0.7, 0.14, 0.66, W_, 4], [0, 1.7, -0.3, 0.7, 0.4, 0.08, W_, 4],
]);
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
// a street lamp; its arm reaches along +x (towards the road). At night the head glows.
const LAMP = (night) => model([
  [0, 0, 0, 0.16, 4.7, 0.16, '#3d434c'], [0.4, 4.6, 0, 0.9, 0.1, 0.12, '#3d434c'],
  [0.78, 4.44, 0, 0.44, 0.16, 0.3, night ? '#ffe9a8' : '#dfe4e8', night ? 5 : 0],
]);
const RIDER_Y = 0.52, RIDER_Z = -0.28, RIDER_S = 1.2 * PERSON_K;

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
            if (ride > 0.5) ang = leg ? -1.1 + sgn * 0.5 * sin(iAnim.x) : -1.1;
            float ca = cos(ang), sa = sin(ang);
            vec2 q = vec2(transformed.y - aPart.z, transformed.z);
            transformed.y = aPart.z + q.x * ca - q.y * sa;
            transformed.z = q.x * sa + q.y * ca;
          }
          transformed.y += abs(sin(iAnim.x)) * 0.1 * min(1.0, iAnim.y * 2.0) * (1.0 - ride);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, vColor.rgb, vGlow);\n\t#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'crowd1';
  return mat;
}
let _shared = null;
const shared = () => (_shared ||= { person: PERSON(), car: CAR(), bike: BIKE(), lampDay: LAMP(false), lampNight: LAMP(true), mat: crowdMat() });

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
  }
  take() { return this.free.length ? this.free.pop() : -1; }
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
    if (this.anim) this.anim.needsUpdate = true;
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

const PED = 0, BIKE_ = 1, CAR_ = 2;
const CELL = 8, GN = 256; // collision grid: 8 m cells, about 2 km across

export class Crowd {
  /**
   * W: the world on screen. Roads come from its detailed area and from every streamed tile; lanes that would
   * run through the open street's own corridor are left out (that street has its own, fully acted life).
   */
  constructor(W, { lite = false } = {}) {
    this.W = W;
    const S = shared(), k = lite ? 0.3 : 1;
    this.people = new Pool(S.person, S.mat, Math.round(1100 * k), true);
    this.cars = new Pool(S.car, S.mat, Math.round(1300 * k), false);
    this.bikes = new Pool(S.bike, S.mat, Math.round(260 * k), false);
    this.lamps = new Pool(W.night ? S.lampNight : S.lampDay, S.mat, Math.round(900 * k), false);
    this.max = { [PED]: Math.round(760 * k), [BIKE_]: Math.round(240 * k), [CAR_]: Math.round(300 * k), parked: Math.round(950 * k) };
    this.count = { [PED]: 0, [BIKE_]: 0, [CAR_]: 0, parked: 0 };
    this.group = new THREE.Group();
    this.group.add(this.people.mesh, this.cars.mesh, this.bikes.mesh, this.lamps.mesh);
    this.owners = new Map(); // tile key or 'region' → { lanes, parked, agents, cx, cz, r, on }
    this.agents = [];
    this.ends = new Map(); // lane ends by 6 m cell, for finding the way on at a junction
    this.head = new Int32Array(GN * GN); this.next = new Int32Array(4096);
    this.t = 0; this.tick = 0; this.seed = 1234567;
    this.hidden = false;
    const L = W.L, path = W.path;
    this.corr = L.hw + L.bw + Math.max(L.swB, L.swF) + 1.2;
    // a box around the open street, so most points are ruled out without measuring
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (const q of path.p) { if (q[0] < bx0) bx0 = q[0]; if (q[0] > bx1) bx1 = q[0]; if (q[1] < bz0) bz0 = q[1]; if (q[1] > bz1) bz1 = q[1]; }
    const pad = this.corr + 1;
    this.inHero = (x, z) => {
      if (x < bx0 - pad || x > bx1 + pad || z < bz0 - pad || z > bz1 + pad) return false;
      const p = path.project(x, z);
      return p.d < this.corr && p.s > 1 && p.s < path.len - 1;
    };
  }
  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  _cls(x, z) {
    const W = this.W, c = W.grid.get(x, z);
    if (c !== 255) return c;
    const m = W.frame.M(x, z);
    return W.classAt(m[0], m[1]);
  }

  // ------------------------------------------------------------ building lanes
  /** The detailed area's own roads. */
  addRegion() {
    const W = this.W, c = W.clip;
    this._add('region', W.roads, null, (x, z) => W.inClip(x, z), (c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, Math.hypot(c.x1 - c.x0, c.z1 - c.z0) / 2);
  }
  /** A streamed tile's roads (given in the tile's own coordinates). */
  addTile(t) {
    const W = this.W, f = W.frame, TILE = 256, ctr = f.S(t.ox + TILE / 2, t.oy + TILE / 2);
    this._add(t.key, t.roads, (x, z) => f.S(t.ox + x, t.oy + TILE - z), (x, z) => !W.inClip(x, z), ctr[0], ctr[1], 190);
  }
  _add(id, roads, toScene, inside, cx, cz, r) {
    if (this.owners.has(id)) this.remove(id);
    const o = { id, lanes: [], parked: [], lamps: [], agents: new Set(), cx, cz, r, on: false };
    const C = this.W.C, walk = new Uint8Array(256), road = new Uint8Array(256);
    for (const k of [C.WALK, C.LAND, C.PLAZA, C.FOOT, C.PED, C.CURB, C.DIRT]) walk[k] = 2;
    for (const k of [C.ASPHALT, C.KLINKER, C.SERVICE, C.CYCLE, C.BIKELANE, C.MARK, C.PARKING, C.RAILBED, C.RAIL]) { walk[k] = 1; road[k] = 1; }
    walk[255] = 2; // no tile there yet: give the benefit of the doubt
    /** Cut a lane into the stretches that are allowed (test() → 2 fine, 1 passable for a short way, 0 no). */
    const split = (pts, kind, cls, test) => {
      const n = pts.length >> 1;
      let a = -1, lastGood = -1, soft = 0;
      const close = (b) => {
        if (a >= 0 && b - a >= 2) {
          const p = pts.slice(a * 2, (b + 1) * 2), m = b - a + 1;
          let len = 0;
          for (let i = 1; i < m; i++) len += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
          const lane = { pts: p, n: m, len, step: len / (m - 1), kind, cls, owner: o, dead: false };
          o.lanes.push(lane);
          this._end(lane, 0, true); this._end(lane, 1, true);
        }
        a = -1;
      };
      for (let i = 0; i < n; i++) {
        const x = pts[i * 2], z = pts[i * 2 + 1], q = inside(x, z) && !this.inHero(x, z) ? test(x, z) : 0;
        if (q === 2) { if (a < 0) a = i; lastGood = i; soft = 0; }
        else if (q === 1 && a >= 0 && ++soft <= 5) { /* a crossing: carry on */ }
        else { close(lastGood); soft = 0; }
      }
      close(lastGood);
    };
    const yes = () => 2, walkable = (x, z) => walk[this._cls(x, z)];
    for (const rd of roads) {
      const cls = rd.cls, fl = rd.flags;
      if (cls > 13 || cls === 12 || fl & 4 || rd.a.length < 4) continue;
      let a = rd.a;
      if (toScene) { a = new Float32Array(rd.a.length); for (let i = 0; i + 1 < a.length; i += 2) { const p = toScene(rd.a[i], rd.a[i + 1]); a[i] = p[0]; a[i + 1] = p[1]; } }
      const w = Math.max(rd.w || 6, 1.5), one = !!(fl & 1), h = ((a[0] * 73.1 + a[1] * 37.7) % 1 + 1) % 1; // a steady coin for this piece of road
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
            const x = line[i * 2], z = line[i * 2 + 1];
            if (this.rnd() > 0.5 || !inside(x, z) || this.inHero(x, z) || !road[this._cls(x, z)]) continue;
            o.parked.push(x, z, Math.atan2(line[i * 2 + 2] - line[i * 2 - 2], line[i * 2 + 3] - line[i * 2 - 1]));
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
            if (!inside(x, z) || this.inHero(x, z) || walk[this._cls(x, z)] !== 2) continue;
            const dx = line[i * 2 + 2] - x, dz = line[i * 2 + 3] - z; // the road lies to the left of a right-hand kerb line
            o.lamps.push(x, z, Math.atan2(side * dx, side * dz));
          }
        }
        split(laneLine(a, w / 2 + 1.35, false), PED, cls, walkable);
        split(laneLine(a, -(w / 2 + 1.35), false), PED, cls, walkable);
      } else if (cls === 8) {
        split(laneLine(a, w / 4, false), PED, cls, walkable);
        split(laneLine(a, -w / 4, false), PED, cls, walkable);
      } else if (cls === 11) split(laneLine(a, 0, false), PED, cls, walkable);
    }
    this.owners.set(id, o);
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
  }

  // ------------------------------------------------------------ people and vehicles
  _empty(o) {
    for (const a of o.agents) this._free(a, false);
    o.agents.clear();
    o.on = false;
  }
  _free(a, unlink = true) {
    if (a.dead) return;
    a.dead = true;
    if (a.kind === 3) { this.lamps.give(a.slot); return; }
    if (a.kind === PED) this.people.give(a.slot);
    else if (a.kind === BIKE_) { this.bikes.give(a.slot); this.people.give(a.rider); }
    else this.cars.give(a.slot);
    this.count[a.parked ? 'parked' : a.kind]--;
    if (unlink) a.lane.owner.agents.delete(a);
  }
  _fill(o) {
    o.on = true;
    const W = this.W;
    for (let i = 0; i < o.parked.length; i += 3) {
      if (this.count.parked >= this.max.parked) break;
      const slot = this.cars.take();
      if (slot < 0) break;
      const x = o.parked[i], z = o.parked[i + 1];
      this.cars.put(slot, x, W.hAt(x, z), z, o.parked[i + 2], 1);
      this.cars.tint(this.cars.c1, slot, P_CAR[Math.floor(this.rnd() * P_CAR.length)]);
      this.count.parked++;
      o.agents.add({ kind: CAR_, parked: true, slot, dead: false, lane: { owner: o } });
    }
    for (let i = 0; i < o.lamps.length; i += 3) {
      const slot = this.lamps.take();
      if (slot < 0) break;
      const x = o.lamps[i], z = o.lamps[i + 1];
      this.lamps.put(slot, x, W.hAt(x, z), z, o.lamps[i + 2], 1);
      o.agents.add({ kind: 3, slot, dead: false, lane: { owner: o } });
    }
    // how many per 100 m of lane, by kind and by how big the street is
    const DENS = {
      [PED]: { 2: 1.5, 3: 1.5, 4: 1.3, 5: 0.9, 6: 0.85, 7: 0.7, 8: 4.2, 11: 0.5 },
      [BIKE_]: { 3: 0.5, 4: 0.5, 5: 0.35, 6: 0.25, 7: 0.2, 10: 1.0 },
      [CAR_]: { 1: 2.0, 2: 1.9, 3: 1.6, 4: 1.2, 5: 0.7, 6: 0.3, 7: 0.14, 9: 0.04, 13: 0.2 },
    };
    for (const lane of o.lanes) {
      const want = ((DENS[lane.kind][lane.cls] || 0) * lane.len) / 100;
      let n = Math.floor(want) + (this.rnd() < want % 1 ? 1 : 0);
      while (n-- > 0 && this.count[lane.kind] < this.max[lane.kind]) this._spawn(lane, this.rnd() * lane.len);
    }
  }
  _spawn(lane, s) {
    const kind = lane.kind, r = () => this.rnd(), pick = (l) => l[Math.floor(r() * l.length)];
    const a = { kind, lane, s, dir: kind === PED && r() < 0.5 ? -1 : 1, v: 0, v0: 0, slot: -1, rider: -1, ph: r() * 6.28, hd: 0, x: 0, z: 0, ox: 0, oz: 0, pop: 0, wait: 0, ghost: 0, sc: 1, dead: false, vis: false, first: true, nx: -1 };
    if (kind === PED) {
      a.slot = this.people.take();
      if (a.slot < 0) return null;
      const kid = r() < 0.1;
      a.sc = (kid ? 0.85 : 1.25) * PERSON_K * (0.94 + r() * 0.12);
      a.v0 = kid ? 1.9 : 1.25 + r() * 0.55;
      this._look(a.slot);
    } else if (kind === BIKE_) {
      a.slot = this.bikes.take(); a.rider = this.people.take();
      if (a.slot < 0 || a.rider < 0) { if (a.slot >= 0) this.bikes.give(a.slot); if (a.rider >= 0) this.people.give(a.rider); return null; }
      a.v0 = 4.2 + r() * 1.6;
      this.bikes.tint(this.bikes.c1, a.slot, pick(P_BIKE));
      this._look(a.rider);
    } else {
      a.slot = this.cars.take();
      if (a.slot < 0) return null;
      a.v0 = (lane.cls <= 2 ? 11 : lane.cls <= 4 ? 9 : lane.cls === 5 ? 7.5 : 5) * (0.85 + r() * 0.3);
      this.cars.tint(this.cars.c1, a.slot, r() < 0.06 ? [1, 0.67, 0.0] : pick(P_CAR));
    }
    a.v = a.v0;
    this.count[kind]++;
    lane.owner.agents.add(a);
    this.agents.push(a);
    return a;
  }
  _look(slot) {
    const P = this.people, r = () => this.rnd(), pick = (l) => l[Math.floor(r() * l.length)];
    P.tint(P.c1, slot, pick(P_SHIRT)); P.tint(P.c2, slot, pick(P_PANTS)); P.tint(P.c3, slot, pick(P_SKIN)); P.tint(P.c4, slot, pick(P_HAIR));
  }
  /** At the end of a lane: the lane to carry on along, if one starts close by. Returns [lane, enterAtEnd] or null. */
  _onward(a) {
    const lane = a.lane, e = a.dir > 0 ? 1 : 0, i = e ? lane.n - 1 : 0, x = lane.pts[i * 2], z = lane.pts[i * 2 + 1];
    const j = e ? lane.n - 2 : 1, dx = x - lane.pts[j * 2], dz = z - lane.pts[j * 2 + 1], dl = Math.hypot(dx, dz) || 1;
    const reach = a.kind === PED ? 5.5 : 7.5, cx = Math.floor(x / 6), cz = Math.floor(z / 6);
    let best = null, bw = 0;
    for (let ax = -2; ax <= 2; ax++) for (let az = -2; az <= 2; az++) {
      const bin = this.ends.get((cx + ax) * 65536 + cz + az);
      if (!bin) continue;
      for (let k = 0; k < bin.length; k += 2) {
        const l2 = bin[k], e2 = bin[k + 1];
        if (l2 === lane || l2.dead || l2.kind !== lane.kind || !l2.owner.on) continue;
        if (a.kind !== PED && e2 !== 0) continue; // vehicles only join a lane at its start
        const i2 = e2 ? l2.n - 1 : 0, j2 = e2 ? l2.n - 2 : 1, d = Math.hypot(l2.pts[i2 * 2] - x, l2.pts[i2 * 2 + 1] - z);
        if (d > reach) continue;
        const ex = l2.pts[j2 * 2] - l2.pts[i2 * 2], ez = l2.pts[j2 * 2 + 1] - l2.pts[i2 * 2 + 1], cos = (ex * dx + ez * dz) / ((Math.hypot(ex, ez) || 1) * dl);
        if (cos < -0.35) continue; // not back the way it came
        const w = (0.4 + Math.max(0, cos) * 2) * (0.5 + this.rnd());
        if (w > bw) { bw = w; best = [l2, e2]; }
      }
    }
    return best;
  }

  // ------------------------------------------------------------ every frame
  /** x, z: what the camera looks at; dist: how far away it is. */
  update(dt, x, z, dist) {
    const W = this.W;
    this.t += dt;
    const far = dist > 850;
    if (far !== this.hidden) { this.hidden = far; this.group.visible = !far; }
    if (far) return;
    const R = clamp(260 + dist * 2.2, 330, 780), R2 = R * R;
    // streets come into range and drop out of it as the camera moves
    if ((this.tick++ & 15) === 0) {
      for (const o of this.owners.values()) {
        const near = Math.hypot(o.cx - x, o.cz - z) < R + o.r;
        if (near && !o.on) this._fill(o);
        else if (!near && o.on) this._empty(o);
      }
      if (this.agents.length > 64 && (this.tick & 255) === 1) this.agents = this.agents.filter((a) => !a.dead); // tick was bumped above: 1, not 0
    }
    // who is where: a grid for looking ahead
    const head = this.head, next = this.next, A = this.agents, n = A.length, gx0 = x - (GN * CELL) / 2, gz0 = z - (GN * CELL) / 2;
    if (next.length < n) this.next = new Int32Array(n * 2);
    head.fill(-1);
    for (let i = 0; i < n; i++) {
      const a = A[i];
      if (a.dead || !a.vis) continue;
      const ci = Math.floor((a.x - gx0) / CELL), cj = Math.floor((a.z - gz0) / CELL);
      if (ci < 0 || cj < 0 || ci >= GN || cj >= GN) continue;
      const c = cj * GN + ci;
      this.next[i] = head[c]; head[c] = i;
    }
    const P = this.people, anim = P.anim.array;
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
      if (d2 > R2) {
        if (a.vis) { a.vis = false; if (a.kind === PED) P.hide(a.slot); else if (a.kind === BIKE_) { this.bikes.hide(a.slot); P.hide(a.rider); } else this.cars.hide(a.slot); }
        continue;
      }
      const el = Math.hypot(ex, ez) || 1, hx = (ex / el) * a.dir, hz = (ez / el) * a.dir;
      // ---- speed: vehicles look ahead and brake for whatever is in their way
      let target = a.v0;
      if (a.kind !== PED && a.vis) {
        const reach = a.kind === CAR_ ? 6.6 + a.v * 0.9 : 3.2 + a.v * 0.5, px = a.x + hx * reach * 0.5, pz = a.z + hz * reach * 0.5;
        const ci = Math.floor((px - gx0) / CELL), cj = Math.floor((pz - gz0) / CELL);
        let block = 1e9, bv = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const cc = ci + di, cr = cj + dj;
          if (cc < 0 || cr < 0 || cc >= GN || cr >= GN) continue;
          for (let q = head[cr * GN + cc]; q >= 0; q = this.next[q]) {
            if (q === i) continue;
            const b = A[q], bx = b.x - a.x, bz = b.z - a.z, fw = bx * hx + bz * hz;
            if (fw < 0.4 || fw > reach) continue;
            const lat = Math.abs(bx * hz - bz * hx), lim = b.kind === CAR_ ? (a.kind === CAR_ ? 1.75 : 1.3) : b.kind === BIKE_ ? 1.1 : 1.25;
            if (lat > lim) continue;
            if (b.kind !== PED) {
              // two vehicles each waiting for the other: the one that came first in the list goes
              const bhx = Math.sin(b.hd), bhz = Math.cos(b.hd), bf = -(bx * bhx + bz * bhz);
              if (q > i && bf > 0.4 && Math.abs(bx * bhz - bz * bhx) < 1.75 && hx * bhx + hz * bhz < 0.5) continue;
            }
            if (fw < block) { block = fw; bv = b.kind === PED ? 0 : Math.max(0, b.v * (hx * Math.sin(b.hd) + hz * Math.cos(b.hd))); }
          }
        }
        if (block < 1e9 && a.ghost <= 0) {
          const gap = a.kind === CAR_ ? 6.3 : 2.8;
          target = Math.min(a.v0, block < gap ? 0 : bv + (block - gap) * 1.2);
        }
        if (a.v < 0.3 && target < 0.3) { a.wait += dt; if (a.wait > 6) { a.ghost = 2.5; a.wait = 0; } } else a.wait = 0;
        if (a.ghost > 0) a.ghost -= dt;
      }
      a.v += clamp(target - a.v, -9 * dt, 2.6 * dt);
      // ---- move on
      a.s += a.dir * a.v * dt;
      if (a.s > lane.len || a.s < 0) {
        const on = this._onward(a);
        if (on) {
          const [l2, e2] = on;
          // carry the small jump between the two lanes as an offset that melts away
          const i2 = e2 ? l2.n - 1 : 0;
          a.ox += lx - l2.pts[i2 * 2]; a.oz += lz - l2.pts[i2 * 2 + 1];
          lane.owner.agents.delete(a); l2.owner.agents.add(a);
          a.lane = l2; a.dir = e2 ? -1 : 1; a.s = e2 ? l2.len : 0;
        } else if (a.kind === PED) { a.dir = -a.dir; a.s = clamp(a.s, 0, lane.len); } // dead end: turn round
        else { a.s = a.dir > 0 ? 0 : lane.len; a.pop = 0; a.ox = a.oz = 0; a.first = true; } // a car with nowhere to go starts its lane again
        continue;
      }
      const melt = Math.exp(-dt * 1.8);
      a.ox *= melt; a.oz *= melt;
      a.x = lx + a.ox; a.z = lz + a.oz;
      const want = Math.atan2(hx, hz);
      if (a.first) { a.hd = want; a.first = false; } else { let dh = want - a.hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); a.hd += dh * Math.min(1, dt * (a.kind === PED ? 8 : 5)); }
      if (a.pop < 1) a.pop = Math.min(1, a.pop + dt * 3.2);
      a.vis = true;
      const y = W.hAt(a.x, a.z), s = a.pop * (2 - a.pop);
      if (a.kind === PED) {
        a.ph += dt * (3.2 + a.v * 1.9);
        P.put(a.slot, a.x, y, a.z, a.hd, a.sc * s);
        const o = a.slot * 4;
        anim[o] = a.ph; anim[o + 1] = a.v > 0.1 ? 0.45 + a.v * 0.11 : 0; anim[o + 2] = 0;
      } else if (a.kind === BIKE_) {
        a.ph += dt * (2 + a.v * 1.4);
        this.bikes.put(a.slot, a.x, y, a.z, a.hd, s);
        const sn = Math.sin(a.hd), cs = Math.cos(a.hd);
        P.put(a.rider, a.x + sn * RIDER_Z, y + RIDER_Y, a.z + cs * RIDER_Z, a.hd, RIDER_S * s);
        const o = a.rider * 4;
        anim[o] = a.ph; anim[o + 1] = 0; anim[o + 2] = 1;
      } else this.cars.put(a.slot, a.x, y, a.z, a.hd, s);
    }
    P.flush(); this.cars.flush(); this.bikes.flush(); this.lamps.flush();
  }
  dispose() {
    this.people.dispose(); this.cars.dispose(); this.bikes.dispose(); this.lamps.dispose();
    this.owners.clear(); this.agents = []; this.ends.clear();
  }
}
