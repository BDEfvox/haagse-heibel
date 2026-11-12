// The cast: blocky people, critters and their little walk cycles.
import * as THREE from 'three';
import { sculpt, piece, TAU, clamp } from './kit.js';

export const SKINS = ['#f2c9a0', '#e8b48a', '#c98e62', '#9a6642', '#f7d7b5', '#7a4f33'];
export const SHIRTS = ['#e84a5f', '#2a9d8f', '#f4a261', '#457b9d', '#e9c46a', '#9d4edd', '#ff7aa2', '#3a86ff', '#ffffff', '#52b788', '#fb8500'];
export const PANTS = ['#2b3a55', '#3d405b', '#6b705c', '#1d3557', '#5c4033', '#22223b', '#4a4e69'];
export const HAIRS = ['#2b1d14', '#5a3825', '#c58b3c', '#e6c36a', '#111111', '#a33b20', '#cfcfcf'];

/** A colour scaled darker/lighter (hex in, hex out). */
function shade2(hex, k) {
  const n = parseInt(hex.slice(1), 16), c = (sh) => Math.max(0, Math.min(255, Math.round(((n >> sh) & 255) * k)));
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
}

function turnTo(g, heading, dt, k = 12) {
  let d = heading - g.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  g.rotation.y += d * Math.min(1, dt * k);
}

/** People are scaled by this on top of their nominal scale so they read as about 2 m tall next to real-size cars. */
export const PERSON_K = 0.72;

/**
 * Faces. Each mood is a set of targets the face eases towards:
 *  br brow height, bs brow slant (+ = inner ends down: angry), eye openness, mw mouth width, mo mouth open,
 *  mc mouth corners (+1 smile, -1 frown), hp head pitch (+ = chin down).
 */
const MOODS = {
  neutral: { br: 0, bs: 0, eye: 1, mw: 1, mo: 0, mc: 0, hp: 0 },
  happy: { br: 0.03, bs: -0.12, eye: 0.82, mw: 1.35, mo: 0.3, mc: 1, hp: 0 },
  laugh: { br: 0.05, bs: -0.22, eye: 0.2, mw: 1.55, mo: 1, mc: 1, hp: -0.32 },
  smug: { br: 0.02, bs: 0.28, eye: 0.55, mw: 1.25, mo: 0, mc: 1, hp: -0.1 },
  sly: { br: -0.01, bs: 0.38, eye: 0.45, mw: 1.15, mo: 0, mc: 1, hp: 0.06 },
  angry: { br: -0.03, bs: 0.55, eye: 0.72, mw: 1.15, mo: 0.4, mc: -1, hp: 0.05 },
  shock: { br: 0.085, bs: -0.15, eye: 1.4, mw: 0.7, mo: 1.15, mc: 0, hp: -0.06 },
  scared: { br: 0.075, bs: -0.5, eye: 1.3, mw: 1.25, mo: 0.75, mc: -1, hp: 0 },
  sad: { br: 0.02, bs: -0.5, eye: 0.72, mw: 0.9, mo: 0, mc: -1, hp: 0.22 },
  dizzy: { br: 0.04, bs: 0, eye: 0.3, mw: 0.8, mo: 0.55, mc: 0, hp: 0 },
  sleepy: { br: -0.02, bs: 0, eye: 0.1, mw: 0.8, mo: 0, mc: 0, hp: 0.25 },
  focus: { br: -0.025, bs: 0.3, eye: 0.68, mw: 0.6, mo: 0, mc: 0, hp: 0.12 },
  whistle: { br: 0.04, bs: -0.1, eye: 0.9, mw: 0.42, mo: 0.55, mc: 0, hp: -0.1 },
};

/**
 * How the arms are held. Shoulder swing (l, r: 0 = hanging, -1.57 = straight forward, -3.14 = straight up), shoulder
 * spread (lz, rz: + = away from the body), elbow bend (le, re: 0 = straight, 2.2 = fully folded, hand to shoulder),
 * and an optional wiggle { on, amp, hz } applied to one of those.
 */
const ARMS = {
  up: { l: -3.0, r: -3.0, lz: 0.3, rz: 0.3, le: 0.25, re: 0.25, wig: { on: 'both', amp: 0.35, hz: 22 } },
  carry: { l: -0.75, r: -0.75, le: 1.0, re: 1.0 },
  fist: { r: -2.7, re: 0.7, wig: { on: 'r', amp: 0.35, hz: 20 } },
  hold: { r: -0.55, re: 1.25 },
  wave: { r: -2.8, re: 0.35, wig: { on: 'rz', amp: 0.4, hz: 12 } },
  sneak: { l: -0.55, r: -0.55, lz: -0.12, rz: -0.12, le: 1.75, re: 1.75 },
  spray: { r: -1.5, re: 0.2, wig: { on: 'r', amp: 0.35, hz: 9 } },
  // new
  bag: { r: -2.55, re: 2.0, rz: 0.1, l: 0.1, le: 0.5 }, // right hand up at the shoulder, gripping a sack slung over the back
  laugh: { l: -0.5, r: -0.5, lz: -0.28, rz: -0.28, le: 1.7, re: 1.7 }, // hands on the belly
  point: { r: -1.5, re: 0.05 },
  shrug: { l: -0.25, r: -0.25, lz: 0.55, rz: 0.55, le: 1.5, re: 1.5 },
  cheer: { l: -2.9, r: -2.9, lz: 0.45, rz: 0.45, le: 0.3, re: 0.3, wig: { on: 'both', amp: 0.3, hz: 9 } },
  hips: { l: 0.25, r: 0.25, lz: 0.55, rz: 0.55, le: 1.55, re: 1.55 },
  cover: { l: -2.5, r: -2.5, lz: -0.2, rz: -0.2, le: 1.9, re: 1.9 }, // hands over the head
  push: { l: -1.45, r: -1.45, le: 0.12, re: 0.12 },
  drive: { l: -1.15, r: -1.15, le: 0.55, re: 0.55 },
  facepalm: { r: -1.9, re: 2.05, rz: -0.3 },
  phone: { r: -1.2, re: 2.1, rz: 0.25 }, // at the ear
  count: { l: -0.6, r: -0.6, lz: -0.2, rz: -0.2, le: 1.45, re: 1.45, wig: { on: 're', amp: 0.3, hz: 8 } }, // counting notes
  rub: { l: -0.7, r: -0.7, lz: -0.3, rz: -0.3, le: 1.6, re: 1.6, wig: { on: 'both', amp: 0.12, hz: 10 } }, // rubbing hands
  reach: { r: -1.7, re: 0.1, l: 0.2, le: 0.4 },
  drag: { l: 0.7, r: 0.7, le: 0.2, re: 0.2 }, // both hands behind, hauling something
  cross: { l: -0.6, r: -0.6, lz: -0.55, rz: -0.55, le: 1.6, re: 1.6 }, // arms folded
  beg: { l: -1.1, r: -1.1, lz: -0.3, rz: -0.3, le: 0.9, re: 0.9 }, // hands together, pleading
  stop: { r: -1.6, re: 0.9, rz: 0.1 }, // flat hand out: halt
  write: { l: -0.6, le: 1.3, r: -0.7, re: 1.35, rz: -0.2, wig: { on: 're', amp: 0.12, hz: 14 } },
};

