// src/render/hud.js — draws the entire game as terminal cells.
//
// Layout (160x50):
//   row  0        header: level, clock, stars, cash, reputation, errors, live packets
//   rows 1..44    board, cols 0..117 (exactly the simulation world: 118x44)
//                 right panel, cols 119..159: OBJECTIVES / FLOW / INSPECTOR / BUILD
//   rows 45..47   event log
//   row  48       notification
//   row  49       status + key hints

import { PAL, rgba, lerp, money, clock, padStart, padEnd, wrap } from './term.js';
import { NODES, NODE, TRAFFIC, TIERS, SIM, nodeCapRps } from '../sim/content.js';
import { NODE_W, NODE_H, WORLD_W, WORLD_H } from '../sim/sim.js';
import { CAP } from '../core/arena.js';

export const COLS = 160, ROWS = 50;
export const BX = 0, BY = 1;                    // board origin, world cells == board cells
export const PW = 41, PX = COLS - PW;           // right-hand panel column
export const LOG_Y = 45, HINT_Y = 49;
export const BUILD_Y = 34;                       // top of the BUILD panel
export const TITLE_MENU = { x: 23, y: 14, w: 62, step: 2 };
export const LS_MENU = { x: 28, y: 10, w: 104, step: 1 };
const TYPE_COLOR = TRAFFIC.map((t) => rgba(t.color.map((c) => c / 255)));

