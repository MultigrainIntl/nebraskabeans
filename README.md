# NebraskaBeans

Nebraska dry bean GIS intelligence and physical-trade decision-support prototype.

## Current isolated build
- Branch: `gisit-nebraska-v1`
- UI: light GIS-centered Nebraska intelligence workspace
- Evidence classes: VERIFIED / DIRECT OBSERVATION / MODEL / ESTIMATED / UNKNOWN
- Existing GISit components reused: Leaflet, OpenStreetMap, RainViewer radar, NASA GIBS NDVI, Esri World Imagery, Nominatim search, Open-Meteo weather/soil, NOAA NCEI station observations.
- No Mapbox/MapTiler dependency was introduced.
- Existing GISit Firebase/Auth/Firestore/Cloud Functions remain separate and unchanged; this public staging slice does not duplicate them or expose private configuration.

## Verification facts
- GISit source inspection verified that the existing map stack already uses Leaflet + OpenStreetMap, Nominatim, Open-Meteo, RainViewer, Esri World Imagery, NASA GIBS and Firebase functionality elsewhere in GISit.
- Nebraska staging now reuses the public map/data patterns rather than inventing a second infrastructure stack.
- RainViewer metadata endpoint was independently reachable during this gate.
- Exact branch/tree/blob identity is verified through GitHub after writes.

## Verification limitation
Rendered browser verification is not claimed unless a browser run succeeds. External scientific/data providers can also fail independently; the UI must display unavailable states instead of substituting invented values.

Production DNS, GoDaddy, custom domain, and `main` are outside this staging gate.