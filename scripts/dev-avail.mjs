// Dev tool: for each street, how many of its spots can host each scene (headless Chrome against http://localhost:5190).
// Use it after changing a scene's stage declaration or the furniture density: a scene nobody can host is a scene nobody sees.
// usage: node scripts/dev-avail.mjs <outfile> "<street>" ["<street>" ...]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [outFile, ...streets] = process.argv.slice(2);
const port = 9400 + Math.floor(Math.random() * 400);
const profile = `/tmp/heibel-avail-${port}`; // the browser's throwaway profile (some 100 MB): removed again at the end
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,800', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  let list;
  for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.length) break; } catch (e) {} await sleep(500); }
  ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 120000 }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  for (const street of streets) {
    await send('Page.navigate', { url: `http://localhost:5190/?q=${encodeURIComponent(street)}&only=napCat&t=14:00` });
    let ok = false;
    for (let i = 0; i < 120; i++) { await sleep(1000); try { if (await ev('typeof window.__heibel === "object" && !!window.__heibel.stage.W && window.__heibel.stage.mode') === 'follow') { ok = true; break; } } catch (e) {} }
    if (!ok) { fs.appendFileSync(outFile, `${street}: did not open\n`); continue; }
    await sleep(6000); // let the crowd put its parked cars and lamps up
    const line = await ev(`(async () => { const st = window.__heibel.stage; const { canPlay } = await import('/src/voxel/gags.js'); const lv = st.locales[0].level; const o = {}; let total = 0; for (const n of st.gagNames) { const k = st.locales.filter((c) => canPlay(c, n)).length; o[n] = k; } const crime = st.gagNames.filter((n) => o[n] > 0).length; return JSON.stringify({ level: lv, spots: st.locales.length, playable: crime, of: st.gagNames.length, none: st.gagNames.filter((n) => !o[n]), counts: o }); })()`);
    fs.appendFileSync(outFile, `${street}: ${line}\n`);
  }
  fs.appendFileSync(outFile, '# done\n');
} catch (e) { fs.appendFileSync(outFile, 'ERR ' + e.message + '\n'); }
finally { try { ws && ws.close(); } catch (e) {} chrome.kill('SIGKILL'); setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} process.exit(0); }, 600); }
