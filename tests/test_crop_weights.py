import importlib.util
from pathlib import Path
import tempfile
import unittest
import numpy as np
import rasterio
from rasterio.transform import from_origin

spec=importlib.util.spec_from_file_location('weights',Path(__file__).parents[1]/'scripts/build_crop_weighted_evidence.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class WeightTests(unittest.TestCase):
    def test_containing_cell_and_outside_conservation(self):
        contract=dict(transform=[1,0,0,0,-1,2],width=2,height=2)
        counts,outside=m.cell_counts(np.array([.5,.99,1.01,2.01]),np.array([1.5,1.5,.5,.5]),contract)
        self.assertEqual(counts,{0:2,3:1});self.assertEqual(outside,1)
        self.assertEqual(sum(counts.values())+outside,4)

    def test_crop_area_weighted_mean_median_and_missing_coverage(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'test.tif'
            with rasterio.open(path,'w',driver='GTiff',width=2,height=2,count=1,dtype='uint8',nodata=255,crs=4326,transform=from_origin(0,2,1,1)) as out:
                out.write(np.array([[10,30],[255,90]],dtype='uint8'),1)
            result=m.summarize(path,dict(cells=[[0,3],[1,1],[2,2]],outside_pixels=2))
            self.assertEqual(result['mean'],15)
            self.assertEqual(result['median'],10)
            self.assertEqual(result['valid_crop_pixels'],4)
            self.assertEqual(result['nodata_crop_pixels'],2)
            self.assertEqual(result['outside_grid_crop_pixels'],2)
            self.assertEqual(result['valid_crop_area_fraction'],.5)
            self.assertEqual(result['total_crop_pixels'],8)

if __name__=='__main__':unittest.main()
