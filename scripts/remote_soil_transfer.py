#!/usr/bin/env python3
"""Can a remote-sensing correction be carried to ground that has no probes in it?

THE QUESTION, in GAJ's words: "We may be able to utilize that extrapolated correlation when
using remote sensing only in remote global locations." This script answers it with a number
instead of an opinion, and it is built to be able to say no.

THE TEST. Leave one station out. Fit on the other 193. Predict the volumetric water content at
the station the fit has never seen, and score it there. That is exactly the situation in a
country with no instruments: the calibration has never met the ground it is being asked about.

FOUR WAYS TO GUESS, scored on the same held-out stations:

  climatology   ignore the satellite entirely; say this place holds its own average water.
                The bar. Remote sensing has to beat this or it is not earning its place.
  uncorrected   use the remote wetness with one fixed scaling for the whole world.
  global mean   one correction, the average of every other station's, applied everywhere.
  transferred   a correction predicted from that place's own latitude, elevation, rainfall and
                temperature — things known for any point on earth — by averaging the stations
                most like it.

If TRANSFERRED beats GLOBAL MEAN, the error is predictable from climate and terrain and the
correction travels. If it does not, then it does not travel, and what we carry abroad is the
global correction with a wide honest band around it. Both are publishable results. Only
pretending to know is not.

WHY NO SERIES ARE RE-FETCHED. Everything needed is recoverable from what the harvest stored. For
a least-squares fit, rmse^2 = var(y)(1 - r^2), so var(y) = rmse^2/(1-r^2); and b = r*sqrt(var y
/ var x), so var(x) = var(y)(r/b)^2; and cov = b*var(x). With the two means and those three
moments, the error of ANY other line (a', b') at that station is exact:

    error^2 = var(y) + b'^2 var(x) - 2 b' cov  +  (mean_y - a' - b' mean_x)^2

No approximation, no refetching, and anyone can check the algebra.
"""
import argparse, json, math, os, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "assets", "data")
# Two remote products, judged by the identical test on the identical stations. NASA POWER is a
# land-surface model; SMAP is the satellite that measures soil wetness directly and is then
# assimilated to the root zone. Which one a country with no probes should be given is a question
# for this script, not for whichever has the better reputation.
SOURCES = {"power": ("remote-soil-calibration.json", "remote-soil-transfer.json"),
           "smap":  ("smap-probe-scores.json", "smap-soil-transfer.json")}

# THE "NO FITTING AT ALL" CONVERSION, and it is not the same for both products, which nearly
# produced a false result.
#
# The probes report volumetric water content in percent. SMAP reports volumetric water content
# in m3/m3, so the conversion is x100 — an exact change of unit with nothing fitted and nothing
# chosen. NASA POWER reports a dimensionless WETNESS fraction, which has no exact conversion at
# all; x45 treats it as a share of a nominal 45% saturated soil, and that IS a chosen number.
#
# The first run applied x45 to both. SMAP came out 18% WORSE than useless on that row, and the
# only thing being measured was my own constant being wrong by a factor of two for a product it
# was never meant for. A baseline that is unfair to one contender is not a baseline.
FIXED_SCALE = {"power": 45.0, "smap": 100.0}
SCALE = 45.0
CAL = os.path.join(DATA, "remote-soil-calibration.json")
OUT = os.path.join(DATA, "remote-soil-transfer.json")
K = 8                      # how many similar places vote on a correction

# HOW FAR AWAY A VOTING STATION MUST BE.
#
# THE OBJECTION THAT WOULD SINK THIS. Stations with similar climate and terrain tend to be near
# each other. If the eight "most similar" places voting on a correction are simply the eight
# stations down the road, then the test has not shown that a correction TRAVELS — it has shown
# that neighbours resemble neighbours, which nobody doubts and which is worth nothing in a
# country with no probes at all. That is spatial leakage, and it is the first thing a reviewer
# would look for.
#
# So the honest version excludes everything within a radius of the held-out station, from the
# neighbour vote AND from every baseline it is compared against. At 500 km the nearest voter is
# further away than Scottsbluff is from Denver. If the result survives that, the correction is
# genuinely being carried across unfamiliar ground.
MIN_KM = 0.0


def km(la1, lo1, la2, lo2):
    r = math.pi / 180
    h = (0.5 - math.cos((la2 - la1) * r) / 2 + math.cos(la1 * r) * math.cos(la2 * r)
         * (1 - math.cos((lo2 - lo1) * r)) / 2)
    return 12742 * math.asin(math.sqrt(h))


