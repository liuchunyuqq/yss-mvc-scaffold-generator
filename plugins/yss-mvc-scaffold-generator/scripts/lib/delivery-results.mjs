export const DELIVERY_LAYERS=['files','build','production-assembly','external-integration','deployment'];
const types={files:['static'],build:['build'], 'production-assembly':['production-assembly'], 'external-integration':['database-integration','external-integration'],deployment:['deployment']};

// 显式通过必须绑定对应能力的真实回执；用户放行不会改变执行结果。
export function deliveryResults(state, verify) {
  const errors=[], results={};
  for(const name of Object.keys(state.delivery??{})) if(!DELIVERY_LAYERS.includes(name))errors.push(`未知交付层 ${name}`);
  for(const layer of DELIVERY_LAYERS) {
    const item=state.delivery?.[layer]??{status:'not-run',reason:'未登记本层验证；不能由其他层推断'};
    results[layer]=item;
    if(!['passed','failed','not-run','deferred'].includes(item.status)) errors.push(`${layer}: 非法结果`);
    if(item.status==='passed') {
      if(!item.check_ids?.length) errors.push(`${layer}: 缺少检查绑定`);
      for(const id of item.check_ids??[]) {
        const definition=state.overall?.verification_plan?.find(c=>c.id===id);
        const recorded=state.overall?.checks?.find(c=>c.command===definition?.command);
        if(!definition||!recorded||!types[layer].includes(definition.type)||!definition.capabilities?.includes(layer)) errors.push(`${layer}: 检查不能证明本层 ${id}`);
        else errors.push(...verify(definition,recorded).map(e=>`${layer}: ${e}`));
      }
    } else if(typeof item.reason!=='string'||!item.reason.trim()) errors.push(`${layer}: 未通过项需要原因与恢复说明`);
  }
  return {results,errors};
}
