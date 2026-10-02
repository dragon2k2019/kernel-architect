# KERNEL ARCHITECT

A terminal-styled, deterministic infrastructure simulator. You get an empty board, one INTERNET node, and
a clock. Build the topology that turns incoming traffic into completed requests before the error budget,
the reputation, or the money runs out.

Everything you see is drawn as terminal cells (160×50 glyphs at 8×16 px) into a WebGL2 canvas — one
instanced draw call for the screen, one for the packet sprites. No frameworks, no build step, no fonts,
no network calls, no assets: `index.html` plus ES modules.

```
npm run serve      # python3 -m http.server 8000  →  http://localhost:8000/
npm test           # 18-check headless suite (units + simulation + the real game loop)
npm run verify     # every level: reference playthrough, do-nothing run, determinism, drop analysis
npm run verify L05 # one level with a full trace, drop reasons and advice
npm run verify -- --perf 12000   # stress the simulation
```

Node 18+ is only needed for the headless tools; the game itself runs in any browser with WebGL2.

## The loop

1. **Place** boxes on the board (they cost money and draw upkeep).
2. **Wire** them one-way, INTERNET outward. Traffic walks the graph.
3. Every request must reach a node that can **complete** its type. If it cannot, it is dropped and costs
   reputation. Most nodes only accept traffic that has already passed through an APP SERVER.
4. Nodes serve at a fixed requests/sec. What arrives faster **queues**. A queue that fills up drops
   whatever hits it next; a request that spends more than 7 s in queues dies with a 504.
5. Money comes only from completed requests, minus upkeep. Win the objective before the clock and before
   the error budget runs out.

The two bars in a node box are the whole game: the **load bar** is utilisation, the number under it is
**queue depth**. A blinking red border means a queue is about to spill. Watch queues, not load.

| Traffic | Served by | Note |
| --- | --- | --- |
| STATIC | CDN, OBJECT STORAGE | images/CSS/JS — keep it off the app tier |
| READ | CACHE (hit), SQL, NOSQL, READ REPLICA | cache hits complete instantly, misses continue |
| WRITE | SQL, NOSQL | never cached, always real work |
| UPLOAD | OBJECT STORAGE | big payloads |
| SEARCH | SEARCH INDEX | a relational database refuses these |
| AI | GPU INFERENCE | slow, expensive, autoscale it |
| ATTACK | FIREWALL | blocking it *earns* reputation |

| Node | Cost | Cap/s | Queue | Upkeep | Completes |
| --- | --- | --- | --- | --- | --- |
| FIREWALL | $120 | 600 | 240 | $1.2 | ATTACK |
| CDN | $90 | 900 | 200 | $0.9 | STATIC |
| API GATEWAY | $140 | 800 | 200 | $1.4 | sheds load at ⅓ the reputation cost |
| LOAD BALANCER | $80 | 1500 | 120 | $0.8 | spreads traffic evenly |
| APP SERVER | $130 | 150 | 240 | $1.3 | application work, sets the app flag, autoscales |
| MEMORY CACHE | $100 | 900 | 160 | $1.0 | a share of READs (45/62/78% by tier) |
| MESSAGE QUEUE | $70 | 300 | **900** | $0.7 | a deep buffer that absorbs bursts |
| RELATIONAL DB | $220 | 120 | 240 | $2.2 | READ, WRITE |
| NOSQL DB | $160 | 260 | 300 | $1.6 | READ, WRITE (no search) |
| READ REPLICA | $150 | 260 | 240 | $1.5 | READ |
| SEARCH INDEX | $180 | 200 | 160 | $1.8 | SEARCH |
| OBJECT STORAGE | $60 | 400 | 200 | $0.6 | STATIC, UPLOAD |
| GPU INFERENCE | $420 | 90 | 120 | $4.2 | AI, autoscales |
| MONITORING | $90 | — | 16 | $0.9 | unlocks the telemetry panel |

Tiers multiply a node's capacity (×2.2 / ×4.4) and its queue depth (×1.5 / ×2.0) for ×1.6 / ×2.4 the
price. Autoscaling (`A`) boots an extra instance whenever utilisation is over 75 %, costs 30 % of the node
price, takes a 3 s cold start, and scales back in after 7 quiet seconds.

## Controls

