# Verification Ledger

## Spatial foundation candidate — local checks

Base: `5f5ca45a0d46f025616b4ab5204f3857cbb33485`; branch `staging/spatial-foundation`.
These are builder checks and independently calculated reconciliations, not final
independent clean-sheet verification or proof of an operational complete product.

- Native 2025 10 m CDL archive SHA256:
  `decb52a7c472ce9ac855b295b7185c87c019a07cdb1f33a3d81fa1611de10e03`.
- Four states, 139,410 valid polygon parts; no minimum-area deletion or simplification.
- Pixel counts: KS 123,148; CO 1,298,567; NE 3,782,368; WY 597,855.
- Generated native polygon areas equal pixel count × 100 m² exactly.
- Independent WGS84→5070 geometry-area reconstruction: error below 0.00001 m² per
  state (tolerance 1 m² for floating-point coordinate roundtrip over state totals).
- 41 representative interior points per state independently sampled against the
  original USDA TIFF: all 164 samples are class 42.
- 222 stations; all 31,637 latest-report-per-day outputs reconciled against raw CSV
  timestamps and temperatures; source CSV SHA256 matches every station record.
- Separately retrieved BFF September 9 query: latest record 22:53 UTC, 75°F,
  42°F dew point, 8 knots; agrees with normalized station record.
- Spatial engineering fixtures pass: isolated small patch retained, tile edges retain
  acreage, nodata excluded, geographic-degree CRS rejected.
- Existing temporal/evidence suites and foundation contract pass.
- Local Chromium desktop/mobile tests pass with fixture external base-map services
  and real locally served USDA polygons/IEM station records. Polygon/station canvas,
  toggles, date synchronization and production withholding tested; no console errors.
- Direct cloud-browser localhost preview is blocked by its network boundary. It is
  not evidence of a site defect. Public staging interaction verification remains due.

| Date | Object | Identity | Check | Result | Status |
|---|---|---|---|---|---|
| 2026-09-11 | deployed staging | `gh-pages@4fd1e43e9f6d50c9db2b7250702f914f8f1505f3` | direct browser load, county service, official-history rendering, controls | Loads; controls respond; incomplete layers remain explicit | `VERIFIED` runtime, `PARTIAL` product |
| 2026-09-11 | temporal model | same baseline | issue-time filtering, revisions, interpolation, missing data | 6/6 tests passed | `VERIFIED` engineering behavior |
| 2026-09-11 | evidence store | same baseline | unknown-value rejection, immutability, revisions, disagreement, confidence | 5/5 tests passed; vocabulary/confidence model violates new contract | `PARTIAL` |
| 2026-09-11 | NASS 2026 baseline | named official PDFs | cross-check report tables and units | March, June, and August values matched | `VERIFIED` transcription sample |
| 2026-09-11 | secondary pages | same baseline | static dependency scan | six pages reference deleted `assets/site.js` | `VERIFIED` defect |
| 2026-09-11 | foundation candidate | `staging/foundation-recovery-20260911@59bb4ed0e5835a5609073a56a04584a6a573420e` | contract/build validation, unit tests, Chromium desktop/mobile and secondary-page interactions | GitHub Actions run 34634130657 passed | `VERIFIED` engineering package |
| 2026-09-11 | deployed foundation | `gh-pages@59bb4ed0e5835a5609073a56a04584a6a573420e`, data `nbd-v1-4f971a6e9bd6b3247524` | Pages build, deployed-URL browser suite, separate direct browser load and converter interaction | Pages run 34634219155 and QA run 34634220389 passed | `VERIFIED` staging deployment; product remains `PARTIAL` |
| 2026-09-11 | GISit weather/GDD model | `gisit-drybean-weather-ridge-v1@1.0.0`, data `nbd-v1-a626240da393257d143f` | 92-state-year leave-one-calendar-year-out selected-date hindcast; current USDA yield excluded | Sep. 9 MAE 167 lb/ac vs 179 lb/ac historical-median baseline; empirical p80 absolute error 265 lb/ac; Apr. 15–Jun. 1 gate fails and is withheld | `VERIFIED` engineering/backtest behavior; `PARTIAL` scientific model |
| 2026-09-11 | Crop-CASMA corroborating evidence | `satellite-signals-2026`, 44 checksummed WCS coverages | Weekly SMAP root-zone anomaly + encoded NDVI direction; requested/valid date retention; bounded source fallback | 44/44 samples built; NDVI Jun. 24→Jun. 23 and Sep. 2→Sep. 1 fallbacks explicitly recorded | `VERIFIED` ingestion/provenance; crop mask remains `PARTIAL` |
| 2026-09-11 | local model candidate | data `nbd-v1-a626240da393257d143f` | static contract, temporal/evidence unit suites, Chromium desktop/mobile, pre-gate withholding, play/shared-date, all four map modes, acreage production scenario | all checks passed; no console/page errors with deterministic service fixtures | `VERIFIED` local engineering candidate; deployment pending |
| 2026-09-11 | uploaded model tree | `staging/foundation-recovery-20260911@86801605877a58acfb27630d88192cc267f00662` | compare uploaded Git tree to locally tested tree | both resolve to tree `fe1327aec6305cc12d1e2c8d83a984d64611ae12` | `VERIFIED` artifact identity; clean-run workflow pending |

Independent scientific/model verification has not occurred. Engineering checks do not
substitute for it.
