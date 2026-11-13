// The stage: renderer, lights, the camera (sky drop → follow the action → free roam) and the
// contexts handed to gag scripts. Gag scripts think in "street space" (x along the street, z across it);
// every object they place is bent onto the real street here.
import * as THREE from 'three';
import { makeRng, hashStr, Runner, ease, clamp, lerp, clearSigns, wait, disposeTree } from './kit.js';
import { buildWorld, preload, U, cutWeight, cutLimit, setMaxTexture, trimTiles, tileOf, LAMP_KIND, lensGuard, duckAt, streetNear } from './world.js';
import { localeL, ambientL } from './street.js';
import { Fx, fadeOut } from './fx.js';
import { startAmbient, startLocale, mixFor, playGag, GAG_NAMES } from './gags.js';
import { makePerson, makeDog, makeCat, makeBird, item, PERSON_K, SKINS, SHIRTS, PANTS, HAIRS } from './cast.js';
import { litShare, makeCar, makeBike, makeScooter, makeFatbike, makeHeli, makeBoat } from './props.js';
import { Crowd, PED } from './crowd.js';
import { spotAt } from './districts.js';
import { Overhead } from './overhead.js';
import { Walker } from './walker.js';
import { FURN as STREET_FURN } from './setting.js';
import { PERSON as G_PERSON, WHEEL as G_WHEEL, ALL as G_ALL } from './ground.js';
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
// the elevations the viewer can tilt the free camera between
const EL_LO = 0.16, EL_HI = 1.5;
/**
 * A camera value the viewer changes, kept within [lo, hi], but never pushed further than it already is: a cutscene shot taken over
 * at 8 m (or from below 0.16) stays as it is, zooming in from there does not throw the camera back to the 20 m limit, and the
 * viewer can still move it back into the range.
 */
const lim = (v, lo, hi, was) => clamp(v, Math.min(lo, was), Math.max(hi, was));
const sm = (x) => x * x * (3 - 2 * x);
const angDiff = (a, b) => { const d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };
const _col = new THREE.Color(), _W = new THREE.Matrix4(), _T = new THREE.Matrix4(), _f = {}, _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
/** The director's camera rules (see _cam and the follow branch of _frame). Seconds unless noted. */
const MIN_SHOT = 0.9;      // a new shot waits until the last cut is this old (unless `quick`, or it glides)
const SAFETY = 20;         // a scene that asks for nothing new for this long loses the camera (once, with a warning)
const STAGE_R = 15;        // metres the crowd keeps clear around the scene that holds the camera
// a "!" pin is fully there while its spot is within PIN_FULL metres of the point the camera looks at, fades evenly, and is gone at PIN_GONE
const PIN_FULL = 150, PIN_GONE = 300;
// A pin laid out at the bottom right must not sit on the Walk button (a press there would start a walk instead). The button's box as
// style.css lays it out (#btn-walk: right 16, bottom 116 on wide screens; right 8, bottom 118 at max-width 760 px), a little larger
// than it is drawn, and the pin's own reach (18 px radius and its shadow): a pin whose disc would reach into the box is lifted above it.
const PIN_R = 22, PIN_NARROW = 760;
const WALK_BOX = { wide: { right: 16, bottom: 116, w: 100, h: 46 }, narrow: { right: 8, bottom: 114, w: 92, h: 50 } };
// m: pressing a pin brings the camera this close to the spot if it is further away (a wide view of one spot, about the street's own
// viewing distance on a wide screen; see flyTo)
const PIN_VIEW = 80;
// the on-screen turn pad: one step is PAD_AZ radians of turn (15 degrees) or PAD_EL of tilt; held with reduced motion, a step every PAD_REPEAT s
const PAD_AZ = 0.26, PAD_EL = 0.12, PAD_REPEAT = 0.35;
// two fingers on the canvas do ONE thing per touch, decided once a finger has moved GESTURE_PX: spread or twist = zoom and turn
// together, both moving up or down = tilt, both moving the same way otherwise = pan
const GESTURE_PX = 10;
// the camera keys, by the key's meaning (so Q is Q on any keyboard layout); a held key is remembered by its physical key (e.code),
// so a key let go after Shift was pressed or released (= then +, - then _) is still let go
const KEY_ACT = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', q: 'turnL', e: 'turnR', r: 'tiltU', f: 'tiltD', '+': 'in', '=': 'in', '-': 'out', _: 'out' };
const BLOCKED_FOR = 0.7;   // the sight line must stay blocked this long before the stand is reconsidered (once)
const RECLEAR_FOR = 1.0;   // ...and clear this long before the high fallback is left again
const RECONSIDER = 2;      // after any such decision: no new one for this long
const RESTAND_GLIDE = 0.5; // the move to the new stand takes about this long
const SAME_AZ = 0.52, SAME_DIST = 0.3; // 'nearly the same shot': within 30 degrees and 30% of the distance
// the walking character (walker.js, mode 'walk'): the camera's distance and tilt when he is dropped (the viewer's own are kept when
// they are within these ranges), the height over his feet it aims at, how long a drop may wait for the ground to be ready, how far
// from the point looked at he may be put, and the height above which the camera first comes down to him
const WALK_DIST = 20, WALK_D = [20, 60], WALK_EL = 0.35, WALK_E = [0.2, 0.9], WALK_AIM = 1.1, WALK_WAIT = 6, WALK_REACH = 8, WALK_HIGH = 300;


// (disposeTree, which frees the GPU buffers of an object that has left the scene for good, lives in kit.js)
const CALM = matchMedia('(prefers-reduced-motion: reduce)').matches;
/**
 * How much more of the street a cutscene shot takes in on a screen narrower than the wide picture it was framed for
 * (1 = as framed). Deliberately less than the full difference: on a phone held upright people stay a decent size, and
 * the beat guarantee (_fitBeat) backs the camera off further only when somebody would actually be cut off.
 */
const aspNeed = (asp) => clamp(Math.pow(1.55 / asp, 0.6), 1, 2.4);
/** Street furniture as the camera sees it: [height, radius] in metres (see _clear). The numbers are the ones of setting.js's
 * FURN table; the camera knows these kinds only (any other kind of prop counts as a bin, see _clear). */
const FURN = Object.fromEntries(['bench', 'bin', 'box', 'mailbox', 'parasol', 'rack', 'sign', 'stall', 'stop', 'terrace', 'mstall',
  'kiosk', 'picnic', 'orac', 'column', 'mupi', 'meter', 'charger', 'trolleys', 'rackpark', 'mast', 'tlight', 'lamp', 'statue', 'fountain', 'planter'].map((k) => [k, STREET_FURN[k]]));
/** Furniture the camera must never stand under or inside (parasols, market stalls, kiosks): see _clear. */
const TALL = new Set(['terrace', 'mstall', 'kiosk', 'parasol']);

let _wT = 0; // the stage's clock, for easing heights in warp (set at the start of every frame)
/** Make an object live in a context's street space: its position is (x along, y up, z across) from that spot. */
const SOFT_REACH = 600; // m: how far the focus-shift tests of ambient life look (the overhead's SEE_FAR: beyond it a bird is under a pixel)
/**
 * An ambient actor drawn arriving at where its script has put it, without touching the script: what it shows is moved into a child
 * group, which starts offset and glides home. The offset is d metres along the street (side -1 / +1; a bird also 8 m up), kept in the
 * street's axes and turned into the actor's own every frame, so the actor may turn meanwhile. 'air': a bird flaps (a.flap) and comes
 * in at landBird's 7.5 m/s (at least 1.6 s); 'boat': it catches up (ease out over d / 2.6 s, 3-10 s). Ends early if the actor is retired.
 */
