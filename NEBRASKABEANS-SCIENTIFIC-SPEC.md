# NebraskaBeans Scientific and Product Specification

Version: 0.1 foundation  
Status: `PARTIAL` — mandatory analytics are not yet implemented

## Scope and product outputs

The operational product covers Nebraska, Colorado, Wyoming, and Kansas and preserves
both state-level official records and crop-derived analytical zones. It supports Great
Northern, pinto, light red kidney, black, navy, and other dry-edible-bean classes only
where an authoritative source supports the class/geography relationship.

Every selected-date view must expose:

- answer-first condition, yield, production, and uncertainty summaries;
- crop geography and acreage/weight evidence;
- phenology and planting-window uncertainty;
- root-zone soil moisture, moisture anomaly/percentile, precipitation, evaporative
  demand, soil water capacity, and irrigation context;
- crop-mask vegetation trajectory and quality flags;
- relevant heat, frost, hail, wind, flooding, drought, pest, and disease evidence only
  when spatial and stage overlap support the relationship;
- current condition versus forward vulnerability;
- regional contributions, exceptions, source disagreement, what changed, scenarios,
  commercial interpretation, and complete provenance;
- immutable issued-estimate history and post-harvest error evaluation.

## Source architecture

| Need | Preferred source | Evidence handling | Minimum contract |
|---|---|---|---|
| Crop geography | USDA NASS CDL, class 42 | `MODELED`; annual classification | crop year, class, resolution, CRS, checksum, mask/area method |
| Acreage/yield/production | USDA NASS dated publications / Quick Stats | `OBSERVED` published record; preserve estimate/forecast status | report, table, units, valid date, release date, revision |
| Direct weather | NOAA/NCEI stations | `OBSERVED` | station, element, QC, valid time, units |
| Gridded history | ERA5-Land | `MODELED` | variable, level, grid, cadence, release/version |
| Root-zone moisture | NASA SMAP L4; Crop-CASMA access complement | `MODELED` | product/version, 0–100 cm field, quality, climatology |
| Soils | USDA NRCS SSURGO/gSSURGO | `OBSERVED` source record plus declared derivation | map unit, component aggregation, AWC/depth method |
| Irrigation | IrrMapper/LANID/USDA statistics | `MODELED` or `OBSERVED` by datum | crop year, probability/context limitation |
| Vegetation | NASA HLS-VI | `MODELED`; crop-mask and QA clipped | product/version, acquisition, cloud/smoke QA, index formula |
| Drought | U.S. Drought Monitor | `OBSERVED` published composite | week/date, class, geometry |
| Forecast weather | NWS NBM; HRRR complement | `MODELED` | issue time, valid time, cycle, member/product |
| Severe events | NOAA Storm Events / MRMS | `OBSERVED` report or `MODELED` radar | event/scan time, geometry, crop/stage intersection |
| Agronomy | UNL/CSU and peer-reviewed bean research | source evidence, not current-year fact | cultivar/class applicability, units, limitations |

Backups never silently replace a preferred source. Rights, authentication, cost,
latency, freshness, retention, and redistribution terms are recorded before automation.

## Data-layer contracts

1. **RAW** stores immutable bytes or query response plus retrieval metadata and checksum.
2. **NORMALIZED** converts units/fields/geographies without analytical inference.
3. **DERIVED** applies deterministic spatial/temporal transformations with versioned code.
4. **MODELED** applies declared model parameters and produces uncertainty/diagnostics.
5. **PRESENTATION** reads governed artifacts; browser code does not invent scientific
   thresholds or silently query an unversioned substitute.

The minimum evidence record is:

`id, variable, geography_id, value, units, valid_time, issue_time, retrieved_at,
source_id, source_artifact_checksum, method_id, evidence_class, limitations`.

## Crop geography and aggregation

- CDL crop pixels are measured in an equal-area projection; geometry simplification is
  visual only and cannot change analytical acreage.
