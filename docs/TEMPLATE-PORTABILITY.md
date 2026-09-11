# Crop-Intelligence Site Template Contract

This repository is reusable as a **workflow and evidence architecture**, not as a
universal crop model. A new crop/site may reuse the renderer, temporal controls,
source/build manifests, release gates, revision history, and test structure. It must
replace and revalidate every crop-, geography-, season-, and target-specific input.

## Reusable layers

1. `assets/data/official-baseline.json` preserves dated official acreage and outcome
   publications without turning them into model predictors.
2. `assets/data/temporal-layer-catalog.json` maps one selected date to exact WMS layers
   and bounded prior-day fallbacks.
3. `scripts/build_gisit_model.py` implements historical-outcome calibration,
   selected-date climatological completion, leave-one-year-out validation, an
   empirical error interval, and a publish/withhold gate.
4. `scripts/build_satellite_signals.py` samples independent WCS evidence, retains
   requested and actual valid dates, and produces checksummed weekly signals.
5. `scripts/build_manifest.mjs` hashes every material input into a visible build ID.
6. `assets/app.js` drives yield, stage, evidence, narrative, production and map state
   from one date and one selected analytical area.
7. `tests/browser-smoke.mjs` verifies current, pre-gate, playback, layer-switching and
   mobile behavior with deterministic local fixtures; the deployed workflow must also
   verify live endpoints.

## Required replacements for another crop or geography

| Contract item | NebraskaBeans v1 value | New-site requirement |
|---|---|---|
| Outcome target | NASS state pinto yield | Select one published, consistent outcome series; do not mix definitions silently |
| Thermal base | 50°F | Source for the crop/variety |
| Maturity range | 1,550–1,700 GDD | Source and validate locally |
| Planting/onset proxy | Panhandle June 7 thermal equivalent | Use reported planting/progress where possible; document fallback uncertainty |
| Stage boundaries | Scaled sourced dry-bean stage totals | Replace with crop-specific stages |
| Analytical areas | Seven High Plains centroids | Define from crop geography and preserve version/weights |
| Model features | GDD, precipitation, ET₀ and climatic deficit | Register purpose, units, source, transformations and evidence sufficiency |
| Release baseline | Leave-one-year-out state median | Choose before evaluation; publish only with out-of-sample gain |
| Production basis | GISit yield × dated USDA acres | Preserve planted vs expected-harvested scenarios and revision notes |
| Satellite evidence | SMAP root-zone anomaly + NDVI direction | Use crop-mask pixels, QA and same-period historical comparison |

## Porting sequence

1. Create the official-history and source contracts, including issue dates, valid dates,
   suppression, revisions, rights and checksums.
2. Build crop geography before representing any surface as crop condition or production.
3. Register phenology before yield; use local planting/progress evidence when available.
4. Assemble a consistent historical target and predictors without current official yield.
5. Backtest the full selected-date pipeline, including future-period completion.
6. Freeze the baseline and release rule before viewing the candidate season result.
7. Add independent crop-health evidence; preserve disagreement instead of averaging it away.
8. Compute production only from an explicit acreage basis and retain each acreage revision.
9. Build the content-derived manifest, run static/unit/browser checks, then verify the exact
   deployed commit against live services.
10. After harvest, ingest the final outcome, score error, inspect regional bias, and version
    the next model. Never rewrite the issued forecast history.

## Non-portable items

Do not copy the Nebraska/Colorado/Wyoming/Kansas centroids, pinto coefficients, target
history, 50°F base, stage boundaries, maturity requirement, planting proxy, yield scale,
acreage records, or backtest results into another crop or geography. A passing
NebraskaBeans validation gate is evidence only for this registered v1 experiment.
