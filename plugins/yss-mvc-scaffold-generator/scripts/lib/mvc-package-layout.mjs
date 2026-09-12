import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseDocument } from '../vendor/yaml.mjs';
import { projectPath, validateWritePaths } from './contract-integrity.mjs';
import { validateJsonSchema } from './json-schema.mjs';

export const layoutPolicyRef = 'docs/process/mvc-package-layout.yaml';
export const hashLayout = bytes => createHash('sha256').update(bytes).digest('hex');
const javaName = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const readYaml = file => {
  const doc = parseDocument(readFileSync(file, 'utf8'), { uniqueKeys: true, maxAliasCount: 0 });
  if (doc.errors.length) throw Error(doc.errors[0].message);
  return doc.toJS({ maxAliasCount: 0 });
};
export function isMvcProject(root) {
  const ref = path.join(root, 'yss-project.yaml');
  if (!existsSync(ref)) return false;
  return readYaml(ref).governance_profile === 'docs/process/mvc-governance-profile.yaml';
}
export function loadPackageLayout(root, policyRoot = root) {
  const bytes = readFileSync(projectPath(policyRoot, layoutPolicyRef));
  const policy = readYaml(projectPath(policyRoot, layoutPolicyRef));
  if (policy.schema_version !== 1 || policy.policy_id !== 'yss.mvc.package-layout' || !Number.isInteger(policy.policy_version) || policy.policy_version < 1 || !Array.isArray(policy.rules) || !policy.rules.length) throw Error('mvc.layout.policy: 不兼容规则源');
  if (policy.base_package_source !== '.yss/scaffold-generation.json#base_package') throw Error('mvc.layout.policy: 不支持的基础包来源');
  const basePackage = readYaml(projectPath(root, '.yss/scaffold-generation.json')).base_package;
  if (typeof basePackage !== 'string' || !javaName.test(basePackage)) throw Error('mvc.layout.base-package: 需要脚手架权威 base_package 配置');
  const ids = new Set(), roles = new Set();
  for (const rule of policy.rules) {
    if (!/^mvc\.layout\.[a-z-]+$/.test(rule.rule_id) || ids.has(rule.rule_id) || roles.has(rule.role) || !policy.modules.includes(rule.module) || ![...(rule.prefixes ?? []), ...(rule.exact ?? [])].length) throw Error('mvc.layout.policy: 非法或重复规则');
    for (const pkg of [...(rule.prefixes ?? []), ...(rule.exact ?? []), ...(rule.excluded_prefixes ?? [])]) if (!javaName.test(pkg) && !(pkg === '' && rule.role === 'application' && rule.exact?.includes(pkg))) throw Error('mvc.layout.policy: 非法包模式');
    ids.add(rule.rule_id); roles.add(rule.role);
  }
  return { ...policy, basePackage, digest: hashLayout(bytes) };
}
const expected = (rule, policy) => [...(rule.prefixes ?? []).map(p => `${policy.basePackage}.${p}[.<feature>]`), ...(rule.exact ?? []).map(p => policy.basePackage + (p ? '.'+p : ''))];
function allowedPackage(pkg, rule, policy) {
  const under = prefix => pkg === `${policy.basePackage}.${prefix}` || pkg.startsWith(`${policy.basePackage}.${prefix}.`);
  return javaName.test(pkg ?? '') && !(rule.excluded_prefixes ?? []).some(under) && ((rule.prefixes ?? []).some(under) || (rule.exact ?? []).some(p => pkg === policy.basePackage + (p ? '.'+p : '')));
}
function diagnostic(rule, row, policy, reason) {
  return `${rule?.rule_id ?? 'mvc.layout.plan'}: file=${row.path ?? row.file ?? '?'} role=${row.role ?? '?'} package=${row.package ?? '?'} expected=${rule ? expected(rule, policy).join('|') : '明确职责及布局计划'} reason=${reason}`;
}
export function validateLayoutPlan(root, contract, policy = loadPackageLayout(root), { historical = false } = {}) {
  const plan = contract.mvc_structure?.type_layout;
  if (!plan && historical) return { compatibility: 'legacy-readable', compliant: false, errors: [] };
  const errors = [];
  if (!plan || plan.schema_version !== 1 || !Array.isArray(plan.types)) return { compatibility: 'migration-required', compliant: false, errors: ['mvc.layout.plan: 当前任务需要结构化 type_layout，历史 validated 不替代校验'] };
  try { validateJsonSchema(plan, fileURLToPath(new URL('../../docs/process/schemas/mvc-type-layout.schema.json', import.meta.url)), {label:'MVC type_layout'}); }
  catch (e) { return {compatibility:'invalid', compliant:false, errors:[`mvc.layout.plan: ${e.message}`]}; }
  if (plan.policy_id !== policy.policy_id || plan.policy_version !== policy.policy_version || plan.policy_digest !== policy.digest) errors.push('mvc.layout.policy: 布局计划规则版本或摘要已过期');
  if (plan.exceptions || contract.mvc_structure?.package_exceptions) errors.push('mvc.layout.plan: 切片不得声明目录豁免');
  const seen = new Set();
  for (const row of plan.types) {
    const rule = policy.rules.find(r => r.role === row.role);
    if (!row.type || !javaName.test(row.type) || seen.has(row.type) || typeof row.feature !== 'string' || !row.feature.trim()) errors.push(diagnostic(rule, row, policy, '类型重复或缺少类型/业务分类'));
    seen.add(row.type);
    if (!rule || row.rule_id !== rule.rule_id || row.module !== rule.module || !allowedPackage(row.package, rule, policy)) errors.push(diagnostic(rule, row, policy, '职责、模块或包不符合工程基线'));
    const relType = row.type?.startsWith(row.package + '.') ? row.type.slice(row.package.length + 1) : '';
    const sourcePrefix = `${row.module}/src/main/java/${String(row.package).replaceAll('.', '/')}/`;
    if (!row.path?.startsWith(sourcePrefix) || !/^[\w$]+\.java$/.test(row.path.slice(sourcePrefix.length)) || !relType || !javaName.test(relType)) errors.push(diagnostic(rule, row, policy, '模块、Java package、类型和目标路径不一致'));
    if (row.path !== sourcePrefix + (row.source_type ?? relType.split('.')[0]) + '.java') errors.push(diagnostic(rule, row, policy, '文件名须对应主类型；其他顶层类型须显式 source_type'));
    // 一个文件允许多个顶层或成员类型；文件名不能代替实际 AST 类型身份。
    errors.push(...validateWritePaths(root, contract.allowed_write_paths, [row.path]));
  }
  for (const name of [...(contract.mvc_structure?.production_types ?? []), ...(contract.mvc_structure?.entity_types ?? []), ...(contract.mvc_structure?.mapper_types ?? [])]) if (!seen.has(name)) errors.push(`mvc.layout.plan: 已声明实现类型缺少布局 ${name}`);
  return { compatibility: 'current', compliant: !errors.length, errors };
}

