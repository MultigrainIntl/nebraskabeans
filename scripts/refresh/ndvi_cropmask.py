#!/usr/bin/env python3
"""
Satellite greenness sampled ONLY where USDA says the beans are.

GAJ's correction, and it is the right one. The first test represented an entire state's crop
with a single 2 km square, which for Michigan or Montana may have been photographing corn. For
the four states this site covers there is a county-by-county crop map, so the satellite can be
sampled over the 2,027 cells the Cropland Data Layer identifies as dry beans instead of over
one arbitrary point.

Source is Crop-CASMA, the service already wired into the site — daily, 250 m, back to 2000. It
is in EPSG:5070 Albers metres, not degrees, which is why every earlier request bounced. The
GISit repository has carried a note saying this layer was "broken — wrong projection" for
months; this is that fix.

CAVEAT, stated rather than buried: the crop mask is the 2025 Cropland Data Layer applied to
every year back to 2000. Bean ground moves. In irrigated valleys it moves slowly, but a 2003
reading is being taken where beans grow now, not necessarily where they grew then.
"""
import io, json, math, os, sys, time, urllib.request
from collections import defaultdict

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WCS = ("https://cloud.csiss.gmu.edu/smap_server/cgi-bin/mapserv?SERVICE=WCS&VERSION=2.0.1"
       "&REQUEST=GetCoverage&MAP=/WMS/NDVI-DAILY_%d.map&COVERAGEID=NDVI-DAILY_%s"
       "&FORMAT=image/tiff&SUBSET=x(%d,%d)&SUBSET=y(%d,%d)")
CACHE = os.path.join(HERE, "..", "..", "assets", "data", "archive", "casma-region-cache")
ARCHIVE = os.path.join(HERE, "..", "..", "assets", "data", "archive", "canopy-history.json")
OUT = ARCHIVE
PAUSE = 1.2
STATE_OF = {"ne-panhandle": "Nebraska", "sw-nebraska": "Nebraska", "ne-colorado": "Colorado",
            "western-colorado": "Colorado", "se-wyoming": "Wyoming", "big-horn": "Wyoming",
            "nw-kansas": "Kansas"}

# --- EPSG:5070 Albers Equal Area, GRS80 --------------------------------------------------
A, F = 6378137.0, 1 / 298.257222101
E2 = 2 * F - F * F
E = math.sqrt(E2)


def _q(phi):
    s = math.sin(phi)
    return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * math.log((1 - E * s) / (1 + E * s)))


_p0, _l0 = math.radians(23.0), math.radians(-96.0)
_p1, _p2 = math.radians(29.5), math.radians(45.5)
_m1 = math.cos(_p1) / math.sqrt(1 - E2 * math.sin(_p1) ** 2)
_m2 = math.cos(_p2) / math.sqrt(1 - E2 * math.sin(_p2) ** 2)
_n = (_m1 * _m1 - _m2 * _m2) / (_q(_p2) - _q(_p1))
_C = _m1 * _m1 + _n * _q(_p1)
_rho0 = A * math.sqrt(_C - _n * _q(_p0)) / _n


def albers(lon, lat):
    rho = A * math.sqrt(_C - _n * _q(math.radians(lat))) / _n
    th = _n * (math.radians(lon) - _l0)
    return rho * math.sin(th), _rho0 - rho * math.cos(th)


# --- bean cells, grouped into a few compact boxes ----------------------------------------
def boxes():
    d = json.load(open(os.path.join(HERE, "..", "..", "assets", "data",
                                    "growing-regions.json")))
    by = defaultdict(list)
    for f in d["features"]:
        p = f["properties"]
        by[p["region"]].append((p["ix"] * 0.03, p["iy"] * 0.03, float(p.get("a", 0) or 0)))
    groups = {"high-plains": ["ne-panhandle", "se-wyoming", "ne-colorado"],
              "south-plains": ["sw-nebraska", "nw-kansas"],
              "big-horn": ["big-horn"],
              "western-colorado": ["western-colorado"]}
    out = {}
    for name, regions in groups.items():
        pts = [(lon, lat, ac, r) for r in regions for lon, lat, ac in by[r]]
        xs = [albers(p[0], p[1]) for p in pts]
        pad = 3000
        out[name] = {
            "x": (int(min(x for x, _ in xs)) - pad, int(max(x for x, _ in xs)) + pad),
            "y": (int(min(y for _, y in xs)) - pad, int(max(y for _, y in xs)) + pad),
            "cells": [{"x": x, "y": y, "acres": p[2], "region": p[3]}
                      for p, (x, y) in zip(pts, xs)],
        }
    return out


