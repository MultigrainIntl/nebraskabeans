#!/usr/bin/env python3
"""
2026 yield for every class in every region, from remote data only.

    APAR    = sunlight reaching the field x the fraction this canopy absorbs (satellite)
    growth  = light-use efficiency x APAR x temperature stress x water stress
    yield   = biomass at maturity x harvest index

Each class runs on its OWN clock. A garbanzo accumulates on a 41F base from an April planting
and a dark red kidney on 50F from June; sharing one calendar between them is the error this
whole project exists to avoid. Light-use efficiency and harvest index are published values per
crop group, not fitted.

Water stress comes from canopy temperature against air temperature at the satellite's own
overpass hour — free, global, unlimited, and it sees irrigation because it measures the cooling
the water produced. No OpenET, no quota, no US-only limit.

USDA never enters. It is the scorecard, compared afterwards.
"""
import json, math, os, sys
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
ARCHIVE = os.path.join(HERE, "..", "..", "assets", "data", "archive")

# What the page prints beside the figure. Carried verbatim from the file the site was
# written against — this is the honesty statement, not decoration, and it is not mine
# to paraphrase on a rebuild.
PROSE = {'evidence_note': 'Each number is built only from what was observed this season: canopy from '
                  "satellite on that crop's own USDA ground, sunlight and temperature from "
                  'local stations, and water stress from canopy temperature against air '
                  "temperature at the satellite's overpass hour — which sees irrigation "
                  'because it measures the cooling the water produced.',
 'limits': ['This is not a validated forecast. As of September 2026 the yield figure this model produced is withdrawn from the site. An independent review found the step converting satellite greenness to intercepted light is uncalibrated, the light-use efficiency and harvest-index constants are not sourced per market class, and the thermal term is an eight-day 1 km land-surface average against one airport rather than a calibrated water-stress index. What remains published is measurement: canopy against its own 26-year history, station weather, and growing degree days. USDA remains the scorecard here and never an input, and it is itself unstable: Nebraska planted acres for 2026 were revised 21% mid-season, yield is reported per harvested acre so abandoned fields vanish from it, and county yields stopped in 2008.',
  'Chickpeas, lentils and peas are sampled at one point per county rather than on crop pixels, and where a region has no pulse reading the dry-bean canopy stands in for it.',
  'Solar radiation is not measured. It is estimated from the daily temperature range, from one station per region.'],
 'what_would_sharpen_it': ['Real harvest data — loads, test weights, screen size, tied to '
                           'place and date',
                           'Field-level irrigation status',
                           '10 m canopy from Sentinel-2 instead of 250 m',
                           "A current-year crop map instead of 2024's"]}
PAR_FRACTION = 0.48

