// Dev tool: is the camera the viewer's once they have touched it? Each case loads the street fresh, gives ONE camera input, lets
// it settle, then runs two minutes of stage time in which a scene is started at every spot every 8 s, and records the camera's
// values every frame: the point it looks at (in map metres, so a focus shift to another street's frame does not count as a
// move), its compass bearing, its elevation and its distance (the four the rule is about), and also its lens (fov) and the height
// of the point it looks at, for both what is on screen (rig) and where it is heading (goal); and in every stepped frame from the
// page load on, the height of the lens over the ground under it.
// PASS: none of them moves by more than 0.01 m / 0.01 degrees / 0.0001 rad / 0.01 % of the distance (lens 0.01 degrees, aim height
// 0.01 m), the lens is always above the ground, the camera is never in follow mode again and no scene gets a shot (hooks.onCine).
//
// Cases: a  a wheel while the drop from the map is past 80 %       b  a wheel during a close cutscene shot (under 40 m)
//        c  a mouse drag in follow mode                            d  a key (Q, real key events)
//        e  the on-screen turn pad (if this build has one)         f  a "!" pin pressed (after a wheel to be in free)
//        g  Next street pressed while the camera is the viewer's   h  Cmd+E (not camera input) with no keyup for the E, in free
//        i  take over a low (hero) shot, then zoom out to 120 m: same picture size at the take-over, the lens above the ground
//        j  Shift held, = pressed (it says +), Shift let go, = let go: no key stays held
//        k  the pad held with the Space key, then Cmd pressed (no keyup comes on macOS): the pad must stop (if this build has one)
// (a, b and g also check what happens at the input itself: the drop is cut short or lands free, the take-over keeps the view.)
//
// Works on builds from before the camera rule (it only uses stage fields that existed then; the pad case says it is not there).
// Needs the dev server without auto-reload (launch config heibel-audit, http://localhost:5190; another with HEIBEL_URL) and Chrome.
// usage: node scripts/dev-control.mjs [--street "Grote Marktstraat"] [--cases abcdefghijk] [--out control.json] [--draw]
//   --draw renders every stepped frame (slower; the camera does not depend on it)
import fs from 'node:fs';
import { launch, args, sleep, BASE } from './dev-lib.mjs';

const A = args();
const street = A.street || 'Grote Marktstraat';
const cases = String(A.cases || 'abcdefghijk').split('');
const outFile = A.out || 'control.json';
const T = 120; // seconds of stage time after the input
const TOL = { xy: 0.01, brg: 0.01, el: 1e-4, dist: 1e-4, fov: 0.01, ty: 0.01 };
const W = 1280, H = 800;

