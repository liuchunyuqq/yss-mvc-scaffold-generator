# 精简产物布局

## 单服务入口

用户可以只提供新项目路径。Agent 从目录名推导 `service-id`，从本机 Git 用户推导 Owner，从 `service-id` 推导 `com.yss.<segments>` 基础包，并默认生成 `docs/service/`。用户说明职责时，Agent 再把语义转成命令参数。

只有目录和项目名时直接生成 `skeleton`，不追问服务语义。要达到 `registered` 需要：`service-name`、`service-purpose`、至少一个 `responsibility`、`non-responsibility` 和 `business-module=<id>:<名称>`。`depends-on=<service-id>:<用途>` 可重复；无依赖时可不填。

## 微服务仓库

`docs/service/` 保存服务长期说明：`service-overview.md`、`module-map.yaml`、`dependencies.yaml` 和 `current-capabilities.yaml`。`current-capabilities.yaml` 初始为空是合法的，因为它只记已验证或已发布能力。`skeleton` 允许职责和业务模块待补充；`registered` 和 `ready-for-feature` 不允许。

`docs/.scratch/<feature>/` 只在服务达到 `ready-for-feature` 后创建并保存开发中功能。功能完成并发布后，可在独立归档工作单元中移动到 `docs/features/<feature>/`。

多人共同开发一个功能时，每人只编辑 `implementation/results/<work-unit-id>.yaml`。共享的 `feature.md`、合同和最终 Review 分别由 Feature Owner、Contract Owner 和 Reviewer 维护。

服务仓库不引用必需的产品仓库或公共产物目录；服务依赖只在 `dependencies.yaml` 中按 `service_id` 记录。

## Git 协作

开发者在功能分支中提交代码和当前工作单元结果，经 rebase、验证和 MR/PR 合并。禁止直接推送受保护主分支；冲突涉及共享合同或业务结论时由对应 Owner 裁决，不能由工具自动选择一方。
