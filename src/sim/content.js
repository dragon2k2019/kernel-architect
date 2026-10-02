// src/sim/content.js — all game content and tuning constants.
import { ICON } from '../render/atlas.js';
//
// INDEXES ARE PART OF THE SAVE/REPLAY CONTRACT: append new entries, never reorder.

export const SIM = {
  TICK_RATE: 60,
  MAX_SECONDS: 600,          // hard ceiling so a stuck run always ends
  BASE_LATENCY_MS: 8,        // fixed per-node cost
  LATENCY_MS_PER_HOP: 12,    // added per link traversed
  PACKET_SPEED: 40,          // cells / second along the L-shaped link path
  REP_LOSS_DROP: 0.12,       // reputation lost per dropped request
  REP_LOSS_THROTTLE: 0.035,  // ...when an API GATEWAY sheds it (deliberate back-pressure)
  REP_GAIN_BLOCK: 0.02,      // blocking a malicious request
  REP_GAIN_DONE: 0.004,      // completing a request (slow recovery)
  REP_MAX: 100,
  KILL_DOWN_SECONDS: 12,     // default node outage length for incidents
  TIMEOUT_TICKS: 420,        // a request that spends 7s in queues dies with a 504
};

export const TRAFFIC = [
  { id: 0, key: 'STATIC', kidGlyph: ICON.PICTURE, kidName: 'PICTURES',  name: 'STATIC',  glyph: '≡', color: [120, 233, 255], revenue: 0.40, weightMs: 1.0, hint: 'Images, CSS, JS. Cache it at a CDN or store it in object storage.' },
  { id: 1, key: 'READ', kidGlyph: ICON.SMILE, kidName: 'HAPPY FACES',    name: 'READ',    glyph: 'R', color: [126, 255, 176], revenue: 0.90, weightMs: 1.2, hint: 'API reads. Cache them, or scale the database out with replicas.' },
  { id: 2, key: 'WRITE', kidGlyph: ICON.PENCIL, kidName: 'NOTES',   name: 'WRITE',   glyph: 'W', color: [255, 224, 120], revenue: 2.20, weightMs: 2.4, hint: 'Writes are never cached and cost real work. Queue and batch them.' },
  { id: 3, key: 'UPLOAD', kidGlyph: ICON.UP, kidName: 'BOXES',  name: 'UPLOAD',  glyph: 'U', color: [180, 140, 255], revenue: 1.80, weightMs: 3.0, hint: 'Big payloads. Send them to object storage, never through the database.' },
  { id: 4, key: 'SEARCH', kidGlyph: '⌕', kidName: 'FIND IT',  name: 'SEARCH',  glyph: '?', color: [255, 150, 90],  revenue: 2.40, weightMs: 3.4, hint: 'Full-text queries. A relational database will refuse them: you need a search index.' },
  { id: 5, key: 'AI', kidGlyph: '★', kidName: 'STARS',      name: 'AI',      glyph: '◆', color: [255, 120, 200], revenue: 8.00, weightMs: 8.0, hint: 'Inference. Expensive, slow, and needs a GPU with a real fleet behind it.' },
  { id: 6, key: 'MALICIOUS', kidGlyph: ICON.NOENTRY, kidName: 'BAD GUYS', name: 'ATTACK', glyph: '!', color: [255, 90, 90],  revenue: 0.00, weightMs: 0.8, hint: 'DDoS and credential stuffing. Block it at the edge before it costs you capacity.' },
];
export const T = Object.fromEntries(TRAFFIC.map((t) => [t.key, t.id]));
export const N_TRAFFIC = TRAFFIC.length;

