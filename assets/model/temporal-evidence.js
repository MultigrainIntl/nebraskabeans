(function(global){
  'use strict';
  const DAY=86400000;
  const iso=d=>(d instanceof Date?d:new Date(`${d}T12:00:00Z`)).toISOString().slice(0,10);
  const asDate=d=>d instanceof Date?d:new Date(`${d}T12:00:00Z`);
  const lerp=(a,b,t)=>a+(b-a)*t;

  function latestKnown(rows, metric, selectedDate){
    const cutoff=iso(selectedDate);
    return (rows||[])
      .filter(x=>x.metric===metric && x.issue_date<=cutoff)
      .sort((a,b)=>a.issue_date.localeCompare(b.issue_date))
      .at(-1)||null;
  }

  function officialSnapshot(history, geography, selectedDate){
    const rows=history?.[geography]||[];
    return {
      planted:latestKnown(rows,'planted_acres',selectedDate),
      harvested:latestKnown(rows,'harvested_acres',selectedDate),
      yield:latestKnown(rows,'yield_lb_ac',selectedDate),
      production:latestKnown(rows,'production_cwt',selectedDate)
    };
  }

  function validateProgress(records){
    const clean=(records||[]).filter(r=>Number.isFinite(r.percent) && r.percent>=0 && r.percent<=100 && /^\d{4}-\d{2}-\d{2}$/.test(r.date)).sort((a,b)=>a.date.localeCompare(b.date));
    let prev=-Infinity;
    for(const r of clean){
      if(r.percent<prev) return {ok:false,records:clean,reason:'planting progress decreases across observations'};
      prev=r.percent;
    }
    return {ok:true,records:clean,reason:null};
  }

  function crossingDate(records,target=50){
    const v=validateProgress(records);
    if(!v.ok||!v.records.length)return {date:null,classification:'UNKNOWN',reason:v.reason||'no progress observations'};
    const exact=v.records.find(r=>r.percent===target);
    if(exact)return {date:exact.date,classification:'ESTIMATED',method:'official progress exact target date',bracket:[exact,exact]};
    for(let i=1;i<v.records.length;i++){
      const a=v.records[i-1],b=v.records[i];
      if(a.percent<target&&b.percent>target){
        const t=(target-a.percent)/(b.percent-a.percent),da=asDate(a.date),db=asDate(b.date),date=new Date(da.getTime()+(db-da)*t);
        return {date:iso(date),classification:'ESTIMATED',method:'linear interpolation between official progress observations',bracket:[a,b],fraction:t};
      }
    }
    return {date:null,classification:'UNKNOWN',reason:`${target}% crossing not bracketed by available observations`};
  }

  function plantingWindow(records,low=10,high=90){
    const a=crossingDate(records,low),b=crossingDate(records,high);
    return {start:a.date,end:b.date,classification:a.date&&b.date?'ESTIMATED':'UNKNOWN',method:'progress-percentile planting window',low,high};
  }

  function dailyGddF(tmaxF,tminF,baseF=50){
    if(!Number.isFinite(tmaxF)||!Number.isFinite(tminF))return null;
    return Math.max(0,((tmaxF+tminF)/2)-baseF);
  }

  function accumulatedGddF(rows,startDate,endDate,baseF=50){
    const start=iso(startDate),end=iso(endDate);let total=0,n=0,missing=0;
    for(const r of (rows||[])){
      if(r.date<start||r.date>end)continue;
      const v=dailyGddF(r.tmax_f,r.tmin_f,baseF);
      if(v===null){missing++;continue} total+=v;n++;
    }
    return {gdd_f:Math.round(total*10)/10,days_used:n,missing_days:missing,base_f:baseF,classification:'ESTIMATED'};
  }

  function stageFromGdd(gdd,thresholds){
    if(!Number.isFinite(gdd)||!Array.isArray(thresholds)||!thresholds.length)return {stage:null,classification:'UNKNOWN'};
    const ordered=thresholds.slice().sort((a,b)=>a.gdd_f-b.gdd_f);
    let current=ordered[0];
    for(const t of ordered){if(gdd>=t.gdd_f)current=t;else break}
    return {stage:current.stage,classification:'ESTIMATED',threshold_gdd_f:current.gdd_f,source:current.source||null};
  }

  function daysBetween(a,b){return Math.round((asDate(b)-asDate(a))/DAY)}

  const api={iso,latestKnown,officialSnapshot,validateProgress,crossingDate,plantingWindow,dailyGddF,accumulatedGddF,stageFromGdd,daysBetween};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  global.NBTemporalEvidence=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis);
