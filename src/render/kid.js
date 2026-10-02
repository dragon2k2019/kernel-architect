// src/render/kid.js — PLAY MODE's screen: pictures instead of numbers.
//
// Layout (160x50):
//   row  0        the goal, as a row of picture pips, with hearts and coins
//   rows 1..42    the board: the cloud, the boxes (each with its big picture), the icons flowing
//   cols 119..159 the tile rail: one big button per picture you can add (click it, then click the board)
//   rows 43..48   the talk strip: the one thing the game wants to tell you, and the tutorial card
//   row  49       the tiny footer
//
// Icons are drawn by the glyph atlas (src/render/atlas.js). Anything that should be bigger than one
// character goes through g.big, which main.js draws after the normal cell pass.

import { PAL, rgba } from './term.js';
import { NODES, NODE, TRAFFIC } from '../sim/content.js';
import { CAP } from '../core/arena.js';
import { ICON } from './atlas.js';
import { kidTiles, kidMessage, kidGoal, kidHearts, trafficKid, typeId } from '../game/kids.js';

export const KID = {
  COLS: 160, ROWS: 50,
  BOARD_W: 118, BOARD_H: 42,          // rows 1..42 of the screen
  RAIL_X: 119, RAIL_W: 41, TILE_H: 8,
  STRIP_Y: 43,
};

const pct = (v) => Math.max(0, Math.min(1, v));

function trafficList(level) {
  return (level && level.traffic ? level.traffic : []).map((t) => typeId(t.type)).filter((t) => t !== undefined);
}

/** A box big enough to read across the room: a 2x2 picture plus its short name. */
function bigBox(term, x, y, w, h, fg, bg) {
  term.box(x, y, w, h, fg, bg, true);
}

// ------------------------------------------------------------------------------ header
function header(g) {
  const { term, sim, level } = g;
  const bg = PAL.bg;
  term.fill(0, 0, KID.COLS, 1, ' ', PAL.bright, bg);
  const types = trafficList(level);
  const goal = kidGoal(sim, level, 20);
  // the goal: pips of the picture that is wanted
  let x = 2;
  term.text(x, 0, 'WE WANT', PAL.dim, bg); x += 9;
  const pic = types.length ? trafficKid(types[0]) : { glyph: ICON.SMILE, color: [200, 255, 200] };
  for (let i = 0; i < goal.pips; i++) {
    const col = i < goal.full ? PAL.green : PAL.dimmer;
    term.put(x + i, 0, i < goal.full ? pic.glyph : '·', col, bg);
  }
  x += goal.pips + 2;
  term.text(x, 0, `${goal.done} / ${goal.need}`, PAL.bright, bg);
  // hearts and coins on the right
  const hearts = kidHearts(sim, level, 5);
  let hx = KID.COLS - 40;
  for (let i = 0; i < hearts.max; i++) term.put(hx + i * 2, 0, ICON.HEART, i < hearts.full ? PAL.red : PAL.dimmer, bg);
  term.put(hx + 12, 0, ICON.COIN, PAL.amber, bg);
  term.text(hx + 14, 0, String(Math.floor(sim.money)).padStart(4, ' '), PAL.amber, bg);
}

// ------------------------------------------------------------------------------ board
function board(g) {
  const { term, sim } = g;
  const bg = PAL.bg;
  // the dotted grid, faint: it shows where a box can go
  for (let y = 0; y < KID.BOARD_H; y += 6) {
    for (let x = 2; x < KID.BOARD_W; x += 6) term.put(x, 1 + y, '·', PAL.dimmer, bg);
  }
  // links, drawn fat and friendly
  const n = sim.nodes;
  for (let i = 0; i < n.count; i++) {
    if (n.state[i] === 0) continue;
    for (let k = 0; k < n.outCount[i]; k++) {
      const j = n.outs[i * CAP.MAX_OUT + k];
      if (j < 0 || n.state[j] === 0) continue;
      fatLink(g, n.x[i] + 7, n.y[i] + 2, n.x[j] + 7, n.y[j] + 2);
    }
  }
}

