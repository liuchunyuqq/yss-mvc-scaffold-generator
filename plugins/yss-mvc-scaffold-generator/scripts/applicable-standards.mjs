#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { standardsRoots, resolveApplicableStandards, verifyApplicableStandards, contextForWorkUnit } from './lib/applicable-standards.mjs';

try {
  const { values } = parseArgs({ options: { 'project-root': { type: 'string' }, input: { type: 'string' }, output: { type: 'string' }, check: { type: 'boolean' }, 'work-unit': { type: 'string' } }, strict: true });
  if (!values.input || (values.check && values.output)) throw Error('用法: node scripts/applicable-standards.mjs --input <request.json|bundle.json> [--output <bundle.json>] [--check] [--work-unit <id>] [--project-root <项目根>]');
  const roots = standardsRoots(path.resolve(values['project-root'] ?? path.join(import.meta.dirname, '..')));
  const input = JSON.parse(readFileSync(values.input, 'utf8'));
  const bundle = values.check ? input : resolveApplicableStandards(input, roots);
  let result = bundle;
  if (values.check) {
    result = verifyApplicableStandards(bundle, roots);
    if (result.freshness !== 'current') throw Error(result.reasons.join('; '));
  }
  if (values['work-unit']) result = contextForWorkUnit(bundle, values['work-unit'], roots);
  if (values.output) writeFileSync(values.output, JSON.stringify(bundle, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
