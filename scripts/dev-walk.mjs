// Dev tool: a recorded walk of the walking character in the real site (headless Chrome, dev-lib.mjs), driven as a player drives him.
// It opens a street, brings the free camera over the route's first point (the one thing set from outside: where the camera looks
// when Walk is pressed), presses the real Walk button with a real mouse click, and then steers him with real key events through the
// DevTools protocol (Input.dispatchKeyEvent, key + code as a keyboard sends them: W A S D, Q / E to keep the camera behind him,
// Shift to run). The keys are chosen as a player would: the camera is turned towards the way to go (Q / E) while W is held; only
// when the way is far off (a corner) is the nearest of the eight directions of W A S D held instead. The path is the one scripts/dev-walk-sim.mjs planned on the same tiles (--plan), so
// the headless walk and this one take the same way. Every frame of the stage (a wrapper round stage._frame) the page records his
// map position (his own and the one his drawn matrix gives), heading, height over the ground under his feet, whether something
// stopped him, the ground class, the open street, and the nearest crowd walker; pictures at the route's named waypoints.
// Prints the table dev-walk-sim prints, and writes everything to the JSON file.
//   node scripts/dev-walk.mjs <out.json> [--path scripts/dev-walk-path.json] [--street "Grote Marktstraat"] [--time 14:00]
//        [--seed walk] [--only napCat] [--shots <dir>] [--secs 600] [--width 1280] [--height 800]
//   node scripts/dev-walk.mjs <out.json> --layout     (the controls on three phone screens, see below)
// After the walk, the checks: W held when Walk is pressed (he must not walk off), W held through Esc (the camera must not pan), W held
// while Follow is pressed (the camera must stay following), Shift + wheel while walking (zooms, does not turn), no stick on a desktop,
// Walk twenty times on and off (the renderer's geometry count comes back), and last the way out by zooming while he walks (the walk
// ends before the way out begins: no frame of it has him or his stick).
// Needs the dev server without auto-reload (launch config heibel-audit, http://localhost:5190; another with HEIBEL_URL) and Chrome.
// Synthetic input: DevTools protocol key and mouse events arrive as trusted events; no guard of the page refuses them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, args, sleep } from './dev-lib.mjs';
import { pursue } from './dev-walk-route.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const A = args();
const outFile = A._[0];
if (!outFile) { console.error('usage: node scripts/dev-walk.mjs <out.json> [--path file] [--street name] [--shots dir] [--secs 600]'); process.exit(2); }
const plan = JSON.parse(fs.readFileSync(typeof A.path === 'string' ? A.path : path.join(HERE, 'dev-walk-path.json'), 'utf8'));
const street = typeof A.street === 'string' ? A.street : 'Grote Marktstraat';
const shots = typeof A.shots === 'string' ? A.shots : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const SECS = +(A.secs || 1500); // (wall seconds: a slow page walks him slowly, at most 0.12 m a frame)

