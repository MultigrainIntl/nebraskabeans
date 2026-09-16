#!/usr/bin/env python3
"""
What USDA says was actually planted, by commercial class, by state.

WHY THIS EXISTS. The class list on this site was written from trade knowledge of dry-bean
market classes rather than from USDA's record of what goes in the ground in these counties.
The model computes a yield for whatever name appears in that list and never asks whether the
crop is grown there. That produced a blackeye yield in seven regions for a cowpea that is not
grown within a thousand miles, and — when the list was trimmed by hand — it removed three
crops that ARE grown and kept two that are not.

The correction is to stop guessing. USDA publishes "Dry Edible Bean Area Planted and
Harvested, Yield, and Production by Commercial Class - States and United States" in the Crop
Production Annual Summary, and a separate chickpea table. Both are plain text, keyless, and
carry three crop years per release.

READING THE BLANKS CORRECTLY, which is the part that caught me out:

  a number   the crop is grown and the acreage is published
  (D)        the crop IS GROWN. The figure is withheld because too few operations report it
             and publishing would identify them. This is presence, not absence.
  (NA)       not estimated in the current programme. Wyoming dry beans were discontinued
             after 2023; absence is not zero.
  -          none grown. This is the only mark that means the crop is not there.

Treating (D) as absence deleted dark red kidney, small red and cranberry from a site covering
the counties where they are grown. Treating (NA) as presence kept small white, which USDA
stopped estimating.

RELEASE SCHEDULE, so the site knows when its own class list is stale:
  late March    Prospective Plantings — intentions, total dry beans, no class split
  late June     Acreage — planted acres, total dry beans
  Aug-Nov       Crop Production monthly — yield and production forecasts, acreage revised
  January       Crop Production Annual Summary — FINAL, and the only one carrying the class
                split. So the current season's class mix is not known until after harvest;
                the most recent complete year is the honest basis for which classes to show.
"""
import json, os, re, sys, urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")
OUT = os.path.join(DATA, "usda-class-acres.json")
CACHE = os.path.join(DATA, "archive", "usda-crop-annual")

SERIES = "https://esmis.nal.usda.gov/publication/crop-production-annual-summary"
STATES = ["Colorado", "Nebraska", "Wyoming", "Kansas"]

# The classes USDA itself names in the commercial-class table. Anything not in this table is
# not a USDA commercial class and has no business being offered as one.
CLASS_LINES = ["Pinto", "Light red kidney", "Dark red kidney", "Navy", "Great northern",
               "Small white", "Black", "Pink", "Small red", "Cranberry", "Garbanzo",
               "Baby lima", "Large lima", "Blackeye", "Other"]


def newest_release():
    """The most recent annual summary text file, cached once it is fetched."""
    try:
        with urllib.request.urlopen(SERIES, timeout=120) as r:
            html = r.read().decode("utf-8", "replace")
    except Exception as e:
        print("could not reach the publication index: %s" % str(e)[:90], file=sys.stderr)
        return None, None
    files = re.findall(r'href="([^"]*/(cropan\d\d)\.txt)"', html)
    if not files:
        print("no annual-summary text file listed", file=sys.stderr)
        return None, None
    path, name = max(files, key=lambda f: f[1])
    url = path if path.startswith("http") else "https://esmis.nal.usda.gov" + path
    os.makedirs(CACHE, exist_ok=True)
    local = os.path.join(CACHE, name + ".txt")
    if os.path.exists(local) and os.path.getsize(local) > 10000:
        return open(local, errors="replace").read(), name
    try:
        raw = urllib.request.urlopen(url, timeout=240).read()
    except Exception as e:
        print("could not download %s: %s" % (name, str(e)[:80]), file=sys.stderr)
        return None, None
    open(local, "wb").write(raw)
    return raw.decode("utf-8", "replace"), name


