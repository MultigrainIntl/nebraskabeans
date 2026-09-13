# Data & Model Governance

## Evidence architecture
WEATHER → SOIL MOISTURE → CROP-MASKED VEGETATION RESPONSE → CROP STAGE → STRESS / CHANGE → AGRONOMIC SIGNIFICANCE → YIELD IMPLICATION → PRODUCTION SIGNIFICANCE.

Do not skip directly from weather to precise yield without validating the intermediate crop-response relationships.

## Crop masking
Moisture and vegetation evidence should be evaluated specifically where beans are grown. Record crop-mask source, year, class definition, spatial resolution, limitations, and whether crop identity is current-season or historical.

## Irrigation
Rainfall deficit does not automatically equal crop water stress under irrigation. Distinguish irrigated and rain-fed conditions only where defensible evidence permits.

## Vegetation
Vegetation evidence should help distinguish threatened conditions from observed crop deterioration. Trend/change may be more useful than a single absolute value. Interpretation should be crop-masked where possible, stage-aware, temporally comparable, and provenance-bound.

## Acute damage and disease
Atmospheric hail potential is not confirmed hail damage. Disease-favorable weather is not confirmed disease. Occurrence claims require observational evidence.

## Cultivar / market class
Do not assume all dry beans share identical maturity, GDD requirements, stress sensitivity, or yield response. Pinto calibration must not silently become a universal dry-bean model.

## Management
Unknown planting date, population, irrigation practice, fertility, tillage, harvest timing, or other management variables remain UNKNOWN unless supported by evidence.

## Yield model gate
Before prominent precise yield is restored: audit inputs and calibration data; identify validation method and leakage risk; perform historical back-testing and appropriate baseline comparison; establish out-of-sample skill; inspect error distribution, regional bias, and extreme-season behavior; add crop-response evidence where justified; quantify uncertainty; justify displayed precision.

## Production weighting
Regional risk is not automatically production significance. Do not make production-significance claims without defensible acreage or production weighting.

## Normal versus abnormal
Where defensible, distinguish current condition from historical anomaly/percentile. A value can be seasonally normal yet numerically dry, or numerically moderate yet unusually abnormal.

## Forecast separation
Maintain strict separation between OBSERVED/CURRENT evidence, FORECAST OUTLOOK, and PROJECTED OUTCOME. Future forecast provenance should include model, initialization/issue time, horizon, update cycle, and uncertainty.

## Source selection
For important variables compare candidate authoritative sources for spatial resolution, temporal resolution, latency, history, licensing/access, agricultural fitness, and geographic coverage. Existing sources are not automatically optimal.

## No fake resolution
A coarse measurement does not become a fine-resolution measurement because it is overlaid on fine polygons. Interpolated visualization may improve readability but creates no new observations.

## Required provenance
Record source, variable, native resolution, temporal resolution, valid date, retrieval/build date, transformation, interpolation/resampling method, crop masking, classification, and known limitations.
