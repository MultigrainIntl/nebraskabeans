#!/usr/bin/env python3
"""
The prediction ledger — every forecast frozen on the day it was made.

WHY THIS EXISTS. The site rebuilds every dataset each morning and overwrites yesterday's. That
is correct for what the site shows and fatal for learning anything: when a grower reports in
November what a field actually made, there has to be a record of what this model said in June,
in July, in August, or the report teaches nothing. A model that cannot be scored cannot be
improved, and every day without this file is a day of training data destroyed.

WHAT IT RECORDS. One immutable row per prediction: the date it was made, the crop, the region,
the number, and — this is the part that matters — the inputs that produced it. Canopy, measured
radiation, growing degree days, days of season counted. When truth arrives, the error can be
attributed to an input rather than shrugged at.

A row is written once and never rewritten. If the model changes, that is a new row with a new
model version beside it, not an edit. The point of a ledger is that you cannot go back and
improve your own past predictions.

HOW TRUTH GETS IN. observations.json holds reported outcomes — a yield, a place, a date, who
said so. score() joins the two and reports the error per crop, per region, per lead time. That
join is the whole feedback loop: the residual between what remote sensing said and what the
field did is the correction to be learned, and it is learnable from a handful of fields because
it is one multiplier per crop, not a model refit.

It is also the honest answer to global coverage. There will never be ground truth for every
growing region on earth. There does not need to be: remote sensing carries the signal
everywhere, and the places that DO report calibrate the places that never will — provided the
predictions were written down first.
"""
import hashlib, json, os, sys
from collections import defaultdict
from datetime import date, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
LEDGER = os.path.join(DATA, "archive", "prediction-ledger.jsonl")
TRUTH = os.path.join(DATA, "observations.json")
SCORE = os.path.join(DATA, "model-scorecard.json")

MODEL_VERSION = "rue-index-v1"


def load_ledger():
    rows = []
    if os.path.exists(LEDGER):
        with open(LEDGER) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except Exception:
                        pass
    return rows


def record():
    """Append today's predictions. Idempotent: a second run on the same day adds nothing."""
    made_on = date.today().isoformat()
    existing = {(r["made_on"], r["model"], r["region"], r["crop"]) for r in load_ledger()}

    src = None
    for name in ("yield-index-2026.json", "yield-all-2026.json"):
        p = os.path.join(DATA, name)
        if os.path.exists(p):
            src = json.load(open(p))
            break
    if not src:
        print("no yield file to record", file=sys.stderr)
        return 0

    latest = src.get("latest_observation") or src.get("year")
    added = 0
    os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
    with open(LEDGER, "a") as f:
        for region, r in src.get("regions", {}).items():
            for crop, c in r.get("classes", {}).items():
                key = (made_on, MODEL_VERSION, region, crop)
                if key in existing:
                    continue
                row = {
                    "made_on": made_on,
                    "model": MODEL_VERSION,
                    "region": region,
                    "crop": crop,
                    "crop_year": src.get("year"),
                    "evidence_through": latest,
                    # the prediction
                    "lb_ac": c.get("lb_ac"),
                    "lb_ac_low": c.get("lb_ac_low"),
                    "lb_ac_high": c.get("lb_ac_high"),
                    "index": c.get("index"),
                    "vs_normal_pct": c.get("vs_normal_pct"),
                    # the inputs behind it, so an error can be attributed rather than shrugged at
                    "inputs": {
                        "planted": c.get("planted"),
                        "planting_basis": c.get("planting_basis"),
                        "gdd": c.get("gdd"),
                        "pct_of_maturity": c.get("pct_of_maturity"),
                        "stress_days": c.get("stress_days"),
                        "days_counted": c.get("days_counted"),
                        "light_measured_days": c.get("season_days_measured_light"),
                        "light_estimated_days": c.get("season_days_estimated_light"),
                        "baseline_lb_ac": c.get("baseline_lb_ac"),
                        "canopy_above_air_c": r.get("canopy_above_air_c"),
                        "canopy_rank": r.get("canopy_rank"),
                    },
                }
                f.write(json.dumps(row, separators=(",", ":")) + "\n")
                added += 1
    print("ledger: %d rows appended for %s (%d already held)"
          % (added, made_on, len(existing)), file=sys.stderr)
    return added


