'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const viewMap={
    'crop-status':'yieldBtn',
    'soil-moisture':'moistureBtn',
    'moisture-anomaly':'healthBtn',
    'vegetation':'satBtn'
  };

  function installWorkspace(){
    const mapSection=$('mapSection'),mapWrap=mapSection?.querySelector('.mapwrap');
    if(!mapSection||!mapWrap||$('nbMapWorkspace'))return false;

    const workspace=document.createElement('div');
    workspace.id='nbMapWorkspace';workspace.className='nbMapWorkspace';
    mapWrap.insertAdjacentElement('beforebegin',workspace);

    const side=document.createElement('aside');
    side.className='nbRegionPanel';side.setAttribute('aria-label','Growing region selection');
    side.innerHTML=`<div class="nbPanelEyebrow">GROWING REGION</div><h3>Choose an analytical area</h3><p>Focus the map and decision support on one production region.</p><div id="nbRegionSlot"></div><div class="nbRegionHint"><b id="nbRegionActive">Nebraska Panhandle</b><span>Current evidence and crop-stage interpretation update together.</span></div>`;

    const main=document.createElement('div');main.className='nbMapMain';
    workspace.append(side,main);main.appendChild(mapWrap);

    const region=$('region');if(region){
      $('nbRegionSlot').appendChild(region);
      region.classList.add('nbRegionSelect');
      const sync=()=>{$('nbRegionActive').textContent=region.options[region.selectedIndex]?.textContent||'Selected region';};
      region.addEventListener('change',sync);sync();
    }

    const panel=document.createElement('div');panel.className='nbDecisionMapPanel';panel.setAttribute('aria-label','Decision map tools');
    panel.innerHTML=`
      <div class="nbDecisionMapHead"><div><span>NEBRASKA BEAN DECISION MAP</span><small>Choose the question first; technical evidence stays secondary.</small></div><button id="nbDecisionCollapse" type="button" aria-expanded="true" aria-label="Collapse decision map tools">−</button></div>
      <div class="nbDecisionMapBody">
        <label class="nbPrimaryView">PRIMARY VIEW<select id="nbPrimaryView"><option value="crop-status">Crop status</option><option value="soil-moisture">Soil moisture</option><option value="moisture-anomaly">Moisture anomaly</option><option value="vegetation">Vegetation / NDVI</option></select></label>
        <div id="nbQuickViews"></div>
        <div class="nbQuestionTabs" aria-label="Decision-support sections"><button type="button" data-target="nbSeasonSnapshot">Current state</button><button type="button" data-target="nbDecisionPanel">What changed?</button><button type="button" data-target="sources">Evidence</button></div>
        <details class="nbAdvanced"><summary>More map controls</summary><div id="nbAdvancedSlot"></div></details>
      </div>`;
    mapWrap.appendChild(panel);

    const actions=mapSection.querySelector('.mapactions');if(actions){$('nbQuickViews').appendChild(actions);actions.setAttribute('aria-label','Quick map views');}
    const opacity=$('rasterOpacity')?.closest('label'),crop=$('cropToggle')?.closest('label'),station=$('stationToggle')?.closest('label');
    [opacity,crop,station].filter(Boolean).forEach(el=>$('nbAdvancedSlot').appendChild(el));

    const select=$('nbPrimaryView');
    select.addEventListener('change',()=>$(viewMap[select.value])?.click());
    Object.entries(viewMap).forEach(([value,id])=>$(id)?.addEventListener('click',()=>{if(select.value!==value)select.value=value;}));
    document.querySelectorAll('.nbQuestionTabs button').forEach(btn=>btn.addEventListener('click',()=>$(btn.dataset.target)?.scrollIntoView({behavior:'smooth',block:'start'})));

    const collapse=$('nbDecisionCollapse');collapse.addEventListener('click',()=>{
      const open=collapse.getAttribute('aria-expanded')==='true';collapse.setAttribute('aria-expanded',String(!open));panel.classList.toggle('collapsed',open);collapse.textContent=open?'+':'−';
    });
    return true;
  }

  function installYieldCredibilityGate(){
    ['yieldNow','regionYield','productionNow'].forEach(id=>{const el=$(id);if(el){el.classList.add('nbYieldWithheld');el.setAttribute('aria-label','Precise experimental estimate withheld from decision view pending model credibility validation');}});
    const box=document.querySelector('.yieldBox');
    if(box&&!box.querySelector('.nbYieldGate')){
      const gate=document.createElement('div');gate.className='nbYieldGate';gate.innerHTML='<b>PRECISE YIELD TEMPORARILY WITHHELD</b><span>The current weather-only model does not yet ingest crop-masked moisture/vegetation response, irrigation, cultivar, disease, hail or management. Directional evidence remains visible while the yield model is revalidated.</span>';
      box.appendChild(gate);
    }
    const detail=$('regionYield')?.closest('article');if(detail&&!detail.querySelector('.nbYieldGateInline')){
      const n=document.createElement('small');n.className='nbYieldGateInline';n.textContent='Exact lb/acre is withheld from the primary decision view until agronomic plausibility and current-season evidence are validated.';detail.appendChild(n);
    }
    const prod=$('productionNow')?.closest('article');if(prod&&!prod.querySelector('.nbYieldGateInline')){
      const n=document.createElement('small');n.className='nbYieldGateInline';n.textContent='Production inherits yield uncertainty and is therefore withheld from the primary decision view.';prod.appendChild(n);
    }
  }

  function relabelCurrentState(){
    const grid=$('nbSeasonSnapshot');if(!grid)return;
    [...grid.querySelectorAll('.nbCurrentGrid>div')].forEach(card=>{const label=card.querySelector('span');if(label?.textContent.trim()==='7-DAY YIELD')label.textContent='7-DAY WEATHER MODEL';});
  }

  function installMobileViewButton(){
    const workspace=$('nbMapWorkspace'),panel=document.querySelector('.nbDecisionMapPanel');if(!workspace||!panel||$('nbMobileView'))return;
    const btn=document.createElement('button');btn.id='nbMobileView';btn.className='nbMobileView';btn.type='button';btn.textContent='View & tools';btn.setAttribute('aria-expanded','false');
    btn.addEventListener('click',()=>{const open=panel.classList.toggle('mobileOpen');btn.setAttribute('aria-expanded',String(open));btn.textContent=open?'Close tools':'View & tools';});
    workspace.insertAdjacentElement('beforebegin',btn);
  }

  function start(){
    installWorkspace();installYieldCredibilityGate();installMobileViewButton();
    const obs=new MutationObserver(()=>{installYieldCredibilityGate();relabelCurrentState();});
    obs.observe(document.body,{subtree:true,childList:true});
    setTimeout(relabelCurrentState,250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,180));else setTimeout(start,180);
})();
