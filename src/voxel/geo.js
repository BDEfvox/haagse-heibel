// Geometry helpers for the real-world street scenes: polyline paths, a class raster, footprint boxes.

/** A polyline you can walk along by arc length. Points are [x, z]. The street proper lies in [sA, sB]. */
export class Path {
  constructor(pts, sA = 0, sB = null) {
    this.p = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
    this.sA = sA;
    this.sB = sB ?? this.len;
  }
  _seg(s) {
    const c = this.cum;
    let lo = 0, hi = c.length - 2;
    if (s <= 0) return 0;
    if (s >= this.len) return hi;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (c[m] <= s) lo = m; else hi = m - 1;
    }
    return lo;
  }
  /** Point at arc length s (extrapolates straight past both ends). */
  raw(s, out = [0, 0]) {
    const i = this._seg(s), a = this.p[i], b = this.p[i + 1], l = this.cum[i + 1] - this.cum[i] || 1e-6;
    const t = (s - this.cum[i]) / l;
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    return out;
  }
  /** Position and smoothed unit tangent at s. */
  at(s, out = {}) {
    const p = this.raw(s, _a), q0 = this.raw(s - 2.5, _b), q1 = this.raw(s + 2.5, _c);
    let tx = q1[0] - q0[0], tz = q1[1] - q0[1];
    const l = Math.hypot(tx, tz) || 1;
    out.x = p[0]; out.z = p[1]; out.tx = tx / l; out.tz = tz / l;
    return out;
  }
  /** Street coords (s along, v across) → scene point. v > 0 is the +z side when the tangent is +x. */
  xz(s, v, out = [0, 0]) {
    const f = this.at(s, _f);
    out[0] = f.x - f.tz * v;
    out[1] = f.z + f.tx * v;
    return out;
  }
  /** Nearest point on the path: { s, v (signed offset), d }. */
  project(x, z) {
    const p = this.p;
    let best = Infinity, bs = 0, bv = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = p[i][0], az = p[i][1], dx = p[i + 1][0] - ax, dz = p[i + 1][1] - az;
      const l2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - (ax + dx * t), ez = z - (az + dz * t), d2 = ex * ex + ez * ez;
      if (d2 < best) {
        best = d2;
        const l = Math.sqrt(l2);
        bs = this.cum[i] + t * l;
        bv = (ex * -dz + ez * dx) / l;
      }
    }
    return { s: bs, v: bv, d: Math.sqrt(best) };
  }
}
const _a = [0, 0], _b = [0, 0], _c = [0, 0], _f = {};

