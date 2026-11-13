// Data pipeline for the Hague crime map.
// Usage: node scripts/build-data.mjs        (raw responses cached in .cache/, delete to refetch)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import polylabel from 'polylabel';
import bboxClip from '@turf/bbox-clip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, 'public', 'data');
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const UA = 'hague-map-builder/1.0';
const GEOM_YEAR = 2025;
const PDOK = `https://service.pdok.nl/cbs/wijkenbuurten/${GEOM_YEAR}/wfs/v1_0`;
const ODATA = 'https://dataderden.cbs.nl/ODataApi/OData/47018NED';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
// south, west, north, east
const BB = [51.98, 4.15, 52.15, 4.47];
const BBS = BB.join(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Names come from sources anyone can edit: drop control and invisible direction-changing characters and markup brackets.
const clean = (v) => String(v ?? '').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim().slice(0, 80);

// ---------------------------------------------------------------- fetching
async function cachedJson(name, fn) {
  const f = path.join(CACHE, name);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const data = await fn();
  fs.writeFileSync(f, JSON.stringify(data));
  return data;
}
async function getJson(url, opts = {}) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(180000), headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (a === 3) throw e;
      await sleep(2000 * (a + 1));
    }
  }
}
function wfsUrl(layer, filterXml) {
  const p = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', typeName: 'wijkenbuurten:' + layer, outputFormat: 'application/json', srsName: 'EPSG:4326', filter: filterXml });
  return PDOK + '?' + p;
}
const fesNs = 'xmlns="http://www.opengis.net/fes/2.0" xmlns:gml="http://www.opengis.net/gml/3.2"';
const FILTER_DH = `<Filter ${fesNs}><PropertyIsEqualTo><ValueReference>gemeentecode</ValueReference><Literal>GM0518</Literal></PropertyIsEqualTo></Filter>`;
const FILTER_BBOX = `<Filter ${fesNs}><BBOX><ValueReference>geom</ValueReference><gml:Envelope srsName="urn:ogc:def:crs:OGC:1.3:CRS84"><gml:lowerCorner>${BB[1]} ${BB[0]}</gml:lowerCorner><gml:upperCorner>${BB[3]} ${BB[2]}</gml:upperCorner></gml:Envelope></BBOX></Filter>`;

