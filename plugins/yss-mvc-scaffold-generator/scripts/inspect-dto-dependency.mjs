#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {parseArgs} from 'node:util';
try {
  const {values}=parseArgs({options:{package:{type:'string',default:'com.yss.cloud.dto.result'}}});
  const jar=process.env.YSS_DTO_JAR;
  if(!jar) throw Error('需要 YSS_DTO_JAR 指向当前项目实际解析到的依赖 JAR；不可用 sources.jar 替代');
  if(/-sources\.jar$/i.test(jar) || !/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)+$/.test(values.package)) throw Error('需要字节码 JAR 与合法包名');
  const javap=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'javap.exe':'javap'):'javap';
  const types={};
  for(const type of ['SingleResult','MultiResult','PageResult']) {
    const result=spawnSync(javap,['-classpath',jar,'-public',`${values.package}.${type}`],{encoding:'utf8',windowsHide:true});
    if(result.status!==0) throw Error(`${type} 字节码解析失败`);
    types[type]=result.stdout;
  }
  console.log(JSON.stringify({schema_version:1,jar_digest:createHash('sha256').update(readFileSync(jar)).digest('hex'),java_package:values.package,types,wire_shape:'requires-http-verification'},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
