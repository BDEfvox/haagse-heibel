// People, horses and animals out of boxes. All sizes are metres; a figure is drawn in its own frame (feet at its origin, front +z).
import { S, C, bx, shade, limb, frame, inFrame, POSES, HATS, HAIRS, HOLDS, FIG_OPTS, HORSE_OPTS, BLOCKY, warn, checkKeys } from './core.js';

// ------------------------------------------------------------------ people
/**
 * h = the figure's height as it appears: standing height for standing poses, the height of the seated / kneeling
 * figure (top of head above its seat's ground) for sit, kneel and sit-ground; for lie it is the length.
 */
export function figure(x, y, z, h, col, pose, o) {
  o = o || {};
  checkKeys(o, FIG_OPTS, 'fig');
  if (!POSES.includes(pose)) { if (pose !== undefined) warn('unknown pose ' + pose); pose = 'stand'; }
  const old = S.f;
  S.f = frame(x, y, z, +o.rotY || 0);
  try { person(h, C(col), pose, o); } finally { S.f = old; }
}

function person(h, hex, pose, o) {
  const child = !!o.child, wm = o.slim ? 0.72 : o.bulky ? 1.4 : 1, dm = o.slim ? 0.8 : o.bulky ? 1.3 : 1;
  const hip = child ? 0.4 : 0.47, th = child ? 0.3 : 0.33, nk = child ? 0.03 : 0.04, hd = child ? 0.27 : 0.15;
  const sitting = pose === 'sit' || (pose === 'think' && (o.seat !== undefined || o.sit));
  const kneel = pose === 'kneel', sg = pose === 'sit-ground', ride = !!o._ride;
  if (pose === 'lie') { lying(h, hex, o, hip, th, nk, hd, wm); return; }
  if (pose === 'fall') { falling(h, hex, o, wm); return; }
  if (pose === 'embrace') { embrace(h, hex, o); return; }
  const tb = ride ? 0 : sitting ? (child ? 0.24 : 0.27) : kneel ? 0.3 : sg ? 0.07 : hip;
  const stdTotal = hip + th + nk + hd;
  const u = ride ? h / stdTotal : h / (tb + th + nk + hd);
  const cloth = o.col2 ? C(o.col2) : hex, skin = hex;
  const dk = shade(cloth, 0.78), hair = shade(skin, 0.55);
  const q = (px, py, pz, w, hh, d, c, rot) => bx(px * u, py * u, pz * u, w * u, hh * u, d * u, c, rot || 0);
  const lb = (a, b, c, d, e, f, t, c2) => limb(a * u, b * u, c * u, d * u, e * u, f * u, t * u, c2);
  const shy = tb + th - 0.03, sh = shy - 0.77; // shoulder height, and the shift of absolute standing y values
  const headTop = tb + th + nk + hd;
  const leanZ = pose === 'run' ? 0.05 : 0;

  // ---- seat under a sitting figure
  if (sitting) {
    const sc = C(o.seat || 'stone');
    const blocky = !o.seat || BLOCKY.has(o.seat) || o.seat[0] === '#';
    if (blocky || !!ride) q(0, 0, -0.01, 0.46, 0.27, 0.42, sc);
    else {
      for (const sx of [-0.2, 0.2]) for (const sz of [-0.17, 0.17]) q(sx, 0, sz, 0.05, 0.23, 0.05, sc);
      q(0, 0.23, 0, 0.46, 0.04, 0.42, sc);
      q(0, 0.27, -0.2, 0.46, 0.5, 0.05, sc);
      for (const sx of [-0.23, 0.23]) q(sx, 0.31, -0.01, 0.05, 0.05, 0.36, sc);
      for (const sx of [-0.23, 0.23]) q(sx, 0.23, 0.14, 0.04, 0.08, 0.04, sc);
    }
  }

  // ---- legs
  const lw = 0.095 * wm, ld = 0.1 * dm;
  if (ride) {
    for (const s of [-1, 1]) { q(s * 0.17, -0.3, 0.02, 0.1 * wm, 0.32, 0.14, cloth); q(s * 0.17, -0.34, 0.05, 0.1 * wm, 0.06, 0.16, dk); }
  } else if (sitting) {
    if (o.robe) { q(0, tb - 0.02, 0.1, 0.3 * wm, 0.13, 0.3, cloth); q(0, 0.04, 0.27, 0.28 * wm, 0.24, 0.07, cloth); q(0, 0, 0.3, 0.22 * wm, 0.04, 0.12, dk); }
    else for (const s of [-1, 1]) { q(s * 0.07 * wm, tb - 0.02, 0.15, lw, 0.1, 0.32, cloth); q(s * 0.07 * wm, 0.03, 0.28, lw * 0.95, tb - 0.05, 0.09, cloth); q(s * 0.07 * wm, 0, 0.32, lw, 0.04, 0.15, dk); }
  } else if (kneel) {
    for (const s of [-1, 1]) { q(s * 0.07 * wm, 0, -0.1, lw, 0.09, 0.3, cloth); q(s * 0.07 * wm, 0.08, 0.04, lw, tb - 0.08, 0.12, cloth); }
    if (o.robe) q(0, 0, -0.02, 0.28 * wm, tb, 0.3, cloth);
  } else if (sg) {
    for (const s of [-1, 1]) q(s * 0.07 * wm, 0, 0.0, lw, 0.1, 0.52, cloth);
  } else if (o.robe) {
    q(0, 0, 0, 0.3 * wm, 0.12, 0.22 * dm, cloth);
    q(0, 0.12, 0, 0.27 * wm, hip - 0.1, 0.19 * dm, cloth);
    q(0, 0, 0.1, 0.18 * wm, 0.03, 0.08, dk);
  } else if (pose === 'walk' || pose === 'run' || pose === 'dance') {
    const sp = pose === 'run' ? 0.2 : pose === 'walk' ? 0.12 : 0.05;
    const lift = pose === 'run' ? 0.12 : 0;
    lb(-0.07 * wm, hip, 0, -0.07 * wm, 0.04 + lift * 0, -sp, 0.1 * wm, cloth);
    if (pose === 'dance') {
      lb(0.07 * wm, hip, 0, 0.3, 0.36, 0.08, 0.1 * wm, cloth);
      q(-0.07 * wm, 0, -sp + 0.0 - 0.0, lw, 0.04, 0.16, dk);
    } else {
      lb(0.07 * wm, hip, 0, 0.07 * wm, 0.04 + lift, sp, 0.1 * wm, cloth);
      q(-0.07 * wm, 0, -sp, lw, 0.04, 0.16, dk);
      q(0.07 * wm, lift, sp + 0.02, lw, 0.04, 0.16, dk);
    }
  } else {
    for (const s of [-1, 1]) { q(s * 0.065 * wm, 0.04, 0, lw, hip - 0.04, ld, cloth); q(s * 0.065 * wm, 0, 0.03, lw, 0.04, 0.17, dk); }
  }

  // ---- torso, neck, head
  const tw = 0.3 * wm, td = 0.15 * dm;
  q(0, tb, 0, 0.24 * wm, th * 0.52, 0.13 * dm, cloth);
  q(0, tb + th * 0.5, leanZ, tw, th * 0.5, td, cloth);
  if (o.robe && !ride) q(0, tb + 0.1, 0.075 * dm, 0.2 * wm, 0.07, 0.03, dk); // belt line
  q(0, tb + th, leanZ, 0.055, nk, 0.055, skin);
  const hy = tb + th + nk;
  q(0, hy, leanZ + (pose === 'think' || pose === 'run' ? 0.02 : 0), (child ? 0.19 : 0.115) * (o.bulky ? 1.15 : 1), hd, (child ? 0.19 : 0.125), skin);
  q(0, hy + hd * 0.38, leanZ + 0.07, 0.022, hd * 0.26, 0.025, skin);
  hat(o.hat, hair, cloth, hy, hd, child, leanZ, q, lb);
  hairdo(o.hair, hair, hy, hd, child, leanZ, q);

  // ---- cloak and wings
  if (o.cloak) {
    q(0, 0.12, -0.1, 0.34 * wm, tb + th - 0.1, 0.06, dk);
    q(-0.18 * wm, tb + th - 0.12, -0.02, 0.05, 0.1, 0.18, dk);
    q(0.18 * wm, tb + th - 0.12, -0.02, 0.05, 0.1, 0.18, dk);
  }
  if (o.wings) {
    for (const s of [-1, 1]) {
      q(s * 0.2, tb + th * 0.5, -0.1, 0.07, 0.46, 0.04, skin);
      q(s * 0.27, tb + th * 0.7, -0.1, 0.07, 0.5, 0.04, skin);
      q(s * 0.34, tb + th * 0.95, -0.1, 0.07, 0.4, 0.04, skin);
    }
  }

  // ---- arms
  const dy = (v) => v + sh;
  const hang = (s) => [[s * 0.185 * wm, dy(0.46), 0.02]];
  const aw = 0.075 * Math.pow(wm, 0.6);
  let act, idle;
  const holdPose = pose === 'stand' && o.hold && o.hold !== 'bag' && o.hold !== 'book' && o.hold !== 'paper' && o.hold !== 'hat';
  switch (holdPose ? 'hold' : pose) {
    case 'point': act = [[0.3, dy(0.79), 0.33]]; break;
    case 'arm-up': act = [[0.27, dy(1.07), 0.03]]; break;
    case 'arms-up': act = [[0.26, dy(1.06), 0.03]]; idle = [[-0.26, dy(1.06), 0.03]]; break;
    case 'hips': act = [[0.27, dy(0.63), 0], [0.15, dy(0.52), 0.06]]; idle = [[-0.27, dy(0.63), 0], [-0.15, dy(0.52), 0.06]]; break;
    case 'read': act = [[0.21, dy(0.63), 0.07], [0.05, dy(0.62), 0.17]]; idle = [[-0.21, dy(0.63), 0.07], [-0.05, dy(0.62), 0.17]]; break;
    case 'hold': act = [[0.22, dy(0.64), 0.07], [0.2, dy(0.66), 0.2]]; break;
    case 'walk': act = [[0.17, dy(0.52), 0.14]]; idle = [[-0.17, dy(0.52), -0.13]]; break;
    case 'run': act = [[0.23, dy(0.7), 0.12], [0.2, dy(0.86), 0.2]]; idle = [[-0.23, dy(0.64), -0.12], [-0.2, dy(0.78), -0.2]]; break;
    case 'dance': act = [[0.38, dy(1.02), 0]]; idle = [[-0.36, dy(0.6), 0.04]]; break;
    case 'think': if (sitting) { act = [[0.2, dy(0.62), 0.14], [0.04, dy(0.85), 0.12]]; idle = [[-0.2, dy(0.62), 0.12], [-0.15, dy(0.58), 0.25]]; } else { act = [[0.2, dy(0.63), 0.1], [0.04, dy(0.82), 0.09]]; idle = [[-0.19, dy(0.6), 0.04]]; } break;
    case 'salute':
      if (o.hold === 'hat') act = [[0.25, dy(0.82), 0.2], [0.29, dy(0.92), 0.36]];
      else act = [[0.22, dy(0.9), 0.05], [0.08, dy(0.93), 0.07]];
      break;
    case 'carry': act = [[0.28, dy(0.68), 0], [0.2, dy(0.9), 0.02]]; break;
    case 'sit': act = [[0.2, dy(0.62), 0.12], [0.15, dy(0.58), 0.25]]; idle = [[-0.2, dy(0.62), 0.12], [-0.15, dy(0.58), 0.25]]; break;
    default: act = hang(1);
  }
  if (!idle) idle = hang(-1);
  if (ride && pose === 'stand') { act = [[0.2, dy(0.6), 0.14], [0.1, dy(0.62), 0.24]]; idle = [[-0.2, dy(0.6), 0.1]]; }
  const sx0 = 0.17 * wm;
  const armTo = (side, pts, c) => {
    let px = side * sx0, py = shy, pz = leanZ;
    for (const p of pts) { lb(px, py, pz, p[0], p[1], p[2], aw, c); px = p[0]; py = p[1]; pz = p[2]; }
    return [px, py, pz];
  };
  const ah = armTo(1, act, cloth), ih = armTo(-1, idle, cloth);
  void ih;
  // hands in skin when clothes are a different colour
  if (o.col2) { q(ah[0], ah[1] - 0.03, ah[2], 0.06, 0.06, 0.06, skin); q(ih[0], ih[1] - 0.03, ih[2], 0.06, 0.06, 0.06, skin); }
  if (pose === 'read') q(0, dy(0.55), 0.18, 0.17, 0.13, 0.03, '#efe6cf');
  held(o.hold, ah, pose, u, hex, q, lb, o);
}

