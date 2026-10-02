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
  info('welcome', 'WELCOME TO THE NOC', [
    'Requests arrive at the INTERNET node and must reach something that can finish them.',
    'Right now nothing is built, so nothing is even being sent: no path, no traffic.',
    'Your job is to build the path, and to keep every queue on it from spilling.',
    'This card is the tutorial. Do what it says, or press [N] to move on, or [ESC] to drop out.',
  ], [{ panel: 'OBJECTIVES' }, { panel: 'BUILD' }]),

  placeStep('COMPUTE', 'place-app', 'PLACE AN APP SERVER', [
    'Press [1] (or click ▸ % APP SERVER in the BUILD panel), then click inside the highlighted zone.',
    'The app server does the application work, and it is the only node that lets traffic continue into',
    'the data tier. Cost $130 now, $1.30/s upkeep.',
  ]),

  placeStep('SQL', 'place-db', 'PLACE A DATABASE', [
    'Now a database: press [2] (or click ▤ RELATIONAL DB) and put it in the zone as well.',
    'READ and WRITE requests are finished by a database. Nothing else in this shift finishes them.',
    'Keeping them apart on the board makes the wires readable later.',
  ]),

  wireStep('INTERNET', 'COMPUTE', 'wire-net-app', 'WIRE INTERNET → APP SERVER', [
    'Click the INTERNET node on the left, press [W], then click the APP SERVER you just placed.',
    '[ENTER] does the same thing. Look for the ▶ arrow that appears on the wire: that is the direction',
    'traffic will flow.',
  ]),

  wireStep('COMPUTE', 'SQL', 'wire-app-db', 'WIRE APP → DATABASE', [
    'Select the APP SERVER, press [W], then click the database.',
    'The path is now INTERNET → APP → DB. As soon as it is complete, traffic starts flowing on its own.',
  ]),

  goalStep('watch', 'WATCH THE FIRST REQUESTS', [
    'Packets are moving. Watch three things: the dots on the wires, the bar inside each box, and the',
    'number under it (queue depth vs capacity). Load is how fast a node is working; the queue is what',
    'is piling up, and a full queue is what drops requests.',
    'Press [=] to run the shift at 2x, 4x or 8x — the run is deterministic either way.',
  ], [{ nodes: ['COMPUTE'] }, { panel: 'FLOW' }], (g) => g.sim.completed >= 25),

  info('done', 'THAT IS THE WHOLE GAME', [
    'Everything from here is the same loop: give each traffic type a node that can finish it, give every',
    'bottleneck enough capacity, and keep the queues off the red line.',
    'Your goal for this shift is on the right: 420 requests served, no more than 90 errors, before the clock.',
    'Press [K] at any time for the CODEX: every node, every traffic type, every mechanic, with real numbers.',
    'Good luck. Press [N] to close this card and finish the shift.',
  ], [{ panel: 'OBJECTIVES' }, { panel: 'BUILD' }]),
];

const L02 = [
  placeStep('STORAGE', 'place-s3', 'PLACE OBJECT STORAGE', [
    'STATIC requests (images, CSS, JS) are the majority of this shift, and they cannot be finished by a',
    'database or an app server. Press [3] and put ▣ OBJECT STORAGE in the zone.',
    'It is the cheapest box on the board: $60, $0.60/s.',
  ]),
  wireStep('INTERNET', 'STORAGE', 'wire-net-s3', 'WIRE INTERNET → OBJECT STORAGE', [
    'The edge serves STATIC directly: no app hop needed, which keeps your app tier and database free',
    'for READ and WRITE traffic.',
    'In the BUILD panel you can also see ▣ S3 listed for... nothing else. Keep UPLOAD in mind for later.',
  ]),
  goalStep('readyshift', 'NOW THE READ PATH', [
    'STATIC is handled at the edge. READ traffic is not: it still needs an APP SERVER in front of a',
    'RELATIONAL DB. Everything is unlocked now — build the read path (INTERNET → APP → DB) and finish',
    'the shift.',
    'Watch the ERRORS counter: it is your error budget, and it only goes up.',
  ], [{ panel: 'OBJECTIVES' }], (g) => g.sim.state !== 'running'),
];

const L03 = [
  placeStep('COMPUTE', 'l03-app', 'REBUILD THE READ PATH', [
    'Fresh shift, empty board: the app server first. Press [1] and place it in the zone.',
    'Read traffic is climbing fast in this one, so do not dawdle.',
  ]),
  placeStep('SQL', 'l03-db', 'ADD THE DATABASE', [ 'Press [2] and place the database next to the app server.' ]),
  wireStep('INTERNET', 'COMPUTE', 'l03-w1'),
  wireStep('COMPUTE', 'SQL', 'l03-w2'),
  placeStep('CACHE', 'l03-cache', 'PLACE A MEMORY CACHE', [
    'The database is now the bottleneck: reads are queueing behind each other.',
    'Press [4] and put ∗ MEMORY CACHE in the zone, between the app and the database.',
    'A cache finishes a share of reads on the spot; the rest continue to the database as misses.',
  ]),
  wireStep('COMPUTE', 'CACHE', 'l03-wc', 'WIRE APP → CACHE', [
    'Select the APP SERVER, press [W], click the CACHE.',
    'The app now has two ways to reach a database. It will prefer the cache — that is the point of it.',
  ]),
  wireStep('CACHE', 'SQL', 'l03-wc2', 'WIRE CACHE → DATABASE', [
    'Now the misses need somewhere to go: select the CACHE, press [W], click the DATABASE.',
    'You now have INTERNET → APP → CACHE → DB with the app also able to reach the DB directly.',
  ]),
  goalStep('l03-watch', 'WATCH THE HIT RATE', [
    'Select the CACHE (click it) and look at HIT RATE in the inspector: that is the share of reads it is',
    'finishing without touching the database.',
    'If the database queue still climbs, a T2 upgrade [U] on the cache raises its hit rate.',
    'Press [=] to speed up, and finish the shift.',
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
      id: 'new-' + key.toLowerCase(), title: `NEW BOX: ${def.name}`,
      card: [
        `${level.teaches}`,
        '',
        `Press the BUILD key for ${def.glyph} ${def.name} ($${def.cost}, ${def.cap > 1000 ? 'effectively unlimited' : def.cap + '/s'} capacity, queue ${def.queue}) and place it in the highlighted zone.`,
        'Nothing is locked in this shift: the zone is just where the wires will be tidiest.',
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
        `${host === 'INTERNET' ? 'Edge boxes sit right behind the INTERNET and finish their own traffic.' : 'Data-tier boxes only accept traffic that has already passed an APP SERVER, so they live behind the app.'}`,
        `Select ${host === 'INTERNET' ? 'the INTERNET' : 'the APP SERVER'} and press [W], then click the ${def.short}. ${key === 'LOADBALANCER' ? 'Then wire the balancer out to each app server.' : ''}`,
        'One wire in, one wire out: a box with no path out is a dead end that drops traffic.',
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
      id: 'tour-over', title: 'OVER TO YOU',
      card: [
        `Tour finished. ${level.brief}`,
        'Press [K] for the CODEX while you think, [H] for the key list, and [N] to get this card out of the way.',
      ],
      focus: [{ panel: 'OBJECTIVES' }],
      allow: null, check: null, primary: 'next',
    },
  ];
}

const BUILT = { L01, L02, L03 };

export function stepsFor(level, mode) {
  if (!level || mode === 'off') return null;
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
