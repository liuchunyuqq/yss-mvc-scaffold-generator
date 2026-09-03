# YSS Skill Execution Result

核心 YSS skill 必须消费已批准合同版本，并返回：

```yaml
execution_result:
  schema_version: 1
  skill:
  slice_id:
  work_unit_id:
  status: implemented
  consumed_contract:
    contract_ref:
    contract_id:
    contract_version:
  changed_files:
    - path:
      contract_area: common | frontend | backend | contract | cross_repo
  evidence_files:
    - path:
      evidence_type: code | test | generated | review | verification
      behavior_ref:
  verification_results:
    - verification_id:
      command:
      exit_code:
      result: passed | failed
      executed_at:
      evidence_ref:
      output_path:
      contract_comparison:
  constraint_results:
    - constraint:
      status: passed | failed | not-applicable
      evidence_ref:
  seam_deferred:
    - risk:
      owner:
      follow_up_ticket:
      verification_plan:
      target_version_or_release_date:
  deviations:
    - rule:
      reason:
      approval_ref:
  new_impacts:
    - impact_type:
      evidence_ref:
  not_applicable_reason:
```

允许状态：`implemented`、`seam-deferred`、`drift`、`violation`、`not-applicable`。

Router 必须验证：

1. `consumed_contract.contract_version` 与当前批准版本一致。
2. `changed_files` 全部位于工作单元和切片允许路径内。
3. `expected_evidence_files` 全部存在并能回指行为。
4. 验证命令包含稳定的 `verification_id`、实际命令、`exit_code`、结果、时间和可读证据；计划命令不算证据。
5. `seam_deferred` 有风险、责任人、补齐 Ticket、验证计划和目标版本 / 发布日期。
6. `new_impacts` 非空时暂停并重路由。
7. `drift` 触发 Architecture Re-check；`violation` 阻断 build。
8. `status: not-applicable` 必须填写 `not_applicable_reason`；其他状态保留字段但可为空。

专项 skill 自报 `implemented` 不等于最终通过，生命周期编排器和独立 Reviewer 必须复核。

`verification_results` 不得为空，每项必须包含非空 `verification_id`、`command`、`exit_code`、`result`、`executed_at` 和 `evidence_ref`。路径校验按完整目录边界判断，`apps/backend/project1-escape` 不属于 `apps/backend/project1/`；Harness 内路径还必须通过项目路径策略。完整重路由时旧合同必须标记 `stale`，新合同版本递增并保留旧合同引用、失效原因和触发器。

当数据分析实现新增或修改 API / Controller 时，Router 还必须验证：

- `verification_results` 同时包含 `java-web-style`、`fmt-check`、`smart-doc-openapi`；三项 `exit_code` 均为 `0`。
- `java-web-style` 使用项目内 `verify_java_web_style.mjs`，阻断 `smart-doc-javadoc-contract` 和 `java-format-contract`。
- `smart-doc-openapi.output_path` 指向本次命令实际生成的 `server/target/openapi`；仅存在 `smart-doc.json`、历史产物或复制产物不能作为生成证据。
- `smart-doc-openapi.contract_comparison` 记录生成契约与已冻结 OpenAPI 的比较结果和证据引用。
- `evidence_files` 至少包含 `yss-skill-execution-result.yaml`、`fresh-verification.md` 和 `smart-doc-verification.md`。

缺少任一命令结果、退出码、输出目录、契约比较或证据文件时，结果必须为 `violation`，并停留在 `work-unit.slice-implementation`；不得进入代码审查、发布或声称 `implemented-and-verified`。
