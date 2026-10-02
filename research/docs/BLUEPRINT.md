# Original Blueprint (as provided)

> Source document supplied by the project owner. Stored verbatim for traceability.
> The market analysis that picks one of these four concepts lives in [`MARKET_ANALYSIS.md`](./MARKET_ANALYSIS.md).

---

Here is the complete technical architecture and game design blueprint tailored to your specifications: **Pixel/ASCII art, GPU-accelerated rendering, fixed-delta time, cache-friendly ECS, deterministic seeded math, branch-free squared-distance checks, and multi-threaded Web Workers with `SharedArrayBuffer`**.

---

## 1. Engine Core Architecture Specification

### A. High-Performance Tech Stack
```
┌────────────────────────────────────────────────────────────────────────┐
│                          MAIN THREAD (UI & GPU)                        │
│  - User Input & Canvas Events                                          │
│  - WebGL2 / WebGPU: Single-Draw-Call Instanced Glyph/Tile Batching     │
│  - Audio synthesis / WebAudio triggers                                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ SharedArrayBuffer / Atomics
┌───────────────────────────────────▼────────────────────────────────────┐
│                    WORKER 1: SIMULATION & ECS (DOD)                    │
│  - Fixed Timestep Loop (accumulated dt)                                │
│  - Flat TypedArray ECS (Positions, Velocities, States, Flags)          │
│  - Spatial Hash Grid (O(1) lookups, squared distance checks)           │
│  - Deterministic Seeded PRNG (Mulberry32 / Xorshift128+)               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Shared Memory / Transferable
┌───────────────────────────────────▼────────────────────────────────────┐
│                  WORKER 2: BACKGROUND COMPUTATION                      │
│  - A* / Flow-field Pathfinding on graphs & network packets             │
│  - Procedural Ticket / Code / Bug Graph Generation                     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Low-Level Performance Rules

### 1. Rendering: GPU-Offloaded ASCII & Pixel Atlas
* **No DOM / Canvas 2D Text:** Rendering thousands of characters using `ctx.fillText()` kills CPU.
* **Instanced Tile/Glyph Shader:**
  - Pack an ASCII/Pixel font into a single **$16 \times 16$ tile texture atlas** (256 glyphs/sprites).
  - Use a single instanced quad draw call (`gl.drawArraysInstanced`) with an instanced vertex buffer containing:
    `[posX, posY, glyphIndex, fgColorR, fgColorG, fgColorB, bgColorR, bgColorG, bgColorB]`.
  - Capable of rendering **100,000+ ASCII characters or pixel tiles at 144+ FPS** with near-0% CPU load.

### 2. Time & Delta: Fixed Timestep with Accumulator
Prevents physics tunneling and guarantees 100% deterministic replays (vital for bug reproduction in the QA game):
```typescript
const TICK_RATE = 60;
const FIXED_DT = 1.0 / TICK_RATE; // 0.016667s
let accumulator = 0.0;
let lastTime = performance.now();

