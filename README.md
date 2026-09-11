# NebraskaBeans

Evidence-driven dry-edible-bean crop intelligence for Nebraska, Colorado, Wyoming,
and Kansas. The public GitHub Pages site is an **experimental staging model**, not the
production `nebraskabeans.com` website.

## Governed baseline

- Verified staging foundation: `gh-pages@59bb4ed0e5835a5609073a56a04584a6a573420e`
- Rollback baseline: `4fd1e43e9f6d50c9db2b7250702f914f8f1505f3`
- Working recovery branch: `staging/foundation-recovery-20260911`
- Production, `main`, DNS, and GoDaddy are out of scope without Product Authority.

Read these before implementation:

1. `MASTER-EXECUTION-CONTRACT.md`
2. `NEBRASKABEANS-SCIENTIFIC-SPEC.md`
3. `FACTS-OF-RECORD.md`
4. `WORK-ORDER.md`

## Foundation checks

```bash
node scripts/build_manifest.mjs --check
node scripts/verify_foundation.mjs
node tests/temporal-evidence.test.js
node tests/evidence-store.test.js
NB_OFFLINE_FIXTURES=1 NB_BASE_URL=http://127.0.0.1:4173/ node tests/browser-smoke.mjs
```

Browser QA is defined in `tests/browser-smoke.mjs` and runs in the staging workflow.
The allowed agricultural evidence classes are `OBSERVED`, `DERIVED`, `MODELED`,
`ESTIMATED`, `ASSUMED`, and `UNKNOWN`. Work status uses the separate controlled
vocabulary in the master contract.

GISit v1 calculates its own pinto-basis in-season regional yield from governed
weather/GDD features and a 92-state-year NASS final-outcome calibration set. Current
USDA yield forecasts are excluded. Selected dates publish only when leave-one-year-out
error beats a state historical-median baseline. The current build also carries weekly
SMAP/NDVI evidence and dated USDA acreage production scenarios.

Crop-derived geography, current irrigation, soils, official-progress overrides,
class-specific models, forecast scenarios, scheduled refresh, and independent
scientific verification remain mandatory incomplete work. See
`docs/TEMPLATE-PORTABILITY.md` before adapting the pipeline to another crop/site.
