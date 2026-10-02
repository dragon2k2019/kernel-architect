#!/usr/bin/env python3
"""
steam_probe.py - reproducible Steam market probe for the four game concepts.

What it measures (public, unauthenticated endpoints only):
  * Steam store search  -> total_count of games matching tag/keyword combos (SUPPLY size)
  * Same search sorted by review count -> top titles, review totals, % positive (DEMAND proof + QUALITY of supply)
  * Steam appreviews API -> exact review totals for hand-picked comparables

Usage:
  python3 scripts/steam_probe.py            # writes data/*.csv and data/*.json
Notes:
  * Review counts are a *proxy* for sales (typically ~1-3% of buyers leave a review). Not revenue.
  * Be polite: sleeps between calls. Safe to re-run.
"""
import csv, json, re, sys, time, html, urllib.error, urllib.parse, urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (market-research probe; contact: local)"}

# Steam tag ids (from https://store.steampowered.com/tagdata/populartags/english)
TAG = {
    "Programming": 5432, "Automation": 255534, "Roguelike": 1716, "Roguelite": 3959,
    "Text-Based": 31275, "Hacking": 5502, "Tower Defense": 1645, "Management": 12472,
    "Education": 1036, "Detective": 5613, "Investigation": 8369, "Job Simulator": 35079,
    "Hardware": 603297, "Idler": 615955, "Logic": 6129, "Puzzle": 1664,
    "Pixel Graphics": 3964, "Retro": 4004, "Cyberpunk": 4115, "Dungeon Crawler": 1720,
    "Resource Management": 8945, "Simulation": 599, "Mystery": 5716,
}

def get(url, retries=6):
    """GET with polite exponential back-off; Steam returns HTTP 429 when you go too fast."""
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            wait = 20 * (i + 1) if e.code == 429 else 2
            if i == retries - 1:
                print("  ! fetch failed:", url[:90], e, file=sys.stderr); return ""
            print(f"  .. HTTP {e.code}; waiting {wait}s (attempt {i+1}/{retries})", file=sys.stderr)
            time.sleep(wait)
        except Exception as e:
            if i == retries - 1:
                print("  ! fetch failed:", url[:90], e, file=sys.stderr); return ""
            time.sleep(2)

def steam_search(term="", tags=(), count=100, sort="Reviews_DESC", start=0):
    q = {"query": "", "start": start, "count": count, "sort_by": sort, "category1": 998,
         "infinite": 1, "json": 1, "cc": "US", "l": "english", "ndl": 1}
    if term: q["term"] = term
    if tags: q["tags"] = ",".join(str(TAG[t]) for t in tags)
    raw = get("https://store.steampowered.com/search/results/?" + urllib.parse.urlencode(q))
    try:
        d = json.loads(raw)
    except Exception:
        return 0, []
    rows = []
    for m in re.finditer(r'<a href="https://store\.steampowered\.com/app/(\d+)/.*?</a>', d.get("results_html", ""), re.S):
        blk = m.group(0)
        name = re.search(r'<span class="title">(.*?)</span>', blk, re.S)
        rev = re.search(r'(\d+)% of the ([\d,]+) user reviews', html.unescape(blk))
        rel = re.search(r'search_released[^>]*>\s*([^<]*?)\s*<', blk)
        rows.append({
            "appid": int(m.group(1)),
            "name": html.unescape(name.group(1)).strip() if name else "?",
            "pct_positive": int(rev.group(1)) if rev else None,
            "reviews": int(rev.group(2).replace(",", "")) if rev else 0,
            "released": rel.group(1).strip() if rel else "",
        })
    return int(d.get("total_count", 0)), rows

def app_reviews(appid):
    raw = get(f"https://store.steampowered.com/appreviews/{appid}?json=1&language=all&purchase_type=all&num_per_page=0")
    try:
        s = json.loads(raw)["query_summary"]
        return s["total_positive"], s["total_negative"], s["review_score_desc"]
    except Exception:
        return None, None, None

def resolve(name):
    raw = get("https://store.steampowered.com/api/storesearch/?" + urllib.parse.urlencode({"term": name, "l": "english", "cc": "US"}))
    try:
        items = json.loads(raw).get("items", [])
    except Exception:
        return None, None
    for it in items:                                   # prefer exact (case-insens.) name match
        if it["name"].lower() == name.lower():
            return it["id"], it["name"]
    return (items[0]["id"], items[0]["name"]) if items else (None, None)

