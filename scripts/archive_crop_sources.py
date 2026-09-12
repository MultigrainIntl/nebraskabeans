#!/usr/bin/env python3
"""Archive exact public source bytes on the isolated evidence branch."""
import concurrent.futures
import gzip
import hashlib
import io
import json
from pathlib import Path
import urllib.parse
import urllib.request

root=Path(__file__).resolve().parents[1]/'assets/data/crop-evidence'
manifest=json.loads((root/'crop-weighted-evidence.json').read_text())

def archive(source):
    url=urllib.parse.urlparse(source['url'])
    if url.scheme!='https' or url.hostname!='cloud.csiss.gmu.edu':raise ValueError('Unexpected source host')
    destination=(root/source['raw_file']).resolve()
    if not destination.is_relative_to(root.resolve()):raise ValueError('Invalid archive path')
    if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest()==source['raw_gzip_sha256']:return
    with urllib.request.urlopen(source['url'],timeout=120) as response:raw=response.read()
    if hashlib.sha256(raw).hexdigest()!=source['sha256']:raise ValueError('Source revision changed: '+source['raw_file'])
    stream=io.BytesIO()
    with gzip.GzipFile(filename='',mode='wb',fileobj=stream,mtime=0) as out:out.write(raw)
    compressed=stream.getvalue()
    if hashlib.sha256(compressed).hexdigest()!=source['raw_gzip_sha256']:raise ValueError('Archive compression differs: '+source['raw_file'])
    destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(compressed)
    print('ARCHIVED '+source['raw_file'],flush=True)

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:list(executor.map(archive,manifest['sources']))
print('PASS all 44 source archives match the declared byte checksums',flush=True)
