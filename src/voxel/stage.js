// The stage: renderer, lights, the camera (sky drop → follow the action → free roam) and the
// contexts handed to gag scripts. Gag scripts think in "street space" (x along the street, z across it);
// every object they place is bent onto the real street here.
import * as THREE from 'three';
import { makeRng, hashStr, Runner, ease, clamp, lerp, Vox, sculpt, clearSigns, MAT, wait } from './kit.js';
import { buildWorld, preload, U, cutWeight, cutLimit, CUT, setMaxTexture, trimTiles, tileOf, LAMP_KIND } from './world.js';
import { localeL, ambientL } from './street.js';
import { Fx } from './fx.js';
import { startAmbient, startLocale, mixFor, playGag, GAG_NAMES } from './gags.js';
import { makeBird, makePerson, PERSON_K, SKINS, SHIRTS, PANTS, HAIRS } from './cast.js';
import { litShare } from './props.js';
import { Crowd, PED } from './crowd.js';
import { spotAt } from './districts.js';
import { sfx } from '../audio.js';

// Light follows the real clock in The Hague: the same sun (or moon) for the whole city, whatever street is open. The owner can
// also force day or night (`setSky`). Keyframes by the sun's height above the horizon, in degrees; colours are blended between them.
// Night is a look of its own: little light from the sky (a cool moon fill so nothing is pure black), so that lamp pools,
// windows and signs carry the picture.
const SKY = [
  { alt: -30, top: '#03050f', bot: '#131a3c', sun: '#8ea6ff', sunI: 0.7, hs: '#4259aa', hg: '#1f2644', hI: 0.88, fog: '#0a0f26' },
  { alt: -16, top: '#050818', bot: '#1b2352', sun: '#8ea6ff', sunI: 0.72, hs: '#4259aa', hg: '#1f2644', hI: 0.9, fog: '#0d1330' },
  { alt: -9, top: '#131947', bot: '#4b3b7c', sun: '#93a3ff', sunI: 0.8, hs: '#4d5eb0', hg: '#2a2443', hI: 0.9, fog: '#2a2358' },
  { alt: -4, top: '#3d2a7a', bot: '#ff8a66', sun: '#ffa573', sunI: 1.5, hs: '#b79cf0', hg: '#6e5378', hI: 1.3, fog: '#b0688a' },
  { alt: 3, top: '#ffab66', bot: '#ffecc9', sun: '#ffe6c2', sunI: 2.2, hs: '#fff1df', hg: '#bfa27e', hI: 1.45, fog: '#ffecc9' },
  { alt: 12, top: '#5bb8ff', bot: '#eaf7ff', sun: '#fff1cc', sunI: 2.2, hs: '#e6f5ff', hg: '#c0c090', hI: 1.45, fog: '#eaf7ff' },
  { alt: 35, top: '#6ec3ff', bot: '#d9f2ff', sun: '#fff6e0', sunI: 2.15, hs: '#e6f5ff', hg: '#b7c690', hI: 1.5, fog: '#d9f2ff' },
].map((k) => { const o = { ...k }; for (const c of ['top', 'bot', 'sun', 'hs', 'hg', 'fog']) o[c] = new THREE.Color(k[c]); return o; });
/** Where the sun stands over The Hague at a moment in time: height and compass direction, in radians. */
function sunAt(date, lat = 52.08, lon = 4.31) {
  const R = Math.PI / 180, d = date.getTime() / 86400000 - 10957.5; // days since 1 January 2000, noon UTC
  const g = (357.529 + 0.98560028 * d) * R, L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * R, e = (23.439 - 0.00000036 * d) * R;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ha = (((18.697374558 + 24.06570982441908 * d) % 24) * 15 + lon) * R - ra;
  return {
    alt: Math.asin(Math.sin(lat * R) * Math.sin(dec) + Math.cos(lat * R) * Math.cos(dec) * Math.cos(ha)),
    az: Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat * R) - Math.sin(lat * R) * Math.cos(ha)), // from north, clockwise
  };
}
const smoothS = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hourFmt = (() => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }); } catch (e) { return null; } })();
/** The hour in The Hague (0-24) at a moment in time. */
function hourIn(date) {
  if (hourFmt) { const m = /(\d+):(\d+)/.exec(hourFmt.format(date)); if (m) return +m[1] + +m[2] / 60; }
  return (date.getUTCHours() + 1 + date.getUTCMinutes() / 60) % 24;
}
/** The look of the sky and the light at one moment: colours, light, how dark it is, what is up in the sky, who is awake. */
class Look {
  constructor() {
    for (const c of ['top', 'bot', 'sun', 'hs', 'hg', 'fog']) this[c] = new THREE.Color();
    this.sunI = 1; this.hI = 1; this.lightAz = 0; this.lightAlt = 1; this.nk = 0; this.stars = 0; this.moon = 0; this.hour = 12; this.deg = 30;
    this.night = false; // what the tiles are baked for (the lit windows of the detailed fronts and the like)
  }
  copy(o) {
    for (const c of ['top', 'bot', 'sun', 'hs', 'hg', 'fog']) this[c].copy(o[c]);
    this.sunI = o.sunI; this.hI = o.hI; this.lightAz = o.lightAz; this.lightAlt = o.lightAlt; this.nk = o.nk; this.stars = o.stars; this.moon = o.moon; this.hour = o.hour; this.deg = o.deg; this.night = o.night;
    return this;
  }
  mix(a, b, t) {
    for (const c of ['top', 'bot', 'sun', 'hs', 'hg', 'fog']) this[c].lerpColors(a[c], b[c], t);
    for (const k of ['sunI', 'hI', 'lightAlt', 'nk', 'stars', 'moon', 'hour', 'deg']) this[k] = lerp(a[k], b[k], t);
    this.lightAz = a.lightAz + angDiff(a.lightAz, b.lightAz) * t;
    return this;
  }
  /** From the sun's height (degrees) and compass direction (radians). */
  sun_(deg, az) {
    let k = 0;
    while (k < SKY.length - 2 && deg > SKY[k + 1].alt) k++;
    const a = SKY[k], b = SKY[k + 1], t = clamp((deg - a.alt) / (b.alt - a.alt));
    for (const c of ['top', 'bot', 'sun', 'hs', 'hg', 'fog']) this[c].lerpColors(a[c], b[c], t);
    this.sunI = lerp(a.sunI, b.sunI, t); this.hI = lerp(a.hI, b.hI, t);
    this.deg = deg; this.night = deg < -1.5;
    this.nk = 1 - smoothS(-4, 3, deg); // how dark: windows light up and lamp pools fade in over the half hour round sunset
    this.stars = smoothS(-5, -11, deg); this.moon = smoothS(-6, -12, deg);
    // the light comes from the sun by day (never so low that shadows run the length of the street) and from a high moon at night
    this.lightAz = deg > 1 ? az : az + Math.PI;
    this.lightAlt = deg > 1 ? Math.max((deg * Math.PI) / 180, 0.3) : 0.8;
    return this;
  }
}
/** The look at a moment in time (the real clock, or `&t=` on the dev server). */
export function skyAt(date) {
  const sun = sunAt(date), L = new Look().sun_((sun.alt * 180) / Math.PI, sun.az);
  L.hour = hourIn(date);
  return L;
}
/** The look of a forced day (a clear early-afternoon sun) or night (full night, an evening's worth of lit windows). */
const forcedLook = (mode) => { const L = new Look().sun_(mode === 'night' ? -30 : 38, mode === 'night' ? 2.4 : 3.5); L.hour = mode === 'night' ? 22.3 : 14; return L; };
/** The lit share of windows by the hour: homes, offices, shops. */
const WIN = {
  home: [[0, 0.3], [1.5, 0.12], [5, 0.1], [6.5, 0.5], [8, 0.35], [12, 0.2], [16, 0.45], [18, 0.7], [22, 0.62], [23.5, 0.42], [24, 0.3]],
  office: [[0, 0.04], [5, 0.04], [6.5, 0.22], [8, 0.12], [17, 0.2], [19, 0.14], [22, 0.08], [24, 0.04]],
  shop: [[0, 0.12], [1, 0.04], [6, 0.04], [9, 0.25], [17, 0.6], [21.5, 0.82], [23, 0.3], [24, 0.12]],
};
const tab = (t, h) => { let i = 1; while (i < t.length - 1 && h > t[i][0]) i++; const a = t[i - 1], b = t[i]; return lerp(a[1], b[1], clamp((h - a[0]) / (b[0] - a[0]))); };
const AZ0 = 0.4, EL0 = 0.7, FOV = 30, TAN = Math.tan((FOV / 2) * (Math.PI / 180));
/** Half the vertical field of view, as a tangent: lets the page match a map zoom to a camera height. */
export const VIEW_TAN = TAN;
// straight down (as near as the camera maths allows), and the height at which zooming out hands over to the map
const TOP = 1.5608, EXIT = 2900;
/** Camera height at which zooming out hands over to the map (and zooming in on the map hands back). */
export const EXIT_DIST = EXIT;
const DMIN = 20, DMAX = 3100;
const sm = (x) => x * x * (3 - 2 * x);
const angDiff = (a, b) => { const d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };
const _col = new THREE.Color(), _W = new THREE.Matrix4(), _T = new THREE.Matrix4(), _f = {}, _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
/** The director's camera rules (see _cam and the follow branch of _frame). Seconds unless noted. */
const MIN_SHOT = 0.9;      // a new shot waits until the last cut is this old (unless `quick`, or it glides)
const SAFETY = 20;         // a scene that asks for nothing new for this long loses the camera (once, with a warning)
const BLOCKED_FOR = 0.7;   // the sight line must stay blocked this long before the stand is reconsidered (once)
const RECLEAR_FOR = 1.0;   // ...and clear this long before the high fallback is left again
const RECONSIDER = 2;      // after any such decision: no new one for this long
const RESTAND_GLIDE = 0.5; // the move to the new stand takes about this long
const SAME_AZ = 0.52, SAME_DIST = 0.3; // 'nearly the same shot': within 30 degrees and 30% of the distance


/** Free the GPU buffers of an object that has left the scene for good. */
const SHARED = new Set([MAT.solid, MAT.glow, MAT.water, CUT.solid, CUT.glow, CUT.depth]);
function disposeTree(o) {
  o.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material && !SHARED.has(c.material)) c.material.dispose(); // per-object materials (signs, beams, clouds); shared ones stay
  });
}
const CALM = matchMedia('(prefers-reduced-motion: reduce)').matches;
/**
 * How much more of the street a cutscene shot takes in on a screen narrower than the wide picture it was framed for
 * (1 = as framed). Deliberately less than the full difference: on a phone held upright people stay a decent size, and
 * the beat guarantee (_fitBeat) backs the camera off further only when somebody would actually be cut off.
 */
const aspNeed = (asp) => clamp(Math.pow(1.55 / asp, 0.6), 1, 2.4);
/** Street furniture as the camera sees it: [height, radius] in metres (see _clear). */
const FURN = { bench: [1.0, 0.9], bin: [0.95, 0.4], box: [1.5, 0.7], mailbox: [1.35, 0.4], parasol: [2.5, 1.2], rack: [1.25, 1.7], sign: [0, 0], stall: [2.6, 1.6], stop: [2.6, 1.8], terrace: [2.6, 1.6],
  mstall: [2.6, 1.8], kiosk: [3.2, 2.6], picnic: [0.8, 1.5], orac: [1.1, 0.5], column: [3.1, 0.65], mupi: [2.2, 0.7], meter: [1.6, 0.35],
  charger: [1.3, 0.55], trolleys: [1.9, 1.6], rackpark: [1.3, 2.4], mast: [6.0, 0.2], tlight: [3.2, 0.2], lamp: [5.0, 0.25] };
/** Furniture the camera must never stand under or inside (parasols, market stalls, kiosks): see _clear. */
const TALL = new Set(['terrace', 'mstall', 'kiosk', 'parasol']);

