// src/sim/sim.js — the deterministic simulation. One fixed tick at a time, no wall-clock, no Math.random.
//
// Model in one paragraph: packets are ECS entities. Each traffic type has a set of "terminal" node types
// that can complete it. A reverse-BFS flow field (per type, per app-processed state) tells every node which
// neighbour is closer to a terminal. Nodes serve their queue at a fixed requests/sec, complete what they can,
// and forward the rest. Queues overflow, packets age out, budgets run dry, incidents land on a schedule.

import { PacketPool, NodeTable, CAP } from '../core/arena.js';
import { Rng, streamSeed } from '../core/rng.js';
import {
  SIM, TRAFFIC, T, N_TRAFFIC, NODES, NODE, N_TYPES, TIERS, CACHE_HIT, AUTOSCALE,
  nodeCapRps, nodeQueueCap, nodeUpkeep, upgradeCost, linkPath,
} from './content.js';

/** Nodes that only accept traffic that has already been through an APP SERVER. */
const REQUIRES_APP = new Uint8Array(N_TYPES);
for (const k of ['CACHE', 'SQL', 'NOSQL', 'REPLICA', 'SEARCH', 'GPU']) REQUIRES_APP[NODE[k]] = 1;
const IS_COMPUTE = new Uint8Array(N_TYPES); IS_COMPUTE[NODE.COMPUTE] = 1;
const IS_CACHE = new Uint8Array(N_TYPES); IS_CACHE[NODE.CACHE] = 1;
const IS_GATEWAY = new Uint8Array(N_TYPES); IS_GATEWAY[NODE.GATEWAY] = 1;
const IS_SPREADER = NODES.map((n) => n.role === 'spreader' || n.role === 'source');

const DROP = { NONE: 0, NO_ROUTE: 1, TIMEOUT: 2, QUEUE_FULL: 3, NODE_DOWN: 4, THROTTLED: 5 };
export const DROP_TEXT = { 0: '-', 1: 'NO ROUTE', 2: 'TIMEOUT 504', 3: 'QUEUE FULL', 4: 'NODE DOWN', 5: 'THROTTLED' };

export const NODE_W = 15, NODE_H = 4;        // node box size in terminal cells
export const WORLD_W = 118, WORLD_H = 44;    // playable area in terminal cells

export class Sim {
  constructor(level, opts = {}) {
    this.level = level;
    this.seed = (opts.seed >>> 0) || 0xDEADBEEF;
    this.packets = new PacketPool();
    this.nodes = new NodeTable();
    this.money = level.budget;
    this.rep = level.startRep ?? 100;
    this.durationTicks = Math.round(level.duration * SIM.TICK_RATE);
    this.tick = 0;
    this.state = 'running';          // running | won | lost
    this.reason = '';
    this.completed = 0; this.dropped = 0; this.spawned = 0;
    this.income = 0; this.spent = 0; this.upkeepPaid = 0;
    this.doneByType = new Int32Array(N_TRAFFIC);
    this.dropByType = new Int32Array(N_TRAFFIC);
    this.dropByReason = new Int32Array(6);
    this.dropByNode = new Int32Array(CAP.MAX_NODES);
    this.actions = [];               // replay log: {tick, op, ...}
    this.log = [];                   // human-readable event console
    this.logSeq = 0;
    this.reach = new Int16Array(N_TRAFFIC * CAP.MAX_NODES * 2).fill(-1);
    this.spawnAcc = new Float64Array(N_TRAFFIC);
    this.rateNow = new Float64Array(N_TRAFFIC);
    this.burstMul = new Float64Array(N_TRAFFIC).fill(1);
    this.burstUntil = new Int32Array(N_TRAFFIC);
    this.spikeUntil = 0;
    this.hist = new Float32Array(4096); this.histN = 0; this.histI = 0;
    this.incidents = (level.incidents || []).slice().sort((a, b) => a.at - b.at);
    this.incidentI = 0;
    this.rr = new Int32Array(CAP.MAX_NODES);         // round-robin cursor per node
    this.cacheRng = new Rng(streamSeed(this.seed, 4242));
    this.hitRate = new Float32Array(CAP.MAX_NODES);
    this.flushUntil = new Int32Array(CAP.MAX_NODES);
    this.downUntil = new Int32Array(CAP.MAX_NODES);
    this.bestP99 = 1e9;
    this.noRouteWarn = new Uint8Array(N_TRAFFIC);
    this.upkeep = 0;
    this.build();
  }

  // ---------------------------------------------------------------- construction
  build() {
    this.nodes.reset();
    // INTERNET is pre-placed: traffic has to come from somewhere.
    const net = this.addNode(NODE.INTERNET, 3, Math.floor(WORLD_H / 2) - 2, true);
    this.net = net;
  }

