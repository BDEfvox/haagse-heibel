// Builds the voxel world around one street from real map data: ground, roads, buildings, trees,
// plus a low-detail model of the whole city for the horizon and the sky drop.
import * as THREE from 'three';
import { Vox, MAT, clamp, makeRng, hashStr } from './kit.js';
import * as P from './props.js';
import { Path, Grid, obbOf, rectsOf, ringArea, inRing, chain, polyLen } from './geo.js';
import { crossSection, dress } from './street.js';
import { drawTyped, drawParts, drawFeature, drawBarriers, TYPED, specialOf } from './landmarks.js';
import { SPECIAL_PARTS } from './special-parts.js';
import { furnishTile } from './furnish.js';

const ROOT = './data/world/';
const TILE = 256;
let _index = null, _city = null;
const _tiles = new Map();

export const C = {
  LAND: 0, WATER: 1, GRASS: 2, FOREST: 3, SAND: 4, DUNE: 5, PITCH: 6, FARM: 7, PLAZA: 8, PARKING: 9, SEA: 10,
  ASPHALT: 20, KLINKER: 21, SERVICE: 22, CYCLE: 23, FOOT: 24, PED: 25, DIRT: 26, RAILBED: 27, RAIL: 28,
  WALK: 30, CURB: 31, MARK: 32, BIKELANE: 34, BUILDING: 40,
};
// Dutch street materials: grey concrete paving tiles, red-brown clinker streets, red asphalt cycle paths,
// dark asphalt main roads, murky green canal water and a grey-green North Sea.
const PAL = {
  0: { c: '#b9bba9', alt: '#aeb19e', speck: 0.14 },
  1: { c: '#5d8a8c', alt: '#77a3a2', speck: 0.03 },
  2: { c: '#7aa95b', alt: '#6e9d52', speck: 0.16 },
  3: { c: '#5c8f4b', alt: '#507f43', speck: 0.3 },
  4: { c: '#e6d5a6', alt: '#dcc894', speck: 0.16 },
  5: { c: '#c8cb97', alt: '#a7b87b', speck: 0.3 },
  6: { c: '#62ad63', alt: '#58a15a', stripe: 4 },
  7: { c: '#a4bf76', alt: '#98b56a', stripe: 3 },
  8: { c: '#c7bdab', alt: '#bcb19e', check: 1.5 },
  9: { c: '#7e828a', alt: '#757981', speck: 0.12 },
  10: { c: '#6f9aa2', alt: '#dcebea', speck: 0.012 },
  11: { c: '#5f636c' }, 12: { c: '#b79a90' }, 13: { c: '#8d8577' },
  20: { c: '#4e5259', alt: '#484c53', speck: 0.2 },
  21: { c: '#8f7169', alt: '#866860', check: 1 },
  22: { c: '#6c7078', alt: '#666a72', speck: 0.2 },
  23: { c: '#a65c4f', alt: '#9d5549', speck: 0.15 },
  24: { c: '#c6bfae', alt: '#bcb4a2', check: 1 },
  25: { c: '#c3b59d', alt: '#b8a98f', check: 1.5 },
  26: { c: '#cbb98e', alt: '#bfac80', speck: 0.25 },
  27: { c: '#8d8577', alt: '#837b6e', speck: 0.3 },
  28: { c: '#8f959c' },
  30: { c: '#b4b4ae', alt: '#a9a9a3', check: 1 },
  31: { c: '#cdcabf' },
  32: { c: '#ecece6' },
  34: { c: '#a65c4f', alt: '#9d5549', speck: 0.15 },
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
  return (_index ||= getJson(ROOT + 'index.json').then((ix) => {
    if (!ix || !Array.isArray(ix.tiles) || !ix.proj) throw new Error('world index missing');
    ix.set = new Set(ix.tiles);
    return ix;
  }).catch((e) => { _index = null; throw e; }));
}
/** The pixels of an image. `div` reads every div-th pixel only (phones cannot hold the full height map in a canvas). */
async function pixels(url, div = 1) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth / div); c.height = Math.round(img.naturalHeight / div);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false; // the values are codes, not colours: never blend neighbours
  g.drawImage(img, 0, 0, c.width, c.height);
  return g.getImageData(0, 0, c.width, c.height);
}
let _maxTex = 16384;
/** The largest texture the graphics card takes (the stage tells us before anything is loaded). */
export function setMaxTexture(n) { if (n > 0) _maxTex = n; }
const SMALL = typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 560);
export function loadCity() {
  return (_city ||= (async () => {
    const ix = await loadIndex();
    // phones, and graphics cards that cannot hold the full height map as a texture, get the half-size one
    const T = ix.terrain, half = !!T && (SMALL || _maxTex < T.w), small = half && T.small ? T.small : null;
    const [ground, height, terr] = await Promise.all([pixels(ROOT + ix.ground.file), pixels(ROOT + ix.height.file),
      T ? pixels(ROOT + (small ? small.file : T.file), half && !small ? 2 : 1).catch(() => null) : null]);
    const city = { ix, ground, height };
    setupTerrain(city, terr, half ? (small ? small.cell / T.cell : 2) : 1);
    return city;
  })().catch((e) => { _city = null; throw e; }));
}

