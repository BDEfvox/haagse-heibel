// Dev tool: the frame-time benchmark of the 3D city. One run records the time of every frame in real time (no fast-forward) through
// a fixed script and writes one JSON; a table per leg and a pass/fail line per target go to the screen.
//
// WHAT IT MEASURES (legs, in this order; pick with --legs a,b,c)
//   flight   three places, a fixed street-level camera flight of ~20 s at 12 m/s along each: a dense centre street, a square with
//            terraces, a wide road with a tram. The camera is taken over the way a user's first drag does (stage._take) and moved
//            by writing the goal fields the drag/key handlers write (goal.tx, tz, az, el, dist). Tiles stream in while it flies.
//   switch   the camera target is moved onto a neighbouring street so that main.js's own shiftFocus runs (stage.show with keep);
//            back and forth (--swaps 6 = three round trips). Windows: 3 s before to 5 s after the swap, plus the build period.
//   sky      stage.setSky('night') then back to 'day': from the call until the transition and the tile re-bake are over, plus 3 s.
//   scene    one scene played with stage.debugPlay in follow mode (the director's camera), until it is done (--scene <name>).
//   walk     the player-controlled walking character: press the HUD button that drops him, walk 20 s along the street with the player's
//            keys (see walkLeg; skipped with a message while the button does not exist). Counted with flight and scene in the verdict.
//   streets  ten streets one after another in one page session (the same openStreet the map and the Next button call), 6 s each;
//            renderer.info.memory and the JS heap after every street (after a garbage collection).
//
// HOW TO RUN
//   1. Start the dev server `heibel-audit` (port 5190, no auto-reload; HEIBEL_URL=... for another address).
//   2. Close everything else that draws (browser tabs on the site, other scripts, screen recordings). Run it at normal priority on an
//      otherwise idle machine: node scripts/dev-bench.mjs bench-base.json
//   usage: node scripts/dev-bench.mjs <out.json> [--legs flight,switch,sky,scene,walk,streets] [--seed bench] [--time 14:00]
//            [--lite] [--plain] [--scene <name>] [--speed 12] [--secs 20] [--dist 45] [--el 0.25] [--swaps 6] [--hold 6]
//            [--hz 60] [--centre "<street>"] [--square "<street>"] [--tram "<street>"] [--baseline other.json] [--preflight]
//   --lite       force the phone path: stage.lite, the 30% crowd and tile budgets and the half-size height map (see LITE below).
//   --plain      no per-method timing wrappers, no stall heartbeat, no GPU timer: only the frame hook (time between frames, time
//                inside _frame, renderer.info). Run it once to check that the wrappers do not change the distribution
//                (the default run costs about 1 microsecond per wrapped call, some 20 calls a frame: see "wrapper cost" in the JSON).
//   --preflight  only print the street choices and the switch targets, from public/data (no browser is started).
//   --baseline   after the run, print the change per leg against an earlier JSON of this tool.
//   --probe      extra instrumentation (off by default, so a run without it stays comparable with earlier baselines):
//                - programs: renderer.info.programs.length per frame, and every new program (frame, name, a hash of its cacheKey);
//                - WebGL: on the stage's own context, time and bytes per frame of bufferData/bufferSubData (buffer uploads),
//                  texImage2D/texSubImage2D/texStorage2D (texture uploads; canvas sources counted apart), generateMipmap,
//                  compileShader/linkProgram (compiles) and getProgramParameter/getShaderParameter (where a pending compile is
//                  waited for), split into "in the frame" and "between frames";
//                - garbage collection: DevTools tracing (devtools.timeline, disabled-by-default-v8.gc, v8, gpu, toplevel) during the
//                  sky and streets legs and the first flight; only GC events, long tasks (>= 50 ms) and long GPU tasks (>= 8 ms)
//                  are kept, aligned to the frames through a console.timeStamp in the page;
//                - markers: show -> begin (buildWorld, fetch included), _begin, the first render after a begin (performance.measure
//                  'bench:*'). The corridor tiles, dress() and the fronts scan are module-level functions of world.js: not
//                  reachable without editing src (their time is inside show -> begin);
//                - after the streets leg: the geometries the renderer counts, split into those reachable from the scene, those of
//                  tiles that are cached but not on screen (tileOf over the city's index), and the remainder.
//   --walk-button <css>   the walk leg: the HUD button that drops the walking character (default: a few likely selectors)
//   --walk-keys w,a,d     the keys the player walks with (forward, left, right; default w,a,d)
//
// HOW TO READ THE OUTPUT
//   frames   one number per frame: ms from the start of this frame's rAF callback (the rAF time stamp) to the start of the next one.
//            This is what the viewer sees as the frame time. cpu = ms the frame's own _frame call took on the main thread.
//            If frames >> cpu the main thread was not busy in the frame: something else ran between frames (kind
//            'between-frames', usually an async world build chunk or a tile fetch) or the picture was late (kind 'late-present':
//            graphics chip or compositor). gpu = EXT_disjoint_timer_query_webgl2 time of the render call, when the browser has it.
//   dropped  frames whose time is 1.5x the median or more (a missed vsync); the >16.7 count also includes jitter.
//   calls/tris   renderer.info.render.calls / triangles of the frame (autoReset is on: info is reset at the start of render(), and the
//            shadow pass runs inside the same render() call, so one frame's numbers include the shadow map; sampled right after render).
//   long     the 10 longest frames of a leg: index, time, and what happened. 'parts' are inclusive durations of the wrapped
//            methods inside the frame (nested: _frame > W.lod > stream.update > ...); 'after' are wrapped calls that ran between this
//            frame and the next (the swap, the teardown); 'events' are show/swap/sky/scene markers; 'stalls' are timer heartbeat
//            gaps (main thread blocked); loaf/longtask are the browser's own long-frame entries (>= 50 ms only).
//   gov      the resolution governor: pixel ratio and level at the start and the end of the leg, and every change.
//   Not reachable from the page (module-level functions): buildWorld, ensureTile, buildTile, placeTile, furnishTile, loadTile. Their cost
//   shows up as stream.update / 'between-frames' time, `tiles` (tiles built in the frame) and stalls.
//   headless Chrome's rAF is driven at 60 Hz by the browser; it is a good model of the display, not the display itself.
//
// LITE: stage.js:176 and world.js:92 decide it with the same test, matchMedia('(pointer: coarse)').matches || min(innerWidth,
//   innerHeight) < 560. --lite makes matchMedia('(pointer: coarse)') answer true (a script added before every navigation), so the
//   window stays 1440 x 900 at dpr 2; the stage then caps its pixel ratio at 1.5 (stage.js:178). The self-check verifies it.
import fs from 'node:fs';
import { launch, args, sleep } from './dev-lib.mjs';

const A = args();
const OUT = A._[0];
const ALL_LEGS = ['flight', 'switch', 'sky', 'scene', 'walk', 'streets'];
const LEGS = A.legs ? String(A.legs).split(',').map((s) => s.trim()).filter(Boolean) : ALL_LEGS;
const num = (v, d) => (Number.isFinite(+v) && v !== true && v !== undefined ? +v : d);
const O = {
  seed: A.seed && A.seed !== true ? String(A.seed) : 'bench', time: A.time && A.time !== true ? String(A.time) : '14:00',
  lite: !!A.lite, plain: !!A.plain, hz: num(A.hz, 60), speed: num(A.speed, 12), secs: num(A.secs, 20), dist: num(A.dist, 45), el: num(A.el, 0.25),
  swaps: Math.max(1, Math.round(num(A.swaps, 6))), hold: num(A.hold, 6), warm: num(A.warm, 4), scene: A.scene && A.scene !== true ? String(A.scene) : null,
  probe: !!A.probe, walkButton: A['walk-button'] && A['walk-button'] !== true ? String(A['walk-button']) : null,
  walkKeys: (A['walk-keys'] && A['walk-keys'] !== true ? String(A['walk-keys']) : 'w,a,d').split(',').map((k) => k.trim()).filter(Boolean),
};
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

// ------------------------------------------------------------------------------------------------ the places (chosen from public/data)
// Checked in Node from streets.geojson and the world tiles (see the notes in the report of the author, and the page-side
// 'window' record of every flight: tramNear, rail points, terrace props found).
const PLACES = [
  { key: 'centre', id: 2001, name: 'Noordeinde', pick: 'centre', why: 'dense old centre, shop fronts on both sides (18 buildings and 24 POIs per 100 m within 25 m of the line)' },
  { key: 'square', id: 1001, name: 'Grote Markt', pick: 'terrace', why: 'curated square (places.js grote-markt: big terraces, a continuous terrace field, garlands); all of its line lies inside the place box' },
  { key: 'tram', id: 2752, name: 'Torenstraat', pick: 'tram', why: 'tertiary road, 2 lanes of 7.4 m, tram rails (tile l, kind 1) within 6 m along 52% of its line' },
];
const SWITCH_PAIR = [{ id: 1160, name: 'Hofweg' }, { id: 418, name: 'Buitenhof' }];
// ten different streets for the memory leg (centre, squares, residential, wide roads, the coast)
const TEN = [2001, 1001, 2752, 627, 1160, 3090, 2203, 2261, 1676, 919]; // Noordeinde, Grote Markt, Torenstraat, Denneweg, Hofweg, Wagenstraat, Plein, Prinsestraat, Lijnbaan, Gevers Deynootweg
const SCENES = ['bikeThief', 'carBreakIn', 'pickpocket', 'fenderBender', 'burglar', 'scooterSnatch', 'shopHeist', 'graffiti']; // mid-weight scenes first

// ------------------------------------------------------------------------------------------------ the street data in Node
// The same projection and bins as src/main.js:50-83 (streetAt): used to find the points where main.js's own shiftFocus will fire.
const KX = 68430, KY = 111267, LON0 = 4.3, LAT0 = 52.07, CELL = 64;
let STREETS = null;
function loadStreets() {
  if (STREETS) return STREETS;
  const g = JSON.parse(fs.readFileSync(new URL('../public/data/streets.geojson', import.meta.url), 'utf8'));
  const S = g.features.map((f, i) => ({ ...f.properties, id: f.id ?? i, lname: f.properties.name.toLowerCase(), lines: f.geometry.coordinates.map((l) => l.map((c) => [(c[0] - LON0) * KX, (c[1] - LAT0) * KY])) }));
  const segs = new Map();
  S.forEach((p, id) => {
    for (const line of p.lines) for (let i = 1; i < line.length; i++) {
      const [ax, ay] = line[i - 1], [bx, by] = line[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL / 2)));
      let last = null;
      for (let k = 0; k <= n; k++) {
        const key = Math.floor((ax + ((bx - ax) * k) / n) / CELL) * 4096 + Math.floor((ay + ((by - ay) * k) / n) / CELL);
        if (key === last) continue;
        last = key;
        let bin = segs.get(key);
        if (!bin) segs.set(key, (bin = []));
        bin.push(id, ax, ay, bx, by);
      }
    }
  });
  STREETS = { S, segs };
  return STREETS;
}
function streetAtNode(x, y, max, skip) {
  const { segs } = loadStreets(), cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), n = Math.ceil(max / CELL);
  let best = -1, bd = max;
  for (let dx = -n; dx <= n; dx++) for (let dy = -n; dy <= n; dy++) {
    const bin = segs.get((cx + dx) * 4096 + cy + dy);
    if (!bin) continue;
    for (let i = 0; i < bin.length; i += 5) {
      if (bin[i] === skip) continue;
      const ax = bin[i + 1], ay = bin[i + 2], ex = bin[i + 3] - ax, ey = bin[i + 4] - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
      const d = Math.hypot(ax + ex * t - x, ay + ey * t - y);
      if (d < bd) { bd = d; best = bin[i]; }
    }
  }
  return best;
}
const distToStreet = (x, y, id) => {
  let d = 1e9;
  for (const line of loadStreets().S[id].lines) for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], ex = line[i][0] - ax, ey = line[i][1] - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, Math.hypot(ax + ex * t - x, ay + ey * t - y));
  }
  return d;
};
/**
 * Points on street `to` where the roam hook of main.js fires shiftFocus for a camera that rests there with the street `from` open:
 * at least `minD` m from `from` (off >= 15 + 0.035 * dist), `to` the nearest other street within 13 + 0.035 * dist, length >= 25 m.
 * Nearest to `from` first, thinned out. Returns [[lng, lat], ...].
 */
