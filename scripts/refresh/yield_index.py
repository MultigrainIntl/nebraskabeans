#!/usr/bin/env python3
"""
Yield, built so the uncertain constants cancel.

THE PROBLEM THIS SOLVES. The radiation-use-efficiency model reads about a third of real
yields — consistently, in every region. An independent review found why: the satellite
greenness to intercepted light conversion is uncalibrated, and the light-use efficiency and
harvest index constants are general values, not fitted to these crops on this ground. Without
harvest records there is no way to calibrate them, and multiplying the answer by three to match
USDA would be fitting the model to the scorecard, which is the one thing this project does not
do.

THE WAY THROUGH. Those constants are wrong, but they are wrong by the SAME AMOUNT EVERY YEAR.
Run the identical model over 2000 to 2025 and divide this season by its own history, and every
one of them cancels:

    index = biomass(2026) / mean(biomass(2000..2025))

What survives the division is the part that is actually measured — how much light this canopy
intercepted this season against how much it intercepted in an average season, on the same
ground, through the same instrument, with the same arithmetic.

That index is then applied to the harvested record for that class in that state:

    yield = USDA class history x index

USDA supplies the level, which is the one thing it is genuinely authoritative about: it is the
record of what was actually harvested and weighed. The satellite and the weather supply the
deviation, which is the part that is current and waits on no agency. No current-year USDA
figure enters anywhere — the history is a fixed baseline, not an input that moves.

WHAT THIS STILL IS NOT. It assumes this season's departure from normal scales the harvested
yield proportionally. It cannot see irrigation scheduling, disease, hail or management. The
band it reports is the spread of the model's own historical years, which is a measure of how
variable this signal is, not a confidence interval in the statistical sense.

Water stress is deliberately excluded from the index. The thermal record only exists for 2026,
and a term present on one side of a ratio and absent on the other would not cancel — it would
bias. Water shortage still reaches the number through the canopy, which is what a dry crop
shows.
"""
import json, math, os, statistics, sys, time, urllib.parse, urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
ARCHIVE = os.path.join(DATA, "archive")
HIST = os.path.join(ARCHIVE, "season-history.json")
OUT = os.path.join(DATA, "yield-index-2026.json")

POWER = "https://power.larc.nasa.gov/api/temporal/daily/point"
ACIS = "https://data.rcc-acis.org/MultiStnData"

# Eleven seasons. A normal needs enough years to be stable, not every year on record —
# GAJ's call, and the right one: going back to 2000 tripled the fetching to move the mean by
# very little. Eleven covers the recent run of wet and dry years these regions have had.
YEARS = list(range(2015, 2026))
# Night minimum above which common bean pollen is reported to fail. Counted as an
# observation and tested against real harvests; nothing is subtracted from any yield on
# the strength of it.
#
# SOURCE: 68 F is 20.0 C, which is the published threshold, not a round number chosen to
# look like one. Porch, T.G. & Jahn, M. (2001), "Effects of high-temperature stress on
# microsporogenesis in heat-sensitive and heat-tolerant genotypes of Phaseolus vulgaris",
# Plant, Cell & Environment 24:723-731 — day above 30 C and NIGHT ABOVE 20 C give
# significant yield reduction in common bean. Restated in Cruz et al. (2023), Frontiers in
# Plant Science 14:1145858, doi:10.3389/fpls.2023.1145858: "Common bean reproductive
# development is strongly affected by heat stress, particularly overnight temperatures
# above 20 C." Corroborated across later reviews of reproductive-stage heat stress.
#
# LIMIT OF THAT SOURCE: it covers Phaseolus vulgaris — pinto, great northern, navy, black,
# kidney, small red, cranberry, small white. It does NOT cover peas, chickpeas or blackeye
# (cowpea), which season_biomass() below currently counts on this same threshold. That
# count is an observation, published as a count and not subtracted from any yield, but for
# those three crops the 20 C line is borrowed and nothing sources it. Do not build a claim
# about pea or chickpea nights on it without finding a threshold for those species.
NIGHT_HOT_F = 68
THIS_YEAR = 2026
SEASON = ("03-01", "10-31")

sys.path.insert(0, HERE)
from yield_all import (CLASSES, NAMES, PAR_FRACTION, fpar, tstress, soil_threshold,
                       derive_planting, station_on_crop_ground, haversine_km,
                       hargreaves_et0, crop_coefficient, water_stress, opening_depletion,
                       TAW_MM)

# How far from the crop a rain gauge may sit and still be pooled into the region's rainfall.
# Wider than the single thermometer's reach on purpose: rain is patchy, and averaging more
# gauges is what makes the regional figure stand for the fields rather than for one storm.
PRECIP_POOL_KM = 90.0

# DOES THE WATER TERM MULTIPLY INTO THE PUBLISHED INDEX? Measured on 17 September 2026: no.
#
# The term was built exactly as PLAN.md 3.5 specifies — Hargreaves reference ET, an FAO-56 crop
# coefficient curve, a root-zone balance opened by the winter's recharge — and then tested
# against every USDA harvest these seven regions have on record, by scripts/backtest.py,
# leaving each year out of its own baseline. It made the forecast WORSE in all seven
# state-classes:
#
#     no water   mean skill  -89%   beats guessing in 1 of 7
#     with water mean skill -158%   beats guessing in 0 of 7
#
# The obvious excuse was tested and failed. If the term hurt because the model assumed these
# fields were rainfed when dry beans here are largely a pivot crop, then muting it with a high
# irrigated share should have recovered the skill. Running it at 85% irrigated gives -95%,
# still worse than not having it; running it at 0% irrigated gives -792%. The damage scales
# with how much water influence is let in. That is not a calibration problem, it is the term
# being wrong for this ground.
#
# WHY IT PROBABLY FAILS, stated as a hypothesis and not as a finding: a rainfall-minus-ET
# balance cannot see a centre pivot, and on irrigated ground the dry years it penalises hardest
# are the years the grower simply ran more water. PLAN.md says this in its own words and calls
# for measured ETa/ETp from OpenET instead. That is the next thing to try, and until it is
# tried the honest state is "not proven".
#
# The term is still computed and still published, because a grower with a rainfed field wants
# to know his profile is empty whether or not it predicts a state average. It is an
# observation, like the flowering heat days, and observations do not get to move a yield.
WATER_IN_INDEX = False

# WHICH WATER. "balance" is the inferred rainfall-minus-reference-ET term that failed every
# test above. "gwet" is NASA's root-zone soil wetness, which is a land-surface model run
# against observed weather rather than a formula applied to a rain gauge, and which agrees
# with the USDA probe 15 km from the Wyoming bean ground at r = +0.62 across 3,801 days.
# Neither is allowed into the published index until scripts/backtest.py says it earns it.
WATER_MODE = "gwet"

# Stress begins when the root zone falls below this share of its capacity. It is the FAO-56
# depletion fraction for beans, p = 0.45, read as "the crop draws the first 45% freely",
# applied to NASA's wetness fraction instead of to a modelled depletion. Applying a soil-water
# depletion threshold to a saturation fraction is an ASSUMPTION about what the two scales have
# in common, and it belongs in UNSOURCED.md.
GWET_CRITICAL = 0.55

# WHAT THIS NUMBER IS ALLOWED TO BE CALLED.
#
# GAJ, 17 September 2026, and he is right: "Satellites and drones provide indirect surface or
# crop-stress clues. They do not measure actual root-zone moisture reliably. With remote data
# alone, the tool must call its output an estimated water-stress proxy, not measured soil
# moisture."
#
# Commercial growers here measure the root zone with buried probes at several depths, with
# tensiometers or Watermark sensors reading how hard the water is to pull, with a hand probe
# and a shovel, and with their own rain and irrigation-flow records. This site has none of
# those. What it has is a land-surface model, a satellite and a soil survey. That combination
# estimates stress. It does not measure moisture, and it must never say it does.
#
# The name is enforced, not merely intended: tests/verify_no_regression.py fails the build if
# the published data or any page calls a remotely-derived figure measured soil moisture.
WATER_LABEL = "estimated water-stress proxy"

