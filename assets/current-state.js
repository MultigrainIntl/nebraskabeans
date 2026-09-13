'use strict';
(()=>{
  const DAY=86400000,$=id=>document.getElementById(id),parse=s=>new Date(`${s}T12:00:00Z`),iso=d=>d.toISOString().slice(0,10);
  let model=null,currentEvidence=null;

  const txt=id=>($(id)?.textContent||'').trim();
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const signed=(v,unit='')=>v===null?'—':`${v>0?'+':''}${Math.round(v)}${unit}`;

  function sevenDaysBefore(date){return iso(new Date(parse(date).getTime()-7*DAY));}
  function currentRegionId(){return $('region')?.value||'ne-panhandle';}
  function currentRegionName(){return txt('regionName')||'Nebraska Panhandle';}

  function stageWatch(stage){
    if(/Flowering|pod development|Pod fill/i.test(stage)) return 'Watch root-zone moisture, heat, and vegetation response during the reproductive period.';
    if(/Maturity|Harvest/i.test(stage)) return 'Watch dry-down weather, harvest pace, and quality risk.';
    if(/Vegetative|Establishment/i.test(stage)) return 'Watch moisture support, canopy development, and heat accumulation.';
    return 'Watch the next governed weather, moisture, vegetation, and yield-model update.';
  }

  function yieldDirection(now,prior){
    const a=num(now?.yield_lb_ac),b=num(prior?.yield_lb_ac);
    if(a===null||b===null)return {label:'NOT DETERMINED',detail:'A valid seven-day yield comparison is not available.'};
    const d=a-b;
    if(d>0)return {label:'UP',detail:`${signed(d,' lb/ac')} over 7 days. Direction only; materiality is not yet classified.`};
    if(d<0)return {label:'DOWN',detail:`${signed(d,' lb/ac')} over 7 days. Direction only; materiality is not yet classified.`};
    return {label:'UNCHANGED',detail:'No modeled yield change over the last 7 days.'};
  }

  function installCurrentStateShell(){
    const mapSection=$('mapSection'),mapWrap=mapSection?.querySelector('.mapwrap');
    if(!mapSection||!mapWrap)return false;
    let shell=$('nbSeasonSnapshot');
    if(!shell){shell=document.createElement('section');shell.id='nbSeasonSnapshot';shell.className='nbSeasonSnapshot';mapWrap.insertAdjacentElement('beforebegin',shell);}
    shell.setAttribute('aria-label','Current crop state');
    shell.innerHTML=`
      <div class="nbCurrentHead">
        <div><span>CURRENT CROP STATE</span><b id="nbCurrentTitle">Loading latest governed state…</b></div>
        <small id="nbCurrentAsOf">Latest governed evidence</small>
      </div>
      <p class="nbCurrentTakeaway" id="nbCurrentTakeaway">Calculating the latest crop state from governed evidence…</p>
      <div class="nbSnapshotGrid nbCurrentGrid">
        <div><span>STAGE</span><strong id="nbSnapStage">—</strong><small id="nbStageDetail">Latest modeled crop stage</small></div>
        <div><span>CROP HEALTH</span><strong id="nbSnapCondition">—</strong><small id="nbHealthDetail">Evidence-bounded current outlook</small></div>
        <div><span>7-DAY YIELD</span><strong id="nbYieldDirection">—</strong><small id="nbYieldDetail">Model direction, not a price forecast</small></div>
        <div><span>WATER</span><strong id="nbSnapWater">—</strong><small id="nbWaterDetail">Root-zone moisture evidence</small></div>
        <div><span>VEGETATION</span><strong id="nbSnapVeg">—</strong><small id="nbVegDetail">Satellite direction</small></div>
      </div>
      <div class="nbCurrentBottom">
        <div><span>WATCH NEXT</span><b id="nbWatchNext">—</b></div>
        <div class="nbForecastPlaceholder"><span>FORECAST OUTLOOK</span><b>PLANNED</b><small>Weather-model scenarios will be added after current-state logic is validated.</small></div>
      </div>`;
    return true;
  }

  function captureCurrentEvidence(){
    if(!model||txt('sliderDate')!==model.analysis_end)return;
    currentEvidence={
      condition:txt('condition')||'UNKNOWN',
      conditionWhy:txt('conditionWhy'),
      soil:txt('soilState')||'UNKNOWN',
      soilWhy:txt('soilValue'),
      veg:txt('healthState')||'UNKNOWN',
      vegWhy:txt('healthWhy')
    };
  }

  function renderCurrentState(){
    if(!model||!$('nbSeasonSnapshot'))return;
    captureCurrentEvidence();
    const regionId=currentRegionId(),region=model.regions?.[regionId];
    const end=model.analysis_end,now=region?.dates?.[end],prior=region?.dates?.[sevenDaysBefore(end)];
    if(!now){
      $('nbCurrentTitle').textContent=`${currentRegionName()} · current state unavailable`;
      $('nbCurrentTakeaway').textContent='The current-state engine will not fabricate an answer without a governed latest-date model row.';
      return;
    }
    const yd=yieldDirection(now,prior),stage=now.stage||'UNKNOWN';
    const condition=currentEvidence?.condition||'PENDING CURRENT EVIDENCE';
    const soil=currentEvidence?.soil||'PENDING CURRENT EVIDENCE';
    const veg=currentEvidence?.veg||'PENDING CURRENT EVIDENCE';
    $('nbCurrentTitle').textContent=`${currentRegionName()} · ${end}`;
    $('nbCurrentAsOf').textContent=`CURRENT THROUGH ${end}`;
    $('nbSnapStage').textContent=stage;
    $('nbSnapCondition').textContent=condition;
    $('nbYieldDirection').textContent=yd.label;
    $('nbYieldDetail').textContent=yd.detail;
    $('nbSnapWater').textContent=soil;
    $('nbSnapVeg').textContent=veg;
    $('nbHealthDetail').textContent=currentEvidence?.conditionWhy||'Waiting for the governed crop-health interpretation at the latest model date.';
    $('nbWaterDetail').textContent=currentEvidence?.soilWhy||'Waiting for current root-zone moisture evidence.';
    $('nbVegDetail').textContent=currentEvidence?.vegWhy||'Waiting for current vegetation evidence.';
    $('nbWatchNext').textContent=stageWatch(stage);
    $('nbCurrentTakeaway').textContent=`${currentRegionName()} is in ${stage}. Crop-health outlook: ${condition}. Seven-day GISit yield direction: ${yd.label}.`;
  }

  function installLegendControl(){
    const wrap=document.querySelector('.mapwrap'),legend=$('mapLegend');if(!wrap||!legend||$('nbLegendToggle'))return;
    const btn=document.createElement('button');btn.id='nbLegendToggle';btn.className='nbLegendToggle';btn.type='button';btn.setAttribute('aria-controls','mapLegend');
    const apply=open=>{legend.classList.toggle('nbLegendOpen',open);btn.setAttribute('aria-expanded',String(open));btn.textContent=open?'× Close legend':'Legend';};
    btn.addEventListener('click',()=>apply(btn.getAttribute('aria-expanded')!=='true'));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&btn.getAttribute('aria-expanded')==='true')apply(false)});
    wrap.appendChild(btn);
    const mq=matchMedia('(max-width: 620px)');apply(!mq.matches);
    mq.addEventListener?.('change',e=>apply(!e.matches));
  }

  function consolidateTemporalControls(){
    const timebar=document.querySelector('.timebar'),controls=document.querySelector('.playbackControls'),speed=$('playSpeed');if(!timebar||!controls||!speed||$('nbSpeedRow'))return;
    const speedLabel=speed.closest('label');if(!speedLabel)return;
    const row=document.createElement('div');row.id='nbSpeedRow';row.className='nbSpeedRow';row.appendChild(speedLabel);timebar.insertAdjacentElement('afterend',row);
  }

  async function start(){
    if(!installCurrentStateShell())return;
    installLegendControl();consolidateTemporalControls();
    try{model=await fetch('assets/data/gisit-outlook-2026.json',{cache:'no-store'}).then(r=>r.json());}catch(e){console.error('Current crop state model load failed',e);return;}
    const observer=new MutationObserver(()=>{captureCurrentEvidence();renderCurrentState();});
    ['condition','conditionWhy','soilState','soilValue','healthState','healthWhy','sliderDate','regionName'].forEach(id=>{const el=$(id);if(el)observer.observe(el,{subtree:true,childList:true,characterData:true});});
    $('region')?.addEventListener('change',()=>setTimeout(renderCurrentState,0));
    setTimeout(()=>{captureCurrentEvidence();renderCurrentState();},100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,120));else setTimeout(start,120);
})();
