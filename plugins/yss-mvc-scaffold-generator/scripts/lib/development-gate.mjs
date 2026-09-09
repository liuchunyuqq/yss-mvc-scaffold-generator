import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseDocument } from '../vendor/yaml.mjs';
import { validateAcceptanceCheckpoint, fileDigest } from './acceptance-policy.mjs';
import { standardsRoots, verifyApplicableStandards } from './applicable-standards.mjs';
import { validateJsonSchema } from './json-schema.mjs';
import { acceptanceIds, validateWritePaths, validateOpenApi, validateTraceability } from './contract-integrity.mjs';
import { validateVerificationPlan } from './verification-plan.mjs';
import { verifyExecutionReceipt, verifyReviewRuntime, changedSinceBaseline, snapshotInputs } from './execution-evidence.mjs';

export function readProjectDocument(root, ref) {
  if (typeof ref !== 'string' || !ref || path.isAbsolute(ref) || ref.includes(':') || ref.split(/[\\/]/).includes('..')) throw Error('非法项目引用');
  const file = realpathSync(path.resolve(root, ref));
  if (!file.startsWith(realpathSync(root) + path.sep)) throw Error('项目引用越界');
  const text = readFileSync(file, 'utf8');
  if (!text.trim()) throw Error(`空产物: ${ref}`);
  const doc = parseDocument(text, { uniqueKeys: true, maxAliasCount: 0 });
  if (doc.errors.length) throw Error(doc.errors[0].message);
  return doc.toJS({ maxAliasCount: 0 });
}

// 命令以登记的确切命令为准，执行者不能用另一条成功命令替代必需检查。
export function missingChecks(required, checks) {
  const present = new Set((checks ?? []).map(check => check.command));
  return required.filter(command => !present.has(command));
}

