/* NebraskaBeans decision map.
 *
 * Built to the Saskatchewan pea map standard: one encircled polygon per growing region, a
 * continuous surface interpolated between real weather stations inside it, and playback
 * directly under the map.
 *
 * The surface is computed per crop class at read time, never pre-baked. A garbanzo starts on a
 * 41F base in April and a dark red kidney on 50F in June; sharing one accumulation between
 * them reports the pulse as long past maturity, which is simply wrong.
 */
(function () {
  'use strict';

    /* Which classes appear here is decided by USDA's commercial-class table, not by judgement
     — see scripts/refresh/usda_classes.py. A class needs a PRINTABLE acreage: where USDA
     withholds the figure because too few operations report it, the crop is grown but the
     market is too thin to quote a yield for. Black, dark red kidney, small red and cranberry
     are all grown here and all withheld, so none of them is offered. Lentils go for the same
     commercial reason: 215 mapped acres across four states is one field, not a market. */
  var CLASSES = {
    'PINTO':              { commodity: 'DRY BEANS', base: 50, heat: 90, gdd: 1700, plant: '06-01' },
    'GREAT NORTHERN':     { commodity: 'DRY BEANS', base: 50, heat: 88, gdd: 1600, plant: '06-01' },
    'LIGHT RED KIDNEY':   { commodity: 'DRY BEANS', base: 50, heat: 86, gdd: 1900, plant: '06-01' },
    'BLACKEYE':           { commodity: 'DRY BEANS', base: 50, heat: 95, gdd: 1800, plant: '05-20' },
    'PEAS':               { commodity: 'PEAS', base: 41, heat: 82, gdd: 2000, plant: '04-05' },
    'CHICKPEAS':          { commodity: 'CHICKPEAS', base: 41, heat: 86, gdd: 2600, plant: '04-20' }
  };

  /* Each view is one question a professional actually asks, with the ends of the scale named
   * in plain language rather than in units nobody reads off a legend. */
  var VIEWS = {
    stage: {
      label: 'Crop development',
      unit: '% of maturity \u2014 100% is ready to cut',
      // A FIXED SCALE, because '% of maturity' already means something absolute.
      // Stretching the ramp to each class's own range normalised the classes back
      // together: a kidney at 95% and a great northern at 111% filled the same colours,
      // so every bean class drew one picture even though the numbers differ by a fifth.
      fixed: { lo: 0, hi: 150 },
      loLabel: 'Just planted', hiLabel: '150% \u2014 well past ready',
      ramp: [[0, '#d9e2d6'], [0.35, '#9ec9a6'], [0.6, '#4ea56b'], [0.8, '#e8c33a'], [1, '#a8571f']],
      question: 'How far along is the crop, and where is it behind?'
    },
    /* WESTERN BEAN CUTWORM FLIGHT. The only layer on this site running a model we did not
     * fit. UNL Extension fitted it against field trap counts and published the thresholds
     * with confidence intervals; we accumulate heat and read their numbers.
     *
     *   DD = max( min( (Tmax+Tmin)/2 , 75F ) - 38F , 0 ), from 1 March
     *   2,577 DD = 25% of flight, the date UNL says start scouting
     *   2,704 DD = 50%      2,838 DD = 75%
     *
     * SOURCE: cropwatch.unl.edu/western-bean-cutworm-degree-day-modeling/
     *
     * Scaled 0-100% of flight rather than raw degree-days, because a grower needs to know
     * where in the flight they are, not a heat sum. Fixed scale — the thresholds are
     * absolute, and stretching the ramp per region would make a Kansas field in full flight
     * and a Big Horn field weeks away fill the same colours.
     *
     * WHAT IT DOES NOT SAY: whether moths are in YOUR field, or how bad it is. No instrument
     * here resolves a moth or an egg mass. Onset is modelled; presence and severity need a
     * trap count or someone walking the rows. */
    cutworm: {
      label: 'Cutworm flight (UNL model)',
      unit: '% of western bean cutworm flight \u2014 25% is when UNL says start scouting',
      fixed: { lo: 0, hi: 100 },
      loLabel: 'Flight not started', hiLabel: 'Flight over',
      ramp: [[0, '#dfe3ea'], [0.25, '#f0d27a'], [0.5, '#e09a3e'], [0.75, '#c0562a'], [1, '#7d2f1c']],
      cropIndependent: true,
      question: 'Where is the cutworm flight, and where should scouting start?'
    },
    /* NOT soil moisture, and it was labelled as such until an independent review caught it.
     * This is rainfall minus grass-reference evaporation over thirty days — a climatic deficit.
     * It carries no irrigation, no crop coefficient, no root-zone storage, no soil water
     * capacity, no runoff and no drainage. In a region where much of the bean crop is under
     * pivot, calling it soil moisture and saying the crop drew down stored water was wrong in
     * a way that could have moved an irrigation decision. */
    /* ESTIMATED SOIL WATER. The one layer on this map whose spatial detail is real rather
     * than interpolated from a handful of instruments: it is drawn from the USDA soil survey
     * at the centre of every one of the bean cells, so the pattern you see is the pattern of
     * the ground itself — the Valent sands of southwest Nebraska really do hold about half
     * what the Keith silt loams of northwest Kansas hold.
     *
     *   value = available water capacity of THIS cell's soil, 0-60 cm   (USDA SSURGO)
     *           x  the region's estimated water-stress proxy            (NASA POWER GWETROOT)
     *
     * WHAT IT IS NOT, and this matters more than what it is. IT IS NOT MEASURED SOIL MOISTURE.
     * The capacity is surveyed on the ground and is solid. The wetness is a land-surface model,
     * one figure for a whole region, checked against the USDA probe at Torrington across 3,801
     * days at r = +0.62 — good agreement for a model, and still a model. Growers measure a root
     * zone with buried probes at several depths, with tensiometers or Watermark sensors, with a
     * hand probe, and with their own rain and irrigation-flow records. This map has none of
     * those and cannot replace them.
     *
     * It also cannot see a centre pivot. On irrigated ground the estimate will read dry when
     * the crop is not. Read it as "how much water this ground can hold, and how short the
     * weather has been", not as "how wet your field is." */
    soilwater: {
      label: 'Estimated soil water',
      unit: 'mm of plant-available water in the root zone \u2014 ESTIMATED from soil survey and a land-surface model, NOT measured',
      loLabel: 'Little water the crop can reach', hiLabel: 'Root zone near capacity',
      ramp: [[0, '#b4531a'], [0.3, '#e0913a'], [0.6, '#cbd46e'], [0.8, '#5fae86'], [1, '#1f7a6d']],
      cellSource: true,
      question: 'Where can the ground hold water for this crop, and where has it run short?'
    },
    moisture: {
      label: 'Rain minus evaporation',
      unit: 'mm since planting, up to 30 days · rainfall less THIS crop’s water use',
      loLabel: 'Rain far behind evaporation', hiLabel: 'Rain ahead of evaporation',
      ramp: [[0, '#e07b1f'], [0.35, '#e8c33a'], [0.65, '#7cc08a'], [1, '#2a9d9a']],
      question: 'Where is rain furthest behind what the crop is using?'
    },
    /* THE YIELD VIEW IS GONE. It showed USDA's own historical baseline for the class
     * multiplied by a season adjustment — every one of its 35 values was baseline x percentage
     * to within a pound. That is not a prediction, and GAJ's standing rule is that USDA yield
     * is the scorecard and never an input. It was doing the opposite while a heading asked
     * "what is this crop going to yield". It stays out until there is a real prediction to
     * grade against USDA rather than one derived from it. */
    /* A real prediction this time. gisit-drybean-weather-ridge-v1 is fitted on 92 state-years
     * of USDA final pinto yield from 2000 to 2025, using weather only — thermal onset, growing
     * degree days, rainfall, climatic deficit, and the same two measured across the crop's
     * critical stage. No current USDA figure enters it. It is graded against USDA afterwards by
     * leave-one-year-out hindcast, and it withholds its own number on every date where it fails
     * to beat the historical median, which is every date before 15 June. */
    /* THERE IS NO YIELD LAYER ON THIS MAP, AND THAT IS DELIBERATE.
     *
     * Two independent reviews and an ablation of my own took the previous one apart:
     *
     *   - It was never weather-only. State identity and a calendar year term were in the fit,
     *     and the year term alone contributes roughly +156 lb/ac to a 2026 number.
     *   - Its advantage over guessing the median is not statistically established. Clustered on
     *     the 26 held-out years — the real experimental unit, because four states in one year
     *     are not four independent tests — every confidence interval includes zero.
     *   - The gate was pooled, not per state. Wyoming's own error, 96 lb/ac against a 93 lb/ac
     *     baseline, means the model loses there. It published anyway, because Nebraska and
     *     Colorado carried the pool.
     *   - The +-265 lb/ac band was presented as 80% coverage. Actual coverage runs from 56% in
     *     Kansas to 96% in Wyoming.
     *   - The fit and the grading are state-level. Running each region's weather through a state
     *     model produced a 123 lb/ac spread inside Colorado that has never been compared against
     *     any regional yield observation. Painting it county by county made it look measured.
     *
     * Every one of those is fixable and none is fixed. A regional pounds-per-acre figure would
     * be the most decision-relevant number on this site and the least supported, so there isn't
     * one. Dry peas are the first class with demonstrated weather skill — +10.8%, interval +1.9
     * to +18.4 — and are the candidate for putting yield back. */
    /* WHAT THE CROP LOOKS LIKE RIGHT NOW, against every season since 2000.
     *
     * Not a forecast, and it waits on nobody. Each value is a satellite pass at 250 m over the
     * cells USDA's crop map calls dry beans, and a satellite pass is final when it lands.
     *
     * This is here instead of a yield number because USDA's own figures are neither timely nor
     * stable: Nebraska's 2026 planted acres moved from 101,000 in March to 80,000 in August, a
     * 21% revision inside one season, and no 2026 state yield has been published for any of
     * these four states. A tool that predicts that number inherits its lateness and its
     * revisions. A tool that reports what the satellite saw on Tuesday does not. */
    vshistory: {
      label: 'Crop vs its own history',
      unit: 'greenness on this crop\u2019s own ground, against its own history',
      // WHY EVERY BEAN CLASS DRAWS THE SAME MAP HERE, and why it is not a fault. USDA's
      // Cropland Data Layer has ONE class for dry beans: pinto, navy, black, great northern,
      // pink, small red, cranberry, small white and both kidneys are all class 42. A
      // satellite reading that ground cannot separate them, and no work here will change it.
      // Chickpeas, lentils and peas DO separate — their own classes, their own pixels.
      sameAcrossClasses: 'Every dry-bean class shares this map. USDA\u2019s crop map has a '
        + 'single class for dry beans, so the satellite cannot separate pinto from navy or '
        + 'kidney. Chickpeas, lentils and peas are read on their own ground and do differ.',
      regional: true,
      realtime: true,
      loLabel: '15% below normal', hiLabel: '15% above normal',
      ramp: [[0, '#9e1b0e'], [0.3, '#e07b1f'], [0.5, '#e8c33a'], [0.75, '#7cc08a'], [1, '#17794a']],
      question: 'How far is this crop from its own normal, on its own ground?'
    },
    health: {
      label: 'Season flags',
      unit: 'weather-derived flag from state-level inputs — not an observed crop condition',
      regional: true,
      loLabel: 'At risk', hiLabel: 'On track',
      ramp: [[0, '#9e1b0e'], [0.25, '#d4541c'], [0.5, '#eb9a00'], [0.75, '#f0cb2a'], [1, '#17794a']],
      question: 'Where did the weather go wrong this season?'
    },
    heat: {
      label: 'Heat stress',
      unit: 'days above the class threshold',
      loLabel: 'Few hot days', hiLabel: 'Many hot days',
      ramp: [[0, '#2a9d9a'], [0.4, '#e8c33a'], [0.7, '#e07b1f'], [1, '#9e1b0e']],
      question: 'Where did heat cost seed size?'
    }
  };

  var S = {                                   // everything the map is currently showing
    crop: 'PINTO', view: 'moisture', interp: 'absolute', day: 0, playing: false, speed: 1, frame: 1,
    map: null, canvas: null, outlines: null, cropOutlines: null, counties: null,
    answers: null, outlook: null, vsHistory: null, estimate: null, yieldAll: null,
    field: null, dates: [], layers: {}, timer: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var build = function () { return window.__nbBuild || Date.now(); };

  /* ---------------------------------------------------------------- agronomy */

  /* Crop coefficient by growth stage, FAO-56 in shape. A crop barely out of the ground uses a
     fraction of what a closed canopy does, and a senescing one gives some back. A flat grass
     reference for every class made every crop's water map identical. */
  // "peas's" is not a word. A plural already ending in s takes the bare apostrophe.
  function possessive(word) {
    return word + (word.slice(-1) === 's' ? '\u2019' : '\u2019s');
  }

  function kc(progress) {
    if (progress <= 0) return 0.15;
    if (progress < 0.25) return 0.30 + (progress / 0.25) * 0.35;
    if (progress < 0.55) return 0.65 + ((progress - 0.25) / 0.30) * 0.50;
    if (progress < 0.85) return 1.15;
    return Math.max(0.45, 1.15 - (progress - 0.85) * 2.0);
  }

  function plantIndex(spec) {
    var want = S.dates[0].slice(0, 4) + '-' + spec.plant;
    for (var i = 0; i < S.dates.length; i++) if (S.dates[i] >= want) return i;
    return 0;                                 // the record starts after planting; accumulate all
  }

  /* Hargreaves reference evapotranspiration. Rain alone does not tell you whether a crop is
   * short of water — the same 40mm in a cool June and a 100F August are different seasons. */
  function et0(hi, lo, lat, doy) {
    // A missing reading is missing. Substituting a plausible-looking 3 mm made gaps in the
    // record indistinguishable from dry weather, and 8% of borrowed station-days were gaps.
    if (hi == null || lo == null) return null;
    var tc = function (f) { return (f - 32) / 1.8; };
    var tmax = tc(hi), tmin = tc(lo), tmean = (tmax + tmin) / 2;
    var phi = lat * Math.PI / 180;
    var dr = 1 + 0.033 * Math.cos(2 * Math.PI * doy / 365);
    var dec = 0.409 * Math.sin(2 * Math.PI * doy / 365 - 1.39);
    var x = -Math.tan(phi) * Math.tan(dec);
    var ws = Math.acos(Math.max(-1, Math.min(1, x)));
    var ra = 24 * 60 / Math.PI * 0.082 * dr *
      (ws * Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.sin(ws));
    // 0.408 converts MJ/m2/day of radiation into the millimetres of water it can evaporate.
    // Leaving it out inflates reference ET about two and a half times, which turns an ordinary
    // dryland September into an impossible 12 mm/day of demand.
    var range = Math.max(tmax - tmin, 1);
    var e = 0.0023 * (tmean + 17.8) * Math.sqrt(range) * ra * 0.408;
    return Math.max(e, 0);
  }

  function doyOf(iso) {
    var d = new Date(iso + 'T00:00:00Z');
    return Math.floor((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 0))) / 86400000);
  }

  /* One number per station for the chosen view on the chosen day. This is what the surface
   * interpolates between — there is no modelled grid behind it, only observations. */
  /* One number per station for the chosen view on the chosen day. This is what the surface
   * interpolates between — there is no modelled grid behind it, only observations.
   *
   * Temperature and rainfall come from different station sets. Most cooperative sites report
   * rain and nothing else; they are the densest rainfall network in the country and throwing
   * them away to protect a growing-degree-day sum they were never going to feed would be a
   * poor trade. A rain-only station borrows evaporation from the nearest thermometer, named in
   * the data file at build time — a median of fifteen kilometres away. */
  /* Stations standing on the selected crop's counties, cached per crop.
   * The statistics under the map used to be computed from every gauge in four states while the
   * picture above them was clipped to one crop, so the sentence and the surface described
   * different places. */
  function cropRings() {
    if (S.ringKey === S.crop) return S.ringCache;
    var rings = [];
    cropOutline().forEach(function (f) { rings = rings.concat(ringsOf(f)); });
    S.ringKey = S.crop; S.ringCache = rings;
    return rings;
  }

  /* One number per station for the chosen view on the chosen day. This is what the surface
   * interpolates between — there is no modelled grid behind it, only observations.
   *
   * Temperature and rainfall come from different station sets. Most cooperative sites report
   * rain and nothing else; they are the densest rainfall network in the country. A rain-only
   * station borrows evaporation from the nearest thermometer named in the data file. That
   * transfer is only sound over comparable ground, so a station whose thermometer is too far
   * away, or whose record has too many gaps, is dropped rather than quietly filled in. */
  var MAX_BORROW_KM = 40;      // beyond this the terrain and exposure stop being comparable
  var MIN_WINDOW_COVER = 0.8;  // a station must have observed most of its accumulation window

  /* ELEVATION. A station can stand inside a bean county and still be measuring weather the
   * beans never see. Counted on 17 September 2026: 92 station-region pairs sit more than 250 m
   * above the crop they would colour — Blackwater at 2,981 m over Big Horn beans at 1,279 m,
   * Beartown at 3,536 m over western Colorado, Dodge Creek at 2,164 m over southeast Wyoming.
   * Western Colorado had 37 such stations against 18 on the crop's own ground, so the surface
   * there was painted mostly by mountains.
   *
   * The same blindness put the cutworm model's Big Horn flight date in SEPTEMBER before an
   * elevation screen fixed it, and had the yield model dividing Alliance's eleven-year history
   * by a station 230 m higher. This is the third place it had to be closed.
   *
   * The crop's ground is the 20th percentile of nearby station elevations — dry beans here are
   * irrigated valley-bottom ground, so the low end of the local spread is where the crop is.
   * In flat country almost every station survives; in mountains the valley does.
   *
   * GAJ: "I NEED TO BE ABLE TO TRUST YOU THAT YOU ARE BUILDING STABLE MODELS FOR ALL THESE
   * FIXES, INCLUDING BUT NOT LIMITED TO LOCKING IN THE WEATHER STATIONS TO ELEVATION." */
  var ELEV_TOLERANCE_M = 250;

  function cropElevationCeiling() {
    if (S.elevKey === S.crop) return S.elevCeiling;
    var rings = cropRings(), els = [];
    S.field.stations.forEach(function (st) {
      if (st.elev_m != null && inRings(st.lon, st.lat, rings)) els.push(st.elev_m);
    });
    els.sort(function (a, b) { return a - b; });
    S.elevKey = S.crop;
    S.elevCeiling = els.length
      ? els[Math.max(0, Math.floor(0.20 * els.length) - 1)] + ELEV_TOLERANCE_M : null;
    return S.elevCeiling;
  }

  /* True when this station stands on ground the crop could actually be grown on. */
  function onCropGround(st) {
    var ceil = cropElevationCeiling();
    return ceil == null || st.elev_m == null || st.elev_m <= ceil;
  }

  /* Soil cells, not weather stations. Every other layer interpolates between instruments;
   * this one has a surveyed value at each bean cell, which is a great deal more of them. */
  function soilCellValues(day) {
    /* THIS LAYER MUST MOVE WITH THE TIMELINE.
     *
     * The first version multiplied each cell's surveyed capacity by ONE season-average figure
     * per region, so the surface was identical on every date on the slider — planting, pod
     * fill, harvest, all the same picture. A temporal map that does not vary with time is worse
     * than no temporal map, because it quietly asserts the ground held the same water in June
     * as in September.
     *
     * The spatial pattern still comes from the soil survey, cell by cell. The movement over
     * time now comes from soil-water-daily.json: for each region and each day, how much of its
     * usual water the root zone held, averaged across the land-surface model and the satellite.
     * Falls back to the season average only if that file is missing. */
    var out = [], rings = cropRings();
    var cells = (S.soils && S.soils.cells) || [];
    var reg = (S.yieldIndex && (S.yieldIndex.regions || S.yieldIndex)) || {};
    var iso = S.dates && S.dates[day == null ? S.day : day];
    var daily = (S.soilDaily && S.soilDaily.regions) || null;
    var proxy = {};
    Object.keys(reg).forEach(function (rk) {
      var cls = (reg[rk] && reg[rk].classes) || {};
      var k = Object.keys(cls)[0];
      // every class in a region shares one commodity signal, so any of them carries the proxy
      if (k && cls[k] && cls[k].water_stress_proxy != null) proxy[rk] = cls[k].water_stress_proxy;
    });
    if (daily && iso) {
      Object.keys(daily).forEach(function (rk) {
        var v = daily[rk][iso];
        if (v == null) {                       // nearest earlier day this region reported
          var ks = Object.keys(daily[rk]).filter(function (d) { return d <= iso; });
          if (ks.length) v = daily[rk][ks[ks.length - 1]];
        }
        // a fraction of normal, capped so a wet week cannot fill the profile past capacity
        if (v != null) proxy[rk] = Math.min(v, 1.0);
      });
    }
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.awc_mm == null) continue;
      var w = proxy[c.region];
      if (w == null) continue;
      out.push({ x: c.lon, y: c.lat, v: c.awc_mm * w,
                 name: (c.soil || 'soil') + ' \u2014 ' + c.awc_mm + ' mm capacity' +
                       (c.slope_pct != null ? ', ' + c.slope_pct + '% slope' : ''),
                 inCrop: inRings(c.lon, c.lat, rings), onGround: true });
    }
    return out;
  }

  function stationValues(day) {
    if (S.view === 'soilwater') return soilCellValues(day);
    var spec = CLASSES[S.crop] || CLASSES.PINTO;
    var p0 = plantIndex(spec);
    var all = S.field.stations;
    var rings = cropRings();
    var out = [];
    for (var s = 0; s < all.length; s++) {
      var st = all[s], v = null;
      if (S.view === 'cutworm') {
        /* Accumulates from 1 MARCH, not from planting — the moths do not wait for the crop.
         * The station file opens on 15 March, so the first fortnight is missing; it is worth
         * 36-79 DD here, about 1% of the scouting threshold, and is not filled in because
         * inventing it would be exactly the habit this project has been removing. The effect
         * is that flight reads a day late, which is the safe direction for a scouting call. */
        if (!st.has_temp) continue;
        var wseen = 0, wdd = 0;
        for (var w = 0; w <= day; w++) {
          var whi = st.hi[w], wlo = st.lo[w];
          if (whi == null || wlo == null) continue;
          wseen++;
          wdd += Math.max(Math.min((whi + wlo) / 2, 75) - 38, 0);
        }
        if (wseen < (day + 1) * MIN_WINDOW_COVER) continue;
        // 0% below 2,577; 25/50/75% at UNL's thresholds; linear between and beyond.
        v = wdd <= 2577 ? 25 * (wdd / 2577)
          : wdd <= 2704 ? 25 + 25 * (wdd - 2577) / (2704 - 2577)
          : wdd <= 2838 ? 50 + 25 * (wdd - 2704) / (2838 - 2704)
          : Math.min(100, 75 + 25 * (wdd - 2838) / 200);
      } else if (S.view === 'stage' || S.view === 'heat') {
        if (!st.has_temp) continue;
        var span = day - p0 + 1;
        if (span <= 0) continue;
        var seen = 0, gdd = 0, hot = 0;
        for (var i = p0; i <= day; i++) {
          var hi = st.hi[i], lo = st.lo[i];
          if (hi == null || lo == null) continue;
          seen++;
          gdd += Math.max((hi + lo) / 2 - spec.base, 0);
          if (hi >= spec.heat) hot++;
        }
        // Skipping a missing day is not neutral: it accumulates nothing and biases the total
        // low, which reads as a late crop rather than as a gappy record.
        if (seen < span * MIN_WINDOW_COVER) continue;
        v = S.view === 'stage' ? 100 * gdd / spec.gdd : hot;
      } else {
        if (!st.has_precip) continue;
        var ref = st.has_temp ? st : all[st.t_ref];
        if (!ref || !ref.has_temp) continue;
        if (!st.has_temp && st.t_ref_km != null && st.t_ref_km > MAX_BORROW_KM) continue;
        /* THE CROP'S OWN THIRST, not a lawn's. This subtracted grass-reference evaporation
           for every class, so one map served pinto, chickpea and pea alike, and a pea in
           April was charged the water demand of a July bean canopy. Reference ET is now
           scaled by a crop coefficient read from the crop's own growth stage, which we
           already know from its own growing-degree clock. Days before this class went in are
           not counted. FAO-56 in shape: ETc = Kc x ET0. */
        var pI = plantIndex(spec);
        var from = Math.max(Math.max(0, day - 29), pI);
        var days = Math.max(day - from + 1, 1), bal = 0, ok = 0, gddRun = 0;
        for (var g = pI; g < from; g++) {
          if (ref.hi[g] != null && ref.lo[g] != null)
            gddRun += Math.max((ref.hi[g] + ref.lo[g]) / 2 - spec.base, 0);
        }
        for (var k = from; k <= day; k++) {
          var e = et0(ref.hi[k], ref.lo[k], st.lat, doyOf(S.dates[k]));
          if (e == null) continue;             // a gap is a gap, not an average day
          ok++;
          if (ref.hi[k] != null && ref.lo[k] != null)
            gddRun += Math.max((ref.hi[k] + ref.lo[k]) / 2 - spec.base, 0);
          if (st.pr[k] != null) bal += st.pr[k] / 10;   // stored as tenths of a millimetre
          bal -= e * kc(gddRun / spec.gdd);
        }
        if (ok < days * MIN_WINDOW_COVER) continue;
        v = bal;
      }
      out.push({ x: st.lon, y: st.lat, v: v, name: st.name,
                 inCrop: inRings(st.lon, st.lat, rings), onGround: onCropGround(st) });
    }
    return out;
  }

  /* ---------------------------------------------------------------- colour */

  /* The scale is calibrated on the crop and view actually selected, across the whole season,
   * so the colours always use their full range and the legend states the numbers behind them.
   * A fixed scale invented up front either flattens a dry year into one colour or clips a wet one. */
  function domain() {
    // Relative: the scale is stretched to the selected date, so the wettest and driest corners
    // of the region separate even in a week when the whole region is dry. It cannot be compared
    // between dates, and the legend says so.
    if (S.interp === 'relative') {
      var v = stationValues(S.day).map(function (p) { return p.v; })
        .filter(function (x) { return x != null && isFinite(x); })
        .sort(function (a, b) { return a - b; });
      if (!v.length) return { lo: 0, hi: 1 };
      var qq = function (f) { return v[Math.floor((v.length - 1) * f)]; };
      var l = qq(0.05), h = qq(0.95);
      return { lo: l, hi: (h - l < 1e-6 ? l + 1 : h) };
    }
      // A view with an absolute meaning keeps an absolute scale, or the classes
      // normalise back into one picture.
      var fx = VIEWS[S.view] && VIEWS[S.view].fixed;
      if (fx) return fx;

    var key = S.crop + '|' + S.view;
    if (S.domainKey === key) return S.domainVal;
    var all = [], save = S.day;
    for (var i = 0; i < S.dates.length; i += 7) {
      S.day = i;
      stationValues(i).forEach(function (p) {
        if (p.v != null && isFinite(p.v)) all.push(p.v);
      });
    }
    S.day = save;
    all.sort(function (a, b) { return a - b; });
    var q = function (f) { return all[Math.floor((all.length - 1) * f)]; };
    var lo = all.length ? q(0.03) : 0, hi = all.length ? q(0.97) : 1;
    if (hi - lo < 1e-6) hi = lo + 1;
    S.domainKey = key; S.domainVal = { lo: lo, hi: hi };
    return S.domainVal;
  }

  function rampColor(t, ramp) {
    t = Math.max(0, Math.min(1, t));
    for (var i = 1; i < ramp.length; i++) {
      if (t <= ramp[i][0]) {
        var a = ramp[i - 1], b = ramp[i];
        var f = (t - a[0]) / (b[0] - a[0] || 1);
        return mix(a[1], b[1], f);
      }
    }
    return ramp[ramp.length - 1][1];
  }

  function hex(c) {
    return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
  }

  function mix(c1, c2, f) {
    var a = hex(c1), b = hex(c2);
    return [Math.round(a[0] + (b[0] - a[0]) * f),
            Math.round(a[1] + (b[1] - a[1]) * f),
            Math.round(a[2] + (b[2] - a[2]) * f)];
  }

  /* ---------------------------------------------------------------- surface */

  function commodityOf() { return (CLASSES[S.crop] || CLASSES.PINTO).commodity; }

  /* The ground this crop is actually grown on. Until now a single dry-bean outline was drawn
   * under all eighteen classes, so choosing garbanzos mapped chickpea agronomy onto bean
   * fields. Each commodity now carries its own footprint, from USDA county acreage. */

  /* PER REGION, NEVER POOLED. The cutworm sentence used to take the median across every
   * station on the crop's counties — a thousand miles of them. On 12 July 2026 that pooled
   * median was 24% and the site therefore said flight "has not reached the 25% scouting
   * mark". At that moment northwest Kansas was at 97%, southwest Nebraska at 60% and
   * northeast Colorado at 32%. Three of seven regions were past the mark and a Kansas grower
   * reading that sentence would not have gone out to scout.
   *
   * This project has already been burned by pooling once: the yield publish gate was pooled
   * rather than per state, and Wyoming shipped a failure hidden inside Nebraska's numbers.
   * PLAN.md records it and says any future gate must be per state. A sentence is a gate too.
   */
  function regionOf(lon, lat) {
    var fs = (S.outlines && S.outlines.features) || [];
    for (var i = 0; i < fs.length; i++) {
      if (inRings(lon, lat, ringsOf(fs[i]))) return fs[i].properties.region;
    }
    return null;
  }

  function selectedRegion() {
    var el = document.getElementById('region');
    return el && el.value ? el.value : null;
  }

  function cropOutline() {
    var com = commodityOf();
    return ((S.cropOutlines && S.cropOutlines.features) || []).filter(function (f) {
      return f.properties.commodity === com;
    });
  }

  /* The same floor the encircling outline was built with. A county carrying a few acres is a
   * rounding artefact of a 10-metre raster, not a growing county, and drawing one set of
   * counties inside a boundary built from a different set makes both untrustworthy. */
  var MIN_COUNTY_ACRES = 40;

  function cropCounties() {
    var com = commodityOf();
    return ((S.counties && S.counties.features) || []).filter(function (f) {
      return ((f.properties.acres || {})[com] || 0) >= MIN_COUNTY_ACRES;
    });
  }

  function ringsOf(feature) {
    var g = feature.geometry;
    if (g.type === 'Polygon') return g.coordinates;
    var out = [];
    g.coordinates.forEach(function (p) { p.forEach(function (r) { out.push(r); }); });
    return out;
  }

  function clipPath(ctx) {
    ctx.beginPath();
    cropOutline().forEach(function (f) {
      ringsOf(f).forEach(function (ring) {
        ring.forEach(function (pt, i) {
          var p = S.map.latLngToContainerPoint([pt[1], pt[0]]);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
      });
    });
    ctx.clip();
  }

  /* Inverse distance weighting, clipped to the growing regions. Outside a growing region the
   * surface is not drawn at all — painting a soil-moisture value across rangeland that grows no
   * beans is the kind of false precision that gets a tool distrusted. */
  function paintSurface() {
    if (!S.map || !S.canvas || !S.field || !S.cropOutlines) return;
    if (VIEWS[S.view].regional) {
      var g2 = S.canvas.getContext('2d');
      g2.setTransform(1, 0, 0, 1, 0, 0);
      g2.clearRect(0, 0, S.canvas.width, S.canvas.height);
      paintRegions();
      return;
    }
    clearRegionPaint();
    var size = S.map.getSize();
    // A pane that has not been laid out yet reports zero, and createImageData throws on it —
    // which killed the entire load rather than one frame. Wait for a real size instead.
    if (!size || size.x < 8 || size.y < 8) {
      setTimeout(function () { try { S.map.invalidateSize(); paintSurface(); } catch (e) {} }, 250);
      return;
    }
    var dpr = window.devicePixelRatio || 1;
    S.canvas.width = size.x * dpr; S.canvas.height = size.y * dpr;
    S.canvas.style.width = size.x + 'px'; S.canvas.style.height = size.y + 'px';
    var ctx = S.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);

    var view = VIEWS[S.view], dom = domain();
    /* Only stations on the crop's own ground may colour it. Without this the canvas
     * interpolated across every station in four states, mountains included, while the
     * sentence underneath was computed from in-county stations only — the surface and the
     * summary describing different places, which is the exact fault this file records
     * having fixed once already. */
    var pts = stationValues(S.day).filter(function (p) {
      return p.v != null && isFinite(p.v) && p.onGround;
    });
    if (!pts.length) return;

    // Project stations once, not per pixel.
    var proj = pts.map(function (p) {
      var c = S.map.latLngToContainerPoint([p.y, p.x]);
      return { x: c.x, y: c.y, v: p.v };
    });

    /* Bucket the stations by screen position so each pixel only weighs its neighbours.
     * Against fifteen hundred stations, weighing every one at every sample point is twenty
     * million distance calculations a frame, and playback stops being playback. Nothing beyond
     * a couple of buckets away carries meaningful weight under inverse-cube anyway. */
    var BUCKET = 90;
    var grid = {};
    for (var b = 0; b < proj.length; b++) {
      var key = (proj[b].x / BUCKET | 0) + ':' + (proj[b].y / BUCKET | 0);
      (grid[key] || (grid[key] = [])).push(proj[b]);
    }
    var near = function (px, py) {
      var bx = px / BUCKET | 0, by = py / BUCKET | 0;
      for (var span = 1; span <= 4; span++) {
        var found = [];
        for (var ax = bx - span; ax <= bx + span; ax++) {
          for (var ay = by - span; ay <= by + span; ay++) {
            var cell = grid[ax + ':' + ay];
            if (cell) found = found.concat(cell);
          }
        }
        if (found.length >= 4 || span === 4) return found;
      }
      return proj;
    };

    ctx.save();
    clipPath(ctx);
    var STEP = 6;                              // coarse grid, then blurred — smooth and quick
    var img = ctx.createImageData(Math.ceil(size.x / STEP), Math.ceil(size.y / STEP));
    var W = img.width, H = img.height, d = img.data;
    for (var gy = 0; gy < H; gy++) {
      for (var gx = 0; gx < W; gx++) {
        var px = gx * STEP, py = gy * STEP, num = 0, den = 0;
        var use = near(px, py);
        for (var i = 0; i < use.length; i++) {
          var dx = use[i].x - px, dy = use[i].y - py;
          var d2 = dx * dx + dy * dy;
          if (d2 < 1) { num = use[i].v; den = 1; break; }
          var w = 1 / (d2 * Math.sqrt(d2));    // inverse cube: keeps local detail
          num += use[i].v * w; den += w;
        }
        var val = den ? num / den : 0;
        var c = rampColor((val - dom.lo) / (dom.hi - dom.lo), view.ramp);
        var o = (gy * W + gx) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 214;
      }
    }
    var tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, W, H, 0, 0, W * STEP, H * STEP);
    ctx.restore();
  }

  /* ---------------------------------------------------------------- map */

  var HEALTH_RANK = { 'AT RISK': 0, 'STRESSED': 0.25, 'LATE': 0.5, 'WATCH': 0.75, 'ON TRACK': 1 };

  /* Yield and crop health are estimated for a region as a whole, from that region's own class
   * history and season. They are not a field-scale surface, so they are painted as flat
   * counties with their boundaries showing, and the tooltip says which region the number
   * actually belongs to. Smoothing them would invent precision the estimate does not have. */
  /* The model's own words for the selected date, or null where it refuses to publish.
   * Refusing is not a failure state to be hidden — before 15 June this model is worse than
   * guessing the historical median, and a number shown then would be worse than no number. */
  function modelValue(region) {
    if (S.crop !== 'PINTO') return null;      // fitted on pinto; no other class has a model yet
    var r = S.outlook && S.outlook.regions && S.outlook.regions[region];
    var row = r && r.dates && r.dates[S.dates[S.day]];
    if (!row) return null;
    if (row.eligibility !== 'PUBLISHED' || row.yield_lb_ac == null) {
      return { withheld: true, why: row.eligibility || 'no model state for this date',
               median: row.historical_median_lb_ac };
    }
    var change = row.change_vs_historical_median_lb_ac || 0;
    var med = row.historical_median_lb_ac || row.yield_lb_ac;
    var pct = med ? 100 * change / med : 0;
    return {
      t: Math.max(0, Math.min(1, (pct + 12) / 24)),
      label: Math.round(row.yield_lb_ac).toLocaleString() + ' lb/ac',
      yield: row.yield_lb_ac, interval: row.yield_interval_lb_ac,
      median: med, change: change,
      mae: row.hindcast_mae_lb_ac, baseline: row.baseline_mae_lb_ac,
      stage: row.stage
    };
  }

  /* Rank against the same calendar date in every prior season. A rank is honest in a way a
   * percentage is not: it makes no claim about how much, only about where this year sits. */
  function monthDay(md) {
    var M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
             'September', 'October', 'November', 'December'];
    var p = md.split('-');
    return M[parseInt(p[0], 10) - 1] + ' ' + parseInt(p[1], 10);
  }

  function historyValue(region) {
    // EACH CROP'S OWN GROUND. This read S.vsHistory.regions, which is dry-bean ground and
    // nothing else, so a chickpea or a lentil was shown the beans' history under the heading
    // "Crop vs its own history". GAJ caught it on the finished page.
    var crops = S.vsHistory && S.vsHistory.crops;
    var byCrop = crops && crops[commodityOf()];
    var h = (byCrop && byCrop[region]) ||
            (S.vsHistory && S.vsHistory.regions && S.vsHistory.regions[region]);
    if (!h) return null;

    /* THE SEASON, NOT ONE PASS. This read a single satellite date and led with it. Adjacent
       passes swing twenty points — chickpeas in the Panhandle ran -19.7% on 5 August and
       +11.3% on 5 September — and the date it happened to pick was after chickpea harvest,
       so it compared this year's stubble with past years' stubble. Every headline on this
       view was wrong in size and several were wrong in SIGN: south-east Wyoming chickpeas
       showed +16.6% when the season is -4.3%. Averaging every in-season pass to date against
       the same stretch of every past season is the honest comparison. */
    var std = h.season_to_date;
    if (std) {
      return {
        t: Math.max(0, Math.min(1, (std.vs_mean_pct + 15) / 30)),
        label: (std.vs_mean_pct > 0 ? '+' : '') + std.vs_mean_pct + '% vs normal',
        rank: std.rank, of: std.of, pct: std.vs_mean_pct,
        band: std.band, typical: std.typical, years: std.n_years,
        passes: std.passes, window: std.window, seasonToDate: true,
        band_lo: null, now: std.now
      };
    }
    if (!h) return null;
    var md = S.dates[S.day].slice(5);
    // Dates late in the season carry the 26-year history but no reading yet — the satellite
    // passes every eight to ten days while the station record advances daily. A bucket that
    // exists but holds no pass is as empty as a missing one; fall back to the last real pass
    // rather than telling a grower there is nothing to see.
    var row = h.dates[md], used = md;
    if (!row || row.now == null) {
        var keys = Object.keys(h.dates).filter(function (k) {
          return k <= md && h.dates[k] && h.dates[k].now != null;
        }).sort();
        used = keys.length ? keys[keys.length - 1] : null;
        row = used ? h.dates[used] : null;
    }
    if (!row || row.now == null) return null;
    return {
      asOf: used, stale: used !== md,
      // COLOUR BY HOW BIG THE DIFFERENCE IS, NOT WHERE IT RANKS. Ranking painted every
      // positive season at the top of the ramp: a crop 2% above average and one 17% above
      // average both came out solid green, because both ranked near the top of a tight
      // field. The scale is now +/-15% around normal, wider than almost any season on
      // record, so an ordinary year looks ordinary.
      t: Math.max(0, Math.min(1, (row.vs_mean_pct + 15) / 30)),
      // The percentage leads. A rank alone made a 2% year read as a standout because the
      // seasons sit inside a 12% spread and every positive year climbs the ranking.
      label: (row.vs_mean_pct > 0 ? '+' : '') + row.vs_mean_pct + '% vs normal',
      rank: row.rank, of: row.of, pct: row.vs_mean_pct,
      band: row.band, typical: row.typical, years: row.n_years,
      band: [row.min, row.p20, row.mean, row.p80, row.max], now: row.now
    };
  }

  function regionValue(region) {
    if (VIEWS[S.view].realtime) return historyValue(region);
    if (VIEWS[S.view].model) return modelValue(region);
    var a = S.answers && S.answers.regions && S.answers.regions[region];
    var c = a && a.classes && a.classes[S.crop];
    if (!c) return null;
    if (S.view === 'health') {
      var st = window.__nbCropStatus || {};
      if (st.crop !== S.crop) return null;     // never paint one crop with another's call
      var call = (st.byRegion || {})[region];
      return call && HEALTH_RANK[call] != null ? { t: HEALTH_RANK[call], label: call } : null;
    }
    var y = c.yield;
    if (!y || !y.baseline) return null;
    var pct = 100 * (y.mid - y.baseline) / y.baseline;
    return { t: Math.max(0, Math.min(1, (pct + 20) / 40)),
             label: Math.round(y.mid).toLocaleString() + ' lb/ac',
             low: y.low, high: y.high, baseline: y.baseline };
  }

  function countyTip(p, com, v) {
    var head = '<b>' + p.county + ' County, ' + p.state + '</b><br>' +
      Math.round(p.acres[com]).toLocaleString() + ' acres of ' + com.toLowerCase();
    if (VIEWS[S.view].realtime) {
      if (!v) return head + '<br><i>No satellite pass on this crop\'s ground yet.</i>';
      return head + '<br><b>' + v.label + '</b> for this date, ' +
        (v.pct >= 0 ? '+' : '') + v.pct + '% against its own 26-year average' +
        '<br><i>Observed from space over bean ground. Not a forecast, and not a USDA figure.</i>';
    }
    if (VIEWS[S.view].model) {
      if (!v) return head + '<br><i>No model for ' + S.crop + '. The model is fitted on ' +
        'pinto only.</i>';
      if (v.withheld) return head + '<br><b>Withheld</b><br>' + v.why +
        (v.median ? '<br>History for this area: ' + Math.round(v.median).toLocaleString() +
          ' lb/ac' : '');
      return head + '<br><b>' + v.label + '</b>' +
        (v.interval ? ' · ' + Math.round(v.interval[0]).toLocaleString() + '–' +
          Math.round(v.interval[1]).toLocaleString() + ' lb/ac' : '') +
        '<br>' + (v.change >= 0 ? '+' : '') + Math.round(v.change).toLocaleString() +
        ' lb/ac against a ' + Math.round(v.median).toLocaleString() + ' lb/ac history' +
        '<br><i>Fitted and graded on ' + p.state + ' state yield. This region\'s weather runs ' +
        'through it; the county is shown because it grows the crop, not because it was ' +
        'modelled separately.</i>';
    }
    return head +
      (v ? '<br>' + S.crop + ' — ' + v.label +
           (v.baseline ? '<br>' + Math.round(v.low).toLocaleString() + '–' +
             Math.round(v.high).toLocaleString() + ' lb/ac against a ' +
             Math.round(v.baseline).toLocaleString() + ' lb/ac average' : '') +
           '<br><i>A flag computed from state-level weather and applied to ' +
             regionName(p.region) + '. Nothing here was measured in this county.</i>'
         : '');
  }

  function paintRegions() {
    if (!S.layers.counties) return;
    var view = VIEWS[S.view], com = commodityOf();
    S.layers.counties.eachLayer(function (layer) {
      var p = layer.feature.properties;
      var v = regionValue(p.region);
      layer.setStyle(v && !v.withheld
        ? { fillOpacity: 0.72, fillColor: 'rgb(' + rampColor(v.t, view.ramp).join(',') + ')',
            weight: 0.7, color: '#42514a', opacity: 0.6 }
        : { fillOpacity: 0.1, fillColor: '#8a938c', weight: 0.7, color: '#5c6b60', opacity: 0.45 });
      layer.bindTooltip(countyTip(p, com, v), { sticky: true });
    });
  }

  function clearRegionPaint() {
    if (!S.layers.counties) return;
    var com = commodityOf();
    S.layers.counties.eachLayer(function (layer) {
      layer.setStyle({ fillOpacity: 0.01, fillColor: '#ffffff',
                       weight: 0.7, color: '#5c6b60', opacity: 0.45 });
      layer.bindTooltip(countyTip(layer.feature.properties, com, null), { sticky: true });
    });
  }

  function drawOutlines() {
    ['counties', 'outline'].forEach(function (k) {
      if (S.layers[k]) { S.map.removeLayer(S.layers[k]); S.layers[k] = null; }
    });
    var com = commodityOf();

    /* County lines, underneath. Growers, elevators and brokers all talk in counties; a boundary
     * they already recognise is worth more than a smooth shape they cannot place. */
    S.layers.counties = window.L.geoJSON(
      { type: 'FeatureCollection', features: cropCounties() }, {
        style: function () {
          return { color: '#5c6b60', weight: 0.7, opacity: 0.45, fill: true,
                   fillColor: '#ffffff', fillOpacity: 0.01 };
        },
        onEachFeature: function (f, layer) {
          layer.bindTooltip(countyTip(f.properties, com, null), { sticky: true });
        }
      }).addTo(S.map);

    S.layers.outline = window.L.geoJSON(
      { type: 'FeatureCollection', features: cropOutline() }, {
        style: function () {
          return { color: '#14212b', weight: 2, opacity: 0.95, fill: false };
        },
        interactive: false
      }).addTo(S.map);
  }

  function inRings(lon, lat, rings) {
    var inside = false;
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if ((yi > lat) !== (yj > lat) &&
            lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  }

  /* Only the stations standing on this crop's ground are drawn.
   * The network behind the surface is fifteen hundred sites across four states; plotting all of
   * them buries the map under dots and tells a grower nothing about the field in front of him.
   * The ones shown are the ones whose readings are actually shaping what he is looking at, and
   * the readout states the full count that stands behind the number. */
  function drawStations() {
    if (S.layers.stations) S.map.removeLayer(S.layers.stations);
    var rings = [];
    cropOutline().forEach(function (f) { rings = rings.concat(ringsOf(f)); });
    if (VIEWS[S.view] && VIEWS[S.view].cellSource) {
      // The dots on this layer would be thermometers, and the layer is not made of
      // thermometers. Showing them would say the soil figure came from them.
      S.stationsShown = 0;
      return;
    }
    var wanted = S.view === 'moisture' ? 'has_precip' : 'has_temp';
    var on = S.field.stations.filter(function (st) {
      return st[wanted] && inRings(st.lon, st.lat, rings);
    });

    /* Markers are thinned for legibility, one to a cell. Every station still feeds the surface
     * — the readout states the full count — but a map buried under dots hides the very thing
     * the dots are there to support. */
    var CELL = 0.26, pick = {};
    on.forEach(function (st) {
      var k = Math.round(st.lon / CELL) + ':' + Math.round(st.lat / CELL);
      if (!pick[k] || (st.has_temp && !pick[k].has_temp)) pick[k] = st;
    });

    var g = window.L.layerGroup();
    Object.keys(pick).forEach(function (k) {
      var st = pick[k];
      window.L.circleMarker([st.lat, st.lon], {
        radius: 2.4, color: '#12463d', weight: 0.8, opacity: 0.65,
        fillColor: '#2a9d9a', fillOpacity: 0.62
      }).bindTooltip(st.name + ' — ' +
        (st.has_temp ? 'temperature and rainfall' : 'rainfall only'), { sticky: true }).addTo(g);
    });
    S.layers.stations = g.addTo(S.map);
    S.stationsShown = on.length;
  }

  /* Open on the counties that carry the crop, weighted by acreage.
   * A commodity's outline can reach a long way — chickpeas turn up in a scatter of counties
   * from the Wyoming line to western Colorado — and fitting the whole reach zooms the ground
   * that actually grows it down to a smudge. The rest is a click away on "Show every region". */
  function coreBounds() {
    var com = commodityOf();
    var counties = cropCounties().slice().sort(function (x, y) {
      return y.properties.acres[com] - x.properties.acres[com];
    });
    if (!counties.length) return null;
    var total = counties.reduce(function (t, f) { return t + f.properties.acres[com]; }, 0);
    var run = 0, b = window.L.latLngBounds([]);
    for (var i = 0; i < counties.length; i++) {
      ringsOf(counties[i]).forEach(function (ring) {
        ring.forEach(function (pt) { b.extend([pt[1], pt[0]]); });
      });
      run += counties[i].properties.acres[com];
      if (run >= total * 0.8 && i >= 2) break;
    }
    return b.pad(0.12);
  }

  function regionName(id) {
    return id.split('-').map(function (w) {
      return w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  /* ---------------------------------------------------------------- playback */

  function phaseBars() {
    var spec = CLASSES[S.crop] || CLASSES.PINTO;
    var n = S.dates.length - 1;
    var pI = plantIndex(spec);
    var pct = function (i) { return Math.max(0, Math.min(100, 100 * i / n)); };

    // Harvest opens when the median station first reaches maturity, on this year's weather.
    var save = S.day, harvest = null;
    for (var i = pI; i <= n; i += 3) {
      S.day = i;
      var was = S.view; S.view = 'stage';
      var vals = stationValues(i).map(function (p) { return p.v; }).sort(function (a, b) { return a - b; });
      S.view = was;
      if (vals.length && vals[Math.floor(vals.length / 2)] >= 100) { harvest = i; break; }
    }
    S.day = save;

    var bars = [{ from: pct(Math.max(0, pI - 10)), to: pct(pI + 10),
                  cls: 'nbPhasePlant', text: 'Planting ' + monthSpan(Math.max(0, pI - 10), pI + 10) }];
    if (harvest != null) {
      bars.push({ from: pct(harvest), to: pct(Math.min(n, harvest + 30)),
                  cls: 'nbPhaseHarvest', text: 'Harvest ' + monthSpan(harvest, Math.min(n, harvest + 30)) });
    }
    return bars.map(function (b) {
      // A band that ends near the right edge would push its label off the track, which on a
      // phone clips the word that says what the band is.
      var mid = (b.from + b.to) / 2;
      var edge = mid > 72 ? ' nbPhaseEnd' : (mid < 20 ? ' nbPhaseStart' : '');
      return '<div class="nbPhase ' + b.cls + edge + '" style="left:' + b.from + '%;width:' +
        Math.max(b.to - b.from, 4) + '%"><span>' + b.text + '</span></div>';
    }).join('');
  }

  function monthSpan(a, b) {
    var M = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
             'August', 'September', 'October', 'November', 'December'];
    var m1 = M[Number(S.dates[a].slice(5, 7)) - 1], m2 = M[Number(S.dates[b].slice(5, 7)) - 1];
    return m1 === m2 ? m1 : m1 + '–' + m2;
  }

  function niceDate(iso) {
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Number(iso.slice(8)) + ' ' + M[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4);
  }

  function setDay(i, repaintBars) {
    S.day = Math.max(0, Math.min(S.dates.length - 1, i));
    var sl = $('nbSlider'); if (sl && Number(sl.value) !== S.day) sl.value = S.day;
    var lab = $('nbDate'); if (lab) lab.textContent = niceDate(S.dates[S.day]);
    paintSurface();
    updateReadout();
    updateEstimate();
    if (S.interp === 'relative' || VIEWS[S.view].model) updateLegend();
    if (repaintBars) { var ph = $('nbPhases'); if (ph) ph.innerHTML = phaseBars(); }
  }

  function play() {
    if (S.playing) return stop();
    S.playing = true;
    var btn = $('nbPlay'); if (btn) btn.innerHTML = '<span class="nbIcon">❚❚</span> Pause';
    var tick = function () {
      if (!S.playing) return;
      var next = S.day + S.frame;
      if (next > S.dates.length - 1) next = 0;
      setDay(next);
      S.timer = setTimeout(tick, 320 / S.speed);
    };
    tick();
  }

  function stop() {
    S.playing = false;
    clearTimeout(S.timer);
    var btn = $('nbPlay'); if (btn) btn.innerHTML = '<span class="nbIcon">▶</span> Play';
  }

  /* ---------------------------------------------------------------- readout */

  /* The estimate, shown as the observations that produced it.
   *
   * A bare 1,507 lb/ac is false precision wearing a decimal point: tested against USDA over
   * 2016-2023 the model did not rank seasons correctly, and its error cannot be separated from
   * a scorecard that revised Nebraska's planted acres 21% inside one season. What IS defensible
   * is every measurement behind it, and the physics that turns them into a number — calibrating
   * published dry-bean light-use efficiency and harvest index moved them by 5%.
   *
   * So the evidence leads and the figure follows, with its limits written next to it. A grower
   * can then judge the reasoning instead of trusting the output. */
  /* How much of this crop's ground is irrigated, by region.
     This is deliberately NOT fed into the yield number yet -- it is measured and shown first,
     so the figure can be checked against what growers know before anything depends on it. */
  /* Says so, loudly, when the weight is borrowed from another state rather than measured
     here. A number without this line would be indistinguishable from a USDA-backed one, which
     is the difference between a proxy and a fabrication. */
  function proxyLine() {
    var com = commodityOf();
    var kinds = [];
    var regions = (S.yieldIndex && S.yieldIndex.regions) || {};
    Object.keys(regions).forEach(function (rk) {
      var c = (regions[rk].classes || {})[S.crop];
      if (c && c.level_kind === 'proxy') kinds.push(rk);
    });
    if (!kinds.length) return '';
    return '<p class="nbEstLimit nbProxy">' +
      window.NB_TEXT.t('estimate.proxyLevel') + '</p>';
  }

  function irrigationLine() {
    var ir = S.irrigation && S.irrigation.crops && S.irrigation.crops[commodityOf()];
    if (!ir) return '';
    var rows = Object.keys(ir).map(function (k) { return ir[k]; })
      .sort(function (a, b) { return b.irrigated_share_of_ground - a.irrigated_share_of_ground; });
    if (!rows.length) return '';
    var figures = rows.map(function (r) {
      return r.name + ' ' + Math.round(r.irrigated_share_of_ground) + '%';
    }).join(', ');
    return '<p class="nbEstLimit">' + window.NB_TEXT.t('estimate.irrigated', {
      crop: (S.crop || '').toLowerCase(),
      figures: figures,
      year: S.irrigation.crop_year_of_layer
    }) + '</p>';
  }

  /* HOW DEEP THE WATER IS. Sits beside the irrigation share because they answer the same
   * grower question from opposite ends — how much of this ground is watered, and how far down
   * the water is now.
   *
   * IT IS AN OBSERVATION AND THE TEXT SAYS SO. Groundwater was tested as a yield predictor on
   * 17 September 2026 across 469 county-years, forward-only, and returned +0.7% against a
   * trend baseline with a confidence interval of [-1.4, +8.9]. It failed. Nothing on this
   * page may imply it forecasts anything, and a check in verify_data.py asserts that no yield
   * or pest script even reads the file.
   *
   * Two things are shown that a single number would hide: a region resting on fewer than
   * eight wells is called an anecdote, and where the radius pulls most of a region's wells
   * across a state line the sentence names that state. Se-wyoming's reading is 765 Nebraska
   * wells and one Wyoming well; calling that "southeast Wyoming" without saying so would be
   * the label doing work the data does not support. */
  function groundwaterLine() {
    var gw = S.groundwater && S.groundwater.regions;
    var rgn = selectedRegion();
    var r = gw && rgn && gw[rgn];
    if (!r || r.median_depth_to_water_ft == null) return '';
    var txt = '<b>Water table under ' + regionName(rgn) + ': ' +
      r.median_depth_to_water_ft + ' ft down</b> at the median monitored well';
    if (r.enough_wells) {
      txt += ' of ' + r.wells.toLocaleString() + ', from ' + r.shallowest_tenth_ft +
        ' ft in the shallowest tenth to ' + r.deepest_tenth_ft + ' ft in the deepest. ' +
        'Latest reading ' + niceDate(r.newest_reading) + '.';
    } else {
      txt += '. <b>This rests on ' + r.wells + (r.wells === 1 ? ' well' : ' wells') +
        '</b> — an anecdote, not a regional figure. Read it as one measurement.';
    }
    if (r.mostly_from_another_state) {
      txt += ' Most of these wells are in ' + r.mostly_from_another_state +
        '; the aquifer crosses the state line even where the name does not.';
    }
    /* THE RATE IS THE PART NOBODY ELSE PUBLISHES, and for this region it is reassuring
     * rather than alarming — which is exactly why it is worth saying. A grower reading
     * national coverage of the Ogallala will assume the worst about ground that is holding.
     * The Panhandle has fallen about four feet in ninety-five years. */
    var tr = r.trend;
    if (tr) {
      var per20 = Math.abs(tr.feet_over_20_years);
      txt += ' <b>Over ' + tr.years + ' it has ' +
        (tr.direction === 'falling' ? 'fallen' : 'risen') + ' about ' +
        Math.abs(tr.feet_per_year).toFixed(2) + ' ft a year</b> \u2014 ' +
        (per20 < 3
          ? 'roughly ' + per20.toFixed(0) + ' ft in twenty years, which is close to steady.'
          : 'about ' + per20.toFixed(0) + ' ft every twenty years at that pace.') +
        ' Measured across ' + tr.wells_fitted.toLocaleString() +
        ' wells, each against its own average. Source: ' + tr.source + '.';
    } else {
      txt += ' <b>No rate is published for this region.</b> A trend may only be fitted from ' +
        'wells in this region\u2019s own state, and not enough of them publish a long enough ' +
        'history. It is not borrowed from a neighbour.';
    }
    txt += ' <i>This is what is measured, not a forecast. We tested whether a falling water ' +
      'table predicts yield and it does not \u2014 the decline is steady enough that a trend ' +
      'line already accounts for it. It is here because it is worth knowing on its own.</i>';
    return '<p class="nbEstLimit">' + txt + '</p>';
  }

  function updateEstimate() {
    var el = $('nbEstimate'); if (!el || !S.yieldAll) return;
    var seen = {}, regions = [];
    cropCounties().forEach(function (f) {
      var rg = f.properties.region;
      if (seen[rg]) return;
      seen[rg] = 1;
      var r = S.yieldAll.regions[rg];
      if (r && r.classes[S.crop]) regions.push({ id: rg, r: r, c: r.classes[S.crop] });
    });
    if (!regions.length) { el.hidden = true; return; }
    regions.sort(function (a, b) { return b.c.lb_ac - a.c.lb_ac; });
    var best = regions[0], worst = regions[regions.length - 1];

    function idxFor(id) {
      var r = S.yieldIndex && S.yieldIndex.regions && S.yieldIndex.regions[id];
      return r && r.classes ? r.classes[S.crop] : null;
    }
    // only rows that actually carry a pounds figure — a class with no harvested baseline
    // has an index but no level, and asking it for one threw and took the whole render down
    var withIdx = regions.filter(function (x) {
      var i = idxFor(x.id); return i && typeof i.lb_ac === 'number';
    });
    withIdx.sort(function (a, b) { return idxFor(b.id).lb_ac - idxFor(a.id).lb_ac; });
    var bestY = withIdx[0], worstY = withIdx[withIdx.length - 1];

    var ranked = regions.filter(function (x) { return x.r.canopy_rank; });
    ranked.sort(function (a, b) {
      return (a.r.canopy_rank.rank / a.r.canopy_rank.of) - (b.r.canopy_rank.rank / b.r.canopy_rank.of);
    });
    var worstRank = ranked[0], bestRank = ranked[ranked.length - 1];
    if (!bestRank) { el.hidden = true; return; }

    /* Does ANY region publish pounds for this crop? If none does, the two yield columns are not
     * filled with dashes — they are not drawn at all. */
    var anyYield = regions.some(function (x) {
      var i = idxFor(x.id);
      return i && typeof i.lb_ac_low === 'number';
    });

    var rows = regions.map(function (x) {
      var ix = idxFor(x.id);
      return '<tr><td>' + x.r.name + '</td>' +
        (anyYield
          ? '<td class="nbNum">' + (ix && typeof ix.lb_ac_low === 'number'
              ? ix.lb_ac_low.toLocaleString() + '\u2013' + ix.lb_ac_high.toLocaleString()
              : 'not published') + '</td>' +
            '<td class="nbNum">' + (ix && ix.vs_normal_pct != null && ix.lb_ac
              ? (ix.vs_normal_pct > 0 ? '+' : '') + Math.round(ix.vs_normal_pct) + '%' : '—') +
            '</td>'
          : '') +
        '<td class="nbNum">' + (x.c.flowering_window_days
          ? x.c.flowering_hot_days + ' of ' + x.c.flowering_window_days : '—') + '</td>' +
        // SAME SOURCE AS THE MAP. This column read a single satellite date out of
        // yield-all-2026.json while the map above it read the season, so the two could — and
        // did — disagree. It now calls the identical function the surface is painted from.
        '<td class="nbNum">' + (function () {
          var hv = historyValue(x.id);
          return hv ? (hv.pct > 0 ? '+' : '') + hv.pct + '%' : '—';
        })() + '</td>' +
        '<td class="nbNum">' + x.c.pct_of_maturity + '%</td></tr>';
    }).join('');

    /* Whole sentences from the text file, in plain words. This block was thirty-four lines of
       glued fragments — untranslatable, and reading grade 17 at its worst. The table headings
       stay short because a heading has no room for a sentence. */
    var T = window.NB_TEXT;
    var heatF = best.c.heat_threshold_f || 90;
    el.innerHTML =
      '<h3>' + S.crop + ' 2026 \u2014 where the crop stands now</h3>' +
      '<p class="nbEstLead">' + (anyYield ? T.t('estimate.lead2')
        : 'We publish no yield estimate for ' + S.crop.toLowerCase() + '. Tested against every '
          + 'harvest USDA has published for it in these states, our model could not call the '
          + 'year, and the historical average is a yardstick rather than an answer. What '
          + 'follows is what we measured.') + '</p>' +
      '<div class="nbTableWrap">' +
      /* THE POUNDS COLUMN DISAPPEARS WHEN THERE ARE NO POUNDS.
       *
       * Dry beans stopped publishing a yield on 18 September, and this table kept its "est.
       * lb/ac" heading and filled every cell with an em dash and "0%". Seven rows of nothing,
       * under a heading promising a number. Withdrawing a figure has to withdraw the column it
       * lived in, or the page still promises what it no longer delivers — and "0%" reads as
       * "normal", which is the exact claim we removed the number to avoid making. */
      '<table class="nbYieldTable"><thead><tr><th>region</th>' +
      (anyYield ? '<th>est. lb/ac</th><th>vs normal</th>' : '') +
      '<th>hot days in flower</th><th>greenness vs normal</th>' +
      '<th>of heat needed</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      (bestY ? '<p class="nbEstNum">' + T.t('estimate.bestWorst', {
          bestRegion: '<b>' + bestY.r.name + '</b>',
          bestYield: idxFor(bestY.id).lb_ac.toLocaleString() + ' lb/ac',
          worstRegion: '<b>' + worstY.r.name + '</b>',
          worstYield: idxFor(worstY.id).lb_ac.toLocaleString() + ' lb/ac' }) + '</p>' : '') +
      '<p class="nbEstNum">' + T.t('flower.heat', {
          threshold: T.temp((heatF - 32) * 5 / 9), crop: S.crop.toLowerCase() }) + ' ' +
        T.t('flower.disagree') +
        /* This sentence says hot years have not yielded less here, which is measured and
         * correct, and it sat under a headline blaming the heat. Both cannot stand unexplained
         * on one page. The tension is now named rather than left for the reader to trip over —
         * it is a genuine disagreement between the agronomy and our own harvest record, and
         * saying so is more useful than quietly dropping one side. */
        ' <b>This cuts against what you may expect.</b> Heat at flowering is known to cost ' +
        'pods, and this season ran hot in every area we cover. But across ten years of real ' +
        'harvests on THIS ground, hot years have not come in lighter. We report both, and we ' +
        'do not pretend the disagreement is settled.</p>' +
      /* THIS WHOLE BLOCK WAS WRITTEN FOR A NUMBER THAT IS NO LONGER HERE.
       *
       * With dry bean yields withdrawn the panel still read "This is an educated estimate...",
       * "Read this before you use the number", "The range shows how much this signal moves",
       * "Hot days are not subtracted from this number" — four references to a figure that is
       * not on the page. Worse, it told the reader that hot years have not yielded less here,
       * which is TRUE and measured, directly underneath a headline that had just blamed the
       * heat. The page argued with itself and the newer half was the wrong half.
       *
       * So the text now follows the number. Where a yield is published the original wording
       * stands unchanged. Where it is withdrawn the panel says what it actually is: a set of
       * measurements, with our own finding that none of them has been shown to predict this
       * crop's yield on this ground. */
      (anyYield
        ? '<p class="nbEstLimit"><b>What this is.</b> ' + T.t('estimate.whatItIs') + ' ' +
            T.t('estimate.howBuilt') + '</p>'
        : '<p class="nbEstLimit"><b>What this is.</b> A set of measurements. It is <b>not a ' +
            'forecast we have proved</b>, and it is not a measurement of your field. We run the ' +
            'same model over this season and over the last 11 seasons and compare the two, ' +
            'which cancels out the parts we cannot measure well \u2014 but for this crop that ' +
            'comparison has never beaten simply assuming an average year, so we publish no ' +
            'figure from it. The columns above are what we measured.</p>') +
      /* THE HESITATION GOES FIRST, NOT IN A FOOTNOTE. The county skill test finished on
         17 September 2026 and this estimate lost to a straight line through past yields in
         five of seven state-by-state tests, and tied in the other two. GAJ's call is to keep
         publishing the number — it is the best reading available before harvest — and to say
         plainly what it is worth. A number without this paragraph reads like a forecast that
         has been validated. It has not. */
      (anyYield
        ? '<p class="nbEstLimit nbEstCaveat"><b>What we cannot claim.</b> ' +
            T.t('estimate.neverBeatenTrend') + '</p>'
        : '<p class="nbEstLimit nbEstCaveat"><b>What we cannot claim.</b> We tested whether ' +
            'anything we measure predicts this crop\u2019s yield here \u2014 heat during ' +
            'flowering, soil water from two independent readings, winter recharge, warm ' +
            'nights, how far the water table has fallen. Scored against every harvest USDA has ' +
            'published for this crop in these states, with each year held out of its own ' +
            'baseline, none of them beat simply assuming an average year. That is why there is ' +
            'no number above and why we do not tell you which way the crop is going. The ' +
            'measurements are real. What they are worth for predicting your yield, on this ' +
            'ground, we have not been able to show.</p>') +
      '<p class="nbEstLimit"><b>When to trust your own field instead.</b> ' +
        T.t('estimate.yourField') + '</p>' +
      /* NOTHING REMOVED, JUST ONE CLICK AWAY. Ten caveat paragraphs were stacked here at equal
       * weight, so the two that can change a decision — the estimate has never beaten a trend
       * line, and when to believe your own field over it — carried no more emphasis than the
       * note about how bean classes are levelled. A reader skims that, and skimming is how a
       * caveat gets missed.
       *
       * The two that matter stay above, always visible. The rest fold into one disclosure,
       * open with a click, every word intact. GAJ's standing rule is that every extra panel is
       * a fault, and he asked whether the page could be simplified WITHOUT LOSING CONTENT.
       * This is the only honest way to do that: change the weight, not the words. */
      '<details class="nbEstMore"><summary>' +
        (anyYield ? 'Everything else this number cannot see'
                  : 'Everything else these measurements cannot see') + '</summary>' +
        '<p class="nbEstLimit">' + T.t('estimate.whyItMisses') + '</p>' +
        '<p class="nbEstLimit">' +
          (anyYield ? T.t('estimate.bandMeans') + ' ' : '') +
          T.t('estimate.heatNotPriced') + ' ' + T.t('estimate.heatSeedSize') + '</p>' +
        '<p class="nbEstLimit">' + T.t('estimate.weakestPart') + '</p>' +
        '<p class="nbEstLimit">' + T.t('estimate.classLevels') + '</p>' +
        proxyLine() +
        irrigationLine() +
        groundwaterLine() +
        '<p class="nbEstNext">' + T.t('estimate.wouldSharpen') + '</p>' +
        '<p class="nbEstNext">' + T.t('estimate.whatWouldFixIt') + '</p>' +
      '</details>';
    el.hidden = false;
  }

  /* WHAT USDA SAYS WAS PLANTED OF THIS CLASS. The line above it is the crop MAP — the area
     the satellite classifies as that commodity — and it is identical for every dry-bean class,
     because USDA maps one dry-bean layer. That is a different number from acres planted, and
     showing only the map left a reader no way to see that pinto is 51,000 acres in Nebraska
     while light red kidney is 6,200. GAJ went looking for planted acres and found none, which
     is how this gap surfaced. */
  var USDA_NAME = { 'PINTO': 'Pinto', 'GREAT NORTHERN': 'Great northern',
                    'LIGHT RED KIDNEY': 'Light red kidney', 'BLACKEYE': 'Blackeye' };

  function usdaPlanted() {
    var u = S.usdaAcres;
    if (!u || !u.classes) return '';
    var block = u.classes[USDA_NAME[S.crop]];
    if (!block) return '';
    var parts = [];
    Object.keys(block).sort().forEach(function (st) {
      var d = block[st];
      if (d.verdict === 'grown') {
        parts.push('<b>' + Math.round(parseFloat(d.mark) * 1000).toLocaleString() +
                   '</b> in ' + st);
      }
    });
    if (!parts.length) return '';
    return '<span class="nbUsdaAcres">' + window.NB_TEXT.t('footprint.usdaPlanted', {
      crop: S.crop.toLowerCase(), year: u.judged_on_crop_year,
      figures: parts.join(', ') }) + '</span>';
  }

  function updateFootprint() {
    var el = $('nbFootprint'); if (!el) return;
    var com = commodityOf();
    var outs = cropOutline(), counties = cropCounties();
    if (!outs.length || !counties.length) {
      el.innerHTML = '<b>' + S.crop + ' is not grown here in any measurable acreage.</b> ' +
        'USDA records no ' + com.toLowerCase() + ' ground in these counties, so there is ' +
        'nothing honest to draw. This class belongs on a northern-plains site.';
      el.hidden = false;
      return;
    }
    var acres = outs.reduce(function (t, f) { return t + f.properties.acres; }, 0);
    var top = (outs[0].properties.top_counties || [])[0];
    /* The outline is the union of whole counties that carry the crop, not the crop's fields.
     * USDA counts the acres; the shape is much larger than they are, and saying "ground" made
     * a county envelope look like a field boundary. */
    var T = window.NB_TEXT;
    el.innerHTML =
      T.t('footprint.line', { acres: '<b>' + acres.toLocaleString() + '</b>',
                              commodity: com.toLowerCase(),
                              counties: '<b>' + counties.length + '</b>',
                              where: top || 'the areas shown' }) + ' ' +
      T.t('footprint.wholeCounties') +
      (com === 'DRY BEANS' ? ' ' + T.t('footprint.oneBeanClass') : '') +
      usdaPlanted();
    el.hidden = false;
  }

  /* A caveat that must be read is not the same as a caveat that must be read FIRST. */
  function note(text) {
    return '<span class="nbNote"><button type="button" class="nbNoteToggle" ' +
      'aria-expanded="false">what this means</button><span class="nbNoteBody">' +
      text + '</span></span>';
  }

  /* An identical map across every dry-bean class is correct for two of these views and a
     fault in neither — but an unexplained identical picture reads as a broken tool, which is
     exactly how GAJ read it. The reason is appended once here, after whichever branch of the
     readout ran, rather than threaded through every return path. */
  function updateReadout() {
    updateReadoutBody();
    var el = $('nbReadout'), view = VIEWS[S.view];
    if (!el || !view || !view.sameAcrossClasses) return;
    if (commodityOf() !== 'DRY BEANS') return;
    // LEADING, not trailing. This was appended after a 460-character paragraph, where it was
    // read by nobody — GAJ asked the same question twice with the explanation already on the
    // page, which is the clearest possible evidence that placing it last was the same as
    // leaving it out.
    el.innerHTML = '<b class="nbShared">' + view.sameAcrossClasses + '</b> ' + el.innerHTML;
  }

  function updateReadoutBody() {
    var el = $('nbReadout'); if (!el) return;
    var view = VIEWS[S.view];

    if (view.realtime) {
      var seenV = {}, rows = [];
      cropCounties().forEach(function (f) {
        var rg = f.properties.region;
        if (seenV[rg]) return;
        seenV[rg] = 1;
        var hv = historyValue(rg);
        if (hv) rows.push({ name: regionName(rg), v: hv });
      });
      if (!rows.length) {
        el.innerHTML = 'No satellite pass on bean ground for this date yet.';
        return;
      }
      rows.sort(function (a, b) { return a.v.t - b.v.t; });
      var worstR = rows[0], bestR = rows[rows.length - 1];
      var above = rows.filter(function (r) { return r.v.pct > 0; }).length;
      var std0 = rows[0] && rows[0].v.seasonToDate;
      var asOf = (!std0 && bestR.v.stale) ? bestR.v.asOf : null;
      var usual = rows.filter(function (r) { return r.v.typical; }).length;
      el.innerHTML = (std0
          ? 'Season so far (' + bestR.v.passes + ' satellite passes, ' +
            monthDay(bestR.v.window[0]) + ' to ' + monthDay(bestR.v.window[1]) + '): '
          : asOf ? 'Latest pass, ' + monthDay(asOf) + ': ' : 'On this date, ') +
        S.crop.toLowerCase() + ' greenness runs <b>' + bestR.v.label + '</b> in ' +
        bestR.name +
        (rows.length > 1 ? ' and <b>' + worstR.v.label + '</b> in ' + worstR.name : '') +
        '. ' + usual + ' of ' + rows.length + ' areas sit inside their usual range for this ' +
        'date — most seasons do. <span class="nbStationCount">observed, not forecast — a ' +
        (commodityOf() === 'DRY BEANS'
          ? 'satellite pass over dry-bean ground, final when it lands, waiting on no '
          : 'satellite pass over this crop\u2019s own ground, final when it lands, waiting on no ') +
        'agency. A rank is published beside it, but the seasons sit inside about a 12% spread, ' +
        'so treat the percentage as the measure and the rank as context.</span>';
      return;
    }

    if (view.model) {
      if (S.crop !== 'PINTO') {
        el.innerHTML = '<b>No yield model for ' + S.crop + ' yet.</b> The model is fitted on ' +
          'pinto, on 92 state-years of USDA final yield. Nothing is shown for a class it was ' +
          'not trained on rather than a number borrowed from one that was.';
        return;
      }
      var seenR = {}, live = [], held = [];
      cropCounties().forEach(function (f) {
        var rg = f.properties.region;
        if (seenR[rg]) return;
        seenR[rg] = 1;
        var mv = modelValue(rg);
        if (!mv) return;
        (mv.withheld ? held : live).push({ name: regionName(rg), v: mv });
      });
      if (!live.length) {
        /* Report the reason that covers the most areas. Kansas is withheld all season because
         * its USDA pinto series ended, and letting that stand for every other area would
         * explain the wrong thing on a date when the real reason is the calendar. */
        var tally = {}, why = 'the model has no state for this date', best = 0;
        held.forEach(function (h) {
          var k = h.v.why || why;
          tally[k] = (tally[k] || 0) + 1;
          if (tally[k] > best) { best = tally[k]; why = k; }
        });
        el.innerHTML = '<b>No yield published for ' + niceDate(S.dates[S.day]) + '.</b> ' +
          why + '. Before the middle of June this model is beaten by simply guessing each ' +
          'area\u2019s historical median, so it publishes nothing rather than a number that ' +
          'would mislead.';
        return;
      }
      live.sort(function (a, b) { return a.v.yield - b.v.yield; });
      var loR = live[0], hiR = live[live.length - 1], any = loR.v;
      el.innerHTML = 'The trend puts pinto at <b>' + hiR.v.label +
        '</b> in ' + hiR.name + (live.length > 1 ? ' and <b>' + loR.v.label + '</b> in ' +
        loR.name : '') + ', against histories of ' +
        Math.round(hiR.v.median).toLocaleString() + ' and ' +
        Math.round(loR.v.median).toLocaleString() + ' lb/ac. ' +
        (any.interval ? 'Eighty per cent of past errors fell inside \u00b1' +
          Math.round((any.interval[1] - any.interval[0]) / 2).toLocaleString() + ' lb/ac. ' : '') +
        (held.length ? held.length + ' area' + (held.length > 1 ? 's are' : ' is') +
          ' withheld. ' : '') +
        '<span class="nbStationCount">This tracks the multi-year trend in USDA yields, not ' +
        'this season\u2019s weather. Tested on 26 years, the weather terms add no measurable ' +
        'skill for pinto — a trend line alone matches it. Error ' + any.mae + ' lb/ac against ' +
        any.baseline + ' for guessing the median.</span>';
      return;
    }

    if (view.regional) {
      var rows = cropCounties().map(function (f) { return f.properties.region; });
      var seen = {}, calls = [];
      rows.forEach(function (r) {
        if (seen[r]) return;
        seen[r] = 1;
        var v = regionValue(r);
        if (v) calls.push({ name: regionName(r), v: v });
      });
      if (!calls.length) {
        el.textContent = 'No ' + S.crop + ' estimate exists for the regions that grow it.';
        return;
      }
      calls.sort(function (a, b) { return a.v.t - b.v.t; });
      if (S.view === 'health') {
        var worst = calls[0], best = calls[calls.length - 1];
        el.innerHTML = 'This season\'s weather flags ' + S.crop + ' as <b>' +
          worst.v.label.toLowerCase() + '</b> in ' + worst.name +
          (calls.length > 1 ? ' and ' + best.v.label.toLowerCase() + ' in ' + best.name : '') +
          '. <span class="nbStationCount">a flag from heat, maturity and frost on state-level ' +
          'inputs — nobody has looked at the crop</span>';
      }
      return;
    }
    /* Before the crop is planted there is nothing to accumulate, and saying "no station
     * reported" blames the weather network for the calendar. */
    var spec0 = CLASSES[S.crop] || CLASSES.PINTO;
    if ((S.view === 'stage' || S.view === 'heat') && S.day < plantIndex(spec0)) {
      el.innerHTML = S.crop + ' is <b>not in the ground yet</b> on ' + niceDate(S.dates[S.day]) +
        '. This class goes in around ' + niceDate(S.dates[plantIndex(spec0)]) +
        ', and nothing accumulates before then.';
      return;
    }

    var pointsToday = stationValues(S.day).filter(function (p) {
      return p.v != null && isFinite(p.v) && p.onGround;
    });
    var onCrop = pointsToday.filter(function (p) { return p.inCrop; });
    var vals = onCrop.map(function (p) { return p.v; }).sort(function (a, b) { return a - b; });
    if (!vals.length) {
      el.innerHTML = 'No station on this crop\'s counties has a complete enough record for ' +
        'this date. Nothing is shown rather than a number built from gaps.';
      return;
    }
    var q = function (f) { return vals[Math.floor((vals.length - 1) * f)]; };
    var med = q(0.5), low = q(0.1), high = q(0.9);
    var r = Math.round;
    var text;
    if (S.view === 'cutworm') {
      /* PER REGION, NEVER POOLED. This took the median across every station on the crop's
       * counties — a thousand miles of them. On 12 July 2026 that pooled median was 24%, so
       * the site said flight "has not reached the 25% scouting mark", while northwest Kansas
       * stood at 97%, southwest Nebraska at 60% and northeast Colorado at 32%. Three regions
       * of seven were past the mark and a Kansas grower reading it would not have gone out.
       * This project has been burned by pooling before: the yield publish gate was pooled
       * rather than per state and Wyoming shipped a failure hidden inside Nebraska's numbers.
       * A sentence is a gate too. */
      var rgn = selectedRegion();
      if (rgn) {
        var mine = pointsToday.filter(function (p) { return regionOf(p.x, p.y) === rgn; })
                              .map(function (p) { return p.v; })
                              .sort(function (a, b) { return a - b; });
        if (mine.length >= 3) {
          vals = mine;
          med = vals[Math.floor((vals.length - 1) * 0.5)];
          low = vals[Math.floor((vals.length - 1) * 0.1)];
          high = vals[Math.floor((vals.length - 1) * 0.9)];
        } else { rgn = null; }
      }
      /* WITHOUT THIS THE HEADING AND THE SENTENCE DESCRIBED DIFFERENT THINGS — the question
       * above read "Where is the cutworm flight?" and the answer below reported rainfall,
       * because every view that is not stage or heat fell through to the water sentence.
       * That is the same fault this file already records fixing once, where the surface was
       * clipped to one crop and the summary was not. */
      var where = rgn ? regionName(rgn) : 'this crop\u2019s ground';
      text = med >= 75
        ? 'In <b>' + where + '</b>, flight is <b>past three quarters</b> — ' +
          r(med) + '% — so egg laying is largely finished. Scouting now finds what is already ' +
          'there, not what is coming.'
        : med >= 25
          ? 'In <b>' + where + '</b>, flight is at <b>' + r(med) + '%</b>, past the 25% mark ' +
            'where UNL says start scouting. The earliest tenth of this ground is at ' +
            r(high) + '% and the latest at ' + r(low) + '%, so the whole area is not on the ' +
            'same schedule.'
          : 'In <b>' + where + '</b>, flight has <b>not reached the 25% scouting mark</b> — ' +
            'the median thermometer is at ' + r(med) + '%, the warmest tenth at ' + r(high) + '%. ' +
            'Other regions are on their own schedule; switch region above to see them.';
      /* THE WINDOW IS THE ONLY ACTIONABLE THING HERE, so it is stated as dates and put
       * first. UNL NebGuide G2013: "the application should be made 10 to 21 days after the
       * peak moth flight". Peak flight is the 50% mark the model already computes.
       *
       * And the sentence after it is not a disclaimer, it is the other half of the decision.
       * G2013 again: "Dry beans cannot be effectively scouted for western bean cutworm eggs
       * or small larvae." There is no egg threshold for beans — the 5-8% figure people quote
       * is for CORN. What decides WHETHER to spray is a moth trap the grower runs, and this
       * site cannot supply that number. Saying so is what makes the window honest. */
      var wbcW = ((S.pest && S.pest.regions && rgn && S.pest.regions[rgn]) || {}).spray_window;
      if (wbcW) {
        text += ' <b>If a trap says spray, the window is ' + niceDate(wbcW.opens) +
          ' to ' + niceDate(wbcW.closes) + '</b> — 10 to 21 days after peak flight on ' +
          niceDate(wbcW.peak_flight) + '.';
      }
      text += ' <i>This is timing only, from accumulated heat on UNL\u2019s published model. ' +
        'Whether to spray at all is decided by a moth trap you run: cumulative catch at peak ' +
        'flight in a milk jug trap, under 700 is low risk, 700\u20131,000 moderate, over ' +
        '1,000 high. We cannot see that number. Dry beans cannot be scouted for eggs \u2014 ' +
        'that is a corn practice \u2014 so after the window, look for pod damage: 0.5\u20131% ' +
        'or more is worth acting on. (UNL NebGuide G2013)</i>';
    } else if (S.view === 'stage') {
      // Past 110% the percentage stops being the useful number. A grower whose lentils finished
      // in July does not need to hear "168% of maturity"; they need to hear that it is standing.
      text = med >= 110
        ? 'The median ' + S.crop + ' gauge shows <b>' + r(med) + '% of the heat this class ' +
          'needs</b> — past maturity. The slowest tenth is at ' + r(low) + '%, so the crop is ' +
          'not uniformly finished' + (low < 100 ? ' and the back end is still filling' : '') + '.'
        : S.crop + ' is at <b>' + r(med) + '% of the heat it needs</b> at the median gauge on ' +
          'this crop, from ' + r(low) + '% in the slowest tenth to ' + r(high) + '% in the ' +
          'fastest.';
    } else if (S.view === 'soilwater') {
      /* Its own sentence, because falling through to the rainfall wording made this layer
       * describe rain gauges and thermometers — which is not where a single figure on it comes
       * from. The first version of this shipped exactly that until the page was opened and
       * read, which is the whole argument for opening the page and reading it. */
      var srec = (S.soils && S.soils.regions) || {};
      var rk = S.region || Object.keys(srec)[0];
      var sr = srec[rk] || {};
      var cap = sr.available_water_mm_root_zone;
      text = 'Across this crop\u2019s ground the soil survey gives a root zone holding <b>' +
        (cap != null ? r(cap) + ' mm' : 'an unrecorded amount') + '</b> of water the roots can ' +
        'reach when full' +
        (sr.top_soils && sr.top_soils[0] ? ', mostly ' + sr.top_soils[0].soil.toLowerCase() : '') +
        (sr.slope_pct_mean != null ? ', on ' + sr.slope_pct_mean + '% slopes' : '') +
        '. The map shades what we <b>estimate</b> is in it now: <b>' + r(med) + ' mm</b> at the ' +
        'typical cell, from ' + r(low) + ' to ' + r(high) + '.' +
        note('This is not measured soil moisture and must not be used as though it were. The ' +
             'capacity is surveyed on the ground and is solid. The wetness is a land-surface ' +
             'model, one figure for the whole region, checked against the USDA buried probe at ' +
             'Torrington across 3,801 days. It cannot see a centre pivot, so on watered ground ' +
             'it will read dry when the crop is not. To know your own field you need a probe in ' +
             'it \u2014 buried sensors at several depths, a tensiometer or Watermark, or a hand ' +
             'probe and a shovel.');
    } else if (S.view === 'heat') {
      text = window.NB_TEXT.t('heat.reading', {
        crop: S.crop, days: '<b>' + r(med) + '</b>',
        threshold: window.NB_TEXT.temp(((CLASSES[S.crop] || CLASSES.PINTO).heat - 32) * 5 / 9),
        hottest: r(high) });
    } else {
      /* One whole sentence with named slots, in the reader's own units. This was six glued
         fragments reporting millimetres to growers in Nebraska — wrong units, and
         untranslatable, because Spanish and Turkish cannot move a word across a join. It also
         said it carried "no crop coefficient", which stopped being true the moment the water
         map started using one. */
      var T = window.NB_TEXT;
      text = (med < 0
        ? T.t('water.reading', { balance: '<b>' + T.depth(med) + '</b>',
                                 crop: S.crop.toLowerCase(),
                                 low: T.depth(low), high: T.depth(high) })
        : T.t('water.surplus', { crop: S.crop.toLowerCase(), high: T.depth(high) })) +
        note(T.t('water.what'));
    }
    /* Count the stations that actually answered this view. Most cooperative sites report rain
     * and not temperature, so claiming the full network behind a growing-degree-day figure
     * would overstate what is holding it up. */
    el.innerHTML = text + ' <span class="nbStationCount">' + vals.length +
      (S.view === 'soilwater' ? ' surveyed soil samples'
        : S.view === 'moisture' ? ' rain gauges' : ' reporting thermometers') + '</span>';
  }

  function updateLegend() {
    var view = VIEWS[S.view];
    var el = $('nbLegend'); if (!el) return;
    var stops = [];
    for (var i = 0; i <= 10; i++) {
      var c = rampColor(i / 10, view.ramp);
      stops.push('rgb(' + c.join(',') + ') ' + (i * 10) + '%');
    }
    var bar = '<div class="nbLegendBar" style="background:linear-gradient(90deg,' +
      stops.join(',') + ')"></div>';
    /* Most layers describe the SELECTED crop, so the legend names it. Cutworm flight does
     * not: it accumulates from 1 March on air temperature and does not know what is planted.
     * Tagging it "· CHICKPEAS" claimed a chickpea-specific cutworm reading, and western bean
     * cutworm is not a chickpea pest at all — it is a pest of dry beans and corn. A label
     * that borrows the crop selector is a claim about the crop. */
    var tail = '<div class="nbLegendUnit">' + view.label + ' · ' + view.unit +
      (view.cropIndependent ? ' · dry beans and corn — not crop-specific' : ' · ' + S.crop);

    if (S.view === 'vshistory') {
      el.innerHTML = bar +
        '<div class="nbLegendEnds">' +
        '<span><em>worst</em>' + view.loLabel + '</span>' +
        '<span><em>best</em>' + view.hiLabel + '</span></div>' +
        tail + '<br>Rank against the same date in every season since 2000 · ' +
        (S.vsHistory ? 'latest pass ' + S.vsHistory.latest_observation : '') + '</div>';
      return;
    }

    if (S.view === 'yield') {
      var sample = null;
      cropCounties().some(function (f) {
        var mv = modelValue(f.properties.region);
        if (mv && !mv.withheld) { sample = mv; return true; }
        return false;
      });
      el.innerHTML = bar +
        '<div class="nbLegendEnds">' +
        '<span><em>\u221212%</em>' + view.loLabel + '</span>' +
        '<span><em>+12%</em>' + view.hiLabel + '</span></div>' +
        tail + '<br>' +
        (sample
          ? 'Trend, not weather. Error ' + sample.mae + ' lb/ac against ' + sample.baseline +
            ' for guessing the median'
          : 'Withheld on this date \u2014 the model does not beat guessing the median') +
        ' \u00b7 state-level fit \u00b7 ' + niceDate(S.dates[S.day]) + '</div>';
      return;
    }

    /* Crop health is five named calls, not a continuum. A gradient with numbers under it would
     * invite people to read a precision that is not in the word "STRESSED". */
    if (S.view === 'health') {
      var keys = ['AT RISK', 'STRESSED', 'LATE', 'WATCH', 'ON TRACK'];
      el.innerHTML =
        '<div class="nbLegendSteps">' + keys.map(function (k) {
          var c = rampColor(HEALTH_RANK[k], view.ramp);
          return '<span><i style="background:rgb(' + c.join(',') + ')"></i>' +
            k.charAt(0) + k.slice(1).toLowerCase() + '</span>';
        }).join('') + '</div>' +
        tail + '<br>Called per region from that region\'s own season · through ' +
        S.dates[S.dates.length - 1] + '</div>';
      return;
    }

    var dom = domain();
    var fmt = function (v) { return Math.round(v).toLocaleString(); };
    el.innerHTML = bar +
      '<div class="nbLegendEnds">' +
      '<span><em>' + fmt(dom.lo) + '</em>' + view.loLabel + '</span>' +
      '<span><em>' + fmt(dom.hi) + '</em>' + view.hiLabel + '</span></div>' +
      tail + '<br>' +
      (S.interp === 'relative'
        ? 'Scale stretched to this date — read where, not how much'
        : 'One scale all season — dates are comparable') +
      ' · through ' + S.dates[S.dates.length - 1] + '</div>';
  }

  function syncQuestion() {
    var q = $('nbQuestion');
    if (q) q.textContent = VIEWS[S.view].question;
    var n = $('nbNowShowing');
    if (n) n.textContent = S.crop;
  }

  /* ---------------------------------------------------------------- shell */

  function shell() {
    var host = document.getElementById('nbDecisionMap');
    if (!host) return null;
    var viewOpts = Object.keys(VIEWS).map(function (v) {
      return '<option value="' + v + '"' + (v === S.view ? ' selected' : '') + '>' +
        VIEWS[v].label + '</option>';
    }).join('');
    host.innerHTML =
      '<div class="nbMapHead">' +
        '<div><div class="nbEyebrow">DECISION MAP</div>' +
        '<h2 id="nbQuestion">Where is the crop short of water right now?</h2></div>' +
      '</div>' +
      '<p class="nbReadout" id="nbReadout">Reading stations\u2026</p>' +
      /* The controls belong ON the map, not four hundred pixels above it. They used to sit in
         the heading, which meant changing the view was: scroll up past the whole evidence
         table, change it, scroll back down to see what happened. */
      '<div class="nbMapControls">' +
        '<span class="nbNowShowing" id="nbNowShowing"></span>' +
        '<label>Show<select id="nbView">' + viewOpts + '</select></label>' +
        '<label>Scale<select id="nbInterp">' +
          '<option value="absolute" selected>Across the season</option>' +
          '<option value="relative">Within this date</option>' +
        '</select></label>' +
      '</div>' +
      '<div class="nbMapFrame"><div id="nbMap"></div>' +
        '<div class="nbLegendCard" id="nbLegend"></div>' +
        '<div class="nbGeoNote">Low-opacity geography avoids false field precision. ' +
        'The surface is drawn only inside the growing regions, from every reporting ' +
        'station; markers are thinned so they do not bury it. ' +
        '<button type="button" id="nbFitAll">Show every region</button></div>' +
      '</div>' +
      '<div class="nbPlayback">' +
        '<button id="nbPlay" type="button"><span class="nbIcon">\u25b6</span> Play</button>' +
        '<div class="nbDateBlock"><span class="nbDateCap">DATE</span>' +
        '<strong id="nbDate">\u2014</strong></div>' +
        '<div class="nbTrack"><input id="nbSlider" type="range" min="0" max="1" value="0" ' +
        'aria-label="Season date"><div class="nbPhases" id="nbPhases"></div></div>' +
        '<label class="nbSel">Step<select id="nbFrame">' +
          '<option value="1" selected>1 day</option><option value="3">3 days</option>' +
          '<option value="7">7 days</option></select></label>' +
        '<label class="nbSel">Speed<select id="nbSpeed">' +
          '<option value="0.5">0.5\u00d7</option><option value="1" selected>1\u00d7</option>' +
          '<option value="2">2\u00d7</option><option value="4">4\u00d7</option>' +
          '<option value="8">8\u00d7</option></select></label>' +
      '</div>' +
      /* The evidence table is the detail a professional digs into AFTER reading the map. It
         used to sit between the controls and the map, which pushed the map off the screen. */
      '<p class="nbFootprint" id="nbFootprint" hidden></p>' +
      '<div class="nbEstimate" id="nbEstimate" hidden></div>';
    return host;
  }

  function wire() {
    // The crop is chosen once, in the answer block above. The map listens rather than
    // offering a second picker that can disagree with the first.
    // Capture phase, deliberately. The answer block replaces its own markup when the crop
    // changes, which destroys the select mid-dispatch; a bubbling listener can miss the event
    // entirely. Capture runs before that re-render.
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.id !== 'nbCrop' || !CLASSES[t.value] || t.value === S.crop) return;
      applyCrop(t.value, true);
    }, true);

    /* The region picker belongs to app.js, but the cutworm sentence is now written per region
     * and had no way to hear it change — so it reported the Panhandle whichever region you
     * chose, which is a worse lie than the pooled number it replaced. It is bound here rather
     * than in app.js because this file is the one that has to redraw. */
    document.addEventListener('change', function (e) {
      if (!e.target || e.target.id !== 'region') return;
      /* Both the cutworm sentence and the water-table line are written for the region the
       * reader picked, and neither hears the picker on its own — it belongs to app.js. */
      if (S.view === 'cutworm') setDay(S.day);
      try { updateEstimate(); } catch (err) { /* estimate panel not built yet */ }
    }, true);
    $('nbView').addEventListener('change', function (e) {
      S.view = e.target.value;
      var frozen = !!VIEWS[S.view].regional && !VIEWS[S.view].model;
      var regional = frozen;
      if (regional) stop();
      var pb = document.querySelector('.nbPlayback');
      if (pb) pb.classList.toggle('nbPlaybackOff', regional);
      $('nbPlay').disabled = regional;
      $('nbSlider').disabled = regional;
      drawStations();
      updateLegend(); syncQuestion(); setDay(S.day);
    });
    $('nbInterp').addEventListener('change', function (e) {
      S.interp = e.target.value; updateLegend(); setDay(S.day); });
    /* delegated: the readout is rewritten on every date change */
    document.addEventListener('click', function (e) {
      var b = e.target;
      if (!b || !b.classList || !b.classList.contains('nbNoteToggle')) return;
      var open = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', open ? 'false' : 'true');
      b.parentNode.classList.toggle('nbNoteOpen', !open);
      b.textContent = open ? 'what this means' : 'hide';
    });

    $('nbFitAll').addEventListener('click', function () {
      if (S.layers.counties) S.map.fitBounds(S.layers.counties.getBounds().pad(0.08));
    });
    $('nbPlay').addEventListener('click', play);
    $('nbSlider').addEventListener('input', function (e) { stop(); setDay(Number(e.target.value)); });
    $('nbFrame').addEventListener('change', function (e) { S.frame = Number(e.target.value); });
    $('nbSpeed').addEventListener('change', function (e) { S.speed = Number(e.target.value); });
  }

  function applyCrop(next, refit) {
    if (!next || !CLASSES[next] || next === S.crop) return false;
    S.crop = next;
    drawOutlines();
    syncQuestion();
    drawStations();
    if (refit) { var cb = coreBounds(); if (cb) S.map.fitBounds(cb); }
    updateFootprint();
    updateLegend();
    setDay(S.day, true);
    return true;
  }

  /* Keep the map on the crop the answer block is showing. It restores the last crop from
   * storage after its own fetch resolves and never fires a change event, so a map that only
   * listened for changes sat on pinto while the headline said garbanzo. */
  function watchCrop() {
    var read = function () {
      var el = document.getElementById('nbCrop');
      if (el && CLASSES[el.value]) applyCrop(el.value, true);
    };
    read();
    [300, 900, 2000].forEach(function (ms) { setTimeout(read, ms); });
    var host = document.getElementById('nbAnswer');
    if (host && window.MutationObserver) {
      new window.MutationObserver(read).observe(host, { childList: true, subtree: true });
    }
  }

  /* Measure the site header once so the controls pin just below it rather than under it. */
  function setStickyOffset() {
    var bar = document.querySelector('.topbar');
    var h = bar ? Math.round(bar.getBoundingClientRect().height) : 62;
    document.documentElement.style.setProperty('--nb-topbar', h + 'px');
  }

  function start() {
    if (!shell() || !window.L) return;
    setStickyOffset();
    window.addEventListener('resize', setStickyOffset);
    var map = window.L.map('nbMap', { zoomControl: true, scrollWheelZoom: false,
                                      attributionControl: true });
    S.map = map;
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors · weather NOAA cooperative and GHCN ' +
                   'networks via RCC-ACIS · counties US Census · crop acreage USDA Cropland ' +
                   'Data Layer',
      maxZoom: 12, opacity: 0.5
    }).addTo(map);

    var cv = document.createElement('canvas');
    cv.className = 'nbSurface';
    map.getContainer().appendChild(cv);
    S.canvas = cv;
    map.on('move zoom resize viewreset', function () {
      try { paintSurface(); } catch (e) { if (window.console) console.warn('surface:', e.message); }
    });

    Promise.all([
      fetch('assets/data/region-outlines.json?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/station-field.json?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/crop-outlines.geojson?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/county-crops.geojson?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/region-answers.json?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/gisit-outlook-2026.json?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/crop-vs-history.json?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/estimate-2026.json?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/yield-all-2026.json?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/yield-index-2026.json?v=' + build())
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('assets/data/usda-class-acres.json?v=' + build())
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('assets/data/irrigation.json?v=' + build())
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('assets/data/pest-wbc-2026.json?v=' + build())
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('assets/data/groundwater.json?v=' + build())
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('assets/data/soils.json?v=' + build())
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('assets/data/soil-water-daily.json?v=' + build())
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      S.outlines = res[0]; S.field = res[1]; S.dates = S.field.dates;
      S.cropOutlines = res[2]; S.counties = res[3]; S.answers = res[4]; S.outlook = res[5]; S.vsHistory = res[6]; S.estimate = res[7]; S.yieldAll = res[8]; S.yieldIndex = res[9]; S.usdaAcres = res[10]; S.irrigation = res[11]; S.pest = res[12]; S.groundwater = res[13]; S.soils = res[14]; S.soilDaily = res[15];
      var sl = $('nbSlider'); sl.max = S.dates.length - 1; sl.value = S.dates.length - 1;
      var picked = document.getElementById('nbCrop');
      if (picked && CLASSES[picked.value]) S.crop = picked.value;
      drawOutlines(); drawStations();
      var cb = coreBounds(); if (cb) map.fitBounds(cb);
      updateFootprint(); updateEstimate();
      updateLegend(); syncQuestion(); wire();
      setDay(S.dates.length - 1, true);
      watchCrop();
      setTimeout(function () { map.invalidateSize(); paintSurface(); }, 200);
    }).catch(function (e) {
      var r = $('nbReadout');
      if (r) r.textContent = 'The map data did not load: ' + (e && e.message ? e.message : e);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }
})();