function neighbourPoints(from, to, dist, minD = 30) {
  const { S } = loadStreets(), slack = dist * 0.035, out = [];
  if (S[to].len < 25) return out;
  for (const line of S[to].lines) for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], [bx, by] = line[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n, d = distToStreet(x, y, from);
      if (d < minD) continue;
      if (streetAtNode(x, y, 13 + slack, from) !== to) continue;
      out.push({ d, ll: [LON0 + x / KX, LAT0 + y / KY] });
    }
  }
  out.sort((p, q) => p.d - q.d);
  return out.filter((_, i) => i % 4 === 0).slice(0, 14).map((p) => p.ll);
}
/** The first street with this name, the way `?q=` finds it (main.js:531). */
const firstByName = (name) => loadStreets().S.find((p) => p.lname === String(name).toLowerCase());

// ------------------------------------------------------------------------------------------------ the page side
/**
 * Runs in the page (it is sent as source: it may use nothing from this file). Installs window.__bench: the frame hook, the timing
 * wrappers, the observers, and the drivers of the legs. Returns { ok } or { error }.
 */
function pageInit(cfg) {
  const H = window.__heibel;
  if (!H || !H.stage || !H.stage.renderer) return { error: 'window.__heibel.stage is missing (this needs the dev server, launch config heibel-audit)' };
  if (window.__bench) return { ok: true, reused: true };
  const st = H.stage, rend = st.renderer, info = rend.info;
  const MAXF = 16000, MAXL = 80;
  const nowMs = () => performance.now();
  const sleepP = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
  const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

  // ---- the recorder: flat typed arrays, nothing allocated per frame
  const labels = [], labelIx = new Map();
  const lab = (name) => {
    let i = labelIx.get(name);
    if (i === undefined) { if (labels.length >= MAXL) return MAXL - 1; i = labels.length; labels.push(name); labelIx.set(name, i); }
    return i;
  };
  const R = {
    on: false, inFrame: false, n: 0, hi: 0, cur: -1, t00: 0, prevNow: null, lastW: null, lastPR: null, preDirty: false, overflow: false, driver: null,
    dt: new Float64Array(MAXF), cpu: new Float64Array(MAXF), t0: new Float64Array(MAXF), gpu: new Float32Array(MAXF).fill(NaN), calls: new Float32Array(MAXF),
    tris: new Float32Array(MAXF), built: new Float32Array(MAXF), sms: new Float32Array(MAXF), flag: new Uint8Array(MAXF),
    parts: new Float32Array(MAXF * MAXL), after: new Float32Array(MAXF * MAXL), pre: new Float32Array(MAXL),
    events: [], stalls: [], loaf: [], longtask: [], prChanges: [], govStart: null,
  };
  let showCalls = 0;
  // ---- the probe (--probe): WebGL calls per frame, programs per frame, markers
  const NG = 12, GL_NAMES = ['bufMs', 'bufKB', 'texMs', 'texKB', 'texCanvas', 'mipMs', 'compileMs', 'linkMs', 'syncMs', 'storageMs', 'calls', 'programs'];
  const P = cfg.probe ? { inF: new Float32Array(MAXF * NG), outF: new Float32Array(MAXF * NG), prog: [], seen: new Set(), lastN: -1, firstAfterBegin: false } : null;
  const ev = (label, extra) => { if (R.on) R.events.push(Object.assign({ label, t: nowMs(), frame: R.n }, extra || null)); };
  const add = (ix, ms) => {
    if (!R.on) return;
    if (R.inFrame) R.parts[R.cur * MAXL + ix] += ms; else { R.pre[ix] += ms; R.preDirty = true; }
  };

  // ---- timing wrappers (inclusive durations; nested calls are counted in their parents)
  const WRAPPED = new WeakSet();
  const found = {}, missing = [];
  function wrap(obj, name, label) {
    if (!cfg.wrap) return false;
    const f = obj ? obj[name] : null;
    if (typeof f !== 'function') { if (missing.indexOf(label) < 0) missing.push(label); return false; }
    if (WRAPPED.has(f)) return true;
    const ix = lab(label);
    const w = function () { const t = performance.now(); try { return f.apply(this, arguments); } finally { add(ix, performance.now() - t); } };
    WRAPPED.add(w);
    obj[name] = w;
    found[label] = true;
    return true;
  }
  function evWrap(obj, name, label, extra) {
    const f = obj ? obj[name] : null;
    if (typeof f !== 'function') return;
    obj[name] = function () { ev(label, extra ? extra.apply(null, arguments) : null); return f.apply(this, arguments); };
  }
  const STAGE_TIMED = [['_govern', 'govern'], ['_skyFrame', 'skyFrame'], ['_applyLook', 'applyLook'], ['_brief', 'brief'], ['_pins', 'pins'], ['_keys', 'keys'], ['_beatTick', 'beatTick'],
    ['_view', 'view'], ['_shotGoal', 'shotGoal'], ['_clear', 'clear'], ['_stand', 'stand'], ['_fitBeat', 'fitBeat'], ['_startTr', 'startTr'], ['_commitBake', 'commitBake'],
    ['_begin', '~begin'], ['_teardown', '~teardown'], ['_clouds', 'clouds'], ['hide', '~hide'], ['_resize', 'resize'], ['_cineEnd', 'cineEnd'], ['_startShot', 'startShot'], ['_takeStage', 'takeStage']];
  const TOP = ['runner.update', 'fx.update', 'skyFrame', 'W.lod', 'brief', 'crowd.update', 'pins', 'render', 'keys'];
  const wrapped = { W: null, runner: null, fx: null, proto: false };
  function ensureWraps() {
    if (!cfg.wrap) return;
    const W = st.W;
    if (!wrapped.proto && W && W.stream && st.crowd) {
      wrapped.proto = true;
      const sp = Object.getPrototypeOf(W.stream), cp = Object.getPrototypeOf(st.crowd);
      for (const n of ['update', '_detail', '_buildCell', '_attach', '_detach', 'stageStep', 'commit', '_lazy', 'rebake', '_swap']) wrap(sp, n, 'stream.' + n);
      for (const n of ['update', 'addTile', 'prune', 'rebase', 'lampSet', 'dispose', 'setStage', 'parkedNear']) wrap(cp, n, 'crowd.' + n);
      evWrap(sp, 'rebake', 'rebake');
    }
    if (W && W !== wrapped.W) { wrapped.W = W; wrap(W, 'lod', 'W.lod'); if (W.back) wrap(W.back.userData, 'lod', 'W.back.lod'); }
    if (st.runner && st.runner !== wrapped.runner) { wrapped.runner = st.runner; wrap(st.runner, 'update', 'runner.update'); }
    if (st.fx && st.fx !== wrapped.fx) { wrapped.fx = st.fx; wrap(st.fx, 'update', 'fx.update'); }
  }
  if (cfg.wrap) for (const [n, l] of STAGE_TIMED) wrap(st, n, l);
  evWrap(st, '_begin', 'begin', (W, s, sky, level, opts) => ({ swap: !!(opts && opts.view), id: s && s.id }));
  if (P) {
    const bO = st._begin; // (outermost: the event wrapper above and the timing wrapper both run inside)
    st._begin = function () {
      const t = performance.now();
      if (P.showAt) { measure('show -> begin (buildWorld, fetch included)', P.showAt, t); ev('buildWorld', { ms: rnd2(t - P.showAt) }); P.showAt = 0; }
      try { return bO.apply(this, arguments); } finally { const t1 = performance.now(); measure('_begin', t, t1); ev('beginMs', { ms: rnd2(t1 - t) }); P.firstAfterBegin = true; }
    };
  }
  evWrap(st, '_commitBake', 'commit');
  evWrap(st, '_startTr', 'startTr', (to) => ({ night: !!(to && to.night) }));
  evWrap(st, 'setSky', 'setSky', (m) => ({ mode: m }));
  evWrap(st, 'hide', 'hide');
  evWrap(st, 'debugPlay', 'debugPlay', (n) => ({ name: n }));
  evWrap(st, '_setMode', 'mode', (m) => ({ mode: m }));
  {
    const showO = st.show; // async: the sync part is timed by ~begin / ~teardown, here only the markers and the duration
    st.show = function (p, hooks, opts) {
      showCalls++;
      const keep = !!(opts && opts.keep), t = nowMs();
      ev('show:start', { street: p && p.name, id: p && p.id, keep });
      if (P) P.showAt = t;
      const pr = showO.apply(this, arguments);
      return pr.then((ok) => { ev('show:done', { ok, keep, ms: Math.round(nowMs() - t) }); return ok; });
    };
  }

  if (P) {
    const glc = rend.getContext();
    const slot = (k, v) => { if (!R.on) return; const j = R.inFrame ? R.cur : R.n; if (j < 0 || j >= MAXF) return; (R.inFrame ? P.inF : P.outF)[j * NG + k] += v; };
    const isCanvas = (x) => (typeof HTMLCanvasElement !== 'undefined' && x instanceof HTMLCanvasElement) || (typeof OffscreenCanvas !== 'undefined' && x instanceof OffscreenCanvas);
    const srcBytes = (a) => { for (let i = a.length - 1; i >= 0; i--) { const x = a[i]; if (x && ArrayBuffer.isView(x)) return x.byteLength; if (x && typeof x === 'object' && 'width' in x && 'height' in x) return x.width * x.height * 4; } return 0; };
    const srcCanvas = (a) => { for (let i = a.length - 1; i >= 0; i--) if (isCanvas(a[i])) return 1; return 0; };
    const gwrap = (name, msK, fn) => {
      const f = glc[name];
      if (typeof f !== 'function') return;
      glc[name] = function () { const t = performance.now(); try { return f.apply(this, arguments); } finally { slot(msK, performance.now() - t); slot(10, 1); if (fn) fn(arguments); } };
    };
    gwrap('bufferData', 0, (a) => slot(1, (typeof a[1] === 'number' ? a[1] : a[1] && a[1].byteLength ? a[1].byteLength : 0) / 1024));
    gwrap('bufferSubData', 0, (a) => slot(1, (a[2] && a[2].byteLength ? (a[4] ? a[4] * (a[2].BYTES_PER_ELEMENT || 1) : a[2].byteLength) : 0) / 1024));
    gwrap('texImage2D', 2, (a) => { slot(3, srcBytes(a) / 1024); slot(4, srcCanvas(a)); });
    gwrap('texSubImage2D', 2, (a) => { slot(3, srcBytes(a) / 1024); slot(4, srcCanvas(a)); });
    gwrap('texStorage2D', 9);
    gwrap('generateMipmap', 5);
    gwrap('compileShader', 6);
    gwrap('linkProgram', 7);
    gwrap('getProgramParameter', 8);
    gwrap('getShaderParameter', 8);
  }
  const hash8 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
  const probeAfterRender = () => {
    if (!P || !R.on) return;
    const list = info.programs || [];
    if (R.inFrame) P.inF[R.cur * NG + 11] = list.length;
    if (list.length === P.lastN && P.seen.size) return;
    P.lastN = list.length;
    for (const p of list) if (!P.seen.has(p)) { P.seen.add(p); if (P.prog.length < 2000) P.prog.push({ frame: R.cur, name: p.name || '?', key: hash8(String(p.cacheKey || '')), t: rnd2(nowMs() - R.t00) }); }
  };
  const measure = (name, a, b) => { try { performance.measure('bench:' + name, { start: a, end: b }); } catch (e) { /* old browser */ } };

  // ---- the GPU timer, when the browser offers it (probably not on Metal: then gpu stays null)
  let gl = null, ext = null;
  try { if (cfg.wrap) { gl = rend.getContext(); ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); } } catch (e) { ext = null; }
  const qs = [];
  let qOpen = null;
  const gpuBegin = () => { if (!ext) return; try { if (qs.length > 12) gl.deleteQuery(qs.shift().q); qOpen = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, qOpen); } catch (e) { qOpen = null; } };
  const gpuEnd = () => { if (!qOpen) return; try { gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push({ q: qOpen, i: R.cur }); } catch (e) { /* no timer this frame */ } qOpen = null; };
  const gpuPoll = () => {
    if (!ext) return;
    try {
      while (qs.length) {
        const e = qs[0];
        if (!gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) break;
        qs.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) R.gpu[e.i] = gl.getQueryParameter(e.q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(e.q);
      }
    } catch (e) { /* ignore */ }
  };
  {
    const rO = rend.render;
    rend.render = function () {
      if (!R.on || !R.inFrame) return rO.apply(this, arguments);
      const t = performance.now();
      gpuBegin();
      try { return rO.apply(this, arguments); } finally {
        gpuEnd();
        R.calls[R.cur] = info.render.calls; R.tris[R.cur] = info.render.triangles; // right after the render call: this frame's numbers (shadow pass included)
        const t1 = performance.now();
        if (cfg.wrap) add(lab('render'), t1 - t);
        if (P) { probeAfterRender(); if (P.firstAfterBegin) { P.firstAfterBegin = false; measure('first render after begin', t, t1); ev('firstRender', { ms: rnd2(t1 - t) }); } }
      }
    };
  }

  // ---- the frame hook. The page's own loop calls this._frame(now) every rAF; an own property wins over the prototype method.
  const frameO = st._frame;
  st._frame = function (now) {
    if (R.driver) { try { R.driver(now); } catch (e) { R.driver = null; R.driverError = String(e && e.message || e); } } // camera moves are written before the frame, like input events
    if (!R.on) return frameO.call(this, now);
    ensureWraps();
    const i = R.n;
    if (i >= MAXF) { R.on = false; R.overflow = true; return frameO.call(this, now); }
    gpuPoll();
    if (i > 0) {
      R.dt[i - 1] = R.prevNow === null ? NaN : now - R.prevNow;
      if (R.preDirty) { for (let k = 0; k < MAXL; k++) { R.after[(i - 1) * MAXL + k] = R.pre[k]; R.pre[k] = 0; } R.preDirty = false; }
      if (this.W !== R.lastW) R.flag[i - 1] = 1; // the interval of the last frame of the old world holds the swap
    }
    R.lastW = this.W;
    const pr = rend.getPixelRatio();
    if (pr !== R.lastPR) { if (R.lastPR !== null) R.prChanges.push({ frame: i, t: nowMs() - R.t00, from: R.lastPR, to: pr, level: st._gov ? st._gov.level : null }); R.lastPR = pr; }
    R.prevNow = now; R.cur = i; R.inFrame = true;
    const t0 = performance.now();
    R.t0[i] = t0;
    try { return frameO.call(this, now); } finally {
      const t1 = performance.now();
      R.inFrame = false;
      R.cpu[i] = t1 - t0;
      const s = this.W && this.W.stream;
      if (s) { R.built[i] = s.built; R.sms[i] = s.ms; }
      R.n = i + 1;
    }
  };
  // heartbeat: a 4 ms timer; a late callback means the main thread was blocked (by the frame itself or by any other task)
  if (cfg.wrap) {
    let last = performance.now();
    const beat = () => { const t = performance.now(), gap = t - last; last = t; if (R.on && gap > 14 && R.stalls.length < 4000) R.stalls.push({ start: t - gap + 4, end: t, dur: gap - 4 }); setTimeout(beat, 4); };
    setTimeout(beat, 4);
  }
  try {
    const types = PerformanceObserver.supportedEntryTypes || [];
    if (types.indexOf('long-animation-frame') >= 0) {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          R.loaf.push({ start: e.startTime, dur: e.duration, block: e.blockingDuration, render: e.renderStart, style: e.styleAndLayoutStart,
            scripts: (e.scripts || []).slice(0, 5).map((s) => ({ fn: s.sourceFunctionName || s.invoker || '', src: String(s.sourceURL || '').split('/').slice(-2).join('/'), dur: Math.round(s.duration), forced: Math.round(s.forcedStyleAndLayoutDuration || 0) })) });
        }
      }).observe({ type: 'long-animation-frame' });
    }
    if (types.indexOf('longtask') >= 0) new PerformanceObserver((l) => { for (const e of l.getEntries()) R.longtask.push({ start: e.startTime, dur: e.duration }); }).observe({ type: 'longtask' });
  } catch (e) { /* the observers are optional */ }

  // ---- reading the recorder
  const govSnap = () => ({ ratio: rend.getPixelRatio(), level: st._gov ? st._gov.level : null, steps: st._gov ? st._gov.steps.slice() : null });
  function mem() {
    const m = info.memory, o = { geometries: m.geometries, textures: m.textures, programs: info.programs ? info.programs.length : null };
    const pm = performance.memory;
    if (pm) { o.jsHeapUsedMB = rnd2(pm.usedJSHeapSize / 1048576); o.jsHeapTotalMB = rnd2(pm.totalJSHeapSize / 1048576); }
    o.liveTiles = st.W && st.W.stream ? st.W.stream.live.size : null;
    o.agents = st.crowd && st.crowd.agents ? st.crowd.agents.length : null;
    o.sceneChildren = st.scene ? st.scene.children.length : null;
    return o;
  }
  const row = (arr, j) => {
    const out = [];
    for (let k = 0; k < labels.length; k++) { const v = arr[j * MAXL + k]; if (v >= 0.3) out.push([labels[k], rnd2(v)]); }
    return out.sort((a, b) => b[1] - a[1]);
  };
  /** The WebGL calls of frame j (in the frame) and of the time between frame j-1 and j (before it). */
  function glOf(j) {
    const pick = (A) => { const o = {}; let any = false; for (let k = 0; k < NG - 1; k++) { const v = A[j * NG + k]; if (v) { o[GL_NAMES[k]] = rnd2(v); any = true; } } return any ? o : null; };
    return { in: pick(P.inF), before: pick(P.outF), programs: P.inF[j * NG + 11] || null };
  }
  function describe(j) {
    const a = R.t0[j], b = R.t0[j + 1], dt = R.dt[j], cpu = R.cpu[j], gpu = R.gpu[j];
    const parts = row(R.parts, j), after = row(R.after, j);
    const sub = parts.filter((p) => TOP.indexOf(p[0]) >= 0).reduce((s, p) => s + p[1], 0);
    if (cfg.wrap && cpu - sub > 0.5) parts.push(['(rest of _frame: actors, camera, shots)', rnd2(cpu - sub)]);
    parts.sort((x, y) => y[1] - x[1]);
    const events = R.events.filter((e) => e.t >= a - 1 && e.t <= b + 1).map((e) => Object.assign({}, e, { t: rnd2(e.t - R.t00) }));
    const stalls = R.stalls.filter((s) => s.end >= a && s.start <= b);
    const outside = stalls.reduce((s, q) => s + Math.max(0, Math.min(q.end, b) - Math.max(q.start, a + cpu)), 0);
    let kind;
    if (cpu >= 0.6 * dt) kind = 'frame-cpu';
    else if (!cfg.wrap) kind = 'unattributed (plain run: no wrappers, no heartbeat)';
    else if (outside >= 0.5 * (dt - cpu) || after.reduce((s, p) => s + p[1], 0) >= 0.5 * (dt - cpu)) kind = 'between-frames';
    else if (Number.isFinite(gpu) && gpu >= 0.6 * dt) kind = 'gpu';
    else kind = 'late-present';
    return {
      i: j, t: rnd2(a - R.t00), dt: rnd2(dt), cpu: rnd2(cpu), gpu: Number.isFinite(gpu) ? rnd2(gpu) : null, kind, flagged: !!R.flag[j],
      tilesBuilt: j > 0 ? Math.max(0, R.built[j] - R.built[j - 1]) : 0, // (a new world starts its count at 0)
      streamMs: rnd2(R.sms[j]), parts: parts.slice(0, 8), after: after.slice(0, 5), events: events.slice(0, 10),
      gl: P ? glOf(j) : undefined, newPrograms: P ? P.prog.filter((q) => q.frame === j).slice(0, 12).map((q) => q.name + '#' + q.key) : undefined,
      stalls: stalls.slice(0, 6).map((s) => ({ t: rnd2(s.start - R.t00), dur: rnd2(s.dur) })),
      loaf: R.loaf.filter((e) => e.start + e.dur >= a && e.start <= b).slice(0, 3).map((e) => ({ t: rnd2(e.start - R.t00), dur: rnd2(e.dur), render: rnd2(e.render - e.start), style: rnd2(e.style - e.start), scripts: e.scripts })),
      longtask: R.longtask.filter((e) => e.start + e.dur >= a && e.start <= b).slice(0, 3).map((e) => ({ t: rnd2(e.start - R.t00), dur: rnd2(e.dur) })),
    };
  }
  function start() {
    const hi = Math.min(MAXF, Math.max(R.hi, R.n));
    R.parts.fill(0, 0, hi * MAXL); R.after.fill(0, 0, hi * MAXL); R.pre.fill(0);
    R.dt.fill(NaN, 0, hi); R.gpu.fill(NaN, 0, hi); R.flag.fill(0, 0, hi); R.calls.fill(0, 0, hi); R.tris.fill(0, 0, hi);
    R.n = 0; R.hi = 0; R.prevNow = null; R.preDirty = false; R.overflow = false;
    if (P) { P.inF.fill(0, 0, hi * NG); P.outF.fill(0, 0, hi * NG); P.prog = []; P.seen = new Set(info.programs || []); P.lastN = (info.programs || []).length; }
    R.events = []; R.stalls = []; R.loaf = []; R.longtask = []; R.prChanges = [];
    R.lastW = st.W; R.lastPR = rend.getPixelRatio(); R.govStart = govSnap();
    R.t00 = nowMs(); R.on = true;
    ensureWraps();
    return { t00: R.t00 };
  }
  const pause = () => { R.on = false; return R.n; };
  const resume = () => { R.prevNow = null; R.lastW = st.W; R.on = true; return R.n; }; // the first frame after a pause has no interval before it
  /** Per frame (index = frame): the WebGL totals in and before the frame (only frames with any), the programs count, the new programs. */
  function probeOut(n) {
    const frames = [];
    for (let j = 0; j < n; j++) {
      let any = false;
      for (let k = 0; k < NG - 1 && !any; k++) if (P.inF[j * NG + k] || P.outF[j * NG + k]) any = true;
      if (any) { const g = glOf(j); frames.push({ j, in: g.in, before: g.before }); }
    }
    const progs = new Array(n); for (let j = 0; j < n; j++) progs[j] = P.inF[j * NG + 11];
    return { names: GL_NAMES, frames, programsPerFrame: progs, newPrograms: P.prog.slice() };
  }
  /** After the streets leg: what the renderer counts as geometries, by where they are. */
  async function leakSplit() {
    const W = st.W;
    const inScene = new Set();
    st.scene.traverse((o) => { if (o.geometry) inScene.add(o.geometry); });
    let tileOf = null;
    try { ({ tileOf } = await import('/src/voxel/world.js')); } catch (e) { /* not reachable */ }
    const keys = W && W.city && W.city.ix ? (W.city.ix.tiles || [...(W.city.ix.set || [])]) : [];
    const live = W && W.stream ? W.stream.live : new Map(), staged = W && W.stream && W.stream.staged ? W.stream.staged : new Map();
    const cached = new Set();
    let cachedTiles = 0;
    if (tileOf) for (const k of keys) { const c = tileOf(k); if (!c || live.get(k) === c) continue; cachedTiles++; c.g.traverse((o) => { if (o.geometry && !inScene.has(o.geometry)) cached.add(o.geometry); }); }
    for (const c of staged.values()) c.g.traverse((o) => { if (o.geometry && !inScene.has(o.geometry)) cached.add(o.geometry); });
    const total = info.memory.geometries;
    // what stays on the street: the dyn group's children by kind (a baked graffiti tag is one mesh in a group)
    const dyn = {};
    if (st.dyn) for (const c of st.dyn.children) { let n = 0; c.traverse((o) => { if (o.geometry) n++; }); const k = c.type + (st.actors && st.actors.some((a) => a.g === c) ? ' (actor)' : ''); const e = (dyn[k] ||= { objects: 0, geometries: 0 }); e.objects++; e.geometries += n; }
    return { rendererGeometries: total, inScene: inScene.size, inCachedTiles: cached.size, cachedTiles, liveTiles: live.size, remainder: total - inScene.size - cached.size, tileOfReachable: !!tileOf, dyn };
  }
  async function stop() {
    R.on = false;
    await sleepP(300); // the observers and the GPU timer report a little late
    gpuPoll();
    R.hi = R.n;
    const n = R.n, m = Math.max(0, n - 1), rel = (x) => rnd2(x - R.t00);
    const arr = (src, k, f) => { const o = new Array(k); for (let q = 0; q < k; q++) o[q] = f(src[q]); return o; };
    const idx = []; for (let j = 0; j < m; j++) idx.push(j);
    idx.sort((p, q) => (R.dt[q] || 0) - (R.dt[p] || 0));
    const hasGpu = !!ext && (() => { for (let q = 0; q < n; q++) if (Number.isFinite(R.gpu[q])) return true; return false; })();
    return {
      n, overflow: R.overflow, t00: R.t00, frames: arr(R.dt, m, (x) => rnd2(x)), cpu: arr(R.cpu, m, rnd2), t0: arr(R.t0, n, rel),
      gpu: hasGpu ? arr(R.gpu, m, (x) => rnd2(x)) : null, calls: Array.from(R.calls.subarray(0, n)), tris: Array.from(R.tris.subarray(0, n)),
      tiles: arr(R.built, n, (x) => x), flags: Array.from(R.flag.subarray(0, m)),
      events: R.events.map((e) => Object.assign({}, e, { t: rel(e.t) })), prChanges: R.prChanges.map((c) => Object.assign({}, c, { t: rnd2(c.t) })),
      gov: { start: R.govStart, end: govSnap() }, mem: mem(), labels: labels.slice(), driverError: R.driverError || null,
      long: idx.slice(0, 60).filter((j) => Number.isFinite(R.dt[j])).map(describe), loafCount: R.loaf.length, longtaskCount: R.longtask.length, stallCount: R.stalls.length,
      probe: P ? probeOut(n) : undefined,
    };
  }

  // ---- the camera, the way a user's input leaves it
  function takeFree(dist, el) {
    if (!st.W) throw new Error('no street is open');
    if (st.mode === 'follow') st._take(); // what the first drag / wheel / key does: follow -> free
    if (st.mode !== 'free') throw new Error('stage.mode is ' + st.mode + ', not free');
    st.goal.dist = dist; st.goal.el = el; // (the wheel and the orbit drag write these; ty, fov and roll are rewritten every frame)
  }
  function aim(s, dir, yaw) {
    const f = {};
    st.W.path.at(s, f);
    const q = st.W.inCity(f.x, f.z), g = st.goal; // as _pan does: kept inside the city
    g.tx = q[0]; g.tz = q[1]; g.az = Math.atan2(-dir * f.tx, -dir * f.tz) + yaw; // the camera stands behind the target, looking along the street
    return f;
  }
  const slotsQuiet = () => {
    const s = st.W && st.W.stream;
    if (!s) return true;
    if (s.pending.size || s.ready.size) return false;
    for (const c of s.live.values()) if (c.cells) for (const cell of c.cells) if (cell.job) return false;
    return true;
  };
  /** Wait until the camera has arrived and the tile streamer has nothing in flight for a moment. */
  async function settle(maxMs) {
    const t = nowMs(), g = st.goal, r = st.rig;
    let quietSince = 0, lastBuilt = st.W && st.W.stream ? st.W.stream.built : 0;
    while (nowMs() - t < maxMs) {
      await sleepP(100);
      const near = Math.hypot(r.tx - g.tx, r.tz - g.tz) < 1 && Math.abs(r.dist - g.dist) < 1 && Math.abs(angDiff(r.az, g.az)) < 0.03 && Math.abs(r.el - g.el) < 0.02;
      const b = st.W && st.W.stream ? st.W.stream.built : 0;
      if (near && slotsQuiet() && b === lastBuilt) { if (!quietSince) quietSince = nowMs(); if (nowMs() - quietSince > 900) return true; } else quietSince = 0;
      lastBuilt = b;
    }
    return false;
  }
  /** Where along the street to fly: the stretch of `L` metres with the most of `kind` in it. */
  function pickWindow(kind, L) {
    const W = st.W, P = W.path, lo0 = P.sA + 20, hi0 = P.sB - 20, items = [];
    let railPts = 0;
    if (kind === 'tram') {
      for (const r of W.rails || []) {
        if (r.kind === 2 || (r.flags & 4)) continue;
        for (let i = 0; i + 1 < r.a.length; i += 8) { const pr = P.project(r.a[i], r.a[i + 1]); if (pr.d < 6 && pr.s > P.sA && pr.s < P.sB) { items.push(pr.s); railPts++; } }
      }
    } else if (kind === 'terrace') {
      for (const p of W.props || []) if (p.kind === 'terrace') { const pr = P.project(p.x, p.z); if (pr.d < 30) items.push(pr.s); }
    } else {
      for (const h of W.anchors.houses || []) if (typeof h.s === 'number') items.push(h.s);
    }
    const span = Math.min(L, Math.max(20, hi0 - lo0));
    let best = Math.max(lo0, (P.sA + P.sB) / 2 - span / 2), bs = -1;
    for (let s0 = lo0; s0 <= Math.max(lo0, hi0 - span); s0 += 5) {
      let c = 0;
      for (const s of items) if (s >= s0 && s <= s0 + span) c++;
      if (c > bs) { bs = c; best = s0; }
    }
    return { s0: best, span, score: Math.max(0, bs), total: items.length, railPts, tramNear: !!(W.L && W.L.tramNear), tramLines: W.tramLines ? W.tramLines.length : null,
      terraces: (W.props || []).filter((p) => p.kind === 'terrace').length, houses: (W.anchors.houses || []).length, streetLen: Math.round(P.sB - P.sA), sA: P.sA, sB: P.sB };
  }

  const api = {
    start, stop, pause, resume, mem, govSnap, settle, takeFree, leakSplit,
    /** WALK: the HUD button that drops the walking character, if the page has one (first selector that matches a visible element). */
    walkButton(sels) {
      for (const q of sels) { let el = null; try { el = document.querySelector(q); } catch (e) { continue; } if (el && !el.disabled && el.offsetParent !== null) return q; }
      return null;
    },
    walkPress(q) { const el = document.querySelector(q); if (!el) return false; el.click(); return true; },
    /** Where the walking character is (scene x, z), or null while there is none. */
    walkWhere() {
      const w = st.walker;
      if (!w) return null;
      const p = (w.g && w.g.position) || w.position || w;
      return Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: rnd2(p.x), z: rnd2(p.z), mode: st.mode } : { mode: st.mode };
    },
    /** The page-side self-check: which internals the benchmark relies on exist. */
    probe() {
      ensureWraps();
      const W = st.W, C = st.crowd, s = W && W.stream, has = (o, k) => !!o && typeof o[k] === 'function';
      const numAll = (o, ks) => !!o && ks.every((k) => typeof o[k] === 'number');
      let glr = '?';
      try { const g = rend.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); glr = e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; } catch (e) { /* unknown */ }
      const types = PerformanceObserver.supportedEntryTypes || [];
      const ok = {
        'heibel.openStreet': has(H, 'openStreet'), 'heibel.S (array of streets with id)': Array.isArray(H.S) && H.S.length > 0 && typeof H.S[0].id === 'number',
        'stage._frame': has(st, '_frame'), 'stage._govern': has(st, '_govern'), 'stage._gov {level, steps}': !!st._gov && typeof st._gov.level === 'number' && Array.isArray(st._gov.steps),
        'renderer.getPixelRatio': has(rend, 'getPixelRatio'), 'renderer.info.render {calls, triangles}': numAll(info.render, ['calls', 'triangles']), 'renderer.info.autoReset': info.autoReset === true,
        'renderer.info.memory {geometries, textures}': numAll(info.memory, ['geometries', 'textures']), 'renderer.info.programs[]': Array.isArray(info.programs),
        'stage.goal {tx, tz, az, el, dist}': numAll(st.goal, ['tx', 'tz', 'az', 'el', 'dist']), 'stage.rig {tx, tz, az, el, dist}': numAll(st.rig, ['tx', 'tz', 'az', 'el', 'dist']),
        'stage._take': has(st, '_take'), 'stage._setMode': has(st, '_setMode'), 'stage.mode': typeof st.mode === 'string',
        'stage.setSky': has(st, 'setSky'), 'stage.tr (field)': 'tr' in st, 'stage._commitBake': has(st, '_commitBake'), 'stage._begin': has(st, '_begin'), 'stage.show': has(st, 'show'),
        'stage.debugPlay': has(st, 'debugPlay'), 'stage.locales[]': Array.isArray(st.locales), 'stage.camCtx': !!st.camCtx, 'stage.gagNames[]': Array.isArray(st.gagNames),
        'stage.runner.update': has(st.runner, 'update'), 'stage.fx.update': has(st.fx, 'update'),
        'W.path {at, project, sA, sB}': has(W && W.path, 'at') && has(W && W.path, 'project') && numAll(W && W.path, ['sA', 'sB']), 'W.toScene': has(W, 'toScene'), 'W.inCity': has(W, 'inCity'),
        'W.rails[]': Array.isArray(W && W.rails), 'W.props[]': Array.isArray(W && W.props), 'W.anchors.houses[]': Array.isArray(W && W.anchors && W.anchors.houses), 'W.st.id': !!(W && W.st && typeof W.st.id === 'number'),
        'W.lod': has(W, 'lod'), 'W.stream {update, _buildCell, stageStep, commit, pending, ready, live, built}': has(s, 'update') && has(s, '_buildCell') && has(s, 'stageStep') && has(s, 'commit') && !!s.pending && !!s.ready && !!s.live && typeof s.built === 'number',
        'crowd {update, addTile, prune}': has(C, 'update') && has(C, 'addTile') && has(C, 'prune'),
        'performance.memory': !!performance.memory, 'long-animation-frame observer': types.indexOf('long-animation-frame') >= 0, 'longtask observer': types.indexOf('longtask') >= 0,
        'EXT_disjoint_timer_query_webgl2': !!ext,
      };
      const walker = !!(st.walker || H.walker || st.player);
      return {
        ok, missing: Object.keys(ok).filter((k) => !ok[k]), wrapped: Object.keys(found).length, wrapMissing: missing.slice(), walker,
        env: { gl: glr, innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio, canvas: [st.canvas.width, st.canvas.height], visibility: document.visibilityState,
          lite: st.lite, worldLite: W ? !!W.lite : null, pointerCoarse: matchMedia('(pointer: coarse)').matches, pixelRatio: rend.getPixelRatio(), gov: govSnap(), mode: st.mode, skyMode: st.skyMode, street: W && W.st ? W.st.name : null, calm: matchMedia('(prefers-reduced-motion: reduce)').matches },
      };
    },
    /** Cost of one wrapped call, measured on an empty function (ns). */
    wrapperCost() {
      const o = { f() { return 1; } }, N = 200000;
      let t = performance.now();
      for (let i = 0; i < N; i++) o.f();
      const base = performance.now() - t;
      const ix = lab('(bench)'), f = o.f;
      o.f = function () { const q = performance.now(); try { return f.apply(this, arguments); } finally { add(ix, performance.now() - q); } };
      t = performance.now();
      for (let i = 0; i < N; i++) o.f();
      return { nsPerWrappedCall: Math.round(((performance.now() - t - base) / N) * 1e6) };
    },
    async openById(id, holdMs) {
      const p = H.S[id];
      if (!p) return { error: 'no street with id ' + id };
      const t = nowMs();
      for (let attempt = 0; attempt < 20; attempt++) {
        const c0 = showCalls;
        H.openStreet(p); // the function the map and the Next button call; it ignores the call while another open is busy
        await sleepP(400);
        if (showCalls !== c0) break;
        await sleepP(600);
      }
      for (;;) {
        await sleepP(50);
        if (st.mode === 'follow' && st.W && st.W.st && st.W.st.id === id) break;
        if (nowMs() - t > 90000) return { error: 'street ' + id + ' did not open within 90 s' };
      }
      const openMs = Math.round(nowMs() - t);
      ev('open:landed', { id, openMs });
      await sleepP(holdMs);
      return { id, name: p.name, openMs };
    },
    /** FLIGHT: record a fixed camera flight along the open street. */
    async flight(o) {
      takeFree(o.dist, o.el);
      const W0 = st.W, L = o.speed * o.secs, win = pickWindow(o.pick, L), span = win.span, yaw = o.yaw;
      if (span < 30) return { error: 'the street is too short to fly along (' + win.streetLen + ' m)', window: win };
      aim(win.s0, 1, yaw);
      const arrived = await settle(o.warm * 1000 + 8000);
      start();
      let t00 = null, done = false, focusShift = false, last = null;
      R.driver = (now) => {
        if (st.W !== W0) { focusShift = true; done = true; R.driver = null; return; }
        if (t00 === null) t00 = now;
        const el = (now - t00) / 1000;
        if (el >= o.secs) { done = true; R.driver = null; return; }
        const p = o.speed * el, cyc = 2 * span, q = p % cyc, fwd = q < span, s = win.s0 + (fwd ? q : cyc - q); // position by elapsed time, not by summed steps: a hitch never moves the route
        last = aim(s, fwd ? 1 : -1, yaw);
      };
      const tw = nowMs();
      while (!done && nowMs() - tw < (o.secs + 15) * 1000) await sleepP(50); // (the driver only runs while the stage draws frames)
      R.driver = null;
      const data = await stop();
      return Object.assign(data, { window: win, arrived, focusShift, reversed: o.speed * o.secs > span, driverFinished: done });
    },
    /** SWITCH: put the camera target onto the neighbouring street (candidate points from Node) and wait for the world swap. */
    async switchTo(cands, id, o) {
      const W = st.W, P = W.path;
      let pick = null;
      for (const c of cands) {
        const p = W.toScene(c[0], c[1]), pr = P.project(p[0], p[1]), off = pr.d + Math.max(0, P.sA - pr.s, pr.s - P.sB); // the same 'off' the stage reports to onRoam
        if (off >= 19) { pick = { p, off }; break; }
      }
      if (!pick) return { error: 'no candidate point is far enough from the open street in the page (off < 19 m)' };
      const t = nowMs(), sw0 = R.events.filter((e) => e.label === 'begin' && e.swap).length;
      ev('move', { to: id, off: rnd2(pick.off) });
      const q = W.inCity(pick.p[0], pick.p[1]);
      st.goal.tx = q[0]; st.goal.tz = q[1]; // what a drag writes (via _pan); the rig eases there, rests, and main.js's onRoam does the rest
      for (;;) {
        await sleepP(50);
        if (st.W && st.W.st && st.W.st.id === id && R.events.filter((e) => e.label === 'begin' && e.swap).length > sw0) break;
        if (nowMs() - t > 40000) return { error: 'no street swap to ' + id + ' within 40 s of moving onto it', waitedMs: Math.round(nowMs() - t) };
      }
      const swapMs = Math.round(nowMs() - t);
      await sleepP(o.post);
      return { id, swapMs };
    },
    /** Stand near the junction (a point of the open street from Node), so that the first swap starts like the others. */
    async switchSetup(o) {
      takeFree(o.dist, o.el);
      const P = st.W.path, p = st.W.toScene(o.at[0], o.at[1]), s = Math.max(P.sA + 5, Math.min(P.sB - 5, P.project(p[0], p[1]).s));
      const f = aim(s, 1, o.yaw);
      await settle(12000);
      return { street: st.W.st.name, s: Math.round(s), at: [f.x, f.z] };
    },
    /** SKY: day -> night -> day, recording from the call until the change and the re-bake are over (+3 s). */
    async sky(o) {
      takeFree(o.dist, o.el);
      aim((st.W.path.sA + st.W.path.sB) / 2, 1, o.yaw);
      if (st.cur.night || st.skyMode !== 'day') { st.setSky('day'); for (let i = 0; i < 300 && st.tr; i++) await sleepP(100); }
      await settle(10000);
      start();
      await sleepP(2000);
      const marks = [];
      for (const mode of ['night', 'day']) {
        const t = nowMs();
        ev('sky:' + mode);
        st.setSky(mode);
        const had = !!st.tr;
        for (let i = 0; i < 300 && st.tr; i++) await sleepP(50);
        const trMs = Math.round(nowMs() - t);
        ev('sky:' + mode + ':transition-over');
        for (let i = 0; i < 400 && st.W.stream && st.W.stream.target !== null; i++) await sleepP(50); // _lazy keeps swapping tiles until nothing is stale
        const lazyMs = Math.round(nowMs() - t);
        await sleepP(3000);
        ev('sky:' + mode + ':end');
        marks.push({ mode, hadTransition: had, transitionMs: trMs, untilBakedMs: lazyMs });
      }
      const data = await stop();
      return Object.assign(data, { marks });
    },
    /** SCENE: play one scene with the director's camera until it is done. */
    async scene(o) {
      if (st.mode === 'free') st.follow();
      if (st.mode !== 'follow') throw new Error('stage.mode is ' + st.mode + ', not follow');
      const names = st.gagNames;
      const want = o.scene ? [o.scene] : o.names.filter((n) => names.indexOf(n) >= 0);
      if (o.scene && names.indexOf(o.scene) < 0) return { error: 'no scene called ' + o.scene + '; known: ' + names.join(' ') };
      const { canPlay } = await import('/src/voxel/gags.js'); // the dev-sweep pattern
      const ctx0 = st.camCtx;
      let chosen = null, loc = -1;
      for (const name of want) {
        for (const ctx of [ctx0].concat(st.locales.filter((c) => c !== ctx0))) if (canPlay(ctx, name)) { chosen = name; loc = st.locales.indexOf(ctx); st.camCtx = ctx; break; }
        if (chosen) break;
      }
      if (!chosen) { st.camCtx = ctx0; return { error: 'none of ' + want.join(',') + ' can play on this street' }; }
      if (st.camCtx !== ctx0) { st.lastSwitch = st.time; st.idleT = 0; await sleepP(3500); } // let the camera arrive at the other spot first
      for (let i = 0; i < 200 && ([...st.gags].some((q) => q.ctx === st.camCtx) || st.cine); i++) await sleepP(100); // whatever else plays here finishes first
      await settle(8000);
      start();
      await sleepP(1000);
      const state = st.debugPlay(chosen);
      if (!state) { const d = await stop(); return Object.assign(d, { error: 'debugPlay(' + chosen + ') returned null' }); }
      const t = nowMs();
      let cineFrames = 0;
      while (!state.done && nowMs() - t < o.maxS * 1000) { await sleepP(100); if (st.cine) cineFrames++; }
      const secs = (nowMs() - t) / 1000;
      await sleepP(1500);
      const data = await stop();
      return Object.assign(data, { scene: chosen, locale: loc, sceneSeconds: rnd2(secs), finished: !!state.done, directedShare: rnd2(cineFrames / Math.max(1, secs * 10)) });
    },
  };
  window.__bench = api;
  return { ok: true };
}

