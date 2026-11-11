import '@fontsource/press-start-2p/400.css';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './style.css';
import { createMap, LV, LV_NAMES } from './map.js';
import { Stage, preload } from './voxel/stage.js';
import { mixFor, THEMES, GAG_NAMES } from './voxel/gags.js';
import { sfx, startMusic, stopMusic, isMuted, setMuted, unlock } from './audio.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// numbers from data files are forced to be numbers before they reach HTML
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wijkName = (w) => String(w || '').replace(/^Wijk \d+\s*/, '');
const params = new URLSearchParams(location.search);
// Where the data comes from and under which licence (shown in the About box)
const CREDITS = [
  ['© OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright', 'ODbL'],
  ['3DBAG by tudelft3d and 3DGI', 'https://docs.3dbag.nl/en/copyright/', 'CC BY 4.0'],
  ['CBS Wijken en buurten (via PDOK)', 'https://www.cbs.nl/nl-nl/dossier/nederland-regionaal/geografische-data/wijk-en-buurtkaart-2025', 'CC BY 4.0'],
  ['Politie open data: registered crime per neighbourhood', 'https://data.politie.nl/', 'open data'],
  ['Noto Sans font glyphs', 'https://openfontlicense.org/', 'SIL OFL 1.1'],
];
const WHY = {
  nightlife: ['+ nightlife', 'up'], shopping: ['+ shops', 'up'], station: ['+ station', 'up'], promenade: ['+ promenade', 'up'],
  beachfront: ['+ beachfront', 'up'], throughroad: ['+ through-road', 'up'], quiet: ['− quiet lane', 'down'], leafy: ['− leafy', 'down'],
};

let audioOk = false;
const play = (name, ...a) => { if (audioOk) sfx[name]?.(...a); };
window.addEventListener('pointerdown', () => { audioOk = true; unlock(); }, { once: true, capture: true });