| Key | Action |
| --- | --- |
| `1`…`9`, `0`, `TAB` | pick a build item (or click the BUILD panel) |
| `←` `↑` `↓` `→` | move the build cursor / walk the selection between nodes |
| `ENTER` | place, connect, or select the nearest node |
| `W` | wire mode: source, then target (`ENTER` or a click) |
| `U` / `X` | upgrade the selected node / sell it |
| `A` | toggle autoscaling on the selected node |
| `SPACE` | pause · `=` / `-` speed 1× → 8× |
| `L` | flow overlay (does this link still reach a server? `[` `]` cycle the type) |
| `C` / `M` | CRT filter / mute · `H` help (3 pages) |
| `R` / `Q` | restart the shift / abandon it |
| right-click | cancel the current mode |

## Determinism

The simulation only ever advances through `Sim.step()` — one fixed 60 Hz tick, no `Math.random`, no
wall-clock inside the model. Time-of-day, frame rate and pause cannot change the outcome, and the same
seed plus the same actions always produce the same **state hash** (shown live in the status bar and on
the postmortem screen). Every player action is recorded in `sim.actions`, so a run can be replayed
exactly. Campaign shifts use a fixed seed per level, so a comparison between two players is meaningful;
ENDLESS and DAILY are seeded too, DAILY by the UTC date.

## Layout

```
index.html          canvas + boot/panic overlay
styles.css          minimal page chrome (the UI lives in the canvas)
src/core/rng.js     mulberry32 streams, hash32, seed helpers
src/core/arena.js   PacketPool (struct-of-arrays + validated layout), NodeTable, CAP limits
src/sim/content.js  SIM constants, traffic types, node types, tiers, all 10 levels, ENDLESS, DAILY
src/sim/sim.js      the model: flow-field routing, queues, incidents, economy, autoscaling, reporting
src/render/atlas.js  procedural glyph atlas (ASCII + box drawing + blocks), no font files
src/render/term.js   160×50 cell grid, palette, panels, bars, formatting
src/render/hud.js    the whole game as terminal cells: board, nodes, links, panels, overlays
src/render/renderer.js  WebGL2 instanced glyph/sprite batching + optional CRT post pass
src/game/input.js   keyboard/mouse → intent · src/game/audio.js  synthesized blips
src/game/main.js    screens, progress, the fixed-step game loop
tools/verify.mjs    level winnability + determinism + perf harness (the reference solutions live here)
tests/run.mjs       headless suite · tests/stub.mjs  fake DOM/WebGL so the real loop runs in Node
research/           market analysis and the design blueprint this game came from
```

### Levels

| | Shift | Teaches |
| --- | --- | --- |
| L01 | HELLO, WORLD | app server + database, wire the INTERNET |
| L02 | STATIC ASSETS | object storage for static traffic |
| L03 | THE CACHE | cache hits vs misses |
| L04 | BLACK FRIDAY | message queue vs traffic spikes |
| L05 | SCALE OUT | load balancer, second app server, autoscaling |
| L06 | SEARCH WORKLOAD | a search index is the only thing that serves SEARCH |
| L07 | READ SCALE | read replicas, cache flush stampede |
| L08 | WRITE PATH | NOSQL + queue for writes, redundancy |
| L09 | BAD ACTOR | firewall at the edge, gateway to shed politely |
| L10 | INFERENCE | GPUs for AI, autoscale the expensive box |
| — | ENDLESS SHIFT | ramps forever; score is requests served |
| — | DAILY SHIFT | one date seed, same traffic and incidents for everyone |

## What is verified

`npm run verify` fails the build if a level cannot be won by its reference build, if a level can be won
by doing nothing, if two runs of the same seed diverge, or if a level's drops are not explicable. It also
prints drop reasons, worst nodes and advice per level, and `--perf` reports simulation cost against the
16.7 ms frame budget (≈0.2 ms/tick with 11 000 packets in flight).

`npm test` runs 18 checks: RNG streams and content tables, packet-pool layout (field aliasing would be
caught here), directed connect/disconnect bookkeeping, economy, routing coverage for all seven traffic
types, drop accounting, autoscaling, daily/endless determinism, terminal cell safety, every HUD screen,
and a full keyboard-and-mouse playthrough of L01 through the real game loop under a fake DOM/WebGL.

## Research

`research/docs/MARKET_ANALYSIS.md` is the demand analysis that picked this game (high demand ×
under-delivered, in the "learn by building" niche), and `research/docs/BLUEPRINT.md` is the design
blueprint it implements.

MIT licensed. Built without dependencies.
