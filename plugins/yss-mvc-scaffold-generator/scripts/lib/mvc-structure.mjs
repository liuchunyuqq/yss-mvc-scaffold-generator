import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const ast = fileURLToPath(new URL('./java/MvcAst.java', import.meta.url));

export function parseJavaProject(root) {
  const files = [];
  const walk = dir => { for (const entry of readdirSync(dir,{withFileTypes:true})) {
    if (entry.isSymbolicLink()) throw Error(`Java 源码不能为链接: ${entry.name}`);
    if (['.git','node_modules','target','.yss','.agents','.codex','.claude'].includes(entry.name)) continue;
    const file = path.join(dir,entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.replaceAll('\\','/').includes('/src/main/java/') && file.endsWith('.java')) files.push(file);
  } };
  walk(root); if (!files.length) return [];
  const temp = mkdtempSync(path.join(os.tmpdir(),'mvc-parser-'));
  const run = (program,args) => { const result=spawnSync(program,args,{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true}); if(result.status!==0) throw Error(`Java AST 执行失败: ${result.error?.message ?? result.stderr}`); return result.stdout; };
  try {
    const javac = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'javac.exe':'javac') : 'javac';
    writeFileSync(path.join(temp,'sources.txt'), files.join('\n'));
    // JDK 8 的 javac API 位于 tools.jar；新 JDK 由 jdk.compiler 模块提供。
    let home = process.env.JAVA_HOME;
    if (!home) {
      const result=spawnSync(process.platform==='win32'?'where.exe':'which',['javac'],{encoding:'utf8',windowsHide:true});
      if(result.status===0) home=path.dirname(path.dirname(result.stdout.trim().split(/\r?\n/)[0]));
    }
    const java = home ? path.join(home,'bin',process.platform==='win32'?'java.exe':'java') : 'java';
    const toolsJar = home && path.join(home,'lib/tools.jar');
    const cp = temp + (toolsJar && existsSync(toolsJar) ? path.delimiter+toolsJar : '');
    run(javac,['-encoding','UTF-8','-cp',cp,'-d',temp,ast]);
    return JSON.parse(run(java,['-Dfile.encoding=UTF-8','-cp',cp,'MvcAst',path.join(temp,'sources.txt')]));
  } finally { rmSync(temp,{recursive:true,force:true}); }
}

export function checkMvcStructure(root, profile, classes = parseJavaProject(root)) {
  const errors=[];
  const byName = new Map(classes.map(c=>[c.name,c]));
  const resolve = (owner, type) => {
    if(byName.has(type)) return byName.get(type);
    const imported=owner.imports.find(i=>i.endsWith('.'+type));
    if(imported && byName.has(imported)) return byName.get(imported);
    const samePackage=byName.get(owner.name.slice(0,owner.name.lastIndexOf('.')+1)+type);
    if(samePackage) return samePackage;
    const matches=classes.filter(c=>c.simpleName===type && owner.imports.includes(c.name.slice(0,c.name.lastIndexOf('.'))+'.*'));
    if(matches.length>1) errors.push(`ambiguous-type: ${owner.name} ${type}`);
    return matches[0];
  };
  const mock = c => /Mock|InMemory/.test(c.simpleName) || /@Profile\(\s*"mock"\s*\)/.test(c.annotations);
  const reachesMock = (c,seen=new Set()) => {
    if(mock(c)) return true;
    if(seen.has(c.name)) return false; seen.add(c.name);
    return c.refs.some(ref => (ref.match(/[\w.]+/g)??[]).some(token=>{const dependency=resolve(c,token);return dependency && reachesMock(dependency,seen);}));
  };
  for(const name of profile.production_types ?? []) {
    const c=byName.get(name);
    if(!c) errors.push(`production-type-missing: ${name}`);
    else if(reachesMock(c)) errors.push(`production-mock: ${name}`);
  }
  for(const c of classes) {
    if(c.name.includes('.core.') && c.imports.some(i=>/mybatis|\.repository\.|java\.sql|oracle\./.test(i))) errors.push(`core-persistence-dependency: ${c.name}`);
    const service=c.name.includes('.service.') || c.simpleName.endsWith('Service') || c.simpleName.endsWith('ServiceImpl');
    if(service && c.kind==='CLASS' && (!c.simpleName.endsWith('ServiceImpl') || !c.interfaces.some(i=>resolve(c,i)?.kind==='INTERFACE'))) errors.push(`service-interface-required: ${c.name}`);
    if(service) for(const m of c.methods) if(m.public && m.name!=='<init>' && !m.doc.trim()) errors.push(`business-javadoc: ${c.name}.${m.name}`);
    if(c.name.includes('.entity.') || c.name.includes('.dto.') || (profile.entity_types??[]).includes(c.name)) for(const f of c.fields) if(f.name!=='serialVersionUID'&&!f.doc.trim()) errors.push(`field-javadoc: ${c.name}.${f.name}`);
    if(['SingleResult','MultiResult','PageResult'].includes(c.simpleName) && !c.name.startsWith(profile.wrapper_package+'.')) errors.push(`custom-wrapper: ${c.name}`);
    if(/@RestController|@Controller/.test(c.annotations)) {
      for(const ref of c.refs) {const dependency=resolve(c,ref);if(dependency && /Service(?:Impl)?$/.test(dependency.simpleName) && dependency.kind!=='INTERFACE') errors.push(`controller-service-interface: ${c.name}`);}
      for(const f of c.fields) {const dependency=resolve(c,f.type);if(dependency && /Service(?:Impl)?$/.test(dependency.simpleName) && dependency.kind!=='INTERFACE') errors.push(`controller-service-interface: ${c.name}.${f.name}`);}
      for(const m of c.methods) if(m.public && m.returnType && !(profile.download_methods??[]).includes(`${c.name}.${m.name}`)) {
        if(!/^(?:[\w.]+\.)?(?:SingleResult|MultiResult|PageResult|Result)(?:<|$)/.test(m.returnType)) errors.push(`response-wrapper: ${c.name}.${m.name}`);
      }
    }
  }
  for(const name of profile.entity_types??[]) {
    const c=byName.get(name);
    if(!c || !/@TableName\b/.test(c.annotations) || !(profile.entity_bases??[]).some(base=>c.extends.split('<')[0]===base)) errors.push(`entity-mapping: ${name}`);
    if(c && !c.fields.some(f=>/@TableId\b/.test(f.annotations)&&/ASSIGN_ID/.test(f.annotations)) && !profile.inherited_assign_id_bases?.includes(c.extends.split('<')[0])) errors.push(`entity-assign-id: ${name}`);
  }
  for(const name of profile.mapper_types??[]) {
    const c=byName.get(name);
    if(!c || !(profile.mapper_bases??[]).some(base=>c.interfaces.some(i=>i.startsWith(base+'<')&&!/<\s*Map\b/.test(i)))) errors.push(`mp-mapper-required: ${name}`);
  }
  return [...new Set(errors)];
}
