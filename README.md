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

`?q=Grote Marktstraat` opens a street directly. On the dev server only, `&lvl=5` forces a crime
level, `&only=plofkraak` loops a single gag, and `__heibel.stage` is available in the console
(`debugPlay('<gag>')`, `gagNames`). These switches do not exist in the built site, so nobody can
share a link that shows a street at a level it does not have.

Getting in and out: click a street, or just keep zooming in on the map: past the closest zoom level
the camera drops into the street under the pointer. The drop starts at the height that shows exactly
what the map showed. Zooming all the way out of a street hands back to the map at the same spot;
**◀ MAP** rises to the height you came from.

In a street: the camera first follows the action, and every crime plays as a short film scene that
fills the whole picture (cuts, close-ups, low angles, a title card; **SKIP** or any drag ends it). Drag to take over (drag = move,
right-drag or two fingers = turn, scroll or pinch = zoom, WASD/arrows also work); you can roam the
whole city. Red `!` pins mark gags elsewhere on the street; **Follow the action** hands the camera
back.

## Where the numbers come from

| What | Source |
| --- | --- |
| Neighbourhood borders, residents | CBS / PDOK *Wijken en buurten* 2025 |
| Registered crimes per neighbourhood, 2025 | Politie open data via CBS table 47018NED |
| Streets, shops, bars, tram lines, water, parks, trees | OpenStreetMap contributors (ODbL) |
| Ground heights (dunes, quays, polders) | AHN height model, Rijkswaterstaat via PDOK (CC0) |
| Street trees | Tree register, Gemeente Den Haag (CC0) |
| Building outlines, heights, roof type, year built | 3DBAG by tudelft3d and 3DGI (CC BY 4.0) |
| Map label glyphs (self-hosted in `public/fonts/`) | Noto Sans (SIL OFL 1.1) |

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
points of interest, plus three low-resolution rasters of the whole city: ground cover, building
heights and terrain (slow the first time; cached).

## Caveats

Registered crime reflects reporting behaviour and visitor numbers as much as danger: a busy centre
always scores worse than a sleepy suburb. The cartoon scenes are jokes — not a safety guide, and not
a verdict on the people who live there.

## Security and privacy

- The built page needs nothing from other origins: fonts, map glyphs, the map worker and all data
  are served from the site itself. There are no cookies, no analytics and no third-party requests.
  The only thing stored in the browser is the sound on/off choice.
- `vite build` adds a strict Content-Security-Policy as a meta tag (`vite.config.js`). Static hosts
  such as GitHub Pages cannot send response headers, so `frame-ancestors`, HSTS and
  `X-Content-Type-Options` need a CDN or proxy in front if you want them.
- Every string from the data files is escaped before it reaches HTML, numbers are coerced, and the
  build scripts strip control and direction-changing characters from names.
- CI (`.github/workflows/pages.yml`) builds with a read-only token, pins actions to commit hashes,
  installs without lifecycle scripts and fails on high-severity advisories in shipped dependencies.

Data licences are listed in `public/data/LICENSE.txt` and in the site's About box.

## How the street scenes work

- `src/voxel/world.js` — the city is drawn from 256 m map tiles, all painted and coloured by the same
  rules whichever street is open: a stepped pixel-grid ground on the height model (pavements on kerbs,
  red cycle lanes, road markings), water below its banks with quay walls, real building footprints as
  voxel blocks with windows painted by the shader, trees. Tiles come in three levels of detail (close,
  normal, far) chosen by distance, are built once and kept in memory, and reach the edge of the view
  up to the height at which the flat map takes over. Detailed house fronts (doors, shop fronts,
  gables) are drawn for whatever is near the camera, and street furniture stands on every street: nothing
  depends on which street is open
- `src/voxel/landmarks.js` — buildings that are something in particular (churches, fuel stations,
  windmills, the lighthouse), landmark shapes from OpenStreetMap's 3D building parts, free-standing
  features and perimeter walls and fences
- `src/voxel/specials.js`, `specials2.js` — hand-made drawers for buildings everyone knows (the
  Ridderzaal, the Peace Palace, the Grote Kerk, the Kurhaus, the skyline towers), matched to their
  footprints by position
