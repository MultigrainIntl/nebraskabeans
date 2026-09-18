#!/usr/bin/env python3
"""Defects that were live, were fixed, and must never come back silently.

WHY THIS FILE EXISTS. Every defect below was found by GAJ opening the page and not believing
what he saw — not by a test. Each one left valid HTML that rendered without error, so
`node --check` passed, the data gate passed, and the site shipped broken anyway. A defect
caught by eye once will be caught by eye again only if someone happens to look. This file
makes each one fail the build instead.

The rule for adding to this file: a check goes here the day a real defect is fixed, and it
must fail if that exact defect returns. Not a similar defect. That one.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
read = lambda *p: open(os.path.join(ROOT, *p), encoding="utf-8").read()

fails = []


def check(name, passed, detail):
    print("  %-4s %-40s %s" % ("PASS" if passed else "FAIL", name, detail))
    if not passed:
        fails.append(name)


print("REGRESSION GUARD — defects that were live once and must not return\n")

# ---------------------------------------------------------------------------
# 1. "More detail" opened EMPTY on the live site (found 17 Sep 2026).
# pruneDeeper() filtered the panel against a hard-coded list of four prose phrases. The
# plain-language rewrite renamed every heading those phrases matched, so the whitelist matched
# nothing and deleted all nine sections. Prose gets rewritten; a filter keyed to prose rots.
js = read("assets", "answer-first.js")
m = re.search(r"function pruneDeeper\s*\(\s*\)\s*\{(.*?)\n  \}", js, re.S)
body = m.group(1) if m else ""
check("More detail keeps its content", m is not None and "KEEP" not in body and "/i" not in body,
      "pruneDeeper drops only empty nodes" if m else "pruneDeeper() NOT FOUND — did it move?")

html = read("index.html")
sections = len(re.findall(r'<section', re.search(
    r'<div class="nbDeeperBody">(.*?)</details>', html, re.S).group(1)))
# The panel holds 3 sections in the HTML and gains 6 more at runtime, when declutter() moves
# the decision panel, the timelines and the region panel in. Only the static 3 are countable
# here; the runtime total is the browser gate's job.
check("More detail still has sections", sections >= 3,
      "%d <section> blocks in the source (6 more are moved in at runtime)" % sections)

# ---------------------------------------------------------------------------
# 2. The region picker showed one region while the panels showed another (found 17 Sep 2026).
# selectArea() called map.flyTo() BEFORE refresh(). flyTo throws "Invalid LatLng object:
# (NaN, NaN)" — 369 times on one live page load — and the throw aborted the function before
# the panels updated. A grower could read Panhandle numbers under a Southwest Nebraska label.
app = read("assets", "app.js")
sel = re.search(r"function selectArea\(id\)\s*\{(.*?)\n  \}", app, re.S)
sel_body = sel.group(1) if sel else ""
check("region change survives a map error",
      bool(sel) and "try" in sel_body and sel_body.rindex("refresh()") > sel_body.index("flyTo"),
      "refresh() runs after flyTo and flyTo is guarded" if sel else "selectArea NOT FOUND")

# ---------------------------------------------------------------------------
# 3. TWO yield models published different numbers on the same page (found 17 Sep 2026).
# The season index said pinto 2,100 lb/ac for the Panhandle; gisit-drybean-weather-ridge-v1
# said 2,418 for the same region on the same day, under a heading that read WITHHELD. It also
# claimed "OUT-OF-SAMPLE GAIN" while scoring itself against the historical MEDIAN rather than
# the trend — which is where the 8.5% figure PLAN.md calls "trend, not skill" comes from.
check("only one yield model publishes", "released=false" in app.replace(" ", ""),
      "the gisit outlook's yield output stays withdrawn")

# ---------------------------------------------------------------------------
# 4. A claim the county test disproved (found 17 Sep 2026).
# The page showed "BACKTEST GATE PASS" in the tile headed "how well we have checked it".
# Search only what a reader could SEE. The first version of this check failed on its own
# explanatory comment, which is the check crying wolf about itself — so comment lines and the
# retirement note are stripped before looking.
def reader_visible(path):
    txt = read(*path.split("/"))
    txt = re.sub(r"/\*.*?\*/", " ", txt, flags=re.S)      # block comments
    txt = re.sub(r"(?m)^\s*//.*$", " ", txt)                # line comments
    txt = re.sub(r"(?m)^\s*#.*$", " ", txt)
    return txt

for phrase in ("BACKTEST GATE PASS", "OUT-OF-SAMPLE GAIN"):
    hits = [f for f in ("assets/app.js", "assets/i18n.js", "assets/decision-map.js", "index.html")
            if phrase in reader_visible(f)]
    check("no reader sees %r" % phrase, not hits, "absent" if not hits else "STILL IN " + ", ".join(hits))

# ---------------------------------------------------------------------------
# 5. Published numbers that a reader cannot reproduce (found 17 Sep 2026).
# The band was built from the mean spread across a commodity's classes while the page printed
# each class's OWN spread beside it, so the obvious arithmetic gave a different range.
y = json.load(open(os.path.join(ROOT, "assets", "data", "yield-index-2026.json")))
missing = [(rk, ck) for rk, r in y["regions"].items()
           for ck, c in (r.get("classes") or {}).items()
           if c.get("index_is_shared_across_classes") and not c.get("spread_is_shared_across_classes")]
check("the published spread builds the band", not missing,
      "every shared-index class publishes the shared spread" if not missing
      else "%d classes publish a spread that does not build their band" % len(missing))

# ---------------------------------------------------------------------------
# 6. An asset changed without its cache-busting version moving (found 17 Sep 2026).
# i18n.js had shipped this way before — "every sentence on the site was being served from
# cache". It cost an hour again here: three measurements were taken against a stale page.
stale = [a for a in ("app.js", "i18n.js", "answer-first.js", "decision-map.js")
         if re.search(re.escape(a) + r'\?v=', html) is None]
check("every script is cache-busted", not stale,
      "all versioned" if not stale else "NOT VERSIONED: " + ", ".join(stale))

# ---------------------------------------------------------------------------
# 7. The published defect log must keep pace with the defects (GAJ, 17 Sep 2026:
# "make sure you are continually updating this section").
about = read("about.html")
import re as _re
_tbl = _re.search(r"What we have gotten wrong.*?</table>", about, _re.S)
_rows = len(_re.findall(r"<tr><td>", _tbl.group(0))) if _tbl else 0

for needle, why in (("region picker", "the region picker defect"),
                    ("More detail", "the empty panel defect"),
                    ("two yield", "the second yield model"),
                    ("mountain weather", "the map coloured by mountains"),
                    ("weather station moved", "the station mismatch"),
                    ("could not see winter", "the missing winter"),
                    ("buried the water", "burying the water data"),
                    ("Colorado was left out", "Colorado missing from this year"),
                    ("stale acreage", "the stale chickpea acreage")):
    check("defect log records %s" % why, needle.lower() in about.lower(),
          "published" if needle.lower() in about.lower() else "NOT PUBLISHED")

# THE LOG MAY GROW BUT NEVER SHRINK. This is the honest limit of the guard: it can stop a
# published defect being quietly deleted, and it cannot know about one that was never written
# down. Four of today's were missed until GAJ asked "are you keeping it updated with every
# advancement and correction?" — the answer was no, and no test could have told him. That part
# is discipline, not automation, and pretending otherwise would be its own false claim.
check("the defect log has not shrunk", _rows >= 18,
      "%d defects published" % _rows if _rows >= 18
      else "WAS 18, NOW %d — a published defect has been removed" % _rows)

# ---------------------------------------------------------------------------
# 8. The two halves of the yield ratio read DIFFERENT WEATHER STATIONS (found 17 Sep 2026).
# The eleven-year history used a fixed named station; the current season took whichever pin was
# nearest the bean centroid. Five of seven regions therefore divided one place by another. The
# Panhandle read PLAINSVIEW RANCH, 230 m above ALLIANCE and 304 growing degrees cooler over the
# season, and that moved published Panhandle pinto by about 88 lb/ac — UPWARD, because less
# heat delays maturity and holds the accumulation window open longer. Northwest Kansas and
# southwest Nebraska were both reading stations in Colorado. The whole method rests on running
# the same arithmetic on the same ground; a silent station swap does not fail, it drifts.
# These three used to read yield_index.py, where the logic was written inline. It now lives in
# one shared function and they read that instead — and the guard caught the move itself, which
# is the behaviour wanted: it notices when the thing it protects changes shape.
yi = read("scripts", "refresh", "yield_index.py")
rule = read("scripts", "refresh", "yield_all.py")
rule = rule[rule.index("def station_on_crop_ground("):] if "def station_on_crop_ground(" in rule else ""
for needle, why in (('s["name"].strip().upper() == want',
                     "the history station is preferred"),
                    ("<= radius_km",
                     "the elevation ceiling uses a real radius, not a lat/lon box"),
                    ("+ tolerance_m",
                     "the fallback is screened on elevation")):
    check("yield station: %s" % why, needle in rule,
          "present in the shared rule" if needle in rule else "GONE — the station swap can return")

# ---------------------------------------------------------------------------
# 9. THE ELEVATION RULE MUST HOLD EVERYWHERE, NOT WHEREVER IT WAS LAST PATCHED.
# GAJ, 17 Sep 2026: "I SHOULD NOT HAVE TO REMEMBER TO TELL YOU EVERYTHING. YOU SHOULD BE SMART
# ENOUGH TO APPLY THESE FIXES ACROSS ALL THE MODELS, AND ALL THE REGIONS." It was fixed three
# times in three places before it was written down once: the cutworm model (Big Horn flight in
# September), the yield index (88 lb/ac on Panhandle pinto) and the map surface (92 station-
# region pairs above the crop, Beartown at 3,536 m). These assert it is still in all of them.
ya = read("scripts", "refresh", "yield_all.py")
check("one shared station rule exists", "def station_on_crop_ground(" in ya,
      "station_on_crop_ground() in yield_all.py")
check("yield_all uses it", "station_on_crop_ground(" in ya.split("def station_on_crop_ground")[-1],
      "called, not just defined")
check("yield_index uses the shared rule", "station_on_crop_ground(" in yi,
      "imported from yield_all rather than copied")
dm = read("assets", "decision-map.js")
check("the map surface screens elevation", "onCropGround(" in dm and "p.onGround" in dm,
      "stations above the crop cannot colour it")
pw = read("scripts", "refresh", "pest_wbc.py")
check("the pest model screens elevation", "ELEV_TOLERANCE_M" in pw,
      "cutworm stations are screened")

# No script may go back to picking a station on map distance alone.
for f in ("scripts/refresh/yield_all.py", "scripts/refresh/yield_index.py"):
    txt = read(*f.split("/"))
    raw = 'min((s for s in field["stations"] if s["has_temp"]),'
    check("%s picks no station on distance alone" % f.split("/")[-1], raw not in txt,
          "absent" if raw not in txt else "RAW NEAREST-STATION PICK IS BACK")

# ---------------------------------------------------------------------------
# 10. A REGIONAL SENTENCE POOLED ACROSS A THOUSAND MILES (found 17 Sep 2026).
# The cutworm summary took the median of every station on the crop's counties. On 12 July 2026
# that came to 24% and the page said flight "has not reached the 25% scouting mark" — while
# northwest Kansas stood at 97%, southwest Nebraska 60% and northeast Colorado 32%. Three of
# seven regions were past the mark and a Kansas grower reading it would not have gone out to
# scout. PLAN.md already records the yield publish gate failing for exactly this reason:
# pooled instead of per state, so Wyoming shipped a failure hidden inside Nebraska's numbers.
dm2 = read("assets", "decision-map.js")
check("cutworm sentence is per region", "selectedRegion()" in dm2 and "regionOf(" in dm2,
      "scoped to the region the reader picked")
# Matches either form of the guard clause. The listener was rewritten when the water-table
# line was added — it now early-returns on `!== 'region'` rather than testing `=== 'region'` —
# and this assertion failed on the rewrite, which is the guard working. What must hold is that
# something in this file still reacts to that element.
check("the map hears the region picker",
      ("e.target.id === 'region'" in dm2) or ("e.target.id !== 'region'" in dm2),
      "bound — without it the per-region lines named one region whatever you chose")

# ---------------------------------------------------------------------------
# 11. THE WATER TABLE IS AN OBSERVATION AND MUST NOT DRIFT INTO BEING A FORECAST.
# It failed the yield-skill test on 17 Sep 2026 (469 county-years, +0.7%, CI [-1.4, +8.9]).
# It publishes because a grower deciding whether to drill deeper is owed the number. Both
# honesty flags must survive: a region resting on fewer than eight wells is called an
# anecdote, and a region whose wells are mostly across a state line names that state.
dm3 = read("assets", "decision-map.js")
check("water table says it is not a forecast", "not a forecast" in dm3,
      "the line disclaims prediction")
check("thin well counts are called anecdotes", "an anecdote, not a regional figure" in dm3,
      "Big Horn's single well cannot read like a regional figure")
check("borrowed wells name their state", "mostly_from_another_state" in dm3,
      "se-wyoming's 765 Nebraska wells are disclosed")

# ---------------------------------------------------------------------------
# 12. BUILT AND BURIED IS THE SAME AS NOT BUILT (found 17 Sep 2026).
# The water-table line was first written into the estimate panel — 19,574 pixels down a
# 25,717-pixel page, inside a collapsed box, 76% of the way to the bottom. GAJ: "I CANNOT SEE
# ANYTHING CLEAR ON THE WEBSITE!" It now sits in the top answer block beside the crop
# headline, and must stay there.
af = read("assets", "answer-first.js")
check("the water line is in the top answer block", "waterLine()" in af and "nbA-water" in af,
      "rendered with the crop headline, not buried in a panel")
check("the answer block hears the region picker", "e.target.id === 'region'" in af,
      "without it the water line names one region whichever you pick")

# ---------------------------------------------------------------------------
# 13. FOLDING IS NOT DELETING, AND THE TWO THAT MATTER STAY OUT (17 Sep 2026).
# Ten caveat paragraphs sat at equal weight, so "this estimate has never beaten a trend line"
# carried no more emphasis than a note on how bean classes are levelled. 585 words moved
# behind one disclosure. Both of those must stay VISIBLE, and the fold must stay a fold —
# if these ever become deletions the page gets shorter by losing its honesty.
dm4 = read("assets", "decision-map.js")
check("the trend-line caveat is not folded away",
      "nbEstCaveat" in dm4 and dm4.index("nbEstCaveat") < dm4.index("nbEstMore"),
      "shown above the fold, where a skimming reader meets it")
check("'trust your own field' is not folded away",
      dm4.index("estimate.yourField") < dm4.index("nbEstMore"),
      "shown above the fold")
for key in ("estimate.whyItMisses", "estimate.weakestPart", "estimate.classLevels",
            "estimate.whatWouldFixIt"):
    check("%s is folded, not deleted" % key.split(".")[1], key in dm4,
          "still rendered inside the disclosure")

# ---------------------------------------------------------------------------
# 14. NOTHING REMOTELY SENSED MAY BE CALLED MEASURED SOIL MOISTURE (17 Sep 2026).
# GAJ: "Satellites and drones provide indirect surface or crop-stress clues. They do not
# measure actual root-zone moisture reliably... the tool must call its output an estimated
# water-stress proxy, not measured soil moisture." A land-surface model checked against one
# probe 15 km away is a good estimate and it is not a measurement, and the distinction is the
# difference between a tool an agronomist can use and one he stops trusting. This was ALREADY
# caught once by an independent review, on the rainfall-minus-evaporation layer, which was
# labelled soil moisture until someone outside this project read it.
import json as _json
idx = _json.load(open(os.path.join(ROOT, "assets", "data", "yield-index-2026.json")))
_regions = idx.get("regions", idx) or {}
_bad = []
for _rk, _v in _regions.items():
    for _cls, _c in (_v.get("classes") or {}).items():
        if "water_stress_proxy" in _c and _c.get("water_stress_proxy_is") != \
                "estimated water-stress proxy":
            _bad.append("%s/%s" % (_rk, _cls))
check("the water figure calls itself a proxy in the data",
      not _bad and any("water_stress_proxy" in (_c or {})
                       for _v in _regions.values()
                       for _c in (_v.get("classes") or {}).values()),
      "every published water figure carries the label, not just the page")

# The phrase itself is not banned — it has to be sayable in order to be denied, and the defect
# log and the method page both deny it at length. What is banned is CLAIMING it. Every
# occurrence must sit inside a negation: "not measured soil moisture", "nothing here measures",
# "fails if any page calls a remote figure measured soil moisture". A bare claim fails.
_NEG = ("not ", "never ", "nothing ", "no ", "cannot ", "isn't", "is not", "fails if",
        "calls a", "called a", "must not", "do not", "does not", "denied", "stop ", "as though")
_claims = []
for _f in ("index.html", "about.html", "methodology.html"):
    _path = os.path.join(ROOT, _f)
    if not os.path.exists(_path):
        continue
    _t = read(_f).lower()
    _i = _t.find("measured soil moisture")
    while _i != -1:
        _before = _t[max(0, _i - 90):_i]
        if not any(_n in _before for _n in _NEG):
            _claims.append("%s:%d" % (_f, _i))
        _i = _t.find("measured soil moisture", _i + 1)
check("no page claims to measure soil moisture",
      not _claims,
      "the phrase appears only inside a denial" if not _claims
      else "bare claim at " + ", ".join(_claims))

# ---------------------------------------------------------------------------
# 15. THE PUBLISHED SWING MUST BE THE TESTED SWING (17 Sep 2026).
# The index moved several times harder than ten years of harvests support, and was worse than
# assuming an average year in six of seven crop-and-state combinations. It is now scaled by a
# factor fitted against those harvests. If the calibration file goes missing the model must
# fall back to publishing NO swing, never to publishing full confidence.
check("every published class carries its scaling and its raw figure",
      all(("swing_scale" in _c and "raw_index" in _c and "index_is_calibrated" in _c)
          for _v in _regions.values() for _c in (_v.get("classes") or {}).values()),
      "the reader can always see what was taken out")
_cal = _json.load(open(os.path.join(ROOT, "assets", "data", "model-calibration.json")))
check("the calibration is not fitted to the year it predicts",
      max(_cal.get("fitted_on") or [0]) < 2026,
      "fitted on %s, applied to 2026" % (_cal.get("fitted_on") or [])[-1:])
check("a model that points backwards is switched off, not turned around",
      all((x.get("scale") or 0) >= 0
          for d in (_cal.get("by_state_class") or {}).values() for x in d.values()),
      "no negative scaling is published")

# ---------------------------------------------------------------------------
# 16. THE METHOD PAGE IS GENERATED, NOT REMEMBERED (17 Sep 2026).
# methodology.html described "GISit v1, a regularized equation trained on 92 published
# state-year pinto-yield outcomes" months after no such model ran here. It was not wrong by a
# detail; it described a different system. A reviewer who checks the code against a stale
# method page concludes the code is broken. It is now generated from the live data files.
_meth = read("methodology.html")
check("the method page is generated from the data",
      "generated from the live data files" in _meth,
      "not hand-written prose that drifts")
check("the method page shows the calibration table",
      "Scale we publish" in _meth and "Skill when held out" in _meth,
      "the reader sees how much of the swing survived testing")
check("the method page names what we do not have",
      "tensiometers" in _meth and "buried probes" in _meth,
      "buried probes, tensiometers, hand probes and irrigation records — none of which we have")
check("the method page prints the commands that reproduce it",
      "scripts/backtest.py" in _meth and "scripts/refresh/soils.py" in _meth,
      "an independent professional can rerun every step")
# The page itself promises: "If the model changes and this page is not rebuilt, the build gate
# fails." A promise printed on a public page and not enforced anywhere is exactly the kind of
# claim this project exists to stop making. So it is enforced: regenerate into a scratch copy
# and compare. Only the datestamp line may differ.
import subprocess as _sp, tempfile as _tf, re as _re, shutil as _sh
_live = os.path.join(ROOT, "methodology.html")
_keep = _tf.mktemp(suffix=".html")
_sh.copy(_live, _keep)
try:
    _sp.run([sys.executable, os.path.join(ROOT, "scripts", "refresh", "methods_page.py")],
            capture_output=True, timeout=120)
    _fresh = open(_live, encoding="utf-8").read()
    _old = open(_keep, encoding="utf-8").read()
    _strip = lambda t: _re.sub(r"Regenerated \d{4}-\d{2}-\d{2}", "", t)
    _same = _strip(_fresh) == _strip(_old)
finally:
    _sh.copy(_keep, _live)
    os.unlink(_keep)
check("the method page matches the data it describes",
      _same,
      "regenerating it from the live data files changes nothing")

check("the method page describes the model that is actually running",
      "GISit v1" not in _meth and "92 published state-year" not in _meth,
      "the withdrawn regularized-equation model is gone from it")

# ---------------------------------------------------------------------------
# 17. BOTH REMOTE SOIL PRODUCTS, ALWAYS (18 Sep 2026). STANDING ORDER.
# GAJ: "I NEED YOU TO CONTINUALLY COMPARE THE TWO SO THAT WE CAN MAKE BETTER ESTIMATIONS IN
# OTHER REGIONS." I had reported a "we did not switch" decision he never asked for, having been
# asked to USE remote sensing and make it ready for countries with no instruments. Choosing a
# winner throws away the disagreement between them, which is the most portable thing we have:
# where a land-surface model and a satellite part company is where a reader should widen the
# band, and that is the judgement a region with no probes cannot make for itself.
_w2 = {rk: (v.get("water_two_ways") or {}) for rk, v in _regions.items()}
_have_both = [rk for rk, w in _w2.items() if "power" in w and "smap" in w]
check("every region carries both the model and the satellite",
      len(_have_both) == len(_regions) and _regions,
      "%d of %d regions publish both" % (len(_have_both), len(_regions)))
check("the disagreement between them is published, not hidden",
      all((w.get("agreement") or {}).get("read_this_as") for w in _w2.values()),
      "a reader can see where the two products part company")
_hist = os.path.join(ROOT, "assets", "data", "archive", "season-history.json")
_arch = _json.load(open(_hist))
_af2 = read("assets", "answer-first.js")
check("both readings appear in the answer block, not just in the data",
      "twoWaysLine" in _af2 and "waterLine() +" in _af2 and "nbTwoWays" in _af2,
      "a reader sees both without opening a file")
check("a disagreement is stated, never averaged away",
      "disagree here" in _af2,
      "where the two products part company the sentence says so")

check("the archive holds both products for every region",
      set(_arch.get("smap") or {}) == set((_arch.get("soil") or {})) and (_arch.get("smap")),
      "%d regions of satellite, %d of model"
      % (len(_arch.get("smap") or {}), len(_arch.get("soil") or {})))

print()
if fails:
    print("REGRESSION: %d defect(s) have returned — %s" % (len(fails), ", ".join(fails)))
    sys.exit(1)
print("No regressions. All previously-live defects remain fixed.")