// ------------------------------------------------------------------------------------------------ the numbers in Node
const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.max(0, Math.ceil(p * a.length) - 1))] : null);
function statsOf(dts) {
  const a = dts.filter((x) => Number.isFinite(x)).sort((x, y) => x - y), n = a.length;
  if (!n) return { count: 0 };
  const sum = a.reduce((s, v) => s + v, 0), med = pct(a, 0.5), over = (th) => a.filter((v) => v > th).length;
  return {
    count: n, seconds: r2(sum / 1000), median: r2(med), mean: r2(sum / n), p95: r2(pct(a, 0.95)), p99: r2(pct(a, 0.99)), max: r2(a[n - 1]),
    over16_7: over(16.7), over20: over(20), over33_3: over(33.3), over50: over(50), dropped: a.filter((v) => v >= 1.5 * med).length, fps: r2((1000 * n) / sum),
  };
}
const trio = (arr) => {
  const a = arr.filter((x) => x > 0).sort((x, y) => x - y);
  return a.length ? { min: a[0], median: pct(a, 0.5), max: a[a.length - 1] } : null;
};
/**
 * One recording (raw from the page) -> numbers. `mask(j)` picks the frames that count; `excludeFlagged` leaves out the intervals that
 * contain a change of world (the streets leg: they hold a whole street build, reported on their own).
 */