// ---- the helper put into the page (one per page load): pause the page's loop, step it, record the four values
const HELPER = `(async () => {
  const H = window.__heibel, st = H.stage, G = await import('/src/voxel/gags.js');
  const C = window.__ctl = { now: performance.now(), el: 0, T: ${T}, counting: false, asks: 0, focus: 0, cineOn: 0, starts: 0, errs: 0, gi: 0, nextScene: 0, draw: ${!!A.draw}, minG: Infinity };
  // the lens over the ground right under it (the camera's position as drawn in the last frame)
  C.ground = () => { const p = st.camera.position; return st.W ? p.y - st.W.landY(p.x, p.z) : Infinity; };
  // how tall a fixed world point pair is on screen, in pixels (the picture size test)
  C.size = (P) => { const V = st.camera.position.constructor, a = new V(...P[0]).project(st.camera), b = new V(...P[1]).project(st.camera); return Math.hypot((a.x - b.x) * st.canvas.clientWidth, (a.y - b.y) * st.canvas.clientHeight) / 2; };
  C.pause = () => {
    if (st.running) { st.running = false; cancelAnimationFrame(st._raf); }
    if (!(st.last <= C.now) || C.now - st.last > 100) st.last = C.now; // (a street opened meanwhile set its own clock)
  };
  C.pause();
  if (!C.draw && !st.renderer.__ctl) { st.renderer.__ctl = st.renderer.render; st.renderer.render = () => {}; }
  // count what the scenes ask of the camera after the input (shots, focus nudges) and whether a shot is ever given (onCine)
  if (!st.__ctl) {
    st.__ctl = true;
    const cam0 = st._cam;
    st._cam = function (ctx, name) {
      const o = cam0.call(this, ctx, name);
      for (const k of Object.keys(o)) {
        if (k === 'on' || k === 'card' || k === 'freeze' || k === 'release') continue;
        const f = o[k];
        if (typeof f === 'function') o[k] = (...a) => { if (window.__ctl.counting) window.__ctl.asks++; return f(...a); };
      }
      return o;
    };
    const f0 = st._focus;
    st._focus = function (...a) { if (window.__ctl.counting) window.__ctl.focus++; return f0.apply(this, a); };
  }
  if (st.hooks && !st.hooks.__ctl) { const oc = st.hooks.onCine; st.hooks.__ctl = true; st.hooks.onCine = (on) => { if (on && window.__ctl.counting) window.__ctl.cineOn++; oc?.(on); }; }
  C.vals = (o) => {
    const F = st.W.frame, m = F.M(o.tx, o.tz), ux = -Math.sin(o.az), uz = -Math.cos(o.az);
    return { x: m[0], y: m[1], brg: (((Math.atan2(ux * F.dx + uz * F.dy, ux * F.dy - uz * F.dx) * 180) / Math.PI) + 360) % 360, el: o.el, dist: o.dist, fov: o.fov, ty: o.ty };
  };
  C.snap = () => ({ rig: C.vals(st.rig), goal: C.vals(st.goal), mode: st.mode });
  C.step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      if (!st.W) return false;
      const t0 = st.time;
      try { st._frame((C.now += 33.3)); } catch (e) { C.errs++; }
      if (st.W) C.minG = Math.min(C.minG, C.ground());
      C.el += st.time >= t0 ? st.time - t0 : st.time; // (a focus shift starts the new street's clock at 0)
    }
    return true;
  };
  // a scene at every spot every 8 s of stage time (a spot already playing two is left alone)
  C.scenes = () => {
    if (C.el < C.nextScene) return;
    C.nextScene = C.el + 8;
    const names = st.gagNames;
    for (const ctx of st.locales || []) {
      if (ctx._gags && ctx._gags.size >= 2) continue;
      for (let k = 0; k < names.length; k++) {
        const n = names[C.gi++ % names.length];
        try { if (G.canPlay(ctx, n) && G.playGag(ctx, n)) { C.starts++; break; } } catch (e) { C.errs++; }
      }
    }
  };
  // a scene at the spot the camera follows (to get it a shot)
  C.here = () => { const names = st.gagNames; for (let k = 0; k < names.length; k++) { const n = names[C.gi++ % names.length]; try { if (st.debugPlay(n)) return n; } catch (e) { C.errs++; } } return null; };
  C.begin = () => {
    C.A = C.snap(); C.el = 0; C.nextScene = 0; C.modes = {}; C.high = false; C.counting = true;
    C.asks = C.focus = C.cineOn = C.starts = 0;
    C.dev = { rig: { xy: 0, brg: 0, el: 0, dist: 0, fov: 0, ty: 0 }, goal: { xy: 0, brg: 0, el: 0, dist: 0, fov: 0, ty: 0 } };
    return C.A;
  };
  C.batch = (n) => {
    C.pause();
    for (let i = 0; i < n && C.el < C.T; i++) {
      C.scenes();
      if (!C.step(1)) return { el: C.el, wait: true };
      const s = C.snap();
      C.modes[s.mode] = (C.modes[s.mode] || 0) + 1;
      if (st.rig.dist > 1500) C.high = true;
      for (const k of ['rig', 'goal']) {
        const a = C.A[k], b = s[k], d = C.dev[k];
        let db = Math.abs(b.brg - a.brg) % 360; if (db > 180) db = 360 - db;
        d.xy = Math.max(d.xy, Math.hypot(b.x - a.x, b.y - a.y)); d.brg = Math.max(d.brg, db);
        d.el = Math.max(d.el, Math.abs(b.el - a.el)); d.dist = Math.max(d.dist, Math.abs(b.dist / a.dist - 1));
        d.fov = Math.max(d.fov, Math.abs((b.fov || 0) - (a.fov || 0))); d.ty = Math.max(d.ty, Math.abs(b.ty - a.ty));
      }
    }
    return { el: C.el, done: C.el >= C.T };
  };
  C.result = () => ({ A: C.A, end: C.snap(), dev: C.dev, modes: C.modes, asks: C.asks, focus: C.focus, cineOn: C.cineOn, starts: C.starts, errs: C.errs, high: C.high, el: C.el, minG: C.minG });
  return st.mode;
})()`;

