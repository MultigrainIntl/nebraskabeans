'use strict';
const assert=require('node:assert/strict');
const T=require('../assets/model/temporal-evidence.js');

function test(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,e);process.exitCode=1}}

test('official forecast does not leak backward before issue date',()=>{
  const h={Nebraska:[
    {issue_date:'2026-03-31',metric:'planted_acres',value:101000},
    {issue_date:'2026-06-30',metric:'planted_acres',value:95000},
    {issue_date:'2026-08-12',valid_date:'2026-08-01',metric:'yield_lb_ac',value:2500}
  ]};
  assert.equal(T.officialSnapshot(h,'Nebraska','2026-08-11').yield,null);
  assert.equal(T.officialSnapshot(h,'Nebraska','2026-08-12').yield.value,2500);
});

test('latest issued acreage replaces stale earlier estimate only after release',()=>{
  const h={Nebraska:[
    {issue_date:'2026-03-31',metric:'planted_acres',value:101000},
    {issue_date:'2026-06-30',metric:'planted_acres',value:95000},
    {issue_date:'2026-08-12',metric:'planted_acres',value:80000}
  ]};
  assert.equal(T.officialSnapshot(h,'Nebraska','2026-06-29').planted.value,101000);
  assert.equal(T.officialSnapshot(h,'Nebraska','2026-07-01').planted.value,95000);
  assert.equal(T.officialSnapshot(h,'Nebraska','2026-09-11').planted.value,80000);
});

test('50 percent planting date is interpolated rather than hard coded',()=>{
  const r=[{date:'2026-05-31',percent:41},{date:'2026-06-07',percent:72}];
  const x=T.crossingDate(r,50);
  assert.equal(x.classification,'ESTIMATED');
  assert.equal(x.date,'2026-06-02');
});

test('planting date remains unknown when crossing is not bracketed',()=>{
  const r=[{date:'2026-05-10',percent:1},{date:'2026-05-24',percent:5}];
  assert.equal(T.crossingDate(r,50).date,null);
});

test('invalid decreasing progress is rejected',()=>{
  const r=[{date:'2026-05-24',percent:12},{date:'2026-05-31',percent:9}];
  assert.equal(T.validateProgress(r).ok,false);
});

test('base-50 simple GDD is deterministic and missing days are exposed',()=>{
  const rows=[
    {date:'2026-06-01',tmax_f:80,tmin_f:50},
    {date:'2026-06-02',tmax_f:70,tmin_f:40},
    {date:'2026-06-03',tmax_f:null,tmin_f:40}
  ];
  const x=T.accumulatedGddF(rows,'2026-06-01','2026-06-03',50);
  assert.equal(x.gdd_f,20);
  assert.equal(x.days_used,2);
  assert.equal(x.missing_days,1);
});

if(!process.exitCode)console.log('ALL TEMPORAL EVIDENCE TESTS PASSED');
