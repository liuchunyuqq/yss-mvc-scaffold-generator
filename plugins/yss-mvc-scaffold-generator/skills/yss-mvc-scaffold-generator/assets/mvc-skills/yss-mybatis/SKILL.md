---
name: yss-mybatis
description: 用于 YSS Java 8 MVC 后端固定六模块中的 yss-mybatis 实现、检查与排障。
---

# MVC MyBatis-Plus

本 Profile 固定 YSS MyBatis-Plus、Oracle 或 OceanBase Oracle。先查项目依赖和 yss-skill-source-index-refresh 定位的组件源码，确认实际基类、注解、分页机制和参数语义，不按框架名称猜测。

Mapper/XML 在 repository，数据库执行与 Mock 执行沿用 adapter seam。分页参数通过批准 DTO 与执行接口传递，不要求 Application Query Port / Infrastructure 分层。标准 CRUD 复用 MP；复杂查询使用 XML 与参数绑定，禁止拼接外部输入。主键 IdType.ASSIGN_ID。

核验 MapperScan、XML namespace/方法签名、结果映射、分页插件、数据源切换先于事务。Mock 不启用数据库 Bean，不以 Mock 通过代替真实 Mapper 注册和数据库查询证据。组件原始源码事实读取对应 source-index，不引入未验证的普通 MyBatis 替代方案。

## 实现合同

先读取项目 `CONTEXT.md`、`yss-project.yaml` 指向的 MVC Profile、当前工程和已批准且版本当前的 Slice Implementation Contract。仅适用于 `yss.mvc.backend`、Java 8、固定六模块。缺少实现前置条件时返回 blocked；不因环境恢复自动批准合同。

固定职责：server 装配与 HTTP，client 稳定 DTO，core 用例与执行 seam，repository 持久化，adapter 外部/数据库执行器，feign-client 远程客户端。以项目 POM 已有依赖方向为准；需要增加模块依赖时先更新工程合同，不能引入循环依赖。不得创建 DDD application/domain/infrastructure 模块或前端工程。

业务行为按 tdd 的 behavior-tdd 模式实现。按合同运行 Maven Wrapper、测试、格式检查及构建；输出 yss-skill-execution-result.yaml 与 fresh-verification.md，记录实际结果和未验证项。环境生成成功不等于业务完成。

早期 MVC 项目没有 governance_profile 时，先用本插件 restore_environment.mjs --check 验证 .yss/scaffold-generation.json 的生成器 ID、schema、project_instance、backend_root 和固定六模块。仅验证通过时使用工具包根的 mvc-governance-profile.yaml；这是基座 MVC Profile 的生成副本。已有项目 Profile 始终优先，不能覆盖或绕过不兼容声明。该兼容路径不修改业务项目文件。
