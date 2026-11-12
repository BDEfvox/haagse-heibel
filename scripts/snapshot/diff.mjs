#!/usr/bin/env node
// node scripts/snapshot/diff.mjs a.json b.json   -> prints IDENTICAL, or the differing keys grouped by part and tile; exit 1 on a difference.
// `meta` (paths, timings, file hashes, patch list) is not compared; a changed source file list is shown for information.
import fs from 'node:fs';
const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('usage: node scripts/snapshot/diff.mjs a.json b.json [--max N]'); process.exit(2); }
const maxI = process.argv.indexOf('--max');
const MAX = maxI > 0 ? parseInt(process.argv[maxI + 1], 10) : 40;
const A = JSON.parse(fs.readFileSync(a, 'utf8')), B = JSON.parse(fs.readFileSync(b, 'utf8'));
const diffs = []; // { part, tile, path }
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function walk(x, y, p, part, tile) {
  if (JSON.stringify(x) === JSON.stringify(y)) return;
  if (isObj(x) && isObj(y)) {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (!(k in x)) diffs.push({ part, tile, path: [...p, k].join('.'), note: 'only in B' });
      else if (!(k in y)) diffs.push({ part, tile, path: [...p, k].join('.'), note: 'only in A' });
      else walk(x[k], y[k], [...p, k], part, tile);
    }
  } else if (Array.isArray(x) && Array.isArray(y)) {
    // lists of "id:hash" strings: report by id; others by index
    const keyed = x.every((s) => typeof s === 'string' && /^[^:|]+[:|]/.test(s)) && y.every((s) => typeof s === 'string' && /^[^:|]+[:|]/.test(s));
    if (keyed) {
      const id = (s) => s.split(/[:|]/)[0];
      const mx = new Map(x.map((s) => [id(s), s])), my = new Map(y.map((s) => [id(s), s]));
      for (const k of new Set([...mx.keys(), ...my.keys()])) {
        if (!mx.has(k)) diffs.push({ part, tile, path: [...p, `[${k}]`].join('.'), note: 'only in B' });
        else if (!my.has(k)) diffs.push({ part, tile, path: [...p, `[${k}]`].join('.'), note: 'only in A' });
        else if (mx.get(k) !== my.get(k)) diffs.push({ part, tile, path: [...p, `[${k}]`].join('.') });
      }
    } else {
      if (x.length !== y.length) diffs.push({ part, tile, path: p.join('.'), note: `length ${x.length} vs ${y.length}` });
      for (let i = 0; i < Math.min(x.length, y.length); i++) walk(x[i], y[i], [...p, `[${i}]`], part, tile);
    }
  } else diffs.push({ part, tile, path: p.join('.') });
}
for (const part of new Set([...Object.keys(A), ...Object.keys(B)])) {
  if (part === 'meta') continue;
  if (part === 'tiles') {
    const ta = A.tiles || {}, tb = B.tiles || {};
    for (const k of new Set([...Object.keys(ta), ...Object.keys(tb)])) {
      if (!(k in ta)) diffs.push({ part: 'tiles', tile: k, path: '', note: 'tile only in B' });
      else if (!(k in tb)) diffs.push({ part: 'tiles', tile: k, path: '', note: 'tile only in A' });
      else walk(ta[k], tb[k], [], 'tiles', k);
    }
  } else walk(A[part], B[part], [], part, null);
}
const info = [];
if (A.meta && B.meta) {
  if (A.meta.srcHash !== B.meta.srcHash) {
    const fa = A.meta.srcFiles || {}, fb = B.meta.srcFiles || {};
    const ch = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter((f) => fa[f] !== fb[f]).sort();
    info.push(`source differs (${ch.length} files): ${ch.slice(0, 12).join(', ')}${ch.length > 12 ? ', ...' : ''}`);
  } else info.push('source trees are identical');
  if (A.meta.dataHash !== B.meta.dataHash) info.push('WARNING: the world data differs between the two snapshots (dataHash ' + A.meta.dataHash + ' vs ' + B.meta.dataHash + '): differences may come from the data, not the code');
  if (A.meta.toolVersion !== B.meta.toolVersion) info.push('WARNING: snapshots were made by different tool versions (' + A.meta.toolVersion + ' vs ' + B.meta.toolVersion + ')');
  const sk = (m) => JSON.stringify(m.skipped || {}), parts = (m) => JSON.stringify(m.parts);
  if (sk(A.meta) !== sk(B.meta)) info.push('NOTE: the lists of skipped checks differ: A ' + sk(A.meta) + ' / B ' + sk(B.meta));
  if (parts(A.meta) !== parts(B.meta)) info.push('NOTE: parts differ: A ' + parts(A.meta) + ' / B ' + parts(B.meta));
  if (JSON.stringify(A.meta.mathRandomApp) !== JSON.stringify(B.meta.mathRandomApp)) info.push('NOTE: Math.random use by app code differs: A ' + JSON.stringify(A.meta.mathRandomApp) + ' / B ' + JSON.stringify(B.meta.mathRandomApp));
}
if (!diffs.length) { console.log('IDENTICAL'); for (const i of info) console.log('  ' + i); process.exit(0); }
const groups = new Map();
for (const d of diffs) { const g = d.part + (d.tile ? ' / tile ' + d.tile : ''); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(d); }
console.log(`DIFFERENT: ${diffs.length} differing keys in ${groups.size} groups`);
const byPart = {};
for (const d of diffs) byPart[d.part] = (byPart[d.part] || 0) + 1;
console.log('  per part: ' + Object.entries(byPart).map(([k, v]) => `${k}=${v}`).join(', '));
if (A.tiles && B.tiles) {
  const tl = new Set(diffs.filter((d) => d.part === 'tiles').map((d) => d.tile));
  console.log(`  tiles affected: ${tl.size}`);
  // which keys of a tile entry differ, over all tiles
  const kinds = {};
  for (const d of diffs.filter((x) => x.part === 'tiles')) { const k = d.path.split('.').slice(0, d.path.startsWith('tile.') ? 3 : 1).join('.'); kinds[k] = (kinds[k] || 0) + 1; }
  console.log('  by entry: ' + Object.entries(kinds).sort().map(([k, v]) => `${k}=${v}`).join(', '));
}
let shown = 0;
for (const [g, list] of groups) {
  if (shown++ >= MAX) { console.log(`  ... ${groups.size - MAX} more groups (use --max N)`); break; }
  console.log(`- ${g}`);
  for (const d of list.slice(0, 12)) console.log(`    ${d.path || '(whole)'}${d.note ? '  [' + d.note + ']' : ''}`);
  if (list.length > 12) console.log(`    ... ${list.length - 12} more`);
}
for (const i of info) console.log('  ' + i);
process.exit(1);
