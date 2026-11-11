/** Synthesised sound effects and dark synth music (WebAudio, no files). Melodies are original. */

let context = null;
let master = null;
let musicBus = null;
let noiseBuffer = null;
let muted = false;
let musicOn = true;
const MUSIC_GAIN = 0.26;

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 0.55;
}
export const isMuted = () => muted;
export function setMusic(value) {
  musicOn = value;
  if (musicBus) musicBus.gain.value = musicOn ? MUSIC_GAIN : 0;
}
export const isMusicOn = () => musicOn;

function audio() {
  if (muted) return null;
  if (!context) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    context = new AC();
    master = context.createGain();
    master.gain.value = 0.55;
    master.connect(context.destination);
    musicBus = context.createGain();
    musicBus.gain.value = musicOn ? MUSIC_GAIN : 0;
    musicBus.connect(master);
    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  if (context.state === "suspended") context.resume();
  return context;
}

function tone(freq, duration, { type = "square", gain = 0.08, delay = 0, slide = 0, bus = null } = {}) {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), start + duration);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env).connect(bus ?? master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(duration, { gain = 0.1, delay = 0, freq = 1500, q = 0.7, type = "bandpass", bus = null, sweep = 0 } = {}) {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, start);
  if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), start + duration);
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(env).connect(bus ?? master);
  src.start(start, Math.random() * 0.5);
  src.stop(start + duration + 0.02);
}

export const sfx = {
  unlock() {
    audio();
  },
  shoot(weapon) {
    switch (weapon) {
      case "pistol":
        noise(0.08, { gain: 0.22, freq: 2400, q: 0.6 });
        tone(320, 0.06, { type: "square", gain: 0.05, slide: 0.4 });
        break;
      case "smg":
        noise(0.05, { gain: 0.16, freq: 3000, q: 0.8 });
        tone(260, 0.04, { type: "square", gain: 0.03, slide: 0.5 });
        break;
      case "shotgun":
        noise(0.22, { gain: 0.35, freq: 1200, q: 0.4, sweep: 0.3 });
        tone(120, 0.15, { type: "sawtooth", gain: 0.08, slide: 0.4 });
        break;
      case "flamer":
        noise(0.06, { gain: 0.05, freq: 700, q: 0.4, type: "lowpass" });
        break;
      case "plasma":
        tone(1400, 0.16, { type: "sawtooth", gain: 0.05, slide: 0.25 });
        tone(700, 0.12, { type: "sine", gain: 0.08, slide: 0.5 });
        break;
      case "rocket":
        noise(0.4, { gain: 0.2, freq: 500, q: 0.5, sweep: 2.5 });
        tone(90, 0.3, { type: "sawtooth", gain: 0.06, slide: 1.8 });
        break;
      default:
        noise(0.06, { gain: 0.15 });
    }
  },
  hit() {
    noise(0.05, { gain: 0.08, freq: 900, q: 1.2 });
  },
  alienDeath(kind) {
    const base = { crawler: 520, spitter: 380, brute: 140, exploder: 300, queen: 80 }[kind] ?? 400;
    tone(base, 0.18, { type: "sawtooth", gain: 0.05, slide: 0.35 });
    noise(0.12, { gain: 0.08, freq: 600, q: 0.8 });
  },
  explode(big) {
    noise(big ? 1 : 0.6, { gain: big ? 0.6 : 0.45, freq: 900, q: 0.3, type: "lowpass", sweep: 0.15 });
    tone(70, big ? 0.7 : 0.4, { type: "sine", gain: 0.3, slide: 0.4 });
  },
  hurt() {
    tone(180, 0.12, { type: "square", gain: 0.07, slide: 0.6 });
    noise(0.08, { gain: 0.08, freq: 400 });
  },
  playerDeath() {
    [0, 1, 2].forEach((i) => tone(220 / (i + 1), 0.4, { type: "sawtooth", gain: 0.08, delay: i * 0.18, slide: 0.5 }));
  },
  dash() {
    noise(0.16, { gain: 0.1, freq: 1800, q: 0.6, sweep: 0.3 });
  },
  spit() {
    noise(0.1, { gain: 0.05, freq: 2200, q: 3, sweep: 0.4 });
  },
  splat() {
    noise(0.08, { gain: 0.05, freq: 500, q: 1.5 });
  },
  hatch() {
    tone(90, 0.25, { type: "triangle", gain: 0.06, slide: 1.6 });
  },
  roar() {
    tone(70, 0.5, { type: "sawtooth", gain: 0.12, slide: 1.3 });
    noise(0.5, { gain: 0.1, freq: 300, q: 0.8 });
  },
  thud() {
    tone(55, 0.25, { type: "sine", gain: 0.3, slide: 0.5 });
  },
  pickup() {
    tone(880, 0.06, { type: "square", gain: 0.05 });
    tone(1320, 0.08, { type: "square", gain: 0.05, delay: 0.05 });
  },
  empty() {
    tone(1500, 0.03, { type: "square", gain: 0.04 });
  },
  switchWeapon() {
    noise(0.04, { gain: 0.1, freq: 3500, q: 2 });
    noise(0.05, { gain: 0.08, freq: 2200, q: 2, delay: 0.07 });
  },
  throwGrenade() {
    noise(0.12, { gain: 0.06, freq: 1200, q: 1, sweep: 2 });
  },
  nestDeath() {
    tone(160, 0.8, { type: "sawtooth", gain: 0.1, slide: 0.2 });
    noise(0.8, { gain: 0.25, freq: 400, q: 0.5, type: "lowpass", sweep: 0.2 });
  },
  exitOpen() {
    [0, 4, 7, 12].forEach((s, i) => tone(440 * 2 ** (s / 12), 0.18, { type: "triangle", gain: 0.08, delay: i * 0.09 }));
  },
  alarm() {
    [0, 1, 2, 3].forEach((i) => tone(i % 2 ? 520 : 680, 0.18, { type: "square", gain: 0.05, delay: i * 0.2 }));
  },
  clear() {
    [0, 4, 7, 12, 16].forEach((s, i) => tone(392 * 2 ** (s / 12), 0.22, { type: "triangle", gain: 0.09, delay: i * 0.1 }));
  },
  buy() {
    [0, 7, 12].forEach((s, i) => tone(660 * 2 ** (s / 12), 0.1, { type: "square", gain: 0.04, delay: i * 0.05 }));
  },
};

