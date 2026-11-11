// Builds the voxel world around one street from real map data: ground, roads, buildings, trees,
// plus a low-detail model of the whole city for the horizon and the sky drop.
import * as THREE from 'three';
import { Vox, clamp, makeRng, hashStr } from './kit.js';
import * as P from './props.js';
import { Path, Grid, obbOf, rectsOf, ringArea, inRing, chain, polyLen } from './geo.js';
import { crossSection, dress } from './street.js';

const ROOT = './data/world/';
const TILE = 256;
let _index = null, _city = null;
const _tiles = new Map();

export const C = {
  LAND: 0, WATER: 1, GRASS: 2, FOREST: 3, SAND: 4, DUNE: 5, PITCH: 6, FARM: 7, PLAZA: 8, PARKING: 9, SEA: 10,
  ASPHALT: 20, KLINKER: 21, SERVICE: 22, CYCLE: 23, FOOT: 24, PED: 25, DIRT: 26, RAILBED: 27, RAIL: 28,
  WALK: 30, CURB: 31, MARK: 32, BIKELANE: 34, BUILDING: 40,
};
const PAL = {
  0: { c: '#c6cdb2', alt: '#bbc5a5', speck: 0.14 },
  1: { c: '#3fa7d6', alt: '#86d3ef', speck: 0.03 },
  2: { c: '#6fbf5f', alt: '#62b354', speck: 0.16 },
  3: { c: '#4f9c4c', alt: '#438b42', speck: 0.3 },
  4: { c: '#f3dca4', alt: '#ecd091', speck: 0.16 },
  5: { c: '#cfd596', alt: '#a8c47c', speck: 0.3 },
  6: { c: '#5bc66c', alt: '#51b962', stripe: 4 },
  7: { c: '#a9cf7a', alt: '#9cc46c', stripe: 3 },
  8: { c: '#e0c9a0', alt: '#d6bc8e', check: 1.5 },
  9: { c: '#868a92', alt: '#7c8088', speck: 0.12 },
  10: { c: '#38b6d8', alt: '#c9f0fb', speck: 0.012 },
  11: { c: '#5f636c' }, 12: { c: '#b79a90' }, 13: { c: '#8d8577' },
  20: { c: '#4b4f58', alt: '#454952', speck: 0.2 },
  21: { c: '#a8776a', alt: '#a06e62', check: 1 },
  22: { c: '#6c7078', alt: '#666a72', speck: 0.2 },
  23: { c: '#c9573f', alt: '#c0503a', speck: 0.15 },
  24: { c: '#cfc6b2', alt: '#c5bba6', check: 1 },
  25: { c: '#e0c9a0', alt: '#d6bc8e', check: 1.5 },
  26: { c: '#d9c79a', alt: '#cdb98a', speck: 0.25 },
  27: { c: '#8d8577', alt: '#837b6e', speck: 0.3 },
  28: { c: '#8f959c' },
  30: { c: '#b9bcc2', alt: '#aeb1b8', check: 1 },
  31: { c: '#d6d0c2' },
  32: { c: '#f1f1f1' },
  34: { c: '#c9573f', alt: '#c0503a', speck: 0.15 },
  40: { c: '#9a958a' },
};
const LUT = (() => {
  const px = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const t = new Array(256).fill(null);
  for (const k of Object.keys(PAL)) { const p = PAL[k]; t[k] = { a: px(p.c), b: px(p.alt || p.c), check: p.check || 0, stripe: p.stripe || 0, speck: p.speck || 0 }; }
  return t;
})();
const hash2 = (x, y) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------- loading
const getJson = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
export function loadIndex() {
  return (_index ||= getJson(ROOT + 'index.json').then((ix) => { if (!ix) throw new Error('world index missing'); ix.set = new Set(ix.tiles); return ix; }));
}
async function pixels(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}
export function loadCity() {
  return (_city ||= (async () => {
    const ix = await loadIndex();
    const [ground, height] = await Promise.all([pixels(ROOT + ix.ground.file), pixels(ROOT + ix.height.file)]);
    return { ix, ground, height };
  })());
}
function loadTile(ix, key) {
  if (!ix.set.has(key)) return Promise.resolve(null);
  if (!_tiles.has(key)) {
    if (_tiles.size > 160) _tiles.delete(_tiles.keys().next().value);
    _tiles.set(key, getJson(`${ROOT}tiles/${key}.json`));
  }
  return _tiles.get(key);
}
/** Warm the caches (called at boot and on hover). */
export function preload(geometry) {
  loadCity().then(({ ix }) => {
    if (!geometry) return;
    const f = frameFor(ix, geometry);
    for (const k of tileKeys(f, 180)) loadTile(ix, k);
  }).catch(() => {});
}

// ---------------------------------------------------------------- frame
function frameFor(ix, geometry) {
  const { lon0, lat0, kx, ky } = ix.proj;
  const parts = geometry.map((line) => line.map((ll) => [(ll[0] - lon0) * kx, (ll[1] - lat0) * ky]));
  const spine = chain(parts, 12, 0.25).sort((a, b) => polyLen(b) - polyLen(a))[0];
  const len = polyLen(spine);
  const a = spine[0], b = spine[spine.length - 1];
  let dx = b[0] - a[0], dy = b[1] - a[1];
  if (Math.hypot(dx, dy) < 0.3 * len) {
    let best = 0;
    for (let i = 1; i < spine.length; i++) {
      const ex = spine[i][0] - spine[i - 1][0], ey = spine[i][1] - spine[i - 1][1], l = Math.hypot(ex, ey);
      if (l > best) { best = l; dx = ex; dy = ey; }
    }
  }
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  const mid = new Path(spine).raw(len / 2);
  const f = { ox: mid[0], oy: mid[1], dx, dy, spine, parts };
  f.S = (mx, my) => [(mx - f.ox) * f.dx + (my - f.oy) * f.dy, (mx - f.ox) * f.dy - (my - f.oy) * f.dx];
  f.M = (sx, sz) => [f.ox + sx * f.dx + sz * f.dy, f.oy + sx * f.dy - sz * f.dx];
  return f;
}
function regionOf(f, margin) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const line of f.parts) for (const p of line) {
    const [x, z] = f.S(p[0], p[1]);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return { x0: x0 - margin, x1: x1 + margin, z0: z0 - margin, z1: z1 + margin };
}
function tileKeys(f, margin) {
  const R = regionOf(f, margin);
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const [x, z] of [[R.x0, R.z0], [R.x1, R.z0], [R.x1, R.z1], [R.x0, R.z1]]) {
    const [mx, my] = f.M(x, z);
    if (mx < a0) a0 = mx; if (mx > a1) a1 = mx; if (my < b0) b0 = my; if (my > b1) b1 = my;
  }
  const keys = [];
  for (let ty = Math.floor((b0 - 30) / TILE); ty <= Math.floor((b1 + 30) / TILE); ty++)
    for (let tx = Math.floor((a0 - 30) / TILE); tx <= Math.floor((a1 + 30) / TILE); tx++) keys.push(`${tx}_${ty}`);
  return keys;
}

