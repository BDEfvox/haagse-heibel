# seagullFries: The gull that steals the fries

**Setup:** an ordinary customer (a civ or a granny, never one of the district types) is happily eating a paper cone of chips; a gull flies in over the edge of the frame and makes a slow pass overhead. **Trigger (three middles, picked by `ctx.rnd`; force with `flip` names `poop` / `pincer`):** (`decoy`) a wingman gull lands behind the customer and waddles up, he turns to shoo it, and the scout dives from the other side in slow motion; (`poop`) the gull lines up right over his head and drops a bomb (a white splat on his hair), and while he wipes it off a second gull comes in low behind his back; (`pincer`) two gulls fly in from opposite edges, both beaks on the cone, a tug of war, and the cone tears. **Payoff:** the thief gloats, chips rain down on the pavement, and one of three endings (`flock` / `cop`): a flock dive-bombs him and he runs, a cop strolls up savouring a stroopwafel and loses it to a second gull, or (neither flip) a pigeon walks in, takes the last chip and flies off with it. Every gull leaves the way it came: on and up until it is out of the frame.

- **Cast and props:** a customer (borrowed civ or granny; else invented, walking in already holding the chips), a scout gull, a wingman gull (decoy), a bomber and a thief gull (poop), two gulls (pincer), a flock (`flock` ending), a cop with a stroopwafel (`cop` ending), a pigeon (otherwise). Props: cone of fries (in his hand when the camera arrives), white splat on his head (poop), fallen chips, stroopwafel.
- **Needs at the spot:** `stage: pave { side: any, len: 8, depth: 1.6 }`: a pedestrian and a few metres of pavement to run along.
- **Pacing:** Unchanged: already opens on a tight shot (the customer walks in under it) and each ending is a short reaction.
- **Entrances and exits:** gulls enter with `R.enter(gull, x, z, y, { dir })` (it flies in over the frame edge and on to the point) and leave with `flyOut` (on and up until `!seen`, then `R.gone`); the pigeon and the cop walk in from the edge and the pigeon flies out with its chip. Every gull is sent for only after the shot that shows its arrival is up.

| Beat | What happens | Must be seen | Shot |
|---|---|---|---|
| 1 chips | A happy customer with a big cone of chips. | the spot | wide |
| 1b mmm, patat | He hops with joy: mmm, patat. | customer + fries | close |
| 2 slow pass | A gull flies in from the edge and passes overhead; he glances up: hm? | customer | fitted, from low |
| 3 (decoy) wingman | A second gull swoops in from beyond the frame, lands behind him and waddles up. Title card DE HANDLANGER. | the landing spot | close, freeze |
| 4 (decoy) shoo | He turns, shoos it away: KSST! WEG! It flies off the way it came; he thinks he has won. | customer + wingman | over-the-shoulder |
| 5 (decoy) dive | The scout dives from the other side, in slow motion: YOINK. | customer + scout | fitted, side-on |
| 3 (poop) the gull lines up | The gull hangs right above his head. Title card DE BOMMENWERPER. | customer + gull | fitted, from above |
| 3b (poop) the bomb | A white blob falls and lands on his hair: KLETS! | customer | medium |
| 3c (poop) wiped | One hand holds the cone, the other wipes: HÈ! KIJK UIT! | customer | medium |
| 4 (poop) the accomplice | A second gull comes in low behind his back and takes the cone while he glares up. | customer | fitted |
| 3 (pincer) from both sides | Two gulls fly in from opposite edges to his hand height. Title card DE TANG. | customer | fitted, wide |
| 4 (pincer) the tug | Both beaks on the cone, tug of war, the cone tears: YOINK. | all three | fitted, close |
| 6 tug of war | The thief climbs away with the cone, the customer hangs on, hopping. | customer + gull | over-the-shoulder |
| 7 gloat | The gull turns to the camera: KAA-KAA-KAA; chips rain down. | gull | hero, from below |
| 8 chips | The chips lie on the pavement; the customer: HEY!! | customer + chips | at kerb height |
| 9 (flock) the flock | Gulls fly in from beyond the frame, circle and dive-bomb him. | customer | high |
| 10 (flock) run | He flees along the pavement; KLETS (level 4+). | customer | track |
| 11 (flock) aftermath | Out of breath: *hijg*. | customer | close |
| 12 (cop) the cop | A cop walks in, savouring a stroopwafel: MEEUWEN? ECHT? | the cop | two-shot |
| 13 (cop) second theft | A gull flies in and snatches the waffle: MIJN STROOPWAFEL! The customer shrugs. | cop | fitted, then close |
| 14 (pigeon) pigeon | A pigeon walks in from the edge to the last chip, takes it and flies off. | the chip | at kerb height |
| 15 (pigeon) SERIEUS?! | The customer cannot believe it. | his face | close, freeze |
