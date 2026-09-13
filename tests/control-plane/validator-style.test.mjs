#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8'
}).trim();
const rel = 'scripts/validate-control-plane.mjs';
const raw = fs.readFileSync(path.join(root, rel), 'utf8');
const lines = raw.split(/\r?\n/);
const maxLength = 140;
const violations = lines
  .map((line, index) => ({ number: index + 1, length: line.length }))
  .filter(item => item.length > maxLength);

if (violations.length) {
  console.error(
    `FAIL ${rel} has ${violations.length} line(s) longer than ${maxLength} characters`
  );
  for (const item of violations.slice(0, 20)) {
    console.error(`FAIL line ${item.number}: ${item.length} characters`);
  }
  process.exit(1);
}

const namedFunctions = [...raw.matchAll(/^function\s+[A-Za-z0-9_]+\s*\(/gm)]
  .map(match => match[0]);
if (namedFunctions.length < 20) {
  console.error(
    `FAIL expected at least 20 named validator functions; found ${namedFunctions.length}`
  );
  process.exit(1);
}

console.log(
  `PASS validator reviewability: ${lines.length} lines, maximum line length <= ${maxLength}, ` +
  `${namedFunctions.length} named functions`
);
