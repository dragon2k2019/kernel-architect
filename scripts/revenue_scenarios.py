#!/usr/bin/env python3
"""
revenue_scenarios.py - order-of-magnitude revenue sanity check from Steam review counts.
Boxleiter-style: units ~= reviews x (30..60). Gross = units x LIST price (before Steam's 30% cut,
discounts, regional pricing, taxes, refunds) -> an upper-bound illustration, NOT a forecast.
Calibration: The Farmer Was Replaced publicly reported >400k units; the 30-60x band below brackets that.
"""
import csv
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
rows = {r["steam_name"]: r for r in csv.DictReader(open(ROOT / "data" / "comparables.csv"))}
LO, HI = 30, 60
def price(s): return float(s.replace("$", "")) if s and s != "Free" else None

lines = ["| Comparable (reviews @ list price) | Est. units (30-60x) | Gross at list price |", "|---|---:|---:|"]
for name in ["Tower Networking Inc.", "Data Center", "Turing Complete", "The Farmer Was Replaced"]:
    r = rows[name]; rev = int(r["reviews"]); p = price(r["price"])
    lines.append(f"| {name} ({rev:,} @ ${p:.2f}) | {rev*LO:,} - {rev*HI:,} | ${rev*LO*p/1e6:.2f}M - ${rev*HI*p/1e6:.2f}M |")

PRICE = 14.99
lines += ["", f"**Kernel Architect at ${PRICE} - if it lands at the scale of...**", "",
          "| Scenario | Benchmarked on | Est. units | Gross at $14.99 |", "|---|---|---:|---:|"]
for label, bench in (("Low", "Tower Networking Inc."), ("Base", "Data Center"), ("High", "Turing Complete")):
    rev = int(rows[bench]["reviews"])
    lines.append(f"| {label} | {bench} ({rev:,} reviews) | {rev*LO:,} - {rev*HI:,} | ${rev*LO*PRICE/1e6:.2f}M - ${rev*HI*PRICE/1e6:.2f}M |")
txt = "\n".join(lines)
print(txt)
(ROOT / "data" / "revenue_scenarios.md").write_text(txt + "\n")