async function overpass(name, body) {
  return cachedJson(name + '.json', async () => {
    const q = `[out:json][timeout:300];${body}`;
    let lastErr;
    for (let round = 0; round < 3; round++) {
      for (const ep of OVERPASS) {
        try {
          console.log(`  overpass ${name} via ${ep} ...`);
          const r = await fetch(ep, { method: 'POST', signal: AbortSignal.timeout(400000), headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const j = await r.json();
          if (j.remark && /error|timed out|out of memory/i.test(j.remark)) throw new Error('remark: ' + j.remark);
          if (!Array.isArray(j.elements)) throw new Error('no elements');
          console.log(`  -> ${j.elements.length} elements`);
          return { elements: j.elements, timestamp: j.osm3s?.timestamp_osm_base };
        } catch (e) {
          lastErr = e;
          console.log('  failed: ' + e.message);
          await sleep(5000 * (round + 1));
        }
      }
    }
    throw lastErr;
  });
}

// ---------------------------------------------------------------- geometry helpers
const LAT0 = 52.07, LON0 = 4.3;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 110574;
const proj = ([lon, lat]) => [(lon - LON0) * KX, (lat - LAT0) * KY];
const unproj = ([x, y]) => [x / KX + LON0, y / KY + LAT0];
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const rLL = (p) => [r5(p[0]), r5(p[1])];

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
function dedupe(pts) {
  const o = [];
  for (const p of pts) if (!o.length || o[o.length - 1][0] !== p[0] || o[o.length - 1][1] !== p[1]) o.push(p);
  return o;
}
// lon/lat line -> simplified rounded lon/lat line (or null)
function simplifyLine(ll, tol) {
  const s = dpSimplify(ll.map(proj), tol).map(unproj).map(rLL);
  const d = dedupe(s);
  return d.length >= 2 ? d : null;
}
function simplifyRing(ll, tol) {
  const s = dpSimplify(ll.map(proj), tol).map(unproj).map(rLL);
  const d = dedupe(s);
  if (d.length && (d[0][0] !== d[d.length - 1][0] || d[0][1] !== d[d.length - 1][1])) d.push(d[0]);
  return d.length >= 4 ? d : null;
}
function ringArea(ring) { // projected ring, abs area m2
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
}
function pipRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function pipPoly(x, y, rings) {
  if (!pipRing(x, y, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (pipRing(x, y, rings[i])) return false;
  return true;
}
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return x * x + y * y;
}
const ckey = (gx, gy) => (gx + 8000) * 20000 + (gy + 8000);

class SegGrid {
  constructor(cell = 100) { this.c = cell; this.m = new Map(); this.s = []; }
  addLine(pts) { for (let i = 0; i + 1 < pts.length; i++) this.add(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); }
  add(ax, ay, bx, by) {
    const idx = this.s.length / 4;
    this.s.push(ax, ay, bx, by);
    const c = this.c;
    const x0 = Math.floor(Math.min(ax, bx) / c), x1 = Math.floor(Math.max(ax, bx) / c);
    const y0 = Math.floor(Math.min(ay, by) / c), y1 = Math.floor(Math.max(ay, by) / c);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const k = ckey(gx, gy);
      let l = this.m.get(k);
      if (!l) this.m.set(k, (l = []));
      l.push(idx);
    }
  }
  within(x, y, r) {
    const c = this.c, r2 = r * r, s = this.s;
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++)
      for (let gy = Math.floor((y - r) / c); gy <= Math.floor((y + r) / c); gy++) {
        const l = this.m.get(ckey(gx, gy));
        if (!l) continue;
        for (const i of l) if (segDist2(x, y, s[4 * i], s[4 * i + 1], s[4 * i + 2], s[4 * i + 3]) <= r2) return true;
      }
    return false;
  }
}
class PointGrid {
  constructor(cell = 40) { this.c = cell; this.m = new Map(); }
  add(x, y, item) {
    const k = ckey(Math.floor(x / this.c), Math.floor(y / this.c));
    let l = this.m.get(k);
    if (!l) this.m.set(k, (l = []));
    l.push({ x, y, item });
  }
  near(x, y, r, cb) {
    const c = this.c, r2 = r * r;
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++)
      for (let gy = Math.floor((y - r) / c); gy <= Math.floor((y + r) / c); gy++) {
        const l = this.m.get(ckey(gx, gy));
        if (l) for (const p of l) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= r2) cb(p.item);
      }
  }
}
class PolyIndex {
  constructor(cell = 200) { this.c = cell; this.m = new Map(); this.polys = []; }
  add(rings, data) { // rings projected
    const o = rings[0];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of o) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const idx = this.polys.length;
    this.polys.push({ rings, data, x0, y0, x1, y1 });
    const c = this.c;
    for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) for (let gy = Math.floor(y0 / c); gy <= Math.floor(y1 / c); gy++) {
      const k = ckey(gx, gy);
      let l = this.m.get(k);
      if (!l) this.m.set(k, (l = []));
      l.push(idx);
    }
  }
  find(x, y) {
    const l = this.m.get(ckey(Math.floor(x / this.c), Math.floor(y / this.c)));
    if (!l) return null;
    for (const i of l) {
      const p = this.polys[i];
      if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;
      if (pipPoly(x, y, p.rings)) return p.data;
    }
    return null;
  }
}

// join line pieces end-to-end where endpoints coincide exactly
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
// OSM element (way/relation with geometry) -> array of polygons, each [outer, ...holes] in lon/lat
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
    for (const h of I) {
      const hp = proj(h[0]);
      for (const p of polys) if (pipRing(hp[0], hp[1], p[0].map(proj))) { p.push(h); break; }
    }
    return polys;
  }
  return [];
}

// ---------------------------------------------------------------- 1. buurten geometry + crime
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const LEVEL_NAMES = ['', 'Sleepy', 'Mild', 'Spicy', 'Rowdy', 'Mayhem'];
const levelOf = (s) => (s < 25 ? 1 : s < 50 ? 2 : s < 72 ? 3 : s < 89 ? 4 : 5);

const CRIME_LABEL = {
  '1.1.1': 'Burglary', '1.1.2': 'Shed/garage burglary', '1.2.1': 'Car break-in', '1.2.2': 'Car theft', '1.2.3': 'Bike theft',
  '1.2.4': 'Pickpocketing', '1.2.5': 'Vehicle theft', '1.3.1': 'Road accidents', '1.4.1': 'Sex offences', '1.4.2': 'Homicide',
  '1.4.3': 'Public violence', '1.4.4': 'Threats', '1.4.5': 'Assault', '1.4.6': 'Street robbery', '1.4.7': 'Armed robbery',
  '1.5.2': 'Boat theft', '1.6.1': 'Arson', '1.6.2': 'Property crime', '1.6.3': 'Human trafficking', '2.1.1': 'Drug offences',
  '2.2.1': 'Vandalism', '2.4.1': 'Neighbour disputes', '2.4.2': 'Trespassing', '2.5.1': 'Business burglary', '2.5.2': 'Shoplifting',
  '2.7.2': 'Special laws', '2.7.3': 'Nuisance', '3.1.1': 'Drug offences', '3.1.3': 'Weapons offences', '3.5.2': 'Drink driving',
  '3.6.4': 'Public disorder', '3.7.1': 'Discrimination', '3.7.4': 'Cybercrime', '3.9.1': 'Fraud', '3.9.2': 'Fraud', '3.9.3': 'Fraud',
};