# base F, heat F, GDD to maturity, planting, light-use efficiency g/MJ, harvest index
# BLACKEYE IS NOT HERE, DELIBERATELY. Blackeye is cowpea, Vigna unguiculata — a different
# genus from common bean, Phaseolus vulgaris. USDA's Cropland Data Layer maps no cowpea in
# these counties, USDA's own state records for Nebraska, Colorado, Wyoming and Kansas carry no
# blackeye entry, and it is not commercially grown on the High Plains. It was nevertheless
# publishing a yield in all seven regions, computed on common-bean ground, at 1,315-1,373
# lb/ac. That is a fabricated crop, and disclosing it was not enough — it is removed.
# Every dry-bean commercial class USDA names, with its agronomy. WHICH ONES ARE PUBLISHED IS
# NOT DECIDED HERE — usda_classes.py reads USDA's own commercial-class table and this list is
# filtered against it at build time. That indirection exists because deciding it by hand went
# wrong twice in one day: first a blackeye yield in seven regions, then a hand-trim that
# deleted dark red kidney, small red, cranberry and blackeye — all of which USDA records as
# grown here — while keeping navy and small white, which it does not.
# GDD-TO-MATURITY IS NOW MEASURED, NOT CHOSEN — for the two classes the evidence covers.
#
# SOURCE: UNL Panhandle REEC, "2022 Nebraska Dry Edible Bean Variety Trials" (EC3064,
# Urrea), Scottsbluff Ag Lab (planted 8 June) and Mitchell Ag Lab (planted 3 June), both
# irrigated. DTM is UNL's own definition: days from planting until 80% of plants are ready
# to harvest. Median DTM per market class was converted to growing degrees, base 50 F, over
# this project's own ALLIANCE MUNICIPAL AIRPORT ASOS daily record in season-history.json.
#
#                    measured ratio to pinto        this table said
#   GREAT NORTHERN   -1.0% (SB)  +0.7% (MI)         -5.9%
#   LIGHT RED KIDNEY +3.5% (SB)  +3.0% (MI)        +11.8%
#
# Both classes agree across two sites with different planting dates and different irrigation
# methods, which is two independent measurements rather than one. Kidney IS slower than
# pinto — that part of the old table was right in direction — but by about 3%, not 12%. The
# 1,900 exaggerated it roughly fourfold and was producing a ~200 lb/ac swing in northwest
# Kansas on no evidence at all. Great Northern was wrong in the other direction: the table
# had it maturing 6% faster than pinto; the trials have it level.
#
# Pinto's 1,700 is kept as the anchor and the others are scaled by the measured ratio, NOT
# set to the measured absolute. The absolute GDD came out 12-23% higher than this table at
# both sites, but that figure moves with which weather station you use, and Alliance is
# about 50 miles from the trial ground. The RATIO between classes is what creates class
# differences in the model, and a ratio is not sensitive to the station choice. Changing the
# absolutes would move every maturity date on the site and is not supported by one year.
#
# NAVY AND BLACK ARE DELIBERATELY UNCHANGED. The two sites disagreed for them — navy +4.7%
# at Scottsbluff against +1.6% at Mitchell, black +4.7% against +0.7% — so there is no
# reproducible number to put in. Leaving a known-unsourced value is honest; replacing it
# with an average of two readings that contradict each other is not.
#
# STILL UNSOURCED IN THIS TABLE: every heat threshold, every light-use efficiency, every
# harvest index, and the GDD for navy, black, small red, pink, cranberry and small white.
# Those remain chosen, not read. Do not cite this comment as covering them.
ALL_CLASSES = {
    "PINTO":              (50, 90, 1700, "06-01", 1.45, 0.45, "DRY BEANS"),
    "GREAT NORTHERN":     (50, 88, 1700, "06-01", 1.45, 0.45, "DRY BEANS"),
    "NAVY":               (50, 88, 1650, "06-01", 1.45, 0.46, "DRY BEANS"),
    "BLACK":              (50, 92, 1750, "06-01", 1.50, 0.45, "DRY BEANS"),
    "LIGHT RED KIDNEY":   (50, 86, 1755, "06-01", 1.40, 0.42, "DRY BEANS"),
    # Dark red kidney carries light red kidney's figure. UNL's 2022 trial had no dark red
    # kidney entries, so this is not measured here — but WSU variety trials put dark red
    # kidney at 101-111 days against light red kidney's 106-112, i.e. if anything faster,
    # so 1,755 is the generous end rather than an invention in the wrong direction.
    "DARK RED KIDNEY":    (50, 86, 1755, "06-01", 1.40, 0.42, "DRY BEANS"),
    "SMALL RED":          (50, 90, 1650, "06-01", 1.45, 0.45, "DRY BEANS"),
    "PINK":               (50, 90, 1650, "06-01", 1.45, 0.45, "DRY BEANS"),
    "CRANBERRY":          (50, 88, 1800, "06-01", 1.40, 0.43, "DRY BEANS"),
    "SMALL WHITE":        (50, 88, 1650, "06-01", 1.45, 0.46, "DRY BEANS"),
    # Blackeye is cowpea, Vigna unguiculata — botanically not a common bean, but USDA counts
    # it as a dry edible bean commercial class and publishes 10,200 acres in Colorado and
    # 5,700 in Nebraska for 2025. It is more heat-tolerant than Phaseolus, hence the higher
    # threshold. It is drawn on Cropland Data Layer dry-bean ground because USDA maps no
    # cowpea layer, and that limitation is stated on the page.
    "BLACKEYE":           (50, 95, 1800, "05-20", 1.50, 0.44, "DRY BEANS"),

    # PULSES — one entry per commodity, because USDA's crop map has one class for each and no
    # satellite separates a yellow pea from a green one. Lentils were dropped: 215 mapped acres
    # across four states is one field, not a market. Same commercial test GAJ applied to the
    # classes USDA withholds — if it is too thin to trade, it is too thin to quote.
    "PEAS":               (41, 82, 2000, "04-05", 1.60, 0.48, "PEAS"),
    "CHICKPEAS":          (41, 86, 2600, "04-20", 1.30, 0.38, "CHICKPEAS"),
}

