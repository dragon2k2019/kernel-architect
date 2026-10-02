// src/game/tutorial.js — the guided opening: step-by-step cards, a focus spotlight and hard locks.
//
// A tutorial is a list of steps. Each step has
//   card    the info card text (title + wrapped lines)
//   focus   what to highlight: {board|zone|nodes|item|panel}
//   allow   what the player may do while this step is up ({build, wire, zone, ops}); everything else is
//           refused with the step's hint. `null` means "no locks, watch instead".
//   check   a predicate; when it returns true the step completes on its own (after a short beat)
// A step with no check waits for the player to press the NEXT button (or N).
//
// L01-L03 are fully guided because they teach the whole game. L04-L10 get three light steps each: the new
// box, how to wire it, then watch. Nothing is ever locked outside a tutorial step.

import { NODES, NODE, TRAFFIC, T, LEVELS, nodeCapRps } from '../sim/content.js';
import { kidSteps } from './kids.js';

export const MODES = ['off', 'first', 'all'];

// ------------------------------------------------------------------ step builders
const info = (id, title, card, focus, extra = {}) => ({ id, title, card, focus, allow: null, check: null, primary: 'next', ...extra });
const goalStep = (id, title, card, focus, check, extra = {}) => ({ id, title, card, focus, allow: null, check, primary: 'skip', ...extra });

// The guided build area. It stays clear of the step card, which sits below it (rows 33..44), so the
// spotlight never hides the thing it is pointing at.
const ZONE = [18, 5, 60, 20];
const ZONE2 = [18, 5, 88, 26];

function placeStep(typeKey, id, title, card, extra = {}) {
  const def = NODES[NODE[typeKey]];
  return {
    id: id || 'place-' + typeKey.toLowerCase(), title: title || `PLACE ${def.name}`,
    card: card || [
      `Click ${def.glyph} ${def.name} in the BUILD panel (or press its number key), then click inside the highlighted zone.`,
      'It costs $' + def.cost + ' now and $' + def.upkeep.toFixed(2) + '/s after that, whether it is busy or not.',
      'Everything else is locked until this step is done.',
    ],
    focus: [{ item: typeKey }, { zone: extra.zone || ZONE }],
    allow: { build: [typeKey], wire: [], zone: extra.zone || ZONE, ops: [] },
    check: (g) => countType(g, typeKey) >= (extra.count || 1),
    hint: extra.hint || `Place the ${def.short} inside the highlighted zone.`,
    primary: 'skip',
    ...extra,
  };
}

function wireStep(fromType, toType, id, title, card, extra = {}) {
  const a = NODES[NODE[fromType]], b = NODES[NODE[toType]];
  return {
    id: id || `wire-${fromType}-${toType}`.toLowerCase(), title: title || `WIRE ${a.short} → ${b.short}`,
    card: card || [
      `Click the ${a.short} node to select it, press W, then click the ${b.short} node (or press ENTER).`,
      'Wires only point one way: traffic follows the arrow.',
      'Wiring the same pair twice removes the wire.',
    ],
    focus: [{ nodes: [fromType, toType] }],
    allow: { build: [], wire: [[fromType, toType]], zone: null, ops: [] },
    check: (g) => wired(g, fromType, toType),
    hint: `Wire ${a.short} → ${b.short} (select ${a.short}, press W, click ${b.short}).`,
    primary: 'skip',
    ...extra,
  };
}

