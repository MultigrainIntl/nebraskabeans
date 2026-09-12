'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  function install(){
    const slider=$('timeSlider'),displayed=$('sliderDate'),asOf=$('asOfLabel');if(!slider||!displayed||!asOf)return;
    let preview=$('sliderPreviewDate');
    if(!preview){preview=document.createElement('strong');preview.id='sliderPreviewDate';preview.className='sliderPreviewDate';preview.setAttribute('aria-live','polite');displayed.insertAdjacentElement('beforebegin',preview);}
    const sync=()=>{
      const intended=$('nbTimelineDate')?.textContent?.replace(/^Selected\s+/,'')||'';
      preview.textContent=intended?`PREVIEW ${intended}`:'';
      if(asOf.textContent&&asOf.textContent!=='—')displayed.textContent=asOf.textContent;
    };
    slider.addEventListener('input',sync);slider.addEventListener('change',()=>setTimeout(sync,0));
    new MutationObserver(()=>{if(asOf.textContent&&asOf.textContent!=='—')displayed.textContent=asOf.textContent;}).observe(asOf,{childList:true,subtree:true});
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));else setTimeout(install,0);
})();
