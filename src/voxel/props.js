// Buildings, street furniture and vehicles — the Hague voxel kit.
import * as THREE from 'three';
import { Vox, MAT, sculpt, piece, makeSign, TAU } from './kit.js';
import { makePerson } from './cast.js';
import { GLYPHS, fitText } from './brands.js';

const _c = new THREE.Color();
export const shade = (hex, k) => '#' + _c.set(hex).multiplyScalar(k).getHexString();

const BRICK = ['#9a6452', '#8f5a4a', '#b08064', '#80524a', '#d8b07a', '#e9e2d3', '#74504a', '#c9a070', '#a47058'];
const DOORS = ['#1f5b3a', '#1d3557', '#8d0801', '#2b2b2b', '#6a4c93', '#0b6e4f', '#e0a100'];
const ROOFS = ['#c8553d', '#8a3b2e', '#4a4e57', '#a44a3f', '#d9693f'];
const AWN = [['#e63946', '#ffffff'], ['#2a9d8f', '#ffffff'], ['#f4a261', '#ffffff'], ['#3a86ff', '#ffffff'], ['#ffb703', '#023047'], ['#52b788', '#ffffff']];
const STONE = '#efe9dc';
const LIT = ['#ffd97a', '#ffe9a8', '#ffc45e', '#fff1c1'];

function win(v, gl, x, y, z, w, h, night, rnd, litChance = 0.6) {
  v.box(x, y - 0.08, z + 0.04, w + 0.18, h + 0.18, 0.1, '#f6f3ec');
  const lit = night && rnd.chance(litChance);
  (lit ? gl : v).box(x, y, z + 0.07, w, h, 0.08, lit ? rnd.pick(LIT) : night ? '#1c2a44' : '#8fc7e8');
  v.box(x, y + h / 2 - 0.03, z + 0.09, w, 0.06, 0.07, '#f6f3ec');
  v.box(x, y - 0.14, z + 0.14, w + 0.3, 0.08, 0.2, STONE);
  return lit;
}

// ---------------------------------------------------------------- shop signs and window dressing
// Sign texture cache with a count of the signs using each texture, so a texture goes when its last sign goes
// (kit.signTexture keeps every text for ever, which would grow while roaming a city of 7,000 names).
const _sigTex = new Map();
function sigEntry(text, bg, fg) {
  const key = text + '|' + bg + '|' + fg;
  let e = _sigTex.get(key);
  if (!e) {
    const px = 16, pad = 6, font = `${px}px "Press Start 2P", monospace`, c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = font;
    c.width = Math.ceil(g.measureText(text).width) + pad * 2;
    c.height = px + pad * 2;
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.font = font; g.fillStyle = fg; g.textBaseline = 'top'; g.fillText(text, pad, pad + 1);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
    e = { key, tex, n: 0, aspect: c.width / c.height };
    _sigTex.set(key, e);
  }
  e.n++;
  return e;
}
/** The text plane of a shop sign, fitted between x0 and x1 and at most h tall. Give it back with releaseSign. */
function shopSign(sg, x0, x1, h) {
  // a narrow front gets a shorter text rather than letters too small to read
  const room = x1 - x0, maxN = Math.max(4, Math.floor(((room / 0.3) * 28 - 12) / 16));
  const text = sg.text.length > maxN ? fitText(sg.text, maxN) : sg.text;
  const e = sigEntry(text, sg.bg, sg.fg);
  const hh = Math.min(h, room / e.aspect);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(hh * e.aspect, hh), new THREE.MeshBasicMaterial({ map: e.tex, toneMapped: false }));
  m.userData.texKey = e.key;
  return m;
}
/** Let go of a sign made by shopSign (its geometry, material and, with the last user, its texture). Safe to call twice. */
export function releaseSign(m) {
  if (!m || m.userData.released) return;
  m.userData.released = true;
  m.geometry.dispose(); m.material.dispose();
  const e = _sigTex.get(m.userData.texKey);
  if (e && --e.n <= 0) { e.tex.dispose(); _sigTex.delete(e.key); }
}

const GOODS = ['#e63946', '#ffb703', '#2a9d8f', '#9d4edd', '#fb8500', '#ffffff'];
const LOAF = ['#c98a3c', '#b8742a', '#e0a95a', '#a86a2a'];
const CAKE = ['#f4d6a0', '#e7b6c0', '#8a4b2a', '#fff3d9'];
const FRUIT = ['#d63b2e', '#f2a31d', '#5fae3a', '#8fd14f', '#e8c92a'];
const CLOTHES = ['#e63946', '#2a9d8f', '#3a86ff', '#ffb703', '#9d4edd', '#222831', '#f1faee', '#fb8500'];
const BOOKS = ['#c1272d', '#2a5ab0', '#2f7d3a', '#e8b04a', '#6a3d7a', '#222222', '#e8e0d0'];
const BOTTLES = ['#2e8b57', '#7a1f3d', '#d4a017', '#4a90d9', '#e8e0d0', '#8a4b2a'];
const TULIPS = ['#e63946', '#ffb703', '#ff70a6', '#9d4edd', '#ffffff', '#fb8500'];
/**
 * What stands in the shop window or in front of it, by the `win` kind of the place's look (brands.js CAT_LOOK).
 * A handful of boxes each; c = { v, gl, lit (gl at night, v by day), night, rnd, x, w (the unit), gx, gw (the window), y0, gh, z, dx (door), fg, bg }.
 */