// ------------------------------------------------------------------ page side (injected once; self-contained)
function pageCode() {
  const H = window.__heibel, st = H.stage;
  const R = { frames: [], shifts: [], errs: [], streetAt0: null, walkAtExit: 0, stickAtExit: 0 };
  let lastW = null, lastM = null, lastId = -1;
  const orig = st._frame.bind(st);
  st._frame = (now) => {
    orig(now);
    try {
      // every way out of the street view ends the walk first: no frame of the way out may still have him (or his stick)
      if (st.exiting || st.mode === 'leave') { if (st.walker || st.mode === 'walk') R.walkAtExit++; if (!document.querySelector('#walk-stick').hidden) R.stickAtExit++; }
      const W = st.W, wk = st.walker;
      if (!W) return;
      if (lastW && W !== lastW) R.shifts.push({ t: performance.now(), from: lastW.st.name, to: W.st.name });
      lastW = W;
      if (!wk) return;
      wk.g.updateMatrixWorld(true);
      const e = wk.g.matrixWorld.elements, x = e[12], y = e[13], z = e[14], m = W.frame.M(x, z), G = W.ground;
      // the ground under the centre and the four shoe corners (W.hAt, as dev-count), and what stands under his centre (W.ground bits)
      // (a shoe corner over ground higher than his footprint's by more than his step limit is over a ledge he was stopped beside: left out)
      const lim = G.at(x, z, 0.25, 0, 127) + 0.45;
      let hi = W.hAt(x, z);
      for (const [lx, lz] of [[-0.36, -0.17], [0.36, -0.17], [-0.36, 0.27], [0.36, 0.27]]) { const px = e[0] * lx + e[8] * lz + x, pz = e[2] * lx + e[10] * lz + z, h = W.hAt(px, pz); if (h > hi && h <= lim) hi = h; }
      const top = y - hi;
      G.at(x, z, 0, 0, 0); const bits = G.bits, cls = G.cls;
      let md = Infinity;
      for (const a of st.crowd.agents) if (!a.dead && a.vis && a.kind === 0 && !(a.down > 0)) { const d = Math.hypot(a.x - x, a.z - z); if (d < md) md = d; }
      // (a step is only a step within one walk: a new drop elsewhere starts again)
      const jump = lastM && lastId === wk.id ? Math.hypot(m[0] - lastM[0], m[1] - lastM[1]) : 0;
      lastM = m; lastId = wk.id;
      R.frames.push([+performance.now().toFixed(1), +wk.mx.toFixed(3), +wk.my.toFixed(3), +m[0].toFixed(3), +m[1].toFixed(3), +wk.heading.toFixed(3), +(y - hi).toFixed(3), +top.toFixed(3), wk.blocked ? 1 : 0, cls, bits, W.st.name, +md.toFixed(2), +jump.toFixed(4), +wk.speed.toFixed(2), wk.id, wk.waiting ? 1 : 0, +st.time.toFixed(3)]);
    } catch (err) { if (R.errs.length < 10) R.errs.push(String(err && err.stack || err).slice(0, 300)); }
  };
  window.__walk = {
    R,
    /** Where he is and which ways the camera's forward and right point, in map terms (for the steering on the Node side). */
    state() {
      const W = st.W, wk = st.walker, F = W && W.frame, az = st.rig.az;
      if (!W) return null;
      const lin = (a, b) => [a * F.dx + b * F.dy, a * F.dy - b * F.dx];
      return { mode: st.mode, street: W.st.name, walking: !!wk, mx: wk ? wk.mx : null, my: wk ? wk.my : null, blocked: wk ? wk.blocked : false, waiting: wk ? wk.waiting : false, speed: wk ? wk.speed : 0,
        fwd: lin(-Math.sin(az), -Math.cos(az)), right: lin(Math.cos(az), -Math.sin(az)), dist: st.rig.dist, t: st.time, id: wk ? wk.id : 0 };
    },
    /** What W.ground says between him and a map point (0.5, 1, 2, 3 m towards it): the height, or why not (bits, not ready). */
    ahead(mx, my) {
      const W = st.W, wk = st.walker, G = W.ground;
      if (!wk) return null;
      const out = [], d = Math.hypot(mx - wk.mx, my - wk.my) || 1;
      for (const r of [0.5, 1, 2, 3]) { const s = W.frame.S(wk.mx + ((mx - wk.mx) / d) * r, wk.my + ((my - wk.my) / d) * r); if (!G.ready(s[0], s[1])) { out.push(r + 'm: not ready'); continue; } const h = G.at(s[0], s[1], 0.25); out.push(r + 'm: ' + (h === h ? 'free ' + (h - wk.hg).toFixed(2) + ' m up' : 'blocked bits ' + G.bits + ' cls ' + G.cls)); }
      return out.join('; ');
    },
    /** Of W, A, S, D: the key whose way (from the camera on screen) is free the farthest, up to 3 m, by W.ground (for the held-key check). */
    freeKey() {
      const W = st.W, wk = st.walker, G = W.ground, az = st.rig.az, p = wk.g.position;
      const dirs = { w: [-Math.sin(az), -Math.cos(az)], s: [Math.sin(az), Math.cos(az)], d: [Math.cos(az), -Math.sin(az)], a: [-Math.cos(az), Math.sin(az)] };
      let best = 'w', bd = -1;
      for (const k in dirs) { let d = 0; for (let r = 0.25; r <= 3; r += 0.25) { const x = p.x + dirs[k][0] * r, z = p.z + dirs[k][1] * r, h = G.ready(x, z) ? G.at(x, z, 0.3) : NaN; if (h !== h || Math.abs(h - wk.hg) > 0.45) break; d = r; } if (d > bd) { bd = d; best = k; } }
      return { key: best, freeM: bd };
    },
    geoPer() { let n = 0; const w = st.walker; if (w) w.g.traverse((c) => { if (c.geometry) n++; }); return n; },
    /** Bring the free camera over a map point (where Walk will put him), at walking distance; the camera is the viewer's from here. */
    aim(mx, my, bx, by) {
      const W = st.W, s = W.frame.S(mx, my), F = W.frame;
      st._take();
      const d = [bx * F.dx + by * F.dy, bx * F.dy - by * F.dx], az = Math.atan2(-d[0], -d[1]); // (looking along the map direction (bx, by))
      Object.assign(st.goal, { tx: s[0], tz: s[1], ty: W.landY(s[0], s[1]) + 1.5, dist: 30, el: 0.4, az });
      Object.assign(st.rig, st.goal);
      return true;
    },
    box(sel) { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(), cs = getComputedStyle(el); return { x: b.left + b.width / 2, y: b.top + b.height / 2, l: b.left, t: b.top, r: b.right, b: b.bottom, shown: !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0, disabled: !!el.disabled, cls: el.className }; },
    cam() { const st2 = window.__heibel.stage, W = st2.W, g = st2.goal, m = W.frame.M(g.tx, g.tz); return { mode: st2.mode, walking: st2.walking, gx: m[0], gy: m[1], az: st2.rig.az, dist: st2.rig.dist, exiting: !!st2.exiting }; },
    walkBox() { const b = document.querySelector('#btn-walk').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, disabled: document.querySelector('#btn-walk').disabled }; },
    take(n) { const out = R.frames.splice(0, n); return out; },
  };
  return true;
}

