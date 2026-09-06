# MVC 运行期路由

本文件由 yss-mvc-scaffold-generator 的 MVC 环境清单生成，适用于 yss.mvc.backend。执行前读取业务项目的 CONTEXT.md 和 governance_profile。MVC 适配不修改基座 DDD 规范。

生命周期仍按项目 lifecycle-registry.yaml 和 MVC Profile 中的 required_work_units 执行 Spec、API 契约、工程基线、Ticket、批准、实现、验证与发布；Profile 列出的 DDD 战略建模、原型、前端工作单元不适用。不因父级通用文档引用这些阶段而生成 DDD 或前端资产。

合同编译先读取现有六模块、MVC Profile 和已批准契约；layer.application、layer.persistence、layer.web-adapter、framework.mybatis 对应本工具包内的 MVC 有效技能。只展开本 Profile 适用的依赖；layer.domain、architecture.tactical-domain 与前端 capability 不适用。普通业务术语或数据库变更不触发 DDD。若真实需求改变架构或新增前端，返回 new_impacts 并另行路由，不能加载未分发的技能或回退到 DDD 模板。

保留 Slice Implementation Contract 的批准、版本、允许路径、证据和 Ticket 就绪校验。模块路径由 MVC Profile 和项目 POM 提供，不采用 DDD 模块名。发生无法表达的 DDD 专属必填合同字段时返回 blocked 并报告具体字段，不伪造 Domain 资产。

共享组件 skill 的源码、DTO wire profile、错误码和 API 契约规则仍有效；仅 target-domain-model 条件内的规则不适用于 MVC。本目录为外部只读消费副本，修改源位于基座 MVC skill，不能在这里维护投影。

MVC capability、Recipe 和依赖闭包使用本工具包根的 `mvc-skill-registry.yaml`，它是基座注册表按 MVC 清单生成的投影；业务项目旧注册表不能重新引入排除项。编译合同绑定该有效注册表的 digest；已冻结合同绑定旧 digest 时按 stale 重新审查，不自动批准。普通 MVC 用例使用 backend.mvc-use-case，HTTP 和持久化分别使用 backend.http-api、backend.persistence-mybatis。

早期 MVC 项目没有 governance_profile 时，先用本插件 restore_environment.mjs --check 验证 .yss/scaffold-generation.json 的生成器 ID、schema、project_instance、backend_root 和固定六模块。仅验证通过时使用工具包根的 mvc-governance-profile.yaml；这是基座 MVC Profile 的生成副本。已有项目 Profile 始终优先，不能覆盖或绕过不兼容声明。该兼容路径不修改业务项目文件。

旧 MVC 项目说明中的 yss-router 由本有效注册表的 legacy alias 映射到 yss-implementation-contract-compiler；不生成旧名目录。旧 Slice schema 或冻结 digest 不兼容时仍需迁移审查，环境恢复不改变批准状态。
