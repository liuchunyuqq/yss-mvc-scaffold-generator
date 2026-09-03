---
name: data-analysis-java-implementation
description: 约束 YSS Java 8 数据分析后端的命名、注释、分层、MyBatis-Plus 持久层和测试实现；用于按表结构生成 CRUD 或分析功能。
---

# Data Analysis Java Implementation

用于数据分析项目业务实现。先读取项目级 `docs/engineering/data-analysis-java-conventions.md`（若存在），再读取现有同类模块。

## 硬性规则

- public 类、接口和方法必须有有信息量的简体中文 Javadoc；正文根据当前业务对象和行为生成，不使用通用占位文案。复杂判断、分页和 Oracle 特殊逻辑必须有代码块注释。
- Controller 类和公开接口方法的 Javadoc 使用当前实现者的 `git config --get user.name` 和生成时的 `@date yyyy/MM/dd HH:mm`；`@author` 不得为空或固定写成 `system`。方法的每个参数都必须有同名 `@param`，非 `void` 返回必须有表达业务结果的 `@return`。
- Controller Javadoc 必须是多行 block；业务说明、`@author`、`@date`、每个 `@param` 和 `@return` 各自独占一行。Mapping 注解、public 方法签名、方法体和 return 语句使用标准换行，不以单行压缩样式交付。
- 变量、参数和字段必须表达业务含义；禁止 `b`、`f`、`r`、`s`、`j`、`a`、`c`、`p`、`x`、`n` 作为业务对象或方法参数名称。
- 已知表结构使用明确的 Request、Response、PO/Entity 和 Domain 类型，不以 `Map<String,Object>` 代替核心模型。
- 数据库 CRUD 固定走 `Gateway -> MyBatis-Plus Mapper`；标准 CRUD 使用 MP 基类，复杂查询写入 `repository/src/main/resources/mapper/*.xml`。
- 自定义业务 SQL 只能写在 mapper.xml，使用参数绑定；Java 中禁止 SQL 字符串、`JdbcTemplate` 业务调用、`StringBuilder/StringJoiner` 拼接 SQL。
- PO 使用 `@TableName`、`@TableId(type = IdType.ASSIGN_ID)` 和显式字段映射；不得混用裸 MyBatis 与 MyBatis-Plus Repository 模型。
- 代码固定兼容 Java 8，不使用 record、`List.of`、`Map.of`、var、文本块、switch 表达式或 `jakarta.*`。
- schema、表名、列名和排序字段必须受控，不能来自用户输入。
- Mock 与 Oracle 共用 Controller、Application 和 Domain 契约，只替换持久化实现。
- Mock 和数据库 profile 并存时，Mock 执行器使用 `mock`，数据库执行器使用 `<database-profile> & !mock`；Mock 必须在 `bootstrap-mock.yml` 禁用 Nacos Discovery/Config，在 `application-mock.yml` 禁用 Leaf Segment/Snowflake，并显式排除 YSS MyBatis-Plus、Leaf 与 Spring DataSource 自动配置；MyBatis/DataSource/分布式 ID 基础设施隔离到 `!mock`，确保无 Nacos、无数据库环境可独立启动。

## 包结构合同

- `server`：启动类固定放在 `src/main/java/<base-package>/Application.java`；其余分别进入 `server/controller`、`server/configuration`、`server/advice`。
- `repository`：分别进入 `repository/entity`、`repository/mapper`、`repository/convertor`、`repository/gateway/impl`，XML 位于 `src/main/resources/mapper`。
- `core`：分别进入 `core/domain`、`core/gateway`、`core/service`。
- `client`：分别进入 `client/command`、`client/query`、`client/request`、`client/response`。
- `adapter`：分别进入 `adapter/mock`、`adapter/oracle` 或具体外部系统子包。
- 除启动类和 `package-info.java` 外，不在 Maven 模块的基础包中平铺业务类型。

## 格式门禁

- 一个 import 独占一行，类、字段、构造器和方法使用标准缩进与换行。
- 实现完成后必须执行 `node .agents/skills/data-analysis-java-implementation/scripts/verify_java_web_style.mjs --project-root .`；Javadoc 失败返回 `violation: smart-doc-javadoc-contract`，换行/压缩样式失败返回 `violation: java-format-contract`。
- 执行项目登记的 `com.coveo:fmt-maven-plugin:2.9.1:check`；修复时可显式运行 `format`，不将 format goal 绑定普通 Maven 生命周期以静默修改源码。
- API/Controller 变更必须显式执行 `com.ly.smart-doc:smart-doc-maven-plugin:3.0.5:openapi`；不在 POM 中增加 Smart-doc `executions`。完成证据包含命令退出码、`server/target/openapi` 输出及实现接口与冻结契约核对结果。
- 包结构检查失败返回 `violation: package-layout-contract`。

违反规则时返回 `violation: persistence-layer-contract`，不得宣布完成。
