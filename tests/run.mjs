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
  ok(game.tut && game.tut.active, 'the tutorial is running on a fresh save');

  stub.key('n');                                  // read the welcome card, move on
  stub.pump(1);
  eq(game.tut.number, 2, 'step 2 asks for the app server');
  stub.key('1');                                   // 1 = first build item (APP SERVER)
  stub.click(33, 21);                              // place it
  stub.pump(1);
  eq(game.sim.nodes.count, 2, 'app server placed by mouse');
  stub.pump(70);                                   // the card notices and moves on by itself
  ok(game.tut.number >= 3, 'the tutorial advanced after the box went down');
  stub.key('2');                                   // 2 = SQL
  stub.click(63, 21);
  stub.pump(1);
  eq(game.sim.nodes.count, 3, 'database placed');
  stub.pump(70);
  eq(game.tut.number, 4, 'now the wiring steps: ' + game.tut.step.title);

  stub.click(10, 21);                              // select the INTERNET
  stub.pump(1);
  eq(game.ui.sel, 0, 'clicked the internet node');
  stub.key('w');                                   // wire mode
  stub.pump(1);
  stub.click(33, 21);                              // ...to the app server
  stub.pump(1);
  ok(game.sim.isConnected(0, 1), 'internet -> app wired');
  stub.pump(70);

  stub.click(33, 21); stub.pump(1);
  eq(game.ui.sel, 1, 'app server selected');
  stub.key('w'); stub.pump(1);
  stub.click(63, 21); stub.pump(1);
  ok(game.sim.isConnected(1, 2), 'app -> db wired');
  stub.pump(70);
  ok(game.tut.number >= 6, 'the tour followed the build: ' + game.tut.describe());

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