// --------------------------------------------------------------------------- small helpers
function nodeColor(i, sim) {
  const def = NODES[sim.nodes.type[i]];
  return rgba(def.color.map((c) => c / 255));
}
function stateGlyph(sim, i) {
  const n = sim.nodes;
  if (n.state[i] === 2) return '✕';
  if (n.state[i] === 0) return '·';
  if (sim.flushUntil[i] > sim.tick && NODE.CACHE === n.type[i]) return '↻';
  return n.queueCount[i] > n.queueCap[i] * 0.9 ? '!' : '●';
}
function insideRect(x, y, rx, ry, rw, rh) { return x >= rx && x < rx + rw && y >= ry && y < ry + rh; }
function insideAnyNode(sim, x, y) {
  const n = sim.nodes;
  for (let i = 0; i < n.count; i++) {
    if (n.state[i] === 0) continue;
    if (insideRect(x, y, n.x[i], n.y[i], n.w[i], n.h[i])) return true;
  }
  return false;
}
export function nodeAt(sim, wx, wy) {
  const n = sim.nodes;
  for (let i = 0; i < n.count; i++) {
    if (n.state[i] === 0) continue;
    if (insideRect(wx, wy, n.x[i], n.y[i], n.w[i], n.h[i])) return i;
  }
  return -1;
}
/** Nearest node to the cursor, for keyboard selection. */
export function nearestNode(sim, wx, wy) {
  const n = sim.nodes;
  let best = -1, bd = 1e9;
  for (let i = 0; i < n.count; i++) {
    if (n.state[i] === 0) continue;
    const dx = n.x[i] + n.w[i] / 2 - wx, dy = n.y[i] + n.h[i] / 2 - wy;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
/** Node in a screen direction from node i (for arrow-key wiring). */
export function nodeInDirection(sim, i, dx, dy) {
  const n = sim.nodes;
  const cx = n.x[i] + n.w[i] / 2, cy = n.y[i] + n.h[i] / 2;
  let best = -1, bs = 1e9;
  for (let j = 0; j < n.count; j++) {
    if (j === i || n.state[j] === 0) continue;
    const jx = n.x[j] + n.w[j] / 2 - cx, jy = n.y[j] + n.h[j] / 2 - cy;
    const along = jx * dx + jy * dy;
    if (along <= 4) continue;
    const perp = Math.abs(jx * dy) + Math.abs(jy * dx);
    const score = along + perp * 2.5;
    if (score < bs) { bs = score; best = j; }
  }
  return best;
}

// --------------------------------------------------------------------------- header / footer
function drawHeader(g) {
  const { term, sim } = g;
  const lv = g.level;
  term.fill(0, 0, COLS, 1, ' ', PAL.bright, PAL.head);
  term.text(1, 0, '▓ KERNEL ARCHITECT ░', PAL.bright, PAL.head);
  term.text(24, 0, `${lv.id} ${lv.name}`, PAL.green, PAL.head);

  const dur = lv.objectives.endless ? null : lv.duration;
  const tstate = sim.state === 'running' ? 'T+' : sim.state.toUpperCase() + ' ';
  const clk = dur
    ? `${tstate}${clock(sim.tick / SIM.TICK_RATE)}/${clock(dur)}`
    : `${tstate}${clock(sim.tick / SIM.TICK_RATE)}`;
  term.text(52, 0, clk, sim.tick >= sim.durationTicks && dur ? PAL.red : PAL.green, PAL.head);

  const spd = g.paused ? '‖' : g.speed + '×';
  term.text(70, 0, spd, g.paused ? PAL.amber : PAL.cyan, PAL.head);
  const st = sim.stars();
  term.text(75, 0, '★'.repeat(st) + '·'.repeat(3 - st), st ? PAL.amber : PAL.dimmer, PAL.head);

  // right-aligned live stats
  const live = sim.packets.live;
  const errPct = lv.objectives.maxErrors ? sim.dropped / lv.objectives.maxErrors : 0;
  const errCol = errPct > 0.8 ? PAL.red : errPct > 0.5 ? PAL.amber : PAL.green;
  const repCol = sim.rep < 30 ? PAL.red : sim.rep < 60 ? PAL.amber : PAL.green;
  let x = COLS - 2;
  const field = (str, col) => { x -= str.length; term.text(x, 0, str, col, PAL.head); x -= 2; };
  field(`LIVE ${live}`, live > 1500 ? PAL.amber : PAL.cyan);
  field(`ERR ${sim.dropped}/${lv.objectives.maxErrors}`, errCol);
  field(`REP ${Math.round(sim.rep)}`, repCol);
  field(`UP $${sim.upkeep.toFixed(1)}/s`, sim.money < 0 ? PAL.red : PAL.dim);
  field(`$${money(sim.money)}`, sim.money < 60 ? PAL.amber : PAL.green);
}

function drawStatusBar(g) {
  const { term, sim } = g;
  term.fill(0, HINT_Y, COLS, 1, ' ', PAL.bright, PAL.head);
  const mode = g.ui.placeKey ? `BUILD ${g.ui.placeKey}` : g.ui.wireFrom >= 0 ? 'WIRE: choose target' : g.ui.sel >= 0 ? `SEL #${g.ui.sel}` : 'IDLE';
  term.text(1, HINT_Y, mode.padEnd(20), PAL.bright, PAL.head);
  const hints = g.ui.placeKey
    ? '[←↑↓→] move  [ENTER] place  [ESC] cancel'
    : g.ui.wireFrom >= 0
      ? '[←↑↓→] target  [ENTER] connect  [ESC] cancel'
      : '[1-9,0] build  [CLICK] select  [W] wire  [U] grade  [X] sell  [A] auto  [H] help';
  term.text(23, HINT_Y, hints, PAL.green, PAL.head);
  let x = COLS - 2;
  const put = (s, c) => { x -= s.length; term.text(x, HINT_Y, s, c, PAL.head); x -= 1; };
  const ms = g.perfMs ? g.perfMs.toFixed(2) + 'ms/tk' : '';
  if (ms) put(ms, g.perfMs > 12 ? PAL.amber : PAL.dim);
  put(`SEED ${g.seedHex}`, PAL.dim);
  put(g.hashHex || '', PAL.dimmer);
}

// --------------------------------------------------------------------------- board
function drawGrid(g) {
  const { term } = g;
  for (let y = BY + 2; y < BY + WORLD_H; y += 4) {
    for (let x = 3; x < WORLD_W; x += 6) {
      // keep the grid out of node boxes so it never muddies a readout
      if (insideAnyNode(g.sim, x, y)) continue;
      term.put(x, y, '·', PAL.dimmer);
    }
  }
}

function drawLinks(g) {
  const { term, sim } = g;
  const n = sim.nodes;
  for (const [a, b] of sim.links()) {
    const ax = n.x[a] + 7, ay = n.y[a] + 2, bx = n.x[b] + 7, by = n.y[b] + 2;
    const dirY = Math.sign(by - ay), dirX = Math.sign(bx - ax);
    const hi = g.ui.flow ? flowHighlight(g, a, b) : null;
    const col = hi === 2 ? PAL.amber : hi === 1 ? PAL.bright : PAL.dim;
    // vertical leg, source x -> target y
    if (dirY) for (let y = ay; y !== by; y += dirY) {
      if (insideAnyNode(sim, ax, y)) continue;
      term.put(ax, y, '│', col);
    }
    // corner
    if (dirY && dirX) {
      const corner = dirY > 0 ? (dirX > 0 ? '└' : '┘') : (dirX > 0 ? '┌' : '┐');
      if (!insideAnyNode(sim, ax, by)) term.put(ax, by, corner, col);
    }
    // horizontal leg
    if (dirX) for (let x = ax; x !== bx; x += dirX) {
      if (insideAnyNode(sim, x, by)) continue;
      term.put(x, by, '─', col);
    }
    // direction arrow entering the target
    if (dirX) {
      const ax2 = dirX > 0 ? n.x[b] - 1 : n.x[b] + n.w[b];
      if (!insideAnyNode(sim, ax2, by)) term.put(ax2, by, dirX > 0 ? '▶' : '◀', hi === 2 ? PAL.amber : PAL.bright);
    } else if (dirY) {
      const ay2 = dirY > 0 ? n.y[b] - 1 : n.y[b] + n.h[b];
      if (!insideAnyNode(sim, bx, ay2)) term.put(bx, ay2, dirY > 0 ? '▼' : '▲', hi === 2 ? PAL.amber : PAL.bright);
    }
  }
}

/** 2 = link carries the selected traffic type toward a server, 1 = partially, 0 = dead end. */
function flowHighlight(g, a, b) {
  const sim = g.sim, t = g.ui.flowType;
  const k0 = (t * CAP.MAX_NODES + b) * 2;
  const post = sim.reach[k0 + 1] >= 0 || NODES[sim.nodes.type[b]].serves.includes(t);
  const pre = sim.reach[k0 + 0] >= 0;
  if (post) return 2;
  if (pre) return 1;
  return 0;
}

function drawNode(g, i) {
  const { term, sim } = g;
  const n = sim.nodes, def = NODES[n.type[i]];
  const x = n.x[i], y = n.y[i], w = n.w[i], h = n.h[i];
  const sel = g.ui.sel === i;
  const hov = g.ui.hover === i;
  const down = n.state[i] === 2;
  const flush = !down && sim.flushUntil[i] > sim.tick;
  const defc = nodeColor(i, sim);
  const util = Math.max(0, Math.min(1.4, n.util[i]));
  const qFrac = n.queueCount[i] / n.queueCap[i];
  const crit = qFrac > 0.9;
  let border = lerp(defc, PAL.bright, sel ? 0.45 : hov ? 0.2 : 0);
  if (down) border = PAL.red;
  else if (flush) border = PAL.amber;
  else if (crit) {
    const blink = (sim.tick >> 4) & 1;
    border = blink ? PAL.red : lerp(defc, PAL.white, 0.3);
  }

  term.box(x, y, w, h, border, PAL.bg, sel);
  if (sel) { term.put(x - 1, y - 1, '◆', PAL.magenta); term.put(x + w, y + h, '◆', PAL.magenta); term.put(x + w, y - 1, '◆', PAL.magenta); term.put(x - 1, y + h, '◆', PAL.magenta); }

  // title row: glyph + short name, tier and status on the right
  term.fill(x + 1, y, w - 2, 1, ' ', PAL.dim, PAL.bg);
  const title = def.short;
  term.put(x + 1, y, def.glyph, lerp(defc, PAL.white, 0.35));
  term.text(x + 3, y, title, defc);
  const right = TIERS[n.tier[i]].name + (n.inst[i] > 1 ? '×' + n.inst[i] : '');
  term.field(x + w - 1 - right.length, y, right, right.length, PAL.violet);
  const sglyph = stateGlyph(sim, i);
  term.put(x + w - 2 - right.length, y, sglyph, down ? PAL.red : crit ? PAL.red : qFrac > 0.6 ? PAL.amber : PAL.green);

  if (down) {
    term.fill(x + 1, y + 1, w - 2, h - 2, '▒', rgba(PAL.red, 0.55));
    term.field(x + 1, y + 1, ' DOWn ' + Math.max(0, Math.ceil((sim.downUntil[i] - sim.tick) / SIM.TICK_RATE)) + 's ', w - 2, PAL.red, PAL.bg, 'center');
    return;
  }
  if (flush) {
    term.fill(x + 1, y + 1, w - 2, h - 2, '░', rgba(PAL.amber, 0.5));
    term.field(x + 1, y + 1, ' CACHE FLUSH ', w - 2, PAL.amber, PAL.bg, 'center');
    return;
  }

  // load bar + percentage
  const barW = w - 6;
  const uCol = util > 1.05 ? PAL.red : util > 0.85 ? PAL.amber : rgg(util);
  term.bar(x + 1, y + 1, barW, Math.min(1, util), uCol, PAL.bg);
  term.field(x + 1 + barW, y + 1, `${Math.min(999, Math.round(util * 100))}%`, 4, uCol, PAL.bg, 'right');

  // queue row
  const q = `${n.queueCount[i]}`.padStart(3);
  const qc = `${n.queueCap[i]}`.padStart(3);
  const qCol = crit ? PAL.red : qFrac > 0.6 ? PAL.amber : PAL.dim;
  term.text(x + 1, y + 2, 'q', qCol);
  term.text(x + 3, y + 2, `${q}/${qc}`, qCol);
  if (n.auto[i]) term.text(x + 11, y + 2, '⤢' + (n.pending[i] ? '+' + n.pending[i] : ''), PAL.violet);
  else if (n.dropped[i]) term.text(x + 11, y + 2, '✕' + short(n.dropped[i]), PAL.red);

  // bottom border with a one-word counter
  const label = def.role === 'source' ? ` out ${short(n.served[i])} `
    : def.serves.length ? ` ✓ ${short(n.done[i])} ` : ` → ${short(n.served[i])} `;
  term.text(x + 2, y + 3, label, rgba(PAL.green, 0.75));
}

function rgg(u) { return lerp(PAL.green, PAL.bright, Math.max(0, Math.min(1, u))); }
function short(v) {
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 10000) return Math.round(v / 1000) + 'k';
  return String(v);
}

// --------------------------------------------------------------------------- right panels
function panelObjectives(g, y, h) {
  const { term, sim } = g;
  term.panel(PX, y, PW, h, 'OBJECTIVES');
  const o = g.level.objectives;
  const x = PX + 2, w = PW - 4;
  let r = y + 1;
  const goal = sim.goalPct();
  term.text(x, r, 'GOAL', PAL.dim);
  term.bar(x + 6, r, w - 6 - 5, goal, goal >= 1 ? PAL.amber : PAL.green);
  term.field(PX + PW - 2 - 4, r, `${Math.round(goal * 100)}%`, 4, PAL.bright, PAL.bg, 'right');
  r++;
  if (o.endless) {
    term.text(x, r, `DONE    ${sim.completed}`.padEnd(w), PAL.bright);
  } else {
    term.text(x, r, `DONE`, PAL.dim); term.field(x + 8, r, money(sim.completed), 8, PAL.bright);
    term.text(x + 18, r, `OF`, PAL.dim); term.field(x + 21, r, money(o.complete), 8, PAL.bright);
  }
  r++;
  const ef = o.maxErrors ? sim.dropped / o.maxErrors : 0;
  term.text(x, r, 'ERRORS', PAL.dim);
  term.text(x + 8, r, `${sim.dropped}`.padStart(5), ef > 0.8 ? PAL.red : ef > 0.5 ? PAL.amber : PAL.green);
  term.text(x + 14, r, o.endless ? '' : `/ ${o.maxErrors}`.padEnd(7), PAL.dim);
  term.bar(x + 22, r, w - 22, ef, ef > 0.8 ? PAL.red : PAL.amber);
  r++;
  term.text(x, r, 'REPUT.', PAL.dim);
  term.bar(x + 8, r, w - 8 - 5, sim.rep / 100, sim.rep < 30 ? PAL.red : sim.rep < 60 ? PAL.amber : PAL.green);
  term.field(PX + PW - 2 - 4, r, `${Math.round(sim.rep)}`, 4, PAL.bright, PAL.bg, 'right');
  r++;
  const s = g.level.stars || {};
  term.text(x, r, `★ ${s.errors2} errors   ★ ${s.sloMs}ms p99`, 0 ? PAL.bright : PAL.dim);
  return y + h;
}

function panelFlow(g, y, h) {
  const { term, sim } = g;
  const mon = sim.firstNodeOfType(NODE.MONITOR) >= 0;
  term.panel(PX, y, PW, h, 'FLOW' + (mon ? '' : ' — NO MONITORING'));
  const x = PX + 2, w = PW - 4;
  let r = y + 1;
  term.text(x, r, `IN FLIGHT ${padStart(sim.packets.live, 5)}`, PAL.cyan);
  term.text(x + 18, r, `PEAK ${padStart(sim.packets.peak, 5)}`, PAL.dim);
  r++;
  const thru = sim.tick ? (sim.completed * SIM.TICK_RATE / Math.max(1, sim.tick)) : 0;
  term.text(x, r, `DONE/S`, PAL.dim); term.field(x + 7, r, thru.toFixed(1), 6, PAL.green);
  term.text(x + 15, r, `DROPS`, PAL.dim); term.field(x + 21, r, `${sim.dropped}`, 6, sim.dropped ? PAL.red : PAL.dim);
  r++;
  if (mon) {
    const p50 = sim.p50(), p99 = sim.p99();
    const slo = g.level.stars.sloMs || 500;
    term.text(x, r, `p50 ${p50.toFixed(0)}ms`, p50 > slo ? PAL.amber : PAL.green);
    term.text(x + 14, r, `p99 ${p99.toFixed(0)}ms`, p99 > slo ? PAL.red : PAL.green);
    term.text(x + 29, r, `SLO ${slo}`, p99 > slo ? PAL.red : PAL.dim);
    r++;
    term.text(x, r, 'DROPS BY REASON', PAL.dim);
    r++;
    const reasons = ['NO ROUTE', '504', 'QUEUE FULL', 'DOWN', 'SHED'];
    for (let k = 0; k < reasons.length; k++) {
      const v = sim.dropByReason[k + 1];
      term.text(x, r, reasons[k].padEnd(11), v ? PAL.red : PAL.dimmer);
      term.field(x + 12, r, `${v}`, 6, v ? PAL.red : PAL.dimmer);
      term.bar(x + 19, r, w - 19, Math.min(1, v / Math.max(20, sim.dropped)), PAL.red);
      r++;
    }
  } else {
    term.text(x, r, 'Place an ◦ MONITORING node to', PAL.dimmer); r++;
    term.text(x, r, 'unlock latency, queue and drop', PAL.dimmer); r++;
    term.text(x, r, 'telemetry for the whole fleet.', PAL.dimmer); r++;
  }
  // traffic legend with live rates
  r++;
  term.text(x, r, 'TRAFFIC            IN/s   DONE   ERR', PAL.dim); r++;
  for (let t = 0; t < TRAFFIC.length; t++) {
    if (r >= y + h - 1) break;
    const col = TYPE_COLOR[t];
    term.put(x, r, TRAFFIC[t].glyph, col);
    term.text(x + 2, r, TRAFFIC[t].key.padEnd(9), col);
    term.field(x + 12, r, sim.rateNow[t].toFixed(0), 6, PAL.dim);
    term.field(x + 18, r, short(sim.doneByType[t]), 7, PAL.green);
    term.field(x + 25, r, short(sim.dropByType[t]), 5, sim.dropByType[t] ? PAL.red : PAL.dimmer);
    r++;
  }
  return y + h;
}

function panelInspector(g, y, h) {
  const { term, sim } = g;
  term.panel(PX, y, PW, h, 'INSPECTOR');
  const x = PX + 2, w = PW - 4;
  let r = y + 1;
  const i = g.ui.sel;
  if (i < 0 || i >= sim.nodes.count || sim.nodes.state[i] === 0) {
    term.text(x, r, 'Click a node to inspect it.', PAL.dimmer);
    r += 2;
    term.text(x, r++, 'Every box has a job:', PAL.dim);
    term.text(x, r++, 'sources make traffic, transit', PAL.dimmer);
    term.text(x, r++, 'boxes pass it on, sinks', PAL.dimmer);
    term.text(x, r++, 'complete it, monitors watch.', PAL.dimmer);
    term.text(x, r++, 'Wires only point one way.', PAL.dimmer);
    term.text(x, r++, 'Right-click cancels the', PAL.dimmer);
    term.text(x, r++, 'current mode.', PAL.dimmer);
    return y + h;
  }
  const n = sim.nodes, def = NODES[n.type[i]], info = sim.nodeInfo(i);
  const dc = nodeColor(i, sim);
  term.put(x, r, def.glyph, dc);
  term.text(x + 2, r, def.name, lerp(dc, PAL.white, 0.3));
  term.field(PX + PW - 2 - 10, r, `${TIERS[n.tier[i]].name} ${info.down ? 'DOWN' : info.inst > 1 ? 'x' + info.inst : 'UP'}`, 10,
    info.down ? PAL.red : PAL.bright, PAL.bg, 'right');
  r++;
  const cap = info.capRps;
  term.text(x, r, 'CAP', PAL.dim); term.text(x + 5, r, `${cap}/s`, PAL.bright);
  term.text(x + 15, r, 'LOAD', PAL.dim); term.text(x + 20, r, `${Math.round(info.util * 100)}%`, info.util > 0.9 ? PAL.red : PAL.green);
  r++;
  term.text(x, r, 'QUEUE', PAL.dim);
  term.text(x + 7, r, `${info.q}/${info.qCap}`, info.q > info.qCap * 0.8 ? PAL.red : PAL.bright);
  term.text(x + 20, r, `PEAK ${info.peakQ}`, PAL.dim);
  r++;
  term.text(x, r, `SERVED ${short(info.done)}`, PAL.green);
  term.text(x + 18, r, `DROPPED ${short(info.dropped)}`, info.dropped ? PAL.red : PAL.dim);
  r++;
  term.text(x, r, `UPKEEP $${info.upkeep.toFixed(2)}/s`, PAL.dim);
  term.text(x + 20, r, n.auto[i] ? 'AUTOSCALE ON' : 'AUTOSCALE OFF', n.auto[i] ? PAL.violet : PAL.dimmer);
  r++;
  if (def.serves.length) {
    term.text(x, r, 'SERVES', PAL.dim);
    let cx = x + 7;
    for (const t of def.serves) { term.put(cx, r, TRAFFIC[t].glyph, TYPE_COLOR[t]); cx += 2; term.text(cx, r, TRAFFIC[t].key, TYPE_COLOR[t]); cx += TRAFFIC[t].key.length + 1; }
    r++;
  }
  if (NODE.CACHE === n.type[i]) {
    term.text(x, r, `HIT RATE ${(info.hitRate * 100).toFixed(0)}% (aim ${(info.hitRateAim * 100).toFixed(0)}%)`, PAL.amber);
    r++;
  }
  const outs = [];
  for (let k = 0; k < n.outCount[i]; k++) { const v = n.outs[i * CAP.MAX_OUT + k]; if (v >= 0) outs.push(NODES[n.type[v]].short); }
  term.text(x, r, 'OUT ▸ ' + (outs.join(' ') || '(none)').slice(0, w - 6), outs.length ? PAL.cyan : PAL.red);
  r++;
  const ins = [];
  for (let k = 0; k < n.inCount[i]; k++) { const v = n.ins[i * CAP.MAX_OUT + k]; if (v >= 0) ins.push(NODES[n.type[v]].short); }
  term.text(x, r, 'IN  ◂ ' + (ins.join(' ') || '(none)').slice(0, w - 6), PAL.dim);
  r++;
  const up = info.upgradeCost;
  term.text(x, r, `[U] grade $${up}`, sim.money >= up && n.tier[i] < 2 ? PAL.bright : PAL.dimmer);
  term.text(x + 18, r, '[W] wire', PAL.bright);
  term.text(x + 28, r, '[X] sell', PAL.bright);
  r++;
  if (def.autoMax && n.type[i] !== undefined) { term.text(x, r, `[A] autoscale (max ${def.autoMax})`, def.autoMax ? PAL.violet : PAL.dimmer); r++; }
  for (const line of wrap(def.hint, w, 2)) { term.text(x, r, line, PAL.dimmer); r++; }
  return y + h;
}

function panelBuild(g, y, h) {
  const { term, sim } = g;
  term.panel(PX, y, PW, h, `BUILD  $${money(sim.money)}`);
  const list = g.level.unlock || [];
  const x = PX + 2, w = PW - 4;
  let r = y + 1;
  for (let k = 0; k < list.length; k++) {
    if (r >= y + h - 1) {
      term.text(x, r, `… ${list.length - k} more (TAB to cycle)`, PAL.dimmer);
      break;
    }
    const key = NODE[list[k]];
    const def = NODES[key];
    const afford = sim.money >= def.cost;
    const chosen = g.ui.placeKey === list[k];
    const hot = g.ui.buildIdx === k;
    const fg = afford ? rgba(def.color.map((c) => c / 255)) : PAL.dimmer;
    if (chosen) term.fill(PX + 1, r, PW - 2, 1, ' ', PAL.black, PAL.green);
    term.text(x, r, hot ? '▸' : ' ', PAL.amber, chosen ? PAL.green : PAL.panel);
    term.text(x + 1, r, k < 10 ? String((k + 1) % 10) : '·', afford ? PAL.bright : PAL.dimmer, chosen ? PAL.green : PAL.panel);
    term.put(x + 3, r, def.glyph, chosen ? PAL.black : fg, chosen ? PAL.green : PAL.panel);
    term.text(x + 5, r, def.short.padEnd(6), chosen ? PAL.black : afford ? PAL.bright : PAL.dimmer, chosen ? PAL.green : PAL.panel);
    term.field(x + 12, r, `$${def.cost}`, 6, chosen ? PAL.black : afford ? PAL.green : PAL.red, chosen ? PAL.green : PAL.panel);
    const cap = nodeCapRps(key, 0, 1);
    term.field(x + 18, r, `${cap}/s`.padEnd(8), 8, chosen ? PAL.black : PAL.dim, chosen ? PAL.green : PAL.panel);
    term.field(x + 27, r, `q${def.queue}`.padEnd(7), 7, chosen ? PAL.black : PAL.dim, chosen ? PAL.green : PAL.panel);
    if (def.serves.length) {
      let cx = PX + PW - 3;
      for (const t of def.serves) { term.put(cx, r, TRAFFIC[t].glyph, chosen ? PAL.black : TYPE_COLOR[t], chosen ? PAL.green : PAL.panel); cx -= 2; }
    }
    r++;
  }
  if (g.ui.note) term.field(x, y + h - 2, '⚠ ' + g.ui.note, w, PAL.amber);
  return y + h;
}

// --------------------------------------------------------------------------- log / notifications
export function drawLog(g) {
  const { term, sim } = g;
  term.fill(0, LOG_Y, WORLD_W, 4, ' ', PAL.dim, PAL.bg);
  const lines = sim.log.slice(-3);
  for (let k = 0; k < lines.length; k++) {
    const e = lines[k];
    const col = /ATTACK|DOWN|NOTHING ROUTES|BLOwN|BANKRUPT|ZERO/i.test(e.msg) ? PAL.red
      : /scaled|flush|burst|spike|CRASH|swarm|storm|wakes/i.test(e.msg) ? PAL.amber : PAL.dim;
    term.text(1, LOG_Y + k, clock(e.t / SIM.TICK_RATE) + '  ' + e.msg.slice(0, WORLD_W - 12), col);
  }
  if (g.toast) {
    const fade = (g.toast.until - sim.tick) / 180;
    const blink = sim.tick & 8 ? 1 : 0.6;
    term.fill(0, LOG_Y + 3, WORLD_W, 1, ' ', PAL.bright, rgba(PAL.green, 0.12));
    term.text(1, LOG_Y + 3, ('▸ ' + g.toast.msg).slice(0, WORLD_W - 2), rgba(PAL.bright, lerp(0, 1, Math.min(1, fade)) * blink));
  }
}

function drawCursor(g) {
  const { term, sim } = g;
  const ui = g.ui;
  if (ui.placeKey) {
    const key = NODE[ui.placeKey];
    const chk = sim.canPlaceAt(ui.placeKey, ui.cursorX, ui.cursorY);
    const col = chk.ok ? PAL.cyan : PAL.red;
    term.box(ui.cursorX, ui.cursorY, NODE_W, NODE_H, col, PAL.bg);
    term.field(ui.cursorX + 1, ui.cursorY + 1, ' ' + NODES[key].glyph + ' ' + NODES[key].short + ' ', NODE_W - 2, col, PAL.bg, 'center');
    term.field(ui.cursorX + 1, ui.cursorY + 2, chk.ok ? `$${NODES[key].cost}` : chk.err, NODE_W - 2, chk.ok ? PAL.green : PAL.red, PAL.bg, 'center');
  }
  if (ui.wireFrom >= 0) {
    const n = sim.nodes, a = ui.wireFrom;
    const ax = n.x[a] + 7, ay = n.y[a] + 2;
    const tgt = ui.wireTo >= 0 ? ui.wireTo : nearestNode(sim, ui.cursorX, ui.cursorY);
    term.box(n.x[a] - 1, n.y[a] - 1, n.w[a] + 2, n.h[a] + 2, PAL.magenta, PAL.bg);
    if (tgt >= 0 && tgt !== a) {
      const bx = n.x[tgt] + 7, by = n.y[tgt] + 2;
      const dash = '┄';
      const dirX = Math.sign(bx - ax), dirY = Math.sign(by - ay);
      const linked = sim.nodes.outs[a * CAP.MAX_OUT] !== undefined && (() => {
        for (let k = 0; k < n.outCount[a]; k++) if (n.outs[a * CAP.MAX_OUT + k] === tgt) return true;
        return false;
      })();
      const col = linked ? PAL.dim : PAL.magenta;
      if (dirY) for (let y = ay; y !== by; y += dirY) if (!insideAnyNode(sim, ax, y)) term.put(ax, y, '┆', col);
      if (dirX) for (let x = ax; x !== bx; x += dirX) if (!insideAnyNode(sim, x, by)) term.put(x, by, dash, col);
      term.box(n.x[tgt] - 1, n.y[tgt] - 1, n.w[tgt] + 2, n.h[tgt] + 2, col, PAL.bg);
      term.field(n.x[tgt] + 1, n.y[tgt] + NODE_H, linked ? ' already wired ' : ' [ENTER] wire ', NODE_W - 2, col, PAL.bg, 'center');
    }
  }
}

// --------------------------------------------------------------------------- overlays
function overlayFrame(term, title, w = 96, h = 34, ax = null, ay = null) {
  const x = ax === null ? (COLS - w) >> 1 : ax;
  const y = ay === null ? (ROWS - h) >> 1 : ay;
  term.fill(x, y, w, h, ' ', PAL.bright, [0.01, 0.05, 0.03]);
  term.box(x, y, w, h, PAL.green, [0.01, 0.05, 0.03], true);
  if (title) {
    const t = ` ${title} `;
    term.text(x + ((w - t.length) >> 1), y, t, PAL.bright, [0.01, 0.05, 0.03]);
  }
  return { x, y, w, h };
}

export function drawHelp(g) {
  const { term } = g;
  const page = g.ui.helpPage % 3;
  term.clear();
  const { x, y, w, h } = overlayFrame(term, `HELP ${page + 1}/3 — [←/→] page  [ESC] close`, COLS - 4, ROWS - 2);
  const bg = [0.01, 0.05, 0.03];
  const lx = x + 3;
  let r = y + 2;
  if (page === 0) {
    const keys = [
      ['MOUSE CLICK', 'select a node, click a build item, click the board to place'],
      ['1-9, 0 / TAB', 'pick a build item from the BUILD panel'],
      ['ARROWS / WASD', 'move the placement cursor or walk the selection between nodes'],
      ['ENTER', 'place the selected box at the cursor (or confirm a wire)'],
      ['W', 'wire mode: pick a source, then a target, then ENTER'],
      ['U / X', 'upgrade the selected node to the next tier / sell it'],
      ['A', 'toggle autoscaling on the selected node'],
      ['SPACE', 'pause. The sim only advances on ticks: pause to think.'],
      ['= / -', 'run at 1x, 2x, 4x, 8x speed'],
      ['L', 'flow overlay: which links can still reach a server ([/] cycle type)'],
      ['C / M', 'CRT filter / mute'],
      ['R / Q', 'restart the shift / abandon it and go back to the level list'],
    ];
    term.text(lx, r++, 'CONTROLS', PAL.bright, bg);
    for (const [k, d] of keys) { term.text(lx + 2, r, k.padEnd(16), PAL.cyan, bg); term.text(lx + 19, r, d.slice(0, w - 24), PAL.green, bg); r++; }
    r++;
    term.text(lx, r++, 'THE LOOP', PAL.bright, bg);
    const para = [
      'Traffic spawns at the INTERNET and walks the graph you build. Every packet needs a node that can',
      'COMPLETE its type: a READ needs a cache hit or a database, a STATIC request needs a CDN or object',
      'storage, a SEARCH needs a search index, an ATTACK needs a firewall. If it cannot reach one it is',
      'dropped (NO ROUTE), and every drop costs reputation. Nodes only accept traffic that has already',
      'passed through an APP SERVER (the edge boxes are the exception).',
      '',
      'Queues are the real game: a node serves at a fixed requests/sec, and anything faster than that',
      'piles up in its queue. A queue that fills up drops whatever arrives next. A packet that spends',
      'more than 7 seconds in queues dies with a 504. So: add capacity before the queue, not after it.',
      '',
      'Money comes from completed requests only, minus upkeep. Reputation falls with every drop and',
      'recovers slowly. Win the objective before the clock and before the error budget runs out.',
    ];
    for (const p of para) term.text(lx, r++, p, PAL.green, bg);
  } else if (page === 1) {
    term.text(lx, r++, 'NODES — cost, per-second capacity, queue depth, what they complete', PAL.bright, bg);
    term.text(lx + 2, r, 'NODE'.padEnd(16) + 'COST'.padStart(6) + 'CAP/s'.padStart(8) + 'QUEUE'.padStart(7) + '  UPKEEP   COMPLETES', PAL.cyan, bg); r++;
    for (const def of NODES) {
      term.text(lx + 2, r, (def.glyph + ' ' + def.name).padEnd(16), rgba(def.color.map((c) => c / 255)), bg);
      term.text(lx + 18, r, `$${def.cost}`.padStart(6), PAL.green, bg);
      term.text(lx + 24, r, `${def.cap}`.padStart(8), PAL.green, bg);
      term.text(lx + 32, r, `${def.queue}`.padStart(7), PAL.green, bg);
      term.text(lx + 40, r, `$${def.upkeep.toFixed(1)}/s`.padStart(10), PAL.dim, bg);
      const serves = def.serves.map((t) => TRAFFIC[t].key).join(' ');
      term.text(lx + 52, r, (serves || '— ' + def.role).slice(0, w - (lx - x) - 54), serves ? PAL.amber : PAL.dimmer, bg);
      r++;
    }
  } else {
    term.text(lx, r++, 'TRAFFIC — what each request wants, and what serves it', PAL.bright, bg);
    for (const t of TRAFFIC) {
      term.put(lx + 2, r, t.glyph, TYPE_COLOR[t.id], bg);
      term.text(lx + 4, r, t.key.padEnd(10), rgba(t.color.map((c) => c / 255)), bg);
      term.text(lx + 15, r, `$${t.revenue.toFixed(2)}`.padEnd(7), PAL.green, bg);
      const servers = NODES.filter((n) => n.serves.includes(t.id)).map((n) => n.short).join(' ');
      term.text(lx + 23, r, (servers || 'nothing serves this').padEnd(22).slice(0, 22), servers ? PAL.bright : PAL.red, bg);
      term.text(lx + 46, r, t.hint.slice(0, w - (lx - x) - 48), PAL.dim, bg);
      r++;
    }
    r++;
    term.text(lx, r++, 'READING THE BOARD', PAL.bright, bg);
    const lines = [
      'The bar inside a box is its utilisation; the number below it is queue depth vs capacity.',
      'Red blinking border = the queue is 90% full. It is about to drop traffic: fix it before it does.',
      'Press L to overlay the flow field. Amber links still lead to a node that can serve the selected',
      'traffic type; dim links are dead ends that will be dropped at the node they point to.',
      'Autoscaling (A) boots extra instances while utilisation is over 75% and pays 30% of the node cost',
      'per instance, with a 3 second cold start. It scales back in after 7 quiet seconds.',
      'Tiers: T2 is 2.2x capacity and 1.5x queue for 60% more money, T3 is 4.4x capacity.',
      '',
      'ENDLESS keeps ramping until the wheels come off. Your score is requests completed.',
      'DAILY is a fixed seed: the same traffic and the same incidents for everyone, all day.',
    ];
    for (const l of lines) term.text(lx, r++, l, PAL.green, bg);
  }
  term.text(x + 3, y + h - 2, '[ESC] back', PAL.dim, bg);
}

export function drawPostmortem(g) {
  const { term, sim } = g;
  const won = sim.state === 'won';
  // anchored over the board: the panels on the right stay readable next to the result
  const { x, y, w, h } = overlayFrame(term, won ? 'SHIFT COMPLETE' : 'POSTMORTEM', WORLD_W - 8, WORLD_H - 4, 4, 2);
  const bg = [0.01, 0.05, 0.03];
  const lx = x + 3;
  let r = y + 2;
  const banner = won ? '  ✓ ' + sim.reason + ' ' : '  ✕ ' + sim.reason + ' ';
  term.fill(x + 2, r, w - 4, 3, ' ', PAL.black, won ? PAL.green : PAL.red);
  term.text(x + ((w - banner.length) >> 1), r + 1, banner, won ? PAL.black : PAL.black, won ? PAL.green : PAL.red);
  r += 4;
  if (won) {
    const st = sim.stars();
    term.text(lx, r, '★'.repeat(st) + '·'.repeat(3 - st), PAL.amber, bg);
    term.text(lx + 8, r, `${st === 3 ? 'PERFECT SHIFT' : st === 2 ? 'clean and fast' : 'objectives met'}`, PAL.bright, bg);
  }
  r++;
  const rows = [
    ['REQUESTS SERVED', `${sim.completed}` + (g.level.objectives.endless ? '' : ` / ${g.level.objectives.complete}`)],
    ['DROPPED', `${sim.dropped}` + (g.level.objectives.maxErrors ? `  (budget ${g.level.objectives.maxErrors}, used ${Math.round(100 * sim.dropped / g.level.objectives.maxErrors)}%)` : '')],
    ['REPUTATION', `${Math.round(sim.rep)} / 100`],
    ['CASH', `$${money(sim.money)}   earned $${money(sim.income)}  spent $${money(sim.spent)}  upkeep $${money(sim.upkeepPaid)}`],
    ['LATENCY', `p50 ${sim.p50().toFixed(0)}ms   p99 ${sim.p99().toFixed(0)}ms   peak in flight ${sim.packets.peak}`],
    ['SHIFT', `${clock(sim.tick / SIM.TICK_RATE)} of ${g.level.objectives.endless ? '—' : clock(g.level.duration)}   seed ${g.seedHex}`],
    ['STATE HASH', (g.hashHex && g.hashHex !== '--------' ? g.hashHex : (sim.hash() >>> 0).toString(16).toUpperCase().padStart(8, '0')) + '  (same seed + same moves = same hash)'],
  ];
  for (const [k, v] of rows) { term.text(lx, r, k.padEnd(16), PAL.cyan, bg); term.text(lx + 17, r, v, PAL.green, bg); r++; }
  r++;
  const pm = sim.postmortem();
  term.text(lx, r++, 'WHAT WENT WRONG', PAL.bright, bg);
  if (!pm.reasons.length) term.text(lx + 2, r++, 'Nothing dropped. Whatever you did, do it again.', PAL.green, bg);
  for (const q of pm.reasons) {
    term.text(lx + 2, r, q.reason.padEnd(14), PAL.red, bg);
    term.text(lx + 17, r, `${q.n}`, PAL.red, bg);
    term.bar(lx + 24, r, 40, q.n / Math.max(1, pm.reasons[0].n), PAL.red, bg);
    r++;
  }
  for (const wp of pm.worst) {
    term.text(lx + 2, r, `${wp.short} (${TIERS[wp.tier].name})`, PAL.amber, bg);
    term.text(lx + 22, r, `${wp.drops} drops, peak queue ${wp.peakQ}/${wp.qCap}`, PAL.green, bg);
    r++;
  }
  r++;
  for (const a of pm.advice.slice(0, 3)) {
    for (const line of wrap(a, w - 8, 2)) term.text(lx + 2, r++, line, PAL.bright, bg);
  }
  const hint = won ? '[ENTER] next shift   [R] replay   [Q] level list' : '[ENTER] retry   [H] help   [Q] level list';
  term.fill(x + 1, y + h - 1, w - 2, 1, ' ', PAL.bright, PAL.head);
  term.text(x + 3, y + h - 1, hint, PAL.bright, PAL.head);
}

export function drawTitle(g) {
  const { term } = g;
  term.clear();
  const bg = PAL.bg;
  const art = [
    ' ██╗  ██╗███████╗██████╗ ███╗   ██╗███████╗██╗         █████╗ ██████╗  ██████╗██╗  ██╗██╗████████╗███████╗ ██████╗████████╗',
    ' ██║ ██╔╝██╔════╝██╔══██╗████╗  ██║██╔════╝██║        ██╔══██╗██╔══██╗██╔════╝██║  ██║██║╚══██╔══╝██╔════╝██╔════╝╚══██╔══╝',
    ' █████╔╝ █████╗  ██████╔╝██╔██╗ ██║█████╗  ██║        ███████║██████╔╝██║     ███████║██║   ██║   █████╗  ██║        ██║',
    ' ██╔═██╗ ██╔══╝  ██╔══██╗██║╚██╗██║██╔══╝  ██║        ██╔══██║██╔══██╗██║     ██╔══██║██║   ██║   ██╔══╝  ██║        ██║',
    ' ██║  ██╗███████╗██║  ██║██║ ╚████║███████╗███████╗   ██║  ██║██║  ██║╚██████╗██║  ██║██║   ██║   ███████╗╚██████╗   ██║',
    ' ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝   ╚═╝   ╚══════╝ ╚═════╝   ╚═╝',
  ];
  const tw = 122, tx = (COLS - tw) >> 1;
  for (let k = 0; k < art.length; k++) term.text(tx, 2 + k, art[k].slice(0, tw), lerp(PAL.green, PAL.bright, 0.3 - k * 0.04), bg);
  term.text(tx, 9, 'a systems game about queues, capacity and keeping the pager quiet'.padEnd(tw), PAL.dim);
  term.text(tx, 10, 'the design brief, market research and level data live in research/docs/'.padEnd(tw), PAL.dimmer);

  const items = g.menuItems;
  const mx = TITLE_MENU.x + 2;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const y = TITLE_MENU.y + k * TITLE_MENU.step;
    const sel = g.ui.menu === k;
    const label = (sel ? ' ▸ ' : '   ') + it.label;
    term.fill(mx - 2, y, 60, 1, ' ', PAL.bg, sel ? [0.06, 0.22, 0.12] : PAL.bg);
    term.text(mx, y, label.padEnd(52), sel ? PAL.bright : it.locked ? PAL.dimmer : PAL.green, sel ? [0.06, 0.22, 0.12] : PAL.bg);
    term.text(mx + 56, y, it.note || '', it.locked ? PAL.dimmer : PAL.dim);
  }
  term.text(tx, 12, '', PAL.dim);
  const info = [
    `shift seed  ${g.seedText || 'per-shift'}      progress  ${g.progressWon()}/${g.progressTotal()} shifts cleared`,
    `webgl2 ${g.glInfo || 'renderer'}    ${COLS}x${ROWS} cells    vsync 60Hz    sim tick ${SIM.TICK_RATE}Hz`,
  ];
  term.text(tx, 30, info[0], PAL.dim);
  term.text(tx, 31, info[1], PAL.dimmer);
  const box2 = [
    'HOW THIS WORKS',
    'Every request is a packet. Every packet needs a node that can finish it. Queues fill, capacity is finite,',
    'and drops cost reputation. Nothing is random: the seed you see is the run you get, and the state hash',
    'at the end proves it. Reruns are deterministic, so the postmortem is evidence, not vibes.',
    '',
    'TIP  The first three shifts teach the whole game: connect the INTERNET to an APP SERVER, give the app',
    '     something that serves the traffic type, and watch the queue bar (not the load bar) for trouble.',
  ];
  for (let k = 0; k < box2.length; k++) term.text(tx, 34 + k, box2[k].slice(0, tw), k === 0 ? PAL.bright : PAL.dim);
  term.text(2, ROWS - 1, '[↑↓] choose  [ENTER] start  [H] help  [M] mute  [C] crt'.padEnd(COLS - 4), PAL.dim, PAL.head);
}

