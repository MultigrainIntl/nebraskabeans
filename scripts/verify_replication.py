#!/usr/bin/env python3
"""Can a stranger reproduce every published number from what is published beside it?

Not "is this number believable" -- every existing check in verify_data.py asks that, with
words like "in range", "plausible", "physically possible". This asks the different question:
recompute the figure from the figures printed next to it, and see whether you get it back.

A number that cannot be reproduced is not necessarily wrong. It means the site is withholding
an input the reader needs, which is the same thing as being unverifiable.
"""
import json, os, statistics, sys

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "data")
STATE_OF = {"ne-panhandle": "NE", "sw-nebraska": "NE", "ne-colorado": "CO",
            "western-colorado": "CO", "se-wyoming": "WY", "big-horn": "WY",
            "nw-kansas": "KS"}
FULL = {"NE": "Nebraska", "CO": "Colorado", "WY": "Wyoming", "KS": "Kansas"}
USDA_CLASS = {"PINTO": "Pinto", "GREAT NORTHERN": "Great northern",
              "LIGHT RED KIDNEY": "Light red kidney", "DARK RED KIDNEY": "Dark red kidney",
              "NAVY": "Navy", "BLACK": "Black", "BLACKEYE": "Blackeye",
              "PEAS": "DRY PEAS", "CHICKPEAS": "CHICKPEAS"}

load = lambda f: json.load(open(os.path.join(DATA, f)))
results = []          # (group, label, ok, detail)


def check(group, label, ok, detail):
    results.append((group, label, bool(ok), detail))


# ---------------------------------------------------------------- USDA class yields
# mean_lb_ac, years, low and high are all printed, AND so is the by_year record they come
# from. So every one of them is reproducible with no hidden step at all.
d = load("usda-class-yields.json")
for cls, states in d["classes"].items():
    for st, b in states.items():
        by = {k: v for k, v in (b.get("by_year") or {}).items() if v is not None}
        if not by:
            check("USDA class yields", "%s / %s has a by_year record" % (cls, st), False,
                  "no by_year to reproduce from")
            continue
        vals = list(by.values())
        tag = "%s / %s" % (cls, st)
        check("USDA class yields", tag + " mean", abs(round(statistics.mean(vals)) - b["mean_lb_ac"]) <= 1,
              "published %s, by_year mean %.1f over %d years" % (b["mean_lb_ac"], statistics.mean(vals), len(vals)))
        check("USDA class yields", tag + " year count", len(vals) == b["years"],
              "published %s, by_year has %d" % (b["years"], len(vals)))
        check("USDA class yields", tag + " low", min(vals) == b["low"],
              "published %s, by_year min %s" % (b["low"], min(vals)))
        check("USDA class yields", tag + " high", max(vals) == b["high"],
              "published %s, by_year max %s" % (b["high"], max(vals)))

# ---------------------------------------------------------------- the yield figures
y = load("yield-index-2026.json")
groups = {}
for rk, r in y["regions"].items():
    for ck, c in (r.get("classes") or {}).items():
        groups.setdefault((rk, c["commodity"]), []).append((ck, c))

