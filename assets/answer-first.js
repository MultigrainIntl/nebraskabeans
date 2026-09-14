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
    rows.sort(function (a, b) { return RANK[a.c.status] - RANK[b.c.status]; });

    var worst = rows[0];
    // Headline the MEDIAN condition, not the most common one. A plurality can be a
    // minority: with 5 of 7 regions ready to cut, two at-risk regions must not set the
    // headline. The worst region still gets its own watch line below.
    var byRank = rows.slice().sort(function (a, b) { return RANK[a.c.status] - RANK[b.c.status]; });
    var majority = byRank[Math.floor(byRank.length / 2)].c.status;

    var ready = rows.filter(function (r) { return r.c.percent_of_maturity >= 100; }).length;
    var when = ready === rows.length ? 'Ready to harvest across every region.'
      : ready === 0 ? 'Still filling everywhere — no region is ready.'
        : ready + ' of ' + rows.length + ' regions are ready to cut; the rest are still filling.';

    var heat = Math.round(rows.reduce(function (s, r) { return s + r.c.heat_days; }, 0) / rows.length);
    var size = heat >= 50 ? 'Expect smaller beans — heavy heat during fill.'
      : heat >= 30 ? 'Expect some size pressure — ' + heat + ' hot days during fill.'
        : 'Size should be normal — little heat during fill.';

    var watch = (worst.c.status === 'AT RISK' || worst.c.status === 'STRESSED')
      ? worst.name + ': ' + worst.c.call + '.' : null;

    return { rows: rows, majority: majority, when: when, size: size, watch: watch, worst: worst };
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
        '<td>' + r.c.call + '</td></tr>';
    }).join('');

    el.innerHTML =
      '<div class="nbA-pick"><label for="nbCrop">Crop</label>' +
      '<select id="nbCrop">' + opts + '</select></div>' +
      '<h2 class="nbA-head nbA-' + TONE[h.majority] + '">' + crop + ' — ' + h.majority + '</h2>' +
      '<p class="nbA-line">' + h.when + ' ' + h.size + '</p>' +
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
    setTimeout(function () { hideStationNoise(); labelRegions(); }, 250);

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
  function labelRegions() {
    var s = window.__nbCropStatus;
    if (!s || !window.__nbLeaflet) return;
    var map = window.__nbLeaflet, L = window.L;
    if (window.__nbLabels) { window.__nbLabels.forEach(function (m) { map.removeLayer(m); }); }
    window.__nbLabels = [];
    (window.__nbAreas || []).forEach(function (a) {
      var st = s.byRegion[a.id];
      if (!st) return;
      var m = L.marker(a.center, {
        interactive: false,
        icon: L.divIcon({ className: 'nbRegionTag', html: '<b>' + a.name + '</b><i>' + st + '</i>',
                          iconSize: [0, 0], iconAnchor: [-18, 8] })
      }).addTo(map);
      window.__nbLabels.push(m);
    });
  }

  function hideStationNoise() {
    var box = [].slice.call(document.querySelectorAll('input[type=checkbox]'))
      .filter(function (c) { return /station/i.test(c.parentNode.textContent || ''); })[0];
    if (box && box.checked) { box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  function boot() {
    var host = document.getElementById('nbAnswer');
    if (!host) return;
    fetch('assets/data/region-classes.json')
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
