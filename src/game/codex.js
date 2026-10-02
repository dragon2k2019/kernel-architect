// src/game/codex.js — the player's reference: every node, traffic type, mechanic and shift.
//
// Nothing here is invented: costs, capacities, queues and times are read out of the simulation's own
// content tables, so the codex cannot drift away from the model. Node and traffic entries start LOCKED
// until the player has actually placed / served one — the codex fills itself in as you play.

import {
  NODES, NODE, TRAFFIC, T, TIERS, SIM, CACHE_HIT, AUTOSCALE, PALETTE,
  LEVELS, ENDLESS, nodeCapRps, nodeQueueCap, nodeUpkeep, upgradeCost,
} from '../sim/content.js';

export const CODEX_TABS = [
  { id: 'nodes', name: 'NODES' },
  { id: 'traffic', name: 'TRAFFIC' },
  { id: 'mechanics', name: 'MECHANICS' },
  { id: 'shifts', name: 'SHIFTS' },
  { id: 'keys', name: 'CONTROLS' },
];

const secs = (ticks) => (ticks / SIM.TICK_RATE).toFixed(0);

// ---------------------------------------------------------------- mechanics (the manual)
const MECHANICS = [
  {
    id: 'tick', title: 'TICKS AND DETERMINISM',
    body: [
      `The simulation runs at a fixed ${SIM.TICK_RATE} ticks per second and never reads the wall clock or a random`,
      'number generator that is not seeded. Pausing, frame rate and fast-forward cannot change a run.',
      'Same seed + same actions = the same run, every time. The status bar shows the live state hash, and',
      'the postmortem shows the final one: two players with the same hash had the same shift.',
    ],
  },
  {
    id: 'packets', title: 'REQUESTS ARE PACKETS',
    body: [
      'Every incoming request is a packet with a type (see the TRAFFIC tab) and a flag that says whether it',
      'has passed through an app server. Traffic spawns at the INTERNET and walks the wires you built, one',
      'hop at a time, following a flow field that always points at the nearest node that can finish it.',
      'A packet that reaches a node which cannot finish it and has nowhere useful to go is dropped as',
      'NO ROUTE. You are told when this happens ("NOTHING ROUTES X YET").',
    ],
    meta: [['tick', `${(1000 / SIM.TICK_RATE).toFixed(2)} ms`], ['travel', `${SIM.PACKET_SPEED} cells/s`], ['base latency', `${SIM.BASE_LATENCY_MS} ms`], ['per hop', `${SIM.LATENCY_MS_PER_HOP} ms`]],
  },
  {
    id: 'queues', title: 'QUEUES ARE THE GAME',
    body: [
      'A node serves a fixed number of requests per second. Whatever arrives faster than that queues up.',
      'The number under the load bar is queue depth vs capacity — that is the number to watch.',
      `Past ~90% the box border blinks red, and the next arrival is dropped as QUEUE FULL.`,
      `A packet that spends more than ${secs(SIM.TIMEOUT_TICKS)} s waiting in queues dies with a 504, even if the path was fine.`,
      'Capacity in front of a bottleneck beats capacity behind it: a cache or a queue absorbs, a faster',
      'sink drains. Upgrading a tier raises both the service rate and the queue depth.',
    ],
    meta: [['drop on full', 'QUEUE FULL'], ['stale queue', `TIMEOUT 504 · ${secs(SIM.TIMEOUT_TICKS)} s`], ['gateway shed', `${(SIM.REP_LOSS_THROTTLE * 100).toFixed(1)} rep vs ${(SIM.REP_LOSS_DROP * 100).toFixed(1)} rep`]],
  },
  {
    id: 'appflag', title: 'THE APP FLAG',
    body: [
      'Caches, databases, replicas, search indexes and GPUs only accept traffic that has already passed',
      'through an APP SERVER. The edge boxes — FIREWALL, CDN and OBJECT STORAGE — finish their own traffic',
      'directly. So the shape of a healthy graph is: INTERNET → edge → app → data tier, with the data tier',
      'only ever behind an app hop. A GPU wired straight to the INTERNET refuses AI traffic.',
    ],
  },
  {
    id: 'cache', title: 'CACHE HITS AND STAMPEDES',
    body: [
      `A MEMORY CACHE finishes ${(CACHE_HIT[0] * 100).toFixed(0)}% of the READs that reach it (T1) and forwards the rest as`,
      `misses: ${CACHE_HIT.map((h, i) => `${TIERS[i].name} ${(h * 100).toFixed(0)}%`).join(' · ')}. A hit never touches the database, so a cache in`,
      'front of a saturated DB is often worth more than a bigger DB.',
      'A cache with no database behind it is a trap: misses pile into the app and get dropped.',
      'Cache nodes restart in some incidents; for those seconds every read misses at once — a stampede.',
      'The hits you are getting are shown in the inspector under HIT RATE.',
    ],
  },
  {
    id: 'economy', title: 'MONEY, UPKEEP AND REPUTATION',
    body: [
      'Money only comes from completed requests (see revenue per type in the TRAFFIC tab) and every node',
      'costs upkeep every second whether it is busy or not. Running out of money loses the shift instantly.',
      'Reputation starts at 100 and every drop costs it; blocking ATTACK traffic earns a little back, and',
      'so does completing requests, slowly. Reputation at zero loses the shift instantly. A GATEWAY sheds',
      `overload for ${(SIM.REP_LOSS_THROTTLE * 100).toFixed(1)} reputation instead of ${(SIM.REP_LOSS_DROP * 100).toFixed(1)}: cheaper, but still a drop.`,
    ],
    meta: [['start', '100 rep'], ['drop', `-${SIM.REP_LOSS_DROP}`], ['attacks blocked', `+${SIM.REP_GAIN_BLOCK}`], ['completion', `+${SIM.REP_GAIN_DONE}`]],
  },
  {
    id: 'tiers', title: 'TIERS AND UPGRADES',
    body: [
      'Every node upgrades twice: ' + TIERS.map((t) => `${t.name} = ×${t.capMul} capacity, ×${t.queueMul} queue, ×${t.costMul} price, ×${t.upMul} upkeep`).join('; ') + '.',
      'An upgrade costs 85% of the node price at the next tier and takes effect immediately — no downtime.',
      'When a queue is the bottleneck and you have no space left, an upgrade is usually cheaper than a',
      'second box: one T2 is 2.2× the throughput of two T1s at 1.6× the upkeep.',
    ],
    meta: [['T2', `+${TIERS[1].capMul}× cap`], ['T3', `+${TIERS[2].capMul}× cap`], ['upgrade price', 'cost × next tier × 0.85']],
  },
  {
    id: 'autoscale', title: 'AUTOSCALING AND COLD STARTS',
    body: [
      `Toggle it with A on an APP SERVER or a GPU. While utilisation is above ${(AUTOSCALE.utilHigh * 100).toFixed(0)}% the node boots another`,
      `instance (max ${NODES[NODE.COMPUTE].autoMax} for an app server, ${NODES[NODE.GPU].autoMax} for a GPU), paying ${(AUTOSCALE.extraCost * 100).toFixed(0)}% of the node price once.`,
      `A new instance takes a ${secs(AUTOSCALE.coldStart)} s cold start, so autoscaling absorbs a ramp, not a spike: it will`,
      `not save a queue that is already full. After ${secs(AUTOSCALE.lowTicks)} quiet seconds (under ${(AUTOSCALE.utilLow * 100).toFixed(0)}% load) instances`,
      'scale back in. Boots land one cold start apart, so a burst of requests cannot land all at once.',
      'Extra instances multiply service rate and upkeep: an instance costs half of a node\'s upkeep.',
    ],
  },
  {
    id: 'incidents', title: 'INCIDENTS',
    body: [
      'A shift is not a straight line. Expect BURSTs (one traffic type multiplies for a few seconds),',
      'DDoS waves (massive ATTACK traffic — block it at the edge or it eats your capacity), KILLs (a node',
      'type goes down for a while: redundancy is the only answer), FLUSHes (a cache restarts, every read',
      'misses) and notes that warn you about the ramp. Incident messages appear in the log.',
      'ENDLESS generates its incidents from the seed, so the same seed plays the same story.',
    ],
  },
  {
    id: 'drops', title: 'DROP REASONS',
    body: [
      'NO ROUTE      nothing on the path can finish that traffic type (build or rewire — this one is on you).',
      'TIMEOUT 504   the request waited more than ' + secs(SIM.TIMEOUT_TICKS) + ' s in queues: too little capacity for too long.',
      'QUEUE FULL    the node was already holding everything it could; add capacity in front of it.',
      'NODE DOWN     an incident took the node out and there was no second path.',
      'THROTTLED     your GATEWAY shed it on purpose: the cheapest drop there is, but still a drop.',
      'The right-hand FLOW panel (needs a MONITORING node) ranks these live; the postmortem ranks them after.',
    ],
  },
  {
    id: 'stars', title: 'STARS, SLO AND ENDLESS',
    body: [
      'Winning a shift gives one star. A second star needs errors under the level\'s stricter target, and a',
      'third needs the p99 latency under its SLO as well: fast and clean, not just finished.',
      'ENDLESS SHIFT ramps traffic forever and scores requests served before reputation runs out — there is',
      'no winning, only lasting longer. DAILY SHIFT is one seed per UTC date: every player gets the same',
      'traffic and the same incidents, so the state hash at the end is comparable.',
    ],
  },
  {
    id: 'reading', title: 'READING THE BOARD',
    body: [
      'Box border        steady = healthy · amber = cache flush · blinking red = queue about to spill ·',
      '                  red hatch = the node is down',
      'Title row         glyph, short name, tier (T1..T3), extra instances (×N), status dot, and ! when full',
      'Load bar          utilisation, i.e. what fraction of its service rate the node used last second',
      'q n/cap           requests waiting vs queue capacity — the number that predicts a drop',
      'Bottom row        ✓ = requests this node finished · → = requests it passed on',
      'Right panel       objectives, live telemetry, the inspector for the selected node, and the build list',
      'L                 overlays the flow field: amber wires still reach a server for the selected type',
    ],
  },
];