  addNode(type, x, y, silent = false) {
    const n = this.nodes;
    const i = n.count++;
    n.type[i] = type; n.state[i] = 1; n.x[i] = x; n.y[i] = y; n.w[i] = NODE_W; n.h[i] = NODE_H;
    n.tier[i] = 0; n.outCount[i] = 0; n.inCount[i] = 0; n.inst[i] = 1; n.auto[i] = 0;
    n.queueCap[i] = nodeQueueCap(type, 0);
    n.hitRate[i] = CACHE_HIT[0];
    n.name[i] = NODES[type].short;
    for (let k = 0; k < CAP.MAX_OUT; k++) { n.outs[i * CAP.MAX_OUT + k] = -1; n.ins[i * CAP.MAX_OUT + k] = -1; }
    if (!silent) this.rebuild();
    return i;
  }

  /** Writes an action to the replay log and applies it. Everything the player does goes through here. */
  do(op, args) {
    this.actions.push({ tick: this.tick, op, ...args });
    return this.applyOp({ tick: this.tick, op, ...args });
  }

  applyOp(a) {
    switch (a.op) {
      case 'place':   return this.opPlace(a.type, a.x, a.y);
      case 'remove':  return this.opRemove(a.i);
      case 'connect': return this.opConnect(a.a, a.b);
      case 'upgrade': return this.opUpgrade(a.i);
      case 'auto':    return this.opAuto(a.i, a.on);
      case 'disconnect': return this.opDisconnect(a.a, a.b);
      default:        return { ok: false, err: 'unknown op' };
    }
  }

  canAfford(v) { return this.money >= v; }

  /** Pure validity check used by opPlace and by the UI's placement ghost. Never mutates. */
  canPlaceAt(typeKey, x, y) {
    const type = NODE[typeKey];
    if (type === undefined) return { ok: false, err: 'unknown node' };
    const def = NODES[type];
    if (this.nodes.count >= CAP.MAX_NODES) return { ok: false, err: 'node limit reached' };
    if (x < 0 || y < 0 || x + NODE_W > WORLD_W || y + NODE_H > WORLD_H) return { ok: false, err: 'outside the board' };
    for (let i = 0; i < this.nodes.count; i++) {
      const n = this.nodes;
      if (n.state[i] === 0) continue;
      if (x < n.x[i] + n.w[i] + 2 && n.x[i] < x + NODE_W + 2 && y < n.y[i] + n.h[i] + 1 && n.y[i] < y + NODE_H + 1) {
        return { ok: false, err: 'too close to ' + def.short };
      }
    }
    if (!this.canAfford(def.cost)) return { ok: false, err: 'not enough money (need $' + def.cost + ')' };
    return { ok: true, type, def };
  }

  opPlace(typeKey, x, y) {
    const chk = this.canPlaceAt(typeKey, x, y);
    if (!chk.ok) return chk;
    const def = chk.def;
    this.money -= def.cost; this.spent += def.cost;
    const i = this.addNode(chk.type, x, y);
    return { ok: true, i };
  }

  opRemove(i) {
    const n = this.nodes;
    if (i < 0 || i >= n.count || n.state[i] === 0) return { ok: false, err: 'no such node' };
    if (n.type[i] === NODE.INTERNET) return { ok: false, err: 'the INTERNET cannot be removed' };
    const outs = []; for (let o = 0; o < n.outCount[i]; o++) outs.push(n.outs[i * CAP.MAX_OUT + o]);
    const ups = []; for (let k = 0; k < n.inCount[i]; k++) ups.push(n.ins[i * CAP.MAX_OUT + k]);
    for (const v of outs) if (v >= 0) this.disconnect(i, v, true);
    for (const u of ups) if (u >= 0) this.disconnect(u, i, true);
    for (let q = 0; q < n.queueCount[i]; q++) {
      const p = n.queue[i * CAP.MAX_QUEUE + ((n.queueHead[i] + q) % n.queueCap[i])];
      if (p >= 0) this.packets.release(p);
    }
    n.queueCount[i] = 0; n.queueHead[i] = 0; n.queueTail[i] = 0;
    const refund = Math.round(NODES[n.type[i]].cost * 0.5);
    this.money += refund;
    n.state[i] = 0;
    this.rebuild();
    return { ok: true, refund };
  }

  opConnect(a, b) {
    const n = this.nodes;
    if (a === b) return { ok: false, err: 'cannot link a node to itself' };
    if (!(a >= 0 && a < n.count && n.state[a] === 1) || !(b >= 0 && b < n.count && n.state[b] === 1)) return { ok: false, err: 'node is gone' };
    if (n.outCount[a] >= CAP.MAX_OUT) return { ok: false, err: NODES[n.type[a]].short + ' has no free port (max ' + CAP.MAX_OUT + ')' };
    if (n.inCount[b] >= CAP.MAX_OUT) return { ok: false, err: NODES[n.type[b]].short + ' has no free input (max ' + CAP.MAX_OUT + ')' };
    for (let k = 0; k < n.outCount[a]; k++) if (n.outs[a * CAP.MAX_OUT + k] === b) return { ok: false, err: 'already linked' };
    n.outs[a * CAP.MAX_OUT + n.outCount[a]] = b; n.outCount[a]++;
    n.ins[b * CAP.MAX_OUT + n.inCount[b]] = a; n.inCount[b]++;
    this.rebuild();
    return { ok: true };
  }

