// World data pipeline for the Hague crime map: tiles + whole-city rasters + index.
// Usage: node scripts/build-world.mjs   (raw responses cached in .cache/world/, delete to refetch)
// Sources: 3DBAG WFS (buildings), OpenStreetMap via Overpass (everything else), public/data/context.geojson (land mask),
// PDOK AHN WCS (terrain, DTM 0.5 m), Gemeente Den Haag tree register (ArcGIS FeatureServer).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import bboxClip from '@turf/bbox-clip';
import { PNG } from 'pngjs';
import { fromArrayBuffer } from 'geotiff';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'world');
const OUT = path.join(ROOT, 'public', 'data', 'world');
const TILES_DIR = path.join(OUT, 'tiles');
fs.mkdirSync(CACHE, { recursive: true });

const UA = 'hague-map-builder/1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Names come from a source anyone can edit: drop control and invisible direction-changing characters and markup brackets.
const clean = (v) => String(v ?? '').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim().slice(0, 80);
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

// tunables (raise if output is too large)
const TOL_BUILD = Number(process.env.TOL_BUILD || 0.3);
const TOL_GROUND = Number(process.env.TOL_GROUND || 0.5);
const TOL_LINE = 0.3;

// ---------------------------------------------------------------- projection / extent
const LON0 = 4.30, LAT0 = 52.07, KX = 68430, KY = 111267;
const proj = (lon, lat) => [(lon - LON0) * KX, (lat - LAT0) * KY];
const EXT = [-9216, -7680, 9984, 8192]; // x0,y0,x1,y1 metres
const TILE = 256;
const TX0 = EXT[0] / TILE, TX1 = EXT[2] / TILE, TY0 = EXT[1] / TILE, TY1 = EXT[3] / TILE; // [TX0,TX1)
const W2 = (EXT[2] - EXT[0]) / 2, H2 = (EXT[3] - EXT[1]) / 2; // 2 m raster dims (9600 x 7936)
const lonOf = (x) => x / KX + LON0, latOf = (y) => y / KY + LAT0;

// approximate WGS84 -> RD New (EPSG:28992), Schreutelkamp/Strang van Hees series; only used for chunking (over-covered)
function toRD(lat, lon) {
  const dp = 0.36 * (lat - 52.1551744), dl = 0.36 * (lon - 5.38720621);
  const X = [[0, 1, 190094.945], [1, 1, -11832.228], [2, 1, -114.221], [0, 3, -32.391], [1, 0, -0.705], [3, 1, -2.34], [1, 3, -0.608], [0, 2, -0.008], [2, 3, 0.148]];
  const Y = [[1, 0, 309056.544], [0, 2, 3638.893], [2, 0, 73.077], [1, 2, -157.984], [3, 0, 59.788], [0, 1, 0.433], [2, 2, -6.439], [1, 1, -0.032], [0, 4, 0.092], [1, 4, -0.054]];
  return [155000 + X.reduce((a, [p, q, r]) => a + r * dp ** p * dl ** q, 0), 463000 + Y.reduce((a, [p, q, r]) => a + r * dp ** p * dl ** q, 0)];
}

// tiles that are emitted: bbox intersects Den Haag municipality bbox expanded by 768 m
const MUNI = { lon0: 4.19128, lon1: 4.42249, lat0: 52.01485, lat1: 52.12852 };
const [MX0, MY0] = proj(MUNI.lon0, MUNI.lat0), [MX1, MY1] = proj(MUNI.lon1, MUNI.lat1);
const EMIT = [MX0 - 768, MY0 - 768, MX1 + 768, MY1 + 768];
const tileKey = (tx, ty) => tx + '_' + ty;
const eligible = new Set();
for (let tx = TX0; tx < TX1; tx++) for (let ty = TY0; ty < TY1; ty++) {
  if (tx * TILE < EMIT[2] && (tx + 1) * TILE > EMIT[0] && ty * TILE < EMIT[3] && (ty + 1) * TILE > EMIT[1]) eligible.add(tileKey(tx, ty));
}
console.log(`world tiles ${(TX1 - TX0) * (TY1 - TY0)}, eligible for output ${eligible.size}`);

// ---------------------------------------------------------------- geometry helpers
function dpSimplify(pts, tol) {
  const n = pts.length;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = -1, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i];
      let d2;
      if (l2 === 0) d2 = (x - ax) ** 2 + (y - ay) ** 2;
      else {
        let t = ((x - ax) * dx + (y - ay) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        d2 = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
      }
      if (d2 > md) { md = d2; mi = i; }
    }
    if (md > t2) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// ring (open or closed, metres) -> open simplified ring, or null
function simplifyRingOpen(r, tol) {
  let pts = r;
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
  if (pts.length < 3) return null;
  // split closed ring at the farthest vertex so DP has two proper halves
  let fi = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) { const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (d > fd) { fd = d; fi = i; } }
  const a = dpSimplify(pts.slice(0, fi + 1), tol), b = dpSimplify(pts.slice(fi).concat([pts[0]]), tol);
  const out = a.concat(b.slice(1, -1));
  return out.length >= 3 ? out : null;
}
function ringArea(ring) { // signed->abs area m2 of a ring (open or closed)
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
}
function ringBBox(r) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
function pipRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
function chain(lines, closedOnly = false) {
  const pool = lines.filter((l) => l.length > 1).map((l) => l.slice());
  const out = [];
  while (pool.length) {
    let cur = pool.pop();
    let changed = true;
    while (changed && !(closedOnly && cur.length > 3 && same(cur[0], cur[cur.length - 1]))) {
      changed = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i];
        if (same(cur[cur.length - 1], w[0])) cur = cur.concat(w.slice(1));
        else if (same(cur[cur.length - 1], w[w.length - 1])) cur = cur.concat(w.slice(0, -1).reverse());
        else if (same(cur[0], w[w.length - 1])) cur = w.slice(0, -1).concat(cur);
        else if (same(cur[0], w[0])) cur = w.slice(1).reverse().concat(cur);
        else continue;
        pool.splice(i, 1);
        changed = true;
        break;
      }
    }
    out.push(cur);
  }
  return closedOnly ? out.filter((r) => r.length >= 4 && same(r[0], r[r.length - 1])) : out;
}
// OSM element -> polygons [outer, ...holes] in lon/lat (same logic as build-data.mjs)
function elementPolygons(el) {
  const g = (arr) => arr.map((p) => [p.lon, p.lat]);
  if (el.type === 'way') {
    if (!el.geometry || el.geometry.length < 4) return [];
    const r = g(el.geometry);
    return same(r[0], r[r.length - 1]) ? [[r]] : [];
  }
  if (el.type === 'relation') {
    const outers = [], inners = [];
    for (const m of el.members || []) {
      if (m.type !== 'way' || !m.geometry) continue;
      (m.role === 'inner' ? inners : outers).push(g(m.geometry));
    }
    const O = chain(outers, true), I = chain(inners, true);
    const polys = O.map((o) => [o]);
    const pm = polys.map((p) => p[0].map((q) => proj(q[0], q[1])));
    for (const h of I) {
      const hp = proj(h[0][0], h[0][1]);
      for (let k = 0; k < polys.length; k++) if (pipRing(hp[0], hp[1], pm[k])) { polys[k].push(h); break; }
    }
    return polys;
  }
  return [];
}

