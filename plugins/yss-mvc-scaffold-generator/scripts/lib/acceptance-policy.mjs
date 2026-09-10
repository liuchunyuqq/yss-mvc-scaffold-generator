import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from '../vendor/yaml.mjs';
import { standardsRoots, verifyApplicableStandards } from './applicable-standards.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function loadAcceptancePolicy(projectRoot = root) {
  const doc = parseDocument(readFileSync(path.join(projectRoot, 'docs/process/acceptance-policy.yaml'), 'utf8'), { uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  const policy = doc.toJS();
  if (policy?.schema_version !== 1 || policy.policy_id !== 'acceptance-driven-v1' || policy.state_schema_version !== 2 || policy.review?.independent !== true) throw new Error('不兼容的验收策略');
  return policy;
}
export function selectDevelopmentAction(input, policy = loadAcceptancePolicy()) {
  if (input.read_only === true) return 'route';
  if (input.input_reason) {
    if (!policy.human_input_reasons.includes(input.input_reason)) return 'diagnose';
    return 'awaiting-input';
  }
  if (input.stale === true || input.stale_inputs?.length) return 'refresh-inputs';
  if (input.violation === true) return 'repair';
  if (input.new_impacts?.length || input.drift === true) return input.within_goal === true ? 'update-plan' : 'assess-scope';
  return 'orchestrate';
}
export function evidenceKey({ inputs, command, environment }) {
  if (!inputs || Array.isArray(inputs) || typeof inputs !== 'object' || !Object.keys(inputs).length || typeof command !== 'string' || !command.trim() || typeof environment !== 'string' || !environment.trim()) throw new Error('验证输入、命令和环境不能为空');
  return createHash('sha256').update(JSON.stringify({ inputs: Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b)), command, environment })).digest('hex');
}
export function contentDigest(inputs) {
  if (!inputs || Array.isArray(inputs) || typeof inputs !== 'object' || !Object.keys(inputs).length) throw new Error('候选文件清单不能为空');
  return createHash('sha256').update(JSON.stringify(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
}
export function fileDigest(ref, projectRoot = root) {
  if (typeof ref !== 'string' || path.isAbsolute(ref) || ref.split(/[\\/]/).includes('..')) throw new Error('非法项目相对路径');
  try { return createHash('sha256').update(readFileSync(path.resolve(projectRoot, ref))).digest('hex'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export function validateAcceptanceCheckpoint(state, { resolve = (ref) => JSON.parse(readFileSync(path.resolve(root, ref), 'utf8')), digest = fileDigest, verifyStandards = bundle => verifyApplicableStandards(bundle, standardsRoots(root)) } = {}) {
  const errors = [];
  const requiredText = (value) => typeof value === 'string' && value.trim().length > 0;
  if (state?.schema_version !== 2 || state.policy_id !== 'acceptance-driven-v1') errors.push('unsupported-policy-or-schema');
  if (!requiredText(state?.goal) || !requiredText(state?.baseline_ref)) errors.push('goal-and-baseline-required');
  try {
    const actual = digest(state?.baseline_ref);
    if (!actual) errors.push('baseline-unreadable');
    else if (actual !== state.baseline_digest) errors.push('baseline-changed');
  } catch { errors.push('baseline-unreadable'); }
  const ids = state?.acceptance_ids;
  if (!Array.isArray(ids) || !ids.length || ids.some(id => !requiredText(id)) || new Set(ids).size !== ids.length) errors.push('acceptance-ids-required');
  if (!['routing', 'running', 'reviewing', 'awaiting-input', 'blocked', 'completed'].includes(state?.status)) errors.push('invalid-status');
  if (state?.status === 'awaiting-input' && (!loadAcceptancePolicy().human_input_reasons.includes(state.pause?.reason) || !requiredText(state.pause?.question))) errors.push('concrete-input-required');
  if (state.standards_context_version === 1) for (const slice of state.slices ?? []) {
    try {
      const bundle = resolve(slice.standards_ref);
      if (bundle.digest !== slice.standards_digest || verifyStandards(bundle).freshness !== 'current') errors.push('slice-standards-stale');
      if (!bundle.context_plan?.work_units?.some(unit => unit.work_unit === slice.active_work_unit)) errors.push('slice-active-work-unit-required');
      const contract = resolve(slice.contract_ref);
      if (!requiredText(slice.contract_version) || contract.contract_version !== slice.contract_version || contract.status !== 'validated') errors.push('slice-current-contract-required');
      if (contract.resolution?.applicable_standards?.digest !== bundle.digest) errors.push('slice-contract-standards-mismatch');
    } catch { errors.push('slice-standards-or-contract-unreadable'); }
  }
  if (state?.status !== 'completed') return errors;
  if (!Array.isArray(state.slices) || !state.slices.length) errors.push('slices-required');
  if (state.blockers?.length) errors.push('unresolved-blockers');
  const covered = new Set();
  const checkReview = (item, scope) => {
    let review;
    try { review = resolve(item?.review_ref); } catch { errors.push(`${scope}-review-unreadable`); return; }
    if (!requiredText(item?.candidate_digest) || review.candidate_digest !== item.candidate_digest) errors.push(`${scope}-review-stale`);
    if (review.baseline_digest !== state.baseline_digest) errors.push(`${scope}-baseline-not-reviewed`);
    if (state.standards_context_version === 1) {
      if (scope === 'slice' && review.standards_digest !== item.standards_digest) errors.push('slice-standards-not-reviewed');
      if (scope === 'overall' && state.slices.some(slice => review.standards_digests?.[slice.id] !== slice.standards_digest)) errors.push('overall-standards-not-reviewed');
    }
    try {
      if (contentDigest(review.inputs) !== review.candidate_digest) errors.push(`${scope}-candidate-digest-invalid`);
      for (const [ref, expected] of Object.entries(review.inputs)) if (digest(ref) !== expected) errors.push(`${scope}-candidate-changed`);
    } catch { errors.push(`${scope}-candidate-incomplete`); }
    if (review.scope !== scope || review.result !== 'pass' || !requiredText(review.reviewer) || !Array.isArray(review.implementers) || !review.implementers.length || review.implementers.includes(review.reviewer)) errors.push(`${scope}-independent-review-required`);
    if (!Array.isArray(review.findings) || review.findings.some(f => f.status !== 'resolved' && f.kind !== 'suggestion')) errors.push(`${scope}-open-findings`);
    const requiredIds = scope === 'overall' ? ids : item.acceptance_ids;
    if (!Array.isArray(review.acceptance_ids) || (requiredIds ?? []).some(id => !review.acceptance_ids.includes(id))) errors.push(`${scope}-acceptance-not-reviewed`);
    if (!Array.isArray(item.checks) || !item.checks.length) errors.push(`${scope}-verification-required`);
    for (const check of item.checks ?? []) {
      let evidence;
      try { evidence = resolve(check.evidence_ref); } catch { errors.push(`${scope}-verification-unreadable`); continue; }
      if (evidence.exit_code !== 0 || !requiredText(evidence.executed_at) || evidence.key !== check.key || !requiredText(check.key)) errors.push(`${scope}-verification-failed-or-stale`);
      try { if (evidence.key !== evidenceKey(evidence)) errors.push(`${scope}-verification-key-invalid`); } catch { errors.push(`${scope}-verification-incomplete`); }
      if (check.command !== evidence.command || check.environment !== evidence.environment) errors.push(`${scope}-verification-context-changed`);
      try { for (const [ref, expected] of Object.entries(evidence.inputs)) if (digest(ref) !== expected) errors.push(`${scope}-verification-input-changed`); } catch { errors.push(`${scope}-verification-incomplete`); }
    }
  };
  for (const slice of state.slices ?? []) {
    if (slice.status !== 'completed' || !slice.acceptance_ids?.length) errors.push('slice-incomplete');
    for (const id of slice.acceptance_ids ?? []) covered.add(id);
    checkReview(slice, 'slice');
  }
  if ((ids ?? []).some(id => !covered.has(id))) errors.push('acceptance-not-covered');
  checkReview(state.overall, 'overall');
  return [...new Set(errors)];
}
