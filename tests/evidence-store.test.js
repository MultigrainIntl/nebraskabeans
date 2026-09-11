'use strict';
const assert=require('node:assert/strict');
const {EvidenceStore,validate,confidence}=require('../assets/model/evidence-store.js');
const row=(id,issue,value,source='nass',classification='VERIFIED')=>({id,variable:'yield_lb_ac',geography_id:'NE',valid_time:'2026-08-01T00:00:00Z',issue_time:`${issue}T12:00:00Z`,classification,source_id:source,value,units:'lb/ac',method:'published forecast'});
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,e);process.exitCode=1}}

test('unknown evidence cannot carry claimed value',()=>assert.equal(validate({...row('x','2026-08-01',1),classification:'UNKNOWN'}).ok,false));
test('immutable issue-time history prevents future leakage',()=>{const s=new EvidenceStore([row('a','2026-08-12',2500)]);assert.equal(s.latest('2026-08-11T23:59:59Z',{variable:'yield_lb_ac',geography_id:'NE'}),null);assert.equal(s.latest('2026-08-13T00:00:00Z',{variable:'yield_lb_ac',geography_id:'NE'}).value,2500)});
test('revisions are preserved rather than overwritten',()=>{const s=new EvidenceStore([row('a','2026-08-12',2500),row('b','2026-09-01',2475)]);assert.equal(s.history({variable:'yield_lb_ac',geography_id:'NE'}).length,2);assert.equal(s.latest('2026-09-02',{variable:'yield_lb_ac',geography_id:'NE'}).value,2475)});
test('cross-source disagreement is surfaced',()=>{const s=new EvidenceStore([row('a','2026-08-12',2500,'nass'),row('b','2026-08-12',2300,'gisit','ESTIMATED')]);const d=s.disagreements('2026-09-01',{variable:'yield_lb_ac',geography_id:'NE',tolerance:100});assert.equal(d.length,1);assert.equal(d[0].delta,200)});
test('confidence is decomposed and weaknesses exposed',()=>{const c=confidence([{name:'geography',score:.9,weight:2},{name:'irrigation',score:.3,weight:1},{name:'satellite',score:.8,weight:1}]);assert.equal(c.label,'MODERATE');assert.deepEqual(c.weaknesses,['irrigation'])});
if(!process.exitCode)console.log('ALL EVIDENCE STORE TESTS PASSED');
