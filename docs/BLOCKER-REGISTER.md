# Blocker Register

Updated: 2026-09-11

| ID | Work | Blocker/evidence | Safe next action | Status |
|---|---|---|---|---|
| B-001 | W03 | Original missing-library/download blocker resolved: rasterio/Shapely/pyproj installed; official native 10 m national CDL downloaded | Extract, generate all four state footprints, reconcile pixel/polygon area, test display | `PARTIAL` — processing and verification in progress |
| B-002 | W06/W08 | Raw Earthdata HLS/SMAP credentials are not exposed; public Crop-CASMA WMS/WCS is now governed and sampled | Retain Crop-CASMA vertical slice; add raw HLS only with product/version/QA contract | `PARTIAL` — raw crop-mask ingestion blocked |
| B-003 | W05 | ERA5/CDS credentials are not configured; exact Open-Meteo ERA5-family responses and checksums now support the experimental vertical slice | Add NOAA station comparison and decide whether direct CDS materially improves the backtest | `PARTIAL` — no longer blocks experimental model |
| B-004 | W09–W11 | GISit v1 is calibrated/backtested, but crop mask, irrigation, soil and class-specific targets remain incomplete | Keep experimental label and release gate; expand only with measured out-of-sample gain | `PARTIAL` — model exists; operational completeness blocked |
| B-005 | W14/W15 | No scheduled refresh exists and two successful cycles cannot yet be observed | Implement only after a real source pipeline emits governed builds | `BLOCKED` by W01–W13 |

Blocked items remain mandatory and may not be relabeled complete.
