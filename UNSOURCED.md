# Constants asserted without a source

Every number here was stated from an AI model's own knowledge on 16 September 2026, not read
from a publication. They are probably roughly right. That is not the standard this project
holds itself to, and `scripts/verify_data.py` fails the build while any of them is unresolved.

Resolve one by replacing `source: none` with a real citation, or by deleting the claim that
rests on it. Do not simply delete a row.

**Status, 16 September 2026: all four resolved.** Three held up against the literature. One
was partly wrong and the wrong half has been removed from the site. One was not only unsourced
but factually off, and correcting it made the check it governs stronger rather than looser.
The rows below are kept, not deleted, so the record of what was asserted survives alongside
what was found.

| id | value | where | what rests on it | source |
|---|---|---|---|---|
| NIGHT_HOT_F | 68 F | scripts/refresh/yield_index.py | **LIVE ON THE SITE.** Produces the finding that warm nights are nearly absent here (NE 0 in 9 of 10 years, CO 0 in 10), which is the published explanation for hot days showing no yield effect. | **RESOLVED — see 1 below.** Porch & Jahn 2001, *Plant, Cell & Environment* 24:723–731 |
| CENSUS_IRRIGATED | 55–58 million acres | scripts/verify_data.py | The bound used to validate the MIrAD irrigation raster (58.7M) | **RESOLVED, AND THE VALUE WAS WRONG — see 2 below.** USDA Census 2017 / 2022 via USDA ERS |
| CLEARSKY_MAX | ~31 MJ/m2/day at 41N | scripts/verify_data.py | The physical bound used to validate NASA POWER solar | **RESOLVED — see 3 below.** FAO-56 (Allen et al. 1998), eq. 21 and 37 — derived, not asserted |
| MONTANA_LARGEST | "largest dryland chickpea state" | scripts/refresh/yield_index.py | **LIVE ON THE SITE.** The stated justification for borrowing Montana's chickpea yield level. (The supporting 3% pea check IS real and parsed from USDA; this claim is not.) | **HALF RESOLVED — see 4 below.** "Largest" sourced to USDA *Acreage*, June 2025. **"Dryland" was never sourced and has been cut from the live text.** |

---

## 1. NIGHT_HOT_F = 68 °F — holds, and holds exactly

68 °F is 20.0 °C, and 20 °C is the published threshold rather than a round number that happens
to look like one.

- **Porch, T.G. & Jahn, M. (2001).** "Effects of high-temperature stress on microsporogenesis in
  heat-sensitive and heat-tolerant genotypes of *Phaseolus vulgaris*." *Plant, Cell &
  Environment* 24:723–731. Day above 30 °C and **night above 20 °C** give significant yield
  reduction in common bean.
- **Cruz, S. et al. (2023).** *Frontiers in Plant Science* 14:1145858,
  doi:10.3389/fpls.2023.1145858 — "Common bean reproductive development is strongly affected by
  heat stress, particularly overnight temperatures above 20 °C," citing Porch & Jahn for it.
- Corroborated across later reviews of reproductive-stage heat stress in common bean, which
  attribute the loss to pollen failure and pod abortion when the crop gets no relief after dark.

**Limit of that source, and a new open item.** The threshold is for *Phaseolus vulgaris*: pinto,
great northern, navy, black, kidney, small red, cranberry, small white. It does **not** cover
peas, chickpeas or blackeye (cowpea). `season_biomass()` in `scripts/refresh/yield_index.py`
counts warm nights for those three crops on the same 20 °C line, which no source supports. The
count is published as a count and is not subtracted from any yield, so no pounds-per-acre figure
depends on it — but the warm-night figure shown for peas and chickpeas is a bean's threshold
wearing a pulse's name. **Do not build a claim about pea or chickpea nights on it.**

## 2. CENSUS_IRRIGATED — sourced, and the old value was wrong at both ends

"55–58 million" was not what USDA reports. The published figures:

| Census year | US irrigated acres |
|---|---|
| 2017 | **58.0 million** — a record high |
| 2022 | **54.9 million** |

