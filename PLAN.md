# Global crop yield and health tool — complete specification and build plan

Written 16 September 2026. Owner: George A. Jibilian (GAJ). Plan of record for
NebraskaBeans.com and the BeanYield.com engine it becomes.

Every stage has a test an outsider can run that **can fail**. A stage is finished when its test
passes on data the model has never seen — not when the code runs.

---

# PART I — THE STANDARD

## 1.1 What this is

A tool that reports how a crop is doing **now**, anywhere it grows, from satellite and public
weather only, and states how much confidence the reader should place in it.

Official yield figures arrive after harvest, when the decisions are finished. Satellites see
the crop weekly while there is still time to irrigate, cut, or sell.

## 1.2 Four rules that cannot be broken

**R1 — This season's harvest data never reaches the estimate.**
Harvest grades the model; it never builds it. Once truth feeds the forecast, nobody can measure
whether the forecast worked, and a July number quietly becomes a report on a finished season.
*Enforced: `tests/verify_truth_firewall.py` — fails the build if any yield script gains a read
path to harvest reports, the prediction ledger, or the scorecard, or if scoring runs before the
prediction it grades.*
*Permitted exception: seasons that finished before the current one opened. Those were knowable
on the day the prediction was made.*

**R2 — Every published number carries its sourcing level.**
- `published` — the official agency publishes this figure for this crop in this place
- `proxy` — borrowed from a named comparable place, with the reason and the evidence stored
  alongside it
- `none` — no number is published at all
*Enforced: `scripts/verify_data.py` fails if a figure has no level, and fails if a proxy has no
justification — so a borrowed number can never lose its disclaimer.*

**R3 — No constant may be asserted without a citation.**
*Enforced: `UNSOURCED.md` plus its gate. All four constants were cited on 16 Sep 2026; the
gate fails the build if any row ever returns to `none`.*

**R4 — A difference the sensor cannot see must not be invented.**
*Learned: bean class differences were modelled from unsourced constants and came out 9.9
percentage points wrong on average, and backwards in Wyoming.*

## 1.3 What is already known to fail

Any plan that ignores this repeats it.

| Test | Date | Result |
|---|---|---|
| Weather features vs trend, 88 state-years, ablated, bootstrapped by held-out year | 15 Sep 2026 | **No skill** for pinto, Great Northern, navy, black, either kidney |
| Satellite NDVI on CDL bean cells, acreage-weighted, 4 states, 2000–2025 | 15 Sep 2026 | **0 of 4 states beat their own trend** |
| Published "8.5% better than guessing" | — | A straight line through 26 years of rising yields. Trend, not skill |
| Hot days vs yield, 28 state-years | 16 Sep 2026 | r²=0.025, t=+0.81 — nothing, sign positive |
| Hot days vs abandoned acres, 19 state-years | 16 Sep 2026 | r²=0.031, t=−0.74 — nothing |

**Prime suspect for the failures: irrigation.** You cannot predict an irrigated yield from
rainfall. Irrigation became measurable on 16 September 2026 and has never been tested as a
feature.

**Current honest position: this tool measures well and has never demonstrated predictive
skill.**

---

# PART II — DATA

## 2.1 Every dataset, with its access and its check

| Layer | Source | Endpoint | Resolution | Key? | Independent check |
|---|---|---|---|---|---|
| Greenness | USDA Crop-CASMA NDVI | `nassgeodata.gmu.edu` WCS, EPSG:5070 | 250 m, daily, 2000– | No | 8-bit values 0–255; ranks known drought years (2012–13 lowest at Scotts Bluff, 2023 highest) |
| Greenness (target) | NASA HLS (Landsat+Sentinel-2) | `cmr.earthdata.nasa.gov` | 30 m, 2–3 day | **Login** | Must agree with Crop-CASMA on the same ground within a stated tolerance |
| Crop location | USDA Cropland Data Layer | `nassgeodata.gmu.edu` CDLService | 30 m, annual | No | Derived acreage reconciles to USDA planted acreage (chickpeas: 20,072 mapped vs 20,423 published) |
| Crop location (global) | ESA WorldCereal | — | 10 m | No | Same reconciliation against national statistics |
| Sunlight | NASA POWER `ALLSKY_SFC_SW_DWN` | `power.larc.nasa.gov/api/temporal/daily/point` | ~50 km, daily, global | No | Below clear-sky limit for latitude; mean 22.7 MJ/m²/day observed |
| Temperature, rain | RCC-ACIS (NOAA co-op + GHCN) | `data.rcc-acis.org` | Station, daily | No | **One fixed station per region for all years** — a rotating station made one July 20 °F colder than neighbours |
| Land surface temp | NASA MOD11A2 | `modis.ornl.gov/rst/api/v1` | 1 km, 8-day | No | Physically possible range |
| Soil moisture | NASA SMAP L4 | `cloud.csiss.gmu.edu/smap_server` | 9 km | No | Direction agrees with rainfall anomaly |
| Irrigation | USGS MIrAD-US v4 | `sciencebase.gov/catalog/item/5db08e84e4b0b0c58b56e04f` | 250 m, 2017 | No | CONUS total 58.7M acres vs USDA Census 55–58M |
| Water use (target) | OpenET / Landsat | — | 30 m | Varies | ETa/ETp cross-checked against rainfall in dryland areas |
| Soil (target) | gNATSGO / SoilGrids | — | 30 m / 250 m | No | Available water capacity within published ranges |
| Yield truth | USDA NASS Crop Production Annual Summary | `esmis.nal.usda.gov/publication/crop-production-annual-summary` | State + class, annual | No | US totals reconcile across tables |
| Yield truth (county) | USDA NASS county yields | QuickStats | County, 1942–2016 | **Key** | 14,482 dry bean county-years |

