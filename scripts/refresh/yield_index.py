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
from datetime import date, timedelta

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
NIGHT_HOT_F = 68
THIS_YEAR = 2026
SEASON = ("03-01", "10-31")

sys.path.insert(0, HERE)
from yield_all import (CLASSES, NAMES, PAR_FRACTION, fpar, tstress, soil_threshold,
                       derive_planting)

USDA_CLASS = {"PINTO": "Pinto", "GREAT NORTHERN": "Great northern",
              "LIGHT RED KIDNEY": "Light red kidney", "DARK RED KIDNEY": "Dark red kidney",
              "NAVY": "Navy", "BLACK": "Black", "BLACKEYE": "Blackeye"}
FULL_STATE = {"NE": "Nebraska", "CO": "Colorado", "WY": "Wyoming", "KS": "Kansas"}


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
    return b["mean_lb_ac"] if b else None


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


def build_history(centres):
    """Fetch once, keep forever. A past season does not change."""
    h = load_history()
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
        os.makedirs(ARCHIVE, exist_ok=True)
        json.dump(h, open(HIST, "w"), separators=(",", ":"))
    return h


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


def season_biomass(cls, spec, region, year, canopy, rad, temps, grn_for_planting,
                   stop_md=None):
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
        bio += rue * mj * PAR_FRACTION * fpar(g) * tstress(hi_f, lo_f, heat, reproductive=repro)
        n += 1
    return (bio, n, matured_on, repro_hot, repro_days, repro_warm_nights) if n >= 60 else None


def main():
    centres = region_centres()
    print("building the 2015-2025 record (once; a past season does not change)", file=sys.stderr)
    h = build_history(centres)

    obs = json.load(open(os.path.join(ARCHIVE, "canopy-history.json")))["observations"]
    answers = json.load(open(os.path.join(DATA, "region-answers.json")))["regions"]
    pulses = json.load(open(os.path.join(ARCHIVE, "canopy-pulses.json")))["commodities"]

    out = {}
    for region in NAMES:
        rad_all = h["radiation"].get(region) or {}
        temp_all = (h["temperature"].get(region) or {}).get("daily") or {}
        if not rad_all or not temp_all:
            continue

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
                got = season_biomass(cls, spec, region, y, c, r, t, c, stop_md=reach)
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
            pts = [c for c in json.load(open(os.path.join(HERE, "bean-cells-by-county.json")))
                   if c["region"] == region]
            w = sum(max(c["acres"], 0.01) for c in pts) or 1
            lat = sum(c["lat"] * max(c["acres"], 0.01) for c in pts) / w
            lon = sum(c["lon"] * max(c["acres"], 0.01) for c in pts) / w
            stn = min((s for s in field["stations"] if s["has_temp"]),
                      key=lambda s: (s["lon"] - lon) ** 2 + (s["lat"] - lat) ** 2)
            for i, iso in enumerate(field["dates"]):
                a, b = stn["hi"][i], stn["lo"][i]
                if a is not None and b is not None:
                    now_temp[iso] = (a, b)
            now_rad = json.load(open(os.path.join(ARCHIVE, "solar-radiation.json")))
            now_r = now_rad["regions"].get(region, {}).get("mj_m2_day", {})
            got = season_biomass(cls, spec, region, THIS_YEAR, now_canopy, now_r, now_temp,
                                 now_canopy)
            if not got:
                continue

            mean_hist = statistics.mean(hist)
            if mean_hist <= 0:
                continue
            index = got[0] / mean_hist
            spread = statistics.pstdev(hist) / mean_hist if len(hist) > 2 else 0.0

            # Prefer USDA's measured level for this class in this state. The old baseline
            # was close for pinto and adrift for the smaller classes.
            base = usda_level(cls, region)
            if base is None:
                base = ((answers.get(region, {}).get("classes", {}).get(cls, {}) or {})
                        .get("yield", {}) or {}).get("baseline")
            per[cls] = {
                "index": round(index, 3),
                "vs_normal_pct": round(100 * (index - 1), 1),
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
                "commodity": commodity,
            }
            if base:
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
                r["index"] = round(shared, 3)
                r["vs_normal_pct"] = round(100 * (shared - 1), 1)
                r["index_is_shared_across_classes"] = True
                if r.get("baseline_lb_ac"):
                    b = r["baseline_lb_ac"]
                    r["lb_ac"] = round(b * shared)
                    r["lb_ac_low"] = round(b * shared * (1 - shared_spread))
                    r["lb_ac_high"] = round(b * shared * (1 + shared_spread))
        if per:
            out[region] = {"name": NAMES[region], "classes": per}

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
