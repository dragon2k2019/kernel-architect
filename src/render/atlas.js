// src/render/atlas.js — procedural glyph atlas.
//
// One 16x16 grid of glyph cells drawn once with Canvas2D at startup, uploaded as a single-channel
// texture. ASCII plus the box-drawing/block characters the terminal UI needs. No font files, no network.

export const ATLAS_COLS = 16, ATLAS_ROWS = 16;
export const GLYPH_W = 8, GLYPH_H = 16;

// Extra glyphs (beyond printable ASCII) placed at code index 96+. Kept to characters that are
// present in essentially every monospace font.
export const EXTRA = '─│┌┐└┘├┤┬┴┼█▓▒░◆◇○●•▲▼◄►←↑→↓≡±×÷▀▄▌▐╔╗╚╝═║╦╩╠╣╬';
export const EXTRA_BASE = 96;
const MAP = new Map();
for (let i = 0; i < EXTRA.length; i++) MAP.set(EXTRA[i], EXTRA_BASE + i);

export function glyphIndex(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return c - 32;               // printable ASCII -> 0..94
  const g = MAP.get(ch);
  return g === undefined ? 94 : g;                      // fallback: the '~' cell
}

// --------------------------------------------------------------------------- icons
// Everything the game uses as a symbol. Monospace fonts cover these characters badly (a missing
// glyph is invisible: it renders as a blank cell), so each one is hand-drawn below at 8x16 px.
export const PICT = '▤▥▦▣⌕◈◦⌐⊥≈★✓✕⚠▸▶◀◂↻┄┆';
export const PICT_BASE = EXTRA_BASE + EXTRA.length;
export const KIDPICT = '\uE000\uE001\uE002\uE003\uE004\uE005\uE006\uE007\uE008\uE009\uE00A\uE00B\uE00C\uE00D\uE00E\uE00F\uE010\uE011\uE012';
export const KID_BASE = PICT_BASE + PICT.length;
/** Named picture-glyphs, so the source says SMILE instead of a private-use code point. */
export const ICON = {
  SMILE: '\uE000', SAD: '\uE001', HEART: '\uE002', COIN: '\uE003', CLOUD: '\uE004',
  HOUSE: '\uE005', CRATE: '\uE006', BOLT: '\uE007', LOCK: '\uE008', PAD: '\uE009',
  UP: '\uE00A', PICTURE: '\uE00B', RING: '\uE00C', GEAR: '\uE00D',
  BOOK: '\uE00E', PENCIL: '\uE00F', SHIELD: '\uE010', NOENTRY: '\uE011', LADDER: '\uE012',
};
for (let i = 0; i < PICT.length; i++) MAP.set(PICT[i], PICT_BASE + i);
/** A 2-letter ASCII tag for a picture glyph, so text dumps and logs stay readable. */
const TAGS = {
  SMILE: ':)', SAD: ':(', HEART: '<3', COIN: '$$', CLOUD: '~~', HOUSE: 'NH', CRATE: '[]', BOLT: '!/',
  LOCK: 'LO', PAD: 'PD', UP: '^', PICTURE: 'PG', RING: 'OO', GEAR: '**', BOOK: 'BK', PENCIL: 'PN',
  SHIELD: 'SH', NOENTRY: 'X', LADDER: 'LL',
};
export function glyphTag(ch) {
  for (const k of Object.keys(ICON)) if (ICON[k] === ch) return TAGS[k] || k.slice(0, 2);
  return ch;
}
for (let i = 0; i < KIDPICT.length; i++) MAP.set(KIDPICT[i], KID_BASE + i);

/**
 * Prose punctuation that is NOT ASCII: without a cell here every one of these silently drew as '~'.
 * Kept at the end of the atlas so adding to it can never shift an existing index.
 */
export const PUNCT = '—·…›²∗‖⤢';
export const PUNCT_BASE = KID_BASE + KIDPICT.length;
for (let i = 0; i < PUNCT.length; i++) MAP.set(PUNCT[i], PUNCT_BASE + i);

export const GLYPH_COUNT = PUNCT_BASE + PUNCT.length;
/**
 * Can this character be drawn? Printable ASCII comes from the font (the browser has it), everything
 * else has to be in MAP — a character that is not is silently replaced by '~', which is a bug.
 */
