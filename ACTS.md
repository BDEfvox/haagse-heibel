# Writing a crime scene (`src/voxel/acts/*.js`)

Every crime cutscene is one file in `src/voxel/acts/`. It exports a factory `(T) => ({ w, crime, avail, lock, stage, *run(ctx) })`;
`T` is the toolkit from `gags.js`, destructured at the top of every file (keep that header as it is). The reference
scene is **`acts/burglar.js`**: read it before writing one. The storyboards are in `STORYBOARDS.md`.

A scene is a generator. `yield* something()` waits for it; `R.run(gen)` runs something alongside. Time is in seconds,
distances in metres, angles in radians.

## 1. The ground rules

1. **Storyboard first, beat by beat.** Every beat of the storyboard starts with `B('3 the grab', [thief, bag])`: a short
   label and the people/objects/points the viewer MUST be able to see during that beat. The audit measures exactly
   that list, so be honest with it: name who the beat is about. Order: `B(...)` first, then the `cam.*` shot, then the action.
2. **Show it, then hold it.** A beat the viewer has to read lasts at least 0.8 s. After a cut, leave 0.3 s before the
   action. Never let the key action of a beat happen in the same frame as a cut to a new shot.
3. **Every beat needs acting**: a face (`a.mood`), where they look (`a.lookAt`), what the arms do (`a.arms`), and
   weight (`a.squash()`, `leap`, `tumble`). Villains gloat (`laugh`), victims react (`fright`, `doubleTake`).
4. **One `rig`, one `try/finally`.** Everything spawned goes through `R` (see below); `finally { cam.release(); R.free(done); }`.
   A scene must clean up on every exit and must play correctly without the camera (`cam` can be inert).
5. **Fit the real street.** Never assume a door, window, pavement or road. Ask `S.*` (setting.js) and put the answer
   in `avail(ctx)` so the director only picks the scene where it fits. Cache terrain questions with `once(ctx, 'key', fn)`.
   Keep everybody within `EX0..EX1` (x from -23.5 to 23.5).
   **Declare the free ground you use** with `stage:` (section 2b): a scene that has no room on a spot is not played there.
   Nothing may clip: the walking helpers go round parked cars, shelters, terrace tables and lamp posts by themselves, but only
   if the ground you chose is free to begin with, so choose it with `ctx.stage` / `S.findStage`, never by guessing.
6. **Tone:** slapstick. No blood, no weapons, nothing aimed at real people or groups. Speech bubbles are short Dutch
   (Hague) exclamations, the news ticker (`ctx.news`) is dry English. Call `ctx.incident(n)` once when the crime happens.
7. **No Math.random in scenes**: use `rnd` (`ctx.rnd`): `rnd()`, `rnd.range(a, b)`, `rnd.pick(arr)`, `rnd.chance(p)`, `rnd.sign()`.
   For a coin flip that picks the ending use `flip(ctx, 'name', p)` so the audit can force either ending.
8. Do not edit files outside your own scene file(s) unless told to. If the toolkit lacks something, build it locally in your file.
9. **Nothing appears or vanishes in view.** People and vehicles come on and go off through `R.enter` / `R.out` (section 3b): they
   walk or drive in from out of the frame (or a real door) and leave the same way. `popIn` / `popOut` are only for things that are
   MEANT to appear by magic or effect: a cloud of smoke, a prop pulled from a pocket, a wad of cash.

## 2. Street space

`x` runs along the street (−24..24 around the spot), `z` across it: **z < 0 is the far side with the house fronts,
z > 0 is the camera's side**, `y` is up from the ground. Headings: `0` faces the camera side (+z), `Math.PI` faces the
houses, `E` (+x) and `W` (−x). `a.heading = Math.atan2(dx, dz)`; `faceTo(a, x, z)`.

`ctx.L` (the cross-section and what stands here): `kind` ('minor' | 'major' | 'ped'), `hw` half road width, `bw` bike lane
width, `chaseZ` (z of the driving line), `bikeF` / `bikeB` (z of the cycle line each side), `night`,
`houses` / `shops` (`{ x, w, z, top, door: { x, z }, win: { x, y, z }, shop }`), `racks`, `benches`, `bins`, `parked`
(`{ x, z }`), `lamps`, `stalls` (`{ x, z, label }`), `atm` (`{ x, z, zH }` or null).
Pavement lines: `padZ(ctx, 'walkB0' | 'walkB1' | 'walkF0' | 'walkF1', x)` (B = house side, F = camera side; B1 and F0 are the kerb-side lines).

