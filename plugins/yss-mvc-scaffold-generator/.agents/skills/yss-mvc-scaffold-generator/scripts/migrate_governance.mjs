#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { migrateGovernance } from './lib/governance-migration.mjs';
try {
 const {values}=parseArgs({options:{'project-root':{type:'string'},'baseline-dir':{type:'string'},'dry-run':{type:'boolean'},apply:{type:'boolean'}},strict:true});
 if(!values['project-root']||(values.apply&&values['dry-run']))throw Error('用法: --project-root <目录> [--dry-run | --apply] [--baseline-dir <旧发行基线目录>]');
 const result=await migrateGovernance(values['project-root'],{apply:values.apply,baselineDir:values['baseline-dir']});
 console.log(JSON.stringify(result,null,2));if(result.conflicts.length)process.exitCode=2;
}catch(error){console.error(error.message);process.exitCode=1;}
