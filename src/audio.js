// Audio v4: todo se sintetiza en JS como muestras (22 kHz) y se reproduce por WebAudio o,
// si el WebView no deja, por elementos <audio> con WAV generados. Cambia solo al que funcione.
const SR = 22050;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const GEARS = [0, 16, 30, 46, 64, 84, 125];

export function rpmOf(v) {
  let g = 0;
  while (g < 5 && v >= GEARS[g + 1]) g++;
  const f = clamp((v - GEARS[g]) / (GEARS[g + 1] - GEARS[g]), 0, 1);
  return { gear: g, rpm: v < 1 ? 0.12 : 0.28 + 0.72 * f };
}

/* ================= síntesis ================= */
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
const osc = (type, ph) => {
  ph -= Math.floor(ph);
  if (type === 'sq') return ph < 0.5 ? 1 : -1;
  if (type === 'saw') return 2 * ph - 1;
  if (type === 'tri') return 4 * Math.abs(ph - 0.5) - 1;
  return Math.sin(ph * 6.283185307);
};
const buf = sec => new Float32Array(Math.floor(sec * SR));
function addInto(dst, src, at = 0, g = 1, wrap = false) {
  const o = Math.floor(at * SR);
  for (let i = 0; i < src.length; i++) {
    let j = o + i;
    if (j >= dst.length) { if (!wrap) break; j %= dst.length; }
    dst[j] += src[i] * g;
  }
}
function tone(dur, f1, f2, type, amp, att = 0.004) {
  const n = Math.floor(dur * SR), b = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    ph += f1 * Math.pow(f2 / f1, t) / SR;
    const e = Math.min(1, i / (att * SR)) * (1 - t) * (1 - t);
    b[i] = osc(type, ph) * e * amp;
  }
  return b;
}
// ruido con filtro de estado variable (lp / hp / bp) y barrido de frecuencia
function noise(dur, type, f1, f2, Q, amp, att = 0.01) {
  const n = Math.floor(dur * SR), b = new Float32Array(n);
  let low = 0, band = 0;
  const q = 1 / Q;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const fc = Math.min(3400, f1 * Math.pow(f2 / f1, t));
    const f = 2 * Math.sin(Math.PI * fc / SR);
    const x = rnd();
    low += f * band;
    const high = x - low - q * band;
    band += f * high;
    const out = type === 'lp' ? low : type === 'hp' ? high : band;
    b[i] = out * Math.min(1, i / (att * SR)) * (1 - t) * (1 - t) * amp;
  }
  return b;
}

/* --- instrumentos de la música (se escriben dentro de un buffer) --- */
function iKick(b, t, a) {
  const i0 = Math.floor(t * SR), n = Math.floor(0.32 * SR);
  let ph = 0, ph2 = 0;
  for (let i = 0; i < n && i0 + i < b.length; i++) {
    const tt = i / SR;
    ph += (48 + 142 * Math.exp(-tt * 28)) / SR;
    ph2 += (140 + 1760 * Math.exp(-tt * 70)) / SR;
    b[i0 + i] += (Math.sin(ph * 6.2832) * Math.exp(-tt * 10) * 1.1 + Math.sin(ph2 * 6.2832) * Math.exp(-tt * 85) * 0.55) * a;
  }
}
function iHat(b, t, a) {
  const i0 = Math.floor(t * SR), n = Math.floor(0.07 * SR);
  let prev = 0;
  for (let i = 0; i < n && i0 + i < b.length; i++) {
    const x = rnd(), h = x - prev; prev = x;
    b[i0 + i] += h * Math.exp(-(i / SR) * 70) * a;
  }
}
function iSnare(b, t, a) {
  const i0 = Math.floor(t * SR), n = Math.floor(0.2 * SR);
  let prev = 0, ph = 0;
  for (let i = 0; i < n && i0 + i < b.length; i++) {
    const tt = i / SR, x = rnd(), h = x - 0.5 * prev; prev = x;
    ph += 200 / SR;
    b[i0 + i] += (h * Math.exp(-tt * 20) * 0.9 + Math.sin(ph * 6.2832) * Math.exp(-tt * 26) * 0.6) * a;
  }
}
function iNote(b, t, f, dur, a, o) { // o: {type, cut, det, att}
  const i0 = Math.floor(t * SR), n = Math.floor(dur * SR);
  const al = 1 - Math.exp(-6.2832 * o.cut / SR);
  let ph = 0, ph2 = 0, y = 0, y2 = 0;
  const det = o.det || 0, sub = o.sub || 0;
  for (let i = 0; i < n && i0 + i < b.length; i++) {
    const tt = i / n, env = Math.min(1, i / ((o.att || 0.004) * SR)) * Math.pow(1 - tt, o.pow || 2);
    ph += f / SR; ph2 += f * (1 + det) / SR;
    let s = osc(o.type, ph) + (det ? osc(o.type, ph2) : 0) + (sub ? osc('tri', ph * 0.5) * sub : 0);
    y += al * (s - y); y2 += al * (y - y2);
    b[i0 + i] += y2 * env * a;
  }
}
function delayFx(b, tSec, fb, taps) {
  const d = Math.floor(tSec * SR), n = b.length, c = new Float32Array(b);
  for (let k = 1; k <= taps; k++) {
    const g = Math.pow(fb, k);
    for (let i = 0; i < n; i++) b[(i + d * k) % n] += c[i] * g;
  }
}

