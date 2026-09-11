# NebraskaBeans Dependency-Ordered Work Order

Updated: 2026-09-11  
Governing contract: `MASTER-EXECUTION-CONTRACT.md`

| ID | Objective and acceptance gate | Dependencies | Status |
|---|---|---|---|
| W00 | Takeover: prove repo, deployed branch/SHA, hosting, runtime, data, GISit reuse, contradictions, infra, blockers, authority queue | none | `VERIFIED` |
| W01 | Runtime/deployment/refresh: one renderer/state, exact-build QA, content-derived build manifest, scheduled refresh design | W00 | `PARTIAL` |
| W02 | Sources/rights/contracts: authoritative matrix, immutable source identity, rights/cost/auth/freshness, provenance resolution | W00 | `PARTIAL` |
| W03 | Crop geography/acreage/class: CDL class-42 mask, area validation, zone versions/weights, all four states explicit | W01–W02 | `NOT IMPLEMENTED` |
| W04 | Spatial/temporal contracts: equal-area analysis, selected-date consistency, issue-time history, revision handling | W02–W03 | `PARTIAL` |
| W05 | Weather: NOAA observations plus governed gridded history; date-correct and quality controlled | W02–W04 | `PARTIAL` — governed ERA5-family history/current state; direct NOAA comparison pending |
| W06 | Moisture/soils/irrigation: SMAP root zone, percentile/anomaly, SSURGO AWC, irrigation uncertainty | W03–W05 | `PARTIAL` — daily SMAP + weekly WCS anomaly samples; soils/irrigation pending |
| W07 | Phenology: official-progress override plus sourced bean GDD/planting uncertainty | W04–W05 | `PARTIAL` — sourced GDD/thermal onset implemented; progress override pending |
| W08 | Satellite: crop-mask HLS trajectory/anomaly and QA coverage | W03–W04 | `PARTIAL` — weekly NDVI direction implemented; CDL/HLS crop mask pending |
| W09 | Condition/confidence/uncertainty: multi-evidence synthesis, disagreements, decomposed calibrated confidence | W06–W08 | `PARTIAL` — gated SMAP+NDVI synthesis and empirical interval; full decomposition pending |
| W10 | Yield: historical expectation, sourced features/parameters, backtesting, interval, regional diagnostics | W04/W09 | `PARTIAL` — experimental GISit pinto-basis v1 with 92-season LOYO backtest |
| W11 | Production: planted/harvested scenarios, acreage-weighted aggregation, class/state contribution | W03/W10 | `PARTIAL` — dated acreage scenarios implemented; crop-area weighting pending W03 |
| W12 | Forecast/scenarios/vulnerability/what-changed: immutable issued history and forward risks | W09–W11 | `NOT IMPLEMENTED` |
| W13 | Regional/narrative/commercial: answer-first exceptions and commercial meaning with provenance | W09–W12 | `PARTIAL` — answer-first regional model/evidence narrative implemented |
| W14 | Final UI/performance/a11y/refresh: actual layers, responsive/keyboard QA, resilient errors, two scheduled cycles | W01–W13 | `PARTIAL` — desktop/mobile interactions and source fallback tested; scheduled cycles pending |
| W15 | Independent verification: clean-sheet evidence/model/UI/deployment audit of exact candidate build | W01–W14 | `NOT IMPLEMENTED` |

## Current executable package: W01/W02 foundation + experimental W05–W11 vertical slice

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