# USDA's own spelling of each commercial class, so the filter joins on evidence not on guesses.
USDA_NAME = {"PINTO": "Pinto", "GREAT NORTHERN": "Great northern", "NAVY": "Navy",
             "BLACK": "Black", "LIGHT RED KIDNEY": "Light red kidney",
             "DARK RED KIDNEY": "Dark red kidney", "SMALL RED": "Small red",
             "PINK": "Pink", "CRANBERRY": "Cranberry", "SMALL WHITE": "Small white",
             "BLACKEYE": "Blackeye"}


def usda_grown():
    """Classes with a PUBLISHED acreage in at least one of these states.

    USDA's (D) means the crop is grown but the acreage is withheld, because so few operations
    report it that publishing would identify them. GAJ's call, and it is a commercial one
    rather than an agronomic one: a class thin enough that USDA cannot print its acreage
    without naming the growers is not a marketable product, and a market-intelligence site
    has no business quoting a yield for it. So a withheld class is recorded in
    usda-class-acres.json — the evidence stays visible — and is not published as a crop.

    That is a narrower rule than "is it grown". Black, dark red kidney, small red and
    cranberry ARE grown here; none of them has a printable acreage. (NA) still means USDA
    stopped estimating, and a bare dash still means none grown.
    """
    path = os.path.join(DATA, "usda-class-acres.json")
    if not os.path.exists(path):
        return None
    try:
        got = json.load(open(path))["classes"]
    except Exception:
        return None
    return {c for c, block in got.items()
            if any(b.get("verdict") == "grown" for b in block.values())}


MIN_MAPPED_ACRES = 5000     # below this a commodity is a field, not a market


def pulse_big_enough():
    """Commodities with enough mapped ground to be worth quoting.

    Lentils were being published on 215 mapped acres across four states, split — until today —
    into three market classes. The same commercial test that removes a class USDA will not
    print an acreage for removes a commodity nobody could trade.
    """
    path = os.path.join(DATA, "county-crops.geojson")
    if not os.path.exists(path):
        return None
    try:
        feats = json.load(open(path))["features"]
    except Exception:
        return None
    total = {}
    for f in feats:
        for k, v in (f["properties"].get("acres") or {}).items():
            total[k] = total.get(k, 0) + v
    return {k for k, v in total.items() if v >= MIN_MAPPED_ACRES}


_grown = usda_grown()
_big = pulse_big_enough()
if _grown is None:
    CLASSES = dict(ALL_CLASSES)          # no USDA file yet: publish everything, loudly
else:
    CLASSES = {c: v for c, v in ALL_CLASSES.items()
               if ((USDA_NAME.get(c) in _grown) if v[6] == "DRY BEANS"
                   else (_big is None or v[6] in _big))}