function hat(kind, hair, cloth, hy, hd, child, lz, q) {
  if (!kind) return;
  if (!HATS.includes(kind)) { warn('unknown hat ' + kind); return; }
  const top = hy + hd, hc = shade(hair, 1.0), dark = shade(hc, 0.8);
  switch (kind) {
    case 'tricorn':
      q(0, top - 0.02, lz, 0.25, 0.03, 0.25, hc); q(0, top + 0.01, lz, 0.13, 0.05, 0.13, hc);
      q(-0.125, top + 0.01, lz, 0.03, 0.05, 0.16, dark); q(0.125, top + 0.01, lz, 0.03, 0.05, 0.16, dark); q(0, top + 0.01, lz + 0.125, 0.14, 0.05, 0.03, dark); break;
    case 'tall': q(0, top - 0.02, lz, 0.2, 0.025, 0.2, hc); q(0, top, lz, 0.125, 0.14, 0.125, hc); break;
    case 'cap': q(0, top - 0.01, lz, 0.13, 0.05, 0.14, hc); q(0, top - 0.02, lz + 0.09, 0.11, 0.02, 0.05, dark); break;
    case 'helmet': q(0, top - 0.06, lz, 0.145, 0.1, 0.155, hc); q(0, top + 0.04, lz, 0.025, 0.045, 0.14, dark); break;
    case 'crown': q(0, top - 0.01, lz, 0.13, 0.04, 0.135, '#caa63c'); for (const sx of [-0.045, 0, 0.045]) q(sx, top + 0.03, lz, 0.025, 0.045, 0.03, '#caa63c'); break;
    case 'feather':
      q(0, top - 0.02, lz, 0.25, 0.025, 0.25, hc); q(0, top, lz, 0.13, 0.055, 0.13, hc);
      limb(0.05 * 1, top + 0.03, lz - 0.05, 0.1, top + 0.17, lz - 0.14, 0.025, '#e8e1d0'); break;
    case 'brim': q(0, top - 0.02, lz, 0.27, 0.02, 0.27, hc); q(0, top, lz, 0.13, 0.07, 0.13, hc); break;
    case 'scarf': q(0, top - 0.04, lz, 0.145, 0.09, 0.155, cloth); q(0, hy - 0.04, lz - 0.085, 0.13, 0.14, 0.04, cloth); break;
    default: break;
  }
}
function hairdo(kind, hair, hy, hd, child, lz, q) {
  if (!kind) return;
  if (!HAIRS.includes(kind)) { warn('unknown hair ' + kind); return; }
  const top = hy + hd;
  q(0, top - 0.035, lz, 0.125, 0.04, 0.135, hair);
  switch (kind) {
    case 'long': q(0, hy - 0.12, lz - 0.07, 0.13, 0.25, 0.04, hair); q(-0.065, hy - 0.05, lz, 0.025, 0.15, 0.12, hair); q(0.065, hy - 0.05, lz, 0.025, 0.15, 0.12, hair); break;
    case 'bun': q(0, top - 0.005, lz - 0.075, 0.065, 0.065, 0.065, hair); q(0, hy + 0.02, lz - 0.07, 0.12, 0.1, 0.03, hair); break;
    case 'mullet': q(0, hy - 0.08, lz - 0.07, 0.11, 0.2, 0.045, hair); break;
    case 'quiff': q(0, top, lz + 0.02, 0.115, 0.1, 0.1, hair); q(0, top - 0.01, lz + 0.075, 0.1, 0.06, 0.07, hair); q(0, hy + 0.03, lz - 0.07, 0.115, 0.1, 0.04, hair); break;
    default: break;
  }
}

