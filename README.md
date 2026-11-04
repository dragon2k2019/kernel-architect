# KERNEL ARCHITECT

**Keep the internet from melting.** Drag boxes onto a board, wire them together, and watch the traffic flow.
The whole game lives inside a fake code editor: tabs, a file explorer, a terminal, a status bar. Engineers will feel at home, everyone else just sees a fun puzzle.

## How to play

There is no manual. The first time you open a level, a **hands-on tutorial plays inside the real game**:

- Every step is **locked**. The screen is dimmed except for the one thing to use next (a spotlight), and everything else ignores clicks and keys.
- Steps only advance when the **simulation** says you did it (a Server exists, the wire exists, the game is running), not when you click "next".
- A small card names the box you are using (cost, speed, one-liner).
- Levels 1-4 teach the new box with a short drag / wire / run drill. Levels 5-7 get a one-card heads-up.
- Replay it any time from the **Tutorial** button. `skip` is always on the card.

## Rewards

- Coins fly from your servers into your wallet while you serve visitors, with sound.
- Checkpoint confetti at 25 / 50 / 75 % of a level.
- Effects are cheap on purpose, see *Performance* below.
- Winning plays a staged deploy pipeline, then a boom: magic swirl, confetti cannons, coin and cash fountains, stars revealed one by one, and a cash payout that counts up into your lifetime wallet.
- All sound is synthesised with WebAudio (no audio files). Toggle it in the title bar.

## Performance

The reward engine (`src/game/particles.ts`) is built so a full victory celebration does not hurt the frame rate:

- **Object pool**: one fixed typed array, swap-remove on death. No per-particle or per-frame allocation.
- **Sprite atlas**: coins, bills, confetti, stars and glows are pre-rendered once; each particle is a `drawImage` (GPU). No `shadowBlur`, `fillText`, `roundRect` or `save/restore` in the hot loop.
- **Dirty-rect clearing** and a canvas on its own compositor layer. The loop sleeps when nothing is alive.
- **Adaptive quality**: a frame-time governor scales particle counts and canvas resolution down on slow devices and back up when there is headroom.
- Audio has a voice cap, the board stops simulating / re-rendering once the result screen is up, and wallet pulses no longer re-render React.

Measured headless (4x CPU throttle, same scripted L1 win): 4.4 fps before, 54.6 fps after, zero frames over 100 ms.

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