/** 无 Java 依赖加载：解析 import 和本项目继承/元注解图，未决类型留给合同语义。 */
export function identifyRoles(type, classes, policy) {
  const byName = new Map(classes.map(c => [c.name, c]));
  const resolve = (owner, raw) => {
    const name = raw.replace(/<.*$/, '').replace(/\[\]$/, '').trim();
    let scope = owner.owner;
    while (scope && scope !== owner.package && scope.startsWith(owner.package + '.')) {
      if (byName.has(`${scope}.${name}`)) return [`${scope}.${name}`];
      scope = scope.slice(0, scope.lastIndexOf('.'));
    }
    if (name.includes('.')) {
      const first = name.split('.')[0];
      return [name, `${owner.package}.${name}`, ...owner.imports.filter(i => i.endsWith('.'+first)).map(i => i+name.slice(first.length)), ...owner.imports.filter(i => i.endsWith('.*')).map(i => i.slice(0,-1)+name)];
    }
    const explicit = owner.imports.filter(i => !i.endsWith('.*') && i.endsWith('.' + name));
    if (explicit.length) return explicit;
    if (byName.has(`${owner.package}.${name}`)) return [`${owner.package}.${name}`];
    return [`${owner.package}.${name}`, ...owner.imports.filter(i => i.endsWith('.*')).map(i => i.slice(0, -1) + name)];
  };
  const annotations = (owner, names, visited = new Set()) => names.flatMap(n => resolve(owner, n).flatMap(fq => {
    if (visited.has(fq)) return [fq];
    const local = byName.get(fq);
    return [fq, ...(local ? annotations(local, local.annotationTypes ?? [], new Set([...visited, fq])) : [])];
  }));
  const signal = (owner, seen = new Set()) => {
    if (seen.has(owner.name)) return { annotations: [], methods: [], fields: [], bases: [] };
    seen.add(owner.name);
    const result = { annotations: annotations(owner, owner.annotationTypes ?? []), methods: annotations(owner, owner.methods.flatMap(m => m.annotationTypes ?? [])), fields: annotations(owner, owner.fields.flatMap(f => f.annotationTypes ?? [])), bases: [] };
    for (const base of [owner.extends, ...owner.interfaces].filter(Boolean)) for (const fq of resolve(owner, base)) {
      result.bases.push(fq);
      const local = byName.get(fq);
      if (local) { const inherited = signal(local, seen); for (const key of Object.keys(result)) result[key].push(...inherited[key]); }
    }
    return result;
  };
  const signals = signal(type);
  let rules = policy.rules.filter(rule => (rule.annotations ?? []).some(a => signals.annotations.includes(a)) || (rule.method_annotations ?? []).some(a => signals.methods.includes(a)) || (rule.field_annotations ?? []).some(a => signals.fields.includes(a)) || (rule.bases ?? []).some(b => signals.bases.includes(b)));
  // Configuration 是多模块职责；只在模块合法时选择对应规则，越界仍产生诊断。
  if (rules.some(r => ['application', 'security'].includes(r.role))) rules = rules.filter(r => !['configuration','adapter-configuration','feign-configuration'].includes(r.role));
  const configs = rules.filter(r => r.role.endsWith('configuration'));
  if (configs.length) rules = [...rules.filter(r => !r.role.endsWith('configuration')), configs.find(r => r.module === type.module) ?? configs[0]];
  if (rules.some(r => r.role === 'advice')) rules = rules.filter(r => r.role !== 'controller');
  return [...new Set(rules.map(r => r.role))];
}

