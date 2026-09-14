#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import YAML from 'yaml';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8'
}).trim();
const baseHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8'
}).trim();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-control-fixtures-'));
const work = path.join(tmp, 'work');

execFileSync('git', ['worktree', 'add', '--detach', work, baseHead], {
  cwd: root,
  stdio: 'ignore'
});

function ensureNodeModules() {
  try {
    if (!fs.existsSync(path.join(work, 'node_modules'))) {
      fs.symlinkSync(path.join(root, 'node_modules'), path.join(work, 'node_modules'), 'dir');
    }
  } catch {}
}
ensureNodeModules();

const p = rel => path.join(work, rel);
const load = rel => YAML.parse(fs.readFileSync(p(rel), 'utf8'));
const save = (rel, object) => {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), YAML.stringify(object));
};
const req = () => load('project-control/REQUIREMENTS.yaml');
const saveReq = object => save('project-control/REQUIREMENTS.yaml', object);
const lock = () => load('project-control/EXECUTION_LOCK.yaml');
const saveLock = object => save('project-control/EXECUTION_LOCK.yaml', object);
const approvalPath = 'project-control/approvals/APPROVAL-CONTROL-009-20260914.yaml';
const approval = () => load(approvalPath);
const saveApproval = object => save(approvalPath, object);
const active = requirements => requirements.requirements.find(item => item.id === 'CONTROL-009');
const other = requirements => requirements.requirements.find(item => item.id === 'SCI-001');
const yieldApprovalPath = 'project-control/approvals/APPROVAL-YIELD-001-20260914.yaml';

function activateYieldGate() {
  const requirements = req();
  setStatus(active(requirements), 'BLOCKED', '531a974b013a0398d9d7b3fd3213af6796755e0d');
  const yieldGate = requirements.requirements.find(item => item.id === 'YIELD-001');
  setStatus(yieldGate, 'ACTIVE', '531a974b013a0398d9d7b3fd3213af6796755e0d');
  saveReq(requirements);

  const state = load('project-control/CURRENT_STATE.yaml');
  state.active_gate = 'YIELD-001';
  save('project-control/CURRENT_STATE.yaml', state);

  const yieldApproval = load(yieldApprovalPath);
  const executionLock = lock();
  executionLock.gate = 'YIELD-001';
  executionLock.approval_ref = yieldApproval.id;
  executionLock.base_sha = yieldApproval.base_sha;
  executionLock.scope = structuredClone(yieldApproval.scope);
  saveLock(executionLock);
}

function reset() {
  execFileSync('git', ['reset', '--hard', baseHead], { cwd: work, stdio: 'ignore' });
  execFileSync('git', ['clean', '-fd'], { cwd: work, stdio: 'ignore' });
  ensureNodeModules();
}

function commitFixture(message) {
  execFileSync('git', ['add', '-A'], { cwd: work, stdio: 'ignore' });
  execFileSync(
    'git',
    [
      '-c', 'user.name=control-fixture',
      '-c', 'user.email=fixture@example.invalid',
      'commit', '-m', message
    ],
    { cwd: work, stdio: 'ignore' }
  );
}

function setStatus(requirement, to, sha = '0cbfb3b86028d7ab8226283a8eccf07ec76ea134') {
  const from = requirement.status;
  requirement.transitions.push({
    from,
    to,
    sha,
    actor: 'fixture',
    timestamp: '2026-09-13T13:40:00-06:00'
  });
  requirement.status = to;
}

function makeVerification(requirement, options = {}) {
  const {
    verifier = 'anthropic-claude-opus-5',
    implementer = requirement.implementer,
    candidateSha = requirement.candidate_sha || requirement.implementation_sha,
    result = 'PASS'
  } = options;
  const id = 'VERIFY-FIXTURE';
  requirement.independent_verification_record = id;
  requirement.verifier = verifier;
  requirement.identity_provenance = 'fixture provenance';
  save(`project-control/verification/${id}.yaml`, {
    schema_version: 1,
    id,
    requirement: requirement.id,
    candidate_sha: candidateSha,
    result,
    verifier,
    implementer,
    identity_provenance: 'fixture provenance',
    timestamp: '2026-09-13T13:40:00-06:00',
    evidence: 'fixture evidence',
    limitations: 'fixture limitations'
  });
}

const fixtures = [];
const add = (id, expect, mutate, requiredOutput = null) => {
  fixtures.push({ id, expect, mutate, requiredOutput });
};

