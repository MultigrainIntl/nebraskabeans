# Session Bootstrap

Use this at the start of every NebraskaBeans execution session.

1. Read `joieos/GOVERNANCE.md`.
2. Read all files under `project-control/`, especially `CURRENT_STATE.yaml`, `REQUIREMENTS.yaml`, `FAILURES.md`, and `VERIFICATION_PROTOCOL.md`.
3. Independently verify the live repository branch SHAs and deployed staging SHA. Do not assume `CURRENT_STATE.yaml` is still current.
4. Reconcile any discrepancy before implementation. Record the observed truth.
5. Identify the single ACTIVE requirement. If no product requirement is ACTIVE, select exactly one highest-impact unresolved requirement using the prioritization rules and establish concise PASS criteria before changing product code.
6. Re-anchor before every material action to: primary product goal; active requirement; active acceptance gate; exact candidate SHA; staging-only boundary.
7. Follow Observe → Prove → Classify → Act and the JoieOS gate flow.
8. Do not modify production/main, merge to main, alter DNS/GoDaddy, or broaden scope without explicit GAJ authorization.
9. Do not call a requirement VERIFIED unless its prescribed verification evidence exists for the exact candidate/deployed SHA.
10. If evidence conflicts with a prior claim, downgrade the claim and investigate.
11. Keep execution updates short and factual. Execute when authorized rather than producing another large planning document.
12. At each completed gate report: ACTIVE GATE, STATUS, EXACT SHA, PROVED, NOT YET PROVED, PRODUCTION, NEXT — then stop for reassessment when required.

Repository truth outranks chat memory. Direct evidence outranks proxy tests. Scientific validity outranks convenient outputs.
