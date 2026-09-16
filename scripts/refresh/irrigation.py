#!/usr/bin/env python3
"""
How much of the ground each crop grows on is irrigated.

WHY THIS EXISTS. "We cannot see irrigation" was the first line of every caveat on this site,
and it is the first question an agronomist asks, because in the Panhandle it is the difference
between a 1,400 lb crop and a 2,800 lb one. Saying it repeatedly is not the same as measuring
it. Nothing in the pipeline used irrigation as an input; the word appeared only in prose.

THE SOURCE. USGS MIrAD-US: irrigated agriculture across the lower 48, built from MODIS against
the Census of Agriculture, 250 m, peer reviewed (doi:10.3390/land10040394, and earlier
doi:10.1016/j.agsy.2014.01.004). Downloads without a key or an account, which is the rule every
other source here follows.

WHAT IT IS AND IS NOT. The raster is binary: a 250 m cell either is or is not irrigated
agriculture. Sampling it over the cells where a crop grows gives the share of THAT GROUND which
is irrigated. It does NOT say which bean acres are watered. A cell can be 60% irrigated while
every bean field in it is dryland. That distinction is kept in the field names and in the text
this file writes, because blurring it would replace an honest unknown with a false measurement.

THE VINTAGE IS 2017 AND THE PAGE SAYS SO. It is published roughly every five years, so it is
not news. Centre pivots are capital and move slowly, which is why a nine-year-old layer is
still worth having, but it is stated rather than buried.

PROJECTION. US National Atlas Equal Area: Lambert azimuthal equal area, centred 100 W 45 N, on
a sphere of radius 6370997 m -- taken from the dataset's own metadata, not assumed. This is NOT
the Albers projection the CDL work uses, and using that here would have put every sample in the
wrong place by tens of kilometres.
"""
import json, math, os, sys, urllib.request, zipfile, io

import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
CACHE = os.path.join(DATA, "archive", "mirad")
OUT = os.path.join(DATA, "irrigation.json")

ITEM = "5db08e84e4b0b0c58b56e04f"
CATALOG = "https://www.sciencebase.gov/catalog/item/%s?format=json" % ITEM
WANT = "mirad250m_17v4.zip"
YEAR = 2017

R = 6370997.0            # sphere, from the metadata
LON0, LAT0 = -100.0, 45.0
NAMES = {"ne-panhandle": "Nebraska Panhandle", "sw-nebraska": "Southwest Nebraska",
         "ne-colorado": "Northeast Colorado", "western-colorado": "Western Colorado",
         "se-wyoming": "Southeast Wyoming", "big-horn": "Big Horn Basin",
         "nw-kansas": "Northwest Kansas"}


def laea(lon, lat):
    """Lon/lat to US National Atlas Equal Area metres."""
    p, l = math.radians(lat), math.radians(lon - LON0)
    p0 = math.radians(LAT0)
    denom = 1 + math.sin(p0) * math.sin(p) + math.cos(p0) * math.cos(p) * math.cos(l)
    if denom <= 0:
        return None
    k = math.sqrt(2.0 / denom)
    return (R * k * math.cos(p) * math.sin(l),
            R * k * (math.cos(p0) * math.sin(p) - math.sin(p0) * math.cos(p) * math.cos(l)))


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    local = os.path.join(CACHE, WANT)
    if os.path.exists(local) and os.path.getsize(local) > 1_000_000:
        return local
    with urllib.request.urlopen(CATALOG, timeout=120) as r:
        meta = json.load(r)
    url = next((f["url"] for f in meta.get("files", []) if f.get("name") == WANT), None)
    if not url:
        print("%s is no longer listed in the ScienceBase item" % WANT, file=sys.stderr)
        return None
    print("  downloading %s ..." % WANT, file=sys.stderr)
    open(local, "wb").write(urllib.request.urlopen(url, timeout=300).read())
    return local


def load(local):
    z = zipfile.ZipFile(local)
    tif = next(n for n in z.namelist() if n.endswith(".tif"))
    tfw = next(n for n in z.namelist() if n.endswith(".tfw"))
    w = [float(v) for v in z.read(tfw).decode().split()]
    px, py, ox, oy = w[0], w[3], w[4], w[5]
    arr = np.array(Image.open(io.BytesIO(z.read(tif))))
    return arr, px, py, ox, oy


def cells():
    """Every crop's own ground, as 0.03 degree cells carrying their acreage."""
    out = {}
    g = json.load(open(os.path.join(DATA, "growing-regions.json")))
    step = g.get("cell_deg", 0.03)
    out["DRY BEANS"] = [(f["properties"]["ix"], f["properties"]["iy"],
                         f["properties"].get("a", 0), f["properties"]["region"])
                        for f in g["features"] if f["properties"].get("region") in NAMES]
    p = json.load(open(os.path.join(DATA, "pulse-regions.json")))
    for com, rows in p.get("commodities", {}).items():
        keep = [(c["ix"], c["iy"], c.get("a", 0), c["region"])
                for c in rows if c.get("region") in NAMES]
        if keep:
            out[com] = keep
    return out, step


