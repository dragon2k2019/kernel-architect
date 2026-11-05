// Layered WebAudio synth. No audio files: every sound is generated, so the build stays one file.
// Browsers only allow audio after a user gesture, so call sfx.unlock() from a pointer/key handler.
//
// Signal flow:
//   voices -> sfxBus ----------------------------> master -> compressor -> speakers
//          -> reverb send -> convolver (generated hall) -^
//          -> echo send   -> stereo ping-pong delay ------^
//   music  -> musicBus (own voice budget, own volume) ----^
//
// Every "feeling" sound is a stack of several layers (sub, body, transient, sparkle, air, tail) so it has weight
// and shine at once. Music is a tiny generative bed that gains layers as your combo grows.

type Wave = OscillatorType;
const MUTE_KEY = 'kernel-architect.mute';
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface ToneOpts {
  type?: Wave; vol?: number; at?: number; to?: number; attack?: number; detune?: number;
  rev?: number; echo?: number; pan?: number; lp?: number; music?: boolean;
}
interface NoiseOpts {
  vol?: number; at?: number; freq?: number; to?: number; q?: number; type?: BiquadFilterType;
  rev?: number; pan?: number; attack?: number; music?: boolean;
}

export interface Mood { tier: number; danger: number; hype: boolean }

class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private revIn: GainNode | null = null;
  private echoIn: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  private voices = 0;
  private mVoices = 0;
  private static readonly MAX_VOICES = 110;
  private static readonly MAX_MUSIC = 36;
  muted = false;

  // music state
  private mTimer: number | undefined;
  private mNext = 0;
  private mStep = 0;
  private mood: Mood = { tier: 0, danger: 0, hype: false };

  constructor() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* ignore */ }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.22;
      this.out = c.createGain();
      this.out.gain.value = this.muted ? 0 : 0.6;
      this.out.connect(comp).connect(c.destination);

      this.sfxBus = c.createGain();
      this.sfxBus.connect(this.out);
      this.musicBus = c.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.out);

      // generated hall reverb: decaying stereo noise, softened
      const rl = Math.floor(c.sampleRate * 2.4);
      const ir = c.createBuffer(2, rl, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < rl; i++) {
          lp += ((Math.random() * 2 - 1) - lp) * 0.55;
          d[i] = lp * Math.pow(1 - i / rl, 2.8);
        }
      }
      const conv = c.createConvolver();
      conv.buffer = ir;
      this.revIn = c.createGain();
      const revOut = c.createGain();
      revOut.gain.value = 0.55;
      this.revIn.connect(conv).connect(revOut).connect(this.out);
      this.musicBus.connect(this.revIn); // a touch of room on the music too

      // ping-pong echo for sparkles
      this.echoIn = c.createGain();
      const dl = c.createDelay(1); dl.delayTime.value = 0.23;
      const dr = c.createDelay(1); dr.delayTime.value = 0.34;
      const fb = c.createGain(); fb.gain.value = 0.38;
      const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 4200;
      this.echoIn.connect(dl);
      dl.connect(tone); tone.connect(dr); dr.connect(fb); fb.connect(dl);
      if (c.createStereoPanner) {
        const pl = c.createStereoPanner(); pl.pan.value = -0.6;
        const pr = c.createStereoPanner(); pr.pan.value = 0.6;
        dl.connect(pl).connect(this.out); dr.connect(pr).connect(this.out);
      } else { dl.connect(this.out); dr.connect(this.out); }

      const len = c.sampleRate * 1.5;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const nd = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }

  /** Skip a sound if the same one played less than `ms` ago (keeps busy games from turning into noise). */
  private gate(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.last[key] ?? -1e9) < ms) return false;
    this.last[key] = now;
    return true;
  }

  private get ok(): boolean { return !!this.ctx && !!this.out && !this.muted && this.ctx.state === 'running'; }

  // ---------------------------------------------------------------- primitives
  private tone(freq: number, dur: number, o: ToneOpts = {}) {
    if (!this.ok) return;
    const music = !!o.music;
    if (music ? this.mVoices >= Sfx.MAX_MUSIC : this.voices >= Sfx.MAX_VOICES) return;
    const c = this.ctx!;
    const t = c.currentTime + (o.at ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const v = o.vol ?? 0.25;
    const a = Math.min(o.attack ?? 0.005, dur * 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const chain: AudioNode[] = [osc, g];
    osc.connect(g);
    let node: AudioNode = g;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; chain.push(f); }
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); node.connect(p); node = p; chain.push(p); }
    node.connect((music ? this.musicBus : this.sfxBus)!);
    const rev = o.rev ?? (music ? 0 : 0.16);
    if (rev > 0) { const s = c.createGain(); s.gain.value = rev; node.connect(s); s.connect(this.revIn!); chain.push(s); }
    if (o.echo) { const s = c.createGain(); s.gain.value = o.echo; node.connect(s); s.connect(this.echoIn!); chain.push(s); }
    if (music) this.mVoices++; else this.voices++;
    osc.onended = () => { if (music) this.mVoices--; else this.voices--; chain.forEach((n) => n.disconnect()); };
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, o: NoiseOpts = {}) {
    if (!this.ok || !this.noiseBuf) return;
    const music = !!o.music;
    if (music ? this.mVoices >= Sfx.MAX_MUSIC : this.voices >= Sfx.MAX_VOICES) return;
    const c = this.ctx!;
    const t = c.currentTime + (o.at ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 2000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    const v = o.vol ?? 0.2;
    if (o.attack) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + o.attack); }
    else g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const chain: AudioNode[] = [src, f, g];
    src.connect(f); f.connect(g);
    let node: AudioNode = g;
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; node.connect(p); node = p; chain.push(p); }
    node.connect((music ? this.musicBus : this.sfxBus)!);
    if (o.rev) { const s = c.createGain(); s.gain.value = o.rev; node.connect(s); s.connect(this.revIn!); chain.push(s); }
    if (music) this.mVoices++; else this.voices++;
    src.onended = () => { if (music) this.mVoices--; else this.voices--; chain.forEach((n) => n.disconnect()); };
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** Detuned unison stack: fat, wide, alive. */
  private unison(freq: number, dur: number, o: ToneOpts & { voices?: number; spread?: number } = {}) {
    const n = o.voices ?? 3;
    const spread = o.spread ?? 14;
    const vol = (o.vol ?? 0.2) / Math.sqrt(n);
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : i / (n - 1) * 2 - 1;
      this.tone(freq, dur, { ...o, vol, detune: k * spread, pan: (o.pan ?? 0) + k * 0.55 });
    }
  }

  /** A bell: fundamental + inharmonic partials + a bright transient, with echo and reverb. */
  private bell(freq: number, dur: number, vol = 0.2, at = 0, echo = 0.22) {
    this.tone(freq, dur, { type: 'triangle', vol, at, rev: 0.3, echo });
    this.tone(freq * 2.01, dur * 0.7, { type: 'sine', vol: vol * 0.45, at, rev: 0.3 });
    this.tone(freq * 2.76, dur * 0.5, { type: 'sine', vol: vol * 0.22, at, rev: 0.25 });
    this.tone(freq * 5.4, dur * 0.22, { type: 'sine', vol: vol * 0.1, at });
    this.noise(0.03, { vol: vol * 0.25, freq: Math.min(9000, freq * 4), type: 'highpass', at });
  }

  /** Chest-thump: a falling sine plus a click. */
  private sub(freq: number, dur: number, vol = 0.4, at = 0, to?: number) {
    this.tone(freq, dur, { type: 'sine', vol, at, to: to ?? freq * 0.4, rev: 0.05 });
    this.tone(freq * 2, dur * 0.4, { type: 'triangle', vol: vol * 0.3, at, to: (to ?? freq * 0.4) * 2, rev: 0 });
  }

  private chord(notes: number[], dur: number, o: ToneOpts & { voices?: number; stagger?: number } = {}) {
    notes.forEach((f, i) => this.unison(f, dur, { ...o, at: (o.at ?? 0) + i * (o.stagger ?? 0) }));
  }

  /** A rising whoosh/riser that builds expectation. */
  private riser(dur: number, vol = 0.14, at = 0) {
    this.noise(dur, { vol, freq: 250, to: 7000, q: 0.9, attack: dur * 0.92, at, rev: 0.2 });
    this.tone(120, dur, { type: 'sawtooth', vol: vol * 0.55, to: 900, attack: dur * 0.95, at, lp: 2500 });
    this.tone(240, dur, { type: 'triangle', vol: vol * 0.5, to: 2600, attack: dur * 0.95, at, echo: 0.1 });
    this.tone(60, dur, { type: 'sine', vol: vol * 1.3, to: 220, attack: dur * 0.95, at, rev: 0 });
  }

  /** Big layered impact: sub + body + crack + metal + shimmer + tail. */
  private impact(power = 1, at = 0) {
    this.sub(150, 0.9, 0.5 * power, at, 32);
    this.tone(70, 1.2, { type: 'sine', vol: 0.3 * power, at, to: 28, rev: 0.1 });
    this.noise(0.9, { vol: 0.34 * power, freq: 3800, to: 120, type: 'lowpass', at, rev: 0.35 });
    this.noise(0.12, { vol: 0.28 * power, freq: 5000, type: 'highpass', at });
    this.tone(220, 0.5, { type: 'sawtooth', vol: 0.1 * power, at, to: 55, lp: 1800 });
    this.bell(440, 1.6, 0.12 * power, at + 0.02, 0.3);
    this.noise(1.6, { vol: 0.08 * power, freq: 7000, type: 'highpass', at: at + 0.05, rev: 0.5 });
  }

  // ---------------------------------------------------------------- interface
  click() {
    this.tone(880, 0.05, { type: 'square', vol: 0.07, rev: 0.05 });
    this.tone(1760, 0.09, { type: 'sine', vol: 0.05, at: 0.008, echo: 0.08 });
    this.noise(0.015, { vol: 0.06, freq: 6000, type: 'highpass' });
  }
  hover() {
    if (!this.gate('hover', 60)) return;
    this.tone(1400, 0.03, { type: 'sine', vol: 0.035, rev: 0.05 });
    this.tone(2100, 0.05, { type: 'sine', vol: 0.015, at: 0.01 });
  }
  pickup() {
    this.tone(380, 0.13, { type: 'sine', vol: 0.18, to: 720 });
    this.tone(760, 0.13, { type: 'triangle', vol: 0.08, to: 1440, at: 0.01 });
    this.noise(0.14, { vol: 0.05, freq: 800, to: 3200, q: 1.2, rev: 0.1 });
  }
  open() {
    this.noise(0.3, { vol: 0.07, freq: 500, to: 3200, q: 0.8, rev: 0.25 });
    this.tone(520, 0.2, { type: 'sine', vol: 0.1, to: 780 });
    this.bell(1568, 0.5, 0.06, 0.12);
    this.sub(90, 0.3, 0.14, 0.02, 60);
  }
  type() { if (this.gate('type', 25)) this.tone(1500 + Math.random() * 300, 0.018, { type: 'square', vol: 0.03, rev: 0 }); }
  next() {
    this.tone(660, 0.08, { type: 'triangle', vol: 0.14 });
    this.tone(990, 0.12, { type: 'triangle', vol: 0.12, at: 0.06, echo: 0.15 });
    this.bell(1980, 0.4, 0.05, 0.1);
  }

  place() {
    const j = 0.94 + Math.random() * 0.12;
    this.sub(130 * j, 0.35, 0.5, 0, 42);
    this.tone(340 * j, 0.17, { type: 'sine', vol: 0.3, to: 90 });
    this.tone(210 * j, 0.1, { type: 'square', vol: 0.09, to: 70, lp: 900 });
    this.noise(0.07, { vol: 0.14, freq: 1500, q: 2, rev: 0.15 });
    this.noise(0.03, { vol: 0.12, freq: 7000, type: 'highpass' });
    [1319, 1760, 2349].forEach((f, i) => this.bell(f * j, 0.34, 0.085 - i * 0.012, 0.08 + i * 0.065));
  }
  connect() {
    this.tone(220, 0.15, { type: 'sawtooth', vol: 0.1, to: 1500, lp: 3000 });
    this.tone(3000, 0.09, { type: 'square', vol: 0.04, to: 800, at: 0.1, rev: 0.05 });
    this.noise(0.09, { vol: 0.08, freq: 5000, type: 'highpass' });
    this.sub(100, 0.2, 0.18, 0.12, 60);
    this.bell(1568, 0.3, 0.1, 0.12);
    this.bell(2093, 0.4, 0.07, 0.2);
  }
  cut() {
    this.noise(0.15, { vol: 0.17, freq: 4000, to: 800, type: 'highpass', rev: 0.1 });
    this.tone(500, 0.13, { type: 'sawtooth', vol: 0.08, to: 150, lp: 2200 });
    this.tone(2400, 0.03, { type: 'square', vol: 0.06, rev: 0 });
    this.sub(110, 0.14, 0.15, 0.02, 50);
  }
  error() {
    this.tone(160, 0.18, { type: 'sawtooth', vol: 0.12, to: 90, lp: 1400 });
    this.tone(163, 0.18, { type: 'sawtooth', vol: 0.1, to: 88, lp: 1400, detune: 18 });
    this.tone(130, 0.18, { type: 'square', vol: 0.07, at: 0.09, to: 80, lp: 900 });
    this.sub(80, 0.25, 0.22, 0, 40);
    this.noise(0.05, { vol: 0.08, freq: 600, q: 3 });
  }
  go() {
    this.riser(0.6, 0.13);
    this.sub(60, 0.7, 0.28, 0.4, 28);
    [60, 64, 67, 72].forEach((m, i) => this.bell(midi(m + 12), 0.45, 0.1, 0.38 + i * 0.07));
    this.unison(midi(48), 0.9, { type: 'sawtooth', vol: 0.1, at: 0.4, lp: 1500, attack: 0.02 });
    this.noise(0.2, { vol: 0.12, freq: 4000, to: 600, type: 'highpass', at: 0.4, rev: 0.3 });
  }
  pause() {
    this.tone(600, 0.2, { type: 'triangle', vol: 0.14, to: 220 });
    this.tone(900, 0.2, { type: 'sine', vol: 0.07, to: 330, at: 0.01 });
    this.noise(0.2, { vol: 0.05, freq: 3000, to: 300, type: 'lowpass' });
  }
  sell() { this.kaching(0.8); }

  // ---------------------------------------------------------------- gameplay
  coin(p = 0) {
    if (!this.gate('coin', 45)) return;
    const f = 1318.5 * (1 + p * 0.08 + (Math.random() - 0.5) * 0.06);
    const pan = (Math.random() - 0.5) * 0.7;
    this.tone(f, 0.09, { type: 'square', vol: 0.045, pan, rev: 0.05 });
    this.tone(f * 1.335, 0.34, { type: 'triangle', vol: 0.1, at: 0.06, pan, echo: 0.12 });
    this.tone(f * 2.67, 0.22, { type: 'sine', vol: 0.04, at: 0.06, pan });
    this.noise(0.02, { vol: 0.04, freq: 8000, type: 'highpass', at: 0.06, pan });
  }
  thud() {
    if (!this.gate('thud', 140)) return;
    this.tone(150, 0.12, { type: 'triangle', vol: 0.1, to: 70 });
    this.noise(0.08, { vol: 0.06, freq: 500, type: 'lowpass' });
  }
  alarm() {
    [0, 0.16, 0.32].forEach((at, i) => {
      this.tone(i === 1 ? 660 : 880, 0.12, { type: 'square', vol: 0.08, at, lp: 3000 });
      this.tone(i === 1 ? 933 : 1245, 0.12, { type: 'sawtooth', vol: 0.03, at, lp: 2500 });
    });
    this.sub(70, 0.6, 0.2, 0, 50);
    this.noise(0.5, { vol: 0.05, freq: 600, to: 2400, q: 1.5, rev: 0.2 });
  }
  crash() {
    this.impact(0.9);
    this.noise(0.25, { vol: 0.2, freq: 7500, type: 'highpass', at: 0.02 });
    for (let i = 0; i < 6; i++) this.tone(1800 + Math.random() * 3200, 0.1, { type: 'triangle', vol: 0.05, at: 0.1 + Math.random() * 0.5, pan: (Math.random() - 0.5) * 1.2, echo: 0.15 });
    this.tone(55, 1.4, { type: 'sawtooth', vol: 0.12, at: 0.1, to: 25, lp: 400 });
  }
  reboot() {
    [60, 64, 67, 72].forEach((m, i) => {
      this.tone(midi(m + 12), 0.2, { type: 'triangle', vol: 0.12, at: i * 0.07, echo: 0.15 });
      this.tone(midi(m + 24), 0.14, { type: 'sine', vol: 0.05, at: i * 0.07 });
    });
    this.noise(0.3, { vol: 0.07, freq: 500, to: 5000, q: 0.8, rev: 0.2 });
    this.bell(midi(84), 0.7, 0.1, 0.3);
    this.sub(80, 0.3, 0.18, 0.28, 120);
  }
  milestone() {
    this.riser(0.28, 0.07);
    this.chord([72, 76, 79, 84].map(midi), 0.7, { type: 'triangle', vol: 0.16, at: 0.28, voices: 2, stagger: 0.05, echo: 0.2 });
    [72, 76, 79, 84, 88].forEach((m, i) => this.bell(midi(m + 12), 0.6, 0.1, 0.3 + i * 0.07));
    this.noise(0.35, { vol: 0.1, freq: 3500, q: 1.5, at: 0.28, rev: 0.3 });
    this.sub(65, 0.5, 0.3, 0.28, 40);
  }
  kaching(power = 1) {
    this.noise(0.04, { vol: 0.12 * power, freq: 6000, type: 'highpass' });
    this.tone(1568, 0.1, { type: 'square', vol: 0.06 * power });
    this.bell(2093, 0.8, 0.2 * power, 0.07);
    this.bell(2637, 1.0, 0.14 * power, 0.14);
    this.bell(3136, 1.1, 0.08 * power, 0.2);
    this.sub(100, 0.25, 0.25 * power, 0, 50);
    for (let i = 0; i < 5; i++) this.noise(0.03, { vol: 0.06 * power, freq: 5500 + Math.random() * 3000, type: 'highpass', at: 0.2 + i * 0.045, pan: (Math.random() - 0.5) });
  }

  // ---------------------------------------------------------------- new mechanics
  /** One tiny rising tick per success: you can hear the combo climbing. */
  comboTick(combo: number) {
    if (!this.gate('ctick', 70)) return;
    const f = midi(72 + [0, 2, 4, 7, 9, 12][combo % 6] + Math.min(12, Math.floor(combo / 6)));
    this.tone(f, 0.12, { type: 'triangle', vol: 0.05, pan: (Math.random() - 0.5) * 0.4, echo: 0.1 });
  }
  /** Delayed gratification: the tier-up charges up first, then pays off. */
  comboTier(tier: number) {
    const base = 60 + tier * 2;
    this.riser(0.45, 0.12);
    this.tone(midi(base + 12), 0.45, { type: 'sine', vol: 0.12, to: midi(base + 24), attack: 0.4, echo: 0.2 });
    const t = 0.46;
    this.sub(62, 0.7, 0.4, t, 34);
    this.chord([base, base + 4, base + 7, base + 12].map(midi), 0.9, { type: 'sawtooth', vol: 0.15, at: t, lp: 2800, voices: 3, attack: 0.01 });
    this.chord([base + 12, base + 16, base + 19, base + 24].map(midi), 1.1, { type: 'triangle', vol: 0.14, at: t, voices: 2, echo: 0.25 });
    for (let i = 0; i < 4 + tier; i++) this.bell(midi(base + 24 + [0, 4, 7, 12, 16, 19][i % 6]), 0.7, 0.09, t + 0.05 + i * 0.06);
    this.noise(0.6, { vol: 0.14, freq: 6000, type: 'highpass', at: t, rev: 0.4 });
    this.noise(0.3, { vol: 0.2, freq: 3000, to: 300, type: 'lowpass', at: t });
  }
  comboBreak(combo = 10) {
    const big = Math.min(1, combo / 60);
    this.tone(900, 0.5, { type: 'sawtooth', vol: 0.1, to: 90, lp: 2400 });
    this.tone(1350, 0.5, { type: 'triangle', vol: 0.08, to: 130 });
    this.noise(0.5, { vol: 0.14 + big * 0.1, freq: 6000, to: 200, type: 'lowpass', rev: 0.3 });
    this.sub(90, 0.5, 0.3, 0.05, 36);
    for (let i = 0; i < 5; i++) this.tone(2400 + Math.random() * 3000, 0.08, { type: 'triangle', vol: 0.04, at: 0.04 + i * 0.05, pan: (Math.random() - 0.5), rev: 0.2 });
  }
  vip() {
    [79, 83, 86, 91, 95].forEach((m, i) => this.bell(midi(m), 0.8, 0.1, i * 0.055, 0.3));
    this.chord([72, 76, 79].map(midi), 0.6, { type: 'triangle', vol: 0.12, voices: 2, echo: 0.2 });
    this.noise(0.4, { vol: 0.09, freq: 7000, type: 'highpass', rev: 0.4 });
    this.sub(110, 0.2, 0.18, 0, 70);
    for (let i = 0; i < 4; i++) this.coin(i);
  }
  block() {
    if (!this.gate('block', 70)) return;
    this.bell(midi(76), 0.35, 0.09, 0, 0.1);
    this.tone(180, 0.1, { type: 'triangle', vol: 0.12, to: 100 });
    this.noise(0.05, { vol: 0.09, freq: 3000, q: 4 });
  }
  leak() {
    if (!this.gate('leak', 120)) return;
    this.tone(110, 0.22, { type: 'sawtooth', vol: 0.1, to: 70, lp: 700 });
    this.tone(330, 0.12, { type: 'square', vol: 0.04, to: 200, lp: 900 });
    this.noise(0.08, { vol: 0.06, freq: 900, q: 2 });
  }
  overheat() {
    this.noise(0.8, { vol: 0.12, freq: 6000, to: 2000, type: 'highpass', rev: 0.2 });
    this.tone(500, 0.7, { type: 'sine', vol: 0.09, to: 1500, attack: 0.5 });
    this.tone(1000, 0.6, { type: 'square', vol: 0.04, to: 3000, attack: 0.5, lp: 3500 });
    this.tone(760, 0.1, { type: 'square', vol: 0.07, at: 0.6 });
    this.tone(760, 0.1, { type: 'square', vol: 0.07, at: 0.75 });
  }
  cooled() {
    [88, 91, 95].forEach((m, i) => this.bell(midi(m), 0.5, 0.07, i * 0.06, 0.3));
    this.noise(0.4, { vol: 0.08, freq: 8000, to: 2000, type: 'highpass', rev: 0.3 });
  }
  /** Mashing a crashed/hot box: pitch climbs as it comes back. */
  poke(progress = 0, kind: 'reboot' | 'cool' = 'reboot') {
    const f = midi(60 + Math.round(progress * 14));
    this.tone(f, 0.1, { type: kind === 'cool' ? 'sine' : 'square', vol: 0.09, lp: 3000, pan: (Math.random() - 0.5) * 0.4 });
    this.tone(f * 2, 0.14, { type: 'triangle', vol: 0.06, at: 0.02, echo: 0.12 });
    this.noise(0.04, { vol: 0.07, freq: kind === 'cool' ? 7000 : 1800, type: kind === 'cool' ? 'highpass' : 'bandpass', q: 2 });
    this.sub(100, 0.1, 0.12, 0, 70);
  }
  upgrade(lvl = 2) {
    const r = 60 + lvl * 3;
    this.riser(0.3, 0.09);
    [0, 4, 7, 12, 16].forEach((o, i) => this.tone(midi(r + o + 12), 0.2, { type: 'square', vol: 0.06, at: 0.08 + i * 0.055, lp: 3500, echo: 0.2 }));
    this.chord([r, r + 7, r + 12].map(midi), 0.7, { type: 'sawtooth', vol: 0.12, at: 0.35, lp: 2200, voices: 3 });
    this.bell(midi(r + 31), 0.9, 0.12, 0.38);
    this.sub(70, 0.5, 0.35, 0.34, 38);
    this.noise(0.4, { vol: 0.1, freq: 6000, type: 'highpass', at: 0.34, rev: 0.3 });
  }
  ddos() {
    for (let i = 0; i < 3; i++) {
      this.tone(500, 0.55, { type: 'sawtooth', vol: 0.07, at: i * 0.6, to: 1100, lp: 2800, attack: 0.25 });
      this.tone(1100, 0.55, { type: 'sawtooth', vol: 0.06, at: i * 0.6 + 0.3, to: 480, lp: 2800, attack: 0.05 });
    }
    this.sub(50, 1.8, 0.3, 0, 30);
    this.noise(1.8, { vol: 0.1, freq: 200, to: 3000, q: 1, rev: 0.3 });
    this.impact(0.5, 0.05);
  }

  // ---------------------------------------------------------------- celebration
  tick(i = 0) {
    this.tone(700 + i * 45, 0.05, { type: 'square', vol: 0.05, rev: 0.05 });
    this.tone(1400 + i * 90, 0.07, { type: 'sine', vol: 0.025, at: 0.01 });
  }
  step(i = 0) {
    this.tone(440 * Math.pow(1.122, i * 2), 0.1, { type: 'triangle', vol: 0.16 });
    this.noise(0.04, { vol: 0.05, freq: 3000 });
    this.sub(90 + i * 8, 0.14, 0.14, 0, 60);
  }
  stepDone(i = 0) {
    const f = 880 * Math.pow(1.122, i * 2);
    this.bell(f, 0.4, 0.14);
    this.bell(f * 1.5, 0.4, 0.07, 0.05);
    this.sub(110, 0.15, 0.12, 0, 70);
  }
  /** The long inhale before the reveal. */
  suspense(seconds = 1.2) {
    const s = seconds;
    this.tone(98, s, { type: 'sawtooth', vol: 0.06, to: 392, attack: s * 0.8, lp: 1800 });
    this.tone(147, s, { type: 'sawtooth', vol: 0.045, to: 588, attack: s * 0.85, lp: 2200, detune: 12 });
    this.tone(49, s, { type: 'sine', vol: 0.18, to: 98, attack: s * 0.7, rev: 0 });
    this.noise(s, { vol: 0.08, freq: 400, to: 6000, q: 0.8, attack: s * 0.9, rev: 0.2 });
  }
  /** Public riser: used to build anticipation before a payoff. */
  charge(seconds = 0.5, power = 1) { this.riser(seconds, 0.1 * power); }
  heartbeat(power = 1) {
    this.sub(70, 0.22, 0.4 * power, 0, 38);
    this.sub(62, 0.26, 0.3 * power, 0.17, 34);
  }
  drumroll(seconds = 1.2, power = 1) {
    if (!this.ok) return;
    const n = Math.floor(seconds * 22);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const at = seconds * (1 - Math.pow(1 - k, 1.6));
      this.noise(0.07, { vol: (0.04 + k * 0.1) * power, freq: 260 + k * 320, q: 1.6, at, pan: i % 2 ? 0.25 : -0.25 });
      if (i % 4 === 0) this.tone(90 + k * 25, 0.12, { type: 'sine', vol: (0.08 + k * 0.1) * power, at, to: 60, rev: 0 });
    }
    this.noise(seconds, { vol: 0.07 * power, freq: 2000, to: 9000, type: 'highpass', attack: seconds * 0.95, rev: 0.2 });
  }
  boom() {
    this.impact(1.15);
    this.noise(0.4, { vol: 0.3, freq: 1200, to: 100, type: 'lowpass', at: 0.01 });
    this.tone(48, 1.8, { type: 'sine', vol: 0.3, to: 26, at: 0.02, rev: 0 });
  }
  pop() {
    this.noise(0.1, { vol: 0.2, freq: 1800, q: 3, rev: 0.15 });
    this.tone(500, 0.09, { type: 'sine', vol: 0.12, to: 180 });
    this.tone(1800, 0.05, { type: 'triangle', vol: 0.06, to: 900, pan: (Math.random() - 0.5) });
    this.noise(0.04, { vol: 0.1, freq: 6000, type: 'highpass' });
  }
  swirl() {
    if (!this.ok) return;
    this.tone(280, 1.5, { type: 'sine', vol: 0.12, to: 2600, attack: 0.3, echo: 0.2 });
    this.tone(420, 1.5, { type: 'triangle', vol: 0.07, to: 3900, attack: 0.3, pan: -0.4 });
    this.tone(560, 1.5, { type: 'triangle', vol: 0.05, to: 5200, attack: 0.3, pan: 0.4 });
    this.noise(1.5, { vol: 0.08, freq: 600, to: 9000, q: 1.3, attack: 0.6, rev: 0.3 });
    for (let i = 0; i < 9; i++) this.tone(1400 + Math.random() * 3200, 0.32, { type: 'triangle', vol: 0.045, at: 0.1 + i * 0.15 + Math.random() * 0.05, pan: (Math.random() - 0.5) * 1.4, echo: 0.2 });
  }
  fanfare() {
    // brass-ish saw stacks over timpani, then a big held chord with a cymbal wash
    const seq = [72, 76, 79, 84, 79, 84, 88];
    seq.forEach((m, i) => {
      const at = i * 0.11;
      this.unison(midi(m), 0.3, { type: 'sawtooth', vol: 0.13, at, lp: 3200, voices: 3, spread: 9, attack: 0.012 });
      this.tone(midi(m - 12), 0.3, { type: 'triangle', vol: 0.13, at });
      this.tone(midi(m + 12), 0.22, { type: 'square', vol: 0.03, at, lp: 4000 });
      if (i % 2 === 0) this.sub(95, 0.2, 0.25, at, 55);
    });
    const t = 0.8;
    [72, 76, 79, 84].forEach((m) => {
      this.unison(midi(m), 1.8, { type: 'sawtooth', vol: 0.1, at: t, lp: 2600, voices: 3, spread: 12, attack: 0.02 });
      this.tone(midi(m + 12), 1.5, { type: 'triangle', vol: 0.07, at: t, echo: 0.25 });
      this.tone(midi(m + 24), 1.2, { type: 'sine', vol: 0.03, at: t });
    });
    this.sub(60, 1.2, 0.4, t, 36);
    this.noise(1.6, { vol: 0.09, freq: 6500, type: 'highpass', at: t, rev: 0.5 });
    this.noise(0.2, { vol: 0.2, freq: 4000, type: 'highpass', at: t });
    [96, 100, 103, 108].forEach((m, i) => this.bell(midi(m), 1.2, 0.05, t + 0.15 + i * 0.12, 0.35));
  }
  star(i: number) {
    const base = [76, 79, 84][i] ?? 84;
    this.bell(midi(base + 12), 1.1, 0.24);
    this.bell(midi(base + 19), 1.1, 0.12, 0.05);
    this.bell(midi(base + 24), 1.2, 0.07, 0.1, 0.35);
    this.chord([base, base + 4, base + 7].map(midi), 1.1, { type: 'triangle', vol: 0.15, voices: 2, echo: 0.2, attack: 0.01 });
    this.sub(90, 0.5, 0.45, 0, 42);
    this.impact(0.25 + i * 0.12);
    this.noise(0.6, { vol: 0.1, freq: 5000, type: 'highpass', rev: 0.4 });
    for (let k = 0; k < 6 + i * 3; k++) this.tone(midi(base + 24 + [0, 4, 7, 12][k % 4]), 0.3, { type: 'sine', vol: 0.045, at: 0.1 + k * 0.05, pan: (Math.random() - 0.5) * 1.5, echo: 0.3 });
  }
  starEmpty() {
    this.tone(180, 0.28, { type: 'triangle', vol: 0.14, to: 110 });
    this.tone(270, 0.25, { type: 'sine', vol: 0.06, to: 150 });
    this.sub(80, 0.3, 0.2, 0, 45);
    this.noise(0.15, { vol: 0.05, freq: 500, type: 'lowpass' });
  }
  coinShower(seconds = 2.5, density = 14) {
    if (!this.ok) return;
    const n = Math.min(26, Math.round(seconds * density * 0.6));
    for (let i = 0; i < n; i++) {
      const at = ((i + Math.random()) / n) * seconds;
      const pan = (Math.random() - 0.5) * 1.4;
      const f = 1250 + Math.random() * 1300;
      this.tone(f, 0.22, { type: 'triangle', vol: 0.06, at, pan, echo: 0.1 });
      if (i % 3 === 0) this.tone(f * 1.5, 0.16, { type: 'sine', vol: 0.03, at: at + 0.03, pan });
      if (i % 4 === 0) this.noise(0.03, { vol: 0.04, freq: 8000, type: 'highpass', at, pan });
    }
  }
  lose() {
    this.noise(0.6, { vol: 0.25, freq: 3000, to: 120, type: 'lowpass', rev: 0.3 });
    [392, 370, 349, 330].forEach((f, i) => {
      this.unison(f, 0.45, { type: 'sawtooth', vol: 0.11, at: 0.15 + i * 0.3, to: f * 0.92, lp: 1500, voices: 2, spread: 22 });
      this.tone(f / 2, 0.45, { type: 'triangle', vol: 0.08, at: 0.15 + i * 0.3, to: f * 0.46 });
    });
    this.sub(98, 1.6, 0.4, 0.2, 38);
    this.tone(55, 1.8, { type: 'sine', vol: 0.18, at: 0.3, to: 28, rev: 0 });
  }
  glitch() {
    for (let i = 0; i < 8; i++) this.noise(0.04, { vol: 0.12, freq: 800 + Math.random() * 4000, at: i * 0.05 + Math.random() * 0.02, q: 5, pan: (Math.random() - 0.5) });
    this.tone(1200, 0.3, { type: 'square', vol: 0.04, to: 90, lp: 2500 });
  }

  // ---------------------------------------------------------------- adaptive music bed
  /** Tell the music how hot the game is. Safe to call every frame. */
  setMood(m: Mood) { this.mood = m; }

  musicStart() {
    if (!this.ctx || !this.musicBus) return;
    this.musicBus.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.4);
    if (this.mTimer) return;
    this.mNext = this.ctx.currentTime + 0.08;
    this.mStep = 0;
    this.mTimer = window.setInterval(() => this.musicTick(), 80);
  }
  musicStop() {
    if (this.mTimer) { clearInterval(this.mTimer); this.mTimer = undefined; }
    if (this.ctx && this.musicBus) this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
  }

  private musicTick() {
    const c = this.ctx;
    if (!c || !this.ok) { if (c) this.mNext = Math.max(this.mNext, c.currentTime); return; }
    const spb = 60 / (112 + Math.min(18, this.mood.tier * 4 + (this.mood.hype ? 6 : 0))) / 4;
    if (this.mNext < c.currentTime - 0.2) this.mNext = c.currentTime + 0.05; // tab was asleep
    while (this.mNext < c.currentTime + 0.3) {
      this.musicStep(this.mStep++, this.mNext - c.currentTime, spb);
      this.mNext += spb;
    }
  }

  private musicStep(step: number, at: number, spb: number) {
    const { tier, danger, hype } = this.mood;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    // A minor, F, C, G: the "epic but friendly" loop
    const roots = [45, 41, 48, 43];
    const minor = (bar % 4) === 0;
    const root = roots[bar % 4];
    const third = minor ? 3 : 4;
    const tones = [0, third, 7, 12, 12 + third, 19];
    const M = { music: true as const, at };

    // pad (always): a slow, wide chord, plus an octave shimmer once the combo is up
    if (s === 0) {
      [0, third, 7].forEach((o) => this.unison(midi(root + 12 + o), spb * 16.5, { ...M, type: 'triangle', vol: 0.05, voices: 3, spread: 16, attack: spb * 5, lp: 1800 }));
      if (tier >= 2) this.unison(midi(root + 24 + 7), spb * 16, { ...M, type: 'sine', vol: 0.035, voices: 2, attack: spb * 6 });
    }
    // sub bass (always), syncopated
    if (s === 0 || s === 6 || s === 10 || (tier >= 3 && s === 14)) {
      this.tone(midi(root - 12), spb * 3.2, { ...M, type: 'sine', vol: 0.12, rev: 0 });
      this.tone(midi(root), spb * 2, { ...M, type: 'triangle', vol: 0.04, lp: 700, rev: 0 });
    }
    // hats
    const hatEvery = tier >= 3 ? 1 : tier >= 1 ? 2 : 4;
    if (s % hatEvery === 0) this.noise(0.035, { ...M, vol: s % 4 === 2 ? 0.05 : 0.028, freq: 8500, type: 'highpass', pan: s % 2 ? 0.3 : -0.3 });
    // kick
    if (tier >= 1 && s % 4 === 0) { this.tone(130, 0.16, { ...M, vol: 0.2, to: 42, rev: 0 }); this.noise(0.02, { ...M, vol: 0.05, freq: 3000 }); }
    // clap on 2 and 4
    if (tier >= 2 && (s === 4 || s === 12)) { this.noise(0.12, { ...M, vol: 0.09, freq: 1700, q: 0.8, rev: 0.2 }); this.noise(0.03, { ...M, vol: 0.05, freq: 5000, type: 'highpass' }); }
    // arpeggio
    const arpEvery = tier >= 3 ? 1 : 2;
    if (tier >= 1 && s % arpEvery === 0) {
      const idx = (s / arpEvery + bar) % tones.length;
      const oct = tier >= 2 ? 24 : 12;
      this.tone(midi(root + oct + tones[idx | 0]), spb * 1.7, { ...M, type: 'square', vol: 0.016 + tier * 0.004, lp: 2400 + tier * 500, rev: 0.12, echo: 0.1, pan: ((s % 4) - 1.5) * 0.25 });
    }
    // lead bells when you are on fire
    if (tier >= 4 && [0, 3, 6, 8, 11, 14].includes(s)) {
      const mel = [12, 7, 10, 12, 15, 19];
      const k = [0, 3, 6, 8, 11, 14].indexOf(s);
      this.bell(midi(root + 24 + mel[(k + bar) % mel.length]), spb * 4, 0.045, at, 0.25);
    }
    // danger: dissonant drone and a nervous tick
    if (danger > 0.5) {
      if (s === 0) this.tone(midi(root - 12) * 1.0595, spb * 16, { ...M, type: 'sawtooth', vol: 0.05, lp: 420, rev: 0 });
      if (s % 4 === 0) this.tone(1200, 0.04, { ...M, type: 'square', vol: 0.03 + danger * 0.02, rev: 0 });
    }
    // hype (traffic spike): a riser into every second bar
    if (hype && s === 0 && bar % 2 === 1) this.noise(spb * 16, { ...M, vol: 0.05, freq: 500, to: 8000, attack: spb * 15, rev: 0.2 });
    if (hype && s === 0) this.noise(0.5, { ...M, vol: 0.05, freq: 6500, type: 'highpass', rev: 0.4 });
  }
}

export const sfx = new Sfx();
