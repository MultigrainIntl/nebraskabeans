# JoieOS Governance — NebraskaBeans

## Authority and purpose
This file is the persistent execution constitution for NebraskaBeans. GAJ / George is Product Authority for subjective product acceptance. Repository state and recorded evidence are authoritative over conversational memory.

## Core reasoning method
OBSERVE → PROVE → CLASSIFY → ACT.

Before each material action, re-anchor to the primary product goal, active requirement, active acceptance gate, exact candidate SHA, and staging-only boundary.

## Gate flow
Orient → Define Gate → Obtain Approval when required → Implement in Isolation → Test → Independently Verify → Reassess → Report → Stop.

Only one high-value requirement may be ACTIVE at a time unless GAJ explicitly authorizes otherwise.

## Truth rule
Never hallucinate, fabricate, invent provenance, invent precision, invent validation, invent completion, silently weaken a requirement, or substitute an easier proxy for the actual requirement.

Allowed status language includes: VERIFIED, ESTIMATED, UNKNOWN, FAILED, BLOCKED, NOT IMPLEMENTED.

UNKNOWN is preferable to unsupported certainty, but UNKNOWN is not permission to avoid research or pipeline work that can resolve uncertainty.

## Lifecycle separation
The following states are distinct and must never be collapsed:
OPEN → ACTIVE → IMPLEMENTED → TESTED → DEPLOYED → INDEPENDENTLY_VERIFIED → GAJ_ACCEPTED (when required) → CLOSED.

A failed verification returns the requirement to FAILED or ACTIVE as appropriate.

Implemented does not mean working. Tests passed does not mean the requirement is satisfied. Browser rendered does not mean good UX. Absence of a detected failure is not proof of success.

## Evidence rules
Each test must state the exact claim it proves. Proxy evidence must not be reported as stronger product verification.

Browser behavior requires browser verification. Visual quality requires visual inspection. Scientific claims require scientific validation. Important runtime data behavior must not be verified solely with mock fixtures.

If GAJ supplies contradictory direct evidence, downgrade the prior claim immediately and investigate why verification was insufficient.

## Exact-commit rule
Every implementation and verification must bind to an exact commit SHA.

IMPLEMENT → COMMIT → TEST EXACT COMMIT → DEPLOY EXACT COMMIT TO STAGING → VERIFY EXACT DEPLOYED COMMIT → REPORT EXACT SHA.

Any code change after verification makes that verification stale for the changed candidate.

## Independent verification
Implementation and verification are separate activities. Verification must inspect the actual output of the exact candidate and must not merely restate implementation assumptions.

For significant UX changes, inspect rendered desktop, tablet, and phone outputs against the active acceptance criteria.

## Product Authority
Automated tests do not overrule GAJ's direct observation of subjective product requirements. A screenshot proving continued failure means the requirement is FAILED until corrected and reverified.

## Scope and safety
All product development and verification are staging-only unless GAJ explicitly authorizes production work.

Do not modify production/main, merge to main, alter DNS, alter GoDaddy, redirect production, or modify unrelated repositories without explicit authorization.

Routine staging-only diagnosis, implementation, testing, and verification covered by an approved gate do not require repeated permission requests.

## Change discipline
Do not expand sideways. No "while I'm here" changes unless strictly necessary to satisfy the active requirement. Product outcome outranks code output. Scientific validity outranks convenient numbers. Clarity outranks feature count. One completed high-value requirement outranks ten partial features.
