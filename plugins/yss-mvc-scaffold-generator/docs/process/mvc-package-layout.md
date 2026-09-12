# MVC Java 类型职责与包布局

唯一规则正文为 `docs/process/mvc-package-layout.yaml`，属于 MVC Profile 的固定工程基线。六模块技能引用该文件，不在各技能复制规则。基础包读取 `.yss/scaffold-generation.json` 的 `base_package`；缺失或非法时阻断，不能按目录或 groupId 猜测。

## 实现合同

现有合同 `mvc_structure.type_layout` 使用 `docs/process/schemas/mvc-type-layout.schema.json`。包含 schema_version、policy_id、policy_version、policy_digest（规则文件原始字节 SHA-256）、types。每个类型登记 type（完整类型名）、module、feature（业务分类）、role、package、path、rule_id。一个文件多顶层类型时，非主类型用 source_type 指定文件主类型；成员类型使用完整外部类型名。无需生成空包。

例如基础包为 `com.example` 时，controller 的目标包可为 `com.example.server.controller.orders`，路径为 `server/src/main/java/com/example/server/controller/orders/OrderEndpoint.java`，rule_id 为 `mvc.layout.controller`。`server.orders` 不合法。allowed_write_paths 只决定写入范围，不能豁免工程规则。Slice 不允许 exceptions；需要扩充职责或兼容目录时，在受控规则源维护带理由与范围的版本，重新生成摘要、校验并独立审查。

`node scripts/verify-mvc-structure.mjs --contract <合同> --plan-only` 可在编码前校验布局设计；`verify-implementation` 也调用同一校验器。合同自填 validated 不作为通过依据。

## 结构校验与恢复

必需静态检查的 argv 固定为 `scripts/verify-mvc-structure.mjs --contract <合同>`。审计、历史解析和 plan-only 不能作为完成检查。它扫描实际生产 Java AST，覆盖 Git 工作区、暂存区、未跟踪文件以及合同计划；完成门禁额外从已有签名基线计算实际变化，跨切片合并布局并检测冲突。删除文件不强迫生成代码，移走的类型需更新新布局；所有实际新增或修改类型都应登记。

多切片开发时，在本切片开始前使用既有 `scripts/capture-governance-baseline.mjs` 捕获签名快照，把返回引用写入 `mvc_structure.baseline_snapshot_ref`；有明确排除项时，`baseline_exclusions` 必须与捕获参数完全一致。正式 AST 根据该快照的实际字节变化及当前计划检查，不会把先前已完成但未提交切片的代码强行要求登记到本片。快照不能在切片实现后重捕获来规避遗漏；完成门禁仍从需求初始的整体签名基线检查所有切片合并范围。单片没有快照时回退到 Git 实际变化；不得以手填 changed_files 指定范围。

注解、方法/字段注解、本项目继承和元注解图用于识别真实职责，包括改名后的 Controller、实体、Mapper。JDK AST 解析不加载业务代码或第三方依赖，不等同于 javac 类型检查。第三方自定义父类、DTO 的输入输出方向及普通 Processor 等信号不足时，给出“需明确职责”，由合同语义和独立 Review 明确；禁止默认落入通用包。静态检查不能替代真实 Maven 编译。

新生成样例附 `mvc-scaffold-layout.json`，其语义提示仅在源码和规则摘要仍一致的全量审计中生效，不豁免开发变更登记。

MVC 每个工作单元始终加载规则，不依赖 impacts 标签。准备规范上下文时，在 work_units 中登记 contract_ref。开发门禁要求该引用与切片合同相同；恢复执行 `node scripts/applicable-standards.mjs --input <bundle.json> --check --work-unit <id>`，重新校验当前合同布局。新增/移动文件、package 或职责变化时更新合同与规范 bundle。规则和基础包摘要自动进入检查输入，变化使旧证据失效；阅读记录不替代检查。

## 历史与升级

`--historical --contract <合同>` 只读解析旧合同并返回 legacy-readable、compliant=false，不把旧记录转换为新成功。继续开发须为当前变更补齐 type_layout；不自动搬迁无关历史代码。`--audit-all` 扫描全量源码，返回历史违规及未决职责；只读样本可通过 `--policy-root <维护源>` 使用新版规则。审计失败与工具回归失败分别报告。

沿既有 migrate_governance.mjs 的 dry-run/apply 升级受管规则、schema、脚本与文档，保留备份、冲突不覆盖。共享技能走 restore_environment.mjs 的既有升级流程。不要在 skillUtils 消费副本或全局缓存维护规则，不改历史 checkpoint/合同/Review 来制造通过。

## 独立 Review

Reviewer 从实际代码或 diff 独立列出类型、职责、包、模块和增删移动情况，对照相同版本机器规则及合同，核验遗漏登记、真实职责冲突和例外范围。逐项记录 rule_id、文件、实际职责/包、预期模式、理由。明确规则违反记 violation；无规则支持的个人目录偏好只记 suggestion。检查报告和合同结论是输入，不能替代独立核对。
