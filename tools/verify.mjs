// tools/verify.mjs — headless harness: determinism, level winnability, and tick cost.
//
//   node tools/verify.mjs               # all levels: reference playthrough + do-nothing + determinism + perf
//   node tools/verify.mjs L04           # one level, verbose trace
//   node tools/verify.mjs --perf 12000  # stress the sim with N concurrent packets
//
// A "reference playthrough" is a scripted sequence of player actions. If a level cannot be won with it,
// the level is either mis-tuned or the model is broken — either way this exits non-zero so it cannot be ignored.

import { Sim, NODE_W, NODE_H, WORLD_W, WORLD_H } from '../src/sim/sim.js';
import { LEVELS, ENDLESS, NODES, NODE, TRAFFIC, T, SIM as C } from '../src/sim/content.js';

const cols = (c) => 3 + c * 18;
const rows = (r) => 2 + r * 6;
const P = (c, r) => [cols(c), rows(r)];

// ---------------------------------------------------------------- reference solutions
const SOL = {
  L01: {
    place: [['app', 'COMPUTE', ...P(1, 3)], ['db', 'SQL', ...P(3, 3)]],
    wire: [['net', 'app'], ['app', 'db']],
    at: [],
  },
  L02: {
    place: [['cdn', 'CDN', ...P(1, 1)], ['s3', 'STORAGE', ...P(3, 1)], ['app', 'COMPUTE', ...P(1, 3)], ['db', 'SQL', ...P(3, 3)]],
    wire: [['net', 'cdn'], ['cdn', 's3'], ['net', 'app'], ['app', 'db']],
    at: [],
  },
  L03: {
    place: [['app', 'COMPUTE', ...P(1, 3)], ['cache', 'CACHE', ...P(3, 3)], ['db', 'SQL', ...P(5, 3)]],
    wire: [['net', 'app'], ['app', 'cache'], ['cache', 'db']],
    at: [[8, { op: 'upgrade', node: 'cache' }]],
  },
  L04: {
    place: [['q', 'QUEUE', ...P(1, 3)], ['app', 'COMPUTE', ...P(2, 3)], ['cache', 'CACHE', ...P(3, 3)], ['db', 'NOSQL', ...P(4, 3)]],
    wire: [['net', 'q'], ['q', 'app'], ['app', 'cache'], ['cache', 'db']],
    at: [[10, { op: 'upgrade', node: 'app' }], [10, { op: 'auto', node: 'app', on: true }]],
  },
  L05: {
    place: [
      ['cdn', 'CDN', ...P(1, 1)], ['s3', 'STORAGE', ...P(3, 1)],
      ['lb', 'LOADBALANCER', ...P(1, 3)],
      ['app1', 'COMPUTE', ...P(2, 2)], ['app2', 'COMPUTE', ...P(2, 4)],
      ['db', 'SQL', ...P(4, 3)],
    ],
    wire: [['net', 'cdn'], ['cdn', 's3'], ['net', 'lb'], ['lb', 'app1'], ['lb', 'app2'], ['app1', 'db'], ['app2', 'db']],
    at: [
      [6, { op: 'auto', node: 'app1', on: true }], [6, { op: 'auto', node: 'app2', on: true }],
      [20, { op: 'upgrade', node: 'db' }], [45, { op: 'upgrade', node: 'app1' }],
    ],
  },
  L06: {
    place: [['app', 'COMPUTE', ...P(1, 3)], ['cache', 'CACHE', ...P(2, 3)], ['db', 'SQL', ...P(3, 5)], ['idx', 'SEARCH', ...P(3, 1)]],
    wire: [['net', 'app'], ['app', 'cache'], ['cache', 'db'], ['app', 'idx']],
    at: [[12, { op: 'upgrade', node: 'app' }], [12, { op: 'auto', node: 'app', on: true }]],
  },
  L07: {
    place: [
      ['app', 'COMPUTE', ...P(1, 3)], ['cache', 'CACHE', ...P(2, 3)],
      ['db', 'SQL', ...P(3, 5)], ['r1', 'REPLICA', ...P(4, 2)], ['r2', 'REPLICA', ...P(4, 4)],
    ],
    wire: [['net', 'app'], ['app', 'cache'], ['cache', 'db'], ['cache', 'r1'], ['cache', 'r2']],
    at: [
      [0, { op: 'upgrade', node: 'app' }], [5, { op: 'auto', node: 'app', on: true }],
      [25, { op: 'upgrade', node: 'cache' }], [45, { op: 'upgrade', node: 'db' }],
    ],
  },
  L08: {
    place: [
      ['cdn', 'CDN', ...P(1, 1)], ['s3', 'STORAGE', ...P(2, 1)],
      ['app', 'COMPUTE', ...P(1, 3)], ['cache', 'CACHE', ...P(2, 3)],
      ['q', 'QUEUE', ...P(1, 5)], ['db', 'NOSQL', ...P(3, 3)], ['r1', 'REPLICA', ...P(4, 3)], ['r2', 'REPLICA', ...P(3, 5)],
    ],
    wire: [
      ['net', 'cdn'], ['cdn', 's3'],
      ['net', 'app'], ['app', 'cache'], ['app', 'q'],
      ['q', 'db'], ['cache', 'r1'], ['cache', 'r2'], ['r1', 'db'], ['r2', 'db'],
    ],
    at: [[8, { op: 'auto', node: 'app', on: true }], [20, { op: 'upgrade', node: 'db' }], [40, { op: 'upgrade', node: 'cache' }]],
  },
  L09: {
    place: [
      ['waf', 'FIREWALL', ...P(1, 2)], ['cdn', 'CDN', ...P(2, 1)], ['s3', 'STORAGE', ...P(3, 1)],
      ['gw', 'GATEWAY', ...P(1, 4)],
      ['app', 'COMPUTE', ...P(2, 3)], ['cache', 'CACHE', ...P(3, 3)], ['db', 'SQL', ...P(4, 5)],
    ],
    wire: [['net', 'waf'], ['waf', 'cdn'], ['cdn', 's3'], ['waf', 'gw'], ['gw', 'app'], ['app', 'cache'], ['cache', 'db']],
    at: [[10, { op: 'auto', node: 'app', on: true }], [28, { op: 'upgrade', node: 'cache' }], [55, { op: 'upgrade', node: 'app' }]],
  },
  L10: {
    place: [
      ['gw', 'GATEWAY', ...P(1, 2)], ['app', 'COMPUTE', ...P(2, 3)],
      ['cache', 'CACHE', ...P(3, 2)], ['db', 'SQL', ...P(4, 4)], ['r1', 'REPLICA', ...P(4, 2)],
      ['gpu1', 'GPU', ...P(3, 4)], ['gpu2', 'GPU', ...P(3, 5)],
    ],
    wire: [['net', 'gw'], ['gw', 'app'], ['app', 'cache'], ['cache', 'db'], ['cache', 'r1'], ['app', 'gpu1'], ['app', 'gpu2']],
    at: [
      [0, { op: 'upgrade', node: 'app' }], [8, { op: 'auto', node: 'gpu1', on: true }],
      [8, { op: 'auto', node: 'gpu2', on: true }], [12, { op: 'auto', node: 'app', on: true }],
      [35, { op: 'upgrade', node: 'cache' }], [55, { op: 'upgrade', node: 'db' }], [75, { op: 'upgrade', node: 'r1' }],
    ],
  },
  ENDLESS: {
    place: [
      ['waf', 'FIREWALL', ...P(1, 1)], ['cdn', 'CDN', ...P(1, 2)], ['s3', 'STORAGE', ...P(2, 1)],
      ['lb', 'LOADBALANCER', ...P(1, 3)], ['app1', 'COMPUTE', ...P(2, 3)], ['app2', 'COMPUTE', ...P(2, 4)],
      ['cache', 'CACHE', ...P(3, 3)], ['idx', 'SEARCH', ...P(4, 1)],
      ['db', 'NOSQL', ...P(4, 3)], ['r1', 'REPLICA', ...P(4, 4)],
      ['gpu', 'GPU', ...P(3, 5)], ['q', 'QUEUE', ...P(2, 5)],
    ],
    wire: [
      ['net', 'waf'], ['waf', 'cdn'], ['cdn', 's3'], ['waf', 'lb'],
      ['lb', 'app1'], ['lb', 'app2'], ['app1', 'cache'], ['app2', 'cache'],
      ['cache', 'db'], ['cache', 'r1'], ['app1', 'idx'], ['app2', 'idx'],
      ['app1', 'q'], ['q', 'db'], ['app1', 'gpu'], ['app2', 'gpu'],
    ],
    at: [
      [6, { op: 'auto', node: 'app1', on: true }], [6, { op: 'auto', node: 'app2', on: true }],
      [10, { op: 'auto', node: 'gpu', on: true }],
      [30, { op: 'upgrade', node: 'cache' }], [60, { op: 'upgrade', node: 'db' }],
      [90, { op: 'upgrade', node: 'idx' }], [120, { op: 'upgrade', node: 'app1' }],
    ],
  },
};