export function atlasHas(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 33 && c <= 126) return true;                 // 94 is also the fallback cell, so check first
  return MAP.has(ch);
}
const FALLBACK = 94;                       // the '~' cell

/** Build the atlas: returns {canvas, data} where data is a Uint8Array of RGBA pixels. */
export function buildAtlas() {
  const w = ATLAS_COLS * GLYPH_W, h = ATLAS_ROWS * GLYPH_H;
  const cv = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Menlo/Consolas/DejaVu are all present on the three major platforms; the last two are fallbacks.
  const font = '12px "DejaVu Sans Mono", "Menlo", "Consolas", "Liberation Mono", monospace';
  ctx.font = font;

  const put = (ch, idx) => {
    const cx = (idx % ATLAS_COLS) * GLYPH_W + GLYPH_W / 2;
    const cy = Math.floor(idx / ATLAS_COLS) * GLYPH_H + GLYPH_H / 2 + 0.5;
    ctx.fillText(ch, cx, cy);
  };
  for (let i = 0; i < 95; i++) put(String.fromCharCode(32 + i), i);
  for (let i = 0; i < EXTRA.length; i++) put(EXTRA[i], EXTRA_BASE + i);
  drawPictures(ctx);          // the icon set, drawn on top of (and instead of) any font coverage

  // Box-drawing glyphs are drawn by hand on top of the font: font coverage for U+2500 is patchy,
  // and hand-drawn lines guarantee the panels join up cleanly at 8x16.
  drawBoxGlyphs(ctx);

  const img = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: new Uint8Array(img.data.buffer.slice(0)), canvas: cv, font };
}

/** Draw crisp 1px box/block glyphs so panels tile without gaps. */
function drawBoxGlyphs(ctx) {
  const px = (gx, gy) => { ctx.fillRect(gx, gy, 1, 1); };       // 1 physical pixel
  const cell = (idx) => ({ x: (idx % ATLAS_COLS) * GLYPH_W, y: Math.floor(idx / ATLAS_COLS) * GLYPH_H });
  const line = (idx, spec) => {
    const { x, y } = cell(idx);
    ctx.fillStyle = '#fff';
    const midX = x + 3, midY = y + 7;                            // left leg at x+3, right at x+4; row 7..8
    if (spec.h) { for (let i = 0; i < 8; i++) { px(x + i, midY); px(x + i, midY + 1); } }
    if (spec.v) { for (let j = 0; j < 16; j++) { px(midX, y + j); px(midX + 1, y + j); } }
    if (spec.l) { for (let i = 0; i <= 4; i++) { px(x + i, midY); px(x + i, midY + 1); } }
    if (spec.r) { for (let i = 3; i < 8; i++) { px(x + i, midY); px(x + i, midY + 1); } }
    if (spec.u) { for (let j = 0; j <= 8; j++) { px(midX, y + j); px(midX + 1, y + j); } }
    if (spec.d) { for (let j = 7; j < 16; j++) { px(midX, y + j); px(midX + 1, y + j); } }
  };
  // EXTRA order: ─│┌┐└┘├┤┬┴┼█▓▒░◆◇○●•▲▼◄►←↑→↓≡±×÷
  const specs = [
    { h: 1 }, { v: 1 }, { d: 1, r: 1 }, { d: 1, l: 1 }, { u: 1, r: 1 }, { u: 1, l: 1 },
    { u: 1, d: 1, r: 1 }, { u: 1, d: 1, l: 1 }, { d: 1, h: 1 }, { u: 1, h: 1 }, { h: 1, v: 1 },
  ];
  specs.forEach((spec, i) => line(EXTRA_BASE + i, spec));

  // block shades: █ ▓ ▒ ░ at indices 96+11 .. 96+14
  const shades = [
    { idx: EXTRA_BASE + 11, step: [1, 1] }, { idx: EXTRA_BASE + 12, step: [1, 2] },
    { idx: EXTRA_BASE + 13, step: [1, 4] }, { idx: EXTRA_BASE + 14, step: [1, 8] },
  ];
  for (const { idx, step } of shades) {
    const { x, y } = cell(idx);
    ctx.fillStyle = '#fff';
    for (let j = 0; j < GLYPH_H; j++) {
      for (let i = 0; i < GLYPH_W; i++) {
        if ((i % step[1] === 0 && (j + i) % step[1] === 0 && step[1] === 1) || (step[1] > 1 && (i + j * 2) % step[1] === 0)) {
          px(x + i, y + j);
        }
      }
    }
  }
  // The geometric/arrow glyphs (◆◇○●•▲▼◄►←↑→↓) come from the font: they are almost always present.
}

