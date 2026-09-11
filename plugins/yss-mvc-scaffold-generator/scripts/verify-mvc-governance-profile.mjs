#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from './vendor/yaml.mjs';
import { loadAcceptancePolicy } from './lib/acceptance-policy.mjs';
try {
 const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
 const doc = parseDocument(await readFile(path.join(root,'docs/process/mvc-governance-profile.yaml'),'utf8'),{uniqueKeys:true});
 if(doc.errors.length)throw new Error(doc.errors[0].message);
 const p=doc.toJS();
 if(p.profile_id!=='yss.mvc.backend'||p.architecture_style!=='mvc'||p.runtime_scope!=='backend-only'||p.frontend?.status!=='not-applicable'||p.domain_driven_design?.status!=='not-applicable')throw new Error('MVC Profile 不正确');
 if(p.lifecycle?.execution_policy!=='docs/process/acceptance-policy.yaml'||p.lifecycle?.checkpoint_schema_version!==2)throw new Error('需要迁移到验收驱动治理');
 if(p.package_layout_policy!=='docs/process/mvc-package-layout.yaml')throw new Error('需要迁移到 MVC 包布局治理');
 const layout=parseDocument(await readFile(path.join(root,p.package_layout_policy),'utf8'),{uniqueKeys:true});
 if(layout.errors.length||layout.toJS()?.policy_id!=='yss.mvc.package-layout')throw new Error('MVC 包布局规则缺失或非法');
 loadAcceptancePolicy(root);
 console.log('MVC 后端验收驱动治理 Profile 验证通过');
}catch(error){console.error(error.message);process.exitCode=1;}
