#!/usr/bin/env python3
"""
Canopy for chickpeas, lentils and dry peas — on their own ground, not on the beans'.

Until now every pulse class read the dry-bean canopy, because that was the only footprint
sampled. Pulses go in the ground in April and are finished by July; beans go in in June. A
chickpea was therefore being scored on a field that was bare soil while it was growing, which
is why every pulse row came out implausibly low.

USDA maps chickpeas, lentils and peas separately. Their county acreage is already in
county-crops.geojson, so each commodity gets sampled where it actually grows, acreage-weighted,
the same way the beans are.
"""
import io, json, os, sys, time, urllib.request
from collections import defaultdict

import numpy as np
from PIL import Image

import ndvi_cropmask as M

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "..", "..", "assets", "data", "archive", "casma-pulse-cache")
OUT = os.path.join(HERE, "..", "..", "assets", "data", "archive", "canopy-pulses.json")
COMMODITIES = ["CHICKPEAS", "LENTILS", "PEAS"]
DATES = ["%02d.%02d" % (m, d) for m in range(3, 10) for d in (5, 15, 25)]
MIN_ACRES = 40


def county_points():
    """One point per county that grows the commodity, carrying its acreage."""
    src = json.load(open(os.path.join(HERE, "..", "..", "assets", "data",
                                      "county-crops.geojson")))
    out = defaultdict(list)
    for f in src["features"]:
        p = f["properties"]
        g = f["geometry"]
        rings = g["coordinates"] if g["type"] == "Polygon" else [r for poly in g["coordinates"]
                                                                for r in poly]
        ring = max(rings, key=len)
        lon = sum(c[0] for c in ring) / len(ring)
        lat = sum(c[1] for c in ring) / len(ring)
        for com in COMMODITIES:
            ac = p["acres"].get(com, 0)
            if ac >= MIN_ACRES:
                out[com].append({"lon": round(lon, 4), "lat": round(lat, 4), "acres": ac,
                                 "county": p["county"], "state": p["state"],
                                 "region": p["region"]})
    return out


def fetch(box, tag, year, mmdd):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "%s_%d%s.json" % (tag, year, mmdd.replace(".", "")))
    if os.path.exists(path):
        return json.load(open(path)) or None
    url = M.WCS % (year, "%d.%s" % (year, mmdd), box["x"][0], box["x"][1],
                   box["y"][0], box["y"][1])
    try:
        raw = urllib.request.urlopen(url, timeout=300).read()
    except Exception:
        raw = b""
    time.sleep(1.1)
    got = None
    if raw[:4] in (b"II*\x00", b"MM\x00*"):
        try:
            img = np.array(Image.open(io.BytesIO(raw))).astype(float)
            h, w = img.shape[:2]
            x0, x1 = box["x"]; y0, y1 = box["y"]
            per = defaultdict(lambda: {"v": [], "w": []})
            for c in box["cells"]:
                col = int((c["x"] - x0) / (x1 - x0) * (w - 1))
                row = int((y1 - c["y"]) / (y1 - y0) * (h - 1))
                if 0 <= col < w and 0 <= row < h:
                    v = img[row, col]
                    if 0 < v < 255:
                        per[c["region"]]["v"].append(v)
                        per[c["region"]]["w"].append(max(c["acres"], 0.01))
            got = {}
            for region, d in per.items():
                if len(d["v"]) < 2:
                    continue
                v = np.array(d["v"]); wt = np.array(d["w"])
                got[region] = round(float((v * wt).sum() / wt.sum()), 2)
            got = got or None
        except Exception:
            got = None
    json.dump(got or {}, open(path, "w"))
    return got


def main():
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    pts = county_points()
    out = {}
    for com in COMMODITIES:
        cs = pts.get(com, [])
        if not cs:
            print("  %-10s no counties above %d acres" % (com, MIN_ACRES), file=sys.stderr)
            continue
        xy = [M.albers(c["lon"], c["lat"]) for c in cs]
        pad = 6000
        box = {"x": (int(min(x for x, _ in xy)) - pad, int(max(x for x, _ in xy)) + pad),
               "y": (int(min(y for _, y in xy)) - pad, int(max(y for _, y in xy)) + pad),
               "cells": [{"x": x, "y": y, "acres": c["acres"], "region": c["region"]}
                         for c, (x, y) in zip(cs, xy)]}
        # Only fetch dates not already on record.
        got = {}
        if os.path.exists(OUT):
            try:
                got = json.load(open(OUT))["commodities"].get(com, {}).get("observations", {})
            except Exception:
                got = {}
        for mmdd in DATES:
            key = "%d-%s" % (year, mmdd.replace(".", "-"))
            if key in got:
                continue
            s = fetch(box, com, year, mmdd)
            if s:
                got[key] = s
        out[com] = {"counties": len(cs),
                    "acres": round(sum(c["acres"] for c in cs)),
                    "observations": got}
        print("  %-10s %3d counties, %6d acres, %2d dates"
              % (com, len(cs), sum(c["acres"] for c in cs), len(got)), file=sys.stderr)
    json.dump({"schema": "gisit.ndvi-pulses.v1", "year": year,
               "note": "canopy sampled on each commodity's OWN USDA ground, acreage-weighted; "
                       "pulses previously borrowed the dry-bean canopy and were scored on a "
                       "field that was bare while they were growing",
               "commodities": out}, open(OUT, "w"), separators=(",", ":"))
    print("\nwrote %s" % OUT, file=sys.stderr)


if __name__ == "__main__":
    main()
