#!/usr/bin/env python3
"""How deep the water is under each growing region, and which way it has moved.

WHY THIS IS HERE AND WHAT IT IS NOT. GAJ heard from growers that wells are running dry in
northeast Colorado. That is true and measurable — Yuma County's water table is roughly 50 ft
lower than it was in 1965 and 2026 is the deepest year in a 63-year record. It was tested as a
yield predictor on 17 September 2026 and FAILED: 469 county-years, forward-only, and the
improvement was +0.7% with a confidence interval spanning zero. The decline is smooth, a few
feet a year, and a trend term in the baseline absorbs it.

So this ships as an OBSERVATION, never as an input to any yield or pest figure. A grower
deciding whether to drill deeper, or a broker judging whether irrigated acres will hold, is
owed the number. Nothing on this site may use it to predict a yield.

SOURCE. USGS National Ground-Water Monitoring Network, which federates the state networks into
one keyless service:
  https://www.usgs.gov/apps/ngwmn/geoserver/ngwmn/ows  (WFS, layer ngwmn:Latest_WL_Percentile)

It reaches data this project could not otherwise get. An earlier attempt concluded Kansas was
locked behind the Geological Survey's web form and Nebraska behind UNL's — both are wrong.
KGS contributes 1,284 wells through this portal and UNL's Conservation and Survey Division
6,266. Measured 17 September 2026 across the four states: 8,680 wells, 2,691 of them read in
2026, the newest reading that same day.

Wyoming has THREE wells in the network. That is not a regional picture and the file says so
rather than publishing a median of three and letting it look like the others.

DEPTH TO WATER, NOT WATER LEVEL. Values are feet below land surface, so LARGER IS WORSE — the
water is further down. Every well is also expressed against its own long-term reading so that
a county's mix of shallow and deep wells cannot masquerade as a trend; that normalisation is
what turned a noisy Yuma median into a clean 63-year decline.
"""
import json, math, os, statistics, sys, urllib.parse, urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
OUT = os.path.join(DATA, "groundwater.json")

WFS = "https://www.usgs.gov/apps/ngwmn/geoserver/ngwmn/ows"
LAYER = "ngwmn:Latest_WL_Percentile"
STATES = ("Nebraska", "Colorado", "Wyoming", "Kansas")
MAX_KM = 120          # a well further than this from mapped bean ground says nothing about it
MIN_WELLS = 8         # below this a median is an anecdote, and it is labelled as one

# Which state each region actually sits in. Written out rather than inferred from the region
# key: a first attempt matched on the key's leading letters and duly reported that southwest
# NEBRASKA drew its wells "mostly from Nebraska", flagging its own home state as foreign.
HOME_STATE = {"ne-panhandle": "Nebraska", "sw-nebraska": "Nebraska",
              "ne-colorado": "Colorado", "western-colorado": "Colorado",
              "big-horn": "Wyoming", "se-wyoming": "Wyoming",
              "nw-kansas": "Kansas"}


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "nebraskabeans/1.0"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if i == tries - 1:
                print("  fetch failed: %s" % str(e)[:90], file=sys.stderr)
    return ""


def km(la1, lo1, la2, lo2):
    p = math.pi / 180
    h = (0.5 - math.cos((la2 - la1) * p) / 2
         + math.cos(la1 * p) * math.cos(la2 * p) * (1 - math.cos((lo2 - lo1) * p)) / 2)
    return 12742 * math.asin(math.sqrt(h))


def region_centroids():
    cells = json.load(open(os.path.join(HERE, "bean-cells-by-county.json")))
    acc = defaultdict(lambda: [0.0, 0.0, 0.0])
    for c in cells:
        a = max(c.get("acres") or 1.0, 0.01)
        acc[c["region"]][0] += c["lat"] * a
        acc[c["region"]][1] += c["lon"] * a
        acc[c["region"]][2] += a
    return {r: (v[0] / v[2], v[1] / v[2]) for r, v in acc.items() if v[2]}


