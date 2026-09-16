#!/usr/bin/env python3
"""
Where the chickpeas, lentils and peas actually are — on their own USDA pixels.

Dry beans have had this since GAJ caught the single-point-per-state error: a 0.03 degree grid
built from Cropland Data Layer class 42, so the satellite is read over bean ground instead of
over an arbitrary point. The pulses never got it. Until now they were sampled at ONE point per
county, computed as the average of the county outline's vertices — a location that can be a
town, a reservoir, rangeland, or another crop entirely, and for a concave county need not lie
inside the county at all. An independent review named this as a critical defect, and it was.

This builds the pulse equivalent from the same authority:

  CropScape returns a Cropland Data Layer raster clipped to one county, keyless, as a 30 m
  GeoTIFF in EPSG:5070 Albers metres. Every pixel of class 51 (chickpeas), 52 (lentils) or
  53 (dry peas) is converted to longitude and latitude and binned onto the same 0.03 degree
  grid the beans use, carrying the acreage those pixels represent.

The output is consumed by pulse_canopy.py, which samples Crop-CASMA at these cells exactly the
way ndvi_cropmask.py samples the bean cells.

CAVEAT, stated rather than buried: this is the 2024 crop year applied to 2026. Pulse ground
moves more than bean ground does, because pulses sit in rotation. A cell here is where the crop
was mapped in 2024, not a claim about where it is planted this season.
"""
import json, math, os, sys, time, urllib.request
from collections import defaultdict

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
CACHE = os.path.join(DATA, "archive", "cdl-county-cache")
OUT = os.path.join(DATA, "pulse-regions.json")

CDL_YEAR = 2024
STAT = "https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLFile?year=%d&fips=%s"
CLASSES = {"CHICKPEAS": 51, "LENTILS": 52, "PEAS": 53}
CELL_DEG = 0.03
PIXEL_ACRES = 30.0 * 30.0 / 4046.8564224     # a 30 m CDL pixel
MIN_COUNTY_ACRES = 40                        # the threshold county-crops.geojson already uses
MIN_CELL_ACRES = 2                           # the threshold the bean grid uses
PAUSE = 1.1

# --- EPSG:5070 Albers Equal Area, GRS80 — the same constants the bean grid was built on ---
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
_qp = _q(math.pi / 2)


def inverse_albers(x, y):
    """Albers metres back to longitude and latitude, by the standard authalic iteration."""
    rho = np.sqrt(x * x + (_rho0 - y) ** 2)
    theta = np.arctan2(x, _rho0 - y)
    q = (_C - (rho * _n / A) ** 2) / _n
    ratio = np.clip(q / _qp, -1.0, 1.0)
    phi = np.arcsin(ratio)                       # authalic latitude as the first guess
    for _ in range(6):
        s = np.sin(phi)
        c = np.cos(phi)
        d = 1 - E2 * s * s
        # guard the poles, where the correction term is undefined
        c = np.where(np.abs(c) < 1e-12, 1e-12, c)
        dphi = (d * d / (2 * c)) * (q / (1 - E2) - s / d
                                    + (1 / (2 * E)) * np.log((1 - E * s) / (1 + E * s)))
        phi = phi + dphi
    return np.degrees(theta / _n) + math.degrees(_l0), np.degrees(phi)


def counties():
    """Counties that grow each pulse, with the region they belong to."""
    src = json.load(open(os.path.join(DATA, "county-crops.geojson")))
    want = defaultdict(list)
    for f in src["features"]:
        p = f["properties"]
        for com in CLASSES:
            if p["acres"].get(com, 0) >= MIN_COUNTY_ACRES:
                want[com].append({"fips": p["fips"], "county": p["county"],
                                  "state": p["state"], "region": p["region"],
                                  "reported_acres": p["acres"][com]})
    return want


def county_raster(fips):
    """The CDL clipped to one county. Cached — the 2024 crop year does not change."""
    path = os.path.join(CACHE, "CDL_%d_%s.tif" % (CDL_YEAR, fips))
    if os.path.exists(path) and os.path.getsize(path) > 1024:
        return path
    os.makedirs(CACHE, exist_ok=True)
    try:
        xml = urllib.request.urlopen(STAT % (CDL_YEAR, fips), timeout=120).read().decode()
    except Exception as e:
        print("  %s: service refused (%s)" % (fips, str(e)[:60]), file=sys.stderr)
        return None
    if "<returnURL>" not in xml:
        return None
    url = xml.split("<returnURL>")[1].split("</returnURL>")[0]
    time.sleep(PAUSE)
    try:
        raw = urllib.request.urlopen(url, timeout=240).read()
    except Exception as e:
        print("  %s: raster refused (%s)" % (fips, str(e)[:60]), file=sys.stderr)
        return None
    if len(raw) < 1024:
        return None
    open(path, "wb").write(raw)
    return path


