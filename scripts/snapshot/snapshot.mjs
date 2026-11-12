#!/usr/bin/env node
// Snapshot of the voxel city's generated geometry, as hashes, so two versions of src/ can be diffed (see diff.mjs).
//   node scripts/snapshot/snapshot.mjs <srcDir> <outFile.json> [--tiles N] [--only tileKey,tileKey] [--parts tile,fronts,brands,statues,actors,pure]
//                     [--reverse] [--reuse N] [--keep] [--repo DIR]
// The srcDir is only READ: it is copied to a fresh directory under the system temp directory and the copy is patched
// (see lib/prepare.mjs); that directory is removed when the run ends, unless --keep is given.
// --repo DIR is the repository whose public/data and node_modules are used; the default is the repository this script lives in.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Hx, canon, hashOf, sha8, hashTree, hashGeometry, hashVox } from './lib/hash.mjs';
import { installStubs, realNow } from './lib/stubs.mjs';
import { prepare, fingerprint } from './lib/prepare.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL_VERSION = 4;

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const pos = [], opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    if (['reverse', 'keep', 'verbose'].includes(k)) opt[k] = true; else opt[k] = argv[++i];
  } else pos.push(a);
}
if (pos.length < 2) { console.error('usage: node scripts/snapshot/snapshot.mjs <srcDir> <outFile.json> [--tiles N] [--only k,k] [--parts a,b] [--reverse] [--reuse N] [--keep] [--repo DIR]'); process.exit(2); }
const srcDir = path.resolve(pos[0]), outFile = path.resolve(pos[1]);
const REPO = path.resolve(opt.repo || process.env.HEIBEL_REPO || path.join(HERE, '..', '..'));
const DATA = path.join(REPO, 'public/data'), WORLD = path.join(DATA, 'world');
const ALL_PARTS = ['tile', 'fronts', 'brands', 'statues', 'actors', 'pure'];
const PARTS = opt.parts ? opt.parts.split(',').map((s) => s.trim()).filter(Boolean) : ALL_PARTS;
for (const p of PARTS) if (!ALL_PARTS.includes(p)) { console.error('unknown part ' + p); process.exit(2); }
const want = (p) => PARTS.includes(p);
const LIMIT = opt.tiles ? Math.max(1, parseInt(opt.tiles, 10)) : Infinity;
const ONLY = opt.only ? opt.only.split(',').map((s) => s.trim()).filter(Boolean) : null;
const REUSE = opt.reuse !== undefined ? parseInt(opt.reuse, 10) : 4;
const T0 = realNow();
const log = (...a) => process.stderr.write(`[${((realNow() - T0) / 1000).toFixed(1)}s] ${a.join(' ')}\n`);

// ---------------------------------------------------------------- prepare the copy, install stubs, load modules
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'heibel-snapshot-'));
// the work directory is removed on every way out (normal end, process.exit, an uncaught error, Ctrl-C) unless --keep is given
if (!opt.keep) {
  process.on('exit', () => fs.rmSync(work, { recursive: true, force: true }));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
}
const checkScript = [path.join(srcDir, '..', 'scripts', 'check-statues.mjs'), path.join(REPO, 'scripts', 'check-statues.mjs')].find((p) => fs.existsSync(p));
const fp = fingerprint(srcDir);
// the data the snapshot is made from (tiles, index, rasters, districts): two snapshots are only comparable on the same data
const dataHash = (() => {
  const h = crypto.createHash('sha256');
  const files = [...fs.readdirSync(path.join(WORLD, 'tiles')).sort().map((f) => path.join(WORLD, 'tiles', f)), ...['index.json', 'city-ground.png', 'city-height.png', 'city-terrain.png'].map((f) => path.join(WORLD, f)), path.join(DATA, 'buurten.geojson'), path.join(DATA, 'meta.json')];
  for (const f of files) h.update(path.basename(f)).update(fs.readFileSync(f));
  return h.digest('hex').slice(0, 16);
})();
const prep = prepare({ srcDir, work, modules: path.join(REPO, 'node_modules'), scriptsFrom: checkScript });
log(`copied ${srcDir} -> ${prep.srcWork} (${Object.keys(fp.files).length} files, src hash ${fp.all}); ${prep.patches.length} patches`);
const stubs = installStubs({ dataDir: DATA, modules: path.join(REPO, 'node_modules') });
const skipped = { ...prep.skipped };
const rel = (f) => path.join(prep.srcWork, f);
const imp = async (f) => import(pathToFileURL(rel(f)).href);
const tryImp = async (f, why) => { try { return await imp(f); } catch (e) { skipped[why || f] = 'cannot import ' + f + ': ' + String(e.message).split('\n')[0]; return null; } };

const M = {};
M.kit = await tryImp('voxel/kit.js');
M.props = await tryImp('voxel/props.js');
M.cast = await tryImp('voxel/cast.js');
M.geo = await tryImp('voxel/geo.js');
M.street = await tryImp('voxel/street.js');
M.brands = await tryImp('voxel/brands.js');
M.poicats = await tryImp('voxel/poicats.js');
M.places = await tryImp('voxel/places.js');
M.special = await tryImp('voxel/special-parts.js');
M.landmarks = await tryImp('voxel/landmarks.js');
M.statuesIdx = await tryImp('voxel/statues/index.js');
M.statuesKit = await tryImp('voxel/statues/kit.js');
M.districts = await tryImp('voxel/districts.js');
const W = {}; // world internals by name (found wherever they live)
for (const [name, f] of Object.entries(prep.located)) {
  if (!f) continue;
  try { const m = await imp(f); W[name] = m['__h_' + name]; } catch (e) { skipped['world:' + name] = 'cannot import ' + f + ': ' + String(e.message).split('\n')[0]; }
}
if (!M.kit) { console.error('kit.js does not load: nothing can be done'); process.exit(3); }
const { Vox, makeRng, hashStr } = M.kit;
const releaseSign = (m) => { try { if (M.props && M.props.releaseSign) M.props.releaseSign(m); else if (m) { m.geometry.dispose(); m.material.dispose(); } } catch (e) { /* ignore */ } };