## 2.2 Projections — getting this wrong silently ruins everything

| Product | Projection | Note |
|---|---|---|
| Crop-CASMA, CDL | EPSG:5070 Albers Equal Area, **metres** | Was recorded as "broken — wrong projection." It is metres, not degrees |
| MIrAD-US | US National Atlas Equal Area (Lambert azimuthal), centre 100 °W 45 °N, **sphere R = 6,370,997 m** | NOT Albers. Using Albers here misplaces every sample by tens of km while still producing plausible percentages |

## 2.3 Reading USDA's marks

| Mark | Meaning |
|---|---|
| number | Published |
| `(D)` | **GROWN.** Withheld because too few operations report it. **Presence, not absence** |
| `(NA)` | Not estimated in the current programme |
| `-` | None grown — the only mark meaning the crop is absent |

*Reading `(D)` as absence deleted dark red kidney, small red, cranberry and blackeye from a site
covering the counties where they are grown.*

## 2.4 Release calendar

| Report | Timing | Carries |
|---|---|---|
| Prospective Plantings | Late March | Intentions, total dry beans, no class split |
| Acreage | Late June | Planted acres, total |
| Crop Production | Monthly Aug–Nov | Yield forecasts, revised acreage |
| **Annual Summary** | **January** | **FINAL, and the only report with the class split** |

The current season's class mix is unknown until after harvest. The most recent complete year is
the honest basis for which classes to offer.

---

# PART III — FORMULAS

## 3.1 Growing degree days

```
GDD_day = max( (Tmax_F + Tmin_F)/2 − T_base , 0 )
```
`T_base` = 50 °F dry beans, 41 °F peas and chickpeas.
Growth stage = cumulative GDD ÷ GDD required for maturity.

## 3.2 Light interception

```
NDVI      = (DN − 125) / 125                      # Crop-CASMA documented 8-bit scaling
fAPAR     = clamp( 1.24 × NDVI − 0.168 , 0 , 0.95 )   # Myneni & Williams (1994)
APAR_day  = Solar_MJ × 0.48 × fAPAR                # 0.48 = PAR fraction of shortwave
```
**Known weakness:** the fAPAR relation is for general vegetation, not dry beans on the western
High Plains, and NDVI saturates in dense canopy so a linear form overstates late-season
interception. This is the step an independent review named as invalidating everything
downstream.

## 3.3 Temperature response

```
T_mean_C = ((Tmax_F + Tmin_F)/2 − 32) / 1.8
tstress  = 0                              if T ≤ 10 °C
         = (T − 10) / 14                   if 10 < T ≤ 24 °C
         = max(0, (40 − T) / 16)           if T > 24 °C
```
Conventional cardinal-temperature curve. **No separate heat penalty is applied.** One was added
15 September 2026 and removed: its shape had no source and it accounted for roughly half of a
20-point disagreement with observed canopy.

## 3.4 Biomass and yield

```
ΔBiomass_day = RUE × APAR_day × tstress
Yield        = Biomass_at_maturity × HarvestIndex
```

## 3.5 Water — current, and what it must become