`S` (setting.js): `S.clearSpot(ctx, x, z, r, { ground: 'open' })`, `S.findSpot(ctx, x, z, r, tries)` (or null),
`S.runway(ctx, x, z, dir, max, r)` (x of the last clear metre going `dir`), `S.lineClear(ctx, x0, z0, x1, z1)`,
`S.roadHere(ctx, z, from, to, need)` (is there road along this line), `S.housesNear(ctx, x, maxDist, { door, shop, tower })`,
`S.houseNear`, `S.benchNear(ctx, x, maxDist)`, `S.surroundings(ctx)`. Toolkit: `spotNear(ctx, x, z)` (never null),
`padSpot(ctx, 'walkF1', x)` (clear spot on a pavement line, or null).

### 2a. The obstacle picture, and `ignore`

Every spot has one picture of what STANDS there, in street space (`S.obstacles(ctx)`, built lazily, cached): parked cars (three
circles each), lamp posts, every prop in the tiles' `props` lists (furnish.js): bins, benches, bike racks and big bike parks,
mailboxes, transformer boxes, terraces with tables, beach parasols, picnic tables, market and herring stalls, kiosks, advertising
columns, MUPIs, parking meters, underground-bin posts, charging posts, trolley shelters, tram masts, traffic lights, and, listed
after the anchors, the tram and bus shelters (kind `stop`, furnish's own and the map's), planters (one per box) and the map's
statues and fountains; each with a footprint radius and height from ONE table, `S.FURN` (kind -> [height, radius]; unknown
kinds count as 1.1 x 0.6; add new kinds there; a statue or fountain is one circle of the table's size, not its own, so a wide
basin is bigger than its circle), and, when the crowd offers `ctx.crowd.obstacles`, the standing groups and waiting vehicles.
NOT in it (drawn, but not in `props`), e.g.: bollards, quay posts and chains, street-name signs, poles, flagpoles, sport-pitch
goals, playgrounds and their fences, fuel-station canopies and the map's other point features. Many of the map's shelters stand
on the tram bed or the road (a platform in the middle of the street), so they are in the way of road scenes too.
Buildings, water and tree trunks are checked as before. `clearSpot`, `findSpot`, `spotOr`, `nudge`, `runway`, `lineClear`,
`roadHere` and the new `S.route`, `S.laneClear`, `S.laneFor` all respect it. A thin post (lamp, pole) only needs a person's
width beside it; `runway` lets a post on the line pass when there is 0.7 m to go round it (the walking helpers do).

**`ignore`**: if your scene is deliberately AT a thing (the bin it tips over, the car it breaks into, the rack it cuts a bike
from), pass it: `S.clearSpot(ctx, x, z, 0.6, { ground: 'open', ignore: [bin] })` (also `findSpot`, `nudge`, `runway`, `lineClear`,
`roadHere`, `route`). An entry is an anchor (`L.bins[i]`, `L.parked[i]`, `L.racks[i]`: `{ x, z }`), an actor, or `[x, z]`; whatever
stands within 2 m of it (or within its `r`) is left out. Whatever already touches the START of a `runway`/`lineClear`/`go`/`chase` is left
out automatically (you start next to the bench you walk away from), and so is whatever touches the goal of a `go`. For movement
helpers pass `ignore` in the last argument, `go(ctx, a, x, z, speed, 0.06, { ignore: [bin] })`, or set `a.ignore = [bin]` once.
`opt.obst === false` skips the standing things altogether.

### 2b. The stage declaration: `stage:` and `ctx.stage`

A scene file exports `{ w, crime, avail, lock, need, stage, *run }`. `need` is an optional list of street-furniture lists of `ctx.L` (`['racks']`, `['bins']`, `['parked']`, `['benches']`): the scene is only offered on a spot where every one of them has at least one entry, checked before `avail` (`ready()` in gags.js). `stage` says what free ground the scene uses, as data:

```js
stage: { pave: { side: 'near' | 'far' | 'any', len, depth },  // len metres of walkable ground at least `depth` metres wide (default 4 x 2)
         road: { len },                                       // a clear stretch of carriageway for a car (a 1.9 m lane, nothing in it)
         cross: true,                                         // a clear line across the road between the two pavements, near the strip
         anchor: 'door' | 'home' | 'shop' | 'rack' | 'bench' | 'bin' | 'parked' | 'stall' | 'fish' | 'atm' | null, reach: 12 }  // near one of the spot's anchors
// ('home' = an ordinary front door with a modelled leaf, 'shop' = a shop unit's door, 'fish' = a HARING / VIS / FRIET stall)
```

Without `stage` the director assumes `DEFAULT_STAGE` (a clear 4 x 2 m patch of pavement on either side); `stage: false` = needs nothing.
`ready()` asks `S.stageClear(ctx, need)`: a scene that fits nowhere on a spot is not played there, the director picks another
scene, and the other spots of the street have their own directors (that is how a scene "moves"). Just before `run`, the director
sets **`ctx.stage = { x, side ('near' | 'far' | null), room (metres of clear run), lane (z of a free driving line, with `road`) }`**:
the placement with the most room. Centre the scene on it; read it before your first `yield` (two scenes can share a spot at the
busy levels and the next one overwrites it); treat a missing `ctx.stage` as "the middle". Two examples:

```js
// a thief who cuts a bike from a rack and rides off along the pavement: a rack, 8 m of clear pavement on its side
stage: { pave: { side: 'far', len: 8, depth: 1.2 }, anchor: 'rack', reach: 10 },
// a car chase and a police car crossing: 16 m of free carriageway, and a way across for the people who scatter
stage: { road: { len: 16 }, cross: true },
```
`S.findStage(ctx, need, avoid)` / `S.stageClear` are in setting.js if you want to ask for something else (cached per spot and need).
The scan never places a stage within 6 m (along the street) of a building that stands in the street's own ground on the
camera's side (a block that juts into a square, a pavilion, an old house forward of its row: `S.jutNear(ctx, x)`). The
camera films from that side, so a scene there is seen through the building or round it. `takePed` does not hand out a
passer-by who walks there either. Ordinary streets have no such buildings; on a square it moves the scene to open ground.
The needs are your assumptions written down: a scene that runs 10 m along a pavement says `len: 10`. `depth` is the width of the
walkable corridor the scene truly needs, not a wish: one person about 0.8 m, two side by side 1.6 m (a real Dutch pavement is 2 to
2.5 m with a lamp post every 27 m, and a terrace or a shelter takes most of it). The scan looks for that corridor anywhere on the
chosen side (across the whole width of a pedestrian street or square, `L.kind === 'ped'`, where 'near' and 'far' overlap), and a thin
post only splits it; furniture, terraces and parked cars still block, so there is no scene on a terrace or between parked cars.
The scene's own `avail` still has to check the positions it really uses: the stage only says whether the ground is there.

### 2c. Other spot facts

`ctx.inView(x, z, y = 1, margin = 0.08)` is true when that street-space point is inside the camera frame now; `ctx.watched()`
is true when the viewer is looking at this spot. (The toolkit's `T.seen` / `T.watching` wrap them and treat a missing one as
"yes".) `ctx.stageMode('flee' | 'watch')` tells the crowd around the scene to run from it or to stop and look. Vehicles: `S.laneClear(ctx,
z, x0, x1, halfWidth)` (is a driving line free: road under it, nothing standing within `halfWidth`), `S.laneFor(ctx, dir, x0, x1)` (the z of a free
driving line for traffic going `dir`, or null: use it instead of `L.chaseZ` when you can), `S.route(ctx, x0, z0, x1, z1)` (the walking route
the helpers use: `{ pts, ok, straight }`), `S.bend(ctx, points, { half })` (a driving line bent round parked cars, or null).

## 3. The rig `const R = rig(ctx)`