  disconnect(a, b, quiet = false) {
    const n = this.nodes;
    for (let k = 0; k < CAP.MAX_OUT; k++) {
      if (n.outs[a * CAP.MAX_OUT + k] === b) {
        for (let m = k; m < n.outCount[a] - 1; m++) n.outs[a * CAP.MAX_OUT + m] = n.outs[a * CAP.MAX_OUT + m + 1];
        n.outs[a * CAP.MAX_OUT + n.outCount[a] - 1] = -1; n.outCount[a]--; break;
      }
    }
    for (let k = 0; k < CAP.MAX_OUT; k++) {
      if (n.ins[b * CAP.MAX_OUT + k] === a) {
        for (let m = k; m < n.inCount[b] - 1; m++) n.ins[b * CAP.MAX_OUT + m] = n.ins[b * CAP.MAX_OUT + m + 1];
        n.ins[b * CAP.MAX_OUT + n.inCount[b] - 1] = -1; n.inCount[b]--; break;
      }
    }
    if (!quiet) this.rebuild();
  }

  opDisconnect(a, b) {
    const n = this.nodes;
    if (a < 0 || b < 0 || a >= n.count || b >= n.count) return { ok: false, err: 'no such link' };
    if (!this.isConnected(a, b)) return { ok: false, err: 'not wired' };
    this.disconnect(a, b);
    return { ok: true };
  }

  isConnected(a, b) {
    const n = this.nodes;
    for (let k = 0; k < n.outCount[a]; k++) if (n.outs[a * CAP.MAX_OUT + k] === b) return true;
    return false;
  }

  opUpgrade(i) {
    const n = this.nodes;
    if (i < 0 || i >= n.count || n.state[i] === 0) return { ok: false, err: 'no such node' };
    if (n.tier[i] >= TIERS.length - 1) return { ok: false, err: 'already at T3' };
    const cost = upgradeCost(n.type[i], n.tier[i]);
    if (!this.canAfford(cost)) return { ok: false, err: 'not enough money (' + cost + ' needed)' };
    this.money -= cost; this.spent += cost;
    n.tier[i]++; n.queueCap[i] = nodeQueueCap(n.type[i], n.tier[i]);
    if (IS_CACHE[n.type[i]]) n.hitRate[i] = CACHE_HIT[Math.min(n.tier[i], CACHE_HIT.length - 1)];
    this.rebuild();
    return { ok: true, cost, tier: n.tier[i] };
  }

  opAuto(i, on) {
    const n = this.nodes;
    if (i < 0 || i >= n.count || n.state[i] === 0) return { ok: false, err: 'no such node' };
    if (!NODES[n.type[i]].autoMax) return { ok: false, err: NODES[n.type[i]].short + ' cannot autoscale' };
    n.auto[i] = on ? 1 : 0;
    if (!on) { n.scaleCount[i] = 0; n.pending[i] = 0; n.warm[i] = 0; n.lowTicks[i] = 0; }
    return { ok: true, auto: !!on };
  }

  // ---------------------------------------------------------------- routing
  /** Reverse-BFS flow field: reach[type][node*2 + appFlag] = hops to a terminal, or -1. */
  rebuild() {
    const n = this.nodes;
    const R = this.reach;
    R.fill(-1);
    for (let t = 0; t < N_TRAFFIC; t++) {
      let q = [];
      for (let i = 0; i < n.count; i++) {
        if (n.state[i] !== 1) continue;
        if (!NODES[n.type[i]].serves.includes(t)) continue;
        if (IS_CACHE[n.type[i]]) continue;                      // caches complete probabilistically, not as terminals
        if (REQUIRES_APP[n.type[i]]) { R[(t * CAP.MAX_NODES + i) * 2 + 1] = 0; q.push(i * 2 + 1); }
        else { R[(t * CAP.MAX_NODES + i) * 2 + 0] = 0; R[(t * CAP.MAX_NODES + i) * 2 + 1] = 0; q.push(i * 2 + 0, i * 2 + 1); }
      }
      for (let head = 0; head < q.length; head++) {
        const st = q[head];
        const v = st >> 1, av = st & 1;
        const d = R[(t * CAP.MAX_NODES + v) * 2 + av];
        for (let k = 0; k < n.inCount[v]; k++) {
          const u = n.ins[v * CAP.MAX_OUT + k];
          if (u < 0 || n.state[u] !== 1) continue;
          const preds = IS_COMPUTE[n.type[u]] ? (av === 1 ? [0, 1] : []) : [av];
          for (const au of preds) {
            const idx = (t * CAP.MAX_NODES + u) * 2 + au;
            if (R[idx] === -1 || R[idx] > d + 1) { R[idx] = d + 1; q.push(u * 2 + au); }
          }
        }
      }
    }
    // caches: their reach is "can I push a miss somewhere?" (used by the service loop)
    for (let i = 0; i < n.count; i++) if (IS_CACHE[n.type[i]] && n.state[i] === 1) this.rebuildCache(i);
  }

  rebuildCache(i) {
    const n = this.nodes;
    for (let t = 0; t < N_TRAFFIC; t++) {
      if (t !== T.READ) continue;
      for (let app = 0; app < 2; app++) {
        let best = -1;
        for (let k = 0; k < n.outCount[i]; k++) {
          const v = n.outs[i * CAP.MAX_OUT + k];
          if (v < 0 || n.state[v] !== 1) continue;
          const d = this.reach[(t * CAP.MAX_NODES + v) * 2 + app];
          if (d >= 0 && (best < 0 || d < best)) best = d;
        }
        this.reach[(t * CAP.MAX_NODES + i) * 2 + app] = best;
      }
    }
  }

