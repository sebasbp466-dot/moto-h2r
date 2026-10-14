// Audio 100% procedural (WebAudio): motor, viento, música que sube con la velocidad y efectos.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const GEARS = [0, 16, 30, 46, 64, 84, 125];

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
    this.musicOn = true;
    this.intensity = 0.2;
    this.step = 0;
    this.nextT = 0;
    this.timer = null;
    this.heartT = 0;
    this.scrapeT = 0;
  }

  prefs(sfx, music) {
    this.sfxOn = sfx;
    this.musicOn = music;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(sfx ? 1 : 0, t, 0.05);
    this.musBus.gain.setTargetAtTime(music ? 0.55 : 0, t, 0.1);
  }

  init() {
    try {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      this.master.connect(comp); comp.connect(c.destination);

      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxOn ? 1 : 0; this.sfxBus.connect(this.master);
      this.musBus = c.createGain(); this.musBus.gain.value = this.musicOn ? 0.55 : 0; this.musBus.connect(this.master);
      this.duck = c.createGain(); this.duck.connect(this.musBus);
      this.musIn = c.createGain(); this.musIn.connect(this.duck);

      // eco para el arpegio
      this.delay = c.createDelay(1); this.delay.delayTime.value = 0.2;
      const fb = c.createGain(); fb.gain.value = 0.35;
      this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(this.musIn);

      // ruido blanco
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
      e.g2 = c.createGain(); e.g2.gain.value = 0.35;
      e.g3 = c.createGain(); e.g3.gain.value = 0;
      e.f = c.createBiquadFilter(); e.f.type = 'lowpass'; e.f.Q.value = 2;
      e.g = c.createGain(); e.g.gain.value = 0;
      e.o1.connect(e.g1); e.g1.connect(e.f);
      e.o2.connect(e.g2); e.g2.connect(e.f);
      e.f.connect(e.g);
      e.o3.connect(e.g3); e.g3.connect(e.g);
      e.g.connect(this.sfxBus);
      e.o1.start(); e.o2.start(); e.o3.start();
      this.gear = 0;

      // viento
      const w = this.wind = {};
      w.src = c.createBufferSource(); w.src.buffer = this.noiseBuf; w.src.loop = true;
      w.f = c.createBiquadFilter(); w.f.type = 'bandpass'; w.f.frequency.value = 500; w.f.Q.value = 0.6;
      w.g = c.createGain(); w.g.gain.value = 0;
      w.src.connect(w.f); w.f.connect(w.g); w.g.connect(this.sfxBus);
      w.src.start();

      this.startMusic();
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
    const alive = d.mode === 'run' || d.mode === 'menu';
    const f = 42 + rpm * 215;
    e.o1.frequency.setTargetAtTime(f, t, 0.04);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    e.o3.frequency.setTargetAtTime(f * 5.5, t, 0.04);
    e.f.frequency.setTargetAtTime(300 + rpm * 1800 + d.thr * 700, t, 0.05);
    e.g3.gain.setTargetAtTime(d.mode === 'run' ? (0.02 + rpm * 0.05 * (0.4 + 0.6 * d.thr)) * (d.nitro ? 2 : 1) : 0, t, 0.06);
    const base = d.mode === 'menu' ? 0.05 : 0.09 + 0.1 * d.thr;
    e.g.gain.setTargetAtTime(alive ? base : 0, t, 0.08);
    if (d.mode === 'run' && gear > this.gear) this.pop(0.35);
    this.gear = gear;

    const k = clamp(d.v / 90, 0, 1.3);
    this.wind.g.gain.setTargetAtTime(d.mode === 'run' ? k * k * 0.32 : 0, t, 0.1);
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
      if (this.musicOn) this.playStep(this.step, this.nextT);
      const bpm = 118 + this.intensity * 42;
      this.nextT += 60 / bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }
  playStep(step, t) {
    const bar = (step >> 4) & 3, s = step & 15, I = this.intensity;
    const roots = [55, 43.65, 65.41, 49.0];
    const chords = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
    const root = roots[bar];
    if (s % 4 === 0) this.kick(t);
    if (I > 0.25 && (s % 2 === 1 || I > 0.8)) this.hat(t, s % 4 === 2 ? 0.12 : 0.07);
    if (I > 0.5 && (s === 4 || s === 12)) this.snare(t);
    const bp = [0, -1, 0, 12, 0, -1, 0, 12, 0, -1, 0, 12, 0, -1, 7, 5][s];
    if (bp >= 0) this.bass(t, root * Math.pow(2, bp / 12), I);
    if (I > 0.3) {
      const ch = chords[bar];
      const idx = [0, 1, 2, 1, 0, 2, 1, 2][s & 7];
      this.arp(t, root * 4 * Math.pow(2, ch[idx] / 12), I);
    }
    if (I > 0.55 && s === 0) this.pad(t, root * 4, chords[bar], I);
  }
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.003, 0.9, 0.26);
    o.connect(g); g.connect(this.musIn);
    o.start(t); o.stop(t + 0.32);
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(0.35, t);
    this.duck.gain.linearRampToValueAtTime(1, t + 0.22);
  }
  hat(t, v) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
    this.env(g, t, 0.002, v, 0.05);
    s.connect(f); f.connect(g); g.connect(this.musIn);
    s.start(t, Math.random()); s.stop(t + 0.08);
  }
  snare(t) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
    this.env(g, t, 0.002, 0.45, 0.17);
    s.connect(f); f.connect(g); g.connect(this.musIn);
    s.start(t, Math.random()); s.stop(t + 0.22);
    const o = c.createOscillator(), g2 = c.createGain();
    o.type = 'triangle'; o.frequency.value = 190;
    this.env(g2, t, 0.002, 0.3, 0.12);
    o.connect(g2); g2.connect(this.musIn); o.start(t); o.stop(t + 0.18);
  }
  bass(t, f, I) {
    const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.value = 220 + I * 600; fl.Q.value = 4;
    this.env(g, t, 0.004, 0.34, 0.15);
    o.connect(fl); fl.connect(g); g.connect(this.musIn);
    o.start(t); o.stop(t + 0.2);
  }
  arp(t, f, I) {
    const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'square'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.value = 1200 + I * 2200;
    this.env(g, t, 0.003, 0.07 + I * 0.04, 0.13);
    o.connect(fl); fl.connect(g); g.connect(this.musIn); g.connect(this.delay);
    o.start(t); o.stop(t + 0.18);
  }
  pad(t, f, ch, I) {
    const c = this.ctx;
    const dur = 60 / (118 + I * 42) * 4;
    for (const n of ch) {
      for (const det of [-7, 7]) {
        const o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = f * Math.pow(2, n / 12); o.detune.value = det;
        fl.type = 'lowpass'; fl.frequency.value = 900;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.025, t + dur * 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(fl); fl.connect(g); g.connect(this.musIn);
        o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }

  // ---- efectos ----
  noise(dur, type, f1, q, peak, f2) {
    if (!this.ctx || !this.sfxOn) return;
    const c = this.ctx, t = c.currentTime;
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
}
