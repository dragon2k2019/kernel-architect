# KERNEL ARCHITECT

**Keep the internet from melting.** Drag boxes onto a board, wire them together, and watch the traffic flow.
The whole game lives inside a fake code editor: tabs, a file explorer, a terminal, a status bar. Engineers will feel at home, everyone else just sees a fun puzzle.

## How to play

1. **Drag a box** from the *Components* list onto the board (or tap it, then tap the board).
2. **Wire it up**: drag from a box's glowing dot to the next box. Click a wire to cut it.
3. **Press RUN**: visitors (pages and data) flow through your wires. Serve enough of them before happiness hits zero.

An interactive tutorial (README.md window) explains the goal, objectives, every component, scoring and error codes.
It opens on first launch and any time from the **How to play** button or the `?` key.

Hover any component in the sidebar, or any box on the board, for an info card (what it does, real-life analogy,
cost, speed, wiring rules, tips, and a nerd note).

## Rewards

- Coins fly from your servers into your wallet while you serve visitors, with sound.
- Checkpoint confetti at 25 / 50 / 75 % of a level.
- Winning plays a staged deploy pipeline, then a boom: magic swirl, confetti cannons, coin and cash fountains, stars revealed one by one, and a cash payout that counts up into your lifetime wallet.
- All sound is synthesised with WebAudio (no audio files). Toggle it in the title bar.

## No emoji

Every icon, face and glyph is a hand-built SVG (`src/ui/icons.tsx`), so the game looks identical on every device.

## For the nerds

- Failures are real HTTP codes, and the coach explains each one: `503` queue full, `504` timeout, `502` dead end / crashed box, `500` no database, `403` DB only talks to servers, `404` wrong box.
- Live `tail -f access.log`, p95 latency, uptime %, a Problems tab, and a shareable deploy report.
- Events: Hacker News traffic spikes, OOM-killed servers, full disks.
- Shortcuts: `1-4` pick a box, `Space` run/pause, `Del` sell, `Esc` cancel, `L` terminal panel, `?` help.
- 7 levels (the last one is endless "Production"), 3 stars each for uptime of 99% or better.

## Dev

```
npm install
npm run dev               # vite dev server
npm run build             # single-file build into dist/index.html
npx tsx tools/verify.ts   # balance check: a reference build must win every level, an empty board must lose
```

The simulation (`src/game/sim.ts`) is a deterministic, seeded, UI-free engine. UI is React + Tailwind;
packets are drawn on a canvas, rewards on a full-screen particle canvas (`src/game/particles.ts`).

`research/` holds the original market analysis.
