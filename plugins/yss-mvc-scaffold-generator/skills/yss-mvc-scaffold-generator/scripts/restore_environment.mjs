#!/usr/bin/env node
import { assertMvcProject, ensureMvcEnvironment } from './lib/mvc-environment.mjs';
try {
  const args=process.argv.slice(2); let root; const flags=new Set();
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--project-root'&&!root&&args[i+1]&&!args[i+1].startsWith('--'))root=args[++i];
    else if(['--dry-run','--check','--upgrade'].includes(args[i])&&!flags.has(args[i]))flags.add(args[i]);
    else throw new Error(`Unsupported argument: ${args[i]}`);
  }
  if(!root||flags.has('--check')&&flags.has('--upgrade'))throw new Error('Usage: restore_environment.mjs --project-root <MVC project> [--dry-run | --check | --upgrade]');
  root=await assertMvcProject(root);
  const result=await ensureMvcEnvironment(root,{apply:!flags.has('--dry-run'),check:flags.has('--check'),upgrade:flags.has('--upgrade')});
  console.log(JSON.stringify({status:flags.has('--dry-run')?'PLANNED':'FILES_READY',...result,agent_discovery:'not-verified'},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
