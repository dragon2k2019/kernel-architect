#!/usr/bin/env python3
"""github_signals.py - snapshot of GitHub interest signals cited in the analysis (public API, no auth)."""
import json, time, urllib.request
from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / "data" / "github_signals.json"
REPOS = ["pshenok/server-survival", "donnemartin/system-design-primer"]
out = {"snapshot_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "repos": {}}
for r in REPOS:
    req = urllib.request.Request(f"https://api.github.com/repos/{r}", headers={"User-Agent": "market-research"})
    d = json.load(urllib.request.urlopen(req, timeout=20))
    out["repos"][r] = {k: d.get(k) for k in ("stargazers_count", "forks_count", "created_at", "pushed_at", "license")}
    if out["repos"][r]["license"]: out["repos"][r]["license"] = out["repos"][r]["license"].get("spdx_id")
    print(r, out["repos"][r])
OUT.write_text(json.dumps(out, indent=2) + "\n")