/**
 * Biped. Forward is +z. Options:
 *  kind: 'civ' | 'cop' | 'robber' | 'raccoon' | 'kid' | 'granny' | 'hoodie' | 'chef' | 'niffo' | 'harry'
 *    niffo  a teenager in a parody designer tracksuit (HH monogram, green-red sleeve stripe), cap or hood, pouch, white trainers; struts
 *    harry  a Hague mullet man: short on top, long at the back, moustache sometimes, dark jacket with a herring badge on the sleeve, jeans, boots
 *
 * Driving a person from a script (all optional, all eased):
 *  a.arms    a key of ARMS, or 'swing' (default)
 *  a.gait    'walk' | 'sneak' | 'strut' | 'stagger'      a.pose  null | 'sit' | 'ride' | 'crouch'
 *  a.mood    a key of MOODS (stays until changed)        a.emote(mood, seconds)  a passing expression
 *  a.lookAt  an actor, an Object3D or { x, z } (street space): head and eyes turn to it; null = straight ahead
 *  a.talk    seconds of mouth flapping left              a.laughT  seconds of belly-shaking laughter left
 *  a.nodT / a.shakeT  seconds of nodding yes / shaking no
 *  a.squash(k)  one squash-and-stretch bounce (k = 0.3 for a landing)
 */