`yield* R.enter(actor, x, z, y?, opts?)` bring on stage (section 3b) · `R.spawn(actor, x, z, y?)` put it there at once (only for things
out of view) · `yield* R.out(a, opts?)` take off stage (3b) ·
`yield* R.leave(a, speed, toX?)` walk off the spot and on out of the frame · `yield* R.away(a, dx, speed)` walk a few metres, then on out of the frame ·
`R.add(object3d)` / `R.rm(o)` a prop in street space (`o.position.set(x, y, z)`) · `R.stay(o)` survives a normal finish ·
`R.run(gen)` / `R.stop(task)` · `yield* R.settle(maxSeconds)` wait for running tasks (stop endless ones first!) ·
`yield* R.close()` closes the road to traffic and waits for it to clear, `R.open()` ·
`R.gone(a)` removes an actor at once, wherever it is (only for something out of view or meant to vanish; `R.out` is the normal way off) ·
`R.borrow(p)` / `R.give(p)` a passer-by from the crowd (`takePed(ctx, xr, null, cx)` or `yield* needPed(ctx, xr)`; `gather(ctx, R, x, n)` gives up to n onlookers; `filmIt(p, x, z)` makes one film with a phone) ·
`extraKind(ctx)` the kind ('niffo' | 'harry' | 'civ') for an extra YOU invent, weighted by `ctx.district.pop` (use it in `makePerson(rnd, { kind: extraKind(ctx) })`; the toolkit's own `spawnPed`/`needPed`/passer-by `resident` already do) ·
`fatbike(ctx, R, x, z, { passenger })` a spawned electric fat-bike with a rider (and a passenger if `passenger: true`) on it, returns `{ bike, rider, passenger }`; move it with `go`/`drive`/`rideTo`-style code, the rig cleans it up ·
`R.panic(x, r, n)` bystanders flee · `yield* R.police(dir, z, speed, delay)` a police car crosses (siren first, then it drives in from out of
the frame along a free lane, and out again; no free lane, no car) · `yield* R.cop(target, speed, delay, line)` a foot cop runs in from out of the frame, chases and runs on out.

### 3b. Entrances and exits: nothing appears or vanishes in view

`yield* R.enter(a, x, z, y, opts)` returns when `a` stands at (x, z). If the spot is not being watched, or the point is out of
view, `a` just stands there (no scale-up pop). In view it comes in from somewhere that explains it, in this order:

1. a real front door close by: `opts.from = 'door'` (or `y = 0.001`, or a point within 1.2 m of a door): it steps out of the door;
2. the nearest point outside the frame along the line it is on (pavement line or lane): it walks or drives in at a brisk pace, round
   things, like `go`; `opts.dir` = the way it travels when it arrives (+1 / -1) picks the side, **give it for cars**, so that `car.face(E)`
   afterwards does not flip it on screen;
3. from behind the nearest stall, kiosk or shelter big enough to hide it.

`opts`: `{ speed, from: 'edge' | 'door' | 'auto', dir, now, exact, ignore }`. `now` is for the rare script that needs an instant
appearance and only applies out of view. A `y` above 0.05 (a balcony, a bench) cannot walk in and still pops in by magic: avoid it, or
have the person come out of the door and walk to the spot. The actor is marked `a.offstage = true` until it has arrived; a beat that
lists it as a subject while it is outside the frame will pull the camera back (the stage is asked to skip `offstage` actors),
so name the point it is coming to rather than the actor, or start the beat when it is on.

`yield* R.out(a)`, `R.away(a, dx, speed)`, `R.leave(a, speed, toX)`: the actor walks, runs or drives on until it is out of the frame (and a
few metres beyond), or goes back in through the door it came out of, and only then is removed. If the camera keeps following it, it
carries on to the end of the playable range and is handed back to the crowd (`ctx.demote`) there, else keeps going: nobody vanishes in view.
A person on a balcony steps back through the window. When the scene ends normally, anybody still standing in view leaves the same way
by themselves. `R.police`, `R.cop`, `spawnPed`, `needPed`, `resident` and the four ambient gags use the same entrances and exits.

**Order "shot, then entrance".** Walking in takes longer than popping in (an entrance from a frame edge 14 m away is 4 to 5 seconds at
a walk). So: (1) cut to the shot that will show the arrival point *before* you call `R.enter` (a shot stays until the next one, so it
needs no length); (2) if the beat after depends on the arrival (a cop who must be standing there when the thief runs into him), start the entrance
earlier with `R.run(R.enter(...))` and `T.entryTime(ctx, a, x, z, opts)` (seconds it will take now, 0 when it is instant) and
wait for that, or pass `speed` (runners: 5 to 7); (3) the first beat of a scene is the shot of the place, the entrance is the second
half of it. In `burglar.js`: beat 1 cuts to `cam.wide(doorPt, ...)`, tight on the door, waits until that shot is up and then calls
`R.enter(rob, ...)` from the frame's edge; the track shot is cut after the entrance. In the busted ending the cop must be standing
there when the chase reaches him, so his entrance is started two beats earlier, in the background (`R.run` around `R.enter(cop, ...)`);
in the clean-away ending he only has to arrive late and walks in while the thief goes.

A short lead-in (the first beat should start within about 3 seconds): open on a tight shot of the place and let the first
entrance wait for it, so the frame edge is a few metres away, not fifteen:
`yield* waitUntil(() => T.seen(ctx, entryX, z) && !T.seen(ctx, entryX - dir * 16, z), 2)` before `R.enter(...)` (the arrival
point is in frame and a point 16 m up the street is not; it gives up after 2 s). When the camera cannot find a tight stand
(a house-side pavement behind parked cars) the shot stays wide and the wait costs its 2 seconds: that is the stage's
doing, not the script's. End a scene on its last line: no `R.settle(10)` to wait for walk-offs, the rig walks and
drives everyone out after the camera lets go.

The raw `popIn(ctx, a)` / `popOut(ctx, a)` stay in the toolkit for magic (smoke clouds, a prop pulled from a pocket); `T.exitOut`,
`T.enter` (the rig-free version) are there for scenes that do not use `R`.

### Real doors and windows

Nothing door-shaped is ever invented: a scene opens the building's own door. `doorHouse(ctx, x, maxDist, opt)` finds a
house record with a modelled door near x (or use one from `L.houses` / `L.shops`); `const d = doorway(ctx, R, house)`
gives that door as something you can open (null for a tower or a front without a modelled door; `R` shuts it when the
script ends), `windowAt(ctx, R, house)` the first-floor window.

- `yield* d.open()` / `yield* d.close()`: a dark opening where the real door is and a leaf of the real door's colour and
  size swung out on its hinge; closed, nothing extra shows. `d.force()` for a kicked or jemmied door.
- `yield* d.passOut(actor, speed, z1)` / `yield* d.passIn(actor, speed)`: the person starts behind the wall, is seen in
  the dark doorway, and steps over the threshold (or goes back in). `d.out`, `d.inside`, `d.at(lx, lz)`, `d.heading`.
- `d.bell`, `d.bellStand`, `yield* d.press()` (no argument; the button lights for a moment): the real bell plate beside the door and where to stand to ring it.
- Windows: `d.pose(actor, u)` stands the person inside (u = 0) or leaning out over the sill (u = 1), `yield* d.retreat(actor)`.
- `R.enter(a, x, z, 0, { from: 'door' })` and `R.out(a)` of someone who came from a door use the same doorway.
  Careful: a point within 1.2 m of ANY door counts as that door. For someone who must not come out of a neighbour's
  house (a thief, a cop, a kid) pass `{ from: 'edge' }`.
- `resident(...)` uses all of this (its return value has `doorway` and `window`); `fatbike()` also returns `arrive`, the
  ride-in to wait for.

## 4. Moving people

`yield* go(ctx, a, x, z, speed)` · `yield* goEach(ctx, a, x, z, speed, (dt) => {...})` (return true to stop) ·
`yield* chase(ctx, a, target, speed, stopDist, timeout)` · `yield* tiptoe(ctx, a, x, z, speed)` (creeps, looks over both shoulders half-way) ·
**These go round things.** When the straight line meets a parked car, a bus shelter, a terrace table or a lamp post, they take a short
detour (worked out once per call, a `chase` looks again four times a second) at the same speed, keeping 0.3 m off everything; if there is no
way they stop at the last clear point of the straight line instead of walking through. Same signatures; the last argument of `go`/`goEach`/`chase`
is an options object `{ ignore: [things you are AT], straight: true (no detour) }`, or set `a.ignore`. Flying things and `air` actors walk straight.
Ground and water are still your business: choose the line with `ctx.stage` / `S.runway` / `S.lineClear`. `walkOff`, `leave`, `R.away`, `stroll` (passers-by sidestep what stands ahead) do the same.
`yield* leap(ctx, a, x, z, height, dur, y1 = 0)` (crouch, arc, squash landing; `y1` > 0 lands on something, leaves `a.air = true`) ·
`yield* tumble(ctx, a, x, z)` (knocked flying, ends sitting with stars: follow with `yield* getUp(a, mood)`) ·
`yield* hop(a, h, dur)` · `yield* lookAround(a)` · `yield* doubleTake(ctx, a, 'HÈ?!')` · `yield* fright(ctx, a, 'OEPS')` ·
`yield* laugh(ctx, a, seconds, 'ha' | 'he')` (HA HA HA with the whole body; `cackle(ctx, a, seconds)` does not wait; works while running) ·
`yield* seeStars(ctx, a, seconds)` · `R.run(noteTrail(ctx, a))` banknotes flutter from a runner's bag · `R.run(runDust(ctx, a))`.
Walking ~1.6–2.6 m/s, hurrying 3.5–4.5, running 5.5–7.5 (above 4.5 the run cycle kicks in).
A person standing on something or flying: set `a.air = true` and `a.g.position.y` yourself.

## 5. Acting: `makePerson(rnd, { kind, scale, shirt, pants, hair, hat })`

kinds: `civ cop robber raccoon kid granny hoodie chef niffo harry`. `niffo` is a teenager in a beige/brown tracksuit (green-red stripe down sleeves and legs, no lettering; cap or hood, pouch, white trainers) whose plain `walk` is a swagger; `harry` is a Hague mullet man (short on top, long at the back, sometimes a moustache, dark jacket with a herring badge, jeans, boots). Skin is random for both. Fields you set (they ease in):

- `a.arms`: `swing` (default) `up` (panic) `carry` `fist` `hold` `wave` `sneak` `spray` `bag` (hand at the shoulder holding a slung sack) `laugh` `point` `shrug` `cheer` `hips` `cover` (hands over head/ears) `push` `drive` `facepalm` `phone` `count` (counting notes) `rub` (rubbing hands) `reach` `drag` `cross` `beg` `stop` (halt hand) `write`
- `a.mood`: `neutral happy laugh smug sly angry shock scared sad dizzy sleepy focus whistle`; `a.emote('shock', 1.2)` for a passing one.
- `a.lookAt = actor | { x, z } | null` (head and eyes turn), `a.nodT = 1` / `a.shakeT = 1` (seconds of yes / no).
- `a.gait`: `walk sneak strut stagger` · `a.pose`: `null sit ride crouch` (an animal from `makeDog`/`makeCat` also has `'sleep'`: it lies curled up and breathes) · `a.talk` is set by `say()`.
- `a.squash(0.25)` one bounce of squash and stretch. `a.heading`, `a.face(h)` (instant).
- `say(ctx, a, 'TEKST', { size, color, dur })`, `yell(ctx, a, 'TEKST', color, size)`; text at a point: `ctx.fx.text('BONK!', at(x, y, z), { size, color })`. Size 20+ is a punchline (the camera nudges to it).
- Holding: `a.hold(obj)` right hand, `a.hold(obj, 'handL' | 'front' | 'back' | 'head' | 'shoulder')`, `a.drop()` returns it (to put it somewhere else); `R.discard(a)` lets go and frees it for good, for a thing nothing uses again (a new `hold` frees the old thing the same way). `shoulder(a, item.moneybag())` slings a bag and raises the arm.
- `item.*`: `moneybag(scale)` (the € swag bag) `wad` `crowbar` `torch` `pad` `megaphone` `lollipop` `cuffs` `fries` `balloon(col)` `spray` `wafel` `purse` `tv` `wallet` `ticket` `bomb` `can` `phone` `rod` `cutters` `broom` `nightcap` `bumper` `paper` `radio` `shoe`.
  Your own props: `sculpt((v) => { v.box(x, yBottom, z, w, h, d, '#colour'); })`, glowing: `sculpt(fn, MAT.glow)`, both: `piece((v, gl) => {...})`.
- Animals: `makeDog(rnd)`, `makeCat(rnd)`, `makeBird(rnd, 'gull' | 'pigeon')` (`a.fly = true`, move with a tween).

## 6. Vehicles: `makeCar(rnd, 'car' | 'police' | 'van' | 'taxi', L.night)`, `makeScooter(rnd, [riders])`, `makeFatbike(rnd, [riders])`, `makeBike(rnd)`

`makeFatbike` is an electric fat-bike like the scooter (1.75 m, 4 inch tyres, long bench for two, big round headlight; riders passed in sit on it as part of it, `bike.riders`); for a separate rider use `mount(bike, rider)` (it reads `bike.seatY`).

Enter with `yield* R.enter(car, x, z, 0, { dir: 1 })` (it drives in from out of the frame heading the way you say) then `car.face(E)`. A car is 4.4 m long (`car.len`, `car.wid`). The body sits
on springs: it **rolls in bends, dives when braking and squats when accelerating by itself** from how you drive it.

- `yield* go(ctx, car, x, z, speed)` straight line (bent round parked cars; stops at the last clear point when there is no line) · `yield* drive(ctx, car, [[x, z], ...], speed | (u) => speed, { drift: 0..1, each, ignore, free })` a smooth curve through points; lays rubber and smoke where it corners hard. **For cars `drive` keeps the line on the carriageway and half a car width off everything that stands: it bends the curve round parked cars, shelters and the like, and where no such line exists it does NOT move and returns `false`**, so write `if (!(yield* drive(...))) { /* another branch */ }`; it returns `true` when it has arrived. `ignore: [the car you hit]` for a deliberate crash; `free: true` drives the points exactly as given (use sparingly). Scooters and bikes are not bent. Find the line first: `const z = S.laneFor(ctx, dir, x0, x1)` (null = no free lane: do not stage the drive) or `ctx.stage.lane`, and `S.laneClear(ctx, z, x0, x1)`.
- `yield* handbrake(ctx, car, slide = 7, dur = 1.15, turn = Math.PI, side = 1)` swaps ends while sliding on, leaning, smoking.
- `car.jolt(pitch, side)` knock the springs (0.5 = a kerb) · `car.lean = 0.2` hold a lean by hand · `skid(ctx, car)` marks + smoke this frame · `exhaust(ctx, car, n)`.
- `car.siren = true` (police) · `car.hazard = true` (indicators) · van: `van.doors = 1` opens the back doors (0 closes).
- Speeds: cruising 8, fleeing 13–15. Brake to a stop by tweening the speed down, never by teleporting.
- Close the road first (`yield* R.close()`) when a scripted car uses it, declare `stage: { road: { len } }` and check `S.roadHere(ctx, L.chaseZ, x0, x1, 0.8)` in `avail`.
- A car's body sits on the road: it tilts on its springs (pitch, roll, `jolt`, `lean`), and the body is lifted exactly as far as a tilted corner would dip below the ground.

## 7. The camera `const cam = camFor(ctx, 'sceneName')`

A shot follows its subject until the next shot.

**Shots are binding (the camera rules, `stage.js`).** Every shot has a purpose, a minimum length and a motivated cut.
- *A shot never expires.* It stays until you ask for the next one or call `cam.release()` (or the scene ends). There is no
  `hold` option: a shot's length is the time until the scene asks for the next one.
  The only timer left is a safety net for a scene that hangs: 20 s after the last shot or `B(...)` beat the stage releases the
  camera once and logs a warning (the audit counts it as `expired`, which must be 0). If a shot's subjects leave the world the
  last picture is held.
- *Minimum shot length 0.9 s.* A `cam.*` call that comes sooner than 0.9 s after the last cut is queued inside the stage (the
  script does not block; if several arrive the latest wins) and shows when the 0.9 s are up. `quick: true` cuts at once, and a
  glide (`cut: seconds`) is never deferred. Do not rely on two shots 0.2 s apart: the first never shows.
- *The stand is decided once* when the shot starts (walls, parked cars, furniture, lamp posts, trunks, bystanders, statues and
  shelters; never under a terrace parasol or inside a market stall or kiosk), then kept. If the sight line then stays blocked
  for 0.7 s (`BLOCKED_FOR`) the stand is decided again, with a 0.5 s glide. This can repeat for as long as the shot lasts, but
  never sooner than 2 s after the last decision (`noRe`, `RECONSIDER`); failing a clear stand the camera goes
  high and wide the same way, and comes back down after 1 s of clear view. The cutaway of the buildings follows that
  decision, not the passing sight line.
- *Motivated cuts.* A shot whose view is nearly the last shot's (angle within 30 degrees, distance within 30%, target within 3 m;
  the subjects are not compared) glides instead of cutting. A cut that would cross the line between two characters the last shot showed (the 180 degree
  rule) is mirrored to the same side, unless the shot has `from` (you asked for the over-the-shoulder side) or `free`.