// ---------------------------------------------------------------- cutaway materials
// Buildings and trees between the camera and the street duck out of the way; everything rises from flat on arrival.
export const U = {
  uFocus: { value: new THREE.Vector3() }, uCamDir: { value: new THREE.Vector2(0, 1) },
  uTan: { value: 1 }, uR: { value: 60 }, uCut: { value: 1 }, uGrow: { value: 1 },
};
function cutPatch(mat, tint = true) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aB;\nuniform vec3 uFocus;\nuniform vec2 uCamDir;\nuniform float uTan;\nuniform float uR;\nuniform float uCut;\nuniform float uGrow;\nvarying float vCut;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCut = 0.0;
        if (aB.z > 0.0) {
          float cutR = max(aB.w, 0.0);
          vec2 cutD = aB.xy - uFocus.xz;
          float cutT = dot(cutD, uCamDir);
          float cutL = length(cutD - uCamDir * cutT);
          float cutH = max(0.3, (cutT - cutR - 7.0) * uTan);
          float cutW = uCut * smoothstep(-1.0, 3.0, cutT - cutR * 0.5) * (1.0 - smoothstep(uR, uR * 1.5, cutL));
          float cutK = smoothstep(0.7, 1.0, cutH / aB.z);
          if (aB.w < 0.0) {
            // trees shrink to shrubs
            float cutS = mix(1.0, mix(0.2, 1.0, cutK), cutW);
            transformed *= cutS * uGrow;
          } else {
            // a building either clears the sight line to the street or lies down flat: half-squashed fronts look wrong
            float cutS = mix(1.0, mix(0.22 / aB.z, 1.0, cutK), cutW);
            transformed.y *= cutS * uGrow;
            vCut = 1.0 - cutS;
          }
        }`);
    if (tint) sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCut;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.62, 0.58), smoothstep(0.2, 0.85, vCut) * 0.93);');
  };
  mat.customProgramCacheKey = () => 'cut5' + (tint ? 't' : '');
  return mat;
}
export const CUT = {
  solid: cutPatch(new THREE.MeshLambertMaterial({ vertexColors: true })),
  glow: cutPatch(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })),
  depth: cutPatch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), false),
};
/** How much a thing at (x, z) of height h is ducked right now (mirrors the shader; used for signs). */
export function cutWeight(x, z, r = 5) {
  const f = U.uFocus.value, d = U.uCamDir.value, dx = x - f.x, dz = z - f.z;
  const t = dx * d.x + dz * d.y, l = Math.hypot(dx - d.x * t, dz - d.y * t);
  const ss = (a, b, v) => { const k = clamp((v - a) / (b - a)); return k * k * (3 - 2 * k); };
  const hmax = Math.max(0.3, (t - r - 7) * U.uTan.value);
  return U.uCut.value * ss(-1, 3, t - r * 0.5) * (1 - ss(U.uR.value, U.uR.value * 1.5, l)) * (hmax < 4 ? 1 : 0);
}

// ---------------------------------------------------------------- building looks
const ERA = [
  { to: 1925, wall: ['#b5523b', '#a8472f', '#8f4a3a', '#c7714f', '#74504a', '#b86b4b'], roofs: ['#8a3b2e', '#c8553d', '#4a4e57'] },
  { to: 1946, wall: ['#c98b5e', '#b86b4b', '#c7714f', '#a8472f', '#d8b07a'], roofs: ['#c8553d', '#a44a3f', '#d9693f'] },
  { to: 1976, wall: ['#d8b07a', '#e9e2d3', '#c7714f', '#cbb894', '#d9c2a0'], roofs: ['#4a4e57', '#a44a3f', '#6b7078'] },
  { to: 2001, wall: ['#c98b5e', '#b86b4b', '#e9e2d3', '#d8b07a', '#b9a58a'], roofs: ['#4a4e57', '#c8553d', '#5d646d'] },
  { to: 9999, wall: ['#e3e6e8', '#74504a', '#cfd8dc', '#b0553c', '#3f4650', '#d7c9b8'], roofs: ['#4a4e57', '#3d434c'] },
];
const eraOf = (year) => ERA.find((e) => (year || 1950) < e.to) || ERA[2];
const TOWER = ['#cfd8dc', '#b8c4cc', '#e3ded3', '#9fb0ba', '#d7c9b8', '#8fa3ad', '#5f6f7d', '#e8eef1'];
const LIT = ['#ffd97a', '#ffe9a8', '#ffc45e', '#fff1c1'];

function drawGeneric(v, gl, b, lod, rnd, night) {
  const o = b.o, th = Math.atan2(-o.uz, o.ux), h = b.h, era = eraOf(b.year);
  const tall = h > 24;
  v.setT(th, o.cx, o.cz); gl.setT(th, o.cx, o.cz);
  const rad = Math.min(o.w, o.d) / 2;
  v.setB(o.cx, o.cz, h + 2, rad); gl.setB(o.cx, o.cz, h + 2, rad);
  const wall = tall ? rnd.pick(TOWER) : rnd.pick(era.wall), roofCol = rnd.pick(era.roofs);
  const glass = night ? '#1c2a44' : '#8fc7e8';
  const small = b.area < 22;
  for (const r of b.rects) {
    v.box(r.x, 0, r.z, r.w, h, r.d, small ? P.shade(wall, 0.8) : wall, 0.035);
    const span = Math.min(r.w, r.d);
    if (b.roof && b.rects.length === 1 && span < 14 && !tall) {
      const alongX = r.w >= r.d, rise = clamp(span * 0.36, 0.9, 3.2), n = 3;
      for (let i = 0; i < n; i++) {
        const k = 1 - (i * 0.92) / n;
        v.box(r.x, h + (i * rise) / n, r.z, alongX ? r.w + 0.1 : r.w * k + 0.1, rise / n, alongX ? r.d * k + 0.1 : r.d + 0.1, roofCol, 0.05);
      }
    } else {
      v.box(r.x, h, r.z, r.w + 0.15, 0.3, r.d + 0.15, tall ? P.shade(wall, 0.8) : '#efe9dc');
      if (span > 2) v.box(r.x, h + 0.3, r.z, r.w - 0.5, 0.08, r.d - 0.5, '#4a4e57');
    }
    if (tall) {
      // high-rise: a ribbon of glass per floor
      for (let y = 3.2; y + 1.4 < h; y += 3.0) {
        const lit = night && rnd.chance(0.4);
        const t = lit ? gl : v, col = lit ? rnd.pick(LIT) : glass;
        t.box(r.x, y, r.z + r.d / 2, r.w - 0.8, 1.3, 0.12, col); t.box(r.x, y, r.z - r.d / 2, r.w - 0.8, 1.3, 0.12, col);
        t.box(r.x + r.w / 2, y, r.z, 0.12, 1.3, r.d - 0.8, col); t.box(r.x - r.w / 2, y, r.z, 0.12, 1.3, r.d - 0.8, col);
      }
      if (h > 55) { v.box(r.x, h + 0.3, r.z, 0.14, 4, 0.14, '#555'); gl.box(r.x, h + 4.3, r.z, 0.4, 0.4, 0.4, '#ff3b3b'); }
    } else if (lod === 1 && !small && h > 3.4) {
      for (let y = 1.0; y + 1.5 < h; y += 2.8) {
        for (const [len, fx, fz, ax] of [[r.w, 0, 1, 1], [r.w, 0, -1, 1], [r.d, 1, 0, 0], [r.d, -1, 0, 0]]) {
          const n = Math.floor(len / 3.2);
          for (let i = 0; i < n; i++) {
            const along = (i + 0.5 - n / 2) * (len / n);
            const lit = night && rnd.chance(0.3);
            const t = lit ? gl : v, col = lit ? rnd.pick(LIT) : glass;
            if (ax) t.box(r.x + along, y, r.z + (fz * r.d) / 2, 1.5, 1.3, 0.1, col);
            else t.box(r.x + (fx * r.w) / 2, y, r.z + along, 0.1, 1.3, 1.5, col);
          }
        }
      }
    }
  }
}

const SHOPS = ['BAKKER', 'KAAS', 'BLOEM', 'FIETS', 'KAPPER', 'BOEK', 'TOKO', 'SLAGER', 'DROP', 'VIS', 'KIOSK', 'MODE', 'SCHOEN'];
const BARS = ['CAFE', 'KROEG', 'BAR', 'BIER'];
const FOOD = ['FRIET', 'PIZZA', 'SNACK', 'KEBAB', 'ROTI', 'SUSHI'];
const POI_SHOP = { 1: BARS, 2: FOOD, 3: SHOPS, 4: ['SUPER'], 5: ['BANK'], 6: ['KOFFIE'] };

/** A street-facing house front drawn with the full kit (doors, windows, gables, shop fronts). Returns anchors in scene coords. */
function drawHero(v, gl, u, rnd, night) {
  const th = Math.atan2(u.nx, u.nz), c = Math.cos(th), s = Math.sin(th);
  v.setT(th, u.cx, u.cz); gl.setT(th, u.cx, u.cz);
  v.setB(u.cx, u.cz, u.h + 3, u.d / 2); gl.setB(u.cx, u.cz, u.h + 3, u.d / 2);
  const w = u.w, depth = u.d, era = eraOf(u.year);
  const toS = (lx, lz) => [u.cx + lx * c + lz * s, u.cz - lx * s + lz * c];
  let info;
  if (u.tower) {
    info = P.tower(v, gl, { x: 0, z: depth / 2, w, rnd, night, floors: clamp(Math.round((u.h - 2.8) / 1.5), 3, 70), depth, y: 0 });
  } else {
    const old = (u.year || 1950) < 1935;
    const roof = u.roof ? (old && w < 9 ? rnd.pick(['step', 'bell', 'pitch']) : 'pitch') : 'flat';
    info = P.house(v, gl, {
      x: 0, z: depth / 2, w, rnd, night, depth, y: 0, roof, wall: u.wall || rnd.pick(era.wall),
      floors: clamp(Math.round((u.h - (u.roof ? 3.4 : 2.6)) / 2.2) + 1, 1, 9),
      shop: u.shop || null, signBg: u.shop === 'BANK' ? '#005eb8' : undefined,
    });
  }
  if (u.atm) P.atm(v, gl, -w / 2 + 0.9, depth / 2 + 0.05, 0);
  const out = { u, info, th, side: u.side, w, front: toS(0, depth / 2), door: toS(info.door.x, info.door.z), win: toS(info.win.x, info.win.z), winY: info.win.y };
  if (u.atm) out.atm = toS(-w / 2 + 0.9, depth / 2 + 1.2);
  if (info.chimney) { const p = toS(info.chimney.x, info.chimney.z); out.chimney = { x: p[0], y: info.chimney.y, z: p[1] }; }
  if (info.sign) {
    const p = toS(info.sign.position.x, info.sign.position.z);
    info.sign.position.set(p[0], info.sign.position.y, p[1]);
    info.sign.rotation.y = th;
    out.sign = info.sign;
  }
  return out;
}

// ---------------------------------------------------------------- the whole city, far away
function cityBackdrop(city, f, R, lite) {
  const { ix, ground, height } = city;
  const [ex0, ey0, ex1, ey1] = ix.extent;
  const g = new THREE.Group();
  // metres (x east, z south) → scene
  g.rotation.y = Math.atan2(-f.dy, f.dx);
  g.position.set(-(f.ox * f.dx + f.oy * f.dy), 0, -(f.ox * f.dy - f.oy * f.dx));

  if (!city.tex) {
    const w = ground.width, h = ground.height, src = ground.data, data = new Uint8Array(w * h * 4);
    for (let j = 0, o = 0; j < h; j++) for (let i = 0; i < w; i++, o += 4) {
      const p = LUT[src[o]] || LUT[0], k = 0.96 + hash2(i, j) * 0.08, c = p.speck && hash2(i + 7, j + 3) < p.speck ? p.b : p.a;
      data[o] = c[0] * k; data[o + 1] = c[1] * k; data[o + 2] = c[2] * k; data[o + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.needsUpdate = true;
    city.tex = tex;
    // building cells
    const cw = height.width, ch = height.height, hd = height.data, cell = ix.height.cell, cells = [];
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const o = (j * cw + i) * 4, hh = hd[o];
      if (!hh) continue;
      cells.push(ex0 + (i + 0.5) * cell, ey1 - (j + 0.5) * cell, hh, hd[o + 1] / 255);
    }
    city.cells = new Float32Array(cells);
    city.cell = cell;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([ex0, 0, -ey1, ex1, 0, -ey1, ex1, 0, -ey0, ex0, 0, -ey0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 3, 2, 0, 2, 1]);
  const plane = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: city.tex, depthWrite: false }));
  plane.renderOrder = -3;
  plane.userData.keepMap = true;
  g.add(plane);

  // near the street every 16 m cell is a block; further out four cells share one
  if (!city.cells2) {
    const cw = height.width, ch = height.height, hd = height.data, c2 = [];
    for (let j = 0; j < ch; j += 2) for (let i = 0; i < cw; i += 2) {
      let sh = 0, sc = 0, n = 0;
      for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
        if (i + di >= cw || j + dj >= ch) continue;
        const o = ((j + dj) * cw + i + di) * 4;
        if (hd[o]) { sh += hd[o] * hd[o + 1]; sc += hd[o + 1]; n++; }
      }
      if (n) c2.push(ex0 + (i + 1) * city.cell, ey1 - (j + 1) * city.cell, sh / sc, sc / 255 / 4);
    }
    city.cells2 = new Float32Array(c2);
  }
  const NEAR = lite ? 500 : 1300, FAR = lite ? 5000 : 1e9;
  const cxm = (R.x0 + R.x1) / 2, czm = (R.z0 + R.z1) / 2;
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const inst = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), city.cells.length / 4);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const tones = ['#c7b29a', '#b9a58f', '#d2c4b0', '#a89684', '#c9bcae', '#b6aea4', '#cbb7a2', '#9fa3a8'].map((t) => new THREE.Color(t));
  let k = 0;
  const put = (cs, cell, near) => {
    const n = cs.length / 4;
    for (let i = 0; i < n; i++) {
      const mx = cs[i * 4], my = cs[i * 4 + 1];
      const [sx, sz] = f.S(mx, my);
      const d = Math.max(Math.abs(sx - cxm) - (R.x1 - R.x0) / 2, Math.abs(sz - czm) - (R.z1 - R.z0) / 2);
      if (d < 4 + (near ? 0 : cell / 2)) continue; // the detailed area draws its own buildings
      if (near ? d > NEAR : d <= NEAR || d > FAR) continue;
      const side = cell * Math.sqrt(clamp(cs[i * 4 + 3] * 1.15, 0.2, 1));
      m.compose(p.set(mx, 0, -my), q, s.set(side, cs[i * 4 + 2], side));
      inst.setMatrixAt(k, m);
      col.copy(tones[Math.floor(hash2(Math.round(mx), Math.round(my)) * tones.length)]);
      if (cs[i * 4 + 2] > 40) col.set('#aebbc4');
      inst.setColorAt(k, col);
      k++;
    }
  };
  put(city.cells, city.cell, true);
  put(city.cells2, city.cell * 2, false);
  inst.count = k;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.frustumCulled = false;
  g.add(inst);
  return g;
}

// ---------------------------------------------------------------- build
/**
 * st: street properties; geometry: its MultiLineString coordinates (lon/lat).
 * Returns the scene group plus everything the stage and the gags need to play on it.
 */
export async function buildWorld(st, geometry, { night = false, seed = '', lite = false } = {}) {
  const city = await loadCity(), ix = city.ix;
  const t0 = performance.now();
  const rnd = makeRng(hashStr((st.name || '') + '|' + (st.buurt || '') + '|' + seed));
  const f = frameFor(ix, geometry);
  const streetLen = polyLen(f.spine);
  const margin = lite ? 150 : streetLen > 900 ? 190 : 250;
  const tiles = await Promise.all(tileKeys(f, margin).map(async (k) => [k, await loadTile(ix, k)]));
  const t1 = performance.now();

  // ---- decode buildings first: they decide which side the camera stands on
  const decodeB = () => {
    const out = [];
    for (const [key, t] of tiles) {
      if (!t || !t.b) continue;
      const [tx, ty] = key.split('_').map(Number), ox = tx * TILE, oy = ty * TILE;
      for (const e of t.b) {
        const ring = [];
        for (let i = 3; i + 1 < e.length; i += 2) ring.push(f.S(ox + e[i] / 10, oy + e[i + 1] / 10));
        if (ring.length >= 3) out.push({ ring, h: e[0], roof: e[1], year: e[2] });
      }
    }
    return out;
  };
  let bld = decodeB();
  let spine = f.spine.map((p) => f.S(p[0], p[1]));
  {
    const tmp = new Path(spine);
    let nB = 0, nF = 0;
    for (const b of bld) {
      const p = b.ring[0], pr = tmp.project(p[0], p[1]);
      if (pr.d > 32 || pr.s < 1 || pr.s > tmp.len - 1) continue;
      if (pr.v < 0) nB++; else nF++;
    }
    if (nF > nB * 1.15 + 1) {
      // turn the frame around so the busier side is across the street from the camera
      f.dx = -f.dx; f.dy = -f.dy;
      spine = f.spine.map((p) => f.S(p[0], p[1])).reverse();
      bld = decodeB();
    }
  }
  const R = regionOf(f, margin);
  const inR = (x, z, pad = 0) => x > R.x0 - pad && x < R.x1 + pad && z > R.z0 - pad && z < R.z1 + pad;
  bld = bld.filter((b) => inR(b.ring[0][0], b.ring[0][1], 20));

  // ---- decode the rest
  const gnd = [], roads = [], rails = [], trees = [], pois = [];
  for (const [key, t] of tiles) {
    if (!t) continue;
    const [tx, ty] = key.split('_').map(Number), ox = tx * TILE, oy = ty * TILE;
    const flat = (e, from) => {
      const a = new Float32Array(e.length - from);
      let any = false;
      for (let i = from; i + 1 < e.length; i += 2) {
        const p = f.S(ox + e[i] / 10, oy + e[i + 1] / 10);
        a[i - from] = p[0]; a[i - from + 1] = p[1];
        if (!any && inR(p[0], p[1], 30)) any = true;
      }
      return any ? a : null;
    };
    for (const e of t.g || []) {
      const rings = [];
      for (let i = 2; i < e.length; i++) { const r = flat(e[i], 0); if (r) rings.push(r); else if (i === 2) break; }
      if (rings.length) gnd.push({ cls: e[0], area: e[1], rings });
    }
    for (const e of t.r || []) {
      const a = flat(e, 4);
      if (a) roads.push({ cls: e[0], w: e[1] / 10, name: e[2] >= 0 ? t.n[e[2]] : '', flags: e[3], a });
    }
    for (const e of t.l || []) {
      const a = flat(e, 2);
      if (a) rails.push({ kind: e[0], flags: e[1], a });
    }
    if (t.t) for (let i = 0; i + 1 < t.t.length; i += 2) { const p = f.S(ox + t.t[i] / 10, oy + t.t[i + 1] / 10); if (inR(p[0], p[1])) trees.push(p); }
    for (const e of t.p || []) { const p = f.S(ox + e[1] / 10, oy + e[2] / 10); if (inR(p[0], p[1])) pois.push({ kind: e[0], x: p[0], z: p[1] }); }
  }

  // ---- the path: the street itself, continued around the corner at both ends so traffic has somewhere to come from
  const drivable = (r) => r.cls <= 9 || r.cls === 13;
  const extend = (end, dir, maxLen = 70) => {
    const out = [];
    let cur = end, d = dir, remain = maxLen;
    const used = new Set();
    for (let it = 0; it < 6 && remain > 2; it++) {
      let best = null;
      for (const r of roads) {
        if (used.has(r) || !drivable(r) || r.flags & 4) continue;
        const a = r.a, n = a.length >> 1;
        let k = -1, kd = 36;
        for (let i = 0; i < n; i++) { const q = (a[i * 2] - cur[0]) ** 2 + (a[i * 2 + 1] - cur[1]) ** 2; if (q < kd) { kd = q; k = i; } }
        if (k < 0) continue;
        for (const step of [1, -1]) {
          // walk from k in this direction, skipping points that are not ahead of us
          let j = k;
          while (j >= 0 && j < n && (a[j * 2] - cur[0]) * d[0] + (a[j * 2 + 1] - cur[1]) * d[1] < 1.2 && Math.hypot(a[j * 2] - cur[0], a[j * 2 + 1] - cur[1]) < 8) j += step;
          if (j < 0 || j >= n) continue;
          const ex = a[j * 2] - cur[0], ez = a[j * 2 + 1] - cur[1], l = Math.hypot(ex, ez);
          if (l < 0.5) continue;
          const cos = (ex * d[0] + ez * d[1]) / l;
          if (cos < -0.3) continue;
          const score = cos - (r.cls > 7 ? 0.4 : 0);
          if (!best || score > best.score) best = { r, j, step, score };
        }
      }
      if (!best) break;
      used.add(best.r);
      const a = best.r.a, n = a.length >> 1;
      for (let j = best.j; j >= 0 && j < n && remain > 0; j += best.step) {
        const p = [a[j * 2], a[j * 2 + 1]], l = Math.hypot(p[0] - cur[0], p[1] - cur[1]);
        if (l < 0.3) continue;
        d = [(p[0] - cur[0]) / l, (p[1] - cur[1]) / l];
        if (l > remain) { out.push([cur[0] + d[0] * remain, cur[1] + d[1] * remain]); remain = 0; break; }
        out.push(p); cur = p; remain -= l;
      }
    }
    return out;
  };
  const unit = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const n0 = spine.length;
  const extA = extend(spine[0], unit(spine[Math.min(1, n0 - 1)], spine[0]));
  const extB = extend(spine[n0 - 1], unit(spine[Math.max(0, n0 - 2)], spine[n0 - 1]));
  const sA = polyLen([spine[0], ...extA]);
  const path = new Path([...extA.slice().reverse(), ...spine, ...extB], sA, sA + streetLen);

  // ---- buildings: boxes, how they face the street, which fronts get the full treatment
  const units = [];
  for (const b of bld) {
    b.o = obbOf(b.ring);
    b.area = ringArea(b.ring);
    b.rects = b.o.fill >= 0.72 ? [{ x: 0, z: 0, w: b.o.w, d: b.o.d }] : rectsOf(b.ring, b.o);
    const o = b.o, pr = path.project(o.cx, o.cz);
    b.s = pr.s; b.v = pr.v; b.dist = pr.d;
    if (pr.d > 70 || pr.d < 0.5 || b.h < 3.2 || b.area < 18 || pr.s < path.sA - 8 || pr.s > path.sB + 8) continue;
    // which side of its bounding box looks at the street?
    const fp = path.xz(pr.s, 0), nx = (fp[0] - o.cx) / pr.d, nz = (fp[1] - o.cz) / pr.d;
    const dU = o.ux * nx + o.uz * nz, dP = -o.uz * nx + o.ux * nz;
    let fnx, fnz, fd, fw;
    if (Math.abs(dU) >= Math.abs(dP)) { fd = o.w; fw = o.d; fnx = Math.sign(dU) * o.ux; fnz = Math.sign(dU) * o.uz; }
    else { fd = o.d; fw = o.w; fnx = Math.sign(dP) * -o.uz; fnz = Math.sign(dP) * o.ux; }
    const ax = -fnz, az = fnx; // along the facade
    const fcx = o.cx + fnx * fd / 2, fcz = o.cz + fnz * fd / 2;
    const gp = path.project(fcx, fcz);
    const tg = path.at(gp.s);
    if (gp.d > 22 || gp.d < 0.8 || Math.abs(fnx * tg.tx + fnz * tg.tz) > 0.6 || fw < 2.8) continue;
    const tower = b.h >= 22;
    const n = fw > (tower ? 34 : 11) ? Math.round(fw / (tower ? 22 : 6.5)) : 1, uw = fw / n;
    const depth = clamp(b.area / fw, 3.4, fd), wall = n > 1 && !tower && rnd.chance(0.5) ? rnd.pick(eraOf(b.year).wall) : null;
    const mine = [];
    for (let i = 0; i < n; i++) {
      const off = (i + 0.5 - n / 2) * uw, ux0 = fcx + ax * off, uz0 = fcz + az * off;
      // is there really building behind this stretch of the front?
      let hit = 0;
      for (const t of [-0.3, 0, 0.3]) if (inRing(ux0 + ax * t * uw - fnx * 1.2, uz0 + az * t * uw - fnz * 1.2, b.ring)) hit++;
      if (hit < 2) continue;
      const up = path.project(ux0, uz0);
      if (up.d < 0.8 || up.d > 22) continue;
      mine.push({ b, cx: ux0 - fnx * depth / 2, cz: uz0 - fnz * depth / 2, nx: fnx, nz: fnz, w: uw, d: depth, h: b.h, roof: b.roof, year: b.year, tower, wall, s: up.s, gap: up.d, side: up.v < 0 ? -1 : 1 });
    }
    if (mine.length >= Math.max(1, n * 0.6)) { b.units = mine; units.push(...mine); }
  }
  // fronts hidden behind a nearer building stay plain
  units.sort((a, b) => a.gap - b.gap);
  const heroes = [];
  const dropped = new Set();
  for (const u of units) {
    if (dropped.has(u.b)) continue;
    const hidden = heroes.some((h) => h.b !== u.b && h.side === u.side && Math.abs(h.s - u.s) < (h.w + u.w) * 0.3 && h.gap < u.gap - 1.5);
    if (hidden) { dropped.add(u.b); continue; }
    heroes.push(u);
  }
  for (const b of bld) if (b.units && !dropped.has(b)) b.hero = true;
  const heroUnits = heroes.filter((u) => !dropped.has(u.b));

  // how much room is there really between the fronts? scan outwards from the centre line
  const bgrid = new Grid(R.x0, R.z0, Math.ceil((R.x1 - R.x0) / 1), Math.ceil((R.z1 - R.z0) / 1), 1);
  for (const b of bld) { const a = new Float32Array(b.ring.length * 2); b.ring.forEach((p, i) => { a[i * 2] = p[0]; a[i * 2 + 1] = p[1]; }); b.flat = a; bgrid.fill([a], 1); }
  const built = { '-1': [], 1: [] }; // per 3 m of street: is there a building within 26 m on this side?
  const clearOf = (sgn) => {
    const ds = [];
    for (let s = path.sA; s < path.sB + 3; s += 3) {
      let d = 99;
      for (let v = 1; v < 26; v += 0.5) { const p = path.xz(s, sgn * v); if (bgrid.get(p[0], p[1]) === 1) { d = v; break; } }
      built[sgn].push(d < 99);
      if (s > path.sA + 1 && s < path.sB - 1) ds.push(Math.min(d, 20));
    }
    ds.sort((a, b) => a - b);
    return ds.length ? ds[Math.floor(ds.length * 0.3)] : 16;
  };
  const clearB = clearOf(-1), clearF = clearOf(1);
  const builtAt = (s, sgn) => { const a = built[sgn], i = clamp(Math.round((s - path.sA) / 3), 0, a.length - 1); return a[i] || a[Math.max(0, i - 1)] || a[Math.min(a.length - 1, i + 1)]; };
  const L = crossSection(st, clearB, clearF, night);

  // shops: real points of interest claim the nearest street-facing front
  for (const p of pois) {
    if (!POI_SHOP[p.kind]) continue;
    let best = null, bd = 16;
    for (const u of heroUnits) { if (u.shop || u.tower) continue; const d = Math.hypot(u.cx - p.x, u.cz - p.z) - u.d / 2; if (d < bd) { bd = d; best = u; } }
    if (best) best.shop = rnd.pick(POI_SHOP[p.kind]);
  }
  // cash machines: on the bank if there is one, otherwise on a wall every so often
  {
    const back = heroUnits.filter((u) => u.side < 0 && !u.tower).sort((a, b) => a.s - b.s);
    for (const u of back) if (u.shop === 'BANK') u.atm = true;
    let last = -1e9;
    for (const u of back) {
      if (u.atm) { last = u.s; continue; }
      if (u.shop || u.w < 4.4 || u.s - last < 110 || back.some((o) => o.atm && Math.abs(o.s - u.s) < 110)) continue;
      u.atm = true; last = u.s;
    }
  }

  // ---- ground raster
  const span = Math.max(R.x1 - R.x0, R.z1 - R.z0);
  const cell = lite ? (span > 1400 ? 2 : 1) : span > 2600 ? 2 : span > 1300 ? 1 : 0.5;
  const grid = new Grid(R.x0, R.z0, Math.ceil((R.x1 - R.x0) / cell), Math.ceil((R.z1 - R.z0) / cell), cell);
  {
    // sea from the city raster
    const { ground } = city, [ex0, , , ey1] = ix.extent, gc = ix.ground.cell, gw = ground.width, gh = ground.height, gd = ground.data;
    const a = grid.a, step = Math.max(1, Math.round(4 / cell));
    for (let j = 0; j < grid.h; j += step) for (let i = 0; i < grid.w; i += step) {
      const m = f.M(R.x0 + (i + 0.5) * cell, R.z0 + (j + 0.5) * cell);
      const ci = Math.floor((m[0] - ex0) / gc), cj = Math.floor((ey1 - m[1]) / gc);
      if (ci < 0 || cj < 0 || ci >= gw || cj >= gh || gd[(cj * gw + ci) * 4] !== 10) continue;
      for (let jj = j; jj < Math.min(grid.h, j + step); jj++) for (let ii = i; ii < Math.min(grid.w, i + step); ii++) a[jj * grid.w + ii] = C.SEA;
    }
  }
  const can = (...cls) => { const t = new Uint8Array(256); for (const c of cls) t[c] = 1; return t; };
  gnd.sort((a, b) => b.area - a.area);
  for (const g of gnd) if (g.cls !== 1) grid.fill(g.rings, g.cls);
  for (const g of gnd) if (g.cls === 1) grid.fill(g.rings, C.WATER);
  for (const r of roads) if (r.cls === 20) grid.stroke(r.a, r.w, C.WATER);
  const urban = can(C.LAND, C.PLAZA, C.PARKING);
  for (const r of roads) if (r.cls >= 2 && r.cls <= 7 && !(r.flags & 4)) grid.stroke(r.a, r.w + 4.4, C.WALK, urban);
  const order = [11, 12, 10, 9, 8, 7, 6, 5, 13, 4, 3, 2, 1];
  const surf = { 11: C.FOOT, 12: C.DIRT, 10: C.CYCLE, 9: C.SERVICE, 8: C.PED, 7: C.KLINKER, 6: C.KLINKER, 5: C.ASPHALT, 13: C.ASPHALT, 4: C.ASPHALT, 3: C.ASPHALT, 2: C.ASPHALT, 1: C.ASPHALT };
  for (const cls of order) for (const r of roads) {
    if (r.cls !== cls || r.flags & 4) continue;
    grid.stroke(r.a, cls === 11 ? Math.max(1.5, r.w) : r.w, cls === 11 && r.flags & 16 ? C.DIRT : surf[cls]);
  }
  // the street itself, with its own lanes, bike lanes, kerbs and pavements
  {
    const q = cell * 0.5, hb = L.hw + L.bw, fr = {};
    const canWalk = can(C.LAND, C.PLAZA, C.PARKING, C.WALK, C.FOOT, C.DIRT, C.SERVICE);
    const road = L.kind === 'ped' ? C.PED : L.kind === 'minor' ? C.KLINKER : C.ASPHALT;
    L.zebras = [];
    const dashes = L.kind === 'major' && !rails.some((r) => { if (r.kind === 2 || r.flags & 4) return false; for (let i = 0; i + 1 < r.a.length; i += 6) { const pr = path.project(r.a[i], r.a[i + 1]); if (pr.d < 4 && pr.s > path.sA && pr.s < path.sB) return true; } return false; });
    if (L.kind !== 'ped') for (let z = path.sA + 18 + rnd.range(0, 10); z < path.sB - 8; z += rnd.range(60, 90)) L.zebras.push(z);
    for (let s = path.sA; s <= path.sB; s += q) {
      path.at(s, fr);
      const zeb = L.zebras.some((z) => Math.abs(z - s) < 1.1), urbB = builtAt(s, -1), urbF = builtAt(s, 1);
      for (let v = -(hb + L.swB); v <= hb + L.swF; v += q) {
        const x = fr.x - fr.tz * v, z = fr.z + fr.tx * v, av = Math.abs(v);
        if (av <= L.hw) {
          let c = road;
          if (dashes && av < 0.13 && (s - path.sA) % 2.6 < 1.1) c = C.MARK;
          if (zeb && av < L.hw - 0.25 && ((v + L.hw) % 0.9) < 0.45) c = C.MARK;
          grid.set(x, z, c);
        } else if (L.kind === 'ped') grid.set(x, z, C.PED, canWalk);
        else if (av <= hb) grid.set(x, z, C.BIKELANE);
        else if (!(v < 0 ? urbB : urbF)) continue;
        else if (av <= hb + 0.3) grid.set(x, z, C.CURB, canWalk);
        else grid.set(x, z, C.WALK, canWalk);
      }
    }
  }
  const noRoad = can(C.LAND, C.GRASS, C.FOREST, C.SAND, C.DUNE, C.FARM, C.PLAZA, C.PARKING, C.WALK, C.WATER, C.SEA, C.FOOT, C.DIRT, C.PITCH);
  let tramOnStreet = 0;
  for (const r of rails) {
    if (r.flags & 4) continue;
    grid.stroke(r.a, r.kind === 2 ? 3.2 : 2.5, C.RAILBED, noRoad);
    grid.stroke(r.a, cell, C.RAIL, null, 0.72);
    grid.stroke(r.a, cell, C.RAIL, null, -0.72);
    if (r.kind !== 2) for (let i = 0; i + 1 < r.a.length; i += 8) { const pr = path.project(r.a[i], r.a[i + 1]); if (pr.d < 6 && pr.s > path.sA && pr.s < path.sB) tramOnStreet++; }
  }
  L.tramNear = tramOnStreet > 2;
  for (const b of bld) grid.fill([b.flat], C.BUILDING);

  // ---- scene objects
  const group = new THREE.Group();
  const disposables = [];
  {
    const w = grid.w, h = grid.h, a = grid.a, data = new Uint8Array(w * h * 4);
    for (let j = 0, o = 0; j < h; j++) {
      const bz = Math.floor(j * cell);
      for (let i = 0; i < w; i++, o += 4) {
        const p = LUT[a[j * w + i]] || LUT[0], bx = Math.floor(i * cell);
        let alt = false;
        if (p.check) alt = ((Math.floor((i * cell) / p.check) + Math.floor((j * cell) / p.check)) & 1) === 1;
        else if (p.stripe) alt = (Math.floor((j * cell) / p.stripe) & 1) === 1;
        else if (p.speck) alt = hash2(bx, bz) < p.speck;
        const c = alt ? p.b : p.a, k = 0.97 + hash2(bx + 91, bz + 17) * 0.06;
        data[o] = Math.min(255, c[0] * k); data[o + 1] = Math.min(255, c[1] * k); data[o + 2] = Math.min(255, c[2] * k); data[o + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    disposables.push(tex);
    const geo = new THREE.BufferGeometry();
    const X1 = R.x0 + w * cell, Z1 = R.z0 + h * cell;
    geo.setAttribute('position', new THREE.Float32BufferAttribute([R.x0, 0, R.z0, X1, 0, R.z0, X1, 0, Z1, R.x0, 0, Z1], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 3, 2, 0, 2, 1]);
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    ground.receiveShadow = true;
    ground.renderOrder = -2;
    group.add(ground);
  }

  // buildings, merged into chunks
  const chunks = new Map(), CH = 110;
  const chunkOf = (x, z) => {
    const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = { v: new Vox(rnd.int(1, 9999), true), gl: new Vox(rnd.int(1, 9999), true) }));
    return c;
  };
  const heroInfo = [], signs = [];
  for (const b of bld) {
    if (b.hero) {
      for (const u of b.units) {
        const c = chunkOf(u.cx, u.cz), hi = drawHero(c.v, c.gl, u, rnd, night);
        heroInfo.push(hi);
        if (hi.sign) { group.add(hi.sign); signs.push({ m: hi.sign, x: u.cx, z: u.cz }); }
      }
    } else { const c = chunkOf(b.o.cx, b.o.cz); drawGeneric(c.v, c.gl, b, b.dist < (lite ? 60 : 115) ? 1 : 2, rnd, night); }
  }
  for (const c of chunks.values()) {
    c.v.setT(); c.gl.setT();
    if (!c.v.empty) { const m = c.v.mesh(CUT.solid); m.customDepthMaterial = CUT.depth; group.add(m); }
    if (!c.gl.empty) { const m = new THREE.Mesh(c.gl.geometry(), CUT.glow); group.add(m); }
  }

  // trees
  {
    const pts = [], hb = L.hw + L.bw + 0.4;
    const okCls = can(C.LAND, C.GRASS, C.FOREST, C.DUNE, C.SAND, C.FARM, C.PLAZA, C.WALK, C.PARKING, C.FOOT, C.DIRT, C.PITCH, C.CURB);
    const push = (x, z, sc) => {
      if (!inR(x, z, -2) || !okCls[grid.get(x, z)]) return;
      const pr = path.project(x, z);
      if (Math.abs(pr.v) < hb && pr.s > path.sA - 2 && pr.s < path.sB + 2) return;
      if (pr.d > 150 && rnd() < 0.35) return;
      pts.push(x, z, sc * (pr.d > 150 ? 1.2 : 1));
    };
    for (const p of trees) push(p[0], p[1], rnd.range(1.35, 1.95));
    const step = lite ? 9 : 6.5;
    for (let z = R.z0 + 2; z < R.z1; z += step) for (let x = R.x0 + 2; x < R.x1; x += step) {
      const jx = x + rnd.range(-2.6, 2.6), jz = z + rnd.range(-2.6, 2.6), cl = grid.get(jx, jz);
      if (cl === C.FOREST) { if (rnd() < 0.92) push(jx, jz, rnd.range(1.7, 2.6)); }
      else if (cl === C.GRASS) { if (rnd() < 0.07) push(jx, jz, rnd.range(1.3, 2.0)); }
      else if (cl === C.DUNE) { if (rnd() < 0.06) push(jx, jz, rnd.range(0.5, 0.9)); }
    }
    const n = Math.min(pts.length / 3, lite ? 6000 : 16000);
    if (n > 0) {
      const tv = new Vox(5);
      tv.box(0, 0, 0, 0.42, 1.8, 0.42, '#7a5234');
      tv.box(0, 1.8, 0, 2.2, 0.8, 2.2, '#3f9a48');
      tv.box(0, 2.6, 0, 2.7, 1.0, 2.7, '#4caf50');
      tv.box(0.1, 3.6, -0.1, 1.9, 0.8, 1.9, '#5cbd5c');
      tv.box(0, 4.4, 0, 0.9, 0.4, 0.9, '#68c765');
      const geo = tv.geometry(), aB = new Float32Array(n * 4);
      const inst = new THREE.InstancedMesh(geo, CUT.solid, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
      const stride = pts.length / 3 / n;
      for (let i = 0; i < n; i++) {
        const k = Math.floor(i * stride) * 3, sc = pts[k + 2];
        e.set(0, Math.floor(rnd() * 4) * (Math.PI / 2), 0);
        m.compose(p.set(pts[k], 0, pts[k + 1]), q.setFromEuler(e), s.set(sc * rnd.range(0.9, 1.1), sc, sc * rnd.range(0.9, 1.1)));
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, col.setRGB(rnd.range(0.82, 1.08), rnd.range(0.9, 1.1), rnd.range(0.78, 1.0)));
        aB[i * 4] = pts[k]; aB[i * 4 + 1] = pts[k + 1]; aB[i * 4 + 2] = 4.8 * sc; aB[i * 4 + 3] = -1;
      }
      geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
      inst.castShadow = true; inst.receiveShadow = true;
      inst.customDepthMaterial = CUT.depth;
      inst.frustumCulled = false;
      group.add(inst);
    }
  }

  // rails and big roads as paths for trams and passing traffic
  const flatToPts = (a) => { const o = []; for (let i = 0; i + 1 < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; };
  const tramLines = chain(rails.filter((r) => r.kind !== 2 && !(r.flags & 4)).map((r) => flatToPts(r.a)), 5, 0.6).filter((p) => polyLen(p) > 140).map((p) => new Path(p));
  const sideRoads = chain(roads.filter((r) => r.cls >= 2 && r.cls <= 4 && !(r.flags & 4) && r.name !== st.name).map((r) => flatToPts(r.a)), 5, 0.7).filter((p) => polyLen(p) > 160).map((p) => new Path(p));

  const W = {
    group, path, grid, frame: f, region: R, L, st, rnd, night, lite,
    heroes: heroInfo, signs, pois, roads, tramLines, sideRoads, builtAt,
    anchors: { houses: [], shops: [], racks: [], benches: [], bins: [], parked: [], lamps: [], stalls: [], chimneys: [], atms: [], boxes: [] },
    northAz: Math.atan2(-f.dy, f.dx),
    toScene: (lon, lat) => f.S((lon - ix.proj.lon0) * ix.proj.kx, (lat - ix.proj.lat0) * ix.proj.ky),
    C,
  };
  dress(W);
  group.add(cityBackdrop(city, f, R, lite));
  W.ms = { fetch: Math.round(t1 - t0), build: Math.round(performance.now() - t1) };
  W.dispose = () => {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
      if (o.material && o.material !== CUT.solid && o.material !== CUT.glow && !o.material.vertexColors) o.material.dispose();
    });
    for (const t of disposables) t.dispose();
  };
  return W;
}
