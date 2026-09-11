import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const MATERIAL_INPUTS=[
  ['assets/data/official-baseline.json','normalized-data'],
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
    accepted_model_ids:[],
    limitations:[
      'No crop-condition, confidence, yield, or production model is accepted in this foundation build.',
      'Original USDA PDF bytes and checksums are not yet stored; official URL/table transcription was independently checked.',
      'Temporary browser weather responses are not inputs to this governed data build.'
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
