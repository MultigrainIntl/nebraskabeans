'use strict';
(()=>{
  const DAY=86400000,$=id=>document.getElementById(id),iso=d=>d.toISOString().slice(0,10),parseDay=s=>new Date(`${s}T12:00:00Z`);
  let model=null,satellite=null,start=null,end=null;
  const stageOrder=['Pre-planting','Establishment','Vegetative','Flowering / pod development','Pod fill','Maturity / seed maturation','Harvest readiness'];
  const broadStage=s=>s==='Pre-planting'||s==='Establishment'?'PLANTING / ESTABLISHMENT':s==='Maturity / seed maturation'?'MATURITY':s==='Harvest readiness'?'HARVEST':'GROWING';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Preserve the outgoing temporal image long enough to cross-fade instead of flashing blank.
  if(window.L?.Map?.prototype){
    const originalRemove=window.L.Map.prototype.removeLayer;
    window.L.Map.prototype.removeLayer=function(layer){
      const el=layer?.getElement?.();
      if(el?.classList?.contains('temporal-raster')&&el.isConnected&&!el.dataset.nbFadeOut){
        el.dataset.nbFadeOut='1';el.style.opacity='0';
        setTimeout(()=>{try{originalRemove.call(this,layer)}catch(_){}},560);
        return this;
      }
      return originalRemove.call(this,layer);
    };
  }

  function installLegendHandoff(){
    const legend=$('mapLegend'),wrap=legend?.closest('.mapwrap');if(!legend||!wrap)return;
    let last=legend.innerHTML,guard=false;
    new MutationObserver(()=>{
      if(guard)return;const img=legend.querySelector('img.legendScale');
      if(img&&!img.complete&&last){
        const ghost=document.createElement('div');ghost.className='legend legendGhost';ghost.innerHTML=last;wrap.appendChild(ghost);
        const done=()=>{ghost.classList.add('out');setTimeout(()=>ghost.remove(),580);};img.addEventListener('load',done,{once:true});img.addEventListener('error',done,{once:true});
      }
      last=legend.innerHTML;
    }).observe(legend,{childList:true,subtree:true});
  }

  function prefetchAdjacent(src){
    const m=src.match(/(20\d\d)[.-](\d\d)[.-](\d\d)/);if(!m)return;
    const current=new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
    for(const n of [-2,-1,1,2]){const d=new Date(current.getTime()+n*DAY),dot=iso(d).replaceAll('-','.');if((start&&d<start)||(end&&d>end))continue;const next=src.replace(m[0],dot);const im=new Image();im.decoding='async';im.src=next;}
  }
  document.addEventListener('load',e=>{const el=e.target;if(el?.classList?.contains('temporal-raster')&&el.src)prefetchAdjacent(el.src)},{capture:true});

  function ensureDecisionUI(){
    const timebar=document.querySelector('.timebar');if(!timebar||$('nbCropTimeline'))return;
    const timelines=document.createElement('div');timelines.className='nbTimelines';timelines.innerHTML=`
      <div class="nbTimelineLabel"><b>Crop calendar</b><span id="nbTimelineDate">Selected date</span></div><div class="nbTimeline" id="nbCropTimeline"></div>
      <div class="nbTimelineLabel"><b>Common bean GDD stages</b><span>Thermal-stage model</span></div><div class="nbTimeline detail" id="nbGddTimeline"></div>`;
    timebar.insertAdjacentElement('afterend',timelines);
    const panel=document.createElement('section');panel.className='nbDecisionPanel';panel.id='nbDecisionPanel';panel.innerHTML=`<div class="nbDecisionHead"><div><span>7-DAY DECISION SUPPORT</span><b id="nbDecisionTitle">Loading regional change…</b></div><small>Interpretation is bounded to observed/model evidence; not a price forecast.</small></div><div class="nbDecisionGrid"><article><span>WHAT CHANGED</span><p id="nbChanged">—</p></article><article><span>WHY IT MATTERS AGRONOMICALLY</span><p id="nbWhy">—</p></article><article><span>BOUNDED COMMERCIAL INTERPRETATION</span><p id="nbCommercial">—</p></article><article><span>WHAT TO MONITOR NEXT</span><p id="nbMonitor">—</p></article></div>`;
    timelines.insertAdjacentElement('afterend',panel);
  }

  function rowFor(regionId,date){return model?.regions?.[regionId]?.dates?.[iso(date)]||null}
  function satFor(regionId,date){const rows=satellite?.areas?.[regionId]?.dates||{},keys=Object.keys(rows).filter(k=>k<=iso(date)).sort();return keys.length?{date:keys.at(-1),...rows[keys.at(-1)]}:null}
  function stageSegments(regionId){
    const rows=model?.regions?.[regionId]?.dates||{},dates=Object.keys(rows).sort();if(!dates.length)return [];
    const seg=[];for(const d of dates){const s=rows[d]?.stage||'Unknown';const last=seg.at(-1);if(!last||last.stage!==s)seg.push({stage:s,start:d,end:d});else last.end=d;}return seg;
  }
  function renderTimelines(regionId,date){
    if(!model)return;const segs=stageSegments(regionId);if(!segs.length)return;const total=Math.max(1,parseDay(segs.at(-1).end)-parseDay(segs[0].start)+DAY),current=iso(date);
    const broad=[];for(const s of segs){const b=broadStage(s.stage),last=broad.at(-1);if(last?.stage===b)last.end=s.end;else broad.push({stage:b,start:s.start,end:s.end});}
    const html=arr=>arr.map(s=>{const w=(parseDay(s.end)-parseDay(s.start)+DAY)/total*100,active=current>=s.start&&current<=s.end,past=current>s.end;return `<div class="nbSeg ${active?'active':past?'past':''}" style="width:${w.toFixed(2)}%"><b>${esc(s.stage)}</b><small>${s.start.slice(5)}–${s.end.slice(5)}</small></div>`}).join('');
    $('nbCropTimeline').innerHTML=html(broad);$('nbGddTimeline').innerHTML=html(segs.map(s=>({...s,stage:s.stage.replace(' / ',' / ')})));$('nbTimelineDate').textContent=`Selected ${current}`;
  }
  function fmt(v,d=0){return Number.isFinite(v)?Number(v).toFixed(d):'—'}
  function renderDecision(regionId,date){
    if(!model)return;const now=rowFor(regionId,date),priorDate=new Date(date.getTime()-7*DAY),prior=rowFor(regionId,priorDate),sat=satFor(regionId,date),area=document.querySelector(`#region option[value="${CSS.escape(regionId)}"]`)?.textContent||regionId;
    $('nbDecisionTitle').textContent=`${area} · ${iso(priorDate)} → ${iso(date)}`;
    if(!now||!prior){$('nbChanged').textContent='A complete seven-day model comparison is not available for this selected date.';$('nbWhy').textContent='The evidence gate prevents a fabricated change statement.';$('nbCommercial').textContent='No commercial inference is released without a valid seven-day comparison.';$('nbMonitor').textContent='Advance the date or inspect the available model period.';return;}
    const yd=Number.isFinite(now.yield_lb_ac)&&Number.isFinite(prior.yield_lb_ac)?now.yield_lb_ac-prior.yield_lb_ac:null,gdd=now.observed_gdd_f-prior.observed_gdd_f,rain=now.observed_precip_mm-prior.observed_precip_mm,def=(now.observed_climatic_deficit_mm??0)-(prior.observed_climatic_deficit_mm??0);
    const parts=[`${fmt(gdd)} base-50°F GDD accumulated`,`${fmt(rain)} mm precipitation`,`${fmt(def)} mm additional climatic deficit`];if(Number.isFinite(yd))parts.unshift(`GISit yield outlook ${yd>=0?'+':''}${fmt(yd)} lb/ac`);$('nbChanged').textContent=`Over seven days: ${parts.join('; ')}. Stage: ${prior.stage} → ${now.stage}.`;
    const dry=def>15||sat?.smap_anomaly<0,wet=rain>25||sat?.smap_anomaly>0.05;let why=`The crop is in ${now.stage}. `;if(/Flowering|Pod fill/i.test(now.stage))why+=dry?'Water stress during reproductive development can reduce pod set or seed fill.':wet?'Improved water availability during reproductive development can protect yield potential.':'Reproductive-stage water balance deserves close attention.';else if(/Maturity|Harvest/i.test(now.stage))why+=wet?'Excess moisture can slow dry-down and complicate harvest timing.':'Dry-down and harvestability increasingly matter more than vegetative growth.';else why+=dry?'Moisture deficit can constrain canopy expansion and later reproductive potential.':'Heat accumulation is advancing development; moisture trend determines whether growth is adequately supported.';$('nbWhy').textContent=why;
    let commercial='Evidence is mixed; no directional supply conclusion is justified yet.';if(Number.isFinite(yd)&&yd<0&&dry)commercial='Regional production risk has increased modestly. If the pattern broadens across major acreage, it could tighten expected supply, but this panel does not convert that risk into a price forecast.';else if(Number.isFinite(yd)&&yd>0&&!dry)commercial='Regional yield potential has improved. If corroborated across major acreage, expected supply risk is easing; acreage weighting and other regions must be checked before drawing a market conclusion.';else if(/Harvest/i.test(now.stage))commercial='Attention is shifting from biological yield formation to harvest pace, quality, and realized production. Market interpretation should wait for acreage-weighted regional evidence.';$('nbCommercial').textContent=commercial;
    const monitor=[];if(/Flowering|Pod fill/i.test(now.stage))monitor.push('root-zone moisture and heat during reproductive stages');if(/Maturity|Harvest/i.test(now.stage))monitor.push('dry-down weather, harvest pace, and quality risk');monitor.push('NDVI direction','SMAP anomaly','regional divergence','USDA acreage revisions');$('nbMonitor').textContent=`Watch ${monitor.join(', ')}. Current satellite checkpoint: ${sat?.date||'unavailable'}.`;
  }
  function currentRegion(){return $('region')?.value||'ne-panhandle'}
  function dateFromSlider(){if(!start)return null;return new Date(start.getTime()+Number($('timeSlider')?.value||0)*DAY)}
  function updatePreview(){const d=dateFromSlider();if(!d)return;$('sliderDate').textContent=iso(d);renderTimelines(currentRegion(),d);renderDecision(currentRegion(),d)}

  async function init(){
    ensureDecisionUI();installLegendHandoff();
    try{[model,satellite]=await Promise.all([fetch('assets/data/gisit-outlook-2026.json',{cache:'no-store'}).then(r=>r.json()),fetch('assets/data/satellite-signals-2026.json',{cache:'no-store'}).then(r=>r.json())]);start=parseDay(model.analysis_start);end=parseDay(model.analysis_end);}catch(e){console.error('Recovery UI data load failed',e);return;}
    const slider=$('timeSlider'),region=$('region');slider?.addEventListener('input',updatePreview);slider?.addEventListener('change',()=>setTimeout(updatePreview,0));region?.addEventListener('change',()=>setTimeout(updatePreview,0));
    updatePreview();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0);
})();