const B = await launch({ width: W, height: H, tag: 'control' });
const { ev, send } = B;
const results = [];
const url = () => `${BASE}/?q=${encodeURIComponent(street)}&t=14:00&seed=ctl`;
const mouse = (type, x, y, o = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...o });
const key = (type, k, code, vk, modifiers = 0) => send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(type === 'keyDown' && k.length === 1 && !modifiers ? { text: k } : {}) });
const wheel = (dy) => ev(`window.__heibel.stage.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: ${dy}, bubbles: true, cancelable: true, clientX: ${W / 2}, clientY: ${H / 2} })), true`);
const step = (n) => ev(`window.__ctl.pause(), window.__ctl.step(${n})`);
const state = () => ev(`(() => { const st = window.__heibel.stage; return { mode: st.mode, cine: !!st.cine, dist: st.rig.dist, drop: st.drop ? st.drop.t / st.drop.dur : null, hold: !!st.hold, W: !!st.W }; })()`);
const snap = () => ev('window.__ctl.snap()');
/** Step (with real-time breathers, so the page's timers and async work run) until `cond` (an expression on st) holds, or `max` stage seconds. */
async function until(cond, max = 120, chunk = 30) {
  for (let t = 0; t < max * 30; t += chunk) {
    if (await ev(`(() => { const st = window.__heibel.stage; return !!(${cond}); })()`)) return true;
    await step(chunk);
    await sleep(15);
  }
  return false;
}

