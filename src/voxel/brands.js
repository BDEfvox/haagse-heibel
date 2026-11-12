// Brands, parodies and shop looks: what a shop front says and shows.
//
// Pure data and string rules (no three.js, no DOM), so a node test can run all of it (test/brands.test.mjs).
//
// HOW TO TUNE
//  * CHAINS: one line per chain that really occurs in The Hague. `C(aliases, PARODY, bg, fg, glyph, a, b, cat)`:
//      aliases  real names this line answers to, '|' separated, written any way you like (case, accents, & and ' are
//               ignored when matching). A real name also matches when it STARTS with an alias plus a space
//               ("Jumbo Foodmarkt" -> the Jumbo line); aliases under 4 letters only match exactly.
//      PARODY   what the sign says: at most ~16 characters, capitals. The joke is about the product, never a person.
//      bg, fg   sign colours: they hint at the original but are not its scheme.
//      glyph    the mark: one of GLYPHS (5x5 pixels, 'a' and 'b' are the two ink colours, '.' is the plate).
//      a, b     ink colours of the mark (the plate behind it is the sign colour, darkened).
//      cat      the kind of shop (POI_CATS name) used when the map data says nothing better.
//      win      optional: what stands in the window when it differs from the kind of place ('phones' for a telecom shop).
//    Every mark is our own drawing. Never copy a real logo's shape or lettering.
//  * CAT_LOOK: the look of each kind of place: sign colours, awning, what stands in the window or in front (`win`,
//    drawn by props.js `dress`), the words on an unnamed shop, how many units a chain of it spans (`span`).
//  * parodyName(): the rule that twists every other real name (Hague dialect, then small letter play).
//  * signFor(cat, realName, flags, seed) -> { text, bg, fg, mark, kind, cat, chain } is what the drawing code uses.