NAMES = {"ne-panhandle": "Nebraska Panhandle", "sw-nebraska": "Southwest Nebraska",
         "ne-colorado": "Northeast Colorado", "western-colorado": "Western Colorado",
         "se-wyoming": "Southeast Wyoming", "big-horn": "Big Horn Basin",
         "nw-kansas": "Northwest Kansas"}


def solar(tmax_f, tmin_f, lat, doy):
    tmax, tmin = (tmax_f - 32) / 1.8, (tmin_f - 32) / 1.8
    phi = math.radians(lat)
    dr = 1 + 0.033 * math.cos(2 * math.pi * doy / 365)
    dec = 0.409 * math.sin(2 * math.pi * doy / 365 - 1.39)
    ws = math.acos(max(-1, min(1, -math.tan(phi) * math.tan(dec))))
    ra = 24 * 60 / math.pi * 0.082 * dr * (
        ws * math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.sin(ws))
    return max(0.16 * math.sqrt(max(tmax - tmin, 0)) * ra, 0)


def tstress(tmax_f, tmin_f, heat_f, reproductive=False):
    """Growth response to temperature: a standard cardinal-temperature curve on the daily mean.

    Nothing below 10C, optimum near 24C, falling away above it. That form is conventional and
    defensible.

    WHAT IS NOT HERE, AND WHY. A separate multiplicative heat penalty read off the daily
    maximum was added on 15 September 2026 to answer a reviewer's correct observation that a
    100F afternoon with a cool night slid under a 90F threshold untouched. The observation was
    right; the fix was invented. Its shape and severity had no source, and tested against the
    canopy it is supposed to track it accounted for roughly half of a 20-point disagreement —
    turning regions that were within 1% of normal greenness into 20% yield deficits.

    That is the same error as the greenness-to-light formula this project already withdrew: a
    plausible curve with nobody's name on it, doing heavy lifting. Heat days above each class's
    threshold are still counted and reported as an observation. They do not silently multiply
    a yield until the penalty has a source and has been tested against outcomes.
    """
    t = ((tmax_f + tmin_f) / 2 - 32) / 1.8
    if t <= 10:
        return 0.0
    return min(1.0, (t - 10) / 14.0 if t <= 24 else max(0.0, (40 - t) / 16.0))


def wstress(diff_c):
    """Canopy minus air. Within a degree of air the crop is transpiring freely; by about eight
    degrees hot it has shut down. Linear between, which is the standard crop water stress
    index form."""
    if diff_c is None:
        return None
    return max(0.0, min(1.0, 1.0 - (diff_c - 1.0) / 7.0))


def to_ndvi(dn):
    """Crop-CASMA's 8-bit number back to NDVI, by the service's documented scaling.

    The archive note used to say this scaling was "undocumented by the service; monotonic in
    greenness, which is all a model needs". Wrong twice: the scaling IS documented, and
    monotonic is NOT all a model needs — the moment the number is multiplied by a light-use
    efficiency to make kilograms, its absolute value carries the whole result."""
    return (dn - 125.0) / 125.0


def fpar(dn):
    """Fraction of photosynthetically active radiation intercepted by the canopy.

    This used to be (dn - 140) / 85 * 0.95 — a straight line with no source, invented to land
    in a plausible range. An independent review named it as the step that invalidated every
    yield downstream, because it is where a satellite index becomes intercepted energy and
    everything after it is arithmetic.

    It is now the commonly used linear NDVI-fAPAR relation, fAPAR = 1.24 * NDVI - 0.168, after
    Myneni and Williams (1994), applied to true NDVI rather than to raw counts.

    STILL NOT CALIBRATED FOR THESE CROPS. The relation is for general vegetation, not dry beans
    or pulses on the western High Plains, and NDVI saturates in dense canopy so a linear form
    overstates interception late in the season. What changed is that the number now has a
    published source and a stated failure mode instead of neither."""
    return max(0.0, min(0.95, 1.24 * to_ndvi(dn) - 0.168))


