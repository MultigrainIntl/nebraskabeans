# NebraskaBeans Recovery Audit — 2026-09-11

Status: authoritative recovery audit for staging work. Production and `main` are out of scope.

## Baseline

- `main`: `83f1f1f720dc0757a1988b2c675a65330806a5b0`
- deployed staging branch `gh-pages`: `63b205efb68f0428c9a3f34170694e735e2dfeaa`
- rollback for recovery work: `63b205efb68f0428c9a3f34170694e735e2dfeaa`
- `gh-pages` is 51 commits ahead of `main`; `main` is the merge base and remains untouched.

## Forensic findings

1. Staging has accumulated competing renderer generations instead of one model/render path.
   - `assets/site.js` still owns legacy county rendering and a five-county Nebraska core model.
   - `assets/bean-regions.js` adds a second regional continuous-surface system for NE/CO/WY/KS.
   - `assets/map-refine.js` wraps/overrides legacy styling after render.
   - `assets/visual-evidence.js` is another older renderer present in the tree but not loaded by `index.html`.
2. Unsupported prototype assumptions remain in live staging:
   - fixed planting anchor `2026-06-01`;
   - fixed 2,300 lb/ac baseline;
   - hand-set soil-moisture thresholds and yield penalties;
   - simple arithmetic averaging for the state yield;
   - `SAMPLE_MAX=8` in the legacy model;
   - five-county `CORE` list in the legacy model.
3. The legacy state/yield model therefore cannot be treated as a defensible production forecast.
4. County-condition fills still exist in the underlying renderer and are later suppressed by override code. This is architectural debt, not a verified fix.
5. Current production geography is based on hand-defined county lists and smoothed envelopes, not a crop-derived mask.
6. Open-Meteo archive is currently used directly in the browser for soil moisture, precipitation, ET0 and temperature. It is useful as a fallback/prototype gridded-weather adapter, but it is not the selected final root-zone soil-moisture source.
7. Iowa Environmental Mesonet is used as an observation aggregator. Direct NOAA/NCEI data should be the primary unrestricted observation source; any restricted mesonet redistribution must be handled according to provider/MADIS terms.
8. Satellite capability is not integrated into the active NebraskaBeans evidence model.
9. Historical moisture percentile/anomaly, defensible irrigation context, soils, official progress override, historical analog outcomes, forecast history, confidence decomposition and provenance drill-back are not complete.
10. Rendered/browser verification is still required after deployment; source inspection is not sufficient.

## GISit reuse findings

Reusable, with validation/adaptation:

- typed source-registry concept and provider-adapter architecture from `gisit-crop-deploy`;
- crop calendar + GDD concepts;
- region weather batch generator pattern (`scripts/build_crop_region_weather.py`);
- evidence-tier / confidence / caution patterns from `pea-intelligence.js`;
- temporal satellite adapter lessons from the NASA GIBS/NDVI work;
- rule that official progress overrides modeled stage when available.

Do not reuse as authoritative without correction:

- hard-coded NASA GIBS dates;
- generic XYZ assumptions for scientific services;
- crop-specific constants from oats/peas without bean-specific validation;
- approximate global crop polygons as a substitute for USDA CDL in the U.S.

## Authoritative data-source matrix