// ---------------------------------------------------------------- entry builders
function nodeEntries(ctx) {
  const seen = (ctx.seen && ctx.seen.nodes) || {};
  return NODES.map((def) => {
    const key = def.key;
    const idx = NODE[key];
    const meta = [
      ['cost', key === 'INTERNET' ? 'free' : `$${def.cost}`],
      ['capacity', def.cap > 1000 ? 'unlimited' : `${def.cap}/s`],
      ['queue', `${def.queue}`],
      ['upkeep', `$${def.upkeep.toFixed(2)}/s`],
      ['role', def.role],
      ['finishes', def.serves.length ? def.serves.map((t) => TRAFFIC[t].key).join(' ') : '—'],
      ['upgrade', key === 'INTERNET' ? '—' : `$${upgradeCost(idx, 0)} → T2`],
      ['autoscale', def.autoMax ? `yes, up to ${def.autoMax}` : 'no'],
    ];
    const body = [def.hint];
    if (key === 'CACHE') body.push(`A hit finishes ${(CACHE_HIT[0] * 100).toFixed(0)}% of reads at T1, ${(CACHE_HIT[1] * 100).toFixed(0)}% at T2, ${(CACHE_HIT[2] * 100).toFixed(0)}% at T3. Misses continue downstream.`);
    if (key === 'QUEUE') body.push('The deepest queue in the game by design: put it in front of whatever spikes, not behind it.');
    if (key === 'COMPUTE') body.push(`Autoscaling boots up to ${def.autoMax} instances while load is over ${(AUTOSCALE.utilHigh * 100).toFixed(0)}%. It is the only node that sets the app flag.`);
    if (key === 'GPU') body.push('The most expensive box on the board. Batch, autoscale, and never run one idle.');
    if (key === 'SQL') body.push('A hard ceiling on reads, and it refuses SEARCH outright: that is what SEARCH INDEX is for.');
    if (key === 'REPLICA') body.push('Read capacity with no writes: the cheapest way out of a read wall.');
    if (key === 'MONITOR') body.push('Carries no traffic. Its only job is unlocking the FLOW panel.');
    if (key === 'GATEWAY') body.push(`Shedding overload costs ${(SIM.REP_LOSS_THROTTLE * 100).toFixed(1)} reputation instead of ${(SIM.REP_LOSS_DROP * 100).toFixed(1)}.`);
    return {
      key, title: def.name,
      sub: `${def.glyph}  ${def.role}${def.serves.length ? ' · finishes ' + def.serves.map((t) => TRAFFIC[t].key).join(', ') : ''}${def.kidName ? `  ·  PLAY MODE: ${def.kidName} ${def.kidGlyph}` : ''}`,
      meta, body, seen: !!seen[key], locked: !seen[key] && key !== 'INTERNET',
      unlock: `Place one to unlock this entry.`,
    };
  });
}