  /** Choose the next hop: minimum distance to a terminal, round-robin among ties. */
  pickOut(i, t, appFlag) {
    const n = this.nodes;
    const a = appFlag | IS_COMPUTE[n.type[i]];
    // A cache wired in front of a terminal is *the* path for that type: prefer it over a direct bypass.
    let cacheBest = -1;
    for (let k = 0; k < n.outCount[i]; k++) {
      const v = n.outs[i * CAP.MAX_OUT + k];
      if (v < 0 || n.state[v] !== 1 || !IS_CACHE[n.type[v]]) continue;
      if (NODES[n.type[v]].serves.includes(t) === false && t !== T.READ) continue;
      const d = this.reach[(t * CAP.MAX_NODES + v) * 2 + a];
      if (d >= 0 && (cacheBest < 0 || d < cacheBest)) cacheBest = d;
    }
    let best = -1, ties = 0;
    for (let k = 0; k < n.outCount[i]; k++) {
      const v = n.outs[i * CAP.MAX_OUT + k];
      if (v < 0 || n.state[v] !== 1) continue;
      if (cacheBest >= 0 && !IS_CACHE[n.type[v]]) continue;
      const d = this.reach[(t * CAP.MAX_NODES + v) * 2 + a];
      if (d < 0) continue;
      if (best < 0 || d < best) { best = d; ties = 1; }
      else if (d === best) ties++;
    }
    if (best < 0) return -1;
    if (ties === 1) {
      for (let k = 0; k < n.outCount[i]; k++) {
        const v = n.outs[i * CAP.MAX_OUT + k];
        if (v < 0 || n.state[v] !== 1) continue;
        if (this.reach[(t * CAP.MAX_NODES + v) * 2 + a] === best) return v;
      }
      return -1;
    }
    const cursor = this.rr[i] % ties;
    this.rr[i] = (this.rr[i] + 1) & 0x3fffffff;
    let seen = 0;
    for (let k = 0; k < n.outCount[i]; k++) {
      const v = n.outs[i * CAP.MAX_OUT + k];
      if (v < 0 || n.state[v] !== 1) continue;
      if (this.reach[(t * CAP.MAX_NODES + v) * 2 + a] !== best) continue;
      if (seen === cursor) return v;
      seen++;
    }
    return -1;
  }

  // ---------------------------------------------------------------- hot loop
  step() {
    if (this.state !== 'running') return;
    const n = this.nodes, P = this.packets;
    this.incidentsStep();
    this.ratesStep();
    this.spawnStep();
    this.serveStep();
    this.moveStep();
    this.economyStep();
    this.objectiveStep();
    this.tick++;
  }

  incidentsStep() {
    const t = this.tick;
    while (this.incidentI < this.incidents.length && this.incidents[this.incidentI].at * SIM.TICK_RATE <= t) {
      const inc = this.incidents[this.incidentI++];
      if (inc.kind === 'BURST') {
        const ty = T[inc.type];
        this.burstMul[ty] = Math.max(this.burstMul[ty], inc.mult);
        this.burstUntil[ty] = Math.max(this.burstUntil[ty], t + inc.dur * SIM.TICK_RATE);
        this.say('INCIDENT: ' + inc.note + ' (' + inc.type + ' x' + inc.mult.toFixed(1) + ')');
      } else if (inc.kind === 'KILL') {
        const victim = this.firstNodeOfType(NODE[inc.nodeType]);
        if (victim >= 0) {
          n_set(this.nodes, victim, 2);
          this.downUntil[victim] = t + inc.dur * SIM.TICK_RATE;
          this.dropQueued(victim, DROP.NODE_DOWN);
          this.say('INCIDENT: ' + inc.note + ' — ' + NODES[this.nodes.type[victim]].short + ' is DOWN for ' + inc.dur + 's');
          this.rebuild();
        } else this.say('INCIDENT: ' + inc.note + ' — you had no ' + inc.nodeType + ' to lose.');
      } else if (inc.kind === 'FLUSH') {
        const i = this.firstNodeOfType(NODE[inc.nodeType]);
        if (i >= 0) { this.flushUntil[i] = t + inc.dur * SIM.TICK_RATE; this.say('INCIDENT: ' + inc.note); }
      } else if (inc.kind === 'SPIKE') {
        this.spikeUntil = t + inc.dur * SIM.TICK_RATE;
        this.say('INCIDENT: ' + inc.note);
      } else if (inc.kind === 'NOTE') {
        this.say('NOTE: ' + inc.note);
      }
    }
    // expiries
    for (let t2 = 0; t2 < N_TRAFFIC; t2++) {
      if (this.burstUntil[t2] <= t && this.burstMul[t2] !== 1) this.burstMul[t2] = 1;
    }
    for (let i = 0; i < n_count(this.nodes); i++) {
      if (this.downUntil[i] && this.downUntil[i] <= t) {
        this.downUntil[i] = 0; this.nodes.state[i] = 1;
        this.say(NODES[this.nodes.type[i]].short + ' is back online. Original note: traffic may have re-routed around it.');
        this.rebuild();
      }
    }
  }

