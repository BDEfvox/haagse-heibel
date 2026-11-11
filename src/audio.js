// Tiny synthesized arcade sound kit (WebAudio, no asset downloads).
let ac = null, master = null, musicGain = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('heibel-muted') === '1'; } catch (e) { /* private mode */ }

function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp).connect(ac.destination);
    musicGain = ac.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(f0, f1, dur, { type = 'square', vol = 0.2, at = 0, dest = null, attack = 0.005 } = {}) {
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest || master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.3, f0 = 4000, f1 = 200, at = 0, q = 0.8, type = 'lowpass' } = {}) {
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + at;
  const s = a.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = a.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur + 0.02);
}

const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi → Hz

export const sfx = {
  hover: () => tone(880, 1040, 0.04, { vol: 0.05, type: 'triangle' }),
  click: () => { tone(520, 780, 0.07, { vol: 0.14 }); tone(1040, 1560, 0.08, { vol: 0.08, at: 0.05 }); },
  whoosh: () => noise(0.55, { vol: 0.28, f0: 300, f1: 5000, type: 'bandpass', q: 1.2 }),
  pop: (p = 1) => tone(300 * p, 900 * p, 0.07, { vol: 0.12, type: 'triangle' }),
  thud: () => { tone(140, 50, 0.16, { vol: 0.3, type: 'sine' }); noise(0.08, { vol: 0.12, f0: 900, f1: 200 }); },
  slam: () => { tone(110, 38, 0.3, { vol: 0.4, type: 'sine' }); noise(0.18, { vol: 0.25, f0: 2500, f1: 150 }); },
  yoink: () => tone(300, 1500, 0.22, { vol: 0.16, type: 'triangle' }),
  boing: () => { tone(180, 520, 0.12, { vol: 0.18, type: 'sine' }); tone(520, 260, 0.18, { vol: 0.14, type: 'sine', at: 0.1 }); },
  hey: () => { tone(420, 380, 0.09, { vol: 0.14, type: 'sawtooth' }); tone(520, 300, 0.2, { vol: 0.14, type: 'sawtooth', at: 0.1 }); },
  bell: () => { tone(2100, 2100, 0.18, { vol: 0.1, type: 'sine' }); tone(2100, 2100, 0.3, { vol: 0.1, type: 'sine', at: 0.14 }); },
  ding: () => { tone(1320, 1320, 0.5, { vol: 0.13, type: 'sine' }); tone(1760, 1760, 0.5, { vol: 0.07, type: 'sine' }); },
  dingdong: () => { tone(988, 988, 0.4, { vol: 0.16, type: 'sine' }); tone(784, 784, 0.6, { vol: 0.16, type: 'sine', at: 0.32 }); },
  whistle: () => { for (let i = 0; i < 6; i++) tone(2300 + (i % 2) * 180, 2300 + ((i + 1) % 2) * 180, 0.06, { vol: 0.1, type: 'sine', at: i * 0.055 }); },
  coin: () => { tone(988, 988, 0.07, { vol: 0.12 }); tone(1319, 1319, 0.25, { vol: 0.12, at: 0.07 }); },
  honk: () => { tone(392, 392, 0.22, { vol: 0.12, type: 'sawtooth' }); tone(494, 494, 0.22, { vol: 0.1, type: 'sawtooth' }); },
  squawk: () => { tone(1500, 900, 0.1, { vol: 0.1, type: 'sawtooth' }); tone(1400, 800, 0.12, { vol: 0.1, type: 'sawtooth', at: 0.13 }); },
  bark: () => { tone(320, 180, 0.08, { vol: 0.2, type: 'sawtooth' }); tone(300, 160, 0.09, { vol: 0.2, type: 'sawtooth', at: 0.14 }); },
  spray: () => noise(0.5, { vol: 0.07, f0: 7000, f1: 5000, type: 'highpass' }),
  snip: () => { noise(0.04, { vol: 0.2, f0: 6000, f1: 3000, type: 'highpass' }); tone(1800, 1200, 0.05, { vol: 0.1, at: 0.05 }); },
  fuse: () => noise(1.6, { vol: 0.06, f0: 8000, f1: 6000, type: 'highpass' }),
  alarm: () => { for (let i = 0; i < 8; i++) tone(1250, 1250, 0.09, { vol: 0.08, at: i * 0.18 }); },
  siren: (n = 3) => { for (let i = 0; i < n * 2; i++) tone(i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.3, { vol: 0.08, type: 'triangle', at: i * 0.3 }); },
  skid: () => noise(0.5, { vol: 0.14, f0: 2400, f1: 1500, type: 'bandpass', q: 6 }),
  boom: () => {
    tone(120, 28, 0.9, { vol: 0.6, type: 'sine' });
    noise(1.1, { vol: 0.6, f0: 3000, f1: 60 });
    noise(0.25, { vol: 0.4, f0: 8000, f1: 800, type: 'highpass' });
  },
  rocket: () => { tone(500, 2600, 0.7, { vol: 0.08, type: 'sine' }); noise(0.7, { vol: 0.05, f0: 3000, f1: 7000, type: 'bandpass' }); },
  pang: () => { noise(0.5, { vol: 0.35, f0: 6000, f1: 300 }); for (let i = 0; i < 9; i++) noise(0.04, { vol: 0.12, f0: 8000, f1: 5000, type: 'highpass', at: 0.15 + i * 0.07 + Math.random() * 0.03 }); },
  splash: () => noise(0.4, { vol: 0.2, f0: 1200, f1: 3500, type: 'bandpass' }),
  chop: () => { for (let i = 0; i < 10; i++) noise(0.05, { vol: 0.07, f0: 500, f1: 200, at: i * 0.09 }); },
  zzz: () => tone(160, 110, 0.5, { vol: 0.05, type: 'sine' }),
  jingle: (level = 1) => {
    const maj = [60, 64, 67, 72, 76], min = [57, 60, 64, 69, 68];
    const seq = level >= 4 ? min : maj;
    seq.forEach((n, i) => tone(N(n + 12), N(n + 12), 0.14, { vol: 0.13, at: i * 0.085 }));
    tone(N(seq[0] - 12), N(seq[0] - 12), 0.5, { vol: 0.2, type: 'triangle' });
  },
  back: () => { tone(700, 350, 0.12, { vol: 0.12 }); tone(350, 175, 0.16, { vol: 0.12, at: 0.09 }); },
  // set-piece extras
  typing: () => { for (let i = 0; i < 7; i++) noise(0.025, { vol: 0.09, f0: 5000, f1: 2500, type: 'highpass', at: i * 0.06 + (i % 3) * 0.012 }); },
  reel: () => { for (let i = 0; i < 8; i++) tone(1900, 1500, 0.025, { vol: 0.06, type: 'square', at: i * 0.05 }); },
  glass: () => { noise(0.35, { vol: 0.22, f0: 9000, f1: 3000, type: 'highpass' }); for (let i = 0; i < 5; i++) tone(2400 + i * 330, 1800, 0.06, { vol: 0.07, type: 'triangle', at: 0.04 + i * 0.05 }); },
  bonk: () => { tone(260, 90, 0.14, { vol: 0.3, type: 'triangle' }); tone(520, 180, 0.08, { vol: 0.12, type: 'square', at: 0.02 }); },
  sting: () => { tone(220, 220, 0.16, { vol: 0.14, type: 'sawtooth' }); tone(330, 330, 0.16, { vol: 0.12, type: 'sawtooth', at: 0.1 }); tone(660, 660, 0.45, { vol: 0.13, type: 'square', at: 0.2 }); },
  gasp: () => noise(0.35, { vol: 0.12, f0: 800, f1: 2400, type: 'bandpass', q: 2 }),
  clatter: () => { for (let i = 0; i < 6; i++) { tone(400 + (i * 137) % 500, 200, 0.05, { vol: 0.09, type: 'square', at: i * 0.045 }); } },
};

