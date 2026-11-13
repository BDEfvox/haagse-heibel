// node test/brands.test.mjs [--verbose] : runs the shop-name parody over every (name, category) pair in the committed
// city tiles (public/data/world/tiles/*.json, keys `pn` and `ps`) and checks the chain table.
// Assertions (the exit code is 1 if any is violated): no parody equals its real name or is empty, none is longer than the
// 16 characters a sign holds, no rude word appears that the real name did not have, all output is latin-1, the output is
// deterministic, every chain name fits a sign, every chain glyph exists, and POI_CATS and CAT_LOOK list the same categories.
// Information (printed, never fails): how many of the most frequent names resolve to a chain, the brand-tagged names,
// the longest parody, and with --verbose the list of unresolved names and 60 seeded before/after pairs to read.
// What the tiles hold: for points flagged `chain` (flag 2) the name is the OSM `brand` tag, otherwise the `name` tag, and
// names are cut at 40 characters. The category is the project's own (POI_CATS), passed to chainOf and parodyName.
import fs from 'node:fs';
import { parodyName, signFor, chainOf, CHAINS, CAT_LOOK, GLYPHS, norm } from '../src/voxel/brands.js';
import { POI_CATS, POI_FLAG } from '../src/voxel/poicats.js';

const verbose = process.argv.includes('--verbose');
const failures = [];
const fail = (what, cases) => { failures.push(what); console.log(`FAIL ${what}: ${cases.length}`); for (const c of cases.slice(0, 10)) console.log('  ' + c); if (cases.length > 10) console.log(`  ... ${cases.length - 10} more`); };

// ---- every distinct (name, category) in the tiles, and how often each name occurs
const dir = new URL('../public/data/world/tiles/', import.meta.url);
const pairs = new Map(); // name \0 cat -> [name, cat]
const freq = new Map(); // name -> points carrying it
const flagged = new Map(); // name -> points flagged chain
let points = 0, named = 0, chainPoints = 0, cut = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const t = JSON.parse(fs.readFileSync(new URL(f, dir)));
  if (!t.ps) continue;
  for (let i = 0; i < t.ps.length; i += 3) {
    points++;
    const ni = t.ps[i + 1], name = ni >= 0 && t.pn ? t.pn[ni] : null;
    if (!name) continue;
    named++;
    const cat = POI_CATS[t.ps[i]] || 'other', isChain = (t.ps[i + 2] & POI_FLAG.CHAIN) !== 0;
    pairs.set(name + '\0' + cat, [name, cat]);
    freq.set(name, (freq.get(name) || 0) + 1);
    if (name.length >= 40) cut++;
    if (isChain) { chainPoints++; flagged.set(name, (flagged.get(name) || 0) + 1); }
  }
}
const list = [...pairs.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
if (!list.length) { console.log('FAIL no names found in public/data/world/tiles'); process.exit(1); }
console.log(`tiles: ${points} points, ${named} named, ${list.length} distinct (name, category) pairs, ${chainPoints} chain-flagged points with ${flagged.size} distinct brand names, ${cut} points whose name is 40 characters long (the cut)`);

// ---- the parody of every pair
const RUDE = /kut|tering|kanker|hoer|neuk|flikker|lul\b/i;
const unchanged = [], empty = [], rude = [], notLatin1 = [], tooLong = [], nondet = [];
let longest = '';
const rows = [];
for (const [n, c] of list) {
  const p = parodyName(n, c);
  if (!p) empty.push(`"${n}" (${c})`);
  if (norm(p) === norm(n)) unchanged.push(`"${n}" (${c}) -> "${p}"`);
  if (p.length > longest.length) longest = p;
  if (p.length > 16) tooLong.push(`"${n}" (${c}) -> "${p}" (${p.length})`);
  if (RUDE.test(p) && !RUDE.test(n)) rude.push(`"${n}" (${c}) -> "${p}"`);
  if (/[^\x20-\x7e\xa0-\xff]/.test(p)) notLatin1.push(`"${n}" (${c}) -> "${p}"`);
  if (parodyName(n, c) !== p) nondet.push(`"${n}" (${c})`);
  rows.push([n, p]);
}
if (unchanged.length) fail('parody equal to the real name', unchanged);
if (empty.length) fail('empty parody', empty);
if (tooLong.length) fail('parody longer than 16 characters', tooLong);
if (rude.length) fail('rude word introduced by the parody', rude);
if (notLatin1.length) fail('parody outside latin-1', notLatin1);
if (nondet.length) fail('parody differs between two calls', nondet);
console.log(`parody: ${list.length} pairs, unchanged ${unchanged.length}, empty ${empty.length}, too long ${tooLong.length}, rude ${rude.length}, not latin-1 ${notLatin1.length}, nondeterministic ${nondet.length}; longest ${longest.length} chars "${longest}"`);

// ---- the chain table
const longChain = CHAINS.filter((ch) => ch.name.length > 17).map((ch) => ch.name);
const noGlyph = CHAINS.filter((ch) => ch.mark && !GLYPHS[ch.mark.g]).map((ch) => `${ch.name}: ${ch.mark.g}`);
const lookNotCat = Object.keys(CAT_LOOK).filter((k) => !POI_CATS.includes(k)).map((k) => 'CAT_LOOK key not in POI_CATS: ' + k);
const catNoLook = POI_CATS.filter((k) => !CAT_LOOK[k]).map((k) => 'POI_CATS entry without a look: ' + k);
if (longChain.length) fail('chain name longer than 17 characters', longChain);
if (noGlyph.length) fail('chain mark glyph does not exist', noGlyph);
if (lookNotCat.length) fail('CAT_LOOK key missing from POI_CATS', lookNotCat);
if (catNoLook.length) fail('POI_CATS entry without CAT_LOOK', catNoLook);
console.log(`chains: ${CHAINS.length}, name too long ${longChain.length}, bad glyphs ${noGlyph.length}, category mismatches ${lookNotCat.length + catNoLook.length}`);

// ---- information: how well the chain table covers the real names
const catOf = new Map(); // name -> its first category, as the sign would see it
for (const [n, c] of list) if (!catOf.has(n)) catOf.set(n, c);
const top = [...freq].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 130);
const miss = top.filter(([k]) => !chainOf(k, catOf.get(k)));
console.log(`top ${top.length} names (by points) covered by a chain line: ${top.length - miss.length}/${top.length}`);
let brandOk = 0;
for (const k of flagged.keys()) if (chainOf(k, catOf.get(k))) brandOk++;
console.log(`chain-flagged (brand) names that resolve to a chain: ${brandOk}/${flagged.size}`);
const sampleSign = (cat, name, fl, seed) => JSON.stringify(signFor(cat, name, fl, seed));
console.log(sampleSign('burger', "McDonald's", 2, 0).slice(0, 120));
console.log(sampleSign('bakery', null, 0, 3).slice(0, 120));

if (verbose) {
  console.log('not in the table:', miss.map(([k, n]) => `${k}(${n})`).join(', '));
  // 60 pairs, seeded so reruns show the same list
  let s = 12345; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const pick = rows.slice(); for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
  for (const [a, b] of pick.slice(0, 60)) console.log(`${a.padEnd(42)} -> ${b}`);
}

console.log(failures.length ? `brands test FAILED (${failures.length}): ${failures.join('; ')}` : 'brands test passed');
process.exit(failures.length ? 1 : 0);