- Multi-year frequency may support stability/confidence but cannot prove current crop.
- Zone definitions are versioned. County outlines remain reference boundaries.
- State/High Plains rollups use declared planted/harvested/crop-area weights and expose
  coverage. Unsupported states remain `UNKNOWN` and lower completeness/confidence.
- Class-level geography or weights are published only when sourced; no national class
  share is projected into a state without an approved method.

## Temporal and phenology model

- Official progress reports override weaker stage estimates when the reported crop and
  geography match.
- Otherwise, planting windows are estimated from dated observations and/or a sourced
  distribution; a permanent fixed planting date is prohibited.
- GDD base, upper cutoff, emergence/maturity thresholds, cultivar applicability, missing
  weather handling, and planting uncertainty are parameterized and sourced.
- Stage is a distribution or range when inputs are uncertain. Stress exposure is joined
  to the stage distribution rather than assigned by calendar month.

## Water, vegetation, condition, and stress

- Root-zone water combines SMAP L4, historical same-period percentile/anomaly, weather,
  soil AWC/rooting context, and explicit irrigation uncertainty.
- ET0 is evaporative demand, not crop ET; crop demand needs a sourced Kc/stage method.
- Vegetation evidence is a crop-mask time series with acquisition and QA coverage,
  compared with prior years and same-period normals.
- Condition synthesis requires at least two defensible evidence families and exposes
  coverage, freshness, agreement, and limitations. No single source is relabeled crop
  condition.
- Thresholds for heat, frost, water, vegetation, or loss require a cited agronomic/model
  contract and sensitivity evaluation.

## Yield, production, scenarios, and confidence

- The historical expectation uses dated NASS outcomes and an explicit region/class
  applicability method; no permanent arbitrary baseline is allowed.
- Adjustments are traceable to validated predictors and calibration/backtesting. A
  literature coefficient is not automatically locally calibrated.
- Output includes central estimate, defensible interval, major positive/negative drivers,
  disagreement, coverage, and change since the previous issued estimate.
- Production equals a clearly identified yield basis times a clearly identified acreage
  basis, with units and covariance/uncertainty treatment stated.
- Scenarios vary material uncertain inputs and show downside/base/upside outcomes; they
  are not probabilities unless calibrated as such.
- Confidence is decomposed by geography, temporal freshness, source coverage, phenology,
  irrigation, vegetation/weather agreement, and model calibration. Numeric weights and
  labels require a registered model; otherwise confidence is `UNKNOWN` with reasons.

## Operational and UI requirements

- The scheduled pipeline is rerunnable, idempotent, fails closed on invalid/stale data,
  and emits content-derived data/manifests.
- The selected date drives all UI surfaces. Layer controls either change an actual layer
  or clearly state that the capability is unavailable.
- Every material number has a provenance drill-back; build/model identities are visible.
- The app supports keyboard navigation, usable focus states, sufficient contrast,
  responsive desktop/mobile layouts, reduced motion, and resilient empty/error states.
- Public prototypes use `noindex`; final production indexing requires Product Authority.

## Milestone acceptance

| Milestone | Acceptance requirement | Current status |
|---|---|---|
| M0 Takeover | Canonical repo/deployment/SHA, contradictions, infra, reuse, blockers, decisions recorded | `VERIFIED` |
| M1 Governed evidence | Operational source contracts, rights, raw snapshots, content-derived build | `PARTIAL` |
| M2 Crop state | Crop geography, temporal joins, weather/water/phenology/vegetation coverage | `NOT IMPLEMENTED` |
| M3 Crop outlook | Condition, confidence, yield, production, scenarios, forecast history, calibration | `NOT IMPLEMENTED` |
| M4 Product | Answer-first UI, provenance, performance/a11y, two scheduled refreshes, independent verification | `NOT IMPLEMENTED` |

Nothing below M4 satisfies the final completion contract.