/** Load the street fresh. `drop`: return as soon as the drop has begun (paused there), else once the camera follows. */
async function load(drop = false) {
  await send('Page.navigate', { url: url() });
  for (let i = 0; i < 3600; i++) {
    await sleep(drop ? 50 : 500);
    let m = null;
    try { m = await ev('typeof window.__heibel === "object" && !!window.__heibel.stage.W && window.__heibel.stage.mode'); } catch (e) { /* loading */ }
    if (drop && m === 'drop') { await ev(HELPER); return true; }
    if (!drop && m === 'follow') { await sleep(1500); await ev(HELPER); return true; }
    if (drop && m && m !== 'drop' && m !== 'idle') return false; // (missed the drop)
  }
  return false;
}
/** Two minutes of stage time from now (the four values are recorded at the start). */
async function measure() {
  await ev('window.__ctl.begin()');
  for (let guard = 0; guard < 2000; guard++) {
    const r = await ev('window.__ctl.batch(150)');
    if (r.done) break;
    await sleep(r.wait ? 500 : 5);
  }
  return ev('window.__ctl.result()');
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function run(id) {
  const R = { id, input: '', ok: true, notes: [] };
  const fail = (why) => { R.ok = false; R.notes.push(why); };
  if (id === 'a') {
    R.input = 'wheel in the drop (past 80 %)';
    if (!(await load(true))) return { ...R, skip: 'missed the drop' };
    if (!(await until('st.mode !== "drop" || (!st.hold && st.drop && st.drop.t / st.drop.dur > 0.8)', 30, 2))) return { ...R, skip: 'drop did not advance' };
    if ((await state()).mode !== 'drop') return { ...R, skip: 'drop ended before 80 %' };
    await wheel(-120);
    R.modeAfterInput = (await state()).mode;
    if (R.modeAfterInput === 'drop') R.notes.push('the input was ignored by the drop');
    await until('st.mode !== "drop"', 20); // (an untouched drop still has to land)
    await step(60);
  } else if (id === 'b') {
    R.input = 'wheel in a close shot';
    if (!(await load())) return { ...R, skip: 'street did not open' };
    let got = false;
    for (let k = 0; k < 24 && !got; k++) {
      await ev('window.__ctl.here()');
      got = await until('st.mode === "follow" && st.cine && st.cine.spec && st.rig.dist < 40', 8);
    }
    if (!got) return { ...R, skip: 'no close shot within 3 minutes' };
    const pre = await ev(`(() => { const st = window.__heibel.stage; return { rig: window.__ctl.vals(st.rig), aK: Math.sqrt(st.aspK || 1) }; })()`);
    // the picture's size at the aim point is distance x tan(half the lens): taking over may trade one for the other, nothing else
    const half = Math.tan((pre.rig.fov * Math.PI) / 360) * pre.aK, Df = (pre.rig.dist * pre.aK * half) / Math.tan((15 * Math.PI) / 180);
    await wheel(-120);
    // what one notch should do: zoom in by e^-0.144 from where the camera is (its narrow-screen widening folded in), within the
    // 20-3,100 m range but never pushed further than it already was
    const D = Df, g = (await snap()).goal, want = Math.min(Math.max(D * Math.exp(-0.144), Math.min(20, D)), Math.max(3100, D));
    R.takeOver = { before: pre.rig, after: g, wantDist: want };
    if (!(near(g.x, pre.rig.x, 0.01) && near(g.y, pre.rig.y, 0.01) && near(g.el, pre.rig.el, 1e-4) && Math.abs(g.dist / want - 1) < 1e-3)) fail(`take-over moved the camera (dist ${pre.rig.dist.toFixed(1)} -> ${g.dist.toFixed(1)} m, want ${want.toFixed(1)}; el ${pre.rig.el.toFixed(2)} -> ${g.el.toFixed(2)})`);
    await step(60);
  } else if (id === 'c') {
    R.input = 'mouse drag in follow';
    if (!(await load())) return { ...R, skip: 'street did not open' };
    await mouse('mousePressed', W / 2, H / 2 + 60);
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', W / 2 + i * 10, H / 2 + 60);
    await mouse('mouseReleased', W / 2 + 80, H / 2 + 60);
    await step(60);
  } else if (id === 'd') {
    R.input = 'Q held for 10 frames';
    if (!(await load())) return { ...R, skip: 'street did not open' };
    await ev('window.__heibel.stage.running = true'); // (the key handler listens only while the stage runs; no loop is started)
    await key('keyDown', 'q', 'KeyQ', 81);
    await ev('window.__ctl.step(10)');
    await key('keyUp', 'q', 'KeyQ', 81);
    await ev('window.__heibel.stage.running = false');
    await step(60);
  } else if (id === 'e') {
    R.input = 'turn pad held for 10 frames';
    if (!(await load())) return { ...R, skip: 'street did not open' };
    const has = await ev('!!document.querySelector("#cam-pad [data-az]")');
    if (!has) return { ...R, skip: 'not available in this build (no #cam-pad)' };
    await until('!st.cine', 60); // (the pad steps aside during a cutscene)
    const r = await ev('(() => { const b = document.querySelector("#cam-pad [data-az]").getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()');
    await mouse('mousePressed', r[0], r[1]);
    await ev('window.__ctl.step(10)');
    await mouse('mouseReleased', r[0], r[1]);
    await step(60);
  } else if (id === 'f') {
    R.input = 'a "!" pin pressed';
    if (!(await load())) return { ...R, skip: 'street did not open' };
    await wheel(240); // (into free, a little further out so other spots' pins are in the picture)
    await step(60);
    await ev('window.__ctl.nextScene = 0; window.__ctl.el = 0');
    let pin = null;
    for (let t = 0; t < 120 && !pin; t++) {
      await ev('window.__ctl.scenes(), window.__ctl.step(30)');
      pin = await ev(`(() => { const st = window.__heibel.stage; const p = st.pins.find((q) => q.ctx && !q.el.hidden && !q.el.disabled && !q.el.classList.contains('faint')); if (!p) return null; const b = p.el.getBoundingClientRect(), c = st.W.frame.M(...st.W.path.xz(p.ctx.sc, 0)); return { x: b.x + b.width / 2, y: b.y + b.height / 2, spot: c }; })()`);
      await sleep(5);
    }
    if (!pin) return { ...R, skip: 'no pin came up' };
    const pre = (await snap()).goal;
    await mouse('mousePressed', pin.x, pin.y);
    await mouse('mouseReleased', pin.x, pin.y);
    await step(90);
    const s = await snap();
    R.pin = { flewTo: Math.hypot(s.goal.x - pin.spot[0], s.goal.y - pin.spot[1]), moved: Math.hypot(s.goal.x - pre.x, s.goal.y - pre.y), bearingKept: Math.abs(((s.goal.brg - pre.brg + 540) % 360) - 180) < 0.01, tiltKept: near(s.goal.el, pre.el, 1e-4), mode: s.mode };
    if (R.pin.moved < 1) fail('the pin did not fly');
  } else if (id === 'g') {
    R.input = 'Next street, camera free';
    if (!(await load())) return { ...R, skip: 'street did not open' };
    await wheel(-120);
    await step(60);
    await ev('window.__heibel.stage.__oldW = window.__heibel.stage.W, document.querySelector("#btn-next").click(), true');
    let up = false;
    for (let i = 0; i < 240 && !up; i++) { await sleep(500); up = await ev('(() => { const st = window.__heibel.stage; return !!st.W && st.W !== st.__oldW && st.mode !== "idle"; })()'); }
    if (!up) return { ...R, skip: 'the next street did not open' };
    await ev('window.__ctl.pause()');
    if (!(await until('st.mode !== "drop"', 30, 15))) return { ...R, skip: 'the drop did not land' };
    R.landed = (await state()).mode;
    if (R.landed === 'follow') fail('the next street landed following');
    await step(60);
  } else if (id === 'h') {
    R.input = 'Cmd+E without keyup, camera free';
    if (!(await load())) return { ...R, skip: 'street did not open' };
    await wheel(-120);
    await step(60);
    await ev('window.__heibel.stage.running = true');
    await key('rawKeyDown', 'Meta', 'MetaLeft', 91, 4);
    await key('keyDown', 'e', 'KeyE', 69, 4);
    await key('keyUp', 'Meta', 'MetaLeft', 91, 0); // (macOS: no keyup for the E while Cmd was down)
    await ev('window.__heibel.stage.running = false');
  }
  else if (id === 'i') {
    R.input = 'take a low shot, zoom out to 120 m';
    if (!(await load())) return { ...R, skip: 'street did not open' };
    let got = false;
    for (let k = 0; k < 30 && !got; k++) {
      await ev('window.__ctl.here()');
      got = await until('st.mode === "follow" && st.cine && st.cine.spec && st.cine.spec.el < 0 && st.rig.el < 0.05 && st.rig.dist < 20', 8);
    }
    if (!got) return { ...R, skip: 'no low shot within 4 minutes' };
    // a fixed pair of world points: the aim point and 1 m above it, measured on screen before the take-over, in the take-over
    // frame and once settled
    const P = await ev('(() => { const r = window.__heibel.stage.rig; return [[r.tx, r.ty, r.tz], [r.tx, r.ty + 1, r.tz]]; })()');
    const s0 = await ev(`window.__ctl.size(${JSON.stringify(P)})`);
    await wheel(0); // (a wheel event that zooms by nothing: the take-over alone)
    await ev('window.__ctl.step(1)');
    const s1 = await ev(`window.__ctl.size(${JSON.stringify(P)})`);
    await step(30);
    const s2 = await ev(`window.__ctl.size(${JSON.stringify(P)})`);
    R.picture = { before: +s0.toFixed(1), takeOverFrame: +s1.toFixed(1), settled: +s2.toFixed(1) };
    if (Math.abs(s1 / s0 - 1) > 0.03 || Math.abs(s2 / s0 - 1) > 0.03) fail(`the picture changed size at the take-over (${s0.toFixed(0)} -> ${s1.toFixed(0)} -> ${s2.toFixed(0)} px)`);
    await ev('window.__ctl.minG = Infinity');
    for (let n = 0; n < 60 && (await ev('window.__heibel.stage.goal.dist')) < 120; n++) { await wheel(120); await step(3); }
    await step(60);
    R.zoomedTo = +(await ev('window.__heibel.stage.rig.dist')).toFixed(1);
  } else if (id === 'j') {
    R.input = 'Shift, = (+), Shift up, = up';
    if (!(await load())) return { ...R, skip: 'street did not open' };
    await ev('window.__heibel.stage.running = true');
    await key('rawKeyDown', 'Shift', 'ShiftLeft', 16, 8);
    await key('keyDown', '+', 'Equal', 187, 8);
    await ev('window.__ctl.step(10)');
    await key('keyUp', 'Shift', 'ShiftLeft', 16, 0);
    await key('keyUp', '=', 'Equal', 187, 0);
    await ev('window.__heibel.stage.running = false');
    R.keysHeld = await ev('window.__heibel.stage.keys.size');
    if (R.keysHeld) fail(`${R.keysHeld} key(s) still held after letting go`);
    await step(60);
  } else if (id === 'k') {
    R.input = 'pad held by Space, then Cmd';
    if (!(await load())) return { ...R, skip: 'street did not open' };
    if (!(await ev('!!document.querySelector("#cam-pad [data-az]")'))) return { ...R, skip: 'not available in this build (no #cam-pad)' };
    await until('!st.cine', 60);
    await ev('window.__heibel.stage.running = true, document.querySelector("#cam-pad [data-az]").focus(), true');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
    await ev('window.__ctl.step(10)');
    await key('rawKeyDown', 'Meta', 'MetaLeft', 91, 4); // (and no keyup for the Space: macOS)
    await ev('window.__heibel.stage.running = false');
    R.padAfterCmd = await ev('(() => { const p = window.__heibel.stage.pad; return p ? p.az || p.el : null; })()');
    if (R.padAfterCmd) fail('the pad still turns after Cmd');
    await step(30);
  }
  const m = await measure();
  Object.assign(R, { modeAtStart: m.A.mode, modes: m.modes, starts: m.starts, asks: m.asks, focus: m.focus, cineOn: m.cineOn, errs: m.errs, dev: m.dev, A: m.A, end: m.end, stageSecs: +m.el.toFixed(1) });
  for (const k of ['rig', 'goal']) {
    const d = m.dev[k];
    if (d.xy > TOL.xy || d.brg > TOL.brg || d.el > TOL.el || d.dist > TOL.dist || d.fov > TOL.fov || d.ty > TOL.ty) fail(`${k} moved: ${d.xy.toFixed(3)} m, ${d.brg.toFixed(3)} deg, el ${d.el.toFixed(4)}, dist ${(d.dist * 100).toFixed(2)} %, lens ${d.fov.toFixed(3)} deg, aim height ${d.ty.toFixed(3)} m`);
  }
  R.minGround = +m.minG.toFixed(3);
  if (!(m.minG > 0)) fail(`the lens went ${(-m.minG).toFixed(2)} m under the ground`);
  if (m.modes.follow) fail(`followed again for ${(m.modes.follow / 30).toFixed(1)} s`);
  if (m.cineOn) fail(`${m.cineOn} shots taken`);
  if (m.high) R.notes.push('above 1,500 m: the straight-down look changes the shown elevation');
  if (!m.starts) R.notes.push('no scene could be started');
  return R;
}

try {
  console.log(`# dev-control ${street} at ${BASE}, ${T} s of stage time per case`);
  for (const id of cases) {
    let r;
    try { r = await run(id); } catch (e) { r = { id, ok: false, notes: ['THROW ' + e.message.slice(0, 300)] }; }
    if (B.errs.length) { r.consoleErrors = [...new Set(B.errs)].slice(0, 5); B.errs.length = 0; }
    results.push(r);
    const d = r.dev ? r.dev.rig : null, g = r.dev ? r.dev.goal : null;
    const f = (v, n) => (v === undefined ? '-' : v.toFixed(n));
    console.log([
      r.id, (r.input || '').padEnd(34), r.skip ? 'SKIP' : r.ok ? 'PASS' : 'FAIL',
      d ? `target ${f(Math.max(d.xy, g.xy), 3)} m  bearing ${f(Math.max(d.brg, g.brg), 3)} deg  el ${f(Math.max(d.el, g.el), 4)}  dist ${f(Math.max(d.dist, g.dist) * 100, 2)} %  lens ${f(Math.max(d.fov, g.fov), 3)} deg  aim-h ${f(Math.max(d.ty, g.ty), 3)} m  lowest lens ${f(r.minGround, 2)} m` : '',
      r.modes ? `modes ${JSON.stringify(r.modes)} scenes ${r.starts} shot-asks ${r.asks} focus-asks ${r.focus} shots ${r.cineOn}${r.errs ? ' frame-errors ' + r.errs : ''}` : '',
      r.skip || '', (r.notes || []).join('; '),
    ].filter(Boolean).join(' | '));
  }
  fs.writeFileSync(outFile, JSON.stringify({ street, base: BASE, T, tolerances: TOL, results }, null, 1));
  console.log(`# ${results.filter((r) => r.ok && !r.skip).length} PASS, ${results.filter((r) => !r.ok).length} FAIL, ${results.filter((r) => r.skip).length} SKIP -> ${outFile}`);
} finally {
  await B.close();
}
