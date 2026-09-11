# Blocker Register

Updated: 2026-09-11

| ID | Work | Blocker/evidence | Safe next action | Status |
|---|---|---|---|---|
| B-001 | W03 | Authoritative 2025 CDL class-42 raster is not in the repo; CropScape statistics probe returned 502; GDAL/raster stack absent locally | Add immutable download contract/checksum and build in a pinned CI/container environment | `BLOCKED` for crop mask; design may continue |
| B-002 | W06/W08 | SMAP/HLS Earthdata acquisition credentials are not exposed here; no governed snapshots exist | Specify products/fields/QA and test public Crop-CASMA metadata while authority resolves account access | `BLOCKED` for raw ingestion |
| B-003 | W05 | ERA5/CDS credentials and immutable dataset request are not configured | Complete contract and assess NOAA/public alternatives without silently substituting | `BLOCKED` for ERA5 ingestion |
| B-004 | W09–W11 | No locally calibrated condition/confidence/yield model or complete historical feature/outcome table | Finish W03–W08, then register parameters and backtest | `BLOCKED` by dependencies |
| B-005 | W14/W15 | No scheduled refresh exists and two successful cycles cannot yet be observed | Implement only after a real source pipeline emits governed builds | `BLOCKED` by W01–W13 |

Blocked items remain mandatory and may not be relabeled complete.
