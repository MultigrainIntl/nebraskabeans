(function(global){
  'use strict';
  const CLASSES=new Set(['VERIFIED','MODELED','ESTIMATED','ASSUMED','UNKNOWN']);
  const REQUIRED=['id','variable','geography_id','valid_time','issue_time','classification','source_id'];
  const iso=x=>new Date(x).toISOString();

  function validate(record){
    const errors=[];
    for(const k of REQUIRED)if(record?.[k]===undefined||record?.[k]===null||record?.[k]==='')errors.push(`missing ${k}`);
    if(record?.classification&&!CLASSES.has(record.classification))errors.push(`invalid classification ${record.classification}`);
    for(const k of ['valid_time','issue_time'])if(record?.[k]){try{iso(record[k])}catch{errors.push(`invalid ${k}`)}}
    if(record?.classification==='UNKNOWN'&&record?.value!==null&&record?.value!==undefined)errors.push('UNKNOWN evidence must not carry a numeric/claimed value');
    return {ok:errors.length===0,errors};
  }

  class EvidenceStore{
    constructor(records=[]){this.records=[];this.ids=new Set();for(const r of records)this.add(r)}
    add(record){
      const v=validate(record);if(!v.ok)throw new Error(v.errors.join('; '));
      if(this.ids.has(record.id))throw new Error(`duplicate evidence id ${record.id}`);
      const normalized={...record,valid_time:iso(record.valid_time),issue_time:iso(record.issue_time)};
      this.records.push(Object.freeze(normalized));this.ids.add(record.id);return normalized;
    }
    asOf(selectedTime,{variable,geography_id}={}){
      const cutoff=iso(selectedTime);
      return this.records.filter(r=>r.issue_time<=cutoff&&(!variable||r.variable===variable)&&(!geography_id||r.geography_id===geography_id));
    }
    latest(selectedTime,query={}){
      return this.asOf(selectedTime,query).sort((a,b)=>a.issue_time.localeCompare(b.issue_time)).at(-1)||null;
    }
    history(query={}){
      return this.records.filter(r=>(!query.variable||r.variable===query.variable)&&(!query.geography_id||r.geography_id===query.geography_id)).sort((a,b)=>a.issue_time.localeCompare(b.issue_time));
    }
    trace(id){const r=this.records.find(x=>x.id===id);if(!r)return null;return {conclusion_driver:r.variable,datum:r.value,units:r.units||null,geography_id:r.geography_id,valid_time:r.valid_time,issue_time:r.issue_time,source_id:r.source_id,method:r.method||null,classification:r.classification,limitations:r.limitations||[]};}
    disagreements(selectedTime,{variable,geography_id,tolerance=0}={}){
      const rows=this.asOf(selectedTime,{variable,geography_id}).filter(r=>Number.isFinite(r.value));
      if(rows.length<2)return [];
      const out=[];
      for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
        const a=rows[i],b=rows[j];if(a.source_id===b.source_id)continue;
        const delta=Math.abs(a.value-b.value);if(delta>tolerance)out.push({a:a.id,b:b.id,delta,units:a.units===b.units?a.units:null});
      }
      return out;
    }
  }

  function confidence(components){
    const rows=(components||[]).filter(x=>Number.isFinite(x.score)&&x.score>=0&&x.score<=1&&Number.isFinite(x.weight)&&x.weight>0);
    if(!rows.length)return {score:null,label:'LOW',classification:'UNKNOWN',weaknesses:['no confidence components']};
    const weight=rows.reduce((a,b)=>a+b.weight,0),score=rows.reduce((a,b)=>a+b.score*b.weight,0)/weight;
    const label=score>=.75?'HIGH':score>=.5?'MODERATE':'LOW';
    const weaknesses=rows.filter(x=>x.score<.6).sort((a,b)=>a.score-b.score).map(x=>x.name);
    return {score:Math.round(score*100)/100,label,classification:'ESTIMATED',components:rows,weaknesses};
  }

  const api={CLASSES,validate,EvidenceStore,confidence};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  global.NBEvidence=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis);