add('A01-canonical', 0, () => {});
add('A02-two-active', 1, () => {
  const r = req();
  const x = other(r);
  x.history_start_status = 'OPEN';
  x.transitions = [{
    from: 'OPEN', to: 'ACTIVE',
    sha: '6102f9f5109adea9640d095b432504a764ce7b92',
    actor: 'fixture', timestamp: '2026-09-13T13:40:00-06:00'
  }];
  x.status = 'ACTIVE';
  saveReq(r);
});
add('A03-zero-active', 1, () => {
  const r = req();
  active(r).status = 'FAILED';
  saveReq(r);
});
add('A04-lock-mismatch', 1, () => {
  const l = lock();
  l.gate = 'CONTROL-002';
  saveLock(l);
});
add('A05-nonexistent-gate', 1, () => {
  const state = load('project-control/CURRENT_STATE.yaml');
  state.active_gate = 'CONTROL-999';
  save('project-control/CURRENT_STATE.yaml', state);
});
add('A06-same-vendor-verifier', 1, () => {
  const r = req();
  const x = active(r);
  makeVerification(x, { verifier: 'openai-chatgpt' });
  saveReq(r);
});
add('A07-missing-verifier', 1, () => {
  const r = req();
  const x = active(r);
  makeVerification(x, { verifier: '' });
  saveReq(r);
});
add('A08-fake-verified-no-record', 1, () => {
  const r = req();
  const x = active(r);
  x.independent_verification_record = 'i-definitely-verified-this';
  x.verifier = 'anthropic-claude-opus-5';
  saveReq(r);
});
add('A09-acceptance-before-IV', 1, () => {
  const r = req();
  const x = active(r);
  x.status = 'GAJ_ACCEPTED';
  x.gaj_acceptance_record = 'he said yes in chat';
  saveReq(r);
});
add('A10-stale-verification', 1, () => {
  const r = req();
  const x = r.requirements.find(item => item.id === 'CONTROL-001');
  makeVerification(x, {
    candidateSha: 'b5c3aa1b06f3175917b76f46a1935f9db2279b48'
  });
  saveReq(r);
});
add('A11-abbreviated-sha', 1, () => {
  const r = req();
  active(r).candidate_sha = 'abc123';
  saveReq(r);
});
add('A12-approval-wrong-gate', 1, () => {
  const a = approval();
  a.gate = 'MAP-001';
  saveApproval(a);
});
add('A13-approval-wrong-candidate', 1, () => {
  const r = req();
  active(r).candidate_sha = '6102f9f5109adea9640d095b432504a764ce7b92';
  saveReq(r);
  const a = approval();
  a.candidate_sha = 'b5c3aa1b06f3175917b76f46a1935f9db2279b48';
  saveApproval(a);
});
add('A14-verification-wrong-sha', 1, () => {
  const r = req();
  const x = r.requirements.find(item => item.id === 'CONTROL-001');
  makeVerification(x, {
    candidateSha: 'b5c3aa1b06f3175917b76f46a1935f9db2279b48'
  });
  saveReq(r);
});
add('A15-status-edit-without-transition', 1, () => {
  const r = req();
  active(r).status = 'CLOSED';
  saveReq(r);
});
add('A16-malformed-yaml', 1, () => {
  fs.appendFileSync(p('project-control/REQUIREMENTS.yaml'), '\nrequirements: duplicate\n');
});
add('A17-missing-mandatory-file', 1, () => {
  fs.unlinkSync(p('project-control/EXECUTION_LOCK.yaml'));
});
add('A18-unknown-status', 1, () => {
  const r = req();
  active(r).status = 'MAGIC';
  saveReq(r);
});
add('A19-protected-target-in-allow', 1, () => {
  const l = lock();
  l.scope.allow.push('production changes');
  saveLock(l);
});
add('A20-open-contradiction-on-verified', 1, () => {
  save('project-control/contradictions/C1.yaml', {
    schema_version: 1,
    id: 'C1',
    requirement: 'CONTROL-001',
    status: 'OPEN',
    candidate_sha: '6102f9f5109adea9640d095b432504a764ce7b92',
    raised_by: 'gaj-product-authority',
    timestamp: '2026-09-13T13:40:00-06:00',
    evidence: 'direct contradiction'
  });
});
add('A21-delete-approvals-directory-records', 1, () => {
  for (const file of fs.readdirSync(p('project-control/approvals'))) {
    if (file.endsWith('.yaml')) fs.unlinkSync(p(`project-control/approvals/${file}`));
  }
});
add('A22-fake-approval-authority', 1, () => {
  const a = approval();
  a.authority = 'ChatGPT';
  saveApproval(a);
});
add('A23-nonexistent-approval-base-sha', 1, () => {
  const a = approval();
  a.base_sha = '0000000000000000000000000000000000000000';
  saveApproval(a);
});
add('A24-lock-prohibit-moved-to-allow', 1, () => {
  const l = lock();
  const moved = l.scope.prohibit.filter(item =>
    ['main changes', 'production changes', 'gh-pages changes'].includes(item)
  );
  l.scope.allow.push(...moved);
  l.scope.prohibit = l.scope.prohibit.filter(item => !moved.includes(item));
  saveLock(l);
});
add('A25-lock-allow-not-subset-approval', 1, () => {
  const l = lock();
  l.scope.allow.push('joieos/UNAUTHORIZED');
  saveLock(l);
});
add('A26-duplicate-yaml-key', 1, () => {
  fs.appendFileSync(p('project-control/EXECUTION_LOCK.yaml'), '\ngate: CONTROL-006\n');
});
add('A27-unknown-yaml-key', 1, () => {
  const l = lock();
  l.magic_bypass = true;
  saveLock(l);
});
add('A28-quoted-active-scalar-valid', 0, () => {
  let raw = fs.readFileSync(p('project-control/REQUIREMENTS.yaml'), 'utf8');
  raw = raw.replace('status: ACTIVE', 'status: "ACTIVE"');
  fs.writeFileSync(p('project-control/REQUIREMENTS.yaml'), raw);
});
add('A29-quoted-lock-gate-valid', 0, () => {
  let raw = fs.readFileSync(p('project-control/EXECUTION_LOCK.yaml'), 'utf8');
  raw = raw.replace('gate: CONTROL-009', 'gate: "CONTROL-009"');
  fs.writeFileSync(p('project-control/EXECUTION_LOCK.yaml'), raw);
});
add('A30-valid-yaml-whitespace', 0, () => {
  let raw = fs.readFileSync(p('project-control/REQUIREMENTS.yaml'), 'utf8');
  raw = raw.replace('status: ACTIVE', 'status:    ACTIVE   ');
  fs.writeFileSync(p('project-control/REQUIREMENTS.yaml'), raw);
});
add('A31-branch-name-in-sha', 1, () => {
  const r = req();
  active(r).candidate_sha = 'main';
  saveReq(r);
});
add('A32-upper-case-sha', 1, () => {
  const r = req();
  active(r).candidate_sha = 'B5C3AA1B06F3175917B76F46A1935F9DB2279B48';
  saveReq(r);
});
add('A33-empty-lock-allow', 1, () => {
  const l = lock();
  l.scope.allow = [];
  saveLock(l);
});
add('A34-illegal-transition', 1, () => {
  const r = req();
  const x = active(r);
  x.transitions.push({
    from: 'ACTIVE',
    to: 'CLOSED',
    sha: '0cbfb3b86028d7ab8226283a8eccf07ec76ea134',
    actor: 'fixture',
    timestamp: '2026-09-13T13:40:00-06:00'
  });
  x.status = 'CLOSED';
  saveReq(r);
});
add('A35-transition-chain-break', 1, () => {
  const r = req();
  active(r).transitions.push({
    from: 'FAILED',
    to: 'ACTIVE',
    sha: '0cbfb3b86028d7ab8226283a8eccf07ec76ea134',
    actor: 'fixture',
    timestamp: '2026-09-13T13:40:00-06:00'
  });
  saveReq(r);
});
add('A36-unknown-case-alias', 1, () => {
  const r = req();
  const x = r.requirements.find(item => item.id === 'CONTROL-001');
  makeVerification(x, { verifier: 'CHATGPT' });
  saveReq(r);
});
add('A37-openai-alias-unregistered', 1, () => {
  const r = req();
  const x = r.requirements.find(item => item.id === 'CONTROL-001');
  makeVerification(x, { verifier: 'OpenAI-GPT-5' });
  saveReq(r);
});
add('A38-missing-identity-provenance', 1, () => {
  const r = req();
  delete active(r).identity_provenance;
  saveReq(r);
});

