# Detail audit: what each kind of place has, and what it should have

Written 2026-11-11. "Today" below means what the code drew before this round, read from `world.js` (ground, trees, building
fronts), `landmarks.js` (typed buildings, features, barriers), `crowd.js` (walkers, cars, lamps, trams) and `furnish.js`
(street furniture). "Added" is what `furnish.js` and `places.js` draw now. Everything here is placed from the tile's own data
and a position-seeded dice, so a place looks the same whenever it is built.

## The four levels

A level is what a viewer standing in the street sees. It belongs to a KIND OF PLACE, not to a building.

| Level | Name | What the viewer sees |
|---|---|---|
| L0 | Bare | Ground and blocks. The right shape, no surface or object that says what the place is. |
| L1 | Right materials | The right ground (clinker, grey tiles, grass, sand, water), building types and colours, trees where trees are, the outline of the thing. Recognisable from the air, empty at eye level. |
| L2 | Furnished | The things that normally stand there: benches and bins, racks, shelters, a stall, a playground, goal posts, a quay with posts. Each kind exists in at least three looks. |
| L3 | Lived in | People doing what the place is for (sitting, queueing, shopping, playing), activity, night lighting (glow, never a real light), and two instances of the place are not the same twice. |

Variety rule used for every furniture kind: at least three looks, or random colour and size differences, chosen by dice seeded
from the position.

## Kinds of place

"Before -> after" is the level of the typical instance. Curated places (`places.js`) can be one level higher than the rest of
their kind, as noted.

| Kind of place | Today (facts) | Before -> after | Added | Still missing |
|---|---|---|---|---|
| Residential street | Painted street with kerbs, grey pavement, red cycle lanes where mapped, centre dashes, zebras every 80 m; houses with fronts (doors, windows) from the data; register trees; crowd: walkers, cyclists, cars, parked cars, lamps every 30 m; racks, benches, bins, mailboxes, transformer boxes, blue street-name signs (one look each) | L2 -> L2+ | Underground waste containers (ORAC, 4 colours, sometimes twinned), charging posts (4 colours, single or pair), 4 looks each of bench, bin and transformer box (3 of mailbox), signposts and traffic lights at the ends of big streets, tram masts where there is a track | Front gardens and hedges (only where the map has a barrier), parked scooters, rubbish bags, parked-car variety |
| Shopping street | As above plus shops and cash machines on the fronts; herring/chips/flower stall now and then | L2 -> L3 where the data has terraces | Terraces from the `outdoor_seating` flag (tables, chairs, parasols, seated people, heaters, light strings, menu boards, a waiter; a one-row narrow version tight against the wall on a 1.8 m pavement), advertising columns (peperbus), MUPI poster frames (lit at night), pay-and-display machines, planters, big bike parks | Shop awnings and A-boards on the pavement, delivery bikes, window displays |
| Pedestrian shopping street | Ground only (`C.PED` clinker); furniture along the sides | L1+ -> L3 for curated ones | Bollard rows at both ends (3 kinds), planters, terraces, light garlands from facade to facade, Chinese lanterns across Wagenstraat | Street musicians, cargo bikes, kerb-less drainage detail |
| Square | Plaza ground; statues and fountains as map features; benches and racks around the edge | L1 -> L3 (Grote Markt, Het Plein, Buitenhof, Plaats, Anna Paulownaplein, Prins Hendrikplein, Regentesseplein), L2 elsewhere | Terraces that grow outwards in rows with aisles, one parasol colour per venue, long wooden tables on Grote Markt, wicker and cream on Het Plein, heaters, strings of lights, people | Market-day stalls on the squares that have one, pigeons, buskers |
| Park | Grass and woodland ground with trees (register plus a sprinkle), footpaths as ground, playground features | L1 -> L2 (L3 in the curated parks) | Benches, bins and lit lamps along footpaths in grass, picnic tables with people, blankets with sunbathers, standing groups, candle on the tables at night | Ducks and ponds' edges, flower beds (`tulips` exists but is not placed), dog walkers, bandstands |
| Playground | One feature: slide, swing, sandpit, no fence | L2 -> L2+ | Fence with a gate (5 colours), bench and bin outside | Children (the crowd does not seat anyone there), safety surface |
| Canal quay | Water, pavement edge; nothing on the edge | L1 -> L2/L3 | Chain posts with swagged chain (3 post looks), cast-iron mooring posts, moored boats (open sloep, cabin cruiser, houseboat with greenhouse and plants; 4 lengths, colours, gangways, glowing windows at night), only on some quays (dice per 22 m) | Bridge railings, life buoys, bikes in the water, houseboat gardens on the quay |
| Tram / bus stop | Shelter feature and the `tramStop` prop (in use: `furnish.js` draws it at each shelter point of interest) | L2 -> L2+ | Catenary masts every 26-34 m on alternating sides (3 looks, one in seven with a lamp), contact and carrier wire in each span | Platform edge, timetable, ticket machine, waiting people |
| Station forecourt | Station building type only | L1 -> L2 (Centraal, Hollands Spoor) | Bike parks full of bikes (`rackpark`), masts | Taxi rank, signs, bike garage, platform furniture |
| Beach and boulevard | Sand, random parasols with towels, a herring stall now and then | L2 -> L3 on the curated beach stretches | Beach clubs: wooden deck, tables with people, loungers with sunbathers, windbreaks, flags, light strings, wicker lounge sets; boulevard terraces with glass wind screens | The club buildings themselves (only a point in the data), volleyball, kite surfers, groynes, beach flags |
| Harbour | Water and quay; no boats | L1 -> L2/L3 | Fish and herring stalls (labels VIS, HARING, FRIET), crates, a queue, quay posts and boats through the quay pass | Fishing vessels, cranes, nets, gulls, fish auction building detail |
| Market (Haagse Markt) | Nothing | L0 -> L3 | Rows of 4 kinds of stall (vegetables, clothes, textiles, fish) with 8 awning colour pairs, crates, shoppers with bags | Stalls on the carriageway (needs the crowd to close the street), vans, price boards |
| Office district | Typed tower buildings, fronts, flags on map flagpoles | L1/L2 | Traffic lights, MUPIs and columns by the general rules | Sculptures and plaza planting, lobby light at night |
| Industrial estate (Binckhorst) | Industrial building type drawer | L1 -> L2 | Containers (6 m and 12 m, single or stacked, 6 colours), pallet stacks with goods in the yards round industrial buildings | Cranes, silos, lorries, fences with gates |
| School / sport field | `C.PITCH` ground only | L1 -> L2 | Football pitches: lines, centre circle, penalty and goal areas, goals, corner flags, dugouts; courts: fence with gate, lines, basketball hoops or small goals | Floodlights, clubhouse, spectators, net textures; neighbouring pitches mapped as one area get one set of lines |
| Cemetery / allotments | Plain grass | L1 | Nothing (no class in the data tells them from other grass) | Graves, paths, sheds, plots |
| Dunes / woods | Dune and forest ground, dense trees | L1 | Nothing | Signposts, benches at viewpoints |
| Big road / junction | Asphalt, markings, zebras, lamps | L1+ -> L2 | Traffic lights (3 looks, green, amber or red by dice) and signposts at the ends of big streets | Lane arrows, gantries, noise barriers |
| Petrol station | Canopy with pumps, glowing band at night | L2 | Nothing | Price sign, cars at the pumps |
| Parking lot | `C.PARKING` ground | L1 | Nothing (pay-and-display machines stand on busy streets only) | Bay lines, cars, lamp posts, machine at the entrance |
| Churchyard | Church building type | L1 | Nothing | Graves, hedges, benches |
| Fairground / open field (Malieveld) | Grass | L1 -> L2 | One snack kiosk with striped awning, glowing sign, bunting and a queue, two high tables, picnickers | Rides, tents, the crowd that goes with an event |

