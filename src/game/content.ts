// All game content + tuning in one place. Five boxes, four kinds of request, nine levels.
// No emoji anywhere: icons are vector (see ui/icons.tsx) so they look the same on every device.
import type { IconName } from '../ui/icons';

export type Kind = 'internet' | 'server' | 'lb' | 'cache' | 'db' | 'fw';
export type ReqType = 'page' | 'data' | 'bot' | 'vip';

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
  fw: {
    kind: 'fw', label: 'Firewall', tag: 'waf', short: 'waf',
    blurb: 'Blocks bots before they clog your servers.',
    analogy: 'A bouncer who spots troublemakers at the door.',
    how: 'Instantly drops about 9 of every 10 bots (red diamonds). Real visitors walk straight through.',
    wiring: 'Sits right after the Internet. Wire it to a Cache, a Load Balancer or Servers.',
    tip: 'Bots pay nothing and hog your servers. Put the Firewall first in line, and every block pays $1.',
    nerd: 'WAF. 90% bot block rate, zero latency, no queue.',
    cost: 70, rate: 0, queue: 0, color: '#2ac3de', key: '5',
  },
};

export const TOOL_ORDER: Kind[] = ['server', 'lb', 'db', 'cache', 'fw'];

export const REQ = {
  page: { label: 'page', color: '#7dcfff', revenue: 1, desc: 'A visitor who wants a web page. Any Server can answer.' },
  data: { label: 'data', color: '#e0af68', revenue: 2, desc: 'A visitor who wants stored data. A Server must ask a Database. Pays double.' },
  bot: { label: 'bot', color: '#ff4d6d', revenue: 0, desc: 'A scraper bot. Pays nothing, hogs a server and wrecks your combo. Block it with a Firewall.' },
  vip: { label: 'VIP', color: '#fff27a', revenue: 6, desc: 'A golden customer. Pays 6x, boosts your combo, but gives up after 4 seconds.' },
} as const;

export const TUNING = {
  cacheHit: 0.65, // chance a cache answers a request
  timeout: 8, // seconds in the system before a 504
  wireSpeed: 240, // px/s packets travel
  failCost: 8, // happiness lost per failed request
  okGain: 0.4, // happiness regained per good request
  crashSeconds: 10,
  sellRefund: 0.7,
  latencyScale: 100, // 1 sim-second shows as 100 ms
  // --- the "10x" systems ---
  comboStep: 12, // successes per combo tier
  comboMaxTier: 5, // x2.25 revenue at the top
  comboBonus: 0.25, // extra revenue multiplier per tier
  vipTimeout: 4, // VIPs are impatient
  vipFailMult: 2, // a lost VIP hurts twice as much
  vipComboBoost: 3, // a served VIP counts as this many successes
  botBlock: 0.9, // firewall block rate
  botLeak: 1.2, // happiness lost when a bot gets served by a real server
  heatRate: 0.05, // heat per second of work (scaled by how full the queue is)
  heatVent: 0.14, // cooling per second when idle
  heatVentHot: 0.11, // cooling per second while throttled
  heatResume: 0.45, // a throttled box recovers below this
  throttle: 0.45, // speed while overheated
  upgradeRate: 0.4, // speed per upgrade level
  maxLevel: 3,
  pokeSeconds: 1.1, // seconds shaved off a reboot per click
  pokeCool: 0.16, // heat removed per click
  comboPay: 2, // end-of-run payout per point of best combo
  comboPayCap: 100, // ...counted up to this many
};

export interface Wave { until: number; from: number; to: number }
export interface GameEvent {
  at: number;
  kind: 'spike' | 'crash' | 'ddos' | 'flush';
  dur?: number;
  mult?: number;
  target?: 'server' | 'db' | 'any';
  count?: number; // crash: how many boxes go down at once
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
  botShare?: number; // share of requests that are bots
  vipShare?: number; // share of requests that are golden VIPs
  waves: Wave[]; // requests per second over time
  events: GameEvent[];
  endless?: boolean;
}

