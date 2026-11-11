// Street furniture as part of the map: racks, benches, bins, mailboxes, transformer boxes, market stalls, street-name
// signs, tram/bus shelters, café terraces and beach parasols, drawn into a tile's own builders. Every street has them,
// placed by the same rules from the tile's own data, so the city looks the same whichever street is in focus. The open
// street only looks up what stands along it (the `props` list returned here) to hand anchors to the cutscene scripts.
//
// Frame of every prop: local +z points from the prop towards the centre line of its road (so a bench's back is to the
// houses, a shelter's glass is at the back), local x runs along the street. Tile coordinates: x east, z south, metres.
import * as THREE from 'three';
import * as P from './props.js';
import { makeRng, hashStr, clamp } from './kit.js';

const STALLS = { HARING: ['#21468b', '#ffffff'], FRIET: ['#e63946', '#ffd166'], BLOEM: ['#ff70a6', '#ffffff'] };
const TILE = 256, EDGE = 2;
const SHOPPY = new Set([1, 2, 3, 4, 6]); // poi kinds that make a street busy
const TERRACE_KINDS = new Set([1, 2, 6]); // bar, restaurant/cafe, coffee shop

// ---------------------------------------------------------------- polylines
function prep(a) {
  const n = a.length >> 1, cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(a[i * 2] - a[i * 2 - 2], a[i * 2 + 1] - a[i * 2 - 1]);
  return { a, n, cum, len: cum[n - 1] };
}
function posAt(pl, s, out) {
  const { a, n, cum } = pl;
  s = clamp(s, 0, pl.len);
  let i = 0;
  while (i < n - 2 && cum[i + 1] < s) i++;
  const l = cum[i + 1] - cum[i] || 1e-6, t = (s - cum[i]) / l;
  out.x = a[i * 2] + (a[i * 2 + 2] - a[i * 2]) * t;
  out.z = a[i * 2 + 1] + (a[i * 2 + 3] - a[i * 2 + 1]) * t;
  return out;
}
const _p = {}, _q = {};
/** Point and smoothed unit tangent at arc length s. */
function frameAt(pl, s, out = {}) {
  posAt(pl, s, out);
  posAt(pl, s - 2.5, _p); posAt(pl, s + 2.5, _q);
  let tx = _q.x - _p.x, tz = _q.z - _p.z;
  const l = Math.hypot(tx, tz) || 1;
  out.tx = tx / l; out.tz = tz / l;
  return out;
}

/**
 * Furniture for one map tile, drawn into the tile's builders. Called once per tile at the finest level of detail.
 * Returns { props }: what the cutscenes may want to use, in tile coordinates.
 */