- *Fitting the beat's subjects* eases in and out: the camera starts backing off when somebody is outside 97% of the frame and
  comes back when everybody is inside 85%.

Helpers on `ctx` for entrances and exits: `ctx.inView(x, z, y = 1, margin = 0.08)` (is this street-space point inside the
camera's picture, camera within 250 m; positive margin grows the frame), `ctx.watched()` (is this spot what the viewer looks
at), `ctx.stageMode('watch' | 'flee' | ...)` (how the crowd treats the stage while this scene holds the camera). `on` = an actor, an array of actors, or a point `pt(x, z)` / `{ x, z, y }`.
Options on every preset: `{ dist, el, az, y, fov, roll, cut (seconds: glide instead of cutting), quick, drift: { az, el, dist, fov }, lead, shake, fit, face, back, from, free }`.
`az`: 0 = straight across from the camera side, ±1.5 = looking along the street (camera at the +x / −x end). `el`: 0 = eye level.

| Preset | Use it for |
|---|---|
| `cam.wide(on)` | establishing, and the last shot |
| `cam.two(a, b)` | two people, both in frame (fits the distance to them) |
| `cam.track(on, { lead })` | running alongside someone |
| `cam.close(on)` / `cam.face(on)` | a face (medium / filling the frame) |
| `cam.hero(on)` | the villain, from knee height, tilted |
| `cam.low(on)` | low angle, less extreme |
| `cam.crash(on)` | crash zoom on a reaction |
| `cam.dolly(on)` | slow push-in while something builds |
| `cam.orbit(on)` | circling a stand-off |
| `cam.dutch(on)` | tilted: things go wrong |
| `cam.ground(on)` | at kerb height: things on the ground, wheels |
| `cam.high(on)` / `cam.top(on)` | from above: a chase pattern, a pile-up |
| `cam.nose(car, dir)` | a vehicle coming at the lens (`dir` = its direction of travel, ±1) |
| `cam.chase(car, dir)` | rolling alongside a vehicle, hand-held |
| `cam.ots(from, to)` | two people facing each other, side-on |
| `cam.shot({ on, ... })` | anything else |