const MUS = { bpm: 128 };
function musicLayer(which) { // 0 = bajo/bombo/arpegio, 1 = percusión, 2 = melodía + colchón
  const step = 60 / MUS.bpm / 4, steps = 8 * 16, L = buf(steps * step);
  const roots = [110, 87.31, 130.81, 98];
  const chords = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
  const bassP = [0, -1, 0, 12, 0, -1, 0, 12, 0, -1, 0, 12, 0, -1, 7, 5];
  const leadA = [12, -99, 15, -99, 17, -99, 15, 12, -99, 10, 12, -99, 7, -99, 10, -99];
  const leadB = [19, -99, 17, -99, 15, 17, -99, 15, 12, -99, 15, -99, 17, -99, 19, 22];
  const lead = which === 2 ? buf(steps * step) : null;
  for (let s = 0; s < steps; s++) {
    const t = s * step, bar = (s >> 4) % 4, q = s & 15, root = roots[bar], ch = chords[bar];
    if (which === 0) {
      if (q % 4 === 0) iKick(L, t, 0.9);
      const bn = bassP[q];
      if (bn >= 0) iNote(L, t, root * Math.pow(2, bn / 12), step * 1.6, 0.34, { type: 'saw', cut: 1500, sub: 0.4, pow: 1.5 });
      iNote(L, t, root * 4 * Math.pow(2, ch[[0, 1, 2, 1, 0, 2, 1, 2][q & 7]] / 12), step * 1.3, 0.27, { type: 'sq', cut: 2800, pow: 2 });
    } else if (which === 1) {
      if (q % 2 === 1) iHat(L, t, q % 4 === 3 ? 0.3 : 0.2);
      if (q === 4 || q === 12) iSnare(L, t, 0.55);
      if (q === 14 && (s >> 4) % 2 === 1) iSnare(L, t, 0.28);
    } else {
      const ln = ((s >> 4) >= 4 ? leadB : leadA)[q];
      if (ln > -50) iNote(lead, t, root * 4 * Math.pow(2, ln / 12), step * 3, 0.3, { type: 'saw', cut: 3000, det: 0.006, pow: 1.3, att: 0.01 });
      if (q === 0) for (const n of ch) iNote(L, t, root * 2 * Math.pow(2, n / 12), step * 15, 0.1, { type: 'saw', cut: 1100, det: 0.007, att: 0.35, pow: 0.6 });
    }
  }
  if (which === 0) { delayFx(L, step * 3, 0.32, 3); for (let i = 0; i < L.length; i++) L[i] = Math.tanh(L[i] * 1.7); }
  if (which === 2) { delayFx(lead, step * 3, 0.4, 3); addInto(L, lead, 0, 1); }
  return L;
}
function peakNorm(x, target = 0.85) {
  let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  const g = target / (p || 1); for (let i = 0; i < x.length; i++) x[i] *= g; return x;
}
function synthEngine() { // 1 s = 100 ciclos exactos -> bucle sin cortes
  const b = buf(1);
  for (let i = 0; i < b.length; i++) {
    const t = i / SR, p = t * 100;
    let s = 0;
    for (let k = 1; k <= 8; k++) s += Math.sin(6.2832 * k * p + k * 0.7) / Math.pow(k, 0.85);
    s += 0.45 * osc('saw', p) + 0.3 * Math.sin(6.2832 * 5.5 * p) + 0.2 * Math.sin(6.2832 * 0.5 * p);
    s *= 1 + 0.3 * Math.sin(6.2832 * 50 * t);
    b[i] = Math.tanh(s * 0.55);
  }
  let pk = 0; for (let i = 0; i < b.length; i++) pk = Math.max(pk, Math.abs(b[i]));
  for (let i = 0; i < b.length; i++) b[i] *= 0.85 / pk;
  return b;
}
function synthWind() {
  const n = SR, ex = 1500, b = new Float32Array(n + ex);
  let lo = 0, lo2 = 0, hp = 0;
  for (let i = 0; i < b.length; i++) {
    const x = rnd(); lo += 0.18 * (x - lo); lo2 += 0.5 * (lo - lo2); hp += 0.02 * (lo2 - hp);
    b[i] = lo2 - hp;
  }
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = i < ex ? b[i] * (i / ex) + b[n + i] * (1 - i / ex) : b[i];
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(o[i]));
  for (let i = 0; i < n; i++) o[i] *= 0.85 / pk;
  return o;
}
function synthSfx() {
  const S = {};
  S.click = tone(0.07, 900, 650, 'sq', 0.5);
  S.coin = (() => { const b = buf(0.3); addInto(b, tone(0.09, 1200, 1500, 'sq', 0.5), 0); addInto(b, tone(0.18, 1800, 2000, 'sq', 0.45), 0.07); return b; })();
  S.buy = (() => { const b = buf(0.35); addInto(b, tone(0.12, 500, 800, 'tri', 0.7), 0); addInto(b, tone(0.2, 800, 1200, 'tri', 0.7), 0.1); return b; })();
  S.deny = tone(0.2, 220, 140, 'saw', 0.6);
  S.heart = (() => { const b = buf(0.4); addInto(b, tone(0.16, 70, 42, 'sin', 1), 0); addInto(b, tone(0.16, 70, 42, 'sin', 0.8), 0.18); return b; })();
  S.pop = noise(0.12, 'lp', 1400, 500, 0.8, 1.6);
  S.scrape = noise(0.2, 'hp', 2500, 3000, 1.2, 0.9);
  S.crack = noise(0.28, 'hp', 2000, 2600, 0.7, 1.2);
  S.thunder = (() => { const b = buf(2.2); addInto(b, noise(2.2, 'lp', 700, 80, 0.8, 2.2), 0); addInto(b, tone(1.5, 75, 28, 'sin', 1), 0.05); return b; })();
  S.crash = (() => { const b = buf(1.0); addInto(b, noise(1.0, 'lp', 2200, 120, 0.7, 2.4), 0); addInto(b, tone(0.6, 130, 32, 'sin', 1.2), 0); addInto(b, tone(0.28, 240, 120, 'sq', 0.6), 0); addInto(b, noise(0.4, 'hp', 2800, 3200, 0.7, 1.4), 0); return b; })();
  S.nearMiss = (() => { const b = buf(0.45); addInto(b, noise(0.4, 'bp', 400, 3200, 3, 2.2), 0); addInto(b, tone(0.14, 1100, 1700, 'tri', 0.5), 0.05); return b; })();
  S.honk = (() => { const b = buf(0.45), f = 330; addInto(b, tone(0.42, f, f * 0.97, 'sq', 0.35), 0); addInto(b, tone(0.42, f * 1.25, f * 1.22, 'sq', 0.3), 0); return b; })();
  S.wheelie = (() => { const b = buf(0.35); addInto(b, tone(0.3, 200, 520, 'saw', 0.5), 0); addInto(b, noise(0.2, 'hp', 2500, 3000, 0.8, 0.8), 0); return b; })();
  S.nitro = (() => { const b = buf(1.2); addInto(b, noise(1.1, 'bp', 300, 3200, 2, 2.2), 0); addInto(b, tone(1.1, 180, 900, 'saw', 0.5), 0); addInto(b, tone(0.55, 90, 40, 'sin', 1), 0); return b; })();
  S.test = (() => { const b = buf(0.95); addInto(b, tone(0.22, 660, 660, 'sq', 0.7), 0); addInto(b, tone(0.22, 880, 880, 'sq', 0.7), 0.25); addInto(b, tone(0.38, 1320, 1320, 'sq', 0.7), 0.5); return b; })();
  for (const k in S) peakNorm(S[k], k === 'test' ? 0.8 : 0.9);
  return S;
}
// tareas pequeñas: se ejecutan una por una para no congelar la interfaz
export function synthTasks(data) {
  const raw = {};
  return [
    () => { seed = 12345; data.engine = synthEngine(); },
    () => { data.wind = synthWind(); },
    () => Object.assign(data, synthSfx()),
    () => { raw.l0 = musicLayer(0); data.mus0 = peakNorm(new Float32Array(raw.l0)); },
    () => { raw.l1 = musicLayer(1); data.mus1 = peakNorm(new Float32Array(raw.l1)); },
    () => { raw.l2 = musicLayer(2); data.mus2 = peakNorm(new Float32Array(raw.l2)); },
    () => {
      const m = new Float32Array(raw.l0.length);
      for (let i = 0; i < m.length; i++) m[i] = Math.tanh((raw.l0[i] + raw.l1[i] + raw.l2[i]) * 1.15);
      data.musmix = peakNorm(m);
    },
  ];
}
export function synth() { const d = {}; synthTasks(d).forEach(f => f()); return d; }
export function toWav(f32) { // WAV PCM 16 bits mono
  const n = f32.length, out = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, SR, true); out.setUint32(28, SR * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f32[i])) * 32767, true);
  return out.buffer;
}

