// Audio 100% procedural (WebAudio): motor, viento, música que sube con la velocidad y efectos.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const GEARS = [0, 16, 30, 46, 64, 84, 125];
const MUSIC_GAIN = [0, 0.7, 1.2, 1.9];

export function rpmOf(v) {
  let g = 0;
  while (g < 5 && v >= GEARS[g + 1]) g++;
  const f = clamp((v - GEARS[g]) / (GEARS[g + 1] - GEARS[g]), 0, 1);
  return { gear: g, rpm: v < 1 ? 0.12 : 0.28 + 0.72 * f };
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.mv = 3;
    this.intensity = 0.3;
    this.step = 0;
    this.nextT = 0;
    this.timer = null;
  }
  get state() { return this.ctx ? this.ctx.state : 'sin audio'; }

  prefs(sfx, mv) {
    this.sfxOn = sfx; this.mv = mv;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(sfx ? 1 : 0, t, 0.05);
    this.musBus.gain.setTargetAtTime(MUSIC_GAIN[mv] * 0.5, t, 0.1);
  }

  init() {
    try {
      if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0.95;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
      this.master.connect(comp); comp.connect(c.destination);

      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxOn ? 1 : 0; this.sfxBus.connect(this.master);
      this.musBus = c.createGain(); this.musBus.gain.value = MUSIC_GAIN[this.mv] * 0.5; this.musBus.connect(this.master);
      this.duck = c.createGain(); this.duck.connect(this.musBus);
      this.musIn = c.createGain(); this.musIn.connect(this.duck);

      this.delay = c.createDelay(1); this.delay.delayTime.value = 0.2;
      const fb = c.createGain(); fb.gain.value = 0.38;
      this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(this.musIn);

      const len = Math.max(1, Math.floor(c.sampleRate * 2));
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // motor
      const e = this.eng = {};
      e.o1 = c.createOscillator(); e.o1.type = 'sawtooth';
      e.o2 = c.createOscillator(); e.o2.type = 'square';
      e.o3 = c.createOscillator(); e.o3.type = 'sine';
      e.g1 = c.createGain(); e.g1.gain.value = 0.5;
      e.g2 = c.createGain(); e.g2.gain.value = 0.3;
      e.g3 = c.createGain(); e.g3.gain.value = 0;
      e.f = c.createBiquadFilter(); e.f.type = 'lowpass'; e.f.Q.value = 2;
      e.g = c.createGain(); e.g.gain.value = 0;
      e.o1.connect(e.g1); e.g1.connect(e.f);
      e.o2.connect(e.g2); e.g2.connect(e.f);
      e.f.connect(e.g);
      e.o3.connect(e.g3); e.g3.connect(e.g);
      e.g.connect(this.sfxBus);
      e.o1.start(); e.o2.start(); e.o3.start();
      this.gear = 0; this.engMul = 1;

      // viento
      const w = this.wind = {};
      w.src = c.createBufferSource(); w.src.buffer = this.noiseBuf; w.src.loop = true;
      w.f = c.createBiquadFilter(); w.f.type = 'bandpass'; w.f.frequency.value = 500; w.f.Q.value = 0.6;
      w.g = c.createGain(); w.g.gain.value = 0;
      w.src.connect(w.f); w.f.connect(w.g); w.g.connect(this.sfxBus);
      w.src.start();

      this.startMusic();
      if (c.state !== 'running') c.resume();
    } catch (err) {
      console.warn('audio', err);
      this.ctx = null;
    }
  }

  // d: {v, thr, nitro, mode}
  update(d) {
    const c = this.ctx;
    if (!c || !this.eng) return;
    const t = c.currentTime;
    const { gear, rpm } = rpmOf(d.v);
    const e = this.eng;
    const alive = d.mode === 'run' || d.mode === 'menu' || d.mode === 'garage';
    const f = 42 + rpm * 215;
    e.o1.frequency.setTargetAtTime(f, t, 0.04);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    e.o3.frequency.setTargetAtTime(f * 5.5, t, 0.04);
    e.f.frequency.setTargetAtTime(300 + rpm * 1800 + d.thr * 700, t, 0.05);
    e.g3.gain.setTargetAtTime(d.mode === 'run' ? (0.015 + rpm * 0.04 * (0.4 + 0.6 * d.thr)) * (d.nitro ? 2 : 1) : 0, t, 0.06);
    const base = d.mode === 'run' ? 0.055 + 0.075 * d.thr : 0.025;
    e.g.gain.setTargetAtTime(alive ? base : 0, t, 0.08);
    if (d.mode === 'run' && gear > this.gear) this.pop(0.3);
    this.gear = gear;
    const k = clamp(d.v / 90, 0, 1.3);
    this.wind.g.gain.setTargetAtTime(d.mode === 'run' ? k * k * 0.26 : 0, t, 0.1);
    this.wind.f.frequency.setTargetAtTime(380 + d.v * 14, t, 0.1);
  }

  // ---- música ----
  startMusic() {
    if (this.timer || !this.ctx) return;
    this.nextT = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.sched(), 30);
  }
  sched() {
    const c = this.ctx;
    if (!c) return;
    if (this.nextT < c.currentTime - 0.5) this.nextT = c.currentTime + 0.05;
    let guard = 0;
    while (this.nextT < c.currentTime + 0.15 && guard++ < 16) {
      if (this.mv > 0) { try { this.playStep(this.step, this.nextT); } catch (e) { console.warn(e); } }
      const bpm = 120 + this.intensity * 40;
      this.nextT += 60 / bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }
  playStep(step, t) {
    const bar = (step >> 4) & 3, s = step & 15, I = this.intensity;
    const roots = [110, 87.31, 130.81, 98.0]; // La, Fa, Do, Sol (una octava arriba: se oye en un teléfono)
    const chords = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
    const root = roots[bar];
    if (s % 4 === 0) this.kick(t);
    if (s % 2 === 1 || I > 0.7) this.hat(t, s % 4 === 2 ? 0.2 : 0.12);
    if ((s === 4 || s === 12) && I > 0.35) this.snare(t);
    const bp = [0, -1, 0, 12, 0, -1, 0, 12, 0, -1, 0, 12, 0, -1, 7, 5][s];
    if (bp >= 0) this.bass(t, root * Math.pow(2, bp / 12), I);
    const ch = chords[bar];
    const idx = [0, 1, 2, 1, 0, 2, 1, 2][s & 7];
    this.arp(t, root * 4 * Math.pow(2, ch[idx] / 12), I);
    if (I > 0.4) {
      const lead = [12, -99, 15, -99, 17, -99, 15, 12, -99, 10, 12, -99, 7, -99, 10, -99][s];
      if (lead > -50) this.lead(t, root * 4 * Math.pow(2, lead / 12), I);
    }
    if (s === 0) this.pad(t, root * 2, chords[bar], I);
  }
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    this.env(g, t, 0.003, 1.1, 0.24);
    o.connect(g); g.connect(this.musIn);
    o.start(t); o.stop(t + 0.3);
    // "clic" agudo para que el golpe se oiga aunque el altavoz no dé graves
    const o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(1900, t);
    o2.frequency.exponentialRampToValueAtTime(140, t + 0.04);
    this.env(g2, t, 0.001, 0.5, 0.05);
    o2.connect(g2); g2.connect(this.musIn);
    o2.start(t); o2.stop(t + 0.1);
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(0.45, t);
    this.duck.gain.linearRampToValueAtTime(1, t + 0.2);
  }
  hat(t, v) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'highpass'; f.frequency.value = 6500;
    this.env(g, t, 0.002, v, 0.05);
    s.connect(f); f.connect(g); g.connect(this.musIn);
    s.start(t, Math.random()); s.stop(t + 0.08);
  }
  snare(t) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    this.env(g, t, 0.002, 0.7, 0.17);
    s.connect(f); f.connect(g); g.connect(this.musIn);
    s.start(t, Math.random()); s.stop(t + 0.22);
    const o = c.createOscillator(), g2 = c.createGain();
    o.type = 'triangle'; o.frequency.value = 200;
    this.env(g2, t, 0.002, 0.4, 0.12);
    o.connect(g2); g2.connect(this.musIn); o.start(t); o.stop(t + 0.18);
  }
  bass(t, f, I) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    o2.type = 'triangle'; o2.frequency.value = f * 0.5;
    fl.type = 'lowpass'; fl.frequency.value = 500 + I * 900; fl.Q.value = 4;
    this.env(g, t, 0.004, 0.42, 0.16);
    o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(this.musIn);
    o.start(t); o.stop(t + 0.22); o2.start(t); o2.stop(t + 0.22);
  }
  arp(t, f, I) {
    const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'square'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.value = 1500 + I * 2600;
    this.env(g, t, 0.003, 0.16 + I * 0.1, 0.14);
    o.connect(fl); fl.connect(g); g.connect(this.musIn); g.connect(this.delay);
    o.start(t); o.stop(t + 0.19);
  }
  lead(t, f, I) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; o2.type = 'sawtooth'; o2.frequency.value = f; o2.detune.value = 9;
    fl.type = 'lowpass'; fl.frequency.value = 2400 + I * 2000;
    this.env(g, t, 0.01, 0.2 + I * 0.1, 0.3);
    o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(this.musIn); g.connect(this.delay);
    o.start(t); o.stop(t + 0.36); o2.start(t); o2.stop(t + 0.36);
  }
  pad(t, f, ch, I) {
    const c = this.ctx;
    const dur = 60 / (120 + I * 40) * 4;
    for (const n of ch) {
      for (const det of [-7, 7]) {
        const o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = f * Math.pow(2, n / 12); o.detune.value = det;
        fl.type = 'lowpass'; fl.frequency.value = 1200;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(fl); fl.connect(g); g.connect(this.musIn);
        o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }

  // ---- efectos ----
  noise(dur, type, f1, q, peak, f2, delay = 0) {
    if (!this.ctx || !this.sfxOn) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f1, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    this.env(g, t, 0.01, peak, dur);
    s.connect(fl); fl.connect(g); g.connect(this.sfxBus);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(f1, f2, dur, type, peak, delay = 0) {
    if (!this.ctx || !this.sfxOn) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    this.env(g, t, 0.005, peak, dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  crash() {
    this.noise(0.9, 'lowpass', 1400, 0.7, 1.0, 90);
    this.tone(120, 30, 0.6, 'sine', 1.0);
    this.tone(220, 110, 0.25, 'square', 0.35);
    this.noise(0.35, 'highpass', 3000, 0.7, 0.5);
  }
  nearMiss() { this.noise(0.35, 'bandpass', 400, 3, 0.55, 3000); this.tone(1100, 1700, 0.12, 'triangle', 0.12); }
  honk() {
    const f = 300 + Math.random() * 160;
    this.tone(f, f * 0.97, 0.4, 'square', 0.07);
    this.tone(f * 1.25, f * 1.22, 0.4, 'square', 0.06);
  }
  wheelie() { this.tone(200, 520, 0.28, 'sawtooth', 0.14); this.noise(0.18, 'highpass', 2500, 0.8, 0.25); }
  nitro() { this.noise(1.0, 'bandpass', 300, 2, 0.6, 4000); this.tone(180, 900, 1.0, 'sawtooth', 0.12); this.tone(90, 40, 0.5, 'sine', 0.7); }
  pop(v = 0.5) { this.noise(0.1, 'lowpass', 900, 0.8, v); }
  click() { this.tone(800, 600, 0.06, 'square', 0.12); }
  scrape() { this.noise(0.18, 'highpass', 2200, 1.2, 0.35); }
  heart() { this.tone(60, 40, 0.14, 'sine', 0.8); this.tone(60, 40, 0.14, 'sine', 0.6, 0.18); }
  coin() { this.tone(1200, 1500, 0.08, 'square', 0.1); this.tone(1800, 2000, 0.14, 'square', 0.09, 0.07); }
  buy() { this.tone(500, 800, 0.1, 'triangle', 0.2); this.tone(800, 1200, 0.18, 'triangle', 0.2, 0.1); }
  deny() { this.tone(200, 140, 0.18, 'sawtooth', 0.15); }
  thunder(delay = 0.4) { this.noise(1.8, 'lowpass', 500, 0.8, 1.0, 60, delay); this.tone(70, 28, 1.2, 'sine', 0.8, delay); }
  crack() { this.noise(0.25, 'highpass', 1500, 0.7, 0.7); }
  test() { this.tone(660, 660, 0.2, 'square', 0.25); this.tone(880, 880, 0.2, 'square', 0.25, 0.22); this.tone(1320, 1320, 0.3, 'square', 0.25, 0.44); }
}