export function makePerson(rnd, o = {}) {
  const kind = o.kind || 'civ';
  let scale = o.scale ?? 1.25;
  let skin = o.skin || rnd.pick(SKINS);
  let shirt = o.shirt || rnd.pick(SHIRTS);
  let pants = o.pants || rnd.pick(PANTS);
  let hair = o.hair || rnd.pick(HAIRS);
  let hat = o.hat || (rnd.chance(0.18) ? 'cap' : null);
  let shoes = '#2a2a2a';
  let stripes = false, mask = false, ears = false, tail = false, skirt = false, hood = false;
  let capCol = null, mullet = false, stache = false, track = false, jacket = false;
  const TRACK = '#6b4a2a'; // the "designer" monogram brown
  if (kind === 'cop') { shirt = '#1b2a4a'; pants = '#16223d'; hat = 'cop'; shoes = '#111'; }
  if (kind === 'robber') { stripes = true; pants = '#1c1c1c'; hat = 'beanie'; mask = true; shoes = '#111'; }
  if (kind === 'raccoon') { skin = '#9a9a9a'; shirt = '#8a8a8a'; pants = '#777777'; hair = '#9a9a9a'; hat = null; mask = true; ears = true; tail = true; scale = o.scale ?? 0.85; shoes = '#3a3a3a'; }
  if (kind === 'kid') { scale = o.scale ?? 0.85; }
  if (kind === 'granny') { hair = '#dcdcdc'; shirt = o.shirt || '#b388eb'; skirt = true; hat = null; scale = o.scale ?? 1.1; }
  if (kind === 'hoodie') { shirt = o.shirt || '#3a3a3a'; hood = true; hat = null; pants = '#2a2a2a'; }
  if (kind === 'chef') { shirt = '#ffffff'; pants = '#444'; hat = 'chef'; }
  if (kind === 'niffo') {
    track = true; scale = o.scale ?? 1.08;
    shirt = rnd.pick(['#c8a878', '#bf9d6e', '#d6bd92']); pants = shade2(shirt, 0.94); shoes = '#f4f4f4';
    if (o.hat === 'hood' || ((!o.hat || o.hat === 'none') && rnd.chance(0.5))) { hood = true; hat = null; } else { hat = 'cap'; capCol = rnd.pick(['#1a1a1a', '#c8a878', TRACK, '#f4f4f4']); }
  }
  if (kind === 'harry') {
    jacket = true; mullet = true; stache = rnd.chance(0.6); hat = null; shoes = '#4a3622';
    shirt = rnd.pick(['#1f2a36', '#26301f', '#1c1c22', '#2b2530', '#2a2f38']);
    pants = rnd.pick(['#3b5a85', '#2f4a72', '#4a6a96', '#35507a']);
  }

  const g = new THREE.Group();
  const b = new THREE.Group(); // bobbing body root
  g.add(b);
  scale *= PERSON_K;
  g.scale.setScalar(scale);

  // a limb in two parts: the upper part hangs from `p`, the lower part from the joint half-way down
  const limb = (x, y, upper, lower) => {
    const p = new THREE.Group(), j = new THREE.Group();
    p.position.set(x, y, 0);
    p.add(sculpt(upper));
    j.position.set(0, -0.36, 0);
    j.add(sculpt(lower));
    p.add(j);
    b.add(p);
    return [p, j];
  };
  const legCol = skirt ? skin : pants;
  // the green-red stripe down the outside of a tracksuit leg or sleeve (sx = which side is "outside")
  const stripe = (v, sx, y0, h, half, one) => {
    v.box(sx * half, y0, -0.05, 0.02, h, 0.05, '#1f8a4c');
    if (!one) v.box(sx * half, y0, 0.0, 0.02, h, 0.05, '#d62828'); // (lower parts: green only, to save vertices)
  };
  const leg = (x) => limb(x, 0.7,
    (v) => { v.box(0, -0.37, 0, 0.3, 0.37, 0.32, legCol); if (track) stripe(v, Math.sign(x), -0.37, 0.37, 0.155); },
    (v) => {
      v.box(0, -0.34, 0, 0.28, 0.34, 0.3, legCol);
      v.box(0, -0.34, 0.05, 0.32, 0.14, 0.44, shoes);
      if (track) stripe(v, Math.sign(x), -0.2, 0.2, 0.145, true);
      if (jacket) v.box(0, -0.34, 0.05, 0.34, 0.05, 0.46, '#2a2118'); // chunky boot sole
    });
  const [legL, kneeL] = leg(-0.2), [legR, kneeR] = leg(0.2);

  b.add(sculpt((v) => {
    if (stripes) {
      for (let i = 0; i < 5; i++) v.box(0, 0.7 + i * 0.16, 0, 0.78, 0.16, 0.46, i % 2 ? '#f5f5f5' : '#1c1c1c');
    } else {
      v.box(0, 0.7, 0, 0.78, 0.8, 0.46, shirt);
    }
    if (skirt) v.box(0, 0.5, 0, 0.86, 0.4, 0.54, shirt);
    if (kind === 'cop') {
      v.box(0, 1.22, 0, 0.8, 0.1, 0.48, '#ffd400');
      v.box(0.2, 1.3, 0.24, 0.14, 0.12, 0.02, '#d9d9d9'); // badge
      v.box(0, 0.7, 0, 0.8, 0.09, 0.48, '#0d1526'); // belt
      v.box(-0.3, 0.62, 0.2, 0.14, 0.2, 0.1, '#0d1526'); // holster pouch
    }
    if (kind === 'chef') v.box(0, 0.5, 0.05, 0.7, 0.75, 0.42, '#f1f1f1');
    if (kind === 'hoodie') { v.box(0, 0.86, 0.235, 0.4, 0.2, 0.02, '#2c2c2c'); v.box(-0.07, 1.2, 0.235, 0.03, 0.26, 0.02, '#e8e8e8'); v.box(0.07, 1.2, 0.235, 0.03, 0.26, 0.02, '#e8e8e8'); } // pouch and cords
    if (kind === 'civ' || kind === 'kid' || kind === 'niffo') v.box(0, 1.42, 0.02, 0.4, 0.08, 0.44, skin); // collar line
    if (track) {
      // "HH" monogram on the chest, a two-tone check low down and across the back
      for (const hx of [-0.17, 0.17]) { v.box(hx - 0.06, 1.06, 0.235, 0.035, 0.22, 0.02, TRACK); v.box(hx + 0.06, 1.06, 0.235, 0.035, 0.22, 0.02, TRACK); v.box(hx, 1.15, 0.235, 0.09, 0.035, 0.02, TRACK); }
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2 === 0) v.box(-0.27 + c * 0.18, 0.8 + r * 0.2, -0.235, 0.18, 0.2, 0.02, TRACK);
      v.box(0, 0.7, 0, 0.8, 0.07, 0.48, TRACK); // waistband
      for (let i = 0; i < 3; i++) v.box(-0.26 + i * 0.26, 1.34 - i * 0.22, 0.25, 0.16, 0.22, 0.02, '#2b2b2b'); // cross-body strap (over the monogram)
      v.box(0.26, 0.66, 0.235, 0.24, 0.2, 0.1, '#2b2b2b'); // the pouch
    }
    if (jacket) {
      v.box(0, 0.7, 0, 0.8, 0.09, 0.48, shade2(shirt, 0.7)); // hem band
      v.box(0, 1.4, 0.0, 0.5, 0.12, 0.52, shade2(shirt, 0.8)); // stand-up collar
      v.box(0, 0.78, 0.235, 0.04, 0.72, 0.02, '#14161a'); // zip
      v.box(-0.22, 0.86, 0.235, 0.2, 0.05, 0.02, '#14161a'); v.box(0.22, 0.86, 0.235, 0.2, 0.05, 0.02, '#14161a'); // pocket flaps
    }
    if (tail) {
      for (let i = 0; i < 4; i++) v.box(0, 0.62 + i * 0.1, -0.34 - i * 0.16, 0.24, 0.24, 0.18, i % 2 ? '#3a3a3a' : '#a0a0a0');
    }
  }));

  const armCol = stripes ? '#f5f5f5' : shirt;
  const arm = (x) => limb(x, 1.46,
    (v) => {
      v.box(0, -0.38, 0, 0.24, 0.38, 0.28, armCol);
      if (track) stripe(v, Math.sign(x), -0.38, 0.38, 0.125);
      if (jacket && x > 0) { // the sleeve badge: a pale patch with a little herring on it (swims towards the front), seen from the side
        v.box(0.125, -0.26, 0, 0.025, 0.18, 0.2, '#e9e5d3');
        v.box(0.14, -0.2, 0.0, 0.025, 0.06, 0.12, '#4a6070'); v.box(0.14, -0.2, -0.085, 0.025, 0.1, 0.04, '#4a6070');
      }
    },
    (v) => { v.box(0, -0.16, 0, 0.23, 0.16, 0.27, armCol); v.box(0, -0.34, 0, 0.22, 0.18, 0.26, skin); if (track) stripe(v, Math.sign(x), -0.16, 0.16, 0.12, true); });
  const [armL, handL] = arm(-0.51), [armR, handR] = arm(0.51);

  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  head.add(sculpt((v) => {
    v.box(0, 0, 0, 0.66, 0.62, 0.62, skin);
    if (mask) v.box(0, 0.26, 0.005, 0.68, 0.2, 0.635, '#161616');
    if (kind === 'raccoon') {
      v.box(0, 0.06, 0.36, 0.3, 0.2, 0.14, '#e9e9e9'); // snout
      v.box(0, 0.18, 0.44, 0.1, 0.08, 0.04, '#111');
    } else {
      v.box(0, 0.2, 0.33, 0.1, 0.1, 0.05, skin); // nose
      v.box(-0.345, 0.22, 0, 0.04, 0.16, 0.14, skin); v.box(0.345, 0.22, 0, 0.04, 0.16, 0.14, skin); // ears
    }
    if (ears) {
      v.box(-0.24, 0.62, 0, 0.16, 0.16, 0.12, '#6d6d6d');
      v.box(0.24, 0.62, 0, 0.16, 0.16, 0.12, '#6d6d6d');
    }
    if (hood) {
      v.box(0, 0.36, -0.06, 0.74, 0.32, 0.6, shirt);
      v.box(0, 0, -0.26, 0.74, 0.4, 0.2, shirt);
    } else if (hat === 'cop') {
      v.box(0, 0.6, 0, 0.72, 0.2, 0.68, '#16223d');
      v.box(0, 0.6, 0.36, 0.6, 0.06, 0.2, '#0d1526');
      v.box(0, 0.66, 0.345, 0.14, 0.1, 0.02, '#ffd400');
    } else if (hat === 'beanie') {
      v.box(0, 0.5, 0, 0.7, 0.26, 0.66, '#151515');
    } else if (hat === 'cap') {
      const c = capCol || rnd.pick(SHIRTS);
      v.box(0, 0.58, 0, 0.7, 0.16, 0.66, c);
      v.box(0, 0.58, 0.4, 0.5, 0.06, 0.22, c);
      if (kind === 'niffo') v.box(0, 0.18, -0.3, 0.7, 0.4, 0.08, hair); // hair out the back under the cap
    } else if (hat === 'chef') {
      v.box(0, 0.6, 0, 0.6, 0.4, 0.56, '#ffffff');
      v.box(0, 0.94, 0, 0.74, 0.2, 0.7, '#ffffff');
    } else if (mullet) {
      // short on top and at the sides, long at the back: it hangs past the collar and tapers to a point
      v.box(0, 0.54, -0.02, 0.7, 0.16, 0.66, hair);
      v.box(-0.345, 0.38, -0.17, 0.04, 0.2, 0.26, hair); v.box(0.345, 0.38, -0.17, 0.04, 0.2, 0.26, hair); // sideburns
      v.box(0, 0.08, -0.3, 0.7, 0.48, 0.1, hair);
      v.box(0, -0.2, -0.32, 0.56, 0.3, 0.1, hair);
      v.box(0, -0.42, -0.33, 0.36, 0.24, 0.1, hair);
      if (stache) v.box(0, 0.165, 0.335, 0.3, 0.045, 0.03, hair);
    } else if (kind !== 'raccoon') {
      v.box(0, 0.56, -0.02, 0.7, 0.14, 0.66, hair);
      v.box(0, 0.2, -0.3, 0.7, 0.4, 0.08, hair);
      if (kind === 'granny') v.box(0, 0.66, -0.18, 0.3, 0.2, 0.3, hair);
      else if (rnd.chance(0.35)) { // long hair
        v.box(-0.34, 0.0, -0.05, 0.06, 0.56, 0.5, hair);
        v.box(0.34, 0.0, -0.05, 0.06, 0.56, 0.5, hair);
        v.box(0, -0.2, -0.3, 0.7, 0.4, 0.08, hair);
      }
    }
    if (kind === 'granny') { // glasses
      v.box(0, 0.29, 0.335, 0.5, 0.03, 0.02, '#444');
    }
  }));
  b.add(head);

  // ---- the face: eyes that open, close and look; brows; a mouth that talks and laughs
  const FZ = 0.335, part = (fn) => { const m = sculpt(fn); m.castShadow = false; return m; };
  const eye = (x) => {
    const e = new THREE.Group();
    e.position.set(x, 0.365, FZ);
    e.add(part((v) => v.box(0, -0.08, 0, 0.17, 0.16, 0.02, '#ffffff')));
    const pupil = part((v) => v.box(0, -0.055, 0.012, 0.085, 0.11, 0.02, '#141414'));
    e.add(pupil);
    head.add(e);
    return [e, pupil];
  };
  const [eyeL, pupL] = eye(-0.16), [eyeR, pupR] = eye(0.16);
  const browCol = mask || kind === 'cop' ? '#101010' : kind === 'granny' ? '#b9b9b9' : kind === 'raccoon' ? '#2b2b2b' : hair;
  const brow = (x) => { const m = part((v) => v.box(0, -0.025, 0, 0.21, 0.05, 0.03, browCol)); m.position.set(x, 0.49, FZ + 0.005); head.add(m); return m; };
  const browL = brow(-0.16), browR = brow(0.16);
  const mouth = new THREE.Group();
  mouth.position.set(0, 0.105, FZ - 0.012);
  const lips = part((v) => v.box(0, -0.02, 0, 0.2, 0.04, 0.02, '#4a1515'));
  const teeth = part((v) => v.box(0, -0.014, 0.008, 0.2, 0.028, 0.02, '#ffffff'));
  const cornL = part((v) => v.box(0, -0.02, 0, 0.045, 0.04, 0.02, '#4a1515')), cornR = part((v) => v.box(0, -0.02, 0, 0.045, 0.04, 0.02, '#4a1515'));
  mouth.add(lips, teeth, cornL, cornR);
  if (kind !== 'raccoon') head.add(mouth);

  const F = { br: 0, bs: 0, eye: 1, mw: 1, mo: 0, mc: 0, hp: 0 }; // the face as it is now
  const A = { l: 0, r: 0, lz: 0, rz: 0, le: 0.15, re: 0.15 };
  let blinkT = rnd.range(1, 4), sq = 0, sqv = 0, emoteT = 0, emoteM = null, yaw = 0, gx = 0;

  const a = {
    g, b, head, armL, armR, handL, handR, legL, legR, kneeL, kneeR, kind, scale,
    heading: 0, moving: 0, vel: 0, speed: o.speed ?? rnd.range(2.2, 3.2),
    ph: rnd() * TAU, t: rnd() * 10, arms: 'swing', gait: 'walk', pose: null, held: null, alive: true,
    mood: 'neutral', lookAt: null, talk: 0, laughT: 0, nodT: 0, shakeT: 0, swagger: kind === 'niffo', // swagger: a plain 'walk' is a strut
    face(h) { this.heading = h; g.rotation.y = h; },
    /** A passing expression: back to `mood` after `dur` seconds. */
    emote(m, dur = 1.2) { emoteM = m; emoteT = dur; return this; },
    /** One squash-and-stretch bounce (landings, jolts). */
    squash(k = 0.28) { sqv -= k * 9; return this; },
    /** Attach an object to the right hand, or 'handL' | 'back' | 'shoulder' | 'head' | 'front'. */
    hold(obj, where = 'hand') {
      if (this.held) this.drop();
      this.held = obj;
      if (where === 'back') { obj.position.set(0, 0.85, -0.42); b.add(obj); }
      else if (where === 'shoulder') { obj.position.set(0.22, 0.92, -0.5); obj.rotation.set(0.18, 0, -0.12); b.add(obj); } // slung over the right shoulder (use arms 'bag')
      else if (where === 'head') { obj.position.set(0, 0.7, 0); head.add(obj); }
      else if (where === 'front') { obj.position.set(0, 0.9, 0.55); b.add(obj); }
      else if (where === 'handL') { obj.position.set(0, -0.42, 0.1); handL.add(obj); }
      else { obj.position.set(0, -0.42, 0.1); handR.add(obj); }
      return obj;
    },
    drop() {
      const h = this.held;
      if (h && h.parent) h.parent.remove(h);
      if (h) h.rotation.set(0, 0, 0);
      this.held = null;
      return h;
    },
    update(dt) {
      this.t += dt;
      const t = this.t, mv = this.moving;
      this.moving = 0; this.vel = mv;
      turnTo(g, this.heading, dt);
      const k = Math.min(1, dt * 14), run = mv > 4.5;
      let la = 0, ra = 0, laz = 0, raz = 0, le = 0.15, re = 0.15, ll = 0, rl = 0, lk = 0, rk = 0, by = 0, lean = 0, roll = 0, tw = 0;
      if (this.pose === 'sit') {
        ll = rl = -1.5; lk = rk = 1.5; by = -0.42;
      } else if (this.pose === 'ride') {
        const s = Math.sin(t * 9);
        ll = -1.15 + s * 0.45; rl = -1.15 - s * 0.45; lk = 1.25 - s * 0.45; rk = 1.25 + s * 0.45;
        by = -0.05; la = ra = -1.15; le = re = 0.3; lean = 0.2;
      } else if (this.pose === 'crouch') {
        ll = rl = -1.3; lk = rk = 2.2; by = -0.5; lean = 0.4;
      } else if (mv > 0) {
        const sneak = this.gait === 'sneak', strut = this.gait === 'strut' || (this.swagger && this.gait === 'walk'), stag = this.gait === 'stagger';
        this.ph += dt * (sneak ? 5 : 3.2 + mv * 1.9);
        const amp = sneak ? 1.0 : clamp(0.45 + mv * 0.11, 0, 1.15);
        const s = Math.sin(this.ph), c = Math.cos(this.ph);
        ll = s * amp; rl = -s * amp;
        // the leg that swings forward folds at the knee, the one on the ground stays straight
        const kb = sneak ? 1.7 : run ? 1.7 : 0.8;
        lk = Math.max(0, -c) * kb + 0.08; rk = Math.max(0, c) * kb + 0.08;
        if (sneak) { ll -= 0.35 * Math.max(0, -c); rl -= 0.35 * Math.max(0, c); } // tiptoe: knees come up high
        la = -s * amp * (strut ? 1.25 : 0.9); ra = s * amp * (strut ? 1.25 : 0.9);
        le = run ? 1.5 : 0.35 + Math.max(0, s) * 0.3; re = run ? 1.5 : 0.35 + Math.max(0, -s) * 0.3;
        by = Math.abs(s) * (sneak ? 0.22 : run ? 0.2 : 0.1);
        lean = sneak ? 0.32 : run ? 0.26 : strut ? -0.12 : 0.05;
        tw = s * (run ? 0.2 : 0.1);
        if (stag) { roll = Math.sin(t * 5) * 0.22; lean = 0.1 + Math.sin(t * 3.1) * 0.12; }
      } else {
        by = Math.sin(t * 2.2) * 0.012;
        le = re = 0.12;
      }
      const P = ARMS[this.arms];
      if (P) {
        if (P.l !== undefined) { la = P.l; le = P.le ?? 0.15; laz = P.lz ?? 0; }
        if (P.r !== undefined) { ra = P.r; re = P.re ?? 0.15; raz = P.rz ?? 0; }
        const w = P.wig;
        if (w) {
          const q = Math.sin(t * w.hz) * w.amp;
          if (w.on === 'both') { la += q; ra += q; } else if (w.on === 'r') ra += q; else if (w.on === 'rz') raz += q; else if (w.on === 're') re += q;
        }
      }
      // laughing takes the whole body: shoulders shake, head goes back
      const laughing = this.laughT > 0;
      if (laughing) {
        this.laughT -= dt;
        const q = Math.sin(t * 15);
        by += Math.abs(q) * 0.07; roll += q * 0.035; lean -= 0.14;
      }
      A.l += (la - A.l) * k; A.r += (ra - A.r) * k; A.lz += (laz - A.lz) * k; A.rz += (raz - A.rz) * k; A.le += (le - A.le) * k; A.re += (re - A.re) * k;
      armL.rotation.x = A.l; armR.rotation.x = A.r;
      armL.rotation.z = -A.lz; armR.rotation.z = A.rz;
      handL.rotation.x = -A.le; handR.rotation.x = -A.re;
      legL.rotation.x += (ll - legL.rotation.x) * k; legR.rotation.x += (rl - legR.rotation.x) * k;
      kneeL.rotation.x += (lk - kneeL.rotation.x) * k; kneeR.rotation.x += (rk - kneeR.rotation.x) * k;
      b.position.y += (by - b.position.y) * Math.min(1, dt * 20);
      b.rotation.x += (lean - b.rotation.x) * k;
      b.rotation.z += (roll - b.rotation.z) * k;
      b.rotation.y += (tw - b.rotation.y) * k;
      // squash and stretch (a damped spring on the body's height)
      if (sq !== 0 || sqv !== 0) {
        sqv += (-sq * 180 - sqv * 14) * dt; sq += sqv * dt;
        if (Math.abs(sq) < 0.002 && Math.abs(sqv) < 0.02) sq = sqv = 0;
        const sy = clamp(1 + sq, 0.6, 1.3), sx = 1 / Math.sqrt(sy);
        b.scale.set(sx, sy, sx);
      }

      // ---- head and face
      let want = 0, pitch = 0, look = 0;
      const L = this.lookAt;
      if (L) {
        let tx, tz;
        if (L.g || L.isObject3D) { const q = (L.g || L).position; tx = q.x; tz = q.z; } else { tx = L.x; tz = L.z; }
        const d = Math.atan2(tx - g.position.x, tz - g.position.z) - g.rotation.y;
        want = clamp(Math.atan2(Math.sin(d), Math.cos(d)), -1.25, 1.25);
        look = clamp(want * 0.5, -1, 1);
      }
      if (this.shakeT > 0) { this.shakeT -= dt; want += Math.sin(t * 13) * 0.45; }
      if (this.nodT > 0) { this.nodT -= dt; pitch += Math.sin(t * 11) * 0.22 + 0.1; }
      if (emoteT > 0) { emoteT -= dt; if (emoteT <= 0) emoteM = null; }
      const M = MOODS[laughing ? 'laugh' : emoteM || this.mood] || MOODS.neutral, fk = Math.min(1, dt * 16);
      for (const key in F) F[key] += (M[key] - F[key]) * fk;
      let open = F.mo, eyeK = F.eye;
      if (this.talk > 0) { this.talk -= dt; open = Math.max(open, 0.25 + 0.6 * Math.abs(Math.sin(t * 17))); }
      if (laughing) open = 0.7 + 0.4 * Math.abs(Math.sin(t * 15));
      blinkT -= dt;
      if (blinkT < 0.11) { eyeK = Math.min(eyeK, 0.08); if (blinkT < 0) blinkT = rnd.range(2, 5.5); }
      yaw += (want - yaw) * Math.min(1, dt * 9);
      head.rotation.y = yaw;
      head.rotation.x += (F.hp + pitch - head.rotation.x) * fk;
      gx += (look - gx) * Math.min(1, dt * 10);
      eyeL.scale.y = eyeR.scale.y = Math.max(0.06, eyeK);
      pupL.position.x = pupR.position.x = gx * 0.035;
      browL.position.y = browR.position.y = 0.49 + F.br;
      browL.rotation.z = -F.bs; browR.rotation.z = F.bs;
      const mh = 0.04 + open * 0.15;
      lips.scale.set(F.mw, mh / 0.04, 1);
      teeth.visible = open > 0.45;
      teeth.scale.x = F.mw * 0.86; teeth.position.y = mh / 2 - 0.02;
      const cv = Math.abs(F.mc) > 0.3 && open < 0.6;
      cornL.visible = cornR.visible = cv;
      if (cv) { const cx = 0.1 * F.mw + 0.02, cy = F.mc * 0.042; cornL.position.set(-cx, cy, 0); cornR.position.set(cx, cy, 0); }
    },
  };
  return a;
}

