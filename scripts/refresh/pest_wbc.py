#!/usr/bin/env python3
"""Western bean cutworm flight forecast, every region, every station.

WHY THIS IS DIFFERENT FROM EVERYTHING ELSE ON THIS SITE. The yield estimate has never beaten a
trend line — tested at state level on 15 Sep 2026 and at county level on 17 Sep, with weather,
satellite greenness and water-table depth, and it failed all seven state-by-state tests. This
does not, because the model is not ours. UNL Extension fitted it against field trap counts and
published it with confidence intervals. We accumulate heat and read their thresholds.

THE MODEL. Degree-days Fahrenheit, base 38 F, upper cutoff 75 F, accumulated from 1 March.
    DD_day = max( min( (Tmax + Tmin) / 2 , 75 ) - 38 , 0 )
Flight thresholds, with UNL's own 95% intervals:
    25% of moth flight — START SCOUTING   2,577  (2,416 - 2,749)
    50% of flight                         2,704  (2,577 - 2,838)
    75% of flight                         2,838  (2,660 - 3,027)
SOURCE: University of Nebraska-Lincoln Extension CropWatch, "Western Bean Cutworm Degree Day
Modeling" and "Degree-days for Prediction of Western Bean Cutworm Flight in 2025".

WHICH CUTOFF METHOD, AND HOW WE KNOW. A 75 F upper threshold can be applied two standard ways
and they differ by 700 DD here — more than the whole gap between 25% and 75% flight. Settled by
recomputing UNL's own published 2025 dates: capping the daily MEAN (horizontal) lands within
1-2 days of their Alliance figures and 4-5 days of Imperial; capping both endpoints first
(double) lands 10-14 days out. Horizontal it is. If UNL ever restates the method, this comment
is the thing to check first.

IT FORECASTS, IT DOES NOT ONLY EXPLAIN. Accumulate observed heat to today, then project
forward on this region's own 2015-2025 daily normals. Tested by standing on 1 June 2026 and
predicting the 25% date: Panhandle -1 day, southwest Nebraska 0, northeast Colorado +1,
southeast Wyoming -4. By 20 June: 0, 0, +1, -2. That is the first forward prediction on this
project that has worked.

WHAT THIS CANNOT DO, AND MUST NEVER CLAIM. It says WHEN moths should be flying. It cannot say
whether they are in your field, and it cannot say how bad it is. No satellite resolves a moth
or an egg mass. Presence and severity come from trap counts and from someone walking the rows,
which is exactly the ground truth this project does not yet have.
"""
import json, math, os, statistics, sys
from collections import defaultdict
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
ARCHIVE = os.path.join(DATA, "archive")
OUT = os.path.join(DATA, "pest-wbc-2026.json")

BASE_F, UPPER_F = 38.0, 75.0
THRESHOLDS = [("scouting_25pct", 2577, 2416, 2749),
              ("peak_50pct",     2704, 2577, 2838),
              ("late_75pct",     2838, 2660, 3027)]

# THE SPRAY WINDOW, AND WHY DRY BEANS ARE NOT CORN.
# UNL NebGuide G2013, "Western Bean Cutworm in Corn and Dry Beans" (Seymour, Hein & Wright,
# April 2010), states plainly: "Dry beans cannot be effectively scouted for western bean
# cutworm eggs or small larvae." The 5-8% of plants with egg masses that gets quoted for this
# pest is a CORN threshold and must never be shown against beans.
#
# The bean decision runs on two things instead:
#   WHEN — "If an insecticide treatment is required, the application should be made 10 to 21
#          days after the peak moth flight." Peak flight is the 50% mark this file already
#          computes, so the window falls straight out of the model.
#   WHETHER — a moth trap the grower runs. Cumulative catch at peak flight, milk jug trap:
#          under 700 low risk, 700-1,000 moderate, over 1,000 high. Nothing here can supply
#          that number. It is the one thing the model cannot know and a grower can.
#   AND AFTERWARDS — "If pod feeding is noticeable (0.5 to 1 percent or more pod damage), an
#          insecticide application should be considered."
SPRAY_AFTER_PEAK_DAYS = (10, 21)
TRAP_RISK_MILK_JUG = {"low_below": 700, "high_above": 1000}
MIN_DAYS = 150            # a station with less than this cannot carry a season total
MAX_KM = 160              # how far a station may be from a region's bean ground and still count
ELEV_TOLERANCE_M = 250    # how far ABOVE the crop a station may sit and still describe its heat

