// tools/shot.mjs — render a real frame of the game as text, in the terminal, without a browser.
//
//   node tools/shot.mjs                 # L01, reference build, 25 s in, colour if the terminal supports it
//   node tools/shot.mjs L05 900         # level id + how many simulated seconds to run
//   node tools/shot.mjs --screen title  # title / levels / help / post screens
//   node tools/shot.mjs --screen tut    # a tutorial step: spotlit zone, dimmed board, step card
//   node tools/shot.mjs --screen codex  # the codex, with some entries unlocked and some still locked
//   node tools/shot.mjs --screen codex --tab 3   # ...on a specific tab (1 nodes, 2 traffic, 3 mechanics, 4 shifts, 5 controls)
//   node tools/shot.mjs --screen kid   # PLAY MODE: pictures, tiles, packets as icons
//   node tools/shot.mjs --screen kid --level K03 --tour   # ... with the first tour card still up
//   node tools/shot.mjs --screen kidend  # the end-of-game screen in PLAY MODE
//   node tools/shot.mjs --plain         # no ANSI colour (redirect to a file, or paste into a doc)
//
// This is a development tool: it boots the actual game under tests/stub.mjs, drives it with the same
// reference scripts tools/verify.mjs uses, and prints the terminal cell grid the HUD produced.

import { installStub } from '../tests/stub.mjs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const plain = argv.includes('--plain');
const screen = flag('--screen') || 'play';
const levelArg = argv.find((a) => /^L\d\d$|^K\d\d$|^ENDLESS$|^DAILY$/i.test(a));   // L01..L10 (campaign) or K01..K04 (play mode)
const seconds = Number(argv.find((a) => /^\d+$/.test(a)) || 25);

const stub = installStub();
const { LEVELS, KID_LEVELS, ENDLESS, NODES, NODE } = await import('../src/sim/content.js');
const { SOL } = await import('./verify.mjs');
const { PAL } = await import('../src/render/term.js');
const { glyphTag } = await import('../src/render/atlas.js');
const { kidPlace } = await import('../src/game/kids.js');
const HUD = await import('../src/render/hud.js');
await import('../src/game/main.js');
const game = globalThis.KERNEL_ARCHITECT;
const pump = (n) => stub.pump(n);

const level = /^ENDLESS$/i.test(levelArg || '') ? ENDLESS : LEVELS.find((l) => l.id === (levelArg || 'L01').toUpperCase()) || LEVELS[0];

game.textPackets = true;      // packets are drawn as glyphs: a terminal has no sprites

if (screen === 'title') { pump(3); }
else if (screen === 'levels') { game.screen = 'levels'; pump(2); }
else if (screen === 'help') { game.gotoHelp('title'); pump(2); }
else if (screen === 'tut') {
  game.tutMode = 'all';                            // show the per-shift tour too, on any level
  game.startLevel(level);
  game.tut.next();                                // step 2 of L01: place the app server
  game.ui.placeKey = 'COMPUTE';
  game.ui.cursorX = 34; game.ui.cursorY = 16;
  pump(2);
} else if (screen === 'kid' || screen === 'kidend') {
  const lv = KID_LEVELS.find((l) => l.id === (levelArg || 'K02').toUpperCase()) || KID_LEVELS[0];
  game.startKid(lv);
  game.tutDone = {};
  if (!argv.includes('--tour')) game.tut = null;       // --tour keeps the picture tour's first card up
  if (screen === 'kidend') {
    game.sim.completed = lv.objectives.complete;
    game.sim.state = 'won'; game.sim.reason = 'ALL IN';
    game.sim.rep = lv.startRep;
    game.screen = 'post';
    pump(2);
  } else {
    // the taps a player makes, then a while of watching: the mode places and wires each box itself
    for (const key of lv.unlock.filter((k) => k !== 'COMPUTE')) {
      const r = kidPlace(game.sim, key);
      if (!r.ok) console.error('kidPlace failed:', key, r.err);
    }
    game.ui.placeKey = 'SQL';
    game.ui.buildIdx = 1;
    const until = argv.includes('--tour') ? 40 : seconds * 60;         // --tour: stay on the first card
    while (game.sim.tick < until && game.sim.state === 'running') game.sim.step();
    pump(2);
  }
} else if (screen === 'codex') {
  game.startLevel(level);
  const ids = { net: 0 };
  for (const [name, type, x, y] of [['app', 'COMPUTE', 26, 18], ['db', 'SQL', 56, 18]]) ids[name] = game.sim.do('place', { type, x, y }).i;
  game.sim.do('connect', { a: 0, b: ids.app });
  game.sim.do('connect', { a: ids.app, b: ids.db });
  game.sim.incidents = [];
  game.tut = null;
  while (game.sim.tick < 20 * 60 && game.sim.state === 'running') game.sim.step();
  game.openCodex();
  game.ui.codexTab = Math.max(0, Math.min(4, (Number(flag('--tab')) || 1) - 1));
  game.ui.codexRow = 0;
  pump(2);
} else {
  game.startLevel(level);
  game.speed = 8;
  const sol = SOL[level.id];
  if (sol) {
    const ids = { net: 0 };
    for (const [name, type, x, y] of sol.place) { const r = game.sim.do('place', { type, x, y }); ids[name] = r.i; if (r.ok === false) console.error('place failed:', name, r.err); }
    for (const [a, b] of sol.wire) { const r = game.sim.do('connect', { a: ids[a], b: ids[b] }); if (r.ok === false) console.error('wire failed:', a, '->', b, r.err); }
    for (const [at, act] of sol.at) {
      if (at > seconds) continue;                    // only replay the part of the shift we are showing
      // fast-forward to the scheduled tick, then apply it
      while (game.sim.tick < Math.round(at * 60) && game.sim.state === 'running') game.sim.step();
      if (act.op === 'upgrade') game.sim.do('upgrade', { i: ids[act.node] });
      else if (act.op === 'auto') game.sim.do('auto', { i: ids[act.node], on: act.on });
      else if (act.op === 'connect') game.sim.do('connect', { a: ids[act.a], b: ids[act.b] });
      else if (act.op === 'disconnect') game.sim.do('disconnect', { a: ids[act.a], b: ids[act.b] });
    }
  }
  while (game.sim.tick < seconds * 60 && game.sim.state === 'running') game.sim.step();
  if (game.sim.state !== 'running') game.screen = 'post';
  else if (screen === 'flow') game.ui.flow = true;
  game.ui.sel = 1;
  pump(2);
}

