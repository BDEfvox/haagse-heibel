// Dev tool: counts the frames in which the free camera's lens is inside a building (or within 1 m of one) that stands above it.
//
// Opens a street in a headless Chrome, puts the stage in free mode at a street-level view and drives the camera TARGET along
// routes in real time (the goal, in map metres, converted to the open street's frame every frame, exactly as dev-swap.mjs does),
// so main.js's own focus shifts happen as for a user. A page-side hook runs at the end of every `stage._frame` and checks the lens
// against the boxes of the tiles on screen at their CURRENT drawn height (a building the cutaway or the lens guard has laid down
// does not count).
//
// The check depends only on what the code had before the lens guard existed, so the same tool measures before and after:
//   - boxes: every Vox box is 24 consecutive vertices carrying its building's cutaway tag in `aB` (kit.js Vox.box / geometry());
//     the tool reads `position` and `aB` of every tagged mesh of every live tile (stage.W.stream.live -> tile.g.children), builds
//     its OWN index per mesh (8 m cells, tile-local) and keeps only visible meshes (a cell showing detailed fronts hides its plain mesh);
//   - current height: the vertex shader's cutaway (world.js cutPatch) re-done on the CPU with the shared uniforms U (uFocus, uCamDir,
//     uTan, uR, uCut, uHalf, uGrow), plus U.uDuck/U.uDuckN when they exist (after the fix), ground under the tag from
//     stage.W.city.landAt (the shader's terrAt holds the same heights).
//
// usage (dev server `heibel-audit` on http://localhost:5190; ONE renderer at a time):
//   node scripts/dev-lens.mjs <out.json> [--routes name,name] [--w 960 --h 600] [--time 14:00] [--lvl 5]
//   default routes: binnenhof (the long Binnenhof route, dev-swap style hops, dist 45 el 0.32, bearing 351.75: the Tweede Kamer case),
//   hofweg30 / hofweg60 (slow street-level drag Hofweg <-> Buitenhof <-> Hofweg, dist 30 / 60), spui25 (Spui along its length and
//   back, dist 25, camera east of the target: the Stadhuis side), noordeinde (Noordeinde + Prinsessewal, dist 30), weimar (Weimarstraat, dist 30).
//
// Output: one line per route (frames, lensIn, lensNear, focus shifts, cutK range, buildings involved) and a JSON file. Exit 0.
import fs from 'node:fs';
import path from 'node:path';
import { launch, args, sleep } from './dev-lib.mjs';

// a route: open = first street (?q=), view, bearing (compass degrees of the camera seen from the target, map terms; null = the
// street's own opening view), legs: street names (walked end to end, from the end nearest to where the target is) or [x, y]
// waypoints in map metres; hop: dev-swap style (hop to the next street at `hop` m/s, walk along it at `speed` until main.js would
// shift, rest until the shift happened, walk on 1 s); otherwise the target simply walks the legs at `speed`.
const HOFWEG_BUITENHOF = [[945, 936], [862, 946], [844, 951], [811, 993], [790, 1010], [771, 1019], [750, 1031], [715, 1098], [697, 1126], [715, 1098], [750, 1031], [771, 1019], [790, 1010], [811, 993], [844, 951], [862, 946], [945, 936]];
const ROUTES = {
  binnenhof: { open: 'Hofweg', dist: 45, el: 0.32, bearing: 351.75, hop: 45, speed: 14, legs: ['Buitenhof', 'Lange Vijverberg', 'Korte Vijverberg', 'Plein', 'Lange Poten', 'Spui', 'Hofweg'], hopMode: true },
  // Hofweg (from the Spui end) into Buitenhof up to the Hofvijver corner and back, on the streets' centre lines
  hofweg30: { open: 'Hofweg', dist: 30, el: 0.2, bearing: null, speed: 6, legs: HOFWEG_BUITENHOF },
  hofweg60: { open: 'Hofweg', dist: 60, el: 0.25, bearing: null, speed: 6, legs: HOFWEG_BUITENHOF },
  // camera east of the target: along the Stadhuis (bearing 90) and back
  spui25: { open: 'Spui', dist: 25, el: 0.2, bearing: 90, speed: 8, legs: ['Spui', 'Spui'] },
  noordeinde: { open: 'Noordeinde', dist: 30, el: 0.2, bearing: null, speed: 8, legs: ['Noordeinde', 'Prinsessewal'] },
  weimar: { open: 'Weimarstraat', dist: 30, el: 0.2, bearing: null, speed: 8, legs: ['Weimarstraat', 'Weimarstraat'] },
};

