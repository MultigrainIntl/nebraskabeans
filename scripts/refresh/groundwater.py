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
import io, json, math, os, statistics, sys, urllib.parse, urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
OUT = os.path.join(DATA, "groundwater.json")
TREND_CACHE = os.path.join(DATA, "archive", "groundwater-trend-cache.json")

# HOW FAST IT IS FALLING, WHICH IS THE PART NOBODY ELSE PUBLISHES.
# The depth itself is the number a grower already knows better than we do — it is their own
# well. What no one can see is the RATE across their area. So the latest reading above is
# context and this is the finding.
#
# Sources for history, because no single one covers the region:
#   Colorado  — CO Division of Water Resources, full per-well measurement history, keyless
#   Nebraska  — UNL Conservation and Survey Division's own database, published openly at
#               https://go.unl.edu/wldb as an Access file: 24,209 wells and 974,724 usable
#               measurements back to 1930. Read with mdbtools. This is the richest record in
#               the region by a wide margin and it is the reason the Panhandle figure can be
#               stated at all — the national portal blocks per-well history, and USGS's own
#               Nebraska wells carry only a few hundred long records against UNL's thousands.
#   Kansas    — KGS wells appear in the national portal for levels; their history is behind
#               the WIZARD form and is NOT fetched. Kansas therefore has depth but no trend,
#               and the file says so rather than borrowing Colorado's slope for it.
#
# EVERY WELL AGAINST ITS OWN MEAN. A county's mix of shallow and deep wells changes year to
# year as sites are added and dropped, and a raw median moves with that mix rather than with
# the water. Normalising each well to itself is what turned a noisy Yuma series into a clean
# 63-year decline.
MIN_TREND_YEARS = 12       # a slope from fewer years than this is weather, not depletion
MIN_TREND_WELLS = 5
MIN_ANOM_WELLS = 8         # below this, this year's anomaly is a handful of wells, not a season

# THIS YEAR, NOT JUST THIS CENTURY. GAJ: "It also does not say anything about 2026!" He was
# right — the line reported a 95-year slope and nothing about the season a grower is standing
# in. The long trend and the current year are different facts and both are needed:
#
#     Southwest Nebraska  4.65 ft BELOW its own 2015-2025 normal in 2026, from 38 wells
#     Nebraska Panhandle  1.02 ft below, from 113 wells
#     Southeast Wyoming   0.87 ft below, from 58 wells
#
# Southwest Nebraska is about THIRTY YEARS of its own long-run decline in a single season.
# That is not depletion, it is this winter's dryness showing up in the aquifer, and calling it
# depletion would be as wrong as calling the Panhandle's steady century a crisis.
#
# Built by joining two sources on the well: UNL carries history to 2025, the national portal
# carries the 2026 reading. 5,885 of UNL's 6,177 wells in the portal share their CSD_ID
# directly, and 833 of those have been read in 2026.

# WHAT THE TREND ACTUALLY SAYS, AND A CORRECTION WORTH KEEPING.
# This was built expecting to publish a countdown. Yuma County, Colorado is roughly 51 ft
# lower than in 1965 and 2026 is its deepest year on record, and that was taken as evidence
# for the region. It is not. Measured on UNL's own 95-year record:
#
#     Nebraska Panhandle   +0.04 ft/yr   1,393 wells, 34,600 readings, 1930-2025
#     Southwest Nebraska   +0.16 ft/yr   1,110 wells, 32,297 readings, 1934-2025
#
# The Panhandle water table has fallen about FOUR FEET IN A CENTURY. It is stable. The
# North Platte valley is a river-recharged aquifer; the Colorado high plains are not, and
# treating one as evidence for the other was the error. Publishing the flat number matters as
# much as publishing the falling one — a grower who reads national coverage of the Ogallala
# will assume the worst about ground that is actually holding.

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


def well_history_colorado(well_id):
    """Colorado DWR, full history for one well. NOTE the field trap: the wells endpoint calls
    it waterLevelDepth, the measurements endpoint calls it depthToWater. Using the wrong one
    returns rows of None and looks like a well with no record."""
    u = ("https://dwr.state.co.us/Rest/GET/api/v2/groundwater/waterlevels/wellmeasurements/"
         "?format=json&wellId=%s&pageSize=3000" % well_id)
    out = defaultdict(list)
    try:
        d = json.loads(get(u) or "{}")
    except Exception:
        return {}
    for x in (d.get("ResultList") or []):
        try:
            y = int(x["measurementDate"][:4]); v = float(x["depthToWater"])
            if 0 < v < 1500:
                out[y].append(v)
        except (TypeError, ValueError, KeyError):
            pass
    return {y: statistics.mean(v) for y, v in out.items()}


