#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';

const CANONICAL_STATUSES = [
  'OPEN', 'ACTIVE', 'IMPLEMENTED', 'IMPLEMENTATION_TESTED', 'DEPLOYED',
  'INDEPENDENTLY_VERIFIED', 'GAJ_ACCEPTED', 'CLOSED', 'FAILED', 'BLOCKED'
];
const LATE_HISTORY_STARTS = new Set([
  'IMPLEMENTED', 'IMPLEMENTATION_TESTED', 'DEPLOYED',
  'INDEPENDENTLY_VERIFIED', 'GAJ_ACCEPTED', 'CLOSED'
]);
let failures = 0;
const fail = message => { failures += 1; console.error(`FAIL ${message}`); };
const pass = message => console.log(`PASS ${message}`);

function git(args, cwd = process.cwd(), trim = true, quietFailure = false) {
  try {
    const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return trim ? out.trim() : out;
  } catch (error) {
    if (!quietFailure) fail(`CONTROL-GIT-001 git ${args.join(' ')} failed: ${error.stderr?.toString().trim() || error.message}`);
    return null;
  }
}

const root = git(['rev-parse', '--show-toplevel']) || process.cwd();
function readText(rel) { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (error) { fail(`CONTROL-IO-001 cannot read ${rel}: ${error.message}`); return null; } }
function parseYamlText(raw, label) { let doc; try { doc = YAML.parseDocument(raw, { uniqueKeys: true, strict: true }); } catch (error) { fail(`CONTROL-YAML-000 ${label}: ${error.message}`); return null; } if (doc.errors.length) { doc.errors.forEach(error => fail(`CONTROL-YAML-001 ${label}: ${error.message}`)); return null; } try { return doc.toJS({ maxAliasCount: 0 }); } catch (error) { fail(`CONTROL-YAML-002 ${label}: ${error.message}`); return null; } }
function readYaml(rel) { const raw = readText(rel); return raw === null ? null : parseYamlText(raw, rel); }
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = value => value !== null && value !== undefined && String(value).trim() !== '';
const shaOk = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
function checkKeys(object, allowed, label) { if (!isObject(object)) { fail(`CONTROL-SCHEMA-001 ${label} must be mapping`); return; } for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`CONTROL-SCHEMA-002 unknown key ${label}.${key}`); }
function requireKeys(object, required, label) { if (!isObject(object)) return; for (const key of required) if (!(key in object)) fail(`CONTROL-SCHEMA-003 missing ${label}.${key}`); }
function checkSha(value, label, nullable = false) { if (value === null && nullable) return; if (!shaOk(value)) { fail(`CONTROL-SHA-001 ${label} must be 40 lowercase hex`); return; } if (git(['cat-file', '-e', `${value}^{commit}`], root, true, true) === null) fail(`CONTROL-SHA-002 ${label} ${value} is not existing commit`); }
function checkStringList(value, label, allowEmpty = false) { if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some(item => typeof item !== 'string' || !item.trim())) { fail(`CONTROL-SCHEMA-004 ${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string list`); return []; } return value; }
function directoryYaml(rel, requiredDir = false, requireRecords = false) { let entries; try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (error) { if (requiredDir) fail(`CONTROL-IO-002 cannot read ${rel}: ${error.message}`); return []; } const names = entries.filter(entry => entry.isFile() && entry.name.endsWith('.yaml')).map(entry => entry.name).sort(); if (requireRecords && names.length === 0) fail(`CONTROL-IO-003 ${rel} has no YAML records`); return names.map(name => ({ name, record: readYaml(path.posix.join(rel, name)) })); }
function remoteSha(branch) { const out = git(['ls-remote', 'origin', `refs/heads/${branch}`], root); if (!out) { fail(`CONTROL-GIT-002 no live ref for ${branch}`); return null; } const value = out.split(/\s+/)[0]; if (!shaOk(value)) fail(`CONTROL-GIT-003 ${branch} did not resolve full SHA`); return value; }
function isAncestor(ancestor, descendant, label) { const ok = git(['merge-base', '--is-ancestor', ancestor, descendant], root, true, true) !== null; if (!ok) fail(`CONTROL-HISTORY-001 ${label}: ${ancestor} is not ancestor of ${descendant}`); return ok; }
function yamlAtCommit(commit, rel) { const raw = git(['show', `${commit}:${rel}`], root, false, true); if (raw === null) { fail(`CONTROL-HISTORY-002 ${rel} missing at ${commit}`); return null; } return parseYamlText(raw, `${commit}:${rel}`); }
function pathAllowed(file, rules) { return rules.some(rule => rule.endsWith('/**') ? file.startsWith(rule.slice(0, -3)) : rule.endsWith('/') ? file.startsWith(rule) : file === rule); }
function sameOrdered(a, b) { return Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index]); }
function sameMembers(a, b) { return a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]); }
function productScopeRule(rule) { const value = String(rule || '').toLowerCase(); if (value === 'assets/**' || value.startsWith('assets/')) return true; if (value === '*.html' || value.endsWith('.html') || value.includes('*.html')) return true; if (value === 'scripts/build_*' || value.startsWith('scripts/build_')) return true; if (value === 'tests/**' || (value.startsWith('tests/') && !value.startsWith('tests/control-plane/'))) return true; if (value.startsWith('data/') || value.startsWith('docs/')) return true; return false; }
function walkControl() { const files = []; for (const base of ['joieos', 'project-control']) { const walk = dir => { for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const rel = path.posix.join(dir, entry.name); if (entry.isDirectory()) walk(rel); else files.push(rel); } }; try { walk(base); } catch (error) { fail(`CONTROL-IO-004 scan ${base}: ${error.message}`); } } return files; }

