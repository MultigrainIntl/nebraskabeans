#!/usr/bin/env python3
"""
Daily refresh. Rebuilds every dataset the site shows, and FAILS LOUDLY if a source stops
answering.

The point is not that it runs. The point is that when a source dies it says so, in the open,
instead of the site quietly serving last month's crop as though it were today's. That happened
to this project in the open: the USGS groundwater API was frozen on 1 November 2025 and now
returns a redirect — anything still pointed at it is receiving a web page instead of data and
reporting nothing wrong.

Every source here is keyless. CI needs no secrets, which also means nothing to expire.

Exit codes
  0  every dataset rebuilt and is fresh
  1  a source failed, or a dataset is older than its tolerance — the run fails and says which
"""
import json, os, subprocess, sys, time
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "assets", "data")

# builder, what it produces, how stale it may be before the run fails
STEPS = [
    ("../build_station_observations.py", None, None,
     "IEM hourly ASOS air temperature at the satellite's overpass hour"),
    ("station_field_acis.py", "station-field.json", 5,
     "NOAA cooperative and GHCN stations via RCC-ACIS"),
    ("ndvi_cropmask.py", None, None, "Crop-CASMA daily NDVI on dry-bean ground"),
    ("pulse_canopy.py", None, None, "Crop-CASMA daily NDVI on chickpea, lentil and pea ground"),
    ("thermal_stress.py", None, None, "NASA MOD11A2 land surface temperature"),
    ("vs_history.py", "crop-vs-history.json", 12, "this season against 2000-2025"),
    ("yield_all.py", "yield-all-2026.json", 12, "yield for every class in every region"),
]


def run(script, args=()):
    t = time.time()
    p = subprocess.run([sys.executable, os.path.join(HERE, script), *args],
                       capture_output=True, text=True, cwd=HERE)
    tail = (p.stderr or p.stdout or "").strip().split("\n")[-3:]
    return p.returncode, "%.0fs" % (time.time() - t), tail


def age_days(path):
    """How old the DATA is — from what it says it covers, not from the file's timestamp.
    A file rewritten with stale contents is still stale."""
    try:
        d = json.load(open(path))
    except Exception:
        return None
    for key in ("latest_observation", "window", "generated_utc", "crop_year"):
        v = d.get(key)
        if isinstance(v, list) and v:
            v = v[-1]
        if isinstance(v, str) and len(v) >= 10:
            try:
                return (date.today() - date.fromisoformat(v[:10])).days
            except ValueError:
                pass
        if isinstance(v, str) and len(v) == 5:           # "09-05"
            try:
                return (date.today() - date.fromisoformat("%d-%s" % (date.today().year, v))).days
            except ValueError:
                pass
    return None


def main():
    failures, report = [], []
    for script, produces, tol, what in STEPS:
        code, took, tail = run(script)
        ok = code == 0
        if not ok:
            failures.append("%s failed (%s): %s" % (script, what, " | ".join(tail)))
        line = {"step": script, "source": what, "ok": ok, "took": took}
        if produces:
            path = os.path.join(DATA, produces)
            a = age_days(path)
            line["dataset"] = produces
            line["age_days"] = a
            line["tolerance_days"] = tol
            if a is None:
                failures.append("%s: cannot read how current %s is" % (script, produces))
            elif a > tol:
                failures.append("%s is %d days old, tolerance is %d — the source has most "
                                "likely stopped publishing" % (produces, a, tol))
        report.append(line)
        print("  %-26s %-4s %s" % (script, "ok" if ok else "FAIL", took), file=sys.stderr)

    # The build id is derived from the bytes of every material input, and the daily station
    # download changes one of them by design. Left alone it is stale the moment the data is
    # rebuilt, the foundation gate refuses it, and nothing is ever published. Re-derive it here
    # so the id that ships always describes the data that ships.
    if not failures:
        t = time.time()
        m = subprocess.run(["node", os.path.join(HERE, "..", "build_manifest.mjs")],
                           capture_output=True, text=True, cwd=os.path.join(HERE, "..", ".."))
        ok = m.returncode == 0
        if not ok:
            failures.append("build manifest could not be re-derived: %s"
                            % (m.stderr or m.stdout or "").strip().split("\n")[-1])
        report.append({"step": "build_manifest.mjs", "source": "content-derived build id",
                       "ok": ok, "took": "%.0fs" % (time.time() - t)})
        print("  %-26s %-4s %s" % ("build_manifest.mjs", "ok" if ok else "FAIL",
                                   (m.stdout or "").strip()), file=sys.stderr)

    json.dump({"ran_utc": datetime.utcnow().isoformat() + "Z",
               "all_sources_keyless": True,
               "steps": report, "failures": failures},
              open(os.path.join(DATA, "refresh-status.json"), "w"), indent=1)

    if failures:
        print("\nREFRESH FAILED:", file=sys.stderr)
        for f in failures:
            print("  - " + f, file=sys.stderr)
        return 1
    print("\nall datasets rebuilt and current", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