// ---------- Production (the endless final level) ----------
// Every PHASE_SECONDS is a new phase. Clearing one pays a bonus, heals a little and the next one gets worse:
// colder caches, smarter bots, more data requests, hotter servers and bigger crashes.
export const PHASE_SECONDS = 60;
export const PHASES: { name: string; note: string }[] = [
  { name: 'Soft Launch', note: 'A quiet start. Enjoy it.' },
  { name: 'Product Hunt', note: 'Caches start going cold.' },
  { name: 'Series A', note: 'Two boxes can die at once now.' },
  { name: 'Hypergrowth', note: 'More data requests. Mind your databases.' },
  { name: 'Unicorn', note: 'Bots are evolving. The firewall leaks.' },
  { name: 'Hostile Takeover', note: 'Servers run hotter. Keep clicking them cool.' },
  { name: 'Global Outage Season', note: 'Triple crashes. Keep a spare box.' },
  { name: 'Kernel Panic', note: 'Everything at once, all the time.' },
  { name: 'Heat Death', note: 'Nobody has made it this far.' },
];
export const phaseInfo = (n: number) => PHASES[Math.min(PHASES.length - 1, Math.max(0, n - 1))];

/** Rank for the number of phases you cleared. */
export const RANKS = ['Intern', 'Junior Dev', 'DevOps', 'Senior SRE', 'Staff Engineer', 'Principal', 'Distinguished', 'Fellow', 'Kernel Architect'];
export const rankFor = (cleared: number) => RANKS[Math.min(RANKS.length - 1, Math.max(0, cleared))];

