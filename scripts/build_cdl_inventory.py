#!/usr/bin/env python3
"""Build county dry-bean crop-area evidence from USDA CropScape CDL statistics.

This is a preprocessing utility for W03. It does not infer production regions from
county names. It asks CropScape for every county in NE/CO/WY/KS and preserves
class-42 acreage by crop year so region weights can be based on observed crop
classification rather than arbitrary county lists.

No API key is required by CropScape. Output remains MODELED remote-sensing evidence.
"""
from __future__ import annotations
import argparse, html, json, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path

TIGER='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query'
CDL='https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLStat'
STATES={'31':'Nebraska','08':'Colorado','56':'Wyoming','20':'Kansas'}
DRY_BEANS=42

def get(url,timeout=45):
    req=urllib.request.Request(url,headers={'User-Agent':'NebraskaBeans-GISit/1.0','Accept':'application/json,application/xml,text/xml,*/*'})
    with urllib.request.urlopen(req,timeout=timeout) as r:return r.read().decode('utf-8','replace')

def counties(state):
    q=urllib.parse.urlencode({'where':f"STATE='{state}'",'outFields':'NAME,BASENAME,GEOID,STATE','returnGeometry':'false','f':'json'})
    data=json.loads(get(TIGER+'?'+q))
    return sorted([{'name':f['attributes'].get('BASENAME') or f['attributes']['NAME'],'geoid':f['attributes']['GEOID']} for f in data.get('features',[])],key=lambda x:x['geoid'])

def unwrap(raw):
    """Return embedded CropScape JSON/text independent of Axis2 response tag name."""
    try:
        root=ET.fromstring(raw)
        texts=[]
        for node in root.iter():
            if node.text and node.text.strip(): texts.append(node.text.strip())
        candidates=list(reversed(texts))
    except ET.ParseError:
        candidates=[raw]
    for text in candidates:
        text=html.unescape(text).strip()
        if text.startswith('{') or text.startswith('['):
            try:return json.loads(text)
            except json.JSONDecodeError:pass
    return candidates[0] if candidates else raw

def rows(obj):
    if isinstance(obj,list):return obj
    if isinstance(obj,dict):
        for k in ('data','rows','result','results','statistics','stats'):
            if isinstance(obj.get(k),list):return obj[k]
        # Some CropScape responses use a dict keyed by class/value.
        if all(isinstance(v,dict) for v in obj.values()):return list(obj.values())
    if isinstance(obj,str):
        # Fallback for CSV/TXT-like payload; robust enough to identify class 42.
        lines=[x.strip() for x in obj.splitlines() if x.strip()]
        if len(lines)>1 and ',' in lines[0]:
            import csv,io
            return list(csv.DictReader(io.StringIO(obj)))
    return []

def num(v):
    try:return float(str(v).replace(',','').strip())
    except:return None

def bean_acres(payload):
    for r in rows(payload):
        lower={str(k).lower():v for k,v in r.items()}
        value=lower.get('value') or lower.get('class') or lower.get('code') or lower.get('categoryvalue')
        if str(value).strip() not in ('42','42.0'):continue
        for key in ('acreage','acres','area_acres','area'):
            a=num(lower.get(key))
            if a is not None:return a
        # Pixel count can be retained but is not converted here because CDL resolution varies by year/product.
        return None
    return None

def stat(year,fips,fmt='json'):
    q=urllib.parse.urlencode({'year':year,'fips':fips,'format':fmt})
    return unwrap(get(CDL+'?'+q))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--years',default='2023,2024,2025');ap.add_argument('--out',default='assets/data/cdl_county_drybean_inventory.json');ap.add_argument('--delay',type=float,default=.15);args=ap.parse_args()
    years=[int(x) for x in args.years.split(',') if x.strip()]
    records=[];failures=[]
    for state,state_name in STATES.items():
        for c in counties(state):
            by_year={}
            for year in years:
                try:
                    p=stat(year,c['geoid']);a=bean_acres(p);by_year[str(year)]={'mapped_acres':a,'classification':'MODELED','source':'USDA NASS CDL via CropScape'}
                except Exception as exc:
                    by_year[str(year)]={'mapped_acres':None,'classification':'UNKNOWN','error':str(exc)};failures.append({'geoid':c['geoid'],'year':year,'error':str(exc)})
                time.sleep(args.delay)
            records.append({'state_fips':state,'state':state_name,'county_fips':c['geoid'],'county':c['name'],'dry_beans':by_year})
    out={'schema_version':'nebraskabeans.cdl_county_inventory.v1','crop_class':42,'crop_name':'Dry Beans','years':years,'evidence_class':'MODELED','source':{'provider':'USDA NASS','dataset':'Cropland Data Layer','access':'CropScape GetCDLStat','developer_docs':'https://nassgeodata.gmu.edu/CropScape/devhelp/cropscapews.html'},'records':records,'failures':failures}
    Path(args.out).parent.mkdir(parents=True,exist_ok=True);Path(args.out).write_text(json.dumps(out,indent=2));print(json.dumps({'counties':len(records),'failures':len(failures),'out':args.out},indent=2))
if __name__=='__main__':main()
