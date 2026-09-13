#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import YAML from 'yaml';

const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nb-control-fixtures-'));
const work=path.join(tmp,'work');
execFileSync('git',['worktree','add','--detach',work,'HEAD'],{cwd:root,stdio:'ignore'});
try{fs.symlinkSync(path.join(root,'node_modules'),path.join(work,'node_modules'),'dir');}catch{}
const p=rel=>path.join(work,rel);
const load=rel=>YAML.parse(fs.readFileSync(p(rel),'utf8'));
const save=(rel,obj)=>fs.writeFileSync(p(rel),YAML.stringify(obj));
const req=()=>load('project-control/REQUIREMENTS.yaml');
const saveReq=o=>save('project-control/REQUIREMENTS.yaml',o);
const lock=()=>load('project-control/EXECUTION_LOCK.yaml');
const saveLock=o=>save('project-control/EXECUTION_LOCK.yaml',o);
const approvalPath='project-control/approvals/APPROVAL-CONTROL-004-20260913.yaml';
const approval=()=>load(approvalPath); const saveApproval=o=>save(approvalPath,o);
const reset=()=>{execFileSync('git',['reset','--hard','HEAD'],{cwd:work,stdio:'ignore'});execFileSync('git',['clean','-fd'],{cwd:work,stdio:'ignore'});try{if(!fs.existsSync(path.join(work,'node_modules')))fs.symlinkSync(path.join(root,'node_modules'),path.join(work,'node_modules'),'dir');}catch{}};
const active=r=>r.requirements.find(x=>x.id==='CONTROL-004');
const other=r=>r.requirements.find(x=>x.id==='SCI-001');
const setStatus=(x,to,sha='e9c71c58366b79da2ff3ea7395a261dbb670e351')=>{const from=x.status;x.transitions.push({from,to,sha,actor:'fixture',timestamp:'2026-09-13T12:30:00-06:00'});x.status=to;};
function makeVerification(r,{same=false,badSha=false,missingVerifier=false,result='PASS'}={}){const id='VERIFY-FIXTURE';r.independent_verification_record=id;r.candidate_sha=r.implementation_sha||'b5c3aa1b06f3175917b76f46a1935f9db2279b48';r.verifier=missingVerifier?null:(same?'ChatGPT':'Claude Opus 5');r.identity_provenance='fixture separate verifier';const rec={schema_version:1,id,requirement:r.id,candidate_sha:badSha?'b5c3aa1b06f3175917b76f46a1935f9db2279b48':r.candidate_sha,result,verifier:missingVerifier?'':(same?'chatgpt':'Claude Opus 5'),implementer:'ChatGPT',identity_provenance:'fixture provenance',timestamp:'2026-09-13T12:30:00-06:00',evidence:'fixture evidence',limitations:'fixture limitations'};save(`project-control/verification/${id}.yaml`,rec);}
const fixtures=[];const add=(id,expect,mutate)=>fixtures.push({id,expect,mutate});
add('A01-canonical',0,()=>{});
add('A02-two-active',1,()=>{const r=req();other(r).history_start_status='ACTIVE';other(r).status='ACTIVE';saveReq(r);});
add('A03-zero-active',1,()=>{const r=req();active(r).history_start_status='FAILED';active(r).transitions=[];active(r).status='FAILED';saveReq(r);});
add('A04-lock-mismatch',1,()=>{const l=lock();l.gate='CONTROL-002';saveLock(l);});
add('A05-nonexistent-gate',1,()=>{const s=load('project-control/CURRENT_STATE.yaml');s.active_gate='CONTROL-999';save('project-control/CURRENT_STATE.yaml',s);});
add('A06-same-actor-verifier',1,()=>{const r=req(),x=active(r);x.implementation_sha='e9c71c58366b79da2ff3ea7395a261dbb670e351';setStatus(x,'IMPLEMENTED');setStatus(x,'IMPLEMENTATION_TESTED');makeVerification(x,{same:true});setStatus(x,'INDEPENDENTLY_VERIFIED');saveReq(r);});
add('A07-missing-verifier',1,()=>{const r=req(),x=active(r);x.implementation_sha='e9c71c58366b79da2ff3ea7395a261dbb670e351';setStatus(x,'IMPLEMENTED');setStatus(x,'IMPLEMENTATION_TESTED');makeVerification(x,{missingVerifier:true});setStatus(x,'INDEPENDENTLY_VERIFIED');saveReq(r);});
add('A08-fake-verified-no-record',1,()=>{const r=req(),x=active(r);x.implementation_sha='e9c71c58366b79da2ff3ea7395a261dbb670e351';setStatus(x,'IMPLEMENTED');setStatus(x,'IMPLEMENTATION_TESTED');setStatus(x,'INDEPENDENTLY_VERIFIED');x.independent_verification_record='i-definitely-verified-this';x.verifier='Claude';x.identity_provenance='fake';saveReq(r);});
add('A09-acceptance-before-IV',1,()=>{const r=req(),x=active(r);x.transitions.push({from:'ACTIVE',to:'GAJ_ACCEPTED',sha:'e9c71c58366b79da2ff3ea7395a261dbb670e351',actor:'fixture',timestamp:'2026-09-13T12:30:00-06:00'});x.status='GAJ_ACCEPTED';x.gaj_acceptance_record='he said yes in chat';saveReq(r);});
add('A10-stale-verification',1,()=>{const r=req(),x=r.requirements.find(y=>y.id==='CONTROL-001');makeVerification(x,{badSha:true});saveReq(r);});
add('A11-abbreviated-sha',1,()=>{const r=req();active(r).candidate_sha='abc123';saveReq(r);});
add('A12-approval-wrong-gate',1,()=>{const a=approval();a.gate='MAP-001';saveApproval(a);});
add('A13-approval-wrong-candidate',1,()=>{const r=req();active(r).candidate_sha='6102f9f5109adea9640d095b432504a764ce7b92';saveReq(r);const a=approval();a.candidate_sha='b5c3aa1b06f3175917b76f46a1935f9db2279b48';saveApproval(a);});
add('A14-verification-wrong-sha',1,()=>{const r=req(),x=r.requirements.find(y=>y.id==='CONTROL-001');makeVerification(x,{badSha:true});x.status='INDEPENDENTLY_VERIFIED';x.history_start_status='IMPLEMENTATION_TESTED';x.transitions=[{from:'IMPLEMENTATION_TESTED',to:'INDEPENDENTLY_VERIFIED',sha:'6102f9f5109adea9640d095b432504a764ce7b92',actor:'fixture',timestamp:'2026-09-13T12:30:00-06:00'}];x.verifier='Claude Opus 5';x.identity_provenance='fixture';saveReq(r);});
add('A15-status-edit-without-transition',1,()=>{const r=req();active(r).status='CLOSED';saveReq(r);});
add('A16-malformed-yaml',1,()=>fs.appendFileSync(p('project-control/REQUIREMENTS.yaml'),'\nrequirements: duplicate\n'));
add('A17-missing-mandatory-file',1,()=>fs.unlinkSync(p('project-control/EXECUTION_LOCK.yaml')));
add('A18-unknown-status',1,()=>{const r=req();active(r).status='MAGIC';saveReq(r);});
add('A19-protected-target-in-allow',1,()=>{const l=lock();l.scope.allow.push('production changes');saveLock(l);});
add('A20-open-contradiction-on-verified',1,()=>{const r=req(),x=r.requirements.find(y=>y.id==='CONTROL-001');makeVerification(x);x.history_start_status='IMPLEMENTATION_TESTED';x.transitions=[{from:'IMPLEMENTATION_TESTED',to:'INDEPENDENTLY_VERIFIED',sha:'6102f9f5109adea9640d095b432504a764ce7b92',actor:'fixture',timestamp:'2026-09-13T12:30:00-06:00'}];x.status='INDEPENDENTLY_VERIFIED';x.verifier='Claude Opus 5';x.identity_provenance='fixture';saveReq(r);save('project-control/contradictions/C1.yaml',{schema_version:1,id:'C1',requirement:'CONTROL-001',status:'OPEN',candidate_sha:'6102f9f5109adea9640d095b432504a764ce7b92',raised_by:'GAJ',timestamp:'2026-09-13T12:30:00-06:00',evidence:'direct contradiction'});});
add('A21-delete-approvals-directory-records',1,()=>{for(const f of fs.readdirSync(p('project-control/approvals')))if(f.endsWith('.yaml'))fs.unlinkSync(p(`project-control/approvals/${f}`));});
add('A22-fake-approval-authority',1,()=>{const a=approval();a.authority='ChatGPT';saveApproval(a);});
add('A23-nonexistent-approval-base-sha',1,()=>{const a=approval();a.base_sha='0000000000000000000000000000000000000000';saveApproval(a);});
add('A24-lock-prohibit-moved-to-allow',1,()=>{const l=lock();l.scope.allow.push(...l.scope.prohibit.filter(x=>['main changes','production changes','gh-pages changes'].includes(x)));l.scope.prohibit=l.scope.prohibit.filter(x=>!['main changes','production changes','gh-pages changes'].includes(x));saveLock(l);});
add('A25-lock-allow-not-subset-approval',1,()=>{const l=lock();l.scope.allow.push('joieos/UNAUTHORIZED');saveLock(l);});
add('A26-duplicate-yaml-key',1,()=>fs.appendFileSync(p('project-control/EXECUTION_LOCK.yaml'),'\ngate: CONTROL-004\n'));
add('A27-unknown-yaml-key',1,()=>{const l=lock();l.magic_bypass=true;saveLock(l);});
add('A28-quoted-active-scalar-valid',0,()=>{let raw=fs.readFileSync(p('project-control/REQUIREMENTS.yaml'),'utf8');raw=raw.replace('status: ACTIVE','status: "ACTIVE"');fs.writeFileSync(p('project-control/REQUIREMENTS.yaml'),raw);});
add('A29-quoted-lock-gate-valid',0,()=>{let raw=fs.readFileSync(p('project-control/EXECUTION_LOCK.yaml'),'utf8');raw=raw.replace('gate: CONTROL-004','gate: "CONTROL-004"');fs.writeFileSync(p('project-control/EXECUTION_LOCK.yaml'),raw);});
add('A30-valid-yaml-whitespace',0,()=>{let raw=fs.readFileSync(p('project-control/REQUIREMENTS.yaml'),'utf8');raw=raw.replace('status: ACTIVE','status:    ACTIVE   ');fs.writeFileSync(p('project-control/REQUIREMENTS.yaml'),raw);});
add('A31-branch-name-in-sha',1,()=>{const r=req();active(r).candidate_sha='main';saveReq(r);});
add('A32-upper-case-sha',1,()=>{const r=req();active(r).candidate_sha='B5C3AA1B06F3175917B76F46A1935F9DB2279B48';saveReq(r);});
add('A33-empty-lock-allow',1,()=>{const l=lock();l.scope.allow=[];saveLock(l);});
add('A34-illegal-transition',1,()=>{const r=req(),x=active(r);x.transitions.push({from:'ACTIVE',to:'CLOSED',sha:'e9c71c58366b79da2ff3ea7395a261dbb670e351',actor:'fixture',timestamp:'2026-09-13T12:30:00-06:00'});x.status='CLOSED';saveReq(r);});
add('A35-transition-chain-break',1,()=>{const r=req(),x=active(r);x.transitions.push({from:'FAILED',to:'ACTIVE',sha:'e9c71c58366b79da2ff3ea7395a261dbb670e351',actor:'fixture',timestamp:'2026-09-13T12:30:00-06:00'});saveReq(r);});
add('A36-verifier-case-alias',1,()=>{const r=req(),x=active(r);x.implementation_sha='e9c71c58366b79da2ff3ea7395a261dbb670e351';setStatus(x,'IMPLEMENTED');setStatus(x,'IMPLEMENTATION_TESTED');makeVerification(x,{same:true});const rec=load('project-control/verification/VERIFY-FIXTURE.yaml');rec.verifier='CHATGPT';save('project-control/verification/VERIFY-FIXTURE.yaml',rec);setStatus(x,'INDEPENDENTLY_VERIFIED');x.verifier='CHATGPT';x.identity_provenance='fixture';saveReq(r);});
add('A37-openai-gpt-alias',1,()=>{const r=req(),x=active(r);x.implementation_sha='e9c71c58366b79da2ff3ea7395a261dbb670e351';setStatus(x,'IMPLEMENTED');setStatus(x,'IMPLEMENTATION_TESTED');makeVerification(x);const rec=load('project-control/verification/VERIFY-FIXTURE.yaml');rec.verifier='OpenAI-GPT-5';save('project-control/verification/VERIFY-FIXTURE.yaml',rec);setStatus(x,'INDEPENDENTLY_VERIFIED');x.verifier='OpenAI-GPT-5';x.identity_provenance='fixture';saveReq(r);});
add('A38-missing-identity-provenance',1,()=>{const r=req();delete active(r).identity_provenance;saveReq(r);});

let wrong=0;
for(const f of fixtures){reset();f.mutate();const run=spawnSync(process.execPath,['scripts/validate-control-plane.mjs'],{cwd:work,encoding:'utf8'});const actual=run.status??1;const ok=f.expect===0?actual===0:actual!==0;console.log(`${ok?'PASS':'FAIL'} ${f.id} expected ${f.expect===0?'zero':'non-zero'} got ${actual}`);if(!ok){wrong++;console.log(run.stdout);console.error(run.stderr);}}
reset();
try{execFileSync('git',['worktree','remove','--force',work],{cwd:root,stdio:'ignore'});}catch{}
fs.rmSync(tmp,{recursive:true,force:true});
if(wrong){console.error(`FAIL ${wrong} of ${fixtures.length} fixture expectations were violated`);process.exit(1);}console.log(`PASS all ${fixtures.length} adversarial fixture expectations`);
