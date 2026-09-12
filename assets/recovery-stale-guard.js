'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  function install(){
    const slider=$('timeSlider'),displayed=$('sliderDate'),asOf=$('asOfLabel');if(!slider||!displayed||!asOf)return;
    let preview=$('sliderPreviewDate');
    if(!preview){preview=document.createElement('strong');preview.id='sliderPreviewDate';preview.className='sliderPreviewDate';preview.setAttribute('aria-live','polite');displayed.insertAdjacentElement('beforebegin',preview);}
    const restoreDisplayed=()=>{if(asOf.textContent&&asOf.textContent!=='—')displayed.textContent=asOf.textContent;};
    const syncPreview=()=>{
      const intended=$('nbTimelineDate')?.textContent?.replace(/^Selected\s+/,'')||'';
      preview.textContent=intended?`PREVIEW ${intended}`:'';
      restoreDisplayed();
    };
    // Run after every target-level slider listener, regardless of registration order.
    document.addEventListener('input',event=>{if(event.target===slider)syncPreview();});
    document.addEventListener('change',event=>{if(event.target===slider){syncPreview();setTimeout(syncPreview,0);}});
    new MutationObserver(restoreDisplayed).observe(asOf,{childList:true,subtree:true});
    syncPreview();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));else setTimeout(install,0);
})();