// ---------------------------------------------------------------- critters
function quad(rnd, { body, head, len = 0.9, h = 0.45, w = 0.36, legH = 0.3, tailCol, earCol, snout, scale = 1 }) {
  const g = new THREE.Group();
  const b = new THREE.Group();
  g.add(b);
  g.scale.setScalar(scale);
  b.add(sculpt((v) => {
    v.box(0, legH, 0, w, h, len, body);
    v.box(0, legH + h * 0.5, len / 2 + 0.12, w * 0.95, h * 0.9, 0.36, head);
    v.box(-0.1, legH + h * 1.05, len / 2 + 0.31, 0.07, 0.08, 0.02, '#111');
    v.box(0.1, legH + h * 1.05, len / 2 + 0.31, 0.07, 0.08, 0.02, '#111');
    if (snout) v.box(0, legH + h * 0.55, len / 2 + 0.36, w * 0.5, h * 0.4, 0.14, snout);
    v.box(-w * 0.32, legH + h * 1.38, len / 2 + 0.08, 0.1, 0.14, 0.1, earCol || head);
    v.box(w * 0.32, legH + h * 1.38, len / 2 + 0.08, 0.1, 0.14, 0.1, earCol || head);
  }));
  const tail = new THREE.Group();
  tail.position.set(0, legH + h * 0.8, -len / 2);
  tail.add(sculpt((v) => v.box(0, 0, -0.2, 0.1, 0.1, 0.4, tailCol || body)));
  b.add(tail);
  const legs = [];
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const p = new THREE.Group();
    p.position.set(x * w * 0.3, legH, z * len * 0.36);
    p.add(sculpt((v) => v.box(0, -legH, 0, 0.11, legH, 0.11, body)));
    b.add(p);
    legs.push(p);
  }
  const a = {
    g, b, heading: 0, moving: 0, vel: 0, speed: 3, ph: rnd() * TAU, t: rnd() * 9, alive: true, pose: null, _sq: 0,
    face(hd) { this.heading = hd; g.rotation.y = hd; },
    /** The same calls people take, so the toolkit's leaps and landings work on animals too. */
    squash(k = 0.28) { this._sq = Math.max(this._sq, k); return this; },
    emote() { return this; },
    update(dt) {
      this.t += dt;
      const mv = this.moving;
      this.moving = 0;
      turnTo(g, this.heading, dt);
      if (this.pose === 'sleep') {
        b.position.y = -legH * 0.7;
        b.scale.y = 1 + Math.sin(this.t * 1.6) * 0.05;
        legs.forEach((l) => (l.rotation.x = 1.4));
        return;
      }
      this.vel = mv;
      if (this._sq > 0) this._sq = Math.max(0, this._sq - dt * 1.6);
      b.scale.y = 1 - this._sq * 1.2; // a landing flattens it for a moment
      if (mv > 0) {
        this.ph += dt * (6 + mv * 2.4);
        const s = Math.sin(this.ph) * 0.8;
        legs[0].rotation.x = s; legs[3].rotation.x = s; legs[1].rotation.x = -s; legs[2].rotation.x = -s;
        b.position.y = Math.abs(Math.sin(this.ph)) * 0.08;
        tail.rotation.y = Math.sin(this.ph * 0.7) * 0.5;
      } else {
        legs.forEach((l) => (l.rotation.x *= 0.8));
        b.position.y *= 0.8;
        tail.rotation.y = Math.sin(this.t * 6) * 0.6;
      }
    },
  };
  return a;
}
export const makeDog = (rnd) => quad(rnd, {
  body: rnd.pick(['#c68642', '#8d5524', '#f1e0c5', '#444', '#d9a066']), head: '#b0703a', snout: '#f1e0c5', scale: 0.8, earCol: '#5c3a1e',
});
export const makeCat = (rnd) => quad(rnd, {
  body: rnd.pick(['#f08a24', '#2f2f2f', '#bdbdbd', '#f5efe6']), head: rnd.pick(['#f08a24', '#2f2f2f', '#bdbdbd']), len: 0.7, h: 0.32, w: 0.28, legH: 0.22, scale: 0.62,
});