// ---------------------------------------------------------------- fetching
async function overpassQuery(cacheName, body) {
  const f = path.join(CACHE, cacheName + '.json.gz');
  if (fs.existsSync(f)) return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString());
  const q = `[out:json][timeout:300];${body}`;
  let lastErr;
  for (let round = 0; round < (process.env.MAX_ROUNDS ? Number(process.env.MAX_ROUNDS) : 4); round++) {
    for (const ep of OVERPASS) {
      try {
        console.log(`  overpass ${cacheName} via ${ep} ...`);
        const r = await fetch(ep, { method: 'POST', signal: AbortSignal.timeout(400000), headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (j.remark && /error|timed out|out of memory/i.test(j.remark)) throw new Error('remark: ' + j.remark);
        if (!Array.isArray(j.elements)) throw new Error('no elements');
        console.log(`  -> ${j.elements.length} elements`);
        const data = { elements: j.elements, timestamp: j.osm3s?.timestamp_osm_base };
        fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(data)));
        await sleep(3000);
        return data;
      } catch (e) {
        lastErr = e;
        console.log('  failed: ' + e.message);
        await sleep(5000 * (round + 1));
      }
    }
  }
  throw lastErr;
}

// 3DBAG: one gz cache file per RD chunk (all pages merged)
const BAG_PROPS = 'geom,b3_h_70p,b3_h_maaiveld,b3_dak_type,oorspronkelijkbouwjaar,b3_bouwlagen,identificatie';
const BAG_PAGE = 5000;
async function bagChunk(ci, cj, bb) {
  const f = path.join(CACHE, `bag_${ci}_${cj}.json.gz`);
  if (fs.existsSync(f)) return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString());
  const all = [];
  for (let start = 0; ; ) {
    const url = `https://data.3dbag.nl/api/BAG3D/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=BAG3D:lod12&outputFormat=application/json&srsName=EPSG:4326&bbox=${bb.map((v) => Math.round(v)).join(',')},EPSG:28992&count=${BAG_PAGE}&startIndex=${start}&propertyName=${BAG_PROPS}`;
    let j = null, lastErr;
    for (let a = 0; a < 5 && !j; a++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(180000), headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        j = await r.json();
        if (!Array.isArray(j.features)) throw new Error('no features');
      } catch (e) { lastErr = e; j = null; await sleep(3000 * (a + 1)); }
    }
    if (!j) throw lastErr;
    const n = j.features.length;
    all.push(...j.features);
    start += n;
    const nm = typeof j.numberMatched === 'number' ? j.numberMatched : null;
    if (n === 0 || (nm !== null ? start >= nm : n < BAG_PAGE)) break;
    if (start > 400000) throw new Error(`3DBAG chunk ${ci},${cj} returned an implausible number of features`); // a broken server must not page forever
    await sleep(300);
  }
  fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(all)));
  await sleep(300);
  return all;
}

// ---------------------------------------------------------------- output accumulators
const tiles = new Map(); // key -> {b,g,r,l,t,p, names:Map}
function getTile(tx, ty) {
  const k = tileKey(tx, ty);
  let t = tiles.get(k);
  if (!t) tiles.set(k, (t = { tx, ty, b: [], g: [], r: [], l: [], t: [], p: [], names: new Map() }));
  return t;
}
const inWorld = (x, y) => x >= EXT[0] && x < EXT[2] && y >= EXT[1] && y < EXT[3];
const dm = (v, o) => Math.round((v - o) * 10);
function localRing(r, ox, oy) { // metres -> dm ints relative to tile origin, consecutive duplicates removed, open
  const out = [];
  for (const [x, y] of r) {
    const a = dm(x, ox), b = dm(y, oy);
    if (out.length >= 2 && out[out.length - 2] === a && out[out.length - 1] === b) continue;
    out.push(a, b);
  }
  if (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  return out;
}

const stats = { buildings: 0, bagRaw: 0, bagDup: 0, ground: {}, roads: {}, rails: {}, trees: 0, pois: {} };
const bump = (o, k) => (o[k] = (o[k] || 0) + 1);

// ================================================================= 1. BUILDINGS (3DBAG)
console.log('[1] 3DBAG buildings');
const BUILDINGS = []; // {ring (metres, open), h} for the height raster
{
  const corners = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) corners.push(toRD(latOf(EXT[1] + ((EXT[3] - EXT[1]) * j) / 8), lonOf(EXT[0] + ((EXT[2] - EXT[0]) * i) / 8)));
  const rx0 = Math.min(...corners.map((c) => c[0])) - 200, rx1 = Math.max(...corners.map((c) => c[0])) + 200;
  const ry0 = Math.min(...corners.map((c) => c[1])) - 200, ry1 = Math.max(...corners.map((c) => c[1])) + 200;
  const CH = 2000;
  const nx = Math.ceil((rx1 - rx0) / CH), ny = Math.ceil((ry1 - ry0) / CH);
  console.log(`  RD bounds x ${rx0.toFixed(0)}..${rx1.toFixed(0)} y ${ry0.toFixed(0)}..${ry1.toFixed(0)} -> ${nx}x${ny} chunks`);
  const seen = new Set();
  for (let ci = 0; ci < nx; ci++) for (let cj = 0; cj < ny; cj++) {
    const bb = [rx0 + ci * CH, ry0 + cj * CH, rx0 + (ci + 1) * CH, ry0 + (cj + 1) * CH];
    const cached = fs.existsSync(path.join(CACHE, `bag_${ci}_${cj}.json.gz`));
    const feats = await bagChunk(ci, cj, bb);
    let add = 0;
    for (const f of feats) {
      stats.bagRaw++;
      if (seen.has(f.id)) { stats.bagDup++; continue; }
      seen.add(f.id);
      const g = f.geometry;
      if (!g) continue;
      const p = f.properties || {};
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      let h;
      if (p.b3_h_70p != null && p.b3_h_maaiveld != null) h = p.b3_h_70p - p.b3_h_maaiveld;
      else h = p.b3_bouwlagen ? p.b3_bouwlagen * 3 : 6;
      h = Math.round(Math.max(2.5, h) * 10) / 10;
      const roof = p.b3_dak_type === 'slanted' ? 1 : 0;
      const year = p.oorspronkelijkbouwjaar || 0;
      for (const poly of polys) {
        const outer = poly[0];
        if (!outer || outer.length < 4) continue;
        const ring = simplifyRingOpen(outer.map(([lo, la]) => proj(lo, la)), TOL_BUILD);
        if (!ring || ringArea(ring) < 4) continue;
        const bb2 = ringBBox(ring), cx = (bb2[0] + bb2[2]) / 2, cy = (bb2[1] + bb2[3]) / 2;
        if (!inWorld(cx, cy)) continue;
        BUILDINGS.push({ ring, h });
        stats.buildings++;
        add++;
        const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
        if (!eligible.has(tileKey(tx, ty))) continue;
        getTile(tx, ty).b.push([h, roof, year, ...localRing(ring, tx * TILE, ty * TILE)]);
      }
    }
    console.log(`  chunk ${ci},${cj}${cached ? ' (cached)' : ''}: ${feats.length} features, +${add} buildings (total ${stats.buildings})`);
  }
}

