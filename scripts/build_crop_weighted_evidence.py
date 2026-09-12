#!/usr/bin/env python3
"""Area-weight source grids using every native historical CDL class-42 pixel.

Weights are pixel-centre assignments (100 m² per native CDL pixel), not evidence
that coarse source cells measure only beans. No source values are interpolated.
"""
import argparse
import concurrent.futures
import datetime as dt
import gzip
import hashlib
import json
import shutil
import tempfile
import os
import fcntl
import urllib.request
from collections import Counter
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.features import geometry_mask
from rasterio.windows import Window, from_bounds
from shapely.geometry import shape, mapping, box
from shapely.ops import transform

ROOT=Path(__file__).resolve().parents[1]
ACRE_M2=4046.8564224

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def grid(path):
    with rasterio.open(path) as ds:
        if ds.crs.to_epsg()!=4326 or ds.transform.b or ds.transform.d:
            raise ValueError('Only explicit, unrotated EPSG:4326 service grids supported')
        return dict(crs=ds.crs.to_string(),transform=list(ds.transform)[:6],width=ds.width,height=ds.height,nodata=ds.nodata)

def cell_counts(lon,lat,spec):
    a,b,c,d,e,f=spec['transform']
    cols=np.floor((lon-c)/a).astype('int64');rows=np.floor((lat-f)/e).astype('int64')
    valid=(cols>=0)&(cols<spec['width'])&(rows>=0)&(rows<spec['height'])
    cells,counts=np.unique(rows[valid]*spec['width']+cols[valid],return_counts=True)
    return dict(zip(map(int,cells),map(int,counts))),int((~valid).sum())

def make_weights(cdl,grids,out):
    boundaries=json.loads((ROOT/'assets/data/state-study-area.geojson').read_text())
    footprint=json.loads((ROOT/'assets/data/crop-footprint/crop-footprint-manifest.json').read_text())
    expected={r['state_fips']:r['class_pixels'] for r in footprint['states']}
    result={}
    with rasterio.open(cdl) as src:
        if src.crs.to_epsg()!=5070 or tuple(src.res)!=(10.,10.) or src.transform.b or src.transform.d:
            raise ValueError('Expected native EPSG:5070 10 m USDA CDL')
        to_native=Transformer.from_crs(4326,5070,always_xy=True).transform
        to_geo=Transformer.from_crs(5070,4326,always_xy=True).transform
        for feature in boundaries['features']:
            name=feature['properties']['NAME'];fips=feature['properties']['STATE']
            native=transform(to_native,shape(feature['geometry']));extent=from_bounds(*native.bounds,src.transform)
            left=max(0,int(np.floor(extent.col_off)));right=min(src.width,int(np.ceil(extent.col_off+extent.width)))
            top=max(0,int(np.floor(extent.row_off)));bottom=min(src.height,int(np.ceil(extent.row_off+extent.height)))
            counts={k:Counter() for k in grids};outside={k:0 for k in grids};total=0
            for row in range(top,bottom,2048):
                for col in range(left,right,2048):
                    win=Window(col,row,min(2048,right-col),min(2048,bottom-row))
                    tile=box(*rasterio.windows.bounds(win,src.transform))
                    if not native.intersects(tile):continue
                    beans=src.read(1,window=win,masked=True).filled(0)==42
                    if not beans.any():continue
                    tr=src.window_transform(win)
                    if not native.covers(tile):
                        beans &= geometry_mask([mapping(native.intersection(tile))],out_shape=beans.shape,transform=tr,invert=True)
                    yy,xx=np.nonzero(beans);total+=len(xx)
                    lon,lat=to_geo(tr.c+(xx+.5)*tr.a,tr.f+(yy+.5)*tr.e)
                    for key,spec in grids.items():
                        assigned,missed=cell_counts(lon,lat,spec);counts[key].update(assigned);outside[key]+=missed
            if total!=expected[fips]:raise ValueError(f'{name}: {total} pixels != footprint {expected[fips]}')
            result[fips]=dict(state=name,class_pixels=total,mapped_acres=total*100/ACRE_M2,grids={})
            for key in grids:
                if sum(counts[key].values())+outside[key]!=total:raise ValueError('Crop-area conservation failed')
                result[fips]['grids'][key]=dict(outside_pixels=outside[key],cells=sorted(counts[key].items()))
            print(f'WEIGHTED {name}: {total} class-42 pixels',flush=True)
    artifact=dict(schema='gisit.crop-grid-weights.v1',crop_year=2025,pixel_area_m2=100,
                  footprint_manifest_sha256=sha(ROOT/'assets/data/crop-footprint/crop-footprint-manifest.json'),
                  grid_contracts=grids,states=result,
                  method='Every historical class-42 pixel centre assigned to its containing source cell; no dropped patches or nearest-centroid weights')
    out.write_text(json.dumps(artifact,separators=(',',':'))+'\n');return artifact

def summarize(path,weight):
    with rasterio.open(path) as ds:values=ds.read(1,masked=True).reshape(-1)
    pairs=weight['cells'];indices=np.array([p[0] for p in pairs],dtype='int64');counts=np.array([p[1] for p in pairs],dtype='int64')
    selected=values[indices];valid=~np.ma.getmaskarray(selected)&np.isfinite(selected.astype(float).filled(np.nan))
    x=np.asarray(selected.data[valid],dtype=float);w=counts[valid];represented=int(w.sum());covered=sum(p[1] for p in pairs)
    total=covered+weight['outside_pixels']
    result=dict(total_crop_pixels=total,valid_crop_pixels=represented,nodata_crop_pixels=covered-represented,
                outside_grid_crop_pixels=weight['outside_pixels'],valid_crop_area_fraction=represented/total if total else None,
                source_cells_with_crop=len(pairs),valid_source_cells=int(valid.sum()),mean=None,median=None)
    if represented:
        order=np.argsort(x);cum=np.cumsum(w[order]);median=x[order][np.searchsorted(cum,represented/2,side='left')]
        result.update(mean=float(np.dot(x,w)/represented),median=float(median))
    return result

