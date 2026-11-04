// Headless balance check:  npx tsx tools/verify.ts [L1..L7]
// For every level: a reference build must WIN, an empty board must LOSE. Same seed => same result.
import { Sim } from '../src/game/sim';
import { LEVELS, type Kind } from '../src/game/content';

type Spec = { nodes: [Kind, number, number][]; wires: [number, number][] }; // index -1 = internet

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
  },
  L6: {
    nodes: [['cache', 168, 236], ['lb', 320, 236], ['server', ...S3[0]], ['server', ...S3[1]], ['server', ...S3[2]], ['db', 700, 110], ['db', 700, 350]],
    wires: [[-1, 0], [0, 1], [1, 2], [1, 3], [1, 4], [2, 5], [2, 6], [3, 5], [3, 6], [4, 5], [4, 6]],
  },
  L7: {
    nodes: [['cache', 168, 236], ['lb', 320, 236], ['server', ...S3[0]], ['server', ...S3[1]], ['server', ...S3[2]], ['db', 700, 110], ['db', 700, 350]],
    wires: [[-1, 0], [0, 1], [1, 2], [1, 3], [1, 4], [2, 5], [2, 6], [3, 5], [3, 6], [4, 5], [4, 6]],
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
  while (sim.status === 'running' && sim.t < maxT) sim.step(dt);
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
      `${winOk && loseOk ? '✔' : '✘'}` + (wk ? `  | weak:${wk.status} ${wk.stars}★ t=${wk.t.toFixed(0)}s up=${(wk.uptime * 100).toFixed(0)}%` : ''),
  );
}
process.exit(bad ? 1 : 0);
