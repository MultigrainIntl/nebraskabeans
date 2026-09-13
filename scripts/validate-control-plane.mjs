#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';

const CANONICAL_STATUSES = ['OPEN','ACTIVE','IMPLEMENTED','IMPLEMENTATION_TESTED','DEPLOYED','INDEPENDENTLY_VERIFIED','GAJ_ACCEPTED','CLOSED','FAILED','BLOCKED'];
let failures = 0;
const fail = m => { failures++; console.error(`FAIL ${m}`); };
const pass = m => console.log(`PASS ${m}`);

function git(args, cwd = process.cwd(), trim = true) {
  try {
    const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
    return trim ? out.trim() : out;
  } catch (e) {
    fail(`CONTROL-GIT-001 git ${args.join(' ')} failed: ${e.stderr?.toString().trim() || e.message}`);
    return null;
  }
}

const root = git(['rev-parse','--show-toplevel']) || process.cwd();
function text(rel) { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { fail(`CONTROL-IO-001 cannot read ${rel}: ${e.message}`); return null; } }
function yaml(rel) { const raw=text(rel); if(raw===null)return null; let doc; try{doc=YAML.parseDocument(raw,{uniqueKeys:true,strict:true});}catch(e){fail(`CONTROL-YAML-000 ${rel}: ${e.message}`);return null;} if(doc.errors.length){doc.errors.forEach(e=>fail(`CONTROL-YAML-001 ${rel}: ${e.message}`));return null;} try{return doc.toJS({maxAliasCount:0});}catch(e){fail(`CONTROL-YAML-002 ${rel}: ${e.message}`);return null;} }
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
function keys(o,a,w){if(!obj(o)){fail(`CONTROL-SCHEMA-001 ${w} must be mapping`);return;}Object.keys(o).forEach(k=>{if(!a.includes(k))fail(`CONTROL-SCHEMA-002 unknown key ${w}.${k}`);});}
function required(o,a,w){if(!obj(o))return;a.forEach(k=>{if(!(k in o))fail(`CONTROL-SCHEMA-003 missing ${w}.${k}`);});}
const nonEmpty=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
const shaOk=v=>typeof v==='string'&&/^[0-9a-f]{40}$/.test(v);
function sha(v,w,nullable=false){if(v===null&&nullable)return;if(!shaOk(v)){fail(`CONTROL-SHA-001 ${w} must be 40 lowercase hex`);return;}try{execFileSync('git',['cat-file','-e',`${v}^{commit}`],{cwd:root,stdio:'ignore'});}catch{fail(`CONTROL-SHA-002 ${w} ${v} is not existing commit`);}}
function list(v,w,allowEmpty=false){if(!Array.isArray(v)||(!allowEmpty&&v.length===0)||v.some(x=>typeof x!=='string'||!x.trim())){fail(`CONTROL-SCHEMA-004 ${w} must be ${allowEmpty?'a':'a non-empty'} string list`);return [];}return v;}
function dirYaml(rel,requiredDir=false){let es;try{es=fs.readdirSync(path.join(root,rel),{withFileTypes:true});}catch(e){if(requiredDir)fail(`CONTROL-IO-002 cannot read ${rel}: ${e.message}`);return [];}const ns=es.filter(e=>e.isFile()&&e.name.endsWith('.yaml')).map(e=>e.name).sort();if(requiredDir&&!ns.length)fail(`CONTROL-IO-003 ${rel} has no YAML records`);return ns.map(name=>({name,record:yaml(path.posix.join(rel,name))}));}
function remote(branch){const out=git(['ls-remote','origin',`refs/heads/${branch}`],root);if(!out){fail(`CONTROL-GIT-002 no live ref for ${branch}`);return null;}const s=out.split(/\s+/)[0];if(!shaOk(s))fail(`CONTROL-GIT-003 ${branch} did not resolve full SHA`);return s;}
function walkControl(){const out=[];for(const base of ['joieos','project-control']){const walk=d=>{for(const e of fs.readdirSync(path.join(root,d),{withFileTypes:true})){const r=path.posix.join(d,e.name);if(e.isDirectory())walk(r);else out.push(r);}};try{walk(base);}catch(e){fail(`CONTROL-IO-004 scan ${base}: ${e.message}`);}}return out;}
function pathAllowed(file,rules){return rules.some(rule=>rule.endsWith('/**')?file.startsWith(rule.slice(0,-3)):rule.endsWith('/')?file.startsWith(rule):file===rule);}
const sameSet=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((x,i)=>x===b[i]);

