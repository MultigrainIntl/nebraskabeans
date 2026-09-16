#!/usr/bin/env python3
"""
Satellite greenness for chickpeas, lentils and peas — on their OWN crop pixels.

What this replaces: one sample point per county, computed as the average of the county
outline's vertices. That point could be a town, a reservoir, rangeland or another crop, and for
a concave county need not lie inside the county at all. Every chickpea, lentil and pea number
on the site was built on it. An independent review in September 2026 named it a critical
defect, and it was the worst thing in the pipeline.

It now works exactly the way the dry beans have worked since GAJ caught the equivalent error
there: pulse_cells.py maps every 30 m Cropland Data Layer pixel of class 51, 52 or 53 onto the
same 0.03 degree grid, and this reads Crop-CASMA at those cells, acreage-weighted, per region.

The grid reconciles against USDA's own county acreage: 20,072 mapped chickpea acres against
USDA's reported 20,423, and 38,810 pea acres against 41,008. That agreement is the check that
the pixels are where USDA says the crop is.

Cloud and empty scenes are flagged, not averaged in. A flat floor across every cell is not a
bare field, it is nothing at all, and scoring it as bare ground cost the crop a week of growth
every time it happened.
"""
import io, json, os, sys, time, urllib.request
from collections import defaultdict

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
CACHE = os.path.join(DATA, "archive", "casma-pulse-cache")
OUT = os.path.join(DATA, "archive", "canopy-pulses.json")
CELLS = os.path.join(DATA, "pulse-regions.json")

WCS = ("https://cloud.csiss.gmu.edu/smap_server/cgi-bin/mapserv?SERVICE=WCS&VERSION=2.0.1"
       "&REQUEST=GetCoverage&MAP=/WMS/NDVI-DAILY_%d.map&COVERAGEID=NDVI-DAILY_%s"
       "&FORMAT=image/tiff&SUBSET=x(%d,%d)&SUBSET=y(%d,%d)")
PAUSE = 1.2
CELL_DEG = 0.03
MIN_CELLS = 8          # below this the regional figure is a handful of pixels, not a signal

sys.path.insert(0, HERE)
from ndvi_cropmask import albers          # one projection, defined once


MAX_SPAN_M = 450_000     # the service answers a box this size; peas at 1,122 km never did


def boxes():
    """Download boxes per commodity, split so no single request is too large to answer.

    Peas are mapped across 73 counties spanning 1,122 km. Asked for in one box the service
    returned nothing, every date, every year — and the empty answer was cached, so the failure
    became permanent and silent. Chickpeas, in a 302 km box, worked fine throughout. The
    difference was the request size, not the crop.
    """
    src = json.load(open(CELLS))
    out = {}
    for com, cells in src["commodities"].items():
        pts = []
        for c in cells:
            lon, lat = c["ix"] * CELL_DEG, c["iy"] * CELL_DEG
            x, y = albers(lon, lat)
            pts.append({"x": x, "y": y, "acres": c["a"], "region": c["region"]})
        if not pts:
            continue
        # group by region first — a region never straddles more than one box, so no box
        # spans state lines and no regional figure is blended out of two requests
        by_region = defaultdict(list)
        for p in pts:
            by_region[p["region"]].append(p)

        groups, current = [], []
        for region in sorted(by_region, key=lambda r: min(p["x"] for p in by_region[r])):
            trial = current + by_region[region]
            span_x = max(p["x"] for p in trial) - min(p["x"] for p in trial)
            span_y = max(p["y"] for p in trial) - min(p["y"] for p in trial)
            if current and (span_x > MAX_SPAN_M or span_y > MAX_SPAN_M):
                groups.append(current)
                current = list(by_region[region])
            else:
                current = trial
        if current:
            groups.append(current)

        pad = 3000
        for i, g in enumerate(groups):
            out["%s#%d" % (com, i)] = {
                "commodity": com,
                "x": (int(min(p["x"] for p in g)) - pad, int(max(p["x"] for p in g)) + pad),
                "y": (int(min(p["y"] for p in g)) - pad, int(max(p["y"] for p in g)) + pad),
                "cells": g,
            }
    return out


def fetch(box, key, year, mmdd):
    # Keyed by the SUB-BOX, not the commodity. Peas are fetched in five boxes; with the crop
    # name alone every box shared one cache file, so the first box wrote western Colorado and
    # the other four read it straight back. Nine years of pea history for five regions went
    # into a single slot and looked like a successful download.
    path = os.path.join(CACHE, "%s_%d%s.json"
                        % (key.replace("#", "_").replace(" ", "").lower(), year,
                           mmdd.replace(".", "")))
    if os.path.exists(path):
        got = json.load(open(path))
        return got or None
    url = WCS % (year, "%d.%s" % (year, mmdd), box["x"][0], box["x"][1], box["y"][0], box["y"][1])
    try:
        raw = urllib.request.urlopen(url, timeout=240).read()
    except Exception:
        raw = b""
    time.sleep(PAUSE)
    if raw[:2] not in (b"II", b"MM"):
        # The service did not return a raster. That is a FAILURE, not an observation of bare
        # ground, and caching it would make one timeout permanent. Every historical pea date
        # was lost this way. Leave no file; the next run asks again.
        return None
    try:
        got = sample(raw, box)
    except Exception:
        return None
    os.makedirs(CACHE, exist_ok=True)
    json.dump(got or {}, open(path, "w"))
    return got


