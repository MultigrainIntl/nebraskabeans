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

  var CLASSES = {
    'PINTO':              { commodity: 'DRY BEANS', base: 50, heat: 90, gdd: 1700, plant: '06-01' },
    'GREAT NORTHERN':     { commodity: 'DRY BEANS', base: 50, heat: 88, gdd: 1600, plant: '06-01' },
    'NAVY':               { commodity: 'DRY BEANS', base: 50, heat: 88, gdd: 1650, plant: '06-01' },
    'BLACK':              { commodity: 'DRY BEANS', base: 50, heat: 92, gdd: 1750, plant: '06-01' },
    'LIGHT RED KIDNEY':   { commodity: 'DRY BEANS', base: 50, heat: 86, gdd: 1900, plant: '06-01' },
    'DARK RED KIDNEY':    { commodity: 'DRY BEANS', base: 50, heat: 86, gdd: 1900, plant: '06-01' },
    'PINK':               { commodity: 'DRY BEANS', base: 50, heat: 90, gdd: 1650, plant: '06-01' },
    'SMALL RED':          { commodity: 'DRY BEANS', base: 50, heat: 90, gdd: 1650, plant: '06-01' },
    'CRANBERRY':          { commodity: 'DRY BEANS', base: 50, heat: 88, gdd: 1800, plant: '06-01' },
    'SMALL WHITE':        { commodity: 'DRY BEANS', base: 50, heat: 88, gdd: 1650, plant: '06-01' },
    'BLACKEYE':           { commodity: 'DRY BEANS', base: 50, heat: 95, gdd: 1800, plant: '05-20' },
    'GARBANZO (KABULI)':  { commodity: 'CHICKPEAS', base: 41, heat: 86, gdd: 2600, plant: '04-20' },
    'GARBANZO (DESI)':    { commodity: 'CHICKPEAS', base: 41, heat: 88, gdd: 2400, plant: '04-20' },
    'LENTIL LARGE GREEN': { commodity: 'LENTILS', base: 41, heat: 82, gdd: 2100, plant: '04-15' },
    'LENTIL SMALL GREEN': { commodity: 'LENTILS', base: 41, heat: 82, gdd: 2000, plant: '04-15' },
    'LENTIL RED':         { commodity: 'LENTILS', base: 41, heat: 82, gdd: 1950, plant: '04-15' },
    'PEA YELLOW':         { commodity: 'PEAS', base: 41, heat: 82, gdd: 2000, plant: '04-05' },
    'PEA GREEN':          { commodity: 'PEAS', base: 41, heat: 82, gdd: 2000, plant: '04-05' }
  };

  /* Each view is one question a professional actually asks, with the ends of the scale named
   * in plain language rather than in units nobody reads off a legend. */
  var VIEWS = {
    stage: {
      label: 'Crop development',
      unit: '% of maturity',
      loLabel: 'Behind', hiLabel: 'Mature',
      ramp: [[0, '#d9e2d6'], [0.35, '#9ec9a6'], [0.6, '#4ea56b'], [0.8, '#e8c33a'], [1, '#a8571f']],
      question: 'How far along is the crop, and where is it behind?'
    },
    /* NOT soil moisture, and it was labelled as such until an independent review caught it.
     * This is rainfall minus grass-reference evaporation over thirty days — a climatic deficit.
     * It carries no irrigation, no crop coefficient, no root-zone storage, no soil water
     * capacity, no runoff and no drainage. In a region where much of the bean crop is under
     * pivot, calling it soil moisture and saying the crop drew down stored water was wrong in
     * a way that could have moved an irrigation decision. */
    moisture: {
      label: 'Rain minus evaporation',
      unit: 'mm over 30 days · rainfall less grass-reference ET, no irrigation',
      loLabel: 'Rain far behind evaporation', hiLabel: 'Rain ahead of evaporation',
      ramp: [[0, '#e07b1f'], [0.35, '#e8c33a'], [0.65, '#7cc08a'], [1, '#2a9d9a']],
      question: 'Where has rainfall fallen furthest behind evaporation?'
    },
    /* THE YIELD VIEW IS GONE. It showed USDA's own historical baseline for the class
     * multiplied by a season adjustment — every one of its 35 values was baseline x percentage
     * to within a pound. That is not a prediction, and GAJ's standing rule is that USDA yield
     * is the scorecard and never an input. It was doing the opposite while a heading asked
     * "what is this crop going to yield". It stays out until there is a real prediction to
     * grade against USDA rather than one derived from it. */
    health: {
      label: 'Season flags',
      unit: 'weather-derived flag from state-level inputs — not an observed crop condition',
      regional: true,
      loLabel: 'At risk', hiLabel: 'On track',
      ramp: [[0, '#9e1b0e'], [0.25, '#d4541c'], [0.5, '#eb9a00'], [0.75, '#f0cb2a'], [1, '#17794a']],
      question: 'Where do this season\'s weather flags fall?'
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
    answers: null, field: null, dates: [], layers: {}, timer: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var build = function () { return window.__nbBuild || Date.now(); };

  /* ---------------------------------------------------------------- agronomy */

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

  function stationValues(day) {
    var spec = CLASSES[S.crop] || CLASSES.PINTO;
    var p0 = plantIndex(spec);
    var all = S.field.stations;
    var rings = cropRings();
    var out = [];
    for (var s = 0; s < all.length; s++) {
      var st = all[s], v = null;
      if (S.view === 'stage' || S.view === 'heat') {
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
        var bal = 0, from = Math.max(0, day - 29), days = day - from + 1, ok = 0;
        for (var k = from; k <= day; k++) {
          var e = et0(ref.hi[k], ref.lo[k], st.lat, doyOf(S.dates[k]));
          if (e == null) continue;             // a gap is a gap, not a average day
          ok++;
          if (st.pr[k] != null) bal += st.pr[k] / 10;   // stored as tenths of a millimetre
          bal -= e;
        }
        if (ok < days * MIN_WINDOW_COVER) continue;
        v = bal;
      }
      out.push({ x: st.lon, y: st.lat, v: v, name: st.name,
                 inCrop: inRings(st.lon, st.lat, rings) });
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
    var dpr = window.devicePixelRatio || 1;
    S.canvas.width = size.x * dpr; S.canvas.height = size.y * dpr;
    S.canvas.style.width = size.x + 'px'; S.canvas.style.height = size.y + 'px';
    var ctx = S.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);

    var view = VIEWS[S.view], dom = domain();
    var pts = stationValues(S.day).filter(function (p) { return p.v != null && isFinite(p.v); });
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
  function regionValue(region) {
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
    return '<b>' + p.county + ' County, ' + p.state + '</b><br>' +
      Math.round(p.acres[com]).toLocaleString() + ' acres of ' + com.toLowerCase() +
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
      layer.setStyle(v
        ? { fillOpacity: 0.72, fillColor: 'rgb(' + rampColor(v.t, view.ramp).join(',') + ')',
            weight: 0.7, color: '#42514a', opacity: 0.6 }
        : { fillOpacity: 0.07, fillColor: '#8a938c', weight: 0.7, color: '#5c6b60', opacity: 0.45 });
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
    if (S.interp === 'relative') updateLegend();
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
    el.innerHTML = 'USDA counts <b>' + acres.toLocaleString() + ' acres</b> of ' +
      com.toLowerCase() + ' in the <b>' + counties.length + ' counties</b> outlined here' +
      (top ? ', most of it around ' + top : '') + '. The outline is those whole counties, not ' +
      'the fields — the crop is a small part of the area drawn. Cropland Data Layer ' +
      (S.cropOutlines.crop_year || '') +
      (com === 'DRY BEANS'
        ? ', which carries one dry-bean class: pinto, navy, black and the kidneys share it.'
        : '.');
    el.hidden = false;
  }

  function updateReadout() {
    var el = $('nbReadout'); if (!el) return;
    var view = VIEWS[S.view];

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

    var onCrop = stationValues(S.day).filter(function (p) {
      return p.inCrop && p.v != null && isFinite(p.v);
    });
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
    if (S.view === 'stage') {
      // Past 110% the percentage stops being the useful number. A grower whose lentils finished
      // in July does not need to hear "168% of maturity"; they need to hear that it is standing.
      text = med >= 110
        ? 'The median ' + S.crop + ' gauge shows <b>' + r(med) + '% of the heat this class ' +
          'needs</b> — past maturity. The slowest tenth is at ' + r(low) + '%, so the crop is ' +
          'not uniformly finished' + (low < 100 ? ' and the back end is still filling' : '') + '.'
        : S.crop + ' is at <b>' + r(med) + '% of the heat it needs</b> at the median gauge on ' +
          'this crop, from ' + r(low) + '% in the slowest tenth to ' + r(high) + '% in the ' +
          'fastest.';
    } else if (S.view === 'heat') {
      text = S.crop + ' has taken <b>' + r(med) + ' days above ' +
        (CLASSES[S.crop] || CLASSES.PINTO).heat + '°F</b> at the median gauge on this crop, ' +
        'and up to ' + r(high) + ' in the hottest tenth. Heat in pod fill shows up as small seed.';
    } else {
      text = 'Over the last thirty days rainfall ran <b>' + r(med) + ' mm</b> against ' +
        'grass-reference evaporation at the median gauge on this crop, from ' + r(low) +
        ' mm where it fell furthest behind to ' + r(high) + ' mm where it kept up. ' +
        'This is weather, not soil: it carries no irrigation, no crop coefficient and no ' +
        'stored soil water, so it says where demand outran rain, not whether a field is dry.';
    }
    /* Count the stations that actually answered this view. Most cooperative sites report rain
     * and not temperature, so claiming the full network behind a growing-degree-day figure
     * would overstate what is holding it up. */
    el.innerHTML = text + ' <span class="nbStationCount">' + vals.length +
      (S.view === 'moisture' ? ' rain gauges' : ' reporting thermometers') + '</span>';
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
    var tail = '<div class="nbLegendUnit">' + view.label + ' · ' + view.unit + ' · ' + S.crop;

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
        '<div class="nbMapPickers">' +
          '<label>Show<select id="nbView">' + viewOpts + '</select></label>' +
          '<label>Scale<select id="nbInterp">' +
            '<option value="absolute" selected>Across the season</option>' +
            '<option value="relative">Within this date</option>' +
          '</select></label>' +
        '</div>' +
      '</div>' +
      '<p class="nbReadout" id="nbReadout">Reading stations…</p>' +
      '<p class="nbFootprint" id="nbFootprint" hidden></p>' +
      '<div class="nbMapFrame"><div id="nbMap"></div>' +
        '<div class="nbLegendCard" id="nbLegend"></div>' +
        '<div class="nbGeoNote">Low-opacity geography avoids false field precision. ' +
        'The surface is drawn only inside the growing regions, from every reporting ' +
        'station; markers are thinned so they do not bury it. ' +
        '<button type="button" id="nbFitAll">Show every region</button></div>' +
      '</div>' +
      '<div class="nbPlayback">' +
        '<button id="nbPlay" type="button"><span class="nbIcon">▶</span> Play</button>' +
        '<div class="nbDateBlock"><span class="nbDateCap">DATE</span>' +
        '<strong id="nbDate">—</strong></div>' +
        '<div class="nbTrack"><input id="nbSlider" type="range" min="0" max="1" value="0" ' +
        'aria-label="Season date"><div class="nbPhases" id="nbPhases"></div></div>' +
        '<label class="nbSel">Step<select id="nbFrame">' +
          '<option value="1" selected>1 day</option><option value="3">3 days</option>' +
          '<option value="7">7 days</option></select></label>' +
        '<label class="nbSel">Speed<select id="nbSpeed">' +
          '<option value="0.5">0.5×</option><option value="1" selected>1×</option>' +
          '<option value="2">2×</option><option value="4">4×</option>' +
          '<option value="8">8×</option></select></label>' +
      '</div>';
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
    $('nbView').addEventListener('change', function (e) {
      S.view = e.target.value;
      var regional = !!VIEWS[S.view].regional;
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

  function start() {
    if (!shell() || !window.L) return;
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
    map.on('move zoom resize viewreset', paintSurface);

    Promise.all([
      fetch('assets/data/region-outlines.json?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/station-field.json?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/crop-outlines.geojson?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/county-crops.geojson?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/region-answers.json?v=' + build()).then(function (r) { return r.json(); })
    ]).then(function (res) {
      S.outlines = res[0]; S.field = res[1]; S.dates = S.field.dates;
      S.cropOutlines = res[2]; S.counties = res[3]; S.answers = res[4];
      var sl = $('nbSlider'); sl.max = S.dates.length - 1; sl.value = S.dates.length - 1;
      var picked = document.getElementById('nbCrop');
      if (picked && CLASSES[picked.value]) S.crop = picked.value;
      drawOutlines(); drawStations();
      var cb = coreBounds(); if (cb) map.fitBounds(cb);
      updateFootprint();
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