- `src/voxel/crowd.js` — street life for the whole city, the open street included: walkers, cyclists,
  cars, trams, parked cars and lamp posts as instanced meshes on lanes derived from the road map. It
  carries on unchanged when the focus moves to another street; gags borrow passers-by from it
- Roaming onto another street moves the focus there with the camera staying put (`Stage.show` with
  `keep`, `shiftFocus` in `main.js`). Zooming out far enough hands over to the flat map, and zooming
  in on the map by the same amount hands back at the same spot
- Light follows the real time of day in The Hague (`skyAt` in `stage.js`), or is held at day or night with the
  round light button. Night has its own look: street lamps at realistic spacing (`lampsOf` in `world.js`, real mapped
  positions where OpenStreetMap has them) with pools of light baked into the ground, lit windows by kind of
  building and hour, shop signs, head and tail lights, terrace light strings
- `src/voxel/stage.js` also keeps the frame rate steady: when most frames run late it draws with fewer pixels
  and tries the sharp picture again after a calm spell
- `src/voxel/districts.js` — who lives where: a table of street characters per district (kids on fat-bikes in
  Schilderswijk and Laak, mullets and jackets around the centre and Duindorp, civil servants, tourists, joggers,
  surfers, cargo-bike parents...) that the crowd draws from. Types are outfit, vehicle and behaviour only
- `src/voxel/brands.js` — shop fronts show the real business at that spot under a parody name: chains from a
  hand-written table (name, colours, a small drawn mark of their own), every other name respelled in Hague dialect.
  Department stores and other tall retail blocks stand at their real height with shop fronts on every side that
  looks at a street (`storeFronts` in `world.js`)
- `src/voxel/statues/` — the city's statues, monuments and fountains, each drawn from its own recipe
  (`node scripts/check-statues.mjs` validates them)
- `src/voxel/places.js` — the places that are lively in reality (Grote Markt, Het Plein, Chinatown, the Haagse
  Markt, the beach clubs) and what stands there; `DETAIL.md` is the audit of how detailed each kind of place is
- `src/voxel/geo.js` — paths you can walk along, the ground raster, footprint boxes
- `src/voxel/street.js` — lanes and pavements fitted between the real fronts, and the 48 m "spots"
  where gags play, with the doors, windows and furniture found there
- `src/voxel/furnish.js` — street furniture for every street, placed per map tile
- `src/voxel/gags.js` — background street life, the set-piece toolkit (movement, acting, driving), four
  ambient gags, the crime-mix weighting and the director that picks what plays. Gags are written for a
  straight street; the stage bends them onto the real one. The opening scene is a weighted draw that
  remembers what played last, so nothing repeats back to back (`node scripts/scene-rates.mjs` prints each
  scene's share)
- `src/voxel/setting.js` — what really stands at a spot (parked cars, lamp posts, furniture, terraces), so a
  scene only plays where it has free ground, people walk round things, cars keep to the road, and everyone
  enters from out of frame or through a real door instead of appearing. While a scene plays the crowd keeps
  out of its circle: passers-by stop at the rim to watch or film, go round, or run
- `src/voxel/acts/` — the nineteen crime scenes, one file each. Every scene follows a storyboard
  (`storyboards/`, index in [STORYBOARDS.md](STORYBOARDS.md)) beat for beat; [ACTS.md](ACTS.md) explains
  how to write one. On the dev server `__heibel.audit('<scene>')` plays a scene on fast-forward and
  measures, beat by beat, whether what the storyboard says must be seen is in the picture
- `src/voxel/stage.js` — renderer, lighting per level (sunny → night), the drop from map height, the
  follow-the-action camera, the cinematic shots a gag can direct (`ctx.cam(name)`), free roam, the
  hand-over back to the map, and the cutaway that flattens buildings in the camera's way
- `src/voxel/kit.js`, `props.js`, `cast.js` — voxel builder, Dutch row houses, trams, cars on springs
  (they roll in bends, dive under braking; wheels turn and steer), and people with faces (moods, eyes
  that look, mouths that talk and laugh), elbows and knees
- `src/map.js` — MapLibre map with the hover glow; `src/audio.js` — synthesized sound effects and the
  city's tune, "Hofstad Hoempa" (an original chiptune, written as note data in that file)
