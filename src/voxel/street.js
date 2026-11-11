// The street's cross-section (lanes, pavements, walking lines), its furniture, and the per-spot
// layouts the gag scripts play on. Everything here is in street coords: s along the street, v across it
// (negative v = the far side from the camera, where the house fronts are).
import * as THREE from 'three';
import { Vox, MAT, clamp } from './kit.js';
import * as P from './props.js';

/** Lanes and pavements for this street, squeezed to fit between the real building fronts. */
export function crossSection(st, clearB, clearF, night, road = null) {
  const cls = st.cls || 'residential';
  const kind = cls === 'pedestrian' ? 'ped' : (['trunk', 'primary', 'secondary', 'tertiary'].includes(cls) || st.lanes >= 2) ? 'major' : 'minor';
  let hw = kind === 'major' ? 3.3 : kind === 'minor' ? 2.6 : 3.6;
  let bw = kind !== 'ped' && (st.bike || kind === 'major') ? 1.2 : 0;
  // the road is painted the same for every street, from the map's own width and cycle lanes: fit the lanes to that
  if (road && kind !== 'ped') { bw = road.bike && road.w >= 6 ? 1.2 : 0; hw = clamp(road.w / 2 - bw, kind === 'major' ? 2.8 : 1.9, 5.5); }
  const tight = Math.min(clearB, clearF);
  if (kind === 'ped') hw = clamp(tight - 2.0, 1.4, 3.6);
  else {
    if (tight < hw + bw + 1.6) bw = 0;
    if (tight < hw + 1.6) hw = clamp(tight - 1.6, 1.7, hw);
  }
  const hb = hw + bw;
  const swB = clamp(clearB - hb - 0.15, 1.3, 3.6), swF = clamp(clearF - hb - 0.15, 1.3, 3.6);
  const L = {
    kind, hw, bw, swB, swF, night, tram: false, strip: 'yard',
    zH: -(hb + swB), s0: hb + swF, zB: -(hb + swB) - 7, zF: hb + swF + 7, zc: 0, depth: 2 * hb + swB + swF + 14,
    walkB: [-(hb + swB * 0.62), -(hb + swB * 0.36)], walkF: [hb + swF * 0.42, hb + swF * 0.68],
    bikeB: bw ? -(hw + bw / 2) : -(hw - 0.55), bikeF: bw ? hw + bw / 2 : hw - 0.55,
    laneB: null, laneF: null, tramB: null, tramF: null, chaseZ: 0, canPark: false,
    yAt: () => 0,
    x0: -24, x1: 24,
    houses: [], shops: [], racks: [], benches: [], bins: [], parked: [], lamps: [], stalls: [], chimneys: [],
    atm: null, box: null, canal: null, sea: null,
  };
  if (kind === 'major') { L.laneB = -hw / 2; L.laneF = hw / 2; }
  if (kind === 'minor') {
    const park = hw >= 2.5;
    L.canPark = park;
    L.laneB = L.laneF = L.chaseZ = park ? -1.15 : 0; // 1.85 m car: -2.08..-0.22, parked cars from +0.68
    L.bikeB = -(hw - 0.35); L.bikeF = park ? 0.35 : hw - 0.4;
  }
  return L;
}

const STALLS = { HARING: ['#21468b', '#ffffff'], FRIET: ['#e63946', '#ffd166'], BLOEM: ['#ff70a6', '#ffffff'] };