const A = args();
const outFile = A._[0];
if (!outFile) { console.error('usage: node scripts/dev-lens.mjs <out.json> [--routes a,b] [--w 960 --h 600] [--time 14:00] [--lvl 5]'); process.exit(2); }
const num = (v, d) => (v !== undefined && v !== true && Number.isFinite(+v) ? +v : d);
const names = A.routes && A.routes !== true ? String(A.routes).split(',') : Object.keys(ROUTES);
for (const n of names) if (!ROUTES[n]) { console.error('unknown route ' + n + ' (known: ' + Object.keys(ROUTES).join(', ') + ')'); process.exit(2); }
const width = num(A.w, 960), height = num(A.h, 600), time = A.time && A.time !== true ? A.time : '14:00', lvl = num(A.lvl, 5);

// =====================================================================================================================
// PAGE SIDE (serialised; uses nothing from Node)
// =====================================================================================================================
async function pageInstall() {
  const H = window.__heibel, st = H && H.stage;
  if (!st || typeof st._frame !== 'function') return { error: 'window.__heibel.stage._frame not found (dev server?)' };
  let U = null;
  try { U = (await import('/src/voxel/world.js')).U; } catch (e) { return { error: 'cannot import /src/voxel/world.js: ' + e.message }; }
  let feats = null;
  try { feats = (await (await fetch('./data/streets.geojson')).json()).features; } catch (e) { return { error: 'streets.geojson: ' + e.message }; }
  const KX = 68430, KY = 111267, LON0 = 4.3, LAT0 = 52.07, TILE = 256, G = 8;
  const polyMap = (id) => feats[id].geometry.coordinates.map((l) => l.map((c) => [(c[0] - LON0) * KX, (c[1] - LAT0) * KY]));
  const resolve = (item) => (item[0] === '#' ? +item.slice(1) : H.S.findIndex((p) => p.lname === item.toLowerCase()));
  const flat = [];
  feats.forEach((f, id) => { for (const l of f.geometry.coordinates) for (let i = 1; i < l.length; i++) flat.push(id, (l[i - 1][0] - LON0) * KX, (l[i - 1][1] - LAT0) * KY, (l[i][0] - LON0) * KX, (l[i][1] - LAT0) * KY); });
  const streetAt = (x, y, max, skip) => { // main.js streetAt
    let best = -1, bd = max;
    for (let i = 0; i < flat.length; i += 5) {
      if (flat[i] === skip) continue;
      const ax = flat[i + 1], ay = flat[i + 2], ex = flat[i + 3] - ax, ey = flat[i + 4] - ay;
      if (x < Math.min(ax, ax + ex) - max || x > Math.max(ax, ax + ex) + max || y < Math.min(ay, ay + ey) - max || y > Math.max(ay, ay + ey) + max) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
      const d = Math.hypot(ax + ex * t - x, ay + ey * t - y);
      if (d < bd) { bd = d; best = flat[i]; }
    }
    return best;
  };
  const offOf = (mx, my) => { const s = st.W.frame.S(mx, my), pr = st.W.path.project(s[0], s[1]); return pr.d + Math.max(0, st.W.path.sA - pr.s, pr.s - st.W.path.sB); };
  const dense = (L, step = 3) => { const out = []; for (let i = 1; i < L.length; i++) { const n = Math.max(1, Math.ceil(Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]) / step)); for (let k = i === 1 ? 0 : 1; k <= n; k++) out.push([L[i - 1][0] + ((L[i][0] - L[i - 1][0]) * k) / n, L[i - 1][1] + ((L[i][1] - L[i - 1][1]) * k) / n]); } return out; };
  const curMap = () => st.W.frame.M(st.goal.tx, st.goal.tz);

  // ---- the tool's own box index (independent of the lens guard's): per mesh, 10 numbers a box, 8 m cells of tile-local x/z
  const IX = new WeakMap();
  const indexOf = (mesh) => {
    let ix = IX.get(mesh);
    if (ix !== undefined) return ix;
    const g = mesh.geometry, P = g && g.attributes.position, Bt = g && g.attributes.aB;
    ix = null;
    if (P && Bt) {
      const p = P.array, t = Bt.array, n = Math.floor(P.count / 24), b = [], h = [], r = [], cells = new Map();
      for (let v = 0; v < n * 24; v += 24) {
        if (!(t[v * 4 + 2] > 0) || t[v * 4 + 3] < 0) continue; // untagged, trees
        let y0 = Infinity, y1 = -Infinity; const cs = [];
        for (let q = 0; q < 24; q++) { const o = (v + q) * 3; y0 = Math.min(y0, p[o + 1]); y1 = Math.max(y1, p[o + 1]); if (cs.length < 4 && !cs.some((c) => Math.abs(c[0] - p[o]) < 1e-3 && Math.abs(c[1] - p[o + 2]) < 1e-3)) cs.push([p[o], p[o + 2]]); }
        if (cs.length < 4) continue;
        const d = cs.slice(1).map((c) => [c[0] - cs[0][0], c[1] - cs[0][1]]).sort((a, c) => Math.hypot(a[0], a[1]) - Math.hypot(c[0], c[1]));
        const l1 = Math.hypot(d[0][0], d[0][1]), l2 = Math.hypot(d[1][0], d[1][1]);
        if (!(l1 > 1e-4)) continue;
        const cx = (cs[0][0] + cs[1][0] + cs[2][0] + cs[3][0]) / 4, cz = (cs[0][1] + cs[1][1] + cs[2][1] + cs[3][1]) / 4, k = h.length;
        b.push(cx, cz, d[0][0] / l1, d[0][1] / l1, l1 / 2, l2 / 2, y0, y1, t[v * 4], t[v * 4 + 1]);
        h.push(t[v * 4 + 2]); r.push(t[v * 4 + 3]);
        const rr = Math.hypot(l1, l2) / 2 + 1.5;
        for (let i = Math.floor((cx - rr) / G); i <= Math.floor((cx + rr) / G); i++) for (let j = Math.floor((cz - rr) / G); j <= Math.floor((cz + rr) / G); j++) {
          const kk = i * 4096 + j; let l = cells.get(kk); if (!l) cells.set(kk, (l = [])); l.push(k);
        }
      }
      if (h.length) ix = { b: Float32Array.from(b), h, r, cells };
    }
    IX.set(mesh, ix);
    return ix;
  };
  const ss = (a, b, v) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
  /** The shader's cutaway factor for a tag at scene (x, z), height h, radius r (world.js cutPatch), incl. the lens guard when present. */
  const scaleOf = (sx, sz, h, r) => {
    const F = U.uFocus.value, D = U.uCamDir.value, dx = sx - F.x, dz = sz - F.z, t = dx * D.x + dz * D.y, l = Math.hypot(dx - D.x * t, dz - D.y * t);
    const R = Math.max(r, 0), Hh = Math.max(0.3, (t - R - 7) * U.uTan.value);
    let w = U.uCut.value * ss(-1, 3, t - R * U.uHalf.value) * (1 - ss(U.uR.value, U.uR.value * 1.5, l)), k = ss(0.7, 1, Hh / h);
    if (U.uDuck && U.uDuckN) for (let i = 0; i < U.uDuckN.value; i++) { const q = U.uDuck.value[i]; if (Math.abs(q.x - sx) + Math.abs(q.y - sz) < 0.05) { w = Math.max(w, q.z); k *= 1 - q.z; } }
    return (1 + (0.22 / h + (1 - 0.22 / h) * k - 1) * w) * U.uGrow.value;
  };
  /** Which building of tile c a tag (tile-local) belongs to: the footprint (tile data) whose bounding box holds the tag and whose box
   *  centre is nearest to it (the tag is the footprint's oriented-box centre): 'b<index>', else the tag itself (a building part, a feature). */
  const nameCache = new Map();
  const nameOf = (c, tx, tz) => {
    const key = c.key + '|' + tx.toFixed(2) + ',' + tz.toFixed(2);
    if (nameCache.has(key)) return nameCache.get(key);
    let nm = c.key + ' tag(' + (c.ox + tx).toFixed(1) + ',' + (c.oy + TILE - tz).toFixed(1) + ')', bd = 1e9;
    const bs = (c.src && c.src.b) || [];
    for (let bi = 0; bi < bs.length; bi++) {
      const e = bs[bi]; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = 3; i + 1 < e.length; i += 2) { const x = e[i] / 10, z = TILE - e[i + 1] / 10; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      if (tx < x0 || tx > x1 || tz < z0 || tz > z1) continue;
      const d = Math.hypot((x0 + x1) / 2 - tx, (z0 + z1) / 2 - tz);
      if (d < bd) { bd = d; nm = c.key + ' b' + bi + (c.src.bt ? ' bt' + c.src.bt[bi] : '') + ' h' + e[0]; }
    }
    nameCache.set(key, nm);
    return nm;
  };
  let budget = 0;
  /** The lens against every visible tagged box near it at its current height: { d (m, negative inside), who }. */
  const lensCheck = () => {
    const W = st.W, cp = st.camera.position, m = W.frame.M(cp.x, cp.z), out = { d: 1e9, who: null };
    if (!W.stream) return out;
    for (const c of W.stream.live.values()) {
      if (m[0] < c.ox - 140 || m[0] > c.ox + TILE + 140 || m[1] < c.oy - 140 || m[1] > c.oy + TILE + 140) continue;
      const lx = m[0] - c.ox, lz = c.oy + TILE - m[1], key = Math.floor(lx / G) * 4096 + Math.floor(lz / G);
      const e = c.g.matrixWorld.elements;
      for (const mesh of c.g.children) {
        if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.visible || !mesh.geometry || !mesh.geometry.attributes.aB) continue;
        if (!IX.has(mesh)) { if (budget <= 0) { out.pending = true; continue; } budget--; }
        const ix = indexOf(mesh), list = ix && ix.cells.get(key);
        if (!list) continue;
        for (const k of list) {
          const o = k * 10, b = ix.b, dx = lx - b[o], dz = lz - b[o + 1];
          const ea = Math.abs(dx * b[o + 2] + dz * b[o + 3]) - b[o + 4], eb = Math.abs(-dx * b[o + 3] + dz * b[o + 2]) - b[o + 5];
          if (ea > 1.5 || eb > 1.5) continue;
          const tx = b[o + 8], tz = b[o + 9], sx = e[0] * tx + e[8] * tz + e[12], sz = e[2] * tx + e[10] * tz + e[14];
          const s = scaleOf(sx, sz, ix.h[k], ix.r[k]), base = W.city.landAt(c.ox + tx, c.oy + TILE - tz) + 0.1;
          const ey = Math.max(base + b[o + 6] * s - cp.y, cp.y - base - b[o + 7] * s), d = Math.max(ea, eb, ey);
          if (d < out.d) { out.d = d; out.c = c; out.tx = tx; out.tz = tz; }
        }
      }
    }
    if (out.c && out.d < 1) out.who = nameOf(out.c, out.tx, out.tz);
    out.c = null;
    return out;
  };

  // ---- the driver (runs before the original frame) and the counter (after it)
  const R = (window.__lensRec = { run: null, errs: [] });
  const err = (w, e) => { if (R.errs.length < 8) R.errs.push(w + ': ' + (e && e.message ? e.message : e)); };
  const pointAt = (D, s) => { let i = 1; while (i < D.cum.length - 1 && D.cum[i] < s) i++; const a = D.pts[i - 1], b = D.pts[i], len = D.cum[i] - D.cum[i - 1] || 1, u = Math.max(0, Math.min(1, (s - D.cum[i - 1]) / len)); return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; };
  const legOf = (D) => { const pts = D.pts, cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); D.cum = cum; D.len = cum[cum.length - 1]; return D; };
  /** a street walked end to end, from the end nearer to the target; the longest of its lines */
  const streetLeg = (id, cur) => {
    const L = polyMap(id).map((l) => dense(l)).sort((a, b) => b.length - a.length)[0];
    const pts = Math.hypot(L[0][0] - cur[0], L[0][1] - cur[1]) <= Math.hypot(L[L.length - 1][0] - cur[0], L[L.length - 1][1] - cur[1]) ? L : L.slice().reverse();
    return legOf({ pts: [cur, ...pts], s: 0, hopLen: Math.hypot(pts[0][0] - cur[0], pts[0][1] - cur[1]) });
  };
  /** dev-swap's step: hop to the nearest point of the street, walk away from the open street, rest where main.js would shift */
  const hopLeg = (id, cur) => {
    const lines = polyMap(id); let best = { d: 1e9, li: 0 };
    lines.forEach((l, li) => { for (let i = 1; i < l.length; i++) { const ax = l[i - 1][0], ay = l[i - 1][1], ex = l[i][0] - ax, ey = l[i][1] - ay, t = Math.max(0, Math.min(1, ((cur[0] - ax) * ex + (cur[1] - ay) * ey) / (ex * ex + ey * ey || 1))), d = Math.hypot(ax + ex * t - cur[0], ay + ey * t - cur[1]); if (d < best.d) best = { d, li }; } });
    const Ld = dense(lines[best.li]); let k0 = 0, kd = 1e9;
    Ld.forEach((p, i) => { const d = Math.hypot(p[0] - cur[0], p[1] - cur[1]); if (d < kd) { kd = d; k0 = i; } });
    const fwd = Ld.slice(k0, k0 + 150), bwd = Ld.slice(Math.max(0, k0 - 149), k0 + 1).reverse();
    const probe = (l) => (l.length ? offOf(l[Math.min(20, l.length - 1)][0], l[Math.min(20, l.length - 1)][1]) : -1);
    const walk = probe(fwd) >= probe(bwd) ? fwd : bwd, A0 = st.W.st.id, slack = st.rig.dist * 0.035, thr = 15 + slack + 6;
    const okAt = (i) => offOf(walk[i][0], walk[i][1]) >= thr && streetAt(walk[i][0], walk[i][1], 13 + slack, A0) === id;
    let stop = walk.length - 1;
    for (let i = 0; i < walk.length - 2; i++) if (okAt(i) && okAt(i + 1) && okAt(i + 2)) { stop = i; break; }
    const D = legOf({ pts: [cur, ...walk], s: 0 });
    D.hopLen = D.cum[1]; D.stopS = D.cum[stop + 1]; D.id = id; D.hold = 0; D.rested = false; D.tail = 0;
    return D;
  };
  R.start = (o) => {
    const ids = o.legs.map((x) => (Array.isArray(x) ? x : resolve(x)));
    if (ids.some((x) => x === -1)) return { error: 'unknown street in ' + JSON.stringify(o.legs) };
    if (st.mode !== 'free') st._setMode('free');
    Object.assign(st.goal, { dist: o.dist, el: o.el }); Object.assign(st.rig, { dist: o.dist, el: o.el });
    if (o.bearing !== null && o.bearing !== undefined) {
      // a compass bearing of the camera seen from the target (map terms) as an azimuth in the open street's frame
      const F = st.W.frame, a = (o.bearing * Math.PI) / 180, mx = Math.sin(a), my = Math.cos(a), sx = mx * F.dx + my * F.dy, sz = mx * F.dy - my * F.dx;
      st.goal.az = st.rig.az = Math.atan2(sx, sz);
    }
    R.run = { o, ids, li: 0, D: null, frames: 0, lensIn: 0, lensNear: 0, who: {}, shifts: 0, cutMin: 9, cutMax: -1, maxMs: 0, pending: 0, lastW: st.W, done: false, warm: 30, t0: performance.now(), log: [] };
    return { ok: true, street: st.W.st.name };
  };
  const drive = (now) => {
    const run = R.run;
    if (!run || run.done) return;
    if (st.mode !== 'free') { run.done = true; run.reason = 'mode ' + st.mode; return; }
    if (performance.now() - run.t0 > 240000) { run.done = true; run.reason = 'timeout'; return; }
    const real = Math.min(0.05, Math.max(0, (now - st.last) / 1000)), o = run.o;
    if (!run.D) {
      if (run.li >= run.ids.length) { run.done = true; run.reason = 'end'; return; }
      const x = run.ids[run.li++], cur = curMap();
      run.D = Array.isArray(x) ? legOf({ pts: [cur, x], s: 0, hopLen: 0 }) : o.hopMode ? hopLeg(x, cur) : streetLeg(x, cur);
    }
    const D = run.D;
    if (o.hopMode && D.stopS !== undefined) {
      if (!D.rested && D.s >= D.stopS) { D.hold += real; if (st.W.st.id === D.id || D.hold > 30) { D.rested = true; } }
      else if (D.rested && D.tail < 1) { D.tail += real; D.s = Math.min(D.len, D.s + o.speed * real); }
      else if (D.rested) { run.D = null; return; }
      else D.s = Math.min(D.stopS, D.s + (D.s < D.hopLen ? o.hop : o.speed) * real);
    } else {
      D.s += (D.s < D.hopLen ? (o.hop || o.speed) : o.speed) * real;
      if (D.s >= D.len) { D.s = D.len; run.D = null; }
    }
    const p = pointAt(D, Math.min(D.s, D.len)), sc = st.W.frame.S(p[0], p[1]);
    st.goal.tx = sc[0]; st.goal.tz = sc[1];
  };
  const count = (now, ms) => {
    const run = R.run;
    if (!run || run.done) return;
    if (st.W !== run.lastW) { run.lastW = st.W; run.shifts++; run.log.push({ f: run.frames, shift: st.W.st.name }); }
    if (run.warm > 0) { run.warm--; budget = 6; lensCheck(); return; } // let the index fill before counting
    budget = 3;
    const r = lensCheck();
    run.frames++;
    if (r.pending) run.pending++;
    if (ms > run.maxMs) run.maxMs = ms;
    const k = st.cutK === undefined ? -1 : st.cutK;
    run.cutMin = Math.min(run.cutMin, k); run.cutMax = Math.max(run.cutMax, k);
    if (r.d < 1) {
      run.lensNear++;
      const w = run.who[r.who] || (run.who[r.who] = { near: 0, inside: 0 });
      w.near++;
      if (r.d < 0) { run.lensIn++; w.inside++; }
      if (run.log.length < 400) run.log.push({ f: run.frames, d: Math.round(r.d * 100) / 100, who: r.who, cutK: Math.round(k * 1000) / 1000, uCut: Math.round(U.uCut.value * 1000) / 1000, duckN: U.uDuckN ? U.uDuckN.value : null, street: st.W.st.name });
    }
  };
  if (window.__lensOrig) st._frame = window.__lensOrig;
  const orig = (window.__lensOrig = st._frame);
  st._frame = function (now) {
    try { drive(now); } catch (e) { err('drive', e); }
    const t = performance.now(), ret = orig.call(this, now), ms = performance.now() - t;
    try { count(now, ms); } catch (e) { err('count', e); }
    return ret;
  };
  R.status = () => { const r = R.run; return r ? { done: r.done, reason: r.reason || null, frames: r.frames, lensIn: r.lensIn, lensNear: r.lensNear, street: st.W && st.W.st.name, errs: R.errs.slice() } : null; };
  R.result = () => { const r = R.run; return { frames: r.frames, lensIn: r.lensIn, lensNear: r.lensNear, shifts: r.shifts, cutK: [r.cutMin, r.cutMax], maxFrameMs: Math.round(r.maxMs * 10) / 10, framesWithIndexPending: r.pending, buildings: r.who, reason: r.reason, log: r.log, guard: !!U.uDuck }; };
  return { ok: true, guard: !!U.uDuck };
}