// ---------------------------------------------------------------- the world data
const readTile = (key) => JSON.parse(fs.readFileSync(path.join(WORLD, 'tiles', key + '.json'), 'utf8'));
const ix = JSON.parse(fs.readFileSync(path.join(WORLD, 'index.json'), 'utf8'));
const allKeys = ix.tiles.slice().sort();
const stats = new Map(); // key -> numbers for the sampling
const poiNames = new Map(); // "name\u0000cat\u0000flags" -> true
{
  const cats = M.poicats ? M.poicats.POI_CATS : [];
  for (const key of allKeys) {
    const t = readTile(key);
    const nps = t.ps ? t.ps.length / 3 : 0;
    let stat = 0;
    for (const e of t.f || []) if (e[0] === 8 || e[0] === 9) stat++;
    stats.set(key, { nps, nb: (t.b || []).length, nstat: stat, nq: (t.q || []).length, nx: (t.x || []).length, nf: (t.f || []).length, sea: (t.g || []).some((e) => e[0] === 10), water: (t.g || []).filter((e) => e[0] === 1).length });
    if (t.ps && t.pn) for (let i = 0; i < nps; i++) {
      const ni = t.ps[3 * i + 1];
      const name = ni >= 0 ? t.pn[ni] || null : null;
      if (name) poiNames.set(name + '\u0000' + (cats[t.ps[3 * i]] || 'other') + '\u0000' + (t.ps[3 * i + 2] | 0), true);
    }
  }
}
log(`scanned ${allKeys.length} tiles, ${poiNames.size} distinct (name, category, flags)`);

// ---------------------------------------------------------------- sampling
function sample() {
  if (ONLY) return ONLY.filter((k) => stats.has(k) || (skipped['only:' + k] = 'not a tile of the index', false));
  const cat = {};
  const top = (n, f) => allKeys.slice().sort((a, b) => f(stats.get(b)) - f(stats.get(a)) || (a < b ? -1 : 1)).slice(0, n);
  cat.pois = top(25, (s) => s.nps);
  cat.buildings = top(15, (s) => s.nb);
  cat.special = M.special ? Object.keys(M.special.SPECIAL_PARTS).filter((k) => stats.has(k)).sort() : [];
  const tileAt = (x, y) => Math.floor(x / 256) + '_' + Math.floor(y / 256);
  const places = [];
  if (M.places) for (const p of M.places.PLACES) {
    const x0 = p.box ? p.box[0] : p.x - p.r, x1 = p.box ? p.box[2] : p.x + p.r, y0 = p.box ? p.box[1] : p.y - p.r, y1 = p.box ? p.box[3] : p.y + p.r;
    for (const k of [tileAt(p.x, p.y), tileAt(x0, y0), tileAt(x1, y1), tileAt(x0, y1), tileAt(x1, y0)]) if (stats.has(k) && !places.includes(k)) places.push(k);
  }
  cat.places = places;
  const marks = [];
  for (const L of ix.landmarks || []) { const k = tileAt(L.x, L.y); if (stats.has(k) && !marks.includes(k)) marks.push(k); }
  cat.landmarks = marks.slice(0, 40);
  cat.statues = top(8, (s) => s.nstat);
  cat.parts = top(6, (s) => s.nq);
  cat.barriers = top(4, (s) => s.nx);
  cat.features = top(6, (s) => s.nf);
  cat.coast = allKeys.filter((k) => stats.get(k).sea).filter((_, i) => i % 7 === 0).slice(0, 4);
  cat.water = top(4, (s) => s.water);
  cat.every61 = allKeys.filter((_, i) => i % 61 === 0);
  // round robin over the categories (so --tiles N still looks at every kind), de-duplicated
  const out = [], seen = new Set();
  const order = ['pois', 'buildings', 'special', 'places', 'every61', 'landmarks', 'statues', 'parts', 'barriers', 'features', 'coast', 'water'];
  for (let i = 0; order.some((c) => i < cat[c].length); i++) for (const c of order) { const k = cat[c][i]; if (k !== undefined && !seen.has(k)) { seen.add(k); out.push(k); } }
  return out;
}
let keys = sample();
if (keys.length > LIMIT) keys = keys.slice(0, LIMIT);
const processing = opt.reverse ? keys.slice().reverse() : keys;
log(`sample: ${keys.length} tiles${opt.reverse ? ' (processed in reverse order)' : ''}; parts: ${PARTS.join(',')}`);

// ---------------------------------------------------------------- output skeleton
const out = {
  meta: {
    tool: 'heibel-snapshot', toolVersion: TOOL_VERSION, srcDir, srcHash: fp.all, dataHash, repo: REPO, srcFiles: fp.files, node: process.version, parts: PARTS, tiles: keys.slice().sort(),
    patches: prep.patches, located: prep.located, skipped, mathRandomCalls: 0, dateNowCalls: 0,
  },
  tiles: {}, brands: {}, statues: {}, actors: {}, pure: {},
};
const diag = { count: 0, first: [] };
// the code under test reports swallowed failures with console.error / console.warn: count them instead of printing
for (const k of ['error', 'warn']) console[k] = (...a) => { diag.count++; if (diag.first.length < 12) diag.first.push('console.' + k + ': ' + a.map((x) => (x && x.message) || String(x)).join(' ').slice(0, 160)); };
const note = (what, e) => { diag.count++; if (diag.first.length < 12) diag.first.push(what + ': ' + String(e && e.message).split('\n')[0].slice(0, 160)); };
const safe = (what, fn) => {
  try { return fn(); } catch (e) { note(what, e); return { error: String(e && e.message).split('\n')[0].slice(0, 300), where: what }; }
};
const safeA = async (what, fn) => {
  try { return await fn(); } catch (e) { note(what, e); return { error: String(e && e.message).split('\n')[0].slice(0, 300), where: what }; }
};

// ---------------------------------------------------------------- the city
let city = null;
if (want('tile') || want('fronts') || want('pure')) {
  if (!W.loadCity || !W.buildTile) {
    skipped.tile = 'buildTile / loadCity not found in src/voxel';
  } else {
    city = await W.loadCity();
    log('city loaded: ground', city.ground.width + 'x' + city.ground.height, 'height', city.height.width + 'x' + city.height.height, 'terrain', city.terr && city.terr.on ? 'on' : 'off');
  }
}

