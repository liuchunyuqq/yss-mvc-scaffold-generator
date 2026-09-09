#!/usr/bin/env node
import path from 'node:path';
import {parseArgs} from 'node:util';
import {readProjectDocument} from './lib/development-gate.mjs';
import {validateVerificationPlan} from './lib/verification-plan.mjs';
import {runCheck} from './lib/execution-evidence.mjs';
try {
  const {values}=parseArgs({options:{'project-root':{type:'string',default:'.'},contract:{type:'string'},check:{type:'string'}}});
  const root=path.resolve(values['project-root']);
  const contract=readProjectDocument(root,values.contract);
  const errors=validateVerificationPlan(contract);
  if(errors.length) throw Error(errors.join('\n'));
  const check=contract.verification_plan.find(c=>c.id===values.check);
  if(!check) throw Error('未知检查 ID');
  const result=runCheck(root,contract,check);
  console.log(JSON.stringify({evidence_ref:result.evidence_ref,check_id:result.check_id,key:result.key,command:result.command,environment:result.environment,exit_code:result.exit_code},null,2));
  process.exitCode=result.exit_code===0&&result.inputs_unchanged?0:1;
} catch(error) {console.error(error.message);process.exitCode=1;}
