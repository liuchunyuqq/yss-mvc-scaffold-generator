# AGENTS.md — AI 开发入口规则

> 本文件只保存 Agent 必须首先遵守的仓库身份路由、硬门禁和禁止事项。完整生命周期、流程裁剪和 YSS 实现细则以下文引用的权威资产为准。


## 默认项目执行策略

新建与恢复的 project-instance 任务使用 `docs/process/acceptance-policy.yaml` 与 `docs/process/acceptance-driven-development.md`：目标授权内连续执行，切片独立 Review、整体 Review 和相关验证闭环；仅需求歧义、冲突、范围扩张或必要外部信息缺失时提问。下文逐资产批准、ready-for-human、全候选打包和固定会签规则仅适用于 schema v1 历史记录；新任务使用 schema v2，validated 表示技术校验通过，不写或伪造 approval-record。模板源维护规则保持适用。

## 1. 首先识别仓库身份

每个任务开始时先读取根目录 `yss-project.yaml`：

- `repository_mode: template-source`：使用“模板维护流程”，不默认生成具体产品的 Spec、原型、OpenAPI 或垂直切片 Ticket。
- `repository_mode: project-instance`：按产品研发生命周期分诊任务。
- 文件缺失、schema 版本不支持或模式值非法时，停止路由并执行迁移检查；不根据目录、Git 远程或占位符猜测身份。

仓库身份契约由根目录 `yss-project.yaml` 和本文件共同声明。

## 2. 单一事实来源

| 事实类型                    | 权威资产                                        |
| ----------------------- | ------------------------------------------- |
| 领域与流程词汇                 | `CONTEXT.md`                                |
| Agent 入口、硬门禁、禁止事项       | `AGENTS.md`                                 |
| 主阶段、门禁、产物、工作单元、证据和稳定 ID | `docs/process/lifecycle-registry.yaml`；`docs/process/lifecycle-artifact-map.md` 为派生阅读视图 |
| 默认项目执行策略 | `docs/process/acceptance-policy.yaml`；解释见 `docs/process/acceptance-driven-development.md` |
| 影响面触发与 `not-applicable` | `docs/process/harness-process-tailoring.md` |
| 模板维护强度触发与最低等级 | `docs/process/maintenance-intensity.yaml` |
| 技能清单、来源、版本、哈希和投影目标      | `skills-lock.json`                          |
| 技能分层、别名、默认可发现性和运行时入口 | `docs/agents/yss-skill-registry.yaml`（当前 `status: active`；实现合同编译器 / 生命周期必须消费） |
| 数字人角色、阶段协作组、运行时绑定与生命周期会签 | `docs/agents/digital-human-roles.yaml`；`docs/agents/digital-human-roles.md` 为操作说明 |
| 视觉令牌与组件视觉变体规范 | 根目录 `DESIGN.md`；`docs/design/design.md` 为中文治理与生命周期适配，`docs/design/tokens/*` 为派生快照 |

README、用户指南、根目录 `CLAUDE.md` 和其他说明文档只引用或解释上述事实，不重复定义同一规则。`CLAUDE.md` 是 Claude Code 入口指针，不是第二套 Agent 规则。

## 3. 标准文档语言与规范语汇

- 所有面向业务、产品、架构、实施、审查、发布和复盘的落地文档，正文统一使用简体中文。
- 英文专有名词、代码标识、API 路径、schema、类名、方法名、枚举值、错误码、命令、文件名和协议 metadata 保持原样。
- 新流程统一使用 Spec、Ticket、`to-spec`、`to-tickets`。过时术语和技能名只能出现在迁移指南或明确标注的旧项目上下文。
- `CONTEXT.md` 是 Spec 构建及其落地工具链的统一语言输入，也是所有会创建或修改稳定业务、产品、架构、实施、审查、发布和复盘资产的强制前置上下文。`yss-product-lifecycle`、其原生 work unit，以及 `grill-with-docs`、`to-spec`、`to-tickets`、`implement` 等显式兼容入口，在规划、起草、评审、拆 Ticket 或实现前都必须读取并持续消费它；工具无法读取或消费时必须暂停并返回 `blocked`，不得凭临场翻译、同义词或局部上下文继续。
- 稳定业务术语必须先在 `CONTEXT.md` 中登记 PascalCase `英文标识`，再进入 Spec、原型、契约、Ticket、代码或验证资产；代码类型 / 字段与契约 property 使用该词干按 `CONTEXT.md` 文首规则变形。改中文术语或英文标识都先回写 `CONTEXT.md`，并重新检查受影响资产；与词汇或 ADR 冲突时立即指出并先解决冲突。

## 4. `template-source` 模板维护路由