def parse(txt):
    """Planted acres by class and state, preserving USDA's own marks."""
    lines = txt.split("\n")
    years, cur, out = None, None, {}
    for ln in lines:
        s = ln.strip()
        m = re.search(r":\s*(\d{4})\s*:\s*(\d{4})\s*:\s*(\d{4})\s*:", ln)
        if m:
            years = [int(g) for g in m.groups()]
        for c in CLASS_LINES:
            if s.startswith(c) and ln.rstrip().endswith(":") and len(s) < 30:
                cur = c
        if not cur or not years:
            continue
        for st in STATES:
            if not s.startswith(st):
                continue
            body = ln.split(":", 1)[-1]
            vals = re.findall(r"\(D\)|\(NA\)|[\d,]+\.\d+|[\d,]+|(?<=\s)-(?=\s)", body)
            if len(vals) < 3:
                continue
            # `cur` is the class this block belongs to. This said `c`, which after the
            # class-detection loop is simply its last element — every state row in the
            # file landed under one wrong key and the table came out empty.
            rec = out.setdefault(cur, {}).setdefault(st, {})
            for y, v in zip(years, vals[:3]):
                rec.setdefault(str(y), v.strip())
    return out


def verdict(marks, latest):
    """Is this class grown in this state NOW, on USDA's own evidence?

    Judged on the most recent crop year in the release, and only that year. Walking back
    through older years instead admitted pink and small white on 2023 marks from a programme
    USDA has since discontinued — three-year-old evidence for a crop nobody is estimating any
    more. A published number or a (D) in the latest year means grown; a bare dash means not
    grown; (NA) means USDA is no longer looking, which is not the same as the crop being there.
    """
    v = marks.get(str(latest))
    if v is None or v == "(NA)":
        return "not estimated", latest, "(NA)"
    if v == "-":
        return "not grown", latest, v
    if v == "(D)":
        return "grown, acreage withheld", latest, v
    return "grown", latest, v


def main():
    txt, name = newest_release()
    if not txt:
        return 1
    table = parse(txt)
    if not table:
        print("the commercial-class table did not parse — refusing to write", file=sys.stderr)
        return 1

    latest = max((int(y) for states in table.values()
                  for marks in states.values() for y in marks), default=None)
    out = {}
    for cls, states in sorted(table.items()):
        block = {}
        for st, marks in states.items():
            v, y, mark = verdict(marks, latest)
            block[st] = {"verdict": v, "as_of": y, "mark": mark, "by_year": marks}
        if any(b["verdict"].startswith("grown") for b in block.values()):
            out[cls] = block

    json.dump({
        "schema": "gisit.usda-class-acres.v1",
        "release": name,
        "judged_on_crop_year": latest,
        "retrieved_utc": date.today().isoformat(),
        "source": {"name": "USDA NASS Crop Production Annual Summary — Dry Edible Bean Area "
                           "Planted and Harvested, Yield, and Production by Commercial Class",
                   "url": SERIES, "api_key_required": False},
        "how_to_read": {
            "number": "grown, acreage published",
            "(D)": "GROWN. Withheld because too few operations report it; publishing would "
                   "identify them. This is presence, not absence.",
            "(NA)": "not estimated in the current programme. Wyoming dry beans were "
                    "discontinued after 2023; absence is not zero.",
            "-": "none grown. The only mark that means the crop is not there."},
        "release_schedule": {
            "prospective_plantings": "late March — intentions, total dry beans, no class split",
            "acreage": "late June — planted acres, total dry beans",
            "crop_production_monthly": "August to November — yield and production forecasts",
            "annual_summary": "January — FINAL, and the only report carrying the class split"},
        "caveat": "The class split is published only after harvest, so the current season's "
                  "mix is unknown until January. The most recent complete year is the honest "
                  "basis for which classes a site should offer.",
        "kansas": "Kansas is not separately published in the dry edible bean state table. "
                  "Absence here is not evidence of absence in the field.",
        "classes": out,
    }, open(OUT, "w"), indent=1)

    print("release %s\n" % name, file=sys.stderr)
    print("  %-18s %-10s %-26s %s" % ("class", "state", "verdict", "latest mark"), file=sys.stderr)
    for cls, block in out.items():
        for st, b in sorted(block.items()):
            print("  %-18s %-10s %-26s %s (%s)"
                  % (cls, st, b["verdict"], b["mark"], b["as_of"]), file=sys.stderr)
    print("\nwrote %s" % os.path.relpath(OUT), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