def cells_in(path, class_value):
    """Every pixel of one CDL class, as (lon, lat) on the 0.03 degree grid."""
    im = Image.open(path)
    tags = im.tag_v2
    scale, tie = tags.get(33550), tags.get(33922)
    if not scale or not tie:
        return {}
    px, py = float(scale[0]), float(scale[1])
    x0, y0 = float(tie[3]), float(tie[4])
    arr = np.asarray(im)
    rows, cols = np.nonzero(arr == class_value)
    if not len(rows):
        return {}
    # pixel centres
    xs = x0 + (cols + 0.5) * px
    ys = y0 - (rows + 0.5) * py
    lon, lat = inverse_albers(xs, ys)
    ix = np.round(lon / CELL_DEG).astype(np.int64)
    iy = np.round(lat / CELL_DEG).astype(np.int64)
    out = defaultdict(float)
    for a, b in zip(ix.tolist(), iy.tolist()):
        out[(a, b)] += PIXEL_ACRES
    return out


def main():
    want = counties()
    grid = {com: defaultdict(lambda: {"acres": 0.0, "region": None}) for com in CLASSES}
    for com, cls in CLASSES.items():
        cs = want.get(com, [])
        cs.sort(key=lambda c: -c["reported_acres"])
        print("%s: %d counties at or above %d acres" % (com, len(cs), MIN_COUNTY_ACRES),
              file=sys.stderr)
        ok = miss = 0
        for i, c in enumerate(cs, 1):
            path = county_raster(c["fips"])
            if not path:
                miss += 1
                continue
            try:
                found = cells_in(path, cls)
            except Exception as e:
                print("  %s %s: unreadable (%s)" % (c["county"], c["state"], str(e)[:50]),
                      file=sys.stderr)
                miss += 1
                continue
            for key, acres in found.items():
                g = grid[com][key]
                g["acres"] += acres
                g["region"] = g["region"] or c["region"]
            ok += 1
            if i % 25 == 0:
                print("  %d/%d" % (i, len(cs)), file=sys.stderr)
        kept = {k: v for k, v in grid[com].items() if v["acres"] >= MIN_CELL_ACRES}
        grid[com] = kept
        print("  %d counties read, %d unavailable -> %d cells, %.0f acres"
              % (ok, miss, len(kept), sum(v["acres"] for v in kept.values())), file=sys.stderr)

    out = {"type": "PulseCellGrid", "cell_deg": CELL_DEG, "crop_year": CDL_YEAR,
           "source": {"name": "USDA Cropland Data Layer via CropScape, clipped per county",
                      "url": "https://nassgeodata.gmu.edu/CropInventory/",
                      "api_key_required": False,
                      "classes": CLASSES},
           "method": "every 30 m pixel of the class, binned to a 0.03 degree grid, cells with "
                     "at least %d mapped acres kept" % MIN_CELL_ACRES,
           "caveat": "the %d crop year applied to 2026. Pulses sit in rotation, so this is "
                     "where the crop was mapped, not where it is planted this season."
                     % CDL_YEAR,
           "replaces": "one point per county taken as the average of the county outline, which "
                       "could be town, rangeland or another crop — named as a critical defect "
                       "by independent review, September 2026",
           "commodities": {com: [{"ix": k[0], "iy": k[1], "a": round(v["acres"], 1),
                                  "region": v["region"]}
                                 for k, v in sorted(cells.items())]
                           for com, cells in grid.items()}}
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print("\nwrote %s" % OUT, file=sys.stderr)
    for com, cells in out["commodities"].items():
        by = defaultdict(float)
        for c in cells:
            by[c["region"]] += c["a"]
        print("  %-10s %5d cells  %s" % (com, len(cells),
              ", ".join("%s %.0f" % (r, a) for r, a in sorted(by.items(), key=lambda x: -x[1])[:4])),
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
