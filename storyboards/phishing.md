# phishing: Phishing, but make it literal

**Setup:** a hooded phisher carries a folding desk onto the far pavement and unfolds it; a phone zombie ambles along the near pavement. **Trigger:** he sends a text, the victim is delighted, a glowing hook flies across and a wallet is reeled in to the desk; he counts the haul and, greedy, gloats in profile with his eyes shut, facing down the street. **Payoff:** the camera glides past his face along his sight line and pushes in on what he cannot see: a cyber cop on a bicycle, riding up the pavement, small and growing; the phisher's eyes open, his head turns slowly, shock. The cop brakes and dismounts, or the phisher bolts dragging his desk and the bike skids in alongside him (`chase`); the wallet goes home, the desk folds up the way it unfolded, the cop climbs back on his bike and rides out of the frame.

- **Cast and props:** hooded phisher, an ordinary phone-zombie victim (a civ), a cop on a bicycle (separate bike and rider: `mount`, `rideTo`, `dismount`). Props: folding desk with laptop, fishing rod, glowing hook and line, wallet, wad of cash.
- **Needs at the spot:** `stage: pave { side: any, len: 14, depth: 3 }`; a clear 1.2 m patch on each pavement; the cop's route is checked with `S.lineClear` from where he starts (just out of the frame on the longer side, up to 31 m out) to 2.4 m short of the desk, along the phisher's pavement line, a line half a metre either side, a cycle lane, or a free road lane (then the road is closed to traffic with `R.close`); without any line a foot cop jogs in (`R.cop`).
- **Pacing:** Tight opening on the place; the hooded figure and the phone zombie are both in the picture within a second or two.
- **Entrances:** the phisher walks in from the edge (the desk in his arms); the cop rides in from out of the frame, the ride is started with `R.run` while the victim is still shouting (beat 4c), at the pace that brings him about 15 m out when the pan lands, then 4.8 m/s, ringing and braking in three steps; the victim is borrowed or walks in.

| Beat | What happens | Must be seen | Shot |
|---|---|---|---|
| 1 set-up | A phone zombie ambles along; a hooded figure walks in carrying a folded desk. | the middle of the scene | wide |
| 1b the desk | He looks around, the desk pops open with a puff and a ding. | him + desk | at kerb height |
| 2 reveal | He turns to us, rubs his hands, sniggers. Title card DE HENGELAAR. | his face | hero from below, freeze |
| 3 typing | He types on the laptop (klik klik); the victim walks into range. | both | two-shot |
| 3b the text lands | The victim's phone dings: "U HEEFT GEWONNEN!" Double take, delighted. | victim's face | close |
| 3c the cast | Out comes the rod; the hook flies over the pavement, PHISHING!, the wallet pops out, victim shocked. | both | two-shot |
| 4 reeling in | He reels; the wallet travels along the line and the victim is dragged a few steps. | both | high two-shot |
| 4b the haul | A wad lands on the desk, the wallet beside it; he counts and laughs. | him + desk | slow push-in |
| 4c fury | The victim's shock turns to anger: OPGELICHT! | victim's face | face |
| 5 greed | In side profile, eyes shut, he gloats down the street: MEER! The cop has been riding since beat 4c, but is far out of frame. Held for a second and a half or more. | him | profile, fixed lens (fov 34), from the street side |
| 5b the pan | A 1.1 s glide along his sight line, camera spot fixed, lens narrower (fov 28): past his face, down the pavement; a small cop on a bike comes into frame. | the stretch of pavement | glide |
| 5c push in | Another glide, longer lens (fov 22): the cop grows as he rides in; he rings his bell, brakes in three steps, POLITIE CYBERCRIME! | the cop | glide, fitted |
| 5d the slow turn | Eyes open, the head turns slowly: to the street, then to the cop. | his face | close |
| 5e reaction | Crash zoom; hands up, double take, gasp. | his face | crash |
| 6 (`chase` ending) getaway | He bolts the way he came dragging the desk on a line, sparks; the bike goes after him. | him | track |
| 6b busted | The bike catches him and skids in: BUSTED, freeze. | both | dutch, freeze |
| 6c the sulk | Arms crossed, sad face; the cop steps off with hands on hips. | his face | close |
| 6 (no `chase`) the cop dismounts | The cop brakes, steps off, hands on hips: PAPIEREN. EN DAT WALLETJE. He walks up; the phisher begs. | both | two-shot |
| 7 the wallet is back | The cop flicks the wallet across to its owner: HA! TERUG! | the victim | close |
| 8 everybody goes home | The desk folds up the way it unfolded, the victim waves, the cop climbs back on the bike and rides out of frame, the phisher trudges off. | the spot | wide |