/* ================= reproducción ================= */
class WebBE {
  constructor(data) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('sin WebAudio');
    this.name = 'webaudio'; this.data = data; this.cache = {};
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 1;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    this.master.connect(comp); comp.connect(c.destination);
  }
  get state() { return this.ctx.state; }
  ok() { return this.ctx.state === 'running' && this.ctx.currentTime > 0.05; }
  resume() { if (this.ctx.state !== 'running') { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); } }
  buffer(name) {
    if (!this.cache[name]) {
      const d = this.data[name], ab = this.ctx.createBuffer(1, d.length, SR);
      ab.copyToChannel(d, 0);
      this.cache[name] = ab;
    }
    return this.cache[name];
  }
  loops(names, vol) {
    const t = this.ctx.currentTime + 0.12;
    return names.map(n => {
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
      s.buffer = this.buffer(n); s.loop = true; g.gain.value = vol;
      s.connect(g); g.connect(this.master); s.start(t);
      return {
        vol: v => g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04),
        rate: r => s.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.05),
        stop: () => { try { s.stop(); } catch (e) {} },
      };
    });
  }
  shot(name, vol) {
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = this.buffer(name); g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start();
  }
  close() { try { this.ctx.close(); } catch (e) {} }
}
class HtmlBE {
  constructor(data) { this.name = 'html5'; this.data = data; this.urls = {}; this.errs = 0; this.live = []; }
  get state() { return this.errs ? 'error' : 'running'; }
  ok() { return true; }
  resume() { this.live.forEach(a => { if (a.paused) a.play().catch(() => {}); }); }
  url(name) {
    if (!this.urls[name]) this.urls[name] = URL.createObjectURL(new Blob([toWav(this.data[name])], { type: 'audio/wav' }));
    return this.urls[name];
  }
  loops(names, vol) {
    return names.map(n => {
      const a = new Audio(this.url(n));
      a.loop = true; a.volume = clamp(vol, 0, 1);
      try { a.preservesPitch = false; a.webkitPreservesPitch = false; a.mozPreservesPitch = false; } catch (e) {}
      const p = a.play(); if (p && p.catch) p.catch(() => { this.errs++; });
      this.live.push(a);
      return {
        vol: v => { a.volume = clamp(v, 0, 1); },
        rate: r => { a.playbackRate = clamp(r, 0.25, 4); },
        stop: () => { a.pause(); },
      };
    });
  }
  shot(name, vol) {
    const a = new Audio(this.url(name)); a.volume = clamp(vol, 0, 1);
    const p = a.play(); if (p && p.catch) p.catch(() => { this.errs++; });
  }
  close() { this.live.forEach(a => a.pause()); this.live = []; }
}

