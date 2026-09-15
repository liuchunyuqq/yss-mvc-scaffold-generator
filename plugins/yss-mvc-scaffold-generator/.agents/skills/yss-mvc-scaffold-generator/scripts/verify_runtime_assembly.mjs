#!/usr/bin/env node
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {renderAsset} from './lib/storage.mjs';
import {HARNESS_ROOT} from './lib/runtime.mjs';
// 提供已解析依赖目录和 H2 JAR；不下载、不读取业务配置，不替代 Maven reactor 或目标数据库联调。
const directory=process.env.YSS_RUNTIME_LIB_DIR, h2=process.env.YSS_RUNTIME_H2_JAR;
if(!directory||!h2)throw Error('需要 YSS_RUNTIME_LIB_DIR 与 YSS_RUNTIME_H2_JAR（仅依赖路径）');
const root=mkdtempSync(path.join(os.tmpdir(),'mvc-runtime-'));
try {
  const libs=readdirSync(directory).filter(n=>n.endsWith('.jar')).map(n=>path.join(directory,n));
  const dependencies=[...libs,h2];
  console.log(JSON.stringify({scope:'production-assembly-local-h2',dependencies:dependencies.map(f=>({name:path.basename(f),sha256:createHash('sha256').update(readFileSync(f)).digest('hex')}))}));
  const source=path.join(root,'DatabaseInfrastructureConfiguration.java');
  let body=await renderAsset('database-infrastructure.java.template',{BASE_PACKAGE:'example.lifecycle'});
  if(process.argv.includes('--baseline')) {
    const previous=spawnSync('git',['show','HEAD:.agents/skills/yss-mvc-scaffold-generator/scripts/lib/templates.mjs'],{cwd:HARNESS_ROOT,encoding:'utf8'});
    if(previous.status!==0)throw Error('无法读取维护前模板');
    const code=previous.stdout.replace('"./runtime.mjs"',JSON.stringify(new URL('./lib/runtime.mjs',import.meta.url).href));
    const old=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
    await old.writeJavaSources({targetDir:root,basePackage:'example.lifecycle',database:'oracle',withMock:true},async(_,ref,text)=>{if(ref.endsWith('/DatabaseInfrastructureConfiguration.java'))body=text;});
  }
  writeFileSync(source,body);
  for(const [folder,name,number] of [['mapper/new','NextMapper',42],['mappers','ExistingMapper',7]]) {
    mkdirSync(path.join(root,folder),{recursive:true});
    writeFileSync(path.join(root,folder,name+'.xml'),`<?xml version="1.0"?><!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd"><mapper namespace="example.fixture.RuntimeProbe$${name}"><select id="query" resultType="int">select ${number}</select></mapper>`);
  }
  const cp=[root,...dependencies].join(path.delimiter);
  const bin=name=>process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',name+(process.platform==='win32'?'.exe':'')):name;
  const run=(program,args)=>{const result=spawnSync(program,args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(result.status!==0)throw Error(result.stdout+result.stderr); console.log(result.stdout.split(/\r?\n/).filter(l=>l.startsWith('PASSED:')).join('\n'));};
  run(bin('javac'),['-encoding','UTF-8','-cp',cp,'-d',root,source,fileURLToPath(new URL('./fixtures/RuntimeProbe.java',import.meta.url))]);
  run(bin('java'),['-Dfile.encoding=UTF-8','-cp',cp,'example.fixture.RuntimeProbe']);
  run(bin('java'),['-Dfile.encoding=UTF-8','-cp',cp,'example.fixture.RuntimeProbe','missing']);
  run(bin('java'),['-Dfile.encoding=UTF-8','-cp',cp,'example.fixture.RuntimeProbe','segment']);
}finally{rmSync(root,{recursive:true,force:true});}