| Requirement | Preferred source | Backup / complement | Class | Resolution / cadence | Access / rights | Implementation note |
|---|---|---|---|---|---|---|
| Dry-bean crop geography | USDA NASS 2025 CDL, class 42 | multi-year CDL frequency / Crop Sequence Boundaries | MODELED classification from official remote sensing | 10 m annual (2025) | public/free; USDA disclaimer | Latest released annual crop identity; do not imply 2026 field identity until 2026 CDL exists. |
| Planted acreage | USDA NASS Quick Stats / Crop Production / Acreage | Prospective Plantings before June acreage | VERIFIED official estimate | state; periodic | public | Preserve estimate date/revision history. |
| Harvested acreage | USDA NASS Quick Stats / Crop Production | final annual summary | VERIFIED | state/county where published | public | Withheld/suppressed values remain unknown. |
| Historical yield | USDA NASS Quick Stats / Crop Production annual summaries | historical track records | VERIFIED | state/county where published; annual | public | Use only published geography; no fabricated county series. |
| Historical production | USDA NASS Quick Stats / Crop Production | annual summaries | VERIFIED | annual | public | Basis for backtesting and weighting. |
| Crop progress / planting / harvest | NASS state Crop Progress & Condition / Quick Stats | extension reports | VERIFIED survey estimate | weekly | public | Dry beans are not supported by NASS gridded progress layers; state reports override GDD model when reported. |
| GDD / temperature / precipitation | NOAA station observations + gridded meteorology | ERA5-Land / Open-Meteo adapter | VERIFIED + MODELED | hourly/daily | NOAA public; model-source terms apply | Separate direct observation and modeled fields. |
| Gridded weather history | ERA5-Land | NASA POWER / Open-Meteo archive adapter | MODELED reanalysis | ~9 km hourly (ERA5-Land) | Copernicus terms | Primary spatial continuity/backtest weather backbone. |
| Direct weather stations | NOAA/NCEI ISD / ASOS-AWOS | IEM aggregation for convenience where rights permit | VERIFIED | station hourly/sub-hourly | NOAA public; mesonet restrictions vary | Station variables must retain native observation type. |
| Root-zone soil moisture | NASA SMAP L4 | ERA5-Land/Open-Meteo modeled soil moisture | MODELED data assimilation | 9 km, 3-hourly, 0-100 cm | NASA Earthdata terms | Primary crop-relevant root-zone moisture from 2015-present. |
| Soil-moisture normals / percentile | SMAP L4 climatology (2015-present), optionally cross-checked with ERA5-Land longer climatology | ERA5-Land | ESTIMATED from MODELED source | daily percentile/anomaly | derived | Method and baseline period exposed. |
| ET / evaporative demand | ERA5-Land ET / reference ET; OpenET where field ET is needed | FAO-56 ET0 from validated meteorology | MODELED/ESTIMATED | daily; field-scale where OpenET available | source terms | Do not equate ET0 with crop ET without Kc/stage logic. |
| Drought | U.S. Drought Monitor | SPI/SPEI derived from weather | VERIFIED composite + ESTIMATED | weekly | public | Context, not direct yield loss. |
| Irrigation context | IrrMapper (western states, annual 30 m) + LANID/USGS + NASS Irrigation/Census statistics | local irrigation districts/field reports | MODELED classification + VERIFIED stats | 30 m annual / survey | public datasets; confirm per product | Treat as probability/context; current-year operation may differ. |
| Soil texture / AWC / drainage / rooting depth | USDA NRCS SSURGO/gSSURGO | SoilGrids | VERIFIED survey/model summaries | map-unit / 10–30 m rasterized products | public | Use gSSURGO Valu1 for mapped AWC/root-zone summaries. |
| Satellite vegetation trajectory | NASA HLS-VI (NDVI, EVI, NDMI etc.) | NASS VegScape / MODIS/VIIRS | MODELED remote sensing | 30 m, nominal 1–2 day revisit | NASA public-data terms | Quantitative time series, cloud-masked, crop-mask clipped. |
| Imagery | HLS/Sentinel/Landsat visualization; NASA GIBS for contextual imagery | Esri imagery basemap | MODELED imagery | source-specific | source terms | Imagery is context; indices are evidence. |
| Vegetation anomaly | HLS-VI current vs historical same-period distribution | VegScape anomaly products | ESTIMATED from MODELED | 30 m / weekly composites | derived | Must handle clouds/smoke. |
| Extreme heat/frost/wind | NOAA stations + ERA5-Land/HRRR | NBM forecast | VERIFIED + MODELED | hourly | public/model terms | Stage overlap required before crop-impact inference. |
| Hail | NOAA Storm Events + MRMS/MESH where available | field/insurance/extension reports | VERIFIED event report + MODELED radar | event / radar | public | Hail event != quantified yield loss. |
| Flood/excess rain | NOAA/NWS + precipitation/reanalysis + USGS stream context where relevant | field reports | VERIFIED/MODELED | event/daily | public | Crop-mask intersection required. |
| Pest/disease evidence | extension/USDA/state reports + structured field observations | grower/scout reports | VERIFIED/field evidence | event/report | source-specific | No yield conversion absent validated relationship. |
| Field observations | GISit structured reports | extension/grower/scout sources | VERIFIED/ESTIMATED by source | event | permission-controlled | Store source/date/location/type/confidence. |
| Historical analogs | derived from ERA5-Land/SMAP/HLS/USDM + NASS actual yield | NOAA/POWER | ESTIMATED | season | derived | Similarity score must link to actual outcomes. |
| Forecast weather | NWS National Blend of Models | HRRR for short-range/high-res event risk | MODELED forecast | hourly; NBM multi-day, HRRR ~3 km short range | public | Preserve forecast issue time; no rewriting history. |
| Crop-condition ground truth | NASS crop condition when dry beans are explicitly published; field/extension reports | satellite/weather synthesis | VERIFIED when directly reported | weekly/event | public/source-specific | Never substitute soil moisture and call it official crop condition. |
| Post-harvest outcomes | NASS final harvested area/yield/production | processor/field reports | VERIFIED | annual | public | Required for model learning/error analysis. |

## Target model architecture