  firstNodeOfType(type) {
    for (let i = 0; i < this.nodes.count; i++) if (this.nodes.state[i] === 1 && this.nodes.type[i] === type) return i;
    return -1;
  }

  ratesStep() {
    const t = this.tick / SIM.TICK_RATE;
    let spike = this.spikeUntil > this.tick ? 2 : 1;
    for (let k = 0; k < this.level.traffic.length; k++) {
      const e = this.level.traffic[k];
      const ty = T[e.type];
      this.rateNow[ty] = Math.max(0, e.rps + (e.ramp || 0) * t) * this.burstMul[ty] * spike;
    }
  }

  canReach(i, t, app) {
    const n = this.nodes;
    const a = app | IS_COMPUTE[n.type[i]];
    for (let k = 0; k < n.outCount[i]; k++) {
      const v = n.outs[i * CAP.MAX_OUT + k];
      if (v < 0 || n.state[v] !== 1) continue;
      if (this.reach[(t * CAP.MAX_NODES + v) * 2 + a] >= 0) return true;
    }
    return false;
  }

  spawnStep() {
    const P = this.packets, n = this.nodes, net = this.net;
    for (let ty = 0; ty < N_TRAFFIC; ty++) {
      if (this.rateNow[ty] <= 0) continue;
      // No reachable path means nothing is sent yet: build first, then the traffic arrives.
      if (!this.canReach(net, ty, 0)) {
        if (!this.noRouteWarn[ty]) {
          this.noRouteWarn[ty] = 1;
          this.say('NOTHING ROUTES ' + TRAFFIC[ty].key + ' YET — connect a node that can serve it.');
        }
        continue;
      }
      this.noRouteWarn[ty] = 0;
      this.spawnAcc[ty] += this.rateNow[ty] / SIM.TICK_RATE;
      while (this.spawnAcc[ty] >= 1) {
        this.spawnAcc[ty] -= 1;
        const p = P.alloc();
        if (p < 0) { this.dropped++; this.dropByReason[DROP.QUEUE_FULL]++; continue; }
        P.state[p] = 1; P.type[p] = ty; P.node[p] = net; P.from[p] = -1; P.next[p] = -1;
        P.hop[p] = 0; P.age[p] = 0; P.wait[p] = 0; P.spawn[p] = this.tick; P.rev[p] = TRAFFIC[ty].revenue;
        P.flags[p] = 0;
        this.enqueue(net, p);
        this.spawned++;
      }
    }
  }

  enqueue(i, p) {
    const n = this.nodes, P = this.packets;
    if (n.state[i] === 0) { this.dropPacket(p, DROP.NO_ROUTE, i); return; }
    if (n.state[i] === 2) { this.dropPacket(p, DROP.NODE_DOWN, i); return; }
    const cap = n.queueCap[i];
    if (n.queueCount[i] >= cap) { this.dropPacket(p, IS_GATEWAY[n.type[i]] ? DROP.THROTTLED : DROP.QUEUE_FULL, i); return; }
    n.queue[i * CAP.MAX_QUEUE + n.queueTail[i]] = p;
    n.queueTail[i] = (n.queueTail[i] + 1) % cap;
    n.queueCount[i]++;
    if (n.queueCount[i] > n.peakQ[i]) n.peakQ[i] = n.queueCount[i];
    P.state[p] = 1; P.node[p] = i;      // P.wait keeps accumulating travel ticks; it is reset at spawn only
  }

  dropQueued(i, reason) {
    const n = this.nodes;
    for (let q = 0; q < n.queueCount[i]; q++) {
      const p = n.queue[i * CAP.MAX_QUEUE + ((n.queueHead[i] + q) % n.queueCap[i])];
      if (p >= 0) this.dropPacket(p, reason, i);
    }
    n.queueCount[i] = 0; n.queueHead[i] = 0; n.queueTail[i] = 0;
  }

  dropPacket(p, reason, nodeI) {
    const P = this.packets;
    this.dropped++;
    this.dropByReason[reason]++;
    this.dropByType[P.type[p]]++;
    if (nodeI >= 0) this.nodes.dropped[nodeI]++;
    if (nodeI >= 0) this.dropByNode[nodeI]++;
    const loss = reason === DROP.THROTTLED ? SIM.REP_LOSS_THROTTLE : SIM.REP_LOSS_DROP;
    this.rep = Math.max(0, this.rep - loss);
    P.release(p);
  }

