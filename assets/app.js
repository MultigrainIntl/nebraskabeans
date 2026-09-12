'use strict';
(()=>{
  const $=id=>document.getElementById(id),DAY=86400000;
  const STUDY_AREAS=[
    {id:'ne-panhandle',name:'Nebraska Panhandle',state:'Nebraska',center:[41.75,-103.20]},
    {id:'sw-nebraska',name:'Southwest Nebraska',state:'Nebraska',center:[40.25,-101.55]},
    {id:'ne-colorado',name:'Northeast / East-Central Colorado',state:'Colorado',center:[40.40,-103.40]},
    {id:'western-colorado',name:'Western Colorado',state:'Colorado',center:[38.55,-108.30]},
    {id:'big-horn',name:'Big Horn Basin',state:'Wyoming',center:[44.10,-108.20]},
    {id:'se-wyoming',name:'Southeast Wyoming',state:'Wyoming',center:[42.00,-104.50]},
    {id:'nw-kansas',name:'Northwest / West-Central Kansas',state:'Kansas',center:[39.25,-101.60]}
  ];
  const STATES={Nebraska:'31',Colorado:'08',Wyoming:'56',Kansas:'20'};
  const state={date:null,start:null,end:null,playing:false,selected:'ne-panhandle',mode:'yield',request:0,baseline:null,build:null,catalog:null,model:null,satellite:null,raster:null,yieldLayer:null};
  const map=L.map('map',{zoomControl:true,preferCanvas:true,minZoom:4,zoomSnap:.25,zoomDelta:.5}).setView([41.1,-102.5],6);
  map.createPane('rasterPane');map.getPane('rasterPane').style.zIndex=320;map.getPane('rasterPane').style.pointerEvents='none';
  map.createPane('yieldPane');map.getPane('yieldPane').style.zIndex=390;
  map.createPane('boundaryPane');map.getPane('boundaryPane').style.zIndex=430;map.getPane('boundaryPane').style.pointerEvents='none';
  map.createPane('selectionPane');map.getPane('selectionPane').style.zIndex=500;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,opacity:.72,attribution:'© OpenStreetMap'}).addTo(map);
  const countyLayer=L.layerGroup({pane:'boundaryPane'}).addTo(map),selectionLayer=L.layerGroup({pane:'selectionPane'}).addTo(map);
  const spatial=window.NBSpatial(map),frames=window.NBFrameBuffer(8);
  let playEpoch=0,playTimer=null;
  const rasterOpacity=()=>Number($('rasterOpacity').value)/100;
  const iso=d=>d.toISOString().slice(0,10),dotDate=d=>iso(d).replaceAll('-','.'),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const fmt=(v,d=1)=>Number.isFinite(v)?Number(v).toFixed(d):'—',signed=v=>`${v>=0?'+':''}${Number(v).toLocaleString()}`;
  const source=id=>window.NB_SOURCES?.[id]||null,evidenceTag=(classification,text='')=>`<span class="evidence ${classification.toLowerCase()}">${classification}</span>${text}`;
  const setText=(id,value)=>{const el=$(id);if(el)el.textContent=value};
  const setHTML=(id,value)=>{const el=$(id);if(el)el.innerHTML=value};
  const selectedArea=()=>STUDY_AREAS.find(r=>r.id===state.selected)||STUDY_AREAS[0];
  const parseDay=value=>new Date(`${value}T12:00:00Z`);
  const modelRegion=area=>state.model?.regions?.[area.id]||null;
  const modelRow=(area,date=state.date)=>modelRegion(area)?.dates?.[iso(date)]||null;

  async function loadJson(path,label){const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw Error(`${label} ${response.status}`);return response.json()}
  async function loadInputs(){
    const [baseline,build,catalog,model,satellite,weighted]=await Promise.all([
      loadJson('assets/data/official-baseline.json','official baseline'),loadJson('assets/data/build-manifest.json','build manifest'),loadJson('assets/data/temporal-layer-catalog.json','temporal layer catalog'),loadJson('assets/data/gisit-outlook-2026.json','GISit model outlook'),loadJson('assets/data/satellite-signals-2026.json','satellite evidence series'),loadJson('assets/data/crop-evidence/crop-weighted-evidence.json','crop-weighted evidence')
    ]);
    state.baseline=baseline;state.build=build;state.catalog=catalog;state.model=model;state.satellite=satellite;state.weighted=weighted;
    state.start=parseDay(model.analysis_start);state.end=parseDay(model.analysis_end);state.date=new Date(state.end);
    $('timeSlider').max=Math.round((state.end-state.start)/DAY);$('timeSlider').step=1;
    setText('buildStatus',`Data build ${build.data_build_id} · model ${model.model.version} · ${model.model.training_state_years} calibration seasons`);syncSliderFromDate();
  }
  function officialAsOf(stateName,date){
    const rows=state.baseline?.forecast_history?.[stateName]||[],cut=iso(date),available=rows.filter(x=>x.issue_date<=cut);
    const latest=metric=>available.filter(x=>x.metric===metric).sort((a,b)=>a.issue_date.localeCompare(b.issue_date)).at(-1)||null;
    return {planted:latest('planted_acres'),harvested:latest('harvested_acres'),yield:latest('yield_lb_ac'),production:latest('production_cwt')};
  }
  function acreageRevision(stateName,date){
    const cut=iso(date),rows=(state.baseline?.forecast_history?.[stateName]||[]).filter(x=>x.metric==='planted_acres'&&x.issue_date<=cut).sort((a,b)=>a.issue_date.localeCompare(b.issue_date));
    if(!rows.length)return null;const latest=rows.at(-1),previous=rows.at(-2);return {latest,previous,delta:previous?latest.value-previous.value:null};
  }
  async function boundaryGeo(layer,where,outFields){
    const params=new URLSearchParams({where,outFields,returnGeometry:'true',outSR:'4326',f:'geojson'}),response=await fetch(`https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/${layer}/query?${params}`);
    if(!response.ok)throw Error(`Census TIGERweb geometry ${response.status}`);return response.json();
  }
  async function loadBoundaries(){
    const codes=Object.values(STATES).map(code=>`'${code}'`).join(','),counties=await boundaryGeo(1,`STATE IN (${codes})`,'NAME,BASENAME,GEOID,STATE');
    L.geoJSON(counties,{pane:'boundaryPane',interactive:false,style:{fill:false,fillOpacity:0,color:'#455b50',weight:.65,opacity:.58}}).addTo(countyLayer);setText('countyStatus',`${counties.features?.length||0} county boundaries · reference only`);
  }
  function drawSelection(){selectionLayer.clearLayers();const area=selectedArea();L.circleMarker(area.center,{pane:'selectionPane',radius:7,color:'#fff',weight:2.5,fillColor:'#173f5a',fillOpacity:1}).bindTooltip(`${area.name} · selected analytical area`,{direction:'top'}).addTo(selectionLayer)}
  function dateFromSlider(){return new Date(state.start.getTime()+Number($('timeSlider').value)*DAY)}
  function syncSliderFromDate(){if(state.date)$('timeSlider').value=Math.round((state.date-state.start)/DAY)}
  function viewport(){
    const b=map.getBounds(),[[south,west],[north,east]]=state.catalog.study_bounds;
    const bounds=[[Math.max(south,b.getSouth()),Math.max(west,b.getWest())],[Math.min(north,b.getNorth()),Math.min(east,b.getEast())]];
    const size=map.getSize(),scale=Math.min(window.devicePixelRatio||1,2);
    return {bounds,width:Math.min(2560,Math.round(size.x*scale)),height:Math.min(1600,Math.round(size.y*scale))};
  }
  function wmsUrl(layer,date,request='GetMap',view=viewport()){
    const layerName=layer.layer_template.replace('{date}',dotDate(date)),url=new URL(state.catalog.wms_endpoint),params={SERVICE:'WMS',VERSION:'1.1.1',REQUEST:request,MAP:layer.map_file,LAYERS:layerName,LAYER:layerName,FORMAT:'image/png'};
    Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,value));
    if(request==='GetMap'){const [[south,west],[north,east]]=view.bounds;Object.entries({TRANSPARENT:'true',SRS:'EPSG:4326',BBOX:`${west},${south},${east},${north}`,WIDTH:String(view.width),HEIGHT:String(view.height)}).forEach(([key,value])=>url.searchParams.set(key,value))}return url.toString();
  }
  function rasterLegend(layer,date){setHTML('mapLegend',`<b>${layer.label}</b><div class="legendDate">VALID ${iso(date)} · MODELED SOURCE GRID</div><img class="legendScale" src="${wmsUrl(layer,date,'GetLegendGraphic')}" alt="${layer.label} color scale"><small>${layer.source}<br>${layer.source_role}<br>${state.mode==='ndvi'?'Source NDVI classes retained; zoom adds display detail, not new measurements.':'Native SMAP grid: 9 km. Purple 10 m crop polygons are separate geography, not 10 m soil measurements.'}<br>${state.catalog.coverage_note}</small>`)}
  function clearDataLayers(){if(state.raster){map.removeLayer(state.raster);state.raster=null}if(state.yieldLayer){map.removeLayer(state.yieldLayer);state.yieldLayer=null}}
  async function renderRaster(token,date){
    const mode=state.mode,layer=state.catalog.layers[mode],view=viewport();
    if(view.bounds[0][0]>=view.bounds[1][0]||view.bounds[0][1]>=view.bounds[1][1])return false;
    const url=wmsUrl(layer,date,'GetMap',view);
    setText('playbackStatus',`Buffering ${iso(date)} · displayed date stays unchanged until ready`);
    try{await frames.load(url)}catch(error){
      if(token===state.request){stopPlayback();setText('playbackStatus',`${iso(date)} unavailable · previous frame retained. ${error.message}`);syncSliderFromDate()}
      return false;
    }
    if(token!==state.request||mode!==state.mode)return false;
    const overlay=L.imageOverlay(url,view.bounds,{pane:'rasterPane',opacity:0,interactive:false,className:'temporal-raster',alt:`${layer.label} for ${iso(date)}`});
    const loaded=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),20000);const finish=ok=>{clearTimeout(timer);resolve(ok)};overlay.once('load',()=>finish(true));overlay.once('error',()=>finish(false));overlay.addTo(map)});
    if(!loaded||token!==state.request){map.removeLayer(overlay);if(!loaded&&token===state.request){stopPlayback();setText('playbackStatus','Frame display failed · previous image and date retained')}return false}
    const old=state.raster;state.raster=overlay;
    if(state.yieldLayer){map.removeLayer(state.yieldLayer);state.yieldLayer=null}
    overlay.setOpacity(rasterOpacity());if(old)map.removeLayer(old);
    rasterLegend(layer,date);setText('layerBadge',`MODELED · ${iso(date)}`);
    setText('status',`${layer.label} · source valid ${iso(date)} · viewport rendering; native source detail retained.`);
    // Prefetch only the next two actual daily source frames in this viewport.
    for(let offset=1;offset<=2;offset++){const next=new Date(date.getTime()+offset*DAY);if(next<=state.end)frames.load(wmsUrl(layer,next,'GetMap',view)).catch(()=>{})}
    return true;
  }
  function yieldColor(value){if(!Number.isFinite(value))return '#b9c0bc';const t=clamp((value-1600)/1100,0,1),a=t<.5?[205,108,70]:[241,207,99],b=t<.5?[241,207,99]:[49,116,81],u=t<.5?t*2:(t-.5)*2;return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*u)).join(',')})`}
  function renderYield(){
    clearDataLayers();state.yieldLayer=L.layerGroup({pane:'yieldPane'});let released=0;
    for(const area of STUDY_AREAS){
      const row=modelRow(area),value=row?.yield_lb_ac,color=yieldColor(value),selected=area.id===state.selected;if(Number.isFinite(value))released++;
      const circle=L.circleMarker(area.center,{pane:'yieldPane',radius:selected?10:7,color:selected?'#173f5a':'#fff',weight:selected?3:1.5,opacity:.98,fill:true,fillColor:color,fillOpacity:Number.isFinite(value)?.83:.55});
      const body=Number.isFinite(value)?`<b>${area.name}</b><br>GISit: ${value.toLocaleString()} lb/ac<br>80% empirical error band: ${row.yield_interval_lb_ac[0].toLocaleString()}–${row.yield_interval_lb_ac[1].toLocaleString()}<br>Stage: ${row.stage}<br>USDA current yield is not a predictor.`:`<b>${area.name}</b><br>${row?.eligibility||'No model state'}`;
      circle.bindTooltip(body,{sticky:true}).on('click',()=>selectArea(area.id)).addTo(state.yieldLayer);
    }
    state.yieldLayer.addTo(map);setHTML('mapLegend','<b>Experimental pinto-basis yield at analytical points</b><div class="legendDate">SELECTED-DATE MODEL · NOT USDA YIELD</div><div class="yieldRamp"><span>1,600</span><span>2,150</span><span>2,700 lb/ac</span></div><div><span class="sw unknown"></span>Withheld by validation/data gate</div><small>Point estimates are not a field-scale yield surface. Purple polygons show historical crop identity only. Yield uses weather/GDD through the selected date plus historical-median completion.</small>');setText('layerBadge',`GISIT MODEL · ${iso(state.date)}`);setText('status',`${released} of 7 experimental point outlooks released for ${iso(state.date)}; spatially resolved yield remains under development.`);
  }
  function satelliteAt(area,date){const rows=state.satellite?.areas?.[area.id]?.dates||{},keys=Object.keys(rows).filter(key=>key<=iso(date)).sort();if(!keys.length)return null;const requested=keys.at(-1);return {requested,...rows[requested]}}
  function vegetationSignal(satellite,stage){
    const change=satellite?.ndvi_change_encoded;if(!Number.isFinite(change))return {label:'NO TREND YET',text:'A prior weekly checkpoint is required.'};if(change===0)return {label:'FLAT',text:'Encoded NDVI is unchanged from the prior weekly checkpoint.'};
    const direction=change>0?'RISING':'DECLINING',mature=/Maturity|Harvest/.test(stage||'');return {label:direction,text:`Encoded NDVI is ${direction.toLowerCase()} from the prior weekly checkpoint${mature&&change<0?' during the modeled maturity window':''}.`};
  }
  function potentialClass(region,row){if(!Number.isFinite(row?.yield_lb_ac))return 'NOT RELEASED';const d=region.historical_yield_distribution_lb_ac;return row.yield_lb_ac>d.q75?'ABOVE-TYPICAL POTENTIAL':row.yield_lb_ac<d.q25?'BELOW-TYPICAL POTENTIAL':'TYPICAL-RANGE POTENTIAL'}
  function evidenceSynthesis(released,anomaly,ndviChange,potential){
    if(!released||!Number.isFinite(anomaly)||!Number.isFinite(ndviChange))return 'NOT RELEASED';
    if(anomaly>=0&&ndviChange>=0)return `SUPPORTED · ${potential}`;
    if(anomaly<0&&ndviChange<0)return `WATCH · ${potential}`;
    return `MIXED · ${potential}`;
  }
  function updateSourcePanel(){const ids=['nass','openmeteo','smap','cropcasma','cdl','noaa','ssurgo','hls','usdm','irrigation'];setHTML('sourceList',ids.map(id=>{const item=source(id);return `<div class="sourceRow"><div><b>${item.name}</b><small>${item.role}</small></div><span>${item.classification}</span></div>`}).join(''))}
  function updateCalendar(row){
    const phases=['Planting','Emergence','Vegetative','Flowering','Pod Set','Seed Fill','Maturity','Harvest'],stageIndex={'Pre-planting':0,'Establishment':1,'Vegetative':2,'Flowering / pod development':3,'Pod fill':5,'Maturity / seed maturation':6,'Harvest readiness':7}[row?.stage]??0;
    setHTML('calendar',phases.map((phase,index)=>`<div class="phase ${index<stageIndex?'past':index===stageIndex?'current':'future'}"><b>${phase}</b><span>${index===stageIndex?`${row?.observed_gdd_f||0} base-50°F GDD · selected-date model`:'Thermal stage boundary'}</span><em>${evidenceTag(index<=stageIndex?'DERIVED':'UNKNOWN')}</em></div>`).join(''));
  }
  function productionScenario(area,date){
    const official=officialAsOf(area.state,date),acres=official.harvested||official.planted;
    return {value:null,text:`Production requires validated crop-area weights, matching yield/acreage market classes, and propagated uncertainty. ${acres?`Latest USDA ${acres.metric==='harvested_acres'?'expected-harvested':'planted'} acreage: ${acres.value.toLocaleString()} acres, released ${acres.issue_date}.`:'No date-correct USDA acreage available.'}`};
  }
  function updateWeightedEvidence(area){
    const date=iso(state.date);setText('weightedAsOf',`Selected date ${date} · historical 2025 crop footprint`);
    const percent=x=>Number.isFinite(x)?`${(x*100).toFixed(1)}%`:'Unavailable';
    setHTML('weightedRows',Object.values(state.weighted.states).map(record=>{
      const checkpoint=Object.keys(record.dates).filter(key=>key<=date).sort().at(-1),row=record.dates[checkpoint];
      if(!row)return `<tr><th scope="row">${record.state}</th><td>${Math.round(record.mapped_acres).toLocaleString()}</td><td colspan="3">No checkpoint on or before this date</td></tr>`;
      const water=row.smap_anomaly,vegetation=row.ndvi;
      return `<tr class="${record.state===area.state?'selectedState':''}"><th scope="row">${record.state}</th><td>${Math.round(record.mapped_acres).toLocaleString()}</td><td>${fmt(water.mean,3)}<small>${percent(water.valid_crop_area_fraction)} crop-area coverage</small></td><td>${percent(vegetation.valid_crop_area_fraction)}<small>${vegetation.valid_source_cells.toLocaleString()} source cells with crop</small></td><td><small>Moisture ${water.valid_date}<br>Vegetation ${vegetation.valid_date}</small></td></tr>`;
    }).join(''));
  }
  function updateTruthPanel(area){
    updateWeightedEvidence(area);
    const region=modelRegion(area),row=modelRow(area),sat=satelliteAt(area,state.date),official=officialAsOf(area.state,state.date),revision=acreageRevision(area.state,state.date),vegetation=vegetationSignal(sat,row?.stage),potential=potentialClass(region,row),production=productionScenario(area,state.date),released=Number.isFinite(row?.yield_lb_ac);
    setText('asOfLabel',iso(state.date));setText('sliderDate',iso(state.date));setText('sliderStage',row?.stage||'Model state unavailable');setText('regionName',area.name);setText('stageTag',`MODELED STAGE: ${String(row?.stage||'UNKNOWN').toUpperCase()}`);updateCalendar(row);
    if(released){
      const [low,high]=row.yield_interval_lb_ac,change=row.change_vs_historical_median_lb_ac;setText('plainAnswer',`${area.name}: GISit projects ${row.yield_lb_ac.toLocaleString()} lb/ac as of ${iso(state.date)}.`);setText('narrative',`${potential}. The estimate uses selected-date weather, a base-50°F GDD stage model, and historical-median completion of the unobserved season. It was calibrated against final NASS pinto outcomes; no current USDA yield forecast enters the equation.`);setText('yieldNow',`${row.yield_lb_ac.toLocaleString()} lb/ac`);setText('yieldRange',`${low.toLocaleString()}–${high.toLocaleString()} lb/ac · empirical p80 error band`);setText('yieldDelta',`${signed(change)} lb/ac vs ${row.historical_median_lb_ac.toLocaleString()} historical state median`);setText('regionYield',`${row.yield_lb_ac.toLocaleString()} lb/ac`);setText('regionYieldWhy',`ESTIMATED by ${state.model.model.id}; selected-date hindcast MAE ${row.hindcast_mae_lb_ac} vs ${row.baseline_mae_lb_ac} lb/ac baseline.`);setText('yieldVsBase',`${signed(change)} lb/ac`);setText('confidence','BACKTEST GATE PASS');setText('confidenceWhy',`Leave-one-year-out MAE ${row.hindcast_mae_lb_ac} lb/ac; n=${state.model.model.training_state_years} state-years. No confidence percentage invented.`);
    }else{
      setText('plainAnswer',`${area.name}: GISit yield is not released for ${iso(state.date)}.`);setText('narrative',row?.eligibility||'The selected-date evidence gate is incomplete.');setText('yieldNow','WITHHELD');setText('yieldRange','No operational number outside the validation gate');setText('yieldDelta',row?.eligibility||'Model unavailable');setText('regionYield','WITHHELD');setText('regionYieldWhy',row?.eligibility||'Required model state unavailable.');setText('yieldVsBase','—');setText('confidence','GATE NOT PASSED');setText('confidenceWhy',`Selected-date hindcast MAE ${row?.hindcast_mae_lb_ac??'—'} vs ${row?.baseline_mae_lb_ac??'—'} lb/ac baseline.`);
    }
    const anomaly=sat?.smap_anomaly,soilLabel=Number.isFinite(anomaly)?(anomaly>=0?'WETTER THAN CLIMATOLOGY':'DRIER THAN CLIMATOLOGY'):'NO SAMPLE';setText('soilState',soilLabel);setText('soilValue',Number.isFinite(anomaly)?`SMAP root-zone anomaly ${fmt(anomaly,3)} · source valid ${sat.smap_anomaly_valid_date}`:'Weekly SMAP sample unavailable');setText('healthState',vegetation.label);setText('healthWhy',sat?`${vegetation.text} Source valid ${sat.ndvi_valid_date}; generalized regional neighborhood.`:vegetation.text);
    const twoFamilies=released&&Number.isFinite(anomaly)&&Number.isFinite(sat?.ndvi_change_encoded),synthesis=evidenceSynthesis(released,anomaly,sat?.ndvi_change_encoded,potential);setText('condition',synthesis);setText('conditionWhy',twoFamilies?`Two-family synthesis at ${sat.requested}: ${soilLabel.toLowerCase()} + ${vegetation.label.toLowerCase()}; yield class ${potential.toLowerCase()}. Not a field measurement.`:'Requires a released yield outlook plus SMAP and NDVI checkpoints.');
    setText('plainEnglish',released?`This is GISit's own in-season estimate. USDA yield remains outside the model. ${revision?`${revision.latest.value.toLocaleString()} planted acres is the latest date-correct USDA acreage input${revision.previous?`, a ${signed(revision.delta)} revision from ${revision.previous.issue_date}`:''}.`:'No date-correct USDA acreage is available for a production scenario.'}`:'The website is withholding the estimate because the selected-date validation or history gate does not pass.');
    setText('regionSoil',soilLabel);setText('regionSoilWhy',Number.isFinite(anomaly)?`MODELED Crop-CASMA / NASA SMAP L4 regional median; anomaly ${fmt(anomaly,3)}, valid ${sat.smap_anomaly_valid_date}.`:'No governed satellite checkpoint.');setText('regionWater',row?`${fmt(row.observed_precip_mm,0)} / ${fmt(row.observed_et0_mm,0)} mm`:'—');setText('regionWaterWhy','MODELED selected-date precipitation / reference ET₀ since modeled thermal onset; irrigation application is not observed.');setText('regionHeat',row?`${row.observed_gdd_f.toLocaleString()} GDD`:'—');setText('regionHeatWhy',row?`DERIVED base-50°F GDD since ${row.modeled_thermal_onset}; onset ${row.onset_status}.`:'No stage row.');setText('seasonRain',row?`${fmt(row.observed_precip_mm,0)} mm`:'—');setText('seasonRainWhy','Observed portion of the modeled season at the analytical centroid; modeled reanalysis field.');setText('productionNow',production.value?`${production.value.toLocaleString()} cwt`:'WITHHELD');setText('productionWhy',production.text);
    const usdaComparison=official.yield?'Final USDA outcome is pending. A contemporaneous USDA forecast exists but is neither a predictor nor scored as truth.':'Final USDA outcome is pending; nothing is backfilled.';
    setHTML('drivers',[`<div class="driver pos"><b>GISit yield model</b><br>${released?evidenceTag('ESTIMATED',` ${row.yield_lb_ac.toLocaleString()} lb/ac; p80 band ${row.yield_interval_lb_ac[0].toLocaleString()}–${row.yield_interval_lb_ac[1].toLocaleString()}.`):evidenceTag('UNKNOWN',` ${row?.eligibility||'not available'}`)}</div>`,`<div class="driver ${Number.isFinite(anomaly)&&anomaly<0?'neg':'pos'}"><b>Root-zone water</b><br>${Number.isFinite(anomaly)?evidenceTag('MODELED',` SMAP anomaly ${fmt(anomaly,3)}; valid ${sat.smap_anomaly_valid_date}.`):evidenceTag('UNKNOWN')}</div>`,`<div class="driver"><b>Vegetation direction</b><br>${sat?evidenceTag('MODELED',` ${vegetation.label}; NDVI source valid ${sat.ndvi_valid_date}.`):evidenceTag('UNKNOWN')}</div>`,`<div class="driver"><b>USDA outcome comparison</b><br>${evidenceTag(official.yield?'OBSERVED':'UNKNOWN',` ${usdaComparison}`)}</div>`].join(''));
    setText('storyTitle',`${row?.stage||'Unknown stage'} · ${area.name}`);setText('storyText',row?`Modeled thermal onset: ${row.modeled_thermal_onset} (${row.onset_status}). Through ${iso(state.date)}: ${row.observed_gdd_f.toLocaleString()} base-50°F GDD, ${fmt(row.observed_precip_mm,0)} mm precipitation and ${fmt(row.observed_climatic_deficit_mm,0)} mm climatic deficit. Latest corroborating satellite checkpoint: ${sat?.requested||'unavailable'}.`:'Model state unavailable.');
  }
  async function refresh(date=state.date){
    if(!state.catalog||!state.model||!date)return false;
    const token=++state.request,area=selectedArea();
    if(state.mode!=='yield'&&!await renderRaster(token,date))return false;
    if(token!==state.request)return false;
    state.date=date;syncSliderFromDate();drawSelection();
    if(state.mode==='yield')renderYield();
    updateTruthPanel(area);spatial.update(iso(date));spatial.setMode(state.mode);
    setText('playbackStatus',`${Math.round((date-state.start)/DAY)+1} / ${Math.round((state.end-state.start)/DAY)+1} daily frames · ${state.mode==='yield'?'daily model state':'source image'} · no temporal interpolation`);
    return true;
  }
  function stopPlayback(){state.playing=false;playEpoch++;++state.request;clearTimeout(playTimer);$('playBtn').textContent='▶ PLAY'}
  function selectArea(id){stopPlayback();state.selected=id;$('region').value=id;map.flyTo(selectedArea().center,9,{duration:.6});refresh()}
  function setMode(mode,button){stopPlayback();state.mode=mode;document.querySelectorAll('.mapactions button').forEach(x=>x.classList.remove('on'));$(button).classList.add('on');refresh()}
  $('region').innerHTML=STUDY_AREAS.map(area=>`<option value="${area.id}">${area.name}</option>`).join('');$('region').addEventListener('change',event=>selectArea(event.target.value));
  let sliderTimer;
  $('timeSlider').addEventListener('input',()=>{stopPlayback();++state.request;clearTimeout(sliderTimer);const date=dateFromSlider();setText('playbackStatus',`Selected ${iso(date)} · preparing frame`);sliderTimer=setTimeout(()=>refresh(date),80)});
  $('timeSlider').addEventListener('change',()=>{clearTimeout(sliderTimer);refresh(dateFromSlider())});
  $('playBtn').addEventListener('click',()=>{
    if(state.playing){stopPlayback();return}
    if(!state.date)return;
    clearTimeout(sliderTimer);state.playing=true;$('playBtn').textContent='■ STOP';const epoch=++playEpoch;
    const tick=async()=>{
      if(!state.playing||epoch!==playEpoch)return;
      const started=performance.now();let next=new Date(state.date.getTime()+DAY);if(next>state.end)next=new Date(state.start);
      const ok=await refresh(next);if(!ok||!state.playing||epoch!==playEpoch)return;
      playTimer=setTimeout(tick,Math.max(0,900/Number($('playSpeed').value)-(performance.now()-started)));
    };tick();
  });
  $('rasterOpacity').addEventListener('input',()=>{if(state.raster)state.raster.setOpacity(rasterOpacity());setText('opacityValue',`${$('rasterOpacity').value}%`)});
  $('cropDetail').addEventListener('click',()=>{stopPlayback();map.flyTo(selectedArea().center,11,{duration:.7})});
  let viewTimer;
  map.on('moveend',()=>{clearTimeout(viewTimer);if(state.mode!=='yield'){stopPlayback();viewTimer=setTimeout(()=>refresh(),100)}});
  $('yieldBtn').addEventListener('click',()=>setMode('yield','yieldBtn'));$('moistureBtn').addEventListener('click',()=>setMode('moisture','moistureBtn'));$('healthBtn').addEventListener('click',()=>setMode('anomaly','healthBtn'));$('satBtn').addEventListener('click',()=>setMode('ndvi','satBtn'));
  updateSourcePanel();loadBoundaries().catch(()=>setText('countyStatus','Census boundary service unavailable'));
  loadInputs().then(async()=>{map.fitBounds(state.catalog.study_bounds,{padding:[6,6]});await refresh();setText('runtimeStatus','Experimental model and evidence loaded.');spatial.start()}).catch(error=>{console.error(error);setText('runtimeStatus','Required model inputs unavailable.');setText('status','Required governed inputs could not be loaded.')});
})();
