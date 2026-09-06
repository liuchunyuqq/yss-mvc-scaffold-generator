---
name: yss-web-controller
description: 用于 YSS Java 8 MVC 后端固定六模块中的 yss-web-controller 实现、检查与排障。
---

# MVC HTTP Controller

Controller 位于 `server/.../server/controller`，公开请求和响应 DTO 位于 `client` 现有包，调用 core 用例服务。先消费冻结 OpenAPI、已批准 Slice 合同、yss-dto wire profile、yss-validation 和命中的 yss-exception，不自行改变已有响应包装。

沿用当前工程使用的 javax validation 与构造器注入。校验请求 allowlist、分页、响应 Wrapper 和错误映射；主要 DTO 不写成 Controller 内部类。类和公开方法写简体中文 Javadoc，作者为真实 Git user.name，日期 yyyy/MM/dd HH:mm，按签名完整写 @param/@return。

不调用基座 DDD 的 generate_controller.mjs；该脚本的 Web Adapter 路径与生成合同不能用于本 MVC 工程。按已批准 seam 逐切片实现 Controller 并执行 HTTP 契约测试。需要机械批量生成时先提供 MVC 专属生成合同与验证过的生成器，不借用 DDD 脚本试跑。

## 实现合同

先读取项目 `CONTEXT.md`、`yss-project.yaml` 指向的 MVC Profile、当前工程和已批准且版本当前的 Slice Implementation Contract。仅适用于 `yss.mvc.backend`、Java 8、固定六模块。缺少实现前置条件时返回 blocked；不因环境恢复自动批准合同。

固定职责：server 装配与 HTTP，client 稳定 DTO，core 用例与执行 seam，repository 持久化，adapter 外部/数据库执行器，feign-client 远程客户端。以项目 POM 已有依赖方向为准；需要增加模块依赖时先更新工程合同，不能引入循环依赖。不得创建 DDD application/domain/infrastructure 模块或前端工程。

业务行为按 tdd 的 behavior-tdd 模式实现。按合同运行 Maven Wrapper、测试、格式检查及构建；输出 yss-skill-execution-result.yaml 与 fresh-verification.md，记录实际结果和未验证项。环境生成成功不等于业务完成。

早期 MVC 项目没有 governance_profile 时，先用本插件 restore_environment.mjs --check 验证 .yss/scaffold-generation.json 的生成器 ID、schema、project_instance、backend_root 和固定六模块。仅验证通过时使用工具包根的 mvc-governance-profile.yaml；这是基座 MVC Profile 的生成副本。已有项目 Profile 始终优先，不能覆盖或绕过不兼容声明。该兼容路径不修改业务项目文件。
