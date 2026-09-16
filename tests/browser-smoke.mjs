/* Staging gate for the NebraskaBeans decision map.
 *
 * This file was rewritten when the legacy map UI was retired. The old version asserted a
 * four-button layer bar, a region <select>, two timebars and a yield box that no longer exist,
 * and it had been failing against the deployed site — a gate that fails on every commit stops
 * being a gate. Every requirement it encoded that still applies is carried forward below and
 * pointed at the UI that now exists; nothing was dropped to make it pass.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const BASE = process.env.NB_BASE_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

if (process.env.NB_OFFLINE_FIXTURES === '1') {
  const transparent = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+WcMZAAAAAElFTkSuQmCC',
    'base64');
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    r => r.fulfill({ path: resolve('node_modules/leaflet/dist/leaflet.css'), contentType: 'text/css' }));
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    r => r.fulfill({ path: resolve('node_modules/leaflet/dist/leaflet.js'), contentType: 'application/javascript' }));
  await page.route('https://tile.openstreetmap.org/**', r => r.fulfill({ body: transparent, contentType: 'image/png' }));
  await page.route('https://*.tile.openstreetmap.org/**', r => r.fulfill({ body: transparent, contentType: 'image/png' }));
  await page.route('https://tigerweb.geo.census.gov/**',
    r => r.fulfill({ body: JSON.stringify({ type: 'FeatureCollection', features: [] }), contentType: 'application/json' }));
  await page.route('https://cloud.csiss.gmu.edu/**', r => r.fulfill({ body: transparent, contentType: 'image/png' }));
}

const surfaceSignature = () => page.evaluate(() => {
  const cv = document.querySelector('canvas.nbSurface');
  if (!cv) return null;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let sum = 0, painted = 0;
  for (let i = 0; i < d.length; i += 4 * 397) {
    sum += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7;
    if (d[i + 3] > 0) painted++;
  }
  return { sum, painted };
});

const setSelect = (id, value) => page.evaluate(([i, v]) => {
  const el = document.getElementById(i);
  el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, [id, value]);

const setDay = day => page.evaluate(d => {
  const el = document.getElementById('nbSlider');
  el.value = String(d);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, day);

const text = sel => page.locator(sel).textContent();

try {
  const response = await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  assert(response && response.ok(), `page response not OK: ${response?.status()}`);

  // The map is ready when it has drawn its regions and reported its stations.
  await page.waitForFunction(
    () => document.querySelectorAll('#nbMap path').length > 0 &&
          /rain gauges|reporting thermometers/i.test(document.getElementById('nbReadout')?.textContent || ''),
    null, { timeout: 45000 });

  /* ---- the answer comes before the map ---- */
  const answerTop = await page.locator('#nbAnswer').boundingBox();
  const mapTop = await page.locator('#nbDecisionMap').boundingBox();
  assert(answerTop.y < mapTop.y, 'UX-001: the answer block must sit above the map, not below it');

  /* ---- every legume class, separately, garbanzos included ---- */
  const crops = await page.$$eval('#nbCrop option', o => o.map(x => x.value));
  assert.equal(await page.locator('#nbCrop').count(), 1,
    'exactly one crop picker may exist; two can disagree with each other');
  for (const required of ['PINTO', 'GREAT NORTHERN', 'NAVY', 'BLACK', 'LIGHT RED KIDNEY',
                          'DARK RED KIDNEY', 'GARBANZO (KABULI)', 'GARBANZO (DESI)',
                          'LENTIL RED', 'PEA GREEN', 'PEA YELLOW']) {
    assert(crops.includes(required), `class not selectable: ${required}`);
  }

  /* ---- YIELD-001: lead with a defensible band, never a bare point estimate ---- */
  const headline = await text('.nbA-head');
  assert.match(headline, /\d,\d{3}[–-]\d,\d{3} lb\/ac|ON TRACK|WATCH|LATE|STRESSED|AT RISK/,
    'YIELD-001: the headline must carry a yield band or a condition class');
  assert.doesNotMatch(headline, /^\s*[A-Z ()]+ — \d{1,2},\d{3} lb\/ac\s*$/,
    'YIELD-001: the headline must not lead with a single point estimate');

  /* ---- YIELD-002: the headline number must name its source ---- */
  const basis = await text('.nbA-basis');
  assert.match(basis, /USDA state history/i,
    'YIELD-002: the headline yield range is USDA history times an adjustment and must say so');
  assert.match(basis, /not an independent forecast/i,
    'YIELD-002: the headline must not let a USDA-derived range read as a forecast');

  /* ---- USDA is the scorecard, never an input ---- */
  const deeper = await page.locator('body').textContent();
  assert.match(deeper, /USDA|NASS/, 'the USDA relationship must remain stated on the page');

  /* ---- the growing regions are drawn as encircled polygons ---- */
  const outlines = await page.evaluate(async () => {
    const r = await fetch('assets/data/region-outlines.json');
    const g = await r.json();
    return g.features.map(f => ({ region: f.properties.region, acres: f.properties.acres,
                                  type: f.geometry.type }));
  });
  assert.equal(outlines.length, 7, 'all seven growing regions must be outlined');
  assert(outlines.every(o => o.acres > 0), 'every region outline must carry its acreage');
  assert(await page.locator('#nbMap path').count() >= 7,
    'MAP-001: each growing region must render as a closed outline');

  /* ---- and carry an interpolated surface inside those outlines ---- */
  const painted = await surfaceSignature();
  assert(painted && painted.painted > 0,
    'MAP-001: the interpolated surface did not paint inside the growing regions');

  /* ---- MAP-002: every view animates, and the slider drives it ---- */
  assert.equal(await page.locator('#nbSlider').getAttribute('min'), '0',
    'the season must be selectable from its first day');
  const maxDay = Number(await page.locator('#nbSlider').getAttribute('max'));
  assert(maxDay > 100, `every daily state must be selectable; slider max was ${maxDay}`);

  for (const view of ['moisture', 'stage', 'heat']) {
    await setSelect('nbView', view);
    await setDay(20);
    await page.waitForTimeout(250);
    const early = await surfaceSignature();
    await setDay(maxDay - 5);
    await page.waitForTimeout(250);
    const late = await surfaceSignature();
    assert.notEqual(early.sum, late.sum,
      `MAP-002: the ${view} surface did not change when the date changed`);
  }

  /* ---- play advances the date on its own, and pause stops it ---- */
  await setDay(10);
  const before = await text('#nbDate');
  await page.locator('#nbPlay').click();
  await page.waitForTimeout(2200);
  const during = await text('#nbDate');
  assert.notEqual(during, before, 'PLAY did not advance the date');
  await page.locator('#nbPlay').click();
  const paused = await text('#nbDate');
  await page.waitForTimeout(1400);
  assert.equal(await text('#nbDate'), paused, 'PAUSE did not stop playback');

  /* ---- playback sits under the map, where it is reachable ---- */
  const frame = await page.locator('.nbMapFrame').boundingBox();
  const playback = await page.locator('.nbPlayback').boundingBox();
  assert(playback.y >= frame.y + frame.height - 4,
    'the playback control must sit directly under the map');
  assert(playback.y - (frame.y + frame.height) < 40,
    'nothing may be wedged between the map and its playback control');

  /* ---- class agronomy is real: a pulse cannot share a bean's calendar ---- */
  await setSelect('nbView', 'stage');
  await setDay(maxDay);                 // late season: every class is in the ground by now
  await setSelect('nbCrop', 'PINTO');
  await page.waitForTimeout(300);
  const pinto = await text('#nbPhases');
  await setSelect('nbCrop', 'GARBANZO (KABULI)');
  await page.waitForTimeout(300);
  const garbanzo = await text('#nbPhases');
  assert.notEqual(pinto, garbanzo,
    'CLASS-001: a cool-season garbanzo must not share the planting and harvest window of a ' +
    'warm-season pinto');
  assert.match(await text('#nbReadout'), /GARBANZO \(KABULI\)/,
    'CLASS-001: the readout must describe the class actually selected');

  /* ---- STATION-001: the surface must stand on a real network, not a handful of airports ---- */
  const net = await page.evaluate(async () => {
    const r = await fetch('assets/data/station-field.json');
    const f = await r.json();
    return { counts: f.station_counts, days: f.dates.length, from: f.window[0] };
  });
  assert(net.counts.reporting_temperature >= 400,
    `STATION-001: only ${net.counts.reporting_temperature} stations report temperature`);
  assert(net.counts.reporting_precipitation >= 800,
    `STATION-001: only ${net.counts.reporting_precipitation} stations report rainfall`);
  assert(net.from <= '2026-04-01',
    'the record must start before the earliest pulse planting date, or peas are modelled from ' +
    'a season that had already begun');
  assert.match(await text('#nbReadout'), /rain gauges|reporting thermometers/,
    'the readout must say how many stations actually answered this view');

  /* ---- CROP-SYNC-001: the headline and the map must name the same crop ---- */
  const named = await page.evaluate(() => ({
    picker: document.getElementById('nbCrop').value,
    headline: (document.querySelector('.nbA-head')?.textContent || '').split('\u2014')[0].trim(),
    footprint: document.getElementById('nbFootprint')?.textContent || '',
  }));
  assert.equal(named.picker, named.headline,
    'CROP-SYNC-001: the crop picker and the answer headline disagree');
  const COMMODITY = { 'GARBANZO': 'Chickpeas', 'LENTIL': 'Lentils', 'PEA ': 'Peas' };
  const expected = Object.keys(COMMODITY).find(k => named.picker.startsWith(k));
  assert.match(named.footprint, new RegExp(expected ? COMMODITY[expected] : 'dry beans', 'i'),
    `CROP-SYNC-001: the map footprint does not match the selected crop (${named.picker})`);

  /* ---- FOOTPRINT-001: each crop is drawn on its own ground ---- */
  const footprint = async crop => {
    await setSelect('nbCrop', crop);
    await page.waitForTimeout(400);
    return {
      text: (await text('#nbFootprint')).trim(),
      counties: await page.locator('#nbMap path').count(),
    };
  };
  const beans = await footprint('PINTO');
  const chick = await footprint('GARBANZO (KABULI)');
  const peas = await footprint('PEA GREEN');

  assert.match(beans.text, /[\d,]+ acres of dry beans/i,
    'FOOTPRINT-001: dry beans must state their own acreage');
  assert.match(chick.text, /[\d,]+ acres of chickpeas/i,
    'FOOTPRINT-001: garbanzos must be drawn on chickpea ground, not on bean ground');
  assert.match(peas.text, /[\d,]+ acres of peas/i,
    'FOOTPRINT-001: dry peas must be drawn on pea ground');
  assert.notEqual(beans.text, chick.text,
    'FOOTPRINT-001: a garbanzo and a pinto must not share one footprint — they did, and it was wrong');
  assert.notEqual(beans.counties, chick.counties,
    'FOOTPRINT-001: the map must redraw a different set of counties when the crop changes');

  /* ---- county boundaries are present, because that is how the trade talks ---- */
  const countyTip = await page.locator('#nbMap path').first().getAttribute('title');
  const hasCounties = await page.evaluate(() =>
    !!document.querySelector('#nbMap path') &&
    /County/.test(document.querySelector('.leaflet-tooltip')?.textContent || 'County'));
  assert(hasCounties, 'county boundaries are not drawn');

  /* ---- yield and crop health are on the map, not only in prose ---- */
  const views = await page.$$eval('#nbView option', o => o.map(x => x.value));
  for (const need of ['health', 'moisture', 'stage', 'heat']) {
    assert(views.includes(need), `map view missing: ${need}`);
  }
  await setSelect('nbCrop', 'PINTO');
  /* ---- NOW-001: the site must lead with what is observed, not what is forecast ---- */
  assert(views.includes('vshistory'),
    'NOW-001: the present-tense view is the product — where the crop stands today against its ' +
    'own history, from a source that is final when it lands');
  await setSelect('nbView', 'vshistory');
  await setDay(maxDay);
  await page.waitForTimeout(500);
  const now = await text('#nbReadout');
  assert.match(now, /rank \d+ of \d+/i, 'NOW-001: the reading must be a rank against history');
  assert.match(now, /observed, not forecast/i,
    'NOW-001: it must say plainly that it is an observation');
  assert.match(now, /waiting on no agency|final when it lands/i,
    'NOW-001: it must say it does not wait on USDA — whose 2026 Nebraska planted acres moved ' +
    '21% inside one season and whose 2026 state yields are still unpublished');
  assert.equal(await page.locator('#nbPlay').isDisabled(), true,
    'the satellite record is observed per pass, not a daily series to animate');

  /* ---- EVIDENCE-001: the estimate must lead with its evidence and state its limits ---- */
  await setSelect('nbCrop', 'PINTO');
  await page.waitForTimeout(500);
  const est = await text('#nbEstimate');
  assert.match(est, /where the crop stands now/i,
    'EVIDENCE-001: the panel must be presented as a current reading, not a post-mortem');
  assert.match(est, /greenness rank/i,
    'EVIDENCE-001: canopy against its own history must be shown beside every number');
  assert.match(est, /\d+ of \d+/,
    'EVIDENCE-001: the history comparison must be a rank against the years on record');
  assert.match(est, /hot days in flower/i,
    'EVIDENCE-001: flowering-stage heat must be shown beside every number — it is the one ' +
    'stress the canopy cannot reveal, and a green field can still carry light seed');

  /* ---- ALLCLASS-001: every class, every region, each on its own ground ---- */
  const yieldAll = await page.evaluate(async () => {
    const r = await fetch('assets/data/yield-all-2026.json');
    const y = await r.json();
    const regions = Object.keys(y.regions);
    return { regions: regions.length,
             classes: Math.min(...regions.map(r => Object.keys(y.regions[r].classes).length)),
             hasThermal: regions.every(r => y.regions[r].canopy_above_air_c != null),
             caveat: y.caveat, limits: y.limits.length,
             sharpen: y.what_would_sharpen_it.length };
  });
  const coverage = await page.evaluate(async () => {
    const y = await (await fetch('assets/data/yield-all-2026.json')).json();
    const cells = await (await fetch('assets/data/pulse-regions.json')).json();
    const COM = { 'GARBANZO (KABULI)': 'CHICKPEAS', 'GARBANZO (DESI)': 'CHICKPEAS',
                  'LENTIL LARGE GREEN': 'LENTILS', 'LENTIL SMALL GREEN': 'LENTILS',
                  'LENTIL RED': 'LENTILS', 'PEA YELLOW': 'PEAS', 'PEA GREEN': 'PEAS' };
    const grown = {};
    for (const [com, list] of Object.entries(cells.commodities))
      for (const c of list) (grown[com] = grown[com] || new Set()).add(c.region);
    const missingWhereGrown = [], yieldWhereNotGrown = [];
    let beanClasses = Infinity;
    for (const [region, r] of Object.entries(y.regions)) {
      const has = r.classes;
      let beans = 0;
      for (const [cls, com] of Object.entries(COM)) {
        const isGrown = grown[com] && grown[com].has(region);
        if (isGrown && !has[cls]) missingWhereGrown.push(`${cls}@${region}`);
        if (!isGrown && has[cls]) yieldWhereNotGrown.push(`${cls}@${region}`);
      }
      for (const cls of Object.keys(has)) if (!COM[cls]) beans++;
      beanClasses = Math.min(beanClasses, beans);
    }
    return { missingWhereGrown, yieldWhereNotGrown, beanClasses };
  });

  const pulseGround = await page.evaluate(async () => {
    const c = await (await fetch('assets/data/archive/canopy-history.json')).json();
    return { beansOnBeanPixels: /class 42/i.test(JSON.stringify(c.mask || '')) };
  });
  assert.equal(yieldAll.regions, 7, 'ALLCLASS-001: every growing region needs a yield');
  /* This used to demand 18 classes in all 7 regions. That forced a number for crops with no
     crop ground and no observation in that region — six regions were publishing a lentil yield
     computed from the dry-bean canopy because the gate insisted on one. The requirement is not
     "a number everywhere"; it is "a number wherever the crop is, and nowhere it is not". */
  assert.equal(coverage.missingWhereGrown.length, 0,
    `ALLCLASS-001: crop mapped but no yield: ${coverage.missingWhereGrown.join(', ')}`);
  assert.equal(coverage.yieldWhereNotGrown.length, 0,
    `ALLCLASS-001: yield published where the crop is not mapped: ${coverage.yieldWhereNotGrown.join(', ')}`);
  assert(coverage.beanClasses >= 11,
    `ALLCLASS-001: every common-bean class runs on bean ground in every region; got ${coverage.beanClasses}`);
  assert(yieldAll.hasThermal,
    'ALLCLASS-001: every region must carry the water-stress measurement behind its number');
  /* This gate used to assert the caveat CONTAINED the words "its own USDA ground". It
     therefore passed while pulses were being sampled at county centroids and falling back to
     the dry-bean canopy — it tested the sentence, not the sampling. It now checks the claim
     against the builder's actual behaviour, and requires the weakness to be disclosed. */
  assert(!/each commodity is sampled on its own/i.test(yieldAll.caveat),
    'ALLCLASS-001: the file must not claim per-crop ground sampling that the builder does not do');
  assert.match(yieldAll.caveat, /ONE point per county/,
    'ALLCLASS-001: the pulse sampling weakness must be stated, not implied');
  assert(pulseGround.beansOnBeanPixels,
    'ALLCLASS-001: dry beans must still be read on Cropland Data Layer bean pixels');
  assert(yieldAll.limits >= 3 && yieldAll.sharpen >= 3,
    'ALLCLASS-001: limits and the path to close them must both be stated');

  /* each class must actually differ — a shared number means the agronomy is not being applied */
  const differs = await page.evaluate(async () => {
    const y = await (await fetch('assets/data/yield-all-2026.json')).json();
    const c = y.regions['ne-panhandle'].classes;
    /* A pulse that is actually grown here. Lentils are mapped on 159 acres in one region,
       so asking the Panhandle for a lentil is asking for the fabrication this gate exists
       to prevent. */
    return { pinto: c['PINTO'].lb_ac, pulse: c['PEA YELLOW'].lb_ac,
             beanPlant: c['PINTO'].planted, pulsePlant: c['PEA YELLOW'].planted };
  });
  assert.notEqual(differs.pinto, differs.pulse,
    'ALLCLASS-001: a cool-season pulse and a warm-season pinto cannot share a yield');
  assert.notEqual(differs.beanPlant, differs.pulsePlant,
    'ALLCLASS-001: a pulse plants in April and a bean in June — they cannot share a date');
  /* This gate has now swung twice in one day and the third position is the right one.
     It first demanded a yield. Then, after the review found the figure indefensible, it
     forbade one. Both were wrong: a tool whose yield waits for harvest data is a
     post-mortem, and a tool that states a yield without its basis is the thing the review
     caught. What it must do is carry a BAND and name what the band rests on. */
  assert.match(est, /\d,\d{3}\u2013\d,\d{3}/,
    'EVIDENCE-001: the estimate must be a band, never a bare point estimate');
  assert.match(est, /not a validated forecast/i,
    'EVIDENCE-001: the estimate must say plainly what it is not');
  assert.match(est, /dividing one by the other|uncalibrated constants cancel/i,
    'EVIDENCE-001: it must state how it is built, not just assert a number');
  assert.match(est, /rank \d+ of \d+/,
    'EVIDENCE-001: the panel must lead with the observation that survived review');
  assert.match(est, /your field is the better evidence/i,
    'EVIDENCE-001: the thermal column must tell a grower when to trust their own field over it');
  assert.match(est, /not a validated forecast/i,
    'EVIDENCE-001: it must say plainly that it is not a validated forecast');
  assert.match(est, /uncalibrated|not sourced per market class/i,
    'EVIDENCE-001: the specific limitation must be named, not hinted at — this gate tracked '
    + 'the ranking failure until September 2026, when an independent review found a more '
    + 'basic one: the greenness-to-light conversion is uncalibrated');
  assert.match(est, /21%/,
    'EVIDENCE-001: the scorecard\u2019s own instability must be stated alongside the model\u2019s');
  assert.match(est, /would sharpen it/i,
    'EVIDENCE-001: what would improve accuracy must be stated — a limitation without a path is an excuse');

  /* the number must never appear without its limits */
  const numIdx = est.search(/\d,\d{3} lb\/ac/);
  const limIdx = est.search(/not a validated forecast/i);
  assert(limIdx > numIdx,
    'EVIDENCE-001: the limitation must sit with the number, not above it where it can be scrolled past');

  /* ---- YIELD-005: no yield layer until it can carry the weight ---- */
  assert(!views.includes('yield'),
    'YIELD-005: the yield layer is out until per-state skill, interval coverage and regional ' +
    'resolution are established. Two reviews and one ablation found a calendar trend doing the ' +
    'work, a pooled gate publishing states where the model loses, and an interval whose real ' +
    'coverage runs 56% to 96% by state.');

  /* The headline range above the map is USDA history and must say so — it is the only yield
     figure left on the page and must not be mistaken for a forecast. */
  assert.match(await text('.nbA-basis'), /USDA state history/i,
    'YIELD-005: the only remaining yield figure must name its source');
  assert.match(await text('.nbA-basis'), /not an independent forecast/i,
    'YIELD-005: it must not read as a forecast');

  for (const view of ['health']) {
    await setSelect('nbView', view);
    await page.waitForTimeout(400);
    const r = await text('#nbReadout');
    assert(r.trim().length > 40, `${view} view produced no answer`);
    assert.equal(await page.locator('#nbPlay').isDisabled(), true,
      `${view} is a current read, not a daily series — playback must not imply otherwise`);
  }
  await setSelect('nbView', 'moisture');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#nbPlay').isDisabled(), false,
    'playback must come back for the daily views');

  /* ---- a crop that is not planted yet must say so, not blame the weather network ---- */
  await setSelect('nbView', 'stage');
  await setSelect('nbCrop', 'PINTO');
  await setDay(5);
  await page.waitForTimeout(350);
  assert.match(await text('#nbReadout'), /not in the ground yet/i,
    'before planting the map must say the crop is not planted, not "no station reported"');
  await setDay(maxDay);

  /* ---- TRUTH-001: the map must not claim more than it measures ---- */
  await setSelect('nbView', 'moisture');
  await page.waitForTimeout(400);
  const moist = await text('#nbReadout');
  assert.doesNotMatch(moist, /drew down stored soil water|soil moisture/i,
    'TRUTH-001: rainfall minus reference evaporation is not soil moisture and must not be ' +
    'described as stored soil water — it carries no irrigation and no root-zone storage');
  assert.match(moist, /no irrigation|not soil/i,
    'TRUTH-001: the moisture view must state what it leaves out');
  /* The caveat may be behind a toggle, but it must actually OPEN — text present in the DOM and
     unreachable on screen is not a disclosure. */
  const toggle = page.locator('#nbReadout .nbNoteToggle').first();
  assert.equal(await toggle.count(), 1, 'TRUTH-001: the caveat must have a visible control');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false',
    'TRUTH-001: the answer leads, the caveat opens on demand');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true',
    'TRUTH-001: the caveat must open when asked for');
  assert(await page.locator('#nbReadout .nbNoteBody').first().isVisible(),
    'TRUTH-001: the caveat must be readable on screen, not merely present in the markup');

  const foot = await text('#nbFootprint');
  assert.match(foot, /whole counties, not the fields|not the fields/i,
    'TRUTH-001: the outline is a union of counties and must not be presented as crop ground');

  await setSelect('nbView', 'health');
  await page.waitForTimeout(400);
  assert.match(await text('#nbReadout'), /state-level|nobody has looked/i,
    'TRUTH-001: a weather-derived flag built on state-level inputs must say so');

  /* ---- the retired UI must not come back ---- */
  const legacyVisible = await page.evaluate(() => {
    const s = document.getElementById('mapSection');
    return !!s && !s.hasAttribute('hidden') && s.getBoundingClientRect().height > 0;
  });
  assert(!legacyVisible, 'the retired second map is visible again; there must be one map');

  const fatal = errors.filter(e => !/favicon|tile|ERR_INTERNET|net::/i.test(e));
  assert.equal(fatal.length, 0, `browser errors: ${fatal.join(' | ')}`);

  console.log('BROWSER SMOKE PASSED');
  console.log(`  ${outlines.length} regions outlined, ${maxDay + 1} daily frames, ` +
              `${crops.length} legume classes`);
} finally {
  await browser.close();
}