// ---------------------------------------------------------------- class raster
let _xs = new Float64Array(64); // Grid.fill's scan-line crossings (grown on demand)
/** A grid of small integers (ground classes) over a rectangle of the scene. */
export class Grid {
  constructor(x0, z0, w, h, cell) {
    this.x0 = x0; this.z0 = z0; this.w = w; this.h = h; this.cell = cell;
    this.a = new Uint8Array(w * h);
  }
  get(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? 255 : this.a[j * this.w + i];
  }
  set(x, z, val, can = null) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return;
    const k = j * this.w + i;
    if (!can || can[this.a[k]]) this.a[k] = val;
  }
  /** Even-odd scanline fill. rings: flat [x, z, x, z, ...] arrays in scene coords. can: optional overwrite table. */
  fill(rings, val, can = null) {
    const { x0, z0, cell, w, h, a } = this;
    let minJ = Infinity, maxJ = -Infinity;
    const R = [];
    for (const r of rings) {
      const n = r.length >> 1;
      if (n < 3) continue;
      const g = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        g[i * 2] = (r[i * 2] - x0) / cell;
        const y = (g[i * 2 + 1] = (r[i * 2 + 1] - z0) / cell);
        if (y < minJ) minJ = y;
        if (y > maxJ) maxJ = y;
      }
      R.push(g);
    }
    if (!R.length) return;
    const j0 = Math.max(0, Math.floor(minJ)), j1 = Math.min(h - 1, Math.ceil(maxJ));
    // the crossings of a scan line go into one reused buffer, sorted in place (a scan line has a handful): the same order as
    // the numeric sort of a plain array, without an array and a sort per line (a crossing that is not a finite number, which
    // finite rings cannot give, falls back to that very sort)
    let xs = _xs;
    for (let j = j0; j <= j1; j++) {
      const yc = j + 0.5;
      let m = 0, odd = false;
      for (const g of R) {
        const n = g.length >> 1;
        for (let i = 0, k = n - 1; i < n; k = i++) {
          const ya = g[k * 2 + 1], yb = g[i * 2 + 1];
          if ((ya <= yc) === (yb <= yc)) continue;
          if (m === xs.length) { const b = new Float64Array(xs.length * 2); b.set(xs); xs = _xs = b; }
          const x = g[k * 2] + ((yc - ya) / (yb - ya)) * (g[i * 2] - g[k * 2]);
          if (!Number.isFinite(x)) odd = true;
          xs[m++] = x;
        }
      }
      if (m < 2) continue;
      if (odd) { const a2 = Array.from(xs.subarray(0, m)).sort((p, q) => p - q); for (let k = 0; k < m; k++) xs[k] = a2[k]; }
      else for (let k = 1; k < m; k++) { const x = xs[k]; let q = k - 1; while (q >= 0 && xs[q] > x) { xs[q + 1] = xs[q]; q--; } xs[q + 1] = x; }
      for (let k = 0; k + 1 < m; k += 2) {
        const i0 = Math.max(0, Math.ceil(xs[k] - 0.5)), i1 = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
        let o = j * w + i0;
        if (can) for (let i = i0; i <= i1; i++, o++) { if (can[a[o]]) a[o] = val; }
        else for (let i = i0; i <= i1; i++, o++) a[o] = val;
      }
    }
  }
  disc(x, z, r, val, can = null) {
    const { x0, z0, cell, w, h, a } = this;
    const cx = (x - x0) / cell, cy = (z - z0) / cell, rr = r / cell;
    const j0 = Math.max(0, Math.floor(cy - rr)), j1 = Math.min(h - 1, Math.ceil(cy + rr));
    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy, q = rr * rr - dy * dy;
      if (q < 0) continue;
      const hw = Math.sqrt(q);
      const i0 = Math.max(0, Math.ceil(cx - hw - 0.5)), i1 = Math.min(w - 1, Math.floor(cx + hw - 0.5));
      let o = j * w + i0;
      for (let i = i0; i <= i1; i++, o++) if (!can || can[a[o]]) a[o] = val;
    }
  }
  /** Thick polyline. pts: flat [x, z, ...]. offset shifts the line sideways (for rails). */
  stroke(pts, width, val, can = null, offset = 0) {
    const n = pts.length >> 1, hw = Math.max(width, this.cell * 1.05) / 2;
    const q = _quad;
    for (let i = 0; i + 1 < n; i++) {
      let ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[i * 2 + 2], bz = pts[i * 2 + 3];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const nx = -dz / l, nz = dx / l;
      if (offset) { ax += nx * offset; az += nz * offset; bx += nx * offset; bz += nz * offset; }
      q[0] = ax + nx * hw; q[1] = az + nz * hw; q[2] = bx + nx * hw; q[3] = bz + nz * hw;
      q[4] = bx - nx * hw; q[5] = bz - nz * hw; q[6] = ax - nx * hw; q[7] = az - nz * hw;
      this.fill(_quads, val, can);
      if (hw > this.cell) { this.disc(ax, az, hw, val, can); if (i + 2 === n) this.disc(bx, bz, hw, val, can); }
    }
  }
}
const _quad = new Float32Array(8), _quads = [_quad];

// ---------------------------------------------------------------- footprints
export function ringArea(r) {
  let a = 0;
  for (let i = 0, n = r.length, k = n - 1; i < n; k = i++) a += r[k][0] * r[i][1] - r[i][0] * r[k][1];
  return Math.abs(a) / 2;
}
export function inRing(x, z, r) {
  let inside = false;
  for (let i = 0, n = r.length, k = n - 1; i < n; k = i++) {
    const zi = r[i][1], zk = r[k][1];
    if ((zi > z) !== (zk > z) && x < ((r[k][0] - r[i][0]) * (z - zi)) / (zk - zi) + r[i][0]) inside = !inside;
  }
  return inside;
}
/**
 * Smallest bounding rectangle with a side along one of the ring's edges.
 * Returns centre, unit axis (ux, uz), extents along it (w) and across it (d), and how full it is.
 */
