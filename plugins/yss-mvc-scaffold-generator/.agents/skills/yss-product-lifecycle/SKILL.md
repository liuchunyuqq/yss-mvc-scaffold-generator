---
name: yss-product-lifecycle
description: 围绕用户目标自主分析、拆分、实现、按切片与整体独立审查；仅需求歧义、冲突、授权范围或必要外部信息需要用户输入。
---

# YSS Product Lifecycle

先读 yss-project.yaml、CONTEXT.md、用户目标和已有资产。template-source 使用模板维护流程，不生成具体产品资产。project-instance 默认消费 docs/process/acceptance-policy.yaml 与 docs/process/acceptance-driven-development.md；阶段和技能身份仍由 lifecycle-registry.yaml 和 yss-skill-registry.yaml 提供。

## 连续执行合同

新任务按 `docs/process/implementation-standards-context.md` 在实现前生成共享规范上下文，按工作单元加载；checkpoint 带 `standards_context_version: 1` 和每切片规范/合同引用。恢复、工作单元切换和新增影响时先校验再读取原文。切片与整体 Review 绑定同一有效规范集合，不新增批准阶段。

1. 实现、修改、修复请求默认 orchestrate；方案和分析使用 route；审查使用 audit；恢复任务使用 resume。不把一次工作单元完成当成停止整个需求的理由。
2. 复用工程质量基线，给本需求明确验收 ID。按需维护 Spec、接口、数据约束和切片 Ticket；简单修复可只有一个切片，不生成空产物。分析资产不是人工批准点。
3. 使用 yss-implementation-contract-compiler 计算技能闭包、路径、依赖和相关验证。合同 validated 且当前、可读、无阻塞后直接实现；ready-for-agent 由事实计算，不先设置 ready-for-human。
4. 每个切片实现和相关验证后，使用 code-review 由独立实例审查。缺陷自动修复并针对性复查；通过后继续下一切片。Review 不写实现。
5. 全部切片完成后再次执行 overall Review 和集成验收，核对全部验收 ID、跨切片一致性、实际退出码、有效证据和开放问题。完成结论由 scripts/verify-lifecycle-checkpoint 的 schema v2 路径校验，不使用旧 approval-record。
6. 只有业务歧义、需求冲突、范围扩张或必要外部信息缺失才提问；提供具体问题和建议。等待时继续无依赖工作。工程决策、命名、修复、重编译和范围内计划更新自主执行。
7. stale 先刷新受影响输入；violation 自动修复；new_impacts / drift 在目标内更新计划和合同，超出目标才澄清。调用 scripts/acceptance-action.mjs 可确定下一动作。旧输入不能继续使用，机器失败不能被忽略。
8. 切片完成、阻塞、交接和交付时集中 checkpoint。验证按输入、命令和环境复用；局部修改不重复全量打包。部署和对外动作消费既有授权，不把开发完成强制接到发布批准。

## 状态与兼容

新需求先从实际资料整理包含稳定 AC ID 的 Spec，再执行 `node scripts/init-acceptance-checkpoint.mjs --goal "用户目标" --baseline docs/.scratch/<feature>/spec.md --output docs/.scratch/<feature>/checkpoint.yaml`。此入口计算真实摘要并生成 v2 字段，不自行拼装另一套结构；初始化通过不等于切片合同已准入。

`verify-lifecycle-checkpoint` 报字段、状态或摘要错误时，按 `docs/process/development-gate.md` 的恢复步骤修复后重验并继续。不得把自身记录错误作为需要用户处理的业务阻塞；也不得删除既有 slices、blockers、审查或验证记录来获得通过。

仅在读取 v1 Matt 兼容记录时，按 references/matt-yss-adapter.md 解释原调用边界：直接 ask-matt 不得写生命周期资产或改变门禁/Ticket 状态，任何写入前回交本编排器；user-invoked 技能不得自动调用它们或代替其创建正式资产，历史结果归一化为 Workflow Execution Result。旧记录中的自然语言意向不构成上述结构化 Git 授权。以上仅解释历史合同，新任务继续遵循本页 v2 连续执行合同及用户已有授权。

新记录使用 docs/process/templates/acceptance-checkpoint-template.yaml。scripts/lib/lifecycle-transition.mjs 的 v2 实现入口与 scripts/lib/acceptance-policy.mjs 是执行校验 seam。v1 状态、旧门禁与原会签规则只读兼容，详见 references/state-model.md 和 references/orchestration-contract.yaml。迁移从真实资产重建 v2，保留 legacy_ref，不把历史 approved 翻译成新验收通过。

前端影响仍消费 yss-ui 和实际界面、状态、交互验证；MVC 仅消费其 Profile 内后端技能。真实业务兼容性、允许路径、技能完整性和相关检查不因自主执行而省略。