// ------------------------------------------------------------------ the shifts
const L01 = [
  goalStep('welcome', 'WELCOME: GOALS & HOW TO PLAY', [
    'MISSION: Serve 420 requests before shift clock (1:15) ends.',
    'LOSE IF: Dropped errors hit 90 (budget) or Reputation hits 0.',
    'THE LOOP: Place server boxes, connect with wires, route traffic.',
    'FIRST ACTION: Press [1] (or click 1 % APP in BUILD panel) to pick APP SERVER,',
    'then click inside the glowing zone on the board! (Or press [N]).',
  ], [{ panel: 'OBJECTIVES' }, { panel: 'BUILD' }], (g) => g.sim.nodes.count > 1),

  placeStep('COMPUTE', 'place-app', 'PLACE AN APP SERVER', [
    'Press [1] (or click 1 % APP in BUILD panel), then click the highlighted zone.',
    'DEFINITION: The App Server handles logic and routes traffic to backend tiers.',
    'Traffic from the Internet cannot reach databases without an App Server.',
    'Costs $130 now, $1.30/s upkeep. Watch your cash at top-right!',
  ]),

  placeStep('SQL', 'place-db', 'PLACE A DATABASE', [
    'Press [2] (or click 2 ▤ SQL in BUILD panel), then click inside the zone.',
    'DEFINITION: Databases store data and complete READ and WRITE requests.',
    'Without a Database, requests have nowhere to finish and drop as NO ROUTE.',
    'Tip: Place it to the right of your App Server so wires remain clear.',
  ]),

  wireStep('INTERNET', 'COMPUTE', 'wire-net-app', 'WIRE INTERNET → APP SERVER', [
    'Click INTERNET on the left, press [W], then click the APP SERVER.',
    'DEFINITION: Wires are directed paths (note the ▶ arrow). Traffic flows forward.',
    'Requests enter at INTERNET and travel along wires to connected nodes.',
    'Shortcut: Click source, press [ENTER], then click target.',
  ]),

  wireStep('COMPUTE', 'SQL', 'wire-app-db', 'WIRE APP → DATABASE', [
    'Click the APP SERVER, press [W], then click the DATABASE.',
    'PATH COMPLETE: INTERNET → APP → DB. Traffic begins flowing immediately!',
    'Packets move along the wire into the App Server, then into the Database.',
    'To remove an unwanted wire, simply wire the same two nodes again.',
  ]),

  goalStep('watch', 'WATCH QUEUES & METRICS', [
    'LOAD bar inside each box = current CPU utilization (0-100%).',
    '"q 0/240" under box = QUEUE depth. If queue hits 90%, it drops traffic!',
    'ERRORS counter top-right is your budget (max 90). Do not let it fill up.',
    'Press [=] to speed up time (1x, 2x, 4x, 8x) or [SPACE] to pause and inspect.',
  ], [{ nodes: ['COMPUTE'] }, { panel: 'FLOW' }], (g) => g.sim.completed >= 25),

  info('done', 'COMMAND THE SHIFT', [
    'OBJECTIVE: Reach 420 completed requests before time (1:15) runs out.',
    'STARS: Beat shift (1★), under 40 errors (2★), under 400ms p99 latency (3★).',
    'Press [H] for full Glossary & Controls, [K] for deep CODEX specifications.',
    'Press [N] to close this tutorial card and take full command!',
  ], [{ panel: 'OBJECTIVES' }, { panel: 'BUILD' }]),
];

const L02 = [
  placeStep('STORAGE', 'place-s3', 'PLACE OBJECT STORAGE', [
    'STATIC traffic (images, CSS, JS) cannot be finished by an App Server or DB.',
    'Press [3] (or click 3 ▣ STORAGE) and place Object Storage in the zone.',
    'DEFINITION: Storage holds static files. It is cheap ($60, $0.60/s upkeep).',
  ]),
  wireStep('INTERNET', 'STORAGE', 'wire-net-s3', 'WIRE INTERNET → STORAGE', [
    'Click INTERNET, press [W], then click OBJECT STORAGE.',
    'EDGE ROUTING: Static files are served directly at the network edge,',
    'bypassing compute to keep your App Servers and Database free for READs.',
  ]),
  goalStep('readyshift', 'BUILD THE READ PATH', [
    'STATIC traffic is wired. But READ traffic is also arriving!',
    'Build the read path: INTERNET → APP SERVER [1] → DATABASE [2].',
    'WIN: Reach 1700 completed requests. LOSE: 120 errors (budget) or 0 rep.',
    'Keep queues green. Press [H] for help, [=] to speed up.',
  ], [{ panel: 'OBJECTIVES' }], (g) => g.sim.state !== 'running'),
];