async function loadBuurten() {
  console.log('[1] buurten + crime');
  const bj = await cachedJson('buurten.json', () => getJson(wfsUrl('buurten', FILTER_DH)));
  const wj = await cachedJson('wijken.json', () => getJson(wfsUrl('wijken', FILTER_DH)));
  if (bj.features.length >= 1000) throw new Error('buurten WFS truncated');
  const wijkName = new Map(wj.features.map((f) => [f.properties.wijkcode, clean(f.properties.wijknaam)]));

  // crime table: pick latest complete year
  const periods = (await getJson(`${ODATA}/Perioden`)).value.map((p) => p.Key).filter((k) => /JJ00$/.test(k)).sort();
  let year = null, rows = null;
  for (const per of periods.reverse()) {
    const r = await cachedJson(`crime-${per}.json`, async () => {
      let url = `${ODATA}/TypedDataSet?$filter=${encodeURIComponent(`startswith(WijkenEnBuurten,'BU0518') and Perioden eq '${per}'`)}`;
      const all = [];
      while (url) { const j = await getJson(url); all.push(...j.value); url = j['odata.nextLink']; }
      return all;
    });
    const tot = r.filter((x) => x.SoortMisdrijf.trim() === '0.0.0').reduce((s, x) => s + (x.GeregistreerdeMisdrijven_1 || 0), 0);
    console.log(`  period ${per}: ${r.length} rows, total ${tot}`);
    if (tot > 10000) { year = parseInt(per); rows = r; break; }
  }
  if (!rows) throw new Error('no crime year with data');
  const crimeBy = new Map(); // code -> {total, cats:Map(label->n)}
  for (const r of rows) {
    const code = r.WijkenEnBuurten.trim(), cat = r.SoortMisdrijf.trim(), n = Math.max(0, Math.round(Number(r.GeregistreerdeMisdrijven_1)) || 0); // upstream values are forced to plain counts
    let e = crimeBy.get(code);
    if (!e) crimeBy.set(code, (e = { total: 0, hasTotal: false, cats: new Map(), raw: {} }));
    if (cat === '0.0.0') { e.total = n; e.hasTotal = true; continue; }
    if (n > 0) e.raw[cat] = (e.raw[cat] || 0) + n;
    const label = CRIME_LABEL[cat] || 'Other';
    e.cats.set(label, (e.cats.get(label) || 0) + n);
  }

  const seen = new Set();
  const list = [];
  const skipped = [];
  for (const f of bj.features) {
    const p = f.properties, code = p.buurtcode;
    if (p.water === 'JA' || /99\d\d$/.test(code.slice(-4)) || seen.has(code)) { skipped.push(`${code} ${p.buurtnaam} (${p.water})`); continue; }
    if (!f.geometry) { skipped.push(code + ' nogeom'); continue; }
    seen.add(code);
    const land = p.oppervlakteLandInHa > 0 ? p.oppervlakteLandInHa / 100 : 0;
    list.push({
      code, name: clean(p.buurtnaam), wijk: wijkName.get(p.wijkcode) || '', pop: p.aantalInwoners > 0 ? p.aantalInwoners : 0, areaKm2: land, geom: f.geometry,
    });
  }
  list.sort((a, b) => (a.code < b.code ? -1 : 1));
  console.log(`  ${list.length} land buurten; skipped: ${skipped.join('; ')}`);

  // match + metrics
  const matched = [];
  const unmatched = [];
  for (const b of list) {
    const c = crimeBy.get(b.code);
    if (c && c.hasTotal && b.areaKm2 > 0) {
      b.crimes = c.total;
      b.cat = c.raw;
      b.rate = Math.round((c.total / Math.max(b.pop, 500)) * 1000 * 10) / 10;
      b.density = Math.round((c.total / b.areaKm2) * 10) / 10;
      const top = [...c.cats.entries()].filter(([k, n]) => k !== 'Other' && n > 0).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 3);
      b.top = top.map(([k, n]) => ({ k, n }));
      matched.push(b);
    } else {
      b.crimes = null; b.rate = null; b.density = null; b.top = []; b.score = null; b.level = 0;
      unmatched.push(b.code + ' ' + b.name);
    }
  }
  const pct = (vals, v) => {
    let lo = 0, eq = 0;
    for (const x of vals) { if (x < v) lo++; else if (x === v) eq++; }
    return ((lo + 0.5 * eq) / vals.length) * 100;
  };
  const rates = matched.map((b) => b.rate), dens = matched.map((b) => b.density);
  for (const b of matched) {
    b.score = Math.round(0.65 * pct(rates, b.rate) + 0.35 * pct(dens, b.density));
    b.level = levelOf(b.score);
  }
  const medScore = median(matched.map((b) => b.score));
  const sumCrimes = matched.reduce((s, b) => s + b.crimes, 0), sumPop = matched.reduce((s, b) => s + b.pop, 0);
  const cityRate = Math.round((sumCrimes / sumPop) * 1000 * 10) / 10;
  // category titles (soort) + per-category city totals over all listed buurten
  const soort = await cachedJson('soort.json', () => getJson(`${ODATA}/SoortMisdrijf`));
  const catTitles = {};
  for (const v of soort.value) {
    const k = v.Key.trim();
    if (k !== '0.0.0') catTitles[k] = v.Title.trim().replace(/^[\d.]+\s+/, '');
  }
  const catCity = {};
  for (const b of list) for (const [k, n] of Object.entries(crimeBy.get(b.code)?.raw || {})) catCity[k] = (catCity[k] || 0) + n;
  const cats = {};
  for (const k of Object.keys(catTitles).sort()) cats[k] = { title: catTitles[k], city: catCity[k] || 0 };
  return { list, cats, matched, unmatched, year, medScore, cityRate, sumCrimes, sumPop, skipped };
}