// ---------------------------------------------------------------- parts: a tile
// [name, night, lod, lite]: the four the spec asks for, plus night at lod 1 and 2 (landmark lights) and the phone ("lite") builds
const VARIANTS = [['lod0.day', false, 0, false], ['lod0.night', true, 0, false], ['lod1.day', false, 1, false], ['lod2.day', false, 2, false],
  ['lod1.night', true, 1, false], ['lod2.night', true, 2, false], ['lod0.lite.day', false, 0, true], ['lod1.lite.night', true, 1, true]];

function gridHash(g) {
  const { a, off, ...rest } = g;
  return { cls: new Hx().bytes(a).done(), off: off ? new Hx().bytes(off).done() : null, head: hashOf(rest), w: g.w, h: g.h, cell: g.cell };
}
let furnCapture = null;
if (globalThis.__harness) {
  globalThis.__harness.furn = (o, r) => {
    furnCapture = safe('furniture', () => {
      const tr = o.group ? hashTree(o.group) : null;
      return {
        solid: hashVox(o.v), glow: hashVox(o.gl), nSolid: o.v.n, nGlow: o.gl.n, group: tr ? tr.all : null, groupObjs: tr ? tr.objs : [],
        props: hashOf(r && r.props), nProps: r && r.props ? r.props.length : 0, propKinds: countBy(r && r.props, (p) => p.kind),
      };
    });
  };
}
function countBy(list, f) {
  const m = {};
  for (const x of list || []) { const k = String(f(x)); m[k] = (m[k] || 0) + 1; }
  return m;
}

/** Build one tile variant and describe it. t: the tile's data (fresh or shared). */
function buildVariant(key, t, night, lod, withDetail, lite = false) {
  stubs.rnd.reset();
  const r0 = stubs.rnd.calls, d0 = 0;
  furnCapture = null;
  const c = W.buildTile(city, key, t, night, lite, lod);
  const tr = hashTree(c.g);
  const e = {
    meshes: tr.all, nObjects: tr.n, vertices: tr.verts, instances: tr.instances, objs: tr.objs,
    props: c.props ? hashOf(c.props) : null, nProps: c.props ? c.props.length : null,
    lamps: hashOf(c.lamps), nLamps: c.lamps && c.lamps.a ? c.lamps.a.length / 5 : 0,
    grid: gridHash(c.grid), trees: hashOf(c.trees), nTrees: c.trees.length / 3,
    roads: hashOf(c.roads), rails: hashOf(c.rails), pois: hashOf(c.pois),
    cells: hashOf((c.cells || []).map((q) => ({ ci: q.ci, cx: q.cx, cz: q.cz, units: q.units, nplain: q.plain.length }))), nCells: (c.cells || []).length,
    misc: hashOf({ key: c.key, num: c.num, lod: c.lod, ox: c.ox, oy: c.oy, night: c.night }),
  };
  if (furnCapture) e.furniture = furnCapture;
  if (withDetail && W.Streamer && c.cells && c.cells.length) {
    e.detail = safe('streamer._buildCell', () => {
      const fake = { city, _signs: null }, proto = W.Streamer.prototype;
      if (typeof proto._buildCell !== 'function') return { skipped: 'Streamer.prototype._buildCell not found' };
      const list = [];
      for (const cell of c.cells) {
        const done = proto._buildCell.call(fake, c, cell);
        const det = cell.detail;
        if (!det) { list.push(`${cell.ci}|incomplete(${done})`); continue; }
        const mh = det.meshes.map((m) => hashTree(m));
        const sh = det.signs.map((sg) => `${hashTree(sg.m).all}@${sg.x},${sg.z}`);
        list.push(`${cell.ci}|u${cell.units.length}|v${mh.reduce((s, q) => s + q.verts, 0)}|${mh.map((q) => q.all).join('+')}|${hashOf(sh)}|s${sh.length}`);
        for (const sg of det.signs) releaseSign(sg.m);
      }
      return { cells: list, all: hashOf(list) };
    });
  }
  const verts = tr.verts;
  c.dispose();
  return { e, verts };
}

function tilePart(key, idx) {
  const res = {};
  for (const [name, night, lod, lite] of VARIANTS) {
    const t = readTile(key);
    const t1 = realNow();
    res['tile.' + name] = safe('buildTile ' + name, () => {
      const { e } = buildVariant(key, t, night, lod, lod === 0 && !lite, lite);
      return e;
    });
    if (opt.verbose) log(`   ${key} ${name} ${(realNow() - t1).toFixed(0)}ms`);
  }
  // furniture on its own (the spy saw it inside the lod 0 builds)
  for (const n of ['day', 'night']) {
    const e = res['tile.lod0.' + n];
    if (e && e.furniture) { res['furniture.' + n] = e.furniture; }
    else if (e && !e.error) res['furniture.' + n] = { skipped: skipped.furnishSpy || 'furnishTile was not called for this tile' };
  }
  // the same tile data built again after other builds (the app reuses a tile's data for every level and for day / night)
  if (idx < REUSE) {
    res.reuse = safe('reuse', () => {
      const t = readTile(key), bad = [];
      for (const [name, night, lod, lite] of [VARIANTS[0], VARIANTS[1], VARIANTS[2], VARIANTS[3], VARIANTS[0]]) {
        const { e } = buildVariant(key, t, night, lod, false, lite);
        const fresh = res['tile.' + name];
        for (const k of ['meshes', 'props', 'lamps', 'trees', 'roads', 'cells']) if (fresh && !fresh.error && hashOf(e[k]) !== hashOf(fresh[k]) && canon(e[k]) !== canon(fresh[k])) bad.push(name + ':' + k);
        if (fresh && !fresh.error && canon(e.grid) !== canon(fresh.grid)) bad.push(name + ':grid');
      }
      return { sharedTileDataMatchesFresh: bad.length === 0, mismatches: bad };
    });
  }
  return res;
}

