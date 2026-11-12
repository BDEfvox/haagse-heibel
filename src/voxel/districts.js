// Who lives where: the people of every neighbourhood, as a table you can tune.
//
// HOW THE TABLE WORKS
// -------------------
// The crowd (crowd.js) asks `spotAt(mapX, mapY)` for the spot a lane runs through and reads its `pop`:
//   { [archetypeId]: density }.
// UNIT OF A DENSITY: the *share per 100* of the people spawned there who are of that type. A walker archetype
// is a share of the walkers on the pavement (28 = 28 of every 100 walkers); a rider archetype is a share of the
// cyclists on the bike lanes (45 = 45 of every 100 riders are on a fat-bike). Shares of one spot are added up and
// whatever is left over stays generic. The same density also drives the groups that hang around (see `group`).
// Rows below use small numbers (1-15) for a flavour and 20-50 for a district that is *known* for something.
//
// ARCHETYPES  (what a type of person is: look, vehicle, behaviour; never skin tone or origin: skin always comes
//              from the crowd's one shared random palette)
//   label      name for humans
//   kind       'walker' (walks the pavement) | 'rider' (rides a bike of type `bike`)
//   model      id of the figure in crowd.js (MODELS); `models: [...]` = pick one per person
//   shirt, pants, hair   lists of hex colours for the body parts that take instance colours (jacket/top, trousers,
//                        hair or cap). Omit to use the crowd's general palettes.
//   speed      [min, max] metres per second.  gait: stride swing multiplier (1 = walking, 1.7 = running)
//   lean       leans forward (radians), for runners.  scale: body height multiplier (1 = normal)
//   watch      0..1, how curious they are when a scene plays out in front of them (crowd.js setStage): the chance that they
//              stop at the edge and watch instead of going round or turning back. Default 0.4 for plain walkers
//              (kids 0.85); cyclists use it as the chance of waiting instead of turning round.
//   cap        how many of them can exist at once (desktop; phones get 30 %). They still count against the
//              general walker/cyclist budgets of the crowd, this only sizes the draw pool.
//   byCrime    optional: density by the buurt's crime level [0, 1, 2, 3, 4, 5] when a district row does not state
//              its own number for this archetype (this is how niffo spreads over the whole city).
//   riders only:
//     bike      'bike' | 'fatbike' | 'cargo'   (vehicle model, see crowd.js BIKES)
//     bikeCols  hex colours of the vehicle body
//     twoUp     chance (0-1) of a passenger
//     pave      fat-bike style: relative weight of riding on the pavement. A rider type with pave 0.1 shows up
//               among the walkers with 10 % of its density (walkers step aside for it)
//     paveSpeed [min, max] speed on the pavement
//     foot      weight of the same people walking on foot among the walkers (like pave); footSpeed [min, max]
//   group      optional: hangs around in clusters
//     size [min, max] people;  rate  groups per 100 m of pavement where the density is 100
//     (so density 40 and rate 0.2 = 0.08 groups per 100 m);  bikes  parked vehicles per group (0-2);
//     near  how much more likely a spot is next to: bench, bar (pub/nightclub), snack (cafe, snack bar,
//           coffee shop), plaza (square or pedestrian street), corner (end of a pavement run), wide (broad pavement)
//
// DISTRICTS  (one row per wijk, the name as in buurten.geojson `wijk` without its "Wijk NN " prefix)
//   pop    { archetypeId: density }  what to add (see the unit above)
//   mult   { walk, bike, car }  multipliers for the generic walkers, cyclists and cars (1 = as the street class
//          says; 0.6 = a quiet villa district, 1.4 = busy)
// `default` is used for places outside every buurt.
//
// TO ADD A DISTRICT ROW: copy a line, change the key to the wijk name, pick a preset and tweak `pop`/`mult`.
//   Wijk names must match exactly. A wijk without a row gets `default`.
// TO ADD AN ARCHETYPE: add an entry to ARCHETYPES (reusing an existing `model` is enough: only colours/speeds
//   change), then give some districts a density for it. A brand new look needs a builder in crowd.js (MODELS).

// niffo at its densest (Schildersbuurt, Laak): about 45 in 100 riders. A buurt elsewhere gets a fraction of that
// by its crime level (level 5 = a fifth).
const NIFFO_CORE = 45;