def well_history_usgs(site_id):
    """USGS OGC field measurements, parameter 72019 — depth to water below land surface."""
    u = ("https://api.waterdata.usgs.gov/ogcapi/v1/collections/field-measurements/items?"
         + urllib.parse.urlencode({"monitoring_location_id": site_id,
                                   "parameter_code": "72019",
                                   "datetime": "1960-01-01/2026-12-31",
                                   "limit": 3000, "f": "json"}))
    out = defaultdict(list)
    try:
        d = json.loads(get(u) or "{}")
    except Exception:
        return {}
    for f in (d.get("features") or []):
        pr = f.get("properties") or {}
        try:
            v = float(pr["value"]); y = int(pr["time"][:4])
            if 0 < v < 1500:
                out[y].append(v)
        except (TypeError, ValueError, KeyError):
            pass
    return {y: statistics.mean(v) for y, v in out.items()}


def slope_ft_per_year(series_list):
    """Least squares on year against depth, every well first centred on its own mean."""
    pts = []
    for ser in series_list:
        if len(ser) < 4:
            continue
        mu = statistics.mean(ser.values())
        for y, v in ser.items():
            pts.append((y, v - mu))
    if len(pts) < 20:
        return None, 0, None
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    mx, my = statistics.mean(xs), statistics.mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    if not sxx:
        return None, 0, None
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return b, len(pts), (min(xs), max(xs))



UNL_DB_URL = "https://go.unl.edu/wldb"
UNL_CACHE = os.path.join(DATA, "archive", "unl-wldb")


