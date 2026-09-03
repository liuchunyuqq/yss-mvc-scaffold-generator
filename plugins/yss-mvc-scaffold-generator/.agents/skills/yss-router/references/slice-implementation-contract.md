# Slice Implementation Contract

Router 生成草案；`yss-product-lifecycle` 核验并持久化。合同缺少必填字段时状态为 `blocked`。

```yaml
slice_contract:
  schema_version: 1
  contract_id:
  contract_version: 1
  slice_id:
  status: draft
  lifecycle_refs:
    spec:
    ticket:
    requirement_freeze:
    low_fidelity_review:
    prototype_review:
    high_fidelity_html:
    prototype_verification:
    antd_cli_evidence:
    browser_verification_evidence:
    prototype_confirmation:
    openapi_freeze_or_no_impact:
    architecture_review:
    data_architecture:
    engineering_baseline:
    build_architecture_checklist:
    implementation_repository:
    frontend_repository:
    backend_repository:
    maven_wrapper:
  readiness:
    blockers: []
    stale_inputs: []
    not_applicable:
      - item:
        reason:
  common:
    impacted_areas: []
    implementation_path_policy: harness-apps-multi-project # or external-repository-native | git-submodule-harness-apps
    project_roots: []
    required_skills: []
    optional_skills: []
    unavailable_skills:
      - skill:
        provider:
        fallback: blocked | approved-equivalent
        resolution:
    allowed_write_paths: []
    forbidden_patterns: []
    expected_evidence_files: []
    verification_commands:
      - id:
        command:
    human_review_points: []
    full_reroute_triggers: []
  frontend:
    status: not-applicable
    required_skills: []
    approved_prototype_ref:
    state_matrix_ref:
    generated_api_client_ref:
    allowed_write_paths: []
    component_test_seams: []
    e2e_paths: []
  backend:
    status: not-applicable
    contract_ref: # 后端影响时指向独立 Backend Slice Implementation Contract
    affected_layers: []
    component_impacts: []
    required_skills: []
    application_boundary:
    transaction_boundary:
    persistence_strategy:
    allowed_write_paths: []
    forbidden_patterns: []
    expected_evidence_files: []
    seam_deferred: []
    verification_commands:
      - id:
        command:
  contract:
    api_impact: false
    freeze_ref:
    no_api_impact_ref:
    generated_clients: []
    contract_tests: []
    regeneration_commands: []
  cross_repo:
    repositories: []
    delivery_order: []
    integration_verification: []
    rollback_order: []
  work_units: []
```

工作单元：

```yaml
work_unit:
  id:
  behavior:
  primary_skill:
  supporting_skills: []
  tdd_mode: behavior-tdd
  allowed_write_paths: []
  expected_evidence: []
  verification_command_ids: []
  controlled_generation:
    exception_reason:
    generator:
    generator_inputs: []
    expected_files: []
    verification_commands: []
    behavior_tests_after_generation: []
```

`controlled_generation` 仅在 `tdd_mode: controlled-generation` 时必填；其他模式标记 `not-applicable`。明确写入需求的权限业务行为仍使用 `behavior-tdd`；API schema 与 database schema 分别触发契约或数据架构回退，不得用一个含糊的 schema 类型决定路线。

## 数据分析 API / Controller 条件合同

当切片新增或修改数据分析 API / Controller 时，`common.required_skills` 必须包含 `data-analysis-java-implementation`，并在 `verification_commands` 中登记以下稳定 ID：

- `java-web-style`：运行项目内 Java Web/Javadoc 检查器。
- `fmt-check`：运行 `fmt-maven-plugin:check`，不得用自动改写冒充检查证据。
- `smart-doc-openapi`：显式执行 Smart-doc OpenAPI 目标；Smart-doc 不绑定 Maven 默认生命周期。

`expected_evidence_files` 必须包含 `yss-skill-execution-result.yaml`、`fresh-verification.md` 和 `smart-doc-verification.md`。执行结果还必须记录三个命令的实际退出码、`server/target/openapi` 输出路径，以及生成契约与冻结 OpenAPI 的比较结果。缺少任一项时返回 `violation` 并停留在 `work-unit.slice-implementation`。
