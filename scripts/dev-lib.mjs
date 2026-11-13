// Dev tool library shared by the headless scripts beside it (dev-shot, dev-swap, dev-count, dev-bench).
// It starts one headless Chrome on the real graphics chip, talks to it over the DevTools protocol and removes the browser's
// throwaway profile when it ends. The scripts run against the dev server without auto-reload (launch config `heibel-audit`,
// http://localhost:5190; another address with HEIBEL_URL), because they use `window.__heibel`, which only the dev server has.
// One renderer at a time: do not start a script while another one, a sweep or a live browser tab on the site is running.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const BASE = process.env.HEIBEL_URL || 'http://localhost:5190';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * Start Chrome. width x height are CSS pixels, dpr the device pixel ratio (the drawing buffer is width*dpr x height*dpr).
 * Returns { ev, send, open, shot, errs, close }:
 *   ev(expr, ms)       evaluate an expression in the page (promises are awaited, the value comes back by JSON)
 *   send(method, p)    a raw DevTools protocol call
 *   open(street, o)    load the site on a street and wait until the camera has landed (stage.mode === 'follow');
 *                      o: time 'HH:MM' (default 14:00), only (default 'napCat': no crime scene takes the camera), seed, lvl,
 *                      query (extra query string), timeout in s. Returns true when the street opened.
 *   shot(file)         write a PNG of the page as shown
 *   errs               console errors and uncaught exceptions seen so far (array of strings; clear with errs.length = 0)
 *   close()            kill Chrome and remove its profile; safe to call twice
 */
export async function launch({ width = 1280, height = 800, dpr = 1, tag = 'run' } = {}) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = `/tmp/heibel-${tag}-${port}`; // some 100 MB; removed in close()
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', `--window-size=${width},${height}`,
    `--force-device-scale-factor=${dpr}`, '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null, id = 0, closed = false;
  const pend = new Map(), errs = [];
  const close = async () => {
    if (closed) return;
    closed = true;
    try { ws && ws.close(); } catch (e) { /* already gone */ }
    chrome.kill('SIGKILL');
    await sleep(600);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* nothing to remove */ }
  };
  process.on('SIGINT', () => { close().then(() => process.exit(130)); });
  process.on('SIGTERM', () => { close().then(() => process.exit(143)); });
  try {
    let list;
    for (let i = 0; i < 120; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.length) break; } catch (e) { /* not up yet */ }
      await sleep(500);
    }
    const page = list && list.find((t) => t.type === 'page');
    if (!page) throw new Error('Chrome did not start');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('no DevTools connection')); });
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
      else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '').slice(0, 300));
      else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push(d.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 300));
    };
    const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Page.enable');
    await send('Runtime.enable');
    // the page's viewport is exactly width x height (a headless window loses some height to its frame otherwise)
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
    const ev = async (expr, ms = 400000) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: ms });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
      return r.result.value;
    };
    const open = async (street, { time = '14:00', only = 'napCat', seed = null, lvl = null, query = '', timeout = 180 } = {}) => {
      let url = `${BASE}/?q=${encodeURIComponent(street)}`;
      if (only) url += `&only=${only}`;
      if (time) url += `&t=${time}`;
      if (seed != null) url += `&seed=${encodeURIComponent(seed)}`;
      if (lvl != null) url += `&lvl=${lvl}`;
      if (query) url += `&${query}`;
      await send('Page.navigate', { url });
      for (let i = 0; i < timeout; i++) {
        await sleep(1000);
        try { if (await ev('typeof window.__heibel === "object" && !!window.__heibel.stage.W && window.__heibel.stage.mode') === 'follow') { await sleep(1500); return true; } } catch (e) { /* page still loading */ }
      }
      return false;
    };
    const shot = async (file) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    };
    return { ev, send, open, shot, errs, close };
  } catch (e) {
    await close();
    throw e;
  }
}

/** Parse `--name value` and bare `--flag` arguments: returns { _: [positional...], name: value | true }. */
export function args(argv = process.argv.slice(2)) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) o[k] = argv[++i]; else o[k] = true; }
    else o._.push(a);
  }
  return o;
}
