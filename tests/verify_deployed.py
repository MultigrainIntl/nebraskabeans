"""Wait for the served application bytes, not just an unchanged page title."""
import concurrent.futures
import hashlib
from pathlib import Path
import sys
import time
import urllib.request
import urllib.parse

base = sys.argv[1]
paths = ['index.html', 'assets/app.js', 'assets/frame-buffer.js',
         'assets/spatial-evidence.js', 'assets/site.css',
         'assets/data/build-manifest.json']
expected = {p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}

def check(path, attempt):
    url = urllib.parse.urljoin(base, path) + '?verify=' + str(attempt)
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            return path, hashlib.sha256(response.read()).hexdigest() == expected[path]
    except Exception:
        return path, False

for attempt in range(24):
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda p: check(p, time.time_ns()), paths))
    pending = [p for p, matched in results if not matched]
    if not pending:
        print('PASS deployed application bytes match exact checkout', flush=True)
        break
    print('Waiting for published files: ' + ', '.join(pending), flush=True)
    time.sleep(5)
else:
    raise SystemExit('FAIL deployed application did not match candidate')
