import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseDocument } from '../vendor/yaml.mjs';
import { validateAcceptanceCheckpoint, fileDigest } from './acceptance-policy.mjs';
import { standardsRoots, verifyApplicableStandards } from './applicable-standards.mjs';
import { validateJsonSchema } from './json-schema.mjs';

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
  for (const slice of state.slices ?? []) {
    try {
      const contract = readProjectDocument(root, slice.contract_ref);
      const bundle = readProjectDocument(root, slice.standards_ref);
      const impacts = new Set(bundle.request.work_units.flatMap(unit => unit.impacts));
      const artifacts = contract.artifacts ?? {};
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
      }
    } catch (error) { errors.push(`${slice.id}: ${error.message}`); }
  }
  if (mode === 'completion') {
    const registry = readProjectDocument(root, 'docs/process/implementation-repo-registry.yaml');
    const required = (registry.projects ?? []).filter(p => p.project_root === '.').flatMap(p => p.verification_commands ?? []);
    if (!required.length) errors.push('缺少工程验收命令登记');
    if (required.some(command => /-D(?:skipTests|maven\.test\.skip)(?:=true)?(?:\s|$)/.test(command))) errors.push('集成验收不得跳过测试');
    for (const command of missingChecks(required, state.overall?.checks)) errors.push(`整体缺少必需检查 ${command}`);
  }
  return [...new Set(errors)];
}