// ---- print the grid (colour is a rough ANSI approximation of the WebGL palette)
const term = game.term;
// PLAY MODE draws its pictures bigger than a cell; a terminal dump shows them as a glyph plus blocks
for (const b of (game.g && game.g.big) || []) {
  const sc = b.scale || 1;
  for (let j = 0; j < sc; j++) {
    for (let i = 0; i < sc; i++) {
      const idx = (b.y + j) * term.cols + (b.x + i);
      if (idx < 0 || idx >= term.ch.length) continue;
      term.ch[idx] = (i === 0 && j === 0) ? glyphTag(b.ch) : '▒';
      term.fg[idx] = b.fg;
    }
  }
}
const hex = (c) => (Math.max(0, Math.min(255, Math.round(c * 255)))).toString(16).padStart(2, '0');
// picture glyphs are code points a terminal cannot show: dump them as their 2-letter tag
for (let i = 0; i < term.ch.length; i++) {
  const c = term.ch[i].codePointAt(0);
  if (c >= 0xE000 && c <= 0xF8FF) term.ch[i] = glyphTag(term.ch[i])[0] + (glyphTag(term.ch[i])[1] || ' ');
}
const fgCode = (c) => `\x1b[38;2;${Math.round(c[0] * 255)};${Math.round(c[1] * 255)};${Math.round(c[2] * 255)}m`;
const bgCode = (c) => `\x1b[48;2;${Math.round(c[0] * 255)};${Math.round(c[1] * 255)};${Math.round(c[2] * 255)}m`;
let lastFg = null, lastBg = null;
let out = '';
for (let y = 0; y < term.rows; y++) {
  for (let x = 0; x < term.cols; x++) {
    const i = y * term.cols + x;
    if (plain) { out += term.ch[i]; continue; }
    if (term.fg[i] !== lastFg) { out += fgCode(term.fg[i]); lastFg = term.fg[i]; }
    if (term.bg[i] !== lastBg) { out += bgCode(term.bg[i]); lastBg = term.bg[i]; }
    out += term.ch[i];
  }
  if (!plain) out += '\x1b[0m';
  out += '\n';
}
if (!plain) out += '\x1b[0m';
out += `\n${game.level ? game.level.id + ' ' + game.level.name : ''}  ${game.sim ? `t=${(game.sim.tick / 60).toFixed(1)}s ${game.sim.state} ${game.sim.reason} done=${game.sim.completed} err=${game.sim.dropped} rep=${game.sim.rep.toFixed(0)} live=${game.sim.packets.live} hash=${(game.sim.hash() >>> 0).toString(16).toUpperCase()}` : ''}\n`;
process.stdout.write(out);
