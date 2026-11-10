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

## Skill and pressure

The sim has a few systems that reward attention and punish autopilot:

- **Combo**: every served visitor builds a streak. Each 12 in a row raises a revenue multiplier (up to x2.25). One failure, or one bot slipping through, resets it. The tier-up sound *charges first, then pays off*.
- **VIP stars**: golden customers pay 6x and count as 3 combo points, but give up after 4 seconds and hurt happiness twice as much if lost.
- **Overheating**: a server or database that works too hard for too long overheats and runs at 45% speed. Spread the load, overclock it, or **click it to cool it**.
- **Crashes are interactive**: click a crashed box repeatedly to reboot it faster (each click shaves 1.1s off its 10s reboot).
- **Overclock** (select a Server/DB, `U`): +40% speed per level, runs cooler, up to level 3.
- **Bots and the Firewall** (unlocked in level 7): scraper bots (red diamonds) pay nothing, hog servers and break your combo. A Firewall blocks 90% of them instantly and pays $1 per block. DDoS events flood the board with them.
- Two later levels: *Bot Apocalypse* and *Black Friday*. Then the final boss, *Production* (see below).
- End-of-run payout adds a **combo bonus** (best streak, capped).

## Rewards

- Coins fly from your servers into your wallet while you serve visitors, with sound.
- Checkpoint confetti at 25 / 50 / 75 % of a level.
- Effects are cheap on purpose, see *Performance* below.
- Winning plays a deliberately slow, staged deploy pipeline: a long rising suspense bed, heartbeats between steps, a drumroll held breath, *then* the boom: magic swirl, confetti cannons, coin and cash fountains, stars that each charge up before they pop (the perfect third star gets an extra held breath), and a cash payout that counts up line by line (revenue, star bonus, combo bonus) into your lifetime wallet. `Space` skips it.
- All sound is synthesised with WebAudio (no audio files). Toggle it in the title bar.
- **Layered sfx** (`src/game/sfx.ts`): every sound is a stack of sub bass, body, transient, sparkle and tail layers, sent through a generated hall reverb and a ping-pong echo, with detuned unison chords, risers, impacts and drumrolls.
- **Adaptive music bed**: while a level runs, a tiny generative loop (Am-F-C-G) adds layers as your combo tier climbs (pad and bass, then hats, kick, arp, claps, lead bells), speeds up slightly, and gets a nervous drone when happiness is low or a spike hits.

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
- 9 levels (the last one is the endless "Production"), 3 stars each for uptime of 99% or better.
- Shortcuts also: `5` Firewall, `U` overclock the selected box.

## Final boss: Production

No finish line, but it is not a flat grind either. Every minute is a **phase**, and every phase is meaner than the last.

| Phase | Name | What changes |
| --- | --- | --- |
| 1 | Soft Launch | A gentle warm-up: one spike, one crash, one bot swarm |
| 2 | Product Hunt | Caches start going cold, **cache stampedes** begin (every cache goes cold for ~10 s) |
| 3 | Series A | Two boxes can crash at once |
| 4 | Hypergrowth | More data requests, so your databases sweat |
| 5 | Unicorn | Bots evolve: the firewall blocks fewer of them |
| 6 | Hostile Takeover | Servers overheat faster |
| 7 | Global Outage Season | Triple crashes |
| 8 | Kernel Panic | Everything, all the time |
| 9+ | Heat Death | Nobody has made it this far |

- **A finale every phase**: a traffic spike and a database crash land together in the last seconds.
- **Clear a phase** (survive its full minute) to get a cash bonus, a bit of happiness back, confetti and a coin shower.
- **Flawless phase** (zero failed visitors) pays **double** and gets its own fanfare.
- **Ranks**: Intern, Junior Dev, DevOps, Senior SRE, Staff Engineer, Principal, Distinguished, Fellow, and at 8 phases cleared, **Kernel Architect**. The result screen reveals your rank and tells you what took you down.
- Traffic grows to 70 requests per second, so one lucky build will not carry you. Expand as you earn, chain a second cache, overclock, and keep clicking crashed and hot boxes.

## Dev

```
npm install
npm run dev               # vite dev server
npm run build             # single-file build into dist/index.html
npx tsx tools/verify.ts   # balance check: a reference build must win every level, an empty board must lose
npx tsx tools/verify-production.ts   # Production check: a weak build falls early, a strong one gets deep
```

The simulation (`src/game/sim.ts`) is a deterministic, seeded, UI-free engine. UI is React + Tailwind;
packets are drawn on a canvas, rewards on a full-screen particle canvas (`src/game/particles.ts`).

`research/` holds the original market analysis.

## Built with MySpec

Kernel Architect was specced with **[MySpec](https://myspec.dev/?utm_source=kernelarchitect&utm_medium=readme&utm_campaign=builtwith)**, an AI Senior Architect that turns a messy idea into a spec your AI coding agents can build from. Its motto: *clarity precedes code.*

**How it works.** You describe the idea in a paragraph, a Slack thread or a voice note. MySpec runs a short structured interview (5 to 15 targeted questions, so there is no blank page), digs out the edge cases you forgot, and drafts a **4-file spec bundle**:

| File | What it holds |
| --- | --- |
| `constitution.md` | The rules that never change (locked invariants) |
| `requirements.md` | User stories, acceptance criteria and edge cases, every one testable |
| `solution.md` | The technical design |
| `tasks.md` | The ordered build plan for your agent |

You can see a real bundle in this repo's [`specs/`](specs) folder.

**Why spec-driven.** Long chat prompts decay: agents forget non-goals after a dozen turns, invent APIs and overwrite architecture. A spec is an immutable contract that stays the same across every prompt, so you get less rework, fewer regressions and faster delivery.

**Also in MySpec:**

- An HTTP MCP server (`mcp.myspec.dev`) that streams your spec into Cursor and other hosted agents
- Brownfield workflows (a proposal plus requirements delta) for existing code, OpenSpec-compatible
- A Spec Kit-compatible greenfield workflow (`spec.md`, `plan.md`, `tasks.md`)
- Markdown and Mermaid editing, public share links and ZIP export of your bundle
- Organizations, invitations and personal API tokens for unattended agents
- A free tier (20 projects, 100 spec files, no credit card), with Pro and Team plans above it

**Want to build your own game or app?** [Start free at myspec.dev](https://myspec.dev/?utm_source=kernelarchitect&utm_medium=readme&utm_campaign=builtwith).

## License

Free for everyone, including commercial use: [MySpec Credit License](LICENSE) (MIT-based). The one ask is that forks and remixes keep their MySpec credit, so it spreads with every copy. Contributors get listed in [CREDITS.md](CREDITS.md).

## Contributing

PRs are welcome: levels, new boxes, art, sound, translations, balance fixes. Add yourself to [CREDITS.md](CREDITS.md) in your PR. Built a fork or a level pack, or written about it? Add it to the "Spread the word" table there.