**The camera keeps a beat's subjects in the picture.** Whoever you list in `B(...)` stays in frame: if the shot you asked
for would cut one of them off, the camera backs off and turns just far enough to hold them all (a shot that already
holds them is untouched). So list only who the beat is really about: listing someone 20 m away turns your close-up
into a wide. A shot that must stay exactly as written takes `free: true`.

`cam.card('DE INBREKER', 'One dry English line.', 2)` the culprit's title card (once, at the reveal) ·
`cam.freeze(0.7)` a held frame · `ctx.shake(0.3)` · `ctx.slowmo(0.25, 0.5)` · `ctx.flash('#fff', 0.4)`.
Use at least five different shot types in a scene and change shot at every beat. A face that matters gets a `close`/`face`/`hero`.
For several subjects pass them all with `fit: true`. Keep `dist` ≥ 5 for a person's full body.

## 8. Effects and sound

`ctx.fx.*(x, y, z, ...)`: `puff` `smoke(x, y, z, n, colours, size)` `dust(x, y, z, vx, vz, n)` `burst(x, y, z, { n, colors, speed, up, size })`
`cash(x, y, z, n, speed, up)` `sparks(x, y, z, n)` `shards(x, y, z, n, speed)` (glass) `pips(x, y, z, n, colours)` (stars, sweat)
`confetti` `fireball(x, y, z, scale)` `firework(x, y, z)` `mark(x, 0, z, angle, { w, l })` (stays on the ground).

`ctx.sfx('name')`: `pop thud slam yoink boing hey bell ding dingdong whistle coin honk squawk bark spray snip fuse alarm
siren skid boom rocket pang splash chop zzz typing reel glass bonk sting gasp clatter laugh snigger rev screech crash
kaching door womp tada tick swish gulp cuff meow whoosh`.

## 9. Checking your work

You cannot see the picture. Check what you can: `node --check src/voxel/acts/<file>.js` and `npx vite build` must pass
(run the build from the repo root). Re-read your scene once as a viewer: for every beat, is the subject list right, does
a shot start before the action, is every spawned thing removed, does every branch reach `done = true`? The orchestrator
runs the visual audit afterwards.
