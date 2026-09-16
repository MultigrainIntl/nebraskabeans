#!/usr/bin/env python3
"""
Water stress for every region, from land surface temperature. Free, global, no quota.

A crop with water open its stomata, transpires, and cools itself. A crop without water shuts
them and runs hot. The gap between canopy temperature and air temperature is therefore a direct
reading of water stress — and unlike rainfall it sees irrigation, because it measures the
cooling the water produced rather than where the water came from.

THE COMPARISON MUST BE AT THE SATELLITE'S OWN HOUR. Terra crosses about 10:30 local. Comparing
its reading against the day's PEAK air temperature, hours later, makes every crop look cooler
than the air and therefore better watered than it is — it reversed the answer entirely on the
first attempt. Air temperature is taken from the hourly station record at the overpass hour.

Replaces OpenET, which is finer but United States only and capped at 100 queries a month.
MOD11A2 covers every field on earth at no cost.
"""
import csv, gzip, json, os, sys, time, urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://modis.ornl.gov/rst/api/v1/MOD11A2"
UA = {"User-Agent": "JoieOS-GISit/1.0 (+MultigrainIntl)", "Accept": "application/json"}
CACHE = os.path.join(HERE, "..", "..", "assets", "data", "archive", "lst-cache")
ARCHIVE = os.path.join(HERE, "..", "..", "assets", "data", "archive")
RAW = os.path.join(HERE, "..", "..", "assets", "data", "stations", "raw")
PAUSE, CHUNK, KM = 1.4, 10, 2
N_CELLS = 6
UTC_HOURS = ("16", "17")        # 10-11 local in Mountain Daylight Time
csv.field_size_limit(10 ** 7)


def get(url, tries=4):
    delay = PAUSE
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
                b = json.loads(r.read().decode())
            time.sleep(PAUSE)
            return b
        except Exception:
            if i == tries - 1:
                return {"__error__": "failed"}
            time.sleep(delay); delay = min(delay * 2, 45)
    return {"__error__": "gave up"}


def overpass_air():
    """Air temperature at the satellite's hour, per station, per day."""
    out = defaultdict(dict)
    for fn in sorted(os.listdir(RAW)):
        if not fn.endswith("-observations.csv.gz"):
            continue
        with gzip.open(os.path.join(RAW, fn), "rt") as f:
            for r in csv.DictReader(f):
                v = r.get("valid", "")
                if len(v) < 16 or v[11:13] not in UTC_HOURS:
                    continue
                try:
                    out[r["station"]].setdefault(v[:10], []).append(float(r["tmpf"]))
                except (TypeError, ValueError):
                    pass
    # a station-day with no valid reading must be dropped, not divided by nothing
    return {s: {d: (sum(v) / len(v) - 32) / 1.8 for d, v in days.items() if v}
            for s, days in out.items()}


def asos_locations():
    """Where each hourly station is. The hourly feed is keyed by airport code and the daily
    feed by COOP number, so the two cannot be joined by identifier — only by position."""
    out = {}
    for fn in sorted(os.listdir(RAW)):
        if not fn.endswith("-metadata.json"):
            continue
        for f in json.load(open(os.path.join(RAW, fn)))["features"]:
            lon, lat = f["geometry"]["coordinates"][:2]
            out[f["properties"]["sid"]] = (lon, lat, f["properties"].get("sname") or "")
    return out


def cells(region):
    c = [x for x in json.load(open(os.path.join(HERE, "bean-cells-by-county.json")))
         if x["region"] == region]
    c.sort(key=lambda x: -x["acres"])
    return c[::max(1, len(c) // N_CELLS)][:N_CELLS]


def lst_series(lat, lon, year):
    d = get("%s/dates?latitude=%f&longitude=%f" % (API, lat, lon))
    ds = [x["modis_date"] for x in d.get("dates", [])
          if x["modis_date"].startswith("A%d" % year)] if "__error__" not in d else []
    rows = []
    for i in range(0, len(ds), CHUNK):
        chunk = ds[i:i + CHUNK]
        path = os.path.join(CACHE, "%.3f_%.3f_%s-%s.json" % (lon, lat, chunk[0], chunk[-1]))
        if os.path.exists(path):
            rows.extend(json.load(open(path))); continue
        q = ("%s/subset?latitude=%f&longitude=%f&startDate=%s&endDate=%s&band=LST_Day_1km"
             "&kmAboveBelow=%d&kmLeftRight=%d") % (API, lat, lon, chunk[0], chunk[-1], KM, KM)
        r = get(q)
        got = []
        if "__error__" not in r:
            for s in r.get("subset", []):
                v = sorted(x * 0.02 - 273.15 for x in s.get("data", []) if x and x > 7500)
                if len(v) >= 6:
                    got.append({"date": s["calendar_date"], "lst_c": round(v[len(v) // 2], 2)})
        os.makedirs(CACHE, exist_ok=True)
        json.dump(got, open(path, "w"))
        rows.extend(got)
    return rows


def main():
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    regions = sys.argv[2:] or ["ne-panhandle", "sw-nebraska", "ne-colorado", "western-colorado",
                               "se-wyoming", "big-horn", "nw-kansas"]
    air = overpass_air()
    where = asos_locations()
    print("stations with %s UTC air temperature: %d" % ("/".join(UTC_HOURS), len(air)),
          file=sys.stderr)
    for region in regions:
        cs = cells(region)
        if not cs:
            continue
        acc, wt = defaultdict(float), defaultdict(float)
        for c in cs:
            for r in lst_series(c["lat"], c["lon"], year):
                w = max(c["acres"], 0.01)
                acc[r["date"]] += r["lst_c"] * w
                wt[r["date"]] += w
        if not acc:
            print("  %-18s no surface temperature" % region, file=sys.stderr); continue
        lon = sum(c["lon"] for c in cs) / len(cs)
        lat = sum(c["lat"] for c in cs) / len(cs)
        near = [(sid, where[sid]) for sid in air if sid in where and len(air[sid]) > 60]
        if not near:
            print("  %-18s no station with hourly air temperature" % region, file=sys.stderr)
            continue
        sid, (slon, slat, sname) = min(
            near, key=lambda kv: (kv[1][0] - lon) ** 2 + (kv[1][1] - lat) ** 2)
        a = air[sid]
        st = {"name": sname or sid}
        out = {}
        for d in sorted(acc):
            if d in a:
                out[d] = round(acc[d] / wt[d] - a[d], 2)
        if not out:
            print("  %-18s no matching days" % region, file=sys.stderr); continue
        # Merge with what is already on record rather than re-reading the whole season.
        path = os.path.join(ARCHIVE, "thermal-%s-%d.json" % (region, year))
        if os.path.exists(path):
            try:
                prior = json.load(open(path)).get("canopy_minus_air_c", {})
                merged = dict(prior)
                merged.update(out)
                out = merged
            except Exception:
                pass
        json.dump({"region": region, "year": year, "station": st["name"],
                   "source": {"name": "NASA MOD11A2 land surface temperature, 1 km, 8-day",
                              "url": API, "api_key_required": False, "coverage": "global"},
                   "method": "canopy minus air temperature at the satellite's own overpass hour; "
                             "a watered crop sits within about a degree of air, a thirsty one "
                             "runs hot",
                   "canopy_minus_air_c": out}, open(path, "w"), separators=(",", ":"))
        v = list(out.values())
        print("  %-18s %2d readings, canopy %+.1f C above air on average"
              % (region, len(v), sum(v) / len(v)), file=sys.stderr)


if __name__ == "__main__":
    main()