function held(kind, hand, pose, u, hex, q, lb, o) {
  if (!kind) return;
  if (!HOLDS.includes(kind)) { warn('unknown hold ' + kind); return; }
  const [hx, hy, hz] = hand;
  const dk = shade(hex, 0.7);
  switch (kind) {
    case 'sword': q(hx, hy - 0.1, hz, 0.025, 0.62, 0.02, '#aeb5bb'); q(hx, hy - 0.01, hz, 0.1, 0.02, 0.03, dk); break;
    case 'staff': q(hx, 0, hz, 0.03, hy + 0.25, 0.03, shade(hex, 0.8)); break;
    case 'flag': q(hx, hy - 0.3, hz, 0.025, 1.1, 0.025, dk); q(hx + 0.12, hy + 0.55, hz, 0.22, 0.05, 0.015, '#ae1c28'); q(hx + 0.12, hy + 0.5, hz, 0.22, 0.05, 0.015, '#f2f2f2'); q(hx + 0.12, hy + 0.45, hz, 0.22, 0.05, 0.015, '#21468b'); break;
    case 'book': q(hx, hy - 0.08, hz, 0.1, 0.15, 0.04, '#5b3a29'); break;
    case 'paper': q(hx, hy - 0.06, hz + 0.02, 0.12, 0.15, 0.015, '#efe6cf'); break;
    case 'hat': q(hx, hy - 0.01, hz, 0.14, 0.05, 0.14, dk); q(hx, hy + 0.03, hz, 0.08, 0.04, 0.08, dk); break;
    case 'wreath': q(hx, hy - 0.04, hz, 0.2, 0.025, 0.2, '#3f8f4a'); q(hx, hy - 0.04, hz, 0.12, 0.03, 0.12, shade(hex, 0.5)); q(hx, hy - 0.03, hz + 0.1, 0.05, 0.04, 0.03, '#c8342b'); break;
    case 'torch': q(hx, hy - 0.05, hz, 0.03, 0.34, 0.03, '#6b4a2f'); q(hx, hy + 0.29, hz, 0.1, 0.12, 0.1, '#ff9a2e'); q(hx, hy + 0.37, hz, 0.06, 0.1, 0.06, '#ffd35a'); break;
    case 'child': inFrame(hx * u, (hy - 0.48) * u, (hz + 0.05) * u, 0, () => person(0.5 * u, hex, 'stand', { child: true })); break;
    case 'bag': q(hx, hy - 0.22, hz, 0.12, 0.15, 0.08, '#6b4a2f'); break;
    case 'ball': q(hx, hy - 0.02, hz, 0.13, 0.13, 0.13, '#e8e1d0'); break;
    case 'fish': q(hx, hy + 0.02, hz + 0.02, 0.05, 0.07, 0.24, '#aab4bb'); q(hx, hy + 0.01, hz - 0.12, 0.02, 0.1, 0.05, '#aab4bb'); break;
    case 'basket': q(hx, hy - 0.12, hz, 0.2, 0.1, 0.14, '#8a6a3a'); q(hx, hy - 0.02, hz, 0.14, 0.05, 0.1, '#aab4bb'); break;
    case 'bird': animal('bird', hx * u, (hy - 0.02) * u, hz * u, 0.16 * u, hex, 0); break;
    case 'instrument': q(hx, hy - 0.22, hz + 0.02, 0.1, 0.34, 0.05, '#8a5a2b'); q(hx, hy + 0.1, hz + 0.02, 0.025, 0.2, 0.025, dk); break;
    case 'rifle': q(hx, 0.2, hz, 0.03, 0.78, 0.03, '#3d3a36'); break;
    case 'tool': q(hx, hy - 0.2, hz, 0.025, 0.3, 0.025, '#6b4a2f'); q(hx, hy + 0.08, hz, 0.1, 0.05, 0.05, '#aeb5bb'); break;
    default: break;
  }
}

