// src/game/input.js — keyboard + mouse, translated into game intent.
//
// Keys are read once per frame from a held-key set so movement can repeat smoothly at any frame rate.
// Mouse position is converted to terminal cells; clicks and right-clicks are queued for the frame.

export const MOVE_KEYS = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Map();
    this.clicks = [];
    this.presses = [];
    this.mouse = { x: 0, y: 0, inside: false, cellX: 0, cellY: 0 };
    this.repeat = 0;
    this.enabled = true;

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.held.clear());
    canvas.addEventListener('mousemove', (e) => this.onMove(e));
    canvas.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    canvas.addEventListener('mousedown', (e) => this.onClick(e));
    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.clicks.push({ x: this.mouse.cellX, y: this.mouse.cellY, button: 2 }); });
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.touches[0]; this.onMove(t); this.clicks.push({ x: this.mouse.cellX, y: this.mouse.cellY, button: 0 }); }, { passive: false });
  }

  static norm(e) {
    const k = e.key;
    if (k === ' ' || k === 'Spacebar') return 'space';
    if (k === 'Escape') return 'escape';
    if (k === 'Enter') return 'enter';
    if (k === 'Tab') return 'tab';
    if (k === 'Shift') return 'shift';
    if (k.startsWith('Arrow')) return k;
    if (k.length === 1) return k.toLowerCase();
    return k;                                   // F1, PageUp, ...
  }

  onKey(e, down) {
    if (!this.enabled) return;
    const k = Input.norm(e);
    if (down) {
      const fresh = !this.held.has(k);
      this.held.set(k, performance.now());
      if (fresh) this.presses.push(k);
      if (SEIZE.has(k)) e.preventDefault();
    } else {
      this.held.delete(k);
    }
  }

  onMove(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (this.canvas.width / Math.max(1, r.width));
    const py = (e.clientY - r.top) * (this.canvas.height / Math.max(1, r.height));
    this.mouse.inside = true;
    this.mouse.moved = true;
    this.mouse.px = px; this.mouse.py = py;
    this.mouse.cellX = Math.floor(px / 8);
    this.mouse.cellY = Math.floor(py / 16);
  }

  onClick(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (this.canvas.width / Math.max(1, r.width));
    const py = (e.clientY - r.top) * (this.canvas.height / Math.max(1, r.height));
    this.mouse.cellX = Math.floor(px / 8);
    this.mouse.cellY = Math.floor(py / 16);
    this.clicks.push({ x: this.mouse.cellX, y: this.mouse.cellY, button: e.button });
  }

  /** Drain the presses/clicks collected since the last frame. */
  take() {
    const out = { presses: this.presses, clicks: this.clicks };
    this.presses = [];
    this.clicks = [];
    return out;
  }

  /** Movement vector for this frame, with keyboard auto-repeat after a short delay. */
  movement() {
    const arr = [];
    for (const [k, [dx, dy]] of Object.entries(MOVE_KEYS)) {
      if (!this.held.has(k)) continue;
      arr.push([k, dx, dy]);
    }
    if (arr.length) {
      this.repeat++;
      const fresh = arr.some(([k]) => performance.now() - this.held.get(k) < 150);
      if (!fresh && this.repeat % 5 !== 0) return [];
      return arr.map(([, dx, dy]) => [dx, dy]);
    }
    this.repeat = 0;
    return [];
  }
}

// Keys the game owns: never let the browser scroll, tab away or space-activate.
const SEIZE = new Set(['space', 'tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'enter', '/', "'"]);
