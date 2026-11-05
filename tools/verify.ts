// Headless balance check:  npx tsx tools/verify.ts [L1..L9]
// For every level: a reference build must WIN, an empty board must LOSE. Same seed => same result.
import { Sim } from '../src/game/sim';
import { LEVELS, type Kind } from '../src/game/content';

type Spec = { nodes: [Kind, number, number][]; wires: [number, number][]; up?: number[] }; // index -1 = internet; up = node indexes to overclock once

const S3: [number, number][] = [[480, 40], [480, 236], [480, 432]];
const refs: Record<string, Spec> = {
  L1: { nodes: [['server', 300, 236]], wires: [[-1, 0]] },
  L2: {
    nodes: [['lb', 200, 236], ['server', 400, 20], ['server', 400, 150], ['server', 400, 280], ['server', 400, 410]],
    wires: [[-1, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  },
  L3: {
    nodes: [['lb', 200, 236], ['server', 400, 40], ['server', 400, 236], ['server', 400, 432], ['db', 640, 236]],
    wires: [[-1, 0], [0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 4]],
  },
  L4: {
    nodes: [['cache', 168, 236], ['lb', 320, 236], ['server', 480, 110], ['server', 480, 360], ['db', 700, 236]],
    wires: [[-1, 0], [0, 1], [1, 2], [1, 3], [2, 4], [3, 4]],
  },
  L5: {
    nodes: [['cache', 168, 236], ['lb', 320, 236], ['server', ...S3[0]], ['server', ...S3[1]], ['server', ...S3[2]], ['db', 700, 236]],
    wires: [[-1, 0], [0, 1], [1, 2], [1, 3], [1, 4], [2, 5], [3, 5], [4, 5]],
    up: [2, 3, 4],
  },
  L6: {
    nodes: [['cache', 168, 236], ['lb', 320, 236], ['server', ...S3[0]], ['server', ...S3[1]], ['server', ...S3[2]], ['db', 700, 110], ['db', 700, 350]],
    wires: [[-1, 0], [0, 1], [1, 2], [1, 3], [1, 4], [2, 5], [2, 6], [3, 5], [3, 6], [4, 5], [4, 6]],
    up: [2, 3, 4],
  },
  L7: {
    nodes: [['fw', 152, 236], ['cache', 280, 236], ['lb', 408, 236], ['server', 560, 40], ['server', 560, 236], ['server', 560, 432], ['db', 780, 110], ['db', 780, 350]],
    wires: [[-1, 0], [0, 1], [1, 2], [2, 3], [2, 4], [2, 5], [3, 6], [3, 7], [4, 6], [4, 7], [5, 6], [5, 7]],
    up: [3, 4, 5],
  },
  L8: {
    nodes: [['fw', 152, 236], ['cache', 280, 236], ['lb', 408, 236], ['server', 560, 40], ['server', 560, 236], ['server', 560, 432], ['db', 780, 110], ['db', 780, 350]],
    wires: [[-1, 0], [0, 1], [1, 2], [2, 3], [2, 4], [2, 5], [3, 6], [3, 7], [4, 6], [4, 7], [5, 6], [5, 7]],
    up: [3, 4, 5],
  },
  L9: {
    nodes: [['fw', 152, 236], ['cache', 280, 236], ['lb', 408, 236], ['server', 560, 20], ['server', 560, 150], ['server', 560, 280], ['server', 560, 410], ['db', 780, 110], ['db', 780, 350]],
    wires: [[-1, 0], [0, 1], [1, 2], [2, 3], [2, 4], [2, 5], [2, 6], [3, 7], [3, 8], [4, 7], [4, 8], [5, 7], [5, 8], [6, 7], [6, 8]],
    up: [3, 4, 5, 6, 7, 8],
  },
};

const weak: Record<string, Spec> = {
  L2: { nodes: [['lb', 200, 236], ['server', 400, 110], ['server', 400, 360]], wires: [[-1, 0], [0, 1], [0, 2]] },
  L3: { nodes: [['lb', 200, 236], ['server', 400, 110], ['server', 400, 360], ['db', 640, 236]], wires: [[-1, 0], [0, 1], [0, 2], [1, 3], [2, 3]] },
  
  L4: { nodes: [['lb', 200, 236], ['server', 400, 40], ['server', 400, 236], ['server', 400, 432], ['db', 640, 236]], wires: [[-1, 0], [0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 4]] },
  L5: { nodes: [['cache', 168, 236], ['lb', 320, 236], ['server', 480, 110], ['server', 480, 360], ['db', 700, 236]], wires: [[-1, 0], [0, 1], [1, 2], [1, 3], [2, 4], [3, 4]] },
  L6: { nodes: [['cache', 168, 236], ['lb', 320, 236], ['server', 480, 236], ['db', 700, 236]], wires: [[-1, 0], [0, 1], [1, 2], [2, 3]] },
};

function run(levelId: string, spec: Spec | null, maxT = 400) {
  const level = LEVELS.find((l) => l.id === levelId)!;
  const sim = new Sim(level);
  const ids: number[] = [];
  if (spec) {
    for (const [k, x, y] of spec.nodes) {
      const r = sim.place(k, x, y);
      if (!r.ok) throw new Error(`${levelId}: cannot place ${k} (${r.reason})`);
      ids.push(r.node!.id);
    }
    for (const [a, b] of spec.wires) {
      const r = sim.wire(a < 0 ? sim.internetId : ids[a], ids[b]);
      if (!r.ok) throw new Error(`${levelId}: cannot wire ${a}->${b} (${r.reason})`);
    }
  }
  sim.go();
  const dt = 1 / 30;
  let nextAct = 0;
  while (sim.status === 'running' && sim.t < maxT) {
    sim.step(dt);
    // a decent human: pokes crashed / hot boxes about twice a second, and overclocks when there is spare cash
    if (spec && sim.t >= nextAct) {
      nextAct = sim.t + 0.5;
      for (const n of sim.nodes) if (n.down > 0 || n.hot) { sim.poke(n.id); break; }
      for (const u of spec.up ?? []) {
        const id = ids[u]; const c = sim.upgradeCost(id);
        if (c !== null && sim.cash >= c + 40 && sim.node(id)!.lvl <= Math.min(...(spec.up ?? []).map((k) => sim.node(ids[k])!.lvl))) { sim.upgrade(id); break; }
      }
    }
  }
  return sim;
}

const only = process.argv[2];
let bad = 0;
for (const l of LEVELS) {
  if (only && only !== l.id) continue;
  const ref = run(l.id, refs[l.id], l.endless ? 600 : 400);
  const none = run(l.id, null);
  const wk = weak[l.id] ? run(l.id, weak[l.id]) : null;
  const codes = Object.entries(ref.byCode).filter(([c]) => c !== '200').map(([c, n]) => `${c}×${n}`).join(' ');
  const winOk = l.endless ? ref.t > 120 : ref.status === 'won';
  const loseOk = none.status === 'lost';
  if (!winOk || !loseOk) bad++;
  console.log(
    `${l.id} ${l.name.padEnd(20)} ref:${ref.status.padEnd(7)} ${ref.stars}★ t=${ref.t.toFixed(0).padStart(3)}s ok=${String(ref.ok).padStart(3)} ` +
      `fail=${String(ref.fail).padStart(3)} up=${(ref.uptime * 100).toFixed(1)}% cash=$${Math.round(ref.cash)} happy=${ref.happy.toFixed(0)} [${codes}]  | empty:${none.status} t=${none.t.toFixed(0)}s ` +
      `${winOk && loseOk ? '✔' : '✘'}` + ` combo=${ref.bestCombo} blk=${ref.blocked} leak=${ref.leaked} vip=${ref.vipOk}/${ref.vipOk + ref.vipLost}` + (wk ? `  | weak:${wk.status} ${wk.stars}★ t=${wk.t.toFixed(0)}s up=${(wk.uptime * 100).toFixed(0)}%` : ''),
  );
}
process.exit(bad ? 1 : 0);