// ================================================================= 2. OVERPASS
// sub-bboxes (3 x 3) over the world extent in lat/lon, with a small margin
const S = latOf(EXT[1]) - 0.002, N = latOf(EXT[3]) + 0.002, Wl = lonOf(EXT[0]) - 0.003, E = lonOf(EXT[2]) + 0.003;
const SUBS = [];
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
  const s = S + ((N - S) * i) / 3, n = S + ((N - S) * (i + 1)) / 3, w = Wl + ((E - Wl) * j) / 3, e = Wl + ((E - Wl) * (j + 1)) / 3;
  SUBS.push([s, w, n, e].map((v) => v.toFixed(5)).join(','));
}
const rx = (arr) => '^(' + arr.join('|') + ')$';
const Q = {
  roads: (b) => `way["highway"](${b});out geom;`,
  land: (b) => {
    const sel = [
      `["natural"~"${rx(['water', 'wood', 'beach', 'sand', 'dune', 'heath', 'scrub', 'grassland'])}"]`,
      `["landuse"~"${rx(['forest', 'grass', 'meadow', 'village_green', 'recreation_ground', 'cemetery', 'allotments', 'farmland', 'basin', 'reservoir', 'greenhouse_horticulture'])}"]`,
      `["leisure"~"${rx(['park', 'garden', 'golf_course', 'dog_park', 'pitch', 'nature_reserve', 'playground'])}"]`,
      `["amenity"="parking"]`,
      `["highway"~"${rx(['pedestrian', 'footway'])}"]["area"="yes"]`,
      `["place"="square"]`,
      `["waterway"="riverbank"]`,
    ];
    return '(' + sel.map((s) => `way${s}(${b});relation${s}["type"="multipolygon"](${b});`).join('') + ');out geom;';
  },
  lines: (b) => `(way["waterway"~"${rx(['canal', 'river', 'stream', 'ditch', 'drain'])}"](${b});way["railway"~"${rx(['tram', 'rail', 'light_rail'])}"](${b}););out geom;`,
  trees: (b) => `(node["natural"="tree"](${b});way["natural"="tree_row"](${b}););out geom;`,
  pois: (b) => `(nwr["amenity"~"${rx(['bar', 'pub', 'nightclub', 'biergarten', 'coffee_shop', 'restaurant', 'fast_food', 'cafe', 'bank', 'atm', 'bicycle_parking', 'bench', 'police', 'waste_basket', 'fuel', 'place_of_worship'])}"](${b});nwr["shop"](${b});nwr["highway"="bus_stop"](${b});nwr["railway"="tram_stop"](${b}););out center;`,
};
// small layers (lines/trees/pois): use fresh per-sub-bbox Overpass caches when all exist (or FETCH_SMALL=1),
// otherwise fall back to the older, narrower caches in .cache/ (no network). Delete nothing; rerun with FETCH_SMALL=1 to upgrade.
const SMALL = ['lines', 'trees', 'pois'];
const OLD_CACHE = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, '.cache', f), 'utf8')).elements;
function fallbackElements(kind) {
  if (kind === 'lines') {
    const rail = OLD_CACHE('osm-rail.json').filter((e) => e.type === 'way' && ['tram', 'rail', 'light_rail'].includes(e.tags?.railway));
    const wat = OLD_CACHE('osm-water.json').filter((e) => e.type === 'way' && ['canal', 'river', 'stream', 'ditch', 'drain'].includes(e.tags?.waterway));
    return rail.concat(wat);
  }
  if (kind === 'trees') return OLD_CACHE('osm-trees.json').filter((e) => e.type === 'node');
  return OLD_CACHE('osm-pois.json');
}
async function eachSub(kind, fn) {
  const seen = new Set();
  if (SMALL.includes(kind) && !process.env.FETCH_SMALL && !SUBS.every((_, i) => fs.existsSync(path.join(CACHE, `${kind}_${i}.json.gz`)))) {
    console.log(`  ${kind}: using fallback caches in .cache/ (FALLBACK, narrower tags)`);
    let n = 0;
    for (const el of fallbackElements(kind)) {
      const k = el.type + '/' + el.id;
      if (seen.has(k)) continue;
      seen.add(k);
      fn(el);
      n++;
    }
    console.log(`  ${kind} fallback: ${n} elements`);
    return;
  }
  for (let i = 0; i < SUBS.length; i++) {
    const d = await overpassQuery(`${kind}_${i}`, Q[kind](SUBS[i]));
    let n = 0;
    for (const el of d.elements) {
      const k = el.type + '/' + el.id;
      if (seen.has(k)) continue;
      seen.add(k);
      fn(el);
      n++;
    }
    console.log(`  ${kind} sub ${i}: ${d.elements.length} elements, ${n} new`);
  }
}
const mpts = (geom) => geom.map((p) => proj(p.lon, p.lat));

// ---------------------------------------------------------------- classification
const GRASS_LU = ['grass', 'meadow', 'village_green', 'recreation_ground', 'cemetery'];
const GRASS_LE = ['park', 'garden', 'golf_course', 'dog_park', 'playground'];
function groundClass(t) {
  const nat = t.natural, lu = t.landuse, le = t.leisure;
  if (nat === 'water' || t.waterway === 'riverbank' || lu === 'basin' || lu === 'reservoir') return 1;
  if (nat === 'wood' || lu === 'forest') return 3;
  if (nat === 'beach' || nat === 'sand') return 4;
  if (nat === 'dune' || nat === 'heath' || nat === 'scrub') return 5;
  if (le === 'pitch') return 6;
  if (lu === 'farmland' || lu === 'allotments' || lu === 'greenhouse_horticulture') return 7;
  if (((t.highway === 'pedestrian' || t.highway === 'footway') && t.area === 'yes') || t.place === 'square') return 8;
  if (t.amenity === 'parking') return 9;
  if (GRASS_LU.includes(lu) || GRASS_LE.includes(le) || nat === 'grassland') return 2;
  if (le === 'nature_reserve') return 5;
  return 0;
}
const ROAD_CLS = {
  motorway: 1, motorway_link: 1, trunk: 1, trunk_link: 1, primary: 2, primary_link: 2, secondary: 3, secondary_link: 3, tertiary: 4, tertiary_link: 4,
  unclassified: 5, residential: 6, living_street: 7, pedestrian: 8, service: 9, cycleway: 10, footway: 11, path: 11, steps: 11, bridleway: 11, corridor: 11,
  track: 12, busway: 13, bus_guideway: 13,
};
const ROAD_W = { 1: 110, 2: 100, 3: 90, 4: 80, 5: 65, 6: 60, 7: 55, 8: 70, 9: 35, 10: 26, 11: 18, 12: 30, 13: 65 };
const CYCLE_VAL = ['lane', 'track', 'opposite_lane', 'shared_lane'];
const CYCLE_KEYS = ['cycleway', 'cycleway:left', 'cycleway:right', 'cycleway:both'];
const UNPAVED = ['unpaved', 'gravel', 'fine_gravel', 'compacted', 'dirt', 'earth', 'ground', 'sand', 'grass', 'woodchips', 'mud'];
const isTunnel = (t) => t.tunnel === 'yes' || t.tunnel === 'building_passage' || t.tunnel === 'culvert';
const isBridge = (t) => !!t.bridge && t.bridge !== 'no';