  serveStep() {
    const n = this.nodes, P = this.packets;
    for (let i = 0; i < n.count; i++) {
      if (n.state[i] !== 1) { n.used[i] = 0; continue; }
      const def = NODES[n.type[i]];
      if (def.role === 'source') {
        let drain = n.queueCount[i];
        while (n.queueCount[i] > 0) {
          const p = n.queue[i * CAP.MAX_QUEUE + n.queueHead[i]];
          n.queueHead[i] = (n.queueHead[i] + 1) % n.queueCap[i];
          n.queueCount[i]--;
          if (p >= 0) this.route(p, i);
        }
        n.used[i] = drain;
        const capRps0 = nodeCapRps(n.type[i], n.tier[i], n.inst[i]);
        n.util[i] = n.util[i] * 0.88 + Math.min(1.2, (drain * SIM.TICK_RATE) / capRps0) * 0.12;
        continue;
      }
      if (def.role === 'monitor') { n.used[i] = 0; n.util[i] *= 0.9; continue; }
      const capRps = nodeCapRps(n.type[i], n.tier[i], n.inst[i]);
      n.used[i] = 0;
      n.tokens[i] += capRps / SIM.TICK_RATE;
      let budget = Math.floor(n.tokens[i]);
      if (budget <= 0) { n.util[i] = n.util[i] * 0.92; continue; }
      n.tokens[i] -= budget;
      let served = 0;
      while (served < budget && n.queueCount[i] > 0) {
        const p = n.queue[i * CAP.MAX_QUEUE + n.queueHead[i]];
        n.queueHead[i] = (n.queueHead[i] + 1) % n.queueCap[i];
        n.queueCount[i]--;
        if (p < 0) continue;
        served++; n.used[i]++;
        n.served[i]++;
        this.route(p, i);
      }
      const utilNow = n.served[i] && capRps ? Math.min(1.4, n.used[i] * SIM.TICK_RATE / capRps) : (n.queueCount[i] > 0 ? 1.2 : 0);
      n.util[i] = n.util[i] * 0.88 + utilNow * 0.12;
      this.autoscale(i, def);
    }
  }

  /** Service one packet at node i: complete it, or forward it. */
  route(p, i) {
    const n = this.nodes, P = this.packets;
    const t = P.type[p];
    const app = P.flags[p] & 1;
    const def = NODES[n.type[i]];

    // caches: probabilistic completion of READs
    if (IS_CACHE[n.type[i]] && t === T.READ && app === 1) {
      const flushed = this.flushUntil[i] > this.tick;
      const hitP = flushed ? 0 : n.hitRate[i];
      if (this.cacheRng.next() < hitP) { n.hit[i] = n.hit[i] * 0.99 + 0.01; return this.complete(p, i); }
      n.hit[i] = n.hit[i] * 0.99;
      const v = this.pickOut(i, t, app);
      if (v < 0) { this.dropPacket(p, DROP.NO_ROUTE, i); return; }
      return this.forward(p, i, v);
    }

    // terminals complete the types they serve (edge nodes do not need an app hop)
    if (def.serves.includes(t) && (!REQUIRES_APP[n.type[i]] || app === 1)) return this.complete(p, i);

    // transit / spreader: find the next hop
    const v = this.pickOut(i, t, app);
    if (v < 0) { this.dropPacket(p, DROP.NO_ROUTE, i); return; }
    return this.forward(p, i, v);
  }

  complete(p, i) {
    const P = this.packets, n = this.nodes;
    const ty = P.type[p];
    this.completed++;
    this.doneByType[ty]++;
    n.done[i]++;
    if (ty === T.MALICIOUS) {
      this.rep = Math.min(SIM.REP_MAX, this.rep + SIM.REP_GAIN_BLOCK);
    } else {
      const rev = P.rev[p];
      this.money += rev; this.income += rev;
      this.rep = Math.min(SIM.REP_MAX, this.rep + SIM.REP_GAIN_DONE);
    }
    const queuedTicks = Math.max(0, (this.tick - P.spawn[p]) - P.wait[p]);
    const lat = queuedTicks * (1000 / SIM.TICK_RATE) + SIM.BASE_LATENCY_MS + P.hop[p] * SIM.LATENCY_MS_PER_HOP;
    this.hist[this.histI] = lat; this.histI = (this.histI + 1) % this.hist.length;
    if (this.histN < this.hist.length) this.histN++;
    P.release(p);
  }

  forward(p, i, v) {
    const P = this.packets, n = this.nodes;
    const from = i, to = v;
    const ax = n.x[from] + n.w[from] / 2, ay = n.y[from] + n.h[from] / 2;
    const bx = n.x[to] + n.w[to] / 2, by = n.y[to] + n.h[to] / 2;
    const path = linkPath(ax, ay, bx, by);
    P.state[p] = 2; P.from[p] = from; P.next[p] = to; P.node[p] = -1;
    P.sx[p] = ax; P.sy[p] = ay; P.cx[p] = path.cx; P.cy[p] = path.cy; P.tx[p] = path.ex; P.ty[p] = path.ey;
    P.x[p] = ax; P.y[p] = ay;
    const seg1 = Math.abs(path.cx - ax) + Math.abs(path.cy - ay);
    const seg2 = Math.abs(path.ex - path.cx) + Math.abs(path.ey - path.cy);
    P.len[p] = seg1 + seg2;
    P.dist[p] = 0; P.hop[p]++;
    if (IS_COMPUTE[n.type[from]]) P.flags[p] |= 1;
  }

