'use strict';
const $=id=>document.getElementById(id);
const BASE_YIELD=2300, PLANT='2026-06-01', TODAY='2026-09-10';
const CORE=['Scotts Bluff','Box Butte','Morrill','Sheridan','Dundy'];
const CORE_SET=new Set(CORE);
const SAMPLE_MAX=8;
const phases=[
  ['Planting',0,10],['Emergence',10,24],['Vegetative',24,45],['Flowering',45,58],
  ['Pod set',58,70],['Seed fill',70,88],['Maturity',88,105],['Harvest',105,116]
];
const map=L.map('map',{zoomControl:true}).setView([41.65,-103.05],7);
const osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:18}).addTo(map);
const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Esri World Imagery',maxZoom:18});
let counties=null, mode='moisture', selected='Scotts Bluff', asOf=new Date(TODAY+'T12:00:00Z'), play=null;
let models={}, features={}, layersByName={};

const iso=d=>d.toISOString().slice(0,10);
const dayMs=864e5;
const days=(a,b)=>Math.round((b-a)/dayMs);
const addDays=(d,n)=>new Date(d.getTime()+n*dayMs);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sum=a=>(a||[]).filter(Number.isFinite).reduce((x,y)=>x+y,0);
const mean=a=>{const v=(a||[]).filter(Number.isFinite);return v.length?sum(v)/v.length:null};
const fmt=(v,d=0)=>Number.isFinite(v)?v.toFixed(d):'—';
const dateIndex=d=>Math.max(0,days(new Date(PLANT+'T00:00:00Z'),d));

function pointInRing(lon,lat,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    const hit=((yi>lat)!=(yj>lat))&&(lon<(xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi);
    if(hit) inside=!inside;
  }
  return inside;
}
function inGeom(lon,lat,g){
  if(!g)return false;
  if(g.type==='Polygon')return pointInRing(lon,lat,g.coordinates[0]);
  if(g.type==='MultiPolygon')return g.coordinates.some(p=>pointInRing(lon,lat,p[0]));
  return false;
}
function geomBounds(g){
  const xs=[],ys=[];
  (function walk(c){if(typeof c[0]==='number'){xs.push(c[0]);ys.push(c[1]);}else c.forEach(walk)})(g.coordinates);
  return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}