/** Make an object live in a context's street space: its position is (x along, y up, z across) from that spot. */
function warp(obj, ctx, path, hAt) {
  obj._ctx = ctx;
  obj.updateMatrix = function () {
    const p = this.position;
    let ax = p.x, az = p.z;
    if (ax === 0 && az === 0 && p.y === 0 && !this._anch) {
      // geometry baked at street coordinates (alarm lamps, scorch marks, graffiti): anchor on its bounding box
      const geo = this.geometry || (this.children[0] && this.children[0].geometry);
      if (geo) { if (!geo.boundingBox) geo.computeBoundingBox(); const bb = geo.boundingBox; this._anch = [(bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2]; }
    }
    if (this._anch) { ax += this._anch[0]; az += this._anch[1]; }
    path.at(this._ctx.sc + ax, _f);
    this.matrix.compose(p, this.quaternion, this.scale);
    _W.makeRotationY(Math.atan2(-_f.tz, _f.tx));
    const X = _f.x - _f.tz * az, Z = _f.z + _f.tx * az;
    let Y = hAt(X, Z);
    const V = this._veh;
    if (V && V.len) {
      // a long vehicle sits on the highest ground under its axles and sides, so a kerb step or a slope never buries a wheel
      const h = this.rotation.y, sh = Math.sin(h), ch = Math.cos(h), fx = _f.tx * sh - _f.tz * ch, fz = _f.tz * sh + _f.tx * ch, a = V.len * 0.36, w = (V.wid || 1.8) * 0.42;
      for (const k of [-1, 1]) for (const q of [-1, 1]) Y = Math.max(Y, hAt(X + fx * a * k - fz * w * q, Z + fz * a * k + fx * w * q));
    }
    _W.setPosition(X, Y, Z); // it stands (or floats) on whatever is there
    _W.multiply(_T.makeTranslation(-ax, 0, -az));
    this.matrix.premultiply(_W);
    this.matrixWorldNeedsUpdate = true;
  };
}

export class Stage {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.overlay = root.querySelector('.stage-fx');
    this.flashEl = root.querySelector('.stage-flash');
    this.lite = matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 560;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    const pr0 = Math.min(window.devicePixelRatio || 1, this.lite ? 1.5 : 2);
    this.renderer.setPixelRatio(pr0);
    // a steady frame rate matters more than the last bit of sharpness: when most frames run late the picture is drawn
    // with fewer pixels (never fewer than the screen's own), and the sharper picture is tried again after a calm spell
    this._gov = { steps: [1, 0.8, 0.65, 0.5].map((k) => Math.max(Math.min(pr0, 1), pr0 * k)).filter((v, i, l) => !i || v < l[i - 1] - 0.01), level: 0, n: 0, slow: 0, t: 0, calm: 0, wait: 20000, fresh: 0, last: 0, tried: 0, until: 0 };
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    setMaxTexture(this.renderer.capabilities.maxTextureSize);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#d9f2ff', 300, 3000);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 9000);
    this.sun = new THREE.DirectionalLight('#fff', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.hemi = new THREE.HemisphereLight('#fff', '#888', 1);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.lampLights = [];
    for (let i = 0; i < 5; i++) { const pl = new THREE.PointLight('#ffd27a', 0, 15, 1.7); pl.userData.base = 0; this.lampLights.push(pl); this.scene.add(pl); }
    // the sky: follows the clock unless the owner forces day or night (`setSky`); `cur` is the look on screen right now, `tr` a change in progress
    this.skyMode = 'clock'; this.clockOpt = null;
    this.cur = new Look(); this.sky = this.cur; this.tr = null; this._clockT = 0; this._dip = 0;
    this.sunDir = new THREE.Vector3(0, 1, 0); this._cssLast = {}; this._winHour = -1;
    this.W = null;
    this.running = false;
    this.mode = 'idle';
    this._tok = 0;
    this.rig = { az: AZ0, el: EL0, dist: 80, tx: 0, ty: 1.5, tz: 0, fov: FOV, roll: 0 };
    this.goal = { ...this.rig };
    this.pins = [];
    this.keys = new Set();
    this._bindInput();
    new ResizeObserver(() => this._resize()).observe(root);
    // one bad frame must not kill the page: log it, and bow out cleanly if it keeps happening
    this._errs = 0;
    this._tick = (now) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(this._tick);
      this._govern(now);
      try {
        this._frame(now);
        this._errs = 0;
      } catch (e) {
        if (!this._errs++) console.error('frame error', e);
        if (this._errs > 20) { this.running = false; this.hooks?.onContextLost?.(); }
      }
    };
  }

  // ------------------------------------------------------------ input
  _take() {
    if (!this.W || this.mode === 'drop' || this.mode === 'leave' || this.exiting) return false;
    if (this.mode === 'follow') this._setMode('free');
    return true;
  }
  _pan(dx, dy) {
    // by the elevation that is on screen (high up the camera tilts towards straight down by itself), so the ground follows the pointer
    const g = this.goal, mpp = (2 * g.dist * TAN) / (this.canvas.clientHeight || 1), kf = (dy * mpp) / Math.max(0.35, Math.sin(this.viewEl ?? g.el)), kr = dx * mpp;
    g.tx += -kr * Math.cos(g.az) - kf * Math.sin(g.az);
    g.tz += kr * Math.sin(g.az) - kf * Math.cos(g.az);
    const q = this.W.inCity(g.tx, g.tz); // roam anywhere in the city
    g.tx = q[0]; g.tz = q[1];
  }
  _bindInput() {
    const c = this.canvas, pts = new Map();
    let drag = null, pinch = null;
    const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, ang: Math.atan2(b.y - a.y, b.x - a.x) }; };
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.running = false; this.hooks?.onContextLost?.(); });
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, orbit: e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey, moved: false };
      else if (pts.size === 2) { drag = null; pinch = { ...two(), dist: this.goal.dist, az: this.goal.az }; }
    });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pinch && pts.size === 2) {
        if (!this._take()) return;
        const t = two();
        this.goal.dist = clamp((pinch.dist * pinch.d) / t.d, DMIN, DMAX);
        this.goal.az = pinch.az - (t.ang - pinch.ang);
        return;
      }
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.moved = true;
      if (!this._take()) return;
      if (drag.orbit) { this.goal.az -= dx * 0.005; this.goal.el = clamp(this.goal.el + dy * 0.004, 0.16, 1.5); }
      else this._pan(dx, dy);
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      pinch = null;
      drag = pts.size === 1 ? { ...[...pts.values()][0], orbit: false, moved: true } : null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('lostpointercapture', end);
    this._clearPointers = () => { pts.clear(); drag = null; pinch = null; };
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this._take()) return;
      this.goal.dist = clamp(this.goal.dist * Math.exp(e.deltaY * 0.0012), DMIN, DMAX);
    }, { passive: false });
    const key = (e, on) => {
      if (!this.running || e.target.closest?.('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '+', '-', '='].includes(k)) return;
      if (on) this.keys.add(k); else this.keys.delete(k);
      if (on) e.preventDefault();
    };
    window.addEventListener('keydown', (e) => key(e, true));
    window.addEventListener('keyup', (e) => key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }
  _keys(dt) {
    const K = this.keys;
    if (!K.size || !this._take()) return;
    const g = this.goal, px = 620 * dt;
    const x = (K.has('d') || K.has('arrowright') ? 1 : 0) - (K.has('a') || K.has('arrowleft') ? 1 : 0);
    const y = (K.has('s') || K.has('arrowdown') ? 1 : 0) - (K.has('w') || K.has('arrowup') ? 1 : 0);
    if (x || y) this._pan(-x * px, -y * px);
    if (K.has('q')) g.az += dt * 1.3;
    if (K.has('e')) g.az -= dt * 1.3;
    if (K.has('+') || K.has('=')) g.dist = clamp(g.dist * Math.exp(-dt * 1.4), DMIN, DMAX);
    if (K.has('-')) g.dist = clamp(g.dist * Math.exp(dt * 1.4), DMIN, DMAX);
  }

  /** Count late frames in windows of 2.5 s and step the pixel ratio down (quickly) or back up (slowly, backing off when it did not hold). */
  _govern(now) {
    const g = this._gov, dt = now - g.last;
    g.last = now;
    if (g.steps.length < 2) return;
    if (!(dt > 0) || dt > 250 || document.hidden || this.audit) { g.n = g.slow = g.t = 0; return; } // a hidden tab or a hitch says nothing about the picture
    g.n++; g.t += dt;
    if (dt > 21) g.slow++;
    if (g.t < 2500) return;
    const share = g.slow / g.n, avg = g.t / g.n;
    g.n = g.slow = g.t = 0;
    if (g.fresh > 0) g.fresh--;
    if (g.tried) {
      // did fewer pixels buy anything? If not (a browser that caps the frame rate, a slow processor), pixels are not
      // the problem: take the sharp picture back and leave it alone for two minutes
      const gain = avg < g.tried * 0.92;
      g.tried = 0;
      if (!gain) { g.level--; g.until = now + 120000; g.calm = 0; this.renderer.setPixelRatio(g.steps[g.level]); return; }
    }
    if (now < g.until) return;
    if (share > 0.5) {
      g.calm = 0;
      if (g.level < g.steps.length - 1) {
        if (g.fresh > 0) g.wait = Math.min(g.wait * 2, 240000); // the sharper picture did not hold: wait longer before the next try
        g.level++; g.fresh = 0; g.tried = avg;
        this.renderer.setPixelRatio(g.steps[g.level]);
      }
    } else if (share < 0.05) {
      g.calm += 2500;
      if (g.level > 0 && g.calm >= g.wait) { g.level--; g.calm = 0; g.fresh = 3; this.renderer.setPixelRatio(g.steps[g.level]); }
    } else g.calm = 0;
  }

  _resize() {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fit = Math.max((w < h ? 14 : 23) / (this.camera.aspect * TAN), 13 / TAN) * 1.04;
  }

  /** Where the camera sits to watch one spot on the street. */
  _view(ctx) {
    const path = this.W.path, p = path.xz(ctx.sc, -(this.W.L.hw + this.W.L.bw) * 0.6 - 1.2);
    path.at(ctx.sc, _f);
    return { tx: p[0], tz: p[1], ty: this.W.landY(p[0], p[1]) + 1.2, az: AZ0 + Math.atan2(-_f.tz, _f.tx), el: EL0, dist: this.fit || 56, fov: FOV, roll: 0 };
  }
  _setMode(mode) {
    if (this.mode === mode) return;
    const was = this.mode;
    this.mode = mode;
    if (mode === 'free') {
      if (this.cine) this._cineEnd();
      Object.assign(this.goal, this.rig);
      // coming out of a close-up: back off to a sensible height
      this.goal.el = clamp(this.goal.el, 0.32, 1.5); this.goal.dist = Math.max(this.goal.dist, 42); this.goal.fov = FOV; this.goal.roll = 0;
      this.focusReq = null;
      if (was === 'follow' && this.autoFree) { this.goal.dist = Math.max(this.goal.dist, this.fit * 1.45); this.autoFree = false; }
    }
    if (mode === 'follow') {
      this.cutEnd = this.time + 30;
      // go to the freshest gag, or stay at the nearest spot
      let best = null;
      for (const g of this.gags) if (!best || g.t0 > best.t0) best = g;
      if (best) this.camCtx = best.ctx;
      else this.camCtx = this.locales.reduce((a, b) => (this._d2(b) < this._d2(a) ? b : a));
      this.lastSwitch = this.time; this.idleT = 0;
    }
    this.hooks.onMode?.(mode);
  }
  _d2(ctx) { const p = this.W.path.xz(ctx.sc, 0); return (p[0] - this.rig.tx) ** 2 + (p[1] - this.rig.tz) ** 2; }
  /** Debug: play a gag at the spot the camera is on. */
  debugPlay(name) { return this.W ? playGag(this.camCtx, name) : null; }
  get gagNames() { return GAG_NAMES; }
  /** Resume the directed camera. */
  follow() { if (this.W && this.mode === 'free') this._setMode('follow'); }
  /** Fly the free camera to a spot with something going on. */
  flyTo(ctx) {
    if (!this.W || this.mode === 'drop') return;
    if (this.mode === 'follow') this._setMode('free');
    Object.assign(this.goal, this._view(ctx));
  }
  /**
   * Rise straight up to `dist` metres, looking down with north up, so the page can hand over to the map.
   * Resolves with where the camera ended up.
   */
  leave(dist) {
    return new Promise((resolve) => {
      const W = this.W, r = this.rig;
      if (!W) return resolve(null);
      // where the camera is, how high, and which compass direction is up on screen (so the map can take over turned the same way)
      const here = () => {
        const F = W.frame, ux = -Math.sin(r.az), uz = -Math.cos(r.az);
        return { lngLat: W.toLngLat(r.tx, r.tz), dist: r.dist, bearing: (Math.atan2(ux * F.dx + uz * F.dy, ux * F.dy - uz * F.dx) * 180) / Math.PI };
      };
      if (r.dist >= dist * 0.9 || CALM) return resolve(here());
      if (this.cine) this._cineEnd();
      this.mode = 'leave';
      this.leaveTo = { t: 0, dur: clamp(0.45 + 0.4 * Math.log(dist / r.dist), 0.7, 2.1), d0: r.dist, d1: dist, el0: r.el, az0: r.az, done: false, resolve: () => resolve(here()) };
      this.hooks.onMode?.('leave');
    });
  }

  // ------------------------------------------------------------ the cinematic camera
  // A gag that has the director's camera can ask for shots (see _cam). The stage tracks the subjects live.
  /** `why` = 'release' when the scene gave the camera back itself (or ended): the shot log then stops counting. */
  _cineEnd(why) {
    if (!this.cine) return;
    this._shotClose();
    this.cine = null;
    if (why) this._shotsSeen = false;
    this._wasShot = true;
    this._dropStage();
    this.hooks.onCine?.(false);
  }
  /** The crowd makes room for the scene that holds the camera: `crowd.setStage({ x, z, r, mode })`, `setStage(null)` when it lets go. */
  _takeStage(ctx, name) {
    const gg = ctx._gags && ctx._gags.get(name), p = this.W.path.xz(ctx.sc, 0);
    this._stage = { ctx, x: p[0], z: p[1], r: (gg && gg.stage && gg.stage.r) || (ctx.stage && ctx.stage.r) || 15, mode: 'watch' };
    this._pushStage();
  }
  _pushStage() { const S = this._stage; if (this.crowd && this.crowd.setStage) this.crowd.setStage(S ? { x: S.x, z: S.z, r: S.r, mode: S.mode } : null); }
  _dropStage() { if (this._stage) { this._stage = null; this._pushStage(); } }
  /** A new shot replaces the old one: cut or glide to it, keep who stood where from the last one (see the follow branch of _frame). */
  _startShot(c, spec, deferred = 0) {
    c.prev = c.spec ? { view: c.view, pair: c.pair, pos: c.pairPos ? c.pairPos.slice() : null, side: c.side } : null;
    Object.assign(c, { spec, t0: this.time, cutAt: this.time, touched: this.time, deferred, fresh: true, swing: undefined, pending: null, fitInit: false, lastGoal: null, pair: null, pairPos: null });
  }
  // ---- the shot log (dev audit only; costs nothing when stage.audit is off)
  _shotOpen(c, o = {}) {
    if (!this.audit) return;
    this._shotClose();
    if (this.auditOnly && c.name !== this.auditOnly) return;
    const sp = c.spec, n = (v) => (typeof v === 'number' ? +v.toFixed(2) : v);
    this._shotCur = { t: +this.time.toFixed(2), t0: this.time, gag: c.name, dist: n(sp.dist), el: n(sp.el), az: n(sp.az), fov: n(sp.fov), kind: o.glide ? 'glide' : 'cut', len: 0, deferred: o.deferred || 0, stand: o.stand || '' };
    (this.shotLog ||= []).push(this._shotCur);
  }
  _shotClose() { const s = this._shotCur; if (s) { s.len = +(this.time - s.t0).toFixed(2); this._shotCur = null; } }
  _shotNote(what) { const s = this._shotCur; if (s) s.stand = s.stand ? s.stand + ',' + what : what; }
  _stat(k, v = 1) { if (this.audit) (this.auditStats ||= {})[k] = ((this.auditStats || {})[k] || 0) + v; }
  /** Stop the current gag from directing the camera (the viewer pressed Skip). */
  skipCine() { if (this.cine) { this.cineSkip = this.cine.name; this._cineEnd(); } }
  _wpos(ctx, s, out) {
    if (!s) return null;
    if (s.g || s.isObject3D) {
      if (s.alive === false) return null;
      const o = s.g || s;
      if (!o.parent) return null;
      o.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(o.matrixWorld);
    }
    const p = this.W.path.xz(ctx.sc + (s.x || 0), s.z || 0);
    return out.set(p[0], this.W.hAt(p[0], p[1]) + (s.y || 0), p[1]);
  }
  _shotGoal(c, probe = false) {
    const sp = c.spec, W = this.W, subs = Array.isArray(sp.on) ? sp.on : [sp.on], age = this.time - c.t0, d = sp.drift || {};
    let X = 0, Y = 0, Z = 0, n = 0, first = null, spread = 0;
    for (const sub of subs) { const p = this._wpos(c.ctx, sub, _v); if (!p) continue; X += p.x; Y += p.y; Z += p.z; n++; first ||= sub; }
    if (!n) return null;
    X /= n; Y /= n; Z /= n;
    for (const sub of subs) { const p = this._wpos(c.ctx, sub, _v); if (p) spread = Math.max(spread, Math.hypot(p.x - X, p.z - Z)); }
    W.path.at(c.ctx.sc, _f);
    const tx = _f.tx, tz = _f.tz, base = Math.atan2(-tz, tx);
    let az = sp.az ?? 0.35, dist = sp.dist ?? 14;
    const facing = first && first.head && typeof first.heading === 'number' ? Math.atan2(Math.sin(first.heading), Math.cos(first.heading)) : null;
    let near = dist < 20 ? 0.78 : 0.88; // shots were framed for taller figures: stand closer now that people are life-size
    if (sp.face && facing !== null) {
      // in front of the face. Someone facing the houses cannot be filmed from inside them: take them in profile, with what they look at
      az = Math.abs(facing) <= 1.25 ? facing : Math.sign(facing || 1) * 1.25;
      if (Math.abs(facing) > 1.25) { X += (tx * Math.sin(facing) - tz * Math.cos(facing)) * 0.5; Z += (tz * Math.sin(facing) + tx * Math.cos(facing)) * 0.5; }
    } else if (!sp.from && facing !== null && subs.length === 1 && dist < 22 && !sp.back) {
      // a chosen angle that would show the back of someone's head swings round to the nearer side of their face (decided once per shot)
      if (c.swing === undefined) {
        c.swing = 0;
        if (Math.sin(az) * Math.sin(facing) + Math.cos(az) * Math.cos(facing) < -0.3) {
          let best = null;
          for (const cand of [facing - 1.2, facing + 1.2]) { const a2 = Math.atan2(Math.sin(cand), Math.cos(cand)); if (Math.abs(a2) <= 1.7 && (best === null || Math.abs(a2 - az) < Math.abs(best - az))) best = a2; }
          if (best !== null) c.swing = best - az;
        }
      }
      az += c.swing;
    }
    if (sp.from) {
      // two people facing each other (this used to be an over-the-shoulder shot, which mostly showed the back of a head):
      // stand to the side of the line between them, on the camera's side of the street, so both faces are seen in profile
      const q = this._wpos(c.ctx, sp.from, _v2);
      if (q) {
        const dx = q.x - X, dz = q.z - Z, sep = Math.hypot(dx, dz) || 1, al = (dx * tx + dz * tz) / sep, ac = (-dx * tz + dz * tx) / sep; // the line, along and across the street
        let pa = -ac, pc = al; // at right angles to it
        if (pc < 0) { pa = -pa; pc = -pc; }
        az = Math.atan2(pa, pc); dist = Math.max(6.5, sep * 1.4 + 4.5) + (sp.dist || 0); X += dx * 0.5; Z += dz * 0.5; near = 1;
      }
    }
    if (sp.fit) dist = Math.max(dist === 14 ? 0 : dist, spread * 2.6 + 7);
    if (sp.lead && first && typeof first.heading === 'number' && (first.vel || first.moving)) { const sh = Math.sin(first.heading), ch = Math.cos(first.heading); X += (tx * sh - tz * ch) * sp.lead; Z += (tz * sh + tx * ch) * sp.lead; }
    c.base = base;
    az = clamp(az + (d.az || 0) * age + (c.azFix || 0) + (c.azMir || 0), -1.75, 1.75);
    // a hand-held feel: the aim wanders a little (sp.shake, about 0.3 to 1)
    if (sp.shake) { const q = this.time, k = sp.shake * 0.11; X += Math.sin(q * 7.1) * k; Z += Math.sin(q * 5.3 + 1) * k; Y += Math.sin(q * 8.7 + 2) * k * 0.7; }
    const out = this._fitBeat(c, {
      // shots were framed for taller figures: aim lower and stand closer now that people are life-size
      tx: X, tz: Z, ty: Y + (sp.y ?? 1.3) * 0.76, az: base + az, el: clamp((sp.el ?? 0.3) + (d.el || 0) * age + (c.elFix || 0), -0.2, 1.45),
      dist: Math.max(2.6, (dist + (d.dist || 0) * age) * near), fov: clamp((sp.fov || FOV) + (d.fov || 0) * age, 12, 70), roll: clamp((sp.roll || 0) + (d.roll || 0) * age, -0.42, 0.42),
    }, probe);
    if (!probe) {
      // two characters in the picture make a line the next shot must not cross (the 180 degree rule, see _mirror)
      const A = sp.from || (subs.length > 1 ? subs[0] : null), B = sp.from ? subs[0] : subs[1];
      const ok = (o) => o && (o.g || o.isObject3D);
      if (ok(A) && ok(B)) {
        const p1 = this._wpos(c.ctx, A, _v), x1 = p1 && p1.x, z1 = p1 && p1.z, p2 = this._wpos(c.ctx, B, _v2);
        if (p1 && p2) { c.pair = [A, B]; (c.pairPos ||= [0, 0, 0, 0]); c.pairPos[0] = x1; c.pairPos[1] = z1; c.pairPos[2] = p2.x; c.pairPos[3] = p2.z; }
      }
    }
    return out;
  }
  /**
   * The guarantee behind every storyboard beat: whoever the beat says must be seen stays in the picture. If the shot
   * as asked would leave one of them outside the frame, the camera backs off (and turns towards them) just far
   * enough to hold them all. A shot that already holds them is left exactly as it was asked for.
   */
  _fitBeat(c, G, probe = false) {
    const b = c.ctx._beatNow;
    if (!b || b.gag !== c.name || c.spec.free || !b.subs.length) { if (!probe) c.fitInit = false; return G; }
    const P = (this._fitP ||= []);
    P.length = 0;
    let mx = 0, my = 0, mz = 0, n = 0;
    for (const sub of b.subs) {
      if (sub.offstage) continue; // still on its way in from outside the frame: not yet part of the picture
      const p = this._wpos(c.ctx, sub, _v);
      if (!p) continue;
      const h = sub.vehicle ? sub.hgt || 1.5 : sub.head ? 1.9 * ((sub.g.scale.y || 1) / (1.25 * PERSON_K)) : sub.g || sub.isObject3D ? 0.7 : 0.5;
      P.push(p.x, p.y + h * 0.5, p.z, sub.vehicle ? 2.3 : 0.5, h * 0.5 + 0.3);
      mx += p.x; my += p.y + h * 0.5; mz += p.z; n++;
    }
    if (!n) return G;
    const asp = this.camera.aspect, aK = Math.sqrt(aspNeed(asp)), tf = Math.tan((G.fov * Math.PI) / 360) * aK;
    const ce = Math.cos(G.el), se = Math.sin(G.el), sa = Math.sin(G.az), ca = Math.cos(G.az);
    // how far back the lens must stand from the aim point (tx, ty, tz) to hold every subject inside `f` of the frame (0.97 = just in)
    const need = (tx, ty, tz, f) => {
      const tv = tf * f, th = tv * asp;
      let D = 0;
      for (let i = 0; i < P.length; i += 5) {
        const qx = P[i] - tx, qy = P[i + 1] - ty, qz = P[i + 2] - tz;
        const x = qx * ca - qz * sa, y = -qx * sa * se + qy * ce - qz * ca * se, back = qx * sa * ce + qy * se + qz * ca * ce;
        D = Math.max(D, ((Math.abs(x) + P[i + 3]) / th + back) / aK, ((Math.abs(y) + P[i + 4]) / tv + back) / aK);
      }
      return D;
    };
    const d97 = need(G.tx, G.ty, G.tz, 0.97), d85 = need(G.tx, G.ty, G.tz, 0.85);
    // Hysteresis: start backing off when somebody is outside 97% of the frame, come back only when all are inside 85%.
    // The backing off eases in and out (a critically damped follow) so a close shot never lurches wide.
    let on, s;
    if (probe) { on = c.fitOn || d97 > G.dist; s = on ? 1 : 0; }
    else {
      if (!c.fitInit) { c.fitInit = true; c.fitOn = d97 > G.dist; c.fitS = c.fitOn ? 1 : 0; c.fitV = 0; c.fitT = this.time; }
      else if (this.time > c.fitT) {
        const dt = Math.min(0.1, this.time - c.fitT);
        c.fitT = this.time;
        if (!c.fitOn && d97 > G.dist) c.fitOn = true; else if (c.fitOn && d85 <= G.dist) c.fitOn = false;
        const w = 6;
        c.fitV += (w * w * ((c.fitOn ? 1 : 0) - c.fitS) - 2 * w * c.fitV) * dt;
        c.fitS = clamp(c.fitS + c.fitV * dt);
      }
      on = c.fitOn; s = c.fitS;
    }
    if (!on && s < 0.002) return G;
    // the shot with everybody held: turn towards them as well as backing off (the further out they are, the more the aim moves to their middle)
    const k = clamp(d85 / G.dist - 1) * 0.8, F = { tx: G.tx + (mx / n - G.tx) * k, ty: G.ty + (my / n - G.ty) * k, tz: G.tz + (mz / n - G.tz) * k };
    const D = Math.min(Math.max(G.dist, need(F.tx, F.ty, F.tz, 0.85)), Math.max(G.dist * 4, 36));
    G.tx += (F.tx - G.tx) * s; G.ty += (F.ty - G.ty) * s; G.tz += (F.tz - G.tz) * s;
    G.dist *= Math.pow(D / G.dist, s);
    return G;
  }
  /** Is the line from a shot's subject to its camera free of buildings (as drawn, with their heights)? */
  _clear(g, strict = false) {
    const S = this.W.solid, ce = Math.cos(g.el), se = Math.sin(g.el), sx = Math.sin(g.az) * ce, sz = Math.cos(g.az) * ce;
    for (let t = 2; t <= g.dist; t += 0.6) {
      const h = S.get(g.tx + sx * t, g.tz + sz * t);
      if (h === 0 || h === 255) continue;
      // skimming a roof is as bad as hitting a wall: near the camera the roof must be well below it
      if (g.ty + se * t < S.y0 + h * 0.5 + (t > g.dist - 8 ? 3 : 0.5)) return false;
    }
    // a parked car right in front of a low camera fills the picture: treat it like a wall
    if (se < 0.45 && this.crowd) {
      if (!this._parkAt || Math.hypot(this._parkAt[0] - g.tx, this._parkAt[1] - g.tz) > 12) { this._parkAt = [g.tx, g.tz]; this._park = this.crowd.parkedNear(g.tx, g.tz, 45); }
      const P = this._park, gy = this.W.landY(g.tx, g.tz);
      for (let i = 0; i < P.length; i += 2) {
        const dx = P[i] - g.tx, dz = P[i + 1] - g.tz, t = clamp(dx * sx + dz * sz, 0, g.dist);
        if (t < 2.5) continue; // a car the subject is standing at belongs in the shot
        if (Math.hypot(dx - sx * t, dz - sz * t) < 2.1 && g.ty + se * t < gy + 2.0) return false;
      }
    }
    // Choosing where to stand for a new shot is stricter: a bin, a bike rack or a tree trunk between a low lens and
    // its subject (or right in front of the lens) fills the picture as surely as a wall does.
    if (strict && se < 0.5) {
      const W = this.W, gy = W.landY(g.tx, g.tz), camY = g.ty + se * g.dist;
      const hit = (px, pz, f) => {
        const dx = px - g.tx, dz = pz - g.tz, t = dx * sx + dz * sz;
        if (t > g.dist + 1.5) return false;
        const off = Math.hypot(dx - sx * t, dz - sz * t);
        // what the subject stands at belongs in the shot, unless it is tall and squarely in front of them (a mailbox before a face)
        if (t < 1.7) return t > 0.45 && f[0] > 1.3 && off < f[1] + 0.3 && g.ty + se * t < gy + f[0] - 0.15;
        if (off < f[1] + 0.4 && g.ty + se * Math.min(t, g.dist) < gy + f[0] + 0.5) return true;
        return t > g.dist - 3.5 && off < f[1] + 1.3 && camY < gy + f[0] + 0.9;
      };
      for (const p of W.props || []) if (hit(p.x, p.z, FURN[p.kind] || FURN.bin)) return false;
      for (const l of W.anchors.lamps) if (Math.abs(l.X - g.tx) < g.dist + 3 && Math.abs(l.Z - g.tz) < g.dist + 3 && hit(l.X, l.Z, FURN.lamp)) return false;
      // somebody else standing in the line of sight (a bystander's back) hides the subject just as well
      const skip = this._shotSubs;
      for (const a of this.actors) {
        if (!a.alive || !a.head || a.offstage || (skip && skip.includes(a)) || !a.g.parent) continue;
        a.g.updateWorldMatrix(true, false);
        const e = a.g.matrixWorld.elements, dx = e[12] - g.tx, dz = e[14] - g.tz, t = dx * sx + dz * sz;
        if (t < 0.3 || t > g.dist + 0.5) continue;
        if (Math.hypot(dx - sx * t, dz - sz * t) < 0.7 + (t > g.dist - 3 ? 0.4 : 0) && g.ty + se * t < e[13] + 2.1) return false;
      }
      // a parked car beside the lens looms into the picture too
      if (this._park) { const cx = g.tx + sx * g.dist, cz = g.tz + sz * g.dist, P = this._park; for (let i = 0; i < P.length; i += 2) if (camY < gy + 2.4 && Math.hypot(P[i] - cx, P[i + 1] - cz) < 3.3 && Math.hypot(P[i] - g.tx, P[i + 1] - g.tz) > 3) return false; }
      if (W.treeNear) for (let t = 2.2; t <= g.dist + 0.6; t += 0.7) if (W.treeNear(g.tx + sx * t, g.tz + sz * t, t > g.dist - 2.5 ? 1.1 : 0.55)) return false;
    }
    if (strict && !this._lens(g)) return false;
    return true;
  }
  /** The lens itself must not stand under a parasol, inside a market stall or kiosk, against a lamp post, or in a statue or shelter. */
  _lens(g) {
    const se = Math.sin(g.el), ce = Math.cos(g.el), W = this.W, cx = g.tx + Math.sin(g.az) * ce * g.dist, cz = g.tz + Math.cos(g.az) * ce * g.dist, cy = g.ty + se * g.dist, gy = W.landY(cx, cz);
    for (const p of W.props || []) {
      if (!TALL.has(p.kind) || Math.abs(p.x - cx) > 5 || Math.abs(p.z - cz) > 5) continue;
      const f = FURN[p.kind];
      if (Math.hypot(p.x - cx, p.z - cz) < f[1] + 0.6 && cy < gy + f[0] + 0.3) return false;
    }
    for (const l of W.anchors.lamps) if (Math.abs(l.X - cx) < 1 && Math.abs(l.Z - cz) < 1 && Math.hypot(l.X - cx, l.Z - cz) < 0.8) return false;
    const S = W.solid;
    for (let k = 0; k < 5; k++) {
      const hh = S.get(cx + (k === 1 ? 0.8 : k === 2 ? -0.8 : 0), cz + (k === 3 ? 0.8 : k === 4 ? -0.8 : 0));
      if (hh !== 0 && hh !== 255 && cy < S.y0 + hh * 0.5 + 0.5) return false;
    }
    return true;
  }
  /**
   * Where to stand for a shot whose sight line is blocked: the nearest clear stand to the current one (swing round first, then
   * rise a little), first clear of everything, then at least clear of walls. Returns the shot's new goal and whether nothing was
   * found (then the caller watches from high up instead).
   */
  _stand(c, sg) {
    if (sg.el >= 0.6) return { sg, high: !this._clear(sg) };
    if (this._clear(sg, true)) return { sg, high: false };
    const baseClear = this._clear(sg) && this._lens(sg), o0 = c.azFix || 0, u0 = c.elFix || 0, cands = [];
    for (const up of [0, 0.16, 0.3, 0.46]) for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]) {
      if (off !== o0 || up !== u0) cands.push([Math.abs(off - o0) + 10 * Math.abs(up - u0), off, up]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    for (const strict of [true, false]) {
      if (!strict && baseClear) return { sg, high: false };
      for (const [, off, up] of cands) {
        c.azFix = off; c.elFix = up;
        const alt = this._shotGoal(c, true);
        if (alt && this._clear(alt, strict) && (strict || this._lens(alt))) { c.fitInit = false; return { sg: this._shotGoal(c) || alt, high: false, moved: true }; }
      }
    }
    c.azFix = o0; c.elFix = u0;
    return { sg, high: true };
  }
  /** Which side of the line a-b a point is on (+1 / -1; 0 on it). */
  _side(ax, az, bx, bz, px, pz) { return Math.sign((bx - ax) * (pz - az) - (bz - az) * (px - ax)); }
  /**
   * The 180 degree rule: if the last shot showed two characters and this one shows one of them from the other side of the line
   * between them (and the script did not ask for that with `from` or `free`), swing this shot over to the same side.
   */
  _mirror(c, sg) {
    const sp = c.spec, pv = c.prev;
    c.azMir = 0;
    if (!pv || !pv.pair || !pv.pos || !pv.side || sp.from || sp.free) return false;
    if (![].concat(sp.on).some((o) => o === pv.pair[0] || o === pv.pair[1])) return false;
    const [ax, az, bx, bz] = pv.pos;
    if (Math.hypot(bx - ax, bz - az) < 1.2) return false;
    const cam = (G) => [G.tx + Math.sin(G.az) * Math.cos(G.el) * G.dist, G.tz + Math.cos(G.az) * Math.cos(G.el) * G.dist];
    let q = cam(sg);
    if (this._side(ax, az, bx, bz, q[0], q[1]) !== -pv.side) return false;
    const th = 2 * Math.atan2(bx - ax, bz - az) - sg.az, loc = angDiff(c.base, th);
    if (Math.abs(loc) > 1.7) return false; // that side is inside the houses
    c.azMir = loc - angDiff(c.base, sg.az);
    const alt = this._shotGoal(c, true);
    q = alt ? cam(alt) : null;
    if (!q || this._side(ax, az, bx, bz, q[0], q[1]) !== pv.side) { c.azMir = 0; return false; }
    return true;
  }
  _cam(ctx, name) {
    const stage = this;
    const mine = () => !!stage.cine && stage.cine.ctx === ctx && stage.cine.name === name;
    const can = () => !CALM && stage.mode === 'follow' && stage.camCtx === ctx && stage.cineSkip !== name && (!stage.cine || mine());
    const shot = (spec) => {
      if (!spec || !spec.on || !can()) return;
      if (!mine()) { stage.cine = { ctx, name }; stage.hooks.onCine?.(true); stage._takeStage(ctx, name); stage._startShot(stage.cine, spec); return; }
      // A shot is binding: it stays until the scene asks for the next one or lets go. A new shot that comes too soon after the
      // last cut waits its turn (the latest request wins), unless it is `quick` or glides (`cut: seconds`). The script never blocks.
      const c = stage.cine;
      c.touched = stage.time;
      if (c.spec && !spec.quick && typeof spec.cut !== 'number' && stage.time - c.cutAt < MIN_SHOT) {
        if (!c.pending) c.pendReq = stage.time;
        c.pending = spec; c.pendAt = c.cutAt + MIN_SHOT;
        return;
      }
      stage._startShot(c, spec, 0);
    };
    const P = (on, base, o) => shot({ on, ...base, ...(o || {}) });
    return {
      get on() { return can(); },
      shot,
      wide: (on, o) => P(on, { dist: 30, el: 0.42, az: 0.45, y: 1.2 }, o),
      close: (on, o) => P(on, { dist: 8, el: 0.08, y: 1.6, face: true, fov: 26, drift: { dist: -0.2 } }, o),
      low: (on, o) => P(on, { dist: 7.5, el: -0.1, y: 1.3, face: true, fov: 40, roll: 0.07 }, o),
      ots: (from, to, o) => P(to, { from, el: 0.2, y: 1.45 }, o),
      track: (on, o) => P(on, { dist: 13, el: 0.16, az: 0.3, y: 1.2, lead: 2, fov: 32 }, o),
      top: (on, o) => P(on, { dist: 32, el: 1.32, az: 0, y: 0 }, o),
      two: (a, b, o) => P([a, b], { el: 0.2, az: 0.25, y: 1.35, fit: true }, o),
      // ---- more of the film grammar
      /** looking up at someone from knee height, wide lens, tilted: the villain shot */
      hero: (on, o) => P(on, { dist: 5.2, el: -0.14, y: 1.45, face: true, fov: 48, roll: 0.1, drift: { dist: -0.15 } }, o),
      /** face filling the frame */
      face: (on, o) => P(on, { dist: 4.6, el: 0.04, y: 1.72, face: true, fov: 22 }, o),
      /** crash zoom: starts wide and punches in on the lens */
      crash: (on, o) => P(on, { dist: 11, el: 0.12, y: 1.5, face: true, fov: 56, drift: { fov: -70 } }, o),
      /** slow push-in */
      dolly: (on, o) => P(on, { dist: 12, el: 0.14, y: 1.35, fov: 30, drift: { dist: -1.1 } }, o),
      /** circles the subject (speed in radians per second, sign = direction) */
      orbit: (on, o) => P(on, { dist: 9, el: 0.22, y: 1.3, az: -0.7, fov: 34, drift: { az: 0.35 } }, o),
      /** a vehicle coming at the lens: long lens, down at bumper height. `dir` = the way it travels (+1 = towards +x) */
      nose: (on, dir = 1, o) => P(on, { dist: 17, el: 0.05, az: dir * 1.5, y: 0.9, fov: 24, back: true }, o),
      /** rolling alongside a vehicle, low and wide, hand-held */
      chase: (on, dir = 1, o) => P(on, { dist: 9.5, el: 0.09, az: -dir * 0.95, y: 0.9, fov: 50, lead: 2.5, shake: 0.7, back: true }, o),
      /** at wheel height, close: tyres, kerbs, things on the ground */
      ground: (on, o) => P(on, { dist: 5.5, el: 0.03, y: 0.35, fov: 44 }, o),
      /** looking down from a first-floor window */
      high: (on, o) => P(on, { dist: 19, el: 0.85, az: 0.2, y: 0.6, fov: 30 }, o),
      /** a tilted frame for when things go wrong */
      dutch: (on, o) => P(on, { dist: 8.5, el: 0.1, y: 1.4, face: true, fov: 38, roll: 0.26 }, o),
      card: (title, sub = '', dur = 1.6) => { if (mine()) stage.hooks.onCard?.(String(title), String(sub), dur); },
      freeze: (dur = 1, scale = 0.05) => { if (mine()) stage.slow = { scale, t: dur }; },
      release: () => { if (mine()) stage._cineEnd('release'); },
    };
  }

  // ------------------------------------------------------------ storyboard beats (the visibility audit)
  // Every set piece announces its beats (ctx.beat) with the people and things the viewer has to see. With
  // `stage.audit` on (the dev audit turns it on) the stage measures, frame by frame, whether each of them is inside
  // the picture, not behind a standing building, and how tall it is on screen. Costs nothing when audit is off.
  _beat(ctx, gag, label, subs) {
    // the camera keeps a beat's subjects in the picture (see _fitBeat), audit or not
    ctx._beatNow = { gag, subs: (Array.isArray(subs) ? subs : [subs]).filter(Boolean) };
    if (this.cine && this.cine.ctx === ctx && this.cine.name === gag) this.cine.touched = this.time;
    if (!this.audit || (this.auditOnly && (gag !== this.auditOnly || ctx !== this.camCtx))) return; // other spots play their own scenes meanwhile
    this._beatClose();
    const list = (Array.isArray(subs) ? subs : [subs]).filter(Boolean);
    this.curBeat = { ctx, gag, label, subs: list, t0: this.time, n: 0, seen: 0, off: 0, hid: 0, px: [], cine: 0, el: 0, dist: 0 };
    (this.beatLog ||= []);
  }
  _beatClose() {
    const b = this.curBeat;
    if (!b) return;
    this.curBeat = null;
    const px = b.px.sort((x, y) => x - y), n = Math.max(1, b.n);
    this.beatLog.push({
      gag: b.gag, beat: b.label, secs: +(this.time - b.t0).toFixed(1), seen: Math.round((100 * b.seen) / n), offFrame: Math.round((100 * b.off) / n),
      hidden: Math.round((100 * b.hid) / n), size: px.length ? +px[px.length >> 1].toFixed(1) : 0, cam: Math.round((100 * b.cine) / n),
      el: +(b.el / n).toFixed(2), dist: +(b.dist / n).toFixed(1),
    });
  }
  /** One frame of the audit: is every subject of the current beat in the picture and in the clear? */
  _beatTick() {
    const b = this.curBeat, W = this.W;
    if (!b || !W) return;
    const cam = this.camera, S = W.solid, cp = cam.position;
    let all = true, off = false, hid = false, size = null;
    for (const sub of b.subs) {
      if (sub.offstage) continue; // not yet arrived: not required for `seen`
      const p = this._wpos(b.ctx, sub, _v);
      if (!p) continue;
      const h = sub.vehicle ? sub.hgt || 1.5 : sub.g || sub.isObject3D ? (sub.head ? 1.9 * ((sub.g.scale.y || 1) / (1.25 * PERSON_K)) : 0.8) : 0.6;
      const bx = p.x, by = p.y, bz = p.z;
      _v2.set(bx, by + h * 0.6, bz).project(cam);
      const inside = _v2.z < 1 && Math.abs(_v2.x) < 0.97 && Math.abs(_v2.y) < 0.97;
      if (!inside) { all = false; off = true; continue; }
      const y0 = _v.set(bx, by, bz).project(cam).y, y1 = _v2.set(bx, by + h, bz).project(cam).y;
      if (size === null) size = Math.abs(y1 - y0) * 50; // percent of the picture's height
      // march from the lens to the subject's middle: a building that still stands in between hides it
      const mx = bx, my = by + h * 0.6, mz = bz, dx = mx - cp.x, dy = my - cp.y, dz = mz - cp.z, len = Math.hypot(dx, dy, dz);
      for (let t = 1; t < len - 1; t += 0.5) {
        const k = t / len, x = cp.x + dx * k, z = cp.z + dz * k, hh = S.get(x, z);
        if (hh === 0 || hh === 255) continue;
        if (cp.y + dy * k < S.y0 + Math.min(hh * 0.5, cutLimit(x, z)) - 0.3) { all = false; hid = true; break; } // as tall as the cutaway leaves it
      }
    }
    b.n++;
    if (all) b.seen++;
    if (off) b.off++;
    if (hid) b.hid++;
    if (size !== null) b.px.push(size);
    if (this.cine && this.cine.ctx === b.ctx && this.cine.name === b.gag) b.cine++;
    b.el += this.rig.el; b.dist += this.rig.dist;
  }

  // ------------------------------------------------------------ sky: clock, forced day or night, and the change between them
  /** The look the sky should have now, by mode. */
  _wantLook() {
    if (this.skyMode === 'clock') return skyAt(this.clockOpt || new Date());
    return forcedLook(this.skyMode);
  }
  /** 'clock' (the default: the real time in The Hague), 'day' or 'night'. Glides there if a street is open. */
  setSky(mode) {
    if (mode !== 'day' && mode !== 'night') mode = 'clock';
    if (mode === this.skyMode) return;
    this.skyMode = mode;
    if (this.W) this._startTr(this._wantLook());
  }
  /**
   * A change of light that is a short, deliberate event: the sky and the sun glide over about a second while the picture
   * dips towards dusk, and the baked parts of the tiles (lit windows of the detailed fronts, lanterns, landmark lights)
   * are made on the side and swapped in together at the darkest moment. The crowd does not change: its lights are uniforms.
   */
  _startTr(to) {
    const from = new Look().copy(this.cur), need = !!to.night !== !!this.cur.night;
    // a change asked for during a change: carry on from where the picture is (it may be mid-dusk), never jump back to full light
    this.tr = { from, to, t: 0, need, swapped: false, hold: 0, tc: 0, d0: this._dip };
    this.W.bake.start(to.night);
  }
  _commitBake() {
    const tr = this.tr, W = this.W;
    W.bake.commit(tr.to.night);
    W.L.night = tr.to.night;
    for (const c of [this.amb, ...(this.locales || [])]) if (c && c.L) c.L.night = tr.to.night;
    this.cur.night = tr.to.night;
    tr.swapped = true; tr.tc = tr.t;
  }
  _skyFrame(real) {
    const tr = this.tr, cur = this.cur;
    if (tr) {
      tr.t += real;
      let p;
      if (!tr.need) p = clamp(tr.t / 1.1);
      else if (!tr.swapped) {
        const left = this.W.bake.step(7, this.lite ? 10 : 48);
        p = Math.min(0.5, (tr.t / 0.6) * 0.5);
        if (p >= 0.5) { tr.hold += real; if (left === 0 || tr.hold > 4) this._commitBake(); } // (never hold the dusk for long: whatever is not ready follows)
      }
      if (tr.need && tr.swapped) p = 0.5 + clamp((tr.t - tr.tc) / 0.7) * 0.5;
      const night = cur.night;
      if (p >= 1) { cur.copy(tr.to); cur.night = tr.to.night; this._dip = 0; this.tr = null; }
      else { cur.mix(tr.from, tr.to, sm(p)); cur.night = tr.need ? (tr.swapped ? tr.to.night : tr.from.night) : night; this._dip = Math.max(tr.need ? Math.sin(Math.PI * p) : 0, tr.d0 * (1 - sm(p))); }
      this._applyLook(cur);
      return;
    }
    // the real clock moves on while somebody watches: the light follows it, and dusk and dawn play the same change
    if (this.skyMode === 'clock' && !this.clockOpt && (this._clockT -= real) < 0) {
      this._clockT = 4;
      const want = this._wantLook();
      if (!!want.night !== !!cur.night) this._startTr(want);
      else { const n = cur.night; cur.copy(want); cur.night = n; this._applyLook(cur); }
    }
  }
  /** Put a look on the lights, the fog, the page behind the canvas (sky, stars, moon) and the shaders (how dark, who is awake). */
  _applyLook(L, force = false) {
    const dip = this._dip, dim = 1 - 0.5 * dip, c = _col;
    this.sun.color.copy(L.sun); this.sun.intensity = L.sunI * dim;
    this.hemi.color.copy(L.hs); this.hemi.groundColor.copy(L.hg); this.hemi.intensity = L.hI * dim;
    this.scene.fog.color.copy(L.fog).multiplyScalar(1 - 0.35 * dip);
    const css = (k, v) => { if (this._cssLast[k] !== v) { this._cssLast[k] = v; this.root.style.setProperty(k, v); } };
    css('--sky-top', '#' + c.copy(L.top).multiplyScalar(1 - 0.3 * dip).getHexString());
    css('--sky-bot', '#' + c.copy(L.bot).multiplyScalar(1 - 0.3 * dip).getHexString());
    css('--stars', (L.stars * (1 - 0.5 * dip)).toFixed(2));
    css('--moon', L.moon.toFixed(2));
    css('--glow', L.nk.toFixed(2));
    U.uNight.value = L.nk;
    if (Math.abs(L.hour - this._winHour) > 0.02) {
      this._winHour = L.hour;
      U.uWin.value.set(tab(WIN.home, L.hour), tab(WIN.office, L.hour), tab(WIN.shop, L.hour));
      litShare.home = U.uWin.value.x; litShare.shop = U.uWin.value.z; // the modelled windows of the detailed fronts are made with the same shares
    }
    if (this._cloudMat) this._cloudMat.opacity = lerp(0.92, 0.42, L.nk);
    if (this.W) {
      // the light's compass direction, in this street's frame
      const F = this.W.frame, e = Math.sin(L.lightAz) * Math.cos(L.lightAlt), n = Math.cos(L.lightAz) * Math.cos(L.lightAlt);
      this.sunDir.set(e * F.dx + n * F.dy, Math.sin(L.lightAlt), e * F.dy - n * F.dx).normalize();
    }
  }

  // ------------------------------------------------------------ show
  /**
   * Open a street. With `opts.keep` (and a street already open) the camera stays exactly where it is: the new
   * street is built while the old one keeps playing, then they change places in a single frame.
   */
  async show(st, hooks = {}, opts = {}) {
    const keep = !!opts.keep && !!this.W && this.running;
    if (keep) this._tok++; else this.hide();
    const token = this._tok;
    const level = clamp(Math.round(+st.level) || 1, 1, 5);
    this.clockOpt = opts.clock || null;
    // a street that is swapped in while the sky is changing is baked for where the sky is heading
    const sky = keep ? this.cur : this._wantLook(), bakeNight = keep && this.tr ? this.tr.to.night : sky.night;
    const dress = () => {
      this.hooks = hooks;
      if (!keep) { this.cur.copy(sky); this.tr = null; this._applyLook(this.cur); }
    };
    if (!keep) dress();
    let W;
    try {
      W = await buildWorld(st, opts.geometry, { night: !!bakeNight, seed: opts.seed || '', lite: this.lite, soft: keep });
    } catch (e) {
      console.error('world build failed', e);
      return false;
    }
    if (token !== this._tok) { W.dispose(); return false; }
    let view = null;
    if (keep) {
      const o = this.W, r = this.rig, g = this.goal;
      if (!o || !this.running || this.mode === 'leave' || this.mode === 'drop' || this.exiting) { W.dispose(); return false; }
      // the camera, in map terms, so it can be put back in the new street's frame
      const dir = (az) => { const x = Math.sin(az), z = Math.cos(az); return [x * o.frame.dx + z * o.frame.dy, x * o.frame.dy - z * o.frame.dx]; };
      view = { m: o.frame.M(r.tx, r.tz), gm: o.frame.M(g.tx, g.tz), d: dir(r.az), gd: dir(g.az), el: r.el, gel: g.el, dist: r.dist, gdist: g.dist, ty: r.ty, sky: this.sky };
      // the city's street life carries on: it is handed to the next street instead of being torn down
      view.crowd = this.crowd; this.crowd = null;
      if (o.stream) o.stream.onTile = null;
      this._teardown(true);
      dress();
    }
    try {
      this._begin(W, st, sky, level, { ...opts, view });
    } catch (e) {
      console.error('scene start failed', e);
      if (!this.W) W.dispose();
      this.hide();
      return false;
    }
    return true;
  }

  _begin(W, st, sky, level, opts) {
    const hooks = this.hooks;
    this.W = W;
    this.sky = this.cur;
    W.activate();
    this._applyLook(this.cur, true); // (the light's direction is given in this street's frame; after activate, which sets a first guess of U.uNight)
    U.uLampN.value = 0; // the lamps nearest the camera are picked again on the first frame (the old list is in the old frame)
    if (this.tr) W.bake.start(this.tr.to.night); // the sky is still changing: this street's tiles join in
    this.scene.add(W.group);
    // background life on every other street: the detailed area's roads now, each tile's roads as it streams in
    // the city's street life: walkers, bikes, cars and trams on every street, this one included. It is one system
    // for the whole city and outlives the street: when the focus moves it is carried over as it is
    const old = opts.view && opts.view.crowd;
    if (old) { this.crowd = old; old.rebase(W); } // (the crowd does not depend on day or night: its lights are switched by a uniform)
    else this.crowd = new Crowd(W, { lite: this.lite });
    this.scene.add(this.crowd.group);
    W.stream.onTile = (c, on) => { if (!this.crowd) return; if (on) this.crowd.addTile(c); }; // (tiles that leave are pruned a little later)
    for (const key of W.corridor) { const c = tileOf(key); if (c) this.crowd.addTile(c); } // this street's own tiles now: its lamp posts and parked cars are needed below
    this.pruneT = 2;
    this.dyn = new THREE.Group();
    this.scene.add(this.dyn);

    const rnd = makeRng(hashStr((st.name || '') + '|' + (st.buurt || '') + '|' + (opts.seed || '') + '|stage'));
    const path = W.path, len = path.sB - path.sA;
    this.fx = new Fx(this.scene, this.camera, this.overlay);
    // whose words stay readable from afar: the scene that directs the camera, or the spot the camera is following
    this.fx.watch = (ctx) => (this.cine ? this.cine.ctx === ctx : this.mode === 'follow' && this.camCtx === ctx);
    this.fx.ground = W.hAt;
    this.cine = null; this._stage = null; this.cineSkip = null; this._wasShot = false; this.exiting = false; this.leaveTo = null;
    this.runner = new Runner();
    this.actors = [];
    this.extras = [];
    this.gags = new Set();
    this.time = 0;
    this.timeScale = 1;
    this.slow = null;
    this.focusReq = null;
    this.lampT = 0;
    this.mix = mixFor(opts.crime?.cat, opts.crime?.cats);
    this.only = opts.only || null;
    this._resize();

    // ---- where the gags play: the spot that was clicked, plus more along the street
    const A = W.anchors, edge = Math.min(22, len / 2), lo = path.sA + edge, hi = path.sB - edge;
    {
      // lamp posts and parked cars stand where the city put them (the same whether or not this street is open): the gags use them as they are
      const hb = W.L.hw + W.L.bw, own = this.crowd.props((x, z) => { const q = path.project(x, z); return q.d < hb + 4.5 && q.s > path.sA + 1 && q.s < path.sB - 1; });
      for (const l of own.lamps) { const q = path.project(l.x, l.z); A.lamps.push({ s: q.s, z: q.v, y: LAMP_KIND[l.kind].h - 0.3, X: l.x, Z: l.z, kind: l.kind }); }
      for (const c of own.parked) { const q = path.project(c.x, c.z); if (Math.abs(q.v) < hb) A.parked.push({ s: q.s, z: q.v, hd: c.hd }); }
      A.lamps.sort((a, b) => a.s - b.s); A.parked.sort((a, b) => a.s - b.s);
    }
    // how readily walkers step into the road here: rougher streets, and streets where reckless driving is a big part of the crime, more
    this.crowd.jay = 0.004 * (0.5 + 0.3 * level) * clamp(this.mix.factor?.carChase ?? 1, 0.6, 2.2);
    this.crowd.onBonk = (x, y, z, bike) => this._bonk(x, y, z, bike);
    let want = (path.sA + path.sB) / 2;
    if (opts.lngLat) { const p = W.toScene(opts.lngLat[0], opts.lngLat[1]), pr = path.project(p[0], p[1]); if (pr.d < 120) want = pr.s; }
    want = clamp(want, lo, hi);
    const score = (s) => A.houses.filter((h) => Math.abs(h.s - s) < 17).length + 2 * A.benches.filter((b) => Math.abs(b.s - s) < 18).length
      + 2 * A.racks.filter((b) => Math.abs(b.s - s) < 18).length + (A.atms.some((b) => Math.abs(b.s - s) < 14) ? 4 : 0) + (A.parked.some((b) => Math.abs(b.s - s) < 16) ? 2 : 0) - Math.abs(s - want) * 0.12;
    let main = want, best = -1e9;
    for (let s = Math.max(lo, want - 26); s <= Math.min(hi, want + 26); s += 4) { const sc = score(s); if (sc > best) { best = sc; main = s; } }
    const centres = [main], n = clamp(Math.floor(len / 62), 1, this.lite ? 4 : 7);
    for (let i = 0; i < n; i++) {
      const c = n === 1 ? (lo + hi) / 2 : lerp(lo, hi, i / (n - 1));
      if (centres.every((m) => Math.abs(m - c) >= 50)) centres.push(c);
    }

    // a cash machine deserves a spot of its own (the big set piece needs one)
    for (const a of A.atms.slice(0, 3)) {
      const s = clamp(a.s, lo, hi);
      if (centres.some((m) => Math.abs(m - a.s) < 13)) continue;
      let bi = -1, bd = 1e9;
      centres.forEach((m, i) => { const d = Math.abs(m - s); if (d < bd && (i > 0 || d < 30)) { bd = d; bi = i; } });
      if (bi >= 0 && bd < 45) centres[bi] = s;
      else if (centres.every((m) => Math.abs(m - s) >= 45)) centres.push(s);
    }
    const stage = this;
    const mk = (L, sc, id) => {
      const map = (x, z) => path.xz(sc + x, z);
      const crnd = makeRng(hashStr(st.name + '|' + id + '|' + (opts.seed || '')));
      const near = () => { if (id === 'amb') return this.rig.dist < 400; const p = path.xz(sc, 0); return Math.hypot(p[0] - this.rig.tx, p[1] - this.rig.tz) < Math.max(55, this.rig.dist * 0.8) && this.rig.dist < 500; };
      const fxw = {
        text(str, at, o = {}) {
          let wp;
          o.owner = ctx; // so the words of the scene being watched are kept while far-off ones fade (fx.js)
          if (at.isVector3) { const p = map(at.x, at.z); wp = new THREE.Vector3(p[0], at.y + W.hAt(p[0], p[1]), p[1]); stage.fx.text(str, wp, o); }
          else { stage.fx.text(str, at, o); const ob = at.g || at; ob.updateWorldMatrix(true, false); wp = _v.setFromMatrixPosition(ob.matrixWorld); }
          // big comic words are the punchlines: nudge the camera towards them
          if ((o.size ?? 22) >= 20) stage._focus(ctx, wp.x, wp.z, 0.66, 2.4, 1);
        },
        shake: (a) => { if (near() && !CALM) stage.fx.shake(a); },
      };
      // a mark's direction is given in street space too: turn it by the way the street runs here
      fxw.mark = (x, y, z, ang = 0, o) => { const p = map(x, z), t = path.at(sc + x, _f); stage.fx.mark(p[0], y + W.hAt(p[0], p[1]), p[1], ang + Math.atan2(-t.tz, t.tx), o); };
      fxw.dust = (x, y, z, vx = 0, vz = 0, ...rest) => { const p = map(x, z), t = path.at(sc + x, _f); stage.fx.dust(p[0], y + W.hAt(p[0], p[1]), p[1], t.tx * vx - t.tz * vz, t.tz * vx + t.tx * vz, ...rest); };
      for (const k of ['burst', 'smoke', 'puff', 'cash', 'confetti', 'sparks', 'fireball', 'firework', 'shards', 'pips']) fxw[k] = (x, y, z, ...rest) => { const p = map(x, z); stage.fx[k](p[0], y + W.hAt(p[0], p[1]), p[1], ...rest); };
      const ctx = {
        id, sc, L, st, level, W, crowd: this.crowd, get night() { return stage.sky.night; }, rnd: crnd, fx: fxw, runner: this.runner, mix: this.mix,
        district: (() => { const p = path.xz(sc, 0), m = W.frame.M(p[0], p[1]), d = spotAt(m[0], m[1]); return { wijk: d.wijk, buurt: d.buurt, level: d.level, pop: d.pop }; })(), // whose neighbourhood this is (wijk and buurt are null off the map); pop = the shares of districts.js here
        world: { add: (o) => { warp(o, ctx, path, W.hAt); this.dyn.add(o); }, remove: (o) => { this.dyn.remove(o); disposeTree(o); } },
        run: (g) => this.runner.run(g),
        spawn(a, x, z, y) {
          a.g.position.set(x, y ?? 0, z);
          a.baseScale = a.g.scale.x;
          a.alive = true;
          a.ctx = ctx;
          if (a.vehicle) a.g._veh = a;
          warp(a.g, ctx, path, W.hAt);
          stage.dyn.add(a.g);
          stage.actors.push(a);
          return a;
        },
        despawn(a) {
          a.alive = false;
          a.g.parent?.remove(a.g);
          disposeTree(a.g);
          const i = stage.actors.indexOf(a);
          if (i >= 0) stage.actors.splice(i, 1);
        },
        toLocal(v) { const pr = path.project(v.x, v.z); v.x = pr.s - sc; v.z = pr.v; return v; },
        sfx: (name, ...args) => { if (!document.hidden && near()) sfx[name]?.(...args); },
        focus: (x, z, zoom = 0.6, hold = 2.5, prio = 1) => { const p = map(x, z); this._focus(ctx, p[0], p[1], zoom, hold, prio); },
        shake: (a) => { if (near() && !CALM) this.fx.shake(a); },
        slowmo: (scale, dur) => { if (near() && !CALM) this.slow = { scale, t: dur }; },
        flash: (color = '#fff', dur = 0.4) => {
          if (!near() || CALM) return; // no full-screen flashes for people who asked for reduced motion
          this.flashEl.style.background = color;
          this.flashEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur * 1000, easing: 'ease-out' });
        },
        news: (t) => hooks.onNews?.(t),
        incident: (k = 1) => hooks.onIncident?.(k),
        gagStart: (name, info) => {
          const g = { ctx, name, t0: this.time, stage: info && info.stage }; // info.stage = { r }: how far the crowd keeps clear while the gag holds the camera
          (ctx._gags ||= new Map()).set(name, g);
          this.gags.add(g);
          if (this.mode === 'follow' && ctx !== this.camCtx && ![...this.gags].some((q) => q.ctx === this.camCtx) && this.time - this.lastSwitch > 4) { this.camCtx = ctx; this.lastSwitch = this.time; this.idleT = 0; }
        },
        gagEnd: (name) => {
          const g = ctx._gags?.get(name);
          if (g) { this.gags.delete(g); ctx._gags.delete(name); }
          if (this.cine && this.cine.ctx === ctx && this.cine.name === name) this._cineEnd('release');
          if (this.cineSkip === name) this.cineSkip = null;
          if (this.curBeat && this.curBeat.ctx === ctx && this.curBeat.gag === name) this._beatClose();
          if (ctx._beatNow && ctx._beatNow.gag === name) ctx._beatNow = null;
        },
        /** Everyone and everything on stage, and where the trams are: traffic looks ahead with these. */
        /** Walkers of the city's crowd near x (this spot's street space), nearest first. */
        crowdNear: (x, r) => {
          const c = path.xz(sc + x, 0), reach = W.L.hw + W.L.bw + Math.max(W.L.swB, W.L.swF) + 3, out = [];
          for (const ag of stage.crowd.near(c[0], c[1], r + reach, PED)) { const q = path.project(ag.x, ag.z); if (Math.abs(q.s - sc - x) < r && q.d < reach) out.push([Math.abs(q.s - sc - x), ag]); }
          return out.sort((a, b) => a[0] - b[0]).map((q) => q[1]);
        },
        /** Turn a crowd walker into an actor of this spot: same clothes, same place, same way of walking. */
        promote: (ag) => {
          if (!ag || ag.dead) return null;
          const k = stage.crowd.take(ag), q = path.project(k.x, k.z), t = path.at(q.s, _f), wx = Math.sin(k.hd), wz = Math.cos(k.hd), along = wx * t.tx + wz * t.tz;
          const cl = k.look.cols, arch = k.look.kind === 'niffo' || k.look.kind === 'harry' ? k.look.kind : null; // archetype walkers keep their look (riders are never offered: near() is asked for walkers)
          const a = makePerson(crnd, { kind: arch || (k.look.kid ? 'kid' : 'civ'), scale: k.scale / PERSON_K, shirt: cl?.shirt ?? SHIRTS[k.look.shirt], pants: cl?.pants ?? PANTS[k.look.pants], skin: SKINS[k.look.skin], hair: cl?.hair ?? HAIRS[k.look.hair], hat: 'none' });
          a.look = k.look; a.walkSpeed = k.speed; a.dir = along >= 0 ? 1 : -1;
          a.exitX = a.dir > 0 ? L.x1 - 0.5 : L.x0 + 0.5;
          a.side = q.v >= 0 ? 1 : -1; a.wf = 0.5; a.lineZ = q.v; a.fixedZ = true;
          ctx.spawn(a, q.s - sc, q.v);
          a.face(Math.atan2(along, wx * -t.tz + wz * t.tx));
          return a;
        },
        /** Hand an actor back to the crowd where they stand. False if there is no pavement there (the caller lets them walk off). */
        demote: (a) => {
          if (!a.alive || !a.look || !stage.crowd) return false;
          const s = a.ctx.sc + a.g.position.x, c = path.xz(s, a.g.position.z), t = path.at(s, _f), h = a.heading;
          if (!stage.crowd.adopt(a.look, c[0], c[1], Math.atan2(t.tx * Math.sin(h) - t.tz * Math.cos(h), t.tz * Math.sin(h) + t.tx * Math.cos(h)))) return false;
          a.ctx.despawn(a);
          return true;
        },
        /** How much traffic is still on the road at this spot (gags wait for it to clear after closing the road). */
        trafficNear: () => { const c = path.xz(sc, 0); return stage.crowd ? stage.crowd.traffic(c[0], c[1], 24) : 0; },
        /** The director's camera for one gag (see _cam). */
        cam: (name) => this._cam(ctx, name),
        /** Dev: force a scene's coin flips, e.g. stage.force = { busted: true } (see `flip` in gags.js). */
        get force() { return stage.force || null; },
        /** A storyboard beat begins: `subs` is who or what the viewer must be able to see during it (see _beat). */
        beat: (gag, label, subs) => this._beat(ctx, gag, label, subs),
        cineBusy: () => !!this.cine && this.cine.ctx === ctx,
        /**
         * Is this street-space point (x along the street from the spot, z across, y up) inside the camera's picture, and is the camera
         * near enough (250 m) for that to matter? `margin` grows the frame when positive (0.08 = points just outside the edge still
         * count), shrinks it when negative. Cheap: one projection.
         */
        inView: (x, z, y = 1, margin = 0.08) => {
          const p = path.xz(sc + x, z), cam = this.camera;
          _v3.set(p[0], W.hAt(p[0], p[1]) + y, p[1]);
          if (cam.position.distanceToSquared(_v3) > 62500) return false;
          _v3.applyMatrix4(cam.matrixWorldInverse);
          if (_v3.z >= 0) return false; // behind the lens
          _v3.applyMatrix4(cam.projectionMatrix);
          const lim = 1 + margin;
          return Math.abs(_v3.x) <= lim && Math.abs(_v3.y) <= lim;
        },
        /** Is this spot what the viewer is looking at: the directed scene, the followed spot, or a free camera aimed within 60 m of it? */
        watched: () => {
          if (this.cine) return this.cine.ctx === ctx;
          if (this.mode === 'follow' || this.mode === 'drop') return this.camCtx === ctx;
          if (this.mode !== 'free') return false;
          const c0 = (ctx._c0 ||= path.xz(sc, 0));
          return Math.hypot(c0[0] - this.rig.tx, c0[1] - this.rig.tz) < 60;
        },
        /** How the crowd treats the stage while this spot's scene holds the camera: 'watch' (the default), 'flee' (explosion, chase)... No-op without the camera. */
        stageMode: (mode) => { const S = this._stage; if (S && S.ctx === ctx && S.mode !== mode) { S.mode = mode; this._pushStage(); } },
      };
      return ctx;
    };
    const amb = (this.amb = mk(ambientL(W), path.len / 2, 'amb'));
    this.locales = centres.map((sc, i) => mk(localeL(W, sc), sc, 'loc' + i));
    amb.locales = this.locales;
    for (const c of this.locales) c.amb = amb;
    this.ctx = this.camCtx = this.locales[0];

    // ---- the drop from the sky: from wherever the map was looking, at the height that shows the same view
    const from = typeof opts.from === 'function' ? opts.from() : opts.from;
    const mid = path.xz((path.sA + path.sB) / 2, 0);
    const d0 = clamp(from?.dist || 2600, 300, 60000), c0 = from?.lngLat ? W.toScene(from.lngLat[0], from.lngLat[1]) : mid;
    let V = opts.view || null;
    if (!V && opts.enter) {
      // taking over from the map while zooming in: same spot, same height, looking straight down with north up
      const p = W.toScene(opts.enter.lngLat[0], opts.enter.lngLat[1]), m = W.frame.M(p[0], p[1]);
      V = { m, gm: m, d: [0, -1], gd: [0, -1], el: TOP, gel: EL0, dist: opts.enter.dist, gdist: opts.enter.dist, ty: W.landY(p[0], p[1]) };
    }
    const dur = V ? 0 : CALM ? 0.01 : clamp(1.3 + 0.66 * Math.log(d0 / 65), 2.4, 5.2);
    this.cutK = undefined; this.roamT = 0; this._parkAt = null;
    if (V) {
      // the focus moved here from another street: the camera carries on from exactly where it was
      const F = W.frame, az = (d) => Math.atan2(d[0] * F.dx + d[1] * F.dy, d[0] * F.dy - d[1] * F.dx);
      const p = F.S(V.m[0], V.m[1]), q = F.S(V.gm[0], V.gm[1]);
      Object.assign(this.rig, { tx: p[0], tz: p[1], ty: V.ty, az: az(V.d), el: V.el, dist: V.dist, fov: FOV, roll: 0 });
      Object.assign(this.goal, { tx: q[0], tz: q[1], ty: V.ty, az: az(V.gd), el: V.gel, dist: V.gdist, fov: FOV, roll: 0 });
      this.drop = null;
      this.mode = 'free';
      this.cutEnd = 0; this.lastSwitch = 0; this.idleT = 0; this.autoFree = false;
      U.uGrow.value = 1;
      hooks.onMode?.('free');
    } else {
      this.drop = { t: 0, dur, d0, c0, y0: W.landY(c0[0], c0[1]) };
      this.mode = 'drop';
      this.cutEnd = dur + 30;
      this.lastSwitch = dur; this.idleT = 0; this.autoFree = true;
      U.uGrow.value = 0.02;
      Object.assign(this.rig, { tx: c0[0], tz: c0[1], ty: this.drop.y0, az: W.northAz, el: TOP, dist: d0, fov: FOV, roll: 0 });
    }

    startAmbient(amb);
    this.locales.forEach((c, i) => startLocale(c, i === 0
      ? { only: opts.only || null, delay: dur + 0.9, signature: true, withHeli: level >= 5 }
      : { delay: dur + rnd.range(6, 24), signature: rnd.chance(0.5) }));

    this._clouds(rnd, sky, mid);
    // the stork, The Hague's mascot, on a chimney near the action
    if (A.chimneys.length) {
      const m = path.xz(main, 0), c = A.chimneys.reduce((a, b) => ((b.x - m[0]) ** 2 + (b.z - m[1]) ** 2 < (a.x - m[0]) ** 2 + (a.z - m[1]) ** 2 ? b : a));
      const stork = makeBird(rnd, 'stork');
      stork.g.position.set(c.x, c.y + 0.3, c.z);
      stork.g.rotation.y = rnd.range(0, 6.28);
      const nest = sculpt((v) => { v.box(c.x, c.y, c.z, 1.1, 0.3, 1.1, '#9b7653', 0.1); v.box(c.x, c.y + 0.2, c.z, 0.8, 0.14, 0.8, '#7a5a3c'); });
      this.dyn.add(nest, stork.g);
      this.extras.push(stork);
    }
    this.running = true;
    this.last = performance.now();
    cancelAnimationFrame(this._raf); // never two loops at once
    this._raf = requestAnimationFrame(this._tick);
  }

  _clouds(rnd, sky, c0) {
    this.clouds = [];
    const mat = this._cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: lerp(0.92, 0.42, this.cur.nk), fog: false });
    for (let i = 0; i < 22; i++) {
      const v = new Vox(i + 20), n = rnd.int(4, 7), s = rnd.range(16, 34);
      for (let k = 0; k < n; k++) {
        const w = rnd.range(2.2, 3.6) * s, h = rnd.range(1.0, 2.0) * s;
        v.box((k * 1.5 - n * 0.75 + rnd.range(-0.4, 0.4)) * s, (Math.abs(k - n / 2) < 1.2 ? 0.5 : 0) * s + rnd.range(-0.2, 0.2) * s, rnd.range(-0.8, 0.8) * s, w, h, rnd.range(1.8, 3.0) * s, '#ffffff');
      }
      const m = v.mesh(mat, false, false);
      const r = rnd.range(380, 2600), a = rnd.range(0, 6.28);
      m.position.set(c0[0] + Math.cos(a) * r, rnd.range(700, 1600), c0[1] + Math.sin(a) * r);
      m.userData.v = rnd.range(4, 12) * rnd.sign();
      this.dyn.add(m);
      this.clouds.push(m);
    }
  }

  hide() {
    this._tok++;
    this.running = false;
    cancelAnimationFrame(this._raf);
    this._clearPointers?.();
    this.mode = 'idle';
    this._teardown();
    trimTiles(this.lite ? 6 : 24); // the map page is next: keep only the tiles a nearby street would reuse
    this.keys.clear();
  }
  /** Take the current street off the stage (the render loop and the input state are left alone). */
  _teardown(swap = false) {
    if (this.cine) { this.cine = null; this.hooks?.onCine?.(false); }
    if (this.leaveTo && !this.leaveTo.done) { this.leaveTo.done = true; this.leaveTo.resolve(); }
    this.leaveTo = null;
    if (this.runner) this.runner.clear();
    if (this.fx) { this.fx.dispose(); this.fx = null; }
    for (const p of this.pins) p.el.remove();
    this.pins = [];
    if (this.dyn) {
      disposeTree(this.dyn);
      this.scene.remove(this.dyn);
      this.dyn = null;
    }
    if (this.crowd) { this.scene.remove(this.crowd.group); this.crowd.dispose(); this.crowd = null; }
    // on a swap the next street's signs are already made and share the cache: only a full close clears it
    if (this.W) { this.scene.remove(this.W.group); this.W.dispose(); this.W = null; if (!swap) clearSigns(); }
    for (const l of this.lampLights) l.intensity = 0;
    this.actors = [];
    this.gags = new Set();
  }

  _focus(ctx, X, Z, zoom, hold, prio) {
    if (this.mode !== 'follow') return;
    const f = this.focusReq;
    if (ctx !== this.camCtx) {
      if (prio < 2) return;
      this.camCtx = ctx; this.lastSwitch = this.time; this.idleT = 0;
    } else if (prio < 2 && f && this.time < f.until + 2.2) return;
    if (f && this.time < f.until && f.prio > prio) return;
    this.focusReq = { X, Z, zoom, until: this.time + hold, prio };
  }

  // ------------------------------------------------------------ what the stage tells the city's crowd
  /** Someone in the crowd was knocked over by a car or a bike: the words, the sounds, and a line in the news if it was on this street. */
  _bonk(x, y, z, bike) {
    const W = this.W, q = W.path.project(x, z), here = q.d < 14 && q.s > W.path.sA && q.s < W.path.sB;
    const at = new THREE.Vector3(x, y + 2.2, z), close = Math.hypot(x - this.rig.tx, z - this.rig.tz) < Math.max(70, this.rig.dist);
    if (close) {
      this.fx.text(bike ? 'BOINK!' : 'BONK!', at, { size: 20, color: '#ffd166' });
      if (!document.hidden) sfx.bonk?.();
      if (!CALM) this.fx.shake(bike ? 0.15 : 0.3);
      this.runner.run((function* () {
        yield* wait(0.85);
        this.fx?.text('★ ★ ★', at, { size: 13, color: '#ffe066', dur: 1.5 });
        yield* wait(1.6);
        this.fx?.text(['HÉ!', 'KIJK UIT!', 'ASO!', 'MIJN BROEK!', 'ZAG JE ME NIET?!'][Math.floor(Math.random() * 5)], at, { size: 13, color: '#ff6b6b' });
        if (!document.hidden) sfx.hey?.();
      }).call(this));
    }
    if (here) {
      const name = W.st.name, lines = bike
        ? [`Cyclist and jaywalker meet on ${name}. Both blame the other`, `Bell rung too late on ${name}. Dignity lightly dented`]
        : [`Jaywalker bonked on ${name}. Walks it off`, `Driver on ${name}: "came out of nowhere". Pedestrian: "came out of a shop"`, `Bumper meets trousers on ${name}. Trousers lodge complaint`];
      this.hooks.onIncident?.(1);
      this.hooks.onNews?.(lines[Math.floor(Math.random() * lines.length)]);
    }
  }
  /** Every frame: who is on stage (the crowd walks and drives round them) and which stretches of road a gag has closed. */
  _brief() {
    const C = this.crowd, B = C.blockers, Z = C.zones, path = this.W.path;
    B.length = 0; Z.length = 0;
    for (const a of this.actors) {
      if (!a.alive || a.air || a.fly) continue;
      const e = a.g.matrixWorld.elements; // where it was drawn last frame
      B.push({ x: e[12], z: e[14], r: a.vehicle ? Math.max(1, (a.len || 2) / 2) : 0.35 });
    }
    for (const c of this.locales) if (c.road && c.road.closed > 0) { const p = path.xz(c.sc, 0); Z.push({ x: p[0], z: p[1], r: 26 }); }
    if ((this.pruneT -= 0.016) <= 0) { this.pruneT = 2; C.prune(this.W.stream.live); }
  }

  // ------------------------------------------------------------ "something is happening over there" pins
  _pins() {
    const show = this.mode === 'free';
    const live = show ? this.locales.filter((c) => [...this.gags].some((g) => g.ctx === c)) : [];
    while (this.pins.length < live.length) {
      const el = document.createElement('button');
      el.className = 'gag-pin';
      el.setAttribute('aria-label', 'Jump to the action');
      el.innerHTML = '<span>!</span>';
      const pin = { el, ctx: null };
      el.addEventListener('click', () => { if (pin.ctx) { this.flyTo(pin.ctx); this.hooks.onPin?.(); } });
      this.overlay.appendChild(el);
      this.pins.push(pin);
    }
    const w = this.overlay.clientWidth, h = this.overlay.clientHeight;
    this.pins.forEach((pin, i) => {
      const c = live[i];
      pin.ctx = c || null;
      if (!c) { pin.el.hidden = true; return; }
      const p = this.W.path.xz(c.sc, 0);
      _v.set(p[0], 5 + this.W.landY(p[0], p[1]), p[1]).project(this.camera);
      const behind = _v.z > 1;
      let x = behind ? -_v.x : _v.x, y = behind ? -1 : _v.y;
      const off = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.86;
      const close = !off && Math.hypot(p[0] - this.rig.tx, p[1] - this.rig.tz) < this.rig.dist * 0.5 && this.rig.dist < 160;
      pin.el.hidden = close;
      x = clamp(x, -0.9, 0.9); y = clamp(y, -0.7, 0.82);
      pin.el.classList.toggle('edge', off);
      pin.el.style.transform = `translate(${((x + 1) / 2) * w}px, ${((1 - y) / 2) * h}px)`;
    });
  }

  // ------------------------------------------------------------ frame
  _frame(now) {
    const real = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    if (this.slow) { this.slow.t -= real; if (this.slow.t <= 0) this.slow = null; }
    const target = this.slow ? this.slow.scale : 1;
    this.timeScale += (target - this.timeScale) * Math.min(1, real * 14);
    const dt = real * this.timeScale * (this.debugSpeed || 1);
    this.time += dt;
    const W = this.W, r = this.rig, g = this.goal;

    this.runner.update(dt);
    for (let i = this.actors.length - 1; i >= 0; i--) this.actors[i].update(dt);
    for (const e of this.extras) e.update(dt);
    this.fx.update(dt);
    for (const c of this.clouds) c.position.x += c.userData.v * dt;

    // ---- camera
    let shotOn = false, shotBlocked = false, snapCut = false;
    if (this.mode === 'drop') {
      const D = this.drop;
      if (!this.hold) D.t += real * (this.debugSpeed || 1);
      const e = clamp(D.t / D.dur), v = this._view(this.camCtx);
      r.dist = Math.exp(lerp(Math.log(D.d0), Math.log(v.dist), sm(e))) * (1 - 0.08 * Math.sin(Math.PI * clamp((e - 0.8) / 0.2)));
      r.el = lerp(TOP, v.el, sm(clamp((e - 0.3) / 0.7)));
      r.az = W.northAz + angDiff(W.northAz, v.az) * sm(clamp((e - 0.12) / 0.8));
      const k = sm(Math.min(1, e * 1.3)); // be over the street a little before landing
      r.tx = lerp(D.c0[0], v.tx, k); r.tz = lerp(D.c0[1], v.tz, k); r.ty = lerp(D.y0, v.ty, sm(e));
      U.uGrow.value = 0.02 + 0.98 * ease.outBack(clamp((e - 0.5) / 0.4));
      if (e > 0.55 && !D.whoosh) { D.whoosh = true; if (!document.hidden) sfx.whoosh?.(); }
      if (e >= 1) {
        U.uGrow.value = 1;
        this.mode = 'follow';
        Object.assign(g, v);
        if (!CALM) this.fx.shake(0.22);
        if (!document.hidden) sfx.thud?.();
        this.hooks.onMode?.('follow');
      }
    } else if (this.mode === 'leave') {
      const Lv = this.leaveTo;
      Lv.t += real;
      const e = clamp(Lv.t / Lv.dur);
      r.dist = Math.exp(lerp(Math.log(Lv.d0), Math.log(Lv.d1), sm(e)));
      r.el = lerp(Lv.el0, TOP, sm(clamp(e / 0.75)));
      r.az = Lv.az0 + angDiff(Lv.az0, W.northAz) * sm(clamp(e / 0.85));
      r.ty += (W.landY(r.tx, r.tz) - r.ty) * Math.min(1, real * 4);
      r.fov = FOV; r.roll = 0;
      U.uGrow.value = 1 - 0.98 * sm(clamp((e - 0.3) / 0.55));
      if (e >= 1 && !Lv.done) { Lv.done = true; Lv.resolve(); }
    } else {
      U.uGrow.value = 1;
      this._keys(real);
      let rate = this.mode === 'free' ? 10 : 3.2, rateT = rate, snap = false;
      if (this.mode === 'follow') {
        const busy = [...this.gags].some((q) => q.ctx === this.camCtx);
        this.idleT = busy ? 0 : this.idleT + real;
        if (this.idleT > 3 && this.time - this.lastSwitch > 5 && !this.cine) {
          let nb = null;
          for (const q of this.gags) if (q.ctx !== this.camCtx && (!nb || q.t0 > nb.t0)) nb = q;
          if (nb) { this.camCtx = nb.ctx; this.lastSwitch = this.time; this.idleT = 0; this.focusReq = null; }
        }
        Object.assign(g, this._view(this.camCtx));
        g.az += Math.sin(this.time * 0.22) * 0.04;
        let c = this.cine;
        if (c && c.spec) {
          if (c.pending && this.time >= c.pendAt) this._startShot(c, c.pending, this.time - c.pendReq); // the shot that had to wait for the minimum length
          else if (this.time > c.touched + Math.max(SAFETY, c.spec.hold || 0)) {
            // the only way a shot ever ends by itself: a scene that hangs
            console.warn('[stage] "' + c.name + '" asked for nothing new for ' + SAFETY + ' s: camera released');
            this._stat('expired'); this._cineEnd(); c = null;
          }
        }
        // a shot whose subjects have gone keeps its last picture rather than cutting away
        let sg = null;
        if (c && c.spec) { sg = this._shotGoal(c); if (sg) c.lastGoal = { ...sg }; else if (c.lastGoal) sg = { ...c.lastGoal }; }
        if (this.audit && this.auditOnly && !sg) { // seconds in which the scene holds the camera but the picture is not one of its shots
          const gg = this.camCtx._gags && this.camCtx._gags.get(this.auditOnly);
          if (gg && this._shotsSeen) this._stat('offShot', real);
        }
        if (sg) {
          // a directed shot: cut to it (or glide), then keep the subject framed
          let view = sg;
          if (c.fresh) {
            c.fresh = false; c.age = 0; c.azFix = 0; c.elFix = 0; c.azMir = 0; c.badT = c.goodT = c.blkNow = c.clrNow = 0; c.noRe = this.time; c.high = c.duck = false;
            c.glide = typeof c.spec.cut === 'number' ? Math.max(0.1, c.spec.cut) : 0;
            const bn = c.ctx._beatNow, notes = [];
            this._shotSubs = [].concat(c.spec.on, c.spec.from || [], bn && bn.gag === c.name ? bn.subs : []);
            // across the line the last shot drew between two characters? then swing over to its side
            if (this._mirror(c, sg)) { c.fitInit = false; sg = this._shotGoal(c) || sg; notes.push('mirror'); }
            // Something in the way? Decide ONCE where to stand: nothing at all in the picture's way (walls, parked cars, bins,
            // racks, trunks, parasols, lamps), swinging round and then rising a little; failing that, clear of walls; failing
            // that, watch from higher up. The decision stays until the next shot (or the one reconsideration, see below).
            const st = this._stand(c, sg);
            sg = st.sg; c.high = st.high;
            if (st.moved) notes.push('stand');
            if (c.high) notes.push('high');
            if (notes.length) this._stat('stands');
            // the same subject from nearly the same place is no cut, it is a move: glide
            const a = c.prev && c.prev.view;
            if (!c.glide && a && Math.abs(angDiff(a.az, sg.az)) < SAME_AZ && Math.abs(sg.dist / a.dist - 1) < SAME_DIST && Math.hypot(sg.tx - a.tx, sg.tz - a.tz) < 3) { c.glide = 0.6; notes.push('glide'); }
            snap = !c.glide;
            c.glideEnd = c.glide ? this.time + c.glide * 1.6 : 0; c.glideRate = c.glide ? 3.4 / c.glide : 0;
            this._shotOpen(c, { glide: !!c.glide, deferred: +(c.deferred || 0).toFixed(2), stand: notes.join(',') }); this._shotsSeen = true;
            view = sg;
          } else {
            // The live sight line is only watched, not chased: when it stays blocked a while the stand is reconsidered once, with a
            // glide, and then left alone for a couple of seconds (the same goes for coming back down from the high view).
            const raw = this._clear(sg);
            // (a sight line that flickers still counts: the time it is clear only pays back at half speed)
            if (!c.high) c.badT = raw ? Math.max(0, c.badT - real * 0.5) : c.badT + real; else c.goodT = raw ? c.goodT + real : Math.max(0, c.goodT - real * 0.5);
            // the cutaway ducks the buildings on the camera's side as soon as the view is really blocked (0.2 s) and stands them up
            // again only after a second of clear view: no ducking and rising in step with a passing wall
            if (raw) { c.clrNow += real; c.blkNow = 0; } else { c.blkNow += real; c.clrNow = 0; }
            if (!raw && c.blkNow > 0.2 && !c.duck) { c.duck = true; this._stat('ducks'); } else if (c.clrNow > 1 && c.duck) { c.duck = false; this._stat('ducks'); }
            if (this.time >= c.noRe && ((!c.high && c.badT > BLOCKED_FOR) || (c.high && c.goodT > RECLEAR_FOR))) {
              let note;
              if (c.high) { c.high = false; note = 'down'; }
              else { const bn = c.ctx._beatNow; this._shotSubs = [].concat(c.spec.on, c.spec.from || [], bn && bn.gag === c.name ? bn.subs : []); const st = this._stand(c, sg); c.high = st.high; sg = view = st.sg; note = st.high ? 'high' : st.moved ? 'restand' : 'same'; }
              c.badT = c.goodT = 0; c.duck = c.high; c.noRe = this.time + RECONSIDER;
              c.glideEnd = this.time + RESTAND_GLIDE * 1.6; c.glideRate = 3.4 / RESTAND_GLIDE;
              this._stat('fallbacks'); this._shotNote(note);
            }
          }
          // the cutaway (buildings ducking) follows the stand decision, not the passing sight line
          shotBlocked = c.high || c.duck;
          shotOn = !shotBlocked;
          Object.assign(g, view);
          // nothing clear at eye level: watch from higher up, over the flattened buildings, like the normal street view
          if (c.high) { g.el = Math.max(g.el, 0.56); g.dist = Math.max(g.dist, 17); g.roll = 0; }
          c.view = { tx: view.tx, tz: view.tz, az: view.az, dist: view.dist };
          if (c.pair) { const p = c.pairPos, ce2 = Math.cos(view.el); c.side = this._side(p[0], p[1], p[2], p[3], view.tx + Math.sin(view.az) * ce2 * view.dist, view.tz + Math.cos(view.az) * ce2 * view.dist); } else c.side = 0;
          c.age += real;
          if (this.time < c.glideEnd) rate = rateT = c.glideRate; else { rate = 5; rateT = 11; }
          this._wasShot = true;
        } else {
          if (this._wasShot) { this._wasShot = false; snap = true; } // cut back to the wide view
          const f = this.focusReq;
          if (f && this.time < f.until) { g.tx = lerp(g.tx, f.X, 0.85); g.tz = lerp(g.tz, f.Z, 0.85); g.dist *= f.zoom; g.ty += 0.5; g.el += 0.1; }
          else if (this.time > this.cutEnd && !this.only && !this.cine) this._setMode('free');
        }
      } else {
        g.ty = W.landY(g.tx, g.tz) + 1.5; g.fov = FOV; g.roll = 0;
      }
      // high up, the free camera turns to look straight down with north up: the same view as the map it hands over to
      let gel = g.el, gaz = g.az;
      if (this.mode === 'free') gel = lerp(g.el, TOP, sm(clamp((r.dist - 1500) / 1100)));
      this.viewEl = gel;
      if (snap) { r.tx = g.tx; r.tz = g.tz; r.ty = g.ty; r.az = gaz; r.el = gel; r.dist = g.dist; r.fov = g.fov; r.roll = g.roll; }
      else {
        const k = 1 - Math.exp(-real * rate), kt = 1 - Math.exp(-real * rateT);
        r.tx += (g.tx - r.tx) * kt; r.tz += (g.tz - r.tz) * kt; r.ty += (g.ty - r.ty) * kt;
        r.az += angDiff(r.az, gaz) * k; r.el += (gel - r.el) * k;
        r.dist *= Math.pow(g.dist / r.dist, k);
        r.fov += ((g.fov || FOV) - r.fov) * k; r.roll += ((g.roll || 0) - r.roll) * k;
      }
      snapCut = snap;
      if (this.mode === 'free' && r.dist >= EXIT && !this.exiting) { this.exiting = true; this.hooks.onExit?.(); }
      if (this.mode === 'free' && !this.exiting && this.hooks.onRoam && (this.roamT -= real) <= 0) {
        this.roamT = 0.25;
        const pr = W.path.project(r.tx, r.tz);
        // how far the camera's target is from the street that is open (leaving it past either end counts too)
        this.hooks.onRoam({ lngLat: W.toLngLat(r.tx, r.tz), dist: r.dist, off: pr.d + Math.max(0, W.path.sA - pr.s, pr.s - W.path.sB) });
      }
    }
    const sh = this.fx.shakeAmt * Math.max(1, r.dist / 70), ce = Math.cos(r.el);
    const tx = r.tx + (Math.random() - 0.5) * sh, ty = r.ty + (Math.random() - 0.5) * sh, tz = r.tz + (Math.random() - 0.5) * sh;
    // Shots are framed for a wide picture. On a tall, narrow screen (a phone held upright) the same shot would cut
    // its subjects off left and right: stand further back and widen the lens until the same width of street fits.
    const needA = this.cine && this.mode === 'follow' ? aspNeed(this.camera.aspect) : 1;
    this.aspK = snapCut || this.aspK === undefined ? needA : this.aspK + (needA - this.aspK) * Math.min(1, real * 6);
    const aK = Math.sqrt(this.aspK), camD = r.dist * aK;
    const cx = tx + camD * Math.sin(r.az) * ce, cz = tz + camD * Math.cos(r.az) * ce;
    let cy = ty + camD * Math.sin(r.el);
    if (r.dist < 80) cy = Math.max(cy, W.landY(cx, cz) + 0.35); // never under the ground
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(tx, ty, tz);
    if (r.roll) this.camera.rotateZ(r.roll);
    // cutscenes fill the whole frame (no letterbox): the lens is the shot's own, widened only on a narrow screen
    this.camera.fov = aK > 1.001 ? (2 * Math.atan(Math.tan((r.fov * Math.PI) / 360) * aK) * 180) / Math.PI : r.fov;
    this.camera.near = clamp(r.dist * 0.04, 0.2, 80);
    this.camera.far = r.dist * 7 + 9000;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this._skyFrame(real);
    this.scene.fog.near = r.dist * 1.6 + 180;
    this.scene.fog.far = r.dist * 7 + 2400;
    this.fx.zoom = r.dist;
    W.lod(r.tx, r.tz, r.dist, this.mode !== 'drop' && this.mode !== 'leave', r.az, this.mode);
    this._brief();
    this.crowd.update(dt, r.tx, r.tz, r.dist);

    // ---- things in the way duck; shadows follow the camera
    U.uFocus.value.set(r.tx, 0, r.tz);
    U.uCamDir.value.set(Math.sin(r.az), Math.cos(r.az));
    U.uTan.value = Math.tan(clamp(r.el, 0.1, 1.45));
    U.uR.value = shotOn ? r.dist * 0.3 + 3 : r.dist * 0.6 + 20; // a directed shot only clears its own sight line
    U.uHalf.value = shotBlocked ? 0 : 0.5; // ...unless something is in the way: then everything on the camera's side of the subject ducks
    // The cutaway is only for watching the street from close by. It fades out as the camera climbs, and when the
    // camera wanders off the street there is nothing to keep in view, so everything stands up again.
    let need = clamp((1.3 - r.el) / 0.15) * clamp((190 - r.dist) / 80);
    if (need > 0 && this.mode === 'free') need *= clamp((46 - W.path.project(r.tx, r.tz).d) / 26);
    if (shotOn || shotBlocked) need = Math.max(need, clamp((1.3 - r.el) / 0.15));
    this.cutK = snapCut ? need : (this.cutK ?? need) + (need - (this.cutK ?? need)) * (1 - Math.exp(-real * 6));
    U.uCut.value = this.cutK < 0.004 ? 0 : this.cutK;
    for (const s of W.signs) s.m.visible = U.uGrow.value > 0.9 && cutWeight(s.x, s.z) < 0.5;
    const half = clamp(r.dist * 0.55, 45, 260), sc = this.sun.shadow.camera;
    this.sun.castShadow = r.dist < 1300;
    if (Math.abs(half - (this._half || 0)) > half * 0.06) {
      this._half = half;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = half * 4 + 200;
      sc.updateProjectionMatrix();
      this.sun.shadow.normalBias = (half / 1024) * 1.4;
    }
    this.sun.target.position.set(r.tx, r.ty, r.tz);
    this.sun.position.set(r.tx + this.sunDir.x * (half * 1.7 + 60), r.ty + this.sunDir.y * (half * 1.7 + 60), r.tz + this.sunDir.z * (half * 1.7 + 60));
    // the lamps nearest to what the camera looks at: they wash the walls and the people near them (see U.uLampA) and the five nearest also really light things
    this.lampT -= real;
    if (this.lampT < 0) {
      this.lampT = 0.3;
      const n = this.cur.nk > 0.02 && r.dist < 420 ? this.crowd.lampSet(U.uLampA.value, r.tx, r.tz, this.lite ? 12 : 24, 80) : 0;
      U.uLampN.value = n; U.uLampR.value = n ? this.crowd.lampReach : 60;
      this.lampLights.forEach((pl, i) => { const a = i < n && r.dist < 260 ? U.uLampA.value[i] : null; pl.userData.base = a ? 26 : 0; if (a) pl.position.set(a.x, a.y - 0.4, a.z); });
    }
    for (const pl of this.lampLights) pl.intensity = pl.userData.base * this.cur.nk;
    U.uTime.value = (performance.now() / 1000) % 1000;
    this._pins();
    if (this.audit) this._beatTick();
    this.renderer.render(this.scene, this.camera);
  }
}
export { preload };