function summarise(raw, { mask = null, excludeFlagged = false } = {}) {
  const keep = [];
  for (let j = 0; j < raw.frames.length; j++) {
    if (!Number.isFinite(raw.frames[j])) continue;
    if (excludeFlagged && raw.flags[j]) continue;
    if (mask && !mask(j)) continue;
    keep.push(j);
  }
  const longs = (raw.long || []).filter((d) => keep.includes(d.i)).slice(0, 10);
  return {
    stats: statsOf(keep.map((j) => raw.frames[j])),
    cpu: statsOf(keep.map((j) => raw.cpu[j])),
    calls: trio(keep.map((j) => raw.calls[j])), triangles: trio(keep.map((j) => raw.tris[j])),
    long: longs, indices: keep.length === raw.frames.length ? null : keep.length,
  };
}
/** Window selection by time (ms from the start of the recording) of the frame start. */
const inWindow = (raw, a, b) => (j) => raw.t0[j] >= a && raw.t0[j] <= b;
const pooled = (parts) => statsOf(parts.flatMap((p) => p.frames.filter((x) => Number.isFinite(x))));
const slim = (raw, extra = {}) => ({
  frames: raw.frames, cpu: raw.cpu, t0: raw.t0, t00: raw.t00, gpu: raw.gpu, calls: raw.calls, tris: raw.tris, flags: raw.flags, probe: raw.probe,
  events: raw.events, governor: { start: raw.gov.start, end: raw.gov.end, changes: raw.prChanges },
  memory: raw.mem, labels: raw.labels, overflow: raw.overflow, driverError: raw.driverError, loafCount: raw.loafCount, longtaskCount: raw.longtaskCount, stallCount: raw.stallCount, ...extra,
});