const L03 = [
  placeStep('COMPUTE', 'l03-app', 'BUILD READ PATH: APP SERVER', [
    'High read traffic ahead! Place an APP SERVER: press [1] and click zone.',
    'DEFINITION: App Servers receive reads and pass them to cache or database.',
  ]),
  placeStep('SQL', 'l03-db', 'ADD THE DATABASE', [
    'Press [2] and place the RELATIONAL DB in the zone to store read data.',
  ]),
  wireStep('INTERNET', 'COMPUTE', 'l03-w1'),
  wireStep('COMPUTE', 'SQL', 'l03-w2'),
  placeStep('CACHE', 'l03-cache', 'PLACE A MEMORY CACHE', [
    'Database bottleneck! High read traffic fills the DB queue quickly.',
    'Press [4] and place ∗ MEMORY CACHE between the App Server and Database.',
    'DEFINITION: A Cache stores recent reads in fast RAM, answering hits instantly.',
  ]),
  wireStep('COMPUTE', 'CACHE', 'l03-wc', 'WIRE APP → CACHE', [
    'Click APP SERVER, press [W], click CACHE. The app will prefer the cache first.',
  ]),
  wireStep('CACHE', 'SQL', 'l03-wc2', 'WIRE CACHE → DATABASE', [
    'Click CACHE, press [W], click DATABASE. Cache misses will flow to the DB.',
  ]),
  goalStep('l03-watch', 'MONITOR HIT RATE & BOTTLENECKS', [
    'Select the CACHE (click it) to view its HIT RATE in the INSPECTOR.',
    'Cache hits finish instantly; cache misses proceed to the Database.',
    'If the DB queue still climbs, select the Cache and press [U] to upgrade it.',
    'WIN: 4200 served before time runs out. Max errors: 150. Speed up with [=].',
  ], [{ nodes: ['CACHE'] }, { panel: 'INSPECTOR' }], (g) => g.sim.state !== 'running'),
];

// L04-L10: three light steps. The "new toy" of the shift, then how to wire it, then watch.
const NEW_BOX = {
  L04: 'QUEUE', L05: 'LOADBALANCER', L06: 'SEARCH', L07: 'REPLICA',
  L08: 'NOSQL', L09: 'FIREWALL', L10: 'GPU',
};

function lightSteps(level) {
  const key = NEW_BOX[level.id];
  if (!key) return null;
  const def = NODES[NODE[key]];
  const host = ['FIREWALL', 'CDN', 'STORAGE'].includes(key) ? 'INTERNET' : 'COMPUTE';
  const zone = ZONE2;
  return [
    {
      id: 'new-' + key.toLowerCase(), title: `NEW HARDWARE: ${def.name}`,
      card: [
        `${level.teaches}.`,
        `DEFINITION: ${def.hint}`,
        `Press key for ${def.glyph} ${def.name} ($${def.cost}, ${def.cap > 1000 ? 'unlimited' : def.cap + '/s'} cap, q ${def.queue}) and place in zone.`,
        'Everything is unlocked: place it to expand your topology.',
      ],
      focus: [{ item: key }, { zone }],
      allow: null,
      check: (g) => countType(g, key) >= 1,
      hint: `Place a ${def.short} to continue the tour.`,
      primary: 'skip',
    },
    {
      id: 'wire-' + key.toLowerCase(), title: `WIRE THE ${def.short} IN`,
      card: [
        `${host === 'INTERNET' ? 'Edge box: connect INTERNET directly to it.' : 'Data tier: connect APP SERVER to it.'}`,
        `Select ${host === 'INTERNET' ? 'INTERNET' : 'APP SERVER'}, press [W], click ${def.short}.${key === 'LOADBALANCER' ? ' Then wire balancer out to each App Server.' : ''}`,
        'CRITICAL: Wires must reach a destination that finishes traffic, or packets drop!',
      ],
      focus: [{ nodes: [key] }],
      allow: null,
      check: (g) => {
        const i = firstType(g, key);
        return i >= 0 && g.sim.nodes.inCount[i] > 0 && g.sim.nodes.outCount[i] > 0;
      },
      hint: `The ${def.short} needs a wire in and a wire out.`,
      primary: 'skip',
    },
    {
      id: 'tour-over', title: 'MISSION OBJECTIVES',
      card: [
        `GOAL: Complete ${level.objectives.complete || 'target'} requests. Error limit: ${level.objectives.maxErrors || 'N/A'}.`,
        `${level.brief}`,
        'Press [H] for Help/Glossary, [K] for Codex with all formulas, [N] to close.',
      ],
      focus: [{ panel: 'OBJECTIVES' }],
      allow: null, check: null, primary: 'next',
    },
  ];
}

const BUILT = { L01, L02, L03 };

export function stepsFor(level, mode) {
  if (!level || mode === 'off') return null;
  if (level.kid) return kidSteps(level);         // PLAY MODE: look, tap, watch
  const guided = BUILT[level.id];
  if (guided) return guided;
  if (mode === 'all') return lightSteps(level) || null;
  return null;                                  // 'first' shows the guided opening shifts only
}