/** A wire: two cells thick, with an arrowhead where it lands. */
function fatLink(g, x0, y0, x1, y1) {
  const { term } = g;
  const col = rgba([120, 210, 255]);
  const bg = PAL.bg;
  const mid = Math.round(x0);
  const stepX = Math.sign(x1 - x0) || 1;
  // vertical-first corner, same as the simulation's routing
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    term.put(mid, 1 + y, '║', col, bg);
  }
  for (let x = Math.min(mid, x1); x <= Math.max(mid, x1); x++) {
    term.put(x, 1 + y1, '═', col, bg);
  }
  term.put(x1 + stepX, 1 + y1, stepX > 0 ? '▶' : '◀', col, bg);
}

function drawBox(g, i) {
  const { term, sim } = g;
  const n = sim.nodes, bg = PAL.bg;
  const def = NODES[n.type[i]];
  const x = n.x[i], y = 1 + n.y[i], w = n.w[i], h = n.h[i];
  const col = rgba(def.color.map((c) => c / 255));
  const full = n.queueCap[i] > 0 && n.queueCount[i] > n.queueCap[i] * 0.75;
  const border = n.state[i] === 2 ? PAL.dimmer : full ? PAL.amber : col;
  const busy = n.util[i] || 0;
  term.fill(x, y, w, h, ' ', PAL.bright, [0.03, 0.09, 0.06]);
  term.box(x, y, w, h, border, [0.03, 0.09, 0.06], true);
  // the picture (2x2 cells) and the short name
  g.big.push({ x: x + 1, y: y + 1, ch: def.kidGlyph || def.glyph, fg: col, scale: 2 });
  term.text(x + 4, y + 1, (def.kidName || def.short).padEnd(7).slice(0, 7), PAL.bright, [0.03, 0.09, 0.06]);
  // how busy: four pips in the bottom-right corner
  for (let k = 0; k < 4; k++) {
    term.put(x + w - 5 + k, y + 1, k < Math.round(pct(busy) * 4) ? '▓' : '░', k < Math.round(pct(busy) * 4) ? PAL.green : PAL.dimmer, [0.03, 0.09, 0.06]);
  }
  // the queue, drawn as the things actually standing in it: the pool keeps the packet types, so the
  // pictures on the floor of a box are the real ones (up to 11 of them, oldest first)
  const q = n.queueCount[i];
  const shown = Math.min(11, q);
  for (let k = 0; k < shown; k++) {
    const p = n.queue[i * CAP.MAX_QUEUE + ((n.queueHead[i] + k) % n.queueCap[i])];
    const t = p >= 0 ? sim.packets.type[p] : -1;
    if (t < 0) continue;
    term.put(x + 2 + k, y + h - 2, trafficKid(t).glyph, rgba(trafficKid(t).color.map((c) => c / 255)), [0.03, 0.09, 0.06]);
  }
  if (full) term.put(x + w - 3, y + h - 2, ICON.SAD, PAL.red, [0.03, 0.09, 0.06]);
  if (n.state[i] === 2) term.text(x + 2, y + h - 2, 'BROKEN', PAL.dimmer, [0.03, 0.09, 0.06]);
}

// ------------------------------------------------------------------------------ tile rail
export function kidTileRect(k, h = KID.TILE_H) {
  return { x: KID.RAIL_X, y: 1 + k * h, w: KID.RAIL_W, h };
}

