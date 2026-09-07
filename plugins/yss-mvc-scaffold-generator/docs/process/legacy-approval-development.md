# 旧版批准流程（只读兼容）

仅用于解释 checkpoint schema v1 历史资产；新任务不得创建此流程的批准记录。

## 5. `project-instance` 产品研发路由

先用 `docs/process/harness-process-tailoring.md` 判定变更类型、影响面和最近可信阶段，再按 `docs/process/lifecycle-registry.yaml` 执行命中的工作单元和条件门禁。

下表是与 `yss-product-lifecycle` 对齐的阶段级导航索引；阶段、工作单元、技能和门禁不是同一层，条件细节以注册表及 lifecycle skill references 为准。

| 主阶段（registry） | 原生工作单元 | 技能入口（按影响面裁剪） | 关键产物 / 门禁 |
|---|---|---|---|
| 入口分诊 `stage.entry-triage` | `work-unit.entry-triage` | `yss-product-lifecycle` | 仓库身份、影响面、最近可信阶段；`gate.repository-identity-valid` |
| Discovery `stage.discovery` | `work-unit.discovery-opportunity`、`work-unit.discovery-requirements`、`work-unit.domain-strategy-design`、`work-unit.stage-decision` | `yss-product-lifecycle`；按事实 / 领域影响使用 `competitive-intelligence`、`yss-research`、`grilling`、`domain-modeling`、`yss-stage-decision` | Discovery、用户/MVP/非目标/成功标准、测试 seam；必要时 DDD 战略设计与阶段决策包；`gate.domain-strategy-approved`、`gate.stage-decision-package-approved` |
| Spec / 功能架构 `stage.spec-architecture` | `work-unit.spec-synthesis` | `yss-product-lifecycle`；`to-spec` 仅为显式兼容入口 | Spec、产品总体设计、功能架构；必要时 Spec Delta；`gate.spec-baseline-approved` |
| 产品设计 `stage.product-design` | `work-unit.prototype-design` | `yss-prototype-stage` 为主合同：`yss-design-system` → 低保真 / 状态矩阵 → 独立 `prototype-review` → H1/H2 档位路由 → 档位适配器 → 浏览器 / Design QA / 无障碍验证；`yss-antd-design` 只用于相关 H2，原型阶段禁止调用生产实现技能 `yss-ui` | 交互说明、低保真、状态矩阵、原型交付物；`gate.prototype-reviewed`、`gate.prototype-verified`、`gate.user-confirmation` |
| 系统 / 数据架构与工程契约 `stage.system-data-engineering` | `work-unit.technical-analysis` | `yss-implementation-contract-compiler`；按影响使用 `yss-openapi-governance`、`yss-openapi-draft-review`、`codebase-design`、`implementation-repo-onboarding`、`yss-tactical-design` | OpenAPI Draft / Freeze、数据架构、工程基线、架构审查；无 API 影响记录；必要时 Tactical DDD Check；`gate.openapi-draft-reviewed`、`gate.design-reviewed`、`gate.openapi-frozen`、`gate.engineering-baseline-accepted`、`gate.architecture-reviewed` |
| Ticket 正式化 `stage.ticket-formalization` | `work-unit.ticket-decomposition` | `yss-product-lifecycle` + `yss-implementation-contract-compiler`；`to-tickets` 仅为显式兼容入口 | 功能父 Ticket、垂直切片、Slice Implementation Contract；切片初始 `ready-for-human`；`gate.slice-contract-approved`、`gate.slice-ready-for-agent` |
| 垂直切片实现 `stage.vertical-slice-implementation` | `work-unit.slice-implementation` | `yss-implementation-contract-compiler` + `tdd`；UI 影响追加 `yss-ui`、`yss-page-module-development` 及条件专项 skill；`implement` 仅为显式兼容入口 | 前后端代码、TDD、YSS Skill Execution Result；仅允许 `ready-for-agent` 且合同当前 |
| 验证 / 发布 / 复盘 `stage.verification-release-retrospective` | `work-unit.frontend-implementation-verification`、`work-unit.code-review`、`work-unit.release-and-retrospective` | `code-review`（唯一入口，Standards 消费 YSS / Alibaba 专项检查输入）；UI 影响追加 `yss-ui` + `yss-design-system`；发布 / 复盘由 `yss-product-lifecycle` 持有 | 不可变候选快照、独立审查、findings 按合同分流、fresh verification、发布 / 回滚证据、复盘；UI 影响追加 `gate.frontend-implementation-verified`；`gate.release-ready` |

