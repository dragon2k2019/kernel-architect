// Canvas particle engine for rewards: confetti cannons, coin fountains, cash rain, magic swirls, sparks.
// All coordinates are screen pixels (CSS px). The loop only runs while there is something to draw.

type PKind = 'confetti' | 'coin' | 'bill' | 'spark' | 'comet' | 'ring' | 'fly' | 'ember';

interface P {
  k: PKind;
  x: number; y: number; vx: number; vy: number;
  g: number; drag: number;
  age: number; life: number;
  size: number; rot: number; vr: number; spin: number; vs: number;
  color: string;
  bounces: number;
  // comet (polar motion)
  cx?: number; cy?: number; ang?: number; r?: number; vrad?: number; w?: number; px?: number; py?: number;
  // fly
  sx?: number; sy?: number; tx?: number; ty?: number; cb?: () => void; curve?: number;
}

interface Emitter {
  kind: 'coin' | 'bill' | 'confetti';
  x: number; y: number; angle: number; spread: number; until: number; rate: number; acc: number; power: number;
}

const PALETTE = ['#ff6b8b', '#ffd34d', '#7ee787', '#5ee0ff', '#b794ff', '#ff9e64', '#ffffff', '#ff7ad9'];
const MAGIC = ['#ffd34d', '#ff7ad9', '#5ee0ff', '#b794ff', '#ffffff', '#7ee787'];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const MAX = 1800;

class FxEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private ps: P[] = [];
  private em: Emitter[] = [];
  private raf = 0;
  private last = 0;
  private clock = 0;
  w = 0; h = 0;
  /** Called for each coin that lands in the wallet (HUD pulses + sound). */
  onCoinArrive: (() => void) | null = null;

  attach(c: HTMLCanvasElement | null) {
    this.canvas = c;
    this.ctx = c ? c.getContext('2d') : null;
    if (c) this.resize();
    else cancelAnimationFrame(this.raf);
  }

  resize() {
    const c = this.canvas;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth; this.h = window.innerHeight;
    c.width = Math.round(this.w * dpr); c.height = Math.round(this.h * dpr);
    c.style.width = `${this.w}px`; c.style.height = `${this.h}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() { this.ps = []; this.em = []; this.ctx?.clearRect(0, 0, this.w, this.h); }

  private base(k: PKind, x: number, y: number, o: Partial<P> = {}): P {
    return {
      k, x, y, vx: 0, vy: 0, g: 0, drag: 1, age: 0, life: 2, size: 6,
      rot: 0, vr: 0, spin: 0, vs: 0, color: '#fff', bounces: 0, ...o,
    };
  }
  private add(p: P) { if (this.ps.length < MAX) this.ps.push(p); this.kick(); }

  private kick() {
    if (this.raf || !this.ctx) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- spawners ----------
  /** A confetti cannon: a fan of paper rectangles. angle in degrees (0 = right, -90 = up). */
  confetti(x: number, y: number, angle: number, count = 90, power = 1, spread = 38) {
    const sp = Math.max(this.w, 600) * power;
    for (let i = 0; i < count; i++) {
      const a = ((angle + rnd(-spread, spread)) * Math.PI) / 180;
      const v = rnd(0.45, 1.25) * sp;
      this.add(this.base('confetti', x, y, {
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 820, drag: 0.972,
        life: rnd(2.6, 4.2), size: rnd(7, 13), rot: rnd(0, 6.28), vr: rnd(-9, 9),
        spin: rnd(0, 6.28), vs: rnd(5, 12), color: pick(PALETTE),
      }));
    }
  }

  /** Streamers falling from the top of the screen. */
  confettiRain(seconds = 3, rate = 60) {
    this.em.push({ kind: 'confetti', x: 0, y: -20, angle: 90, spread: 0, until: this.clock + seconds, rate, acc: 0, power: 0 });
    this.kick();
  }

  /** Coins spraying up from the bottom of the screen, then raining back down. */
  coinFountain(x: number, seconds = 3, rate = 55, angle = -90, spread = 16) {
    this.em.push({ kind: 'coin', x, y: this.h + 12, angle, spread, until: this.clock + seconds, rate, acc: 0, power: 1 });
    this.kick();
  }

  cashFountain(x: number, seconds = 3, rate = 16) {
    this.em.push({ kind: 'bill', x, y: this.h + 12, angle: -90, spread: 24, until: this.clock + seconds, rate, acc: 0, power: 1 });
    this.kick();
  }

  /** Banknotes drifting down like rain. */
  cashRain(seconds = 3, rate = 14) {
    this.em.push({ kind: 'bill', x: 0, y: -30, angle: 90, spread: 0, until: this.clock + seconds, rate, acc: 0, power: 0 });
    this.kick();
  }

  /** Glowing comets spiralling out of a point: a magic swirl. */
  swirl(cx: number, cy: number, count = 220, arms = 5) {
    const maxR = Math.hypot(this.w, this.h) * 0.6;
    for (let i = 0; i < count; i++) {
      const arm = i % arms;
      const color = MAGIC[(arm + Math.floor(i / arms)) % MAGIC.length];
      this.add(this.base('comet', cx, cy, {
        cx, cy, ang: (arm / arms) * Math.PI * 2 + rnd(-0.12, 0.12), r: rnd(0, 18),
        vrad: rnd(0.35, 1) * maxR * 0.55, w: rnd(5.5, 8.5), px: cx, py: cy,
        age: -rnd(0, 0.45), life: rnd(1.5, 2.4), size: rnd(2, 4.5), color,
      }));
    }
    this.ring(cx, cy, '#ffd34d', 520, 0.9);
    this.ring(cx, cy, '#ff7ad9', 360, 0.7);
    this.ring(cx, cy, '#5ee0ff', 220, 0.55);
  }

  ring(x: number, y: number, color = '#ffd34d', radius = 260, life = 0.8) {
    this.add(this.base('ring', x, y, { color, size: radius, life }));
  }

  sparks(x: number, y: number, color = '#ffd34d', count = 18, speed = 260, g = 300) {
    for (let i = 0; i < count; i++) {
      const a = rnd(0, Math.PI * 2);
      const v = rnd(0.3, 1) * speed;
      this.add(this.base('spark', x, y, {
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.2, g, drag: 0.93,
        life: rnd(0.5, 1.1), size: rnd(3, 7), rot: rnd(0, 6.28), vr: rnd(-4, 4),
        color: Math.random() < 0.3 ? '#ffffff' : color,
      }));
    }
  }

  /** Embers and debris for crashes. */
  embers(x: number, y: number, count = 22) {
    for (let i = 0; i < count; i++) {
      const a = rnd(-Math.PI, 0);
      const v = rnd(80, 360);
      this.add(this.base('ember', x, y, {
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 520, drag: 0.97,
        life: rnd(0.7, 1.4), size: rnd(2, 5), color: pick(['#ff6b6b', '#ff9e64', '#ffd34d', '#8d93b0']),
      }));
    }
  }

  /** Coins that arc across the screen into the wallet. */
  coinFly(x: number, y: number, tx: number, ty: number, n = 1, delay = 0) {
    for (let i = 0; i < n; i++) {
      this.add(this.base('fly', x + rnd(-8, 8), y + rnd(-8, 8), {
        sx: x, sy: y, tx, ty, size: rnd(7, 9), life: rnd(0.55, 0.85), age: -delay - i * 0.06,
        spin: rnd(0, 6), vs: rnd(10, 16), curve: rnd(-160, 160),
        cb: () => this.onCoinArrive?.(),
      }));
      const last = this.ps[this.ps.length - 1];
      if (last) { last.sx = last.x; last.sy = last.y; }
    }
  }

  // ---------- loop ----------
  private frame = (now: number) => {
    this.raf = 0;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    this.update(dt);
    this.draw();
    if (this.ps.length || this.em.length) this.raf = requestAnimationFrame(this.frame);
    else this.ctx?.clearRect(0, 0, this.w, this.h);
  };

  private emit(e: Emitter, dt: number) {
    e.acc += e.rate * dt;
    while (e.acc >= 1) {
      e.acc -= 1;
      if (e.kind === 'coin') {
        const a = ((e.angle + rnd(-e.spread, e.spread)) * Math.PI) / 180;
        // speed chosen so coins peak around 55-90% of the screen height
        const v = Math.sqrt(2 * 1500 * this.h * rnd(0.55, 0.92));
        this.add(this.base('coin', e.x + rnd(-24, 24), e.y, {
          vx: Math.cos(a) * v * 0.9, vy: Math.sin(a) * v, g: 1500, drag: 0.999,
          life: 5, size: rnd(9, 15), spin: rnd(0, 6.28), vs: rnd(6, 14), bounces: 0, color: '#ffd34d',
        }));
      } else if (e.kind === 'bill') {
        if (e.power === 0) {
          this.add(this.base('bill', rnd(0, this.w), e.y, {
            vx: rnd(-40, 40), vy: rnd(60, 160), g: 70, drag: 0.992, life: 7, size: rnd(20, 30),
            rot: rnd(0, 6.28), vr: rnd(-2.5, 2.5), spin: rnd(0, 6.28), vs: rnd(2.5, 5), color: '#6bd68a',
          }));
        } else {
          const a = ((e.angle + rnd(-e.spread, e.spread)) * Math.PI) / 180;
          const v = Math.sqrt(2 * 900 * this.h * rnd(0.5, 0.85));
          this.add(this.base('bill', e.x + rnd(-24, 24), e.y, {
            vx: Math.cos(a) * v * 0.9, vy: Math.sin(a) * v, g: 900, drag: 0.992, life: 6, size: rnd(22, 30),
            rot: rnd(0, 6.28), vr: rnd(-4, 4), spin: rnd(0, 6.28), vs: rnd(3, 6), color: '#6bd68a',
          }));
        }
      } else {
        this.add(this.base('confetti', rnd(0, this.w), e.y, {
          vx: rnd(-60, 60), vy: rnd(120, 260), g: 120, drag: 0.99, life: 5, size: rnd(7, 12),
          rot: rnd(0, 6.28), vr: rnd(-6, 6), spin: rnd(0, 6.28), vs: rnd(5, 10), color: pick(PALETTE),
        }));
      }
    }
  }

  private update(dt: number) {
    for (const e of this.em) this.emit(e, dt);
    this.em = this.em.filter((e) => e.until > this.clock);
    const floor = this.h + 30;
    const next: P[] = [];
    for (const p of this.ps) {
      p.age += dt;
      if (p.age < 0) { next.push(p); continue; }
      if (p.age >= p.life && p.k !== 'coin' && p.k !== 'bill') {
        if (p.k === 'fly') p.cb?.();
        continue;
      }
      const damp = Math.pow(p.drag, dt * 60);
      switch (p.k) {
        case 'comet': {
          p.px = p.x; p.py = p.y;
          p.r! += p.vrad! * dt;
          p.vrad! *= Math.pow(0.985, dt * 60);
          p.ang! += p.w! * dt;
          p.w! *= Math.pow(0.988, dt * 60);
          p.x = p.cx! + Math.cos(p.ang!) * p.r!;
          p.y = p.cy! + Math.sin(p.ang!) * p.r!;
          break;
        }
        case 'fly': {
          const t = Math.min(1, p.age / p.life);
          const e = t * t * (3 - 2 * t);
          const mx = (p.sx! + p.tx!) / 2 + p.curve!;
          const my = Math.min(p.sy!, p.ty!) - 80;
          const u = 1 - e;
          p.x = u * u * p.sx! + 2 * u * e * mx + e * e * p.tx!;
          p.y = u * u * p.sy! + 2 * u * e * my + e * e * p.ty!;
          p.spin += p.vs * dt;
          break;
        }
        case 'ring': break;
        default: {
          p.vx *= damp;
          p.vy = p.vy * damp + p.g * dt;
          if (p.k === 'confetti' || p.k === 'bill') {
            // paper flutters: cap the fall speed
            const cap = p.k === 'bill' ? 190 : 300;
            if (p.vy > cap) p.vy = cap;
            p.vx += Math.sin(p.spin * 1.3) * 26 * dt * 6;
          }
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.rot += p.vr * dt; p.spin += p.vs * dt;
          if (p.k === 'coin' && p.y > this.h - p.size && p.vy > 0 && p.age > 0.6) {
            if (p.bounces < 2) { p.y = this.h - p.size; p.vy *= -0.42; p.vx *= 0.7; p.bounces++; }
          }
        }
      }
      if (p.k === 'coin' && p.age > p.life) continue;
      if (p.k === 'bill' && (p.age > p.life || p.y > floor + 40)) continue;
      if (p.y > floor + 60 && (p.k === 'confetti' || p.k === 'coin')) continue;
      next.push(p);
    }
    this.ps = next;
  }

  private draw() {
    const c = this.ctx;
    if (!c) return;
    c.clearRect(0, 0, this.w, this.h);
    // normal-blend pass first, additive pass second
    for (const p of this.ps) {
      if (p.age < 0) continue;
      switch (p.k) {
        case 'confetti': this.drawConfetti(c, p); break;
        case 'coin': this.drawCoin(c, p, p.size, 1); break;
        case 'fly': this.drawCoin(c, p, p.size, 1); break;
        case 'bill': this.drawBill(c, p); break;
        default: break;
      }
    }
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const p of this.ps) {
      if (p.age < 0) continue;
      const t = Math.min(1, p.age / p.life);
      switch (p.k) {
        case 'comet': this.drawComet(c, p, t); break;
        case 'spark': this.drawStar(c, p.x, p.y, p.size * (1 - t * 0.6), p.rot, p.color, 1 - t * t); break;
        case 'ember': {
          c.globalAlpha = 1 - t;
          c.fillStyle = p.color;
          c.beginPath(); c.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, 6.283); c.fill();
          break;
        }
        case 'ring': {
          c.globalAlpha = (1 - t) * 0.8;
          c.strokeStyle = p.color; c.lineWidth = 6 * (1 - t) + 1;
          c.beginPath(); c.arc(p.x, p.y, p.size * (1 - Math.pow(1 - t, 3)), 0, 6.283); c.stroke();
          break;
        }
        default: break;
      }
    }
    c.restore();
  }

  private drawConfetti(c: CanvasRenderingContext2D, p: P) {
    const fade = p.age > p.life - 0.6 ? Math.max(0, (p.life - p.age) / 0.6) : 1;
    c.save();
    c.globalAlpha = fade;
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.scale(1, Math.cos(p.spin));
    c.fillStyle = p.color;
    c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    c.restore();
  }

  private drawCoin(c: CanvasRenderingContext2D, p: P, r: number, a: number) {
    const fade = p.k === 'coin' && p.age > p.life - 0.8 ? Math.max(0, (p.life - p.age) / 0.8) : 1;
    const sx = Math.cos(p.spin);
    c.save();
    c.globalAlpha = a * fade;
    c.translate(p.x, p.y);
    c.scale(Math.max(0.12, Math.abs(sx)), 1);
    c.shadowColor = 'rgba(255, 211, 77, 0.7)';
    c.shadowBlur = 8;
    c.fillStyle = sx > 0 ? '#ffd34d' : '#f0b429';
    c.beginPath(); c.arc(0, 0, r, 0, 6.283); c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = '#b7791f'; c.lineWidth = Math.max(1, r * 0.14);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = Math.max(1, r * 0.1);
    c.beginPath(); c.arc(0, 0, r * 0.68, 0.4, 2.2); c.stroke();
    if (Math.abs(sx) > 0.45 && r > 9) {
      c.fillStyle = '#b7791f';
      c.font = `800 ${Math.round(r * 1.15)}px ui-monospace, Menlo, monospace`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('$', 0, 1);
    }
    c.restore();
  }

  private drawBill(c: CanvasRenderingContext2D, p: P) {
    const fade = p.age > p.life - 0.8 ? Math.max(0, (p.life - p.age) / 0.8) : 1;
    const w = p.size * 2; const h = p.size;
    c.save();
    c.globalAlpha = fade;
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.scale(1, Math.max(0.15, Math.abs(Math.cos(p.spin))));
    c.fillStyle = '#6bd68a';
    c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 3); c.fill();
    c.strokeStyle = '#2f9e57'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
    c.beginPath(); c.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 2); c.stroke();
    c.fillStyle = '#2f9e57';
    c.beginPath(); c.arc(0, 0, h * 0.27, 0, 6.283); c.fill();
    c.fillStyle = '#d6ffe2';
    c.font = `800 ${Math.round(h * 0.38)}px ui-monospace, Menlo, monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('$', 0, 1);
    c.restore();
  }

  private drawComet(c: CanvasRenderingContext2D, p: P, t: number) {
    const a = Math.sin(Math.min(1, t) * Math.PI) ;
    c.globalAlpha = Math.min(1, a * 1.4);
    c.strokeStyle = p.color;
    c.lineCap = 'round';
    c.lineWidth = p.size * (1 - t * 0.5);
    c.shadowColor = p.color; c.shadowBlur = 12;
    c.beginPath(); c.moveTo(p.px ?? p.x, p.py ?? p.y); c.lineTo(p.x, p.y); c.stroke();
    c.shadowBlur = 0;
    this.drawStar(c, p.x, p.y, p.size * 1.8, p.age * 3, p.color, a);
  }

  private drawStar(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, color: string, alpha: number) {
    c.save();
    c.globalAlpha = Math.max(0, alpha);
    c.translate(x, y); c.rotate(rot);
    c.fillStyle = color;
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? s * 1.6 : s * 0.38;
      const a = (i * Math.PI) / 4;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath(); c.fill();
    c.restore();
  }
}

export const fx = new FxEngine();
