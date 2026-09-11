'use strict';
(()=>{
  const DEFAULT_CENTER=[41.15,-103.05], DEFAULT_ZOOM=6;
  let defaultApplied=false;

  function countyLayer(){
    try{return typeof counties!=='undefined'&&counties?counties:null}catch(_){return null}
  }

  function forceCountyOutlines(){
    const c=countyLayer();
    if(!c)return;
    c.eachLayer(l=>{
      const name=l.feature?.properties?.BASENAME||l.feature?.properties?.NAME||'';
      const selectedNow=typeof selected!=='undefined'&&name===selected;
      l.setStyle({
        fill:true,
        fillColor:'transparent',
        fillOpacity:0,
        color:selectedNow?'#526b63':'#87918d',
        weight:selectedNow?1.35:.62,
        opacity:selectedNow?.9:.72
      });
    });
    if(c.bringToFront)c.bringToFront();
  }

  function styleStations(){
    const z=map.getZoom();
    const style=z<=6
      ?{radius:1.55,opacity:.26,fillOpacity:.20,weight:.35}
      :z===7?{radius:2.35,opacity:.42,fillOpacity:.34,weight:.55}
      :z===8?{radius:3.35,opacity:.62,fillOpacity:.52,weight:.75}
      :z===9?{radius:4.5,opacity:.78,fillOpacity:.70,weight:1}
      :{radius:5.7,opacity:.94,fillOpacity:.86,weight:1.25};
    map.eachLayer(l=>{
      if(l instanceof L.CircleMarker){
        l.setRadius(style.radius);
        l.setStyle({
          color:'#ffffff',
          weight:style.weight,
          opacity:style.opacity,
          fillOpacity:style.fillOpacity,
          fillColor:'#526d7b'
        });
      }
    });
  }

  function removeLegacySurfaces(){
    map.eachLayer(l=>{
      if(l instanceof L.ImageOverlay){
        const u=String(l._url||'');
        if(u.startsWith('data:image/png')&&!l._beanSurface)map.removeLayer(l);
      }
    });
  }

  function emphasizeCropSurface(){
    const pane=map.getPane('beanSurfacePane');
    if(!pane)return;
    pane.style.filter='saturate(1.65) contrast(1.42)';
    pane.style.opacity='1';
  }

  function quietRegionOutlines(){
    map.eachLayer(l=>{
      if(l instanceof L.Polygon && !(l instanceof L.Rectangle) && l.options?.dashArray){
        l.setStyle({weight:1.15,opacity:.58,fillOpacity:0,color:'#557267'});
      }
    });
  }

  function applyVisualHierarchy(){
    removeLegacySurfaces();
    emphasizeCropSurface();
    forceCountyOutlines();
    quietRegionOutlines();
    styleStations();
  }

  // Site.js redraws county polygons whenever the date or mode changes.
  // Wrap that redraw so counties remain outlines only, permanently.
  try{
    if(typeof restyle==='function'&&!restyle.__outlineOnly){
      const legacyRestyle=restyle;
      const wrapped=function(){
        legacyRestyle();
        forceCountyOutlines();
        setTimeout(forceCountyOutlines,0);
      };
      wrapped.__outlineOnly=true;
      restyle=wrapped;
    }
  }catch(e){console.warn('restyle wrapper unavailable',e)}

  map.on('zoomend',applyVisualHierarchy);
  map.on('moveend',applyVisualHierarchy);
  map.on('layeradd',()=>setTimeout(applyVisualHierarchy,0));

  // Keep Soil Moisture as the default analytical mode.
  setTimeout(()=>{
    const b=document.getElementById('moistureBtn');
    if(b&&!b.classList.contains('on'))b.click();
  },80);

  // Apply the agreed regional default after asynchronous county/region fitting finishes.
  const applyDefault=()=>{
    if(defaultApplied)return;
    map.setView(DEFAULT_CENTER,DEFAULT_ZOOM,{animate:false});
    defaultApplied=true;
    applyVisualHierarchy();
  };
  setTimeout(applyVisualHierarchy,150);
  setTimeout(applyVisualHierarchy,900);
  setTimeout(applyDefault,3200);
  setTimeout(applyVisualHierarchy,5200);
})();