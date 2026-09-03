---
name: product-service-artifacts
description: 创建、新建、初始化或接入单个独立项目、微服务或服务仓库，并默认初始化服务长期说明、功能包和多人工作单元结果。
---

# Service Development Artifacts

所有权威产物都位于微服务自身的 Git 仓库：长期产物解释服务定位、业务模块和当前能力，功能产物随功能代码提交。不创建产品仓库、服务索引仓库或个人产物仓库。

## 路由边界

“初始化一个新项目”或“创建一个负责 X 的微服务”命中本 skill，不命中 `yss-product-lifecycle` 的具体功能实现路由。服务初始化是工程启动：

- 可在没有 Spec、OpenAPI Freeze、Ticket 或 Slice Contract 时创建独立工程骨架和 `docs/service/`。
- 默认输出到用户指定的独立目录；不因当前会话位于 Harness 而改用 `apps/backend/`。
- 初始化不实现 CRUD、API 或其他业务行为。用户后续提出具体功能时，再在新服务仓库内执行生命周期门禁。
- 服务级研发产物是所有新项目的默认输出；用户无需在提示词中另行要求。

## 语义登记门禁

用户可只说“创建负责驾驶舱管理的微服务”。Agent 只处理目标微服务：

- 每次登记服务时，一次性确定服务名称、定位、职责、非职责、业务模块、依赖和验证命令。
- 用户已给出职责主题时，Agent 应先根据该主题形成保守的服务定位、职责、非职责和业务模块候选；只在输出目录、技术基线或边界存在实质歧义时暂停请用户选择。
- 未提供服务语义时不暂停初始化；生成显式 `skeleton` 产物，将定位、职责、非职责和业务模块标为待补充。
- `registered` 表示服务语义已登记；只有登记工程验证命令后才是 `ready-for-feature`，后者才能创建功能包。

## 命令

日常只使用 `register-service`：微服务目录存在时接入并只补缺失产物；不存在时由现有数据分析微服务脚手架创建。`owner` 缺省时读取 `git config user.name`；`base-package` 缺省时根据小写连字符 `service-id` 生成 `com.yss.<segments>`。

```bash
node .agents/skills/product-service-artifacts/scripts/artifact_workspace.mjs register-service --service-id dashboard-service --service-root C:/project/cockpit-dashboard-service --service-name "驾驶舱管理服务" --service-purpose "管理驾驶舱定义、布局和组件" --responsibility "驾驶舱定义管理" --non-responsibility "不负责指标计算" --business-module "dashboard-definition:驾驶舱定义" --owner team-dashboard --verification-command "./mvnw test" --base-package com.yss.cockpit.dashboard --database oracle --with-mock true

# 只有路径时：直接生成工程和 skeleton 服务产物
node .agents/skills/product-service-artifacts/scripts/artifact_workspace.mjs register-service --service-id test-project1 --service-root C:/project/test-project1
```

完整参数和目录见 [references/layout.md](references/layout.md)。

## 约束

- 一个服务一个登记文件、一个功能一个目录、一个工作单元一个结果文件。
- 功能代码和微服务功能产物进入同一 MR/PR。
- `--allow` 必须是有界相对路径；拒绝 `.git`、仓库根、`docs/`、`src/`、`apps/` 等过宽路径。
- 命令使用排他创建，不覆盖既有服务、功能或工作单元。
- 已有非空服务文档只补缺失文件，不整文覆盖。工具不执行 Git commit、push 或 force push。
- 汇总视图是派生产物，不作为多人共同编辑的权威文件。

完整目录和协作说明见 [references/layout.md](references/layout.md)。
