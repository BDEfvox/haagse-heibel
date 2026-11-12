// Hashing helpers for the snapshot tool. Duck-typed on THREE objects (no import of three here, so there is only
// ever one copy of three: the one the code under test loads).
import crypto from 'node:crypto';

export const sha8 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Incremental hasher; every field is length-prefixed so adjacent fields cannot run together. */
export class Hx {
  constructor() { this.h = crypto.createHash('sha256'); }
  s(str) { const b = Buffer.from(String(str)); this.h.update(Buffer.from(String(b.length) + ':')); this.h.update(b); return this; }
  n(x) { const f = new Float64Array(1); f[0] = x; this.h.update(Buffer.from(f.buffer)); return this; }
  bytes(view) {
    if (!view) return this.s('nil');
    const b = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
    this.s((view.constructor && view.constructor.name) + '#' + view.length);
    this.h.update(b);
    return this;
  }
  done() { return this.h.digest('hex').slice(0, 16); }
}

const numStr = (v) => (Object.is(v, -0) ? '-0' : String(v));

/**
 * A canonical string of any value: numbers as written (-0 kept apart from 0), object keys sorted, typed arrays as a
 * hash of their bytes, THREE objects as the hash of what they draw, cycles cut. Nothing is rounded.
 */
export function canon(v, stack = new Set(), depth = 0) {
  if (v === null) return 'null';
  if (v === undefined) return 'undef';
  switch (typeof v) {
    case 'number': return numStr(v);
    case 'string': return JSON.stringify(v);
    case 'boolean': return v ? 'true' : 'false';
    case 'bigint': return v + 'n';
    case 'function': return 'fn';
    case 'symbol': return 'sym';
    default: break;
  }
  if (ArrayBuffer.isView(v)) return (v.constructor.name) + '[' + v.length + ']#' + new Hx().bytes(v).done();
  if (stack.has(v)) return '<cyc>';
  if (depth > 60) return '<deep>';
  if (v.isObject3D) return 'O3D#' + hashTree(v).all;
  if (v.isBufferGeometry) return 'GEO#' + hashGeometry(v);
  if (v.isMaterial) return 'MAT#' + hashMaterial(v);
  if (v.isTexture) return 'TEX#' + hashTexture(v);
  stack.add(v);
  try {
    if (Array.isArray(v)) return '[' + v.map((x) => canon(x, stack, depth + 1)).join(',') + ']';
    if (v instanceof Map) return 'Map{' + [...v].map(([k, x]) => canon(k, stack, depth + 1) + '=>' + canon(x, stack, depth + 1)).join(',') + '}';
    if (v instanceof Set) return 'Set{' + [...v].map((x) => canon(x, stack, depth + 1)).join(',') + '}';
    const keys = Object.keys(v).sort();
    const ctor = v.constructor && v.constructor !== Object ? v.constructor.name : '';
    return ctor + '{' + keys.map((k) => JSON.stringify(k) + ':' + canon(v[k], stack, depth + 1)).join(',') + '}';
  } finally { stack.delete(v); }
}
export const hashOf = (v) => sha8(canon(v));

// ---------------------------------------------------------------- THREE
const geoCache = new WeakMap(), matCache = new WeakMap(), texCache = new WeakMap();

