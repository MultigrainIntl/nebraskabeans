#!/usr/bin/env python3
"""
Harvest data is the scorecard. It must never become an input.

WHY THIS GATE EXISTS. GAJ stated the rule plainly: harvest results are post-mortem, they
arrive as separate and isolated data, and they must not impact the yield number. The reason is
not tidiness. If finished harvests feed the estimate, we can no longer measure whether the
estimate had any skill -- we would be grading our own work with the answer key in hand. And the
in-season number, whose entire value is that it lands in July while a grower can still act,
would quietly degrade into a report on a season that is already over.

The firewall held when this was written because it was built carefully. Careful is not
enforced. The blackeye error crept in exactly this way: a judgement that was right on the day
it was made, with nothing standing behind it afterwards. This gate stands behind it.

WHAT IS AND IS NOT ALLOWED, because the distinction is easy to get wrong:

  allowed      USDA yields from SEASONS ALREADY FINISHED before this one opened. Those are
               history. The estimate is anchored to them, and they were knowable on the day
               the prediction was made.
  allowed      satellite canopy observations, station weather, growing degree days. In-season
               measurement is the whole point.
  FORBIDDEN    this season's harvest reports, the prediction ledger, the model scorecard.
               Every one of these exists only AFTER the number was needed.

The test is a read-path test, not a word search: it asks whether a script that computes yield
can reach a file that only exists post-harvest.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REFRESH = os.path.join(HERE, "..", "scripts", "refresh")

# Scripts whose output reaches the published yield number.
YIELD_SCRIPTS = ["yield_all.py", "yield_index.py", "vs_history.py"]

# Files that cannot exist until after a harvest has happened and been reported.
POST_MORTEM = ["observations.json", "model-scorecard.json", "prediction-ledger"]

# Reading a file is what matters. A comment explaining the rule is not a violation, and this
# gate would be worse than useless if it punished the scripts for documenting themselves.
READ = re.compile(r"""(open|load|read_text|loads)\s*\(""")


def offending_lines(path):
    bad = []
    for n, ln in enumerate(open(path, errors="replace"), 1):
        code = ln.split("#", 1)[0]
        if not READ.search(code):
            continue
        for f in POST_MORTEM:
            if f in code:
                bad.append((n, f, ln.strip()[:100]))
    return bad


def irrigation_honesty():
    """Irrigation is measured now, so the old blanket denial must not come back.

    The site said "we cannot see irrigation" in four places for months after it became possible
    to measure it. The opposite error is now the live risk: claiming we know which FIELDS are
    watered. MIrAD tells us the share of the ground that is irrigated agriculture. It cannot
    tell us that any particular bean field is watered, and the vintage is 2017, not this season.
    """
    import glob
    bad = []
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.join(here, "..")
    for f in ["index.html", "about.html", os.path.join("assets", "i18n.js")]:
        p = os.path.join(root, f)
        if not os.path.exists(p):
            continue
        t = open(p, errors="replace").read()
        if re.search(r"(cannot|can't|do not|don't) see irrigation", t, re.I):
            bad.append("%s still says irrigation cannot be seen; it is measured now" % f)
        if re.search(r"(your|each|every|which) fields? (is|are) irrigated", t, re.I):
            bad.append("%s claims field-level irrigation, which the layer cannot support" % f)
    d = os.path.join(root, "assets", "data", "irrigation.json")
    if os.path.exists(d):
        j = json.load(open(d))
        if not j.get("crop_year_of_layer"):
            bad.append("irrigation.json does not state the vintage of the layer")
        for f in ["index.html", os.path.join("assets", "i18n.js")]:
            t = open(os.path.join(root, f), errors="replace").read()
            if "estimate.irrigated" in t and "{year}" not in t and str(j["crop_year_of_layer"]) not in t:
                bad.append("%s shows irrigation without stating the year it was measured" % f)
    return bad


def main():
    failures = []
    failures += irrigation_honesty()
    for s in YIELD_SCRIPTS:
        p = os.path.join(REFRESH, s)
        if not os.path.exists(p):
            failures.append("%s is missing -- the gate cannot verify what it cannot find" % s)
            continue
        for n, f, ln in offending_lines(p):
            failures.append("%s:%d reads %s\n      %s" % (s, n, f, ln))

    # The ledger must stay one-directional: it may read predictions and truth, and it may write
    # the scorecard, but nothing it writes may be consumed upstream.
    led = os.path.join(REFRESH, "ledger.py")
    if os.path.exists(led):
        order = os.path.join(REFRESH, "run.py")
        if os.path.exists(order):
            steps = open(order, errors="replace").read()
            pos = [(steps.find(s), s) for s in YIELD_SCRIPTS + ["ledger.py"] if steps.find(s) > -1]
            if pos and max(pos)[1] != "ledger.py":
                failures.append("ledger.py does not run last in run.py -- scoring must happen "
                                "after the prediction it grades, never before")

    if failures:
        print("TRUTH FIREWALL BREACHED -- harvest data has become an input\n", file=sys.stderr)
        for f in failures:
            print("  " + f, file=sys.stderr)
        print("\nHarvest results score the number. They do not build it.", file=sys.stderr)
        return 1

    print("TRUTH FIREWALL INTACT")
    print("  %d yield scripts carry no read path to post-mortem data" % len(YIELD_SCRIPTS))
    print("  scoring runs after prediction, never before")
    return 0


if __name__ == "__main__":
    sys.exit(main())
