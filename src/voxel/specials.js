// Hand-made drawers for four real landmarks of The Hague (see landmarks.js for the drawing conventions).
// Pure drawing code: everything arrives through the arguments (c = building context, K = kit of helpers).
// Orientation is never assumed: fronts and corners are found with c.compass / c.far.

/** The facade of the footprint that faces a compass bearing. put() draws a box relative to it:
 *  a = offset along the facade, y = base height, o = offset OUTWARD from the wall (negative = inside). */
function facade(c, deg, minFrac = 0.3) {
  const [dx, dz] = c.compass(deg);
  const ax = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
  const s = (ax === 'x' ? dx : dz) >= 0 ? 1 : -1;
  const need = c.main.w * c.main.d * minFrac;
  let best = c.main, bs = -Infinity;
  for (const r of c.rects) {
    if (r.w * r.d < need) continue;
    const sc = s * (ax === 'x' ? r.x + (s * r.w) / 2 : r.z + (s * r.d) / 2);
    if (sc > bs + 0.01) { bs = sc; best = r; }
  }
  const pos = ax === 'x' ? best.x + (s * best.w) / 2 : best.z + (s * best.d) / 2;
  const mid = ax === 'x' ? best.z : best.x;
  const span = ax === 'x' ? best.d : best.w;
  const xz = (a, o) => (ax === 'z' ? [mid + a, pos + s * o] : [pos + s * o, mid + a]);
  const put = (b, a, y, o, wa, h, dp, col, vary) => {
    const [x, z] = xz(a, o);
    if (ax === 'z') b.box(x, y, z, wa, h, dp, col, vary);
    else b.box(x, y, z, dp, h, wa, col, vary);
  };
  return { ax, s, r: best, pos, mid, span, xz, put };
}

/** Pull a point towards (tx, tz) until it lies inside the real footprint. */
function snapIn(c, x, z, tx, tz) {
  for (let i = 0; i < 12 && !c.inside(x, z); i++) { x += (tx - x) * 0.2; z += (tz - z) * 0.2; }
  return [x, z];
}

/** A point just inside the footprint corner that lies furthest in a compass direction. */
function cornerSpot(c, deg, inset) {
  const [fx, fz] = c.far(deg);
  const x = fx - (fx >= 0 ? 1 : -1) * inset, z = fz - (fz >= 0 ? 1 : -1) * inset;
  return snapIn(c, x, z, c.main.x, c.main.z);
}

/** Square brick tower with clock faces, optional corner turrets and a slate spire. Returns the tip y. */
function squareTower(c, K, x, z, o) {
  const v = c.v, w = o.w, n = 4, dh = o.hs / n;
  v.setW(2);
  for (let i = 0; i < n; i++) {
    const ww = w * (1 - 0.025 * i);
    v.box(x, i * dh, z, ww, dh + 0.02, ww, o.brick, 0.03);
  }
  v.setW(0);
  v.box(x, o.hs, z, w * 1.12, 0.7, w * 1.12, o.band);
  const yb = o.hs + 0.7;
  v.box(x, yb, z, w * 0.96, o.hb - yb, w * 0.96, o.brick, 0.03);
  const cs = w * 0.36, cy = o.hb - cs - 1.2, off = (w * 0.96) / 2 + 0.1;
  for (const sg of [-1, 1]) {
    v.box(x + sg * off, cy, z, 0.25, cs, cs, '#f1ecdc');
    v.box(x, cy, z + sg * off, cs, cs, 0.25, '#f1ecdc');
    v.box(x + sg * (off + 0.12), cy + cs * 0.4, z, 0.12, cs * 0.2, cs * 0.12, '#2b2b2b');
    v.box(x, cy + cs * 0.4, z + sg * (off + 0.12), cs * 0.12, cs * 0.2, 0.12, '#2b2b2b');
  }
  v.box(x, o.hb, z, w * 1.2, 0.7, w * 1.2, o.band);
  if (o.turrets) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tx = x + sx * (w * 0.5 - 0.1), tz = z + sz * (w * 0.5 - 0.1);
      v.box(tx, o.hb + 0.7, tz, 1.5, 3.6, 1.5, o.brick);
      K.pyramid(v, tx, o.hb + 4.3, tz, 2, 2, 3, 3, o.slate);
    }
  }
  const sy = o.hb + 0.7;
  K.pyramid(v, x, sy, z, w * 0.88, w * 0.88, o.sp, 10, o.slate);
  v.box(x, sy + o.sp, z, 0.25, 1.4, 0.25, '#e6c34a');
  return sy + o.sp + 1.4;
}