export const ARCHETYPES = {
  // Teenagers on fat-bikes (20 x 4 inch tyres, long bench seat, round headlight), parody designer tracksuit
  // (beige/brown "HH" monogram, green-red stripe), cap or hood. Often two on the seat; some ride on the pavement.
  niffo: {
    label: 'Straat Niffo', kind: 'rider', models: ['niffo', 'niffoHood'], bike: 'fatbike',
    watch: 0.9,
    bikeCols: ['#151515', '#151515', '#1f1f23', '#ececec', '#2a2a2a', '#3a3f3a'],
    shirt: ['#c8aa7c', '#b9966a', '#a98259', '#d6c19a', '#8a6a48'],
    pants: ['#c0a276', '#a98259', '#8a6a48', '#2b2b2f', '#c8aa7c'],
    hair: ['#151515', '#222222', '#3a2a1c', '#c8aa7c', '#0e0e0e'],
    speed: [6.8, 9.5], gait: 1, twoUp: 0.32, pave: 0.07, paveSpeed: [4.6, 6.4], foot: 0.06, footSpeed: [1.3, 1.9], cap: 130,
    byCrime: [0, 0.02, 0.06, 0.1, 0.15, 0.2].map((f) => f * NIFFO_CORE),
    group: { size: [3, 6], rate: 0.22, bikes: 1.1, near: { bench: 2.5, snack: 3, bar: 1.2, plaza: 2.2, corner: 2, wide: 2 } },
  },
  // Men with a mullet and a Stone-Island-style jacket with a little stork badge on the upper left sleeve.
  harry: {
    label: 'Haagse Harry', kind: 'walker', model: 'harry',
    watch: 0.85,
    shirt: ['#1f2a44', '#2f4a38', '#16181d', '#5b2c2c', '#3a3f4a', '#6a6a58'],
    pants: ['#2f3f5c', '#1f2430', '#4a4a4a', '#34405a'],
    hair: ['#2b1d14', '#5a3825', '#c58b3c', '#e6c36a', '#111111', '#a33b20'],
    speed: [1.25, 1.75], gait: 1, cap: 90,
    group: { size: [3, 5], rate: 0.2, bikes: 0, near: { bench: 2.5, bar: 4, snack: 3, plaza: 1.3, corner: 1.3, wide: 1.5 } },
  },
  civil: { // civil servant: suit, tie, briefcase
    label: 'Ambtenaar', kind: 'walker', model: 'civil',
    watch: 0.35,
    shirt: ['#262c3a', '#3a3f4a', '#1b1d22', '#4a4d57', '#2b3a55'], pants: ['#262c3a', '#3a3f4a', '#1b1d22', '#4a4d57'],
    speed: [1.5, 2.0], cap: 70,
  },
  tourist: { // sun hat, backpack, camera
    label: 'Toerist', kind: 'walker', model: 'tourist',
    watch: 0.85,
    shirt: ['#f4a261', '#e9c46a', '#ff7aa2', '#3a86ff', '#ffffff', '#52b788'], pants: ['#c9b48a', '#6b705c', '#3d405b', '#8a8f96'],
    speed: [0.85, 1.25], cap: 70,
  },
  jogger: { // headband, bare arms and legs, leans forward
    label: 'Hardloper', kind: 'walker', model: 'jogger',
    watch: 0.08,
    shirt: ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#ffffff'], pants: ['#1b1d22', '#2b2b55', '#3a3f4a'],
    speed: [2.7, 3.7], gait: 1.75, lean: 0.12, cap: 50,
  },
  pensioner: { // grey hair, shopping trolley or rollator
    label: 'Gepensioneerde', kind: 'walker', models: ['pensionerTrolley', 'pensionerRollator'],
    watch: 0.15,
    shirt: ['#8d7f6a', '#6f7f8f', '#9a6f7a', '#a39e93', '#586b5a'], pants: ['#4a4e69', '#5c4033', '#3d405b', '#6b705c'],
    hair: ['#cfcfcf', '#e6e6e6', '#b9b9b9', '#d8d2c4'], speed: [0.6, 0.95], gait: 0.7, cap: 60,
  },
  surfer: { // board under the arm, wetsuit trousers, bleached hair
    label: 'Surfer', kind: 'walker', model: 'surfer',
    watch: 0.5,
    shirt: ['#2f3640', '#e63946', '#4cc9f0', '#f4a261', '#1d3557'], pants: ['#15171c', '#1d2a44', '#222222'],
    hair: ['#e6c36a', '#c58b3c', '#5a3825', '#e8d9a0'], speed: [1.2, 1.7], cap: 40,
  },
  parent: { // parent on a cargo bike (bakfiets) with two children in the box
    label: 'Bakfietsouder', kind: 'rider', model: 'person', bike: 'cargo',
    watch: 0.3,
    bikeCols: ['#2a9d8f', '#e76f51', '#457b9d', '#8d99ae', '#6a994e'],
    shirt: ['#2a9d8f', '#e76f51', '#457b9d', '#e9c46a', '#9d4edd', '#52b788'], pants: ['#2b3a55', '#3d405b', '#5c4033', '#22223b'],
    speed: [3.2, 4.6], cap: 36,
  },
  courier: { // delivery rider with a big cube backpack, fast
    label: 'Bezorger', kind: 'rider', model: 'courier', bike: 'bike',
    watch: 0.1,
    bikeCols: ['#111111', '#2b2b2b', '#e63946', '#1d3557'],
    shirt: ['#1fb6a8', '#2fc4b8', '#18a095'], pants: ['#1b1d22', '#2b3a55'],
    speed: [5.4, 7.6], cap: 40,
  },
  shopper: { // market shopper with a wheeled trolley and a tote
    label: 'Marktbezoeker', kind: 'walker', model: 'shopper',
    watch: 0.3,
    shirt: ['#e84a5f', '#2a9d8f', '#f4a261', '#9d4edd', '#52b788', '#fb8500', '#e9c46a'], pants: ['#2b3a55', '#6b705c', '#5c4033', '#4a4e69'],
    speed: [0.85, 1.3], cap: 60,
  },
};

