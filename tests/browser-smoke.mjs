import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';

const BASE=process.env.NB_BASE_URL || 'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`)});

if(process.env.NB_OFFLINE_FIXTURES==='1'){
  const transparent=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+WcMZAAAAAElFTkSuQmCC','base64');
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',route=>route.fulfill({path:resolve('node_modules/leaflet/dist/leaflet.css'),contentType:'text/css'}));
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',route=>route.fulfill({path:resolve('node_modules/leaflet/dist/leaflet.js'),contentType:'application/javascript'}));
  await page.route('https://*.tile.openstreetmap.org/**',route=>route.fulfill({body:transparent,contentType:'image/png'}));
  await page.route('https://tigerweb.geo.census.gov/**',route=>route.fulfill({body:JSON.stringify({type:'FeatureCollection',features:[]}),contentType:'application/json'}));
  await page.route('https://cloud.csiss.gmu.edu/**',route=>route.fulfill({body:transparent,contentType:'image/png'}));
}

try{
  const response=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:45000});
  assert(response && response.ok(),`page response not OK: ${response?.status()}`);
  await page.waitForFunction(()=>document.querySelector('#runtimeStatus')?.textContent.includes('GISit model + GDD + weather + SMAP + NDVI runtime loaded'),null,{timeout:45000});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('6 of 7 analytical-area outlooks released'),null,{timeout:45000});

  const scripts=await page.$$eval('script[src]',els=>els.map(e=>e.getAttribute('src')));
  for(const dead of ['assets/site.js','assets/bean-regions.js','assets/map-refine.js','assets/visual-evidence.js']){
    assert(!scripts.some(s=>s?.includes(dead)),`obsolete runtime script still loaded: ${dead}`);
  }
  assert(scripts.some(s=>s?.includes('assets/app.js')),'single recovery controller not loaded');

  assert.equal(await page.locator('#region option').count(),7,'all seven candidate analytical areas must be selectable');
  assert.match(await page.locator('#yieldNow').textContent(),/2,416 lb\/ac/,'current Nebraska screen must expose the GISit estimate');
  assert.match(await page.locator('#yieldRange').textContent(),/2,151–2,681 lb\/ac/,'empirical GISit error band missing');
  assert.match(await page.locator('#narrative').textContent(),/no current USDA yield forecast enters the equation/i,'USDA yield separation is not explicit');
  assert.match(await page.locator('#condition').textContent(),/MIXED · TYPICAL-RANGE POTENTIAL/,'two-family crop-health outlook missing');
  assert.match(await page.locator('#soilState').textContent(),/DRIER THAN CLIMATOLOGY/,'sampled SMAP anomaly state is not visible');
  assert.match(await page.locator('#healthState').textContent(),/RISING/,'sampled NDVI direction is not visible');
  assert.match(await page.locator('#confidence').textContent(),/BACKTEST GATE PASS/,'selected-date validation state missing');
  assert.match(await page.locator('#productionNow').textContent(),/1,850,600 cwt/,'GISit yield × date-correct acreage production scenario missing');
  assert.match(await page.locator('#mapLegend').textContent(),/GISit in-season pinto-basis yield outlook/,'default GISit map legend missing');
  assert.match(await page.locator('#mapLegend').textContent(),/not planted-acre or crop polygons/,'regional/crop-specific scope boundary missing');
  assert.match(await page.locator('#buildStatus').textContent(),/Data build nbd-v1-/,'content-derived data build identity is not visible');

  // Move before the selected-date backtest gate passes; no model value may be released.
  await page.$eval('#timeSlider',el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.waitForFunction(()=>document.querySelector('#sliderDate')?.textContent==='2026-04-15');
  const historicalDate=await page.locator('#sliderDate').textContent();
  assert.equal((await page.locator('#yieldNow').textContent()).trim(),'WITHHELD','pre-gate GISit yield was released');
  assert.match(await page.locator('#yieldDelta').textContent(),/hindcast does not beat the historical-median baseline/,'pre-gate state does not explain withholding');
  assert.match(await page.locator('#status').textContent(),/0 of 7 analytical-area outlooks released/,'map did not move to the same pre-gate model state');

  // Return to current date and test that PLAY uses the same date/evidence path.
  await page.$eval('#timeSlider',el=>{el.value='100';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.waitForFunction(()=>document.querySelector('#sliderDate')?.textContent==='2026-09-09');
  const before=await page.locator('#sliderDate').textContent();
  await page.click('#playBtn');
  await page.waitForTimeout(1800);
  const after=await page.locator('#sliderDate').textContent();
  await page.click('#playBtn');
  assert.notEqual(after,before,'PLAY did not advance/wrap the shared temporal state');
  await page.$eval('#timeSlider',el=>{el.value='100';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.waitForFunction(()=>document.querySelector('#sliderDate')?.textContent==='2026-09-09');

  // Each map control must switch the one shared temporal renderer to a real source layer.
  await page.click('#moistureBtn');
  await page.waitForFunction(()=>document.querySelector('img.temporal-raster')?.src.includes('SMAP-9KM-DAILY-SUB_2026'),null,{timeout:45000});
  assert.match(await page.locator('#mapLegend').textContent(),/Root-zone soil moisture/);
  await page.click('#satBtn');
  await page.waitForFunction(()=>document.querySelector('img.temporal-raster')?.src.includes('NDVI-DAILY_2026'),null,{timeout:45000});
  assert.match(await page.locator('#mapLegend').textContent(),/Normalized Difference Vegetation Index/);
  await page.click('#yieldBtn');
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('6 of 7 analytical-area outlooks released'),null,{timeout:45000});
  assert.match(await page.locator('#status').textContent(),/6 of 7 analytical-area outlooks released/,'regional GISit coverage must expose withheld Kansas');
  assert.match(await page.locator('#mapLegend').textContent(),/generalized analytical neighborhoods/i);

  // Mobile smoke: product remains legible and map/control region remains rendered.
  await page.setViewportSize({width:390,height:844});
  assert(await page.locator('#map').isVisible(),'map hidden at mobile viewport');
  assert(await page.locator('#region').isVisible(),'region selector hidden at mobile viewport');

  const secondary=await browser.newPage({viewport:{width:390,height:844}});
  const secondaryResponse=await secondary.goto(new URL('commercial.html',BASE).href,{waitUntil:'domcontentloaded',timeout:45000});
  assert(secondaryResponse&&secondaryResponse.ok(),'commercial page response not OK');
  assert.equal((await secondary.locator('#cvresult').textContent()).trim(),'$31.75/cwt','shared shell converter did not initialize');
  await secondary.click('.menu');
  assert.equal(await secondary.locator('#nav').getAttribute('class'),'open','mobile menu did not open');
  await secondary.close();

  const fatal=errors.filter(x=>!x.includes('Failed to load resource'));
  assert.equal(fatal.length,0,`browser runtime errors: ${fatal.join(' | ')}`);
  console.log(JSON.stringify({status:'PASS',base:BASE,historicalDate,beforePlay:before,afterPlay:after,consoleErrors:errors},null,2));
} finally {
  await browser.close();
}
