// Validates the statue recipe files against the schema in src/voxel/statues/kit.js, dry-runs the kit to count boxes.
// Usage: node scripts/check-statues.mjs [--quiet] [--list]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src/voxel/statues');
const quiet = process.argv.includes('--quiet');
const ids = JSON.parse(fs.readFileSync(path.join(dir, 'ids.json'), 'utf8'));
const idSet = new Set(ids);
const kit = await import(pathToFileURL(path.join(dir, 'kit.js')).href);
const { MATS, POSES, HATS, HAIRS, HOLDS, FIG_OPTS, HORSE_OPTS, PLINTH_STYLES, ANIMALS, SPEC, drawStatue, makeRng, hooks } = kit;

const problems = [];
const bad = (file, id, msg) => problems.push(`${file} ${id}: ${msg}`);
const isHex = (c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
const goodCol = (c) => typeof c === 'string' && (c in MATS || isHex(c));
const num = (x) => typeof x === 'number' && isFinite(x);

function checkOpts(file, id, tag, o, allowed) {
  if (o === undefined) return;
  if (!o || typeof o !== 'object' || Array.isArray(o)) { bad(file, id, `${tag}: options must be an object`); return; }
  for (const k of Object.keys(o)) if (!allowed.includes(k)) bad(file, id, `${tag}: unknown option "${k}"`);
  if (o.hat !== undefined && !HATS.includes(o.hat)) bad(file, id, `${tag}: unknown hat "${o.hat}"`);
  if (o.hair !== undefined && !HAIRS.includes(o.hair)) bad(file, id, `${tag}: unknown hair "${o.hair}"`);
  if (o.hold !== undefined && !HOLDS.includes(o.hold)) bad(file, id, `${tag}: unknown hold "${o.hold}"`);
  for (const k of ['col2', 'seat']) if (o[k] !== undefined && !goodCol(o[k])) bad(file, id, `${tag}: bad colour in ${k}: ${o[k]}`);
}

function checkPart(file, id, a, where) {
  const tag = `${where} ${Array.isArray(a) ? a[0] : typeof a}`;
  if (!Array.isArray(a)) return bad(file, id, `${tag}: a part must be an array`);
  const t = a[0], spec = SPEC[t];
  if (!spec) return bad(file, id, `${tag}: unknown part type "${t}"`);
  const toks = spec.split(' '), need = toks.filter((s) => !s.endsWith('?')).length;
  const args = a.length - 1;
  if (args < need || args > toks.length) return bad(file, id, `${tag}: ${args} arguments, expected ${need === toks.length ? need : need + ' to ' + toks.length}`);
  toks.forEach((tk, i) => {
    const v = a[i + 1], opt = tk.endsWith('?'), k = tk[0];
    if (v === undefined || v === null) { if (!opt) bad(file, id, `${tag}: argument ${i + 1} missing`); return; }
    if (k === 'n' && !num(v)) bad(file, id, `${tag}: argument ${i + 1} is not a number (${JSON.stringify(v)})`);
    else if (k === 'c' && !goodCol(v)) bad(file, id, `${tag}: unknown colour "${v}"`);
    else if (k === 's' && typeof v !== 'string') bad(file, id, `${tag}: argument ${i + 1} must be a string`);
    else if (k === 'b' && typeof v !== 'boolean') bad(file, id, `${tag}: argument ${i + 1} must be true/false`);
    else if (k === 'p') { if (!Array.isArray(v) || v.length < 2 || !v.every((p) => Array.isArray(p) && p.length === 3 && p.every(num))) bad(file, id, `${tag}: points must be [[x, y, z], ...]`); }
    else if (k === 'o' && (typeof v !== 'object' || Array.isArray(v))) bad(file, id, `${tag}: options must be an object`);
  });
  if (t === 'fig') {
    if (!POSES.includes(a[6])) bad(file, id, `${tag}: unknown pose "${a[6]}"`);
    checkOpts(file, id, tag, a[7], FIG_OPTS);
    if (num(a[4]) && (a[4] < 0.2 || a[4] > 14)) bad(file, id, `${tag}: odd height ${a[4]}`);
  }
  if (t === 'bust') checkOpts(file, id, tag, a[6], FIG_OPTS);
  if (t === 'horse') {
    checkOpts(file, id, tag, a[6], HORSE_OPTS);
    const o = a[6];
    if (o && o.rider !== undefined && o.rider !== null && !POSES.includes(o.rider)) bad(file, id, `${tag}: unknown rider pose "${o.rider}"`);
    if (o) checkOpts(file, id, tag + ' riderOpts', o.riderOpts, FIG_OPTS);
  }
  if (t === 'animal' && !ANIMALS.includes(a[1])) bad(file, id, `${tag}: unknown animal "${a[1]}"`);
  if (t === 'plinth' && a[5] !== undefined && !PLINTH_STYLES.includes(a[5])) bad(file, id, `${tag}: unknown plinth style "${a[5]}"`);
  if (t === 'letters' && typeof a[4] === 'string' && a[4].length > 12) bad(file, id, `${tag}: at most 12 characters`);
  if (t === 'taper' && num(a[7]) && (a[7] < 0 || a[7] > 1)) bad(file, id, `${tag}: topScale must be 0..1`);
}

class Counter {
  constructor() { this.T = null; this.n = 0; }
  setT(a, x = 0, z = 0, y = 0) { this.T = a === undefined ? null : { c: Math.cos(a), s: Math.sin(a), x, y, z }; return this; }
  setB() { return this; }
  box(x, y, z, w, h, d) { this.n++; if (!(w > 0 && h > 0 && d > 0) || !isFinite(x + y + z + w + h + d)) this.bad = (this.bad || 0) + 1; }
}

const files = ['recipes-famous.js', 'recipes-1.js', 'recipes-2.js', 'recipes-3.js'];
const all = new Map(), per = {}, dup = [];
for (const f of files) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { per[f] = 'missing'; continue; }
  let mod;
  try { mod = await import(pathToFileURL(p).href); } catch (e) { bad(f, '-', 'cannot be loaded: ' + e.message); per[f] = 'error'; continue; }
  const rec = mod.default || {};
  per[f] = Object.keys(rec).length;
  for (const [id, r] of Object.entries(rec)) {
    if (!idSet.has(id)) bad(f, id, 'key is not in ids.json');
    if (all.has(id)) dup.push(`${id} in ${all.get(id).file} and ${f}`);
    if (!all.has(id) || f === 'recipes-famous.js') all.set(id, { file: f, r });
    if (!r || typeof r !== 'object') { bad(f, id, 'recipe must be an object'); continue; }
    if (typeof r.name !== 'string' || !r.name) bad(f, id, 'name missing');
    if (!Array.isArray(r.parts) || !r.parts.length) { bad(f, id, 'parts missing or empty'); continue; }
    if (r.face !== undefined && !num(r.face)) bad(f, id, 'face must be a number');
    for (const k of Object.keys(r)) if (!['name', 'parts', 'face', 'far'].includes(k)) bad(f, id, `unknown field "${k}"`);
    r.parts.forEach((a, i) => checkPart(f, id, a, `parts[${i}]`));
    if (r.far !== undefined) {
      if (!Array.isArray(r.far)) bad(f, id, 'far must be an array');
      else { r.far.forEach((a, i) => checkPart(f, id, a, `far[${i}]`)); if (r.far.length > 6) bad(f, id, `far has ${r.far.length} parts, at most 6`); }
    }
  }
}

