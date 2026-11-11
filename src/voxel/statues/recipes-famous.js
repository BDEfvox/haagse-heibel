// The best-known landmarks of The Hague, modelled with extra care. Keys are OpenStreetMap ids (see ids.json).
// Schema: see kit.js. Small helpers below only compute numbers; the result is plain part lists.

const D2R = Math.PI / 180;
// a beard under the chin of a standing (base .84) or seated (base .64) figure of scale u standing on y
const beard = (y, u, base = 0.84, col = 'bronzeDark') => ['box', 0, y + (base - 0.08) * u, 0.07 * u, 0.1 * u, 0.13 * u, 0.05 * u, col];
// four name or arms plates round a plinth shaft
const plates = (hw, hd, y, w, h, col = 'bronzeDark') => [
  ['plaque', 0, y, hd, w, h, col, 0], ['plaque', 0, y, -hd, w, h, col, 180], ['plaque', hw, y, 0, w, h, col, 90], ['plaque', -hw, y, 0, w, h, col, -90],
];
// boxes along an ellipse (a along x, b along z), each turned to follow it
const ellipse = (n, a, b, y, depth, h, cols, scale = 1) => {
  const out = [], seg = (Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))) * scale) / n;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, x = a * scale * Math.sin(t), z = b * scale * Math.cos(t);
    out.push(['box', +x.toFixed(2), y, +z.toFixed(2), +(seg * 1.25).toFixed(2), h, depth, cols[i % cols.length], +(Math.atan2(b * Math.sin(t), a * Math.cos(t)) / D2R).toFixed(1)]);
  }
  return out;
};
// a seated or standing bronze scholar on a low plinth
const scholar = (name, seated, o = {}) => ({
  name, parts: [
    ['plinth', 1.4, 0.7, 1.2, 'granite', 'stepped'],
    ['fig', 0, 0.7, 0, seated ? 1.5 : 1.9, 'bronze', seated ? 'think' : o.pose || 'hold', Object.assign(seated ? { seat: 'bronzeDark', robe: true, hair: 'long' } : { robe: true, hold: 'book', hair: 'long', cloak: true }, o.opts || {})],
    seated ? beard(0.7, 1.9, 0.64) : beard(0.7, 1.9),
  ],
});

const plein = (() => {
  const P = [['paving', 6.6, 6.6, 'stone'], ['fence', 6.0, 6.0, 0.9, 'black'], ['steps', 3.6, 3.6, 2, 'granite'], ['plinth', 2.4, 4.0, 2.4, 'granite', 'classic']];
  P.push(...plates(0.98, 0.98, 1.7, 0.8, 0.9));
  P.push(['fig', 0, 4.0, 0, 3.0, 'bronze', 'arm-up', { cloak: true }], beard(4.0, 3.0));
  P.push(['box', -0.6, 5.2, 0.2, 0.34, 0.46, 0.05, 'white', 0], ['animal', 'dog', 0.95, 4.0, 0.6, 0.75, 'bronze', 90]);
  return P;
})();