function trafficEntries(ctx) {
  const seen = (ctx.seen && ctx.seen.traffic) || {};
  return TRAFFIC.map((t) => {
    const servers = NODES.filter((n) => n.serves.includes(t.id));
    const locked = !seen[t.key];
    return {
      key: t.key, title: `${t.glyph}  ${t.name}`, sub: `paying $${t.revenue.toFixed(2)} per completed request`,
      meta: [
        ['revenue', `$${t.revenue.toFixed(2)}`],
        ['weight', `${t.weightMs}× queue cost`],
        ['finished by', servers.map((n) => n.short).join(' ') || 'nothing'],
        ['needs app hop', servers.some((n) => ['SQL', 'NOSQL', 'REPLICA', 'SEARCH', 'GPU', 'CACHE'].includes(n.key)) ? 'yes' : 'no'],
      ],
      body: [t.hint, servers.length ? `Route it to ${servers.map((n) => n.name).join(' or ')}.` : 'Nothing in the game can finish this type.'],
      seen: !locked, locked, unlock: 'Serve one request of this type to unlock this entry.',
    };
  });
}

function shiftEntries(ctx) {
  const progress = (ctx.progress || {});
  const rows = LEVELS.map((lv, i) => {
    const stars = progress[lv.id] || 0;
    const unlocked = i === 0 || stars > 0 || (ctx.progress && progress[LEVELS[i - 1].id] > 0);
    return {
      key: lv.id, title: `${lv.id}  ${lv.name}`,
      sub: `${lv.duration}s · goal ${lv.objectives.complete} · errors allowed ${lv.objectives.maxErrors} · budget $${lv.budget}`,
      meta: [
        ['traffic', lv.traffic.map((t) => `${t.type} ${t.rps}/s +${t.ramp}/s²`).join(', ')],
        ['stars', stars ? '★'.repeat(stars) : 'not cleared'],
        ['teaches', lv.teaches],
        ['unlocks', (lv.unlock || []).join(' ')],
      ],
      body: [lv.brief],
      seen: unlocked, locked: !unlocked, unlock: 'Clear the previous shift to unlock this entry.',
    };
  });
  rows.push({
    key: 'ENDLESS', title: 'ENDLESS SHIFT', sub: 'ramps forever · score = requests served',
    meta: [['budget', `$${ENDLESS.budget}`], ['traffic', ENDLESS.traffic.map((t) => `${t.type} ${t.rps}/s +${t.ramp}/s²`).join(', ')], ['incidents', 'generated from the seed, one every 25 s']],
    body: [ENDLESS.brief, 'There is no finishing it: the score is how many requests you served before reputation hit zero.'],
    seen: true, locked: false,
  });
  return rows;
}