按“影响面 → 单一事实来源 → 投影 / 派生资产 → 分级证据”维护。强度分级、最低证据和 checkpoint 合同见 `docs/process/harness-process-tailoring.md`。

- 创建、修改或退役 skill 时使用 `maintaining-skills`，并先按 `docs/process/harness-process-tailoring.md` 判定 L1 / L2 / L3；L3 日常记录维护者自检与 fresh verification，正式发布前执行完整模板门禁。
- `.agents/skills` 是跨 Agent 共享技能的权威内容；`.claude/skills`、`.codex/skills`、`.cursor/skills`、`.pi/skills`、`.qoder/skills`、`.trae/skills` 中的共享技能是生成投影，禁止分别手工修改。Cursor 的契约运行时入口是 `.cursor/skills`；不得把 canonical `.agents/skills` 与某个平台投影当作同权双入口。
- 模板维护默认以 `scripts/verify-template-fast` 完成 `implementation-ready`；显式晋级审查时用 `scripts/verify-template-candidate`，首次冻结前和最终发布前仍必须执行完整 `scripts/verify-template`。后者是不可裁剪的模板发布阻断门禁。模板与外部 `create-yss-spec` 的跨仓库契约未完成集成验证时，不得声称可发布。

## 5. project-instance 验收驱动开发

默认策略为 docs/process/acceptance-policy.yaml，完整解释见 docs/process/acceptance-driven-development.md。阶段、工作单元和技能身份继续引用 lifecycle-registry.yaml；旧门禁只用于 schema v1 历史记录，不作为新任务的逐阶段放行点。

用户要求开发或修复时，由 yss-product-lifecycle 自主推进：提取验收条件 → 按需分析、维护 Spec / API / 数据约束和拆分切片 → 实现与相关验证 → 每切片独立 Review 和自动修复 → 整体 Review 与集成验收。小改动可以只有一个切片，不生成空文档。技术决策、命名、测试 seam、修复和目标范围内的契约更新无需批准。

只有业务歧义、需求冲突、范围扩张或必要外部信息缺失才提问。解释具体分歧并给推荐方案；等待时继续无依赖工作。新增影响先判断范围，stale 先刷新，不使用过期输入，也不把工程诊断转为审批。

## 6. Ticket 与验收状态

需求验收条件使用稳定 ID，复用项目工程质量基线。切片记录目标范围、验收 ID、依赖、实施者、相关检查和审查引用。没有未解决依赖且技术合同已 validated 的切片可直接 ready-for-agent；ready-for-human 只用于实际需要用户处理的事项。

新 checkpoint 使用 schema v2，由 scripts/verify-lifecycle-checkpoint 校验。completed 必须具备每切片与整体的独立 Review、完整验收覆盖、基线和代码摘要、成功且当前的验证证据，无未关闭缺陷。v1 历史状态只读兼容，迁移保留 legacy_ref，不把旧批准当成新验收通过。

## 7. 实现与工程边界

实现前消费 docs/process/implementation-repo-integration.md 与已登记仓库事实；缺失工程时按用户授权目标生成骨架。yss-implementation-contract-compiler 编译适用技能、路径、接口与数据约束、测试和依赖，技术校验通过后自主执行。禁止伪造 approved 来兼容旧入口。

UI 影响保留实际页面、交互、状态与必要视觉验证；API 与数据变更保留兼容性和契约验证；MVC 使用其治理 Profile，不加载 DDD 或前端专属要求。前端优先 pnpm，后端优先 Maven Wrapper，缺少工具时记录实际例外。环境检查在首次使用或环境变化触发，开发中运行相关检查，交付时运行必要集成验证，不重复已覆盖的构建阶段。

## 8. 专项任务的强制入口

本表补充跨阶段的触发型技能；主阶段对应的原生工作单元和条件技能以第 5 节、`yss-product-lifecycle` 及 `orchestration-contract.yaml` 为准。

