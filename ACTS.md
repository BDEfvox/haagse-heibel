# Writing a crime scene (`src/voxel/acts/*.js`)

Every crime cutscene is one file in `src/voxel/acts/`. It exports a factory `(T) => ({ w, crime, avail, lock, *run(ctx) })`;
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
6. **Tone:** slapstick. No blood, no weapons, nothing aimed at real people or groups. Speech bubbles are short Dutch
   (Hague) exclamations, the news ticker (`ctx.news`) is dry English. Call `ctx.incident(n)` once when the crime happens.
7. **No Math.random in scenes**: use `rnd` (`ctx.rnd`): `rnd()`, `rnd.range(a, b)`, `rnd.pick(arr)`, `rnd.chance(p)`, `rnd.sign()`.
   For a coin flip that picks the ending use `flip(ctx, 'name', p)` so the audit can force either ending.
8. Do not edit files outside your own scene file(s) unless told to. If the toolkit lacks something, build it locally in your file.

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

## 3. The rig `const R = rig(ctx)`

`yield* R.enter(actor, x, z, y?)` pop in · `R.spawn(actor, x, z, y?)` no pop · `yield* R.out(a)` pop away ·
`yield* R.leave(a, speed, toX?)` walk off the spot · `yield* R.away(a, dx, speed)` walk a few metres and pop ·
`R.add(object3d)` / `R.rm(o)` a prop in street space (`o.position.set(x, y, z)`) · `R.stay(o)` survives a normal finish ·
`R.run(gen)` / `R.stop(task)` · `yield* R.settle(maxSeconds)` wait for running tasks (stop endless ones first!) ·
`yield* R.close()` closes the road to traffic and waits for it to clear, `R.open()` ·
`R.borrow(p)` / `R.give(p)` a passer-by from the crowd (`takePed(ctx, xr, null, cx)` or `yield* needPed(ctx, xr)`; `gather(ctx, R, x, n)` gives up to n onlookers; `filmIt(p, x, z)` makes one film with a phone) ·
`R.panic(x, r, n)` bystanders flee · `yield* R.police(dir, z, speed, delay)` a police car crosses · `yield* R.cop(target, speed, delay, line)` a foot cop chases.

## 4. Moving people

`yield* go(ctx, a, x, z, speed)` · `yield* goEach(ctx, a, x, z, speed, (dt) => {...})` (return true to stop) ·
`yield* chase(ctx, a, target, speed, stopDist, timeout)` · `yield* tiptoe(ctx, a, x, z, speed)` (creeps, looks over both shoulders half-way) ·
`yield* leap(ctx, a, x, z, height, dur, y1 = 0)` (crouch, arc, squash landing; `y1` > 0 lands on something, leaves `a.air = true`) ·
`yield* tumble(ctx, a, x, z)` (knocked flying, ends sitting with stars: follow with `yield* getUp(a, mood)`) ·
`yield* hop(a, h, dur)` · `yield* lookAround(a)` · `yield* doubleTake(ctx, a, 'HÈ?!')` · `yield* fright(ctx, a, 'OEPS')` ·
`yield* laugh(ctx, a, seconds, 'ha' | 'he')` (HA HA HA with the whole body; `cackle(ctx, a, seconds)` does not wait; works while running) ·
`yield* seeStars(ctx, a, seconds)` · `R.run(noteTrail(ctx, a))` banknotes flutter from a runner's bag · `R.run(runDust(ctx, a))`.
Walking ~1.6–2.6 m/s, hurrying 3.5–4.5, running 5.5–7.5 (above 4.5 the run cycle kicks in).
A person standing on something or flying: set `a.air = true` and `a.g.position.y` yourself.

## 5. Acting: `makePerson(rnd, { kind, scale, shirt, pants, hair, hat })`

kinds: `civ cop robber raccoon kid granny hoodie chef`. Fields you set (they ease in):