const reqs = readYaml('project-control/REQUIREMENTS.yaml');
const state = readYaml('project-control/CURRENT_STATE.yaml');
const lock = readYaml('project-control/EXECUTION_LOCK.yaml');
const control = readYaml('joieos/CONTROL_SCHEMA.yaml');
const machine = readYaml('joieos/STATE_MACHINE.yaml');
const project = readYaml('project-control/PROJECT.yaml');
const legacyApprovalConfig = readYaml('project-control/APPROVAL_LEGACY.yaml');
const actorsConfig = readYaml('joieos/ACTORS.yaml');
const approvalFiles = directoryYaml('project-control/approvals', true, true);
const contradictionFiles = directoryYaml('project-control/contradictions', true, false);
const legacyApprovalIds = new Set(legacyApprovalConfig?.legacy_approval_ids || []);
const legacyApprovalBaseline = legacyApprovalConfig?.legacy_baseline_sha;
const actorRegistry = new Map(Object.entries(actorsConfig?.actors || {}));

function actorRecord(id, where, nullable = false) { if (id === null && nullable) return null; if (!nonEmpty(id) || !actorRegistry.has(id)) { fail(`CONTROL-ACTOR-001 ${where} references unknown actor id ${String(id)}`); return null; } const record = actorRegistry.get(id); if (!isObject(record) || !nonEmpty(record.vendor) || !nonEmpty(record.organization) || !nonEmpty(record.kind)) { fail(`CONTROL-ACTOR-002 ${where} actor ${id} has incomplete registry metadata`); return null; } return record; }
function requireIndependentActors(verifierId, implementerId, where) { const verifier = actorRecord(verifierId, `${where}.verifier`), implementer = actorRecord(implementerId, `${where}.implementer`); if (verifier && implementer && String(verifier.vendor).toLowerCase() === String(implementer.vendor).toLowerCase()) fail(`CONTROL-IV-001 ${where} verifier vendor ${verifier.vendor} equals implementer vendor ${implementer.vendor}`); }
function approvalIntroduction(rel) { const raw = git(['log', '--diff-filter=A', '--format=%H', '--', rel], root); const commits = String(raw || '').split(/\n+/).filter(Boolean); if (commits.length !== 1) { fail(`CONTROL-APPROVAL-007 ${rel} must have exactly one introducing commit; found ${commits.length}`); return null; } return commits[0]; }
function validateApprovalAppendOnly(rel, isLegacy) { const current = readText(rel); if (current === null) return; if (isLegacy) { if (!shaOk(legacyApprovalBaseline)) { fail('CONTROL-APPROVAL-012 legacy baseline SHA is missing or invalid'); return; } const baseline = git(['show', `${legacyApprovalBaseline}:${rel}`], root, false, true); if (baseline === null || baseline !== current) fail(`CONTROL-APPROVAL-013 legacy approval ${rel} changed after baseline ${legacyApprovalBaseline}`); return; } const intro = approvalIntroduction(rel); if (!intro) return; const original = git(['show', `${intro}:${rel}`], root, false, true); if (original === null || original !== current) fail(`CONTROL-APPROVAL-008 ${rel} differs from first-introducing commit ${intro}`); const changed = String(git(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', intro], root) || '').split(/\n+/).filter(Boolean); if (changed.length !== 1 || changed[0] !== rel) fail(`CONTROL-APPROVAL-009 ${rel} must be introduced in an approval-only commit; changed: ${changed.join(',')}`); }
function validateNonImpactRule(requirement, verification, currentSha) { const ref = requirement.non_impact_rule_ref; if (!nonEmpty(ref)) return false; if (!/^[A-Z0-9._-]+$/.test(ref)) { fail(`CONTROL-NONIMPACT-001 ${requirement.id} invalid non-impact ref ${ref}`); return false; } const rule = readYaml(`project-control/non-impact-rules/${ref}.yaml`); if (!rule) { fail(`CONTROL-NONIMPACT-002 ${requirement.id} unresolved non-impact ref ${ref}`); return false; } checkKeys(rule, ['schema_version','id','requirement','verified_sha','current_sha','exempt_paths','rationale'], 'non-impact'); requireKeys(rule, ['schema_version','id','requirement','verified_sha','current_sha','exempt_paths','rationale'], 'non-impact'); if (rule.id !== ref || rule.requirement !== requirement.id) fail(`CONTROL-NONIMPACT-003 ${requirement.id} non-impact identity mismatch`); checkSha(rule.verified_sha, `${ref}.verified_sha`); checkSha(rule.current_sha, `${ref}.current_sha`); if (rule.verified_sha !== verification.candidate_sha || rule.current_sha !== currentSha) fail(`CONTROL-NONIMPACT-004 ${requirement.id} non-impact SHA binding mismatch`); const exempt = checkStringList(rule.exempt_paths, `${ref}.exempt_paths`); if (exempt.some(item => item.includes('*') || item.endsWith('/'))) fail(`CONTROL-NONIMPACT-005 ${ref} exempt_paths must be exact file paths, no globs`); const diff = String(git(['diff', '--name-only', `${rule.verified_sha}..${rule.current_sha}`], root) || '').split(/\n+/).filter(Boolean); if (!sameMembers(diff, exempt)) { fail(`CONTROL-NONIMPACT-006 ${ref} exempt_paths do not exactly equal git diff`); return false; } return true; }

function validateHistory(requirement, head) { let currentStatus = requirement.history_start_status, previousSha = null; if (!CANONICAL_STATUSES.includes(currentStatus)) fail(`CONTROL-TRANSITION-002 ${requirement.id} bad start ${currentStatus}`); if (LATE_HISTORY_STARTS.has(currentStatus)) fail(`CONTROL-HISTORY-003 ${requirement.id} may not begin history at ${currentStatus}; reconstruct chain from OPEN`); if (currentStatus !== 'OPEN') { if (!shaOk(requirement.history_anchor_sha)) fail(`CONTROL-HISTORY-004 ${requirement.id} non-OPEN start requires history_anchor_sha`); else { checkSha(requirement.history_anchor_sha, `${requirement.id}.history_anchor_sha`); isAncestor(requirement.history_anchor_sha, head, `${requirement.id} history anchor`); const historical = yamlAtCommit(requirement.history_anchor_sha, 'project-control/REQUIREMENTS.yaml'), historicalReq = historical?.requirements?.find(item => item.id === requirement.id); if (!historicalReq || historicalReq.status !== currentStatus) fail(`CONTROL-HISTORY-005 ${requirement.id} anchor does not corroborate status ${currentStatus}`); previousSha = requirement.history_anchor_sha; } } for (const [index, transition] of requirement.transitions.entries()) { if (transition.from !== currentStatus) fail(`CONTROL-TRANSITION-003 ${requirement.id} chain break at ${index}`); if (!(machine?.transitions?.[transition.from] || []).includes(transition.to)) fail(`CONTROL-TRANSITION-004 ${requirement.id} illegal ${transition.from}->${transition.to}`); if (!nonEmpty(transition.actor) || !nonEmpty(transition.timestamp)) fail(`CONTROL-TRANSITION-005 ${requirement.id} transition metadata empty`); checkSha(transition.sha, `${requirement.id}.transitions[${index}].sha`); if (shaOk(transition.sha)) { isAncestor(transition.sha, head, `${requirement.id} transition ${index} reachable from HEAD`); if (previousSha) isAncestor(previousSha, transition.sha, `${requirement.id} transition order ${index}`); previousSha = transition.sha; } currentStatus = transition.to; } if (currentStatus !== requirement.status) fail(`CONTROL-TRANSITION-006 ${requirement.id} derived ${currentStatus} != ${requirement.status}`); }

function historicalContradictionPaths() {
  const raw = git(['log', '--diff-filter=A', '--format=', '--name-only', '--', 'project-control/contradictions'], root);
  return new Set(String(raw || '').split(/\n+/).filter(name => name.endsWith('.yaml')));
}

function validateContradictionAppendOnly(rel, currentRecord) {
  const history = String(git(['log', '--follow', '--format=%H', '--reverse', '--', rel], root) || '').split(/\n+/).filter(Boolean);
  if (history.length === 0) { fail(`CONTROL-CONTRADICTION-003 ${rel} has no introducing commit`); return; }
  const introRaw = git(['show', `${history[0]}:${rel}`], root, false, true);
  if (introRaw === null) { fail(`CONTROL-CONTRADICTION-004 cannot read initial ${rel}`); return; }
  const intro = parseYamlText(introRaw, `${history[0]}:${rel}`);
  if (!intro) return;
  if (currentRecord.status === 'OPEN') {
    const currentRaw = readText(rel);
    if (currentRaw !== introRaw) fail(`CONTROL-CONTRADICTION-005 OPEN contradiction ${rel} is not append-only immutable`);
    return;
  }
  if (intro.status !== 'OPEN') { fail(`CONTROL-CONTRADICTION-006 resolved contradiction ${rel} must originate OPEN`); return; }
  for (const field of ['id','requirement','candidate_sha','raised_by','timestamp','evidence']) {
    if (JSON.stringify(intro[field] ?? null) !== JSON.stringify(currentRecord[field] ?? null)) fail(`CONTROL-CONTRADICTION-007 ${rel} changed immutable field ${field}`);
  }
  let firstResolvedRaw = null;
  for (const commit of history) {
    const raw = git(['show', `${commit}:${rel}`], root, false, true); if (raw === null) continue;
    const parsed = parseYamlText(raw, `${commit}:${rel}`); if (parsed?.status === 'RESOLVED') { firstResolvedRaw = raw; break; }
  }
  if (firstResolvedRaw === null) fail(`CONTROL-CONTRADICTION-008 ${rel} has RESOLVED status without recorded resolution commit`);
  else if (readText(rel) !== firstResolvedRaw) fail(`CONTROL-CONTRADICTION-009 ${rel} changed after first RESOLVED commit`);
}

function validateTopLevelSchemas() {
  if (actorsConfig) { checkKeys(actorsConfig, ['schema_version','actors','rules'], 'ACTORS'); requireKeys(actorsConfig, ['schema_version','actors','rules'], 'ACTORS'); for (const [id, record] of Object.entries(actorsConfig.actors || {})) { checkKeys(record, ['vendor','organization','kind'], `ACTORS.actors.${id}`); requireKeys(record, ['vendor','organization','kind'], `ACTORS.actors.${id}`); } }
  if (reqs) { checkKeys(reqs, ['schema_version','project','status_values','canonical_status_source','requirements'], 'REQUIREMENTS'); requireKeys(reqs, ['schema_version','project','status_values','canonical_status_source','requirements'], 'REQUIREMENTS'); if (!sameOrdered(reqs.status_values, CANONICAL_STATUSES)) fail('CONTROL-STATUS-000 status_values must exactly equal the closed canonical enum'); for (const [index, requirement] of (reqs.requirements || []).entries()) { checkKeys(requirement, ['id','priority','requirement','history_start_status','history_anchor_sha','transitions','status','candidate_sha','implementation_sha','implementer','verifier','identity_provenance','independent_verification_record','non_impact_rule_ref','gaj_acceptance_required','gaj_acceptance_record','note','acceptance','evidence'], `requirement[${index}]`); requireKeys(requirement, ['id','priority','requirement','history_start_status','transitions','status','implementer','verifier','identity_provenance','gaj_acceptance_required'], `requirement[${index}]`); if (!Array.isArray(requirement.transitions)) fail(`CONTROL-TRANSITION-001 ${requirement.id} transitions must list`); if ('candidate_sha' in requirement) checkSha(requirement.candidate_sha, `${requirement.id}.candidate_sha`, true); if ('implementation_sha' in requirement) checkSha(requirement.implementation_sha, `${requirement.id}.implementation_sha`, true); actorRecord(requirement.implementer, `${requirement.id}.implementer`, true); actorRecord(requirement.verifier, `${requirement.id}.verifier`, true); } }
  if (lock) { checkKeys(lock, ['schema_version','gate','status','approval_ref','authorized_by','authorized_at','base_sha','scope','stop_condition'], 'EXECUTION_LOCK'); requireKeys(lock, ['schema_version','gate','status','approval_ref','authorized_by','authorized_at','scope','stop_condition'], 'EXECUTION_LOCK'); checkStringList(lock.scope?.allow, 'EXECUTION_LOCK.scope.allow'); checkStringList(lock.scope?.prohibit, 'EXECUTION_LOCK.scope.prohibit'); if (lock.base_sha) checkSha(lock.base_sha, 'EXECUTION_LOCK.base_sha'); }
  if (control && control.fail_closed !== true) fail('CONTROL-SCHEMA-007 fail_closed must true');
  if (machine && !sameOrdered(machine.states, CANONICAL_STATUSES)) fail('CONTROL-STATUS-002 STATE_MACHINE.states must exactly equal closed canonical enum');
  if (legacyApprovalConfig) checkSha(legacyApprovalConfig.legacy_baseline_sha, 'APPROVAL_LEGACY.legacy_baseline_sha');
}

validateTopLevelSchemas();
const approvals = [], byApproval = new Map();
for (const { name, record: approval } of approvalFiles) { if (!approval) continue; const rel = `project-control/approvals/${name}`, isLegacy = legacyApprovalIds.has(approval.id); checkKeys(approval, ['schema_version','id','authority','authorization_type','gate','authorized_at','base_sha','candidate_sha','scope','notes','source','countersigned_by','signature_provenance'], `approval.${name}`); requireKeys(approval, ['schema_version','id','authority','authorization_type','gate','authorized_at','base_sha','candidate_sha','scope'], `approval.${name}`); if (!isLegacy) requireKeys(approval, ['countersigned_by','signature_provenance'], `approval.${name}`); const allow = checkStringList(approval.scope?.allow, `approval.${name}.scope.allow`), prohibit = checkStringList(approval.scope?.prohibit, `approval.${name}.scope.prohibit`); checkSha(approval.base_sha, `approval.${name}.base_sha`); checkSha(approval.candidate_sha, `approval.${name}.candidate_sha`, true); if (approval.authority !== 'GAJ') fail(`CONTROL-APPROVAL-001 ${name} authority must GAJ`); const productionClass = approval.authorization_type === 'production_scope' && nonEmpty(approval.countersigned_by) && nonEmpty(approval.signature_provenance); for (const rule of allow) if (productScopeRule(rule) && !productionClass) fail(`CONTROL-SCOPE-004 ${name} product-path allow forbidden without countersigned production_scope: ${rule}`); if ((prohibit.includes('application asset changes') || prohibit.includes('product functionality changes')) && allow.some(productScopeRule)) fail(`CONTROL-SCOPE-005 ${name} allow-list contradicts product/application prohibit categories`); validateApprovalAppendOnly(rel, isLegacy); if (byApproval.has(approval.id)) fail(`CONTROL-APPROVAL-002 duplicate ${approval.id}`); byApproval.set(approval.id, approval); approvals.push(approval); }

const historicalContradictions = historicalContradictionPaths();
for (const rel of historicalContradictions) if (!fs.existsSync(path.join(root, rel))) fail(`CONTROL-CONTRADICTION-010 historical contradiction record deleted: ${rel}`);
const contradictions = [];
for (const { name, record } of contradictionFiles) {
  if (!record) continue;
  const rel = `project-control/contradictions/${name}`;
  checkKeys(record, ['schema_version','id','requirement','status','candidate_sha','raised_by','timestamp','evidence','resolution'], `contradiction.${name}`);
  requireKeys(record, ['schema_version','id','requirement','status','raised_by','timestamp','evidence'], `contradiction.${name}`);
  if (!['OPEN','RESOLVED'].includes(record.status)) fail(`CONTROL-CONTRADICTION-001 ${name} bad status`);
  if ('candidate_sha' in record) checkSha(record.candidate_sha, `contradiction.${name}.candidate_sha`, true);
  if (record.status === 'RESOLVED') {
    requireKeys(record, ['resolution'], `contradiction.${name}`);
    checkKeys(record.resolution, ['resolver','timestamp','evidence','superseding_candidate_sha'], `contradiction.${name}.resolution`);
    requireKeys(record.resolution, ['resolver','timestamp','evidence','superseding_candidate_sha'], `contradiction.${name}.resolution`);
    actorRecord(record.resolution?.resolver, `contradiction.${name}.resolution.resolver`);
    if (!nonEmpty(record.resolution?.timestamp) || !nonEmpty(record.resolution?.evidence)) fail(`CONTROL-CONTRADICTION-011 ${name} incomplete resolution evidence`);
    checkSha(record.resolution?.superseding_candidate_sha, `contradiction.${name}.resolution.superseding_candidate_sha`);
  }
  validateContradictionAppendOnly(rel, record);
  contradictions.push(record);
}

const head = git(['rev-parse', 'HEAD'], root);
if (reqs && machine && shaOk(head)) for (const requirement of reqs.requirements) validateHistory(requirement, head);
if (state) { const production = state.branches?.production_main, deployment = state.branches?.staging_deployment, recovery = state.branches?.development_recovery; if (production?.last_observed_sha) { const live = remoteSha(production.name); if (live && live !== production.last_observed_sha) fail(`CONTROL-DRIFT-001 ${production.name} drift`); } if (deployment?.last_observed_sha) { const live = remoteSha(deployment.name); if (live && live !== deployment.last_observed_sha) fail(`CONTROL-DRIFT-002 ${deployment.name} drift`); } if (recovery?.name) { const live = remoteSha(recovery.name); if (live && head && live !== head) fail(`CONTROL-DRIFT-003 recovery drift local ${head} remote ${live}`); } }
if (reqs && state && lock) { const active = reqs.requirements.filter(requirement => requirement.status === 'ACTIVE'); if (active.length !== 1) fail(`CONTROL-ACTIVE-001 expected 1 ACTIVE found ${active.length}`); else pass(`exactly one ACTIVE gate: ${active[0].id}`); if (active.length === 1 && active[0].id !== state.active_gate) fail('CONTROL-STATE-002 canonical active mismatch'); if (lock.gate !== state.active_gate) fail('CONTROL-LOCK-001 lock mismatch'); if (legacyApprovalIds.has(lock.approval_ref)) fail(`CONTROL-APPROVAL-011 execution lock may not reference legacy approval ${lock.approval_ref}`); const approval = byApproval.get(lock.approval_ref), activeReq = reqs.requirements.find(requirement => requirement.id === state.active_gate); if (!approval) fail(`CONTROL-APPROVAL-003 unresolved ${lock.approval_ref}`); else { if (approval.gate !== lock.gate) fail('CONTROL-APPROVAL-004 approval gate mismatch'); const approvalAllow = new Set(checkStringList(approval.scope.allow, `approval.${approval.id}.scope.allow`)); for (const rule of checkStringList(lock.scope.allow, 'EXECUTION_LOCK.scope.allow')) if (!approvalAllow.has(rule)) fail(`CONTROL-APPROVAL-005 lock exceeds approval ${rule}`); if (activeReq?.candidate_sha && approval.candidate_sha !== activeReq.candidate_sha) fail('CONTROL-APPROVAL-006 candidate binding mismatch'); } const allow = checkStringList(lock.scope.allow, 'EXECUTION_LOCK.scope.allow'), prohibit = checkStringList(lock.scope.prohibit, 'EXECUTION_LOCK.scope.prohibit'); for (const requiredProhibit of ['main changes','production changes','gh-pages changes','DNS or GoDaddy changes']) if (!prohibit.includes(requiredProhibit)) fail(`CONTROL-SCOPE-001 prohibit missing ${requiredProhibit}`); for (const rule of allow) if (productScopeRule(rule)) fail(`CONTROL-SCOPE-006 execution lock may not allow product path under non-production gate: ${rule}`); if ((prohibit.includes('application asset changes') || prohibit.includes('product functionality changes')) && allow.some(productScopeRule)) fail('CONTROL-SCOPE-007 execution lock allow-list contradicts product/application prohibit categories'); if (approval?.base_sha) { const diff = String(git(['diff','--name-only',`${approval.base_sha}..HEAD`],root)||'').split(/\n+/).filter(Boolean); for (const file of diff) if (!pathAllowed(file, allow)) fail(`CONTROL-SCOPE-003 changed path outside execution allow-list: ${file}`); } }
if (reqs) for (const requirement of reqs.requirements) { let verification = null; if (requirement.independent_verification_record) { verification = readYaml(`project-control/verification/${requirement.independent_verification_record}.yaml`); if (verification) { checkKeys(verification, ['schema_version','id','requirement','candidate_sha','result','verifier','implementer','identity_provenance','timestamp','evidence','limitations'], `verification.${requirement.independent_verification_record}`); requireKeys(verification, ['schema_version','id','requirement','candidate_sha','result','verifier','implementer','identity_provenance','timestamp','evidence','limitations'], `verification.${requirement.independent_verification_record}`); checkSha(verification.candidate_sha, `${requirement.id}.verification.candidate_sha`); if (verification.requirement !== requirement.id) fail(`CONTROL-VERIFY-001 ${requirement.id} requirement mismatch`); if (verification.result !== 'PASS') fail(`CONTROL-VERIFY-002 ${requirement.id} result not PASS`); requireIndependentActors(verification.verifier, verification.implementer, `verification.${requirement.independent_verification_record}`); const current = requirement.candidate_sha || requirement.implementation_sha; if (current && verification.candidate_sha !== current) { const exempted = requirement.non_impact_rule_ref ? validateNonImpactRule(requirement, verification, current) : false; if (!exempted) { if (requirement.status !== 'IMPLEMENTATION_TESTED') fail(`CONTROL-STALE-001 ${requirement.id} stale status must IMPLEMENTATION_TESTED`); fail(`CONTROL-STALE-002 ${requirement.id} stale verification`); } } } } else if (requirement.non_impact_rule_ref) fail(`CONTROL-NONIMPACT-007 ${requirement.id} non-impact ref exists without verification record`); if (['INDEPENDENTLY_VERIFIED','GAJ_ACCEPTED','CLOSED'].includes(requirement.status)) { if (!verification) fail(`CONTROL-VERIFY-004 ${requirement.id} requires record`); requireIndependentActors(requirement.verifier, requirement.implementer, `requirement.${requirement.id}`); } if (['GAJ_ACCEPTED','CLOSED'].includes(requirement.status) && !nonEmpty(requirement.gaj_acceptance_record)) fail(`CONTROL-GAJ-001 ${requirement.id} acceptance record required`); if (['IMPLEMENTED','IMPLEMENTATION_TESTED','DEPLOYED','INDEPENDENTLY_VERIFIED','GAJ_ACCEPTED','CLOSED'].includes(requirement.status) && !shaOk(requirement.implementation_sha)) fail(`CONTROL-IMPLEMENTATION-001 ${requirement.id} ${requirement.status} requires implementation_sha`); const contradiction = contradictions.find(item => item.requirement === requirement.id && item.status === 'OPEN'); if (contradiction && ['INDEPENDENTLY_VERIFIED','GAJ_ACCEPTED','CLOSED'].includes(requirement.status)) fail(`CONTROL-CONTRADICTION-002 ${requirement.id} unresolved ${contradiction.id}`); }
if (shaOk(head)) for (const rel of walkControl()) { const raw = readText(rel); if (raw !== null && raw.includes(head)) fail(`CONTROL-SELF-SHA-001 ${rel} contains own HEAD ${head}`); }
if (failures) process.exitCode = 1; else console.log('CONTROL PLANE VALID');