// ================================================================= 2a. GROUND POLYGONS
console.log('[2a] land cover');
const GROUND = []; // {cls, area, rings (open, metres, simplified), bb}
await eachSub('land', (el) => {
  const t = el.tags || {};
  const cls = groundClass(t);
  if (!cls) return;
  for (const poly of elementPolygons(el)) {
    const rings = [];
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const full = poly[i].map(([lo, la]) => proj(lo, la));
      const a = ringArea(full);
      const s = simplifyRingOpen(full, TOL_GROUND);
      if (i === 0) { if (!s) break; area = a; rings.push(s); }
      else { area -= a; if (s && a > 1) rings.push(s); }
    }
    if (!rings.length || area <= 0) continue;
    GROUND.push({ cls, area: Math.round(area), rings, bb: ringBBox(rings[0]) });
    bump(stats.ground, cls);
  }
});

// ================================================================= 2b. ROADS + WATERWAYS + RAILS
console.log('[2b] roads');
const ROADS = []; // {cls, w (m), name, flags, pts}
const RAILS = []; // {kind, flags, pts}
function roadFlags(t) {
  let f = 0;
  if (t.oneway === 'yes' || t.oneway === '1' || t.oneway === 'true' || t.oneway === '-1') f |= 1;
  if (isBridge(t)) f |= 2;
  if (isTunnel(t)) f |= 4;
  if (CYCLE_KEYS.some((k) => CYCLE_VAL.includes(t[k]))) f |= 8;
  if (UNPAVED.includes(t.surface)) f |= 16;
  return f;
}
function saneWidth(w) {
  if (w == null) return 0;
  const v = parseFloat(String(w).replace(',', '.'));
  return v >= 1 && v <= 40 ? Math.round(v * 10) : 0;
}
await eachSub('roads', (el) => {
  if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) return;
  const t = el.tags || {};
  const cls = ROAD_CLS[t.highway];
  if (!cls || t.area === 'yes') return;
  let pts = mpts(el.geometry);
  if (t.oneway === '-1') pts = pts.reverse();
  pts = dpSimplify(pts, TOL_LINE);
  if (pts.length < 2) return;
  let w = saneWidth(t.width);
  if (!w) { const lanes = parseInt(t.lanes); w = lanes > 0 && lanes < 12 ? lanes * 32 + 10 : ROAD_W[cls]; }
  ROADS.push({ cls, w, name: clean(t.name), flags: roadFlags(t), pts });
  bump(stats.roads, cls);
});
console.log('[2b] waterways + rails');
await eachSub('lines', (el) => {
  if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) return;
  const t = el.tags || {};
  let pts = dpSimplify(mpts(el.geometry), TOL_LINE);
  if (pts.length < 2) return;
  if (t.waterway) {
    const w = saneWidth(t.width) || (t.waterway === 'canal' || t.waterway === 'river' ? 80 : 25);
    ROADS.push({ cls: 20, w, name: clean(t.name), flags: (isBridge(t) ? 2 : 0) | (isTunnel(t) ? 4 : 0), pts });
    bump(stats.roads, 20);
  } else if (t.railway) {
    const kind = { tram: 1, rail: 2, light_rail: 3 }[t.railway];
    if (!kind) return;
    // underground tram and metro track is often tagged only with a negative layer or level
    const under = isTunnel(t) || Number(t.layer) < 0 || Number(t.level) < 0;
    RAILS.push({ kind, flags: (isBridge(t) ? 2 : 0) | (under ? 4 : 0), pts });
    bump(stats.rails, kind);
  }
});

// ================================================================= 2c. TREES
console.log('[2c] trees');
function addTree(x, y) {
  if (!inWorld(x, y)) return false;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!eligible.has(tileKey(tx, ty))) return false;
  getTile(tx, ty).t.push(dm(x, tx * TILE), dm(y, ty * TILE));
  stats.trees++;
  return true;
}
// spatial hash (2.5 m cells) of the OSM trees, so register trees can be de-duplicated against them
const DEDUP = 2.5;
const osmHash = new Map();
const hkey = (cx, cy) => cx * 100003 + cy;
function osmNear(x, y) {
  const cx = Math.floor(x / DEDUP), cy = Math.floor(y / DEDUP);
  for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) {
    const l = osmHash.get(hkey(i, j));
    if (l) for (let k = 0; k < l.length; k += 2) if ((l[k] - x) ** 2 + (l[k + 1] - y) ** 2 < DEDUP * DEDUP) return true;
  }
  return false;
}
function addOsmTree(x, y) {
  if (!addTree(x, y)) return;
  const k = hkey(Math.floor(x / DEDUP), Math.floor(y / DEDUP));
  (osmHash.get(k) || osmHash.set(k, []).get(k)).push(x, y);
}
await eachSub('trees', (el) => {
  if (el.type === 'node') { const [x, y] = proj(el.lon, el.lat); addOsmTree(x, y); return; }
  if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) return;
  const pts = mpts(el.geometry);
  let carry = 0; // distance to next tree
  addOsmTree(pts[0][0], pts[0][1]);
  carry = 8;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    let d = carry;
    while (d <= len) { addOsmTree(ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len); d += 8; }
    carry = d - len;
  }
});

stats.treesOsm = stats.trees;

