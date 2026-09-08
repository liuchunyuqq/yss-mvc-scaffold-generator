# MVC 运行期路由

业务开发必须按 docs/process/development-gate.md 维护实际 Spec、API/数据模型（命中时）、合同和 checkpoint；实现前调用 verify-development.mjs --mode implementation，完成前调用 --mode completion。Profile 或 package 成功不能替代业务验收，不得自行缩减为内存 Demo。

实现与 Review 的适用规范统一由项目 scripts/applicable-standards.mjs 解析，策略为 docs/process/applicable-standards.yaml；操作见 docs/process/implementation-standards-context.md。通用 orchestration 的 conditional_skills 列表只用于旧 v1，当前 MVC 以 Profile 和工作单元的真实影响解析，禁止从通用列表补入 DDD 或前端技能。

读取项目 CONTEXT.md、governance_profile 和 docs/process/acceptance-policy.yaml。新任务默认验收驱动：自主分析、实现、每切片独立 Review、整体 Review 和集成验收。共享 skill 中旧批准前置只用于 checkpoint v1 历史兼容；不写 approved 来绕过旧校验，新实现合同使用 validated。

有效能力与 Recipe 使用 ../skillUtils/mvc-skill-registry.yaml。仅加载六模块 MVC 后端技能，不加载 DDD、原型或前端技能，不生成 not-applicable 空产物。范围内新影响自动更新计划、合同和相关检查；真正超出用户目标时才澄清。

技能 digest 变化先检查依赖影响并重新编译当前合同，不能继续使用过期输入，也不为重编译请求批准。已有项目恢复只更新环境，治理升级使用 migrate_governance.mjs 的预览/应用入口。没有可确认的生成器身份时报告迁移诊断，不推测仓库身份。
