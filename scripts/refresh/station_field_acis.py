#!/usr/bin/env python3
"""
Daily station weather from the full NOAA cooperative network, via RCC-ACIS.

WHY THIS REPLACES THE AIRPORT-ONLY SET: the map was interpolating across sixty counties from
77 automated airport stations. Airports sit where aeroplanes land, not where beans grow, and
the gaps between them are exactly the ground a grower cares about. RCC-ACIS carries the
cooperative and GHCN networks as well — hundreds more sites, many of them farm-adjacent.

TEMPERATURE AND RAINFALL ARE KEPT SEPARATELY ON PURPOSE. A large share of cooperative stations
report rain and nothing else. Discarding them would throw away the densest rainfall network in
the country to protect a growing-degree-day calculation they were never going to feed. Each
station therefore carries whatever it actually observes, and each metric uses the stations that
can answer it.

Window starts in mid-March so the earliest pulse planting date has real weather in front of it;
the previous record began on 15 April, after peas go in the ground.
"""
import json, os, sys, urllib.request
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
OUTL = os.path.join(DATA, "crop-outlines.geojson")
OUT = os.path.join(DATA, "station-field.json")
STATES = ["NE", "CO", "WY", "KS"]
SDATE, EDATE = "2026-03-15", "2026-09-09"
NEAR_DEG = 0.6
MIN_COVER = 0.6          # a station must observe most of the season to join the surface


def post(payload):
    req = urllib.request.Request("https://data.rcc-acis.org/MultiStnData",
                                 data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode())


def num(v):
    """ACIS marks missing as M or S, and a trace of rain as T."""
    if v in ("M", "S", None, ""):
        return None
    if v == "T":
        return 0.0
    try:
        return float(v)
    except ValueError:
        return None


def bounds():
    boxes = []
    for f in json.load(open(OUTL))["features"]:
        g = f["geometry"]
        parts = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for p in parts:
            for ring in (p if isinstance(p[0][0], list) else [p]):
                xs = [c[0] for c in ring]; ys = [c[1] for c in ring]
                boxes.append((min(xs) - NEAR_DEG, min(ys) - NEAR_DEG,
                              max(xs) + NEAR_DEG, max(ys) + NEAR_DEG))
    return boxes


BOXES = bounds()
start = datetime.strptime(SDATE, "%Y-%m-%d").date()
end = datetime.strptime(EDATE, "%Y-%m-%d").date()
ndays = (end - start).days + 1
dates = [(start + timedelta(days=i)).isoformat() for i in range(ndays)]

kept, seen, outside, sparse = [], set(), 0, 0
for st in STATES:
    r = post({"state": st, "sdate": SDATE, "edate": EDATE,
              "meta": ["name", "ll", "elev", "sids"],
              "elems": [{"name": "maxt"}, {"name": "mint"}, {"name": "pcpn"}]})
    rows = r.get("data", [])
    used = 0
    for s in rows:
        meta = s.get("meta") or {}
        ll = meta.get("ll")
        if not ll:
            continue
        lon, lat = ll[0], ll[1]
        if not any(x0 <= lon <= x1 and y0 <= lat <= y1 for x0, y0, x1, y1 in BOXES):
            outside += 1
            continue
        sid = (meta.get("sids") or [meta.get("name", "")])[0].split()[0]
        if sid in seen:
            continue
        d = s.get("data") or []
        hi = [None] * ndays; lo = [None] * ndays; pr = [None] * ndays
        nt = np_ = 0
        for i, day in enumerate(d[:ndays]):
            if len(day) < 3:
                continue
            a, b, c = num(day[0]), num(day[1]), num(day[2])
            if a is not None and b is not None and -60 < b <= a < 140:
                hi[i] = a; lo[i] = b; nt += 1
            if c is not None and 0 <= c < 12:
                pr[i] = round(c * 25.4, 1); np_ += 1
        has_t = nt >= ndays * MIN_COVER
        has_p = np_ >= ndays * MIN_COVER
        if not has_t and not has_p:
            sparse += 1
            continue
        seen.add(sid)
        used += 1
        kept.append({"id": sid, "name": meta.get("name", sid).title(),
                     "lon": round(lon, 4), "lat": round(lat, 4),
                     "elev_m": round((meta.get("elev") or 0) * 0.3048),
                     "temp_days": nt, "precip_days": np_,
                     "has_temp": has_t, "has_precip": has_p,
                     "hi": hi if has_t else None, "lo": lo if has_t else None,
                     "pr": pr if has_p else None})
    print(f"  {st}: {len(rows):>5} returned, {used:>4} kept", file=sys.stderr)


