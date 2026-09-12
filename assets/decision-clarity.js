'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const text=id=>($(id)?.textContent||'—').trim();
  function classify(){
    const condition=text('condition'),soil=text('soilState'),veg=text('healthState'),stage=text('sliderStage').replace(/^MODELED STAGE:\s*/i,'');
    let risk='MIXED / WATCH';
    if(/DRIER|STRESS|DECLIN|RISK|BELOW/i.test(`${condition} ${soil} ${veg}`)) risk='ELEVATED';
    if(/TYPICAL|RISING|IMPROV|ADEQUATE/i.test(`${condition} ${soil} ${veg}`)&&!/DRIER|STRESS|DECLIN/i.test(`${condition} ${soil} ${veg}`)) risk='STABLE';
    return {condition,soil,veg,stage:stage||'—',risk};
  }
  function install(){
    const mapSection=$('mapSection'),mapWrap=mapSection?.querySelector('.mapwrap');
    if(!mapSection||!mapWrap||$('nbSeasonSnapshot'))return false;
    const snapshot=document.createElement('section');snapshot.id='nbSeasonSnapshot';snapshot.className='nbSeasonSnapshot';snapshot.setAttribute('aria-label','Season snapshot');
    snapshot.innerHTML=`<div class="nbSnapshotHead"><span>SEASON SNAPSHOT</span><b id="nbSnapshotBottom">Loading current crop state…</b></div><div class="nbSnapshotGrid"><div><span>NOW</span><strong id="nbSnapStage">—</strong><small>Current modeled crop stage</small></div><div><span>CROP</span><strong id="nbSnapCondition">—</strong><small>Combined crop-health outlook</small></div><div><span>WATER</span><strong id="nbSnapWater">—</strong><small>Root-zone moisture state</small></div><div><span>VEGETATION</span><strong id="nbSnapVeg">—</strong><small>Satellite direction</small></div><div><span>RISK</span><strong id="nbSnapRisk">—</strong><small>At-a-glance attention level</small></div></div>`;
    mapWrap.insertAdjacentElement('beforebegin',snapshot);
    const panel=$('nbDecisionPanel');
    if(panel){
      const labels=panel.querySelectorAll('.nbDecisionGrid article>span');
      ['WHAT CHANGED','AGRONOMIC IMPACT','MARKET MEANING','WATCH NEXT'].forEach((v,i)=>{if(labels[i])labels[i].textContent=v});
      const head=panel.querySelector('.nbDecisionHead span');if(head)head.textContent='DECISION SUPPORT';
      const note=panel.querySelector('.nbDecisionHead small');if(note)note.textContent='Evidence-bounded interpretation. No price forecast.';
    }
    return true;
  }
  function refresh(){
    if(!$('nbSeasonSnapshot')&&!install())return;
    const s=classify();
    $('nbSnapStage').textContent=s.stage;$('nbSnapCondition').textContent=s.condition;$('nbSnapWater').textContent=s.soil;$('nbSnapVeg').textContent=s.veg;$('nbSnapRisk').textContent=s.risk;
    const area=text('regionName'),date=text('sliderDate');
    $('nbSnapshotBottom').textContent=`${area} · ${date} · ${s.stage} · ${s.risk} attention`;
  }
  function start(){
    const root=document.body;new MutationObserver(refresh).observe(root,{subtree:true,childList:true,characterData:true});
    document.addEventListener('input',refresh);document.addEventListener('change',refresh);setInterval(refresh,1000);refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,50));else setTimeout(start,50);
})();