// =====================================================================================================================
// NODE SIDE
// =====================================================================================================================
const B = await launch({ width, height, dpr: 1, tag: 'lens' });
const result = { tool: 'dev-lens', started: new Date().toISOString(), args: { routes: names, width, height, time, lvl }, routes: {} };
let exitCode = 0;
try {
  for (const name of names) {
    const o = ROUTES[name];
    const opened = await B.open(o.open, { time, lvl, only: 'napCat' });
    if (!opened) { result.routes[name] = { error: 'street did not open: ' + o.open }; console.log(`${name}: street "${o.open}" did not open`); continue; }
    const inst = await B.ev(`(${pageInstall})()`);
    if (inst.error) throw new Error(inst.error);
    const s0 = await B.ev(`window.__lensRec.start(${JSON.stringify(o)})`);
    if (s0.error) { result.routes[name] = { error: s0.error }; console.log(`${name}: ${s0.error}`); continue; }
    await sleep(1500);
    for (;;) {
      await sleep(500);
      const s = await B.ev('window.__lensRec.status()');
      if (!s || s.done) break;
    }
    const r = await B.ev('window.__lensRec.result()');
    r.pageErrors = (await B.ev('window.__lensRec.status()')).errs;
    result.routes[name] = { ...o, ...r };
    const top = Object.entries(r.buildings).sort((a, b) => b[1].near - a[1].near).slice(0, 6).map(([k, v]) => `${k} (${v.inside}/${v.near})`).join('; ');
    console.log(`${name.padEnd(11)} frames ${String(r.frames).padStart(5)}  lensIn ${String(r.lensIn).padStart(4)}  lensNear ${String(r.lensNear).padStart(4)}  shifts ${r.shifts}  cutK ${r.cutK.map((x) => x.toFixed(2)).join('..')}  max frame ${r.maxFrameMs} ms  guard ${r.guard ? 'yes' : 'no'}  end: ${r.reason}${top ? '\n            buildings (inside/near): ' + top : ''}${r.pageErrors.length ? '\n            page errors: ' + r.pageErrors.join(' | ') : ''}`);
  }
  result.consoleErrors = [...new Set(B.errs)].slice(0, 20);
  result.finished = new Date().toISOString();
} catch (e) {
  console.error('dev-lens failed: ' + (e && e.stack ? e.stack : e));
  result.error = String(e && e.message ? e.message : e);
  exitCode = 1;
} finally {
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
  console.log('written: ' + outFile);
  await B.close();
  process.exitCode = exitCode;
}
