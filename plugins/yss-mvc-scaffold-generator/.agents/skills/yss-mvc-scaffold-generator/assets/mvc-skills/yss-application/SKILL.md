---
name: yss-application
description: 用于 YSS Java 8 MVC 后端固定六模块中的 yss-application 实现、检查与排障。
---

# MVC 用例服务

用例接口和编排位于 `core/.../core/service`，执行 seam 位于 `core/.../core/gateway`；沿用现有 `AnalysisQueryService` / `AnalysisQueryExecutor` 模式。core 可以依赖 client，不能依赖 Spring MVC、具体数据源或 Oracle 驱动。

业务 Service 定义为接口，实现在 `service/impl/*ServiceImpl`，Controller 依赖接口。接口 Javadoc 说明用途、输入限制、返回语义和失败情况；Impl 说明关键规则、事务、副作用、并发和边界。规则注释关联实际 rule_id 与业务原因。不得用方法名翻译或空注释冒充语义说明；由 AST 检查缺失，由独立 Review 核对真实性。

通过构造器注入已有执行接口，由 server 装配 adapter 实现。事务边界按当前 validated 工程合同放在可控制实际数据库事务的位置；先检查依赖和代理，不机械地为纯 core 类添加 Spring 注解。涉及 DTO 转换时消费 mapstruct，POJO 样板按 lombok 和项目现有约定处理。

验收覆盖输入、空结果、分页、执行器失败和事务边界等实际命中行为。MVC 用例不要求 Domain Aggregate、Domain Service 或 target-domain-model。

## 实现合同

先读取项目 `CONTEXT.md`、`yss-project.yaml` 指向的 MVC Profile、当前工程和技术校验通过（validated）且版本当前的 Slice Implementation Contract。仅适用于 `yss.mvc.backend`、Java 8、固定六模块。按 docs/process/acceptance-policy.yaml 在目标授权内自主补齐技术输入和刷新合同，无需逐项批准。只有真实业务歧义或必要外部信息缺失才提问；环境恢复本身不证明业务验收通过。

固定职责：server 装配与 HTTP，client 稳定 DTO，core 用例与执行 seam，repository 持久化，adapter 外部/数据库执行器，feign-client 远程客户端。以项目 POM 已有依赖方向为准；需要增加模块依赖时先更新工程合同，不能引入循环依赖。不得创建 DDD application/domain/infrastructure 模块或前端工程。

业务行为按 tdd 的 behavior-tdd 模式实现。按合同运行 Maven Wrapper、测试、格式检查及构建；输出 yss-skill-execution-result.yaml 与 fresh-verification.md，记录实际结果和未验证项。环境生成成功不等于业务完成。

早期 MVC 项目没有 governance_profile 时，先用本插件 restore_environment.mjs --check 验证 .yss/scaffold-generation.json 的生成器 ID、schema、project_instance、backend_root 和固定六模块。仅验证通过时使用工具包根的 mvc-governance-profile.yaml；这是基座 MVC Profile 的生成副本。已有项目 Profile 始终优先，不能覆盖或绕过不兼容声明。该兼容路径不修改业务项目文件。


## Java 类型职责与包布局

实现前读取目标项目 `docs/process/mvc-package-layout.yaml`（MVC Profile 唯一机器规则源），按 `docs/process/mvc-package-layout.md` 登记并校验 `mvc_structure.type_layout`。新增、移动或修改 Java 类型须校验实际职责、包、模块与目录；allowed_write_paths 不构成布局豁免。恢复工作单元和独立 Review 使用相同规则及摘要。