for (rk, com), items in groups.items():
    # what the code actually uses for the band: the MEAN spread across this region's classes
    # of this commodity. The site prints each class's OWN spread beside the band instead.
    shared = statistics.mean(c["model_year_to_year_spread_pct"] for _, c in items) / 100
    for ck, c in items:
        tag = "%s / %s" % (rk, ck)
        # vs_normal_pct is pure arithmetic on the published index
        check("Yield figures", tag + " vs-normal %",
              abs(round(100 * (c["index"] - 1), 1) - c["vs_normal_pct"]) <= 0.1,
              "published %s%%, index %s implies %.1f%%"
              % (c["vs_normal_pct"], c["index"], 100 * (c["index"] - 1)))
        if not c.get("lb_ac"):
            continue
        b, i = c["baseline_lb_ac"], c["index"]
        check("Yield figures", tag + " middle number", abs(round(b * i) - c["lb_ac"]) <= 1,
              "published %s, baseline %s x index %s = %.1f" % (c["lb_ac"], b, i, b * i))
        own = c["model_year_to_year_spread_pct"] / 100
        lo_own, hi_own = round(c["lb_ac"] * (1 - own)), round(c["lb_ac"] * (1 + own))
        check("Yield figures", tag + " range, from the spread printed beside it",
              abs(lo_own - c["lb_ac_low"]) <= 2 and abs(hi_own - c["lb_ac_high"]) <= 2,
              "published %s-%s, its own %.1f%% spread gives %s-%s"
              % (c["lb_ac_low"], c["lb_ac_high"], own * 100, lo_own, hi_own))
        lo_s, hi_s = round(c["lb_ac"] * (1 - shared)), round(c["lb_ac"] * (1 + shared))
        check("Yield figures", tag + " range, from the UNPUBLISHED shared spread",
              abs(lo_s - c["lb_ac_low"]) <= 2 and abs(hi_s - c["lb_ac_high"]) <= 2,
              "published %s-%s, commodity-mean %.2f%% gives %s-%s"
              % (c["lb_ac_low"], c["lb_ac_high"], shared * 100, lo_s, hi_s))
        # the baseline is supposed to BE the USDA record -- cross-file, not internal
        uc, st = USDA_CLASS.get(ck), FULL.get(STATE_OF.get(rk))
        rec = (d["classes"].get(uc) or {}).get(st) if uc and st else None
        if rec:
            check("Baseline vs USDA file", tag, abs(rec["mean_lb_ac"] - b) <= 1,
                  "yield file says %s, usda-class-yields says %s" % (b, rec["mean_lb_ac"]))
        elif c.get("level_kind") == "published":
            check("Baseline vs USDA file", tag, False,
                  "level marked 'published' but no %s / %s row exists in usda-class-yields" % (uc, st))

# ---------------------------------------------------------------- one index per region
for rk, r in y["regions"].items():
    for com in {c["commodity"] for c in (r.get("classes") or {}).values()}:
        idx = {c["index"] for c in r["classes"].values() if c["commodity"] == com}
        check("One index per commodity", "%s / %s" % (rk, com), len(idx) == 1,
              "%d distinct index values: %s" % (len(idx), sorted(idx)))

# ---------------------------------------------------------------- the same number, twice
ra = load("region-answers.json")


def dig(o, key, out):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == key and isinstance(v, (int, float)):
                out.append(v)
            dig(v, key, out)
    elif isinstance(o, list):
        for v in o:
            dig(v, key, out)


for rk, r in y["regions"].items():
    for ck, c in (r.get("classes") or {}).items():
        if not c.get("lb_ac"):
            continue
        blob = json.dumps(ra)
        # only assert agreement where region-answers actually carries this pair
        if '"%s"' % rk in blob and '"%s"' % ck in blob:
            found = []
            dig(ra, "lb_ac", found)
            if found:
                check("Cross-file agreement", "%s / %s appears in region-answers" % (rk, ck),
                      c["lb_ac"] in found,
                      "yield file says %s; region-answers carries %s"
                      % (c["lb_ac"], sorted(set(found))[:6]))
            break
    break

# ---------------------------------------------------------------- irrigation
ir = load("irrigation.json")
for crop, regs in ir["crops"].items():
    for rk, b in regs.items():
        check("Irrigation", "%s / %s share is a share" % (crop, rk),
              0 <= b["irrigated_share_of_ground"] <= 100,
              "%.1f%%" % b["irrigated_share_of_ground"])

# ---------------------------------------------------------------- report
order, seen = [], set()
for g, _, _, _ in results:
    if g not in seen:
        seen.add(g); order.append(g)

print("CAN A STRANGER REPRODUCE THESE NUMBERS?")
print("recomputing each published figure from the figures published beside it\n")
fails = 0
for g in order:
    rows = [r for r in results if r[0] == g]
    bad = [r for r in rows if not r[2]]
    fails += len(bad)
    print("%-28s %3d of %3d reproduce%s" % (g, len(rows) - len(bad), len(rows),
                                            "" if not bad else "   <-- %d FAIL" % len(bad)))
    for _, label, _, detail in bad[:6]:
        print("      %-56s %s" % (label, detail))
    if len(bad) > 6:
        print("      ... and %d more" % (len(bad) - 6))
print("\n%d checks, %d reproduce, %d do not" % (len(results), len(results) - fails, fails))
sys.exit(1 if fails else 0)
