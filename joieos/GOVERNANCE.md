# JoieOS Governance — NebraskaBeans

## Authority
GAJ / George is Product Authority. Repository state and durable evidence outrank conversational memory. Current explicit GAJ authorization outranks stale prior authorization when scopes conflict.

## Core method
OBSERVE → PROVE → CLASSIFY → ACT.

Gate flow: Orient → Define Gate → Obtain Approval when required → Implement in Isolation → Test → Independently Verify → Reassess → Report → Stop.

Exactly one material gate may be ACTIVE unless GAJ explicitly authorizes parallel gates.

## Mandatory truth rules
Never fabricate provenance, precision, validation, completion, approval, deployment, verifier independence, or scientific confidence. Never silently weaken acceptance criteria or substitute an easier proxy for the actual requirement.

Allowed factual classifications are VERIFIED only when independently verified under this control system, IMPLEMENTATION_TESTED for same-actor testing, ESTIMATED, UNKNOWN, FAILED, BLOCKED, and NOT IMPLEMENTED as context requires.

## Canonical precedence
`joieos/CONTROL_SCHEMA.yaml` is the single machine-readable precedence authority. The same order is reproduced here for humans:

1. Current explicit GAJ authorization.
2. JoieOS governance and its machine-readable schema/state machine.
3. Live repository truth and exact Git SHAs.
4. Canonical requirement records in `project-control/REQUIREMENTS.yaml`.
5. `project-control/CURRENT_STATE.yaml` after reconciliation with live Git and requirements.
6. SHA-bound approval records.
7. SHA-bound verification records.
8. Contradiction and decision records.
9. Generated or non-authoritative human summaries.
10. Chat history.

`PROJECT.yaml` may identify which file owns a particular field (for example requirement status), but it does not define a competing precedence order.

If sources conflict, do not choose the convenient one. Reconcile the conflict before product implementation.

## Lifecycle
OPEN → ACTIVE → IMPLEMENTED → IMPLEMENTATION_TESTED → DEPLOYED when applicable → INDEPENDENTLY_VERIFIED → GAJ_ACCEPTED when required → CLOSED.

FAILED and BLOCKED are explicit states. Direct contradictory evidence may reopen a previously accepted or closed subjective requirement.

Implemented does not mean working. Same-actor tests do not equal independent verification. Browser rendering does not equal acceptable UX. Absence of a detected failure is not proof of success.

## Exact-commit discipline
Implementation, testing, deployment, verification, and acceptance MUST be SHA-bound whenever a candidate commit exists.

Branch names never substitute for commit SHAs. Live Git HEAD MUST be resolved at session start. A repository file MUST NOT claim to contain the SHA of its own containing commit; self-referential SHA fields are prohibited. Instead record prior anchors and resolve current HEAD live.

Any changed candidate SHA invalidates prior candidate-specific verification and acceptance unless a recorded rule explicitly proves the changed files cannot affect the verified claim.

## Verification
Every significant verification MUST record requirement ID, candidate SHA, deployed SHA when applicable, exact claim, verification type, evidence, verifier identity, timestamp, result, limitations, and GAJ acceptance state where required.

Independent verification MUST NOT use the same actor identity as implementation. Merely writing a different label does not prove independence; the record must identify the actual verifier/process used.

Visual requirements require visual inspection. Browser behavior requires browser verification. Scientific claims require scientific validation and provenance. Mock fixtures cannot prove live-data behavior unless the active claim is specifically about fixture handling.

If GAJ provides direct evidence contradicting a subjective VERIFIED claim, downgrade it immediately and investigate the verification failure.

## Approval
Approval records MUST preserve exact authorized scope. When a candidate SHA exists and the approval is candidate-specific, the approval MUST bind that SHA. An approval for one candidate or gate cannot be silently reused after material change.

## Scope and production safety
All development is staging-only unless GAJ explicitly authorizes production. Do not modify main, production deployment, DNS, GoDaddy, or unrelated repositories without explicit authorization.

The current EXECUTION_LOCK.yaml is mandatory. Work outside its allow-list is prohibited; discoveries outside scope may be recorded but not implemented.

## Machine enforcement
The repository validator MUST fail closed on inconsistent active gates, missing gate definitions, mismatched execution locks, prohibited production scope, invalid verification transitions, same-actor independent verification, or malformed required control records.

Passing the validator proves control-file consistency only; it does not by itself prove product quality, scientific validity, browser behavior, or independent human judgment.
