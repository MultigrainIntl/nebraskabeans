#!/usr/bin/env python3
"""A yield signal built on pod set and heat at flowering, tested against every harvest.

WHY. GAJ, 18 September 2026: "build it on flowering as long as this takes into account loss due
to heat." He is describing the physiology correctly. Our biomass model reads the CANOPY, and a
canopy is leaves. A bean that flowers through a run of hot days sheds flowers and blasts pods,
and the field stays green while the crop in it shrinks. That is why the model said Panhandle
pinto was 5% ABOVE normal in a year the trade knew was short: it was looking at the wrong organ.

THE SIGNAL. During the reproductive window — 40% to 80% of the heat the class needs to mature —
count the days at or above that class's heat threshold, as a fraction of the window. High
fraction means flowers lost.

WHAT IS TESTED, honestly, and it is allowed to fail:
  biomass   the canopy signal alone, which is what the site has used until now
  heat      flowering heat alone
  both      the two together
Each is fitted on the OTHER years and scored on the year held out, against the same bar as
everything else here: beating the naive forecast of "this year will yield what the others
averaged". Two predictors on ten years overfits easily, and holding the year out is what makes
that visible instead of flattering.

WHAT THE FIRST RUN FOUND, recorded so nobody has to rediscover it: flowering heat tracks yield
strongly for Nebraska peas (r = -0.70) and moderately for kidney beans in both states, and says
NOTHING for pinto and great northern. Physiology that is real in the field is not automatically
measurable from a weather station 40 km away.
"""
import json, math, os, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "refresh"))
DATA = os.path.join(HERE, "..", "assets", "data")
ARCHIVE = os.path.join(DATA, "archive")

import yield_index as Y
from yield_all import CLASSES

OUT = os.path.join(DATA, "flowering-model.json")

# The bar a model must clear before its number reaches a page, in percent better than guessing
# the average of the other years, measured on years held out of the fit.
MIN_SKILL_PCT = 5.0


def gather():
    """Per state and class, per year: canopy biomass, flowering heat fraction, actual yield."""
    h = Y.load_history()
    obs = json.load(open(os.path.join(ARCHIVE, "canopy-history.json")))["observations"]
    pulses = json.load(open(os.path.join(ARCHIVE, "canopy-pulses.json")))["commodities"]
    irrig = json.load(open(os.path.join(DATA, "irrigation.json")))["crops"]
    actual = json.load(open(os.path.join(DATA, "usda-class-yields.json")))["classes"]
    cells = json.load(open(os.path.join(HERE, "refresh", "bean-cells-by-county.json")))

    acc = {}
    for region in Y.NAMES:
        st = Y.STATE_OF.get(region)
        rad = h["radiation"].get(region) or {}
        tmp = (h["temperature"].get(region) or {}).get("daily") or {}
        if not rad or not tmp:
            continue
        soil = ((h.get("soil") or {}).get(region) or {}).get("GWETROOT") or {}
        cl = [c for c in cells if c["region"] == region]
        aw = sum(max(c["acres"], 0.01) for c in cl) or 1

        def canopy_for(year, com):
            if com == "DRY BEANS":
                return {k[5:]: v[region]["mean"] for k, v in obs.items()
                        if k.startswith(str(year)) and region in v
                        and v[region].get("q") != "suspect"}
            b = pulses.get(com, {}).get("observations", {})
            return {k[5:]: (v[region]["mean"] if isinstance(v[region], dict) else v[region])
                    for k, v in b.items() if k.startswith(str(year)) and region in v}

        for cls, spec in CLASSES.items():
            com = spec[6]
            ir = ((irrig.get(com) or {}).get(region) or {}).get("irrigated_share_of_ground")
            for y in Y.YEARS:
                t = {k: v for k, v in tmp.items() if k.startswith(str(y))}
                c = canopy_for(y, com)
                if not t or not c:
                    continue
                r = {k: v for k, v in rad.items() if k.startswith(str(y))}
                g = Y.season_biomass(cls, spec, region, y, c, r, t, c,
                                     soil=soil, irrigated_share=(ir / 100.0) if ir else 0.0)
                if not g or not g[4]:
                    continue
                a = acc.setdefault((st, cls), {}).setdefault(y, [0.0, 0.0, 0.0])
                a[0] += g[0] * aw               # biomass
                a[1] += (g[3] / g[4]) * aw      # share of flowering days that were hot
                a[2] += aw

    out = {}
    for (st, cls), yrs in acc.items():
        nm = Y.USDA_CLASS.get(cls)
        full = Y.FULL_STATE.get(st)
        rec = ((actual.get(nm) or {}).get(full) or {}).get("by_year") or {}
        rows = [(y, yrs[y][0] / yrs[y][2], yrs[y][1] / yrs[y][2], float(rec[str(y)]))
                for y in sorted(yrs) if str(y) in rec and yrs[y][2]]
        if len(rows) >= 7:
            out[(st, cls)] = rows
    return out


def solve(rows, cols):
    """Least squares of yield on the chosen columns plus an intercept. Normal equations, and a
    ridge of 1e-9 only so a degenerate column cannot raise an exception."""
    n = len(rows)
    X = [[1.0] + [r[c] for c in cols] for r in rows]
    yv = [r[-1] for r in rows]
    k = len(cols) + 1
    A = [[sum(X[i][a] * X[i][b] for i in range(n)) + (1e-9 if a == b else 0.0)
          for b in range(k)] for a in range(k)]
    B = [sum(X[i][a] * yv[i] for i in range(n)) for a in range(k)]
    for i in range(k):                       # gaussian elimination
        p = max(range(i, k), key=lambda r: abs(A[r][i]))
        if abs(A[p][i]) < 1e-12:
            return None
        A[i], A[p] = A[p], A[i]
        B[i], B[p] = B[p], B[i]
        for r in range(i + 1, k):
            f = A[r][i] / A[i][i]
            for c in range(i, k):
                A[r][c] -= f * A[i][c]
            B[r] -= f * B[i]
    coef = [0.0] * k
    for i in range(k - 1, -1, -1):
        coef[i] = (B[i] - sum(A[i][c] * coef[c] for c in range(i + 1, k))) / A[i][i]
    return coef