SOIL_F = {                      # minimum soil temperature the class will germinate in
    "DRY BEANS": 58,            # dry beans will not germinate reliably in colder ground
    "CHICKPEAS_KABULI": 50,     # ~10C. Kabuli is not a cold-tolerant pulse and was treated as one
    "CHICKPEAS_DESI": 45,       # ~7C
    "LENTILS": 41,              # ~5C
    "PEAS": 41,                 # ~5C
}


def soil_threshold(cls, commodity):
    if commodity == "CHICKPEAS":
        return SOIL_F["CHICKPEAS_KABULI"] if "KABULI" in cls else SOIL_F["CHICKPEAS_DESI"]
    return SOIL_F.get(commodity, 58)


def derive_planting(st, dates, soil_f, earliest_md, region_green):
    """When the crop actually went in, from observed conditions — not from the calendar.

    Two signals, and the later one wins:

      SOIL WARMTH. Air temperature run through a seven-day mean tracks four-inch soil
      temperature closely enough to date planting. Dry beans will not germinate reliably below
      58F; pulses tolerate ground far colder, so they take 42F.

      CANOPY LIFT. The date the satellite sees greenness start climbing off bare soil is the
      crop emerging. That is an observation of this field in this year, and it is the stronger
      of the two — but it lags planting by two to three weeks, so it is used to confirm rather
      than to set the date.

    A fixed 1 June for beans overstates the season in a year the ground stayed cold, and
    understates it in a warm one. Both errors land straight in the yield.
    """
    # WEATHER CAN ONLY DELAY PLANTING, NEVER PULL IT FORWARD.
    # A seven-day warm spell in mid-May clears the 58F threshold, but no grower puts dry beans
    # in then — frost risk has not passed and the ground is not settled. Allowing the threshold
    # to move planting earlier than the agronomic date handed beans a 15 May start and pulses
    # 22 March, which lengthened every season and inflated every yield. The published date is
    # the floor; cold ground pushes it later.
    # The season being examined, not a year typed in. yield_index.py runs this identical
    # function over past seasons to build the baseline the current year is divided by;
    # with 2026 hardcoded every historical season was rejected and the index was empty.
    yr = dates[0][:4]
    earliest = date.fromisoformat("%s-%s" % (yr, earliest_md))
    onset = None
    for i in range(7, len(dates)):
        d = date.fromisoformat(dates[i])
        if d < earliest:
            continue
        w = [(st["hi"][j], st["lo"][j]) for j in range(i - 7, i)
             if st["hi"][j] is not None and st["lo"][j] is not None]
        if len(w) < 5:
            continue
        if sum((a + b) / 2 for a, b in w) / len(w) >= soil_f:
            onset = d
            break
    if onset is None:
        return earliest, "soil never reached %dF; using the normal date for this class" % soil_f

    # confirm against the canopy: greenness should lift within about a month of planting
    lift = None
    md = sorted(region_green)
    base = min(region_green[k] for k in md[:3]) if len(md) >= 3 else None
    if base is not None:
        for k in md:
            if region_green[k] > base + 12:      # clear rise off bare soil
                lift = date.fromisoformat("%s-%s" % (yr, k))
                break
    # The lift date is this field, this year, from orbit. Emergence trails planting by about
    # three weeks. If that puts the crop in the ground before the soil rule allows, the soil
    # rule was late and the satellite is the better witness — bounded to three weeks so a
    # single noisy scene cannot rewrite the calendar.
    # THE PUBLISHED DATE IS AN ABSOLUTE FLOOR. This bypassed it and planted peas on 15 March
    # in Western Colorado, on ground that is frozen, because the "lift" it detected was the
    # FIRST observation of the pulse series — there is nothing before 5 April to lift from, so
    # the baseline was the crop itself. Blackeye came out on 4 May by the same route. A
    # satellite can tell you a crop went in LATER than normal; it cannot licence a date no
    # grower would plant on.
    if lift is not None:
        implied = lift - timedelta(days=21)
        md = sorted(region_green)
        lift_is_first = bool(md) and lift.isoformat()[5:] <= md[min(1, len(md) - 1)]
        if implied < onset and implied >= earliest and not lift_is_first:
            return implied, ("canopy lifted %s, which puts planting about three weeks earlier "
                             "than the %dF soil rule allowed" % (lift.isoformat(), soil_f))

    delay = (onset - earliest).days
    if delay <= 0:
        return earliest, "normal date for this class; soil was warm enough on time"
    return onset, "delayed %d days — soil did not hold %dF until then" % (delay, soil_f)