function sampleFeature(f,max=SAMPLE_MAX){
  const g=f.geometry,b=geomBounds(g),w=b[2]-b[0],h=b[3]-b[1];
  const spacing=Math.max(.08,Math.min(.18,Math.max(w,h)/4));
  const pts=[];
  for(let y=b[1]+spacing/2;y<=b[3];y+=spacing){
    for(let x=b[0]+spacing/2;x<=b[2];x+=spacing){
      if(inGeom(x,y,g))pts.push([+y.toFixed(4),+x.toFixed(4)]);
    }
  }
  if(!pts.length){
    const c=[(b[1]+b[3])/2,(b[0]+b[2])/2];
    if(inGeom(c[1],c[0],g))pts.push(c);
  }
  if(pts.length<=max)return pts;
  const out=[],stride=pts.length/max;
  for(let i=0;i<max;i++)out.push(pts[Math.floor(i*stride)]);
  return out;
}
function stageFor(date){
  const d=dateIndex(date), p=phases.find(x=>d>=x[1]&&d<x[2]);
  return p?p[0]:(d<0?'Pre-plant':'Harvest');
}
function cadenceFor(date){
  const st=stageFor(date);
  if(['Flowering','Pod set','Seed fill'].includes(st)) return 2;
  if(['Planting','Emergence','Vegetative','Maturity'].includes(st)) return 5;
  return 14;
}
function stageWeight(stage){
  return {'Planting':.2,'Emergence':.35,'Vegetative':.55,'Flowering':1,'Pod set':1,'Seed fill':.9,'Maturity':.35,'Harvest':.15}[stage]||.2;
}
function dailySoil(raw){
  const h=raw.hourly||{}, dates=h.time||[], s1=h.soil_moisture_7_to_28cm||[], s2=h.soil_moisture_28_to_100cm||[];
  const by={};
  dates.forEach((t,i)=>{
    const d=t.slice(0,10); by[d]=by[d]||{a:[],b:[]};
    if(Number.isFinite(s1[i]))by[d].a.push(s1[i]);
    if(Number.isFinite(s2[i]))by[d].b.push(s2[i]);
  });
  return Object.fromEntries(Object.entries(by).map(([d,v])=>[d,{shallow:mean(v.a),deep:mean(v.b)}]));
}
async function fetchSamples(points){
  const p=new URLSearchParams({
    latitude:points.map(x=>x[0].toFixed(4)).join(','),
    longitude:points.map(x=>x[1].toFixed(4)).join(','),
    start_date:PLANT,end_date:TODAY,timezone:'UTC',
    hourly:'soil_moisture_7_to_28cm,soil_moisture_28_to_100cm',
    daily:'precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min'
  });
  const r=await fetch('https://archive-api.open-meteo.com/v1/archive?'+p);
  if(!r.ok)throw new Error('Open-Meteo archive '+r.status);
  const raw=await r.json(), list=Array.isArray(raw)?raw:[raw];
  return list.map(x=>({daily:x.daily||{},soil:dailySoil(x)}));
}
function aggregateRegion(samplePayloads){
  const dates=[];
  for(let d=new Date(PLANT+'T00:00:00Z'),end=new Date(TODAY+'T00:00:00Z');d<=end;d=addDays(d,1))dates.push(iso(d));
  const series={};
  dates.forEach(ds=>{
    const shallow=[],deep=[],rain=[],et=[],tx=[],tn=[];
    samplePayloads.forEach(s=>{
      const sm=s.soil[ds]; if(sm){shallow.push(sm.shallow);deep.push(sm.deep);}
      const i=(s.daily.time||[]).indexOf(ds);
      if(i>=0){
        rain.push(Number(s.daily.precipitation_sum?.[i]));
        et.push(Number(s.daily.et0_fao_evapotranspiration?.[i]));
        tx.push(Number(s.daily.temperature_2m_max?.[i]));
        tn.push(Number(s.daily.temperature_2m_min?.[i]));
      }
    });
    const sh=mean(shallow), dp=mean(deep);
    series[ds]={
      shallow:sh,deep:dp,
      root:(Number.isFinite(sh)&&Number.isFinite(dp))?(.35*sh+.65*dp):(Number.isFinite(dp)?dp:sh),
      rain:mean(rain),et:mean(et),tx:mean(tx),tn:mean(tn)
    };
  });
  return series;
}
function through(series,date){
  const end=iso(date);
  return Object.keys(series).filter(d=>d<=end).sort().map(d=>({date:d,...series[d]}));
}
function regionEstimate(model,date){
  const rows=through(model.series,date), stage=stageFor(date), sw=stageWeight(stage);
  if(!rows.length)return null;
  const last30=rows.slice(-30), root=rows.at(-1)?.root, shallow=rows.at(-1)?.shallow, deep=rows.at(-1)?.deep;
  const rain30=sum(last30.map(x=>x.rain)),et30=sum(last30.map(x=>x.et)),b30=rain30-et30;
  const rainSeason=sum(rows.map(x=>x.rain)), hot=rows.filter(x=>Number.isFinite(x.tx)&&x.tx>=35).length;
  const heat=rows.filter(x=>Number.isFinite(x.tx)&&x.tx>=32).length, frost=rows.filter(x=>Number.isFinite(x.tn)&&x.tn<=1).length;
  const fWater=clamp(b30/220,-.14,.06)*sw;
  let fSoil=0;
  if(Number.isFinite(root)){
    if(root<.16)fSoil=-.10*sw;
    else if(root<.20)fSoil=-.06*sw;
    else if(root<.24)fSoil=-.025*sw;
    else if(root>.38)fSoil=-.02*sw;
    else if(root>=.27&&root<=.34)fSoil=.02*sw;
  }
  const fHeat=-Math.min(.12,(hot*.008+Math.max(0,heat-hot)*.0025))*sw;
  const fFrost=-Math.min(.12,frost*.02)*sw;
  const adj=clamp(fWater+fSoil+fHeat+fFrost,-.24,.10);
  const y=Math.round(BASE_YIELD*(1+adj)/10)*10, unc=Math.round((140+(1-sw)*100)/10)*10;
  return {stage,root,shallow,deep,rain30,et30,b30,rainSeason,hot,heat,frost,adj,yield:y,lo:y-unc,hi:y+unc,
    drivers:[
      {name:'root-zone soil moisture',impact:fSoil,text:Number.isFinite(root)?fmt(root,3)+' m³/m³ polygon average':'soil moisture unavailable'},
      {name:'30-day water balance',impact:fWater,text:fmt(rain30,0)+' mm rain vs '+fmt(et30,0)+' mm ET₀'},
      {name:'heat exposure',impact:fHeat,text:hot+' days ≥35°C; '+heat+' days ≥32°C'},
      {name:'cold exposure',impact:fFrost,text:frost+' days ≤1°C'}
    ]};
}
function conditionFor(e){
  if(!e)return 'NO DATA';
  if(e.adj<=-.12)return 'POOR / STRESSED';
  if(e.adj<=-.06)return 'BELOW NORMAL';
  if(e.adj<.03)return 'NEAR NORMAL';
  return 'ABOVE NORMAL';
}
function moistureLabel(v){
  if(!Number.isFinite(v))return 'NO DATA';
  if(v<.16)return 'VERY DRY';
  if(v<.20)return 'DRY';
  if(v<.24)return 'BELOW OPTIMAL';
  if(v<=.34)return 'ADEQUATE';
  if(v<=.38)return 'WET';
  return 'VERY WET';
}
function moistureColor(v){
  if(!Number.isFinite(v))return '#d8ddd9';
  if(v<.16)return '#8c3f2f';
  if(v<.20)return '#c76a3b';
  if(v<.24)return '#d9a65a';
  if(v<=.30)return '#a4b96e';
  if(v<=.34)return '#6f9f79';
  if(v<=.38)return '#6095b2';
  return '#315f8d';
}
function yieldColor(adj){
  const p=adj*100;
  return p<=-12?'#8c3f2f':p<=-8?'#bc5a3f':p<=-4?'#d39455':p<2?'#c7b96d':p<5?'#7ea06f':'#4d865f';
}
function healthColor(e){
  const c=conditionFor(e);
  return c==='POOR / STRESSED'?'#934438':c==='BELOW NORMAL'?'#c56e48':c==='NEAR NORMAL'?'#c8b96e':'#568764';
}
function stateEstimate(date){
  const a=CORE.map(n=>models[n]?.series?regionEstimate(models[n],date):null).filter(Boolean);
  if(!a.length)return null;
  return {
    stage:stageFor(date),yield:Math.round(mean(a.map(x=>x.yield))/10)*10,
    lo:Math.round(mean(a.map(x=>x.lo))/10)*10,hi:Math.round(mean(a.map(x=>x.hi))/10)*10,
    adj:mean(a.map(x=>x.adj)),root:mean(a.map(x=>x.root)),b30:mean(a.map(x=>x.b30)),hot:Math.round(mean(a.map(x=>x.hot))||0)
  };
}
function popupHtml(name,e){
  if(!e)return `<b>${name} County</b><br>Model evidence unavailable.`;
  return `<div style="min-width:225px;font:12px system-ui;line-height:1.45">
    <b>${name} County</b><br><span style="color:#64748b">${iso(asOf)} · ${e.stage}</span>
    <hr style="border:0;border-top:1px solid #ddd">
    <b>Crop condition:</b> ${conditionFor(e)}<br>
    <b>Root-zone soil:</b> ${fmt(e.root,3)} m³/m³ (${moistureLabel(e.root)})<br>
    <b>7–28 cm:</b> ${fmt(e.shallow,3)} · <b>28–100 cm:</b> ${fmt(e.deep,3)}<br>
    <b>Projected yield:</b> ${e.yield.toLocaleString()} lb/ac (${e.adj>=0?'+':''}${fmt(e.adj*100,1)}%)<br>
    <b>Range:</b> ${e.lo.toLocaleString()}–${e.hi.toLocaleString()} lb/ac<br>
    <b>Samples:</b> ${models[name]?.samples?.length||0} points inside polygon
    <div style="margin-top:5px;color:#7a4d16">ESTIMATED / MODELED · county is an analytical unit, not bean acreage.</div>
  </div>`;
}
function restyle(){
  if(!counties)return;
  counties.eachLayer(l=>{
    const n=l.feature.properties.BASENAME||l.feature.properties.NAME;
    const core=CORE_SET.has(n), e=core&&models[n]?.series?regionEstimate(models[n],asOf):null;
    let fill='#eef1ee';
    if(e)fill=mode==='moisture'?moistureColor(e.root):mode==='yield'?yieldColor(e.adj):healthColor(e);
    l.setStyle({color:n===selected?'#183f5b':core?'#516c59':'#abb3ad',weight:n===selected?3:core?1.8:.6,fillColor:fill,fillOpacity:core&&e?.72:.08});
    if(core)l.bindPopup(()=>popupHtml(n,e));
  });
  const legend=mode==='moisture'
    ? `<b>Polygon root-zone soil moisture</b><div><span class="sw" style="background:#8c3f2f"></span>&lt;0.16 very dry</div><div><span class="sw" style="background:#d9a65a"></span>0.20–0.24 watch</div><div><span class="sw" style="background:#6f9f79"></span>0.24–0.34 adequate</div><div><span class="sw" style="background:#315f8d"></span>&gt;0.38 very wet</div><small>m³/m³ · multi-point polygon average · selected date</small>`
    : mode==='yield'
    ? `<b>Projected yield vs 2,300 lb/ac baseline</b><div><span class="sw" style="background:#8c3f2f"></span>≥12% below</div><div><span class="sw" style="background:#d39455"></span>4–8% below</div><div><span class="sw" style="background:#c7b96d"></span>near baseline</div><div><span class="sw" style="background:#4d865f"></span>above baseline</div><small>ESTIMATED · selected date</small>`
    : `<b>Modeled crop condition</b><div><span class="sw" style="background:#934438"></span>poor / stressed</div><div><span class="sw" style="background:#c56e48"></span>below normal</div><div><span class="sw" style="background:#c8b96e"></span>near normal</div><div><span class="sw" style="background:#568764"></span>above normal</div><small>stage-aware interpretation of soil + weather</small>`;
  $('mapLegend').innerHTML=legend;
}
function calendar(){
  const nowd=dateIndex(asOf);
  $('calendar').innerHTML=phases.map(p=>{
    const cls=nowd>=p[2]?'past':nowd>=p[1]?'current':'future';
    const d=addDays(new Date(PLANT+'T00:00:00Z'),p[1]);
    return `<div class="phase ${cls}"><b>${p[0]}</b><span>~${d.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</span><em>${cls==='past'?'RECONSTRUCTED':cls==='current'?'SELECTED DATE':'FORECAST'}</em></div>`;
  }).join('');
}
function narrative(s){
  const direction=s.adj<=-.10?'materially below':s.adj<=-.04?'modestly below':s.adj>=.04?'above':'near';
  const moisture=moistureLabel(s.root).toLowerCase();
  return `As of ${iso(asOf)}, the modeled crop is in ${s.stage}. Across the five monitored western Nebraska county polygons, root-zone soil moisture averages ${fmt(s.root,3)} m³/m³ (${moisture}). Estimated yield potential is ${direction} the 2,300 lb/ac working baseline. The estimate changes as the shared date moves because every polygon is recalculated from its own in-polygon soil-moisture and weather history.`;
}
function render(){
  const s=stateEstimate(asOf), r=models[selected]?.series?regionEstimate(models[selected],asOf):null;
  $('asOfLabel').textContent=iso(asOf);
  $('sliderDate').textContent=asOf.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  $('sliderStage').textContent=stageFor(asOf).toUpperCase()+' · '+cadenceFor(asOf)+'-DAY PLAY STEP';
  calendar(); restyle();
  if(!s||!r)return;
  $('yieldNow').textContent=s.yield.toLocaleString()+' lb/ac';
  $('yieldRange').textContent=`ESTIMATED RANGE ${s.lo.toLocaleString()}–${s.hi.toLocaleString()} lb/ac`;
  $('yieldDelta').textContent=(s.adj>=0?'+':'')+fmt(s.adj*100,1)+'% vs assumed baseline';
  $('yieldVsBase').textContent=(s.adj>=0?'+':'')+fmt(s.adj*100,1)+'%';
  $('condition').textContent=conditionFor(s);
  $('conditionWhy').textContent='Stage-aware soil-moisture + weather interpretation';
  $('soilState').textContent=moistureLabel(s.root);
  $('soilValue').textContent=fmt(s.root,3)+' m³/m³ polygon-average root zone';
  $('healthState').textContent=conditionFor(s);
  $('healthWhy').textContent='Condition proxy recalculated for selected date';
  $('confidence').textContent='MODERATE';
  $('confidenceWhy').textContent='Multi-point polygon sampling; yield baseline/planting anchor still assumed';
  $('plainAnswer').textContent=`${conditionFor(s)} crop signal. Estimated yield ${s.yield.toLocaleString()} lb/ac.`;
  $('narrative').textContent=narrative(s);
  $('plainEnglish').textContent=`The five monitored polygons average ${fmt(s.root,3)} m³/m³ root-zone moisture on ${iso(asOf)}. Our current model puts yield ${(s.adj>=0?'about '+fmt(s.adj*100,1)+'% above':'about '+fmt(Math.abs(s.adj*100),1)+'% below')} the working baseline.`;
  $('storyTitle').textContent=s.stage+' — what the map says on '+iso(asOf);
  $('storyText').textContent=narrative(s);
  $('regionName').textContent=selected+' County';
  $('stageTag').textContent='STAGE: '+r.stage.toUpperCase();
  $('regionYield').textContent=r.yield.toLocaleString()+' lb/ac';
  $('regionYieldWhy').textContent=`${r.adj>=0?'+':''}${fmt(r.adj*100,1)}% vs baseline · range ${r.lo.toLocaleString()}–${r.hi.toLocaleString()}.`;
  $('regionSoil').textContent=fmt(r.root,3)+' m³/m³';
  $('regionSoilWhy').textContent=`${moistureLabel(r.root)} · 7–28 cm ${fmt(r.shallow,3)} · 28–100 cm ${fmt(r.deep,3)} · ${models[selected].samples.length} in-polygon samples.`;
  $('regionWater').textContent=fmt(r.rain30)+' / '+fmt(r.et30)+' mm';
  $('regionWaterWhy').textContent=`30-day polygon-average precipitation / ET₀; balance ${fmt(r.b30)} mm.`;
  $('regionHeat').textContent=r.hot+' EXTREME DAYS';
  $('regionHeatWhy').textContent=r.heat+' days ≥32°C; '+r.hot+' days ≥35°C through selected date.';
  $('seasonRain').textContent=fmt(r.rainSeason)+' mm';
  $('modelChange').textContent=(r.adj>=0?'+':'')+fmt(r.adj*100,1)+'%';
  $('drivers').innerHTML=r.drivers.map(d=>`<div class="driver ${d.impact<-.01?'neg':d.impact>.01?'pos':''}"><b>${d.name.toUpperCase()}</b><br>${d.text}<br><strong>${d.impact>=0?'+':''}${fmt(d.impact*100,1)}% modeled factor</strong></div>`).join('');
}
async function loadCountiesAndModels(){
  $('status').textContent='Loading Nebraska polygons…';
  const u="https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?where="+encodeURIComponent("STATE='31'")+"&outFields=NAME,BASENAME,GEOID&returnGeometry=true&outSR=4326&f=geojson";
  const gj=await fetch(u).then(r=>{if(!r.ok)throw Error('Census');return r.json()});
  (gj.features||[]).forEach(f=>{const n=f.properties.BASENAME||f.properties.NAME;if(CORE_SET.has(n))features[n]=f});
  counties=L.geoJSON(gj,{
    style:f=>{const n=f.properties.BASENAME||f.properties.NAME,core=CORE_SET.has(n);return{color:core?'#516c59':'#abb3ad',weight:core?1.8:.6,fillColor:'#eef1ee',fillOpacity:core?.18:.05}},
    onEachFeature:(f,l)=>{
      const n=f.properties.BASENAME||f.properties.NAME; layersByName[n]=l;
      if(CORE_SET.has(n)){
        l.bindTooltip(n+' County',{sticky:true});
        l.on('click',()=>{selected=n;$('region').value=[...$('region').options].find(o=>o.textContent.startsWith(n))?.value||$('region').value;render();});
      }
    }
  }).addTo(map);
  const coreLayers=CORE.map(n=>layersByName[n]).filter(Boolean);
  if(coreLayers.length){const group=L.featureGroup(coreLayers);map.fitBounds(group.getBounds().pad(.12));}
  for(const n of CORE){
    const f=features[n];
    if(!f)continue;
    const pts=sampleFeature(f,SAMPLE_MAX);
    models[n]={samples:pts,series:null};
    $('status').textContent=`Loading ${n} soil-moisture history (${pts.length} in-polygon samples)…`;
    try{
      const payloads=await fetchSamples(pts);
      models[n].series=aggregateRegion(payloads);
    }catch(e){
      console.warn(n+' model load failed',e);
      models[n].error=String(e);
    }
    render();
  }
  const ok=CORE.filter(n=>models[n]?.series).length;
  $('status').textContent=`Temporal model ready: ${ok}/${CORE.length} polygons · ${CORE.reduce((a,n)=>a+(models[n]?.samples?.length||0),0)} in-polygon samples · shared as-of clock.`;
  render();
}
function setMode(m){
  mode=m;
  ['yield','moisture','health'].forEach(x=>$(x+'Btn').classList.toggle('on',x===m));
  restyle();
}
$('yieldBtn').onclick=()=>setMode('yield');
$('moistureBtn').onclick=()=>setMode('moisture');
$('healthBtn').onclick=()=>setMode('health');
$('satBtn').onclick=()=>{
  if(map.hasLayer(sat)){map.removeLayer(sat);if(!map.hasLayer(osm))osm.addTo(map);osm.bringToBack();$('satBtn').classList.remove('on')}
  else{if(map.hasLayer(osm))map.removeLayer(osm);sat.addTo(map);sat.bringToBack();$('satBtn').classList.add('on')}
};
const maxDay=days(new Date(PLANT+'T00:00:00Z'),new Date(TODAY+'T00:00:00Z'));
$('timeSlider').min=0;$('timeSlider').max=maxDay;$('timeSlider').value=maxDay;
$('timeSlider').oninput=e=>{asOf=addDays(new Date(PLANT+'T00:00:00Z'),+e.target.value);render()};
$('playBtn').onclick=()=>{
  if(play){clearInterval(play);play=null;$('playBtn').textContent='▶ PLAY';return}
  let v=+$('timeSlider').value;if(v>=maxDay)v=0;$('timeSlider').value=v;asOf=addDays(new Date(PLANT+'T00:00:00Z'),v);render();
  $('playBtn').textContent='■ STOP';
  play=setInterval(()=>{
    let cur=+$('timeSlider').value,step=cadenceFor(addDays(new Date(PLANT+'T00:00:00Z'),cur)),next=Math.min(maxDay,cur+step);
    $('timeSlider').value=next;asOf=addDays(new Date(PLANT+'T00:00:00Z'),next);render();
    if(next>=maxDay){clearInterval(play);play=null;$('playBtn').textContent='▶ PLAY'}
  },900);
};
$('region').onchange=()=>{
  const a=$('region').value.split(','),n=a[2];selected=n;map.flyTo([+a[0],+a[1]],8);render();
};
loadCountiesAndModels().catch(e=>{$('status').textContent='Temporal polygon model failed to initialize: '+e.message;console.error(e)});
