// Landmarks without a recipe: several variants per form code, chosen by the feature's own dice; and fountains.

const METAL = ['bronze', 'bronze', 'bronzeDark', 'bronzeGold'];
const BASE = ['stone', 'granite', 'granitePink', 'concrete', 'stone'];
const BRIGHT = ['red', 'blue', 'yellow', 'orange', 'green', 'white'];

function person(r, H, x = 0, y = 0, z = 0) {
  const pose = r.pick(['stand', 'stand', 'point', 'arm-up', 'hold', 'walk', 'read', 'hips', 'salute']);
  const o = {};
  if (r.chance(0.35)) o.robe = true;
  if (r.chance(0.2)) o.cloak = true;
  if (r.chance(0.3)) o.hat = r.pick(['tricorn', 'tall', 'cap', 'brim']);
  if (!o.hat && r.chance(0.4)) o.hair = r.pick(['long', 'bun', 'mullet']);
  if (pose === 'hold') o.hold = r.pick(['book', 'staff', 'wreath', 'bag', 'paper']);
  if (pose === 'salute') o.hold = 'hat';
  return ['fig', x, y, z, H, r.pick(METAL), pose, o];
}

const FORM = {
  // 1 statue / figure
  1(r) {
    const base = r.pick(BASE), v = r.int(0, 5), H = r.range(1.7, 2.6), P = [];
    if (v === 0) { const ph = r.range(1.3, 2.4), w = r.range(0.9, 1.3); P.push(['plinth', w, ph, w, base, 'classic'], person(r, H, 0, ph, 0)); }
    else if (v === 1) { P.push(['plinth', 1.6, 0.35, 1.6, base, 'plain'], person(r, H * 0.9, 0, 0.35, 0)); }
    else if (v === 2) { P.push(['plinth', 1.7, 0.4, 1.4, base, 'stepped'], ['fig', 0, 0.4, 0, H * 0.62, r.pick(METAL), r.pick(['sit', 'think']), { seat: base, robe: r.chance(0.4) }]); }
    else if (v === 3) { const ph = r.range(0.8, 1.6); P.push(['plinth', 1.0, ph, 1.0, base, 'stepped'], ['fig', 0, ph, 0, H, r.pick(METAL), r.pick(['stand', 'arm-up', 'hold']), { robe: true, hair: r.pick(['long', 'bun']), hold: r.pick(['child', 'basket', 'bird', 'wreath']) }]); }
    else if (v === 4) { P.push(['plinth', 2.2, 0.45, 1.2, base, 'plain'], person(r, H * 0.85, -0.5, 0.45, 0), person(r, H * 0.8, 0.5, 0.45, 0)); }
    else { P.push(['plinth', 1.8, 0.9, 1.4, base, 'rock'], person(r, H * 0.85, 0, 0.9, 0), ['animal', r.pick(['dog', 'bird', 'lion', 'sheep']), 0.6, 0.9, 0.3, 0.7, r.pick(METAL), 0]); }
    return P;
  },
  // 2 bust
  2(r) {
    const base = r.pick(BASE), s = r.pick(['classic', 'column', 'plain', 'stepped']), ph = r.range(1.0, 1.7), w = s === 'column' ? 0.5 : 0.8;
    return [['plinth', w, ph, w, base, s], ['bust', 0, ph, 0, r.range(0.7, 1.0), r.pick(METAL), { hat: r.chance(0.2) ? r.pick(['cap', 'brim', 'tall']) : undefined, hair: r.chance(0.3) ? r.pick(['long', 'bun', 'mullet']) : undefined }]];
  },
  // 3 abstract sculpture
  3(r) {
    const v = r.int(0, 8), P = [], s = r.range(0.8, 1.5);
    switch (v) {
      case 0: P.push(['slab', 0, 0, 0, 0.5 * s, 3.2 * s, 2.2 * s, 'corten', r.int(0, 90), 0], ['slab', 0.1, 0.6, 0.8, 0.3 * s, 2 * s, 1.1 * s, 'corten', 20, 5]); break;
      case 1: P.push(['plinth', 1.6, 0.3, 1.6, 'concrete', 'plain'], ['ring', 0, 0.3, 0, 1.5 * s, 0.22, r.pick(['steel', 'stainless', 'red', 'blue']), r.int(0, 90)], ['ring', 0.2, 0.3, 0.1, 1.0 * s, 0.18, r.pick(['steel', 'stainless']), r.int(0, 90) + 40]); break;
      case 2: P.push(['box', 0, 0, 0, 1.6 * s, 0.9 * s, 1.4 * s, r.pick(['concrete', 'granite', 'basalt', 'corten']), 0], ['box', 0.2, 0.9 * s, 0.1, 1.2 * s, 0.9 * s, 1.0 * s, r.pick(['steel', 'white', 'granite']), 15], ['box', -0.1, 1.8 * s, 0, 0.8 * s, 0.8 * s, 0.7 * s, r.pick(BRIGHT), 35]); break;
      case 3: P.push(['plinth', 1.2, 0.9, 1.2, 'granite', 'plain'], ['ball', 0, 0.9, 0, 0.55 * s, 'bronze'], ['ball', 0.5, 0.9, 0.2, 0.35 * s, 'bronze'], ['ball', -0.3, 1.5 * s, 0, 0.4 * s, 'bronze']); break;
      case 4: P.push(['plinth', 1.0, 0.5, 1.0, 'concrete', 'plain'], ['ball', 0, 0.5, 0, 1.0 * s, 'stainless']); break;
      case 5: P.push(['beam', 0, 0, 0, 0.3, 2.4 * s, 0.4, 0.28, r.pick(['steel', 'red', 'corten'])], ['beam', 0.3, 2.4 * s, 0.4, -0.5, 3.2 * s, 0, 0.26, r.pick(['steel', 'red', 'corten'])], ['beam', -0.5, 3.2 * s, 0, 0.6, 3.8 * s, -0.5, 0.24, r.pick(['steel', 'red', 'corten'])]); break;
      case 6: P.push(['arch', 0, 0, 0, 3.6 * s, 3.2 * s, 0.8, 0.8, r.pick(['corten', 'steel', 'concrete']), r.int(0, 45)], ['box', 0, 0, 0, 0.9, 0.2, 0.9, 'concrete', 0]); break;
      case 7: for (let i = 0; i < 4; i++) P.push(['box', (i - 1.5) * 0.9 * s, 0, (i % 2) * 0.4, 0.7 * s, (1.0 + i * 0.7) * s, 0.7 * s, r.pick(BRIGHT.concat(['steel', 'corten'])), 0]); break;
      default: P.push(['taper', 0, 0, 0, 1.4 * s, 1.0 * s, 3.4 * s, 0.25, r.pick(['stainless', 'steel', 'corten']), r.int(0, 60)], ['box', 0, 0, 0, 1.6 * s, 0.2, 1.2 * s, 'concrete', 0]);
    }
    return P;
  },
  // 4 obelisk
  4(r) {
    const base = r.pick(BASE), h = r.range(3.2, 7.5), w = h * 0.1 + 0.4, P = [['plinth', w * 2.2, 0.9, w * 2.2, base, 'stepped'], ['taper', 0, 0.9, 0, w * 1.4, w * 1.4, h, 0.35, r.pick(['granite', 'stone', 'marble', 'basalt']), 0]];
    P.push(['taper', 0, 0.9 + h, 0, w * 0.5, w * 0.5, w * 0.8, 0, 'stone', 0]);
    if (r.chance(0.5)) P.push(['plaque', 0, 1.6, w * 0.72, w, 0.7, 'bronze', 0]);
    if (r.chance(0.3)) P.push(['ball', 0, 0.9 + h + w * 0.8, 0, 0.18, 'bronzeGold']);
    return P;
  },
  // 5 war memorial
  5(r) {
    const v = r.int(0, 4), base = r.pick(['granite', 'stone', 'granitePink']), P = [];
    if (v === 0) P.push(['steps', 4, 1.2, 2, base], ['wall', 0, 0.3, 0, 3.4, 2.2, 0.5, base, 0], ['plaque', 0, 0.9, 0.28, 2.2, 1.0, 'bronze', 0], ['flame', 0, 0.3, 1.2, 0.55]);
    else if (v === 1) P.push(['plinth', 1.4, 0.4, 1.4, base, 'plain'], ['slab', 0, 0.4, 0, 0.8, 3.4, 0.4, base, 0, 0], ['wreath', 0, 0.45, 0.45, 0.45, 'green'], ['plaque', 0, 1.3, 0.22, 0.5, 0.7, 'bronze', 0]);
    else if (v === 2) P.push(['wall', 0, 0, 0, 5, 1.1, 0.5, base, 0], ['box', -2.5, 0, 0, 0.7, 2.4, 0.7, base, 0], ['box', 2.5, 0, 0, 0.7, 2.4, 0.7, base, 0], ['plaque', 0, 0.3, 0.27, 2.4, 0.6, 'bronze', 0]);
    else if (v === 3) P.push(['plinth', 1.0, 2.6, 1.0, base, 'column'], ['ball', 0, 2.6, 0, 0.4, 'bronzeDark'], ['steps', 2, 2, 2, base]);
    else P.push(['plinth', 1.2, 1.8, 1.2, base, 'classic'], ['fig', 0, 1.8, 0, 2, 'bronze', 'stand', { hat: 'helmet', hold: 'rifle', cloak: true }], ['fence', 3, 3, 0.7, 'black']);
    return P;
  },
  // 6 stone / stele
  6(r) {
    const base = r.pick(['granite', 'stone', 'granitePink', 'basalt']), v = r.int(0, 4), P = [];
    if (v === 0) P.push(['plinth', 1.2, 1.1, 0.9, base, 'rock'], ['plaque', 0, 0.35, 0.46, 0.6, 0.4, 'bronze', 0]);
    else if (v === 1) P.push(['slab', 0, 0, 0, 0.9, 2.3, 0.3, base, 0, 0], ['plaque', 0, 0.8, 0.17, 0.55, 0.6, 'bronze', 0]);
    else if (v === 2) P.push(['steps', 2, 1.2, 2, 'concrete'], ['plinth', 0.9, 1.1, 0.5, base, 'plain']);
    else if (v === 3) P.push(['slab', 0, 0, 0, 0.8, 2.0, 0.35, base, 10, 8], ['slab', 1.0, 0, 0.3, 0.7, 1.3, 0.3, base, -15, 0]);
    else P.push(['box', 0, 0, 0, 1.1, 1.0, 0.8, base, 0], ['plaque', 0, 0.3, 0.41, 0.6, 0.4, 'bronze', 0], ['wreath', 0.5, 1.0, 0.2, 0.2, 'green']);
    return P;
  },
  // 7 cross
  7(r) {
    const base = r.pick(BASE), v = r.int(0, 2), P = [];
    if (v === 0) P.push(['plinth', 1.3, 0.7, 1.3, base, 'stepped'], ['cross', 0, 0.7, 0, 3.4, base]);
    else if (v === 1) P.push(['steps', 2.2, 1.6, 2, base], ['cross', 0, 0.3, 0, 2.2, 'wood']);
    else P.push(['plinth', 1.0, 1.0, 1.0, 'granite', 'plain'], ['cross', 0, 1.0, 0, 2.6, 'steel'], ['ring', 0, 1.0 + 1.6, 0, 0.6, 0.12, 'steel', 0]);
    return P;
  },
  // 8 column
  8(r) {
    const base = r.pick(BASE), v = r.int(0, 3), h = r.range(2.6, 4.6), P = [];
    if (v === 0) P.push(['plinth', 0.7, h, 0.7, base, 'column'], ['ball', 0, h, 0, 0.3, 'bronzeGold']);
    else if (v === 1) P.push(['box', 0, 0, 0, 1.0, 1.2, 1.0, base, 0], ['cyl', 0, 1.2, 0, 0.3, h, base], ['fig', 0, h + 1.2, 0, 1.2, 'bronze', 'stand', { robe: true }]);
    else if (v === 2) P.push(['box', 0, 0, 0, 0.9, 0.4, 0.9, base, 0], ['box', 0, 0.4, 0, 0.5, h, 0.5, base, 0], ['box', 0, 0.4 + h, 0, 0.8, 0.25, 0.8, base, 0], ['flame', 0, 0.65 + h, 0, 0.5]);
    else P.push(['cyl', 0, 0, 0, 0.5, 0.3, base], ['cyl', 0, 0.3, 0, 0.3, h, 'basalt'], ['cyl', 0, 0.3 + h, 0, 0.45, 0.25, base]);
    return P;
  },
  // 9 installation
  9(r) {
    const v = r.int(0, 3), P = [];
    if (v === 0) for (let i = 0; i < 5; i++) P.push(['box', (i - 2) * 0.8, 0, ((i * 7) % 3) * 0.5, 0.25, 2 + i * 0.5, 0.25, r.pick(BRIGHT), 0]);
    else if (v === 1) { for (let i = 0; i < 4; i++) P.push(['box', (i % 2) * 1.0 - 0.5, Math.floor(i / 2) * 1.0, 0, 1.0, 1.0, 1.0, r.pick(BRIGHT), 0]); P.push(['box', 0, 2.0, 0, 1.2, 1.0, 1.2, r.pick(BRIGHT), 22]); }
    else if (v === 2) P.push(['arch', -1.4, 0, 0, 3.0, 2.6, 0.5, 0.5, r.pick(['steel', 'corten', 'red']), 0], ['arch', 1.2, 0, -1.4, 3.0, 3.0, 0.5, 0.5, r.pick(['steel', 'corten', 'blue']), 35], ['bench', 0, 0, 1.6, 2.2, 'wood', 0]);
    else P.push(['curve', [[-1.5, 0, 0], [-0.8, 1.6, 0.3], [0, 0.5, 0], [0.8, 2.0, -0.3], [1.5, 0.2, 0]], 0.28, r.pick(['steel', 'red', 'stainless'])]);
    return P;
  },
};

