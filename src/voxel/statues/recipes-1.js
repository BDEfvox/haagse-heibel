// Recipes batch 1: hand-composed landmark models. See scratchpad statue-schema.md for the part vocabulary.
export default {
  // Centraal Monument voor Gevallen PTT'ers: tall brick-and-stone column with a plaque on a low stepped base (guess)
  'node/1533818366': { name: "Centraal Monument voor Gevallen PTT'ers", parts: [
    ['steps', 2.2, 2.2, 2, 'granite'], ['taper', 0, 0.3, 0, 0.9, 0.9, 3.5, 0.7, 'stone'], ['box', 0, 3.8, 0, 0.8, 0.2, 0.8, 'granite'], ['plaque', 0, 1.0, 0.46, 0.5, 0.6, 'bronzeDark'] ] },
  // De Wachter: single slim standing figure, bronze-dark, watching, on a low block (guess)
  'node/1533903087': { name: 'De Wachter', parts: [
    ['plinth', 1.0, 0.5, 1.0, 'granite', 'plain'], ['fig', 0, 0.5, 0, 2.5, 'bronzeDark', 'stand', { slim: true, cloak: true }] ] },
  // Bevrijdingsmonument Irene: standing soldier figure with rifle on a tall stone plinth (guess)
  'node/1533914740': { name: 'Bevrijdingsmonument Irene', parts: [
    ['steps', 2.4, 2.4, 2, 'stone'], ['plinth', 1.4, 2.0, 1.4, 'stone', 'classic'], ['fig', 0, 2.2, 0, 2.2, 'bronze', 'stand', { hold: 'rifle', hat: 'helmet' }], ['plaque', 0, 0.9, 0.72, 0.8, 0.5, 'bronzeDark'] ] },
  // Oorlogsmonument Mei 1940: low upright stone stele with inscription (guess)
  'node/1533706548': { name: 'Oorlogsmonument Mei 1940', parts: [
    ['paving', 2.0, 1.4, 'concrete'], ['slab', 0, 0.08, 0, 0.9, 1.9, 0.25, 'granite'], ['plaque', 0, 0.9, 0.14, 0.6, 0.7, 'bronzeDark'] ] },
  // Monument Bezuidenhoutkwartier: low memorial wall with plaque and a lower side stone (guess)
  'node/1533877925': { name: 'Monument voor het Bezuidenhoutkwartier', parts: [
    ['wall', 0, 0, 0, 2.6, 1.1, 0.4, 'brick'], ['plaque', 0, 0.35, 0.21, 1.2, 0.5, 'bronzeDark'], ['box', 1.7, 0, 0, 0.6, 0.5, 0.5, 'granite'] ] },
  // Louis Couperus (Surinamestraat): standing bronze writer in coat holding a book on low base
  'node/3186219845': { name: 'Louis Couperus', parts: [
    ['plinth', 1.0, 0.45, 1.0, 'granite', 'plain'], ['fig', 0, 0.45, 0, 1.75, 'bronze', 'hold', { hold: 'book', hat: 'brim' }] ] },
  // Brits Militair Herdenkingskruis: tall stone cross on stepped base with small sword plate (guess)
  'node/5800861715': { name: 'Brits Militair Herdenkingskruis 1914-1917', parts: [
    ['steps', 2.0, 2.0, 3, 'stone'], ['box', 0, 0.4, 0, 0.5, 1.2, 0.5, 'stone'], ['cross', 0, 1.6, 0, 1.6, 'stone'], ['beam', 0, 2.0, 0.08, 0, 2.9, 0.08, 0.1, 'steel'] ] },
  // Het gesprek: two stone figures facing each other in conversation, gesturing
  'node/6282799446': { name: 'Het gesprek', parts: [
    ['plinth', 2.0, 0.3, 1.4, 'granite', 'plain'], ['fig', -0.5, 0.3, 0, 1.8, 'stone', 'point', { rotY: 90, bulky: true }], ['fig', 0.5, 0.3, 0, 1.7, 'stone', 'stand', { rotY: -90, robe: true }] ] },
  // St. Petrus Banden: low wall with plaque and a chain drawn in curve (guess)
  'node/8250253285': { name: 'St. Petrus Banden', parts: [
    ['wall', 0, 0, 0, 2.0, 1.4, 0.3, 'stone'], ['plaque', 0, 0.8, 0.17, 0.8, 0.4, 'bronzeDark'], ['curve', [[-0.6, 0.55, 0.2], [-0.3, 0.4, 0.2], [0, 0.55, 0.2], [0.3, 0.4, 0.2], [0.6, 0.55, 0.2]], 0.07, 'steel'] ] },
  // Inkeer: bowed figure with head down, hands together, on a low bronze base (guess)
  'node/14335899004': { name: 'Inkeer', parts: [
    ['plinth', 0.9, 0.3, 0.9, 'granite', 'plain'], ['fig', 0, 0.3, 0, 1.3, 'bronze', 'kneel', { robe: true, hair: 'bun' }] ] },
  // Oranjehotel: long brick prison wall with iron gate arch and bronze plaques (guess)
  'node/9653465901': { name: 'Oranjehotel', parts: [
    ['wall', -2.0, 0, 0, 2.6, 3.2, 0.5, 'brick'], ['wall', 2.0, 0, 0, 2.6, 3.2, 0.5, 'brick'], ['arch', 0, 0, 0, 2.0, 3.0, 0.3, 0.5, 'black'], ['plaque', -2.0, 1.2, 0.27, 1.0, 0.7, 'bronzeDark'], ['plaque', 2.0, 1.2, 0.27, 1.0, 0.7, 'bronzeDark'] ] },
  // Zij waren eensgezind: group of four standing figures close together on a low base (guess)
  'node/5754599705': { name: 'Zij waren eensgezind', parts: [
    ['plinth', 2.2, 0.4, 1.4, 'granite', 'plain'], ['fig', -0.7, 0.4, 0, 1.9, 'bronzeDark', 'stand'], ['fig', -0.2, 0.4, 0.1, 2.0, 'bronzeDark', 'arm-up'], ['fig', 0.3, 0.4, 0, 1.9, 'bronzeDark', 'stand', { robe: true }], ['fig', 0.8, 0.4, 0.1, 1.5, 'bronzeDark', 'stand', { child: true }] ] },
  // Het Poortje: small stone gateway with a lintel and gap (guess)
  'node/6223640646': { name: 'Het Poortje', parts: [
    ['arch', 0, 0, 0, 1.6, 2.6, 0.45, 0.6, 'stone'], ['box', 0, 2.6, 0, 1.9, 0.25, 0.8, 'granite'], ['plaque', 0, 2.65, 0.41, 0.8, 0.1, 'bronzeDark'] ] },
  // Doodencel 601: flat wall panel with a cell door slab and number plaque (guess)
  'node/6223709737': { name: 'Doodencel 601', parts: [
    ['wall', 0, 0, 0, 2.2, 2.4, 0.35, 'brick'], ['box', 0, 0.1, 0.18, 0.9, 2.0, 0.08, 'steel'], ['plaque', 0, 1.7, 0.23, 0.4, 0.25, 'white'], ['box', 0.3, 1.0, 0.23, 0.1, 0.1, 0.05, 'black'] ] },
  // Toegangspoort: two stone posts with a top bar, wide gateway (guess)
  'node/9659473525': { name: 'Toegangspoort', parts: [
    ['box', -1.4, 0, 0, 0.5, 2.6, 0.5, 'granite'], ['box', 1.4, 0, 0, 0.5, 2.6, 0.5, 'granite'], ['box', 0, 2.6, 0, 3.3, 0.3, 0.45, 'steel'], ['box', -1.4, 2.6, 0, 0.65, 0.12, 0.65, 'stone'], ['box', 1.4, 2.6, 0, 0.65, 0.12, 0.65, 'stone'] ] },
  // Koningin Regentes Emma: crowned woman in long gown with cloak on tall plinth (guess)
  'node/1526095813': { name: 'Koningin Regentes Emma van Waldeck Pyrmont', parts: [
    ['steps', 2.6, 2.6, 2, 'stone'], ['plinth', 1.6, 1.6, 1.6, 'marble', 'classic'], ['fig', 0, 1.8, 0, 2.2, 'bronze', 'stand', { robe: true, cloak: true, hat: 'crown' }] ] },
  // Oorlogsmonument Dwangarbeiders: long low wall with plaque and chain links (guess)
  'node/1533854774': { name: 'Oorlogsmonument Dwangarbeiders', parts: [
    ['wall', 0, 0, 0, 3.0, 2.2, 0.45, 'concrete'], ['plaque', 0, 0.8, 0.24, 1.6, 0.9, 'bronzeDark'], ['ring', -1.0, 0, 0.35, 0.3, 0.07, 'steel', 90], ['ring', -0.6, 0, 0.35, 0.3, 0.07, 'steel', 0] ] },
  // Theo van Hoytema: small grey stele with name plaque (guess)
  'node/9629544234': { name: 'Theo van Hoytema', parts: [
    ['slab', 0, 0, 0, 0.8, 1.8, 0.3, 'stone', 0, 4], ['plaque', 0, 1.0, 0.16, 0.4, 0.3, 'bronzeDark'] ] },
  // Monument Rijkswaterstaat: group of abstract concrete blocks of different heights (guess)
  'way/237850621': { name: 'Monument Rijkswaterstaat', parts: [
    ['box', -1.2, 0, 0, 1.2, 2.4, 1.0, 'concrete', 8], ['box', 0.3, 0, -0.4, 0.9, 3.0, 0.9, 'concrete', -12], ['box', 1.4, 0, 0.5, 1.4, 1.3, 1.1, 'concrete', 20], ['slab', 0, 0, 1.2, 2.0, 0.6, 0.4, 'concrete'] ] },
  // Reuzenkruik: giant stoneware jug with handle and narrow neck (guess)
  'node/5764159638': { name: 'Reuzenkruik', parts: [
    ['cyl', 0, 0, 0, 1.0, 0.2, 'stone'], ['ball', 0, 0.2, 0, 1.3, 'brick'], ['cyl', 0, 2.3, 0, 0.45, 0.7, 'brick'], ['ring', 0.9, 1.3, 0, 0.7, 0.2, 'brick', 90], ['cyl', 0, 3.0, 0, 0.55, 0.1, 'brick'] ] },
  // Juliana van Stolberg: standing woman with five sons around her, memorial
  'node/1526111335': { name: 'Juliana van Stolberg', parts: [
    ['steps', 4.0, 2.6, 2, 'stone'], ['plinth', 3.0, 1.0, 1.6, 'stone', 'plain'],
    ['fig', 0, 1.2, 0, 2.6, 'stone', 'stand', { robe: true, cloak: true }],
    ['fig', -1.1, 1.2, 0.2, 1.5, 'stone', 'stand', { child: true }], ['fig', -0.7, 1.2, 0.5, 1.4, 'stone', 'stand', { child: true }],
    ['fig', 0.7, 1.2, 0.5, 1.4, 'stone', 'stand', { child: true }], ['fig', 1.1, 1.2, 0.2, 1.5, 'stone', 'stand', { child: true }],
    ['fig', 0.3, 1.2, 0.8, 1.5, 'stone', 'stand', { child: true }] ] },
  // Zonder titel (Auke de Vries): abstract painted steel, vertical and diagonal beams with a plate
  'node/8948070484': { name: 'Zonder titel', parts: [
    ['box', -0.8, 0, 0, 0.2, 2.2, 0.2, '#c8341e'], ['beam', -0.8, 2.2, 0, 0.8, 3.0, 0.4, 0.2, '#c8341e'], ['slab', 0.6, 0, -0.1, 1.2, 1.4, 0.12, 'yellow', 15], ['beam', 0.6, 1.4, 0, -0.3, 0.2, 0.5, 0.14, 'blue'], ['box', 0.5, 1.4, 0, 0.9, 0.12, 0.6, 'steel'] ] },
  // V2-informatiebord: info board on a post, tilted panel on two steel legs
  'node/1533738575': { name: 'V2-informatiebord', parts: [
    ['box', -0.5, 0, 0, 0.1, 1.1, 0.1, 'steel'], ['box', 0.5, 0, 0, 0.1, 1.1, 0.1, 'steel'], ['slab', 0, 0.9, 0, 1.4, 0.9, 0.08, 'steel', 0, 3], ['plaque', 0, 1.0, 0.06, 1.2, 0.7, 'white'], ['box', 0, 0, 0, 1.4, 0.15, 0.3, 'concrete'] ] },
  // Plaquette 15 december 1944: flat plaque on a short stone wall
  'node/1533867751': { name: 'Plaquette Slachtoffers 15 december 1944', parts: [
    ['wall', 0, 0, 0, 1.4, 1.0, 0.25, 'stone'], ['plaque', 0, 0.2, 0.14, 1.0, 0.6, 'bronzeDark'] ] },
  // Oorlogsmonument Menselijke Vergissing: a slab split in two pieces on a low base (guess)
  'node/1533892299': { name: 'Oorlogsmonument Menselijke Vergissing', parts: [
    ['plinth', 2.4, 0.35, 1.2, 'concrete', 'plain'], ['slab', -0.55, 0.35, 0, 0.9, 2.6, 0.4, 'stone', 0, 3], ['slab', 0.55, 0.35, 0, 0.9, 2.1, 0.4, 'stone', 0, 0], ['plaque', 0.55, 1.2, 0.22, 0.5, 0.4, 'bronzeDark'] ] },
  // Roadline: single red steel tube rising in one large loop, 12 m
  'node/8258530051': { name: 'Roadline', parts: [
    ['curve', [[-2.5, 0, 0], [-1.5, 1.5, 0], [-0.5, 4.5, 0], [0.5, 8.5, 0], [1.2, 11.2, 0], [0, 12, 0], [-1.6, 10.5, 0], [-1.2, 8, 0.2], [0.8, 6, 0.8], [2.5, 4, 0.8], [3.5, 2, 0.4], [4.5, 0, 0]], 0.5, '#d01818'] ] },
  // Koningin Beatrix: bronze bust with short hair on a stone plinth
  'node/8258530054': { name: 'Koningin Beatrix', parts: [
    ['plinth', 0.7, 1.2, 0.7, 'granite', 'classic'], ['bust', 0, 1.2, 0, 0.75, 'bronze', {}], ['plaque', 0, 0.3, 0.36, 0.4, 0.2, 'bronzeDark'] ] },
  // 301 Steps: staircase of stacked blocks rising in steps, mixed concrete and steel (guess)
  'node/8258530055': { name: '301 Steps (daylight/tungsten)', parts: [
    ['box', 0, 0, 0, 3.0, 0.5, 1.2, 'concrete'], ['box', 0.3, 0.5, 0, 2.4, 0.5, 1.2, 'concrete'], ['box', 0.6, 1.0, 0, 1.8, 0.5, 1.2, 'concrete'], ['box', 0.9, 1.5, 0, 1.2, 0.5, 1.2, 'steel'], ['box', 1.2, 2.0, 0, 0.6, 0.5, 1.2, 'glass'], ['beam', -1.5, 0.5, 0.7, 1.5, 2.5, 0.7, 0.06, 'stainless'] ] },
  // Room: hollow boxy room made of four slabs with door and window openings (guess)
  'node/12811266228': { name: 'Room', parts: [
    ['wall', 0, 0, -1.1, 2.4, 2.6, 0.2, 'white'], ['wall', -1.1, 0, 0, 0.2, 2.6, 2.0, 'white'], ['wall', 1.1, 0, 0, 0.2, 2.6, 2.0, 'white'], ['box', -0.75, 0, 1.1, 0.9, 2.6, 0.2, 'white'], ['box', 0.75, 0, 1.1, 0.9, 2.6, 0.2, 'white'], ['box', 0, 2.0, 1.1, 0.6, 0.6, 0.2, 'white'], ['box', 0, 2.6, 0, 2.4, 0.2, 2.4, 'concrete'] ] },
  // TOM: slim bronze standing figure, hands in pockets, on a low base (guess)
  'node/12985231501': { name: 'TOM', parts: [
    ['plinth', 0.8, 0.3, 0.8, 'basalt', 'plain'], ['fig', 0, 0.3, 0, 1.7, 'bronze', 'hips', { slim: true, hair: 'quiff' }] ] },
  // Anna van Bueren Fontein: round shallow basin with a central pillar and several jets (guess)
  'way/607428589': { name: 'Anna van Bueren Fontein', parts: [
    ['basin', 0, 0, 0, 1.6, 0.4, 'granite'], ['cyl', 0, 0.3, 0, 0.18, 1.3, 'stainless'], ['jet', 0, 1.6, 0, 0.7], ['jet', -0.7, 0.3, 0, 0.5], ['jet', 0.7, 0.3, 0, 0.5], ['jet', 0, 0.3, 0.7, 0.5] ] },
  // Monument Prinses Juliana: standing woman in coat and hat holding flowers/bag on low base (guess)
  'way/1039154100': { name: 'Monument Prinses Juliana', parts: [
    ['plinth', 1.3, 0.5, 1.3, 'granite', 'stepped'], ['fig', 0, 0.5, 0, 2.0, 'bronze', 'hold', { hold: 'bag', hat: 'brim', robe: true }] ] },
  // Binck Twins: two ceramic figures side by side, colourful, holding hands (guess)
  'node/12553522052': { name: 'Binck Twins', parts: [
    ['plinth', 1.8, 0.4, 1.0, 'concrete', 'plain'], ['fig', -0.4, 0.4, 0, 1.9, '#d9d2c2', 'stand', { bulky: true, col2: 'blue' }], ['fig', 0.4, 0.4, 0, 1.9, '#d9d2c2', 'stand', { bulky: true, col2: 'red' }] ] },
  // Zebraklok: two pyramids base to base, three clock dials, black and white stripes, 8 m
  'node/12638993245': { name: 'Zebraklok', parts: [
    ['taper', 0, 0, 0, 3.0, 3.0, 3.6, 0.0, 'white', 45], ['taper', 0, 3.6, 0, 3.0, 3.0, 3.6, 0.0, 'white', 45],
    ['taper', 0, 0, 0, 3.0, 3.0, 3.6, 0.3, 'black', 45], ['box', 0, 3.6, 0, 1.2, 0.4, 1.2, 'white'],
    ['disc', 0, 3.2, 1.5, 1.0, 0.3, 'white'], ['disc', -1.3, 4.0, 0, 1.0, 0.3, 'white', 90], ['disc', 1.3, 4.0, 0, 1.0, 0.3, 'white', 90],
    ['box', 0, 3.4, 1.4, 0.06, 0.8, 0.06, 'black'], ['box', 0, 4.8, 0, 0.8, 0.5, 0.8, 'black'], ['box', 0, 5.5, 0, 0.6, 0.5, 0.6, 'white'], ['box', 0, 6.2, 0, 0.4, 0.5, 0.4, 'black'] ] },
  // Monument Zoeklichtafdeling: tall brick pillar with a stone cap and plaque on a low brick base (guess)
  'node/1533864328': { name: 'Monument Zoeklichtafdeling', parts: [
    ['plinth', 2.0, 0.5, 2.0, 'brick', 'stepped'], ['box', 0, 0.5, 0, 0.9, 3.0, 0.9, 'brick'], ['box', 0, 3.5, 0, 1.1, 0.25, 1.1, 'stone'], ['plaque', 0, 1.5, 0.46, 0.5, 0.7, 'bronzeDark'], ['flame', 0, 3.75, 0, 0.5] ] },
  // Blik Omhoog: bronze figure standing looking up, one arm raised, on low base (guess)
  'node/12543221942': { name: 'Blik Omhoog', parts: [
    ['plinth', 1.0, 0.4, 1.0, 'basalt', 'plain'], ['fig', 0, 0.4, 0, 2.0, 'bronze', 'arm-up', { slim: true }] ] },
  // Monument Trekvlietplein: stone column with cube on low base and wreath (guess)
  'node/13100689977': { name: 'Monument Trekvlietplein', parts: [
    ['steps', 2.0, 2.0, 2, 'granite'], ['plinth', 0.9, 3.2, 0.9, 'stone', 'column'], ['ball', 0, 3.4, 0, 0.35, 'bronze'], ['wreath', 0, 0.5, 0.45, 0.4, 'bronzeDark'] ] },
  // Terra Mater: heavy rounded concrete mass: large half-buried sphere with a smaller lump (guess)
  'way/1355321955': { name: 'Terra Mater', parts: [
    ['ball', 0, 0, 0, 1.5, 'concrete'], ['ball', 1.4, 0, 0.2, 0.9, 'concrete'], ['box', -0.4, 2.2, 0, 1.4, 0.6, 1.2, 'concrete'] ] },
  // De Witte Anjer: white carnation: green stem with leaves and a white frilled flower head (guess)
  'node/14004331101': { name: 'De Witte Anjer', parts: [
    ['cyl', 0, 0, 0, 0.5, 0.15, 'concrete'], ['cyl', 0, 0.15, 0, 0.07, 1.2, 'green'], ['beam', 0, 0.5, 0, 0.5, 1.0, 0.1, 0.06, 'green'], ['ball', 0, 1.3, 0, 0.45, 'white'], ['cyl', 0, 1.75, 0, 0.4, 0.15, 'white'] ] },
  // L.W.J.K. Thomson: standing man in long coat with top hat in hand on a low plinth (guess)
  'node/5774047429': { name: 'L.W.J.K. Thomson', parts: [
    ['steps', 1.8, 1.8, 2, 'granite'], ['plinth', 1.1, 0.8, 1.1, 'granite', 'classic'], ['fig', 0, 0.9, 0, 1.9, 'bronze', 'hold', { hold: 'hat', cloak: true }], ['plaque', 0, 0.3, 0.56, 0.5, 0.3, 'bronzeDark'] ] },
  // Kind met vogeldrinkbak: bronze child standing beside a birdbath basin with a bird
  'node/11065539635': { name: 'Kind met vogeldrinkbak', parts: [
    ['cyl', 0.5, 0, 0, 0.12, 0.7, 'stone'], ['basin', 0.5, 0.7, 0, 0.4, 0.15, 'stone'], ['animal', 'bird', 0.5, 0.85, 0, 0.2, 'bronze', 0], ['fig', -0.3, 0, 0, 1.1, 'bronze', 'stand', { child: true }] ] },
  // Twee estafettelopers: two stone runners in stride, baton handed over
  'node/11073527747': { name: 'Twee estafettelopers', parts: [
    ['plinth', 2.4, 0.4, 1.0, 'granite', 'plain'], ['fig', -0.5, 0.4, 0, 1.7, 'stone', 'run', { nude: true, rotY: 90 }], ['fig', 0.5, 0.4, 0, 1.7, 'stone', 'run', { nude: true, rotY: 90 }], ['beam', -0.2, 1.4, 0, 0.2, 1.4, 0, 0.05, 'bronzeGold'] ] },
  // Meisje met fluit: girl in dress raising flute to mouth on low base
  'node/11074272069': { name: 'Meisje met fluit', parts: [
    ['plinth', 0.8, 0.4, 0.8, 'granite', 'plain'], ['fig', 0, 0.4, 0, 1.2, 'bronze', 'hold', { hold: 'instrument', child: true, robe: true, hair: 'long' }] ] },
  // Drie objecten: three different abstract forms (sphere, cube, cone) in a group (guess)
  'node/11342887543': { name: 'Drie objecten', parts: [
    ['ball', -1.0, 0, 0, 0.7, 'stainless'], ['box', 0.3, 0, -0.2, 0.9, 1.3, 0.9, 'corten', 25], ['cone', 1.6, 0, 0.3, 0.5, 1.8, 'steel'] ] },
  // De Rode Muis: small red mouse sitting on the ground with a tiny base (guess)
  'node/9207597855': { name: 'De Rode Muis', parts: [
    ['animal', 'rabbit', 0, 0, 0, 0.9, 'red', 0], ['beam', -0.4, 0.1, -0.2, -0.9, 0.05, -0.6, 0.05, 'red'], ['ball', 0.38, 0.5, 0.0, 0.1, 'red'] ] },
  // Paard en ruiter (Marino Marini): stylised stiff horse with arms-out rider, bronze
  'node/11342861250': { name: 'Paard en ruiter', parts: [
    ['plinth', 2.4, 0.3, 1.2, 'basalt', 'plain'], ['horse', 0, 0.3, 0, 2.7, 'bronze', { rider: 'arms-up', riderOpts: { slim: true, nude: true }, rotY: 90 }] ] },
  // Johan de Witt: standing bronze statesman, 17th-century dress, on a tall plinth
  'node/1523193417': { name: 'Johan de Witt', parts: [
    ['steps', 3.2, 3.2, 3, 'granite'], ['plinth', 1.9, 2.6, 1.9, 'stone', 'classic'], ['fig', 0, 2.8, 0, 2.2, 'bronze', 'hold', { hold: 'paper', cloak: true, hat: 'brim' }], ['plaque', 0, 1.0, 0.96, 0.9, 0.6, 'bronzeDark'] ] },
  // Johan van Oldenbarnevelt: standing bronze figure with ruff-collar cloak, pointing, tall plinth
  'node/1523203301': { name: 'Johan van Oldenbarnevelt', parts: [
    ['steps', 3.0, 3.0, 2, 'granite'], ['plinth', 1.8, 2.4, 1.8, 'granite', 'classic'], ['fig', 0, 2.5, 0, 2.0, 'bronze', 'point', { cloak: true, hat: 'cap' }], ['plaque', 0, 0.9, 0.91, 0.8, 0.5, 'bronzeDark'], ['fence', 3.8, 3.8, 0.7, 'steel'] ] },
  // Willem de Zwijger Noordeinde: armoured rider on horse on tall plinth, bareheaded, hand forward
  'node/1526061086': { name: 'Stadhouder Prins Willem van Oranje', parts: [
    ['steps', 4.0, 2.4, 3, 'granite'], ['plinth', 2.8, 2.4, 1.4, 'granite', 'classic'], ['horse', 0, 2.7, 0, 2.6, 'bronze', { rider: 'point', riderOpts: { cloak: true, hat: 'brim' }, rotY: 90 }] ] },
  // Koning Willem II Buitenhof: uniformed king on horseback, tall plinth, helmet
  'node/1526065605': { name: 'Koning Willem II', parts: [
    ['steps', 4.2, 2.6, 3, 'granite'], ['plinth', 3.0, 2.6, 1.6, 'granitePink', 'classic'], ['horse', 0, 2.8, 0, 2.6, 'bronzeDark', { rider: 'salute', riderOpts: { hat: 'helmet', cloak: true }, rotY: 90 }], ['plaque', 0, 1.0, 0.82, 1.2, 0.6, 'bronzeGold', 0] ] },
  // Spinoza: seated-looking thinker in long coat, standing statue with hand on chest; tall plinth
  'node/1526074372': { name: 'Spinoza', parts: [
    ['paving', 4.0, 4.0, 'stone'], ['plinth', 1.7, 2.0, 1.4, 'granite', 'stepped'], ['fig', 0, 2.0, 0, 2.0, 'bronze', 'sit', { seat: 'bronzeDark', robe: true, hair: 'long' }], ['plaque', 0, 0.7, 0.72, 0.8, 0.5, 'bronzeGold'] ] },
  // Hertog Karel Bernhard obelisk: tall obelisk on stepped base with plaque (guess)
  'node/1526090773': { name: 'Hertog Karel Bernhard van Saksen Weimar Eisenach', parts: [
    ['steps', 2.4, 2.4, 3, 'granite'], ['plinth', 1.3, 1.4, 1.3, 'granite', 'classic'], ['taper', 0, 1.7, 0, 0.9, 0.9, 3.0, 0.25, 'granite'], ['cone', 0, 4.7, 0, 0.18, 0.4, 'bronzeGold'], ['plaque', 0, 0.6, 0.66, 0.6, 0.5, 'bronzeGold'] ] },
  // Aartsengel Michael: winged archangel with sword raised standing on a dragon-low base (guess)
  'node/1533708590': { name: 'Aartsengel Michael', parts: [
    ['plinth', 1.6, 0.7, 1.6, 'stone', 'stepped'], ['fig', 0, 0.7, 0, 2.4, 'bronzeDark', 'arm-up', { wings: true, hold: 'sword', robe: true }], ['animal', 'frog', 0.0, 0.7, 0.5, 0.6, 'bronzeDark', 0] ] },
  // Joods Kindermonument: a group of small child figures standing in a row on a low base, quiet
  'node/1533726541': { name: 'Joods Kindermonument', parts: [
    ['plinth', 2.6, 0.3, 1.0, 'basalt', 'plain'], ['fig', -0.9, 0.3, 0, 1.0, 'bronzeDark', 'stand', { child: true }], ['fig', -0.45, 0.3, 0, 1.1, 'bronzeDark', 'stand', { child: true }], ['fig', 0, 0.3, 0, 0.9, 'bronzeDark', 'stand', { child: true }], ['fig', 0.45, 0.3, 0, 1.05, 'bronzeDark', 'stand', { child: true }], ['fig', 0.9, 0.3, 0, 0.95, 'bronzeDark', 'stand', { child: true }] ] },
  // Thorbecke-monument: tall marble plinth with figure in coat and a stainless steel panel (guess)
  'node/5530721031': { name: 'Thorbecke-monument', parts: [
    ['steps', 3.0, 3.0, 2, 'marble'], ['plinth', 1.6, 2.2, 1.6, 'marble', 'classic'], ['fig', 0, 2.4, 0, 2.0, 'stainless', 'hold', { hold: 'paper', cloak: true }], ['slab', -1.5, 0, 0, 0.12, 2.6, 1.4, 'stainless'] ] },
  // Haagse Harry: cartoon-like ceramic standing man, bulky, with quiff, grin (guess)
  'node/5617996222': { name: 'Haagse Harry', parts: [
    ['plinth', 1.2, 0.5, 1.2, 'concrete', 'plain'], ['fig', 0, 0.5, 0, 2.4, '#e8c24a', 'hips', { bulky: true, hair: 'quiff', col2: 'blue' }] ] },
  // Frog with Umbrella (Karel Appel): squat bronze frog standing upright holding an open umbrella
  'node/8254358167': { name: 'Frog with Umbrella', parts: [
    ['animal', 'frog', 0, 0, 0, 1.4, 'bronze', 0], ['fig', 0, 0, 0, 1.5, 'bronze', 'stand', { bulky: true }],
    ['box', 0.55, 0.1, 0, 0.06, 1.8, 0.06, 'steel'], ['cone', 0.55, 1.7, 0, 1.2, 0.5, 'bronzeDark'] ] },
  // Licht en Donker: two rounded bronze forms, light polished and dark patinated, side by side (guess)
  'node/8254932820': { name: 'Licht en Donker', parts: [
    ['ball', -0.9, 0, 0, 1.0, 'bronzeGold'], ['ball', 0.9, 0, 0.1, 1.0, 'bronzeDark'], ['cyl', -0.9, 0, 0, 0.3, 0.2, 'bronzeGold'], ['box', 0, 0, 0, 3.2, 0.12, 1.4, 'granite'] ] },
  // Per Adriano (Mitoraj): large fragmentary bronze head with broken neck and a torso piece on low base
  'node/8255570736': { name: 'Per Adriano', parts: [
    ['plinth', 2.6, 0.4, 1.8, 'stone', 'plain'], ['head', -0.3, 0.4, 0, 2.2, 'bronze'], ['box', -0.3, 0.4, -0.1, 0.9, 0.5, 0.8, 'bronze', 15], ['slab', 1.0, 0.4, 0, 0.9, 1.6, 0.4, 'bronze', 0, 10] ] },
  // Ulricus Huber: jurist in long robe, 1938 Korte Voorhout series, holding book
  'node/12748760334': { name: 'Ulricus Huber', parts: [
    ['plinth', 1.0, 0.8, 1.0, 'stone', 'classic'], ['fig', 0, 0.8, 0, 1.8, 'bronze', 'read', { robe: true, hat: 'cap' }] ] },
  // Hugo de Groot: Grotius in robes, ruff, hand on chest, standing
  'node/12748760335': { name: 'Hugo de Groot', parts: [
    ['plinth', 1.0, 0.9, 1.0, 'stone', 'classic'], ['fig', 0, 0.9, 0, 1.8, 'bronze', 'hold', { robe: true, hold: 'paper', hair: 'long' }] ] },
  // Simon van Leeuwen: jurist in robe with long hair, hand raised, standing
  'node/12748760336': { name: 'Simon van Leeuwen', parts: [
    ['plinth', 1.0, 0.7, 1.0, 'stone', 'plain'], ['fig', 0, 0.7, 0, 1.8, 'bronze', 'point', { robe: true, hair: 'long' }] ] },
  // Johannes Voet: jurist with tall hat holding staff, robe
  'node/12748760337': { name: 'Johannes Voet', parts: [
    ['plinth', 1.0, 1.0, 1.0, 'stone', 'stepped'], ['fig', 0, 1.0, 0, 1.8, 'bronze', 'hold', { robe: true, hold: 'staff', hat: 'tall' }] ] },
  // Joan Melchior Kemper: 19th-century man in coat with book, standing
  'node/12748760338': { name: 'Joan Melchior Kemper', parts: [
    ['plinth', 0.9, 1.1, 0.9, 'stone', 'classic'], ['fig', 0, 1.1, 0, 1.75, 'bronze', 'read', { cloak: true }] ] },
  // Cornelis van Bynkershoek: jurist in robe, tricorn-wearing, sword at side
  'node/12748760339': { name: 'Cornelis van Bynkershoek', parts: [
    ['plinth', 1.1, 0.6, 1.1, 'granite', 'plain'], ['fig', 0, 0.6, 0, 1.8, 'bronze', 'stand', { robe: true, hat: 'tricorn', hold: 'sword' }] ] },
  // Willem II fountain Binnenhof: Count in armour atop a pillar rising from a round basin with jets (guess)
  'node/13137924239': { name: 'Koning Willem II (fountain)', parts: [
    ['basin', 0, 0, 0, 1.8, 0.5, 'stone'], ['plinth', 0.8, 1.6, 0.8, 'stone', 'column'], ['fig', 0, 2.0, 0, 1.4, 'bronze', 'hold', { hold: 'sword', hat: 'helmet', cloak: true }], ['jet', 0.9, 0.5, 0.9, 0.8], ['jet', -0.9, 0.5, 0.9, 0.8], ['jet', 0.9, 0.5, -0.9, 0.8], ['jet', -0.9, 0.5, -0.9, 0.8] ] },
  // Sperwer: abstract steel bird with spread wings and bronze head on a pole (guess)
  'node/13911489445': { name: 'Sperwer', parts: [
    ['cyl', 0, 0, 0, 0.3, 0.2, 'stainless'], ['beam', 0, 0.2, 0, 0, 2.6, 0, 0.14, 'stainless'], ['beam', 0, 2.6, 0, -1.8, 3.8, 0, 0.1, 'stainless'], ['beam', 0, 2.6, 0, 1.8, 3.8, 0, 0.1, 'stainless'], ['beam', 0, 2.6, 0, -1.2, 3.0, 0.3, 0.08, 'stainless'], ['beam', 0, 2.6, 0, 1.2, 3.0, 0.3, 0.08, 'stainless'], ['ball', 0, 2.5, 0.3, 0.3, 'bronze'], ['beam', 0, 2.6, 0.3, 0, 2.6, 0.7, 0.08, 'bronzeGold'] ] },
  // Jantje: small bronze boy on a stone block, pointing a finger, cap
  'node/34051097': { name: 'Jantje', parts: [
    ['plinth', 0.7, 0.6, 0.7, 'stone', 'plain'], ['fig', 0, 0.6, 0, 1.15, 'bronze', 'point', { child: true, hat: 'cap' }] ] },
  // Willem van Oranje (Plein): standing, cloak and wide hat, hand on chest, tall plinth with fence
  'node/534955460': { name: 'Stadhouder Prins Willem van Oranje (Plein)', parts: [
    ['steps', 3.4, 3.4, 3, 'granite'], ['plinth', 2.0, 2.4, 2.0, 'granite', 'classic'], ['fig', 0, 2.7, 0, 2.4, 'bronze', 'stand', { cloak: true, hat: 'brim', hold: 'sword' }], ['fence', 4.4, 4.4, 0.8, 'black'] ] },
  // Koningin Wilhelmina: standing queen in long coat with stole, low base (Charlotte van Pallandt)
  'node/1524601187': { name: 'Koningin Wilhelmina', parts: [
    ['plinth', 1.2, 0.35, 1.2, 'granite', 'plain'], ['fig', 0, 0.35, 0, 2.7, 'bronze', 'hold', { robe: true, cloak: true, hold: 'bag', hat: 'brim' }] ] },
  // Willem Drees: man in suit and overcoat, hat in hand, striding slightly, low base (guess)
  'node/1526065606': { name: 'Willem Drees', parts: [
    ['plinth', 1.0, 0.3, 1.0, 'granite', 'plain'], ['fig', 0, 0.3, 0, 1.8, 'bronze', 'walk', { hold: 'bag' }] ] },
  // Willem III standing: crowned? no, uniform with cloak and sceptre-staff on stepped base (guess)
  'node/1526073473': { name: 'Koning - Stadhouder Willem III', parts: [
    ['steps', 2.4, 2.4, 2, 'stone'], ['plinth', 1.3, 1.1, 1.3, 'marble', 'classic'], ['fig', 0, 1.2, 0, 2.2, 'bronzeDark', 'hold', { hold: 'staff', cloak: true, hat: 'crown' }] ] },
  // Koning Willem III: standing in military coat hand on sword, white stone, plain plinth (guess)
  'node/1526099118': { name: 'Koning Willem III', parts: [
    ['plinth', 1.4, 1.2, 1.4, 'granite', 'stepped'], ['fig', 0, 1.2, 0, 2.2, 'stone', 'stand', { hold: 'sword', hat: 'helmet', col2: 'marble' }] ] },
  // Zusters van Liefde: three nuns in habits standing close, one holding a child, low base (guess)
  'node/1529620016': { name: 'Zusters van Liefde', parts: [
    ['plinth', 2.2, 0.35, 1.2, 'granite', 'plain'], ['fig', -0.6, 0.35, 0, 1.7, 'bronze', 'stand', { robe: true, hat: 'scarf' }], ['fig', 0, 0.35, 0.1, 1.75, 'bronze', 'hold', { robe: true, hat: 'scarf', hold: 'child' }], ['fig', 0.6, 0.35, 0, 1.7, 'bronze', 'stand', { robe: true, hat: 'scarf' }] ] },
  // Oorlogsmonument (general): tall narrow stele with relief plaque and wreath (guess)
  'node/1533709764': { name: 'Oorlogsmonument', parts: [
    ['paving', 2.0, 1.6, 'concrete'], ['slab', 0, 0.08, 0, 1.0, 2.4, 0.3, 'granite'], ['plaque', 0, 1.1, 0.17, 0.7, 0.8, 'bronzeDark'], ['wreath', 0, 0.2, 0.35, 0.3, 'green'] ] },
  // Monument Bob Oosthoek: bust of a man with beard on a square pedestal (guess)
  'node/1533710274': { name: 'Monument voor Bob Oosthoek', parts: [
    ['plinth', 0.6, 1.0, 0.6, 'granite', 'plain'], ['bust', 0, 1.0, 0, 0.65, 'bronzeDark', { hair: 'mullet' }], ['plaque', 0, 0.3, 0.31, 0.3, 0.2, 'bronzeGold'] ] },
  // Oorlogsmonument stadhuis: inside wall panel with names and a flame lamp (guess)
  'node/1533728241': { name: 'Oorlogsmonument in het stadhuis', parts: [
    ['wall', 0, 0, 0, 2.2, 2.0, 0.3, 'marble'], ['plaque', 0, 0.8, 0.16, 1.4, 0.9, 'bronzeGold'], ['bench', 0, 0, 0.9, 1.2, 'wood', 0], ['flame', 1.4, 0.3, 0.3, 0.5] ] },
  // Indische plaquette: flat plaque on small stone with a palm leaf outline (guess)
  'node/1533735295': { name: 'Indische plaquette', parts: [
    ['wall', 0, 0, 0, 1.4, 1.0, 0.25, 'stone'], ['plaque', 0, 0.2, 0.14, 1.0, 0.6, 'bronze'], ['beam', 0.4, 0.8, 0.16, 0.7, 0.95, 0.16, 0.04, 'green'] ] },
  // Monument Raad van State garden: standing hooded/robed figure with scroll on low base (guess)
  'node/1533820406': { name: 'Monument in de tuin van de Raad van State', parts: [
    ['plinth', 1.0, 0.5, 1.0, 'stone', 'plain'], ['fig', 0, 0.5, 0, 2.0, 'stone', 'hold', { hold: 'paper', robe: true, cloak: true }], ['pool', 1.3, 0, 0, 0.9, 0.9] ] },
  // Reliëf Gevallenen 1940-1945: wall relief panel with several raised figures
  'node/1533880684': { name: 'Reliëf Gevallenen 1940-1945', parts: [
    ['wall', 0, 0, 0, 3.2, 2.5, 0.4, 'stone'], ['box', -0.9, 0.5, 0.22, 0.4, 1.5, 0.1, 'granite'], ['box', -0.3, 0.5, 0.22, 0.4, 1.8, 0.1, 'granite'], ['box', 0.3, 0.5, 0.22, 0.4, 1.3, 0.1, 'granite'], ['box', 0.9, 0.5, 0.22, 0.4, 1.6, 0.1, 'granite'], ['plaque', 0, 2.0, 0.22, 2.0, 0.3, 'bronzeDark'] ] },
  // Plaquette Prinses Irene Brigade: plaque with emblem on wall
  'node/1533889212': { name: 'Plaquette Prinses Irene Brigade', parts: [
    ['wall', 0, 0, 0, 1.4, 1.0, 0.25, 'brick'], ['plaque', 0, 0.15, 0.14, 0.9, 0.55, 'bronze'], ['disc', 0, 0.2, 0.15, 0.2, 0.05, 'orange'] ] },
  // Plaquette Englandspiel: tall narrow plaque in dark stone (agents' names)
  'node/1533913579': { name: 'Plaquette Englandspiel', parts: [
    ['slab', 0, 0, 0, 0.9, 1.2, 0.2, 'basalt'], ['plaque', 0, 0.2, 0.11, 0.6, 0.8, 'stainless'] ] },
  // Erelijst van Gevallenen: tall honour roll panel in wood-framed wall with name lines
  'node/1533916435': { name: 'Erelijst van Gevallenen 1940-1945', parts: [
    ['wall', 0, 0, 0, 2.0, 2.2, 0.2, 'wood'], ['plaque', -0.45, 0.4, 0.11, 0.8, 1.5, 'white'], ['plaque', 0.45, 0.4, 0.11, 0.8, 1.5, 'white'], ['box', 0, 1.9, 0.1, 1.9, 0.1, 0.05, 'bronzeGold'] ] },
  // Lammetje Groen: woman in shawl and long skirt with basket, low base
  'node/3653245207': { name: 'Lammetje Groen', parts: [
    ['plinth', 0.9, 0.3, 0.9, 'granite', 'plain'], ['fig', 0, 0.3, 0, 1.6, 'bronze', 'hold', { robe: true, hold: 'basket', hat: 'scarf' }] ] },
  // Louis Couperus (Lange Voorhout): seated writer, legs crossed, hand on chin, on a low base
  'node/5547467516': { name: 'Louis Couperus (Lange Voorhout)', parts: [
    ['plinth', 1.2, 0.2, 1.2, 'granite', 'plain'], ['fig', 0, 0.2, 0, 1.6, 'bronze', 'sit', { seat: 'wood', hat: 'brim' }] ] },
  // Tsaar Peterpoortje: little archway of brick with decorative peak (guess)
  'node/5754471895': { name: 'Tsaar Peterpoortje', parts: [
    ['arch', 0, 0, 0, 2.2, 2.6, 0.5, 0.6, 'brick'], ['taper', 0, 2.6, 0, 2.4, 0.7, 0.6, 0.1, 'stone'], ['box', 0, 2.1, 0, 0.5, 0.35, 0.5, 'stone'] ] },
  // Baruch Spinoza stele: low lying stone block plus wall with a standing stone
  'node/5768646551': { name: 'Baruch Spinoza', parts: [
    ['box', -0.9, 0, 0, 1.6, 0.4, 0.7, 'stone'], ['wall', 1.0, 0, -0.1, 1.6, 1.0, 0.25, 'stone'], ['slab', 1.0, 0, 0.3, 0.3, 0.7, 0.3, 'granite'], ['plaque', -0.9, 0.35, 0.1, 0.8, 0.02, 'bronzeDark'] ] },
  // Joodse vervolgden: stone door ajar with bronze suitcases; six oval stones opposite
  'node/5768652605': { name: 'Joodse vervolgden WOII', parts: [
    ['wall', -2.0, 0, 0, 0.4, 3.0, 0.4, 'stone'], ['box', -1.0, 0, 0, 1.4, 2.6, 0.2, 'stone', 70],
    ['box', -0.6, 0, 1.2, 0.5, 0.35, 0.2, 'bronzeDark'], ['box', -0.1, 0, 1.4, 0.45, 0.3, 0.18, 'bronzeDark', 20], ['box', 0.3, 0, 1.2, 0.4, 0.28, 0.18, 'bronzeDark', -15],
    ['ball', 2.0, 0, -1.0, 0.4, 'stone'], ['ball', 2.0, 0, -0.1, 0.4, 'stone'], ['ball', 2.0, 0, 0.8, 0.4, 'stone'], ['ball', 3.0, 0, -1.0, 0.4, 'stone'], ['ball', 3.0, 0, -0.1, 0.4, 'stone'], ['ball', 3.0, 0, 0.8, 0.4, 'stone'], ['paving', 7.0, 3.5, 'concrete'] ] },
  // Gedenkzuil Buitenhof: tall obelisk on a low base, 5 m (guess)
  'node/5771509497': { name: 'Gedenkzuil aan het Buitenhof', parts: [
    ['steps', 1.8, 1.8, 2, 'granite'], ['plinth', 1.0, 0.9, 1.0, 'granite', 'plain'], ['taper', 0, 1.2, 0, 0.7, 0.7, 3.4, 0.3, 'stone'], ['cone', 0, 4.6, 0, 0.2, 0.4, 'bronzeGold'], ['plaque', 0, 0.5, 0.51, 0.5, 0.35, 'bronzeDark'] ] },
  // Aleida van Poelgeest: low upright marker stone with plaque, rounded top (guess)
  'node/5771526135': { name: 'Aleida van Poelgeest', parts: [
    ['slab', 0, 0, 0, 0.7, 1.3, 0.35, 'stone', 0, 6], ['ball', 0, 1.2, 0, 0.18, 'stone'], ['plaque', 0, 0.55, 0.19, 0.4, 0.3, 'bronzeDark'] ] },
  // Capitulatie 1940: wall plaque with dated lines, on brick wall section (guess)
  'node/5771565776': { name: 'Capitulatie 1940', parts: [
    ['wall', 0, 0, 0, 1.8, 1.6, 0.3, 'brick'], ['plaque', 0, 0.6, 0.17, 1.0, 0.6, 'bronzeDark'], ['box', 0, 1.6, 0, 1.9, 0.1, 0.4, 'stone'] ] },
  // Plastiek (Jaap Karman): abstract sculpture of interlocking steel squares and a tilted plate (guess)
  'node/5973060828': { name: 'Plastiek', parts: [
    ['box', 0, 0, 0, 1.6, 0.2, 1.6, 'concrete'], ['slab', -0.4, 0.2, 0, 1.4, 2.4, 0.2, 'stainless', 0, 2], ['slab', 0.5, 0.2, 0.1, 0.2, 2.8, 1.2, 'stainless'], ['ring', 0.1, 0.6, 0.5, 0.6, 0.12, 'steel', 40] ] },
  // Reliëf Varkenmarkt: flat relief wall panel with a pig and market stalls (guess)
  'node/5973060829': { name: 'Reliëf Varkenmarkt', parts: [
    ['wall', 0, 0, 0, 2.6, 2.0, 0.3, 'brick'], ['box', 0, 0.5, 0.17, 2.0, 1.1, 0.06, 'stone'], ['animal', 'pig', -0.4, 0.5, 0.22, 0.6, 'stone', 0], ['box', 0.6, 0.6, 0.22, 0.5, 0.7, 0.05, 'granite'] ] },
  // Admiraal van Wassenaer Obdam: marble cenotaph, admiral standing, Fame behind with trumpet and wreath
  'node/6229575117': { name: 'Admiraal van Wassenaer Obdam', parts: [
    ['plinth', 3.0, 0.9, 1.6, 'marble', 'classic'], ['fig', 0, 0.9, 0.1, 1.6, 'marble', 'stand', { cloak: true, hat: 'brim' }], ['fig', 0.6, 0.9, -0.4, 1.7, 'marble', 'arm-up', { wings: true, robe: true, hold: 'wreath' }], ['box', -1.0, 0.9, -0.5, 0.2, 1.3, 0.2, 'marble'], ['beam', 0.7, 2.0, -0.3, 1.0, 2.4, 0.1, 0.07, 'bronzeGold'], ['wreath', 1.1, 1.6, 0.1, 0.25, 'green'] ] },
  // De Houthandelaar: bronze timber merchant standing with a log on shoulder on stone pedestal
  'node/6564781497': { name: 'De Houthandelaar', parts: [
    ['plinth', 1.1, 0.8, 1.1, 'stone', 'plain'], ['fig', 0, 0.8, 0, 1.8, 'bronze', 'carry', { hat: 'cap', bulky: true }], ['beam', -0.5, 2.2, 0, 0.5, 2.0, 0, 0.2, 'wood'] ] },
  // Zieken te bed: row of ten ceramic hospital beds, nine with patients, one empty, one sitting up
  'node/7746347913': { name: 'Zieken te bed', parts: [
    ['box', -2.7, 0, 0, 0.5, 0.5, 1.0, 'white'], ['box', -2.1, 0, 0, 0.5, 0.5, 1.0, 'blue'], ['box', -1.5, 0, 0, 0.5, 0.5, 1.0, 'yellow'], ['box', -0.9, 0, 0, 0.5, 0.5, 1.0, 'green'], ['box', -0.3, 0, 0, 0.5, 0.5, 1.0, 'red'],
    ['box', 0.3, 0, 0, 0.5, 0.5, 1.0, 'orange'], ['box', 0.9, 0, 0, 0.5, 0.5, 1.0, 'blue'], ['box', 1.5, 0, 0, 0.5, 0.5, 1.0, 'white'], ['box', 2.1, 0, 0, 0.5, 0.5, 1.0, 'yellow'], ['box', 2.7, 0, 0, 0.5, 0.5, 1.0, 'green'],
    ['box', -2.7, 0.5, 0.1, 0.4, 0.2, 0.6, '#e8c9a0'], ['box', -2.1, 0.5, 0.1, 0.4, 0.2, 0.6, '#e8c9a0'], ['box', -1.5, 0.5, 0.1, 0.4, 0.2, 0.6, '#e8c9a0'], ['box', -0.9, 0.5, 0.1, 0.4, 0.2, 0.6, '#e8c9a0'], ['box', -0.3, 0.5, 0.1, 0.4, 0.2, 0.6, '#e8c9a0'],
    ['box', 0.3, 0.5, 0.1, 0.4, 0.2, 0.6, '#e8c9a0'], ['box', 0.9, 0.5, 0.1, 0.4, 0.5, 0.3, '#e8c9a0'], ['box', 2.1, 0.5, 0.1, 0.4, 0.2, 0.6, '#e8c9a0'], ['box', 2.7, 0.5, 0.1, 0.4, 0.2, 0.6, '#e8c9a0'] ] },
  // De vier windrichtingen: a post with four arms pointing in compass directions on a round low base (guess)
  'node/7832278809': { name: 'De vier windrichtingen', parts: [
    ['plinth', 1.4, 0.4, 1.4, 'granite', 'stepped'], ['cyl', 0, 0.4, 0, 0.15, 2.0, 'steel'], ['beam', 0, 2.2, 0, 0, 2.2, -1.2, 0.1, 'blue'], ['beam', 0, 2.2, 0, 0, 2.2, 1.2, 0.1, 'red'], ['beam', 0, 2.2, 0, 1.2, 2.2, 0, 0.1, 'yellow'], ['beam', 0, 2.2, 0, -1.2, 2.2, 0, 0.1, 'green'], ['ball', 0, 2.1, 0, 0.25, 'bronzeGold'] ] },
  // Niké: winged bronze goddess with body lifting upward, blunt wings, on a low base
  'node/8252361329': { name: 'Niké', parts: [
    ['plinth', 0.9, 0.4, 0.9, 'granite', 'plain'], ['fig', 0, 0.4, 0, 1.8, 'bronze', 'arms-up', { wings: true, robe: true, hair: 'long' }] ] },
  // De Zeven Provinciën: copper ship gable figure set into a facade (small relief of ship in wall)
  'node/8252361330': { name: 'De Zeven Provinciën', parts: [
    ['wall', 0, 0, 0, 2.0, 2.4, 0.3, 'brick'], ['boat', 0, 0.8, 0.2, 1.4, 'bronzeGold', 0], ['box', 0, 0.9, 0.2, 0.06, 1.0, 0.06, 'bronzeGold'], ['box', 0, 1.2, 0.2, 0.7, 0.6, 0.04, 'bronzeGold'] ] },
  // Hollandia: standing woman in long dress with crown, holding a lion's shield-staff on low base (guess)
  'node/8252812791': { name: 'Hollandia', parts: [
    ['steps', 1.8, 1.8, 2, 'stone'], ['plinth', 1.0, 0.6, 1.0, 'stone', 'plain'], ['fig', 0, 0.7, 0, 2.3, 'stone', 'hold', { robe: true, hold: 'staff', hat: 'crown', hair: 'long' }], ['animal', 'lion', 0.7, 0.7, 0, 0.7, 'stone', 0] ] },
  // Zonder titel (rough stainless birdhouse): rough stainless birdhouse box with roof on pedestal, aluminium jug hanging
  'node/8254358175': { name: 'Zonder titel', parts: [
    ['plinth', 0.8, 1.2, 0.8, 'concrete', 'plain'], ['box', 0, 1.2, 0, 1.3, 1.0, 1.1, 'stainless', 6], ['taper', 0, 2.2, 0, 1.5, 1.3, 0.7, 0.05, 'stainless'], ['disc', 0, 1.5, 0.58, 0.18, 0.05, 'black'], ['beam', 0.4, 1.2, 0.4, 0.4, 0.6, 0.4, 0.04, 'steel'], ['cyl', 0.4, 0.2, 0.4, 0.2, 0.4, 'stainless'] ] },
  // Space duck racer: duck with glasses and helmet on a flame-spouting racing cart on pedestal
  'node/8254358176': { name: 'Space duck racer', parts: [
    ['plinth', 1.4, 1.2, 1.0, 'concrete', 'stepped'], ['box', 0, 1.2, 0, 1.6, 0.3, 0.8, 'red'], ['cyl', -0.6, 1.2, 0.4, 0.2, 0.15, 'black'], ['cyl', 0.6, 1.2, 0.4, 0.2, 0.15, 'black'], ['animal', 'duck', 0, 1.5, 0, 0.9, '#f0d040', 0], ['box', 0.1, 2.3, 0.1, 0.4, 0.3, 0.4, 'white'], ['flame', -0.95, 1.3, 0, 0.5] ] },
  // Binnen Stadgoden: colourful ceramic gods climbing over a pedestal and stacked on each other
  'node/8254358178': { name: 'Binnen Stadgoden', parts: [
    ['plinth', 1.4, 1.0, 1.4, 'concrete', 'plain'], ['fig', -0.5, 1.0, 0.1, 1.2, 'red', 'sit-ground'], ['fig', 0.5, 1.0, 0.2, 1.1, 'blue', 'walk'], ['fig', 0.0, 1.0, -0.2, 1.3, 'yellow', 'stand', { bulky: true }], ['fig', 0.0, 2.2, -0.2, 1.0, 'green', 'arms-up'], ['fig', -0.4, 0.2, 0.8, 0.9, 'orange', 'walk'], ['fig', 0.7, 0.1, 0.8, 0.8, '#c04090', 'kneel'] ] },
  // ZT (Emo Verkerk): abstract fold of stainless sheets and a sphere (guess)
  'node/8254358179': { name: 'ZT', parts: [
    ['slab', -0.4, 0, 0, 1.6, 2.2, 0.15, 'stainless', 20, 12], ['slab', 0.4, 0, 0.2, 1.6, 2.6, 0.15, 'stainless', -25, 8], ['ball', 0.0, 0, 0.5, 0.35, 'bronze'], ['box', 0, 0, 0, 1.8, 0.1, 1.2, 'basalt'] ] },
  // I♡JR: the letters I and JR with a painted heart between, bronze (guess)
  'node/8254358180': { name: 'I♡JR', parts: [
    ['letters', -1.4, 0, 0, 'I', 1.8, '#c8281e', 0], ['box', -0.5, 0.7, 0, 0.3, 0.3, 0.3, 'red'], ['box', -0.2, 0.9, 0, 0.3, 0.3, 0.3, 'red'], ['box', 0.1, 0.7, 0, 0.3, 0.3, 0.3, 'red'], ['box', -0.2, 0.5, 0, 0.3, 0.3, 0.3, 'red'], ['letters', 0.5, 0, 0, 'JR', 1.8, '#c8281e', 0] ] },
  // ZT (black rods, dented aluminium, wooden ball): thin black rods joined to a dented aluminium form and a small wooden ball
  'node/8254358181': { name: 'ZT', parts: [
    ['plinth', 1.0, 0.5, 1.0, 'concrete', 'plain'], ['box', 0.2, 0.5, 0, 0.9, 0.7, 0.8, 'stainless', 15], ['beam', -0.3, 0.5, 0, -1.0, 2.6, 0.2, 0.05, 'black'], ['beam', 0.2, 1.2, 0, 0.9, 2.8, -0.2, 0.05, 'black'], ['beam', -0.3, 1.0, 0.1, 0.6, 2.2, 0.3, 0.05, 'black'], ['ball', -1.0, 2.6, 0.2, 0.18, 'wood'] ] },
  // De hef: three headless armless figures stacked into a precarious tower, bronze
  'node/8254358182': { name: 'De hef', parts: [
    ['fig', 0, 0, 0, 1.3, 'bronze', 'stand', { bulky: true }], ['fig', 0.1, 1.3, 0, 1.2, 'bronze', 'stand', { bulky: true }], ['fig', -0.1, 2.5, 0, 1.1, 'bronze', 'stand', { bulky: true }] ] },
  // Intersection: two L-shaped steel beams forming a pair, interlocking
  'node/8254646910': { name: 'Intersection', parts: [
    ['box', -0.6, 0, 0, 0.4, 3.0, 0.4, 'corten'], ['box', -0.6, 2.6, 0, 2.0, 0.4, 0.4, 'corten'], ['box', 0.6, 0, 0.5, 0.4, 3.0, 0.4, 'steel'], ['box', -0.6, 0, 0.5, 2.0, 0.4, 0.4, 'steel'] ] },
  // ZT (forty bronze spheres): tall column of forty bronze spheres following a hidden spiral pattern
  'node/8254646911': { name: 'ZT', parts: [
    ['plinth', 0.8, 0.2, 0.8, 'basalt', 'plain'],
    ...Array.from({ length: 20 }, (_, i) => ['ball', Math.cos(i * 2.4) * 0.28, 0.2 + i * 0.14, Math.sin(i * 2.4) * 0.28, 0.25, 'bronze']) ] },
  // Rondanini: upright bronze Pieta-like pair, one figure sagging against another, on a low base (guess)
  'node/8254646912': { name: 'Rondanini', parts: [
    ['plinth', 1.0, 0.5, 1.0, 'basalt', 'plain'], ['fig', 0, 0.5, 0, 2.3, 'bronze', 'stand', { slim: true, robe: true, nude: true }], ['fig', 0.15, 0.5, 0.2, 1.6, 'bronzeDark', 'fall', { slim: true }] ] },
  // Phyllotaxis Den Haag: precariously stacked trunk-like cylinders with angled tops, like a plant stem
  'node/8254646913': { name: 'Phyllotaxis Den Haag', parts: [
    ['cyl', 0, 0, 0, 0.55, 0.9, 'bronze'], ['cyl', 0.1, 0.9, 0, 0.5, 0.8, 'bronze'], ['cyl', -0.1, 1.7, 0.05, 0.45, 0.7, 'bronze'], ['cyl', 0.12, 2.4, 0, 0.35, 0.6, 'bronze'], ['cone', 0.0, 3.0, 0.05, 0.28, 0.5, 'bronze'], ['slab', 0.5, 1.7, 0.2, 0.5, 0.2, 0.3, 'bronze', 30] ] },
  // Bambaa Taa (Gabriel Laster): abstract African-inspired totem of stacked wood-like block and discs (guess)
  'node/8254646914': { name: 'Bambaa Taa', parts: [
    ['plinth', 1.0, 0.3, 1.0, 'concrete', 'plain'], ['box', 0, 0.3, 0, 0.7, 1.2, 0.7, 'wood', 10], ['disc', 0, 1.6, 0, 0.7, 0.15, 'orange'], ['box', 0.1, 2.3, 0, 0.5, 0.8, 0.5, 'red', -20], ['cone', 0.1, 3.1, 0, 0.3, 0.8, 'yellow'] ] },
  // ZT snow on spruce: vertical pedestal sculpture of snow piled on a spruce, tree itself omitted: stacked rounded white-bronze clumps
  'node/8254646915': { name: 'ZT', parts: [
    ['plinth', 0.9, 0.7, 0.9, 'stone', 'plain'], ['ball', 0, 0.7, 0, 1.0, 'bronzeGold'], ['ball', 0.05, 1.5, 0, 0.8, 'bronzeGold'], ['ball', 0, 2.1, 0, 0.6, 'bronzeGold'], ['cone', 0, 2.6, 0, 0.3, 0.6, 'bronzeGold'] ] },
};