// ---------------------------------------------------------------- chiptune loop
let musicTimer = null, step = 0, nextT = 0, tune = null;
const TUNES = {
  1: { bpm: 96, bass: [48, 0, 55, 0, 52, 0, 55, 0], lead: [72, 0, 76, 79, 0, 76, 72, 0, 74, 0, 77, 81, 0, 77, 74, 0], type: 'triangle' },
  2: { bpm: 108, bass: [48, 48, 55, 0, 53, 53, 55, 0], lead: [76, 79, 84, 79, 76, 0, 72, 0, 77, 81, 84, 81, 77, 0, 74, 0], type: 'triangle' },
  3: { bpm: 122, bass: [45, 0, 45, 52, 43, 0, 43, 50], lead: [69, 72, 76, 0, 72, 76, 81, 0, 67, 71, 74, 0, 71, 74, 79, 0], type: 'square' },
  4: { bpm: 136, bass: [45, 45, 57, 45, 41, 41, 53, 41, 43, 43, 55, 43, 40, 40, 52, 40], lead: [81, 0, 79, 76, 0, 72, 76, 0, 77, 0, 76, 72, 0, 69, 72, 0], type: 'square' },
  5: { bpm: 152, bass: [40, 52, 40, 52, 43, 55, 43, 55, 45, 57, 45, 57, 39, 51, 39, 51], lead: [76, 79, 83, 88, 83, 79, 76, 79, 81, 84, 88, 91, 88, 84, 81, 87], type: 'square' },
};
function schedule() {
  const a = ac;
  if (!a || !tune) return;
  const spb = 60 / tune.bpm / 2;
  if (nextT < a.currentTime) nextT = a.currentTime + 0.02; // after a throttled background tab: skip the missed beats instead of playing them all at once
  while (nextT < a.currentTime + 0.15) {
    const at = Math.max(0, nextT - a.currentTime);
    const b = tune.bass[step % tune.bass.length], l = tune.lead[step % tune.lead.length];
    if (b) tone(N(b), N(b), spb * 0.9, { type: 'triangle', vol: 0.55, at, dest: musicGain });
    if (l) tone(N(l), N(l), spb * 0.7, { type: tune.type, vol: 0.22, at, dest: musicGain });
    if (step % 2 === 0) noise(0.03, { vol: 0.035, f0: 9000, f1: 7000, type: 'highpass', at });
    if (tune.bpm > 120 && step % 4 === 2) noise(0.07, { vol: 0.05, f0: 2500, f1: 800, at });
    step++;
    nextT += spb;
  }
}
export function startMusic(level) {
  const a = ctx();
  if (!a) return;
  stopMusic();
  tune = TUNES[level] || TUNES[1];
  step = 0;
  nextT = a.currentTime + 0.9;
  musicTimer = setInterval(schedule, 50);
}
export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  tune = null;
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('heibel-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.5;
}
/** Call from a user gesture so the browser lets audio start. */
export function unlock() { ctx(); }
