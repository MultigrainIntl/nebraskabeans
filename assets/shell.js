'use strict';
(()=>{
  const beanCopy={
    great_northern:['Great Northern','Nebraska’s signature dry-bean class','Great Northern beans are a major western Nebraska commercial class. Current class-specific acreage, production, price, and availability require a dated authoritative record or current quote.'],
    pinto:['Pinto','A major High Plains dry-bean class','Pinto beans are grown across parts of the High Plains. NebraskaBeans does not infer a current class share from older or national totals.'],
    light_red_kidney:['Light Red Kidney','A specialty dry-bean class','Light red kidney information is published only when the relevant geography and crop year are identified.'],
    black:['Black','A commercial dry-bean class','Black bean availability and regional production remain source- and crop-year-specific.'],
    navy:['Navy','A commercial dry-bean class','Navy bean availability and regional production remain source- and crop-year-specific.'],
    garbanzo:['Garbanzo','A pulse category distinct from NASS dry edible beans','Chickpeas are excluded from the NASS dry-edible-bean tables used by the crop dashboard and require their own evidence contract.']
  };
  const key=value=>(value||'great_northern').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_');
  function setupMenu(){
    const button=document.querySelector('.menu'),nav=document.getElementById('nav');if(!button||!nav)return;
    button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open)});
  }
  function setupBean(){
    if(!document.body.dataset.bean)return;
    const requested=key(new URLSearchParams(location.search).get('class')),copy=beanCopy[requested]||beanCopy.great_northern;
    const name=document.querySelector('[data-name]'),sub=document.querySelector('[data-sub]'),desc=document.querySelector('[data-desc]');
    if(name)name.textContent=copy[0];if(sub)sub.textContent=copy[1];if(desc)desc.textContent=copy[2];document.title=`${copy[0]} | NebraskaBeans`;
  }
  function setupConverter(){
    const value=document.getElementById('cvvalue'),mode=document.getElementById('cvmode'),result=document.getElementById('cvresult');if(!value||!mode||!result)return;
    const render=()=>{const n=Number(value.value);if(!Number.isFinite(n)){result.textContent='—';return}const f={
      'mt-cwt':()=>`$${(n/22.0462262).toFixed(2)}/cwt`,
      'cwt-mt':()=>`$${(n*22.0462262).toFixed(2)}/MT`,
      'mt-lb':()=>`$${(n/2204.62262).toFixed(4)}/lb`,
      'kg-lb':()=>`${(n*2.20462262).toFixed(2)} lb`,
      'mt-lbwt':()=>`${(n*2204.62262).toFixed(2)} lb`
    };result.textContent=(f[mode.value]||(()=> '—'))()};
    value.addEventListener('input',render);mode.addEventListener('change',render);render();
  }
  document.addEventListener('DOMContentLoaded',()=>{setupMenu();setupBean();setupConverter()});
})();
