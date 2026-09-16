#!/usr/bin/env python3
"""
Where each crop stands RIGHT NOW against its own history, on its own ground.

TWO DEFECTS THIS FIXES, both caught by GAJ looking at the finished page.

ONE CROP'S HISTORY SHOWN FOR ALL OF THEM. This file used to carry no crop dimension at all.
It was built on dry-bean ground and nothing else, so selecting chickpeas, lentils or peas
displayed bean greenness under the heading "Crop vs its own history". For three of the four
commodities it was not their history. Pulse canopy now exists back to 2015 on each crop's own
Cropland Data Layer pixels, so each commodity is compared against itself.

A RANK OVERSTATED WHAT IT MEANT. The seasons sit between roughly 168 and 190 counts — a 12%
spread across 27 years. A year 2% above average therefore lands at "18 of 27", and 8% above
average reads "25 of 26". Every positive year climbed the ranking and the whole page looked
like a run of exceptional seasons. The rank is still published, because it answers a real
question, but it never travels without the percentage beside it and a plain statement of
whether the year is inside the ordinary range at all. Most years are.

There is also a genuine upward drift of about 2% across the record — better varieties, better
management, and a sensor whose processing has changed more than once in 26 years. Recent
seasons therefore rank a little high for reasons that have nothing to do with this season, and
the file says so rather than letting the reader assume otherwise.

This is not a forecast and does not wait on USDA. Every number is final the moment it is
observed.
"""
import json, os, re, glob
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
ARCHIVE = os.path.join(DATA, "archive")
OUT = os.path.join(DATA, "crop-vs-history.json")

NAMES = {"ne-panhandle": "Nebraska Panhandle", "sw-nebraska": "Southwest Nebraska",
         "ne-colorado": "Northeast Colorado", "western-colorado": "Western Colorado",
         "se-wyoming": "Southeast Wyoming", "big-horn": "Big Horn Basin",
         "nw-kansas": "Northwest Kansas"}

THIS_YEAR = 2026
MIN_YEARS = 8          # below this a "rank against history" is not a rank, it is a coincidence


def bean_observations():
    src = os.path.join(ARCHIVE, "canopy-history.json")
    if not os.path.exists(src):
        raise SystemExit("canopy-history.json missing — run ndvi_cropmask.py first")
    obs = json.load(open(src))["observations"]
    cache = os.path.join(ARCHIVE, "casma-region-cache")
    for f in glob.glob(os.path.join(cache, "*_%d*.json" % THIS_YEAR)):
        d = json.load(open(f))
        if not d:
            continue
        m = re.search(r"_(\d{4})(\d{2})(\d{2})\.json$", f)
        if m:
            obs.setdefault("%s-%s-%s" % m.groups(), {}).update(d)
    return obs


def pulse_observations():
    src = os.path.join(ARCHIVE, "canopy-pulses.json")
    if not os.path.exists(src):
        return {}
    blocks = json.load(open(src)).get("commodities", {})
    return {com: blk.get("observations", {}) for com, blk in blocks.items()}


def series_for(obs):
    """region -> mm-dd -> year -> value, with cloud and empty scenes dropped."""
    by = defaultdict(lambda: defaultdict(dict))
    for key, regions in obs.items():
        year, mm, dd = key.split("-")
        for r, s in regions.items():
            if r not in NAMES:
                continue
            row = s if isinstance(s, dict) else {"mean": s}
            # A flat floor across every cell is cloud or an empty scene, not a bare field.
            if row.get("q") == "suspect":
                continue
            by[r]["%s-%s" % (mm, dd)][int(year)] = row["mean"]
    return by


# When each crop is actually in the field. Comparing a pass taken after harvest is comparing
# stubble to stubble: kabuli chickpea goes in on 20 April and comes off in late August, so a
# 5 September reading says nothing about the crop, and that reading was what the page led with.
SEASON = {"DRY BEANS": ("06-01", "09-25"),
          "CHICKPEAS": ("05-01", "08-25"),
          "LENTILS":   ("05-01", "08-15"),
          "PEAS":      ("04-25", "08-15")}


def season_to_date(dates, window, latest):
    """The whole season so far, not one pass.

    A single satellite pass swings twenty points between adjacent dates — chickpeas in the
    Nebraska Panhandle ran -19.7% on 5 August and +11.3% on 5 September. Leading with the last
    one turned noise into a headline. Averaging every in-season pass to date, against the same
    stretch of every past season, gives +0.5%: an ordinary year, which is what it is.
    """
    lo, hi = window
    md_in = [md for md in dates if lo <= md <= min(hi, latest)]
    if len(md_in) < 3:
        return None
    years = defaultdict(list)
    for md in md_in:
        for y, v in dates[md].items():
            years[y].append(v)
    # a year only counts if it covered most of the same window
    need = len(md_in) * 0.6
    means = {y: sum(v) / len(v) for y, v in years.items() if len(v) >= need}
    cur = means.pop(THIS_YEAR, None)
    if cur is None or len(means) < MIN_YEARS:
        return None
    hist = sorted(means.values())
    mean = sum(hist) / len(hist)
    p20, p80 = hist[int(len(hist) * 0.2)], hist[int(len(hist) * 0.8)]
    return {"passes": len(md_in), "window": [lo, min(hi, latest)],
            "now": round(cur, 1), "mean": round(mean, 1),
            "n_years": len(hist),
            "vs_mean_pct": round(100 * (cur - mean) / mean, 1),
            "rank": sum(1 for v in hist if v < cur) + 1, "of": len(hist) + 1,
            "typical": bool(p20 <= cur <= p80),
            "band": ("above the usual range" if cur > p80 else
                     "below the usual range" if cur < p20 else "inside the usual range")}