// ---------------------------------------------------------------- parts: fronts
function infoHash(hi) {
  if (!hi) return 'none';
  const { u, ...rest } = hi;
  const h = hashOf(rest);
  if (hi.sign) releaseSign(hi.sign);
  return h;
}
function backs(v, u) {
  if (!u.backs) return;
  const k = u.backs;
  v.setT(k.th, k.cx, k.cz); v.setB(k.cx, k.cz, k.h + 2, k.rad);
  for (const r of k.list) {
    v.setW(k.h > 3.4 ? 1 : 0); v.box(r.x, 0, r.z, r.w, k.h, r.d, k.wall, 0.035); v.setW(0);
    v.box(r.x, k.h, r.z, r.w + 0.15, 0.3, r.d + 0.15, '#efe9dc');
    if (Math.min(r.w, r.d) > 2) v.box(r.x, k.h + 0.3, r.z, r.w - 0.5, 0.08, r.d - 0.5, '#4a4e57');
  }
}
function frontsPart(key) {
  if (!W.frontsOf || !W.drawHero || !W.unitRng) return { skipped: 'frontsOf / drawHero / unitRng not found' };
  const t = readTile(key);
  stubs.rnd.reset();
  const F = W.frontsOf(key, t), units = F.units, idxOf = new Map(units.map((u, i) => [u, i]));
  const res = {
    nUnits: units.length, nShops: units.filter((u) => u.shop).length, nHeads: units.filter((u) => u.shop && u.shop.head).length, nAtm: units.filter((u) => u.atm).length, nTowers: units.filter((u) => u.tower).length,
    units: hashOf(units), byB: hashOf([...F.byB].map(([bi, us]) => [bi, us.map((u) => idxOf.get(u))])), rings: hashOf(F.rings),
    shops: hashOf(units.map((u) => u.shop ? { c: u.shop.cat, r: u.shop.real, s: u.shop.sign, l: u.shop.look, h: u.shop.head, k: u.shop.k } : null)),
  };
  const lit = M.props && M.props.litShare ? M.props.litShare : null;
  const litSave = lit ? { ...lit } : null;
  const variants = [['day', false, null], ['night', true, null], ['nightdim', true, { home: 0.31, shop: 0.4 }]];
  for (const [vn, night, share] of variants) {
    if (share && lit) { lit.home = share.home; lit.shop = share.shop; }
    const arr = [];
    for (const u of units) {
      const v = new Vox(1, true), gl = new Vox(2, true);
      const s = safe('drawHero', () => {
        const hi = W.drawHero(v, gl, u, W.unitRng(u), night, false);
        backs(v, u);
        v.setT(); gl.setT(); v.setB(); gl.setB();
        return `${hashVox(v)}|${hashVox(gl)}|${infoHash(hi)}`;
      });
      arr.push(`${u.bi}.${u.i}:${typeof s === 'string' ? s : 'ERR ' + s.error}`);
    }
    res['hero.' + vn] = { all: hashOf(arr), list: arr };
    // the dry run (door / window / sign anchors without drawing) for the same units
    if (vn !== 'nightdim' && W.frontInfo) {
      const dry = units.map((u) => safe('frontInfo', () => hashOf((() => { const { u: _u, ...r } = W.frontInfo(u, night); return r; })())));
      res['dry.' + vn] = hashOf(dry);
    }
    // cell by cell the way Streamer._buildCell shares builders across a cell (colour jitter runs on through the cell)
    const cells = new Map();
    for (const u of units) { if (!cells.has(u.ci)) cells.set(u.ci, []); cells.get(u.ci).push(u); }
    const cl = [];
    for (const [ci, us] of cells) {
      const v = new Vox(1 + ci, true), gl = new Vox(7 + ci, true), infos = [];
      for (const u of us) { const hi = safe('drawHero(cell)', () => W.drawHero(v, gl, u, W.unitRng(u), night)); infos.push(hi && hi.error ? 'ERR' : infoHash(hi)); backs(v, u); }
      v.setT(); gl.setT(); v.setB(); gl.setB();
      cl.push(`${ci}:${hashVox(v)}|${hashVox(gl)}|${hashOf(infos)}`);
    }
    res['cells.' + vn] = { all: hashOf(cl), list: cl };
    if (litSave) { lit.home = litSave.home; lit.shop = litSave.shop; }
  }
  return res;
}

// ---------------------------------------------------------------- global part: brands
function brandsPart() {
  if (!M.brands || !M.poicats) return { skipped: 'brands.js / poicats.js did not load' };
  const B = M.brands, cats = M.poicats.POI_CATS;
  const byName = new Map();
  for (const k of [...poiNames.keys()].sort()) {
    const [name, cat, flags] = k.split('\u0000');
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push([cat, +flags]);
  }
  const res = { distinctNames: byName.size, distinctTriples: poiNames.size, byName: {} };
  for (const [name, list] of byName) {
    const h = new Hx();
    for (const [cat, flags] of list) {
      const one = safe('brands ' + name, () => {
        const par = B.parodyName(name, cat);
        const seeds = [0, 1, 4242424242, hashStr('shop|' + name)];
        const signs = seeds.map((sd) => B.signFor(cat, name, flags, sd));
        const txt = signs[0] && signs[0].text !== undefined ? String(signs[0].text) : String(par);
        return { par, signs, chain: B.chainOf(name), fit: [6, 10, 16, 24].map((m) => B.fitText(txt, m)), fitName: B.fitText(name, 12), look: B.lookOf(cat) };
      });
      h.s(cat).n(flags).s(canon(one));
    }
    res.byName[name] = h.done();
  }
  // anonymous places: every category x flags x seeds
  const anon = [];
  for (const cat of cats) for (let f = 0; f < 8; f++) for (let sd = 0; sd < 6; sd++) anon.push(safe('anon', () => B.signFor(cat, null, f, sd * 7919)));
  res.anonymous = hashOf(anon);
  res.tables = { CAT_LOOK: hashOf(B.CAT_LOOK), CHAINS: hashOf(B.CHAINS), GLYPHS: hashOf(B.GLYPHS), POI_CATS: hashOf(cats) };
  res.looks = hashOf(cats.map((c) => B.lookOf(c)));
  return res;
}