// ------------------------------------------------------------------ --layout: the walking controls on three phone screens
// (touch emulated: hover none, coarse pointer). The case file is opened first (the worst case), then Walk pressed: the file must be
// folded while he walks and open again after; the stick shown; and none of stick, Walk, the pad, Follow / Next street, the case
// file and the ticker may overlap. Prints the boxes (x from the left, y from the bottom, CSS px) and LAYOUT PASS or FAIL.
if (A.layout) {
  const SIZES = [[375, 667], [320, 568], [667, 375]], res = [];
  for (const [w, h] of SIZES) {
    const L = await launch({ width: w, height: h, tag: 'walklayout' });
    const r = { size: w + 'x' + h };
    try {
      // a touch screen: the mobile metrics and touch emulation make (hover: none) and (pointer: coarse) true (setEmulatedMedia does not take these two)
      await L.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true });
      await L.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      if (!(await L.open(street, { time: '14:00', seed: 'walk', only: 'napCat' }))) throw new Error('the street did not open');
      await L.ev(`(${pageCode.toString()})()`);
      const P = plan.pts;
      await L.ev(`window.__walk.aim(${P[0].at[0]}, ${P[0].at[1]}, ${P[1].at[0] - P[0].at[0]}, ${P[1].at[1] - P[0].at[1]})`);
      for (let i = 0; i < 300 && !(await L.ev('(() => { const s = window.__heibel.stage; return s.mode === "free" && s.W.ground.ready(s.rig.tx, s.rig.tz); })()')); i++) await sleep(200);
      await sleep(1500);
      const click = async (sel) => { const b = await L.ev(`window.__walk.box(${JSON.stringify(sel)})`); for (const type of ['mousePressed', 'mouseReleased']) await L.send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 }); };
      if (/\bshut\b/.test((await L.ev('window.__walk.box("#file")')).cls)) { await click('#file-fold'); await sleep(400); }
      await click('#btn-walk');
      for (let i = 0; i < 60 && !(await L.ev('!!window.__heibel.stage.walker')); i++) await sleep(100);
      await sleep(800);
      const SEL = { stick: '#walk-stick', walk: '#btn-walk', pad: '#cam-pad', follow: '#btn-follow', next: '#btn-next', file: '#file', ticker: '#ticker' }, bx = {};
      for (const [k, sel] of Object.entries(SEL)) { const q = await L.ev(`window.__walk.box(${JSON.stringify(sel)})`); bx[k] = q && q.shown ? { x0: Math.round(q.l), x1: Math.round(q.r), y0: Math.round(h - q.b), y1: Math.round(h - q.t), shut: /\bshut\b/.test(q.cls) || undefined } : null; }
      r.boxes = bx; r.stickShown = !!bx.stick; r.fileFoldedWhileWalking = !!(bx.file && bx.file.shut);
      r.overlaps = [];
      const ks = Object.keys(bx).filter((k) => bx[k]);
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const a = bx[ks[i]], b = bx[ks[j]]; if ((ks[i] === 'follow' || ks[i] === 'next') && (ks[j] === 'follow' || ks[j] === 'next')) continue; if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) r.overlaps.push(ks[i] + '/' + ks[j]); }
      await click('#btn-walk'); await sleep(600);
      r.fileOpenAgain = !/\bshut\b/.test((await L.ev('window.__walk.box("#file")')).cls);
      r.ok = r.stickShown && r.fileFoldedWhileWalking && r.fileOpenAgain && !r.overlaps.length;
    } catch (e) { r.error = String(e.message || e); r.ok = false; } finally { await L.close(); }
    res.push(r);
    console.log(JSON.stringify(r));
  }
  fs.writeFileSync(outFile, JSON.stringify(res));
  const okAll = res.every((r) => r.ok);
  console.log(okAll ? 'LAYOUT PASS' : 'LAYOUT FAIL');
  process.exit(okAll ? 0 : 1);
}

