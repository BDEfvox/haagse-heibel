// Dev tool: records the frames on both sides of street switches ("focus shifts") in a headless Chrome and measures what jumps.
//
// What it does: opens the first street of a route, switches the stage to free mode at a fixed street-level view and then travels the route.
// For each next street it moves the camera TARGET (the goal, in map metres, converted to the current street's frame every frame) onto the next street
// and rests there, so that main.js's OWN focus shift runs exactly as for a user (hooks.onRoam -> streetAt -> shiftFocus -> stage.show({keep:true})).
// It never calls stage.show itself. A page-side recorder wraps stage._frame on the instance (original first, then record) and, when stage.W is a
// different object than in the frame before (that is the swap, see stage.show/_begin), keeps the 45 frames before, the swap frame (index 45 in a
// window, "off 0") and the 45 frames after. Per frame: stage mode, camera and target in MAP metres, flying and far-visible things (helicopters,
// boats, gulls, pigeons, the stork, clouds, running scenes' actors, the city crowd) with a stable identity (WeakMap serial), map position, height and
// compass heading, the "!" pins on screen, DOM probes (cutscene class, canvas CSS filter, flash overlay opacity, element at the screen centre, running CSS
// animations) and a 64x40 greyscale thumbnail of the WebGL canvas (composited over the CSS sky; plus the share of transparent pixels). Frames within
// +-6 of the swap also keep a 480 px JPEG.
//
// usage (dev server `heibel-audit` on http://localhost:5190 must be up; ONE renderer at a time):
//   node scripts/dev-swap.mjs <out.json> [--route "Street A;Street B;..." | --area 1|2|3|4] [--loops n] [--time 14:00] [--seed s] [--lvl 5]
//                             [--pics dir] [--w 960 --h 600] [--only napCat|any|<gag>] [--dist 110 --el 0.7] [--speed 14] [--hop 45]
//                             [--rest 26] [--step-timeout 90]
//   --route   street names as `?q=` finds them (exact, case-insensitive, FIRST street of that name; must be unique for the first one) or `#<id>`
//             (index in public/data/streets.geojson). Default = --area 1.  The route is travelled once per loop; the first street is only the start.
//   --area    1 Binnenhof/Hofvijver, 2 Noordeinde palace with the Veenkade/Wal canals, 3 ordinary residential streets (Koningsplein area),
//             4 Kurhaus/pier at the sea, 5 Schilderswijk: level 5 and level 4 streets in turn (for --lvl none).  Each named route ends on a street it passed, so --loops 5 on area 1 gives 35 switches.
//   --lvl     crime level forced for every street (default 5; helicopters exist only at level 5). It is applied by main.js `withLevel` in BOTH doOpen
//             and shiftFocus (main.js:343, 391, 458), so it survives every focus shift. `--lvl none`: nothing forced, every street keeps its own
//             level (streets.geojson `level`): with --area 5 (level 5 and level 4 streets in turn) the helicopter must fly away and fly in.
//   Every tracked thing carries a `vis` flag (inside the camera's picture in that frame); the identities of helicopters, boats, gulls, pigeons,
//   the stork and the clouds are followed over the whole run, and the totals list those that first appeared or last disappeared IN VIEW
//   (for helicopters the count must be 0). Each swap line shows the two streets' levels.
//   --only    default napCat (no crime scene takes the camera, one cat naps at the first spot); `any` = let the director run (scenes play, nondeterministic).
//   --dist/--el  the fixed free-camera view: metres from the target (default 110, below the 2200 m at which main.js stops shifting the focus) and elevation in radians (0.7).
//   --speed   m/s the target walks ALONG the next street (14); --hop m/s for the straight hop from where it is to that street (45: fast, so it does
//             not rest long enough on a street in between to trigger a stray shift); --rest extra metres of margin (6) added to main.js's off threshold
//             15 + 0.035*dist when choosing the rest point (see below); --step-timeout seconds a route step may take (90).
//   --pics    folder for the JPEGs of the worst flash frame of each window and its two neighbours (default <out>-pics/).
//
// How the rest point is chosen (page-side, ported from main.js onRoam/streetAt): walk along the next street B away from the street A that is open until
// the camera target is (a) off A's centre line by at least 15 + 0.035*dist + margin metres, measured on the real W.path spine like stage.js:1506-1508, and
// (b) B is the nearest street other than A within 13 + 0.035*dist metres (streetAt). The target rests there up to 4 s (longer while a build is running,
// signalled by stage._tok changing), then walks on along B; at B's end it waits again, then gives up ("no swap") .
//
// How to read the output: a table with one line per recorded swap and a JSON file with one record per swap + totals.
//   heli b/a        helicopters in the last frame before / in the swap frame (the count must not change)
//   hJump m         largest helicopter jump in map metres beyond what its own velocity explains: for an identity present on both sides, the residual against the
//                   prediction from its last two frames; for helicopters that vanish and appear it is the distance from the prediction of the vanished one to the nearest appeared one
//                   (identities never survive a swap today, so before a fix the second number is the one that shows the teleport)
//   hHdg deg        the same in heading, vanish/appear pairs included
//   van/app         identities that vanish / appear at the swap, all kinds (clouds and crowd included; the per-kind numbers are in the JSON)
//   pins b/a, pJ    "!" pins on screen before / in the swap frame, largest screen jump (px) of a pin to its nearest pin after
//   flash           largest flash score in the window and where (frame offset to the swap). score = min(d(i-1,i), d(i,i+1)) - d(i-1,i+1),
//                   d = mean absolute luminance difference over the 64x40 thumbnail, 0..255
//   maxD            largest d(i-1,i) in the window (a jump cut that stays) and where
// noise floor: the same two numbers over 45 ordinary frames while the camera travels, far from any swap.
//
// The tool changes nothing in what the city builds and uses no randomness of the city's generators (Math.random is not called).

import fs from 'node:fs';
import path from 'node:path';
import { launch, args, sleep } from './dev-lib.mjs';

// ---- thresholds: a STARTING POINT, to be tuned on the first recordings (compare with the noise floor printed at the end) ----
const FLASH_SCORE = 6;   // luminance levels (0..255): a frame whose flash score is above this counts as a flash
const CUT_JUMP = 18;     // luminance levels: d(i-1,i) above this counts as a jump cut
const HELI_JUMP_M = 1.5; // metres beyond own motion: a helicopter that moves more than this at the swap counts as a jump
const HELI_HDG_DEG = 15; // degrees beyond own turning
const BEFORE = 45, AFTER = 45, JPG_OFF = 6;
// online capture in the page: a frame that looks like a flash (or a big jump) gets JPEGs of itself and its neighbours wherever it falls in the window
const CAP_SCORE = 3, CAP_D = 30, CAP_MAX = 12; // lower than the reporting thresholds; CAP_MAX = most anomaly-captured frames kept per window

// ---- default routes (every name checked against public/data/streets.geojson; consecutive streets share a junction or are within 0-170 m) ----
const ROUTES = {
  // 1: Hofweg-Buitenhof-Lange Vijverberg-Korte Vijverberg-Plein-Lange Poten-Spui-Hofweg: gaps 0/0/0/0/1/0/0 m (all streets meet), loop ~ 2.6 km of street, Hofvijver water
  1: 'Hofweg;Buitenhof;Lange Vijverberg;Korte Vijverberg;Plein;Lange Poten;Spui;Hofweg',
  // 2: Noordeinde palace (specials.js 'noordeinde' 429,1208) with the canal streets Prinsessewal/Noordwal/Toussaintkade (water=1): gaps 0, 31, 27, 228, 228 m
  2: 'Prinsessewal;Noordwal;Toussaintkade;Prinsessewal;Noordeinde;Prinsessewal',
  // 3: ordinary residential: Van Bylandtstraat, Van Merlenstraat, Koningsplein, Weimarstraat (#3134, the Koningsplein side), back: gaps 169, 0, 0, 2 m
  3: 'Van Bylandtstraat;Van Merlenstraat;Koningsplein;#3134;Van Bylandtstraat',
  // 4: alternative with sea and hand-made landmarks (Kurhaus 'kurhaus' -1255,4808; pier): gaps 60, 2, 2, 190, 13 m
  4: 'Gevers Deynootplein;Palacestraat;Middenboulevard;Strandweg;Kurhausweg;Gevers Deynootplein',
  // 5: levels 5, 4, 5, 4, 5 (streets.geojson `level`, as main.js uses it): Groenewegje (#991, L5, 654 m), Hooftskade (#1179, L4, 299 m),
  //    Hobbemastraat (#1146, L5, 372 m; the name is not unique, hence the id); every pair shares a junction (gap 0 m). With --lvl none the
  //    swaps go 5>4, 4>5, 5>4, 4>5: the helicopter flies away out of sight, then one flies in from out of sight
  5: 'Groenewegje;Hooftskade;#1146;Hooftskade;Groenewegje',
};

