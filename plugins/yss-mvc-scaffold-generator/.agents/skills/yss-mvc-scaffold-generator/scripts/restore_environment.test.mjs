import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildEnvironment, verifyEnvironment, ensureMvcEnvironment } from './lib/mvc-environment.mjs';
const script=fileURLToPath(new URL('./restore_environment.mjs',import.meta.url));
const run=(root,flags=[])=>spawnSync(process.execPath,[script,'--project-root',root,...flags],{encoding:'utf8'});
async function fixture(t) {
  const base=await mkdtemp(path.join(os.tmpdir(),'mvc-restore-'));t.after(()=>rm(base,{recursive:true,force:true}));
  const root=path.join(base,'project');await mkdir(path.join(root,'docs/process'),{recursive:true});
  await writeFile(path.join(root,'yss-project.yaml'),'schema_version: 1\nrepository_mode: project-instance\ngovernance_profile: docs/process/mvc.yaml\n');
  await writeFile(path.join(root,'docs/process/mvc.yaml'),'profile_id: yss.mvc.backend\narchitecture_style: mvc\nruntime_scope: backend-only\n');
  await writeFile(path.join(root,'skills-lock.json'),JSON.stringify({version:1,distribution:{mode:'sibling-directory',skillUtilsDir:'../skillUtils',compatibility:'skill-utils-v1',requiredToolVersion:'1.0.0'}}));
  await writeFile(path.join(root,'business.txt'),'保留用户代码与 Spec\n');
  return {base,root,target:path.join(base,'skillUtils')};
}
test('克隆恢复、幂等检查、MVC 有效技能与生成一致且业务文件不变',async t=>{
  const {base,root,target}=await fixture(t);
  const dry=run(root,['--dry-run']);assert.equal(dry.status,0,dry.stderr);assert.equal(JSON.parse(dry.stdout).action,'install');assert.deepEqual((await readdir(base)).sort(),['project']);
  const first=run(root);assert.equal(first.status,0,first.stderr);
  const state=await verifyEnvironment(target);
  const again=run(root);assert.equal(again.status,0,again.stderr);assert.equal(JSON.parse(again.stdout).action,'reuse');
  const check=run(root,['--check']);assert.equal(check.status,0,check.stderr);
  const alternate=path.join(base,'expected');await buildEnvironment(alternate);assert.equal((await verifyEnvironment(alternate)).digest,state.digest);
  assert.equal(await readFile(path.join(root,'business.txt'),'utf8'),'保留用户代码与 Spec\n');
  assert.deepEqual((await readdir(root)).sort(),['business.txt','docs','skills-lock.json','yss-project.yaml']);
  const names=await readdir(path.join(target,'.agents/skills'));assert(!names.includes('yss-domain'));assert(!names.includes('yss-ui'));assert(!names.includes('yss-components'));assert(!names.includes('yss-mvc-scaffold-generator'));
  for(const name of ['yss-application','yss-repository','yss-web-controller','yss-mybatis']) {
    const body=await readFile(path.join(target,'.agents/skills',name,'SKILL.md'),'utf8');assert.match(body,/MVC/);assert.doesNotMatch(body,/旧架构对本脚手架链路为 `unsupported`/);
    assert.equal(body,await readFile(path.join(target,'.codex/skills',name,'SKILL.md'),'utf8'));
  }
});
test('本地漂移与未受管目录不会被覆盖',async t=>{
  const {root,target}=await fixture(t);await mkdir(target);await writeFile(path.join(target,'keep'),'keep');
  assert.match(run(root).stderr,/UNMANAGED_DIRECTORY/);assert.equal(await readFile(path.join(target,'keep'),'utf8'),'keep');
  await rm(target,{recursive:true});assert.equal(run(root).status,0);
  await writeFile(path.join(target,'.codex/skills/yss-application/SKILL.md'),'local edit');
  const result=run(root,['--upgrade']);assert.notEqual(result.status,0);assert.match(result.stderr,/CONTENT_DRIFT/);
});
test('拒绝 DDD 身份、未知参数和不兼容锁',async t=>{
  const {root}=await fixture(t);assert.notEqual(run(root,['--force']).status,0);
  await writeFile(path.join(root,'docs/process/mvc.yaml'),'profile_id: yss.ddd\narchitecture_style: ddd\nruntime_scope: backend-only\n');
  assert.match(run(root).stderr,/UNSUPPORTED_PROFILE/);
});
test('首次安装失败不留下最终目录',async t=>{
  const {root,base}=await fixture(t);
  const result=spawnSync(process.execPath,[script,'--project-root',root],{encoding:'utf8',env:{...process.env,NODE_ENV:'test',YSS_MVC_FAIL_BEFORE_INSTALL:'1'}});
  assert.notEqual(result.status,0);assert.match(result.stderr,/INJECTED_INSTALL_FAILURE/);
  assert.deepEqual((await readdir(base)).sort(),['project']);
});