// ---------------------------------------------------------------- harness
function makeSim(level, seed) { return new Sim(level, { seed }); }

function idsOf(place) {
  const ids = { net: 0 };
  place.forEach(([name], k) => { ids[name] = k + 1; });   // 0 is INTERNET
  return ids;
}

function playThrough(level, sol, seed, { trace = false, keepActions = true } = {}) {
  const sim = makeSim(level, seed);
  const ids = idsOf(sol.place);
  const plan = [];
  for (let k = 0; k < sol.place.length; k++) {
    const [name, type, x, y] = sol.place[k];
    plan.push({ tick: 0, op: 'place', type, x, y, name });
  }
  for (const [a, b] of sol.wire) plan.push({ tick: 0, op: 'connect', a, b });
  for (const [at, act] of sol.at) plan.push({ tick: Math.round(at * C.TICK_RATE), ...act });
  plan.sort((a, b) => a.tick - b.tick);

  let pi = 0;
  const errors = [];
  const maxTicks = Math.round(level.duration * C.TICK_RATE) + 5;
  const marks = [];
  for (let t = 0; t < maxTicks && sim.state === 'running'; t++) {
    while (pi < plan.length && plan[pi].tick <= sim.tick) {
      const p = plan[pi++];
      let res;
      if (p.op === 'place') res = sim.do('place', { type: p.type, x: p.x, y: p.y });
      else if (p.op === 'connect') res = sim.do('connect', { a: ids[p.a], b: ids[p.b] });
      else if (p.op === 'upgrade') res = sim.do('upgrade', { i: ids[p.node] });
      else if (p.op === 'auto') res = sim.do('auto', { i: ids[p.node], on: p.on });
      if (res && res.ok === false) errors.push(`t=${(p.tick / 60).toFixed(0)}s ${p.op}${p.name ? ' ' + p.name : ''}${p.node ? ' ' + p.node : ''}: ${res.err}`);
    }
    sim.step();
    if (trace && sim.tick % 600 === 0) marks.push(snapshot(sim));
  }
  return { sim, errors, marks };
}

