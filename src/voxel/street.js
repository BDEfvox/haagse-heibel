// The street's cross-section (lanes, pavements, walking lines), its furniture, and the per-spot
// layouts the gag scripts play on. Everything here is in street coords: s along the street, v across it
// (negative v = the far side from the camera, where the house fronts are).
import { clamp } from './kit.js';

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

/** Street furniture at believable spots along the real street, and the anchors the gags use. */
export function dress(W) {
  const { path, L, C } = W, G = { get: W.clsAt };
  const A = W.anchors, hb = L.hw + L.bw;
  const cls = (s, off) => { const p = path.xz(s, off); return G.get(p[0], p[1]); };
  const sA = path.sA, sB = path.sB;

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

  // (lamp posts and parked cars are the city's: see crowd.js. The stage lists the ones along this street in A.lamps and A.parked.)

  // ---- furniture is part of the map tiles (furnish.js); here we only look up what stands along this street and hand the
  // cutscene scripts their anchors. Racks and benches count on the far side (v < 0), bins, boxes and stalls on the camera side.
  const fr = {};
  const last = { rack: -1e9, bench: -1e9, bin: -1e9, box: -1e9, stall: -1e9 };
  const gap = { rack: 5, bench: 6, bin: 3, box: 8, stall: 30 };
  const list = (W.props || []).map((p) => ({ p, pr: path.project(p.x, p.z) })).sort((a, b) => a.pr.s - b.pr.s);
  for (const { p, pr } of list) {
    if (!(p.kind in last) || pr.s < sA + 2 || pr.s > sB - 2 || pr.d > 20) continue; // (the facing test below keeps a parallel street's things out)
    path.at(pr.s, fr);
    if (Math.abs(p.ax * fr.tx + p.az * fr.tz) <= 0.85) continue; // another street
    if (pr.d > 1) { // the prop must face this street's centre line, not a parallel street's
      const q = path.xz(pr.s, 0);
      if (((q[0] - p.x) * p.nx + (q[1] - p.z) * p.nz) / pr.d < 0.6) continue;
    }
    const far = pr.v < 0;
    if (far !== (p.kind === 'rack' || p.kind === 'bench')) continue;
    if (pr.s - last[p.kind] < gap[p.kind]) continue;
    last[p.kind] = pr.s;
    if (p.kind === 'rack') A.racks.push({ s: pr.s, z: pr.v + 1.7 });
    else if (p.kind === 'bench') A.benches.push({ s: pr.s, z: pr.v });
    else if (p.kind === 'bin') A.bins.push({ s: pr.s, z: pr.v });
    else if (p.kind === 'box') A.boxes.push({ s: pr.s, z: pr.v + 0.35, y: 0, w: p.w || 2.0, h: p.h || 1.5 });
    else A.stalls.push({ s: pr.s, z: pr.v - 1.3, label: p.label });
  }

  // ---- sand along the street makes it a beach street
  {
    let sand = 0, n = 0;
    for (let s = sA; s <= sB; s += 6) for (const off of [-10, -20, 10, 20]) { const q = path.xz(s, off); n++; if (G.get(q[0], q[1]) === C.SAND) sand++; }
    if (n && sand / n > 0.2) L.beach = true;
  }
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
