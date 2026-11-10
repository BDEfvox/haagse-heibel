import '@fontsource/press-start-2p/400.css';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './style.css';
import { createMap, LV, LV_NAMES } from './map.js';
import { Stage } from './voxel/stage.js';
import { sfx, startMusic, stopMusic, isMuted, setMuted, unlock } from './audio.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wijkName = (w) => String(w || '').replace(/^Wijk \d+\s*/, '');
const params = new URLSearchParams(location.search);
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

  $('#logo-year').textContent = `· ${meta.year} police data`;
  if (matchMedia('(hover: none)').matches) $('#hint').textContent = 'Tap a neighbourhood to zoom · tap a street to drop in';
  $('#legend').innerHTML = [1, 2, 3, 4, 5].map((l) => `<div><i style="background:${LV[l]}"></i>${LV_NAMES[l]}</div>`).join('');

  // ------------------------------------------------------------ map + tooltip
  const tip = $('#tip'), mapEl = $('#map'), cut = $('#cutscene'), speed = $('#speed');
  const badge = (l) => `<span class="lv" style="background:${LV[l]}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= l ? 'on' : ''}"></i>`).join('')}<b>${LV_NAMES[l].toUpperCase()}</b></span>`;
  const api = createMap(mapEl, { buurten, streets, context }, {
    hover(p, pt, changed) {
      if (!p) { tip.hidden = true; return; }
      if (changed) {
        play('hover');
        const q = p.f.properties;
        tip.innerHTML = p.type === 'street'
          ? `<div class="n">${esc(q.name)}</div><div class="s">${esc(q.buurtName)}</div>${badge(q.level)}<div class="go">Click to drop in ▸</div>`
          : `<div class="n">${esc(q.name)}</div><div class="s">${esc(wijkName(q.wijk))}</div>${badge(q.level)}<div class="s" style="margin-top:5px">${q.pop >= 500 ? `<b>${q.rate}</b> crimes per 1,000 residents` : `<b>${q.crimes}</b> registered crimes`}</div><div class="go">Click to zoom in ▸</div>`;
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
  const row = (f) => `<li data-id="${f.id}"><i class="dot" style="background:${LV[f.properties.level]}"></i><span>${esc(f.properties.name)}</span></li>`;
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
      <li><b>Neighbourhood level</b> is real: registered crimes in ${meta.year} per neighbourhood (buurt), published by the Dutch police via CBS. Citywide average: <b>${meta.cityRate}</b> per 1,000 residents.</li>
      <li><b>Street level</b> is an estimate. Street-by-street crime figures are not public in the Netherlands, so every street starts with its neighbourhood's score and gets nudged by what is on it.</li>
      <li>Registered crime depends on reporting and on how many visitors an area gets — a busy centre always looks worse than a sleepy suburb. The cartoon scenes are jokes, not a safety guide and not a verdict on anyone who lives there.</li>
    </ul>
    <p>Sources: ${meta.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ')}</p>`;
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
    const c = LV[p.level];
    const wn = wijkName(p.wijk);
    $('#t-kicker').textContent = wn && wn !== p.buurtName ? `${p.buurtName} · ${wn}` : p.buurtName;
    $('#t-name').textContent = p.name;
    $('#t-meter').innerHTML = [0, 1, 2, 3, 4].map((i) => `<span class="pip ${i < p.level ? 'on' : ''}" style="--i:${i};--c:${c}"></span>`).join('') + `<span class="lvname" style="--c:${c}">${LV_NAMES[p.level].toUpperCase()}</span>`;
    let html = '';
    if (b) {
      const top = Array.isArray(b.top) ? b.top : [];
      const max = Math.max(1, ...top.map((t) => t.n));
      html += b.pop >= 500
        ? `<div class="big">${b.rate}<small>crimes per 1,000 residents in ${esc(b.name)} (${b.year})</small></div><div class="row"><span>City average</span><b>${meta.cityRate}</b></div>`
        : `<div class="big">${b.crimes}<small>registered crimes in ${esc(b.name)} (${b.year}) — hardly anyone lives here</small></div>`;
      html += `<div class="row"><span>Registered crimes</span><b>${b.crimes.toLocaleString('en')}</b></div>`;
      if (top.length) html += '<h4>Most reported</h4>' + top.map((t) => `<div class="row"><span>${esc(t.k)}</span><b>${t.n}</b></div><div class="bar"><i style="width:${(t.n / max) * 100}%"></i></div>`).join('');
    }
    const why = String(p.why || '').split('|').filter(Boolean);
    html += `<h4>This street</h4><div class="row"><span>Heibel score</span><b>${p.score}/100</b></div>`;
    if (why.length) html += `<div class="chips">${why.map((k) => `<span class="chip ${WHY[k]?.[1] || ''}">${esc(WHY[k]?.[0] || k)}</span>`).join('')}</div>`;
    html += '<div class="fine">Neighbourhood figures are real police data; the street score is an estimate. The cartoon is a joke, not a safety guide.</div>';
    $('#file-body').innerHTML = html;
    count = 0;
    $('#count').textContent = '000';
    $('#news').textContent = `Our reporter has arrived on ${p.name}…`;
  }
  const stageOpts = () => ({ only: params.get('only'), seed: params.get('seed') || '' });
  const withLevel = (p) => (params.get('lvl') ? { ...p, level: +params.get('lvl') } : p);

  async function openStreet(p0, pt) {
    if (busy || !p0) return;
    busy = true;
    const p = withLevel(p0);
    audioOk = true;
    unlock();
    await api.ready;
    api.setEnabled(false);
    tip.hidden = true;
    if (current) {
      // already in a cutscene: quick swap
      play('whoosh');
      cut.classList.remove('titled');
      stage.ctx?.flash('#fff', 0.35);
      await sleep(120);
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
      cut.style.setProperty('--ix', '50%');
      cut.style.setProperty('--iy', '50%');
      cut.hidden = false;
    }
    current = p;
    fillHud(p);
    stage.show(p, hooks, stageOpts());
    cut.classList.remove('close');
    cut.classList.add('open');
    history.replaceState(null, '', `#s=${p.id}`);
    await sleep(520);
    play('slam');
    cut.classList.add('titled');
    play('jingle', p.level);
    startMusic(p.level);
    mapEl.classList.remove('dive');
    speed.classList.remove('on');
    mapEl.style.transformOrigin = '';
    api.restore(p);
    await sleep(300);
    busy = false;
  }
  async function closeStreet() {
    if (busy || !current) return;
    busy = true;
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
    api.setEnabled(true);
    await sleep(350);
    mapEl.classList.remove('rise');
    busy = false;
  }
  $('#btn-back').onclick = closeStreet;
  $('#btn-next').onclick = () => openStreet(randomStreet(current && Math.random() < 0.5 ? (q) => q.level === current.level : null));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#about').hidden) $('#about').hidden = true;
    else closeStreet();
  });

  await api.ready;
  $('#loading').classList.add('gone');
  setTimeout(() => $('#loading').remove(), 500);

  // deep links: #s=<id> or ?q=<street name>
  const m = location.hash.match(/s=(\d+)/), q = params.get('q');
  const deep = m ? S[+m[1]] : q ? S.find((p) => p.lname === q.toLowerCase()) : null;
  if (deep) openStreet(deep);
  window.__heibel = { api, stage, S, openStreet, closeStreet };
}

boot().catch((e) => {
  console.error(e);
  const l = $('#loading');
  if (l) l.innerHTML = `<p>COULD NOT LOAD THE MAP</p><p style="font:500 13px Fredoka,sans-serif;opacity:.8">${String(e.message || e)}</p>`;
});
