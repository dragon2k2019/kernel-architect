// src/core/rng.js — deterministic maths. No Math.random anywhere in the simulation.

/** mulberry32: fast, 32-bit, seedable. One instance per independent stream. */
export class Rng {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  /** next float in [0,1) */
  next() {
    let t = (this.s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** next int in [0,n) */
  int(n) { return (this.next() * n) | 0; }
  /** next int in [lo,hi] inclusive */
  range(lo, hi) { return lo + ((this.next() * (hi - lo + 1)) | 0); }
  reset(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
}

/** 32-bit string hash (FNV-1a style) — used for seeds from text and for state fingerprints. */
export function hash32(str, h = 0x811c9dc5) {
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Derive an independent, well-separated sub-stream seed from a master seed + stream id. */
export function streamSeed(seed, id) {
  let h = hash32('s' + (id | 0), (seed >>> 0) ^ 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function toHex8(n) { return (n >>> 0).toString(16).toUpperCase().padStart(8, '0'); }

/** Parse "0xDEADBEEF", "DEADBEEF", "dead-beef" or any text into a 32-bit seed. */
export function parseSeed(text, fallback = 0x9e3779b9) {
  if (text == null) return fallback;
  const s = String(text).trim();
  if (!s) return fallback;
  const hex = s.replace(/^0x/i, '').replace(/[^0-9a-f]/gi, '');
  if (/^[0-9a-f]+$/i.test(hex) && /^(0x|[0-9a-f]{8})/i.test(s.replace(/[^0-9a-fx]/gi, ''))) {
    const v = parseInt(hex.slice(-8), 16);
    if (!Number.isNaN(v) && hex.length >= 4) return v >>> 0;
  }
  return hash32(s) >>> 0;
}

/** Squared distance — the only distance test in the codebase. No Math.sqrt in hot paths. */
export function distSq(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}
/** True when two axis-aligned rects (x,y,w,h) overlap. Branch-light, allocation-free. */
export function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}
export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
