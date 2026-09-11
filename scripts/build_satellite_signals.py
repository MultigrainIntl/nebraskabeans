#!/usr/bin/env python3
"""Sample governed Crop-CASMA WCS layers for the seven analytical areas.

The output is a sparse weekly evidence series used to corroborate the
weather/GDD outlook.  Values are neighborhood medians from the source grid;
they are not dry-bean-only measurements until a CDL crop mask is applied.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import io
import json
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
START = dt.date(2026, 4, 15)
END = dt.date(2026, 9, 9)
BOUNDS = [[36.75, -111.0], [45.25, -94.25]]
ENDPOINT = "https://cloud.csiss.gmu.edu/smap_server/cgi-bin/mapserv"
AREAS = [
    {"id": "ne-panhandle", "name": "Nebraska Panhandle", "center": [41.75, -103.20]},
    {"id": "sw-nebraska", "name": "Southwest Nebraska", "center": [40.25, -101.55]},
    {"id": "ne-colorado", "name": "Northeast / East-Central Colorado", "center": [40.40, -103.40]},
    {"id": "western-colorado", "name": "Western Colorado", "center": [38.55, -108.30]},
    {"id": "big-horn", "name": "Big Horn Basin", "center": [44.10, -108.20]},
    {"id": "se-wyoming", "name": "Southeast Wyoming", "center": [42.00, -104.50]},
    {"id": "nw-kansas", "name": "Northwest / West-Central Kansas", "center": [39.25, -101.60]},
]
LAYERS = {
    "smap_anomaly": {
        "map": "/WMS/SMAP-9KM-ANOMALY-DAILY-SUB_2026.map",
        "coverage": "SMAP-9KM-ANOMALY-DAILY-SUB_{date}",
        "scale": "1",
        "radius": 1,
        "classification": "MODELED",
        "meaning": "NASA SMAP L4 0–100 cm soil-moisture anomaly; sign is relative to the source climatology",
    },
    "ndvi": {
        "map": "/WMS/NDVI-DAILY_2026.map",
        "coverage": "NDVI-DAILY_{date}",
        "scale": "0.05",
        "radius": 3,
        "classification": "MODELED",
        "meaning": "Source-encoded daily NDVI index; used only for within-source direction of change because scale metadata is not published in the service guide",
    },
}


def dates():
    values, day = [], START
    while day <= END:
        values.append(day)
        day += dt.timedelta(days=7)
    if values[-1] != END:
        values.append(END)
    return values


def request_url(layer, day):
    cfg = LAYERS[layer]
    dot = day.isoformat().replace("-", ".")
    params = [
        ("SERVICE", "WCS"),
        ("VERSION", "2.0.1"),
        ("REQUEST", "GetCoverage"),
        ("MAP", cfg["map"]),
        ("COVERAGEID", cfg["coverage"].replace("{date}", dot)),
        ("FORMAT", "image/tiff"),
        ("SUBSET", f"x({BOUNDS[0][1]},{BOUNDS[1][1]})"),
        ("SUBSET", f"y({BOUNDS[0][0]},{BOUNDS[1][0]})"),
        ("SUBSETTINGCRS", "http://www.opengis.net/def/crs/EPSG/0/4326"),
        ("SCALEFACTOR", cfg["scale"]),
    ]
    return ENDPOINT + "?" + urllib.parse.urlencode(params, safe="()/,:")


def get(url):
    last = None
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "NebraskaBeans-GISit-evidence/1.0"})
            with urllib.request.urlopen(request, timeout=180) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code == 404:
                raise
            last = error
            time.sleep(2 ** attempt)
        except (urllib.error.URLError, TimeoutError) as error:
            last = error
            time.sleep(2 ** attempt)
    raise last


def sample_tiff(raw, radius):
    image = Image.open(io.BytesIO(raw))
    tie = image.tag_v2[33922]
    scale = image.tag_v2[33550]
    west, north = float(tie[3]), float(tie[4])
    dx, dy = float(scale[0]), float(scale[1])
    nodata = float(image.tag_v2.get(42113, -9999))
    samples = {}
    for area in AREAS:
        lat, lon = area["center"]
        x = round((lon - west) / dx)
        y = round((north - lat) / dy)
        values = []
        for yy in range(max(0, y - radius), min(image.height, y + radius + 1)):
            for xx in range(max(0, x - radius), min(image.width, x + radius + 1)):
                value = float(image.getpixel((xx, yy)))
                if value != nodata and value > -9000:
                    values.append(value)
        samples[area["id"]] = round(float(statistics.median(values)), 4) if values else None
    return samples, {"width": image.width, "height": image.height, "pixel_size_degrees": [dx, dy], "nodata": nodata}


def fetch_one(task):
    layer, requested_day, cache_dir = task
    raw = url = valid_day = None
    for fallback in range(8):
        candidate = requested_day - dt.timedelta(days=fallback)
        candidate_url = request_url(layer, candidate)
        cache_path = cache_dir / f"{layer}-{candidate.isoformat()}.tif" if cache_dir else None
        try:
            if cache_path and cache_path.exists():
                candidate_raw = cache_path.read_bytes()
            else:
                candidate_raw = get(candidate_url)
                if cache_path:
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    cache_path.write_bytes(candidate_raw)
            raw, url, valid_day = candidate_raw, candidate_url, candidate
            break
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
    if raw is None:
        raise RuntimeError(f"No {layer} coverage for {requested_day} or the prior seven days")
    values, grid = sample_tiff(raw, LAYERS[layer]["radius"])
    return layer, requested_day, valid_day, values, grid, hashlib.sha256(raw).hexdigest(), len(raw), url


def build(output, cache_dir):
    tasks = [(layer, day, cache_dir) for day in dates() for layer in LAYERS]
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        for result in executor.map(fetch_one, tasks):
            results.append(result)
            print(f"FETCHED {result[0]} requested {result[1]} valid {result[2]}")
    series = {area["id"]: {} for area in AREAS}
    provenance = []
    grids = {}
    for layer, requested_day, valid_day, values, grid, checksum, byte_count, url in sorted(results, key=lambda x: (x[1], x[0])):
        grids[layer] = grid
        for area_id, value in values.items():
            row = series[area_id].setdefault(requested_day.isoformat(), {})
            row[layer] = value
            row[f"{layer}_valid_date"] = valid_day.isoformat()
        provenance.append({"layer": layer, "requested_date": requested_day.isoformat(), "valid_date": valid_day.isoformat(), "url": url, "sha256": checksum, "bytes": byte_count})

    # A direction-only vegetation signal avoids inventing an undocumented unit conversion.
    for area_id, rows in series.items():
        prior = None
        for day in sorted(rows):
            value = rows[day]["ndvi"]
            rows[day]["ndvi_change_encoded"] = round(value - prior, 4) if value is not None and prior is not None else None
            prior = value

    artifact = {
        "schema_version": "nebraskabeans.satellite_signals.v1",
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "analysis_start": START.isoformat(),
        "analysis_end": END.isoformat(),
        "cadence": "weekly checkpoints plus analysis end; UI uses the latest checkpoint on or before the selected date",
        "study_bounds": BOUNDS,
        "classification": "MODELED",
        "layers": {name: {k: v for k, v in cfg.items() if k not in {"map", "coverage"}} for name, cfg in LAYERS.items()},
        "grids": grids,
        "areas": {area["id"]: {"name": area["name"], "center": area["center"], "dates": series[area["id"]]} for area in AREAS},
        "limitations": [
            "Neighborhoods are centered on generalized analytical points and are not clipped to dry-bean pixels.",
            "SMAP is a modeled root-zone product and NDVI is a modeled/composited vegetation product; neither is a field measurement.",
            "NDVI is retained in the service's encoded values and is used only for direction of change, not as a physical-unit claim.",
            "A crop-health classification requires both a released GISit weather/GDD outlook and these two corroborating evidence families.",
        ],
        "provenance": provenance,
    }
    artifact["artifact_sha256"] = hashlib.sha256((json.dumps(artifact, indent=2) + "\n").encode()).hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, indent=2) + "\n")
    print(f"WROTE {output} · {len(tasks)} governed WCS requests")


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "assets/data/satellite-signals-2026.json")
    parser.add_argument("--cache-dir", type=Path, default=Path("/tmp/nebraskabeans-wcs-cache"))
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    build(arguments.output, arguments.cache_dir)