function productScopeRule(rule) {
  const n = String(rule || '').toLowerCase();
  if (n === 'assets/**' || n.startsWith('assets/')) return true;
  if (n === '*.html' || n.endsWith('.html') || n.includes('*.html')) return true;
  if (n === 'scripts/build_*' || n.startsWith('scripts/build_')) return true;
  if (n === 'tests/**' || (n.startsWith('tests/') && !n.startsWith('tests/control-plane/'))) return true;
  if (n.startsWith('data/') || n.startsWith('docs/')) return true;
  return false;
}

function approvalIntroduction(rel) {
  const raw = git(['log','--diff-filter=A','--format=%H','--',rel], root);
  const commits = String(raw || '').split(/\n+/).filter(Boolean);
  if (commits.length !== 1) {
    fail(`CONTROL-APPROVAL-007 ${rel} must have exactly one introducing commit; found ${commits.length}`);
    return null;
  }
  return commits[0];
}

function validateApprovalAppendOnly(rel, isLegacy, legacyBaselineSha) {
  const current = text(rel);
  if (current === null) return;
  if (isLegacy) {
    if (!shaOk(legacyBaselineSha)) {
      fail('CONTROL-APPROVAL-012 legacy baseline SHA is missing or invalid');
      return;
    }
    const baseline = git(['show',`${legacyBaselineSha}:${rel}`], root, false);
    if (baseline === null || baseline !== current) {
      fail(`CONTROL-APPROVAL-013 legacy approval ${rel} changed after baseline ${legacyBaselineSha}`);
    }
    return;
  }
  const intro = approvalIntroduction(rel);
  if (!intro) return;
  const original = git(['show',`${intro}:${rel}`], root, false);
  if (original === null || original !== current) {
    fail(`CONTROL-APPROVAL-008 ${rel} differs from first-introducing commit ${intro}`);
  }
  const changed = String(git(['diff-tree','--root','--no-commit-id','--name-only','-r',intro], root) || '').split(/\n+/).filter(Boolean);
  if (changed.length !== 1 || changed[0] !== rel) {
    fail(`CONTROL-APPROVAL-009 ${rel} must be introduced in an approval-only commit; changed: ${changed.join(',')}`);
  }
}

const reqs=yaml('project-control/REQUIREMENTS.yaml'),state=yaml('project-control/CURRENT_STATE.yaml'),lock=yaml('project-control/EXECUTION_LOCK.yaml'),control=yaml('joieos/CONTROL_SCHEMA.yaml'),machine=yaml('joieos/STATE_MACHINE.yaml'),project=yaml('project-control/PROJECT.yaml'),legacyApprovalConfig=yaml('project-control/APPROVAL_LEGACY.yaml'),actorsConfig=yaml('joieos/ACTORS.yaml');
const approvalFiles=dirYaml('project-control/approvals',true),contradictionFiles=dirYaml('project-control/contradictions',false);
const legacyApprovalIds=new Set(legacyApprovalConfig?.legacy_approval_ids||[]);
const legacyApprovalBaseline=legacyApprovalConfig?.legacy_baseline_sha;
const actorRegistry=new Map(Object.entries(actorsConfig?.actors||{}));

function actorRecord(id, where, nullable=false) {
  if (id === null && nullable) return null;
  if (!nonEmpty(id) || !actorRegistry.has(id)) {
    fail(`CONTROL-ACTOR-001 ${where} references unknown actor id ${String(id)}`);
    return null;
  }
  const rec=actorRegistry.get(id);
  if(!obj(rec)||!nonEmpty(rec.vendor)||!nonEmpty(rec.organization)||!nonEmpty(rec.kind)){
    fail(`CONTROL-ACTOR-002 ${where} actor ${id} has incomplete registry metadata`);
    return null;
  }
  return rec;
}

function requireIndependentActors(verifierId, implementerId, where) {
  const verifier=actorRecord(verifierId,`${where}.verifier`);
  const implementer=actorRecord(implementerId,`${where}.implementer`);
  if(verifier&&implementer&&String(verifier.vendor).toLowerCase()===String(implementer.vendor).toLowerCase()){
    fail(`CONTROL-IV-001 ${where} verifier vendor ${verifier.vendor} equals implementer vendor ${implementer.vendor}`);
  }
}

