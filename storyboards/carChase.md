# carChase: Reckless driving: the chase

**Setup:** a hatchback is flashed doing 94 in a 30 and does not care. **Trigger:** the flash and the siren: a police car turns up behind him, so he slaloms and spins round. **Payoff:** he is boxed in by two police cars and either gets a ticket or runs for it; three cars leave in an order that needs no room they do not have.

A speeder tears down the street, slaloms, pulls a handbrake turn in a cloud of tyre smoke, and then the street decides what happens, because the scene measures it first (free driving lines across the whole stretch, kept a body's width off parked cars, furniture and kerbs).

- **Cast and props:** speeder's hatchback (driver: hoodie), two police cars, one cop on foot (the second car's partner stays inside). Props: a hubcap, a ticket pad. Nobody is a real person or group.
- **Needs at the spot:** `stage: { road: { len: 34 }, cross: true }`: 34 m of free carriageway, centred on `ctx.stage.x`. Road closed to traffic for the duration: closed before beat 1 (waits up to 6 s for the stretch to clear), reopened when the scene ends or is cancelled.
- **Pacing:** Ends on the empty street after a short hold; the cars that are still leaving are driven off by the rig.
- **The manoeuvre is chosen by the room there is** (`ctx.rnd`, or forced in the audit with `stage.force = { pass: true }` etc.):
  - **pass:** two free lines at least 0.6 m apart between bodies (planned 0.85 m) and a free circle for the turn: he comes back past the standing police car.
  - **squeeze:** two free lines just over a body's width apart: he creeps past at walking pace, sparks, both cars hold their breath.
  - **reverse:** one free lane only (a tight or parked-up street): no turn, no passing. A police car comes head-on, he stands on the brakes and backs away flat out with it on his bumper, until a second car blocks him from behind.
- **Endings** (`flip 'bolts'`): ticket on the windscreen, or he bolts on foot and the cop gives up and takes the car as evidence. If there is no clear ground beside the cars, nobody can get out and everybody leans on the horn.

| Beat | What happens | Must be seen | Shot |
|---|---|---|---|
| 1 the speeding | The car drives in from out of frame. A speed-camera flash, FLITS! and "94 km/u in een zone 30". | the road, then the car | wide of the stretch |
| 2 roar in | It comes straight at the lens. Title card DE SNELHEIDSDUIVEL. The siren is heard before any police car is seen. | the car | nose shot |
| 3 the slalom | Left and right inside the free lines, the body rolling hard over its wheels. | the car | chase cam alongside |
| 3b the law joins | (pass/squeeze) A police car drives in from out of frame ten metres behind him, siren on. | car + police car | chase cam, fitted |
| 4 the handbrake | (pass/squeeze) 180 in a cloud of smoke on the line with a free circle round it; held frame at full lean. | the car | ground level, close; freeze |
| 5 the pass / the squeeze | He launches back the way he came and goes by the standing police car in his own line, nose to nose, never closer than the lines allow; the police car stands on its brakes (HÈ?!). Squeeze: a crawl, sparks, KRRRRK. | both cars | high shot |
| 6 boxed in, 6b the hubcap | A second police car comes head-on in the line he is heading for. The first cannot turn round: it reverses into his tail, BONK; a hubcap pops off and rolls away (only if a free line exists for it). | all three cars, then the hubcap | wide; ground level on the hubcap |
| 4 head-on / 5 reverse / 5b the gap | (reverse mode) A police car at the far end: he stands on the brakes, backs away flat out with it nose to nose, a second car stops behind him: a hand's width on each side. | both cars; all three | high; fitted two-shot; ground on the gap |
| 7 the stand-off | Bumpers a hand's width apart. | him + the car he faces | ground level |
| 8 out of the cars (8 the horn when there is no clear ground beside the cars) | He climbs out of his car (hands up), a cop out of the car behind; both start inside the bodywork and step out onto clear ground. | driver + cop | ground level beside the cars |
| 9 the ticket, 9b the face | The cop writes with a flourish and slaps BON! €1.249 on the windscreen. Sad trombone. Close on the face. | driver + cop | two-shot, then face |
| 9 the bolt, 9b the cop gives up | (other ending) He runs, the cop gives chase, gives up ("ik... kan... niet... meer"), takes the car as evidence. | driver + cop | track, then close on the cop |
| 10 the convoy | The car he faces reverses out of frame, he follows (or the car behind drives off the other way), the rest follow. | the line of cars | wide, slightly high |
| 11 epilogue | A single hubcap wobbles to a stop (when there was one). | the hubcap | ground level |
| 12 the last shot | The empty street. | the street | wide |
