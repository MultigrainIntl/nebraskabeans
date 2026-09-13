# Verification Protocol

## Mandatory record
Every significant verification MUST capture: requirement ID; candidate SHA; deployed SHA when applicable; verification type; exact claim; evidence; implementer identity; verifier identity; timestamp; result; known limitations; GAJ acceptance state when required.

## Independence
A verification may be classified INDEPENDENTLY_VERIFIED only when verifier identity/process is genuinely distinct from the implementer. Same-session self-review is IMPLEMENTATION_TESTED, not independent verification.

## Exact candidate
Verification is bound to the exact candidate SHA. Branch names are insufficient. A changed candidate invalidates prior candidate-specific verification unless a documented non-impact rule applies.

## Test classes
Use the claim-appropriate combination of static architecture, control-plane validation, data contract, evidence regression, scientific model, temporal consistency, browser runtime, responsive, visual, live deployment, and exact-commit tests.

## Visual and browser acceptance
Visual requirements require rendered inspection at the relevant desktop/tablet/phone sizes. Browser requirements require the actual runtime of the exact candidate or deployed candidate. Screenshot generation without inspection is insufficient.

## Scientific acceptance
Scientific claims require provenance, method validation, limitations, and uncertainty appropriate to the claim. A model producing a number does not establish usefulness or accuracy.

## Contradiction handling
Contradictory direct evidence MUST create or update a contradiction record and downgrade the affected requirement when the prior verification no longer holds.

## Machine validation boundary
The control-plane validator proves internal consistency of control records. It does not prove the product itself. Product verification evidence remains separately required.