// ------------------------------------------------------------------------------------------------ printing
const pad = (s, n) => String(s).padEnd(n);
const f1 = (x) => (x === null || x === undefined ? '-' : String(x));
function printHead() {
  console.log(pad('leg', 26) + ['frames', 'median', 'p95', 'p99', 'max', '>16.7', '>20', '>33.3', '>50', 'drop', 'fps', 'cpu p99', 'calls', 'tris(k)', 'gov'].map((h) => pad(h, 8)).join(''));
}
function printRow(label, s, gov) {
  const st = s.stats;
  if (!st || !st.count) { console.log(pad(label, 26) + 'no frames'); return; }
  console.log(pad(label, 26) + [st.count, st.median, st.p95, st.p99, st.max, st.over16_7, st.over20, st.over33_3, st.over50, st.dropped, st.fps, s.cpu.p99, s.calls ? s.calls.median : '-', s.triangles ? Math.round(s.triangles.median / 1000) : '-', gov || ''].map((v) => pad(f1(v), 8)).join(''));
}
function printLong(s, n = 5) {
  for (const d of (s.long || []).slice(0, n)) {
    const what = d.parts.slice(0, 4).map((p) => `${p[0]} ${p[1]}`).join(', ') + (d.after.length ? ' | after: ' + d.after.slice(0, 3).map((p) => `${p[0]} ${p[1]}`).join(', ') : '');
    const evs = d.events.filter((e) => e.label !== 'mode').map((e) => e.label + (e.swap ? '(swap)' : '')).join(',');
    console.log(`    #${d.i} t=${(d.t / 1000).toFixed(1)}s ${d.dt} ms (cpu ${d.cpu}${d.gpu !== null ? ', gpu ' + d.gpu : ''}) ${d.kind}${d.flagged ? ' [world change]' : ''}${d.tilesBuilt ? ' tiles+' + d.tilesBuilt : ''}: ${what}${evs ? ' | ' + evs : ''}`);
    if (d.gl || d.gc) {
      const g = (o) => (o ? Object.entries(o).map(([k, v]) => k + ' ' + v).join(' ') : '-');
      console.log(`        probe: gl in [${g(d.gl && d.gl.in)}] before [${g(d.gl && d.gl.before)}]${d.newPrograms && d.newPrograms.length ? ' | new programs ' + d.newPrograms.length + ': ' + d.newPrograms.slice(0, 6).join(' ') : ''}${d.gc ? ' | gc [' + d.gc.join(', ') + ']' : ''}${d.longTasks && d.longTasks.length ? ' | long tasks ' + d.longTasks.join(',') : ''}${d.gpuTasks && d.gpuTasks.length ? ' | gpu [' + d.gpuTasks.join(', ') + ']' : ''}`);
    }
  }
}
const govText = (raw) => `${raw.gov.start.ratio}${raw.prChanges.length ? '->' + raw.gov.end.ratio + ' x' + raw.prChanges.length : ''}`;

