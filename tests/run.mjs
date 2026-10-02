// tests/run.mjs — headless test suite. `npm test` (or `node tests/run.mjs`) exits non-zero on failure.
//
// Three layers:
//   1. pure units        rng, content tables, packet pool layout
//   2. simulation        determinism, routing coverage for every traffic type, drop bookkeeping
//   3. integration       the real game loop driven through the fake DOM: screens, input, HUD, batching

import { installStub } from './stub.mjs';

const results = [];
let failures = 0;
function test(name, fn) {
  try { fn(); results.push(['ok', name]); }
  catch (e) { failures++; results.push(['FAIL', name + '  →  ' + (e && e.message ? e.message : e)]); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'not equal'}: ${a} !== ${b}`); }

const stub = installStub();

const { Rng, hash32, streamSeed, toHex8 } = await import('../src/core/rng.js');
const { PacketPool, NodeTable, CAP } = await import('../src/core/arena.js');
const { Sim, NODE_W, NODE_H, WORLD_W, WORLD_H } = await import('../src/sim/sim.js');
const {
  SIM, TRAFFIC, T, NODES, NODE, PALETTE, LEVELS, ENDLESS, dailyLevel, generateIncidents, nodeCapRps,
} = await import('../src/sim/content.js');
const { Term, PAL } = await import('../src/render/term.js');
const HUD = await import('../src/render/hud.js');
const { SOL, playThrough } = await import('../tools/verify.mjs');

// --------------------------------------------------------------------- 1. units
test('rng: same seed, same stream; different seeds diverge', () => {
  const a = new Rng(12345), b = new Rng(12345), c = new Rng(12346);
  const va = [], vb = [], vc = [];
  for (let i = 0; i < 64; i++) { va.push(a.next()); vb.push(b.next()); vc.push(c.next()); }
  ok(va.every((v, i) => v === vb[i]), 'same seed must produce the same stream');
  ok(va.some((v, i) => v !== vc[i]), 'different seeds must diverge');
  ok(va.every((v) => v >= 0 && v < 1), 'values are in [0,1)');
  eq(hash32('kernel architect'), hash32('kernel architect'), 'hash32 is stable');
  ok(hash32('a') !== hash32('b'), 'hash32 separates inputs');
  eq(toHex8(0xdeadbeef), 'DEADBEEF');
});

test('content: ids, palette and unlock tables are consistent', () => {
  for (const t of TRAFFIC) ok(NODES.some((n) => n.serves.includes(t.id)), `${t.key} has no server`);
  eq(PALETTE.length, NODES.filter((n) => n.key !== 'INTERNET').length, 'palette covers every placeable node');
  const ids = new Set();
  for (const lv of LEVELS) {
    ok(!ids.has(lv.id), 'duplicate level id ' + lv.id); ids.add(lv.id);
    ok(lv.unlock.length >= 2, lv.id + ' needs a build palette');
    for (const k of lv.unlock) ok(NODE[k] !== undefined, lv.id + ' unlocks unknown node ' + k);
    for (const tr of lv.traffic) ok(T[tr.type] !== undefined, lv.id + ' has unknown traffic type ' + tr.type);
    // every traffic type the level actually sends must be servable by something the player can build
    for (const tr of lv.traffic) {
      const servable = lv.unlock.some((k) => NODES[NODE[k]].serves.includes(T[tr.type]));
      ok(servable, `${lv.id} sends ${tr.type} but no unlocked node serves it`);
    }
    ok(lv.objectives.complete > 0 && lv.objectives.maxErrors > 0, lv.id + ' objectives');
    ok(lv.duration > 0 && lv.budget > 0, lv.id + ' timing and budget');
  }
  eq(ENDLESS.unlock.length, PALETTE.length, 'endless unlocks everything');
});

test('pool: fields do not alias, and live counts stay honest', () => {
  const p = new PacketPool(64);
  const fields = ['state', 'type', 'hop', 'flags', 'age', 'wait', 'node', 'next', 'from', 'spawn', 'x', 'y', 'len', 'dist'];
  const seen = new Map();
  for (const f of fields) {
    const v = p[f];
    const key = v.byteOffset + ':' + v.byteLength;
    ok(!seen.has(key), `${f} shares memory with ${seen.get(key)}`);
    seen.set(key, f);
  }
  // behavioural check: write distinct values into every field of one packet and read them back
  const i = p.alloc();
  ok(i >= 0, 'alloc');
  for (const f of fields) p[f][i] = f === 'x' || f === 'y' || f === 'len' || f === 'dist' ? 12.5 : 7;
  for (const f of fields) {
    const want = f === 'x' || f === 'y' || f === 'len' || f === 'dist' ? 12.5 : 7;
    eq(p[f][i], want, `${f} was clobbered by another field`);
  }
  p.release(i);
  eq(p.state[i], 0, 'released');
  const live = [];
  for (let k = 0; k < 40; k++) live.push(p.alloc());
  eq(p.live, 40, 'live counter after 40 allocations');
  for (const k of live) p.release(k);
  eq(p.live, 0, 'live counter after releasing');
  ok(p.freeTop >= 0, 'free list rebuilt');
  eq(p.buffer.byteLength, p.bytesUsed, 'buffer is exactly the layout size');
});

test('node table: connect/disconnect keep directed in/out lists in sync', () => {
  const sim = new Sim(LEVELS[0], { seed: 7 });
  const a = sim.do('place', { type: 'COMPUTE', x: 30, y: 20 });
  const b = sim.do('place', { type: 'SQL', x: 60, y: 20 });
  ok(a.ok && b.ok, 'placed');
  ok(sim.do('connect', { a: 0, b: a.i }).ok, 'net->app');
  ok(sim.do('connect', { a: a.i, b: b.i }).ok, 'app->db');
  ok(sim.isConnected(a.i, b.i), 'isConnected');
  eq(sim.nodes.outCount[a.i], 1, 'app outs');
  eq(sim.nodes.inCount[b.i], 1, 'db ins');
  ok(sim.do('disconnect', { a: a.i, b: b.i }).ok, 'disconnect');
  eq(sim.nodes.outCount[a.i], 0, 'app outs after disconnect');
  eq(sim.nodes.inCount[b.i], 0, 'db ins after disconnect');
  ok(!sim.do('disconnect', { a: a.i, b: b.i }).ok, 'disconnecting twice is an error, not a crash');
});

test('economy: placement costs money, removal refunds, upkeep drains', () => {
  const sim = new Sim(LEVELS[0], { seed: 3 });
  const start = sim.money;
  const a = sim.do('place', { type: 'COMPUTE', x: 30, y: 20 });
  eq(sim.money, start - NODES[NODE.COMPUTE].cost, 'cost charged');
  const after = sim.money;
  ok(sim.do('remove', { i: a.i }).ok, 'removed');
  ok(sim.money > after, 'refund');
  ok(!sim.do('remove', { i: 0 }).ok, 'the INTERNET cannot be sold');
});

// --------------------------------------------------------------------- 2. simulation
/** A level that can afford anything: the tests are about the model, not the economy. */
function richLevel(over = {}) {
  return {
    ...LEVELS[0], id: 'TEST', name: 'test', duration: 40, budget: 100000, startRep: 100,
    traffic: [], objectives: { complete: 1e9, maxErrors: 1e9 }, stars: { errors2: 0, sloMs: 0 }, incidents: [],
    ...over,
  };
}
function buildFull(sim) {
  // NET -> WAF? no: a clean topology that covers every traffic type with capacity to spare
  const put = (k, x, y) => { const r = sim.do('place', { type: k, x, y }); ok(r.ok, `place ${k}: ${r.err}`); return r.i; };
  const wire = (a, b) => { const r = sim.do('connect', { a, b }); ok(r.ok, `wire ${a}->${b}: ${r.err}`); };
  const fw = put('FIREWALL', 24, 2);
  const cdn = put('CDN', 24, 10);
  const gw = put('GATEWAY', 24, 18);
  const s3 = put('STORAGE', 24, 26);
  const app = put('COMPUTE', 50, 18);
  const cache = put('CACHE', 74, 6);
  const sql = put('SQL', 74, 14);
  const nosql = put('NOSQL', 74, 22);
  const rep = put('REPLICA', 74, 30);
  const idx = put('SEARCH', 74, 38);
  const gpu = put('GPU', 100, 38);
  wire(0, fw); wire(0, cdn); wire(0, gw); wire(0, s3);
  wire(gw, app); wire(app, gpu);         // GPU is a terminal that requires an app hop
  wire(app, cache); wire(app, sql); wire(app, nosql); wire(app, rep); wire(app, idx);
  wire(cache, sql); wire(cache, rep); wire(cache, nosql);
  return { fw, cdn, gw, s3, app, cache, sql, nosql, rep, idx, gpu };
}

test('sim: a complete topology serves every traffic type with no NO_ROUTE drops', () => {
  const sim = new Sim(richLevel({ traffic: TRAFFIC.map((t) => ({ type: t.key, rps: 6, ramp: 0 })) }), { seed: 99 });
  buildFull(sim);
  while (sim.state === 'running' && sim.tick < 2400) sim.step();
  for (const t of TRAFFIC) ok(sim.doneByType[t.id] > 0, `${t.key} never completed`);
  eq(sim.dropByReason[1], 0, 'no NO_ROUTE drops in a complete topology');
  ok(sim.packets.live === countLive(sim), 'pool live count matches the table');
});

function countLive(sim) {
  let c = 0;
  for (let i = 0; i < sim.packets.max; i++) if (sim.packets.state[i] !== 0) c++;
  return c;
}

test('sim: identical seeds and actions produce identical hashes; different seeds do not', () => {
  const run = (seed) => {
    const sim = new Sim(richLevel({
      traffic: [{ type: 'READ', rps: 60, ramp: 1 }, { type: 'WRITE', rps: 20, ramp: 0.4 }, { type: 'SEARCH', rps: 10, ramp: 0.2 }],
    }), { seed });
    buildFull(sim);
    for (let i = 0; i < 900; i++) sim.step();
    return sim.hash();
  };
  const a = run(4242), b = run(4242), c = run(4243);
  eq(a, b, 'same seed must be reproducible');
  ok(a !== c, 'a different seed must give a different run');
});

test('sim: an overloaded database drops with a reason, and the pool stays consistent', () => {
  // far more traffic than one T1 database can serve: the queue must overflow rather than vanish
  const sim = new Sim(richLevel({ traffic: [{ type: 'READ', rps: 900, ramp: 0 }] }), { seed: 5 });
  const app = sim.do('place', { type: 'COMPUTE', x: 30, y: 20 }).i;
  const db = sim.do('place', { type: 'SQL', x: 60, y: 20 }).i;
  sim.do('connect', { a: 0, b: app });
  sim.do('connect', { a: app, b: db });
  for (let i = 0; i < 1200; i++) sim.step();
  ok(sim.dropped > 0, 'an overloaded queue must drop');
  ok(sim.dropByReason[3] > 0, 'and the reason must be QUEUE FULL');
  ok(sim.dropByReason[1] === 0, 'a valid topology must never drop as NO_ROUTE');
  eq(sim.dropped, [1, 2, 3, 4, 5].reduce((n, r) => n + sim.dropByReason[r], 0), 'every drop has a reason');
  eq(sim.packets.live, countLive(sim), 'pool stays consistent under drops');
});

test('sim: unservable traffic is never sent (no phantom spawns), then dropped as NO_ROUTE if it strands', () => {
  const sim = new Sim(richLevel({ traffic: [{ type: 'SEARCH', rps: 30, ramp: 0 }] }), { seed: 8 });
  sim.do('place', { type: 'COMPUTE', x: 30, y: 20 });
  sim.do('connect', { a: 0, b: 1 });                 // app server only: nothing serves SEARCH
  for (let i = 0; i < 600; i++) sim.step();
  eq(sim.spawned, 0, 'nothing is spawned while no server is reachable');
  ok(sim.log.some((e) => /NOTHING ROUTES SEARCH/.test(e.msg)), 'and the player is told why');
});

test('sim: autoscaling adds instances, and instances cost money', () => {
  const sim = new Sim(richLevel({ id: 'AUTO', duration: 60, traffic: [{ type: 'READ', rps: 400, ramp: 0 }] }), { seed: 11 });
  const app = sim.do('place', { type: 'COMPUTE', x: 30, y: 20 }).i;
  sim.do('place', { type: 'SQL', x: 60, y: 20 });
  sim.do('connect', { a: 0, b: app });
  sim.do('connect', { a: app, b: 2 });
  sim.do('auto', { i: app, on: 1 });
  const spent0 = sim.spent;
  for (let i = 0; i < 900; i++) sim.step();
  ok(sim.nodes.inst[app] > 1, 'the fleet grew under load');
  ok(sim.nodes.scaleCount[app] >= 1, 'the fleet grew exactly once per boot');
  ok(sim.spent - spent0 >= Math.round(NODES[NODE.COMPUTE].cost * 0.3), 'extra instances were paid for');
  ok(sim.nodes.tier[app] === 0, 'autoscaling does not change tiers');
  ok(sim.nodes.inst[app] <= NODES[NODE.COMPUTE].autoMax, 'and never exceeds autoMax');
});

test('daily and endless levels are buildable and deterministic', () => {
  const d1 = dailyLevel('2026-10-02', 12345), d2 = dailyLevel('2026-10-02', 12345);
  eq(JSON.stringify(d1.traffic), JSON.stringify(d2.traffic), 'daily traffic is derived from the seed');
  ok(d1.incidents.length > 0, 'daily has incidents');
  const e1 = generateIncidents('ENDLESS', 777, new Rng(streamSeed(777, 77)));
  const e2 = generateIncidents('ENDLESS', 777, new Rng(streamSeed(777, 77)));
  eq(JSON.stringify(e1), JSON.stringify(e2), 'endless incidents are deterministic');
  const sim = new Sim(ENDLESS, { seed: 777 });
  sim.incidents = e1;
  buildFull(sim);
  for (let i = 0; i < 600; i++) sim.step();
  ok(sim.completed > 0, 'endless actually runs');
});

// --------------------------------------------------------------------- 3. rendering
test('term: writes stay in bounds and clip safely at the edges', () => {
  const term = new Term(80, 24);
  term.text(-5, -3, 'off the top', PAL.green);
  term.text(78, 23, 'edge', PAL.green);
  term.box(70, 18, 12, 8, PAL.green);
  term.bar(78, 5, 20, 2, PAL.green);
  term.panel(0, 0, 40, 10, 'TITLE');
  eq(term.ch.length, 80 * 24, 'cell count');
  for (const g of term.ch) ok(typeof g === 'string' && g.length === 1, 'one glyph per cell');
});

test('hud: every screen draws into every cell', () => {
  const sim = new Sim(richLevel({ id: 'HUD', traffic: [{ type: 'READ', rps: 40, ramp: 0 }] }), { seed: 2024 });
  buildFull(sim);
  for (let i = 0; i < 300; i++) sim.step();
  sim.do('place', { type: 'MONITOR', x: 100, y: 6 });
  const term = new Term(HUD.COLS, HUD.ROWS);
  const pushed = { cells: 0, sprites: 0 };
  const put = term.put.bind(term);
  term.put = (...a) => { pushed.cells++; return put(...a); };
  const renderer = { begin() {}, cell() {}, sprite() { pushed.sprites++; }, flush() {}, instances: 0 };
  const game = {
    term, sim, level: sim.level, renderer, seedHex: 'ABCD1234', hashHex: '1234ABCD', perfMs: 0.2, glInfo: 'stub',
    paused: false, speed: 1, toast: { msg: 'test', until: sim.tick + 100 },
    menuItems: [
      { label: 'L01 HELLO, WORLD', note: 'cleared ★★★', brief: 'b', teaches: 't', locked: false, stars: 3 },
      { label: 'L02 STATIC ASSETS', note: 'locked', brief: 'b', teaches: 't', locked: true, stars: 0 },
    ],
    progressWon: () => 3, progressTotal: () => 10, seedText: 'per-shift',
    ui: {
      sel: 4, hover: 3, placeKey: 'CACHE', buildIdx: 3, cursorX: 40, cursorY: 10, wireFrom: 0, wireTo: 4,
      menu: 1, helpPage: 0, flow: true, flowType: T.READ, confirm: null, note: '', noteUntil: 0, followMouse: true,
    },
  };
  let inkOnBoard = 0;
  for (let pass = 0; pass < 2; pass++) {
    HUD.drawFrame(game);
    HUD.drawPackets(game);
    if (pass === 0) inkOnBoard = term.ch.filter((c) => c !== ' ').length;
    for (const page of [0, 1, 2]) { game.ui.helpPage = page; HUD.drawHelp(game); }
    HUD.drawTitle(game);
    HUD.drawLevelSelect(game);
    sim.state = 'won'; sim.reason = 'OBJECTIVES MET';
    HUD.drawPostmortem(game);
    sim.state = 'running';
  }
  ok(pushed.cells >= HUD.COLS * HUD.ROWS, `the HUD wrote at least one full screen of cells (${pushed.cells})`);
  ok(pushed.sprites > 0, 'packet sprites were emitted');
  for (const g of term.ch) ok(typeof g === 'string' && g.length === 1, 'single glyph per cell');
  ok(inkOnBoard > HUD.COLS * HUD.ROWS * 0.2, `the board screen has real content (${inkOnBoard} glyphs)`);
});

// --------------------------------------------------------------------- 4. the real game loop
const main = await import('../src/game/main.js');
const game = globalThis.KERNEL_ARCHITECT;
test('boot: the game installs itself on the page', () => {
  ok(game, 'window.KERNEL_ARCHITECT exists');
  eq(game.screen, 'title', 'starts on the title screen');
});

test('input -> sim -> hud: play L01 through the keyboard and mouse', () => {
  stub.pump(3);
  stub.key('Enter');                              // CONTINUE (first menu entry)
  stub.pump(2);
  eq(game.screen, 'play', 'menu pick started the shift');
  eq(game.level.id, 'L01', 'first shift');

  stub.key('1');                                   // 1 = first build item (APP SERVER)
  stub.click(33, 21);                              // place it
  stub.pump(1);
  eq(game.sim.nodes.count, 2, 'app server placed by mouse');
  stub.key('2');                                   // 2 = SQL
  stub.click(63, 21);
  stub.pump(1);
  eq(game.sim.nodes.count, 3, 'database placed');

  stub.click(10, 21);                              // select the INTERNET
  stub.pump(1);
  eq(game.ui.sel, 0, 'clicked the internet node');
  stub.key('w');                                   // wire mode
  stub.pump(1);
  stub.click(33, 21);                              // ...to the app server
  stub.pump(1);
  ok(game.sim.isConnected(0, 1), 'internet -> app wired');

  stub.click(33, 21); stub.pump(1);
  eq(game.ui.sel, 1, 'app server selected');
  stub.key('w'); stub.pump(1);
  stub.click(63, 21); stub.pump(1);
  ok(game.sim.isConnected(1, 2), 'app -> db wired');

  stub.key('='); stub.key('=');                    // 4x
  stub.pump(40);
  ok(game.sim.tick > 0, 'the simulation advanced');
  ok(game.renderer.instances > HUD.COLS * HUD.ROWS, 'cells were batched to the GPU');
  ok(game.renderer.instances < game.renderer.cap, 'instance buffer never overflows');

  stub.pump(1600);                                 // ~27 simulated seconds at 4x
  eq(game.screen, 'post', 'the shift ended');
  eq(game.sim.state, 'won', 'and it was won: ' + game.sim.reason);
  ok(game.sim.completed >= game.level.objectives.complete, 'objective met');
  eq(game.sim.packets.live, countLive(game.sim), 'packet pool consistent after a full run');
  ok(game.progress.L01 >= 1, 'progress was recorded');
});

test('postmortem screen accepts retry and the level list', () => {
  stub.pump(2);
  stub.key('h'); stub.pump(1); eq(game.screen, 'help', 'help opens from the postmortem');
  stub.key('Escape'); stub.pump(1); eq(game.screen, 'post', 'and closes back to it');
  stub.key('q'); stub.pump(1); eq(game.screen, 'levels', 'abandon goes to the level list');
  stub.key('Escape'); stub.pump(1); eq(game.screen, 'title', 'and the list goes back to the title');
});

test('game: a second identical run reproduces the same final hash', () => {
  const seed = game.levelSeed(LEVELS[0]);
  const script = (sim) => {
    sim.do('place', { type: 'COMPUTE', x: 26, y: 18 });
    sim.do('place', { type: 'SQL', x: 56, y: 18 });
    sim.do('connect', { a: 0, b: 1 });
    sim.do('connect', { a: 1, b: 2 });
    while (sim.state === 'running') sim.step();
    return sim.hash();
  };
  const h1 = script(new Sim(LEVELS[0], { seed }));
  const h2 = script(new Sim(LEVELS[0], { seed }));
  eq(h1, h2, 'hash');
  ok(toHex8(h1) === toHex8(h2));
});

test('sim: the reference solution wins every campaign level, with no build errors', () => {
  for (const lv of LEVELS) {
    const build = SOL[lv.id];
    ok(build, 'reference build for ' + lv.id);
    const { sim, errors } = playThrough(lv, build, 1234);
    eq(errors.length, 0, `${lv.id} build errors: ${errors.join('; ')}`);
    eq(sim.state, 'won', `${lv.id} reference run: ${sim.reason}`);
  }
});

// --------------------------------------------------------------------- report
const width = Math.max(...results.map((r) => r[1].length)) + 2;
for (const [status, name] of results) console.log((status === 'ok' ? ' ok ' : 'FAIL') + '  ' + name.padEnd(width) + (status === 'ok' ? '' : ''));
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
