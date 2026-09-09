#!/usr/bin/env node
import path from 'node:path';
import {parseArgs} from 'node:util';
import {readProjectDocument} from './lib/development-gate.mjs';
import {checkMvcStructure} from './lib/mvc-structure.mjs';
try {
  const {values}=parseArgs({options:{'project-root':{type:'string',default:'.'},contract:{type:'string'}}});
  const root=path.resolve(values['project-root']);
  const contract=readProjectDocument(root,values.contract);
  if(!contract.mvc_structure?.production_types?.length) throw Error('必须登记 mvc_structure.production_types');
  const errors=checkMvcStructure(root,contract.mvc_structure);
  if(errors.length) throw Error(errors.join('\n'));
  console.log('MVC AST 结构检查通过；不代表 SQL、Bean 装配或真实 HTTP 已验证');
}catch(error){console.error(error.message);process.exitCode=1;}
