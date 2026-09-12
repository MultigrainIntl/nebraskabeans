# Crop-footprint-weighted satellite evidence

Status: PARTIAL — local spatial reconciliation verified; deployment and model integration incomplete. This is an engineering/spatial evidence
package, not a completed crop-health or yield model.

## Geometry and weights

Every native 2025 CDL class-42 pixel whose centre lies inside the four state
boundaries participates. Its area is 100 m² in EPSG:5070. Transform its centre to
EPSG:4326 and assign it to the containing source-grid cell (floor indexing, no
interpolation). Sum those pixel areas per source cell and state. Preserve outside
coverage separately and require exact conservation against the released footprint
manifest. Native pixel centres provide the explicitly declared boundary convention;
no new field boundaries or current-season crop identity are inferred.

State membership is a published boundary; state totals are not candidate-centroid
averages. The weights describe historical crop area represented by source cells.
They are not current planted/harvested weights or market-class allocation weights.

## Source support and missing data

SMAP uses the same checksum-verified WCS source grids as the earlier evidence series.
NDVI requests SCALEFACTOR=1 rather than 0.05: a 4,948 × 3,430 service grid rather
than the earlier 247 × 171 grid over the four-state bounds. This is the full available
Crop-CASMA grid; it is not the mandatory 30 m HLS product. Source-encoded NDVI is
retained without asserting an undocumented physical-unit conversion.

Weight the arithmetic mean by crop pixels in each valid source cell. The median is
the lower area-weighted median. Nodata and out-of-grid crop pixels are excluded from
values but retained in coverage denominators. Coverage is availability, not confidence
or a cloud/quality-screening guarantee. Mixed-cover source cells do not become
bean-only observations because they have been weighted by a bean footprint.

Each checkpoint preserves requested and actual source dates. Use only checkpoints
on or before the selected date. Retrieval times not captured for cached input bytes
remain explicitly unknown. This is a retrospectively processed archive, not immutable
historical issued beliefs. No current USDA yield, yield coefficient, regional forecast,
or production scenario changes in this package.

## Reproduction and archival

`build_crop_weighted_evidence.py` uses the original native CDL, reference states,
released footprint manifest, and exact WCS grids. It records sparse cell weights,
per-state summaries, every source URI and byte checksum, and lossless raw archives.
Writes are atomic; an output lock prevents overlapping builds.

The isolated source-archive workflow downloads the declared public source URLs,
requires exact original and compressed byte checksums, checks the build manifest,
commits only on `staging/crop-weighted-evidence`, tests that assembled commit, and
pushes only that branch. It never promotes `gh-pages` or changes production.

`verify_crop_weighted_evidence.py` independently clips selected source-cell footprints
against the original CDL/state geometry, checks all 44 archived sources, and expands
source-cell weights back to equal-area pixel samples to reconcile final-date means
and medians. Small fixtures test containing-cell assignment, area conservation,
nodata, outside coverage, and weighted statistics. These checks are not independent
agronomic validation.

## Local reconciliation result

All four state totals match the native footprint: KS 123,148; CO 1,298,567;
NE 3,782,368; WY 597,855 pixels. All source grids contain the full historical
crop footprint. Forty independently clipped source cells match their stored crop
counts exactly. All 44 archived byte streams pass both compressed and original
checksums. Expanded final-date pixel samples reproduce weighted means within
1e-12 floating-point tolerance and lower medians exactly. Two engineering fixtures
pass. No claim of agronomic validation follows from these checks.
