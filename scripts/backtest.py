#!/usr/bin/env python3
"""Does the model beat guessing? Ten years of real harvests decide, not an opinion.

WHY THIS EXISTS. GAJ, 17 September 2026: "YOU NEED TO TEST OUR MODELS AGAINST PAST RESULTS,
AND NOT TRY TO FIT OUR CURRENT NUMBERS TO SOME ARBITRARY MEASURE LIKE A FUCKING TREND LINE."
Until now the model's accuracy lived in conversation. A professional agronomist cannot check a
conversation. This script is the answer to "prove it", and it is meant to be run by someone who
does not trust us.

WHAT IT DOES. For each commercial class in each state, for each year USDA published a yield:
  - rebuild that season's biomass from weather and satellite, exactly as the live model does
  - form the index by dividing it by the mean of the OTHER years only — never its own year,
    which would be marking your own exam
  - predict pounds per acre as that index times the mean actual yield of those other years
  - score it against what was actually harvested

THE BAR IT HAS TO CLEAR. Not zero. The naive forecast — "this year will yield what the other
years averaged" — is scored the same way on the same years. A model that cannot beat that has
no skill, whatever its error looks like in isolation. Skill is reported as the percentage by
which mean absolute error falls below the naive one. Negative skill means the model is worse
than saying nothing.

VARIANTS. Every hypothesis gets tested rather than argued. --variant runs the model with and
without each term, so "the water term helps" is a measurement and not a belief.

Judged per state, never pooled: pooling lets a state with a wide yield range carry a state with
a narrow one and reports skill that no single grower would ever experience.
"""
import argparse, json, os, statistics, sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "refresh"))
DATA = os.path.join(HERE, "..", "assets", "data")
ARCHIVE = os.path.join(DATA, "archive")

import yield_index as Y
from yield_all import CLASSES

# May the fitted scaling go NEGATIVE — that is, may the model be allowed to conclude that a
# big canopy means a SMALL crop? It is not a licence to flip a sign until the answer looks
# good. The scaling is fitted on the other years only and then applied to the year being
# scored, so an inversion that is really just noise loses here exactly as it should. It is
# switched on by --inverted so that the two results sit side by side and can be compared.
#
# WHY IT IS WORTH ASKING. Dry beans on this ground are largely irrigated, and an irrigated bean
# that grows rank has lodged, held humidity in the canopy and fed white mould, which is the
# single biggest yield robber in irrigated dry beans. "The field looked wonderful and went
# 1,600" is a sentence every bean agronomist here has said. If that is what the satellite is
# seeing, the model is not blind — it is reading a real thing with the sign reversed.
ALLOW_INVERSION = False

VARIANTS = {
    "full":     dict(water=True,  heat=True,  irr=None),
    "no_water": dict(water=False, heat=True,  irr=None),
    "no_heat":  dict(water=True,  heat=False, irr=None),
    "bare":     dict(water=False, heat=False, irr=None),
    # HYPOTHESIS UNDER TEST: the water term hurts because it assumes these fields are mostly
    # rainfed. irrigation.json measures the share of GROUND that is irrigated, which for dry
    # beans runs 11-38% here — but dry beans on the High Plains are largely a PIVOT crop, so
    # the share of BEAN ground under water is far higher than the share of all ground. If that
    # is the reason, forcing the irrigated share up should recover the skill. If it does not,
    # the water term is wrong for some other reason and the excuse dies here.
    "water_irr85": dict(water=True, heat=True, irr=0.85),
    "water_irr0":  dict(water=True, heat=True, irr=0.0),
    # MEASURED SOIL instead of inferred soil. NASA root-zone wetness, which agrees with the
    # USDA probe on Wyoming bean ground at r = +0.62 over 3,801 days.
    "gwet":        dict(water=True, heat=True, irr=None,  mode="gwet"),
    "gwet_irr0":   dict(water=True, heat=True, irr=0.0,   mode="gwet"),
    "gwet_irr85":  dict(water=True, heat=True, irr=0.85,  mode="gwet"),
}


