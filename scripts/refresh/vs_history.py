#!/usr/bin/env python3
"""
Where the crop stands RIGHT NOW against every year since 2000, on bean ground only.

This is not a forecast and does not wait on USDA. Every number in it is final the moment it is
observed: a satellite pass at 250 m over the cells the Cropland Data Layer calls dry beans.

The reason this replaces the yield model: USDA moved Nebraska's 2026 planted acres from 101,000
in March to 80,000 in August — a 21% revision inside one season — and has published no 2026
state yield at all for Nebraska, Colorado, Wyoming or Kansas. A tool built to predict that
number is built on something that arrives late and then changes. A tool built on what the
satellite saw on Tuesday is built on something that never moves.
"""
import json, os, re, glob
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "assets", "data", "crop-vs-history.json")
NAMES = {"ne-panhandle": "Nebraska Panhandle", "sw-nebraska": "Southwest Nebraska",
         "ne-colorado": "Northeast Colorado", "western-colorado": "Western Colorado",
         "se-wyoming": "Southeast Wyoming", "big-horn": "Big Horn Basin",
         "nw-kansas": "Northwest Kansas"}

src = os.path.join(HERE, "ndvi-cropmask.json")
if not os.path.exists(src):
    raise SystemExit("ndvi-cropmask.json missing — run ndvi_cropmask.py first")
obs = json.load(open(src))["observations"]
for f in glob.glob(os.path.join(HERE, "casma-region-cache", "*_2026*.json")):
    d = json.load(open(f))
    if not d:
        continue
    m = re.search(r"_(\d{4})(\d{2})(\d{2})\.json$", f)
    if m:
        obs.setdefault("%s-%s-%s" % m.groups(), {}).update(d)

by = defaultdict(lambda: defaultdict(dict))          # region -> mm-dd -> year -> value
for key, regions in obs.items():
    year, mm, dd = key.split("-")
    for r, s in regions.items():
        if r in NAMES:
            by[r]["%s-%s" % (mm, dd)][int(year)] = s["mean"]

out = {}
for r, dates in by.items():
    series = {}
    for md, years in sorted(dates.items()):
        hist = sorted(v for y, v in years.items() if y < 2026)
        if len(hist) < 10:
            continue
        row = {"n_years": len(hist),
               "min": round(hist[0], 1), "max": round(hist[-1], 1),
               "mean": round(sum(hist) / len(hist), 1),
               "p20": round(hist[int(len(hist) * 0.2)], 1),
               "p80": round(hist[int(len(hist) * 0.8)], 1)}
        if 2026 in years:
            cur = years[2026]
            row["now"] = round(cur, 1)
            row["vs_mean_pct"] = round(100 * (cur - row["mean"]) / row["mean"], 1)
            row["rank"] = sum(1 for v in hist if v < cur) + 1
            row["of"] = len(hist) + 1
        series[md] = row
    if series:
        out[r] = {"name": NAMES[r], "dates": series}

latest = max((md for v in out.values() for md, r in v["dates"].items() if "now" in r),
             default=None)
json.dump({
    "schema": "gisit.crop-vs-history.v1",
    "what": "greenness on dry-bean ground, this season against every season since 2000",
    "latest_observation": latest,
    "not_a_forecast": "This is an observation, not a prediction. Nothing here waits on USDA, "
                      "and nothing here is revised: a satellite pass is final when it lands.",
    "why_not_usda": "USDA moved Nebraska's 2026 planted acres from 101,000 in March to 80,000 "
                    "in August, and has published no 2026 state yield for any of these states.",
    "source": {"name": "USDA Crop-CASMA daily NDVI, 250 m, EPSG:5070",
               "mask": "USDA Cropland Data Layer class 42 dry beans",
               "cells": 2027, "api_key_required": False},
    "caveat": "the 2025 crop mask is applied to earlier years; bean ground moves slowly but it "
              "does move. The 8-bit values are monotonic in greenness; the service does not "
              "document their scaling, so they are compared, never quoted as an NDVI value.",
    "regions": out,
}, open(OUT, "w"), separators=(",", ":"))

print("latest observation:", latest)
for r, v in sorted(out.items(), key=lambda kv: -(kv[1]["dates"].get(latest, {}).get("rank") or 0)):
    row = v["dates"].get(latest)
    if row and "now" in row:
        print("  %-22s rank %2d/%-2d  %+5.1f%% vs normal" %
              (v["name"], row["rank"], row["of"], row["vs_mean_pct"]))
print("wrote", os.path.relpath(OUT))