function snapshot(sim) {
  const top = [];
  for (let i = 0; i < sim.nodes.count; i++) {
    const info = sim.nodeInfo(i);
    if (info.q > 0 || info.util > 0.6) top.push(`${info.short}${info.inst > 1 ? 'x' + info.inst : ''} u=${(info.util * 100) | 0}% q=${info.q}/${info.qCap}`);
  }
  return `t=${(sim.tick / 60).toFixed(0)}s done=${sim.completed} err=${sim.dropped} rep=${sim.rep.toFixed(0)} $=${sim.money.toFixed(0)} live=${sim.packets.live} | ${top.slice(0, 5).join('  ')}`;
}

function verdict(sim, level) {
  const o = level.objectives;
  return {
    state: sim.state, reason: sim.reason, done: sim.completed, err: sim.dropped,
    rep: Math.round(sim.rep), money: Math.round(sim.money), p50: Math.round(sim.p50()), p99: Math.round(sim.p99()),
    stars: sim.stars(), live: sim.packets.live, peak: sim.packets.peak, hash: sim.hash(),
    target: o.complete, errMax: o.maxErrors,
  };
}

function fmt(v, level) {
  const ok = v.state === 'won' ? 'WIN ' : 'LOSS';
  const star = v.stars ? '★'.repeat(v.stars) : '   ';
  return `${ok} ${star}  done ${String(v.done).padStart(6)}/${String(v.target).padStart(6)}  err ${String(v.err).padStart(5)}/${String(v.errMax).padStart(5)}  rep ${String(v.rep).padStart(3)}  $${String(v.money).padStart(5)}  p50 ${String(v.p50).padStart(4)}ms p99 ${String(v.p99).padStart(5)}ms  live ${v.live}  ${v.reason}`;
}

function doNothing(level) {
  const sim = makeSim(level, 12345);
  const maxTicks = Math.round(level.duration * C.TICK_RATE) + 5;
  for (let t = 0; t < maxTicks && sim.state === 'running'; t++) sim.step();
  return verdict(sim, level);
}

