---
name: yss-application
description: 用于 YSS Java 8 MVC 后端固定六模块中的 yss-application 实现、检查与排障。
---

# MVC 用例服务

用例接口和编排位于 `core/.../core/service`，执行 seam 位于 `core/.../core/gateway`；沿用现有 `AnalysisQueryService` / `AnalysisQueryExecutor` 模式。core 可以依赖 client，不能依赖 Spring MVC、具体数据源或 Oracle 驱动。

通过构造器注入已有执行接口，由 server 装配 adapter 实现。事务边界按批准工程合同放在可控制实际数据库事务的位置；先确认依赖和代理，不机械地为纯 core 类添加 Spring 注解。涉及 DTO 转换时消费 mapstruct，POJO 样板按 lombok 和项目现有约定处理。

验收覆盖输入、空结果、分页、执行器失败和事务边界等实际命中行为。MVC 用例不要求 Domain Aggregate、Domain Service 或 target-domain-model。

## 实现合同

先读取项目 `CONTEXT.md`、`yss-project.yaml` 指向的 MVC Profile、当前工程和已批准且版本当前的 Slice Implementation Contract。仅适用于 `yss.mvc.backend`、Java 8、固定六模块。缺少实现前置条件时返回 blocked；不因环境恢复自动批准合同。

固定职责：server 装配与 HTTP，client 稳定 DTO，core 用例与执行 seam，repository 持久化，adapter 外部/数据库执行器，feign-client 远程客户端。以项目 POM 已有依赖方向为准；需要增加模块依赖时先更新工程合同，不能引入循环依赖。不得创建 DDD application/domain/infrastructure 模块或前端工程。

业务行为按 tdd 的 behavior-tdd 模式实现。按合同运行 Maven Wrapper、测试、格式检查及构建；输出 yss-skill-execution-result.yaml 与 fresh-verification.md，记录实际结果和未验证项。环境生成成功不等于业务完成。

早期 MVC 项目没有 governance_profile 时，先用本插件 restore_environment.mjs --check 验证 .yss/scaffold-generation.json 的生成器 ID、schema、project_instance、backend_root 和固定六模块。仅验证通过时使用工具包根的 mvc-governance-profile.yaml；这是基座 MVC Profile 的生成副本。已有项目 Profile 始终优先，不能覆盖或绕过不兼容声明。该兼容路径不修改业务项目文件。