export function drawLevelSelect(g) {
  const { term, sim } = g;
  term.clear();
  const { x, y, w, h } = overlayFrame(term, 'SELECT A SHIFT', 104, 34);
  const bg = [0.01, 0.05, 0.03];
  const lx = x + 3;
  const rows = g.menuItems;
  for (let k = 0; k < rows.length; k++) {
    const it = rows[k];
    const ry = LS_MENU.y + k * LS_MENU.step;
    const sel = g.ui.menu === k;
    const col = it.locked ? PAL.dimmer : sel ? PAL.bright : PAL.green;
    if (sel) term.fill(x + 2, ry, w - 4, 1, ' ', PAL.black, [0.08, 0.25, 0.14]);
    term.text(lx, ry, (sel ? '▸ ' : '  ') + (it.label || '').padEnd(22), col, sel ? [0.08, 0.25, 0.14] : bg);
    term.text(lx + 24, ry, (it.note || '').slice(0, w - 30), it.locked ? PAL.dimmer : PAL.dim, sel ? [0.08, 0.25, 0.14] : bg);
    if (it.stars) term.text(x + w - 8, ry, '★'.repeat(it.stars), PAL.amber, sel ? [0.08, 0.25, 0.14] : bg);
    if (it.locked) term.text(x + w - 4, ry, '▓▓', PAL.dimmer, sel ? [0.08, 0.25, 0.14] : bg);
  }
  const sel = rows[g.ui.menu];
  if (sel && sel.brief) {
    let r = y + h - 6;
    for (const line of wrap(sel.brief, w - 8, 2)) term.text(lx + 2, r++, line, PAL.green, bg);
    if (sel.teaches) for (const line of wrap('TEACHES: ' + sel.teaches, w - 8, 2)) term.text(lx + 2, r++, line, PAL.amber, bg);
  }
  term.fill(x + 1, y + h - 1, w - 2, 1, ' ', PAL.bright, PAL.head);
  term.text(x + 3, y + h - 1, '[↑↓] choose  [ENTER] deploy  [P] practice unlock  [ESC] title', PAL.bright, PAL.head);
}

