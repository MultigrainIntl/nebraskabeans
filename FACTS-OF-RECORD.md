# NebraskaBeans Facts of Record

Observed: 2026-09-11 UTC

## Governed artifact statement

- Repository: `MultigrainIntl/nebraskabeans` (public GitHub repository ID 1364913730).
- Default branch: `main`; observed SHA
  `83f1f1f720dc0757a1988b2c675a65330806a5b0`; contains only the initial README and is
  not the recovery application.
- Gate-0 deployed staging baseline: `gh-pages` at
  `4fd1e43e9f6d50c9db2b7250702f914f8f1505f3`.
- Verified foundation promotion: `gh-pages` at
  `59bb4ed0e5835a5609073a56a04584a6a573420e`; Pages deployment and exact-checkout plus
  deployed-browser QA completed successfully. Rollback remains `4fd1e43…`.
- Staging URL: `https://multigrainintl.github.io/nebraskabeans/`.
- Isolated working branch: `staging/foundation-recovery-20260911`, created from the
  gate-0 deployed staging SHA and used to verify the foundation tree before promotion.
- Production URL: `https://nebraskabeans.com/`; observed as a separate GoDaddy-hosted
  commercial site. No redirect or deployment link to the GitHub Pages recovery app was
  observed. Production and DNS are out of scope.

## Deployed runtime and forensic application audit

- Static HTML/CSS/JavaScript with Leaflet; no package manifest or application backend.
- Browser loads one active recovery controller, `assets/app.js`, and county reference
  geometry from Census TIGERweb.
- The page preserves dated USDA forecast history and does not leak the August forecast
  backward before its issue date in tested cases.
- The map contains seven manually selected candidate centroids and county outlines; it
  contains no crop-derived production geometry or crop-condition surface.
- Open-Meteo is queried directly in the browser as a temporary gridded-weather fallback.
  Unsupported precipitation-minus-ET0, heat-day, and cold-day thresholds are present in
  the deployed code. They are not accepted scientific conclusions.
- SMAP, SSURGO, irrigation, HLS, phenology, condition synthesis, calibrated confidence,
  GISit yield, production, scenarios, and post-harvest learning are not implemented.
- Six secondary pages load deleted `assets/site.js`; their menu, bean content, and unit
  conversion behavior are therefore broken.
- The public staging robots policy currently allows indexing.
- Existing tests pass but primarily verify temporal safety and explicit incomplete
  states; they do not prove scientific completeness.

## Deployment and automation

- GitHub Pages is empirically associated with `gh-pages`: the exact branch head is the
  exact HTML/browser deployment observed at the Pages URL, and Pages/QA runs succeeded
  for that commit.
- `.github/workflows/staging-qa.yml` runs only on pushes to `gh-pages`; no scheduled data
  refresh exists.
- Static Pages cannot execute a server pipeline or protect service credentials. GitHub
  Actions can schedule bounded processing, but no heavy raster storage/compute design or
  recurring paid infrastructure is approved.

## Infrastructure and access observed in the execution environment

- Linux runner: 9 CPU, about 15 GiB RAM, about 30 GB free; Node 24 and Python 3.12.
- GDAL and the repository's declared raster/geospatial Python dependencies are absent.
- No task-relevant NASA/USDA/NOAA/Copernicus/cloud credential variables were exposed to
  this environment. This does not establish account-wide absence.
- Crop-CASMA, NOAA, SSURGO, and Open-Meteo endpoints were reachable. The CropScape county
  statistics request returned HTTP 502 during the audit.
- The connected GitHub identity has admin/push access to the repository; the local clone
  has no `gh` CLI. Remote writes require the connected GitHub integration.

## GISit reuse classification

- `gisit-crop-deploy`: reuse workflow/provenance/access-control patterns with
  modification. Do not reuse hard-coded crop regions, crop thresholds, offline synthetic
  data, broken imagery assumptions, or generic crop models as scientific truth.
- `gisit-weather`: reuse backend issue-time/verification and station-ingest patterns with
  modification. Its current public-model blend is not a substitute for the specified
  NBM contract, and its thresholds/weights require validation.
- `gisit-farm-pro`: no substantive reusable implementation was found.
- NebraskaBeans owns the canonical source → build → manifest → product pipeline; other
  GISit repositories are references, not runtime dependencies unless separately gated.

## Verified official baseline facts

- USDA NASS Prospective Plantings, released 2026-03-31: 2026 intended dry-edible-bean
  acres included Colorado 30,000 and Nebraska 101,000; U.S. 1,236,000.
- USDA NASS Acreage, released 2026-06-30: 2026 planted acres included Colorado 33,000,
  Nebraska 95,000, and U.S. 1,161,000.
- USDA NASS Crop Production, released 2026-08-12 for August 1 forecasts: Colorado
  31,000 planted, 27,000 harvested, 1,850 lb/ac, 500,000 cwt; Nebraska 80,000 planted,
  76,000 harvested, 2,500 lb/ac, 1,900,000 cwt.
- The current NASS state table does not publish Wyoming or Kansas dry-edible-bean totals;
  those states remain explicitly `UNKNOWN`, not zero and not out of scope.

## Reconciled contradiction

`docs/RECOVERY_AUDIT_2026-09-11.md` recorded `63b205e…` as the deployed/rollback SHA.
That statement is superseded: the branch/API/workflow/browser observations all identify
`4fd1e43e9f6d50c9db2b7250702f914f8f1505f3`. The old document is historical evidence,
not the current authority.
