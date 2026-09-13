# Verification Protocol

## Principle
Verification must prove the actual requirement for the exact candidate, not merely a convenient proxy.

## Verification record
Every important verification record should capture:
- requirement ID;
- candidate SHA;
- deployed SHA when applicable;
- verification type;
- exact claim tested;
- evidence location or description;
- verifier;
- timestamp;
- result;
- known limitations;
- GAJ acceptance state when required.

## Test classes
Use appropriate combinations of static architecture tests, data contract tests, evidence regression tests, scientific model tests, temporal consistency tests, browser runtime tests, responsive tests, visual tests, live deployment tests, and exact-commit tests.

## Visual acceptance
For significant UX work, inspect rendered desktop, tablet, and phone output against the active gate. Screenshot generation without inspection is insufficient.

## Browser acceptance
Browser behavior must be verified in the actual browser/runtime of the exact candidate or exact deployed candidate.

## Scientific acceptance
Scientific claims require provenance, method validation, limitations, and uncertainty appropriate to the claim. A model producing a number is not evidence that the number is useful.

## Failure handling
If a test or live verification fails, mark the active gate FAILED, record the exact requirement, observed failure, candidate SHA, and whether production is untouched. Diagnose before making unrelated changes.

## Staleness
Any code change after verification invalidates verification of the changed candidate. Verification is SHA-bound, not branch-name-bound.

## Product Authority contradiction
If GAJ presents direct evidence contradicting a verified subjective requirement, downgrade it immediately and record why prior verification was insufficient.