function rail(g) {
  const { term, sim, level } = g;
  const tiles = kidTiles(level);
  const bg = PAL.bg;
  for (let k = 0; k < tiles.length; k++) {
    const t = tiles[k];
    const r = kidTileRect(k);
    const chosen = g.ui.placeKey === t.key;
    const afford = sim.money >= t.cost;
    const fg = chosen ? PAL.black : afford ? PAL.bright : PAL.dimmer;
    const pad = chosen ? PAL.amber : [0.04, 0.12, 0.08];
    term.fill(r.x, r.y, r.w, r.h, ' ', fg, pad);
    term.box(r.x, r.y, r.w, r.h, chosen ? PAL.amber : PAL.dim, pad, true);
    term.text(r.x + 2, r.y, chosen ? ' ▶ TAP ME ' : ` [${k + 1}] `, chosen ? PAL.black : PAL.amber, chosen ? PAL.amber : pad);
    g.big.push({ x: r.x + 2, y: r.y + 2, ch: t.glyph, fg: chosen ? PAL.white : rgba(NODES[NODE[t.key]].color.map((c) => c / 255)), scale: 2 });
    term.text(r.x + 5, r.y + 2, t.name.slice(0, 10), fg, pad);
    // which pictures this box can take
    let cx = r.x + 5;
    for (const type of t.serves) { term.put(cx, r.y + 3, trafficKid(type).glyph, chosen ? PAL.black : PAL.amber, pad); cx += 2; }
    const have = g.kidCounts ? (g.kidCounts[t.key] || 0) : 0;
    term.text(r.x + 5, r.y + 5, have ? `you have ${have}` : '', PAL.dim, pad);
    term.text(r.x + 5, r.y + 6, afford ? `${Math.floor(t.cost)} coins` : 'need more coins', afford ? PAL.amber : PAL.dimmer, pad);
    term.text(r.x + r.w - 6, r.y + 5, '▓▓', PAL.dimmer, pad);
    g.hitboxes.push({ x: r.x, y: r.y, w: r.w, h: r.h, id: 'kid-tile:' + k });
  }
}

// ------------------------------------------------------------------------------ talk strip
function strip(g) {
  const { term, sim, level } = g;
  const y = KID.STRIP_Y;
  const bg = [0.02, 0.07, 0.05];
  term.fill(0, y, KID.COLS, 6, ' ', PAL.bright, bg);
  if (g.tut && g.tut.step) { card(g, y); return; }
  const msg = g.kidMessage || kidMessage(sim, level);
  g.big.push({ x: 3, y: y + 2, ch: msg.icon, fg: msg.kind === 'missing' || msg.kind === 'full' ? PAL.amber : PAL.green, scale: 2 });
  term.text(6, y + 2, msg.text, msg.kind === 'missing' || msg.kind === 'full' ? PAL.amber : PAL.green, bg);
  if (msg.tile) term.text(6, y + 4, `tap the ${msg.tileName} tile on the right, then the board`, PAL.bright, bg);
  // what is queued up outside, in pictures
  let x = KID.COLS - 46;
  term.text(x - 12, y + 2, 'WAITING:', PAL.dim, bg);
  for (const type of trafficList(level)) {
    const q = g.kidQueue ? (g.kidQueue[type] || 0) : 0;
    term.put(x, y + 2, trafficKid(type).glyph, rgba(trafficKid(type).color.map((c) => c / 255)), bg);
    term.text(x + 2, y + 2, String(q).padStart(3, ' '), q > 0 ? PAL.bright : PAL.dimmer, bg);
    x += 8;
  }
  term.text(3, y + 5, '[SPACE] stop   [1-5] tap a tile   [ENTER] put it down   [H] help', PAL.dim, bg);
}

/** The tutorial, in five rows: a big picture, four words, and one big button. */
function card(g, y) {
  const { term, tut } = g;
  const bg = [0.02, 0.07, 0.05];
  const step = tut.step;
  const icon = (step.icons && step.icons[0]) || ICON.SMILE;
  const pad = [0.05, 0.16, 0.1];
  term.fill(2, y, KID.COLS - 4, 6, ' ', PAL.bright, pad);
  term.box(2, y, KID.COLS - 4, 6, PAL.amber, pad, true);
  g.big.push({ x: 4, y: y + 2, ch: icon, fg: PAL.amber, scale: 2 });
  const flash = tut.pending > 0 && ((g.sim.tick >> 3) & 1);
  term.text(7, y + 2, flash ? '✓ ' + step.title : step.title, PAL.bright, pad);
  term.text(7, y + 4, (step.card || []).join(' ').slice(0, 92), PAL.green, pad);
  if (step.hint) term.text(7, y + 3, step.hint.slice(0, 92), PAL.amber, pad);
  const label = step.primary === 'next' ? '▶ NEXT' : '▶ OK';
  const bx = KID.COLS - 30;
  term.text(bx, y + 2, label, PAL.black, PAL.green);
  term.text(bx, y + 4, '✕ STOP', PAL.black, [0.5, 0.25, 0.2]);
  term.text(bx + 12, y + 2, `${tut.number}/${tut.total}`, PAL.dim, pad);
  g.hitboxes.push({ x: bx - 1, y: y + 1, w: 10, h: 2, id: 'kid-next' });
  g.hitboxes.push({ x: bx - 1, y: y + 3, w: 10, h: 2, id: 'kid-stop' });
}

