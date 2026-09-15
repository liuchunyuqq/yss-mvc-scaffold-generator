import {projectPath} from './contract-integrity.mjs';

// 归属在初始快照签名中冻结；只有精确登记的任务过程文件可以单独验收。
export function workspaceOwnership(root, workspace) {
  if (!workspace) return null;
  if (!['task','integration'].includes(workspace.scope) || !Array.isArray(workspace.tasks) || !workspace.tasks.length) throw Error('workspace scope/tasks 缺失');
  const ids=new Set(), paths=new Set();
  for(const task of workspace.tasks) {
    if(!/^[a-zA-Z0-9_-]+$/.test(task.id)||ids.has(task.id)) throw Error('workspace task ID 非法或重复');
    ids.add(task.id);
    if(!Array.isArray(task.process_paths)||!Array.isArray(task.write_paths)) throw Error('workspace 需要 process_paths/write_paths');
    for(const ref of task.process_paths) {
      projectPath(root,ref);
      if(!ref.startsWith(`.yss/tasks/${task.id}/`)||ref.endsWith('/')||paths.has(ref)) throw Error('过程文件须精确登记在各自 .yss/tasks/<id>/ 下');
      paths.add(ref);
    }
  }
  if(workspace.scope==='task'&&!ids.has(workspace.task_id)) throw Error('workspace 当前任务未登记');
  const overlap=(a,b)=>a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
  for(let i=0;i<workspace.tasks.length;i++) for(let j=i+1;j<workspace.tasks.length;j++) {
    for(const a of workspace.tasks[i].write_paths) for(const b of workspace.tasks[j].write_paths) if(overlap(a,b)) throw Error(`workspace 源码冲突或依赖: ${workspace.tasks[i].id}/${workspace.tasks[j].id}: ${a}, ${b}；先隔离或集成`);
  }
  for(const task of workspace.tasks) for(const ref of task.write_paths) {
    projectPath(root,ref);
    if([...paths].some(p=>overlap(p,ref))) throw Error('过程路径与实现路径重叠');
  }
  return workspace;
}

export function taskChanges(root, changes, workspace) {
  workspaceOwnership(root,workspace);
  if(!workspace) return changes;
  const processes=new Set(workspace.tasks.flatMap(t=>t.process_paths));
  // 共享源码仍全部交给范围门禁，绝不默默归入当前任务。
  return changes.filter(ref=>!processes.has(ref));
}

export function validateWorkspaceCandidate(root,workspace,changes,allowed) {
  workspaceOwnership(root,workspace);
  if(workspace?.scope!=='task')return [];
  const own=workspace.tasks.find(t=>t.id===workspace.task_id).write_paths;
  const inside=ref=>own.some(p=>ref===p||ref.startsWith(p+'/'));
  return [...new Set([...allowed,...changes].filter(ref=>!inside(ref)))].map(ref=>`任务候选包含未归属当前任务的实现: ${ref}；隔离验证或创建集成候选，不能扩大授权绕过`);
}
