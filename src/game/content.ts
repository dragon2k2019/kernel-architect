// All game content + tuning in one place. Five boxes, two kinds of request, seven levels.

export type Kind = 'internet' | 'server' | 'lb' | 'cache' | 'db';
export type ReqType = 'page' | 'data';

export interface NodeDef {
  kind: Kind;
  icon: string;
  label: string; // the friendly name (big)
  tag: string; // the real-world name (small, mono) — for the nerds
  short: string; // log/instance prefix
  blurb: string; // ONE short line
  cost: number;
  rate: number; // requests/sec it can work through (0 = instant)
  queue: number; // how many can wait in line
  color: string; // accent
  key: string; // keyboard shortcut
}

export const NODE_DEFS: Record<Kind, NodeDef> = {
  internet: {
    kind: 'internet', icon: '🌐', label: 'Internet', tag: '0.0.0.0/0', short: 'edge',
    blurb: 'Where your visitors come from.', cost: 0, rate: 0, queue: 0, color: '#7dcfff', key: '',
  },
  server: {
    kind: 'server', icon: '🖥️', label: 'Server', tag: 'api', short: 'api',
    blurb: 'Answers pages. Fetches data from a database.', cost: 40, rate: 3, queue: 8, color: '#9ece6a', key: '1',
  },
  lb: {
    kind: 'lb', icon: '⚖️', label: 'Load Balancer', tag: 'nginx', short: 'lb',
    blurb: 'Splits traffic evenly between boxes.', cost: 50, rate: 0, queue: 0, color: '#bb9af7', key: '2',
  },
  db: {
    kind: 'db', icon: '🗄️', label: 'Database', tag: 'postgres', short: 'pg',
    blurb: 'Stores data. Only servers can talk to it.', cost: 80, rate: 4, queue: 8, color: '#e0af68', key: '3',
  },
  cache: {
    kind: 'cache', icon: '⚡', label: 'Cache', tag: 'redis', short: 'redis',
    blurb: 'Answers 2 of every 3 requests instantly.', cost: 60, rate: 0, queue: 0, color: '#ff9e64', key: '4',
  },
};

export const TOOL_ORDER: Kind[] = ['server', 'lb', 'db', 'cache'];

export const REQ = {
  page: { icon: '📄', label: 'page', color: '#7dcfff', revenue: 1 },
  data: { icon: '🗃️', label: 'data', color: '#e0af68', revenue: 2 },
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
  emoji: string;
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
    id: 'L1', n: 1, name: 'Hello, World', emoji: '🌱',
    blurb: 'Visitors are coming. Give them a server.',
    goalText: 'Serve 20 visitors', goal: 20, tools: ['server'], newTool: 'server',
    cash: 100, dataShare: 0, waves: [{ until: 20, from: 0.8, to: 1.6 }], events: [],
  },
  {
    id: 'L2', n: 2, name: 'Going Viral', emoji: '📈',
    blurb: "One server can't keep up. Split the crowd.",
    goalText: 'Serve 250 visitors', goal: 250, tools: ['server', 'lb'], newTool: 'lb',
    cash: 260, dataShare: 0, waves: [{ until: 20, from: 1.5, to: 10 }], events: [],
  },
  {
    id: 'L3', n: 3, name: "Where's My Data?", emoji: '🗃️',
    blurb: 'Some visitors want data. Servers fetch it from a database.',
    goalText: 'Serve 230 visitors', goal: 230, tools: ['server', 'lb', 'db'], newTool: 'db',
    cash: 320, dataShare: 0.5, waves: [{ until: 20, from: 2, to: 8.5 }], events: [],
  },
  {
    id: 'L4', n: 4, name: 'Cache Money', emoji: '⚡',
    blurb: "Don't repeat work. Remember the answers.",
    goalText: 'Serve 400 visitors', goal: 400, tools: ['server', 'lb', 'db', 'cache'], newTool: 'cache',
    cash: 330, dataShare: 0.5, waves: [{ until: 22, from: 3, to: 16 }], events: [],
  },
  {
    id: 'L5', n: 5, name: 'Front Page of HN', emoji: '📰',
    blurb: 'A huge traffic spike is coming. Be ready.',
    goalText: 'Serve 900 visitors', goal: 900, tools: ['server', 'lb', 'db', 'cache'],
    cash: 380, dataShare: 0.45, waves: [{ until: 40, from: 6, to: 9 }],
    events: [
      { at: 25, kind: 'spike', dur: 14, mult: 3 },
      { at: 62, kind: 'spike', dur: 14, mult: 3.5 },
    ],
  },
  {
    id: 'L6', n: 6, name: 'Friday 5pm Deploy', emoji: '💀',
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
    id: 'L7', n: 7, name: 'Production', emoji: '♾️',
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