  moveStep() {
    const P = this.packets;
    const step = SIM.PACKET_SPEED / SIM.TICK_RATE;
    for (let p = 0; p < P.max; p++) {
      if (P.state[p] !== 2) continue;
      P.age[p]++; P.wait[p]++;          // age = total ticks since spawn; wait = ticks spent in flight
      if (P.age[p] > SIM.TIMEOUT_TICKS) { this.dropPacket(p, DROP.TIMEOUT, -1); continue; }
      P.dist[p] += step;
      const L = P.len[p];
      if (P.dist[p] >= L) { P.x[p] = P.tx[p]; P.y[p] = P.ty[p]; this.enqueue(P.next[p], p); continue; }
      const seg1 = Math.abs(P.cx[p] - P.sx[p]) + Math.abs(P.cy[p] - P.sy[p]);
      let x, y;
      if (P.dist[p] <= seg1 && seg1 > 1e-4) {
        const s1 = P.dist[p] / seg1;
        x = P.sx[p] + (P.cx[p] - P.sx[p]) * s1; y = P.sy[p] + (P.cy[p] - P.sy[p]) * s1;
      } else {
        const seg2 = Math.max(1e-4, L - seg1), s2 = (P.dist[p] - seg1) / seg2;
        x = P.cx[p] + (P.tx[p] - P.cx[p]) * s2; y = P.cy[p] + (P.ty[p] - P.cy[p]) * s2;
      }
      P.x[p] = x; P.y[p] = y;
    }
  }

  economyStep() {
    let up = 0;
    for (let i = 0; i < this.nodes.count; i++) {
      if (this.nodes.state[i] === 0) continue;
      up += nodeUpkeep(this.nodes.type[i], this.nodes.tier[i], this.nodes.inst[i]);
    }
    this.upkeep = up;
    this.money -= up / SIM.TICK_RATE;
    this.upkeepPaid += up / SIM.TICK_RATE;
  }

  autoscale(i, def) {
    const n = this.nodes;
    if (!def.autoMax || !n.auto[i]) return false;
    const capRps = nodeCapRps(n.type[i], n.tier[i], n.inst[i]);
    const util = capRps ? (n.used[i] * SIM.TICK_RATE) / capRps : 0;
    const fleet = n.inst[i] + n.pending[i];
    const cost = Math.round(def.cost * AUTOSCALE.extraCost * (1 + (n.tier[i] * 0.6)));
    // boots land in order, one cold start apart; a request never delays an instance already booting
    if (n.pending[i] > 0 && this.tick >= n.pendingUntil[i]) {
      n.pending[i]--; n.inst[i] = Math.min(255, n.inst[i] + 1); n.scaleCount[i]++;
      this.say(def.short + ' fleet scaled out to ' + n.inst[i] + ' instance(s).');
      n.pendingUntil[i] = n.pending[i] > 0 ? this.tick + AUTOSCALE.coldStart : 0;
    }
    if (util > AUTOSCALE.utilHigh && fleet < def.autoMax && this.tick >= n.scaleCd[i] && this.money >= cost) {
      n.pending[i]++;
      if (n.pending[i] === 1) n.pendingUntil[i] = this.tick + AUTOSCALE.coldStart;
      n.scaleCd[i] = this.tick + AUTOSCALE.cooldown;
      this.money -= cost; this.spent += cost;
      this.say(def.short + ' at ' + Math.round(util * 100) + '%: booting instance ' + (fleet + 1) + ' (cold start ' + (AUTOSCALE.coldStart / SIM.TICK_RATE) + 's, $' + cost + ')');
    }
    if (util < AUTOSCALE.utilLow) n.lowTicks[i]++; else n.lowTicks[i] = 0;
    if (n.lowTicks[i] > AUTOSCALE.lowTicks && n.inst[i] > 1) {
      n.inst[i]--; n.lowTicks[i] = 0;
      this.say(def.short + ' fleet scaled back in to ' + n.inst[i] + ' instance(s).');
    }
    return true;
  }

  objectiveStep() {
    const o = this.level.objectives;
    if (this.rep <= 0) return this.finish('lost', 'REPUTATION ZERO');
    if (this.money < 0) return this.finish('lost', 'BANKRUPT');
    if (!o.endless && this.dropped > o.maxErrors) return this.finish('lost', 'ERROR BUDGET BLOWN');
    if (!o.endless && this.completed >= o.complete) return this.finish('won', 'OBJECTIVES MET');
    if (this.tick >= this.durationTicks) {
      if (o.endless) return this.finish('won', 'SHIFT SURVIVED');
      return this.finish('lost', 'TIME UP — SHIFT ENDED');
    }
  }

  finish(state, reason) {
    this.state = state; this.reason = reason;
    this.finalP99 = this.p99();
    this.finalP50 = this.p50();
    this.stateHash = this.hash();
  }