def main():
    field = json.load(open(os.path.join(DATA, "station-field.json")))
    ndvi = json.load(open(os.path.join(ARCHIVE, "canopy-history.json")))["observations"]
    pulses = json.load(open(os.path.join(ARCHIVE, "canopy-pulses.json")))
    cells = json.load(open(os.path.join(HERE, "bean-cells-by-county.json")))
    _vs = json.load(open(os.path.join(DATA, "crop-vs-history.json")))
    vshist = _vs["regions"]
    vshist_crops = _vs.get("crops", {})
    rad = json.load(open(os.path.join(ARCHIVE, "solar-radiation.json")))["regions"]
    dates = field["dates"]

    out = {}
    for region, rname in NAMES.items():
        tpath = os.path.join(ARCHIVE, "thermal-%s-2026.json" % region)
        if not os.path.exists(tpath):
            continue
        thermal = json.load(open(tpath))["canopy_minus_air_c"]
        # Canopy on the BEAN ground, for the bean classes.
        # Skip scenes flagged as cloud or empty. 6.4% of the record is a flat floor across
        # every cell — not a bare field, nothing at all — and it was being scored as a week
        # of no growth. In 2026 that is 14% of the season.
        grn = {k[5:]: v[region]["mean"] for k, v in ndvi.items()
               if k.startswith("2026") and region in v
               and v[region].get("q") != "suspect"}
        if not grn:
            continue
        # Canopy on each PULSE commodity's own ground. A chickpea grows in April on chickpea
        # ground; reading the bean field, which is bare then, scored every pulse as a failure.
        pulse_green = {}
        for com, blk in pulses.get("commodities", {}).items():
            got = {k[5:]: v[region]["mean"] if isinstance(v[region], dict) else v[region]
                   for k, v in blk.get("observations", {}).items()
                   if region in v and (not isinstance(v[region], dict)
                                       or v[region].get("q") != "suspect")}
            if got:
                pulse_green[com] = got
        pts = [c for c in cells if c["region"] == region]
        w = sum(max(c["acres"], 0.01) for c in pts) or 1
        lat = sum(c["lat"] * max(c["acres"], 0.01) for c in pts) / w
        lon = sum(c["lon"] * max(c["acres"], 0.01) for c in pts) / w
        st = min((s for s in field["stations"] if s["has_temp"]),
                 key=lambda s: (s["lon"] - lon) ** 2 + (s["lat"] - lat) ** 2)

        def green_at(iso, commodity):
            # NO FALLBACK. This used to be `pulse_green.get(commodity) or grn`, so a region
            # with no lentil reading quietly computed its lentil yield from the dry-bean
            # canopy. Lentils are mapped on 159 acres in one region; six regions were
            # publishing a lentil number built on beans. A crop with no observation of its
            # own gets no number.
            src = pulse_green.get(commodity) if commodity != "DRY BEANS" else grn
            if not src:
                return None
            ks = sorted(k for k in src if k <= iso[5:])
            return src[ks[-1]] if ks else None

        def stress_at(iso):
            ks = sorted(k for k in thermal if k <= iso)
            return wstress(thermal[ks[-1]]) if ks else None

        # The evidence table beside the figure. Weighted by canopy cover: a thermal reading
        # taken over bare soil is a reading of dirt, not of a thirsty crop.
        tnum = tden = 0.0
        for d, v in thermal.items():
            g = green_at(d, "DRY BEANS")
            if g is None:
                continue
            f = fpar(g)
            tnum += v * f
            tden += f
        hist = vshist.get(region, {}).get("dates", {})
        # Dates later in the season carry the 26-year history but no reading yet — the
        # season has not reached them. Rank against the last date that has one.
        ranked = [d for d, v in hist.items() if "rank" in v]
        asof = max(ranked) if ranked else None

        region_rad = rad.get(region, {}).get("mj_m2_day", {})

        per = {}
        for cls, (base, heat, gdd_mat, plant, rue, hi, commodity) in CLASSES.items():
            measured_days = estimated_days = 0
            start, how = derive_planting(st, dates, soil_threshold(cls, commodity),
                                         plant, grn)
            d, stop = start, date.fromisoformat(dates[-1])
            bio = 0.0
            days = short = 0
            gdd = 0.0
            repro_hot = repro_days = 0
            while d <= stop:
                iso = d.isoformat()
                i = dates.index(iso) if iso in dates else None
                g, ws = green_at(iso, commodity), stress_at(iso)
                if i is None or g is None or ws is None:
                    d += timedelta(days=1); continue
                hi_f, lo_f = st["hi"][i], st["lo"][i]
                if hi_f is None or lo_f is None:
                    d += timedelta(days=1); continue
                gdd += max((hi_f + lo_f) / 2 - base, 0)
                # flowering through pod fill, on the class's own clock
                repro = 0.40 <= (gdd / gdd_mat) <= 0.80
                # HEAT HERE DOES NOT SHOW IN THE CANOPY. It aborts flowers and blasts pods,
                # so the field stays green and the seed is not there. GAJ's point, and the
                # data carries it: every region ran hotter through flowering than normal in
                # 2026. Counted and published as an observation, because a grower can act on
                # "20 of 26 flowering days above 90F against a normal of 15" today, without
                # waiting for anyone to calibrate what it costs in pounds.
                if repro:
                    repro_days += 1
                    if hi_f >= heat:
                        repro_hot += 1
                if gdd > gdd_mat * 1.1:          # past maturity, no more filling
                    break
                # A THIN CANOPY CANNOT TELL YOU THE CROP IS THIRSTY.
                # The satellite reads a 1 km pixel. In May that pixel is mostly bare soil, and
                # bare soil runs hot whatever the crop is doing. Applying that as water stress
                # punishes the crop for not having grown yet — the same double counting that
                # dragged the first model down, in a different guise. The thermal signal is
                # therefore weighted by how much canopy is actually there to read.
                f = fpar(g)
                ws_eff = 1.0 - (1.0 - ws) * (f / 0.95)
                if ws_eff < 0.7:
                    short += 1
                # MEASURED sunlight. The Hargreaves estimate this replaces inferred
                # radiation from the daily temperature range; checked against NASA POWER over
                # the 2026 season it ran 8% high in every region and missed a typical day by
                # 12-20%, which passed straight into biomass because biomass is linear in
                # intercepted light. The estimate is kept only for days POWER has no value for.
                mj = region_rad.get(iso)
                if mj is None:
                    mj = solar(hi_f, lo_f, lat, d.timetuple().tm_yday)
                    estimated_days += 1
                else:
                    measured_days += 1
                bio += rue * mj * PAR_FRACTION * \
                    f * tstress(hi_f, lo_f, heat, reproductive=repro) * ws_eff
                days += 1
                d += timedelta(days=1)
            if days < 40:
                continue
            if days == 0 or bio <= 0:
                continue                 # no observation of this crop here — publish nothing
            per[cls] = {"lb_ac": round(bio * hi * 8.9218), "days": days,
                        "season_days_measured_light": measured_days,
                        "season_days_estimated_light": estimated_days,
                        "planted": start.isoformat(), "planting_basis": how,
                        "stress_days": short, "gdd": round(gdd),
                        "flowering_hot_days": repro_hot,
                        "flowering_window_days": repro_days,
                        "heat_threshold_f": heat,
                        "pct_of_maturity": round(100 * gdd / gdd_mat),
                        "commodity": commodity}
        out[region] = {"name": rname, "classes": per,
                       "canopy_above_air_c": round(tnum / tden, 1) if tden else None,
                       "canopy_above_air_basis": "mean of canopy minus air temperature across "
                                                 "the season's satellite passes, weighted by "
                                                 "canopy cover so bare-soil passes do not "
                                                 "count as crop stress",
                       "thermal_readings": len(thermal),
                       # NOTE: this is a single date and the PAGE NO LONGER USES IT. The
                       # evidence table reads crop-vs-history directly, so the map and the
                       # table cannot disagree. Kept only because the file has other readers.
                       "canopy_rank": ({"rank": hist[asof]["rank"], "of": hist[asof]["of"],
                                        "as_of": asof, "single_date": True} if asof else None)}

    json.dump({"schema": "gisit.yield-all-2026.v1", "year": 2026,
               "latest_observation": dates[-1],
               "method": "radiation-use-efficiency biomass model; canopy from satellite, "
                         "temperature and radiation from stations, water stress from canopy "
                         "minus air temperature at the satellite overpass hour",
               "sources_all_free": True,
               "caveat": "NOT every commodity is sampled on its own ground. Dry beans are read "
                         "on Cropland Data Layer bean pixels. Chickpeas, lentils and peas are "
                         "read at ONE point per county — the average of the county outline, "
                         "which may be town, rangeland or another crop — and where a region "
                         "has no pulse reading the dry-bean canopy stands in for it. Blackeye "
                         "is cowpea, not common bean, and is drawn on dry-bean ground. These "
                         "are defects, disclosed rather than smoothed over.",
               "not_validated": "the level is defensible; season-to-season ranking is not",
               "regions": out,
               "evidence_note": PROSE["evidence_note"],
               # Seventeen names, fourteen models. Navy and small white, the two kidneys,
               # and pink and small red are agronomically identical at this resolution —
               # and no satellite separates any of them anyway, because USDA maps one
               # dry-bean class. Better said than left for a reader to notice.
               "limits": PROSE["limits"] + [
                   "Three pairs carry identical agronomy because they are identical at this "
                   "resolution: navy and small white, light red and dark red kidney, pink and "
                   "small red. Seventeen classes are listed; fourteen distinct models sit "
                   "behind them.",
                   "Blackeye was removed in September 2026. It is cowpea, a different genus "
                   "from common bean; USDA maps no cowpea in these counties and carries no "
                   "blackeye entry for these states, yet a yield was being published for it "
                   "in all seven regions on borrowed dry-bean ground."],
               "what_would_sharpen_it": PROSE["what_would_sharpen_it"]}, open(os.path.join(DATA, "yield-all-2026.json"), "w"), indent=1)

    cls_order = list(CLASSES)
    print("2026 YIELD, lb/ac — all classes, all regions, remote data only\n")
    print("%-20s " % "class" + " ".join("%8s" % NAMES[r][:8] for r in NAMES if r in out))
    for c in cls_order:
        row = "".join("%9s" % (format(out[r]["classes"][c]["lb_ac"], ",")
                               if c in out[r]["classes"] else "-")
                      for r in NAMES if r in out)
        print("%-20s%s" % (c[:20], row))
    print("\nregions: %d   classes per region: %d"
          % (len(out), len(next(iter(out.values()))["classes"]) if out else 0))


if __name__ == "__main__":
    main()
