#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const root = process.cwd();
let failures = 0;
const fail = msg => { failures += 1; console.error(`FAIL ${msg}`); };
const pass = msg => console.log(`PASS ${msg}`);

function readYaml(rel) {
  const file = path.join(root, rel);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (error) { fail(`CONTROL-IO-001 cannot read ${rel}: ${error.message}`); return null; }
  const doc = YAML.parseDocument(text, { uniqueKeys: true, strict: true });
  if (doc.errors.length) {
    for (const error of doc.errors) fail(`CONTROL-YAML-001 ${rel}: ${error.message}`);
    return null;
  }
  try { return doc.toJS({ maxAliasCount: 0 }); }
  catch (error) { fail(`CONTROL-YAML-002 ${rel}: ${error.message}`); return null; }
}

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function keysOnly(obj, allowed, where) {
  if (!object(obj)) { fail(`CONTROL-SCHEMA-001 ${where} must be a mapping`); return; }
  for (const key of Object.keys(obj)) if (!allowed.has(key)) fail(`CONTROL-SCHEMA-002 unknown key ${where}.${key}`);
}
function requireKeys(obj, required, where) {
  if (!object(obj)) return;
  for (const key of required) if (!(key in obj)) fail(`CONTROL-SCHEMA-003 missing key ${where}.${key}`);
}

const requirements = readYaml('project-control/REQUIREMENTS.yaml');
const state = readYaml('project-control/CURRENT_STATE.yaml');
const lock = readYaml('project-control/EXECUTION_LOCK.yaml');
const schema = readYaml('joieos/CONTROL_SCHEMA.yaml');
const machine = readYaml('joieos/STATE_MACHINE.yaml');
const project = readYaml('project-control/PROJECT.yaml');

if (requirements) {
  keysOnly(requirements, new Set(['schema_version','project','status_values','canonical_status_source','requirements']), 'REQUIREMENTS');
  requireKeys(requirements, ['schema_version','project','status_values','requirements'], 'REQUIREMENTS');
  if (!Array.isArray(requirements.requirements)) fail('CONTROL-SCHEMA-004 REQUIREMENTS.requirements must be a list');
  for (const [index, r] of (requirements.requirements || []).entries()) {
    keysOnly(r, new Set(['id','priority','requirement','status','implementation_sha','implementer','independent_verification_record','gaj_acceptance_required','gaj_acceptance_record','note','acceptance','evidence']), `REQUIREMENTS.requirements[${index}]`);
    requireKeys(r, ['id','priority','requirement','status','gaj_acceptance_required'], `REQUIREMENTS.requirements[${index}]`);
  }
}
if (state) {
  keysOnly(state, new Set(['schema_version','project','recorded_at','repository','branches','production_modified_by_control_002','staging_deployment_modified_by_control_002','active_gate','active_gate_status','known_open_p0','source_of_truth','rules']), 'CURRENT_STATE');
  requireKeys(state, ['schema_version','project','repository','branches','active_gate','active_gate_status'], 'CURRENT_STATE');
  keysOnly(state.branches, new Set(['production_main','development_recovery','staging_deployment']), 'CURRENT_STATE.branches');
  for (const [name, b] of Object.entries(state.branches || {})) keysOnly(b, new Set(['name','last_observed_sha','control_001_anchor_sha','current_head','role']), `CURRENT_STATE.branches.${name}`);
  if (state.source_of_truth) keysOnly(state.source_of_truth, new Set(['live_git_head','requirement_status','execution_scope','governance']), 'CURRENT_STATE.source_of_truth');
}
if (lock) {
  keysOnly(lock, new Set(['schema_version','gate','status','authorized_by','authorized_at','scope','stop_condition']), 'EXECUTION_LOCK');
  requireKeys(lock, ['schema_version','gate','status','authorized_by','authorized_at','scope','stop_condition'], 'EXECUTION_LOCK');
  keysOnly(lock.scope, new Set(['allow','prohibit']), 'EXECUTION_LOCK.scope');
}
if (schema) {
  keysOnly(schema, new Set(['schema_version','precedence','rules','fail_closed']), 'CONTROL_SCHEMA');
  requireKeys(schema, ['schema_version','precedence','rules','fail_closed'], 'CONTROL_SCHEMA');
  keysOnly(schema.rules, new Set(['exactly_one_active_gate','active_gate_must_exist','approval_must_bind_exact_sha_when_sha_exists','verification_must_bind_exact_sha','deployed_verification_requires_deployed_sha','independent_verifier_must_differ_from_implementer','gaj_acceptance_requires_independent_verification','contradictory_evidence_reopens_requirement','branch_name_never_substitutes_for_sha','production_requires_explicit_GAJ_authorization','stale_verification_after_candidate_change']), 'CONTROL_SCHEMA.rules');
}
if (machine) {
  keysOnly(machine, new Set(['schema_version','states','transitions','constraints']), 'STATE_MACHINE');
  requireKeys(machine, ['schema_version','states','transitions','constraints'], 'STATE_MACHINE');
  if (object(machine.transitions)) for (const stateName of Object.keys(machine.transitions)) if (!(machine.states || []).includes(stateName)) fail(`CONTROL-SCHEMA-005 transition source ${stateName} is not declared`);
}
if (project) {
  keysOnly(project, new Set(['schema_version','project','repository','product_authority','production_branch','staging_development_branch','staging_deployment_branch','production_policy','canonical_sources','status_authority','human_readable_summaries_are_non_authoritative']), 'PROJECT');
  requireKeys(project, ['schema_version','project','repository','product_authority','canonical_sources','status_authority'], 'PROJECT');
  if (project.canonical_sources) keysOnly(project.canonical_sources, new Set(['governance','control_schema','state_machine','current_state','requirements','execution_lock','approvals','verification','contradictions']), 'PROJECT.canonical_sources');
}

if (requirements && state && lock) {
  const active = requirements.requirements.filter(r => r.status === 'ACTIVE');
  if (active.length !== 1) fail(`CONTROL-ACTIVE-001 expected exactly one ACTIVE gate; found ${active.length}`); else pass(`exactly one ACTIVE gate: ${active[0].id}`);
  if (!requirements.requirements.some(r => r.id === state.active_gate)) fail(`CONTROL-STATE-002 active gate ${state.active_gate} does not exist in REQUIREMENTS`); else pass(`active gate exists: ${state.active_gate}`);
  if (active.length === 1 && state.active_gate !== active[0].id) fail(`CONTROL-STATE-003 CURRENT_STATE gate ${state.active_gate} != canonical ACTIVE ${active[0].id}`); else if (active.length === 1) pass('CURRENT_STATE matches canonical ACTIVE gate');
  if (lock.gate !== state.active_gate) fail(`CONTROL-LOCK-001 execution lock ${lock.gate} != active gate ${state.active_gate}`); else pass('execution lock matches active gate');
}
if (schema && schema.fail_closed !== true) fail('CONTROL-SCHEMA-006 fail_closed must be true');

if (failures) process.exitCode = 1;
else console.log('CONTROL PLANE VALID');
