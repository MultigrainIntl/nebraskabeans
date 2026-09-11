import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const MATERIAL_INPUTS=[
  ['assets/data/official-baseline.json','normalized-data'],
  ['assets/data/temporal-layer-catalog.json','live-layer-contract'],
  ['assets/data/gisit-outlook-2026.json','versioned-model-output'],
  ['assets/data/satellite-signals-2026.json','sampled-temporal-evidence'],
  ['assets/data/bean-agronomy.json','source-contract'],
  ['assets/source-registry.js','source-registry'],
  ['NEBRASKABEANS-SCIENTIFIC-SPEC.md','scientific-contract']
];
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,null,2)+'\n';

export function computeManifest(){
  const inputs=MATERIAL_INPUTS.map(([relative,kind])=>{const bytes=readFileSync(resolve(root,relative));return {path:relative,kind,bytes:bytes.length,sha256:sha(bytes)}});
  const inputSetSha256=sha(JSON.stringify(inputs));
  const baseline=JSON.parse(readFileSync(resolve(root,'assets/data/official-baseline.json'),'utf8'));
  const manifest={
    schema_version:'nebraskabeans.data_build.v1',
    data_build_id:`nbd-v1-${inputSetSha256.slice(0,20)}`,
    input_set_sha256:inputSetSha256,
    generated_at_utc:baseline.retrieved_at_utc,
    evidence_cutoff_date:baseline.generated_as_of,
    material_inputs:inputs,
    accepted_model_ids:['gisit-drybean-weather-ridge-v1','usda-crop-casma-smap-l4','usda-crop-casma-ndvi'],
    limitations:[
      'GISit v1 is an experimental pinto-basis regional outlook; selected-date values are released only when leave-one-year-out MAE beats the state historical-median baseline.',
      'Current USDA yield forecasts are excluded from the GISit equation and remain comparison records only; final official outcomes are calibration/backtest targets.',
      'USDA planted and expected-harvested acreage are dated, revisable production inputs and each revision remains visible in forecast history.',
      'Daily USDA Crop-CASMA SMAP root-zone moisture, SMAP anomaly, and NDVI rasters are connected; weekly governed WCS samples corroborate the crop-health outlook.',
      'Analytical areas and satellite neighborhoods are not yet clipped to the USDA CDL dry-bean footprint and are not field or county estimates.',
      'Irrigation application, cultivar, disease, hail, soil constraints, and management are not observed by the current model.',
      'Kansas yield is withheld because its published NASS pinto target series ends in 2015.',
      'Original USDA PDF bytes and checksums are not yet stored; official URL/table transcription was independently checked.',
      'Open-Meteo historical-weather responses are governed modeled inputs with exact queries and response checksums in the model artifact.'
    ]
  };
  return {...manifest,manifest_sha256:sha(canonical(manifest))};
}

export function verifyManifest(){
  const expected=computeManifest(),actual=JSON.parse(readFileSync(resolve(root,'assets/data/build-manifest.json'),'utf8'));
  return {ok:canonical(actual)===canonical(expected),expected,actual};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  if(process.argv.includes('--check')){
    const result=verifyManifest();if(!result.ok){console.error('build manifest is stale');process.exit(1)}
    console.log(`PASS build manifest ${result.actual.data_build_id}`);
  }else{
    const manifest=computeManifest();writeFileSync(resolve(root,'assets/data/build-manifest.json'),canonical(manifest));console.log(`WROTE ${manifest.data_build_id}`);
  }
}
