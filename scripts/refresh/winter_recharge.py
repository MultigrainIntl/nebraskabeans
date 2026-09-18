#!/usr/bin/env python3
"""The winter that fed this season, which the site could not see at all.

WHY THIS EXISTS. GAJ: "Last winter was one of the driest in recorded history." The site could
not have known. station-field.json opens on 15 MARCH — it carries no winter whatsoever, and
winter is exactly the stretch that recharges these aquifers and fills soil profiles before a
bean ever goes in the ground. Every water number published here is an effect; this is the
cause, and it was missing.

WHAT IT MEASURES. Total precipitation October through March, by region, against that region's
own ten previous winters. October to March because that is the recharge window on the High
Plains: the crop is off, evaporation is low, and what falls has a chance to reach the water
table rather than leave through a leaf.

IT IS AN OBSERVATION, NOT A PREDICTOR. Nothing here may feed a yield figure. Weather features
were tested against yield at state level on 15 September 2026 and at county level on 17
September with 20x the data, and failed both times. A dry winter is worth knowing on its own —
it is the reason a water table sits where it does — and that is the whole claim.

SOURCE: RCC-ACIS (NOAA cooperative and GHCN networks), the same keyless service the site
already uses for its growing-season weather. One call per region per winter.
"""
import json, os, statistics, sys, urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
OUT = os.path.join(DATA, "winter-recharge.json")
ACIS = "https://data.rcc-acis.org/MultiStnData"

# Which counties stand in for each region. Taken from the bean cells themselves rather than
# drawn by hand, so the weather is measured where the crop is.
MIN_STATIONS = 3
MIN_MONTHS = 5          # a winter missing two of its six months is not a winter
YEARS_BACK = 31         # this winter plus thirty to compare it against

# THIRTY, NOT TEN. A first run compared against ten previous winters and reported four regions
# at their driest. GAJ's claim was "one of the driest in RECORDED HISTORY", and ten years does
# not test that — a decade of dry winters would make an ordinary one look like a record. ACIS
# carries these stations back decades, the extra calls are cheap, and "driest in thirty years"
# either survives the longer window or it does not.


def acis(body):
    for _ in range(3):
        try:
            req = urllib.request.Request(ACIS, data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except Exception as e:
            err = str(e)[:80]
    print("  ACIS failed: %s" % err, file=sys.stderr)
    return {}


def region_counties():
    cells = json.load(open(os.path.join(HERE, "bean-cells-by-county.json")))
    acres = defaultdict(lambda: defaultdict(float))
    for c in cells:
        if c.get("fips"):
            acres[c["region"]][c["fips"]] += max(c.get("acres") or 0.0, 0.01)
    # the counties carrying most of the crop, not every county with a stray pixel
    out = {}
    for rk, d in acres.items():
        ranked = sorted(d.items(), key=lambda kv: -kv[1])
        out[rk] = [f for f, _ in ranked[:6]]
    return out


def winter_totals(fips_list, start_year, end_year):
    """Oct-Mar precipitation per winter, averaged across stations, per county then pooled.

    A winter is LABELLED by the year it ends in: the winter of 2025-26 is '2026', because
    that is the season it feeds.
    """
    per_winter = defaultdict(list)
    for fips in fips_list:
        d = acis({"county": fips,
                  "sdate": "%d-10" % (start_year - 1), "edate": "%d-03" % end_year,
                  "elems": [{"name": "pcpn", "interval": "mly", "duration": "mly",
                             "reduce": "sum"}],
                  "meta": ["name"]})
        for s in (d.get("data") or []):
            rows = s.get("data") or []
            # months run consecutively from October of start_year-1
            for i, cell in enumerate(rows):
                y = (start_year - 1) + (i + 9) // 12
                m = ((i + 9) % 12) + 1
                if m not in (10, 11, 12, 1, 2, 3):
                    continue
                winter = y + 1 if m >= 10 else y
                v = cell[0] if isinstance(cell, list) else cell
                try:
                    val = 0.0 if v in ("T", "S") else float(v)
                except (TypeError, ValueError):
                    continue
                per_winter[(s["meta"]["name"], winter)].append(val)
    # a station-winter needs most of its months; then pool stations
    by_winter = defaultdict(list)
    for (name, winter), months in per_winter.items():
        if len(months) >= MIN_MONTHS:
            by_winter[winter].append(sum(months))
    return {w: v for w, v in by_winter.items() if len(v) >= MIN_STATIONS}


def main():
    counties = region_counties()
    this_winter = 2026
    regions = {}
    for rk, fips in sorted(counties.items()):
        totals = winter_totals(fips, this_winter - YEARS_BACK + 1, this_winter)
        if this_winter not in totals:
            print("  %-18s no usable winter" % rk, file=sys.stderr)
            continue
        now = statistics.mean(totals[this_winter])
        past = [statistics.mean(v) for w, v in totals.items()
                if w != this_winter and this_winter - YEARS_BACK < w < this_winter]
        if len(past) < 5:
            print("  %-18s too little history" % rk, file=sys.stderr)
            continue
        normal = statistics.mean(past)
        ranked = sorted(past + [now])
        rank = ranked.index(now) + 1
        regions[rk] = {
            "winter": "%d-%d" % (this_winter - 1, this_winter),
            "inches": round(now, 2),
            "normal_inches": round(normal, 2),
            "pct_of_normal": round(100 * now / normal) if normal else None,
            "rank": rank, "of_years": len(ranked),
            "driest_on_record_here": rank == 1,
            "stations": len(totals[this_winter]),
            "years_compared": sorted(w for w in totals if w != this_winter)}
        print("  %-18s %.2f in, %d%% of normal, rank %d of %d"
              % (rk, now, regions[rk]["pct_of_normal"], rank, len(ranked)), file=sys.stderr)

    doc = {
        "schema": "nebraskabeans.winter-recharge.v1",
        "what": "Total precipitation October through March — the recharge season — by region, "
                "against that region's own previous winters.",
        "why_october_to_march": "The crop is off, evaporation is low, and what falls has a "
                                "chance to reach the water table rather than leave through a "
                                "leaf. It is the stretch that fills the profile before a bean "
                                "goes in.",
        "not_a_predictor": "An observation. Weather features were tested against yield at "
                           "state level on 15 Sep 2026 and at county level on 17 Sep with 20x "
                           "the data, and failed both. This is the cause behind a water "
                           "table, not a forecast of a crop.",
        "source": {"name": "RCC-ACIS — NOAA cooperative and GHCN networks",
                   "url": ACIS, "api_key_required": False, "evidence_class": "OBSERVED"},
        "limits": [
            "A winter is labelled by the year it ENDS in: 2026 means October 2025 to March 2026.",
            "A station must report at least %d of the six months to count, and a region needs "
            "at least %d such stations." % (MIN_MONTHS, MIN_STATIONS),
            "Precipitation is measured where the gauges are, not where the snow drifted. "
            "Winter catch is the hardest measurement in this dataset — gauges under-catch "
            "snow in wind, and the High Plains has wind."],
        "as_of_winter": "%d-%d" % (this_winter - 1, this_winter),
        "regions": regions}
    json.dump(doc, open(OUT, "w"), indent=1)


if __name__ == "__main__":
    main()
