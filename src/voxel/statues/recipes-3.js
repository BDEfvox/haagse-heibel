// Recipes 3: statues, monuments and sculptures (Scheveningen to Zuiderpark). Keys are input ids, written in input order.
export default {
// De leeuw en de muis (Otterness style): a big lanky bronze lion with a small mouse-sized figure at its paws
'node/8247499120': { name: 'De leeuw en de muis', parts: [['animal','lion',0,0,0,1.8,'bronze',0],['animal','rabbit',0.7,0,0.9,0.3,'bronze',200],['box',-0.5,0.9,0,0.25,0.9,0.25,'bronze'],['box',0.5,0.9,0,0.25,0.9,0.25,'bronze']] },
// Horen zien en zwijgen: three lanky bronze figures covering ears, eyes and mouth
'node/8247499123': { name: 'Horen zien en zwijgen', parts: [['fig',-0.8,0,0,1.9,'bronze','stand',{slim:true}],['fig',0,0,0.1,1.9,'bronze','arm-up',{slim:true}],['fig',0.8,0,0,1.9,'bronze','hips',{slim:true}],['hand',-0.85,1.5,0.2,0.2,'bronze'],['hand',-0.05,1.5,0.3,0.2,'bronze']] },
// Oh, Lars, mijn beste jongen: a tall lanky bronze man with a small boy beside him
'node/8247499124': { name: 'Oh, Lars', parts: [['fig',0,0,0,2.1,'bronze','stand',{slim:true,hat:'cap'}],['fig',0.7,0,0.2,1.1,'bronze','hold',{child:true,hold:'bag'}]] },
// De huilende reus: an oversized hunched giant with huge hands to his face and tear drops
'node/8247499127': { name: 'De huilende reus', parts: [['fig',0,0,0,2.4,'bronze','think',{bulky:true}],['hand',-0.3,1.5,0.3,0.5,'bronze'],['box',0.2,0.9,0.4,0.08,0.4,0.08,'water'],['box',0.35,0.5,0.4,0.08,0.3,0.08,'water']] },
// Gepetto en Pinocchio: old puppet maker with a wooden puppet boy beside him
'node/8247499128': { name: 'Gepetto en Pinocchio', parts: [['fig',-0.5,0,0,2,'bronze','hold',{slim:true,hold:'tool',hat:'cap'}],['fig',0.5,0,0.2,1.3,'bronze','arms-up',{child:true,slim:true}],['box',0.5,1.0,0.7,0.06,0.06,0.4,'bronze']] },
// Hans en Grietje: two children hand in hand with a basket
'node/8247499172': { name: 'Hans en Grietje', parts: [['fig',-0.4,0,0,1.6,'bronze','walk',{child:true,slim:true}],['fig',0.4,0,0,1.5,'bronze','hold',{child:true,slim:true,hold:'basket',hair:'long'}],['box',-0.1,0.7,0,0.3,0.08,0.08,'bronze']] },
// Het paviljoen: a small bronze pavilion with a roof on four thin posts and a lanky figure inside
'node/8247499195': { name: 'Het paviljoen', parts: [['box',-0.9,0,-0.9,0.12,1.9,0.12,'bronze'],['box',0.8,0,-0.9,0.12,1.9,0.12,'bronze'],['box',-0.9,0,0.8,0.12,1.9,0.12,'bronze'],['box',0.8,0,0.8,0.12,1.9,0.12,'bronze'],['taper',0,1.9,0,2.2,2.2,0.7,0.1,'bronze'],['fig',0,0,0,1.5,'bronze','sit',{slim:true,seat:'bronze'}]] },
// Hans Brinker: boy kneeling at a dike with his finger in the hole
'node/8247499196': { name: 'Hans Brinker', parts: [['wall',0,0,-0.4,1.6,0.9,0.5,'stone'],['fig',0,0,0.2,1.2,'bronze','kneel',{child:true,hat:'cap'}],['hand',0,0.5,-0.1,0.15,'bronze']] },
// Berbermeisje: barefoot girl wrapped in a woven blanket
'node/12941937111': { name: 'Berbermeisje', parts: [['fig',0,0,0,2.5,'bronze','stand',{robe:true,cloak:true,hair:'long'}],['box',-0.05,0.1,0.3,0.4,0.05,0.2,'bronze']] },
// Zeehond: small grey stone seal lifting its head
'node/13109092201': { name: 'Zeehond', parts: [['animal','seal',0,0,0,0.6,'#8a8d8e',0],['box',0.28,0.25,0,0.12,0.25,0.14,'#8a8d8e']] },
// Gedenknaald: tall stone obelisk on a stepped base
'way/886911640': { name: 'Gedenknaald', parts: [['steps',3.2,3.2,3,'stone'],['box',-0.9,0.5,-0.9,1.8,1.6,1.8,'stone'],['taper',0,2.1,0,1.3,1.3,12.4,0.12,'stone'],['plaque',0,1.0,0.92,1.0,0.6,'bronze']] },
// Prins Maurits en de burgers: stone stele with relief panel of a horseman and townsfolk
'node/6948429935': { name: 'Prins Maurits relief', parts: [['wall',0,0,0,3,3,0.4,'stone'],['plaque',0,1.2,0.21,2.2,1.3,'#b9b09a'],['fig',-0.6,1.0,0.25,1.0,'stone','stand',{}],['fig',0,1.0,0.25,1.1,'stone','point',{hat:'feather'}],['fig',0.6,1.0,0.25,0.9,'stone','stand',{}]] },
// Zonder titel (Stationsbuurt): 10 m painted steel sheet form, three tall plates fanned out
'node/8255644223': { name: 'Zonder titel 10m', parts: [['slab',-1,0,0,0.15,10,2.2,'steel',20,0],['slab',0.4,0,0.4,0.15,8,2.4,'steel',-25,0],['slab',1.3,0,-0.4,0.15,6,1.8,'steel',70,0],['box',-1.5,0,-0.8,3.2,0.3,2,'concrete']] },
// Zonder titel (Ineke Visser): small steel bars welded into an open frame
'node/11815674706': { name: 'Zonder titel Visser', parts: [['beam',-0.6,0,0,0,2.4,0,0.14,'steel'],['beam',0.6,0,0,0,2.4,0,0.14,'steel'],['beam',-0.6,1.0,0,0.8,0.4,0.5,0.1,'steel'],['box',-0.2,2.4,-0.2,0.5,0.6,0.5,'steel']] },
// Zonder titel (staal en graniet): 8 m steel mast leaning on a granite block with a crossbar
'node/13911049784': { name: 'Zonder titel staal graniet', parts: [['box',-1.2,0,-1,2.4,1.2,2,'granite'],['beam',0,1.2,0,0.8,8,0,0.25,'steel'],['beam',-1,5,0,1.8,6.2,0,0.15,'steel'],['box',0.5,3,-0.2,1.4,0.2,0.4,'steel']] },
// Sculptuur: stainless geometric form of stacked box, wedge and ring
'node/13911095921': { name: 'Sculptuur', parts: [['box',-0.6,0,-0.6,1.2,0.8,1.2,'stainless'],['taper',0,0.8,0,1,1,1.4,0.3,'stainless',45],['ring',0,1.2,0,0.8,0.15,'stainless',0],['ball',-0.3,2.2,-0.3,0.35,'stainless']] },
// Tweeledig object: two corten parts: a tall block and a leaning slab
'node/13911272219': { name: 'Tweeledig object', parts: [['box',-0.9,0,-0.4,0.8,1.8,0.8,'corten'],['slab',0.4,0,-0.4,1.0,1.9,0.15,'corten',0,12],['cyl',0.3,0,0.4,0.3,0.6,'corten']] },
// Studentenverzet: low basalt stele with plaque, sober
'node/1533711468': { name: 'Studentenverzet', parts: [['plinth',1.4,0.25,0.5,'granite','plain'],['box',-0.6,0.25,-0.15,1.2,1.75,0.3,'granite'],['plaque',0,0.9,0.16,0.9,0.7,'bronze']] },
// Oorlogsplaquette NS-station: small plaque on short wall
'node/1533734243': { name: 'Oorlogsplaquette NS', parts: [['wall',0,0,0,1.2,1.0,0.3,'brick'],['plaque',0,0.4,0.16,0.7,0.45,'bronzeDark']] },
// Oorlogsmonument Parallelweg: simple stele on two steps
'node/1533871736': { name: 'Oorlogsmonument Parallelweg', parts: [['steps',1.4,0.8,2,'granite'],['box',-0.4,0.3,-0.15,0.8,1.9,0.3,'granite'],['plaque',0,1.0,0.16,0.5,0.7,'bronzeDark'],['box',-0.5,2.2,-0.2,1.0,0.1,0.4,'granite']] },
// Zonder titel (Snoeck): rounded ceramic form, two stacked blobs with a hole
'node/4390487952': { name: 'Zonder titel Snoeck', parts: [['cyl',0,0,0,0.5,0.7,'#b86a4a'],['ball',-0.1,0.7,0,0.55,'#c9855f'],['ring',0.3,0.2,0.4,0.25,0.1,'#a85a3e',0]] },
// Vrouwenfiguur: standing woman in robe on a granite plinth, sober
'node/5990247642': { name: 'Vrouwenfiguur', parts: [['plinth',1.1,1.0,1.1,'granite','stepped'],['fig',0,1.0,0,2,'stone','stand',{robe:true,hair:'bun'}]] },
// Communicatie (Wolkers): bronze abstract of two heads/forms touching
'node/8258425007': { name: 'Communicatie', parts: [['box',-0.3,0,-0.3,0.6,0.3,0.6,'basalt'],['ball',-0.5,0.3,-0.2,0.55,'bronze'],['ball',0.1,0.5,0,0.5,'bronze'],['beam',-0.1,0.9,0,0.2,1.5,0,0.2,'bronze']] },
// Kleurvelden: blue twisted arch over a road
'node/12538711438': { name: 'Kleurvelden boog', parts: [['beam',-3,0,0,-2,3.5,0.4,0.35,'blue'],['beam',-2,3.5,0.4,0,6,0,0.35,'blue'],['beam',0,6,0,2,3.5,-0.4,0.35,'blue'],['beam',2,3.5,-0.4,3,0,0,0.35,'blue']] },
// Hindoestaans Immigratiemonument: stone pillars with a boat-like curve and a sun disc
'node/4598231096': { name: 'Hindoestaans Immigratiemonument', parts: [['box',-1.5,0,-0.6,3,0.3,1.2,'stone'],['boat',0,0.3,0,2.2,'bronzeDark',0],['disc',0,1.2,-0.4,0.8,0.1,'bronzeGold',0],['box',-1.3,0.3,0.4,0.3,1.2,0.3,'stone']] },
// Mahatma Gandhi: standing in simple wrap with staff on low stone base
'node/4598231097': { name: 'Mahatma Gandhi', parts: [['plinth',1.1,0.5,1.1,'stone','plain'],['fig',0,0.5,0,2.0,'bronze','hold',{robe:true,hold:'staff'}]] },
// Descartes: standing bronze in long coat holding a book on a low stone plinth
'node/1526105818': { name: 'Descartes', parts: [['plinth',1.0,0.6,1.0,'stone','plain'],['fig',0,0.6,0,1.5,'bronze','read',{cloak:true,hair:'long',hat:'brim'}]] },
// V2 memorial: tall rocket-shaped column on a base with a plaque
'node/1533891829': { name: 'V2-wapens', parts: [['plinth',1.6,0.5,1.6,'granite','stepped'],['taper',0,0.5,0,0.9,0.9,3,0.5,'stone'],['cone',0,3.5,0,0.45,0.9,'stone'],['plaque',0,0.8,0.5,0.8,0.5,'bronzeDark']] },
// Boeken Berlage: stacked stone books on the water's edge
'node/3136554332': { name: 'Boeken Berlage', parts: [['box',-0.8,0,-0.5,1.6,0.45,1.0,'stone',5],['box',-0.7,0.45,-0.45,1.4,0.4,0.9,'#9a9a94',-8],['box',-0.6,0.85,-0.4,1.2,0.35,0.8,'stone',12],['box',0.5,0,0.2,0.3,1.0,0.8,'stone',70]] },
// Constantijn Huygens: bust with curls on rough natural stone with lily
'node/1526102270': { name: 'Constantijn Huygens', parts: [['plinth',0.9,1.0,0.9,'granite','rock'],['bust',0,1.0,0,0.55,'bronze',{hair:'long'}],['box',-0.1,0.6,0.38,0.2,0.2,0.05,'bronzeGold']] },
// Indie-monument: long low dark grey slab wall with names
'node/1533723201': { name: 'Indie-monument', parts: [['wall',0,0,0,8,1.0,0.35,'granite'],['plaque',-1.5,0.3,0.18,4.5,0.5,'basalt'],['plaque',2.8,0.3,0.18,1.2,0.5,'basalt']] },
// Indische klok: bell on simple wooden frame
'node/5817771388': { name: 'Indische klok', parts: [['box',-0.9,0,-0.1,0.2,2.2,0.2,'wood'],['box',0.7,0,-0.1,0.2,2.2,0.2,'wood'],['box',-0.9,2.0,-0.1,1.8,0.2,0.2,'wood'],['bell',0,1.0,0,0.9,'bronzeDark']] },
// Granito nr. 9: rounded white lump with a big hole
'node/13836329593': { name: 'Granito nr. 9', parts: [['ring',0,0.15,0,0.8,0.5,'white',0],['ball',-0.5,0.3,0,0.5,'white'],['box',-0.1,0,-0.5,1.0,0.2,1.0,'white']] },
// Indisch monument: marble base with a bier and seventeen bronze figures, one raised fist
'way/203853647': { name: 'Indisch monument', parts: [['box',-3.5,0,-2,7,0.3,4,'marble'],['box',-0.6,0.3,-0.4,1.2,0.5,0.8,'marble'],['fig',0,0.8,0,1.3,'bronze','lie',{}],['fig',-1.1,0.3,0.6,2.5,'bronze','stand',{slim:true,robe:true}],['fig',-2,0.3,-0.3,2.5,'bronze','stand',{slim:true}],['fig',-2.8,0.3,0.6,2.5,'bronze','kneel',{slim:true}],['fig',1.1,0.3,0.6,2.5,'bronze','stand',{slim:true,robe:true}],['fig',2,0.3,-0.3,2.4,'bronze','arm-up',{slim:true}],['fig',2.8,0.3,0.6,1.5,'bronze','stand',{slim:true,child:true}],['fig',0.6,0.3,1.2,2.5,'bronze','stand',{slim:true}],['fig',-0.6,0.3,-1.2,2.5,'bronze','stand',{slim:true,robe:true}],['fig',0.8,0.3,-1.1,2.4,'bronze','stand',{slim:true}],['fig',-1.5,0.3,1.4,1.4,'bronze','stand',{slim:true,child:true}],['fig',1.7,0.3,1.4,2.5,'bronze','stand',{slim:true}]] },
// Vissersmonument: Art Deco blue-green tiled block between two pillars, three flower boxes
'way/754953719': { name: 'Vissersmonument', parts: [['box',-2.2,0,-0.4,3.0,0.3,0.9,'stone'],['box',-1.2,0.3,-0.2,2.4,2.0,0.5,'#2f8f8a'],['box',-1.7,0.3,-0.25,0.5,2.5,0.6,'stone'],['box',1.2,0.3,-0.25,0.5,2.5,0.6,'stone'],['box',-1.0,0.3,0.3,0.6,0.35,0.4,'wood'],['box',-0.3,0.3,0.3,0.6,0.35,0.4,'wood'],['box',0.4,0.3,0.3,0.6,0.35,0.4,'wood'],['plaque',0,1.2,0.07,1.2,0.8,'stainless']] },
// Object: two black triangular columns leaning together to meet at 15 m
'node/12500805337': { name: 'Object zwart', parts: [['beam',-3,0,0,-0.2,15,0,0.55,'black'],['beam',3,0,0,0.2,15,0,0.55,'black'],['box',-0.5,14.7,-0.3,1.0,0.3,0.6,'black']] },
// Engelandspiel: Icarus with one wing raised on top of a tall memorial stone
'node/1533757090': { name: 'De val van Icarus', parts: [['plinth',1.3,2.4,1.3,'stone','classic'],['fig',0,2.4,0,1.5,'bronze','fall',{wings:true,nude:true}],['plaque',0,1.0,0.66,0.8,0.6,'bronzeDark']] },
// George Maduro: two gold-leaf figures, boy and adult, with a brass-plated ground of names
'node/5800998621': { name: 'George Maduro', parts: [['box',-1.5,0,-0.8,3,0.08,1.6,'#6b5a3a'],['fig',-0.5,0.08,0,1.8,'bronzeGold','stand',{}],['fig',0.6,0.08,0.2,1.1,'bronzeGold','stand',{child:true}]] },
// De Houtsnip: low steel woodcock with long bill
'node/9105827011': { name: 'De Houtsnip', parts: [['animal','bird',0,0.3,0,0.8,'steel',0],['box',0.35,0.5,0,0.5,0.05,0.05,'steel'],['box',-0.05,0,0,0.04,0.3,0.04,'steel'],['plinth',0.5,0.3,0.5,'granite','rock']] },
// Lotje: girl with hair band holding a basin, bird on the rim
'node/11765460461': { name: 'Lotje', parts: [['plinth',0.5,0.15,0.5,'granite','plain'],['fig',0,0.15,0,0.9,'bronze','hold',{robe:true,hold:'bag',hair:'long'}],['cyl',0.25,0.55,0.25,0.15,0.1,'bronzeDark'],['animal','bird',0.25,0.65,0.25,0.12,'bronze',0]] },
// Appie: slender marble boy in shorts
'node/3801950590': { name: 'Appie', parts: [['plinth',0.5,0.15,0.5,'stone','plain'],['fig',0,0.15,0,1.2,'marble','stand',{slim:true,col2:'#c9c9c0'}]] },
// Relief vrouw man tafel lamp: stone panel on a wall with two seated figures, table and lamp
'node/7472843328': { name: 'Relief tafel lamp', parts: [['wall',0,0,0,1.6,1.4,0.3,'stone'],['box',-0.5,0.45,0.16,1.0,0.06,0.1,'#8d8878'],['box',-0.45,0.5,0.16,0.2,0.4,0.05,'#8d8878'],['box',0.25,0.5,0.16,0.2,0.4,0.05,'#8d8878'],['box',-0.03,0.55,0.16,0.06,0.5,0.05,'#8d8878'],['cone',0,1.05,0.16,0.2,0.2,'#8d8878']] },
// Granito: two curved uprights carry a tilted half-U on a table pedestal
'node/7472860460': { name: 'Granito', parts: [['box',-0.6,0,-0.4,1.2,0.4,0.8,'concrete'],['slab',-0.3,0.4,0,0.2,0.9,0.4,'#b8b2a4',0,6],['slab',0.3,0.4,0,0.2,0.9,0.4,'#b8b2a4',0,-6],['curve',[[-0.4,1.3,0],[-0.25,1.0,0.1],[0,0.95,0.1],[0.25,1.0,0.1],[0.4,1.3,0]],0.2,'#b8b2a4']] },
// Ritmische zuil: hollow stainless square column with irregular cuts
'node/7597359169': { name: 'Ritmische zuil', parts: [['box',-0.3,0,-0.3,0.12,3,0.6,'stainless'],['box',0.18,0,-0.3,0.12,2.4,0.6,'stainless'],['box',-0.3,0,-0.3,0.6,2.0,0.12,'stainless'],['box',-0.3,0,0.18,0.6,3,0.12,'stainless'],['box',-0.3,2.4,-0.3,0.6,0.6,0.12,'stainless']] },
// Yi Jun cenotaaf: low stone block with sloped top and plaque
'node/8297627119': { name: 'Yi Jun cenotaaf', parts: [['plinth',1.2,0.4,1.0,'granite','stepped'],['box',-0.4,0.4,-0.3,0.8,1.0,0.6,'stone'],['plaque',0,0.8,0.31,0.5,0.4,'bronzeDark']] },
// Gietijzeren beer: wide-legged bear standing upright, hands behind back
'node/7470301762': { name: 'Gietijzeren beer', parts: [['animal','bear',0,0,0,1.0,'#2e2e2c',0],['box',-0.25,0.3,-0.3,0.5,0.5,0.15,'#2e2e2c']] },
// Mechanisch Insect: red copper pointed body with jointed legs and antennae
'node/7597359167': { name: 'Mechanisch Insect', parts: [['taper',0,0.5,0,0.7,1.6,0.6,0.2,'#9a4a32',90],['ball',0.7,0.6,0,0.35,'#b0583a'],['beam',-0.3,0.5,0.3,-0.7,0,0.8,0.07,'#9a4a32'],['beam',0.3,0.5,0.3,0.7,0,0.8,0.07,'#9a4a32'],['beam',-0.3,0.5,-0.3,-0.7,0,-0.8,0.07,'#9a4a32'],['beam',0.3,0.5,-0.3,0.7,0,-0.8,0.07,'#9a4a32'],['beam',1.0,0.9,0,1.5,1.4,0.2,0.04,'#9a4a32']] },
// Plastiek: angular concrete play block, two joined slanted solids
'node/7597359168': { name: 'Plastiek', parts: [['box',-1.0,0,-0.8,1.6,1.4,1.6,'concrete',15],['taper',0.4,0,0,1.4,1.4,2.4,0.4,'concrete',-10],['box',-0.2,1.2,-0.6,1.2,1.0,1.0,'concrete',30]] },
// Joodse gedeporteerden Rosenburg: wall with a menorah relief, sober
'node/8245255578': { name: 'Rosenburg gedenkmuur', parts: [['wall',0,0,0,3.5,2.0,0.4,'stone'],['box',-0.05,0.7,0.21,0.1,0.9,0.04,'bronzeDark'],['box',-0.5,1.1,0.21,1.0,0.07,0.04,'bronzeDark'],['box',-0.5,1.1,0.21,0.07,0.5,0.04,'bronzeDark'],['box',0.43,1.1,0.21,0.07,0.5,0.04,'bronzeDark'],['box',-0.25,1.1,0.21,0.06,0.45,0.04,'bronzeDark'],['box',0.19,1.1,0.21,0.06,0.45,0.04,'bronzeDark'],['plaque',1.1,0.5,0.21,0.8,0.7,'bronzeDark']] },
// Boodschappen: two women with shopping bags and a cart
'node/13912631315': { name: 'Boodschappen', parts: [['fig',-0.5,0,0,1.8,'bronze','hold',{hold:'bag',robe:true}],['fig',0.4,0,0.1,1.7,'bronze','hold',{hold:'basket',hair:'bun'}],['box',0.8,0.3,0.4,0.6,0.4,0.4,'bronzeDark'],['box',0.8,0.1,0.4,0.6,0.1,0.4,'bronzeDark']] },
// John Wayne: aluminium cowboy on horse with bucket on head, flowers, plastic bag
'node/12192396790': { name: 'John Wayne', parts: [['horse',0,0,0,3.4,'#b9bec2',{rider:'hold',riderOpts:{hold:'bag'}}],['box',-0.15,3.0,0,0.3,0.3,0.3,'steel'],['box',-0.3,2.0,0.5,0.2,0.2,0.2,'red']] },
// Troelstra-monument: concrete gate with three bronze figures supporting each other, orator stepping out
'node/2953971603': { name: 'Troelstra-monument', parts: [['paving',9,6,'concrete'],['arch',0,0,-0.5,7,11,1.4,1.0,'concrete'],['fig',-1.3,11,-0.5,2.8,'bronze','arms-up',{}],['fig',0,11,-0.5,3.0,'bronze','embrace',{}],['fig',1.3,11,-0.5,2.8,'bronze','arm-up',{}],['plinth',1.6,0.5,1.6,'concrete','plain'],['fig',0,0.5,1.5,3.4,'bronzeDark','point',{cloak:true}]] },
// Bombardement Alexanderkazerne: concrete wall with plaque and low horse relief, sober
'node/5766116561': { name: 'Bombardement Alexanderkazerne', parts: [['wall',0,0,0,4,1.6,0.4,'concrete'],['plaque',0,0.6,0.21,1.6,0.7,'bronzeDark'],['animal','horse',-1.2,1.0,0.22,0.5,'bronzeDark',0],['box',1.5,0,-0.3,0.5,2.0,0.6,'concrete']] },
// 25 Jaar Lummus: abstract rings numbered 25: two linked rings on a block
'node/3765664992': { name: '25 Jaar Lummus', parts: [['plinth',1.0,0.6,0.7,'concrete','plain'],['ring',-0.3,0.6,0,0.7,0.12,'stainless',0],['ring',0.3,0.6,0,0.7,0.12,'stainless',90],['letters',0,0.05,0.36,'25',0.3,'bronzeDark',0]] },
// The Gift: abstract multi-faceted form, a rotated block stack with a slanted blade
'node/5764170840': { name: 'The Gift', parts: [['box',-0.7,0,-0.7,1.4,1.0,1.4,'#b0aca4',20],['taper',0,1.0,0,1.1,1.1,1.4,0.3,'#c9c5bd',-15],['slab',0.1,2.3,0,0.2,0.7,1.2,'steel',40,25]] },
// Albert Plesman: arms behind back, leaning into wind, gazing up, coarse
'node/5819344153': { name: 'Albert Plesman', parts: [['fig',0,0,0,3.1,'bronzeDark','stand',{bulky:true,hat:'cap',cloak:true}],['box',-0.4,0,-0.3,0.8,0.15,1.4,'#6e6a5e']] },
// Lazarus: bandaged Lazarus supported by an angel with wings
'node/8249870140': { name: 'Lazarus', parts: [['fig',0.4,0,0,2,'#a79c86','stand',{robe:true,slim:true}],['fig',-0.4,0,0.1,2.0,'bronze','stand',{robe:true,wings:true,slim:true}],['box',-0.1,0.9,0.15,0.5,0.15,0.2,'bronze']] },
// Alas de Mexico: pair of giant wings at top of a staircase
'node/8256149519': { name: 'Alas de Mexico', parts: [['steps',3,2,3,'concrete'],['slab',-0.9,0.5,0,0.2,2.8,1.6,'bronze',-20,-12],['slab',-1.4,2.0,0,0.2,1.4,1.2,'bronze',-30,-18],['slab',0.9,0.5,0,0.2,2.8,1.6,'bronze',20,-12],['slab',1.4,2.0,0,0.2,1.4,1.2,'bronze',30,-18]] },
// Synthetische constructie F8-1B: spiral of stacked cubes around a central vertical line, 9 m
'node/13773564607': { name: 'Synthetische constructie', parts: [['beam',0,0,0,0,9,0,0.15,'steel'],['box',-0.8,0,-0.8,1.6,1.0,1.6,'concrete',0],['box',-0.7,1.2,-0.7,1.4,1.0,1.4,'stone',20],['box',-0.6,2.4,-0.6,1.2,1.0,1.2,'concrete',40],['box',-0.55,3.6,-0.55,1.1,1.0,1.1,'stone',60],['box',-0.5,4.8,-0.5,1.0,1.0,1.0,'concrete',80],['box',-0.4,6.0,-0.4,0.8,0.9,0.8,'stone',100],['box',-0.35,7.1,-0.35,0.7,0.8,0.7,'concrete',120],['box',-0.3,8.1,-0.3,0.6,0.6,0.6,'stone',140]] },
// Torsie: rounded bronze torso, back of a woman with a twist
'node/13835395180': { name: 'Torsie', parts: [['box',-0.4,0,-0.4,0.8,0.12,0.8,'granite'],['ball',-0.2,0.12,-0.2,0.4,'bronze'],['taper',0,0.5,0.1,0.7,0.5,0.62,0.7,'bronze',18],['ball',-0.1,0.9,0.1,0.35,'bronze']] },
// Moeder met kind en poppenwagen: mother leaning toward daughter at a doll's pram
'node/13835521056': { name: 'Moeder met kind en poppenwagen', parts: [['fig',-0.3,0,0,1.2,'bronze','stand',{robe:true,hair:'bun'}],['fig',0.35,0,0.1,0.8,'bronze','stand',{child:true}],['box',0.6,0.25,0.3,0.4,0.3,0.6,'bronzeDark'],['ring',0.55,0,0.3,0.12,0.05,'bronzeDark',0]] },
// Job: compact seated man, closed form, hunched
'node/13835530458': { name: 'Job', parts: [['box',-0.4,0,-0.4,0.8,0.12,0.8,'stone'],['fig',0,0.12,0,0.8,'bronzeDark','sit-ground',{bulky:true}]] },
// Twee vrouwen met parasol: two identical seated block women under a round parasol with small dog
'node/13835887444': { name: 'Twee vrouwen met parasol', parts: [['box',-0.9,0,-0.5,1.8,0.5,1.0,'stone'],['box',-0.8,0.5,-0.3,0.6,0.9,0.5,'#c2b9a4'],['box',0.2,0.5,-0.3,0.6,0.9,0.5,'#c2b9a4'],['box',-0.7,1.4,-0.2,0.4,0.4,0.4,'stone'],['box',0.3,1.4,-0.2,0.4,0.4,0.4,'stone'],['box',-0.05,0.5,-0.05,0.1,2.0,0.1,'stone'],['cone',0,2.2,0,1.0,0.34,'stone'],['animal','dog',0,0.5,0.6,0.35,'stone',0]] },
// Vrouw: sturdy standing nude, smile
'node/13835887445': { name: 'Vrouw', parts: [['plinth',0.8,0.3,0.8,'stone','plain'],['fig',0,0.3,0,1.7,'stone','stand',{nude:true,bulky:true,hair:'bun'}]] },
// Ariadne: small white marble figure, hands folded over raised knees
'node/13835983540': { name: 'Ariadne', parts: [['box',-0.35,0,-0.35,0.7,0.1,0.7,'stone'],['fig',0,0.1,0,0.55,'marble','sit-ground',{nude:true,hair:'long'}]] },
// Zittende vrouw: seated woman, arms crossed, child on top, geometric
'node/13835983541': { name: 'Zittende vrouw', parts: [['box',-0.6,0,-0.5,1.2,0.6,1.0,'stone'],['box',-0.4,0.6,-0.3,0.8,0.8,0.6,'#b6ad98'],['box',-0.25,1.4,-0.25,0.5,0.4,0.5,'stone'],['ball',-0.2,1.8,-0.2,0.2,'stone'],['fig',0,1.5,0,0.5,'stone','sit-ground',{child:true}]] },
// Odysseus en de Sirenen: young man bound to the mast leaning forward, two bird-bodied sirens
'node/13835983620': { name: 'Odysseus en de Sirenen', parts: [['boat',0,0,0,1.8,'bronzeDark',0],['fig',0,0.4,0,1.2,'bronze','stand',{hair:'long'}],['animal','bird',-0.9,0.1,0.5,0.8,'bronze',60],['head',-1.05,0.7,0.6,0.22,'bronze'],['animal','bird',0.9,0.1,0.5,0.8,'bronze',-60],['head',1.05,0.7,0.6,0.22,'bronze']] },
// Gelaarsde kat: dandy cat in human form with boots and feathered hat
'node/13835996223': { name: 'Gelaarsde kat', parts: [['fig',0,0,0,1.04,'bronze','stand',{hat:'feather',cloak:true,col2:'#7a5a2a'}],['animal','cat',0.4,0,0.1,0.3,'bronze',0]] },
// Gezins- en kinderverzorgster: stone woman with a pan, looking down at a child
'node/13836108581': { name: 'Gezins- en kinderverzorgster', parts: [['plinth',0.8,0.3,0.8,'stone','plain'],['fig',-0.1,0.3,0,1.5,'stone','hold',{robe:true,hold:'basket'}],['fig',0.35,0.3,0.2,0.7,'stone','stand',{child:true}]] },
// Omarming: tangle of bronze forms with holes and curves and a wooden element
'node/13836108582': { name: 'Omarming', parts: [['curve',[[-0.4,0,0],[-0.5,0.5,0.1],[-0.1,0.9,0],[0.2,0.6,-0.1]],0.18,'bronze'],['curve',[[0.4,0,0],[0.5,0.5,-0.1],[0.1,0.95,0],[-0.2,0.6,0.1]],0.18,'bronze'],['ring',0,0.3,0.2,0.3,0.1,'bronze',0],['box',-0.1,0,-0.2,0.2,0.4,0.2,'wood']] },
// Het Gesprek: two colourful ceramic figures across a table
'node/13836329577': { name: 'Het Gesprek', parts: [['box',-0.5,0.7,-0.4,1.0,0.08,0.8,'#d9a441'],['box',-0.05,0,-0.05,0.1,0.7,0.1,'#d9a441'],['fig',-0.9,0,0,1.7,'#6a8fb5','stand',{hat:'cap',col2:'#d44'}],['fig',0.9,0,0,1.7,'#e8933a','stand',{robe:true,hair:'long',col2:'#b0572a'}]] },
// Nationaal Onafhankelijkheidsmonument: tall classical monument, William I with raised hand, personifications, Dutch Maiden with flag
'node/1343413820': { name: 'Onafhankelijkheidsmonument', parts: [['steps',8,5,4,'stone'],['plinth',5.5,3.5,3.0,'stone','classic'],['fig',0,3.5,0.6,3.2,'bronze','arm-up',{cloak:true,robe:true}],['fig',-2.0,3.5,0.3,2.4,'stone','read',{robe:true}],['fig',2.0,3.5,0.3,2.4,'stone','hold',{robe:true,hold:'wreath'}],['cyl',0,6.7,-0.8,0.7,1.4,'stone'],['box',-2.1,3.5,-1.6,4.2,12,0.8,'stone'],['taper',0,15.5,-1.2,3.2,1.4,3.0,0.3,'stone'],['fig',0,18.5,-1.0,3.2,'bronze','hold',{robe:true,hold:'flag'}],['plaque',0,1.5,1.55,2.0,1.0,'bronzeGold']] },
// Doosvrucht: small round bronze fruit with cracked skin revealing segments
'node/6829009964': { name: 'Doosvrucht', parts: [['box',-0.2,0,-0.2,0.4,0.05,0.4,'stone'],['ball',-0.17,0.05,-0.17,0.17,'bronze'],['box',-0.05,0.3,0.1,0.1,0.08,0.05,'#d9c27a']] },
// Grenadiers en Jagers: two kneeling soldiers with rifles on carved natural stone base
'node/1533790671': { name: 'Grenadiers en Jagers', parts: [['plinth',2.4,1.1,1.4,'granite','rock'],['fig',-0.5,1.1,0,1.5,'bronze','kneel',{hat:'helmet',hold:'rifle'}],['fig',0.5,1.1,0.1,1.5,'bronze','kneel',{hat:'helmet',hold:'rifle'}],['cone',-0.8,0.5,0.75,0.15,0.3,'bronzeDark']] },
// Ling Zhi Helicopters: three giant mushrooms in a canal with rotors on caps
'node/10142476111': { name: 'Ling Zhi Helicopters', parts: [['pool',0,0,0,5,3],['cyl',-1.8,0,0,0.25,5.2,'#c8b090'],['ball',-2.4,5.0,-0.6,0.9,'#b3402e'],['beam',-4.2,6.3,-0.6,0.6,6.3,-0.6,0.08,'steel'],['cyl',0.2,0,0.4,0.22,4.8,'#c8b090'],['ball',-0.4,4.7,-0.2,0.8,'#b3402e'],['beam',-2,5.9,-0.2,1.6,5.9,-0.2,0.08,'steel'],['cyl',2.0,0,0,0.2,4.0,'#c8b090'],['ball',1.4,3.8,-0.6,0.7,'#b3402e'],['beam',-0.1,5.0,-0.6,3.2,5.0,-0.6,0.08,'steel']] },
// Zwanen Anthon en Anthonia: pair of white swans side by side, necks curved
'node/11815248152': { name: 'Zwanen Anthon en Anthonia', parts: [['animal','swan',-0.6,0,0,1.0,'white',0],['animal','swan',0.6,0,0.2,1.0,'white',30]] },
// Wereldvredesvlam: black stone column with eternal flame on top
'node/1343393349': { name: 'Wereldvredesvlam', parts: [['box',-0.45,0,-0.45,0.9,0.15,0.9,'granite'],['box',-0.3,0.15,-0.3,0.6,1.45,0.6,'basalt'],['flame',0,1.6,0,0.4],['plaque',0,0.7,0.31,0.4,0.5,'stainless']] },
// Sinti- en Roma monument: bronze cube on low base with name plaque, sober
'node/1530681301': { name: 'Sinti- en Roma monument', parts: [['box',-0.6,0,-0.6,1.2,0.15,1.2,'granite'],['box',-0.45,0.15,-0.45,0.9,0.85,0.9,'bronzeDark',15],['plaque',0,0.4,0.55,0.5,0.4,'bronze',15]] },
// Haags Verzets- en Bevrijdingsmonument: undulating basalt wall with four tall and four short black granite columns
'node/1533750598': { name: 'Verzets- en Bevrijdingsmonument', parts: [['box',-3.2,0,-0.4,1.2,0.5,0.8,'basalt'],['box',-2.0,0,-0.4,1.2,0.8,0.8,'basalt'],['box',-0.8,0,-0.4,1.2,0.5,0.8,'basalt'],['box',0.4,0,-0.4,1.2,0.8,0.8,'basalt'],['box',1.6,0,-0.4,1.2,0.5,0.8,'basalt'],['box',-3.0,0.5,-0.25,0.4,2.5,0.5,'#2c2e30'],['box',-1.7,0.8,-0.25,0.4,2.2,0.5,'#2c2e30'],['box',-0.5,0.5,-0.25,0.4,2.5,0.5,'#2c2e30'],['box',0.8,0.8,-0.25,0.4,2.2,0.5,'#2c2e30'],['box',-2.4,0.8,0.1,0.3,1.0,0.3,'#2c2e30'],['box',-1.1,0.5,0.1,0.3,1.0,0.3,'#2c2e30'],['box',0.2,0.8,0.1,0.3,1.0,0.3,'#2c2e30'],['box',1.9,0.5,0.1,0.3,1.0,0.3,'#2c2e30']] },
// Maris monument: stepped classical monument with two round portrait reliefs and a draped female figure on steps
'node/3133790770': { name: 'Gedenkmonument Maris', parts: [['steps',3.4,2.0,4,'stone'],['box',-0.9,0.7,-0.6,1.8,2.6,0.9,'stone'],['box',-1.0,3.3,-0.7,2.0,0.4,1.1,'stone'],['disc',-0.45,2.4,0.34,0.4,0.08,'bronzeDark',0],['disc',0.45,2.4,0.34,0.4,0.08,'bronzeDark',0],['fig',0.1,0.35,0.9,1.0,'stone','sit-ground',{nude:true,col2:'#c9c2ae'}]] },
// Erasmus: standing stone scholar in gown with cap, holding a book, on a low plinth
'node/6225290239': { name: 'Erasmus', parts: [['plinth',1.0,0.5,1.0,'stone','plain'],['fig',0,0.5,0,1.8,'stone','read',{robe:true,hat:'cap'}]] },
// Dresselhuys: symmetrical memorial with portrait medallion between two female figures (palm and broken chains)
'node/3133843843': { name: 'H.C. Dresselhuijs', parts: [['plinth',3.0,0.5,1.0,'stone','plain'],['box',-0.5,0.5,-0.2,1.0,2.1,0.4,'stone'],['disc',0,1.7,0.2,0.4,0.08,'bronze',0],['fig',-1.1,0.5,0.1,1.8,'bronze','hold',{robe:true,hold:'wreath'}],['fig',1.1,0.5,0.1,1.8,'bronze','arms-up',{robe:true,hair:'long'}],['beam',1.0,1.5,0.2,1.2,1.9,0.2,0.05,'bronzeDark']] },
// Goeman Borgesius: sandstone stele with bevelled corners and portrait medallion
'node/5454588659': { name: 'Goeman Borgesius', parts: [['steps',1.6,1.0,2,'stone'],['box',-0.5,0.3,-0.3,1.0,2.33,0.6,'stone'],['disc',0,1.8,0.31,0.35,0.06,'bronze',0],['plaque',0,0.9,0.31,0.7,0.6,'bronzeDark'],['box',-0.5,2.4,-0.3,1.0,0.2,0.6,'#bdb59e']] },
// de Man: colourful ceramic man built from separate parts, open back
'node/5750124437': { name: 'de Man', parts: [['box',-0.35,0,-0.15,0.3,0.9,0.3,'#4f78b0'],['box',0.05,0,-0.15,0.3,0.9,0.3,'#d1673a'],['box',-0.4,0.9,-0.2,0.8,0.6,0.4,'#e0b43a'],['box',-0.7,0.9,-0.1,0.3,0.55,0.2,'#6aa05a'],['box',0.4,0.9,-0.1,0.3,0.55,0.2,'#a84f8a'],['ball',-0.2,1.5,-0.2,0.2,'#e8c9a0']] },
// Zitbank Anna Paulowna: bronze lady in 19th-century dress and headgear on a bench with an empty seat
'node/5773392934': { name: 'Zitbank Anna Paulowna', parts: [['bench',0,0,0,1.8,'wood',0],['fig',-0.45,0.4,0,1.3,'bronze','sit',{robe:true,hat:'brim',seat:'wood'}]] },
// Ode aan de fiets: bronze parent on a bicycle with child on the back, umbrella as head
'node/5885578814': { name: 'Ode aan de fiets', parts: [['ring',-0.7,0,0,0.45,0.06,'bronzeDark',90],['ring',0.7,0,0,0.45,0.06,'bronzeDark',90],['beam',-0.7,0.45,0,0,0.5,0,0.05,'bronzeDark'],['beam',0,0.5,0,0.7,0.45,0,0.05,'bronzeDark'],['fig',0,0.5,0,1.1,'bronze','walk',{}],['fig',-0.5,0.7,0,0.6,'bronze','stand',{child:true}],['cone',0.05,1.5,0,0.5,0.35,'bronze']] },
// Le Terrassier: standing navvy with shovel, cap, working pose
'node/11049317971': { name: 'Le Terrassier', parts: [['plinth',0.9,0.4,0.9,'stone','plain'],['fig',0,0.4,0,1.7,'bronze','hold',{hold:'tool',hat:'cap',bulky:true}]] },
// IJsbeerfontein: white porcelain polar bear on a low basin with a small jet
'way/1567299591': { name: 'IJsbeerfontein', parts: [['basin',0,0,0,0.9,0.3,'stone'],['box',-0.3,0.3,-0.3,0.6,0.3,0.6,'stone'],['animal','bear',0,0.6,0,0.6,'white',0],['jet',0.4,0.3,0.4,0.6]] },
// Stalin-buste en haring: red phone box with a Stalin bust inside, herring in front, lamp beside
'node/3013656371': { name: 'Stalin-buste en haring', parts: [['box',-0.5,0,-0.5,1.0,0.12,1.0,'concrete'],['box',-0.45,0.12,-0.45,0.06,2.1,0.06,'red'],['box',0.39,0.12,-0.45,0.06,2.1,0.06,'red'],['box',-0.45,0.12,0.39,0.06,2.1,0.06,'red'],['box',0.39,0.12,0.39,0.06,2.1,0.06,'red'],['box',-0.5,2.2,-0.5,1.0,0.15,1.0,'red'],['box',-0.4,0.12,-0.4,0.8,2.0,0.05,'#7a1620'],['bust',0,1.1,0,0.5,'bronzeDark',{hat:'cap'}],['animal','fish',0,0.12,0.9,0.45,'stainless',0],['box',0.85,0,0.3,0.25,0.5,0.25,'wood'],['cone',0.85,0.5,0.3,0.2,0.25,'yellow']] },
// Van Karnebeekbron: Art Nouveau terracotta fountain with basin and gilt inscription
'node/3133279463': { name: 'Van Karnebeekbron', parts: [['basin',0,0,0.7,0.9,0.4,'#c9b28f'],['plinth',1.6,2.2,0.7,'#c9b28f','classic'],['plaque',0,1.3,0.37,1.0,0.5,'bronzeGold'],['box',-0.2,2.2,-0.2,0.4,0.3,0.4,'#c9b28f'],['jet',0,0.7,0.8,0.8]] },
// Richard Hol: bronze bust on tall hardstone pedestal with relief of winged woman and lyre
'node/3145386823': { name: 'Richard Hol', parts: [['plinth',1.2,2.8,1.2,'granite','classic'],['bust',0,2.8,0,0.7,'bronze',{hair:'quiff'}],['fig',0,1.0,0.62,0.9,'bronze','stand',{wings:true,robe:true}],['plaque',0,2.0,0.62,0.7,0.4,'bronzeDark']] },
// Long Walk to Freedom: Mandela walking, no pedestal, children's footprints leading to him
'node/5810398998': { name: 'Long Walk to Freedom', parts: [['fig',0,0,0,3.5,'bronze','walk',{col2:'#6e5a3a'}],['box',-0.3,0,2.0,0.2,0.04,0.35,'bronzeDark'],['box',0.2,0,2.8,0.2,0.04,0.35,'bronzeDark'],['box',-0.2,0,3.6,0.2,0.04,0.35,'bronzeDark'],['box',0.3,0,4.4,0.2,0.04,0.35,'bronzeDark']] },
// Staand naakt met draperie: limestone nude, drapery from left shoulder
'node/13037609366': { name: 'Staand naakt met draperie', parts: [['plinth',0.8,0.25,0.8,'stone','plain'],['fig',0,0.25,0,1.8,'stone','stand',{nude:true,cloak:true}]] },
// Halabja Monument: sober memorial, tall stone curve with a ring of victims' stone figures
'node/2824734490': { name: 'Halabja Monument', parts: [['paving',4,4,'stone'],['wall',-1.5,0.08,-0.4,3,0.6,0.5,'stone'],['fig',-1.0,0.68,-0.2,1.2,'stone','kneel',{robe:true,hair:'bun'}],['fig',0.5,0.08,0.2,1.2,'stone','sit-ground',{child:true}],['slab',-0.9,0.08,-1.0,1.8,3,0.35,'stone',0,6]] },
// Jan Toorop monument: tall column, three heads (Toorop, woman, fisherman) with small nude between
'node/3128253589': { name: 'Jan Toorop monument', parts: [['steps',2.0,2.0,2,'stone'],['plinth',1.0,2.2,1.0,'stone','column'],['head',-0.3,2.6,0.1,0.5,'stone'],['head',0.3,2.6,0.1,0.5,'stone'],['head',0,2.9,-0.2,0.6,'stone'],['fig',0,2.3,0.25,0.5,'stone','stand',{nude:true}]] },
// Twee Meisjes: two slender girls with ponytails side by side, hands behind backs
'node/3145340335': { name: 'Twee Meisjes', parts: [['fig',-0.3,0,0,1.37,'bronze','stand',{slim:true,hair:'long'}],['fig',0.3,0,0,1.37,'bronze','stand',{slim:true,hair:'long'}]] },
// Waiting for Responsibility: wooden figure, hooded seated shape on a plank base
'node/5229126098': { name: 'Waiting for Responsibility', parts: [['box',-0.6,0,-0.4,1.2,0.12,0.8,'wood'],['fig',0,0.12,0,1.9,'wood','stand',{bulky:true,cloak:true,hat:'scarf'}],['slab',0.9,0,-0.1,0.2,1.2,0.5,'wood',0,15]] },
// Eline Vere: lady in fashionable dress and hat, parasol, undetailed face
'node/5796986016': { name: 'Eline Vere', parts: [['plinth',0.9,0.3,0.9,'stone','plain'],['fig',0,0.3,0,2.35,'bronze','hold',{robe:true,hat:'brim',hold:'staff'}],['cone',0.4,1.85,0.2,0.5,0.25,'bronzeDark']] },
// Betico Croes: bronze bust on low plinth
'node/5806530814': { name: 'Betico Croes', parts: [['plinth',0.9,0.9,0.9,'granite','classic'],['bust',0,0.9,0,0.65,'bronze',{hair:'quiff'}]] },
// Big Fish Day: yellow scaffold with stork, female Hague Harry, and boatman
'node/5817671095': { name: 'Big Fish Day', parts: [['box',-1.5,0,-0.8,3.0,0.15,1.6,'yellow'],['beam',-1.4,0.15,-0.7,-1.4,3.5,-0.7,0.1,'yellow'],['beam',1.4,0.15,-0.7,1.4,3.5,-0.7,0.1,'yellow'],['beam',-1.4,3.5,-0.7,1.4,3.5,-0.7,0.1,'yellow'],['box',-1.5,0.15,0.6,3,0.8,0.1,'yellow'],['animal','stork',-1.0,0.15,0,1.2,'yellow',0],['fig',0,0.15,0,1.4,'yellow','stand',{hair:'bun'}],['fig',1.0,0.15,0,1.4,'yellow','hold',{hold:'tool',hat:'cap'}]] },
// Large Locking Piece: interlocking organic bronze shapes round a central opening
'node/5916114584': { name: 'Large Locking Piece', parts: [['box',-0.8,0,-0.5,1.6,0.2,1.0,'granite'],['ring',-0.3,0.2,0,0.8,0.35,'bronze',0],['ball',0.3,0.2,-0.1,0.65,'bronze'],['ring',0.2,0.8,0,0.5,0.3,'bronze',60]] },
// Jacob en de Engel: two intertwined figures wrestling, angular limbs, small heads
'node/13037578861': { name: 'Jacob en de Engel', parts: [['box',-0.5,0,-0.4,1.0,0.12,0.8,'granite'],['fig',-0.2,0.12,0,1.5,'bronze','fall',{wings:true,slim:true}],['fig',0.2,0.12,0.1,1.5,'bronzeDark','arm-up',{slim:true,bulky:false}],['beam',-0.2,0.7,0,0.3,1.0,0.1,0.1,'bronze']] },
// Romeinse jongen: small bronze Roman boy in tunic with short hair
'node/13037587180': { name: 'Romeinse jongen', parts: [['plinth',0.5,0.25,0.5,'stone','plain'],['fig',0,0.25,0,0.95,'bronze','stand',{child:true,robe:true}]] },
// Icarus: falling, shoulder landing, legs in the air
'node/13037609401': { name: 'Icarus', parts: [['box',-0.8,0,-0.5,1.6,0.2,1.0,'stone'],['fig',0,0.2,0,1.6,'bronze','fall',{wings:true,nude:true,slim:true}]] },
// Kind met eend en vogeldrinkbak: child with duck and a bird at a bowl
'node/13037609908': { name: 'Kind met eend en vogeldrinkbak', parts: [['fig',-0.2,0,0,1.0,'bronze','kneel',{child:true}],['animal','duck',0.4,0,0.2,0.3,'bronze',20],['cyl',0.8,0,0,0.12,0.5,'stone'],['basin',0.8,0.5,0,0.3,0.08,'stone'],['animal','bird',0.9,0.58,0,0.15,'bronze',0]] },
// Pad: low concrete stepping stones laid out as a path
'node/13767987915': { name: 'Pad', parts: [['box',-1.6,0,-0.3,0.7,0.3,0.6,'concrete',10],['box',-0.7,0,0.0,0.7,0.3,0.6,'concrete',-5],['box',0.2,0,-0.2,0.7,0.3,0.6,'concrete',15],['box',1.1,0,0.1,0.7,0.3,0.6,'concrete',-10]] },
// WELL: grid at ground level over a deep shaft, small steel figure below looking up
'node/13768472359': { name: 'WELL', parts: [['box',-0.8,0,-0.8,1.6,0.06,0.1,'steel'],['box',-0.8,0,0.7,1.6,0.06,0.1,'steel'],['box',-0.8,0,-0.8,0.1,0.06,1.6,'steel'],['box',0.7,0,-0.8,0.1,0.06,1.6,'steel'],['box',-0.05,0,-0.8,0.1,0.06,1.6,'steel'],['box',-0.8,0,-0.05,1.6,0.06,0.1,'steel'],['fig',0,-0.05,0,0.5,'steel','arm-up',{}]] },
// Ornamentenmuur: decorative concrete wall with repeating panels and cap
'way/626664697': { name: 'Ornamentenmuur', parts: [['wall',0,0,0,6,2.5,0.4,'concrete'],['box',-2.6,0.5,0.2,1.0,1.4,0.06,'#a8a498'],['box',-1.3,0.5,0.2,1.0,1.4,0.06,'#a8a498'],['box',0,0.5,0.2,1.0,1.4,0.06,'#a8a498'],['box',1.3,0.5,0.2,1.0,1.4,0.06,'#a8a498'],['box',2.6,0.5,0.2,1.0,1.4,0.06,'#a8a498']] },
// Staand en liggend: one standing angular steel form and one reclining granite form
'way/1505030938': { name: 'Staand en liggend', parts: [['slab',-1.5,0,0,0.3,4,1.2,'steel',0,0],['slab',-1.2,2.4,0,1.8,0.3,1.0,'steel',0,0],['box',0.3,0,-0.5,2.8,0.8,1.0,'granitePink'],['box',0.9,0.8,-0.4,1.4,0.5,0.8,'granitePink'],['beam',-1.5,3.9,0,0.4,4,0,0.12,'steel']] },
// Floating Point: oval glass and light enclosure, dark grey, lit
'way/1514826919': { name: 'Floating Point', parts: [['cyl',0,0,0,1.5,0.15,'#3a3c40'],['ring',0,0.15,0,1.5,0.12,'#3a3c40',0],['ring',0,0.15,0,1.5,0.12,'#3a3c40',90],['cyl',0,0.15,0,1.4,2.8,'glass'],['cyl',0,2.95,0,1.5,0.1,'#3a3c40'],['box',-0.1,0.2,-0.1,0.2,2.0,0.2,'yellow']] },
// Kat: stocky concrete cat, tail curled round paws, frown, on pedestal
'node/8458703386': { name: 'Kat', parts: [['plinth',0.9,0.5,0.9,'concrete','stepped'],['animal','cat',0,0.5,0,0.85,'#9a968c',0],['box',0.05,0.5,0.35,0.5,0.1,0.15,'#9a968c']] },
// Dolfijn: stylised stone dolphin, bevelled blocks arching with tail up
'node/10871061305': { name: 'Dolfijn', parts: [['box',-1.0,0,-0.3,2.0,0.5,0.6,'stone'],['box',-0.8,0.5,-0.25,1.5,0.5,0.5,'stone',0],['box',0.5,0.9,-0.2,0.6,0.5,0.4,'stone'],['box',-1.3,0.3,-0.2,0.4,0.9,0.4,'stone'],['box',-1.5,1.1,-0.35,0.6,0.15,0.7,'stone']] }
};
