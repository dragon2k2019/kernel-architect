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
};

const I = (k: Kind) => NODE_DEFS[k].icon;

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

  if (want.cache && !first('cache')) return { text: `Add a ${I('cache')} Cache. It answers most requests instantly.`, tone: 'info', target: { tool: 'cache' } };
  if (want.lb && !first('lb')) return { text: `Add a ${I('lb')} Load Balancer. It splits the crowd.`, tone: 'info', target: { tool: 'lb' } };
  if (servers.length < want.servers) {
    const text = sim.level.id === 'L1'
      ? `Drag a ${I('server')} Server onto the board.`
      : sim.level.id === 'L2'
        ? `Traffic will reach 10/s. One ${I('server')} handles 3/s. Build ${want.servers}. (${servers.length}/${want.servers})`
        : `Add ${I('server')} Servers. (${servers.length}/${want.servers})`;
    return { text, tone: 'info', target: { tool: 'server' } };
  }
  if (dbs.length < want.dbs) {
    return {
      text: sim.level.id === 'L6' || sim.level.id === 'L7'
        ? `Boxes crash. Build 2 ${I('db')} Databases so one can fail. (${dbs.length}/${want.dbs})`
        : `Data needs a ${I('db')} Database. Add one.`,
      tone: 'info', target: { tool: 'db' },
    };
  }

  // wiring, front to back
  const head = want.cache ? 'cache' : want.lb ? 'lb' : 'server';
  if (!linked('internet', head)) {
    return { text: `Connect: drag from the dot on ${I('internet')} to the ${I(head)}.`, tone: 'info', target: { port: inet } };
  }
  if (want.cache && want.lb && !linked('cache', 'lb')) {
    return { text: `Connect ${I('cache')} to ${I('lb')}.`, tone: 'info', target: { port: first('cache')!.id } };
  }
  const front = want.lb ? first('lb')! : want.cache ? first('cache')! : null;
  if (front) {
    const missing = servers.find((s) => !sim.wires.some((w) => w.from === front.id && w.to === s.id));
    if (missing) return { text: `Connect ${I(front.kind)} to every ${I('server')}.`, tone: 'info', target: { port: front.id } };
  }
  if (want.dbs > 0) {
    const need = Math.min(want.dbs, dbs.length);
    const lacking = servers.find((s) => sim.outs(s.id).filter((w) => kindOf(w.to) === 'db').length < need);
    if (lacking) {
      return {
        text: need > 1
          ? `Connect every ${I('server')} to both ${I('db')} Databases.`
          : `Connect every ${I('server')} to the ${I('db')} Database.`,
        tone: 'info', target: { port: lacking.id },
      };
    }
  }
  return { text: 'All wired. Press ▶ GO!', tone: 'good', target: { go: true } };
}

function runningCoach(sim: Sim): Coach {
  if (sim.status === 'paused') return { text: 'Paused. Fix things, then press ▶ GO.', tone: 'info', target: { go: true } };
  const code = sim.recentFailCode;
  if (code && FAIL_HELP[code]) return { text: FAIL_HELP[code], tone: 'bad' };
  let worst: { id: number; r: number; label: string; icon: string } | null = null;
  for (const n of sim.nodes) {
    const def = NODE_DEFS[n.kind];
    if (def.queue > 0 && n.down <= 0) {
      const r = n.queue.length / def.queue;
      if (r >= 0.6 && (!worst || r > worst.r)) worst = { id: n.id, r, label: def.label, icon: def.icon };
    }
  }
  if (worst) {
    return { text: `${worst.icon} is getting overloaded. Add another ${worst.label} and wire it in.`, tone: 'warn', target: { node: worst.id } };
  }
  if (sim.spiking) return { text: '📰 Spike! Hold on…', tone: 'warn' };
  return { text: '👍 Looking good. Watch the faces: 🙂 → 😅 → 🥵', tone: 'good' };
}
