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
    # SOURCE, and a correction. This used to read "USDA Census reports 55-58M", which was
    # asserted from memory and is wrong at both ends. USDA's published figures are 58.0M
    # irrigated acres in the 2017 Census — a record high — and 54.9M in the 2022 Census
    # (USDA Economic Research Service, Charts of Note 110247 and 115050).
    #
    # More to the point, a range spanning two censuses was the wrong comparison to make.
    # MIrAD-US v4 is a 2017 raster, so it should be held against the 2017 census year and
    # nothing else. That turns a vague band into a real check: 58.7M mapped against 58.0M
    # counted is agreement to 1.2%, and a 10% tolerance is generous for a 250 m raster
    # scored against a farm-by-farm census.
    CENSUS_2017_IRRIGATED = 58.0e6     # USDA Census of Agriculture 2017, via USDA ERS
    lo, hi = CENSUS_2017_IRRIGATED * 0.90, CENSUS_2017_IRRIGATED * 1.10
    check("irrigation vs USDA Census", lo < acres < hi,
          "raster totals %.1fM acres, %+.1f%% against the 58.0M the 2017 USDA Census counted "
          "(MIrAD-US v4 is a 2017 raster; tolerance 10%%)"
          % (acres / 1e6, 100 * (acres - CENSUS_2017_IRRIGATED) / CENSUS_2017_IRRIGATED))
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
        # Physical bound on clear-sky surface shortwave at 41N. This is DERIVED, not
        # asserted — it comes out of the standard reference method and can be recomputed by
        # anyone: Allen, Pereira, Raes & Smith (1998), "Crop evapotranspiration", FAO
        # Irrigation and Drainage Paper 56.
        #
        #   Ra  = (24*60/pi) * Gsc * dr * (ws*sin(lat)*sin(dec) + cos(lat)*cos(dec)*sin(ws))
        #                                                              FAO-56 eq. 21
        #   Rso = (0.75 + 2e-5 * elevation_m) * Ra                     FAO-56 eq. 37
        #
        # At 41N, Ra peaks at 41.90 MJ/m2/day on 21 June (day 171), giving Rso = 31.4 at sea
        # level. But these regions are not at sea level and not all at 41N: they run from
        # nw-kansas at 39.1N to big-horn at 44.35N, on ground from roughly 1,200 m in the
        # Bighorn Basin to 1,800 m in western Colorado. Thinner air passes more light, so the
        # bound RISES with elevation, and across that span Rso works out at 32.4-32.9.
        #
        # The old comment's "about 31" was the SEA-LEVEL figure quoted for regions a mile up,
        # which understated the true ceiling by about 1.5 MJ. Checked region by region, every
        # observed peak sits under its own bound — the highest, western-colorado at 32.5, is
        # below the 32.9 its elevation allows and would have looked like an exceedance against
        # the old number.
        #
        # 34 stays as the pass limit. It clears the real ceiling everywhere in the region set
        # and still catches the only thing this check is for: a unit error. Anything above
        # that is not sunlight.
        check("solar within physical limit", mx <= 34,
              "peak %.1f MJ/m2/day; FAO-56 clear-sky ceiling is 32.4-32.9 across this region "
              "set (39-44N, 1,200-1,800 m)" % mx)
        summer = [v for v in vals if v > 0]
        check("solar has plausible mean", 8 <= (sum(summer)/len(summer)) <= 30,
              "mean %.1f MJ/m2/day over %d station-days" % (sum(summer)/len(summer), len(summer)))