// role:   source = spawns traffic, spreader = fans out to peers, transit = forwards by flow field,
//         sink = terminates the types it serves, monitor = never carries traffic.
// serves: traffic types this node can COMPLETE.
// Every node carries a picture and a short name for PLAY MODE (the friendly mode for young players):
// a five-year-old matches the picture that is causing trouble to the tile with the same picture.
export const NODES = [
  {
    key: 'INTERNET',
    kidName: 'CLOUD', kidGlyph: ICON.CLOUD, name: 'INTERNET', short: 'NET', glyph: '@', color: [140, 255, 200],
    cost: 0, upkeep: 0, cap: 4000, queue: 400, role: 'source', serves: [], autoMax: 0,
    hint: 'Your traffic source. Pre-placed. Everything must eventually be reachable from here.',
  },
  {
    key: 'FIREWALL',
    kidName: 'SHIELD', kidGlyph: ICON.SHIELD, name: 'FIREWALL', short: 'WAF', glyph: '#', color: [255, 120, 120],
    cost: 120, upkeep: 1.2, cap: 600, queue: 240, role: 'transit', serves: [T.MALICIOUS], autoMax: 0,
    hint: 'Blocks ATTACK traffic (and earns reputation for it). Put it directly behind the INTERNET.',
  },
  {
    key: 'CDN',
    kidName: 'PICS', kidGlyph: ICON.PICTURE, name: 'CDN', short: 'CDN', glyph: '~', color: [120, 233, 255],
    cost: 90, upkeep: 0.9, cap: 900, queue: 200, role: 'transit', serves: [T.STATIC], autoMax: 0,
    hint: 'Serves STATIC at the edge, so static traffic never touches your app or database.',
  },
  {
    key: 'GATEWAY',
    kidName: 'DOOR', kidGlyph: '⌐', name: 'API GATEWAY', short: 'GW', glyph: '⌐', color: [160, 255, 220],
    cost: 140, upkeep: 1.4, cap: 800, queue: 200, role: 'spreader', serves: [], autoMax: 0,
    hint: 'Rate limits. When it sheds load the reputation hit is 3x smaller than a crash drop.',
  },
  {
    key: 'LOADBALANCER',
    kidName: 'FORK', kidGlyph: '⊥', name: 'LOAD BALANCER', short: 'ALB', glyph: '⊥', color: [160, 255, 220],
    cost: 80, upkeep: 0.8, cap: 1500, queue: 120, role: 'spreader', serves: [], autoMax: 0,
    hint: 'Spreads traffic evenly across every node behind it. One APP node behind it is a single point of failure.',
  },
  {
    key: 'COMPUTE',
    kidName: 'HOUSE', kidGlyph: ICON.HOUSE, name: 'APP SERVER', short: 'APP', glyph: '%', color: [126, 255, 176],
    cost: 130, upkeep: 1.3, cap: 150, queue: 240, role: 'spreader', serves: [], autoMax: 4,
    hint: 'Does the application work, then forwards to the data tier. Press A to autoscale the fleet.',
  },
  {
    key: 'CACHE',
    kidName: 'ZIP', kidGlyph: ICON.BOLT, name: 'MEMORY CACHE', short: 'CACHE', glyph: '*', color: [255, 224, 120],
    cost: 100, upkeep: 1.0, cap: 900, queue: 160, role: 'spreader', serves: [T.READ], autoMax: 0,
    hint: 'Absorbs a share of READs (a cache hit). Misses continue downstream to the database.',
  },
  {
    key: 'QUEUE',
    kidName: 'LINE', kidGlyph: ICON.LADDER, name: 'MESSAGE QUEUE', short: 'QUEUE', glyph: '≈', color: [200, 200, 255],
    cost: 70, upkeep: 0.7, cap: 300, queue: 900, role: 'spreader', serves: [], autoMax: 0,
    hint: 'A deep buffer. Absorbs bursts by queueing instead of dropping. Watch the queue depth.',
  },
  {
    key: 'SQL',
    kidName: 'BOOK', kidGlyph: ICON.BOOK, name: 'RELATIONAL DB', short: 'SQL', glyph: '▤', color: [180, 140, 255],
    cost: 220, upkeep: 2.2, cap: 120, queue: 240, role: 'sink', serves: [T.READ, T.WRITE], autoMax: 0,
    hint: 'Serves READ and WRITE. Slow under search load, and a single one is a hard ceiling.',
  },
  {
    key: 'NOSQL',
    kidName: 'PAPERS', kidGlyph: '▥', name: 'NOSQL DB', short: 'NOSQL', glyph: '▥', color: [180, 140, 255],
    cost: 160, upkeep: 1.6, cap: 260, queue: 300, role: 'sink', serves: [T.READ, T.WRITE], autoMax: 0,
    hint: 'Twice the throughput of SQL for reads and writes, but no full-text search.',
  },
  {
    key: 'REPLICA',
    kidName: 'COPY', kidGlyph: '▦', name: 'READ REPLICA', short: 'REPL', glyph: '▦', color: [150, 170, 255],
    cost: 150, upkeep: 1.5, cap: 260, queue: 240, role: 'sink', serves: [T.READ], autoMax: 0,
    hint: 'Serves READs only. The standard fix when reads saturate a single primary.',
  },
  {
    key: 'SEARCH',
    kidName: 'GLASS', kidGlyph: '⌕', name: 'SEARCH INDEX', short: 'INDEX', glyph: '⌕', color: [255, 150, 90],
    cost: 180, upkeep: 1.8, cap: 200, queue: 160, role: 'sink', serves: [T.SEARCH], autoMax: 0,
    hint: 'The only thing that serves SEARCH. Three times faster at it than a relational database.',
  },
  {
    key: 'STORAGE',
    kidName: 'BOX', kidGlyph: ICON.CRATE, name: 'OBJECT STORAGE', short: 'S3', glyph: '▣', color: [120, 233, 255],
    cost: 60, upkeep: 0.6, cap: 400, queue: 200, role: 'sink', serves: [T.STATIC, T.UPLOAD], autoMax: 0,
    hint: 'Cheap bulk storage for STATIC and UPLOAD. Never send reads or writes here.',
  },
  {
    key: 'GPU',
    kidName: 'ROBOT', kidGlyph: ICON.GEAR, name: 'GPU INFERENCE', short: 'GPU', glyph: '◈', color: [255, 120, 200],
    cost: 420, upkeep: 4.2, cap: 90, queue: 120, role: 'sink', serves: [T.AI], autoMax: 3,
    hint: 'Serves AI inference in batches. Very expensive: autoscale it so you only pay when it is busy.',
  },
  {
    key: 'MONITOR',
    kidName: 'EYE', kidGlyph: '◦', name: 'MONITORING', short: 'MON', glyph: '◦', color: [120, 200, 180],
    cost: 90, upkeep: 0.9, cap: 9999, queue: 16, role: 'monitor', serves: [], autoMax: 0,
    hint: 'Unlocks the metrics panel (p50/p99 latency, per-node queue depth, drop reasons).',
  },
];
export const NODE = Object.fromEntries(NODES.map((n, i) => [n.key, i]));
export const N_TYPES = NODES.length;
export const PALETTE = [
  'FIREWALL', 'CDN', 'GATEWAY', 'LOADBALANCER', 'COMPUTE', 'CACHE', 'QUEUE',
  'SQL', 'NOSQL', 'REPLICA', 'SEARCH', 'STORAGE', 'GPU', 'MONITOR',
];