def fetch_sample(box, name, year, mmdd):
    """Download, sample at the bean cells, keep the numbers and discard the image.

    Caching the rasters would be five gigabytes of imagery to produce a few thousand numbers,
    and a re-run would have to re-read all of it. The sample is what has evidential value."""
    path = os.path.join(CACHE, "%s_%d%s.json" % (name, year, mmdd.replace(".", "")))
    if os.path.exists(path):
        got = json.load(open(path))
        return got or None
    url = WCS % (year, "%d.%s" % (year, mmdd), box["x"][0], box["x"][1], box["y"][0], box["y"][1])
    try:
        raw = urllib.request.urlopen(url, timeout=240).read()
    except Exception:
        raw = b""
    time.sleep(PAUSE)
    got = None
    if raw[:4] in (b"II*\x00", b"MM\x00*"):
        try:
            got = sample(raw, box)
        except Exception:
            got = None
    os.makedirs(CACHE, exist_ok=True)
    json.dump(got or {}, open(path, "w"))
    return got


def sample(raw, box):
    """Read the raster at the bean cells and report EACH REGION separately.

    The download boxes group neighbouring regions to keep the request count down, but a box
    spans state lines — the high-plains box covers the Nebraska Panhandle, south-east Wyoming
    and north-east Colorado. Reporting a box figure against a state yield would blend three
    states' crops into one number. Each region is broken out and aggregated to its state later.
    """
    img = np.array(Image.open(io.BytesIO(raw))).astype(float)
    h, w = img.shape[:2]
    x0, x1 = box["x"]; y0, y1 = box["y"]
    per = defaultdict(lambda: {"v": [], "w": []})
    for c in box["cells"]:
        col = int((c["x"] - x0) / (x1 - x0) * (w - 1))
        row = int((y1 - c["y"]) / (y1 - y0) * (h - 1))       # raster rows run north to south
        if 0 <= col < w and 0 <= row < h:
            v = img[row, col]
            if 0 < v < 255:
                per[c["region"]]["v"].append(v)
                per[c["region"]]["w"].append(max(c["acres"], 0.01))
    out = {}
    for region, d in per.items():
        if len(d["v"]) < 15:
            continue
        v = np.array(d["v"]); wt = np.array(d["w"])
        order = np.argsort(v)
        v, wt = v[order], wt[order]
        cum = np.cumsum(wt) / wt.sum()
        out[region] = {"n": len(v),
                       "mean": round(float((v * wt).sum() / wt.sum()), 2),
                       "median": round(float(v[np.searchsorted(cum, 0.5)]), 2),
                       "p90": round(float(v[np.searchsorted(cum, 0.9)]), 2)}
    return out or None


def main():
    bx = boxes()
    for k, b in bx.items():
        print("  %-18s %4d bean cells  x %d..%d  y %d..%d"
              % (k, len(b["cells"]), b["x"][0], b["x"][1], b["y"][0], b["y"][1]), file=sys.stderr)
    dates = ["%02d.%02d" % (m, d) for m in range(4, 10) for d in (5, 15, 25)]
    years = range(2000, 2027)

    # START FROM WHAT IS ALREADY ON RECORD.
    # Satellite history does not change. Re-fetching 2000-2025 every morning to learn one new
    # day is what made the first scheduled run hit its ninety-minute ceiling and get killed
    # before it published anything. The accumulated record is committed to the repository, and
    # only dates missing from it are fetched — a few each morning instead of two thousand.
    out = defaultdict(dict)
    already = set()
    if os.path.exists(ARCHIVE):
        try:
            prior = json.load(open(ARCHIVE))["observations"]
            for k, v in prior.items():
                out[k].update(v)
            already = set(prior)
            print("  %d dates already on record" % len(already), file=sys.stderr)
        except Exception as e:
            print("  archive unreadable (%s) — rebuilding in full" % str(e)[:40], file=sys.stderr)

    for year in years:
        got = skipped = 0
        for mmdd in dates:
            key = "%d-%s" % (year, mmdd.replace(".", "-"))
            if key in already:
                skipped += 1
                continue                       # the past does not change
            for name, b in bx.items():
                s = fetch_sample(b, name, year, mmdd)
                if s:
                    out[key].update(s)
                    got += 1
        if got or not skipped:
            print("  %d: %d new box-dates (%d already held)" % (year, got, skipped),
                  file=sys.stderr)
        json.dump({"schema": "gisit.ndvi-cropmask.v1",
                   "source": {"name": "USDA Crop-CASMA daily NDVI via WCS",
                              "projection": "EPSG:5070",
                              "note": "the layer the GISit repo records as broken on a "
                                      "projection error; the fix is lon/lat to Albers metres"},
                   "mask": "USDA Cropland Data Layer class 42 dry beans, 2025, 0.03 degree cells",
                   "unit": "one entry per growing REGION, acreage-weighted across its bean cells",
                   "caveat": "the 2025 crop mask is applied to every year back to 2000",
                   "scaling": "8-bit digital number, undocumented by the service; monotonic in "
                              "greenness, which is all a model needs",
                   "observations": out}, open(OUT, "w"), separators=(",", ":"))
    print("\n%d dates -> %s" % (len(out), OUT), file=sys.stderr)


if __name__ == "__main__":
    main()
