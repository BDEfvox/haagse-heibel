// node test/fronts.test.mjs [tileKey ...] : builds the front units of real tiles, prints which real places took which
// front, and checks for every unit (homes, shops, towers) that the dry run (frontInfo) and the real drawing consume the same
// dice and make the same boxes, by day and by night, and that a front's layout by night is the day's whatever the hour
// (litShare): door, window, sash, leaf, bell, chimney, cash machine and front the same; only the glass colours may differ.
import fs from 'node:fs';
globalThis.document = { createElement: () => ({ getContext: () => ({ measureText: (t) => ({ width: t.length * 16 }), fillRect() {}, fillText() {}, strokeRect() {} }) }) };
const { frontsOf, drawHero, unitRng, frontInfo } = await import('../src/voxel/world.js');
const { Vox } = await import('../src/voxel/kit.js');
const { litShare, releaseSign } = await import('../src/voxel/props.js');
const dir = new URL('../public/data/world/tiles/', import.meta.url).pathname;
let keys = process.argv.slice(2);
if (!keys.length) {
  const all = fs.readdirSync(dir).map((f) => f.replace('.json', ''));
  const sc = all.map((k) => { const t = JSON.parse(fs.readFileSync(dir + k + '.json')); return [k, (t.ps || []).length / 3]; }).sort((a, b) => b[1] - a[1]);
  keys = sc.slice(0, 3).map((x) => x[0]);
}
// the hours to compare: the stage's default share of lit windows, and a dimmer one late at night
const SHARES = [{ ...litShare }, { home: 0.31, shop: 0.4 }];
const saved = { ...litShare };
const setShare = (s) => { litShare.home = s.home; litShare.shop = s.shop; };
// what must not move between day and night (leaf.glass, leaf.lit and sash.glass are colours and may differ)
const layout = (h) => JSON.stringify({
  front: h.front, door: h.door, win: h.win, winY: h.winY, atm: h.atm ?? null, chimney: h.chimney ?? null,
  leaf: h.leaf ? { p: h.leaf.p, tv: h.leaf.tv, w: h.leaf.w, h: h.leaf.h, y: h.leaf.y, col: h.leaf.col, shop: h.leaf.shop, bell: h.leaf.bell } : null,
  sash: h.sash ? { p: h.sash.p, tv: h.sash.tv, w: h.sash.w, h: h.sash.h, y: h.sash.y } : null,
});
// everything a front reports (the dry run makes no sign plane, so that is left out)
const report = (h) => { const { u, info, sign, ...r } = h; const { sign: _s, ...inf } = info; return JSON.stringify([r, inf]); };
const draw = (u, night, dry) => {
  const v = new Vox(1, true), gl = new Vox(2, true);
  const h = drawHero(v, gl, u, unitRng(u), night, dry);
  if (h.sign) releaseSign(h.sign);
  return { h, n: v.n + '/' + gl.n };
};
const sameDraw = (a, b) => a.n === b.n && report(a.h) === report(b.h);
let fails = 0;
try {
  for (const key of keys) {
    const t = JSON.parse(fs.readFileSync(dir + key + '.json'));
    const F = frontsOf(key, t);
    const shops = F.units.filter((u) => u.shop), heads = shops.filter((u) => u.shop.head);
    const byCat = {}; for (const u of heads) byCat[u.shop.cat] = (byCat[u.shop.cat] || 0) + 1;
    const poi = (t.ps || []).length / 3;
    console.log(`tile ${key}: points ${t.p ? t.p.length : 0} (ps ${poi}), units ${F.units.length}, shop units ${shops.length}, shops ${heads.length}, spans>1 ${heads.filter((u) => u.shop.k > 1).length}, atms ${F.units.filter((u) => u.atm).length}`);
    console.log(' ', JSON.stringify(byCat));
    const bad = { dryDay: 0, dryNight: 0, infoDay: 0, infoNight: 0, nightLayout: 0, nightHours: 0 };
    let maxN = 0, tot = 0;
    for (const u of F.units) {
      setShare(SHARES[0]);
      const day = draw(u, false, false);
      if (!sameDraw(day, draw(u, false, true))) bad.dryDay++;
      if (report(frontInfo(u, false)) !== report(day.h)) bad.infoDay++;
      const L = layout(day.h), nights = [];
      for (const s of SHARES) {
        setShare(s);
        const n = draw(u, true, false);
        if (!sameDraw(n, draw(u, true, true))) bad.dryNight++;
        if (report(frontInfo(u, true)) !== report(n.h)) bad.infoNight++;
        nights.push(layout(n.h));
      }
      if (nights.some((x) => x !== L)) bad.nightLayout++;
      if (nights.some((x) => x !== nights[0])) bad.nightHours++;
      if (u.shop) { const [a, b] = day.n.split('/').map(Number); maxN = Math.max(maxN, a + b); tot += a + b; }
    }
    setShare(saved);
    const nBad = Object.values(bad).reduce((a, b) => a + b, 0);
    fails += nBad;
    console.log(`  ${F.units.length} units by day and by night (litShare ${SHARES.map((s) => s.home + '/' + s.shop).join(', ')}): dry vs real mismatches day ${bad.dryDay}, night ${bad.dryNight}; frontInfo vs real day ${bad.infoDay}, night ${bad.infoNight}; night layout not the day's ${bad.nightLayout}, differing between night hours ${bad.nightHours}`);
    console.log(`  vertices per shop front: max ${maxN}, mean ${Math.round(tot / Math.max(1, shops.length))}`);
    for (const u of heads.slice(0, 25)) console.log(`   ${u.shop.cat.padEnd(12)} ${String(u.shop.real || '-').padEnd(30)} -> ${u.shop.sign.text} (${u.shop.sign.kind}, ${u.shop.k} unit${u.shop.k > 1 ? 's' : ''}, ${u.shop.look.win})`);
  }
} finally { setShare(saved); }
if (fails) { process.exitCode = 1; console.log(`FAIL: ${fails} mismatches`); } else console.log('ok');
