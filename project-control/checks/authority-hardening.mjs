import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PROSE_LEDGER_PATHS = new Set([
  'project-control/FAILURES.md',
  'project-control/STATUS.md',
  'project-control/CURRENT_STATUS.md',
  'project-control/REQUIREMENTS.md',
  'project-control/generated/FAILURES.md',
  'project-control/generated/STATUS.md'
]);

const EXPECTED_SCHEMA_VERSIONS = new Map([
  ['joieos/CONTROL_SCHEMA.yaml', 2],
  ['joieos/STATE_MACHINE.yaml', 1],
  ['joieos/ACTORS.yaml', 1],
  ['project-control/PROJECT.yaml', 3],
  ['project-control/CURRENT_STATE.yaml', 5],
  ['project-control/REQUIREMENTS.yaml', 6],
  ['project-control/EXECUTION_LOCK.yaml', 4],
  ['project-control/APPROVAL_LEGACY.yaml', 2]
]);

export function runAuthorityHardeningChecks(ctx) {
  const {
    requirements,
    actorRegistry,
    readYaml,
    fail,
    nonEmpty
  } = ctx;

  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8'
  }).trim();

  const runGit = args => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    } catch (error) {
      fail(`CONTROL-AUTH-GIT-101 git ${args.join(' ')} failed: ${error.message}`);
      return '';
    }
  };

  const pathAllowed = (file, rules) => rules.some(rule => {
    if (rule.endsWith('/**')) return file.startsWith(rule.slice(0, -3));
    if (rule.endsWith('/')) return file.startsWith(rule);
    return file === rule;
  });

  for (const [rel, expected] of EXPECTED_SCHEMA_VERSIONS) {
    const record = readYaml(rel);
    if (!record || record.schema_version !== expected) {
      fail(
        `CONTROL-SCHEMA-VERSION-101 ${rel} schema_version must equal ${expected}`
      );
    }
  }

  const project = readYaml('project-control/PROJECT.yaml');
  if (requirements?.canonical_status_source !== true) {
    fail('CONTROL-CANONICAL-101 REQUIREMENTS.canonical_status_source must be true');
  }
  if (!project || project.status_authority !== 'REQUIREMENTS.yaml') {
    fail('CONTROL-CANONICAL-102 PROJECT.status_authority must equal REQUIREMENTS.yaml');
  }

  for (const [name, rel] of Object.entries(project?.canonical_sources || {})) {
    if (!fs.existsSync(path.join(root, rel))) {
      fail(`CONTROL-CANONICAL-103 canonical source ${name} does not exist: ${rel}`);
    }
  }

  const legacy = readYaml('project-control/APPROVAL_LEGACY.yaml');
  const legacyRecords = legacy?.legacy_records || {};
  for (const id of legacy?.legacy_approval_ids || []) {
    const definition = legacyRecords[id];
    if (!definition || definition.referenceable !== false) {
      fail(`CONTROL-LEGACY-101 legacy approval ${id} must be explicitly non-referenceable`);
      continue;
    }
    const approval = readYaml(`project-control/approvals/${id}.yaml`);
    if (!approval || approval.schema_version !== definition.schema_version) {
      fail(`CONTROL-LEGACY-102 legacy approval ${id} schema version mismatch`);
    }
    if (!nonEmpty(definition.path_convention)) {
      fail(`CONTROL-LEGACY-103 legacy approval ${id} path convention must be declared`);
    }
  }

  const scanRecordDirectory = (rel, expectedVersion) => {
    const absolute = path.join(root, rel);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;
      const recordRel = path.posix.join(rel, entry.name);
      const record = readYaml(recordRel);
      if (!record || record.schema_version !== expectedVersion) {
        fail(
          `CONTROL-SCHEMA-VERSION-102 ${recordRel} schema_version ` +
          `must equal ${expectedVersion}`
        );
      }
    }
  };

  scanRecordDirectory('project-control/verification', 1);
  scanRecordDirectory('project-control/contradictions', 1);
  scanRecordDirectory('project-control/non-impact-rules', 1);

  const approvalDir = path.join(root, 'project-control/approvals');
  for (const entry of fs.readdirSync(approvalDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;
    const rel = `project-control/approvals/${entry.name}`;
    const approval = readYaml(rel);
    if (!approval) continue;
    const legacyDefinition = legacyRecords[approval.id];
    const expected = legacyDefinition?.schema_version ?? 3;
    if (approval.schema_version !== expected) {
      fail(
        `CONTROL-SCHEMA-VERSION-103 ${rel} schema_version must equal ${expected}`
      );
    }
  }

  const lock = readYaml('project-control/EXECUTION_LOCK.yaml');
  if (legacy?.legacy_approval_ids?.includes(lock?.approval_ref)) {
    fail(`CONTROL-LEGACY-104 lock references legacy approval ${lock.approval_ref}`);
  }

  if (lock?.approval_ref) {
    const approvalRel = `project-control/approvals/${lock.approval_ref}.yaml`;
    const introduction = runGit([
      'log', '--diff-filter=A', '--format=%H', '--', approvalRel
    ]).split(/\n+/).filter(Boolean);

    if (introduction.length !== 1) {
      fail(
        `CONTROL-SCOPE-101 active approval ${lock.approval_ref} must have exactly ` +
        `one introducing commit; found ${introduction.length}`
      );
    } else {
      const changed = runGit([
        'diff', '--name-only', `${introduction[0]}..HEAD`
      ]).split(/\n+/).filter(Boolean);
      const allow = Array.isArray(lock.scope?.allow) ? lock.scope.allow : [];
      for (const file of changed) {
        if (!pathAllowed(file, allow)) {
          fail(
            `CONTROL-SCOPE-102 changed path outside approval-introduction ` +
            `audit window allow-list: ${file}`
          );
        }
      }
    }
  }

  for (const rel of PROSE_LEDGER_PATHS) {
    if (fs.existsSync(path.join(root, rel))) {
      fail(`CONTROL-LEDGER-101 prohibited prose status ledger exists: ${rel}`);
    }
  }

  const controlRoot = path.join(root, 'project-control');
  const markdownPaths = [];
  const collectMarkdown = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) collectMarkdown(absolute);
      else if (entry.name.toLowerCase().endsWith('.md')) markdownPaths.push(absolute);
    }
  };
  collectMarkdown(controlRoot);

  const ledgerLine = new RegExp(
    '^\\s*[-*]?\\s*(CONTROL|UX|MAP|YIELD|SCI)-\\d+\\b.*\\b' +
    '(OPEN|ACTIVE|IMPLEMENTED|IMPLEMENTATION_TESTED|DEPLOYED|' +
    'INDEPENDENTLY_VERIFIED|GAJ_ACCEPTED|CLOSED|FAILED|BLOCKED)\\b',
    'i'
  );
  for (const absolute of markdownPaths) {
    const rel = path.relative(root, absolute).split(path.sep).join('/');
    const raw = fs.readFileSync(absolute, 'utf8');
    const matchingLines = raw.split(/\r?\n/).filter(line => ledgerLine.test(line));
    if (matchingLines.length >= 2) {
      fail(`CONTROL-LEDGER-102 prose requirement-status ledger detected: ${rel}`);
    }
  }

  const head = runGit(['rev-parse', 'HEAD']);
  const selfShaFiles = new Set();
  const collectTree = rel => {
    const absolute = path.join(root, rel);
    if (!fs.existsSync(absolute)) return;
    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
      selfShaFiles.add(rel);
      return;
    }
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) collectTree(child);
      else selfShaFiles.add(child);
    }
  };

  for (const rel of ['joieos', 'project-control', 'scripts', 'tests', '.github']) {
    collectTree(rel);
  }
  collectTree('package.json');
  collectTree('package-lock.json');
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      selfShaFiles.add(entry.name);
    }
  }

  for (const rel of selfShaFiles) {
    let raw;
    try {
      raw = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    if (raw.includes(head)) {
      fail(`CONTROL-SELF-SHA-101 ${rel} contains its own containing HEAD ${head}`);
    }
  }

  if (!requirements) return;

  const actor = (id, where) => {
    if (!nonEmpty(id) || !actorRegistry.has(id)) {
      fail(`CONTROL-ACTOR-101 ${where} references unknown actor id ${String(id)}`);
      return null;
    }
    return actorRegistry.get(id);
  };

  for (const requirement of requirements.requirements || []) {
    if (!requirement.independent_verification_record) continue;
    const verification = readYaml(
      `project-control/verification/${requirement.independent_verification_record}.yaml`
    );
    if (!verification) continue;

    if (verification.implementer !== requirement.implementer) {
      fail(
        `CONTROL-IV-101 ${requirement.id} verification implementer ` +
        `${verification.implementer} != requirement implementer ${requirement.implementer}`
      );
    }

    const requirementImplementer = actor(
      requirement.implementer,
      `${requirement.id}.implementer`
    );
    const requirementVerifier = actor(
      requirement.verifier,
      `${requirement.id}.verifier`
    );
    const recordImplementer = actor(
      verification.implementer,
      `${requirement.id}.verification.implementer`
    );
    const recordVerifier = actor(
      verification.verifier,
      `${requirement.id}.verification.verifier`
    );

    const sameVendor = (left, right) =>
      left && right &&
      String(left.vendor).toLowerCase() === String(right.vendor).toLowerCase();

    if (sameVendor(recordVerifier, recordImplementer)) {
      fail(`CONTROL-IV-102 ${requirement.id} verification actors share vendor`);
    }
    if (sameVendor(requirementVerifier, requirementImplementer)) {
      fail(`CONTROL-IV-103 ${requirement.id} requirement actors share vendor`);
    }
    if (
      recordVerifier && requirementVerifier &&
      String(recordVerifier.vendor).toLowerCase() !==
        String(requirementVerifier.vendor).toLowerCase()
    ) {
      fail(`CONTROL-IV-104 ${requirement.id} verifier vendor differs between requirement and record`);
    }
  }
}