function lying(h, hex, o, hip, th, nk, hd, wm) {
  const u = h / (hip + th + nk + hd), cloth = o.col2 ? C(o.col2) : hex;
  const q = (px, py, pz, w, hh, d, c) => bx(px * u, py * u, pz * u, w * u, hh * u, d * u, c);
  const x0 = -0.5;
  q(x0 + 0.075, 0, 0, 0.15, 0.13, 0.13, hex); // head
  q(x0 + 0.17, 0, 0, 0.04, 0.06, 0.05, hex);
  q(x0 + 0.34, 0, 0, 0.33, 0.12, 0.28 * wm, cloth);
  for (const s of [-1, 1]) {
    q(x0 + 0.76, 0, s * 0.065, 0.47, 0.1, 0.095 * wm, cloth);
    q(x0 + 0.51, 0.04, s * 0.17 * wm, 0.3, 0.07, 0.07, cloth);
  }
  if (o.hat) hat(o.hat, shade(hex, 0.6), cloth, 0.12, 0.0, false, 0, (px, py, pz, w, hh, d, c) => bx((px + x0 + 0.075) * u, py * u, pz * u, w * u, hh * u, d * u, c));
}
function falling(h, hex, o, wm) {
  const u = h / 1.0, cloth = o.col2 ? C(o.col2) : hex;
  const lb = (a, b, c, d, e, f, t, c2) => limb(a * u, b * u, c * u, d * u, e * u, f * u, t * u, c2);
  const q = (px, py, pz, w, hh, d, c) => bx(px * u, py * u, pz * u, w * u, hh * u, d * u, c);
  q(-0.2, 0.06, 0, 0.15, 0.14, 0.13, hex);
  lb(-0.14, 0.25, 0, 0.1, 0.62, 0, 0.22 * wm, cloth);
  lb(0.08, 0.62, 0.03, 0.28, 0.98, 0.05, 0.1, cloth); lb(0.12, 0.62, -0.03, 0.4, 0.86, -0.02, 0.1, cloth);
  lb(-0.1, 0.45, 0, -0.36, 0.62, 0.02, 0.07, cloth); lb(-0.04, 0.4, 0, 0.18, 0.24, 0.02, 0.07, cloth);
  if (o.wings) for (const s of [-1, 1]) lb(0.0, 0.5, s * 0.05, 0.12, 0.96, s * 0.34, 0.06, hex);
}
function embrace(h, hex, o) {
  const cloth = o.col2 ? C(o.col2) : hex;
  for (const s of [-1, 1]) {
    inFrame(s * 0.1 * h, 0, 0, 0, () => {
      const u = h, q = (px, py, pz, w, hh, d, c) => bx(px * u, py * u, pz * u, w * u, hh * u, d * u, c);
      for (const l of [-1, 1]) q(l * 0.065, 0, 0, 0.095, 0.47, 0.1, cloth);
      q(0, 0.47, 0, 0.26, 0.33, 0.14, cloth); q(0, 0.8, 0, 0.055, 0.04, 0.055, hex);
      q(s * -0.02, 0.84, 0.01, 0.115, 0.15, 0.125, hex);
      if (o.hair) q(s * -0.02, 0.97, 0, 0.125, 0.04, 0.135, shade(hex, 0.55));
      limb(0.17 * u * -s, 0.77 * u, 0, -s * 0.2 * u, 0.62 * u, -0.06 * u, 0.07 * u, cloth);
      limb(-s * 0.2 * u, 0.62 * u, -0.06 * u, -s * 0.34 * u, 0.62 * u, -0.06 * u, 0.07 * u, cloth);
      limb(s * 0.17 * u, 0.77 * u, 0, s * 0.13 * u, 0.5 * u, 0.05 * u, 0.07 * u, cloth);
    });
  }
}