export class GameAudio {
  constructor() {
    this.mode = 0;          // 0 auto, 1 webaudio, 2 html5
    this.sfxOn = true; this.mv = 3; this.intensity = 0.3;
    this.data = {}; this.loading = false; this.be = null; this.mus = null; this.eng = null; this.windH = null;
    this.gear = 0; this.last = 0; this.err = ''; this.done = 0;
  }
  get state() { return (this.be ? this.be.name + ' · ' + this.be.state : 'sin iniciar') + (this.done < 7 && this.loading ? ' · cargando ' + this.done + '/7' : ''); }
  prefs(sfx, mv) { this.sfxOn = sfx; this.mv = mv; }

  loadData() {
    if (this.loading) return;
    this.loading = true;
    const tasks = synthTasks(this.data);
    const next = () => {
      if (!tasks.length) return;
      try { tasks.shift()(); this.done++; } catch (e) { this.err = 'síntesis: ' + (e.message || e); return; }
      this.tryLoops();
      setTimeout(next, 16);
    };
    setTimeout(next, 30);
  }
  makeBackend(kind) {
    this.dropBackend();
    try {
      this.be = kind === 'web' ? new WebBE(this.data) : new HtmlBE(this.data);
      this.err = '';
      this.tryLoops();
    } catch (e) { this.err = String(e.message || e); this.be = null; }
  }
  dropBackend() {
    if (!this.be) return;
    [...(this.mus || []), this.eng, this.windH].forEach(h => { try { h && h.stop(); } catch (e) {} });
    this.be.close(); this.be = null; this.mus = null; this.eng = null; this.windH = null;
  }
  tryLoops() {
    const be = this.be, d = this.data;
    if (!be) return;
    try {
      if (!this.eng && d.engine && d.wind) { [this.eng, this.windH] = be.loops(['engine', 'wind'], 0); be.resume(); }
      const web = be.name === 'webaudio', names = web ? ['mus0', 'mus1', 'mus2'] : ['musmix'];
      if (!this.mus && names.every(n => d[n])) { this.mus = be.loops(names, 0); be.resume(); }
    } catch (e) { this.err = String(e.message || e); }
  }
  init() { // llamar dentro de un toque (click / touchend)
    try {
      if (this.be) { this.be.resume(); return; }
      this.loadData();
      this.makeBackend(this.mode === 2 ? 'html' : 'web');
      if (this.mode === 0) setTimeout(() => { if (this.be && !this.be.ok()) this.makeBackend('html'); }, 1200);
    } catch (e) { this.err = String(e.message || e); }
  }
  toggleBackend() { // botón PROBAR: alterna WebAudio <-> HTML5 y suena una prueba
    this.loadData();
    this.mode = this.be && this.be.name === 'webaudio' ? 2 : 1;
    this.makeBackend(this.mode === 2 ? 'html' : 'web');
    setTimeout(() => this.shot('test', 0.9), 300);
  }
  shot(name, v = 0.8) {
    if (!this.be || !this.sfxOn || !this.data[name]) return;
    try { this.be.shot(name, v); } catch (e) { this.err = String(e.message || e); }
  }

