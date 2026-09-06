import {mkdtemp,cp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const base=await mkdtemp(path.join(os.tmpdir(),'mvc-isolated-plugin-'));
if(!process.argv[2])throw new Error('Usage: verify_plugin_integration.mjs <plugin-root>');
const source=path.resolve(process.argv[2]);
const plugin=path.join(base,'plugins/yss-mvc-scaffold-generator');
function run(exe,args,ok=true){const r=spawnSync(exe,args,{encoding:'utf8',env:{...process.env,GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'user.name',GIT_CONFIG_VALUE_0:'MVC Fixture',GIT_CONFIG_KEY_1:'user.email',GIT_CONFIG_VALUE_1:'mvc-fixture@example.invalid'}});if(ok)assert.equal(r.status,0,r.stderr||r.error?.message);return r;}
try {
 await cp(source,plugin,{recursive:true});
 const scripts=path.join(plugin,'skills/yss-mvc-scaffold-generator/scripts');
 const origin=path.join(base,'work1/project');await mkdir(path.dirname(origin),{recursive:true});
 run(process.execPath,[path.join(scripts,'generate_project.mjs'),'--project-name','mvc-isolated','--base-package','com.yss.fixture','--target-dir',origin,'--with-mock']);
 run(process.execPath,[path.join(scripts,'verify_project.mjs'),'--project-root',origin]);
 run('git',['-C',origin,'add','.']);
 run('git',['-C',origin,'commit','-m','test fixture']);
 const clone=path.join(base,'work2/project');await mkdir(path.dirname(clone),{recursive:true});run('git',['clone',origin,clone]);
 assert.equal(run('git',['-C',clone,'status','--porcelain']).stdout,'');
 const restored=run(process.execPath,[path.join(scripts,'restore_environment.mjs'),'--project-root',clone]);
 assert.equal(JSON.parse(restored.stdout).status,'FILES_READY');
 run(process.execPath,[path.join(scripts,'restore_environment.mjs'),'--project-root',clone,'--check']);
 assert.equal(run('git',['-C',clone,'status','--porcelain']).stdout,'');
 const originalState=JSON.parse(await readFile(path.join(base,'work1/skillUtils/mvc-environment-state.json'),'utf8'));
 const restoredState=JSON.parse(await readFile(path.join(base,'work2/skillUtils/mvc-environment-state.json'),'utf8'));
 assert.equal(restoredState.digest,originalState.digest);
 const names=await readdir(path.join(base,'work2/skillUtils/.agents/skills'));assert.equal(names.length,38);
 const entry=path.join(plugin,'skills/yss-mvc-scaffold-generator/SKILL.md');await writeFile(entry,(await readFile(entry,'utf8'))+'\nfixture drift\n');
 const drift=run(process.execPath,[path.join(plugin,'.agents/skills/yss-mvc-scaffold-generator/scripts/export_plugin.mjs'),'--target',plugin,'--check'],false);
 assert.notEqual(drift.status,0);assert.match(drift.stderr,/SYNC_DRIFT/);
 console.log(JSON.stringify({isolated_plugin:'pass',real_git_clone_restore:'pass',project_git_clean:'pass',environment_digest_equal:'pass',mvc_skills:names.length,sync_negative:'pass',agent_discovery:'not-verified'}));
}finally{await rm(base,{recursive:true,force:true});}