function keyEntries() {
  const rows = [
    ['MOUSE', 'click a build item, click the board to place, click a node to select, right-click to cancel'],
    ['1-9 0 TAB', 'pick a build item from the BUILD panel'],
    ['ARROWS', 'move the placement cursor, or walk the selection from node to node'],
    ['ENTER', 'place, connect, or select the nearest node'],
    ['W', 'wire mode: [ENTER] or click a target, [ENTER] again on the same pair removes the wire'],
    ['U / X', 'upgrade the selected node / sell it back'],
    ['A', 'toggle autoscaling on the selected node'],
    ['SPACE / = / -', 'pause · speed 1× → 2× → 4× → 8×'],
    ['L / [ ]', 'flow overlay on and off · cycle the traffic type it shows'],
    ['K', 'open this codex'],
    ['H', 'help (3 pages: controls, node table, traffic table)'],
    ['N', 'tutorial: advance to the next step'],
    ['ESC', 'close overlays, cancel the current mode, or abandon a shift from the postmortem'],
    ['C / M', 'CRT filter / mute'],
    ['R / Q', 'restart the current shift / abandon it'],
  ];
  return rows.map(([k, v]) => ({ key: k, title: k, sub: '', meta: [], body: [v], seen: true, locked: false }));
}

/** All entries for one tab, with `seen`/`locked` already resolved for this player. */
export function codexEntries(tabId, ctx) {
  switch (tabId) {
    case 'nodes': return nodeEntries(ctx);
    case 'traffic': return trafficEntries(ctx);
    // the articles are written as hard-wrapped source lines; the pane re-wraps them to its own width
    case 'mechanics': return MECHANICS.map((m) => ({ ...m, key: m.id, sub: 'mechanic', body: [m.body.join(' ')], meta: m.meta || [], seen: true, locked: false }));
    case 'shifts': return shiftEntries(ctx);
    case 'keys': return keyEntries();
    default: return [];
  }
}

/** "23/40 entries discovered" for the header. */
export function codexProgress(ctx) {
  let total = 0, seen = 0;
  for (const tab of CODEX_TABS) {
    for (const e of codexEntries(tab.id, ctx)) { total++; if (e.seen) seen++; }
  }
  return { seen, total };
}
