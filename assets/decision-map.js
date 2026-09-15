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
    'PINTO':              { base: 50, heat: 90, gdd: 1700, plant: '06-01' },
    'GREAT NORTHERN':     { base: 50, heat: 88, gdd: 1600, plant: '06-01' },
    'NAVY':               { base: 50, heat: 88, gdd: 1650, plant: '06-01' },
    'BLACK':              { base: 50, heat: 92, gdd: 1750, plant: '06-01' },
    'LIGHT RED KIDNEY':   { base: 50, heat: 86, gdd: 1900, plant: '06-01' },
    'DARK RED KIDNEY':    { base: 50, heat: 86, gdd: 1900, plant: '06-01' },
    'PINK':               { base: 50, heat: 90, gdd: 1650, plant: '06-01' },
    'SMALL RED':          { base: 50, heat: 90, gdd: 1650, plant: '06-01' },
    'CRANBERRY':          { base: 50, heat: 88, gdd: 1800, plant: '06-01' },
    'SMALL WHITE':        { base: 50, heat: 88, gdd: 1650, plant: '06-01' },
    'BLACKEYE':           { base: 50, heat: 95, gdd: 1800, plant: '05-20' },
    'GARBANZO (KABULI)':  { base: 41, heat: 86, gdd: 2600, plant: '04-20' },
    'GARBANZO (DESI)':    { base: 41, heat: 88, gdd: 2400, plant: '04-20' },
    'LENTIL LARGE GREEN': { base: 41, heat: 82, gdd: 2100, plant: '04-15' },
    'LENTIL SMALL GREEN': { base: 41, heat: 82, gdd: 2000, plant: '04-15' },
    'LENTIL RED':         { base: 41, heat: 82, gdd: 1950, plant: '04-15' },
    'PEA YELLOW':         { base: 41, heat: 82, gdd: 2000, plant: '04-05' },
    'PEA GREEN':          { base: 41, heat: 82, gdd: 2000, plant: '04-05' }
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
    moisture: {
      label: 'Soil moisture',
      unit: 'mm water balance, 30 days',
      loLabel: 'Lower absolute water', hiLabel: 'Higher absolute water',
      ramp: [[0, '#e07b1f'], [0.35, '#e8c33a'], [0.65, '#7cc08a'], [1, '#2a9d9a']],
      question: 'Where is the crop short of water right now?'
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
    map: null, canvas: null, outlines: null, field: null, dates: [], layers: {}, timer: null
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
    if (hi == null || lo == null) return 3;
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
  function stationValues(day) {
    var spec = CLASSES[S.crop] || CLASSES.PINTO;
    var p0 = plantIndex(spec);
    var out = [];
    for (var s = 0; s < S.field.stations.length; s++) {
      var st = S.field.stations[s], v = null;
      if (S.view === 'stage') {
        var gdd = 0;
        for (var i = p0; i <= day; i++) {
          var hi = st.hi[i], lo = st.lo[i];
          if (hi == null || lo == null) continue;
          gdd += Math.max((hi + lo) / 2 - spec.base, 0);
        }
        v = 100 * gdd / spec.gdd;
      } else if (S.view === 'heat') {
        var n = 0;
        for (var j = p0; j <= day; j++) if (st.hi[j] != null && st.hi[j] >= spec.heat) n++;
        v = n;
      } else {
        var bal = 0, from = Math.max(0, day - 29);
        for (var k = from; k <= day; k++) {
          if (st.pr[k] != null) bal += st.pr[k];
          bal -= et0(st.hi[k], st.lo[k], st.lat, doyOf(S.dates[k]));
        }
        v = bal;
      }
      out.push({ x: st.lon, y: st.lat, v: v, name: st.name });
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

  function ringsOf(feature) {
    var g = feature.geometry;
    if (g.type === 'Polygon') return g.coordinates;
    var out = [];
    g.coordinates.forEach(function (p) { p.forEach(function (r) { out.push(r); }); });
    return out;
  }

  function clipPath(ctx) {
    ctx.beginPath();
    S.outlines.features.forEach(function (f) {
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
    if (!S.map || !S.canvas || !S.field || !S.outlines) return;
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

    ctx.save();
    clipPath(ctx);
    var STEP = 6;                              // coarse grid, then blurred — smooth and quick
    var img = ctx.createImageData(Math.ceil(size.x / STEP), Math.ceil(size.y / STEP));
    var W = img.width, H = img.height, d = img.data;
    for (var gy = 0; gy < H; gy++) {
      for (var gx = 0; gx < W; gx++) {
        var px = gx * STEP, py = gy * STEP, num = 0, den = 0;
        for (var i = 0; i < proj.length; i++) {
          var dx = proj[i].x - px, dy = proj[i].y - py;
          var d2 = dx * dx + dy * dy;
          if (d2 < 1) { num = proj[i].v; den = 1; break; }
          var w = 1 / (d2 * d2 === 0 ? 1 : d2 * Math.sqrt(d2));  // inverse cube: local detail
          num += proj[i].v * w; den += w;
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

  function drawOutlines() {
    if (S.layers.outline) S.map.removeLayer(S.layers.outline);
    S.layers.outline = window.L.geoJSON(S.outlines, {
      style: function () {
        return { color: '#14212b', weight: 1.8, opacity: 0.95, fill: true,
                 fillColor: '#ffffff', fillOpacity: 0.01 };
      },
      onEachFeature: function (f, layer) {
        var p = f.properties;
        layer.bindTooltip(regionName(p.region) + ' · ' +
          Number(p.acres).toLocaleString() + ' acres of legumes', { sticky: true });
      }
    }).addTo(S.map);
  }

  function drawStations() {
    if (S.layers.stations) S.map.removeLayer(S.layers.stations);
    var g = window.L.layerGroup();
    S.field.stations.forEach(function (st) {
      window.L.circleMarker([st.lat, st.lon], {
        radius: 3.2, color: '#0f3b33', weight: 1.4, fillColor: '#2a9d9a', fillOpacity: 0.95
      }).bindTooltip(st.name + ' — reporting station', { sticky: true }).addTo(g);
    });
    S.layers.stations = g.addTo(S.map);
  }

  /* Open where the crop is, not on the bounding box of every outlier.
   * Big Horn is 6% of the acreage and 500 miles from Kansas; letting it set the view zooms the
   * Panhandle — two thirds of the crop — down to a smudge. The smaller regions stay drawn, and
   * "Show every region" reaches them; they just do not get to decide the opening frame. */
  function coreBounds() {
    var feats = S.outlines.features.slice().sort(function (a, b) {
      return b.properties.acres - a.properties.acres;
    });
    var total = feats.reduce(function (t, f) { return t + f.properties.acres; }, 0);
    var run = 0, core = [];
    for (var i = 0; i < feats.length; i++) {
      core.push(feats[i]);
      run += feats[i].properties.acres;
      if (run >= total * 0.65) break;
    }
    var b = window.L.latLngBounds([]);
    core.forEach(function (f) {
      ringsOf(f).forEach(function (ring) {
        ring.forEach(function (pt) { b.extend([pt[1], pt[0]]); });
      });
    });
    return b.pad(0.25);
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

  function updateReadout() {
    var el = $('nbReadout'); if (!el) return;
    var view = VIEWS[S.view];
    var vals = stationValues(S.day).map(function (p) { return p.v; })
      .filter(function (v) { return v != null && isFinite(v); })
      .sort(function (a, b) { return a - b; });
    if (!vals.length) { el.textContent = 'No station reported on this date.'; return; }
    var q = function (f) { return vals[Math.floor((vals.length - 1) * f)]; };
    var med = q(0.5), low = q(0.1), high = q(0.9);
    var r = Math.round;
    var text;
    if (S.view === 'stage') {
      // Past 110% the percentage stops being the useful number. A grower whose lentils finished
      // in July does not need to hear "168% of maturity"; they need to hear that it is standing.
      text = med >= 110
        ? S.crop + ' is <b>past maturity</b> across the region on this date. The slowest tenth ' +
          'reached ' + r(low) + '% of the heat it needs, so the field is finished and what ' +
          'matters now is weathering in the swath.'
        : S.crop + ' is at <b>' + r(med) + '% of maturity</b> across the region on this date, ' +
          'from ' + r(low) + '% in the slowest tenth to ' + r(high) + '% in the fastest.';
    } else if (S.view === 'heat') {
      text = S.crop + ' has taken <b>' + r(med) + ' days above ' +
        (CLASSES[S.crop] || CLASSES.PINTO).heat + '°F</b> at the median station, ' +
        'and up to ' + r(high) + ' in the hottest tenth. Heat in pod fill shows up as small seed.';
    } else {
      text = 'Thirty-day water balance runs <b>' + r(med) + ' mm</b> at the median station, ' +
        'from ' + r(low) + ' mm in the driest tenth to ' + r(high) + ' mm in the wettest. ' +
        'Negative means the crop drew down stored soil water.';
    }
    el.innerHTML = text + ' <span class="nbStationCount">' + S.field.stations.length +
      ' reporting stations</span>';
  }

  function updateLegend() {
    var view = VIEWS[S.view];
    var el = $('nbLegend'); if (!el) return;
    var stops = [];
    for (var i = 0; i <= 10; i++) {
      var c = rampColor(i / 10, view.ramp);
      stops.push('rgb(' + c.join(',') + ') ' + (i * 10) + '%');
    }
    var dom = domain();
    var fmt = function (v) { return Math.round(v).toLocaleString(); };
    el.innerHTML =
      '<div class="nbLegendBar" style="background:linear-gradient(90deg,' + stops.join(',') + ')"></div>' +
      '<div class="nbLegendEnds">' +
      '<span><em>' + fmt(dom.lo) + '</em>' + view.loLabel + '</span>' +
      '<span><em>' + fmt(dom.hi) + '</em>' + view.hiLabel + '</span></div>' +
      '<div class="nbLegendUnit">' + view.label + ' · ' + view.unit + ' · ' + S.crop + '<br>' +
      (S.interp === 'relative'
        ? 'Scale stretched to this date — read where, not how much'
        : 'One scale all season — dates are comparable') +
      ' · through ' + S.dates[S.dates.length - 1] + '</div>';
    var q = $('nbQuestion'); if (q) q.textContent = view.question;
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
      '<div class="nbMapFrame"><div id="nbMap"></div>' +
        '<div class="nbLegendCard" id="nbLegend"></div>' +
        '<div class="nbGeoNote">Low-opacity geography avoids false field precision. ' +
        'The surface is drawn only inside the growing regions. ' +
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
      S.crop = t.value; updateLegend(); setDay(S.day, true);
    }, true);
    $('nbView').addEventListener('change', function (e) {
      S.view = e.target.value; updateLegend(); setDay(S.day); });
    $('nbInterp').addEventListener('change', function (e) {
      S.interp = e.target.value; updateLegend(); setDay(S.day); });
    $('nbFitAll').addEventListener('click', function () {
      S.map.fitBounds(S.layers.outline.getBounds().pad(0.12));
    });
    $('nbPlay').addEventListener('click', play);
    $('nbSlider').addEventListener('input', function (e) { stop(); setDay(Number(e.target.value)); });
    $('nbFrame').addEventListener('change', function (e) { S.frame = Number(e.target.value); });
    $('nbSpeed').addEventListener('change', function (e) { S.speed = Number(e.target.value); });
  }

  function start() {
    if (!shell() || !window.L) return;
    var map = window.L.map('nbMap', { zoomControl: true, scrollWheelZoom: false,
                                      attributionControl: true });
    S.map = map;
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors · stations NOAA ASOS via Iowa ' +
                   'Environmental Mesonet · crop footprint USDA Cropland Data Layer',
      maxZoom: 12, opacity: 0.5
    }).addTo(map);

    var cv = document.createElement('canvas');
    cv.className = 'nbSurface';
    map.getContainer().appendChild(cv);
    S.canvas = cv;
    map.on('move zoom resize viewreset', paintSurface);

    Promise.all([
      fetch('assets/data/region-outlines.json?v=' + build()).then(function (r) { return r.json(); }),
      fetch('assets/data/station-field.json?v=' + build()).then(function (r) { return r.json(); })
    ]).then(function (res) {
      S.outlines = res[0]; S.field = res[1]; S.dates = S.field.dates;
      var sl = $('nbSlider'); sl.max = S.dates.length - 1; sl.value = S.dates.length - 1;
      drawOutlines(); drawStations();
      map.fitBounds(coreBounds());
      var picked = document.getElementById('nbCrop');
      if (picked && CLASSES[picked.value]) S.crop = picked.value;
      updateLegend(); wire();
      setDay(S.dates.length - 1, true);
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
