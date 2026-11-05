// The coach says ONE short thing at a time, based on what is on the board right now.
import { NODE_DEFS, type Kind } from './content';
import { FAIL_HELP, type Sim } from './sim';

export interface CoachTarget { tool?: Kind; port?: number; node?: number; go?: boolean }
export interface Coach { text: string; tone: 'info' | 'warn' | 'bad' | 'good'; target?: CoachTarget }

interface Want { cache?: boolean; lb?: boolean; servers: number; dbs: number }
const WANT: Record<string, Want> = {
  L1: { servers: 1, dbs: 0 },
  L2: { lb: true, servers: 4, dbs: 0 },
  L3: { lb: true, servers: 3, dbs: 1 },
  L4: { cache: true, lb: true, servers: 2, dbs: 1 },
  L5: { cache: true, lb: true, servers: 3, dbs: 1 },
  L6: { cache: true, lb: true, servers: 3, dbs: 2 },
  L7: { cache: true, lb: true, servers: 3, dbs: 2 },
  L8: { cache: true, lb: true, servers: 3, dbs: 2 },
  L9: { cache: true, lb: true, servers: 4, dbs: 2 },
};

const I = (k: Kind) => NODE_DEFS[k].label;

export function coach(sim: Sim): Coach {
  const st = sim.status;
  if (st === 'running' || st === 'paused') return runningCoach(sim);

  const want = WANT[sim.level.id];
  const kindOf = (id: number) => sim.node(id)?.kind;
  const linked = (a: Kind, b: Kind) => sim.wires.some((w) => kindOf(w.from) === a && kindOf(w.to) === b);
  const first = (k: Kind) => sim.nodes.find((n) => n.kind === k);
  const servers = sim.nodes.filter((n) => n.kind === 'server');
  const dbs = sim.nodes.filter((n) => n.kind === 'db');
  const inet = sim.internetId;

  if (want.cache && !first('cache')) return { text: `Add a Cache. It answers most requests instantly.`, tone: 'info', target: { tool: 'cache' } };
  if (want.lb && !first('lb')) return { text: `Add a Load Balancer. It splits the crowd.`, tone: 'info', target: { tool: 'lb' } };
  if (servers.length < want.servers) {
    const text = sim.level.id === 'L1'
      ? `Drag a Server onto the board.`
      : sim.level.id === 'L2'
        ? `Traffic will reach 10/s. One Server handles 3/s. Build ${want.servers}. (${servers.length}/${want.servers})`
        : `Add Servers. (${servers.length}/${want.servers})`;
    return { text, tone: 'info', target: { tool: 'server' } };
  }
  if (dbs.length < want.dbs) {
    return {
      text: sim.level.id === 'L6' || sim.level.id === 'L7' || sim.level.id === 'L8' || sim.level.id === 'L9'
        ? `Boxes crash. Build 2 Databases so one can fail. (${dbs.length}/${want.dbs})`
        : `Data needs a Database. Add one.`,
      tone: 'info', target: { tool: 'db' },
    };
  }

  // wiring, front to back
  const head = want.cache ? 'cache' : want.lb ? 'lb' : 'server';
  if (!linked('internet', head)) {
    return { text: `Connect: drag from the dot on the Internet to the ${I(head)}.`, tone: 'info', target: { port: inet } };
  }
  if (want.cache && want.lb && !linked('cache', 'lb')) {
    return { text: 'Connect the Cache to the Load Balancer.', tone: 'info', target: { port: first('cache')!.id } };
  }
  const front = want.lb ? first('lb')! : want.cache ? first('cache')! : null;
  if (front) {
    const missing = servers.find((s) => !sim.wires.some((w) => w.from === front.id && w.to === s.id));
    if (missing) return { text: `Connect the ${I(front.kind)} to every Server.`, tone: 'info', target: { port: front.id } };
  }
  if (want.dbs > 0) {
    const need = Math.min(want.dbs, dbs.length);
    const lacking = servers.find((s) => sim.outs(s.id).filter((w) => kindOf(w.to) === 'db').length < need);
    if (lacking) {
      return {
        text: need > 1
          ? 'Connect every Server to both Databases.'
          : 'Connect every Server to the Database.',
        tone: 'info', target: { port: lacking.id },
      };
    }
  }
  return { text: 'All wired. Press RUN!', tone: 'good', target: { go: true } };
}

function runningCoach(sim: Sim): Coach {
  if (sim.status === 'paused') return { text: 'Paused. Fix things, then press RUN.', tone: 'info', target: { go: true } };
  const code = sim.recentFailCode;
  if (code && FAIL_HELP[code]) return { text: FAIL_HELP[code], tone: 'bad' };
  let worst: { id: number; r: number; label: string } | null = null;
  for (const n of sim.nodes) {
    const def = NODE_DEFS[n.kind];
    if (def.queue > 0 && n.down <= 0) {
      const r = n.queue.length / def.queue;
      if (r >= 0.6 && (!worst || r > worst.r)) worst = { id: n.id, r, label: def.label };
    }
  }
  if (worst) {
    return { text: `A ${worst.label} is getting overloaded. Add another and wire it in.`, tone: 'warn', target: { node: worst.id } };
  }
  const crashed = sim.nodes.find((n) => n.down > 0);
  if (crashed) return { text: `${crashed.name} crashed! Click it fast to reboot it.`, tone: 'bad', target: { node: crashed.id } };
  const hot = sim.nodes.find((n) => n.hot);
  if (hot) return { text: `${hot.name} is overheating and slowing down. Click it to cool it, or add more boxes.`, tone: 'warn', target: { node: hot.id } };
  if (sim.leaked > 3 && sim.ddos && !sim.nodes.some((n) => n.kind === 'fw')) return { text: 'Bots are hogging your servers. A Firewall at the front blocks them.', tone: 'warn', target: { tool: 'fw' } };
  if (sim.ddos) return { text: 'DDoS! Block the bots and keep the real visitors flowing.', tone: 'warn' };
  if (sim.spiking) return { text: 'Traffic spike! Hold on...', tone: 'warn' };
  if (sim.comboTier >= 3) return { text: `Combo x${sim.combo}! Revenue is x${sim.comboMult.toFixed(1)}. Do not drop a single visitor.`, tone: 'good' };
  return { text: 'Looking good. Keep an eye on the faces on each box.', tone: 'good' };
}
