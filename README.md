# NebraskaBeans

Nebraska dry bean crop-intelligence and physical-trade decision-support staging build.

## Current isolated build
- Branch: `gisit-nebraska-v1`
- UI: answer-first crop outlook + temporal GIS
- Evidence classes: VERIFIED / MODELED / ESTIMATED / ASSUMED / UNKNOWN
- Existing GISit/Pea-map patterns reused: Leaflet, polygon-aware sampling, shared as-of date, stage-aware temporal cadence, Open-Meteo historical weather, Esri imagery.

## Temporal polygon behavior
- Five monitored western Nebraska county polygons are currently analytical containers: Scotts Bluff, Box Butte, Morrill, Sheridan, Dundy.
- Multiple sample points are generated inside each polygon using point-in-polygon logic; values are averaged by polygon.
- Historical Open-Meteo soil moisture is requested at 7–28 cm and 28–100 cm and converted to daily polygon averages.
- One shared as-of date drives soil-moisture color, crop-condition interpretation, projected yield, narrative and selected-region detail.
- Playback uses coarser steps outside critical growth periods and 2-day steps during Flowering / Pod Set / Seed Fill, following the Pea-map cadence pattern.
- Yield remains an ESTIMATED decision-support model using an explicit 2,300 lb/ac baseline and June 1 planting anchor until authoritative regional history replaces those assumptions.

## Important limits
- County polygons are not represented as dry-bean planted acreage or field boundaries.
- Soil moisture is model-derived, not a direct field probe.
- Projected yield is not an official USDA forecast.
- Production DNS, GoDaddy, custom domain and `main` remain outside this staging gate.