| 触发情形 | 必须使用 |
|---|---|
| 技术事实、标准、第三方 API 或框架行为影响决策，或外部证据进入领域战略 / 阶段决策 | `yss-research`；技术事实使用 `technical-evidence`，战略决策证据使用 `strategy-evidence`；旧名 `research` 仅为 deprecated alias |
| 竞品、市场或用户口碑事实 | `competitive-intelligence` |
| UI 设计、原型、组件或主题 | `yss-prototype-stage` 持有阶段合同：`yss-design-system` → 低保真 / 状态矩阵 → 独立 `prototype-review` → 确定性选择 H1 视觉或 H2 流程 → 档位适配器 → 浏览器 / 统一 Design QA / 无障碍验证。`yss-antd-design` 仅用于相关 H2；原型阶段不得调用 `yss-ui`。真实 YSS/AntDV 组件与 lockfile 事实只在前端实现计划、已批准切片的实现和实现还原验证中消费 |
| Bug、测试失败或性能回退 | `diagnosing-bugs` 建立可复现反馈，再用 `tdd` |
| merge / rebase 冲突 | `resolving-merge-conflicts` |
| 架构治理、难测模块或深模块设计 | `codebase-design`；`improve-codebase-architecture` 仅作为用户显式兼容入口 |
| 跨线程、跨仓库、上下文过长或原型结论回流 | `handoff` 或等价交接记录 |
| 数字人角色、Agent 运行时协同或生命周期会签 | 先读 `docs/agents/digital-human-roles.yaml`。职称实例叠加在编排器上，不另起生命周期，不批准 Slice 合同、不设 `ready-for-agent`、不宣布可发布 |
| 本地知识库 init / refresh / rebuild，或要把研究结果落成持久 wiki | `llm-wiki`（落成持久 wiki 用 `ingest`；已映射 live 源变了用 `refresh`）。`template-source` 的 wiki-root 为 `.template-source/wiki`；`project-instance` 不附带源仓库编译树，需要时在仓库根 `wiki/` 执行 `init` |

业务行为默认按 `tdd` 的 `behavior-tdd` 模式使用已确认的公开 seam 逐切片实现。一次性生成、纯配置或流程文档不适用代码 TDD 时，必须记录例外理由和可执行验证方式。

## 9. 工作区与实现仓库边界

当前仓库默认是研发管理仓库，运行时代码优先位于已登记的独立实现仓库（`repository_scope: external-repository`）。只有用户明确选择当前仓库承载实现代码时，才使用同源的 `apps/backend/<project>/` 或 `apps/frontend/<project>/`（`harness-apps`），或以 Git submodule 把独立实现仓挂到同一 `apps/` 布局（`git-submodule`）。三种 scope 必须用登记字段、Git 身份和工作树 gitlink 区分；空 gitlink、detached HEAD 或 `--force` 覆盖挂载点不得当成普通目录。

`apps/backend/` 和 `apps/frontend/` 只是项目容器；`app/backend/`、`app/frontend/` 及其子路径禁止作为工程输出。`git-submodule` 不得登记为 `harness-apps`，也不得把实现源码复制进 Harness。完整登记字段、嵌套 Git 授权和跨仓约束见 `docs/process/implementation-repo-integration.md`。

## 10. 独立审查、验证和追踪

- 实现者不能承担命中的独立审查（含数字人）。模板维护的 L3 日常路径使用维护者自检；L2 仍按需使用聚焦独立审查，正式发布仍执行完整模板门禁。模板发布、代码切片和高风险变更仍必须满足各自独立审查要求。产品切片与模板维护共用同一 finding 闭环：`violation` 由实现者在原合同路径修复后重新捕获并全轴复审；`drift` / `new_impacts` 使合同 `stale` 并回 实现合同编译器。审查者不得写实现。命中后的 mandatory 不得豁免；未命中才 `not-applicable`。
- 任何“完成 / 可合并 / 可发布”结论必须基于 fresh verification，不接受“之前跑过”或实现者自述。
- 旧会签记录按 `scripts/verify-approval-record` 只读核验；新任务的切片与整体验收不逐资产会签。开发完成与部署、对外商务承诺分开，外部动作消费已有用户授权。
- 在会签暂停、handoff、进入实现、合并或发布边界集中同步范围、验证证据、风险、会签点、Ticket 状态和下一步；阻塞、责任人变化或资产单独批准时立即同步。
- Git checkpoint 只包含本轮明确范围；获得用户授权后才提交或推送。
- 发布后或阶段性完成后做复盘判断；出现架构返工、验证返工、IMPORTANT / CRITICAL review finding 或人工确认延期时，落简体中文复盘并修订权威资产。

## 11. Subagent 协同

使用 subagent 或其它 Agent 运行时前按 `docs/process/subagent-collaboration.md` 定义任务包和不重叠的写入范围，并同时写明数字人角色、`runtime_id`、从角色表复制的 `core_skills` / `forbidden_skills` 与 Explorer / Drafter / Worker / Reviewer / Verifier 执行态。实现者不担任独立审查者；仓库身份、Ticket 最终状态、Git checkpoint、Slice 合同批准和完成结论仍由主控数字人按编排器规则决定。会签恢复前校验 `scripts/verify-approval-record`。写隔离靠任务包；共享工作区不是默认沙箱。

## 12. 测试质量基线

模板推荐值为 Domain / Application `>= 90%`、API `>= 80%`、前端组件 `>= 75%`、已明确的关键流程 `100% E2E`。只有项目实例在测试策略中明确采纳或覆盖后才构成 CI 门禁；未定义关键流程清单时，不声称其 E2E 覆盖率达到 100%。