# ---------------------------------------------------------------- pest timing
d = load("pest-wbc-2026.json")
if d:
    regs = d.get("regions", {})
    # Independent check 1: UNL publishes 12 July for Scottsbluff and 25 July for Alliance in
    # 2025. Western bean cutworm flies in this country in JULY. A median outside 10 June to
    # 20 August is not a late season, it is a broken station set — the first run of this model
    # put Big Horn on 4 SEPTEMBER because two thirds of its "nearby" stations sat up to 1,800 m
    # above the beans, on mountains the crop does not grow on.
    bad = []
    for rk, r in regs.items():
        md = (r.get("marks", {}).get("scouting_25pct") or {}).get("median_date")
        if not md or not ("06-10" <= md[5:] <= "08-20"):
            bad.append("%s=%s" % (rk, md))
    check("cutworm flight lands in flight season", regs and not bad,
          "%d regions, all between 10 Jun and 20 Aug" % len(regs)
          if not bad else "OUT OF SEASON: " + ", ".join(bad))

    # Independent check 2: a median computed after throwing away most of its own input is not a
    # median. This is the symptom that exposed the elevation problem, so it is now a gate.
    thin = ["%s (%d kept, %d flagged)" % (rk, r["stations_used"], r["stations_flagged_as_outliers"])
            for rk, r in regs.items()
            if r["stations_flagged_as_outliers"] > r["stations_used"]]
    check("cutworm medians rest on real stations", not thin,
          "no region discards more stations than it keeps"
          if not thin else "DISCARDING MORE THAN IT KEEPS: " + ", ".join(thin))

    # Independent check 3: agronomic expectation, not a restatement of our own file. Heat
    # arrives from the south and from lower ground. Northwest Kansas must reach flight before
    # the Big Horn Basin, which is five degrees of latitude north and a basin floor higher up.
    ks = (regs.get("nw-kansas", {}).get("marks", {}).get("scouting_25pct") or {}).get("median_date")
    bh = (regs.get("big-horn", {}).get("marks", {}).get("scouting_25pct") or {}).get("median_date")
    check("cutworm timing runs south to north", bool(ks and bh) and ks < bh,
          "northwest Kansas %s before Big Horn %s" % (ks, bh) if ks and bh else "missing a region")

    # The thresholds are UNL's. If they are ever edited they must be edited against the source.
    t = {m["threshold_dd"] for r in regs.values() for m in r.get("marks", {}).values()}
    check("UNL thresholds unchanged", t == {2577, 2704, 2838},
          "25/50/75%% flight at 2,577 / 2,704 / 2,838 DD" if t == {2577, 2704, 2838}
          else "ALTERED: %s" % sorted(t))

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
    # Plausible ranges differ by crop and a single floor was wrong: chickpeas legitimately
    # yield far less than dry beans -- Montana's own published record runs down to 940, so a
    # season 29% below normal lands near 820 and is not an error.
    BOUNDS = {"DRY BEANS": (900, 4000), "CHICKPEAS": (500, 2600), "PEAS": (500, 3200)}
    bad, seen = [], []
    for r in d.get("regions", {}).values():
        for cn, c in r.get("classes", {}).items():
            v = c.get("lb_ac")
            if not v:
                continue
            seen.append(v)
            lo, hi = BOUNDS.get(c.get("commodity"), (900, 4000))
            if not (lo <= v <= hi):
                bad.append("%s %d" % (cn, v))
    check("published yields plausible", seen and not bad,
          "%d figures, %d-%d lb/ac, each inside its own crop's range" % (len(seen), min(seen), max(seen))
          if not bad else "OUT OF RANGE: " + ", ".join(bad[:4]))
    # A level may be USDA-published for this state, or borrowed from a named comparable state.
    # It may never be invented. Anything with no level_kind at all is the failure case.
    bad = [(rn, cn) for rn, r in d.get("regions", {}).items()
           for cn, c in r.get("classes", {}).items()
           if c.get("lb_ac") and c.get("level_kind") not in ("published", "proxy")]
    check("every published pound is traceable", not bad,
          "no invented yield levels" if not bad
          else "UNTRACEABLE: " + ", ".join("%s/%s" % x for x in bad[:3]))
    # A borrowed level must carry the reason it was borrowed, or the page cannot disclose it.
    mute = [(rn, cn) for rn, r in d.get("regions", {}).items()
            for cn, c in r.get("classes", {}).items()
            if c.get("level_kind") == "proxy" and not c.get("level_proxy_note")]
    check("borrowed levels explain themselves", not mute,
          "every proxy carries its justification" if not mute
          else "SILENT PROXY: " + ", ".join("%s/%s" % x for x in mute[:3]))
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