export default {
  // ---------------------------------------------------------------- the royals and statesmen of the centre
  'node/534955460': { name: 'Stadhouder Prins Willem van Oranje (Plein)', parts: plein },
  'node/1526061086': { name: 'Stadhouder Prins Willem van Oranje (Noordeinde, equestrian)', parts: [
    ['paving', 7.4, 4.4, 'stone'], ['fence', 6.8, 3.8, 0.8, 'black'], ['steps', 5.4, 2.6, 2, 'granite'],
    ['plinth', 4.4, 3.6, 2.0, 'granite', 'classic'],
    ...plates(0.0, 0.8, 1.6, 1.2, 0.8).slice(0, 2),
    ['horse', 0, 3.6, 0, 2.7, 'bronze', { rotY: 90, rider: 'stand', riderOpts: { cloak: true, hat: 'brim' } }],
  ] },
  'node/1526065605': { name: 'Koning Willem II (Buitenhof, equestrian)', parts: [
    ['paving', 7.0, 4.2, 'stone'], ['steps', 5.6, 2.8, 2, 'stone'], ['plinth', 4.6, 3.8, 2.1, 'marble', 'classic'],
    ['plaque', 0, 1.7, 1.07, 1.4, 0.9, 'bronzeDark', 0],
    ['horse', 0, 3.8, 0, 2.7, 'bronze', { rotY: 90, rider: 'salute', riderOpts: { hold: 'hat', cloak: true } }],
  ] },
  'node/1523193417': { name: 'Johan de Witt', parts: [
    ['paving', 3.4, 3.4, 'stone'], ['steps', 2.4, 2.4, 1, 'granite'], ['plinth', 1.4, 2.2, 1.4, 'stone', 'classic'],
    ['plaque', 0, 0.9, 0.57, 0.7, 0.6, 'bronzeDark', 0],
    ['fig', 0, 2.2, 0, 2.8, 'bronze', 'stand', { robe: true, cloak: true, hair: 'long', hold: 'paper' }],
  ] },
  'node/1523203301': { name: 'Johan van Oldenbarnevelt', parts: [
    ['paving', 5.0, 4.0, 'stone'], ['plinth', 3.2, 1.0, 2.6, 'granite', 'stepped'],
    ['fig', 0, 1.0, 0, 2.3, 'bronze', 'sit', { seat: 'bronze', robe: true, cloak: true, hold: 'staff' }], beard(1.0, 2.3, 0.64),
  ] },
  'node/1526074372': { name: 'Spinoza', parts: [
    ['paving', 3.4, 3.0, 'stone'], ['plinth', 1.6, 1.3, 1.6, 'granite', 'classic'],
    ['fig', 0, 1.3, 0, 2.0, 'bronze', 'think', { seat: 'bronzeDark', hair: 'long', cloak: true }], ['plaque', 0, 0.45, 0.65, 0.6, 0.4, 'bronzeDark', 0],
  ] },
  'node/34051097': { name: 'Jantje', parts: [
    ['paving', 2.2, 2.2, 'stone'], ['plinth', 0.9, 0.75, 0.9, 'stone', 'stepped'],
    ['fig', 0, 0.75, 0, 1.15, 'bronze', 'point', { child: true, hat: 'feather' }],
  ], face: 198 },
  'node/5617996222': { name: 'Haagse Harry', parts: [
    ['cyl', 0, 0, 0, 1.25, 0.3, 'stone'],
    ['beam', -0.2, 1.35, 0, -0.65, 0.3, 0.1, 0.34, 'bronze'], ['beam', 0.2, 1.35, 0, 0.65, 0.3, 0.1, 0.34, 'bronze'],
    ['box', -0.65, 0.3, 0.12, 0.4, 0.14, 0.6, 'black', 0], ['box', 0.65, 0.3, 0.12, 0.4, 0.14, 0.6, 'black', 0],
    ['box', 0, 1.25, 0, 0.9, 0.4, 0.62, 'bronzeDark', 0], ['box', 0, 1.6, 0, 0.98, 1.2, 0.66, 'bronze', 0],
    ['beam', -0.55, 2.65, 0, -0.95, 1.55, 0.08, 0.27, 'bronze'], ['beam', 0.55, 2.65, 0, 0.95, 1.55, 0.08, 0.27, 'bronze'],
    ['box', 0, 2.8, 0, 0.3, 0.2, 0.3, 'bronze', 0], ['box', 0, 3.0, 0.04, 0.8, 0.75, 0.7, 'bronze', 0],
    ['box', 0, 3.2, 0.42, 0.18, 0.2, 0.14, 'bronze', 0], ['box', 0, 3.1, 0.38, 0.4, 0.1, 0.1, 'black', 0],
    ['box', 0, 3.75, 0.1, 0.78, 0.5, 0.82, 'bronzeDark', 0], ['box', 0, 3.95, 0.5, 0.7, 0.5, 0.4, 'bronzeDark', 0],
    ['box', 0, 2.6, -0.4, 0.7, 1.0, 0.18, 'bronzeDark', 0],
  ], face: 180 },
  'node/1524601187': { name: 'Koningin Wilhelmina', parts: [
    // a block-like dark stone figure in a long coat and hat, no arms to be seen, on a low base; a lettered wall behind
    ['paving', 5.0, 4.0, 'granite'], ['plinth', 2.0, 0.5, 1.6, 'basalt', 'plain'],
    ['taper', 0, 0.5, 0, 1.7, 1.2, 1.9, 0.62, 'basalt', 0], ['box', 0, 2.4, 0, 1.45, 0.55, 0.95, 'basalt', 0], ['box', 0, 2.95, 0, 0.5, 0.18, 0.4, 'basalt', 0],
    ['box', 0, 3.1, 0.02, 0.62, 0.7, 0.58, 'basalt', 0], ['box', 0, 3.4, 0.33, 0.12, 0.2, 0.12, 'basalt', 0],
    ['box', 0, 3.72, 0.02, 1.12, 0.1, 1.12, 'basalt', 0], ['box', 0, 3.82, 0.02, 0.7, 0.34, 0.7, 'basalt', 0],
    ['box', 0, 0.9, 0.52, 0.5, 0.9, 0.12, 'granite', 0],
    ['wall', 0, 0, -2.0, 5.4, 1.5, 0.45, 'granite', 0], ['letters', 0, 0.55, -1.76, 'WILHELMINA', 0.34, 'black', 0],
  ] },
  'node/5530721031': { name: 'Thorbecke-monument', parts: [
    ['paving', 5.2, 3.0, 'stone'], ['plinth', 1.2, 0.6, 1.2, 'granite', 'plain'],
    ['fig', -0.1, 0.6, 0, 2.7, 'bronze', 'hold', { hold: 'paper', cloak: true, hair: 'long' }],
    ['box', 1.9, 0, 0, 1.2, 2.4, 1.0, 'marble', 0], ['plaque', 1.9, 1.0, 0.52, 0.7, 0.6, 'bronzeDark', 0],
  ] },
  'node/5547467516': { name: 'Louis Couperus (Lange Voorhout)', parts: [
    ['paving', 2.6, 2.6, 'stone'], ['plinth', 0.8, 2.3, 0.8, 'granite', 'classic'],
    ['fig', 0, 2.3, 0, 1.45, 'bronze', 'sit', { seat: 'granite', slim: true, hold: 'book', hat: 'brim' }],
  ] },
  'node/1526111335': { name: 'Juliana van Stolberg', parts: [
    ['plinth', 3.8, 0.5, 3.4, 'stone', 'stepped'],
    ['fig', 0, 0.5, 0, 3.0, 'stone', 'stand', { robe: true, hair: 'bun', cloak: true }],
    ['fig', -1.2, 0.5, 0.6, 1.5, 'stone', 'stand', { hold: 'sword', hat: 'cap' }], ['fig', -0.7, 0.5, 1.2, 1.4, 'stone', 'arm-up', { hat: 'brim' }],
    ['fig', 0.7, 0.5, 1.2, 1.4, 'stone', 'point', { hat: 'cap' }], ['fig', 1.2, 0.5, 0.6, 1.5, 'stone', 'hold', { hold: 'flag', hat: 'helmet' }],
    ['fig', 0, 0.5, 1.5, 1.2, 'stone', 'stand', { child: true }],
  ] },
  'way/203853647': { name: 'Indisch Monument', parts: (() => {
    const P = [['paving', 11, 5.2, 'marble'], ['plinth', 9.6, 0.5, 3.8, 'marble', 'plain'], ['box', 0, 0.5, 0.4, 2.0, 0.9, 0.7, 'wood', 0], ['box', 0, 1.4, 0.4, 2.2, 0.14, 0.8, 'bronzeDark', 0]];
    const poses = ['stand', 'stand', 'arm-up', 'stand', 'stand', 'hold', 'stand'];
    for (let i = 0; i < 17; i++) {
      const x = -4.1 + (i % 9) * 1.0 + (i >= 9 ? 0.5 : 0), z = i >= 9 ? -0.6 : 0.8 + (i % 2) * 0.3, side = i === 8 ? 0 : 1;
      if (Math.abs(x) < 0.9 && z > 0) continue;
      P.push(['fig', x, 0.5, z, 2.3 - (i % 3) * 0.12, 'bronzeDark', poses[i % poses.length], { slim: true, robe: i % 4 === 1, hair: i % 5 === 0 ? 'bun' : undefined, child: i === 4 }]);
      void side;
    }
    P.push(['fig', -0.6, 1.54, 0.4, 1.5, 'bronzeDark', 'lie', { slim: true, rotY: 90 }]);
    return P;
  })() },
  // ---------------------------------------------------------------- Plein 1813: the national independence monument
  'node/1343413820': { name: 'Nationaal Onafhankelijkheidsmonument (Plein 1813)', parts: [
    ['paving', 24, 14, 'stone'], ['steps', 22, 10, 3, 'stone'],
    ['box', 0, 0.45, 0, 17, 1.4, 6.4, 'stone', 0],
    ['box', 0, 1.85, 0, 4.6, 3.9, 4.6, 'granitePink', 0], ['box', 0, 5.75, 0, 3.6, 0.4, 3.6, 'stone', 0],
    ['taper', 0, 6.15, 0, 2.7, 2.7, 12.2, 0.6, 'stone', 0], ['box', 0, 18.35, 0, 2.0, 0.5, 2.0, 'stone', 0],
    ['fig', 0, 18.85, 0, 3.4, 'bronze', 'arm-up', { robe: true, hold: undefined, hair: 'long', hat: 'crown' }],
    ['animal', 'lion', 1.2, 18.85, 0.2, 1.4, 'bronzeGold', 90],
    ['box', 0, 0.45, 3.5, 2.4, 1.3, 1.8, 'stone', 0], ['fig', 0, 1.75, 3.5, 2.9, 'bronze', 'arm-up', { cloak: true, hat: 'crown' }],
    ['box', -2.3, 1.85, 2.3, 1.4, 0.9, 1.2, 'stone', 0], ['fig', -2.3, 2.75, 2.3, 1.9, 'bronze', 'stand', { robe: true, hold: 'book' }],
    ['box', 2.3, 1.85, 2.3, 1.4, 0.9, 1.2, 'stone', 0], ['fig', 2.3, 2.75, 2.3, 1.9, 'bronze', 'point', { robe: true, hair: 'long' }],
    ['wall', -6.4, 1.85, 0, 4.6, 1.4, 1.4, 'stone', 0], ['wall', 6.4, 1.85, 0, 4.6, 1.4, 1.4, 'stone', 0],
    ['fig', -7.2, 3.25, 0.1, 2.0, 'bronze', 'stand', { robe: true, cloak: true }], ['fig', -5.6, 3.25, 0.2, 1.8, 'bronze', 'arm-up', {}],
    ['fig', 7.2, 3.25, 0.1, 2.0, 'bronze', 'stand', { robe: true, cloak: true }], ['fig', 5.6, 3.25, 0.2, 1.8, 'bronze', 'hold', { hold: 'sword', hat: 'helmet' }],
    ['plaque', 0, 2.6, 2.33, 2.4, 1.4, 'bronzeDark', 0],
    ['plaque', -6.4, 2.0, 0.72, 3.0, 0.9, 'bronzeDark', 0], ['plaque', 6.4, 2.0, 0.72, 3.0, 0.9, 'bronzeDark', 0],
  ], face: 180 },
  // ---------------------------------------------------------------- fountain on the Binnenhof
  'node/13137924239': { name: 'Graaf Willem II fountain (Binnenhof)', parts: [
    ['basin', 0, 0, 0, 2.7, 0.8, 'stone'],
    ['cyl', 0, 0, 0, 0.9, 1.0, 'stone'], ['cyl', 0, 1.0, 0, 0.55, 0.3, 'bronzeGold'],
    ['beam', 0.55, 1.3, 0.55, 0, 5.2, 0, 0.12, 'bronzeGold'], ['beam', -0.55, 1.3, 0.55, 0, 5.2, 0, 0.12, 'bronzeGold'],
    ['beam', 0.55, 1.3, -0.55, 0, 5.2, 0, 0.12, 'bronzeGold'], ['beam', -0.55, 1.3, -0.55, 0, 5.2, 0, 0.12, 'bronzeGold'],
    ['box', 0, 2.2, 0, 1.0, 0.1, 1.0, 'bronzeGold', 0], ['box', 0, 3.2, 0, 0.7, 0.1, 0.7, 'bronzeGold', 0], ['box', 0, 4.1, 0, 0.45, 0.1, 0.45, 'bronzeGold', 0],
    ['box', 0, 1.3, 0, 0.14, 3.9, 0.14, 'bronzeGold', 0], ['ball', 0, 4.4, 0, 0.18, 'bronzeGold'],
    ['fig', 0, 5.2, 0, 0.8, 'bronzeGold', 'stand', { cloak: true }], ['jet', 0.0, 0.9, 0.0, 0.5],
    ...[1, -1].map((s) => ['jet', s * 1.6, 0.8, 0, 0.5]),
  ] },
  // ---------------------------------------------------------------- Kijkduin
  'way/304374086': { name: 'Hemels Gewelf', parts: [
    ['box', 0, 0, 0, 24, 0.4, 32, 'green', 0],
    ...ellipse(20, 15, 20, 0, 9, 3.2, ['green', '#5a8f3a', '#4f7f34'], 0.92),
    ...ellipse(20, 15, 20, 0, 5.5, 5.0, ['#4f7f34', 'green', '#5a8f3a'], 0.78),
    ...ellipse(20, 15, 20, 4.6, 3.0, 0.5, ['#7fb04a'], 0.78),
    ['bench', 0, 0.4, 0, 3.2, 'granite', 0], ['bench', 0, 0.4, 1.6, 2.4, 'granite', 180],
  ] },
  // ---------------------------------------------------------------- Scheveningen
  'node/8247126993': { name: 'Vissersvrouw', parts: [
    ['paving', 3.6, 3.6, 'granite'], ['plinth', 1.8, 1.0, 1.4, 'granite', 'stepped'],
    ['fig', 0, 1.0, 0, 2.0, 'bronze', 'hold', { robe: true, hold: 'basket', hat: 'scarf', cloak: true }],
  ], face: 300 },
  'node/8247499117': { name: 'Eet een haring', parts: [
    ['cyl', 0, 0, 0, 3.0, 0.4, 'granite'],
    ['fig', 0, 0.4, 0, 12.0, 'bronze', 'arm-up', { bulky: true, hold: 'fish', hair: 'quiff', col2: '#6a6f55' }],
  ] },
  'node/8247499127': { name: 'De huilende reus', parts: [
    ['cyl', 0, 0, 0, 3.0, 0.4, 'granite'],
    ['fig', 0, 0.4, 0, 5.2, 'bronze', 'sit', { seat: 'granite', bulky: true, hat: 'cap' }],
  ] },
  'node/8247496308': { name: 'Gulliver', parts: [
    ['box', 0, 0, 0, 6.2, 0.3, 3.0, 'granite', 0],
    ['fig', 0, 0.3, 0, 5.4, 'bronze', 'lie', { bulky: true, rotY: 90 }],
    ['fig', 1.0, 1.0, 0.2, 0.9, 'bronze', 'stand', { child: true }], ['fig', -0.9, 1.0, 0.0, 0.9, 'bronze', 'point', {}],
    ['fig', 1.9, 0.3, 1.0, 0.9, 'bronze', 'hold', { hold: 'staff' }], ['fig', -2.1, 0.3, 0.9, 0.9, 'bronze', 'arm-up', {}],
  ] },
  'node/2998102632': { name: "Oorlogsmonument 'Leger en Vloot'", parts: [
    ['paving', 9, 9, 'stone'], ['steps', 7.4, 7.4, 3, 'granite'], ['plinth', 4.2, 2.4, 4.2, 'granite', 'stepped'],
    ['taper', 0, 2.4, 0, 2.4, 2.4, 9.6, 0.55, 'granite', 0], ['box', 0, 12.0, 0, 1.6, 0.4, 1.6, 'stone', 0],
    ['fig', 0, 12.4, 0, 2.6, 'bronze', 'arm-up', { robe: true, hold: undefined }],
    ['fig', -1.9, 2.4, 1.9, 3.0, 'bronze', 'stand', { hold: 'rifle', hat: 'helmet', cloak: true }], ['fig', 1.9, 2.4, 1.9, 3.0, 'bronze', 'stand', { hat: 'cap', cloak: true }],
    ['anchor', 0, 2.4, 2.4, 1.6, 'bronzeDark'],
  ], face: 300 },
  'node/2998135453': { name: 'Nationaal Monument voor de Koninklijke Marine', parts: [
    ['steps', 6.0, 6.0, 3, 'stone'], ['box', 0, 0.45, 0, 2.6, 3.0, 2.6, 'stone', 0], ['taper', 0, 3.45, 0, 1.8, 1.8, 3.8, 0.7, 'stone', 0],
    ['anchor', 0, 7.1, 0, 1.4, 'bronzeDark'], ['boat', 0, 2.2, 1.6, 1.8, 'bronzeDark', 0],
    ['fig', -1.5, 0.45, 1.8, 2.4, 'bronze', 'stand', { hat: 'cap', cloak: true }],
  ], face: 300 },
  'way/886911640': { name: 'Gedenknaald (Scheveningen)', parts: [
    ['paving', 9, 9, 'stone'], ['steps', 6.2, 6.2, 3, 'stone'], ['plinth', 3.4, 2.3, 3.4, 'stone', 'classic'],
    ['taper', 0, 2.3, 0, 1.9, 1.9, 11.4, 0.4, 'stone', 0], ['taper', 0, 13.7, 0, 0.8, 0.8, 1.0, 0, 'stone', 0], ['ball', 0, 14.5, 0, 0.2, 'bronzeGold'],
    ['plaque', 0, 0.9, 1.0, 1.4, 0.9, 'bronzeDark', 0],
  ] },
  // ---------------------------------------------------------------- modern landmarks
  'node/8254358167': { name: 'Frog with Umbrella', parts: [
    ['cyl', 0, 0, 0, 1.5, 0.2, 'concrete'],
    ['box', -0.4, 0.2, -0.1, 0.5, 0.7, 0.9, 'bronze', 0], ['box', 0.4, 0.2, -0.1, 0.5, 0.7, 0.9, 'bronze', 0],
    ['box', 0, 0.8, -0.1, 1.2, 1.0, 0.85, 'bronze', 0], ['box', 0, 1.8, 0.1, 1.2, 0.5, 0.85, 'bronze', 0],
    ['box', -0.35, 2.3, 0.35, 0.34, 0.34, 0.34, 'white', 0], ['box', 0.35, 2.3, 0.35, 0.34, 0.34, 0.34, 'white', 0],
    ['box', 0, 1.95, 0.55, 0.9, 0.08, 0.1, 'black', 0],
    ['beam', 0.55, 1.4, 0.3, 0.7, 2.4, 0.1, 0.16, 'bronze'], ['beam', -0.55, 1.4, 0.3, -0.7, 1.9, 0.5, 0.16, 'bronze'],
    ['beam', 0.7, 1.0, 0.1, 0.7, 3.3, 0.1, 0.07, 'steel'],
    ['cone', 0.7, 3.0, 0.1, 1.6, 0.6, 'red'],
  ] },
  'node/12638993245': { name: 'Zebraklok', parts: (() => {
    const P = [['box', 0, 0, 0, 1.2, 0.8, 1.2, 'concrete', 0]];
    for (let i = 0; i < 6; i++) P.push(['box', 0, 0.8 + i * 0.6, 0, 0.9 + i * 0.6, 0.6, 0.9 + i * 0.6, i % 2 ? 'white' : 'black', 0]);
    for (let i = 0; i < 6; i++) P.push(['box', 0, 4.4 + i * 0.6, 0, 4.2 - i * 0.6 - 0.3, 0.6, 4.2 - i * 0.6 - 0.3, i % 2 ? 'white' : 'black', 0]);
    P.push(['disc', 0, 3.2, 2.3, 1.0, 0.25, 'white', 0], ['disc', 2.3, 3.2, 0, 1.0, 0.25, 'white', 90], ['disc', -2.3, 3.2, 0, 1.0, 0.25, 'white', -90]);
    P.push(['box', 0, 4.2, 2.45, 0.1, 0.75, 0.06, 'black', 0], ['box', 0.22, 4.15, 2.45, 0.45, 0.1, 0.06, 'black', 0]);
    return P;
  })() },
  'node/8258530051': { name: 'Roadline', parts: [
    ['curve', [[-7, 0, 0.6], [-4, 0.6, 0.5], [-1.5, 2.3, 0.3], [1.5, 4.6, 0.1], [3.8, 7.2, -0.1], [3.4, 10.0, -0.3], [1.2, 12.0, -0.4], [-2.2, 11.4, -0.4], [-3.8, 8.6, -0.3], [-2.2, 5.6, -0.1], [0.8, 3.0, 0.4], [3.6, 1.6, 0.6], [6.6, 0.3, 0.6], [8.5, 0, 0.6]], 0.55, 'red'],
  ] },
  'node/11342861250': { name: 'Paard en ruiter (Marino Marini)', parts: [
    ['plinth', 3.2, 0.4, 1.6, 'concrete', 'plain'],
    ['horse', 0, 0.4, 0, 2.6, 'bronze', { rotY: 90, rider: 'arms-up', riderOpts: { slim: true, nude: true } }],
  ] },
  'node/1530696872': { name: 'Internationaal Homomonument', parts: [
    ['plinth', 3.2, 0.3, 3.2, 'concrete', 'plain'],
    ['curve', [[-1.2, 0.3, 1.0], [-1.6, 2.2, 0.6], [-0.6, 4.4, 0.2], [0.8, 6.0, -0.3], [1.6, 7.0, -0.8], [0.4, 7.2, -1.2], [-0.8, 5.6, -0.8], [-0.4, 3.6, 0.4], [1.0, 2.0, 0.9], [1.4, 0.3, 0.7]], 0.55, '#e85d9a'],
    ['curve', [[1.2, 0.3, -1.0], [1.7, 2.4, -0.6], [0.8, 4.6, -0.1], [-0.7, 6.2, 0.4], [-1.6, 6.8, 0.9], [-0.5, 7.0, 1.2], [0.7, 5.2, 0.8], [0.3, 3.2, -0.4], [-1.0, 1.8, -0.9], [-1.3, 0.3, -0.7]], 0.5, '#7fc6e8'],
    ['beam', -1.0, 0.4, 1.4, 1.0, 0.4, 1.4, 0.25, '#e85d9a'], ['beam', 1.0, 0.4, 1.4, 0.0, 2.2, 1.4, 0.25, '#e85d9a'], ['beam', 0.0, 2.2, 1.4, -1.0, 0.4, 1.4, 0.25, '#e85d9a'],
  ] },
  'node/1533747401': { name: 'Oorlogsmonument De Ooievaars', parts: [
    ['steps', 3.4, 3.4, 2, 'stone'], ['plinth', 1.5, 2.0, 1.5, 'granite', 'classic'],
    ['animal', 'stork', 0.3, 2.0, 0, 1.5, 'white', 20], ['animal', 'stork', -0.4, 2.0, -0.2, 1.2, 'white', -50],
    ['plaque', 0, 0.8, 0.62, 0.7, 0.5, 'bronzeDark', 0],
  ] },
  'node/2953971603': { name: 'Troelstra-monument', parts: [
    ['paving', 12, 7, 'stone'], ['arch', 0, 0, -1.0, 8.2, 11.0, 1.7, 2.4, 'concrete', 0],
    ['fig', -2.4, 11.0, -1.0, 3.2, 'bronze', 'arm-up', { slim: true }], ['fig', 0, 11.0, -1.0, 3.4, 'bronze', 'stand', { slim: true, hold: 'wreath' }], ['fig', 2.4, 11.0, -1.0, 3.2, 'bronze', 'point', { slim: true }],
    ['plinth', 1.6, 0.3, 1.6, 'granite', 'plain'],
    ['fig', 0, 0.3, 2.2, 3.6, 'bronze', 'walk', { cloak: true, hair: 'mullet' }],
  ] },
  'node/5819344153': { name: 'Albert Plesman', parts: [
    ['plinth', 1.6, 0.4, 1.6, 'granite', 'plain'],
    ['fig', 0, 0.4, 0, 3.1, 'bronzeDark', 'stand', { bulky: true, hat: 'cap', cloak: true }],
  ] },
  'node/5810398998': { name: 'Long Walk to Freedom', parts: [
    ['fig', 0, 0, 0, 3.5, 'bronze', 'walk', { hair: 'bun' }],
    ...[0, 1, 2, 3, 4, 5].map((i) => ['box', (i % 2 ? 0.25 : -0.25), 0, 1.0 + i * 0.7, 0.2, 0.04, 0.3, 'bronzeDark', 0]),
  ] },
  'node/5796986016': { name: 'Eline Vere', parts: [
    ['plinth', 1.4, 0.5, 1.4, 'granite', 'stepped'],
    ['fig', 0, 0.5, 0, 2.6, 'bronze', 'hold', { robe: true, hold: 'staff', hat: 'brim', hair: 'bun' }],
    ['cone', 0.5, 2.5, 0.3, 0.55, 0.28, 'bronzeDark'],
  ] },
  'node/1343393349': { name: 'Wereldvredesvlam', parts: [
    ['paving', 2.6, 2.6, 'granite'], ['box', 0, 0, 0, 0.9, 1.4, 0.9, 'basalt', 0], ['box', 0, 1.4, 0, 1.0, 0.2, 1.0, 'granite', 0],
    ['flame', 0, 1.6, 0, 0.8], ['plaque', 0, 0.4, 0.46, 0.6, 0.4, 'bronzeDark', 0],
  ] },
  'node/2334717805': { name: 'Cascade', parts: [
    ['basin', 0, 0, 0, 4.2, 0.9, 'stone', true],
    ['box', 0, 0.3, 0, 5.2, 0.8, 2.6, 'stainless', 0], ['box', 0, 1.1, 0, 4.0, 0.8, 2.2, 'stainless', 0], ['box', 0, 1.9, 0, 2.8, 0.8, 1.8, 'stainless', 0], ['box', 0, 2.7, 0, 1.6, 0.9, 1.4, 'stainless', 0],
    ['box', 0, 0.9, 1.35, 4.6, 0.14, 0.1, 'water', 0], ['box', 0, 1.7, 1.15, 3.4, 0.14, 0.1, 'water', 0], ['box', 0, 2.5, 0.95, 2.2, 0.14, 0.1, 'water', 0],
    ['jet', 0, 3.6, 0, 0.9],
  ] },
  'way/1231842113': { name: 'Vlaggenmonument', parts: (() => {
    const P = [['paving', 11, 4, 'concrete']], cols = ['red', 'white', 'blue', 'orange', 'green', 'yellow'];
    for (let i = 0; i < 6; i++) {
      const x = -4.5 + i * 1.8, h = 7.2 + (i % 3) * 0.5;
      P.push(['cyl', x, 0, 0, 0.22, h, 'concrete'], ['box', x + 0.55, h - 1.6, 0, 1.1, 0.8, 0.06, cols[i], 0], ['box', x + 1.0, h - 1.3, 0.1, 0.5, 0.35, 0.06, cols[(i + 2) % 6], 0], ['ball', x, h, 0, 0.2, 'concrete']);
    }
    return P;
  })() },
  'node/9898311656': { name: 'Multipipe', parts: [
    ['plinth', 3.4, 0.3, 3.4, 'concrete', 'plain'],
    ['beam', -1.4, 0.3, -1.0, 0, 8.0, 0, 0.5, 'red'], ['beam', 1.4, 0.3, -1.0, 0, 8.0, 0, 0.5, 'yellow'], ['beam', 0, 0.3, 1.4, 0, 8.0, 0, 0.5, 'blue'],
    ['beam', -1.2, 0.3, 0.8, 0.6, 6.6, -0.6, 0.35, 'white'], ['beam', 1.2, 0.3, 0.8, -0.6, 5.2, -0.4, 0.35, 'orange'],
  ] },
  // ---------------------------------------------------------------- figures of the centre and the parks
  'node/1533708590': { name: 'Aartsengel Michael', parts: [
    ['plinth', 1.3, 0.8, 1.3, 'stone', 'stepped'],
    ['fig', 0, 0.8, 0, 2.6, 'bronze', 'stand', { wings: true, hold: 'sword', robe: true, hat: 'helmet', cloak: true }],
  ] },
  'node/1533809735': { name: 'Bevrijdingsmonument (Loosduinen, phoenix)', parts: [
    ['steps', 3.0, 3.0, 2, 'granite'], ['taper', 0, 0.3, 0, 1.4, 1.4, 4.6, 0.75, 'granite', 0], ['box', 0, 4.9, 0, 1.2, 0.3, 1.2, 'granite', 0],
    ['animal', 'bird', 0, 5.2, 0, 1.2, 'bronze', 0], ['box', 0.9, 5.7, 0, 1.0, 0.14, 0.6, 'bronze', 25], ['box', -0.9, 5.7, 0, 1.0, 0.14, 0.6, 'bronze', -25],
    ['box', 1.5, 6.0, 0, 0.8, 0.12, 0.5, 'bronze', 30], ['box', -1.5, 6.0, 0, 0.8, 0.12, 0.5, 'bronze', -30],
  ] },
  'node/8252361329': { name: 'Niké', parts: [
    ['plinth', 1.1, 0.8, 1.1, 'stone', 'stepped'],
    ['fig', 0, 0.8, 0, 2.2, 'bronze', 'arm-up', { wings: true, robe: true, hair: 'long' }],
  ] },
  'node/12748760335': scholar('Hugo de Groot', false, { opts: { hat: 'cap' } }),
  'node/12748760334': scholar('Ulricus Huber', true),
  'node/12748760336': scholar('Simon van Leeuwen', false, { pose: 'read' }),
  'node/12748760337': scholar('Johannes Voet', true, { opts: { hair: 'bun' } }),
  'node/12748760338': scholar('Joan Melchior Kemper', false, { pose: 'stand', opts: { hold: 'paper' } }),
  'node/12748760339': scholar('Cornelis van Bynkershoek', true, { opts: { hat: 'cap' } }),
  'node/3133279463': { name: 'Van Karnebeekbron', parts: [
    ['basin', 0, 0, 0, 1.6, 0.6, 'granite', true], ['box', 0, 0.3, -0.5, 1.4, 2.0, 0.7, 'granite', 0], ['box', 0, 2.3, -0.5, 1.8, 0.25, 0.9, 'stone', 0],
    ['plaque', 0, 1.0, -0.14, 0.8, 0.5, 'bronzeDark', 0], ['jet', 0, 0.6, 0.1, 0.4],
  ] },
  'node/6225290239': { name: 'Erasmus', parts: [
    ['plinth', 1.2, 1.2, 1.2, 'stone', 'classic'],
    ['fig', 0, 1.2, 0, 1.9, 'bronze', 'read', { robe: true, hat: 'cap' }],
  ] },
  'node/1526095813': { name: 'Koningin Regentes Emma', parts: [
    ['paving', 4.0, 4.0, 'stone'], ['plinth', 1.5, 1.4, 1.5, 'granite', 'classic'],
    ['fig', 0, 1.4, 0, 2.8, 'bronze', 'stand', { robe: true, cloak: true, hat: 'crown', hair: 'bun' }],
  ] },
  'node/1526073473': { name: 'Koning-Stadhouder Willem III', parts: [
    ['paving', 3.6, 3.6, 'stone'], ['plinth', 1.4, 1.8, 1.4, 'stone', 'classic'],
    ['fig', 0, 1.8, 0, 2.9, 'bronze', 'hold', { cloak: true, hat: 'tricorn', hair: 'long', hold: 'staff' }],
  ] },
  'node/1526099118': { name: 'Koning Willem III', parts: [
    ['paving', 3.6, 3.6, 'stone'], ['plinth', 1.4, 1.8, 1.4, 'granite', 'classic'],
    ['fig', 0, 1.8, 0, 2.9, 'bronze', 'stand', { cloak: true, hat: 'crown' }],
  ] },
  'node/1526065606': { name: 'Willem Drees', parts: [
    ['plinth', 1.3, 0.5, 1.0, 'granite', 'plain'],
    ['fig', 0, 0.5, 0, 2.5, 'bronze', 'walk', { hold: 'paper', hat: 'brim' }],
  ] },
  'node/4598231097': { name: 'Mahatma Gandhi', parts: [
    ['plinth', 1.2, 0.6, 1.2, 'granite', 'plain'],
    ['fig', 0, 0.6, 0, 2.5, 'bronze', 'hold', { hold: 'staff', nude: true, slim: true }],
  ] },
  'node/1526102270': { name: 'Constantyn Huygens', parts: [
    ['plinth', 0.8, 1.5, 0.8, 'granite', 'classic'], ['bust', 0, 1.5, 0, 0.8, 'bronze', { hair: 'long' }],
  ] },
  'node/8258530054': { name: 'Koningin Beatrix', parts: [
    ['plinth', 0.7, 1.2, 0.7, 'granite', 'plain'], ['bust', 0, 1.2, 0, 0.8, 'bronze', { hair: 'bun' }],
  ] },
  'node/12192396790': { name: 'John Wayne', parts: [
    ['plinth', 3.0, 0.3, 1.4, 'concrete', 'plain'],
    ['horse', 0, 0.3, 0, 3.0, '#b9bdc2', { rotY: 90, rider: 'stand', riderOpts: { hold: 'bag', hat: 'tall', col2: '#a8adb2' } }],
  ] },
  'node/3145327778': { name: 'Amazone (Vrouw op paard)', parts: [
    ['plinth', 3.0, 0.4, 1.4, 'granite', 'plain'],
    ['horse', 0, 0.4, 0, 2.3, 'bronze', { rotY: 90, rider: 'stand', riderOpts: { robe: true, hair: 'long', hat: 'cap' } }],
  ] },
  'node/13917968124': { name: 'Gerry de Kraai', parts: [
    ['cyl', 0, 0, 0, 1.0, 0.25, 'concrete'], ['animal', 'bird', 0, 0.25, 0, 2.6, '#26282b', 0],
    ['box', 0.9, 0.9, 0, 0.9, 0.12, 0.7, '#26282b', 35], ['box', -0.9, 0.9, 0, 0.9, 0.12, 0.7, '#26282b', -35],
  ] },
};