export const TIERS = [
  { name: 'T1', capMul: 1.0, queueMul: 1.0, costMul: 1.0, upMul: 1.0 },
  { name: 'T2', capMul: 2.2, queueMul: 1.5, costMul: 1.6, upMul: 1.6 },
  { name: 'T3', capMul: 4.4, queueMul: 2.0, costMul: 2.4, upMul: 2.4 },
];
export const CACHE_HIT = [0.45, 0.62, 0.78];   // per tier
export const AUTOSCALE = { utilHigh: 0.75, utilLow: 0.30, coldStart: 180, cooldown: 150, lowTicks: 420, extraCost: 0.30 };

/** L-shaped link path used by both the simulation (movement) and the renderer (glyphs). */
export function linkPath(ax, ay, bx, by) {
  return { cx: ax, cy: by, ex: bx, ey: by };   // vertical first, then horizontal into the target's side
}

// ---------------------------------------------------------------------------
// Levels
// objectives: complete = requests served before the deadline; maxErrors = fail line;
//   minReputation: fail line; survive: alternative win (do not drop below rep for N seconds)
// stars: errors2 = 2nd star error target, sloMs = 3rd star p99 latency target
// ---------------------------------------------------------------------------
export const LEVELS = [
  {
    id: 'L01', name: 'HELLO, WORLD', brief: 'A single endpoint, a single database, one honest request per customer. Get the request path up before the clock runs out.',
    teaches: 'Place an APP SERVER, connect the INTERNET to it, then place a database and connect the app to that.',
    budget: 380, duration: 75, startRep: 100,
    traffic: [{ type: 'READ', rps: 8, ramp: 0.25 }],
    objectives: { complete: 420, maxErrors: 90 },
    stars: { errors2: 40, sloMs: 400 },
    incidents: [{ at: 30, kind: 'NOTE', note: 'Traffic is ramping. Watch the APP SERVER load bar.' }],
  },
  {
    id: 'L02', name: 'STATIC ASSETS', brief: 'Product pages ship with images. Object storage serves them for a fraction of what your app server costs.',
    teaches: 'Add OBJECT STORAGE for STATIC traffic. An app server cannot complete a STATIC request: it will bounce.',
    budget: 520, duration: 80, startRep: 100,
    traffic: [{ type: 'STATIC', rps: 22, ramp: 0.5 }, { type: 'READ', rps: 8, ramp: 0.3 }],
    objectives: { complete: 1700, maxErrors: 120 },
    stars: { errors2: 60, sloMs: 400 },
    incidents: [{ at: 35, kind: 'NOTE', note: 'STATIC is now the majority of your traffic.' }],
  },
  {
    id: 'L03', name: 'THE CACHE', brief: 'Reads are climbing and the database is the bottleneck. A memory cache serves a share of reads without touching it.',
    teaches: 'Add a MEMORY CACHE between the app and the database. Cache hits finish immediately; misses continue downstream.',
    budget: 640, duration: 85, startRep: 100,
    traffic: [{ type: 'READ', rps: 45, ramp: 1.1 }],
    objectives: { complete: 4200, maxErrors: 150 },
    stars: { errors2: 70, sloMs: 300 },
    incidents: [{ at: 45, kind: 'NOTE', note: 'The database queue is the thing to watch.' }],
  },
  {
    id: 'L04', name: 'BLACK FRIDAY', brief: 'A marketing post goes viral every twenty seconds. Queues turn spikes into smooth load, and drops into orders you still fulfil.',
    teaches: 'Add a MESSAGE QUEUE in front of the app tier. It buffers bursts that would otherwise overflow the app queue.',
    budget: 760, duration: 90, startRep: 100,
    traffic: [{ type: 'READ', rps: 38, ramp: 0.5 }, { type: 'WRITE', rps: 14, ramp: 0.2 }],
    objectives: { complete: 5200, maxErrors: 170 },
    stars: { errors2: 80, sloMs: 500 },
    incidents: [
      { at: 22, kind: 'BURST', type: 'READ', mult: 4.5, dur: 8, note: 'The post hits the front page.' },
      { at: 46, kind: 'BURST', type: 'READ', mult: 5.5, dur: 10, note: 'Second wave, bigger.' },
      { at: 72, kind: 'BURST', type: 'WRITE', mult: 4.0, dur: 8, note: 'Checkout storm.' },
    ],
  },
  {
    id: 'L05', name: 'SCALE OUT', brief: 'One app server has a ceiling and you have found it. Fan out behind a load balancer, then let the fleet autoscale.',
    teaches: 'Add a LOAD BALANCER and a second APP SERVER, then press A on an app server to enable autoscaling.',
    budget: 980, duration: 95, startRep: 100,
    traffic: [{ type: 'READ', rps: 70, ramp: 1.5 }, { type: 'STATIC', rps: 30, ramp: 0.6 }],
    objectives: { complete: 11000, maxErrors: 220 },
    stars: { errors2: 110, sloMs: 500 },
    incidents: [
      { at: 40, kind: 'KILL', nodeType: 'COMPUTE', dur: 10, note: 'An app server instance crashes: with no second one, you are down.' },
      { at: 70, kind: 'BURST', type: 'READ', mult: 3.5, dur: 10, note: 'Evening peak.' },
    ],
  },
  {
    id: 'L06', name: 'SEARCH WORKLOAD', brief: 'Users want full-text search. Your relational database refuses those queries outright, so give them somewhere to go.',
    teaches: 'Add a SEARCH INDEX. SEARCH requests that reach anything else are refused and eventually dropped.',
    budget: 1180, duration: 95, startRep: 100,
    traffic: [{ type: 'READ', rps: 40, ramp: 0.6 }, { type: 'SEARCH', rps: 26, ramp: 0.7 }],
    objectives: { complete: 9000, maxErrors: 200 },
    stars: { errors2: 100, sloMs: 450 },
    incidents: [
      { at: 45, kind: 'BURST', type: 'SEARCH', mult: 3.0, dur: 10, note: 'A batch job crawls the site.' },
      { at: 72, kind: 'NOTE', note: 'Search traffic is still ramping.' },
    ],
  },
  {
    id: 'L07', name: 'READ SCALE', brief: 'Read traffic is heavy and constant. Replicas add read capacity; a deeper cache works too, but a cache stampede is a thing.',
    teaches: 'Add READ REPLICAS (and/or upgrade the cache tier) so reads stop queueing behind writes on the primary.',
    budget: 1560, duration: 100, startRep: 100,
    traffic: [{ type: 'READ', rps: 95, ramp: 2.6 }, { type: 'WRITE', rps: 16, ramp: 0.4 }],
    objectives: { complete: 24000, maxErrors: 300 },
    stars: { errors2: 150, sloMs: 400 },
    incidents: [
      { at: 34, kind: 'FLUSH', nodeType: 'CACHE', dur: 10, note: 'Cache nodes restart: every read misses at once (stampede).' },
      { at: 66, kind: 'BURST', type: 'READ', mult: 2.5, dur: 12, note: 'Hourly report fan-out.' },
    ],
  },
  {
    id: 'L08', name: 'WRITE PATH', brief: 'Writes are expensive and they cannot be cached. Keep them off the read path and let a queue soak up the spikes.',
    teaches: 'Use a NOSQL database and a MESSAGE QUEUE for writes, while READ traffic keeps flowing through cache and replicas.',
    budget: 1900, duration: 100, startRep: 100,
    traffic: [
      { type: 'READ', rps: 90, ramp: 1.0 }, { type: 'WRITE', rps: 42, ramp: 0.8 },
      { type: 'UPLOAD', rps: 12, ramp: 0.2 },
    ],
    objectives: { complete: 20000, maxErrors: 320 },
    stars: { errors2: 160, sloMs: 500 },
    incidents: [
      { at: 30, kind: 'BURST', type: 'WRITE', mult: 3.5, dur: 10, note: 'Bulk import from a customer.' },
      { at: 60, kind: 'KILL', nodeType: 'SQL', dur: 12, note: 'The primary database fails over. Redundancy would have saved you.' },
      { at: 80, kind: 'BURST', type: 'WRITE', mult: 4.0, dur: 10, note: 'Retry storm.' },
    ],
  },
  {
    id: 'L09', name: 'BAD ACTOR', brief: 'A DDoS arrives with the lunchtime traffic. Block the attack at the edge, and shed the rest politely instead of crashing.',
    teaches: 'Put a FIREWALL right behind the INTERNET, then an API GATEWAY to shed overload at a fraction of the reputation cost.',
    budget: 2200, duration: 100, startRep: 100,
    traffic: [
      { type: 'READ', rps: 70, ramp: 0.8 }, { type: 'STATIC', rps: 30, ramp: 0.3 },
      { type: 'MALICIOUS', rps: 55, ramp: 1.2 },
    ],
    objectives: { complete: 16000, maxErrors: 260 },
    stars: { errors2: 120, sloMs: 450 },
    incidents: [
      { at: 25, kind: 'BURST', type: 'MALICIOUS', mult: 5.0, dur: 12, note: 'The botnet wakes up.' },
      { at: 58, kind: 'BURST', type: 'MALICIOUS', mult: 6.0, dur: 14, note: 'Second volley, harder.' },
      { at: 84, kind: 'BURST', type: 'READ', mult: 2.5, dur: 10, note: 'Users pile in to watch the carnage.' },
    ],
  },
  {
    id: 'L10', name: 'INFERENCE', brief: 'The AI feature ships this afternoon. GPU capacity is slow and brutally expensive, so pay only for the peak and batch the rest.',
    teaches: 'Add GPU INFERENCE nodes for AI traffic, enable autoscaling on them, and keep the read path healthy at the same time.',
    budget: 2600, duration: 110, startRep: 100,
    traffic: [
      { type: 'AI', rps: 16, ramp: 0.35 }, { type: 'READ', rps: 95, ramp: 1.0 },
      { type: 'WRITE', rps: 20, ramp: 0.3 },
    ],
    objectives: { complete: 22000, maxErrors: 300 },
    stars: { errors2: 150, sloMs: 600 },
    incidents: [
      { at: 30, kind: 'BURST', type: 'AI', mult: 4.0, dur: 12, note: 'A demo goes viral on social media.' },
      { at: 62, kind: 'KILL', nodeType: 'GPU', dur: 12, note: 'A GPU node thermal-throttles and drops out of the fleet.' },
      { at: 85, kind: 'BURST', type: 'AI', mult: 5.0, dur: 12, note: 'Second demo wave.' },
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// PLAY MODE (the friendly mode). Same simulation, pictures instead of numbers, and a much smaller
// set of things to learn: every level adds exactly one new picture, and the only question is which
// tile matches the picture that is queueing at the CLOUD.
//
//   K01  one request type, two tiles: the HOUSE and the BOOK that finishes happy faces
//   K02  pictures arrive too: a BOX holds pictures (the BOOK refuses them)
//   K03  "find it" arrives: only the GLASS can answer those
//   K04  stars arrive: they need the ROBOT
export const KID_LEVELS = [
  {
    id: 'K01', kid: true, name: 'HAPPY FACES',
    brief: 'Happy faces want to come in and be counted. Tap the HOUSE, then the BOOK.',
    teaches: 'Tap a tile, then tap the board. The CLOUD sends everything along the wires.',
    budget: 600, duration: 150, startRep: 300, seed: 0x4b3031,
    traffic: [{ type: 'READ', rps: 7, ramp: 0.1 }],
    objectives: { complete: 300, maxErrors: 150 },
    stars: { errors2: 20, sloMs: 900 },
    unlock: ['COMPUTE', 'SQL'],
    incidents: [],
  },
  {
    id: 'K02', kid: true, name: 'PICTURES',
    brief: 'Now pictures arrive as well. The BOOK will not take pictures: add a BOX.',
    teaches: 'Every kind of thing has its own home. Match the picture to the tile.',
    budget: 900, duration: 165, startRep: 300, seed: 0x4b3032,
    traffic: [{ type: 'READ', rps: 6, ramp: 0.08 }, { type: 'STATIC', rps: 5, ramp: 0.06 }],
    objectives: { complete: 450, maxErrors: 200 },
    stars: { errors2: 30, sloMs: 900 },
    unlock: ['COMPUTE', 'SQL', 'STORAGE'],
    incidents: [],
  },
  {
    id: 'K03', kid: true, name: 'FIND IT',
    brief: 'Someone is asking questions. Only the GLASS can find things: add one.',
    teaches: 'The BOOK says no to questions. A different picture can need a different tile.',
    budget: 1400, duration: 180, startRep: 300, seed: 0x4b3033,
    traffic: [
      { type: 'READ', rps: 6, ramp: 0.08 }, { type: 'STATIC', rps: 5, ramp: 0.06 },
      { type: 'SEARCH', rps: 4, ramp: 0.05 },
    ],
    objectives: { complete: 600, maxErrors: 260 },
    stars: { errors2: 40, sloMs: 900 },
    unlock: ['COMPUTE', 'SQL', 'STORAGE', 'SEARCH'],
    incidents: [],
  },
  {
    id: 'K04', kid: true, name: 'STARS',
    brief: 'Stars need a ROBOT. Robots are expensive: tap the ROBOT and then the board.',
    teaches: 'The last picture: big jobs need the biggest box.',
    budget: 3000, duration: 195, startRep: 300, seed: 0x4b3034,
    traffic: [
      { type: 'READ', rps: 6, ramp: 0.08 }, { type: 'STATIC', rps: 5, ramp: 0.06 },
      { type: 'AI', rps: 3, ramp: 0.04 },
    ],
    objectives: { complete: 420, maxErrors: 300 },
    stars: { errors2: 50, sloMs: 900 },
    unlock: ['COMPUTE', 'SQL', 'STORAGE', 'GPU'],
    incidents: [],
  },
];

export const ENDLESS = {
  id: 'ENDLESS', name: 'ENDLESS SHIFT', brief: 'Traffic ramps forever and an incident lands every 25 seconds. Score is requests completed before the wheels come off.',
  teaches: 'Everything at once. Survive, bank money, and keep adding capacity where the queue tells you to.',
  budget: 2600, duration: SIM.MAX_SECONDS, startRep: 100,
  traffic: [
    { type: 'STATIC', rps: 30, ramp: 1.2 }, { type: 'READ', rps: 60, ramp: 1.6 },
    { type: 'WRITE', rps: 12, ramp: 0.6 }, { type: 'UPLOAD', rps: 6, ramp: 0.3 },
    { type: 'SEARCH', rps: 10, ramp: 0.5 }, { type: 'AI', rps: 4, ramp: 0.25 },
  ],
  objectives: { complete: 999999, maxErrors: 1e9, endless: true },
  stars: { errors2: 0, sloMs: 0 },
  incidents: [],
};

/** Deterministic incident generator for ENDLESS / DAILY (same seed -> same run). */
export function generateIncidents(levelId, seed, rng) {
  const out = [];
  const kinds = ['BURST', 'DDOS', 'KILL', 'FLUSH', 'SPIKE'];
  const types = ['READ', 'WRITE', 'STATIC', 'SEARCH', 'AI', 'UPLOAD'];
  const nodeTypes = ['COMPUTE', 'SQL', 'CACHE', 'GPU', 'REPLICA', 'NOSQL'];
  const every = levelId === 'ENDLESS' ? 25 : 30;
  for (let t = 30; t < SIM.MAX_SECONDS - 20; t += every) {
    const kind = kinds[rng.int(kinds.length)];
    if (kind === 'BURST') out.push({ at: t, kind, type: types[rng.int(types.length)], mult: 2 + rng.next() * 4, dur: 8 + rng.int(8), note: 'Traffic spike.' });
    else if (kind === 'DDOS') out.push({ at: t, kind: 'BURST', type: 'MALICIOUS', mult: 3 + rng.next() * 4, dur: 8 + rng.int(8), note: 'Attack traffic.' });
    else if (kind === 'KILL') out.push({ at: t, kind, nodeType: nodeTypes[rng.int(nodeTypes.length)], dur: 10 + rng.int(6), note: 'A node fails.' });
    else if (kind === 'FLUSH') out.push({ at: t, kind, nodeType: 'CACHE', dur: 8 + rng.int(6), note: 'Cold cache.' });
    else out.push({ at: t, kind: 'NOTE', note: 'Sustained load.' });
  }
  return out;
}

export function dailyLevel(dateUTC, seed) {
  const rng = seedRng(seed);
  const pools = [
    [{ type: 'READ', rps: 60, ramp: 1.2 }, { type: 'STATIC', rps: 25, ramp: 0.6 }],
    [{ type: 'READ', rps: 45, ramp: 0.9 }, { type: 'WRITE', rps: 25, ramp: 0.6 }],
    [{ type: 'READ', rps: 70, ramp: 1.1 }, { type: 'SEARCH', rps: 20, ramp: 0.5 }],
    [{ type: 'READ', rps: 55, ramp: 1.0 }, { type: 'AI', rps: 12, ramp: 0.3 }],
    [{ type: 'STATIC', rps: 40, ramp: 0.8 }, { type: 'READ', rps: 35, ramp: 0.7 }, { type: 'MALICIOUS', rps: 30, ramp: 0.9 }],
  ];
  const set = pools[rng.int(pools.length)];
  return {
    id: 'DAILY', name: 'DAILY SHIFT ' + dateUTC, brief: 'One seed, one shift, one shot. Everyone gets the same traffic and the same incidents.',
    teaches: 'Same run for every player. Check the seed hash at the end to prove it.',
    budget: 2400, duration: 120, startRep: 100, traffic: set,
    objectives: { complete: 18000, maxErrors: 420 },
    stars: { errors2: 200, sloMs: 550 },
    incidents: generateIncidents('DAILY', seed, rng),
    seed,
  };
}
// local import-free rng for content (kept tiny on purpose)
function seedRng(seed) {
  let s = (seed >>> 0) || 1;
  return { next() { let t = (s += 0x6d2b79f5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }, int(n) { return (this.next() * n) | 0; } };
}

/** Node capacity in requests/sec for a tier, including extra autoscaled instances. */
export function nodeCapRps(nodeIdx, tier, inst = 1) {
  const n = NODES[nodeIdx];
  const t = TIERS[Math.min(tier, TIERS.length - 1)];
  return n.cap * t.capMul * Math.max(1, inst);
}
export function nodeQueueCap(nodeIdx, tier) {
  const n = NODES[nodeIdx];
  const t = TIERS[Math.min(tier, TIERS.length - 1)];
  return Math.min(1024, Math.round(n.queue * t.queueMul));
}
export function nodeUpkeep(nodeIdx, tier, inst = 1) {
  const n = NODES[nodeIdx];
  const t = TIERS[Math.min(tier, TIERS.length - 1)];
  const fleet = 1 + 0.5 * Math.max(0, inst - 1);
  return n.upkeep * t.upMul * fleet;
}
export function upgradeCost(nodeIdx, tier) {
  const n = NODES[nodeIdx];
  const next = TIERS[Math.min(tier + 1, TIERS.length - 1)];
  return Math.round(n.cost * next.costMul * 0.85);
}

// ---------------------------------------------------------------------------
// Build palette unlocks. Early levels hand you two boxes and make you think;
// later levels keep adding one idea at a time. ENDLESS and DAILY get everything.
// ---------------------------------------------------------------------------
const UNLOCKS = {
  L01: ['COMPUTE', 'SQL'],
  L02: ['COMPUTE', 'SQL', 'STORAGE'],
  L03: ['COMPUTE', 'SQL', 'STORAGE', 'CACHE'],
  L04: ['COMPUTE', 'SQL', 'STORAGE', 'CACHE', 'QUEUE'],
  L05: ['COMPUTE', 'SQL', 'STORAGE', 'CACHE', 'QUEUE', 'LOADBALANCER', 'CDN'],
  L06: ['COMPUTE', 'SQL', 'STORAGE', 'CACHE', 'QUEUE', 'LOADBALANCER', 'CDN', 'SEARCH'],
  L07: ['COMPUTE', 'SQL', 'STORAGE', 'CACHE', 'QUEUE', 'LOADBALANCER', 'CDN', 'SEARCH', 'REPLICA'],
  L08: ['COMPUTE', 'SQL', 'STORAGE', 'CACHE', 'QUEUE', 'LOADBALANCER', 'CDN', 'SEARCH', 'REPLICA', 'NOSQL', 'MONITOR'],
  L09: ['COMPUTE', 'SQL', 'STORAGE', 'CACHE', 'QUEUE', 'LOADBALANCER', 'CDN', 'SEARCH', 'REPLICA', 'NOSQL', 'MONITOR', 'FIREWALL'],
  L10: ['COMPUTE', 'SQL', 'STORAGE', 'CACHE', 'QUEUE', 'LOADBALANCER', 'CDN', 'SEARCH', 'REPLICA', 'NOSQL', 'MONITOR', 'FIREWALL', 'GATEWAY', 'GPU'],
};
for (const lv of LEVELS) lv.unlock = (UNLOCKS[lv.id] || PALETTE).slice();
ENDLESS.unlock = PALETTE.slice();