export function validateDevelopmentGate(root, state, mode) {
  if (!['implementation', 'completion'].includes(mode)) throw Error('需要 implementation 或 completion');
  validateJsonSchema(state, path.join(root, 'docs/process/schemas/lifecycle-checkpoint-v2.schema.json'), { label: '业务 checkpoint' });
  const errors = validateAcceptanceCheckpoint(state, {
    resolve: ref => readProjectDocument(root, ref),
    digest: ref => fileDigest(ref, root),
    verifyStandards: bundle => verifyApplicableStandards(bundle, standardsRoots(root))
  });
  if (state.standards_context_version !== 1) errors.push('需要规范上下文版本 1');
  if (!state.slices?.length) errors.push('缺少实现切片');
  if (state.blockers?.length) errors.push('仍有未解决阻塞');
  if (mode === 'completion' && state.status !== 'completed') errors.push('需求尚未完成');
  const specCatalogue=new Set();
  for (const slice of state.slices ?? []) {
    try {
      const contract = readProjectDocument(root, slice.contract_ref);
      const bundle = readProjectDocument(root, slice.standards_ref);
      const impacts = new Set(bundle.request.work_units.flatMap(unit => unit.impacts));
      const artifacts = contract.artifacts ?? {};
      const specIds = acceptanceIds(root, artifacts.spec);
      for(const id of specIds) specCatalogue.add(id);
      for (const id of [...(contract.acceptance_ids ?? []), ...(slice.acceptance_ids ?? [])]) {
        if (!specIds.includes(id) || !state.acceptance_ids.includes(id)) errors.push(`${slice.id}: 验收 ID 必须精确引用 Spec 和 checkpoint: ${id}`);
      }
      errors.push(...validateWritePaths(root, contract.allowed_write_paths));
      if (artifacts.openapi) errors.push(...validateOpenApi(readProjectDocument(root, artifacts.openapi)));
      errors.push(...validateVerificationPlan(contract, [...impacts]));
      const identity=readProjectDocument(root,'yss-project.yaml');
      if(identity.governance_profile==='docs/process/mvc-governance-profile.yaml') {
        if(!contract.mvc_structure?.production_types?.length) errors.push(`${slice.id}: MVC 缺少生产实现类型清单`);
        if(!contract.verification_plan?.some(c=>c.type==='static' && c.args?.includes('scripts/verify-mvc-structure.mjs') && c.args?.includes(slice.contract_ref))) errors.push(`${slice.id}: MVC AST 检查必须进入必需检查链路`);
        if(['persistence-impact','mybatis-framework-impact','data-impact'].some(i=>impacts.has(i)) && (!contract.mvc_structure?.entity_types?.length || !contract.mvc_structure?.mapper_types?.length)) errors.push(`${slice.id}: 缺少 Entity/MP 类型映射`);
        if(['web-adapter-impact','dto-wire-impact'].some(i=>impacts.has(i)) && !contract.verification_plan?.some(c=>c.type==='contract' && c.capabilities?.includes('dependency-bytecode'))) errors.push(`${slice.id}: 缺少实际依赖字节码发现检查`);
      }
      if (!artifacts.requirements) errors.push(`${slice.id}: 缺少需求来源追踪 requirements；恢复旧合同须补齐`);
      else errors.push(...validateTraceability(readProjectDocument(root, artifacts.requirements), {
        digest: ref => fileDigest(ref, root), checkIds: (contract.verification_plan ?? []).map(c => c.id), acceptanceIds: specIds
      }));
      const required = ['spec'];
      if (['web-adapter-impact', 'dto-wire-impact'].some(i => impacts.has(i))) required.push('openapi');
      if (['persistence-impact', 'mybatis-framework-impact', 'data-impact'].some(i => impacts.has(i))) required.push('data_model');
      const context = new Set(bundle.sources.filter(s => s.ref.startsWith('project:')).map(s => s.ref.slice(8)));
      for (const kind of required) {
        const ref = artifacts[kind];
        if (!ref || !context.has(ref) || !fileDigest(ref, root)) errors.push(`${slice.id}: 缺少已纳入规范上下文的 ${kind}`);
      }
      if (!Array.isArray(contract.acceptance_ids) || !contract.acceptance_ids.length || !Array.isArray(contract.allowed_write_paths) || !contract.allowed_write_paths.length || !Array.isArray(contract.required_checks) || !contract.required_checks.length) errors.push(`${slice.id}: 合同缺少验收、路径或检查`);
      if ((slice.acceptance_ids ?? []).some(id => !contract.acceptance_ids?.includes(id))) errors.push(`${slice.id}: 合同验收覆盖不完整`);
      if (mode === 'completion') {
        for (const command of missingChecks(contract.required_checks ?? [], slice.checks)) errors.push(`${slice.id}: 缺少必需检查 ${command}`);
        for (const definition of contract.verification_plan ?? []) {
          const check = (slice.checks ?? []).find(c => c.command === definition.command);
          if (!check) continue;
          try { errors.push(...verifyExecutionReceipt(root, readProjectDocument(root, check.evidence_ref), contract, definition).map(e => `${slice.id}: ${e}`)); }
          catch { errors.push(`${slice.id}: 执行回执不可读`); }
        }
        errors.push(...verifyReviewRuntime(root, readProjectDocument(root,slice.review_ref), contract));
      }
    } catch (error) { errors.push(`${slice.id}: ${error.message}`); }
  }
  for(const id of specCatalogue) if(!state.acceptance_ids.includes(id)) errors.push(`Spec 验收未完整覆盖: ${id}`);
  for(const id of state.acceptance_ids) if(!specCatalogue.has(id)) errors.push(`验收 ID 未精确引用 Spec: ${id}`);
  if (mode === 'completion') {
    try {
      const excluded=[state.overall.checkpoint_ref,...state.slices.map(s=>s.review_ref),state.overall.review_ref].filter(Boolean);
      const changes=changedSinceBaseline(root,state.overall.baseline_snapshot_ref,excluded);
      const allowed=state.slices.flatMap(s=>readProjectDocument(root,s.contract_ref).allowed_write_paths);
      errors.push(...validateWritePaths(root,allowed,changes));
      const review=readProjectDocument(root,state.overall.review_ref);
      const current=snapshotInputs(root,allowed);
      if(Object.keys(current).some(ref=>review.inputs?.[ref]!==current[ref])) errors.push('整体审查候选未覆盖完整授权实现范围');
    } catch(error) {errors.push(`候选范围检查失败: ${error.message}`);}
    const registry = readProjectDocument(root, 'docs/process/implementation-repo-registry.yaml');
    const required = (registry.projects ?? []).filter(p => p.project_root === '.').flatMap(p => p.verification_commands ?? []);
    if (!required.length) errors.push('缺少工程验收命令登记');
    if (required.some(command => /-D(?:skipTests|maven\.test\.skip)(?:=true)?(?:\s|$)/.test(command))) errors.push('集成验收不得跳过测试');
    for (const command of missingChecks(required, state.overall?.checks)) errors.push(`整体缺少必需检查 ${command}`);
    if (!state.overall?.verification_plan?.length) errors.push('整体缺少结构化检查计划');
    else {
      const contracts=state.slices.map(s=>readProjectDocument(root,s.contract_ref));
      const overallContract={allowed_write_paths:[...new Set(contracts.flatMap(c=>c.allowed_write_paths))],artifacts:Object.assign({},...contracts.map(c=>c.artifacts)),required_checks:required,verification_plan:state.overall.verification_plan};
      errors.push(...validateVerificationPlan(overallContract));
      for(const definition of overallContract.verification_plan) {
        const check=state.overall.checks?.find(c=>c.command===definition.command);
        if(!check) continue;
        try { errors.push(...verifyExecutionReceipt(root,readProjectDocument(root,check.evidence_ref),overallContract,definition)); } catch {errors.push('整体执行回执不可读');}
      }
      errors.push(...verifyReviewRuntime(root,readProjectDocument(root,state.overall.review_ref),overallContract));
    }
  }
  return [...new Set(errors)];
}
