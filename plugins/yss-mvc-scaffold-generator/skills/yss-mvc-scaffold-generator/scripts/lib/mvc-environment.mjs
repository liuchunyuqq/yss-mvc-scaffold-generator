import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, lstat, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HARNESS_ROOT, SKILL_ROOT, exists } from './runtime.mjs';
const manifestPath = path.join(SKILL_ROOT, 'references/mvc-environment-manifest.json');
const hash = (value) => createHash('sha256').update(value).digest('hex');
export async function manifest() { return JSON.parse(await readFile(manifestPath, 'utf8')); }
async function files(root, prefix = '') {
  const out = {};
  for (const e of (await readdir(path.join(root, prefix), { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isSymbolicLink()) throw new Error(`UNSAFE_LINK: ${rel}`);
    if (e.isDirectory()) Object.assign(out, await files(root, rel));
    else if (e.isFile()) out[rel] = hash(await readFile(path.join(root, rel)));
  }
  return out;
}
async function treeHash(root) {
  const { treeHash } = await import(pathToFileURL(path.join(HARNESS_ROOT, 'scripts/lib/skill-supply-chain.mjs')).href);
  return treeHash(root);
}
export async function buildEnvironment(destination) {
  const m = await manifest();
  const {parseDocument,stringify}=await import(pathToFileURL(path.join(HARNESS_ROOT,'scripts/vendor/yaml.mjs')).href);
  const profile=parseDocument(await readFile(path.join(HARNESS_ROOT,'docs/process/mvc-governance-profile.yaml'),'utf8')).toJS();
  const sourceLock = JSON.parse(await readFile(path.join(HARNESS_ROOT, 'skills-lock.json'), 'utf8'));
  const lock = {version: 1, projectionRoots:m.projection_roots, profile_id: m.profile_id, environment_version: m.environment_version, skills: { shared: {}, platform: {} }};
  const scope = await readFile(path.join(SKILL_ROOT, 'assets/mvc-runtime-scope.md'), 'utf8');
  const names = [...m.shared_skills, ...m.adapted_skills].sort();
  if (new Set(names).size !== names.length || names.some(n => m.excluded_skills.includes(n) || !/^[a-z0-9-]+$/.test(n))) throw new Error('INVALID_MANIFEST');
  for (const name of names) {
    const adapted = m.adapted_skills.includes(name);
    const source = path.join(adapted ? path.join(SKILL_ROOT,'assets/mvc-skills') : path.join(HARNESS_ROOT,'.agents/skills'), name);
    const target = path.join(destination,'.agents/skills',name);
    await cp(source,target,{recursive:true,dereference:true,filter: p=>!p.includes('__pycache__')});
    if (!adapted) {
      const entry = path.join(target,'SKILL.md');
      const body = await readFile(entry,'utf8');
      const front = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(body);
      if (!front) throw new Error(`INVALID_SKILL: ${name}`);
      await mkdir(path.join(target,'references'),{recursive:true});
      await writeFile(path.join(target,'references/mvc-runtime-scope.md'),scope);
      await writeFile(entry,body.replace(front[0], front[0]+'\n执行前先读取 [MVC 运行期路由](references/mvc-runtime-scope.md)，按项目 MVC Profile 判断以下通用规则的适用范围。\n'));
    }


    if (name==='yss-implementation-contract-compiler') {
      const contractPath=path.join(target,'references/compiler-contract.yaml');
      const contract=parseDocument(await readFile(contractPath,'utf8')).toJS();
      const sourceRegistry=parseDocument(await readFile(path.join(HARNESS_ROOT,'docs/agents/yss-skill-registry.yaml'),'utf8')).toJS();
      const allowed=new Set(sourceRegistry.capabilities.filter(c=>names.includes(c.primary_skill)).map(c=>c.id));
      contract.capability_source='../skillUtils/mvc-skill-registry.yaml';
      contract.recipe_source=contract.capability_source;
      contract.impact_to_capabilities=Object.fromEntries(Object.entries(contract.impact_to_capabilities).filter(([impact,cs])=>!['domain-impact','tactical-domain-impact'].includes(impact)&&cs.every(c=>allowed.has(c))));
      contract.impact_to_capabilities['mvc-use-case']=['layer.application'];
      await writeFile(contractPath,stringify(contract));
    }
    if (name==='yss-product-lifecycle') {
      const contractPath=path.join(target,'references/orchestration-contract.yaml');
      const contract=parseDocument(await readFile(contractPath,'utf8')).toJS();
      for(const [id,route] of Object.entries(contract.work_unit_routes)) {
        if(profile.lifecycle.not_applicable_work_units.includes(id)){delete contract.work_unit_routes[id];continue;}
        if(!names.includes(route.primary_skill))throw new Error(`MVC_ROUTE_MISSING: ${id}`);
        route.supporting_skills=route.supporting_skills.filter(n=>names.includes(n));
        route.skills=route.skills.filter(n=>names.includes(n));
        if(!route.skills.length)route.skills=[route.primary_skill];
        delete route.frontend_route;
        if(route.review_standards_route) {
          route.review_standards_route.conditional_skills=Object.fromEntries(Object.entries(route.review_standards_route.conditional_skills).map(([k,ns])=>[k,ns.filter(n=>names.includes(n))]).filter(([,ns])=>ns.length));
        }
      }
      await writeFile(contractPath,stringify(contract));
    }
    lock.skills.shared[name] = { source: 'yss-mvc-scaffold-generator', sourceHash: sourceLock.skills?.shared?.[name]?.effectiveHash ?? null, adaptation: adapted ? 'mvc-specialized' : 'mvc-scoped', effectiveHash: await treeHash(target) };
    for (const projection of m.projection_roots) await cp(target,path.join(destination,projection,name),{recursive:true});
  }


  const registry=parseDocument(await readFile(path.join(HARNESS_ROOT,'docs/agents/yss-skill-registry.yaml'),'utf8')).toJS();
  registry.skills=registry.skills.filter(x=>names.includes(x.id));
  for(const [alias,id] of Object.entries(m.legacy_aliases)) {const entry=registry.skills.find(x=>x.id===id);if(!entry)throw new Error('INVALID_LEGACY_ALIAS');entry.aliases=[...new Set([...entry.aliases,alias])];}
  registry.capabilities=[...registry.capabilities.filter(x=>names.includes(x.primary_skill)),...m.additional_capabilities];
  registry.platform_skills=[];
  const capabilities=new Set(registry.capabilities.map(x=>x.id));
  registry.recipes=registry.recipes.filter(x=>x.capabilities.every(c=>capabilities.has(c)));
  registry.recipes.push({id:'backend.mvc-use-case',capabilities:['layer.application','quality.java-code-style']});
  registry.skill_dependencies=Object.fromEntries(Object.entries(registry.skill_dependencies).filter(([n])=>names.includes(n)).map(([n,deps])=>[n,deps.filter(d=>names.includes(d.skill))]));
  registry.invocation_contract.overrides=Object.fromEntries(Object.entries(registry.invocation_contract.overrides??{}).filter(([n])=>names.includes(n)));
  registry.canonical_content_root='.agents/skills';
  await writeFile(path.join(destination,'mvc-skill-registry.yaml'),stringify(registry));
  await writeFile(path.join(destination,'mvc-governance-profile.yaml'),stringify(profile));
  const {validateSkillRegistry}=await import(pathToFileURL(path.join(HARNESS_ROOT,'scripts/lib/skill-registry.mjs')).href);
  const lifecycleContract=parseDocument(await readFile(path.join(destination,'.agents/skills/yss-product-lifecycle/references/orchestration-contract.yaml'),'utf8')).toJS();
  validateSkillRegistry(registry,{lock,lifecycleContract});

  await writeFile(path.join(destination,'skills-lock.json'),JSON.stringify(lock,null,2)+'\n');
  await writeFile(path.join(destination,'skill-utils.yaml'),`schema_version: 1\nkind: yss-skill-utils\nprofile_id: ${m.profile_id}\nenvironment_version: ${m.environment_version}\ntool_version: ${m.tool_version}\ncompatibility: ${m.compatibility}\ncanonical_root: .agents/skills\n`);
  await writeFile(path.join(destination,'yss-public-skills.json'),JSON.stringify({profile_id:m.profile_id,skills:names},null,2)+'\n');
  const inventory = await files(destination);
  await writeFile(path.join(destination,'mvc-environment-state.json'),JSON.stringify({schema_version:1,profile_id:m.profile_id,environment_version:m.environment_version,digest:hash(JSON.stringify(inventory)),files:inventory},null,2)+'\n');
  return lock;
}
export async function verifyEnvironment(root) {
  const state = JSON.parse(await readFile(path.join(root,'mvc-environment-state.json'),'utf8'));
  if (state.schema_version!==1 || state.profile_id!=='yss.mvc.backend' || !state.files || state.digest!==hash(JSON.stringify(state.files))) throw new Error('INVALID_ENVIRONMENT_STATE');
  const actual = await files(root); delete actual['mvc-environment-state.json'];
  const drift = [...new Set([...Object.keys(actual),...Object.keys(state.files)])].filter(p=>actual[p]!==state.files[p]);
  if (drift.length) throw new Error(`CONTENT_DRIFT: ${drift.join(', ')}`);
  return state;
}
export async function ensureMvcEnvironment(projectRoot,{apply=true,upgrade=false,check=false}={}) {
  const parent = path.dirname(path.resolve(projectRoot));
  const target = path.join(parent,'skillUtils');
  // Reject links before reading or renaming an existing shared installation.
  const info = await lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`UNSAFE_TARGET: ${target}`);
  if (info && !await exists(path.join(target,'skill-utils.yaml'))) throw new Error(`UNMANAGED_DIRECTORY: ${target}`);
  if (info && !await exists(path.join(target,'mvc-environment-state.json'))) throw new Error('MIGRATION_REQUIRED: legacy skillUtils has no MVC integrity baseline; preserve it and restore in a separate parent directory');
  const current = info ? await verifyEnvironment(target) : null;
  if (check && !current) throw new Error(`MISSING_ENVIRONMENT: ${target}`);
  // A sibling staging is also used for comparison; dry-run uses OS temp to avoid workspace writes.
  const { tmpdir } = await import('node:os');
  if (apply && !check) await mkdir(parent,{recursive:true});
  const staging = await mkdtemp(path.join(apply && !check ? parent : tmpdir(),'.mvc-environment-'));
  let backup=null;
  const lockDir=path.join(parent,'.skillUtils.mvc-install-lock');
  let locked=false;
  try {
    if(apply&&!check) {try {await mkdir(lockDir);locked=true;} catch(e) {if(e.code==='EEXIST')throw new Error('ENVIRONMENT_BUSY');throw e;} }

    await buildEnvironment(staging);
    const expected = await verifyEnvironment(staging);
    if(current && (await verifyEnvironment(target)).digest!==current.digest)throw new Error('CONCURRENT_CHANGE');
    const changed = current?.digest!==expected.digest;
    const plan = {path:target,created:!current,refreshed:!!current&&changed,backup:null,profile_id:expected.profile_id,digest:expected.digest,action:!current?'install':changed?'upgrade':'reuse'};
    if (current && changed && (check || (apply&&!upgrade))) throw new Error('VERSION_MISMATCH: use explicit --upgrade after reviewing --dry-run');
    if (!apply || check || !changed) return plan;
    if (current) {
      // Recheck immediately before replacement; local edits must not be overwritten.
      if ((await verifyEnvironment(target)).digest!==current.digest) throw new Error('CONCURRENT_CHANGE');
      backup=path.join(parent,`.skillUtils.backup-${Date.now()}`);
      await rename(target,backup);
    } else if (await exists(target)) throw new Error('CONCURRENT_CHANGE');
    try {
      if (process.env.NODE_ENV==='test' && process.env.YSS_MVC_FAIL_BEFORE_INSTALL==='1') throw new Error('INJECTED_INSTALL_FAILURE');
      await rename(staging,target);
    } catch(e) { if(backup) await rename(backup,target); throw e; }
    return {...plan,backup};
  } finally { await rm(staging,{recursive:true,force:true}); if(locked) {const {rmdir}=await import('node:fs/promises');await rmdir(lockDir);} }
}
export async function assertMvcProject(root) {
  root=await realpath(root);
  const {parseDocument}=await import(pathToFileURL(path.join(HARNESS_ROOT,'scripts/vendor/yaml.mjs')).href);
  const readYaml=async p=>parseDocument(await readFile(p,'utf8'),{uniqueKeys:true}).toJS();
  const identity=await readYaml(path.join(root,'yss-project.yaml'));
  if(identity.schema_version!==1||identity.repository_mode!=='project-instance')throw new Error('MIGRATION_REQUIRED: unsupported project identity');
  if(identity.governance_profile===undefined) {
    // Legacy MVC releases persisted explicit provenance before governance_profile existed.
    let generated;
    try { generated=JSON.parse(await readFile(path.join(root,'.yss/scaffold-generation.json'),'utf8')); }
    catch(e) { throw new Error('MIGRATION_REQUIRED: missing valid MVC generation provenance'); }
    const modules=['server','core','client','repository','adapter','feign-client'];
    if(generated.schema_version!==1||generated.skill!=='yss-mvc-scaffold-generator'||generated.project_instance!==true||generated.backend_root!=='.'||JSON.stringify(generated.modules)!==JSON.stringify(modules))throw new Error('MIGRATION_REQUIRED: unsupported generation provenance');
  } else {
    if(typeof identity.governance_profile!=='string')throw new Error('UNSUPPORTED_PROFILE');
    const profilePath=await realpath(path.resolve(root,identity.governance_profile));
    if(!profilePath.startsWith(root+path.sep))throw new Error('UNSAFE_PROFILE_PATH');
    const profile=await readYaml(profilePath);
    if(profile.profile_id!=='yss.mvc.backend'||profile.architecture_style!=='mvc'||profile.runtime_scope!=='backend-only')throw new Error('UNSUPPORTED_PROFILE');
  }
  const lock=JSON.parse(await readFile(path.join(root,'skills-lock.json'),'utf8'));
  if(lock.distribution?.mode!=='sibling-directory'||path.resolve(root,lock.distribution.skillUtilsDir)!==path.join(path.dirname(root),'skillUtils'))throw new Error('UNSUPPORTED_DISTRIBUTION');
  const m=await manifest();
  if(lock.distribution.compatibility!==m.compatibility||lock.distribution.requiredToolVersion!==m.tool_version)throw new Error('INCOMPATIBLE_PROJECT');
  return root;
}
