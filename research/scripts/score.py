#!/usr/bin/env python3
"""
score.py - transparent scorecard + sensitivity analysis for the 4-game pick.

  Opportunity Index = DEMAND x UNDER_DELIVERY          (primary: "high demand AND under-delivered")
  Composite         = weighted blend of Opportunity (normalised) + build-fit lens

Then it tries to BREAK the pick:
  1. alternative lenses (demand-only, under-delivery-only, builder-first weights)
  2. Monte-Carlo: every sub-score perturbed by -1/0/+1 (seeded, reproducible)
  3. adversarial: all of G1's demand/under-delivery scores -1, every rival's +1
  4. headroom: uniform haircut to G1's two axes needed before a rival overtakes

Usage: python3 scripts/score.py            -> prints + writes data/scorecard_results.md
"""
import json, random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = json.load(open(ROOT / "data" / "scorecard.json"))
GAMES = DATA["games"]
W = DATA["weights"]
D_KEYS = ("d_hits", "d_audience", "d_momentum")
U_KEYS = ("u_scarcity", "u_quality", "u_unmet")

def mean(xs): xs = list(xs); return sum(xs) / len(xs)
def clip(v): return max(1, min(5, v))

def metrics(s):
    D = mean(s[k] for k in D_KEYS)
    U = mean(s[k] for k in U_KEYS)
    opp = D * U
    return {"D": D, "U": U, "opp": opp}

def composite(s, w):
    m = metrics(s)
    return 100 * (w["opportunity"] * m["opp"] / 25 + w["tech_fit"] * s["tech_fit"] / 5
                  + w["exec_ease"] * s["exec_ease"] / 5 + w["monetization"] * s["monetization"] / 5)

def rank(fn):
    return sorted(GAMES, key=lambda g: fn(GAMES[g]["scores"]), reverse=True)

out = []
def p(line=""):
    print(line); out.append(line)

# ---------------------------------------------------------------- base table
p("### Scorecard (1-5 sub-scores; evidence for each in `data/scorecard.json`)\n")
p("| Game | Demand | Under-delivery | **Opportunity Index** (D x U, max 25) | Tech-fit | Exec. ease | Monetization | Composite (0-100) |")
p("|---|---:|---:|---:|---:|---:|---:|---:|")
for g in rank(lambda s: metrics(s)["opp"]):
    s = GAMES[g]["scores"]; m = metrics(s)
    p(f"| **{g}** {GAMES[g]['name'].split(' (')[0]} | {m['D']:.2f} | {m['U']:.2f} | **{m['opp']:.1f}** | {s['tech_fit']} | {s['exec_ease']} | {s['monetization']} | {composite(s, W['primary_composite']):.0f} |")

# ---------------------------------------------------------------- lenses
p("\n### Does the pick survive different lenses?\n")
p("| Lens | 1st | 2nd | 3rd | 4th |")
p("|---|---|---|---|---|")
lenses = {
    "Opportunity Index (primary)":        lambda s: metrics(s)["opp"],
    "Demand only":                        lambda s: metrics(s)["D"],
    "Under-delivery only":                lambda s: metrics(s)["U"],
    "Composite (60% opp / 40% build-fit)": lambda s: composite(s, W["primary_composite"]),
    "Builder-first (30% opp / 70% build-fit)": lambda s: composite(s, W["builder_first"]),
}
for name, fn in lenses.items():
    r = rank(fn)
    p(f"| {name} | " + " | ".join(r) + " |")

# ---------------------------------------------------------------- Monte Carlo
rng = random.Random(20261002)          # fixed seed -> reproducible
N = 20000
wins_opp = {g: 0 for g in GAMES}; wins_comp = {g: 0 for g in GAMES}
for _ in range(N):
    pert = {g: {k: clip(v + rng.choice((-1, 0, 1))) for k, v in GAMES[g]["scores"].items()} for g in GAMES}
    wins_opp[max(GAMES, key=lambda g: metrics(pert[g])["opp"])] += 1
    wins_comp[max(GAMES, key=lambda g: composite(pert[g], W["primary_composite"]))] += 1
p(f"\n### Monte-Carlo: every sub-score randomly shifted by -1/0/+1, {N:,} runs (seeded)\n")
p("| Game | Wins on Opportunity Index | Wins on Composite |")
p("|---|---:|---:|")
for g in GAMES:
    p(f"| {g} | {100*wins_opp[g]/N:.1f}% | {100*wins_comp[g]/N:.1f}% |")

# ---------------------------------------------------------------- adversarial + headroom
def shifted(g, delta):
    s = dict(GAMES[g]["scores"])
    for k in D_KEYS + U_KEYS: s[k] = clip(s[k] + delta)
    return s
adv = {g: metrics(shifted(g, -1 if g == "G1" else +1))["opp"] for g in GAMES}
best_rival = max((g for g in GAMES if g != "G1"), key=lambda g: metrics(GAMES[g]["scores"])["opp"])
base_g1 = metrics(GAMES["G1"]["scores"])
rival_opp = metrics(GAMES[best_rival]["scores"])["opp"]
h = 0.0
while (base_g1["D"] - h) * (base_g1["U"] - h) > rival_opp: h += 0.01
p("\n### Adversarial stress tests\n")
p(f"* **Worst case for G1:** G1's six demand/under-delivery scores all -1, every rival's all +1 -> "
  + ", ".join(f"{g} {adv[g]:.1f}" for g in GAMES) + f"  (winner: **{max(adv, key=adv.get)}**).")
p(f"* **Headroom:** G1's Demand *and* Under-delivery would both have to be over-scored by **{h:.2f} points** (on a 5-point scale) "
  f"before the best rival ({best_rival}, {rival_opp:.1f}) overtakes it on the Opportunity Index.")

(ROOT / "data" / "scorecard_results.md").write_text("\n".join(out) + "\n")
print("\nwrote data/scorecard_results.md")