const A = args();
const outFile = A._[0];
if (!outFile) {
  console.error('usage: node scripts/dev-swap.mjs <out.json> [--route "A;B;C" | --area 1|2|3|4] [--loops n] [--time 14:00] [--seed s] [--lvl 5] [--pics dir] [--w 960 --h 600]');
  process.exit(2);
}
const num = (v, d) => (v !== undefined && v !== true && Number.isFinite(+v) ? +v : d);
const routeStr = A.route && A.route !== true ? A.route : ROUTES[num(A.area, 1)];
if (!routeStr) { console.error('unknown --area'); process.exit(2); }
const route = routeStr.split(';').map((s) => s.trim()).filter(Boolean);
if (route.length < 2) { console.error('a route needs at least two streets'); process.exit(2); }
if (route[0][0] === '#' ) console.error('note: the first street is opened by #id through a fragment in the URL');
const loops = Math.max(1, Math.round(num(A.loops, 1)));
const time = A.time && A.time !== true ? A.time : '14:00';
const seed = A.seed && A.seed !== true ? A.seed : null;
const lvl = A.lvl === 'none' ? null : num(A.lvl, 5); // (null: no &lvl= in the URL, dev-lib.mjs open)
const width = num(A.w, 960), height = num(A.h, 600);
const only = A.only === undefined || A.only === true ? 'napCat' : A.only === 'any' ? '' : A.only;
const picsDir = A.pics && A.pics !== true ? A.pics : outFile.replace(/\.json$/i, '') + '-pics';
const view = { dist: num(A.dist, 110), el: num(A.el, 0.7) };
const drive = { walk: num(A.speed, 14), hop: num(A.hop, 45), margin: num(A.rest, 6), holdMax: 4, timeout: num(A['step-timeout'], 90) };

