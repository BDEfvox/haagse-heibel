# Storyboards

Every crime cutscene has a storyboard in `storyboards/<scene>.md`: a logline, the cast, what the spot must offer, and a
table of beats. Each row says what happens, **what must be seen**, and the shot that shows it. The script in
`src/voxel/acts/<scene>.js` follows its storyboard beat for beat: every row of the table is one `B('<beat>', [subjects])`
call in the script, and the list of subjects is the "must be seen" column.

## How a scene is checked against its storyboard

On the dev server, open a street and run in the console:

```js
await __heibel.audit('burglar')            // plays the scene on fast-forward
__heibel.sheet(1)                          // next page of the contact sheet; __heibel.sheet(-1) closes it
__heibel.stage.force = { busted: true }    // force one of a scene's endings (the names are the flip() calls in the script)
```

The audit returns one line per beat and lays the beats out as a contact sheet (one picture per beat, taken 0.7 s in). The "Pass" marks in the tables below are a reading aid; nothing in the code checks them, and the audit only reports the numbers.

| Column | Meaning | Pass |
|---|---|---|
| `seen` | share of the beat's frames in which every subject that has arrived was inside the picture (within 97% of its width and height) and not behind a standing building. Each subject is tested at one point, 60% of its height up, and the line to it is checked against buildings only (as tall as the cutaway leaves them), not against parked cars, furniture or other people | 85% or more |
| `size` | how tall the first subject that is in the picture is (an estimated height: about 1.9 m for a person, `hgt` for a vehicle, 0.8 m or 0.6 m for other things), as a share of the picture's height (median over the beat) | a person 12% or more; a face shot 40% or more |
| `cam` | share of frames in which a shot the scene itself directed was running | 100% while it holds the camera |
| `offFrame`, `hidden` | why `seen` was not 100% | |

The audit also returns the director's own numbers (it logs every shot the stage really showed in `shotLog`):

| Number | Meaning | Pass |
|---|---|---|
| `shots` | shots shown | about one per beat |
| `short` | shots shown for less than 0.8 s | 0 to 1 (a glide that follows a cut straight away is allowed) |
| `fallbacks` | blocked-view decisions after a shot began (new stand, high view, back down) | a few, never one every second |
| `expired` | the 20 s safety net released the camera | 0 |
| `offShot` | seconds the scene held the camera while the picture was not one of its shots | 0 |

A shot never expires on its own (`hold` is no longer used); it stays until the script asks for the next one or releases the
camera. A shot asked for less than 0.9 s after the last cut waits for its turn unless it has `quick: true` or `cut: seconds`.

The numbers say whether the subject was in the picture; the contact sheet says whether the beat *reads* (pose, face,
prop, composition). Both are needed.

## Scenes

| Scene | Police category | Storyboard |
|---|---|---|
| burglar | Burglary | [storyboards/burglar.md](storyboards/burglar.md) |
| shopHeist | Shoplifting | [storyboards/shopHeist.md](storyboards/shopHeist.md) |
| bikeThief | Bike theft | [storyboards/bikeThief.md](storyboards/bikeThief.md) |
| carBreakIn | Theft from cars | [storyboards/carBreakIn.md](storyboards/carBreakIn.md) |
| pickpocket | Pickpocketing | [storyboards/pickpocket.md](storyboards/pickpocket.md) |
| scooterSnatch | Street robbery | [storyboards/scooterSnatch.md](storyboards/scooterSnatch.md) |
| plofkraak | Hold-ups and blasts | [storyboards/plofkraak.md](storyboards/plofkraak.md) |
| carChase | Reckless driving | [storyboards/carChase.md](storyboards/carChase.md) |
| fenderBender | Road accidents | [storyboards/fenderBender.md](storyboards/fenderBender.md) |
| graffiti | Vandalism | [storyboards/graffiti.md](storyboards/graffiti.md) |
| fireworks | Fireworks and disorder | [storyboards/fireworks.md](storyboards/fireworks.md) |
| scuffle | Fights and threats | [storyboards/scuffle.md](storyboards/scuffle.md) |
| shadyDeal | Drugs | [storyboards/shadyDeal.md](storyboards/shadyDeal.md) |
| phishing | Fraud and scams | [storyboards/phishing.md](storyboards/phishing.md) |
| doorbell | Neighbour rows | [storyboards/doorbell.md](storyboards/doorbell.md) |
| parkingTicket | (street life) | [storyboards/parkingTicket.md](storyboards/parkingTicket.md) |
| herringHeist | (street life) | [storyboards/herringHeist.md](storyboards/herringHeist.md) |
| seagullFries | (street life) | [storyboards/seagullFries.md](storyboards/seagullFries.md) |
| bennyHill | (street life) | [storyboards/bennyHill.md](storyboards/bennyHill.md) |

How to write or change a scene: [ACTS.md](ACTS.md).