// Gemeente Den Haag tree register ("Bomen met ID", ArcGIS FeatureServer on the municipal open-data portal), ~124k points, cached as one file.
const TREE_SERVICE = 'https://services1.arcgis.com/sbwSZYQOs4GMs7tr/arcgis/rest/services/Bomen_met_ID/FeatureServer/0';
async function fetchRetry(url, what, asBuffer) {
  let lastErr;
  for (let a = 0; a < 5; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180000), headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return asBuffer ? Buffer.from(await r.arrayBuffer()) : await r.json();
    } catch (e) { lastErr = e; console.log(`  ${what} failed: ${e.message}`); await sleep(3000 * (a + 1)); }
  }
  throw lastErr;
}
async function treeRegister() {
  const f = path.join(CACHE, 'trees_register.json.gz');
  if (fs.existsSync(f)) return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString());
  const q = `${TREE_SERVICE}/query?where=1%3D1&returnCountOnly=true&f=json`;
  const total = (await fetchRetry(q, 'tree count')).count;
  if (!(total > 50000 && total < 1000000)) throw new Error('implausible tree register size ' + total);
  const pts = []; // flat lon, lat
  for (let off = 0; off < total; off += 2000) {
    const u = `${TREE_SERVICE}/query?where=1%3D1&outFields=OBJECTID&orderByFields=OBJECTID&resultOffset=${off}&resultRecordCount=2000&outSR=4326&geometryPrecision=7&f=json`;
    const j = await fetchRetry(u, 'tree page ' + off);
    if (!Array.isArray(j.features)) throw new Error('no features at offset ' + off);
    for (const ft of j.features) if (ft.geometry && Number.isFinite(ft.geometry.x) && Number.isFinite(ft.geometry.y)) pts.push(ft.geometry.x, ft.geometry.y);
    await sleep(200);
  }
  if (pts.length / 2 < total * 0.95) throw new Error(`tree register incomplete: ${pts.length / 2} of ${total}`);
  fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(pts)));
  console.log(`  tree register downloaded: ${pts.length / 2} points`);
  return pts;
}
{
  const pts = await treeRegister();
  let seen = 0, dup = 0, added = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const [x, y] = proj(pts[i], pts[i + 1]);
    if (!inWorld(x, y)) continue;
    seen++;
    if (osmNear(x, y)) { dup++; continue; }
    if (addTree(x, y)) added++;
  }
  console.log(`  tree register: ${pts.length / 2} points, ${seen} in extent, ${dup} duplicates of OSM trees (<${DEDUP} m), ${added} added`);
  stats.treesRegister = added;
}

// ================================================================= 2e. TERRAIN SOURCE (AHN DTM via PDOK WCS)
console.log('[2e] AHN terrain');
const AHN_WCS = 'https://service.pdok.nl/rws/ahn/wcs/v1_0';
const AHN_CH = 2000, AHN_PX = 4; // 2 km chunks at 4 m pixels (500 x 500)
const TCELL = 4; // terrain raster cell (m); the 8 m ground grid has 2x2 terrain cells per cell
const TGW = (EXT[2] - EXT[0]) / TCELL, TGH = (EXT[3] - EXT[1]) / TCELL;
// RD position of every pixel corner of the terrain grid (lattice (TGW+1) x (TGH+1)); pixel samples interpolate between them
const LAT_X = new Float64Array((TGW + 1) * (TGH + 1)), LAT_Y = new Float64Array((TGW + 1) * (TGH + 1));
for (let r = 0; r <= TGH; r++) for (let c = 0; c <= TGW; c++) {
  const [rx, ry] = toRD(latOf(EXT[3] - r * TCELL), lonOf(EXT[0] + c * TCELL));
  LAT_X[r * (TGW + 1) + c] = rx; LAT_Y[r * (TGW + 1) + c] = ry;
}
let AHN = null; // {mos, mw, mh, rx0, mtop}
{
  let ax0 = Infinity, ax1 = -Infinity, ay0 = Infinity, ay1 = -Infinity;
  for (let i = 0; i < LAT_X.length; i++) { const x = LAT_X[i], y = LAT_Y[i]; if (x < ax0) ax0 = x; if (x > ax1) ax1 = x; if (y < ay0) ay0 = y; if (y > ay1) ay1 = y; }
  const rx0 = Math.floor((ax0 - 20) / AHN_CH) * AHN_CH, ry0 = Math.floor((ay0 - 20) / AHN_CH) * AHN_CH;
  const nx = Math.ceil((ax1 + 20 - rx0) / AHN_CH), ny = Math.ceil((ay1 + 20 - ry0) / AHN_CH);
  const cpx = AHN_CH / AHN_PX;
  const mw = nx * cpx, mh = ny * cpx, mtop = ry0 + ny * AHN_CH;
  const mos = new Float32Array(mw * mh).fill(NaN);
  // only chunks that contain a pixel of the grid
  const need = new Set();
  for (let r = 0; r <= TGH; r += 2) for (let c = 0; c <= TGW; c += 2) { // 8 m lattice spacing
    const i = r * (TGW + 1) + c;
    need.add(Math.floor((LAT_X[i] - rx0) / AHN_CH) * 1000 + Math.floor((LAT_Y[i] - ry0) / AHN_CH));
  }
  for (const [dr, dc] of [[0, 0], [TGH, 0], [0, TGW], [TGH, TGW]]) { const i = dr * (TGW + 1) + dc; need.add(Math.floor((LAT_X[i] - rx0) / AHN_CH) * 1000 + Math.floor((LAT_Y[i] - ry0) / AHN_CH)); }
  let nf = 0, ncache = 0;
  for (let ci = 0; ci < nx; ci++) for (let cj = 0; cj < ny; cj++) {
    if (!need.has(ci * 1000 + cj)) continue;
    const bb = [rx0 + ci * AHN_CH, ry0 + cj * AHN_CH, rx0 + (ci + 1) * AHN_CH, ry0 + (cj + 1) * AHN_CH];
    const f = path.join(CACHE, `ahn_${ci}_${cj}.tif`);
    if (fs.existsSync(f)) ncache++;
    else {
      const url = `${AHN_WCS}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=dtm_05m&FORMAT=image/tiff&SUBSET=x(${bb[0]},${bb[2]})&SUBSET=y(${bb[1]},${bb[3]})&SCALEFACTOR=${0.5 / AHN_PX}`;
      let buf = null, lastErr;
      for (let a = 0; a < 5 && !buf; a++) {
        const b = await fetchRetry(url, `ahn ${ci},${cj}`, true);
        if (b.length > 8 && b[0] === 0x49 && b[1] === 0x49 && b[2] === 42) buf = b; // little-endian TIFF magic; otherwise an OGC exception document
        else { lastErr = new Error('not a TIFF: ' + b.subarray(0, 200).toString()); await sleep(3000 * (a + 1)); }
      }
      if (!buf) throw lastErr;
      fs.writeFileSync(f, buf);
      await sleep(300);
    }
    nf++;
    const raw = fs.readFileSync(f);
    const img = await (await fromArrayBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))).getImage();
    const w = img.getWidth(), h = img.getHeight(), ibb = img.getBoundingBox();
    if (w !== cpx || h !== cpx || Math.abs(ibb[0] - bb[0]) > 0.01 || Math.abs(ibb[3] - bb[3]) > 0.01 || Math.abs(ibb[2] - bb[2]) > 0.01 || Math.abs(ibb[1] - bb[1]) > 0.01) throw new Error(`ahn chunk ${ci},${cj}: unexpected size/extent ${w}x${h} ${ibb}`);
    const data = (await img.readRasters({ interleave: true }));
    const col0 = ci * cpx, row0 = (ny - 1 - cj) * cpx;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const v = data[r * w + c];
      mos[(row0 + r) * mw + col0 + c] = v > -50 && v < 400 ? v : NaN; // nodata is float max
    }
  }
  console.log(`  AHN DTM: ${nf} chunks (${ncache} cached), mosaic ${mw}x${mh} at ${AHN_PX} m`);
  AHN = { mos, mw, mh, rx0, mtop };
}