  // ---------------------------------------------------------------- reporting
  pct(q) {
    if (!this.histN) return 0;
    const arr = Array.prototype.slice.call(this.hist, 0, this.histN).sort((a, b) => a - b);
    return arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
  }
  p50() { return this.pct(0.5); }
  p99() { return this.pct(0.99); }
  goalPct() {
    const o = this.level.objectives;
    if (o.endless) return Math.min(1, this.completed / 20000);
    return Math.min(1, this.completed / o.complete);
  }
  errorsPct() { return this.completed + this.dropped ? (100 * this.dropped) / (this.completed + this.dropped) : 0; }
  stars() {
    if (this.state !== 'won') return 0;
    const s = this.level.stars || {};
    let n = 1;
    if (s.errors2 && this.dropped <= s.errors2) n = 2;
    if (n === 2 && s.sloMs && this.finalP99 && this.finalP99 <= s.sloMs) n = 3;
    return n;
  }
  hash() {
    let h = 0x811c9dc5;
    const mix = (v) => { h = Math.imul(h ^ (v | 0), 0x01000193) >>> 0; };
    mix(this.tick); mix(this.completed); mix(this.dropped); mix(this.rep * 100); mix(this.money * 100);
    for (let i = 0; i < this.nodes.count; i++) { mix(this.nodes.type[i]); mix(this.nodes.tier[i]); mix(this.nodes.done[i]); mix(this.nodes.inst[i]); }
    h = (h ^ this.packets.hash()) >>> 0;
    return h >>> 0;
  }
  /** Per-node snapshot for the UI / inspector / postmortem. */
  nodeInfo(i) {
    const n = this.nodes, def = NODES[n.type[i]];
    const cap = nodeCapRps(n.type[i], n.tier[i], n.inst[i]);
    return {
      i, key: def.key, name: def.name, short: def.short, tier: n.tier[i], state: n.state[i],
      x: n.x[i], y: n.y[i], w: n.w[i], h: n.h[i], inst: n.inst[i], auto: n.auto[i], pending: n.pending[i],
      capRps: cap, done: n.done[i], dropped: n.dropped[i], q: n.queueCount[i], qCap: n.queueCap[i],
      peakQ: n.peakQ[i], util: n.util[i], queue: n.queueCount[i],
      serves: def.serves.map((t) => TRAFFIC[t].key), hitRateAim: IS_CACHE[n.type[i]] ? n.hitRate[i] : 0,
      hitRate: n.hit[i], down: n.state[i] === 2, hint: def.hint, upgradeCost: upgradeCost(n.type[i], n.tier[i]),
      upkeep: nodeUpkeep(n.type[i], n.tier[i], n.inst[i]), cost: def.cost,
    };
  }
  links() {
    const out = [], n = this.nodes;
    for (let i = 0; i < n.count; i++) {
      if (n.state[i] === 0) continue;
      for (let k = 0; k < n.outCount[i]; k++) { const v = n.outs[i * CAP.MAX_OUT + k]; if (v >= 0) out.push([i, v]); }
    }
    return out;
  }
  say(msg) {
    this.logSeq++;
    this.log.push({ t: this.tick, msg });
    if (this.log.length > 200) this.log.shift();
  }
  /** Postmortem: what actually went wrong, ranked. */
  postmortem() {
    const n = this.nodes;
    const reasons = [];
    for (let r = 1; r < 6; r++) if (this.dropByReason[r] > 0) reasons.push({ reason: DROP_TEXT[r], n: this.dropByReason[r] });
    reasons.sort((a, b) => b.n - a.n);
    const worst = [];
    for (let i = 0; i < n.count; i++) if (this.dropByNode[i] > 0) worst.push({ short: NODES[n.type[i]].short, name: NODES[n.type[i]].name, drops: this.dropByNode[i], peakQ: n.peakQ[i], qCap: n.queueCap[i], tier: n.tier[i], i });
    worst.sort((a, b) => b.drops - a.drops);
    const advice = [];
    if (worst.length) {
      const w = worst[0];
      advice.push('The worst offender was ' + w.name + ', which dropped ' + w.drops + ' requests at a peak queue of ' + w.peakQ + '/' + w.qCap + '.');
      if (w.peakQ >= w.qCap * 0.95) advice.push('That queue filled up: add capacity in front of it (a cache, a replica, a deeper queue) or upgrade it to ' + (w.tier < 2 ? TIERS[w.tier + 1].name : 'a bigger box') + '.');
    }
    if (this.dropByReason[DROP.NO_ROUTE]) advice.push(this.dropByReason[DROP.NO_ROUTE] + ' requests had nowhere to go: a type of traffic in this level has no reachable node that can serve it. Check the flow lines (press L).');
    if (this.dropByReason[DROP.TIMEOUT]) advice.push(this.dropByReason[DROP.TIMEOUT] + ' requests timed out in a queue: the queue is deeper than the service rate can drain.');
    if (this.dropByReason[DROP.NODE_DOWN]) advice.push(this.dropByReason[DROP.NODE_DOWN] + ' requests were lost to a node that was down: redundancy is not optional.');
    if (this.dropByReason[DROP.THROTTLED]) advice.push(this.dropByReason[DROP.THROTTLED] + ' requests were shed by your gateway — cheap drops, but still drops.');
    if (worst.length === 0 && this.state === 'lost') advice.push('No node overflowed: you simply ran out of time or money. Place nodes earlier and let them earn.');
    return { reasons, worst: worst.slice(0, 4), advice };
  }
}

// small helpers kept out of the class to avoid megamorphic call sites
function n_set(t, i, v) { t.state[i] = v; }
function n_count(t) { return t.count; }
