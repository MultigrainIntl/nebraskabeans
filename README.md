# NebraskaBeans

Evidence-driven dry-edible-bean crop intelligence for Nebraska, Colorado, Wyoming,
and Kansas. The current public GitHub Pages site is a **staging prototype**, not a
completed crop model and not the production `nebraskabeans.com` website.

## Governed baseline

- Deployed staging: `gh-pages@4fd1e43e9f6d50c9db2b7250702f914f8f1505f3`
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
```

Browser QA is defined in `tests/browser-smoke.mjs` and runs in the staging workflow.
The allowed agricultural evidence classes are `OBSERVED`, `DERIVED`, `MODELED`,
`ESTIMATED`, `ASSUMED`, and `UNKNOWN`. Work status uses the separate controlled
vocabulary in the master contract.

The displayed NASS numbers are source records that retain their published
estimate/forecast status; they are not GISit forecasts. Crop geography, root-zone
moisture, phenology, vegetation, condition, calibrated confidence, GISit yield,
production, and scenario analytics remain mandatory but not implemented.
