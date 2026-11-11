// The cast: blocky people, critters and their little walk cycles.
import * as THREE from 'three';
import { Vox, MAT, sculpt, TAU, clamp } from './kit.js';

const SKINS = ['#f2c9a0', '#e8b48a', '#c98e62', '#9a6642', '#f7d7b5', '#7a4f33'];
const SHIRTS = ['#e84a5f', '#2a9d8f', '#f4a261', '#457b9d', '#e9c46a', '#9d4edd', '#ff7aa2', '#3a86ff', '#ffffff', '#52b788', '#fb8500'];
const PANTS = ['#2b3a55', '#3d405b', '#6b705c', '#1d3557', '#5c4033', '#22223b', '#4a4e69'];
const HAIRS = ['#2b1d14', '#5a3825', '#c58b3c', '#e6c36a', '#111111', '#a33b20', '#cfcfcf'];

function turnTo(g, heading, dt, k = 12) {
  let d = heading - g.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  g.rotation.y += d * Math.min(1, dt * k);
}

/** People are scaled by this on top of their nominal scale so they read as about 2 m tall next to real-size cars. */
export const PERSON_K = 0.72;

/**
 * Biped. Forward is +z. Options:
 *  kind: 'civ' | 'cop' | 'robber' | 'raccoon' | 'kid' | 'granny' | 'hoodie' | 'chef'
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
  if (kind === 'cop') { shirt = '#1b2a4a'; pants = '#16223d'; hat = 'cop'; shoes = '#111'; }
  if (kind === 'robber') { stripes = true; pants = '#1c1c1c'; hat = 'beanie'; mask = true; shoes = '#111'; }
  if (kind === 'raccoon') { skin = '#9a9a9a'; shirt = '#8a8a8a'; pants = '#777777'; hair = '#9a9a9a'; hat = null; mask = true; ears = true; tail = true; scale = o.scale ?? 0.85; shoes = '#3a3a3a'; }
  if (kind === 'kid') { scale = o.scale ?? 0.85; }
  if (kind === 'granny') { hair = '#dcdcdc'; shirt = o.shirt || '#b388eb'; skirt = true; hat = null; scale = o.scale ?? 1.1; }
  if (kind === 'hoodie') { shirt = o.shirt || '#3a3a3a'; hood = true; hat = null; pants = '#2a2a2a'; }
  if (kind === 'chef') { shirt = '#ffffff'; pants = '#444'; hat = 'chef'; }

  const g = new THREE.Group();
  const b = new THREE.Group(); // bobbing body root
  g.add(b);
  scale *= PERSON_K;
  g.scale.setScalar(scale);

  const limb = (x, y, w, h, d, col, foot) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    p.add(sculpt((v) => {
      v.box(0, -h, 0, w, h, d, col);
      if (foot) v.box(0, -h, 0.05, w + 0.02, 0.14, d + 0.12, foot);
    }));
    b.add(p);
    return p;
  };
  const legL = limb(-0.2, 0.7, 0.3, 0.7, 0.32, skirt ? skin : pants, shoes);
  const legR = limb(0.2, 0.7, 0.3, 0.7, 0.32, skirt ? skin : pants, shoes);

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
    }
    if (kind === 'chef') v.box(0, 0.5, 0.05, 0.7, 0.75, 0.42, '#f1f1f1');
    if (tail) {
      for (let i = 0; i < 4; i++) v.box(0, 0.62 + i * 0.1, -0.34 - i * 0.16, 0.24, 0.24, 0.18, i % 2 ? '#3a3a3a' : '#a0a0a0');
    }
  }));

  const armCol = stripes ? '#f5f5f5' : shirt;
  const arm = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 1.46, 0);
    p.add(sculpt((v) => {
      v.box(0, -0.5, 0, 0.24, 0.5, 0.28, armCol);
      v.box(0, -0.7, 0, 0.22, 0.2, 0.26, skin);
    }));
    b.add(p);
    return p;
  };
  const armL = arm(-0.51), armR = arm(0.51);

  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  head.add(sculpt((v) => {
    v.box(0, 0, 0, 0.66, 0.62, 0.62, skin);
    // eyes
    v.box(-0.16, 0.3, 0.31, 0.11, 0.13, 0.03, '#1b1b1b');
    v.box(0.16, 0.3, 0.31, 0.11, 0.13, 0.03, '#1b1b1b');
    if (mask) {
      v.box(0, 0.26, 0.005, 0.68, 0.2, 0.635, '#161616');
      v.box(-0.16, 0.31, 0.325, 0.12, 0.1, 0.02, '#ffffff');
      v.box(0.16, 0.31, 0.325, 0.12, 0.1, 0.02, '#ffffff');
    }
    if (kind === 'raccoon') {
      v.box(0, 0.06, 0.36, 0.3, 0.2, 0.14, '#e9e9e9'); // snout
      v.box(0, 0.18, 0.44, 0.1, 0.08, 0.04, '#111');
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
      const c = rnd.pick(SHIRTS);
      v.box(0, 0.58, 0, 0.7, 0.16, 0.66, c);
      v.box(0, 0.58, 0.4, 0.5, 0.06, 0.22, c);
    } else if (hat === 'chef') {
      v.box(0, 0.6, 0, 0.6, 0.4, 0.56, '#ffffff');
      v.box(0, 0.94, 0, 0.74, 0.2, 0.7, '#ffffff');
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
  }));
  b.add(head);

  const a = {
    g, b, head, armL, armR, legL, legR, kind, scale,
    heading: 0, moving: 0, speed: o.speed ?? rnd.range(2.2, 3.2),
    ph: rnd() * TAU, t: rnd() * 10, arms: 'swing', gait: 'walk', pose: null, held: null, alive: true,
    face(h) { this.heading = h; g.rotation.y = h; },
    /** Attach an object to the right hand (or 'back'/'head'). */
    hold(obj, where = 'hand') {
      if (this.held) this.drop();
      this.held = obj;
      if (where === 'back') { obj.position.set(0, 0.85, -0.42); b.add(obj); }
      else if (where === 'head') { obj.position.set(0, 0.7, 0); head.add(obj); }
      else if (where === 'front') { obj.position.set(0, 0.9, 0.55); b.add(obj); }
      else { obj.position.set(0, -0.78, 0.1); armR.add(obj); }
      return obj;
    },
    drop() {
      const h = this.held;
      if (h && h.parent) h.parent.remove(h);
      this.held = null;
      return h;
    },
    update(dt) {
      this.t += dt;
      const mv = this.moving;
      this.moving = 0;
      turnTo(g, this.heading, dt);
      const k = Math.min(1, dt * 14);
      let la = 0, ra = 0, laz = 0, raz = 0, ll = 0, rl = 0, by = 0, lean = 0;
      if (this.pose === 'sit') {
        ll = rl = -1.5; by = -0.42;
      } else if (this.pose === 'ride') {
        ll = -1.1 + Math.sin(this.t * 9) * 0.5; rl = -1.1 - Math.sin(this.t * 9) * 0.5; by = -0.05; la = ra = -1.1; lean = 0.2;
      } else if (mv > 0) {
        const sneak = this.gait === 'sneak';
        this.ph += dt * (sneak ? 5 : 3.2 + mv * 1.9);
        const amp = sneak ? 1.0 : clamp(0.45 + mv * 0.11, 0, 1.15);
        const s = Math.sin(this.ph);
        ll = s * amp; rl = -s * amp; la = -s * amp * 0.9; ra = s * amp * 0.9;
        by = Math.abs(s) * (sneak ? 0.22 : mv > 4.5 ? 0.2 : 0.1);
        lean = sneak ? 0.32 : mv > 4.5 ? 0.24 : 0.05;
      } else {
        by = Math.sin(this.t * 2.2) * 0.012;
      }
      if (this.arms === 'up') { la = ra = -Math.PI + Math.sin(this.t * 22) * 0.35; laz = -0.3; raz = 0.3; }
      else if (this.arms === 'carry') { la = ra = -1.35; }
      else if (this.arms === 'fist') { ra = -2.7 + Math.sin(this.t * 20) * 0.35; }
      else if (this.arms === 'hold') { ra = -1.2; }
      else if (this.arms === 'wave') { ra = -2.8; raz = Math.sin(this.t * 12) * 0.4; }
      else if (this.arms === 'sneak') { la = ra = -1.0; laz = 0.2; raz = -0.2; }
      else if (this.arms === 'spray') { ra = -1.5 + Math.sin(this.t * 9) * 0.35; }
      armL.rotation.x += (la - armL.rotation.x) * k; armR.rotation.x += (ra - armR.rotation.x) * k;
      armL.rotation.z += (laz - armL.rotation.z) * k; armR.rotation.z += (raz - armR.rotation.z) * k;
      legL.rotation.x += (ll - legL.rotation.x) * k; legR.rotation.x += (rl - legR.rotation.x) * k;
      b.position.y += (by - b.position.y) * Math.min(1, dt * 20);
      b.rotation.x += (lean - b.rotation.x) * k;
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
    g, b, heading: 0, moving: 0, speed: 3, ph: rnd() * TAU, t: rnd() * 9, alive: true, pose: null,
    face(hd) { this.heading = hd; g.rotation.y = hd; },
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
      b.scale.y = 1;
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
    g, b, kind, heading: 0, moving: 0, fly: false, speed: 6, t: rnd() * 9, alive: true,
    face(hd) { this.heading = hd; g.rotation.y = hd; },
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
  sack: () => sculpt((v) => {
    v.box(0, 0, 0, 0.6, 0.62, 0.5, '#d8c08a');
    v.box(0, 0.62, 0, 0.3, 0.14, 0.26, '#b89b5e');
    v.box(0, 0.2, 0.26, 0.2, 0.26, 0.02, '#2f7d32');
  }),
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
