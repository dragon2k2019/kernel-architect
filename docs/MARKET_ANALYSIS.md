# Market Analysis: Which of the four games should we build?

> **Question:** Which concept in [`BLUEPRINT.md`](./BLUEPRINT.md) has the best mix of *high demand* and *under-delivered supply*?
> **Evidence snapshot:** 2 Oct 2026. Every number below comes from `scripts/` → `data/` (stdlib Python, public endpoints) or from a linked source.
> **Scope note:** "Demand" here means demand evidenced by sales, reviews and community behaviour, not a formal TAM. Steam wishlists and true sales are not public, so sales are estimates (see §8).

---

## 1. Decision

### Build **Game 1: *Kernel Architect*** (infrastructure / system-design simulator)

| Rank | Game | Demand (1–5) | Under-delivery (1–5) | **Opportunity Index** (D × U, max 25) |
|---|---|---:|---:|---:|
| **1** | **Kernel Architect** (Solution Architect) | 4.67 | 4.67 | **21.8** |
| 2 | Heisenbug Hunter (QA) | 3.00 | 3.33 | 10.0 |
| 3 | AST Archeology: Merge Conflict (Developer) | 3.33 | 2.33 | 7.8 |
| 4 | Lexer & Scope: Day Zero (Business Analyst) | 2.00 | 3.67 | 7.3 |

It is the only concept where **both halves of your question are true at once**:

