import { createHash, createHmac, randomBytes, randomUUID, verify } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectPath } from './contract-integrity.mjs';
import { evidenceKey } from './acceptance-policy.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const executorDigest = () => hash(readFileSync(fileURLToPath(import.meta.url)));
const reportRoot = root => projectPath(root,'.yss/evidence');

export function snapshotInputs(root, refs) {
  const inputs = {};
  const walk = ref => {
    const file=projectPath(root,ref);
    if (!existsSync(file)) { inputs[ref]=null; return; }
    const info=lstatSync(file);
    if(info.isSymbolicLink()) throw Error(`输入链接不支持 ${ref}`);
    if(info.isDirectory()) {
      const children=readdirSync(file).sort();
      for(const child of children) {
        if(['.git','target','node_modules'].includes(child)) continue;
        const nested=ref==='.'?child:ref+'/'+child;
        if(nested==='.yss/evidence'||nested.startsWith('.yss/evidence/')) continue;
        walk(nested);
      }
    } else inputs[ref.replaceAll('\\','/')]=hash(readFileSync(file));
  };
  for(const ref of [...new Set(refs)].sort()) walk(ref);
  return Object.fromEntries(Object.entries(inputs).sort(([a],[b])=>a.localeCompare(b)));
}

export function checkInputs(root, contract, check) {
  return snapshotInputs(root,[...contract.allowed_write_paths,...check.input_paths,...Object.values(contract.artifacts??{}),...(contract.input_refs??[]),...(check.type==='review'?['docs/process/review-runtime-trust.json']:[])]);
}

function executionContext(check) {
  const environmentInputs = {};
  const expand = argument => argument.replace(/\$\{ENV:([A-Za-z_][A-Za-z0-9_]*)\}/g,(_,name)=>{
    if(!process.env[name]) throw Error(`缺少环境变量 ${name}`);
    environmentInputs[name]=hash(process.env[name]); return process.env[name];
  });
  const program=expand(check.program), args=check.args.map(expand);
  const fileHash=value=>!/^\\\\[.?]\\/.test(value)&&existsSync(value)&&lstatSync(value).isFile()?hash(readFileSync(value)):null;
  const inheritedEnvironment=Object.fromEntries(Object.entries(process.env).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,{value:hash(value),file:fileHash(value)}]));
  const settings=path.join(os.homedir(),'.m2/settings.xml');
  const defaultSettings=/(?:^|[\\/])mvnw(?:\.cmd)?$/.test(program)&&existsSync(settings)?hash(readFileSync(settings)):null;
  return {program,args,environment_digest:hash(JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,node_binary:hash(readFileSync(process.execPath)),defaultSettings,label:check.environment,environmentInputs,inheritedEnvironment}))};
}
function receiptSignature(root, evidence, create = false) {
  const folder=reportRoot(root); if(create) mkdirSync(folder,{recursive:true});
  const keyPath=path.join(folder,'.executor-key');
  if(create&&!existsSync(keyPath)) writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600});
  const { signature, ...payload }=evidence;
  return createHmac('sha256',readFileSync(keyPath)).update(JSON.stringify(payload)).digest('hex');
}

