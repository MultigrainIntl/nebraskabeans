'use strict';
// Bounded cache of complete source images. Failed dates are never silently replaced.
window.NBFrameBuffer = function(limit=8) {
  const entries=new Map();
  return {load(url) {
    if(entries.has(url)){const item=entries.get(url);entries.delete(url);entries.set(url,item);return item.promise}
    const item={image:new Image()};
    item.promise=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(Error('Source frame timed out')),20000);
      const finish=error=>{clearTimeout(timer);item.image.onload=null;item.image.onerror=null;if(error){entries.delete(url);reject(error)}else resolve(url)};
      item.image.onload=()=>finish();item.image.onerror=()=>finish(Error('Source frame unavailable'));item.image.src=url;
    });
    entries.set(url,item);
    while(entries.size>limit)entries.delete(entries.keys().next().value);
    return item.promise;
  }};
};