// =====================================================================================================================
// PAGE SIDE. This function is serialised and evaluated in the page: it may not use anything from the Node side except `opts`.
// =====================================================================================================================
async function pageInstall(opts) {
  const H = window.__heibel, st = H && H.stage, checks = [];
  const need = (name, ok) => { checks.push([name, !!ok]); return !!ok; };
  need('window.__heibel = { api, stage, S, openStreet, closeStreet } (main.js:534)', H && H.stage && Array.isArray(H.S));
  if (!st) return { checks, fatal: true };
  need('stage._frame is a function, called as this._frame(now) by _tick (stage.js:219, 1348)', typeof st._frame === 'function');
  need('stage.W.frame.M/S, W.st {id,name}, W.path.project/sA/sB (world.js:196-, 1732; stage.js:1506-1508)', st.W && st.W.frame && st.W.frame.M && st.W.frame.S && st.W.st && st.W.path && typeof st.W.path.project === 'function' && 'sA' in st.W.path);
  need('stage.rig / stage.goal {tx,tz,ty,az,el,dist} (stage.js:206-207)', ['tx', 'tz', 'ty', 'az', 'el', 'dist'].every((k) => typeof st.rig[k] === 'number' && typeof st.goal[k] === 'number'));
  need('stage._setMode (stage.js:359), stage.last (stage.js:1211), stage.timeScale (stage.js:1353)', typeof st._setMode === 'function' && typeof st.last === 'number' && typeof st.timeScale === 'number');
  need('stage._tok (counts show/hide calls; stage.js:905) ', typeof st._tok === 'number');
  need('stage.actors (list of spawned actors, stage.js:977), stage.extras (stork, :978), stage.clouds (:1217)', Array.isArray(st.actors) && Array.isArray(st.extras) && Array.isArray(st.clouds));
  need('stage.crowd.agents with x,z,hd,dead,vis (crowd.js:397, 568-, 977)', st.crowd && Array.isArray(st.crowd.agents));
  need('stage.overlay (pins live here, stage.js:171, :1329), stage.canvas, stage.root, stage.flashEl (:175)', st.overlay && st.canvas && st.root && st.flashEl);
  need('stage.camera (THREE.PerspectiveCamera), stage.cutK (stage.js:1173, 1549)', st.camera && st.camera.position && 'cutK' in st);
  need('#t-name (index.html:60)', document.querySelector('#t-name'));
  let U = null; // world.js's shared uniforms (U.uGrow, U.uHalf, U.uCut): the dev server serves the same module instance the stage uses
  try { U = (await import('/src/voxel/world.js')).U; } catch (e) { /* reported below */ }
  if (U && !(U.uGrow && U.uHalf && U.uCut)) U = null;
  checks.push(['uniforms U.uGrow/uHalf/uCut via import(/src/voxel/world.js) (world.js:239): ' + (U ? 'reachable' : 'NOT reachable, uniforms are not recorded'), true]);
  let feats = null;
  try { feats = (await (await fetch('./data/streets.geojson')).json()).features; } catch (e) { /* reported below */ }
  need('streets.geojson fetched and index == feature id == S index (main.js:41-46)', feats && feats.length === H.S.length && feats.every((f, i) => f.id === i));
  if (checks.some((c) => !c[1])) return { checks, fatal: true };

  // ---- streets in map metres
  const KX = 68430, KY = 111267, LON0 = 4.3, LAT0 = 52.07;
  const polyMap = (id) => feats[id].geometry.coordinates.map((l) => l.map((c) => [(c[0] - LON0) * KX, (c[1] - LAT0) * KY]));
  const flat = []; // every street segment: id, ax, ay, bx, by
  feats.forEach((f, id) => { for (const l of f.geometry.coordinates) for (let i = 1; i < l.length; i++) flat.push(id, (l[i - 1][0] - LON0) * KX, (l[i - 1][1] - LAT0) * KY, (l[i][0] - LON0) * KX, (l[i][1] - LAT0) * KY); });
  /** main.js streetAt: the street whose centre line passes within max metres of (x,y), skipping `skip`. */
  const streetAt = (x, y, max, skip) => {
    let best = -1, bd = max;
    for (let i = 0; i < flat.length; i += 5) {
      if (flat[i] === skip) continue;
      const ax = flat[i + 1], ay = flat[i + 2], ex = flat[i + 3] - ax, ey = flat[i + 4] - ay;
      if (x < Math.min(ax, ax + ex) - max || x > Math.max(ax, ax + ex) + max || y < Math.min(ay, ay + ey) - max || y > Math.max(ay, ay + ey) + max) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
      const d = Math.hypot(ax + ex * t - x, ay + ey * t - y);
      if (d < bd) { bd = d; best = flat[i]; }
    }
    return best;
  };
  const resolve = (item) => (item[0] === '#' ? +item.slice(1) : H.S.findIndex((p) => p.lname === item.toLowerCase()));
  const curMap = () => st.W.frame.M(st.goal.tx, st.goal.tz);
  /** stage.js:1506-1508: how far the target is from the open street (leaving past either end counts too). */
  const offOf = (mx, my) => { const s = st.W.frame.S(mx, my), pr = st.W.path.project(s[0], s[1]); return pr.d + Math.max(0, st.W.path.sA - pr.s, pr.s - st.W.path.sB); };

  // ---- the recorder
  if (window.__swapRec && window.__swapRec.orig) st._frame = window.__swapRec.orig; // installed twice: take the old one off
  const KINDS = ['heli', 'boat', 'gull', 'pigeon', 'stork', 'cloud', 'actor', 'vehicle', 'crowd'];
  const R = window.__swapRec = { n: 0, ring: [], windows: [], noise: [], post: null, sinceSwap: 9999, overlap: 0, errs: [], lastW: st.W, tok: st._tok, D: null, stepNo: 0, KINDS };
  const err = (where, e) => { if (R.errs.length < 8) R.errs.push(where + ': ' + (e && e.message ? e.message : e)); };
  const ids = new WeakMap();
  const pv = st.camera.position.clone(); // (a Vector3 of the page's own three.js, for projections)
  // identities of the kinds paired at swaps (helicopter .. cloud), over the whole run: id -> [kind, first n, first vis, last n, last vis, first street, last street]
  const life = new Map();
  let nextId = 1;
  const idOf = (o) => { let i = ids.get(o); if (!i) { i = nextId++; ids.set(o, i); } return i; };
  const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
  const CW = 480, CH = Math.max(1, Math.round((CW * st.canvas.height) / st.canvas.width));
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const big = Array.from({ length: 7 }, () => mkCanvas(CW, CH));
  const small = mkCanvas(64, 40), sctx = small.getContext('2d', { willReadFrequently: true });
  const tiny = mkCanvas(32, 20), tctx = tiny.getContext('2d', { willReadFrequently: true });
  const nameEl = document.querySelector('#t-name');

  /** Draw the WebGL canvas right after it was rendered (valid until the browser composes; same trick as src/dev/audit.js grab). */
  const grab = (f) => {
    const c = big[f.n % 7], x = c.getContext('2d'), cs = getComputedStyle(st.root);
    const g = x.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, cs.getPropertyValue('--sky-top').trim() || '#6ec3ff');
    g.addColorStop(1, cs.getPropertyValue('--sky-bot').trim() || '#d9f2ff');
    x.fillStyle = g; x.fillRect(0, 0, CW, CH); // the canvas is transparent where there is sky (stage.js:177, 185): the sky is CSS
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(st.canvas, 0, 0, CW, CH);
    sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(c, 0, 0, 64, 40);
    const d = sctx.getImageData(0, 0, 64, 40).data, th = new Uint8Array(2560);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) th[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    f.th = th;
    tctx.clearRect(0, 0, 32, 20);
    tctx.drawImage(st.canvas, 0, 0, 32, 20);
    const t = tctx.getImageData(0, 0, 32, 20).data;
    let hole = 0;
    for (let i = 3; i < t.length; i += 4) if (t[i] < 128) hole++;
    f.hole = r3(hole / 640);
  };
  const enc = (f) => { if (f.jpg) return; try { f.jpg = big[f.n % 7].toDataURL('image/jpeg', 0.8); } catch (e) { err('jpeg', e); } };

  /** Flying and far-visible things in map terms, read from matrixWorld (the street-space `position` of a warped object is not a world position). */
  const ents = (F, r) => {
    const out = [], near = [];
    const head = (e8, e10) => ((Math.atan2(e8 * F.dx + e10 * F.dy, e8 * F.dy - e10 * F.dx) * 180) / Math.PI + 360) % 360;
    // vis: inside the picture this frame (projected with the camera that has just drawn it)
    const put = (o, k, x, y, z, hd) => { const m = F.M(x, z); pv.set(x, y, z).project(st.camera); const vis = pv.z < 1 && Math.abs(pv.x) <= 1 && Math.abs(pv.y) <= 1 ? 1 : 0; out.push([idOf(o), k, r2(m[0]), r2(m[1]), r2(y), r1(hd), vis]); };
    const fromG = (o, k, g) => { const e = g.matrixWorld.elements; put(o, k, e[12], e[13], e[14], head(e[8], e[10])); };
    for (const a of st.actors) {
      if (!a || !a.alive || !a.g) continue;
      const k = a.type === 'heli' ? 0 : a.type === 'boat' ? 1 : a.kind === 'gull' ? 2 : a.kind === 'pigeon' ? 3 : a.kind === 'stork' ? 4 : a.vehicle ? 7 : 6;
      if (k < 6) { fromG(a, k, a.g); continue; }
      const e = a.g.matrixWorld.elements, d2 = (e[12] - r.tx) ** 2 + (e[14] - r.tz) ** 2;
      if (d2 < 150 * 150) near.push([d2, a, k]);
    }
    near.sort((p, q) => p[0] - q[0]);
    for (const [, a, k] of near.slice(0, 40)) fromG(a, k, a.g);
    for (const e of st.extras) if (e && e.g) fromG(e, e.kind === 'stork' ? 4 : 6, e.g);
    for (const c of st.clouds) fromG(c, 5, c);
    if (st.crowd && st.crowd.agents) {
      const cr = [];
      for (const a of st.crowd.agents) {
        if (a.dead || !a.vis) continue;
        const d2 = (a.x - r.tx) ** 2 + (a.z - r.tz) ** 2;
        if (d2 < 120 * 120) cr.push([d2, a]);
      }
      cr.sort((p, q) => p[0] - q[0]);
      for (const [, a] of cr.slice(0, 25)) put(a, 8, a.x, 0, a.z, ((Math.atan2(Math.sin(a.hd) * F.dx + Math.cos(a.hd) * F.dy, Math.sin(a.hd) * F.dy - Math.cos(a.hd) * F.dx) * 180) / Math.PI + 360) % 360);
    }
    return out;
  };

  const lumD = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
  /** What the stage was doing in this frame (for the anomaly lines). */
  const stageState = (f) => {
    const s = { tok: st._tok, bld: R.D && R.D.building && performance.now() - R.D.building < 40000 ? 1 : 0, cutK: f.cutK };
    if (U) { s.uGrow = r3(U.uGrow.value); s.uHalf = r3(U.uHalf.value); s.uCut = r3(U.uCut.value); }
    const S = st.W.stream;
    if (S) { s.live = S.live.size; s.pend = S.pending.size; s.ready = S.ready.size; s.staged = S.staged.size; }
    const cnt = {};
    for (const c of st.scene.children) { if (!c.visible) continue; const k = c.name || (c.userData && Object.keys(c.userData)[0]) || c.type; cnt[k] = (cnt[k] || 0) + 1; }
    s.vis = Object.entries(cnt).map(([k, v]) => k + ':' + v).join(',');
    s.wgVis = st.W.group.children.filter((c) => c.visible).length;
    return s;
  };
  const snap = (now, swapped) => {
    const W = st.W, F = W.frame, r = st.rig, cp = st.camera.position, cm = F.M(cp.x, cp.z), tm = F.M(r.tx, r.tz);
    const f = { n: R.n++, t: now, mode: st.mode, swap: swapped, sid: W.st.id, sname: W.st.name, lv: W.st.level, cam: [r2(cm[0]), r2(cm[1]), r2(cp.y)], tgt: [r2(tm[0]), r2(tm[1])],
      dist: r2(r.dist), el: r3(r.el), az: r3(r.az), cutK: st.cutK === undefined ? -1 : r3(st.cutK), ts: r3(st.timeScale), ents: [], pins: [] };
    try { f.ents = ents(F, r); } catch (e) { err('ents', e); }
    try {
      for (const el of st.overlay.querySelectorAll('.gag-pin')) {
        if (el.hidden) continue;
        const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform || '');
        f.pins.push([m ? Math.round(+m[1]) : -1, m ? Math.round(+m[2]) : -1, el.classList.contains('edge') ? 1 : 0]);
      }
    } catch (e) { err('pins', e); }
    try {
      f.cls = st.root.className; f.cine = st.root.dataset.cine ? 1 : 0;
      f.flt = getComputedStyle(st.canvas).filter;
      f.flashOp = r3(+getComputedStyle(st.flashEl).opacity || 0);
      const te = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      f.top = te ? (te.tagName.toLowerCase() + (te.id ? '#' + te.id : '') + (typeof te.className === 'string' && te.className ? '.' + te.className.split(' ')[0] : '')) : '-';
      f.anim = st.root.getAnimations({ subtree: true }).map((a) => a.animationName || a.transitionProperty || '?').filter((v, i, l) => l.indexOf(v) === i).join(',');
    } catch (e) { err('dom', e); }
    try { grab(f); } catch (e) { err('grab', e); f.th = new Uint8Array(2560); f.hole = -1; }
    try { f.sx = stageState(f); } catch (e) { err('state', e); }
    return f;
  };

  const finish = () => {
    const P = R.post;
    R.post = null;
    const D = R.D, to = P.swap.sid;
    R.windows.push({ idx: R.windows.length, step: R.stepNo, swapIdx: P.before.length, frames: [...P.before, P.swap, ...P.after], fromName: P.before.length ? P.before[P.before.length - 1].sname : '?',
      fromId: P.before.length ? P.before[P.before.length - 1].sid : -1, toName: P.swap.sname, toId: to, fromLv: P.before.length ? P.before[P.before.length - 1].lv : null, toLv: P.swap.lv, planned: D ? D.id === to : null, intended: D ? D.name : null });
    if (D && D.id === to && D.phase !== 'done') { D.phase = 'done'; D.reason = 'swap'; }
  };
  const record = (now) => {
    const W = st.W;
    if (!W) return;
    const swapped = W !== R.lastW;
    R.lastW = W;
    const D = R.D;
    if (st._tok !== R.tok) { R.tok = st._tok; if (D) D.building = performance.now(); } // a show() has started: the next street is being built
    const f = snap(now, swapped);
    for (const e of f.ents) {
      if (e[1] > 5) continue;
      const L = life.get(e[0]);
      if (!L) life.set(e[0], [e[1], f.n, e[6], f.n, e[6], f.sname, f.sname]);
      else { L[3] = f.n; L[4] = e[6]; L[6] = f.sname; }
    }
    R.ring.push(f);
    if (R.ring.length > 91) R.ring.shift();
    // online anomaly capture: score of the middle frame of the last three (frame i-1 when frame i has just arrived) and the plain jump d(i-1,i).
    // The ring of 7 canvases holds frames n-6..n, so i-2, i-1, i (3 frames) are all still there.
    try {
      const L = R.ring.length;
      if (L >= 3) {
        const a = R.ring[L - 3], b = R.ring[L - 2], dab = lumD(a.th, b.th), dbf = lumD(b.th, f.th), score = Math.min(dab, dbf) - lumD(a.th, f.th);
        if ((score > opts.capScore || dbf > opts.capD) && f.n - a.n === 2 && R.ring.filter((x) => x.anJ).length < opts.capMax) {
          for (const g of [a, b, f]) { enc(g); g.anJ = true; }
        }
      }
    } catch (e) { err('anomaly', e); }
    if (swapped) {
      R.sinceSwap = 0;
      if (D) { D.building = 0; if (f.sid === D.id) { D.swapSeen = true; if (D.phase === 'hold' || D.phase === 'tail') D.phase = 'move'; } } // (swapSeen: the PLANNED swap)
      if (R.post) { R.overlap++; return; }
      const prior = R.ring.slice(0, -1).slice(-BEFORE);
      for (const g of prior.slice(-JPG) .concat([f])) enc(g);
      R.post = { before: prior, swap: f, after: [] };
    } else {
      R.sinceSwap++;
      if (R.post) {
        R.post.after.push(f);
        if (R.post.after.length <= JPG) enc(f);
        if (R.post.after.length >= AFTER) finish();
      }
    }
  };
  const JPG = opts.jpgOff, BEFORE = opts.before, AFTER = opts.after;

  // ---- the mover: runs before the original frame, sets the goal in map terms every frame (the frame changes at a swap, the map does not)
  const pointAt = (D, s) => {
    let i = 1;
    while (i < D.cum.length - 1 && D.cum[i] < s) i++;
    const a = D.pts[i - 1], b = D.pts[i], len = D.cum[i] - D.cum[i - 1] || 1, u = Math.max(0, Math.min(1, (s - D.cum[i - 1]) / len));
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  };
  const drivePre = (now) => {
    const D = R.D;
    if (!D || D.phase === 'done') return;
    const real = Math.min(0.05, Math.max(0, (now - st.last) / 1000));
    if (st.mode !== 'free') { D.phase = 'done'; D.reason = 'mode ' + st.mode; return; }
    if (performance.now() - D.t0 > D.timeout * 1000) { D.phase = 'done'; D.reason = 'timeout'; return; }
    const building = D.building && performance.now() - D.building < 40000;
    if (D.phase === 'move') {
      D.s = Math.min(D.endS, D.s + (D.s < D.hopLen ? D.hop : D.walk) * real);
      if (!D.swapSeen && !D.passedStop && D.s >= D.stopS) { D.s = D.stopS; D.passedStop = true; D.phase = 'hold'; D.holdT = 0; }
      else if (D.s >= D.endS) { D.phase = 'tail'; D.holdT = 0; }
    } else if (D.phase === 'hold' || D.phase === 'tail') {
      if (!building) D.holdT += real;
      if (D.holdT > D.holdMax) { if (D.phase === 'hold') D.phase = 'move'; else if (!D.swapSeen) { D.phase = 'done'; D.reason = 'no swap: rested at the end of the street and nothing happened'; } }
    }
    if (D.phase === 'done') return;
    const p = pointAt(D, D.s), sc = st.W.frame.S(p[0], p[1]);
    st.goal.tx = sc[0]; st.goal.tz = sc[1];
  };

  const orig = st._frame;
  R.orig = orig;
  st._frame = function (now) {
    try { drivePre(now); } catch (e) { err('drive', e); }
    const ret = orig.call(this, now); // (an error in the original frame propagates exactly as before)
    try { record(now); } catch (e) { err('record', e); }
    return ret;
  };

  // ---- called from Node
  R.prepare = (dist, el) => { if (st.mode !== 'free') st._setMode('free'); Object.assign(st.goal, { dist, el }); return st.mode; };
  R.startStep = (item, o) => {
    if (R.D && R.D.phase !== 'done') return { error: 'previous step still running' };
    const id = resolve(item);
    if (id < 0) return { error: 'unknown street: ' + item };
    const A0 = st.W.st.id;
    if (id === A0) return { error: 'the open street is already ' + item, same: true };
    const cur = curMap(), lines = polyMap(id);
    let best = { d: 1e9, li: -1 };
    lines.forEach((l, li) => { for (let i = 1; i < l.length; i++) {
      const ax = l[i - 1][0], ay = l[i - 1][1], ex = l[i][0] - ax, ey = l[i][1] - ay, t = Math.max(0, Math.min(1, ((cur[0] - ax) * ex + (cur[1] - ay) * ey) / (ex * ex + ey * ey || 1)));
      const d = Math.hypot(ax + ex * t - cur[0], ay + ey * t - cur[1]);
      if (d < best.d) best = { d, li };
    } });
    // the line, every 3 m
    const dense = [], L = lines[best.li];
    for (let i = 1; i < L.length; i++) {
      const n = Math.max(1, Math.ceil(Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]) / 3));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) dense.push([L[i - 1][0] + ((L[i][0] - L[i - 1][0]) * k) / n, L[i - 1][1] + ((L[i][1] - L[i - 1][1]) * k) / n]);
    }
    let k0 = 0, kd = 1e9;
    dense.forEach((p, i) => { const d = Math.hypot(p[0] - cur[0], p[1] - cur[1]); if (d < kd) { kd = d; k0 = i; } });
    const fwd = dense.slice(k0, k0 + 150), bwd = dense.slice(Math.max(0, k0 - 149), k0 + 1).reverse();
    const probe = (l) => (l.length ? offOf(l[Math.min(20, l.length - 1)][0], l[Math.min(20, l.length - 1)][1]) : -1);
    const walk = probe(fwd) >= probe(bwd) ? fwd : bwd;
    if (walk.length < 2) return { error: 'street too short to walk: ' + item };
    const slack = st.rig.dist * 0.035, thr = 15 + slack + o.margin;
    const okAt = (i) => { const p = walk[i]; return offOf(p[0], p[1]) >= thr && streetAt(p[0], p[1], 13 + slack, A0) === id; };
    let stop = -1, warn = null;
    for (let i = 0; i < walk.length - 2; i++) if (okAt(i) && okAt(i + 1) && okAt(i + 2)) { stop = i; break; }
    if (stop < 0) {
      let bo = -1;
      walk.forEach((p, i) => { if (streetAt(p[0], p[1], 13 + slack, A0) === id) { const v = offOf(p[0], p[1]); if (v > bo) { bo = v; stop = i; } } });
      warn = stop < 0 ? 'no point of the street is both far enough from the open street and nearest to the target' : 'no point reaches the off threshold (' + thr.toFixed(1) + ' m): best ' + bo.toFixed(1) + ' m';
      if (stop < 0) stop = walk.length - 1;
    }
    const pts = [cur, ...walk], cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    R.stepNo = o.step;
    R.D = { id, name: H.S[id].name, item, pts, cum, hopLen: cum[1], stopS: cum[stop + 1], endS: cum[cum.length - 1], s: 0, phase: 'move', hop: o.hop, walk: o.walk, holdMax: o.holdMax,
      t0: performance.now(), timeout: o.timeout, building: 0, swapSeen: false, passedStop: false, holdT: 0, reason: '', warn };
    return { id, name: H.S[id].name, from: W0(), hopLen: Math.round(cum[1]), stopS: Math.round(cum[stop + 1]), endS: Math.round(cum[cum.length - 1]), thr: Math.round(thr * 10) / 10, warn };
  };
  const W0 = () => st.W.st.name;
  R.abort = () => { if (R.D) { R.D.phase = 'done'; R.D.reason = R.D.reason || 'aborted'; } };
  R.noiseNow = () => {
    const D = R.D;
    if (R.ring.length < 60 || R.sinceSwap < 90 || R.post || (D && D.building && performance.now() - D.building < 40000)) return false;
    R.noise.push(R.ring.slice(-45));
    return true;
  };
  R.status = () => {
    const D = R.D, W = st.W;
    return { n: R.n, mode: st.mode, sid: W ? W.st.id : -1, sname: W ? W.st.name : '', windows: R.windows.length, post: !!R.post, postN: R.post ? R.post.after.length : 0, sinceSwap: R.sinceSwap,
      overlap: R.overlap, errs: R.errs.slice(), noise: R.noise.length, running: st.running,
      drive: D ? { phase: D.phase, s: Math.round(D.s), hopLen: Math.round(D.hopLen), stopS: Math.round(D.stopS), endS: Math.round(D.endS), reason: D.reason, building: !!(D.building && performance.now() - D.building < 40000), swapSeen: D.swapSeen, name: D.name } : null };
  };
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
  const slim = (f) => ({ sx: f.sx, n: f.n, t: f.t, mode: f.mode, swap: f.swap, sid: f.sid, sname: f.sname, lv: f.lv, cam: f.cam, tgt: f.tgt, dist: f.dist, el: f.el, az: f.az, cutK: f.cutK, ts: f.ts, hole: f.hole, cls: f.cls,
    cine: f.cine, flt: f.flt, flashOp: f.flashOp, top: f.top, anim: f.anim, pins: f.pins, ents: f.ents });
  /** One recorded window in parts: 'meta' (no pixels), 'th' (thumbnails, base64), 'jpg' (the frames at the given offsets to the swap, data URLs). */
  R.win = (k, part, offs) => {
    const w = R.windows[k];
    if (!w) return null;
    if (part === 'meta') return { idx: w.idx, step: w.step, swapIdx: w.swapIdx, fromName: w.fromName, fromId: w.fromId, toName: w.toName, toId: w.toId, fromLv: w.fromLv, toLv: w.toLv, planned: w.planned, intended: w.intended, frames: w.frames.map(slim) };
    if (part === 'th') return w.frames.map((f) => b64(f.th));
    const o = {};
    for (const off of offs || []) { const f = w.frames[w.swapIdx + off]; o[off] = f && f.jpg ? f.jpg : null; }
    return o;
  };
  R.noiseWin = (k, part) => {
    const fr = R.noise[k];
    if (!fr) return null;
    return part === 'th' ? fr.map((f) => b64(f.th)) : fr.map((f) => ({ n: f.n, t: f.t, hole: f.hole }));
  };
  /** Identities (helicopter .. cloud) that first appeared or last disappeared inside the picture, not at the first or the latest recorded frame. */
  R.lifeReport = () => {
    const last = R.n - 1, out = { frames: R.n, byKind: {}, examples: [] };
    for (const [id, L] of life) {
      const kn = KINDS[L[0]], b = (out.byKind[kn] ||= { seen: 0, appearedInView: 0, vanishedInView: 0 });
      b.seen++;
      const app = L[1] > 0 && L[2] === 1, van = L[3] < last && L[4] === 1;
      if (app) b.appearedInView++;
      if (van) b.vanishedInView++;
      if ((app || van) && (L[0] === 0 || out.examples.length < 30)) out.examples.push({ id, kind: kn, firstFrame: L[1], firstInView: L[2], firstOn: L[5], lastFrame: L[3], lastInView: L[4], lastOn: L[6] });
    }
    return out;
  };
  R.free = () => { for (const w of R.windows) for (const f of w.frames) { delete f.jpg; } };
  // self test: one real grab (a broken canvas copy would show up here, not 90 frames later)
  const test = { n: 0 };
  try { grab(test); need('canvas -> 2D thumbnail works (drawImage of the WebGL canvas, 64x40 getImageData)', test.th && test.th.length === 2560); } catch (e) { need('canvas -> 2D thumbnail works: ' + e.message, false); }
  return { checks, fatal: checks.some((c) => !c[1]), kinds: KINDS };
}