Source: USDA Economic Research Service, Charts of Note
[110247](https://www.ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=110247) and
[115050](https://www.ers.usda.gov/data-products/charts-of-note/115050), both drawing on the
USDA Census of Agriculture.

**The correction improves the check rather than merely citing it.** A range spanning two
censuses was the wrong comparison to make in the first place. MIrAD-US v4 is a **2017** raster,
so it belongs against the 2017 census year and nothing else. That turns a vague band into a real
measurement: **58.7M mapped against 58.0M counted, agreement to 1.2%.** `verify_data.py` now
tests against the 2017 figure with a 10% tolerance, which is generous for a 250 m raster scored
against a farm-by-farm census, and far tighter than the 45M–70M it used to accept.

## 3. CLEARSKY_MAX — derived, not asserted

This one never needed a citation for a *value*; it needed the method, because the number falls
out of it. From **Allen, R.G., Pereira, L.S., Raes, D. & Smith, M. (1998), "Crop
evapotranspiration — guidelines for computing crop water requirements", FAO Irrigation and
Drainage Paper 56**:

```
Ra  = (24*60/pi) * Gsc * dr * (ws*sin(lat)*sin(dec) + cos(lat)*cos(dec)*sin(ws))   eq. 21
Rso = (0.75 + 2e-5 * elevation_m) * Ra                                             eq. 37
```

At 41 °N, `Ra` peaks at **41.90 MJ/m²/day** on 21 June (day 171), giving `Rso` = 31.4 at sea
level. But these regions are neither at sea level nor all at 41 °N — they run from nw-kansas at
39.1 °N to big-horn at 44.35 °N, on ground from roughly 1,200 m to 1,800 m. Thinner air passes
more light, so the ceiling **rises** with elevation:

| | Clear-sky limit `Rso` |
|---|---|
| Sea level, 41 °N | 31.4 MJ/m²/day |
| 1,200 m | 32.4 MJ/m²/day |
| **1,800 m (western Colorado)** | **32.9 MJ/m²/day** |

The old comment's "about 31" was the **sea-level** figure quoted for regions a mile up,
understating the true ceiling by about 1.5 MJ.

**This mattered.** Checked region by region against the shipped data, every observed peak sits
under its own bound — but the highest, western-colorado at **32.5**, is *above* the 31 the old
comment claimed and *below* the 32.9 its elevation actually allows. The stale number would have
made real, correct data look like an exceedance to anyone who read the check and did the
comparison by hand.

The pass limit of 34 was and remains correct: it clears the real ceiling everywhere in the
region set while still catching the only thing this test is for, a unit error.

## 4. MONTANA_LARGEST — "largest" is sourced, "dryland" is cut

**"Largest chickpea state" is provable.** USDA NASS *State Agriculture Overview*, 2025, read
state by state from USDA's own pages — chickpea acres **planted**:

| State | 2025 planted acres | Share of US |
|---|---|---|
| **Montana** | **260,000** | **48.5%** |
| Washington | 141,000 | 26.3% |
| Idaho | 98,000 | 18.3% |
| North Dakota | 37,000 | 6.9% |
| **US total** | **536,000** | |

NASS estimates chickpeas in those four states only — California has no chickpea row at all —
so the four are the whole programme. Montana is first by a factor of 1.8 over second place.

**A correction to this file's own first draft.** This section originally cited the June 2025
*Acreage* report (ISSN 1949-1522) and gave the US total as **541,000**, with Washington
144,000, Idaho 99,000 and North Dakota 38,000. Those are **planting intentions**, and USDA's
state overviews have since revised every one of them down. 541,000 briefly went onto the live
site inside the replacement sentence — an unsourced claim swapped for a stale one, which is
not an improvement.

The reader-facing sentence now quotes Montana against **Washington** rather than against a
national total, so it stands on two figures read directly off USDA pages and needs no
arithmetic of ours. **Do not reintroduce 541,000.**

**"Dryland" is not sourced and has been removed from the live text.** Montana chickpea really is
grown almost entirely without irrigation — MSU Extension MontGuide MT201703AG (McVay, Jha &
Crutcher, rev. 2017) bases the state's entire yield expectation on dryland variety trials and
treats irrigated production as a marginal prospect — but **no agency publishes the
irrigated-versus-dryland split for chickpeas**, so no number backs the word.

It also did no work. The justification for borrowing Montana's chickpea level rests on the pea
check — dry peas published in **both** states at Montana 1,528 and Nebraska 1,579 lb/ac, within
3%, parsed from USDA — not on how the ground is watered. Cutting the word costs the argument
nothing and removes the last unsourced assertion from a live page.

Changed in `scripts/refresh/yield_index.py`, and in the four copies each in
`assets/data/yield-index-2026.json` and `assets/data/region-answers.json` that carry the live
wording.

## Why this file exists

An AI session asserted these four numbers with the same confidence it used for figures it had
actually measured, so a reader could not tell which was which. The user ended that session over
it. A note in a transcript can be missed; a failing build cannot.

**What the exercise was worth, now that it has been done.** Three of the four were right, which
is roughly what "probably roughly right" predicted. The fourth was wrong, and it was the one
nobody would have caught by reading, because a number used only as an internal sanity bound is
never read by anyone. Sourcing it did not just add a footnote — it replaced a 45M–70M band that
could not fail with a 1.2% agreement that can. That is the argument for the rule.
