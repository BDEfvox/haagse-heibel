// Dev tool: one picture of a named street from a given camera position and time of day, in a headless Chrome.
//
// usage (dev server `heibel-audit` on http://localhost:5190 must be up; only ONE renderer at a time: no sweep, no live tab on the site):
//   node scripts/dev-shot.mjs "<street>" <HH:MM> <out.png> [--seed s] [--lvl n] [--only gag] [--cam "mx,my,dist,az,el"]
//                             [--settle secs] [--w 1440 --h 900 --dpr 1]
//   "<street>"  a street name as `?q=` finds it (exact, case-insensitive, the FIRST street of that name), or `#<id>` for a street by its
//               index in public/data/streets.geojson (needed for names that occur twice, e.g. "#3134" = Weimarstraat on the Koningsplein side).
//   --cam       the camera TARGET in MAP metres (mx = east, my = north; x = (lon-4.30)*68430, y = (lat-52.07)*111267), then the units the stage
//               stores in its camera goal `stage.goal` / `stage.rig` (stage.js:206): dist in metres from the target, az in RADIANS in the
//               OPENED STREET's own frame (not compass: camera = target + dist*(sin az*cos el, sin el, cos az*cos el) in scene x,y,z),
//               el in RADIANS above the ground. The printed --cam string is in exactly these units, so a picture can be retaken later.
//               The street's frame is a pure function of its geometry, so the same street gives the same az on every run.
//   no --cam    the view the street opens with after landing: the director's wide view of the first spot (`stage._view(locales[0])`).
//               It is held still (the stage is put in free mode on that exact view, the roam hook is switched off), so what is printed is what is shown.
//   --settle    real seconds to wait after placing the camera (default 4). Afterwards the script ALSO waits until the tile streamer reports
//               nothing pending (no tile loading, nothing waiting to be built, every wanted tile on screen, no detailed front under construction,
//               no day/night change) for 1.5 s in a row, at most 60 s extra. For a calm HUD use --settle 9 (the street title shrinks after 7 s,
//               the drag hint fades after 8 s). Nothing is hidden: the HUD, the "!" pins and the roam toast are in the picture.
//   --only      force one scene at the first spot (default napCat: a cat naps on a bench; no crime scene takes the camera). `--only any` = no
//               forcing (the director plays whatever it picks, nondeterministic).
//   Defaults: --w 1440 --h 900 --dpr 1. Keep both sides >= 560 px (smaller = "lite" mode builds less) and dpr 1 (above 1 the pixel-ratio governor may change mid-run).
//
// Output: the PNG, then lines on stdout:  `cam: --cam "mx,my,dist,az,el"` (retake with exactly this), the compass bearing the camera looks towards,
//   whether the streamer had settled, and the browser's console errors (`B.errs`).
// Same camera + time + seed + --only => the same picture EXCEPT for: the crowd (walkers, bikes, cars, trams move in real time and are not seeded by the
//   page's clock), clouds and gulls/boats/helicopter (they move with the elapsed time since landing), the cat's exact pose (scene timing follows real
//   frame times), shader animation (water, foliage; uTime = performance.now), the HUD's ticker text and slam animation (timers), and tiles that were still
//   streaming (see "settled" in the output; if it says no, retake with a larger --settle). Compare tiles, buildings, ground, light, shadows, signs and fronts.
import fs from 'node:fs';
import { launch, args } from './dev-lib.mjs';

