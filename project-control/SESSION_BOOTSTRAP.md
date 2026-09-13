# Session Bootstrap

At the start of every NebraskaBeans execution session:

1. Read `joieos/GOVERNANCE.md`, `joieos/CONTROL_SCHEMA.yaml`, and `joieos/STATE_MACHINE.yaml`.
2. Read `project-control/PROJECT.yaml`, `CURRENT_STATE.yaml`, `REQUIREMENTS.yaml`, `EXECUTION_LOCK.yaml`, and `VERIFICATION_PROTOCOL.md`.
3. Resolve live Git SHAs for `main`, `staging/recover-5fa3f42`, and `gh-pages`. Do not treat recorded branch SHAs as current without checking.
4. Run `node scripts/validate-control-plane.mjs` before any implementation. Any non-zero exit or control inconsistency is blocking.
5. Confirm exactly one ACTIVE gate exists and matches `EXECUTION_LOCK.yaml`.
6. Do not autonomously activate a different material gate. You may recommend the next gate; activation requires existing durable authority or GAJ authorization.
7. Re-anchor every material action to the active gate, exact live candidate SHA, authorized scope, and staging-only boundary.
8. Use Observe → Prove → Classify → Act and the JoieOS gate flow.
9. Never modify `main`, `gh-pages`, production, DNS, or GoDaddy unless the current explicit authorization allows it.
10. Do not call same-actor testing independent verification. Use IMPLEMENTATION_TESTED until a genuinely separate verifier/process reviews the exact candidate.
11. Read any YAML records under `project-control/contradictions/`; unresolved contradictions override stale verification/acceptance.
12. Canonical requirement status is only `project-control/REQUIREMENTS.yaml`; do not recreate a hand-maintained duplicate failure ledger.
13. Report completed gates with ACTIVE GATE, STATUS, EXACT SHA, PROVED, NOT YET PROVED, PRODUCTION, NEXT, then stop when the gate requires reassessment.

Repository truth outranks chat memory. Exact evidence outranks proxy evidence. Passing governance checks does not substitute for product verification.