function dress(kind, c) {
  const { v, gl, lit, night, rnd, gx, gw, y0, gh, z, dx } = c;
  const left = gx - gw / 2, n = Math.max(1, Math.floor(gw / 0.6)), at = (i, k) => left + ((i + 0.5) * gw) / k;
  switch (kind) {
    case 'bread':
      v.box(gx, y0 + 1.05, z + 0.2, gw - 0.1, 0.05, 0.3, '#8d6e4c');
      v.box(gx, y0 + 0.55, z + 0.2, gw - 0.1, 0.05, 0.3, '#8d6e4c');
      for (let i = 0; i < n; i++) {
        v.box(at(i, n), y0 + 1.1, z + 0.2, 0.34, 0.2, 0.22, rnd.pick(LOAF));
        if (i % 2 === 0) v.box(at(i, n), y0 + 0.6, z + 0.2, 0.3, 0.16, 0.3, rnd.pick(CAKE));
      }
      break;
    case 'hair': {
      v.box(gx, y0 + 0.95, z + 0.13, gw - 0.3, 0.95, 0.04, '#cfe6f0');
      for (const f of [-0.25, 0.25]) {
        v.box(gx + gw * f, y0 + 0.5, z + 0.3, 0.5, 0.4, 0.5, '#222');
        v.box(gx + gw * f, y0 + 0.9, z + 0.14, 0.5, 0.5, 0.08, '#222');
      }
      // the red and white pole beside the door
      const px = c.x + c.w / 2 - 1.52;
      for (let j = 0; j < 6; j++) v.box(px, y0 + 0.95 + j * 0.17, z + 0.22, 0.14, 0.17, 0.14, j % 2 ? '#e63946' : '#ffffff');
      lit.box(px, y0 + 0.9, z + 0.22, 0.2, 0.06, 0.2, '#d4af37');
      lit.box(px, y0 + 1.97, z + 0.22, 0.2, 0.06, 0.2, '#d4af37');
      break;
    }
    case 'cross':
      for (const sy of [0.55, 1.1]) {
        v.box(gx, y0 + sy, z + 0.15, gw - 0.2, 0.04, 0.2, '#ffffff');
        for (let i = 0; i < n; i++) v.box(at(i, n), y0 + sy + 0.04, z + 0.15, 0.14, 0.3, 0.14, rnd.pick(['#2e8b57', '#ffffff', '#4a90d9', '#e8b04a']));
      }
      break;
    case 'crates':
      // fruit and vegetable crates on the pavement, produce in the window
      for (let k = 0; k < 2; k++) {
        const px = gx + (k ? 0.5 : -0.5) * gw * 0.5;
        v.box(px, y0, z + 0.7, 0.9, 0.3, 0.5, '#a5753c');
        v.box(px, y0 + 0.3, z + 0.75, 0.9, 0.3, 0.5, '#b8844a');
        for (let i = 0; i < 4; i++) v.box(px - 0.33 + i * 0.22, y0 + 0.6, z + 0.75, 0.2, 0.12, 0.4, rnd.pick(FRUIT));
      }
      for (let i = 0; i < n; i++) v.box(at(i, n), y0 + 0.5, z + 0.14, 0.4, rnd.range(0.2, 0.5), 0.1, rnd.pick(FRUIT));
      break;
    case 'spit': {
      const px = gx - gw * 0.2;
      for (let j = 0; j < 6; j++) v.box(px, y0 + 0.75 + j * 0.18, z + 0.28, 0.54 - j * 0.03, 0.18, 0.54 - j * 0.03, j % 2 ? '#8b4a2b' : '#a3623a');
      v.box(px, y0 + 0.65, z + 0.28, 0.1, 1.3, 0.1, '#9aa5ad');
      lit.box(px + 0.42, y0 + 0.8, z + 0.28, 0.05, 1.0, 0.4, '#ff7a1a');
      v.box(gx + gw * 0.25, y0 + 0.9, z + 0.14, 0.9, 0.7, 0.05, '#22262b');
      for (let j = 0; j < 3; j++) v.box(gx + gw * 0.25, y0 + 1.15 + j * 0.15, z + 0.18, 0.6, 0.05, 0.02, j % 2 ? '#ffd166' : '#ffffff');
      break;
    }
    case 'fryer': {
      const px = gx - gw * 0.22;
      v.box(px, y0 + 1.55, z + 0.2, 1.0, 0.35, 0.35, '#9aa5ad');
      v.box(px, y0 + 1.9, z + 0.25, 0.3, 0.3, 0.3, '#7a838b');
      v.box(px, y0 + 0.55, z + 0.2, 1.1, 0.7, 0.4, '#c9d1d6');
      v.box(gx + gw * 0.25, y0 + 0.8, z + 0.14, 1.1, 0.95, 0.05, '#22262b');
      for (let j = 0; j < 5; j++) v.box(gx + gw * 0.25 - 0.1, y0 + 0.95 + j * 0.15, z + 0.18, 0.5 + rnd.range(0, 0.3), 0.05, 0.02, j % 2 ? '#ffd166' : '#ffffff');
      v.box(px, y0 + 1.2, z + 0.3, 0.2, 0.25, 0.2, '#ffd23a');
      break;
    }
    case 'rail': {
      v.box(gx, y0 + 1.75, z + 0.2, gw - 0.2, 0.04, 0.04, '#333');
      for (let i = 0; i < n * 2; i++) v.box(left + 0.15 + (i + 0.5) * ((gw - 0.3) / (n * 2)), y0 + 1.15, z + 0.2, 0.1, 0.6, 0.12, rnd.pick(CLOTHES));
      for (const f of [-0.3, 0.3]) {
        if (gw < 3 && f > 0) break;
        const px = gx + gw * f;
        v.box(px, y0 + 0.5, z + 0.3, 0.1, 0.9, 0.1, '#e8e0d0');
        v.box(px, y0 + 0.75, z + 0.3, 0.34, 0.5, 0.2, rnd.pick(CLOTHES));
        v.box(px, y0 + 1.4, z + 0.3, 0.18, 0.2, 0.18, '#e8e0d0');
      }
      break;
    }
    case 'phones':
      v.box(gx, y0 + 0.55, z + 0.2, gw - 0.2, 0.1, 0.35, '#ffffff');
      for (let i = 0; i < n; i++) { v.box(at(i, n), y0 + 0.65, z + 0.22, 0.16, 0.3, 0.04, '#222'); lit.box(at(i, n), y0 + 0.69, z + 0.245, 0.12, 0.22, 0.01, night ? '#59d0ff' : '#6aa6c8'); }
      break;
    case 'bike':
      if (gw >= 2.3) bikeStatic(v, gw >= 4.4 ? gx - gw * 0.22 : gx, z + 0.5, rnd.pick(['#e63946', '#2a9d8f', '#1d3557', '#f4a261']), y0 + 0.5);
      if (gw >= 4.4) bikeStatic(v, gx + gw * 0.22, z + 0.5, rnd.pick(['#ffb703', '#8338ec', '#111']), y0 + 0.5);
      break;
    case 'trolleys':
      // wide glass, posters in it, and a row of nested trolleys by the door
      for (let i = 0; i < n; i++) v.box(at(i, n), y0 + 1.25 + (i % 2) * 0.2, z + 0.14, 0.45, 0.4, 0.04, rnd.pick(['#e63946', '#ffd166', '#ffffff', '#2a9d8f']));
      for (let i = 0; i < n; i++) v.box(at(i, n), y0 + 0.55, z + 0.17, 0.5, 0.25, 0.1, rnd.pick(FRUIT));
      for (let i = 0; i < 4; i++) {
        v.box(left + 0.5 + i * 0.3, y0 + 0.45, z + 0.95, 0.9, 0.35, 0.5, '#b9c2c9');
        v.box(left + 0.05 + i * 0.3, y0 + 0.8, z + 0.95, 0.06, 0.45, 0.5, '#8a949b');
      }
      break;
    case 'herring': {
      // a herring cart on the pavement with a Dutch flag
      const px = gx - gw * 0.15;
      v.box(px, y0, z + 0.95, 1.5, 0.8, 0.7, '#e8f1f7');
      v.box(px, y0 + 0.8, z + 0.95, 1.6, 0.08, 0.8, '#2d6a9f');
      v.box(px, y0 + 1.9, z + 0.95, 1.8, 0.08, 0.9, '#2d6a9f');
      v.box(px, y0 + 1.98, z + 0.95, 0.4, 0.04, 0.9, '#ffffff');
      for (const sx of [-0.8, 0.8]) v.box(px + sx, y0 + 0.88, z + 0.65, 0.05, 1.05, 0.05, '#cfd6db');
      v.box(px + 0.8, y0 + 1.98, z + 0.95, 0.04, 0.8, 0.04, '#cfd6db');
      v.box(px + 1.0, y0 + 2.58, z + 0.95, 0.4, 0.07, 0.02, '#e63946');
      v.box(px + 1.0, y0 + 2.51, z + 0.95, 0.4, 0.07, 0.02, '#ffffff');
      v.box(px + 1.0, y0 + 2.44, z + 0.95, 0.4, 0.07, 0.02, '#2a5ab0');
      for (let i = 0; i < n; i++) v.box(at(i, n), y0 + 0.6, z + 0.15, 0.4, 0.07, 0.14, '#c9d6df');
      break;
    }
    case 'dark':
      // darkened windows, a bench outside
      v.box(gx, y0 + 0.4, z + 0.8, 1.2, 0.08, 0.4, '#6b5a45');
      v.box(gx - 0.5, y0, z + 0.8, 0.08, 0.4, 0.35, '#444');
      v.box(gx + 0.5, y0, z + 0.8, 0.08, 0.4, 0.35, '#444');
      break;
    case 'taps':
      v.box(gx, y0, z + 0.1, gw, 0.5, 0.06, '#5b3a24');
      v.box(gx, y0 + 1.0, z + 0.16, gw - 0.4, 0.05, 0.25, '#7a5230');
      for (let i = 0; i < Math.min(5, n); i++) {
        v.box(at(i, Math.min(5, n)), y0 + 1.35, z + 0.16, 0.06, 0.18, 0.06, '#d4af37');
        v.box(at(i, Math.min(5, n)) + 0.1, y0 + 1.05, z + 0.2, 0.14, 0.2, 0.14, '#f2b632');
      }
      lit.box(c.x + c.w / 2 - 1.55, y0 + 1.95, z + 0.2, 0.18, 0.28, 0.18, '#ffcf6b');
      break;
    case 'chalk': {
      const bx = c.x - c.w / 2 + 0.9;
      v.box(bx, y0, z + 0.7, 0.7, 1.0, 0.08, '#22262b');
      for (let j = 0; j < 3; j++) v.box(bx, y0 + 0.35 + j * 0.2, z + 0.75, 0.5, 0.05, 0.02, '#f1f1f1');
      for (let i = 0; i < Math.min(2, n); i++) {
        v.box(at(i, 2), y0 + 0.5, z + 0.25, 0.5, 0.05, 0.5, '#8d6e4c');
        v.box(at(i, 2), y0, z + 0.25, 0.06, 0.5, 0.06, '#555');
      }
      break;
    }
    case 'pizza':
      for (let j = 0; j < 4; j++) v.box(gx - gw * 0.2, y0 + 0.55 + j * 0.07, z + 0.25, 0.7, 0.07, 0.7, j % 2 ? '#ffffff' : '#f6efe0');
      v.box(gx - gw * 0.2, y0 + 0.8, z + 0.25, 0.72, 0.04, 0.2, '#e63946');
      lit.box(gx + gw * 0.2, y0 + 0.7, z + 0.2, 0.9, 0.5, 0.1, night ? '#ff7a2a' : '#d9552b');
      v.box(gx + gw * 0.2, y0 + 1.3, z + 0.14, 0.9, 0.5, 0.05, '#2f7d3a');
      break;
    case 'burger': {
      v.box(gx, y0 + 1.0, z + 0.14, gw - 0.4, 0.8, 0.05, '#2a1a12');
      const bx = gx - gw * 0.3;
      v.box(bx, y0 + 1.1, z + 0.18, 0.5, 0.12, 0.03, '#e8b04a');
      v.box(bx, y0 + 1.22, z + 0.18, 0.54, 0.06, 0.03, '#5fae3a');
      v.box(bx, y0 + 1.28, z + 0.18, 0.5, 0.1, 0.03, '#7a2e12');
      v.box(bx, y0 + 1.38, z + 0.18, 0.46, 0.14, 0.03, '#e8b04a');
      for (let j = 0; j < 4; j++) v.box(gx + gw * 0.15, y0 + 1.1 + j * 0.15, z + 0.18, 0.9 - (j % 2) * 0.3, 0.06, 0.02, j % 2 ? '#ffd166' : '#ffffff');
      v.box(gx, y0 + 0.5, z + 0.25, gw - 0.6, 0.06, 0.4, '#d9d2c3');
      break;
    }
    case 'chicken':
      for (let k = 0; k < Math.min(2, n); k++) {
        const px = at(k, 2);
        v.box(px, y0 + 0.55, z + 0.25, 0.5, 0.55, 0.5, '#ffffff');
        v.box(px, y0 + 0.7, z + 0.26, 0.52, 0.12, 0.52, '#c1272d');
        for (let i = 0; i < 3; i++) v.box(px - 0.15 + i * 0.15, y0 + 1.1, z + 0.25, 0.14, 0.14, 0.14, '#d98a3a');
      }
      break;
    case 'cone': {
      const px = c.x - c.w / 2 + 0.7;
      for (let j = 0; j < 3; j++) v.box(px, y0 + 1.6 + j * 0.15, z + 0.55, 0.12 + j * 0.1, 0.15, 0.12 + j * 0.1, '#d9a35c');
      v.box(px, y0 + 2.05, z + 0.55, 0.4, 0.2, 0.4, '#f78fb3');
      v.box(px, y0 + 2.25, z + 0.55, 0.34, 0.18, 0.34, '#fff3d9');
      for (let i = 0; i < n; i++) v.box(at(i, n), y0 + 0.55, z + 0.17, 0.4, 0.2, 0.2, rnd.pick(['#f78fb3', '#fff3d9', '#a67c52', '#8fd14f', '#ffd166']));
      break;
    }
    case 'flowers':
      for (let k = 0; k < 3; k++) {
        const px = gx + (k - 1) * gw * 0.3;
        v.box(px, y0, z + 0.65, 0.4, 0.35, 0.4, '#7a8a96');
        for (let i = 0; i < 3; i++) { v.box(px - 0.12 + i * 0.12, y0 + 0.35, z + 0.65, 0.04, 0.35, 0.04, '#3f8f3a'); v.box(px - 0.12 + i * 0.12, y0 + 0.65, z + 0.65, 0.12, 0.12, 0.12, rnd.pick(TULIPS)); }
      }
      for (let i = 0; i < n; i++) v.box(at(i, n), y0 + 0.6, z + 0.15, 0.2, 0.3, 0.1, rnd.pick(TULIPS));
      break;
    case 'books':
      for (const sy of [0.5, 1.15, 1.8]) {
        v.box(gx, sy + y0, z + 0.15, gw - 0.2, 0.04, 0.2, '#6b4a2a');
        for (let i = 0; i < n * 2 - 1; i++) v.box(left + 0.2 + (i + 0.5) * ((gw - 0.4) / (n * 2 - 1)), y0 + sy + 0.04, z + 0.15, 0.1, rnd.range(0.3, 0.5), 0.14, rnd.pick(BOOKS));
      }
      break;
    case 'glasses':
      for (const sy of [0.7, 1.3]) {
        v.box(gx, y0 + sy, z + 0.15, gw - 0.2, 0.04, 0.2, '#ffffff');
        for (let i = 0; i < n; i++) { v.box(at(i, n) - 0.07, y0 + sy + 0.05, z + 0.17, 0.11, 0.09, 0.04, '#222'); v.box(at(i, n) + 0.07, y0 + sy + 0.05, z + 0.17, 0.11, 0.09, 0.04, '#222'); }
      }
      break;
    case 'jewel':
      v.box(gx, y0 + 0.5, z + 0.12, gw - 0.2, 1.5, 0.04, '#2a1f3d');
      for (let i = 0; i < n * 2; i++) lit.box(left + 0.2 + rnd.range(0, gw - 0.4), y0 + 0.7 + rnd.range(0, 1.1), z + 0.16, 0.07, 0.07, 0.03, rnd.pick(['#e6c35c', '#9be8ff', '#ffffff']));
      break;
    case 'shelves':
      for (const sy of [0.55, 1.1, 1.65]) {
        v.box(gx, y0 + sy, z + 0.15, gw - 0.2, 0.04, 0.2, '#e8e0d0');
        for (let i = 0; i < n; i++) v.box(at(i, n), y0 + sy + 0.04, z + 0.15, 0.3, rnd.range(0.2, 0.4), 0.14, rnd.pick(GOODS));
      }
      break;
    case 'bottles':
      for (const sy of [0.55, 1.1, 1.65]) {
        v.box(gx, y0 + sy, z + 0.15, gw - 0.2, 0.04, 0.2, '#e8e0d0');
        for (let i = 0; i < n * 2; i++) v.box(left + 0.15 + (i + 0.5) * ((gw - 0.3) / (n * 2)), y0 + sy + 0.04, z + 0.15, 0.1, rnd.range(0.25, 0.4), 0.1, rnd.pick(BOTTLES));
      }
      break;
    case 'meat':
      v.box(gx, y0 + 0.5, z + 0.2, gw - 0.2, 0.5, 0.4, '#e9e9e9');
      for (let i = 0; i < n; i++) v.box(at(i, n), y0 + 1.0, z + 0.2, 0.34, 0.1, 0.28, rnd.pick(['#c0392b', '#e8a0a0', '#8a2a2a']));
      v.box(gx, y0 + 1.85, z + 0.2, gw - 0.2, 0.04, 0.04, '#555');
      for (let i = 0; i < n; i++) v.box(at(i, n), y0 + 1.4, z + 0.2, 0.07, 0.45, 0.07, '#a8433a');
      break;
    case 'furniture': {
      const px = gx - gw * 0.2;
      v.box(px, y0 + 0.5, z + 0.35, Math.min(1.8, gw * 0.5), 0.4, 0.7, '#6f8f9f');
      v.box(px, y0 + 0.9, z + 0.15, Math.min(1.8, gw * 0.5), 0.5, 0.2, '#5a7a8a');
      v.box(gx + gw * 0.3, y0 + 0.5, z + 0.3, 0.05, 1.2, 0.05, '#555');
      lit.box(gx + gw * 0.3, y0 + 1.7, z + 0.3, 0.35, 0.25, 0.35, '#ffe9a8');
      break;
    }
    case 'diy':
      for (let i = 0; i < 4; i++) v.box(left + 0.4 + i * 0.35, y0, z + 0.7, 0.3, 0.35, 0.3, rnd.pick(['#e63946', '#ffb703', '#3a86ff', '#ffffff']));
      v.box(left + 1.9, y0, z + 0.6, 0.05, 1.8, 0.05, '#c9d1d6');
      v.box(left + 2.3, y0, z + 0.6, 0.05, 1.8, 0.05, '#c9d1d6');
      for (let j = 0; j < 5; j++) v.box(left + 2.1, y0 + 0.3 + j * 0.35, z + 0.6, 0.45, 0.04, 0.05, '#c9d1d6');
      for (let i = 0; i < n; i++) v.box(at(i, n), y0 + 0.9, z + 0.15, 0.3, 0.5, 0.12, rnd.pick(['#e6a100', '#2a6ab0', '#5fae3a']));
      break;
    case 'car':
      if (gw >= 2.6) {
        const col = rnd.pick(['#d93030', '#2a5ab0', '#e8e8e8', '#2f7d3a']);
        v.box(gx, y0 + 0.65, z + 0.5, 2.1, 0.4, 0.95, col);
        v.box(gx - 0.1, y0 + 1.05, z + 0.5, 1.1, 0.35, 0.85, '#bfd9e8');
        for (const sx of [-0.7, 0.7]) for (const sz of [-0.4, 0.4]) v.box(gx + sx, y0 + 0.45, z + 0.5 + sz, 0.4, 0.4, 0.1, '#222');
      }
      break;
    case 'washers':
      for (let i = 0; i < Math.min(4, n); i++) {
        v.box(at(i, Math.min(4, n)), y0 + 0.5, z + 0.2, 0.7, 0.9, 0.5, '#f1f1f1');
        v.box(at(i, Math.min(4, n)), y0 + 0.75, z + 0.46, 0.4, 0.4, 0.03, '#2a5ab0');
      }
      break;
    case 'posters':
      for (let i = 0; i < n; i++) lit.box(at(i, n), y0 + 0.6, z + 0.14, 0.5, 1.2, 0.04, rnd.pick(['#c1272d', '#2a5ab0', '#e8b04a', '#6a3d7a', '#2f7d3a']));
      break;
    case 'weights':
      for (let i = 0; i < Math.min(5, n); i++) {
        const px = at(i, Math.min(5, n));
        v.box(px, y0 + 0.6, z + 0.2, 0.5, 0.05, 0.05, '#555');
        v.box(px - 0.22, y0 + 0.5, z + 0.2, 0.08, 0.25, 0.15, '#222');
        v.box(px + 0.22, y0 + 0.5, z + 0.2, 0.08, 0.25, 0.15, '#222');
      }
      break;
    case 'tank':
      lit.box(gx - gw * 0.2, y0 + 0.75, z + 0.16, gw * 0.4, 0.8, 0.06, night ? '#6ae0ff' : '#3ec6e0');
      for (let k = 0; k < 2; k++) v.box(gx + gw * (0.15 + k * 0.2), y0 + 0.55 + k * 0.5, z + 0.2, 0.35, 0.35, 0.3, '#9aa5ad');
      break;
    case 'toys':
      for (let i = 0; i < n * 2; i++) v.box(left + 0.2 + rnd.range(0, gw - 0.4), y0 + 0.5 + rnd.int(0, 2) * 0.3, z + 0.18, 0.25, 0.25, 0.2, rnd.pick(GOODS));
      break;
    case 'shoes':
      for (const sy of [0.6, 1.1, 1.6]) {
        v.box(gx, y0 + sy, z + 0.15, gw - 0.2, 0.04, 0.2, '#ffffff');
        for (let i = 0; i < n; i++) v.box(at(i, n), y0 + sy + 0.04, z + 0.15, 0.3, 0.12, 0.12, rnd.pick(CLOTHES));
      }
      break;
    case 'tvs':
      for (let i = 0; i < Math.min(4, n); i++) {
        const px = at(i, Math.min(4, n));
        v.box(px, y0 + 0.6 + (i % 2) * 0.55, z + 0.15, 0.6, 0.4, 0.06, '#111');
        lit.box(px, y0 + 0.65 + (i % 2) * 0.55, z + 0.19, 0.52, 0.3, 0.01, night ? '#6ab8ff' : '#2a4a6a');
      }
      break;
    case 'neon':
      lit.box(gx, y0 + 1.4, z + 0.15, gw * 0.6, 0.06, 0.04, c.fg);
      lit.box(gx, y0 + 0.9, z + 0.15, gw * 0.4, 0.06, 0.04, c.fg);
      break;
    default: // 'plain'
  }
}

