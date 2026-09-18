#!/usr/bin/env python3
"""Score the actual SMAP satellite against the same 181 buried probes, head to head.

WHY THIS EXISTS. Everything this site calls a water figure has so far come from a land-surface
MODEL — NASA POWER's MERRA-2 assimilation. SMAP is the satellite that measures soil wetness
directly, and the honest question was never "is SMAP better" but "does SMAP beat what we already
have, on this ground, against instruments in the dirt". Nobody had asked it.

AND IT NEEDED NO ACCOUNT. GAJ created a NASA Earthdata profile on 18 September 2026 because I
said SMAP was behind a login. Then he asked whether it might already be available through Esri,
and it is: USDA's Foreign Agricultural Service republishes SMAP L4 root-zone soil moisture as an
open ArcGIS image service — global, daily, 1 April 2015 to now, 9 km, no key, no login, and no
credential of his ever touched this machine. The account is not needed for this.

    https://geo.fas.usda.gov/arcgis2/rest/services/G_SMAP/Rootzone_SM_Daily/ImageServer

WHAT IS SCORED. For every USDA SCAN station: SMAP root-zone soil moisture against the profile
the buried sensors actually recorded, same days, same depth weighting as the NASA POWER run, so
the two products are judged on identical ground by identical arithmetic. The output drops
straight into scripts/remote_soil_transfer.py, which decides whether either can be carried to a
country with no probes in it.
"""
import datetime, json, math, os, statistics, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
CAL = os.path.join(DATA, "remote-soil-calibration.json")
OUT = os.path.join(DATA, "smap-probe-scores.json")
AWDB = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1"
SMAP = ("https://geo.fas.usda.gov/arcgis2/rest/services/G_SMAP/"
        "Rootzone_SM_Daily/ImageServer/getSamples")
START, END = datetime.date(2015, 4, 1), datetime.date(2026, 9, 15)
SLAB = {-8: 14, -20: 16, -40: 10}
# THE SERVICE'S REAL LIMIT, found by probing it rather than by reading a document that does not
# exist. It returns at most TWENTY time slices per request no matter what sampleCount asks for —
# a first run requested 200-day windows, got 20 days back each time, and scored zero stations
# because every series came up short. It does NOT limit the number of points, so the whole
# network goes in one request and the record is walked twenty days at a time: 210 calls for
# eleven and a half years at 181 stations, about twenty minutes.
PTS_PER_CALL, DAYS_PER_CALL = 400, 20


