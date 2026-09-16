#!/usr/bin/env python3
"""
What each bean class ACTUALLY yielded, by state and year, from USDA.

WHY THIS EXISTS. This site showed pinto, Great Northern and light red kidney with different
yields, and those differences came from constants I chose -- a heat threshold, a growing-degree
requirement, a light-use efficiency, a harvest index -- none of them sourced. Tested against
USDA's own per-class harvest record for 2016-2025, the differences we published were wrong by
an average of 9.9 percentage points, and in Wyoming they were BACKWARDS: the site said Great
Northern beat pinto by 8% where the record says it trails by 5%.

USDA publishes the answer. The Crop Production Annual Summary carries yield per acre by
commercial class for every producing state. That is a measurement of the thing we were
guessing at, it needs no key, and it covers the classes this site offers.

WHAT THIS CHANGES. Class differences stop being modelled and start being measured. The
satellite cannot tell pinto from kidney anyway -- USDA maps one dry bean crop, so every class
shares the same greenness -- which means class-to-class variation in our index was never
observation. It was arithmetic on unsourced constants.

WHAT THIS DOES NOT FIX. Classes really do differ in maturity: a kidney needing 1,900 growing
degrees does experience a different season from a Great Northern needing 1,600, and a long
season really can be cut short. That is real agronomy we still cannot quantify here. Including
our unsourced version of it made the answer worse, so it is out until there is evidence for it.

MARKS, read the same way as the acreage table:
  a number   published
  (D)        grown, withheld because too few operations report it
  (NA)       not estimated
  -          none grown
"""
import json, os, re, sys, urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
CACHE = os.path.join(DATA, "archive", "usda-crop-annual")
OUT = os.path.join(DATA, "usda-class-yields.json")
SERIES = "https://esmis.nal.usda.gov/publication/crop-production-annual-summary"

CLASS_LINES = ["Pinto", "Light red kidney", "Dark red kidney", "Navy", "Great northern",
               "Small white", "Black", "Pink", "Small red", "Cranberry", "Garbanzo",
               "Baby lima", "Large lima", "Blackeye"]
STATES = ["Colorado", "Nebraska", "Wyoming", "Kansas", "North Dakota", "Minnesota", "Idaho",
          "Michigan", "Washington"]
# A dry bean yield outside this band is not a dry bean yield; it is a column from another
# table. Bounding it is what stopped an all-crops acreage row being read as a bean yield.
LO, HI = 400, 4500


def releases():
    try:
        html = urllib.request.urlopen(SERIES, timeout=120).read().decode("utf-8", "replace")
    except Exception as e:
        print("could not reach the publication index: %s" % str(e)[:80], file=sys.stderr)
        return []
    return sorted(set(re.findall(r'href="([^"]*/(cropan\d\d)\.txt)"', html)), key=lambda f: f[1])


def text(path, name):
    os.makedirs(CACHE, exist_ok=True)
    local = os.path.join(CACHE, name + ".txt")
    if os.path.exists(local) and os.path.getsize(local) > 10000:
        return open(local, errors="replace").read()
    url = path if path.startswith("http") else "https://esmis.nal.usda.gov" + path
    try:
        raw = urllib.request.urlopen(url, timeout=300).read()
    except Exception as e:
        print("  could not fetch %s: %s" % (name, str(e)[:60]), file=sys.stderr)
        return None
    open(local, "wb").write(raw)
    return raw.decode("utf-8", "replace")


def parse(txt, out):
    """Walk the file tracking which class block and which half of the table we are in."""
    in_pounds = False
    cur = years = None
    for ln in txt.split("\n"):
        if "pounds" in ln and "---" in ln:
            in_pounds = True
            continue
        y = re.search(r":\s*(\d{4})\s*:\s*(\d{4})\s*:\s*(\d{4})\s*:", ln)
        if y:
            years = [int(g) for g in y.groups()]
        # the acreage half of the same table must not be read as yields
        if re.match(r"^\s*(Area planted|Area harvested|1,000 acres)", ln):
            in_pounds = False
        s = ln.strip()
        for c in CLASS_LINES:
            if s.startswith(c) and ln.rstrip().endswith(":") and len(s) < 26:
                cur = c
        if not (in_pounds and cur and years):
            continue
        for st in STATES:
            if not s.startswith(st):
                continue
            vals = re.findall(r"\(D\)|\(NA\)|\(X\)|[\d][\d,]*", ln.split(":", 1)[-1])
            for yr, v in zip(years, vals[:3]):
                if v.startswith("("):
                    continue
                n = v.replace(",", "")
                if n.isdigit() and LO <= int(n) <= HI:
                    out.setdefault(cur, {}).setdefault(st, {})[str(yr)] = int(n)


