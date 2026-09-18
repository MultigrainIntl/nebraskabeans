#!/usr/bin/env python3
"""What the ground under each bean field is actually made of, and how it lies.

WHY THIS EXISTS. GAJ, 17 September 2026: "SOIL TYPE AND SLOPE MUST BE CONSIDERED." Until now
every water calculation on this site used ONE root-zone capacity, 120 millimetres, for all
seven regions — and that number was chosen by me, not read from anywhere. A Goshen silt loam
in southwest Nebraska and a Kim clay loam on a 3-to-10 percent Wyoming slope do not hold the
same water and do not shed the same rain, and pretending otherwise made every water figure on
the site a little bit fictional in a way no agronomist would have let pass.

WHAT IT MEASURES, per bean cell, from the soil survey that county agents and lenders already
use:
  - the soil map unit and its name ("Haverson fine sandy loam, rarely flooded")
  - available water capacity through the bean root zone, in millimetres, which is the real
    version of the number that was guessed
  - representative slope, in percent
  - drainage class

SOURCE: USDA NRCS Soil Data Access, the web service over SSURGO — the official soil survey of
the United States, surveyed on the ground, and the same data behind Web Soil Survey. No key, no
account. Anyone may rerun this and get the same answer, which is the point.

A LIMIT WORTH SAYING OUT LOUD. This is a point sample at the centre of each cell, and a cell
covers more ground than a point. Where a cell straddles two map units it takes the one under
its middle. Aggregated over hundreds of cells per region that is fair; for a single field it is
not, and nobody should read a region figure as their own field.
"""
import json, os, statistics, sys, time, urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "assets", "data", "soils.json")
SDA = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest"
BATCH = 100

# How deep a dry bean actually drinks from. Beans are shallow-rooted next to a corn or a sugar
# beet; the agronomy literature puts the effective rooting depth at 0.5-0.7 m, and FAO-56
# Table 22 gives 0.5-0.7 m for green and dry beans. 60 cm is the middle of that published
# range, not a number picked to be round.
ROOT_CM = 60


