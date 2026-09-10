#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readProjectDocument, validateDevelopmentGate } from './lib/development-gate.mjs';

try {
  const { values } = parseArgs({ options: { checkpoint: { type: 'string' }, 'project-root':{type:'string'}, mode: { type: 'string', default: 'completion' }, json:{type:'boolean',default:false} } });
  const root = values['project-root'] ? path.resolve(values['project-root']) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (!values.checkpoint) throw Error('必须传入 --checkpoint <项目相对路径>；无过程产物不得声明业务完成');
  const state=readProjectDocument(root, values.checkpoint);
  if(values.mode==='completion' && state.overall?.checkpoint_ref!==values.checkpoint) throw Error('整体 checkpoint_ref 必须匹配实际输入');
  const errors = validateDevelopmentGate(root, state, values.mode);
  if(values.json) {console.log(JSON.stringify({mode:values.mode,status:errors.length?'not-accepted':'validated',implemented:state.slices?.filter(s=>s.status==='completed').map(s=>s.id)??[],unverified:errors},null,2));process.exitCode=errors.length?1:0;}
  else {
  if (errors.length) throw Error(errors.join('\n'));
  console.log(`业务 ${values.mode} 校验通过；语义正确性仍须独立 Review`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