// ---------------------------------------------------------------- global part: statues and landmark drawers
function drawInto(fn) {
  const v = new Vox(3, true), gl = new Vox(4, true);
  let ret;
  try { ret = fn(v, gl); } catch (e) { note('drawInto', e); return `ERR ${String(e.message).split('\n')[0].slice(0, 120)}`; }
  v.setT(); gl.setT(); v.setB(); gl.setB();
  return `${hashVox(v)}|${hashVox(gl)}|${hashOf(ret)}`;
}
function statuesPart() {
  if (!M.statuesIdx || !M.statuesKit || !M.landmarks) return { skipped: 'statues / landmarks modules did not load' };
  const { RECIPES } = M.statuesIdx, IDS = JSON.parse(fs.readFileSync(path.join(prep.srcWork, 'voxel/statues/ids.json'), 'utf8')), K = M.statuesKit, L = M.landmarks;
  const res = { nRecipes: Object.keys(RECIPES).length, nIds: IDS.length, recipes: {}, generic: {}, fountains: {}, features: {}, typed: {}, tables: { RECIPES: hashOf(RECIPES), IDS: hashOf(IDS), FIG: hashOf({ MATS: K.MATS, POSES: K.POSES, HATS: K.HATS, SPEC: K.SPEC }) } };
  for (const id of Object.keys(RECIPES).sort()) {
    const recipe = RECIPES[id], idx = IDS.indexOf(id) + 1, parts = [];
    for (const [lod, night] of [[0, false], [0, true], [1, false], [2, false]]) {
      parts.push(drawInto((v, gl) => { const out = {}; const H = K.drawStatue(v, gl, recipe, { night, lod, rnd: makeRng(hashStr('statue|' + id)), out }); return { H, out }; }));
    }
    if (idx >= 1) for (const type of [8, 9]) for (const [lod, night] of [[0, false], [0, true], [2, false]]) {
      parts.push(drawInto((v, gl) => { L.drawFeature(v, gl, { type, x: 40.5, z: 77.25, a: idx, b: type === 8 ? 1 : 3, c: 0, rot: 0.3, lod, face: 135 }, makeRng(hashStr('extras|' + id)), night); }));
    }
    res.recipes[id] = sha8(parts.join('\n')) + ':' + (idx >= 1 ? 'i' + idx : '-');
  }
  // the generic forms the tile code falls back on, and the fountains without a recipe
  for (let form = 0; form <= 9; form++) {
    const parts = [];
    for (const [lod, night] of [[0, false], [1, false], [2, false], [0, true]]) for (const [x, z] of [[12.3, 45.6], [100, 200.5], [250.1, 3.2]]) {
      parts.push(drawInto((v, gl) => { L.drawFeature(v, gl, { type: 8, x, z, a: 0, b: form, c: 0, rot: 1.1, lod, face: 200 }, makeRng(7), night); }));
      parts.push(drawInto((v, gl) => { const rr = makeRng(hashStr('g|' + form + '|' + x)); const out = {}; const H = K.drawGeneric(v, gl, form, rr, { night, lod, out }); return { H, out }; }));
    }
    res.generic['form' + form] = sha8(parts.join('\n'));
  }
  for (const b of [0, 1, 1.5, 3, 6, 12]) {
    const parts = [];
    for (const [lod, night] of [[0, false], [1, false], [2, false], [0, true]]) for (const [x, z] of [[12.3, 45.6], [100, 200.5]]) {
      parts.push(drawInto((v, gl) => { L.drawFeature(v, gl, { type: 9, x, z, a: 0, b, c: 0, rot: 0.4, lod }, makeRng(9), night); }));
      parts.push(drawInto((v, gl) => { const out = {}; const H = K.drawFountain(v, gl, { x, z, b }, null, night, { lod, out }); return { H, out }; }));
    }
    res.fountains['b' + b] = sha8(parts.join('\n'));
  }
  // the other point features of landmarks.js (fuel station, windmill, ... flagpole)
  for (const type of [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]) {
    const parts = [];
    for (const [lod, night] of [[0, false], [1, false], [2, false], [0, true]]) for (const b of [0, 14, 33]) {
      parts.push(drawInto((v, gl) => { L.drawFeature(v, gl, { type, x: 30, z: 50, a: 90, b, c: 6, rot: 0.7, lod }, makeRng(11 + type), night); }));
    }
    res.features['type' + type] = sha8(parts.join('\n'));
  }
  // typed buildings (church ... castle) on three synthetic footprints, day and night
  if (M.geo && L.TYPED && L.drawTyped) {
    const G = M.geo;
    const rect = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    const rings = { small: rect(14, 10), big: rect(46, 30), L: [[-20, -12], [20, -12], [20, 0], [0, 0], [0, 12], [-20, 12]] };
    for (const type of [...L.TYPED].sort((a, b) => a - b)) {
      const parts = [];
      for (const [rn, ring] of Object.entries(rings)) for (const [h, night] of [[9, false], [9, true], [28, false]]) {
        parts.push(drawInto((v, gl) => {
          const o = G.obbOf(ring), b = { ring, h, roof: 1, year: 1890, o, area: G.ringArea(ring), rects: G.rectsOf(ring, o) };
          return L.drawTyped(v, gl, b, type, { wall: '#9a6452', roof: '#5d646d' }, makeRng(100 + type), night, null);
        }));
      }
      res.typed['type' + type] = sha8(parts.join('\n'));
    }
    // OSM building parts and barriers
    const partsList = [{ ring: rect(20, 12), h: 15, min: 0, roof: 1, roofH: 4, wall: -1, roofCol: -1 }, { ring: rect(8, 8).map(([x, z]) => [x + 14, z]), h: 24, min: 0, roof: 3, roofH: 9, wall: 0xaa8866, roofCol: 0x445566 }, { ring: rect(10, 10).map(([x, z]) => [x - 16, z]), h: 12, min: 3, roof: 4, roofH: 3, wall: -1, roofCol: -1 }];
    for (const night of [false, true]) {
      res.typed['parts.' + (night ? 'night' : 'day')] = drawInto((v, gl) => L.drawParts(v, gl, partsList, { wall: '#b9a58f', roof: '#5d646d' }, 0, 0, 24, makeRng(5), night));
    }
    res.typed.barriers = drawInto((v) => L.drawBarriers(v, [1, 2, 3, 4].map((kind, i) => ({ kind, h: 0, a: Float32Array.from([0, i * 6, 30, i * 6 + 2, 55, i * 6 - 1]) })), makeRng(3)));
  }
  // the real hand-made landmarks (specials), drawn on the first tile that has one
  // validation script, on the copy
  const cs = path.join(work, 'scripts', 'check-statues.mjs');
  if (fs.existsSync(cs)) {
    const r = spawnSync(process.execPath, [cs, '--quiet'], { cwd: work, encoding: 'utf8', timeout: 240000 });
    const txt = (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '');
    res.checkStatues = { status: r.status, sha: sha8(txt), bytes: txt.length, text: txt.length <= 3000 ? txt : txt.slice(0, 3000) + '...' };
  } else res.checkStatues = { skipped: 'scripts/check-statues.mjs not found' };
  return res;
}