# ---------------------------------------------------------------------------
# 1) QUERIES per concept: (label, term, tags)
# ---------------------------------------------------------------------------
CONCEPT_QUERIES = {
  "G1 Kernel Architect (infra / system-design sim)": [
      ("tag Programming",                    "", ("Programming",)),
      ("tag Programming + Automation",       "", ("Programming", "Automation")),
      ("tag Programming + Management",       "", ("Programming", "Management")),
      ("tag Programming + Tower Defense",    "", ("Programming", "Tower Defense")),
      ("tag Hacking + Management",           "", ("Hacking", "Management")),
      ("kw 'data center'",                   "data center", ()),
      ("kw 'network' + tag Simulation",      "network", ("Simulation",)),
      ("kw 'devops OR cloud OR server' (cloud)", "cloud", ("Simulation",)),
      ("kw 'system design'",                 "system design", ()),
      ("kw 'devops'",                        "devops", ()),
      ("kw 'kubernetes'",                    "kubernetes", ()),
      ("kw 'sysadmin'",                      "sysadmin", ()),
      ("kw 'load balancer'",                 "load balancer", ()),
      ("kw 'microservices'",                 "microservices", ()),
      ("kw 'server admin'",                  "server administrator", ()),
  ],
  "G2 Lexer & Scope (BA / requirements puzzle)": [
      ("kw 'business analyst'",              "business analyst", ()),
      ("kw 'requirements'",                  "requirements", ()),
      ("kw 'scrum'",                         "scrum", ()),
      ("kw 'project manager'",               "project manager", ()),
      ("tag Programming + Puzzle + Logic",   "", ("Programming", "Puzzle", "Logic")),
      ("tag Job Simulator + Programming",    "", ("Job Simulator", "Programming")),
  ],
  "G3 Heisenbug Hunter (QA / bug-hunt)": [
      ("kw 'QA tester'",                     "QA tester", ()),
      ("kw 'bug hunter'",                    "bug hunter", ()),
      ("kw 'debug'",                         "debug", ()),
      ("kw 'glitch' + tag Detective",        "glitch", ("Detective",)),
      ("tag Programming + Detective",        "", ("Programming", "Detective")),
      ("tag Programming + Investigation",    "", ("Programming", "Investigation")),
      ("kw 'anomaly' (Exit-8-likes, adjacent)", "anomaly", ()),
      ("kw 'spot the difference'",           "spot the difference", ()),
  ],
  "G4 AST Archeology (ASCII / code roguelike)": [
      ("tag Roguelike",                      "", ("Roguelike",)),
      ("tag Roguelike + Text-Based",         "", ("Roguelike", "Text-Based")),
      ("tag Roguelike + Programming",        "", ("Roguelike", "Programming")),
      ("tag Roguelike + Hacking",            "", ("Roguelike", "Hacking")),
      ("kw 'ASCII'",                         "ascii", ()),
      ("tag Roguelike + Pixel Graphics",     "", ("Roguelike", "Pixel Graphics")),
  ],
  "Reference: genre-wide": [
      ("tag Programming (all)",              "", ("Programming",)),
      ("tag Automation (all)",               "", ("Automation",)),
      ("tag Roguelite (all)",                "", ("Roguelite",)),
  ],
}

def main():
    summary_rows, top_rows = [], []
    for concept, qs in CONCEPT_QUERIES.items():
        print("\n==", concept)
        for label, term, tags in qs:
            total, rows = steam_search(term=term, tags=tags, count=100)
            time.sleep(2.2)
            rv = [r for r in rows if r["reviews"]]
            n500  = sum(1 for r in rv if r["reviews"] >= 500)
            n1000 = sum(1 for r in rv if r["reviews"] >= 1000)
            n5000 = sum(1 for r in rv if r["reviews"] >= 5000)
            # quality of the established titles (>=500 reviews)
            est = [r["pct_positive"] for r in rv if r["reviews"] >= 500 and r["pct_positive"] is not None]
            med = sorted(est)[len(est)//2] if est else None
            rv = sorted(rv, key=lambda r: r["reviews"], reverse=True)   # Steam's own sort is by rating, not count
            top1 = rv[0] if rv else None
            summary_rows.append({
                "concept": concept, "query": label, "steam_total_games": total,
                "top100_with_500plus_reviews": n500, "top100_with_1000plus": n1000, "top100_with_5000plus": n5000,
                "median_pct_positive_of_established": med,
                "top_title": top1["name"] if top1 else "", "top_title_reviews": top1["reviews"] if top1 else 0,
            })
            for rank, r in enumerate(rv[:15], 1):
                top_rows.append({"concept": concept, "query": label, "rank": rank, **r})
            print(f"  {label:<42} total={total:<6} 500+rev={n500:<3} 1k+={n1000:<3} 5k+={n5000:<3} med%pos={med} top={top1['name'] if top1 else '-'} ({top1['reviews'] if top1 else 0})")
    for fn, rows in (("steam_query_summary.csv", summary_rows), ("steam_top_titles_by_query.csv", top_rows)):
        with open(OUT / fn, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    print("\nwrote", OUT / "steam_query_summary.csv", "and steam_top_titles_by_query.csv")

if __name__ == "__main__":
    main()