/** Street furniture at believable spots along the real street, and the anchors the gags use. */
export function dress(W) {
  const { path, L, st, rnd, night, group, C } = W, G = { get: W.clsAt };
  const A = W.anchors, hb = L.hw + L.bw;
  const v = new Vox(rnd.int(1, 9999)), gl = new Vox(rnd.int(1, 9999));
  const fr = {};
  /** Point the builders at a spot on the street: local x runs along it, local z across it. */
  const at = (s, off, flip = false) => {
    path.at(s, fr);
    const X = fr.x - fr.tz * off, Z = fr.z + fr.tx * off, th = Math.atan2(-fr.tz, fr.tx) + (flip ? Math.PI : 0);
    const y = W.hAt(X, Z);
    v.setT(th, X, Z, y); gl.setT(th, X, Z, y);
    return { X, Z, th, y };
  };
  const holder = (f) => { const g = new THREE.Group(); g.position.set(f.X, f.y, f.Z); g.rotation.y = f.th; group.add(g); return g; };
  const okT = new Uint8Array(256);
  for (const c of [C.WALK, C.LAND, C.PLAZA, C.GRASS, C.FOREST, C.DUNE, C.SAND, C.PARKING, C.CURB, C.FOOT, C.DIRT, C.PED]) okT[c] = 1;
  const cls = (s, off) => { const p = path.xz(s, off); return G.get(p[0], p[1]); };
  const free = (s, off) => okT[cls(s, off)] === 1;
  const sA = path.sA, sB = path.sB, len = sB - sA;

  // ---- where the pavement really is: scanned from the painted ground every 2 m, on both sides, along the whole path
  // (also round the corner at both ends, where the street's own cross-section is not drawn)
  L.sA = sA; L.sB = sB;
  {
    const DS = 2, n = Math.ceil(path.len / DS) + 1, set = (...c) => { const t = new Uint8Array(256); for (const k of c) t[k] = 1; return t; };
    const GOOD = set(C.WALK, C.PED, C.PLAZA, C.LAND, C.FOOT), SOSO = set(C.DIRT, C.GRASS, C.SAND, C.DUNE, C.FOREST, C.PITCH, C.FARM);
    const ROADY = set(C.ASPHALT, C.KLINKER, C.SERVICE, C.BIKELANE, C.CYCLE, C.MARK, C.CURB, C.PARKING, C.RAILBED, C.RAIL);
    const tabs = {};
    for (const sgn of [-1, 1]) {
      const t = (tabs[sgn] = new Float32Array(n * 2)); // per sample: inner edge of the walkable strip, its width (edge < 0: none)
      for (let k = 0; k < n; k++) {
        let a = -1, b = -1, soft = -1;
        for (let v = 0.6; v <= 12; v += 0.4) {
          const c = cls(k * DS, sgn * v);
          if (GOOD[c]) { if (a < 0) a = v; b = v; }
          else if (a >= 0) break;
          else if (SOSO[c]) { if (soft < 0 && v > 1.4) soft = v; }
          else if (!ROADY[c] && v > 1.6) break; // a wall or water before any pavement
        }
        if (a >= 0 && b - a >= 0.4) { t[k * 2] = a + 0.25; t[k * 2 + 1] = Math.min(b - a, 3.2); }
        else if (soft >= 0) { t[k * 2] = soft + 0.3; t[k * 2 + 1] = 0.7; } // no pavement: the verge will do
        else t[k * 2] = -1;
      }
      // a short gap is a side street to cross: carry the line straight over it
      for (let k = 0; k < n; k++) {
        if (t[k * 2] >= 0) continue;
        let k1 = k;
        while (k1 < n && t[k1 * 2] < 0) k1++;
        const lo = k - 1, hi = k1 < n ? k1 : -1;
        for (let q = k; q < k1; q++) {
          if (lo >= 0 && hi >= 0 && k1 - k <= 12) { const f = (q - lo) / (hi - lo); t[q * 2] = t[lo * 2] + (t[hi * 2] - t[lo * 2]) * f; t[q * 2 + 1] = Math.min(t[lo * 2 + 1], t[hi * 2 + 1]); }
          else { t[q * 2] = hb + 0.9; t[q * 2 + 1] = 1.2; } // nothing to go by: beside the kerb
        }
        k = k1;
      }
      // people do not turn on a sixpence: smooth the line a little
      const e = new Float32Array(n);
      for (let k = 0; k < n; k++) { const k0 = Math.max(0, k - 2), k2 = Math.min(n - 1, k + 2); let sum = 0; for (let q = k0; q <= k2; q++) sum += t[q * 2]; e[k] = Math.max(t[k * 2] - 0.2, sum / (k2 - k0 + 1)); }
      for (let k = 0; k < n; k++) { t[k * 2 + 1] = Math.max(0.3, t[k * 2 + 1] - (e[k] - t[k * 2])); t[k * 2] = e[k]; }
    }
    /** Where to walk at arc length s: side −1 (far) or 1 (camera side), f = 0…1 across the pavement's width. Returns the offset from the centre line. */
    L.walkAt = (side, f, s) => {
      const t = tabs[side < 0 ? -1 : 1], x = clamp(s / DS, 0, n - 1.001), k = Math.floor(x), u = x - k;
      const a = t[k * 2] + (t[k * 2 + 2] - t[k * 2]) * u, w = t[k * 2 + 1] + (t[k * 2 + 3] - t[k * 2 + 1]) * u;
      return (side < 0 ? -1 : 1) * (a + w * f);
    };
  }

  // ---- house anchors
  for (const h of W.heroes) {
    if (h.side >= 0) continue;
    const fp = path.project(h.front[0], h.front[1]), dp = path.project(h.door[0], h.door[1]), wp = path.project(h.win[0], h.win[1]);
    if (fp.v > -hb - 0.5 || fp.s < sA - 2 || fp.s > sB + 2) continue;
    const a = {
      s: fp.s, w: h.w, top: h.info.top, z: fp.v, shop: h.info.shop || null, tower: !!h.info.tower,
      door: { s: dp.s, z: Math.min(dp.v, -hb - 0.4) }, win: { s: wp.s, y: h.winY, z: wp.v },
    };
    A.houses.push(a);
    if (h.atm) { const p = path.project(h.atm[0], h.atm[1]); A.atms.push({ s: p.s, z: p.v, zH: fp.v }); }
    if (h.chimney && !h.info.tower) A.chimneys.push(h.chimney);
  }
  A.houses.sort((a, b) => a.s - b.s);
  A.houses.forEach((h, i) => { h.idx = i; });
  const doorNear = (s, r) => A.houses.some((h) => Math.abs(h.door.s - s) < r);
  const houseAt = (s) => A.houses.find((h) => Math.abs(h.s - s) < h.w / 2);

  // (lamp posts and parked cars are the city's: see crowd.js. The stage lists the ones along this street in A.lamps and A.parked.)
  const zCurbB = -(hb + 0.45), zCurbF = hb + 0.5;

  // ---- block by block: racks, benches, bins, a transformer box, a stall, the name sign
  const busy = ((st.shops || 0) + (st.food || 0) + (st.bars || 0)) / Math.max(0.6, len / 100);
  let block = 0;
  for (let b0 = sA; b0 < sB; b0 += 48, block++) {
    const b1 = Math.min(sB, b0 + 48);
    if (b1 - b0 < 10) break;
    const pickS = (pad = 3) => rnd.range(b0 + pad, Math.max(b0 + pad + 0.1, b1 - pad));
    // bike rack against a house front (or the back of the pavement)
    for (let k = 0; k < (W.builtAt((b0 + b1) / 2, -1) ? 2 : block % 3 === 0 ? 1 : 0); k++) {
      let s = pickS(), off = L.zH + 0.7;
      const h = houseAt(s);
      if (h) { if (h.shop || h.w < 4) continue; s = h.s + (h.door.s > h.s ? -1 : 1) * Math.min(h.w / 2 - 1.3, 1.7); off = h.z + 0.7; }
      if (doorNear(s, 1.4) || A.racks.some((r) => Math.abs(r.s - s) < 5) || !free(s, off) || !free(s, off + 1)) continue;
      at(s, off);
      P.bikeRack(v, 0, 0, rnd, 4, 0);
      A.racks.push({ s, z: off + 1.7 });
    }
    // benches, backs to the houses, facing the street
    for (let k = 0; k < (W.builtAt((b0 + b1) / 2, -1) ? 2 : block % 2); k++) {
      for (let t = 0; t < 8; t++) {
        const s = pickS(4), h = houseAt(s), off = (h ? h.z : L.zH) + 0.45;
        if (off > -hb - 0.7) continue;
        if (doorNear(s, 1.7) || A.racks.some((r) => Math.abs(r.s - s) < 2.6) || A.benches.some((r) => Math.abs(r.s - s) < 6) || A.atms.some((r) => Math.abs(r.s - s) < 2.2) || !free(s, off)) continue;
        at(s, off);
        P.bench(v, 0, 0, 0);
        A.benches.push({ s, z: off });
        break;
      }
    }
    for (let k = 0; k < 3; k++) {
      const s = b0 + ((k + 0.5) * (b1 - b0)) / 3 + rnd.range(-4, 4), off = zCurbF + 0.1;
      if (!free(s, off) || L.zebras.some((z) => Math.abs(z - s) < 2.5)) continue;
      at(s, off);
      P.bin(v, 0, 0, 0);
      A.bins.push({ s, z: off });
    }
    if (block % 2 === 0) { const s = pickS(), off = zCurbB + 0.1; if (free(s, off)) { at(s, off); P.mailbox(v, 0, 0, 0); } }
    // transformer box (graffiti magnet) on the camera-side pavement
    if (L.swF >= 2 && (block % 2 === 0 || len < 60)) {
      for (let t = 0; t < 6; t++) {
        const s = pickS(5), off = hb + Math.min(0.5, L.swF - 1.5);
        if (!free(s - 1, off) || !free(s + 1, off) || !free(s, off + 1) || A.bins.some((r) => Math.abs(r.s - s) < 2) || L.zebras.some((z) => Math.abs(z - s) < 3)) continue;
        at(s, off);
        v.box(0, 0, 0, 2.0, 1.5, 0.7, '#7f9a8a');
        v.box(0, 1.5, 0, 2.1, 0.1, 0.8, '#647a6d');
        v.box(0.5, 0.2, -0.36, 0.7, 1.1, 0.03, '#6c8576');
        A.boxes.push({ s, z: off + 0.35, y: 0, w: 2.0, h: 1.5 });
        break;
      }
    }
    // a herring / chips / flower stall where there is room on the camera side
    if (L.kind === 'ped' || busy > 1.4 || st.beach || rnd.chance(0.3)) {
      for (let t = 0; t < 6; t++) {
        const s = pickS(6), off = L.kind === 'ped' ? hb + L.swF - 1.1 : L.s0 + 1.7;
        const c0 = cls(s, off);
        if (!okT[c0] || !free(s - 1.4, off) || !free(s + 1.4, off) || !free(s, off + 0.9) || A.stalls.some((r) => Math.abs(r.s - s) < 30)) continue;
        const f = at(s, off), g = holder(f), lab = st.beach || c0 === C.SAND ? 'HARING' : rnd.pick(['HARING', 'FRIET', 'BLOEM']);
        P.stall(g, v, 0, 0, lab, STALLS[lab], 0, -1);
        A.stalls.push({ s, z: off - 1.3, label: lab });
        break;
      }
    }
    // the real street name, on a real Dutch blue sign
    if (block % 3 === 0) {
      for (let t = 0; t < 5; t++) {
        const s = b0 + 2.6 + t * 3, off = L.s0 - 0.25;
        if (!free(s, off)) continue;
        const f = at(s, off), g = holder(f);
        P.streetSign(g, v, 0, 0, (st.name || 'STRAAT').toUpperCase().slice(0, 26), 0);
        break;
      }
    }
  }

  // ---- side streets get their real names on the corner
  {
    const seen = new Set([st.name]);
    let count = 0;
    for (const r of W.roads) {
      if (count >= 16) break;
      if (!r.name || r.cls > 8 || seen.has(r.name)) continue;
      const a = r.a, n = a.length >> 1;
      for (let i = 0; i < n; i++) {
        const pr = path.project(a[i * 2], a[i * 2 + 1]);
        if (pr.d > 5 || pr.s < sA + 2 || pr.s > sB - 2) continue;
        // which way does it leave? look at its far end
        const j = i < n / 2 ? n - 1 : 0, far = path.project(a[j * 2], a[j * 2 + 1]);
        const side = far.v < 0 ? -1 : 1, off = side * (hb + 0.95);
        for (const ds of [r.w / 2 + 1.5, -(r.w / 2 + 1.5)]) {
          const s2 = pr.s + ds;
          if (s2 < sA + 1 || s2 > sB - 1 || !free(s2, off)) continue;
          const f = at(s2, off), g = holder(f);
          P.streetSign(g, v, 0, 0, r.name.toUpperCase().slice(0, 24), 0);
          count++;
          break;
        }
        seen.add(r.name);
        break;
      }
    }
  }

  // ---- stops and terraces from real points of interest
  const stops = [];
  for (const p of W.pois) {
    const pr = path.project(p.x, p.z);
    if (pr.s < sA + 3 || pr.s > sB - 3) continue;
    if (p.kind === 9 && pr.d < 16 && !stops.some((q) => Math.abs(q - pr.s) < 30)) {
      const back = pr.v < 0, off = back ? -(hb + Math.min(L.swB - 0.3, 1.9)) : hb + Math.min(L.swF - 0.3, 1.9);
      if (!free(pr.s, off) || doorNear(pr.s, 2)) continue;
      at(pr.s, off, !back);
      P.tramStop(v, gl, 0, 0, night, 0);
      stops.push(pr.s);
    }
  }
  for (const h of A.houses) {
    if (!h.shop || !['CAFE', 'KROEG', 'BAR', 'BIER', 'PIZZA', 'SUSHI', 'ROTI'].includes(h.shop) || h.z > -hb - 3.2) continue;
    for (const dx of [-1.3, 1.3]) {
      const s = h.s + dx, off = h.z + 1.9;
      if (Math.abs(h.door.s - s) < 1.1 || !free(s, off) || A.benches.some((r) => Math.abs(r.s - s) < 1.5) || A.racks.some((r) => Math.abs(r.s - s) < 1.8)) continue;
      at(s, off);
      P.terrace(v, 0, 0, rnd, 0);
    }
  }

  // ---- beach life on any sand near the street
  v.setT(); gl.setT();
  let par = 0;
  for (let t = 0; t < 400 && par < 34; t++) {
    const s = rnd.range(sA, sB), off = rnd.range(-70, 70), p = path.xz(s, off);
    if (G.get(p[0], p[1]) !== C.SAND || G.get(p[0] + 2, p[1]) !== C.SAND || G.get(p[0] - 2, p[1] + 2) !== C.SAND) continue;
    const c = rnd.pick(['#e63946', '#ffb703', '#3a86ff', '#ff70a6', '#06d6a0']), [x, z] = p;
    v.setT(0, 0, 0, W.hAt(x, z));
    v.box(x, 0, z, 0.08, 2.0, 0.08, '#eee');
    for (let k = 0; k < 4; k++) v.box(x - 0.9 + k * 0.6, 2.0, z, 0.6, 0.12, 2.2, k % 2 ? c : '#ffffff');
    v.box(x, 2.12, z, 1.2, 0.12, 1.2, c);
    v.box(x + 1.3, 0, z, 0.8, 0.3, 0.9, '#f1faee'); v.box(x + 1.3, 0.3, z - 0.35, 0.8, 0.8, 0.2, c);
    v.box(x - 1.2, 0, z + 0.3, 1.5, 0.05, 0.8, rnd.pick(['#ff70a6', '#8ecae6', '#ffd166']));
    par++;
  }
  if (par > 4) L.beach = true;

  if (!v.empty) group.add(v.mesh());
  if (!gl.empty) group.add(gl.mesh(MAT.glow));
}

