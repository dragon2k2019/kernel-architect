# KERNEL ARCHITECT

**Keep the internet from melting.** Drag boxes onto a board, wire them together, and watch the traffic flow.

```
🌐 Internet ─▶ ⚡ Cache ─▶ ⚖️ Load Balancer ─▶ 🖥️ Servers ─▶ 🗄️ Database
```

## How to play (three pictures)

1. 🖱️ **Drag a box** from the tray onto the board (or tap it, then tap the board).
2. 🔌 **Wire it up**: drag from a box's glowing dot to the next box. Click a wire to cut it.
3. ▶️ **Survive**: press GO. Visitors (📄 pages and 🗃️ data) flow through your wires.
   Serve enough of them before happiness hits zero.

The coach strip above the tray always says the one next thing to do. Faces on every box show how it is
coping: 😴 🙂 😅 🥵 💀.

## For the nerds

- Failures are real HTTP codes, and the coach explains each one in a line:
  `503` queue full · `504` timeout · `502` dead end / crashed box · `500` no database · `403` DB only talks to servers · `404` wrong box.
- Live `tail -f access.log`, p95 latency, uptime %, and a copyable deploy report (`📋`).
- Events: 📰 *Hacker News front page* traffic spikes, 💀 *OOM-killed* servers, disks that fill up.
- Shortcuts: `1-4` pick a box · `Space` go/pause · `Del` sell · `Esc` cancel · `L` log · speed 1×/2×/4×.
- 7 levels (the last one is endless "Production"), 3 stars each for uptime ≥ 99%.

## Dev

```
npm install
npm run dev            # vite dev server
npm run build          # single-file build into dist/index.html
npx tsx tools/verify.ts   # balance check: a reference build must win every level, an empty board must lose
```

The simulation (`src/game/sim.ts`) is a deterministic, seeded, UI-free engine, so the same board always plays the same.
UI is React + Tailwind; packets are drawn on a canvas.

`research/` holds the original market analysis.
