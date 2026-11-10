// Generates a voxel street diorama from a street's real-world traits.
import * as THREE from 'three';
import { Vox, MAT, piece, makeSign, clamp } from './kit.js';
import * as P from './props.js';
import { makeBird } from './cast.js';

const X0 = -24, X1 = 24, LEN = X1 - X0;
const SHOPS = ['BAKKER', 'KAAS', 'BLOEM', 'FIETS', 'SUPER', 'KAPPER', 'BOEK', 'TOKO', 'SLAGER', 'DROP', 'VIS', 'KIOSK'];
const BARS = ['CAFE', 'KROEG', 'BAR', 'BIER'];
const FOOD = ['FRIET', 'PIZZA', 'SNACK', 'KEBAB', 'ROTI', 'SUSHI'];

export function buildStreet(st, rnd, night) {
  const pieces = [];
  const add = (obj, x = 0, kind = 'prop') => { pieces.push({ obj, x, kind }); return obj; };

  const cls = st.cls || 'residential';
  const tram = !!st.tram;
  let kind = cls === 'pedestrian' ? 'ped' : (['trunk', 'primary', 'secondary', 'tertiary'].includes(cls) || st.lanes >= 2) ? 'major' : 'minor';
  if (tram && kind === 'minor') kind = 'major';
  let hw = kind === 'major' ? 3.3 : kind === 'minor' ? 2.6 : 3.6;
  if (tram && kind === 'major') hw = 5.2;
  const bw = kind !== 'ped' && (st.bike || kind === 'major') ? 1.2 : 0;
  const sw = 3.6;
  const zH = -hw - bw - sw; // house fronts
  const s0 = hw + bw + sw;  // front strip starts
  const per100 = (n) => (n || 0) / Math.max(0.6, (st.len || 200) / 100);
  const busy = per100((st.shops || 0) + (st.food || 0) + (st.bars || 0));
  const strip = st.beach ? 'beach' : st.water ? 'canal' : st.park ? 'park' : (kind === 'ped' || busy > 2.2 || per100(st.bars) > 0.6) ? 'plaza' : 'yard';
  const stripW = { beach: 9.5, canal: 7, park: 6.5, plaza: 5.5, yard: 4.6 }[strip];
  const zF = s0 + stripW, zB = zH - 6.2;
  const depth = zF - zB, zc = (zF + zB) / 2;
  const Y = 0.15;

  const L = {
    x0: X0, x1: X1, kind, hw, bw, zH, s0, zF, zB, zc, depth, strip, tram, night,
    walkB: [zH + 1.7, zH + 2.3], walkF: [hw + bw + 1.6, hw + bw + 2.4],
    bikeB: bw ? -(hw + bw / 2) : -(hw - 0.55), bikeF: bw ? hw + bw / 2 : hw - 0.55,
    laneB: null, laneF: null, tramB: tram ? -1.0 : null, tramF: tram ? 1.0 : null,
    chaseZ: 0,
    yAt: (z) => (Math.abs(z) > hw + bw - 0.05 ? Y : 0),
    houses: [], shops: [], racks: [], benches: [], bins: [], parked: [], lamps: [], stalls: [], chimneys: [],
    atm: null, box: null, canal: null, sea: null,
  };
  if (kind === 'major') { L.laneB = tram ? -3.6 : -hw / 2; L.laneF = tram ? 3.6 : hw / 2; L.chaseZ = tram ? 3.6 : 0; }
  if (kind === 'minor') { L.laneB = L.laneF = -1.05; L.chaseZ = -1.05; L.bikeB = -2.25; L.bikeF = 0.35; }

  // ------------------------------------------------------------ ground
  const canal = strip === 'canal' ? { z0: s0 + 0.5, z1: zF - 1.6 } : null;
  add(piece((v) => {
    const slab = (z0, z1, top, col, h = 0.5) => v.box(0, top - h, (z0 + z1) / 2, LEN, h, z1 - z0, col);
    // island body
    const dirt = '#8a6642';
    if (canal) {
      slab(zB, canal.z0, -0.1, dirt, 1.3); slab(canal.z1, zF, -0.1, dirt, 1.3);
      slab(canal.z0, canal.z1, -1.2, '#5d6b5a', 0.2);
      v.box(0, -1.2, canal.z0 + 0.1, LEN, 1.3, 0.2, '#9a7b6b'); v.box(0, -1.2, canal.z1 - 0.1, LEN, 1.3, 0.2, '#9a7b6b');
    } else slab(zB, zF, -0.1, dirt, 1.3);
    v.box(0, -2.3, zc, LEN - 1.2, 0.9, depth - 1.2, '#75553a');
    v.box(0, -3.2, zc, LEN - 3.4, 0.9, depth - 3.2, '#634833');
    v.box(0, -3.9, zc, LEN - 8, 0.7, depth - 6.5, '#553e2c');
    for (let i = 0; i < 9; i++) v.box(rnd.range(X0 + 3, X1 - 3), -4.2 - rnd.range(0, 0.8), zc + rnd.range(-depth / 3, depth / 3), rnd.range(1, 3), rnd.range(0.6, 1.4), rnd.range(1, 3), '#4b3728');

    // backyard grass
    v.box(0, -0.1, (zB + zH) / 2, LEN, 0.25, zH - zB, '#6fbf5f');
    // road surface
    if (kind === 'ped') {
      const ts = 1.6, cols = Math.ceil(LEN / ts), rows = Math.ceil((2 * (hw + sw)) / ts);
      const tw = (2 * (hw + sw)) / rows;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        v.box(X0 + ts * (i + 0.5), -0.1, zH + tw * (j + 0.5), ts, 0.25, tw, (i + j) % 2 ? '#e0c9a0' : '#d6bc8e', 0.03);
      }
    } else {
      const road = kind === 'minor' ? '#a8776a' : '#4b4f58';
      if (kind === 'minor') {
        for (let i = 0; i < 24; i++) v.box(X0 + 1 + i * 2, -0.1, 0, 2, 0.1, 2 * hw, i % 2 ? '#a8776a' : '#a27064', 0.03);
      } else v.box(0, -0.1, 0, LEN, 0.1, 2 * hw, road);
      if (bw) for (const s of [-1, 1]) v.box(0, -0.1, s * (hw + bw / 2), LEN, 0.12, bw, '#c9573f', 0.02);
      for (const s of [-1, 1]) {
        // curb + sidewalk tiles
        v.box(0, -0.1, s * (hw + bw + 0.1), LEN, 0.27, 0.2, '#cfc9bc');
        const ts = 1.4, cols = Math.ceil(LEN / ts);
        for (let i = 0; i < cols; i++) for (let j = 0; j < 2; j++) {
          const zz = s * (hw + bw + 0.2 + (sw - 0.2) * (j + 0.5) / 2);
          v.box(X0 + ts * (i + 0.5), -0.1, zz, ts, 0.25, (sw - 0.2) / 2, (i + j) % 2 ? '#b9bcc2' : '#aeb1b8', 0.03);
        }
      }
      if (tram) {
        v.box(0, 0, 0, LEN, 0.06, 4.0, '#77c66a', 0.02);
        v.box(0, 0, -2.05, LEN, 0.14, 0.14, '#cfc9bc'); v.box(0, 0, 2.05, LEN, 0.14, 0.14, '#cfc9bc');
      } else if (kind === 'major') {
        for (let x = X0 + 1.2; x < X1; x += 2.6) v.box(x, 0, 0, 1.1, 0.02, 0.14, '#f1f1f1');
      }
      // zebra crossing
      const zx = rnd.range(-9, 9);
      L.zebra = zx;
      for (let z = -hw + 0.45; z <= hw - 0.3; z += 0.9) {
        if (tram && Math.abs(z) < 2.2) continue;
        v.box(zx, 0, z, 2.2, 0.025, 0.45, '#f1f1f1');
      }
    }
    if (tram) {
      for (const tz of [-1, 1]) for (const r of [-0.45, 0.45]) v.box(0, kind === 'ped' ? 0.15 : 0.06, tz + r, LEN, 0.05, 0.1, '#c6ccd2');
    }
  }, rnd.int(1, 9999)), 0, 'ground');

  // ------------------------------------------------------------ back row of buildings
  const pShop = clamp(busy / 5, 0, 0.9) * (kind === 'ped' ? 1.25 : 1);
  const barShare = (st.bars || 0) / Math.max(1, (st.bars || 0) + (st.food || 0) + (st.shops || 0));
  const foodShare = (st.food || 0) / Math.max(1, (st.bars || 0) + (st.food || 0) + (st.shops || 0));
  let x = X0 + 0.6, idx = 0, bankPlaced = false;
  const wantBank = true;
  const usedNames = new Set();
  while (x < X1 - 0.6) {
    const towerish = st.tall && rnd.chance(0.55);
    let w = towerish ? rnd.range(7, 9) : rnd.range(4, 6);
    const left = X1 - 0.6 - x;
    if (left - w < 3.6) w = left;
    if (w > 9.5) w = left / 2;
    const cx = x + w / 2;
    let info, group;
    const yard = rnd.chance(0.5);
    group = piece((v, gl) => {
      if (towerish && w >= 6) {
        info = P.tower(v, gl, { x: cx, z: zH, w, rnd, night, floors: rnd.int(6, 11), depth: 5.4 });
      } else {
        let shop = null, signBg = null;
        const mid = Math.abs(cx) < 15;
        if (wantBank && !bankPlaced && mid && (idx >= 2) && w >= 4.4) { shop = 'BANK'; signBg = '#005eb8'; bankPlaced = true; }
        else if (rnd.chance(pShop)) {
          const r = rnd();
          const pool = r < barShare ? BARS : r < barShare + foodShare ? FOOD : SHOPS;
          shop = rnd.pick(pool);
          for (let k = 0; k < 6 && usedNames.has(shop); k++) shop = rnd.pick(pool);
          usedNames.add(shop);
        }
        info = P.house(v, gl, { x: cx, z: zH, w, rnd, night, floors: st.tall ? rnd.int(3, 5) : rnd.int(2, 4), shop, signBg, depth: 5 });
        if (shop === 'BANK') {
          const ax = cx - w / 2 + 0.9;
          P.atm(v, gl, ax, zH + 0.05, Y);
          L.atm = { x: ax, z: zH + 1.2 };
        }
      }
      // backyard bits
      if (yard) P.tree(v, cx + rnd.range(-1, 1), zH - 5.6, rnd, Y);
      else P.bush(v, cx + rnd.range(-1, 1), zH - 5.5, rnd, Y);
    }, rnd.int(1, 9999));
    if (info.sign) group.add(info.sign);
    info.idx = idx++;
    L.houses.push(info);
    if (info.shop) L.shops.push(info);
    if (info.chimney) L.chimneys.push(info.chimney);
    add(group, cx, 'house');
    x += w;
  }

  // ------------------------------------------------------------ sidewalks furniture
  const zCurbB = zH + sw - 0.45, zCurbF = hw + bw + 0.5, zWallB = zH + 0.55, zEdgeF = s0 - 0.4;
  // lamps
  for (const lx of [-19, -7, 5, 17]) {
    add(piece((v, gl) => { L.lamps.push(P.lamp(v, gl, lx, zCurbB, night, Y, 1)); }), lx);
    add(piece((v, gl) => { L.lamps.push(P.lamp(v, gl, lx + 6, zCurbF, night, Y, -1)); }), lx + 6);
  }
  // trees along the curb
  const nTrees = clamp(Math.round(per100(st.trees) * 1.3) + (st.park ? 2 : 0) + (kind === 'ped' ? 0 : 1), 0, 7);
  const autumn = false;
  for (let i = 0; i < nTrees; i++) {
    const tx = X0 + 3 + ((i + 0.5) * (LEN - 6)) / nTrees + rnd.range(-1.2, 1.2);
    const back = i % 2 === 0 && kind !== 'ped';
    if (Math.abs(tx - (L.zebra ?? 99)) < 2.2) continue;
    add(piece((v) => P.tree(v, tx, back ? zCurbB : zCurbF, rnd, Y, autumn), rnd.int(1, 999)), tx);
  }
  // bike rack(s) against the houses
  const rackX = [rnd.range(-16, -6), rnd.range(6, 16)];
  rackX.forEach((rx) => {
    const h = L.houses.find((hh) => Math.abs(hh.door.x - rx) < 1.2);
    if (h) rx += 2.2;
    add(piece((v) => P.bikeRack(v, rx, zWallB + 0.15, rnd, 4, Y), rnd.int(1, 999)), rx);
    L.racks.push({ x: rx, z: zWallB + 1.2 });
  });
  // bins, mailbox, benches
  for (const bx of [rnd.range(-21, -12), rnd.range(-3, 3), rnd.range(12, 21)]) {
    add(piece((v) => P.bin(v, bx, zCurbF + 0.1, Y)), bx);
    L.bins.push({ x: bx, z: zCurbF + 0.1 });
  }
  const mx = rnd.range(-20, 20);
  add(piece((v) => P.mailbox(v, mx, zCurbB + 0.1, Y)), mx);
  // benches against the house fronts, facing the street (and the camera)
  const clear = (bx) => !L.houses.some((hh) => Math.abs(hh.door.x - bx) < 1.7) && !L.racks.some((r) => Math.abs(r.x - bx) < 2.4) && !(L.atm && Math.abs(L.atm.x - bx) < 2);
  for (const [lo, hi] of [[-15, -3], [3, 15]]) {
    let bx = rnd.range(lo, hi);
    for (let k = 0; k < 14 && !clear(bx); k++) bx = rnd.range(lo, hi);
    add(piece((v) => P.bench(v, bx, zH + 0.45, Y)), bx);
    L.benches.push({ x: bx, z: zH + 0.45 });
  }
  // real street-name sign
  const signG = new THREE.Group();
  add(piece((v) => P.streetSign(signG, v, X0 + 2.6, zEdgeF + 0.2, (st.name || 'STRAAT').toUpperCase().slice(0, 26), Y)), X0 + 2.6).add(signG);
  // transformer box (graffiti magnet)
  const tbx = rnd.range(-10, 10);
  add(piece((v) => {
    v.box(tbx, Y, zCurbF, 2.0, 1.5, 0.7, '#7f9a8a');
    v.box(tbx, Y + 1.5, zCurbF, 2.1, 0.1, 0.8, '#647a6d');
    v.box(tbx + 0.5, Y + 0.2, zCurbF - 0.36, 0.7, 1.1, 0.03, '#6c8576');
  }), tbx);
  L.box = { x: tbx, z: zCurbF + 0.35, y: Y, w: 2.0, h: 1.5 }; // z = the face the camera sees

  // tram stop
  if (tram) {
    const sx = rnd.range(-12, 12);
    add(piece((v, gl) => P.tramStop(v, gl, sx, zH + 3.3, night, Y)), sx);
  }
  // parked cars on small streets
  if (kind === 'minor') {
    let px = X0 + 3.5;
    while (px < X1 - 4) {
      if (rnd.chance(0.62) && Math.abs(px - L.zebra) > 3.2) {
        const car = P.makeCar(rnd, 'car', false);
        car.g.position.set(px, 0, hw - 0.95);
        car.g.rotation.y = Math.PI / 2;
        add(car.g, px);
        L.parked.push({ x: px, z: hw - 0.95 });
      }
      px += rnd.range(4.4, 6);
    }
  }
  // pedestrian street dressing
  if (kind === 'ped') {
    for (let i = 0; i < 4; i++) {
      const px = -18 + i * 12 + rnd.range(-1.5, 1.5), pz = tram ? rnd.pick([-2.6, 2.6]) : rnd.range(-1.2, 1.2);
      add(piece((v) => {
        v.box(px, Y, pz, 1.6, 0.5, 1.6, '#8d6e4c');
        P.tulips(v, px, pz, rnd, Y + 0.5, 7, 0.6);
        v.box(px, Y + 0.5, pz, 0.3, 0.9, 0.3, '#3f9a52');
      }, rnd.int(1, 999)), px);
    }
  }

  // ------------------------------------------------------------ front strip
  const zs = (t) => s0 + stripW * t;
  if (strip === 'canal') {
    L.canal = { z: (canal.z0 + canal.z1) / 2, y: -0.62, z0: canal.z0, z1: canal.z1 };
    const water = new Vox(11);
    water.box(0, -1.2, L.canal.z, LEN, 0.72, canal.z1 - canal.z0 - 0.3, '#3fa7d6');
    for (let i = 0; i < 16; i++) water.box(rnd.range(X0 + 2, X1 - 2), -0.49, L.canal.z + rnd.range(-1.8, 1.8), rnd.range(0.8, 2), 0.02, 0.16, '#8fd8f2');
    const wm = water.mesh(MAT.water, false, true);
    add(wm, 0, 'ground');
    add(piece((v) => {
      v.box(0, -0.1, s0 + 0.25, LEN, 0.3, 0.5, '#d8d2c4');
      v.box(0, -0.1, zF - 0.8, LEN, 0.25, 1.6, '#6fbf5f');
      v.box(0, -0.1, canal.z1 + 0.1, LEN, 0.3, 0.3, '#d8d2c4');
      for (let bx = X0 + 2; bx < X1; bx += 4) P.bollard(v, bx, s0 + 0.25, 0.2);
    }), 0, 'ground');
    for (let i = 0; i < 4; i++) { const tx = -18 + i * 12 + rnd.range(-2, 2); add(piece((v) => P.tree(v, tx, zF - 0.8, rnd, Y), rnd.int(1, 999)), tx); }
    // houseboat
    const hx = rnd.range(-14, 14);
    add(piece((v, gl) => {
      v.box(hx, -0.6, canal.z1 - 1.3, 5.2, 0.6, 1.8, '#3d405b');
      v.box(hx, 0, canal.z1 - 1.3, 4.4, 1.3, 1.5, rnd.pick(['#e9c46a', '#e76f51', '#8ecae6', '#f1faee']));
      v.box(hx, 1.3, canal.z1 - 1.3, 4.6, 0.12, 1.7, '#5c4033');
      for (let i = -1; i <= 1; i++) (night ? gl : v).box(hx + i * 1.3, 0.4, canal.z1 - 2.06, 0.7, 0.6, 0.04, night ? '#ffe9a8' : '#8fc7e8');
      P.tulips(v, hx, canal.z1 - 1.3, rnd, 1.42, 6, 1.6);
    }, rnd.int(1, 999)), hx);
  } else if (strip === 'beach') {
    const sand0 = s0, sand1 = s0 + 5.2;
    L.sea = { z0: sand1, z1: zF, y: 0.0 };
    add(piece((v) => {
      v.box(0, -0.1, (sand0 + sand1) / 2, LEN, 0.25, sand1 - sand0, '#f3dca4');
      for (let i = 0; i < 26; i++) v.box(rnd.range(X0 + 1, X1 - 1), 0.15, rnd.range(sand0 + 0.4, sand1 - 0.4), rnd.range(0.6, 1.8), 0.05, rnd.range(0.5, 1.2), '#ecd091');
      v.box(0, -0.1, sand1 + 0.3, LEN, 0.2, 0.7, '#e8cf93');
    }, rnd.int(1, 999)), 0, 'ground');
    const sea = new Vox(12);
    sea.box(0, -0.1, (sand1 + 0.3 + zF) / 2, LEN, 0.16, zF - sand1 - 0.3, '#38b6d8');
    for (let i = 0; i < 20; i++) sea.box(rnd.range(X0 + 2, X1 - 2), 0.06, rnd.range(sand1 + 1, zF - 0.5), rnd.range(1, 2.6), 0.03, 0.2, '#d9f5ff');
    add(sea.mesh(MAT.water, false, true), 0, 'ground');
    for (let i = 0; i < 5; i++) {
      const bx = -19 + i * 9.5 + rnd.range(-1.5, 1.5), bz = rnd.range(sand0 + 1.4, sand1 - 1.2);
      const c = rnd.pick(['#e63946', '#ffb703', '#3a86ff', '#ff70a6', '#06d6a0']);
      add(piece((v) => {
        v.box(bx, Y, bz, 0.08, 2.0, 0.08, '#eee');
        for (let s = 0; s < 4; s++) v.box(bx - 0.9 + s * 0.6, Y + 2.0, bz, 0.6, 0.12, 2.2, s % 2 ? c : '#ffffff');
        v.box(bx, Y + 2.12, bz, 1.2, 0.12, 1.2, c);
        // striped strandstoel
        v.box(bx + 1.3, Y, bz, 0.8, 0.3, 0.9, '#f1faee'); v.box(bx + 1.3, Y + 0.3, bz - 0.35, 0.8, 0.8, 0.2, c);
        v.box(bx - 1.2, Y, bz + 0.3, 1.5, 0.05, 0.8, rnd.pick(['#ff70a6', '#8ecae6', '#ffd166'])); // towel
      }, rnd.int(1, 999)), bx);
    }
    // sandcastle + Dutch flag
    const fx = rnd.range(-6, 6);
    add(piece((v) => {
      v.box(fx, Y, sand1 - 0.9, 1.2, 0.4, 1.2, '#e2c27c'); v.box(fx, Y + 0.4, sand1 - 0.9, 0.7, 0.4, 0.7, '#e2c27c'); v.box(fx, Y + 0.8, sand1 - 0.9, 0.3, 0.3, 0.3, '#e2c27c');
      v.box(fx + 3, Y, sand1 - 0.6, 0.1, 3.4, 0.1, '#eee');
      v.box(fx + 3.65, Y + 3.0, sand1 - 0.6, 1.2, 0.24, 0.05, '#ae1c28'); v.box(fx + 3.65, Y + 2.76, sand1 - 0.6, 1.2, 0.24, 0.05, '#ffffff'); v.box(fx + 3.65, Y + 2.52, sand1 - 0.6, 1.2, 0.24, 0.05, '#21468b');
    }), fx);
    // buoy
    add(piece((v) => { v.box(14, 0, zF - 1.6, 0.6, 0.5, 0.6, '#e63946'); v.box(14, 0.5, zF - 1.6, 0.3, 0.4, 0.3, '#ffffff'); }), 14);
    const g2s = new THREE.Group();
    add(piece((v) => P.stall(g2s, v, -13, sand0 + 1.3, 'HARING', ['#21468b', '#ffffff'], Y, -1)), -13).add(g2s);
    L.stalls.push({ x: -13, z: sand0 + 1.3 - 1.3, label: 'HARING' });
  } else if (strip === 'park') {
    add(piece((v) => {
      v.box(0, -0.1, zs(0.5), LEN, 0.25, stripW, '#6fbf5f');
      for (let i = 0; i < 30; i++) v.box(rnd.range(X0 + 1, X1 - 1), 0.15, rnd.range(s0 + 0.4, zF - 0.4), rnd.range(0.5, 1.6), 0.04, rnd.range(0.5, 1.2), '#62b354');
      v.box(0, 0.15, zs(0.42), LEN, 0.03, 1.0, '#e6d5a8'); // gravel path
      const px = rnd.range(-10, 10);
      v.box(px, 0.15, zs(0.78), 5, 0.04, 1.8, '#49b3dd'); v.box(px + 0.8, 0.15, zs(0.78), 3, 0.05, 2.4, '#49b3dd');
    }, rnd.int(1, 999)), 0, 'ground');
    for (let i = 0; i < 7; i++) { const tx = -21 + i * 7 + rnd.range(-2, 2), tz = rnd.chance(0.5) ? zs(0.16) : zs(0.75); add(piece((v) => P.tree(v, tx, tz, rnd, Y), rnd.int(1, 999)), tx); }
    for (let i = 0; i < 5; i++) { const bx = rnd.range(-22, 22); add(piece((v) => { P.bush(v, bx, zs(0.9), rnd, Y); P.tulips(v, bx + 1.5, zs(0.6), rnd, Y, 8, 1.2); }, rnd.int(1, 999)), bx); }
  } else if (strip === 'plaza') {
    add(piece((v) => {
      const ts = 1.6, cols = Math.ceil(LEN / ts), rows = 3, tw = stripW / rows;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) v.box(X0 + ts * (i + 0.5), -0.1, s0 + tw * (j + 0.5), ts, 0.25, tw, (i + j) % 2 ? '#dcc59d' : '#d2b98b', 0.03);
    }, rnd.int(1, 999)), 0, 'ground');
    const g2s = new THREE.Group();
    add(piece((v) => P.stall(g2s, v, -15, zs(0.55), 'HARING', ['#21468b', '#ffffff'], Y, -1)), -15).add(g2s);
    L.stalls.push({ x: -15, z: zs(0.55) - 1.3, label: 'HARING' });
    const g3s = new THREE.Group();
    add(piece((v) => P.stall(g3s, v, 15.5, zs(0.55), 'FRIET', ['#e63946', '#ffd166'], Y, -1)), 15.5).add(g3s);
    L.stalls.push({ x: 15.5, z: zs(0.55) - 1.3, label: 'FRIET' });
    for (let i = 0; i < 4; i++) { const tx = -8 + i * 5.2; add(piece((v) => P.terrace(v, tx, zs(0.55) + rnd.range(-0.4, 0.4), rnd, Y), rnd.int(1, 999)), tx); }
    for (const px of [-21, 21]) add(piece((v) => { v.box(px, Y, zs(0.8), 1.4, 0.5, 1.4, '#8d6e4c'); P.tulips(v, px, zs(0.8), rnd, Y + 0.5, 8, 0.5); }, rnd.int(1, 999)), px);
  } else {
    add(piece((v) => {
      v.box(0, -0.1, zs(0.5), LEN, 0.25, stripW, '#6fbf5f');
      for (let i = 0; i < 22; i++) v.box(rnd.range(X0 + 1, X1 - 1), 0.15, rnd.range(s0 + 0.4, zF - 0.4), rnd.range(0.5, 1.6), 0.04, rnd.range(0.5, 1.2), '#62b354');
    }, rnd.int(1, 999)), 0, 'ground');
    for (let i = 0; i < 4; i++) { const hx = -18 + i * 12; add(piece((v) => P.hedge(v, hx, zF - 0.7, 6, Y), rnd.int(1, 999)), hx); }
    for (let i = 0; i < 5; i++) { const tx = -20 + i * 10 + rnd.range(-2.5, 2.5); add(piece((v) => { P.tree(v, tx, zs(0.5), rnd, Y); P.tulips(v, tx + 2, zs(0.45), rnd, Y, 5, 0.9); }, rnd.int(1, 999)), tx); }
    // glasbak (recycling) + little slide
    const gx = rnd.range(-20, -12);
    add(piece((v) => { v.box(gx, Y, zs(0.35), 1.4, 1.4, 1.2, '#3a9d6a'); v.box(gx, Y + 1.4, zs(0.35), 1.0, 0.2, 0.9, '#2f7d55'); v.box(gx, Y + 0.9, zs(0.35) - 0.61, 0.4, 0.3, 0.02, '#111'); }), gx);
    if (per100(st.food) + per100(st.shops) > 0.4 || rnd.chance(0.4)) {
      const g2s = new THREE.Group();
      const lab = rnd.pick(['HARING', 'FRIET', 'BLOEM']);
      const cols = { HARING: ['#21468b', '#ffffff'], FRIET: ['#e63946', '#ffd166'], BLOEM: ['#ff70a6', '#ffffff'] }[lab];
      add(piece((v) => P.stall(g2s, v, 14, zs(0.42), lab, cols, Y, -1)), 14).add(g2s);
      L.stalls.push({ x: 14, z: zs(0.42) - 1.3, label: lab });
    }
  }

  // stork on a chimney — The Hague's mascot
  if (L.chimneys.length) {
    const c = rnd.pick(L.chimneys);
    const stork = makeBird(rnd, 'stork');
    stork.g.position.set(c.x, c.y + 0.3, c.z);
    stork.g.rotation.y = rnd.range(-0.6, 0.6);
    const nest = piece((v) => { v.box(c.x, c.y, c.z, 1.1, 0.3, 1.1, '#9b7653', 0.1); v.box(c.x, c.y + 0.2, c.z, 0.8, 0.14, 0.8, '#7a5a3c'); });
    nest.add(stork.g);
    add(nest, c.x);
    L.stork = stork;
  }

  return { pieces, L };
}
