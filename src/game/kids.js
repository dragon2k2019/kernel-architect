// src/game/kids.js — PLAY MODE: the same simulation, played with pictures.
//
// The rules a five-year-old needs:
//   1. things arrive at the CLOUD, and every kind of thing has a picture
//   2. a box only takes the pictures it can do; if nobody can take a picture it comes back sad
//   3. tap the tile with the same picture, then tap the board
// Everything else (wiring, money, tiers, capacity) is done for them: placing a box wires it up in the
// right place, and the boxes they will ever need are the tiles on the right of the screen.

import { NODES, NODE, TRAFFIC, T, KID_LEVELS } from '../sim/content.js';
import { ICON } from '../render/atlas.js';
import { CAP } from '../core/arena.js';

export { KID_LEVELS };

/** Which nodes are "behind" the house: they need traffic that has already passed an app server. */
const BEHIND_HOUSE = new Set(['SQL', 'NOSQL', 'REPLICA', 'SEARCH', 'CACHE', 'QUEUE', 'GPU']);
/** Edge boxes sit straight behind the cloud. */
const AT_EDGE = new Set(['STORAGE', 'CDN', 'FIREWALL', 'GATEWAY']);

/** The next PLAY level to offer: the first one without a star, else the last. */
export function nextKidLevel(progress = {}) {
  for (const lv of KID_LEVELS) if (!(progress[lv.id] > 0)) return lv;
  return KID_LEVELS[KID_LEVELS.length - 1];
}

export function kidLevelIndex(level) {
  const i = KID_LEVELS.indexOf(level);
  return i < 0 ? 0 : i;
}

/** The tiles for a level: one big picture button per unlocked node, in the order they are learned. */
export function kidTiles(level) {
  const keys = (level && level.unlock) || ['COMPUTE', 'SQL'];
  return keys.map((key) => {
    const def = NODES[NODE[key]];
    return { key, name: def.kidName || def.short, glyph: def.kidGlyph || def.glyph, cost: def.cost, serves: def.serves.slice() };
  });
}

/** Level traffic is written as names in content.js; every picture lookup wants the number. */
export function typeId(type) { return typeof type === 'number' ? type : T[type]; }

/** Which picture finishes this request? (for the "the pictures want…" strip and the hints) */
export function kidIconsFor(type) {
  return NODES.filter((n) => n.serves.includes(type)).map((n) => ({ key: n.key, name: n.kidName || n.short, glyph: n.kidGlyph || n.glyph }));
}

export function trafficKid(type) {
  const id = typeId(type);
  const t = TRAFFIC[id];
  return { id, glyph: t.kidGlyph || t.glyph, name: t.kidName || t.key, color: t.color };
}

// ------------------------------------------------------------------ setting the scene
const CLOUD = () => 0;                                   // the internet is always node 0

function firstOf(sim, key) {
  const t = NODE[key], n = sim.nodes;
  for (let i = 0; i < n.count; i++) if (n.state[i] !== 0 && n.type[i] === t) return i;
  return -1;
}
export function countOf(sim, key) {
  const t = NODE[key], n = sim.nodes;
  let c = 0;
  for (let i = 0; i < n.count; i++) if (n.state[i] !== 0 && n.type[i] === t) c++;
  return c;
}

/** Start a PLAY level: the house is already there, wired to the cloud, waiting for the first tap. */
export function enterKid(sim) {
  const cloud = sim.net !== undefined ? sim.net : CLOUD();
  const spot = { x: 44, y: 20 };
  let house = firstOf(sim, 'COMPUTE');
  if (house < 0) {
    const r = sim.do('place', { type: 'COMPUTE', x: spot.x, y: spot.y });
    if (!r.ok) {
      const alt = sim.do('place', { type: 'COMPUTE', x: 20, y: 8 });
      if (!alt.ok) return { ok: false, err: r.err || alt.err };
      house = alt.i;
    } else house = r.i;
  }
  if (!sim.isConnected(cloud, house)) sim.do('connect', { a: cloud, b: house });
  return { ok: true, house };
}

/**
 * Wire a freshly placed box the way a grown-up would have: edge boxes hang off the cloud, everything
 * else hangs off the first house, and a cache also gets the book behind it.
 */
