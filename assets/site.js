document.querySelector('.menu')?.addEventListener('click',e=>{const n=document.querySelector('#nav');const o=n.classList.toggle('open');e.currentTarget.setAttribute('aria-expanded',o)});

const params=new URLSearchParams(location.search);
if(document.body.dataset.bean){
  const key=params.get('class')||'great-northern';
  const beans={
    'great-northern':['Great Northern','Nebraska’s signature dry bean class','Nebraska is a national leader in Great Northern production. The class is valued for its mild flavor, thin skin and versatility in foodservice, canning and ingredient applications.'],
    'pinto':['Pinto','A major regional and international class','Pinto beans are a major Nebraska market class serving retail, foodservice, processing and export channels.'],
    'light-red-kidney':['Light Red Kidney','Specialty color bean intelligence','Light Red Kidney beans are produced in Nebraska and used in canned, prepared-food and retail applications.'],
    'black':['Black','Commercial class context','Nebraska produces black beans, though recent class-level statistics may be withheld by USDA to avoid disclosure.'],
    'navy':['Navy','Regional and competing-origin context','Navy beans are supported in NebraskaBeans for market comparison, sourcing and trade intelligence.'],
    'garbanzo':['Garbanzo','Pulse-market context','Garbanzo beans are included for regional pulse-market and commercial sourcing context.']
  };
  const b=beans[key]||beans['great-northern'];
  document.querySelector('[data-name]').textContent=b[0];
  document.querySelector('[data-sub]').textContent=b[1];
  document.querySelector('[data-desc]').textContent=b[2];
  document.title=b[0]+' Beans | NebraskaBeans';
}

const cv=document.querySelector('#convert');
if(cv){cv.addEventListener('input',()=>{const v=parseFloat(document.querySelector('#cvvalue').value);const mode=document.querySelector('#cvmode').value;let out='—';if(Number.isFinite(v)){if(mode==='mt-cwt')out='$'+(v/22.0462).toFixed(2)+'/cwt';if(mode==='cwt-mt')out='$'+(v*22.0462).toFixed(2)+'/MT';if(mode==='mt-lb')out='$'+(v/2204.6226).toFixed(4)+'/lb';if(mode==='kg-lb')out=(v*2.2046226).toFixed(2)+' lb';if(mode==='mt-lbwt')out=(v*2204.6226).toFixed(0)+' lb'}document.querySelector('#cvresult').textContent=out})}

const svgEl=document.querySelector('#nebraskaMap');
if(svgEl && window.d3 && window.topojson){
  const svg=d3.select(svgEl), status=document.querySelector('#mapStatus'), tooltip=document.querySelector('#mapTooltip');
  const nameEl=document.querySelector('#countyName'), noteEl=document.querySelector('#countyNote');
  const core=new Set(['31013','31123','31157','31161']);
  const countyNames={'31013':'BOX BUTTE','31123':'MORRILL','31157':'SCOTTS BLUFF','31161':'SHERIDAN'};
  const countyNotes={
    '31013':'UNL’s 2026 drought comparison includes dry-bean yield history for Box Butte County; Alliance is also a current dry-bean research and pest-monitoring location.',
    '31123':'Morrill County is one of the Panhandle counties used by UNL for dry-bean drought/yield comparison and is tied closely to North Platte Valley irrigation.',
    '31157':'Scotts Bluff County is a core western Nebraska dry-bean research and production context, including Gering and Mitchell monitoring locations.',
    '31161':'Sheridan County is included in UNL dry-bean yield comparisons and represents the northern Panhandle production context.'
  };
  function setSelected(id){
    svg.selectAll('.county').classed('selected',d=>String(d.id).padStart(5,'0')===id);
    document.querySelectorAll('.rail-list button').forEach(b=>b.classList.toggle('active',b.dataset.county===id));
    nameEl.textContent=countyNames[id]||'NEBRASKA COUNTY';
    noteEl.textContent=countyNotes[id]||'County boundary shown for geographic context. No county-level 2026 acreage is inferred here.';
  }
  d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json').then(us=>{
    const counties=topojson.feature(us,us.objects.counties).features.filter(d=>String(d.id).startsWith('31'));
    const nebraska=topojson.merge(us,us.objects.counties.geometries.filter(d=>String(d.id).startsWith('31')));
    const path=d3.geoPath();
    const bounds=path.bounds(nebraska), pad=18;
    svg.attr('viewBox',`${bounds[0][0]-pad} ${bounds[0][1]-pad} ${bounds[1][0]-bounds[0][0]+pad*2} ${bounds[1][1]-bounds[0][1]+pad*2}`);
    svg.append('g').selectAll('path').data(counties).join('path')
      .attr('class',d=>`county ${core.has(String(d.id).padStart(5,'0'))?'core-county':''}`)
      .attr('d',path)
      .attr('tabindex','0')
      .attr('aria-label',d=>countyNames[String(d.id).padStart(5,'0')]||`Nebraska county FIPS ${d.id}`)
      .on('mousemove',(event,d)=>{const id=String(d.id).padStart(5,'0');tooltip.hidden=false;tooltip.textContent=countyNames[id]||`County FIPS ${id}`;const box=event.currentTarget.ownerSVGElement.getBoundingClientRect();tooltip.style.left=(event.clientX-box.left+12)+'px';tooltip.style.top=(event.clientY-box.top+50)+'px'})
      .on('mouseleave',()=>tooltip.hidden=true)
      .on('click',(event,d)=>setSelected(String(d.id).padStart(5,'0')))
      .on('keydown',(event,d)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelected(String(d.id).padStart(5,'0'))}});
    svg.append('path').datum(nebraska).attr('class','state-outline').attr('d',path);
    Object.entries(countyNames).forEach(([id,name])=>{const f=counties.find(d=>String(d.id).padStart(5,'0')===id);if(!f)return;const c=path.centroid(f);svg.append('circle').attr('class','map-dot').attr('cx',c[0]).attr('cy',c[1]).attr('r',2.8);svg.append('text').attr('class','map-label').attr('x',c[0]).attr('y',c[1]-7).text(name.replace('SCOTTS BLUFF','SCOTTS BLUFF'))});
    status.textContent='93 COUNTY BOUNDARIES · US ATLAS / CENSUS GEOMETRY';
  }).catch(()=>{status.textContent='MAP DATA UNAVAILABLE';nameEl.textContent='MAP LOAD BLOCKED';noteEl.textContent='County geometry could not be loaded from the public map data service. The production claims on this page remain unchanged.'});
  document.querySelectorAll('.rail-list button').forEach(b=>b.addEventListener('click',()=>setSelected(b.dataset.county)));
  document.querySelectorAll('[data-mapmode]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-mapmode]').forEach(x=>x.classList.remove('active'));b.classList.add('active');const risk=b.dataset.mapmode==='risk';document.querySelector('.map-frame').classList.toggle('risk',risk);nameEl.textContent=risk?'2026 FIELD CONTEXT':'WESTERN NEBRASKA';noteEl.textContent=risk?'Statewide topsoil moisture was 54% short or very short for the week ending Sept. 6. This is a statewide risk signal, not a county-specific bean yield estimate.':'UNL and Nebraska agriculture sources identify western Nebraska as the core dry-bean production geography.';svg.selectAll('.county').classed('selected',false);document.querySelectorAll('.rail-list button').forEach(x=>x.classList.remove('active'))}));
}