/** Dutch row house with its front face at z, facing +z. Returns anchors. */
export function house(v, gl, o) {
  const { x, z, w, rnd, night } = o;
  const depth = o.depth ?? 5, floors = o.floors ?? 3, y0 = o.y ?? 0.15;
  const gh = 2.6, fh = 2.2, H = gh + (floors - 1) * fh, zc = z - depth / 2;
  const wall = o.wall || rnd.pick(BRICK);
  const roof = o.roof || rnd.pick(['flat', 'flat', 'pitch', 'step', 'bell']);
  const roofCol = o.roofCol || rnd.pick(ROOFS);
  const out = { x, w, top: y0 + H, sign: null };

  v.box(x, y0, zc, w - 0.08, H, depth, wall, 0.03);
  v.box(x, y0, zc + 0.05, w - 0.02, 0.34, depth, shade(wall, 0.62));
  v.box(x, y0 + gh - 0.12, z + 0.03, w - 0.08, 0.12, 0.1, STONE);

  const cols = Math.max(2, Math.round(w / 1.75)), sp = w / cols;
  const cx = (c) => x - w / 2 + sp * (c + 0.5);
  for (let f = 1; f < floors; f++) {
    for (let c = 0; c < cols; c++) win(v, gl, cx(c), y0 + gh + (f - 1) * fh + 0.62, z, 0.9, 1.2, night, rnd);
  }
  out.win = { x: cx(rnd.int(0, cols - 1)), y: y0 + gh + 0.62, z: z + 0.2 };

  // ground floor
  const doorCol = rnd.pick(DOORS);
  if (o.shop) {
    const S = o.shop, L = S.look, sg = S.sign, lit = night ? gl : v;
    // room for a cash machine on the left of a bank, and what remains for the window
    let leftPad = o.atm ? 1.7 : 0.45;
    if (w - leftPad - 1.75 < 1.2) leftPad = 0.45;
    const dx = x + w / 2 - 0.85, gw = w - leftPad - 1.75, gx = x - w / 2 + leftPad + gw / 2;
    v.box(gx, y0 + 0.4, z + 0.04, gw + 0.2, 1.75, 0.1, '#f6f3ec');
    if (L.win === 'shutter') {
      // a closed shop: roller shutter with ribs
      v.box(gx, y0 + 0.5, z + 0.07, gw, 1.55, 0.08, '#8d949b');
      for (let i = 0; i < 7; i++) v.box(gx, y0 + 0.58 + i * 0.22, z + 0.12, gw, 0.04, 0.03, '#6f767d');
    } else {
      const glass = L.dark ? (night ? '#2a2118' : '#1b212a') : night ? '#ffe9a8' : '#a9dcf5';
      (night && !L.dark ? gl : v).box(gx, y0 + 0.5, z + 0.07, gw, 1.55, 0.08, glass);
      dress(L.win, { v, gl, lit, night, rnd, x, w, gx, gw, y0, gh, z, dx, fg: sg.fg, bg: sg.bg });
    }
    v.box(dx, y0, z + 0.05, 0.9, 1.85, 0.1, doorCol);
    (night ? gl : v).box(dx, y0 + 0.9, z + 0.08, 0.6, 0.75, 0.06, L.dark ? '#2a2118' : night ? '#ffe9a8' : '#a9dcf5');
    if (L.awn) {
      const a = sg.kind === 'name' ? sg.bg : L.awn[0], b = L.awn[1], n = Math.floor((w - 0.3) / 0.42);
      for (let i = 0; i < 3; i++) {
        for (let q = 0; q < n; q++) v.box(x - (n * 0.42) / 2 + 0.21 + q * 0.42, y0 + gh - 0.32 - i * 0.13, z + 0.2 + i * 0.3, 0.42, 0.1, 0.32, q % 2 ? a : b);
      }
    }
    // the sign: one board over the whole group of units the shop takes (the first unit draws it); lit, so it reads at night
    if (S.head) {
      const bandY = y0 + gh + 0.13, bandH = 0.78, span = S.signW || w - 0.1, cxs = x + (S.off || 0), left = cxs - span / 2;
      const mk = sg.mark && span >= 3.2 ? GLYPHS[sg.mark.g] : null, endPad = L.hang || 0;
      gl.box(cxs, bandY - bandH / 2, z + 0.09, span, bandH, 0.1, sg.bg);
      v.box(cxs, bandY + bandH / 2, z + 0.09, span + 0.06, 0.05, 0.13, sg.fg);
      v.box(cxs, bandY - bandH / 2 - 0.05, z + 0.09, span + 0.06, 0.05, 0.13, sg.fg);
      if (mk) {
        // the mark: a plate with five rows of coloured pixels, our own drawing for each chain
        const cs = 0.13, mx = left + 0.12 + 0.38;
        gl.box(mx, bandY - 0.38, z + 0.155, 0.76, 0.76, 0.03, sg.mark.p);
        for (let r = 0; r < 5; r++) {
          const row = mk[r];
          for (let cI = 0; cI < 5;) {
            const ch = row[cI];
            if (ch === '.') { cI++; continue; }
            let e = cI; while (e < 5 && row[e] === ch) e++;
            gl.box(mx + ((cI + e - 1) / 2 - 2) * cs, bandY + (2 - r) * cs - cs / 2, z + 0.18, (e - cI) * cs, cs, 0.03, ch === 'a' ? sg.mark.a : sg.mark.b);
            cI = e;
          }
        }
      }
      const tL = left + 0.12 + (mk ? 0.84 : 0), tR = left + span - 0.12 - endPad;
      if (endPad) { // a projecting green cross and the like
        const hx = left + span - 0.12 - endPad / 2 + 0.05;
        gl.box(hx, bandY - 0.32, z + 0.3, 0.2, 0.64, 0.12, sg.fg);
        gl.box(hx, bandY - 0.1, z + 0.3, 0.64, 0.2, 0.12, sg.fg);
      }
      if (!o.dry) {
        out.sign = shopSign(sg, tL, tR, bandH - 0.12);
        out.sign.position.set((tL + tR) / 2, bandY, z + 0.165);
      }
    }
    out.door = { x: dx, z: z + 0.9 };
    out.shop = sg.text;
    out.cat = S.cat;
    out.name = sg.text;
  } else {
    const dc = rnd.int(0, cols - 1), dx = cx(dc);
    v.box(dx, y0, z + 0.03, 1.14, 2.25, 0.08, '#f6f3ec');
    v.box(dx, y0, z + 0.06, 0.9, 1.8, 0.1, doorCol);
    v.box(dx + 0.28, y0 + 0.9, z + 0.12, 0.08, 0.08, 0.04, '#e9c46a');
    (night && rnd.chance(0.5) ? gl : v).box(dx, y0 + 1.84, z + 0.07, 0.86, 0.3, 0.06, night ? '#ffd97a' : '#8fc7e8');
    v.box(dx, y0, z + 0.3, 1.3, 0.12, 0.5, '#bdb6aa');
    for (let c = 0; c < cols; c++) if (c !== dc) win(v, gl, cx(c), y0 + 0.78, z, 0.95, 1.4, night, rnd, 0.75);
    out.door = { x: dx, z: z + 0.9 };
  }

  // roof
  const ry = y0 + H;
  if (roof === 'flat') {
    v.box(x, ry, zc + 0.1, w + 0.12, 0.3, depth + 0.3, STONE);
    v.box(x, ry + 0.3, zc, w - 0.3, 0.08, depth - 0.3, '#4a4e57');
    out.top = ry + 0.38;
  } else if (roof === 'pitch') {
    const n = 5, D = depth + 0.3;
    for (let i = 0; i < n; i++) v.box(x, ry + i * 0.36, zc, w - 0.04, 0.36, D - (i * D * 0.92) / n, roofCol, 0.05);
    v.box(x, ry + 0.2, z - 0.75, 1.3, 1.0, 1.1, '#f6f3ec');
    (night && rnd.chance(0.5) ? gl : v).box(x, ry + 0.4, z - 0.2, 0.9, 0.6, 0.06, night ? '#ffd97a' : '#8fc7e8');
    v.box(x, ry + 1.2, z - 0.75, 1.5, 0.1, 1.3, shade(roofCol, 0.8));
    out.top = ry + n * 0.36;
  } else {
    // gable facing the street (stepped or bell), pitched roof running back
    const n = 5, W = w - 0.3;
    for (let i = 0; i < n; i++) v.box(x, ry + i * 0.42, zc - 0.2, W - (i * W * 0.9) / n, 0.42, depth - 0.4, roofCol, 0.05);
    if (roof === 'step') {
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        const sw = (w - 0.08) * (1 - i / (steps + 0.4));
        v.box(x, ry + i * 0.5, z - 0.22, sw, 0.5, 0.44, wall, 0.03);
        v.box(x, ry + (i + 1) * 0.5 - 0.06, z - 0.22, sw + 0.1, 0.08, 0.5, STONE);
      }
      win(v, gl, x, ry + 0.25, z, 0.6, 0.6, night, rnd);
      out.top = ry + steps * 0.5;
    } else {
      v.box(x, ry, z - 0.22, w * 0.52, 1.7, 0.44, wall, 0.03);
      v.box(x - w * 0.36, ry, z - 0.22, w * 0.2, 0.8, 0.44, STONE);
      v.box(x + w * 0.36, ry, z - 0.22, w * 0.2, 0.8, 0.44, STONE);
      v.box(x - w * 0.3, ry + 0.8, z - 0.22, w * 0.1, 0.5, 0.44, STONE);
      v.box(x + w * 0.3, ry + 0.8, z - 0.22, w * 0.1, 0.5, 0.44, STONE);
      v.box(x, ry + 1.7, z - 0.22, w * 0.6, 0.16, 0.5, STONE);
      v.box(x, ry + 1.86, z - 0.22, w * 0.3, 0.2, 0.44, STONE);
      win(v, gl, x, ry + 0.45, z, 0.6, 0.7, night, rnd);
      out.top = ry + 2.06;
    }
  }
  const chx = x + w * 0.27 * (rnd.chance(0.5) ? 1 : -1);
  v.box(chx, ry + 0.2, zc - 0.8, 0.6, 1.5, 0.6, shade(wall, 0.85));
  v.box(chx, ry + 1.7, zc - 0.8, 0.72, 0.12, 0.72, STONE);
  out.chimney = { x: chx, y: ry + 1.82, z: zc - 0.8 };
  return out;
}