def thin(stations, key, cell):
    """Keep the best-observed station in each cell of a coarse grid.

    Two rain gauges four hundred metres apart tell the interpolation nothing the first one did
    not, and every extra station is bytes a grower on a phone in a field has to download. This
    thins temperature and rainfall separately, so neither network is degraded to suit the other.
    """
    best = {}
    for st in stations:
        if not st[key]:
            continue
        k = (round(st["lon"] / cell), round(st["lat"] / cell))
        cur = best.get(k)
        score = st["temp_days"] if key == "has_temp" else st["precip_days"]
        if cur is None or score > cur[1]:
            best[k] = (st, score)
    return {s["id"] for s, _ in best.values()}


# Temperature varies smoothly and tolerates wider spacing. Rainfall is patchy — a thunderstorm
# can miss one field and flatten the next — so its network is kept tighter.
TEMP_CELL, RAIN_CELL = 0.22, 0.16
keep_ids = thin(kept, "has_temp", TEMP_CELL) | thin(kept, "has_precip", RAIN_CELL)
dropped = len(kept) - len(keep_ids)
kept = [s for s in kept if s["id"] in keep_ids]
print(f"thinned {dropped} redundant stations", file=sys.stderr)

# Whole degrees Fahrenheit. The instruments do not resolve finer and the decimals are a third
# of the file.
for st in kept:
    if st["hi"]:
        st["hi"] = [None if v is None else int(round(v)) for v in st["hi"]]
        st["lo"] = [None if v is None else int(round(v)) for v in st["lo"]]
    if st["pr"]:
        st["pr"] = [None if v is None else int(round(v * 10)) for v in st["pr"]]

# A rain gauge cannot tell you how much water left the field, only how much arrived. Water
# balance needs evaporation too, and that comes from temperature. Each rainfall-only station is
# therefore tied to the nearest station that does report temperature, and the front end reads
# evaporation from there. Naming the link here, once, beats guessing at it per frame.
temps = [i for i, s in enumerate(kept) if s["has_temp"]]
for st in kept:
    if st["has_temp"]:
        st["t_ref"] = None
        continue
    best, bd = None, 1e9
    for i in temps:
        o = kept[i]
        d2 = (o["lon"] - st["lon"]) ** 2 + (o["lat"] - st["lat"]) ** 2
        if d2 < bd:
            best, bd = i, d2
    st["t_ref"] = best
    st["t_ref_km"] = round(bd ** 0.5 * 87, 1)

temp = sum(1 for s in kept if s["has_temp"])
rain = sum(1 for s in kept if s["has_precip"])
json.dump({
    "schema": "gisit.station-field.v3",
    "window": [SDATE, EDATE],
    "dates": dates,
    "evidence_class": "OBSERVED",
    "provider": "NOAA cooperative, GHCN and automated airport networks via RCC-ACIS",
    "source": {"name": "Regional Climate Centers Applied Climate Information System",
               "url": "https://data.rcc-acis.org/", "api_key_required": False,
               "elements": ["maxt", "mint", "pcpn"]},
    "station_counts": {"total": len(kept), "reporting_temperature": temp,
                       "reporting_precipitation": rain},
    "units": {"hi": "degF daily max", "lo": "degF daily min", "pr": "tenths of a mm of precipitation"},
    "coverage_rule": f"a station joins a metric only if it observes at least "
                     f"{int(MIN_COVER * 100)}% of the season for it",
    "note": "Raw daily observations. Growing degree days, heat-stress days and water balance "
            "are computed per crop class at read time, because each class has its own base "
            "temperature, planting date and heat threshold. Temperature and rainfall use "
            "different station sets because many cooperative sites report rain only.",
    "stations": kept,
}, open(OUT, "w"), separators=(",", ":"))
print(f"\n{len(kept)} stations: {temp} with temperature, {rain} with rainfall", file=sys.stderr)
print(f"{outside} outside the growing regions, {sparse} too sparse", file=sys.stderr)
print(f"{ndays} days {SDATE}..{EDATE}", file=sys.stderr)
print(f"wrote {OUT}  {os.path.getsize(OUT)/1024:.0f} KB", file=sys.stderr)
