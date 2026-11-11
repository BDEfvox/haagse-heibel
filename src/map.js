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
    maxZoom: 18.5,
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

  let saved = null;
  const api = {
    map, ready,
    setEnabled(v) { enabled = v; if (!v) { setHover(null, null); on.hover?.(null, null, true); } },
    focusBuurt(id, click = false) {
      const f = buurten.features[id];
      if (!f) return;
      let a = 180, b = 90, c = -180, d = -90;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) for (const [x, y] of poly[0]) { a = Math.min(a, x); c = Math.max(c, x); b = Math.min(b, y); d = Math.max(d, y); }
      on.buurt?.(f.properties, click);
      map.fitBounds([[a, b], [c, d]], { padding: pad(), duration: 900, maxZoom: 16, minZoom: 14, easing: (t) => 1 - Math.pow(1 - t, 3) });
    },
    /** Dramatic dive onto a street; resolves when the camera has (nearly) landed. */
    dive(p, ms = 950) {
      saved = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
      map.flyTo({ center: [p.cx, p.cy], zoom: Math.max(17.2, map.getZoom() + 1.2), pitch: 50, bearing: ((p.bearing || 0) % 180) - 90, duration: ms, essential: true, curve: 1.1, easing: (t) => t * t * (3 - 2 * t) });
      return new Promise((r) => setTimeout(r, ms));
    },
    /** Jump (hidden behind the cutscene) to a calm view around a street, ready for when we come back. */
    restore(p) {
      const z = saved ? Math.max(14.6, Math.min(saved.zoom, 16)) : 15;
      map.jumpTo({ center: p ? [p.cx, p.cy] : saved.center, zoom: z, pitch: 0, bearing: 0 });
    },
    home() { map.fitBounds(home, { padding: pad(), duration: 900 }); },
    streetPoint(p) { return map.project([p.cx, p.cy]); },
  };
  return api;
}
