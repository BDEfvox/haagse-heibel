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

The audit returns one line per beat and lays the beats out as a contact sheet (one picture per beat, taken 0.7 s in):

| Column | Meaning | Pass |
|---|---|---|
| `seen` | share of the beat's frames in which every subject was inside the picture and not behind a standing building | 85% or more |
| `size` | how tall the first subject is, as a share of the picture's height (median over the beat) | a person 12% or more; a face shot 40% or more |
| `cam` | share of frames in which the scene itself directed the camera | 100% while it holds the camera |
| `offFrame`, `hidden` | why `seen` was not 100% | |

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