def sda(query, timeout=300):
    body = json.dumps({"query": query, "format": "JSON+COLUMNNAME"}).encode()
    req = urllib.request.Request(SDA, data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def rows_for(points):
    """One request for up to BATCH cells. Returns id -> soil facts.

    The dominant component of a map unit is the one covering most of it; its properties stand
    for the unit. Available water capacity is summed over the horizons that fall inside the
    root zone, with a horizon straddling the bottom counted only for the part above it.
    """
    vals = ",".join("(%d,'point(%.5f %.5f)')" % (i, lo, la) for i, lo, la in points)
    q = """
SELECT p.id, mu.mukey, mu.muname, c.compname, c.comppct_r, c.slope_r, c.drainagecl,
 (SELECT SUM(ch.awc_r * (CASE WHEN ch.hzdepb_r > %d THEN %d ELSE ch.hzdepb_r END
                         - ch.hzdept_r))
    FROM chorizon ch
   WHERE ch.cokey = c.cokey AND ch.hzdept_r < %d AND ch.awc_r IS NOT NULL) AS awc_cm
FROM (VALUES %s) AS p(id, wkt)
CROSS APPLY SDA_Get_Mukey_from_intersection_with_WktWgs84(p.wkt) AS k
JOIN mapunit mu ON mu.mukey = k.mukey
JOIN component c ON c.mukey = mu.mukey
WHERE c.majcompflag = 'Yes'
""" % (ROOT_CM, ROOT_CM, ROOT_CM, vals)
    d = sda(q)
    table = d.get("Table") or []
    if not table:
        return {}
    head = table[0]
    out = {}
    for row in table[1:]:
        r = dict(zip(head, row))
        i = int(r["id"])
        pct = float(r["comppct_r"] or 0)
        # keep the biggest major component for this point
        if i in out and out[i]["_pct"] >= pct:
            continue
        awc_cm = r.get("awc_cm")
        out[i] = {
            "_pct": pct,
            "mukey": r.get("mukey"),
            "soil": r.get("muname"),
            "component": r.get("compname"),
            "slope_pct": (float(r["slope_r"]) if r.get("slope_r") not in (None, "") else None),
            "drainage": r.get("drainagecl"),
            # awc_r is cm of water per cm of soil, summed over cm of horizon -> cm of water
            "awc_mm": (round(float(awc_cm) * 10, 1) if awc_cm not in (None, "") else None),
        }
    for v in out.values():
        v.pop("_pct", None)
    return out


def main():
    cells = json.load(open(os.path.join(HERE, "bean-cells-by-county.json")))
    got = {}
    for start in range(0, len(cells), BATCH):
        chunk = cells[start:start + BATCH]
        pts = [(start + j, c["lon"], c["lat"]) for j, c in enumerate(chunk)]
        for attempt in range(3):
            try:
                got.update(rows_for(pts))
                break
            except Exception as e:
                if attempt == 2:
                    print("  cells %d-%d FAILED %s" % (start, start + len(chunk), str(e)[:70]),
                          file=sys.stderr)
                time.sleep(3)
        print("  %d/%d cells" % (len(got), len(cells)), file=sys.stderr, end="\r", flush=True)
        time.sleep(0.4)
    print(file=sys.stderr)

    per_cell, by_region = [], defaultdict(lambda: {"awc": [], "slope": [], "soils":
                                                   defaultdict(float), "acres": 0.0,
                                                   "drainage": defaultdict(float)})
    for i, c in enumerate(cells):
        s = got.get(i)
        rec = {"lon": c["lon"], "lat": c["lat"], "region": c["region"],
               "acres": c["acres"], "county": c.get("county"), "state": c.get("state")}
        if s:
            rec.update(s)
        per_cell.append(rec)
        if not s:
            continue
        a = max(c["acres"], 0.01)
        b = by_region[c["region"]]
        b["acres"] += a
        if s.get("awc_mm") is not None:
            b["awc"].append((s["awc_mm"], a))
        if s.get("slope_pct") is not None:
            b["slope"].append((s["slope_pct"], a))
        if s.get("soil"):
            b["soils"][s["soil"]] += a
        if s.get("drainage"):
            b["drainage"][s["drainage"]] += a

    regions = {}
    for rk, b in by_region.items():
        def wmean(pairs):
            w = sum(x[1] for x in pairs)
            return round(sum(v * x for v, x in pairs) / w, 1) if w else None
        soils = sorted(b["soils"].items(), key=lambda kv: -kv[1])
        drain = sorted(b["drainage"].items(), key=lambda kv: -kv[1])
        regions[rk] = {
            "cells_with_soil": len(b["awc"]),
            "available_water_mm_root_zone": wmean(b["awc"]),
            "available_water_mm_spread": (round(statistics.pstdev([v for v, _ in b["awc"]]), 1)
                                          if len(b["awc"]) > 2 else None),
            "slope_pct_mean": wmean(b["slope"]),
            "slope_pct_max": (round(max(v for v, _ in b["slope"]), 1) if b["slope"] else None),
            "top_soils": [{"soil": n, "share_of_bean_acres_pct": round(100 * a / b["acres"], 1)}
                          for n, a in soils[:5]],
            "drainage": [{"class": n, "share_of_bean_acres_pct": round(100 * a / b["acres"], 1)}
                         for n, a in drain[:3]],
        }

    doc = {
        "schema": "nebraskabeans.soils.v1",
        "what": "Soil type, available water capacity through the bean root zone, slope and "
                "drainage, sampled at the centre of every bean cell and aggregated by region "
                "on bean acres.",
        "why": "Every water figure on this site used one invented root-zone capacity of 120 mm "
               "for all seven regions. These are the measured capacities instead, and the "
               "slopes that decide how much rain stays where it falls.",
        "root_zone_cm": ROOT_CM,
        "root_zone_source": "FAO-56 Table 22 gives 0.5-0.7 m effective rooting depth for green "
                            "and dry beans; 60 cm is the middle of that published range.",
        "source": {"name": "USDA NRCS Soil Data Access (SSURGO) — the official soil survey of "
                           "the United States, surveyed on the ground",
                   "url": SDA,
                   "web_version": "https://websoilsurvey.nrcs.usda.gov/",
                   "api_key_required": False,
                   "evidence_class": "OBSERVED"},
        "limits": [
            "A point sample at the centre of each cell. Where a cell straddles two map units "
            "it takes the one under its middle.",
            "The dominant major component of each map unit stands for the whole unit.",
            "A region figure is an average over hundreds of cells and is not anyone's field.",
            "Available water capacity is what the soil can hold, not what is in it today."],
        "cells": per_cell,
        "regions": regions}
    json.dump(doc, open(OUT, "w"), indent=1)
    for rk, v in sorted(regions.items()):
        print("  %-18s AWC %5s mm  slope %4s%%  %s"
              % (rk, v["available_water_mm_root_zone"], v["slope_pct_mean"],
                 (v["top_soils"][0]["soil"] if v["top_soils"] else "")[:44]), file=sys.stderr)


if __name__ == "__main__":
    main()