// =====================================================================================================================
// NODE SIDE
// =====================================================================================================================
const KINDS = ['heli', 'boat', 'gull', 'pigeon', 'stork', 'cloud', 'actor', 'vehicle', 'crowd'];
const PAIRED = new Set(['heli', 'boat', 'gull', 'pigeon', 'stork', 'cloud']); // kinds for which vanished and appeared identities are paired by distance
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
const sgn = (o) => (o < 0 ? '-' : '+') + String(Math.abs(o)).padStart(2, '0');

const lumD = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
/** Flash detector over a run of thumbnails: for every frame i, d(i-1,i), d(i,i+1), d(i-1,i+1) and score = min(first two) - third. */
function flashSeries(th, si) {
  const n = th.length, memo = new Map();
  const d = (i, j) => { const k = i * 1000 + j; let v = memo.get(k); if (v === undefined) { v = lumD(th[i], th[j]); memo.set(k, v); } return v; };
  const rows = [];
  let bestS = { v: -1e9, off: 0 }, bestD = { v: -1, off: 0 }, near = { v: -1e9, off: 0 };
  for (let i = 1; i < n; i++) {
    const a = d(i - 1, i);
    const row = { off: i - si, dPrev: a };
    if (a > bestD.v) bestD = { v: a, off: i - si };
    if (i < n - 1) {
      const b = d(i, i + 1), c = d(i - 1, i + 1);
      row.dNext = b; row.dSkip = c; row.score = Math.min(a, b) - c;
      if (row.score > bestS.v) bestS = { v: row.score, off: i - si };
      if (Math.abs(i - si) <= JPG_OFF - 1 && row.score > near.v) near = { v: row.score, off: i - si };
    }
    rows.push(row);
  }
  return { rows, bestS, bestD, near };
}
const predictEnt = (e1, e2, dt1, dtS) => {
  if (!e2 || dt1 <= 0) return { x: e1[2], y: e1[3], h: e1[4], hd: e1[5] };
  const k = dtS / dt1;
  return { x: e1[2] + (e1[2] - e2[2]) * k, y: e1[3] + (e1[3] - e2[3]) * k, h: e1[4] + (e1[4] - e2[4]) * k, hd: (e1[5] + wrap(e1[5] - e2[5]) * k + 360) % 360 };
};
/** Per kind: counts before/after the swap, identities on both sides (jump beyond own velocity), vanished and appeared (paired by distance). */
function kindStats(frames, si) {
  const P1 = frames[si - 1], P2 = frames[si - 2], S = frames[si];
  const dt1 = Math.min(50, P1.t - (P2 ? P2.t : P1.t)), dtS = Math.min(50, S.t - P1.t);
  const by2 = new Map((P2 ? P2.ents : []).map((e) => [e[0], e])), byS = new Map(S.ents.map((e) => [e[0], e])), by1 = new Map(P1.ents.map((e) => [e[0], e]));
  const out = {};
  KINDS.forEach((kn, ki) => {
    const b = P1.ents.filter((e) => e[1] === ki), a = S.ents.filter((e) => e[1] === ki);
    const st = { before: b.length, after: a.length, matched: 0, matchedMaxJump: 0, matchedMaxRaw: 0, matchedMaxDh: 0, matchedMaxHdg: 0, vanished: 0, appeared: 0, pairMax: 0, pairHdgMax: 0, pairs: [] };
    const van = [];
    for (const e of b) {
      const s = byS.get(e[0]);
      if (!s) { van.push(e); continue; }
      const p = predictEnt(e, by2.get(e[0]), dt1, dtS);
      st.matched++;
      st.matchedMaxRaw = Math.max(st.matchedMaxRaw, Math.hypot(s[2] - e[2], s[3] - e[3]));
      st.matchedMaxJump = Math.max(st.matchedMaxJump, Math.hypot(s[2] - p.x, s[3] - p.y));
      st.matchedMaxDh = Math.max(st.matchedMaxDh, Math.abs(s[4] - p.h));
      st.matchedMaxHdg = Math.max(st.matchedMaxHdg, Math.abs(wrap(s[5] - p.hd)));
    }
    const app = a.filter((e) => !by1.has(e[0]));
    st.vanished = van.length; st.appeared = app.length;
    if (PAIRED.has(kn) && van.length && app.length) {
      const cand = [];
      for (const v of van) { const p = predictEnt(v, by2.get(v[0]), dt1, dtS); for (const e of app) cand.push([Math.hypot(e[2] - p.x, e[3] - p.y), v, e, p]); }
      cand.sort((x, y) => x[0] - y[0]);
      const usedV = new Set(), usedA = new Set();
      for (const [d, v, e, p] of cand) {
        if (usedV.has(v[0]) || usedA.has(e[0])) continue;
        usedV.add(v[0]); usedA.add(e[0]);
        const dh = Math.abs(wrap(e[5] - p.hd));
        st.pairMax = Math.max(st.pairMax, d); st.pairHdgMax = Math.max(st.pairHdgMax, dh);
        if (st.pairs.length < 6) st.pairs.push({ from: { x: r1(v[2]), y: r1(v[3]), h: r1(v[4]), hd: r1(v[5]) }, to: { x: r1(e[2]), y: r1(e[3]), h: r1(e[4]), hd: r1(e[5]) }, dist: r1(d), dHeading: r1(dh), dHeight: r1(Math.abs(e[4] - p.h)) });
      }
    }
    for (const k of ['matchedMaxJump', 'matchedMaxRaw', 'matchedMaxDh', 'matchedMaxHdg', 'pairMax', 'pairHdgMax']) st[k] = r2(st[k]);
    out[kn] = st;
  });
  return out;
}
/** "!" pins: counts and the largest screen jump of a pin to the nearest pin after (px). */
function pinStats(frames, si) {
  const b = frames[si - 1].pins, a = frames[si].pins;
  let jump = null;
  if (b.length && a.length) jump = Math.max(...b.map((p) => Math.min(...a.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))));
  return { before: b.length, after: a.length, after10: frames[Math.min(frames.length - 1, si + 10)].pins.length, maxJumpPx: jump === null ? null : Math.round(jump) };
}
/** What the DOM showed around the swap (the thumbnails do not see it). */
function domStats(frames, si) {
  const w = frames.slice(Math.max(0, si - 3), si + 4);
  const u = (k) => [...new Set(w.map((f) => f[k]))];
  return { flashOpMax: Math.max(...w.map((f) => f.flashOp || 0)), filters: u('flt'), classes: u('cls'), top: u('top'), anims: u('anim'), holeMax: Math.max(...w.map((f) => f.hole)), cutK: w.map((f) => f.cutK) };
}

