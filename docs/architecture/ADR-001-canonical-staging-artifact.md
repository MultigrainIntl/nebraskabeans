# ADR-001: Canonical Staging Artifact and Isolation

Status: accepted for staging foundation, 2026-09-11

## Decision

Treat `MultigrainIntl/nebraskabeans` `gh-pages` at
`4fd1e43e9f6d50c9db2b7250702f914f8f1505f3` as the deployed staging baseline. Build
from that exact tree on an isolated `staging/foundation-recovery-20260911` branch.
NebraskaBeans owns its governed pipeline; GISit repositories provide candidate patterns,
not silent runtime dependencies.

## Rationale

The default `main` branch is an initial README, while GitHub Pages and the browser both
resolve to the `gh-pages` recovery tree. Production `nebraskabeans.com` is a separate
GoDaddy site. This boundary makes rollback exact and prevents staging recovery from
altering production or unrelated systems.

## Consequences

The Pages branch is not updated until the isolated candidate is tested. Any later
staging deployment records the candidate SHA and the prior `gh-pages` SHA. Production
cutover is a separate Product Authority decision.