def preserve(raw,destination):
    with tempfile.NamedTemporaryFile(dir=Path(destination).parent,delete=False) as fout:
        temporary=Path(fout.name)
        try:
            with open(raw,'rb') as inp, gzip.GzipFile(filename='',mode='wb',fileobj=fout,mtime=0) as gz:shutil.copyfileobj(inp,gz)
        except BaseException:
            temporary.unlink(missing_ok=True);raise
    os.replace(temporary,destination)

def build(args):
    lock_path=Path('/tmp')/('gisit-crop-build-'+hashlib.sha256(str(Path(args.out).resolve()).encode()).hexdigest()[:16]+'.lock')
    lock=lock_path.open('w')
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise SystemExit('Another crop evidence build is already writing this output')
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True);raw_out=out/'raw';raw_out.mkdir(exist_ok=True)
    cache=Path(args.cache);cache.mkdir(parents=True,exist_ok=True)
    prior=json.loads((ROOT/'assets/data/satellite-signals-2026.json').read_text())
    tasks=prior['provenance'];sources=[];files={}
    def fetch_source(task):
        key,day=task['layer'],task['valid_date'];url=task['url']
        path=cache/f'{key}-{day}.tif'
        if key=='ndvi':url=url.replace('SCALEFACTOR=0.05','SCALEFACTOR=1')
        else:
            original=Path('/tmp/nebraskabeans-wcs-cache')/path.name
            if original.exists() and not path.exists():shutil.copyfile(original,path)
        retrieval_path=cache/(path.name+'.retrieval.json')
        if not path.exists():
            request=urllib.request.Request(url,headers={'User-Agent':'NebraskaBeans-GISit-crop-evidence/1.0'})
            with urllib.request.urlopen(request,timeout=90) as r:raw=r.read()
            with tempfile.NamedTemporaryFile(dir=cache,delete=False) as temp:temp.write(raw);temporary=Path(temp.name)
            os.replace(temporary,path)
            retrieval_path.write_text(json.dumps({'retrieved_at_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'url':url}))
        spec=grid(path)
        if key=='smap_anomaly' and sha(path)!=task['sha256']:raise ValueError('Original SMAP bytes changed')
        destination=raw_out/(path.name+'.gz');preserve(path,destination)
        source=dict(layer=key,requested_date=task['requested_date'],valid_date=day,url=url,
                            sha256=sha(path),bytes=path.stat().st_size,raw_file='raw/'+destination.name,
                            raw_gzip_sha256=sha(destination),retrieved_at_utc=json.loads(retrieval_path.read_text())['retrieved_at_utc'] if retrieval_path.exists() else None,
                            retrieval_time_status='captured on download' if retrieval_path.exists() else 'not captured for cached source bytes')
        print(f'SOURCE {key} {day}: {spec["width"]} x {spec["height"]}',flush=True)
        return (key,task['requested_date']),(path,spec),source
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        for key,value,source in executor.map(fetch_source,tasks):files[key]=value;sources.append(source)
    grids={key:next(spec for (k,day),(p,spec) in files.items() if k==key) for key in ['ndvi','smap_anomaly']}
    for (key,day),(path,spec) in files.items():
        if spec!=grids[key]:raise ValueError('Grid changes require separate area weights')
    weight_path=out/'crop-grid-weights.json'
    if weight_path.exists():
        weights=json.loads(weight_path.read_text())
        if weights['grid_contracts']!=grids or weights['footprint_manifest_sha256']!=sha(ROOT/'assets/data/crop-footprint/crop-footprint-manifest.json'):raise ValueError('Cached weights have different grids or crop footprint')
    else:weights=make_weights(args.cdl,grids,weight_path)
    states={fips:dict(state=record['state'],mapped_acres=record['mapped_acres'],dates={}) for fips,record in weights['states'].items()}
    for (key,day),(path,spec) in files.items():
        for fips,record in weights['states'].items():
            summary=summarize(path,record['grids'][key]);summary['valid_date']=next(s['valid_date'] for s in sources if s['layer']==key and s['requested_date']==day)
            states[fips]['dates'].setdefault(day,{})[key]=summary
    artifact=dict(schema='gisit.crop-weighted-evidence.v1',classification='DERIVED',source_classification='MODELED',
                  crop_year=2025,model_input=False,weights_sha256=sha(weight_path),states=states,sources=sources,
                  weight_statistics_method='Area-weighted arithmetic mean and lower weighted median; nodata excluded with coverage disclosed.',
                  limitations=['Historical 2025 crop footprint, not confirmed 2026 planted acreage.',
                    'Crop-area-weighted source cells still contain mixed land cover; not bean-only measurements.',
                    'NDVI uses the unscaled service grid, not HLS; source-encoded index has no asserted physical unit.',
                    'Source QA masks beyond declared nodata are unavailable; coverage is not calibrated confidence.',
                    'Weekly checkpoints; requested and actual source dates are distinct. Historical receipt times unavailable.',
                    'No yield model coefficients or prediction outputs are changed by this artifact.'])
    (out/'crop-weighted-evidence.json').write_text(json.dumps(artifact,indent=2)+'\n')
    print('BUILT crop-weighted evidence; independent reconciliation required',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--cdl',required=True);p.add_argument('--cache',default='/tmp/nebraskabeans-wcs-native');p.add_argument('--out',default=str(ROOT/'assets/data/crop-evidence'));build(p.parse_args())
