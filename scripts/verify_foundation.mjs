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
assert.match(app,/No stress class, crop condition, or yield impact is inferred/);

const require=createRequire(import.meta.url),store=require('../assets/model/evidence-store.js');
assert.deepEqual([...store.CLASSES].sort(),['ASSUMED','DERIVED','ESTIMATED','MODELED','OBSERVED','UNKNOWN']);
const sourceRegistry=read('assets/source-registry.js');assert.doesNotMatch(sourceRegistry,/classification:'VERIFIED'/);

const baseline=JSON.parse(read('assets/data/official-baseline.json'));
assert.equal(baseline.evidence_class,'OBSERVED');
assert.equal(baseline.sources.acreage_2026.url,'https://www.nass.usda.gov/Publications/Todays_Reports/reports/acrg0626.pdf');
assert.equal(baseline.sources.crop_august_2026.url,'https://www.nass.usda.gov/Publications/Todays_Reports/reports/crop0826.pdf');
assert(baseline.forecast_history.Colorado.some(x=>x.issue_date==='2026-06-30'&&x.metric==='planted_acres'&&x.value===33000),'Colorado June acreage revision missing');
assert.equal(baseline.states.Wyoming['2026'].value,null);assert.equal(baseline.states.Kansas['2026'].value,null);

const manifest=verifyManifest();assert(manifest.ok,'content-derived build manifest is stale');
console.log(`PASS foundation contract and ${manifest.actual.data_build_id}`);
