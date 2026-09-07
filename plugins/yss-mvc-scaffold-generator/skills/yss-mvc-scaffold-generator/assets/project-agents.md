# AGENTS.md — MVC 项目开发入口

先读取 yss-project.yaml 与 CONTEXT.md。当前项目是独立 project-instance，项目根同时是 Maven 工程根和 Git 根。

## 执行策略

默认消费 docs/process/acceptance-policy.yaml 与 docs/process/acceptance-driven-development.md。用户给目标后自主分析、拆分和实现，每切片独立 Review，全部完成整体 Review 与集成验收。只有需求歧义、冲突、范围扩张或必要外部输入才询问开发者。普通改名、技术选择、修复和契约更新不申请批准。

新任务使用 checkpoint schema v2 和 validated 实现合同。通用资料中的逐资产会签、ready-for-human、强制候选打包仅用于 v1 历史记录，不作为新开发前置。不要伪造用户批准。

## 工程约束

- 按 yss-project.yaml 指向的 docs/process/mvc-governance-profile.yaml 选择六模块 MVC 后端规则；DDD 与前端技能不适用，不生成空产物。
- 共享技能位于 ../skillUtils/.agents/skills，平台投影由工具生成。有效能力注册表是 ../skillUtils/mvc-skill-registry.yaml。禁止在消费副本中维护技能。
- 首次使用或环境变化执行 npm run check-agent-environment 与 npm run verify-governance；工程验证使用项目 Maven Wrapper（Windows 用 mvnw.cmd）。开发中执行相关检查，交付执行必要集成构建，避免重复生命周期阶段。
- 依次按实际影响使用 yss-web-controller、yss-application、yss-repository、yss-mybatis、yss-dto、yss-exception。公开接口与 DTO 契约须一致，失败测试不能作为完成证据。
- 写入仅限当前目标授权的项目路径；前端另行登记仓库。稳定业务语言先维护 CONTEXT.md。Java 与文档遵守已登记工程基线。
- Git commit/push、部署和外部动作消费已有用户授权；未授权时保留工作区成果，不因未发布而阻塞开发验收。