function buurtFeatureGeometry(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const out = [];
  for (const poly of polys) {
    const rings = [];
    for (let i = 0; i < poly.length; i++) {
      const r = simplifyRing(poly[i], 1.5);
      if (r && (i === 0 || ringArea(r.map(proj)) > 100)) rings.push(r);
      else if (i === 0) break;
    }
    if (rings.length) out.push(rings);
  }
  return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
}
function labelPoint(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let best = polys[0], ba = -1;
  for (const p of polys) { const a = ringArea(p[0].map(proj)); if (a > ba) { ba = a; best = p; } }
  const pp = best.map((r) => r.map(proj));
  const [x, y] = polylabel(pp, 1.0);
  return rLL(unproj([x, y]));
}

// ---------------------------------------------------------------- main
const B = await loadBuurten();
const buurtIdx = new PolyIndex(500);
for (const b of B.list) {
  const polys = b.geom.type === 'Polygon' ? [b.geom.coordinates] : b.geom.coordinates;
  for (const p of polys) buurtIdx.add(p.map((r) => r.map(proj)), b);
}

// ---- buurten.geojson
const buurtFeatures = B.list.map((b, i) => {
  const [cx, cy] = labelPoint(b.geom);
  return {
    type: 'Feature', id: i,
    properties: { code: b.code, name: b.name, wijk: b.wijk, pop: b.pop, areaKm2: Math.round(b.areaKm2 * 1000) / 1000, crimes: b.crimes, rate: b.rate, density: b.density, score: b.score, level: b.level, top: b.top, year: B.year, cx, cy, cat: b.cat || {} },
    geometry: buurtFeatureGeometry(b.geom),
  };
});

// ---------------------------------------------------------------- 2. OSM
console.log('[2] OSM');
const HW = 'trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian';
const osmStreets = await overpass('osm-streets', `way["highway"~"^(${HW})$"]["name"](${BBS});out geom;`);
for (const el of osmStreets.elements) if (el.tags?.name) el.tags.name = clean(el.tags.name);
const osmPois = await overpass('osm-pois', `(nwr["amenity"~"^(bar|pub|nightclub|biergarten|coffee_shop|restaurant|fast_food|cafe)$"](${BBS});nwr["shop"](${BBS}););out center qt;`);
const osmTrees = await overpass('osm-trees', `node["natural"="tree"](${BBS});out skel qt;`);
const osmBld = await overpass('osm-buildings', `way["building"]["building:levels"](${BBS});out center qt;`);
const osmStations = await overpass('osm-stations', `nwr["railway"="station"]["train"="yes"](${BBS});out center;`);
const osmWater = await overpass('osm-water', `(way["natural"="water"](${BBS});rel["natural"="water"](${BBS});way["waterway"~"^(canal|river)$"](${BBS}););out geom qt;`);
const GREEN_Q = (t) => `${t}["leisure"~"^(park|nature_reserve)$"](${BBS});${t}["landuse"~"^(forest|grass)$"](${BBS});${t}["natural"~"^(wood|dune|heath|beach|sand)$"](${BBS});`;
const osmGreen = await overpass('osm-green', `(${GREEN_Q('way')}${GREEN_Q('rel')});out geom qt;`);
const osmRail = await overpass('osm-rail', `way["railway"~"^(tram|rail)$"](${BBS});out geom qt;`);

