// Tiny synthesized arcade sound kit and the city's tune (WebAudio, no asset downloads).
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
  if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
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
  // cutscene extras
  laugh: () => { for (let i = 0; i < 5; i++) tone(620 - i * 38, 520 - i * 38, 0.11, { vol: 0.13, type: 'triangle', at: i * 0.15 }); },
  snigger: () => { for (let i = 0; i < 6; i++) tone(330 + (i % 2) * 40, 290, 0.07, { vol: 0.11, type: 'square', at: i * 0.1 }); },
  rev: () => { tone(60, 190, 0.55, { vol: 0.16, type: 'sawtooth' }); tone(90, 285, 0.55, { vol: 0.07, type: 'square' }); noise(0.5, { vol: 0.06, f0: 300, f1: 1400 }); },
  screech: () => { noise(0.9, { vol: 0.16, f0: 2900, f1: 1700, type: 'bandpass', q: 9 }); tone(1900, 1300, 0.8, { vol: 0.035, type: 'sawtooth' }); },
  crash: () => { noise(0.5, { vol: 0.4, f0: 5000, f1: 200 }); tone(180, 50, 0.3, { vol: 0.3, type: 'sine' }); for (let i = 0; i < 7; i++) tone(700 + ((i * 211) % 900), 300, 0.06, { vol: 0.08, type: 'square', at: 0.08 + i * 0.05 }); },
  kaching: () => { tone(1568, 1568, 0.06, { vol: 0.1 }); tone(2093, 2093, 0.3, { vol: 0.11, type: 'triangle', at: 0.06 }); noise(0.05, { vol: 0.1, f0: 6000, f1: 3000, type: 'highpass', at: 0.02 }); },
  door: () => { tone(160, 70, 0.1, { vol: 0.3, type: 'sine' }); noise(0.06, { vol: 0.16, f0: 1800, f1: 400 }); },
  womp: () => { [392, 370, 349, 311].forEach((f, i) => tone(f, f * (i === 3 ? 0.8 : 0.99), i === 3 ? 0.55 : 0.2, { vol: 0.11, type: 'sawtooth', at: i * 0.22 })); },
  tada: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, i === 3 ? 0.5 : 0.1, { vol: 0.12, at: i * 0.09 })); },
  tick: () => tone(1400, 1100, 0.03, { vol: 0.1, type: 'square' }),
  swish: () => noise(0.22, { vol: 0.14, f0: 900, f1: 4200, type: 'bandpass', q: 1.5 }),
  gulp: () => { tone(300, 180, 0.09, { vol: 0.14, type: 'sine' }); tone(190, 420, 0.1, { vol: 0.12, type: 'sine', at: 0.1 }); },
  cuff: () => { tone(1700, 1500, 0.03, { vol: 0.12, type: 'square' }); tone(1900, 1700, 0.04, { vol: 0.12, type: 'square', at: 0.07 }); },
  meow: () => tone(700, 1000, 0.22, { vol: 0.1, type: 'triangle' }),
};