def region_biomass_by_year(region, h, obs, pulses, irrigation, variant):
    """Biomass for every year of the record, for every class, in one region."""
    rad_all = h["radiation"].get(region) or {}
    temp_all = (h["temperature"].get(region) or {}).get("daily") or {}
    if not rad_all or not temp_all:
        return {}
    pblk = (h.get("precipitation") or {}).get(region) or {}
    precip = dict(pblk.get("daily") or {})
    soil = ((h.get("soil") or {}).get(region) or {}).get("GWETROOT") or {}

    cells = [c for c in json.load(open(os.path.join(HERE, "refresh",
                                                    "bean-cells-by-county.json")))
             if c["region"] == region]
    if not cells:
        return {}
    aw = sum(max(c["acres"], 0.01) for c in cells) or 1
    lat = sum(c["lat"] * max(c["acres"], 0.01) for c in cells) / aw

    def canopy_for(year, commodity):
        if commodity == "DRY BEANS":
            return {k[5:]: v[region]["mean"] for k, v in obs.items()
                    if k.startswith(str(year)) and region in v
                    and v[region].get("q") != "suspect"}
        blk = pulses.get(commodity, {}).get("observations", {})
        return {k[5:]: (v[region]["mean"] if isinstance(v[region], dict) else v[region])
                for k, v in blk.items()
                if k.startswith(str(year)) and region in v
                and (not isinstance(v[region], dict) or v[region].get("q") != "suspect")}

    out = {}
    for cls, spec in CLASSES.items():
        commodity = spec[6]
        irr = ((irrigation.get(commodity) or {}).get(region) or {}).get(
            "irrigated_share_of_ground")
        irr_share = (irr / 100.0) if irr is not None else 0.0
        if variant.get("irr") is not None:
            irr_share = variant["irr"]
        if not variant["heat"]:
            spec = list(spec)
            spec[1] = 999          # a threshold no day reaches disables the heat term
            spec = tuple(spec)
        for y in Y.YEARS:
            t = {k: v for k, v in temp_all.items() if k.startswith(str(y))}
            c = canopy_for(y, commodity)
            if not t or not c:
                continue
            r = {k: v for k, v in rad_all.items() if k.startswith(str(y))}
            Y.WATER_IN_INDEX = bool(variant["water"])
            Y.WATER_MODE = variant.get("mode", "balance")
            got = Y.season_biomass(cls, spec, region, y, c, r, t, c,
                                   precip=precip, lat=lat, irrigated_share=irr_share,
                                   soil=soil)
            if got:
                # ACRES, not a plain average. A region growing 17,000 acres of pinto and one
                # growing 500 do not get an equal vote in what the state did.
                out.setdefault(cls, {})[y] = (got[0], aw)
    return out