// ---- presets: the flavour of a kind of district, reused by many rows
const row = (base, pop = {}, mult = {}) => ({ pop: { ...base.pop, ...pop }, mult: { walk: 1, bike: 1, car: 1, ...base.mult, ...mult } });
const CITY = { pop: { civil: 9, tourist: 9, courier: 6, shopper: 3, harry: 2.5 }, mult: { walk: 1.4, bike: 1.25, car: 1.2 } };
const VILLA = { pop: { jogger: 9, parent: 5, civil: 2, pensioner: 3 }, mult: { walk: 0.65, bike: 0.8, car: 0.55 } };
const FAMILY = { pop: { parent: 9, jogger: 6, pensioner: 3, courier: 2 }, mult: { walk: 0.9, bike: 1.15, car: 0.8 } };
const BEACH = { pop: { tourist: 12, surfer: 8, jogger: 3, courier: 3, harry: 3 }, mult: { walk: 1.3, bike: 1.1, car: 0.9 } };
const DUNES = { pop: { surfer: 6, jogger: 6, tourist: 5, pensioner: 2 }, mult: { walk: 0.55, bike: 0.7, car: 0.45 } };
const ESTATE = { pop: { pensioner: 12, shopper: 3, parent: 3, courier: 2 }, mult: { walk: 0.9, bike: 0.9, car: 0.9 } };
const NEW = { pop: { parent: 10, jogger: 4, courier: 3, pensioner: 1 }, mult: { walk: 0.7, bike: 1.0, car: 0.8 } };
const MARKET = { pop: { shopper: 14, courier: 5, pensioner: 4, tourist: 2 }, mult: { walk: 1.5, bike: 1.2, car: 1.0 } };
const WORKING = { pop: { pensioner: 6, courier: 4, shopper: 3, parent: 3 }, mult: { walk: 1.0, bike: 1.0, car: 1.0 } };
const PARK = { pop: { jogger: 12, pensioner: 4, parent: 2 }, mult: { walk: 0.5, bike: 0.7, car: 0.3 } };
const OFFICE = { pop: { civil: 14, courier: 5, jogger: 2, tourist: 3 }, mult: { walk: 1.0, bike: 1.0, car: 1.0 } };

