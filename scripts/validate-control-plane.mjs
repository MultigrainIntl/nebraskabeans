#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';

const root = process.cwd();
let failures = 0;
const fail = msg => { failures += 1; console.error(`FAIL ${msg}`); };
const pass = msg => console.log(`PASS ${msg}`);
function readYaml(rel) {
  const file = path.join(root, rel); let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (error) { fail(`CONTROL-IO-001 cannot read ${rel}: ${error.message}`); return null; }
  const doc = YAML.parseDocument(text, { uniqueKeys: true, strict: true });
  if (doc.errors.length) { for (const error of doc.errors) fail(`CONTROL-YAML-001 ${rel}: ${error.message}`); return null; }
  try { return doc.toJS({ maxAliasCount: 0 }); } catch (error) { fail(`CONTROL-YAML-002 ${rel}: ${error.message}`); return null; }
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function keysOnly(obj, allowed, where) { if (!object(obj)) { fail(`CONTROL-SCHEMA-001 ${where} must be a mapping`); return; } for (const key of Object.keys(obj)) if (!allowed.has(key)) fail(`CONTROL-SCHEMA-002 unknown key ${where}.${key}`); }
function requireKeys(obj, required, where) { if (!object(obj)) return; for (const key of required) if (!(key in obj)) fail(`CONTROL-SCHEMA-003 missing key ${where}.${key}`); }
function nonEmpty(value) { return value !== null && value !== undefined && String(value).trim().length > 0; }
function validSha(sha) { return typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha); }
function gitCommitExists(sha) { if (!validSha(sha)) return false; try { execFileSync('git',['cat-file','-e',`${sha}^{commit}`],{cwd:root,stdio:'ignore'}); return true; } catch { return false; } }
function stringList(value, where) { if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !v.trim())) { fail(`CONTROL-SCHEMA-007 ${where} must be a non-empty-string list`); return []; } return value; }
function readYamlDirectory(rel, label) {
  const dir=path.join(root,rel); let names;
  try { names=fs.readdirSync(dir,{withFileTypes:true}); } catch(error){ fail(`CONTROL-IO-002 cannot read ${label} directory ${rel}: ${error.message}`); return []; }
  const files=names.filter(e=>e.isFile()&&e.name.endsWith('.yaml')).map(e=>e.name).sort();
  if(!files.length) fail(`CONTROL-IO-003 ${label} directory contains no YAML records`);
  return files.map(name=>({name,record:readYaml(path.join(rel,name))}));
}

const requirements=readYaml('project-control/REQUIREMENTS.yaml');
const state=readYaml('project-control/CURRENT_STATE.yaml');
const lock=readYaml('project-control/EXECUTION_LOCK.yaml');
const schema=readYaml('joieos/CONTROL_SCHEMA.yaml');
const machine=readYaml('joieos/STATE_MACHINE.yaml');
const project=readYaml('project-control/PROJECT.yaml');
const approvalFiles=readYamlDirectory('project-control/approvals','approvals');

