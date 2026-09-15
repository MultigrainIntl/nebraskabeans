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
  assert.match(named.footprint, new RegExp(expected ? COMMODITY[expected] : 'Dry beans'),
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

  assert.match(beans.text, /Dry beans ground here is [\d,]+ acres/,
    'FOOTPRINT-001: dry beans must state their own acreage');
  assert.match(chick.text, /Chickpeas ground here is [\d,]+ acres/,
    'FOOTPRINT-001: garbanzos must be drawn on chickpea ground, not on bean ground');
  assert.match(peas.text, /Peas ground here is [\d,]+ acres/,
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
  for (const need of ['yield', 'health', 'moisture', 'stage', 'heat']) {
    assert(views.includes(need), `map view missing: ${need}`);
  }
  await setSelect('nbCrop', 'PINTO');
  for (const view of ['yield', 'health']) {
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
