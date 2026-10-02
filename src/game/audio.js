// src/game/audio.js — synthesized blips. No audio files, no network, no licensing.
//
// A dropped packet is a thud, a completed request is a tick, a fleet scaling out is a rising pair.
// The AudioContext is created lazily on the first gesture so autoplay policies stay happy.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = new Map();
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.16;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** kind: 'place' | 'wire' | 'drop' | 'win' | 'lose' | 'alarm' | 'scale' | 'click' */
  play(kind) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    // rate-limit repetitive sounds so a bad minute does not become a migraine
    const min = kind === 'drop' ? 0.09 : 0.02;
    const last = this.last.get(kind) || 0;
    if (now - last < min) return;
    this.last.set(kind, now);

    const blip = (freq, dur, type = 'square', gain = 0.5, slide = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, now);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + dur);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g); g.connect(this.master);
      o.start(now); o.stop(now + dur + 0.02);
    };

    switch (kind) {
      case 'place': blip(520, 0.05, 'square', 0.35); break;
      case 'wire': blip(320, 0.07, 'triangle', 0.4, 220); break;
      case 'click': blip(660, 0.03, 'square', 0.25); break;
      case 'scale': blip(440, 0.06, 'triangle', 0.3); blip(660, 0.08, 'triangle', 0.25); break;
      case 'drop': blip(150, 0.11, 'sawtooth', 0.24, -70); break;
      case 'alarm': blip(880, 0.12, 'square', 0.22, -300); blip(420, 0.18, 'square', 0.2, -120); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => { if (!this.muted) blip(f, 0.16, 'triangle', 0.3); }, i * 110)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => setTimeout(() => { if (!this.muted) blip(f, 0.22, 'sawtooth', 0.22); }, i * 150)); break;
    }
  }
}