# DISTANCE IS NOT ENOUGH IN MOUNTAIN COUNTRY, and the first run proved it. Inside 160 km of the
# Big Horn Basin's bean ground there are 67 stations running from 1,170 m to 3,005 m, median
# 2,360 m — the beans are on the irrigated basin floor near 1,200 m, so most of those stations
# measure weather a kilometre above the crop. They never accumulate the heat the crop does, and
# the first run duly reported Big Horn scouting on 4 SEPTEMBER with 51 of 64 stations thrown out
# as outliers. When a filter discards most of its own input the answer it keeps is not a median,
# it is an accident. Western Colorado had the same shape: 1,404-3,536 m, median 2,322 m.
#
# The valley floor is taken as the 20th percentile of nearby station elevations — dry beans here
# are irrigated valley-bottom ground, so the low end of the local spread is the crop's ground.
# In flat country (the Panhandle runs 985-1,616 m) this keeps nearly every station; in mountains
# it keeps the valley and drops the peaks. A heuristic, said plainly, not a measurement.


def dd(hi, lo):
    return max(min((hi + lo) / 2.0, UPPER_F) - BASE_F, 0.0)


def km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (0.5 - math.cos((lat2 - lat1) * p) / 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2)
    return 12742 * math.asin(math.sqrt(a))


def region_centroids():
    """Where each region's beans actually are — not a box, the CDL cells themselves."""
    cells = json.load(open(os.path.join(HERE, "bean-cells-by-county.json")))
    acc = defaultdict(lambda: [0.0, 0.0, 0.0])
    for c in cells:
        a = c.get("acres") or 1.0
        acc[c["region"]][0] += c["lat"] * a
        acc[c["region"]][1] += c["lon"] * a
        acc[c["region"]][2] += a
    return {r: (v[0] / v[2], v[1] / v[2]) for r, v in acc.items() if v[2]}


def daily_normals():
    """Mean degree-days for each calendar day, per region, over 2015-2025.

    Used for the part of the season that has not happened yet. UNL does the same thing —
    their published table switches to long-term averages after about 20 June.
    """
    hist = json.load(open(os.path.join(ARCHIVE, "season-history.json")))["temperature"]
    out = {}
    for rk, blk in hist.items():
        by = defaultdict(list)
        for iso, v in blk.get("daily", {}).items():
            if v and v[0] is not None and v[1] is not None:
                by[iso[5:]].append(dd(v[0], v[1]))
        out[rk] = {k: statistics.mean(v) for k, v in by.items() if v}
    return out


def march_head_start(normals):
    """1-14 March, which station-field.json does not cover — it opens on the 15th.

    Small but real: 36-79 DD depending on region, about 1% of the scouting threshold, roughly
    one day. Estimated from the same normals rather than quietly treated as zero.
    """
    out = {}
    for rk, n in normals.items():
        out[rk] = sum(n.get("03-%02d" % d, 0.0) for d in range(1, 15))
    return out


