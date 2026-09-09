import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { HARNESS_ROOT, SKILL_ROOT } from './runtime.mjs';
const { parseDocument } = await import(pathToFileURL(path.join(HARNESS_ROOT,'scripts/vendor/yaml.mjs')).href);
const yaml = source => {const d=parseDocument(source,{uniqueKeys:true});if(d.errors.length)throw Error(d.errors[0].message);return d;};
const hash=b=>createHash('sha256').update(b).digest('hex');
// Deliberately fixed, reviewable allowlist: never scan or replace dependency directories.
export const GOVERNANCE_FILES = ['AGENTS.md','yss-project.yaml','docs/process/analysis-project.yaml','docs/process/implementation-repo-registry.yaml','skills-lock.json','docs/process/acceptance-policy.yaml','docs/process/acceptance-driven-development.md','docs/process/mvc-governance-profile.yaml','docs/process/schemas/lifecycle-checkpoint-v2.schema.json','docs/process/templates/acceptance-checkpoint-template.yaml','scripts/verify-lifecycle-checkpoint','scripts/verify-mvc-governance-profile.mjs','scripts/acceptance-action.mjs','scripts/lib/acceptance-policy.mjs','scripts/lib/lifecycle-transition.mjs','scripts/lib/implementation-contract-compiler.mjs','docs/process/applicable-standards.yaml','docs/process/implementation-standards-context.md','scripts/applicable-standards.mjs','scripts/lib/applicable-standards.mjs'];
GOVERNANCE_FILES.push('docs/process/development-gate.md','scripts/verify-development.mjs','scripts/verify-java-web.mjs','scripts/run-governance-check.mjs','scripts/verify-mvc-structure.mjs','scripts/capture-governance-baseline.mjs','scripts/inspect-dto-dependency.mjs','scripts/lib/development-gate.mjs','scripts/lib/contract-integrity.mjs','scripts/lib/verification-plan.mjs','scripts/lib/execution-evidence.mjs','scripts/lib/java-web-style.mjs','scripts/lib/mvc-structure.mjs','scripts/lib/java/MvcAst.java');
async function safeFile(root,rel){
 const target=path.resolve(root,rel);if(!target.startsWith(root+path.sep))throw Error('UNSAFE_PATH');
 let current=root;for(const part of rel.split('/')){current=path.join(current,part);const info=await lstat(current).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(info?.isSymbolicLink())throw Error('UNSAFE_LINK: '+rel);}return target;
}
export async function recordGovernance(root){
 const files={};for(const rel of GOVERNANCE_FILES){try{files[rel]=hash(await readFile(path.join(root,rel)));}catch(e){if(e.code!=='ENOENT')throw e;}}
 await mkdir(path.join(root,'.yss'),{recursive:true});await writeFile(path.join(root,'.yss/governance-files.json'),JSON.stringify({schema_version:1,rule_version:'governance-integrity-v1',migration_version:2,files},null,2)+'\n');
}
export async function migrateGovernance(projectRoot,{apply=false,baselineDir}={}){
 const root=path.resolve(projectRoot);if((await lstat(root)).isSymbolicLink())throw Error('UNSAFE_PROJECT_ROOT');
 const identity=await readFile(await safeFile(root,'yss-project.yaml'),'utf8');
 const generated=JSON.parse(await readFile(await safeFile(root,'.yss/scaffold-generation.json'),'utf8'));
 const identityData=yaml(identity).toJS();
 if(identityData.schema_version!==1||identityData.repository_mode!=='project-instance'||generated.schema_version!==1||generated.skill!=='yss-mvc-scaffold-generator'||generated.backend_root!=='.')throw Error('MVC_PROJECT_IDENTITY_REQUIRED');
 const managedPath=await safeFile(root,'.yss/governance-files.json');
 const managed=JSON.parse(await readFile(managedPath,'utf8').catch(e=>{if(e.code==='ENOENT')return '{"files":{}}';throw e;}));
 const changes=[],conflicts=[];
 const defaultProfile='docs/process/mvc-governance-profile.yaml';
 if(identityData.governance_profile!==undefined&&identityData.governance_profile!==defaultProfile)conflicts.push('yss-project.yaml');
 for(const rel of GOVERNANCE_FILES){
  const target=await safeFile(root,rel);
  const source=rel==='AGENTS.md'?path.join(SKILL_ROOT,'assets/project-agents.md'):path.join(HARNESS_ROOT,rel);
  const structured=['skills-lock.json','yss-project.yaml','docs/process/analysis-project.yaml','docs/process/implementation-repo-registry.yaml'].includes(rel);
  let content=structured?null:await readFile(source);const old=await readFile(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(structured&&rel!=='skills-lock.json'){
   if(!old){if(rel==='yss-project.yaml')throw Error('IDENTITY_REQUIRED');continue;}
   const doc=yaml(old.toString('utf8'));let changed=false;
   if(rel==='yss-project.yaml'&&identityData.governance_profile===undefined){doc.set('governance_profile',defaultProfile);changed=true;}
   if(rel==='docs/process/analysis-project.yaml'){
    const workflow=doc.get('workflow',true);
    if(workflow?.items)for(const item of workflow.items){if(item.value==='specification-freeze'){item.value='acceptance-criteria';changed=true;}if(item.value==='single-release-confirmation'){item.value='overall-review-and-acceptance';changed=true;}}
   }
   if(rel==='docs/process/implementation-repo-registry.yaml'){
    const projects=doc.get('projects',true);
    if(projects?.items)for(const project of projects.items){
     const commands=project.get('verification_commands',true);
     if(commands?.items){const values=commands.items.map(x=>x.value);const known=['mvnw validate','mvnw test','mvnw package'];
      // Only replace the exact old generated contiguous triple; custom commands remain untouched.
      const i=values.findIndex((x,j)=>known.every((v,k)=>values[j+k]===v));
      if(i>=0){commands.items.splice(i,2);changed=true;}
     }
    }
   }
   if(changed)changes.push({rel,target,content:Buffer.from(doc.toString()),old});
   continue;
  }
  if(rel==='skills-lock.json'){

   if(!old)throw Error('PROJECT_LOCK_REQUIRED');
   const lock=JSON.parse(old);if(lock.distribution?.mode!=='sibling-directory'||lock.distribution.compatibility!=='skill-utils-v1'||!['1.0.0','1.1.0'].includes(lock.distribution.requiredToolVersion))throw Error('INCOMPATIBLE_PROJECT_LOCK');
   if(lock.distribution.requiredToolVersion==='1.1.0')continue;
   lock.distribution.requiredToolVersion='1.1.0';content=Buffer.from(JSON.stringify(lock,null,2)+'\n');
   changes.push({rel,target,content,old});continue;
  }
  if(old&&hash(old)===hash(content))continue;
  let expected=managed.files[rel];
  if(!expected&&baselineDir){const previous=await readFile(path.join(path.resolve(baselineDir),rel)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(previous)expected=hash(previous);}
  if(old&&hash(old)!==expected)conflicts.push(rel);
  changes.push({rel,target,content,old});
 }
 const plan={mode:apply?'apply':'dry-run',changes:changes.map(x=>x.rel),conflicts};
 if(!apply||conflicts.length||!changes.length)return plan;
 const backupRel='.yss/governance-backup-'+Date.now();const backup=await safeFile(root,backupRel);await mkdir(backup,{recursive:false});
 for(const c of changes){if(c.old){const dest=path.join(backup,c.rel);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,c.old);}}
 await writeFile(path.join(backup,'migration.json'),JSON.stringify({created:changes.filter(x=>!x.old).map(x=>x.rel),changed:changes.map(x=>x.rel)},null,2));
 for(const c of changes){const now=await readFile(c.target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if((now&&hash(now))!==(c.old&&hash(c.old)))throw Error('CONCURRENT_CHANGE: '+c.rel);}
 for(const c of changes){await mkdir(path.dirname(c.target),{recursive:true});await writeFile(c.target,c.content);}
 await recordGovernance(root);return {...plan,backup:backupRel};
}