add('S2-empty-control-rules', 1, () => {
  const control = load('joieos/CONTROL_SCHEMA.yaml');
  control.rules = {};
  save('joieos/CONTROL_SCHEMA.yaml', control);
}, 'CONTROL-SCHEMA-006');
add('S2-empty-control-precedence', 1, () => {
  const control = load('joieos/CONTROL_SCHEMA.yaml');
  control.precedence = [];
  save('joieos/CONTROL_SCHEMA.yaml', control);
}, 'CONTROL-SCHEMA-006');
add('S2-reordered-control-precedence', 1, () => {
  const control = load('joieos/CONTROL_SCHEMA.yaml');
  [control.precedence[0], control.precedence[1]] =
    [control.precedence[1], control.precedence[0]];
  save('joieos/CONTROL_SCHEMA.yaml', control);
}, 'CONTROL-SCHEMA-006');
add('S2-disabled-control-rule', 1, () => {
  const control = load('joieos/CONTROL_SCHEMA.yaml');
  control.rules.exactly_one_active_gate = false;
  save('joieos/CONTROL_SCHEMA.yaml', control);
}, 'CONTROL-SCHEMA-006');
add('S2-missing-control-rule', 1, () => {
  const control = load('joieos/CONTROL_SCHEMA.yaml');
  delete control.rules.exactly_one_active_gate;
  save('joieos/CONTROL_SCHEMA.yaml', control);
}, 'CONTROL-SCHEMA-006');
add('S2-unknown-control-rule', 1, () => {
  const control = load('joieos/CONTROL_SCHEMA.yaml');
  control.rules.unknown_rule = true;
  save('joieos/CONTROL_SCHEMA.yaml', control);
}, 'CONTROL-SCHEMA-002 unknown key CONTROL_SCHEMA.rules.unknown_rule');
add('S2-governance-precedence-drift', 1, () => {
  const rel = 'joieos/GOVERNANCE.md';
  const raw = fs.readFileSync(p(rel), 'utf8');
  fs.writeFileSync(
    p(rel),
    raw.replace('10. Chat history.', '10. Chat recollection.')
  );
}, 'CONTROL-SCHEMA-006');