const DISTRICTS = {
  // ---- the core
  'Centrum': row(CITY, { civil: 12, tourist: 14, harry: 7 }, { walk: 1.6, car: 1.1 }),
  'Stationsbuurt': row(CITY, { civil: 11, courier: 8, harry: 5 }, { walk: 1.6, bike: 1.3 }),
  'Zeeheldenkwartier': row(CITY, { harry: 4.5, parent: 4, tourist: 5, civil: 4 }, { walk: 1.15, car: 0.9 }),
  'Willemspark': row(OFFICE, { harry: 2, tourist: 6 }, { walk: 0.9, car: 0.8 }),
  'Haagse Bos': row(PARK, { civil: 8, harry: 1.5, jogger: 8 }, { walk: 0.7, car: 0.5 }),
  'Bezuidenhout': row(OFFICE, { civil: 15, harry: 1.5, pensioner: 4 }, { walk: 1.0, bike: 1.1 }),
  'Groente- en Fruitmarkt': row(MARKET, { harry: 2, tourist: 4 }, { walk: 1.6 }),
  'Zorgvliet': row(VILLA, { civil: 6, jogger: 10 }, { walk: 0.6, car: 0.5 }),
  // ---- the two where niffo is at home (the number is a share of the cyclists)
  'Schildersbuurt': row(WORKING, { niffo: NIFFO_CORE, harry: 1.5, courier: 6, shopper: 4 }, { walk: 1.25, bike: 1.2, car: 1.0 }),
  'Laakkwartier en Spoorwijk': row(WORKING, { niffo: 40, courier: 5, shopper: 4 }, { walk: 1.1, bike: 1.2 }),
  'Binckhorst': row(WORKING, { niffo: 40, courier: 5, civil: 3, parent: 1 }, { walk: 0.7, bike: 1.0, car: 1.2 }),
  // ---- the coast; Duindorp is where the Harrys are
  'Duindorp': row(WORKING, { harry: 22, pensioner: 5, parent: 4, shopper: 1 }, { walk: 1.1, bike: 1.0, car: 0.9 }),
  'Scheveningen': row(BEACH, { harry: 7 }, { walk: 1.4 }),
  'Belgisch Park': row(FAMILY, { surfer: 4, harry: 2, jogger: 7 }, { walk: 0.9 }),
  'Oostduinen': row(DUNES, { jogger: 8 }),
  'Westbroekpark en Duttendel': row(PARK, { jogger: 10, civil: 3 }),
  'Van Stolkpark en Scheveningse Bosjes': row(PARK, { jogger: 14, surfer: 2 }),
  'Kijkduin en Ockenburgh': row(DUNES, { surfer: 9, tourist: 6 }, { walk: 0.7 }),
  // ---- villa and family districts
  'Benoordenhout': row(VILLA, { jogger: 12, parent: 6, civil: 3 }),
  'Archipelbuurt': row(VILLA, { jogger: 10, civil: 4, tourist: 2 }, { walk: 0.8 }),
  'Geuzen- en Statenkwartier': row(FAMILY, { parent: 12, jogger: 7, surfer: 1.5 }, { walk: 1.0 }),
  'Duinoord': row(FAMILY, { parent: 11, jogger: 4 }),
  'Bomen- en Bloemenbuurt': row(FAMILY, { parent: 13, harry: 1, shopper: 2 }, { walk: 1.0, bike: 1.2 }),
  'Regentessekwartier': row(FAMILY, { parent: 11, harry: 1.5, courier: 3 }, { walk: 1.05 }),
  'Vogelwijk': row(VILLA, { jogger: 10, parent: 5 }, { walk: 0.6 }),
  'Valkenboskwartier': row(WORKING, { harry: 1.5, parent: 5, shopper: 3 }, { walk: 1.1 }),
  'Vruchtenbuurt': row(WORKING, { parent: 4, pensioner: 7 }, { walk: 0.95 }),
  // ---- post-war districts and the south-west
  'Mariahoeve en Marlot': row(ESTATE, { pensioner: 14, civil: 3 }),
  'Bohemen en Meer en Bos': row(ESTATE, { pensioner: 13, jogger: 3 }, { walk: 0.8, car: 0.8 }),
  'Waldeck': row(ESTATE, { pensioner: 14, shopper: 3 }),
  'Loosduinen': row(ESTATE, { pensioner: 13, parent: 4, shopper: 3 }, { walk: 0.9 }),
  'Kraayenstein en Vroondaal': row(NEW, { pensioner: 5, jogger: 6 }, { walk: 0.6, car: 0.7 }),
  'Transvaalkwartier': row(MARKET, { courier: 6, pensioner: 4 }, { walk: 1.4 }),
  'Rustenburg en Oostbroek': row(WORKING, { pensioner: 8 }),
  'Leyenburg': row(WORKING, { pensioner: 7, shopper: 4 }),
  'Bouwlust': row(WORKING, { pensioner: 8, shopper: 4 }),
  'Morgenstond': row(WORKING, { pensioner: 8, shopper: 3 }),
  'Zuiderpark': row(PARK, { jogger: 14, parent: 4 }, { walk: 0.55 }),
  'Moerwijk': row(WORKING, { pensioner: 7, courier: 5 }, { walk: 1.05 }),
  // ---- Vinex districts
  'Wateringse Veld': row(NEW, { parent: 12 }),
  'Hoornwijk': row(NEW, { pensioner: 4 }, { walk: 0.6 }),
  'Ypenburg': row(NEW, { parent: 11, jogger: 5 }),
  'Forepark': row(NEW, { parent: 9, courier: 4 }, { walk: 0.55 }),
  'Leidschenveen': row(NEW, { parent: 10, jogger: 5 }),
  // ---- anywhere not in a buurt
  default: row({ pop: { civil: 3, jogger: 3, pensioner: 4, courier: 2, parent: 3 }, mult: {} }),
};

