# NebraskaBeans Master Execution Contract

Effective: 2026-09-11  
Authority: George / GAJ, Product Authority  
Execution boundary: staging only unless Product Authority explicitly approves otherwise

This is the binding constitution and completion contract for NebraskaBeans and the
template for future crop-intelligence sites. It governs implementation, evidence,
verification, deployment, and reporting. No convenience, UI polish, or deadline
overrides it.

## Mission

NebraskaBeans is an evidence-driven dry-edible-bean crop-intelligence product for
Nebraska, Colorado, Wyoming, and Kansas. It must answer, with traceable evidence:

1. Where dry beans are grown and how much crop is represented.
2. What has happened so far in the current season.
3. What crop stage is plausible now and how uncertain that stage is.
4. What root-zone water, soil, irrigation, weather, and vegetation evidence say.
5. What current crop condition is supported and where evidence disagrees.
6. What yield and production range is supported, regionally and in aggregate.
7. What changed since the prior issued estimate and why.
8. What could still improve or impair the crop.
9. What the information means commercially, without converting uncertainty into fact.
10. Which datum, source, date, method, model, and code/data build support each conclusion.

The map and website are presentation surfaces for that evidence system; they are not
the product by themselves. `UNKNOWN` is preferable to fabricated completeness, but a
mandatory capability does not pass merely because it displays `UNKNOWN`.

## Authority and change control

Only Product Authority may:

- reduce, defer, or substitute a mandatory requirement;
- approve any non-zero recurring cost;
- approve production-domain, DNS, production-branch, or production-data changes;
- approve a scientifically weaker source, method, or acceptance criterion.

Safe read-only discovery and isolated staging work continue without interruption.
Decisions requiring authority are recorded in `PRODUCT-AUTHORITY-DECISIONS.md` with a
recommendation and consequences; they are never silently assumed.

## JOIEOS operating loop

Every material work package follows:

1. **Observe** — inspect the actual repository, deployment, runtime, data, and evidence.
2. **Prove** — reproduce the behavior and preserve exact source/code/data identities.
3. **Classify** — assign the allowed work status and evidence class.
4. **Act** — change the smallest isolated surface that resolves the proved defect.

The implementation loop is: Orient → Define Gate → Implement in Isolation → Test →
Independently Verify → Reassess → Report → Continue.

## Controlled vocabulary

Work status is exactly one of:

- `VERIFIED`
- `IMPLEMENTED-NOT-VERIFIED`
- `PARTIAL`
- `BLOCKED`
- `NOT IMPLEMENTED`
- `DEFERRED — PRODUCT AUTHORITY`

Evidence class is exactly one of:

- `OBSERVED` — a directly obtained source record or measurement;
- `DERIVED` — deterministic transformation of identified inputs;
- `MODELED` — output from an external or internal model;
- `ESTIMATED` — an inference with an explicit method and uncertainty;
- `ASSUMED` — an explicit, sensitivity-tested assumption;
- `UNKNOWN` — insufficient evidence; no claimed value may be carried.

`VERIFIED` is a work status, never an agricultural evidence class. A government
forecast remains a forecast even when its transcription and provenance are verified.

## Evidence and anti-fabrication rules

- Every material datum retains source ID, geography, units, valid/observation time,
  issue/publication time, retrieval time, method, limitations, evidence class, and
  revision relationship where applicable.
- No future-issued information may leak into an earlier selected date.
- Counties are reference geography, not crop polygons. Weather is not crop condition.
  Satellite vegetation is not yield. An event report is not quantified loss.
- Suppressed, discontinued, inaccessible, or unpublished data are `UNKNOWN`, not zero.
- No threshold, coefficient, weighting, baseline, crop calendar, or crop-impact rule may
  affect a conclusion without a source or a registered model contract and sensitivity
  evidence.
- Official estimates and GISit estimates remain visibly distinct.
- Conflicting sources are preserved and exposed; disagreement may not be averaged away
  without a declared method.
- Private commercial, grower, processor, logistics, or GIS data may not be delivered in
  public browser assets.

## Data and model identities

The pipeline has five explicit layers: `RAW`, `NORMALIZED`, `DERIVED`, `MODELED`, and
`PRESENTATION`. A build manifest lists every material input checksum, source retrieval,
transform/model version, code SHA, output checksum, and limitation. `data_build_id` is
content-derived from a canonical manifest; a date or manually typed label is not an ID.

Models are versioned separately from data. An issued forecast stores the exact model,
data build, code SHA, issue time, selected data cutoff, result, range, and revision
reason. Historical beliefs are immutable.

## Spatial, temporal, and scope invariants

- Required states are Nebraska, Colorado, Wyoming, and Kansas. A missing state is shown
  explicitly and never silently removed from the aggregate.
- U.S. dry-bean crop identity uses released USDA CDL dry-bean evidence and declares the
  crop year; the latest released CDL is not current-year field truth.
- Analytical zones and aggregation weights require crop-area or published-acreage
  evidence. Candidate centroids are prototypes only.
- All observations use `valid_time`; publications and forecasts also use `issue_time`.
  Retrieval time never substitutes for either.
- The selected date controls every layer, card, narrative, comparison, and forecast.
- Current state, historical state, and forward forecast are separate products.
- Revisions replace neither prior records nor prior issued conclusions.

## Deployment and public-state rules

- Work begins from the exact deployed staging SHA and proceeds on an isolated branch.
- Tests run against the exact candidate commit. The deployed URL is verified separately
  after publication, including browser rendering and interaction.
- A rollback SHA is recorded before every staging deployment.
- An unfinished public page is visibly labeled prototype/staging and uses `noindex`.
- Production, `main`, `nebraskabeans.com`, GoDaddy, DNS, and unrelated GISit repositories
  remain untouched without explicit Product Authority approval.

## Completion gate

The product may be called finished only when all mandatory M4 acceptance criteria in
`NEBRASKABEANS-SCIENTIFIC-SPEC.md` are `VERIFIED`; there are no unresolved `PARTIAL`,
`BLOCKED`, or `NOT IMPLEMENTED` mandatory items; two consecutive scheduled refreshes
have passed; code SHA, data build, and model identities resolve from the deployed UI;
and a logically independent clean-sheet verification passes. Deployment alone is not
completion.

## Required records

The repository must maintain this contract, `NEBRASKABEANS-SCIENTIFIC-SPEC.md`,
`WORK-ORDER.md`, `FACTS-OF-RECORD.md`, `PRODUCT-AUTHORITY-DECISIONS.md`,
`docs/BLOCKER-REGISTER.md`, `docs/VERIFICATION-LEDGER.md`, source/data-rights registries,
data/model build manifests, and architecture decisions. Contradictions are reconciled
in these records before downstream claims are accepted.