// Music -------------------------------------------------------------------------------------------

const hz = (s) => 440 * 2 ** (s / 12);

/** 16-step loops: root (semitones from A4), tempo (steps/s), lead (null = rest), bass every 2 steps. */
export const SONGS = {
  title: { root: -14, tempo: 4, lead: [0, null, 3, null, 7, null, 10, 8, 7, null, 3, null, 5, null, 2, null], bass: [0, 0, -2, -2, -4, -4, -5, -5], beat: false },
  mission: { root: -16, tempo: 6.4, lead: [0, null, null, 3, null, null, 1, null, 0, null, null, 7, null, 6, null, null], bass: [0, 0, 0, 0, 1, 1, -2, -2], beat: true },
  boss: { root: -15, tempo: 8, lead: [0, 1, 0, null, 6, null, 3, 1, 0, 1, 0, null, 8, 7, 6, null], bass: [0, 0, 1, 1, 0, 0, -1, -1], beat: true },
  shop: { root: -9, tempo: 4.4, lead: [7, null, 5, null, 3, 5, 7, null, 10, null, 8, 7, 5, null, 3, null], bass: [0, -5, -2, -7, 0, -5, -4, -2], beat: false },
};

let timer = null;
let current = null;
let step = 0;
let nextTime = 0;

export function playMusic(name) {
  if (name === current && timer) return;
  stopMusic();
  current = name;
  step = 0;
  nextTime = 0;
  timer = setInterval(() => schedule(SONGS[name]), 60);
}

export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null;
  current = null;
}

function schedule(song) {
  if (!context || muted || !musicOn || context.state !== "running") return;
  const len = 1 / song.tempo;
  const now = context.currentTime;
  if (nextTime < now) nextTime = now + 0.05;
  while (nextTime < now + 0.25) {
    const delay = nextTime - now;
    const lead = song.lead[step % 16];
    if (lead !== null) tone(hz(song.root + lead + 24), len * 0.8, { type: "sawtooth", gain: 0.025, delay, bus: musicBus });
    if (step % 2 === 0) tone(hz(song.root + song.bass[(step / 2) % 8]), len * 1.8, { type: "triangle", gain: 0.16, delay, bus: musicBus });
    if (song.beat) {
      if (step % 4 === 0) tone(95, 0.16, { type: "sine", gain: 0.3, delay, bus: musicBus, slide: 0.45 });
      if (step % 2 === 1) noise(0.03, { gain: 0.04, freq: 8000, q: 0.7, delay, bus: musicBus });
      if (step % 8 === 4) noise(0.12, { gain: 0.09, freq: 1500, q: 0.5, delay, bus: musicBus });
    }
    step += 1;
    nextTime += len;
  }
}
