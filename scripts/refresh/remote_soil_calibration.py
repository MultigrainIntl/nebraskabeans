#!/usr/bin/env python3
"""How wrong is remote soil moisture, and can that correction be carried somewhere with no probes?

WHY THIS EXISTS. GAJ, 17 September 2026: "you should be able to extrapolate the accuracy of the
remote sensing - especially when compared to locations where more empirical data is gathered as
well. We may be able to utilize that extrapolated correlation when using remote sensing only in
remote global locations."

That is the right method and it is the only honest way to open a country with no instruments in
it. The United States has 194 buried probe stations running since 2015 across 44 states, from
Alabama clay to Utah desert to Hawaii. A remote product can be scored against every one of them.
If its error is predictable from things that exist EVERYWHERE — latitude, elevation, how wet and
how hot the place is — then the correction can travel to Konya or Alberta or anywhere else, and
so can an honest statement of how much it is trusted.

THE TEST THAT DECIDES IT, and it is deliberately harsh. Leave one station out. Fit the transfer
on the other 193, predict at the station never seen, score it there. That is the real situation
abroad: a place the calibration has never met. Three things are scored side by side:

  - raw          the remote figure used as-is
  - global mean  one correction fitted on all other stations, applied everywhere
  - transferred  a correction predicted from that station's own climate and terrain

If "transferred" does not beat "global mean" at held-out stations, then the error is NOT
predictable from these covariates, and the honest thing to carry abroad is the global correction
plus a wide uncertainty band — not a clever local adjustment that only works where it was fitted.
Either answer is publishable. Only pretending is not.

SOURCES, both keyless and reproducible:
  probes  USDA NRCS AWDB / SCAN, volumetric water content at 8, 20 and 40 inches
  remote  NASA POWER root-zone soil wetness (MERRA-2/GEOS), global, 1981-present
"""
import json, math, os, statistics, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "assets", "data", "remote-soil-calibration.json")
AWDB = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1"
POWER = "https://power.larc.nasa.gov/api/temporal/daily/point"
START, END = "2015-01-01", "2026-09-15"

# The slab each sensor stands for, inches, through a 0-40 inch profile. Bean roots work the top
# 60 cm; these three sensors are what SCAN reports consistently across the whole network.
SLAB = {-8: 14, -20: 16, -40: 10}


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


def stations():
    d = get("%s/stations" % AWDB, timeout=300) or []
    out = []
    for s in d:
        if s.get("networkCode") not in ("SCAN", "CSCAN"):
            continue
        if (s.get("beginDate") or "9999")[:4] > "2015":
            continue
        if s.get("latitude") is None or s.get("longitude") is None:
            continue
        out.append(s)
    return out


def probe_series(triplet):
    els = urllib.parse.quote("SMS:-8,SMS:-20,SMS:-40")
    u = ("%s/data?stationTriplets=%s&elements=%s&duration=DAILY&beginDate=%s&endDate=%s"
         % (AWDB, urllib.parse.quote(triplet), els, START, END))
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
    # a day needs at least two of the three sensors to stand for a profile
    return {d: sum(val * SLAB[k] for k, val in s.items()) / sum(SLAB[k] for k in s)
            for d, s in per.items() if len(s) >= 2}


def remote_series(lat, lon):
    q = urllib.parse.urlencode({
        "parameters": "GWETROOT,PRECTOTCORR,T2M", "community": "AG",
        "longitude": round(lon, 3), "latitude": round(lat, 3),
        "start": START.replace("-", ""), "end": END.replace("-", ""), "format": "JSON"})
    d = get("%s?%s" % (POWER, q), timeout=300)
    if not d:
        return {}, {}, {}
    p = (d.get("properties") or {}).get("parameter") or {}

    def clean(name):
        return {"%s-%s-%s" % (k[:4], k[4:6], k[6:]): float(v)
                for k, v in (p.get(name) or {}).items() if float(v) > -900}
    return clean("GWETROOT"), clean("PRECTOTCORR"), clean("T2M")


def fit(xs, ys):
    """Least squares y = a + b x, plus correlation. Returns None when it cannot be fitted."""
    n = len(xs)
    if n < 200:
        return None
    mx, my = statistics.mean(xs), statistics.mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    syy = sum((y - my) ** 2 for y in ys)
    if sxx <= 0 or syy <= 0:
        return None
    b = sxy / sxx
    a = my - b * mx
    r = sxy / math.sqrt(sxx * syy)
    rmse = math.sqrt(sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys)) / n)
    return {"a": a, "b": b, "r": r, "rmse": rmse, "n": n,
            "probe_mean": my, "remote_mean": mx}


def main():
    sts = stations()
    print("scoring %d buried-probe stations against NASA POWER" % len(sts), file=sys.stderr)
    rows = []
    for i, s in enumerate(sts):
        lat, lon = s["latitude"], s["longitude"]
        probe = probe_series(s["stationTriplet"])
        if len(probe) < 300:
            print("  %-26s too little probe data (%d days)" % (s["name"][:26], len(probe)),
                  file=sys.stderr)
            continue
        gwet, pcpn, temp = remote_series(lat, lon)
        if not gwet:
            print("  %-26s no remote series" % s["name"][:26], file=sys.stderr)
            continue
        common = sorted(set(probe) & set(gwet))
        f = fit([gwet[d] for d in common], [probe[d] for d in common])
        if not f:
            continue
        # Covariates that exist for ANY point on earth, which is the whole point: if the
        # correction needs something only America has, it cannot travel.
        annual_mm = (sum(pcpn.values()) / max(len(pcpn), 1)) * 365.25
        rows.append({
            "station": s["name"], "state": s.get("stateCode"),
            "triplet": s["stationTriplet"],
            "lat": lat, "lon": lon,
            "elev_m": (s.get("elevation") or 0) * 0.3048,
            "mean_annual_precip_mm": round(annual_mm, 1),
            "mean_temp_c": round(statistics.mean(temp.values()), 2) if temp else None,
            "days": f["n"], "r": round(f["r"], 3), "rmse_vwc_pct": round(f["rmse"], 2),
            "a": round(f["a"], 4), "b": round(f["b"], 4),
            "probe_mean_vwc_pct": round(f["probe_mean"], 2),
            "remote_mean_wetness": round(f["remote_mean"], 4)})
        print("  %3d/%3d %-24s %-2s r=%+.2f rmse=%.1f" %
              (i + 1, len(sts), s["name"][:24], s.get("stateCode"), f["r"], f["rmse"]),
              file=sys.stderr)
        time.sleep(0.3)

    json.dump({"schema": "nebraskabeans.remote-soil-calibration.v1",
               "stations": rows, "start": START, "end": END},
              open(OUT, "w"), indent=1)
    print("\nwrote %s — %d stations scored" % (OUT, len(rows)), file=sys.stderr)


if __name__ == "__main__":
    main()