// --------------------------------------------------------------------------- frame
export function drawFrame(g) {
  const { term } = g;
  term.clear();
  drawHeader(g);
  drawGrid(g);
  drawLinks(g);
  const n = g.sim.nodes;
  for (let i = 0; i < n.count; i++) if (n.state[i] !== 0) drawNode(g, i);
  drawCursor(g);
  panelObjectives(g, 1, 8);
  panelFlow(g, 9, 12);
  panelInspector(g, 21, BUILD_Y - 21);
  panelBuild(g, BUILD_Y, ROWS - BUILD_Y);
  drawLog(g);
  drawStatusBar(g);
}

/** Add packet sprites to the renderer batch. Called after drawFrame, before flush. */
export function drawPackets(g) {
  const { renderer, sim } = g;
  const P = sim.packets, n = sim.nodes;
  if (g.textPackets) {
    // text-only mode (tools/shot.mjs): packets are glyphs, because there are no sprites in a terminal
    const seen = new Set();
    for (let p = 0; p < P.max; p++) {
      if (P.state[p] !== 2) continue;
      const col = BX + Math.floor(P.x[p]), row = BY + Math.floor(P.y[p]);
      if (col < 0 || row < 0 || col >= WORLD_W || row >= WORLD_H + BY) continue;
      if (insideAnyNode(sim, col, row - BY)) continue;
      const key = row * COLS + col;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = P.type[p];
      g.term.put(col, row, TRAFFIC[t].glyph, TYPE_COLOR[t]);
    }
    return;
  }
  const live = P.live;
  const stride = live > 1400 ? Math.ceil(live / 1400) : 1;
  let seen = 0;
  for (let p = 0; p < P.max; p++) {
    if (P.state[p] !== 2) continue;
    if (seen++ % stride) continue;
    const x = P.x[p], y = P.y[p];
    const col = TYPE_COLOR[P.type[p]];
    const px = (BX + x) * 8, py = (BY + y) * 16;
    const queued = P.wait[p] < P.age[p] - 2;                  // spent real time waiting in a queue
    renderer.sprite(px, py, 15, col, 0.14);                  // halo
    renderer.sprite(px, py, 4.2, col, queued ? 0.75 : 1.0);
  }
  // cursor highlight ring
  if (g.ui.placeKey) renderer.sprite((BX + g.ui.cursorX + 7.5) * 8, (BY + g.ui.cursorY + 2) * 16, 13, PAL.cyan, 0.1);
}
