#!/usr/bin/env python3
"""Native CDL class polygons, streamed in bounded windows; never infer current crops.

Input raster must be an equal-area, metre-based grid. Every classified bean pixel
whose centre is in a supplied state is retained. Tile-edge splits are storage
partitions, not field boundaries. No simplification or small-patch deletion.
"""
import argparse
import hashlib
import gzip
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import geometry_mask, shapes
from rasterio.windows import Window, from_bounds
from pyproj import CRS, Transformer
from shapely.geometry import shape, mapping, box
from shapely.ops import transform

ACRE_M2 = 4046.8564224

def checksum(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def build(args):
    bounds_doc = json.loads(Path(args.states).read_text())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    summaries = []
    with rasterio.open(args.cdl) as src:
        crs = CRS(src.crs)
        method = crs.coordinate_operation.method_name.lower() if crs.coordinate_operation else ''
        if not crs.is_projected or 'equal area' not in method or any(a.unit_name != 'metre' for a in crs.axis_info):
            raise ValueError('Input must use a documented equal-area CRS in metres')
        if src.transform.b or src.transform.d:
            raise ValueError('Rotated grids need a separately validated window contract')
        pixel_area = abs(src.transform.a * src.transform.e)
        to_native = Transformer.from_crs(4326, crs, always_xy=True).transform
        to_wgs = Transformer.from_crs(crs, 4326, always_xy=True).transform
        for feat in bounds_doc['features']:
            props = feat['properties']
            state_id = props.get('STATE') or props.get('STATEFP')
            name = props['NAME']
            native = transform(to_native, shape(feat['geometry']))
            extent = from_bounds(*native.bounds, src.transform)
            left = max(0, int(np.floor(extent.col_off)))
            top = max(0, int(np.floor(extent.row_off)))
            right = min(src.width, int(np.ceil(extent.col_off + extent.width)))
            bottom = min(src.height, int(np.ceil(extent.row_off + extent.height)))
            pixels = 0
            polygon_m2 = 0.0
            count = 0
            target = out / f'cdl-{args.year}-{state_id}.geojson'
            with target.open('w') as f:
                f.write('{"type":"FeatureCollection","features":[')
                for row in range(top, bottom, args.tile):
                    for col in range(left, right, args.tile):
                        win = Window(col, row, min(args.tile, right-col), min(args.tile, bottom-row))
                        tile_bounds=box(*rasterio.windows.bounds(win, src.transform))
                        if not native.intersects(tile_bounds):
                            continue
                        band = src.read(1, window=win, masked=True)
                        bean = np.asarray(band.filled(0) == 42)
                        if not bean.any():
                            continue
                        tr = src.window_transform(win)
                        if not native.covers(tile_bounds):
                            inside = geometry_mask([mapping(native.intersection(tile_bounds))], out_shape=bean.shape, transform=tr, invert=True)
                            bean &= inside
                        pixels += int(bean.sum())
                        for geom, value in shapes(bean.astype('uint8'), mask=bean, transform=tr):
                            p = shape(geom)
                            polygon_m2 += p.area
                            record = {'type':'Feature', 'properties':{
                                'id':f'{state_id}-{row}-{col}-{count}', 'state_fips':state_id,
                                'state':name, 'crop_year':args.year, 'class_value':42,
                                'mapped_acres':p.area/ACRE_M2, 'evidence_class':'MODELED',
                                'current_season_confirmed':False, 'field_boundary':False,
                            }, 'geometry':mapping(transform(to_wgs,p))}
                            if count:
                                f.write(',')
                            f.write(json.dumps(record,separators=(',',':')))
                            count += 1
                f.write(']}')
            expected = pixels * pixel_area
            # Polygon and pixel area must agree to floating-point summation precision.
            if not np.isclose(expected, polygon_m2, rtol=1e-10, atol=1e-6):
                raise ValueError(f'{name}: polygon area {polygon_m2} != pixel area {expected}')
            compressed=target.with_suffix(target.suffix+'.gz')
            with target.open('rb') as inp, compressed.open('wb') as raw:
                with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as gz:
                    for chunk in iter(lambda:inp.read(1024*1024),b''):
                        gz.write(chunk)
            summary = {'state':name,'state_fips':state_id,'class_pixels':pixels,
                       'mapped_acres':expected/ACRE_M2,'polygon_area_m2':polygon_m2,
                       'polygon_parts':count,'file':compressed.name,'sha256':checksum(compressed),
                       'uncompressed_sha256':checksum(target)}
            summaries.append(summary)
            print(json.dumps(summary),flush=True)
        manifest = {'schema':'gisit.crop-footprint.v1','crop_year':args.year,
                    'evidence_class':'MODELED','class_value':42,'class_name':'Dry Beans',
                    'source_url':args.source_url,'source_sha256':args.source_sha256,
                    'source_crs':crs.to_string(),'pixel_size_m':[abs(src.transform.a),abs(src.transform.e)],
                    'state_boundaries_sha256':checksum(args.states),
                    'method':'native class-42 pixels; state membership by pixel centre; all patches retained',
                    'limitations':['Historical classified footprint; not current-season crop identity.',
                                   'Tile-edge parts are not fields or cadastral boundaries.',
                                   'No market-class identity; no local yield assigned.'],
                    'states':summaries}
        (out/'crop-footprint-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

if __name__ == '__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--cdl',required=True)
    ap.add_argument('--states',required=True)
    ap.add_argument('--out',required=True)
    ap.add_argument('--year',required=True,type=int)
    ap.add_argument('--source-url',required=True)
    ap.add_argument('--source-sha256',required=True)
    ap.add_argument('--tile',type=int,default=2048)
    build(ap.parse_args())