- **Demand is demonstrated, not assumed.** Programming / automation / optimisation games are in an up-cycle. *The Farmer Was Replaced* has sold >400k lifetime units and earned ≈$1.65M in the first 30 days of its 1.0 launch ([GameDiscoverCo](https://newsletter.gamediscover.co/p/how-the-farmer-was-replaced-hit-39000)). Steam gave the category its own sale event, Programming Fest, 10–14 Sep 2026 ([80.lv](https://80.lv/articles/what-to-play-top-10-best-games-from-steam-programming-fest-2026)). The audience is ~47M developers, 36.5M of them professional ([SlashData via ShiftMag](https://shiftmag.dev/there-are-47-million-developers-in-the-world-5200/)).
- **This exact theme already pulls people, and they are building it for free.** *Server Survival* is a free, MIT-licensed "tower defense for cloud architecture". It reached **6,433 GitHub stars and 710 forks in ~10 months** ([GitHub](https://github.com/pshenok/server-survival), API snapshot 2 Oct 2026). At least four other system-design simulators have surfaced (InfraSim, SystemLore, PaperDraw, a 3D simulator posted on DEV on 30 Sep 2026).
- **Supply on Steam is nearly empty.** Steam store searches for *devops, microservices, cloud architect* and *site reliability* return **0 games**. *Kubernetes* returns 0–1 (*Uptime: A Cloud Provider Sim*, 58 reviews). The nearest titles are hardware/ISP sims: *Data Center* (958 reviews, **77% positive**) and *Tower Networking Inc.* (333 reviews).
- **What does exist is low-quality or hobby-grade.** The 2026 "Data Center" me-too wave has near-zero traction so far (15 and 1 reviews, with another due 2 Nov). The best-known *software*-architecture game is a free browser project.
- **Best fit for your engine.** Thousands of visible packets, deterministic seeds (daily challenges, shareable replays) and flow visualisation *are* the product. For the other three games the ECS/GPU stack is mostly overkill.

**Confidence:** high that it is the best of the four; **moderate** on absolute commercial size (§6–7).

**Two honest caveats up front.** (1) Direct infra comps have **not** yet proven hit-scale: the best sits near ~1k reviews, versus 9.6k for *The Farmer Was Replaced*. The proven hits are about the *loop* (see a system → change it → watch it fail → optimise), so design loop-first, theme-second. (2) A free competitor with real momentum exists, so you win on depth, polish and content, not on the idea alone.

---

## 2. How "high demand but under-delivered" was measured

| Axis | Sub-scores (each 1–5) | Evidence used |
|---|---|---|
| **Demand** | Hit scale of comparables · audience size & reachability · momentum | Steam review totals (exact, all languages), publicly disclosed sales, SlashData, GitHub/Reddit behaviour |
| **Under-delivery** | Scarcity of polished competitors · quality gap of existing entrants · evidence of unmet asks | Steam tag/keyword supply probes, ratings of entrants, "any games like this?" threads |

**Opportunity Index = Demand × Under-delivery** (max 25). It is multiplicative on purpose: an *empty* niche with *no* demand (Game 2) cannot win, and a *hot* niche that is *saturated* (Game 4) cannot win either. A second "build-fit" lens (tech fit, execution ease, monetisation breadth) is a sanity check, not the primary criterion. Scores and the evidence behind each are in [`data/scorecard.json`](../data/scorecard.json). Change a score, re-run `python3 scripts/score.py`, and see whether the pick moves.

---

## 3. Market context (applies to all four)

- **Programming/automation is a small, loyal, high-rated niche that is currently growing.** Steam's *Programming* tag holds only **389 games** (games only; excludes DLC, software and demos). At least 47 of them have ≥500 English reviews, and established titles sit at a median ~92% positive. *The Farmer Was Replaced* now has 9,653 reviews at 96%.
- **The top of the "Zachlike" tier is thinning.** Zachtronics closed in 2022 after *Last Call BBS*. Alumni formed Coincidence, whose *Kaizen: A Factory Story* (2025) has 722 reviews at 92% ([Wikipedia](https://en.wikipedia.org/wiki/Zachtronics)). The audience is still there: SteamDB counted 100+ products meeting its broader criteria for Programming Fest ([Simulation Daily](https://simulationdaily.com/news/steam-programming-fest-discount/)).
- **"Professional-skill puzzle" games can sell right now.** *Database Detective: Minor Crimes Division* (a SQL puzzle game, released 17 Jul 2026) already has 959 reviews at 97%.
- **Distribution playbook that worked in this niche.** The *Farmer* team contacted ~10,000 influencers, gave ~1,000 keys, and went viral on Reddit, showcasing its tutorial ([80.lv](https://80.lv/articles/how-coding-farming-sim-reached-39-000-revenue-growth-after-full-release)).

---

## 4. The four concepts, one by one

### 4.1 Game 1: Kernel Architect ✅ (pick)

**Demand**
- *Loop-level proof.* *Mini Metro* 16.8k reviews (96%), *Factorio* 235k (98%), *Turing Complete* 5.8k (96%), *Hacknet* 26k (94%), *Bitburner* 7.4k (95%, free), *The Farmer Was Replaced* 9.7k (96%).
- *Audience.* System design is a mass learning market: ByteByteGo reported 1M+ newsletter subscribers in Jul 2024 ([Alex Xu](https://x.com/alexxubyte/status/1818676015646097858)) and claims 5M+ learners ([review](https://javarevisited.wordpress.com/2026/09/17/is-bytebytego-worth-it-in-2026-my-complete-bytebytego-review-for-system-design-interviews/)). The `system-design-primer` repo has **~373k GitHub stars**. One review site notes the leading paid course is weaker for "learners who want interactivity" ([source](https://grokkingthesystemdesign.com/platforms/bytebytego/)). That is the gap a game fills.
- *Grassroots behaviour.* The *Server Survival* author asked r/devops "does anyone actually want this?" and got a feature wish-list back (observability, sandbox mode, time-of-day traffic) ([thread](https://www.reddit.com/r/devops/comments/1p3bxnx/i_built_a_tower_defense_game_that_teaches_cloud/)). On r/foss a reader asks "Are there any other games like this?" ([thread](https://www.reddit.com/r/foss/comments/1rgs4c3/server_survival_is_the_most_fascinating_tower/)).
- *Steam validation.* *Data Center* (Waseku, 31 Mar 2026, $8.99) has 958 reviews. One Reddit post says it "explains data centers and networking better than most IT courses" ([r/AITrailblazers](https://www.reddit.com/r/AITrailblazers/comments/1rc50sr/this_steam_game_explains_data_centers_and/)).

**Supply (what's delivered)**
- Steam store searches return zero games for *devops / microservices / cloud architect / site reliability*. *Kubernetes* has one (58 reviews). *Sysadmin* surfaces only tiny titles (*SysAdmin Odyssey*, 42 reviews). *Programming × Tower Defense* has 8 games in total; *Programming × Management* has 58.
- The only Steam hits in the neighbourhood model **hardware or ISPs**, not software architecture: *Data Center* (77%) and *Tower Networking Inc.* (95%, 333 reviews). A reader on r/gameideas says *Data Center*'s "routing and settings on servers are really limited" ([thread](https://www.reddit.com/r/gameideas/comments/1rav72r/data_center_management_simulation_with_detailed/)).
- Me-too entrants have near-zero traction: *Data Center Simulator Game* (15 reviews, 20%), *COLD AISLE: Data Center Tycoon* (1 review), *Silicon Sprint: Data Center Incremental* (listed for 2 Nov 2026).
- Free software-architecture games exist but are prototype-grade: *Server Survival* (25 campaign levels, 26 services), [*InfraSim*](https://play.google.com/store/apps/details?id=com.infrasim.app) (44 levels, **seeded daily challenge + leaderboard**), [*SystemLore*](https://systemlore.com/), [*PaperDraw*](https://www.reddit.com/r/SideProject/comments/1r5jxjq/i_built_a_system_design_simulator_drag_simulate/). The 3D simulator's author admits its constants are "invented, not measured" ([DEV](https://dev.to/irfan_wani/i-built-a-3d-system-design-simulator-to-stop-hand-waving-architectures-4nd6)).

**Verdict:** strong demand (loop and audience) × thin, low-grade supply → the top opportunity.

### 4.2 Game 3: Heisenbug Hunter (runner-up; highest ceiling of the rest)

- **Adjacent demand is enormous.** *The Exit 8* passed **3M copies** across platforms at ~$3–5 ([Gematsu](https://www.gematsu.com/2026/09/the-exit-8-sales-top-three-million)). *No, I'm not a Human* has 31k reviews. *Keep Talking and Nobody Explodes* has 17k. "Exit 8-likes" is now a Steam curator category ([Spot the Anomaly](https://spottheanomaly.wiki/anomaly-games)).
- **But the QA theme itself has no proof.** The only dedicated QA sim, *QA Simulator* (16 Feb 2026, $12.99), has **7 reviews** at 57%. No premium QA/bug-hunt game exists, and nobody is visibly asking for one.
- **The loop is already clone-saturated.** The same source describes a "clone wave" from 2024 on, and anomaly clones now reach dev settings (*Anomaly Jobs: Data Center*, May 2026, 21 reviews).
- **Verdict:** the *loop* is proven, the *theme* is not, and the loop is crowded. If reframed as "anomaly / deduction with deterministic replays" for a general audience, this is the best second bet (see §7).

### 4.3 Game 4: AST Archeology: Merge Conflict

- **Roguelike demand is real but saturated.** Steam lists **5,153 roguelikes and 4,886 roguelites**. The ASCII/text leaders are already excellent: *Dwarf Fortress* (31.6k reviews, ~95%, >1M Steam copies per [PC Gamer](https://www.pcgamer.com/games/sim/dwarf-fortress-sells-1-million-copies-on-steam-so-now-bay-12-games-can-afford-that-little-party-it-planned/)), *Caves of Qud* (12.7k, 95%), *Cogmind* (2.0k, 96%), *Warsim* (2.2k, 96%).
- **ASCII is a headwind, not a tailwind, at scale.** Coverage of *Dwarf Fortress*'s Steam breakout credits the swap from ASCII to hand-drawn tiles. *Caves of Qud* shipped a "fully graphical UI" at 1.0 ([Steam](https://store.steampowered.com/app/333640/Caves_of_Qud/)).
- **Code-themed roguelikes have no hit.** *Programming × Roguelike* has 21 games, none breakout. Double Fine's code-as-combat *Hack 'n' Slash* sits at 53% (Mixed, 934 reviews). *NET.CRAWL* (Aug 2026) has 60 reviews.
- **Verdict:** high demand for roguelikes, but **not under-delivered**. It is crowded, the leaders are well rated, and the dev theme is unproven. Largest scope of the four.

### 4.4 Game 2: Lexer & Scope: Day Zero

- **Supply is effectively zero.** *Business analyst* returns 0–3 games, none about business analysis (e.g. *Esports Manager 2026*, *Tennis Manager 2021*), and *scrum* returns 14, none about Scrum or agile.
- **But there is no demand proof either.** The nearest hits are bureaucracy/analysis puzzles with nothing BA-specific: *Papers, Please* (80.6k reviews), *Return of the Obra Dinn* (35.3k), *Orwell* (15.6k), *The Case of the Golden Idol* (11.0k), *Database Detective* (959). Nobody is observably asking for a requirements game.
- **Tech mismatch.** A branchless token scanner and DAG cycle detection do not need the ECS/GPU/worker stack.
- **Verdict:** greenfield is not the same as opportunity. Keep the "contradictory client brief" idea as a content layer in a later title.

---

## 5. Scorecard and stress tests

Because I both defined and scored the criteria, I tried to *break* the result.

### Scorecard (1-5 sub-scores; evidence for each in `data/scorecard.json`)

| Game | Demand | Under-delivery | **Opportunity Index** (D x U, max 25) | Tech-fit | Exec. ease | Monetization | Composite (0-100) |
|---|---:|---:|---:|---:|---:|---:|---:|
| **G1** Kernel Architect | 4.67 | 4.67 | **21.8** | 5 | 3 | 5 | 88 |
| **G3** Heisenbug Hunter | 3.00 | 3.33 | **10.0** | 4 | 3 | 3 | 52 |
| **G4** AST Archeology: Merge Conflict | 3.33 | 2.33 | **7.8** | 3 | 2 | 3 | 41 |
| **G2** Lexer & Scope: Day Zero | 2.00 | 3.67 | **7.3** | 2 | 3 | 2 | 36 |

### Does the pick survive different lenses?

| Lens | 1st | 2nd | 3rd | 4th |
|---|---|---|---|---|
| Opportunity Index (primary) | G1 | G3 | G4 | G2 |
| Demand only | G1 | G4 | G3 | G2 |
| Under-delivery only | G1 | G2 | G3 | G4 |
| Composite (60% opp / 40% build-fit) | G1 | G3 | G4 | G2 |
| Builder-first (30% opp / 70% build-fit) | G1 | G3 | G4 | G2 |

### Monte-Carlo: every sub-score randomly shifted by -1/0/+1, 20,000 runs (seeded)

| Game | Wins on Opportunity Index | Wins on Composite |
|---|---:|---:|
| G1 | 99.9% | 100.0% |
| G2 | 0.0% | 0.0% |
| G3 | 0.1% | 0.0% |
| G4 | 0.0% | 0.0% |

### Adversarial stress tests

* **Worst case for G1:** G1's six demand/under-delivery scores all -1, every rival's all +1 -> G1 13.4, G2 12.0, G3 17.3, G4 14.4  (winner: **G3**).
* **Headroom:** G1's Demand *and* Under-delivery would both have to be over-scored by **1.51 points** (on a 5-point scale) before the best rival (G3, 10.0) overtakes it on the Opportunity Index.

**Reading it:** Kernel Architect wins on every lens. Rivals only overtake if I have over-scored G1 by ~1.5 points on *both* axes. The adversarial case (all G1 scores −1, all rivals' +1) is the only one that flips the winner, and it flips to **G3**, which is why G3 is the named runner-up.

---

## 6. How to win with Kernel Architect

1. **Sell the loop, not the stack.** "50,000 packets/second" is an engineering flex. What the hits in this niche share is legible cause → effect plus an optimisation ladder. *Data Center*'s own pitch is "follow colored data packets as your center comes to life".
2. **Make the first 10 minutes free, instant and shareable.** *Server Survival* is playable in a browser tab (the author deployed it to GitHub Pages after an r/devops commenter asked for a playable link) and has a "Share Architecture" feature. *The Farmer Was Replaced* got early traction from Reddit virality around its tutorial ([80.lv](https://80.lv/articles/how-coding-farming-sim-reached-39-000-revenue-growth-after-full-release)). Plan a free web demo plus a Steam demo. *Engineering note:* `SharedArrayBuffer` needs cross-origin isolation (COOP/COEP headers). Static hosts that cannot set headers (e.g. GitHub Pages) need a service-worker workaround or a header-capable host. Test this in week 1.
3. **Treat determinism as table stakes, not a moat.** *InfraSim* already ships "same seed, same run" with a daily challenge and leaderboard. Your moat is depth and polish: an authored campaign with incident post-mortems, **credible** queueing-based models with a visible "model card", and Zachtronics-style *cost vs. p99-latency* histograms for retention.
4. **Make ASCII a skin, not a barrier.** Keep the phosphor-terminal identity (the Bitburner / TIS-100 / Hacknet crowd loves it). Ship a pixel/tile skin and keep packets as readable particles. See the *Dwarf Fortress* and *Caves of Qud* evidence above.
5. **Add the learning wrapper.** An "Interview mode / Learn" layer targets the second audience (system-design learners). Education and team licences are a *hypothesis* to test, not a proven channel.

**Revenue sanity check** (order-of-magnitude, *not* a forecast; Boxleiter-style estimate of 30–60 units per review, the 2025 "NB number" averaged ~63 per [GameDiscoverCo via Profitable](https://profitable.app/tools/steam-revenue-calculator); gross at list price, **before** Steam's 30% cut, discounts, taxes and refunds). The band reproduces *The Farmer Was Replaced*'s disclosed >400k units.

| Comparable (reviews @ list price) | Est. units (30-60x) | Gross at list price |
|---|---:|---:|
| Tower Networking Inc. (333 @ $19.99) | 9,990 - 19,980 | $0.20M - $0.40M |
| Data Center (958 @ $8.99) | 28,740 - 57,480 | $0.26M - $0.52M |
| Turing Complete (5,821 @ $19.99) | 174,630 - 349,260 | $3.49M - $6.98M |
| The Farmer Was Replaced (9,653 @ $9.99) | 289,590 - 579,180 | $2.89M - $5.79M |

**Kernel Architect at $14.99 - if it lands at the scale of...**

| Scenario | Benchmarked on | Est. units | Gross at $14.99 |
|---|---|---:|---:|
| Low | Tower Networking Inc. (333 reviews) | 9,990 - 19,980 | $0.15M - $0.30M |
| Base | Data Center (958 reviews) | 28,740 - 57,480 | $0.43M - $0.86M |
| High | Turing Complete (5,821 reviews) | 174,630 - 349,260 | $2.62M - $5.24M |

---

## 7. Risks, and what would change this recommendation

| Risk | Evidence | Mitigation |
|---|---|---|
| Free, open-source substitute with momentum | Server Survival: 6.4k★, 710 forks, MIT, active, sister game *Datacenter Survival* | Out-polish and out-content it. Keep a free demo. Engage the community instead of ignoring it. |
| No hit-scale proof for the *infra theme* | Best Steam comps ≈ 1k reviews | Design loop-first (automation/optimisation), borrow proven hooks from *Factorio*, *Mini Metro* and *Turing Complete*. |
| Stars ≠ sales; devs may not pay for edu-tainment | Paid demand is proven for *courses* and *games* separately, not yet for a game that teaches | Validate with a demo and wishlists before heavy investment. Hybrid monetisation. |
| Simulation credibility | Builders admit invented constants | Queueing-theory models, transparent assumptions, practitioner review. |
| Fast followers | ≥4 independent builders; Steam clone wave | Ship a vertical slice fast. Own "premium + campaign + replays". |
| Over-engineered stack | 50k-entity target, workers, SAB | Vertical slice first. Measure before committing to the full architecture. |

**What would flip the pick**
- A funded studio ships a polished software-architecture game on Steam first.
- Your own demo cannot hold players past the first few levels.
- You value **upside over probability**. Then run a 2-week prototype of **Game 3 reframed** as an anomaly/deduction game (deterministic replays as the "proof" mechanic) aimed at the *Exit 8* / *Obra Dinn* audience. The data shows demand for the loop, not the QA theme, so test before building.

---

## 8. Data quality and limits

- **Reviews are a proxy for sales** (typically 20–60 sales per review; the ratio varies by genre, price and region).
- **SteamSpy owner ranges are not used in this report.** Several are visibly stale (e.g. *No, I'm not a Human* shows 0–20k despite 31k reviews). They remain in `data/comparables.csv` for reference only.
- **Steam *search*-derived counts are English-language reviews**, and "≥N" figures are lower bounds when a query has >100 matches (only the top 100 by Steam's rating sort are sampled). Review totals in the comparables table are exact, all-language figures from the Steam reviews API.
- **Keyword probes are a rough instrument.** Terms such as *requirements*, *system design* and *anomaly* match unrelated games' descriptions. They are kept in the CSV but not relied on here.
- **Reddit/GitHub signals show interest, not purchase intent.**
- **Scores are judgment calls.** Hence the stress tests above, and the editable scorecard.

---

## 9. Suggested next steps

1. Lock the pitch: *"Tower defense × system design, with deterministic replays."* One sentence, three screenshots.
2. Build a vertical slice: one campaign level plus an endless mode in the blueprint's stack, as a web build with cross-origin isolation working.
3. Publish a Steam page plus a free demo. Target the next Steam Next Fest / Programming Fest windows.
4. Seed r/devops, r/webdev, HN and system-design communities (the *Server Survival* pattern), and run the *Farmer*-style key outreach.
5. Set go/no-go targets for wishlists and demo retention **before** you build further, then decide.

---

## Appendix A: Steam supply probe (2 Oct 2026)

| Game | Steam query | Games found | ≥500 reviews* | ≥1,000 reviews* |
|---|---|---:|---:|---:|
| G1 | tag Programming | 389 | ≥47 | ≥33 |
| G1 | tag Programming + Automation | 150 | ≥31 | ≥21 |
| G1 | tag Programming + Management | 58 | 14 | 10 |
| G1 | tag Programming + Tower Defense | 8 | 2 | 1 |
| G1 | kw 'devops' | 0 | 0 | 0 |
| G1 | kw 'kubernetes' | 1 | 0 | 0 |
| G1 | kw 'sysadmin' | 2 | 0 | 0 |
| G1 | kw 'microservices' | 0 | 0 | 0 |
| G2 | kw 'business analyst' | 3 | 1 | 0 |
| G2 | kw 'scrum' | 14 | 1 | 0 |
| G2 | tag Programming + Puzzle + Logic | 140 | ≥21 | ≥14 |
| G2 | tag Job Simulator + Programming | 6 | 3 | 0 |
| G3 | kw 'QA tester' | 4 | 0 | 0 |
| G3 | tag Programming + Detective | 17 | 8 | 4 |
| G3 | tag Programming + Investigation | 20 | 4 | 3 |
| G3 | kw 'glitch' + tag Detective | 5 | 0 | 0 |
| G4 | tag Roguelike | 5,153 | ≥98 | ≥78 |
| G4 | tag Roguelike + Text-Based | 79 | 14 | 7 |
| G4 | tag Roguelike + Programming | 21 | 7 | 4 |
| G4 | tag Roguelike + Hacking | 33 | 5 | 4 |
| G4 | tag Roguelike + Pixel Graphics | 1,884 | ≥58 | ≥45 |
| Ref | tag Roguelite (all) | 4,886 | ≥91 | ≥73 |

\* English-language reviews from Steam search, sampled over the top 100 results by Steam's rating sort. Counts are exact when a query has ≤100 matches and **lower bounds** (≥) otherwise. Keyword queries that match unrelated games' descriptions (e.g. *requirements*, *system design*, *anomaly*, *load balancer*) are kept in `data/steam_query_summary.csv` but not relied on.

## Appendix B: Comparables (exact review totals, all languages)

**Game 1: infra / automation / system-design adjacent**

| Title | Released | List price | Reviews | % positive |
|---|---|---:|---:|---:|
| Factorio | Aug 14, 2020 | $35.00 | 235,307 | 98% |
| Hacknet | Aug 12, 2015 | $9.99 | 26,158 | 94% |
| Mini Metro | Nov 6, 2015 | $9.99 | 16,786 | 96% |
| The Farmer Was Replaced | Oct 10, 2025 | $9.99 | 9,653 | 96% |
| Software Inc. | May 1, 2015 | $22.99 | 7,854 | 94% |
| Bitburner | Dec 10, 2021 | Free | 7,433 | 95% |
| Turing Complete | Oct 2, 2021 | $19.99 | 5,821 | 96% |
| Screeps: World | Nov 16, 2016 | $19.99 | 2,098 | 86% |
| Data Center | Mar 31, 2026 | $8.99 | 958 | 77% |
| Kaizen: A Factory Story | Jul 14, 2025 | $19.99 | 722 | 92% |
| Tower Networking Inc. | Jul 30, 2025 | $19.99 | 333 | 95% |
| Data Center Simulator Game | Jul 6, 2026 | $22.00 | 15 | 20% |
| COLD AISLE: Data Center Tycoon | Aug 28, 2026 | $11.99 | 1 | 0% |
| Silicon Sprint: Data Center Incremental *(upcoming)* | Nov 2, 2026 | — | 0 | — |

**Game 2: analyst / requirements / bureaucracy-puzzle adjacent**

| Title | Released | List price | Reviews | % positive |
|---|---|---:|---:|---:|
| Papers, Please | Aug 8, 2013 | $9.99 | 80,642 | 97% |
| Return of the Obra Dinn | Oct 18, 2018 | $19.99 | 35,312 | 97% |
| Orwell: Keeping an Eye On You | Oct 27, 2016 | $9.99 | 15,586 | 90% |
| The Case of the Golden Idol | Oct 13, 2022 | $17.99 | 11,017 | 98% |
| Hypnospace Outlaw | Mar 12, 2019 | $19.99 | 5,581 | 97% |
| Database Detective: Minor Crimes Division | Jul 17, 2026 | $14.99 | 959 | 97% |

**Game 3: QA / bug-hunt / anomaly adjacent**

| Title | Released | List price | Reviews | % positive |
|---|---|---:|---:|---:|
| No, I'm not a Human | Sep 15, 2025 | $14.99 | 31,078 | 93% |
| Keep Talking and Nobody Explodes | Oct 8, 2015 | $14.99 | 17,162 | 97% |
| The Exit 8 | Nov 29, 2023 | $3.99 | 11,664 | 93% |
| Please, Don’t Touch Anything | Mar 26, 2015 | $4.99 | 5,602 | 89% |
| That's not my Neighbor | Mar 11, 2025 | $2.99 | 4,767 | 89% |
| I'm on Observation Duty | Apr 3, 2019 | $2.99 | 2,258 | 95% |
| Shinkansen 0 | Mar 22, 2024 | $6.99 | 1,150 | 85% |
| QA Simulator | Feb 16, 2026 | $12.99 | 7 | 57% |

**Game 4: ASCII / code roguelike**

| Title | Released | List price | Reviews | % positive |
|---|---|---:|---:|---:|
| Dwarf Fortress | Dec 6, 2022 | $29.99 | 31,553 | 95% |
| Caves of Qud | Dec 5, 2024 | $29.99 | 12,681 | 95% |
| Warsim: The Realm of Aslona | Dec 20, 2022 | $9.99 | 2,223 | 96% |
| Cogmind | Oct 16, 2017 | $24.99 | 2,014 | 96% |
| Hack 'n' Slash | Sep 9, 2014 | $13.37 | 934 | 53% |
| NET.CRAWL | Aug 3, 2026 | $9.99 | 60 | 97% |

## Appendix C: Sources

- Developer population: [ShiftMag / SlashData](https://shiftmag.dev/there-are-47-million-developers-in-the-world-5200/) · [Second Talent (Q3 2025: 48.4M)](https://www.secondtalent.com/resources/countries-with-most-software-developers/)
- *The Farmer Was Replaced*: [GameDiscoverCo](https://newsletter.gamediscover.co/p/how-the-farmer-was-replaced-hit-39000) · [80.lv](https://80.lv/articles/how-coding-farming-sim-reached-39-000-revenue-growth-after-full-release) · [Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/coding-game-the-farmer-was-replaced-reaches-400k-sales)
- Steam Programming Fest 2026: [80.lv](https://80.lv/articles/what-to-play-top-10-best-games-from-steam-programming-fest-2026) · [Simulation Daily](https://simulationdaily.com/news/steam-programming-fest-discount/)
- Zachtronics / Coincidence: [Wikipedia](https://en.wikipedia.org/wiki/Zachtronics)
- Server Survival: [GitHub](https://github.com/pshenok/server-survival) · [r/devops](https://www.reddit.com/r/devops/comments/1p3bxnx/i_built_a_tower_defense_game_that_teaches_cloud/) · [r/foss](https://www.reddit.com/r/foss/comments/1rgs4c3/server_survival_is_the_most_fascinating_tower/)
- Other simulators: [InfraSim](https://play.google.com/store/apps/details?id=com.infrasim.app) · [SystemLore](https://systemlore.com/) · [PaperDraw (r/SideProject)](https://www.reddit.com/r/SideProject/comments/1r5jxjq/i_built_a_system_design_simulator_drag_simulate/) · [3D simulator (DEV)](https://dev.to/irfan_wani/i-built-a-3d-system-design-simulator-to-stop-hand-waving-architectures-4nd6)
- *Data Center* (Waseku): [Steam](https://store.steampowered.com/app/4170200/Data_Center/) · [r/gameideas](https://www.reddit.com/r/gameideas/comments/1rav72r/data_center_management_simulation_with_detailed/) · [r/AITrailblazers](https://www.reddit.com/r/AITrailblazers/comments/1rc50sr/this_steam_game_explains_data_centers_and/) · [Data Center Simulator Game](https://store.steampowered.com/app/1917160/Data_Center_Simulator_Game/)
- System-design learning market: [system-design-primer](https://github.com/donnemartin/system-design-primer) · [ByteByteGo 1M subscribers](https://x.com/alexxubyte/status/1818676015646097858) · [ByteByteGo review](https://javarevisited.wordpress.com/2026/09/17/is-bytebytego-worth-it-in-2026-my-complete-bytebytego-review-for-system-design-interviews/) · [interactivity gap](https://grokkingthesystemdesign.com/platforms/bytebytego/)
- Anomaly genre: [Gematsu: *The Exit 8* tops 3M](https://www.gematsu.com/2026/09/the-exit-8-sales-top-three-million) · [Spot the Anomaly genre timeline](https://spottheanomaly.wiki/anomaly-games)
- QA / analyst: [QA Simulator (Steam)](https://store.steampowered.com/app/2976690/QA_Simulator/) · [Database Detective (Steam)](https://store.steampowered.com/app/3950130/)
- Roguelike/ASCII: [PC Gamer: *Dwarf Fortress* 1M](https://www.pcgamer.com/games/sim/dwarf-fortress-sells-1-million-copies-on-steam-so-now-bay-12-games-can-afford-that-little-party-it-planned/) · [Game Developer](https://www.gamedeveloper.com/business/dwarf-fortress-has-topped-1-million-sales-on-steam) · [*Caves of Qud* (Steam)](https://store.steampowered.com/app/333640/Caves_of_Qud/)
- Review→sales heuristics: [Profitable (Boxleiter / NB number)](https://profitable.app/tools/steam-revenue-calculator)
