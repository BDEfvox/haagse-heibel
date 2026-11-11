# Haagse Heibel

A gamified crime-o-map of The Hague. Hover the map and neighbourhoods and streets glow red; click a
street and the camera drops out of the sky onto a voxel model of the real street — its real shape and
length, real building outlines and heights, forest, water and the streets around it — where cartoon
shenanigans play out. How much happens follows the street's crime level; *what* happens follows the
kinds of crime registered in that neighbourhood.

*Heibel* is Dutch for ruckus.

## Run it

```bash
npm install
npm run dev      # http://localhost:5183
npm run build    # static site in dist/
```

Handy URL switches while developing: `?q=Grote Marktstraat` opens a street directly,
`&lvl=5` forces a crime level, `&only=plofkraak` loops a single gag.

In a street: the camera first follows the action; drag to take over (drag = move, right-drag or
two fingers = turn, scroll or pinch = zoom, WASD/arrows also work). Red `!` pins mark gags elsewhere
on the street; **Follow the action** hands the camera back.

## Where the numbers come from

| What | Source |
| --- | --- |
| Neighbourhood borders, residents | CBS / PDOK *Wijken en buurten* 2025 |
| Registered crimes per neighbourhood, 2025 | Politie open data via CBS table 47018NED |
| Streets, shops, bars, tram lines, water, parks, trees | OpenStreetMap contributors (ODbL) |
| Building outlines, heights, roof type, year built | 3DBAG (TU Delft / Kadaster, CC BY 4.0) |

**Neighbourhood level (real).** Each of the 114 neighbourhoods gets a 0–100 score: 65% from its
percentile rank on registered crimes per 1,000 residents (residents floored at 500 so near-empty
areas do not explode) and 35% from crimes per km². Scores map to five levels: Sleepy, Mild, Spicy,
Rowdy, Mayhem.

**Street level (an estimate).** Street-by-street crime data is not public in the Netherlands. Every
street starts from its neighbourhood's score and is nudged by what OpenStreetMap says is on it:
nightlife, shops, a station nearby, promenades, beachfront and through-roads push it up; quiet
residential lanes and leafy streets pull it down.

**What happens (the crime mix).** The police table splits registered crime into categories. Each
gag stands for a few of them (bike theft, theft from cars, shoplifting, road accidents, fraud,
vandalism, fights…). A gag plays more often the bigger its share of the neighbourhood's crime and the
more that share stands out from the city average; the opening gag is the one the figures point at
most. Categories that are no laughing matter count towards the level but have no gag.

`npm run data` rebuilds `public/data/` from the live sources (raw downloads are cached in `.cache/`).
`npm run world` rebuilds `public/data/world/`: map tiles of buildings, ground, roads, rails, trees and
points of interest, plus two low-resolution rasters of the whole city (slow the first time; cached).

## Caveats

Registered crime reflects reporting behaviour and visitor numbers as much as danger: a busy centre
always scores worse than a sleepy suburb. The cartoon scenes are jokes — not a safety guide, and not
a verdict on the people who live there.

## How the street scenes work

- `src/voxel/world.js` — loads the map tiles around a street and builds the scene: a pixel-grid
  ground, real building footprints as voxel blocks (street-facing ones get full house fronts), trees,
  and a coarse model of the whole city for the horizon and the sky drop
- `src/voxel/geo.js` — paths you can walk along, the ground raster, footprint boxes
- `src/voxel/street.js` — lanes and pavements fitted between the real fronts, street furniture, and
  the 48 m "spots" where gags play
- `src/voxel/gags.js` — background street life plus 23 scripted gags, weighted by crime level and
  crime mix. Gags are written for a straight street; the stage bends them onto the real one
- `src/voxel/stage.js` — renderer, lighting per level (sunny → night), the sky drop, the
  follow-the-action camera, free roam, and the cutaway that flattens buildings in the camera's way
- `src/voxel/kit.js`, `props.js`, `cast.js` — voxel builder, Dutch row houses, trams, cars, people
- `src/map.js` — MapLibre map with the hover glow; `src/audio.js` — synthesized sound and music
