# Verification Protocol

## Status boundary
`IMPLEMENTATION_TESTED` is same-actor implementation testing only. It is not independent verification.

`INDEPENDENTLY_VERIFIED` requires a resolvable verification record for the exact candidate SHA, with a verifier distinct from the implementer under the repository identity-normalization rules.

## Mandatory verification record fields
Every independent verification record MUST contain:
- `id`
- `requirement`
- `candidate_sha`
- `result`
- `verifier`
- `implementer`
- `identity_provenance`
- `timestamp`
- `evidence`
- `limitations`

The candidate SHA must be a full 40-character lowercase Git commit SHA, must exist in the repository, and must equal the requirement's current candidate SHA.

## Identity tripwire, not proof
The validator normalizes obvious aliases case-insensitively. `chatgpt`, `ChatGPT`, `gpt-*`, and `openai-*` are treated as the same OpenAI/ChatGPT actor family for the purpose of preventing trivial same-actor self-verification.

This is a **tripwire, not proof of independence**. A different string, model name, session name, or account label does not itself establish genuine independence. `identity_provenance` must state how the verifier identity was established, and Product Authority may reject a claimed independence relationship even when the automated tripwire passes.

## Exact-SHA discipline
Verification belongs only to the exact candidate SHA named in the record. If the candidate changes, the verification becomes stale unless an explicit, recorded non-impact rule proves the change cannot affect the verified claim. A stale candidate may not remain `INDEPENDENTLY_VERIFIED`, `GAJ_ACCEPTED`, or `CLOSED`.

## GAJ acceptance
GAJ acceptance is separate from independent verification. The control plane may record acceptance only from an actual GAJ authorization/acceptance source; the implementing agent may not create acceptance on GAJ's behalf.

## Contradictory evidence
An unresolved contradiction for a requirement invalidates `INDEPENDENTLY_VERIFIED`, `GAJ_ACCEPTED`, and `CLOSED` until the contradiction is resolved and recorded.

## Enforcement levels
Passing `scripts/validate-control-plane.mjs` proves control-file consistency only. It does not prove browser behavior, scientific validity, product quality, or genuine human/model independence beyond the identity tripwire described above.
