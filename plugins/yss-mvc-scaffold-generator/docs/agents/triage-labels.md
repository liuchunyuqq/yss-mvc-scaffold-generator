# Triage 标签

## 默认项目执行策略

新建与恢复的 project-instance 任务使用 `docs/process/acceptance-policy.yaml` 与 `docs/process/acceptance-driven-development.md`：目标授权内连续执行，切片独立 Review、整体 Review 和相关验证闭环；仅需求歧义、冲突、范围扩张或必要外部信息缺失时提问。下文逐资产批准、ready-for-human、全候选打包和固定会签规则仅适用于 schema v1 历史记录；新任务使用 schema v2，validated 表示技术校验通过，不写或伪造 approval-record。模板源维护规则保持适用。

本文定义 Agent 分诊时使用的五种 **Ticket 状态**，以及它们在当前 Ticket tracker 中对应的标签。不要把它们叫做数字人角色。

| Ticket 状态 | Tracker 标签 | 含义 |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | 等待维护者评估 Ticket |
| `needs-info` | `needs-info` | 等待报告者补充信息 |
| `ready-for-agent` | `ready-for-agent` | 必要门禁已通过、阻塞边已清除，可由 Agent 直接实现的垂直切片 Ticket |
| `ready-for-human` | `ready-for-human` | Spec、设计、契约草案或其他资产需要会签（指定数字人或生物人）或特权访问 |
| `wontfix` | `wontfix` | 不会处理 |

当 skill 提及某个 Ticket 状态时，使用表中对应的 Tracker 标签。会签人由 `docs/agents/digital-human-roles.yaml` 指定，不由本表指定。

Local Markdown 主 tracker 不调用远程标签：在 Ticket 文件顶部使用同名 `Status:` 值记录 Ticket 状态。Wayfinder 的 `claimed` / `resolved` 仅是临时工作状态，不属于本表五态；进入交付 Ticket 前必须转换为标准 `Status:`。