/** A generic landmark by form code (f.b of the tile data): 1 statue, 2 bust, 3 abstract, 4 obelisk, 5 war memorial, 6 stone, 7 cross, 8 column, 9 installation, 0 unknown. */
export function genericParts(form, rnd) {
  let f = form | 0;
  if (!FORM[f]) f = rnd.pick([1, 1, 1, 2, 3, 3, 4, 6, 6, 8]);
  return FORM[f](rnd);
}
// ------------------------------------------------------------------ fountains without a recipe
const FOUNTAIN = [
  (r, R) => [['basin', 0, 0, 0, R, 0.7, 'stone'], ['plinth', 0.9, 1.0, 0.9, 'stone', 'classic'], ['basin', 0, 1.0, 0, 0.7, 0.3, 'stone'], ['jet', 0, 1.3, 0, 1.6]],
  (r, R) => [['basin', 0, 0, 0, R, 0.6, 'granite', true], ['box', 0, 0.2, 0, 0.9, 1.0, 0.9, 'granite', 0], ['jet', 0, 1.2, 0, 1.4], ['jet', R * 0.55, 0.4, R * 0.55, 0.8], ['jet', -R * 0.55, 0.4, -R * 0.55, 0.8]],
  (r, R) => [['basin', 0, 0, 0, R, 0.55, 'stone'], ['cyl', 0, 0.3, 0, 0.4, 1.0, 'stone'], ['basin', 0, 1.2, 0, R * 0.55, 0.3, 'stone'], ['cyl', 0, 1.3, 0, 0.18, 0.8, 'stone'], ['basin', 0, 2.0, 0, R * 0.28, 0.2, 'stone'], ['jet', 0, 2.1, 0, 1.0]],
  (r, R) => [['basin', 0, 0, 0, R, 0.4, 'concrete'], ['jet', 0, 0.3, 0, 0.9], ['jet', R * 0.5, 0.3, 0, 0.7], ['jet', -R * 0.5, 0.3, 0, 0.7], ['jet', 0, 0.3, R * 0.5, 0.7], ['jet', 0, 0.3, -R * 0.5, 0.7]],
  (r, R) => [['basin', 0, 0, 0, R, 0.5, 'granite', true], ['plinth', 1.3, 1.1, 0.8, 'granite', 'rock'], ['jet', 0, 1.1, 0, 0.9]],
  (r, R) => [['pool', 0, 0.05, 0, R * 2, R * 1.2], ['wall', 0, 0, -R * 0.6, R * 2, 0.6, 0.3, 'stone', 0], ['wall', 0, 0, R * 0.6, R * 2, 0.6, 0.3, 'stone', 0], ['jet', -R * 0.6, 0.05, 0, 0.8], ['jet', 0, 0.05, 0, 1.1], ['jet', R * 0.6, 0.05, 0, 0.8]],
];
/** Parts of a fountain without a recipe; f.b (when above 1) is its radius from the data. */
export function fountainParts(f, rnd) {
  const R = Math.max(1.0, Math.min(5, f && f.b > 1 ? f.b * 0.6 : rnd.range(1.4, 2.8)));
  return FOUNTAIN[rnd.int(0, FOUNTAIN.length - 1)](rnd, R);
}
