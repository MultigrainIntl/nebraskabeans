import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE=process.env.NB_BASE_URL || 'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`)});

try{
  const response=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:45000});
  assert(response && response.ok(),`page response not OK: ${response?.status()}`);
  await page.waitForFunction(()=>document.querySelector('#runtimeStatus')?.textContent.includes('Single-controller recovery runtime loaded'),null,{timeout:45000});

  const scripts=await page.$$eval('script[src]',els=>els.map(e=>e.getAttribute('src')));
  for(const dead of ['assets/site.js','assets/bean-regions.js','assets/map-refine.js','assets/visual-evidence.js']){
    assert(!scripts.some(s=>s?.includes(dead)),`obsolete runtime script still loaded: ${dead}`);
  }
  assert(scripts.some(s=>s?.includes('assets/app.js')),'single recovery controller not loaded');

  assert.equal(await page.locator('#region option').count(),7,'all seven candidate analytical areas must be selectable');
  assert.match(await page.locator('#yieldNow').textContent(),/2,500 lb\/ac/,'current Nebraska screen must expose latest official USDA reference');
  assert.match(await page.locator('#yieldRange').textContent(),/USDA\/NASS reference/,'official forecast must not be mislabeled as GISit estimate');
  assert.match(await page.locator('#condition').textContent(),/PARTIAL EVIDENCE/,'independent crop condition must remain withheld during recovery');
  assert.match(await page.locator('#soilState').textContent(),/NOT IMPLEMENTED/,'root-zone moisture must not be faked before SMAP integration');
  assert.match(await page.locator('#mapLegend').textContent(),/No crop-condition fill is rendered/,'legend must state county/crop-fill rule');

  const polygonStyles=await page.$$eval('.leaflet-overlay-pane path',els=>els.map(e=>({fill:e.getAttribute('fill'),fillOpacity:e.getAttribute('fill-opacity')})));
  for(const p of polygonStyles){
    assert(p.fill==='none' || p.fillOpacity==='0' || p.fillOpacity==='0.0' || p.fillOpacity===null,'county/reference polygon has visible fill');
  }

  // Move well before the Aug. 12 USDA yield release and ensure future data disappears.
  await page.$eval('#timeSlider',el=>{el.value='55';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.waitForTimeout(2500);
  const historicalDate=await page.locator('#sliderDate').textContent();
  assert(historicalDate < '2026-08-12',`test slider did not reach pre-release date: ${historicalDate}`);
  assert.equal((await page.locator('#yieldNow').textContent()).trim(),'—','future USDA yield leaked backward into historical model date');
  assert.match(await page.locator('#yieldDelta').textContent(),/No future-data leakage/,'historical state does not explain withheld future forecast');

  // Return to current date and test that PLAY uses the same date/evidence path.
  await page.$eval('#timeSlider',el=>{el.value='100';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.waitForTimeout(2000);
  const before=await page.locator('#sliderDate').textContent();
  await page.click('#playBtn');
  await page.waitForTimeout(1800);
  const after=await page.locator('#sliderDate').textContent();
  await page.click('#playBtn');
  assert.notEqual(after,before,'PLAY did not advance/wrap the shared temporal state');

  // Mode controls must not manufacture data that has not been integrated.
  await page.click('#moistureBtn');
  assert.match(await page.locator('#status').textContent(),/SMAP root-zone moisture integration is pending/);
  await page.click('#satBtn');
  assert.match(await page.locator('#status').textContent(),/HLS vegetation trajectory is pending/);

  // Mobile smoke: product remains legible and map/control region remains rendered.
  await page.setViewportSize({width:390,height:844});
  assert(await page.locator('#map').isVisible(),'map hidden at mobile viewport');
  assert(await page.locator('#region').isVisible(),'region selector hidden at mobile viewport');

  const fatal=errors.filter(x=>!x.includes('Failed to load resource'));
  assert.equal(fatal.length,0,`browser runtime errors: ${fatal.join(' | ')}`);
  console.log(JSON.stringify({status:'PASS',base:BASE,historicalDate,beforePlay:before,afterPlay:after,consoleErrors:errors},null,2));
} finally {
  await browser.close();
}