1. **Source adapters** acquire immutable dated observations/models and attach provenance.
2. **Crop geography service** clips all evidence to dry-bean footprint / analytical production zones.
3. **Temporal evidence store** preserves `as_of`, `valid_time`, source issue time and revision history.
4. **Phenology engine** combines official progress overrides + planting-window uncertainty + bean-specific GDD + satellite emergence/trajectory.
5. **Water engine** combines root-zone moisture + historical percentile + precipitation + ET/crop demand + soil AWC + irrigation context.
6. **Stress/event engine** evaluates heat/frost/hail/excess water only when stage overlap exists.
7. **Vegetation engine** computes crop-mask HLS trajectories/anomalies and cloud/smoke quality flags.
8. **Regional condition engine** synthesizes independent evidence and preserves disagreement.
9. **Yield engine** starts from historical expectation and uses only validated/declared adjustments; assumptions are sensitivity-tested and labeled.
10. **Aggregation engine** weights regions by validated crop area / acreage / production significance.
11. **Confidence engine** decomposes geography, freshness, coverage, stage, irrigation, satellite, station/model agreement and calibration support.
12. **Narrative/provenance engine** produces answer-first output with drill-back to source/date/method/classification.
13. **Forecast-history store** preserves every issued estimate and the reason for revisions.
14. **Post-harvest evaluator** records actuals, errors and regional bias.

## Authoritative dependency-ordered work order

### W01 — Architecture cleanup
Objective: one renderer, one temporal state, one evidence model.
Dependencies: audit.
Reuse: GISit typed-adapter pattern.
Implementation: remove legacy county-condition/yield rendering, remove override wrappers and dead renderer paths, preserve county outlines only.
Acceptance: no competing renderer can recolor counties or produce a second crop surface.
Verification: source scan + runtime layer inventory + visual regression.
Rollback: `63b205efb68f0428c9a3f34170694e735e2dfeaa`.

### W02 — Provenance/source registry
Objective: every model input carries source, class, valid time, issue time, units and limitations.
Dependencies: W01.
Acceptance: representative conclusion traces conclusion → driver → datum → source → date → method → classification.

### W03 — Crop geography and weighting
Objective: replace hand-drawn/county-only production geography with CDL-derived dry-bean evidence and transparent analytical zones.
Dependencies: W02.
Acceptance: county boundaries never equal crop-condition polygons; every accepted zone has crop-area evidence and a weight method.

### W04 — Historical NASS outcomes and official progress
Objective: ingest acreage/yield/production history and 2026 progress/planting/harvest evidence.
Dependencies: W02/W03.
Acceptance: no permanent fixed yield baseline or planting date remains.

### W05 — Temporal weather + direct observations
Objective: common historical/selected-date meteorological state plus separate direct stations.
Dependencies: W02/W03.
Acceptance: date changes request/use date-correct values; station variables are not re-labeled as other variables.

### W06 — Root-zone moisture + percentile + soils + irrigation
Objective: crop-relevant water status.
Dependencies: W03/W05.
Acceptance: 0–100 cm moisture, percentile/anomaly, AWC/soil context and irrigation uncertainty are visible and provenance-linked.

### W07 — Phenology
Objective: official-progress-aware bean GDD/stage model with uncertainty.
Dependencies: W04/W05.
Acceptance: stage changes temporally and official reports override weaker model assumptions.

### W08 — HLS vegetation trajectory
Objective: quantitative crop-mask vegetation evidence.
Dependencies: W03.
Acceptance: current vs normal/prior trajectory, quality flags, dates and anomaly are available.

### W09 — Condition/stress synthesis
Objective: multi-evidence crop condition plus current condition vs forward vulnerability.
Dependencies: W06/W07/W08.
Acceptance: no single layer is renamed crop condition; disagreement lowers confidence.

### W10 — Yield model and calibration
Objective: defensible regional yield estimate/range linked to historical outcomes and literature-supported/sensitivity-exposed coefficients.
Dependencies: W04/W09.
Acceptance: no prototype coefficients or arbitrary baseline remain; backtest metrics exist.

### W11 — Aggregation, contribution, confidence
Objective: defensible state/High Plains roll-up.
Dependencies: W03/W10.
Acceptance: acreage/crop-area weighted aggregation, contribution analysis and decomposed confidence.

### W12 — Answer-first narrative / exceptions / commercial interpretation
Objective: professional decision support.
Dependencies: W09/W10/W11.
Acceptance: what changed, why, vulnerability, scenarios, exceptions, commercial implications and provenance drill-back.

### W13 — Forecast history + post-harvest learning
Objective: preserve prior beliefs and learn from actuals.
Dependencies: W10/W11.
Acceptance: issued estimate snapshots are immutable and actual-vs-forecast error can be computed.

### W14 — Performance/accessibility/responsiveness
Objective: usable temporal product.
Dependencies: W01–W13.
Acceptance: progressive loading/caching without silent evidence loss; desktop/mobile and keyboard checks pass.

### W15 — Clean-sheet verification
Objective: re-audit deployed staging against master acceptance criteria.
Dependencies: W01–W14.
Acceptance: all mandatory criteria pass or product remains PARTIAL/BLOCKED.
