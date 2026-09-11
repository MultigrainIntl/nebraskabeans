'use strict';
// Display native crop geography and station evidence without downscaling yield.
window.NBSpatial = function(map) {
  const crop=L.layerGroup(),stations=L.layerGroup();
  let stationData=null,selectedDate=null,cropLoaded=false;
  const text=(id,value)=>{document.getElementById(id).textContent=value};
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function json(url){const r=await fetch(url);if(!r.ok)throw Error(`${url}: ${r.status}`);return url.endsWith('.gz')?new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json():r.json()}
  async function loadCrop(){
    if(cropLoaded)return;
    text('cropStatus','Loading historical dry-bean polygons…');
    const manifest=await json('assets/data/crop-footprint/crop-footprint-manifest.json');
    let count=0,acres=0;
    for(const item of manifest.states){
      const fc=await json('assets/data/crop-footprint/'+item.file);
      L.geoJSON(fc,{pane:'cropPane',style:{color:'#793fa0',weight:.6,fillColor:'#ab66c9',fillOpacity:.65},
        onEachFeature:(feature,layer)=>layer.bindPopup(`<b>${escape(feature.properties.state)} · dry-bean footprint</b><br>USDA CDL ${manifest.crop_year}, class 42<br>${feature.properties.mapped_acres.toFixed(2)} mapped acres in this polygon part<br>Historical classification · not confirmed current planting<br>Parts may split at processing tile edges.<br><a href="${escape(manifest.source_url)}" target="_blank" rel="noopener">USDA source</a>`)
      }).addTo(crop);
      count++;acres+=item.mapped_acres;
      text('cropStatus',`${count}/4 states loaded · ${Math.round(acres).toLocaleString()} historical mapped acres`);
    }
    cropLoaded=true;
    text('cropStatus',`2025 CDL · ${manifest.pixel_size_m[0]} m source · 4 states · ${Math.round(acres).toLocaleString()} mapped acres; historical, not current-season acreage`);
  }
  function renderStations(){
    if(!stationData||!selectedDate)return;
    stations.clearLayers();let available=0;
    for(const st of stationData.stations){
      const observation=st.dates[selectedDate];if(observation)available++;
      const value=v=>Number.isFinite(v)?v.toFixed(1):'Unavailable';
      const detail=observation?`<br>${escape(observation.valid_time)}<br>Air temperature: ${value(observation.temperature_f)} °F<br>Dew point: ${value(observation.dewpoint_f)} °F<br>Wind: ${value(observation.wind_knots)} knots<br>Reported hourly precipitation: ${value(observation.reported_precip_in)} in`:'<br>No report for the selected UTC date';
      L.circleMarker([st.coordinates[1],st.coordinates[0]],{pane:'stationPane',radius:4,weight:1,color:'#fff',fillOpacity:1,fillColor:observation?'#175a8b':'#929a9f'})
        .bindPopup(`<b>${escape(st.station)} · ${escape(st.name)}</b>${detail}<br>ASOS/AWOS observations via IEM; limited source QC.<br>Latest routine report per UTC day, not a daily average.<br>Historical receipt time unavailable; current-truth archive.<br><a href="${escape(stationData.documentation)}" target="_blank" rel="noopener">Source and limitations</a>`).addTo(stations);
    }
    text('stationStatus',`${available}/${stationData.stations.length} stations with reports on ${selectedDate} · UTC · blue: available; gray: unavailable`);
  }
  async function loadStations(){
    if(!stationData)stationData=await json('assets/data/stations/station-observations.json.gz');
    renderStations();
  }
  map.createPane('cropPane');map.getPane('cropPane').style.zIndex=410;
  map.createPane('stationPane');map.getPane('stationPane').style.zIndex=510;
  document.getElementById('cropToggle').addEventListener('change',async e=>{
    if(!e.target.checked){map.removeLayer(crop);return}
    crop.addTo(map);
    try{await loadCrop()}catch(error){text('cropStatus','Crop polygons unavailable: '+error.message)}
  });
  document.getElementById('stationToggle').addEventListener('change',async e=>{
    if(!e.target.checked){map.removeLayer(stations);return}
    stations.addTo(map);
    try{await loadStations()}catch(error){text('stationStatus','Station observations unavailable: '+error.message)}
  });
  return {update(date){selectedDate=date;renderStations()},async start(){crop.addTo(map);stations.addTo(map);await Promise.allSettled([loadCrop(),loadStations()]).then(results=>{if(results[0].status==='rejected')text('cropStatus','Crop polygons unavailable');if(results[1].status==='rejected')text('stationStatus','Station observations unavailable')})}};
};