## What every addition respects

- Never on the carriageway, cycle path, tram rails (the track polylines are checked 1.8 m out as well, because the ground
  grid does not paint rails in pedestrian streets), water, within reach of a tree, or inside a statue,
  fountain, playground or fuel-station feature. The check (`fits` in `furnish.js`) tests sample points of the prop's footprint
  against the ground class, trunks and the tram and train tracks, and the prop's circle against what already stands (the
  statue, fountain, playground and fuel-station features included). It does not look at mapped fences; terraces and some of the
  area passes keep clear of those separately (`barrierNear`).
- Terraces keep a walking strip at the kerb (0.9 to 1.3 m), start 0.5 m from the facade (0.1 m in the narrow version), leave a
  1 m doorway on the first row (only on a frontage that has a door, not in the narrow version, and only with more than two columns), share a frontage with neighbouring venues (each takes half the distance to the next) and grow
  outwards in rows only where the ground is open (squares).
- Night: everything stands where it stands by day. Strings, lanterns, heaters, poster frames and windows are there by day, dark,
  and glow at night; the market is shut (no crates or shoppers), a candle stands where some tables have a second drink or a vase by day, and most
  picnickers go home.
- Budget: a tile's furniture is meant to stay under about 60,000 vertices (30,000 in the lite build), not counting the extra a
  terrace field may take (`bonus` in `furnish.js`: up to 30,000 more, so a tile with a field can reach about 90,000). Terraces and curated places go first (up to 26,000),
  the common furniture next, the rarer kinds (ORAC, columns, MUPIs, machines, charging posts, planters, big racks) last, while
  room remains. A dense tile such as Grote Markt therefore has fewer of the rarer kinds than a quiet one.

## Furniture looks (variety rule)

bench 4 looks x 4 lengths x 4 woods; bin 4 looks, size jitter; mailbox 3 looks; transformer box 4 sizes and colours; ORAC 4
colours, 30 % twinned; peperbus 3 bodies, 2 heights, 6 poster colours; MUPI 3 bodies, poster colours; pay machine 3 kinds;
charging post 4 accents, single or pair; bollards 3 kinds; planters 4 colours with or without flowers; trolley shelter 4 handle
colours, 4 to 7 trolleys; flagpoles 6 flag designs, 2 or 3 poles; quay post 3 looks, mooring 2; boats 7 combinations of type and length (open sloep and cabin cruiser at 6.5, 8 or 10.5 m, houseboat at 13 m) x hull
colours; mast 3 looks; traffic light 3 looks x 3 phases; terrace: 6 table arrangements x 3 chair kinds x 5 parasol families x 5
canopy shapes, table tops 6, occupancy 0.08-0.92, people with 6 skins, 11 shirts, 7 trousers, 7 hair colours, 4 hair styles
and 5 poses; market stall 4 kinds x 8 awning pairs x widths; picnic table 3 looks x lengths; lantern 2 colours, scale 0.95-1.35.

## How to check

`node --check src/voxel/furnish.js` and `npx vite build --outDir <somewhere outside dist>`. The vertex count per tile is
`v.n + gl.n` after `furnishTile`; a scan over all tiles on 2026-11-11 gave a maximum of about 61,000 and an average of about
20,000.
