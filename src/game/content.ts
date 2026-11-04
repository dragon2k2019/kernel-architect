// All game content + tuning in one place. Five boxes, two kinds of request, seven levels.
// No emoji anywhere: icons are vector (see ui/icons.tsx) so they look the same on every device.
import type { IconName } from '../ui/icons';

export type Kind = 'internet' | 'server' | 'lb' | 'cache' | 'db';
export type ReqType = 'page' | 'data';

export interface NodeDef {
  kind: Kind;
  label: string; // the friendly name (big)
  tag: string; // the real-world name (small, mono) — for the nerds
  short: string; // log/instance prefix
  blurb: string; // ONE short line
  analogy: string; // real-life comparison for non-engineers
  how: string; // what it does in this game
  wiring: string; // what it can connect to
  tip: string; // when to use it
  nerd: string; // the engineer's one-liner
  cost: number;
  rate: number; // requests/sec it can work through (0 = instant)
  queue: number; // how many can wait in line
  color: string; // accent
  key: string; // keyboard shortcut
}

export const NODE_DEFS: Record<Kind, NodeDef> = {
  internet: {
    kind: 'internet', label: 'Internet', tag: '0.0.0.0/0', short: 'edge',
    blurb: 'Where your visitors come from.',
    analogy: 'The crowd queueing outside your shop.',
    how: 'Sends visitors at your system. The more popular you get, the faster they arrive.',
    wiring: 'Drag from its glowing dot to your first box. It has exactly one outgoing wire.',
    tip: 'Everything you build starts here. If it is not wired, visitors get a 404.',
    nerd: 'Public ingress. Traffic = requests per second.',
    cost: 0, rate: 0, queue: 0, color: '#7dcfff', key: '',
  },
  server: {
    kind: 'server', label: 'Server', tag: 'api', short: 'api',
    blurb: 'Answers pages. Fetches data from a database.',
    analogy: 'A cashier. One customer at a time, but quick.',
    how: 'Serves page requests directly. For data requests it has to ask a Database, then reply.',
    wiring: 'Takes wires from the Internet, a Load Balancer or a Cache. Wire it to a Database for data.',
    tip: 'One Server handles about 3 visitors per second. Need more? Build more and put a Load Balancer in front.',
    nerd: 'Stateless app server. 3 rps, queue depth 8, 504 after 8s.',
    cost: 40, rate: 3, queue: 8, color: '#9ece6a', key: '1',
  },
  lb: {
    kind: 'lb', label: 'Load Balancer', tag: 'nginx', short: 'lb',
    blurb: 'Splits traffic evenly between boxes.',
    analogy: 'The host at a restaurant pointing guests to free tables.',
    how: 'Instantly passes each visitor to the next wired box in turn, and skips boxes that have crashed.',
    wiring: 'Takes wires from the Internet or a Cache. Wire it to every Server you want to share the load.',
    tip: 'Build it once. Then wire it to every Server. It never gets tired.',
    nerd: 'Round-robin with health checks. Zero latency, no queue.',
    cost: 50, rate: 0, queue: 0, color: '#bb9af7', key: '2',
  },
  db: {
    kind: 'db', label: 'Database', tag: 'postgres', short: 'pg',
    blurb: 'Stores data. Only servers can talk to it.',
    analogy: 'The warehouse out back. Slow to fetch from, but it has everything.',
    how: 'Answers data requests (the square visitors). Pages never need it.',
    wiring: 'Only accepts wires from Servers. It is the end of the line, so it has no outgoing wire.',
    tip: 'Wire every Server to it. For crash-proof builds add two Databases.',
    nerd: 'Primary store. 4 rps, queue depth 8. Rejects non-server callers with 403.',
    cost: 80, rate: 4, queue: 8, color: '#e0af68', key: '3',
  },
  cache: {
    kind: 'cache', label: 'Cache', tag: 'redis', short: 'redis',
    blurb: 'Answers 2 of every 3 requests instantly.',
    analogy: 'Sticky notes with answers you already looked up.',
    how: 'Instantly answers about 65% of visitors itself. The rest are passed on to the next box.',
    wiring: 'Sits right after the Internet. Wire it to a Load Balancer or straight to Servers.',
    tip: 'The cheapest way to survive a rush. It takes load off everything behind it.',
    nerd: 'In-memory cache. 65% hit rate, zero latency, no queue.',
    cost: 60, rate: 0, queue: 0, color: '#ff9e64', key: '4',
  },
};

export const TOOL_ORDER: Kind[] = ['server', 'lb', 'db', 'cache'];

export const REQ = {
  page: { label: 'page', color: '#7dcfff', revenue: 1, desc: 'A visitor who wants a web page. Any Server can answer.' },
  data: { label: 'data', color: '#e0af68', revenue: 2, desc: 'A visitor who wants stored data. A Server must ask a Database. Pays double.' },
} as const;

