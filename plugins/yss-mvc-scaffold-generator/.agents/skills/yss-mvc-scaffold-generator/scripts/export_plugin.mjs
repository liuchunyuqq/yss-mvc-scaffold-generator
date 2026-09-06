#!/usr/bin/env node
import {cp,mkdir,mkdtemp,readFile,writeFile,readdir,rm,lstat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {HARNESS_ROOT,SKILL_ROOT} from './lib/runtime.mjs';
import {manifest} from './lib/mvc-environment.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
async function inventory(root,prefix='') {
  let all={};for(const e of (await readdir(path.join(root,prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const rel=prefix?`${prefix}/${e.name}`:e.name;
    if(e.isSymbolicLink())throw new Error(`UNSAFE_LINK: ${rel}`);
    if(e.isDirectory())Object.assign(all,await inventory(root,rel));
    else all[rel]=digest(await readFile(path.join(root,rel)));
  }return all;
}
try {
  const args=process.argv.slice(2);const i=args.indexOf('--target');
  if(i<0||!args[i+1]||args.some((x,j)=>j!==i+1&&!['--target','--check'].includes(x)))throw new Error('Usage: export_plugin.mjs --target <plugin-root> [--check]');
  const target=path.resolve(args[i+1]);const check=args.includes('--check');
  if(!target.includes(`${path.sep}plugins${path.sep}`)||path.basename(target)!=='yss-mvc-scaffold-generator')throw new Error('UNSAFE_PLUGIN_TARGET');
  const targetInfo=await lstat(target);if(!targetInfo.isDirectory()||targetInfo.isSymbolicLink())throw new Error('UNSAFE_PLUGIN_TARGET');
  const inputs=JSON.parse(await readFile(path.join(SKILL_ROOT,'references/plugin-inputs.json'),'utf8'));
  const m=await manifest();const staging=await mkdtemp(path.join(os.tmpdir(),'mvc-export-'));
  try {
    const roots=[...inputs.files,...inputs.directories,...inputs.script_files.map(x=>`scripts/${x}`),...inputs.generation_assets,...m.shared_skills.map(x=>`.agents/skills/${x}`),'.agents/skills/yss-mvc-scaffold-generator'];
    for(const rel of roots) {
      if(path.isAbsolute(rel)||rel.split('/').includes('..'))throw new Error('UNSAFE_SOURCE_PATH');
      await cp(path.join(HARNESS_ROOT,rel),path.join(staging,rel),{recursive:true,dereference:true,filter:p=>!p.includes('__pycache__')});
    }
    await cp(SKILL_ROOT,path.join(staging,'skills/yss-mvc-scaffold-generator'),{recursive:true});
    const expected=await inventory(staging);
    const previous=JSON.parse(await readFile(path.join(target,'mvc-source-manifest.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return '{"files":{}}';throw e;}));
    const actual=await inventory(target);
    const managedRoots=['.agents/skills/','skills/','.claude/skills/','.codex/skills/','.cursor/skills/','.hermes/skills/','.pi/skills/','.qoder/skills/','.trae/skills/'];
    const old=Object.keys(actual).filter(x=>managedRoots.some(r=>x.startsWith(r))||x in previous.files);
    const obsolete=old.filter(x=>!(x in expected));
    const changed=Object.keys(expected).filter(x=>actual[x]!==expected[x]);
    if(check) {if(changed.length||obsolete.length)throw new Error(`SYNC_DRIFT: changed=${changed.join(',')} obsolete=${obsolete.join(',')}`);console.log(`MVC source sync verified: ${Object.keys(expected).length} files`);}
    else {
      // Refuse edits to previously managed content before replacing it.
      const local=Object.keys(previous.files).filter(x=>actual[x]&&actual[x]!==previous.files[x]&&actual[x]!==expected[x]);
      if(local.length)throw new Error(`LOCAL_PLUGIN_DRIFT: ${local.join(',')}`);
      for(const rel of obsolete) {const file=path.resolve(target,rel);if(!file.startsWith(target+path.sep))throw new Error('UNSAFE_DELETE');await rm(file);}
      // Remove empty retired skill directories so they cannot look discoverable.
      // fs.rmdir is used for known empty directories; no recursive computed delete.
      const {rmdir}=await import('node:fs/promises');
      async function pruneEmpty(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(e.isDirectory()){const child=path.join(dir,e.name);await pruneEmpty(child);if(!(await readdir(child)).length)await rmdir(child);}}}
      for(const r of managedRoots){const dir=path.join(target,r);if(await lstat(dir).catch(()=>null))await pruneEmpty(dir);}
      for(const rel of changed){await mkdir(path.dirname(path.join(target,rel)),{recursive:true});await cp(path.join(staging,rel),path.join(target,rel));}
      const revision=spawnSync('git',['-c',`safe.directory=${HARNESS_ROOT.replaceAll('\\','/')}`,'-C',HARNESS_ROOT,'rev-parse','HEAD'],{encoding:'utf8'});
      if(revision.status!==0)throw new Error(revision.stderr);
      await writeFile(path.join(target,'mvc-source-manifest.json'),JSON.stringify({schema_version:1,profile_id:m.profile_id,source_commit:revision.stdout.trim(),content_digest:digest(JSON.stringify(expected)),files:expected},null,2)+'\n');
      console.log(`MVC source sync: ${changed.length} updated, ${obsolete.length} retired`);
    }
  }finally{await rm(staging,{recursive:true,force:true});}
}catch(e){console.error(e.message);process.exitCode=1;}
