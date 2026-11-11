// The overview map: cartoon choropleth of neighbourhoods + streets with a red hover glow.
import { Map as MapLibreMap, AttributionControl, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';

// the worker is served from our own origin (no blob: or third-party script needed)
setWorkerUrl(workerUrl);

export const LV = ['#9aa3ad', '#3ecf73', '#f7c61e', '#ff9233', '#f0443e', '#b0189e'];
export const LV_NAMES = ['', 'Sleepy', 'Mild', 'Spicy', 'Rowdy', 'Mayhem'];
const lvColor = ['match', ['get', 'level'], 1, LV[1], 2, LV[2], 3, LV[3], 4, LV[4], 5, LV[5], LV[0]];
const hover = ['boolean', ['feature-state', 'hover'], false];
const SEA = '#8fd3f4';

export function createMap(el, { buurten, streets, context }, on) {
  const narrow = () => window.innerWidth < 760;
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const f of buurten.features) {
    const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of rings) for (const [x, y] of poly[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  const home = [[minX, minY], [maxX, maxY]];
  const pad = () => (narrow() ? { top: 90, bottom: 190, left: 20, right: 20 } : { top: 40, bottom: 50, left: 310, right: 40 });

  const map = new MapLibreMap({
    container: el,
    style: {
      version: 8,
      glyphs: new URL('./fonts/{fontstack}/{range}.pbf', document.baseURI).href.replace(/%7B/g, '{').replace(/%7D/g, '}'), // self-hosted: no third-party requests
      sources: {},
      layers: [{ id: 'sea', type: 'background', paint: { 'background-color': SEA } }],
    },
    bounds: home,
    fitBoundsOptions: { padding: pad() },
    minZoom: 9.5,
    maxZoom: 17.7,
    maxBounds: [[minX - 0.25, minY - 0.14], [maxX + 0.25, maxY + 0.14]],
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    fadeDuration: 0,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new AttributionControl({ compact: true, customAttribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors (ODbL) · 3DBAG (CC BY 4.0) · CBS · Politie open data' }), 'bottom-right');
  map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

  const ready = new Promise((res) => map.on('load', res)).then(() => {
    map.addSource('ctx', { type: 'geojson', data: context });
    map.addSource('buurten', { type: 'geojson', data: buurten });
    map.addSource('streets', { type: 'geojson', data: streets, tolerance: 0.2 });
    const kind = (k) => ['==', ['get', 'kind'], k];

    map.addLayer({ id: 'land', type: 'fill', source: 'ctx', filter: kind('land'), paint: { 'fill-color': ['case', ['==', ['get', 'home'], 1], '#f6f0dc', '#e3dcc4'], 'fill-outline-color': '#cfc6a8' } });
    map.addLayer({ id: 'beach', type: 'fill', source: 'ctx', filter: kind('beach'), paint: { 'fill-color': '#f8e4a8' } });
    map.addLayer({ id: 'buurt-fill', type: 'fill', source: 'buurten', paint: { 'fill-color': lvColor, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.82, 13, 0.62, 14.5, 0.34, 17, 0.22] } });
    map.addLayer({ id: 'green', type: 'fill', source: 'ctx', filter: kind('green'), paint: { 'fill-color': '#5fbf74', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.25, 14, 0.5] } });
    map.addLayer({ id: 'water', type: 'fill', source: 'ctx', filter: kind('water'), paint: { 'fill-color': SEA } });
    map.addLayer({ id: 'canal', type: 'line', source: 'ctx', filter: kind('canal'), paint: { 'line-color': SEA, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, 0.6, 14, 2.5, 17, 12] } });
    map.addLayer({ id: 'buurt-hover', type: 'fill', source: 'buurten', paint: { 'fill-color': '#ff1f1f', 'fill-opacity': ['case', hover, 0.3, 0] } });
    map.addLayer({ id: 'rail', type: 'line', source: 'ctx', filter: kind('rail'), minzoom: 12, paint: { 'line-color': '#6b7280', 'line-width': 1.4, 'line-dasharray': [3, 2], 'line-opacity': 0.6 } });

    const w = (k) => ['interpolate', ['exponential', 1.7], ['zoom'], 11.5, 0.5 * k, 13, 1.3 * k, 15, 4 * k, 17, 11 * k, 18.5, 22 * k];
    const major = ['match', ['get', 'cls'], ['primary', 'secondary', 'trunk'], 1.5, ['tertiary', 'pedestrian'], 1.2, 1];
    const wCls = (k) => ['interpolate', ['exponential', 1.7], ['zoom'], 11.5, ['*', 0.5 * k, major], 13, ['*', 1.3 * k, major], 15, ['*', 4 * k, major], 17, ['*', 11 * k, major], 18.5, ['*', 22 * k, major]];
    const round = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({ id: 'street-glow', type: 'line', source: 'streets', minzoom: 11.5, layout: round, paint: { 'line-color': '#ff1414', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 14, 15, 26, 18, 54], 'line-blur': ['interpolate', ['linear'], ['zoom'], 12, 8, 15, 14, 18, 26], 'line-opacity': ['case', hover, 0.62, 0] } });
    map.addLayer({ id: 'street-case', type: 'line', source: 'streets', minzoom: 12.2, layout: round, paint: { 'line-color': '#101935', 'line-width': wCls(1.45), 'line-opacity': ['interpolate', ['linear'], ['zoom'], 12.2, 0, 13.2, 0.85] } });
    map.addLayer({ id: 'street', type: 'line', source: 'streets', minzoom: 11.5, layout: round, paint: { 'line-color': ['case', hover, '#ffffff', lvColor], 'line-width': wCls(1), 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12.4, 1] } });
    map.addLayer({ id: 'street-hot', type: 'line', source: 'streets', minzoom: 11.5, layout: round, paint: { 'line-color': '#ff2a2a', 'line-width': wCls(0.55), 'line-opacity': ['case', hover, 0.9, 0] } });
    map.addLayer({ id: 'street-hit', type: 'line', source: 'streets', minzoom: 12.4, paint: { 'line-color': '#000', 'line-opacity': 0.01, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 8, 16, 18, 18, 30] } });
    map.addLayer({ id: 'tram', type: 'line', source: 'ctx', filter: kind('tramline'), minzoom: 14.5, paint: { 'line-color': '#101935', 'line-width': 1, 'line-dasharray': [1, 2], 'line-opacity': 0.45 } });

    map.addLayer({ id: 'buurt-line', type: 'line', source: 'buurten', layout: round, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 14, 3, 17, 5], 'line-opacity': 0.9 } });
    map.addLayer({ id: 'buurt-glow', type: 'line', source: 'buurten', layout: round, paint: { 'line-color': '#ff1414', 'line-width': 12, 'line-blur': 10, 'line-opacity': ['case', hover, 0.75, 0] } });
    map.addLayer({ id: 'buurt-edge', type: 'line', source: 'buurten', layout: round, paint: { 'line-color': '#ff2a2a', 'line-width': 2.5, 'line-opacity': ['case', hover, 1, 0] } });

    map.addLayer({ id: 'street-name', type: 'symbol', source: 'streets', minzoom: 15.2, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 18, 15], 'symbol-spacing': 320, 'text-max-angle': 35 }, paint: { 'text-color': '#101935', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 } });
    map.addLayer({ id: 'buurt-name', type: 'symbol', source: 'buurten', minzoom: 11.6, maxzoom: 15.6, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 11.6, 9.5, 14, 13.5], 'text-max-width': 7, 'text-padding': 6 }, paint: { 'text-color': '#101935', 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 2 } });
  });

  // ---------------------------------------------------------------- hover + click
  let hov = null; // { source, id }
  let enabled = true;
  const setHover = (source, id) => {
    if (hov && hov.source === source && hov.id === id) return false;
    if (hov) map.setFeatureState(hov, { hover: false });
    hov = id == null ? null : { source, id };
    if (hov) map.setFeatureState(hov, { hover: true });
    return true;
  };
  const pick = (pt) => {
    const r = map.getZoom() >= 15 ? 7 : 5;
    const s = map.getLayer('street-hit') && map.getZoom() >= 12.4 ? map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]], { layers: ['street-hit'] }) : [];
    if (s.length) return { type: 'street', f: s[0] };
    const b = map.getLayer('buurt-fill') ? map.queryRenderedFeatures(pt, { layers: ['buurt-fill'] }) : [];
    if (b.length) return { type: 'buurt', f: b[0] };
    return null;
  };
  map.on('mousemove', (e) => {
    if (!enabled) return;
    const p = pick(e.point);
    const changed = setHover(p ? (p.type === 'street' ? 'streets' : 'buurten') : null, p ? p.f.id : null);
    map.getCanvas().style.cursor = p ? 'pointer' : '';
    on.hover?.(p, e.point, changed);
  });
  map.on('mouseout', () => { setHover(null, null); on.hover?.(null, null, true); });
  map.on('click', (e) => {
    if (!enabled) return;
    const p = pick(e.point);
    if (!p) return;
    if (p.type === 'street') on.street?.(p.f.properties, e.point);
    else api.focusBuurt(p.f.id, true);
  });

  // ---------------------------------------------------------------- zooming in far enough drops you into the street
  // the zoom at which the 3D city takes over: the page works it out from the camera height at which 3D hands back to the map,
  // so zooming in and out cross over at the same place
  const enterZ = () => on.enterZoom?.() ?? 17.25;
  let lastZ = 0, lastPt = null, lastAt = 0, quietUntil = 0;
  const gesturePoint = (ev) => {
    const r = el.getBoundingClientRect(), t = ev && ev.touches && ev.touches.length ? ev.touches : null;
    if (t) { let x = 0, y = 0; for (const q of t) { x += q.clientX; y += q.clientY; } return { x: x / t.length - r.left, y: y / t.length - r.top }; }
    if (ev && typeof ev.clientX === 'number') return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    return { x: r.width / 2, y: r.height / 2 };
  };
  map.on('zoom', (e) => {
    const z = map.getZoom(), up = z > lastZ;
    lastZ = z;
    if (!enabled) return;
    if (e.originalEvent) { lastPt = gesturePoint(e.originalEvent); lastAt = performance.now(); }
    // the spot being zoomed in on: under the pointer or fingers, otherwise the middle of the map
    const pt = lastPt && performance.now() - lastAt < 1500 ? lastPt : { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    const E = enterZ();
    on.zoom?.(z, z >= E - 0.5 ? pt : null);
    if (up && z >= E && performance.now() > quietUntil) on.deep?.(pt); // only the viewer's own zooming, not a programmed fly-to
  });
  /** The street closest to a screen point, within `maxPx` pixels. */
  const nearestStreet = (pt, maxPx = 110) => {
    if (!map.getLayer('street-hit')) return null;
    for (const r of [10, 36, maxPx]) {
      const hits = map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]], { layers: ['street-hit'] });
      let best = null, bd = Infinity;
      for (const f of hits) {
        const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
        for (const line of lines) {
          let a = null;
          for (const ll of line) {
            const b = map.project(ll);
            if (a) {
              const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
              const d = Math.hypot(a.x + dx * t - pt.x, a.y + dy * t - pt.y);
              if (d < bd) { bd = d; best = f; }
            }
            a = b;
          }
        }
      }
      if (best && bd <= r) return best;
    }
    return null;
  };

  const HANDLERS = ['scrollZoom', 'dragPan', 'touchZoomRotate', 'doubleClickZoom', 'keyboard', 'boxZoom'];
  const api = {
    map, ready, nearestStreet,
    /** Hold the map still (no gestures) while a street is opening or open. */
    lock(v) { if (v) map.stop(); for (const h of HANDLERS) { if (v) map[h].disable(); else map[h].enable(); } if (!v) map.touchZoomRotate.disableRotation(); },
    setEnabled(v) { enabled = v; if (!v) { setHover(null, null); on.hover?.(null, null, true); } },
    focusBuurt(id, click = false) {
      const f = buurten.features[id];
      if (!f) return;
      let a = 180, b = 90, c = -180, d = -90;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) for (const [x, y] of poly[0]) { a = Math.min(a, x); c = Math.max(c, x); b = Math.min(b, y); d = Math.max(d, y); }
      on.buurt?.(f.properties, click);
      quietUntil = performance.now() + 1200;
      map.fitBounds([[a, b], [c, d]], { padding: pad(), duration: 900, maxZoom: 16, minZoom: 14, easing: (t) => 1 - Math.pow(1 - t, 3) });
    },
    home() { quietUntil = performance.now() + 1200; map.fitBounds(home, { padding: pad(), duration: 900 }); },
    /** Zoom changes in the next `ms` are the page's own doing, not the viewer zooming in. */
    quiet(ms) { quietUntil = performance.now() + ms; },
    streetPoint(p) { return map.project([p.cx, p.cy]); },
  };
  return api;
}
