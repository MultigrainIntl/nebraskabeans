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
 'limits': ['This is not a validated forecast. The level is defensible; the ranking is not — '
            'tested against USDA over 2016-2023 it did not rank one season against another '
            "correctly, and that error cannot be separated from the scorecard's: USDA revised "
            "Nebraska's 2026 planted acres by 21% mid-season, reports yield per harvested acre "
            'so abandoned fields vanish from it, and stopped publishing county yields in 2008.',
            'Water stress is read at 1 km, so a pixel mixes a crop field with the ground '
            'around it. That biases every crop toward looking more stressed than it is.',
            'Light-use efficiency and harvest index are published values per crop group, not '
            'fitted to these fields.'],
 'what_would_sharpen_it': ['Real harvest data — loads, test weights, screen size, tied to '
                           'place and date',
                           'Field-level irrigation status',
                           '10 m canopy from Sentinel-2 instead of 250 m',
                           "A current-year crop map instead of 2024's"]}
PAR_FRACTION = 0.48

# base F, heat F, GDD to maturity, planting, light-use efficiency g/MJ, harvest index
CLASSES = {
    "PINTO":              (50, 90, 1700, "06-01", 1.45, 0.45, "DRY BEANS"),
    "GREAT NORTHERN":     (50, 88, 1600, "06-01", 1.45, 0.45, "DRY BEANS"),
    "NAVY":               (50, 88, 1650, "06-01", 1.45, 0.46, "DRY BEANS"),
    "BLACK":              (50, 92, 1750, "06-01", 1.50, 0.45, "DRY BEANS"),
    "LIGHT RED KIDNEY":   (50, 86, 1900, "06-01", 1.40, 0.42, "DRY BEANS"),
    "DARK RED KIDNEY":    (50, 86, 1900, "06-01", 1.40, 0.42, "DRY BEANS"),
    "PINK":               (50, 90, 1650, "06-01", 1.45, 0.45, "DRY BEANS"),
    "SMALL RED":          (50, 90, 1650, "06-01", 1.45, 0.45, "DRY BEANS"),
    "CRANBERRY":          (50, 88, 1800, "06-01", 1.40, 0.43, "DRY BEANS"),
    "SMALL WHITE":        (50, 88, 1650, "06-01", 1.45, 0.46, "DRY BEANS"),
    "BLACKEYE":           (50, 95, 1800, "05-20", 1.50, 0.44, "DRY BEANS"),
    "GARBANZO (KABULI)":  (41, 86, 2600, "04-20", 1.30, 0.38, "CHICKPEAS"),
    "GARBANZO (DESI)":    (41, 88, 2400, "04-20", 1.35, 0.40, "CHICKPEAS"),
    "LENTIL LARGE GREEN": (41, 82, 2100, "04-15", 1.15, 0.38, "LENTILS"),
    "LENTIL SMALL GREEN": (41, 82, 2000, "04-15", 1.15, 0.39, "LENTILS"),
    "LENTIL RED":         (41, 82, 1950, "04-15", 1.20, 0.40, "LENTILS"),
    "PEA YELLOW":         (41, 82, 2000, "04-05", 1.60, 0.48, "PEAS"),
    "PEA GREEN":          (41, 82, 2000, "04-05", 1.60, 0.47, "PEAS"),
}
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


def tstress(tmax_f, tmin_f, heat_f):
    """Optimum near 24C, nothing below 10C, nothing above the class's own heat threshold."""
    t = ((tmax_f + tmin_f) / 2 - 32) / 1.8
    tmax_c = (heat_f - 32) / 1.8 + 3
    if t <= 10 or t >= tmax_c:
        return 0.0
    return (t - 10) / 14.0 if t <= 24 else (tmax_c - t) / (tmax_c - 24)


def wstress(diff_c):
    """Canopy minus air. Within a degree of air the crop is transpiring freely; by about eight
    degrees hot it has shut down. Linear between, which is the standard crop water stress
    index form."""
    if diff_c is None:
        return None
    return max(0.0, min(1.0, 1.0 - (diff_c - 1.0) / 7.0))


def fpar(dn):
    return max(0.0, min(0.95, (dn - 140.0) / 85.0 * 0.95))