- 生命周期注册表中的条件门禁全部按影响面强制。命中触发条件时必须完成；未命中时只记录 `not-applicable` 及原因，不生成空文档；不得把产物、工作单元或证据统称为门禁。
- 安全 / 权限不设独立生命周期资料或专属门禁。日常功能不做额外登记、`not-applicable` 或推导校验；只有需求或冻结资产明确要求改变认证、授权、租户隔离、敏感数据或合规行为时，才把该行为写入普通 Spec、API、架构、验收和测试 seam，并仅按实际 UI、API、Backend、Data、High-risk 影响触发既有门禁。普通 action 注册、沿用既有认证中间件、未变化的 `401` / `403`、一般字段、SQL / DDL / 迁移和上传 / 下载本身不构成安全 / 权限专项。
- `seam-deferred` 只能显式记录风险、责任人、后续 Ticket、验证计划和目标版本或发布日期。
- 新功能或较大变更先进入 `yss-product-lifecycle` 的原生 Discovery / 需求分析工作单元；`grill-with-docs` 与 `to-spec` 仅作为用户显式兼容入口，Spec 基线和产品设计影响的完整判定以注册表和裁剪规则为准。
- API 契约变更先形成 OpenAPI 3.1 Draft，经必要的工程基线、系统 / 数据架构和设计审查后 Freeze，再进入实现。
- Spec Delta 只记录相对既有冻结 Spec 基线的高风险行为差异；全新产品、全新模块和低风险调整不生成 Spec Delta。
- OpenAPI Freeze 或无 API 影响记录完成后，由生命周期原生 Ticket 正式化工作单元拆成可独立验证的窄垂直切片；用户显式 `to-tickets` 仅作为兼容入口，禁止只按 Adapter / Application / Domain / Infrastructure 横向拆分。

## 6. Ticket 与状态

- 每个功能先建立功能父 Ticket，用于汇总 Spec、设计、审查、OpenAPI Freeze、阻塞项和阶段证据。
- Spec 初稿、产品设计、原型、OpenAPI Draft 和待冻结资产使用 `ready-for-human`。
- 只有通过必要门禁、阻塞边已清除并具备直接实现条件的垂直切片 Ticket，才能使用 `ready-for-agent`。
- Ticket、Spec 和阶段证据按 `docs/agents/issue-tracker.md` 选定的主 tracker 持久化；Git remote 不代表 tracker 选择，平台不可用时按该文档生成待发布草案。五态标签见 `docs/agents/triage-labels.md`。

## 7. 实现与 YSS 路由硬门禁

进入实现时先读 `docs/process/implementation-repo-integration.md`，登记实现仓库、项目根、分支、CI、验证命令和回滚点；再使用 `yss-implementation-contract-compiler` 编译最小 skill 集合与当前实现合同。

- 无可复用工程时，先确认外部目标仓库或输出目录，再使用 `yss-ddd-scaffold-generator` / `yss-frontend-scaffold-generator`；当前仓库缺少 frontend / backend 目录不改变此路由。
- 脚手架只在 `scaffold_status=required` 且受控生成合同已持久化、获得生命周期批准后运行；它只产生机械骨架，业务行为回到 实现合同编译器 并使用 `behavior-tdd`。
- 正式垂直切片必须消费已批准、已持久化且版本当前的 Slice Implementation Contract。实现合同编译器 只生成草案，不批准合同、不设置 `ready-for-agent`、不宣布完成。合同 schema、Backend 子合同和证据字段以 `yss-implementation-contract-compiler` references 为准。
- UI 影响切片必须在 `ready-for-agent` 前具备通过校验的 `frontend_implementation_plan`，实现完成后补齐 `frontend_implementation_verification`；截图 / 视觉回归、状态与交互、console warning 和实际 `pnpm` 退出码均须有证据，不能只做 type-check 或声称“已对齐”。
- 前端测试、type-check 与构建优先使用 `pnpm`；后端校验、测试与编译优先使用项目根 `./mvnw`。不要默认 `npm` / `yarn` 或裸 `mvn`。既有仓库确实没有 pnpm 或 Maven Wrapper 时，必须记录受控例外和实际命令。登记字段见 `docs/process/implementation-repo-integration.md`。
- 路径越界、证据缺失、未执行验证、`drift`、`violation` 或 `new_impacts` 时停止实现并重新路由。

实现细则由已批准合同、YSS skills 和实现接入文档定义；`AGENTS.md` 只保留入口与边界。

