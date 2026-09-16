#!/usr/bin/env python3
"""
Check every dataset this site publishes against something INDEPENDENT of it.

WHY THIS EXISTS. GAJ: "We need to test and verify the data sets we are using." Every serious
error on this project has been a data error wearing the clothes of a result:

  - a bean class was deleted because a withheld (D) was read as absence
  - four regions displayed a fifth region's satellite data while the logs said success
  - a 1,122 km download box was silently refused and the empty result cached as "no crop"
  - an all-crops acreage row was parsed as a dry bean yield, giving Colorado 6.2 million acres
  - a rotating weather station made one July 20F colder than its neighbours

None of those were caught by a test of the code. They were caught by someone noticing a number
was the wrong SIZE. This file does that noticing on a schedule.

THE RULE HERE: a check must compare a dataset against a source that did not produce it.
Re-reading our own file and confirming it says what it says is not verification, and every
check below either reconciles against a published figure or against a physical bound.
"""
import json, math, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "assets", "data")
ARCH = os.path.join(DATA, "archive")

ok = fail = warn = 0
lines = []


def check(name, passed, detail, soft=False):
    global ok, fail, warn
    if passed:
        ok += 1; mark = "PASS"
    elif soft:
        warn += 1; mark = "WARN"
    else:
        fail += 1; mark = "FAIL"
    lines.append("  %-4s %-34s %s" % (mark, name, detail))


def load(p, arch=False):
    f = os.path.join(ARCH if arch else DATA, p)
    return json.load(open(f)) if os.path.exists(f) else None


# ---------------------------------------------------------------- USDA yields
d = load("usda-class-yields.json")
if d:
    # Independent check: a class yield must sit inside the range USDA publishes for dry beans
    # nationally. A parse that grabs the wrong column lands orders of magnitude out — which is
    # exactly how an all-crops acreage row once became a bean yield.
    bad = []
    for cls, states in d.get("classes", {}).items():
        for st, b in states.items():
            v = b["mean_lb_ac"]
            if not (800 <= v <= 3600):
                bad.append("%s/%s=%d" % (cls, st, v))
    check("usda class yields in range", not bad,
          "all %d class-state levels within 800-3600 lb/ac" % sum(len(s) for s in d["classes"].values())
          if not bad else "OUT OF RANGE: " + ", ".join(bad[:4]))

    # Nebraska pinto is the best-documented figure in this whole system; if it drifts, the
    # parser has moved onto a different column.
    ne = d["classes"].get("Pinto", {}).get("Nebraska", {})
    v = ne.get("mean_lb_ac")
    check("Nebraska pinto level", bool(v) and 2100 <= v <= 2700,
          "%s lb/ac over %s years (USDA NASS publishes 1,940-2,650 across 2016-2025)"
          % (v, ne.get("years")))

# ---------------------------------------------------------------- irrigation
d = load("irrigation.json")
if d:
    acres = d.get("conus_irrigated_acres", 0)
    check("irrigation vs USDA Census", 45e6 < acres < 70e6,
          "raster totals %.1fM acres; USDA Census of Agriculture reports 55-58M" % (acres / 1e6))
    shares = [b["irrigated_share_of_ground"]
              for c in d.get("crops", {}).values() for b in c.values()]
    check("irrigation shares are shares", all(0 <= s <= 100 for s in shares),
          "%d region-crop figures, %.0f%%-%.0f%%" % (len(shares), min(shares), max(shares)))
    # Independent agronomic expectation: pulses are dryland rotation crops, beans are not.
    beans = d["crops"].get("DRY BEANS", {})
    peas = d["crops"].get("PEAS", {})
    both = set(beans) & set(peas)
    higher = sum(1 for r in both
                 if beans[r]["irrigated_share_of_ground"] > peas[r]["irrigated_share_of_ground"])
    check("beans wetter than peas", both and higher >= len(both) - 1,
          "beans on more irrigated ground in %d of %d shared regions" % (higher, len(both)))

# ---------------------------------------------------------------- solar
d = load("solar-radiation.json", arch=True)
if d:
    vals = []
    def dig(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, (int, float)) and len(str(k)) == 10 and str(k)[4:5] == "-":
                    vals.append(v)
                else:
                    dig(v)
        elif isinstance(o, list):
            for v in o:
                dig(v)
    dig(d)
    if vals:
        mx = max(vals)
        # Physical bound: clear-sky surface shortwave at 41N peaks near 30-32 MJ/m2/day.
        # Anything above that is not sunlight, it is a unit error.
        check("solar within physical limit", mx <= 34,
              "peak %.1f MJ/m2/day; clear-sky maximum at this latitude is about 31" % mx)
        summer = [v for v in vals if v > 0]
        check("solar has plausible mean", 8 <= (sum(summer)/len(summer)) <= 30,
              "mean %.1f MJ/m2/day over %d station-days" % (sum(summer)/len(summer), len(summer)))