async function writePics(B, w, rec, fl) {
  fs.mkdirSync(picsDir, { recursive: true });
  // pictures exist for |off| <= JPG_OFF and for every frame the page captured as an anomaly (and its neighbours), wherever it fell in the window
  const worst = fl.bestS.off, near = fl.near.off, jump = fl.bestD.off;
  const tags = new Map();
  const tag = (o, t) => tags.set(o, (tags.get(o) || '') + t);
  for (const o of [worst - 1, worst, worst + 1]) tag(o, o === worst ? '_flash-worst' : '_flash-nbr');
  if (near !== worst) for (const o of [near - 1, near, near + 1]) tag(o, o === near ? '_near-worst' : '_near-nbr');
  for (const o of [jump - 1, jump]) tag(o, o === jump ? '_jump-at' : '_jump-before');
  const all = [...tags.keys()];
  const got = await B.ev(`window.__swapRec.win(${w.idx}, 'jpg', ${JSON.stringify(all)})`);
  const base = `s${String(rec.step).padStart(2, '0')}_${slug(rec.from)}__${slug(rec.to)}`;
  const files = [], worstFiles = [];
  for (const o of all) {
    const url = got && got[o];
    if (!url) continue;
    const f = path.join(picsDir, `${base}_off${sgn(o)}${tags.get(o)}.jpg`);
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    files.push(f);
    if (tags.get(o).startsWith('_flash')) worstFiles.push(f);
  }
  return { worstOff: worst, nearOff: near, files, worstFiles, missing: all.filter((o) => !(got && got[o])) };
}