function perfTest(concurrent) {
  // Synthetic load: enough APP+CACHE+DB capacity that the bottleneck is the *number of live packets*.
  const level = {
    id: 'PERF', name: 'perf', budget: 1e9, duration: 600, startRep: 1e9, traffic: [],
    objectives: { complete: 1e12, maxErrors: 1e12, endless: true }, stars: {}, incidents: [],
  };
  const sim = makeSim(level, 7);
  const mk = (t, x, y) => sim.do('place', { type: t, x, y });
  const app = mk('COMPUTE', cols(1), rows(3));
  const cache = mk('CACHE', cols(2), rows(3));
  const db = mk('SQL', cols(3), rows(3));
  for (let i = 0; i < 6; i++) sim.do('upgrade', { i: app.i });
  for (let i = 0; i < 6; i++) sim.do('upgrade', { i: cache.i });
  for (let i = 0; i < 6; i++) sim.do('upgrade', { i: db.i });
  sim.do('connect', { a: 0, b: app.i });
  sim.do('connect', { a: app.i, b: cache.i });
  sim.do('connect', { a: cache.i, b: db.i });
  // Hold a steady-state load: arrivals far exceed service capacity, so the pool saturates and stays there.
  const rate = concurrent * 60 / 4;
  sim.rateNow[T.READ] = rate;
  sim.rateNow[T.WRITE] = rate;
  sim.rateNow[T.STATIC] = 0;
  const t0 = process.hrtime.bigint();
  let peak = 0, busy = 0;
  for (let i = 0; i < 600; i++) {
    sim.step();
    if (sim.packets.live > peak) peak = sim.packets.live;
    busy += sim.packets.live;
  }
  const t1 = process.hrtime.bigint();
  return { msPerTick: Number(t1 - t0) / 1e6 / 600, peak, avg: Math.round(busy / 600), done: sim.completed, dropped: sim.dropped };
}

// ---------------------------------------------------------------- main
function main() {
const args = process.argv.slice(2);
const only = args.find((a) => /^L\d\d$|^ENDLESS$/i.test(a));
const perfArg = args.indexOf('--perf');
const all = [...LEVELS, ENDLESS];
let failures = 0;

if (perfArg >= 0) {
  const n = parseInt(args[perfArg + 1] || '12000', 10);
  const r = perfTest(n);
  console.log(`perf: arrival ${n}/s → peak live ${r.peak}, mean live ${r.avg}, ${r.done} completed, ${r.dropped} dropped over 600 ticks`);
  console.log(`      sim cost ${r.msPerTick.toFixed(3)} ms/tick (budget at 60Hz = 16.7 ms)`);
  process.exit(0);
}

const pick = only ? all.filter((l) => l.id === only.toUpperCase()) : all;
if (!pick.length) { console.error('no such level'); process.exit(2); }

console.log('KERNEL ARCHITECT — headless verification\n');
for (const level of pick) {
  const sol = SOL[level.id];
  if (!sol) { console.log(`${level.id}: (no reference solution — skipped)`); continue; }
  const trace = Boolean(only);
  const a = playThrough(level, sol, 0xDEADBEEF, { trace });
  const b = playThrough(level, sol, 0xDEADBEEF);
  const va = verdict(a.sim, level), vb = verdict(b.sim, level);
  const det = va.hash === vb.hash;
  if (!det) failures++;
  const refOk = level.objectives.endless ? (va.state === 'won' || va.done >= 20000) : va.state === 'won';
  if (!refOk) failures++;
  if (!trace && a.errors.length) { console.log(`${level.id}: build errors:`); a.errors.forEach((e) => console.log('   ' + e)); }
  console.log(`${level.id} ${level.name}`);
  console.log(`   reference   ${fmt(va, level)}`);
  if (trace) {
    for (const m of a.marks) console.log('   trace ' + m);
    if (a.errors.length) a.errors.forEach((e) => console.log('   build error: ' + e));
    const pm = a.sim.postmortem();
    if (pm.reasons.length) console.log('   drops by reason: ' + pm.reasons.map((r) => `${r.reason}=${r.n}`).join(', '));
    if (pm.worst.length) console.log('   worst nodes: ' + pm.worst.map((w) => `${w.short}(${w.drops} drops, peakQ ${w.peakQ}/${w.qCap})`).join(', '));
    pm.advice.forEach((ad) => console.log('   advice: ' + ad));
  }
  if (det) console.log(`   determinism ok (state hash ${va.hash.toString(16).toUpperCase()})`);
  else { console.log(`   DETERMINISM FAILED: ${va.hash.toString(16)} vs ${vb.hash.toString(16)}`); }
  if (a.errors.length) console.log(`   ${a.errors.length} build warning(s): ${a.errors[0]}`);
  // do-nothing run must fail (otherwise a level is winnable by idling)
  const idle = doNothing(level);
  const idleOk = level.objectives.endless
    ? (idle.state === 'lost' || idle.done < 0.05 * va.done)
    : idle.done < level.objectives.complete;
  if (!idleOk) { failures++; console.log(`   !! do-nothing run should not win: ${fmt(idle, level)}`); }
  else console.log(`   idle run    ${idle.state.toUpperCase()} after ${idle.done} requests (expected)`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
}

// Run only when executed directly (`node tools/verify.mjs`); importable for the test suite.
if (process.argv[1] && /verify\.mjs$/.test(process.argv[1])) main();

export { SOL, playThrough, doNothing, perfTest, verdict, snapshot, makeSim, cols, rows };
