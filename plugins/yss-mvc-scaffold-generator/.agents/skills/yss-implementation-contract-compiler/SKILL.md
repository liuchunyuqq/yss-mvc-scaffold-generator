---
name: yss-implementation-contract-compiler
description: Use when a YSS vertical slice is entering implementation, spans multiple frontend/backend/API areas, needs implementation readiness checked, or requires a minimal YSS skill set, Slice Implementation Contract, TDD mode, evidence plan, or reroute decision.
---

## 默认项目执行策略

新建与恢复的 project-instance 任务使用 `docs/process/acceptance-policy.yaml` 与 `docs/process/acceptance-driven-development.md`：目标授权内连续执行，切片独立 Review、整体 Review 和相关验证闭环；仅需求歧义、冲突、范围扩张或必要外部信息缺失时提问。下文逐资产批准、ready-for-human、全候选打包和固定会签规则仅适用于 schema v1 历史记录；新任务使用 schema v2，validated 表示技术校验通过，不写或伪造 approval-record。模板源维护规则保持适用。

# YSS Implementation Contract Compiler

实现合同编译器把当前需求、垂直切片、capability 和窄 Recipe 编译为技术计划。新任务的计划校验通过使用 validated，编排器可直接安排实现；编译器不冒充用户批准，不写业务代码。

## 输入

先读 CONTEXT.md、需求验收条件、工程质量基线、切片、实现仓库和实际相关的接口/数据/页面约束。可自行补齐的技术输入自主分析；stale 先刷新并重编译，只有真正缺失外部事实或需求冲突才询问。不要为缺少旧批准记录阻塞。

## 编译循环

完整实现计划先消费项目 `docs/process/implementation-standards-context.md`：通过共享解析器编译工作单元适用规范，冻结 `resolution.applicable_standards` 与 `common.context_plan`。进入实现和恢复上下文时先校验并读取当前工作单元原文，不能仅凭 required_skills 名称声称已消费规范。

1. 判断 frontend/backend/API/data/domain/cross-repo 影响，并按 [compiler-contract.yaml](references/compiler-contract.yaml) 把 impact 映射为入口 capability；逐项填写 backend `component_impacts`。
2. 检查工程存在性和核心/长尾 skill 可用性。
3. 从 `docs/agents/yss-skill-registry.yaml` 选择一个或多个窄 Recipe，合并 `required_capabilities`；Recipe 不得直接引用 skill。
4. 由 capability 解析入口 skill，只递归 `context-required`；`context-conditional` 仅在显式 condition 命中时加载，其他依赖类型只进入原因链，不扩张执行上下文。
5. 按“Recipe 声明顺序 → 依赖拓扑 → skill ID”确定性排序，去重 skill 并保留全部原因；冻结 Registry 与编译器合同 SHA-256。
6. 为切片生成基线合同；为当前行为生成工作单元增量路由。
7. 选择 `behavior-tdd` 或 `controlled-generation`。
8. 新任务技术校验通过输出 validated；不足时返回可执行修复动作。持久化后由编排器直接计算就绪。旧 draft / ready-for-lifecycle-review 仅用于历史读取。

合同结构见 [slice-implementation-contract.md](references/slice-implementation-contract.md)，专项返回协议见 [yss-skill-execution-result.md](references/yss-skill-execution-result.md)。前端、后端和测试子任务必须由生命周期主控从批准的 Slice Contract 编译任务包；任务包 schema 为 `docs/process/schemas/subagent-task-package.schema.json`，技能列表必须来自 `taskPackageDefaults`，不能由编译器或执行 Agent 另行手写。

## 硬规则