export function bust(x, y, z, h, col, o) {
  o = o || {};
  checkKeys(o, FIG_OPTS, 'bust');
  const hex = C(col), cloth = o.col2 ? C(o.col2) : hex, hair = shade(hex, 0.55);
  const old = S.f;
  S.f = frame(x, y, z, +o.rotY || 0);
  try {
    const q = (px, py, pz, w, hh, d, c) => bx(px * h, py * h, pz * h, w * h, hh * h, d * h, c);
    q(0, 0, 0, 0.62, 0.25, 0.3, cloth);
    q(0, 0.25, 0, 0.46, 0.14, 0.26, cloth);
    q(0, 0.39, 0, 0.14, 0.08, 0.14, hex);
    q(0, 0.47, 0, 0.3, 0.4, 0.3, hex);
    q(0, 0.6, 0.17, 0.06, 0.12, 0.05, hex);
    const uu = h * 2.6, qq = (px, py, pz, w, hh, d, c) => bx(px * uu, py * uu, pz * uu, w * uu, hh * uu, d * uu, c);
    hat(o.hat, hair, cloth, (0.47 * h) / uu, (0.4 * h) / uu, false, 0, qq);
    hairdo(o.hair, hair, (0.47 * h) / uu, (0.4 * h) / uu, false, 0, qq);
  } finally { S.f = old; }
}
export function head(x, y, z, h, col) {
  const hex = C(col), old = S.f;
  S.f = frame(x, y, z, 0);
  try {
    bx(0, 0, 0, h * 0.8, h, h * 0.9, hex);
    bx(0, h * 0.32, h * 0.5, h * 0.14, h * 0.28, h * 0.12, hex);
    for (const s of [-1, 1]) bx(s * h * 0.45, h * 0.35, 0, h * 0.1, h * 0.22, h * 0.14, hex);
  } finally { S.f = old; }
}

