// node test/brands.test.mjs : runs the name parody over every real name in .cache/osm-pois.json and checks the chain table.
// Prints: unchanged count (must be 0), longest result, rude hits, chain coverage of the most frequent brands,
// and 60 random before/after pairs to read.
import fs from 'node:fs';
import { parodyName, signFor, chainOf, CHAINS, CAT_LOOK, GLYPHS, norm } from '../src/voxel/brands.js';
import { POI_CATS } from '../src/voxel/poicats.js';

const els = JSON.parse(fs.readFileSync(new URL('../.cache/osm-pois.json', import.meta.url))).elements;
const names = new Map(); // name -> a cat guess
for (const e of els) { const t = e.tags || {}; if (t.name) names.set(t.name, t.shop || t.amenity || 'other'); }
let unchanged = 0, longest = '', rudeN = 0, empty = 0, bad = [];
const rows = [];
for (const [n, c] of names) {
  const p = parodyName(n, c);
  if (!p) empty++;
  if (norm(p) === norm(n)) { unchanged++; bad.push([n, p]); }
  if (p.length > longest.length) longest = p;
  if (/kut|tering|kanker|hoer|neuk|flikker|lul\b/i.test(p) && !/kut|tering|kanker|hoer|neuk|flikker|lul\b/i.test(n)) rudeN++;
  if (/[^\x20-\x7e -ÿ]/.test(p)) bad.push(['non-latin1', p]);
  rows.push([n, p]);
}
console.log(`names ${names.size}, unchanged ${unchanged}, empty ${empty}, rude ${rudeN}, longest ${longest.length} chars: "${longest}"`);
if (bad.length) console.log('PROBLEMS', bad.slice(0, 10));
// deterministic?
let nondet = 0; for (const [n, c] of names) if (parodyName(n, c) !== parodyName(n, c)) nondet++;
console.log('nondeterministic', nondet);
// chain table: sign lengths, glyphs, colours
let tooLong = 0, badG = 0;
for (const ch of CHAINS) {
  if (ch.name.length > 17) { tooLong++; console.log('long', ch.name); }
  if (ch.mark && !GLYPHS[ch.mark.g]) { badG++; console.log('no glyph', ch.mark.g); }
}
for (const k of Object.keys(CAT_LOOK)) { if (!POI_CATS.includes(k)) console.log('cat not in POI_CATS', k); }
for (const k of POI_CATS) { if (!CAT_LOOK[k]) console.log('POI cat without look', k); }
console.log(`chains ${CHAINS.length}, too long ${tooLong}, bad glyphs ${badG}`);
// coverage: the 100 most frequent brands (by name) resolve to a chain?
const cnt = {};
for (const e of els) { const t = e.tags || {}; const b = t.brand || t.name; if (b && t.name) { const k = t.name; cnt[k] = (cnt[k] || 0) + 1; } }
const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 130);
const miss = top.filter(([k]) => !chainOf(k));
console.log(`top-130 names covered by a chain line: ${top.length - miss.length}/${top.length}`);
console.log('not in the table:', miss.map(([k, n]) => `${k}(${n})`).join(', '));
// brand-tagged POIs resolved from the name alone
let withBrand = 0, ok = 0;
for (const e of els) { const t = e.tags || {}; if (!t.brand || !t.name) continue; withBrand++; if (chainOf(t.name)) ok++; }
console.log(`POIs with a brand tag whose name resolves to a chain: ${ok}/${withBrand}`);
// the same shop name gives the same sign anywhere
console.log(JSON.stringify(signFor('burger', "McDonald's", 2)), JSON.stringify(signFor('bakery', null, 0, 3)));
// 60 random pairs (seeded so reruns show the same list)
let s = 12345; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
const pick = [...rows]; for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
for (const [a, b] of pick.slice(0, 60)) console.log(`${a.padEnd(38)} -> ${b}`);
process.exitCode = unchanged || empty || rudeN || bad.length ? 1 : 0;
