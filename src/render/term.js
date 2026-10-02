// src/render/term.js — the terminal cell grid the whole UI is drawn into.
//
// 160x50 cells, 8x16 pixels each (1280x800). Everything is a glyph + foreground + background, so the
// HUD is built with the same primitives a real TUI would use. The renderer turns this into one draw call.

export const PAL = {
  bg: [0, 0.035, 0.02],
  panel: [0.02, 0.09, 0.055],
  head: [0.05, 0.2, 0.11],
  green: [0.45, 1, 0.6],
  bright: [0.82, 1, 0.88],
  dim: [0.22, 0.52, 0.33],
  dimmer: [0.14, 0.33, 0.22],
  amber: [1, 0.86, 0.42],
  red: [1, 0.34, 0.34],
  cyan: [0.45, 0.9, 1],
  magenta: [1, 0.45, 0.78],
  violet: [0.72, 0.55, 1],
  grey: [0.55, 0.6, 0.58],
  white: [0.9, 0.96, 0.93],
  black: [0, 0, 0],
};

export const rgba = (c, mul = 1) => [c[0] * mul, c[1] * mul, c[2] * mul];
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class Term {
  constructor(cols, rows) {
    this.cols = cols; this.rows = rows;
    const n = cols * rows;
    this.ch = new Array(n).fill(' ');
    this.fg = new Array(n);
    this.bg = new Array(n);
    this.bgi = new Float32Array(n).fill(1);
    this.clear();
  }

  clear(bg = PAL.bg) {
    this.ch.fill(' ');
    this.fg.fill(PAL.dim);
    this.bg.fill(bg);
    this.bgi.fill(1);
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }

  put(x, y, glyph, fg = PAL.green, bg = PAL.bg, bgi = 1) {
    x |= 0; y |= 0;
    if (typeof glyph !== 'string') glyph = ' ';
    const first = Array.from(glyph)[0];
    glyph = first === undefined ? ' ' : first;      // one code point per cell
    if (!this.inBounds(x, y)) return;
    const i = y * this.cols + x;
    this.ch[i] = glyph; this.fg[i] = fg; this.bg[i] = bg; this.bgi[i] = bgi;
  }

  text(x, y, str, fg = PAL.green, bg = PAL.bg, bgi = 1) {
    const s = String(str);
    for (let k = 0; k < s.length; k++) {
      if (x + k >= this.cols) break;
      this.put(x + k, y, s[k], fg, bg, bgi);
    }
    return x + s.length;
  }

  /** Text clipped/padded into exactly w cells. */
  field(x, y, str, w, fg = PAL.green, bg = PAL.bg, align = 'left') {
    let s = String(str);
    if (s.length > w) s = s.slice(0, Math.max(0, w - 1)) + '›';
    const pad = w - s.length;
    if (align === 'right') return this.text(x + pad, y, s, fg, bg);
    if (align === 'center') return this.text(x + (pad >> 1), y, s, fg, bg);
    this.text(x, y, s, fg, bg);
  }

  fill(x, y, w, h, glyph = ' ', fg = PAL.dim, bg = PAL.bg, bgi = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, glyph, fg, bg, bgi);
  }

  hline(x, y, w, glyph = '─', fg = PAL.dim, bg = PAL.bg) {
    for (let i = 0; i < w; i++) this.put(x + i, y, glyph, fg, bg);
  }
  vline(x, y, h, glyph = '│', fg = PAL.dim, bg = PAL.bg) {
    for (let j = 0; j < h; j++) this.put(x, y + j, glyph, fg, bg);
  }

  box(x, y, w, h, fg = PAL.dim, bg = PAL.bg, double = false) {
    const [tl, tr, bl, br, hz, vt] = double ? ['╔', '╗', '╚', '╝', '═', '║'] : ['┌', '┐', '└', '┘', '─', '│'];
    this.hline(x + 1, y, w - 2, hz, fg, bg);
    this.hline(x + 1, y + h - 1, w - 2, hz, fg, bg);
    this.vline(x, y + 1, h - 2, vt, fg, bg);
    this.vline(x + w - 1, y + 1, h - 2, vt, fg, bg);
    this.put(x, y, tl, fg, bg); this.put(x + w - 1, y, tr, fg, bg);
    this.put(x, y + h - 1, bl, fg, bg); this.put(x + w - 1, y + h - 1, br, fg, bg);
  }

  /** A titled panel: border + embedded header. */
  panel(x, y, w, h, title, fg = PAL.dim, bg = PAL.panel, titleFg = PAL.bright) {
    this.fill(x, y, w, h, ' ', PAL.dim, bg);
    this.box(x, y, w, h, fg, bg);
    if (title) {
      this.put(x + 2, y, '┤', fg, bg);
      this.text(x + 3, y, ' ' + title + ' ', titleFg, bg);
      const used = title.length + 4;
      for (let i = x + 3 + used; i < x + w - 1; i++) this.put(i, y, '─', fg, bg);
      this.put(x + 3 + used - 1, y, '├', fg, bg);
    }
  }

  /** Shaded gauge. frac 0..1 over w cells. */
  bar(x, y, w, frac, fg = PAL.green, bg = PAL.bg, glyphs = '█▓▒░') {
    const f = Math.max(0, Math.min(1, frac)) * w;
    for (let i = 0; i < w; i++) {
      const v = f - i;
      let g = glyphs[3], col = PAL.dimmer;
      if (v >= 0.85) { g = glyphs[0]; col = fg; }
      else if (v >= 0.55) { g = glyphs[1]; col = fg; }
      else if (v >= 0.25) { g = glyphs[2]; col = fg; }
      this.put(x + i, y, g, col, bg);
    }
  }
}

// ---------------------------------------------------------------- formatting helpers
export function money(v) {
  const a = Math.abs(v);
  if (a >= 1000000) return (v / 1000000).toFixed(2) + 'M';
  if (a >= 10000) return Math.round(v / 1000) + 'k';
  return String(Math.round(v));
}
export function clock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
export function padEnd(s, w) { s = String(s); return s.length >= w ? s : s + ' '.repeat(w - s.length); }
export function padStart(s, w) { s = String(s); return s.length >= w ? s : ' '.repeat(w - s.length) + s; }
export function wrap(str, w, maxLines = 99) {
  const words = String(str).split(/\s+/);
  const out = [];
  let line = '';
  for (const word of words) {
    if (!line.length) line = word;
    else if (line.length + 1 + word.length <= w) line += ' ' + word;
    else { out.push(line); line = word; }
    if (out.length >= maxLines) break;
  }
  if (line && out.length < maxLines) out.push(line);
  return out;
}