export function furnishTile(o) {
  const { key, grid, C, trees, pois, yAt, v, gl, group, night, lite } = o;
  const rnd = makeRng(hashStr('furn|' + key));
  const props = [];
  const cap = lite ? 120 : 320;

  // ---- ground tables
  const set = (...c) => { const t = new Uint8Array(256); for (const k of c) t[k] = 1; return t; };
  const OK = set(C.WALK, C.LAND, C.PLAZA, C.GRASS, C.FOREST, C.DUNE, C.SAND, C.PARKING, C.CURB, C.FOOT, C.DIRT, C.PED);
  const GOOD = set(C.WALK, C.PED, C.PLAZA, C.LAND, C.FOOT);
  const SOSO = set(C.DIRT, C.GRASS, C.SAND, C.DUNE, C.FOREST, C.PITCH, C.FARM);
  const ROADY = set(C.ASPHALT, C.KLINKER, C.SERVICE, C.BIKELANE, C.CYCLE, C.MARK, C.CURB, C.PARKING, C.RAILBED, C.RAIL);

  // ---- trees: a coarse lookup so no prop stands in a trunk
  const tg = new Map();
  for (let i = 0; i + 2 < trees.length; i += 3) {
    const k = Math.floor(trees[i] / 8) * 64 + Math.floor(trees[i + 1] / 8);
    let l = tg.get(k);
    if (!l) tg.set(k, (l = []));
    l.push(trees[i], trees[i + 1]);
  }
  const treeNear = (x, z, r) => {
    const gx = Math.floor(x / 8), gz = Math.floor(z / 8);
    for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
      const l = tg.get(a * 64 + b);
      if (l) for (let i = 0; i < l.length; i += 2) if (Math.hypot(l[i] - x, l[i + 1] - z) < r) return true;
    }
    return false;
  };

  // ---- what stands where
  const taken = []; // { kind, x, z, r }
  const crowded = (kind, x, z, r, same = 0) => {
    for (const t of taken) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < r + t.r || (same && t.kind === kind && d < same)) return true;
    }
    return false;
  };
  /** Do the sample points (in the prop's frame, +z towards the road) all lie on open ground, clear of trunks and others? */
  const fits = (kind, x, z, n, pts, treeR, r, same = 0) => {
    if (x < EDGE || z < EDGE || x > TILE - EDGE || z > TILE - EDGE) return false;
    const sn = n[0], cs = n[1]; // local z -> (sin, cos)
    for (const [lx, lz] of pts) {
      const px = x + lx * cs + lz * sn, pz = z - lx * sn + lz * cs;
      if (!OK[grid.get(px, pz)]) return false;
      if (treeR && treeNear(px, pz, treeR)) return false;
    }
    return !crowded(kind, x, z, r, same);
  };
  const frameOf = (nx, nz) => { const th = Math.atan2(nx, nz); return [Math.sin(th), Math.cos(th), th]; };
  const stand = (kind, x, z, r) => taken.push({ kind, x, z, r });
  const aim = (th, x, z) => { const y = yAt(x, z); v.setT(th, x, z, y); gl.setT(th, x, z, y); return y; };
  const holder = (th, x, z) => { const g = new THREE.Group(); g.position.set(x, yAt(x, z), z); g.rotation.y = th; group.add(g); return g; };

  // ---- the real streets of this tile
  const pieces = [];
  for (const r of o.roads || []) {
    if (r.cls > 8 || r.cls === 1 || r.flags & 6 || !r.a || r.a.length < 4) continue; // not along motorways either
    const pl = prep(r.a);
    if (pl.len < 8) continue;
    pl.cls = r.cls; pl.w = r.w; pl.name = r.name || '';
    pieces.push(pl);
  }
  if (!pieces.length && !(pois && pois.length)) return finish();

  // shop-like points of interest, to tell a busy street from a quiet one
  const shops = [];
  for (const p of pois || []) if (SHOPPY.has(p[0])) shops.push(p[1] / 10, TILE - p[2] / 10);
  const busyAt = (x, z) => { let n = 0; for (let i = 0; i < shops.length; i += 2) if (Math.hypot(shops[i] - x, shops[i + 1] - z) < 35) n++; return n >= 3; };

  // ---- pavement scan: from a point on the centre line, look across to one side
  const cache = new Map();
  const scan = (pi, side, s) => {
    const ck = (pi * 2 + (side < 0 ? 0 : 1)) * 100000 + Math.round(s * 2);
    let r = cache.get(ck);
    if (r) return r;
    const pl = pieces[pi], f = frameAt(pl, s), nx = -f.tz * side, nz = f.tx * side;
    let e = -1, end = -1, bd = Infinity, soft = -1, sand = false;
    for (let d = 0.5; d <= 14; d += 0.3) {
      const x = f.x + nx * d, z = f.z + nz * d, c = grid.get(x, z);
      if (c === C.BUILDING) { bd = d; break; }
      if (GOOD[c]) { if (e < 0) e = d; end = d; }
      else if (e >= 0) { if (d - end > 0.9) break; }
      else if (SOSO[c]) { if (soft < 0 && d > 1.4) { soft = d; sand = c === C.SAND; } }
      else if (!ROADY[c] && d > 1.6) break; // a wall or water before any pavement
    }
    if (e >= 0 && pl.cls === 8) e = Math.max(e, 1.8); // keep the middle of a pedestrian street open for walking
    const ok = e >= 0 && end > e;
    const back = Number.isFinite(bd) && (!ok || bd - end <= 1.0) ? bd : end;
    r = { ok, e, end, bd, back, hasB: Number.isFinite(bd) && (!ok || bd - end <= 1.0), w: ok ? back - e : 0, soft, sand, nx, nz, f };
    cache.set(ck, r);
    return r;
  };

  const add = (kind, x, z, f, nx, nz, extra) => {
    props.push({ kind, x, z, ax: f.tx, az: f.tz, nx, nz, ...extra });
  };

  // ---- how much: a dense tile should not end up with more than `cap` props
  let blocks = 0;
  for (const pl of pieces) blocks += Math.max(0, Math.ceil(pl.len / 48)) * 2;
  const scale = Math.min(1, cap / Math.max(1, blocks * 3.2)) * (lite ? 0.75 : 1);
  const chance = (p) => rnd() < p * scale;

  // ---- block by block, both sides of every street
  const signs = new Map();
  pieces.forEach((pl, pi) => {
    const zebras = [];
    if (pl.len >= 45) for (let s = 20; s < pl.len - 12; s += 80) zebras.push(s);
    const nearZebra = (s, r) => zebras.some((z) => Math.abs(z - s) < r);
    // the street's own name on a blue sign near the start of the piece, one per side
    if (pl.name && pl.len > 40) {
      const seen = signs.get(pl.name) || 0;
      let made = 0;
      for (const side of rnd() < 0.5 ? [1, -1] : [-1, 1]) {
        if (seen + made >= 2) break;
        for (let t = 0; t < 6; t++) {
          const s = 3.5 + t * 3 + rnd.range(0, 1.5), sc = scan(pi, side, s);
          if (!sc.ok || sc.back - sc.e < 1.0) continue;
          const off = sc.back - (sc.hasB ? 0.45 : 0.3), x = sc.f.x - sc.f.tz * side * off, z = sc.f.z + sc.f.tx * side * off;
          const nx = sc.f.tz * side, nz = -sc.f.tx * side, fr = frameOf(nx, nz);
          if (!fits('sign', x, z, fr, [[0, 0], [0, 0.6]], 1.3, 0.5, 0)) continue;
          const th = fr[2];
          aim(th, x, z);
          P.streetSign(holder(th, x, z), v, 0, 0, pl.name.toUpperCase().slice(0, 26), 0);
          stand('sign', x, z, 0.5);
          made++;
          break;
        }
      }
      signs.set(pl.name, seen + made);
    }
    for (let b0 = 0; b0 < pl.len; b0 += 48) {
      const b1 = Math.min(pl.len, b0 + 48);
      if (b1 - b0 < 8) continue;
      const mid = (b0 + b1) / 2, mf = frameAt(pl, mid);
      const busy = pl.cls === 8 || busyAt(mf.x, mf.z);
      for (const side of [-1, 1]) {
        if (props.length >= cap) break;
        const pickS = (pad = 3) => rnd.range(b0 + Math.min(pad, (b1 - b0) / 3), b1 - Math.min(pad, (b1 - b0) / 3));
        /** A spot at offset `off` from the centre line on this side, and the road-ward direction there. */
        const spot = (sc, off) => ({ x: sc.f.x - sc.f.tz * side * off, z: sc.f.z + sc.f.tx * side * off, nx: sc.f.tz * side, nz: -sc.f.tx * side });
        const midSc = scan(pi, side, mid);

        // bike rack against the building line (or the back of the pavement where nothing is built)
        if (chance(midSc.hasB ? 0.95 : 0.4)) {
          for (let t = 0; t < 10; t++) {
            const s = pickS(), sc = scan(pi, side, s);
            if (!sc.ok || sc.back - sc.e < 1.5) continue;
            const p = spot(sc, sc.back - 0.7), fr = frameOf(p.nx, p.nz);
            if (!fits('rack', p.x, p.z, fr, [[-1.6, -0.6], [0, -0.6], [1.6, -0.6], [-1.6, 1.3], [0, 1.3], [1.6, 1.3], [0, 0.5]], 1.3, 2.0, 5)) continue;
            aim(fr[2], p.x, p.z);
            P.bikeRack(v, 0, 0, rnd, 4, 0);
            stand('rack', p.x, p.z, 2.0);
            add('rack', p.x, p.z, sc.f, p.nx, p.nz);
            break;
          }
        }
        // bench with its back to the houses
        if (chance(midSc.hasB ? 0.7 : 0.3)) {
          for (let t = 0; t < 6; t++) {
            const s = pickS(4), sc = scan(pi, side, s);
            if (!sc.ok || sc.back - sc.e < 1.4) continue;
            const p = spot(sc, sc.back - 0.45), fr = frameOf(p.nx, p.nz);
            if (!fits('bench', p.x, p.z, fr, [[-0.8, 0], [0, 0], [0.8, 0], [0, 0.8]], 1.3, 1.4, 6)) continue;
            aim(fr[2], p.x, p.z);
            P.bench(v, 0, 0, 0);
            stand('bench', p.x, p.z, 1.4);
            add('bench', p.x, p.z, sc.f, p.nx, p.nz);
            break;
          }
        }
        // bins at the kerb
        for (let k = 0, n = chance(0.85) ? (chance(0.3) ? 2 : 1) : 0; k < n; k++) {
          for (let t = 0; t < 5; t++) {
            const s = pickS(2), sc = scan(pi, side, s);
            if (!sc.ok || nearZebra(s, 3.5)) continue;
            const p = spot(sc, sc.e + 0.45), fr = frameOf(p.nx, p.nz);
            if (!fits('bin', p.x, p.z, fr, [[0, 0]], 1.3, 0.7, 6)) continue;
            aim(fr[2], p.x, p.z);
            P.bin(v, 0, 0, 0);
            stand('bin', p.x, p.z, 0.7);
            add('bin', p.x, p.z, sc.f, p.nx, p.nz);
            break;
          }
        }
        // a mailbox now and then
        if (chance(0.22)) {
          for (let t = 0; t < 4; t++) {
            const s = pickS(2), sc = scan(pi, side, s);
            if (!sc.ok || nearZebra(s, 3.5) || sc.w < 1.0) continue;
            const p = spot(sc, sc.e + 0.4), fr = frameOf(p.nx, p.nz);
            if (!fits('mailbox', p.x, p.z, fr, [[0, 0]], 1.3, 0.8, 20)) continue;
            aim(fr[2], p.x, p.z);
            P.mailbox(v, 0, 0, 0);
            stand('mailbox', p.x, p.z, 0.8);
            add('mailbox', p.x, p.z, sc.f, p.nx, p.nz);
            break;
          }
        }
        // transformer box (graffiti magnet) where the pavement is wide enough
        if (chance(0.4)) {
          for (let t = 0; t < 5; t++) {
            const s = pickS(5), sc = scan(pi, side, s);
            if (!sc.ok || sc.w < 2.0 || nearZebra(s, 3.5)) continue;
            const p = spot(sc, sc.e + 0.35 + clamp(sc.w - 1.8, 0, 0.5)), fr = frameOf(p.nx, p.nz);
            if (!fits('box', p.x, p.z, fr, [[-1.0, 0], [0, 0], [1.0, 0], [0, 0.5], [0, -0.5]], 1.3, 1.5, 12)) continue;
            aim(fr[2], p.x, p.z);
            v.box(0, 0, 0, 2.0, 1.5, 0.7, '#7f9a8a');
            v.box(0, 1.5, 0, 2.1, 0.1, 0.8, '#647a6d');
            v.box(0.5, 0.2, -0.36, 0.7, 1.1, 0.03, '#6c8576');
            stand('box', p.x, p.z, 1.5);
            add('box', p.x, p.z, sc.f, p.nx, p.nz, { w: 2.0, h: 1.5 });
            break;
          }
        }
        // a herring / chips / flower stall where there is room: busy or pedestrian streets only, rarely
        if (busy && chance(0.1)) {
          for (let t = 0; t < 6; t++) {
            const s = pickS(6), sc = scan(pi, side, s);
            let x, z, nx, nz, lab;
            if (sc.ok && sc.back - sc.e >= 3.2) {
              const p = spot(sc, Math.max(sc.back - 1.6, sc.e + 1.5));
              ({ x, z, nx, nz } = p);
            } else if (!sc.ok && sc.soft > 0 && sc.sand) {
              const p = spot(sc, sc.soft + 1.5);
              ({ x, z, nx, nz } = p);
            } else continue;
            const fr = frameOf(nx, nz);
            if (!fits('stall', x, z, fr, [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9], [0, 0], [0, 1.6]], 2.0, 2.2, 30)) continue;
            const onSand = grid.get(x, z) === C.SAND || grid.get(x + 2, z) === C.SAND || grid.get(x - 2, z) === C.SAND;
            lab = onSand ? 'HARING' : rnd.pick(['HARING', 'FRIET', 'BLOEM']);
            aim(fr[2], x, z);
            P.stall(holder(fr[2], x, z), v, 0, 0, lab, STALLS[lab], 0, 1);
            stand('stall', x, z, 2.2);
            add('stall', x, z, sc.f, nx, nz, { label: lab });
            break;
          }
        }
      }
    }
  });

  // ---- nearest real street to a point (for shelters and terraces)
  const nearestRoad = (x, z, maxD) => {
    let best = null, bd = maxD;
    pieces.forEach((pl, pi) => {
      for (let i = 0; i + 1 < pl.n; i++) {
        const ax = pl.a[i * 2], az = pl.a[i * 2 + 1], dx = pl.a[i * 2 + 2] - ax, dz = pl.a[i * 2 + 3] - az, l2 = dx * dx + dz * dz || 1e-9;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1), ex = ax + dx * t, ez = az + dz * t, d = Math.hypot(x - ex, z - ez);
        if (d < bd) { bd = d; best = { pi, pl, s: pl.cum[i] + t * Math.sqrt(l2), x: ex, z: ez, d }; }
      }
    });
    return best;
  };

  // ---- tram and bus shelters, café terraces from the points of interest
  let terraces = 0;
  const maxTerraces = lite ? 10 : 22;
  for (const p of pois || []) {
    const kind = p[0], px = p[1] / 10, pz = TILE - p[2] / 10;
    if (kind === 9) {
      const q = nearestRoad(px, pz, 16);
      if (!q) continue;
      const f = frameAt(q.pl, q.s), vv = (px - f.x) * -f.tz + (pz - f.z) * f.tx;
      let side = vv < 0 ? -1 : 1;
      if (Math.abs(vv) < 1.0) { const a = scan(q.pi, -1, q.s), b = scan(q.pi, 1, q.s); side = (b.ok ? b.w : 0) >= (a.ok ? a.w : 0) ? 1 : -1; }
      const sc = scan(q.pi, side, q.s);
      if (!sc.ok || sc.w < 1.6) continue;
      const off = sc.e + clamp(sc.w - 0.7, 0.8, 1.9), x = f.x - f.tz * side * off, z = f.z + f.tx * side * off, nx = f.tz * side, nz = -f.tx * side, fr = frameOf(nx, nz);
      if (!fits('stop', x, z, fr, [[-1.7, 0], [0, 0], [1.7, 0], [0, 0.7]], 1.3, 2.2, 30)) continue;
      aim(fr[2], x, z);
      P.tramStop(v, gl, 0, 0, night, 0);
      stand('stop', x, z, 2.2);
    } else if (TERRACE_KINDS.has(kind) && terraces < maxTerraces) {
      const q = nearestRoad(px, pz, 24);
      if (!q) continue;
      let nx = q.x - px, nz = q.z - pz;
      const dl = Math.hypot(nx, nz);
      if (dl < 0.5) continue;
      nx /= dl; nz /= dl;
      // out of the building, to its front
      let d = 0;
      if (grid.get(px, pz) === C.BUILDING) {
        for (d = 0.25; d < 18 && d < dl; d += 0.25) if (grid.get(px + nx * d, pz + nz * d) !== C.BUILDING) break;
        if (d >= 18 || d >= dl) continue;
      }
      const bx = px + nx * d, bz = pz + nz * d;
      if (!GOOD[grid.get(bx + nx * 3.2, bz + nz * 3.2)] || !GOOD[grid.get(bx + nx * 1.9, bz + nz * 1.9)]) continue;
      const fr = frameOf(nx, nz);
      for (const dx of [-1.3, 1.3]) {
        const tx = bx + nx * 1.9 - nz * dx, tz = bz + nz * 1.9 + nx * dx;
        if (!fits('terrace', tx, tz, fr, [[0, 0], [-1.1, 0], [1.1, 0], [0, 1.1], [0, -1.1]], 2.0, 1.4)) continue;
        aim(fr[2], tx, tz);
        P.terrace(v, 0, 0, rnd, 0);
        stand('terrace', tx, tz, 1.4);
        terraces++;
      }
    }
  }

  // ---- beach life on any sand in the tile
  {
    let par = 0;
    const maxPar = lite ? 6 : 14;
    for (let t = 0; t < 160 && par < maxPar; t++) {
      const x = rnd.range(4, TILE - 4), z = rnd.range(4, TILE - 4);
      if (grid.get(x, z) !== C.SAND || grid.get(x + 2, z) !== C.SAND || grid.get(x - 2, z + 2) !== C.SAND || grid.get(x + 2, z - 2) !== C.SAND) continue;
      if (treeNear(x, z, 2.5) || crowded('parasol', x, z, 2.2, 7)) continue;
      const c = rnd.pick(['#e63946', '#ffb703', '#3a86ff', '#ff70a6', '#06d6a0']);
      v.setT(0, 0, 0, yAt(x, z));
      v.box(x, 0, z, 0.08, 2.0, 0.08, '#eee');
      for (let k = 0; k < 4; k++) v.box(x - 0.9 + k * 0.6, 2.0, z, 0.6, 0.12, 2.2, k % 2 ? c : '#ffffff');
      v.box(x, 2.12, z, 1.2, 0.12, 1.2, c);
      v.box(x + 1.3, 0, z, 0.8, 0.3, 0.9, '#f1faee'); v.box(x + 1.3, 0.3, z - 0.35, 0.8, 0.8, 0.2, c);
      v.box(x - 1.2, 0, z + 0.3, 1.5, 0.05, 0.8, rnd.pick(['#ff70a6', '#8ecae6', '#ffd166']));
      stand('parasol', x, z, 2.2);
      par++;
    }
  }
  return finish();

  function finish() {
    v.setT(); gl.setT();
    return { props };
  }
}