// ---------------------------------------------------------------- global part: actors
function actorsPart() {
  if (!M.cast) return { skipped: 'cast.js did not load' };
  const C = M.cast, P = M.props;
  const res = { person: {}, animals: {}, items: {}, vehicles: {}, moods: {} };
  const describe = (a, animate) => {
    const o = a && a.isObject3D ? a : a && a.g ? a.g : a;
    const first = hashTree(o);
    const h = { rest: first.all, verts: first.verts, state: a && !a.isObject3D ? hashOf(Object.fromEntries(Object.entries(a).filter(([k, x]) => typeof x !== 'function' && !(x && x.isObject3D)))) : '-' };
    if (animate && a && typeof a.update === 'function') {
      for (const mv of [0, 1]) { a.moving = mv; for (let i = 0; i < 6; i++) a.update(0.11); }
      h.walk = hashTree(o).all;
    }
    return `${h.rest}|${h.verts}|${h.state}|${h.walk || ''}`;
  };
  const KINDS = ['civ', 'cop', 'robber', 'raccoon', 'kid', 'granny', 'hoodie', 'chef', 'niffo', 'harry'];
  for (const kind of KINDS) {
    const list = [];
    for (let s = 1; s <= 5; s++) list.push(safe('person ' + kind + s, () => describe(C.makePerson(makeRng(s), { kind }), s <= 2)));
    list.push(safe('person opts', () => describe(C.makePerson(makeRng(9), { kind, scale: 1.5, hat: kind === 'niffo' ? 'hood' : 'cap', skin: '#c98e62', shirt: '#123456', pants: '#654321', hair: '#ffcc00' }), true)));
    res.person[kind] = hashOf(list);
  }
  if (C.MOODS) for (const mood of Object.keys(C.MOODS)) {
    res.moods[mood] = safe('mood ' + mood, () => { const a = C.makePerson(makeRng(3), { kind: 'civ' }); a.mood = mood; for (let i = 0; i < 4; i++) a.update(0.1); return describe(a, false); });
  }
  const animals = {
    dog: (r) => C.makeDog(r), cat: (r) => C.makeCat(r), gull: (r) => C.makeBird(r, 'gull'), pigeon: (r) => C.makeBird(r, 'pigeon'), stork: (r) => C.makeBird(r, 'stork'),
  };
  for (const [n, f] of Object.entries(animals)) res.animals[n] = hashOf([1, 2, 3, 4, 5].map((s) => safe(n + s, () => describe(f(makeRng(s)), s <= 2))));
  if (C.item) for (const n of Object.keys(C.item).sort()) res.items[n] = safe('item ' + n, () => describe(C.item[n](), false));
  if (P) {
    for (const type of ['car', 'police', 'van', 'taxi']) for (const night of [false, true]) {
      res.vehicles[`car.${type}.${night ? 'night' : 'day'}`] = hashOf([1, 2, 3].map((s) => safe('car', () => describe(P.makeCar(makeRng(s), type, night), s === 1))));
    }
    
    res.vehicles.bike = hashOf([1, 2, 3].map((s) => safe('bike', () => describe(P.makeBike(makeRng(s)), s === 1))));
    res.vehicles.bikeRider = safe('bikeRider', () => describe(P.makeBike(makeRng(4), C.makePerson(makeRng(4), { kind: 'civ' })), true));
    res.vehicles.scooter = hashOf([1, 2].map((s) => safe('scooter', () => describe(P.makeScooter(makeRng(s), []), s === 1))));
    res.vehicles.scooterRiders = safe('scooter riders', () => describe(P.makeScooter(makeRng(3), [C.makePerson(makeRng(3), { kind: 'robber' }), C.makePerson(makeRng(5), { kind: 'civ' })]), true));
    res.vehicles.fatbike = hashOf([1, 2].map((s) => safe('fatbike', () => describe(P.makeFatbike(makeRng(s), []), s === 1))));
    res.vehicles.fatbikeRiders = safe('fatbike riders', () => describe(P.makeFatbike(makeRng(3), [C.makePerson(makeRng(3), { kind: 'niffo' })]), true));
    res.vehicles.heli = safe('heli', () => describe(P.makeHeli(), true));
    res.vehicles.boat = hashOf([1, 2, 3].map((s) => safe('boat', () => describe(P.makeBoat(makeRng(s)), s === 1))));
  } else res.vehicles = { skipped: 'props.js did not load' };
  return res;
}

