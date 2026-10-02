// src/core/arena.js — flat Struct-of-Arrays entity storage.
//
// No objects per entity, no allocation in the hot loop. Backed by SharedArrayBuffer when the page
// is cross-origin isolated (COOP/COEP), otherwise a plain ArrayBuffer. Both paths run identical code.

export function makeBuffer(bytes) {
  const sab = typeof SharedArrayBuffer !== 'undefined' && typeof globalThis.crossOriginIsolated !== 'undefined'
    ? globalThis.crossOriginIsolated : false;
  try { return sab ? new SharedArrayBuffer(bytes) : new ArrayBuffer(bytes); }
  catch { return new ArrayBuffer(bytes); }
}

export const CAP = {
  MAX_PACKETS: 65536,
  MAX_NODES: 128,
  MAX_LINKS: 512,
  MAX_OUT: 8,          // max outgoing links per node
  MAX_QUEUE: 1024,     // ring-buffer capacity per node
};

/**
 * Packet pool: struct-of-arrays over one ArrayBuffer. Views are offset slices so all packet
 * arrays share a single allocation (one cache-friendly block instead of a dozen).
 */
export class PacketPool {
  constructor(max = CAP.MAX_PACKETS) {
    this.max = max;
    // Explicit, validated struct-of-arrays layout. Every view is its own region of one buffer;
    // the constructor asserts the regions tile the buffer without overlapping.
    const fields = [
      ['state', Uint8Array, 1], ['type', Uint8Array, 1], ['hop', Uint8Array, 1], ['flags', Uint8Array, 1],
      ['age', Uint16Array, 2], ['wait', Uint16Array, 2],
      ['node', Int32Array, 4], ['next', Int32Array, 4], ['from', Int32Array, 4], ['spawn', Int32Array, 4],
      ['x', Float32Array, 4], ['y', Float32Array, 4], ['sx', Float32Array, 4], ['sy', Float32Array, 4],
      ['len', Float32Array, 4], ['tx', Float32Array, 4], ['ty', Float32Array, 4], ['cx', Float32Array, 4],
      ['cy', Float32Array, 4], ['rev', Float32Array, 4], ['dist', Float32Array, 4],
    ];
    const bytes = fields.reduce((n, [, , sz]) => n + sz * max, 0);
    this.bytesUsed = bytes;
    this.buffer = makeBuffer(bytes);
    let o = 0;
    for (const [name, Type, sz] of fields) {
      if (o % sz !== 0) throw new Error(`arena: ${name} misaligned at ${o}`);
      this[name] = new Type(this.buffer, o, max);
      o += sz * max;
    }
    if (o !== bytes) throw new Error('arena: layout mismatch');
    // sanity: no two fields may share a byte range (guards against a missing offset advance)
    const seen = new Set();
    for (const [name, Type] of fields) {
      const off = this[name].byteOffset, end = off + this[name].byteLength;
      for (let b = off; b < end; b += Math.max(1, this[name].BYTES_PER_ELEMENT)) {
        if (seen.has(b)) throw new Error(`arena: field overlap at byte ${b} (${name})`);
        seen.add(b);
      }
    }
    this.free = new Int32Array(max * 2).fill(-1);
    this.freeTop = -1;
    this.live = 0;
    this.peak = 0;
    this.reset();
  }
  reset() {
    this.state.fill(0);
    this.live = 0; this.peak = 0;
    this.freeTop = -1;
    for (let i = this.max - 1; i >= 0; i--) { this.free[i * 2] = i; this.free[i * 2 + 1] = this.freeTop; this.freeTop = i; }
  }
  alloc() {
    if (this.freeTop < 0) return -1;
    const i = this.freeTop; this.freeTop = this.free[i * 2 + 1];
    this.free[i * 2 + 1] = -1;
    this.state[i] = 1;
    this.live++; if (this.live > this.peak) this.peak = this.live;
    return i;
  }
  release(i) {
    if (this.state[i] === 0) return;          // double-release would corrupt the free list
    this.state[i] = 0;
    this.free[i * 2] = i; this.free[i * 2 + 1] = this.freeTop; this.freeTop = i;
    this.live--;
  }
  /** State fingerprint for determinism checks / replay verification. */
  hash() {
    let h = 0x811c9dc5;
    for (let i = 0; i < this.max; i++) {
      if (this.state[i] === 0) continue;
      h = Math.imul(h ^ (this.state[i] * 131 + this.type[i] * 7 + this.node[i] * 17 + this.flags[i] * 29), 0x01000193) >>> 0;
      h = Math.imul(h ^ (this.next[i] * 3 + this.from[i]), 0x01000193) >>> 0;
      h = Math.imul(h ^ (this.hop[i] * 5 + this.age[i]), 0x01000193) >>> 0;
      h = Math.imul(h ^ this.spawn[i], 0x01000193) >>> 0;
      h = (h + (this.x[i] * 16) | 0) >>> 0;
      h = (h + (this.y[i] * 16) | 0) >>> 0;
    }
    return h >>> 0;
  }
}