def main():
    data = gather()
    MODELS = {"biomass": [1], "heat": [2], "both": [1, 2]}
    print("%-3s %-18s %3s %9s %9s %9s %9s"
          % ("st", "class", "yr", "naive", "biomass", "heat", "both"))
    summary = {m: [] for m in MODELS}
    detail = {}
    for (st, cls), rows in sorted(data.items()):
        n = len(rows)
        line = {}
        naive = 0.0
        for i in range(n):
            others = [rows[j] for j in range(n) if j != i]
            naive += abs(statistics.mean(o[-1] for o in others) - rows[i][-1])
        naive /= n
        for m, cols in MODELS.items():
            err = 0.0
            ok = True
            for i in range(n):
                others = [rows[j] for j in range(n) if j != i]
                co = solve(others, cols)
                if co is None:
                    ok = False
                    break
                pred = co[0] + sum(co[1 + k] * rows[i][c] for k, c in enumerate(cols))
                err += abs(pred - rows[i][-1])
            line[m] = (err / n) if ok else None
        print("%-3s %-18s %3d %9.0f %9s %9s %9s"
              % (st, cls, n, naive,
                 *["%.0f" % line[m] if line[m] is not None else "-" for m in
                   ("biomass", "heat", "both")]))
        for m in MODELS:
            if line[m] is not None:
                summary[m].append(100 * (1 - line[m] / naive) if naive else 0.0)
        detail["%s|%s" % (st, cls)] = {
            "years": n, "naive_mae": round(naive, 1),
            **{m: (round(line[m], 1) if line[m] is not None else None) for m in MODELS},
            **{m + "_skill_pct": (round(100 * (1 - line[m] / naive), 1)
                                  if line[m] is not None and naive else None) for m in MODELS}}

    print("\nSKILL AGAINST GUESSING THE AVERAGE OF THE OTHER YEARS (higher is better)")
    for m in ("biomass", "heat", "both"):
        v = summary[m]
        print("  %-8s beats guessing in %d of %d   mean skill %+6.1f%%"
              % (m, sum(1 for x in v if x > 0), len(v),
                 statistics.mean(v) if v else float("nan")))
    print("\nA signal that is real in the field is not automatically measurable from a weather\n"
          "station 40 km away. Only what clears the bar above may move a published number.")

    # THE COEFFICIENTS THE LIVE MODEL WILL USE, for whatever cleared the bar.
    #
    # Fitted on every harvested year and applied to a year that is not among them. Only
    # state-classes whose HELD-OUT skill is positive get published coefficients; the rest get
    # nothing, because a fit that could not predict a year it had not seen has no business
    # predicting this one.
    publish = {}
    for (st, cls), rows in sorted(data.items()):
        d = detail["%s|%s" % (st, cls)]
        # A FEW PERCENT IS NOISE, NOT SKILL. On eight to ten years, a model that beats
        # guessing by under five percent has shown nothing; the first run offered Nebraska
        # great northern at +0.8% with a NEGATIVE coefficient on biomass — "the greener it
        # was, the worse it yielded" — which is the backwards reading this project has already
        # tested and rejected. Publishing it because the arithmetic came out barely positive
        # would be exactly the error the whole session has been undoing.
        best, best_skill = None, MIN_SKILL_PCT
        for m in ("heat", "biomass", "both"):
            sk = d.get(m + "_skill_pct")
            if sk is not None and sk > best_skill:
                best, best_skill = m, sk
        if not best:
            continue
        co = solve(rows, MODELS[best])
        if co is None:
            continue
        publish["%s|%s" % (st, cls)] = {
            "model": best, "skill_pct": best_skill, "years": len(rows),
            "intercept": round(co[0], 4),
            "coefficients": {("biomass" if c == 1 else "flowering_heat_fraction"):
                             round(co[1 + k], 6) for k, c in enumerate(MODELS[best])},
            "mean_yield_lb_ac": round(statistics.mean(r[-1] for r in rows), 1),
            "note": "Fitted on %d-%d, applied to a year not in the fit. Skill is the held-out "
                    "figure: each year predicted by a fit that never saw it."
                    % (min(r[0] for r in rows), max(r[0] for r in rows))}

    json.dump({"schema": "nebraskabeans.flowering-model.v1",
               "publish": publish,
               "publish_rule": "Only a state-class with POSITIVE held-out skill appears here. "
                               "Everything else publishes no yield at all — never the "
                               "historical average, which is the yardstick and not the answer.",
               "what": "Yield predicted from canopy biomass, from heat during flowering, and "
                       "from both, each fitted on the other years and scored on the year held "
                       "out.",
               "why": "The canopy signal reads leaves. Heat during flowering sheds pods while "
                      "the field stays green, which is how a short crop can look normal.",
               "bar": "Must beat the naive forecast: this year yields what the other years "
                      "averaged.",
               "reproduce": "python3 scripts/flowering_model.py",
               "by_state_class": detail,
               "summary": {m: {"beats_guessing": sum(1 for x in summary[m] if x > 0),
                               "of": len(summary[m]),
                               "mean_skill_pct": (round(statistics.mean(summary[m]), 1)
                                                  if summary[m] else None)}
                           for m in MODELS}},
              open(OUT, "w"), indent=1)
    print("\nwrote %s" % OUT)


if __name__ == "__main__":
    main()