if(actorsConfig){keys(actorsConfig,['schema_version','actors','rules'],'ACTORS');required(actorsConfig,['schema_version','actors','rules'],'ACTORS');if(!obj(actorsConfig.actors)||Object.keys(actorsConfig.actors).length===0)fail('CONTROL-ACTOR-003 ACTORS.actors must be non-empty mapping');for(const[id,rec]of Object.entries(actorsConfig.actors||{})){keys(rec,['vendor','organization','kind'],`ACTORS.actors.${id}`);required(rec,['vendor','organization','kind'],`ACTORS.actors.${id}`);}}
if(reqs){keys(reqs,['schema_version','project','status_values','canonical_status_source','requirements'],'REQUIREMENTS');required(reqs,['schema_version','project','status_values','canonical_status_source','requirements'],'REQUIREMENTS');if(!sameSet(reqs.status_values,CANONICAL_STATUSES))fail('CONTROL-STATUS-000 status_values must exactly equal the closed canonical enum');if(!Array.isArray(reqs.requirements))fail('CONTROL-SCHEMA-005 REQUIREMENTS.requirements must be list');for(const[i,r]of(reqs.requirements||[]).entries()){keys(r,['id','priority','requirement','history_start_status','transitions','status','candidate_sha','implementation_sha','implementer','verifier','identity_provenance','independent_verification_record','non_impact_rule_ref','gaj_acceptance_required','gaj_acceptance_record','note','acceptance','evidence'],`requirement[${i}]`);required(r,['id','priority','requirement','history_start_status','transitions','status','implementer','verifier','identity_provenance','gaj_acceptance_required'],`requirement[${i}]`);if(!Array.isArray(r.transitions))fail(`CONTROL-TRANSITION-001 ${r.id} transitions must list`);for(const[j,t]of(r.transitions||[]).entries()){keys(t,['from','to','sha','actor','timestamp'],`${r.id}.transitions[${j}]`);required(t,['from','to','sha','actor','timestamp'],`${r.id}.transitions[${j}]`);sha(t.sha,`${r.id}.transitions[${j}].sha`);}if('candidate_sha'in r)sha(r.candidate_sha,`${r.id}.candidate_sha`,true);if('implementation_sha'in r)sha(r.implementation_sha,`${r.id}.implementation_sha`,true);actorRecord(r.implementer,`${r.id}.implementer`,true);actorRecord(r.verifier,`${r.id}.verifier`,true);}}
if(state){keys(state,['schema_version','project','recorded_at','repository','branches','active_gate','active_gate_status','known_open_p0','source_of_truth','rules'],'CURRENT_STATE');required(state,['schema_version','project','recorded_at','repository','branches','active_gate','active_gate_status','source_of_truth'],'CURRENT_STATE');keys(state.branches,['production_main','development_recovery','staging_deployment'],'CURRENT_STATE.branches');for(const[n,b]of Object.entries(state.branches||{})){keys(b,['name','last_observed_sha','control_001_anchor_sha','current_head','role'],`CURRENT_STATE.branches.${n}`);if(b.last_observed_sha)sha(b.last_observed_sha,`${n}.last_observed_sha`);if(b.control_001_anchor_sha)sha(b.control_001_anchor_sha,`${n}.control_001_anchor_sha`);}keys(state.source_of_truth,['live_git_head','requirement_status','execution_scope','governance'],'CURRENT_STATE.source_of_truth');}
if(lock){keys(lock,['schema_version','gate','status','approval_ref','authorized_by','authorized_at','base_sha','scope','stop_condition'],'EXECUTION_LOCK');required(lock,['schema_version','gate','status','approval_ref','authorized_by','authorized_at','scope','stop_condition'],'EXECUTION_LOCK');keys(lock.scope,['allow','prohibit'],'EXECUTION_LOCK.scope');list(lock.scope?.allow,'EXECUTION_LOCK.scope.allow');list(lock.scope?.prohibit,'EXECUTION_LOCK.scope.prohibit');if(lock.base_sha)sha(lock.base_sha,'EXECUTION_LOCK.base_sha');}
if(control){keys(control,['schema_version','precedence','rules','fail_closed'],'CONTROL_SCHEMA');required(control,['schema_version','precedence','rules','fail_closed'],'CONTROL_SCHEMA');const rn=['exactly_one_active_gate','active_gate_must_exist','approval_must_bind_exact_sha_when_sha_exists','verification_must_bind_exact_sha','deployed_verification_requires_deployed_sha','independent_verifier_must_differ_from_implementer','gaj_acceptance_requires_independent_verification','contradictory_evidence_reopens_requirement','branch_name_never_substitutes_for_sha','production_requires_explicit_GAJ_authorization','stale_verification_after_candidate_change','control_files_must_not_self_reference_containing_commit'];keys(control.rules,rn,'CONTROL_SCHEMA.rules');rn.forEach(n=>{if(control.rules?.[n]!==true)fail(`CONTROL-SCHEMA-006 rule ${n} must true`);});if(control.fail_closed!==true)fail('CONTROL-SCHEMA-007 fail_closed must true');}
if(machine){keys(machine,['schema_version','states','transitions','constraints'],'STATE_MACHINE');required(machine,['schema_version','states','transitions','constraints'],'STATE_MACHINE');if(!sameSet(machine.states,CANONICAL_STATUSES))fail('CONTROL-STATUS-002 STATE_MACHINE.states must exactly equal closed canonical enum');keys(machine.transitions,CANONICAL_STATUSES,'STATE_MACHINE.transitions');}
if(project){keys(project,['schema_version','project','repository','product_authority','production_branch','staging_development_branch','staging_deployment_branch','production_policy','canonical_sources','status_authority','human_readable_summaries_are_non_authoritative'],'PROJECT');required(project,['schema_version','project','repository','product_authority','production_branch','staging_development_branch','staging_deployment_branch','production_policy','canonical_sources','status_authority'],'PROJECT');keys(project.canonical_sources,['governance','control_schema','state_machine','current_state','requirements','execution_lock','approvals','verification','contradictions'],'PROJECT.canonical_sources');}
if(legacyApprovalConfig){keys(legacyApprovalConfig,['schema_version','legacy_baseline_sha','legacy_approval_ids','rules'],'APPROVAL_LEGACY');required(legacyApprovalConfig,['schema_version','legacy_baseline_sha','legacy_approval_ids','rules'],'APPROVAL_LEGACY');sha(legacyApprovalConfig.legacy_baseline_sha,'APPROVAL_LEGACY.legacy_baseline_sha');}

