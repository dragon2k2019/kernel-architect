// tools/glyphs.mjs — print the glyph atlas as text, so the icon artwork can be checked without a browser.
//
//   node tools/glyphs.mjs            # the hand-drawn icon set (nodes, traffic, UI, picture mode)
//   node tools/glyphs.mjs --used     # ink report for every glyph the game actually draws
//   node tools/glyphs.mjs --all      # every atlas cell (font glyphs show up empty: no font in node)
//
// The atlas is rasterised by the software 2D context in tests/stub.mjs, so what you see here is exactly
// the bitmap the WebGL glyph pass uploads.

import { installStub } from '../tests/stub.mjs';
import {
  buildAtlas, atlasToAlpha, glyphIndex, GLYPH_COUNT, ATLAS_COLS, ATLAS_ROWS, GLYPH_W, GLYPH_H, PUNCT,
  PICT, KIDPICT, ICON, EXTRA, PICT_BASE, KID_BASE, EXTRA_BASE, PUNCT_BASE,
} from '../src/render/atlas.js';

installStub();
const { NODES, TRAFFIC, LEVELS } = await import('../src/sim/content.js');
const { SIM } = await import('../src/sim/content.js');

const atlas = buildAtlas();
const alpha = atlasToAlpha(atlas);
const rows = Number(process.argv.find((a) => /^\d+$/.test(a)) || 0);

function ink(idx) {
  let n = 0;
  const gx = (idx % ATLAS_COLS) * GLYPH_W, gy = Math.floor(idx / ATLAS_COLS) * GLYPH_H;
  for (let j = 0; j < GLYPH_H; j++) for (let i = 0; i < GLYPH_W; i++) if (alpha[(gy + j) * atlas.width + gx + i] > 100) n++;
  return n;
}
function art(idx) {
  const gx = (idx % ATLAS_COLS) * GLYPH_W, gy = Math.floor(idx / ATLAS_COLS) * GLYPH_H;
  const out = [];
  for (let j = 0; j < GLYPH_H; j++) {
    let line = '';
    for (let i = 0; i < GLYPH_W; i++) line += alpha[(gy + j) * atlas.width + gx + i] > 100 ? '#' : (alpha[(gy + j) * atlas.width + gx + i] > 0 ? '+' : '.');
    out.push(line);
  }
  return out;
}
// index -> the character that lives there, so a dump can be labelled
const CHAR_AT = new Map();
for (let i = 0; i < 95; i++) CHAR_AT.set(i, String.fromCharCode(32 + i));
for (let i = 0; i < EXTRA.length; i++) CHAR_AT.set(EXTRA_BASE + i, EXTRA[i]);
for (let i = 0; i < PICT.length; i++) CHAR_AT.set(PICT_BASE + i, PICT[i]);
for (let i = 0; i < KIDPICT.length; i++) CHAR_AT.set(KID_BASE + i, KIDPICT[i]);
for (let i = 0; i < PUNCT.length; i++) CHAR_AT.set(PUNCT_BASE + i, PUNCT[i]);
const nameOf = (idx) => {
  const ch = CHAR_AT.get(idx);
  if (ch === undefined) return `cell ${idx}`;
  const nm = Object.keys(ICON).find((k) => ICON[k] === ch);
  if (nm) return 'ICON.' + nm;
  if (ch === ' ') return "SPACE → '~' fallback";
  return `'${ch}'  U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
};

if (process.argv.includes('--used')) {
  const used = new Map();
  for (const def of NODES) used.set(def.glyph, 'node ' + def.key);
  for (const t of TRAFFIC) used.set(t.glyph, 'traffic ' + t.key);
  for (const k of Object.keys(ICON)) used.set(ICON[k], 'ICON.' + k);
  for (const ch of PICT) if (!used.has(ch)) used.set(ch, 'UI');
  let bad = 0, font = 0;
  for (const [ch, label] of used) {
    const idx = glyphIndex(ch);
    const c = ch.charCodeAt(0);
    const isFont = (c >= 33 && c <= 126) || EXTRA.includes(ch);     // ASCII and the font's own extras
    const n = ink(idx);
    if (n === 0 && isFont) { font++; console.log(`  -- ${label.padEnd(18)} ${nameOf(idx).padEnd(20)} font glyph (not rasterised here)`); }
    else if (n < 6) { bad++; console.log(`  !  ${label.padEnd(18)} ${nameOf(idx).padEnd(20)} ink=${n}  <-- DRAW THIS`); }
    else console.log(`  ok ${label.padEnd(18)} ${nameOf(idx).padEnd(20)} ink=${n}${isFont ? ' (font, over-drawn by border)' : ''}`);
  }
  console.log(`\n${used.size - bad - font} drawn, ${font} from the font, ${bad} missing`);
  console.log(`\n${used.size - bad}/${used.size} symbols have ink; atlas holds ${GLYPH_COUNT} glyphs (${ATLAS_COLS}x${ATLAS_ROWS} cells of ${GLYPH_W}x${GLYPH_H}px)`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes('--sheet')) {                    // all icons side by side, for eyeballing
  const chars = [...PICT, ...Object.keys(ICON).map((k) => ICON[k]), ...PUNCT];
  const names = [...[...PICT].map((c) => `'${c}'`), ...Object.keys(ICON), ...[...PUNCT].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase()}`)];
  const per = 6;
  for (let start = 0; start < chars.length; start += per) {
    const block = chars.slice(start, start + per).map((c) => art(glyphIndex(c)));
    console.log(block.map((_, k) => ('  ' + (names[start + k] || '')).padEnd(13)).join(''));
    for (let row = 0; row < GLYPH_H; row++) console.log(block.map((a) => '  ' + a[row].replace(/#/g, '██').replace(/\+/g, '▒▒').replace(/\./g, '  ')).join(''));
    console.log('');
  }
  process.exit(0);
}

const list = process.argv.includes('--all')
  ? Array.from({ length: GLYPH_COUNT }, (_, i) => i)
  : [...PICT, ...KIDPICT].map((ch) => glyphIndex(ch));

let count = 0;
for (const idx of list) {
  const n = ink(idx);
  if (!process.argv.includes('--all') && n < 4) continue;
  const label = nameOf(idx);
  console.log(`${String(idx).padStart(3)}  ${label.padEnd(18)} ink=${String(n).padStart(3)}`);
  console.log(art(idx).map((l) => '    ' + l.replace(/#/g, '█').replace(/\+/g, '▒')).join('\n'));
  if (++count % 8 === 0) console.log('');
}
console.log(`${count} pictures shown`);