if(requirements){keysOnly(requirements,new Set(['schema_version','project','status_values','canonical_status_source','requirements']),'REQUIREMENTS');requireKeys(requirements,['schema_version','project','status_values','requirements'],'REQUIREMENTS');if(!Array.isArray(requirements.requirements))fail('CONTROL-SCHEMA-004 REQUIREMENTS.requirements must be a list');for(const[i,r]of(requirements.requirements||[]).entries()){keysOnly(r,new Set(['id','priority','requirement','status','candidate_sha','implementation_sha','implementer','independent_verification_record','gaj_acceptance_required','gaj_acceptance_record','note','acceptance','evidence']),`REQUIREMENTS.requirements[${i}]`);requireKeys(r,['id','priority','requirement','status','gaj_acceptance_required'],`REQUIREMENTS.requirements[${i}]`);}}
if(state){keysOnly(state,new Set(['schema_version','project','recorded_at','repository','branches','production_modified_by_control_002','staging_deployment_modified_by_control_002','active_gate','active_gate_status','known_open_p0','source_of_truth','rules']),'CURRENT_STATE');requireKeys(state,['schema_version','project','repository','branches','active_gate','active_gate_status'],'CURRENT_STATE');keysOnly(state.branches,new Set(['production_main','development_recovery','staging_deployment']),'CURRENT_STATE.branches');for(const[name,b]of Object.entries(state.branches||{}))keysOnly(b,new Set(['name','last_observed_sha','control_001_anchor_sha','current_head','role']),`CURRENT_STATE.branches.${name}`);if(state.source_of_truth)keysOnly(state.source_of_truth,new Set(['live_git_head','requirement_status','execution_scope','governance']),'CURRENT_STATE.source_of_truth');}
if(lock){keysOnly(lock,new Set(['schema_version','gate','status','authorized_by','authorized_at','scope','stop_condition']),'EXECUTION_LOCK');requireKeys(lock,['schema_version','gate','status','authorized_by','authorized_at','scope','stop_condition'],'EXECUTION_LOCK');keysOnly(lock.scope,new Set(['allow','prohibit']),'EXECUTION_LOCK.scope');stringList(lock.scope?.allow,'EXECUTION_LOCK.scope.allow');stringList(lock.scope?.prohibit,'EXECUTION_LOCK.scope.prohibit');}
if(schema){keysOnly(schema,new Set(['schema_version','precedence','rules','fail_closed']),'CONTROL_SCHEMA');requireKeys(schema,['schema_version','precedence','rules','fail_closed'],'CONTROL_SCHEMA');keysOnly(schema.rules,new Set(['exactly_one_active_gate','active_gate_must_exist','approval_must_bind_exact_sha_when_sha_exists','verification_must_bind_exact_sha','deployed_verification_requires_deployed_sha','independent_verifier_must_differ_from_implementer','gaj_acceptance_requires_independent_verification','contradictory_evidence_reopens_requirement','branch_name_never_substitutes_for_sha','production_requires_explicit_GAJ_authorization','stale_verification_after_candidate_change']),'CONTROL_SCHEMA.rules');}
if(machine){keysOnly(machine,new Set(['schema_version','states','transitions','constraints']),'STATE_MACHINE');requireKeys(machine,['schema_version','states','transitions','constraints'],'STATE_MACHINE');if(object(machine.transitions))for(const s of Object.keys(machine.transitions))if(!(machine.states||[]).includes(s))fail(`CONTROL-SCHEMA-005 transition source ${s} is not declared`);}
if(project){keysOnly(project,new Set(['schema_version','project','repository','product_authority','production_branch','staging_development_branch','staging_deployment_branch','production_policy','canonical_sources','status_authority','human_readable_summaries_are_non_authoritative']),'PROJECT');requireKeys(project,['schema_version','project','repository','product_authority','canonical_sources','status_authority'],'PROJECT');if(project.canonical_sources)keysOnly(project.canonical_sources,new Set(['governance','control_schema','state_machine','current_state','requirements','execution_lock','approvals','verification','contradictions']),'PROJECT.canonical_sources');}

const approvals=[];
for(const {name,record:a} of approvalFiles){if(!a)continue;keysOnly(a,new Set(['schema_version','id','authority','authorization_type','gate','authorized_at','base_sha','candidate_sha','scope','notes','source']),`approval.${name}`);requireKeys(a,['schema_version','id','authority','authorization_type','gate','authorized_at','base_sha','candidate_sha','scope'],`approval.${name}`);keysOnly(a.scope,new Set(['allow','prohibit']),`approval.${name}.scope`);stringList(a.scope?.allow,`approval.${name}.scope.allow`);stringList(a.scope?.prohibit,`approval.${name}.scope.prohibit`);if(a.authority!=='GAJ')fail(`CONTROL-APPROVAL-002 ${name} authority must be GAJ`);if(!nonEmpty(a.id)||!nonEmpty(a.gate)||!nonEmpty(a.authorized_at))fail(`CONTROL-APPROVAL-003 ${name} missing identity/gate/time`);approvals.push(a);}

