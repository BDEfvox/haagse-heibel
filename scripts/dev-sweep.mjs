// Dev tool: plays every scene once on one street in a headless Chrome and writes one line per scene
// (finished, seconds, script errors, expired shots, off-shot seconds, short shots, first and longest beat, beats under 80% seen).
// Needs the dev server without auto-reload (launch config heibel-audit, http://localhost:5190) and Google Chrome.
// usage: node scripts/dev-sweep.mjs "<street>" <HH:MM> <outfile>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [street, time = '14:00', outFile] = process.argv.slice(2);
const port = 9400 + Math.floor(Math.random() * 400);
const profile = `/tmp/heibel-sweep-${port}`; // the browser's throwaway profile (some 100 MB): removed again at the end
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,800',
  '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => { fs.appendFileSync(outFile, s + '\n'); };
let ws, id = 0; const pend = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  let list;
  for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.length) break; } catch (e) {} await sleep(500); }
  ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const errs = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '').slice(0, 200)); else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push(d.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 240)); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://localhost:5190/?q=${encodeURIComponent(street)}&only=napCat&t=${time}` });
  const ev = async (expr, ms = 400000) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: ms }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  for (let i = 0; i < 180; i++) { await sleep(1000); if (await ev('typeof window.__heibel === "object" && !!window.__heibel.stage.W && window.__heibel.stage.mode') === 'follow') break; }
  await sleep(1500);
  const info = await ev(`(async () => { const st = window.__heibel.stage; const g = st.renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return JSON.stringify({ gl: e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?', locales: st.locales.length, agents: st.crowd.agents.length, parked: st.crowd.parkedNear ? st.crowd.parkedNear(st.rig.tx, st.rig.tz, 60).length / 2 : -1, mode: st.mode }); })()`);
  log(`# ${street} ${time} ${info}`);
  const names = JSON.parse(await ev('JSON.stringify(window.__heibel.stage.gagNames)'));
  for (const n of names) {
    errs.length = 0;
    let line;
    try {
      line = await ev(`(async () => { const H = window.__heibel, st = H.stage; const { canPlay } = await import('/src/voxel/gags.js'); let loc = -1; for (let i = 0; i < st.locales.length; i++) if (canPlay(st.locales[i], '${n}')) { loc = i; break; } if (loc < 0) return 'n/a'; st.force = {}; const r = await H.audit('${n}', { locale: loc, maxT: 80 }); H.sheet(-1); if (typeof r === 'string') return r; return [ 'loc' + loc, r.finished ? 'fin' : 'NOTFIN', r.seconds + 's', 'err' + r.scriptErrors, 'exp' + r.expired, 'off' + r.offShot, 'short' + r.short, 'shots' + r.shots, 'first' + (r.beats[0] ? r.beats[0].secs : '-'), 'longest' + Math.max(0, ...r.beats.map(b => b.secs)), 'low[' + r.beats.filter(b => b.seen < 80).map(b => b.beat.slice(0, 4).trim() + '=' + b.seen).join(',') + ']' ].join(' '); })()`);
    } catch (e) { line = 'THROW ' + e.message.slice(0, 200); }
    log(`${n.padEnd(14)} ${line}${errs.length ? '  CONSOLE: ' + [...new Set(errs)].slice(0, 3).join(' | ') : ''}`);
  }
  log('# done');
} catch (e) { log('ERR ' + e.message); }
finally { try { ws && ws.close(); } catch (e) {} chrome.kill('SIGKILL'); setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} process.exit(0); }, 600); }
