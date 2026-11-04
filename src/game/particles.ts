// Reward particle engine: confetti cannons, coin fountains, cash rain, magic swirls, sparks.
//
// Built to stay cheap even when a whole victory celebration fires at once:
//  * Object pool: one fixed Float32Array (struct-of-arrays style). Nothing is allocated per particle or per frame.
//  * Swap-remove: dead particles are replaced by the last live one, so update is O(live) with no array rebuilds.
//  * Sprite atlas: coins, bills, confetti, stars and glows are drawn ONCE into small offscreen canvases.
//    Per particle we only do setTransform + drawImage, which the browser runs on the GPU.
//    No shadowBlur, no fillText, no roundRect, no save/restore, no gradients in the hot loop.
//  * Dirty-rect clearing: only the area touched last frame is cleared, not the whole screen.
//  * Adaptive quality: a frame-time governor scales spawn counts (and canvas resolution) down when the
//    device struggles, and back up when it recovers. A slow phone gets fewer pieces, never a frozen tab.
//  * The loop sleeps (no rAF at all) when nothing is alive.
//
// All coordinates are screen pixels (CSS px).

const K_CONFETTI = 0, K_COIN = 1, K_BILL = 2, K_SPARK = 3, K_COMET = 4, K_RING = 5, K_FLY = 6, K_EMBER = 7;

// field offsets inside one particle slot
const X = 0, Y = 1, VX = 2, VY = 3, G = 4, DRAG = 5, AGE = 6, LIFE = 7, SIZE = 8, ROT = 9, VR = 10, SPIN = 11, VS = 12;
// extras: comet = cx, cy, ang, r, vrad, w, px, py. fly = sx, sy, tx, ty, curve.
const E0 = 13, E1 = 14, E2 = 15, E3 = 16, E4 = 17, E5 = 18, E6 = 19, E7 = 20;
const STRIDE = 21;

const POOL = 900;
const TAU = Math.PI * 2;

const PALETTE = ['#ff6b8b', '#ffd34d', '#7ee787', '#5ee0ff', '#b794ff', '#ff9e64', '#ffffff', '#ff7ad9'];
const MAGIC = ['#ffd34d', '#ff7ad9', '#5ee0ff', '#b794ff', '#ffffff', '#7ee787'];
const EMBER = ['#ff6b6b', '#ff9e64', '#ffd34d', '#8d93b0'];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: readonly T[]): T => a[(Math.random() * a.length) | 0];

// ---------- sprites ----------
function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

interface ColorSprites { confetti: HTMLCanvasElement; glow: HTMLCanvasElement; star: HTMLCanvasElement }

class Sprites {
  coinFront!: HTMLCanvasElement;
  coinBack!: HTMLCanvasElement;
  bill!: HTMLCanvasElement;
  private byColor = new Map<string, ColorSprites>();
  private ready = false;

  build() {
    if (this.ready) return;
    this.ready = true;
    this.coinFront = this.coin(true);
    this.coinBack = this.coin(false);
    this.bill = this.makeBill();
    [...PALETTE, ...MAGIC, ...EMBER].forEach((c) => this.of(c));
  }

  of(color: string): ColorSprites {
    let s = this.byColor.get(color);
    if (!s) {
      s = { confetti: this.makeConfetti(color), glow: this.makeGlow(color), star: this.makeStar(color) };
      this.byColor.set(color, s);
    }
    return s;
  }

  // coin: 64px canvas, 44px disc in the middle, soft golden halo baked in (this replaces shadowBlur)
  private coin(front: boolean) {
    const [c, g] = mk(64, 64);
    const halo = g.createRadialGradient(32, 32, 16, 32, 32, 31);
    halo.addColorStop(0, 'rgba(255,211,77,0.55)'); halo.addColorStop(1, 'rgba(255,211,77,0)');
    g.fillStyle = halo; g.fillRect(0, 0, 64, 64);
    g.beginPath(); g.arc(32, 32, 22, 0, TAU);
    g.fillStyle = front ? '#ffd34d' : '#f0b429'; g.fill();
    g.strokeStyle = '#b7791f'; g.lineWidth = 3.2; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2.4;
    g.beginPath(); g.arc(32, 32, 15, 0.4, 2.2); g.stroke();
    if (front) {
      g.fillStyle = '#b7791f';
      g.font = '800 26px ui-monospace, Menlo, monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('$', 32, 33);
    }
    return c;
  }