/** Modern tower block, front at z. */
export function tower(v, gl, o) {
  const { x, z, w, rnd, night } = o;
  const depth = o.depth ?? 5, floors = o.floors ?? 9, y0 = o.y ?? 0.15, fh = 1.5, gh = 2.8;
  const H = gh + floors * fh, zc = z - depth / 2;
  const body = rnd.pick(['#cfd8dc', '#b8c4cc', '#e3ded3', '#9fb0ba', '#d7c9b8', '#8fa3ad']);
  const accent = rnd.pick(['#e76f51', '#2a9d8f', '#457b9d', '#f4a261', '#6d597a']);
  v.box(x, y0, zc, w - 0.1, H, depth, body, 0.02);
  (night ? gl : v).box(x, y0 + 0.3, z + 0.05, w - 1, gh - 0.8, 0.08, night ? '#ffe9a8' : '#a9dcf5');
  v.box(x, y0 + gh - 0.3, z + 0.3, w - 0.4, 0.2, 0.7, accent);
  const cells = Math.floor((w - 0.8) / 0.85), cw = (w - 0.8) / cells;
  for (let f = 0; f < floors; f++) {
    const y = y0 + gh + f * fh + 0.35;
    for (let c = 0; c < cells; c++) {
      const lit = night && rnd.chance(0.45);
      (lit ? gl : v).box(x - (w - 0.8) / 2 + cw * (c + 0.5), y, z + 0.05, cw - 0.12, 0.85, 0.06, lit ? rnd.pick(LIT) : night ? '#1c2a44' : '#8fc7e8');
    }
    // side windows
    for (let c = 0; c < 3; c++) {
      const lit = night && rnd.chance(0.4);
      (lit ? gl : v).box(x + w / 2 - 0.02, y, zc - 1.4 + c * 1.4, 0.06, 0.85, 0.9, lit ? rnd.pick(LIT) : night ? '#1c2a44' : '#7fb9db');
    }
  }
  v.box(x, y0 + H, zc, w + 0.1, 0.25, depth + 0.1, shade(body, 0.8));
  v.box(x - w * 0.2, y0 + H + 0.25, zc, 1.4, 0.7, 1.4, '#8d99a6');
  v.box(x + w * 0.25, y0 + H + 0.25, zc + 0.6, 0.12, 2.6, 0.12, '#555');
  gl.box(x + w * 0.25, y0 + H + 2.85, zc + 0.6, 0.22, 0.22, 0.22, '#ff3b3b');
  return { x, w, top: y0 + H + 0.25, door: { x, z: z + 0.9 }, win: { x, y: y0 + gh + 0.4, z: z + 0.2 }, tower: true };
}