// --- spatial indexes
const tramIdx = new SegGrid(60), waterIdx = new SegGrid(60), parkIdx = new SegGrid(100), beachIdx = new SegGrid(250);
const parkPolys = new PolyIndex(200), beachPolys = new PolyIndex(250);

const ctx = { water: [], canal: [], green: [], beach: [], tram: [], rail: [] };
let nWaterSmall = 0, nGreenSmall = 0;
for (const el of osmWater.elements) {
  const t = el.tags || {};
  if (t.waterway) { if (el.geometry) { const ll = el.geometry.map((p) => [p.lon, p.lat]); ctx.canal.push(ll); waterIdx.addLine(ll.map(proj)); } continue; }
  for (const poly of elementPolygons(el)) {
    const pr = poly.map((r) => r.map(proj));
    if (ringArea(pr[0]) < 400) { nWaterSmall++; continue; }
    ctx.water.push(poly);
    for (const r of pr) waterIdx.addLine(r);
  }
}
for (const el of osmGreen.elements) {
  const t = el.tags || {};
  const isBeach = t.natural === 'beach' || t.natural === 'sand';
  const isGrass = t.landuse === 'grass';
  for (const poly of elementPolygons(el)) {
    const pr = poly.map((r) => r.map(proj));
    const area = ringArea(pr[0]);
    if (isBeach) {
      if (area < 300) continue;
      ctx.beach.push(poly);
      if (t.natural === 'beach') { for (const r of pr) beachIdx.addLine(r); beachPolys.add(pr, 1); }
    } else {
      if (area < 3000) { nGreenSmall++; continue; }
      ctx.green.push(poly);
      if (!isGrass) { for (const r of pr) parkIdx.addLine(r); parkPolys.add(pr, 1); }
    }
  }
}
for (const el of osmRail.elements) {
  const t = el.tags || {};
  if (!el.geometry || t.service) continue;
  const ll = el.geometry.map((p) => [p.lon, p.lat]);
  if (t.railway === 'tram') { ctx.tram.push(ll); tramIdx.addLine(ll.map(proj)); }
  else ctx.rail.push(ll);
}
console.log(`  context raw: water ${ctx.water.length} (dropped ${nWaterSmall} small), canal ${ctx.canal.length}, green ${ctx.green.length} (dropped ${nGreenSmall}), beach ${ctx.beach.length}, tram ${ctx.tram.length}, rail ${ctx.rail.length}`);

const elXY = (el) => (el.type === 'node' ? [el.lon, el.lat] : el.center ? [el.center.lon, el.center.lat] : null);
const barGrid = new PointGrid(40), foodGrid = new PointGrid(40), shopGrid = new PointGrid(40), treeGrid = new PointGrid(30), bldGrid = new PointGrid(40);
let nBar = 0, nFood = 0, nShop = 0;
for (const el of osmPois.elements) {
  const ll = elXY(el);
  if (!ll) continue;
  const [x, y] = proj(ll), t = el.tags || {}, id = el.type[0] + el.id;
  if (/^(bar|pub|nightclub|biergarten|coffee_shop)$/.test(t.amenity) || t.shop === 'cannabis') { barGrid.add(x, y, id); nBar++; }
  if (/^(restaurant|fast_food|cafe)$/.test(t.amenity)) { foodGrid.add(x, y, id); nFood++; }
  if (t.shop) { shopGrid.add(x, y, id); nShop++; }
}
for (const el of osmTrees.elements) treeGrid.add(...proj([el.lon, el.lat]), el.id);
let nBld = 0;
for (const el of osmBld.elements) {
  const ll = elXY(el);
  const lv = parseFloat(el.tags?.['building:levels']);
  if (!ll || !isFinite(lv)) continue;
  bldGrid.add(...proj(ll), { id: el.id, lv });
  nBld++;
}
const stations = osmStations.elements.filter((el) => { const [x, y] = proj(elXY(el)); return buurtIdx.find(x, y); }).map((el) => ({ name: el.tags?.name, xy: proj(elXY(el)) }));
console.log(`  pois: bars ${nBar}, food ${nFood}, shops ${nShop}, trees ${osmTrees.elements.length}, buildings(levels) ${nBld}`);
console.log('  stations: ' + stations.map((s) => s.name).join(', '));
const stationGrid = new PointGrid(300);
for (const s of stations) stationGrid.add(s.xy[0], s.xy[1], s.name);