USDA_CLASS = {"PINTO": "Pinto", "GREAT NORTHERN": "Great northern",
              "LIGHT RED KIDNEY": "Light red kidney", "DARK RED KIDNEY": "Dark red kidney",
              "NAVY": "Navy", "BLACK": "Black", "BLACKEYE": "Blackeye",
              # USDA publishes dry pea yield for Nebraska. It publishes NO chickpea yield for
              # Nebraska, Colorado or Wyoming — that programme covers Idaho, Montana, North
              # Dakota and Washington only. So chickpeas get no level here, and therefore no
              # pounds per acre. The site was showing 494 lb/ac from a 700 lb/ac level that
              # came from nowhere, against 940-2,100 in every state USDA actually estimates.
              "PEAS": "DRY PEAS", "CHICKPEAS": "CHICKPEAS"}
FULL_STATE = {"NE": "Nebraska", "CO": "Colorado", "WY": "Wyoming", "KS": "Kansas"}


# Where USDA publishes no level for a crop in these states, the nearest comparable published
# state stands in — but only where that transfer can be CHECKED, not assumed.
#
# Chickpeas: USDA does not estimate them in Nebraska, Colorado or Wyoming. Montana is the
# largest chickpea state, semi-arid, same pulse rotation, similar latitude band.
#
# SOURCE for "largest": USDA NASS State Agriculture Overview, 2025, read per state — chickpea
# acres PLANTED: Montana 260,000; Washington 141,000; Idaho 98,000; North Dakota 37,000.
# NASS estimates chickpeas in those four states only (California has no chickpea row), so the
# US figure is 536,000 and Montana is 48.5% of it, first by a factor of 1.8 over second place.
#
# DO NOT quote 541,000. That was the June 2025 Acreage report's PLANTING INTENTIONS
# (ISSN 1949-1522), and it was used here first and was wrong: the state overviews have since
# revised Washington from 144,000 to 141,000, Idaho 99,000 to 98,000, North Dakota 38,000 to
# 37,000. The reader-facing sentence deliberately quotes Montana against WASHINGTON rather
# than against a national total, so it rests on two figures read straight off USDA's own
# pages and needs no arithmetic of ours to stand up.
#
# The word "dryland" USED TO STAND HERE AND HAS BEEN REMOVED. Montana chickpea really is
# grown almost entirely without irrigation — MSU Extension MontGuide MT201703AG bases the
# state's whole yield expectation on dryland variety trials — but NO agency publishes the
# irrigated-vs-dryland split for chickpeas, so no number backs the word. It also did no work
# here: the transfer rests on the pea check below, not on how the ground is watered.
#
# The check: dry peas are published in BOTH Montana and Nebraska, and come out at 1,528 and
# 1,579 lb/ac — within 3%. So Montana's pulse yields do transfer to this ground, and that is
# demonstrated rather than claimed. The page says all of this in plain words.
PROXY = {"CHICKPEAS": ("Montana",
                       "USDA does not estimate chickpea yield in these states. This uses "
                       "Montana, which plants more chickpeas than any other state — 260,000 "
                       "acres in 2025 against 141,000 in Washington, the next biggest "
                       "(USDA NASS State Agriculture Overview, 2025). Dry peas are published "
                       "in both Montana and Nebraska and differ by 3%, which is the evidence "
                       "that Montana transfers here.")}


def usda_level(cls, region):
    """What this class ACTUALLY yielded in this state, averaged over the published years.

    Replaces a baseline that had drifted from the record -- Nebraska light red kidney sat at
    2,175 against a measured 2,031 -- and, more importantly, it makes the DIFFERENCE between
    classes a measurement instead of an artefact of constants nobody sourced.
    """
    try:
        d = json.load(open(os.path.join(DATA, "usda-class-yields.json")))
    except Exception:
        return None
    name = USDA_CLASS.get(cls)
    st = FULL_STATE.get(STATE_OF.get(region))
    if not name or not st:
        return None
    b = d.get("classes", {}).get(name, {}).get(st)
    if b:
        return b["mean_lb_ac"], "published", None
    if cls in PROXY:
        pst, why = PROXY[cls]
        pb = d.get("classes", {}).get(name, {}).get(pst)
        if pb:
            return pb["mean_lb_ac"], "proxy", why
    return None, None, None


STATE_OF = {"ne-panhandle": "NE", "sw-nebraska": "NE", "ne-colorado": "CO",
            "western-colorado": "CO", "se-wyoming": "WY", "big-horn": "WY",
            "nw-kansas": "KS"}


def region_centres():
    cells = json.load(open(os.path.join(HERE, "bean-cells-by-county.json")))
    acc = defaultdict(lambda: [0.0, 0.0, 0.0])
    for c in cells:
        a = max(float(c.get("acres") or 0), 0.01)
        r = acc[c["region"]]
        r[0] += c["lon"] * a; r[1] += c["lat"] * a; r[2] += a
    return {k: (v[0] / v[2], v[1] / v[2]) for k, v in acc.items() if v[2] > 0}


def power_history(lon, lat, years):
    """Daily measured radiation across every season in one call per region."""
    q = urllib.parse.urlencode({
        "parameters": "ALLSKY_SFC_SW_DWN", "community": "AG",
        "longitude": round(lon, 3), "latitude": round(lat, 3),
        "start": "%d0301" % min(years), "end": "%d1031" % max(years), "format": "JSON"})
    with urllib.request.urlopen("%s?%s" % (POWER, q), timeout=300) as r:
        got = json.loads(r.read().decode())["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    return {"%s-%s-%s" % (k[:4], k[4:6], k[6:]): float(v)
            for k, v in got.items() if float(v) > -900}


# What the land surface is actually doing, from the same keyless service that has been giving
# this site its sunlight since the beginning.
#
# THE MISS. A water term was built on 17 September 2026 by INFERRING the soil's state from
# rainfall minus a reference-evaporation formula, and it failed every test. The inference was
# never necessary. NASA POWER serves root-zone soil wetness and actual evapotranspiration for
# any point on earth, daily, back to 1981, on the same URL that was already being called for
# radiation — one extra word in the query string. GAJ: "You should be able to calculate soil
# moisture throughout the year. I KNOW IT CAN BE DONE. What are you missing?" This was.
#
# WHAT THESE NUMBERS ARE. MERRA-2/GEOS land data assimilation: a physical land-surface model
# run against observed weather and satellite input. Not a probe in the ground, and it must
# never be called one. It IS checked against probes — scripts/refresh/soil_probes.py scores it
# against the USDA in-ground sensors at Torrington and Johnson Farm, which have measured this
# ground hourly since 1997.
SOIL_PARAMS = ["GWETROOT", "GWETPROF", "GWETTOP", "PRECTOTCORR", "EVPTRNS"]


def power_soil(lon, lat, start, end):
    """Root-zone soil wetness, profile wetness, corrected rainfall and actual ET, daily."""
    q = urllib.parse.urlencode({
        "parameters": ",".join(SOIL_PARAMS), "community": "AG",
        "longitude": round(lon, 3), "latitude": round(lat, 3),
        "start": start, "end": end, "format": "JSON"})
    with urllib.request.urlopen("%s?%s" % (POWER, q), timeout=600) as r:
        got = json.loads(r.read().decode())["properties"]["parameter"]
    out = {}
    for name in SOIL_PARAMS:
        block = got.get(name) or {}
        out[name] = {"%s-%s-%s" % (k[:4], k[4:6], k[6:]): float(v)
                     for k, v in block.items() if float(v) > -900}
    return out