def pulses(txt, out):
    """Dry pea and chickpea yields, which live in their own tables.

    USDA publishes dry pea yield for Nebraska. It does NOT publish chickpea yield for Nebraska,
    Colorado or Wyoming at all -- the chickpea programme covers California, Idaho, Montana,
    North Dakota and Washington. That absence is the finding: this site was publishing a
    chickpea yield of 494 lb/ac built on a 700 lb/ac level that came from nowhere, while every
    state USDA does publish runs 940-2,100. A number with no source is worse than no number.
    """
    for title, key in (("Dry Edible Pea Area Planted", "DRY PEAS"),
                       ("Chickpea Area Planted", "CHICKPEAS")):
        for m in re.finditer(re.escape(title), txt):
            seg = txt[m.start(): m.start() + 3000]
            if "pounds" not in seg:
                continue
            yrs = re.search(r":\s*(\d{4})\s*:\s*(\d{4})\s*:\s*(\d{4})\s*:", seg)
            if not yrs:
                continue
            Y = [int(g) for g in yrs.groups()]
            body = seg[seg.find("pounds"):]
            for st in STATES:
                row = re.search(r"^%s[^:\n]*:(.*)$" % st, body, re.M)
                if not row:
                    continue
                vals = re.findall(r"\(D\)|\(NA\)|\(X\)|[\d][\d,]*", row.group(1))
                for yr, v in zip(Y, vals[:3]):
                    if v.startswith("("):
                        continue
                    n = v.replace(",", "")
                    if n.isdigit() and LO <= int(n) <= HI:
                        out.setdefault(key, {}).setdefault(st, {})[str(yr)] = int(n)
            break


def main():
    rel = releases()
    if not rel:
        return 1
    table = {}
    for path, name in rel:
        t = text(path, name)
        if t:
            parse(t, table)
            pulses(t, table)
    if not table:
        print("no class yields parsed -- refusing to write", file=sys.stderr)
        return 1

    summary = {}
    for cls, states in sorted(table.items()):
        for st, rows in states.items():
            if len(rows) < 4:
                continue                      # too thin to call a level
            vals = sorted(rows.values())
            mean = sum(vals) / len(vals)
            summary.setdefault(cls, {})[st] = {
                "mean_lb_ac": round(mean),
                "years": len(vals),
                "low": vals[0], "high": vals[-1],
                "by_year": rows}

    json.dump({
        "schema": "gisit.usda-class-yields.v1",
        "what": "yield per acre actually harvested, by commercial class and state",
        "why": "class differences on this site were modelled from unsourced constants and were "
               "wrong by about 10 percentage points, and backwards in Wyoming. This replaces "
               "them with the measured record.",
        "retrieved_utc": date.today().isoformat(),
        "source": {"name": "USDA NASS Crop Production Annual Summary - Dry Edible Bean Yield "
                           "by Commercial Class",
                   "url": SERIES, "api_key_required": False},
        "caveat": "A class needs at least four published years in a state to get a level here. "
                  "Withheld years ((D)) are common for small classes and are simply absent, "
                  "which biases a thin record toward the years big enough to publish.",
        "classes": summary,
    }, open(OUT, "w"), indent=1)

    print("%-20s %-14s %8s %7s" % ("class", "state", "lb/ac", "years"), file=sys.stderr)
    for cls, states in summary.items():
        for st, b in sorted(states.items()):
            print("%-20s %-14s %8d %7d" % (cls, st, b["mean_lb_ac"], b["years"]), file=sys.stderr)
    print("\nwrote %s" % os.path.relpath(OUT), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
