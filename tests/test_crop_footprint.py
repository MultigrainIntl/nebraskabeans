"""Engineering fixtures only: not proof of real crop geography."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import rasterio
from rasterio.transform import from_origin
from pyproj import Transformer
from shapely.geometry import box, mapping, shape
from shapely.ops import transform

spec=importlib.util.spec_from_file_location('footprint',Path(__file__).parents[1]/'scripts/build_crop_footprint.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class CropFootprintTests(unittest.TestCase):
    def test_small_patches_nodata_tile_edges_and_area(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            # Five ten-metre pixels, including an isolated 100 m² patch and a
            # component crossing both processing tile boundaries.
            data=np.array([[42,0,0,0],[0,42,42,0],[0,42,42,255],[0,0,0,0]],dtype='uint8')
            tr=from_origin(0,100,10,10)
            with rasterio.open(root/'crop.tif','w',driver='GTiff',height=4,width=4,count=1,dtype='uint8',crs='EPSG:5070',transform=tr,nodata=255) as dst:
                dst.write(data,1)
            wgs=Transformer.from_crs(5070,4326,always_xy=True).transform
            states={'type':'FeatureCollection','features':[{'type':'Feature','properties':{'STATE':'31','NAME':'Fixture'},'geometry':mapping(transform(wgs,box(-1,59,41,101)))}]}
            (root/'states.json').write_text(json.dumps(states))
            args=SimpleNamespace(cdl=str(root/'crop.tif'),states=str(root/'states.json'),out=str(root/'out'),year=2025,source_url='fixture',source_sha256=module.checksum(root/'crop.tif'),tile=2)
            module.build(args)
            manifest=json.loads((root/'out/crop-footprint-manifest.json').read_text())
            summary=manifest['states'][0]
            self.assertEqual(summary['class_pixels'],5)
            self.assertEqual(summary['polygon_area_m2'],500)
            geo=json.loads((root/'out/cdl-2025-31.geojson').read_text())
            native=Transformer.from_crs(4326,5070,always_xy=True).transform
            reconstructed=sum(transform(native,shape(f['geometry'])).area for f in geo['features'])
            self.assertAlmostEqual(reconstructed,500,places=4)
            self.assertTrue(all(not f['properties']['current_season_confirmed'] for f in geo['features']))

    def test_geographic_crs_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with rasterio.open(root/'bad.tif','w',driver='GTiff',height=1,width=1,count=1,dtype='uint8',crs=4326,transform=from_origin(-100,40,.01,.01)) as dst:
                dst.write(np.array([[42]],dtype='uint8'),1)
            (root/'states.json').write_text('{"features":[]}')
            args=SimpleNamespace(cdl=str(root/'bad.tif'),states=str(root/'states.json'),out=str(root/'out'))
            with self.assertRaisesRegex(ValueError,'equal-area'):
                module.build(args)

if __name__=='__main__':unittest.main()