// ------------------------------------------------------------------ horse
export function horse(x, y, z, H, col, o) {
  o = o || {};
  checkKeys(o, HORSE_OPTS, 'horse');
  checkKeys(o.riderOpts, FIG_OPTS, 'rider');
  const hex = C(col), dark = shade(hex, 0.6), old = S.f;
  S.f = frame(x, y, z, +o.rotY || 0);
  try {
    const q = (px, py, pz, w, hh, d, c) => bx(px * H, py * H, pz * H, w * H, hh * H, d * H, c);
    let saddleY, saddleZ;
    if (o.rear) {
      for (const s of [-1, 1]) { q(s * 0.085, 0.18, -0.3, 0.1, 0.2, 0.1, hex); q(s * 0.085, 0, -0.3, 0.06, 0.2, 0.07, hex); q(s * 0.085, 0, -0.29, 0.07, 0.04, 0.09, dark); }
      q(0, 0.3, -0.26, 0.23, 0.3, 0.2, hex);
      q(0, 0.42, -0.08, 0.22, 0.3, 0.3, hex);
      q(0, 0.5, 0.12, 0.21, 0.3, 0.2, hex);
      q(0, 0.64, 0.24, 0.12, 0.2, 0.12, hex); q(0, 0.78, 0.3, 0.11, 0.17, 0.11, hex);
      q(0, 0.64, 0.19, 0.035, 0.28, 0.05, dark);
      q(0, 0.83, 0.34, 0.1, 0.15, 0.12, hex); q(0, 0.8, 0.4, 0.08, 0.1, 0.1, hex);
      for (const s of [-1, 1]) { q(s * 0.03, 0.97, 0.33, 0.025, 0.04, 0.025, hex); q(s * 0.085, 0.58, 0.28, 0.07, 0.16, 0.08, hex); q(s * 0.085, 0.5, 0.36, 0.06, 0.1, 0.08, hex); q(s * 0.085, 0.47, 0.38, 0.07, 0.04, 0.08, dark); }
      q(0, 0.1, -0.4, 0.04, 0.26, 0.06, dark);
      saddleY = 0.6; saddleZ = -0.12;
    } else {
      for (const s of [-1, 1]) {
        q(s * 0.085, 0.2, -0.27, 0.1, 0.16, 0.12, hex); q(s * 0.085, 0.03, -0.28, 0.06, 0.2, 0.07, hex); q(s * 0.085, 0, -0.28, 0.07, 0.04, 0.09, dark);
      }
      q(-0.085, 0.2, 0.2, 0.1, 0.16, 0.11, hex); q(-0.085, 0.03, 0.2, 0.06, 0.2, 0.07, hex); q(-0.085, 0, 0.2, 0.07, 0.04, 0.09, dark);
      q(0.085, 0.2, 0.2, 0.1, 0.16, 0.11, hex); q(0.085, 0.16, 0.27, 0.06, 0.07, 0.12, hex); q(0.085, 0.04, 0.3, 0.06, 0.13, 0.07, hex); q(0.085, 0.01, 0.3, 0.07, 0.04, 0.09, dark);
      q(0, 0.34, -0.04, 0.22, 0.27, 0.6, hex);
      q(0, 0.36, 0.22, 0.21, 0.28, 0.1, hex);
      q(0, 0.52, 0.26, 0.12, 0.24, 0.12, hex); q(0, 0.62, 0.31, 0.11, 0.17, 0.11, hex);
      q(0, 0.56, 0.2, 0.035, 0.24, 0.05, dark);
      q(0, 0.76, 0.35, 0.1, 0.17, 0.12, hex); q(0, 0.7, 0.42, 0.08, 0.14, 0.1, hex);
      for (const s of [-1, 1]) q(s * 0.03, 0.93, 0.34, 0.025, 0.07, 0.025, hex);
      q(0, 0.38, -0.36, 0.045, 0.3, 0.05, dark);
      saddleY = 0.61; saddleZ = -0.03;
    }
    if (o.rider !== undefined && o.rider !== null) {
      const ro = Object.assign({}, o.riderOpts || {}, { _ride: true });
      const hr = H * 0.74;
      inFrame(0, saddleY * H, saddleZ * H, 0, () => person(hr, hex, POSES.includes(o.rider) ? o.rider : 'stand', ro));
    }
  } finally { S.f = old; }
}