function engineLoop(currentTime: number) {
  const frameTime = Math.min((currentTime - lastTime) / 1000.0, 0.25); // Clamp spiral of death
  lastTime = currentTime;
  accumulator += frameTime;

  while (accumulator >= FIXED_DT) {
    ecsSimulationStep(FIXED_DT); // Deterministic state step
    accumulator -= FIXED_DT;
  }
  
  syncToRenderBuffer(accumulator / FIXED_DT); // Interpolated render
  requestAnimationFrame(engineLoop);
}
```

### 3. Math: Seeded PRNG & Branchless Squared Distance
* **Zero `Math.random()`:** Every game run is governed by an integer seed (e.g. `seed = 0xDEADBEEF`), making all bugs, client scopes, and merge conflicts 100% reproducible and shareable via seed strings.
* **No `Math.sqrt`:**
```typescript
// Fast 32-bit Mulberry32 PRNG (zero allocations)
function mulberry32(state: { seed: number }): number {
  let t = (state.seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Distance Check: dx*dx + dy*dy <= radius*radius
function isWithinRadiusSq(x1: number, y1: number, x2: number, y2: number, radiusSq: number): boolean {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return (dx * dx + dy * dy) <= radiusSq;
}
```

### 4. ECS: Cache-Friendly Struct of Arrays (SoA)
No object allocations (`new Object()` or GC pauses). Everything resides in flat `SharedArrayBuffer` typed arrays:
```typescript
const MAX_ENTITIES = 65536;

const memory = new SharedArrayBuffer(
  MAX_ENTITIES * 4 * 8 // Multiple Float32/Int32 buffers
);

// Struct of Arrays for maximum CPU L1/L2 cache hits
const EntityPool = {
  posX: new Float32Array(memory, 0, MAX_ENTITIES),
  posY: new Float32Array(memory, MAX_ENTITIES * 4, MAX_ENTITIES),
  velX: new Float32Array(memory, MAX_ENTITIES * 8, MAX_ENTITIES),
  velY: new Float32Array(memory, MAX_ENTITIES * 12, MAX_ENTITIES),
  type: new Uint8Array(memory, MAX_ENTITIES * 16, MAX_ENTITIES),
  state: new Uint8Array(memory, MAX_ENTITIES * 17, MAX_ENTITIES),
};
```

---

## 3. Game Designs Adapted to the Architecture

### Game 1: *Kernel Architect* (Solution Architect)
* **Aesthetic:** Green-phosphor ASCII CRT terminal (`@`, `#`, `*`, `~`, `░`, `█`).
* **Technical Hook:** Simulates **50,000 active network packets/second** passing through load balancers, database clusters, and cache nodes.
* **Low-Level Mechanics:**
  - **Packet Particle System:** Each packet is an ECS entity. A background worker computes topological route flows.
  - **Spatial Bottlenecks:** When a cluster reaches capacity, spatial collision checks using squared distance redirect packets to fallback nodes.
  - **Memory Eviction Puzzle:** Manage Redis cache memory arenas in fixed $O(1)$ ring-buffers. If ring-buffers overflow, packets drop, flashing red ASCII `[504 GATEWAY TIMEOUT]`.

---

### Game 2: *Lexer & Scope: Day Zero* (Business Analyst)
* **Aesthetic:** Monochrome Amber Terminal & Monospace Flowcharts.
* **Technical Hook:** Fast string tokenization and deterministic Directed Acyclic Graph (DAG) generation.
* **Low-Level Mechanics:**
  - **Client Requirement Stream:** Client rambling is parsed using an $O(N)$ branchless token scanner that scans keywords (`ASAP`, `Blockchain`, `Payment`, `Simple Button`).
  - **Contradiction Matrix:** Contradictions (e.g. `Must be 100% offline` vs `Real-time cloud sync`) are mapped into a bitmask. The player uses bitwise AND/OR logic gates to reconcile requirements.
  - **Ticket Dependency Grid:** Build the Sprint DAG. If a cycle is formed ($O(V + E)$ cycle detection), the pipeline locks up and Devs enter deadlock animation states.

---

### Game 3: *Heisenbug Hunter* (QA Engineer / Tester)
* **Aesthetic:** Glitchy 16-bit Cyberpunk Pixel Art with color-shifted scanlines.
* **Technical Hook:** Frame-exact race condition fuzzer with seed-based replay verification.
* **Low-Level Mechanics:**
  - **Deterministic Chaos Monkeys:** Hundreds of simulated automated bots spam the UI forms with seeded pseudorandom inputs.
  - **The Race-Condition Trigger:** A critical bug only appears when two asynchronous packet workers hit a shared memory cell in the exact same tick window without an atomic lock.
  - **Squared-Distance Fuzzing:** The tester drags exploratory probe tools across UI state components. The probe fuzzer triggers events on all elements where `distSq < probeRadiusSq`, exposing off-by-one errors and memory leaks.
  - **Bug Export Seed:** Every bug caught exports a 16-character hex seed code (e.g. `0xA38F_C019`). When loaded, the game plays the exact tick replay to prove the bug exists.

---

### Game 4: *AST Archeology: Merge Conflict* (Developer)
* **Aesthetic:** Dwarf Fortress / Rogue-like ASCII Dungeon.
* **Technical Hook:** Traversing actual Abstract Syntax Trees (AST) rendered as an ASCII dungeon floorplan.
* **Low-Level Mechanics:**
  - **The Legacy Code Dungeon:** Rooms represent functions (`void processOrder()`); corridors represent call stacks. Room complexity corresponds to real Cyclomatic Complexity metrics ($O(N)$ branching).
  - **Git Rebase Boss Fights:** Two dungeon branches collide. Conflicted blocks are highlighted in red ASCII `<<<<<<< HEAD` and green `>>>>>>> FEATURE`. You must move your cursor-blade to slice away dead branches without severing the return pointer.
  - **Cache Miss Demon:** If your data access patterns in the puzzle jump erratically across array strides instead of contiguous memory blocks, a "Cache Miss Monster" catches up and throttles your execution speed.

---

## 4. Performance Summary Comparison

| Metric | Traditional Canvas / DOM Approach | Our Optimized ECS + GPU Architecture |
|---|---|---|
| **Simulated Entities** | ~500 to 1,500 entities | **50,000 to 100,000+ entities** |
| **Draw Calls** | Hundreds per frame | **1 to 2 batched instanced calls** |
| **Distance Check** | `Math.sqrt()` ($O(N^2)$ pairwise) | **$O(1)$ Spatial Grid + Branchless Squared Distance** |
| **RNG & Replay** | Non-deterministic `Math.random()` | **Seedable Mulberry32 / PCG (100% deterministic)** |
| **Frame Consistency** | Variable delta, prone to physics skips | **Fixed timestep accumulator (smooth, testable)** |
| **Worker Threads** | Single-threaded UI lockup | **Multi-worker `SharedArrayBuffer` pipeline** |
