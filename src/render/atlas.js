// src/render/atlas.js — procedural glyph atlas.
//
// One 16x16 grid of glyph cells drawn once with Canvas2D at startup, uploaded as a single-channel
// texture. ASCII plus the box-drawing/block characters the terminal UI needs. No font files, no network.

export const ATLAS_COLS = 16, ATLAS_ROWS = 16;
export const GLYPH_W = 8, GLYPH_H = 16;

// Extra glyphs (beyond printable ASCII) placed at code index 96+. Kept to characters that are
// present in essentially every monospace font.
export const EXTRA = '─│┌┐└┘├┤┬┴┼█▓▒░◆◇○●•▲▼◄►←↑→↓≡±×÷▀▄▌▐╔╗╚╝═║╦╩╠╣╬';
const EXTRA_BASE = 96;
const MAP = new Map();
for (let i = 0; i < EXTRA.length; i++) MAP.set(EXTRA[i], EXTRA_BASE + i);

export function glyphIndex(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return c - 32;               // printable ASCII -> 0..94
  const g = MAP.get(ch);
  return g === undefined ? 94 : g;                      // fallback: the '~' cell
}

export const GLYPH_COUNT = EXTRA_BASE + EXTRA.length;

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

/** Glyph atlas as a 1-channel texture: use the alpha of the drawn text. */
// The double-line and half-block glyphs come from the font (universally present in monospace faces);
// only the single-line box set is hand-drawn, because it has to tile perfectly in the node boxes.
export function atlasToAlpha(atlas) {
  const n = atlas.width * atlas.height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = atlas.data[i * 4 + 3];
  return out;
}