def build(by, commodity=None, latest_hint="12-31"):
    out = {}
    for r, dates in by.items():
        series = {}
        for md, years in sorted(dates.items()):
            hist = sorted(v for y, v in years.items() if y < THIS_YEAR)
            if len(hist) < MIN_YEARS:
                continue
            mean = sum(hist) / len(hist)
            p20 = hist[int(len(hist) * 0.2)]
            p80 = hist[int(len(hist) * 0.8)]
            row = {"n_years": len(hist),
                   "min": round(hist[0], 1), "max": round(hist[-1], 1),
                   "mean": round(mean, 1),
                   "p20": round(p20, 1), "p80": round(p80, 1)}
            if THIS_YEAR in years:
                cur = years[THIS_YEAR]
                row["now"] = round(cur, 1)
                row["vs_mean_pct"] = round(100 * (cur - mean) / mean, 1)
                row["rank"] = sum(1 for v in hist if v < cur) + 1
                row["of"] = len(hist) + 1
                # THE PART THE RANK ALONE DOES NOT TELL YOU. Three seasons in five land
                # between p20 and p80 by construction; saying so stops a mid-pack year
                # reading as a standout because it happened to rank high in a tight field.
                row["typical"] = bool(p20 <= cur <= p80)
                row["band"] = ("above the usual range" if cur > p80 else
                               "below the usual range" if cur < p20 else
                               "inside the usual range")
                row["spread_pct"] = round(100 * (hist[-1] - hist[0]) / mean, 1)
            series[md] = row
        if series:
            block = {"name": NAMES[r], "dates": series}
            win = SEASON.get(commodity or "DRY BEANS")
            if win:
                std = season_to_date(dates, win, latest_hint)
                if std:
                    block["season_to_date"] = std
            out[r] = block
    return out


def main():
    bean_by = series_for(bean_observations())
    pulse_by = {com: series_for(obs) for com, obs in pulse_observations().items()}
    latest = max((md for by in [bean_by] + list(pulse_by.values())
                  for dates in by.values() for md, yrs in dates.items()
                  if THIS_YEAR in yrs), default="12-31")

    crops = {"DRY BEANS": build(bean_by, "DRY BEANS", latest)}
    for com, by in pulse_by.items():
        got = build(by, com, latest)
        if got:
            crops[com] = got

    json.dump({
        "schema": "gisit.crop-vs-history.v2",
        "what": "greenness on EACH crop's own USDA ground, this season against its own history",
        "latest_observation": latest,
        "read_the_rank_carefully":
            "The seasons sit within about a 12% spread, so a year 2% above average can rank "
            "18th of 27 and 8% above average can rank 25th of 26. The rank answers 'how many "
            "past years were greener', which is a real question, but it is not a measure of how "
            "much better this year is. The percentage and the band beside it are. Most years "
            "fall inside the usual range, and this file says which do.",
        "drift": "Greenness on this ground has drifted up roughly 2% across the record — "
                 "varieties, management and a sensor whose processing has changed more than "
                 "once since 2000. Recent seasons therefore rank slightly high for reasons "
                 "that have nothing to do with the current season.",
        "coverage": "Dry beans run from 2000. Chickpeas, lentils and peas run from 2015, "
                    "which is as far back as their crop-pixel record goes, so their ranks are "
                    "against fewer years and are stated as such.",
        "not_a_forecast": "This is an observation, not a prediction. Nothing here waits on "
                          "USDA, and nothing here is revised: a satellite pass is final when "
                          "it lands.",
        "why_not_usda": "USDA moved Nebraska's 2026 planted acres from 101,000 in March to "
                        "80,000 in August, and has published no 2026 state yield for any of "
                        "these states.",
        "source": {"name": "USDA Crop-CASMA NDVI, 250 m, EPSG:5070",
                   "mask": "USDA Cropland Data Layer — class 42 dry beans, 51 chickpeas, "
                           "52 lentils, 53 dry peas",
                   "api_key_required": False},
        "caveat": "the crop mask is one release applied to earlier years; crop ground moves, "
                  "and pulses move more than beans because they sit in rotation. The 8-bit "
                  "values are compared, never quoted as an NDVI value.",
        "crops": crops,
        # kept so nothing that still reads the old shape breaks on this deploy
        "regions": crops["DRY BEANS"],
    }, open(OUT, "w"), separators=(",", ":"))

    print("latest observation:", latest)
    for com, regions in crops.items():
        print("\n%s" % com)
        for r, v in sorted(regions.items(),
                           key=lambda kv: -(kv[1]["dates"].get(latest, {}).get("rank") or 0)):
            row = v["dates"].get(latest)
            if row and "now" in row:
                print("  %-22s rank %2d/%-2d  %+5.1f%%  %s"
                      % (v["name"], row["rank"], row["of"], row["vs_mean_pct"], row["band"]))
    print("\nwrote", os.path.relpath(OUT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