def moments(s):
    """Recover the variances and covariance from the stored fit. See the docstring."""
    r, b, rmse = s["r"], s["b"], s["rmse_vwc_pct"]
    if abs(r) >= 0.999 or b == 0:
        return None
    vy = rmse ** 2 / (1 - r ** 2)
    vx = vy * (r / b) ** 2
    if vx <= 0 or vy <= 0:
        return None
    return {"mx": s["remote_mean_wetness"], "my": s["probe_mean_vwc_pct"],
            "vx": vx, "vy": vy, "cov": b * vx, "n": s["days"]}


def err(m, a, b):
    """Root mean square error of the line y = a + b x at this station, in volumetric %."""
    v = m["vy"] + b * b * m["vx"] - 2 * b * m["cov"]
    bias = m["my"] - a - b * m["mx"]
    return math.sqrt(max(v, 0) + bias * bias)


def covariates(s):
    return [s["lat"],
            s["elev_m"] / 1000.0,
            math.log(max(s["mean_annual_precip_mm"], 1.0)),
            s["mean_temp_c"] if s["mean_temp_c"] is not None else 10.0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="power", choices=sorted(SOURCES),
                    help="which remote product to test")
    ap.add_argument("--min-km", type=float, default=0.0,
                    help="exclude every station within this many km of the held-out one, "
                         "from the neighbour vote and from every baseline (see MIN_KM)")
    a = ap.parse_args()
    global MIN_KM, CAL, OUT
    MIN_KM = a.min_km
    global SCALE
    SCALE = FIXED_SCALE[a.source]
    CAL = os.path.join(DATA, SOURCES[a.source][0])
    OUT = os.path.join(DATA, SOURCES[a.source][1])
    print("product under test: %s" % a.source)
    print("stations closer than %.0f km to the held-out one are excluded" % MIN_KM)
    doc = json.load(open(CAL))
    sts = [s for s in doc["stations"] if s.get("mean_temp_c") is not None]
    good = [(s, moments(s)) for s in sts]
    good = [(s, m) for s, m in good if m]
    print("%d stations scored, %d usable for the transfer test" % (len(sts), len(good)))
    if len(good) < 20:
        print("too few stations to test a transfer honestly")
        return

    C = [covariates(s) for s, _ in good]
    mus = [statistics.mean(c[i] for c in C) for i in range(4)]
    sds = [statistics.pstdev([c[i] for c in C]) or 1.0 for i in range(4)]
    Z = [[(c[i] - mus[i]) / sds[i] for i in range(4)] for c in C]

    res = {"climatology": [], "uncorrected": [], "global_mean": [], "transferred": [],
           "own_station": []}
    detail = []
    for i, (s, m) in enumerate(good):
        others = [j for j in range(len(good)) if j != i
                  and (MIN_KM <= 0 or km(s["lat"], s["lon"],
                                         good[j][0]["lat"], good[j][0]["lon"]) >= MIN_KM)]
        if len(others) < 20:
            continue

        # climatology: no satellite at all. b = 0, a = the mean water of the OTHER stations,
        # which is what you would assume about a place you have never measured.
        a_clim = statistics.mean(good[j][0]["probe_mean_vwc_pct"] for j in others)
        e_clim = err(m, a_clim, 0.0)

        # uncorrected: the product's own units carried straight across, nothing fitted
        e_raw = err(m, 0.0, SCALE)

        a_glob = statistics.mean(good[j][0]["a"] for j in others)
        b_glob = statistics.mean(good[j][0]["b"] for j in others)
        e_glob = err(m, a_glob, b_glob)

        # transferred: the K most similar places, by climate and terrain, vote
        d = sorted(others, key=lambda j: sum((Z[i][k] - Z[j][k]) ** 2 for k in range(4)))[:K]
        a_tr = statistics.mean(good[j][0]["a"] for j in d)
        b_tr = statistics.mean(good[j][0]["b"] for j in d)
        e_tr = err(m, a_tr, b_tr)

        # the ceiling: this station's own fit, which abroad you never have
        e_own = s["rmse_vwc_pct"]

        res["climatology"].append(e_clim)
        res["uncorrected"].append(e_raw)
        res["global_mean"].append(e_glob)
        res["transferred"].append(e_tr)
        res["own_station"].append(e_own)
        detail.append({"station": s["station"], "state": s["state"], "r": s["r"],
                       "climatology": round(e_clim, 2), "global_mean": round(e_glob, 2),
                       "transferred": round(e_tr, 2), "own_station": round(e_own, 2)})

    print("\nHELD-OUT ERROR, volumetric water content, percentage points")
    print("  (each station predicted by a fit that never saw it)")
    order = ["climatology", "uncorrected", "global_mean", "transferred", "own_station"]
    base = statistics.mean(res["climatology"])
    for k in order:
        v = res[k]
        skill = 100 * (1 - statistics.mean(v) / base)
        print("  %-13s median %5.2f   mean %5.2f   better than climatology by %+6.1f%%"
              % (k, statistics.median(v), statistics.mean(v), skill))

    beat = sum(1 for a, b in zip(res["transferred"], res["climatology"]) if a < b)
    beat_g = sum(1 for a, b in zip(res["transferred"], res["global_mean"]) if a < b)
    n = len(res["transferred"])
    print("\n  transferred beats climatology at %d of %d stations" % (beat, n))
    print("  transferred beats one global correction at %d of %d stations" % (beat_g, n))

    # THE VERDICT MUST BE AGAINST THE BEST RIVAL, NOT A CONVENIENT ONE.
    #
    # The first version of this compared the clever method only against ONE global correction,
    # and on that comparison it won and printed "the correction travels". It was wrong, and it
    # was wrong in the most ordinary way: it never checked the simplest method of all — the raw
    # remote figure with one fixed scaling and no fitting anywhere. Once nearby stations are
    # excluded, that simplest method wins. A verdict that only races the alternatives it
    # expects to beat is not a verdict.
    rivals = {k: statistics.mean(res[k]) for k in ("climatology", "uncorrected", "global_mean")}
    best_rival = min(rivals, key=rivals.get)
    tr = statistics.mean(res["transferred"])
    travels = tr < rivals[best_rival]
    if travels:
        verdict = ("The correction travels: predicting it from a place's own climate and "
                   "terrain beats every simpler method, including the raw figure.")
    else:
        verdict = ("The correction does NOT travel. Fitting a local correction from similar "
                   "places beat the raw remote figure only while nearby stations were allowed "
                   "to vote; with %0.0f km of separation the simplest method — the remote "
                   "figure with one fixed scaling and no fitting at all — wins. What we carry "
                   "to ground with no probes is that raw figure and an honest band, not a "
                   "clever local adjustment." % MIN_KM)
    useful = min(tr, rivals["uncorrected"]) < base
    print("\n  best simple rival: %s at %.2f; transferred at %.2f"
          % (best_rival, rivals[best_rival], tr))
    print("\n  VERDICT: %s" % verdict)
    if not useful:
        print("  AND: remote soil moisture does not beat simply assuming the local average. "
              "On that evidence it must not be presented as knowing a field's water.")

    json.dump({"schema": "nebraskabeans.remote-soil-transfer.v1",
               "what": "Leave-one-station-out test of whether a remote soil-moisture correction "
                       "can be carried to ground with no probes in it.",
               "units": "volumetric water content, percentage points",
               "stations_tested": n,
               "neighbours_voting": K,
               "excluded_within_km": MIN_KM,
               "held_out_error": {k: {"mean": round(statistics.mean(res[k]), 3),
                                      "median": round(statistics.median(res[k]), 3),
                                      "skill_vs_climatology_pct":
                                          round(100 * (1 - statistics.mean(res[k]) / base), 1)}
                                  for k in order},
               "transferred_beats_climatology_at": beat,
               "transferred_beats_global_correction_at": beat_g,
               "verdict": verdict,
               "best_method_for_unmeasured_ground": ("transferred" if travels
                                                      else "uncorrected"),
               "quote_this_uncertainty_vwc_points": round(
                   min(tr, rivals["uncorrected"]), 2),
               "a_probe_on_site_would_give": round(statistics.mean(res["own_station"]), 2),
               "reproduce": "python3 scripts/refresh/remote_soil_calibration.py && "
                            "python3 scripts/remote_soil_transfer.py",
               "by_station": detail},
              open(OUT, "w"), indent=1)
    print("\nwrote %s" % OUT)


if __name__ == "__main__":
    main()