// dry run
const counts = [], far = [], rows = [];
const warns = [];
hooks.warn = (m) => warns.push(m);
for (const [id, { file, r }] of all) {
  if (!r || !Array.isArray(r.parts)) continue;
  const before = warns.length;
  try {
    const out = {}, v = new Counter(), g = new Counter();
    const h = drawStatue(v, g, r, { night: true, lod: 0, rnd: makeRng(3), out });
    counts.push(v.n + g.n); rows.push([id, r.name, v.n + g.n, h, out.r]);
    if (v.bad || g.bad) bad(file, id, `${(v.bad || 0) + (g.bad || 0)} boxes with non-finite or non-positive numbers`);
    if (v.n + g.n > 350) bad(file, id, `${v.n + g.n} boxes (limit about 350)`);
    if (h > 40) bad(file, id, `height ${h.toFixed(1)} m looks wrong`);
    if (out.r > 50) bad(file, id, `footprint radius ${out.r.toFixed(1)} m looks wrong`);
    const v2 = new Counter(), g2 = new Counter();
    drawStatue(v2, g2, r, { night: false, lod: 2, rnd: makeRng(3) });
    far.push(v2.n + g2.n);
    if (v2.n + g2.n > 6) bad(file, id, `far level draws ${v2.n + g2.n} boxes (at most 6)`);
  } catch (e) { bad(file, id, 'drawing failed: ' + e.message); }
  for (const w of warns.slice(before)) bad(file, id, 'kit warning: ' + w);
}

const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 0);
console.log('Statue recipes');
for (const f of files) console.log(`  ${f.padEnd(20)} ${per[f]}`);
console.log(`  recipes in total      ${all.size} of ${ids.length} landmarks (${ids.length - all.size} without)`);
if (dup.length) console.log(`  ids in two files      ${dup.length} (the famous file wins)${quiet ? '' : ': ' + dup.slice(0, 8).join('; ') + (dup.length > 8 ? ' ...' : '')}`);
console.log(`  boxes near level      median ${med(counts)}, max ${counts.length ? Math.max(...counts) : 0}, min ${counts.length ? Math.min(...counts) : 0}`);
console.log(`  boxes far level       median ${med(far)}, max ${far.length ? Math.max(...far) : 0}`);
if (process.argv.includes('--list')) for (const r of rows.sort((a, b) => b[2] - a[2])) console.log(`  ${String(r[2]).padStart(4)} boxes  ${r[3].toFixed(1).padStart(5)} m  r ${r[4].toFixed(1).padStart(4)}  ${r[0]}  ${r[1]}`);
console.log(`  problems              ${problems.length}`);
for (const p of problems.slice(0, quiet ? 20 : 400)) console.log('  - ' + p);
if (problems.length > (quiet ? 20 : 400)) console.log(`  ... and ${problems.length - (quiet ? 20 : 400)} more`);
process.exit(problems.length ? 1 : 0);
