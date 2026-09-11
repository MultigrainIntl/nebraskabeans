# Verification Ledger

| Date | Object | Identity | Check | Result | Status |
|---|---|---|---|---|---|
| 2026-09-11 | deployed staging | `gh-pages@4fd1e43e9f6d50c9db2b7250702f914f8f1505f3` | direct browser load, county service, official-history rendering, controls | Loads; controls respond; incomplete layers remain explicit | `VERIFIED` runtime, `PARTIAL` product |
| 2026-09-11 | temporal model | same baseline | issue-time filtering, revisions, interpolation, missing data | 6/6 tests passed | `VERIFIED` engineering behavior |
| 2026-09-11 | evidence store | same baseline | unknown-value rejection, immutability, revisions, disagreement, confidence | 5/5 tests passed; vocabulary/confidence model violates new contract | `PARTIAL` |
| 2026-09-11 | NASS 2026 baseline | named official PDFs | cross-check report tables and units | March, June, and August values matched | `VERIFIED` transcription sample |
| 2026-09-11 | secondary pages | same baseline | static dependency scan | six pages reference deleted `assets/site.js` | `VERIFIED` defect |
| 2026-09-11 | foundation candidate | `staging/foundation-recovery-20260911@59bb4ed0e5835a5609073a56a04584a6a573420e` | contract/build validation, unit tests, Chromium desktop/mobile and secondary-page interactions | GitHub Actions run 34634130657 passed | `VERIFIED` engineering package |
| 2026-09-11 | deployed foundation | `gh-pages@59bb4ed0e5835a5609073a56a04584a6a573420e`, data `nbd-v1-4f971a6e9bd6b3247524` | Pages build, deployed-URL browser suite, separate direct browser load and converter interaction | Pages run 34634219155 and QA run 34634220389 passed | `VERIFIED` staging deployment; product remains `PARTIAL` |

Independent scientific/model verification has not occurred. Engineering checks do not
substitute for it.
