import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {verifyManifest} from './build_manifest.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),read=path=>readFileSync(resolve(root,path),'utf8');
const required=['MASTER-EXECUTION-CONTRACT.md','NEBRASKABEANS-SCIENTIFIC-SPEC.md','WORK-ORDER.md','FACTS-OF-RECORD.md','PRODUCT-AUTHORITY-DECISIONS.md','docs/BLOCKER-REGISTER.md','docs/VERIFICATION-LEDGER.md'];
for(const path of required)assert(existsSync(resolve(root,path)),`missing governed artifact ${path}`);

const pages=['index.html','bean.html','commercial.html','methodology.html','privacy.html','reports.html','resources.html'];
for(const path of pages)assert.match(read(path),/<meta name="robots" content="noindex,nofollow,noarchive">/,`${path} is indexable`);
for(const path of pages.slice(1)){assert.match(read(path),/assets\/shell\.js/,`${path} lacks shared shell`);assert.doesNotMatch(read(path),/assets\/site\.js/,`${path} loads deleted site.js`)}
const index=read('index.html');assert.match(index,/assets\/app\.js/);assert.doesNotMatch(index,/assets\/(site|bean-regions|map-refine|visual-evidence)\.js/);
assert.match(read('robots.txt'),/Disallow: \/\s/);

const app=read('assets/app.js');
for(const forbidden of ['classifyWater','heatDays','frostDays',"new Date('2026-09-11"])assert(!app.includes(forbidden),`unsupported/fixed runtime construct remains: ${forbidden}`);
assert.match(app,/L\.imageOverlay\(wmsUrl\(layer,date\)/);
assert.match(app,/GISit in-season pinto-basis yield outlook/);
assert.match(app,/USDA current yield is not a predictor/);
assert.match(app,/BACKTEST GATE PASS/);
assert.match(app,/planted-acre gross-potential scenario/);

const require=createRequire(import.meta.url),store=require('../assets/model/evidence-store.js');
assert.deepEqual([...store.CLASSES].sort(),['ASSUMED','DERIVED','ESTIMATED','MODELED','OBSERVED','UNKNOWN']);
const sourceRegistry=read('assets/source-registry.js');assert.doesNotMatch(sourceRegistry,/classification:'VERIFIED'/);

const baseline=JSON.parse(read('assets/data/official-baseline.json'));
assert.equal(baseline.evidence_class,'OBSERVED');
assert.equal(baseline.sources.acreage_2026.url,'https://www.nass.usda.gov/Publications/Todays_Reports/reports/acrg0626.pdf');
assert.equal(baseline.sources.crop_august_2026.url,'https://www.nass.usda.gov/Publications/Todays_Reports/reports/crop0826.pdf');
assert(baseline.forecast_history.Colorado.some(x=>x.issue_date==='2026-06-30'&&x.metric==='planted_acres'&&x.value===33000),'Colorado June acreage revision missing');
assert.equal(baseline.states.Wyoming['2026'].value,null);assert.equal(baseline.states.Kansas['2026'].value,null);

const catalog=JSON.parse(read('assets/data/temporal-layer-catalog.json'));
assert.equal(catalog.classification,'MODELED');assert.equal(catalog.analysis_end,'2026-09-09');
assert.deepEqual(Object.keys(catalog.layers).sort(),['anomaly','moisture','ndvi']);
assert.match(catalog.wms_endpoint,/cloud\.csiss\.gmu\.edu/);

const outlook=JSON.parse(read('assets/data/gisit-outlook-2026.json'));
assert.equal(outlook.model.id,'gisit-drybean-weather-ridge-v1');
assert.equal(outlook.model.current_usda_yield_used_as_predictor,false);
assert.equal(outlook.model.training_state_years,92);
assert(outlook.validation.terminal_checkpoint.mae_lb_ac<outlook.validation.terminal_checkpoint.historical_median_baseline_mae_lb_ac,'GISit terminal hindcast does not beat baseline');
assert.equal(outlook.regions['ne-panhandle'].dates['2026-04-15'].yield_lb_ac,null,'pre-gate yield must be withheld');
assert.equal(outlook.regions['ne-panhandle'].dates['2026-09-09'].yield_lb_ac,2416);
assert.equal(outlook.regions['nw-kansas'].dates['2026-09-09'].yield_lb_ac,null,'stale Kansas target must not produce a released yield');

const satellite=JSON.parse(read('assets/data/satellite-signals-2026.json'));
assert.equal(satellite.classification,'MODELED');
assert.equal(satellite.areas['ne-panhandle'].dates['2026-09-09'].smap_anomaly_valid_date,'2026-09-09');
assert(Number.isFinite(satellite.areas['ne-panhandle'].dates['2026-09-09'].ndvi_change_encoded),'NDVI direction missing');

const manifest=verifyManifest();assert(manifest.ok,'content-derived build manifest is stale');
console.log(`PASS foundation contract and ${manifest.actual.data_build_id}`);