def sample(raw, box):
    """Read the raster at this commodity's own pixels, acreage-weighted, per region."""
    img = np.array(Image.open(io.BytesIO(raw))).astype(float)
    h, w = img.shape[:2]
    x0, x1 = box["x"]; y0, y1 = box["y"]
    per = defaultdict(lambda: {"v": [], "w": []})
    for c in box["cells"]:
        col = int((c["x"] - x0) / (x1 - x0) * (w - 1))
        row = int((y1 - c["y"]) / (y1 - y0) * (h - 1))      # raster rows run north to south
        if 0 <= col < w and 0 <= row < h:
            v = img[row, col]
            if 0 < v < 255:
                per[c["region"]]["v"].append(v)
                per[c["region"]]["w"].append(max(c["acres"], 0.01))
    out = {}
    for region, d in per.items():
        if len(d["v"]) < MIN_CELLS:
            continue
        v = np.array(d["v"]); wt = np.array(d["w"])
        order = np.argsort(v)
        v, wt = v[order], wt[order]
        cum = np.cumsum(wt) / wt.sum()
        row = {"n": len(v),
               "mean": round(float((v * wt).sum() / wt.sum()), 2),
               "median": round(float(v[np.searchsorted(cum, 0.5)]), 2),
               "p90": round(float(v[np.searchsorted(cum, 0.9)]), 2)}
        # cloud or empty scene: flat on the floor with no spread across the whole crop
        if row["median"] <= 130 and (row["p90"] - row["median"]) < 10:
            row["q"] = "suspect"
        out[region] = row
    return out or None


def main():
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    dates = ["%02d.%02d" % (m, d) for m in range(4, 11) for d in (5, 15, 25)]
    bx = boxes()

    prior = {}
    if os.path.exists(OUT):
        try:
            prior = json.load(open(OUT)).get("commodities", {})
        except Exception:
            prior = {}

    # every year already on record, per commodity; only this year's dates are fetched
    held = {}
    for com, blk in prior.items():
        # An earlier version sampled county centroids. That is not a weaker version of this
        # measurement, it is a different and wrong one, so it is discarded rather than merged.
        held[com] = dict(blk.get("observations", {})) if blk.get("method") == "crop-pixel" else {}

    cells_of, acres_of, fetched = defaultdict(int), defaultdict(float), defaultdict(int)
    failed = defaultdict(int)
    for key, box in sorted(bx.items()):
        com = box["commodity"]
        got = held.setdefault(com, {})
        cells_of[com] += len(box["cells"])
        acres_of[com] += sum(c["acres"] for c in box["cells"])
        for mmdd in dates:
            k = "%d-%s" % (year, mmdd.replace(".", "-"))
            # a sub-box contributes its own regions to this date; another may already have
            # contributed others, so merge rather than replace
            if k in got and all(r in got[k] for r in {c["region"] for c in box["cells"]}):
                continue
            s = fetch(box, key, year, mmdd)
            if s:
                got.setdefault(k, {}).update(s)
                fetched[com] += 1
            else:
                failed[com] += 1

    out = {}
    for com, got in held.items():
        this_year = {k: v for k, v in got.items() if k.startswith(str(year))}
        good = sum(1 for d in got.values() for r in d.values() if r.get("q") != "suspect")
        out[com] = {"cells": cells_of.get(com, 0), "acres": round(acres_of.get(com, 0)),
                    "method": "crop-pixel", "observations": got}
        print("  %-10s %5d cells, %6d acres | %3d dates held, %2d this year, "
              "%d reads this run, %d failed | %d clean region-readings"
              % (com, cells_of.get(com, 0), acres_of.get(com, 0), len(got), len(this_year),
                 fetched.get(com, 0), failed.get(com, 0), good), file=sys.stderr)

    json.dump({"schema": "gisit.ndvi-pulses.v2", "year": year,
               "method": "Crop-CASMA NDVI sampled on each commodity's own Cropland Data Layer "
                         "pixels, acreage-weighted per growing region. Commodities spanning "
                         "more than 450 km are requested in several boxes split on region "
                         "boundaries, because the service silently refuses a request much "
                         "larger and the refusal used to be cached as an observation.",
               "replaces": "one point per county taken as the average of the county outline — "
                           "a location that could be town, rangeland or another crop. Named a "
                           "critical defect by independent review, September 2026.",
               "cell_source": CELLS,
               "commodities": out}, open(OUT, "w"), separators=(",", ":"))
    print("\nwrote %s" % OUT, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