/** The layout a gag sees at one spot: the cross-section plus the anchors within 24 m, with x measured from the spot. */
export function localeL(W, sc, half = 24) {
  const A = W.anchors, { path, C } = W, G = { get: W.clsAt }, L = Object.create(W.L);
  const sh = (a) => Object.assign(Object.create(a), { x: a.s - sc });
  const inWin = (a, r = half - 2) => Math.abs(a.s - sc) < r;
  L.sc = sc; L.x0 = -half; L.x1 = half;
  L.houses = A.houses.filter((h) => Math.abs(h.s - sc) < half - 1).map((h) => Object.assign(sh(h), {
    door: { x: h.door.s - sc, z: h.door.z }, win: { x: h.win.s - sc, y: h.win.y, z: h.win.z },
  }));
  L.shops = L.houses.filter((h) => h.shop);
  L.racks = A.racks.filter((a) => inWin(a)).map(sh);
  L.benches = A.benches.filter((a) => inWin(a, half - 4)).map(sh);
  L.bins = A.bins.filter((a) => inWin(a, half - 5)).map(sh);
  L.parked = A.parked.filter((a) => inWin(a, half - 4)).map(sh);
  L.lamps = A.lamps.filter((a) => inWin(a)).map(sh);
  L.stalls = A.stalls.filter((a) => inWin(a, half - 5)).map(sh);
  const atm = A.atms.filter((a) => inWin(a, 16)).sort((a, b) => Math.abs(a.s - sc) - Math.abs(b.s - sc))[0];
  L.atm = atm ? (atm.local ||= sh(atm)) : null;
  if (L.atm) L.atm.x = atm.s - sc;
  const box = A.boxes.filter((a) => inWin(a, 15)).sort((a, b) => Math.abs(a.s - sc) - Math.abs(b.s - sc))[0];
  L.box = box ? sh(box) : null;
  // water running alongside? then boats can pass
  const frac = (off, c) => { let n = 0, k = 0; for (let x = -22; x <= 22; x += 4, k++) { const p = path.xz(sc + x, off); if (G.get(p[0], p[1]) === c) n++; } return n / k; };
  for (const sgn of [1, -1]) {
    if (L.canal) break;
    let a = null;
    for (let off = 5; off <= 40; off += 1) {
      const wet = frac(sgn * off, C.WATER) >= 0.85;
      if (wet && a === null) a = off;
      if (!wet && a !== null) { if (off - a >= 5) L.canal = { z: sgn * (a + off - 1) / 2, y: 0.02, z0: sgn * a, z1: sgn * (off - 1) }; a = null; if (L.canal) break; }
    }
    if (!L.canal && a !== null && 40 - a >= 5) L.canal = { z: sgn * (a + 40) / 2, y: 0.02, z0: sgn * a, z1: sgn * 40 };
  }
  let sand = 0;
  for (const off of [12, 22, 32, -12, -22]) sand = Math.max(sand, frac(off, C.SAND));
  L.strip = sand > 0.4 ? 'beach' : L.canal ? 'canal' : 'yard';
  return L;
}

/** Layout for the street-long background life (walkers, bikes, cars). */
export function ambientL(W) {
  const L = Object.create(W.L), half = W.path.len / 2;
  L.sc = half; L.x0 = -half + 0.5; L.x1 = half - 0.5;
  for (const k of ['houses', 'shops', 'racks', 'benches', 'bins', 'parked', 'lamps', 'stalls']) L[k] = [];
  return L;
}