def acis_history(state, lon, lat):
    """ONE station, every season, in one request.

    This used to ask for a whole state per year and keep whichever station happened to sit
    nearest with 80% coverage THAT year. The station therefore changed between years: the
    Nebraska Panhandle baseline drew a July mean maximum of 91.9F from one site in 2017 and
    71.6F from a different one in 2023, and 2018 was missing altogether. Comparing this season
    against a baseline assembled from a rotating cast of thermometers is not a controlled
    comparison, and it is what made the index disagree with the canopy it is supposed to track.

    Now the station is chosen once and carries every year, or the region is not indexed.
    """
    body = json.dumps({
        "state": state,
        "sdate": "%d-%s" % (min(YEARS), SEASON[0]),
        "edate": "%d-%s" % (max(YEARS), SEASON[1]),
        "elems": [{"name": "maxt", "interval": "dly"}, {"name": "mint", "interval": "dly"}],
        "meta": ["ll", "sids", "name"]}).encode()
    req = urllib.request.Request(ACIS, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        d = json.loads(r.read().decode())

    want = (date(max(YEARS), 10, 31) - date(min(YEARS), 3, 1)).days + 1
    best, bd, bname = None, 1e9, None
    for st in d.get("data", []):
        meta = st.get("meta") or {}
        ll = meta.get("ll")
        rows = st.get("data") or []
        if not ll or len(rows) < want * 0.95:
            continue
        good = 0
        for x in rows:
            try:
                float(x[0]); float(x[1]); good += 1
            except (TypeError, ValueError, IndexError):
                pass
        # one station must carry the WHOLE record, not most of it
        if good < want * 0.90:
            continue
        dd = (ll[0] - lon) ** 2 + (ll[1] - lat) ** 2
        if dd < bd:
            best, bd, bname = rows, dd, meta.get("name")
    if not best:
        return None, None

    start_d = date(min(YEARS), 3, 1)
    out = {}
    for i, row in enumerate(best):
        try:
            hi, lo = float(row[0]), float(row[1])
        except (TypeError, ValueError, IndexError):
            continue
        out[(start_d + timedelta(days=i)).isoformat()] = (hi, lo)
    return out, bname


def load_history():
    if os.path.exists(HIST):
        try:
            return json.load(open(HIST))
        except Exception:
            pass
    return {"radiation": {}, "temperature": {}}




# BOTH PRODUCTS, ALWAYS, EVERYWHERE. A STANDING ORDER, NOT A PREFERENCE.
#
# GAJ, 18 September 2026: "I NEED YOU TO CONTINUALLY COMPARE THE TWO SO THAT WE CAN MAKE BETTER
# ESTIMATIONS IN OTHER REGIONS."
#
# I had reported a "we did not switch" decision he never asked for. He had asked for remote
# sensing to be USED, and to be ready for countries with no instruments in them. Choosing a
# winner throws away the single most portable thing we have: WHERE THE TWO DISAGREE. A model and
# a satellite arriving at the same answer is worth more than either alone, and a place where
# they diverge is a place to widen the band — which is exactly the judgement a region with no
# probes cannot make for itself.
#
# Both are global and neither needs an account, so both travel to Turkey or Alberta unchanged.
SMAP_SERVICE = ("https://geo.fas.usda.gov/arcgis2/rest/services/G_SMAP/"
                "Rootzone_SM_Daily/ImageServer/getSamples")
SMAP_SLICES = 20        # the service returns at most 20 days per request, whatever you ask for


def smap_history(points, start, end):
    """SMAP L4 root-zone soil moisture for many points at once, walking 20 days at a time.

    points is a list of (key, lat, lon). Returns {key: {iso: m3/m3}}.
    """
    out = {}
    body_pts = {"points": [[lo, la] for _, la, lo in points],
                "spatialReference": {"wkid": 4326}}
    d0 = start
    while d0 <= end:
        d1 = min(d0 + timedelta(days=SMAP_SLICES - 1), end)
        ms = lambda d: int(datetime(d.year, d.month, d.day,
                                    tzinfo=timezone.utc).timestamp() * 1000)
        form = urllib.parse.urlencode({
            "f": "json", "geometry": json.dumps(body_pts),
            "geometryType": "esriGeometryMultipoint", "returnFirstValueOnly": "false",
            "outFields": "Name", "time": "%d,%d" % (ms(d0), ms(d1)),
            "sampleCount": "100000"}).encode()
        try:
            req = urllib.request.Request(
                SMAP_SERVICE, data=form,
                headers={"Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=300) as r:
                got = json.loads(r.read())
            for smp in got.get("samples") or []:
                name = ((smp.get("attributes") or {}).get("Name") or "")
                if len(name) < 8 or not name[-8:].isdigit():
                    continue
                iso = "%s-%s-%s" % (name[-8:-4], name[-4:-2], name[-2:])
                key = points[smp["locationId"]][0]
                out.setdefault(key, {})[iso] = float(smp["value"])
        except Exception as e:
            print("  SMAP %s failed: %s" % (d0, str(e)[:50]), file=sys.stderr)
        d0 = d1 + timedelta(days=1)
        time.sleep(0.15)
    return out

def acis_precip_history(state, lon, lat):
    """Daily rainfall for the whole record, pooled across every gauge that carries it.

    NOT one station, unlike temperature. Temperature over a region is smooth enough that one
    thermometer stands for the area; rain is not. A single July thunderstorm can drop an inch
    on one gauge and nothing five miles away, so one gauge would make a region look drowned or
    parched on the strength of where a cell happened to track. Averaging every gauge within
    reach of the crop is the closer measure of what the FIELDS got.

    The gauges are still fixed once and carried through every year, for the same reason the
    thermometer is: a pool that changes between years compares this season against a different
    instrument, which is not a comparison at all.
    """
    body = json.dumps({
        "state": state,
        "sdate": "%d-01-01" % min(YEARS), "edate": "%d-12-31" % max(YEARS),
        "elems": [{"name": "pcpn", "interval": "dly"}],
        "meta": ["ll", "name"]}).encode()
    req = urllib.request.Request(ACIS, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        d = json.loads(r.read().decode())

    start_d = date(min(YEARS), 1, 1)
    want = (date(max(YEARS), 12, 31) - start_d).days + 1
    kept, names = [], []
    for st in d.get("data", []):
        meta = st.get("meta") or {}
        ll = meta.get("ll")
        rows = st.get("data") or []
        if not ll or len(rows) < want * 0.95:
            continue
        if haversine_km(lat, lon, ll[1], ll[0]) > PRECIP_POOL_KM:
            continue
        series, good = {}, 0
        for i, x in enumerate(rows):
            v = x[0] if isinstance(x, list) else x
            if v in ("T", "t"):          # a trace is rain that fell and did not measure
                v = 0.0
            try:
                val = float(v)
            except (TypeError, ValueError):
                continue
            series[(start_d + timedelta(days=i)).isoformat()] = val
            good += 1
        if good < want * 0.90:           # a gauge must carry the WHOLE record, not most of it
            continue
        kept.append(series)
        names.append(meta.get("name"))
    if not kept:
        return None, []
    pooled = {}
    for day in set().union(*[set(k) for k in kept]):
        vals = [k[day] for k in kept if day in k]
        pooled[day] = round(sum(vals) / len(vals), 3)
    return pooled, names


def acis_precip_current(state, names, year):
    """This season's rainfall, from the SAME gauges the history was pooled from.

    Not from whatever happens to be reporting today. The index divides this season's growth by
    the average of eleven past ones, and a term computed from one set of instruments over a
    term computed from another does not cancel — it just moves the answer. Same gauges, same
    arithmetic, or no water term at all.
    """
    want = {n.strip().upper() for n in names if n}
    if not want:
        return {}
    body = json.dumps({
        "state": state,
        "sdate": "%d-01-01" % year, "edate": date.today().isoformat(),
        "elems": [{"name": "pcpn", "interval": "dly"}],
        "meta": ["name"]}).encode()
    req = urllib.request.Request(ACIS, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        d = json.loads(r.read().decode())
    start_d = date(year, 1, 1)
    per_day = {}
    for st in d.get("data", []):
        if (st.get("meta") or {}).get("name", "").strip().upper() not in want:
            continue
        for i, x in enumerate(st.get("data") or []):
            v = x[0] if isinstance(x, list) else x
            if v in ("T", "t"):
                v = 0.0
            try:
                val = float(v)
            except (TypeError, ValueError):
                continue
            per_day.setdefault((start_d + timedelta(days=i)).isoformat(), []).append(val)
    return {k: round(sum(v) / len(v), 3) for k, v in per_day.items()}

def build_history(centres):
    """Fetch once, keep forever. A past season does not change."""
    h = load_history()

    # SMAP for every region in one sweep, because the service takes unlimited points and only
    # twenty days at a time — so it is cheaper to ask for all seven regions at once than to
    # walk them one by one inside the loop below.
    smap_reach = min((max(v, default="") for v in (h.get("smap") or {}).values()),
                     default="")
    if smap_reach < (date.today() - timedelta(days=4)).isoformat():
        print("  SMAP root zone, all regions, %d-now..." % min(YEARS),
              file=sys.stderr, end="", flush=True)
        pts = [(rk, la, lo) for rk, (lo, la) in sorted(centres.items())]
        got = smap_history(pts, max(date(min(YEARS), 1, 1), date(2015, 4, 1)), date.today())
        if got:
            h.setdefault("smap", {})
            for rk, series in got.items():
                h["smap"].setdefault(rk, {}).update(series)
            print(" %d regions, %d days each"
                  % (len(got), len(next(iter(got.values())))), file=sys.stderr)
        else:
            print(" FAILED — the satellite half of the comparison is missing",
                  file=sys.stderr)
        os.makedirs(ARCHIVE, exist_ok=True)
        json.dump(h, open(HIST, "w"), separators=(",", ":"))

    for region, (lon, lat) in centres.items():
        if region not in h["radiation"]:
            print("  %-18s radiation 2000-2025..." % region, file=sys.stderr, end="", flush=True)
            try:
                h["radiation"][region] = power_history(lon, lat, YEARS)
                print(" %d days" % len(h["radiation"][region]), file=sys.stderr)
            except Exception as e:
                print(" FAILED %s" % str(e)[:50], file=sys.stderr)
            time.sleep(1.0)
        if region not in h["temperature"] or not h["temperature"][region].get("station"):
            print("  %-18s temperature, one station, all seasons..." % region,
                  file=sys.stderr, end="", flush=True)
            series, name = acis_history(STATE_OF[region], lon, lat)
            if series:
                h["temperature"][region] = {"station": name, "daily": series}
                print(" %s, %d days" % (name, len(series)), file=sys.stderr)
            else:
                print(" NO SINGLE STATION COVERS THE RECORD — region not indexed",
                      file=sys.stderr)
            time.sleep(1.0)
        # SOIL, for the whole record in one call. Refetched when it does not reach today,
        # because unlike a finished season the current one keeps growing.
        soil = h.setdefault("soil", {}).get(region) or {}
        reach = max((soil.get("GWETROOT") or {}), default="")
        if reach < (date.today() - timedelta(days=4)).isoformat():
            print("  %-18s soil moisture and actual ET %d-now..."
                  % (region, min(YEARS)), file=sys.stderr, end="", flush=True)
            try:
                got = power_soil(lon, lat, "%d0101" % min(YEARS),
                                 date.today().strftime("%Y%m%d"))
                h["soil"][region] = got
                print(" %d days" % len(got.get("GWETROOT") or {}), file=sys.stderr)
            except Exception as e:
                print(" FAILED %s" % str(e)[:60], file=sys.stderr)
            time.sleep(1.0)
        if region not in h.setdefault("precipitation", {}) or \
                not h["precipitation"][region].get("gauges"):
            print("  %-18s rainfall, every gauge in reach..." % region,
                  file=sys.stderr, end="", flush=True)
            series, names = acis_precip_history(STATE_OF[region], lon, lat)
            if series:
                h["precipitation"][region] = {"gauges": names, "daily": series}
                print(" %d gauges, %d days" % (len(names), len(series)), file=sys.stderr)
            else:
                print(" NO GAUGE COVERS THE RECORD — region has no water term",
                      file=sys.stderr)
            time.sleep(1.0)
        os.makedirs(ARCHIVE, exist_ok=True)
        json.dump(h, open(HIST, "w"), separators=(",", ":"))
    return h



def water_two_ways(power_series, smap_series, year, window):
    """This season's water against its own normal, measured twice, independently.

    WHY A RATIO AND NOT A THRESHOLD. The published POWER proxy compares wetness against a fixed
    cut-off, and that cut-off is a number we chose. A ratio needs no such number: each product
    is compared against ITS OWN eleven-year average over the same stretch of the calendar, so
    the units cancel and a model and a satellite become directly comparable. It also travels —
    a region in Turkey has its own eleven years and needs nothing from Nebraska.

    THE DISAGREEMENT IS THE POINT. Two independent products landing on the same answer is worth
    more than either alone. Where they diverge is where a reader should widen the band, and that
    judgement is exactly what a region with no probes in it cannot make for itself.

    window is (first_md, last_md) — the stretch of the year this season has actually reached.
    """
    lo, hi = window

    def season_mean(series, yr):
        vals = [v for k, v in series.items()
                if k.startswith("%d-" % yr) and lo <= k[5:] <= hi]
        return sum(vals) / len(vals) if len(vals) >= 20 else None

    out = {}
    for name, series in (("power", power_series), ("smap", smap_series)):
        if not series:
            continue
        now = season_mean(series, year)
        past = [m for m in (season_mean(series, y) for y in YEARS if y != year)
                if m is not None]
        if now is None or len(past) < 7:
            continue
        normal = sum(past) / len(past)
        if normal <= 0:
            continue
        out[name] = {"vs_normal_pct": round(100 * (now / normal - 1), 1),
                     "this_season": round(now, 4), "normal": round(normal, 4),
                     "years_compared": len(past)}
    if len(out) == 2:
        gap = abs(out["power"]["vs_normal_pct"] - out["smap"]["vs_normal_pct"])
        out["agreement"] = {
            "gap_points": round(gap, 1),
            "same_direction": (out["power"]["vs_normal_pct"] >= 0) ==
                              (out["smap"]["vs_normal_pct"] >= 0),
            "read_this_as": ("Both agree" if gap <= 5 else
                             "Broadly agree" if gap <= 12 else
                             "THEY DISAGREE — treat the water reading here as uncertain"),
            "why_two": "A land-surface model and a satellite, computed independently. Where "
                       "they part company, trust neither far."}
    return out or None

def canopy_on(canopy, md):
    """Canopy on this day, interpolated between the readings either side of it."""
    before = [k for k in canopy if k <= md]
    if not before:
        return None
    lo = max(before)
    after = [k for k in canopy if k > md]
    if not after:
        return canopy[lo]
    hi = min(after)
    span = (date.fromisoformat("2001-" + hi) - date.fromisoformat("2001-" + lo)).days
    if span <= 0:
        return canopy[lo]
    step = (date.fromisoformat("2001-" + md) - date.fromisoformat("2001-" + lo)).days
    return canopy[lo] + (canopy[hi] - canopy[lo]) * (step / span)


def winter_before(precip, year):
    """Millimetres of precipitation from 1 October to 31 March, the recharge the season opens
    with. Returns None when the record does not reach back that far — the first year of the
    archive has no winter in front of it."""
    if not precip:
        return None
    first = min(precip)
    if "%d-10-01" % (year - 1) < first:
        return None
    tot, days = 0.0, 0
    d, stop = date(year - 1, 10, 1), date(year, 3, 31)
    while d <= stop:
        v = precip.get(d.isoformat())
        if v is not None:
            tot += v
            days += 1
        d += timedelta(days=1)
    return tot * 25.4 if days >= 150 else None


def season_biomass(cls, spec, region, year, canopy, rad, temps, grn_for_planting,
                   stop_md=None, precip=None, lat=None, irrigated_share=0.0, soil=None,
                   awc_mm=None):
    """The same arithmetic every year, over the same stretch of the calendar.

    stop_md truncates a past season to the day of year this one has reached. Without it a
    finished season is compared against a half-finished one and EVERY class in EVERY region
    comes out below normal — which is exactly what happened: -2% to -47% across the board on
    15 September, when the historical seasons each carried six more weeks of accumulation.
    A uniform negative is not a season, it is a bug.
    """
    base, heat, gdd_mat, plant, rue, hi, commodity = spec
    days_iso = sorted(temps)
    if len(days_iso) < 120:
        return None
    st = {"hi": [temps[d][0] for d in days_iso], "lo": [temps[d][1] for d in days_iso]}
    start, _how = derive_planting(st, days_iso, soil_threshold(cls, commodity),
                                  plant, grn_for_planting)
    bio, gdd, n = 0.0, 0.0, 0
    matured_on = None
    repro_hot = repro_days = repro_warm_nights = 0
    # WATER. PLAN.md 3.5, and the leg this model ran without until 17 September 2026.
    # depletion is millimetres the root zone is short; it opens at whatever the winter left
    # and moves each day by that day's rain against that day's crop water use.
    winter_mm = winter_before(precip, year)
    have_balance = precip is not None and lat is not None and winter_mm is not None
    have_gwet = bool(soil)
    have_water = have_gwet if WATER_MODE == "gwet" else have_balance
    taw = awc_mm or TAW_MM
    depletion = opening_depletion(winter_mm, taw) if have_balance else 0.0
    wsum = wdays = 0
    for i, iso in enumerate(days_iso):
        d = date.fromisoformat(iso)
        if d < start:
            continue
        if stop_md and iso[5:] > stop_md:
            break                     # only as far into the year as this season has come
        hi_f, lo_f = st["hi"][i], st["lo"][i]
        mj = rad.get(iso)
        if mj is None:
            continue
        gdd += max((hi_f + lo_f) / 2 - base, 0)
        # Maturity stops the sum, because the crop genuinely stops filling. Removing it to
        # equalise the comparison window was tested and reverted: it made every class inside
        # a commodity identical — a kidney needing 1,900 growing degrees and a great northern
        # needing 1,600 came out the same — and moved southwest Nebraska from agreeing with
        # the canopy to 17 points away from it. An early-maturing hot year really does have
        # less fill time. That is signal, not an artefact.
        if matured_on is None and gdd > gdd_mat:
            matured_on = iso
        # FLOWERING AND POD SET. Heat here does not stop the leaves growing — the field stays
        # green — it aborts flowers and blasts pods, so the biomass is there and the seed is
        # not. That is why a hot year can show a normal canopy and a short crop, and it is why
        # a heat term applied to biomass was in the wrong place. Counted here as an
        # observation; what it costs in yield is for harvest data to say, not for me to assume.
        if 0.40 <= gdd / gdd_mat <= 0.80:
            repro_days += 1
            if hi_f >= heat:
                repro_hot += 1
            # WARM NIGHTS, counted separately. Day heat was the only thing counted here, and
            # tested against ten years of real harvests it predicted nothing. For common bean
            # the sharper reproductive signal is the NIGHT minimum: pollen fails when the crop
            # gets no relief after dark. Counting it is the only way to find out whether that
            # holds on this ground rather than assuming either way.
            if lo_f >= NIGHT_HOT_F:
                repro_warm_nights += 1
        if gdd > gdd_mat * 1.1:
            break
        repro = 0.40 <= (gdd / gdd_mat) <= 0.80
        # Readings land every ten days. Holding the last one flat between them undercounts a
        # rising canopy for ten days at a time — the crop grows through that gap and the model
        # pretended it stood still. Slope between the readings either side instead.
        g = canopy_on(canopy, iso[5:])
        if g is None:
            continue
        # THE WATER TERM.
        #
        # ks is the rainfed crop's water stress, 1 down to 0, from the running balance.
        # Irrigation is then allowed for OUT IN THE OPEN rather than as a floor inside the
        # stress curve: the irrigated share of the ground is taken to feel no shortage, the
        # rest feels all of it. irrigation.json says plainly that its share is the share of
        # GROUND that is irrigated and not the share of THIS crop that is watered, so this is
        # an assumption about bean fields made from a figure about all fields, and it is
        # written down here rather than buried.
        #
        # A region with no usable rain record gets w = 1 and is marked in the output. It is
        # not quietly given average water — a missing input has to be visible.
        w = 1.0
        ks = None
        if WATER_MODE == "gwet" and have_gwet:
            # MEASURED-SIDE WATER. No rain gauge, no evaporation formula, no guess at what the
            # winter left behind: the state of the root zone itself, every day.
            gw = soil.get(iso)
            if gw is not None:
                ks = min(gw / GWET_CRITICAL, 1.0)
        elif WATER_MODE == "balance" and have_balance:
            et0 = hargreaves_et0(hi_f, lo_f, lat, d.timetuple().tm_yday)
            etc = crop_coefficient(min(gdd / gdd_mat, 1.0)) * et0
            rain_mm = (precip.get(iso) or 0.0) * 25.4
            depletion = min(max(depletion - rain_mm + etc, 0.0), taw)
            ks = water_stress(depletion, taw)
        if ks is not None:
            w = irrigated_share + (1.0 - irrigated_share) * ks
            wsum += w
            wdays += 1
        bio += (rue * mj * PAR_FRACTION * fpar(g)
                * tstress(hi_f, lo_f, heat, reproductive=repro)
                * (w if WATER_IN_INDEX else 1.0))
        n += 1
    if n < 60:
        return None
    return (bio, n, matured_on, repro_hot, repro_days, repro_warm_nights,
            (wsum / wdays) if wdays else None)


def main():
    centres = region_centres()
    print("building the 2015-2025 record (once; a past season does not change)", file=sys.stderr)
    h = build_history(centres)

    obs = json.load(open(os.path.join(ARCHIVE, "canopy-history.json")))["observations"]
    # region-answers.json feeds the HEADLINE — the first number a broker reads. It was a
    # static file that nothing rebuilt, carrying a hand-set chickpea level of 700 lb/ac for a
    # crop USDA does not estimate in these states. The daily model now writes these blocks, so
    # the headline and the model cannot drift apart and no unsourced level can survive in it.
    answers_doc = json.load(open(os.path.join(DATA, "region-answers.json")))
    answers = answers_doc["regions"]
    pulses = json.load(open(os.path.join(ARCHIVE, "canopy-pulses.json")))["commodities"]
    IRRIGATION = json.load(open(os.path.join(DATA, "irrigation.json")))["crops"]
    try:
        SOILS = json.load(open(os.path.join(DATA, "soils.json")))
    except Exception:
        SOILS = {"regions": {}}
        print("NO SOILS FILE — falling back to one invented root-zone capacity. Run "
              "scripts/refresh/soils.py", file=sys.stderr)
    try:
        FLOWERING = json.load(open(os.path.join(DATA, "flowering-model.json")))
    except Exception:
        FLOWERING = {"publish": {}}
    try:
        CALIBRATION = json.load(open(os.path.join(DATA, "model-calibration.json")))
    except Exception:
        # No calibration file means nothing has been tested against harvests, and an untested
        # swing is not published. Zero is the safe failure, not full confidence.
        CALIBRATION = {"by_state_class": {}, "by_commodity": {}}
        print("NO CALIBRATION FILE — every swing scaled to zero. Run "
              "scripts/backtest.py --write-calibration gwet", file=sys.stderr)

    out = {}
    for region in NAMES:
        rad_all = h["radiation"].get(region) or {}
        temp_all = (h["temperature"].get(region) or {}).get("daily") or {}
        if not rad_all or not temp_all:
            continue

        # WATER, FOR EVERY YEAR INCLUDING THIS ONE. The archive holds 2015-2025 pooled from
        # gauges that carry the whole record; the current season is pulled from those same
        # gauges every run. They go into one series so that the winter of 2025-26 — which
        # straddles the two — can be totalled at all.
        soil_root = ((h.get("soil") or {}).get(region) or {}).get("GWETROOT") or {}
        smap_root = (h.get("smap") or {}).get(region) or {}
        # THE GROUND ITSELF, measured by the USDA soil survey rather than assumed. The old
        # code held one root-zone capacity, 120 mm, for all seven regions, and that number was
        # invented. Measured, they run from 61 mm on the Valent sands of southwest Nebraska to
        # 118 mm on the Keith silt loams of northwest Kansas — a field that holds half as much
        # water reaches stress in half the time, and the model could not see that at all.
        srec = (SOILS.get("regions") or {}).get(region) or {}
        awc_mm = srec.get("available_water_mm_root_zone")
        pblk = (h.get("precipitation") or {}).get(region) or {}
        precip = dict(pblk.get("daily") or {})
        if precip and pblk.get("gauges"):
            try:
                precip.update(acis_precip_current(STATE_OF[region], pblk["gauges"], THIS_YEAR))
            except Exception as e:
                print("  %s: current rainfall failed, %s" % (region, str(e)[:60]),
                      file=sys.stderr)
        # The centre of the crop, weighted by acres — needed for the sun angle in the
        # reference-ET calculation, and computed once for the region rather than per class.
        cells = [c for c in json.load(open(os.path.join(HERE, "bean-cells-by-county.json")))
                 if c["region"] == region]
        aw = sum(max(c["acres"], 0.01) for c in cells) or 1
        lat = sum(c["lat"] * max(c["acres"], 0.01) for c in cells) / aw
        lon = sum(c["lon"] * max(c["acres"], 0.01) for c in cells) / aw

        def canopy_for(year, commodity):
            if commodity == "DRY BEANS":
                return {k[5:]: v[region]["mean"] for k, v in obs.items()
                        if k.startswith(str(year)) and region in v
                        and v[region].get("q") != "suspect"}
            blk = pulses.get(commodity, {}).get("observations", {})
            return {k[5:]: (v[region]["mean"] if isinstance(v[region], dict) else v[region])
                    for k, v in blk.items()
                    if k.startswith(str(year)) and region in v
                    and (not isinstance(v[region], dict) or v[region].get("q") != "suspect")}

        per = {}
        for cls, spec in CLASSES.items():
            commodity = spec[6]
            # The share of this crop's ground that is irrigated, which is taken to feel no
            # water shortage. irrigation.json states outright that this is the share of GROUND
            # and not of this crop's fields; the assumption is recorded in the output.
            irr = ((IRRIGATION.get(commodity) or {}).get(region) or {}).get(
                "irrigated_share_of_ground")
            irr_share = (irr / 100.0) if irr is not None else 0.0
            now_canopy = canopy_for(THIS_YEAR, commodity)
            if not now_canopy:
                continue                      # no observation of this crop here

            # how far this season has actually come — every past year is cut to match
            reach = max(now_canopy)
            hist, hot_hist = [], []
            hot_by_year = {}
            for y in YEARS:
                t = {k: v for k, v in temp_all.items() if k.startswith(str(y))}
                c = canopy_for(y, commodity)
                if not t or not c:
                    continue
                r = {k: v for k, v in rad_all.items() if k.startswith(str(y))}
                got = season_biomass(cls, spec, region, y, c, r, t, c, stop_md=reach,
                                     precip=precip, lat=lat, irrigated_share=irr_share,
                                     soil=soil_root, awc_mm=awc_mm)
                if got:
                    hist.append(got[0])
                    hot_hist.append(got[3])
                    # Kept per year, not just averaged. Pairing these against USDA's actual
                    # harvested yields is the only way to find what a hot flowering day costs
                    # without inventing the figure.
                    hot_by_year[str(y)] = {"hot": got[3], "window": got[4], "warm_nights": got[5]}
            if len(hist) < 7:
                continue                      # too little history to divide by

            # this season, through the identical arithmetic
            now_temp = {}
            field = json.load(open(os.path.join(DATA, "station-field.json")))
            hist_temp = json.load(open(HIST))["temperature"]
            # ONE RULE, ONE PLACE — station_on_crop_ground() in yield_all.py. The history
            # station wins when this season carries it, because the ratio only cancels its
            # uncalibrated constants when both halves read the same ground; otherwise the
            # nearest station that is not more than 250 m above the crop. Measured cost of
            # getting this wrong on Panhandle pinto: about 88 lb/ac.
            hist_name = (hist_temp.get(region, {}) or {}).get("station", "")
            stn, how = station_on_crop_ground(field, lat, lon, hist_name)
            if how != "history station":
                print("  %s: %s -> %s (%s)" % (region, hist_name or "no history station",
                                               stn["name"], how), file=sys.stderr)
            for i, iso in enumerate(field["dates"]):
                a, b = stn["hi"][i], stn["lo"][i]
                if a is not None and b is not None:
                    now_temp[iso] = (a, b)
            now_rad = json.load(open(os.path.join(ARCHIVE, "solar-radiation.json")))
            now_r = now_rad["regions"].get(region, {}).get("mj_m2_day", {})
            got = season_biomass(cls, spec, region, THIS_YEAR, now_canopy, now_r, now_temp,
                                 now_canopy, precip=precip, lat=lat,
                                 irrigated_share=irr_share, soil=soil_root, awc_mm=awc_mm)
            if not got:
                continue

            mean_hist = statistics.mean(hist)
            if mean_hist <= 0:
                continue
            index = got[0] / mean_hist
            spread = statistics.pstdev(hist) / mean_hist if len(hist) > 2 else 0.0

            # Prefer USDA's measured level for this class in this state. The old baseline
            # was close for pinto and adrift for the smaller classes.
            # ONE RULE: no USDA-published level for this class in this state, no pounds per
            # acre on the page. The old fallback invented a level where USDA declines to
            # estimate one, which is precisely the kind of number that cannot be defended to
            # an agronomist. Condition and the seasonal index are still published — those are
            # measured — but the weight is not.
            # SCALE IT BACK TO WHAT THE HARVEST RECORD SUPPORTS.
            #
            # The raw index is how far this season's modelled growth sits from the model's own
            # eleven-year normal. Tested against every USDA harvest here, that swing was far
            # too big: publishing it raw was worse than assuming an average year in six of
            # seven crop-and-state combinations. assets/data/model-calibration.json holds, per
            # crop and state, how much of the swing survived that test — fitted on 2015-2025
            # and applied to a year that is not in the fit.
            #
            # For dry beans in Nebraska and Colorado that scaling is ZERO. The model has shown
            # no ability to call a bean year on this ground, so the honest published answer is
            # a normal year, and the raw figure stays visible beside it rather than being
            # deleted. For peas it is 1.02 — the model's swing was the right size all along.
            # This is not smoothing towards a trend. Nothing is fitted to a trend line; the
            # comparison is always against the mean of the other harvested years.
            cal = (CALIBRATION.get("by_state_class", {}).get(STATE_OF[region], {}) or {}).get(cls)
            if cal:
                scale, scale_from = cal["scale"], "this class in this state"
            else:
                scale = CALIBRATION.get("by_commodity", {}).get(commodity)
                scale_from = "the commodity average, no record for this class in this state"
            raw_index = index
            # UNTESTED IS NOT THE SAME AS TESTED AND FOUND WANTING.
            #
            # A scaling of zero for Nebraska pinto means the model was measured against ten
            # harvests and could not call the year, so a normal year is the honest answer.
            # Chickpeas have no USDA yield record in any of these states, so there is nothing
            # to measure against at all — and flattening them to zero would print a confident
            # "normal" that no evidence supports. Those keep the raw figure and are marked
            # uncalibrated, so the reader can tell "we checked and it is about normal" from
            # "we have never been able to check this".
            calibrated = scale is not None
            if not calibrated:
                scale, scale_from = None, "no harvest record for this crop in these states"
            else:
                index = 1 + scale * (raw_index - 1)
                spread = spread * scale if scale else spread

            # A SCALE OF ZERO MEANS WE CANNOT CALL THIS CROP. IT DOES NOT MEAN AN AVERAGE YEAR.
            #
            # Scaling a failed model to zero publishes the mean, and the mean is a CLAIM. On
            # 18 September 2026 that put "2,394 lb/ac, same as usual" on the front page for
            # Panhandle pinto. GAJ, who buys and sells this crop: "THIS WAS NOT A NORMAL YEAR."
            # He is right, and I had no evidence for normal either — I had evidence only that
            # our swing could not be trusted. Publishing the average dressed a total absence of
            # skill as a confident forecast, which is worse than the wrong swing it replaced,
            # because it looks reassuring.
            #
            # So a zero scale now WITHDRAWS the number. The measured conditions stay — water
            # below normal in every region, the driest winter in thirty-one years, the canopy,
            # the heat days — and those are what the page carries for these classes. An empty
            # space where a forecast would be is honest. An average is not.
            # A SCALING SO SMALL THAT IT CANNOT MOVE THE NUMBER IS NOT A FORECAST EITHER.
            #
            # Withdrawing only on an exact zero was not enough, and the build gate caught it
            # within a minute of being written: Wyoming's scaling of 0.139 published 2,282 lb/ac
            # for Big Horn pinto against a historical average of 2,291 — nine pounds apart,
            # which is four tenths of one percent and well inside the rounding a reader sees.
            # That is the historical average with a decimal of theatre on it.
            #
            # GAJ: "You are NOT ALLOWED to use Trend as our ultimate yield number." The test is
            # therefore on the OUTPUT, not on the intention: if what we would publish lands on
            # the historical average, it IS the historical average, whatever route produced it,
            # and it is withdrawn.
            TREND_TOLERANCE = 0.01
            withdrawn = calibrated and (
                scale == 0 or abs(index - 1.0) <= TREND_TOLERANCE)

            base, level_kind, proxy_note = usda_level(cls, region)
            unsourced = base is None
            per[cls] = {
                "index": round(index, 4),
                "vs_normal_pct": round(100 * (index - 1), 1),
                "raw_index": round(raw_index, 4),
                "raw_vs_normal_pct": round(100 * (raw_index - 1), 1),
                "swing_scale": (round(scale, 3) if scale is not None else None),
                "index_is_calibrated": calibrated,
                "swing_scale_from": scale_from,
                "swing_scale_why": "How much of the model's movement survived being tested "
                                   "against every USDA harvest in this state. 0 means it has "
                                   "shown no ability to call this crop here, so a normal year "
                                   "is the honest answer.",
                "years_of_model_history": len(hist),
                "model_year_to_year_spread_pct": round(100 * spread, 1),
                "days_counted": got[1],
                "matured_on": got[2],
                # measured, and the part an agronomist can act on today
                "flowering_hot_days": got[3],
                "flowering_window_days": got[4],
                "flowering_hot_days_normal": (round(statistics.mean(hot_hist), 1)
                                              if hot_hist else None),
                "flowering_hot_days_by_year": hot_by_year,
                "flowering_warm_nights": got[5],
                # THE WATER TERM, PUBLISHED RATHER THAN HIDDEN. 1.00 means the crop was never
                # short; lower means growth was held back by the running rainfall-against-crop
                # -water-use balance. null means this region has no gauge covering the whole
                # record, so no water was applied at all — which the reader is entitled to
                # know, because a missing input looks exactly like a comfortable one.
                "water_stress_proxy": (round(got[6], 3) if got[6] is not None else None),
                "water_stress_proxy_is": WATER_LABEL,
                "water_stress_proxy_note":
                    "Estimated from a land-surface model and the USDA soil survey. It is NOT "
                    "measured soil moisture. Growers measure the root zone with buried probes "
                    "at several depths, tensiometers or Watermark sensors, a hand probe, and "
                    "their own rain and irrigation-flow records. This has none of those. "
                    "1.00 means no estimated shortage; lower means more.",
                "water_source": WATER_MODE,
                "water_applied_to_yield": WATER_IN_INDEX,
                "root_zone_available_water_mm": awc_mm,
                "soil": (srec.get("top_soils") or [{}])[0].get("soil"),
                "slope_pct_mean": srec.get("slope_pct_mean"),
                "irrigated_share_of_ground_pct": (round(100 * irr_share, 1)
                                                  if irr is not None else None),
                "commodity": commodity,
                "level_is_usda_published": level_kind == "published",
                "level_kind": level_kind,
                "level_proxy_note": proxy_note,
            }
            # THE FLOWERING MODEL, WHERE IT HAS EARNED THE RIGHT TO SPEAK.
            #
            # GAJ: "build it on flowering as long as this takes into account loss due to heat."
            # The physiology is his and it is correct — a bean or a pea that flowers through a
            # run of hot days sheds pods while the field stays green, which is how a short crop
            # reads normal to a satellite counting leaves.
            #
            # Tested the same way as everything else: fitted on the other years, scored on the
            # year held out. It beats guessing for NEBRASKA PEAS by 34%, the best result
            # anything on this site has produced. For pinto and great northern it fails, like
            # every other approach tried — the physiology is real in the field and our nearest
            # thermometer cannot see it on those crops. So peas move to it and the dry beans
            # stay withdrawn. A model speaks where it has earned the right and nowhere else.
            fm = (FLOWERING.get("publish") or {}).get("%s|%s" % (STATE_OF[region], cls))
            if fm and got[4]:
                heat_frac = got[3] / got[4]
                pred = fm["intercept"] + sum(
                    c * (heat_frac if k == "flowering_heat_fraction" else got[0])
                    for k, c in fm["coefficients"].items())
                if pred > 0:
                    per[cls]["lb_ac"] = round(pred)
                    per[cls]["yield_from"] = "flowering heat, held-out skill %+.1f%%" % fm["skill_pct"]
                    # EVERY FIGURE A READER NEEDS TO REDO THIS SUM BY HAND. The replication
                    # gate caught the first version within seconds: the pea yield no longer came
                    # from baseline x index, so nothing on the page could reproduce it, and a
                    # number nobody can check is the thing this site exists not to publish.
                    per[cls]["flowering_heat_fraction"] = round(heat_frac, 4)
                    per[cls]["yield_equation"] = (
                        "lb/ac = intercept + coefficient x flowering_heat_fraction")
                    per[cls]["yield_intercept"] = fm["intercept"]
                    per[cls]["yield_coefficients"] = fm["coefficients"]
                    per[cls]["flowering_hot_days_counted"] = got[3]
                    per[cls]["flowering_window_days_counted"] = got[4]
                    per[cls]["yield_model_skill_pct"] = fm["skill_pct"]
                    per[cls]["baseline_lb_ac"] = fm["mean_yield_lb_ac"]
                    band = abs(pred) * 0.12
                    per[cls]["lb_ac_low"] = round(pred - band)
                    per[cls]["lb_ac_high"] = round(pred + band)
                    withdrawn = False
                    per[cls]["yield_withdrawn"] = False
                    per[cls].pop("yield_withdrawn_because", None)
                    # INDEX AND PERCENTAGE MUST TELL THE SAME STORY. The replication gate caught
                    # them disagreeing: the headline read +17.2% from the flowering model while
                    # the index beside it still carried the canopy's 0.80, which reads -19.6%.
                    # Two numbers on one line pointing opposite ways is the exact defect this
                    # site has already been through once.
                    per[cls]["canopy_index"] = per[cls]["index"]
                    per[cls]["canopy_vs_normal_pct"] = per[cls]["vs_normal_pct"]
                    per[cls]["index"] = round(pred / fm["mean_yield_lb_ac"], 4)
                    per[cls]["vs_normal_pct"] = round(
                        100 * (pred / fm["mean_yield_lb_ac"] - 1), 1)

            per[cls].setdefault("yield_withdrawn", withdrawn)
            per[cls]["yield_withdrawn"] = per[cls].get("yield_withdrawn", withdrawn)
            if withdrawn:
                per[cls]["yield_withdrawn_because"] = (
                    "Tested against every USDA harvest for this class in this state, this model "
                    "could not call the year, so anything we published would land on the "
                    "historical average. History is the yardstick here, never the answer. We "
                    "publish no yield for it rather than dress the average as a forecast. The "
                    "measured conditions below are what we do know.")
                per[cls]["baseline_lb_ac"] = base
            elif per[cls].get("yield_coefficients"):
                pass                          # owned by the flowering model — third and last
                                              # path that used to overwrite it
            elif base:
                per[cls]["lb_ac"] = round(base * index)
                per[cls]["lb_ac_low"] = round(base * index * (1 - spread))
                per[cls]["lb_ac_high"] = round(base * index * (1 + spread))
                per[cls]["baseline_lb_ac"] = base
        # ONE SEASONAL SIGNAL PER COMMODITY, not one per class.
        #
        # USDA maps a single dry bean crop, so every class here is read off the SAME satellite
        # pixels and the same weather. Any class-to-class difference in this index therefore
        # came from the constants -- growing-degree requirement, heat threshold, light-use
        # efficiency, harvest index -- and none of those are sourced. Tested against USDA's own
        # per-class harvest record for 2016-2025, publishing that variation made the class
        # ratios wrong by about 10 percentage points and, in Wyoming, backwards.
        #
        # Averaging the index across a commodity's classes marginalises over those arbitrary
        # constants instead of pretending they measure something. Class differences now come
        # from the measured level, which is what actually differs between classes.
        #
        # What is knowingly given up: a kidney needing 1,900 growing degrees really does
        # experience a different season from a great northern needing 1,600, and in a short
        # season that matters. That is real, we cannot yet quantify it, and our version of it
        # made the answer worse. It stays out until there is evidence for it.
        by_com = {}
        for cls, row in per.items():
            by_com.setdefault(row["commodity"], []).append(row)
        for commodity, rows in by_com.items():
            if len(rows) < 2:
                continue
            shared = statistics.mean(r["index"] for r in rows)
            shared_spread = statistics.mean(r["model_year_to_year_spread_pct"] for r in rows) / 100
            for r in rows:
                r["index_own_class"] = r["index"]
                # 4 dp, not 3. The index is never shown to a reader — it exists so the
                # arithmetic can be checked — and at 3 dp great northern published 2,048
                # against a baseline x index of 2,046.3, which does not reproduce.
                r["index"] = round(shared, 4)
                r["vs_normal_pct"] = round(100 * (shared - 1), 1)
                r["index_is_shared_across_classes"] = True
                # PUBLISH THE SPREAD THAT ACTUALLY BUILDS THE BAND. It used to publish each
                # class's OWN spread beside a band built from the commodity mean, so a reader
                # doing the obvious arithmetic -- middle number plus or minus the spread
                # printed next to it -- got a different range from the one on the page. Eleven
                # of thirteen bands failed that check. The numbers were right; the input
                # needed to verify them was missing, which for this site is the same as wrong.
                # The per-class figure is kept alongside, exactly as index_own_class is.
                r["model_year_to_year_spread_own_class_pct"] = r["model_year_to_year_spread_pct"]
                r["model_year_to_year_spread_pct"] = round(100 * shared_spread, 1)
                r["spread_is_shared_across_classes"] = True
                # A WITHDRAWN YIELD STAYS WITHDRAWN. This block re-derives the pounds from the
                # commodity-shared index, and it put the number straight back on a class whose
                # yield had just been pulled for having no demonstrated skill. That is how
                # "2,394 lb/ac, same as usual" reached the front page for a season the trade
                # knew was short.
                # ONE OWNER PER NUMBER. This block re-derives pounds from the commodity-shared
                # canopy index, and it has now clobbered a published yield TWICE: once putting
                # a withdrawn figure back, and once overwriting the flowering model's pea
                # number so it no longer matched its own published equation. GAJ asked why
                # defects keep returning — this is the answer in one place. A class whose yield
                # came from somewhere else keeps it, and the rule is written as a condition
                # rather than as a memory.
                if r.get("yield_withdrawn"):
                    for k in ("lb_ac", "lb_ac_low", "lb_ac_high"):
                        r.pop(k, None)
                elif r.get("yield_coefficients"):
                    pass                      # owned by the flowering model, not by this block
                elif r.get("baseline_lb_ac"):
                    b = r["baseline_lb_ac"]
                    r["lb_ac"] = round(b * shared)
                    r["lb_ac_low"] = round(b * shared * (1 - shared_spread))
                    r["lb_ac_high"] = round(b * shared * (1 + shared_spread))
        if per:
            # BOTH PRODUCTS, PUBLISHED SIDE BY SIDE, EVERY RUN. Region level, because the water
            # signal is regional and does not differ between bean classes.
            reach_md = max((max(c) for c in (canopy_for(THIS_YEAR, sp[6])
                                             for sp in CLASSES.values()) if c), default=None)
            water2 = None
            if reach_md:
                water2 = water_two_ways(soil_root, smap_root, THIS_YEAR, ("03-01", reach_md))
            out[region] = {"name": NAMES[region], "classes": per}
            if water2:
                out[region]["water_two_ways"] = water2

    # Push today's USDA-sourced figures into the file the headline reads, and DELETE any
    # yield block whose level USDA does not publish. A missing number is honest; an invented
    # one is not.
    stripped = written = 0
    for rname, rblock in answers.items():
        for cname, cblock in (rblock.get("classes") or {}).items():
            got = out.get(rname, {}).get("classes", {}).get(cname)
            if got and got.get("lb_ac") and got.get("level_kind") in ("published", "proxy"):
                cblock["yield"] = {
                    "low": got["lb_ac_low"], "high": got["lb_ac_high"], "mid": got["lb_ac"],
                    "baseline": got["baseline_lb_ac"],
                    "years": got["years_of_model_history"],
                    "adjust_pct": got["vs_normal_pct"],
                    "level_kind": got["level_kind"],
                    "level_note": got.get("level_proxy_note"),
                    "level_source": ("USDA published yield for this class in this state"
                                     if got["level_kind"] == "published"
                                     else "nearest comparable published state, see level_note")}
                written += 1
            elif cblock.get("yield") is not None:
                cblock["yield"] = None
                stripped += 1
    answers_doc["yield_blocks"] = ("written by yield_index.py; a class with no USDA-published "
                                   "level carries no yield, by design")
    json.dump(answers_doc, open(os.path.join(DATA, "region-answers.json"), "w"), indent=1)
    print("\nheadline file: %d yields written, %d unsourced yields removed"
          % (written, stripped), file=sys.stderr)

    json.dump({"schema": "gisit.yield-index.v1",
               "year": THIS_YEAR,
               "method": "the same biomass model run over 2015-2025 and over this season, "
                         "divided one by the other so the uncalibrated constants cancel; the "
                         "resulting index applied to the harvested record for that class",
               "why": "the absolute model reads about a third of real yields because the "
                      "greenness-to-light conversion and the efficiency constants are not "
                      "calibrated for these crops. Those errors are identical every year, so "
                      "they divide out of a ratio. What survives is the measured part: how "
                      "much light this canopy intercepted against an average season.",
               "no_current_usda_input": "USDA supplies only the fixed historical level. No "
                                        "current-year USDA estimate or forecast enters.",
               "limits": [
                   "This is an estimate from remote sensing, not a validated forecast and not "
                   "a measurement of your field. It is built by running the same biomass model "
                   "over 2015-2025 and over this season and dividing one by the other, so the "
                   "uncalibrated constants cancel, then applying that ratio to the harvested "
                   "record for the class. Its level rests on that record; its movement rests "
                   "on measured canopy, measured sunlight and station temperature.",
                   "The band is the model's own year-to-year spread — how much this signal "
                   "moves between seasons — not a statistical confidence interval.",
                   "Heat during flowering and pod set is COUNTED and shown but not yet priced "
                   "into the number. It aborts flowers while the canopy stays green, so in a "
                   "hot flowering year the estimate is more likely to be generous than mean. "
                   "Read the hot-days column beside it.",
                   "Chickpeas, lentils and peas are sampled on their own crop pixels; a region "
                   "with no reading for a crop gets no number rather than a borrowed one.",
                   "Irrigation scheduling, cultivar, disease, hail and management are not "
                   "observed. Where this disagrees with your own field records, your field is "
                   "the better evidence, and telling us so is what sharpens it.",
               ],
               "regions": out}, open(OUT, "w"), indent=1)

    print("\n2026 AGAINST THE MODEL'S OWN 2015-2025 HISTORY\n", file=sys.stderr)
    print("%-20s %s" % ("class", " ".join("%10s" % NAMES[r][:10] for r in NAMES if r in out)),
          file=sys.stderr)
    for cls in CLASSES:
        cells = []
        for r in NAMES:
            if r not in out:
                continue
            c = out[r]["classes"].get(cls)
            cells.append("%10s" % ("%+.0f%%" % c["vs_normal_pct"] if c else "-"))
        if any(x.strip() != "-" for x in cells):
            print("%-20s %s" % (cls, " ".join(cells)), file=sys.stderr)
    print("\nwrote %s" % OUT, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