// --- streets
const BIKE_KEY = /^cycleway/;
function wayInfo(el) {
  const t = el.tags;
  const ll = el.geometry.map((p) => [p.lon, p.lat]);
  const xy = ll.map(proj);
  let len = 0;
  const cum = [0];
  for (let i = 1; i < xy.length; i++) { len += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]); cum.push(len); }
  return { el, t, ll, xy, len, cum };
}
function pointAt(w, d) {
  let i = 1;
  while (i < w.cum.length - 1 && w.cum[i] < d) i++;
  const [ax, ay] = w.xy[i - 1], [bx, by] = w.xy[i];
  const sl = w.cum[i] - w.cum[i - 1] || 1;
  const f = Math.max(0, Math.min(1, (d - w.cum[i - 1]) / sl));
  const bearing = ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360;
  return { x: ax + f * (bx - ax), y: ay + f * (by - ay), bearing };
}
function samples(w, step = 10) {
  const out = [];
  const n = Math.max(1, Math.ceil(w.len / step));
  for (let k = 0; k <= n; k++) { const p = pointAt(w, (w.len * k) / n); out.push([p.x, p.y]); }
  return out;
}

const groups = new Map();
let dropOutside = 0;
for (const el of osmStreets.elements) {
  if (!el.geometry || el.geometry.length < 2 || !el.tags?.name) continue;
  const w = wayInfo(el);
  if (w.len < 1) continue;
  const mid = pointAt(w, w.len / 2);
  const b = buurtIdx.find(mid.x, mid.y);
  if (!b) { dropOutside++; continue; }
  const key = el.tags.name + '|' + b.code;
  let g = groups.get(key);
  if (!g) groups.set(key, (g = { name: el.tags.name, b, ways: [], sets: { bars: new Set(), food: new Set(), shops: new Set(), trees: new Set(), bld: new Map() }, ns: 0, tram: 0, water: 0, park: 0, beach: 0, station: 0 }));
  g.ways.push(w);
  const S = samples(w);
  for (const [x, y] of S) {
    g.ns++;
    if (tramIdx.within(x, y, 15)) g.tram++;
    if (waterIdx.within(x, y, 25)) g.water++;
    if (parkIdx.within(x, y, 30) || parkPolys.find(x, y)) g.park++;
    if (beachIdx.within(x, y, 200) || beachPolys.find(x, y)) g.beach++;
    stationGrid.near(x, y, 300, () => g.station++);
    barGrid.near(x, y, 30, (id) => g.sets.bars.add(id));
    foodGrid.near(x, y, 30, (id) => g.sets.food.add(id));
    shopGrid.near(x, y, 30, (id) => g.sets.shops.add(id));
    treeGrid.near(x, y, 15, (id) => g.sets.trees.add(id));
    bldGrid.near(x, y, 30, (o) => g.sets.bld.set(o.id, o.lv));
  }
}
console.log(`  street groups ${groups.size} (ways outside land buurten dropped: ${dropOutside})`);

const streetFeatures = [];
const rawStreets = [];
for (const g of groups.values()) {
  const len = g.ways.reduce((s, w) => s + w.len, 0);
  if (len < 25) continue;
  const clsLen = {};
  let oneL = 0, bikeL = 0, lanes = 0;
  for (const w of g.ways) {
    clsLen[w.t.highway] = (clsLen[w.t.highway] || 0) + w.len;
    if (/^(yes|true|1|-1)$/.test(w.t.oneway || '')) oneL += w.len;
    if (Object.entries(w.t).some(([k, v]) => BIKE_KEY.test(k) && !/^(no|none)$/.test(v)) || w.t.bicycle === 'designated') bikeL += w.len;
    const ln = parseInt(w.t.lanes);
    if (ln > lanes) lanes = ln;
  }
  const cls = Object.entries(clsLen).sort((a, b) => b[1] - a[1])[0][0];
  if (!lanes) lanes = /^(residential|living_street|pedestrian)$/.test(cls) ? 1 : 2;
  const lv = [...g.sets.bld.values()];
  const tall = lv.length && median(lv) >= 6 ? 1 : 0;
  const bars = g.sets.bars.size, food = g.sets.food.size, shops = g.sets.shops.size;
  const tram = g.tram / g.ns >= 0.3 ? 1 : 0, water = g.water / g.ns >= 0.25 ? 1 : 0, park = g.park / g.ns >= 0.3 ? 1 : 0;
  const beach = g.beach > 0 ? 1 : 0, station = g.station > 0 ? 1 : 0;

  let score = g.b.score ?? B.medScore;
  const why = [];
  const l100 = len / 100;
  if (bars >= 1) { score += Math.min(15, (5 * bars) / l100); why.push('nightlife'); }
  if (shops >= 3) { score += Math.min(8, (1.5 * shops) / l100); why.push('shopping'); }
  if (station) { score += 8; why.push('station'); }
  if (cls === 'pedestrian') { score += 5; why.push('promenade'); }
  if (beach) { score += 4; why.push('beachfront'); }
  if (/^(trunk|primary|secondary)$/.test(cls)) { score += 3; why.push('throughroad'); }
  if (/^(residential|living_street)$/.test(cls) && bars + food + shops === 0) { score -= 8; why.push('quiet'); }
  if (park) { score -= 4; why.push('leafy'); }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const longest = g.ways.reduce((a, b) => (b.len > a.len ? b : a));
  const mp = pointAt(longest, longest.len / 2);
  const [cx, cy] = rLL(unproj([mp.x, mp.y]));
  const lines = [];
  for (const w of g.ways) { const s = simplifyLine(w.ll, 2); if (s) lines.push(s); }
  if (!lines.length) continue;
  rawStreets.push({
    name: g.name, b: g.b,
    props: {
      name: g.name, buurt: g.b.code, buurtName: g.b.name, wijk: g.b.wijk, cls, len: Math.round(len), score, level: levelOf(score), why: why.join('|'),
      tram, water, bars, food, shops, trees: g.sets.trees.size, beach, park, station, tall, lanes, oneway: oneL / len >= 0.5 ? 1 : 0, bike: bikeL / len >= 0.5 ? 1 : 0,
      cx, cy, bearing: Math.round(mp.bearing),
    },
    geometry: { type: 'MultiLineString', coordinates: chain(lines).map((l) => dedupe(l)) },
  });
}
rawStreets.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.b.code < b.b.code ? -1 : 1));
rawStreets.forEach((s, i) => streetFeatures.push({ type: 'Feature', id: i, properties: s.props, geometry: s.geometry }));

