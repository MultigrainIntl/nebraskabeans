import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

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

  const project = readYaml('project-control/PROJECT.yaml');
  if (requirements?.canonical_status_source !== true) {
    fail('CONTROL-CANONICAL-101 REQUIREMENTS.canonical_status_source must be true');
  }
  if (!project || project.status_authority !== 'REQUIREMENTS.yaml') {
    fail('CONTROL-CANONICAL-102 PROJECT.status_authority must equal REQUIREMENTS.yaml');
  }

  for (const [name, rel] of Object.entries(project?.canonical_sources || {})) {
    const absolute = path.join(root, rel);
    if (!fs.existsSync(absolute)) {
      fail(`CONTROL-CANONICAL-103 canonical source ${name} does not exist: ${rel}`);
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

    const requirementImplementer = actor(requirement.implementer, `${requirement.id}.implementer`);
    const requirementVerifier = actor(requirement.verifier, `${requirement.id}.verifier`);
    const recordImplementer = actor(verification.implementer, `${requirement.id}.verification.implementer`);
    const recordVerifier = actor(verification.verifier, `${requirement.id}.verification.verifier`);

    const sameVendor = (left, right) =>
      left && right && String(left.vendor).toLowerCase() === String(right.vendor).toLowerCase();

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