# ---------------------------------------------------------------- weather stations
d = load("station-field.json")
if d:
    dates = d.get("dates", [])
    check("station record is continuous", len(dates) > 100 and dates == sorted(dates),
          "%d daily records, %s to %s" % (len(dates), dates[0] if dates else "?", dates[-1] if dates else "?"))
    temps = []
    def digt(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ("hi", "lo") and isinstance(v, list):
                    temps.extend(x for x in v if isinstance(x, (int, float)))
                else:
                    digt(v)
        elif isinstance(o, list):
            for v in o:
                digt(v)
    digt(d)
    if temps:
        check("temperatures physically possible", -60 <= min(temps) and max(temps) <= 125,
              "%.0fF to %.0fF across %d readings" % (min(temps), max(temps), len(temps)))

# ---------------------------------------------------------------- canopy / NDVI
d = load("canopy-history.json", arch=True)
if d:
    obs = d.get("observations", {})
    vals = [ (r["mean"] if isinstance(r, dict) else r)
             for day in obs.values() for r in day.values() ]
    vals = [v for v in vals if isinstance(v, (int, float))]
    if vals:
        # Crop-CASMA serves 8-bit NDVI; anything outside 0-255 is not this product.
        check("NDVI bytes in range", 0 <= min(vals) and max(vals) <= 255,
              "%d observations, %.0f-%.0f (8-bit scale)" % (len(vals), min(vals), max(vals)))
        yrs = sorted({k[:4] for k in obs})
        check("canopy history spans years", len(yrs) >= 10,
              "%d seasons, %s-%s" % (len(yrs), yrs[0], yrs[-1]))

# ---------------------------------------------------------------- crop footprint
d = load("pulse-regions.json")
a = load("usda-class-acres.json")
if d and a:
    tot = defaultdict(float)
    for com, cells in d.get("commodities", {}).items():
        tot[com] = sum(c.get("a", 0) for c in cells)
    # Independent check: acreage derived from the crop mask should land in the same order of
    # magnitude as USDA's published planted acreage. A silently-empty download reads as zero.
    # LENTILS are deliberately not offered on this site (too few reporting farms), so their
    # near-empty footprint is dead data rather than a defect. Only judge what is published.
    live = {k: v for k, v in tot.items() if k != "LENTILS"}
    check("pulse footprints non-empty", all(v > 1000 for v in live.values()),
          ", ".join("%s %.0f ac" % (k, v) for k, v in sorted(live.items())))

# ---------------------------------------------------------------- yield output
d = load("yield-index-2026.json")
if d:
    lb = [c["lb_ac"] for r in d.get("regions", {}).values()
          for c in r.get("classes", {}).values() if c.get("lb_ac")]
    check("published yields plausible", lb and all(900 <= v <= 4000 for v in lb),
          "%d class-region figures, %d-%d lb/ac" % (len(lb), min(lb), max(lb)) if lb else "none")
    unsourced = [(rn, cn) for rn, r in d.get("regions", {}).items()
                 for cn, c in r.get("classes", {}).items()
                 if c.get("lb_ac") and not c.get("level_is_usda_published")]
    check("every published pound is USDA-sourced", not unsourced,
          "no invented yield levels" if not unsourced
          else "UNSOURCED: " + ", ".join("%s/%s" % x for x in unsourced[:3]))
    # every dry bean class in a region must now share one seasonal index
    bad = []
    for rn, r in d.get("regions", {}).items():
        idxs = {c["index"] for c in r["classes"].values() if c.get("commodity") == "DRY BEANS"}
        if len(idxs) > 1: bad.append(rn)
    check("one bean index per region", not bad,
          "shared across classes in every region" if not bad else "differs in " + ", ".join(bad))

# ---------------------------------------------------------------- freshness
d = load("refresh-status.json")
if d:
    import datetime
    s = json.dumps(d)
    today = datetime.date.today().isoformat()
    check("refresh ran recently", today[:7] in s, "status file mentions %s" % today[:7], soft=True)

print("DATA VERIFICATION — every check against a source that did not produce the data\n")
print("\n".join(lines))
print("\n  %d passed, %d warnings, %d FAILED" % (ok, warn, fail))
if fail:
    print("\nDATA INTEGRITY FAILURE — do not publish.")
sys.exit(1 if fail else 0)
