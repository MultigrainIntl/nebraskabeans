'use strict';
(function(global){
  const ENDPOINT='https://cloud.csiss.gmu.edu/smap_service';
  const ymd=d=>{
    const x=d instanceof Date?d:new Date(d+'T12:00:00Z');
    return `${x.getUTCFullYear()}.${String(x.getUTCMonth()+1).padStart(2,'0')}.${String(x.getUTCDate()).padStart(2,'0')}`;
  };
  function product(date,type='sub',kind='daily'){
    const D=ymd(date), depth=type==='top'?'TOP':'SUB';
    if(kind==='anomaly')return `SMAP-9KM-ANOMALY-DAILY-${depth}_${D}`;
    return `SMAP-9KM-DAILY-${depth}_${D}_AVERAGE`;
  }
  function execute(identifier,inputs){
    const u=new URL(ENDPOINT);
    u.searchParams.set('service','WPS');u.searchParams.set('version','1.0.0');u.searchParams.set('request','Execute');u.searchParams.set('identifier',identifier);
    u.searchParams.set('DataInputs',Object.entries(inputs).map(([k,v])=>`${k}=${typeof v==='string'?v:JSON.stringify(v)}`).join(';'));
    return u.toString();
  }
  function literalOutputs(xml){
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    if(doc.querySelector('parsererror'))throw new Error('Crop-CASMA returned malformed XML');
    const exception=[...doc.querySelectorAll('ExceptionText')].map(n=>n.textContent.trim()).filter(Boolean).join('; ');
    if(exception)throw new Error(exception);
    const out={};
    [...doc.querySelectorAll('Output')].forEach(node=>{
      const id=node.querySelector('Identifier')?.textContent?.trim();
      const literal=node.querySelector('LiteralData')?.textContent?.trim();
      const ref=node.querySelector('Reference')?.getAttribute('href')||node.querySelector('Reference')?.getAttribute('xlink:href');
      if(id)out[id]=literal||ref||null;
    });
    return out;
  }
  async function request(identifier,inputs,signal){
    const url=execute(identifier,inputs),r=await fetch(url,{signal,headers:{Accept:'application/xml,text/xml;q=0.9,*/*;q=0.8'}});
    if(!r.ok)throw new Error(`Crop-CASMA ${r.status}`);
    return {url,outputs:literalOutputs(await r.text())};
  }
  async function statsByAoi(aoi,date,{anomaly=false,mask='none',signal}={}){
    const layer=product(date,'sub',anomaly?'anomaly':'daily');
    const range=anomaly?{minValue:-1,maxValue:1,step:0.05}:{minValue:0,maxValue:1,step:0.05};
    const r=await request('GetStatByAoi',{layer,...range,aoi,mask},signal);
    return {...r,source_id:'usda-crop-casma',underlying_source:'NASA SMAP',layer,valid_date:ymd(date).replaceAll('.','-'),classification:'MODELED'};
  }
  global.NBCropCASMA=Object.freeze({endpoint:ENDPOINT,product,execute,statsByAoi});
})(window);