const B = await launch({ width, height, dpr: 1, tag: 'swap' });
const result = { tool: 'dev-swap', started: new Date().toISOString(), args: { route, loops, time, seed, lvl, only: only || 'any', width, height, view, drive },
  thresholds: { FLASH_SCORE, CUT_JUMP, HELI_JUMP_M, HELI_HDG_DEG, BEFORE, AFTER, JPG_OFF }, checks: [], steps: [], swaps: [], noise: [], totals: {} };
let exitCode = 0;
try {
  try { await B.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); } catch (e) { /* window size flag stays */ }
  const first = route[0], byId = first[0] === '#';
  const opened = await B.open(byId ? 'x' : first, { time, only, seed, lvl, query: byId ? `x=1#s=${+first.slice(1)}` : '' });
  if (!opened) throw new Error(`the first street "${first}" did not open (no landing in time): dev server up on :5190? exact name?`);
  const inst = await B.ev(`(${pageInstall})(${JSON.stringify({ jpgOff: JPG_OFF, before: BEFORE, after: AFTER, capScore: CAP_SCORE, capD: CAP_D, capMax: CAP_MAX })})`);
  result.checks = inst.checks;
  console.log('internals found:\n  ' + inst.checks.map((c) => (c[1] ? 'ok      ' : 'MISSING ') + c[0]).join('\n  '));
  if (inst.fatal) throw new Error('missing internals: ' + inst.checks.filter((c) => !c[1]).map((c) => c[0]).join('; '));
  console.log(`viewport ${width}x${height}, view dist ${view.dist} m el ${view.el} rad, time ${time}, lvl ${lvl}, only ${only || 'any'}, ${loops} loop(s) of ${route.length - 1} steps`);
  const mode = await B.ev(`window.__swapRec.prepare(${view.dist}, ${view.el})`);
  await sleep(2500);
  console.log(`free camera on "${(await B.ev('window.__swapRec.status()')).sname}" (mode ${mode}); travelling ${route.join(' > ')}`);

  const steps = [];
  for (let l = 0; l < loops; l++) for (const item of route.slice(1)) steps.push(item);
  let fetched = 0, noiseTaken = 0;
  const table = [];
  const grabNew = async (upTo) => {
    for (; fetched < upTo; fetched++) {
      const meta = await B.ev(`window.__swapRec.win(${fetched}, 'meta')`);
      const thB = await B.ev(`window.__swapRec.win(${fetched}, 'th')`);
      const th = thB.map((s) => new Uint8Array(Buffer.from(s, 'base64')));
      const fr = meta.frames, si = meta.swapIdx;
      if (si < 2) { result.swaps.push({ step: meta.step, from: meta.fromName, to: meta.toName, error: 'swap too early in the recording' }); continue; }
      const fl = flashSeries(th, si), ks = kindStats(fr, si), pins = pinStats(fr, si), dom = domStats(fr, si);
      const h = ks.heli;
      const rec = { step: meta.step, from: meta.fromName, fromId: meta.fromId, fromLevel: meta.fromLv, to: meta.toName, toId: meta.toId, toLevel: meta.toLv, planned: meta.planned, intended: meta.intended, time, swapFrameIndex: si, windowFrames: fr.length,
        swapFrameT: Math.round(fr[si].t), cam: fr[si].cam, helicopters: { before: h.before, after: h.after, countChanged: h.before !== h.after, identityJumpM: h.matchedMaxJump, identityRawM: h.matchedMaxRaw, identityHeadingDeg: h.matchedMaxHdg,
          vanished: h.vanished, appeared: h.appeared, pairedJumpM: h.pairMax, pairedHeadingDeg: h.pairHdgMax, pairedHeightM: h.pairs.length ? Math.max(...h.pairs.map((p) => p.dHeight)) : 0, pairs: h.pairs },
        kinds: ks, pins, dom,
        flash: { maxScore: r2(fl.bestS.v), atOffset: fl.bestS.off, maxScoreNear: r2(fl.near.v), nearOffset: fl.near.off, maxD: r2(fl.bestD.v), maxDAtOffset: fl.bestD.off, swapFrameD: r2(fl.rows.find((x) => x.off === 0).dPrev),
          isFlash: fl.bestS.v >= FLASH_SCORE, isFlashNear: fl.near.v >= FLASH_SCORE, isJumpCut: fl.bestD.v >= CUT_JUMP, series: fl.rows.map((x) => [x.off, r2(x.dPrev), x.score === undefined ? null : r2(x.score)]) } };
      rec.helicopters.largestJumpM = r2(Math.max(h.matchedMaxJump, h.pairMax));
      rec.helicopters.largestHeadingDeg = r2(Math.max(h.matchedMaxHdg, h.pairHdgMax));
      const sxs = (f) => (f && f.sx ? Object.entries(f.sx).map(([k, v]) => k + '=' + v).join(' ') : '-');
      rec.anomalies = fl.rows.filter((x) => (x.score !== undefined && x.score >= CAP_SCORE) || x.dPrev >= CAP_D).sort((p, q) => (q.score ?? -1e9) - (p.score ?? -1e9)).slice(0, CAP_MAX).map((x) => {
        const i = si + x.off;
        return { off: x.off, score: x.score === undefined ? null : r2(x.score), d: r2(x.dPrev), hole: fr[i].hole, before: fr[i - 1].sx, frame: fr[i].sx, after: fr[i + 1] ? fr[i + 1].sx : null };
      });
      for (const an of rec.anomalies.slice(0, 6)) {
        const i = si + an.off;
        console.log(`  ANOMALY swap ${meta.idx + 1} (step ${meta.step}, ${meta.fromName} > ${meta.toName}) off ${an.off} score ${an.score} d ${an.d} hole ${an.hole}\n     before: ${sxs(fr[i - 1])}\n     frame : ${sxs(fr[i])}\n     after : ${sxs(fr[i + 1])}`);
      }
      try { rec.pics = await writePics(B, meta, rec, fl); } catch (e) { rec.pics = { error: String(e.message || e) }; }
      result.swaps.push(rec);
      let van = 0, app = 0;
      for (const kn of KINDS) { van += ks[kn].vanished; app += ks[kn].appeared; }
      table.push([String(meta.step).padStart(2), (`${meta.fromName} > ${meta.toName} ${meta.fromLv}>${meta.toLv}` + (meta.planned === false ? ' (unplanned)' : '')).slice(0, 40).padEnd(40), `${h.before}/${h.after}`.padStart(5), String(rec.helicopters.largestJumpM).padStart(7),
        String(rec.helicopters.largestHeadingDeg).padStart(6), `${van}/${app}`.padStart(8), `${pins.before}/${pins.after}`.padStart(5), String(pins.maxJumpPx ?? '-').padStart(5),
        `${r2(fl.bestS.v)}@${fl.bestS.off}`.padStart(10), `${r2(fl.bestD.v)}@${fl.bestD.off}`.padStart(10)]);
      console.log('  swap ' + table[table.length - 1].join(' '));
    }
  };
  console.log('  swap  # from > to                                heli  hJump m  hHdg  van/app  pins   pJ      flash       maxD');

  for (let si = 0; si < steps.length; si++) {
    const item = steps[si];
    const stepRec = { step: si + 1, item };
    const plan = await B.ev(`window.__swapRec.startStep(${JSON.stringify(item)}, ${JSON.stringify({ ...drive, step: si + 1 })})`);
    stepRec.plan = plan;
    if (plan.error) { stepRec.swapped = false; stepRec.reason = plan.error; result.steps.push(stepRec); console.log(`  step ${si + 1} ${item}: not started (${plan.error})`); continue; }
    const t0 = Date.now();
    let s, noiseThisStep = false;
    for (;;) {
      await sleep(400);
      s = await B.ev('window.__swapRec.status()');
      if (!s.running) { stepRec.reason = 'stage stopped running (context lost?)'; break; }
      if (!noiseThisStep && noiseTaken < 6 && s.drive && s.drive.phase === 'move' && !s.drive.swapSeen && s.drive.s > s.drive.hopLen + 8 && await B.ev('window.__swapRec.noiseNow()')) { noiseThisStep = true; noiseTaken++; }
      if (s.drive && s.drive.phase === 'done') break;
      if (Date.now() - t0 > (drive.timeout + 20) * 1000) { await B.ev('window.__swapRec.abort()'); stepRec.reason = 'node-side timeout'; break; }
    }
    // wait for a window that is still being recorded
    for (let i = 0; i < 100 && (await B.ev('window.__swapRec.status()')).post; i++) await sleep(300);
    s = await B.ev('window.__swapRec.status()');
    const before = fetched;
    await grabNew(s.windows);
    const mine = result.swaps.slice(before);
    stepRec.swapped = mine.some((x) => x.planned);
    stepRec.windows = mine.length;
    stepRec.landedOn = s.sname;
    stepRec.reason = stepRec.swapped ? 'swap' : stepRec.reason || (s.drive && s.drive.reason) || 'unknown';
    stepRec.seconds = Math.round((Date.now() - t0) / 100) / 10;
    if (s.errs.length) stepRec.pageErrors = s.errs;
    result.steps.push(stepRec);
    if (!stepRec.swapped) console.log(`  step ${si + 1} ${item}: NO planned swap (${stepRec.reason}); now on "${s.sname}"${plan.warn ? '; plan warning: ' + plan.warn : ''}`);
  }
  const fin = await B.ev('window.__swapRec.status()');
  for (let i = 0; i < 100 && (await B.ev('window.__swapRec.status()')).post; i++) await sleep(300);
  await grabNew((await B.ev('window.__swapRec.status()')).windows);

  // ---- noise floor: ordinary frames while the camera travels
  for (let k = 0; k < noiseTaken; k++) {
    const th = (await B.ev(`window.__swapRec.noiseWin(${k}, 'th')`)).map((x) => new Uint8Array(Buffer.from(x, 'base64')));
    const fl = flashSeries(th, 0);
    result.noise.push({ frames: th.length, maxScore: r2(Math.max(...fl.rows.filter((x) => x.score !== undefined).map((x) => x.score))), maxD: r2(fl.bestD.v) });
  }

  // ---- whole run: what appeared or disappeared in view
  const life = await B.ev('window.__swapRec.lifeReport()');
  // ---- totals
  const sw = result.swaps.filter((x) => !x.error);
  const planned = sw.filter((x) => x.planned);
  const maxOf = (f, list = sw) => (list.length ? Math.max(...list.map(f)) : 0);
  const worstFlash = sw.reduce((b, x) => (!b || x.flash.maxScore > b.flash.maxScore ? x : b), null);
  const worstNear = sw.reduce((b, x) => (!b || x.flash.maxScoreNear > b.flash.maxScoreNear ? x : b), null);
  result.totals = {
    swapsRecorded: sw.length, plannedSwaps: planned.length, unplannedSwaps: sw.length - planned.length, routeStepsTotal: steps.length, routeStepsWithoutSwap: result.steps.filter((x) => !x.swapped).length,
    routeStepsWithoutSwapWhy: result.steps.filter((x) => !x.swapped).map((x) => `${x.step} ${x.item}: ${x.reason}`),
    helicopters: { swapsWithHelicopters: sw.filter((x) => x.helicopters.before || x.helicopters.after).length, countChanges: sw.filter((x) => x.helicopters.countChanged).length, vanishedTotal: sw.reduce((a, x) => a + x.helicopters.vanished, 0), appearedTotal: sw.reduce((a, x) => a + x.helicopters.appeared, 0),
      largestJumpM: r2(maxOf((x) => x.helicopters.largestJumpM)), largestHeadingDeg: r2(maxOf((x) => x.helicopters.largestHeadingDeg)), swapsOverJumpLimit: sw.filter((x) => x.helicopters.largestJumpM > HELI_JUMP_M).length },
    pins: { countChanges: sw.filter((x) => x.pins.before !== x.pins.after).length, largestJumpPx: maxOf((x) => x.pins.maxJumpPx || 0) },
    flash: { worstScore: worstFlash ? worstFlash.flash.maxScore : 0, worstAt: worstFlash ? `${worstFlash.from} > ${worstFlash.to} off ${worstFlash.flash.atOffset}` : null, windowsOverFlashScore: sw.filter((x) => x.flash.isFlash).length,
      worstScoreNearSwap: worstNear ? worstNear.flash.maxScoreNear : 0, worstNearAt: worstNear ? `${worstNear.from} > ${worstNear.to} off ${worstNear.flash.nearOffset}` : null, windowsOverFlashScoreNearSwap: sw.filter((x) => x.flash.isFlashNear).length,
      worstMaxD: r2(maxOf((x) => x.flash.maxD)), windowsOverCutJump: sw.filter((x) => x.flash.isJumpCut).length, worstSwapFrameD: r2(maxOf((x) => x.flash.swapFrameD)) },
    dom: { windowsWithFlashOverlay: sw.filter((x) => x.dom.flashOpMax > 0.05).length, windowsWithCanvasFilter: sw.filter((x) => x.dom.filters.some((v) => v && v !== 'none')).length },
    noiseFloor: { windows: result.noise.length, maxScore: r2(maxOf((x) => x.maxScore, result.noise)), maxD: r2(maxOf((x) => x.maxD, result.noise)) },
    inView: life, levels: [...new Set(sw.map((x) => `${x.fromLevel}>${x.toLevel}`))],
    pageErrors: fin.errs, consoleErrors: [...new Set(B.errs)].slice(0, 20), overlappingSwapsIgnored: fin.overlap,
  };
  // the worst frame as a picture: copy its files to WORST_*
  if (worstFlash && worstFlash.pics && worstFlash.pics.worstFiles) {
    result.totals.worstPics = worstFlash.pics.worstFiles.map((f) => { const to = path.join(picsDir, 'WORST_' + path.basename(f)); fs.copyFileSync(f, to); return to; });
  }
  result.finished = new Date().toISOString();
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
  const T = result.totals;
  console.log('\n=== totals ===');
  console.log(`swaps recorded ${T.swapsRecorded} (planned ${T.plannedSwaps}, unplanned ${T.unplannedSwaps}); route steps without a swap: ${T.routeStepsWithoutSwap} of ${T.routeStepsTotal}${T.routeStepsWithoutSwapWhy.length ? '\n  ' + T.routeStepsWithoutSwapWhy.join('\n  ') : ''}`);
  console.log(`helicopters: count changes ${T.helicopters.countChanges}, vanished ${T.helicopters.vanishedTotal}, appeared ${T.helicopters.appearedTotal}, largest jump ${T.helicopters.largestJumpM} m, heading ${T.helicopters.largestHeadingDeg} deg, swaps over ${HELI_JUMP_M} m: ${T.helicopters.swapsOverJumpLimit}`);
  console.log(`pins: count changes ${T.pins.countChanges}, largest jump ${T.pins.largestJumpPx} px`);
  console.log(`level pairs at the swaps: ${T.levels.join(', ') || '-'}`);
  console.log(`whole run (${T.inView.frames} frames), identities that appeared / vanished IN VIEW: ${Object.entries(T.inView.byKind).map(([k, b]) => `${k} ${b.appearedInView}/${b.vanishedInView} of ${b.seen}`).join(', ') || '-'}`);
  for (const x of T.inView.examples.filter((x) => x.kind === 'heli')) console.log(`  HELICOPTER ${x.firstInView ? 'appeared in view on ' + x.firstOn + ' (frame ' + x.firstFrame + ')' : ''}${x.firstInView && x.lastInView ? '; ' : ''}${x.lastInView ? 'vanished in view on ' + x.lastOn + ' (frame ' + x.lastFrame + ')' : ''}`);
  console.log(`flash (whole window): worst score ${T.flash.worstScore} (${T.flash.worstAt}); windows over ${FLASH_SCORE}: ${T.flash.windowsOverFlashScore}; within +-${JPG_OFF - 1} of the swap: worst ${T.flash.worstScoreNearSwap} (${T.flash.worstNearAt}), windows over: ${T.flash.windowsOverFlashScoreNearSwap}; worst plain d ${T.flash.worstMaxD}, over ${CUT_JUMP}: ${T.flash.windowsOverCutJump}; worst d at the swap frame ${T.flash.worstSwapFrameD}`);
  console.log(`noise floor (${T.noiseFloor.windows} x 45 ordinary frames): max score ${T.noiseFloor.maxScore}, max d ${T.noiseFloor.maxD}`);
  console.log(`DOM: windows with flash overlay ${T.dom.windowsWithFlashOverlay}, with a canvas filter ${T.dom.windowsWithCanvasFilter}`);
  console.log(`page errors: ${T.pageErrors.length ? T.pageErrors.join(' | ') : 'none'}; console errors: ${T.consoleErrors.length ? T.consoleErrors.join(' | ') : 'none'}`);
  console.log(`written: ${outFile}; pictures: ${picsDir}${T.worstPics ? ' (WORST_* = worst flash frame and neighbours)' : ''}`);
} catch (e) {
  console.error('dev-swap failed: ' + (e && e.stack ? e.stack : e));
  exitCode = 1;
  try { result.error = String(e && e.message ? e.message : e); fs.writeFileSync(outFile, JSON.stringify(result, null, 1)); } catch (e2) { /* nothing more to save */ }
} finally {
  await B.close();
  process.exitCode = exitCode;
}