// ---------------------------------------------------------------- small helpers
function hash(s) { // FNV-1a: the same everywhere, no dependency
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hx = (a) => '#' + a.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
/** hex colour times k (k < 1 darker, > 1 lighter towards white). */
const shadeHex = (hex, k) => hx(rgb(hex).map((c) => (k <= 1 ? c * k : c + (255 - c) * (k - 1))));

/** Lower case, no accents, no apostrophes, '&' and punctuation as spaces: how names are compared. */
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------------------------------------------------------- marks (logos): 5x5 pixels, rows from the top
export const GLYPHS = {
  basket: ['.bbb.', 'b...b', 'aaaaa', '.aaa.', '.a.a.'],
  burger: ['.aaa.', 'aaaaa', 'bbbbb', 'aaaaa', '.aaa.'],
  rabbit: ['a...a', 'a...a', '.aaa.', 'a.b.a', '.aaa.'],
  cup: ['.b.b.', 'aaaaa', 'aaaaa', '.aaa.', '.aaa.'],
  cross: ['..a..', '..a..', 'aaaaa', '..a..', '..a..'],
  heart: ['.a.a.', 'aaaaa', 'aaaaa', '.aaa.', '..a..'],
  star: ['..a..', 'aaaaa', '.aaa.', '.a.a.', 'a...a'],
  bolt: ['...aa', '..aa.', '.aaaa', '.aa..', 'aa...'],
  drop: ['..a..', '.aaa.', 'aaaaa', 'aaaaa', '.aaa.'],
  chick: ['.bb..', '.aab.', '..aa.', '.aaaa', '.a.a.'],
  fish: ['.....', '.aa.a', 'aabaa', '.aa.a', '.....'],
  wheel: ['.aaa.', 'a.a.a', 'aabaa', 'a.a.a', '.aaa.'],
  pizza: ['aaaaa', 'abaaa', '.aaba', '..aa.', '..a..'],
  ring: ['.aaa.', 'a...a', 'a.b.a', 'a...a', '.aaa.'],
  diamond: ['..a..', '.aba.', 'abbba', '.aba.', '..a..'],
  stripe: ['aaaaa', '.....', 'bbbbb', '.....', 'aaaaa'],
  scissors: ['a...a', '.a.a.', '..b..', '.a.a.', 'a...a'],
  book: ['aaaaa', 'abbba', 'abbba', 'abbba', 'aaaaa'],
  bag: ['..a..', '.a.a.', 'aaaaa', 'abbba', 'aaaaa'],
  hanger: ['..a..', '..a..', '.a.a.', 'a...a', 'aaaaa'],
  glasses: ['.....', 'aa.aa', 'a.a.a', 'aa.aa', '.....'],
  house: ['..a..', '.aaa.', 'aaaaa', 'abaaa', 'abaaa'],
  flag: ['aaaaa', 'aaaaa', 'bbbbb', 'bbbbb', 'a....'],
  sun: ['a.a.a', '.aaa.', 'aabaa', '.aaa.', 'a.a.a'],
  moon: ['.aaa.', 'aa...', 'aa...', 'aa...', '.aaa.'],
  arrow: ['..a..', '.aaa.', 'a.a.a', '..a..', '..a..'],
  bike: ['.....', '...a.', 'aabaa', 'a.a.a', '.a.a.'],
  bread: ['.....', '.aaa.', 'aaaaa', 'abbba', '.aaa.'],
  tulip: ['a.a.a', 'aaaaa', '.aaa.', '..b..', '..b..'],
  bottle: ['..a..', '..a..', '.aaa.', '.aba.', '.aaa.'],
  cone: ['.aaa.', 'aaaaa', '.bbb.', '..b..', '..b..'],
  mug: ['aaaa.', 'aaaaa', 'aaaab', 'aaaaa', 'aaaa.'],
  steak: ['.aaa.', 'aaaaa', 'aabaa', 'aaaaa', '.aaa.'],
  tooth: ['aa.aa', 'aaaaa', 'aaaaa', '.a.a.', '.a.a.'],
  key: ['.aaa.', 'a...a', '.aaa.', '..a..', '..aa.'],
  plug: ['a...a', 'a...a', 'aaaaa', '.aaa.', '..a..'],
  check: ['....a', '...a.', 'a.a..', '.a...', '.....'],
};

// ---------------------------------------------------------------- chains
export const CHAINS = [];
const BY_NAME = new Map(); // normalised alias -> chain
const mkMark = (g, a, b, bg) => (g ? { g, a, b: b || a, p: shadeHex(bg, 0.55) } : null);
function C(aliases, name, bg, fg, g, a, b, cat, win) {
  const ch = { id: norm(aliases.split('|')[0]), aliases: aliases.split('|').map(norm), name, bg, fg, mark: mkMark(g, a, b, bg), cat: cat || null, win: win || null };
  CHAINS.push(ch);
  for (const al of ch.aliases) BY_NAME.set(al, ch);
}

// -- supermarkets and food shops
C('Albert Heijn', 'ALBERT HIJGT', '#38a9dc', '#ffffff', 'basket', '#ffffff', '#f2892b', 'supermarket');
C('Albert Heijn XL', 'ALBERT HIJGT XL', '#38a9dc', '#ffffff', 'basket', '#ffffff', '#f2892b', 'supermarket');
C('Albert Heijn to go|AH to go', 'ALBERT HIJGT 2GO', '#4bb7e6', '#ffffff', 'arrow', '#ffffff', '#f2892b', 'convenience');
C('Jumbo', 'MUMBO JUMBO', '#ffd23a', '#2b2b2b', 'house', '#2b2b2b', '#d92b2b', 'supermarket');
C('Lidl', 'JODEL', '#2a50b8', '#ffe14d', 'sun', '#ffe14d', '#e63232', 'supermarket');
C('Hoogvliet', 'LAAGVLIET', '#d9333f', '#ffffff', 'arrow', '#ffffff', '#ffd23a', 'supermarket');
C('ALDI|Aldi Nord|Aldi Zuid', 'OLDI', '#26438f', '#e9f3ff', 'stripe', '#e9f3ff', '#4fa8e6', 'supermarket');
C('PLUS', 'MINUS', '#3e9a4a', '#fff07a', 'check', '#fff07a', '#ffffff', 'supermarket');
C('SPAR', 'SPAAR', '#2f9a52', '#ffffff', 'heart', '#ffffff', '#e63232', 'convenience');
C('SPAR express', 'SPAAR SNEL', '#2f9a52', '#ffffff', 'bolt', '#ffffff', '#e63232', 'convenience');
C('SPAR city|SPAR university', 'SPAAR STAD', '#2f9a52', '#ffffff', 'house', '#ffffff', '#e63232', 'convenience');
C('Dirk|Dirk van den Broek', 'DÈRK', '#d12c3c', '#ffffff', 'star', '#ffffff', '#ffd23a', 'supermarket');
C('Ekoplaza', 'EKOPLEZIER', '#7ab648', '#ffffff', 'tulip', '#ffffff', '#3c7a26', 'supermarket');
C('Odin', 'ODON', '#6b8e3a', '#fdf6e3', 'tulip', '#fdf6e3', '#b5532d', 'convenience');
C('Foodmaster', 'FOODMEESTER', '#e07a1f', '#ffffff', 'basket', '#ffffff', '#2b2b2b', 'convenience');
C('Café Bonjour|Cafe Bonjour', 'CAFÉ BONSJUR', '#a8452a', '#fff3d9', 'cup', '#fff3d9', '#f2c14e', 'convenience');
C('Tony\'s Coffee & More', 'TONY\'S KOFFIEHOEK', '#6a4a2f', '#f6e6c8', 'cup', '#f6e6c8', '#c4793a', 'convenience');
C('Primera', 'PRIMEUH', '#e0433a', '#ffffff', 'book', '#ffffff', '#ffd23a', 'convenience');
C('Bruna', 'BRUINA', '#c8302c', '#ffffff', 'book', '#ffffff', '#2b2b2b', 'books');
C('ReadShop|Read Shop', 'LEESWINKEL', '#3a6fb0', '#ffffff', 'book', '#ffffff', '#ffd23a', 'books');
C('Paagman', 'PAAGMANNETJE', '#6a3d2a', '#f8ecd0', 'book', '#f8ecd0', '#c8302c', 'books');
C('Kiosk', 'KIOSKJE', '#e0902a', '#2b2b2b', 'star', '#2b2b2b', '#ffffff', 'convenience');
C('Gall & Gall', 'GULP & GULP', '#8a1f3a', '#ffe6a8', 'bottle', '#ffe6a8', '#d4a017', 'liquor');
C('Jamin', 'JAMMIN\'', '#d63c7a', '#ffffff', 'heart', '#ffffff', '#ffd23a', 'gift');
C('Coco & Sebas|Coco en Sebas', 'KOKO & SEBAS', '#4a2c20', '#f3d9b1', 'heart', '#f3d9b1', '#c4793a', 'gift');
C('Alexanderhoeve', 'ALEXANDERHOEF', '#f2d03b', '#3b3b3b', 'drop', '#3b3b3b', '#ffffff', 'butcher');
C('Zuivelhoeve', 'MELKHOEF', '#f5e9a8', '#3b3b3b', 'drop', '#3b3b3b', '#4a90d9', 'butcher');
C('Simon Lévelt|Simon Levelt', 'SIMON LEVELTJE', '#5a3d2b', '#f3e2c0', 'cup', '#f3e2c0', '#b5532d', 'gift');
C('Wakuli', 'WAKKULI', '#3b2f2a', '#ffd9a0', 'cup', '#ffd9a0', '#c4793a', 'cafe');
// -- bakers, butchers
C('Meesterbakker', 'MEESTER-BAKKES', '#b5732f', '#fff3d9', 'bread', '#fff3d9', '#6a3d1a', 'bakery');
C('Bakker van Maanen', 'BAKKER MAANDAG', '#b5732f', '#fff3d9', 'moon', '#fff3d9', '#6a3d1a', 'bakery');
C('Bakkerij Segaar', 'BAKKERIJ SIGAAR', '#c27d36', '#fff3d9', 'bread', '#fff3d9', '#6a3d1a', 'bakery');
C('Bakker Ammerlaan', 'BAKKER AMMERLAND', '#a8672f', '#fff3d9', 'bread', '#fff3d9', '#6a3d1a', 'bakery');
C('Bakkerij van den Berg', 'BAKKERIJ BERGJE', '#9c5f2e', '#fff3d9', 'bread', '#fff3d9', '#6a3d1a', 'bakery');
C('Verhoog\'s Bakkerij|Verhoogs Bakkerij', 'VERHOOGD BAKKES', '#b8782f', '#fff3d9', 'bread', '#fff3d9', '#6a3d1a', 'bakery');
C('Go Fresh Bakery', 'GO STALE BAKERY', '#8f5a2c', '#fff3d9', 'bread', '#fff3d9', '#6a3d1a', 'bakery');
C('Vlaamsch Broodhuys', 'VLAEMS BROTHUYS', '#8a5a34', '#f6e7c8', 'bread', '#f6e7c8', '#4a2c18', 'bakery');
C('MultiVlaai|Multi Vlaai', 'MEERVLAAI', '#c0604a', '#fff3d9', 'ring', '#fff3d9', '#e8b04a', 'bakery');
C('Délifrance|Delifrance', 'DELI-FRANSJE', '#3e5fa0', '#ffffff', 'bread', '#ffffff', '#e8b04a', 'bakery');
C('Michel', 'MICHÈL BROOD', '#a65f33', '#fff3d9', 'bread', '#fff3d9', '#6a3d1a', 'bakery');
C('Pastelle', 'PASTELLETJE', '#e29ab8', '#ffffff', 'heart', '#ffffff', '#7a3d5a', 'bakery');
C('C.J. van Kempen & Zn.|CJ van Kempen', 'VAN KEMPEN & ZN', '#8b5a3c', '#f6e7c8', 'bread', '#f6e7c8', '#4a2c18', 'bakery');
C('Keurslager', 'KEURSLAGERTJE', '#9a2a30', '#ffffff', 'steak', '#ffffff', '#f2b8b0', 'butcher');
// -- chemists, beauty, health
C('Kruidvat', 'KRUIDVET', '#d93a4c', '#ffffff', 'drop', '#ffffff', '#7ac943', 'chemist');
C('Etos', 'ETHOS', '#2fa59a', '#ffffff', 'heart', '#ffffff', '#ffd23a', 'chemist');
C('Trekpleister', 'TREKPLAASTER', '#e8b030', '#3b2a10', 'cross', '#3b2a10', '#ffffff', 'chemist');
C('DA', 'DAAG', '#d94f8a', '#ffffff', 'heart', '#ffffff', '#ffd23a', 'chemist');
C('Holland & Barrett', 'HOLLAND & BAREND', '#2f7d3a', '#fdf6e3', 'tulip', '#fdf6e3', '#e8b04a', 'chemist');
C('Rituals', 'RITUEELTJE', '#7a6a58', '#f6efe3', 'sun', '#f6efe3', '#c9a46a', 'beauty');
C('ICI PARIS XL|ICI Paris', 'HIER PARIJS XL', '#232a4a', '#f4dca0', 'diamond', '#f4dca0', '#e6a1c0', 'beauty');
C('Douglas', 'DOUGLASJE', '#1c1c24', '#ffffff', 'diamond', '#ffffff', '#e65aa0', 'beauty');
C('Hunkemöller|Hunkemoller', 'HONKEMOLEN', '#8a2a5a', '#ffffff', 'heart', '#ffffff', '#f2b8d0', 'clothes');
// -- opticians, hearing, telecom
C('Pearle', 'PAARLTJE', '#2b6cb0', '#ffffff', 'glasses', '#ffffff', '#ffd23a', 'optician');
C('Hans Anders', 'HANS ZIET ANDERS', '#e0902a', '#2b2b2b', 'glasses', '#2b2b2b', '#ffffff', 'optician');
C('Eye Wish|EyeWish', 'OOG-WENS', '#3aa6c8', '#ffffff', 'glasses', '#ffffff', '#ffd23a', 'optician');
C('Specsavers', 'BRILSPAARDER', '#2fa05a', '#ffffff', 'glasses', '#ffffff', '#2b2b2b', 'optician');
C('GrandOptical|Grand Optical', 'GRANDE ILLUSIE', '#26264a', '#ffffff', 'glasses', '#ffffff', '#e0b04a', 'optician');
C('Beter Horen', 'BETER HOORN', '#4a8fb0', '#ffffff', 'ring', '#ffffff', '#ffd23a', 'optician');
C('Odido', 'ODIDOEI', '#2a2a8a', '#ffd23a', 'bolt', '#ffd23a', '#ffffff', 'electronics', 'phones');
C('KPN', 'KNP', '#38a85a', '#ffffff', 'plug', '#ffffff', '#2b2b2b', 'electronics', 'phones');
C('Vodafone', 'VODAFOON', '#c8302c', '#ffffff', 'ring', '#ffffff', '#2b2b2b', 'electronics', 'phones');
C('T-Mobile|T Mobile', 'T-MOBIEL', '#d83a8a', '#ffffff', 'bolt', '#ffffff', '#2b2b2b', 'electronics', 'phones');
C('MediaMarkt|Media Markt', 'MEDIAMARKTJE', '#d92b2b', '#ffffff', 'plug', '#ffffff', '#2b2b2b', 'electronics');
C('Coolblue', 'KOELBLAUW', '#2a7ad8', '#ffffff', 'bolt', '#ffffff', '#ff8a2a', 'electronics');
C('Nebo', 'NEBBO FOTO', '#3b4a5a', '#ffffff', 'ring', '#ffffff', '#ffd23a', 'electronics');
C('TUI', 'TUIT REIZEN', '#d83a3a', '#ffffff', 'sun', '#ffffff', '#ffd23a', 'office');
// -- general stores
C('HEMA', 'HEMMA', '#2f6fcf', '#ffffff', 'stripe', '#ffffff', '#e6504a', 'department');
C('De Bijenkorf|Bijenkorf', 'DE HONINGKORF', '#232323', '#f4dca0', 'diamond', '#f4dca0', '#ffffff', 'department');
C('Action', 'AKSIE', '#e8502d', '#ffffff', 'star', '#ffffff', '#ffd23a', 'variety_store');
C('Wibra', 'WOBRA', '#1f6fb5', '#ffffff', 'bag', '#ffffff', '#ffd23a', 'department');
C('Xenos', 'XEROS', '#b83a6a', '#ffffff', 'mug', '#ffffff', '#ffd23a', 'gift');
C('Blokker', 'BLOKKADE', '#d6352f', '#ffffff', 'mug', '#ffffff', '#ffd23a', 'gift');
C('Kwantum', 'KWANTUMPJE', '#1f6e8a', '#ffffff', 'house', '#ffffff', '#ffd23a', 'furniture');
C('Intertoys', 'INTERSPEELGOED', '#e8402a', '#ffffff', 'star', '#ffffff', '#ffd23a', 'toys');
C('Top1Toys|Top 1 Toys', 'TOP2TOYS', '#2a7ad8', '#ffffff', 'star', '#ffffff', '#ff8a2a', 'toys');
C('Wereldwinkel', 'WERELDWINKELTJE', '#2f8f6a', '#ffffff', 'sun', '#ffffff', '#ffd23a', 'gift');
C('Flying Tiger|Flying Tiger Copenhagen', 'VLIEGENDE TIJGER', '#e8452a', '#ffffff', 'wheel', '#ffffff', '#2b2b2b', 'gift');
C('Leen Bakker', 'LEEN BAKKES', '#d6352f', '#ffffff', 'house', '#ffffff', '#ffd23a', 'furniture');
C('Beter Bed', 'BEDTER BED', '#2f4a7a', '#ffffff', 'moon', '#ffffff', '#ffd23a', 'furniture');
C('Lion Beddenshop', 'LEEUW BEDDEN', '#8a5a2c', '#fff3d9', 'moon', '#fff3d9', '#ffd23a', 'furniture');
C('Auping', 'AUPINGPONG', '#3a3a4a', '#ffffff', 'moon', '#ffffff', '#c8d8f0', 'furniture');
C('JYSK', 'JYSKIE', '#2a5cb0', '#ffffff', 'house', '#ffffff', '#ffd23a', 'furniture');
C('Pets Place', 'PETS PLAATS', '#3a8f4a', '#ffffff', 'heart', '#ffffff', '#ffd23a', 'pet');
C('Welkoop', 'WELKOEP', '#2f7a4a', '#ffffff', 'tulip', '#ffffff', '#ffd23a', 'diy');
C('Intratuin', 'INTRA-TUINTJE', '#4a9a3a', '#ffffff', 'tulip', '#ffffff', '#e8b04a', 'diy');
C('Gamma', 'GAMMA-HAMER', '#2a6ab0', '#ffe14d', 'key', '#ffe14d', '#ffffff', 'diy');
C('Praxis', 'PRAKKIE', '#e07a1f', '#ffffff', 'key', '#ffffff', '#2b2b2b', 'diy');
C('Toolstation', 'TOOLSTATIE', '#f2c230', '#2b2b2b', 'key', '#2b2b2b', '#ffffff', 'diy');
C('Mastermate', 'MEESTERMAAT', '#c8302c', '#ffffff', 'key', '#ffffff', '#2b2b2b', 'diy');
C('PontMeyer|Pontmeijer', 'PONTMEIER', '#2a4a8a', '#ffffff', 'key', '#ffffff', '#e8b04a', 'diy');
C('BMN Bouwmaterialen', 'BMN BOUWSTOF', '#d6552f', '#ffffff', 'house', '#ffffff', '#2b2b2b', 'diy');
C('Technische Unie', 'TECHNISCHE UNI', '#2a6a9a', '#ffffff', 'plug', '#ffffff', '#ffd23a', 'diy');
C('Shurgard Storage Centers|Shurgard', 'SHURGAARD', '#e8a02a', '#2b2b2b', 'house', '#2b2b2b', '#ffffff', 'office');
C('Roobol', 'ROEBOL', '#7a5a3a', '#f6e7c8', 'house', '#f6e7c8', '#c9a46a', 'furniture');
// -- clothes and shoes
C('H&M|H en M', 'HMMM & CO', '#c8302c', '#ffffff', 'hanger', '#ffffff', '#2b2b2b', 'clothes');
C('Zara', 'ZAARA', '#1e1e1e', '#f4f4f4', 'hanger', '#f4f4f4', '#b0b0b0', 'clothes');
C('C&A|C en A', 'C EN AH', '#2b5fb0', '#ffffff', 'hanger', '#ffffff', '#e8e8e8', 'clothes');
C('Primark', 'PRIMAARK', '#2a8ad8', '#ffffff', 'bag', '#ffffff', '#ffd23a', 'clothes');
C('Zeeman', 'ZEEMANNETJE', '#d93030', '#ffffff', 'wheel', '#ffffff', '#2a5ab0', 'clothes');
C('Shoeby', 'SJOEBIE', '#2a2a6a', '#ffffff', 'hanger', '#ffffff', '#e65aa0', 'clothes');
C('vanHaren|van Haren', 'VAN HARING', '#2f6f4a', '#ffffff', 'fish', '#ffffff', '#ffd23a', 'shoes');
C('Nelson Schoenen|Nelson', 'NELSEN SCHOEN', '#5a3a2a', '#fff3d9', 'arrow', '#fff3d9', '#c4793a', 'shoes');
C('Manfield', 'MAANVELD', '#3a2a22', '#f0e0c0', 'moon', '#f0e0c0', '#c4793a', 'shoes');
C('Ecco', 'ECHO', '#2f3a4a', '#ffffff', 'arrow', '#ffffff', '#8ab0d0', 'shoes');
C('ONLY & SONS|Only and Sons', 'ENKEL & ZONEN', '#2a2a2a', '#ffffff', 'stripe', '#ffffff', '#c8302c', 'clothes');
C('ONLY', 'ENKEL', '#c83a6a', '#ffffff', 'stripe', '#ffffff', '#2b2b2b', 'clothes');
C('Vero Moda', 'VERO MODDER', '#7a2a5a', '#ffffff', 'hanger', '#ffffff', '#f2b8d0', 'clothes');
C('Jack & Jones', 'JACK & JOHN', '#2a3a4a', '#ffffff', 'hanger', '#ffffff', '#8ab0d0', 'clothes');
C('WE Fashion|WE', 'WIJ FASHION', '#1e1e1e', '#ffffff', 'hanger', '#ffffff', '#e65aa0', 'clothes');
C('Mango', 'MANGOO', '#e8932a', '#ffffff', 'drop', '#ffffff', '#2b2b2b', 'clothes');
C('Esprit', 'ESPRUT', '#2a6a8a', '#ffffff', 'hanger', '#ffffff', '#e8e8e8', 'clothes');
C('G-Star|G-Star RAW', 'G-STER', '#2a2a3a', '#d0d8e8', 'star', '#d0d8e8', '#ffffff', 'clothes');
C('Scotch & Soda', 'SCHOTS & SODA', '#3a4a6a', '#ffe6a8', 'bottle', '#ffe6a8', '#ffffff', 'clothes');
C('Tommy Hilfiger', 'TOMMY HELPIGER', '#1f3a6a', '#ffffff', 'flag', '#ffffff', '#c8302c', 'clothes');
C('Jeans Centre|Jeans Center', 'JEANS SENTER', '#2a4a8a', '#ffffff', 'hanger', '#ffffff', '#ffd23a', 'clothes');
C('Nike', 'NIEKE', '#1e1e1e', '#ffffff', 'arrow', '#ffffff', '#ff8a2a', 'sports');
C('Adidas', 'ADIDAAS', '#1e1e1e', '#ffffff', 'stripe', '#ffffff', '#4a90d9', 'sports');
C('Foot Locker', 'VOETKLUIS', '#1e1e1e', '#f4f4f4', 'stripe', '#f4f4f4', '#e8402a', 'shoes');
C('Sport 2000', 'SPORT 2001', '#d6352f', '#ffffff', 'wheel', '#ffffff', '#2b2b2b', 'sports');
C('Intersport', 'INTERSPURT', '#2a5ab0', '#ffffff', 'wheel', '#ffffff', '#ffd23a', 'sports');
C('Decathlon', 'DECATHLOON', '#2a6ab8', '#ffffff', 'wheel', '#ffffff', '#7ac943', 'sports');
C('Lucardi', 'LUCARAAT', '#26244a', '#f0d890', 'diamond', '#f0d890', '#ffffff', 'jewelry');
C('Bijou Brigitte', 'BIJOUTJE BRIGIT', '#5a2a4a', '#f6e0b0', 'diamond', '#f6e0b0', '#ffffff', 'jewelry');
C('The Sting', 'DE STING', '#1e1e2a', '#ffffff', 'hanger', '#ffffff', '#e65aa0', 'clothes');
C('The Stone', 'DE STEEN', '#6a6a6a', '#f2f2f2', 'diamond', '#f2f2f2', '#c8c8c8', 'clothes');
C('Motorhuis', 'MOTOR-HOES', '#3a3f48', '#ffd23a', 'wheel', '#ffd23a', '#ffffff', 'car');
C('Boutique Alhoceima', 'BOUTIEK ALHOSEMA', '#8a2a5a', '#f6e0b0', 'hanger', '#f6e0b0', '#ffffff', 'clothes');
C('Anne & Max|Anne&Max', 'ANNA & MOX', '#e0a090', '#3b2a22', 'cup', '#3b2a22', '#ffffff', 'cafe');
// -- eating and drinking
C('McDonald\'s|McDonalds|Mc Donalds', 'MC DOEI\'S', '#d8402a', '#ffe14d', 'burger', '#f5c542', '#7a2e12', 'burger');
C('Burger King', 'BURGER KONIJN', '#c8481f', '#fff0c8', 'rabbit', '#fff0c8', '#7a2e12', 'burger');
C('KFC|Kentucky Fried Chicken', 'KFK KIPKOT', '#c8282d', '#ffffff', 'chick', '#ffffff', '#ffd23a', 'chicken');
C('Subway', 'BOVENWEG', '#2f8a3a', '#ffe14d', 'stripe', '#ffe14d', '#ffffff', 'sandwich');
C('Domino\'s|Dominos|Dominos Pizza', 'DOMINO-EFFECT', '#1f4a9a', '#ffffff', 'pizza', '#ffd23a', '#e63232', 'pizza');
C('New York Pizza|NY Pizza', 'NIEUW JORK PIZZA', '#c8282d', '#fff7e0', 'pizza', '#ffd23a', '#2f7d3a', 'pizza');
C('Papa John\'s|Papa Johns', 'PAPA JAN\'S', '#2f7d3a', '#ffffff', 'pizza', '#ffd23a', '#e63232', 'pizza');
C('Starbucks', 'STARBEKERS', '#1f6f55', '#f6efe0', 'cup', '#f6efe0', '#c9a46a', 'cafe');
C('Coffee Company', 'KOFFIE KOMPANJE', '#3b2a22', '#f3d9b1', 'cup', '#f3d9b1', '#c4793a', 'cafe');
C('Coffee-star|Coffee Star', 'KOFFIE-STER', '#7a3a22', '#fbe9c8', 'star', '#fbe9c8', '#c4793a', 'cafe');
C('Bagels & Beans', 'BAGELS & BONEN', '#e0902a', '#3b2a22', 'ring', '#3b2a22', '#ffffff', 'cafe');
C('Febo', 'KROKET-O-MAAT', '#d8281e', '#ffe14d', 'burger', '#ffe14d', '#7a2e12', 'snackbar');
C('Kwalitaria', 'KWAALITARIA', '#e8a020', '#c8282d', 'star', '#c8282d', '#ffffff', 'snackbar');
C('Kippie', 'KIPPETJE', '#d8402a', '#fff0c8', 'chick', '#fff0c8', '#7a2e12', 'chicken');
C('Bram Ladage', 'BRAM LAADHAGE', '#e8b02a', '#7a1a10', 'fish', '#7a1a10', '#ffffff', 'snackbar');
C('Verhage', 'VERHAEG', '#d8402a', '#ffe9c2', 'burger', '#ffe9c2', '#7a2e12', 'burger');
C('Johnny\'s Burger|Johnnys Burger', 'JONNIE\'S BURGER', '#b8341e', '#ffe9c2', 'burger', '#ffe9c2', '#7a2e12', 'burger');
C('The Döner Company|The Doner Company|Doner Company', 'DÖNER KOMPANJE', '#b5442a', '#ffe9c2', 'steak', '#ffe9c2', '#7a2e12', 'kebab');
C('Taco Mundo', 'TAKO MONDO', '#d8561e', '#fff7d0', 'star', '#fff7d0', '#2f7d3a', 'restaurant');
C('Sunday\'s|Sundays', 'ZONDAGS', '#f0b84a', '#3b2a22', 'sun', '#3b2a22', '#ffffff', 'cafe');
C('Eazie', 'EAZIER', '#d8281e', '#ffffff', 'arrow', '#ffffff', '#ffd23a', 'asian');
C('Amazing Oriental', 'AMAEZING ORIËNT', '#a8221e', '#f6d36a', 'star', '#f6d36a', '#ffffff', 'asian');
C('Pavarotti', 'PAVAROTJE', '#2f7d3a', '#fff7e0', 'cup', '#fff7e0', '#c8282d', 'restaurant');
C('Fratelli', 'FRIETELLI', '#a8281e', '#fff7e0', 'fish', '#fff7e0', '#ffd23a', 'restaurant');
C('Bab Mansour', 'BAB MANSOER', '#a8431e', '#ffe9b0', 'moon', '#ffe9b0', '#ffffff', 'restaurant');
C('Tanger', 'TANDJER', '#2f7a6a', '#fbefc8', 'moon', '#fbefc8', '#e8b04a', 'cafe');
C('Ekmekci', 'EKMEKJE', '#8a5a2c', '#ffe9c2', 'bread', '#ffe9c2', '#4a2c18', 'restaurant');
C('De Beren', 'DE BEREN-BURGER', '#6a3d22', '#ffe9c2', 'steak', '#ffe9c2', '#c8282d', 'burger');
C('STACH', 'STAACH', '#3a3a3a', '#f6e7c8', 'cup', '#f6e7c8', '#c4793a', 'cafe');
// -- banks, fuel, cars, services
C('ING', 'INGELD', '#f07a1e', '#ffffff', 'diamond', '#ffffff', '#7a2e12', 'bank');
C('Rabobank|Rabo', 'RABBELBANK', '#2a3a9a', '#ffffff', 'stripe', '#ffffff', '#f09a1e', 'bank');
C('ABN AMRO|ABN', 'AMRO-ABN', '#1f6f5a', '#f6e58a', 'stripe', '#f6e58a', '#ffffff', 'bank');
C('SNS|SNS Bank', 'SOS BANK', '#2a8f6a', '#ffffff', 'heart', '#ffffff', '#e8e8e8', 'bank');
C('Triodos', 'TRIODOOS', '#3a7a3a', '#ffffff', 'tulip', '#ffffff', '#fff07a', 'bank');
C('Bunq', 'BUNK', '#2fb28a', '#ffffff', 'moon', '#ffffff', '#2b2b2b', 'bank');
C('Shell|Shell Select|Shell Express', 'SCHELP', '#f5c52b', '#c8282d', 'drop', '#c8282d', '#ffffff', 'fuel');
C('BP', 'PB', '#3f9a4a', '#fff07a', 'sun', '#fff07a', '#ffffff', 'fuel');
C('Esso', 'ESZO', '#2a5ab0', '#ffffff', 'drop', '#ffffff', '#e63232', 'fuel');
C('Texaco', 'TEXACHO', '#c8282d', '#ffffff', 'star', '#ffffff', '#2b2b2b', 'fuel');
C('Total|TotalEnergies', 'TOTAAL', '#e0502a', '#ffffff', 'drop', '#ffffff', '#2a5ab0', 'fuel');
C('TinQ|TANQ+|Tanq', 'TINNIE', '#2a9ad8', '#ffffff', 'drop', '#ffffff', '#e63232', 'fuel');
C('Tango', 'TAMBO', '#e07a1f', '#ffffff', 'drop', '#ffffff', '#2b2b2b', 'fuel');
C('Tamoil', 'TAMOEL', '#d83a2a', '#ffffff', 'drop', '#ffffff', '#2b2b2b', 'fuel');
C('Gulf', 'GULP', '#f08a2a', '#2a5ab0', 'drop', '#2a5ab0', '#ffffff', 'fuel');
C('Argos', 'ARGUS', '#2a8ad8', '#ffffff', 'drop', '#ffffff', '#e63232', 'fuel');
C('Avia', 'AVIAAT', '#d8282d', '#ffffff', 'drop', '#ffffff', '#2a5ab0', 'fuel');
C('Q8', 'Q9', '#2a4aa0', '#ffe14d', 'drop', '#ffe14d', '#e63232', 'fuel');
C('ANWB', 'ANBW', '#f5d020', '#2a3a8a', 'wheel', '#2a3a8a', '#ffffff', 'outdoor');
C('Kwik Fit|KwikFit', 'KWIK-FLAT', '#d8282d', '#fff07a', 'wheel', '#fff07a', '#2b2b2b', 'car');
C('Bosch Car Service', 'BOSCH KAR SERVICE', '#c8282d', '#ffffff', 'wheel', '#ffffff', '#2b2b2b', 'car');
C('Citroën|Citroen', 'LIMOEN', '#d8c82a', '#2b2b2b', 'arrow', '#2b2b2b', '#ffffff', 'car');
C('Peugeot', 'PEUGEOTJE', '#2a3a5a', '#ffffff', 'rabbit', '#ffffff', '#8ab0d0', 'car');
C('BMW', 'BWM', '#2a5ab0', '#ffffff', 'wheel', '#ffffff', '#8ab0d0', 'car');
C('Kia', 'KEA', '#a8282d', '#ffffff', 'arrow', '#ffffff', '#2b2b2b', 'car');
C('Bike Totaal', 'BEIK TOTAAL', '#2a7ab0', '#ffffff', 'bike', '#ffffff', '#ffd23a', 'bicycle');
C('Wittebrug Fietsen', 'WITTEBRUG FIETSE', '#e8e8e0', '#2a3a5a', 'bike', '#2a3a5a', '#c8282d', 'bicycle');
C('BrainWash|Brain Wash', 'BRAINDRY', '#2aa0c8', '#ffffff', 'drop', '#ffffff', '#ffd23a', 'laundry');
C('Team Kappers', 'TIEM KAPPERS', '#3a3a52', '#ffffff', 'scissors', '#ffffff', '#e65a5a', 'hairdresser');
C('Hizi Hair', 'HIZI HAIR-RAISER', '#4a3a6a', '#ffffff', 'scissors', '#ffffff', '#e8b04a', 'hairdresser');
C('Martinhair|Martin Hair', 'MARTIEN HAAR', '#2a3a4a', '#ffffff', 'scissors', '#ffffff', '#e8b04a', 'hairdresser');
C('Sjenkels', 'SJENKELS & KNIE', '#4a3a52', '#ffffff', 'scissors', '#ffffff', '#e8b04a', 'hairdresser');
C('Schroeder', 'SCHROEDERTJE', '#7a6a4a', '#f6efe0', 'bag', '#f6efe0', '#c9a46a', 'second_hand');
C('RataPlan', 'RATAPLAN-B', '#8a6a3a', '#f6efe0', 'bag', '#f6efe0', '#c9a46a', 'second_hand');

// ---------------------------------------------------------------- finding a chain from a real name
const PREFIX = [...BY_NAME.keys()].filter((k) => k.length >= 4).sort((a, b) => b.length - a.length);
/** The chain a real shop name belongs to, or null. */
export function chainOf(realName) {
  const n = norm(realName);
  if (!n) return null;
  const ex = BY_NAME.get(n);
  if (ex) return ex;
  for (const k of PREFIX) if (n.startsWith(k + ' ')) return BY_NAME.get(k);
  return null;
}

// ---------------------------------------------------------------- the look of every kind of place
// bg/fg sign colours · awn [a, b] stripe colours of the awning, null = none · win what stands in the window or in front
// (see props.js `dress`) · glyph the default mark for a named shop of this kind · word what an unnamed one says (a list:
// one is picked by the seed) · span how many front units a chain of this kind takes (1-3) · hang a projecting sign
// (a green cross) takes this much of the sign band · dark darkened windows · wide glazing across the whole front.
export const CAT_LOOK = {
  other: { bg: '#4a6fa5', fg: '#ffffff', awn: ['#4a6fa5', '#ffffff'], win: 'shelves', glyph: 'bag', word: ['WINKEL', 'KIOSK', 'TOKO', 'WINKELTJE', 'BAZAR'] },
  restaurant: { bg: '#7a2e2e', fg: '#f5e6c8', awn: ['#8a2c2c', '#f5e6c8'], win: 'chalk', glyph: 'cup', word: ['RESTAURANT', 'ETEN', 'BRASSERIE'] },
  snackbar: { bg: '#f2b01e', fg: '#7a1010', awn: ['#e63946', '#ffd166'], win: 'fryer', glyph: 'fish', word: ['SNACKBAR', 'FRIET', 'SNACK'], span: 1 },
  burger: { bg: '#d8402a', fg: '#ffe08a', awn: ['#d8402a', '#ffe08a'], win: 'burger', glyph: 'burger', word: ['BURGERS', 'BURGERTJE'], span: 2 },
  pizza: { bg: '#2f7d3a', fg: '#fff4d6', awn: ['#2f7d3a', '#e63946'], win: 'pizza', glyph: 'pizza', word: ['PIZZA', 'PIZZERIA'], span: 1 },
  kebab: { bg: '#b5442a', fg: '#ffe9c2', awn: ['#b5442a', '#f4d58d'], win: 'spit', glyph: 'steak', word: ['KEBAB', 'SHOARMA', 'GRILL'] },
  chicken: { bg: '#c1272d', fg: '#ffffff', awn: ['#c1272d', '#ffffff'], win: 'chicken', glyph: 'chick', word: ['KIP', 'KIPHUIS'], span: 2 },
  sandwich: { bg: '#6b8e23', fg: '#fffbe6', awn: ['#6b8e23', '#fffbe6'], win: 'chalk', glyph: 'bread', word: ['BROODJES', 'LUNCH'] },
  fish: { bg: '#2d6a9f', fg: '#ffffff', awn: ['#2d6a9f', '#ffffff'], win: 'herring', glyph: 'fish', word: ['VIS', 'VISHANDEL', 'HARING'] },
  ice_cream: { bg: '#f78fb3', fg: '#ffffff', awn: ['#f78fb3', '#ffffff'], win: 'cone', glyph: 'cone', word: ['IJS', 'IJSSALON'] },
  cafe: { bg: '#5b4636', fg: '#f1e4c8', awn: ['#5b4636', '#d8c7a0'], win: 'chalk', glyph: 'cup', word: ['CAFE', 'KOFFIE', 'LUNCHROOM'] },
  pub: { bg: '#4a2e1b', fg: '#f0c36a', awn: null, win: 'taps', glyph: 'mug', word: ['KROEG', 'CAFE', 'BIER'] },
  nightclub: { bg: '#1b1330', fg: '#ff5cd6', awn: null, win: 'neon', glyph: 'moon', word: ['CLUB', 'DISCO'], dark: true },
  coffeeshop: { bg: '#2f3a3a', fg: '#e7e0c8', awn: null, win: 'dark', glyph: 'cup', word: ['KOFFIE', 'COFFEESHOP'], dark: true },
  supermarket: { bg: '#2a8f5a', fg: '#ffffff', awn: null, win: 'trolleys', glyph: 'basket', word: ['SUPER', 'SUPERMARKT'], span: 3, wide: true },
  convenience: { bg: '#d9552b', fg: '#ffffff', awn: ['#d9552b', '#ffffff'], win: 'shelves', glyph: 'basket', word: ['BUURTWINKEL', 'MINIMARKT', 'ALLES'], span: 1 },
  bakery: { bg: '#a8672f', fg: '#fff3d9', awn: ['#c98a3c', '#fff3d9'], win: 'bread', glyph: 'bread', word: ['BAKKER', 'BAKKERIJ', 'BROOD'] },
  butcher: { bg: '#9e2a2f', fg: '#ffffff', awn: ['#9e2a2f', '#ffffff'], win: 'meat', glyph: 'steak', word: ['SLAGER', 'SLAGERIJ'] },
  greengrocer: { bg: '#3f8f3a', fg: '#ffffff', awn: ['#3f8f3a', '#ffffff'], win: 'crates', glyph: 'tulip', word: ['GROENTE', 'FRUIT', 'AGF'] },
  chemist: { bg: '#d6336c', fg: '#ffffff', awn: null, win: 'shelves', glyph: 'drop', word: ['DROGIST', 'DROGISTERIJ'], span: 2, wide: true },
  pharmacy: { bg: '#2e8b57', fg: '#ffffff', awn: null, win: 'cross', glyph: 'cross', word: ['APOTHEEK'], hang: 0.8 },
  clothes: { bg: '#222831', fg: '#f2f2f2', awn: null, win: 'rail', glyph: 'hanger', word: ['MODE', 'KLEDING', 'BOUTIQUE'], span: 2, wide: true },
  shoes: { bg: '#6b3f2a', fg: '#fff3d9', awn: null, win: 'shoes', glyph: 'arrow', word: ['SCHOEN', 'SCHOENEN'] },
  hairdresser: { bg: '#3b3b52', fg: '#ffffff', awn: null, win: 'hair', glyph: 'scissors', word: ['KAPPER', 'KAPSALON', 'HAIR'] },
  beauty: { bg: '#e07aa7', fg: '#ffffff', awn: null, win: 'bottles', glyph: 'heart', word: ['BEAUTY', 'SCHOONHEID'] },
  optician: { bg: '#1c6ea4', fg: '#ffffff', awn: null, win: 'glasses', glyph: 'glasses', word: ['OPTIEK', 'BRILLEN'] },
  jewelry: { bg: '#1a1a2e', fg: '#e6c35c', awn: null, win: 'jewel', glyph: 'diamond', word: ['JUWELIER', 'GOUD'], dark: true },
  florist: { bg: '#5aa469', fg: '#ffffff', awn: ['#5aa469', '#ffffff'], win: 'flowers', glyph: 'tulip', word: ['BLOEMEN', 'BLOEMIST'] },
  books: { bg: '#7b4b2a', fg: '#fff3d9', awn: null, win: 'books', glyph: 'book', word: ['BOEKEN', 'BOEKHANDEL'] },
  electronics: { bg: '#1f3a5f', fg: '#ffd400', awn: null, win: 'tvs', glyph: 'plug', word: ['ELEKTRO', 'COMPUTER'], span: 2, wide: true },
  bicycle: { bg: '#2b7bb9', fg: '#ffffff', awn: null, win: 'bike', glyph: 'bike', word: ['FIETS', 'FIETSEN', 'RIJWIEL'] },
  car: { bg: '#444b55', fg: '#ffffff', awn: null, win: 'car', glyph: 'wheel', word: ['AUTO', 'GARAGE'], span: 2, wide: true },
  furniture: { bg: '#8a6f4d', fg: '#fff3d9', awn: null, win: 'furniture', glyph: 'house', word: ['MEUBELS', 'WOONWINKEL'], span: 2, wide: true },
  diy: { bg: '#e6a100', fg: '#222222', awn: null, win: 'diy', glyph: 'key', word: ['BOUW', 'KLUSSEN', 'IJZERWAREN'], span: 2, wide: true },
  department: { bg: '#1d3557', fg: '#f1e3c1', awn: null, win: 'rail', glyph: 'bag', word: ['WARENHUIS'], span: 3, wide: true },
  liquor: { bg: '#5a1f3d', fg: '#ffe6a8', awn: null, win: 'bottles', glyph: 'bottle', word: ['SLIJTER', 'WIJN'] },
  bank: { bg: '#0b5cad', fg: '#ffffff', awn: null, win: 'plain', glyph: 'diamond', word: ['BANK'], wide: true },
  atm: { bg: '#0b5cad', fg: '#ffffff', awn: null, win: 'plain', glyph: 'diamond', word: ['BANK'] },
  fuel: { bg: '#f5c52b', fg: '#c8282d', awn: null, win: 'plain', glyph: 'drop', word: ['TANKEN'] },
  hotel: { bg: '#2c3e50', fg: '#d4af37', awn: ['#2c3e50', '#d4af37'], win: 'plain', glyph: 'moon', word: ['HOTEL'] },
  laundry: { bg: '#2aa0c8', fg: '#ffffff', awn: null, win: 'washers', glyph: 'drop', word: ['WASSERETTE', 'STOMERIJ'] },
  second_hand: { bg: '#7a6a4a', fg: '#f6efe0', awn: null, win: 'rail', glyph: 'bag', word: ['KRINGLOOP', 'TWEEDEHANDS'] },
  gift: { bg: '#c0507a', fg: '#ffffff', awn: ['#c0507a', '#ffffff'], win: 'toys', glyph: 'heart', word: ['CADEAU', 'KADO'] },
  sports: { bg: '#d6452a', fg: '#ffffff', awn: null, win: 'shoes', glyph: 'wheel', word: ['SPORT'] },
  pet: { bg: '#3a8f4a', fg: '#ffffff', awn: null, win: 'tank', glyph: 'heart', word: ['DIEREN', 'DIERENWINKEL'] },
  tattoo: { bg: '#15151a', fg: '#ff4a4a', awn: null, win: 'neon', glyph: 'star', word: ['TATTOO'], dark: true },
  office: { bg: '#5a6572', fg: '#ffffff', awn: null, win: 'plain', glyph: 'house', word: ['KANTOOR', 'ADVIES'] },
  vacant: { bg: '#8d949b', fg: '#2a2f35', awn: null, win: 'shutter', glyph: null, word: ['TE HUUR'], dark: true },
  asian: { bg: '#a8221e', fg: '#f6d36a', awn: ['#a8221e', '#f6d36a'], win: 'chalk', glyph: 'star', word: ['AZIATISCH', 'WOK'] },
  roti: { bg: '#d8801e', fg: '#fff7d0', awn: ['#d8801e', '#fff7d0'], win: 'chalk', glyph: 'sun', word: ['ROTI', 'SURINAAMS'] },
  casino: { bg: '#2a0a3a', fg: '#ffd23a', awn: null, win: 'neon', glyph: 'diamond', word: ['CASINO'], dark: true },
  massage: { bg: '#8a5a7a', fg: '#ffffff', awn: null, win: 'bottles', glyph: 'heart', word: ['MASSAGE', 'WELLNESS'], dark: true },
  cinema: { bg: '#3a0f1f', fg: '#ffd23a', awn: null, win: 'posters', glyph: 'star', word: ['BIOSCOOP'] },
  gym: { bg: '#2a2f3a', fg: '#7ee06a', awn: null, win: 'weights', glyph: 'bolt', word: ['SPORTSCHOOL', 'FITNESS'] },
  terrace: { bg: '#5b4636', fg: '#f1e4c8', awn: null, win: 'plain', glyph: 'cup', word: ['TERRAS'] },
  market_stall: { bg: '#5b4636', fg: '#f1e4c8', awn: null, win: 'plain', glyph: 'basket', word: ['MARKT'] },
};
export const lookOf = (cat) => CAT_LOOK[cat] || CAT_LOOK.other;

// ---------------------------------------------------------------- parody of an ordinary name
// Broad Hague dialect, the way Haagse-Harry-style writing spells it, then small letter play when that changed nothing.
const DIALECT = [
  [/^sch/, 'sj'], // Schoenen -> Sjoene
  [/ij|ei/g, 'è'], // Zeilen -> Zèle, Prijs -> Près
  [/ou/g, 'âh'], [/au/g, 'ah'],
  [/aa/g, 'ae'], // Haag -> Haeg
  [/oo/g, 'oa'], // Boom -> Boam
];
// small respellings (first occurrence in the chosen word), tried in turn when the dialect left the name as it was
const RESPELL = [[/c(?=[aou])/, 'k'], [/ph/, 'f'], [/th/, 't'], [/sh/, 'sj'], [/y(?!$)/, 'ij'], [/x/, 'ks'], [/ck/, 'k'], [/ie/, 'ij'], [/w/, 'v'], [/ch(?=[aeiou])/, 'sj']];
const SUFFIX = [' & Zn', ' Deluxe', ' Express', ' 2.0'];
const FOODISH = new Set(['restaurant', 'snackbar', 'burger', 'pizza', 'kebab', 'chicken', 'sandwich', 'fish', 'ice_cream', 'cafe', 'pub', 'asian', 'roti']);
const RUDE = ['kut', 'tering', 'kanker', 'tyfus', 'hoer', 'neuk', 'flikker', 'lul', 'pik', 'poep', 'piemel', 'kak', 'sex', 'nazi', 'slet', 'mongool', 'homo', 'neger', 'hitler', 'fuck', 'shit', 'cunt', 'dick', 'pis', 'tiet', 'zak'];
const rude = (s, orig) => { const a = norm(s).replace(/ /g, ''), o = norm(orig).replace(/ /g, ''); return RUDE.some((w) => a.includes(w) && !o.includes(w)); };
const DROP_LEGAL = /\b(b\.?v\.?|v\.?o\.?f\.?|n\.?v\.?|nederland)\b/gi;
// words that go first when a name is too long for the sign: filler, then the word for the kind of place
const FILLER = new Set(['de', 'het', 'een', 'en', 'the', 't', 'van', 'der', 'den', 'vd', 'te', 'by', 'and', 'of', 'la', 'le', 'el', 'op', 'in', 'aan']);
const KIND_WORDS = new Set(['restaurant', 'eetcafe', 'cafe', 'bar', 'brasserie', 'ristorante', 'snackbar', 'cafetaria', 'shop', 'store', 'winkel', 'studio', 'salon', 'kapsalon', 'kapper', 'kappers', 'garage', 'praktijk', 'massagepraktijk', 'service', 'servicecenter', 'center', 'centre', 'centrum', 'nail', 'nails', 'beauty', 'hair', 'fashion', 'mode', 'boutique', 'gemakshop', 'supermarkt', 'slagerij', 'bakkerij', 'pizzeria', 'grill', 'kitchen', 'dining', 'drinks', 'lunchroom', 'tearoom']);
const CITY = new Set(['haag', 'haeg', 'gravenhage', 'scheveningen', 'rijswijk', 'zoetermeer', 'ypenburg', 'voorburg', 'wassenaar', 'leidschendam']);

function caseLike(src, out) {
  if (src.length > 1 && src === src.toUpperCase()) return out.toUpperCase();
  if (src[0] !== src[0].toLowerCase()) return out[0].toUpperCase() + out.slice(1);
  return out;
}
/** Hague dialect for one word: the lower-case work and the capitals put back. */
function dialectWord(w) {
  const low = w.toLowerCase();
  if (low.length < 3 || /[0-9@]/.test(low)) return w;
  let s = low;
  for (const [re, to] of DIALECT) s = s.replace(re, to);
  if (s.length > 4 && /ers?$/.test(s)) s = s.replace(/er(s?)$/, 'âh$1'); // Bakker -> Bakkâh
  else if (s.length > 4 && /en$/.test(s)) s = s.slice(0, -2) + (hash(low) & 1 ? 'e' : 'ûh'); // Schoenen -> Sjoene / Sjoenûh
  else if (low === 'den') s = 'de';
  if (/^v[aeiou]/.test(s) && s.length >= 4 && low !== 'van' && low !== 'vers') s = 'f' + s.slice(1);
  return s === low ? w : caseLike(w, s);
}
/** How much a word matters on a sign (higher stays): filler < the kind of place < initials < the name itself. */
function weight(w, i) {
  const n = norm(w);
  if (!n || FILLER.has(n)) return 0;
  if (CITY.has(n)) return 0.5;
  if (KIND_WORDS.has(n)) return 1;
  if (n.length <= 2) return 1.2;
  return 3 - i * 0.01; // the earlier of two name words wins
}
/** Which words stay on the sign: the ones that matter, until it fits. `outs` are the words as they will be written. */
function fitIdx(words, outs, max, protect = -1) {
  const keep = outs.map((_, i) => i);
  const len = () => keep.map((i) => outs[i]).join(' ').length;
  while (len() > max && keep.length > 1) {
    let drop = -1, dw = 1e9;
    for (const i of keep) { const wt = i === protect ? 9 : weight(words[i], i); if (wt <= dw) { dw = wt; drop = i; } }
    keep.splice(keep.indexOf(drop), 1);
  }
  return keep;
}
const joinKept = (outs, keep, max) => {
  let s = keep.map((i) => outs[i]).join(' ').replace(/^[\s\-&.]+|[\s\-&.]+$/g, '');
  if (s.length > max) s = s.slice(0, max).replace(/[\s\-&.]+$/, '');
  return s;
};
/** Fit a text on a sign: drop what is least needed until it is at most `max` characters. */
export function fitText(text, max = 16) {
  const w = String(text).split(' ').filter(Boolean);
  return joinKept(w, fitIdx(w, w, max), max);
}
/** Letters outside Latin-1 (Turkish, Polish ...) lose their marks, so the sign font has every glyph. */
const latin1 = (s) => [...s].map((c) => (c.charCodeAt(0) <= 255 ? c : c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, ''))).join('');