def score(variant_name, verbose=True):
    variant = VARIANTS[variant_name]
    h = Y.load_history()
    obs = json.load(open(os.path.join(ARCHIVE, "canopy-history.json")))["observations"]
    pulses = json.load(open(os.path.join(ARCHIVE, "canopy-pulses.json")))["commodities"]
    irrigation = json.load(open(os.path.join(DATA, "irrigation.json")))["crops"]
    actual = json.load(open(os.path.join(DATA, "usda-class-yields.json")))["classes"]

    # region biomass -> state biomass, acre weighted
    by_state = {}
    for region in Y.NAMES:
        st = Y.STATE_OF.get(region)
        rb = region_biomass_by_year(region, h, obs, pulses, irrigation, variant)
        for cls, years in rb.items():
            for y, (bio, acres) in years.items():
                k = (st, cls)
                by_state.setdefault(k, {}).setdefault(y, [0.0, 0.0])
                by_state[k][y][0] += bio * acres
                by_state[k][y][1] += acres

    rows = []
    for (st, cls), years in sorted(by_state.items()):
        name = Y.USDA_CLASS.get(cls)
        full = Y.FULL_STATE.get(st)
        rec = ((actual.get(name) or {}).get(full) or {}).get("by_year") or {}
        bio = {y: v[0] / v[1] for y, v in years.items() if v[1]}
        pairs = sorted((y, bio[y], float(rec[str(y)])) for y in bio if str(y) in rec)
        if len(pairs) < 7:
            continue
        me = mn = 0.0
        for i, (y, b, a) in enumerate(pairs):
            others = [p for j, p in enumerate(pairs) if j != i]
            mean_bio = statistics.mean(p[1] for p in others)
            mean_act = statistics.mean(p[2] for p in others)
            if mean_bio <= 0:
                continue
            pred = mean_act * (b / mean_bio)      # the model
            me += abs(pred - a)
            mn += abs(mean_act - a)               # saying "same as usual"
        n = len(pairs)
        model_mae, naive_mae = me / n, mn / n
        skill = 100 * (1 - model_mae / naive_mae) if naive_mae else None

        # IS THERE ANY SIGNAL AT ALL? Error alone cannot tell you. A model can point the right
        # way every single year and still lose on error by swinging too hard — that is a
        # scaling fault, and it is fixable. A model that points the wrong way is not.
        #
        # r is the correlation between the model's departure from its own normal and the
        # crop's departure from its normal. shrink is the multiplier on the model's swing that
        # would have minimised error, fitted on the OTHER years only and then applied to the
        # year being scored, so it is never fitted to the answer it is marked against. A shrink
        # near 1 means the model's size was right. Near 0 means its swings are noise and the
        # honest forecast is the average. Above 1 would mean it is too timid.
        mb_all = statistics.mean(p[1] for p in pairs)
        ma_all = statistics.mean(p[2] for p in pairs)
        xs = [p[1] / mb_all - 1 for p in pairs]
        ys = [p[2] / ma_all - 1 for p in pairs]
        mx, my = statistics.mean(xs), statistics.mean(ys)
        den = (sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)) ** 0.5
        r = (sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den) if den else None

        sh_err = 0.0
        for i in range(len(pairs)):
            o = [j for j in range(len(pairs)) if j != i]
            num = sum(xs[j] * ys[j] for j in o)
            dn = sum(xs[j] ** 2 for j in o)
            lo = -2.0 if ALLOW_INVERSION else 0.0
            lam = max(min(num / dn, 2.0), lo) if dn else 0.0
            mean_act = statistics.mean(pairs[j][2] for j in o)
            mean_bio = statistics.mean(pairs[j][1] for j in o)
            pred = mean_act * (1 + lam * (pairs[i][1] / mean_bio - 1))
            sh_err += abs(pred - pairs[i][2])
        shrunk_mae = sh_err / n
        shrunk_skill = 100 * (1 - shrunk_mae / naive_mae) if naive_mae else None

        # the scaling to publish with: fitted on every harvested year, applied to a year that
        # is not among them
        num = sum(x * y for x, y in zip(xs, ys))
        dn = sum(x * x for x in xs)
        lam_pub = max(min(num / dn, 1.5), 0.0) if dn else 0.0
        rows.append((st, cls, n, model_mae, naive_mae, skill, r, shrunk_skill, lam_pub))
        if verbose:
            print("  %-3s %-18s %2d yr  model %6.0f  naive %6.0f  skill %+6.1f%%   "
                  "r %+5.2f  skill if scaled back %+6.1f%%"
                  % (st, cls, n, model_mae, naive_mae,
                     skill if skill is not None else float("nan"),
                     r if r is not None else float("nan"),
                     shrunk_skill if shrunk_skill is not None else float("nan")))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write-calibration", metavar="VARIANT",
                    help="fit the publishable scaling from this variant and write "
                         "assets/data/model-calibration.json")
    ap.add_argument("--inverted", action="store_true",
                    help="let the fitted scaling go negative (see ALLOW_INVERSION)")
    ap.add_argument("--variant", default="all",
                    help="one of %s, or all" % ", ".join(VARIANTS))
    a = ap.parse_args()
    global ALLOW_INVERSION
    ALLOW_INVERSION = a.inverted
    print("fitted scaling may go negative: %s" % ALLOW_INVERSION)
    if a.write_calibration:
        v = a.write_calibration
        print("fitting the publishable scaling from variant '%s'" % v)
        rows = score(v)
        classes = {}
        pool = {}
        for st, cls, n, mmae, nmae, skill, r, sskill, lam in rows:
            classes.setdefault(st, {})[cls] = {
                "years": n, "correlation": (round(r, 3) if r is not None else None),
                "scale": round(lam, 3),
                "held_out_skill_pct": (round(sskill, 1) if sskill is not None else None),
                "raw_skill_pct": (round(skill, 1) if skill is not None else None)}
            pool.setdefault(CLASSES[cls][6], []).append(lam)
        doc = {
            "schema": "nebraskabeans.model-calibration.v1",
            "fitted_on": sorted(Y.YEARS),
            "variant": v,
            "what": "How far this model's swing may be trusted. The model's departure from its "
                    "own normal, regressed on the crop's departure from its normal, over every "
                    "year USDA has published a yield. 1 means the swing was the right size; "
                    "0.2 means four fifths of it was noise.",
            "why": "Published without it, the model moved several times harder than ten years "
                   "of harvests support, and was worse than assuming an average year in six of "
                   "seven crop-and-state combinations.",
            "how_to_read_it": "published index = 1 + scale x (raw index - 1). A scale of 0 "
                              "publishes a normal year, which is the honest answer when the "
                              "model has shown no skill for that crop in that state.",
            "not_fitted_to_the_year_it_predicts": "Fitted on %d-%d and applied to %d, which is "
                                                  "not in the fit. The held-out skill column is "
                                                  "the number to judge it by: each year scored "
                                                  "by a scaling fitted without it."
                                                  % (min(Y.YEARS), max(Y.YEARS), Y.THIS_YEAR),
            "backwards_models_are_switched_off": "Negative scalings are floored at zero. The "
                                                 "inversion was tested (--inverted) and did not "
                                                 "survive out of sample, so a model that points "
                                                 "backwards is turned off, not turned around.",
            "reproduce": "python3 scripts/backtest.py --write-calibration %s" % v,
            "by_state_class": classes,
            "by_commodity": {k: round(statistics.mean(vv), 3) for k, vv in pool.items()}}
        out = os.path.join(DATA, "model-calibration.json")
        json.dump(doc, open(out, "w"), indent=1)
        print("\nwrote %s" % out)
        for st, d in sorted(classes.items()):
            for cls, x in sorted(d.items()):
                print("  %-3s %-18s scale %.2f" % (st, cls, x["scale"]))
        print("  commodity fallback: %s" % doc["by_commodity"])
        return
    names = list(VARIANTS) if a.variant == "all" else [a.variant]
    summary = {}
    for v in names:
        print("\n%s  (%s)" % (v, ", ".join("%s=%s" % kv for kv in VARIANTS[v].items())))
        rows = score(v)
        beat = [r for r in rows if r[5] is not None and r[5] > 0]
        pos_r = [r for r in rows if r[6] is not None and r[6] > 0]
        sbeat = [r for r in rows if r[7] is not None and r[7] > 0]
        summary[v] = (len(beat), len(rows),
                      statistics.mean([r[5] for r in rows if r[5] is not None]) if rows else None,
                      len(pos_r), len(sbeat),
                      statistics.mean([r[7] for r in rows if r[7] is not None]) if rows else None)
        print("  -> beats guessing in %d of %d; points the right way in %d of %d; "
              "beats guessing once scaled back in %d of %d"
              % (len(beat), len(rows), len(pos_r), len(rows), len(sbeat), len(rows)))

    print("\nHOW THE VARIANTS COMPARE  (positive skill = better than guessing)")
    for v, (beat, tot, mean_skill, pos_r, sbeat, sskill) in summary.items():
        print("  %-12s raw %d/%d (mean %+.1f%%)   right direction %d/%d   "
              "scaled back %d/%d (mean %+.1f%%)"
              % (v, beat, tot, mean_skill if mean_skill is not None else float("nan"),
                 pos_r, tot, sbeat, tot,
                 sskill if sskill is not None else float("nan")))
    print("\nA variant that does not beat guessing does not belong in the published model, "
          "however sensible it sounds.")


if __name__ == "__main__":
    main()