def main():
    field = json.load(open(os.path.join(DATA, "station-field.json")))
    dates, stations = field["dates"], field["stations"]
    centroids, normals = region_centroids(), daily_normals()

    # valley floor per region, from the stations themselves
    near = defaultdict(list)
    for s0 in stations:
        if not s0.get("has_temp") or s0.get("elev_m") is None:
            continue
        for rk, (la, lo) in centroids.items():
            if km(s0["lat"], s0["lon"], la, lo) <= MAX_KM:
                near[rk].append(s0["elev_m"])
    valley_floor = {}
    for rk, els in near.items():
        els.sort()
        valley_floor[rk] = els[max(0, int(0.20 * len(els)) - 1)]
    head = march_head_start(normals)
    today = dates[-1]

    per_region = defaultdict(list)
    rejected = defaultdict(int)

    for s in stations:
        if not s.get("has_temp"):
            continue
        # nearest region whose bean ground is within reach
        best, bestd = None, 1e9
        for rk, (la, lo) in centroids.items():
            d = km(s["lat"], s["lon"], la, lo)
            if d < bestd:
                best, bestd = rk, d
        if bestd > MAX_KM:
            rejected["too far from any bean ground"] += 1
            continue
        floor = valley_floor.get(best)
        if floor is not None and s.get("elev_m") is not None and s["elev_m"] > floor + ELEV_TOLERANCE_M:
            rejected["more than %d m above the crop" % ELEV_TOLERANCE_M] += 1
            continue

        total, n, observed = head.get(best, 0.0), 0, {}
        for i, iso in enumerate(dates):
            hi, lo = s["hi"][i], s["lo"][i]
            if hi is None or lo is None:
                continue
            n += 1
            total += dd(hi, lo)
            for name, t, _, _ in THRESHOLDS:
                if name not in observed and total >= t:
                    observed[name] = iso
        if n < MIN_DAYS:
            rejected["fewer than %d days of temperature" % MIN_DAYS] += 1
            continue

        # project the rest of the season on this region's normals
        forecast, run, cur = {}, total, date.fromisoformat(today)
        norm = normals.get(best, {})
        while cur < date(2026, 11, 15) and len(forecast) < len(THRESHOLDS):
            cur += timedelta(days=1)
            run += norm.get(cur.isoformat()[5:], 0.0)
            for name, t, _, _ in THRESHOLDS:
                if name not in observed and name not in forecast and run >= t:
                    forecast[name] = cur.isoformat()

        per_region[best].append({"station": s["name"], "lat": s["lat"], "lon": s["lon"],
                                 "km_from_beans": round(bestd, 1), "dd_to_date": round(total),
                                 "days": n, "observed": observed, "forecast": forecast})

    # A station whose date sits far from its region's own median is reporting something the
    # rest of its neighbours are not. Flagged, counted, and left out of the headline — one bad
    # station painting an early date over real ground is exactly the kind of error that gets
    # believed because the map looks confident.
    regions = {}
    for rk, rows in sorted(per_region.items()):
        def day_of(r):
            d = r["observed"].get("scouting_25pct") or r["forecast"].get("scouting_25pct")
            return date.fromisoformat(d).timetuple().tm_yday if d else None
        days = [d for d in (day_of(r) for r in rows) if d]
        if not days:
            continue
        med = statistics.median(days)
        keep = [r for r in rows if day_of(r) and abs(day_of(r) - med) <= 21]
        drop = len(rows) - len(keep)
        out_marks = {}
        for name, t, lo_t, hi_t in THRESHOLDS:
            ds = sorted((r["observed"].get(name) or r["forecast"].get(name)) for r in keep
                        if (r["observed"].get(name) or r["forecast"].get(name)))
            if not ds:
                continue
            nobs = sum(1 for r in keep if name in r["observed"])
            out_marks[name] = {
                "median_date": ds[len(ds) // 2],
                "earliest_date": ds[0], "latest_date": ds[-1],
                "stations_reached": nobs, "stations_total": len(keep),
                "status": "observed" if nobs > len(keep) / 2 else "forecast",
                "threshold_dd": t, "threshold_dd_low": lo_t, "threshold_dd_high": hi_t}
        # the window, as dates, from the peak-flight mark this model already produces
        peak = (out_marks.get("peak_50pct") or {}).get("median_date")
        window = None
        if peak:
            pk = date.fromisoformat(peak)
            window = {
                "opens": (pk + timedelta(days=SPRAY_AFTER_PEAK_DAYS[0])).isoformat(),
                "closes": (pk + timedelta(days=SPRAY_AFTER_PEAK_DAYS[1])).isoformat(),
                "peak_flight": peak,
                "rule": "10 to 21 days after peak moth flight (UNL NebGuide G2013)",
                "conditional_on": "A trap count decides WHETHER to spray, not this model. "
                                  "Cumulative catch at peak flight in a milk jug trap: under "
                                  "700 low risk, 700-1,000 moderate, over 1,000 high.",
                "not_applicable": "The 5-8% egg-mass threshold is for CORN. UNL G2013: dry "
                                  "beans cannot be effectively scouted for eggs or small larvae."}
        regions[rk] = {
            "spray_window": window,
            "stations_used": len(keep), "stations_flagged_as_outliers": drop,
            "mean_dd_to_date": round(statistics.mean(r["dd_to_date"] for r in keep)),
            "marks": out_marks,
            "stations": sorted(keep, key=lambda r: r["km_from_beans"])[:40]}

    doc = {
        "schema": "nebraskabeans.pest-wbc.v1",
        "pest": "Western bean cutworm (Striacosta albicosta)",
        "what_this_is": "When moths should be flying, from accumulated heat. It does NOT say "
                        "whether they are in your field, and it does not say how bad it is. "
                        "That needs a trap count or someone walking the rows.",
        "model": {"base_f": BASE_F, "upper_cutoff_f": UPPER_F, "accumulate_from": "03-01",
                  "cutoff_method": "horizontal — the daily MEAN is capped at 75 F",
                  "method_evidence": "Recomputing UNL's published 2025 dates: horizontal lands "
                                     "1-2 days from their Alliance figures, double cutoff 10-14 "
                                     "days out."},
        "source": {"name": "University of Nebraska-Lincoln Extension, CropWatch",
                   "url": "https://cropwatch.unl.edu/western-bean-cutworm-degree-day-modeling/",
                   "evidence_class": "PUBLISHED — fitted by UNL against field trap counts, "
                                     "not by us", "api_key_required": False},
        "forecast_method": "Observed heat to date, then this region's own 2015-2025 daily "
                           "normals for the rest of the season. Backtested on 2026: standing "
                           "on 1 June the 25% date came out within 1 day in the Panhandle, "
                           "0 in southwest Nebraska, 1 in northeast Colorado and 4 in "
                           "southeast Wyoming.",
        "spray_decision": {
            "when": "10-21 days after peak moth flight — modelled here, per region",
            "whether": "a moth trap the grower runs. Milk jug trap, cumulative catch at peak "
                       "flight: <700 low risk, 700-1,000 moderate, >1,000 high. This site "
                       "cannot supply that number.",
            "after": "0.5-1% or more pod damage justifies considering an application",
            "source": "UNL NebGuide G2013, Seymour, Hein & Wright, April 2010"},
        "limits": [
            "Timing only. Presence and severity are not modelled and must not be inferred.",
            "1-14 March is estimated from normals because the station file opens on 15 March. "
            "That is 36-79 DD, about 1% of the scouting threshold.",
            "Stations more than %d km from mapped bean ground are excluded." % MAX_KM,
            "A station whose date sits more than 21 days from its region's median is treated "
            "as an outlier and left out of the headline figure."],
        "as_of": today, "generated_for_year": 2026,
        "stations_rejected": dict(rejected),
        "regions": regions}
    json.dump(doc, open(OUT, "w"), indent=1)

    print("western bean cutworm — %s" % today, file=sys.stderr)
    for rk, r in regions.items():
        m = r["marks"].get("scouting_25pct", {})
        print("  %-18s %3d stations  scouting %s (%s)  %s"
              % (rk, r["stations_used"], m.get("median_date", "—"), m.get("status", "—"),
                 "%d flagged" % r["stations_flagged_as_outliers"]
                 if r["stations_flagged_as_outliers"] else ""), file=sys.stderr)


if __name__ == "__main__":
    main()
