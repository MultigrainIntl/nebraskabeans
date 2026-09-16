# Product Authority Decision Queue

Only George / GAJ may decide the items in this file. Unanswered decisions do not stop
safe W01/W02 foundation work.

| ID | Decision | Recommendation | Consequence if not approved | Status |
|---|---|---|---|---|
| D-001 | Approve production-domain/DNS cutover when M4 passes | Do not approve before W15 and two scheduled refreshes | GitHub Pages remains staging; production GoDaddy site is unchanged | `BLOCKED` pending later Product Authority review |
| D-002 | Approve recurring paid compute/storage if free GitHub Actions and public artifacts cannot support raster builds | First benchmark a bounded free Actions pipeline; return with measured cost/limits | Heavy CDL/HLS/SMAP automation may remain blocked | `NOT IMPLEMENTED` — no spend requested yet |
| D-003 | Choose final public commercial-contact integration and privacy terms | Defer until crop-intelligence M3 and separate private-data design | Staging RFQ/seller forms remain explicitly inactive | `DEFERRED — PRODUCT AUTHORITY` |
| D-004 | Allow search engines to index the site | Index `index.html` and `about.html` only; keep the six draft pages hidden | Site stays invisible to search and is reachable only by a link sent directly | `APPROVED — GAJ, 16 September 2026` |

No scope reduction, substitute source, production change, or non-zero cost has been
approved by inference.

## D-004, in full

GAJ asked what was stopping the site being found, was told it was set to hide from search,
and answered YES to turning that off. What that authorised, precisely:

- `index.html` and `about.html` may be indexed. Both are finished and were rewritten in
  plain language first.
- `bean.html`, `commercial.html`, `methodology.html`, `privacy.html`, `reports.html` and
  `resources.html` stay hidden. They are drafts. `methodology.html` still describes the
  yield model that was withdrawn, so it contradicts the live site, and `commercial.html`
  states on its face that its own form is not configured. Either one, found in a search
  result, costs more credibility than the site gains from being found at all.
- `robots.txt` now allows crawling everywhere ON PURPOSE. A page blocked there is never
  fetched, so its `noindex` is never read, and a bare URL can still be listed. Letting the
  crawler in is what makes `noindex` work.

This reverses the staging-era posture recorded in `robots.txt` ("Product Authority must
approve production indexing"). That approval is this row.
