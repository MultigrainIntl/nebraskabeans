#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const fail = msg => { console.error(`FAIL ${msg}`); process.exitCode = 1; };
const pass = msg => console.log(`PASS ${msg}`);

const reqText = read('project-control/REQUIREMENTS.yaml');
const stateText = read('project-control/CURRENT_STATE.yaml');
const lockText = read('project-control/EXECUTION_LOCK.yaml');
const schemaText = read('joieos/CONTROL_SCHEMA.yaml');

const requirementBlocks = [...reqText.matchAll(/\n  - id: ([A-Z0-9-]+)\n([\s\S]*?)(?=\n  - id: |$)/g)].map(m => ({id:m[1], body:m[2]}));
const active = requirementBlocks.filter(r => /^    status: ACTIVE$/m.test(r.body));
const stateGate = stateText.match(/^active_gate: ([A-Z0-9-]+)$/m)?.[1];
const lockGate = lockText.match(/^gate: ([A-Z0-9-]+)$/m)?.[1];

if (active.length !== 1) fail(`CONTROL-ACTIVE-001 expected exactly one ACTIVE gate; found ${active.length}`); else pass(`exactly one ACTIVE gate: ${active[0].id}`);
if (!stateGate) fail('CONTROL-STATE-001 CURRENT_STATE missing active_gate');
if (stateGate && !requirementBlocks.some(r => r.id === stateGate)) fail(`CONTROL-STATE-002 active gate ${stateGate} does not exist in REQUIREMENTS`); else if (stateGate) pass(`active gate exists: ${stateGate}`);
if (active.length === 1 && stateGate !== active[0].id) fail(`CONTROL-STATE-003 CURRENT_STATE gate ${stateGate} != canonical ACTIVE ${active[0].id}`); else if (active.length === 1) pass('CURRENT_STATE matches canonical ACTIVE gate');
if (lockGate !== stateGate) fail(`CONTROL-LOCK-001 execution lock ${lockGate} != active gate ${stateGate}`); else pass('execution lock matches active gate');

for (const forbidden of ['main changes','production changes','gh-pages changes']) {
  if (!lockText.includes(`- ${forbidden}`)) fail(`CONTROL-SCOPE-001 execution lock does not explicitly prohibit ${forbidden}`);
}
if (!process.exitCode) pass('execution lock explicitly protects main, gh-pages, and production');

for (const r of requirementBlocks) {
  const status = r.body.match(/^    status: ([A-Z_]+)$/m)?.[1];
  if (status === 'INDEPENDENTLY_VERIFIED' || status === 'GAJ_ACCEPTED' || status === 'CLOSED') {
    const impl = r.body.match(/^    implementer: (.+)$/m)?.[1]?.trim();
    const rec = r.body.match(/^    independent_verification_record: (.+)$/m)?.[1]?.trim();
    if (!rec || rec === 'null') fail(`CONTROL-VERIFY-001 ${r.id} has ${status} without independent verification record`);
    if (impl && /^\s*verifier:\s*(.+)$/m.test(r.body)) {
      const verifier = r.body.match(/^\s*verifier:\s*(.+)$/m)?.[1]?.trim();
      if (verifier === impl) fail(`CONTROL-IV-001 ${r.id} verifier equals implementer`);
    }
  }
  if (status === 'GAJ_ACCEPTED' || status === 'CLOSED') {
    const gaj = r.body.match(/^    gaj_acceptance_record: (.+)$/m)?.[1]?.trim();
    if (!gaj || gaj === 'null') fail(`CONTROL-APPROVAL-001 ${r.id} has ${status} without GAJ acceptance record`);
  }
}

if (!schemaText.includes('fail_closed: true')) fail('CONTROL-SCHEMA-001 fail_closed is not true'); else pass('control schema is fail-closed');
if (stateText.includes('candidate_sha: PENDING_CONTROL_002_COMMIT')) fail('CONTROL-SHA-001 self-referential pending candidate SHA is prohibited');

if (!process.exitCode) console.log('CONTROL PLANE VALID');