// ------------------------------------------------------------------------------ frame
export function drawKidFrame(g) {
  g.big = [];
  g.hitboxes = [];
  const { term } = g;
  term.clear();
  header(g);
  board(g);
  const n = g.sim.nodes;
  for (let i = 0; i < n.count; i++) if (n.state[i] !== 0) drawBox(g, i);
  rail(g);
  strip(g);
}

/** Packets become their pictures: one icon per packet, in the colour of what it is. */
export function drawKidPackets(g) {
  const { term, sim } = g;
  const P = sim.packets;
  const n = sim.nodes;
  const seen = new Set();
  for (let p = 0; p < P.max; p++) {
    if (P.state[p] !== 2) continue;
    const col = Math.floor(P.x[p]), row = Math.floor(P.y[p]);
    if (col < 0 || row < 0 || col >= KID.BOARD_W || row >= KID.BOARD_H) continue;
    const key = row * KID.COLS + col;
    if (seen.has(key)) continue;
    seen.add(key);
    let inside = false;                                  // the boxes draw their own queue: do not cover them
    for (let i = 0; i < n.count; i++) {
      if (n.state[i] === 0) continue;
      if (col >= n.x[i] && col < n.x[i] + n.w[i] && row >= n.y[i] && row < n.y[i] + n.h[i]) { inside = true; break; }
    }
    if (inside) continue;
    const t = P.type[p];
    term.put(col, 1 + row, trafficKid(t).glyph, rgba(trafficKid(t).color.map((c) => c / 255)));
  }
}

// ------------------------------------------------------------------------------ end of a play session
export function drawKidEnd(g) {
  const { term, sim, level } = g;
  const won = sim.state === 'won';
  const bg = [0.02, 0.08, 0.05];
  const w = 96, h = 30, x = (KID.COLS - w) >> 1, y = 8;
  g.big = [];
  term.fill(x, y, w, h, ' ', PAL.bright, bg);
  term.box(x, y, w, h, won ? PAL.green : PAL.amber, bg, true);
  g.big.push({ x: x + 6, y: y + 3, ch: won ? ICON.SMILE : ICON.SAD, fg: won ? PAL.green : PAL.amber, scale: 4 });
  term.text(x + 14, y + 4, won ? 'YOU DID IT!' : 'NOT YET...', won ? PAL.bright : PAL.amber, bg);
  const stars = sim.stars ? sim.stars() : 0;                 // the same stars the campaign awards
  for (let k = 0; k < 3; k++) g.big.push({ x: x + 16 + k * 5, y: y + 8, ch: '★', fg: k < stars ? PAL.amber : PAL.dimmer, scale: 3 });
  term.text(x + 14, y + 12, `${level.name}  ·  you let in ${sim.completed} things`, PAL.green, bg);
  term.text(x + 14, y + 14, won ? 'The next game is ready.' : 'Tap AGAIN to try once more.', PAL.dim, bg);
  const label = won ? '▶ NEXT GAME' : '▶ AGAIN';
  term.fill(x + 12, y + h - 6, 40, 3, ' ', PAL.black, PAL.green);
  term.text(x + 14, y + h - 5, label, PAL.black, PAL.green);
  term.text(x + 60, y + h - 5, '[ESC] home', PAL.dim, bg);
  g.hitboxes = [{ x: x + 12, y: y + h - 6, w: 40, h: 3, id: 'kid-go' }];
}

/** Where a tile's rail entry is, for the tutorial's spotlight. */
export function kidTileRow(g, key) {
  const tiles = kidTiles(g.level);
  const k = tiles.findIndex((t) => t.key === key);
  if (k < 0) return null;
  const r = kidTileRect(k);
  return [r.x, r.y, r.w, r.h];
}
