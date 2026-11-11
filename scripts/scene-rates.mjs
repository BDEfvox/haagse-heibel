// How often does each scene OPEN a street, and what does the casting rule (CASTING in src/voxel/gags.js) do to that?
// Run: node scripts/scene-rates.mjs [visits]. It walks random streets, with each neighbourhood's real crime mix and each
// street's level, and draws the opening scene with the same code the site uses (castScene). What it cannot know is
// whether a street has the furniture a scene needs (racks, parked cars, a free stretch of pavement): AVAIL below is a
// rough guess of how often each scene can play, so read the numbers as shares, not as measurements.
import fs from 'node:fs';
import { castScene, sceneTable, mixFor, CASTING } from '../src/voxel/gags.js';

const root = new URL('../public/data/', import.meta.url);
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, root), 'utf8'));
const streets = read('streets.geojson').features.map((f) => f.properties).filter((p) => p.level);
const buurt = new Map(read('buurten.geojson').features.map((f) => [f.properties.code, f.properties]));
const cats = read('meta.json').cats, T = sceneTable(), names = Object.keys(T);
const AVAIL = { bikeThief: 0.45, carBreakIn: 0.7, fireworks: 0.75, carChase: 0.6, fenderBender: 0.6, plofkraak: 0.4, shopHeist: 0.35, herringHeist: 0.3, napCat: 0.6, pigeonLady: 0.6, scooterSnatch: 0.6 };
const table = streets.map((p) => {
  const b = buurt.get(p.buurt), fac = b && b.cat ? mixFor(b.cat, cats).factor : {}, w = {};
  for (const n of names) { const v = T[n].w[p.level - 1] * (fac[n] ?? 1); if (v > 0) w[n] = v; }
  return { lv: p.level, w };
});
let seed = 7;
const dice = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
function run(visits, C, memory) {
  const cnt = {}, seen = [];
  let n = 0, twice = 0, last = null;
  for (let i = 0; i < visits; i++) {
    const s = table[(dice() * table.length) | 0], here = Object.keys(s.w).filter((k) => (AVAIL[k] ?? 1) > dice());
    const crime = here.filter((k) => T[k].crime), pool = s.lv > 1 && crime.length ? crime : here;
    const pick = castScene(pool, (k) => s.w[k], memory ? seen : [], dice, true, C);
    if (!pick) continue;
    if (memory) { const j = seen.indexOf(pick); if (j >= 0) seen.splice(j, 1); seen.unshift(pick); seen.length = Math.min(seen.length, C.seen.length); }
    if (pick === last) twice++;
    last = pick; cnt[pick] = (cnt[pick] || 0) + 1; n++;
  }
  return { share: Object.fromEntries(names.map((k) => [k, (100 * (cnt[k] || 0)) / n])), twice: (100 * twice) / n };
}
const visits = Number(process.argv[2]) || 200000;
const old = run(visits, { gamma: 60, floor: 0, seen: [] }, false), now = run(visits, CASTING, true);
console.log(`Opening scene per street visit, ${visits} random visits (share in %)\n`);
console.log('scene'.padEnd(15) + 'always the heaviest'.padStart(20) + 'casting now'.padStart(14));
for (const k of names.slice().sort((a, b) => now.share[b] - now.share[a])) console.log(k.padEnd(15) + old.share[k].toFixed(1).padStart(20) + now.share[k].toFixed(1).padStart(14));
console.log('\nsame scene twice in a row'.padEnd(16) + `   before ${old.twice.toFixed(1)}%   now ${now.twice.toFixed(1)}%`);
