'use strict';
(()=>{
  const $=id=>document.getElementById(id),DAY=86400000;
  const utcDay=new Date().toISOString().slice(0,10);
  const TODAY=new Date(`${utcDay}T12:00:00Z`),SEASON_START=new Date(`${TODAY.getUTCFullYear()}-04-15T12:00:00Z`);
  const STATES={Nebraska:'31',Colorado:'08',Wyoming:'56',Kansas:'20'};
  const STUDY_AREAS=[
    {id:'ne-panhandle',name:'Nebraska Panhandle',state:'Nebraska',center:[41.75,-103.20]},
    {id:'sw-nebraska',name:'Southwest Nebraska',state:'Nebraska',center:[40.25,-101.55]},
    {id:'ne-colorado',name:'Northeast / East-Central Colorado',state:'Colorado',center:[40.40,-103.40]},
    {id:'western-colorado',name:'Western Colorado',state:'Colorado',center:[38.55,-108.30]},
    {id:'big-horn',name:'Big Horn Basin',state:'Wyoming',center:[44.10,-108.20]},
    {id:'se-wyoming',name:'Southeast Wyoming',state:'Wyoming',center:[42.00,-104.50]},
    {id:'nw-kansas',name:'Northwest / West-Central Kansas',state:'Kansas',center:[39.25,-101.60]}
  ];
  const state={date:new Date(TODAY),playing:false,selected:'ne-panhandle',weather:new Map(),request:0,baseline:null,build:null};
  const map=L.map('map',{zoomControl:true,preferCanvas:true}).setView([41.25,-103.3],6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(map);
  const countyLayer=L.layerGroup().addTo(map),studyLayer=L.layerGroup().addTo(map),evidenceLayer=L.layerGroup().addTo(map);
  const iso=d=>d.toISOString().slice(0,10),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const fmt=(v,d=1)=>Number.isFinite(v)?Number(v).toFixed(d):'—',source=id=>window.NB_SOURCES?.[id]||null;
  const evidenceTag=(classification,text='')=>`<span class="evidence ${classification.toLowerCase()}">${classification}</span>${text}`;
  const statusTag=(status,text='')=>`<span class="workstatus">${status}</span>${text}`;
  const setText=(id,value)=>{const el=$(id);if(el)el.textContent=value};
  const setHTML=(id,value)=>{const el=$(id);if(el)el.innerHTML=value};
  const selectedArea=()=>STUDY_AREAS.find(r=>r.id===state.selected)||STUDY_AREAS[0];

  async function loadBaseline(){
    const r=await fetch('assets/data/official-baseline.json',{cache:'no-store'});
    if(!r.ok)throw Error(`official baseline ${r.status}`);
    state.baseline=await r.json();
  }
  async function loadBuildManifest(){
    const r=await fetch('assets/data/build-manifest.json',{cache:'no-store'});
    if(!r.ok)throw Error(`build manifest ${r.status}`);
    state.build=await r.json();
    setText('buildStatus',`Data build ${state.build.data_build_id} · model: none accepted`);
  }
  function officialAsOf(stateName,date){
    const rows=state.baseline?.forecast_history?.[stateName]||[],cut=iso(date);
    const available=rows.filter(x=>x.issue_date<=cut);
    const latest=metric=>available.filter(x=>x.metric===metric).sort((a,b)=>a.issue_date.localeCompare(b.issue_date)).at(-1)||null;
    return {planted:latest('planted_acres'),harvested:latest('harvested_acres'),yield:latest('yield_lb_ac'),production:latest('production_cwt')};
  }
  async function countyGeo(name,code){
    const url='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?where='+encodeURIComponent(`STATE='${code}'`)+'&outFields=NAME,BASENAME,GEOID&returnGeometry=true&outSR=4326&f=geojson';
    const r=await fetch(url);if(!r.ok)throw Error(`${name} county geometry ${r.status}`);return r.json();
  }
  async function loadCounties(){
    const results=await Promise.allSettled(Object.entries(STATES).map(async([name,code])=>[name,await countyGeo(name,code)]));
    let n=0;
    results.forEach(x=>{if(x.status!=='fulfilled')return;const [,gj]=x.value;L.geoJSON(gj,{interactive:false,style:{fill:false,fillOpacity:0,color:'#7c8982',weight:.65,opacity:.68}}).addTo(countyLayer);n+=(gj.features||[]).length});
    setText('countyStatus',n?`${n} county boundaries loaded as reference only`:'County boundary service unavailable');
  }
  function drawStudyAreas(){
    studyLayer.clearLayers();
    STUDY_AREAS.forEach(r=>{const selected=r.id===state.selected,m=L.circleMarker(r.center,{radius:selected?7:5,color:selected?'#183f5b':'#516c59',weight:selected?2:1.2,fillColor:'#fff',fillOpacity:.9});m.bindTooltip(`${r.name} · candidate location only`,{direction:'top'});m.on('click',()=>selectArea(r.id));m.addTo(studyLayer)});
  }
  function dateFromSlider(){const span=Math.max(1,Math.round((TODAY-SEASON_START)/DAY));return new Date(SEASON_START.getTime()+Number($('timeSlider').value||0)/100*span*DAY)}
  function syncSliderFromDate(){const span=Math.max(1,(TODAY-SEASON_START)/DAY);$('timeSlider').value=clamp(Math.round((state.date-SEASON_START)/DAY/span*100),0,100)}
  async function fallbackWeather(area,date,token){
    const key=`${area.id}:${iso(date)}`;if(state.weather.has(key))return state.weather.get(key);
    const start=new Date(date.getTime()-29*DAY),params=new URLSearchParams({latitude:area.center[0],longitude:area.center[1],start_date:iso(start),end_date:iso(date),timezone:'UTC',daily:'precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min'});
    const r=await fetch('https://archive-api.open-meteo.com/v1/archive?'+params);if(!r.ok)throw Error(`temporary weather fallback ${r.status}`);
    const j=await r.json();if(token!==state.request)throw Error('stale request');
    const d=j.daily||{},rain=(d.precipitation_sum||[]).filter(Number.isFinite),et=(d.et0_fao_evapotranspiration||[]).filter(Number.isFinite),tx=(d.temperature_2m_max||[]).filter(Number.isFinite),tn=(d.temperature_2m_min||[]).filter(Number.isFinite);
    const value={rain30:rain.reduce((a,b)=>a+b,0),et30:et.reduce((a,b)=>a+b,0),maxT:tx.length?Math.max(...tx):null,minT:tn.length?Math.min(...tn):null,validThrough:(d.time||[]).at(-1)||null,source:'open-meteo-fallback'};
    state.weather.set(key,value);return value;
  }
  function renderEvidence(area,w){
    evidenceLayer.clearLayers();
    L.circleMarker(area.center,{radius:9,color:'#fff',weight:2,fillColor:'#526d7b',fillOpacity:.86}).bindTooltip(`${area.name}\nweather data only`,{direction:'top'}).bindPopup(`<b>${area.name}</b><br>${evidenceTag('MODELED',' temporary weather input')}<br><br><b>Selected date:</b> ${iso(state.date)}<br><b>Valid through:</b> ${w?.validThrough||'—'}<br><b>30-day precipitation:</b> ${fmt(w?.rain30,0)} mm<br><b>30-day reference ET₀:</b> ${fmt(w?.et30,0)} mm<br><b>30-day maximum temperature:</b> ${fmt(w?.maxT,1)} °C<br><b>30-day minimum temperature:</b> ${fmt(w?.minT,1)} °C<br><br><small>No stress class, crop condition, or yield impact is inferred.</small>`).addTo(evidenceLayer);
  }
  function updateSourcePanel(){
    const ids=['cdl','nass','noaa','era5','smap','cropcasma','ssurgo','hls','usdm','irrigation','nbm'];
    setHTML('sourceList',ids.map(id=>{const s=source(id);return `<div class="sourceRow"><div><b>${s.name}</b><small>${s.role}</small></div><span>${s.classification}</span></div>`}).join(''));
  }
  function updateCalendar(){
    const phases=['Planting','Emergence','Vegetative','Flowering','Pod Set','Seed Fill','Maturity','Harvest'];
    setHTML('calendar',phases.map(p=>`<div class="phase future"><b>${p}</b><span>Stage model pending official progress + sourced bean-GDD integration</span><em>${evidenceTag('UNKNOWN')}</em></div>`).join(''));
  }
  function updateTruthPanel(area,w){
    const official=officialAsOf(area.state,state.date),hasYield=official.yield?.value!=null;
    setText('asOfLabel',iso(state.date));setText('sliderDate',iso(state.date));setText('regionName',area.name);setText('stageTag','STAGE: UNKNOWN');
    if(hasYield){
      setText('plainAnswer',`${area.state}: USDA's latest available dry-bean yield forecast was ${official.yield.value.toLocaleString()} lb/ac for ${official.yield.valid_date}.`);
      setText('narrative',`This is an OBSERVED published NASS forecast record released ${official.yield.issue_date}, not a GISit forecast. No independent crop-condition, yield, or production model is accepted yet.`);
      setText('yieldNow',`${official.yield.value.toLocaleString()} lb/ac`);setText('yieldRange','OBSERVED USDA/NASS forecast record · GISit range not implemented');setText('yieldDelta','Official forecast record, not GISit estimate');
      setText('regionYield',`${official.yield.value.toLocaleString()} lb/ac`);setText('regionYieldWhy',`OBSERVED NASS publication record; forecast valid ${official.yield.valid_date}, released ${official.yield.issue_date}.`);
    }else{
      setText('plainAnswer','The selected date predates an available official dry-bean yield forecast for this state.');setText('narrative','Later USDA forecasts are withheld from earlier dates. Missing current state records remain UNKNOWN, not zero.');setText('yieldNow','—');setText('yieldRange','NO DATE-CORRECT OFFICIAL YIELD FORECAST');setText('yieldDelta','No future-data leakage');setText('regionYield','—');setText('regionYieldWhy','No yield forecast was available to the system by the selected date.');
    }
    setText('condition','NOT IMPLEMENTED');setText('conditionWhy','Requires crop mask + root-zone water + phenology + vegetation');
    setText('soilState','NOT IMPLEMENTED');setText('soilValue','SMAP L4 0–100 cm pipeline is not connected');
    setText('healthState',w?'MODELED INPUT':'UNKNOWN');setText('healthWhy','Raw temporary weather values only; no stress or crop condition inferred');
    setText('yieldVsBase','—');setText('confidence','UNKNOWN');setText('confidenceWhy','No accepted confidence model or calibrated crop model');
    const acreage=official.planted?.value!=null?`${official.planted.value.toLocaleString()} planted acres (${official.planted.status}, released ${official.planted.issue_date})`:'no published state acreage in the governed evidence set';
    setText('plainEnglish',`Official state evidence as of this date: ${acreage}. Weather remains an input, not a crop conclusion.`);
    setText('regionSoil','—');setText('regionSoilWhy','NOT IMPLEMENTED — SMAP root-zone moisture and historical distribution required.');
    setText('regionWater',w?`${fmt(w.rain30,0)} / ${fmt(w.et30,0)} mm`:'—');setText('regionWaterWhy','MODELED temporary fallback: 30-day precipitation / reference ET₀; no crop-water class.');
    setText('regionHeat',w?`${fmt(w.minT,1)} to ${fmt(w.maxT,1)} °C`:'—');setText('regionHeatWhy','MODELED 30-day temperature extrema; no damage threshold or stage overlap applied.');
    setText('seasonRain','—');setText('modelChange','—');
    setHTML('drivers',[`<div class="driver"><b>Official acreage/yield</b><br>${official.planted?evidenceTag('OBSERVED',` ${acreage}`):evidenceTag('UNKNOWN',' state record unavailable')}</div>`,`<div class="driver"><b>Crop geography</b><br>${statusTag('NOT IMPLEMENTED',' 2025 CDL class-42 processing required.')}</div>`,`<div class="driver"><b>Root-zone water</b><br>${statusTag('NOT IMPLEMENTED',' SMAP percentile/anomaly integration required.')}</div>`,`<div class="driver"><b>Phenology + vegetation</b><br>${statusTag('NOT IMPLEMENTED',' official progress + bean GDD + HLS required.')}</div>`].join(''));
    setText('storyTitle',`Season narrative · ${area.name}`);setText('storyText','A crop narrative is withheld until crop footprint, progress, root-zone moisture, vegetation trajectory, and dated provenance are connected for the selected date.');
    setHTML('mapLegend','<b>Evidence map — staging prototype</b><div><span class="sw neutral"></span>Candidate location; not crop geography</div><div><span class="sw outline"></span>County boundary; reference only</div><small>No crop-condition or production fill is rendered.</small>');
    setText('status',`${area.name} · ${iso(state.date)} · temporary weather ${w?'loaded':'unavailable'} · official history issue-date filtered.`);
  }
  async function refresh(){
    const token=++state.request,area=selectedArea();drawStudyAreas();setText('status',`Loading selected-date evidence for ${area.name}…`);
    let w=null;try{w=await fallbackWeather(area,state.date,token)}catch(e){if(String(e.message)!=='stale request')console.warn(e)}
    if(token!==state.request)return;renderEvidence(area,w);updateTruthPanel(area,w);
  }
  function selectArea(id){state.selected=id;$('region').value=id;drawStudyAreas();refresh()}
  $('region').innerHTML=STUDY_AREAS.map(r=>`<option value="${r.id}">${r.name}</option>`).join('');
  $('region').addEventListener('change',e=>{state.selected=e.target.value;refresh()});
  $('timeSlider').addEventListener('input',()=>{state.date=dateFromSlider();setText('sliderDate',iso(state.date))});$('timeSlider').addEventListener('change',refresh);
  $('playBtn').addEventListener('click',()=>{if(state.playing){state.playing=false;$('playBtn').textContent='▶ PLAY';return}state.playing=true;$('playBtn').textContent='■ STOP';const tick=()=>{if(!state.playing)return;state.date=new Date(state.date.getTime()+7*DAY);if(state.date>TODAY)state.date=new Date(SEASON_START);syncSliderFromDate();refresh().finally(()=>setTimeout(tick,900))};tick()});
  ['yieldBtn','moistureBtn','healthBtn','satBtn'].forEach(id=>$(id)?.addEventListener('click',()=>{document.querySelectorAll('.mapactions button').forEach(b=>b.classList.remove('on'));$(id).classList.add('on');const labels={yieldBtn:'Official NASS forecast history is available; independent GISit yield is NOT IMPLEMENTED.',moistureBtn:'SMAP root-zone moisture integration is NOT IMPLEMENTED.',healthBtn:'Crop-condition synthesis is NOT IMPLEMENTED.',satBtn:'HLS vegetation trajectory is NOT IMPLEMENTED.'};setText('status',labels[id])}));
  updateSourcePanel();updateCalendar();syncSliderFromDate();drawStudyAreas();
  Promise.allSettled([loadCounties(),loadBaseline(),loadBuildManifest()]).then(results=>{if(results[1].status==='rejected')console.error(results[1].reason);if(results[2].status==='rejected')setText('buildStatus','Data build manifest unavailable');return refresh()}).then(()=>setText('runtimeStatus','Single-controller recovery runtime loaded; mandatory crop analytics remain incomplete.')).catch(e=>{console.error(e);setText('runtimeStatus','Runtime partially loaded; see console.')});
})();