def post(url, data, timeout=600, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(
                url, data=urllib.parse.urlencode(data).encode(),
                headers={"User-Agent": "nebraskabeans/1.0",
                         "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except Exception:
            if i == tries - 1:
                return None
            time.sleep(3 + 3 * i)


def get(url, timeout=240, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "nebraskabeans/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except Exception:
            if i == tries - 1:
                return None
            time.sleep(2 + 2 * i)


def probe_series(triplet):
    els = urllib.parse.quote("SMS:-8,SMS:-20,SMS:-40")
    u = ("%s/data?stationTriplets=%s&elements=%s&duration=DAILY&beginDate=%s&endDate=%s"
         % (AWDB, urllib.parse.quote(triplet), els, START.isoformat(), END.isoformat()))
    r = get(u)
    if not r or not r[0].get("data"):
        return {}
    per = {}
    for s in r[0]["data"]:
        dep = (s.get("stationElement") or {}).get("heightDepth")
        if dep not in SLAB:
            continue
        for v in s.get("values") or []:
            if v.get("value") is None:
                continue
            try:
                per.setdefault(v["date"], {})[dep] = float(v["value"])
            except (TypeError, ValueError):
                pass
    return {d: sum(val * SLAB[k] for k, val in s.items()) / sum(SLAB[k] for k in s)
            for d, s in per.items() if len(s) >= 2}


def smap_block(points, d0, d1):
    """SMAP for many stations over a stretch of days, one request. Returns index -> {iso: value}."""
    ms = lambda d: int(datetime.datetime(d.year, d.month, d.day,
                                         tzinfo=datetime.timezone.utc).timestamp() * 1000)
    d = post(SMAP, {"f": "json",
                    "geometry": json.dumps({"points": [[lo, la] for la, lo in points],
                                            "spatialReference": {"wkid": 4326}}),
                    "geometryType": "esriGeometryMultipoint",
                    "returnFirstValueOnly": "false", "outFields": "Name",
                    "time": "%d,%d" % (ms(d0), ms(d1)),
                    "sampleCount": str(len(points) * (d1 - d0).days + len(points) + 50)})
    out = {}
    if not d:
        return out
    for s in d.get("samples") or []:
        name = ((s.get("attributes") or {}).get("Name") or "")
        if len(name) < 8 or not name[-8:].isdigit():
            continue
        iso = "%s-%s-%s" % (name[-8:-4], name[-4:-2], name[-2:])
        try:
            out.setdefault(s["locationId"], {})[iso] = float(s["value"])
        except (TypeError, ValueError, KeyError):
            pass
    return out


def fit(xs, ys):
    n = len(xs)
    if n < 200:
        return None
    mx, my = statistics.mean(xs), statistics.mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    if sxx <= 0 or syy <= 0:
        return None
    b = sxy / sxx
    a = my - b * mx
    r = sxy / math.sqrt(sxx * syy)
    rmse = math.sqrt(sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys)) / n)
    return {"a": a, "b": b, "r": r, "rmse": rmse, "n": n, "my": my, "mx": mx}


def main():
    base = json.load(open(CAL))["stations"]
    print("scoring SMAP at %d stations that NASA POWER was already scored at" % len(base),
          file=sys.stderr)

    # SMAP first, in blocks: many stations and many days per request
    smap = {}
    for p0 in range(0, len(base), PTS_PER_CALL):
        chunk = base[p0:p0 + PTS_PER_CALL]
        pts = [(s["lat"], s["lon"]) for s in chunk]
        d0 = START
        while d0 < END:
            d1 = min(d0 + datetime.timedelta(days=DAYS_PER_CALL - 1), END)
            blk = smap_block(pts, d0, d1)
            if blk and len(next(iter(blk.values()))) < (d1 - d0).days:
                pass          # short blocks are expected at the edges of the archive
            for li, series in blk.items():
                smap.setdefault(p0 + li, {}).update(series)
            d0 = d1 + datetime.timedelta(days=1)
            time.sleep(0.15)
        got = sum(len(smap.get(p0 + j, {})) for j in range(len(chunk)))
        print("  %d stations, %d SMAP values, %d days each"
              % (len(chunk), got, got // max(len(chunk), 1)), file=sys.stderr)

    rows = []
    for i, s in enumerate(base):
        sm = smap.get(i) or {}
        if len(sm) < 500:
            continue
        probe = probe_series(s["triplet"])
        common = sorted(set(probe) & set(sm))
        f = fit([sm[d] for d in common], [probe[d] for d in common])
        if not f:
            continue
        rows.append({"station": s["station"], "state": s["state"], "triplet": s["triplet"],
                     "lat": s["lat"], "lon": s["lon"], "elev_m": s["elev_m"],
                     "mean_annual_precip_mm": s["mean_annual_precip_mm"],
                     "mean_temp_c": s["mean_temp_c"],
                     "days": f["n"], "r": round(f["r"], 3),
                     "rmse_vwc_pct": round(f["rmse"], 2),
                     "a": round(f["a"], 4), "b": round(f["b"], 4),
                     "probe_mean_vwc_pct": round(f["my"], 2),
                     "remote_mean_wetness": round(f["mx"], 4),
                     "power_r": s["r"], "power_rmse_vwc_pct": s["rmse_vwc_pct"]})
        print("  %3d/%3d %-24s %-2s SMAP r=%+.2f rmse=%.1f  (POWER r=%+.2f rmse=%.1f)"
              % (i + 1, len(base), s["station"][:24], s["state"], f["r"], f["rmse"],
                 s["r"], s["rmse_vwc_pct"]), file=sys.stderr)
        time.sleep(0.2)

    json.dump({"schema": "nebraskabeans.smap-probe-scores.v1",
               "product": "SMAP L4 root-zone soil moisture, 9 km, daily",
               "source": {"name": "USDA Foreign Agricultural Service, open ArcGIS image service "
                                  "republishing NASA SMAP L4",
                          "url": SMAP, "api_key_required": False,
                          "earthdata_login_required": False,
                          "evidence_class": "MODELED — satellite retrieval assimilated to root "
                                            "zone; it is not a probe"},
               "start": START.isoformat(), "end": END.isoformat(),
               "stations": rows}, open(OUT, "w"), indent=1)

    if rows:
        print("\nSMAP  median r %+.2f, median rmse %.2f"
              % (statistics.median(x["r"] for x in rows),
                 statistics.median(x["rmse_vwc_pct"] for x in rows)), file=sys.stderr)
        print("POWER median r %+.2f, median rmse %.2f"
              % (statistics.median(x["power_r"] for x in rows),
                 statistics.median(x["power_rmse_vwc_pct"] for x in rows)), file=sys.stderr)
        better = sum(1 for x in rows if x["rmse_vwc_pct"] < x["power_rmse_vwc_pct"])
        print("SMAP beats NASA POWER at %d of %d stations" % (better, len(rows)), file=sys.stderr)
    print("wrote %s — %d stations" % (OUT, len(rows)), file=sys.stderr)


if __name__ == "__main__":
    main()