/** Node table (max 128): names, geometry, capacity, queue ring buffers, counters. */
export class NodeTable {
  constructor(max = CAP.MAX_NODES) {
    this.max = max;
    this.type = new Uint8Array(max);         // index into NodeTypes
    this.state = new Uint8Array(max);        // 0 empty, 1 active, 2 down (incident), 3 upgrading
    this.x = new Int16Array(max); this.y = new Int16Array(max); this.w = new Int16Array(max); this.h = new Int16Array(max);
    this.tier = new Uint8Array(max);
    this.outCount = new Uint8Array(max);
    this.outs = new Int16Array(max * CAP.MAX_OUT).fill(-1);
    this.ins = new Int16Array(max * CAP.MAX_OUT).fill(-1);
    this.inCount = new Uint8Array(max);
    this.reach = new Int16Array(max * 8).fill(-1);   // per traffic type: hops to a terminal, -1 = unreachable
    this.tokens = new Float32Array(max);             // service tokens accumulated this tick
    this.queueHead = new Int32Array(max);
    this.queueTail = new Int32Array(max);
    this.queueCount = new Int32Array(max);
    this.queueCap = new Int32Array(max);
    this.queue = new Int32Array(max * CAP.MAX_QUEUE).fill(-1);
    this.served = new Int32Array(max);
    this.done = new Int32Array(max);
    this.dropped = new Int32Array(max);
    this.peakQ = new Int32Array(max);
    this.used = new Float32Array(max);               // load this tick (requests)
    this.util = new Float32Array(max);               // EMA utilisation 0..1
    // autoscaling state (COMPUTE/GPU)
    this.auto = new Uint8Array(max);
    this.inst = new Uint8Array(max);
    this.pending = new Uint8Array(max);
    this.warm = new Int32Array(max);
    this.pendingUntil = new Int32Array(max);
    this.scaleCd = new Int32Array(max);
    this.lowTicks = new Int32Array(max);
    this.scaleCount = new Int32Array(max);
    this.spend = new Float32Array(max);              // upkeep accrued
    this.hit = new Float32Array(max);                // cache hit ratio observed (EMA, for stats)
    this.hitRate = new Float32Array(max);            // cache hit ratio configured (per tier)
    this.name = new Array(max).fill('');
    this.count = 0;
  }
  reset() {
    this.type.fill(0); this.state.fill(0); this.outCount.fill(0); this.outs.fill(-1); this.ins.fill(-1);
    this.inCount.fill(0); this.reach.fill(-1); this.tokens.fill(0);
    this.queueHead.fill(0); this.queueTail.fill(0); this.queueCount.fill(0); this.queueCap.fill(0);
    this.served.fill(0); this.done.fill(0); this.dropped.fill(0); this.peakQ.fill(0);
    this.used.fill(0); this.util.fill(0); this.auto.fill(0); this.inst.fill(0); this.pending.fill(0);
    this.warm.fill(0); this.pendingUntil.fill(0); this.scaleCd.fill(0); this.lowTicks.fill(0);
    this.scaleCount.fill(0); this.spend.fill(0); this.hit.fill(0); this.hitRate.fill(0);
    this.count = 0;
  }
}