export function obbOf(ring) {
  let best = null;
  const n = ring.length;
  for (let i = 0, k = n - 1; i < n; k = i++) {
    let ux = ring[i][0] - ring[k][0], uz = ring[i][1] - ring[k][1];
    const l = Math.hypot(ux, uz);
    if (l < 1.2 && best) continue;
    ux /= l || 1; uz /= l || 1;
    // edges close to the scene axes snap onto them: straight rows stay perfectly straight
    if (Math.abs(uz) < 0.07) { ux = Math.sign(ux) || 1; uz = 0; } else if (Math.abs(ux) < 0.07) { ux = 0; uz = Math.sign(uz) || 1; }
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of ring) {
      const a = p[0] * ux + p[1] * uz, b = -p[0] * uz + p[1] * ux;
      if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b;
    }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area - 0.01) best = { ux, uz, a0, a1, b0, b1, area };
  }
  const ca = (best.a0 + best.a1) / 2, cb = (best.b0 + best.b1) / 2;
  return {
    cx: ca * best.ux - cb * best.uz, cz: ca * best.uz + cb * best.ux,
    ux: best.ux, uz: best.uz, w: best.a1 - best.a0, d: best.b1 - best.b0,
    fill: ringArea(ring) / Math.max(1e-6, best.area),
  };
}
/** Cover an odd-shaped footprint with a few rectangles, in the frame of its bounding rectangle. */
export function rectsOf(ring, o, inside = null, cell = 0) {
  const g = cell || Math.max(1.5, Math.min(5, Math.sqrt(o.w * o.d) / 9));
  const nx = Math.max(1, Math.round(o.w / g)), nz = Math.max(1, Math.round(o.d / g));
  const sx = o.w / nx, sz = o.d / nz;
  const on = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = -o.w / 2 + (i + 0.5) * sx, b = -o.d / 2 + (j + 0.5) * sz;
    const x = o.cx + a * o.ux - b * o.uz, z = o.cz + a * o.uz + b * o.ux;
    if (inside ? inside(x, z) : inRing(x, z, ring)) on[j * nx + i] = 1;
  }
  const out = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!on[j * nx + i]) continue;
    let i1 = i;
    while (i1 + 1 < nx && on[j * nx + i1 + 1]) i1++;
    let j1 = j;
    grow: while (j1 + 1 < nz) {
      for (let k = i; k <= i1; k++) if (!on[(j1 + 1) * nx + k]) break grow;
      j1++;
    }
    for (let jj = j; jj <= j1; jj++) for (let k = i; k <= i1; k++) on[jj * nx + k] = 0;
    out.push({ x: -o.w / 2 + ((i + i1 + 1) / 2) * sx, z: -o.d / 2 + ((j + j1 + 1) / 2) * sz, w: (i1 - i + 1) * sx, d: (j1 - j + 1) * sz });
  }
  return out.length || inside ? out : [{ x: 0, z: 0, w: o.w, d: o.d }];
}

/** Join polyline pieces end to end where they meet without a sharp turn. pieces: arrays of [x, z]. */
export function chain(pieces, tol = 12, maxTurnCos = 0.25) {
  const segs = pieces.filter((p) => p.length >= 2).map((p) => p.slice());
  const dir = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < segs.length; i++) for (let j = 0; j < segs.length; j++) {
      if (i === j) continue;
      const A = segs[i];
      for (const rev of [false, true]) {
        const B = rev ? segs[j].slice().reverse() : segs[j];
        const e = A[A.length - 1], s = B[0];
        if (Math.hypot(e[0] - s[0], e[1] - s[1]) > tol) continue;
        const d1 = dir(A[A.length - 2], e), d2 = dir(s, B[1]);
        if (d1[0] * d2[0] + d1[1] * d2[1] < maxTurnCos) continue;
        const skip = Math.hypot(e[0] - s[0], e[1] - s[1]) < 0.5 ? 1 : 0;
        segs[i] = A.concat(B.slice(skip));
        segs.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return segs;
}
export const polyLen = (p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; };