- `a.arms`: `swing` (default) `up` (panic) `carry` `fist` `hold` `wave` `sneak` `spray` `bag` (hand at the shoulder holding a slung sack) `laugh` `point` `shrug` `cheer` `hips` `cover` (hands over head/ears) `push` `drive` `facepalm` `phone` `count` (counting notes) `rub` (rubbing hands) `reach` `drag` `cross` `beg` `stop` (halt hand) `write`
- `a.mood`: `neutral happy laugh smug sly angry shock scared sad dizzy sleepy focus whistle`; `a.emote('shock', 1.2)` for a passing one.
- `a.lookAt = actor | { x, z } | null` (head and eyes turn), `a.nodT = 1` / `a.shakeT = 1` (seconds of yes / no).
- `a.gait`: `walk sneak strut stagger` · `a.pose`: `null sit ride crouch` · `a.talk` is set by `say()`.
- `a.squash(0.25)` one bounce of squash and stretch. `a.heading`, `a.face(h)` (instant).
- `say(ctx, a, 'TEKST', { size, color, dur })`, `yell(ctx, a, 'TEKST', color, size)`; text at a point: `ctx.fx.text('BONK!', at(x, y, z), { size, color })`. Size 20+ is a punchline (the camera nudges to it).
- Holding: `a.hold(obj)` right hand, `a.hold(obj, 'handL' | 'front' | 'back' | 'head' | 'shoulder')`, `a.drop()` returns it. `shoulder(a, item.moneybag())` slings a bag and raises the arm.
- `item.*`: `moneybag(scale)` (the € swag bag) `wad` `crowbar` `torch` `pad` `megaphone` `lollipop` `cuffs` `fries` `balloon(col)` `spray` `wafel` `purse` `tv` `wallet` `ticket` `bomb` `can` `phone` `rod` `cutters` `broom` `nightcap` `bumper` `paper` `radio` `shoe`.
  Your own props: `sculpt((v) => { v.box(x, yBottom, z, w, h, d, '#colour'); })`, glowing: `sculpt(fn, MAT.glow)`, both: `piece((v, gl) => {...})`.
- Animals: `makeDog(rnd)`, `makeCat(rnd)`, `makeBird(rnd, 'gull' | 'pigeon')` (`a.fly = true`, move with a tween).

## 6. Vehicles: `makeCar(rnd, 'car' | 'police' | 'van' | 'taxi', L.night)`, `makeScooter(rnd, [riders])`, `makeBike(rnd)`

Enter with `yield* R.enter(car, x, z, 0)` then `car.face(E)`. A car is 4.4 m long (`car.len`, `car.wid`). The body sits
on springs: it **rolls in bends, dives when braking and squats when accelerating by itself** from how you drive it.

- `yield* go(ctx, car, x, z, speed)` straight line · `yield* drive(ctx, car, [[x, z], ...], speed | (u) => speed, { drift: 0..1, each })` a smooth curve through points; lays rubber and smoke where it corners hard.
- `yield* handbrake(ctx, car, slide = 7, dur = 1.15, turn = Math.PI, side = 1)` swaps ends while sliding on, leaning, smoking.
- `car.jolt(pitch, side)` knock the springs (0.5 = a kerb) · `car.lean = 0.2` hold a lean by hand · `skid(ctx, car)` marks + smoke this frame · `exhaust(ctx, car, n)`.
- `car.siren = true` (police) · `car.hazard = true` (indicators) · van: `van.doors = 1` opens the back doors (0 closes).
- Speeds: cruising 8, fleeing 13–15. Brake to a stop by tweening the speed down, never by teleporting.
- Close the road first (`yield* R.close()`) when a scripted car uses it, and check `S.roadHere(ctx, L.chaseZ, x0, x1, 0.8)` in `avail`.

## 7. The camera `const cam = camFor(ctx, 'sceneName')`

A shot follows its subject until the next shot. `on` = an actor, an array of actors, or a point `pt(x, z)` / `{ x, z, y }`.
Options on every preset: `{ dist, el, az, y, fov, roll, hold (seconds, default 4: always set it longer than the beat), cut (seconds: glide instead of cutting), drift: { az, el, dist, fov }, lead, shake, fit, face, back }`.
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
kaching door womp tada tick swish gulp cuff meow`.

## 9. Checking your work

You cannot see the picture. Check what you can: `node --check src/voxel/acts/<file>.js` and `npx vite build` must pass
(run the build from the repo root). Re-read your scene once as a viewer: for every beat, is the subject list right, does
a shot start before the action, is every spawned thing removed, does every branch reach `done = true`? The orchestrator
runs the visual audit afterwards.