export const SPECIALS = [
  // ------------------------------------------------------------------ Ridderzaal
  {
    id: 'ridderzaal', x: 919, y: 1069, minArea: 800,
    draw(c, K) {
      const { v, gl, night } = c;
      const brick = '#8c4a38', slate = '#383c44', stone = '#e4dccb', gold = '#e6c34a', HW = 14;
      K.body(c, HW, brick, 1);
      K.roofs(c, HW, slate, { steep: 0.9, max: 13 });
      const f = facade(c, 290);
      const gw = K.clamp(f.span * 0.42, 14, 26), n = 10, stepH = 14 / n;
      // gable wall and its stepped triangle (tip at 28 m)
      f.put(v, 0, 0, 0.4, gw, HW, 1.6, brick, 0.03);
      for (let i = 0; i < n; i++) {
        f.put(v, 0, HW + i * stepH, 0.4, Math.max(0.8, gw * (1 - (i + 0.5) / n)), stepH + 0.02, 1.6, i % 3 === 2 ? stone : brick, 0.03);
      }
      f.put(v, 0, HW + 14, 0.4, 0.3, 1.6, 0.3, gold);
      // rose window: a plus-shaped cluster of light boxes
      const wy = 19;
      f.put(v, 0, wy - 0.7, 1.3, 5.2, 1.4, 0.5, stone);
      f.put(v, 0, wy - 3.2, 1.3, 1.4, 5.2, 0.5, stone);
      for (const sa of [-1, 1]) for (const sy of [-1, 1]) f.put(v, sa * 1.7, wy - 0.2 + sy * 1.7 - 0.5, 1.3, 1.1, 1.1, 0.5, stone);
      f.put(v, 0, wy - 1.4, 1.5, 1.6, 1.6, 0.4, '#7a7f88');
      // lancet windows and door
      for (const a of [-gw * 0.28, 0, gw * 0.28]) {
        f.put(night ? gl : v, a, 7, 1.3, 0.9, 4, 0.4, night ? '#ffd97a' : '#2a2c31');
        f.put(night ? gl : v, a, 11.5, 1.3, 0.9, 2.4, 0.4, night ? '#ffd97a' : '#2a2c31');
      }
      f.put(v, 0, 0, 1.3, 3.4, 4.2, 0.5, stone);
      f.put(v, 0, 0, 1.45, 2.4, 3.4, 0.5, '#3a2a22');
      // two slender round towers with conical slate spires (tips at 38 m)
      for (const sg of [-1, 1]) {
        const a = sg * (gw / 2 + 1.9);
        for (let i = 0; i < 3; i++) {
          const w = 3.5 - 0.15 * i;
          f.put(v, a, i * 9, 0.2, w, 9.02, w * 0.72, brick, 0.03);
          f.put(v, a, i * 9, 0.2, w * 0.72, 9.02, w, brick, 0.03);
        }
        f.put(v, a, 27, 0.2, 4.2, 0.5, 4.2, stone);
        const [tx, tz] = f.xz(a, 0.2);
        K.pyramid(v, tx, 27.5, tz, 3.9, 3.9, 9.6, 9, slate);
        v.box(tx, 37.1, tz, 0.25, 1.4, 0.25, gold);
        v.box(tx, 36.6, tz, 0.6, 0.6, 0.6, gold);
      }
      c.tag(39);
      return true;
    },
  },

  // ------------------------------------------------------------------ Vredespaleis
  {
    id: 'vredespaleis', x: -366, y: 1824, minArea: 3000,
    draw(c, K) {
      const { v, gl, night } = c;
      const brick = '#9a4a3a', band = '#e0d6bf', slate = '#4a4f58', WH = 16;
      K.body(c, WH, brick, 1);
      const big = c.rects.slice().sort((a, b) => b.w * b.d - a.w * a.d).slice(0, 10);
      for (const r of big) {
        v.box(r.x, 5.2, r.z, r.w + 0.3, 0.5, r.d + 0.3, band);
        v.box(r.x, 10.6, r.z, r.w + 0.25, 0.4, r.d + 0.25, band);
        v.box(r.x, WH - 0.6, r.z, r.w + 0.5, 0.7, r.d + 0.5, band);
      }
      K.roofs(c, WH, slate, { steep: 0.7, max: 9 });
      // dormers along the long eaves
      let nd = 0;
      for (const r of big) {
        const alongX = r.w >= r.d, len = alongX ? r.w : r.d;
        if (len < 14) continue;
        const cnt = Math.floor(len / 10);
        for (let i = 0; i < cnt && nd < 30; i++) {
          const t = -len / 2 + ((i + 0.5) * len) / cnt;
          for (const sg of [-1, 1]) {
            if (nd >= 30) break;
            const dx = alongX ? r.x + t : r.x + sg * (r.w / 2 - 1.6);
            const dz = alongX ? r.z + sg * (r.d / 2 - 1.6) : r.z + t;
            v.box(dx, WH + 0.5, dz, 1.8, 2, 1.8, '#d8cdb5');
            v.box(dx, WH + 2.5, dz, 2.3, 0.6, 2.3, slate);
            nd++;
          }
        }
      }
      // row of light arches in the middle of the south-east front
      const f = facade(c, 135);
      const np = 9, sp = K.clamp(f.span * 0.06, 3.5, 5);
      f.put(v, 0, 0, 0.5, (np - 1) * sp + 1.2, 5.6, 0.5, '#2c2a2a');
      for (let i = 0; i < np; i++) f.put(v, (i - (np - 1) / 2) * sp, 0, 0.9, 1.2, 6.4, 1.4, band);
      f.put(v, 0, 6.4, 0.9, np * sp, 1, 1.4, band);
      if (night) for (let i = 0; i < np - 1; i++) f.put(gl, (i - (np - 2) / 2) * sp, 1.5, 0.6, 1.2, 2.6, 0.2, '#ffd97a');
      // the tall clock tower (80 m) and the smaller tower (45 m) on the two front corners
      const [cx, cz] = cornerSpot(c, 200, 5.5);
      const t1 = squareTower(c, K, cx, cz, { w: 9, hs: 52, hb: 62, sp: 17.3, brick, band, slate, turrets: true });
      const [sx, sz] = cornerSpot(c, 100, 4.5);
      const t2 = squareTower(c, K, sx, sz, { w: 6, hs: 30, hb: 36, sp: 8.3, brick, band, slate, turrets: false });
      c.tag(Math.max(t1, t2) + 1);
      return true;
    },
  },

  // ------------------------------------------------------------------ Grote Kerk
  {
    id: 'grotekerk', x: 490, y: 822, minArea: 1500,
    draw(c, K) {
      const { v } = c;
      const brick = '#8f4a3a', slate = '#454a52', stone = '#e0d8c6', gold = '#e6c34a';
      const m = c.main, NH = 12;
      K.body(c, NH, brick, 1);
      // west end: sign along local x of the west direction
      const wsg = c.compass(270)[0] >= 0 ? 1 : -1, esg = -wsg;
      K.roofs(c, NH, slate, { steep: 0.6, max: 7, skip: (r) => r === m });
      // several parallel steep roofs over the nave
      const nb = 3, dz = m.d / nb;
      for (let j = 0; j < nb; j++) K.gable(v, m.x, NH, m.z - m.d / 2 + (j + 0.5) * dz, m.w, dz, 7, 6, slate, true);
      // taller choir at the east end
      const cw = Math.min(22, m.w * 0.28), cd = m.d * 0.46;
      const chx = m.x + esg * (m.w / 2 - cw / 2 - 0.5);
      v.setW(1);
      v.box(chx, 0, m.z, cw, 17, cd, brick, 0.03);
      v.setW(0);
      K.gable(v, chx, 17, m.z, cw, cd, 8, 6, slate, false);
      K.gable(v, chx, 17, m.z, cw, cd, 8, 6, slate, true);
      v.box(chx + esg * (cw / 2 + 1), 0, m.z, 2, 11, cd * 0.6, brick, 0.03);
      K.gable(v, chx + esg * (cw / 2 + 1), 11, m.z, 2.4, cd * 0.6, 3, 3, slate, true);
      // west tower: six-sided brick shaft (cross of two boxes), balustrade, openwork crown, spire
      const [tx, tz] = snapIn(c, wsg * (c.L / 2 - 5.5), m.z, m.x, m.z);
      const n = 8, dh = 65 / n;
      v.setW(2);
      for (let i = 0; i < n; i++) {
        const w = 10 - 0.22 * i;
        v.box(tx, i * dh, tz, w, dh + 0.02, w * 0.82, brick, 0.03);
        v.box(tx, i * dh, tz, w * 0.82, dh + 0.02, w, brick, 0.03);
      }
      v.setW(0);
      for (const y of [22, 44]) v.box(tx, y, tz, 9.4, 0.5, 9.4, stone);
      const cs = 3.4, cy = 53, off = 4.35;
      for (const sg of [-1, 1]) {
        v.box(tx + sg * off, cy, tz, 0.25, cs, cs, '#f1ecdc');
        v.box(tx, cy, tz + sg * off, cs, cs, 0.25, '#f1ecdc');
      }
      v.box(tx, 65, tz, 9.6, 0.9, 9.6, stone); // balustrade ring
      for (const a of [-3.2, 0, 3.2]) for (const b of [-3.2, 0, 3.2]) {
        if (a === 0 && b === 0) continue;
        v.box(tx + a, 65.9, tz + b, 0.8, 10, 0.8, '#2a2d33');
      }
      v.box(tx, 65.9, tz, 2.6, 10, 2.6, '#3a3e46');
      for (const sg of [-1, 1]) {
        v.box(tx, 70, tz + sg * 3.2, 7, 0.4, 0.4, '#2a2d33');
        v.box(tx + sg * 3.2, 70, tz, 0.4, 0.4, 7, '#2a2d33');
      }
      v.box(tx, 75.9, tz, 6, 0.7, 6, stone);
      K.pyramid(v, tx, 76.6, tz, 4.6, 4.6, 15.4, 10, '#30343b');
      v.box(tx, 92, tz, 0.3, 2, 0.3, gold);
      v.box(tx, 91.6, tz, 0.7, 0.7, 0.7, gold);
      c.tag(94);
      return true;
    },
  },

  // ------------------------------------------------------------------ Kurhaus
  {
    id: 'kurhaus', x: -1255, y: 4808, minArea: 3000,
    draw(c, K) {
      const { v, gl, night } = c;
      const cream = '#e6d9b8', trim = '#f3ead2', red = '#8a4a3a', slate = '#474c55', gold = '#e6c34a';
      K.body(c, 17, cream, 1);
      for (const r of c.rects.slice().sort((a, b) => b.w * b.d - a.w * a.d).slice(0, 8)) {
        v.box(r.x, 16.5, r.z, r.w + 0.3, 0.6, r.d + 0.3, trim);
      }
      K.roofs(c, 17, red, { steep: 0.35, max: 5 });
      const f = facade(c, 315);
      const span = f.span;
      // Kurzaal: drum, cornice, big slate dome, lantern, flagpole
      const [kx, kz] = f.xz(0, -13);
      v.setW(1);
      v.box(kx, 0, kz, 26, 28, 26, cream, 0.03);
      v.setW(0);
      v.box(kx, 28, kz, 27, 0.6, 27, trim);
      K.dome(v, kx, 28.6, kz, 11, 8, slate);
      v.box(kx, 39.6, kz, 3.6, 4.8, 3.6, trim);
      (night ? gl : v).box(kx, 40.2, kz, 3.8, 2.8, 3.8, night ? '#ffe9a0' : '#bfe3ee');
      K.pyramid(v, kx, 44.4, kz, 4.2, 4.2, 2, 2, slate);
      K.flag(v, kx, 46.4, kz, 7, 1);
      // a pavilion tower with a smaller domed cap at both ends of the front
      let top = 54;
      for (const sg of [-1, 1]) {
        const [px, pz] = snapIn(c, ...f.xz(sg * (span / 2 - 8), -8), c.main.x, c.main.z);
        v.setW(1);
        v.box(px, 0, pz, 14, 25, 14, cream, 0.03);
        v.setW(0);
        v.box(px, 25, pz, 15.2, 0.8, 15.2, trim);
        K.dome(v, px, 25.8, pz, 6, 5, slate);
        v.box(px, 31.8, pz, 1.8, 2.4, 1.8, trim);
        v.box(px, 34.2, pz, 0.25, 1.4, 0.25, gold);
        top = Math.max(top, 35.6);
      }
      // terrace and colonnade along the sea front
      const tw = span * 0.92;
      f.put(v, 0, 0, 4, tw, 0.5, 8, '#cbbf9f');
      f.put(v, 0, 4.6, 4, tw, 0.5, 8.4, trim);
      const np = Math.min(22, Math.max(4, Math.floor(tw / 6)));
      for (let i = 0; i < np; i++) f.put(v, -tw / 2 + 0.5 + (i * (tw - 1)) / (np - 1), 0.5, 7.6, 0.6, 4.1, 0.6, trim);
      // lit facade windows at night
      if (night) {
        for (let i = 0; i < 14; i++) {
          const a = -span * 0.45 + (i * span * 0.9) / 13;
          f.put(gl, a, 6.5, 0.1, 1, 1.6, 0.2, '#ffd97a');
          f.put(gl, a, 11, 0.1, 1, 1.6, 0.2, '#ffd97a');
        }
      }
      c.tag(top);
      return true;
    },
  },
];
