import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

// 允许新增文件，但已经存在的每一级路径必须仍在项目内。
export function projectPath(root, ref) {
  if (typeof ref !== 'string' || !ref || /[:*?\x00]/.test(ref) || path.isAbsolute(ref) || ref.split(/[\\/]/).includes('..')) throw Error(`非法路径 ${ref}`);
  const base = realpathSync(root);
  const target = path.resolve(base, ref);
  let ancestor = target;
  while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const actual = realpathSync(ancestor);
  if (actual !== base && !actual.startsWith(base + path.sep)) throw Error(`路径越界 ${ref}`);
  return target;
}

export function validateWritePaths(root, allowed, candidates = []) {
  const errors = [];
  const resolved = [];
  for (const ref of allowed ?? []) {
    try {
      const target = projectPath(root, ref);
      const first = ref.replaceAll('\\', '/').split('/')[0];
      if (!existsSync(target) && !existsSync(path.join(root, first))) throw Error(`路径父模块不存在 ${ref}`);
      resolved.push({ target, directory: existsSync(target) ? statSync(target).isDirectory() : !path.extname(target) });
    } catch (error) { errors.push(error.message); }
  }
  for (const ref of candidates) {
    try {
      const target = projectPath(root, ref);
      if (!resolved.some(p => p.target === target || (p.directory && target.startsWith(p.target + path.sep)))) errors.push(`候选路径超出合同 ${ref}`);
    } catch (error) { errors.push(error.message); }
  }
  return errors;
}

export function acceptanceIds(root, ref) {
  return [...new Set(readFileSync(projectPath(root, ref), 'utf8').match(/\bAC-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b/g) ?? [])];
}

export function validateTraceability(trace, { digest, checkIds, acceptanceIds: baseline }) {
  const errors = [];
  const text = v => typeof v === 'string' && v.trim().length > 0;
  const unique = (rows, key) => {
    const ids = (rows ?? []).map(row => row[key]);
    if (ids.some(id => !text(id)) || new Set(ids).size !== ids.length) errors.push(`追踪 ID 重复或为空: ${key}`);
    return ids;
  };
  if (trace?.schema_version !== 1) return ['需求追踪 schema 不支持'];
  const acs = trace.acceptance_ids ?? [];
  if (!acs.length || new Set(acs).size !== acs.length || acs.some(id => !baseline.includes(id)) || baseline.some(id => !acs.includes(id))) errors.push('验收目录未精确覆盖 Spec');
  const reqIds = unique(trace.requirements, 'requirement_id');
  const ruleIds = unique(trace.rules, 'rule_id');
  const scenarioIds = unique(trace.scenarios, 'scenario_id');
  const covered = new Set();
  const referenced = (ids, catalogue, label, required = true) => {
    if (!Array.isArray(ids) || (required && !ids.length) || ids.some(id => !catalogue.includes(id))) errors.push(`追踪引用缺失或悬空: ${label}`);
  };
  for (const req of trace.requirements ?? []) {
    const source = req.source ?? {};
    if (!text(source.ref) || !text(source.location) || !text(source.excerpt) || !['body','comment','user-supplement','template-fact','engineering-constraint'].includes(source.kind)) errors.push(`${req.requirement_id}: 来源定位不完整`);
    try { if (!source.digest || digest(source.ref) !== source.digest) errors.push(`${req.requirement_id}: 来源摘要过期`); } catch { errors.push(`${req.requirement_id}: 来源不可读`); }
    if (req.disposition === 'out-of-scope') { if (!text(req.reason)) errors.push(`${req.requirement_id}: 范围外项缺理由`); continue; }
    if (req.disposition !== 'in-scope') errors.push(`${req.requirement_id}: 需求尚未确定`);
    referenced(req.acceptance_ids, acs, req.requirement_id);
    referenced(req.rule_ids, ruleIds, req.requirement_id, false);
    referenced(req.scenario_ids, scenarioIds, req.requirement_id);
    for (const id of req.acceptance_ids ?? []) covered.add(id);
  }
  if (acs.some(id => !covered.has(id))) errors.push('验收缺少需求来源映射');
  for (const rule of trace.rules ?? []) {
    referenced(rule.requirement_ids, reqIds, rule.rule_id);
    referenced(rule.scenario_ids, scenarioIds, rule.rule_id);
    if (!['hard','soft'].includes(rule.severity) || ['location','condition','message','action','positive_example','negative_example'].some(k => !text(rule[k]))) errors.push(`${rule.rule_id}: 规则目录不完整`);
  }
  for (const scenario of trace.scenarios ?? []) {
    referenced(scenario.acceptance_ids, acs, scenario.scenario_id);
    referenced(scenario.check_ids, checkIds, scenario.scenario_id);
    if (['given','when','then'].some(k => !text(scenario[k]))) errors.push(`${scenario.scenario_id}: 场景不完整`);
  }
  for (const change of trace.changes ?? []) {
    if (!reqIds.includes(change.requirement_id) || ['before','after','reason','impact','review_ref'].some(k => !text(change[k]))) errors.push('验收语义变更缺少前后差异、影响或审查引用');
    else { try { if (!digest(change.review_ref)) errors.push('验收变更审查不可读'); } catch { errors.push('验收变更审查不可读'); } }
  }
  return errors;
}

