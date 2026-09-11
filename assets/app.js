'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const DAY=86400000;
  const TODAY=new Date('2026-09-11T12:00:00Z');
  const SEASON_START=new Date('2026-04-15T12:00:00Z');
  const STATES={Nebraska:'31',Colorado:'08',Wyoming:'56',Kansas:'20'};
  const STUDY_AREAS=[
    {id:'ne-panhandle',name:'Nebraska Panhandle',state:'Nebraska',center:[41.75,-103.20],note:'Candidate analytical area pending CDL-derived crop mask.'},
    {id:'sw-nebraska',name:'Southwest Nebraska',state:'Nebraska',center:[40.25,-101.55],note:'Candidate analytical area pending CDL-derived crop mask.'},
    {id:'ne-colorado',name:'Northeast / East-Central Colorado',state:'Colorado',center:[40.40,-103.40],note:'Candidate analytical area pending CDL-derived crop mask.'},
    {id:'western-colorado',name:'Western Colorado',state:'Colorado',center:[38.55,-108.30],note:'Candidate analytical area pending CDL-derived crop mask.'},
    {id:'big-horn',name:'Big Horn Basin',state:'Wyoming',center:[44.10,-108.20],note:'Candidate analytical area pending CDL-derived crop mask.'},
    {id:'se-wyoming',name:'Southeast Wyoming',state:'Wyoming',center:[42.00,-104.50],note:'Candidate analytical area pending CDL-derived crop mask.'},
    {id:'nw-kansas',name:'Northwest / West-Central Kansas',state:'Kansas',center:[39.25,-101.60],note:'Candidate analytical area pending CDL-derived crop mask.'}
  ];
  const state={date:new Date(TODAY),mode:'evidence',playing:false,selected:'ne-panhandle',weather:new Map(),request:0};

  const map=L.map('map',{zoomControl:true,preferCanvas:true}).setView([41.25,-103.3],6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(map);
  const countyLayer=L.layerGroup().addTo(map);
  const studyLayer=L.layerGroup().addTo(map);
  const evidenceLayer=L.layerGroup().addTo(map);

  const iso=d=>d.toISOString().slice(0,10);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const fmt=(v,d=1)=>Number.isFinite(v)?Number(v).toFixed(d):'—';
  const source=id=>window.NB_SOURCES?.[id]||null;
  const evidenceTag=(classification,text)=>`<span class="evidence ${classification.toLowerCase()}">${classification}</span>${text||''}`;

  function setText(id,text){const el=$(id);if(el)el.textContent=text}
  function setHTML(id,html){const el=$(id);if(el)el.innerHTML=html}
  function selectedArea(){return STUDY_AREAS.find(r=>r.id===state.selected)||STUDY_AREAS[0]}

  async function countyGeo(name,code){
    const url='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?where='+encodeURIComponent(`STATE='${code}'`)+'&outFields=NAME,BASENAME,GEOID&returnGeometry=true&outSR=4326&f=geojson';
    const r=await fetch(url);
    if(!r.ok)throw new Error(`${name} county geometry ${r.status}`);
    return r.json();
  }

  async function loadCounties(){
    const results=await Promise.allSettled(Object.entries(STATES).map(async([name,code])=>[name,await countyGeo(name,code)]));
    let n=0;
    results.forEach(x=>{
      if(x.status!=='fulfilled')return;
      const [name,gj]=x.value;
      L.geoJSON(gj,{pane:'overlayPane',interactive:false,style:{fill:false,fillOpacity:0,color:'#7c8982',weight:.65,opacity:.68}}).addTo(countyLayer);
      n+=(gj.features||[]).length;
    });
    setText('countyStatus',n?`${n} county boundaries loaded as reference only`:'County boundary service unavailable');
  }

  function drawStudyAreas(){
    studyLayer.clearLayers();
    STUDY_AREAS.forEach(r=>{
      const selected=r.id===state.selected;
      const m=L.circleMarker(r.center,{radius:selected?7:5,color:selected?'#183f5b':'#516c59',weight:selected?2:1.2,fillColor:'#fff',fillOpacity:.9});
      m.bindTooltip(`${r.name} · analytical candidate`,{direction:'top'});
      m.on('click',()=>selectArea(r.id));
      m.addTo(studyLayer);
    });
  }

  function dateFromSlider(){
    const span=Math.round((TODAY-SEASON_START)/DAY);
    return new Date(SEASON_START.getTime()+Number($('timeSlider').value||0)/100*span*DAY);
  }
  function syncSliderFromDate(){
    const span=(TODAY-SEASON_START)/DAY;
    $('timeSlider').value=clamp(Math.round((state.date-SEASON_START)/DAY/span*100),0,100);
  }

  async function fallbackWeather(area,date,token){
    const key=`${area.id}:${iso(date)}`;
    if(state.weather.has(key))return state.weather.get(key);
    const start=new Date(date.getTime()-29*DAY);
    const p=new URLSearchParams({latitude:area.center[0],longitude:area.center[1],start_date:iso(start),end_date:iso(date),timezone:'UTC',daily:'precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min'});
    const r=await fetch('https://archive-api.open-meteo.com/v1/archive?'+p);
    if(!r.ok)throw new Error(`temporary weather fallback ${r.status}`);
    const j=await r.json();
    if(token!==state.request)throw new Error('stale request');
    const d=j.daily||{}, rain=(d.precipitation_sum||[]).filter(Number.isFinite), et=(d.et0_fao_evapotranspiration||[]).filter(Number.isFinite), tx=(d.temperature_2m_max||[]).filter(Number.isFinite), tn=(d.temperature_2m_min||[]).filter(Number.isFinite);
    const v={
      rain30:rain.reduce((a,b)=>a+b,0),et30:et.reduce((a,b)=>a+b,0),
      maxT:tx.length?Math.max(...tx):null,minT:tn.length?Math.min(...tn):null,
      heatDays:tx.filter(x=>x>=35).length,frostDays:tn.filter(x=>x<=1).length,
      validThrough:(d.time||[]).at(-1)||null,
      source:'openmeteo'
    };
    state.weather.set(key,v);return v;
  }

  function classifyWater(w){
    if(!w)return {label:'UNAVAILABLE',why:'No temporary gridded-weather response.'};
    const balance=w.rain30-w.et30;
    if(balance<-90)return {label:'DRYING PRESSURE',why:`30-day precipitation minus reference ET₀ = ${fmt(balance,0)} mm.`};
    if(balance<-35)return {label:'WATCH',why:`30-day precipitation minus reference ET₀ = ${fmt(balance,0)} mm.`};
    return {label:'NO LARGE METEOROLOGICAL DEFICIT',why:`30-day precipitation minus reference ET₀ = ${fmt(balance,0)} mm.`};
  }

  function renderEvidence(area,w){
    evidenceLayer.clearLayers();
    const water=classifyWater(w);
    const label=`${area.name}\n${water.label}`;
    L.circleMarker(area.center,{radius:9,color:'#fff',weight:2,fillColor:'#526d7b',fillOpacity:.86})
      .bindTooltip(label,{direction:'top'})
      .bindPopup(`<b>${area.name}</b><br>${evidenceTag('MODELED',' Temporary recovery weather evidence')}<br><br><b>Selected date:</b> ${iso(state.date)}<br><b>30-day precipitation:</b> ${fmt(w?.rain30,0)} mm<br><b>30-day reference ET₀:</b> ${fmt(w?.et30,0)} mm<br><b>Heat days ≥35°C:</b> ${w?.heatDays??'—'}<br><b>Cold days ≤1°C:</b> ${w?.frostDays??'—'}<br><br><small>This marker is not a crop-condition polygon and does not represent a yield estimate.</small>`)
      .addTo(evidenceLayer);
  }

  function updateSourcePanel(){
    const ids=['cdl','nass','noaa','era5','smap','ssurgo','hls','usdm','irrigation','nbm'];
    setHTML('sourceList',ids.map(id=>{const s=source(id);return `<div class="sourceRow"><div><b>${s.name}</b><small>${s.role}</small></div><span>${s.classification}</span></div>`}).join(''));
  }

  function updateCalendar(){
    const phases=['Planting','Emergence','Vegetative','Flowering','Pod Set','Seed Fill','Maturity','Harvest'];
    setHTML('calendar',phases.map((p,i)=>`<div class="phase future"><b>${p}</b><span>Stage model pending official-progress + bean-GDD integration</span><em>${evidenceTag('UNKNOWN','')}</em></div>`).join(''));
  }

  function updateTruthPanel(area,w){
    const water=classifyWater(w);
    setText('asOfLabel',iso(state.date));
    setText('sliderDate',iso(state.date));
    setText('regionName',area.name);
    setText('stageTag','STAGE: NOT YET VERIFIED');
    setText('plainAnswer','The recovery system is separating verified evidence from unsupported crop conclusions.');
    setText('narrative',`For ${area.name}, selected-date weather evidence is available as a temporary modeled fallback. Crop identity, root-zone percentile, phenology, irrigation context, satellite trajectory and calibrated yield are not yet integrated, so a crop-yield conclusion is not defensible yet.`);
    setText('yieldNow','—');
    setText('yieldRange','NOT IMPLEMENTED · calibration required');
    setText('yieldDelta','No forecast issued');
    setText('condition','PARTIAL EVIDENCE');
    setText('conditionWhy','Condition synthesis awaits crop mask + SMAP + HLS + phenology');
    setText('soilState','NOT IMPLEMENTED');
    setText('soilValue','Selected source: NASA SMAP L4 0–100 cm + climatology');
    setText('healthState',water.label);
    setText('healthWhy','Meteorological pressure only; not crop condition');
    setText('yieldVsBase','—');
    setText('confidence','LOW');
    setText('confidenceWhy','Critical production inputs are not yet integrated');
    setText('plainEnglish',`The map currently shows reference geography and explicitly limited evidence. It will not manufacture a yield or crop-condition number while the authoritative inputs are incomplete.`);
    setText('regionYield','—');
    setText('regionYieldWhy','NOT IMPLEMENTED — historical baseline and calibrated dry-bean response model required.');
    setText('regionSoil','—');
    setText('regionSoilWhy','NOT IMPLEMENTED — SMAP root-zone moisture + historical percentile integration required.');
    setText('regionWater',w?`${fmt(w.rain30,0)} / ${fmt(w.et30,0)} mm`:'—');
    setText('regionWaterWhy','MODELED temporary fallback: 30-day precipitation / reference ET₀.');
    setText('regionHeat',w?`${w.heatDays} heat · ${w.frostDays} cold`:'—');
    setText('regionHeatWhy','MODELED screening exposure only; no damage inferred without crop stage overlap.');
    setText('seasonRain','—');
    setText('modelChange','—');
    setHTML('drivers',[
      `<div class="driver"><b>Crop geography</b><br>${evidenceTag('NOT IMPLEMENTED','')} 2025 CDL class 42 processing is required before crop-area inference.</div>`,
      `<div class="driver"><b>Water status</b><br>${evidenceTag('NOT IMPLEMENTED','')} SMAP L4 root-zone percentile is required.</div>`,
      `<div class="driver"><b>Phenology</b><br>${evidenceTag('NOT IMPLEMENTED','')} Official NASS progress + bean GDD integration is required.</div>`,
      `<div class="driver"><b>Vegetation</b><br>${evidenceTag('NOT IMPLEMENTED','')} HLS-VI trajectory is required.</div>`
    ].join(''));
    setText('storyTitle',`Season narrative · ${area.name}`);
    setText('storyText','The recovery architecture intentionally withholds a crop narrative until the crop footprint, official progress, root-zone moisture and satellite trajectory are connected for the selected model date. This prevents weather-only evidence from being presented as crop condition.');
    setHTML('mapLegend','<b>Evidence map — recovery state</b><div><span class="sw neutral"></span>Reference / candidate analytical location</div><div><span class="sw outline"></span>County boundaries: reference only</div><small>No crop-condition fill is rendered. No unsupported gradient is manufactured.</small>');
    setText('status',`${area.name} · ${iso(state.date)} · temporary weather fallback ${w?'loaded':'unavailable'} · crop/yield model intentionally withheld.`);
  }

  async function refresh(){
    const token=++state.request, area=selectedArea();
    drawStudyAreas();
    setText('status',`Loading selected-date evidence for ${area.name}…`);
    let w=null;
    try{w=await fallbackWeather(area,state.date,token)}catch(e){if(String(e.message)!=='stale request')console.warn(e)}
    if(token!==state.request)return;
    renderEvidence(area,w);updateTruthPanel(area,w);
  }

  function selectArea(id){state.selected=id;drawStudyAreas();refresh()}

  $('region').innerHTML=STUDY_AREAS.map(r=>`<option value="${r.id}">${r.name}</option>`).join('');
  $('region').addEventListener('change',e=>{state.selected=e.target.value;refresh()});
  $('timeSlider').addEventListener('input',()=>{state.date=dateFromSlider();setText('sliderDate',iso(state.date));});
  $('timeSlider').addEventListener('change',refresh);
  $('playBtn').addEventListener('click',()=>{
    if(state.playing){state.playing=false;$('playBtn').textContent='▶ PLAY';return}
    state.playing=true;$('playBtn').textContent='■ STOP';
    const tick=()=>{
      if(!state.playing)return;
      state.date=new Date(state.date.getTime()+7*DAY);
      if(state.date>TODAY)state.date=new Date(SEASON_START);
      syncSliderFromDate();refresh().finally(()=>setTimeout(tick,900));
    };tick();
  });
  ['yieldBtn','moistureBtn','healthBtn','satBtn'].forEach(id=>$(id)?.addEventListener('click',()=>{
    document.querySelectorAll('.mapactions button').forEach(b=>b.classList.remove('on'));
    $(id).classList.add('on');
    const labels={yieldBtn:'Yield forecast is withheld until W10 calibration.',moistureBtn:'SMAP root-zone moisture integration is pending W06.',healthBtn:'Crop-condition synthesis is pending W09.',satBtn:'HLS vegetation trajectory is pending W08.'};
    setText('status',labels[id]);
  }));

  updateSourcePanel();updateCalendar();syncSliderFromDate();drawStudyAreas();
  Promise.allSettled([loadCounties(),refresh()]).then(()=>setText('runtimeStatus','Single-controller recovery runtime loaded.'));
})();