function arrival(a, kind, d, side = 1) {
  const g = a.g;
  if (!g || a._wrap) return null;
  const wr = (a._wrap = new THREE.Group());
  while (g.children.length) wr.add(g.children[0]);
  g.add(wr);
  const T = kind === 'boat' ? clamp(d / 2.6, 3, 10) : Math.max(1.6, d / 7.5), up = kind === 'boat' ? 0 : 8;
  const at = (u) => {
    // street-axes offset (dx along, up), into the actor's own turned and scaled axes as it stands now
    const e = (1 - u) * (1 - u), dx = side * d * e, k = 1 / (g.scale.x || 1), c = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y);
    wr.position.set(dx * c * k, up * e * k, dx * sn * k);
  };
  at(0);
  if (kind !== 'boat') a.flap = true;
  return (function* () {
    let t = 0;
    while (t < T && a.alive && !a._left) { t += yield; at(Math.min(1, t / T)); }
    wr.position.set(0, 0, 0);
    a.flap = false;
  })();
}

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
    const V = this._veh, G = ctx.W && ctx.W.ground;
    let Y;
    if (V && V.len) {
      // a long vehicle sits on the highest ground under its axles and sides, so a kerb step or a slope never buries a wheel
      // (W.ground for a wheel: a rail bar counts as the road it lies in, so a car crossing tram tracks is not lifted onto one corner)
      const h = this.rotation.y, sh = Math.sin(h), ch = Math.cos(h), fx = _f.tx * sh - _f.tz * ch, fz = _f.tz * sh + _f.tx * ch, a = V.len * 0.36, w = (V.wid || 1.8) * 0.42;
      Y = G ? -Infinity : hAt(X, Z);
      for (const k of [-1, 1]) for (const q of [-1, 1]) { const px = X + fx * a * k - fz * w * q, pz = Z + fz * a * k + fx * w * q; Y = Math.max(Y, G ? G.at(px, pz, 0, G_WHEEL, G_ALL) : hAt(px, pz)); }
    } else {
      Y = hAt(X, Z);
      if (this._feet && G) {
        // a person: the highest ground under the corners of the two shoes (x +-0.36, z -0.17..0.27 in the figure's units), turned with it
        const h = this.rotation.y, sh = Math.sin(h), ch = Math.cos(h), fx = _f.tx * sh - _f.tz * ch, fz = _f.tz * sh + _f.tx * ch, sc = this.scale.x;
        for (let k = 0; k < 4; k++) { const lx = (k & 1 ? 0.36 : -0.36) * sc, lz = (k & 2 ? 0.27 : -0.17) * sc; Y = Math.max(Y, G.at(X + fx * lz + fz * lx, Z + fz * lz - fx * lx, 0, G_PERSON, G_ALL)); }
      }
    }
    if (V || this._feet) {
      // eased on the stage's clock (a step onto a kerb is quick, a step down a little slower); a jump of more than 1.5 m is not eased
      if (this._gy !== undefined && Math.hypot(X - this._gx, Z - this._gz) < 1.5) { const dt = Math.min(0.1, Math.max(0, _wT - this._gt)); Y = this._gy + clamp(Y - this._gy, -2.5 * dt, 4 * dt); }
      this._gy = Y; this._gx = X; this._gz = Z; this._gt = _wT;
    }
    _W.setPosition(X, Y, Z); // it stands (or floats) on whatever is there
    _W.multiply(_T.makeTranslation(-ax, 0, -az));
    this.matrix.premultiply(_W);
    this.matrixWorldNeedsUpdate = true;
  };
}

