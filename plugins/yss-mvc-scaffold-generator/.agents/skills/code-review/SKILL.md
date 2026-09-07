---
name: code-review
description: 独立审查切片或整体实现的验收覆盖、正确性和适用 YSS 工程规范，输出可定位 findings，驱动自主修复闭环。
---

# Code Review

先读用户目标、CONTEXT.md、工程基线、当前切片合同及其 required_skills。使用 references/yss-review-standards.md 中适用的 YSS / Alibaba 检查输入；不要为未触发影响生成空表或让个人偏好成为硬要求。

## 审查执行

- project-instance 默认按 docs/process/acceptance-policy.yaml 执行。scope=slice 审查本切片验收、实现正确性与相关检查；scope=overall 审查全部需求覆盖、跨切片一致性、集成检查和未关闭问题。
- 实施者必须派发一个独立 Reviewer subagent；如果当前已经是独立 Reviewer，直接审查，不递归创建审查 Agent。任务包记录角色 role.test-engineer、实际 runtime_id、从角色注册表复制的 core_skills / forbidden_skills、Reviewer 执行态、只读代码范围和唯一报告路径。需要不同专项能力时才扩展 Reviewer。
- 从上游任务或当前变更确定范围、基线和候选。输入缺失先查找需求和变更，不默认向用户询问 fixed point。报告记录候选范围内文件摘要（包括新增与删除）和基线。普通切片不强制 candidate.bin、三轴任务包或两个 Reviewer。
- Standards、Spec 和适用的 UI fidelity 都是必须考虑的维度，可由同一独立 Reviewer 逐项检查；机器已证明的格式规则不重复人工检查。真实视觉与交互证据不能由 type-check 替代。
- findings 引用具体代码、验收条件或适用规则，区分 defect 与 suggestion。输出 result=pass 或 changes-required、scope、candidate_digest、reviewer、implementers、acceptance_ids、findings 和检查引用。未执行验证、非零退出码、未解决缺陷或证据过期都不能通过。
- Reviewer 不修改实现。由实施者自动修复后复查相关问题和影响范围；无关变化不使全部报告失效，相关候选变化必须重审。范围内新影响回编译器自动更新，需求冲突或范围扩张才问用户。
- 完成切片审查不替代整体审查。验收标准只能来自用户目标及既有规范，不允许为了通过而降低标准。

模板维护遵守 harness-process-tailoring.md 的强度要求；L3 日常维护者自检，不自动冻结正式发布候选。历史 v1 正式候选只读兼容既有审查记录，发布动作仍消费用户授权。