// --------------------------------------------------------------------- 5. tutorial + codex
const { Tutorial, stepsFor, _test: TUT } = await import('../src/game/tutorial.js');
const { codexEntries, codexProgress, CODEX_TABS } = await import('../src/game/codex.js');
const { MAX_DIM, wrap } = await import('../src/render/term.js');
const SAVE_KEY = 'kernelarchitect.save.v1';
const savedNow = () => { try { return JSON.parse(globalThis.localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch (e) { return {}; } };

test('tutorial: L01 unlocks in order and refuses everything a step does not ask for', () => {
  const lv = LEVELS[0];
  const sim = new Sim(lv, { seed: 4242 });
  sim.money = 2000;                                               // this test is about the tour, not the wallet
  const g = { sim };
  const tut = new Tutorial(lv, 'first', { completed: false });
  ok(tut.active, 'the tour starts active');
  eq(tut.total, 7, 'L01 has seven steps');
  eq(tut.step.allow, null, 'the welcome card locks nothing');
  ok(tut.gate('pick', { key: 'SQL' }, g).ok, 'and does not gate the palette');
  sim.do('place', { type: 'COMPUTE', x: 30, y: 20 });            // the player starts without reading
  for (let i = 0; i < 40; i++) tut.tick(g);
  eq(tut.number, 2, 'the welcome card gets out of the way once they build something');
  sim.do('remove', { i: 1 });                                    // back to an empty board

  // step 2: place the app server
  ok(/PLACE/.test(tut.step.title), 'step 2 asks for a placement: ' + tut.step.title);
  ok(!tut.gate('pick', { key: 'SQL' }, g).ok, 'the database is locked while the step wants the app server');
  ok(tut.gate('pick', { key: 'COMPUTE' }, g).ok, 'the app server is allowed');
  ok(!tut.gate('place', { key: 'COMPUTE', x: 4, y: 4 }, g).ok, 'outside the zone placement is refused');
  ok(tut.gate('place', { key: 'COMPUTE', x: 30, y: 20 }, g).ok, 'inside the zone it is allowed');
  sim.do('place', { type: 'COMPUTE', x: 30, y: 20 });
  for (let i = 0; i < 40; i++) tut.tick(g);
  eq(tut.number, 3, 'the card advances by itself once the app server is up');

  ok(tut.gate('pick', { key: 'SQL' }, g).ok, 'step 3 wants the database');
  ok(!tut.gate('pick', { key: 'COMPUTE' }, g).ok, 'and locks the app server again');
  sim.do('place', { type: 'SQL', x: 60, y: 20 });
  for (let i = 0; i < 40; i++) tut.tick(g);
  eq(tut.number, 4, 'step 4 is the first wire');
  const app = TUT.firstType(g, 'COMPUTE'), db = TUT.firstType(g, 'SQL');
  ok(app > 0 && db > 0, 'both boxes are live on the board');
  ok(tut.gate('wire', { a: 0, b: app }, g).ok, 'wiring internet -> app is allowed');
  const bad = tut.gate('wire', { a: app, b: db }, g);
  ok(!bad.ok && /NET/.test(bad.err), 'wiring the wrong pair is refused: ' + bad.err);
  sim.do('connect', { a: 0, b: app });
  for (let i = 0; i < 40; i++) tut.tick(g);
  eq(tut.number, 5, 'step 5 is the second wire');
  sim.do('connect', { a: app, b: db });
  for (let i = 0; i < 40; i++) tut.tick(g);
  eq(tut.number, 6, 'step 6 watches the first requests');
  ok(tut.step.allow === null || tut.step.allow === undefined, 'the watch step locks nothing');
  tut.next();
  eq(tut.number, 7, 'step 7 closes the tour');
  ok(tut.active, 'still on the last card');
  tut.next();
  ok(!tut.active && tut.done, 'the tour is over');
});

test('tutorial: every card in the game fits its box, and every step is reachable', () => {
  let steps = 0;
  for (const lv of LEVELS) {
    for (const mode of ['first', 'all', 'off']) {
      const list = stepsFor(lv, mode);
      if (mode === 'off') { eq(list, null, 'off means no tour at all'); continue; }
      if (!list) continue;
      for (const s of list) {
        ok(s.id && s.title && Array.isArray(s.card) && s.card.length, `${lv.id}/${s.id} has a card`);
        ok(['next', 'skip'].includes(s.primary), `${lv.id}/${s.id} has a button`);
        const lines = wrap(s.card.join(' '), 78 - 5, 99);
        ok(lines.length <= 6, `${lv.id}/${s.id}: the card must fit (${lines.length} lines)`);
        for (const f of s.focus) ok(f.item || f.zone || f.nodes || f.panel || f.board, 'focus descriptors are known kinds');
      }
      steps += list.length;
    }
  }
  ok(steps > 30, `the game ships a real tour (${steps} steps over all levels)`);
  ok(stepsFor(LEVELS[0], 'all').length === 7, 'L01 is the full guided shift');
  ok(stepsFor(LEVELS[4], 'all').length === 3, 'L05 gets the short per-shift tour');
  eq(stepsFor(LEVELS[4], 'first'), null, 'and nothing extra in guided-opening mode');
});

test('tutorial: NEXT and SKIP both stick, and a finished tour does not replay itself', () => {
  game.progress = {}; game.tutDone = {}; game.codexSeen = { nodes: {}, traffic: {} };
  game.save();
  game.startLevel(LEVELS[0]);
  stub.pump(2);
  eq(game.screen, 'play', 'a fresh L01 is running');
  ok(game.tut && game.tut.active, 'the tour is on');
  eq(game.tut.number, 1, 'from step 1');

  stub.pump(2);
  const next = game.hitboxes.find((h) => h.id === 'tut-next');
  ok(next, 'the card published a NEXT hitbox');
  stub.click(next.x + 1, next.y);
  stub.pump(2);
  eq(game.tut.number, 2, 'clicking NEXT advances the card');

  let guard = 0;
  while (game.tut && game.tut.active && guard++ < 20) { stub.key('n'); stub.pump(1); }
  ok(!game.tut.active, 'the tour can be walked to the end with N');
  eq(savedNow().tutDone && savedNow().tutDone.L01, 1, 'finishing the tour is remembered');

  game.startLevel(LEVELS[0]);
  stub.pump(2);
  ok(!game.tut.active, 'a finished tour does not start again');
  stub.key('t'); stub.pump(2);
  ok(game.tut.active && game.tut.number === 1, 'T brings it back on demand');
  stub.key('Escape'); stub.pump(2);
  ok(!game.tut.active, 'ESC ends it');
  eq(savedNow().tutDone.L01, 1, 'and the skip is remembered too');
  stub.key('k'); stub.pump(1);
  ok(game.ui.codexOpen, 'K opens the codex from the shift');
  stub.key('Escape'); stub.pump(1);
  ok(!game.ui.codexOpen, 'ESC closes the codex');
  eq(game.screen, 'play', 'and leaves the shift running');
});

test('codex: entries stay locked until the player has met them', () => {
  const empty = { seen: { nodes: {}, traffic: {} }, progress: {} };
  const nodes = codexEntries('nodes', empty);
  const inter = nodes.find((e) => e.key === 'INTERNET');
  const compute = nodes.find((e) => e.key === 'COMPUTE');
  ok(inter && !inter.locked, 'the internet is known from the start');
  ok(compute && compute.locked && !compute.seen, 'an unbuilt node is locked');
  const met = { seen: { nodes: { COMPUTE: true }, traffic: { READ: true } }, progress: {} };
  ok(!codexEntries('nodes', met).find((e) => e.key === 'COMPUTE').locked, 'placing one unlocks it');
  ok(codexEntries('nodes', met).find((e) => e.key === 'SQL').locked, 'the rest stay locked');
  ok(!codexEntries('traffic', met).find((e) => e.key === 'READ').locked, 'serving a type unlocks it');
  ok(codexEntries('traffic', met).find((e) => e.key === 'WRITE').locked, 'unserved types stay locked');
  ok(codexProgress(met).seen > codexProgress(empty).seen, 'discoveries move the progress counter');
  eq(codexProgress(empty).total, codexProgress(met).total, 'the total never changes');
  const shifts = codexEntries('shifts', { seen: {}, progress: { L01: 3 } });
  ok(!shifts[0].locked, 'a cleared shift is unlocked');
  ok(!shifts[1].locked, 'so is the next one: clearing L01 unlocks L02');
  ok(shifts[2].locked, 'L03 waits for L02');
  ok(codexEntries('mechanics', empty).every((e) => !e.locked), 'mechanics are always readable');
  ok(codexEntries('keys', empty).every((e) => !e.locked), 'so are the controls');
  for (const tab of CODEX_TABS) ok(codexEntries(tab.id, met).length > 0, tab.id + ' has entries');
});

test('codex: every tab draws, and Escape/arrows drive it in the real game', () => {
  const ctx = { seen: { nodes: { COMPUTE: true, SQL: true }, traffic: { READ: true } }, progress: { L01: 3 } };
  for (let i = 0; i < CODEX_TABS.length; i++) {
    const term = new Term(HUD.COLS, HUD.ROWS);
    const g = {
      term, sim: null, level: null, ui: { helpPage: 0 }, hitboxes: [],
      codex: { tabs: CODEX_TABS, tab: i, row: 0, entries: codexEntries(CODEX_TABS[i].id, ctx), progress: codexProgress(ctx), hint: 'hint' },
    };
    HUD.drawCodex(g);
    const ink = term.ch.filter((c) => c !== ' ').length;
    ok(ink > 600, `${CODEX_TABS[i].id} tab draws real content (${ink} glyphs)`);
    ok(term.ch.join('').includes(CODEX_TABS[i].name.slice(0, 4)), `${CODEX_TABS[i].id} tab is labelled on screen`);
    ok(g.hitboxes.length >= CODEX_TABS.length + 1, 'the codex publishes tab hitboxes');
    for (const glyph of term.ch) ok(typeof glyph === 'string' && glyph.length === 1, 'single glyph per cell');
  }
  stub.key('k'); stub.pump(1);
  ok(game.ui.codexOpen, 'the codex opens');
  const tab = () => game.ui.codexTab;
  stub.key('ArrowRight'); stub.pump(1); eq(tab(), 1, 'right arrow moves a tab');
  stub.key('ArrowRight'); stub.pump(1); eq(tab(), 2, 'and again');
  stub.key('ArrowLeft'); stub.pump(1); eq(tab(), 1, 'left arrow moves back');
  stub.key('3'); stub.pump(1); eq(tab(), 2, 'number keys jump to a tab');
  stub.key('ArrowDown'); stub.pump(1);
  eq(game.ui.codexRow, 1, 'down walks the entry list');
  const row = game.hitboxes.find((h) => h.id === 'codex-row:0');
  ok(row, 'rows are clickable');
  stub.click(row.x + 2, row.y); stub.pump(1);
  eq(game.ui.codexRow, 0, 'clicking a row selects it');
  for (const h of game.hitboxes) ok(h.w > 0 && h.h > 0, 'hitboxes are real rects');
  stub.key('k'); stub.pump(1);
  ok(!game.ui.codexOpen, 'K closes it again');
});

test('hud: the tutorial spotlights the step and dims the rest of the board', () => {
  const sim = new Sim(richLevel({ id: 'TUT', traffic: [{ type: 'READ', rps: 40, ramp: 0 }] }), { seed: 99 });
  buildFull(sim);
  for (let i = 0; i < 120; i++) sim.step();
  const term = new Term(HUD.COLS, HUD.ROWS);
  const renderer = { begin() {}, cell() {}, sprite() {}, flush() {}, instances: 0 };
  const step = {
    id: 'place-app', title: 'PLACE AN APP SERVER', card: ['Press 1 and put it in the zone.', 'It costs money.'],
    focus: [{ item: 'CACHE' }, { zone: [18, 8, 62, 26] }], allow: { build: ['COMPUTE'], wire: [], zone: [18, 8, 62, 26], ops: [] },
    check: null, primary: 'skip',
  };
  const g = {
    term, sim, level: sim.level, renderer, seedHex: 'AB', hashHex: 'CD', perfMs: 0.1, glInfo: 'stub',
    paused: false, speed: 1, toast: null, menuItems: [], progressWon: () => 0, progressTotal: () => 10,
    seedText: 'x', ui: { sel: -1, hover: -1, placeKey: 'COMPUTE', buildIdx: 0, cursorX: 30, cursorY: 20, wireFrom: -1, wireTo: -1, menu: 0, helpPage: 0, flow: false, flowType: 1, confirm: null, note: '', noteUntil: 0, followMouse: true },
    hitboxes: [],
    tut: { active: true, step, number: 2, total: 7, pending: 0, allowedBuilds: () => new Set(['COMPUTE']) },
  };
  HUD.drawFrame(g);
  ok(term.dim[8 * HUD.COLS + 40] === 1, 'the focused zone stays at full brightness');
  ok(term.dim[2 * HUD.COLS + 100] < 1, 'the far side of the board is dimmed');
  ok(Math.abs(term.dim[2 * HUD.COLS + 100] - MAX_DIM) < 1e-6, 'dimmed to the spotlight level');
  ok(term.dim[10 * HUD.COLS + 130] < 1, 'the right-hand panels are dimmed too');
  eq(term.ch[(8 - 1) * HUD.COLS + (18 - 1)], '◆', 'the focus rect is ringed');
  const amber = term.bg.filter((b) => b === PAL.amber).length;
  ok(amber > 8, 'the card has its amber title bar and buttons');
  ok(g.hitboxes.some((h) => h.id === 'tut-next') && g.hitboxes.some((h) => h.id === 'tut-skip'), 'the card publishes its buttons');
  const txt = term.ch.join('');
  ok(txt.includes('PLACE AN APP SERVER'), 'the step title is on the card');
  ok(txt.includes('zone'), 'the card body is on screen');
  // with no tutorial up, nothing is dimmed
  g.tut = null;
  HUD.drawFrame(g);
  ok(term.dim.every((d) => d === 1), 'no tutorial, no dimming');
});

// --------------------------------------------------------------------- report
const width = Math.max(...results.map((r) => r[1].length)) + 2;
for (const [status, name] of results) console.log((status === 'ok' ? ' ok ' : 'FAIL') + '  ' + name.padEnd(width) + (status === 'ok' ? '' : ''));
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