// --------------------------------------------------------------------------- icon drawing
// Tiny raster helpers on an 8x16 cell. Everything is 1-bit: icons are stamped into the alpha channel
// the glyph pass samples, so they take the colour of whatever draws them.
function drawPictures(ctx) {
  const cell = (ch) => { const i = glyphIndex(ch); return { x: (i % ATLAS_COLS) * GLYPH_W, y: Math.floor(i / ATLAS_COLS) * GLYPH_H }; };
  const art = (ch, fn) => { const c = cell(ch); ctx.fillStyle = '#fff'; fn(pen(c.x, c.y), c); };

  function pen(ox, oy) {
    const dot = (x, y, w = 1, h = 1) => ctx.fillRect(ox + x, oy + y, w, h);
    const hole = (x, y, w = 1, h = 1) => ctx.clearRect(ox + x, oy + y, w, h);
    const line = (x0, y0, x1, y1, w = 1) => {
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx - dy, x = x0, y = y0, guard = 0;
      for (;;) {
        dot(x - ((w - 1) >> 1), y - ((w - 1) >> 1), w, w);
        if ((x === x1 && y === y1) || guard++ > 200) break;
        const e2 = err * 2;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
    };
    const box = (x, y, w, h, fill = false) => {
      if (fill) { dot(x, y, w, h); return; }
      dot(x, y, w, 1); dot(x, y + h - 1, w, 1); dot(x, y, 1, h); dot(x + w - 1, y, 1, h);
    };
    const poly = (pts) => {                              // even-odd scanline fill
      let minY = 1e9, maxY = -1e9;
      for (let i = 1; i < pts.length; i += 2) { minY = Math.min(minY, pts[i]); maxY = Math.max(maxY, pts[i]); }
      for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(GLYPH_H - 1, Math.ceil(maxY)); y++) {
        const xs = [];
        for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
          const yi = pts[i + 1], yj = pts[j + 1];
          if ((yi > y) !== (yj > y)) xs.push(pts[i] + ((y - yi) / (yj - yi)) * (pts[j] - pts[i]));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) dot(Math.round(xs[k]), y, Math.max(1, Math.round(xs[k + 1] - xs[k])));
      }
    };
    const disc = (cx, cy, r, fill = true) => {
      for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < GLYPH_W; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (fill ? d <= r : d <= r && d >= r - 1.6) dot(x, y);
      }
    };
    const arc = (cx, cy, r, a0, a1, w = 1.6) => {         // angles in degrees, clockwise
      for (let a = a0; a <= a1; a += 3) {
        const t = (a * Math.PI) / 180;
        dot(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), w, w);
      }
    };
    const star = (cx, cy, r) => {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? r * 0.42 : r, a = (-90 + i * 36) * Math.PI / 180;
        pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      poly(pts);
    };
    return { dot, hole, line, box, poly, disc, arc, star };
  }

  // --- node and traffic symbols -------------------------------------------------
  art('▤', (p) => { p.box(1, 3, 6, 10); p.line(2, 3, 2, 12); p.line(3, 6, 6, 6); p.line(3, 8, 6, 8); p.line(3, 10, 6, 10); });   // ledger
  art('▥', (p) => { p.box(1, 3, 6, 10); p.dot(3, 6, 1, 1); p.dot(5, 6, 1, 1); p.dot(3, 10, 1, 1); p.dot(5, 10, 1, 1); p.line(1, 8, 6, 8); });  // document store
  art('▦', (p) => { p.box(0, 2, 6, 8); p.box(2, 6, 6, 8); p.line(3, 9, 6, 9); });                                              // a second copy
  art('▣', (p) => { p.box(1, 3, 6, 10, true); p.hole(1, 7, 6, 2); p.hole(3, 3, 2, 10); });                                     // crate
  art('⌕', (p) => { p.disc(3.5, 6, 3.5, false); p.line(6, 9, 7, 12, 2); });                                                    // magnifier
  art('◈', (p) => { p.box(1, 5, 6, 6); p.line(3, 3, 3, 5); p.line(5, 3, 5, 5); p.line(3, 11, 3, 13); p.line(5, 11, 5, 13); p.dot(3, 7, 2, 2); }); // chip
  art('◦', (p) => { p.disc(4, 7, 3.5, false); p.dot(3, 6, 2, 2); });                                                            // watching eye
  art('⌐', (p) => { p.line(2, 3, 2, 12, 2); p.line(2, 3, 7, 3, 2); p.dot(5, 6, 2, 4); });                                             // gate
  art('⊥', (p) => { p.line(4, 2, 4, 6); p.line(1, 10, 4, 6); p.line(4, 6, 7, 10); p.dot(0, 11, 2, 2); p.dot(6, 11, 2, 2); });   // load splitter
  art('≈', (p) => { p.line(0, 4, 3, 4); p.line(3, 4, 5, 6); p.line(5, 6, 7, 6); p.line(0, 8, 3, 8); p.line(3, 8, 5, 10); p.line(5, 10, 7, 10); p.line(0, 12, 4, 12); }); // queue of items
  art('★', (p) => { p.star(4, 7, 5.5); });
  art('✓', (p) => { p.line(1, 8, 3, 12, 2); p.line(3, 12, 7, 3, 2); });
  art('✕', (p) => { p.line(1, 4, 6, 12, 2); p.line(6, 4, 1, 12, 2); });
  art('⚠', (p) => { p.poly([4, 2, 0.5, 13.5, 7.5, 13.5]); p.hole(3, 6, 2, 4); p.hole(3, 11, 2, 2); });
  art('▸', (p) => { p.poly([3, 5, 3, 11, 6, 8]); });
  art('▶', (p) => { p.poly([2, 3, 2, 13, 7, 8]); });
  art('◀', (p) => { p.poly([6, 3, 6, 13, 1, 8]); });
  art('◂', (p) => { p.poly([5, 5, 5, 11, 2, 8]); });
  art('↻', (p) => { p.arc(4, 8, 4, 40, 340); p.poly([5, 2, 8, 5, 4, 5]); });
  art('┄', (p) => { p.dot(0, 7, 3, 2); p.dot(4, 7, 3, 2); });
  art('┆', (p) => { p.dot(3, 0, 2, 4); p.dot(3, 6, 2, 4); p.dot(3, 12, 2, 4); });

  // --- picture symbols for the friendly mode -----------------------------------
  art(ICON.SMILE, (p) => { p.disc(4, 7, 5, false); p.dot(2, 5, 2, 2); p.dot(5, 5, 2, 2); p.line(2, 9, 3, 10); p.line(3, 10, 5, 10); p.line(5, 10, 6, 9); });
  art(ICON.SAD, (p) => { p.disc(4, 7, 5, false); p.dot(2, 5, 2, 2); p.dot(5, 5, 2, 2); p.line(2, 11, 3, 10); p.line(3, 10, 5, 10); p.line(5, 10, 6, 11); });
  art(ICON.HEART, (p) => { p.disc(2.5, 5, 2.2); p.disc(5.5, 5, 2.2); p.poly([0.5, 5.5, 7.5, 5.5, 4, 13]); });
  art(ICON.COIN, (p) => { p.disc(4, 7.5, 5); p.hole(3, 5, 2, 6); p.hole(3, 7, 2, 1); });
  art(ICON.CLOUD, (p) => { p.disc(3, 6, 2.6); p.disc(5.5, 6.5, 2.2); p.dot(1, 6, 6, 4); });
  art(ICON.HOUSE, (p) => { p.poly([0, 8, 4, 2, 8, 8]); p.box(1, 7, 6, 8); p.hole(3, 10, 2, 5); });
  art(ICON.CRATE, (p) => { p.box(0, 4, 8, 9); p.line(0, 7, 7, 7); p.line(0, 12, 7, 12); p.line(3, 7, 3, 12); });
  art(ICON.BOLT, (p) => { p.poly([5, 1, 1, 9, 3.5, 9, 2, 15, 7, 6, 4.5, 6, 6, 1]); });
  art(ICON.LOCK, (p) => { p.arc(4, 6, 2.6, 180, 360); p.box(1, 7, 6, 7, true); p.hole(3, 9, 2, 3); });
  art(ICON.PAD, (p) => { p.box(0, 3, 8, 10); p.box(1, 4, 6, 8); });
  art(ICON.UP, (p) => { p.poly([4, 1, 1, 6, 3, 6, 3, 13, 5, 13, 5, 6, 7, 6]); });
  art(ICON.PICTURE, (p) => { p.box(0, 3, 8, 11); p.dot(1, 5, 2, 2); p.poly([0.5, 13, 4, 7, 7.5, 13]); });
  art(ICON.RING, (p) => { p.disc(4, 7.5, 5, false); });
  art(ICON.GEAR, (p) => { p.dot(3, 0, 2, 3); p.dot(3, 12, 2, 3); p.dot(0, 6, 3, 2); p.dot(5, 6, 3, 2); p.disc(4, 7, 3.4, false); });
  art(ICON.BOOK, (p) => { p.box(1, 2, 6, 12, true); p.hole(3, 4, 3, 8); p.hole(3, 6, 3, 1); p.hole(3, 8, 3, 1); p.hole(3, 10, 3, 1); });   // open book
  art(ICON.PENCIL, (p) => { p.poly([1, 13, 3, 8, 6, 11, 3, 14]); p.poly([3.5, 7.5, 6.5, 10.5, 7.5, 4.5, 5.5, 2.5]); p.line(6, 2, 7, 3); });   // pencil
  art(ICON.SHIELD, (p) => { p.poly([4, 0.5, 7.5, 3, 7.5, 8, 4, 15, 0.5, 8, 0.5, 3]); p.hole(3, 4, 2, 5); p.hole(2, 6, 4, 1); });   // shield
  art(ICON.NOENTRY, (p) => { p.disc(4, 7.5, 5, false); p.line(1, 11, 7, 4, 2); });                                            // no entry
  art(ICON.LADDER, (p) => { p.line(1, 2, 1, 14, 2); p.line(6, 2, 6, 14, 2); p.line(1, 5, 6, 5); p.line(1, 8, 6, 8); p.line(1, 11, 6, 11); });  // a stack of jobs

  // --- punctuation the prose uses (see PUNCT) -----------------------------------
  art('\u2014', (p) => { p.dot(1, 7, 6, 2); });                                            // — em dash
  art('\u00B7', (p) => { p.dot(3, 7, 2, 2); });                                            // · middle dot
  art('\u2026', (p) => { p.dot(0, 12, 2, 2); p.dot(3, 12, 2, 2); p.dot(6, 12, 2, 2); });   // … ellipsis
  art('\u203A', (p) => { p.line(2, 4, 5, 7); p.line(5, 8, 2, 11); });                      // › truncation mark
  art('\u00B2', (p) => { p.dot(3, 2, 4, 1); p.dot(6, 3, 1, 1); p.dot(5, 4, 1, 1); p.dot(4, 5, 1, 1); p.dot(3, 6, 1, 1); p.dot(3, 7, 4, 1); });   // ² superscript two
  art('\u2217', (p) => { p.line(3, 4, 3, 12); p.line(1, 6, 6, 10); p.line(6, 6, 1, 10); }); // ∗ asterisk operator
  art('\u2016', (p) => { p.dot(2, 4, 2, 8); p.dot(5, 4, 2, 8); });                          // ‖ pause bars
  art('\u2922', (p) => { p.line(1, 13, 6, 4); p.dot(4, 4, 3, 1); p.dot(6, 5, 1, 2); p.dot(1, 11, 1, 3); p.dot(2, 13, 3, 1); });  // ⤢ autoscale
}

/** Glyph atlas as a 1-channel texture: use the alpha of the drawn text. */
// The double-line and half-block glyphs come from the font (universally present in monospace faces);
// only the single-line box set is hand-drawn, because it has to tile perfectly in the node boxes.
export function atlasToAlpha(atlas) {
  const n = atlas.width * atlas.height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = atlas.data[i * 4 + 3];
  return out;
}