if(requirements&&state&&lock){
  const active=requirements.requirements.filter(r=>r.status==='ACTIVE');
  if(active.length!==1)fail(`CONTROL-ACTIVE-001 expected exactly one ACTIVE gate; found ${active.length}`);else pass(`exactly one ACTIVE gate: ${active[0].id}`);
  if(!requirements.requirements.some(r=>r.id===state.active_gate))fail(`CONTROL-STATE-002 active gate ${state.active_gate} does not exist in REQUIREMENTS`);else pass(`active gate exists: ${state.active_gate}`);
  if(active.length===1&&state.active_gate!==active[0].id)fail(`CONTROL-STATE-003 CURRENT_STATE gate ${state.active_gate} != canonical ACTIVE ${active[0].id}`);else if(active.length===1)pass('CURRENT_STATE matches canonical ACTIVE gate');
  if(lock.gate!==state.active_gate)fail(`CONTROL-LOCK-001 execution lock ${lock.gate} != active gate ${state.active_gate}`);else pass('execution lock matches active gate');
  const activeReq=requirements.requirements.find(r=>r.id===state.active_gate);const matching=approvals.filter(a=>a.gate===state.active_gate);
  if(!matching.length)fail(`CONTROL-APPROVAL-004 active gate ${state.active_gate} has no matching approval`);else pass(`active gate has ${matching.length} matching approval record(s)`);
  const currentCandidate=activeReq?.candidate_sha||activeReq?.implementation_sha;
  if(currentCandidate){for(const a of matching)if(a.candidate_sha!==currentCandidate)fail(`CONTROL-APPROVAL-005 approval ${a.id} candidate_sha does not bind active candidate ${currentCandidate}`);}
  const allow=stringList(lock.scope?.allow,'EXECUTION_LOCK.scope.allow');const prohibit=stringList(lock.scope?.prohibit,'EXECUTION_LOCK.scope.prohibit');const protectedEntries=['main changes','production changes','gh-pages changes','DNS or GoDaddy changes'];for(const e of protectedEntries)if(!prohibit.includes(e))fail(`CONTROL-SCOPE-001 execution lock prohibit list missing: ${e}`);const forbidden=['main','production','gh-pages','dns','godaddy'];for(const e of allow){const n=e.toLowerCase();for(const t of forbidden)if(n.includes(t))fail(`CONTROL-SCOPE-002 execution lock allow entry names protected target ${t}: ${e}`);}
  for(const r of requirements.requirements){if(!['INDEPENDENTLY_VERIFIED','GAJ_ACCEPTED','CLOSED'].includes(r.status))continue;if(!nonEmpty(r.independent_verification_record)){fail(`CONTROL-VERIFY-001 ${r.id} ${r.status} requires independent_verification_record`);continue;}const rec=readYaml(`project-control/verification/${r.independent_verification_record}.yaml`);if(!rec)continue;keysOnly(rec,new Set(['schema_version','id','requirement','candidate_sha','result','verifier','implementer','timestamp','evidence','limitations']),`verification.${r.independent_verification_record}`);requireKeys(rec,['schema_version','id','requirement','candidate_sha','result','verifier','implementer','timestamp','evidence','limitations'],`verification.${r.independent_verification_record}`);const current=r.candidate_sha||r.implementation_sha;if(rec.requirement!==r.id)fail(`CONTROL-VERIFY-002 ${r.id} verification requirement mismatch`);if(!validSha(rec.candidate_sha))fail(`CONTROL-SHA-VERIFY-001 ${r.id} verification candidate_sha must be 40 lowercase hex`);else if(!gitCommitExists(rec.candidate_sha))fail(`CONTROL-SHA-VERIFY-002 ${r.id} verification candidate_sha does not exist as a commit`);if(!validSha(current))fail(`CONTROL-SHA-VERIFY-003 ${r.id} current candidate is missing or invalid`);else if(rec.candidate_sha!==current)fail(`CONTROL-SHA-VERIFY-004 ${r.id} verification SHA does not equal current candidate`);if(rec.result!=='PASS')fail(`CONTROL-VERIFY-003 ${r.id} verification result must be PASS`);for(const f of ['verifier','implementer','timestamp','evidence','limitations'])if(!nonEmpty(rec[f]))fail(`CONTROL-VERIFY-004 ${r.id} verification ${f} must be non-empty`);}
}
if(schema&&schema.fail_closed!==true)fail('CONTROL-SCHEMA-006 fail_closed must be true');
if(failures)process.exitCode=1;else console.log('CONTROL PLANE VALID');
