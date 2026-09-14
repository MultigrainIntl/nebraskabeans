/* NebraskaBeans — answer first.
 *
 * The site previously opened with the model's internal state and made the reader do the
 * synthesis. This opens with the answer for one crop across every region, and puts the
 * working underneath for anyone who wants it.
 *
 * Nothing here changes the model. It reads region-classes.json, which is produced from
 * NOAA station observations and USDA soil data, and states the conclusion.
 */
(function () {
  'use strict';

  var ORDER = ['PINTO', 'GREAT NORTHERN', 'NAVY', 'BLACK', 'LIGHT RED KIDNEY',
    'DARK RED KIDNEY', 'PINK', 'SMALL RED', 'CRANBERRY', 'SMALL WHITE', 'BLACKEYE',
    'GARBANZO (KABULI)', 'GARBANZO (DESI)', 'LENTIL LARGE GREEN', 'LENTIL SMALL GREEN',
    'LENTIL RED', 'PEA YELLOW', 'PEA GREEN'];

  var RANK = { 'AT RISK': 0, 'STRESSED': 1, 'LATE': 2, 'WATCH': 3, 'ON TRACK': 4 };
  var TONE = { 'AT RISK': 'risk', 'STRESSED': 'risk', 'LATE': 'warn', 'WATCH': 'warn', 'ON TRACK': 'ok' };

  function headlineFor(crop, regions) {
    var rows = Object.keys(regions).map(function (id) {
      var r = regions[id], c = r.classes[crop];
      return c ? { id: id, name: r.name, state: r.state, c: c } : null;
    }).filter(Boolean);
    if (!rows.length) return null;

    // status is derived here so the map and the words cannot disagree
    rows.forEach(function (r) {
      var c = r.c, h = c.harvest || {};
      if (h.frost_forecast && (h.gdd_still_needed || 0) > 0) c.status = 'AT RISK';
      else if (c.percent_of_maturity < 90) c.status = 'LATE';
      else if (c.heat_days >= 50) c.status = 'STRESSED';
      else if (c.heat_days >= 30) c.status = 'WATCH';
      else c.status = 'ON TRACK';
      c.call = h.frost_forecast && (h.gdd_still_needed || 0) > 0
        ? 'frost forecast ' + h.frost_forecast + ' before it finishes'
        : (c.percent_of_maturity < 90
            ? 'still filling — ready about ' + (h.ready || 'beyond the forecast')
            : (c.heat_days >= 50 ? Math.round(c.heat_days) + ' hot days in fill — small seed'
              : (c.heat_days >= 30 ? Math.round(c.heat_days) + ' hot days — some size pressure' : 'no major flag')));
    });
    rows.sort(function (a, b) { return RANK[a.c.status] - RANK[b.c.status]; });

    var ys = rows.map(function (r) { return r.c.yield; }).filter(Boolean);
    var yieldRange = null, yieldVs = null;
    if (ys.length) {
      var lo = Math.min.apply(null, ys.map(function (y) { return y.low; }));
      var hi = Math.max.apply(null, ys.map(function (y) { return y.high; }));
      var base = Math.round(ys.reduce(function (s, y) { return s + y.baseline; }, 0) / ys.length);
      var mid = Math.round(ys.reduce(function (s, y) { return s + y.mid; }, 0) / ys.length);
      var vs = mid === base ? 'in line with' : (mid > base ? 'above' : 'below');
      yieldRange = lo.toLocaleString() + '–' + hi.toLocaleString() + ' lb/ac';
      yieldVs = vs + ' the ' + base.toLocaleString() + ' lb/ac recent average.';
    }

    var readyNow = rows.filter(function (r) { return (r.c.harvest || {}).ready === 'now'; }).length;
    var when = readyNow === rows.length ? 'Ready to cut everywhere.'
      : readyNow === 0 ? 'Nothing ready to cut yet.'
        : readyNow + ' of ' + rows.length + ' regions ready to cut now.';

    var heat = Math.round(rows.reduce(function (s, r) { return s + r.c.heat_days; }, 0) / rows.length);
    var size = heat >= 50 ? 'Expect smaller seed.' : heat >= 30 ? 'Expect some size pressure.' : 'Size should be normal.';

    var byRank = rows.slice();
    var majority = byRank[Math.floor(byRank.length / 2)].c.status;
    var worst = rows[0];
    var watch = (worst.c.status === 'AT RISK' || worst.c.status === 'STRESSED')
      ? worst.name + ' — ' + worst.c.call + '.' : null;

    return { rows: rows, majority: majority, when: when, size: size, watch: watch,
             yieldRange: yieldRange, yieldVs: yieldVs, worst: worst };
  }

  function render(data, crop) {
    var h = headlineFor(crop, data.regions);
    var el = document.getElementById('nbAnswer');
    if (!h || !el) return;

    var opts = ORDER.filter(function (c) { return data.classes[c]; }).map(function (c) {
      return '<option value="' + c + '"' + (c === crop ? ' selected' : '') + '>' + c + '</option>';
    }).join('');

    var table = h.rows.map(function (r) {
      return '<tr class="nbA-' + TONE[r.c.status] + '">' +
        '<td>' + r.name + '</td>' +
        '<td><b>' + r.c.status + '</b></td>' +
        '<td>' + (r.c.yield ? r.c.yield.low.toLocaleString() + '–' + r.c.yield.high.toLocaleString() + ' lb/ac' : '—') + '</td>' +
        '<td>' + ((r.c.harvest || {}).ready === 'now' ? 'cut now' : 'ready ' + ((r.c.harvest || {}).ready || '—')) + '</td>' +
        '<td>' + r.c.call + '</td></tr>';
    }).join('');

    el.innerHTML =
      '<div class="nbA-pick"><label for="nbCrop">Crop</label>' +
      '<select id="nbCrop">' + opts + '</select></div>' +
      '<h2 class="nbA-head nbA-' + TONE[h.majority] + '">' + crop +
        (h.yieldRange ? ' — ' + h.yieldRange : ' — ' + h.majority) + '</h2>' +
      '<p class="nbA-line"><b>' + h.when + '</b> ' + h.size +
        (h.yieldVs ? ' Running ' + h.yieldVs : '') + '</p>' +
      (h.watch ? '<p class="nbA-watch">Watch — ' + h.watch + '</p>' : '') +
      '<p class="nbA-q"><b>What sets the price:</b> ' + (data.classes[crop].quality_driver || '') + '</p>' +
      '<details class="nbA-more"><summary>Region by region</summary>' +
      '<table class="nbA-table"><tbody>' + table + '</tbody></table>' +
      '<p class="nbA-note">' + data.resolution + '</p></details>';

    // Publish this crop's condition per region so the map shows one crop across all of them.
    var byRegion = {};
    h.rows.forEach(function (r) { byRegion[r.id] = r.c.status; });
    window.__nbCropStatus = { crop: crop, byRegion: byRegion };
    if (typeof window.__nbRedrawYield === 'function') window.__nbRedrawYield();
    [250, 900, 2000].forEach(function (ms) {
      setTimeout(function () { hideStationNoise(); labelRegions(); drawGrowingRegions(); shrinkMarkers(); }, ms);
    });

    var sel = document.getElementById('nbCrop');
    if (sel) sel.addEventListener('change', function (e) {
      render(data, e.target.value);
      try { localStorage.setItem('nbCrop', e.target.value); } catch (err) { /* private window */ }
    });
  }


  /* The map section arrives carrying a heading, an explanatory paragraph, a five-tile
     snapshot and a region-picker essay. The answer block above already says all of it.
     Move that furniture into "Dig deeper" so the map is just the map. */
  /* One answer, one map. Every other panel around the map is moved into "Dig deeper".
     The map then takes the full width instead of sharing it with a sidebar. */
  function declutter() {
    var deeper = document.querySelector('.nbDeeperBody');
    if (!deeper) return;
    var move = function (node) { if (node) deeper.insertBefore(node, deeper.firstChild); };

    ['nbSeasonSnapshot', 'nbDecisionPanel'].forEach(function (id) { move(document.getElementById(id)); });
    ['.nbTimelines', '.nbRegionPanel', '.nbDecisionMapPanel'].forEach(function (sel) {
      move(document.querySelector(sel));
    });

    var sec = document.getElementById('mapSection');
    if (sec) {
      move(sec.querySelector('.sectionhead'));
      // Everything beneath the map was build metadata: frame counts, CDL acreage, station
      // tallies, data-build hashes, calibration seasons. None of it helps someone decide
      // whether to cut. It is provenance and belongs with the evidence.
      [].slice.call(sec.querySelectorAll('p, small, .note, .meta, div')).forEach(function (n) {
        var s = (n.textContent || '').trim();
        if (!s || n.querySelector('#map') || n.closest('.leaflet-container')) return;
        if (/daily frames|CDL|mapped acres|stations with reports|county boundaries|Data build|calibration seasons|point outlooks released|temporal interpolation/i.test(s)) {
          move(n);
        }
      });
      var speed = sec.querySelector('#playSpeed');
      if (speed && speed.closest('div')) move(speed.closest('div'));
      [].slice.call(sec.querySelectorAll('button')).forEach(function (b) {
        if (/zoom to crop detail/i.test(b.textContent || '')) move(b.parentNode.children.length === 1 ? b.parentNode : b);
      });
      [].slice.call(sec.querySelectorAll('p')).forEach(function (p) {
        if (p.textContent.trim().length > 90 && !p.closest('.leaflet-container')) p.remove();
      });
    }

    // the sidebar is gone — the map takes the whole workspace (widths are set in CSS).
    // Leaflet caches its container size, so it must be told the box changed.
    // the dots now show the selected crop's condition, not a pinto yield ramp —
    // the old legend contradicted them, so it is replaced.
    var lg = document.getElementById('mapLegend');
    if (lg) {
      lg.classList.remove('nbLegendOpen');
      lg.innerHTML = '<b>Crop condition by region</b>'
        + '<div class="nbKey"><span style="background:#2f7d4f"></span>On track'
        + '<span style="background:#b8a23a"></span>Watch'
        + '<span style="background:#c79a2b"></span>Late'
        + '<span style="background:#c4622c"></span>Stressed'
        + '<span style="background:#9c2b20"></span>At risk</div>';
    }
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 120);
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 600);
    // frame the producing regions; the default view wasted half the map on Illinois
    setTimeout(function () {
      try {
        var m = window.__nbLeaflet;
        if (m && window.__nbGrowGeo && window.L) {
          // the outer 4% of cells are scattered strays; framing on them wastes half the map
          var pts = window.__nbGrowGeo.features.map(function (f) {
            var c = f.geometry.coordinates[0];
            return [c[0][1], c[0][0]];
          });
          var lats = pts.map(function (p) { return p[0]; }).sort(function (a, b) { return a - b; });
          var lons = pts.map(function (p) { return p[1]; }).sort(function (a, b) { return a - b; });
          var q = function (arr, f) { return arr[Math.floor(arr.length * f)]; };
          m.fitBounds(window.L.latLngBounds(
            [q(lats, 0.02), q(lons, 0.02)], [q(lats, 0.98), q(lons, 0.98)]).pad(0.10));
        } else if (m && window.__nbAreas && window.L) {
          m.fitBounds(window.L.latLngBounds(window.__nbAreas.map(function (a) { return a.center; })).pad(0.2));
        }
      } catch (e) { /* leave the default view */ }
    }, 1400);
  }

  function simplifyMapPanel() {
    var panel = document.querySelector('.nbDecisionMapPanel');
    if (!panel || panel.dataset.nbSimplified) return;
    panel.dataset.nbSimplified = '1';
    var kids = [].slice.call(panel.children);
    var keep = kids.slice(0, 1);                       // the title bar only
    var rest = kids.slice(1);
    var d = document.createElement('details');
    var s = document.createElement('summary');
    s.textContent = 'Map layers and controls';
    s.className = 'nbPanelMore';
    d.appendChild(s);
    rest.forEach(function (n) { d.appendChild(n); });
    panel.appendChild(d);
  }


  /* Decision support ON the map: label every region with its call, and hide the 200 weather
     stations that mean nothing to someone deciding whether to cut. The stations remain
     available under "Dig deeper" — they are evidence, not the answer. */
  var STATUS_COLOR = { 'AT RISK':'#9e1b0e','STRESSED':'#d4541c','LATE':'#eb9a00','WATCH':'#f0cb2a','ON TRACK':'#17794a' };

  /* Growing-region polygons. 344 cells aggregated from the USDA Cropland Data Layer — where
     dry beans actually grew in 2025 — shaded by the selected crop's condition in that region.
     This replaces both the point markers as the primary read and the 66,000 field specks. */
  function drawGrowingRegions(attempt) {
    var s = window.__nbCropStatus, map = window.__nbLeaflet, L = window.L;
    if (!s || !map || !L) {
      attempt = (attempt || 0) + 1;
      if (attempt < 25) setTimeout(function () { drawGrowingRegions(attempt); }, 300);
      return;
    }
    var paint = function (geo) {
      if (window.__nbGrow) map.removeLayer(window.__nbGrow);
      window.__nbGrow = L.geoJSON(geo, {
        style: function (f) {
          var st = s.byRegion[f.properties.region];
          return { color: '#fff', weight: 0.3, opacity: 0.5,
                   fillColor: STATUS_COLOR[st] || '#b9c0bc', fillOpacity: st ? 0.62 : 0.2 };
        },
        onEachFeature: function (f, layer) {
          var st = s.byRegion[f.properties.region] || 'no data';
          layer.bindTooltip(f.properties.acres.toLocaleString() + ' acres · ' + st, { sticky: true });
        }
      }).addTo(map);
      if (window.__nbGrow.bringToBack) window.__nbGrow.bringToBack();
    };
    if (window.__nbGrowGeo) return paint(window.__nbGrowGeo);
    fetch('assets/data/growing-regions.json').then(function (r) { return r.json(); })
      .then(function (geo) { window.__nbGrowGeo = geo; paint(geo); })
      .catch(function () { /* markers still carry the answer */ });
  }

  function shrinkMarkers() {
    // the growing-region shading now carries the condition; the large circles repeated it.
    // Reduced to a small anchor so the label has something to point at.
    var m = window.__nbLeaflet;
    if (!m || !m.eachLayer) return;
    m.eachLayer(function (l) {
      if (l.setRadius && l.options && l.options.pane === 'yieldPane') {
        try { l.setRadius(5); l.setStyle({ weight: 1.5, color: '#fff', fillOpacity: 1 }); } catch (e) {}
      }
      if (l.eachLayer) l.eachLayer(function (x) {
        if (x.setRadius && x.options && x.options.pane === 'yieldPane') {
          try { x.setRadius(5); x.setStyle({ weight: 1.5, color: '#fff', fillOpacity: 1 }); } catch (e) {}
        }
      });
    });
  }

  function labelRegions(attempt) {
    var s = window.__nbCropStatus;
    // the map is built by app.js asynchronously; wait for it rather than silently doing nothing
    if (!s || !window.__nbLeaflet || !window.L) {
      attempt = (attempt || 0) + 1;
      if (attempt < 25) setTimeout(function () { labelRegions(attempt); }, 300);
      return;
    }
    var map = window.__nbLeaflet, L = window.L;
    if (window.__nbLabels) { window.__nbLabels.forEach(function (m) { map.removeLayer(m); }); }
    window.__nbLabels = [];
    (window.__nbAreas || []).forEach(function (a) {
      var st = s.byRegion[a.id];
      if (!st) return;
      // fixed offsets stop the Wyoming/Panhandle and Colorado/Nebraska tags colliding
      var OFF = {
        'ne-panhandle':   [-20, -30], 'sw-nebraska':     [-20,  22],
        'ne-colorado':    [ 96,  16], 'western-colorado':[-20,  22],
        'big-horn':       [-20, -30], 'se-wyoming':      [ 92, -14],
        'nw-kansas':      [-20,  22]
      };
      var o = OFF[a.id] || [-20, 10];
      var m = L.marker(a.center, {
        interactive: false,
        icon: L.divIcon({ className: 'nbRegionTag', html: '<b>' + a.name + '</b><i>' + st + '</i>',
                          iconSize: [0, 0], iconAnchor: o })
      }).addTo(map);
      window.__nbLabels.push(m);
    });
  }

  function hideStationNoise(attempt) {
    // Weather stations and the historical crop-footprint polygons are evidence, not answers.
    // Thousands of purple specks and 200 blue dots bury the seven markers that matter.
    var boxes = [].slice.call(document.querySelectorAll('input[type=checkbox]'))
      .filter(function (c) { return /station|polygon|footprint/i.test(c.parentNode.textContent || ''); });
    boxes.forEach(function (c) {
      if (c.checked) { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    var box = boxes[0];
    if (box) {
      if (box.checked) { box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); }
      return;
    }
    attempt = (attempt || 0) + 1;
    if (attempt < 25) setTimeout(function () { hideStationNoise(attempt); }, 300);
  }

  function boot() {
    var host = document.getElementById('nbAnswer');
    if (!host) return;
    fetch('assets/data/region-answers.json')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var saved = null;
        try { saved = localStorage.getItem('nbCrop'); } catch (e) { /* ignore */ }
        render(d, (saved && d.classes[saved]) ? saved : 'PINTO');
        setTimeout(function () { declutter(); simplifyMapPanel(); }, 400);  // after decision-workbench injects its panels
      })
      .catch(function () {
        host.innerHTML = '<p class="nbA-line">Crop status is unavailable — the class dataset did not load. ' +
          'No estimate is shown rather than a stale one.</p>';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
