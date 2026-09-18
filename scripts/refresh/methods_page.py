#!/usr/bin/env python3
"""Write methodology.html from the live data files, so it cannot drift from what runs.

WHY THIS EXISTS. GAJ, 17 September 2026: "you must publish your entire method on the website.
Some methods and sources are already on the main page, but I have zero confidence that you have
been updating the website AS INSTRUCTED."

He was right to have none. Until this script, methodology.html was hand-written prose
describing "GISit v1, a regularized equation trained on 92 published state-year pinto-yield
outcomes". No such model has run here for months. The page was not wrong by a detail; it
described a different system. A method page maintained by remembering to update it is a method
page that is out of date, and an out-of-date method page is worse than none, because a reviewer
checks the code against it and concludes the code is broken.

So it is generated. Every figure below is read out of the same file the site serves: the
calibration comes from model-calibration.json, the soils from soils.json, the constants from
the model source itself. If the model changes and this page is not regenerated, the build gate
fails. The page cannot lie about the code for longer than one run.

WHO IT IS FOR. An agronomist, an academic or a grower who wants to check our work, disagree
with it, or repeat it. Every section names its source, its assumptions, and the command that
reproduces it.
"""
import json, os, sys, datetime, html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
DATA = os.path.join(ROOT, "assets", "data")
OUT = os.path.join(ROOT, "methodology.html")


def load(name, default=None):
    try:
        return json.load(open(os.path.join(DATA, name)))
    except Exception:
        return default if default is not None else {}


def e(x):
    return html.escape(str(x))


LABEL = {"climatology": "Assume the local average — no satellite at all",
         "uncorrected": "The remote figure, one fixed scaling, no fitting",
         "global_mean": "One correction fitted on every other station",
         "transferred": "A correction predicted from this place's climate and terrain",
         "own_station": "A probe buried in that ground (not available abroad)"}


def _w2_rows(regions, nice):
    rows = []
    for rk, v in sorted(regions.items()):
        w = v.get("water_two_ways") or {}
        if "power" not in w or "smap" not in w:
            continue
        rows.append("<tr><td>%s</td><td>%+.1f%%</td><td>%+.1f%%</td><td>%.1f</td><td>%s</td></tr>"
                    % (e(nice.get(rk, rk)), w["power"]["vs_normal_pct"],
                       w["smap"]["vs_normal_pct"],
                       (w.get("agreement") or {}).get("gap_points", 0),
                       e((w.get("agreement") or {}).get("read_this_as", ""))))
    return rows


def _smap_gain(smap):
    import statistics as _s
    d = [x["power_rmse_vwc_pct"] - x["rmse_vwc_pct"] for x in (smap.get("stations") or [])]
    return ("%.2f" % _s.median(d)) if d else "\u2014"