const A = args();
const [street, time = '14:00', out] = A._;
if (!street || !out) {
  console.error('usage: node scripts/dev-shot.mjs "<street>" <HH:MM> <out.png> [--seed s] [--lvl n] [--only gag] [--cam "mx,my,dist,az,el"] [--settle secs] [--w 1440 --h 900 --dpr 1]');
  process.exit(2);
}
const width = +A.w || 1440, height = +A.h || 900, dpr = +A.dpr || 1;
const settle = A.settle !== undefined && A.settle !== true ? +A.settle : 4;
const only = A.only === undefined || A.only === true ? 'napCat' : A.only === 'any' ? '' : A.only;
const lvl = A.lvl !== undefined && A.lvl !== true ? +A.lvl : null;
const seed = A.seed !== undefined && A.seed !== true ? A.seed : null;
let cam = null;
if (A.cam && A.cam !== true) {
  const v = String(A.cam).split(',').map(Number);
  if (v.length !== 5 || v.some((x) => !Number.isFinite(x))) { console.error('--cam needs five numbers: "mx,my,dist,az,el"'); process.exit(2); }
  cam = { mx: v[0], my: v[1], dist: v[2], az: v[3], el: v[4] };
}

/** Runs in the page: finds the internals this tool relies on. */
function pageCheck() {
  const H = window.__heibel, st = H && H.stage, rows = [];
  const need = (name, ok) => rows.push([name, !!ok]);
  need('window.__heibel (main.js:534)', H);
  need('stage.W.frame.M/S (world.js:1732, :196-)', st && st.W && st.W.frame && st.W.frame.M && st.W.frame.S);
  need('stage.rig / stage.goal {tx,tz,ty,az,el,dist} (stage.js:206-207)', st && ['tx', 'tz', 'ty', 'az', 'el', 'dist'].every((k) => typeof st.rig[k] === 'number' && typeof st.goal[k] === 'number'));
  need('stage._setMode (stage.js:359)', st && typeof st._setMode === 'function');
  need('stage._view + stage.locales (stage.js:354, :1157)', st && typeof st._view === 'function' && st.locales && st.locales.length);
  need('stage.hooks.onRoam (stage.js:1504, main.js:315)', st && st.hooks && 'onRoam' in st.hooks);
  need('stage.W.landY (world.js:1650)', st && st.W && typeof st.W.landY === 'function');
  need('stage.W.stream {pending,ready,want,live,lodOf,staged,target} (world.js:2213-2219)', st && st.W && st.W.stream && ['pending', 'ready', 'want', 'live', 'lodOf', 'staged'].every((k) => k in st.W.stream) && 'target' in st.W.stream);
  return rows;
}

