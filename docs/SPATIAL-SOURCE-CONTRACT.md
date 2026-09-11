# Crop geography and direct-station evidence

Status: IMPLEMENTED-NOT-VERIFIED; source acquisition and local build in progress.
Starting staging commit: 5f5ca45a0d46f025616b4ab5204f3857cbb33485.

## Crop footprint

USDA national 2025 CDL, native 10 m, class 42. The official release page supplies
the archive URL recorded in `assets/data/cdl-source.json`. This is public USDA
classification evidence with source attribution, not a grower parcel record.
Retain crop year, archive checksum, native CRS, native cell size, reference-boundary
checksum, transform version and output checksums. No current crop or market-class
identity is inferred. Current-season estimation remains a mandatory separate task.

Processing is windowed to bound memory. Every valid class-42 pixel whose centre is
inside the state is retained. No small-patch threshold or geometry simplification
is allowed in the analytical output. Polygon parts may be split at processing
tile edges and are explicitly not field boundaries. Areas use native metre-based
equal-area coordinates. Polygon area must equal pixel count times cell area.
WGS84 geometry is presentation support; acreage is never measured in degrees.
Lossless gzip reduces transfer size without changing coordinates or small patches.

The national archive is approximately 10.1 GB compressed; its native TIFF member
is 14.9 GB. The local 32 GB filesystem can hold acquisition and extraction, but
a production refresh architecture must measure peak disk, memory, execution time
and output size before selecting scheduled infrastructure. Historical CDL is
annual and must not be downloaded every weather refresh.

## Direct station observations

IEM ASOS/AWOS archive, NE/CO/WY/KS networks. Primary NOAA directory probe returned
metadata ending 2025-08-28; tested NOAA 2026 global-hourly and ISD-Lite paths returned
404. This establishes failure of those tested paths, not all NOAA services.
IEM supplies 2026 records and documents mixed underlying sources and limited QC:
https://mesonet.agron.iastate.edu/request/download.phtml
https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?help=

The ingest retains original metadata, compressed CSV bytes, exact request,
SHA256 and retrieval time. Four network queries honor the provider's one-second
per-IP throttle. Missing values remain null. Display selects the latest routine
report within each UTC day; no daily precipitation total, daily extreme or GDD
is inferred from incomplete samples. Units remain Fahrenheit, knots and inches
with explicit labels. No record from another date fills an empty selected date.

Historical receipt/issue time is unavailable, so this is a current-truth archive,
not historical-as-known reconstruction. Per-value provider QC is absent from this
export. These observations are separate point evidence; station/gridded-model
comparison, agronomic-network expansion, and operational QC remain W05 work.

## Downstream release restrictions

Historical bean area does not prove current planting or market-class distribution.
State yield cannot be the unweighted mean of hand-selected centroids. Pinto yield
cannot silently multiply all-market-class acreage. Production remains gated until
spatial weights, compatible class bases and uncertainty propagation are validated.
Point estimates cannot be painted onto native crop polygons as field-scale yield.
Fine crop boundaries do not increase the resolution of coarse weather/SMAP data.