def score():
    """Join reported outcomes to what was predicted, and report the error honestly."""
    if not os.path.exists(TRUTH):
        json.dump({"schema": "gisit.scorecard.v1",
                   "status": "no reported outcomes yet",
                   "how_to_contribute": "a reported outcome needs a crop, a region, a crop "
                                        "year, a yield in lb/ac, and who reported it",
                   "predictions_on_record": len(load_ledger()),
                   "note": "the ledger is accumulating so that the first report can be scored "
                           "against what was predicted before it arrived",
                   "pairs": []},
                  open(SCORE, "w"), indent=1)
        print("no reported outcomes yet; %d predictions on record and waiting"
              % len(load_ledger()), file=sys.stderr)
        return 0

    truth = json.load(open(TRUTH)).get("observations", [])
    rows = load_ledger()
    pairs = []
    for t in truth:
        for r in rows:
            if (r["region"] == t.get("region") and r["crop"] == t.get("crop")
                    and r.get("crop_year") == t.get("crop_year") and r.get("lb_ac")):
                lead = (date.fromisoformat(t["harvested_on"])
                        - date.fromisoformat(r["made_on"])).days
                if lead < 0:
                    continue          # never score a prediction made after the fact
                pairs.append({
                    "crop": r["crop"], "region": r["region"], "crop_year": r["crop_year"],
                    "made_on": r["made_on"], "lead_days": lead,
                    "predicted_lb_ac": r["lb_ac"], "actual_lb_ac": t["lb_ac"],
                    "error_lb_ac": r["lb_ac"] - t["lb_ac"],
                    "error_pct": round(100 * (r["lb_ac"] - t["lb_ac"]) / t["lb_ac"], 1),
                    "reported_by": t.get("reported_by"),
                })

    # the correction to be learned: one multiplier per crop, from the reports that exist
    by_crop = defaultdict(list)
    for p in pairs:
        if p["lead_days"] <= 120:
            by_crop[p["crop"]].append(p["actual_lb_ac"] / p["predicted_lb_ac"])
    correction = {c: round(sum(v) / len(v), 3) for c, v in by_crop.items() if len(v) >= 2}

    json.dump({"schema": "gisit.scorecard.v1",
               "generated_utc": datetime.utcnow().isoformat() + "Z",
               "predictions_on_record": len(rows),
               "reported_outcomes": len(truth),
               "scored_pairs": len(pairs),
               "method": "each reported outcome is joined to every prediction made BEFORE it, "
                         "so the error is always measured against a forecast that could not "
                         "have seen the answer",
               "learned_correction": correction,
               "correction_note": "the ratio of what the field did to what remote sensing said, "
                                  "per crop, from reports on hand. Applied, it carries what the "
                                  "reporting fields taught to every region that will never "
                                  "report one. Two reports is not a calibration; it is the "
                                  "beginning of one, and the count is published so nobody "
                                  "mistakes it for more.",
               "pairs": sorted(pairs, key=lambda p: (p["crop"], p["made_on"]))},
              open(SCORE, "w"), indent=1)
    print("scored %d prediction-outcome pairs across %d reports"
          % (len(pairs), len(truth)), file=sys.stderr)
    for c, k in sorted(correction.items()):
        print("  %-20s remote sensing reads %.2fx the reported yield" % (c, 1 / k),
              file=sys.stderr)
    return 0


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "both"
    if what in ("record", "both"):
        record()
    if what in ("score", "both"):
        score()
    return 0


if __name__ == "__main__":
    sys.exit(main())
