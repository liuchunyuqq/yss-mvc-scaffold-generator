---
tracker: "<local-markdown | github | gitlab>"
status: ready-for-human
publication: "<local | pending>"
pending_publication_to: "<none | github | gitlab>"
---

# 功能父 Ticket：<功能名称>

## 默认项目执行策略

新建与恢复的 project-instance 任务使用 `docs/process/acceptance-policy.yaml` 与 `docs/process/acceptance-driven-development.md`：目标授权内连续执行，切片独立 Review、整体 Review 和相关验证闭环；仅需求歧义、冲突、范围扩张或必要外部信息缺失时提问。下文逐资产批准、ready-for-human、全候选打包和固定会签规则仅适用于 schema v1 历史记录；新任务使用 schema v2，validated 表示技术校验通过，不写或伪造 approval-record。模板源维护规则保持适用。

默认 Local Markdown 填写 `tracker: local-markdown`、`publication: local`、`pending_publication_to: none`；若选定的远程平台不可用，填写目标平台、`publication: pending` 和对应的 `pending_publication_to`。

Status: ready-for-human

> Local Markdown 主 tracker 的功能父 Ticket。文件位置固定为 `docs/.scratch/<feature>/parent-ticket.md`。
> 若明确选择的 GitHub / GitLab 暂不可用，将 `tracker` 改为目标平台、`publication` 改为 `pending`，并填写 `pending_publication_to`；不得改投另一平台。

## 功能包

| 字段 | 值 |
|---|---|
| feature | `<feature>` |
| spec | `docs/.scratch/<feature>/spec.md` |
| map | `docs/.scratch/<feature>/map.md` |
| remote_mirror | none / GitHub URL / GitLab URL |
| last_sync | local / `<timestamp>` |
| publication | local / pending |
| pending_publication_to | none / github / gitlab |

## 生命周期状态

| 字段 | 值 |
|---|---|
| stage | `<current-stage>` |
| lifecycle_status | routing / running / paused-human-gate / blocked / completed |
| ticket_role | needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix |
| gate_summary | `<approved / blocked / not-applicable summary>` |

## 资产与证据

- Discovery：`docs/.scratch/<feature>/discovery/`
- Spec Delta：`docs/.scratch/<feature>/spec-delta/`
- Design：`docs/.scratch/<feature>/design/`
- API：`docs/.scratch/<feature>/api/`
- Architecture：`docs/.scratch/<feature>/architecture/`
- Gates：`docs/.scratch/<feature>/gates/`
- Verification：`docs/.scratch/<feature>/verification/`
- Vertical slices：`docs/.scratch/<feature>/issues/`

## 会签

会签记录写在 `docs/.scratch/<feature>/gates/<gate-id>-approval.yaml`。会签桶内门禁标为 `approved` 前必须通过 `scripts/verify-approval-record`。

| 门禁 | 记录路径 | 会签角色 | 状态 |
|---|---|---|---|
|  | `docs/.scratch/<feature>/gates/<gate-id>-approval.yaml` | 见 `docs/agents/digital-human-roles.yaml` | pending / approved / blocked / not-applicable |

## 阻塞关系

- 无 / 被 `<ticket-path>` 阻塞

## 下一工作单元

`<next-work-unit>`

## Comments