def unl_nebraska_series():
    """Every Nebraska well's history, from UNL's own published database.

    16 MB zipped, a 123 MB Access file inside, 974,724 usable readings. It updates about once
    a year, so it is cached and only refetched when the server says the file changed —
    pulling it daily would be wasteful and rude to a university that publishes it for free.

    Needs mdbtools (`brew install mdbtools`). If that is missing this returns nothing and the
    Nebraska regions simply carry no trend, which is the correct failure: no number is better
    than a number from a neighbouring state.
    """
    import shutil, subprocess, zipfile, csv as _csv
    if not shutil.which("mdb-export"):
        print("  mdbtools not installed — Nebraska trend unavailable", file=sys.stderr)
        return {}
    os.makedirs(UNL_CACHE, exist_ok=True)
    zp = os.path.join(UNL_CACHE, "wldb.zip")
    stamp = os.path.join(UNL_CACHE, "etag.txt")
    have = open(stamp).read().strip() if os.path.exists(stamp) else ""
    try:
        req = urllib.request.Request(UNL_DB_URL, method="HEAD",
                                     headers={"User-Agent": "nebraskabeans/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            tag = r.headers.get("ETag") or r.headers.get("Last-Modified") or ""
    except Exception:
        tag = ""
    if not os.path.exists(zp) or (tag and tag != have):
        print("  fetching UNL groundwater database (16 MB)", file=sys.stderr)
        try:
            req = urllib.request.Request(UNL_DB_URL, headers={"User-Agent": "nebraskabeans/1.0"})
            with urllib.request.urlopen(req, timeout=600) as r, open(zp, "wb") as f:
                shutil.copyfileobj(r, f)
            if tag:
                open(stamp, "w").write(tag)
        except Exception as e:
            print("  UNL fetch failed: %s" % str(e)[:80], file=sys.stderr)
            if not os.path.exists(zp):
                return {}
    else:
        print("  UNL database unchanged since last run, using cache", file=sys.stderr)

    try:
        with zipfile.ZipFile(zp) as z:
            name = [n for n in z.namelist() if n.lower().endswith(".accdb")][0]
            z.extract(name, UNL_CACHE)
        acc = os.path.join(UNL_CACHE, name)
    except Exception as e:
        print("  could not open the UNL archive: %s" % str(e)[:70], file=sys.stderr)
        return {}

    def dump(table):
        return subprocess.run(["mdb-export", acc, table], capture_output=True,
                              text=True, timeout=900).stdout

    coords = {}
    for r in _csv.DictReader(io.StringIO(dump("Well_Info"))):
        try:
            coords[r["CSD_ID"]] = (float(r["LatDD"]), float(r["LongDD"]))
        except (TypeError, ValueError, KeyError):
            pass
    series = defaultdict(lambda: defaultdict(list))
    for r in _csv.DictReader(io.StringIO(dump("Water_Level_Data"))):
        try:
            y = int(r["YearMsr"]); v = float(r["WatLevel"])
        except (TypeError, ValueError, KeyError):
            continue
        if 0 < v < 1500 and 1930 <= y <= 2026 and r["CSD_ID"] in coords:
            series[r["CSD_ID"]][y].append(v)
    out = {}
    for cid, byyear in series.items():
        if len(byyear) >= 6:
            out[cid] = ({y: statistics.mean(v) for y, v in byyear.items()}, coords[cid])
    print("  UNL: %d wells with 6+ years of record" % len(out), file=sys.stderr)
    return out


def this_year_anomaly(unl, portal_rows, la, lo, year=2026):
    """How far this year's water sits from each well's OWN recent normal.

    A raw median across wells moves with which wells were measured; comparing every well to
    itself removes that. Same normalisation the trend uses, and the reason a noisy county
    series becomes a clean signal.
    """
    anoms = []
    for r in portal_rows:
        sid = r.get("SITE_NO")
        rec = unl.get(sid)
        if not rec or (r.get("LATEST_DATE") or "") < "%d-01-01" % year:
            continue
        ser, (wla, wlo) = rec
        recent = {y: v for y, v in ser.items() if 2015 <= y <= 2025}
        if len(recent) < 5 or km(wla, wlo, la, lo) > MAX_KM:
            continue
        try:
            v = float(r["LATEST_VALUE"])
        except (TypeError, ValueError):
            continue
        if 0 < v < 1500:
            anoms.append(v - statistics.mean(recent.values()))
    if len(anoms) < MIN_ANOM_WELLS:
        return None
    m = statistics.median(anoms)
    return {"feet_vs_own_normal": round(m, 2),
            "direction": "lower" if m > 0 else "higher",
            "wells": len(anoms), "year": year,
            "baseline": "each well's own 2015-2025 average"}


def colorado_anomaly(la, lo, year=2026, sample=150):
    """This year against each Colorado well's own recent normal.

    COLORADO WAS MISSING AND IT SHOULD NOT HAVE BEEN. The anomaly was first built by joining
    UNL's history to the national portal, which is Nebraska-only, so northeast and western
    Colorado came back with five wells and none. Colorado's Division of Water Resources
    publishes both the history AND the current reading itself — Yuma County alone lists 1,434
    wells with 289 read in 2024 or later. GAJ: "How about Colorado? You are missing
    information."

    Same normalisation as everywhere else: each well against ITSELF, so the changing set of
    measured wells cannot masquerade as a change in the water.
    """
    import urllib.parse as _up
    counties = {"ne-colorado": ["YUMA", "WASHINGTON", "LOGAN", "PHILLIPS", "MORGAN", "SEDGWICK",
                                "KIT CARSON"],
                "western-colorado": ["MONTROSE", "DELTA", "MESA", "OURAY"]}
    which = "ne-colorado" if lo > -106 else "western-colorado"
    anoms = []
    for cty in counties[which]:
        d = get("https://dwr.state.co.us/Rest/GET/api/v2/groundwater/waterlevels/wells/"
                "?format=json&county=%s&pageSize=5000" % _up.quote(cty))
        try:
            rows = (json.loads(d or "{}").get("ResultList") or [])
        except Exception:
            continue
        recent = [w for w in rows
                  if (w.get("measurementDate") or "")[:4] >= str(year) and w.get("wellId")]
        for w in recent[:sample // max(1, len(counties[which]))]:
            try:
                now = float(w["waterLevelDepth"])
            except (TypeError, ValueError, KeyError):
                continue
            if not (0 < now < 1500):
                continue
            h = well_history_colorado(w["wellId"])
            base = {y: v for y, v in h.items() if 2015 <= y <= 2025}
            if len(base) >= 5:
                anoms.append(now - statistics.mean(base.values()))
        if len(anoms) >= sample:
            break
    if len(anoms) < MIN_ANOM_WELLS:
        return None
    m = statistics.median(anoms)
    return {"feet_vs_own_normal": round(m, 2),
            "direction": "lower" if m > 0 else "higher",
            "wells": len(anoms), "year": year,
            "baseline": "each well's own 2015-2025 average",
            "source": "Colorado Division of Water Resources"}

def main():
    import csv, io
    wells = []
    portal_rows = []
    for st in STATES:
        q = urllib.parse.urlencode({
            "service": "WFS", "version": "1.0.0", "request": "GetFeature",
            "typeName": LAYER, "outputFormat": "csv", "maxFeatures": 30000,
            "CQL_FILTER": "STATE_NM='%s'" % st})
        rows = list(csv.DictReader(io.StringIO(get(WFS + "?" + q))))
        portal_rows.extend(rows)
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
            sid = r.get("SITE_NO") or ""
            wells.append({"state": st, "agency": r.get("AGENCY_NM", ""),
                          "usgs_id": ("USGS-" + str(sid)) if "Geological Survey" in r.get("AGENCY_NM", "") and "Kansas" not in r.get("AGENCY_NM", "") else None,
                          "dwr_id": str(sid) if "Colorado Division" in r.get("AGENCY_NM", "") else None,
                          "county": r.get("COUNTY_NM", ""), "lat": lat, "lon": lon,
                          "depth_ft": v, "date": r["LATEST_DATE"],
                          "aquifer": r.get("NAT_AQFR_DESC", "")})
            got += 1
        print("  %-10s %5d wells with a level" % (st, got), file=sys.stderr)

    unl = unl_nebraska_series()
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
        # --- the trend, where a state gives us history to fit one to
        hist = []
        trend_src = None
        # ONLY WELLS IN THIS REGION'S OWN STATE MAY FIT ITS TREND. A 120 km radius reaches
        # deep into the neighbour, and Colorado is the only state here whose full per-well
        # history is fetchable, so an unrestricted fit quietly used Colorado wells for
        # EVERY region — publishing a "northwest Kansas" decline of 0.46 ft/yr and a
        # "southwest Nebraska" decline of 0.42 ft/yr that were both measured in Colorado.
        # A depth median may cross the line, because the aquifer does and the file says which
        # state the wells sit in. A trend labelled with a state must be measured in it.
        home = HOME_STATE.get(rk)
        co = [w for w in near if w["state"] == "Colorado" and home == "Colorado"][:35]
        ne = []
        # Nebraska's trend comes from UNL's own database rather than the national portal —
        # 1,393 wells under the Panhandle against a handful of USGS sites.
        if home == "Nebraska" and unl:
            for cid, (ser, (wla, wlo)) in unl.items():
                if km(wla, wlo, la, lo) <= MAX_KM:
                    ne.append({"state": "Nebraska", "series": ser})
            # NO CAP. A first version took ne[:400] — the first four hundred in dictionary
            # order, which is neither the nearest nor a random sample. It moved the Panhandle
            # figure from +0.04 to +0.11 ft/yr, nearly threefold, purely by which wells
            # happened to be enumerated first. Every well inside the radius is fitted.
        if len(co) >= MIN_TREND_WELLS and len(co) >= len(ne):
            for w in co:
                if w.get("dwr_id"):
                    h = well_history_colorado(w["dwr_id"])
                    if len(h) >= 4:
                        hist.append(h)
            trend_src = "Colorado Division of Water Resources"
        if len(hist) < MIN_TREND_WELLS and ne:
            hist = [w["series"] for w in ne if len(w.get("series") or {}) >= 4]
            trend_src = ("UNL Conservation and Survey Division groundwater database, "
                         "1930-2025")
        anomaly = this_year_anomaly(unl, portal_rows, la, lo) if unl else None
        if anomaly is None and HOME_STATE.get(rk) == "Colorado":
            anomaly = colorado_anomaly(la, lo)
        b, npts, span = slope_ft_per_year(hist)
        trend = None
        # MIN_TREND_WELLS was declared and then not enforced on the FIT, only on the candidate
        # list. The first run duly reported a Nebraska Panhandle trend of +0.00 ft/yr fitted
        # from ONE well and printed it beside figures built on thirty-five. One well is a well,
        # not a region — the same failure that put Big Horn's cutworm flight in September.
        if (b is not None and span and (span[1] - span[0]) >= MIN_TREND_YEARS
                and len(hist) >= MIN_TREND_WELLS):
            # Which state the fitted wells actually sit in. A 120 km radius crosses borders,
            # so a trend labelled nw-kansas can be fitted mostly on Colorado wells, and the
            # reader is owed that.
            fit_states = defaultdict(int)
            for w in (co if trend_src and "Colorado" in trend_src else ne):
                fit_states[w["state"]] += 1
            trend = {"feet_per_year": round(b, 2),
                     "direction": "falling" if b > 0 else "rising",
                     "wells_fitted": len(hist), "readings": npts,
                     "years": "%d-%d" % span,
                     "source": trend_src,
                     "fitted_wells_by_state": dict(fit_states),
                     "feet_over_20_years": round(b * 20, 1)}

        regions[rk] = {
            "this_year": anomaly,
            "trend": trend,
            "trend_unavailable_because": None if trend else (
                "No trend is published for this region. A slope may only be fitted from wells "
                "IN this region's own state, and either too few of them publish a long enough "
                "history or that state's history is not reachable. "
                "Not enough wells here publish a long enough history to fit a slope to. The "
                "wells under this region are mostly UNL Conservation and Survey sites, which "
                "reach this project through the national portal for their latest reading "
                "only — the portal's history endpoints return 403. Kansas Geological Survey "
                "history sits behind the WIZARD form. Neither is borrowed from a neighbour."),
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