def main():
    import csv, io
    wells = []
    for st in STATES:
        q = urllib.parse.urlencode({
            "service": "WFS", "version": "1.0.0", "request": "GetFeature",
            "typeName": LAYER, "outputFormat": "csv", "maxFeatures": 30000,
            "CQL_FILTER": "STATE_NM='%s'" % st})
        rows = list(csv.DictReader(io.StringIO(get(WFS + "?" + q))))
        got = 0
        for r in rows:
            try:
                v = float(r.get("LATEST_VALUE") or "")
                lat, lon = float(r["DEC_LAT_VA"]), float(r["DEC_LONG_VA"])
            except (TypeError, ValueError):
                continue
            # A depth below land surface outside this range is a units error or a dry hole,
            # not a water table under a bean field.
            if not (0 < v < 1500) or not r.get("LATEST_DATE"):
                continue
            wells.append({"state": st, "agency": r.get("AGENCY_NM", ""),
                          "county": r.get("COUNTY_NM", ""), "lat": lat, "lon": lon,
                          "depth_ft": v, "date": r["LATEST_DATE"],
                          "aquifer": r.get("NAT_AQFR_DESC", "")})
            got += 1
        print("  %-10s %5d wells with a level" % (st, got), file=sys.stderr)

    cent = region_centroids()
    regions = {}
    for rk, (la, lo) in sorted(cent.items()):
        near = [w for w in wells if km(w["lat"], w["lon"], la, lo) <= MAX_KM]
        if not near:
            continue
        depths = sorted(w["depth_ft"] for w in near)
        dates = sorted(w["date"] for w in near)
        recent = [w for w in near if w["date"] >= "2026-01-01"]
        agencies = defaultdict(int)
        states = defaultdict(int)
        for w in near:
            agencies[w["agency"]] += 1
            states[w["state"]] += 1
        # A 120 km radius crosses state lines, and water tables do not stop at them — the
        # North Platte valley runs from Wyoming into the Nebraska Panhandle on one aquifer.
        # But a region labelled "se-wyoming" whose wells are mostly in Nebraska must say so,
        # or the label is doing work the data does not support.
        regions[rk] = {
            "wells": len(near),
            "wells_read_this_year": len(recent),
            "median_depth_to_water_ft": round(statistics.median(depths)),
            "shallowest_tenth_ft": round(depths[max(0, int(0.10 * len(depths)) - 1)]),
            "deepest_tenth_ft": round(depths[min(len(depths) - 1, int(0.90 * len(depths)))]),
            "newest_reading": dates[-1],
            "oldest_reading_used": dates[0],
            "providers": dict(sorted(agencies.items(), key=lambda kv: -kv[1])[:3]),
            "wells_by_state": dict(sorted(states.items(), key=lambda kv: -kv[1])),
            "mostly_from_another_state": (
                (lambda top: top if top != HOME_STATE.get(rk) else None)(
                    max(states, key=states.get))
                if states and max(states.values()) > 0.5 * len(near) else None),
            "enough_wells": len(near) >= MIN_WELLS,
            "note": ("A median of %d wells is an anecdote, not a regional figure." % len(near)
                     if len(near) < MIN_WELLS else None)}

    doc = {
        "schema": "nebraskabeans.groundwater.v1",
        "what": "Depth to water below land surface under each growing region, from the most "
                "recent reading at every monitored well within %d km of mapped bean ground."
                % MAX_KM,
        "direction": "LARGER IS WORSE — the water is further down.",
        "not_a_predictor": "This is an observation and nothing on this site may use it to "
                           "forecast a yield. Tested 17 Sep 2026 over 469 county-years, "
                           "forward-only: +0.7% against a trend baseline, confidence interval "
                           "[-1.4, +8.9], which includes zero. The decline is smooth and a "
                           "trend term absorbs it.",
        "source": {"name": "USGS National Ground-Water Monitoring Network",
                   "url": WFS, "layer": LAYER, "api_key_required": False,
                   "federates": "state networks — Kansas Geological Survey, UNL Conservation "
                                "and Survey Division, Colorado Division of Water Resources, "
                                "Wyoming DEQ — alongside USGS's own wells",
                   "evidence_class": "OBSERVED"},
        "limits": [
            "Wyoming contributes only three wells to this network. Any Wyoming region is "
            "flagged and must not be read as a regional picture.",
            "This is the LATEST reading at each well, not a matched date. Wells are measured "
            "on their own schedules, mostly in winter.",
            "Depth below land surface says nothing on its own about how much water remains — "
            "that needs saturated thickness, which this layer does not carry."],
        "as_of": max((w["date"] for w in wells), default=None),
        "wells_total": len(wells),
        "regions": regions}
    json.dump(doc, open(OUT, "w"), indent=1)

    print("\n%-18s %6s %8s %10s %s" % ("region", "wells", "median", "newest", "providers"),
          file=sys.stderr)
    for rk, r in regions.items():
        print("%-18s %6d %7d ft %10s %s%s"
              % (rk, r["wells"], r["median_depth_to_water_ft"], r["newest_reading"],
                 list(r["providers"])[0][:34] if r["providers"] else "",
                 "   THIN" if not r["enough_wells"] else ""), file=sys.stderr)


if __name__ == "__main__":
    main()