/** Bird (gull / pigeon / stork). Flies when a.fly is true. */
export function makeBird(rnd, kind = 'gull') {
  const g = new THREE.Group();
  const b = new THREE.Group();
  g.add(b);
  const C = {
    gull: { body: '#ffffff', wing: '#b9c2cc', beak: '#f5a623', leg: '#f5a623', s: 0.8 },
    pigeon: { body: '#8794a8', wing: '#667085', beak: '#e6a15c', leg: '#d9534f', s: 0.58 },
    stork: { body: '#ffffff', wing: '#1f1f1f', beak: '#e4572e', leg: '#e4572e', s: 1.1 },
  }[kind];
  const stork = kind === 'stork';
  const legH = stork ? 0.7 : 0.14;
  b.add(sculpt((v) => {
    v.box(0, legH, 0, 0.34, 0.3, 0.6, C.body);
    v.box(0, legH + 0.04, -0.36, 0.26, 0.14, 0.2, C.wing); // tail
    const ny = stork ? 0.5 : 0.0;
    if (stork) v.box(0, legH + 0.26, 0.24, 0.14, 0.5, 0.14, C.body);
    v.box(0, legH + 0.22 + ny, 0.32, 0.26, 0.26, 0.26, C.body);
    v.box(0, legH + 0.28 + ny, 0.5 + (stork ? 0.14 : 0), 0.1, 0.08, stork ? 0.5 : 0.2, C.beak);
    v.box(-0.11, legH + 0.38 + ny, 0.44, 0.05, 0.06, 0.03, '#111');
    v.box(0.11, legH + 0.38 + ny, 0.44, 0.05, 0.06, 0.03, '#111');
    v.box(-0.08, 0, 0, 0.05, legH, 0.05, C.leg);
    v.box(0.08, 0, 0, 0.05, legH, 0.05, C.leg);
  }));
  const wings = [-1, 1].map((sx) => {
    const p = new THREE.Group();
    p.position.set(sx * 0.17, legH + 0.26, 0);
    p.add(sculpt((v) => {
      v.box(sx * 0.3, -0.03, 0, 0.6, 0.06, 0.4, C.wing);
      v.box(sx * 0.72, -0.03, 0, 0.26, 0.05, 0.26, stork ? '#1f1f1f' : '#3d4652');
    }));
    b.add(p);
    return p;
  });
  g.scale.setScalar(C.s);
  const a = {
    g, b, kind, heading: 0, moving: 0, vel: 0, fly: false, speed: 6, t: rnd() * 9, alive: true,
    face(hd) { this.heading = hd; g.rotation.y = hd; },
    squash() { return this; },
    emote() { return this; },
    update(dt) {
      this.t += dt;
      const mv = this.moving;
      this.moving = 0;
      turnTo(g, this.heading, dt, 8);
      if (this.fly) {
        const f = Math.sin(this.t * 16) * 0.9;
        wings[0].rotation.z = -f; wings[1].rotation.z = f;
        b.position.y = Math.sin(this.t * 5) * 0.08;
      } else {
        wings[0].rotation.z = wings[0].rotation.z * 0.7 + 1.35 * 0.3;
        wings[1].rotation.z = wings[1].rotation.z * 0.7 - 1.35 * 0.3;
        b.position.y = mv > 0 ? Math.abs(Math.sin(this.t * 18)) * 0.07 : 0;
        b.rotation.x = !mv && Math.sin(this.t * 3.1) > 0.85 ? 0.5 : 0; // peck
      }
    },
  };
  return a;
}

