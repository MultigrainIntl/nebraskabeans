# Constants and their sources

Every number here was once asserted from an AI model's own knowledge on 16 September 2026,
in a project whose standard is "no unsourced constants." GAJ ended that session over it.
Sources were located the same day and written in below.

`scripts/verify_data.py` fails the build while any row reads `none`.
Resolve a row by adding a real citation, or by deleting the claim that rests on it.
Never delete a row to clear the gate.

| id | value | where | what rests on it | source |
|---|---|---|---|---|
| NIGHT_HOT_F | 68 F (20.0 C) | `scripts/refresh/yield_index.py` | **LIVE.** Produces the finding that warm nights are nearly absent here (NE 0 in 9 of 10 years, CO 0 in 10), the published reason hot days show no yield effect | Porch & Jahn 2001, *Plant, Cell & Environment* 24:723-731; Cruz et al. 2023, *Front. Plant Sci.* 14:1145858 |
| CENSUS_IRRIGATED | 58.0M acres, 2017 | `scripts/verify_data.py` | The bound validating the MIrAD raster (58.7M, a 1.2% match) | USDA Census of Agriculture 2017; 54.9M in 2022 — USDA ERS Charts of Note 110247 / 115050 |
| CLEARSKY_MAX | Rso 32.4 MJ/m²/day at 41 N, 1,180 m | `scripts/verify_data.py` | The physical bound validating NASA POWER solar | FAO-56, Allen et al. 1998, eq. 21 and 37 (Ra = 41.90 at 41 N; Rso = 0.75 Ra) |
| MONTANA_LARGEST | 260,000 of 541,000 US acres | `scripts/refresh/yield_index.py` | **LIVE.** Justifies borrowing Montana's chickpea level | USDA *Acreage*, June 2025 |

## Open caveat — not a blocker, but do not lose it

`NIGHT_HOT_F` is sourced for **Phaseolus vulgaris only.** `season_biomass()` also applies it to
PEAS, CHICKPEAS and BLACKEYE (a cowpea, *Vigna unguiculata*), where no source covers it.
Decide whether to restrict the count to common bean.

## What was corrected, not just cited

- The irrigation bound was "55-58M", a vague range across census years. MIrAD-US v4 is a **2017**
  raster, so the correct comparison is the 2017 figure of 58.0M — a 1.2% match, a far stronger
  check than the range it replaced.
- The solar bound printed "about 31", which understates the real limit at Scotts Bluff's
  elevation. It is 32.4. The pass limit of 34 was already correct.
- The live page said Montana was the largest **dryland** chickpea state. "Largest" is provable;
  **"dryland" is not sourced by any published number** and did no work in the argument. Dropped.

## Why this file exists

An AI session asserted four numbers with the same confidence it used for figures it had actually
measured, so a reader could not tell which was which. A note in a transcript can be missed.
A failing build cannot.