**Current (and explicitly ruled out by the approved design):**
```
ET0   = Hargreaves(Tmax, Tmin, latitude, day-of-year)
ETc   = Kc(stage) × ET0                                  # FAO-56 form
balance = Σ rainfall − Σ ETc
Kc(p) = 0.15                     p ≤ 0
        0.30 + (p/0.25)×0.35     p < 0.25
        0.65 + ((p−0.25)/0.30)×0.50   p < 0.55
        1.15                     p < 0.85
        max(0.45, 1.15 − (p−0.85)×2.0)  otherwise
```
**Required:**
```
WaterStress = ETa / ETp     (measured, from OpenET/Landsat)
```
**This is a known defect, not a design choice.** Rainfall minus reference ET cannot see
irrigation, and irrigation is the prime suspect for why the model has no skill.

## 3.6 Canopy water stress index (defined, not yet in the yield path)

```
wstress = clamp( 1 − (T_canopy − T_air − 1) / 7 , 0 , 1 )
```

## 3.7 Season index — the part that works

```
index  = Biomass_model(this season) / mean( Biomass_model(2015…2025) )
Yield  = index × PublishedYieldLevel(class, state)
```
Running the **same** model over history and over now makes uncalibrated constants divide out.
What survives is the measured part: light intercepted, heat accumulated, water balance.

**One index per commodity per region**, shared across its classes — USDA maps one dry bean crop,
so every class is read off identical pixels and any class-to-class difference in the index came
from unsourced constants (R4).

## 3.8 Class levels

```
Level(class, state) = mean of USDA published yield, that class, that state, last 10 years
```
If USDA does not publish it, use a named proxy state **whose transfer can be demonstrated**.
*Chickpeas use Montana. Evidence: dry peas are published in both Montana (1,528 lb/ac) and
Nebraska (1,579) — within 3%.*
If neither exists: publish no pounds.

## 3.9 Class agronomy constants — ALL UNSOURCED, see R3

| Class | T_base °F | Heat °F | GDD to maturity | Plant | RUE | Harvest index |
|---|---|---|---|---|---|---|
| PINTO | 50 | 90 | 1700 | 06-01 | 1.45 | 0.45 |
| GREAT NORTHERN | 50 | 88 | 1600 | 06-01 | 1.45 | 0.45 |
| NAVY | 50 | 88 | 1650 | 06-01 | 1.45 | 0.46 |
| BLACK | 50 | 92 | 1750 | 06-01 | 1.50 | 0.45 |
| LIGHT/DARK RED KIDNEY | 50 | 86 | 1900 | 06-01 | 1.40 | 0.42 |
| SMALL RED / PINK | 50 | 90 | 1650 | 06-01 | 1.45 | 0.45 |
| CRANBERRY | 50 | 88 | 1800 | 06-01 | 1.40 | 0.43 |
| SMALL WHITE | 50 | 88 | 1650 | 06-01 | 1.45 | 0.46 |
| BLACKEYE (cowpea) | 50 | 95 | 1800 | 05-20 | 1.50 | 0.44 |
| PEAS | 41 | 82 | 2000 | 04-05 | 1.60 | 0.48 |
| CHICKPEAS | 41 | 86 | 2600 | 04-20 | 1.30 | 0.38 |
| *Night stress threshold* | | **68 °F** *(sourced — Porch & Jahn 2001; Phaseolus only)* | | | | |

**Every number in this table was chosen, not read from a publication.** They no longer create
class differences in the index (3.7), but they still set maturity, planting and stage. The
68 °F night threshold is load-bearing for a claim currently live on the site.

## 3.10 Planting date

Published normal date is a **floor**. Weather may push it later, never earlier. There is no
field-workability test in the code. Treat planting date as an assumption.

---

# PART IV — PROCESS

## 4.1 Daily run — `scripts/refresh/run.py`, 11:20 UTC

| # | Step | Produces |
|---|---|---|
| 1 | `build_station_observations.py` | Hourly ASOS air temp at satellite overpass |
| 2 | `usda_classes.py` | Which classes are actually planted, by state |
| 3 | `usda_class_yields.py` | Measured yield level per class per state |
| 4 | `station_field_acis.py` | Station temperature and rainfall |
| 5 | `solar_power.py` | NASA POWER measured radiation |
| 6 | `irrigation.py` | Irrigated share of each crop's ground |
| 7 | `ndvi_cropmask.py` | Daily NDVI on dry bean ground |
| 8 | `pulse_canopy.py` | Daily NDVI on chickpea and pea ground |
| 9 | `thermal_stress.py` | Land surface temperature |
| 10 | `vs_history.py` | This season vs its own history, per crop |
| 11 | `yield_all.py` | Biomass per class per region |
| 12 | `yield_index.py` | Season index, yield, headline file |
| 13 | `ledger.py` | Freeze today's prediction; score any reported outcome |
| 14 | **`verify_data.py`** | **Refuses to publish if any check fails** |
| 15 | `publish.py` | Push to the live branch |