// ---------------------------------------------------------------- hand props
export const item = {
  /** The swag bag: a fat burlap sack tied at the neck, a big € on both sides, notes sticking out of the top. Stands on its base. */
  moneybag: (k = 1) => {
    const m = sculpt((v) => {
      const c = '#c9a85c', d = '#a98743', l = '#dcc07a';
      v.box(0, 0, 0, 0.5, 0.1, 0.42, d);
      v.box(0, 0.1, 0, 0.68, 0.36, 0.56, c, 0.04);
      v.box(0, 0.46, 0, 0.56, 0.14, 0.46, c);
      v.box(0, 0.6, 0, 0.3, 0.08, 0.26, d);
      v.box(0, 0.66, 0, 0.34, 0.05, 0.3, '#6e4f22');
      v.box(0, 0.71, 0, 0.42, 0.1, 0.36, l);
      v.box(-0.08, 0.78, 0.03, 0.2, 0.13, 0.03, '#6ab04c'); v.box(0.1, 0.8, -0.05, 0.18, 0.11, 0.03, '#7bc96f'); v.box(0.02, 0.79, -0.1, 0.16, 0.15, 0.03, '#58a04a');
      const E = ['..###', '.#...', '####.', '.#...', '####.', '.#...', '..###'];
      for (const fz of [1, -1]) E.forEach((row, r) => [...row].forEach((ch, i) => { if (ch === '#') v.box((i - 2) * 0.055 * fz, 0.43 - r * 0.045, fz * 0.285, 0.055, 0.045, 0.02, '#1f6b2a'); }));
    });
    m.scale.setScalar(k);
    return m;
  },
  sack: () => item.moneybag(),
  /** A bundle of banknotes with a paper band. */
  wad: () => sculpt((v) => { v.box(0, 0, 0, 0.3, 0.1, 0.16, '#6ab04c'); v.box(0, -0.005, 0, 0.08, 0.11, 0.17, '#f4f1e6'); }),
  crowbar: () => sculpt((v) => { v.box(0, -0.7, 0, 0.06, 0.7, 0.06, '#3d4651'); v.box(0, -0.76, 0.06, 0.06, 0.08, 0.18, '#3d4651'); v.box(0, -0.04, -0.05, 0.06, 0.06, 0.14, '#3d4651'); }),
  torch: () => piece((v, gl) => { v.box(0, -0.3, 0, 0.1, 0.3, 0.1, '#2b2b2b'); v.box(0, -0.38, 0, 0.14, 0.08, 0.14, '#555'); gl.box(0, -0.4, 0, 0.1, 0.03, 0.1, '#fff6c9'); }),
  /** A ticket book and pen for the warden. */
  pad: () => sculpt((v) => { v.box(0, 0, 0, 0.22, 0.03, 0.3, '#ffe066'); v.box(0, 0.03, 0, 0.2, 0.01, 0.28, '#fffdf2'); v.box(0.08, 0.04, 0.05, 0.03, 0.03, 0.2, '#1d3557'); }),
  megaphone: () => sculpt((v) => { v.box(0, 0, 0, 0.12, 0.12, 0.2, '#e63946'); v.box(0, -0.04, 0.2, 0.22, 0.2, 0.12, '#f1faee'); v.box(0, -0.16, 0, 0.06, 0.16, 0.08, '#333'); }),
  lollipop: () => sculpt((v) => { v.box(0, -0.25, 0, 0.03, 0.25, 0.03, '#fff'); v.box(0, 0, 0, 0.16, 0.16, 0.05, '#ff4d6d'); }),
  cuffs: () => sculpt((v) => { v.box(-0.07, 0, 0, 0.1, 0.1, 0.03, '#b8c0c6'); v.box(0.07, 0, 0, 0.1, 0.1, 0.03, '#b8c0c6'); v.box(0, 0.035, 0, 0.06, 0.03, 0.03, '#8a9299'); }),
  fries: () => sculpt((v) => {
    v.box(0, 0, 0, 0.26, 0.3, 0.2, '#e63946');
    for (let i = -1; i <= 1; i++) v.box(i * 0.07, 0.3, 0, 0.05, 0.16 + (i ? 0 : 0.05), 0.05, '#ffd166');
  }),
  balloon: (col = '#ff4d6d') => sculpt((v) => {
    v.box(0, 1.2, 0, 0.5, 0.6, 0.5, col);
    v.box(0, 1.1, 0, 0.14, 0.1, 0.14, col);
    v.box(0, 0, 0, 0.03, 1.1, 0.03, '#eeeeee');
  }),
  spray: () => sculpt((v) => {
    v.box(0, 0, 0, 0.16, 0.3, 0.16, '#ff006e');
    v.box(0, 0.3, 0, 0.08, 0.08, 0.08, '#eee');
  }),
  wafel: () => sculpt((v) => v.box(0, 0, 0, 0.3, 0.06, 0.3, '#c98a3c')),
  purse: () => sculpt((v) => {
    v.box(0, 0, 0, 0.34, 0.26, 0.14, '#b5179e');
    v.box(0, 0.26, 0, 0.2, 0.1, 0.04, '#7a0f6c');
  }),
  tv: () => sculpt((v) => {
    v.box(0, 0, 0, 0.9, 0.56, 0.12, '#222');
    v.box(0, 0.05, 0.06, 0.8, 0.46, 0.02, '#4cc9f0');
  }),
  wallet: () => sculpt((v) => v.box(0, 0, 0, 0.2, 0.14, 0.06, '#6f4e37')),
  ticket: () => sculpt((v) => v.box(0, 0, 0, 0.2, 0.02, 0.3, '#ffe066')),
  bomb: () => sculpt((v) => {
    v.box(0, 0, 0, 0.5, 0.5, 0.5, '#1b1b1b');
    v.box(0, 0.5, 0, 0.14, 0.1, 0.14, '#555');
    v.box(0, 0.6, 0, 0.05, 0.2, 0.05, '#d9b382');
  }),
  can: () => sculpt((v) => v.box(0, 0, 0, 0.3, 0.4, 0.3, '#9aa')),
  phone: () => sculpt((v) => {
    v.box(0, 0, 0, 0.14, 0.24, 0.03, '#1b1b1b');
    v.box(0, 0.02, 0.016, 0.11, 0.18, 0.01, '#8fd3f4');
  }),
  /** fishing rod; the pole runs along the arm, away from the shoulder */
  rod: () => sculpt((v) => {
    v.box(0, -1.5, 0, 0.05, 1.5, 0.05, '#8d6e4c');
    v.box(0.06, -0.15, 0, 0.1, 0.1, 0.1, '#9aa5ad');
  }),
  cutters: () => sculpt((v) => {
    v.box(-0.05, -0.62, 0, 0.05, 0.62, 0.05, '#d62828');
    v.box(0.05, -0.62, 0, 0.05, 0.62, 0.05, '#d62828');
    v.box(0, -0.7, 0, 0.17, 0.1, 0.06, '#b8c0c6');
  }),
  /** broom: the pole is perpendicular to the arm so it stands upright while the arm swings */
  broom: () => sculpt((v) => {
    v.box(0, 0, 0, 0.06, 0.06, 1.5, '#a0764a');
    v.box(0, -0.02, -0.82, 0.34, 0.12, 0.28, '#e0c27a');
  }),
  nightcap: () => sculpt((v) => {
    v.box(0, 0, 0, 0.7, 0.14, 0.7, '#ffffff');
    v.box(0, 0.14, 0, 0.5, 0.2, 0.5, '#d62828');
    v.box(0.1, 0.34, 0, 0.3, 0.2, 0.3, '#d62828');
    v.box(0.2, 0.54, 0, 0.14, 0.14, 0.14, '#ffffff');
  }),
  bumper: () => sculpt((v) => {
    v.box(0, 0, 0, 1.3, 0.14, 0.2, '#c9d1d6');
    v.box(0, 0.14, 0, 1.3, 0.1, 0.18, '#7d868c');
  }),
  paper: () => sculpt((v) => v.box(0, 0, 0, 0.34, 0.02, 0.44, '#fffdf2')),
  radio: () => sculpt((v) => {
    v.box(0, 0, 0, 0.4, 0.22, 0.22, '#2b2b2b');
    v.box(0, 0.04, 0.115, 0.28, 0.1, 0.01, '#ffb000');
  }),
  shoe: () => sculpt((v) => {
    v.box(0, 0, 0, 0.18, 0.12, 0.34, '#7a4a21');
    v.box(0, 0.12, -0.08, 0.16, 0.14, 0.16, '#7a4a21');
  }),
};
