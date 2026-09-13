# Contradiction Records

Every contradiction record is a YAML file in this directory and is mechanically read by `scripts/validate-control-plane.mjs`.

Required fields:
- `schema_version`
- `id`
- `requirement`
- `status` (`OPEN` or `RESOLVED`)
- `raised_by`
- `timestamp`
- `evidence`

Optional fields:
- `candidate_sha` — when present, a full existing 40-character lowercase commit SHA
- `resolution`

An `OPEN` contradiction naming a requirement mechanically prevents that requirement from remaining `INDEPENDENTLY_VERIFIED`, `GAJ_ACCEPTED`, or `CLOSED`.

Contradiction evidence is not erased when resolved; the record changes to `RESOLVED` and retains the resolution explanation. Direct GAJ evidence concerning subjective product acceptance overrides stale proxy verification and must be represented in canonical requirement state.