export const TUNING = {
  cacheHit: 0.65, // chance a cache answers a request
  timeout: 8, // seconds in the system before a 504
  wireSpeed: 240, // px/s packets travel
  failCost: 8, // happiness lost per failed request
  okGain: 0.4, // happiness regained per good request
  crashSeconds: 8,
  sellRefund: 0.7,
  latencyScale: 100, // 1 sim-second shows as 100 ms
};

export interface Wave { until: number; from: number; to: number }
export interface GameEvent {
  at: number;
  kind: 'spike' | 'crash';
  dur?: number;
  mult?: number;
  target?: 'server' | 'db' | 'any';
}

export interface Level {
  id: string;
  n: number;
  name: string;
  icon: IconName;
  blurb: string; // ONE sentence, shown on the intro card
  goalText: string;
  goal: number | null; // null = endless
  tools: Kind[];
  newTool?: Kind;
  cash: number;
  dataShare: number; // share of requests that need the database
  waves: Wave[]; // requests per second over time
  events: GameEvent[];
  endless?: boolean;
}

export const LEVELS: Level[] = [
  {
    id: 'L1', n: 1, name: 'Hello, World', icon: 'sprout',
    blurb: 'Visitors are coming. Give them a server.',
    goalText: 'Serve 20 visitors', goal: 20, tools: ['server'], newTool: 'server',
    cash: 100, dataShare: 0, waves: [{ until: 20, from: 0.8, to: 1.6 }], events: [],
  },
  {
    id: 'L2', n: 2, name: 'Going Viral', icon: 'trend',
    blurb: "One server can't keep up. Split the crowd.",
    goalText: 'Serve 250 visitors', goal: 250, tools: ['server', 'lb'], newTool: 'lb',
    cash: 260, dataShare: 0, waves: [{ until: 20, from: 1.5, to: 10 }], events: [],
  },
  {
    id: 'L3', n: 3, name: "Where's My Data?", icon: 'database',
    blurb: 'Some visitors want data. Servers fetch it from a database.',
    goalText: 'Serve 230 visitors', goal: 230, tools: ['server', 'lb', 'db'], newTool: 'db',
    cash: 320, dataShare: 0.5, waves: [{ until: 20, from: 2, to: 8.5 }], events: [],
  },
  {
    id: 'L4', n: 4, name: 'Cache Money', icon: 'bolt',
    blurb: "Don't repeat work. Remember the answers.",
    goalText: 'Serve 400 visitors', goal: 400, tools: ['server', 'lb', 'db', 'cache'], newTool: 'cache',
    cash: 330, dataShare: 0.5, waves: [{ until: 22, from: 3, to: 16 }], events: [],
  },
  {
    id: 'L5', n: 5, name: 'Front Page of HN', icon: 'news',
    blurb: 'A huge traffic spike is coming. Be ready.',
    goalText: 'Serve 900 visitors', goal: 900, tools: ['server', 'lb', 'db', 'cache'],
    cash: 380, dataShare: 0.45, waves: [{ until: 40, from: 6, to: 9 }],
    events: [
      { at: 25, kind: 'spike', dur: 14, mult: 3 },
      { at: 62, kind: 'spike', dur: 14, mult: 3.5 },
    ],
  },
  {
    id: 'L6', n: 6, name: 'Friday 5pm Deploy', icon: 'skull',
    blurb: 'Boxes will crash. Always have a backup.',
    goalText: 'Serve 800 visitors', goal: 800, tools: ['server', 'lb', 'db', 'cache'],
    cash: 420, dataShare: 0.45, waves: [{ until: 40, from: 6, to: 10 }],
    events: [
      { at: 20, kind: 'crash', target: 'server' },
      { at: 42, kind: 'crash', target: 'db' },
      { at: 60, kind: 'spike', dur: 12, mult: 2 },
      { at: 70, kind: 'crash', target: 'server' },
      { at: 92, kind: 'crash', target: 'any' },
    ],
  },
  {
    id: 'L7', n: 7, name: 'Production', icon: 'infinity',
    blurb: 'No finish line. How long can you stay up?',
    goalText: 'Survive as long as you can', goal: null, tools: ['server', 'lb', 'db', 'cache'],
    cash: 450, dataShare: 0.45, waves: [{ until: 1, from: 4, to: 4 }], endless: true,
    events: Array.from({ length: 60 }, (_, i): GameEvent =>
      i % 3 === 2
        ? { at: 30 + i * 22, kind: 'crash', target: 'any' }
        : { at: 30 + i * 22, kind: 'spike', dur: 12, mult: 2 }),
  },
];

export function rateAt(level: Level, t: number): number {
  if (level.endless) return Math.min(34, 4 + t * 0.075);
  let start = 0;
  let prev = level.waves[0].from;
  for (const w of level.waves) {
    if (t <= w.until) {
      const k = (t - start) / Math.max(0.001, w.until - start);
      return w.from + (w.to - w.from) * k;
    }
    start = w.until;
    prev = w.to;
  }
  return prev;
}