// ================================================================= 2d. POIs
console.log('[2d] pois');
function poiKind(t) {
  const a = t.amenity;
  if (['bar', 'pub', 'nightclub', 'biergarten'].includes(a)) return 1;
  if (['restaurant', 'cafe', 'fast_food'].includes(a)) return 2;
  if (a === 'coffee_shop') return 6;
  if (a === 'bank' || a === 'atm') return 5;
  if (a === 'bicycle_parking') return 7;
  if (a === 'bench') return 8;
  if (a === 'police') return 10;
  if (a === 'fuel') return 12;
  if (a === 'place_of_worship') return 14;
  if (a === 'waste_basket') return 15;
  if (t.shop) return t.shop === 'supermarket' || t.shop === 'convenience' ? 4 : 3;
  if (t.highway === 'bus_stop' || t.railway === 'tram_stop') return 9;
  return 0;
}
await eachSub('pois', (el) => {
  const lon = el.type === 'node' ? el.lon : el.center?.lon, lat = el.type === 'node' ? el.lat : el.center?.lat;
  if (lon == null) return;
  const kind = poiKind(el.tags || {});
  if (!kind) return;
  const [x, y] = proj(lon, lat);
  if (!inWorld(x, y)) return;
  bump(stats.pois, kind);
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!eligible.has(tileKey(tx, ty))) return;
  getTile(tx, ty).p.push([kind, dm(x, tx * TILE), dm(y, ty * TILE)]);
});

// ================================================================= 3. TILE CLIPPING
console.log('[3] clipping ground / roads / rails into tiles');
const PAD = 2;
function tileRange(bb) {
  return [Math.max(TX0, Math.floor((bb[0] - PAD) / TILE)), Math.min(TX1 - 1, Math.floor((bb[2] + PAD) / TILE)), Math.max(TY0, Math.floor((bb[1] - PAD) / TILE)), Math.min(TY1 - 1, Math.floor((bb[3] + PAD) / TILE))];
}
const clipRing = (ring, cb) => bboxClip({ type: 'Polygon', coordinates: [[...ring, ring[0]]] }, cb).geometry.coordinates[0];
for (const g of GROUND) {
  const [a, b, c, d] = tileRange(g.bb);
  for (let tx = a; tx <= b; tx++) for (let ty = c; ty <= d; ty++) {
    if (!eligible.has(tileKey(tx, ty))) continue;
    const ox = tx * TILE, oy = ty * TILE, cb = [ox - PAD, oy - PAD, ox + TILE + PAD, oy + TILE + PAD];
    const entry = [g.cls, g.area];
    for (let i = 0; i < g.rings.length; i++) {
      let r = g.rings[i];
      const bb = i === 0 ? g.bb : ringBBox(r);
      if (bb[2] < cb[0] || bb[0] > cb[2] || bb[3] < cb[1] || bb[1] > cb[3]) { if (i === 0) break; continue; }
      if (!(bb[0] >= cb[0] && bb[2] <= cb[2] && bb[1] >= cb[1] && bb[3] <= cb[3])) {
        const cl = clipRing(r, cb);
        if (!cl || cl.length < 4) { if (i === 0) break; continue; }
        r = cl.slice(0, -1);
      }
      const lr = localRing(r, ox, oy);
      if (lr.length < 6) { if (i === 0) break; continue; }
      entry.push(lr);
    }
    if (entry.length > 2) getTile(tx, ty).g.push(entry);
  }
}
function clipLine(pts, cb) { // -> array of point-arrays
  const res = bboxClip({ type: 'LineString', coordinates: pts }, cb).geometry;
  if (!res.coordinates.length) return [];
  return res.type === 'LineString' ? [res.coordinates] : res.coordinates;
}
function eachLinePiece(pts, cb) {
  const bb = ringBBox(pts);
  const [a, b, c, d] = tileRange(bb);
  for (let tx = a; tx <= b; tx++) for (let ty = c; ty <= d; ty++) {
    if (!eligible.has(tileKey(tx, ty))) continue;
    const ox = tx * TILE, oy = ty * TILE, box = [ox - PAD, oy - PAD, ox + TILE + PAD, oy + TILE + PAD];
    const inside = bb[0] >= box[0] && bb[2] <= box[2] && bb[1] >= box[1] && bb[3] <= box[3];
    for (const piece of inside ? [pts] : clipLine(pts, box)) {
      const lr = localRing(piece, ox, oy);
      if (lr.length >= 4) cb(getTile(tx, ty), lr);
    }
  }
}
for (const r of ROADS) {
  eachLinePiece(r.pts, (tile, lr) => {
    let ni = -1;
    if (r.name) {
      ni = tile.names.get(r.name);
      if (ni === undefined) tile.names.set(r.name, (ni = tile.names.size));
    }
    tile.r.push([r.cls, r.w, ni, r.flags, ...lr]);
  });
}
for (const r of RAILS) eachLinePiece(r.pts, (tile, lr) => tile.l.push([r.kind, r.flags, ...lr]));

// ================================================================= 4. WRITE TILES
console.log('[4] writing tiles');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(TILES_DIR, { recursive: true });
const tileList = [];
let largest = { k: '', size: 0 }, tilesBytes = 0;
for (const k of [...tiles.keys()].sort()) {
  const t = tiles.get(k);
  const o = {};
  if (t.b.length) o.b = t.b;
  if (t.g.length) o.g = t.g;
  if (t.r.length) o.r = t.r;
  if (t.l.length) o.l = t.l;
  if (t.t.length) o.t = t.t;
  if (t.p.length) o.p = t.p;
  if (!Object.keys(o).length) continue;
  if (t.names.size) o.n = [...t.names.keys()];
  const s = JSON.stringify(o);
  fs.writeFileSync(path.join(TILES_DIR, k + '.json'), s);
  tileList.push(k);
  tilesBytes += s.length;
  if (s.length > largest.size) largest = { k, size: s.length };
}

