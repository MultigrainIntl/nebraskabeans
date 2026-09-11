# NebraskaBeans Dependency-Ordered Work Order

Updated: 2026-09-11  
Governing contract: `MASTER-EXECUTION-CONTRACT.md`

| ID | Objective and acceptance gate | Dependencies | Status |
|---|---|---|---|
| W00 | Takeover: prove repo, deployed branch/SHA, hosting, runtime, data, GISit reuse, contradictions, infra, blockers, authority queue | none | `VERIFIED` |
| W01 | Runtime/deployment/refresh: one renderer/state, exact-build QA, content-derived build manifest, scheduled refresh design | W00 | `PARTIAL` |
| W02 | Sources/rights/contracts: authoritative matrix, immutable source identity, rights/cost/auth/freshness, provenance resolution | W00 | `PARTIAL` |
| W03 | Crop geography/acreage/class: CDL class-42 mask, area validation, zone versions/weights, all four states explicit | W01–W02 | `PARTIAL` — native 2025 polygons built for all four states; current-season geography, zones and class weights pending |
| W04 | Spatial/temporal contracts: equal-area analysis, selected-date consistency, issue-time history, revision handling | W02–W03 | `PARTIAL` |
| W05 | Weather: NOAA observations plus governed gridded history; date-correct and quality controlled | W02–W04 | `PARTIAL` — 222 ASOS/AWOS stations via IEM, 31,637 station-days; source QC and grid comparison remain incomplete |
| W06 | Moisture/soils/irrigation: SMAP root zone, percentile/anomaly, SSURGO AWC, irrigation uncertainty | W03–W05 | `PARTIAL` — daily SMAP + weekly WCS anomaly samples; soils/irrigation pending |
| W07 | Phenology: official-progress override plus sourced bean GDD/planting uncertainty | W04–W05 | `PARTIAL` — sourced GDD/thermal onset implemented; progress override pending |
| W08 | Satellite: crop-mask HLS trajectory/anomaly and QA coverage | W03–W04 | `PARTIAL` — weekly NDVI direction implemented; CDL/HLS crop mask pending |
| W09 | Condition/confidence/uncertainty: multi-evidence synthesis, disagreements, decomposed calibrated confidence | W06–W08 | `PARTIAL` — gated SMAP+NDVI synthesis and empirical interval; full decomposition pending |
| W10 | Yield: historical expectation, sourced features/parameters, backtesting, interval, regional diagnostics | W04/W09 | `PARTIAL` — experimental GISit pinto-basis v1 with 92-season LOYO backtest |
| W11 | Production: planted/harvested scenarios, acreage-weighted aggregation, class/state contribution | W03/W10 | `PARTIAL` — dated acreage retained; unsupported unweighted production removed; class-compatible weights and uncertainty pending |
| W12 | Forecast/scenarios/vulnerability/what-changed: immutable issued history and forward risks | W09–W11 | `NOT IMPLEMENTED` |
| W13 | Regional/narrative/commercial: answer-first exceptions and commercial meaning with provenance | W09–W12 | `PARTIAL` — answer-first regional model/evidence narrative implemented |
| W14 | Final UI/performance/a11y/refresh: actual layers, responsive/keyboard QA, resilient errors, two scheduled cycles | W01–W13 | `PARTIAL` — desktop/mobile interactions and source fallback tested; scheduled cycles pending |
| W15 | Independent verification: clean-sheet evidence/model/UI/deployment audit of exact candidate build | W01–W14 | `NOT IMPLEMENTED` |

## Active priority: W01/W02 prerequisites → W03/W04 crop geography

Starting code and staging rollback: `5f5ca45a0d46f025616b4ab5204f3857cbb33485`.
Starting data build: `nbd-v1-a626240da393257d143f`.
Isolated branch: `staging/spatial-foundation`.

Acceptance before spatial release:
- Retrieve authoritative native-resolution CDL with checksum and crop-year provenance.
- Preserve all class-42 pixels; no arbitrary minimum patch area.
- Calculate area in an explicit equal-area CRS; reject unsupported CRS assumptions.
- Produce real crop polygons for all four states and reconcile polygon/pixel areas.
- Separate historical footprint from current-season identity and official acreage.
- Do not paint centroid yield estimates onto crop pixels as if locally validated.
- Establish spatial support and area weighting before operational production outputs.

Next priorities: W05 station observations; W06 soils/irrigation/water; W07 progress and
phenology; W08 crop-mask satellite; W09–W11 validated outputs; W12–W13 forecasts and
interpretation; W14–W15 final map, automated refresh, independent verification.

Regression risks: crop area loss, CRS errors, slow geometry rendering, historical
crop identity mislabeled current, coarse model output falsely downscaled.

## Previous experimental package (incomplete; not a completion gate)

Gate: no changes to production, `main`, DNS, GoDaddy, or unrelated repositories.

Acceptance checks:

- reconcile stale deployment and rollback identities;
- remove evidence-class misuse (`VERIFIED` → allowed scientific class);
- remove unsupported browser-only stress thresholds;
- repair deleted shared-shell dependency on secondary pages;
- mark public staging as prototype and `noindex`;
- generate and validate a content-derived build manifest;
- validate exact immutable NASS report URLs and source/date semantics;
- run unit, static-contract, browser, interaction, and deployed-build checks;
- calculate GISit yield without current USDA yield as an input;
- reject selected dates that do not beat the historical-median backtest baseline;
- expose the empirical error band, sample count, stage, weather, SMAP and NDVI evidence;
- use dated USDA acreage revisions only for explicitly labeled production scenarios;
- retain crop-mask, irrigation, soil, official-progress, forecast and clean-sheet-verification gaps as `PARTIAL`, `NOT IMPLEMENTED`, or `BLOCKED`.

Rollback for the current deployed staging state:
`4fd1e43e9f6d50c9db2b7250702f914f8f1505f3`.