test('受管旧发行版本仅显式更新，更新失败恢复原版本',async t=>{
  const {base,root,target}=await fixture(t);assert.equal(run(root).status,0);
  const {createHash}=await import('node:crypto');const hash=v=>createHash('sha256').update(v).digest('hex');
  // Model an internally consistent previous release, not unrecorded user edits.
  const oldMetadata=(await readFile(path.join(target,'skill-utils.yaml'),'utf8')).replace('environment_version: 1.0.0','environment_version: 0.9.0');
  await writeFile(path.join(target,'skill-utils.yaml'),oldMetadata);
  const state=JSON.parse(await readFile(path.join(target,'mvc-environment-state.json'),'utf8'));
  state.files['skill-utils.yaml']=hash(oldMetadata);state.digest=hash(JSON.stringify(state.files));
  await writeFile(path.join(target,'mvc-environment-state.json'),JSON.stringify(state));
  await verifyEnvironment(target);
  assert.match(run(root).stderr,/VERSION_MISMATCH/);
  const dry=run(root,['--dry-run']);assert.equal(dry.status,0,dry.stderr);assert.equal(JSON.parse(dry.stdout).action,'upgrade');
  const failed=spawnSync(process.execPath,[script,'--project-root',root,'--upgrade'],{encoding:'utf8',env:{...process.env,NODE_ENV:'test',YSS_MVC_FAIL_BEFORE_INSTALL:'1'}});
  assert.match(failed.stderr,/INJECTED_INSTALL_FAILURE/);assert.equal((await verifyEnvironment(target)).digest,state.digest);
  const updated=run(root,['--upgrade']);assert.equal(updated.status,0,updated.stderr);
  const backup=JSON.parse(updated.stdout).backup;assert(backup.startsWith(base));assert.equal((await verifyEnvironment(backup)).digest,state.digest);
  assert.notEqual((await verifyEnvironment(target)).digest,state.digest);
});

test('MVC 有效 Registry 中能力与依赖不引用排除技能',async t=>{
  const {root,target}=await fixture(t);assert.equal(run(root).status,0);
  const body=await readFile(path.join(target,'mvc-skill-registry.yaml'),'utf8');
  assert.match(body,/backend.mvc-use-case/);assert.match(body,/yss-router/);assert.doesNotMatch(body,/primary_skill: yss-domain|primary_skill: yss-ui|id: backend.domain-behavior/);
  const compiler=await readFile(path.join(target,'.agents/skills/yss-implementation-contract-compiler/references/compiler-contract.yaml'),'utf8');
  assert.match(compiler,/capability_source: ..\/skillUtils\/mvc-skill-registry.yaml/);
});


test('早期 MVC 生成清单可恢复，无来源证据不推断身份',async t=>{
  const {root,target}=await fixture(t);
  const identity='schema_version: 1\nrepository_mode: project-instance\n';
  await writeFile(path.join(root,'yss-project.yaml'),identity);
  assert.match(run(root).stderr,/MIGRATION_REQUIRED/);
  await mkdir(path.join(root,'.yss'));
  const file=path.join(root,'.yss/scaffold-generation.json');
  const manifest={schema_version:1,skill:'yss-mvc-scaffold-generator',project_instance:true,backend_root:'.',modules:['server','core','client','repository','adapter','feign-client']};
  await writeFile(file,JSON.stringify(manifest));
  const result=run(root);assert.equal(result.status,0,result.stderr);
  assert.equal(await readFile(path.join(root,'yss-project.yaml'),'utf8'),identity);
  assert.match(await readFile(path.join(target,'mvc-governance-profile.yaml'),'utf8'),/architecture_style: mvc/);
  manifest.skill='yss-ddd-scaffold-generator';await writeFile(file,JSON.stringify(manifest));
  assert.match(run(root,['--check']).stderr,/MIGRATION_REQUIRED/);
});