// ================================================================= 5. RASTERS
console.log('[5] rasters');
// scanline even-odd fill; sample at cell centres. grid rows: row 0 = north edge (y = EXT[3]); cols: col 0 = west edge.
function fillRings(rings, arr, W, H, cell, val) {
  let ymin = Infinity, ymax = -Infinity;
  for (const r of rings) for (const p of r) { if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1]; }
  // row r centre y = EXT[3] - (r + 0.5) * cell
  let r0 = Math.max(0, Math.ceil((EXT[3] - ymax) / cell - 0.5)), r1 = Math.min(H - 1, Math.floor((EXT[3] - ymin) / cell - 0.5));
  if (r1 < r0) return;
  const xs = new Array(r1 - r0 + 1);
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [x1, y1] = r[j], [x2, y2] = r[i];
      if (y1 === y2) continue;
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
      const ra = Math.max(r0, Math.ceil((EXT[3] - hi) / cell - 0.5)), rb = Math.min(r1, Math.floor((EXT[3] - lo) / cell - 0.5));
      for (let row = ra; row <= rb; row++) {
        const y = EXT[3] - (row + 0.5) * cell;
        if (!((y1 > y) !== (y2 > y))) continue;
        const x = x1 + ((y - y1) * (x2 - x1)) / (y2 - y1);
        (xs[row - r0] || (xs[row - r0] = [])).push(x);
      }
    }
  }
  for (let row = r0; row <= r1; row++) {
    const l = xs[row - r0];
    if (!l) continue;
    l.sort((p, q) => p - q);
    for (let k = 0; k + 1 < l.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((l[k] - EXT[0]) / cell - 0.5)), c1 = Math.min(W - 1, Math.floor((l[k + 1] - EXT[0]) / cell - 0.5));
      if (c1 >= c0) arr.fill(val, row * W + c0, row * W + c1 + 1);
    }
  }
}
// thick polyline (capsules), distance tested at cell centres
function drawLine(pts, hw, arr, W, H, cell, val) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw - EXT[0]) / cell)), c1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + hw - EXT[0]) / cell));
    const r0 = Math.max(0, Math.floor((EXT[3] - Math.max(ay, by) - hw) / cell)), r1 = Math.min(H - 1, Math.ceil((EXT[3] - Math.min(ay, by) + hw) / cell));
    const hw2 = hw * hw;
    for (let row = r0; row <= r1; row++) {
      const py = EXT[3] - (row + 0.5) * cell;
      for (let col = c0; col <= c1; col++) {
        const px = EXT[0] + (col + 0.5) * cell;
        let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + t * dx - px, ey = ay + t * dy - py;
        if (ex * ex + ey * ey <= hw2) arr[row * W + col] = val;
      }
    }
  }
}

// 5a. ground raster at 2 m
let GROUND8 = null, TERRAIN = null; // 8 m ground classes, reused by the terrain raster
const G2 = new Uint8Array(W2 * H2).fill(10); // sea
{
  const ctx = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'context.geojson'), 'utf8'));
  let n = 0;
  for (const f of ctx.features) {
    if (f.properties.kind !== 'land') continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) { fillRings(p.map((r) => r.map(([lo, la]) => proj(lo, la))), G2, W2, H2, 2, 0); n++; }
  }
  console.log(`  land mask: ${n} polygons`);
}
{
  const ordered = GROUND.filter((g) => g.cls !== 1).sort((a, b) => b.area - a.area).concat(GROUND.filter((g) => g.cls === 1).sort((a, b) => b.area - a.area));
  for (const g of ordered) fillRings(g.rings, G2, W2, H2, 2, g.cls);
  for (const r of RAILS) if (r.kind === 2 && !(r.flags & 4)) drawLine(r.pts, 2, G2, W2, H2, 2, 13);
  const road = (lo, hi, v) => { for (const r of ROADS) if (r.cls >= lo && r.cls <= hi && !(r.flags & 4)) drawLine(r.pts, Math.max(4, r.w / 10) / 2, G2, W2, H2, 2, v); };
  road(5, 8, 12);
  road(1, 4, 11);
}
{
  const GW = W2 / 4, GH = H2 / 4;
  const out = new Uint8Array(GW * GH);
  const cnt = new Uint8Array(16);
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    cnt.fill(0);
    for (let j = 0; j < 4; j++) { const base = (r * 4 + j) * W2 + c * 4; for (let i = 0; i < 4; i++) cnt[G2[base + i]]++; }
    let v;
    if (cnt[1] >= 5) v = 1;
    else if (cnt[11] >= 4) v = 11;
    else if (cnt[12] >= 6) v = 12;
    else { v = 0; let m = -1; for (let k = 0; k < 14; k++) if (cnt[k] > m) { m = cnt[k]; v = k; } }
    out[r * GW + c] = v;
  }
  const png = new PNG({ width: GW, height: GH, colorType: 0, inputColorType: 0, inputHasAlpha: false });
  png.data = Buffer.from(out.buffer);
  GROUND8 = out;
  fs.writeFileSync(path.join(OUT, 'city-ground.png'), PNG.sync.write(png, { colorType: 0, inputColorType: 0, inputHasAlpha: false }));
  console.log(`  city-ground.png ${GW}x${GH}`);
}
// 5b. height raster
{
  const H2m = new Uint16Array(W2 * H2); // decimetres, 0 = no building
  for (const b of BUILDINGS) fillRings([b.ring], H2m, W2, H2, 2, Math.round(b.h * 10));
  const HW = W2 / 8, HH = H2 / 8;
  const rgb = Buffer.alloc(HW * HH * 3);
  for (let r = 0; r < HH; r++) for (let c = 0; c < HW; c++) {
    let n = 0, sum = 0;
    for (let j = 0; j < 8; j++) { const base = (r * 8 + j) * W2 + c * 8; for (let i = 0; i < 8; i++) { const v = H2m[base + i]; if (v) { n++; sum += v; } } }
    const cov = n / 64, o = (r * HW + c) * 3;
    rgb[o] = cov < 0.2 ? 0 : Math.max(1, Math.min(255, Math.round(sum / n / 10)));
    rgb[o + 1] = Math.round(cov * 255);
  }
  const png = new PNG({ width: HW, height: HH, colorType: 2, inputColorType: 2, inputHasAlpha: false });
  png.data = rgb;
  fs.writeFileSync(path.join(OUT, 'city-height.png'), PNG.sync.write(png, { colorType: 2, inputColorType: 2, inputHasAlpha: false }));
  console.log(`  city-height.png ${HW}x${HH}`);
}