// ---------------------------------------------------------------- global part: pure functions
async function purePart() {
  const res = {};
  // kit: seeded dice, hashes and easing
  res.kit = safe('kit', () => {
    const K = M.kit, seq = [];
    for (const s of [0, 1, 2, 12345, 4294967295]) { const r = makeRng(s); seq.push([r(), r(), r(), r.range(2, 9), r.int(1, 6), r.pick(['a', 'b', 'c', 'd']), r.chance(0.3), r.sign()]); }
    return { rng: hashOf(seq), hash: hashOf(['', 'a', 'tile|0_0', 'u|1_2|3|4', 'ünï'].map((s) => hashStr(s))), ease: hashOf(Object.keys(K.ease).sort().map((k) => [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((x) => K.ease[k](x)))), lerp: hashOf([K.lerp(1, 5, 0.3), K.clamp(5, 0, 1), K.TAU]) };
  });
  // geo.js on the buildings and roads of 20 tiles
  res.geo = safe('geo', () => {
    const G = M.geo, o = {};
    const sampleKeys = keys.slice(0, 20);
    const tileLoc = (e, from) => { const a = []; for (let i = from; i + 1 < e.length; i += 2) a.push([e[i] / 10, 256 - e[i + 1] / 10]); return a; };
    for (const key of sampleKeys) {
      const t = readTile(key), rings = (t.b || []).map((e) => tileLoc(e, 3)).filter((r) => r.length >= 3);
      const lines = (t.r || []).map((e) => tileLoc(e, 4)).filter((l) => l.length >= 2);
      const buildings = rings.map((ring) => {
        const ob = G.obbOf(ring);
        const pts = [[ob.cx, ob.cz], [ob.cx + 3.3, ob.cz - 2.1], [ring[0][0], ring[0][1]], [ring[0][0] + 0.01, ring[0][1] + 0.01], [-5, -5]].map(([x, z]) => G.inRing(x, z, ring));
        return { area: G.ringArea(ring), ob, rects: G.rectsOf(ring, ob), pts };
      });
      const paths = lines.map((l) => {
        const p = new G.Path(l), probe = [];
        for (const s of [-3, 0, p.len * 0.25, p.len * 0.5, p.len + 4]) { probe.push(p.raw(s), p.at(s), p.xz(s, 1.7), p.xz(s, -2.5)); }
        for (const [x, z] of [[10, 10], [128, 128], [250, 20]]) probe.push(p.project(x, z));
        return { len: p.len, cum: p.cum.length, probe, polyLen: G.polyLen(l) };
      });
      const ch = G.chain(lines.slice(0, 40), 12, 0.25), ch2 = G.chain(lines.slice(0, 40), 3, 0.8);
      o[key] = hashOf({ buildings, paths, chain: ch, chain2: ch2, nChain: ch.length });
    }
    const gr = new G.Grid(0, 0, 40, 40, 0.5); // (the ground grid itself is hashed with every tile)
    return { perTile: o, grid: hashOf({ w: gr.w, h: gr.h, cell: gr.cell, a: gr.a }) };
  });
  // street.js crossSection on a grid of inputs (dress / localeL need a whole built street and are not driven)
  res.street = safe('street', () => {
    const S = M.street, out = [];
    for (const cls of ['residential', 'pedestrian', 'primary', 'secondary', 'tertiary', 'trunk', 'living_street', undefined]) for (const lanes of [1, 2, 4]) for (const bike of [false, true]) {
      for (const [cb, cf] of [[3, 3], [6, 9], [12, 12], [20, 5]]) for (const night of [false, true]) for (const road of [null, { w: 5, bike: false }, { w: 9, bike: true }]) {
        out.push(S.crossSection({ cls, lanes, bike }, cb, cf, night, road));
      }
    }
    skipped['pure:street.dress/localeL'] = 'need a built street (W.path, W.anchors, W.clsAt): not driven';
    return hashOf(out);
  });
  // districts.js
  res.districts = safe('districts', () => {
    const D = M.districts;
    D.setDistrictData(JSON.parse(fs.readFileSync(path.join(DATA, 'buurten.geojson'), 'utf8')));
    const pts = [], [x0, y0, x1, y1] = ix.extent;
    for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) pts.push(D.spotAt(x0 + ((i + 0.5) * (x1 - x0)) / 20, y0 + ((j + 0.5) * (y1 - y0)) / 20));
    const named = [[500, 1000], [-1300, 750], [960, 570], [2400, 1100], [-2000, 4000]].map(([x, y]) => D.spotAt(x, y));
    return { grid: hashOf(pts), named: hashOf(named), tables: hashOf({ ARCHETYPES: D.ARCHETYPES, DISTRICTS: D.DISTRICTS }), distinct: new Set(pts).size };
  });
  // the terrain functions made by setupTerrain, and the whole-city backdrop (ground relief + every building as a block)
  res.terrain = safe('terrain', () => {
    if (!city) return { skipped: 'no city' };
    const [x0, y0, x1, y1] = ix.extent, pts = [];
    for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) { const mx = x0 + ((i + 0.37) * (x1 - x0)) / 20, my = y0 + ((j + 0.61) * (y1 - y0)) / 20; pts.push([city.landAt(mx, my), city.waterAt(mx, my)]); }
    for (const k of keys.slice(0, 20)) { const [tx, ty] = k.split('_').map(Number); pts.push([city.landAt(tx * 256 + 100.3, ty * 256 + 50.7), city.waterAt(tx * 256 + 100.3, ty * 256 + 50.7)]); }
    return { points: hashOf(pts), terr: hashOf(city.terr) };
  });
  res.cityModel = safe('cityModel', () => {
    if (!city || !W.cityModel) return { skipped: 'cityModel not found or no city' };
    const t1 = realNow(), M2 = W.cityModel(city);
    const plane = hashTree(M2.plane), far = hashTree(M2.far), fine = M2.fine.map((c) => hashTree(c.inst).all);
    log(`cityModel ${(realNow() - t1).toFixed(0)}ms`);
    return { plane: plane.all, far: far.all, fine: hashOf(fine), nFine: fine.length, tw: M2.tw, th: M2.th, reach: M2.reach, blocks: far.instances + 0 };
  });
  // the crowd's palettes
  res.crowd = await safeA('crowd', async () => {
    const c = await tryImp('voxel/crowd.js', 'pure:crowd');
    if (!c) return { skipped: skipped['pure:crowd'] };
    return { SKINS: hashOf(c.SKINS), SHIRTS: hashOf(c.SHIRTS), PANTS: hashOf(c.PANTS), HAIRS: hashOf(c.HAIRS), PED: c.PED, ids: [c.PED, c.BIKE_, c.CAR_, c.TRAM_] };
  });
  // world.js pure helpers (found by name in whichever module exports them)
  res.world = await safeA('world pure', async () => {
    const f = prep.located.buildTile;
    if (!f) return { skipped: 'world module not found' };
    const m = await imp(f), o = {};
    if (m.zebrasOn) o.zebras = hashOf(Array.from({ length: 80 }, (_, i) => m.zebrasOn(i * 0.9)));
    else o.zebras = { skipped: 'zebrasOn not exported' };
    if (m.cutLimit && m.cutWeight && m.U) {
      const U = m.U, keep = [U.uFocus.value.clone(), U.uCamDir.value.clone(), U.uTan.value, U.uR.value, U.uCut.value, U.uHalf.value], pts = [];
      U.uFocus.value.set(3, 0, 4); U.uCamDir.value.set(0.6, 0.8); U.uTan.value = 0.55; U.uR.value = 40; U.uCut.value = 1; U.uHalf.value = 0.5;
      for (let z = -60; z <= 60; z += 7.5) for (let x = -60; x <= 60; x += 7.5) for (const r of [2, 5, 9]) pts.push([m.cutLimit(x, z, r), m.cutWeight(x, z, r)]);
      U.uFocus.value.copy(keep[0]); U.uCamDir.value.copy(keep[1]); U.uTan.value = keep[2]; U.uR.value = keep[3]; U.uCut.value = keep[4]; U.uHalf.value = keep[5];
      o.cut = hashOf(pts);
    } else o.cut = { skipped: 'cutLimit / cutWeight / U not exported' };
    if (m.C) o.C = hashOf(m.C);
    if (m.EX !== undefined) o.EX = m.EX;
    if (m.LAMP_KIND) o.LAMP_KIND = hashOf(m.LAMP_KIND);
    if (m.LAMP_GLSL) o.LAMP_GLSL = sha8(m.LAMP_GLSL);
    if (m.CUT) o.CUT = hashOf({ ...m.CUT, solid: m.CUT.solid && m.CUT.solid.type, glow: undefined, depth: undefined });
    if (m.U) o.U = hashOf(Object.fromEntries(Object.entries(m.U).map(([k, v]) => [k, v && v.value && v.value.isTexture ? 'tex' : v && v.value])));
    skipped['pure:world.classAt'] = 'reads tiles registered by the Streamer, which is not run: returns 255 for every point';
    return o;
  });
  // gags.js
  res.gags = await safeA('gags', async () => {
    const g = await tryImp('voxel/gags.js', 'pure:gags');
    if (!g) return { skipped: skipped['pure:gags'] };
    const meta = JSON.parse(fs.readFileSync(path.join(DATA, 'meta.json'), 'utf8')), bu = JSON.parse(fs.readFileSync(path.join(DATA, 'buurten.geojson'), 'utf8'));
    const props = bu.features.map((f) => f.properties).filter((p) => p && p.cat).slice(0, 60);
    const T = g.sceneTable(), names = Object.keys(T);
    const mixes = props.map((p) => g.mixFor(p.cat, meta.cats));
    let seed = 7;
    const dice = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const picks = [];
    for (let lv = 1; lv <= 5; lv++) for (let i = 0; i < 80; i++) {
      const mix = mixes[(i * 7 + lv) % mixes.length], pool = names.filter((n) => (T[n].w[lv - 1] || 0) > 0 && dice() < 0.8);
      picks.push(g.castScene(pool, (n) => T[n].w[lv - 1] * (mix.factor[n] ?? 1), i % 3 ? [] : names.slice(0, 3), dice, i % 2 === 0, g.CASTING));
    }
    return { THEMES: hashOf(g.THEMES), GAG_NAMES: hashOf(g.GAG_NAMES), sceneTable: hashOf(T), mixFor: hashOf(mixes), castScene: hashOf(picks), CASTING: hashOf(g.CASTING), DEFAULT_STAGE: hashOf(g.DEFAULT_STAGE), nScenes: names.length };
  });
  // stage.js: the sun and the sky by the clock
  res.sky = await safeA('stage', async () => {
    const st = await tryImp('voxel/stage.js', 'pure:stage');
    if (!st) return { skipped: skipped['pure:stage'] };
    const list = [];
    for (let m = 0; m < 12; m++) for (const [h, mi] of [[3, 0], [8, 30], [13, 15], [21, 45]]) list.push(st.skyAt(new Date(Date.UTC(2026, m, 15, h, mi, 0))));
    return { n: list.length, hash: hashOf(list), VIEW_TAN: st.VIEW_TAN, EXIT_DIST: st.EXIT_DIST };
  });
  // data tables the city is made from
  res.tables = safe('tables', () => ({
    POI_CATS: M.poicats && hashOf([M.poicats.POI_CATS, M.poicats.POI_FLAG]), SPECIAL_PARTS: M.special && hashOf(M.special.SPECIAL_PARTS), PLACES: M.places && hashOf(M.places.PLACES),
  }));
  return res;
}

