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
rows = about.count("<tr>")
for needle, why in (("region", "the region picker defect"),
                    ("More detail", "the empty panel defect"),
                    ("two yield", "the second yield model")):
    check("defect log records %s" % why, needle.lower() in about.lower(),
          "present in about.html" if needle.lower() in about.lower() else "NOT PUBLISHED")

# ---------------------------------------------------------------------------
# 8. The two halves of the yield ratio read DIFFERENT WEATHER STATIONS (found 17 Sep 2026).
# The eleven-year history used a fixed named station; the current season took whichever pin was
# nearest the bean centroid. Five of seven regions therefore divided one place by another. The
# Panhandle read PLAINSVIEW RANCH, 230 m above ALLIANCE and 304 growing degrees cooler over the
# season, and that moved published Panhandle pinto by about 88 lb/ac — UPWARD, because less
# heat delays maturity and holds the accumulation window open longer. Northwest Kansas and
# southwest Nebraska were both reading stations in Colorado. The whole method rests on running
# the same arithmetic on the same ground; a silent station swap does not fail, it drifts.
yi = read("scripts", "refresh", "yield_index.py")
for needle, why in (('s["name"].strip().upper() == hist_name.strip().upper()',
                     "the history station is preferred"),
                    ("_km(s[\"lat\"], s[\"lon\"], lat, lon) <= 110",
                     "the elevation ceiling uses a real radius, not a lat/lon box"),
                    ("elevs[max(0, int(0.20 * len(elevs)) - 1)] + 250",
                     "the fallback is screened on elevation")):
    check("yield station: %s" % why, needle in yi,
          "present" if needle in yi else "GONE — the station swap can return")

print()
if fails:
    print("REGRESSION: %d defect(s) have returned — %s" % (len(fails), ", ".join(fails)))
    sys.exit(1)
print("No regressions. All previously-live defects remain fixed.")