function hashAttr(h, name, a) {
  h.s(name);
  if (a.isInterleavedBufferAttribute) {
    h.s('interleaved').n(a.itemSize).n(a.offset).n(a.data.stride).n(a.count).s(!!a.normalized).bytes(a.data.array);
  } else {
    h.s('attr').n(a.itemSize).n(a.count).s(!!a.normalized).n(a.gpuType || 0).n(a.meshPerAttribute === undefined ? -1 : a.meshPerAttribute).bytes(a.array);
  }
}
/** Every attribute (sorted by name: name, itemSize, bytes), the index, groups, draw range and bounds. */
export function hashGeometry(g) {
  const hit = geoCache.get(g);
  if (hit) return hit;
  const h = new Hx().s(g.type || 'geo');
  for (const k of Object.keys(g.attributes).sort()) hashAttr(h, k, g.attributes[k]);
  if (g.index) { h.s('index').bytes(g.index.array).n(g.index.itemSize); } else h.s('noindex');
  h.s(canon(g.groups)).s(canon(g.drawRange));
  if (g.boundingSphere) h.s('bs').n(g.boundingSphere.center.x).n(g.boundingSphere.center.y).n(g.boundingSphere.center.z).n(g.boundingSphere.radius);
  if (g.boundingBox) h.s('bb').s(canon(g.boundingBox));
  if (g.parameters) h.s(canon(g.parameters));
  h.s(canon(g.userData));
  const out = h.done();
  // (not cached for geometries that may still be edited: callers hash right after building, so cache only when asked)
  return out;
}
export function hashTexture(t) {
  const hit = texCache.get(t);
  if (hit) return hit;
  const h = new Hx().s(t.type || 'tex').s(t.constructor && t.constructor.name);
  for (const k of ['colorSpace', 'magFilter', 'minFilter', 'generateMipmaps', 'anisotropy', 'wrapS', 'wrapT', 'format', 'flipY', 'premultiplyAlpha']) h.s(k + '=' + canon(t[k]));
  const im = t.image;
  if (!im) h.s('noimage');
  else if (t.isDataTexture || im.data) h.s('data').n(im.width).n(im.height).bytes(im.data);
  else if (im.__log) h.s('canvas').n(im.width).n(im.height).s(canon(im.__log));
  else h.s('image?').n(im.width || 0).n(im.height || 0);
  h.s(canon(t.userData));
  const out = h.done();
  texCache.set(t, out);
  return out;
}
export function hashMaterial(m) {
  const hit = matCache.get(m);
  if (hit && !m.__mutable) return hit;
  const h = new Hx().s(m.type).s(m.name || '');
  for (const k of ['vertexColors', 'flatShading', 'transparent', 'opacity', 'side', 'alphaTest', 'depthWrite', 'depthTest', 'toneMapped', 'visible', 'blending', 'wireframe', 'fog', 'shininess', 'roughness', 'metalness', 'depthPacking', 'sizeAttenuation', 'dithering', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits']) if (k in m) h.s(k + '=' + canon(m[k]));
  for (const k of ['color', 'emissive', 'specular']) if (m[k] && m[k].isColor) h.s(k + '=' + m[k].getHex());
  if (m.map) h.s('map=' + hashTexture(m.map));
  if (m.alphaMap) h.s('alphaMap=' + hashTexture(m.alphaMap));
  if (typeof m.onBeforeCompile === 'function' && m.onBeforeCompile.toString().length > 30) h.s('obc=' + m.onBeforeCompile.toString());
  if (typeof m.customProgramCacheKey === 'function') { try { h.s('pck=' + m.customProgramCacheKey()); } catch (e) { h.s('pck-err'); } }
  if (m.isShaderMaterial) h.s(m.vertexShader || '').s(m.fragmentShader || '').s(canon(m.uniforms));
  if (m.defines) h.s(canon(m.defines));
  h.s(canon(m.userData));
  const out = h.done();
  matCache.set(m, out);
  return out;
}
export function vertexCount(o) {
  const p = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
  return p ? p.count : 0;
}
/** Hash a whole scene graph in traversal order: transforms, flags, userData, geometry, instance data, materials. */
export function hashTree(root) {
  const objs = [], all = new Hx();
  let verts = 0, inst = 0, meshes = 0;
  const visit = (o) => {
    const h = new Hx().s(o.type).s(o.name || '');
    const P = o.position, R = o.rotation, S = o.scale, Q = o.quaternion;
    h.n(P.x).n(P.y).n(P.z).n(R.x).n(R.y).n(R.z).s(R.order).n(S.x).n(S.y).n(S.z).n(Q.x).n(Q.y).n(Q.z).n(Q.w);
    h.s('vis=' + o.visible + ' cs=' + o.castShadow + ' rs=' + o.receiveShadow + ' ro=' + o.renderOrder + ' fc=' + o.frustumCulled + ' L=' + (o.layers && o.layers.mask) + ' mau=' + o.matrixAutoUpdate);
    h.s(canon(o.userData));
    if (o.isSprite && o.center) h.n(o.center.x).n(o.center.y);
    if (o.geometry) { h.s('geo=' + hashGeometry(o.geometry)); verts += vertexCount(o); meshes++; }
    if (o.material) h.s('mat=' + (Array.isArray(o.material) ? o.material.map(hashMaterial).join('+') : hashMaterial(o.material)));
    if (o.customDepthMaterial) h.s('cdm=' + hashMaterial(o.customDepthMaterial));
    if (o.isInstancedMesh) {
      inst += o.count;
      h.s('inst').n(o.count).bytes(o.instanceMatrix && o.instanceMatrix.array);
      h.s('icol').bytes(o.instanceColor ? o.instanceColor.array : null);
    }
    h.n(o.children.length);
    const hh = h.done();
    all.s(hh);
    objs.push(`${objs.length}|${o.type}${o.name ? ':' + o.name : ''}|v${vertexCount(o)}${o.isInstancedMesh ? 'x' + o.count : ''}|${hh}`);
    for (const c of o.children) visit(c);
  };
  visit(root);
  return { all: all.done(), n: objs.length, meshes, verts, instances: inst, objs };
}
/** Hash of a Vox builder via its public geometry() (all attributes + index), plus the vertex count. */
export function hashVox(v) {
  if (!v || typeof v.geometry !== 'function') return 'novox';
  const g = v.geometry();
  const out = hashGeometry(g) + ':' + v.n;
  g.dispose();
  return out;
}
