#!/usr/bin/env python3
"""Build a defensible NebraskaBeans crop mask from USDA NASS CDL class 42.

This is an offline/reproducible preprocessing step, not a browser-side guess.
It intentionally requires an authoritative CDL GeoTIFF input supplied by USDA.

Example:
  python scripts/build_cdl_drybean.py \
    --cdl /data/2025_30m_cdls/2025_30m_cdls.tif \
    --states assets/data/state-study-area.geojson \
    --out assets/data/cdl_2025_drybeans.geojson \
    --summary assets/data/cdl_2025_drybeans_summary.json

Requirements: rasterio, shapely, pyproj. Optional geopandas is not required.
"""
from __future__ import annotations
import argparse, json, math
from collections import defaultdict
from pathlib import Path

DRY_BEAN_CLASS = 42
SQM_PER_ACRE = 4046.8564224
SOURCE = {
    "provider": "USDA National Agricultural Statistics Service",
    "dataset": "Cropland Data Layer",
    "crop_year": 2025,
    "class_value": DRY_BEAN_CLASS,
    "class_name": "Dry Beans",
    "classification": "MODELED",
    "source_url": "https://www.nass.usda.gov/Research_and_Science/Cropland/Release/",
    "release_note": "2025 CDL released in 2026; it is crop-derived historical geography and does not prove 2026 field identity."
}

def require_libs():
    try:
        import rasterio
        from rasterio.features import shapes
        from rasterio.mask import mask
        from shapely.geometry import shape, mapping
        from shapely.ops import unary_union, transform
        from pyproj import Transformer
        return rasterio, shapes, mask, shape, mapping, unary_union, transform, Transformer
    except ImportError as exc:
        raise SystemExit("Missing dependency. Install rasterio shapely pyproj before running.") from exc

def read_features(path, shape):
    data=json.loads(Path(path).read_text())
    out=[]
    for f in data.get('features',[]):
        g=shape(f['geometry'])
        if not g.is_empty:
            out.append((f.get('properties',{}),g))
    if not out: raise SystemExit('No study-area geometries found')
    return data.get('crs'),out

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--cdl',required=True,help='USDA CDL GeoTIFF')
    ap.add_argument('--states',required=True,help='GeoJSON boundaries/study areas; geometry coordinates must be EPSG:4326')
    ap.add_argument('--out',required=True)
    ap.add_argument('--summary',required=True)
    ap.add_argument('--min-acres',type=float,default=5.0,help='Drop isolated components below this mapped area')
    ap.add_argument('--simplify-m',type=float,default=30.0,help='Topology-preserving simplification in raster CRS units/metres where applicable')
    args=ap.parse_args()
    rasterio, shapes, rmask, shape, mapping, unary_union, transform, Transformer=require_libs()
    _,areas=read_features(args.states,shape)
    features=[]; summary=[]
    with rasterio.open(args.cdl) as src:
        if not src.crs: raise SystemExit('CDL raster has no CRS')
        to_raster=Transformer.from_crs('EPSG:4326',src.crs,always_xy=True).transform
        to_wgs=Transformer.from_crs(src.crs,'EPSG:4326',always_xy=True).transform
        pixel_area=abs(src.transform.a*src.transform.e-src.transform.b*src.transform.d)
        for props,geom4326 in areas:
            geomr=transform(to_raster,geom4326)
            data,tr=rmask(src,[mapping(geomr)],crop=True,filled=True,nodata=0)
            band=data[0]
            mask_arr=(band==DRY_BEAN_CLASS)
            px=int(mask_arr.sum())
            mapped_acres=px*pixel_area/SQM_PER_ACRE
            pieces=[]
            if px:
                for gj,val in shapes(mask_arr.astype('uint8'),mask=mask_arr,transform=tr):
                    if int(val)!=1: continue
                    p=shape(gj)
                    if p.area/SQM_PER_ACRE>=args.min_acres: pieces.append(p)
            merged=unary_union(pieces) if pieces else None
            if merged and not merged.is_empty:
                if args.simplify_m>0: merged=merged.simplify(args.simplify_m,preserve_topology=True)
                wgs=transform(to_wgs,merged)
                outprops={**props,"mapped_acres_2025":round(mapped_acres,1),"source":"USDA NASS CDL","crop_class":42,"crop_year":2025,"evidence_class":"MODELED","current_year_identity":False}
                features.append({"type":"Feature","properties":outprops,"geometry":mapping(wgs)})
            summary.append({**props,"dry_bean_pixels":px,"mapped_acres_2025":round(mapped_acres,1)})
    fc={"type":"FeatureCollection","name":"USDA CDL 2025 dry beans class 42","source":SOURCE,"features":features}
    Path(args.out).parent.mkdir(parents=True,exist_ok=True);Path(args.out).write_text(json.dumps(fc,separators=(',',':')))
    Path(args.summary).write_text(json.dumps({"source":SOURCE,"areas":summary},indent=2))
    print(json.dumps({"features":len(features),"areas":len(summary),"out":args.out,"summary":args.summary},indent=2))
if __name__=='__main__': main()