export function changedJavaFiles(root) {
  const git = args => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) throw Error(`mvc.layout.scope: 无法读取实际 Git 变化: ${result.stderr}`);
    return result.stdout.split('\0').filter(Boolean);
  };
  const files = [...git(['diff', '--name-only', '-z']), ...git(['diff', '--cached', '--name-only', '-z']), ...git(['ls-files', '--others', '--exclude-standard', '-z'])];
  return [...new Set(files)].filter(f => f.includes('/src/main/java/') && f.endsWith('.java'));
}

export function checkPackageLayout(root, classes, contract, { policy = loadPackageLayout(root), files, audit = false } = {}) {
  const errors = audit ? [] : validateLayoutPlan(root, contract, policy).errors;
  const plan = contract.mvc_structure?.type_layout?.types ?? [];
  const scaffoldRef = projectPath(root, 'docs/process/mvc-scaffold-layout.json');
  const scaffold = existsSync(scaffoldRef) ? readYaml(scaffoldRef) : {};
  const scope = audit ? null : new Set(files ?? changedJavaFiles(root));
  const candidates = classes.map(c => ({ ...c, path: path.relative(root, c.file).replaceAll('\\', '/'), module: path.relative(root, c.file).split(path.sep)[0] }));
  const scanned = candidates.filter(c => !scope || scope.has(c.path) || plan.some(p => p.type === c.name || p.path === c.path));
  for (const c of scanned) {
    const registered = plan.find(p => p.type === c.name && p.path === c.path);
    const hint = scaffold.policy_digest === policy.digest ? scaffold.types?.find(p => p.type === c.name && p.path === c.path && p.source_digest === hashLayout(readFileSync(c.file))) : undefined;
    const row = registered ?? (audit ? hint : undefined);
    const roles = identifyRoles(c, candidates, policy);
    const actual = { ...c, role: roles.join(',') || row?.role || 'unknown' };
    if (path.posix.dirname(c.path) !== `${c.module}/src/main/java/${c.package?.replaceAll('.', '/')}`) errors.push(diagnostic(null, actual, policy, 'Java package 与实际源文件目录不一致'));
    if (!audit && !registered) errors.push(diagnostic(null, actual, policy, '实际新增或修改类型未登记；不能用清单遗漏绕过'));
    if (row && (row.package !== c.package || row.module !== c.module)) errors.push(diagnostic(null, actual, policy, '实际类型偏离布局计划'));
    if (row && roles.length && !roles.includes(row.role)) errors.push(diagnostic(null, actual, policy, `合同职责 ${row.role} 与真实职责冲突`));
    const chosen = [...new Set([...roles, ...(row ? [row.role] : [])])];
    if (row?.role === 'application' && !roles.includes('application')) errors.push(diagnostic(policy.rules.find(r => r.role === 'application'), actual, policy, '启动入口例外需要 SpringBootApplication 语义，不能仅由合同自报'));
    if (!chosen.length) errors.push(diagnostic(null, actual, policy, '需明确职责：语法信号不足，补充受审查的类型布局计划'));
    for (const role of chosen) {
      const rule = policy.rules.find(r => r.role === role);
      if (!rule || rule.module !== c.module || !allowedPackage(c.package, rule, policy) || (rule.kind && rule.kind !== c.kind)) errors.push(diagnostic(rule, { ...actual, role }, policy, '实际类型职责、包或 Maven 模块不符合规则'));
    }
  }
  if (!audit) for (const row of plan) if (!candidates.some(c => c.name === row.type && c.path === row.path)) errors.push(diagnostic(policy.rules.find(r => r.role === row.role), row, policy, '计划类型不存在'));
  return [...new Set(errors)];
}

export function mergeLayoutTypes(contracts) {
  const rows = new Map(), errors = [];
  const canonical = row => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b]) => a.localeCompare(b))));
  for (const row of contracts.flatMap(c => c.mvc_structure?.type_layout?.types ?? [])) {
    if (rows.has(row.type) && canonical(rows.get(row.type)) !== canonical(row)) errors.push(`mvc.layout.plan: 跨切片类型布局冲突 ${row.type}`);
    rows.set(row.type,row);
  }
  return {types:[...rows.values()], errors};
}