// ---------------------------------------------------------------- run
let done = 0;
if (want('tile') || want('fronts')) {
  for (const key of processing) {
    const t1 = realNow();
    const e = (out.tiles[key] = {});
    if (want('tile') && city) Object.assign(e, tilePart(key, keys.indexOf(key)));
    if (want('fronts') && city) e.fronts = safe('fronts', () => frontsPart(key));
    done++;
    log(`tile ${key} (${done}/${processing.length}) ${(realNow() - t1).toFixed(0)}ms` + (e['tile.lod0.day'] && e['tile.lod0.day'].vertices !== undefined ? ` lod0 verts ${e['tile.lod0.day'].vertices}` : '') + (e.fronts && e.fronts.nUnits !== undefined ? ` units ${e.fronts.nUnits}` : ''));
    if (global.gc) global.gc();
  }
}
if (want('brands')) { log('brands'); out.brands = safe('brands', brandsPart); }
if (want('statues')) { log('statues'); out.statues = safe('statues', statuesPart); }
if (want('actors')) { log('actors'); out.actors = safe('actors', actorsPart); }
if (want('pure')) { log('pure'); out.pure = await purePart(); }
out.meta.mathRandomCalls = stubs.rnd.calls;
out.meta.mathRandomApp = { calls: stubs.rnd.app, callers: stubs.rnd.callers };
out.meta.dateNowCalls = stubs.clock.dateNow;
out.meta.skipped = skipped;
out.meta.variants = VARIANTS.map((v) => v[0]);
out.meta.errors = diag; // exceptions swallowed while drawing (a drawer that throws in both versions is NOT compared past the throw)

// ---------------------------------------------------------------- write (keys sorted, one line per tile / entry)
function sorted(v) {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
  return v;
}
function pretty(v, depth) {
  if (depth >= 3 || !v || typeof v !== 'object' || Array.isArray(v)) return JSON.stringify(v);
  const ks = Object.keys(v);
  if (!ks.length) return '{}';
  const pad = ' '.repeat(depth + 1);
  return '{\n' + ks.map((k) => pad + JSON.stringify(k) + ': ' + pretty(v[k], depth + 1)).join(',\n') + '\n' + ' '.repeat(depth) + '}';
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, pretty(sorted(out), 0) + '\n');
log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(2)} MB); swallowed exceptions: ${diag.count}`);
if (!opt.keep) fs.rmSync(work, { recursive: true, force: true });
process.exit(0);