// ---------------------------------------------------------------- the tune
// "Hofstad Hoempa": an original sing-along in the Hague street-song spirit, played by four chip voices: a pulse-wave
// lead with an echo, quick chord arpeggios on the off-beats, a triangle oom-pah bass and noise drums. Thirty-two bars
// (A A' B A''). One tune for the whole city; a rougher street only plays it faster and with more of the band.
// The tune is data: put another one in SONG (bars of eight quavers, '-' holds a note, '.' rests) and it plays.
const SONG = {
  lead: [
    // A
    'E5 - G5 - C6 - G5 -', 'E5 - C5 - G4 - . .', 'D5 - F5 - B5 - F5 -', 'D5 - B4 - G4 - . .',
    'F5 F5 E5 D5 F5 - E5 D5', 'G5 - B4 - D5 - . .', 'C5 D5 E5 G5 C6 - B5 A5', 'G5 - E5 - C5 - . .',
    // A'
    'E5 - G5 - C6 - G5 -', 'E5 - C5 - G4 - . .', 'D5 - F5 - B5 - F5 -', 'D5 - B4 - G4 - . .',
    'E5 E5 F5 G5 A5 - G5 F5', 'A5 - F5 - C5 - . .', 'G5 F5 E5 D5 E5 - D5 -', 'C5 - - - . . G4 A4',
    // B
    'A5 - C6 - A5 - F5 -', 'A5 G5 F5 - C5 - . .', 'G5 - C6 - G5 - E5 -', 'G5 F5 E5 - C5 - . .',
    'F#5 - A5 - D6 - A5 -', 'F#5 E5 D5 - A4 - . .', 'G5 A5 B5 - D6 - B5 -', 'G5 - . . G5 A5 B5 D6',
    // A''
    'E5 - G5 - C6 - G5 -', 'E5 - C5 - G4 - . .', 'D5 - F5 - B5 - F5 -', 'D5 - B4 - G4 - . .',
    'F5 - A5 - C6 - A5 -', 'E5 - G5 - C6 - G5 -', 'D5 E5 F5 D5 B4 C5 D5 B4', 'C5 - . . C6 - . .',
  ],
  chords: 'C C G G G G C C  C C G G C7 F C/G C  F F C C D D G G  C C G G F C G C'.split(/\s+/),
};
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n) => { const m = /^([A-G])(#?)(\d)$/.exec(n); return m ? 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] ? 1 : 0) : 0; };
const CHORD = { C: [48, 52, 55], G: [43, 47, 50], F: [41, 45, 48], D: [50, 54, 57], C7: [48, 52, 58] };
// the song, flattened once: per quaver, the lead note that starts there (with its length) and the chord under it
const STEPS = [];
SONG.lead.forEach((bar, b) => {
  const toks = bar.split(' '), ch = SONG.chords[b].split('/');
  toks.forEach((tok, i) => {
    let len = 0;
    if (tok !== '-' && tok !== '.') { len = 1; while (toks[i + len] === '-') len++; }
    STEPS.push({ n: len ? midi(tok) : 0, len, chord: CHORD[ch[i < 4 || ch.length < 2 ? 0 : 1]], i });
  });
});
const BPM = [100, 106, 112, 120, 128];
let musicTimer = null, step = 0, nextT = 0, band = 0, waves = null;
/** A pulse wave of the given duty cycle: the thin, bright square of old game consoles. */
function pulse(a, duty) {
  const n = 24, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return a.createPeriodicWave(re, im);
}
function schedule() {
  const a = ac;
  if (!a || !musicTimer) return;
  const spb = 60 / BPM[band] / 2; // one quaver
  if (nextT < a.currentTime) nextT = a.currentTime + 0.02; // after a throttled background tab: skip the missed beats instead of playing them all at once
  while (nextT < a.currentTime + 0.15) {
    const at = Math.max(0, nextT - a.currentTime), s = STEPS[step % STEPS.length], i = s.i, c = s.chord;
    if (s.len) {
      const f = N(s.n), d = spb * s.len;
      tone(f, f, d * 0.92, { type: waves.lead, vol: 0.2, at, dest: musicGain, attack: 0.008 });
      tone(f, f, d * 0.7, { type: waves.thin, vol: 0.055, at: at + spb * 0.75, dest: musicGain }); // the echo
    }
    // oom (bass on the beat, root then fifth) ... pah (a quick arpeggio of the chord on the off-beat)
    if (i % 4 === 0) { const b = i === 0 ? c[0] : c[2] - 12; tone(N(b), N(b), spb * 1.5, { type: 'triangle', vol: 0.5, at, dest: musicGain }); }
    if (i % 4 === 2) c.forEach((n, k) => tone(N(n + 12), N(n + 12), spb * 0.3, { type: waves.thin, vol: 0.07, at: at + k * spb * 0.3, dest: musicGain }));
    if (band >= 1) noise(0.025, { vol: i % 2 ? 0.02 : 0.035, f0: 9000, f1: 7000, type: 'highpass', at });
    if (band >= 2 && i % 4 === 0) tone(150, 45, 0.11, { type: 'sine', vol: 0.5, at, dest: musicGain });
    if (band >= 2 && i % 4 === 2) noise(0.08, { vol: 0.055, f0: 3200, f1: 900, at });
    if (band >= 4 && i % 2 === 1 && c) { const n = c[(step >> 1) % 3] + 24; tone(N(n), N(n), spb * 0.5, { type: waves.thin, vol: 0.035, at, dest: musicGain }); }
    step++;
    nextT += spb;
  }
}
/** Start the tune, or (when it is already playing) only change how lively it is: 1 = a quiet street, 5 = mayhem. */
export function startMusic(level) {
  const a = ctx();
  if (!a) return;
  band = Math.max(0, Math.min(4, (level | 0) - 1));
  if (musicTimer) return; // it carries on across streets: no restart
  waves ||= { lead: pulse(a, 0.25), thin: pulse(a, 0.125) };
  step = 0;
  nextT = a.currentTime + 0.9;
  musicTimer = setInterval(schedule, 50);
}
export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('heibel-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.5;
}
/** Call from a user gesture so the browser lets audio start. */
export function unlock() { ctx(); }