// ---------------------------------------------------------------- 3. context
console.log('[3] context');
const gem = await cachedJson('gemeenten.json', () => getJson(wfsUrl('gemeenten', FILTER_BBOX)));
const ctxFeatures = [];
for (const f of gem.features) {
  if (f.properties.water !== 'NEE') continue;
  const clipped = bboxClip(f, [BB[1], BB[0], BB[3], BB[2]]);
  const geom = clipped.geometry;
  if (!geom || !geom.coordinates.length) continue;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const out = [];
  for (const poly of polys) {
    const rings = [];
    for (let i = 0; i < poly.length; i++) { const r = simplifyRing(poly[i], 5); if (r && (i === 0 || ringArea(r.map(proj)) > 2000)) rings.push(r); else if (i === 0) break; }
    if (rings.length) out.push(rings);
  }
  if (!out.length) continue;
  ctxFeatures.push({ type: 'Feature', properties: { kind: 'land', name: f.properties.gemeentenaam, code: f.properties.gemeentecode, home: f.properties.gemeentecode === 'GM0518' ? 1 : 0 }, geometry: { type: 'MultiPolygon', coordinates: out } });
}
function polyKind(kind, polys, minHole, tol = 5) {
  const out = [];
  for (const poly of polys) {
    const rings = [];
    for (let i = 0; i < poly.length; i++) {
      const r = simplifyRing(poly[i], tol);
      if (r && (i === 0 || ringArea(r.map(proj)) > minHole)) rings.push(r);
      else if (i === 0) break;
    }
    if (rings.length) out.push(rings);
  }
  if (out.length) ctxFeatures.push({ type: 'Feature', properties: { kind }, geometry: { type: 'MultiPolygon', coordinates: out } });
}
function lineKind(kind, lines) {
  const merged = chain(lines).map((l) => simplifyLine(l, 5)).filter(Boolean);
  if (merged.length) ctxFeatures.push({ type: 'Feature', properties: { kind }, geometry: { type: 'MultiLineString', coordinates: merged } });
}
polyKind('water', ctx.water, 1500, 8);
lineKind('canal', ctx.canal);
polyKind('green', ctx.green, 3000, 8);
polyKind('beach', ctx.beach, 300);
lineKind('tramline', ctx.tram);
lineKind('rail', ctx.rail);
ctxFeatures.forEach((f, i) => (f.id = i));

