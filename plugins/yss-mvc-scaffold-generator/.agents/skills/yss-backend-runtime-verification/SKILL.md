---
name: yss-backend-runtime-verification
description: Use when a YSS Spring Boot backend change affects runtime profiles, Repository or Mapper registration, configuration-center loading, database drivers, external resources, startup context, or final package contents.
---

# YSS Backend Runtime Verification

验证 YSS 后端“编译通过之后”的运行态依赖闭包。仅在 Slice Contract 命中相关影响时使用；纯计算、无配置和无基础设施变化的切片不加载本 skill。

## 输入与边界

- 读取批准且版本当前的 Slice Implementation Contract、实现仓库登记、profile、数据源和外部依赖影响。
- 验证已有公开 seam，不发明业务行为，不把真实密码、Token 或完整敏感配置写入日志或证据。
- 环境不可用时不得伪造通过；记录 `seam-deferred` 的风险、责任人、后续 Ticket、验证计划和目标版本或发布日期。

## 风险驱动验证阶梯

按命中影响由快到慢执行；未命中的层级记录 `not-applicable` 及原因：

1. 编译和聚焦单元测试。
2. Mock 全量 `ApplicationContext`：检查被排除配置提供的所有构造器依赖是否都有替代 Bean。
3. 非 Mock 注册验证：检查 Repository/Mapper、`SqlSessionFactory` 和相关基础设施 Bean 的实际注册结果。
4. 真实数据库最小查询。
5. 命中的文件服务、配置中心、注册中心或其他外部依赖集成。
6. 全量测试、打包、文档生成和最终 JAR 内容检查。

每次失败只修复当前已证实根因，先重跑最小复现，再逐级回归。编译、Mock 上下文和真实运行分别证明不同结论，不能互相替代。

## Profile 与 Bean 闭包

- “排除数据库配置”不等于“应用可以无数据库启动”。列出被排除配置原本提供的 Bean，并为 Mock profile 提供最小、显式隔离的替身。
- 动态空代理只适合作为启动 seam。若声称 Mock 接口可用，替身必须提供明确、可预测的数据行为。
- 新增或移动 Repository/Mapper 后，至少证明一个真实 Bean 在非 Mock profile 中创建；命中数据库运行态影响时完成最小查询。

## 配置中心

- 按实际 `server-addr + namespace ID + group + dataId` 四元组核对；namespace 显示名称不能代替实际 ID。
- 控制台记录或截图只证明配置存在。加载成功必须由启动日志中的实际查询参数和目标配置进入 Spring `Environment` 的证据证明。
- 配置存在但应用仍读取默认值时，检查组件源码、配置属性类和消费时点，尤其是早期 BeanFactory/BeanDefinition 扩展；不要仅通过移动 `application*.yml` 与 `bootstrap.yml` 猜测修复。

## 数据库驱动与最终包

- 比较 POM 声明、effective dependency 和最终 Spring Boot JAR，不能只审查 POM 文本。
- Oracle 使用非 UTF-8/NLS 字符集或真实运行暴露字符集转换需求时，检查匹配驱动版本的 `com.oracle.database.nls:orai18n`；具体版本来自项目 dependency management 和实际驱动，不把单个项目版本写成通用常量。
- Oracle UTF-8 或未命中字符集影响时，`orai18n` 检查记录为 `not-applicable`。

## 证据输出

按统一 `YSS Skill Execution Result` 返回每个适用层级的命令、profile、退出码、执行时间和可读取日志引用，并区分：

- `context-started`
- `mock-behavior-verified`
- `repository-registered`
- `database-query-passed`
- `external-integration-passed`
- `package-contents-verified`

任一结论只能由对应证据声明。缺少适用证据时返回 `missing_evidence`；发现新 profile、基础设施、API 或数据影响时返回 `new_impacts` 并交 Router 重编译合同。