// ---------------------------------------------------------------- greenery & furniture
const GREENS = ['#4caf50', '#43a047', '#66bb6a', '#2e9e55', '#58b368'];
export function tree(v, x, z, rnd, y = 0.15, autumn = false) {
  const h = rnd.range(1.3, 2.0), g = autumn ? rnd.pick(['#e9a23b', '#d9622b', '#c94f2e', '#8fae3a']) : rnd.pick(GREENS);
  v.box(x, y, z, 0.42, h, 0.42, '#7a5234', 0.05);
  const s = rnd.range(0.85, 1.15);
  v.box(x, y + h, z, 2.2 * s, 0.8, 2.2 * s, shade(g, 0.86), 0.05);
  v.box(x, y + h + 0.8, z, 2.7 * s, 1.0, 2.7 * s, g, 0.05);
  v.box(x + rnd.range(-0.2, 0.2), y + h + 1.8, z + rnd.range(-0.2, 0.2), 1.9 * s, 0.8, 1.9 * s, shade(g, 1.1), 0.05);
  v.box(x, y + h + 2.6, z, 0.9 * s, 0.4, 0.9 * s, shade(g, 1.18));
}
export function bush(v, x, z, rnd, y = 0.15, s = 1) {
  const g = rnd.pick(GREENS);
  v.box(x, y, z, 1.0 * s, 0.6 * s, 0.9 * s, shade(g, 0.9), 0.06);
  v.box(x + 0.1, y + 0.6 * s, z, 0.6 * s, 0.3 * s, 0.6 * s, g, 0.06);
}
export function tulips(v, x, z, rnd, y = 0.15, n = 5, spread = 0.9) {
  for (let i = 0; i < n; i++) {
    const px = x + rnd.range(-spread, spread), pz = z + rnd.range(-spread * 0.4, spread * 0.4);
    v.box(px, y, pz, 0.06, 0.3, 0.06, '#3a9d4a');
    v.box(px, y + 0.3, pz, 0.18, 0.2, 0.18, rnd.pick(['#ff3b5c', '#ffcc00', '#ff8fab', '#ff7b00', '#c77dff', '#ffffff']));
  }
}
export function lamp(v, gl, x, z, night, y = 0.15, side = 1) {
  v.box(x, y, z, 0.24, 0.3, 0.24, '#263a33');
  v.box(x, y + 0.3, z, 0.13, 3.5, 0.13, '#2f4a40');
  v.box(x, y + 3.7, z + side * 0.35, 0.13, 0.1, 0.8, '#2f4a40');
  v.box(x, y + 3.52, z + side * 0.7, 0.4, 0.18, 0.4, '#263a33');
  (night ? gl : v).box(x, y + 3.4, z + side * 0.7, 0.3, 0.14, 0.3, night ? '#ffe9a8' : '#f4f1ea');
  return { x, y: y + 3.3, z: z + side * 0.7 };
}
export function bench(v, x, z, y = 0.15, rot = 0) {
  const w = rot ? 0.5 : 1.7, d = rot ? 1.7 : 0.5;
  v.box(x, y + 0.36, z, w, 0.1, d, '#b07a45');
  if (rot) { v.box(x, y, z - 0.7, 0.4, 0.36, 0.1, '#444'); v.box(x, y, z + 0.7, 0.4, 0.36, 0.1, '#444'); v.box(x - 0.22, y + 0.46, z, 0.08, 0.5, d, '#b07a45'); }
  else { v.box(x - 0.7, y, z, 0.1, 0.36, 0.4, '#444'); v.box(x + 0.7, y, z, 0.1, 0.36, 0.4, '#444'); v.box(x, y + 0.46, z - 0.22, w, 0.5, 0.08, '#b07a45'); }
}
export function bin(v, x, z, y = 0.15) {
  v.box(x, y, z, 0.5, 0.8, 0.5, '#2e7d4f');
  v.box(x, y + 0.8, z, 0.58, 0.1, 0.58, '#1f5a38');
  v.box(x, y + 0.5, z + 0.26, 0.3, 0.1, 0.02, '#111');
}
export function bollard(v, x, z, y = 0.15) {
  v.box(x, y, z, 0.2, 0.7, 0.2, '#3d3d3d');
  v.box(x, y + 0.7, z, 0.26, 0.1, 0.26, '#e9c46a');
}
export function mailbox(v, x, z, y = 0.15) {
  v.box(x, y, z, 0.2, 0.5, 0.2, '#555');
  v.box(x, y + 0.5, z, 0.7, 0.8, 0.5, '#f77f00');
  v.box(x, y + 1.0, z + 0.26, 0.4, 0.06, 0.02, '#222');
}
export function hedge(v, x, z, len, y = 0.15) {
  for (let i = 0; i < len; i++) v.box(x + i - len / 2 + 0.5, y, z, 1.0, 0.7, 0.5, '#3f9a52', 0.07);
}
export function atm(v, gl, x, z, y = 0.15) {
  v.box(x, y, z + 0.2, 1.1, 2.0, 0.4, '#dfe6ea');
  v.box(x, y + 2.0, z + 0.25, 1.2, 0.3, 0.5, '#005eb8');
  gl.box(x, y + 1.1, z + 0.41, 0.7, 0.5, 0.02, '#59d0ff');
  v.box(x, y + 0.7, z + 0.42, 0.6, 0.24, 0.06, '#9aa5ad');
  v.box(x + 0.34, y + 0.4, z + 0.41, 0.26, 0.08, 0.02, '#222');
}
/** Bicycle scale shared by the ridden bike and the parked ones (about 1.85 m long, 0.67 m wheels). */
const BK = 1.19;
/** One bicycle drawn into a Vox. Frame runs along z (front = +z) if alongZ, else along x (front = +x). */
function bikeBox(v, alongZ, x, y, z, col, dir = 1) {
  const k = BK;
  // (lateral, up, forward) -> box
  const B = (f, up, h, w, l, c) => {
    if (alongZ) v.box(x, y + up * k, z + dir * f * k, w * k, h * k, l * k, c);
    else v.box(x + dir * f * k, y + up * k, z, l * k, h * k, w * k, c);
  };
  B(-0.5, 0, 0.56, 0.08, 0.56, '#1f1f1f');
  B(0.5, 0, 0.56, 0.08, 0.56, '#1f1f1f');
  B(0, 0.3, 0.1, 0.08, 0.9, col);
  B(-0.25, 0.36, 0.46, 0.08, 0.08, col);
  B(-0.25, 0.8, 0.08, 0.16, 0.3, '#2b2b2b');
  B(0.4, 0.36, 0.62, 0.08, 0.08, col);
  B(0.4, 0.96, 0.07, 0.5, 0.07, '#2b2b2b');
}
/** Static parked bicycle drawn into a Vox (lying along x), same size as the ridden one. */
export function bikeStatic(v, x, z, col, y = 0.15) {
  bikeBox(v, false, x, y, z, col);
}
export function bikeRack(v, x, z, rnd, n = 4, y = 0.15) {
  for (let i = 0; i < n; i++) {
    const px = x + (i - (n - 1) / 2) * 0.8;
    v.box(px, y, z - 0.6, 0.06, 0.6, 0.06, '#9aa5ad');
    if (rnd.chance(0.8)) {
      // bikes parked perpendicular to the street, front wheel toward -z, locked to the rack post
      const col = rnd.pick(['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#111', '#ff70a6', '#8ecae6']);
      bikeBox(v, true, px, y, z + 0.55, col, -1);
    }
  }
}
/** Market stall (haring / friet / bloemen). Front faces +z if face = 1, −z if −1. */
export function stall(g, v, x, z, label, colors, y = 0.15, face = 1) {
  const [a, b] = colors;
  v.box(x, y, z, 2.6, 1.0, 1.3, '#f1e9d8');
  v.box(x, y + 1.0, z, 2.7, 0.1, 1.4, '#8d6e4c');
  for (const sx of [-1.2, 1.2]) for (const sz of [-0.55, 0.55]) v.box(x + sx, y + 1.1, z + sz, 0.1, 1.3, 0.1, '#eeeeee');
  for (let i = 0; i < 7; i++) v.box(x - 1.26 + i * 0.42, y + 2.4, z, 0.42, 0.14, 1.9, i % 2 ? a : b);
  for (let i = 0; i < 7; i++) v.box(x - 1.26 + i * 0.42, y + 2.25, z + face * 0.95, 0.42, 0.16, 0.08, i % 2 ? b : a);
  for (let i = 0; i < 4; i++) v.box(x - 0.9 + i * 0.6, y + 1.1, z + face * 0.2, 0.36, 0.14, 0.5, i % 2 ? '#c9d6df' : '#ffd166');
  const s = makeSign(label, 0.4, { bg: a, fg: '#ffffff' });
  s.position.set(x, y + 2.75, z + face * 1.0);
  if (face < 0) s.rotation.y = Math.PI;
  g.add(s);
}
export function terrace(v, x, z, rnd, y = 0.15) {
  const col = rnd.pick(['#e63946', '#ffb703', '#2a9d8f', '#ffffff']);
  v.box(x, y, z, 0.12, 0.7, 0.12, '#666');
  v.box(x, y + 0.7, z, 0.9, 0.08, 0.9, '#d9c7a3');
  for (const [dx, dz] of [[-0.8, 0], [0.8, 0]]) {
    v.box(x + dx, y, z + dz, 0.42, 0.42, 0.42, '#7a5234');
    v.box(x + dx * 1.22, y + 0.42, z + dz, 0.08, 0.5, 0.42, '#7a5234');
  }
  v.box(x, y + 0.78, z, 0.08, 1.7, 0.08, '#ddd');
  v.box(x, y + 2.3, z, 2.2, 0.12, 2.2, col);
  v.box(x, y + 2.42, z, 1.2, 0.12, 1.2, shade(col, 0.9));
}
export function tramStop(v, gl, x, z, night, y = 0.15) {
  v.box(x, y + 2.3, z, 3.4, 0.12, 1.2, '#c8102e');
  for (const sx of [-1.6, 1.6]) v.box(x + sx, y, z - 0.5, 0.12, 2.3, 0.12, '#555');
  v.box(x, y + 0.3, z - 0.55, 3.2, 1.7, 0.06, '#bfe3f2');
  v.box(x, y + 0.4, z - 0.2, 2.2, 0.1, 0.4, '#8d6e4c');
  (night ? gl : v).box(x + 1.3, y + 1.2, z - 0.5, 0.5, 0.8, 0.08, night ? '#fff1c1' : '#fafafa');
}
export function streetSign(g, v, x, z, text, y = 0.15) {
  v.box(x, y, z, 0.12, 2.8, 0.12, '#8d99a6');
  const s = makeSign(text, 0.5, { bg: '#1747b0', fg: '#ffffff', border: '#ffffff', pad: 8 });
  s.position.set(x, y + 2.75, z + 0.08);
  g.add(s);
  v.box(x, y + 2.47, z, s.userData.w + 0.1, 0.56, 0.08, '#12357f');
}

