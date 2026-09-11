# NebraskaBeans

Nebraska dry bean GIS intelligence and physical-trade decision-support prototype.

## Current isolated build
- Branch: `gisit-nebraska-v1`
- UI: dark intelligence terminal with GIS-centered workflow
- Evidence classes: VERIFIED / DIRECT OBSERVATION / MODEL / ESTIMATED / UNKNOWN
- Live browser dependencies: Leaflet, CARTO, NASA GIBS, Esri, Open-Meteo, NOAA NCEI

## Verification completed before staging
- HTML structural checks passed: required controls and unique IDs present.
- JavaScript syntax checked with `node --check` and passed.
- Git tree verified to contain the exact updated `index.html`, `assets/site.css`, and `assets/site.js` blobs.
- Previous deployed staging commit retained as rollback point: `d053c356b6ecc3b1108daa9efd906f2c4a6cd329`.

## Verification limitation
Headless Chromium in the execution environment timed out before producing a rendered screenshot. Do not treat the UI as independently visually verified until inspected in a normal browser.

Production DNS, GoDaddy, custom domain, and `main` are outside this staging gate.