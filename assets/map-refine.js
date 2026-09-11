'use strict';
(()=>{
  const DEFAULT_CENTER=[41.35,-103.15], DEFAULT_ZOOM=6;
  function applyVisualHierarchy(){
    const pane=map.getPane('beanSurfacePane');
    if(pane){pane.style.filter='saturate(1.45) contrast(1.32)';pane.style.opacity='1';}
    if(window.counties)counties.eachLayer(l=>l.setStyle({fillOpacity:0,color:'#7f8b86',weight:.65,opacity:.72}));
    map.eachLayer(l=>{
      if(l instanceof L.CircleMarker){
        const z=map.getZoom();
        const radius=z<=6?1.6:z===7?2.4:z===8?3.4:z===9?4.5:5.5;
        const opacity=z<=6?.24:z===7?.4:z===8?.6:z===9?.78:.9;
        l.setRadius(radius);
        l.setStyle({weight:z<=6?.35:z<=8?.7:1.1,opacity,fillOpacity:Math.max(.16,opacity-.08)});
      }
    });
  }
  function setDefaultExtent(){map.setView(DEFAULT_CENTER,DEFAULT_ZOOM,{animate:false});applyVisualHierarchy();}
  map.on('zoomend',applyVisualHierarchy);
  map.on('moveend',applyVisualHierarchy);
  setTimeout(setDefaultExtent,350);
  setTimeout(setDefaultExtent,1800);
  setTimeout(applyVisualHierarchy,3500);
})();