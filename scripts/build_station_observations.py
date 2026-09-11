#!/usr/bin/env python3
"""Preserve ASOS observations, via IEM, as separate point evidence.

This is current-truth historical observation data. Historical receipt/issue times
are unavailable; it must not be used to claim an as-known historical replay.
Latest report per UTC day is displayed; no incomplete-day precipitation totals.
"""
import argparse,csv,gzip,hashlib,io,json,time
from datetime import datetime,timezone,date,timedelta
from pathlib import Path
from urllib.request import urlopen,Request
from urllib.parse import urlencode

NETWORKS=['NE_ASOS','CO_ASOS','WY_ASOS','KS_ASOS']
DOC='https://mesonet.agron.iastate.edu/request/download.phtml'

def fetch(url):
    with urlopen(Request(url,headers={'User-Agent':'NebraskaBeans-GISit/1.0'}),timeout=180) as r:
        raw=r.read()
    return raw,{'url':url,'sha256':hashlib.sha256(raw).hexdigest(),
                'retrieved_at':datetime.now(timezone.utc).isoformat()}

def number(value):
    try:return float(value)
    except (TypeError,ValueError):return None

def build(args):
    root=Path(args.out);root.mkdir(parents=True,exist_ok=True)
    rawdir=root/'raw';rawdir.mkdir(exist_ok=True)
    records=[];sources=[]
    end=(date.fromisoformat(args.end)+timedelta(days=1)).isoformat()
    for network in NETWORKS:
        raw,source=fetch(f'https://mesonet.agron.iastate.edu/geojson/network/{network}.geojson')
        (rawdir/f'{network}-metadata.json').write_bytes(raw);sources.append(source)
        metadata=json.loads(raw)
        stations={f['id']:f for f in metadata['features'] if f['properties']['archive_begin'] and f['properties']['archive_begin']<=args.end and (not f['properties']['archive_end'] or f['properties']['archive_end']>=args.start)}
        params={'network':network,'station':','.join(sorted(stations)),'data':['tmpf','dwpf','sknt','p01i'],
                'sts':args.start+'T00:00:00Z','ets':end+'T00:00:00Z','tz':'Etc/UTC',
                'format':'onlycomma','missing':'M','trace':'empty','report_type':3}
        time.sleep(1.1) # provider requires at least one second between queries
        raw,source=fetch('https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?'+urlencode(params,doseq=True))
        if not raw.startswith(b'station,valid,'):
            raise ValueError(f'{network}: malformed observation response')
        (rawdir/f'{network}-observations.csv.gz').write_bytes(gzip.compress(raw,mtime=0))
        sources.append(source)
        daily={sid:{} for sid in stations}
        for row in csv.DictReader(io.StringIO(raw.decode())):
            sid=row['station'];valid=row['valid'];day=valid[:10]
            if sid not in stations or not args.start<=day<=args.end:
                raise ValueError('Unexpected station or date in source response')
            old=daily[sid].get(day)
            if old and old['valid_time']>=valid.replace(' ','T')+':00Z':continue
            daily[sid][day]={'valid_time':valid.replace(' ','T')+':00Z',
                            'temperature_f':number(row['tmpf']),'dewpoint_f':number(row['dwpf']),
                            'wind_knots':number(row['sknt']),'reported_precip_in':number(row['p01i']),
                            'precip_note':'reported hourly accumulation; missing/trace may be null; not daily total'}
        for sid,feature in stations.items():
            p=feature['properties']
            records.append({'id':network+':'+sid,'station':sid,'name':p['sname'],
                            'network':network,'state':p['state'],'coordinates':feature['geometry']['coordinates'],
                            'elevation_m':p['elevation'],'source_sha256':source['sha256'],
                            'dates':daily[sid]})
        print(json.dumps({'network':network,'stations':len(stations),'station_days':sum(map(len,daily.values()))}),flush=True)
    result={'schema':'gisit.station-observations.v1','start':args.start,'end':args.end,
            'evidence_class':'OBSERVED','provider':'Iowa Environmental Mesonet ASOS/AWOS archive',
            'documentation':DOC,'temporal_mode':'current-truth historical observations',
            'issue_time_available':False,'quality':'Provider performs limited quality control; no per-value QC flags in this export.',
            'method':'Latest routine report in each UTC day; no imputation or spatial interpolation.',
            'model_input':False,'sources':sources,'stations':records}
    output=(json.dumps(result,separators=(',',':'))+'\n').encode()
    (root/'station-observations.json.gz').write_bytes(gzip.compress(output,mtime=0))

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--start',required=True);ap.add_argument('--end',required=True);ap.add_argument('--out',required=True)
    build(ap.parse_args())