// 内容检查只证明契约结构；运行时 wire shape 和业务语义由独立检查证明。
export function validateOpenApi(api) {
  const errors = [];
  const fail = (where, message) => errors.push(`OpenAPI ${where}: ${message}`);
  const resolve = (value, where, chain = new Set()) => {
    if (!value?.$ref) return value;
    const ref = value.$ref;
    if (!ref.startsWith('#/') || chain.has(ref)) { fail(where, '引用不可解析或循环'); return {}; }
    const next = ref.slice(2).split('/').reduce((a, k) => a?.[k.replaceAll('~1', '/').replaceAll('~0', '~')], api);
    if (!next) { fail(where, `悬空引用 ${ref}`); return {}; }
    return resolve(next, where, new Set([...chain, ref]));
  };
  const schema = (value, where, seen = new Set()) => {
    if (value?.$ref && seen.has(value.$ref)) return; // 递归模型合法，不能无限递归。
    const next = new Set(seen); if (value?.$ref) next.add(value.$ref);
    const s = resolve(value, where);
    if (!s || typeof s !== 'object' || !(s.type || s.$ref || s.allOf || s.oneOf || s.anyOf || s.enum)) { fail(where, '缺少具体 schema'); return; }
    if(s.type!==undefined && (Array.isArray(s.type)?s.type:[s.type]).some(t=>!['object','array','string','number','integer','boolean','null'].includes(t))) fail(where,'非法 schema type');
    if (s.nullable !== undefined && String(api.openapi).startsWith('3.1')) fail(where, '3.1 使用 type null，不使用 nullable');
    for (const name of s.required ?? []) if (!s.properties?.[name] && !s.allOf) fail(where, `required 引用不存在字段 ${name}`);
    if (s.type === 'array' && !s.items) fail(where, '数组缺少 items');
    if (s.items) schema(s.items, `${where}/items`, next);
    for (const [name, field] of Object.entries(s.properties ?? {})) schema(field, `${where}/${name}`, next);
    for (const kind of ['allOf', 'oneOf', 'anyOf']) for (const part of s[kind] ?? []) schema(part, where, next);
  };
  if (!/^3\.(0|1)\.\d+$/.test(api?.openapi ?? '')) fail('/', '不支持的版本');
  if (!api?.info?.title || !api?.info?.version || !Object.keys(api?.paths ?? {}).length) fail('/', '缺少 info 或 paths');
  for (const [url, raw] of Object.entries(api?.paths ?? {})) {
    const item = resolve(raw, url);
    for (const method of ['get','post','put','patch','delete','head','options','trace']) {
      if (!item?.[method]) continue;
      const op = item[method]; const where = `${method} ${url}`;
      const containsArray = (value, seen = new Set()) => {
        if (!value || typeof value !== 'object') return false;
        if (value.$ref) { if(seen.has(value.$ref)) return false; seen.add(value.$ref); return containsArray(resolve(value,where),seen); }
        return value.type==='array' || Object.values(value).some(v=>Array.isArray(v)?v.some(x=>containsArray(x,seen)):containsArray(v,seen));
      };
      const successResponses=Object.fromEntries(Object.entries(op.responses??{}).filter(([status])=>/^2\d\d$|^2XX$/.test(status)));
      if(containsArray(successResponses) && op['x-operation-kind']!=='mutation') {
        const query=op['x-query-contract'];
        if(!query || ['row_source','identity_source','permission','filter_sort_page_order'].some(k=>typeof query[k]!=='string'||!query[k].trim()) || !Object.keys(query.field_sources??{}).length || !Object.keys(query.missing_fact_defaults??{}).length || !query.scenario_ids?.length) fail(where,'列表缺少行来源、缺失事实默认值或身份场景的查询合同');
      }
      const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map(p => resolve(p, where));
      for (const name of [...url.matchAll(/\{([^}]+)\}/g)].map(m => m[1])) if (!params.some(p => p.in === 'path' && p.name === name && p.required === true)) fail(where, `缺少必填路径参数 ${name}`);
      for (const p of params) { if (p.in === 'path' && !url.includes(`{${p.name}}`)) fail(where, '多余路径参数'); schema(p.schema, where); }
      const body = resolve(op.requestBody, where);
      if (body) { if (!Object.keys(body.content ?? {}).length) fail(where, '请求缺少 content'); for (const v of Object.values(body.content ?? {})) schema(v.schema, where); }
      const responses = op.responses ?? {};
      if (!Object.keys(responses).some(k => /^2\d\d$|^2XX$/.test(k))) fail(where, '缺少成功响应');
      if (!Object.keys(responses).some(k => /^[45](\d\d|XX)$|^default$/.test(k))) fail(where, '缺少错误响应');
      for (const [status, rawResponse] of Object.entries(responses)) {
        const response = resolve(rawResponse, where);
        if (!response?.description) fail(where, `响应 ${status} 缺少 description`);
        if (['204','304'].includes(status) || method === 'head') continue;
        if (!Object.keys(response?.content ?? {}).length) fail(where, `响应 ${status} 缺少具体 schema`);
        for (const v of Object.values(response?.content ?? {})) schema(v.schema, `${where} ${status}`);
      }
    }
  }
  return errors;
}