## 4.2 Before any code is published

```bash
scripts/verify_all.sh
```
Runs, in order: browser-smoke · visual-contract · **data-verification (strict)** ·
foundation · truth-firewall · evidence-store · temporal-evidence · syntax.
Exits non-zero and prints **"BLOCKED — do not publish"** if any fail.

**A syntax check is not a test.** `node --check` passes on a page that renders nothing.

## 4.3 Rules of conduct for whoever builds this

1. Read the durable state before starting; update it before stopping.
2. Never state a count, file list, or status from memory — read it from the source.
3. Never describe behaviour of code you have not run.
4. Render the page and look at it. Twice today that caught what every test missed.
5. Independent review before anything is called done.
6. Report a failed stage as failed.

---

# PART V — THE PROOFS

Each can fail. Failing means stop, not retry.

### Stage 1 — County-scale skill *(decisive)*

State-level failed. County is the untried avenue: **14,482 county-years** vs ~88 state-years,
matched to the weather and satellite that actually fell on that county, **with irrigation now
available as a feature**.

- **Method:** fit on years ≤ *t*, forecast *t+1*, roll forward. Cluster by **year**, not county.
- **Baseline:** trend + county mean.
- **Passes:** beats baseline with a confidence interval excluding zero, **per state**, at a date
  before harvest.
- **Fails → stop modelling permanently. Publish condition only.**

### Stage 2 — Every input earns its place
Add one at a time; keep only those improving out-of-sample skill alone.
**Fails if** the full model is no better than its best single input.

### Stage 3 — Honest uncertainty
**Passes:** the stated 80% interval contains truth 75–85% of the time **in every region
separately.** *A previous ±265 lb/ac "80% interval" covered 56% in Kansas and 96% in Wyoming.
Pooling hid it. Never pool.*

### Stage 4 — Transfers outside where it was built
Fit High Plains, test North Dakota and Minnesota without refitting.
**Fails** → each region needs its own calibration, and the plan says so up front.

### Stage 5 — Agronomist review
**Passes:** an independent professional finds no error we had not already published ourselves.

---

# PART VI — REGIONS GET THE MODEL THEIR DATA SUPPORTS

| Tier | Where | Yield truth | Output |
|---|---|---|---|
| **1 Rich** | US, Canada | County/state yields | Pounds per acre with an interval |
| **2 Partial** | Argentina, Brazil, EU | National only | Index vs own history + labelled proxy level |
| **3 Thin** | Much of Africa, Central & South Asia | None reliable | **Condition only. No pounds, ever.** |

**Tier 3 is not a lesser product.** "This crop is 12% below its own ten-year normal," three
months before any official figure exists, is exactly what a food security agency needs, requires
no local statistics agency, and nobody else provides it.

---

# PART VII — BUILD ORDER, WITH A KILL SWITCH AT EACH STEP

| # | Step | Kill criterion |
|---|---|---|
| 0 | ~~Source the four constants~~ **DONE 16 Sep 2026.** All four cited in `UNSOURCED.md`; the irrigation bound and the live Montana sentence were corrected, not merely cited. One caveat remains open: the 68 °F night threshold is sourced for *Phaseolus vulgaris* only and is also applied to peas, chickpeas and blackeye | — |
| 1 | **County skill test, irrigation included** | **No skill → stop modelling. Ship condition only** |
| 2 | Replace rainfall−ET with measured ETa/ETp | No improvement → keep the simpler input |
| 3 | Move to 30 m HLS imagery | No improvement → stay at 250 m |
| 4 | Ensemble and per-region intervals | Coverage fails → publish no interval |
| 5 | Extract engine to BeanYield.com | Only after 1–4. Never duplicate an unproven method |
| 6 | Regional sites (NebraskaBeans, MindakBeans) as views | Never before agronomist review |
| 7 | Tier 2 and 3 regions | Only with the tier stated on every page |

**Step 1 decides whether 2–4 happen at all.** It is cheap, uses public data, and can say no.

---

# PART VIII — THE SITE AS IT ACTUALLY STANDS

Facts a new session needs and cannot infer from the code.

## 8.1 Hosting, domains, deployment

- **Repository:** `MultigrainIntl/nebraskabeans`. **The live branch is `gh-pages`, not `main`.**
  `main` carries only governance files and is 8 commits behind on unrelated work.
