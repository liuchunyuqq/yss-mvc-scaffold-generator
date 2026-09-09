#!/usr/bin/env node
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {parseDocument} from './vendor/yaml.mjs';
import {projectPath, acceptanceIds} from './lib/contract-integrity.mjs';
import {loadAcceptancePolicy, fileDigest, validateAcceptanceCheckpoint} from './lib/acceptance-policy.mjs';
import {validateJsonSchema} from './lib/json-schema.mjs';

// 初始化记录，不推测业务验收、不覆盖或重置已有切片与证据。
try {
  const {values} = parseArgs({options:{'project-root':{type:'string',default:'.'}, goal:{type:'string'}, baseline:{type:'string'}, output:{type:'string'}}});
  const root = path.resolve(values['project-root']);
  const identity = parseDocument(readFileSync(path.join(root,'yss-project.yaml'),'utf8'), {uniqueKeys:true});
  if (identity.errors.length) throw identity.errors[0];
  if (identity.toJS()?.schema_version !== 1 || identity.toJS()?.repository_mode !== 'project-instance') throw Error('仅初始化已声明的 project-instance 需求记录');
  const policy = loadAcceptancePolicy(root);
  if (!values.goal?.trim()) throw Error('需要 --goal 描述真实用户目标');
  const target = projectPath(root, values.output);
  const ids = acceptanceIds(root, values.baseline);
  if (!ids.length) throw Error('验收基线没有 AC ID；先从真实需求整理 Spec 验收条件，再初始化');
  const state = {
    schema_version:2, standards_context_version:1, policy_id:policy.policy_id,
    goal:values.goal.trim(), baseline_ref:values.baseline,
    baseline_digest:fileDigest(values.baseline,root), acceptance_ids:ids,
    status:'running', slices:[], blockers:[], next_work_unit:'work-unit.discovery-requirements'
  };
  validateJsonSchema(state, path.join(root,'docs/process/schemas/lifecycle-checkpoint-v2.schema.json'), {label:'checkpoint 初始化'});
  const errors = validateAcceptanceCheckpoint(state, {digest: ref => fileDigest(ref,root)});
  if (errors.length) throw Error(errors.join('\n'));
  mkdirSync(path.dirname(target), {recursive:true});
  writeFileSync(target, JSON.stringify(state,null,2)+'\n', {flag:'wx'});
  console.log(JSON.stringify({checkpoint_ref:values.output,status:state.status,next_action:'orchestrate',note:'初始化通过；实现仍需适用规范与 validated 切片合同'}));
} catch(error) {
  console.error(error.code === 'EEXIST' ? 'checkpoint 已存在；保留原记录，按 schema 修复，不用初始化覆盖进度或证据' : error.message);
  process.exitCode = 1;
}