// ---------------------------------------------------------------- vehicles
const angd = (d) => Math.atan2(Math.sin(d), Math.cos(d));
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
/**
 * A vehicle on springs. Scripts only steer it (heading) and say how fast it goes (moving); from that the body
 * rolls out of a bend (two-wheelers lean into it), squats under power, dives under braking, and the wheels turn
 * and steer. `a.slip` says how hard it is cornering (tyre smoke and skid marks key off it), `a.drift` turns the
 * body against the direction of travel (a powerslide), `a.jolt()` knocks the suspension.
 */
function vehicleActor(g, extra = {}) {
  const a = {
    g, heading: 0, moving: 0, vel: 0, t: 0, alive: true, speed: 8, vehicle: true,
    roll: 0, pitch: 0, slip: 0, drift: 0, rideH: 0, _rv: 0, _pv: 0, _mv: 0, _spin: 0, _steer: 0,
    face(h) { this.heading = h; g.rotation.y = h; },
    /** Knock the suspension: pitch > 0 = nose down (a hard stop, a kerb), side > 0 = rocks to its left. */
    jolt(pitch = 0, side = 0) { this._pv += pitch * 5; this._rv += side * 5; },
    update(dt) {
      this.t += dt;
      const mv = this.moving;
      this.moving = 0; this.vel = mv;
      const turn = angd(this.heading - g.rotation.y) * Math.min(1, dt * (this.turnRate || 9));
      g.rotation.y += turn;
      const body = this.body;
      if (body && dt > 0 && !this.rigid) {
        const yawRate = turn / dt, acc = cl((mv - this._mv) / dt, -40, 40), two = this.two;
        this._mv = mv;
        const rollT = (two ? cl(-yawRate * mv * 0.05, -0.5, 0.5) : cl(yawRate * mv * 0.02, -0.26, 0.26)) + (this.lean || 0); // a.lean: a script leaning it by hand
        const pitchT = two ? cl(-acc * 0.012, -0.4, 0.08) : cl(-acc * 0.012, -0.085, 0.11);
        this._rv += ((rollT - this.roll) * 70 - this._rv * 7.5) * dt; this.roll += this._rv * dt;
        this._pv += ((pitchT - this.pitch) * 95 - this._pv * 8.5) * dt; this.pitch += this._pv * dt;
        this.slip = Math.abs(yawRate) * mv + Math.abs(this.drift) * mv * 2;
        if (two) { g.rotation.z = this.roll; body.rotation.x = Math.min(0.05, this.pitch); }
        else {
          body.rotation.z = this.roll; body.rotation.x = this.pitch;
          body.rotation.y += (this.drift - body.rotation.y) * Math.min(1, dt * 8);
        }
        body.position.y = this.rideH + (mv > 0 ? Math.abs(Math.sin(this.t * 16)) * 0.03 : 0) + Math.abs(this.roll) * 0.25;
        if (this.wheels) {
          this._spin += (mv * dt) / this.wheelR;
          const st = cl(angd(this.heading - g.rotation.y) * 2.5 + yawRate * 0.22 - this.drift * 1.2, -0.6, 0.6);
          this._steer += (st - this._steer) * Math.min(1, dt * 12);
          for (const w of this.wheels) { w.userData.spin.rotation.x = this._spin; if (w.userData.front) w.rotation.y = this._steer; }
        }
      }
      if (this.tick) this.tick(dt, mv);
    },
    ...extra,
  };
  return a;
}

/** A wheel that visibly turns: two crossed blocks make an eight-sided tyre, with a hub cap and one bright spoke. */
function makeWheel(r, w, side) {
  const g = new THREE.Group(), spin = new THREE.Group();
  const s = r * 1.84;
  const t1 = sculpt((v) => v.box(0, -s / 2, 0, w, s, s, '#1a1a1a'));
  const t2 = sculpt((v) => v.box(0, -s / 2, 0, w, s, s, '#1a1a1a'));
  t2.rotation.x = Math.PI / 4;
  const hub = sculpt((v) => {
    v.box(side * (w / 2 + 0.005), -r * 0.5, 0, 0.02, r, r, '#c9d1d6');
    v.box(side * (w / 2 + 0.012), -r * 0.12, 0, 0.02, r * 0.24, r * 1.5, '#7d868c');
    v.box(side * (w / 2 + 0.012), -r * 0.75, 0, 0.02, r * 1.5, r * 0.24, '#7d868c');
  });
  spin.add(t1, t2, hub);
  g.add(spin);
  g.userData.spin = spin;
  return g;
}

const CARCOLS = ['#e63946', '#f4a261', '#2a9d8f', '#3a86ff', '#ffd166', '#8338ec', '#f1faee', '#ff70a6', '#06d6a0', '#577590'];
/**
 * type: car | police | van | taxi. Forward +z. The van's back doors open (`a.doors` 0..1); `a.hazard` blinks the
 * indicators; `a.exhaust` is where the smoke comes out (local to the car).
 */
export function makeCar(rnd, type = 'car', night = false) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const col = type === 'police' ? '#f8f9fa' : type === 'van' ? '#30343f' : type === 'taxi' ? '#ffd60a' : rnd.pick(CARCOLS);
  const van = type === 'van', dark = shade(col, 0.72);
  // modelled at the old small size, then body is scaled up to a real car (4.4 x 1.85 x 1.5; van 5.2 x 2.0 x 2.2)
  const L = van ? 3.9 : 3.3, W = 1.6;
  const SX = van ? 2.0 / W : 1.85 / W, SY = van ? 2.2 / 1.78 : 1.5 / 1.33, SZ = van ? 5.2 / L : 4.4 / L;
  body.scale.set(SX, SY, SZ);
  const solid = new Vox(3), gl = new Vox(4);
  solid.box(0, 0.28, 0, W, van ? 0.75 : 0.55, L, col);
  solid.box(0, 0.2, 0, W - 0.16, 0.1, L - 0.3, '#15171c'); // floor pan
  if (van) {
    solid.box(0, 1.03, -0.3, W - 0.06, 0.75, L - 0.9, col);
    solid.box(0, 1.1, L / 2 - 0.5, W - 0.2, 0.5, 0.08, '#9fd4ee');
    solid.box(0, 1.78, -0.3, W - 0.3, 0.05, L - 1.3, dark); // roof ribs
    solid.box(W / 2 - 0.02, 1.1, L / 2 - 0.95, 0.03, 0.42, 0.7, '#9fd4ee'); solid.box(-W / 2 + 0.02, 1.1, L / 2 - 0.95, 0.03, 0.42, 0.7, '#9fd4ee'); // cab windows
    solid.box(0, 0.42, -L / 2 + 0.12, W - 0.2, 1.3, 0.04, '#0e0f13'); // the dark of the load space behind the doors
  } else {
    solid.box(0, 0.83, -0.2, W - 0.14, 0.5, 1.7, col);
    solid.box(0, 0.88, 0.67, W - 0.3, 0.38, 0.04, '#9fd4ee');
    solid.box(0, 0.88, -1.07, W - 0.3, 0.38, 0.04, '#9fd4ee');
    solid.box(W / 2 - 0.07, 0.88, -0.2, 0.04, 0.36, 1.4, '#9fd4ee');
    solid.box(-W / 2 + 0.07, 0.88, -0.2, 0.04, 0.36, 1.4, '#9fd4ee');
    for (const sx of [-1, 1]) solid.box(sx * (W / 2 - 0.065), 0.86, -0.2, 0.05, 0.42, 0.08, col); // door pillar
  }
  for (const sx of [-1, 1]) {
    solid.box(sx * (W / 2 + 0.07), 0.84, van ? L / 2 - 0.62 : 0.52, 0.14, 0.1, 0.1, dark); // mirrors
    solid.box(sx * (W / 2 + 0.004), 0.34, van ? 0.75 : -0.2, 0.012, van ? 0.62 : 0.45, 0.025, dark); // door seam
    solid.box(sx * (W / 2 + 0.012), 0.66, van ? 0.55 : -0.34, 0.02, 0.04, 0.12, '#d9dee2'); // door handle
    for (const sz of [-1, 1]) solid.box(sx * (W / 2 - 0.1), 0.2, sz * (L / 2 - 0.7), 0.22, 0.42, 0.78, '#121316'); // wheel arch
  }
  if (type === 'police') {
    // Dutch striping: blue + orange-red slashes
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
      solid.box(sx * (W / 2 + 0.005), 0.42, -1.1 + i * 0.62, 0.03, 0.3, 0.26, i % 2 ? '#0057b8' : '#ff5a1f');
    }
    solid.box(0, 0.84, L / 2 - 0.3, W - 0.3, 0.02, 0.5, '#0057b8');
    solid.box(0, 1.33, -0.2, 1.0, 0.1, 0.3, '#333');
  }
  if (type === 'taxi') solid.box(0, 1.33, -0.2, 0.5, 0.18, 0.24, '#111');
  // bumpers, grille, Dutch yellow plates, exhaust
  solid.box(0, 0.26, L / 2 + 0.02, W + 0.02, 0.16, 0.1, '#33363d');
  solid.box(0, 0.26, -L / 2 - 0.02, W + 0.02, 0.16, 0.1, '#33363d');
  solid.box(0, 0.46, L / 2 + 0.005, 0.66, 0.1, 0.03, '#1d1f24');
  solid.box(0, 0.29, L / 2 + 0.075, 0.42, 0.09, 0.012, '#ffd200');
  solid.box(0, 0.29, -L / 2 - 0.075, 0.42, 0.09, 0.012, '#ffd200');
  solid.box(-0.45, 0.2, -L / 2 - 0.06, 0.08, 0.07, 0.14, '#7d868c');
  (night ? gl : solid).box(-0.5, 0.5, L / 2 + 0.01, 0.3, 0.16, 0.04, night ? '#fff6c9' : '#fff3b0');
  (night ? gl : solid).box(0.5, 0.5, L / 2 + 0.01, 0.3, 0.16, 0.04, night ? '#fff6c9' : '#fff3b0');
  gl.box(-0.5, 0.5, -L / 2 - 0.01, 0.3, 0.14, 0.04, '#ff2d2d');
  gl.box(0.5, 0.5, -L / 2 - 0.01, 0.3, 0.14, 0.04, '#ff2d2d');
  body.add(solid.mesh());
  body.add(gl.mesh(MAT.glow));
  // indicators (all four blink with a.hazard)
  const blink = sculpt((v) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) v.box(sx * (W / 2 - 0.08), 0.5, sz * (L / 2 + 0.012), 0.1, 0.14, 0.04, '#ffae00'); }, MAT.glow);
  blink.visible = false;
  body.add(blink);
  // wheels: outside the sprung body, so the body rolls and dives over them
  const wr = van ? 0.36 : 0.32, wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = makeWheel(wr, 0.24, sx);
    w.position.set(sx * (W / 2 - 0.1) * SX, wr, sz * (L / 2 - 0.7) * SZ);
    w.userData.front = sz > 0;
    g.add(w);
    wheels.push(w);
  }
  const a = vehicleActor(g, {
    body, type, len: L * SZ, wid: W * SX, hgt: van ? 2.2 : 1.5, wheels, wheelR: wr,
    exhaust: { x: -0.45 * SX, y: 0.3, z: (-L / 2 - 0.1) * SZ }, hazard: false, doors: 0,
  });
  let doorK = 0, leaves = null;
  if (van) {
    // two back doors on hinges at the corners
    leaves = [-1, 1].map((sx) => {
      const h = new THREE.Group();
      h.position.set(sx * (W / 2 - 0.03), 0.42, -L / 2);
      h.add(sculpt((v) => {
        v.box(-sx * 0.385, 0, -0.02, 0.77, 1.32, 0.05, col);
        v.box(-sx * 0.385, 0.72, -0.05, 0.5, 0.4, 0.02, '#9fd4ee');
        v.box(-sx * 0.7, 0.55, -0.055, 0.05, 0.16, 0.03, '#d9dee2');
      }));
      body.add(h);
      return [h, sx];
    });
  }
  let red = null, blue = null, light = null;
  if (type === 'police') {
    red = sculpt((v) => v.box(-0.3, 1.43, -0.2, 0.36, 0.16, 0.26, '#ff2d2d'), MAT.glow);
    blue = sculpt((v) => v.box(0.3, 1.43, -0.2, 0.36, 0.16, 0.26, '#2d7bff'), MAT.glow);
    body.add(red, blue);
    light = new THREE.PointLight('#3b82ff', 0, 14, 1.6);
    light.position.set(0, 2.4, 0);
    g.add(light);
    a.siren = false;
  }
  a.tick = function (dt) {
    blink.visible = this.hazard && Math.floor(this.t * 2.6) % 2 === 0;
    if (leaves) {
      doorK += (cl(this.doors, 0, 1) - doorK) * Math.min(1, dt * 9);
      for (const [h, sx] of leaves) h.rotation.y = -sx * doorK * 1.9;
    }
    if (red) {
      const on = this.siren, f = Math.floor(this.t * 7) % 2;
      red.visible = !on || f === 0;
      blue.visible = !on || f === 1;
      light.intensity = on ? 40 : 0;
      light.color.set(f ? '#3b82ff' : '#ff3b3b');
    }
  };
  return a;
}