const B = await launch({ width, height, dpr, tag: 'shot' });
try {
  try { await B.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false }); } catch (e) { /* the window size flag is still in force */ }
  const byId = street[0] === '#';
  const opened = await B.open(byId ? 'x' : street, { time, only, seed, lvl, query: byId ? `x=1#s=${+street.slice(1)}` : '' });
  if (!opened) throw new Error(`the street "${street}" did not open (no landing within the time limit): is the dev server up on :5190, and is the name exact?`);
  const rows = await B.ev(`(${pageCheck})()`);
  const miss = rows.filter((r) => !r[1]);
  console.log('internals: ' + rows.map((r) => (r[1] ? 'ok ' : 'MISSING ') + r[0]).join('\n           '));
  if (miss.length) throw new Error('missing internals: ' + miss.map((r) => r[0]).join('; '));

  /** Page side: free mode, camera placed exactly (rig AND goal, so nothing glides), roaming switched off. Returns what was applied. */
  const place = (c) => `(() => {
    const H = window.__heibel, st = H.stage, W = st.W, c = ${JSON.stringify(c)};
    st.hooks.onRoam = null; // no focus shift to another street while the picture is prepared
    window.__shotW = W;
    let v;
    if (c) { const s = W.frame.S(c.mx, c.my); v = { tx: s[0], tz: s[1], az: c.az, el: c.el, dist: c.dist }; }
    else { v = st._view(st.locales[0]); }
    if (st.mode !== 'free') st._setMode('free'); // (it clamps el and dist of the goal: the values are written after it)
    const ty = W.landY(v.tx, v.tz) + 1.5; // free mode rewrites goal.ty to this every frame (stage.js:1488)
    for (const o of [st.rig, st.goal]) Object.assign(o, { tx: v.tx, tz: v.tz, ty, az: v.az, el: v.el, dist: v.dist, roll: 0 });
    return { mode: st.mode, street: W.st.name };
  })()`;
  const put = await B.ev(place(cam));
  console.log(`placed: ${JSON.stringify(put)} viewport ${width}x${height}@${dpr}`);

  await B.ev(`new Promise((r) => setTimeout(r, ${Math.round(settle * 1000)}))`);

  /** Page side: how much work the streamer still has (0 = idle). Also guards against a focus shift (the world object must be the same). */
  const pending = () => B.ev(`(() => {
    const st = window.__heibel.stage, W = st.W;
    if (W !== window.__shotW) return { moved: true };
    const S = W.stream, want = S.want || [];
    let todo = S.pending.size + S.ready.size + S.staged.size + (S.busy ? 1 : 0) + (S.target !== null && S.target !== undefined ? 1 : 0) + (st.tr ? 1 : 0);
    for (const k of want) { const c = S.live.get(k); if (S.failed && S.failed.has(k) && !S.live.has(k)) continue; if (!c || c.lod > S.lodOf.get(k)) todo++; }
    let jobs = 0, fronts = 0;
    for (const c of S.live.values()) if (c.cells) for (const cell of c.cells) { if (cell.job) jobs++; if (cell.detail) fronts++; }
    return { todo, jobs, fronts, built: S.built };
  })()`);
  let calm = 0, last = '', waited = 0, settled = false;
  while (waited < 60) {
    const p = await pending();
    if (p.moved) throw new Error('the focus shifted to another street while the picture was prepared (stage.W changed)');
    const key = JSON.stringify(p);
    if (p.todo === 0 && p.jobs === 0 && key === last) calm += 0.5; else calm = 0;
    last = key;
    if (calm >= 1.5) { settled = true; break; }
    await B.ev('new Promise((r) => setTimeout(r, 500))');
    waited += 0.5;
  }

  // the camera as it is in this very frame: map target, dist, az, el
  const used = await B.ev(`(() => {
    const st = window.__heibel.stage, W = st.W, r = st.rig, m = W.frame.M(r.tx, r.tz), F = W.frame;
    const vx = -Math.sin(r.az) * F.dx - Math.cos(r.az) * F.dy, vy = -Math.sin(r.az) * F.dy + Math.cos(r.az) * F.dx; // from the camera towards the target, in map terms
    return { mx: m[0], my: m[1], dist: r.dist, az: r.az, el: r.el, bearing: (Math.atan2(vx, vy) * 180 / Math.PI + 360) % 360, mode: st.mode, name: W.st.name };
  })()`);
  await B.ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  await B.shot(out);
  const camStr = `${used.mx.toFixed(2)},${used.my.toFixed(2)},${used.dist.toFixed(2)},${used.az.toFixed(4)},${used.el.toFixed(4)}`;
  console.log(`picture: ${out} (${fs.statSync(out).size} bytes) street "${used.name}" at ${time}${seed != null ? ' seed ' + seed : ''}${lvl ? ' lvl ' + lvl : ''} only=${only || 'any'}`);
  console.log(`cam: --cam "${camStr}"`);
  console.log(`     (target ${used.mx.toFixed(1)}, ${used.my.toFixed(1)} map metres; ${used.dist.toFixed(1)} m away; az ${used.az.toFixed(4)} rad in the street's frame; el ${used.el.toFixed(4)} rad; looks towards compass ${used.bearing.toFixed(0)} deg)`);
  console.log(`streamer settled: ${settled ? 'yes' : 'NO (still working after ' + (settle + waited).toFixed(1) + ' s: retake with a larger --settle)'}`);
  console.log('console errors: ' + (B.errs.length ? '\n  ' + [...new Set(B.errs)].slice(0, 10).join('\n  ') : 'none'));
} catch (e) {
  console.error('dev-shot failed: ' + (e && e.message ? e.message : e));
  if (B.errs.length) console.error('console errors:\n  ' + [...new Set(B.errs)].slice(0, 10).join('\n  '));
  process.exitCode = 1;
} finally {
  await B.close();
}
