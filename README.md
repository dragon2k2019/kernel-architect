# Game-concept market research

Decides which of four game concepts (see [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md)) has the best mix of **high demand** and **under-delivered supply**.

**Result: build *Kernel Architect*** (infrastructure / system-design simulator). Full reasoning, evidence and risks: [`docs/MARKET_ANALYSIS.md`](docs/MARKET_ANALYSIS.md).

| Rank | Game | Opportunity Index (Demand × Under-delivery, max 25) |
|---|---|---:|
| 1 | Kernel Architect | 21.8 |
| 2 | Heisenbug Hunter | 10.0 |
| 3 | AST Archeology: Merge Conflict | 7.8 |
| 4 | Lexer & Scope: Day Zero | 7.3 |

## Layout

```
docs/
  BLUEPRINT.md            original 4-game architecture blueprint (verbatim)
  MARKET_ANALYSIS.md      the analysis + recommendation (dated snapshot, 2 Oct 2026)
data/
  scorecard.json          editable 1-5 scores, with the evidence behind each
  scorecard_results.md    generated: ranking, alternative lenses, Monte-Carlo, stress tests
  revenue_scenarios.md    generated: order-of-magnitude revenue sanity check
  comparables.csv         exact Steam review totals for hand-picked comparables
  steam_query_summary.csv, steam_top_titles_by_query.csv   Steam supply probes
  github_signals.json     GitHub stars/forks cited in the analysis
scripts/                  Python 3 stdlib only - no installs
  steam_probe.py          Steam tag/keyword supply probe
  steam_comparables.py    Steam review totals (+ SteamSpy owner ranges, reference only)
  github_signals.py       GitHub interest snapshot
  score.py                scorecard + sensitivity analysis
  revenue_scenarios.py    review -> sales estimate
```

## Reproduce

```bash
python3 scripts/steam_probe.py          # ~2 min; Steam rate-limits (HTTP 429) - the script backs off automatically
python3 scripts/steam_comparables.py    # ~2 min
python3 scripts/github_signals.py
python3 scripts/score.py                # edit data/scorecard.json first to test whether the pick changes
python3 scripts/revenue_scenarios.py
```

`docs/MARKET_ANALYSIS.md` is a **dated snapshot**; re-running the scripts refreshes `data/` but does not rewrite the report.

## Push to a remote

```bash
git remote add origin <YOUR_REPO_URL>
git push -u origin main
```