def sample(arr, px, py, ox, oy, ix, iy, step):
    """Share of one 0.03 degree cell that is irrigated agriculture.

    The cell is about 3 km across and the raster is 250 m, so a cell holds on the order of a
    hundred pixels. Reading the whole block and averaging is the measurement; reading a single
    centre pixel would turn a 40% irrigated cell into a coin toss.
    """
    lon0, lat0 = ix * step, iy * step
    xs, ys = [], []
    for dlon, dlat in ((0, 0), (step, 0), (0, step), (step, step)):
        q = laea(lon0 + dlon, lat0 + dlat)
        if q is None:
            return None
        xs.append(q[0]); ys.append(q[1])
    c0 = int((min(xs) - ox) / px); c1 = int((max(xs) - ox) / px)
    r0 = int((oy - max(ys)) / -py); r1 = int((oy - min(ys)) / -py)
    r0, r1 = sorted((max(0, r0), min(arr.shape[0], r1 + 1)))
    c0, c1 = sorted((max(0, c0), min(arr.shape[1], c1 + 1)))
    if r1 <= r0 or c1 <= c0:
        return None
    block = arr[r0:r1, c0:c1]
    valid = block != 255                      # 255 is NoData per the metadata
    if not valid.any():
        return None
    return float((block[valid] == 1).mean()), int(valid.sum())


def main():
    local = fetch()
    if not local:
        return 1
    arr, px, py, ox, oy = load(local)

    # Reconcile the whole raster against USDA before trusting any slice of it. The Census of
    # Agriculture puts US irrigated land in the middle 50 millions; a total far outside that
    # would mean the file or the reader is wrong, and every regional number would be wrong too.
    tot_px = int((arr == 1).sum())
    tot_acres = tot_px * 250 * 250 / 4046.8564224
    print("CONUS irrigated: %.1f million acres (USDA Census of Agriculture: about 55-58M)"
          % (tot_acres / 1e6), file=sys.stderr)
    if not (45e6 < tot_acres < 70e6):
        print("  that is outside the plausible range -- refusing to write", file=sys.stderr)
        return 1

    crops, step = cells()
    out = {}
    for crop, rows in sorted(crops.items()):
        by_region = {}
        for ix, iy, acres, region in rows:
            got = sample(arr, px, py, ox, oy, ix, iy, step)
            if got is None:
                continue
            share, n = got
            b = by_region.setdefault(region, {"w": 0.0, "wa": 0.0, "cells": 0, "px": 0})
            w = max(acres, 0.0)
            b["w"] += w; b["wa"] += w * share; b["cells"] += 1; b["px"] += n
        block = {}
        for region, b in by_region.items():
            if b["w"] <= 0 or b["cells"] < 3:
                continue
            block[region] = {
                "name": NAMES[region],
                "irrigated_share_of_ground": round(100 * b["wa"] / b["w"], 1),
                "cells": b["cells"],
                "raster_pixels_read": b["px"],
                "crop_acres_weighting": round(b["w"], 1)}
        if block:
            out[crop] = block

    if not out:
        print("no region produced a sample -- refusing to write", file=sys.stderr)
        return 1

    json.dump({
        "schema": "gisit.irrigation.v1",
        "what": "share of the ground each crop grows on that is irrigated agriculture",
        "crop_year_of_layer": YEAR,
        "vintage_note": "MIrAD-US is published about every five years; %d is the newest "
                        "release. Centre pivots are capital and move slowly, so the layer is "
                        "still useful, but it is not this season's irrigation." % YEAR,
        "read_this_carefully":
            "This is the share of the GROUND that is irrigated agriculture, not the share of "
            "this crop that is watered. A cell can be 60% irrigated while every bean field in "
            "it is dryland. The two are related and they are not the same, and this file will "
            "not pretend otherwise.",
        "conus_irrigated_acres": int(tot_acres),
        "reconciled_against": "USDA Census of Agriculture, which puts US irrigated land at "
                              "roughly 55-58 million acres",
        "source": {"name": "USGS MIrAD-US, MODIS Irrigated Agriculture, 250 m",
                   "item": "https://www.sciencebase.gov/catalog/item/%s" % ITEM,
                   "papers": ["doi:10.3390/land10040394",
                              "doi:10.1016/j.agsy.2014.01.004",
                              "doi:10.3390/rs2102388"],
                   "projection": "US National Atlas Equal Area (Lambert azimuthal equal area, "
                                 "100W 45N, sphere r=6370997 m), per the dataset metadata",
                   "api_key_required": False},
        "crops": out,
    }, open(OUT, "w"), indent=1)

    print("\n%-12s %-22s %8s %7s" % ("crop", "region", "irrig%", "cells"), file=sys.stderr)
    for crop, block in out.items():
        for region, b in sorted(block.items(), key=lambda kv: -kv[1]["irrigated_share_of_ground"]):
            print("%-12s %-22s %7.1f%% %7d"
                  % (crop, b["name"], b["irrigated_share_of_ground"], b["cells"]), file=sys.stderr)
    print("\nwrote %s" % os.path.relpath(OUT), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
