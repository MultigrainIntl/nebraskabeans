import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const BASE=process.env.NB_BASE_URL || 'http://127.0.0.1:4173/';
const OUT=process.env.NB_VISUAL_OUT || 'artifacts/visual-proof';
await mkdir(OUT,{recursive:true});
const satellite=JSON.parse(await readFile('assets/data/satellite-signals-2026.json','utf8'));
const analysisStart=new Date(`${satellite.analysis_start}T12:00:00Z`);
const checkpointRows=Object.values(satellite.areas?.['ne-panhandle']?.dates||{});
const governedNdviDates=[...new Set(checkpointRows.map(r=>r.ndvi_valid_date).filter(Boolean))].sort();
assert(governedNdviDates.length>=2,'governed NDVI evidence must expose at least two source-valid checkpoints');
const ndviTargetDate=governedNdviDates[Math.floor(governedNdviDates.length*0.65)];
const ndviTargetIndex=Math.round((new Date(`${ndviTargetDate}T12:00:00Z`)-analysisStart)/86400000);

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});

const box=async sel=>page.locator(sel).boundingBox();
const visible=async sel=>await page.locator(sel).isVisible();

try{
 const r=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:45000});
 assert(r?.ok(),`page response not OK: ${r?.status()}`);
 await page.waitForFunction(()=>document.querySelector('#runtimeStatus')?.textContent.includes('Experimental model and evidence loaded'),null,{timeout:45000});
 const map=await box('#map'); const slider=await box('.timebar');
 assert(map&&slider,'map or temporal slider missing');
 assert(slider.y>=map.y+map.height-2,'temporal slider is not below map');
 assert(slider.y-(map.y+map.height)<80,'temporal slider is not directly below map');
 assert(await visible('#mapLegend'),'map legend is not visible');
 assert((await page.locator('#mapLegend').textContent()).trim().length>20,'map legend is empty');

 await page.waitForSelector('#nbSeasonSnapshot',{state:'visible',timeout:10000});
 for(const id of ['#nbSnapStage','#nbSnapCondition','#nbSnapWater','#nbSnapVeg','#nbSnapRisk']){
   assert((await page.locator(id).textContent()).trim().length>0,`${id} is empty`);
 }

 await page.waitForSelector('.nbTimeline',{state:'visible',timeout:10000});
 assert((await page.locator('.nbTimeline').count())>=2,'broad crop calendar and GDD timeline are not both rendered');
 const timeline=await box('.nbTimelines');
 assert(timeline&&timeline.y>=slider.y,'crop timeline is not below slider');

 let blankLegend=false;
 await page.exposeFunction('__legendBlank',()=>{blankLegend=true});
 await page.evaluate(()=>{
   const el=document.querySelector('#mapLegend');
   new MutationObserver(()=>{if(!el || getComputedStyle(el).visibility==='hidden' || getComputedStyle(el).display==='none' || !el.textContent.trim()) window.__legendBlank();}).observe(el,{childList:true,subtree:true,characterData:true,attributes:true});
 });
 for(const v of ['10','30','60','90','120','147']){
   await page.$eval('#timeSlider',(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},v);
   await page.waitForTimeout(120);
 }
 assert(!blankLegend,'legend became blank/hidden during temporal scrubbing');

 await page.click('#moistureBtn');
 await page.waitForSelector('img.temporal-raster',{state:'visible',timeout:45000});
 const srcA=await page.locator('img.temporal-raster').last().getAttribute('src');
 await page.$eval('#timeSlider',el=>{el.value='40';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
 await page.waitForFunction(old=>[...document.querySelectorAll('img.temporal-raster')].some(i=>i.src!==old),srcA,{timeout:45000});
 const srcB=await page.locator('img.temporal-raster').last().getAttribute('src');
 assert.notEqual(srcA,srcB,'soil-moisture temporal source did not change with date');
 const transition=await page.locator('img.temporal-raster').last().evaluate(el=>getComputedStyle(el).transitionDuration);
 assert.notEqual(transition,'0s','temporal raster has no CSS transition');

 // NDVI proof uses a date already present in the governed satellite evidence store.
 // This proves temporal rendering against a source-valid checkpoint rather than an arbitrary calendar day.
 await page.click('#satBtn');
 await page.waitForFunction(()=>document.querySelector('img.temporal-raster')?.src.includes('NDVI-DAILY_2026'),null,{timeout:45000});
 const ndviA=await page.locator('img.temporal-raster').last().getAttribute('src');
 await page.$eval('#timeSlider',(el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},ndviTargetIndex);
 await page.waitForFunction(old=>[...document.querySelectorAll('img.temporal-raster')].some(i=>i.src!==old),ndviA,{timeout:45000});
 const ndviB=await page.locator('img.temporal-raster').last().getAttribute('src');
 assert.notEqual(ndviA,ndviB,'NDVI temporal source did not change at a governed source-valid checkpoint');
 assert(ndviB.includes(ndviTargetDate.replaceAll('-','.')),`NDVI displayed source is not the governed target date ${ndviTargetDate}`);

 await page.waitForSelector('#nbDecisionPanel',{state:'visible',timeout:10000});
 const decisionText=await page.locator('#nbDecisionPanel').textContent();
 for(const heading of ['WHAT CHANGED','AGRONOMIC IMPACT','MARKET MEANING','WATCH NEXT']) assert(decisionText.includes(heading),`decision panel missing ${heading}`);
 assert((await page.locator('#nbChanged').textContent()).trim().length>10,'what changed is not explained');
 assert((await page.locator('#nbWhy').textContent()).trim().length>10,'agronomic impact is not explained');
 assert((await page.locator('#nbCommercial').textContent()).trim().length>10,'market meaning is not explained');
 assert((await page.locator('#nbMonitor').textContent()).trim().length>10,'watch next is not explained');

 await page.screenshot({path:`${OUT}/desktop-current.png`,fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await visible('#map'),'map hidden on mobile');
 assert(await visible('.timebar'),'slider hidden on mobile');
 assert(await visible('#nbSeasonSnapshot'),'season snapshot hidden on mobile');
 await page.screenshot({path:`${OUT}/mobile.png`,fullPage:true});

 const fatal=errors.filter(x=>!x.includes('Failed to load resource'));
 assert.equal(fatal.length,0,`browser errors: ${fatal.join(' | ')}`);
 console.log(JSON.stringify({status:'PASS',base:BASE,sliderGapPx:slider.y-(map.y+map.height),moistureSourcesDiffer:srcA!==srcB,ndviSourcesDiffer:ndviA!==ndviB,ndviGovernedCheckpoint:ndviTargetDate,legendPersistent:!blankLegend,instantDecisionHierarchy:true,screenshots:['desktop-current.png','mobile.png']},null,2));
} finally { await browser.close(); }