  // d: {v, thr, nitro, mode}
  update(d) {
    if (!this.be) return;
    const now = performance.now();
    if (now - this.last < 45) return;
    this.last = now;
    const { gear, rpm } = rpmOf(d.v);
    const alive = d.mode === 'run' || d.mode === 'menu' || d.mode === 'garage' || d.mode === 'count';
    const sfx = this.sfxOn ? 1 : 0;
    if (this.eng) {
      this.eng.rate((42 + rpm * 215) / 100 * (d.nitro ? 1.06 : 1));
      this.eng.vol(alive ? (d.mode === 'run' || d.mode === 'count' ? 0.2 + 0.22 * d.thr : 0.1) * sfx : 0);
      const k = clamp(d.v / 90, 0, 1.3);
      this.windH.vol(d.mode === 'run' ? k * k * 0.55 * sfx : 0);
      this.windH.rate(0.8 + k * 0.6);
    }
    if (d.mode === 'run' && gear > this.gear) this.shot('pop', 0.4);
    this.gear = gear;
    if (this.mus) {
      const ms = [0, 0.5, 0.8, 1][this.mv], I = this.intensity;
      if (this.mus.length === 3) {
        this.mus[0].vol(0.95 * ms);
        this.mus[1].vol(clamp((I - 0.25) * 3, 0, 1) * 0.9 * ms);
        this.mus[2].vol(clamp((I - 0.5) * 3, 0, 1) * 0.9 * ms);
      } else this.mus[0].vol(0.9 * ms);
    }
  }

  crash() { this.shot('crash', 1); } nearMiss() { this.shot('nearMiss', 0.8); } honk() { this.shot('honk', 0.5); }
  wheelie() { this.shot('wheelie', 0.6); } nitro() { this.shot('nitro', 0.9); } pop(v = 0.5) { this.shot('pop', v); }
  click() { this.shot('click', 0.5); } scrape() { this.shot('scrape', 0.5); } heart() { this.shot('heart', 0.9); }
  coin() { this.shot('coin', 0.55); } buy() { this.shot('buy', 0.8); } deny() { this.shot('deny', 0.6); }
  thunder(delay = 0.4) { setTimeout(() => this.shot('thunder', 1), delay * 1000); } crack() { this.shot('crack', 0.9); }
  test() { this.shot('test', 0.9); }
}
