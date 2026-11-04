// Tiny WebAudio synth. No audio files: every sound is generated, so the build stays one file.
// Browsers only allow audio after a user gesture, so call sfx.unlock() from a pointer/key handler.

type Wave = OscillatorType;
const MUTE_KEY = 'kernel-architect.mute';

class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* ignore */ }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      this.out = this.ctx.createGain();
      this.out.gain.value = this.muted ? 0 : 0.55;
      this.out.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  /** Skip a sound if the same one played less than `ms` ago (keeps busy games from turning into noise). */
  private gate(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.last[key] ?? -1e9) < ms) return false;
    this.last[key] = now;
    return true;
  }

  private get ok(): boolean { return !!this.ctx && !!this.out && !this.muted && this.ctx.state === 'running'; }

  private tone(freq: number, dur: number, o: { type?: Wave; vol?: number; at?: number; to?: number; attack?: number; detune?: number } = {}) {
    if (!this.ok) return;
    const c = this.ctx!;
    const t = c.currentTime + (o.at ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const v = o.vol ?? 0.25;
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.out!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** A bell-ish note: fundamental plus two quiet overtones. */
  private bell(freq: number, dur: number, vol = 0.2, at = 0) {
    this.tone(freq, dur, { type: 'triangle', vol, at });
    this.tone(freq * 2.01, dur * 0.7, { type: 'sine', vol: vol * 0.45, at });
    this.tone(freq * 3.2, dur * 0.4, { type: 'sine', vol: vol * 0.2, at });
  }

  private noise(dur: number, o: { vol?: number; at?: number; freq?: number; to?: number; q?: number; type?: BiquadFilterType } = {}) {
    if (!this.ok || !this.noiseBuf) return;
    const c = this.ctx!;
    const t = c.currentTime + (o.at ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 2000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol ?? 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // ---------- interface ----------
  click() { this.tone(880, 0.05, { type: 'square', vol: 0.08 }); }
  hover() { if (this.gate('hover', 60)) this.tone(1400, 0.03, { type: 'sine', vol: 0.04 }); }
  pickup() { this.tone(380, 0.12, { type: 'sine', vol: 0.18, to: 720 }); }
  open() { this.noise(0.25, { vol: 0.06, freq: 500, to: 3000, q: 0.8 }); this.tone(520, 0.18, { type: 'sine', vol: 0.1, to: 780 }); }
  type() { if (this.gate('type', 25)) this.tone(1500 + Math.random() * 300, 0.018, { type: 'square', vol: 0.035 }); }
  next() { this.tone(660, 0.07, { type: 'triangle', vol: 0.14 }); this.tone(990, 0.1, { type: 'triangle', vol: 0.12, at: 0.06 }); }

  place() {
    this.tone(340, 0.16, { type: 'sine', vol: 0.3, to: 90 });
    this.noise(0.06, { vol: 0.12, freq: 1500, q: 2 });
    this.bell(1319, 0.3, 0.1, 0.07);
    this.bell(1760, 0.3, 0.08, 0.14);
  }
  connect() {
    this.tone(220, 0.14, { type: 'sawtooth', vol: 0.1, to: 1500 });
    this.noise(0.08, { vol: 0.08, freq: 5000, type: 'highpass' });
    this.bell(1568, 0.25, 0.1, 0.12);
  }
  cut() { this.noise(0.14, { vol: 0.16, freq: 4000, to: 800, type: 'highpass' }); this.tone(500, 0.12, { type: 'sawtooth', vol: 0.08, to: 150 }); }
  error() { this.tone(160, 0.16, { type: 'sawtooth', vol: 0.16, to: 90 }); this.tone(130, 0.16, { type: 'square', vol: 0.08, at: 0.08, to: 80 }); }
  go() {
    this.noise(0.55, { vol: 0.13, freq: 300, to: 4000, q: 0.7 });
    this.tone(180, 0.5, { type: 'sawtooth', vol: 0.08, to: 700 });
    this.bell(784, 0.3, 0.12, 0.35);
    this.bell(1175, 0.4, 0.12, 0.45);
  }
  pause() { this.tone(600, 0.12, { type: 'triangle', vol: 0.14, to: 300 }); }
  sell() { this.kaching(0.8); }

  // ---------- gameplay ----------
  coin(p = 0) {
    if (!this.gate('coin', 45)) return;
    const f = 1318.5 * (1 + p * 0.08 + (Math.random() - 0.5) * 0.06);
    this.tone(f, 0.09, { type: 'square', vol: 0.05 });
    this.tone(f * 1.335, 0.32, { type: 'triangle', vol: 0.11, at: 0.06 });
    this.tone(f * 2.67, 0.2, { type: 'sine', vol: 0.04, at: 0.06 });
  }
  thud() { if (this.gate('thud', 140)) this.tone(150, 0.1, { type: 'triangle', vol: 0.1, to: 70 }); }
  alarm() {
    this.tone(880, 0.12, { type: 'square', vol: 0.09 });
    this.tone(660, 0.12, { type: 'square', vol: 0.09, at: 0.16 });
    this.tone(880, 0.12, { type: 'square', vol: 0.09, at: 0.32 });
  }
  crash() {
    this.noise(0.7, { vol: 0.4, freq: 2400, to: 80, type: 'lowpass', q: 0.6 });
    this.tone(110, 0.7, { type: 'sine', vol: 0.4, to: 28 });
    this.tone(70, 0.4, { type: 'sawtooth', vol: 0.1, to: 30, at: 0.05 });
  }
  reboot() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', vol: 0.12, at: i * 0.07 })); }
  milestone() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.bell(f, 0.5, 0.14, i * 0.08));
    this.noise(0.15, { vol: 0.1, freq: 3000, q: 1.5 });
  }
  kaching(power = 1) {
    this.noise(0.04, { vol: 0.12 * power, freq: 6000, type: 'highpass' });
    this.tone(1568, 0.1, { type: 'square', vol: 0.07 * power });
    this.bell(2093, 0.7, 0.2 * power, 0.07);
    this.bell(2637, 0.9, 0.14 * power, 0.14);
  }

  // ---------- celebration ----------
  tick(i = 0) { this.tone(700 + i * 45, 0.05, { type: 'square', vol: 0.06 }); }
  step(i = 0) { this.tone(440 * Math.pow(1.122, i * 2), 0.09, { type: 'triangle', vol: 0.16 }); this.noise(0.03, { vol: 0.05, freq: 3000 }); }
  stepDone(i = 0) { this.bell(880 * Math.pow(1.122, i * 2), 0.35, 0.14); }
  suspense() { this.tone(98, 1.2, { type: 'sawtooth', vol: 0.07, to: 392, attack: 0.9 }); this.noise(1.2, { vol: 0.08, freq: 400, to: 6000, q: 0.8 }); }
  boom() {
    this.tone(150, 0.6, { type: 'sine', vol: 0.5, to: 35 });
    this.noise(0.5, { vol: 0.35, freq: 3500, to: 200, type: 'lowpass' });
  }
  pop() { this.noise(0.09, { vol: 0.2, freq: 1800, q: 3 }); this.tone(500, 0.08, { type: 'sine', vol: 0.12, to: 180 }); }
  swirl() {
    if (!this.ok) return;
    this.tone(280, 1.5, { type: 'sine', vol: 0.12, to: 2600, attack: 0.3 });
    this.tone(420, 1.5, { type: 'triangle', vol: 0.07, to: 3900, attack: 0.3 });
    for (let i = 0; i < 18; i++) this.bell(1400 + Math.random() * 2600, 0.35, 0.05, 0.1 + i * 0.075 + Math.random() * 0.05);
  }
  fanfare() {
    const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    seq.forEach((f, i) => {
      const at = i * 0.11;
      this.tone(f, 0.28, { type: 'square', vol: 0.08, at });
      this.tone(f / 2, 0.28, { type: 'triangle', vol: 0.12, at });
    });
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => {
      this.tone(f, 1.4, { type: 'triangle', vol: 0.1, at: 0.8, attack: 0.02 });
      this.tone(f * 2, 1.1, { type: 'sine', vol: 0.04, at: 0.8 });
    });
    this.noise(1.2, { vol: 0.07, freq: 6500, type: 'highpass', at: 0.8 });
  }
  star(i: number) {
    const base = [659.25, 783.99, 1046.5][i] ?? 1046.5;
    this.bell(base, 0.9, 0.24);
    this.bell(base * 1.5, 0.9, 0.12, 0.05);
    this.tone(90, 0.3, { type: 'sine', vol: 0.35, to: 45 });
    this.noise(0.4, { vol: 0.1, freq: 5000, type: 'highpass' });
  }
  starEmpty() { this.tone(180, 0.25, { type: 'triangle', vol: 0.14, to: 110 }); }
  coinShower(seconds = 2.5, density = 14) {
    if (!this.ok) return;
    const n = Math.round(seconds * density);
    for (let i = 0; i < n; i++) {
      const at = Math.random() * seconds;
      const f = 1250 + Math.random() * 900;
      this.tone(f, 0.07, { type: 'square', vol: 0.03, at });
      this.tone(f * 1.335, 0.28, { type: 'triangle', vol: 0.07, at: at + 0.05 });
    }
  }
  lose() {
    this.noise(0.5, { vol: 0.25, freq: 3000, to: 120, type: 'lowpass' });
    [392, 370, 349, 330].forEach((f, i) => this.tone(f, 0.38, { type: 'sawtooth', vol: 0.1, at: 0.15 + i * 0.28, to: f * 0.94 }));
    this.tone(98, 1.2, { type: 'sine', vol: 0.3, at: 0.2, to: 40 });
  }
  glitch() {
    for (let i = 0; i < 6; i++) this.noise(0.04, { vol: 0.12, freq: 800 + Math.random() * 4000, at: i * 0.05 + Math.random() * 0.02, q: 5 });
  }
}

export const sfx = new Sfx();