- 编译器不得输出 `approved`、`ready-for-agent` 或 `completed`。
- Registry、Slice Contract 或编译器合同 schema v1 一律拒绝并给出迁移到 v2 的提示；不自动升级，不提供旧技能名兼容。
- `required_capabilities` 与 `required_skills` 必须同时冻结；Registry 或编译器摘要变化后合同立即 `stale`，重新编译并检查受影响验收条件后自主继续。
- UI 影响按验收需要形成可验证页面基线；真实交互歧义才提问。
- Repository/数据模型影响缺少数据架构时，不得路由持久化实现。
- 领域影响缺少批准且版本当前的 tactical-design contract 时，不得路由 Domain 实现；无领域影响必须记录 `not-applicable`。
- API 变化自主更新契约并验证消费者兼容性；半成品 backend 不得冒充稳定 source of truth。
- 后端端到端切片必须包含 Application；对象/POJO 影响按契约自动补 `mapstruct`、`lombok`、`alibaba-java-code-style`。
- Harness 内实现路径必须落在 `apps/backend/<project>/` 或 `apps/frontend/<project>/` 的具体项目目录；`apps/backend/`、`apps/frontend/` 只能作为容器，`app/backend/`、`app/frontend/` 及其子路径一律阻断。外部实现仓库使用其登记的真实项目根路径。`git-submodule` 使用 `implementation_path_policy: git-submodule-harness-apps`，空 gitlink、detached HEAD 或 `--force` 覆盖挂载点不得脚手架；`inspectWorkingTreeScope.writable` 必须为显式布尔值。
- 当前用户、缓存、审计、Excel、分布式 ID、请求校验、错误映射、加解密或网关韧性命中时，必须按 `compiler-contract.yaml` 的 `impact_to_capabilities` 补齐入口 capability；不能只在 `boundaries.md` 中提及。仅复用已经验证的平台认证 / 授权能力不算 component impact，不自动增加权限专项 skill。
- 业务行为使用 `behavior-tdd`；只有机械脚手架/生成物可用 `controlled-generation`，并记录例外和验证。
- 原型确认后若 backend `scaffold_status=required`，先由本编译器按 `scaffold_contract_schema` 编译 `yss-ddd-scaffold-generator` 的 `controlled-generation` 工作单元合同 draft；合同必须带 `contract_id`、`contract_version`、compiler draft、生命周期批准、持久化引用、允许写路径、预期证据和验证命令。经生命周期编排器批准并持久化后才能运行生成器，再由受控工作单元实际执行固定的 `./mvnw validate`、`./mvnw test`、`./mvnw package` 并记录逐条结果，随后加载 `yss-backend-scaffold-parent` 并重新编译业务合同；脚手架不承载业务行为。
- 脚手架合同在编译阶段只能是 `draft` / `ready-for-lifecycle-review` / `blocked`；只有生命周期编排器可以把已持久化脚手架合同标记为 `approved`。脚手架合同只覆盖业务代码前的工程骨架工作单元；生成、基线校验和合同重编译完成后，它不能替代脚手架后的 Slice Implementation Contract。
- 脚手架输出消费批准的脚手架合同；脚手架后的所有生成后端代码都必须绑定当前批准且版本当前的 Slice Implementation Contract、主 YSS skill、依赖闭包、允许写路径、预期证据和 YSS Skill Execution Result。打印命令、`./mvnw validate` 单项通过或脚手架成功不能替代合同批准；生成范围从机械内容变成业务行为时触发完整重路由。
- 专项结果中的越界路径、缺失证据、`drift`、`violation` 或 `new_impacts` 必须阻断或重路由。
- 前后端子任务必须使用同一 `contract_id/contract_version`，并在任务包中记录 `role_id`、`runtime_id`、`execution_state`、`allowed_write_paths`、`downstream_consumers` 和 `convergence_ref`；版本不一致或汇合引用缺失时输出 `blocked`。
- 长尾 skill 不可用时显式 `blocked`，不得用通用知识假装已应用 YSS 规范。

## 三级编译模式

- 切片基线编译：生成完整合同和技能闭包。
- 工作单元增量编译：绑定一个行为、主/辅 skills、TDD 模式、路径和证据。
- 完整重编译：API/schema、状态机、数据模型、仓库、写路径、skill、测试 seam 或架构约束发生实质变化时触发。实现中出现未冻结的新行为（包括明确的权限业务行为）统一写入 `new_impacts`，由生命周期按普通影响面重新分诊。

## 输出

输出合同草案、capability/Recipe 解析记录、技能依赖闭包、不适用理由、阻塞项、TDD 模式、工作单元、预期证据、验证命令、人工审查点、完整重路由触发器，以及建议的 `suggested_owner_role_id`（UI 影响 → `role.frontend-engineer`，后端影响 → `role.backend-engineer`，测试/审查 → `role.test-engineer`）。自然语言说明不能替代结构化合同字段。编译器不得自行批准合同、设置 `ready-for-agent` 或关闭会签门禁；owner 建议只供主控派活。
