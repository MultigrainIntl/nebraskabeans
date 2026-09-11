#!/usr/bin/env python3
"""Build the versioned GISit in-season dry-bean outlook artifact.

The model is intentionally small and auditable.  It calibrates weather/GDD
features against historical USDA NASS pinto yield outcomes, but never uses a
current USDA yield forecast as a predictor.  A selected-date forecast uses
weather observed through that date and a leave-history-out day-of-year median
for the unobserved remainder of the season.

This script can reuse downloaded inputs (the default in CI/review workflows)
or fetch the exact governed source queries for a fresh build.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import statistics
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_START = dt.date(2026, 4, 15)
ANALYSIS_END = dt.date(2026, 9, 9)
TRAIN_START = 2000
TRAIN_END = 2025
BASE_F = 50.0
MATURITY_GDD = 1625.0  # arithmetic midpoint of the sourced 1,550–1,700 range
RIDGE_ALPHA = 3.0
QUICK_STATS_UUID = "57F40BE1-CD23-3B01-ABC8-F2E578FF5AED"
QUICK_STATS_URL = f"https://www.nass.usda.gov/Quick_Stats/Lite/ajax.php?{QUICK_STATS_UUID}"
OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"

AREAS = [
    {"id": "ne-panhandle", "name": "Nebraska Panhandle", "state": "NEBRASKA", "center": [41.75, -103.20]},
    {"id": "sw-nebraska", "name": "Southwest Nebraska", "state": "NEBRASKA", "center": [40.25, -101.55]},
    {"id": "ne-colorado", "name": "Northeast / East-Central Colorado", "state": "COLORADO", "center": [40.40, -103.40]},
    {"id": "western-colorado", "name": "Western Colorado", "state": "COLORADO", "center": [38.55, -108.30]},
    {"id": "big-horn", "name": "Big Horn Basin", "state": "WYOMING", "center": [44.10, -108.20]},
    {"id": "se-wyoming", "name": "Southeast Wyoming", "state": "WYOMING", "center": [42.00, -104.50]},
    {"id": "nw-kansas", "name": "Northwest / West-Central Kansas", "state": "KANSAS", "center": [39.25, -101.60]},
]
STATE_TO_AREAS = defaultdict(list)
for area in AREAS:
    STATE_TO_AREAS[area["state"]].append(area["id"])

WEATHER_FIELDS = [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "et0_fao_evapotranspiration",
]
TARGET_FIELD = "YIELD, DRY EDIBLE, PINTO in LB / ACRE"
FEATURE_NAMES = [
    "year_index",
    "thermal_onset_day",
    "season_gdd_f",
    "season_precip_mm",
    "season_climatic_deficit_mm",
    "critical_stage_precip_mm",
    "critical_stage_climatic_deficit_mm",
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get_bytes(url: str, timeout: int = 180) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "NebraskaBeans-GISit-model/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def canonical_json(value) -> str:
    return json.dumps(value, indent=2, sort_keys=False, separators=(",", ": ")) + "\n"


def parse_number(value):
    if value is None:
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None


def daterange(start: dt.date, end: dt.date):
    day = start
    while day <= end:
        yield day
        day += dt.timedelta(days=1)


def gdd_f(tmax_c: float, tmin_c: float) -> float:
    mean_f = ((tmax_c + tmin_c) / 2.0) * 9.0 / 5.0 + 32.0
    return max(0.0, mean_f - BASE_F)


def fetch_or_read_quick_stats(path: Path | None):
    raw = path.read_bytes() if path else get_bytes(QUICK_STATS_URL)
    payload = json.loads(raw)
    targets = {}
    normalized = []
    for row in payload["items"]:
        if row.get("REFERENCE_PERIOD_DESC") != "YEAR":
            continue
        state = row.get("LOCATION_DESC")
        if state not in STATE_TO_AREAS:
            continue
        value = parse_number(row.get(TARGET_FIELD))
        if value is None:
            continue
        year = int(row["YEAR"])
        targets[(state, year)] = value
        normalized.append({"state": state.title(), "year": year, "pinto_yield_lb_ac": int(value)})
    normalized.sort(key=lambda x: (x["state"], x["year"]))
    return raw, targets, normalized


def open_meteo_query() -> str:
    params = {
        "latitude": ",".join(str(a["center"][0]) for a in AREAS),
        "longitude": ",".join(str(a["center"][1]) for a in AREAS),
        "start_date": f"{TRAIN_START}-04-15",
        "end_date": ANALYSIS_END.isoformat(),
        "timezone": "UTC",
        "daily": ",".join(WEATHER_FIELDS),
    }
    return OPEN_METEO_URL + "?" + urllib.parse.urlencode(params, safe=",")


def fetch_or_read_weather(weather_dir: Path | None):
    raws = {}
    payloads = {}
    if weather_dir:
        for area in AREAS:
            path = weather_dir / f"openmeteo-{area['id']}.json"
            raw = path.read_bytes()
            raws[area["id"]] = raw
            payloads[area["id"]] = json.loads(raw)
    else:
        raw = get_bytes(open_meteo_query())
        combined = json.loads(raw)
        if not isinstance(combined, list) or len(combined) != len(AREAS):
            raise RuntimeError("Open-Meteo multi-location response did not match the seven requested areas")
        for area, payload in zip(AREAS, combined):
            area_raw = json.dumps(payload, separators=(",", ":")).encode()
            raws[area["id"]] = area_raw
            payloads[area["id"]] = payload
    weather = {}
    for area_id, payload in payloads.items():
        daily = payload["daily"]
        values = {}
        for i, date_text in enumerate(daily["time"]):
            row = tuple(daily[field][i] for field in WEATHER_FIELDS)
            if any(value is None for value in row):
                continue
            values[dt.date.fromisoformat(date_text)] = row
        weather[area_id] = values
    return raws, weather


def median_weather(weather, area_id: str, month: int, day: int, exclude_year: int | None = None):
    candidates = []
    for year in range(TRAIN_START, TRAIN_END + 1):
        if year == exclude_year:
            continue
        date = dt.date(year, month, day)
        if date in weather[area_id]:
            candidates.append(weather[area_id][date])
    if not candidates:
        raise RuntimeError(f"No climatology for {area_id} {month:02d}-{day:02d}")
    return tuple(float(statistics.median(x[i] for x in candidates)) for i in range(4))


def planting_threshold(weather) -> float:
    values = []
    for year in range(TRAIN_START, TRAIN_END + 1):
        start, end = dt.date(year, 4, 15), dt.date(year, 6, 7)
        values.append(sum(gdd_f(*weather["ne-panhandle"][date][:2]) for date in daterange(start, end)))
    return float(statistics.median(values))


def season_values(weather, area_id: str, year: int, through: dt.date | None, exclude_year: int | None):
    start, end = dt.date(year, 4, 15), dt.date(year, 9, 9)
    values = []
    for date in daterange(start, end):
        if through is not None and date > through:
            values.append(median_weather(weather, area_id, date.month, date.day, exclude_year))
        else:
            values.append(weather[area_id][date])
    return list(daterange(start, end)), values


def feature_vector(weather, area_id: str, year: int, threshold: float, through: dt.date | None = None, exclude_year: int | None = None):
    dates, values = season_values(weather, area_id, year, through, exclude_year)
    spring_gdd = 0.0
    onset_index = len(dates) - 1
    for i, row in enumerate(values):
        spring_gdd += gdd_f(row[0], row[1])
        if spring_gdd >= threshold:
            onset_index = i
            break

    season_gdd = precip = et0 = critical_precip = critical_deficit = 0.0
    for row in values[onset_index:]:
        season_gdd += gdd_f(row[0], row[1])
        if season_gdd > 1700.0:
            break
        p, e = row[2], row[3]
        precip += p
        et0 += e
        if 638.0 <= season_gdd <= 1358.0:
            critical_precip += p
            critical_deficit += max(0.0, e - p)
    vector = np.array([
        float(year - TRAIN_START),
        float(onset_index),
        season_gdd,
        precip,
        max(0.0, et0 - precip),
        critical_precip,
        critical_deficit,
    ])
    return vector, dates[onset_index]


def state_vector(weather, state: str, year: int, threshold: float, through: dt.date | None = None, exclude_year: int | None = None):
    vectors = [feature_vector(weather, area_id, year, threshold, through, exclude_year)[0] for area_id in STATE_TO_AREAS[state]]
    return np.mean(np.vstack(vectors), axis=0)


def make_model(alpha=RIDGE_ALPHA):
    columns = list(range(1, len(FEATURE_NAMES) + 1))
    transform = ColumnTransformer([
        ("state", OneHotEncoder(handle_unknown="ignore"), [0]),
        ("numeric", StandardScaler(), columns),
    ])
    return make_pipeline(transform, Ridge(alpha=alpha))


def training_rows(weather, targets, threshold):
    rows = []
    for (state, year), target in sorted(targets.items(), key=lambda x: (x[0][1], x[0][0])):
        vector = state_vector(weather, state, year, threshold)
        rows.append({"state": state, "year": year, "features": vector, "target": target})
    return rows


def matrix(rows):
    x = np.array([[row["state"], *row["features"]] for row in rows], dtype=object)
    y = np.array([row["target"] for row in rows], dtype=float)
    return x, y


def baseline_prediction(rows, row):
    values = [r["target"] for r in rows if r["state"] == row["state"] and r["year"] != row["year"]]
    return float(statistics.median(values))


def hindcast_checkpoint(weather, rows, threshold, month: int, day: int):
    predictions, observed, baseline = [], [], []
    years = sorted({row["year"] for row in rows})
    for held_year in years:
        train = [row for row in rows if row["year"] != held_year]
        test = [row for row in rows if row["year"] == held_year]
        model = make_model()
        x_train, y_train = matrix(train)
        model.fit(x_train, y_train)
        for row in test:
            through = dt.date(row["year"], month, day)
            vector = state_vector(weather, row["state"], row["year"], threshold, through, row["year"])
            x = np.array([[row["state"], *vector]], dtype=object)
            predictions.append(float(model.predict(x)[0]))
            observed.append(row["target"])
            baseline.append(baseline_prediction(rows, row))
    errors = np.abs(np.array(observed) - np.array(predictions))
    baseline_errors = np.abs(np.array(observed) - np.array(baseline))
    mae = float(np.mean(errors))
    baseline_mae = float(np.mean(baseline_errors))
    return {
        "as_of_month_day": f"{month:02d}-{day:02d}",
        "n_state_years": len(observed),
        "mae_lb_ac": round(mae),
        "rmse_lb_ac": round(float(math.sqrt(np.mean(errors ** 2)))),
        "empirical_abs_error_p80_lb_ac": round(float(np.quantile(errors, 0.8))),
        "historical_median_baseline_mae_lb_ac": round(baseline_mae),
        "mae_gain_vs_baseline_pct": round((baseline_mae - mae) / baseline_mae * 100.0, 1),
        "passes_baseline": mae < baseline_mae,
    }


def current_observed_metrics(weather, area_id: str, date: dt.date, threshold: float):
    # No future values enter these selected-date evidence metrics.
    start = dt.date(date.year, 4, 15)
    spring_gdd = 0.0
    onset = None
    for day in daterange(start, date):
        row = weather[area_id][day]
        spring_gdd += gdd_f(row[0], row[1])
        if onset is None and spring_gdd >= threshold:
            onset = day
    if onset is None:
        return {"gdd": 0.0, "precip": 0.0, "et0": 0.0, "deficit": 0.0, "onset": None}
    gdd = precip = et0 = 0.0
    for day in daterange(onset, date):
        row = weather[area_id][day]
        gdd += gdd_f(row[0], row[1])
        precip += row[2]
        et0 += row[3]
    return {"gdd": gdd, "precip": precip, "et0": et0, "deficit": max(0.0, et0 - precip), "onset": onset}


def stage_for(gdd: float, onset, date: dt.date):
    if onset is None or date < onset:
        return "Pre-planting"
    if gdd < 283:
        return "Establishment"
    if gdd < 638:
        return "Vegetative"
    if gdd < 1013:
        return "Flowering / pod development"
    if gdd < 1358:
        return "Pod fill"
    if gdd < 1625:
        return "Maturity / seed maturation"
    return "Harvest readiness"


def quantile(values, q):
    return float(np.quantile(np.array(values, dtype=float), q))


def build(args):
    qs_raw, targets, normalized_targets = fetch_or_read_quick_stats(args.quick_stats)
    weather_raws, weather = fetch_or_read_weather(args.weather_dir)
    threshold = planting_threshold(weather)
    rows = training_rows(weather, targets, threshold)
    x_train, y_train = matrix(rows)
    model = make_model()
    model.fit(x_train, y_train)

    checkpoint_days = [(4, 15), (5, 1), (5, 15), (6, 1), (6, 15), (7, 1), (7, 15), (8, 1), (8, 15), (9, 1), (9, 9)]
    checkpoints = [hindcast_checkpoint(weather, rows, threshold, month, day) for month, day in checkpoint_days]
    checkpoint_by_day = {(int(x["as_of_month_day"][:2]), int(x["as_of_month_day"][3:])): x for x in checkpoints}

    final_validation = checkpoints[-1]
    model_status = "EXPERIMENTAL — OUT-OF-SAMPLE GAIN" if final_validation["passes_baseline"] else "RESEARCH ONLY — BASELINE NOT BEATEN"
    target_counts = Counter(row["state"] for row in rows)
    max_target_year = {state: max(year for (s, year) in targets if s == state) for state in STATE_TO_AREAS}

    regions = {}
    for area in AREAS:
        area_id, state = area["id"], area["state"]
        state_history = [value for (s, _), value in targets.items() if s == state]
        historical_median = float(statistics.median(state_history))
        historical_q25, historical_q75 = quantile(state_history, 0.25), quantile(state_history, 0.75)
        crossing_dates = []
        for year in range(TRAIN_START, TRAIN_END + 1):
            _, crossing = feature_vector(weather, area_id, year, threshold)
            crossing_dates.append(crossing.timetuple().tm_yday)
        date_rows = {}
        for selected_date in daterange(ANALYSIS_START, ANALYSIS_END):
            vector, projected_onset = feature_vector(weather, area_id, 2026, threshold, selected_date, None)
            x = np.array([[state, *vector]], dtype=object)
            estimate = float(model.predict(x)[0])
            observed = current_observed_metrics(weather, area_id, selected_date, threshold)
            stage = stage_for(observed["gdd"], observed["onset"], selected_date)
            # Attach the most recent completed validation checkpoint.
            eligible_checkpoints = [c for c in checkpoints if c["as_of_month_day"] <= selected_date.strftime("%m-%d")]
            validation = eligible_checkpoints[-1] if eligible_checkpoints else checkpoints[0]
            target_current = max_target_year[state] >= 2020
            released = target_current and validation["passes_baseline"]
            band = validation["empirical_abs_error_p80_lb_ac"]
            date_rows[selected_date.isoformat()] = {
                "yield_lb_ac": round(estimate) if released else None,
                "yield_interval_lb_ac": [max(0, round(estimate - band)), round(estimate + band)] if released else None,
                "interval_basis": "leave-one-year-out empirical absolute-error p80 at latest completed validation checkpoint" if released else None,
                "historical_median_lb_ac": round(historical_median),
                "change_vs_historical_median_lb_ac": round(estimate - historical_median) if released else None,
                "modeled_thermal_onset": projected_onset.isoformat(),
                "onset_status": "crossed in observed weather" if observed["onset"] else "projected with historical day-of-year median weather",
                "stage": stage,
                "observed_gdd_f": round(observed["gdd"]),
                "projected_season_gdd_f": round(float(vector[2])),
                "observed_precip_mm": round(observed["precip"], 1),
                "observed_et0_mm": round(observed["et0"], 1),
                "observed_climatic_deficit_mm": round(observed["deficit"], 1),
                "validation_checkpoint": validation["as_of_month_day"],
                "hindcast_mae_lb_ac": validation["mae_lb_ac"],
                "baseline_mae_lb_ac": validation["historical_median_baseline_mae_lb_ac"],
                "passes_baseline": validation["passes_baseline"],
                "eligibility": "PUBLISHED" if released else ("WITHHELD — selected-date hindcast does not beat the historical-median baseline" if target_current else "WITHHELD — NASS pinto target series ends before 2020"),
            }
        regions[area_id] = {
            "name": area["name"],
            "state": state.title(),
            "center": area["center"],
            "target_history_n": target_counts[state],
            "target_history_end": max_target_year[state],
            "historical_yield_distribution_lb_ac": {
                "q25": round(historical_q25),
                "median": round(historical_median),
                "q75": round(historical_q75),
            },
            "thermal_onset_historical_day_of_year": {
                "p20": round(quantile(crossing_dates, 0.2)),
                "median": round(quantile(crossing_dates, 0.5)),
                "p80": round(quantile(crossing_dates, 0.8)),
            },
            "dates": date_rows,
        }

    provenance_inputs = [{
        "name": "USDA NASS Quick Stats Lite dry edible bean state series",
        "url": QUICK_STATS_URL,
        "query_definition": {
            "sector": "CROPS",
            "group": "FIELD CROPS",
            "commodity": "BEANS",
            "report": "Acreage, Yield, Production and Price",
            "aggregation": "STATE",
            "states": ["Colorado", "Kansas", "Nebraska", "Wyoming"],
            "years": [TRAIN_START, TRAIN_END],
            "target_field": TARGET_FIELD,
        },
        "sha256": sha256_bytes(qs_raw),
        "role": "historical pinto yield calibration outcome only",
    }]
    for area in AREAS:
        provenance_inputs.append({
            "name": f"Open-Meteo ERA5 archive — {area['name']}",
            "url": open_meteo_query(),
            "location": area["center"],
            "sha256": sha256_bytes(weather_raws[area["id"]]),
            "role": "daily weather/GDD predictor history and current-season selected-date evidence",
        })

    artifact = {
        "schema_version": "nebraskabeans.gisit_outlook.v1",
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "analysis_start": ANALYSIS_START.isoformat(),
        "analysis_end": ANALYSIS_END.isoformat(),
        "model": {
            "id": "gisit-drybean-weather-ridge-v1",
            "version": "1.0.0",
            "status": model_status,
            "purpose": "Selected-date, in-season regional pinto-basis yield outlook independent of current USDA yield forecasts.",
            "target": "USDA NASS final state pinto yield, pounds per harvested acre",
            "equation": "standardized ridge regression: yield = state intercept + beta · [year, thermal onset, GDD, precipitation, climatic deficit, critical-stage precipitation, critical-stage climatic deficit]",
            "ridge_alpha": RIDGE_ALPHA,
            "feature_names": FEATURE_NAMES,
            "training_period": f"{TRAIN_START}–{TRAIN_END} where published by state",
            "training_state_years": len(rows),
            "training_counts": {state.title(): target_counts[state] for state in sorted(target_counts)},
            "validation_design": "leave one calendar year out; the held year is excluded from model fitting and from the weather climatology used to complete that held season",
            "current_usda_yield_used_as_predictor": False,
            "limitations": [
                "Point weather at seven analytical-area centroids is not a field or county surface.",
                "Irrigation application, cultivar, disease, hail, soil constraints, and management are not observed by this model.",
                "The calibration target is pinto yield; applying it to the full dry-bean class mix is a documented approximation.",
                "Current-season SMAP and NDVI are separate evidence layers and are not forced into this yield equation until a historical, crop-masked backtest is available.",
                "Kansas output is withheld because its published pinto-yield target series ends in 2015.",
            ],
        },
        "phenology": {
            "base_temperature_f": BASE_F,
            "thermal_onset_rule": "First day cumulative GDD from April 15 reaches the 2000–2025 Nebraska Panhandle median cumulative GDD from April 15 through the sourced June 7 planting-date reference.",
            "thermal_onset_threshold_gdd_f": round(threshold, 1),
            "maturity_midpoint_gdd_f": MATURITY_GDD,
            "maturity_source_range_gdd_f": [1550, 1700],
            "stage_boundaries_gdd_f": {"establishment_end": 283, "vegetative_end": 638, "flowering_pod_end": 1013, "pod_fill_end": 1358, "maturity_midpoint": 1625},
            "classification": "DERIVED planting-onset proxy and stage; not a reported planting date",
        },
        "validation": {
            "gate": "accepted for experimental staging only when selected-date hindcast MAE is below the leave-one-year-out state historical-median baseline",
            "checkpoints": checkpoints,
            "terminal_checkpoint": final_validation,
        },
        "sources": provenance_inputs,
        "historical_targets": normalized_targets,
        "regions": regions,
    }
    without_id = canonical_json(artifact).encode()
    artifact["artifact_sha256"] = sha256_bytes(without_id)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(canonical_json(artifact))
    return artifact


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick-stats", type=Path, help="Downloaded Quick Stats Lite JSON response")
    parser.add_argument("--weather-dir", type=Path, help="Directory containing openmeteo-<area-id>.json files")
    parser.add_argument("--output", type=Path, default=ROOT / "assets/data/gisit-outlook-2026.json")
    return parser.parse_args()


if __name__ == "__main__":
    result = build(parse_args())
    terminal = result["validation"]["terminal_checkpoint"]
    print(f"WROTE {result['model']['id']} · n={result['model']['training_state_years']} · MAE {terminal['mae_lb_ac']} vs baseline {terminal['historical_median_baseline_mae_lb_ac']} lb/ac")
