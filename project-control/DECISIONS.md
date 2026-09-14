# Decisions

## D-001 — Product Authority
GAJ / George is Product Authority for subjective product acceptance. Automated tests do not overrule direct visual/product evidence.

## D-002 — Staging safety
Development and verification are staging-only unless GAJ explicitly authorizes production work. Production/main, DNS, GoDaddy, and unrelated repositories are outside routine staging authority.

## D-003 — Pea Trader reference
The Saskatchewan Pea Trader Map is an interaction-quality reference for temporal controls, crop-calendar association, map dominance, and low interpretation burden. It is not a pixel-perfect template.

## D-004 — Progressive disclosure
Primary experience should separate Answer, Evidence, and Methodology rather than display all three simultaneously.

## D-005 — Question-oriented views
Primary views should be expressed as user questions or agricultural concepts such as Crop Status, Moisture, Vegetation, Weather, Change Over Time, Regional Risk, Yield Outlook, and Evidence. Technical terms such as SMAP, NDVI, WMS, and raster belong mainly in provenance/evidence.

## D-006 — Scientific honesty
Display smoothing may improve readability, but must never be represented as new measurement resolution or field-level observation.

## D-007 — Yield governance
Precise yield should not dominate the product until the model has been independently revalidated and its uncertainty is defensible.

## D-008 — One active product gate
After the control foundation is accepted, only one highest-impact unresolved product requirement should be active at a time unless GAJ explicitly expands scope.

## D-009 — Frustration is not authorization
The initial CONTROL-009 instruction could not legally execute because it required control-file edits while the active YIELD-001 lock authorized only product files. The implementer correctly refused, then made a self-authorization error by treating GAJ's frustrated reaction as permission to reverse that refusal. User reaction does not amend scope: only explicit authorization does. GAJ stopped execution and supplied a corrected one-gate-at-a-time sequence on 2026-09-14.