// ------------------------------------------------------------------ animals
// [x, y, z, w, h, d, colour key] in units of the body length; head towards +z.
// keys: 0 the colour, 1 darker, 2 lighter, 3 white, 4 black, 5 orange, 6 red, 7 pink
const AN = {
  dog: [[0, .28, -.05, .22, .24, .46, 0], [.08, 0, .12, .07, .28, .07, 0], [-.08, 0, .12, .07, .28, .07, 0], [.08, 0, -.24, .07, .28, .07, 0], [-.08, 0, -.24, .07, .28, .07, 0], [0, .4, .2, .14, .2, .12, 0], [0, .44, .3, .16, .16, .14, 0], [0, .43, .4, .09, .09, .1, 2], [.07, .58, .27, .04, .09, .04, 1], [-.07, .58, .27, .04, .09, .04, 1], [0, .45, -.34, .05, .16, .05, 0]],
  cat: [[0, .22, -.05, .18, .18, .44, 0], [.06, 0, .14, .06, .22, .06, 0], [-.06, 0, .14, .06, .22, .06, 0], [.06, 0, -.22, .06, .22, .06, 0], [-.06, 0, -.22, .06, .22, .06, 0], [0, .34, .24, .17, .15, .13, 0], [.05, .48, .24, .04, .06, .04, 1], [-.05, .48, .24, .04, .06, .04, 1], [0, .2, -.32, .05, .05, .14, 0], [0, .22, -.42, .05, .34, .05, 0]],
  bird: [[0, .25, 0, .3, .28, .55, 0], [0, .45, .3, .22, .22, .2, 0], [0, .45, .45, .06, .06, .12, 5], [0, .3, -.4, .16, .05, .28, 1], [.06, 0, 0, .04, .25, .04, 5], [-.06, 0, 0, .04, .25, .04, 5], [.17, .28, -.02, .06, .2, .4, 1], [-.17, .28, -.02, .06, .2, .4, 1]],
  stork: [[.07, 0, 0, .035, .6, .035, 6], [-.07, 0, 0, .035, .6, .035, 6], [0, .55, -.02, .26, .28, .55, 0], [.14, .6, -.05, .04, .18, .45, 4], [-.14, .6, -.05, .04, .18, .45, 4], [0, .8, .2, .07, .3, .07, 0], [0, 1.04, .26, .1, .1, .14, 0], [0, 1.02, .44, .045, .045, .3, 6], [0, .6, -.32, .18, .05, .2, 4]],
  heron: [[.05, 0, 0, .03, .6, .03, 5], [-.05, 0, 0, .03, .6, .03, 5], [0, .55, -.02, .2, .26, .55, 0], [0, .78, .18, .06, .22, .06, 0], [0, .98, .26, .06, .22, .06, 0], [0, 1.14, .3, .09, .09, .14, 0], [0, 1.12, .44, .04, .04, .26, 5], [0, 1.2, .2, .03, .04, .12, 4], [0, .5, -.32, .12, .05, .22, 1]],
  gull: [[.04, 0, 0, .025, .18, .025, 5], [-.04, 0, 0, .025, .18, .025, 5], [0, .18, -.02, .22, .2, .5, 3], [0, .34, .26, .16, .15, .15, 3], [0, .32, .37, .04, .04, .1, 5], [.13, .2, -.08, .04, .14, .4, 2], [-.13, .2, -.08, .04, .14, .4, 2], [0, .22, -.36, .12, .04, .18, 3]],
  duck: [[0, .1, -.02, .3, .2, .5, 0], [0, .28, .22, .1, .22, .1, 0], [0, .38, .27, .14, .13, .13, 0], [0, .37, .37, .08, .04, .1, 5], [0, .2, -.32, .1, .1, .1, 1]],
  swan: [[0, .2, -.05, .3, .25, .6, 3], [0, .4, .24, .09, .3, .09, 3], [0, .66, .27, .09, .1, .14, 3], [0, .7, .33, .1, .1, .16, 3], [0, .68, .43, .06, .05, .1, 5], [.17, .34, -.1, .05, .18, .4, 3], [-.17, .34, -.1, .05, .18, .4, 3], [0, .3, -.38, .12, .1, .14, 3]],
  owl: [[0, 0, 0, .4, .55, .35, 0], [0, .55, 0, .42, .28, .34, 0], [.14, .8, 0, .08, .1, .08, 1], [-.14, .8, 0, .08, .1, .08, 1], [.1, .64, .18, .1, .1, .03, 3], [-.1, .64, .18, .1, .1, .03, 3], [0, .58, .19, .05, .07, .04, 5], [.22, .1, -.04, .05, .42, .3, 1], [-.22, .1, -.04, .05, .42, .3, 1]],
  lion: [[0, .38, -.1, .3, .34, .7, 0], [.1, 0, .2, .1, .4, .1, 0], [-.1, 0, .2, .1, .4, .1, 0], [.1, 0, -.35, .1, .4, .1, 0], [-.1, 0, -.35, .1, .4, .1, 0], [0, .45, .3, .4, .42, .18, 1], [0, .5, .42, .26, .26, .2, 0], [0, .46, .54, .16, .12, .1, 2], [0, .3, -.5, .05, .05, .3, 0], [0, .26, -.68, .08, .12, .1, 1]],
  cow: [[0, .4, 0, .34, .36, .7, 0], [.1, 0, .25, .09, .4, .09, 0], [-.1, 0, .25, .09, .4, .09, 0], [.1, 0, -.25, .09, .4, .09, 0], [-.1, 0, -.25, .09, .4, .09, 0], [0, .45, .46, .2, .22, .18, 0], [0, .4, .56, .14, .12, .06, 7], [.1, .66, .45, .03, .06, .03, 3], [-.1, .66, .45, .03, .06, .03, 3], [0, .1, -.38, .04, .35, .04, 1], [0, .55, .0, .36, .16, .3, 3]],
  sheep: [[0, .3, 0, .36, .34, .5, 3], [.1, 0, .15, .06, .3, .06, 1], [-.1, 0, .15, .06, .3, .06, 1], [.1, 0, -.15, .06, .3, .06, 1], [-.1, 0, -.15, .06, .3, .06, 1], [0, .38, .32, .15, .2, .16, 1], [.09, .5, .3, .05, .04, .08, 1], [-.09, .5, .3, .05, .04, .08, 1], [0, .4, -.28, .1, .1, .06, 3]],
  goat: [[0, .3, 0, .2, .26, .55, 0], [.07, 0, .18, .05, .3, .05, 0], [-.07, 0, .18, .05, .3, .05, 0], [.07, 0, -.2, .05, .3, .05, 0], [-.07, 0, -.2, .05, .3, .05, 0], [0, .46, .3, .12, .28, .12, 0], [0, .62, .34, .13, .13, .18, 0], [.04, .74, .28, .025, .14, .025, 1], [-.04, .74, .28, .025, .14, .025, 1], [0, .55, .42, .03, .1, .03, 3]],
  pig: [[0, .22, 0, .3, .28, .6, 0], [.09, 0, .2, .07, .22, .07, 0], [-.09, 0, .2, .07, .22, .07, 0], [.09, 0, -.2, .07, .22, .07, 0], [-.09, 0, -.2, .07, .22, .07, 0], [0, .26, .34, .2, .2, .18, 0], [0, .27, .46, .12, .1, .05, 7], [.08, .44, .36, .05, .06, .06, 7], [-.08, .44, .36, .05, .06, .06, 7], [0, .36, -.34, .04, .1, .04, 7]],
  deer: [[0, .46, 0, .22, .26, .55, 0], [.06, 0, .2, .05, .5, .05, 0], [-.06, 0, .2, .05, .5, .05, 0], [.06, 0, -.22, .05, .5, .05, 0], [-.06, 0, -.22, .05, .5, .05, 0], [0, .62, .3, .1, .34, .12, 0], [0, .92, .36, .12, .14, .2, 0], [.05, 1.05, .32, .02, .22, .02, 2], [-.05, 1.05, .32, .02, .22, .02, 2], [.1, 1.2, .32, .1, .02, .02, 2], [-.1, 1.2, .32, .1, .02, .02, 2], [0, .56, -.3, .06, .1, .05, 3]],
  bear: [[0, .38, 0, .4, .42, .7, 0], [.14, 0, .24, .14, .38, .16, 0], [-.14, 0, .24, .14, .38, .16, 0], [.14, 0, -.26, .14, .38, .16, 0], [-.14, 0, -.26, .14, .38, .16, 0], [0, .5, .44, .26, .26, .24, 0], [0, .46, .58, .14, .12, .1, 2], [.1, .74, .4, .07, .07, .06, 1], [-.1, .74, .4, .07, .07, .06, 1]],
  seal: [[0, .12, 0, .3, .22, .7, 0], [.08, .1, -.42, .12, .05, .14, 1], [-.08, .1, -.42, .12, .05, .14, 1], [0, .26, .38, .2, .24, .2, 0], [0, .28, .49, .1, .1, .08, 1], [.17, .06, .2, .1, .04, .18, 1], [-.17, .06, .2, .1, .04, .18, 1]],
  fish: [[0, .1, 0, .14, .26, .6, 0], [0, .12, .34, .12, .2, .14, 0], [0, .08, -.38, .04, .34, .16, 1], [0, .34, 0, .03, .1, .2, 1], [.05, .2, .38, .02, .03, .03, 4]],
  whale: [[0, .15, 0, .5, .45, 1, 0], [0, .12, .45, .46, .4, .3, 0], [0, .35, -.55, .2, .2, .3, 0], [0, .52, -.64, .6, .04, .2, 1], [.28, .1, .2, .2, .04, .2, 1], [-.28, .1, .2, .2, .04, .2, 1], [0, .2, .52, .4, .06, .1, 3]],
  frog: [[0, .1, 0, .4, .3, .5, 0], [0, .25, .2, .36, .2, .3, 0], [.13, .42, .22, .1, .1, .1, 3], [-.13, .42, .22, .1, .1, .1, 3], [.2, 0, .18, .08, .2, .08, 0], [-.2, 0, .18, .08, .2, .08, 0], [.26, 0, -.12, .12, .2, .34, 0], [-.26, 0, -.12, .12, .2, .34, 0]],
  rabbit: [[0, .18, 0, .22, .26, .4, 0], [0, .3, .25, .18, .18, .16, 0], [.05, .5, .22, .05, .28, .04, 0], [-.05, .5, .22, .05, .28, .04, 0], [.08, 0, .15, .06, .16, .1, 0], [-.08, 0, .15, .06, .16, .1, 0], [.1, 0, -.12, .08, .2, .22, 0], [-.1, 0, -.12, .08, .2, .22, 0], [0, .24, -.24, .1, .1, .08, 3]],
  elephant: [[0, .55, 0, .6, .55, .9, 0], [.2, 0, .28, .2, .6, .22, 0], [-.2, 0, .28, .2, .6, .22, 0], [.2, 0, -.28, .2, .6, .22, 0], [-.2, 0, -.28, .2, .6, .22, 0], [0, .7, .5, .5, .5, .35, 0], [0, .35, .72, .14, .5, .14, 0], [0, .15, .8, .14, .22, .14, 0], [.34, .75, .4, .06, .4, .3, 1], [-.34, .75, .4, .06, .4, .3, 1], [.14, .5, .72, .04, .04, .25, 3], [-.14, .5, .72, .04, .04, .25, 3], [0, .3, -.5, .05, .4, .05, 1]],
  monkey: [[0, .2, 0, .24, .34, .2, 0], [0, .55, .04, .2, .2, .18, 0], [.17, .2, .04, .07, .3, .08, 0], [-.17, .2, .04, .07, .3, .08, 0], [.1, 0, .1, .09, .12, .2, 0], [-.1, 0, .1, .09, .12, .2, 0], [0, .1, -.15, .04, .04, .3, 1], [0, .1, -.28, .04, .3, .04, 1], [0, .55, .14, .12, .1, .05, 2]],
  turtle: [[0, .1, 0, .5, .22, .7, 0], [0, .3, -.02, .38, .08, .55, 1], [0, .15, .4, .12, .12, .16, 0], [.28, 0, .2, .1, .1, .14, 0], [-.28, 0, .2, .1, .1, .14, 0], [.28, 0, -.2, .1, .1, .14, 0], [-.28, 0, -.2, .1, .1, .14, 0]],
  snail: [[0, 0, 0, .14, .08, .5, 0], [0, .08, -.1, .3, .32, .3, 1], [0, .2, -.1, .16, .16, .32, 2], [.04, .08, .28, .02, .2, .02, 0], [-.04, .08, .28, .02, .2, .02, 0]],
  rhino: [[0, .4, 0, .4, .44, .9, 0], [.15, 0, .3, .17, .4, .2, 0], [-.15, 0, .3, .17, .4, .2, 0], [.15, 0, -.3, .17, .4, .2, 0], [-.15, 0, -.3, .17, .4, .2, 0], [0, .45, .55, .28, .3, .4, 0], [0, .75, .68, .07, .2, .07, 3], [0, .7, .56, .05, .1, .05, 3], [.12, .74, .42, .06, .08, .05, 1], [-.12, .74, .42, .06, .08, .05, 1]],
};
export function animal(kind, x, y, z, size, col, rotY) {
  if (kind === 'horse') { horse(x, y, z, size * 0.85, col, { rotY }); return; }
  const t = AN[kind];
  if (!t) { warn('unknown animal ' + kind); return; }
  const hex = C(col), L = size;
  const pal = [hex, shade(hex, 0.62), shade(hex, 1.25), '#f2f2f2', '#1d1f22', '#e8a02b', '#c8342b', '#d9a0a0'];
  const old = S.f;
  S.f = frame(x, y, z, +rotY || 0);
  try { for (const e of t) bx(e[0] * L, e[1] * L, e[2] * L, e[3] * L, e[4] * L, e[5] * L, pal[e[6]]); } finally { S.f = old; }
}