/** HTM tram: red skirt, cream top. Forward +z. */
export function makeTram(night = false) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const v = new Vox(5), gl = new Vox(6);
  const seg = 5.2, n = 5, W = 2.4; // 5 segments, about 27.5 m long, 2.4 m wide, 3.3 m high
  const win = night ? '#ffe9a8' : '#3b5b7a';
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * (seg + 0.3);
    v.box(0, 0.3, z, W, 1.0, seg, '#c8102e');
    v.box(0, 1.3, z, W, 1.8, seg, '#f3ecd9');
    v.box(0, 3.1, z, W - 0.2, 0.2, seg - 0.2, '#8d99a6');
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 4; k++) (night ? gl : v).box(sx * (W / 2 + 0.005), 1.65, z - seg / 2 + 0.7 + k * 1.2, 0.03, 1.0, 0.9, win);
      v.box(sx * (W / 2 + 0.005), 0.4, z, 0.03, 2.2, 0.8, '#f3ecd9'); // door
    }
    v.box(0, 0.05, z - 1.6, W - 0.4, 0.4, 1.0, '#222');
    v.box(0, 0.05, z + 1.6, W - 0.4, 0.4, 1.0, '#222');
    if (i < n - 1) v.box(0, 0.4, z + seg / 2 + 0.15, W - 0.6, 2.3, 0.3, '#333');
  }
  const front = ((n - 1) / 2) * (seg + 0.3) + seg / 2;
  (night ? gl : v).box(0, 1.65, front + 0.01, W - 0.5, 1.0, 0.04, win);
  (night ? gl : v).box(0, 1.65, -front - 0.01, W - 0.5, 1.0, 0.04, win);
  gl.box(-0.75, 0.7, front + 0.02, 0.3, 0.2, 0.04, '#fff6c9');
  gl.box(0.75, 0.7, front + 0.02, 0.3, 0.2, 0.04, '#fff6c9');
  v.box(0, 3.3, 0, 0.12, 0.8, 1.6, '#444'); // pantograph
  v.box(0, 4.1, 0, 1.4, 0.06, 0.1, '#444');
  body.add(v.mesh(), gl.mesh(MAT.glow));
  const s = makeSign('HTM', 0.4, { bg: '#111', fg: '#ffb703', pad: 4 });
  s.position.set(0, 2.8, front + 0.03);
  body.add(s);
  return vehicleActor(g, { body, type: 'tram', len: n * (seg + 0.3), wid: W, hgt: 3.3, rigid: true });
}

/** Bicycle group (forward +z); rider optional. */
export function makeBike(rnd, rider = null, col = null) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  col = col || rnd.pick(['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#111111', '#ff70a6', '#8ecae6']);
  body.add(sculpt((v) => {
    v.box(0, 0, -0.5, 0.08, 0.56, 0.56, '#1f1f1f');
    v.box(0, 0, 0.5, 0.08, 0.56, 0.56, '#1f1f1f');
    v.box(0, 0.3, 0, 0.08, 0.1, 0.9, col);
    v.box(0, 0.36, -0.25, 0.08, 0.46, 0.08, col);
    v.box(0, 0.8, -0.25, 0.16, 0.08, 0.3, '#2b2b2b');
    v.box(0, 0.36, 0.4, 0.08, 0.62, 0.08, col);
    v.box(0, 0.96, 0.4, 0.5, 0.07, 0.07, '#2b2b2b');
    v.box(0, 0.62, 0.62, 0.3, 0.2, 0.26, '#8d6e4c'); // crate
  }));
  body.scale.setScalar(BK); // 1.86 m long, 0.67 m wheels, handlebar at 1.14 m; saddle top 1.05 m at z = -0.30
  const a = vehicleActor(g, { body, type: 'bike', len: 1.86, two: true });
  if (rider) {
    // rider hip (model y 0.7 * 0.9 = 0.63 m, minus 0.045 m ride bob) rests 0.05 m above the saddle top
    rider.g.position.set(0, 0.52, -0.28);
    rider.g.rotation.y = 0;
    rider.pose = 'ride';
    rider.heading = 0;
    g.add(rider.g);
    a.rider = rider;
    a.tick = (dt) => rider.update(dt);
  }
  return a;
}

export function makeScooter(rnd, riders = []) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const col = rnd.pick(['#ffd60a', '#ef476f', '#118ab2', '#f8f9fa', '#06d6a0']);
  body.add(sculpt((v) => {
    v.box(0, 0, -0.6, 0.18, 0.46, 0.46, '#1f1f1f');
    v.box(0, 0, 0.6, 0.18, 0.46, 0.46, '#1f1f1f');
    v.box(0, 0.3, -0.25, 0.44, 0.4, 1.0, col);
    v.box(0, 0.7, -0.35, 0.4, 0.12, 0.8, '#222');
    v.box(0, 0.3, 0.45, 0.4, 0.8, 0.14, col);
    v.box(0, 1.1, 0.45, 0.7, 0.08, 0.08, '#222');
  }));
  body.add(sculpt((v) => v.box(0, 0.8, 0.53, 0.2, 0.14, 0.04, '#fff6c9'), MAT.glow));
  body.scale.setScalar(1.15); // 1.9 m long, seat top 0.94 m at z = -0.40
  const a = vehicleActor(g, { body, type: 'scooter', len: 1.9, two: true });
  riders.forEach((r, i) => {
    // seated hip = 0.25 m above the origin (sit pose); put it 0.05 m below the seat top (the seat box is thick)
    r.g.position.set(0, 0.64, -0.35 - i * 0.5);
    r.g.rotation.y = 0;
    r.heading = 0;
    r.pose = 'sit';
    g.add(r.g);
  });
  a.riders = riders;
  a.tick = (dt) => riders.forEach((r) => r.update(dt));
  return a;
}

/** An octagon-ish disc facing +z (three overlapping boxes), centred at (cx, cy, cz). */
function disc(v, cx, cy, cz, r, d, col) {
  v.box(cx, cy - r * 0.5, cz, r * 1.85, r * 1.0, d, col);
  v.box(cx, cy - r * 0.92, cz, r * 1.0, r * 1.85, d, col);
  v.box(cx, cy - r * 0.75, cz, r * 1.5, r * 1.5, d, col);
}

/**
 * Electric fat-bike, forward +z, about 1.75 m long. 20 x 4 inch tyres (0.71 m across, 0.12 m wide), a long flat bench
 * for two, upright bars, a big round headlight. Same conventions as makeScooter: riders passed in sit on it as part of
 * the vehicle (`a.riders`, [0] drives, [1] is the passenger holding on), the wheels turn and the front one steers with
 * the bars. For a rider that is a separate actor use `mount(bike, rider)` (it reads `a.seatY`).
 */