const approvals=[],byApproval=new Map();
for(const{name,record:a}of approvalFiles){if(!a)continue;const rel=`project-control/approvals/${name}`;const isLegacy=legacyApprovalIds.has(a.id);keys(a,['schema_version','id','authority','authorization_type','gate','authorized_at','base_sha','candidate_sha','scope','notes','source','countersigned_by','signature_provenance'],`approval.${name}`);required(a,['schema_version','id','authority','authorization_type','gate','authorized_at','base_sha','candidate_sha','scope'],`approval.${name}`);if(!isLegacy)required(a,['countersigned_by','signature_provenance'],`approval.${name}`);if(!isLegacy&&(!nonEmpty(a.countersigned_by)||!nonEmpty(a.signature_provenance)))fail(`CONTROL-APPROVAL-010 ${name} missing countersign provenance`);keys(a.scope,['allow','prohibit'],`approval.${name}.scope`);const approvalAllow=list(a.scope?.allow,`approval.${name}.scope.allow`);const approvalProhibit=list(a.scope?.prohibit,`approval.${name}.scope.prohibit`);if(a.source)keys(a.source,['type','authority','statement'],`approval.${name}.source`);sha(a.base_sha,`approval.${name}.base_sha`);sha(a.candidate_sha,`approval.${name}.candidate_sha`,true);if(a.authority!=='GAJ')fail(`CONTROL-APPROVAL-001 ${name} authority must GAJ`);const productionClass=a.authorization_type==='production_scope'&&nonEmpty(a.countersigned_by)&&nonEmpty(a.signature_provenance);for(const rule of approvalAllow){if(productScopeRule(rule)&&!productionClass)fail(`CONTROL-SCOPE-004 ${name} product-path allow forbidden without countersigned production_scope: ${rule}`);}if((approvalProhibit.includes('application asset changes')||approvalProhibit.includes('product functionality changes'))&&approvalAllow.some(productScopeRule))fail(`CONTROL-SCOPE-005 ${name} allow-list contradicts product/application prohibit categories`);validateApprovalAppendOnly(rel,isLegacy,legacyApprovalBaseline);if(byApproval.has(a.id))fail(`CONTROL-APPROVAL-002 duplicate ${a.id}`);byApproval.set(a.id,a);approvals.push(a);}