// ------------------------------------------------------------------------------------------------ the run
if (A.preflight) {
  const { S } = loadStreets();
  for (const p of PLACES) { const f = S[p.id], q = firstByName(p.name); console.log(p.key, p.id, f.name, f.cls, f.len + ' m', '?q= finds', q && q.id, q && q.id === p.id ? 'ok' : 'MISMATCH (opened by id)'); }
  const [a, b] = SWITCH_PAIR.map((x) => S[x.id]);
  console.log('switch', a.name, '<->', b.name, 'points', neighbourPoints(a.id, b.id, O.dist).length, '/', neighbourPoints(b.id, a.id, O.dist).length);
  for (const id of TEN) console.log('street', id, S[id] ? S[id].name + ' (' + S[id].len + ' m, level ' + S[id].level + ') ' + (firstByName(S[id].name).id === id ? '' : 'name not unique: opened by id') : 'MISSING');
  process.exit(0);
}
if (!OUT) {
  console.error('usage: node scripts/dev-bench.mjs <out.json> [--legs flight,switch,sky,scene,walk,streets] [--seed bench] [--time 14:00] [--lite] [--plain] [--scene name] [--preflight] ... (see the top of the file)');
  process.exit(2);
}
const result = { meta: { tool: 'dev-bench', date: new Date().toISOString(), options: O, legs: LEGS, viewport: [1440, 900], dpr: 2 }, selfCheck: null, legs: {} };
const save = () => fs.writeFileSync(OUT, JSON.stringify(result));
// the legs need these internals (names as in the self-check); a leg whose internals are missing fails with a message and the run goes on
const NEEDS = {
  flight: ['stage._take', 'stage.goal {tx, tz, az, el, dist}', 'W.path {at, project, sA, sB}', 'W.inCity', 'stage._gov {level, steps}', 'renderer.getPixelRatio', 'renderer.info.render {calls, triangles}'],
  switch: ['stage._take', 'stage.goal {tx, tz, az, el, dist}', 'W.toScene', 'W.inCity', 'W.path {at, project, sA, sB}', 'stage.show', 'stage._begin', 'W.st.id'],
  sky: ['stage.setSky', 'stage._commitBake', 'stage.tr (field)', 'W.stream {update, _buildCell, stageStep, commit, pending, ready, live, built}', 'stage._take', 'stage.goal {tx, tz, az, el, dist}'],
  scene: ['stage.debugPlay', 'stage.locales[]', 'stage.camCtx', 'stage.gagNames[]'],
  streets: ['heibel.openStreet', 'heibel.S (array of streets with id)', 'W.st.id', 'renderer.info.memory {geometries, textures}'],
};
let checked = false;
const LITE_SRC = '(() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => { const r = mm(q); if (/\\(\\s*pointer\\s*:\\s*coarse\\s*\\)/.test(String(q))) return new Proxy(r, { get: (t, k) => (k === "matches" ? true : typeof t[k] === "function" ? t[k].bind(t) : t[k]) }); return r; }; })();';
let B = null;