// ------------------------------------------------------------------------------------------------ lookup
// Projection of the whole project (the same as the world builder): metres east and north of 4.30 E, 52.07 N.
const KX = 68430, KY = 111267, LON0 = 4.3, LAT0 = 52.07;
const GRID = 250; // bucket size in metres

let polys = []; // { wijk, buurt, level, rings: [Float64Array [x0,y0,x1,y1,...]], x0,y0,x1,y1, spot }
let buckets = new Map();
let fallback = null;

/** The record every spot of a district shares: pure data, never mutate it. */
function resolve(wijk, buurt, level) {
  const d = DISTRICTS[wijk] || DISTRICTS.default, pop = {};
  Object.assign(pop, d.pop);
  for (const id of Object.keys(ARCHETYPES)) {
    const A = ARCHETYPES[id];
    if (!(id in pop) && A.byCrime) pop[id] = A.byCrime[Math.max(0, Math.min(A.byCrime.length - 1, level))] || 0;
  }
  const spot = { wijk, buurt, level, pop, mult: { walk: 1, bike: 1, car: 1, ...d.mult } };
  Object.freeze(pop); Object.freeze(spot.mult); Object.freeze(spot);
  return spot;
}
fallback = (() => { const s = resolve('', '', 1); return { wijk: null, buurt: null, level: 0, pop: s.pop, mult: s.mult }; })();

/** Called once at boot with buurten.geojson. */
export function setDistrictData(geojson) {
  polys = []; buckets = new Map();
  for (const f of geojson.features || []) {
    const g = f.geometry, p = f.properties || {};
    if (!g) continue;
    const parts = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const wijk = String(p.wijk || '').replace(/^Wijk\s+\d+\s+/, ''), level = Math.max(0, Math.min(5, p.level | 0));
    const spot = resolve(wijk, p.name || '', level);
    for (const poly of parts) {
      const rings = poly.map((r) => { const a = new Float64Array(r.length * 2); r.forEach((c, i) => { a[i * 2] = (c[0] - LON0) * KX; a[i * 2 + 1] = (c[1] - LAT0) * KY; }); return a; });
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const o = rings[0];
      for (let i = 0; i < o.length; i += 2) { x0 = Math.min(x0, o[i]); x1 = Math.max(x1, o[i]); y0 = Math.min(y0, o[i + 1]); y1 = Math.max(y1, o[i + 1]); }
      const e = { rings, x0, y0, x1, y1, spot };
      polys.push(e);
      for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++) for (let gy = Math.floor(y0 / GRID); gy <= Math.floor(y1 / GRID); gy++) {
        const k = gx * 65536 + gy;
        let b = buckets.get(k);
        if (!b) buckets.set(k, (b = []));
        b.push(e);
      }
    }
  }
}

function inRing(a, x, y) {
  let c = false;
  for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
    const xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** The shared record of the buurt at a map-metre spot (or the default one): { wijk, buurt, level, pop, mult }. Do not mutate. */
export function spotAt(mx, my) {
  const b = buckets.get(Math.floor(mx / GRID) * 65536 + Math.floor(my / GRID));
  if (b) for (const e of b) {
    if (mx < e.x0 || mx > e.x1 || my < e.y0 || my > e.y1) continue;
    if (!inRing(e.rings[0], mx, my)) continue;
    let hole = false;
    for (let i = 1; i < e.rings.length && !hole; i++) hole = inRing(e.rings[i], mx, my);
    if (!hole) return e.spot;
  }
  return fallback;
}
