// The walking character's test routes, in map metres (x = (lon - 4.30) * 68430, y = (lat - 52.07) * 111267), shared by
// scripts/dev-walk-sim.mjs (headless) and scripts/dev-walk.mjs (the browser). SPOTS: scene frames of streets [ox, oy, dx, dy]
// (dev-crowd-sim's, from the clipping counter's records) for the headless walk's focus shifts.
export const SPOTS = { 'Grote Marktstraat': [1019.385, 822.164, -0.87, -0.493], 'Grote Markt': [594.309, 678.797, 0.699, -0.715], Torenstraat: [325.512, 923.654, -0.615, 0.788], Bierkade: [1244.498, 501.945, 0.814, 0.581] };
export const ROUTE = {
  default: {
    name: 'default', frames: ['Grote Marktstraat'], maxT: 400,
    pts: [
      { name: 'start', at: [740, 672], what: 'Grote Marktstraat (pedestrian shopping street, a tram lane down the middle): dropped here' },
      { name: 'gms', at: [690, 640], what: 'along Grote Marktstraat, past its shop fronts' },
      { name: 'gm-in', at: [655, 616], what: 'onto Grote Markt (a focus shift: the camera target is off Grote Marktstraat)', swap: 'Grote Markt' },
      { name: 'terraces', at: [618, 612], what: 'across Grote Markt along the edge of its terraces' },
      { name: 'gm-sw', at: [600, 600], what: 'the square\'s south-west corner' },
      { name: 'kerb-up', at: [594, 576], what: 'the pavement by the carriageway' },
      { name: 'road', at: [583, 576], what: 'over the kerb (0.2 m) onto the carriageway (ASPHALT)' },
      { name: 'kerb-back', at: [594, 574], what: 'back up the kerb onto the pavement' },
      { name: 'canal', at: [424, 306], what: 'south-west along Prinsegracht and Brouwersgracht (neighbouring streets: focus shifts) to the quay of the canal by the bridge', run: true, swap: 'Bierkade' },
      { name: 'edge', at: [424, 296], what: 'walk on into the water: stopped at the quay edge', push: true },
    ],
  },
};

/**
 * Following the path as a player does (both drivers, headless and in the browser): from where he is (map mx, my) and the point he
 * is heading for (index wi), which point he heads for now and where to steer. A point counts as passed when he is within REACH of it
 * or has gone past the end of the segment that leads to it (no circling round a point he overshot); he steers at a point LEAD metres
 * further along the path from where he is on it, so corners are followed as planned, not cut from metres before them. A `push`
 * point (beyond what must stop him) is never passed this way: he steers straight at it.
 * Returns { wi, cx, cy, rem }: rem = metres of path left to point wi (for "no progress" tests).
 */
export const REACH = 1.0, LEAD = 1.5;
export function pursue(P, wi, mx, my, lead = LEAD) {
  const seg = (k) => { const a = P[k - 1].at, b = P[k].at, ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1e-9, t = ((mx - a[0]) * ex + (my - a[1]) * ey) / l2; return { a, b, ex, ey, l: Math.sqrt(l2), t }; };
  while (wi < P.length - 1 && !P[wi].push) { const s = seg(wi); if (Math.hypot(s.b[0] - mx, s.b[1] - my) < REACH || s.t >= 1) wi++; else break; }
  if (wi < P.length && !P[wi].push && wi === P.length - 1) { const s = seg(wi); if (Math.hypot(s.b[0] - mx, s.b[1] - my) < REACH || s.t >= 1) return { wi: wi + 1, cx: s.b[0], cy: s.b[1], rem: 0 }; }
  if (wi >= P.length) return { wi, cx: mx, cy: my, rem: 0 };
  if (P[wi].push) return { wi, cx: P[wi].at[0], cy: P[wi].at[1], rem: Math.hypot(P[wi].at[0] - mx, P[wi].at[1] - my) };
  const s = seg(wi), t = Math.max(0, Math.min(1, s.t));
  let px = s.a[0] + s.ex * t, py = s.a[1] + s.ey * t, left = lead, k = wi;
  const rem = s.l * (1 - t) + Math.hypot(px - mx, py - my);
  for (;;) {
    const b = P[k].at, d = Math.hypot(b[0] - px, b[1] - py);
    if (d >= left || k === P.length - 1 || P[k].push) { const f = d > 0 ? Math.min(1, left / d) : 0; return { wi, cx: px + (b[0] - px) * f, cy: py + (b[1] - py) * f, rem }; }
    left -= d; px = b[0]; py = b[1]; k++;
    if (P[k].push) return { wi, cx: px, cy: py, rem };
  }
}
