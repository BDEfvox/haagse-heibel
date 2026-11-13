// node test/furnish-night.test.mjs [--all] [tileKey ...] : by night the furniture stands where it stands by day. Builds real
// tiles at the finest level of detail by day and by night, for the desktop and for the phone (lite), and checks that the
// furniture anchors (`props`, what furnishTile returns) are deep-equal. Default: the tiles that differed before night
// furnishing was made to follow the day, plus a spread of others (a few seconds); --all: every tile of the city (minutes).
import fs from 'node:fs';
import util from 'node:util';
import pngjs from 'pngjs';

// ---- just enough of a browser for loadCity and buildTile: files from public/data, PNGs read with pngjs, a 2d canvas
const data = new URL('../public/data/', import.meta.url).pathname;
const file = (u) => data + String(u).replace(/^\.?\/?data\//, '');
globalThis.fetch = async (u) => {
  const p = file(u);
  if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => null };
  const txt = fs.readFileSync(p, 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(txt), text: async () => txt };
};
globalThis.Image = class {
  async decode() {
    this.png = pngjs.PNG.sync.read(fs.readFileSync(file(this.src)));
    this.naturalWidth = this.width = this.png.width; this.naturalHeight = this.height = this.png.height;
  }
};
const context = (c) => new Proxy({
  canvas: c,
  measureText: (t) => ({ width: String(t).length * 16 }),
  drawImage(img) { c.img = img; },
  getImageData(x, y, w, h) {
    const P = c.img && c.img.png;
    if (!P || P.width !== w || P.height !== h) throw new Error('test stub: getImageData of a resized image');
    return { width: w, height: h, data: new Uint8ClampedArray(P.data) };
  },
}, { get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' || k === 'then' ? undefined : () => {}), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document = { createElement: () => { const c = { width: 300, height: 150, style: {}, addEventListener() {} }; c.getContext = () => (c.ctx ||= context(c)); return c; } };
// a tile whose furniture throws gets an empty list by day and by night: that must not pass as equal
let failures = 0;
const err = console.error;
console.error = (...a) => { failures++; err(...a); };

const { buildTile, loadCity } = await import('../src/voxel/world.js');
const tiles = new URL('../public/data/world/tiles/', import.meta.url).pathname;
const DIFFERED = ['-10_14', '-1_-2', '-1_-3', '-1_6', '-2_15', '-2_5', '-3_14', '-4_-7', '-4_20', '-5_19', '-6_18', '-7_8', '-7_9', '-8_16', '-9_15', '15_-25', '15_-26', '16_-2',
  '16_-26', '16_-27', '17_-1', '1_3', '1_4', '2_2', '2_3', '2_4', '3_2', '3_3', '4_-15', '4_4', '5_0', '5_4', '6_-1', '6_4']; // market, terrace, picnic and beach tiles
const SPREAD = ['-10_-1', '-14_-22', '-22_-22', '-2_-5', '-3_-1', '-5_-17', '-6_-5', '-7_19', '-9_3', '12_-17', '15_-6', '19_0', '22_-4', '25_-27', '2_24', '3_-7', '4_13', '5_9', '7_-8'];
const args = process.argv.slice(2);
const keys = args.includes('--all') ? fs.readdirSync(tiles).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
  : args.length ? args : [...DIFFERED, ...SPREAD];

const city = await loadCity();
const t0 = Date.now();
const where = (p) => (p ? `${p.kind} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}` : 'nothing');
let bad = 0, props = 0;
for (const key of keys) {
  for (const lite of [false, true]) {
    const read = () => JSON.parse(fs.readFileSync(tiles + key + '.json', 'utf8'));
    const day = buildTile(city, key, read(), false, lite, 0), night = buildTile(city, key, read(), true, lite, 0);
    const a = day.props || [], b = night.props || [];
    props += a.length;
    if (!util.isDeepStrictEqual(a, b)) {
      bad++;
      let i = 0;
      while (i < Math.min(a.length, b.length) && util.isDeepStrictEqual(a[i], b[i])) i++;
      console.log(`  ${key}${lite ? ' (lite)' : ''}: ${a.length} props by day, ${b.length} by night; first difference at #${i}: day ${where(a[i])}, night ${where(b[i])}`);
    }
    day.dispose(); night.dispose();
  }
}
if (bad || failures) process.exitCode = 1;
console.log(`${keys.length} tiles, desktop and lite: ${bad} of ${keys.length * 2} builds differ by night; ${props} props by day; ${failures} furniture failures (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