export function makeFatbike(rnd, riders = []) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const main = rnd.chance(0.8) ? '#1c1d20' : rnd.pick(['#2b3a55', '#3b3f32', '#4a2b2b']);
  const acc = rnd.pick(['#e63946', '#ffd60a', '#06d6a0', '#3a86ff', '#ff7b00']);
  const R = 0.355, TW = 0.12, WZ = 0.52; // tyre radius (20" rim + 4" tyre), tyre width, axle offset from the middle
  const SEAT = 0.86, HEAD = WZ - 0.13; // seat top; z of the steering axis
  body.add(piece((v, gl) => {
    // seat: one long flat bench, kicked up at the back, with a grab bar for the passenger
    v.box(0, 0.76, -0.27, 0.38, 0.1, 0.94, '#17181a', 0.02);
    v.box(0, 0.752, -0.27, 0.4, 0.016, 0.96, acc);
    v.box(0, SEAT, -0.74, 0.38, 0.05, 0.1, '#17181a');
    for (const sx of [-1, 1]) v.box(sx * 0.15, 0.78, -0.82, 0.03, 0.16, 0.03, main);
    v.box(0, 0.93, -0.82, 0.33, 0.03, 0.04, main);
    // battery tower under the seat, with an accent panel each side
    v.box(0, 0.3, -0.12, 0.16, 0.46, 0.4, main, 0.02);
    for (const sx of [-1, 1]) v.box(sx * 0.085, 0.38, -0.12, 0.012, 0.28, 0.3, acc);
    // rear: fender, stays and drop-outs either side of the fat tyre
    v.box(0, 0.715, -WZ, 0.17, 0.03, 0.56, main);
    for (const sx of [-1, 1]) {
      v.box(sx * 0.09, 0.28, -WZ - 0.02, 0.04, 0.46, 0.1, main);
      v.box(sx * 0.09, 0.3, -0.4, 0.04, 0.07, 0.34, main);
      v.box(sx * 0.1, 0.295, -WZ, 0.05, 0.12, 0.12, '#8a9199'); // hub motor caps
    }
    gl.box(0, 0.66, -WZ - 0.3, 0.14, 0.06, 0.03, '#ff2d2d'); // tail light
    // front: a chunky nose from the seat over the front tyre to the head tube; footplates either side of the front tyre,
    // pegs for the passenger either side of the rear one
    v.box(0, 0.74, 0.29, 0.1, 0.1, 0.2, main);
    v.box(0, 0.76, HEAD, 0.11, 0.22, 0.11, main);
    v.box(0, 0.86, HEAD, 0.115, 0.04, 0.115, acc);
    for (const sx of [-1, 1]) {
      v.box(sx * 0.2, 0.12, 0.18, 0.22, 0.05, 0.42, main);
      v.box(sx * 0.31, 0.12, 0.18, 0.02, 0.07, 0.42, acc);
      v.box(sx * 0.24, 0.12, -0.3, 0.2, 0.05, 0.4, main);
    }
  }));
  // wheels: outside the sprung body (they turn with the speed); the front one hangs from the steering axis and carries the fork, bars and headlight
  const mkWheel = () => {
    const w = makeWheel(R, TW, 1);
    w.userData.spin.add(sculpt((v) => { // the hub cap on the other side too
      v.box(-(TW / 2 + 0.005), -R * 0.5, 0, 0.02, R, R, '#c9d1d6');
      v.box(-(TW / 2 + 0.012), -R * 0.12, 0, 0.02, R * 0.24, R * 1.5, '#7d868c');
      v.box(-(TW / 2 + 0.012), -R * 0.75, 0, 0.02, R * 1.5, R * 0.24, '#7d868c');
    }));
    return w;
  };
  const rear = mkWheel();
  rear.position.set(0, R, -WZ);
  const wheelF = mkWheel(), fr = new THREE.Group();
  fr.position.set(0, R, HEAD);
  wheelF.position.z = 0.13; // the wheel centre is ahead of the steering axis
  fr.userData = { spin: wheelF.userData.spin, front: true };
  fr.add(wheelF);
  wheelF.add(piece((v, gl) => { // (origin: the front wheel centre)
    for (const sx of [-1, 1]) v.box(sx * 0.1, 0, 0, 0.05, 0.34, 0.06, main); // fork blades
    v.box(0, 0.3, -0.1, 0.26, 0.05, 0.14, main); // crown
    v.box(0, 0.37, 0, 0.17, 0.03, 0.34, main); // fender
    v.box(0, 0.3, -0.13, 0.07, 0.66, 0.07, main); // steering column (turns inside the static head tube)
    v.box(0, 0.92, -0.13, 0.62, 0.04, 0.04, main); // upright bars, swept back at the grips
    for (const sx of [-1, 1]) {
      v.box(sx * 0.3, 0.88, -0.22, 0.05, 0.05, 0.2, '#101113');
      v.box(sx * 0.3, 0.92, -0.17, 0.04, 0.04, 0.1, main);
    }
    v.box(0, 0.96, -0.13, 0.12, 0.04, 0.08, acc); // bar-top display
    // the big round headlight: bezel, and a glowing lens in front of it
    disc(v, 0, 0.62, -0.04, 0.16, 0.12, '#25272b');
    disc(gl, 0, 0.62, 0.03, 0.135, 0.03, '#fff6c9');
  }));
  g.add(rear, fr);
  const SIT = 0.285; // sit pose: the hip is this far up the person (times its scale) above its origin
  const a = vehicleActor(g, {
    body, type: 'fatbike', len: 1.75, two: true, wheels: [rear, fr], wheelR: R,
    // for mount() / rideTo() with a separate rider in the 'ride' pose (hip 0.585 up the person), and where it sits
    seatY: SEAT - 0.05 - 0.585 * 0.9, seatBack: 0.16, seatTop: SEAT,
  });
  riders.forEach((r, i) => {
    r.g.position.set(0, SEAT - 0.05 - SIT * r.scale, -0.16 - i * 0.48);
    r.g.rotation.y = 0;
    r.heading = 0;
    r.pose = 'sit';
    r.arms = 'drive';
    g.add(r.g);
  });
  a.riders = riders;
  a.tick = (dt) => riders.forEach((r) => r.update(dt));
  return a;
}

export function makeHeli() {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  body.add(sculpt((v) => {
    v.box(0, 0.3, 0.2, 1.5, 1.3, 2.4, '#f8f9fa');
    v.box(0, 0.5, 1.2, 1.3, 0.8, 0.5, '#59b8e6');
    v.box(0, 0.75, -1.9, 0.36, 0.4, 2.2, '#f8f9fa');
    v.box(0, 0.7, -3.0, 0.1, 1.0, 0.5, '#0057b8');
    v.box(0, 0.55, 0.2, 1.54, 0.3, 2.42, '#0057b8');
    v.box(0, 0.86, 0.2, 1.55, 0.12, 2.43, '#ff5a1f');
    for (const sx of [-1, 1]) { v.box(sx * 0.6, 0, 0.2, 0.1, 0.1, 2.4, '#333'); v.box(sx * 0.6, 0.1, 0.8, 0.08, 0.2, 0.08, '#333'); v.box(sx * 0.6, 0.1, -0.4, 0.08, 0.2, 0.08, '#333'); }
    v.box(0, 1.6, 0.2, 0.2, 0.3, 0.2, '#333');
  }));
  const rotor = sculpt((v) => { v.box(0, 0, 0, 6.4, 0.06, 0.34, '#2b2b2b'); v.box(0, 0, 0, 0.34, 0.06, 6.4, '#2b2b2b'); });
  rotor.position.y = 1.9;
  rotor.castShadow = false;
  body.add(rotor);
  body.scale.setScalar(1.4); // cabin tall enough for a 2 m person
  const tailRotor = sculpt((v) => v.box(0, -0.5, 0, 0.04, 1.0, 0.14, '#2b2b2b'));
  tailRotor.position.set(0.12, 1.2, -3.0);
  body.add(tailRotor);
  // fake searchlight: cone + ground disc
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 1, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: '#fff6c9', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
  );
  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 24),
    new THREE.MeshBasicMaterial({ color: '#fff6c9', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  spot.rotation.x = -Math.PI / 2;
  g.add(beam, spot);
  const blink = sculpt((v) => v.box(0, 0.2, -0.6, 0.2, 0.14, 0.2, '#ff2d2d'), MAT.glow);
  body.add(blink);
  const a = vehicleActor(g, { body, type: 'heli', aim: new THREE.Vector3(), rigid: true });
  a.tick = function (dt) {
    rotor.rotation.y += dt * 30;
    tailRotor.rotation.x += dt * 40;
    body.position.y = Math.sin(this.t * 2) * 0.25;
    body.rotation.z = Math.sin(this.t * 1.3) * 0.06;
    blink.visible = Math.floor(this.t * 3) % 2 === 0;
    // beam from heli to aim point on the ground (world space → local)
    const h = g.position.y;
    const lx = this.aim.x - g.position.x, lz = this.aim.z - g.position.z;
    const c = Math.cos(-g.rotation.y), s = Math.sin(-g.rotation.y);
    const ax = lx * c + lz * s, az = -lx * s + lz * c;
    spot.position.set(ax, -h + 0.22, az);
    beam.position.set(ax / 2, -h / 2, az / 2);
    const len = Math.hypot(ax, h, az);
    beam.scale.set(1, len, 1);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-ax, h, -az).normalize());
  };
  return a;
}

export function makeBoat(rnd) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const col = rnd.pick(['#f8f9fa', '#e63946', '#1d3557', '#2a9d8f', '#ffb703']);
  body.add(sculpt((v) => {
    v.box(0, 0, 0, 1.3, 0.5, 3.0, col);
    v.box(0, 0.1, 1.7, 0.9, 0.4, 0.5, col);
    v.box(0, 0.5, 0, 1.4, 0.08, 3.1, '#8d6e4c');
    v.box(0, 0.3, 0, 1.0, 0.24, 2.4, '#d9c7a3');
    v.box(0, 0.5, -1.3, 0.3, 0.5, 0.3, '#444');
  }));
  body.scale.setScalar(1.4); // 4.2 x 1.8 m
  const skipper = makePerson(rnd, { scale: 1.25 / 1.4 }); // body is scaled 1.4
  skipper.pose = 'sit';
  skipper.g.position.set(0, 0.5, -0.6);
  body.add(skipper.g);
  const a = vehicleActor(g, { body, type: 'boat', rigid: true });
  a.tick = function (dt) {
    skipper.update(dt);
    body.position.y = Math.sin(this.t * 2.4) * 0.05;
    body.rotation.z = Math.sin(this.t * 1.7) * 0.04;
  };
  return a;
}

export { piece };