const contradictions=[];for(const{name,record:c}of contradictionFiles){if(!c)continue;keys(c,['schema_version','id','requirement','status','candidate_sha','raised_by','timestamp','evidence','resolution'],`contradiction.${name}`);required(c,['schema_version','id','requirement','status','raised_by','timestamp','evidence'],`contradiction.${name}`);if(!['OPEN','RESOLVED'].includes(c.status))fail(`CONTROL-CONTRADICTION-001 ${name} bad status`);if('candidate_sha'in c)sha(c.candidate_sha,`contradiction.${name}.candidate_sha`,true);contradictions.push(c);}
if(reqs&&machine)for(const r of reqs.requirements){let s=r.history_start_status;if(!CANONICAL_STATUSES.includes(s))fail(`CONTROL-TRANSITION-002 ${r.id} bad start ${s}`);for(const[i,t]of r.transitions.entries()){if(t.from!==s)fail(`CONTROL-TRANSITION-003 ${r.id} chain break at ${i}`);if(!(machine.transitions?.[t.from]||[]).includes(t.to))fail(`CONTROL-TRANSITION-004 ${r.id} illegal ${t.from}->${t.to}`);if(!nonEmpty(t.actor)||!nonEmpty(t.timestamp))fail(`CONTROL-TRANSITION-005 ${r.id} transition metadata empty`);s=t.to;}if(s!==r.status)fail(`CONTROL-TRANSITION-006 ${r.id} derived ${s} != ${r.status}`);}
if(state){const p=state.branches.production_main,d=state.branches.staging_deployment,r=state.branches.development_recovery;if(p?.last_observed_sha){const live=remote(p.name);if(live&&live!==p.last_observed_sha)fail(`CONTROL-DRIFT-001 ${p.name} drift`);}if(d?.last_observed_sha){const live=remote(d.name);if(live&&live!==d.last_observed_sha)fail(`CONTROL-DRIFT-002 ${d.name} drift`);}if(r?.name){const live=remote(r.name),local=git(['rev-parse','HEAD'],root);if(live&&local&&live!==local)fail(`CONTROL-DRIFT-003 recovery drift local ${local} remote ${live}`);}}
if(reqs&&state&&lock){for(const r of reqs.requirements)if(!CANONICAL_STATUSES.includes(r.status))fail(`CONTROL-STATUS-001 ${r.id} unknown ${r.status}`);const active=reqs.requirements.filter(r=>r.status==='ACTIVE');if(active.length!==1)fail(`CONTROL-ACTIVE-001 expected 1 ACTIVE found ${active.length}`);else pass(`exactly one ACTIVE gate: ${active[0].id}`);if(!reqs.requirements.some(r=>r.id===state.active_gate))fail(`CONTROL-STATE-001 gate absent ${state.active_gate}`);if(active.length===1&&active[0].id!==state.active_gate)fail('CONTROL-STATE-002 canonical active mismatch');if(lock.gate!==state.active_gate)fail('CONTROL-LOCK-001 lock mismatch');const activeReq=reqs.requirements.find(r=>r.id===state.active_gate),approval=byApproval.get(lock.approval_ref);if(legacyApprovalIds.has(lock.approval_ref))fail(`CONTROL-APPROVAL-011 execution lock may not reference legacy approval ${lock.approval_ref}`);if(!approval)fail(`CONTROL-APPROVAL-003 unresolved ${lock.approval_ref}`);else{if(approval.gate!==lock.gate)fail('CONTROL-APPROVAL-004 approval gate mismatch');const aa=new Set(list(approval.scope.allow,`approval.${approval.id}.scope.allow`));for(const x of list(lock.scope.allow,'EXECUTION_LOCK.scope.allow'))if(!aa.has(x))fail(`CONTROL-APPROVAL-005 lock exceeds approval ${x}`);if(activeReq?.candidate_sha&&approval.candidate_sha!==activeReq.candidate_sha)fail('CONTROL-APPROVAL-006 candidate binding mismatch');}
const allow=list(lock.scope.allow,'EXECUTION_LOCK.scope.allow'),prohibit=list(lock.scope.prohibit,'EXECUTION_LOCK.scope.prohibit');for(const x of ['main changes','production changes','gh-pages changes','DNS or GoDaddy changes'])if(!prohibit.includes(x))fail(`CONTROL-SCOPE-001 prohibit missing ${x}`);for(const x of allow){const n=x.toLowerCase();for(const token of ['main changes','production changes','gh-pages changes','dns changes','godaddy changes'])if(n.includes(token))fail(`CONTROL-SCOPE-002 allow names protected target ${token}: ${x}`);if(productScopeRule(x))fail(`CONTROL-SCOPE-006 execution lock may not allow product path under non-production gate: ${x}`);}if((prohibit.includes('application asset changes')||prohibit.includes('product functionality changes'))&&allow.some(productScopeRule))fail('CONTROL-SCOPE-007 execution lock allow-list contradicts product/application prohibit categories');if(approval?.base_sha){const diff=git(['diff','--name-only',`${approval.base_sha}..HEAD`],root);if(diff!==null){for(const f of diff.split('\n').filter(Boolean))if(!pathAllowed(f,allow))fail(`CONTROL-SCOPE-003 changed path outside execution allow-list: ${f}`);}}
for(const r of reqs.requirements){let rec=null;if(r.independent_verification_record){rec=yaml(`project-control/verification/${r.independent_verification_record}.yaml`);if(rec){keys(rec,['schema_version','id','requirement','candidate_sha','result','verifier','implementer','identity_provenance','timestamp','evidence','limitations'],`verification.${r.independent_verification_record}`);required(rec,['schema_version','id','requirement','candidate_sha','result','verifier','implementer','identity_provenance','timestamp','evidence','limitations'],`verification.${r.independent_verification_record}`);sha(rec.candidate_sha,`${r.id}.verification.candidate_sha`);if(rec.requirement!==r.id)fail(`CONTROL-VERIFY-001 ${r.id} requirement mismatch`);if(rec.result!=='PASS')fail(`CONTROL-VERIFY-002 ${r.id} result not PASS`);['verifier','implementer','identity_provenance','timestamp','evidence','limitations'].forEach(f=>{if(!nonEmpty(rec[f]))fail(`CONTROL-VERIFY-003 ${r.id} ${f} empty`);});requireIndependentActors(rec.verifier,rec.implementer,`verification.${r.independent_verification_record}`);const current=r.candidate_sha||r.implementation_sha;if(current&&rec.candidate_sha!==current&&!r.non_impact_rule_ref){if(r.status!=='IMPLEMENTATION_TESTED')fail(`CONTROL-STALE-001 ${r.id} stale status must IMPLEMENTATION_TESTED`);fail(`CONTROL-STALE-002 ${r.id} stale verification`);}}}if(['INDEPENDENTLY_VERIFIED','GAJ_ACCEPTED','CLOSED'].includes(r.status)){if(!rec)fail(`CONTROL-VERIFY-004 ${r.id} requires record`);if(!nonEmpty(r.verifier)||!nonEmpty(r.identity_provenance))fail(`CONTROL-IV-002 ${r.id} missing verifier provenance`);requireIndependentActors(r.verifier,r.implementer,`requirement.${r.id}`);}if(['GAJ_ACCEPTED','CLOSED'].includes(r.status)&&!nonEmpty(r.gaj_acceptance_record))fail(`CONTROL-GAJ-001 ${r.id} acceptance record required`);if(['IMPLEMENTED','IMPLEMENTATION_TESTED','DEPLOYED','INDEPENDENTLY_VERIFIED','GAJ_ACCEPTED','CLOSED'].includes(r.status)&&!shaOk(r.implementation_sha))fail(`CONTROL-IMPLEMENTATION-001 ${r.id} ${r.status} requires implementation_sha`);const c=contradictions.find(x=>x.requirement===r.id&&x.status==='OPEN');if(c&&['INDEPENDENTLY_VERIFIED','GAJ_ACCEPTED','CLOSED'].includes(r.status))fail(`CONTROL-CONTRADICTION-002 ${r.id} unresolved ${c.id}`);}}
const head=git(['rev-parse','HEAD'],root);if(shaOk(head))for(const rel of walkControl()){const raw=text(rel);if(raw!==null&&raw.indexOf(head)>=0)fail(`CONTROL-SELF-SHA-001 ${rel} contains own HEAD ${head}`);}
if(failures)process.exitCode=1;else console.log('CONTROL PLANE VALID');
