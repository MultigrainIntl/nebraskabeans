# CONTROL-007 Proposal — Workflow Propagation and GitHub Enforcement

STATUS: PROPOSAL ONLY. NOT AUTHORIZED. DO NOT EXECUTE.

## Purpose
Propagate the independently reviewed hardened staging QA workflow to the target branches from which GitHub evaluates required status checks, then enable repository-level enforcement without changing NebraskaBeans product behavior.

## Proposed scope
- Copy the exact independently accepted `.github/workflows/staging-qa.yml` from the accepted recovery SHA to `main` and `gh-pages` without altering product files.
- Preserve the same pinned Node/npm control-plane validation behavior and exact-head check.
- Configure a GitHub branch/ruleset required status check for the `NebraskaBeans staging QA / verify` job on `main`, `gh-pages`, and `staging/**`.
- Block force pushes and deletion on protected targets.
- Require pull requests for `main`.
- Verify that an intentionally invalid control-plane candidate cannot merge when the required check fails.

## Preconditions
1. CONTROL-006 has been independently verified at an exact SHA.
2. GAJ explicitly authorizes CONTROL-007 and its target branches.
3. The workflow content to propagate is byte-identical to the independently accepted workflow.
4. No product, asset, map, yield-model, DNS, GoDaddy, or deployment-content changes are bundled with propagation.

## Proposed verification
- Record source recovery SHA and target branch SHAs before change.
- Compare workflow bytes before/after propagation.
- Confirm only the workflow path changes on each target branch.
- Confirm required status check appears and blocks a deliberately invalid test branch or PR.
- Record GitHub ruleset/branch-protection evidence separately from repository files.

## Explicit non-authorization
This proposal does not authorize writes to `main`, `gh-pages`, production, DNS, GoDaddy, or any product file. Execution requires a new explicit GAJ gate authorization.