for (const alias of ['GPT5', 'G.P.T.-5', 'Codex', 'o3', 'Assistant']) {
  add(`N1-unregistered-verifier-${alias}`, 1, () => {
    const r = req();
    const x = r.requirements.find(item => item.id === 'CONTROL-001');
    makeVerification(x, { verifier: alias });
    saveReq(r);
  });
}

add('N4-contradiction-flipped-resolved-without-resolution', 1, () => {
  const rel = 'project-control/contradictions/N4.yaml';
  save(rel, {
    schema_version: 1,
    id: 'N4',
    requirement: 'CONTROL-001',
    status: 'OPEN',
    candidate_sha: '6102f9f5109adea9640d095b432504a764ce7b92',
    raised_by: 'gaj-product-authority',
    timestamp: '2026-09-13T13:40:00-06:00',
    evidence: 'fixture contradiction'
  });
  commitFixture('fixture: introduce open contradiction');
  const record = load(rel);
  record.status = 'RESOLVED';
  save(rel, record);
});
add('N5-contradictions-directory-deleted', 1, () => {
  fs.rmSync(p('project-control/contradictions'), { recursive: true, force: true });
});
add('N6-verification-implementer-mismatch', 1, () => {
  const r = req();
  const x = r.requirements.find(item => item.id === 'CONTROL-001');
  makeVerification(x, { implementer: 'gaj-product-authority' });
  saveReq(r);
});
add('N7-free-text-non-impact-ref', 1, () => {
  const r = req();
  const x = r.requirements.find(item => item.id === 'CONTROL-001');
  makeVerification(x, {
    candidateSha: 'b5c3aa1b06f3175917b76f46a1935f9db2279b48'
  });
  x.non_impact_rule_ref = 'trust-me-nothing-relevant-changed';
  saveReq(r);
});
add('N8-self-authored-assets-scope-expansion', 1, () => {
  const a = approval();
  a.scope.allow.push('assets/**', 'index.html');
  a.scope.prohibit.push('application asset changes');
  saveApproval(a);
  const l = lock();
  l.scope.allow.push('assets/**', 'index.html');
  l.scope.prohibit.push('application asset changes');
  saveLock(l);
  fs.appendFileSync(p('assets/site.css'), '\n/* unauthorized fixture */\n');
}, [
  'CONTROL-SCOPE-004',
  'CONTROL-SCOPE-005',
  'CONTROL-SCOPE-006',
  'CONTROL-SCOPE-007'
]);
add('CONTROL009-product-paths-with-no-approval', 1, () => {
  activateYieldGate();
  const l = lock();
  l.approval_ref = 'APPROVAL-DOES-NOT-EXIST';
  saveLock(l);
}, 'CONTROL-SCOPE-006');
add('CONTROL009-product-path-beyond-approval', 1, () => {
  activateYieldGate();
  const l = lock();
  l.scope.allow.push('bean.html');
  saveLock(l);
}, 'CONTROL-SCOPE-006');
add('CONTROL009-control-gate-product-path', 1, () => {
  const a = approval();
  a.authorization_type = 'production_scope';
  a.scope.allow.push('index.html');
  saveApproval(a);
  const l = lock();
  l.scope.allow.push('index.html');
  saveLock(l);
}, 'CONTROL-SCOPE-006');
add('CONTROL009-deployment-surface-under-approval', 1, () => {
  activateYieldGate();
  const a = load(yieldApprovalPath);
  a.scope.allow.push('.github/workflows/staging-qa.yml');
  save(yieldApprovalPath, a);
  const l = lock();
  l.scope.allow.push('.github/workflows/staging-qa.yml');
  saveLock(l);
}, 'CONTROL-SCOPE-006');
add('CONTROL009-production-surface-not-barred', 1, () => {
  activateYieldGate();
  const a = load(yieldApprovalPath);
  a.scope.prohibit = a.scope.prohibit.filter(item => item !== 'production changes');
  save(yieldApprovalPath, a);
}, 'CONTROL-SCOPE-006');
for (const [id, rule] of [
  ['a-prefix', 'a/**'],
  ['i-prefix', 'i/**'],
  ['as-prefix', 'as/**'],
  ['bare-assets-directory', 'assets'],
  ['dot-assets-prefix', './assets/**'],
  ['asse-prefix', 'asse/**']
]) {
  add(`S1-${id}`, 1, () => {
    const a = approval();
    a.scope.allow.push(rule);
    saveApproval(a);
    const l = lock();
    l.scope.allow.push(rule);
    saveLock(l);
  }, 'CONTROL-SCOPE-008');
}
add('N9b-history-start-teleport', 1, () => {
  const r = req();
  const x = other(r);
  x.history_start_status = 'DEPLOYED';
  delete x.history_anchor_sha;
  x.transitions = [];
  x.status = 'DEPLOYED';
  x.implementation_sha = '6102f9f5109adea9640d095b432504a764ce7b92';
  saveReq(r);
});
add('A37-status-authority-tampering', 1, () => {
  const project = load('project-control/PROJECT.yaml');
  project.status_authority = 'CURRENT_STATE.yaml';
  save('project-control/PROJECT.yaml', project);
});
add('N13-reintroduce-prose-failures-ledger', 1, () => {
  fs.writeFileSync(
    p('project-control/FAILURES.md'),
    '# Failures\n- CONTROL-006 — ACTIVE\n- MAP-001 — FAILED\n'
  );
});