function productionEvents(): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let p = 0; p < 16; p++) {
    const s = p * PHASE_SECONDS;
    const spike = Math.min(3.6, 2 + 0.14 * p);
    const ddos = Math.min(3.4, 2.1 + 0.12 * p);
    if (p === 0) {
      // phase 1 is a warm-up: one of everything, gently
      ev.push({ at: s + 18, kind: 'spike', dur: 10, mult: 1.8 });
      ev.push({ at: s + 36, kind: 'crash', target: 'any' });
      ev.push({ at: s + 48, kind: 'ddos', dur: 10, mult: 2 });
      continue;
    }
    ev.push({ at: s + 10, kind: 'spike', dur: 12, mult: spike });
    ev.push({ at: s + 22, kind: 'crash', target: 'any', count: Math.min(3, 1 + Math.floor(p / 2)) });
    ev.push({ at: s + 31, kind: 'flush', dur: 9 + Math.min(6, p) });
    ev.push({ at: s + 40, kind: 'ddos', dur: 12, mult: ddos });
    ev.push({ at: s + 47, kind: 'crash', target: 'server', count: Math.min(3, 1 + Math.floor((p - 1) / 3)) });
    // the finale of every phase: a spike and a crash land together
    ev.push({ at: s + 54, kind: 'spike', dur: 6, mult: spike + 0.4 });
    ev.push({ at: s + 54, kind: 'crash', target: 'db', count: Math.min(2, 1 + Math.floor(p / 4)) });
  }
  return ev;
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
    cash: 260, dataShare: 0, vipShare: 0.03, waves: [{ until: 20, from: 1.5, to: 10 }], events: [],
  },
  {
    id: 'L3', n: 3, name: "Where's My Data?", icon: 'database',
    blurb: 'Some visitors want data. Servers fetch it from a database.',
    goalText: 'Serve 230 visitors', goal: 230, tools: ['server', 'lb', 'db'], newTool: 'db',
    cash: 320, dataShare: 0.5, vipShare: 0.04, waves: [{ until: 20, from: 2, to: 8.5 }], events: [],
  },
  {
    id: 'L4', n: 4, name: 'Cache Money', icon: 'bolt',
    blurb: "Don't repeat work. Remember the answers.",
    goalText: 'Serve 400 visitors', goal: 400, tools: ['server', 'lb', 'db', 'cache'], newTool: 'cache',
    cash: 330, dataShare: 0.5, vipShare: 0.05, waves: [{ until: 22, from: 3, to: 16 }], events: [],
  },
  {
    id: 'L5', n: 5, name: 'Front Page of HN', icon: 'news',
    blurb: 'Three huge traffic spikes are coming. Servers run hot. Keep them cool.',
    goalText: 'Serve 1000 visitors', goal: 1000, tools: ['server', 'lb', 'db', 'cache'],
    cash: 380, dataShare: 0.45, vipShare: 0.06, waves: [{ until: 40, from: 6, to: 10 }],
    events: [
      { at: 22, kind: 'spike', dur: 14, mult: 3 },
      { at: 55, kind: 'spike', dur: 14, mult: 3.5 },
      { at: 88, kind: 'spike', dur: 16, mult: 4 },
    ],
  },
  {
    id: 'L6', n: 6, name: 'Friday 5pm Deploy', icon: 'skull',
    blurb: 'Boxes will crash. Click them to reboot faster. Always have a backup.',
    goalText: 'Serve 900 visitors', goal: 900, tools: ['server', 'lb', 'db', 'cache'],
    cash: 420, dataShare: 0.45, vipShare: 0.06, waves: [{ until: 40, from: 6, to: 11 }],
    events: [
      { at: 18, kind: 'crash', target: 'server' },
      { at: 38, kind: 'crash', target: 'db' },
      { at: 55, kind: 'spike', dur: 12, mult: 2.4 },
      { at: 62, kind: 'crash', target: 'server' },
      { at: 80, kind: 'crash', target: 'any' },
      { at: 95, kind: 'spike', dur: 12, mult: 3 },
      { at: 100, kind: 'crash', target: 'server' },
    ],
  },
  {
    id: 'L8', n: 7, name: 'Bot Apocalypse', icon: 'shield',
    blurb: 'Scraper bots swarm your site. They pay nothing and clog everything.',
    goalText: 'Serve 800 real visitors', goal: 800, tools: ['server', 'lb', 'db', 'cache', 'fw'], newTool: 'fw',
    cash: 520, dataShare: 0.45, botShare: 0.22, vipShare: 0.06, waves: [{ until: 40, from: 7, to: 12 }],
    events: [
      { at: 16, kind: 'ddos', dur: 14, mult: 2.2 },
      { at: 36, kind: 'crash', target: 'server' },
      { at: 52, kind: 'spike', dur: 10, mult: 2.2 },
      { at: 72, kind: 'ddos', dur: 16, mult: 2.6 },
      { at: 90, kind: 'crash', target: 'any' },
      { at: 105, kind: 'ddos', dur: 14, mult: 3 },
    ],
  },
  {
    id: 'L9', n: 8, name: 'Black Friday', icon: 'flame',
    blurb: 'Everything at once. Spikes, bots, crashes and golden customers.',
    goalText: 'Serve 1500 real visitors', goal: 1500, tools: ['server', 'lb', 'db', 'cache', 'fw'],
    cash: 600, dataShare: 0.5, botShare: 0.16, vipShare: 0.09, waves: [{ until: 50, from: 9, to: 19 }],
    events: [
      { at: 20, kind: 'spike', dur: 14, mult: 2.6 },
      { at: 34, kind: 'crash', target: 'any' },
      { at: 48, kind: 'ddos', dur: 14, mult: 2.4 },
      { at: 66, kind: 'spike', dur: 14, mult: 3.2 },
      { at: 78, kind: 'crash', target: 'db' },
      { at: 90, kind: 'crash', target: 'server' },
      { at: 104, kind: 'ddos', dur: 16, mult: 2.8 },
      { at: 122, kind: 'spike', dur: 14, mult: 3.6 },
      { at: 136, kind: 'crash', target: 'any' },
      { at: 150, kind: 'ddos', dur: 14, mult: 3 },
      { at: 164, kind: 'crash', target: 'server' },
    ],
  },
  {
    id: 'L7', n: 9, name: 'Production', icon: 'infinity',
    blurb: 'The final boss. Every minute is a new phase, and every phase is meaner than the last.',
    goalText: 'Clear phases. Become a Kernel Architect.', goal: null, tools: ['server', 'lb', 'db', 'cache', 'fw'],
    cash: 460, dataShare: 0.45, vipShare: 0.07, waves: [{ until: 1, from: 4, to: 4 }], endless: true,
    events: productionEvents(),
  },
];

export function rateAt(level: Level, t: number): number {
  if (level.endless) return Math.min(70, 5 + t * 0.13);
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
