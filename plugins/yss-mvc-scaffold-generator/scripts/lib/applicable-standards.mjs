import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseDocument } from '../vendor/yaml.mjs';
import { layoutPolicyRef, validateLayoutPlan } from './mvc-package-layout.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const digest = value => hash(JSON.stringify(sorted(value)));
const unique = values => [...new Set(values)].sort();
const policyRef = 'docs/process/applicable-standards.yaml';

function localFile(root, ref) {
  if (typeof ref !== 'string' || !ref || path.isAbsolute(ref) || ref.includes(':') || ref.includes('\\') || ref.split('/').includes('..')) throw Error(`非法规范引用: ${ref}`);
  const target = path.resolve(root, ref.split('#')[0]);
  const base = realpathSync(root);
  if (existsSync(target)) {
    const actual = realpathSync(target);
    if (!actual.startsWith(base + path.sep)) throw Error(`规范引用越界: ${ref}`);
  }
  return target;
}
function yaml(file) {
  const doc = parseDocument(readFileSync(file, 'utf8'), { uniqueKeys: true, maxAliasCount: 0 });
  if (doc.errors.length) throw Error(doc.errors[0].message);
  return doc.toJS();
}

export function standardsRoots(projectRoot) {
  const lockPath = path.join(projectRoot, 'skills-lock.json');
  const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : {};
  const environmentRoot = lock.distribution?.mode === 'sibling-directory'
    ? path.resolve(projectRoot, lock.distribution.skillUtilsDir) : projectRoot;
  return { projectRoot, skillRoot: path.join(environmentRoot, '.agents/skills') };
}

