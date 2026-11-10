# Haagse Heibel

A gamified crime-o-map of The Hague. Hover the map and neighbourhoods and streets glow red; click a
street and the camera dives into a voxel diorama of it, where cartoon shenanigans play out according
to the street's crime level — from a napping cat (Sleepy) to an exploding ATM (Mayhem).

*Heibel* is Dutch for ruckus.

## Run it

```bash
npm install
npm run dev      # http://localhost:5183
npm run build    # static site in dist/
```

Handy URL switches while developing: `?q=Grote Marktstraat` opens a street directly,
`&lvl=5` forces a crime level, `&only=plofkraak` loops a single gag.

## Where the numbers come from

| What | Source |
| --- | --- |
| Neighbourhood borders, residents | CBS / PDOK *Wijken en buurten* 2025 |
| Registered crimes per neighbourhood, 2025 | Politie open data via CBS table 47018NED |
| Streets, shops, bars, tram lines, water, parks | OpenStreetMap contributors (ODbL) |

**Neighbourhood level (real).** Each of the 114 neighbourhoods gets a 0–100 score: 65% from its
percentile rank on registered crimes per 1,000 residents (residents floored at 500 so near-empty
areas do not explode) and 35% from crimes per km². Scores map to five levels: Sleepy, Mild, Spicy,
Rowdy, Mayhem.

**Street level (an estimate).** Street-by-street crime data is not public in the Netherlands. Every
street starts from its neighbourhood's score and is nudged by what OpenStreetMap says is on it:
nightlife, shops, a station nearby, promenades, beachfront and through-roads push it up; quiet
residential lanes and leafy streets pull it down.

`npm run data` rebuilds `public/data/` from the live sources (raw downloads are cached in `.cache/`).

## Caveats

Registered crime reflects reporting behaviour and visitor numbers as much as danger: a busy centre
always scores worse than a sleepy suburb. The cartoon scenes are jokes — not a safety guide, and not
a verdict on the people who live there.

## How the street scenes work

- `src/voxel/kit.js` — merged-box voxel builder, seeded RNG, generator-based scripting
- `src/voxel/props.js`, `cast.js` — Dutch row houses, trams, cars, people, gulls, raccoons
- `src/voxel/street.js` — builds a diorama from a street's traits (tram, canal, beach, shops, trees…)
- `src/voxel/gags.js` — ambient street life plus 18 scripted gags chosen by crime level
- `src/voxel/stage.js` — renderer, lighting per level (sunny → night), camera rig, intro pop-in
- `src/map.js` — MapLibre map with the hover glow; `src/audio.js` — synthesized sound and music
