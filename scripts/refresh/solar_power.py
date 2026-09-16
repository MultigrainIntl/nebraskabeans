#!/usr/bin/env python3
"""
Measured sunlight, instead of sunlight guessed from the temperature swing.

The yield model needs incoming solar radiation: intercepted light is what drives biomass, and
an error here passes straight through to the number. Until now it was estimated with a
Hargreaves-style formula — radiation inferred from the gap between the day's high and low, on
the reasoning that clear days swing wider than cloudy ones. That is a legitimate published
fallback for places with no radiation data. It is not a measurement, and the site was
describing it as "sunlight from local weather stations", which it never was.

NASA POWER publishes daily all-sky surface shortwave downward irradiance from satellite
observation, worldwide, back to 1981, keyless and free. That is the measurement. On a run of
ten July days at Scottsbluff it separates clear days near 30 MJ/m2 from overcast ones near
19 — a distinction the temperature proxy blurs badly, and precisely the distinction that
decides whether a week of the season built biomass or not.

It is also global, which matters beyond this site: the same call works for Saskatchewan or
anywhere else a sister site is pointed.

Falls back to the Hargreaves estimate only if POWER cannot be reached, and says so in the file
rather than quietly substituting one for the other.
"""
import json, os, sys, urllib.parse, urllib.request
from collections import defaultdict
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
OUT = os.path.join(DATA, "archive", "solar-radiation.json")
API = "https://power.larc.nasa.gov/api/temporal/daily/point"

REGIONS = ["ne-panhandle", "sw-nebraska", "ne-colorado", "western-colorado",
           "se-wyoming", "big-horn", "nw-kansas"]


def region_centres():
    """The acreage-weighted centre of each region's mapped bean ground."""
    cells = json.load(open(os.path.join(HERE, "bean-cells-by-county.json")))
    acc = defaultdict(lambda: [0.0, 0.0, 0.0])
    for c in cells:
        a = max(float(c.get("acres") or 0), 0.01)
        r = acc[c["region"]]
        r[0] += c["lon"] * a
        r[1] += c["lat"] * a
        r[2] += a
    return {k: (v[0] / v[2], v[1] / v[2]) for k, v in acc.items() if v[2] > 0}


def fetch(lon, lat, start, end):
    q = urllib.parse.urlencode({
        "parameters": "ALLSKY_SFC_SW_DWN", "community": "AG",
        "longitude": round(lon, 3), "latitude": round(lat, 3),
        "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"),
        "format": "JSON"})
    with urllib.request.urlopen("%s?%s" % (API, q), timeout=180) as r:
        d = json.loads(r.read().decode())
    got = d["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    # POWER marks an unavailable day -999. It must be dropped, never averaged in.
    return {"%s-%s-%s" % (k[:4], k[4:6], k[6:]): float(v)
            for k, v in got.items() if float(v) > -900}


def main():
    year = int(sys.argv[1]) if len(sys.argv) > 1 else date.today().year
    start = date(year, 3, 1)
    end = min(date.today(), date(year, 11, 30))
    centres = region_centres()

    prior = {}
    if os.path.exists(OUT):
        try:
            prior = json.load(open(OUT)).get("regions", {})
        except Exception:
            prior = {}

    out, failed = {}, []
    for region in REGIONS:
        if region not in centres:
            continue
        lon, lat = centres[region]
        have = dict(prior.get(region, {}).get("mj_m2_day", {}))
        # Only ask for days not already on record. POWER is a fixed observation once published.
        need_from = start
        if have:
            last = max(have)
            need_from = date.fromisoformat(last)
        if need_from >= end and have:
            out[region] = {"lon": round(lon, 3), "lat": round(lat, 3), "mj_m2_day": have}
            print("  %-18s %4d days already on record" % (region, len(have)), file=sys.stderr)
            continue
        try:
            got = fetch(lon, lat, need_from, end)
        except Exception as e:
            failed.append("%s: %s" % (region, str(e)[:70]))
            print("  %-18s FAILED %s" % (region, str(e)[:60]), file=sys.stderr)
            if have:
                out[region] = {"lon": round(lon, 3), "lat": round(lat, 3), "mj_m2_day": have}
            continue
        have.update(got)
        out[region] = {"lon": round(lon, 3), "lat": round(lat, 3), "mj_m2_day": have}
        print("  %-18s %4d days (%d new)  %.1f-%.1f MJ/m2"
              % (region, len(have), len(got),
                 min(have.values()), max(have.values())), file=sys.stderr)

    if not out:
        print("no region returned radiation — refusing to write an empty file", file=sys.stderr)
        return 1

    json.dump({"schema": "gisit.solar-radiation.v1",
               "year": year,
               "latest_observation": max(max(r["mj_m2_day"]) for r in out.values()),
               "unit": "MJ per square metre per day, all-sky surface shortwave downward",
               "source": {"name": "NASA POWER daily ALLSKY_SFC_SW_DWN",
                          "url": API, "api_key_required": False, "coverage": "global"},
               "why": "measured irradiance replaces a Hargreaves estimate inferred from the "
                      "daily temperature range; the estimate could not tell a clear day from "
                      "an overcast one, and intercepted light is what the yield model runs on",
               "failed": failed,
               "regions": out},
              open(OUT, "w"), separators=(",", ":"))
    print("\nwrote %s  %d regions" % (OUT, len(out)), file=sys.stderr)
    return 1 if failed and len(failed) == len(REGIONS) else 0


if __name__ == "__main__":
    sys.exit(main())