async function boot() {
  const get = (f) => fetch(`./data/${f}`).then((r) => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); });
  const [buurten, streets, context, meta] = await Promise.all([get('buurten.geojson'), get('streets.geojson'), get('context.geojson'), get('meta.json'),
    document.fonts.load('16px "Press Start 2P"'), document.fonts.load('600 16px Fredoka')]);
  const byCode = new Map(buurten.features.map((f) => [f.properties.code, f]));
  const S = streets.features.map((f) => f.properties);
  S.forEach((p, i) => { p.id = streets.features[i].id; p.lname = p.name.toLowerCase(); });

  $('#logo-year').textContent = `· ${num(meta.year)} police data`;
  if (matchMedia('(hover: none)').matches) $('#hint').textContent = 'Tap a neighbourhood to zoom · tap a street to drop in';
  $('#legend').innerHTML = [1, 2, 3, 4, 5].map((l) => `<div><i style="background:${LV[l]}"></i>${LV_NAMES[l]}</div>`).join('');

  // ------------------------------------------------------------ map + tooltip
  const tip = $('#tip'), mapEl = $('#map'), cut = $('#cutscene'), speed = $('#speed');
  const geomOf = (p) => streets.features[p.id]?.geometry.coordinates;
  let warmT = 0;
  const badge = (l) => `<span class="lv" style="background:${LV[l]}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= l ? 'on' : ''}"></i>`).join('')}<b>${LV_NAMES[l].toUpperCase()}</b></span>`;
  const api = createMap(mapEl, { buurten, streets, context }, {
    hover(p, pt, changed) {
      if (!p) { tip.hidden = true; return; }
      if (changed) {
        play('hover');
        const q = p.f.properties;
        // start fetching the street's surroundings while the pointer rests on it
        clearTimeout(warmT);
        if (p.type === 'street') warmT = setTimeout(() => preload(p.f.geometry.coordinates), 140);
        tip.innerHTML = p.type === 'street'
          ? `<div class="n">${esc(q.name)}</div><div class="s">${esc(q.buurtName)}</div>${badge(q.level)}<div class="s" style="margin-top:4px">street level is an estimate</div><div class="go">Click to drop in ▸</div>`
          : `<div class="n">${esc(q.name)}</div><div class="s">${esc(wijkName(q.wijk))}</div>${badge(q.level)}<div class="s" style="margin-top:5px">${q.pop >= 500 ? `<b>${num(q.rate)}</b> crimes per 1,000 residents` : `<b>${num(q.crimes)}</b> registered crimes`}</div><div class="go">Click to zoom in ▸</div>`;
      }
      tip.hidden = false;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.min(pt.x, window.innerWidth - w - 30) + 'px';
      tip.style.top = Math.min(pt.y, window.innerHeight - h - 30) + 'px';
    },
    street: (p, pt) => openStreet(S[p.id] || p, pt),
    buurt: () => play('click'),
  });

  // ------------------------------------------------------------ boards
  const ranked = buurten.features.filter((f) => f.properties.pop >= 500 && f.properties.level > 0).sort((a, b) => b.properties.score - a.properties.score);
  const row = (f) => `<li data-id="${num(f.id)}"><i class="dot" style="background:${LV[f.properties.level]}"></i><span>${esc(f.properties.name)}</span></li>`;
  $('#board-hot').innerHTML = ranked.slice(0, 5).map(row).join('');
  $('#board-calm').innerHTML = ranked.slice(-5).reverse().map(row).join('');
  for (const ol of [$('#board-hot'), $('#board-calm')]) ol.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) api.focusBuurt(+li.dataset.id, true); });

  // ------------------------------------------------------------ search
  const input = $('#search'), results = $('#results');
  let found = [];
  const renderResults = () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.hidden = true; return; }
    const starts = [], has = [];
    for (const p of S) {
      if (p.lname.startsWith(q)) starts.push(p);
      else if (p.lname.includes(q)) has.push(p);
      if (starts.length >= 8) break;
    }
    found = starts.concat(has).slice(0, 8);
    results.innerHTML = found.length
      ? found.map((p, i) => `<li data-i="${i}"><i class="dot" style="background:${LV[p.level]}"></i>${esc(p.name)}<small>${esc(p.buurtName)}</small></li>`).join('')
      : '<li><small style="margin:0">No street found</small></li>';
    results.hidden = false;
  };
  input.addEventListener('input', renderResults);
  input.addEventListener('focus', renderResults);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && found[0]) { results.hidden = true; input.blur(); openStreet(found[0]); } });
  results.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) { results.hidden = true; openStreet(found[+li.dataset.i]); } });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.search')) results.hidden = true; });

  const randomStreet = (pred) => { const pool = S.filter((p) => p.len > 90 && (!pred || pred(p))); return pool[Math.floor(Math.random() * pool.length)]; };
  $('#btn-random').onclick = () => openStreet(randomStreet());
  $('#btn-mayhem').onclick = () => openStreet(randomStreet((p) => p.level === 5));

  // ------------------------------------------------------------ about
  $('#about-body').innerHTML = `
    <p>${esc(meta.method)}</p>
    <ul>
      <li><b>Neighbourhood level</b> is real: registered crimes in ${num(meta.year)} per neighbourhood (buurt), published by the Dutch police via CBS. Citywide average: <b>${num(meta.cityRate)}</b> per 1,000 residents.</li>
      <li><b>Street level</b> is an estimate. Street-by-street crime figures are not public in the Netherlands, so every street starts with its neighbourhood's score and gets nudged by what is on it.</li>
      <li><b>What happens on the street</b> follows the neighbourhood's crime mix: the more a kind of crime is registered there, and the more it stands out from the city average, the more often its cartoon plays. Categories that are no laughing matter count towards the level but have no cartoon.</li>
      <li><b>The streets themselves</b> are built from real map data: building outlines and heights (3DBAG), roads, water, parks and trees (OpenStreetMap). Shop signs are generic, not real businesses.</li>
      <li>Registered crime depends on reporting and on how many visitors an area gets — a busy centre always looks worse than a sleepy suburb. The cartoon scenes are jokes, not a safety guide and not a verdict on anyone who lives there.</li>
    </ul>
    <p>Sources and licences: ${CREDITS.map((c) => `<a href="${c[1]}" target="_blank" rel="noopener noreferrer">${c[0]}</a> (${c[2]})`).join(' · ')}. The map data has been simplified, combined and redrawn for this site.</p>`;
  $('#btn-about').onclick = () => { $('#about').hidden = false; play('click'); };
  $('#about-close').onclick = () => { $('#about').hidden = true; };
  $('#about').addEventListener('click', (e) => { if (e.target.id === 'about') $('#about').hidden = true; });

  const soundBtn = $('#btn-sound');
  const paintSound = () => { soundBtn.textContent = isMuted() ? '🔇' : '🔊'; };
  paintSound();
  soundBtn.onclick = () => { setMuted(!isMuted()); paintSound(); };

  // ------------------------------------------------------------ cutscene
  const stage = new Stage(cut);
  let busy = false, current = null, count = 0;
  const hooks = {
    onNews(t) {
      const n = $('#news');
      n.textContent = t;
      n.classList.remove('in');
      void n.offsetWidth;
      n.classList.add('in');
    },
    onIncident(k) {
      count += k;
      const c = $('#count');
      c.textContent = String(count).padStart(3, '0');
      c.classList.remove('bump');
      void c.offsetWidth;
      c.classList.add('bump');
    },
  };
  function fillHud(p) {
    const b = byCode.get(p.buurt)?.properties;
    const lv = Math.min(5, Math.max(1, p.level | 0)), c = LV[lv];
    const wn = wijkName(p.wijk);
    $('#t-kicker').textContent = wn && wn !== p.buurtName ? `${p.buurtName} · ${wn}` : p.buurtName;
    $('#t-name').textContent = p.name;
    $('#t-meter').innerHTML = [0, 1, 2, 3, 4].map((i) => `<span class="pip ${i < lv ? 'on' : ''}" style="--i:${i};--c:${c}"></span>`).join('') + `<span class="lvname" style="--c:${c}">${LV_NAMES[lv].toUpperCase()}</span>`;
    let html = '';
    if (b) {
      const mix = mixFor(b.cat, meta.cats);
      const top = Object.keys(mix.share || {}).filter((k) => mix.n[k] > 0).sort((x, y) => mix.share[y] - mix.share[x]).slice(0, 5);
      const max = Math.max(0.01, ...top.map((k) => mix.share[k]));
      html += b.pop >= 500
        ? `<div class="big">${num(b.rate)}<small>crimes per 1,000 residents in ${esc(b.name)} (${num(b.year)})</small></div><div class="row"><span>City average</span><b>${num(meta.cityRate)}</b></div>`
        : `<div class="big">${num(b.crimes)}<small>registered crimes in ${esc(b.name)} (${num(b.year)}) — hardly anyone lives here</small></div>`;
      html += `<div class="row"><span>Registered crimes</span><b>${num(b.crimes).toLocaleString('en')}</b></div>`;
      if (top.length) html += '<h4>Crime mix here → what you will see</h4>' + top.map((k) => {
        const rel = mix.rel[k], tag = rel > 1.35 ? '<em class="up" title="More than the city average">▲</em>' : rel < 0.7 ? '<em class="down" title="Less than the city average">▼</em>' : '';
        return `<div class="row"><span>${esc(THEMES[k])} ${tag}</span><b>${Math.round(mix.share[k] * 100)}%</b></div><div class="bar"><i style="width:${(mix.share[k] / max) * 100}%"></i></div>`;
      }).join('');
    }
    const why = String(p.why || '').split('|').filter(Boolean);
    html += `<h4>This street</h4><div class="row"><span>Heibel score</span><b>${num(p.score)}/100</b></div>`;
    if (why.length) html += `<div class="chips">${why.map((k) => `<span class="chip ${Object.hasOwn(WHY, k) ? WHY[k][1] : ''}">${esc(Object.hasOwn(WHY, k) ? WHY[k][0] : k)}</span>`).join('')}</div>`;
    html += '<div class="fine">Neighbourhood figures are real police data; the street score is an estimate. The cartoon is a joke, not a safety guide.</div>';
    $('#file-body').innerHTML = html;
    count = 0;
    $('#count').textContent = '000';
    $('#news').textContent = `Our reporter has arrived on ${p.name}…`;
  }
  const stageOpts = (p, lngLat) => ({
    only: onlyParam, seed: DEV ? (params.get('seed') || '').slice(0, 40) : '', geometry: geomOf(p), lngLat,
    crime: { cat: byCode.get(p.buurt)?.properties.cat, cats: meta.cats },
  });
  const touch = matchMedia('(hover: none)').matches;
  const HINTS = {
    drop: '',
    follow: touch ? 'drag to take over the camera' : 'drag to take over the camera · scroll to zoom',
    free: touch ? 'drag to move · pinch to zoom and turn · tap ! to jump to the action' : 'drag to move · right-drag to turn · scroll to zoom · click ! to jump to the action',
  };
  hooks.onMode = (mode) => {
    cut.dataset.mode = mode;
    $('#drag-hint').textContent = HINTS[mode] || '';
    $('#btn-follow').hidden = mode !== 'free';
    if (mode === 'free' && !cut.dataset.roamed) {
      cut.dataset.roamed = '1';
      const t = $('#roam');
      t.classList.remove('in');
      void t.offsetWidth;
      t.classList.add('in');
      play('coin');
    }
  };
  hooks.onPin = () => play('whoosh');
  hooks.onContextLost = () => { if (current || opening) recover('The graphics card dropped the scene. Pick a street to try again.'); };
  // debug switches from the URL are validated: anything else is ignored
  // (and they only exist on the dev server: on the live site nobody can dress a street up as "Mayhem" with a link)
  const DEV = import.meta.env.DEV;
  const lvlParam = DEV && /^[1-5]$/.test(params.get('lvl') || '') ? +params.get('lvl') : null;
  const onlyParam = DEV && GAG_NAMES.includes(params.get('only')) ? params.get('only') : null;
  const withLevel = (p) => (lvlParam ? { ...p, level: lvlParam } : p);

  // while a street is open, the map and its panel are out of reach of the keyboard and screen readers
  const behind = (on) => { for (const el of [$('#panel'), mapEl]) el.inert = on; };
  let opening = false;
  /** Put the page back in a known state if opening a street goes wrong half-way. */
  function recover(msg) {
    try { stage.hide(); } catch (e) { /* ignore */ }
    stopMusic();
    cut.hidden = true;
    cut.classList.remove('open', 'titled', 'swap', 'close');
    mapEl.classList.remove('dive', 'anticipate', 'rise');
    speed.classList.remove('on');
    mapEl.style.transformOrigin = '';
    current = null;
    opening = false;
    behind(false);
    api.setEnabled(true);
    history.replaceState(null, '', location.pathname + location.search);
    if (msg) $('#hint').textContent = msg;
  }
  async function openStreet(p0, pt) {
    if (busy || !p0) return;
    busy = true;
    try {
      await doOpen(p0, pt);
    } catch (e) {
      console.error(e);
      recover('That street would not load. Try another one.');
    } finally {
      busy = false;
    }
  }
  async function doOpen(p0, pt) {
    const p = withLevel(p0);
    opening = true;
    audioOk = true;
    unlock();
    await api.ready;
    api.setEnabled(false);
    tip.hidden = true;
    let lngLat;
    if (pt) { const ll = api.map.unproject([pt.x, pt.y]); lngLat = [ll.lng, ll.lat]; }
    const swap = !!current;
    cut.dataset.mode = 'drop';
    delete cut.dataset.roamed;
    $('#btn-follow').hidden = true;
    $('#drag-hint').textContent = '';
    // the world around the street loads while the map dives
    const ready = stage.show(p, hooks, stageOpts(p, lngLat));
    stage.hold = true;
    if (swap) {
      play('whoosh');
      cut.classList.remove('titled');
      cut.classList.add('swap');
    } else {
      play('click'); play('whoosh');
      const at = pt || api.streetPoint(p);
      speed.style.setProperty('--sx', `${((at.x / window.innerWidth) * 100 * 0.714 + 14.3).toFixed(1)}%`);
      speed.style.setProperty('--sy', `${((at.y / window.innerHeight) * 100 * 0.714 + 14.3).toFixed(1)}%`);
      mapEl.style.transformOrigin = `${at.x}px ${at.y}px`;
      mapEl.classList.add('anticipate');
      await sleep(150);
      mapEl.classList.remove('anticipate');
      mapEl.classList.add('dive');
      speed.classList.add('on');
      api.dive(p, 900);
      await sleep(760);
    }
    const ok = await ready;
    if (!ok) {
      // could not build the street (also when swapping from another street): back to the map, with a message
      recover('That street would not load. Try another one.');
      return;
    }
    if (!swap) {
      cut.style.setProperty('--ix', '50%');
      cut.style.setProperty('--iy', '50%');
      cut.hidden = false;
    }
    if (!opening) return; // the scene was lost while it was being opened; recover() already ran
    current = p;
    opening = false;
    behind(true);
    $('#btn-back').focus({ preventScroll: true });
    fillHud(p);
    cut.classList.remove('close', 'swap');
    cut.classList.add('open');
    stage.hold = false;
    history.replaceState(null, '', `#s=${p.id}`);
    await sleep(520);
    play('slam');
    cut.classList.add('titled');
    play('jingle', p.level);
    startMusic(p.level);
    mapEl.classList.remove('dive');
    speed.classList.remove('on');
    mapEl.style.transformOrigin = '';
    if (!swap) api.restore(p);
    await sleep(300);
  }
  async function closeStreet() {
    if (busy || !current) return;
    busy = true;
    try { await doClose(); } catch (e) { console.error(e); recover(); } finally { busy = false; }
  }
  async function doClose() {
    play('back');
    stopMusic();
    cut.classList.remove('open', 'titled');
    cut.classList.add('close');
    mapEl.classList.add('rise');
    history.replaceState(null, '', location.pathname + location.search);
    await sleep(380);
    cut.hidden = true;
    cut.classList.remove('close');
    stage.hide();
    current = null;
    behind(false);
    api.setEnabled(true);
    await sleep(350);
    mapEl.classList.remove('rise');
  }
  $('#btn-back').onclick = closeStreet;
  $('#btn-follow').onclick = () => { play('click'); stage.follow(); };
  $('#btn-next').onclick = () => openStreet(randomStreet(current && Math.random() < 0.5 ? (q) => q.level === current.level : null));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#about').hidden) $('#about').hidden = true;
    else closeStreet();
  });

  await api.ready;
  preload();
  $('#loading').classList.add('gone');
  setTimeout(() => $('#loading').remove(), 500);

  // deep links: #s=<id> or ?q=<street name>
  const m = location.hash.match(/s=(\d+)/), q = params.get('q');
  const deep = m ? S[+m[1]] : q ? S.find((p) => p.lname === q.toLowerCase()) : null;
  if (deep) openStreet(deep);
  if (import.meta.env.DEV) window.__heibel = { api, stage, S, openStreet, closeStreet };
}

boot().catch((e) => {
  console.error(e);
  const l = $('#loading');
  if (l) {
    l.innerHTML = '<p>COULD NOT LOAD THE MAP</p><p style="font:500 13px Fredoka,sans-serif;opacity:.8"></p>';
    l.lastElementChild.textContent = /webgl/i.test(String(e && e.message)) ? 'This site needs WebGL, which this browser or device has switched off.' : String((e && e.message) || e).slice(0, 200);
  }
});