export function runCheck(root, contract, check) {
  const before=checkInputs(root,contract,check);
  const context=executionContext(check);
  const started_at=new Date().toISOString();
  let program=context.program,args=context.args;
  // Windows .cmd 无法由 execFile 直接运行。只为已登记 Wrapper 适配，严格拒绝 cmd 元字符。
  if(process.platform==='win32' && /(?:^|[\\/])mvnw(?:\.cmd)?$/.test(program)) {
    const wrapper=path.resolve(root,program.endsWith('.cmd')?program:program+'.cmd');
    if([wrapper,...args].some(a=>/["%!*?&|<>^\r\n]/.test(a))) throw Error('Windows Wrapper 参数含不支持的 shell 字符');
    args=['/d','/s','/c','"'+[wrapper,...args].map(a=>'"'+a+'"').join(' ')+'"'];
    program=process.env.ComSpec??'cmd.exe';
  } else if (/\.(?:cmd|bat)$/i.test(program)) throw Error('仅支持受控 Maven Wrapper 批处理适配');
  const run=spawnSync(program,args,{cwd:root,encoding:'utf8',shell:false,windowsHide:true,maxBuffer:8*1024*1024});
  const ended_at=new Date().toISOString();
  const evidence={schema_version:1,rule_version:'governance-integrity-v1',run_id:randomUUID(),executor_digest:executorDigest(),contract_digest:hash(JSON.stringify(contract)),check_id:check.id,type:check.type,capabilities:check.capabilities,command:check.command,program:check.program,args:check.args,environment:check.environment,environment_digest:context.environment_digest,inputs:before,started_at,ended_at,executed_at:ended_at,exit_code:run.status??-1,signal:run.signal??null,output_digest:hash((run.stdout??'')+(run.stderr??'')),inputs_unchanged:JSON.stringify(before)===JSON.stringify(checkInputs(root,contract,check))};
  if(check.type==='review') {
    try {
      const result=JSON.parse(run.stdout);
      evidence.review_result=Object.fromEntries(['actor_instance_id','implementer_instance_ids','dispatch_id','host_event_ref','candidate_digest','acceptance_ids','findings','result'].map(k=>[k,result[k]??null]));
    } catch {evidence.exit_code=-1;}
  }
  evidence.key=evidenceKey(evidence);
  evidence.signature=receiptSignature(root,evidence,true);
  const ref=`.yss/evidence/${evidence.run_id}.json`;
  writeFileSync(projectPath(root,ref),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  return {...evidence,evidence_ref:ref};
}

export function verifyExecutionReceipt(root, provided, contract, check) {
  const errors=[];
  try {
    const {evidence_ref,...evidence}=provided;
    if(!/^[a-f0-9-]{36}$/.test(evidence.run_id)) throw Error('没有执行实例');
    const recorded=JSON.parse(readFileSync(projectPath(root,`.yss/evidence/${evidence.run_id}.json`),'utf8'));
    if(JSON.stringify(recorded)!==JSON.stringify(evidence) || evidence.signature!==receiptSignature(root,evidence)) throw Error('执行回执不匹配');
    if(evidence.executor_digest!==executorDigest() || evidence.contract_digest!==hash(JSON.stringify(contract))) errors.push('执行器或合同变化');
    if(evidence.check_id!==check.id || evidence.type!==check.type || JSON.stringify(evidence.capabilities)!==JSON.stringify(check.capabilities) || evidence.command!==check.command || evidence.program!==check.program || JSON.stringify(evidence.args)!==JSON.stringify(check.args)) errors.push('检查类型或 argv 不匹配');
    if(evidence.exit_code!==0 || !evidence.inputs_unchanged || evidence.signal) errors.push('检查失败或执行期间输入变化');
    if(evidence.environment_digest!==executionContext(check).environment_digest) errors.push('检查环境变化');
    if(JSON.stringify(evidence.inputs)!==JSON.stringify(checkInputs(root,contract,check))) errors.push('检查输入变化');
    if(!(Date.parse(evidence.started_at)<=Date.parse(evidence.ended_at)) || Date.parse(evidence.ended_at)>Date.now()+1000) errors.push('执行时间无效');
  } catch(error) { errors.push(`执行器回执缺失或无效: ${error.message}`); }
  return errors;
}

// 宿主适配器的独立实例记录必须由检查进程实际返回；名称差异本身没有证明力。
export function verifyReviewRuntime(root, review, contract) {
  try {
    const receipt=JSON.parse(readFileSync(projectPath(root,review.execution_ref),'utf8'));
    const definition=contract.verification_plan?.find(c=>c.id===receipt.check_id && c.type==='review' && c.capabilities.includes('independent-review'));
    if(!definition) return ['独立审查缺少运行时检查定义'];
    const errors=verifyExecutionReceipt(root,receipt,contract,definition);
    const result=receipt.review_result;
    if(!result || result.candidate_digest!==review.candidate_digest || result.actor_instance_id!==review.reviewer || !result.dispatch_id || !result.host_event_ref || !Array.isArray(result.implementer_instance_ids) || !result.implementer_instance_ids.length || result.implementer_instance_ids.includes(result.actor_instance_id)) errors.push('独立审查没有可追踪的独立执行实例');
    if(result?.result!=='pass' || JSON.stringify(result?.findings)!==JSON.stringify(review.findings) || JSON.stringify(result?.acceptance_ids)!==JSON.stringify(review.acceptance_ids)) errors.push('独立审查回收结果不匹配');
    const trust=JSON.parse(readFileSync(projectPath(root,'docs/process/review-runtime-trust.json'),'utf8'));
    const event=JSON.parse(readFileSync(projectPath(root,result.host_event_ref),'utf8'));
    const host=trust.hosts?.find(h=>h.id===event.host_id);
    const payload=event.payload;
    if(!host?.public_key || !verify(null,Buffer.from(JSON.stringify(payload)),host.public_key,Buffer.from(event.signature??'','base64'))) errors.push('独立审查宿主签名无效');
    if(payload?.actor_instance_id!==result.actor_instance_id || payload?.dispatch_id!==result.dispatch_id || payload?.candidate_digest!==review.candidate_digest || payload?.result!==review.result || JSON.stringify(payload?.findings)!==JSON.stringify(review.findings) || JSON.stringify(payload?.acceptance_ids)!==JSON.stringify(review.acceptance_ids)) errors.push('独立审查宿主回收事件不匹配');
    if(!Array.isArray(payload?.implementer_instance_ids) || JSON.stringify(payload.implementer_instance_ids)!==JSON.stringify(review.implementers) || payload.implementer_instance_ids.includes(payload.actor_instance_id)) errors.push('独立审查宿主实施者集合不匹配');
    if(!payload?.started_at || !payload?.ended_at || !(Date.parse(payload.started_at)<=Date.parse(payload.ended_at))) errors.push('独立审查宿主时间缺失');
    return errors;
  } catch {return ['独立审查缺少执行器回收记录'];}
}

export function captureBaseline(root, exclusions = []) {
  const inputs=snapshotInputs(root,['.']);
  for(const ref of exclusions) { projectPath(root,ref); delete inputs[ref]; }
  const baseline={schema_version:1,kind:'candidate-baseline',run_id:randomUUID(),created_at:new Date().toISOString(),exclusions:[...exclusions].sort(),inputs};
  baseline.signature=receiptSignature(root,baseline,true);
  const ref=`.yss/evidence/${baseline.run_id}.json`;
  writeFileSync(projectPath(root,ref),JSON.stringify(baseline,null,2)+'\n',{flag:'wx'});
  return ref;
}
export function changedSinceBaseline(root, ref, exclusions) {
  const baseline=JSON.parse(readFileSync(projectPath(root,ref),'utf8'));
  if(baseline.kind!=='candidate-baseline'||baseline.signature!==receiptSignature(root,baseline)||JSON.stringify(baseline.exclusions)!==JSON.stringify([...exclusions].sort())) throw Error('候选初始快照无效或排除范围变化');
  const current=snapshotInputs(root,['.']);
  for(const name of exclusions) delete current[name];
  return [...new Set([...Object.keys(baseline.inputs),...Object.keys(current)])].filter(name=>baseline.inputs[name]!==current[name]);
}
