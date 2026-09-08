#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readProjectDocument, validateDevelopmentGate } from './lib/development-gate.mjs';

try {
  const { values } = parseArgs({ options: { checkpoint: { type: 'string' }, mode: { type: 'string', default: 'completion' } } });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (!values.checkpoint) throw Error('必须传入 --checkpoint <项目相对路径>；无过程产物不得声明业务完成');
  const errors = validateDevelopmentGate(root, readProjectDocument(root, values.checkpoint), values.mode);
  if (errors.length) throw Error(errors.join('\n'));
  console.log(`业务 ${values.mode} 校验通过；语义正确性仍须独立 Review`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