export function kidAutoWire(sim, i) {
  const n = sim.nodes;
  const key = NODES[n.type[i]].key;
  const cloud = sim.net !== undefined ? sim.net : CLOUD();
  const house = firstOf(sim, 'COMPUTE');
  const wires = [];
  if (key === 'COMPUTE') {
    if (!sim.isConnected(cloud, i)) wires.push([cloud, i]);
  } else if (AT_EDGE.has(key)) {
    if (!sim.isConnected(cloud, i)) wires.push([cloud, i]);
  } else if (BEHIND_HOUSE.has(key)) {
    const from = house >= 0 ? house : cloud;
    if (!sim.isConnected(from, i)) wires.push([from, i]);
    if (key === 'CACHE') {
      const book = firstOf(sim, 'SQL');
      if (book >= 0 && !sim.isConnected(i, book)) wires.push([i, book]);
    }
  }
  const done = [];
  for (const [a, b] of wires) {
    const r = sim.do('connect', { a, b });
    if (r && r.ok) done.push([a, b]);
  }
  return done;
}

/** Place a tile at the spot the player tapped, falling back to the next free spot if that is taken. */
export function kidPlaceAt(sim, key, x, y) {
  const snapped = { x: Math.max(2, Math.min(101, Math.round(x))), y: Math.max(2, Math.min(38, Math.round(y))) };
  const r = sim.do('place', { type: key, x: snapped.x, y: snapped.y });
  if (r.ok) return { ...r, wires: kidAutoWire(sim, r.i), spot: snapped };
  return kidPlace(sim, key);
}

/** How many of each tile the player has built (the tile rail shows it). */
export function kidCounts(sim, level) {
  const out = {};
  for (const t of kidTiles(level)) out[t.key] = countOf(sim, t.key);
  return out;
}

/** What is standing in line right now, per request type: the "WAITING" strip. */
export function kidQueue(sim) {
  const out = {};
  const n = sim.nodes, P = sim.packets;
  for (let i = 0; i < n.count; i++) {
    if (n.state[i] === 0 || n.queueCount[i] <= 0) continue;
    const cap = Math.max(1, n.queueCap[i]);
    for (let k = 0; k < n.queueCount[i]; k++) {
      const p = n.queue[i * CAP.MAX_QUEUE + ((n.queueHead[i] + k) % cap)];
      if (p < 0) continue;
      const t = P.type[p];
      out[t] = (out[t] || 0) + 1;
    }
  }
  return out;
}

/** Place a tile: the box lands on the next free spot inside the friendly area and wires itself up. */
export function kidPlace(sim, key, x = null, y = null) {
  const spot = (x === null || y === null) ? kidSpot(sim) : { x, y };
  const r = sim.do('place', { type: key, x: spot.x, y: spot.y });
  if (!r.ok) return r;
  const wires = kidAutoWire(sim, r.i);
  return { ...r, wires, spot };
}

/** Somewhere on the left half of the board that is not taken yet: go right, then down. */
export function kidSpot(sim) {
  const n = sim.nodes;
  const fits = (x, y) => {
    for (let i = 0; i < n.count; i++) {
      if (n.state[i] === 0) continue;
      if (x < n.x[i] + n.w[i] + 2 && n.x[i] < x + 15 + 2 && y < n.y[i] + n.h[i] + 2 && n.y[i] < y + 4 + 2) return false;
    }
    return x >= 2 && x + 15 <= 116 && y >= 2 && y + 4 <= 42;
  };
  for (let y = 4; y <= 38; y += 6) {
    for (let x = 4; x <= 100; x += 8) if (fits(x, y)) return { x, y };
  }
  return { x: 60, y: 30 };
}

// ------------------------------------------------------------------ what the screen should say
/** The one line of advice a young player can act on, in pictures and short words. */
export function kidMessage(sim, level) {
  const cloud = sim.net !== undefined ? sim.net : 0;
  const n = sim.nodes;
  // 1. a picture that nobody can take: it comes back sad, and it is the thing to fix
  const types = (level.traffic || []).map((t) => typeId(t.type)).filter((t) => t !== undefined);
  for (const type of types) {
    const anyServerBuilt = n.count > 0 && NODES.some((def, di) => def.serves.includes(type) && firstOf(sim, def.key) >= 0);
    if (anyServerBuilt) continue;
    if ((sim.dropByType[type] || 0) > 0 || (sim.rateNow[type] || 0) > 0) {
      const want = kidIconsFor(type).find((c) => (level.unlock || []).includes(c.key)) || kidIconsFor(type)[0];
      const pic = trafficKid(type);
      return { kind: 'missing', text: `NOBODY TAKES THE ${pic.name}`, icon: pic.glyph, tile: want ? want.key : null, tileName: want ? want.name : '' };
    }
  }
  // 2. a box that is full: add another of the same
  for (let i = 0; i < n.count; i++) {
    if (n.state[i] === 0) continue;
    if (n.queueCap[i] > 0 && n.queueCount[i] > n.queueCap[i] * 0.55) {
      const def = NODES[n.type[i]];
      return { kind: 'full', text: `THE ${def.kidName || def.short} IS FULL`, icon: def.kidGlyph || def.glyph, tile: def.key, tileName: def.kidName || def.short, node: i };
    }
  }
  // 3. nothing wrong: celebrate whatever is working
  for (const type of types) {
    if ((sim.doneByType[type] || 0) > 0) {
      const pic = trafficKid(type);
      return { kind: 'ok', text: `LOOK AT THE ${pic.name} GO`, icon: pic.glyph };
    }
  }
  const first = types.length ? trafficKid(types[0]) : { name: 'THINGS', glyph: ICON.SMILE };
  return { kind: 'idle', text: `HERE COME THE ${first.name}`, icon: first.glyph };
}

