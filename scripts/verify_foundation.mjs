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
// Indexing posture, per PRODUCT-AUTHORITY-DECISIONS.md D-004 (GAJ, 16 September 2026).
// Two finished pages are public to search; every draft stays hidden. The drafts are the point
// of this check: methodology.html still describes the withdrawn yield model and contradicts the
// live site, and commercial.html says on its face that its own form is not configured. Either
// one surfacing in a search result costs more than being findable gains.
const PUBLIC=['index.html','about.html'];
const DRAFT=pages.filter(p=>!PUBLIC.includes(p));
for(const path of PUBLIC)assert.doesNotMatch(read(path),/content="noindex/,`${path} must be indexable — D-004 approved it`);
for(const path of DRAFT)assert.match(read(path),/<meta name="robots" content="noindex,nofollow,noarchive">/,`${path} is a draft and must stay out of search`);
// A draft must also never be advertised in the sitemap, which is read even when noindex is honoured.
// Read the <loc> entries, not the raw file: a first pass matched the explanatory comment
// inside the sitemap and failed on a page the sitemap does not actually list.
const locs=[...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
assert(locs.length,'sitemap.xml lists no URLs');
for(const path of DRAFT)assert(!locs.some(u=>u.endsWith('/'+path)),`sitemap.xml advertises the draft ${path}`);
assert(locs.some(u=>/nebraskabeans\.com\/$/.test(u)),'sitemap.xml omits the homepage');
assert(locs.some(u=>u.endsWith('/about.html')),'sitemap.xml omits about.html');
for(const u of locs)assert(u.startsWith('https://nebraskabeans.com/'),`sitemap.xml points off-domain: ${u}`);
for(const path of pages.slice(1)){assert.match(read(path),/assets\/shell\.js/,`${path} lacks shared shell`);assert.doesNotMatch(read(path),/assets\/site\.js/,`${path} loads deleted site.js`)}
const index=read('index.html');assert.match(index,/assets\/app\.js/);assert.doesNotMatch(index,/assets\/(site|bean-regions|map-refine|visual-evidence)\.js/);
// Crawling must stay OPEN. Blocking a page here stops the crawler fetching it, so its noindex
// is never read and a bare URL can still be listed — the opposite of what blocking looks like.
assert.doesNotMatch(read('robots.txt'),/^\s*Disallow:\s*\/\s*$/m,'robots.txt blocks the site; noindex cannot be read by a crawler that is turned away');
assert.match(read('robots.txt'),/Sitemap:\s*https:\/\/nebraskabeans\.com\/sitemap\.xml/,'robots.txt must point at the sitemap');

const app=read('assets/app.js');
for(const forbidden of ['classifyWater','heatDays','frostDays',"new Date('2026-09-11"])assert(!app.includes(forbidden),`unsupported/fixed runtime construct remains: ${forbidden}`);
assert.match(app,/L\.imageOverlay\(url,view.bounds/);
/* The legacy map this line used to guard is retired; decision-map.js owns the map now, and
   this contract had been red since the string was removed — a failing gate nobody read.
   These assert the claims the live map must keep making, and the ones it must never make. */
const decisionMap=read('assets/decision-map.js');
assert.doesNotMatch(decisionMap,/label: 'Yield/,'no yield layer may return until its per-state skill, its interval coverage and its regional resolution are established');
assert.doesNotMatch(decisionMap,/label: 'Soil moisture'/,'rainfall minus reference evaporation must not be labelled soil moisture');
assert.match(decisionMap,/no irrigation/,'the water view must state what it leaves out');
// The wording moved into assets/i18n.js when the page was rewritten for plain language and
// translation. The requirement is unchanged: the outline must never read as field boundaries.
const textFile=read('assets/i18n.js');
assert.match(textFile,/whole counties, not fields/,'the crop outline must not be presented as field boundaries');
assert.match(decisionMap,/not an observed crop condition/,'season flags must not be presented as observed crop health');
assert.match(decisionMap,/observed, not forecast/,'the present-tense view must declare itself an observation');
const vsHistory=JSON.parse(read('assets/data/crop-vs-history.json'));
assert.equal(vsHistory.source.api_key_required,false,'the real-time source must stay keyless');
assert(vsHistory.latest_observation,'the present-tense view must carry a latest observation date');
assert(Object.keys(vsHistory.regions).length>=7,'every growing region needs its own history');
const est=JSON.parse(read('assets/data/estimate-2026.json'));
assert(est.what_is_not_proven.length>0,'the estimate must carry its own unproven claims');
assert(est.what_would_sharpen_it.length>=3,'a limitation without a path to close it is an excuse');
assert(est.what_would_sharpen_it.some(x=>/harvest data|ground/i.test(x.need)),'ground truth from growers must be named as the largest gap');
assert.match(est.principle,/observations, then the number/i,'the estimate must lead with evidence');
assert.match(app,/USDA current yield is not a predictor/);
assert.match(app,/BACKTEST GATE PASS/);
assert.match(app,/Production requires validated crop-area weights/);
assert.doesNotMatch(app,/const stateYield=rows.reduce/,'unweighted regional averages must not generate state production');

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
