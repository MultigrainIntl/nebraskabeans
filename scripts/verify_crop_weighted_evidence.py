#!/usr/bin/env python3
"""Reconcile crop weights by independently clipping source-cell footprints to CDL."""
import gzip
import json
import random
from pathlib import Path
import sys
import hashlib
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds,Window
from pyproj import Transformer
from shapely.geometry import box,shape,mapping
from shapely.ops import transform

root=Path(__file__).resolve().parents[1]
folder=root/'assets/data/crop-evidence'
w=json.loads((folder/'crop-grid-weights.json').read_text())
e=json.loads((folder/'crop-weighted-evidence.json').read_text())
b=json.loads((root/'assets/data/state-study-area.geojson').read_text())
project=Transformer.from_crs(4326,5070,always_xy=True).transform
states={f['properties']['STATE']:transform(project,shape(f['geometry'])) for f in b['features']}
checks=[]
with rasterio.open(sys.argv[1]) as cdl:
    for fips,state in w['states'].items():
        for name,weight in state['grids'].items():
            cells=dict(weight['cells']);assert sum(cells.values())+weight['outside_pixels']==state['class_pixels']
            spec=w['grid_contracts'][name];a,_,c,_,v,f=spec['transform']
            chosen=sorted(cells,key=cells.get,reverse=True)[:2]+random.Random(42).sample(sorted(cells),3)
            for idx in chosen:
                row,col=divmod(idx,spec['width']);west=c+col*a;east=west+a;north=f+row*v;south=north+v
                polygon=transform(project,box(west,south,east,north).segmentize(min(a,abs(v))/100)).intersection(states[fips])
                win=from_bounds(*polygon.bounds,cdl.transform)
                left=int(np.floor(win.col_off));top=int(np.floor(win.row_off));right=int(np.ceil(win.col_off+win.width));bottom=int(np.ceil(win.row_off+win.height))
                win=Window(left,top,right-left,bottom-top)
                mask=geometry_mask([mapping(polygon)],out_shape=(int(win.height),int(win.width)),transform=cdl.window_transform(win),invert=True)
                actual=int(((cdl.read(1,window=win)==42)&mask).sum())
                if actual!=cells[idx]:raise AssertionError((fips,name,idx,actual,cells[idx]))
                checks.append(dict(state=fips,grid=name,cell=idx,pixels=actual))
        for day,layers in e['states'][fips]['dates'].items():
            for name,summary in layers.items():
                assert summary['total_crop_pixels']==state['class_pixels']
                assert summary['valid_crop_pixels']+summary['nodata_crop_pixels']+summary['outside_grid_crop_pixels']==state['class_pixels']
# Reconstruct native bytes, independently expand cell values into equal-area pixels,
# and compare direct means/lower medians for every state on the last checkpoint.
for source in e['sources']:
    compressed=(folder/source['raw_file']).read_bytes()
    assert hashlib.sha256(compressed).hexdigest()==source['raw_gzip_sha256']
    raw=gzip.decompress(compressed);assert hashlib.sha256(raw).hexdigest()==source['sha256']
    if source['requested_date']!='2026-09-09':continue
    from rasterio.io import MemoryFile
    with MemoryFile(raw) as memory:
        with memory.open() as dataset:
            values=dataset.read(1,masked=True).reshape(-1)
            for fips,state in w['states'].items():
                pairs=state['grids'][source['layer']]['cells'];expanded=[]
                for idx,count in pairs:
                    if not np.ma.is_masked(values[idx]):expanded.append(np.repeat(float(values[idx]),count))
                data=np.concatenate(expanded);expected=e['states'][fips]['dates']['2026-09-09'][source['layer']]
                assert np.isclose(data.mean(),expected['mean'],rtol=0,atol=1e-12)
                lower=np.partition(data,(len(data)-1)//2)[(len(data)-1)//2]
                assert lower==expected['median']
report=dict(status='PASS',independent_source_cell_clips=len(checks),checks=checks,
            raw_sources_verified=len(e['sources']),scope='Engineering reconciliation, not independent agronomic/model validation')
(folder/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='checks'}))