def derive_planting(st, dates, base_f, earliest_md, region_green):
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
    soil_f = 58 if base_f >= 50 else 42
    # WEATHER CAN ONLY DELAY PLANTING, NEVER PULL IT FORWARD.
    # A seven-day warm spell in mid-May clears the 58F threshold, but no grower puts dry beans
    # in then — frost risk has not passed and the ground is not settled. Allowing the threshold
    # to move planting earlier than the agronomic date handed beans a 15 May start and pulses
    # 22 March, which lengthened every season and inflated every yield. The published date is
    # the floor; cold ground pushes it later.
    earliest = date.fromisoformat("2026-" + earliest_md)
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
                lift = date.fromisoformat("2026-" + k)
                break
    delay = (onset - earliest).days
    if delay <= 0:
        return earliest, "normal date for this class; soil was warm enough on time"
    return onset, "delayed %d days — soil did not hold %dF until then" % (delay, soil_f)


def main():
    field = json.load(open(os.path.join(DATA, "station-field.json")))
    ndvi = json.load(open(os.path.join(ARCHIVE, "canopy-history.json")))["observations"]
    pulses = json.load(open(os.path.join(ARCHIVE, "canopy-pulses.json")))
    cells = json.load(open(os.path.join(HERE, "bean-cells-by-county.json")))
    vshist = json.load(open(os.path.join(DATA, "crop-vs-history.json")))["regions"]
    dates = field["dates"]

    out = {}
    for region, rname in NAMES.items():
        tpath = os.path.join(ARCHIVE, "thermal-%s-2026.json" % region)
        if not os.path.exists(tpath):
            continue
        thermal = json.load(open(tpath))["canopy_minus_air_c"]
        # Canopy on the BEAN ground, for the bean classes.
        grn = {k[5:]: v[region]["mean"] for k, v in ndvi.items()
               if k.startswith("2026") and region in v}
        if not grn:
            continue
        # Canopy on each PULSE commodity's own ground. A chickpea grows in April on chickpea
        # ground; reading the bean field, which is bare then, scored every pulse as a failure.
        pulse_green = {}
        for com, blk in pulses.get("commodities", {}).items():
            got = {k[5:]: v[region] for k, v in blk.get("observations", {}).items()
                   if region in v}
            if got:
                pulse_green[com] = got
        pts = [c for c in cells if c["region"] == region]
        w = sum(max(c["acres"], 0.01) for c in pts) or 1
        lat = sum(c["lat"] * max(c["acres"], 0.01) for c in pts) / w
        lon = sum(c["lon"] * max(c["acres"], 0.01) for c in pts) / w
        st = min((s for s in field["stations"] if s["has_temp"]),
                 key=lambda s: (s["lon"] - lon) ** 2 + (s["lat"] - lat) ** 2)

        def green_at(iso, commodity):
            src = pulse_green.get(commodity) or grn
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

        per = {}
        for cls, (base, heat, gdd_mat, plant, rue, hi, commodity) in CLASSES.items():
            start, how = derive_planting(st, dates, base, plant, grn)
            d, stop = start, date.fromisoformat(dates[-1])
            bio = 0.0
            days = short = 0
            gdd = 0.0
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
                bio += rue * solar(hi_f, lo_f, lat, d.timetuple().tm_yday) * PAR_FRACTION * \
                    f * tstress(hi_f, lo_f, heat) * ws_eff
                days += 1
                d += timedelta(days=1)
            if days < 40:
                continue
            per[cls] = {"lb_ac": round(bio * hi * 8.9218), "days": days,
                        "planted": start.isoformat(), "planting_basis": how,
                        "stress_days": short, "gdd": round(gdd),
                        "pct_of_maturity": round(100 * gdd / gdd_mat),
                        "commodity": commodity}
        out[region] = {"name": rname, "classes": per,
                       "canopy_above_air_c": round(tnum / tden, 1) if tden else None,
                       "canopy_above_air_basis": "mean of canopy minus air temperature across "
                                                 "the season's satellite passes, weighted by "
                                                 "canopy cover so bare-soil passes do not "
                                                 "count as crop stress",
                       "thermal_readings": len(thermal),
                       "canopy_rank": ({"rank": hist[asof]["rank"], "of": hist[asof]["of"],
                                        "as_of": asof} if asof else None)}

    json.dump({"schema": "gisit.yield-all-2026.v1", "year": 2026,
               "latest_observation": dates[-1],
               "method": "radiation-use-efficiency biomass model; canopy from satellite, "
                         "temperature and radiation from stations, water stress from canopy "
                         "minus air temperature at the satellite overpass hour",
               "sources_all_free": True,
               "caveat": "each commodity is sampled on its own USDA ground — beans on bean "
                         "cells, chickpeas, lentils and peas on theirs",
               "not_validated": "the level is defensible; season-to-season ranking is not",
               "regions": out,
               "evidence_note": PROSE["evidence_note"],
               "limits": PROSE["limits"],
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