// 5c. terrain raster (AHN DTM, 4 m cells, 8-bit: v <= 200 -> -4 + 0.05 v, else 6 + 0.4 (v - 200))
{
  const GW = TGW, GH = TGH, N = GW * GH;
  const { mos, mw, mh, rx0, mtop } = AHN;
  const GWG = GW / 2; // ground grid (8 m) width; terrain cell (r, c) lies in ground cell (r >> 1, c >> 1)
  const GT = new Uint8Array(N); // ground class per terrain cell
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) GT[r * GW + c] = GROUND8[(r >> 1) * GWG + (c >> 1)];
  const mosAt = (x, y) => {
    const c = Math.floor((x - rx0) / AHN_PX), r = Math.floor((mtop - y) / AHN_PX);
    return c >= 0 && c < mw && r >= 0 && r < mh ? mos[r * mw + c] : NaN;
  };
  let h = new Float32Array(N).fill(NaN);
  const buf = [0, 0, 0, 0];
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    const i00 = r * (GW + 1) + c, i01 = i00 + 1, i10 = i00 + GW + 1, i11 = i10 + 1;
    let n = 0;
    for (const [fu, fv] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) { // bilinear inside the pixel, 4 sub-samples
      const x = (LAT_X[i00] * (1 - fu) + LAT_X[i01] * fu) * (1 - fv) + (LAT_X[i10] * (1 - fu) + LAT_X[i11] * fu) * fv;
      const y = (LAT_Y[i00] * (1 - fu) + LAT_Y[i01] * fu) * (1 - fv) + (LAT_Y[i10] * (1 - fu) + LAT_Y[i11] * fu) * fv;
      const v = mosAt(x, y);
      if (v === v) buf[n++] = v;
    }
    if (n) {
      const s = buf.slice(0, n).sort((a, b) => a - b);
      h[r * GW + c] = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    }
  }
  const SEA = 10;
  let holes = 0, seaHoles = 0;
  for (let i = 0; i < N; i++) if (h[i] !== h[i]) { if (GT[i] === SEA) { h[i] = 0; seaHoles++; } else holes++; }
  // fill remaining holes by iterative neighbour averaging (dilation)
  let pass = 0;
  for (let left = holes; left > 0 && pass < 2000; pass++) {
    const nh = Float32Array.from(h);
    let filled = 0;
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
      const i = r * GW + c;
      if (h[i] === h[i]) continue;
      let s = 0, k = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= GH || cc < 0 || cc >= GW) continue;
        const v = h[rr * GW + cc];
        if (v === v) { s += v; k++; }
      }
      if (k) { nh[i] = s / k; filled++; }
    }
    h = nh;
    left -= filled;
    if (!filled) break;
  }
  let unfilled = 0;
  for (let i = 0; i < N; i++) if (h[i] !== h[i]) { h[i] = 0; unfilled++; }
  console.log(`  terrain: ${holes} land holes + ${seaHoles} sea holes, filled in ${pass} passes, ${unfilled} left`);
  // 5x5 median (20 m, was 3x3 at 8 m), then a light blur in both directions: four [1 2 1] passes (same spread in metres as one pass at 8 m)
  const at = (a, r, c) => a[Math.min(GH - 1, Math.max(0, r)) * GW + Math.min(GW - 1, Math.max(0, c))];
  const med = new Float32Array(N), w25 = new Float32Array(25);
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    let k = 0;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) w25[k++] = at(h, r + dr, c + dc);
    w25.sort();
    med[r * GW + c] = w25[12];
  }
  let bl = med;
  for (let pass2 = 0; pass2 < 4; pass2++) {
    const tmp = new Float32Array(N), nb = new Float32Array(N);
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) tmp[r * GW + c] = (at(bl, r, c - 1) + 2 * at(bl, r, c) + at(bl, r, c + 1)) / 4;
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) nb[r * GW + c] = (at(tmp, r - 1, c) + 2 * at(tmp, r, c) + at(tmp, r + 1, c)) / 4;
    bl = nb;
  }
  // sea = 0 m; land cells within BLEND cells (32 m) of the sea fade towards 0 (chamfer distance in cells)
  const BLEND = 8;
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = GT[i] === SEA ? 0 : 99;
  const D1 = 1, D2 = Math.SQRT2;
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    const i = r * GW + c;
    let d = dist[i];
    if (c > 0) d = Math.min(d, dist[i - 1] + D1);
    if (r > 0) { d = Math.min(d, dist[i - GW] + D1); if (c > 0) d = Math.min(d, dist[i - GW - 1] + D2); if (c < GW - 1) d = Math.min(d, dist[i - GW + 1] + D2); }
    dist[i] = d;
  }
  for (let r = GH - 1; r >= 0; r--) for (let c = GW - 1; c >= 0; c--) {
    const i = r * GW + c;
    let d = dist[i];
    if (c < GW - 1) d = Math.min(d, dist[i + 1] + D1);
    if (r < GH - 1) { d = Math.min(d, dist[i + GW] + D1); if (c < GW - 1) d = Math.min(d, dist[i + GW + 1] + D2); if (c > 0) d = Math.min(d, dist[i + GW - 1] + D2); }
    dist[i] = d;
  }
  const png8 = new Uint8Array(N);
  TERRAIN = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let v = bl[i];
    if (GT[i] === SEA) v = 0;
    else if (dist[i] < BLEND) v *= dist[i] / BLEND;
    TERRAIN[i] = v;
    png8[i] = v <= 6 ? Math.max(0, Math.min(200, Math.round((v + 4) / 0.05))) : Math.min(255, 200 + Math.round((v - 6) / 0.4));
  }
  const png = new PNG({ width: GW, height: GH, colorType: 0, inputColorType: 0, inputHasAlpha: false });
  png.data = Buffer.from(png8.buffer);
  fs.writeFileSync(path.join(OUT, 'city-terrain.png'), PNG.sync.write(png, { colorType: 0, inputColorType: 0, inputHasAlpha: false }));
  console.log(`  city-terrain.png ${GW}x${GH}`);
}

// ================================================================= 6. INDEX
const index = {
  proj: { lon0: LON0, lat0: LAT0, kx: KX, ky: KY },
  extent: EXT, tile: TILE, tiles: tileList,
  ground: { file: 'city-ground.png', cell: 8, w: W2 / 4, h: H2 / 4 },
  height: { file: 'city-height.png', cell: 16, w: W2 / 8, h: H2 / 8 },
  terrain: { file: 'city-terrain.png', cell: TCELL, w: TGW, h: TGH, enc: [-4, 0.05, 200, 6, 0.4] },
  sources: [
    { name: '3DBAG (TU Delft / Kadaster) building footprints and heights, WFS', url: 'https://data.3dbag.nl/' },
    { name: 'OpenStreetMap contributors via Overpass API (ODbL)', url: 'https://overpass-api.de/' },
    { name: 'CBS/PDOK Wijken en buurten (municipality land mask)', url: 'https://service.pdok.nl/cbs/wijkenbuurten/2025/wfs/v1_0' },
    { name: 'AHN DTM 0.5 m (Rijkswaterstaat / Het Waterschapshuis, CC0) via PDOK WCS', url: 'https://service.pdok.nl/rws/ahn/wcs/v1_0' },
    { name: 'Bomen (Gemeente Den Haag tree register, open data, CC0 1.0; layer "Bomen met ID")', url: 'https://services1.arcgis.com/sbwSZYQOs4GMs7tr/arcgis/rest/services/Bomen_met_ID/FeatureServer/0' },
  ],
  generated: new Date().toISOString(),
};
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));

// ================================================================= report
let total = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : (total += fs.statSync(p).size); } })(OUT);
console.log('---- report');
console.log(`3DBAG raw features ${stats.bagRaw} (dups ${stats.bagDup}); buildings kept ${stats.buildings}`);
console.log('ground polygons per class', JSON.stringify(stats.ground));
console.log('roads per class', JSON.stringify(stats.roads));
console.log('rails per kind', JSON.stringify(stats.rails));
console.log(`trees in tiles ${stats.trees} (OSM ${stats.treesOsm}, register ${stats.treesRegister}); pois (world) per kind ${JSON.stringify(stats.pois)}`);
console.log(`tiles written ${tileList.length}; tile json ${(tilesBytes / 1e6).toFixed(1)} MB; largest ${largest.k} ${(largest.size / 1e6).toFixed(2)} MB; world dir total ${(total / 1e6).toFixed(1)} MB`);