/** Progress for the big strip: how many pips are full, and the pips that are still empty. */
export function kidGoal(sim, level, pips = 20) {
  const need = Math.max(1, (level.objectives && level.objectives.complete) || 1);
  const done = Math.min(1, sim.completed / need);
  return { done: sim.completed, need, frac: done, full: Math.round(done * pips), pips };
}

/** Hearts: the cushion of reputation a young player gets, drawn as five hearts. */
export function kidHearts(sim, level, max = 5) {
  const start = (level && level.startRep) || 100;
  const frac = Math.max(0, Math.min(1, sim.rep / start));
  return { frac, full: Math.round(frac * max), max };
}

// ------------------------------------------------------------------ the guided steps
const icon = (glyph) => ({ glyph });

/** Steps for a PLAY level: look at the cloud, add the new tile, watch it work. */
export function kidSteps(level) {
  if (!level || !level.kid) return null;
  const first = KID_LEVELS.indexOf(level) === 0;
  const tiles = kidTiles(level);
  const steps = [];
  steps.push({
    id: 'look', title: 'LOOK AT THE CLOUD', card: ['Everything comes in here.'], icons: [ICON.CLOUD],
    focus: [{ nodes: ['INTERNET'] }], allow: null, check: null, primary: 'next',
  });
  if (first) {
    const house = tiles.find((t) => t.key === 'COMPUTE');
    const book = tiles.find((t) => t.key === 'SQL');
    steps.push({
      id: 'tap-house', title: 'TAP THE HOUSE', card: ['Then tap the board.'], icons: [house ? house.glyph : ICON.HOUSE],
      focus: [{ item: 'COMPUTE' }, { zone: [18, 5, 88, 26] }],
      allow: { build: ['COMPUTE'], wire: [], zone: null, ops: [] },
      check: (g) => countOf(g.sim, 'COMPUTE') >= 2, primary: 'skip',
      hint: 'Tap the HOUSE tile, then the board.',
    });
    steps.push({
      id: 'tap-book', title: 'TAP THE BOOK', card: ['The happy faces need it.'], icons: [book ? book.glyph : ICON.BOOK],
      focus: [{ item: 'SQL' }, { zone: [18, 5, 88, 26] }],
      allow: { build: ['SQL'], wire: [], zone: null, ops: [] },
      check: (g) => countOf(g.sim, 'SQL') >= 1, primary: 'skip',
      hint: 'Tap the BOOK tile, then the board.',
    });
  } else {
    const fresh = tiles.find((t) => !['COMPUTE', 'SQL'].includes(t.key)) || tiles[tiles.length - 1];
    steps.push({
      id: 'tap-new', title: `TAP THE ${fresh.name}`, card: ['Look at the picture that is sad.'], icons: [fresh.glyph],
      focus: [{ item: fresh.key }, { zone: [18, 5, 88, 26] }],
      allow: { build: [fresh.key], wire: [], zone: null, ops: [] },
      check: (g) => countOf(g.sim, fresh.key) >= 1, primary: 'skip',
      hint: `Tap the ${fresh.name} tile, then the board.`,
    });
  }
  steps.push({
    id: 'watch', title: 'WATCH THEM GO', card: ['Tap the big arrow when they are all in.'], icons: [ICON.SMILE, ICON.HEART],
    focus: [{ panel: 'OBJECTIVES' }], allow: null,
    check: (g) => g.sim.completed >= Math.max(20, Math.round((level.objectives.complete || 300) * 0.06)),
    primary: 'skip',
  });
  return steps;
}