/** 解析引用与摘要，不把所有规范正文灌入模型上下文；相同输入供实现和独立 Review 使用。 */
export function resolveApplicableStandards(request, roots) {
  const { projectRoot, skillRoot } = roots;
  const policy = yaml(localFile(projectRoot, policyRef));
  if (policy.schema_version !== 1 || policy.policy_id !== 'applicable-standards-v1') throw Error('不兼容的适用规范策略');
  if (!request?.baseline_ref || !Array.isArray(request.work_units) || !request.work_units.length) throw Error('需要工程基线和工作单元');
  const identity = yaml(localFile(projectRoot, 'yss-project.yaml'));
  const profile = identity.governance_profile ? yaml(localFile(projectRoot, identity.governance_profile)) : {};
  const forbidden = new Set(profile.lifecycle?.routing?.forbidden_skills ?? []);
  const procedures = new Set(policy.review_procedure_skills);
  const sources = new Map();
  const add = (scope, ref, reason, unit, load) => {
    const key = `${scope}:${ref}`;
    if (!sources.has(key)) {
      const body = readFileSync(localFile(scope === 'project' ? projectRoot : skillRoot, ref));
      sources.set(key, { ref: key, digest: hash(body), reasons: [], work_units: [], load });
    }
    const entry = sources.get(key);
    entry.reasons = unique([...entry.reasons, reason]);
    entry.work_units = unique([...entry.work_units, unit]);
    if (load === 'required') entry.load = load;
    return key;
  };
  const ids = new Set();
  const plans = [];
  const selection = [];
  const layoutPlans = [];
  for (const unit of request.work_units) {
    if (!unit.id || ids.has(unit.id) || !Array.isArray(unit.required_skills) || !Array.isArray(unit.impacts)) throw Error('工作单元需要唯一 id、required_skills 和 impacts');
    ids.add(unit.id);
    if (profile.runtime_scope === 'backend-only' && unit.impacts.includes('ui_impact')) throw Error('MVC 后端不能消费 UI 影响');
    if (profile.domain_driven_design?.status === 'not-applicable' && unit.impacts.includes('domain-impact')) throw Error('MVC 不适用 DDD 影响');
    const skills = new Map();
    const select = (skill, reason) => {
      if (!/^[a-z0-9-]+$/.test(skill)) throw Error(`非法 skill: ${skill}`);
      if (forbidden.has(skill)) throw Error(`Profile 禁止 skill: ${skill}`);
      if (procedures.has(skill)) return;
      skills.set(skill, unique([...(skills.get(skill) ?? []), reason]));
    };
    for (const skill of unit.required_skills) select(skill, 'contract-required-skill');
    for (const impact of unique(unit.impacts)) {
      // 未配置专项标准的业务影响仍由 required_skills 与基线覆盖，不推测新规范。
      for (const skill of policy.impact_skills[impact] ?? []) select(skill, impact);
    }
    selection.push({ id: unit.id, skills: [...skills].sort(([a], [b]) => a.localeCompare(b)) });
    const required = [];
    const onDemand = [];
    if (identity.governance_profile === 'docs/process/mvc-governance-profile.yaml') {
      required.push(add('project', layoutPolicyRef, 'mvc-structure-baseline', unit.id, 'required'));
      required.push(add('project', '.yss/scaffold-generation.json', 'mvc-base-package', unit.id, 'required'));
      if (unit.contract_ref) {
        const contract = yaml(localFile(projectRoot, unit.contract_ref));
        const check = validateLayoutPlan(projectRoot, contract);
        if (check.errors.length) throw Error(check.errors.join('; '));
        // 合同嵌入规范 bundle：只冻结布局子合同，避免全文摘要产生自引用循环。
        layoutPlans.push({work_unit:unit.id, contract_ref:unit.contract_ref, digest:digest({mvc_structure:contract.mvc_structure, allowed_write_paths:contract.allowed_write_paths})});
        required.push(`project:${unit.contract_ref}`);
      }
    }
    for (const ref of unique(['CONTEXT.md', request.baseline_ref, ...(request.context_refs ?? [])])) required.push(add('project', ref, 'baseline-or-context', unit.id, 'required'));
    for (const ref of policy.repository_standards) if (existsSync(localFile(projectRoot, ref))) required.push(add('project', ref, 'repository-standard', unit.id, 'required'));
    for (const [skill, reasons] of [...skills].sort(([a], [b]) => a.localeCompare(b))) {
      const ref = `${skill}/SKILL.md`;
      for (const reason of reasons) required.push(add('skills', ref, reason, unit.id, 'required'));
      const body = readFileSync(localFile(skillRoot, ref), 'utf8');
      // 索引直接引用的正文/机器合同，支持本 skill 与带 skill ID 的跨技能引用。
      for (const match of body.matchAll(/(?:[a-z0-9-]+\/)?references\/[A-Za-z0-9_./-]+\.(?:md|yaml|json)(?:#[A-Za-z0-9_-]+)?/g)) {
        const linked = match[0].startsWith('references/') ? `${skill}/${match[0]}` : match[0];
        if (forbidden.has(linked.split('/')[0])) throw Error(`Profile 禁止 reference: ${linked}`);
        onDemand.push(add('skills', linked, `reference:${skill}`, unit.id, 'on-demand'));
      }
    }
    for (const ref of unit.reference_refs ?? []) {
      const match = /^(project|skills):(.+)$/.exec(ref);
      if (!match) throw Error(`reference_refs 必须有 project: 或 skills: 前缀: ${ref}`);
      onDemand.push(add(match[1], match[2], 'explicit-specialist-reference', unit.id, 'on-demand'));
    }
    plans.push({ work_unit: unit.id, required_context_refs: unique(required), on_demand_context_refs: unique(onDemand) });
  }
  const result = {
    schema_version: 1,
    policy_id: policy.policy_id,
    request,
    ...(layoutPlans.length ? {layout_plans:layoutPlans} : {}),
    // 冻结实际选择结果；无关规则、未选 skill 的变化不使本任务失效。
    selection_digest: digest({ selection, profile }),
    sources: [...sources.values()].sort((a, b) => a.ref.localeCompare(b.ref)),
    context_plan: {
      work_units: plans,
      context_stop_rule: 'minimal-sufficient-evidence',
      missing_context_action: 'refresh-or-block',
      reload_when: ['work-unit-changed', 'context-resumed', 'applicable-source-changed', 'impact-expanded', 'java-file-added-or-moved', 'java-package-or-role-changed']
    }
  };
  return { ...result, digest: digest(result) };
}

export function verifyApplicableStandards(bundle, roots) {
  if (bundle?.schema_version !== 1 || !bundle.digest) return { freshness: 'stale', reasons: ['standards-context-required'] };
  const { digest: expected, ...body } = bundle;
  if (digest(body) !== expected) return { freshness: 'stale', reasons: ['standards-context-tampered'] };
  try {
    const current = resolveApplicableStandards(bundle.request, roots);
    return { freshness: current.digest === expected ? 'current' : 'stale', reasons: current.digest === expected ? [] : ['applicable-standards-changed'] };
  } catch (error) { return { freshness: 'stale', reasons: [error.message] }; }
}

export function contextForWorkUnit(bundle, workUnit, roots) {
  const check = verifyApplicableStandards(bundle, roots);
  if (check.freshness !== 'current') throw Error(check.reasons.join('; '));
  const plan = bundle.context_plan.work_units.find(unit => unit.work_unit === workUnit);
  if (!plan) throw Error(`未登记的工作单元: ${workUnit}`);
  const identity = yaml(localFile(roots.projectRoot, 'yss-project.yaml'));
  if (identity.governance_profile === 'docs/process/mvc-governance-profile.yaml' && !bundle.request.work_units.find(u => u.id === workUnit)?.contract_ref) throw Error('MVC 工作单元恢复需要 contract_ref 和有效布局计划');
  return { standards_digest: bundle.digest, ...plan };
}
