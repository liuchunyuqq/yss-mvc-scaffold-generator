import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectPath} from './contract-integrity.mjs';

export const transientAsset = ref => /(?:^|\/)(?:\.scratch|\.yss\/evidence|\.yss\/tasks)(?:\/|$)/.test(ref.replaceAll('\\','/'));
export function validateStableArtifacts(artifacts) {
  return Object.entries(artifacts??{}).filter(([kind,ref])=>['spec','openapi','data_model','requirements'].includes(kind)&&typeof ref==='string'&&transientAsset(ref)).map(([kind,ref])=>`正式资产 ${kind} 仍位于过程目录: ${ref}；迁至稳定路径，刷新合同和相关证据`);
}

// 只读清理预演：不自动删除或取消跟踪，历史证据也保留引用阻塞。
export function inspectArtifactLifecycle(root) {
  const result=spawnSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',windowsHide:true});
  if(result.status!==0) throw Error('无法读取 Git 跟踪清单');
  const files=result.stdout.split('\0').filter(Boolean);
  const candidates=files.filter(transientAsset).map(ref=>({ref,classification:ref.includes('/evidence/')?'process-evidence':'needs-classification',referenced_by:[]}));
  for(const ref of files.filter(f=>/\.(?:md|ya?ml|json)$/.test(f)&&!transientAsset(f))) {
    const file=projectPath(root,ref); if(!existsSync(file))continue;
    const text=readFileSync(file,'utf8');
    for(const item of candidates) {
      const relative=path.posix.relative(path.posix.dirname(ref),item.ref);
      if(text.includes(item.ref)||text.includes(relative)) item.referenced_by.push(ref);
    }
  }
  return {mode:'dry-run',candidates,note:'需按用途判断；有引用项先迁移有效资产及引用。当前证据保留至验收交接结束，本机签名证据跨机器重跑。'};
}
