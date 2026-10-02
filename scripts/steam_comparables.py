#!/usr/bin/env python3
"""
steam_comparables.py - exact review counts + owner-estimate ranges for hand-picked comparables.
Writes data/comparables.csv. Review counts are a PROXY for demand; SteamSpy owner ranges are rough.
"""
import csv, json, sys, time, urllib.parse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from steam_probe import get, resolve, app_reviews, OUT

COMPS = {
 "G1 infra / automation / system-design adjacent": [
   "Data Center", "Data Center Simulator Game", "Tower Networking Inc", "Hacknet", "Bitburner", "Turing Complete",
   "The Farmer Was Replaced", "Screeps: World", "Kaizen: A Factory Story", "Mini Metro", "Factorio", "Software Inc.",
   "COLD AISLE: Data Center Tycoon", "Silicon Sprint: Data Center Incremental", "Anomaly Jobs : Data Center",
 ],
 "G2 analyst / requirements / bureaucracy-puzzle adjacent": [
   "Database Detective: Minor Crimes Division", "Papers, Please", "Return of the Obra Dinn", "The Case of the Golden Idol",
   "Orwell: Keeping an Eye On You", "Hypnospace Outlaw",
 ],
 "G3 QA / bug-hunt / anomaly adjacent": [
   "QA Simulator", "The Exit 8", "I'm on Observation Duty", "That's Not My Neighbor", "No, I'm Not a Human",
   "Shinkansen 0", "Keep Talking and Nobody Explodes", "Please, Don't Touch Anything",
 ],
 "G4 ASCII / code roguelike": [
   "Dwarf Fortress", "Caves of Qud", "Cogmind", "Brogue CE", "NET.CRAWL", "Warsim: The Realm of Aslona", "Hack 'n' Slash",
 ],
}

def steamspy(appid):
    raw = get(f"https://steamspy.com/api.php?request=appdetails&appid={appid}")
    try:
        d = json.loads(raw)
        return d.get("owners", ""), d.get("median_forever", 0), d.get("price", ""), d.get("developer", "")
    except Exception:
        return "", 0, "", ""

def release_and_price(appid):
    raw = get(f"https://store.steampowered.com/api/appdetails?appids={appid}&cc=us&l=english")
    try:
        d = json.loads(raw)[str(appid)]["data"]
        price = d.get("price_overview", {}).get("initial_formatted") or d.get("price_overview", {}).get("final_formatted") or ("Free" if d.get("is_free") else "")
        return d.get("release_date", {}).get("date", ""), price
    except Exception:
        return "", ""

rows = []
for concept, names in COMPS.items():
    print("\n==", concept)
    for n in names:
        appid, found = resolve(n)
        time.sleep(0.4)
        if not appid:
            print(f"  {n:<45} NOT FOUND"); continue
        pos, neg, desc = app_reviews(appid); time.sleep(0.4)
        rel, price = release_and_price(appid); time.sleep(0.4)
        owners, med, _, dev = steamspy(appid); time.sleep(1.1)
        tot = (pos or 0) + (neg or 0)
        pct = round(100 * pos / tot) if tot else None
        rows.append({"concept": concept, "query_name": n, "steam_name": found, "appid": appid, "developer": dev,
                     "released": rel, "price": price, "reviews": tot, "pct_positive": pct, "rating": desc,
                     "steamspy_owners": owners, "median_playtime_min": med})
        flag = "" if found.lower().startswith(n.lower()[:10]) else "   <-- CHECK NAME MATCH"
        print(f"  {found[:44]:<45} id={appid:<8} reviews={tot:<7} {str(pct)+'%':<5} {desc or '':<24} owners={owners}{flag}")

with open(OUT / "comparables.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print("\nwrote", OUT / "comparables.csv")