// ------------------------------------------------------------------ helpers used by the steps
function countType(g, key) {
  const sim = g.sim, n = sim.nodes, t = NODE[key];
  let c = 0;
  for (let i = 0; i < n.count; i++) if (n.state[i] !== 0 && n.type[i] === t) c++;
  return c;
}
function firstType(g, key) {
  const n = g.sim.nodes, t = NODE[key];
  for (let i = 0; i < n.count; i++) if (n.state[i] !== 0 && n.type[i] === t) return i;
  return -1;
}
function wired(g, fromKey, toKey) {
  const a = firstType(g, fromKey), b = firstType(g, toKey);
  return a >= 0 && b >= 0 && g.sim.isConnected(a, b);
}
export const _test = { countType, firstType, wired };

// ------------------------------------------------------------------ the runner
export class Tutorial {
  constructor(level, mode, { completed = false } = {}) {
    this.level = level;
    this.steps = stepsFor(level, mode) || [];
    this.i = 0;
    this.active = this.steps.length > 0 && !completed;
    this.pending = 0;                 // ticks left before an auto-advance lands
    this.flash = 0;                   // ticks left showing the ✓
  }

  get step() { return this.active ? this.steps[this.i] || null : null; }
  get total() { return this.steps.length; }
  get number() { return this.i + 1; }
  get done() { return !this.active || this.i >= this.steps.length; }

  /** Called every tick by the game loop: completes the step when its check passes. */
  tick(g) {
    if (!this.active) return;
    const s = this.step;
    if (!s) return;
    if (this.pending > 0) {
      this.pending--;
      if (this.pending === 0) this.next();
      return;
    }
    if (s.check && s.check(g)) {
      this.pending = 30;              // half a second of "✓" before the card moves on
      this.flash = 30;
    }
  }

  /** Advance (the NEXT / SKIP button). Returns the new step, or null when the tutorial is over. */
  next() {
    if (!this.active) return null;
    this.i++;
    this.pending = 0;
    if (this.i >= this.steps.length) this.active = false;
    return this.step;
  }

  skipAll() { this.active = false; this.i = this.steps.length; }

  /** Build palette during this step: null = everything allowed. */
  allowedBuilds() {
    const s = this.step;
    if (!s || !s.allow || !Array.isArray(s.allow.build)) return null;
    return new Set(s.allow.build);
  }

  /**
   * Locks. kind: 'place' | 'wire' | 'op'.
   * Returns {ok} or {ok:false, err} — the caller shows err as a note.
   */
  gate(kind, payload, g) {
    const s = this.step;
    if (!s || !s.allow) return { ok: true };
    const a = s.allow;
    if (kind === 'pick') {                        // arming the build palette: the key check only
      if (Array.isArray(a.build) && !a.build.includes(payload.key)) {
        const want = a.build.map((k) => NODES[NODE[k]].short).join(' or ');
        return { ok: false, err: want ? `Locked for now — this step needs ${want}.` : 'Locked for now — read the card, then press [N].' };
      }
      return { ok: true };
    }
    if (kind === 'place') {
      if (Array.isArray(a.build) && !a.build.includes(payload.key)) {
        const want = a.build.map((k) => NODES[NODE[k]].short).join(' or ');
        return { ok: false, err: want ? `Locked for now — this step needs ${want}.` : 'Locked for now — read the card and press [N].' };
      }
      if (a.zone) {
        const [zx, zy, zw, zh] = a.zone;
        if (payload.x < zx || payload.y < zy || payload.x + 15 > zx + zw || payload.y + 4 > zy + zh) {
          return { ok: false, err: s.hint || 'Place it inside the highlighted zone.' };
        }
      }
      return { ok: true };
    }
    if (kind === 'wire') {
      if (Array.isArray(a.wire) && a.wire.length) {
        const n = g.sim.nodes;
        const ft = NODES[n.type[payload.a]].key, tt = NODES[n.type[payload.b]].key;
        const okPair = a.wire.some(([f, t]) => f === ft && t === tt);
        if (!okPair) return { ok: false, err: s.hint || `This step wires ${a.wire.map(([f, t]) => NODES[NODE[f]].short + '→' + NODES[NODE[t]].short).join(', ')}.` };
      } else if (Array.isArray(a.wire) && !a.wire.length) {
        return { ok: false, err: 'Locked for now — finish the step on the card first.' };
      }
      return { ok: true };
    }
    if (kind === 'op') {
      if (Array.isArray(a.ops) && !a.ops.includes(payload.op)) {
        return { ok: false, err: 'Locked during this step. Press [N] to move on.' };
      }
      return { ok: true };
    }
    return { ok: true };
  }

  /** A short summary for debugging / the tests. */
  describe() {
    const s = this.step;
    return s ? `${this.number}/${this.total} ${s.id} (${s.title})` : 'done';
  }
}