// ---------------------------------------------------------------- terrain
// Ground heights come from the national height model (8 m cells, metres above sea level). The Hague is
// nearly flat, so heights are stretched a little; water sits below its banks like it does in real life.
export const EX = 1.4;
const NATURAL = new Uint8Array(256);
for (const c of [2, 3, 4, 5, 6, 7]) NATURAL[c] = 1;
function setupTerrain(city, img, div = 1) {
  const ix = city.ix, [ex0, , , ey1] = ix.extent, T = ix.terrain;
  const on = !!(img && T), cell = on ? T.cell * div : 8;
  const w = on ? img.width : 1, h = on ? img.height : 1, v = new Uint8Array(w * h), lut = new Float32Array(256);
  if (on) {
    for (let i = 0, n = w * h; i < n; i++) v[i] = img.data[i * 4];
    const [h0, s0, vk, h1, s1] = T.enc;
    for (let k = 0; k < 256; k++) lut[k] = (k <= vk ? h0 + s0 * k : h1 + s1 * (k - vk)) * EX;
  }
  const cl = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);
  const bil = (px, py, at) => {
    const i = Math.floor(px), j = Math.floor(py), tx = px - i, ty = py - j;
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  const landPx = (i, j) => lut[v[cl(j, h) * w + cl(i, w)]];
  /** Height of the land surface at a point given in map metres. */
  city.landAt = on ? (mx, my) => bil((mx - ex0) / cell - 0.5, (ey1 - my) / cell - 0.5, landPx) : () => 0;

  // Water level: the lowest land within 24 m, minus a drop (deep between quays, shallow between grassy banks).
  // It depends on the position alone, so separately built pieces of the world meet without a step.
  const G = city.ground, gw = G.width, gh = G.height, gd = G.data, gc = ix.ground.cell, BL = 64, blocks = new Map();
  const cls = (i, j) => gd[(cl(Math.round(((j + 0.5) * cell) / gc - 0.5), gh) * gw + cl(Math.round(((i + 0.5) * cell) / gc - 0.5), gw)) * 4];
  const rr = Math.max(1, Math.round(24 / cell)), rn = Math.max(1, Math.round(8 / cell));
  const node = (i, j) => {
    if (cls(i, j) === 10) return -0.12; // the sea
    let m = Infinity;
    if (on) { for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) { const q = landPx(i + di, j + dj); if (q < m) m = q; } } else m = 0;
    let nat = 0, urb = 0;
    for (let dj = -rn; dj <= rn; dj += rn) for (let di = -rn; di <= rn; di += rn) { const c = cls(i + di, j + dj); if (c === 1 || c === 10) continue; if (NATURAL[c]) nat++; else urb++; }
    return m - (1.55 - 0.95 * (nat + urb ? nat / (nat + urb) : 0.5));
  };
  const waterPx = (i, j) => {
    const bi = Math.floor(i / BL), bj = Math.floor(j / BL), key = bj * 4096 + bi;
    let b = blocks.get(key);
    if (!b) {
      b = new Float32Array(BL * BL);
      for (let y = 0; y < BL; y++) for (let x = 0; x < BL; x++) b[y * BL + x] = node(bi * BL + x, bj * BL + y);
      blocks.set(key, b);
    }
    return b[(j - bj * BL) * BL + (i - bi * BL)];
  };
  /** Height of the water surface at a point given in map metres. */
  city.waterAt = (mx, my) => bil((mx - ex0) / cell - 0.5, (ey1 - my) / cell - 0.5, waterPx);

  // the same heights for the vertex shader that seats buildings on the ground
  const tex = new THREE.DataTexture(v, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  U.uTerr.value = tex;
  U.uTS.value.set(w, h);
  if (on) { const [h0, s0, vk, h1, s1] = T.enc; U.uEnc.value.set(h0 * EX, s0 * EX, vk, 0); U.uEnc2.value.set(h1 * EX, s1 * EX); }
  city.terr = { on, cell };
}
/** Point the terrain shader at a street's frame (scene coords → height raster pixels). */
function frameTerrain(city, f) {
  const [ex0, , , ey1] = city.ix.extent, c = city.terr.cell;
  U.uTO.value.set((f.ox - ex0) / c - 0.5, (ey1 - f.oy) / c - 0.5);
  U.uTX.value.set(f.dx / c, -f.dy / c);
  U.uTZ.value.set(f.dy / c, f.dx / c);
}
function loadTile(ix, key) {
  if (!ix.set.has(key)) return Promise.resolve(null);
  if (_tiles.has(key)) { const hit = _tiles.get(key); _tiles.delete(key); _tiles.set(key, hit); return hit; } // recently used tiles are kept longest
  if (!_tiles.has(key)) {
    if (_tiles.size > 420) _tiles.delete(_tiles.keys().next().value);
    const req = getJson(`${ROOT}tiles/${key}.json`);
    _tiles.set(key, req);
    // a failed download is not remembered: the next street that needs this tile asks again
    req.then((v) => { if (!v && _tiles.get(key) === req) _tiles.delete(key); });
  }
  return _tiles.get(key);
}
/** Warm the caches (called at boot and on hover). */
export function preload(geometry) {
  loadCity().then(({ ix }) => {
    if (!geometry) return;
    const f = frameFor(ix, geometry);
    for (const k of tileKeys(f, 120).slice(0, 30)) loadTile(ix, k); // a hover is only a hint: warm a handful, not a whole long street
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
  // how far towards the camera a building's centre must be before it ducks, in half-depths (0 = anything on the camera's side)
  uHalf: { value: 0.5 },
  // terrain heights (see setupTerrain / frameTerrain)
  uTerr: { value: null }, uTS: { value: new THREE.Vector2(1, 1) }, uTO: { value: new THREE.Vector2() }, uTX: { value: new THREE.Vector2() }, uTZ: { value: new THREE.Vector2() },
  uEnc: { value: new THREE.Vector4() }, uEnc2: { value: new THREE.Vector2() },
  // the detailed area around the street (x0, z0, x1, z1): streamed tiles leave it alone
  uClip: { value: new THREE.Vector4(1, 1, -1, -1) },
  // far-away building blocks: fine ones within uNear of the camera target, coarse ones beyond, none past uFar
  uNear: { value: 1300 }, uFar: { value: 1e9 }, uMask: { value: null }, uExt: { value: new THREE.Vector2() },
  // painted windows: lit at night
  uNight: { value: 0 },
};
const TERR_GLSL = `
uniform sampler2D uTerr; uniform vec2 uTS; uniform vec2 uTO; uniform vec2 uTX; uniform vec2 uTZ; uniform vec4 uEnc; uniform vec2 uEnc2;
float terrV(ivec2 p) {
  float v = texelFetch(uTerr, clamp(p, ivec2(0), ivec2(uTS) - 1), 0).r * 255.0;
  return v <= uEnc.z + 0.5 ? uEnc.x + uEnc.y * v : uEnc2.x + uEnc2.y * (v - uEnc.z);
}
float terrAt(vec2 s) {
  vec2 p = uTO + s.x * uTX + s.y * uTZ, f = floor(p), t = p - f;
  ivec2 i = ivec2(f);
  return mix(mix(terrV(i), terrV(i + ivec2(1, 0)), t.x), mix(terrV(i + ivec2(0, 1)), terrV(i + ivec2(1, 1)), t.x), t.y);
}`;
/**
 * `tint`: flattened buildings turn grey. `tile`: the mesh belongs to a streamed tile, whose geometry is in the
 * tile's own coordinates and which steps aside wherever the detailed area around the street draws the same thing.
 */
function cutPatch(mat, tint = true, tile = false) {
  const windows = tint && mat.isMeshLambertMaterial;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aB;\nattribute float aW;\nuniform vec3 uFocus;\nuniform vec2 uCamDir;\nuniform float uTan;\nuniform float uR;\nuniform float uCut;\nuniform float uGrow;\nuniform float uHalf;\nuniform vec4 uClip;\nvarying float vCut;\nvarying float vWU;\nvarying float vWY;\nflat varying vec3 vWF;' + TERR_GLSL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCut = 0.0; vWU = aW; vWY = position.y; vWF = vec3(abs(aW), aB.z - 2.0, fract(aB.x * 0.137 + aB.y * 0.291));
        if (aB.z > 0.0) {
          vec2 bXZ = (modelMatrix * vec4(aB.x, 0.0, aB.y, 1.0)).xz; // where its owner stands, in scene coords
          float cutR = max(aB.w, 0.0);
          vec2 cutD = bXZ - uFocus.xz;
          float cutT = dot(cutD, uCamDir);
          float cutL = length(cutD - uCamDir * cutT);
          float cutH = max(0.3, (cutT - cutR - 7.0) * uTan);
          float cutW = uCut * smoothstep(-1.0, 3.0, cutT - cutR * uHalf) * (1.0 - smoothstep(uR, uR * 1.5, cutL));
          float cutK = smoothstep(0.7, 1.0, cutH / aB.z);
          if (aB.w < 0.0) {
            // trees shrink to shrubs (their place on the ground is in the instance matrix)
            float cutS = mix(1.0, mix(0.2, 1.0, cutK), cutW);
            transformed *= cutS * uGrow;
          } else {
            // a building either clears the sight line to the street or lies down flat: half-squashed fronts look wrong
            float cutS = mix(1.0, mix(0.22 / aB.z, 1.0, cutK), cutW);
            transformed.y *= cutS * uGrow;
            transformed.y += terrAt(bXZ) + 0.1; // it stands on the ground under its centre
            vCut = 1.0 - cutS;
          }
          ${tile ? 'if (aB.w >= 0.0 && bXZ.x > uClip.x && bXZ.y > uClip.y && bXZ.x < uClip.z && bXZ.y < uClip.w) transformed = vec3(0.0);' : ''}
        }`);
    if (tint) sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCut;\nvarying float vWU;\nvarying float vWY;\nflat varying vec3 vWF;\nuniform float uNight;\nfloat wHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wGlow = 0.0; vec3 wLit = vec3(0.0);
        ${windows ? `float wDu = fwidth(vWU), wDy = fwidth(vWY); // derivatives must not be taken inside a branch
        if (vWF.x > 999.0) {
          // windows painted on a plain wall: evenly spread along it, one row per floor
          float wMode = floor(vWF.x / 1000.0), wLen = vWF.x - wMode * 1000.0, wTop = vWF.y;
          float wT = clamp((vWU / vWF.x + 1.0) * 0.5, 0.0, 1.0);
          float wN = wMode > 1.5 ? 1.0 : max(1.0, floor(wLen / 3.1)), wPitch = wMode > 1.5 ? 3.0 : 2.8;
          float wX = wT * wN, wFy = (vWY - (wMode > 1.5 ? 3.0 : 0.95)) / wPitch;
          vec2 wC = vec2(fract(wX), fract(wFy)), wE = vec2(wDu * 0.5 * wN / vWF.x, wDy / wPitch) + 1e-4;
          vec2 wLo = wMode > 1.5 ? vec2(0.4 / wLen, 0.08) : vec2(0.27, 0.0), wHi = wMode > 1.5 ? vec2(1.0 - 0.4 / wLen, 0.52) : vec2(0.73, 0.47);
          vec2 wIn = smoothstep(wLo - wE, wLo + wE, wC) * (1.0 - smoothstep(wHi - wE, wHi + wE, wC));
          float wOn = wIn.x * wIn.y * step(0.0, wFy) * step(vWY + (wMode > 1.5 ? 1.4 : 1.5), wTop) * (1.0 - smoothstep(0.05, 0.3, vCut));
          wOn *= 1.0 - smoothstep(0.35, 0.9, max(wE.x, wE.y)); // too far away to tell windows apart: let them melt into the wall
          float wR = wHash(vec3(floor(wX) + wLen, floor(wFy), vWF.z * 91.0));
          vec3 wGlass = mix(vec3(0.27, 0.57, 0.8), vec3(0.016, 0.03, 0.07), uNight);
          wGlass *= 0.86 + 0.28 * wR;
          diffuseColor.rgb = mix(diffuseColor.rgb, wGlass, wOn);
          wGlow = wOn * uNight * step(wMode > 1.5 ? 0.6 : 0.7, wR);
          wLit = mix(vec3(1.0, 0.7, 0.2), vec3(1.0, 0.86, 0.5), fract(wR * 7.3));
        }` : ''}
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.62, 0.58), smoothstep(0.2, 0.85, vCut) * 0.93);`)
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, wLit, wGlow);\n\t#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'cut11' + (tint ? 't' : '') + (tile ? 'T' : '') + (windows ? 'w' : '');
  return mat;
}
/** Ground pieces outside the detailed area leave a hole where that area is. */
function clipPatch(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uClip = U.uClip;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vXZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vXZ;\nuniform vec4 uClip;')
      .replace('#include <map_fragment>', 'if (vXZ.x > uClip.x && vXZ.y > uClip.y && vXZ.x < uClip.z && vXZ.y < uClip.w) discard;\n\t#include <map_fragment>');
  };
  mat.customProgramCacheKey = () => 'clip2';
  return mat;
}
/** Far-away building blocks pick their own level of detail: see U.uNear. */
function blockPatch(mat, fine) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uFocus: U.uFocus, uNear: U.uNear, uFar: U.uFar, uClip: U.uClip, uMask: U.uMask, uExt: U.uExt });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFocus;\nuniform float uNear;\nuniform float uFar;\nuniform vec4 uClip;\nuniform sampler2D uMask;\nuniform vec2 uExt;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec2 bm = vec2(instanceMatrix[3].x, -instanceMatrix[3].z);
          vec2 bp = (floor((bm - uExt) / 32.0) + 0.5) * 32.0 + uExt; // the 32 m cell it belongs to decides, so fine and coarse blocks swap together
          vec4 bs = modelMatrix * vec4(bp.x, 0.0, -bp.y, 1.0);
          vec4 bc = modelMatrix * vec4(bm.x, 0.0, -bm.y, 1.0);
          float bd = distance(bs.xz, uFocus.xz);
          float pad = ${fine ? '4.0' : '20.0'};
          bool hide = ${fine ? 'bd > uNear' : 'bd <= uNear || bd > uFar'};
          if (bc.x > uClip.x - pad && bc.z > uClip.y - pad && bc.x < uClip.z + pad && bc.z < uClip.w + pad) hide = true;
          ${fine ? 'if (texelFetch(uMask, ivec2(floor((bm - uExt) / 256.0)), 0).r > 0.5) hide = true;' : ''}
          if (hide) transformed *= 0.0;
        }`);
  };
  mat.customProgramCacheKey = () => 'block1' + (fine ? 'f' : 'c');
  return mat;
}
export const CUT = {
  solid: cutPatch(new THREE.MeshLambertMaterial({ vertexColors: true })),
  glow: cutPatch(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })),
  depth: cutPatch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), false),
};
/** The same three for streamed tiles (tile-local geometry, hidden inside the detailed area). */
const CUTT = {
  solid: cutPatch(new THREE.MeshLambertMaterial({ vertexColors: true }), true, true),
  glow: cutPatch(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), true, true),
  depth: cutPatch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), false, true),
};
/** How much a thing at (x, z) of height h is ducked right now (mirrors the shader; used for signs). */
/** How tall something at (x, z) may still stand while the cutaway is on: Infinity where nothing is cut down. */
export function cutLimit(x, z, r = 5) {
  const f = U.uFocus.value, d = U.uCamDir.value, dx = x - f.x, dz = z - f.z;
  const t = dx * d.x + dz * d.y, l = Math.hypot(dx - d.x * t, dz - d.y * t);
  const ss = (a, b, v) => { const k = clamp((v - a) / (b - a)); return k * k * (3 - 2 * k); };
  const w = U.uCut.value * ss(-1, 3, t - r * U.uHalf.value) * (1 - ss(U.uR.value, U.uR.value * 1.5, l));
  return w < 0.5 ? Infinity : Math.max(0.3, (t - r - 7) * U.uTan.value);
}
export function cutWeight(x, z, r = 5) {
  const f = U.uFocus.value, d = U.uCamDir.value, dx = x - f.x, dz = z - f.z;
  const t = dx * d.x + dz * d.y, l = Math.hypot(dx - d.x * t, dz - d.y * t);
  const ss = (a, b, v) => { const k = clamp((v - a) / (b - a)); return k * k * (3 - 2 * k); };
  const hmax = Math.max(0.3, (t - r - 7) * U.uTan.value);
  return U.uCut.value * ss(-1, 3, t - r * U.uHalf.value) * (1 - ss(U.uR.value, U.uR.value * 1.5, l)) * (hmax < 4 ? 1 : 0);
}

// ---------------------------------------------------------------- building looks
// The Hague by building age: white and cream stucco among dark brick before 1905, red-brown brick with orange
// tiled roofs up to the war, the yellow-brown brick of the Haagse School in the thirties, yellow and grey
// brick flats after 1945, and white, grey and anthracite since 2000.
// Wall and roof colours by building age. The Hague is brown, sand and grey far more than it is red: muted brown brick,
// yellow-brown brick from the 1920s on, pale stucco in the old centre; roofs are dull orange tile, grey tile or dark felt.
const ERA = [
  { to: 1905, wall: ['#ece6d8', '#e3d8be', '#d5d2c8', '#8a5f50', '#775a50', '#a98c68', '#ece6d8'], roofs: ['#4a4e57', '#8f6252', '#6b7078', '#5a5f66'] },
  { to: 1930, wall: ['#8c6252', '#96695a', '#7c5c50', '#a58066', '#b39a78', '#e6dfcf', '#8a6658'], roofs: ['#a06a56', '#8a6254', '#4a4e57', '#5f6268'] },
  { to: 1946, wall: ['#bfa06e', '#b3925f', '#8e6858', '#a47e60', '#c9ad7c'], roofs: ['#a06a56', '#5d646d', '#4f545c', '#8a6254'] },
  { to: 1976, wall: ['#cdb07c', '#d6c095', '#bfb6a3', '#c9c5bb', '#946e60', '#c4a66e'], roofs: ['#5d646d', '#6b7078', '#4f545c', '#98695a'] },
  { to: 2001, wall: ['#936c5e', '#c9a873', '#806052', '#e3e1da', '#ad886e'], roofs: ['#4a4e57', '#96665a', '#5d646d'] },
  { to: 9999, wall: ['#e9e9e4', '#cfd3d6', '#4a4f57', '#966c5e', '#d7c9b8', '#9fb4c2'], roofs: ['#3d434c', '#5a6068'] },
];
const eraOf = (year) => ERA.find((e) => (year || 1950) < e.to) || ERA[2];
const TOWER = ['#cfd8dc', '#b8c4cc', '#e3ded3', '#9fb0ba', '#d7c9b8', '#8fa3ad', '#5f6f7d', '#e8eef1'];
const LIT = ['#ffd97a', '#ffe9a8', '#ffc45e', '#fff1c1'];

/** May a footprint be drawn as its bounding box? Only if the box hardly sticks out beyond the real outline: a big L-shaped block must not spill over the street. */
const boxy = (o) => o.fill >= 0.72 && (1 - o.fill) * o.w * o.d < 45;
/**
 * How a building looks: its own dice (seeded by where it sits in the map data) and its wall and roof colours.
 * The same building comes out the same in every tile, at every level of detail and whichever street is open.
 */
function lookOf(key, bi, b) {
  const rnd = makeRng(hashStr('b|' + key + '|' + bi)), era = eraOf(b.year);
  return { rnd, wall: b.h > 24 ? rnd.pick(TOWER) : rnd.pick(era.wall), roof: rnd.pick(era.roofs) };
}
/** A plain building: walls with painted windows, its roof, and what stands on it. `simple` leaves the trimmings out (far away). */
function drawGeneric(v, gl, b, look, night, simple = false) {
  const o = b.o, th = Math.atan2(-o.uz, o.ux), h = b.h, rnd = look.rnd;
  const tall = h > 24;
  v.setT(th, o.cx, o.cz); gl.setT(th, o.cx, o.cz);
  const rad = Math.min(o.w, o.d) / 2;
  v.setB(o.cx, o.cz, h + 2, rad); gl.setB(o.cx, o.cz, h + 2, rad);
  const wall = look.wall, roofCol = look.roof;
  const small = b.area < 22, one = b.rects.length === 1;
  for (const r of b.rects) {
    const span = Math.min(r.w, r.d);
    // a sloping roof where the register says there is one: on a terraced house, and on the wings of a big old block alike
    const sloped = b.roof && !tall && span < 26 && span > (one ? 0 : 2.4);
    const rise = sloped ? clamp(span * 0.36, 0.9, 5.5) : 0;
    // the measured height already takes in most of a sloping roof: the walls stop lower, so the ridge ends up near it
    const hw = sloped ? Math.max(2.4, h - rise * 0.55) : h;
    if (sloped) { v.setB(o.cx, o.cz, hw + 2, rad); gl.setB(o.cx, o.cz, hw + 2, rad); }
    // the windows are painted on by the shader (see cutPatch): a grid on houses, ribbons of glass on towers
    v.setW(small || hw <= 3.4 ? 0 : tall ? 2 : 1);
    v.box(r.x, 0, r.z, r.w, hw, r.d, small ? P.shade(wall, 0.8) : wall, 0.035);
    v.setW(0);
    if (sloped) {
      const alongX = r.w >= r.d, n = simple ? 2 : rise > 3.4 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const k = 1 - (i * 0.92) / n;
        v.box(r.x, hw + (i * rise) / n, r.z, alongX ? r.w + 0.1 : r.w * k + 0.1, rise / n, alongX ? r.d * k + 0.1 : r.d + 0.1, roofCol, 0.05);
      }
      // a chimney breaks the roof line
      if (!small && !simple && rnd.chance(0.5)) v.box(r.x + (alongX ? rnd.range(-0.3, 0.3) * r.w : 0), hw + rise * 0.3, r.z + (alongX ? 0 : rnd.range(-0.3, 0.3) * r.d), 0.6, rise * 0.7 + 0.7, 0.6, '#8a5a48', 0.08);
    } else {
      v.box(r.x, h, r.z, r.w + 0.15, 0.3, r.d + 0.15, tall ? P.shade(wall, 0.8) : '#efe9dc');
      if (span > 2 && !simple) v.box(r.x, h + 0.3, r.z, r.w - 0.5, 0.08, r.d - 0.5, '#4a4e57');
      // flat roofs carry things: a stair house, air handling units
      if (span > 7 && !small && !simple) {
        if (rnd.chance(0.55)) v.box(r.x + rnd.range(-0.25, 0.25) * r.w, h + 0.3, r.z + rnd.range(-0.25, 0.25) * r.d, rnd.range(2, 3.4), rnd.range(1.4, 2.4), rnd.range(2, 3.4), P.shade(wall, 0.86), 0.04);
        const n = rnd.int(0, span > 14 ? 3 : 1);
        for (let i = 0; i < n; i++) v.box(r.x + rnd.range(-0.36, 0.36) * r.w, h + 0.3, r.z + rnd.range(-0.36, 0.36) * r.d, 1.5, 0.9, 1.1, '#aeb4ba', 0.06);
      }
    }
    if (tall && h > 55) { v.box(r.x, h + 0.3, r.z, 0.14, 4, 0.14, '#555'); gl.box(r.x, h + 4.3, r.z, 0.4, 0.4, 0.4, '#ff3b3b'); }
  }
}

const SHOPS = ['BAKKER', 'KAAS', 'BLOEM', 'FIETS', 'KAPPER', 'BOEK', 'TOKO', 'SLAGER', 'DROP', 'VIS', 'KIOSK', 'MODE', 'SCHOEN'];
const BARS = ['CAFE', 'KROEG', 'BAR', 'BIER'];
const FOOD = ['FRIET', 'PIZZA', 'SNACK', 'KEBAB', 'ROTI', 'SUSHI'];
const POI_SHOP = { 1: BARS, 2: FOOD, 3: SHOPS, 4: ['SUPER'], 5: ['BANK'], 6: ['KOFFIE'] };

/** A street-facing house front drawn with the full kit (doors, windows, gables, shop fronts). Returns anchors in scene coords. */
function drawHero(v, gl, u, rnd, night) {
  // rnd: this front's own dice, so it comes out the same every time the street is opened
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
      x: 0, z: depth / 2, w, rnd, night, depth, y: 0, roof, wall: u.wall || rnd.pick(era.wall), roofCol: u.roofCol,
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

// ---------------------------------------------------------------- house fronts, the same on every street
// Which buildings get a detailed street front (door, windows, shop, gable), and how wide each front is, follows from the
// map data alone: `bf` says which way a building faces. So a front is the same whichever street is open; the tiles draw
// the detailed version for the cells near the camera (see Streamer._detail), and the open street only reads where the
// doors and windows are.
const CELL = 64, CELLS = TILE / CELL;
const cellOf = (x, z) => Math.min(CELLS - 1, Math.max(0, Math.floor(x / CELL))) + CELLS * Math.min(CELLS - 1, Math.max(0, Math.floor(z / CELL)));
const _fronts = new WeakMap();
/** The street fronts of a tile, in tile coordinates (x east, z south). { units, byB: building index -> its units } */
function frontsOf(key, t) {
  let F = _fronts.get(t);
  if (F) return F;
  F = { units: [], byB: new Map() };
  _fronts.set(t, F);
  if (!t.bf || !t.b) return F;
  t.b.forEach((e, bi) => {
    const bf = t.bf[bi];
    if (!(bf >= 0) || e[0] < 3.2) return;
    // a church stays a church: buildings with a type or a landmark's own shape keep their own drawer
    if ((t.bp && t.bp[bi]) || (t.bt && TYPED.has(t.bt[bi])) || specialOf(key, t, bi)) return;
    const ring = [];
    for (let i = 3; i + 1 < e.length; i += 2) ring.push([e[i] / 10, TILE - e[i + 1] / 10]);
    if (ring.length < 3) return;
    const area = ringArea(ring);
    if (area < 18) return;
    const o = obbOf(ring), b = { ring, h: e[0], roof: e[1], year: e[2], o, area };
    // which side of its bounding box looks at the street?
    const a = (bf * 10 * Math.PI) / 180, nx = Math.sin(a), nz = -Math.cos(a);
    const dU = o.ux * nx + o.uz * nz, dP = -o.uz * nx + o.ux * nz;
    if (Math.max(Math.abs(dU), Math.abs(dP)) < 0.8) return; // it stands askew to its street
    let fnx, fnz, fd, fw;
    if (Math.abs(dU) >= Math.abs(dP)) { fd = o.w; fw = o.d; fnx = Math.sign(dU) * o.ux; fnz = Math.sign(dU) * o.uz; }
    else { fd = o.d; fw = o.w; fnx = Math.sign(dP) * -o.uz; fnz = Math.sign(dP) * o.ux; }
    if (fw < 2.8) return;
    const ax = -fnz, az = fnx, fcx = o.cx + (fnx * fd) / 2, fcz = o.cz + (fnz * fd) / 2;
    const look = lookOf(key, bi, b), tower = b.h >= 22;
    const n = fw > (tower ? 34 : 11) ? Math.round(fw / (tower ? 22 : 6.5)) : 1, uw = fw / n;
    const depth = clamp(area / fw, 3.4, fd), ci = cellOf(o.cx, o.cz), mine = [];
    // an L- or U-shaped building is more than its front slab: what lies behind the slab is kept as plain blocks
    const backs = [];
    if (!boxy(o)) {
      const alongU = Math.abs(dU) >= Math.abs(dP), sg = alongU ? Math.sign(dU) : Math.sign(dP), half = (alongU ? o.w : o.d) / 2;
      for (const r of rectsOf(ring, o)) {
        const c = alongU ? r.x : r.z, size = alongU ? r.w : r.d, near = half - (sg * c + size / 2), far = near + size;
        if (far < depth + 1.5) continue;
        const t0 = Math.max(near, depth), len = far - t0, mid = sg * (half - t0 - len / 2);
        backs.push(alongU ? { x: mid, z: r.z, w: len, d: r.d } : { x: r.x, z: mid, w: r.w, d: len });
      }
    }
    for (let i = 0; i < n; i++) {
      const off = (i + 0.5 - n / 2) * uw, ux0 = fcx + ax * off, uz0 = fcz + az * off;
      // is there really building behind this stretch of the front?
      let hit = 0;
      for (const q of [-0.3, 0, 0.3]) if (inRing(ux0 + ax * q * uw - fnx * 1.2, uz0 + az * q * uw - fnz * 1.2, ring)) hit++;
      if (hit < 2) continue;
      mine.push({ key, bi, i, ci, cx: ux0 - (fnx * depth) / 2, cz: uz0 - (fnz * depth) / 2, nx: fnx, nz: fnz, w: uw, d: depth, h: b.h, roof: b.roof, year: b.year, tower, wall: tower ? null : look.wall, roofCol: look.roof, shop: null, atm: false, side: -1 });
    }
    if (mine.length >= Math.max(1, n * 0.6)) {
      if (backs.length) mine[0].backs = { list: backs, th: Math.atan2(-o.uz, o.ux), cx: o.cx, cz: o.cz, rad: Math.min(o.w, o.d) / 2, h: b.h, wall: look.wall };
      F.byB.set(bi, mine); F.units.push(...mine);
    }
  });
  const dice = (u, salt) => hashStr(salt + '|' + key + '|' + u.bi + '|' + u.i);
  // shops: real points of interest claim the nearest front
  for (const p of t.p || []) {
    const list = POI_SHOP[p[0]];
    if (!list) continue;
    const px = p[1] / 10, pz = TILE - p[2] / 10;
    let best = null, bd = 16;
    for (const u of F.units) { if (u.shop || u.tower) continue; const d = Math.hypot(u.cx - px, u.cz - pz) - u.d / 2; if (d < bd) { bd = d; best = u; } }
    if (best) best.shop = list[dice(best, 'shop') % list.length];
  }
  // cash machines: on the bank, otherwise on a blank wall now and then
  for (const u of F.units) u.atm = !u.tower && (u.shop === 'BANK' || (!u.shop && u.w >= 4.4 && dice(u, 'atm') % 13 === 0));
  return F;
}
const unitRng = (u) => makeRng(hashStr('u|' + u.key + '|' + u.bi + '|' + u.i));
let _dry = null;
/** Where a front's door, window, sign and chimney are, without drawing it: u is the unit in whatever coordinates the answer should be in. */
function frontInfo(u, night) {
  _dry ||= { v: new Vox(1, true), gl: new Vox(1, true) };
  _dry.v.n = 0; _dry.gl.n = 0;
  const hi = drawHero(_dry.v, _dry.gl, u, unitRng(u), night);
  _dry.v.setT(); _dry.gl.setT(); _dry.v.setB(); _dry.gl.setB(); _dry.v.n = 0; _dry.gl.n = 0;
  if (hi.sign) { hi.sign.geometry.dispose(); hi.sign.material.dispose(); hi.sign = null; }
  return hi;
}
/** Is a tree trunk within r metres of this point (map metres)? Only knows the tiles that are built. */
export function treeNearMap(mx, my, r) {
  const t0x = Math.floor((mx - r) / TILE), t1x = Math.floor((mx + r) / TILE), t0y = Math.floor((my - r) / TILE), t1y = Math.floor((my + r) / TILE);
  for (let tx = t0x; tx <= t1x; tx++) for (let ty = t0y; ty <= t1y; ty++) {
    const c = _byNum.get(tileNum(tx, ty));
    if (!c || !c.trees) continue;
    const lx = mx - c.ox, lz = c.oy + TILE - my, a = c.trees;
    for (let i = 0; i + 2 < a.length; i += 3) if (Math.abs(a[i] - lx) < r && Math.abs(a[i + 1] - lz) < r && Math.hypot(a[i] - lx, a[i + 1] - lz) < r) return true;
  }
  return false;
}

// ---------------------------------------------------------------- the whole city, far away
// One textured relief map of the city, plus every building as a plain block. Blocks come in two sizes:
// 16 m cells near the camera, 32 m cells further out. The shader swaps them as the camera moves, and
// hides the blocks wherever the detailed scene or a streamed tile draws the real buildings.
const KEEP = (o) => { o.userData.keep = true; return o; };
function cityModel(city) {
  if (city.model) return city.model;
  const { ix, ground, height } = city, [ex0, ey0, ex1, ey1] = ix.extent;
  // ground colours
  const w = ground.width, h = ground.height, src = ground.data, data = new Uint8Array(w * h * 4);
  for (let j = 0, o = 0; j < h; j++) for (let i = 0; i < w; i++, o += 4) {
    const p = LUT[src[o]] || LUT[0], k = 0.96 + hash2(i, j) * 0.08, c = p.speck && hash2(i + 7, j + 3) < p.speck ? p.b : p.a;
    data[o] = c[0] * k; data[o + 1] = c[1] * k; data[o + 2] = c[2] * k; data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.needsUpdate = true;
  // relief, one vertex per 96 m
  const STEP = 96, nx = Math.ceil((ex1 - ex0) / STEP), nz = Math.ceil((ey1 - ey0) / STEP);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2), idx = new Uint32Array(nx * nz * 6);
  for (let j = 0, k = 0; j <= nz; j++) for (let i = 0; i <= nx; i++, k++) {
    const mx = Math.min(ex1, ex0 + i * STEP), my = Math.max(ey0, ey1 - j * STEP);
    pos[k * 3] = mx; pos[k * 3 + 1] = city.landAt(mx, my) - 0.35; pos[k * 3 + 2] = -my;
    uv[k * 2] = (mx - ex0) / (ex1 - ex0); uv[k * 2 + 1] = (ey1 - my) / (ey1 - ey0);
  }
  for (let j = 0, q = 0; j < nz; j++) for (let i = 0; i < nx; i++, q += 6) {
    const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, c = d + 1;
    idx[q] = a; idx[q + 1] = d; idx[q + 2] = c; idx[q + 3] = a; idx[q + 4] = c; idx[q + 5] = b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const plane = KEEP(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, depthWrite: false })));
  plane.renderOrder = -3;
  plane.frustumCulled = false;

  // building blocks
  const cw = height.width, ch = height.height, hd = height.data, cell = ix.height.cell;
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const tones = ['#c7b29a', '#b9a58f', '#d2c4b0', '#a89684', '#c9bcae', '#b6aea4', '#cbb7a2', '#9fa3a8'].map((t) => new THREE.Color(t)), tall = new THREE.Color('#aebbc4');
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const fill = (list, size, mat) => {
    const n = list.length / 4, inst = KEEP(new THREE.InstancedMesh(box, mat, Math.max(1, n)));
    for (let i = 0; i < n; i++) {
      const mx = list[i * 4], my = list[i * 4 + 1], hh = list[i * 4 + 2], side = size * Math.sqrt(clamp(list[i * 4 + 3] * 1.15, 0.2, 1));
      m.compose(p.set(mx, city.landAt(mx, my) - 0.4, -my), q, s.set(side, hh + 0.4, side));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, hh > 40 ? tall : tones[Math.floor(hash2(Math.round(mx), Math.round(my)) * tones.length)]);
    }
    inst.count = n;
    inst.frustumCulled = false;
    return inst;
  };
  const CHUNK = 1024, bins = new Map(), coarse = [];
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const o = (j * cw + i) * 4, hh = hd[o];
    if (!hh) continue;
    const mx = ex0 + (i + 0.5) * cell, my = ey1 - (j + 0.5) * cell, key = Math.floor(mx / CHUNK) + ',' + Math.floor(my / CHUNK);
    let bin = bins.get(key);
    if (!bin) bins.set(key, (bin = []));
    bin.push(mx, my, hh, hd[o + 1] / 255);
  }
  for (let j = 0; j < ch; j += 2) for (let i = 0; i < cw; i += 2) {
    let sh = 0, sc = 0, n = 0;
    for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
      if (i + di >= cw || j + dj >= ch) continue;
      const o = ((j + dj) * cw + i + di) * 4;
      if (hd[o]) { sh += hd[o] * hd[o + 1]; sc += hd[o + 1]; n++; }
    }
    if (n) coarse.push(ex0 + (i + 1) * cell, ey1 - (j + 1) * cell, sh / sc, sc / 255 / 4);
  }
  const matF = blockPatch(new THREE.MeshLambertMaterial(), true), matC = blockPatch(new THREE.MeshLambertMaterial(), false);
  const fine = [];
  for (const [key, list] of bins) {
    const [cx, cy] = key.split(',').map(Number), inst = fill(list, cell, matF);
    fine.push({ inst, mx: (cx + 0.5) * CHUNK, my: (cy + 0.5) * CHUNK });
  }
  const far = fill(coarse, cell * 2, matC);
  // which 256 m tiles currently show real buildings (the fine blocks under them step aside)
  const tw = Math.round((ex1 - ex0) / TILE), th = Math.round((ey1 - ey0) / TILE), mask = new Uint8Array(tw * th);
  const maskTex = new THREE.DataTexture(mask, tw, th, THREE.RedFormat, THREE.UnsignedByteType);
  maskTex.magFilter = maskTex.minFilter = THREE.NearestFilter;
  maskTex.needsUpdate = true;
  U.uMask.value = maskTex;
  U.uExt.value.set(ex0, ey0);
  return (city.model = { plane, fine, far, mask, maskTex, tw, th, reach: CHUNK * 0.75 });
}
function cityBackdrop(city, f) {
  const M = cityModel(city), g = new THREE.Group();
  // metres (x east, z south) → scene
  g.rotation.y = Math.atan2(-f.dy, f.dx);
  g.position.set(-(f.ox * f.dx + f.oy * f.dy), 0, -(f.ox * f.dy - f.oy * f.dx));
  g.add(M.plane, M.far);
  for (const c of M.fine) { const p = f.S(c.mx, c.my); c.sx = p[0]; c.sz = p[1]; g.add(c.inst); }
  M.mask.fill(0);
  M.maskTex.needsUpdate = true;
  /** Only the block chunks within reach of the camera target are drawn. */
  g.userData.lod = (x, z) => { const r = U.uNear.value + M.reach; for (const c of M.fine) c.inst.visible = Math.hypot(c.sx - x, c.sz - z) < r; };
  return g;
}

// ---------------------------------------------------------------- painting the ground
const WET = new Uint8Array(256);
WET[C.WATER] = 1; WET[C.SEA] = 1;
const mask = (...cls) => { const t = new Uint8Array(256); for (const c of cls) t[c] = 1; return t; };
const URBAN = mask(C.LAND, C.PLAZA, C.PARKING);
const NO_ROAD = mask(C.LAND, C.GRASS, C.FOREST, C.SAND, C.DUNE, C.FARM, C.PLAZA, C.PARKING, C.WALK, C.WATER, C.SEA, C.FOOT, C.DIRT, C.PITCH);
const ROAD_ORDER = [11, 12, 10, 9, 8, 7, 6, 5, 13, 4, 3, 2, 1];
const SURF = { 11: C.FOOT, 12: C.DIRT, 10: C.CYCLE, 9: C.SERVICE, 8: C.PED, 7: C.KLINKER, 6: C.KLINKER, 5: C.ASPHALT, 13: C.ASPHALT, 4: C.ASPHALT, 3: C.ASPHALT, 2: C.ASPHALT, 1: C.ASPHALT };
/** Sea, land use, water, pavements and roads. `mt` turns grid coords into map metres. */
function paintBase(city, grid, mt, gnd, roads) {
  const { ix, ground } = city, [ex0, , , ey1] = ix.extent, gc = ix.ground.cell, gw = ground.width, gh = ground.height, gd = ground.data;
  const a = grid.a, cell = grid.cell, step = Math.max(1, Math.round(4 / cell));
  for (let j = 0; j < grid.h; j += step) for (let i = 0; i < grid.w; i += step) {
    const m = mt(grid.x0 + (i + 0.5) * cell, grid.z0 + (j + 0.5) * cell);
    const ci = Math.floor((m[0] - ex0) / gc), cj = Math.floor((ey1 - m[1]) / gc);
    if (ci < 0 || cj < 0 || ci >= gw || cj >= gh || gd[(cj * gw + ci) * 4] !== 10) continue;
    for (let jj = j; jj < Math.min(grid.h, j + step); jj++) for (let ii = i; ii < Math.min(grid.w, i + step); ii++) a[jj * grid.w + ii] = C.SEA;
  }
  gnd.sort((p, q) => q.area - p.area);
  for (const g of gnd) if (g.cls !== 1) grid.fill(g.rings, g.cls);
  for (const g of gnd) if (g.cls === 1) grid.fill(g.rings, C.WATER);
  for (const r of roads) if (r.cls === 20) grid.stroke(r.a, r.w, C.WATER);
  for (const r of roads) if (r.cls >= 2 && r.cls <= 7 && !(r.flags & 4)) grid.stroke(r.a, r.w + 4.4, C.WALK, URBAN);
  // close up (half-metre cells) every street gets its kerbs and road markings; from further away they are too fine to show
  const fine = cell <= 0.5;
  if (fine) for (const r of roads) if (r.cls >= 2 && r.cls <= 7 && !(r.flags & 4)) grid.stroke(r.a, r.w + 0.8, C.CURB, KERBED);
  for (const cls of ROAD_ORDER) for (const r of roads) {
    if (r.cls !== cls || r.flags & 4) continue;
    grid.stroke(r.a, cls === 11 ? Math.max(1.5, r.w) : r.w, cls === 11 && r.flags & 16 ? C.DIRT : SURF[cls]);
  }
  // red cycle lanes along the edges of roads that have them
  for (const r of roads) {
    if (r.cls < 2 || r.cls > 7 || r.flags & 4 || !(r.flags & 8) || r.w < 6) continue;
    grid.stroke(r.a, 1.15, C.BIKELANE, ROADWAY, r.w / 2 - 0.6);
    grid.stroke(r.a, 1.15, C.BIKELANE, ROADWAY, -(r.w / 2 - 0.6));
  }
  if (fine) for (const r of roads) if (r.cls >= 2 && r.cls <= 7 && !(r.flags & 4)) paintMarks(grid, r);
}
const KERBED = mask(C.WALK, C.LAND, C.PLAZA), ROADWAY = mask(C.ASPHALT, C.KLINKER), MARKABLE = mask(C.ASPHALT, C.KLINKER, C.BIKELANE);
/** Where the zebra crossings are along one piece of road: every 80 m from 20 m in. Returns distances along it. */
export function zebrasOn(len) {
  const out = [];
  if (len >= 45) for (let s = 20; s < len - 12; s += 80) out.push(s);
  return out;
}
/** Centre-line dashes and zebra crossings for one piece of road. */
function paintMarks(grid, r) {
  const a = r.a, n = a.length >> 1, step = grid.cell * 0.5, hw = r.w / 2, dash = r.cls <= 5 && !(r.flags & 1) && r.w >= 6.4;
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(a[i * 2] - a[i * 2 - 2], a[i * 2 + 1] - a[i * 2 - 1]);
  const zeb = zebrasOn(len);
  if (!dash && !zeb.length) return;
  let s = 0;
  for (let i = 0; i + 1 < n; i++) {
    const ax = a[i * 2], az = a[i * 2 + 1], ex = a[i * 2 + 2] - ax, ez = a[i * 2 + 3] - az, l = Math.hypot(ex, ez);
    if (l < 1e-6) continue;
    const dx = ex / l, dz = ez / l;
    for (let t = 0; t < l; t += step) {
      const ss = s + t, x = ax + dx * t, z = az + dz * t;
      if (dash && ss % 2.6 < 1.1) grid.set(x, z, C.MARK, MARKABLE);
      for (const zs of zeb) {
        if (Math.abs(ss - zs) > 1.1) continue;
        for (let v = -(hw - 0.3); v <= hw - 0.3; v += step) if ((v + hw) % 0.9 < 0.45) grid.set(x - dz * v, z + dx * v, C.MARK, MARKABLE);
      }
    }
    s += l;
  }
}
/** Rails and building footprints go on last. */
function paintTop(grid, rails, footprints) {
  for (const r of rails) {
    if (r.flags & 4) continue;
    grid.stroke(r.a, r.kind === 2 ? 3.2 : 2.5, C.RAILBED, NO_ROAD);
    grid.stroke(r.a, grid.cell, C.RAIL, null, 0.72);
    grid.stroke(r.a, grid.cell, C.RAIL, null, -0.72);
  }
  for (const fp of footprints) grid.fill([fp], C.BUILDING);
}
// How far each kind of ground stands above the road surface, in metres. Pavements sit on kerbs, grass and
// woodland lie higher and uneven, dunes roll: the ground is a stepped surface, not one flat sheet.
const STEP = new Float32Array(256).fill(0.14), ROUGH = new Float32Array(256);
for (const c of [C.ASPHALT, C.KLINKER, C.SERVICE, C.PARKING, C.MARK]) STEP[c] = 0;
STEP[C.BIKELANE] = STEP[C.CYCLE] = 0.05;
STEP[C.CURB] = 0.17; STEP[C.DIRT] = 0.07; STEP[C.RAILBED] = 0.09; STEP[C.RAIL] = 0.2; STEP[C.PITCH] = 0.18;
STEP[C.GRASS] = 0.2; ROUGH[C.GRASS] = 0.12;
STEP[C.FOREST] = 0.24; ROUGH[C.FOREST] = 0.3;
STEP[C.DUNE] = 0.2; ROUGH[C.DUNE] = 0.6;
STEP[C.SAND] = 0.1; ROUGH[C.SAND] = 0.16;
STEP[C.FARM] = 0.16; ROUGH[C.FARM] = 0.1;
const LOWLY = new Uint8Array(256); // surfaces that lie at road level (they get a dark gutter line along a kerb)
for (let c = 0; c < 256; c++) LOWLY[c] = STEP[c] < 0.06 ? 1 : 0;

function groundTexture(grid) {
  const w = grid.w, h = grid.h, a = grid.a, cell = grid.cell, data = new Uint8Array(w * h * 4);
  // soft shade on the ground around buildings: how much building lies within about 1.7 m
  const rad = Math.max(1, Math.round(1.7 / cell)), full = (2 * rad + 1) ** 2, row = new Uint16Array(w * h), occ = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) {
    let run = 0;
    const o = j * w;
    for (let i = -rad; i < w; i++) {
      if (i + rad < w && a[o + i + rad] === C.BUILDING) run++;
      if (i - rad - 1 >= 0 && a[o + i - rad - 1] === C.BUILDING) run--;
      if (i >= 0) row[o + i] = run;
    }
  }
  for (let i = 0; i < w; i++) {
    let run = 0;
    for (let j = -rad; j < h; j++) {
      if (j + rad < h) run += row[(j + rad) * w + i];
      if (j - rad - 1 >= 0) run -= row[(j - rad - 1) * w + i];
      if (j >= 0) occ[j * w + i] = run;
    }
  }
  for (let j = 0, o = 0; j < h; j++) {
    const bz = Math.floor(j * cell);
    for (let i = 0; i < w; i++, o += 4) {
      const q = j * w + i, k0 = a[q], p = LUT[k0] || LUT[0], bx = Math.floor(i * cell);
      let alt = false;
      if (p.check) alt = ((Math.floor((i * cell) / p.check) + Math.floor((j * cell) / p.check)) & 1) === 1;
      else if (p.stripe) alt = (Math.floor((j * cell) / p.stripe) & 1) === 1;
      else if (p.speck) alt = hash2(bx, bz) < p.speck;
      const c = alt ? p.b : p.a;
      let k = 0.97 + hash2(bx + 91, bz + 17) * 0.06;
      if (k0 !== C.BUILDING && occ[q]) k *= 1 - 0.42 * Math.min(1, (occ[q] / full) * 1.7);
      if (LOWLY[k0] && ((i > 0 && !LOWLY[a[q - 1]]) || (i < w - 1 && !LOWLY[a[q + 1]]) || (j > 0 && !LOWLY[a[q - w]]) || (j < h - 1 && !LOWLY[a[q + w]]))) k *= 0.86;
      data[o] = Math.min(255, c[0] * k); data[o + 1] = Math.min(255, c[1] * k); data[o + 2] = Math.min(255, c[2] * k);
      data[o + 3] = WET[k0] ? 0 : 255; // the land surface has holes where the water is
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
const BANK = (() => { const t = mask(C.GRASS, C.FOREST, C.DUNE, C.PITCH, C.FARM, C.DIRT); t[C.SAND] = 2; return t; })();
const BANK_COL = [[0.52, 0.5, 0.46], [0.4, 0.4, 0.26], [0.84, 0.76, 0.54]]; // quay stone, earth bank, sand
/** A typed array that grows as numbers are pushed. */
class Buf {
  constructor(T, n = 4096) { this.a = new T(n); this.n = 0; }
  room(k) { if (this.n + k > this.a.length) { const b = new this.a.constructor(Math.max(this.a.length * 2, this.n + k)); b.set(this.a); this.a = b; } }
  cut() { return this.a.slice(0, this.n); }
}
/**
 * The ground for one painted grid, in the grid's own coordinates: a stepped land surface with the grid as
 * its texture (kerbs, verges and rough ground are real steps), the water surface lying lower, and walls along
 * every shore. `mt` turns grid coords into map metres. Leaves `grid.off` (height of every cell above the terrain).
 */
function buildGround(city, grid, { mt, gs = 4, clip = false }) {
  // (clip is no longer used: streets do not bring their own ground any more)
  const { x0, z0, w, h, cell, a } = grid, W = w * cell, H = h * cell, tex = groundTexture(grid), meshes = [];
  const n = Math.max(1, Math.round(gs / cell)), nbx = Math.ceil(w / n), nbz = Math.ceil(h / n), lw = nbx + 1;
  // terrain heights on the block lattice; inside a block the ground is interpolated, so pieces meet without cracks
  const lat = new Float32Array(lw * (nbz + 1));
  for (let j = 0; j <= nbz; j++) for (let i = 0; i <= nbx; i++) { const m = mt(x0 + Math.min(i * n, w) * cell, z0 + Math.min(j * n, h) * cell); lat[j * lw + i] = city.landAt(m[0], m[1]); }
  const base = (ci, cj) => {
    let bi = Math.floor(ci / n), bj = Math.floor(cj / n);
    if (bi >= nbx) bi = nbx - 1;
    if (bj >= nbz) bj = nbz - 1;
    const i0 = bi * n, j0 = bj * n, fx = (ci - i0) / (Math.min(w, i0 + n) - i0), fz = (cj - j0) / (Math.min(h, j0 + n) - j0), k = bj * lw + bi;
    const p = lat[k] + (lat[k + 1] - lat[k]) * fx, q = lat[k + lw] + (lat[k + lw + 1] - lat[k + lw]) * fx;
    return p + (q - p) * fz;
  };
  // every cell's height above the terrain: its class, plus one roll of the dice per block for rough ground
  const off = (grid.off = new Float32Array(w * h));
  for (let bj = 0; bj < nbz; bj++) for (let bi = 0; bi < nbx; bi++) {
    const r = hash2(bi + 311, bj + 7919), i1 = Math.min(w, bi * n + n), j1 = Math.min(h, bj * n + n);
    for (let j = bj * n; j < j1; j++) for (let i = bi * n, o = j * w + i; i < i1; i++, o++) { const c = a[o]; off[o] = STEP[c] + ROUGH[c] * r; }
  }
  {
    const P3 = new Buf(Float32Array, 1 << 15), N3 = new Buf(Float32Array, 1 << 15), U2 = new Buf(Float32Array, 1 << 14), IX = new Buf(Uint32Array, 1 << 15);
    const vert = (ci, cj, y, u, v, nx, ny, nz) => {
      const p = P3.a, q = N3.a, t = U2.a;
      p[P3.n++] = x0 + ci * cell; p[P3.n++] = y; p[P3.n++] = z0 + cj * cell;
      q[N3.n++] = nx; q[N3.n++] = ny; q[N3.n++] = nz;
      t[U2.n++] = u; t[U2.n++] = v;
    };
    const room = () => { P3.room(12); N3.room(12); U2.room(8); IX.room(6); };
    const tri = (v0, flip) => { const ix = IX.a; if (flip) { ix[IX.n++] = v0; ix[IX.n++] = v0 + 2; ix[IX.n++] = v0 + 1; ix[IX.n++] = v0; ix[IX.n++] = v0 + 3; ix[IX.n++] = v0 + 2; } else { ix[IX.n++] = v0; ix[IX.n++] = v0 + 1; ix[IX.n++] = v0 + 2; ix[IX.n++] = v0; ix[IX.n++] = v0 + 2; ix[IX.n++] = v0 + 3; } };
    const top = (ci0, cj0, ci1, cj1, o, nx, ny, nz) => {
      room();
      const v0 = P3.n / 3;
      vert(ci0, cj0, base(ci0, cj0) + o, ci0 / w, cj0 / h, nx, ny, nz);
      vert(ci0, cj1, base(ci0, cj1) + o, ci0 / w, cj1 / h, nx, ny, nz);
      vert(ci1, cj1, base(ci1, cj1) + o, ci1 / w, cj1 / h, nx, ny, nz);
      vert(ci1, cj0, base(ci1, cj0) + o, ci1 / w, cj0 / h, nx, ny, nz);
      tri(v0, false);
    };
    const used = new Uint8Array(n * n);
    for (let bj = 0; bj < nbz; bj++) for (let bi = 0; bi < nbx; bi++) {
      const i0 = bi * n, j0 = bj * n, i1 = Math.min(w, i0 + n), j1 = Math.min(h, j0 + n), bw = i1 - i0, bh = j1 - j0, k = bj * lw + bi;
      // the block's slope gives its top faces their shading
      let nx = -((lat[k + 1] - lat[k]) + (lat[k + lw + 1] - lat[k + lw])) / (2 * bw * cell), nz = -((lat[k + lw] - lat[k]) + (lat[k + lw + 1] - lat[k + 1])) / (2 * bh * cell), ny = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const first = off[j0 * w + i0];
      let same = true;
      for (let j = j0; j < j1 && same; j++) for (let i = i0, o = j * w + i; i < i1; i++, o++) if (off[o] !== first) { same = false; break; }
      if (same) { top(i0, j0, i1, j1, first, nx, ny, nz); continue; }
      // mixed block: as few rectangles as will cover it
      used.fill(0);
      for (let jj = 0; jj < bh; jj++) for (let ii = 0; ii < bw; ii++) {
        if (used[jj * n + ii]) continue;
        const o = off[(j0 + jj) * w + i0 + ii];
        let x1 = ii + 1;
        while (x1 < bw && !used[jj * n + x1] && off[(j0 + jj) * w + i0 + x1] === o) x1++;
        let y1 = jj + 1;
        grow: while (y1 < bh) { for (let q = ii; q < x1; q++) if (used[y1 * n + q] || off[(j0 + y1) * w + i0 + q] !== o) break grow; y1++; }
        for (let y = jj; y < y1; y++) for (let q = ii; q < x1; q++) used[y * n + q] = 1;
        top(i0 + ii, j0 + jj, i0 + x1, j0 + y1, o, nx, ny, nz);
      }
    }
    // the risers: a vertical face wherever two neighbouring cells of land differ in height
    const riserX = (i, ja, jb, oL, oR) => {
      room();
      const v0 = P3.n / 3, hi = Math.max(oL, oR), lo = Math.min(oL, oR), u = ((oL > oR ? i - 1 : i) + 0.5) / w, nx = oL > oR ? 1 : -1;
      const ya = base(i, ja), yb = base(i, jb);
      vert(i, ja, ya + hi, u, (ja + 0.5) / h, nx, 0, 0);
      vert(i, jb, yb + hi, u, (jb - 0.5) / h, nx, 0, 0);
      vert(i, jb, yb + lo, u, (jb - 0.5) / h, nx, 0, 0);
      vert(i, ja, ya + lo, u, (ja + 0.5) / h, nx, 0, 0);
      tri(v0, nx < 0);
    };
    const riserZ = (j, ia, ib, oU, oD) => {
      room();
      const v0 = P3.n / 3, hi = Math.max(oU, oD), lo = Math.min(oU, oD), v = ((oU > oD ? j - 1 : j) + 0.5) / h, nz = oU > oD ? 1 : -1;
      const ya = base(ia, j), yb = base(ib, j);
      vert(ia, j, ya + hi, (ia + 0.5) / w, v, 0, 0, nz);
      vert(ib, j, yb + hi, (ib - 0.5) / w, v, 0, 0, nz);
      vert(ib, j, yb + lo, (ib - 0.5) / w, v, 0, 0, nz);
      vert(ia, j, ya + lo, (ia + 0.5) / w, v, 0, 0, nz);
      tri(v0, nz > 0);
    };
    for (let i = 1; i < w; i++) {
      let j0 = -1, a0 = 0, b0 = 0;
      for (let j = 0; j <= h; j++) {
        let oL = 0, oR = 0, edge = false;
        if (j < h) { const q = j * w + i; if (!WET[a[q - 1]] && !WET[a[q]]) { oL = off[q - 1]; oR = off[q]; edge = Math.abs(oL - oR) > 0.012; } }
        if (j0 >= 0 && (!edge || oL !== a0 || oR !== b0 || j % n === 0)) { riserX(i, j0, j, a0, b0); j0 = -1; }
        if (edge && j0 < 0) { j0 = j; a0 = oL; b0 = oR; }
      }
    }
    for (let j = 1; j < h; j++) {
      let i0 = -1, a0 = 0, b0 = 0;
      for (let i = 0; i <= w; i++) {
        let oU = 0, oD = 0, edge = false;
        if (i < w) { const q = j * w + i; if (!WET[a[q - w]] && !WET[a[q]]) { oU = off[q - w]; oD = off[q]; edge = Math.abs(oU - oD) > 0.012; } }
        if (i0 >= 0 && (!edge || oU !== a0 || oD !== b0 || i % n === 0)) { riserZ(j, i0, i, a0, b0); i0 = -1; }
        if (edge && i0 < 0) { i0 = i; a0 = oU; b0 = oD; }
      }
    }
    const geo = new THREE.BufferGeometry(), nv = P3.n / 3;
    geo.setAttribute('position', new THREE.BufferAttribute(P3.cut(), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N3.cut(), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U2.cut(), 2));
    geo.setIndex(new THREE.BufferAttribute(nv > 65535 ? IX.cut() : Uint16Array.from(IX.a.subarray(0, IX.n)), 1));
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 });
    const land = new THREE.Mesh(geo, clip ? clipPatch(mat) : mat);
    land.receiveShadow = true;
    land.renderOrder = -2;
    meshes.push(land);
  }
  // where is the water?
  const ws = 8, cx = Math.ceil(W / ws), cz = Math.ceil(H / ws), wet = new Uint8Array(cx * cz);
  let any = false;
  for (let j = 0; j < h; j++) {
    const cj = Math.min(cz - 1, Math.floor((j * cell) / ws)) * cx;
    for (let i = 0; i < w; i++) if (WET[a[j * w + i]]) { wet[cj + Math.min(cx - 1, Math.floor((i * cell) / ws))] = 1; any = true; }
  }
  if (!any) return { meshes, tex };
  {
    // the water surface, under every stretch of water (and a little beyond)
    const pos = [], uv = [], idx = [];
    for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) {
      let near = false;
      for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < cx && jj < cz && wet[jj * cx + ii]) { near = true; break; } }
      if (!near) continue;
      const v0 = pos.length / 3;
      for (const [di, dj] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const gx = x0 + Math.min((i + di) * ws, W), gz = z0 + Math.min((j + dj) * ws, H), m = mt(gx, gz);
        pos.push(gx, city.waterAt(m[0], m[1]), gz);
        uv.push((gx - x0) / W, (gz - z0) / H);
      }
      idx.push(v0, v0 + 3, v0 + 2, v0, v0 + 2, v0 + 1);
    }
    const geo = new THREE.BufferGeometry(), nn = pos.length / 3, nor = new Float32Array(nn * 3);
    for (let i = 0; i < nn; i++) nor[i * 3 + 1] = 1;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const water = new THREE.Mesh(geo, clip ? clipPatch(mat) : mat);
    water.receiveShadow = true;
    water.renderOrder = -2;
    meshes.push(water);
  }
  {
    // quay walls and banks: a vertical face wherever land meets water
    const pos = [], nor = [], col = [], idx = [], maxRun = Math.max(1, Math.round(gs / cell));
    const offAt = (x, z) => { const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell); return i < 0 || j < 0 || i >= w || j >= h ? 0.14 : off[j * w + i]; };
    const quad = (ax, az, bx, bz, wx, wz, tone) => {
      const ma = mt(ax, az), mb = mt(bx, bz), o = offAt(ax + bx - wx, az + bz - wz); // the land cell lies across the edge from the water
      const ta = city.landAt(ma[0], ma[1]) + o, tb = city.landAt(mb[0], mb[1]) + o, ba = city.waterAt(ma[0], ma[1]), bb = city.waterAt(mb[0], mb[1]);
      if (ta - ba < 0.22 && tb - bb < 0.22) return;
      let nx = -(bz - az), nz = bx - ax;
      const l = Math.hypot(nx, nz) || 1;
      nx /= l; nz /= l;
      const flip = nx * (wx - ax) + nz * (wz - az) < 0;
      if (flip) { nx = -nx; nz = -nz; }
      const v0 = pos.length / 3, c = BANK_COL[tone];
      pos.push(ax, ta, az, bx, tb, bz, bx, bb - 0.5, bz, ax, ba - 0.5, az);
      for (let k = 0; k < 4; k++) { nor.push(nx, 0, nz); const d = k < 2 ? 1 : 0.7; col.push(c[0] * d, c[1] * d, c[2] * d); }
      if (flip) idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3); else idx.push(v0, v0 + 2, v0 + 1, v0, v0 + 3, v0 + 2);
    };
    const tone = (land) => 1 + BANK[land];
    for (let i = 1; i < w; i++) {
      let j0 = -1, g0 = 0;
      for (let j = 0; j <= h; j++) {
        let g = 0;
        if (j < h) { const l = WET[a[j * w + i - 1]], r = WET[a[j * w + i]]; if (l !== r) g = (l ? 1 : -1) * tone(a[j * w + (l ? i : i - 1)]); }
        if (j0 >= 0 && (g !== g0 || j - j0 >= maxRun)) { const gx = x0 + i * cell; quad(gx, z0 + j0 * cell, gx, z0 + j * cell, gx + (g0 > 0 ? -0.5 : 0.5) * cell, z0 + (j0 + 0.5) * cell, Math.abs(g0) - 1); j0 = -1; }
        if (g && j0 < 0) { j0 = j; g0 = g; }
      }
    }
    for (let j = 1; j < h; j++) {
      let i0 = -1, g0 = 0;
      for (let i = 0; i <= w; i++) {
        let g = 0;
        if (i < w) { const u = WET[a[(j - 1) * w + i]], d = WET[a[j * w + i]]; if (u !== d) g = (u ? 1 : -1) * tone(a[(u ? j : j - 1) * w + i]); }
        if (i0 >= 0 && (g !== g0 || i - i0 >= maxRun)) { const gz = z0 + j * cell; quad(x0 + i0 * cell, gz, x0 + i * cell, gz, x0 + (i0 + 0.5) * cell, gz + (g0 > 0 ? -0.5 : 0.5) * cell, Math.abs(g0) - 1); i0 = -1; }
        if (g && i0 < 0) { i0 = i; g0 = g; }
      }
    }
    if (idx.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      const walls = new THREE.Mesh(geo, clip ? WALLT : WALL);
      walls.receiveShadow = true;
      meshes.push(walls);
    }
  }
  return { meshes, tex };
}
const WALL = new THREE.MeshLambertMaterial({ vertexColors: true });
const WALLT = clipPatch(new THREE.MeshLambertMaterial({ vertexColors: true }));

// Three kinds of tree, so a row of them is not a row of clones: a broad crown, a tall narrow one, a low round one.
const TREES = [
  (v) => { v.box(0, 0, 0, 0.42, 1.8, 0.42, '#7a5234'); v.box(0, 1.8, 0, 2.2, 0.8, 2.2, '#3f9a48'); v.box(0, 2.6, 0, 2.7, 1.0, 2.7, '#4caf50'); v.box(0.1, 3.6, -0.1, 1.9, 0.8, 1.9, '#5cbd5c'); v.box(0, 4.4, 0, 0.9, 0.4, 0.9, '#68c765'); },
  (v) => { v.box(0, 0, 0, 0.36, 1.5, 0.36, '#6d4a30'); v.box(0, 1.5, 0, 1.3, 1.2, 1.3, '#3b8f4d'); v.box(0, 2.7, 0, 1.6, 1.5, 1.6, '#43a054'); v.box(0, 4.2, 0, 1.2, 1.2, 1.2, '#4fb060'); v.box(0, 5.4, 0, 0.7, 0.8, 0.7, '#5dbb69'); },
  (v) => { v.box(0, 0, 0, 0.5, 1.3, 0.5, '#7a5234'); v.box(0, 1.3, 0, 2.6, 0.7, 2.6, '#55a548'); v.box(0, 2.0, 0, 3.1, 1.1, 3.1, '#63b552'); v.box(-0.1, 3.1, 0.1, 2.2, 0.7, 2.2, '#72c25c'); },
];
const TREE_H = [4.8, 6.2, 3.8, 4.6];
// from far away a tree is a trunk and one block of green
TREES.push((v) => { v.box(0, 0, 0, 0.5, 1.6, 0.5, '#7a5234'); v.box(0, 1.6, 0, 2.6, 3.0, 2.6, '#4f9f4c'); });
let _treeGeo = null;
/** A stand of trees: one instanced mesh per kind of tree, in a group. pts: flat [x, z, size, ...]. */
function treeMesh(pts, rnd, cap, yAt, mat = CUT.solid, depth = CUT.depth, far = false) {
  const n = Math.min(pts.length / 3, cap);
  if (n <= 0) return null;
  _treeGeo ||= TREES.map((draw, i) => { const tv = new Vox(5 + i); draw(tv); return tv.geometry(); });
  const stride = pts.length / 3 / n, picks = [[], [], [], []];
  for (let i = 0; i < n; i++) { const k = Math.floor(i * stride) * 3, h = hash2(Math.round(pts[k] * 7), Math.round(pts[k + 1] * 7)); picks[far ? 3 : h < 0.6 ? 0 : h < 0.8 ? 1 : 2].push(k); }
  const group = new THREE.Group();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  picks.forEach((list, kind) => {
    if (!list.length) return;
    const geo = _treeGeo[kind].clone(), aB = new Float32Array(list.length * 4);
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((k, i) => {
      const sc = pts[k + 2];
      e.set(0, Math.floor(rnd() * 4) * (Math.PI / 2), 0);
      m.compose(p.set(pts[k], yAt(pts[k], pts[k + 1]) - 0.05, pts[k + 1]), q.setFromEuler(e), s.set(sc * rnd.range(0.9, 1.1), sc, sc * rnd.range(0.9, 1.1)));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.setRGB(rnd.range(0.82, 1.08), rnd.range(0.9, 1.1), rnd.range(0.78, 1.0)));
      aB[i * 4] = pts[k]; aB[i * 4 + 1] = pts[k + 1]; aB[i * 4 + 2] = TREE_H[kind] * sc; aB[i * 4 + 3] = -1;
    });
    geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
    inst.castShadow = true; inst.receiveShadow = true;
    inst.customDepthMaterial = depth;
    inst.computeBoundingSphere();
    group.add(inst);
  });
  return group;
}

// ---------------------------------------------------------------- build
/**
 * st: street properties; geometry: its MultiLineString coordinates (lon/lat).
 * Returns the scene group plus everything the stage and the gags need to play on it.
 */
export async function buildWorld(st, geometry, { night = false, seed = '', lite = false, soft = false } = {}) {
  const city = await loadCity(), ix = city.ix;
  // a world built while another one is on screen takes breathers, so the picture keeps moving
  const breathe = soft ? () => new Promise((r) => setTimeout(r, 12)) : () => null;
  const t0 = performance.now();
  const rnd = makeRng(hashStr((st.name || '') + '|' + (st.buurt || '') + '|' + seed));
  const f = frameFor(ix, geometry);
  const streetLen = polyLen(f.spine);
  const margin = lite ? 50 : 60; // the detailed area only holds this street's buildings: the ground comes from the tiles, the same for every street
  const tiles = await Promise.all(tileKeys(f, margin).map(async (k) => [k, await loadTile(ix, k)]));
  const t1 = performance.now();

  // ---- decode buildings first: they decide which side the camera stands on
  const decodeB = () => {
    const out = [];
    for (const [key, t] of tiles) {
      if (!t || !t.b) continue;
      const [tx, ty] = key.split('_').map(Number), ox = tx * TILE, oy = ty * TILE;
      t.b.forEach((e, bi) => {
        const ring = [];
        for (let i = 3; i + 1 < e.length; i += 2) ring.push(f.S(ox + e[i] / 10, oy + e[i + 1] / 10));
        if (ring.length >= 3) out.push({ ring, h: e[0], roof: e[1], year: e[2], key, bi, t });
      });
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
  // streamed tiles leave the buildings inside this rectangle to the street's own, more detailed ones
  const clip = { x0: R.x0, z0: R.z0, x1: R.x1, z1: R.z1 };
  const inC = (x, z) => x > clip.x0 && x < clip.x1 && z > clip.z0 && z < clip.z1;
  for (const b of bld) b.o = obbOf(b.ring);
  bld = bld.filter((b) => inC(b.o.cx, b.o.cz)); // a building belongs to whoever has its centre
  await breathe();

  // ---- decode the rest
  const roads = [], rails = [], pois = [];
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
    for (const e of t.r || []) {
      const a = flat(e, 4);
      if (a) roads.push({ cls: e[0], w: e[1] / 10, name: e[2] >= 0 ? t.n[e[2]] : '', flags: e[3], a });
    }
    for (const e of t.l || []) {
      const a = flat(e, 2);
      if (a) rails.push({ kind: e[0], flags: e[1], a });
    }
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

  // ---- buildings: where they stand along the street (the tiles draw them, house fronts included)
  for (const b of bld) {
    b.area = ringArea(b.ring);
    b.rects = boxy(b.o) ? [{ x: 0, z: 0, w: b.o.w, d: b.o.d }] : rectsOf(b.ring, b.o);
    const pr = path.project(b.o.cx, b.o.cz);
    b.s = pr.s; b.v = pr.v; b.dist = pr.d;
  }

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
  // the road as it is painted for everyone (see paintBase): its width, and whether it carries cycle lanes
  const own = roads.filter((r) => r.name === st.name && r.cls <= 9 && !(r.flags & 4)), widths = own.map((r) => r.w).sort((a, b) => a - b);
  const L = crossSection(st, clearB, clearF, night, own.length ? { w: widths[widths.length >> 1], bike: own.filter((r) => r.flags & 8).length * 2 > own.length } : null);

  // ---- the ground comes from the tiles, painted the same way for every street. The tiles along this street are
  // built now, at the finest level, because the street's furniture and walking lines are fitted to the painted ground
  await breathe();
  const corridor = []; // the tiles this street runs through
  {
    let mx0 = Infinity, mx1 = -Infinity, my0 = Infinity, my1 = -Infinity;
    for (const q of path.p) { const m = f.M(q[0], q[1]); if (m[0] < mx0) mx0 = m[0]; if (m[0] > mx1) mx1 = m[0]; if (m[1] < my0) my0 = m[1]; if (m[1] > my1) my1 = m[1]; }
    syncNight(night);
    for (const [key, t] of tiles) {
      if (!t) continue;
      const [tx, ty] = key.split('_').map(Number);
      if ((tx + 1) * TILE < mx0 - 45 || tx * TILE > mx1 + 45 || (ty + 1) * TILE < my0 - 45 || ty * TILE > my1 + 45) continue;
      corridor.push(key);
      const had = _built.get(key);
      if (had && had.lod === 0) continue;
      ensureTile(city, key, t, 0, night, lite);
      await breathe();
    }
  }
  const toM = (x, z) => f.M(x, z);
  /** Ground class at a scene position (255 where no tile is built). */
  const clsAt = (x, z) => classAt(f.ox + x * f.dx + z * f.dy, f.oy + x * f.dy - z * f.dx);
  // zebra crossings: where the shared painter put them on this street's own pieces of road
  L.zebras = [];
  for (const r of own) {
    const a = r.a, n = a.length >> 1, cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(a[i * 2] - a[i * 2 - 2], a[i * 2 + 1] - a[i * 2 - 1]));
    for (const zs of zebrasOn(cum[n - 1])) {
      let i = 1;
      while (i < n - 1 && cum[i] < zs) i++;
      const t = (zs - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), pr = path.project(a[i * 2 - 2] + (a[i * 2] - a[i * 2 - 2]) * t, a[i * 2 - 1] + (a[i * 2 + 1] - a[i * 2 - 1]) * t);
      if (pr.d < 3 && pr.s > path.sA + 4 && pr.s < path.sB - 4) L.zebras.push(pr.s);
    }
  }
  let tramOnStreet = 0;
  for (const r of rails) {
    if (r.flags & 4 || r.kind === 2) continue;
    for (let i = 0; i + 1 < r.a.length; i += 8) { const pr = path.project(r.a[i], r.a[i + 1]); if (pr.d < 6 && pr.s > path.sA && pr.s < path.sB) tramOnStreet++; }
  }
  L.tramNear = tramOnStreet > 2;
  /** Height of whatever you would stand or float on at a scene position (kerbs and rough ground included). */
  const hAt = (x, z) => surfaceAt(city, f.ox + x * f.dx + z * f.dy, f.oy + x * f.dy - z * f.dx);
  const landY = (x, z) => city.landAt(f.ox + x * f.dx + z * f.dy, f.oy + x * f.dy - z * f.dx);

  // what is actually built near the street, and where its roof is (1 m cells, half-metre steps above `solid.y0`):
  // the camera uses it to keep sight lines clear
  const solid = new Grid(R.x0, R.z0, Math.ceil(R.x1 - R.x0), Math.ceil(R.z1 - R.z0), 1);
  solid.y0 = landY(0, 0) - 25;
  {
    const boxes = [];
    const add = (cx, cz, th, x, z, w, d, h) => {
      const c = Math.cos(th), sn = Math.sin(th), q = new Float32Array(8);
      let k = 0;
      for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const px = x + (ax * w) / 2, pz = z + (az * d) / 2; q[k++] = px * c + pz * sn + cx; q[k++] = -px * sn + pz * c + cz; }
      boxes.push([landY(cx, cz) + h, q]); // a building stands on the ground under its centre
    };
    for (const b of bld) {
      if (b.dist > 90) continue;
      for (const r of b.rects) add(b.o.cx, b.o.cz, Math.atan2(-b.o.uz, b.o.ux), r.x, r.z, r.w, r.d, b.h + 1);
    }
    boxes.sort((p, q) => p[0] - q[0]);
    for (const [top, q] of boxes) solid.fill([q], Math.min(250, Math.max(1, Math.round((top - solid.y0) * 2))));
  }

  // ---- scene objects
  await breathe();
  const group = new THREE.Group();
  const disposables = [];

  // ---- house fronts along this street: the tiles draw them (the same for every street), here we only work out where
  // their doors, windows and signs are, for the people who will ring, climb and loiter there
  const heroInfo = [];
  const props = [];
  {
    const cand = [];
    for (const [key, t] of tiles) {
      if (!t) continue;
      const [tx, ty] = key.split('_').map(Number), ox = tx * TILE, oy = ty * TILE;
      const pt = (x, z) => f.S(ox + x, oy + TILE - z);
      const o0 = pt(0, 0), ex = pt(1, 0), ez = pt(0, 1); // the tile's east and south, in this street's frame
      const dir = (dx, dz) => [dx * (ex[0] - o0[0]) + dz * (ez[0] - o0[0]), dx * (ex[1] - o0[1]) + dz * (ez[1] - o0[1])];
      for (const u of frontsOf(key, t).units) {
        const c = pt(u.cx, u.cz), n = dir(u.nx, u.nz), fx = c[0] + (n[0] * u.d) / 2, fz = c[1] + (n[1] * u.d) / 2;
        const pr = path.project(fx, fz);
        if (pr.d > 24 || pr.d < 0.8 || pr.s < path.sA - 8 || pr.s > path.sB + 8) continue;
        const tg = path.at(pr.s), q = path.xz(pr.s, 0);
        // it has to look at this street, not at the one round the corner
        if (Math.abs(n[0] * tg.tx + n[1] * tg.tz) > 0.6 || n[0] * (q[0] - fx) + n[1] * (q[1] - fz) < 0) continue;
        cand.push({ ...u, cx: c[0], cz: c[1], nx: n[0], nz: n[1], s: pr.s, gap: pr.d, side: pr.v < 0 ? -1 : 1 });
      }
      // street furniture stands in the tiles too: list what is near this street, in this street's coordinates
      const built = _built.get(key);
      if (built && built.props) for (const q of built.props) {
        const c = pt(q.x, q.z);
        if (!inR(c[0], c[1])) continue;
        const a = dir(q.ax, q.az), n = dir(q.nx, q.nz);
        props.push({ ...q, x: c[0], z: c[1], ax: a[0], az: a[1], nx: n[0], nz: n[1] });
      }
    }
    // fronts hidden behind a nearer building are not this street's
    cand.sort((a, b) => a.gap - b.gap);
    const kept = [], dropped = new Set();
    for (const u of cand) {
      const id = u.key + '#' + u.bi;
      if (dropped.has(id)) continue;
      if (kept.some((h) => (h.key !== u.key || h.bi !== u.bi) && h.side === u.side && Math.abs(h.s - u.s) < (h.w + u.w) * 0.3 && h.gap < u.gap - 1.5)) { dropped.add(id); continue; }
      kept.push(u);
    }
    for (const u of kept) {
      if (dropped.has(u.key + '#' + u.bi)) continue;
      let hi;
      try { hi = frontInfo(u, night); } catch (err) { console.error('front failed', u.key, u.bi, err); continue; }
      if (hi.chimney) hi.chimney.y += landY(u.cx, u.cz);
      heroInfo.push(hi);
    }
  }
  await breathe();

  // rails and big roads as paths for trams and passing traffic
  const flatToPts = (a) => { const o = []; for (let i = 0; i + 1 < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; };
  const tramLines = chain(rails.filter((r) => r.kind !== 2 && !(r.flags & 4)).map((r) => flatToPts(r.a)), 5, 0.6).filter((p) => polyLen(p) > 140).map((p) => new Path(p));
  const sideRoads = chain(roads.filter((r) => r.cls >= 2 && r.cls <= 4 && !(r.flags & 4) && r.name !== st.name).map((r) => flatToPts(r.a)), 5, 0.7).filter((p) => polyLen(p) > 160).map((p) => new Path(p));

  const W = {
    group, path, clsAt, corridor, solid, frame: f, region: R, clip, L, st, rnd, night, lite, hAt, landY,
    heroes: heroInfo, props, pois, roads, rails, tramLines, sideRoads, builtAt, city, inClip: inC, classAt,
    /** Shop signs of the detailed fronts on screen: [{ m, x, z }] in scene coordinates. */
    get signs() { return W.stream ? W.stream.signs() : []; },
    /** Is a tree trunk within r metres of this scene position? */
    treeNear: (x, z, r = 1.2) => { const m = f.M(x, z); return treeNearMap(m[0], m[1], r); },
    anchors: { houses: [], shops: [], racks: [], benches: [], bins: [], parked: [], lamps: [], stalls: [], chimneys: [], atms: [], boxes: [] },
    northAz: Math.atan2(-f.dy, f.dx),
    toScene: (lon, lat) => f.S((lon - ix.proj.lon0) * ix.proj.kx, (lat - ix.proj.lat0) * ix.proj.ky),
    toLngLat: (x, z) => { const m = f.M(x, z); return [ix.proj.lon0 + m[0] / ix.proj.kx, ix.proj.lat0 + m[1] / ix.proj.ky]; },
    /** Keep a scene position inside the city. */
    inCity: (x, z) => { const m = f.M(x, z), e = ix.extent; return f.S(clamp(m[0], e[0] + 200, e[2] - 200), clamp(m[1], e[1] + 200, e[3] - 200)); },
    C,
  };
  await breathe();
  dress(W);
  /** Put this world on screen: point the shared shaders and the whole-city model at its frame, start streaming tiles. */
  W.activate = () => {
    frameTerrain(city, f);
    U.uClip.value.set(1e9, 1e9, -1e9, -1e9); // nothing is the street's own any more: the tiles draw every building
    U.uNear.value = lite ? 520 : 1300;
    U.uFar.value = lite ? 5200 : 1e9;
    U.uNight.value = night ? 1 : 0;
    W.back = cityBackdrop(city, f);
    group.add(W.back);
    W.stream = new Streamer(W, city);
  };
  /** Per frame: draw the right amount of city for where the camera is. */
  // (while the camera drops in or rises out, only the place it is heading for is kept up, house fronts included)
  // phase: 'drop' while the camera comes down (the place it is heading for is made ready, house fronts included),
  // 'leave' while it rises out (nothing new is built for a view that is about to close)
  W.lod = (x, z, dist, live, az, phase = '') => {
    W.back.userData.lod(x, z);
    if (live) W.stream.update(x, z, dist, az);
    else if (phase === 'drop') W.stream.update(x, z, Math.min(dist, 500), az, true);
  };
  W.ms = { fetch: Math.round(t1 - t0), build: Math.round(performance.now() - t1) };
  W.dispose = () => {
    if (W.stream) W.stream.dispose();
    const walk = (o) => {
      if (o.userData.keep) return; // the whole-city model is shared between streets
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
      if (o.material && !o.material.vertexColors) o.material.dispose();
      for (const c of o.children) walk(c);
    };
    walk(group);
    if (W.back) for (const c of [...W.back.children]) W.back.remove(c);
    for (const t of disposables) t.dispose();
  };
  return W;
}

// ---------------------------------------------------------------- streamed tiles
// Away from the detailed area the city is drawn tile by tile (256 m), only around the camera and only when
// it is low enough to tell the difference. Tiles carry real building outlines, ground, water and trees.
// A tile is built once, in its own coordinates, and placed into whichever street's frame is on screen: moving
// the focus to another street keeps every tile that is already there.
const _built = new Map(), _byNum = new Map(); // key → tile (most recently used last); the same tiles by number, for height look-ups
let _builtNight = null;
const tileNum = (tx, ty) => (tx + 512) * 2048 + ty + 512;
function dropTile(key) {
  const c = _built.get(key);
  if (!c) return;
  _built.delete(key);
  _byNum.delete(c.num);
  c.dispose();
}
/** A built tile by its key, if it is in memory. */
export const tileOf = (key) => _built.get(key) || null;
/** Let go of all but the `keep` most recently used tiles (called when the street view closes: the map page needs the memory). */
export function trimTiles(keep) {
  for (const key of [..._built.keys()]) { if (_built.size <= keep) break; dropTile(key); }
  // the tiles that stay give up their detailed house fronts: those are heavy, and are rebuilt in a moment when needed
  for (const c of _built.values()) if (c.cells) for (const cell of c.cells) { cell.job = null; if (cell.detail) plainCell(c, cell); }
}
/** Swap a cell's detailed fronts back for its plain blocks. */
function plainCell(c, cell) {
  for (const m of cell.detail.meshes) { c.g.remove(m); m.geometry.dispose(); }
  for (const sg of cell.detail.signs) { c.g.remove(sg.m); sg.m.geometry.dispose(); sg.m.material.dispose(); }
  for (const m of cell.plain) m.visible = true;
  cell.detail = null;
}
/** Height of the surface at a point in map metres, away from any street's detailed area. */
function surfaceAt(city, mx, my) {
  const c = _byNum.get(tileNum(Math.floor(mx / TILE), Math.floor(my / TILE)));
  if (c) {
    const g = c.grid, i = Math.floor((mx - c.ox) / g.cell), j = Math.floor((c.oy + TILE - my) / g.cell);
    if (i >= 0 && j >= 0 && i < g.w && j < g.h) { const q = j * g.w + i; return WET[g.a[q]] ? city.waterAt(mx, my) : city.landAt(mx, my) + g.off[q]; }
  }
  return city.landAt(mx, my) + 0.14;
}
/** Ground class at a point in map metres, if a tile is there (255 otherwise). */
export function classAt(mx, my) {
  const c = _byNum.get(tileNum(Math.floor(mx / TILE), Math.floor(my / TILE)));
  if (!c) return 255;
  const g = c.grid, i = Math.floor((mx - c.ox) / g.cell), j = Math.floor((c.oy + TILE - my) / g.cell);
  return i >= 0 && j >= 0 && i < g.w && j < g.h ? g.a[j * g.w + i] : 255;
}
/**
 * One 256 m tile, in its own coordinates. Three levels of detail, all painted and coloured by the same rules:
 * 0 close (half-metre ground with kerbs and road markings), 1 normal (1 m), 2 far (2 m, plain roofs, simple trees).
 */
function buildTile(city, key, t, night, lite, lod = 1) {
  const [tx, ty] = key.split('_').map(Number), ox = tx * TILE, oy = ty * TILE;
  const rnd = makeRng(hashStr('tile|' + key));
  const g = new THREE.Group();
  const c = [0.5, 1, 2][lod] * (lite ? 2 : 1), n = Math.round(TILE / c), grid = new Grid(0, 0, n, n, c);
  // tile data is in decimetres from the tile's south-west corner; the tile's own coordinates run east and south from its north-west corner
  const loc = (e, from) => { const a = new Float32Array(e.length - from); for (let i = from; i + 1 < e.length; i += 2) { a[i - from] = e[i] / 10; a[i - from + 1] = TILE - e[i + 1] / 10; } return a; };
  const mt = (gx, gz) => [ox + gx, oy + TILE - gz];
  const gnd = (t.g || []).map((e) => ({ cls: e[0], area: e[1], rings: e.slice(2).map((r) => loc(r, 0)) }));
  const roads = (t.r || []).map((e) => ({ cls: e[0], w: e[1] / 10, name: e[2] >= 0 && t.n ? t.n[e[2]] : '', flags: e[3], a: loc(e, 4) }));
  const rails = (t.l || []).map((e) => ({ kind: e[0], flags: e[1], a: loc(e, 2) }));
  paintBase(city, grid, mt, gnd, roads);
  const v = new Vox(rnd.int(1, 9999), true), gl = new Vox(rnd.int(1, 9999), true), flats = [];
  // buildings that are something in particular (a church, a fuel station, a landmark with its own shape) and the things
  // that stand between buildings (walls, masts, fountains) go into a mesh of their own: they are never handed over to a
  // street's detailed area, so they look the same whether or not their street is open
  const vx = new Vox(rnd.int(1, 9999), true), glx = new Vox(rnd.int(1, 9999), true);
  const F = lod === 0 ? frontsOf(key, t) : null, cellVox = F ? new Map() : null;
  (t.b || []).forEach((e, bi) => {
    const flat = loc(e, 3), ring = [];
    flats.push(flat);
    for (let i = 0; i + 1 < flat.length; i += 2) ring.push([flat[i], flat[i + 1]]);
    if (ring.length < 3) return;
    const sp = specialOf(key, t, bi);
    if (t.bp && t.bp[bi] && !sp) return; // drawn from its parts, below
    const b = { ring, h: e[0], roof: e[1], year: e[2] };
    b.o = obbOf(ring);
    b.area = ringArea(ring);
    b.rects = boxy(b.o) ? [{ x: 0, z: 0, w: b.o.w, d: b.o.d }] : rectsOf(ring, b.o);
    const look = lookOf(key, bi, b), type = t.bt ? t.bt[bi] : 0;
    if (sp || (type && TYPED.has(type))) {
      const n0 = vx.n, g0 = glx.n;
      let done = false;
      try { done = drawTyped(vx, glx, b, type, { wall: look.wall, roof: look.roof }, look.rnd, night, sp); } catch (err) { vx.n = n0; glx.n = g0; if (import.meta.env.DEV) console.warn('landmark drawer failed', sp ? sp.id : type, err); }
      vx.setT(); glx.setT(); vx.setW(0);
      if (done) return;
      vx.n = n0; glx.n = g0; // it declined: a plain block after all (drawn here too, so it never changes with the focus)
      drawGeneric(vx, glx, b, look, night, lod === 2);
      return;
    }
    // buildings with a street front go into a mesh per 64 m cell: near the camera that cell swaps to the detailed fronts
    if (cellVox && F.byB.has(bi)) {
      const ci = cellOf(b.o.cx, b.o.cz);
      let cv = cellVox.get(ci);
      if (!cv) cellVox.set(ci, (cv = { v: new Vox(rnd.int(1, 9999), true), gl: new Vox(rnd.int(1, 9999), true) }));
      drawGeneric(cv.v, cv.gl, b, look, night, false);
      return;
    }
    drawGeneric(v, gl, b, look, night, lod === 2);
  });
  const xr = makeRng(hashStr('extras|' + key));
  const hidden = SPECIAL_PARTS[key];
  (t.q || []).forEach((e, qi) => {
    // a landmark's own shape, part by part (towers, wings, domes), from the map's 3D building parts
    if (hidden && hidden.includes(qi)) return; // under a hand-made landmark
    const ring = [];
    let cx = 0, cz = 0;
    for (let i = 6; i + 1 < e.length; i += 2) { const x = e[i] / 10, z = TILE - e[i + 1] / 10; ring.push([x, z]); cx += x; cz += z; }
    if (ring.length < 3) return;
    cx /= ring.length; cz /= ring.length;
    const n0 = vx.n, g0 = glx.n;
    try { drawParts(vx, glx, [{ ring, h: e[0] / 10, min: e[1] / 10, roof: e[2], roofH: e[3] / 10, wall: e[4], roofCol: e[5] }], { wall: '#b9a58f', roof: '#5d646d' }, cx, cz, e[0] / 10, xr, night); } catch (err) { vx.n = n0; glx.n = g0; }
    vx.setT(); glx.setT(); vx.setW(0);
  });
  for (const e of t.f || []) {
    // free-standing things: fuel station canopies, windmills, masts, statues, fountains, shelters
    if (lod === 2 && !(e[0] >= 2 && e[0] <= 7)) continue; // from far away only the tall ones matter
    const n0 = vx.n, g0 = glx.n;
    // a compass direction (degrees clockwise from north) as a turn of the builder's frame, in the tile's east/south axes
    try { drawFeature(vx, glx, { type: e[0], x: e[1] / 10, z: TILE - e[2] / 10, a: e[3], b: e[4] / 10, c: e[5] / 10, rot: Math.PI / 2 - (e[3] * Math.PI) / 180 }, xr, night); } catch (err) { vx.n = n0; glx.n = g0; }
    vx.setT(); glx.setT(); vx.setW(0);
  }
  if (lod < 2 && t.x && t.x.length) {
    const n0 = vx.n;
    try { drawBarriers(vx, t.x.map((e) => ({ kind: e[0], h: e[1] / 10, a: loc(e, 2) })), xr); } catch (err) { vx.n = n0; }
    vx.setT(); vx.setW(0);
  }
  paintTop(grid, rails, flats);
  const G = buildGround(city, grid, { mt, gs: [4, 8, 16][lod] * (lite && lod === 0 ? 2 : 1) });
  g.add(...G.meshes);
  v.setT(); gl.setT();
  // buildings are lifted onto the terrain by the shader and may stick out of the tile: give them a generous bounding sphere
  const roomy = (m) => { m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(TILE / 2, 30, TILE / 2), 240); return m; };
  if (!v.empty) { const m = roomy(v.mesh(CUTT.solid)); m.customDepthMaterial = CUTT.depth; g.add(m); }
  if (!gl.empty) g.add(roomy(new THREE.Mesh(gl.geometry(), CUTT.glow)));
  vx.setB(); glx.setB();
  if (!vx.empty) { const m = roomy(vx.mesh(CUT.solid)); m.customDepthMaterial = CUT.depth; g.add(m); }
  if (!glx.empty) g.add(roomy(new THREE.Mesh(glx.geometry(), CUT.glow)));
  // trees: the mapped ones, plus woods and a sprinkle on grass. Their own dice, so they stand the same at every level of detail
  const tr = makeRng(hashStr('trees|' + key));
  const pts = [], ok = mask(C.LAND, C.GRASS, C.FOREST, C.DUNE, C.SAND, C.FARM, C.PLAZA, C.WALK, C.PARKING, C.FOOT, C.DIRT, C.PITCH, C.CURB);
  const push = (gx, gz, size) => { if (ok[grid.get(gx, gz)]) pts.push(gx, gz, size); };
  if (t.t) for (let i = 0; i + 1 < t.t.length; i += 2) push(t.t[i] / 10, TILE - t.t[i + 1] / 10, tr.range(1.35, 1.95));
  for (let z = 2; z < TILE; z += 7) for (let x = 2; x < TILE; x += 7) {
    const jx = x + tr.range(-2.6, 2.6), jz = z + tr.range(-2.6, 2.6), cl = grid.get(jx, jz), r1 = tr(), size = tr();
    if (cl === C.FOREST) { if (r1 < 0.9) push(jx, jz, 1.7 + size * 0.9); }
    else if (cl === C.GRASS) { if (r1 < 0.07) push(jx, jz, 1.3 + size * 0.7); }
    else if (cl === C.DUNE) { if (r1 < 0.06) push(jx, jz, 0.5 + size * 0.4); }
  }
  const yAt = (gx, gz) => {
    const i = Math.min(grid.w - 1, Math.max(0, Math.floor(gx / c))), j = Math.min(grid.h - 1, Math.max(0, Math.floor(gz / c)));
    return city.landAt(ox + gx, oy + TILE - gz) + grid.off[j * grid.w + i];
  };
  const trees = treeMesh(pts, tr, lod === 2 ? (lite ? 250 : 600) : lite ? 700 : 1800, yAt, CUTT.solid, CUTT.depth, lod === 2);
  if (trees) g.add(trees);
  // street furniture: every street has it, placed by the same rules from the tile's own data (see furnish.js)
  let props = null;
  if (lod === 0) {
    const fv = new Vox(rnd.int(1, 9999)), fgl = new Vox(rnd.int(1, 9999)), fg = new THREE.Group();
    try {
      props = furnishTile({ key, grid, C, roads, trees: pts, pois: t.p || [], yAt, v: fv, gl: fgl, group: fg, night, lite }).props || [];
      fv.setT(); fgl.setT();
      if (!fv.empty) g.add(fv.mesh());
      if (!fgl.empty) g.add(fgl.mesh(MAT.glow));
      if (fg.children.length) g.add(fg);
    } catch (err) { props = []; console.error('furniture failed', key, err); }
  }
  // the cells of buildings with street fronts: their plain version now, the detailed one on demand
  const cells = [];
  if (cellVox) for (const [ci, cv] of cellVox) {
    cv.v.setT(); cv.gl.setT();
    const plain = [], ccx = ((ci % CELLS) + 0.5) * CELL, ccz = (Math.floor(ci / CELLS) + 0.5) * CELL;
    // a cell is small: give it its own bounding sphere, so cells out of view cost nothing
    const snug = (m) => { m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(ccx, 25, ccz), 95); return m; };
    if (!cv.v.empty) { const m = snug(cv.v.mesh(CUTT.solid)); m.customDepthMaterial = CUTT.depth; g.add(m); plain.push(m); }
    if (!cv.gl.empty) { const m = snug(new THREE.Mesh(cv.gl.geometry(), CUTT.glow)); g.add(m); plain.push(m); }
    cells.push({ ci, cx: ccx, cz: ccz, plain, units: F.units.filter((u) => u.ci === ci), detail: null, job: null });
  }
  return {
    key, num: tileNum(tx, ty), lod, g, grid, ox, oy, roads, rails, pois: t.p || [], trees: pts, props, cells, night,
    dispose() {
      g.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.isInstancedMesh) o.dispose();
        if (o.material && o.material.map) o.material.dispose();
      });
      G.tex.dispose();
    },
  };
}
/** Stand a tile in a street's frame. */
function placeTile(c, f) {
  const p = f.S(c.ox, c.oy + TILE);
  c.g.position.set(p[0], 0, p[1]);
  c.g.rotation.y = Math.atan2(-f.dy, f.dx);
  c.g.updateMatrixWorld(true);
}
let _stream = null; // the streamer of the world on screen
/** Tiles carry a few things that differ by night (lanterns): when night falls or lifts, start afresh. */
function syncNight(night) {
  if (_builtNight === night) return;
  if (_stream) for (const key of [..._stream.live.keys()]) _stream._detach(key);
  for (const k of [..._built.keys()]) dropTile(k);
  _builtNight = night;
}
/** Make sure a tile exists at `lod` or finer; a coarser one is replaced on the spot, also if it is on screen. */
function ensureTile(city, key, t, lod, night, lite) {
  const old = _built.get(key);
  if (old && old.lod <= lod) return old;
  const c = buildTile(city, key, t, night, lite, lod);
  if (old) {
    const on = _stream && !_stream.dead && _stream.live.get(key) === old;
    _built.delete(key);
    if (on) { placeTile(c, _stream.W.frame); _stream.group.add(c.g); _stream.group.remove(old.g); _stream.live.set(key, c); }
    old.dispose();
  }
  _built.set(key, c); _byNum.set(c.num, c);
  return c;
}
const WEIGHT = [4, 2, 0.5]; // what a tile of each level costs in memory, roughly

class Streamer {
  constructor(W, city) {
    this.W = W; this.city = city; this.M = cityModel(city);
    this.group = new THREE.Group();
    W.group.add(this.group);
    syncNight(W.night);
    this.live = new Map(); this.pending = new Set(); this.ready = new Map(); this.failed = new Map();
    this.want = []; this.lodOf = new Map(); this.sig = '';
    this.budget = W.lite ? 44 : 230; this.rmax = W.lite ? 380 : 820; this.far = W.lite ? 900 : 2100;
    this.last = 0; this.dead = false; this.ms = 0; this.built = 0;
    /** Called with (tile, true) when a tile's place comes on screen and (tile, false) when it leaves. */
    this.onTile = null;
    _stream = this;
  }
  _mask(key, v) {
    const [tx, ty] = key.split('_').map(Number), e = this.city.ix.extent, M = this.M, i = tx - Math.round(e[0] / TILE), j = ty - Math.round(e[1] / TILE);
    if (i < 0 || j < 0 || i >= M.tw || j >= M.th) return;
    M.mask[j * M.tw + i] = v;
    M.maskTex.needsUpdate = true;
  }
  _attach(key, c) {
    this.live.set(key, c);
    _built.delete(key); _built.set(key, c); // most recently used
    placeTile(c, this.W.frame);
    this.group.add(c.g);
    this._mask(key, 255);
    this._signs = null;
    if (this.onTile) this.onTile(c, true);
  }
  _detach(key) {
    const c = this.live.get(key);
    this.live.delete(key);
    this._signs = null;
    if (c) { this.group.remove(c.g); this._mask(key, 0); if (this.onTile) this.onTile(c, false); }
  }
  /** x, z: what the camera looks at; dist: how far away it is; az: the side it stands on. */
  update(x, z, dist, az = 0, warm = false) {
    if (this.dead) return;
    const f = this.W.frame, ix = this.city.ix, now = performance.now();
    // three rings: the finest ground under a low camera, full tiles around it, plain far tiles out to the edge of the view
    const r1 = clamp(dist * 0.9 + 320, 440, this.rmax), r0 = dist < 700 || warm ? 280 : -1e9, r2 = Math.max(r1, Math.min(dist * 0.62 + 260, this.far));
    // the camera looks across what it is aimed at: there is more to see beyond the target than in front of it
    const lead = Math.min(r1 * 0.3, dist * 0.8), m = f.M(x - Math.sin(az) * lead, z - Math.cos(az) * lead), cx = Math.floor(m[0] / TILE), cy = Math.floor(m[1] / TILE);
    const sig = cx + ',' + cy + ',' + Math.round(r2 / 60) + ',' + Math.round(r1 / 40) + ',' + (r0 > 0) + ',' + Math.round(m[0] / 64) + ',' + Math.round(m[1] / 64);
    if (sig !== this.sig) {
      this.sig = sig;
      const n = Math.ceil(r2 / TILE) + 1, want = [];
      this.lodOf.clear();
      for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
        const tx = cx + dx, ty = cy + dy, key = `${tx}_${ty}`;
        if (!ix.set.has(key)) continue;
        const d = Math.hypot((tx + 0.5) * TILE - m[0], (ty + 0.5) * TILE - m[1]);
        if (d > r2 + TILE * 0.5) continue;
        want.push([d, key]);
        this.lodOf.set(key, d < r0 ? 0 : d <= r1 + TILE * 0.5 ? 1 : 2);
      }
      want.sort((a, b) => a[0] - b[0]);
      this.want = want.map((q) => q[1]);
    }
    // tiles that are already built come straight back, a few per frame so a street swap does not stutter
    let back = 0;
    for (const key of this.want) {
      if (back >= 6) break;
      if (!this.live.has(key) && _built.has(key)) { this._attach(key, _built.get(key)); back++; }
    }
    // fetch what is missing, or too coarse for where the camera is now
    const needs = (key) => { const c = _built.get(key); return !c || c.lod > this.lodOf.get(key); };
    let flying = this.pending.size;
    for (const key of this.want) {
      if (flying >= 4) break;
      if (!needs(key) || this.pending.has(key) || this.ready.has(key) || now - (this.failed.get(key) || -1e9) < 6000) continue;
      this.pending.add(key);
      flying++;
      loadTile(ix, key).then((t) => {
        this.pending.delete(key);
        if (this.dead) return;
        if (t) this.ready.set(key, t); else this.failed.set(key, performance.now());
      });
    }
    // build: nearest first, a few milliseconds per frame, with a breather between frames
    if (this.ready.size && now - this.last > 30) {
      let did = false;
      for (const key of this.want) {
        const t = this.ready.get(key);
        if (!t) continue;
        this.ready.delete(key);
        if (!needs(key)) continue;
        const was = _built.get(key);
        try {
          const c = ensureTile(this.city, key, t, this.lodOf.get(key), this.W.night, this.W.lite);
          if (!was) this._attach(key, c);
          this.built++;
        } catch (e) { console.error('tile failed', key, e); this.failed.set(key, performance.now() + 1e7); }
        did = true;
        if (performance.now() - now > 7) break;
      }
      if (!did) this.ready.clear(); // none of it is wanted any more
      this.last = performance.now();
      this.ms = this.last - now;
    }
    { const tm = f.M(x, z); this._detail(tm[0], tm[1], warm ? Math.min(dist, 140) : dist); }
    // too much in memory: let go of the farthest tiles that are not wanted right now
    let load = 0;
    for (const c of _built.values()) load += WEIGHT[c.lod];
    if (load > this.budget) {
      let worst = null, wd = -1;
      for (const key of _built.keys()) {
        if (this.lodOf.has(key)) continue;
        const [tx, ty] = key.split('_').map(Number), d = Math.hypot((tx + 0.5) * TILE - m[0], (ty + 0.5) * TILE - m[1]);
        if (d > wd) { wd = d; worst = key; }
      }
      if (worst) { this._detach(worst); dropTile(worst); }
    }
  }
  /**
   * Detailed house fronts for the cells near what the camera looks at, whichever street they are on. One cell at a
   * time, a few fronts per frame; a cell swaps from plain to detailed when it is complete and back when the camera
   * has moved on.
   */
  _detail(mx, my, dist) {
    const lite = this.W.lite, R = lite ? 45 : 70, lim = lite ? 170 : 270;
    // on below the limit, off only well above it: a camera hovering at the limit must not rebuild fronts all the time
    const on = (this._detOn = this._detOn ? dist < lim + 60 : dist < lim);
    let best = null, bd = Infinity;
    for (const c of this.live.values()) {
      if (c.lod !== 0 || !c.cells) continue;
      for (const cell of c.cells) {
        const d = Math.hypot(c.ox + cell.cx - mx, c.oy + TILE - cell.cz - my);
        if (!on || d > R + 45) {
          cell.job = null;
          if (cell.detail && (!on || d > R + 80)) this._plain(c, cell);
          continue;
        }
        if (!cell.detail && cell.units.length && d < bd) { bd = d; best = [c, cell]; }
      }
    }
    if (!best) return;
    const [c, cell] = best, t0 = performance.now(), city = this.city;
    const job = (cell.job ||= { v: new Vox(1 + cell.ci, true), gl: new Vox(7 + cell.ci, true), i: 0, signs: [] });
    while (job.i < cell.units.length && performance.now() - t0 < 5) {
      const u = cell.units[job.i++];
      let hi;
      try { hi = drawHero(job.v, job.gl, u, unitRng(u), c.night); } catch (err) { console.error('front failed', u.key, u.bi, err); continue; }
      if (hi.sign) { hi.sign.position.y += city.landAt(c.ox + u.cx, c.oy + TILE - u.cz); job.signs.push({ m: hi.sign, x: u.cx, z: u.cz }); }
      if (u.backs) {
        const k = u.backs, v = job.v;
        v.setT(k.th, k.cx, k.cz); v.setB(k.cx, k.cz, k.h + 2, k.rad);
        for (const r of k.list) {
          v.setW(k.h > 3.4 ? 1 : 0); v.box(r.x, 0, r.z, r.w, k.h, r.d, k.wall, 0.035); v.setW(0);
          v.box(r.x, k.h, r.z, r.w + 0.15, 0.3, r.d + 0.15, '#efe9dc');
          if (Math.min(r.w, r.d) > 2) v.box(r.x, k.h + 0.3, r.z, r.w - 0.5, 0.08, r.d - 0.5, '#4a4e57');
        }
      }
    }
    if (job.i < cell.units.length) return;
    job.v.setT(); job.gl.setT(); job.v.setB(); job.gl.setB();
    const roomy = (m) => { m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cell.cx, 20, cell.cz), 90); return m; };
    const meshes = [];
    if (!job.v.empty) { const m = roomy(job.v.mesh(CUT.solid)); m.customDepthMaterial = CUT.depth; meshes.push(m); }
    if (!job.gl.empty) meshes.push(roomy(new THREE.Mesh(job.gl.geometry(), CUT.glow)));
    for (const m of meshes) c.g.add(m);
    for (const sg of job.signs) c.g.add(sg.m);
    for (const m of cell.plain) m.visible = false;
    cell.detail = { meshes, signs: job.signs };
    cell.job = null;
    this._signs = null;
  }
  _plain(c, cell) { plainCell(c, cell); this._signs = null; }
  /** The shop signs of the detailed fronts on screen, in scene coordinates. */
  signs() {
    if (this._signs && this._signsFrame === this.W.frame) return this._signs;
    const out = [], v = new THREE.Vector3();
    for (const c of this.live.values()) {
      if (!c.cells) continue;
      for (const cell of c.cells) if (cell.detail) for (const sg of cell.detail.signs) { v.set(sg.x, 0, sg.z).applyMatrix4(c.g.matrixWorld); out.push({ m: sg.m, x: v.x, z: v.z }); }
    }
    this._signs = out; this._signsFrame = this.W.frame;
    return out;
  }
  /** Leave the scene. The tiles themselves stay in memory for the next street. */
  dispose() {
    this.dead = true;
    for (const key of [...this.live.keys()]) this._detach(key);
    this.ready.clear();
    if (_stream === this) _stream = null;
  }
}
