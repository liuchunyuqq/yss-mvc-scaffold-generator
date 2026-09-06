---
name: yss-repository
description: 用于 YSS Java 8 MVC 后端固定六模块中的 yss-repository 实现、检查与排障。
---

# MVC 持久化

持久化模型、Mapper/Repository 和 XML 位于现有 `repository` 模块。实体字段来自批准的数据设计，使用 YSS MyBatis-Plus；标准 CRUD 使用既有 MP 基类，复杂 SQL 写 mapper.xml，主键策略 `IdType.ASSIGN_ID`。

读取 yss-mybatis、lombok；确有模型转换时读取 mapstruct。沿用已有 Mapper 扫描和 XML 资源路径，不新造 BaseRepository 抽象。数据库执行器通过已批准的依赖调用持久化组件；当前 adapter POM 未依赖 repository 时先登记依赖变更，不能让 core 反向依赖持久化。

用批准的字段和数据来源实现查询、绑定参数、分页和异常；不从 DDL 推导业务行为。此 MVC Profile 不要求 Domain Model、Domain GatewayImpl 或 Infrastructure 模块。非 Mock 集成验证应证明 Mapper Bean 注册；数据库条件不可用时记录阻塞，不能用 Mock 证明 SQL 正确。

## 实现合同

先读取项目 `CONTEXT.md`、`yss-project.yaml` 指向的 MVC Profile、当前工程和已批准且版本当前的 Slice Implementation Contract。仅适用于 `yss.mvc.backend`、Java 8、固定六模块。缺少实现前置条件时返回 blocked；不因环境恢复自动批准合同。

固定职责：server 装配与 HTTP，client 稳定 DTO，core 用例与执行 seam，repository 持久化，adapter 外部/数据库执行器，feign-client 远程客户端。以项目 POM 已有依赖方向为准；需要增加模块依赖时先更新工程合同，不能引入循环依赖。不得创建 DDD application/domain/infrastructure 模块或前端工程。

业务行为按 tdd 的 behavior-tdd 模式实现。按合同运行 Maven Wrapper、测试、格式检查及构建；输出 yss-skill-execution-result.yaml 与 fresh-verification.md，记录实际结果和未验证项。环境生成成功不等于业务完成。

早期 MVC 项目没有 governance_profile 时，先用本插件 restore_environment.mjs --check 验证 .yss/scaffold-generation.json 的生成器 ID、schema、project_instance、backend_root 和固定六模块。仅验证通过时使用工具包根的 mvc-governance-profile.yaml；这是基座 MVC Profile 的生成副本。已有项目 Profile 始终优先，不能覆盖或绕过不兼容声明。该兼容路径不修改业务项目文件。