// ---- the probe's DevTools tracing. dev-lib's socket answers calls only; the events are read off the same socket by a listener
// installed on the WebSocket class before launch (with --probe only).
const CDP_LISTENERS = new Set();
if (O.probe && globalThis.WebSocket) {
  const WS0 = globalThis.WebSocket;
  globalThis.WebSocket = class extends WS0 {
    constructor(...a) {
      super(...a);
      this.addEventListener('message', (m) => {
        if (!CDP_LISTENERS.size) return;
        let d; try { d = JSON.parse(m.data); } catch (e) { return; }
        if (d.method) for (const f of CDP_LISTENERS) f(d);
      });
    }
  };
}
const TRACE_CATS = ['devtools.timeline', 'disabled-by-default-v8.gc', 'v8', 'gpu', 'toplevel'];
const isGC = (e) => /GC|Scavenge|MarkCompact|Mark-Compact|Sweep|Marking/i.test(e.name) && /v8|gc/i.test(e.cat || '');
let TRACE = null;
async function traceStart(label) {
  if (!O.probe) return;
  const T = (TRACE = { label, keep: [], sync: null, done: false, dropped: 0 });
  const on = (d) => {
    if (d.method === 'Tracing.tracingComplete') { T.done = true; return; }
    if (d.method !== 'Tracing.dataCollected') return;
    for (const e of d.params.value || []) {
      if (e.name === 'TimeStamp' && e.args && e.args.data && /^benchsync:/.test(e.args.data.message || '')) { T.sync = T.sync || { ts: e.ts, page: +e.args.data.message.slice(10), pid: e.pid, tid: e.tid }; continue; }
      const dur = e.dur || 0;
      const keep = (isGC(e) && dur >= 300) || ((e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && dur >= 50000) || (/gpu/i.test(e.cat || '') && dur >= 8000);
      if (!keep) continue;
      if (T.keep.length < 60000) T.keep.push({ name: e.name, cat: e.cat, ts: e.ts, dur, pid: e.pid, tid: e.tid }); else T.dropped++;
    }
  };
  T.on = on;
  CDP_LISTENERS.add(on);
  try {
    await B.send('Tracing.start', { traceConfig: { includedCategories: TRACE_CATS, recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents', bufferUsageReportingInterval: 2000 });
    await B.ev("console.timeStamp('benchsync:' + performance.now())");
  } catch (e) { T.error = String(e.message || e); CDP_LISTENERS.delete(on); }
}
/** End the trace; returns { gc, tasks, gpu } in page milliseconds (performance.now), main thread of the page only for gc and tasks. */
async function traceStop() {
  const T = TRACE;
  TRACE = null;
  if (!T) return null;
  if (T.error) return { error: T.error };
  try { await B.ev("console.timeStamp('benchsync:' + performance.now())"); await B.send('Tracing.end'); } catch (e) { CDP_LISTENERS.delete(T.on); return { error: String(e.message || e) }; }
  for (let i = 0; i < 600 && !T.done; i++) await sleep(100);
  CDP_LISTENERS.delete(T.on);
  if (!T.sync) return { error: 'no sync mark in the trace', kept: T.keep.length };
  const toPage = (ts) => T.sync.page + (ts - T.sync.ts) / 1000;
  const main = (e) => e.pid === T.sync.pid && e.tid === T.sync.tid;
  const out = { label: T.label, complete: T.done, dropped: T.dropped, gc: [], tasks: [], gpu: [] };
  for (const e of T.keep) {
    const q = { name: e.name, t: r2(toPage(e.ts)), ms: r2(e.dur / 1000) };
    if (isGC(e)) { if (main(e)) out.gc.push(q); }
    else if (/RunTask/.test(e.name)) { if (main(e)) out.tasks.push(q); }
    else out.gpu.push(q);
  }
  // nested GC events (a phase inside a collection): keep the outermost of each overlap for the totals
  out.gc.sort((a, b) => a.t - b.t);
  const outer = [];
  for (const g of out.gc) { const l = outer[outer.length - 1]; if (l && g.t < l.t + l.ms) continue; outer.push(g); }
  out.gcTotal = { count: outer.length, ms: r2(outer.reduce((s2, g) => s2 + g.ms, 0)), max: outer.length ? Math.max(...outer.map((g) => g.ms)) : 0, major: outer.filter((g) => /Major|MarkCompact|Mark-Compact|MC/i.test(g.name)).length };
  out.gc = out.gc.slice(0, 20000); out.gpu = out.gpu.slice(0, 5000);
  return out;
}
/** Put the trace's GC events, long tasks and long GPU tasks on the long frames of a summary (raw.t00: the page time of frame 0). */
function traceOnFrames(raw, tr, s) {
  if (!tr || tr.error || !raw || !s) return;
  const t0 = raw.t0, base = raw.t00;
  for (const d of s.long || []) {
    const a = base + t0[d.i], b = base + (t0[d.i + 1] ?? t0[d.i] + d.dt);
    const over = (q) => q.t < b && q.t + q.ms > a;
    d.gc = tr.gc.filter(over).map((q) => `${q.name} ${q.ms}`).slice(0, 8);
    d.longTasks = tr.tasks.filter(over).map((q) => q.ms).slice(0, 4);
    d.gpuTasks = tr.gpu.filter(over).sort((x, y) => y.ms - x.ms).map((q) => `${q.name} ${q.ms}`).slice(0, 4);
  }
}
function printTrace(tr) {
  if (!tr) return;
  if (tr.error) { console.log('  trace: ' + tr.error); return; }
  console.log(`  trace ${tr.label}: GC ${tr.gcTotal.count} collections, ${tr.gcTotal.ms} ms in all, longest ${tr.gcTotal.max} ms, ${tr.gcTotal.major} major; long tasks ${tr.tasks.length}; GPU tasks >= 8 ms ${tr.gpu.length}${tr.complete ? '' : ' (trace incomplete)'}${tr.dropped ? ', ' + tr.dropped + ' events dropped' : ''}`);
}
/** Open a street in a fresh page, install the recorder, and (the first time) run and print the self-check. */
async function openFresh(street, id) {
  const base = { time: O.time, seed: O.seed };
  let ok = await B.open(street, base);
  if (!ok) throw new Error('the page did not reach the street ' + street + ' (stage.mode never became follow)');
  if (id !== undefined && (await B.ev('__heibel.stage.W && __heibel.stage.W.st && __heibel.stage.W.st.id')) !== id) {
    // ?q= found another street of that name first: ask for the right one the way the map does
    await B.ev(`(async () => { __heibel.openStreet(__heibel.S[${id}]); for (let i = 0; i < 1800; i++) { await new Promise((r) => setTimeout(r, 50)); const s = __heibel.stage; if (s.mode === 'follow' && s.W && s.W.st.id === ${id}) return true; } return false; })()`);
    await sleep(2500);
  }
  const init = await B.ev(`(${pageInit.toString()})(${JSON.stringify({ wrap: !O.plain, probe: O.probe })})`);
  if (!init || init.error) throw new Error('recorder install failed: ' + (init && init.error));
  if (!checked) { checked = true; await selfCheck(); }
}
async function selfCheck() {
  const p = await B.ev('window.__bench.probe()');
  const cost = O.plain ? null : await B.ev('window.__bench.wrapperCost()');
  result.selfCheck = { ...p, wrapperCost: cost, lite: O.lite };
  console.log('self-check: ' + Object.keys(p.ok).length + ' internals looked up, ' + p.missing.length + ' missing' + (p.missing.length ? ': ' + p.missing.join('; ') : ''));
  console.log('  wrapped methods: ' + p.wrapped + (p.wrapMissing.length ? ', not found: ' + p.wrapMissing.join(', ') : '') + (cost ? '; one wrapped call costs about ' + cost.nsPerWrappedCall + ' ns' : '; plain run (no wrappers)'));
  const e = p.env;
  console.log(`  gl ${e.gl} | window ${e.innerWidth}x${e.innerHeight} dpr ${e.dpr} canvas ${e.canvas.join('x')} | pixel ratio ${e.pixelRatio} governor steps [${(e.gov.steps || []).join(', ')}] | lite ${e.lite} (pointer coarse ${e.pointerCoarse}) | ${e.visibility}`);
  console.log(`  GPU timer: ${p.ok.EXT_disjoint_timer_query_webgl2 ? 'yes' : 'no'} | long-animation-frame: ${p.ok['long-animation-frame observer'] ? 'yes' : 'no'} | walker: ${p.walker ? 'yes' : 'no'}`);
  const bad = [];
  if (/swiftshader|software|llvmpipe/i.test(String(e.gl))) bad.push('the page renders in software (' + e.gl + ')');
  if (e.canvas[0] !== Math.round(1440 * Math.min(e.dpr, O.lite ? 1.5 : 2)) && e.canvas[0] !== Math.round(e.innerWidth * e.pixelRatio)) bad.push('canvas width ' + e.canvas[0] + ' does not match 1440 x pixel ratio ' + e.pixelRatio);
  if (O.lite && !e.lite) bad.push('--lite was asked for but stage.lite is false');
  if (!O.lite && e.lite) bad.push('stage.lite is true without --lite');
  if (e.visibility !== 'visible') bad.push('document.visibilityState is ' + e.visibility);
  if (e.calm) bad.push('prefers-reduced-motion is on (the camera work is cut short)');
  if (bad.length) { result.selfCheck.invalid = bad; console.log('  RUN INVALID: ' + bad.join('; ')); }
}
const needFor = (leg) => {
  const miss = (NEEDS[leg] || []).filter((k) => result.selfCheck && result.selfCheck.ok && result.selfCheck.ok[k] === false);
  return miss.length ? 'internals missing: ' + miss.join('; ') : null;
};
const placeById = (p) => ({ ...p, ...(A[p.key] && A[p.key] !== true ? (() => { const q = firstByName(A[p.key]); return q ? { id: q.id, name: q.name } : {}; })() : {}) });

// ---- the legs
async function flightLeg() {
  const out = { places: {} }, parts = [];
  for (const p0 of PLACES.map(placeById)) {
    const place = {};
    out.places[p0.key] = place;
    try {
      B.errs.length = 0;
      await openFresh(p0.name, p0.id);
      const bad = needFor('flight');
      if (bad) { place.error = bad; continue; }
      const traced = O.probe && !parts.length; // (the probe traces the first flight only)
      if (traced) await traceStart('flight/' + p0.key);
      const raw = await B.ev(`window.__bench.flight(${JSON.stringify({ speed: O.speed, secs: O.secs, dist: O.dist, el: O.el, warm: O.warm, pick: p0.pick, yaw: 0.35 })})`);
      const tr = traced ? await traceStop() : null;
      if (raw.error) { place.error = raw.error; place.window = raw.window; continue; }
      traceOnFrames(raw, tr, { long: raw.long });
      if (tr) place.trace = tr;
      const s = summarise(raw);
      Object.assign(place, { street: p0.name, id: p0.id, why: p0.why, window: raw.window, arrived: raw.arrived, focusShift: raw.focusShift, reversed: raw.reversed, summary: s, ...slim(raw), consoleErrors: B.errs.slice(0, 5) });
      raw.placeKey = p0.key;
      parts.push(raw);
      const w = raw.window;
      console.log(`  ${p0.key}: ${p0.name}, flew ${Math.round(w.span)} m from s=${Math.round(w.s0)} (street ${w.streetLen} m); ${p0.pick} in window: ${w.score} of ${w.total}; tramNear ${w.tramNear}, rail points ${w.railPts}, terrace props on street ${w.terraces}; focus shift during flight: ${raw.focusShift ? 'YES' : 'no'}${raw.reversed ? '; reversed at the end of the stretch' : ''}`);
      printTrace(tr);
      printRow('flight/' + p0.key, s, govText(raw));
      printLong(s, 4);
    } catch (e) { place.error = String(e.message || e); console.log(`  flight/${p0.key} failed: ${place.error}`); }
  }
  if (parts.length) { out.stats = pooled(parts); out.pooledLong = parts.flatMap((r) => r.long.map((d) => ({ place: r.placeKey, ...d }))).sort((a, b) => b.dt - a.dt).slice(0, 10); out.governorChanges = parts.reduce((n, r) => n + r.prChanges.length, 0); out.governorFull = parts.every((r) => r.gov.start.ratio === r.gov.end.ratio && r.gov.start.level === 0); }
  return out;
}
async function switchLeg() {
  const [a, b] = SWITCH_PAIR, { S } = loadStreets();
  const ab = neighbourPoints(a.id, b.id, O.dist), ba = neighbourPoints(b.id, a.id, O.dist);
  if (!ab.length || !ba.length) return { error: `no point on ${b.name} (${ab.length}) or on ${a.name} (${ba.length}) satisfies the roam rules of main.js; pick another pair` };
  B.errs.length = 0;
  await openFresh(a.name, a.id);
  const bad = needFor('switch');
  if (bad) return { error: bad };
  const set = await B.ev(`window.__bench.switchSetup(${JSON.stringify({ dist: O.dist, el: O.el, yaw: 0.35, at: ba[0] })})`);
  await B.ev('window.__bench.start()');
  const swaps = [];
  let err = null;
  for (let k = 0; k < O.swaps; k++) {
    const to = k % 2 === 0 ? b : a, cands = k % 2 === 0 ? ab : ba;
    const r = await B.ev(`window.__bench.switchTo(${JSON.stringify(cands)}, ${to.id}, ${JSON.stringify({ post: 8000 })})`);
    swaps.push({ k, to: to.name, ...r });
    if (r.error) { err = r.error; break; }
  }
  const raw = await B.ev('window.__bench.stop()');
  const begins = raw.events.filter((e) => e.label === 'begin' && e.swap), starts = raw.events.filter((e) => e.label === 'show:start' && e.keep), dones = raw.events.filter((e) => e.label === 'show:done' && e.keep);
  const windows = [];
  let union = () => false;
  begins.forEach((bg, k) => {
    // the swap frame = the first frame drawn in the new world (index bg.frame); the interval before it (frame bg.frame - 1) holds the swap itself
    const ts = raw.t0[bg.frame] ?? bg.t, st0 = starts[k] ? starts[k].t : ts - 3000, w = inWindow(raw, ts - 3000, ts + 5000), build = inWindow(raw, st0, ts);
    const s = summarise(raw, { mask: w }), sb = summarise(raw, { mask: build });
    windows.push({ k, to: swaps[k] && swaps[k].to, swapFrame: bg.frame, swapIntervalMs: raw.frames[bg.frame - 1] ?? null, buildMs: dones[k] ? dones[k].ms : null, window: s.stats, build: sb.stats, long: s.long.slice(0, 3) });
    const prev = union;
    union = (j) => prev(j) || w(j);
  });
  const sum = summarise(raw, { mask: union });
  console.log(`  ${a.name} <-> ${b.name}: ${begins.length} of ${O.swaps} swaps seen${err ? '; stopped: ' + err : ''}`);
  for (const w of windows) console.log(`    swap ${w.k + 1} -> ${w.to}: swap interval ${w.swapIntervalMs} ms, build ${w.buildMs} ms; window max ${w.window.max} p99 ${w.window.p99}; build period max ${w.build.max} (${w.build.count} frames)`);
  printRow('switch (windows)', sum, govText(raw));
  printLong(sum, 5);
  return { pair: [a.name, b.name], setup: set, swaps: windows, swapLog: swaps, error: err, summary: sum, ...slim(raw), consoleErrors: B.errs.slice(0, 5), switchesSeen: begins.length };
}
async function skyLeg() {
  B.errs.length = 0;
  const p = placeById(PLACES[0]);
  await openFresh(p.name, p.id);
  const bad = needFor('sky');
  if (bad) return { error: bad };
  await traceStart('sky');
  const raw = await B.ev(`window.__bench.sky(${JSON.stringify({ dist: O.dist, el: O.el, yaw: 0.35 })})`);
  const tr = await traceStop();
  traceOnFrames(raw, tr, { long: raw.long });
  printTrace(tr);
  const ev = (l) => raw.events.find((e) => e.label === l);
  const parts = [];
  let union = () => false;
  for (const m of raw.marks) {
    const a = ev('sky:' + m.mode), z = ev('sky:' + m.mode + ':end'), commit = raw.events.find((e) => e.label === 'commit' && e.t >= a.t && e.t <= z.t);
    const w = inWindow(raw, a.t, z.t), s = summarise(raw, { mask: w });
    parts.push({ mode: m.mode, transitionMs: m.transitionMs, untilBakedMs: m.untilBakedMs, bakeSwapAtMs: commit ? Math.round(commit.t - a.t) : null, stats: s.stats, long: s.long.slice(0, 4) });
    const prev = union;
    union = (j) => prev(j) || w(j);
    console.log(`  to ${m.mode}: transition ${m.transitionMs} ms, tiles baked after ${m.untilBakedMs} ms, baked parts swapped in at ${commit ? Math.round(commit.t - a.t) + ' ms' : '-'}; window max ${s.stats.max} p99 ${s.stats.p99}`);
  }
  const sum = summarise(raw, { mask: union });
  printRow('sky (both changes)', sum, govText(raw));
  printLong(sum, 5);
  return { changes: parts, summary: sum, ...slim(raw), trace: tr || undefined, consoleErrors: B.errs.slice(0, 5) };
}
async function sceneLeg() {
  B.errs.length = 0;
  const p = placeById(PLACES[0]);
  await openFresh(p.name, p.id);
  const bad = needFor('scene');
  if (bad) return { error: bad };
  const raw = await B.ev(`window.__bench.scene(${JSON.stringify({ scene: O.scene, names: SCENES, maxS: 90 })})`, 200000);
  if (raw.error && !raw.frames) return { error: raw.error };
  const s = summarise(raw);
  console.log(`  scene ${raw.scene} on spot ${raw.locale}, ${raw.sceneSeconds} s${raw.finished ? '' : ' (NOT finished within 90 s)'}, director held the camera ${Math.round((raw.directedShare || 0) * 100)}% of the time`);
  printRow('scene/' + raw.scene, s, govText(raw));
  printLong(s, 5);
  return { scene: raw.scene, locale: raw.locale, sceneSeconds: raw.sceneSeconds, finished: raw.finished, summary: s, ...slim(raw), consoleErrors: B.errs.slice(0, 5), error: raw.error };
}
/**
 * WALK: the player-controlled walking character (being added: reachable as window.__heibel.stage.walker, dropped through a HUD
 * button). This leg: open the centre street, press the button (--walk-button <css>, or the first of WALK_BUTTONS that is on screen),
 * wait for stage.walker, then walk him for 20 s along the street with the keys a player uses (--walk-keys forward,left,right; real
 * key events through DevTools Input.dispatchKeyEvent, held down as a player holds them: forward 6 s, forward+right 1.5 s, forward
 * 5 s, forward+left 1.5 s, forward 6 s) and record the frames. Skipped, with a message, while the page has no such button.
 * >>> When the character lands, check WALK_BUTTONS and the keys against the HUD and the walker's input code. <<<
 */
const WALK_BUTTONS = ['[data-walk]', '#walk', '#walker', '.walk-btn', 'button.walk', 'button[aria-label*="walk" i]', 'button[title*="walk" i]', 'button[aria-label*="loop" i]'];
const KEY = (k) => {
  const named = { arrowup: ['ArrowUp', 38], arrowdown: ['ArrowDown', 40], arrowleft: ['ArrowLeft', 37], arrowright: ['ArrowRight', 39], shift: ['Shift', 16], ' ': [' ', 32] }[k.toLowerCase()];
  if (named) return { key: named[0], code: named[0] === ' ' ? 'Space' : named[0], windowsVirtualKeyCode: named[1] };
  const c = k.toLowerCase();
  return { key: c, code: 'Key' + c.toUpperCase(), windowsVirtualKeyCode: c.toUpperCase().charCodeAt(0), text: c };
};
const keyDown = (k) => B.send('Input.dispatchKeyEvent', { type: 'keyDown', ...KEY(k) });
const keyUp = (k) => { const q = KEY(k); delete q.text; return B.send('Input.dispatchKeyEvent', { type: 'keyUp', ...q }); };
async function walkLeg() {
  const p = placeById(PLACES[0]);
  B.errs.length = 0;
  await openFresh(p.name, p.id);
  const sels = O.walkButton ? [O.walkButton] : WALK_BUTTONS;
  const btn = await B.ev(`window.__bench.walkButton(${JSON.stringify(sels)})`);
  if (!btn) return { skipped: 'no walk button in the page (looked for ' + sels.join(' ') + '); pass --walk-button <css> when it exists' };
  await B.ev(`window.__bench.walkPress(${JSON.stringify(btn)})`);
  let where = null;
  for (let i = 0; i < 100 && !(where = await B.ev('window.__bench.walkWhere()')); i++) await sleep(100);
  if (!where) return { skipped: 'pressed ' + btn + ' but stage.walker did not appear within 10 s' };
  await sleep(1500); // (the drop of the character)
  const [fw, left, right] = [O.walkKeys[0] || 'w', O.walkKeys[1] || 'a', O.walkKeys[2] || 'd'];
  await B.ev('window.__bench.start()');
  const from = await B.ev('window.__bench.walkWhere()');
  const plan = [[[fw], 6000], [[fw, right], 1500], [[fw], 5000], [[fw, left], 1500], [[fw], 6000]];
  const down = new Set();
  try {
    for (const [keys, ms] of plan) {
      for (const k of [...down]) if (!keys.includes(k)) { await keyUp(k); down.delete(k); }
      for (const k of keys) if (!down.has(k)) { await keyDown(k); down.add(k); }
      await sleep(ms);
    }
  } finally { for (const k of down) await keyUp(k); }
  const to = await B.ev('window.__bench.walkWhere()');
  await sleep(500);
  const raw = await B.ev('window.__bench.stop()');
  const s = summarise(raw);
  const moved = from && to && Number.isFinite(from.x) && Number.isFinite(to.x) ? r2(Math.hypot(to.x - from.x, to.z - from.z)) : null;
  console.log(`  walk: button ${btn}, keys ${fw}/${left}/${right}, walked ${moved ?? '?'} m in 20 s`);
  printRow('walk', s, govText(raw));
  printLong(s, 5);
  return { button: btn, keys: [fw, left, right], from, to, moved, summary: s, ...slim(raw), consoleErrors: B.errs.slice(0, 5) };
}
async function streetsLeg() {
  const { S } = loadStreets(), ids = TEN.filter((id) => S[id]);
  B.errs.length = 0;
  const first = S[ids[0]];
  await openFresh(first.name, first.id);
  const bad = needFor('streets');
  if (bad) return { error: bad };
  const after = [];
  let err = null;
  const gc = async () => { try { await B.send('HeapProfiler.collectGarbage'); } catch (e) { /* not available */ } };
  const heap = async () => { try { const h = await B.send('Runtime.getHeapUsage'); return r2(h.usedSize / 1048576); } catch (e) { return null; } };
  await B.ev('window.__bench.start()');
  await traceStart('streets');
  const paused = []; // (page times of the forced collections between streets: left out of the trace's totals)
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    let r;
    if (i === 0) { await sleep(O.hold * 1000); r = { id, name: S[id].name, openMs: null }; }
    else r = await B.ev(`window.__bench.openById(${id}, ${O.hold * 1000})`);
    if (r.error) { err = r.error; break; }
    await B.ev('window.__bench.pause()');
    const pa = await B.ev('performance.now()');
    await gc();
    const m = await B.ev('window.__bench.mem()');
    after.push({ n: i + 1, ...r, memory: m, heapAfterGcMB: await heap() });
    paused.push([pa, await B.ev('performance.now()')]);
    await B.ev('window.__bench.resume()');
    console.log(`    ${pad(i + 1 + ' ' + S[id].name, 28)} open ${f1(r.openMs)} ms | geometries ${m.geometries} textures ${m.textures} programs ${m.programs} | tiles ${m.liveTiles} agents ${m.agents} | heap ${m.jsHeapUsedMB ?? '-'} MB (after gc ${after[after.length - 1].heapAfterGcMB ?? '-'})`);
  }
  const raw = await B.ev('window.__bench.stop()');
  let tr = await traceStop();
  if (tr && !tr.error) {
    const outP = (q) => !paused.some(([a, b]) => q.t >= a - 5 && q.t <= b + 5);
    tr.gc = tr.gc.filter(outP); tr.tasks = tr.tasks.filter(outP);
    const outer = []; for (const g of tr.gc) { const l = outer[outer.length - 1]; if (l && g.t < l.t + l.ms) continue; outer.push(g); }
    tr.gcTotal = { count: outer.length, ms: r2(outer.reduce((a, g) => a + g.ms, 0)), max: outer.length ? Math.max(...outer.map((g) => g.ms)) : 0, major: outer.filter((g) => /Major|MarkCompact|Mark-Compact|MC/i.test(g.name)).length, forcedLeftOut: paused.length };
  }
  traceOnFrames(raw, tr, { long: raw.long });
  printTrace(tr);
  const leak = O.probe ? await B.ev('window.__bench.leakSplit()') : null;
  if (leak) console.log(`  geometries after the leg: renderer ${leak.rendererGeometries} = in the scene ${leak.inScene} + in ${leak.cachedTiles} cached tiles not on screen ${leak.inCachedTiles} + remainder ${leak.remainder}${leak.tileOfReachable ? '' : ' (tileOf not reachable: the cache is counted as remainder)'}; on the street (dyn): ${Object.entries(leak.dyn).map(([k, v]) => k + ' ' + v.objects + '/' + v.geometries).join(', ')}`);
  const s = summarise(raw, { excludeFlagged: true });
  const worldChanges = raw.long.filter((d) => d.flagged).map((d) => ({ i: d.i, t: d.t, ms: d.dt, parts: d.parts.slice(0, 4) }));
  const growth = after.length > 1 ? { geometries: after[after.length - 1].memory.geometries - after[0].memory.geometries, textures: after[after.length - 1].memory.textures - after[0].memory.textures, heapMB: r2((after[after.length - 1].heapAfterGcMB ?? 0) - (after[0].heapAfterGcMB ?? 0)) } : null;
  printRow('streets (no world gaps)', s, govText(raw));
  printLong(s, 4);
  return { streets: after, growthFirstToLast: growth, worldChangeIntervals: worldChanges, summary: s, ...slim(raw), trace: tr || undefined, leakSplit: leak || undefined, consoleErrors: B.errs.slice(0, 5), error: err };
}

const RUNNERS = { flight: flightLeg, switch: switchLeg, sky: skyLeg, scene: sceneLeg, walk: walkLeg, streets: streetsLeg };
try {
  const ids = [...PLACES.map((p) => p.id), ...SWITCH_PAIR.map((p) => p.id), ...TEN];
  const { S } = loadStreets();
  const missingIds = ids.filter((id) => !S[id]);
  if (missingIds.length) console.log('WARNING: street ids not in streets.geojson: ' + missingIds.join(', '));
  B = await launch({ width: 1440, height: 900, dpr: 2, tag: 'bench' });
  if (O.lite) await B.send('Page.addScriptToEvaluateOnNewDocument', { source: LITE_SRC }); // before the first navigation: world.js:92 reads it at module load
  console.log(`dev-bench: legs ${LEGS.join(',')} | seed ${O.seed} | time ${O.time} | ${O.lite ? 'LITE (phone path)' : 'normal path'} | ${O.plain ? 'plain (no wrappers)' : 'with timing wrappers'} | 1440x900 at dpr 2`);
  printHead();
  for (const leg of ALL_LEGS.filter((l) => LEGS.includes(l))) {
    console.log(`== ${leg}`);
    const t = Date.now();
    try { result.legs[leg] = await RUNNERS[leg](); } catch (e) { result.legs[leg] = { error: String(e && e.message || e) }; console.log(`  ${leg} failed: ${result.legs[leg].error}`); }
    if (result.legs[leg].skipped) console.log('  skipped: ' + result.legs[leg].skipped);
    result.legs[leg].wallSeconds = r2((Date.now() - t) / 1000);
    save();
  }
  // ---- verdicts against the frame-time targets
  const V = [], L = result.legs, H = O.hz;
  const line = (name, ok, text) => V.push({ target: name, pass: ok, detail: text });
  const flight = L.flight && L.flight.stats, scene = L.scene && L.scene.summary && L.scene.summary.stats, walk = L.walk && L.walk.summary && L.walk.summary.stats;
  const roam = [flight, scene, walk].filter((x) => x && x.count);
  if (roam.length) {
    const all = roam.reduce((a, s) => ({ n: a.n + s.count, sec: a.sec + s.seconds }), { n: 0, sec: 0 });
    const fps = all.n / all.sec;
    line(`frame rate held at ${H} Hz (roaming + scene)`, fps >= H * 0.98 && roam.every((s) => s.dropped <= s.count * 0.01), `${r2(fps)} fps over ${all.n} frames; dropped frames (>=1.5x median): ${roam.map((s) => s.dropped).join(' + ')}`);
    line('99% of frames under 20 ms (roaming, scenes)', roam.every((s) => s.p99 < 20), `p99 ${roam.map((s) => s.p99).join(' / ')} ms (flight / scene${walk && walk.count ? ' / walk' : ''})`);
  } else line('frame rate and p99 (roaming, scenes)', false, 'no flight or scene frames recorded');
  const maxes = [];
  if (L.switch && L.switch.summary) maxes.push(['street switch', L.switch.summary.stats.max]);
  if (L.sky && L.sky.summary) maxes.push(['day/night', L.sky.summary.stats.max]);
  if (flight) maxes.push(['tile loading (flight)', flight.max]);
  if (maxes.length) line('no frame over 50 ms (street switch, day/night, tile loading)', maxes.every((m) => m[1] <= 50), maxes.map((m) => `${m[0]} max ${m[1]} ms`).join(', '));
  else line('no frame over 50 ms', false, 'no switch, sky or flight frames recorded');
  const govLegs = Object.entries(L).filter(([, v]) => v && v.governor || (v && v.places));
  const changes = [], notFull = [];
  for (const [k, v] of Object.entries(L)) {
    const gs = v.governor ? [v.governor] : v.places ? Object.values(v.places).filter((p) => p.governor).map((p) => p.governor) : [];
    for (const g of gs) { if (g.changes.length) changes.push(k + ' x' + g.changes.length); if (g.start && g.start.level !== 0) notFull.push(k); }
  }
  line('resolution governor stays at full resolution', govLegs.length > 0 && !changes.length && !notFull.length, govLegs.length ? (changes.length ? 'changes: ' + changes.join(', ') : 'no change in any leg') + (notFull.length ? '; not at full at the start of ' + notFull.join(',') : '') : 'no leg recorded');
  result.verdict = V;
  result.meta.lite = O.lite;
  save();
  console.log('== verdict' + (O.lite ? ' (LITE: the targets are for the normal path; compare these numbers with a normal run)' : ''));
  for (const v of V) console.log(`  ${v.pass ? 'PASS' : 'FAIL'}  ${v.target}: ${v.detail}`);
  if (result.selfCheck && result.selfCheck.invalid) console.log('  NOTE: the self-check marked this run invalid: ' + result.selfCheck.invalid.join('; '));

  if (A.baseline && A.baseline !== true) {
    try {
      const base = JSON.parse(fs.readFileSync(A.baseline, 'utf8'));
      if (base.meta && base.meta.options && (!!base.meta.options.lite !== O.lite || !!base.meta.options.plain !== O.plain)) console.log(`  WARNING: the baseline was run with lite=${!!base.meta.options.lite}, plain=${!!base.meta.options.plain}; this run lite=${O.lite}, plain=${O.plain}: the comparison means little`);
      console.log('== change against ' + A.baseline + ' (median / p99 / max, ms)');
      const pick = (l) => (l && l.stats ? l.stats : l && l.summary ? l.summary.stats : null);
      for (const k of ALL_LEGS) {
        const a = pick(base.legs && base.legs[k]), b = pick(result.legs[k]);
        if (a && b && a.count && b.count) console.log(`  ${pad(k, 9)} ${a.median} / ${a.p99} / ${a.max}  ->  ${b.median} / ${b.p99} / ${b.max}`);
      }
    } catch (e) { console.log('  baseline not readable: ' + e.message); }
  }
  console.log(`wrote ${OUT}`);
} catch (e) {
  console.error('dev-bench failed: ' + (e && e.stack || e));
  result.fatal = String(e && e.message || e);
  try { save(); } catch (e2) { /* nothing to save */ }
  process.exitCode = 1;
} finally {
  if (B) await B.close();
}
