# Constants asserted without a source

Every number here was stated from an AI model's own knowledge on 16 September 2026, not read
from a publication. They are probably roughly right. That is not the standard this project
holds itself to, and `scripts/verify_data.py` fails the build while any of them is unresolved.

Resolve one by replacing `source: none` with a real citation, or by deleting the claim that
rests on it. Do not simply delete a row.

| id | value | where | what rests on it | source |
|---|---|---|---|---|
| NIGHT_HOT_F | 68 F | scripts/refresh/yield_index.py | **LIVE ON THE SITE.** Produces the finding that warm nights are nearly absent here (NE 0 in 9 of 10 years, CO 0 in 10), which is the published explanation for hot days showing no yield effect. If this threshold is wrong the conclusion may be wrong. | none |
| CENSUS_IRRIGATED | 55-58 million acres | scripts/verify_data.py | The bound used to validate the MIrAD irrigation raster (58.7M) | none |
| CLEARSKY_MAX | ~31 MJ/m2/day at 41N | scripts/verify_data.py | The physical bound used to validate NASA POWER solar | none |
| MONTANA_LARGEST | "largest dryland chickpea state" | scripts/refresh/yield_index.py | **LIVE ON THE SITE.** The stated justification for borrowing Montana's chickpea yield level. (The supporting 3% pea check IS real and parsed from USDA; this claim is not.) | none |

## Why this file exists

An AI session asserted these four numbers with the same confidence it used for figures it had
actually measured, so a reader could not tell which was which. The user ended that session over
it. A note in a transcript can be missed; a failing build cannot.