  private makeBill() {
    const [c, g] = mk(80, 40);
    g.fillStyle = '#6bd68a';
    g.beginPath(); g.roundRect(1, 1, 78, 38, 5); g.fill();
    g.strokeStyle = '#2f9e57'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(7, 7, 66, 26, 3); g.stroke();
    g.fillStyle = '#2f9e57';
    g.beginPath(); g.arc(40, 20, 11, 0, TAU); g.fill();
    g.fillStyle = '#d6ffe2';
    g.font = '800 15px ui-monospace, Menlo, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('$', 40, 21);
    return c;
  }

  private makeConfetti(color: string) {
    const [c, g] = mk(24, 12);
    g.fillStyle = color; g.fillRect(0, 0, 24, 12);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, 24, 4);
    return c;
  }

  // soft round glow with a hot core (used for embers and comet trails)
  private makeGlow(color: string) {
    const [c, g] = mk(64, 64);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.18, color); grd.addColorStop(0.5, color + '66'); grd.addColorStop(1, color + '00');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return c;
  }

  // 4-point sparkle with a glow baked in
  private makeStar(color: string) {
    const [c, g] = mk(64, 64);
    const halo = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    halo.addColorStop(0, color + 'aa'); halo.addColorStop(1, color + '00');
    g.fillStyle = halo; g.fillRect(0, 0, 64, 64);
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 26 : 6;
      const a = (i * Math.PI) / 4;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 4, 0, TAU); g.fill();
    return c;
  }
}

interface Emitter {
  kind: number; x: number; y: number; angle: number; spread: number; until: number; rate: number; acc: number; rain: boolean;
}

class FxEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private spr = new Sprites();

  // pool
  private d = new Float32Array(POOL * STRIDE);
  private kind = new Uint8Array(POOL);
  private col = new Uint8Array(POOL); // index into colorList
  private bounce = new Uint8Array(POOL);
  private n = 0;
  private colorList: string[] = [];
  private colorSpr: ColorSprites[] = []; // parallel to colorList: no string lookups in the hot loop
  private colorIdx = new Map<string, number>();

  private em: Emitter[] = [];
  private raf = 0;
  private last = 0;
  private clock = 0;
  private dpr = 1;
  private dirty: [number, number, number, number] | null = null; // last frame's drawn bounds (css px)

  // adaptive quality (1 = full show)
  quality = 1;
  private ema = 16.7;
  private goodFrames = 0;
  private readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  w = 0; h = 0;
  /** Called for each coin that lands in the wallet (HUD pulses + sound). */
  onCoinArrive: (() => void) | null = null;

  constructor() { if (this.reduced) this.quality = 0.35; }

  attach(c: HTMLCanvasElement | null) {
    this.canvas = c;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.ctx = c ? c.getContext('2d', { alpha: true, desynchronized: true }) : null;
    if (c) { this.spr.build(); this.resize(); }
  }

  resize() {
    const c = this.canvas;
    if (!c) return;
    // 1.5x is plenty for confetti; phones that struggle drop to 1x
    this.dpr = Math.min(this.quality < 0.5 ? 1 : 1.5, window.devicePixelRatio || 1);
    this.w = window.innerWidth; this.h = window.innerHeight;
    c.width = Math.round(this.w * this.dpr); c.height = Math.round(this.h * this.dpr);
    c.style.width = `${this.w}px`; c.style.height = `${this.h}px`;
    this.dirty = null;
    if (this.ctx) this.ctx.imageSmoothingQuality = 'low';
  }

  clear() {
    this.n = 0; this.em.length = 0; this.dirty = null;
    this.ctx?.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx?.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);
  }

  // ---------- pool ----------
  private ci(color: string): number {
    let i = this.colorIdx.get(color);
    if (i === undefined) { i = this.colorList.length; this.colorList.push(color); this.colorSpr.push(this.spr.of(color)); this.colorIdx.set(color, i); }
    return i;
  }

  /** How many particles to actually spawn for a requested count, given current quality. */
  private q(count: number) { return Math.max(1, Math.round(count * this.quality)); }

  private alloc(kind: number, color: string): number {
    if (this.n >= Math.floor(POOL * Math.max(0.4, this.quality))) return -1;
    const i = this.n++;
    this.d.fill(0, i * STRIDE, (i + 1) * STRIDE);
    this.kind[i] = kind; this.col[i] = this.ci(color); this.bounce[i] = 0;
    this.d[i * STRIDE + DRAG] = 1;
    return i;
  }

  private kick() {
    if (this.raf || !this.ctx) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- spawners ----------
  /** A confetti cannon: a fan of paper rectangles. angle in degrees (0 = right, -90 = up). */
  confetti(x: number, y: number, angle: number, count = 90, power = 1, spread = 38) {
    const sp = Math.max(this.w, 600) * power;
    const cnt = this.q(count);
    for (let k = 0; k < cnt; k++) {
      const i = this.alloc(K_CONFETTI, pick(PALETTE));
      if (i < 0) break;
      const o = i * STRIDE; const d = this.d;
      const a = ((angle + rnd(-spread, spread)) * Math.PI) / 180;
      const v = rnd(0.45, 1.25) * sp;
      d[o + X] = x; d[o + Y] = y; d[o + VX] = Math.cos(a) * v; d[o + VY] = Math.sin(a) * v;
      d[o + G] = 820; d[o + DRAG] = 0.972; d[o + LIFE] = rnd(2.4, 3.8); d[o + SIZE] = rnd(7, 13);
      d[o + ROT] = rnd(0, TAU); d[o + VR] = rnd(-9, 9); d[o + SPIN] = rnd(0, TAU); d[o + VS] = rnd(5, 12);
    }
    this.kick();
  }

  /** Streamers falling from the top of the screen. */
  confettiRain(seconds = 3, rate = 60) {
    this.em.push({ kind: K_CONFETTI, x: 0, y: -20, angle: 90, spread: 0, until: this.clock + seconds, rate, acc: 0, rain: true });
    this.kick();
  }

  /** Coins spraying up from the bottom of the screen, then raining back down. */
  coinFountain(x: number, seconds = 3, rate = 55, angle = -90, spread = 16) {
    this.em.push({ kind: K_COIN, x, y: this.h + 12, angle, spread, until: this.clock + seconds, rate, acc: 0, rain: false });
    this.kick();
  }

  cashFountain(x: number, seconds = 3, rate = 16) {
    this.em.push({ kind: K_BILL, x, y: this.h + 12, angle: -90, spread: 24, until: this.clock + seconds, rate, acc: 0, rain: false });
    this.kick();
  }

  /** Banknotes drifting down like rain. */
  cashRain(seconds = 3, rate = 14) {
    this.em.push({ kind: K_BILL, x: 0, y: -30, angle: 90, spread: 0, until: this.clock + seconds, rate, acc: 0, rain: true });
    this.kick();
  }

  /** Glowing comets spiralling out of a point: a magic swirl. */
  swirl(cx: number, cy: number, count = 220, arms = 5) {
    const maxR = Math.hypot(this.w, this.h) * 0.6;
    const cnt = this.q(Math.min(count, 150)); // sprites are cheap, but 150 spiral heads read as "full" already
    for (let k = 0; k < cnt; k++) {
      const arm = k % arms;
      const i = this.alloc(K_COMET, MAGIC[(arm + Math.floor(k / arms)) % MAGIC.length]);
      if (i < 0) break;
      const o = i * STRIDE; const d = this.d;
      d[o + X] = cx; d[o + Y] = cy;
      d[o + E0] = cx; d[o + E1] = cy; d[o + E2] = (arm / arms) * TAU + rnd(-0.12, 0.12); d[o + E3] = rnd(0, 18);
      d[o + E4] = rnd(0.35, 1) * maxR * 0.55; d[o + E5] = rnd(5.5, 8.5); d[o + E6] = cx; d[o + E7] = cy;
      d[o + AGE] = -rnd(0, 0.45); d[o + LIFE] = rnd(1.5, 2.4); d[o + SIZE] = rnd(2, 4.5);
    }
    this.ring(cx, cy, '#ffd34d', 520, 0.9);
    this.ring(cx, cy, '#ff7ad9', 360, 0.7);
    this.ring(cx, cy, '#5ee0ff', 220, 0.55);
    this.kick();
  }

  ring(x: number, y: number, color = '#ffd34d', radius = 260, life = 0.8) {
    const i = this.alloc(K_RING, color);
    if (i < 0) return;
    const o = i * STRIDE;
    this.d[o + X] = x; this.d[o + Y] = y; this.d[o + SIZE] = radius; this.d[o + LIFE] = life;
    this.kick();
  }

  sparks(x: number, y: number, color = '#ffd34d', count = 18, speed = 260, g = 300) {
    const cnt = this.q(count);
    for (let k = 0; k < cnt; k++) {
      const i = this.alloc(K_SPARK, Math.random() < 0.3 ? '#ffffff' : color);
      if (i < 0) break;
      const o = i * STRIDE; const d = this.d;
      const a = rnd(0, TAU); const v = rnd(0.3, 1) * speed;
      d[o + X] = x; d[o + Y] = y; d[o + VX] = Math.cos(a) * v; d[o + VY] = Math.sin(a) * v - speed * 0.2;
      d[o + G] = g; d[o + DRAG] = 0.93; d[o + LIFE] = rnd(0.5, 1.1); d[o + SIZE] = rnd(3, 7);
      d[o + ROT] = rnd(0, TAU); d[o + VR] = rnd(-4, 4);
    }
    this.kick();
  }

  /** Embers and debris for crashes. */
  embers(x: number, y: number, count = 22) {
    const cnt = this.q(count);
    for (let k = 0; k < cnt; k++) {
      const i = this.alloc(K_EMBER, pick(EMBER));
      if (i < 0) break;
      const o = i * STRIDE; const d = this.d;
      const a = rnd(-Math.PI, 0); const v = rnd(80, 360);
      d[o + X] = x; d[o + Y] = y; d[o + VX] = Math.cos(a) * v; d[o + VY] = Math.sin(a) * v;
      d[o + G] = 520; d[o + DRAG] = 0.97; d[o + LIFE] = rnd(0.7, 1.4); d[o + SIZE] = rnd(2, 5);
    }
    this.kick();
  }

  /** Coins that arc across the screen into the wallet. Always spawned in full: they carry the cash feedback. */
  coinFly(x: number, y: number, tx: number, ty: number, n = 1, delay = 0) {
    for (let k = 0; k < n; k++) {
      const i = this.alloc(K_FLY, '#ffd34d');
      if (i < 0) { this.onCoinArrive?.(); continue; }
      const o = i * STRIDE; const d = this.d;
      const sx = x + rnd(-8, 8); const sy = y + rnd(-8, 8);
      d[o + X] = sx; d[o + Y] = sy; d[o + E0] = sx; d[o + E1] = sy; d[o + E2] = tx; d[o + E3] = ty;
      d[o + SIZE] = rnd(7, 9); d[o + LIFE] = rnd(0.55, 0.85); d[o + AGE] = -delay - k * 0.06;
      d[o + SPIN] = rnd(0, 6); d[o + VS] = rnd(10, 16); d[o + E4] = rnd(-160, 160);
    }
    this.kick();
  }

  // ---------- loop ----------
  private frame = (now: number) => {
    this.raf = 0;
    const raw = now - this.last;
    const dt = Math.min(1 / 30, raw / 1000);
    this.last = now;
    this.clock += dt;
    this.govern(raw);
    const box = this.update(dt);
    this.draw(box);
    if (this.n > 0 || this.em.length) this.raf = requestAnimationFrame(this.frame);
  };

  /** Frame-time governor: lower quality fast when slow, raise it slowly when there is headroom. */
  private govern(raw: number) {
    if (this.n < 40 || raw > 250) return; // idle or tab was hidden: not a useful sample
    this.ema = this.ema * 0.88 + raw * 0.12;
    if (this.ema > 24 && this.quality > 0.25) {
      this.quality = Math.max(0.25, this.quality * 0.8);
      this.goodFrames = 0; this.ema = 16.7;
      if (this.quality < 0.5 && this.dpr > 1) this.resize();
    } else if (this.ema < 18.5 && this.quality < 1 && !this.reduced) {
      if (++this.goodFrames > 150) { this.quality = Math.min(1, this.quality + 0.15); this.goodFrames = 0; }
    }
  }

  private emit(e: Emitter, dt: number) {
    e.acc += e.rate * this.quality * dt;
    const d = this.d;
    while (e.acc >= 1) {
      e.acc -= 1;
      if (e.kind === K_COIN) {
        const i = this.alloc(K_COIN, '#ffd34d'); if (i < 0) return;
        const o = i * STRIDE;
        const a = ((e.angle + rnd(-e.spread, e.spread)) * Math.PI) / 180;
        const v = Math.sqrt(2 * 1500 * this.h * rnd(0.55, 0.92)); // peak at 55-90% of screen height
        d[o + X] = e.x + rnd(-24, 24); d[o + Y] = e.y; d[o + VX] = Math.cos(a) * v * 0.9; d[o + VY] = Math.sin(a) * v;
        d[o + G] = 1500; d[o + DRAG] = 0.999; d[o + LIFE] = 4.2; d[o + SIZE] = rnd(9, 15);
        d[o + SPIN] = rnd(0, TAU); d[o + VS] = rnd(6, 14);
      } else if (e.kind === K_BILL) {
        const i = this.alloc(K_BILL, '#6bd68a'); if (i < 0) return;
        const o = i * STRIDE;
        if (e.rain) {
          d[o + X] = rnd(0, this.w); d[o + Y] = e.y; d[o + VX] = rnd(-40, 40); d[o + VY] = rnd(60, 160);
          d[o + G] = 70; d[o + DRAG] = 0.992; d[o + LIFE] = 6; d[o + SIZE] = rnd(20, 30);
          d[o + ROT] = rnd(0, TAU); d[o + VR] = rnd(-2.5, 2.5); d[o + SPIN] = rnd(0, TAU); d[o + VS] = rnd(2.5, 5);
        } else {
          const a = ((e.angle + rnd(-e.spread, e.spread)) * Math.PI) / 180;
          const v = Math.sqrt(2 * 900 * this.h * rnd(0.5, 0.85));
          d[o + X] = e.x + rnd(-24, 24); d[o + Y] = e.y; d[o + VX] = Math.cos(a) * v * 0.9; d[o + VY] = Math.sin(a) * v;
          d[o + G] = 900; d[o + DRAG] = 0.992; d[o + LIFE] = 5.5; d[o + SIZE] = rnd(22, 30);
          d[o + ROT] = rnd(0, TAU); d[o + VR] = rnd(-4, 4); d[o + SPIN] = rnd(0, TAU); d[o + VS] = rnd(3, 6);
        }
      } else {
        const i = this.alloc(K_CONFETTI, pick(PALETTE)); if (i < 0) return;
        const o = i * STRIDE;
        d[o + X] = rnd(0, this.w); d[o + Y] = e.y; d[o + VX] = rnd(-60, 60); d[o + VY] = rnd(120, 260);
        d[o + G] = 120; d[o + DRAG] = 0.99; d[o + LIFE] = 4.5; d[o + SIZE] = rnd(7, 12);
        d[o + ROT] = rnd(0, TAU); d[o + VR] = rnd(-6, 6); d[o + SPIN] = rnd(0, TAU); d[o + VS] = rnd(5, 10);
      }
    }
  }

  /** Advance every live particle. Returns the bounds of everything that will be drawn (null if nothing). */
  private update(dt: number): [number, number, number, number] | null {
    for (let k = this.em.length - 1; k >= 0; k--) {
      const e = this.em[k];
      if (e.until <= this.clock) { this.em[k] = this.em[this.em.length - 1]; this.em.pop(); continue; }
      this.emit(e, dt);
    }

    const d = this.d; const kind = this.kind;
    const f = dt * 60; // 1.0 at 60fps
    const floor = this.h + 30;
    const maxBounceY = this.h;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

    let i = 0;
    while (i < this.n) {
      const o = i * STRIDE;
      const k = kind[i];
      d[o + AGE] += dt;
      const age = d[o + AGE];
      let dead = false;

      if (age >= 0) {
        const life = d[o + LIFE];
        if (k === K_COMET) {
          d[o + E6] = d[o + X]; d[o + E7] = d[o + Y];
          d[o + E3] += d[o + E4] * dt;
          d[o + E4] *= 1 - 0.015 * f;
          d[o + E2] += d[o + E5] * dt;
          d[o + E5] *= 1 - 0.012 * f;
          d[o + X] = d[o + E0] + Math.cos(d[o + E2]) * d[o + E3];
          d[o + Y] = d[o + E1] + Math.sin(d[o + E2]) * d[o + E3];
          dead = age >= life;
        } else if (k === K_FLY) {
          if (age >= life) { dead = true; this.onCoinArrive?.(); } else {
            const t = age / life;
            const e = t * t * (3 - 2 * t);
            const sx = d[o + E0], sy = d[o + E1], tx = d[o + E2], ty = d[o + E3];
            const mx = (sx + tx) / 2 + d[o + E4];
            const my = Math.min(sy, ty) - 80;
            const u = 1 - e;
            d[o + X] = u * u * sx + 2 * u * e * mx + e * e * tx;
            d[o + Y] = u * u * sy + 2 * u * e * my + e * e * ty;
            d[o + SPIN] += d[o + VS] * dt;
          }
        } else if (k === K_RING) {
          dead = age >= life;
        } else {
          const damp = Math.max(0, 1 - (1 - d[o + DRAG]) * f);
          d[o + VX] *= damp;
          let vy = d[o + VY] * damp + d[o + G] * dt;
          if (k === K_CONFETTI || k === K_BILL) {
            const cap = k === K_BILL ? 190 : 300; // paper flutters: cap the fall speed
            if (vy > cap) vy = cap;
            d[o + VX] += Math.sin(d[o + SPIN] * 1.3) * 156 * dt;
          }
          d[o + VY] = vy;
          d[o + X] += d[o + VX] * dt; d[o + Y] += vy * dt;
          d[o + ROT] += d[o + VR] * dt; d[o + SPIN] += d[o + VS] * dt;
          const y = d[o + Y];
          if (k === K_COIN) {
            if (y > maxBounceY - d[o + SIZE] && vy > 0 && age > 0.6 && this.bounce[i] < 2) {
              d[o + Y] = maxBounceY - d[o + SIZE]; d[o + VY] = vy * -0.42; d[o + VX] *= 0.7; this.bounce[i]++;
            }
            dead = age > life || y > floor + 60;
          } else if (k === K_BILL) {
            dead = age > life || y > floor + 40;
          } else if (k === K_CONFETTI) {
            dead = age >= life || y > floor + 60;
          } else {
            dead = age >= life;
          }
        }
      }

      if (dead) {
        // swap-remove: move the last live particle into this slot and re-process the slot
        const last = this.n - 1;
        if (i !== last) {
          d.copyWithin(o, last * STRIDE, (last + 1) * STRIDE);
          kind[i] = kind[last]; this.col[i] = this.col[last]; this.bounce[i] = this.bounce[last];
        }
        this.n--;
        continue;
      }

      if (age >= 0) {
        const m = k === K_RING ? d[o + SIZE] + 8 : k === K_BILL ? d[o + SIZE] * 2.2 : k === K_COMET ? d[o + SIZE] * 5 + 10 : d[o + SIZE] * 2.4 + 8;
        const px = d[o + X], py = d[o + Y];
        if (px - m < x0) x0 = px - m;
        if (py - m < y0) y0 = py - m;
        if (px + m > x1) x1 = px + m;
        if (py + m > y1) y1 = py + m;
      }
      i++;
    }
    return x0 === Infinity ? null : [x0, y0, x1, y1];
  }

  private draw(box: [number, number, number, number] | null) {
    const c = this.ctx;
    if (!c) return;
    const dpr = this.dpr;

    // clear only what was drawn last frame (plus what we are about to draw)
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    const prev = this.dirty;
    if (prev) {
      c.clearRect(Math.floor(prev[0] * dpr) - 2, Math.floor(prev[1] * dpr) - 2, Math.ceil((prev[2] - prev[0]) * dpr) + 4, Math.ceil((prev[3] - prev[1]) * dpr) + 4);
    }
    this.dirty = box;
    if (!box || this.n === 0) return;

    const d = this.d; const kind = this.kind; const n = this.n;
    const spr = this.spr;
    const cl = this.colorList;
    const cs_ = this.colorSpr;

    // ---- pass 1: normal blending (paper, coins, cash) ----
    for (let i = 0; i < n; i++) {
      const k = kind[i];
      if (k > K_COIN && k !== K_BILL && k !== K_FLY) continue;
      const o = i * STRIDE;
      const age = d[o + AGE];
      if (age < 0) continue;
      const life = d[o + LIFE];
      const x = d[o + X] * dpr, y = d[o + Y] * dpr;
      if (k === K_CONFETTI) {
        const fade = age > life - 0.6 ? (life - age) / 0.6 : 1;
        c.globalAlpha = fade > 0 ? fade : 0;
        const rot = d[o + ROT];
        const s = (d[o + SIZE] * dpr) / 24;
        const cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
        const flip = Math.cos(d[o + SPIN]);
        c.setTransform(cs, sn, -sn * flip, cs * flip, x, y);
        c.drawImage(cs_[this.col[i]].confetti, -12, -6);
      } else if (k === K_COIN || k === K_FLY) {
        const fade = k === K_COIN && age > life - 0.8 ? Math.max(0, (life - age) / 0.8) : 1;
        c.globalAlpha = fade;
        const sc = (d[o + SIZE] * 2 * dpr) / 44;
        const cs = Math.cos(d[o + SPIN]);
        const w = Math.max(0.12, Math.abs(cs)) * sc;
        c.setTransform(w, 0, 0, sc, x, y);
        c.drawImage(cs > 0 ? spr.coinFront : spr.coinBack, -32, -32);
      } else {
        const fade = age > life - 0.8 ? Math.max(0, (life - age) / 0.8) : 1;
        c.globalAlpha = fade;
        const rot = d[o + ROT];
        const s = (d[o + SIZE] * 2 * dpr) / 80;
        const cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
        const flip = Math.max(0.15, Math.abs(Math.cos(d[o + SPIN])));
        c.setTransform(cs, sn, -sn * flip, cs * flip, x, y);
        c.drawImage(spr.bill, -40, -20);
      }
    }

    // ---- pass 2: additive light (sparks, embers, comets, rings) ----
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const k = kind[i];
      if (k !== K_SPARK && k !== K_EMBER && k !== K_COMET && k !== K_RING) continue;
      const o = i * STRIDE;
      const age = d[o + AGE];
      if (age < 0) continue;
      const life = d[o + LIFE];
      const t = age >= life ? 1 : age / life;
      const x = d[o + X] * dpr, y = d[o + Y] * dpr;
      const color = cl[this.col[i]];
      const sp0 = cs_[this.col[i]];
      if (k === K_SPARK) {
        c.globalAlpha = 1 - t * t;
        const s = (d[o + SIZE] * (1 - t * 0.6) * 1.6 * dpr * 2) / 52 * 1.0;
        const rot = d[o + ROT];
        const cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
        c.setTransform(cs, sn, -sn, cs, x, y);
        c.drawImage(sp0.star, -32, -32);
      } else if (k === K_EMBER) {
        c.globalAlpha = 1 - t;
        const s = (d[o + SIZE] * (1 - t * 0.5) * 3.2 * dpr) / 64;
        c.setTransform(s, 0, 0, s, x, y);
        c.drawImage(sp0.glow, -32, -32);
      } else if (k === K_COMET) {
        const a = Math.sin(t * Math.PI);
        c.globalAlpha = Math.min(1, a * 1.4);
        const sz = d[o + SIZE] * (1 - t * 0.5);
        const gs = (sz * 4.2 * dpr) / 64;
        const sp = sp0;
        // trail: three glows from the previous position to the head (replaces a shadowBlur'd line)
        const px = d[o + E6] * dpr, py = d[o + E7] * dpr;
        c.setTransform(gs * 0.7, 0, 0, gs * 0.7, px, py); c.drawImage(sp.glow, -32, -32);
        c.setTransform(gs * 0.85, 0, 0, gs * 0.85, (px + x) / 2, (py + y) / 2); c.drawImage(sp.glow, -32, -32);
        c.setTransform(gs, 0, 0, gs, x, y); c.drawImage(sp.glow, -32, -32);
        const s = (sz * 1.8 * 1.6 * 2 * dpr) / 52 * 0.8;
        const rot = age * 3;
        const cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
        c.setTransform(cs, sn, -sn, cs, x, y);
        c.drawImage(sp.star, -32, -32);
      } else {
        // ring: a handful at a time, plain stroke (no shadow)
        c.globalAlpha = (1 - t) * 0.8;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.strokeStyle = color; c.lineWidth = 6 * (1 - t) + 1;
        c.beginPath(); c.arc(d[o + X], d[o + Y], d[o + SIZE] * (1 - Math.pow(1 - t, 3)), 0, TAU); c.stroke();
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
}

export const fx = new FxEngine();