/** Twist one word of the name a little when the dialect changed nothing. Returns the index it changed. */
function twist(outs, words, h, cat, allow, room) {
  // real name words only: not filler, not the kind of place, not numbers or possessives
  const cand = allow.filter((i) => weight(words[i], i) >= 2 && !/[0-9']/.test(outs[i]));
  if (!cand.length) cand.push(allow[allow.length - 1]);
  const longest = cand.reduce((a, i) => (outs[i].length > outs[a].length ? i : a), cand[0]), last = cand[cand.length - 1];
  const w = outs[longest], low = w.toLowerCase();
  for (let k = 0; k < RESPELL.length; k++) {
    const [re, to] = RESPELL[(k + h) % RESPELL.length];
    if (!re.test(low)) continue;
    const s = low.replace(re, to);
    if (s !== low) { outs[longest] = caseLike(w, s); return longest; }
  }
  // the end of the name takes a joke: a pun suffix in the pub and snack trade, the Dutch diminutive anywhere
  const lw = outs[last], ll = lw.toLowerCase();
  const suf = SUFFIX[h % SUFFIX.length], dim = /[aeiou]$/.test(ll) ? 'tje' : 'je';
  if (FOODISH.has(cat) && (h & 1) && suf.length <= room) { outs[last] = lw + suf; return last; }
  if (ll.length >= 3 && !/(je|tje|ke)$/.test(ll) && dim.length <= room) { outs[last] = lw + dim; return last; }
  for (let i = 0; i < ll.length - 3; i++) {
    const j = 1 + ((i + h) % (ll.length - 3));
    if (ll[j] !== ll[j + 1] && /[a-z]/.test(ll[j] + ll[j + 1])) { outs[last] = caseLike(lw, ll.slice(0, j) + ll[j + 1] + ll[j] + ll.slice(j + 2)); return last; }
  }
  outs[last] = lw + ' 2';
  return last;
}
/**
 * The joke version of a real name: Hague dialect, then letter play if that left it alone. Deterministic (the same
 * name gives the same result in every tile), never the name unchanged, at most 16 characters, nothing rude.
 */
export function parodyName(realName, cat = 'other') {
  const orig = String(realName || '').trim();
  if (!orig) return '';
  let s = orig.replace(/[\u2018\u2019\u00b4`]/g, "'").replace(DROP_LEGAL, ' ').replace(/\s+/g, ' ').trim() || orig;
  s = s.replace(/\bden haag\b/gi, 'De Haag').replace(/'s[- ]gravenhage/gi, 'De Haag');
  const words = s.split(' ').filter((w) => /[a-z0-9]/i.test(w));
  if (!words.length) words.push(s);
  const h = hash(norm(orig));
  const base = words.map(dialectWord);
  const attempt = (k) => {
    const outs = base.slice();
    let keep = fitIdx(words, outs, 16);
    let protect = -1;
    // the dialect left every word that fits on the sign alone: twist one of them
    if (keep.every((i) => outs[i] === words[i])) { protect = twist(outs, words, h + k, cat, keep, 16 - keep.map((i) => outs[i]).join(' ').length); keep = fitIdx(words, outs, 16, protect); }
    return joinKept(outs, keep, 16);
  };
  let out = attempt(0);
  // a rude accident of the letter play: twist again from another start
  for (let k = 1; rude(out, orig) && k < 6; k++) out = attempt(k);
  if (rude(out, orig)) out = fitText(orig, 11) + ' & Zn';
  out = latin1(out);
  if (norm(out) === norm(orig) || !out) out = latin1(fitText(orig, 13)) + 'je';
  return out;
}

// ---------------------------------------------------------------- what a sign says
/**
 * The sign of a shop: { text (capitals, parody), bg, fg, mark ({ g, a, b, p } or null), kind ('chain' | 'name' | 'cat'),
 * cat (the kind of place to draw, a chain may know better than the map), chain (id or null) }.
 * `flags` are POI_FLAG bits; `seed` picks between the unnamed-shop words and tints a colour.
 */
export function signFor(cat, realName, flags = 0, seed = 0) {
  const ch = chainOf(realName);
  if (ch) {
    const use = !cat || cat === 'other' || cat === 'restaurant' || cat === 'terrace' ? ch.cat || cat || 'other' : cat;
    return { text: ch.name, bg: ch.bg, fg: ch.fg, mark: ch.mark, kind: 'chain', cat: use, chain: ch.id, win: ch.win };
  }
  const L = lookOf(cat), g = L.glyph ? { g: L.glyph, a: L.fg, b: L.awn ? L.awn[0] === L.bg ? shadeHex(L.fg, 0.7) : L.awn[0] : shadeHex(L.fg, 0.7), p: shadeHex(L.bg, 0.55) } : null;
  if (realName && norm(realName)) {
    const h = hash(norm(realName));
    // independent shops of one kind do not all share one colour: a small deterministic tint
    const t = [0.82, 1, 1.12, 0.92][h % 4];
    const bg = t === 1 ? L.bg : shadeHex(L.bg, t);
    return { text: parodyName(realName, cat).toUpperCase(), bg, fg: L.fg, mark: g && { ...g, p: shadeHex(bg, 0.55) }, kind: 'name', cat, chain: null, win: null };
  }
  const words = Array.isArray(L.word) ? L.word : [L.word];
  return { text: words[seed % words.length], bg: L.bg, fg: L.fg, mark: g, kind: 'cat', cat, chain: null, win: null };
}
