import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {migrateGovernance,recordGovernance,GOVERNANCE_FILES} from './lib/governance-migration.mjs';
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'mvc-governance-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'.yss'));await writeFile(path.join(root,'yss-project.yaml'),'schema_version: 1\nrepository_mode: project-instance\n');await writeFile(path.join(root,'.yss/scaffold-generation.json'),JSON.stringify({schema_version:1,skill:'yss-mvc-scaffold-generator',backend_root:'.'}));await writeFile(path.join(root,'skills-lock.json'),JSON.stringify({custom:'keep',distribution:{mode:'sibling-directory',compatibility:'skill-utils-v1',requiredToolVersion:'1.0.0'}}));return root;}
test('预览不写入；应用仅白名单文件并备份旧内容；再次运行幂等',async t=>{const root=await fixture(t);const before=await readdir(root);const plan=await migrateGovernance(root);assert.equal(plan.conflicts.length,0);assert.deepEqual(await readdir(root),before);assert(plan.changes.every(x=>GOVERNANCE_FILES.includes(x)));const done=await migrateGovernance(root,{apply:true});assert(done.backup);const lock=JSON.parse(await readFile(path.join(root,'skills-lock.json'),'utf8'));assert.equal(lock.custom,'keep');assert.equal(lock.distribution.requiredToolVersion,'1.1.0');assert.equal((await migrateGovernance(root,{apply:true})).changes.length,0);});
test('定制冲突拒绝整个应用且保留代码；受管旧文件可迁移',async t=>{const root=await fixture(t);await writeFile(path.join(root,'AGENTS.md'),'custom instructions');await writeFile(path.join(root,'business.java'),'user code');const plan=await migrateGovernance(root,{apply:true});assert(plan.conflicts.includes('AGENTS.md'));assert.equal(await readFile(path.join(root,'AGENTS.md'),'utf8'),'custom instructions');assert.equal(await readFile(path.join(root,'business.java'),'utf8'),'user code');await recordGovernance(root);const done=await migrateGovernance(root,{apply:true});assert.equal(done.conflicts.length,0);assert.equal(await readFile(path.join(root,done.backup,'AGENTS.md'),'utf8'),'custom instructions');});

test('旧机器配置定点升级并保留自定义项，非默认 Profile 指针拒绝应用',async t=>{
 const root=await fixture(t);await mkdir(path.join(root,'docs/process'),{recursive:true});
 await writeFile(path.join(root,'docs/process/analysis-project.yaml'),'project_name: custom\nworkflow: [requirement-and-data-contract, specification-freeze, single-release-confirmation, custom-step]\n');
 await writeFile(path.join(root,'docs/process/implementation-repo-registry.yaml'),'projects:\n  - project_name: custom\n    verification_commands: [custom-check, mvnw validate, mvnw test, mvnw package, custom-final]\n');
 const result=await migrateGovernance(root,{apply:true});assert.equal(result.conflicts.length,0);
 const identity=await readFile(path.join(root,'yss-project.yaml'),'utf8');assert.match(identity,/governance_profile: docs\/process\/mvc-governance-profile.yaml/);
 const workflow=await readFile(path.join(root,'docs/process/analysis-project.yaml'),'utf8');assert.match(workflow,/overall-review-and-acceptance/);assert.match(workflow,/custom-step/);assert.doesNotMatch(workflow,/single-release-confirmation/);
 const registry=await readFile(path.join(root,'docs/process/implementation-repo-registry.yaml'),'utf8');assert.match(registry,/mvnw package/);assert.match(registry,/custom-check/);assert.match(registry,/custom-final/);assert.doesNotMatch(registry,/mvnw validate|mvnw test/);
 await writeFile(path.join(root,'yss-project.yaml'),identity.replace('docs/process/mvc-governance-profile.yaml','custom-profile.yaml'));
 const before=await readFile(path.join(root,'yss-project.yaml'),'utf8');assert((await migrateGovernance(root,{apply:true})).conflicts.includes('yss-project.yaml'));assert.equal(await readFile(path.join(root,'yss-project.yaml'),'utf8'),before);
});
