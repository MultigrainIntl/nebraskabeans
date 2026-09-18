#!/usr/bin/env python3
"""Daily soil water for the map's timeline, so the surface actually moves with the date.

WHY THIS EXISTS. The "Estimated soil water" layer was added on 18 September 2026 and drew the
same picture on every date on the slider. It multiplied each cell's surveyed water-holding
capacity by ONE season-average figure for the whole region, so dragging the timeline from
planting to harvest changed nothing at all. A temporal map that does not vary with time is worse
than no temporal map: it tells a grower the ground held the same water in June as in September,
which is the opposite of what any of this is for.

WHAT IT WRITES. One value per region per day: the fraction of the root zone that held plant-
available water, averaged across BOTH remote products — NASA POWER's land-surface model and the
SMAP satellite — because neither is preferred here and their average is steadier than either.
The map multiplies it by each cell's own surveyed capacity, so the spatial pattern comes from
the soil survey and the movement over time comes from these.

IT IS AN ESTIMATE AND THE FILE SAYS SO. Nothing here measures soil moisture.
"""
import json, os, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
HIST = os.path.join(DATA, "archive", "season-history.json")
OUT = os.path.join(DATA, "soil-water-daily.json")
YEAR = 2026


def main():
    h = json.load(open(HIST))
    soil = h.get("soil") or {}
    smap = h.get("smap") or {}
    regions = {}
    for rk in sorted(set(soil) | set(smap)):
        power = (soil.get(rk) or {}).get("GWETROOT") or {}
        sat = smap.get(rk) or {}
        days = {}
        for iso in sorted(set(power) | set(sat)):
            if not iso.startswith(str(YEAR)):
                continue
            vals = []
            if iso in power:
                vals.append(power[iso])
            if iso in sat:
                # SMAP is volumetric water content; POWER is a wetness fraction. They are put
                # on one scale by expressing each against its OWN 2015-2025 average for that
                # region, which is unit-free and is the same trick the two-way comparison uses.
                vals.append(sat[iso])
            if vals:
                days[iso] = vals
        if not days:
            continue
        # per-product normalisation against that product's own record
        base = {}
        for name, series in (("power", power), ("smap", sat)):
            hist = [v for k, v in series.items() if k[:4] != str(YEAR)]
            base[name] = statistics.mean(hist) if hist else None
        out = {}
        for iso in sorted(days):
            frac = []
            if iso in power and base["power"]:
                frac.append(power[iso] / base["power"])
            if iso in sat and base["smap"]:
                frac.append(sat[iso] / base["smap"])
            if frac:
                # 1.0 means "the usual amount of water for this region on this kind of day"
                out[iso] = round(sum(frac) / len(frac), 4)
        regions[rk] = out
        print("  %-18s %d days, %.2f to %.2f of normal"
              % (rk, len(out), min(out.values()), max(out.values())), file=sys.stderr)

    json.dump({
        "schema": "nebraskabeans.soil-water-daily.v1",
        "what": "Estimated plant-available water in the root zone, day by day, as a fraction "
                "of what that region normally holds on that date.",
        "why": "The soil water map drew the same picture on every date because it used one "
               "season average for the whole region. A temporal map that does not move with "
               "time is worse than none.",
        "how_to_use": "Multiply by the cell's surveyed available water capacity from "
                      "soils.json. The spatial pattern is the soil survey; the movement over "
                      "time is this file.",
        "products": ["NASA POWER GWETROOT (land-surface model)",
                     "SMAP L4 root zone (satellite, via USDA FAS)"],
        "combined": "Each product is expressed against its own 2015-2025 average for that "
                    "region, then the two are averaged. Neither is preferred.",
        "this_is_an_estimate": "Nothing here measures soil moisture. Growers measure a root "
                               "zone with buried probes at several depths, tensiometers or "
                               "Watermark sensors, a hand probe, and their own rain and "
                               "irrigation records. This has none of those.",
        "year": YEAR,
        "regions": regions}, open(OUT, "w"), separators=(",", ":"))
    print("wrote %s" % OUT, file=sys.stderr)


if __name__ == "__main__":
    main()