// ------------------------------------------------------------------ Node side
const B = await launch({ width: +(A.width || 1280), height: +(A.height || 800), tag: 'walk' });
const { ev, send, shot, errs, close } = B;
const out = { when: new Date().toISOString(), street, path: plan.pts.length, frames: [], shifts: [], legs: [], errs: [] };
try {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'hover' }, { name: 'pointer', value: 'fine' }] }); // (a desktop: no stick)
  const ok = await B.open(street, { time: typeof A.time === 'string' ? A.time : '14:00', seed: typeof A.seed === 'string' ? A.seed : 'walk', only: typeof A.only === 'string' ? A.only : null });
  if (!ok) throw new Error('the street did not open');
  await ev(`(${pageCode.toString()})()`);
  const P = plan.pts, p0 = P[0], p1 = P[1];
  await ev(`window.__walk.aim(${p0.at[0]}, ${p0.at[1]}, ${p1.at[0] - p0.at[0]}, ${p1.at[1] - p0.at[1]})`);
  // (the camera was moved some 300 m from where the street opened: wait until the finest tiles under the new point are built)
  let rd = false;
  for (let i = 0; i < 300 && !rd; i++) { await sleep(200); rd = await ev('(() => { const s = window.__heibel.stage; return s.mode === "free" && !!s.W.ground && s.W.ground.ready(s.rig.tx, s.rig.tz); })()'); }
  if (!rd) throw new Error('the ground under the first point did not become ready in 60 s');
  await sleep(1500);
  const wb = await ev('window.__walk.walkBox()');
  if (wb.disabled) throw new Error('the Walk button is disabled');
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: wb.x, y: wb.y, button: 'left', clickCount: 1 });
  let s = null;
  for (let i = 0; i < 80 && !(s && s.walking); i++) { await sleep(100); s = await ev('window.__walk.state()'); }
  if (!s || !s.walking) throw new Error('Walk did not put him on the street: ' + JSON.stringify(s));
  if (shots) await shot(path.join(shots, '00-dropped.png'));
  // the keys a player holds
  const KEYS = { w: ['w', 'KeyW', 87], a: ['a', 'KeyA', 65], s: ['s', 'KeyS', 83], d: ['d', 'KeyD', 68], q: ['q', 'KeyQ', 81], e: ['e', 'KeyE', 69], shift: ['Shift', 'ShiftLeft', 16], minus: ['-', 'Minus', 189] };
  const held = new Set();
  const key = async (k, down) => {
    if (down === held.has(k)) return;
    const [kk, code, vk] = KEYS[k];
    await send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key: held.has('shift') && kk.length === 1 ? kk.toUpperCase() : kk, code, windowsVirtualKeyCode: vk, modifiers: (k === 'shift' ? down : held.has('shift')) ? 8 : 0 }); // (a real Shift press carries its own flag; without it Chrome hands a Shift + wheel on as a plain sideways scroll)
    if (down) held.add(k); else held.delete(k);
  };
  const want = async (set) => { for (const k of Object.keys(KEYS)) await key(k, set.has(k)); };
  // The driver: every poll it reads where he is and which way the camera looks NOW (rig.az), and holds the keys for that. Time is the
  // stage's (st.time: it runs slow when the page does, and so does he): a leg is given up only when, in 10 s of stage time, he has
  // come less than 1 m closer while not waiting for ground being built (or after 30 s + 2 s a metre); the reason and what W.ground
  // says in front of him go into the log, and the drive goes on with the next point.
  const t0 = Date.now();
  // (stage seconds: a leg's time leaves out the time spent waiting for ground being built; so does the no-progress clock)
  let wi = 1, leg0 = s.t, legWait = 0, best = Infinity, bestT = s.t, bestWait = 0, pushT = 0, lastT = s.t;
  const legLog = (o) => { out.legs.push(o); console.log('leg ' + o.to + ': ' + (o.why ? 'GIVEN UP (' + o.why + ')' + (o.ahead ? ' ahead: ' + o.ahead : '') : 'reached in ' + o.t + ' s of stage time')); };
  const nextLeg = () => { wi++; leg0 = s.t; legWait = 0; best = Infinity; bestT = s.t; bestWait = 0; pushT = 0; };
  const n8 = [['w'], ['w', 'd'], ['d'], ['s', 'd'], ['s'], ['s', 'a'], ['a'], ['w', 'a']];
  while (wi < P.length && Date.now() - t0 < SECS * 1000) {
    s = await ev('window.__walk.state()');
    if (!s || !s.walking) { legLog({ to: P[wi].name, why: 'he is no longer on the street: ' + JSON.stringify(s && { mode: s.mode, street: s.street }) }); break; }
    const Q = P[wi], dt = Math.max(0, s.t - lastT);
    lastT = s.t;
    if (s.waiting) { legWait += dt; bestWait += dt; } // (ground being built ahead: waiting is not being stuck)
    // the path as a player follows it (dev-walk-route.mjs pursue, the same as the headless walk): points passed, and where to steer
    const pr = pursue(P, wi, s.mx, s.my), ex = pr.cx - s.mx, ey = pr.cy - s.my, ed = Math.hypot(ex, ey), legT = +(s.t - leg0 - legWait).toFixed(1);
    pushT = Q.push && s.blocked && !s.waiting && s.speed < 0.3 ? pushT + dt : 0;
    const anchor = !/\.\d+$/.test(Q.name);
    if (Q.push ? pushT > 1.5 : pr.wi > wi) {
      if (Q.push) {
        // stopped: by the water it was sent into, or by something else?
        const ah = await ev(`window.__walk.ahead(${Q.at[0]}, ${Q.at[1]})`), m = /^0\.5m: blocked bits (\d+)/.exec(ah || '');
        if (!m || !(+m[1] & 2)) { legLog({ to: Q.name, why: 'stopped, but not by water', ahead: ah, stuck: true, at: [s.mx, s.my] }); nextLeg(); continue; }
      }
      legLog({ to: Q.name, t: legT, what: Q.what || '' });
      if (shots && anchor) { await want(new Set()); await sleep(400); await shot(path.join(shots, String(out.legs.length).padStart(2, '0') + '-' + Q.name + '.png')); }
      nextLeg();
      continue;
    }
    if (pr.rem < best - 1) { best = pr.rem; bestT = s.t; bestWait = 0; }
    const noProgress = s.t - bestT - bestWait > 10, tooLong = legT > 30 + 2 * Math.hypot(Q.at[0] - P[wi - 1].at[0], Q.at[1] - P[wi - 1].at[1]);
    if (!Q.push && (noProgress || tooLong)) {
      legLog({ to: Q.name, why: (noProgress ? 'no metre closer in 10 s' : 'over its time') + ', ' + pr.rem.toFixed(1) + ' m of path short, at ' + s.mx.toFixed(1) + ',' + s.my.toFixed(1) + (s.blocked ? ', blocked' : ''), ahead: await ev(`window.__walk.ahead(${pr.cx}, ${pr.cy})`), stuck: true, at: [s.mx, s.my] });
      nextLeg();
      continue;
    }
    if (Q.push && legT > 20) { legLog({ to: Q.name, why: 'never stopped by the water in 20 s', stuck: true, at: [s.mx, s.my] }); nextLeg(); continue; }
    // the camera: Q / E while the way to go is more than 0.06 rad off its forward (E turns the view right: stage.js _keys az -= ...)
    const ux = ex / (ed || 1), uy = ey / (ed || 1), fw = ux * s.fwd[0] + uy * s.fwd[1], rt = ux * s.right[0] + uy * s.right[1], off = Math.atan2(rt, fw);
    const set = new Set();
    if (off > 0.06) set.add('e'); else if (off < -0.06) set.add('q');
    for (const k of n8[Math.abs(off) < 0.4 ? 0 : (((Math.round(off / (Math.PI / 4))) % 8) + 8) % 8]) set.add(k); // (W alone while the camera turns)
    if (Q.run) set.add('shift');
    await want(set);
    await sleep(30);
  }
  await want(new Set());
  await sleep(500);
  if (shots) await shot(path.join(shots, '99-end.png'));
  // ---- the checks (real keys and clicks): each one is a defect the first version had
  const C = (out.checks = {});
  const clickAt = async (sel) => { const b = await ev(`window.__walk.box(${JSON.stringify(sel)})`); for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 }); };
  const tap = async (k, code, vk) => { for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk }); };
  const walkOn = async () => { if (!(await ev('window.__heibel.stage.walking'))) await clickAt('#btn-walk'); for (let i = 0; i < 60 && !(await ev('!!window.__heibel.stage.walker')); i++) await sleep(100); };
  // waits in stage time (the page may run slowly; so does he)
  const waitStage = async (sec, maxMs = 30000) => { const a = await ev('window.__heibel.stage.time'), t1 = Date.now(); while (Date.now() - t1 < maxMs && (await ev('window.__heibel.stage.time')) - a < sec) await sleep(50); };
  const walkOff = async () => { if (await ev('window.__heibel.stage.walking')) await clickAt('#btn-walk'); await sleep(300); };
  try {
    C.stickOnDesktop = (await ev('window.__walk.box("#walk-stick")')).shown; // (hover: hover, a mouse and keys: no stick)
    // a key held when Walk is pressed: he must not walk off by himself; let go and pressed again, he walks. The key is the one whose
    // way is free the farthest where he stands (he may be at the quay edge facing the water, where W would test nothing)
    const fk = await ev('window.__walk.freeKey()'), K1 = fk.key;
    await walkOff(); await key(K1, true); await walkOn();
    const a0 = await ev('window.__walk.state()'); await waitStage(1); const a1 = await ev('window.__walk.state()');
    await key(K1, false); await key(K1, true); await waitStage(1.5); const a2 = await ev('window.__walk.state()'); await key(K1, false);
    C.heldAtStart = { key: K1, freeM: fk.freeM, movedWhileHeldM: +Math.hypot(a1.mx - a0.mx, a1.my - a0.my).toFixed(3), movedAfterNewPressM: +Math.hypot(a2.mx - a1.mx, a2.my - a1.my).toFixed(2) };
    C.heldAtStart.ok = C.heldAtStart.movedWhileHeldM < 0.1 && C.heldAtStart.movedAfterNewPressM > 0.5;
    // W held through Esc: the walk ends and the free camera does not pan by itself
    await key('w', true); await waitStage(0.5); await tap('Escape', 'Escape', 27); await waitStage(0.15);
    const b0 = await ev('window.__walk.cam()'); await waitStage(0.8); const b1 = await ev('window.__walk.cam()'); await key('w', false);
    C.heldAtEnd = { mode: b1.mode, panM: +Math.hypot(b1.gx - b0.gx, b1.gy - b0.gy).toFixed(3) }; C.heldAtEnd.ok = b1.mode === 'free' && C.heldAtEnd.panM < 0.05;
    // walking with W held, Follow pressed: the camera follows the action and stays following
    await walkOn(); await key('w', true); await waitStage(0.4); await clickAt('#btn-follow'); await waitStage(1.2);
    const c1 = await ev('window.__walk.cam()'); await key('w', false);
    C.followWhileHeld = { mode: c1.mode, walking: c1.walking, ok: c1.mode === 'follow' && !c1.walking };
    // walking with Shift held, the wheel zooms and does not turn
    // (measured once the walk has begun and the camera has come to rest behind him: right after Walk it is still on its way there)
    await walkOn();
    await sleep(4000); // (he is put down and the camera turns to stand behind him: that starts a moment after Walk and takes a few seconds)
    for (let i = 0, p = null, still = 0; i < 60 && still < 4; i++) { const q = await ev('window.__walk.cam()'); still = p && q.mode === 'walk' && Math.abs(q.az - p.az) < 0.002 && Math.abs(q.dist / p.dist - 1) < 0.003 ? still + 1 : 0; p = q; await sleep(300); }
    // (Shift pressed here as a keyboard sends it, with its own flag, whatever the steering above left held)
    await key('shift', false); await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 }); await sleep(200);
    const d0 = await ev('window.__walk.cam()'), cv = await ev('window.__walk.box("canvas")');
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cv.x, y: cv.y, deltaX: 0, deltaY: 240, modifiers: 8 }); await waitStage(0.7);
    const d1 = await ev('window.__walk.cam()'); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    C.shiftWheel0 = { mode: d0.mode, walking: d0.walking };
    C.shiftWheel = { turnRad: +Math.abs(d1.az - d0.az).toFixed(4), zoom: +(d1.dist / d0.dist).toFixed(3) }; C.shiftWheel.ok = C.shiftWheel.turnRad < 0.01 && Math.abs(C.shiftWheel.zoom - 1) > 0.01;
    await walkOff();
  } catch (e) { C.error = String(e.message || e); }
  // Walk pressed twenty times more, on and off (real clicks): the renderer's geometry count must come back to where it was
  const click = async () => { const b = await ev('window.__walk.walkBox()'); for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 }); };
  const per = await ev('window.__walk.geoPer()') || (await walkOn(), await ev('window.__walk.geoPer()'));
  if (await ev('window.__heibel.stage.walking')) { await click(); await sleep(400); }
  const g0 = await ev('window.__heibel.stage.renderer.info.memory.geometries');
  for (let k = 0; k < 20; k++) { await click(); await sleep(250); await click(); await sleep(250); }
  await sleep(500);
  // (tiles keep arriving in slices while this runs, so the count is not compared exactly: twenty leaked walkers would be 20 x `per`)
  out.geometries = { before: g0, after: await ev('window.__heibel.stage.renderer.info.memory.geometries'), perWalker: per, walkingAfter: await ev('window.__heibel.stage.walking') };
  // the way out by zooming while he walks (the - key held): the walk must end before the way out begins
  try {
    await walkOn(); await sleep(300); await key('minus', true);
    for (let i = 0; i < 120 && !(await ev('window.__walk.cam().exiting || !window.__heibel.stage.W')); i++) await sleep(100);
    await key('minus', false); await sleep(1500);
    const R2 = await ev('({ w: window.__walk.R.walkAtExit, s: window.__walk.R.stickAtExit })');
    out.checks.exitWhileWalking = { framesWalkingInWayOut: R2.w, framesStickInWayOut: R2.s, ok: R2.w === 0 && R2.s === 0 };
  } catch (e) { out.checks.exitWhileWalking = { error: String(e.message || e), ok: false }; }
  const R = await ev('({ shifts: window.__walk.R.shifts, errs: window.__walk.R.errs, n: window.__walk.R.frames.length })');
  out.shifts = R.shifts; out.errs = R.errs.concat(errs);
  for (let k = 0; k < R.n; k += 5000) out.frames.push(...(await ev('window.__walk.take(5000)')));
} catch (e) {
  out.error = String((e && e.message) || e);
  console.error(out.error);
} finally {
  await close();
}
// ------------------------------------------------------------------ the table
const F = out.frames;
const row = { street, frames: F.length, drops: 1, waitS: 0, fps: 0, distM: 0, timeS: 0, blockedS: 0, focusShifts: out.shifts.length, maxStepM: 0, maxStepAtSwapM: 0, maxHeightErrM: 0, maxUnderM: -Infinity, maxOverM: -Infinity, sink: 0, float: 0, inBuilding: 0, inFurniture: 0, inBarrier: 0, inWater: 0, nearestWalkerM: Infinity, framesWalkerUnder045: 0, drawnVsOwnM: 0, streets: [] };
for (let i = 0; i < F.length; i++) {
  const [t, mx, my, dmx, dmy, , hErr, top, blk, , bits, name, md, jump, speed, wid, waiting] = F[i];
  if (i && wid !== F[i - 1][15]) row.drops++;
  if (waiting && i) row.waitS += (t - F[i - 1][0]) / 1000;
  if (i) { const dt = (t - F[i - 1][0]) / 1000; row.timeS += dt; if (blk && !waiting && speed < 0.5) row.blockedS += dt; if (wid === F[i - 1][15]) row.distM += Math.hypot(mx - F[i - 1][1], my - F[i - 1][2]); if (name !== F[i - 1][11]) row.maxStepAtSwapM = Math.max(row.maxStepAtSwapM, jump); }
  row.maxStepM = Math.max(row.maxStepM, jump);
  row.drawnVsOwnM = Math.max(row.drawnVsOwnM, Math.hypot(dmx - mx, dmy - my));
  row.maxHeightErrM = Math.max(row.maxHeightErrM, Math.abs(hErr));
  row.maxUnderM = Math.max(row.maxUnderM, -hErr); row.maxOverM = Math.max(row.maxOverM, top);
  if (hErr < -0.15) row.sink++;
  if (top > 0.15) row.float++;
  if (bits & 1) row.inBuilding++; if (bits & 2) row.inWater++; if (bits & 4) row.inBarrier++; if (bits & (8 | 16 | 32 | 64)) row.inFurniture++;
  row.nearestWalkerM = Math.min(row.nearestWalkerM, md); if (md < 0.45) row.framesWalkerUnder045++;
  if (!row.streets.length || row.streets[row.streets.length - 1] !== name) row.streets.push(name);
}
row.geometries = out.geometries || null;
row.fps = F.length > 1 ? +((F.length - 1) / ((F[F.length - 1][0] - F[0][0]) / 1000)).toFixed(1) : 0; // (the page's frame rate while recorded: he walks at most 0.12 m a frame)
row.legsGivenUp = out.legs.filter((l) => l.stuck).map((l) => l.to);
for (const k of ['waitS', 'distM', 'timeS', 'blockedS', 'maxStepM', 'maxStepAtSwapM', 'maxHeightErrM', 'maxUnderM', 'maxOverM', 'nearestWalkerM', 'drawnVsOwnM']) row[k] = +row[k].toFixed(3);
row.checks = out.checks || null;
out.row = row;
fs.writeFileSync(outFile, JSON.stringify(out));
// the table: the waypoints of the route (the planned points between them counted towards the one they lead to)
console.log('waypoint                    stage s  result');
{ let acc = 0, bad = []; for (const L of out.legs) { acc += L.t || 0; if (L.stuck) bad.push(L.to + ': ' + L.why); if (!/\.\d+$/.test(L.to)) { console.log(`${String(L.to).padEnd(28)} ${String(+acc.toFixed(1)).padStart(7)}  ${L.stuck ? 'GIVEN UP: ' + L.why : (bad.length ? 'reached, after giving up ' + bad.join(' | ') : 'reached') + (L.what ? ' (' + L.what + ')' : '')}`); acc = 0; bad = []; } } }
console.log(JSON.stringify(row));
if (out.errs.length) console.log('page errors: ' + JSON.stringify(out.errs.slice(0, 5)));
const done = out.legs.length && out.legs[out.legs.length - 1].to === plan.pts[plan.pts.length - 1].name && !out.legs.some((l) => l.stuck);
const CK = out.checks || {};
const checksOk = ['heldAtStart', 'heldAtEnd', 'followWhileHeld', 'shiftWheel', 'exitWhileWalking'].every((k) => CK[k] && CK[k].ok) && CK.stickOnDesktop === false;
const geoOk = !!out.geometries && out.geometries.after - out.geometries.before < 2 * Math.max(1, out.geometries.perWalker) && !out.geometries.walkingAfter;
// never under the ground under his feet (1 cm for rounding), never more than 5 cm over it
const pass = done && checksOk && geoOk && !row.inBuilding && !row.inFurniture && !row.inBarrier && !row.inWater && row.maxUnderM <= 0.01 && row.maxOverM <= 0.05 && row.focusShifts > 0 && row.maxStepAtSwapM <= Math.max(0.2, row.maxStepM); // (no jump at a street switch: no step there larger than his largest ordinary step, which is 0.25 m when he runs on a slow page)
if (!checksOk) console.log('checks: ' + JSON.stringify(CK));
console.log(pass ? 'WALK PASS' : 'WALK FAIL');
process.exit(pass ? 0 : 1);