// ---- warm-up: the programs of what scenes bring on (people, animals, vehicles, items), compiled once for the page after the
// first drop has landed, so a scene's first frames do not link them. One object is made per frame (one per fourth frame on a
// phone), never while a cutscene holds the camera; then `compileAsync` (KHR_parallel_shader_compile: it does not block) runs
// over them with the scene's own lights, so the program keys are the ones the frames will ask for (the sun casts its shadow by
// then). The objects are never shown and are kept for the page: a kept material keeps its program.
const ZOO = [
  (r) => makePerson(r, { kind: 'civ' }).g, (r) => makePerson(r, { kind: 'cop' }).g, (r) => makePerson(r, { kind: 'kid' }).g,
  (r) => makeCar(r, 'car').g, (r) => makeCar(r, 'police').g, (r) => makeCar(r, 'van').g,
  (r) => makeBike(r).g, (r) => makeScooter(r).g, (r) => makeFatbike(r).g, (r) => makeHeli().g, (r) => makeBoat(r).g,
  (r) => makeDog(r).g, (r) => makeCat(r).g, (r) => makeBird(r, 'gull').g, (r) => makeBird(r, 'pigeon').g, (r) => makeBird(r, 'stork').g,
  () => { const g = new THREE.Group(); for (const f of Object.values(item)) { try { const o = f(); if (o && o.isObject3D) g.add(o); } catch (e) { /* an item that needs arguments */ } } return g; },
];
const _zoo = new THREE.Group();
let _zooAt = 0, _zooDone = false, _zooTick = 0;
const _zooRnd = makeRng(97);

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
    this.keys = new Map(); // held camera keys: physical key (e.code) -> what it does (see KEY_ACT)
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
  // The camera rule: who may write the camera, by mode.
  //   drop    the drop from the map, until the viewer touches the camera (see _take)
  //   follow  the director: the spot with the newest scene, its shots (_cam), its punchlines (_focus). Scenes get the camera in
  //           this mode only: every request they make is gated on mode === 'follow' (can() in _cam, _focus, gagStart)
  //   free    the viewer, and nothing else that moves the view: a pin the viewer pressed (flyTo), the frame change of a focus
  //           shift (exact, in map terms), the straight-down look high up, the rise to the map (leave)
  //   leave   the rise to the map
  // Once the viewer has touched the camera it stays theirs: only follow() (the Follow the action button) puts it back in follow.
  // Nothing goes from free to follow by itself; the only automatic change is the other way (a follow with nothing left to show).
  //   walk    the viewer's too, with the walking character (walker.js) on the street: the camera looks at him (its target follows
  //           him); the viewer turns, tilts and zooms it as in free, a drag turns it (there is nothing to pan), the movement keys and
  //           the on-screen stick move him. Not being 'follow', the director is locked out of it as out of free. Everything free does
  //           for the viewer (lens guard, cutaway, aim height, the look straight down high up, the way out to the map, the focus
  //           shift: _own) counts for walk too; a focus shift keeps it (_begin). Follow the action from walk ends the walk.
  /** The viewer gives camera input: from here on the camera is theirs. False when input cannot act now. */
  _take() {
    if (!this.W || this.mode === 'leave' || this.exiting) return false;
    if (this.mode === 'drop') {
      // still high up (a map click drops from as far as the map was) or not falling yet: the input itself is ignored, since taking
      // the camera up there would cross the height that hands back to the map, but the drop lands in free instead of follow
      if (this.hold || this.rig.dist >= EXIT * 0.9) { if (!this.landFree) { this.landFree = true; this.hooks.onMode?.('drop'); } return false; } // (the page repaints Follow)
      this._land(false);
    } else if (this.mode === 'follow') this._setMode('free', true);
    return true;
  }
  /** Whether the camera is (or, during the drop, will be) following the action: the Follow button shows it pressed. */
  get following() { return this.mode === 'follow' || (this.mode === 'drop' && !this.landFree); }
  /** The camera is the viewer's: free, or walk (the walking character's). */
  get _own() { return this.mode === 'free' || this.mode === 'walk'; }
  /** The Follow button pressed while following: stop following, the camera stays exactly where it is. */
  takeCamera() { this._take(); }
  /** One step of the warm-up (see ZOO), after the frame has been drawn. */
  _warmStep() {
    if (this.cine || this.mode === 'drop' || this.mode === 'leave' || document.hidden) return; // never during a cutscene (its first beat included)
    if (this.lite && (_zooTick++ & 3)) return;
    if (_zooAt < ZOO.length) {
      try { const o = ZOO[_zooAt](_zooRnd); if (o && o.isObject3D) _zoo.add(o); } catch (e) { /* a maker that changed: skip it */ }
      _zooAt++;
      return;
    }
    _zooDone = true;
    this._warmFrom = null;
    _zoo.updateMatrixWorld(true);
    try { this.renderer.compileAsync(_zoo, this.camera, this.scene).catch(() => {}); } catch (e) { /* compile is only a head start */ }
  }
  /** The drop is over: follow the action (nobody touched the camera) or stay exactly where the viewer took it. */
  _land(follow) {
    const g = this.goal, r = this.rig;
    if (!_zooDone) this._warmFrom = this.time; // the shaders scenes use are compiled from now on, in the background (see _warmStep)
    this.drop = null;
    if (follow) {
      U.uGrow.value = 1;
      this.mode = 'follow';
      Object.assign(g, this._view(this.camCtx));
      if (!CALM) this.fx.shake(0.22);
      if (!document.hidden) sfx.thud?.();
    } else {
      this.mode = 'free';
      Object.assign(g, r); g.fov = FOV; g.roll = 0;
      this.autoFree = false; this._fl = null;
      // buildings that were still rising finish rising (at once, for reduced motion)
      if (CALM || U.uGrow.value >= 1) U.uGrow.value = 1; else this.grow = { v: U.uGrow.value };
    }
    this.hooks.onMode?.(this.mode);
  }
  _pan(dx, dy) {
    // walking: the target is the character, there is nothing to pan; a drag turns and tilts instead (as a right-drag does)
    if (this.mode === 'walk') { this.goal.az -= dx * 0.005; this.goal.el = lim(this.goal.el + dy * 0.004, EL_LO, EL_HI, this.goal.el); return; }
    // by the elevation that is on screen (high up the camera tilts towards straight down by itself), so the ground follows the pointer
    const g = this.goal, mpp = (2 * g.dist * TAN) / (this.canvas.clientHeight || 1), kf = (dy * mpp) / Math.max(0.35, Math.sin(this.viewEl ?? g.el)), kr = dx * mpp;
    g.tx += -kr * Math.cos(g.az) - kf * Math.sin(g.az);
    g.tz += kr * Math.sin(g.az) - kf * Math.cos(g.az);
    const q = this.W.inCity(g.tx, g.tz); // roam anywhere in the city
    g.tx = q[0]; g.tz = q[1];
  }
  _bindInput() {
    // What each device can do (every one of these is camera input: see _take):
    //   mouse     drag pans; right-, middle-, Shift-, Ctrl-, Cmd- or Alt-drag turns (sideways) and tilts (up and down); the wheel zooms,
    //             Shift + wheel turns, Alt + wheel tilts
    //   trackpad  click-drag pans (with Shift: turns and tilts); two fingers up and down zoom, sideways turn; a pinch zooms (Chrome,
    //             Edge and Firefox send it as Ctrl + wheel; Safari as gesture events, whose twist also turns)
    //   touch     one finger pans; two fingers pinch to zoom, twist to turn, and moved up or down together tilt
    //   keyboard  WASD and the arrows pan, Q/E turn, R/F tilt, + and - zoom (never with Cmd, Ctrl or Alt held: those are the browser's)
    //   on screen the turn pad (#cam-pad): turn left and right, higher and lower view; held, it keeps going
    const c = this.canvas, pts = new Map();
    let drag = null, pinch = null;
    const two = () => { const [a, b] = [...pts.values()]; return { ax: a.x, ay: a.y, bx: b.x, by: b.y, d: Math.hypot(b.x - a.x, b.y - a.y) || 1, ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
    // a two-finger touch: where the fingers and the camera were when it began (or when its kind was decided), and its kind
    const base = (kind = null) => { const t = two(); return { ...t, pmx: t.mx, pmy: t.my, dist: this.goal.dist, az: this.goal.az, el: this.goal.el, kind }; };
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.running = false; this.hooks?.onContextLost?.(); });
    // a pointer goes down on the canvas, or (`at`: where it went down, with its button and keys) a drag that started on a "!" pin
    // is handed over once it moves (see _pins)
    const down = (e, at = e) => {
      c.setPointerCapture(e.pointerId);
      if (at.button === 1 && e.cancelable) e.preventDefault(); // (a middle-button drag turns: no autoscroll)
      pts.set(e.pointerId, { x: at.x, y: at.y }); // (a PointerEvent's x and y are its clientX and clientY)
      if (pts.size === 1) drag = { x: at.x, y: at.y, orbit: at.button === 2 || at.button === 1 || at.shiftKey || at.ctrlKey || at.metaKey || at.altKey, moved: false };
      else if (pts.size === 2) { drag = null; pinch = base(); }
    };
    c.addEventListener('pointerdown', (e) => down(e));
    this._grab = (e, at) => down(e, at); // (the canvas takes the pointer over: its next move pans or turns from where it went down)
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pinch && pts.size === 2) {
        const t = two();
        if (!pinch.kind) {
          // not decided yet: nothing moves until a finger has gone GESTURE_PX, then the touch is one kind until the fingers lift
          const ax = t.ax - pinch.ax, ay = t.ay - pinch.ay, bx = t.bx - pinch.bx, by = t.by - pinch.by;
          if (Math.max(Math.hypot(ax, ay), Math.hypot(bx, by)) < GESTURE_PX) return;
          const spread = Math.abs(t.d - pinch.d), twist = (Math.abs(angDiff(pinch.ang, t.ang)) * pinch.d) / 2, mid = Math.hypot(t.mx - pinch.mx, t.my - pinch.my);
          let kind = 'zoom'; // spreading or twisting: zoom and turn together, as touch maps do
          if (ax * bx + ay * by > 0 && mid > spread && mid > twist) {
            // both fingers the same way: up or down together tilts (it never comes with anything else), any other way pans
            kind = Math.abs(t.my - pinch.my) > 1.5 * Math.abs(t.mx - pinch.mx) && Math.sign(ay) === Math.sign(by) ? 'tilt' : 'pan';
          }
          if (!this._take()) return;
          pinch = base(kind); // (it starts from here, and from where the camera is now that it is the viewer's)
          return;
        }
        if (!this._take()) return;
        const g = this.goal;
        if (pinch.kind === 'zoom') {
          g.dist = lim((pinch.dist * pinch.d) / t.d, DMIN, DMAX, pinch.dist);
          g.az = pinch.az - angDiff(pinch.ang, t.ang); // a twist turns
        } else if (pinch.kind === 'tilt') g.el = lim(pinch.el + (t.my - pinch.my) * 0.005, EL_LO, EL_HI, pinch.el); // (as in map apps)
        else { this._pan(t.mx - pinch.pmx, t.my - pinch.pmy); pinch.pmx = t.mx; pinch.pmy = t.my; }
        return;
      }
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.moved = true;
      if (!this._take()) return;
      if (drag.orbit) { this.goal.az -= dx * 0.005; this.goal.el = lim(this.goal.el + dy * 0.004, EL_LO, EL_HI, this.goal.el); }
      else this._pan(dx, dy);
    });
    const end = (e) => {
      if (!pts.delete(e.pointerId)) return; // (pointerup and then lostpointercapture: once)
      // three fingers down and one lifted: the other two go on as a new two-finger touch; one left: it drags on
      if (pts.size >= 2) { drag = null; pinch = base(); return; }
      pinch = null;
      drag = pts.size === 1 ? { ...[...pts.values()][0], orbit: false, moved: true } : null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('lostpointercapture', end);
    this._clearPointers = () => { pts.clear(); drag = null; pinch = null; this._padStop(); };
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this._take()) return;
      const g = this.goal, u = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; // (lines or pages, as some mice send them)
      let dx = e.deltaX * u, dy = e.deltaY * u;
      if (e.shiftKey && !dx && this.mode !== 'walk') { dx = dy; dy = 0; } // Shift + wheel turns (macOS already sends it as a sideways scroll); walking, Shift is the run key and the wheel still zooms
      if (e.shiftKey && !dy && this.mode === 'walk') { dy = dx; dx = 0; } // (walking: macOS turned the Shift + wheel into a sideways scroll; it is the wheel, it zooms)
      if (e.ctrlKey) { g.dist = lim(g.dist * Math.exp(clamp(dy, -50, 50) * 0.006), DMIN, DMAX, g.dist); return; } // a trackpad pinch
      if (e.altKey) { g.el = lim(g.el - clamp(dy, -240, 240) * 0.003, EL_LO, EL_HI, g.el); return; } // Alt (Option) + scroll tilts
      // one meaning per movement: mostly sideways (two fingers on a trackpad, a tilting wheel) turns, mostly up and down zooms
      if (Math.abs(dx) > Math.abs(dy) * 1.5) g.az += clamp(dx, -240, 240) * 0.004;
      else g.dist = lim(g.dist * Math.exp(clamp(dy, -240, 240) * 0.0012), DMIN, DMAX, g.dist);
    }, { passive: false });
    // Safari's trackpad pinch and twist come as gesture events (no Ctrl + wheel). On an iPhone or iPad they come as well as the touch
    // pointers, which already do it: ignored while fingers are down on the canvas
    let gz = null;
    c.addEventListener('gesturestart', (e) => { e.preventDefault(); gz = null; if (pts.size || !this._take()) return; gz = { dist: this.goal.dist, az: this.goal.az }; });
    c.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (!gz || pts.size) return;
      this.goal.dist = lim(gz.dist / (e.scale || 1), DMIN, DMAX, gz.dist);
      this.goal.az = gz.az - ((e.rotation || 0) * Math.PI) / 180;
    });
    c.addEventListener('gestureend', (e) => { e.preventDefault(); gz = null; });
    const key = (e, on) => {
      const k = (e.key || '').toLowerCase(), id = e.code || 'key:' + k;
      if (k === 'shift') { this.shift = on; return; } // (held: the walking character runs; never a camera key, so it never takes the camera)
      if (!on) { this.keys.delete(id); this.keyMute?.delete(id); return; } // (always let go)
      // while Cmd is down macOS sends no keyup for the other keys: let go of all of them, and of the pad held by a key (nothing
      // left turning the camera by itself)
      if (k === 'meta' || k === 'control' || k === 'alt') { this.keys.clear(); this._padStop(); this.shift = false; return; }
      if (!this.running) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // Cmd/Ctrl/Alt + a key is the browser's or the system's (zoom, bookmark...), not the camera's
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return; // text fields keep their keys
      const act = KEY_ACT[k];
      if (!act) return;
      // a key held through a change of who moves what (a walk started or ended, Follow pressed) does nothing until it is let go, its
      // auto-repeat included: W held when the walk ends must not pan the camera, nor move him the moment he lands (_muteKeys)
      if (this.keyMute && this.keyMute.has(id)) { e.preventDefault(); return; }
      this.keys.set(id, act);
      e.preventDefault();
      if (this.mode === 'drop') this._take(); // (_keys does not run during the drop: the key takes the camera here)
    };
    window.addEventListener('keydown', (e) => key(e, true));
    window.addEventListener('keyup', (e) => key(e, false));
    const letGo = () => { this.keys.clear(); this.keyMute?.clear(); this._padStop(); this.shift = false; if (this.stick) this.stick.x = this.stick.y = 0; };
    window.addEventListener('blur', letGo);
    document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });
    this._bindPad();
  }
  /**
   * The on-screen turn pad (#cam-pad in the street view): turn left or right, a higher or lower view. A press turns a little at
   * once; held (pointer, or Enter / Space with the key held), it keeps going. With reduced motion it goes in steps instead.
   */
  _bindPad() {
    this.pad = { az: 0, el: 0, t: 0 };
    const pad = this.root.querySelector('#cam-pad');
    if (!pad) return;
    const P = this.pad;
    const go = (b) => {
      if (!this._take()) return;
      P.az = +(b.dataset.az || 0); P.el = +(b.dataset.el || 0); P.t = PAD_REPEAT;
      this._padStep(CALM ? 1 : 0.25);
    };
    const stop = () => this._padStop();
    pad.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      if (!b || e.button > 0) return;
      e.preventDefault(); // (no focus ring from a pointer, no text selection, no long-press menu)
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* not a live pointer */ }
      go(b);
    });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(t, stop);
    pad.addEventListener('keydown', (e) => {
      const b = e.target.closest('button');
      if (!b || (e.key !== 'Enter' && e.key !== ' ') || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      if (!e.repeat) go(b); // (held, the turn keeps going until the key comes up)
    });
    pad.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') stop(); });
    pad.addEventListener('focusout', stop);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  /** Let go of the pad (the button came up, lost focus or was hidden, the pointer was cancelled, a modifier went down, the page was left). */
  _padStop() { if (this.pad) { this.pad.az = 0; this.pad.el = 0; } }
  /** One step of the pad: `k` of a full step (a full step is PAD_AZ radians of turn or PAD_EL of tilt). */
  _padStep(k) {
    const g = this.goal, P = this.pad;
    if (P.az) g.az += P.az * PAD_AZ * k;
    if (P.el) g.el = lim(g.el + P.el * PAD_EL * k, EL_LO, EL_HI, g.el);
  }
  _keys(dt) {
    const K = this.keys, P = this.pad;
    if (!K.size && !P.az && !P.el) return;
    if (!this._take()) return;
    const g = this.goal, px = 620 * dt;
    const h = this._held || (this._held = {});
    for (const a in h) h[a] = 0;
    for (const a of K.values()) h[a] = 1;
    const x = (h.right || 0) - (h.left || 0), y = (h.down || 0) - (h.up || 0);
    if ((x || y) && this.mode !== 'walk') this._pan(-x * px, -y * px); // (walking, these keys move him: _walkStep)
    if (h.turnL) g.az += dt * 1.3;
    if (h.turnR) g.az -= dt * 1.3;
    const tilt = (h.tiltU || 0) - (h.tiltD || 0);
    if (tilt) g.el = lim(g.el + tilt * dt * 0.8, EL_LO, EL_HI, g.el);
    if (h.in) g.dist = lim(g.dist * Math.exp(-dt * 1.4), DMIN, DMAX, g.dist);
    if (h.out) g.dist = lim(g.dist * Math.exp(dt * 1.4), DMIN, DMAX, g.dist);
    // the pad held down: smoothly (as fast as Q/E and R/F), or with reduced motion a whole step every PAD_REPEAT seconds
    if (P.az || P.el) {
      if (!CALM) this._padStep((dt * 1.3) / PAD_AZ);
      else if ((P.t -= dt) <= 0) { P.t = PAD_REPEAT; this._padStep(1); }
    }
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
    // the overlay (pins, comic words) covers the root exactly (inset: 0): its size is kept here, so no frame reads layout
    const S = (this._size ||= { w: 0, h: 0 });
    S.w = w; S.h = h;
    if (this.fx) this.fx.size = S;
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
  /** `user`: the viewer took the camera (the camera then stays exactly where it is); otherwise the follow ran out by itself. */
  _setMode(mode, user = false) {
    if (this.mode === mode) return;
    const was = this.mode;
    this.mode = mode;
    if (mode === 'free') {
      if (this.cine) this._cineEnd();
      // The picture must not change when the viewer takes the camera. A cutscene's lens (22 to 56 degrees, widened further on a
      // narrow screen, see aspK in _frame) becomes the free camera's own at once, and the distance changes with it so that the
      // point looked at, and everything at that distance, stays exactly the size it was: camera distance x tan(half the lens)
      // is what sets that size. (Only depth changes, slightly: things well in front of or behind the aim point.)
      const r = this.rig, aK = Math.sqrt(this.aspK || 1), half = Math.tan((r.fov * Math.PI) / 360) * aK;
      r.dist = clamp(r.dist * aK * (half / TAN), 1, DMAX); r.fov = FOV; this.aspK = 1;
      // the tilted horizon of a shot and its aim height stay as they are; they level out and come down to the free camera's
      // own only as the viewer turns and moves the camera (see the free branch of _frame)
      Object.assign(this.goal, r);
      this.focusReq = null; this._fl = null;
      if (!user) {
        // the follow ran out by itself (nobody touched the camera): coming out of a close-up, back off to a sensible height
        this.goal.el = clamp(this.goal.el, 0.32, 1.5); this.goal.dist = Math.max(this.goal.dist, 42); this.goal.roll = 0;
        if (was === 'follow' && this.autoFree) this.goal.dist = Math.max(this.goal.dist, this.fit * 1.45);
      }
      this.autoFree = false;
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
  /** Follow the action (the button): the only way into follow, apart from a street's own opening. During the drop: land following. */
  follow() {
    if (!this.W || this.exiting || this.mode === 'leave') return; // (not while the page hands over to the map)
    if (this.mode === 'walk') this.walkEnd(); // (following the action ends the walk: he is taken away)
    this._muteKeys(); // (a key still held would take the camera straight back from the director)
    if (this.mode === 'free') this._setMode('follow');
    else if (this.mode === 'drop') this.landFree = false;
  }
  /**
   * A "!" pin was pressed: fly to that spot and stay the viewer's camera. The viewer's bearing and tilt are kept; the camera comes
   * in to PIN_VIEW metres (or the street's own viewing distance on a narrow screen) only if it is further away, never closer.
   */
  flyTo(ctx) {
    if (!this.W || this.mode === 'drop' || this.mode === 'leave' || this.exiting) return;
    if (this.mode === 'follow') this._setMode('free', true);
    if (this.mode === 'walk') this.walkEnd(); // (no pins are shown while walking; should one be pressed, the camera is free again first)
    const g = this.goal, p = this.W.path.xz(ctx.sc, 0);
    g.tx = p[0]; g.tz = p[1]; g.ty = this.W.landY(p[0], p[1]) + 1.5;
    g.dist = Math.min(g.dist, Math.max(PIN_VIEW, this.fit || 0));
    if (CALM) { const r = this.rig; r.tx = g.tx; r.tz = g.tz; r.ty = g.ty; r.dist = g.dist; } // (reduced motion: there at once, no flight)
  }
  // ------------------------------------------------------------ the walking character (walker.js)
  /** Is the walking character on the street (or about to be put there)? */
  get walking() { return this.mode === 'walk'; }
  /** The keys held now are ignored until they are let go (see the key handler), and the pad lets go. */
  _muteKeys() { const M = this.keyMute || (this.keyMute = new Set()); this.keys.forEach((a, id) => M.add(id)); this.keys.clear(); this._padStop(); }
  /** Can a walk start now, as far as the stage knows? (Not during the drop from the map or the rise back to it; the page also holds the
   * button while it builds the next street at a focus shift, main.js paintWalk.) */
  get canWalk() { return !!this.W && this.running && !this.exiting && (this.mode === 'free' || this.mode === 'follow' || this.mode === 'walk'); }
  /**
   * The Walk button: put the character on the ground at the point the camera looks at (or the nearest place within WALK_REACH metres
   * where a person may stand). The camera is the viewer's from now on (as with any camera input), keeps its bearing and settles
   * behind him: he faces away from it. From high up, or where the ground is not ready yet, the camera first comes down over that point
   * (the viewer asked for the walk) and he is put there once the ground is ready. False when a walk cannot start now.
   */
  walkStart() {
    if (!this.canWalk || this.mode === 'walk') return false;
    if (!this._take()) return false;
    this._muteKeys();
    this.mode = 'walk';
    this.walkWant = { t: 0 };
    this.stick = this.stick || { x: 0, y: 0, run: false };
    this._wb = this._wb || { x: 0, z: 0, r: 0.35 };
    const g = this.goal, r = this.rig;
    if (r.dist > WALK_HIGH || !this.W.ground || !this.W.ground.ready(r.tx, r.tz)) { g.dist = WALK_DIST; g.el = WALK_EL; if (CALM) { r.dist = g.dist; r.el = g.el; } } // (the camera comes down first; at once with reduced motion)
    this.hooks.onMode?.('walk');
    this._walkPlace(); // (now, or once the ground is ready: _walkStep)
    return this.mode === 'walk';
  }
  /** Take him away: the camera is free again, exactly where it is. `msg`: why, for the page to say. */
  walkEnd(msg = '') {
    if (this.walker) { this.walker.dispose(); this.walker = null; }
    this.walkWant = null;
    this._muteKeys();
    if (this.stick) { this.stick.x = this.stick.y = 0; this.stick.run = false; }
    if (this.mode === 'walk') { this.mode = 'free'; this.hooks.onMode?.('free'); }
    this.hooks.onWalk?.(false, msg);
  }
  /** Waiting to put him down: once the ground under the point looked at is ready (at most WALK_WAIT s), find his spot and put him there. */
  _walkPlace() {
    const W = this.W, r = this.rig, G = W.ground, out = this._ws || (this._ws = [0, 0]);
    if (!G || !(r.dist < WALK_HIGH) || !G.ready(r.tx, r.tz)) return false;
    if (!Walker.spot(W, r.tx, r.tz, WALK_REACH, out)) { this.walkEnd('Nobody can stand there. Look at the street and try again.'); return false; }
    const wk = (this.walker = new Walker()), az = r.az;
    wk.place(W, out[0], out[1], -Math.sin(az), -Math.cos(az)); // facing away from the camera: it is behind him already
    this.scene.add(wk.g);
    this.walkWant = null;
    // the camera settles behind him: the viewer's bearing stays; the distance and tilt too, if they suit walking
    const g = this.goal, p = wk.g.position;
    g.tx = p.x; g.tz = p.z; g.ty = wk.y + WALK_AIM; g.roll = 0;
    if (!(g.dist >= WALK_D[0] && g.dist <= WALK_D[1])) g.dist = WALK_DIST;
    if (!(g.el >= WALK_E[0] && g.el <= WALK_E[1])) g.el = WALK_EL;
    if (CALM) Object.assign(r, g); // (reduced motion: there at once, no glide)
    this._wb.x = p.x; this._wb.z = p.z;
    this.hooks.onWalk?.(true);
    return true;
  }
  /** One frame of walking: his input (keys and the stick, read every frame so a key let go stops him), his step, his blocker. */
  _walkStep(dt) {
    if (this.walkWant) {
      if ((this.walkWant.t += dt) > WALK_WAIT) { this.walkEnd('The street there is not ready yet. Try again in a moment.'); return; }
      if (!this._walkPlace()) return;
    }
    const wk = this.walker;
    if (!wk) return;
    const I = this._win || (this._win = { x: 0, y: 0, f: null });
    I.x = 0; I.y = 0;
    this.keys.forEach(I.f || (I.f = (a) => { if (a === 'right') I.x += 1; else if (a === 'left') I.x -= 1; else if (a === 'up') I.y += 1; else if (a === 'down') I.y -= 1; })); // (no iterator per frame)
    let ix = I.x, iy = I.y;
    if (ix > 1) ix = 1; else if (ix < -1) ix = -1;
    if (iy > 1) iy = 1; else if (iy < -1) iy = -1;
    const kl = Math.hypot(ix, iy);
    if (kl > 1) { ix /= kl; iy /= kl; } // (a diagonal is no faster)
    const S = this.stick;
    if (S && (S.x || S.y)) { ix = S.x; iy = S.y; }
    wk.step(this.W, dt, ix, iy, this.rig.az, !!(this.shift || (S && S.run)), this.crowd, this.crowd && this.crowd.blockers, this._wb);
    if (wk.lost) { this.walkEnd('Nobody can stand there. Look at the street and try again.'); return; } // (stuck with no free spot near)
    const p = wk.g.position;
    this._wb.x = p.x; this._wb.z = p.z;
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
      this._padStop(); this.keys.clear(); // (the pad is hidden now)
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
    const p = this.W.path.xz(ctx.sc, 0);
    this._stage = { ctx, x: p[0], z: p[1], r: STAGE_R, mode: 'watch' };
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
    if (sp.fit) dist = Math.max(dist === 14 && sp.dist !== 14 ? 0 : dist, spread * 2.6 + 7); // (14 with no distance given is the default: the fit alone decides; an explicit dist: 14 is kept as a floor)
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
  /** The parked cars near (x, z) for the sight-line checks: fetched again once (x, z) is 12 m from where they were fetched. Every reader goes through here. */
  _parked(x, z) {
    if (!this.crowd) return null;
    if (!this._parkAt || Math.hypot(this._parkAt[0] - x, this._parkAt[1] - z) > 12) { this._parkAt = [x, z]; this._park = this.crowd.parkedNear(x, z, 45); }
    return this._park;
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
      const P = this._parked(g.tx, g.tz), gy = this.W.landY(g.tx, g.tz);
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
      const P = this._parked(g.tx, g.tz);
      if (P) { const cx = g.tx + sx * g.dist, cz = g.tz + sz * g.dist; for (let i = 0; i < P.length; i += 2) if (camY < gy + 2.4 && Math.hypot(P[i] - cx, P[i + 1] - cz) < 3.3 && Math.hypot(P[i] - g.tx, P[i + 1] - g.tz) > 3) return false; }
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
      view = { m: o.frame.M(r.tx, r.tz), gm: o.frame.M(g.tx, g.tz), d: dir(r.az), gd: dir(g.az), el: r.el, gel: g.el, dist: r.dist, gdist: g.dist, ty: r.ty, gty: g.ty, roll: r.roll, groll: g.roll, sky: this.sky };
      // the city's street life carries on: it is handed to the next street instead of being torn down
      // the scenes playing here end with this street. A scene holding the camera lets the crowd go first (as it always does when it ends:
      // no stage left standing in the crowd), and whoever the scenes borrowed and is standing on the pavement goes back to the crowd where
      // they stand, before the crowd is handed over (later, ctx.demote could no longer reach it)
      this._cineEnd();
      this._handBack();
      // the ambient life in view (boats, gulls, pigeons) is not dropped with the street: the overhead carries it on until out of view
      for (const a of [...this.actors]) if (a.ambient && a.alive && !a._left && this.overhead.seenActor(a)) this.overhead.adopt(a);
      view.crowd = this.crowd; this.crowd = null;
      // and so does what flies over it (the helicopter): it lives in map metres and is written into whichever frame is open
      view.overhead = this.overhead; this.overhead = null;
      // and so does the walking character: he lives in map metres too (walker.js); his figure hangs from the scene, not the street
      view.walker = this.walker; this.walker = null; view.walkWant = this.walkWant; this.walkWant = null;
      if (o.stream) o.stream.onTile = null;
      this._teardown(true);
      dress();
    }
    try {
      this._begin(W, st, sky, level, { ...opts, view });
    } catch (e) {
      console.error('scene start failed', e);
      // what was handed over and never taken back by _begin is not this stage's any more: hide() would not find it
      if (view && view.overhead && view.overhead !== this.overhead) view.overhead.dispose();
      if (view && view.crowd && view.crowd !== this.crowd) { this.scene.remove(view.crowd.group); view.crowd.dispose(); }
      if (view && view.walker && view.walker !== this.walker) { view.walker.dispose(); this.hooks.onWalk?.(false); }
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
    // the city's street life: walkers, bikes, cars and trams on every street, this one included. It is one system
    // for the whole city and outlives the street: when the focus moves it is carried over as it is
    const old = opts.view && opts.view.crowd;
    if (old) { this.crowd = old; old.rebase(W); } // (the crowd does not depend on day or night: its lights are switched by a uniform)
    else this.crowd = new Crowd(W, { lite: this.lite });
    this.scene.add(this.crowd.group);
    W.stream.onTile = (c, on) => { if (!this.crowd) return; if (on) this.crowd.addTile(c); }; // (tiles that leave are pruned a little later)
    for (const key of W.corridor) { const c = tileOf(key); if (c) this.crowd.addTile(c); } // this street's own tiles now: its lamp posts and parked cars are needed below
    this.pruneT = 2;
    // what flies over the city (the helicopter) is the city's too: carried over like the crowd, and moved into this street's frame
    this.overhead = (opts.view && opts.view.overhead) || new Overhead(this);
    this.overhead.begin(W);
    this.scene.add(this.overhead.group);
    this.dyn = new THREE.Group();
    this.scene.add(this.dyn);

    const rnd = makeRng(hashStr((st.name || '') + '|' + (st.buurt || '') + '|' + (opts.seed || '') + '|stage'));
    const path = W.path, len = path.sB - path.sA;
    this.fx = new Fx(this.scene, this.camera, this.overlay);
    this.fx.size = this._size || null; // (and by _resize)
    // whose words stay readable from afar: the scene that directs the camera, or the spot the camera is following
    this.fx.watch = (ctx) => (this.cine ? this.cine.ctx === ctx : this.mode === 'follow' && this.camCtx === ctx);
    this.fx.ground = W.hAt;
    this.cine = null; this._stage = null; this.cineSkip = null; this._wasShot = false; this.exiting = false; this.leaveTo = null;
    // the drop lands in free when the viewer kept the camera from the street before (Next street: opts.land) or touches it on the way
    // down (_take); a drop cut short lets the buildings finish rising (grow)
    this.landFree = opts.land === 'free'; this.grow = null; this._fl = null; // (_fl: the free camera's last target, in this street's frame)
    this.runner = new Runner();
    this.actors = this.overhead.carried(); // (a helicopter and the leftovers carried over are still the stage's to animate)
    this.extras = this.overhead.extras; // (the stork: the overhead updates it; scripts/dev-swap.mjs reads stage.extras)
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
        /** startLocale asks for the spot's helicopter (level 5): the stage flies it (overhead.js). `phase` is startLocale's ctx.rnd draw. */
        heli: (phase) => this.overhead.want(ctx, phase, !!opts.view),
        /** This spot was started by a focus shift (its ambient life must not pop in or out in view: gags.js softSeen). */
        soft: !!opts.view,
        /**
         * Like inView, but in the frame the camera was last drawn in: right after a focus shift (startLocale runs before the first frame
         * of this street) the camera's matrices are still the old street's. Same reach (250 m) and margin.
         */
        seenNow: (x, z, y = 1, margin = 0.08, reach = 250) => {
          const p = path.xz(sc + x, z), F = this._camFrame || W.frame, cam = this.camera;
          let px = p[0], pz = p[1];
          if (F !== W.frame) { const m = W.frame.M(px, pz), q = F.S(m[0], m[1]); px = q[0]; pz = q[1]; }
          _v3.set(px, W.hAt(p[0], p[1]) + y, pz);
          if (cam.position.distanceToSquared(_v3) > reach * reach) return false;
          _v3.applyMatrix4(cam.matrixWorldInverse);
          if (_v3.z >= 0) return false;
          _v3.applyMatrix4(cam.projectionMatrix);
          return Math.abs(_v3.x) <= 1 + margin && Math.abs(_v3.y) <= 1 + margin;
        },
        /**
         * Draw an ambient actor arriving where the script has just put it: 'boat' sails in from behind, 'air' (a bird) comes down
         * from 8 m up. Only drawn: the script has it there already.
         */
        arrive: (a, kind, from = 0) => {
          // where it comes from: the first point along the street on that side that is out of the picture, plus 6 m. A boat only from
          // behind (`from` = -its direction); a bird from a random side, else the other. No hidden start within 120 m (a high camera sees
          // it all): no arrival, it is simply there as before (a few pixels from up there). Only drawn either way: no ctx.rnd, no retiming
          const p = a.g.position, y = kind === 'boat' ? 1 : 8, first = kind === 'boat' ? Math.sign(from) || -1 : Math.random() < 0.5 ? -1 : 1;
          for (const side of kind === 'boat' ? [first] : [first, -first]) {
            let d = 0, run = 0;
            for (; d < 120; d++) if (!ctx.seenNow(p.x + side * d, p.z, y, 0.1, SOFT_REACH)) { if (++run >= 2) break; } else run = 0;
            if (run < 2) continue;
            const g = arrival(a, kind, d + 6, side);
            if (g) this.runner.run(g);
            return;
          }
        },
        /** Take an ambient actor off: in view, the overhead carries it on until it is out of view (a leftover); else it goes at once. */
        retire: (a) => {
          if (a.alive && this.overhead && this._camFrame === W.frame && this.overhead.seenActor(a)) this.overhead.adopt(a);
          else ctx.despawn(a);
        },
        spawn(a, x, z, y) {
          a.g.position.set(x, y ?? 0, z);
          a.baseScale = a.g.scale.x;
          a.alive = true;
          a.ctx = ctx;
          if (a.vehicle) a.g._veh = a;
          else if (a.legL && a.head) a.g._feet = true; // (a person: stands on the highest ground under the feet, see warp)
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
        gagStart: (name) => {
          const g = { ctx, name, t0: this.time };
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
          if (!this._own) return false;
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
    // (after a focus shift the cutaway eases from where it was to what the new street needs, at its usual rate: no snap in the swap frame)
    if (!opts.view) this.cutK = undefined;
    this.roamT = 0; this._parkAt = null; this._park = null;
    const was = this.mode;
    if (V) {
      // the focus moved here from another street: the camera carries on from exactly where it was
      const F = W.frame, az = (d) => Math.atan2(d[0] * F.dx + d[1] * F.dy, d[0] * F.dy - d[1] * F.dx);
      const p = F.S(V.m[0], V.m[1]), q = F.S(V.gm[0], V.gm[1]);
      // (the horizon too: a cutscene's tilted horizon the viewer took over levels out only as they turn, see the free branch of _frame)
      Object.assign(this.rig, { tx: p[0], tz: p[1], ty: V.ty, az: az(V.d), el: V.el, dist: V.dist, fov: FOV, roll: V.roll || 0 });
      Object.assign(this.goal, { tx: q[0], tz: q[1], ty: V.gty ?? V.ty, az: az(V.gd), el: V.gel, dist: V.gdist, fov: FOV, roll: V.groll || 0 });
      this.drop = null;
      // the viewer's camera stays the viewer's: free stays free, and a walk goes on with the same character, written into this frame
      const wv = opts.view && (opts.view.walker || opts.view.walkWant) && was === 'walk';
      this.mode = wv ? 'walk' : 'free';
      if (wv && opts.view.walker) { this.walker = opts.view.walker; this.scene.add(this.walker.g); this.walker.rebase(W); }
      if (wv && opts.view.walkWant) this.walkWant = opts.view.walkWant;
      if (was === 'walk' && !wv) hooks.onWalk?.(false);
      this.cutEnd = 0; this.lastSwitch = 0; this.idleT = 0; this.autoFree = false;
      U.uGrow.value = 1;
      if (was !== this.mode) hooks.onMode?.(this.mode); // (a focus shift in free or walk mode stays there: the page's hints are not said again)
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

    this.overhead.settle(); // (a helicopter the new street does not want flies away out of sight)
    // the clouds and the stork are made once per visit and carried over from street to street (overhead.js). The stage's rnd draws
    // for them come after every draw the spots use, so skipping them on a focus shift changes no scene
    if (!(opts.view && opts.view.overhead)) this.overhead.makeClouds(rnd, this.cur.nk, mid);
    this.clouds = this.overhead.clouds; this._cloudMat = this.overhead.cloudMat; // (stage.clouds: only scripts/dev-swap.mjs reads it; the overhead moves them)
    // the stork, The Hague's mascot, on a chimney near the action (one carried over stays on its own chimney; a street opened without
    // one gets it only where nobody is looking)
    if (A.chimneys.length && !this.overhead.hasStork) {
      const m = path.xz(main, 0), c = A.chimneys.reduce((a, b) => ((b.x - m[0]) ** 2 + (b.z - m[1]) ** 2 < (a.x - m[0]) ** 2 + (a.z - m[1]) ** 2 ? b : a));
      const cm = W.frame.M(c.x, c.z);
      if (!opts.view || !this.overhead._inView(cm[0], cm[1], 0.15, c.y + 0.3)) this.overhead.makeStork(rnd, c);
    }
    this.running = true;
    // (after a focus shift the loop has been running all along: the first frame takes its full step, so whatever was carried over
    // moves on in the swap frame exactly as in the frame before)
    if (!opts.view) this.last = performance.now();
    cancelAnimationFrame(this._raf); // never two loops at once
    this._raf = requestAnimationFrame(this._tick);
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
    // (on a focus shift the scenes' words and the "!" pins fade out where they are instead of vanishing)
    if (this.fx) { this.fx.dispose(swap); this.fx = null; }
    for (const p of this.pins) { p.ctx = null; fadeOut(p.el, swap); }
    this.pins = [];
    if (this.dyn) {
      disposeTree(this.dyn);
      this.scene.remove(this.dyn);
      this.dyn = null;
    }
    if (this.crowd) { this.scene.remove(this.crowd.group); this.crowd.dispose(); this.crowd = null; }
    if (this.overhead) { this.overhead.dispose(); this.overhead = null; } // (on a focus shift it was handed over first: nothing here)
    if (this.walker || this.walkWant) { if (this.walker) this.walker.dispose(); this.walker = null; this.walkWant = null; this.hooks?.onWalk?.(false); } // (likewise)
    // on a swap the next street's signs are already made and share the cache: only a full close clears it
    if (this.W) { this.scene.remove(this.W.group); this.W.dispose(); this.W = null; if (!swap) clearSigns(); }
    for (const l of this.lampLights) l.intensity = 0;
    this.actors = [];
    this.gags = new Set();
  }

  /**
   * A focus shift ends the scenes of this street. The walkers they borrowed from the crowd (or made up for it) who stand on the pavement
   * go back to the crowd where they stand (crowd.adopt), rather than vanish with the scene. Sitting, riding, up high, in a doorway, falling
   * or shrinking: they go with their scene, as before. adopt can say no (no lane within 3.5 m, too few free figures): then they go too.
   */
  _handBack() {
    for (const a of [...this.actors]) {
      if (!a.alive || !a.look || a.vehicle || !a.ctx || !a.ctx.demote) continue;
      if (a.air || a.fly || a.pose || a.offstage || !a.g.visible || a.g.position.y > 0.05) continue;
      if (Math.abs(a.g.rotation.x) > 0.05 || Math.abs(a.g.rotation.z) > 0.05 || a.g.scale.x < (a.baseScale || a.g.scale.x) * 0.9) continue;
      a.ctx.demote(a);
    }
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
      // where it stands now (the scripts have moved it this frame; matrixWorld is still last frame's): as warp maps it
      const p = a.g.position, c = a.g._ctx || a.ctx;
      let x, z;
      if (c && c.sc !== undefined && path && a.g.parent === this.dyn) { path.at(c.sc + p.x, _f); x = _f.x - _f.tz * p.z; z = _f.z + _f.tx * p.z; } // (only an actor standing in the street itself, not one carried by another)
      else { const e = a.g.matrixWorld.elements; x = e[12]; z = e[14]; }
      B.push({ x, z, r: a.vehicle ? Math.max(1, (a.len || 2) / 2) : 0.35 });
    }
    if (this.walker) B.push(this._wb); // the walking character: the crowd treats him as a person on stage (walkers go round, vehicles brake)
    for (const c of this.locales) if (c.road && c.road.closed > 0) { const p = path.xz(c.sc, 0); Z.push({ x: p[0], z: p[1], r: 26 }); }
    if ((this.pruneT -= 0.016) <= 0) { this.pruneT = 2; C.prune(this.W.stream.live); }
  }

  // ------------------------------------------------------------ "something is happening over there" pins
  _pins() {
    const show = this.mode === 'free';
    // the spots with a scene on, in street order. Nothing is allocated per frame: the scenes playing mark their spot (one pass over
    // the set with a callback made once), then the spots are read in order into a list the stage keeps
    const live = this._live || (this._live = []);
    live.length = 0;
    if (show) {
      const stamp = (this._pinStamp = (this._pinStamp || 0) + 1);
      this.gags.forEach(this._markGag || (this._markGag = (g) => { g.ctx._pinMark = this._pinStamp; }));
      for (let i = 0; i < this.locales.length; i++) if (this.locales[i]._pinMark === stamp) live.push(this.locales[i]);
    }
    while (this.pins.length < live.length) {
      const el = document.createElement('button');
      el.className = 'gag-pin';
      el.setAttribute('aria-label', 'Jump to the action');
      el.innerHTML = '<span>!</span>';
      const pin = { el, ctx: null, a: 1, q: 50, px: NaN, py: NaN, down: null };
      // (a pin that has faded (disabled, .faint) or is hidden does not fly, also if it faded while it was being pressed)
      const go = () => { if (pin.ctx && !el.disabled && !el.hidden) { this.flyTo(pin.ctx); this.hooks.onPin?.(); } };
      // A pin is pressed and let go without moving. A drag that starts on a pin is a drag of the camera: once it has moved 4 px
      // it is handed to the canvas (which takes the pointer over) and the pin does nothing.
      el.addEventListener('pointerdown', (e) => {
        if (el.disabled) return; // (a faint pin takes no pointer: .faint, pointer-events none)
        // (only a press of the primary button flies; any button can start a drag of the camera from here)
        pin.down = { id: e.pointerId, x: e.clientX, y: e.clientY, button: e.button, primary: e.button === 0, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey };
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* not a live pointer */ }
      });
      el.addEventListener('pointermove', (e) => {
        const d = pin.down;
        if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
        pin.down = null;
        this._grab?.(e, d);
      });
      el.addEventListener('pointerup', (e) => { const d = pin.down; pin.down = null; if (d && d.id === e.pointerId && d.primary) go(); });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('pointercancel', () => { pin.down = null; });
      el.addEventListener('click', (e) => { if (e.detail === 0) go(); }); // Enter or Space on a focused pin (a pointer press is handled above)
      this.overlay.appendChild(el);
      this.pins.push(pin);
    }
    if (!this.pins.length) return;
    const S = this._size, w = S ? S.w : this.overlay.clientWidth, h = S ? S.h : this.overlay.clientHeight;
    for (let i = 0; i < this.pins.length; i++) {
      const pin = this.pins[i], c = live[i];
      pin.ctx = c || null;
      if (!c) { pin.el.hidden = true; continue; }
      const p = (c._c0 ||= this.W.path.xz(c.sc, 0)); // (the spot's centre: the same point ctx.watched() keeps)
      _v.set(p[0], 5 + this.W.landY(p[0], p[1]), p[1]).project(this.camera);
      const behind = _v.z > 1;
      let x = behind ? -_v.x : _v.x, y = behind ? -1 : _v.y;
      const off = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.86;
      const d = Math.hypot(p[0] - this.rig.tx, p[1] - this.rig.tz), close = !off && d < this.rig.dist * 0.5 && this.rig.dist < 160;
      // far spots fade with their distance from the point the camera looks at, and are gone (not laid out at the edge) at PIN_GONE
      const a = clamp((PIN_GONE - d) / (PIN_GONE - PIN_FULL), 0, 1);
      pin.el.hidden = close || a <= 0;
      if (a !== pin.a) {
        const faint = a < 1; // a pin that is not fully there cannot be clicked or reached with the keyboard
        if (faint !== pin.a < 1) { pin.el.classList.toggle('faint', faint); pin.el.disabled = faint; pin.el.tabIndex = faint ? -1 : 0; }
        pin.a = a;
        // the opacity is written in steps of 2 % (and only when it changes by one): smooth to the eye, no string per frame
        const q = Math.round(a * 50);
        if (q !== pin.q) { pin.q = q; pin.el.style.opacity = q < 50 ? String(q / 50) : ''; }
      }
      x = clamp(x, -0.9, 0.9); y = clamp(y, -0.7, 0.82);
      pin.el.classList.toggle('edge', off);
      const px = ((x + 1) / 2) * w;
      let py = ((1 - y) / 2) * h;
      const wb = w <= PIN_NARROW ? WALK_BOX.narrow : WALK_BOX.wide, top = h - wb.bottom - wb.h; // (the Walk button's top edge, from the top)
      if (px + PIN_R > w - wb.right - wb.w && py + PIN_R > top && py - PIN_R < h - wb.bottom) py = top - PIN_R;
      if (Math.abs(px - pin.px) > 0.1 || Math.abs(py - pin.py) > 0.1 || pin.px !== pin.px) { pin.px = px; pin.py = py; pin.el.style.transform = `translate(${px}px, ${py}px)`; }
    }
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
    _wT = this.time;
    const W = this.W, r = this.rig, g = this.goal;

    this.runner.update(dt);
    this.overhead.update(dt); // (where the helicopter's script used to run: before the actors, so its beam is drawn from where it is now; also the clouds and the stork)
    for (let i = this.actors.length - 1; i >= 0; i--) this.actors[i].update(dt);
    this.fx.update(dt);

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
      if (e >= 1) this._land(!this.landFree); // (follow, unless the viewer touched the camera on the way down or kept it from the last street)
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
      // (a drop the viewer cut short: the buildings finish rising)
      if (this.grow) { this.grow.v = Math.min(1, this.grow.v + real * 1.25); U.uGrow.value = this.grow.v; if (this.grow.v >= 1) this.grow = null; }
      else U.uGrow.value = 1;
      this._keys(real);
      if (this.mode === 'walk') this._walkStep(real * (this.debugSpeed || 1)); // (on the viewer's clock: a scene's slow motion does not slow his feet)
      let rate = this._own ? 10 : 3.2, rateT = rate, snap = false;
      if (this.mode === 'follow') {
        let busy = false;
        for (const q of this.gags) if (q.ctx === this.camCtx) { busy = true; break; }
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
          else if (this.time > c.touched + SAFETY) {
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
        // The free camera: nothing here moves the view by itself. Its lens is the normal one (a cutscene's was folded into the
        // distance at the take-over). The aim height and the horizon follow the viewer's own moves: as the target is moved, its
        // height eases to 1.5 m over the ground under it (fully after 8 m of moving), and as the camera is turned or tilted, the
        // tilted horizon of a cutscene shot levels out (fully after 0.35 rad). Standing still, both stay exactly as they are.
        const L = this._fl || (this._fl = { on: false, tx: 0, tz: 0, az: 0, el: 0 });
        if (L.on) {
          const moved = Math.hypot(g.tx - L.tx, g.tz - L.tz), turned = Math.abs(angDiff(L.az, g.az)) + Math.abs(g.el - L.el);
          if (moved > 0) g.ty += (W.landY(g.tx, g.tz) + 1.5 - g.ty) * Math.min(1, moved / 8);
          if (turned > 0 && g.roll) g.roll *= Math.max(0, 1 - turned / 0.35);
        }
        L.on = true; L.tx = g.tx; L.tz = g.tz; L.az = g.az; L.el = g.el;
        g.fov = FOV;
        // walking: the camera looks at him, a little over his feet (his height is already eased over kerbs and steps)
        if (this.walker) { const p = this.walker.g.position; g.tx = p.x; g.tz = p.z; g.ty = this.walker.y + WALK_AIM; }
      }
      // high up, the free camera turns to look straight down with north up: the same view as the map it hands over to
      let gel = g.el, gaz = g.az;
      if (this._own) gel = lerp(g.el, TOP, sm(clamp((r.dist - 1500) / 1100)));
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
      if (this._own && r.dist >= EXIT && !this.exiting) { if (this.mode === 'walk') this.walkEnd(); this.exiting = true; this.hooks.onExit?.(); } // (the walk ends before the way out begins)
      if (this._own && !this.exiting && this.hooks.onRoam && (this.roamT -= real) <= 0) {
        this.roamT = 0.25;
        const pr = W.path.project(r.tx, r.tz);
        // how far the camera's target is from the street that is open (leaving it past either end counts too)
        this.hooks.onRoam({ lngLat: W.toLngLat(r.tx, r.tz), dist: r.dist, off: pr.d + Math.max(0, W.path.sA - pr.s, pr.s - W.path.sB) });
      }
    }
    // a scene shakes the picture only while the camera follows the action: never the viewer's own camera (free, or walk to come)
    const sh = (this.mode === 'follow' ? this.fx.shakeAmt : 0) * Math.max(1, r.dist / 70), ce = Math.cos(r.el);
    const tx = r.tx + (Math.random() - 0.5) * sh, ty = r.ty + (Math.random() - 0.5) * sh, tz = r.tz + (Math.random() - 0.5) * sh;
    // Shots are framed for a wide picture. On a tall, narrow screen (a phone held upright) the same shot would cut
    // its subjects off left and right: stand further back and widen the lens until the same width of street fits.
    const needA = this.cine && this.mode === 'follow' ? aspNeed(this.camera.aspect) : 1;
    this.aspK = snapCut || this.aspK === undefined ? needA : this.aspK + (needA - this.aspK) * Math.min(1, real * 6);
    const aK = Math.sqrt(this.aspK), camD = r.dist * aK;
    const cx = tx + camD * Math.sin(r.az) * ce, cz = tz + camD * Math.cos(r.az) * ce;
    let cy = ty + camD * Math.sin(r.el);
    // never under the ground, at any distance: the lens is lifted, the point it looks at stays (zooming out from a low angle, the
    // camera backs off along the ground, 0.35 m over it, still aiming at the same point: the view levels out as it goes)
    cy = Math.max(cy, W.landY(cx, cz) + 0.35);
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(tx, ty, tz);
    if (r.roll) this.camera.rotateZ(r.roll);
    // cutscenes fill the whole frame (no letterbox): the lens is the shot's own, widened only on a narrow screen
    this.camera.fov = aK > 1.001 ? (2 * Math.atan(Math.tan((r.fov * Math.PI) / 360) * aK) * 180) / Math.PI : r.fov;
    this.camera.near = clamp(r.dist * 0.04, 0.2, 80);
    this.camera.far = r.dist * 7 + 9000;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this._camFrame = W.frame; // (the frame these camera matrices are in: overhead.js tests what is in view right after a focus shift)
    this._skyFrame(real);
    this.scene.fog.near = r.dist * 1.6 + 180;
    this.scene.fog.far = r.dist * 7 + 2400;
    this.fx.zoom = r.dist;
    W.lod(r.tx, r.tz, r.dist, this.mode !== 'drop' && this.mode !== 'leave', r.az, this.mode);
    this._brief();
    this.crowd.update(dt, r.tx, r.tz, r.dist);

    // ---- things in the way duck; shadows follow the camera
    // the lens guard (free mode only): a building the lens is in, or is about to be in, lies down whatever the cutaway below
    // decides (a wing of a big complex, the end of a long block); the camera itself is never moved
    // (fed the camera WITHOUT the shake: a shaking lens would swing the guard's look-ahead about)
    {
      const gx = r.tx + camD * Math.sin(r.az) * ce, gz = r.tz + camD * Math.cos(r.az) * ce;
      let gy = r.ty + camD * Math.sin(r.el);
      if (!sh) gy = cy; // (no shake: the camera's own position, ground clamp included)
      else gy = Math.max(gy, W.landY(gx, gz) + 0.35); // (the camera's own ground guard above, at every distance; a shake happens only while following)
      lensGuard(W, real, this._own, gx, gy, gz, r.tx, r.ty, r.tz);
    }
    U.uFocus.value.set(r.tx, 0, r.tz);
    U.uCamDir.value.set(Math.sin(r.az), Math.cos(r.az));
    U.uTan.value = Math.tan(clamp(r.el, 0.1, 1.45));
    U.uR.value = shotOn ? r.dist * 0.3 + 3 : r.dist * 0.6 + 20; // a directed shot only clears its own sight line
    U.uHalf.value = shotBlocked ? 0 : 0.5; // ...unless something is in the way: then everything on the camera's side of the subject ducks
    // The cutaway is only for watching the street from close by. It fades out as the camera climbs, and when the
    // camera wanders off the streets there is nothing to keep in view, so everything stands up again. Any street counts,
    // not only the open one: crossing onto the next street must not stand everything up until the focus has moved there.
    let need = clamp((1.3 - r.el) / 0.15) * clamp((190 - r.dist) / 80);
    if (need > 0 && this._own) need *= clamp((46 - Math.min(W.path.project(r.tx, r.tz).d, streetNear(W, r.tx, r.tz))) / 26);
    if (shotOn || shotBlocked) need = Math.max(need, clamp((1.3 - r.el) / 0.15));
    this.cutK = snapCut ? need : (this.cutK ?? need) + (need - (this.cutK ?? need)) * (1 - Math.exp(-real * 6));
    U.uCut.value = this.cutK < 0.004 ? 0 : this.cutK;
    for (const s of W.signs) s.m.visible = U.uGrow.value > 0.9 && cutWeight(s.x, s.z) < 0.5 && duckAt(s.x, s.z) < 0.5;
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
    if (!_zooDone && this._warmFrom != null) this._warmStep();
  }
}
export { preload };
