# 业务开发准入与验收

新任务使用现有 checkpoint schema v2 和规范上下文版本 1。脚手架初始化不创建虚构需求、数据模型或完成记录；收到业务目标后由生命周期编排器建立 docs/.scratch/<feature>/ 下的 Spec、切片合同、规范上下文和 checkpoint。

实现前执行 `node scripts/verify-development.mjs --mode implementation --checkpoint docs/.scratch/<feature>/checkpoint.yaml`。交付前执行同一命令的 `--mode completion`。缺少 checkpoint 不得跳过；旧 checkpoint 的只读查看仍使用 verify-lifecycle-checkpoint，恢复实现需补齐真实上下文。

每个 validated 合同增加 artifacts 对象：spec 为需求与验收条件文件；web-adapter-impact 或 dto-wire-impact 必须有 openapi；persistence-impact、mybatis-framework-impact 或 data-impact 必须有 data_model。这些引用必须同时进入 standards-request 的 context_refs，绑定实际文件摘要。数据模型须描述实体、字段、关系、唯一性、历史和持久化策略；DTO 不能替代数据模型。不存在对应影响时不生成空产物。

合同的 required_checks 为本切片必需命令数组；完成记录中的 checks 必须逐项覆盖。整体 checks 必须覆盖 implementation-repo-registry 中当前工程的 verification_commands。命令和环境应在执行前登记为本机实际可用形式，包括 Windows mvnw.cmd 与必要的外部 settings 参数；不得将 -DskipTests package 登记为集成验收。实际退出码、输入摘要、时间和独立 Review 沿用现有证据协议。

Java 后端检查包括 `node scripts/verify-java-web.mjs`、Maven Wrapper `fmt:check` 和包含测试的 `package`，公开契约还需对应 HTTP 测试。格式化工具不能证明 Javadoc、MVC 分层或业务语义正确；Java Web 检查是补充静态检查，独立审查仍需核对参数、返回值与真实行为。

失败应修复并复验，不能删验收条件、缩减为 Demo 或将外部执行结果写死为成功。缺少必要外部输入时明确记录阻塞并继续独立工作。CLI 能拒绝缺少证据的完成态，不能阻止不调用工具的 Agent 发出自然语言声明；编排器必须以验收入口结果作为完成依据。
