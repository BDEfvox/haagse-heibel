// node test/fronts.test.mjs [tileKey ...] : builds the front units of real tiles, prints which real places took which
// front, and checks that the dry run (frontInfo) and the real drawing consume the same dice and make the same boxes.
import fs from 'node:fs';
globalThis.document = { createElement: () => ({ getContext: () => ({ measureText: (t) => ({ width: t.length * 16 }), fillRect() {}, fillText() {}, strokeRect() {} }) }) };
const { frontsOf, drawHero, unitRng } = await import('../src/voxel/world.js');
const { Vox } = await import('../src/voxel/kit.js');
const dir = new URL('../public/data/world/tiles/', import.meta.url).pathname;
let keys = process.argv.slice(2);
if (!keys.length) {
  const all = fs.readdirSync(dir).map((f) => f.replace('.json', ''));
  const sc = all.map((k) => { const t = JSON.parse(fs.readFileSync(dir + k + '.json')); return [k, (t.ps || []).length / 3]; }).sort((a, b) => b[1] - a[1]);
  keys = sc.slice(0, 3).map((x) => x[0]);
}
for (const key of keys) {
  const t = JSON.parse(fs.readFileSync(dir + key + '.json'));
  const F = frontsOf(key, t);
  const shops = F.units.filter((u) => u.shop), heads = shops.filter((u) => u.shop.head);
  const byCat = {}; for (const u of heads) byCat[u.shop.cat] = (byCat[u.shop.cat] || 0) + 1;
  const poi = (t.ps || []).length / 3;
  console.log(`tile ${key}: points ${t.p ? t.p.length : 0} (ps ${poi}), units ${F.units.length}, shop units ${shops.length}, shops ${heads.length}, spans>1 ${heads.filter((u) => u.shop.k > 1).length}, atms ${F.units.filter((u) => u.atm).length}`);
  console.log(' ', JSON.stringify(byCat));
  let bad = 0, maxN = 0, tot = 0;
  for (const u of shops.slice(0, 120)) {
    const a = new Vox(1, true), b = new Vox(2, true), c = new Vox(1, true), d = new Vox(2, true);
    const h1 = drawHero(a, b, u, unitRng(u), false, true);
    const h2 = drawHero(c, d, u, unitRng(u), false, false);
    if (a.n !== c.n || b.n !== d.n || h1.door.x !== h2.door.x) bad++;
    maxN = Math.max(maxN, c.n + d.n); tot += c.n + d.n;
  }
  console.log(`  dry vs real mismatches ${bad}; vertices per shop front: max ${maxN}, mean ${Math.round(tot / Math.max(1, Math.min(120, shops.length)))}`);
  for (const u of heads.slice(0, 25)) console.log(`   ${u.shop.cat.padEnd(12)} ${String(u.shop.real || '-').padEnd(30)} -> ${u.shop.sign.text} (${u.shop.sign.kind}, ${u.shop.k} unit${u.shop.k > 1 ? 's' : ''}, ${u.shop.look.win})`);
}