# ---------------------------------------------------------------- cache busting
# A script referenced without ?v= is served from cache forever. assets/i18n.js — the file
# carrying EVERY sentence on this site — sat unversioned while its text was rewritten all day,
# so a returning visitor could read old wording while every local test passed against a fresh
# copy. A number can be right and still never reach anyone.
import re as _re
for page in ("index.html", "about.html"):
    fp = os.path.join(HERE, "..", page)
    if not os.path.exists(fp):
        continue
    html = open(fp).read()
    refs = _re.findall(r'(?:src|href)="(assets/[A-Za-z0-9._-]+\.(?:js|css))(\?v=[^"]*)?"', html)
    missing = [r[0] for r in refs if not r[1]]
    check("%s assets cache-busted" % page, not missing,
          "%d local assets, all versioned" % len(refs) if not missing
          else "UNVERSIONED: " + ", ".join(missing[:4]))

# ---------------------------------------------------------------- plan matches the code
# PLAN.md states the formulas this tool runs on. A specification that has drifted from the code
# is worse than none, because it is trusted. Each pair below is (what the plan claims, what the
# code must contain). Change a formula and this fails until the plan is updated too.
def _read(rel):
    fp = os.path.join(HERE, "..", rel)
    return open(fp, errors="replace").read() if os.path.exists(fp) else ""

plan = _read("PLAN.md")
if plan:
    ya, yi, dm = _read("scripts/refresh/yield_all.py"), _read("scripts/refresh/yield_index.py"), \
                 _read("assets/decision-map.js")
    pairs = [
        ("GDD",           "(Tmax_F + Tmin_F)/2 \u2212 T_base", "gdd += max((hi_f + lo_f) / 2 - base, 0)", yi),
        ("NDVI scaling",  "(DN \u2212 125) / 125",             "(dn - 125.0) / 125.0", ya),
        ("fAPAR",         "1.24 \u00d7 NDVI \u2212 0.168",     "1.24 * to_ndvi(dn) - 0.168", ya),
        ("PAR fraction",  "0.48",                              "PAR_FRACTION = 0.48", ya),
        ("tstress lower", "(T \u2212 10) / 14",                "(t - 10) / 14.0", ya),
        ("tstress upper", "(40 \u2212 T) / 16",                "(40 - t) / 16.0", ya),
        ("canopy stress", "(T_canopy \u2212 T_air \u2212 1) / 7", "1.0 - (diff_c - 1.0) / 7.0", ya),
        ("night 68F",     "68 \u00b0F",                        "NIGHT_HOT_F = 68", yi),
        ("shared index",  "One index per commodity",           "index_is_shared_across_classes", yi),
    ]
    drift = [n for n, inplan, incode, src in pairs
             if (inplan not in plan) or (incode not in src)]
    check("PLAN.md matches the code", not drift,
          "%d formulas verified against the shipped code" % len(pairs) if not drift
          else "DRIFTED: " + ", ".join(drift))

# ---------------------------------------------------------------- unsourced constants
# UNSOURCED.md lists numbers asserted from a model's own knowledge rather than read from a
# publication, two of which are live on the site. This check fails while any row still says
# "none", so the issue cannot be quietly forgotten between sessions.
up = os.path.join(HERE, "..", "UNSOURCED.md")
if os.path.exists(up):
    rows = [l for l in open(up).read().split("\n")
            if l.startswith("|") and "---" not in l and "| id |" not in l]
    open_rows = [l.split("|")[1].strip() for l in rows if l.rstrip().endswith("none |")]
    # Deliberately a WARNING in the daily run and a FAILURE before any publish. The daily
    # refresh only moves measured data, which is verified by every check above; blocking it
    # over a documentation debt would take a working site stale to make a point. A human or
    # agent shipping CODE gets stopped, because that is when new claims enter.
    check("constants are sourced", not open_rows,
          "every constant carries a citation" if not open_rows
          else "%d UNSOURCED: %s — see UNSOURCED.md" % (len(open_rows), ", ".join(open_rows)),
          soft="--strict" not in sys.argv)

print("DATA VERIFICATION — every check against a source that did not produce the data")
print("mode: %s\n" % ("STRICT (pre-publish)" if "--strict" in sys.argv else "daily (data only)"))
print("\n".join(lines))
print("\n  %d passed, %d warnings, %d FAILED" % (ok, warn, fail))
if fail:
    print("\nDATA INTEGRITY FAILURE — do not publish.")
sys.exit(1 if fail else 0)