// ---------------------------------------------------------------- write + validate
const meta = {
  year: B.year,
  generated: new Date().toISOString(),
  sources: [
    { name: 'CBS/PDOK Wijken en buurten ' + GEOM_YEAR + ' (WFS: buurten, wijken, gemeenten)', url: PDOK },
    { name: 'Politie / CBS 47018NED Geregistreerde misdrijven per wijk en buurt, jaarcijfers', url: ODATA + '/' },
    { name: '© OpenStreetMap contributors (ODbL), fetched via the Overpass API', url: 'https://www.openstreetmap.org/copyright' },
  ],
  method: 'Each neighbourhood gets a score from the percentile rank of registered crimes per 1,000 residents (65%, residents floored at 500) and crimes per km2 (35%); ties get the average rank. Each named street starts from its neighbourhood score and is nudged up or down by what OpenStreetMap says is around it: bars, shops, stations, promenades, beaches, through-roads, parks and quiet residential lanes. Levels run from Sleepy to Mayhem.',
  counts: { buurten: buurtFeatures.length, streets: streetFeatures.length },
  levelNames: LEVEL_NAMES,
  cityRate: B.cityRate,
  cats: B.cats,
};
const fc = (features) => ({ type: 'FeatureCollection', features });
const files = {
  'buurten.geojson': fc(buurtFeatures),
  'streets.geojson': fc(streetFeatures),
  'context.geojson': fc(ctxFeatures),
  'meta.json': meta,
};
for (const [n, o] of Object.entries(files)) fs.writeFileSync(path.join(OUT, n), JSON.stringify(o));

// validation (on in-memory objects: JSON.stringify would turn NaN into null)
function walk(o, p, errs) {
  if (typeof o === 'number' && !Number.isFinite(o)) errs.push(p);
  else if (Array.isArray(o)) o.forEach((v, i) => walk(v, p + '[' + i + ']', errs));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, p + '.' + k, errs);
}
const errs = [];
for (const [n, o] of Object.entries(files)) {
  walk(o, n, errs);
  if (n.endsWith('geojson')) for (const f of o.features) if (typeof f.id !== 'number') errs.push(n + ' feature without numeric id');
  JSON.parse(fs.readFileSync(path.join(OUT, n), 'utf8'));
}
const sizes = Object.fromEntries(Object.keys(files).map((n) => [n, fs.statSync(path.join(OUT, n)).size]));
if (sizes['streets.geojson'] > 6e6) errs.push('streets.geojson > 6MB');
if (sizes['context.geojson'] > 2.5e6) errs.push('context.geojson > 2.5MB');

// ---------------------------------------------------------------- summary
console.log('\n===== SUMMARY =====');
console.log(`crime year ${B.year}; buurten ${buurtFeatures.length}; matched ${B.matched.length}; unmatched ${B.unmatched.length} ${B.unmatched.join(', ')}`);
console.log(`city crimes ${B.sumCrimes}, pop ${B.sumPop}, cityRate ${B.cityRate}; median buurt score ${B.medScore}`);
const dist = (arr) => { const d = [0, 0, 0, 0, 0, 0]; arr.forEach((x) => d[x]++); return d.slice(0).join('/'); };
console.log('buurt level dist (0/1/2/3/4/5): ' + dist(buurtFeatures.map((f) => f.properties.level)));
console.log('street level dist (0/1/2/3/4/5): ' + dist(streetFeatures.map((f) => f.properties.level)));
const ranked = [...B.matched].sort((a, b) => b.score - a.score);
const fmt = (b) => `${b.name} [${b.wijk}] score ${b.score} rate ${b.rate} dens ${b.density} crimes ${b.crimes} pop ${b.pop} top ${b.top.map((t) => t.k + ':' + t.n).join(',')}`;
console.log('TOP 10:\n  ' + ranked.slice(0, 10).map(fmt).join('\n  '));
console.log('BOTTOM 10:\n  ' + ranked.slice(-10).reverse().map(fmt).join('\n  '));
const want = ['Grote Marktstraat', 'Lange Voorhout', 'Strandweg', 'Hoefkade', 'Laan van Meerdervoort', 'Plein'];
const pick = [];
for (const w of want) for (const s of streetFeatures.filter((f) => f.properties.name === w)) pick.push(s);
const rest = streetFeatures.filter((f) => !want.includes(f.properties.name));
for (let i = 0; pick.length < 21 && i < rest.length; i += Math.floor(rest.length / 12)) pick.push(rest[i]);
console.log('SAMPLE STREETS:');
for (const s of pick) { const p = s.properties; console.log(`  ${p.name} @${p.buurtName}: ${p.cls} ${p.len}m score ${p.score} L${p.level} why=${p.why} tram${p.tram} wat${p.water} bars${p.bars} food${p.food} shops${p.shops} trees${p.trees} beach${p.beach} park${p.park} stn${p.station} tall${p.tall} lanes${p.lanes} ow${p.oneway} bike${p.bike}`); }
console.log('sizes: ' + Object.entries(sizes).map(([n, s]) => `${n} ${(s / 1e6).toFixed(2)}MB`).join(', '));
console.log('context features: ' + ctxFeatures.map((f) => f.properties.kind + (f.properties.name ? ':' + f.properties.name : '')).join(', '));
console.log(errs.length ? 'VALIDATION ERRORS: ' + errs.slice(0, 20).join('; ') : 'validation OK');
if (errs.length) process.exit(1);
