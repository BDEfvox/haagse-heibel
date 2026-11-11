// Dev only (never in the built site): the storyboard audit.
// `await __heibel.audit('burglar')` plays one scene on fast-forward, measures every beat (was the subject in the
// picture, in the clear, how big) and lays the beats out as a contact sheet over the page, to be looked at.
// `__heibel.sheet(page)` turns the sheet's pages, `__heibel.sheet(-1)` takes it away.
// It also logs every shot the stage really showed (`shotLog`: time, requested preset values, cut or glide, how long it lasted, whether it
// had to wait for the minimum length, why the stand changed) and returns the director's numbers next to the beats:
//   shots (count) · short (shown for under 0.8 s) · fallbacks (blocked-view decisions after the shot began: re-stand / high / back down)
//   · stands (shots whose first stand was moved, mirrored or sent high) · deferred (shots that waited for the minimum length)
//   · expired (the 20 s safety net fired: must be 0) · offShot (seconds the scene held the camera but the picture was not one of its shots).

export function makeAudit(H) {
  let sheets = [], holder = null;

  function show(page) {
    holder ||= Object.assign(document.createElement('div'), { id: 'audit-sheet' });
    Object.assign(holder.style, { position: 'fixed', inset: '0', zIndex: '9999', background: '#0b0e1a', display: page < 0 ? 'none' : 'block', overflow: 'hidden' });
    if (!holder.parentNode) document.body.appendChild(holder);
    holder.replaceChildren();
    if (page >= 0 && sheets[page]) { const c = sheets[page]; Object.assign(c.style, { width: '100%', height: '100%', objectFit: 'contain' }); holder.appendChild(c); }
    return { page, pages: sheets.length };
  }

  /**
   * opts: locale (which spot of the street), cols (4), rows (3) per sheet page; at = seconds into each beat for its picture (0.7); also = further
   * pictures every `also` seconds within long beats (0 = none); maxT = give up after this many scene seconds.
   */
  async function audit(name, { cols = 4, rows = 3, at = 0.7, also = 0, maxT = 90, w = 480, locale = null } = {}) {
    const st = H.stage;
    if (!st.W) return 'no street open';
    st.running = false;
    let now = performance.now();
    const step = () => st._frame((now += 33.3));
    let guard = 0;
    while (st.mode === 'drop' && guard++ < 600) step();
    if (st.mode !== 'follow') st.follow();
    st.cutEnd = st.time + 1e6;
    if (st.cine) st._cineEnd();
    // `locale`: play it at another spot on the street (stage.locales[n]) than the one the camera opened on
    if (locale != null && st.locales[locale]) { st.camCtx = st.locales[locale]; st.lastSwitch = st.time; st.idleT = 0; for (let i = 0; i < 45; i++) step(); }
    // let whatever the street's own director is playing at this spot finish first, so the scene under test gets the camera
    for (let i = 0; i < 3600 && ([...st.gags].some((q) => q.ctx === st.camCtx && q.name !== st.only) || st.cine); i++) step();
    if (st.cine) st._cineEnd();
    st.audit = true; st.auditOnly = name; st.beatLog = []; st.curBeat = null; st.shotLog = []; st.auditStats = {}; st._shotCur = null; st._shotsSeen = false;
    // the scene gets the camera at the spot it plays at, whatever the director did meanwhile
    const spot = st.camCtx;
    st.lastSwitch = st.time; st.idleT = 0; st.focusReq = null;
    const state = st.debugPlay(name);
    if (!state) { st.audit = false; return 'not available at this spot'; }
    const h = Math.round((w * st.canvas.height) / st.canvas.width), shots = [];
    const grab = (label, t) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(st.canvas, 0, 0, w, h);
      shots.push({ c, label, t });
    };
    let last = null, bt = 0, taken = 0, t = 0, errors = 0;
    const oldErr = console.error;
    console.error = (...a) => { errors++; oldErr(...a); };
    try {
      while (!state.done && t < maxT) {
        if (st.camCtx !== spot) { st.camCtx = spot; st.lastSwitch = st.time; st.idleT = 0; }
        step(); t += 0.0333;
        const b = st.curBeat;
        if (b !== last) {
          if (last && taken === 0) grab(last.label, t); // a beat shorter than `at`: its last frame
          last = b; bt = 0; taken = 0;
        }
        if (!b) continue;
        bt += 0.0333;
        const due = taken === 0 ? at : also ? at + taken * also : Infinity;
        if (bt >= due) { grab(b.label + (taken ? ` (+${(taken * also).toFixed(0)}s)` : ''), t); taken++; }
      }
    } finally { console.error = oldErr; }
    st._beatClose();
    st.audit = false;
    // contact sheets
    sheets = [];
    const per = cols * rows;
    for (let p = 0; p * per < shots.length; p++) {
      const c = document.createElement('canvas');
      c.width = cols * w; c.height = rows * (h + 26);
      const g = c.getContext('2d');
      g.fillStyle = '#0b0e1a'; g.fillRect(0, 0, c.width, c.height);
      shots.slice(p * per, (p + 1) * per).forEach((s, i) => {
        const x = (i % cols) * w, y = Math.floor(i / cols) * (h + 26);
        g.drawImage(s.c, x, y + 26);
        g.fillStyle = '#ffd60a'; g.font = 'bold 15px system-ui, sans-serif'; g.textBaseline = 'middle';
        g.fillText(`${s.t.toFixed(1)}s  ${s.label}`.slice(0, 58), x + 6, y + 13);
        g.strokeStyle = '#0b0e1a'; g.lineWidth = 2; g.strokeRect(x, y + 26, w, h);
      });
      sheets.push(c);
    }
    show(0);
    st._shotClose();
    const sl = st.shotLog || [], ss = st.auditStats || {};
    return { scene: name, seconds: +t.toFixed(1), finished: state.done, scriptErrors: errors, pages: sheets.length, shots: sl.length, short: sl.filter((s) => s.len < 0.8).length,
      fallbacks: ss.fallbacks || 0, expired: ss.expired || 0, nogoal: ss.nogoal || 0, stands: ss.stands || 0, ducks: ss.ducks || 0, deferred: sl.filter((s) => s.deferred > 0).length, offShot: +(ss.offShot || 0).toFixed(1), shotLog: sl, beats: st.beatLog };
  }

  /** Every scene in turn, numbers only (no sheets): which can play here, and how its beats measure up. */
  async function auditAll(names, opts = {}) {
    const out = {};
    for (const n of names) {
      const r = await audit(n, opts);
      out[n] = typeof r === 'string' ? r : { seconds: r.seconds, finished: r.finished, scriptErrors: r.scriptErrors, beats: r.beats.map((b) => `${b.beat} | seen ${b.seen}% size ${b.size}% cam ${b.cam}% ${b.secs}s`) };
    }
    show(-1);
    return out;
  }

  return { audit, auditAll, sheet: show };
}
