export const CHECK_TYPES = ['static','contract','unit','mock-integration','database-integration','review'];
export function validateVerificationPlan(contract, impacts = []) {
  const errors = [];
  const plan = contract.verification_plan;
  if (!Array.isArray(plan) || !plan.length) return ['缺少结构化 verification_plan；旧合同须补齐后恢复'];
  const ids = new Set();
  for (const check of plan) {
    if (!check.id || ids.has(check.id)) errors.push('检查 ID 为空或重复'); ids.add(check.id);
    if (!CHECK_TYPES.includes(check.type) || !Array.isArray(check.capabilities) || !check.capabilities.length) errors.push(`${check.id}: 检查类型或能力缺失`);
    if (typeof check.program !== 'string' || !check.program || !Array.isArray(check.args) || check.args.some(a => typeof a !== 'string')) errors.push(`${check.id}: 需要 program/args`);
    if (check.command !== [check.program,...(check.args??[])].join(' ')) errors.push(`${check.id}: command 必须如实表达 program/args`);
    if (!check.environment || !Array.isArray(check.input_paths) || !check.input_paths.length) errors.push(`${check.id}: 环境或输入范围缺失`);
    if (check.args?.some(a => /^-D(?:skipTests|maven\.test\.skip)(?:=true)?$/.test(a))) errors.push(`${check.id}: 不得跳过测试`);
    if (check.args?.some(a => /(?:password|token|secret)\s*=/i.test(a))) errors.push(`${check.id}: 敏感值不能写入命令`);
    if (/^(?:cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh(?:\.exe)?|sh|bash)$/i.test(check.program)) errors.push(`${check.id}: 禁止 shell 拼接入口`);
    if (!(contract.required_checks ?? []).includes(check.command)) errors.push(`${check.id}: 未进入必需检查链路`);
  }
  for (const command of contract.required_checks ?? []) if (!plan.some(c => c.command === command)) errors.push(`必需检查没有结构化定义 ${command}`);
  const needs = (type, capability) => { if (!plan.some(c => c.type === type && c.capabilities?.includes(capability))) errors.push(`缺少 ${type}/${capability} 检查，其他类型不可替代`); };
  if (impacts.some(i => ['persistence-impact','mybatis-framework-impact','data-impact'].includes(i))) {
    for (const cap of ['persistence','restart','transaction','non-mock-wiring']) needs('database-integration', cap);
    for (const key of ['entity','mapper','database_implementation','transaction','storage']) if (!contract.persistence_tasks?.[key]) errors.push(`持久化任务缺少 ${key}`);
  }
  if (impacts.some(i => ['web-adapter-impact','dto-wire-impact'].includes(i))) {
    needs('contract', 'http-wire');
    needs('contract', 'dto-schema');
  }
  return errors;
}
