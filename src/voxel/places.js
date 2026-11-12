// The Hague's lively places, as a small curated table: where people sit outside, stroll, shop or play in reality.
// furnish.js reads it per tile (`placesFor(tx, ty)`) and dresses the ground inside each place with its recipes, on top of
// what every street already gets from the map data. Terraces come from the map's `outdoor_seating` flag; a place in this
// table gets them for EVERY pub, café, restaurant and ice-cream shop inside it, flag or not.
//
// HOW TO ADD A ROW
//   { id, name, x, y, box | r, recipes: { <recipe>: { ...options } } }
//   x, y   map metres of the middle (x = (lon - 4.30) * 68430, y = (lat - 52.07) * 111267; north is +y).
//          Find them in .cache/osm-pois.json (a pub's coordinates), or in a tile: map x = tx * 256 + tile x,
//          map y = ty * 256 + 256 - tile z.
//   box    [x0, y0, x1, y1] in map metres, or r: a radius round x, y. Everything inside gets the recipes.
//   recipes (all optional, any number):
//     terraces   every eating / drinking place inside gets a terrace.            Options below.
//     field      one continuous field of tables grown out from the cafe fronts into the square (needs `terraces` too):
//                reach (m from a front), style, lane (m between clear lanes), keep [[x, y, r], ...] circles kept free.
//     garlands   warm strings of lights on poles over the terraces (lit at night, dark but present by day).
//     lanterns   red lanterns strung across the streets inside (Chinatown); `streets` limits it to named streets.
//     market     (ground: { seed: [x, y] map metres, angle: degrees of the rows in tile axes (x east, z south), halfW, halfL })
//                fills the open ground round the seed with back-to-back rows; shut at night. Rows of market stalls along the streets inside (`streets` limits it by name). They stand on the
//                pavements. `inRoad: true` puts them on the carriageway as well, which is only right once the crowd
//                closes that street to cars (nothing here does that yet, so the cars would drive through the stalls).
//     stalls     fish / herring / chips stalls and crates along a quay or promenade (harbour).
//     beach      beach clubs: decks, loungers, windbreaks, flags, on the sand inside (`seaward` = compass degrees to the sea).
//     picnic     picnic tables, blankets and people on the grass inside.
//     kiosk      one fairground / snack kiosk with a queue, at exactly x, y.
//     station    big bicycle parks and bollards on the forecourt at x, y.
//   terraces options:
//     parasol   'dark' | 'cream' | 'brand' | 'striped' | 'straw'     (colour family; 'brand' = each place its own colour)
//     big       true: big rectangular parasols over long tables
//     tables    'bench' | 'bistro' | 'sq4' | 'high' | 'lounge' | 'mix' (default 'mix': picked per venue)
//     chairs    'wicker' | 'bistro' | 'wood' | 'mix'
//     heaters   0..1  chance of patio heaters;  lights 0..1  chance of a light string;  busy  0..1.4  how full the seats are
//     maxRows   rows of tables a square can grow outwards (default 3);  width  frontage multiplier (default 1)
//     wind      true: glass wind screens along the open side (the boulevard)
//   Keep boxes tight: a recipe is only as good as the ground it finds (it never builds on the carriageway, cycle path,
//   tram rails, water or within reach of a tree).
export const PLACES = [
  // ---- squares and old-town terraces
  { id: 'grote-markt', name: 'Grote Markt', x: 622, y: 640, box: [560, 575, 665, 700],
    recipes: { terraces: { parasol: 'dark', big: true, tables: 'bench', chairs: 'wood', heaters: 0.8, lights: 1, busy: 1.25, maxRows: 4, width: 1.3 }, garlands: { density: 1 }, field: { reach: 20, style: 'bench', lane: 13, keep: [[627, 618, 10]], statue: 10 } } },
  { id: 'het-plein', name: 'Het Plein', x: 1107, y: 1075, box: [1040, 1020, 1148, 1165],
    recipes: { terraces: { parasol: 'cream', tables: 'bistro', chairs: 'wicker', heaters: 0.5, lights: 0.8, busy: 1.2, maxRows: 4, width: 1.3 }, garlands: { density: 0.8 }, field: { reach: 26, style: 'bistro', lane: 13, keep: [[1084, 1096, 16]], statue: 16 } } },
  { id: 'buitenhof', name: 'Buitenhof', x: 695, y: 975, box: [640, 925, 790, 1035],
    recipes: { terraces: { parasol: 'brand', tables: 'sq4', chairs: 'bistro', heaters: 0.6, lights: 0.8, busy: 1.1, maxRows: 3 }, garlands: { density: 0.6 } } },
  { id: 'plaats', name: 'Plaats / Lange Poten', x: 640, y: 1090, box: [585, 1055, 710, 1135],
    recipes: { terraces: { parasol: 'cream', tables: 'bistro', chairs: 'wicker', heaters: 0.5, lights: 0.7, busy: 1.0, maxRows: 2 } } },
  { id: 'prinsestraat-molenstraat', name: 'Prinsestraat and Molenstraat', x: 400, y: 1020, box: [260, 880, 540, 1160],
    recipes: { terraces: { parasol: 'brand', tables: 'mix', chairs: 'bistro', heaters: 0.5, lights: 0.7, busy: 1.0, maxRows: 2 }, garlands: { density: 0.5 } } },
  { id: 'denneweg', name: 'Denneweg', x: 840, y: 1730, box: [775, 1600, 925, 1830],
    recipes: { terraces: { parasol: 'brand', tables: 'sq4', chairs: 'wood', heaters: 0.6, lights: 0.8, busy: 1.0, maxRows: 2 }, garlands: { density: 0.6 } } },
  { id: 'anna-paulownaplein', name: 'Anna Paulownaplein', x: -20, y: 1628, r: 75,
    recipes: { terraces: { parasol: 'brand', tables: 'bistro', chairs: 'bistro', heaters: 0.5, lights: 0.7, busy: 1.0, maxRows: 3 } } },
  { id: 'prins-hendrikplein', name: 'Prins Hendrikplein', x: -368, y: 1383, r: 85,
    recipes: { terraces: { parasol: 'brand', tables: 'mix', chairs: 'wicker', heaters: 0.5, lights: 0.7, busy: 1.0, maxRows: 3 } } },
  { id: 'regentesseplein', name: 'Regentesseplein', x: -1175, y: 750, r: 70,
    recipes: { terraces: { parasol: 'cream', tables: 'bistro', chairs: 'wicker', heaters: 0.4, lights: 0.6, busy: 1.0, maxRows: 2 } } },
  { id: 'frederik-hendriklaan', name: 'Frederik Hendriklaan', x: -1710, y: 2400, box: [-1770, 2100, -1640, 2530],
    recipes: { terraces: { parasol: 'brand', tables: 'mix', chairs: 'bistro', heaters: 0.4, lights: 0.6, busy: 0.9, maxRows: 2 } } },
  // ---- Chinatown (Wagenstraat) and the Haagse Markt
  { id: 'chinatown', name: 'Chinatown (Wagenstraat)', x: 960, y: 570, box: [870, 500, 1045, 680],
    recipes: { lanterns: { streets: ['Wagenstraat'] }, terraces: { parasol: 'striped', tables: 'sq4', chairs: 'bistro', heaters: 0.3, lights: 0.6, busy: 1.0, maxRows: 2 } } },
  { id: 'haagse-markt', name: 'Haagse Markt (Herman Costerstraat)', x: -150, y: -560, box: [-260, -760, -60, -390],
    recipes: { market: { streets: ['Herman Costerstraat'], ground: { seed: [-65, -596], angle: 59, halfW: 36, halfL: 190 } } } },
  // ---- the coast
  { id: 'scheveningen-boulevard', name: 'Scheveningen boulevard and Kurhausplein', x: -1200, y: 4880, box: [-1480, 4640, -950, 5300],
    recipes: { terraces: { parasol: 'brand', tables: 'lounge', chairs: 'wicker', heaters: 0.7, lights: 1, busy: 1.2, maxRows: 3, wind: true }, garlands: { density: 0.8 } } },
  { id: 'scheveningen-beach-north', name: 'Scheveningen beach clubs (north)', x: -700, y: 5480, box: [-1000, 5250, -380, 5800],
    recipes: { beach: { seaward: 300 } } },
  { id: 'scheveningen-beach-middle', name: 'Scheveningen beach clubs (middle)', x: -1480, y: 4720, box: [-1760, 4400, -1250, 4980],
    recipes: { beach: { seaward: 300 } } },
  { id: 'scheveningen-beach-south', name: 'Scheveningen beach clubs (south)', x: -2150, y: 3880, box: [-2420, 3500, -1900, 4200],
    recipes: { beach: { seaward: 295 } } },
  { id: 'scheveningen-harbour', name: 'Scheveningen harbour', x: -2300, y: 3480, box: [-2500, 3330, -2150, 3650],
    recipes: { stalls: { }, terraces: { parasol: 'striped', tables: 'bench', chairs: 'wood', heaters: 0.5, lights: 0.8, busy: 1.0, maxRows: 2 } } },
  { id: 'kijkduin', name: 'Kijkduin boulevard', x: -5780, y: -520, r: 260,
    recipes: { terraces: { parasol: 'brand', tables: 'lounge', chairs: 'wicker', heaters: 0.6, lights: 0.8, busy: 1.0, maxRows: 2, wind: true }, beach: { seaward: 290 } } },
  // ---- parks
  { id: 'zuiderpark', name: 'Zuiderpark', x: -980, y: -1650, r: 480, recipes: { picnic: { n: 10 } } },
  { id: 'westbroekpark', name: 'Westbroekpark', x: -605, y: 3800, r: 270, recipes: { picnic: { n: 9 } } },
  { id: 'paleistuin', name: 'Paleistuin', x: 293, y: 1222, r: 130, recipes: { picnic: { n: 6, tables: false } } },
  { id: 'malieveld', name: 'Malieveld', x: 1350, y: 1740, r: 210, recipes: { kiosk: { x: 1296, y: 1668 }, picnic: { n: 4, tables: false } } },
  // ---- stations
  { id: 'den-haag-centraal', name: 'Den Haag Centraal', x: 1680, y: 1207, r: 90, recipes: { station: { racks: 7 } } },
  { id: 'den-haag-hs', name: 'Den Haag Hollands Spoor', x: 1524, y: 15, r: 90, recipes: { station: { racks: 6 } } },
];

const inPlace = (p, mx, my, pad = 0) => (p.box
  ? mx >= p.box[0] - pad && mx <= p.box[2] + pad && my >= p.box[1] - pad && my <= p.box[3] + pad
  : Math.hypot(mx - p.x, my - p.y) <= p.r + pad);
/** The places that touch the 256 m tile (tx, ty), in map metres. */
export function placesFor(tx, ty) {
  const x0 = tx * 256, y0 = ty * 256, out = [];
  for (const p of PLACES) {
    const bx0 = p.box ? p.box[0] : p.x - p.r, bx1 = p.box ? p.box[2] : p.x + p.r, by0 = p.box ? p.box[1] : p.y - p.r, by1 = p.box ? p.box[3] : p.y + p.r;
    if (bx1 < x0 || bx0 > x0 + 256 || by1 < y0 || by0 > y0 + 256) continue;
    out.push(p);
  }
  return out;
}
/** Is the map point inside the place? */
export const placeHas = inPlace;