- **Live at** nebraskabeans.com over HTTPS. DNS is GoDaddy, owned by GAJ: four A records
  (185.199.108–111.153) plus `www` CNAME to `multigrainintl.github.io`. A `CNAME` file in the
  repo root holds the domain. Let's Encrypt certificate. **Email was never touched.**
- **Publishing = `git push origin HEAD:gh-pages`.** GitHub Pages builds in about 45 seconds.
- **GAJ also owns** MindakBeans.com (North Dakota / Minnesota), DryBeans.org and BeanYield.com.
  The intended architecture is ONE engine at BeanYield.com, DryBeans.org as the public method
  and credibility layer, and the `.com` sites as regional front doors. **Do not duplicate the
  codebase per site** — there are 2,064 hardcoded region names; copying is not an option.

## 8.2 Search indexing — approved, and deliberately partial

Approved by GAJ as decision D-004, recorded in `PRODUCT-AUTHORITY-DECISIONS.md`.

- `index.html` and `about.html` are indexable. The six draft pages — `bean.html`,
  `commercial.html`, `methodology.html`, `privacy.html`, `reports.html`, `resources.html` —
  keep `noindex` and stay out of `sitemap.xml`. `methodology.html` still describes the WITHDRAWN
  yield model and `commercial.html` says its own form is unconfigured; either in a search result
  costs more than being found gains.
- `robots.txt` allows crawling EVERYWHERE on purpose: a page blocked there is never fetched, so
  its `noindex` is never read, and a bare URL can still be listed. `verify_foundation.mjs`
  enforces this posture and was proved against three planted leaks.
- Google had not yet indexed the site as of 16 Sep 2026. Submitting the sitemap in Google Search
  Console needs GAJ's own Google account.

## 8.3 Page text lives in one file

- **All user-facing sentences are in `assets/i18n.js`** as whole sentences with `{named}` slots,
  so another language is a data file and not a rewrite. Units follow `document.documentElement.lang`.
- **Never put a crop name in a slot needing a singular noun.** "where peas grows" and "dryland
  chickpeas state" both shipped. Plural crop names break English and break worse elsewhere.
- **Every asset reference must carry a `?v=` cache-buster.** Without one the browser serves a cached copy forever. `assets/i18n.js` — the file holding every sentence
  on the site — sat unversioned while its text was rewritten all day, so returning visitors
  could read stale wording while every local test passed. `verify_data.py` now fails the build
  if any script or stylesheet is referenced without a version.

## 8.4 What the site currently offers

- **Six crops**, chosen by USDA's published record, not by opinion: PINTO, GREAT NORTHERN,
  LIGHT RED KIDNEY, BLACKEYE, PEAS, CHICKPEAS. Lentils were dropped — 215 mapped acres is one
  field, not a market.
- **Seven regions:** Nebraska Panhandle, Southwest Nebraska, Northeast Colorado, Western
  Colorado, Southeast Wyoming, Big Horn Basin, Northwest Kansas.
- **An About page** carrying a published defect log — five real errors with what each did and
  what changed. GAJ agreed this is the strongest credibility item on the site. Keep it current.
- **A contact form** posting to Formspree `https://formspree.io/f/xpqeadrq`, submit intercepted
  so nobody lands on a third-party page. No email address is published as text.
- **Chickpea yields are a labelled proxy** from Montana. The evidence is that dry peas are
  published in BOTH Montana (1,528 lb/ac) and Nebraska (1,579) — within 3%.

## 8.5 The prediction ledger — built, and empty

- `ledger.py` writes an append-only `prediction-ledger.jsonl` BEFORE any truth exists, and
  scores it only against reports that arrive later. It runs LAST in the daily sequence.
- **200 predictions are on record. ZERO harvest reports have ever come back.** The feedback loop
  works and has never run on real data. Until a grower says what a field actually made, nobody
  knows how good the estimate is.
- The predictions are not shown to visitors. Publishing them would turn a claim into something
  an agronomist can check, and is the cheapest credibility win left.

## 8.6 Publishing requires GAJ

GAJ pastes `printf ok > ~/.claude/joieos-unlock` before a publish and
`rm ~/.claude/joieos-unlock` after. **Never write that file yourself.** Recursive and forced
deletes are blocked by policy; on a block, report plainly and stop — do not work around it.

---

# PART IX — HOW THIS PLAN STAYS HONEST

- Every claim traces to a source or is marked borrowed.
- Every stage has a test that can fail, run by `scripts/verify_all.sh`.
- The defect log is published, not filed.
- Anything substantive is reviewed independently before being called done.
- **A stage that fails is reported as failed. The plan is not the point. The truth is.**
