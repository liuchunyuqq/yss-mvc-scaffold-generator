#!/usr/bin/env node
import path from 'node:path';
import {parseArgs} from 'node:util';
import {readProjectDocument} from './lib/development-gate.mjs';
import {checkMvcStructure, parseJavaProject} from './lib/mvc-structure.mjs';
import {loadPackageLayout, checkPackageLayout, validateLayoutPlan} from './lib/mvc-package-layout.mjs';
import {changedSinceBaseline} from './lib/execution-evidence.mjs';
try {
  const {values}=parseArgs({options:{'project-root':{type:'string',default:'.'},contract:{type:'string'}, 'audit-all':{type:'boolean'}, 'policy-root':{type:'string'}, 'plan-only':{type:'boolean'}, 'historical':{type:'boolean'}}});
  const root=path.resolve(values['project-root']);
  if (values['policy-root'] && !values['audit-all']) throw Error('外部规则源仅用于只读全量审计');
  const contract=values.contract ? readProjectDocument(root,values.contract) : {};
  const policy=loadPackageLayout(root, values['policy-root'] ? path.resolve(values['policy-root']) : root);
  if (values.historical) {
    if (!values.contract || values['audit-all']) throw Error('历史解析需要单独合同');
    const result = validateLayoutPlan(root, contract, policy, {historical:true});
    console.log(JSON.stringify(result));
    if(result.errors.length) process.exitCode=1;
  } else {
  if (!values['audit-all'] && !values.contract) throw Error('当前门禁需要 --contract；全量只读审计使用 --audit-all');
  const scope = contract.mvc_structure?.baseline_snapshot_ref && !values['audit-all'] && !values['plan-only']
    ? changedSinceBaseline(root, contract.mvc_structure.baseline_snapshot_ref, contract.mvc_structure.baseline_exclusions ?? []) : undefined;
  const errors=values['plan-only'] ? validateLayoutPlan(root,contract,policy).errors : values['audit-all']
    ? checkPackageLayout(root,parseJavaProject(root),contract,{policy,audit:true})
    : checkMvcStructure(root,contract.mvc_structure ?? {},undefined,{contract,policy,files:scope});
  if(errors.length) throw Error(errors.join('\n'));
  console.log('MVC AST 结构检查通过；不代表 SQL、Bean 装配或真实 HTTP 已验证');
  }
}catch(error){console.error(error.message);process.exitCode=1;}