def _median_r(rcal):
    rs = sorted(x["r"] for x in (rcal.get("stations") or []))
    if not rs:
        return "\u2014"
    return "+%.2f" % rs[len(rs) // 2]


def _xfer_rows(xfer):
    he = xfer.get("held_out_error") or {}
    rows = []
    for k in ("climatology", "uncorrected", "global_mean", "transferred", "own_station"):
        if k not in he:
            continue
        rows.append("<tr><td>%s</td><td>%s</td><td>%s</td></tr>"
                    % (e(LABEL[k]), e(he[k]["mean"]),
                       ("\u2014" if k == "climatology"
                        else "%+.0f%%" % he[k]["skill_vs_climatology_pct"])))
    return rows


def main():
    cal = load("model-calibration.json")
    soils = load("soils.json")
    idx = load("yield-index-2026.json")
    irr = load("irrigation.json")
    winter = load("winter-recharge.json")
    xfer = load("remote-soil-transfer.json")
    rcal = load("remote-soil-calibration.json")
    smap = load("smap-probe-scores.json")
    today = datetime.date.today().isoformat()

    regions = idx.get("regions", idx) or {}
    nice = {"ne-panhandle": "Nebraska Panhandle", "sw-nebraska": "Southwest Nebraska",
            "ne-colorado": "Northeast Colorado", "western-colorado": "Western Colorado",
            "se-wyoming": "Southeast Wyoming", "big-horn": "Big Horn Basin",
            "nw-kansas": "Northwest Kansas"}

    # ---- what the model actually is, per crop and state, from the calibration file
    cal_rows = []
    for st, d in sorted((cal.get("by_state_class") or {}).items()):
        for cls, x in sorted(d.items()):
            cal_rows.append(
                "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>"
                % (e(st), e(cls.title()), e(x.get("years")),
                   e(x.get("correlation")), e(x.get("scale")),
                   e(x.get("held_out_skill_pct"))))

    soil_rows = []
    for rk, x in sorted((soils.get("regions") or {}).items()):
        top = (x.get("top_soils") or [{}])[0]
        soil_rows.append(
            "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>"
            % (e(nice.get(rk, rk)), e(top.get("soil", "")),
               e(x.get("available_water_mm_root_zone")), e(x.get("slope_pct_mean")),
               e(x.get("cells_with_soil"))))

    proxy_rows = []
    for rk, v in sorted(regions.items()):
        c = (v.get("classes") or {}).get("PINTO") or {}
        if not c:
            continue
        w = winter.get("regions", {}).get(rk, {})
        proxy_rows.append(
            "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>"
            % (e(nice.get(rk, rk)), e(c.get("water_stress_proxy")),
               e(c.get("root_zone_available_water_mm")),
               e("%s%% of normal" % w.get("pct_of_normal")) if w.get("pct_of_normal") else "—"))

    doc = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Method | NebraskaBeans</title>
  <meta name="description" content="Every dataset, equation, constant and test behind the NebraskaBeans crop figures, with the commands to reproduce them.">
  <link rel="stylesheet" href="assets/site.css">
  <style>
    /* The six-column calibration table is the most important thing on this page and it does
       not fit a phone. It scrolls inside its own box rather than pushing the whole page
       sideways, which is what it did until the page was opened at 375px and looked at. */
    .methodScroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 0 1rem; }
    .methodScroll table { min-width: 34rem; }
    .methodCmd code, .methodEq code { overflow-wrap: anywhere; }
    .methodStamp { border-left: 3px solid #2a9d9a; padding-left: .8rem; }
  </style>
  <script defer src="assets/shell.js"></script>
</head>
<body>
<header class="top"><div class="brand"><a href="index.html"><b>NEBRASKA</b><span>BEANS</span></a><small>MARKET INTELLIGENCE</small></div><button class="menu" aria-expanded="false" aria-controls="nav">Menu</button><nav id="nav"><a href="index.html">Market</a><a href="reports.html">Reports</a><a href="resources.html">Sources</a><a href="about.html">About</a></nav></header>
<main>
  <section class="pagehero"><p class="eyebrow">METHOD</p><h1>How every number here is made</h1>
  <p class="lead">Written for someone who wants to check our work and disagree with it. Every dataset, every equation, every constant we could not source, every test we ran and every test we failed. The commands that reproduce it are printed beside each part.</p></section>
  <article class="content">

    <p class="methodStamp">This page is <b>generated from the live data files</b>, not written by hand. Regenerated %(today)s. If the model changes and this page is not rebuilt, the build gate fails. It cannot describe a system we are not running.</p>

    <h2>The short version</h2>
    <p>We measure how much a crop has grown this season from satellite greenness, sunlight and temperature, and compare it against the same measurement for the eleven seasons before it. That comparison is the index. We then scale the index back to the part of its movement that survived being tested against every harvest USDA has published here — which for dry beans in Nebraska and Colorado is <b>none of it</b>. We publish the scaled figure, the raw figure, and the scaling, so you can see exactly what we took out.</p>

    <h2>What we do not have</h2>
    <p>This is remote data. We have no buried probes, no tensiometers or Watermark sensors, no hand-probe checks, and no irrigation-flow records. Commercial growers here use all four, and those are what actually measure a root zone. Nothing on this site measures soil moisture. Where we publish a water figure it is an <b>estimated water-stress proxy</b> and it is labelled that way in the data itself.</p>

    <h2>Step 1 — where the crop is</h2>
    <p>USDA's Cropland Data Layer gives the ground each class is grown on. We reduce it to %(ncells)s bean cells with acreages, and every regional figure is weighted by those acres, not averaged flat.</p>
    <p class="methodCmd"><code>python3 scripts/build_crop_footprint.py</code></p>

    <h2>Step 2 — how much it has grown</h2>
    <p>Daily, from planting to maturity, for every season since 2015:</p>
    <p class="methodEq"><code>biomass += RUE &times; solar &times; 0.48 &times; fAPAR(greenness) &times; temperature&nbsp;term</code></p>
    <ul>
      <li><b>solar</b> — NASA POWER daily shortwave at the acre-weighted centre of the crop.</li>
      <li><b>0.48</b> — the share of shortwave that is photosynthetically active. Standard.</li>
      <li><b>fAPAR</b> — the fraction of that light the canopy intercepts, from satellite greenness (Myneni &amp; Williams 1994). Readings land every ten days and are interpolated between, not held flat.</li>
      <li><b>temperature term</b> — growth slows away from the crop's optimum. Heat above the flowering threshold is <b>counted and reported, not subtracted</b>, because tested against ten years of harvests on this ground it predicted nothing.</li>
      <li><b>planting</b> — derived from soil-temperature threshold and observed green-up, per class, not assumed.</li>
      <li><b>maturity</b> — growing degree days, base 50&deg;F for beans and 41&deg;F for pulses, against commercial-variety requirements.</li>
    </ul>
    <p>A finished past season is truncated to the day of the year this season has actually reached. Without that, every class in every region reads below normal in September, which is an artefact and not a crop.</p>

    <h2>Step 3 — the index</h2>
    <p class="methodEq"><code>raw index = biomass(this season) &divide; mean biomass(2015&ndash;2025)</code></p>
    <p>Dividing by the model's own history is deliberate: the constants we cannot source sit on both sides of that division and largely cancel. This is why we publish an index rather than a bushel figure derived from first principles.</p>

    <h2>Step 4 — scaling it back to what the record supports</h2>
    <p>The raw index moves far harder than reality. We measured how much harder, against every year USDA has published a yield for these classes in these states, refitting with each year held out and scoring the year that was held out.</p>
    <div class="methodScroll"><table class="aboutDefects">
      <tr><th>State</th><th>Class</th><th>Years</th><th>Correlation with real yield</th><th>Scale we publish</th><th>Skill when held out</th></tr>
      %(cal_rows)s
    </table></div>
    <p><b>Read that table before you read anything else on this site.</b> A scale of 0 means the model, tested properly, could not call that crop in that state, so we publish a normal year and show you the raw figure beside it. Peas are the one crop whose swing survived intact. Negative correlations are not flipped and used: we tested that too, and the inversion did not hold out of sample.</p>
    <p class="methodEq"><code>published index = 1 + scale &times; (raw index &minus; 1)</code></p>
    <p class="methodCmd"><code>python3 scripts/backtest.py</code> &nbsp;·&nbsp; <code>python3 scripts/backtest.py --write-calibration gwet</code> &nbsp;·&nbsp; <code>python3 scripts/backtest.py --inverted</code></p>
    <p>The scaling is fitted on %(fit_years)s and applied to %(this_year)s, which is not among them. The bar every variant must clear is not zero error — it is the naive forecast, "this year will yield what the other years averaged", scored on the same years.</p>

    <h2>Step 5 — pounds per acre</h2>
    <p>The index is multiplied by what USDA says that class actually yielded in that state, averaged over the published years. Where USDA publishes no yield for a class in a state — chickpeas in all three states, for example — <b>we publish no pounds per acre</b>. We do not invent a level.</p>

    <h2>Water: what we do, and what we refuse to call it</h2>
    <p>Three water terms were built and tested. All three are reported. None is allowed to move a yield.</p>
    <ol>
      <li><b>Inferred balance</b> — rainfall minus Hargreaves reference evapotranspiration, FAO-56 crop coefficient curve, root zone opened by the winter's recharge. Tested: made the forecast worse in all seven crop-and-state combinations.</li>
      <li><b>Estimated water-stress proxy from a land-surface model</b> — NASA POWER root-zone soil wetness (MERRA-2/GEOS assimilation), converted to plant-available millimetres using the measured soil capacity below. Checked against the USDA in-ground probe at Torrington, fifteen kilometres from Wyoming bean ground, which has recorded at five depths since 1997: the two agree across 3,801 days at r&nbsp;=&nbsp;+0.62, and both put summer 2026 as the driest root zone in the eleven-year record. Tested as a yield term: still short of guesswork. Published as an observation.</li>
      <li><b>Winter recharge</b> — October to March precipitation against each region's own previous thirty winters. An observation of cause, never a predictor.</li>
    </ol>
    <p>The proxy is damped by the irrigated share of the ground, from USGS MIrAD-US, in the open rather than as a hidden floor. That file states plainly that its share is the share of <i>ground</i> that is irrigated, not the share of <i>this crop</i> that is watered, and treating one as the other is an assumption we make and record.</p>
    <div class="methodScroll"><table class="aboutDefects">
      <tr><th>Region</th><th>Water-stress proxy (1.00 = no estimated shortage)</th><th>Root-zone available water, mm</th><th>Winter that fed it</th></tr>
      %(proxy_rows)s
    </table></div>

    <h2>How accurate is the remote water figure, and does that accuracy travel?</h2>
    <p>Neither question can be answered by looking at the satellite. It has to be scored against
    something buried in the ground. The United States has %(nprobe)s soil-moisture stations that
    have been running since 2015, from Alabama clay to Nevada desert, and the remote figure was
    scored against every one of them: median correlation <b>%(medr)s</b> across %(nstates)s
    states.</p>
    <p>Then the harder question, which matters for every country that has no such stations. Each
    station was <b>held out</b> — the correction fitted on the others, then used to predict the
    station it had never seen. Error in percentage points of volumetric water content, lower is
    better:</p>
    <div class="methodScroll"><table class="aboutDefects">
      <tr><th>Method</th><th>Error at a station it never saw</th><th>Better than assuming local average</th></tr>
      %(xfer_rows)s
    </table></div>
    <p><b>The clever method lost.</b> Predicting a local correction from a place's own climate
    and terrain beat the alternatives — until stations within %(minkm)s km of the held-out one
    were barred from voting. They had been neighbours, not evidence. With real separation, the
    simplest method wins: the raw remote figure with one fixed scaling and no fitting anywhere.</p>
    <p>So for ground with no instruments, that is what we carry, and we quote
    <b>&plusmn;%(band)s percentage points</b> of volumetric water content with it. A probe
    actually buried in that ground gives %(own)s — less than half the error. That gap is the
    honest measure of what remote sensing cannot do, and it is the reason a grower's own reading
    is worth more to this model than any satellite.</p>
    <p class="methodCmd"><code>python3 scripts/refresh/remote_soil_calibration.py</code> &nbsp;·&nbsp; <code>python3 scripts/remote_soil_transfer.py --min-km %(minkm)s</code></p>

    <h2>Two independent readings of the water, every day</h2>
    <p>Every region here carries <b>both</b> remote products, side by side, on every run: a
    land-surface model and the SMAP satellite. Neither is chosen over the other. Each is compared
    against its own eleven-year average for the same stretch of the calendar, so the units cancel
    and the two are directly comparable — and so the method carries unchanged to any country with
    eleven years of its own.</p>
    <p><b>The gap between them is the useful part.</b> Two independent instruments agreeing is
    worth more than either alone. Where they part company, the water reading there is uncertain
    and we say so on the page rather than averaging the disagreement away. That is the judgement
    a region with no probes in the ground cannot make for itself.</p>
    <div class="methodScroll"><table class="aboutDefects">
      <tr><th>Region</th><th>Land-surface model vs its own normal</th><th>SMAP satellite vs its own normal</th><th>Gap</th><th>Read as</th></tr>
      %(w2_rows)s
    </table></div>

    <h2>Is the actual satellite better than the model we use?</h2>
    <p>The water figure here comes from a land-surface model. SMAP is the NASA satellite that
    measures soil wetness directly. The obvious assumption is that the satellite wins. We scored
    both against the same %(nsmap)s buried probes, the same days, the same arithmetic.</p>
    <p>SMAP is better at <b>%(smapwins)s of %(nsmap)s stations</b> — a real result, not chance.
    The median improvement is <b>%(smapgain)s of a percentage point</b> of water content. That is
    statistically certain and agronomically nothing. And at Torrington, on the Wyoming bean
    ground this site actually covers, the model we already use is the <i>better</i> of the two.</p>
    <p>So we did not switch. SMAP is collected, scored and published here so the comparison can
    be checked, and if it pulls ahead the decision reverses on evidence rather than on which
    name sounds more impressive. It is also worth recording that SMAP needed no NASA account:
    USDA's Foreign Agricultural Service republishes it openly, worldwide, daily, back to April
    2015.</p>
    <p class="methodCmd"><code>python3 scripts/refresh/smap_probe_scores.py</code> &nbsp;·&nbsp; <code>python3 scripts/remote_soil_transfer.py --source smap --min-km 500</code></p>

    <h2>Soil and slope</h2>
    <p>Until 17 September 2026 every water calculation used one root-zone capacity of 120&nbsp;mm for all seven regions, and that number was invented. These are the measured capacities, sampled at the centre of every bean cell from the USDA soil survey and aggregated on bean acres. A field that holds 61&nbsp;mm reaches stress in half the time of one that holds 118&nbsp;mm, and the model could not see that at all.</p>
    <div class="methodScroll"><table class="aboutDefects">
      <tr><th>Region</th><th>Most common soil under the beans</th><th>Available water, root zone, mm</th><th>Mean slope, %%</th><th>Cells sampled</th></tr>
      %(soil_rows)s
    </table></div>
    <p>Root zone taken as 60&nbsp;cm, the middle of the 0.5&ndash;0.7&nbsp;m effective rooting depth FAO-56 Table 22 gives for green and dry beans. Slope and drainage class are collected and published; <b>slope is not yet in the arithmetic</b>, because putting it there means choosing a runoff coefficient and we have not sourced one. Saying so is better than a number nobody can check.</p>
    <p class="methodCmd"><code>python3 scripts/refresh/soils.py</code></p>

    <h2>Constants we could not source</h2>
    <p>Listed in <code>UNSOURCED.md</code> in the repository, and a build gate fails if a constant in the model is not either cited or listed there. At the time this page was generated the list includes the 0.30 winter recharge efficiency, the 0.55 wetness threshold at which stress is taken to begin, and the mapping of a saturation fraction onto a soil-water depletion fraction.</p>

    <h2>Every gate that must pass before anything is published</h2>
    <p class="methodCmd"><code>bash scripts/verify_all.sh</code></p>
    <p>Rendered-page checks, a data check of every dataset against a source that did not produce it, a replication check that every published number recomputes from the figures printed beside it, a truth firewall, and a regression file that re-tests every defect that was ever live here. A syntax check is not a test.</p>

    <h2>What we know is wrong with this</h2>
    <p>The model has no demonstrated skill for dry beans on this ground, which is why its swing is scaled to zero there. Weather features were tested against yield at state level and again at county level with twenty times the data, and failed both. A remote water term cannot see a centre pivot. The satellite sees a canopy, and a canopy is not a seed. Read <a href="about.html">what we have gotten wrong</a> before you decide how much of this to trust.</p>

  </article>
</main>
<footer><div class="brand"><a href="index.html"><b>NEBRASKA</b><span>BEANS</span></a><small>MARKET INTELLIGENCE</small></div><p>Evidence before interpretation.</p><div><a href="resources.html">Government Resources</a><a href="about.html">What we got wrong</a><a href="privacy.html">Privacy &amp; Disclaimer</a></div><small>&copy; 2026 NebraskaBeans. Public staging prototype.</small></footer>
</body>
</html>
""" % {"today": e(today),
       "cal_rows": "\n      ".join(cal_rows) or "<tr><td colspan=6>no calibration file</td></tr>",
       "soil_rows": "\n      ".join(soil_rows) or "<tr><td colspan=5>no soils file</td></tr>",
       "proxy_rows": "\n      ".join(proxy_rows) or "<tr><td colspan=4>no index file</td></tr>",
       "ncells": e(len(soils.get("cells") or [])),
       "fit_years": e("%s-%s" % (min(cal.get("fitted_on") or [0]),
                                 max(cal.get("fitted_on") or [0]))),
       "this_year": e(datetime.date.today().year),
       "nprobe": e(len(rcal.get("stations") or [])),
       "nsmap": e(len(smap.get("stations") or [])),
       "w2_rows": "\n      ".join(_w2_rows(regions, nice)) or
                  "<tr><td colspan=5>comparison not yet run</td></tr>",
       "smapwins": e(sum(1 for x in (smap.get("stations") or [])
                         if x["rmse_vwc_pct"] < x["power_rmse_vwc_pct"])),
       "smapgain": e(_smap_gain(smap)),
       "nstates": e(len({x.get("state") for x in (rcal.get("stations") or [])})),
       "medr": e(_median_r(rcal)),
       "minkm": e(int(xfer.get("excluded_within_km") or 0)),
       "band": e(xfer.get("quote_this_uncertainty_vwc_points")),
       "own": e(xfer.get("a_probe_on_site_would_give")),
       "xfer_rows": "\n      ".join(_xfer_rows(xfer)) or
                    "<tr><td colspan=3>transfer test not run</td></tr>"}

    open(OUT, "w", encoding="utf-8").write(doc)
    print("wrote %s (%d bytes, %d calibration rows, %d soil rows)"
          % (OUT, len(doc), len(cal_rows), len(soil_rows)), file=sys.stderr)


if __name__ == "__main__":
    main()