let wrong = 0;
for (const fixture of fixtures) {
  reset();
  fixture.mutate();
  const run = spawnSync(
    process.execPath,
    ['scripts/validate-control-plane.mjs'],
    { cwd: work, encoding: 'utf8' }
  );
  const actual = run.status ?? 1;
  const combinedOutput = `${run.stdout}\n${run.stderr}`;
  const exitOk = fixture.expect === 0 ? actual === 0 : actual !== 0;
  const requiredOutputs = fixture.requiredOutput
    ? [fixture.requiredOutput].flat()
    : [];
  const outputOk = requiredOutputs.every(expected =>
    combinedOutput.includes(expected)
  );
  const ok = exitOk && outputOk;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${fixture.id} expected ` +
    `${fixture.expect === 0 ? 'zero' : 'non-zero'} got ${actual}` +
    `${requiredOutputs.length ? ` with ${requiredOutputs.join(',')}` : ''}`
  );
  if (!ok) {
    wrong += 1;
    console.log(run.stdout);
    console.error(run.stderr);
  }
}

reset();
try {
  execFileSync('git', ['worktree', 'remove', '--force', work], {
    cwd: root,
    stdio: 'ignore'
  });
} catch {}
fs.rmSync(tmp, { recursive: true, force: true });

if (wrong) {
  console.error(
    `FAIL ${wrong} of ${fixtures.length} implementer-authored fixture expectations were violated`
  );
  process.exit(1);
}
console.log(
  `PASS all ${fixtures.length} implementer-authored and implementer-run adversarial fixture expectations`
);
