# 实现与审查共用的适用规范上下文

适用性权威源为 `docs/process/applicable-standards.yaml`，正文仍由工程基线、仓库规范和专项 Skill 持有。`scripts/lib/applicable-standards.mjs` 是实现合同编译器与 code-review 共用的解析器。无需新增阶段或用户批准。规范摘要是索引，不是独立审查的范围上限，也不证明模型已经理解规范。

## 实现前

编译器按当前切片填写工作单元 `required_skills`（来自已解析技能闭包）与 `impacts`。解析器合并合同技能、命中影响的专项标准和工程基线，校验 Profile 与来源可读性。运行 profile、Mapper 注册、配置中心、数据库驱动、外部资源、最终包内容分别使用 applicable-standards.yaml 对应影响键，不等到 Review 才补充已知影响。

完整编译调用传入 `standardsRequest` 与 `standardsRoots: {projectRoot, skillRoot}`；返回结果分别持久化为合同 `resolution.applicable_standards` 和 `common.context_plan`。仅技能闭包解析可以省略输入，但不能据此宣布完整实现上下文就绪。

CLI 使用同一个解析器。按实际任务保存以下 JSON，`baseline_ref` 引用工程质量基线，`context_refs` 引用业务验收与相关 ADR。小任务复用现有文件，不生成空 Spec。

```json
{
  "baseline_ref": "docs/engineering/data-analysis-java-conventions.md",
  "context_refs": ["docs/.scratch/query/spec.md"],
  "work_units": [{
    "id": "query-http",
    "required_skills": ["yss-web-controller", "yss-dto", "yss-validation"],
    "impacts": ["backend_impact", "web-adapter-impact", "request-validation"],
    "reference_refs": []
  }]
}
```

```bash
node scripts/applicable-standards.mjs --input docs/.scratch/query/standards-request.json --output docs/.scratch/query/standards-context.json --work-unit query-http
```

项目引用相对实际项目根；技能根由 `skills-lock.json` 解析到 canonical 目录，MVC 使用相邻 skillUtils。先读取当前工作单元的 required_context_refs，简述约束如何影响设计，再按决策读取 on_demand_context_refs。直接引用的 Markdown、YAML、JSON references（包括带技能 ID 的跨技能引用）只索引与取摘要，不输出全文；需要更深或其他格式的细则时，在该工作单元 `reference_refs` 登记 `skills:<技能>/<文件>` 或 `project:<文件>` 并刷新集合。新发现的适用细则不能只留在对话里。不要将 review-only 依赖全部改成 context-required，也不要把审查派发和报告规程放入实现上下文。

## 切换和恢复

新 checkpoint 设置 `standards_context_version: 1`，每切片保存 `standards_ref`、`standards_digest`、`active_work_unit`、`contract_ref`、`contract_version`。当前合同使用 validated。不要把含自身摘要的合同加入 context_refs，合同引用在 checkpoint 中单独绑定。

```bash
node scripts/applicable-standards.mjs --input docs/.scratch/query/standards-context.json --check --work-unit query-http
```

工作单元切换、上下文压缩或交接恢复后先执行上述校验，再重新读取返回的必需原文。来源缺失或变化时刷新真实输入与合同，目标范围内自主继续，不只替换摘要冒充已重新消费。新增影响、验收或范围变化时重算适用性。无关文件不使规范集合失效；Registry 与编译器摘要仍执行原有合同失效规则。

历史 v2 checkpoint 没有此扩展时可继续只读验证；恢复开发时补齐真实上下文与扩展字段，不伪造历史读取证据。读取记录和哈希不能证明语义遵守，仍须行为测试与独立 Review。

## 独立 Review

Reviewer 根据真实 diff 与需求独立核对工作单元和影响面，再用同一解析器重算；不得只相信实施者的请求或摘要。遗漏影响进入普通合同刷新闭环。个人偏好只能作为 suggestion。审查操作规程仅由 Reviewer 按需加载。

切片报告引用 `standards_digest`；整体报告以 `standards_digests` 保存每个 slice id 的摘要。checkpoint 验证来源新鲜度、当前合同和报告绑定。修复按 acceptance-policy.yaml 复查相关问题及受影响行为，相关摘要变化必须更新，无关验证可复用。规范集合不限制对正确性、需求覆盖、跨切片一致性及未声明影响的独立检查。


## Java 类型职责与包布局

仅当目标项目使用 MVC Profile 时，实现前读取目标项目 `docs/process/mvc-package-layout.yaml`（MVC Profile 唯一机器规则源），按 `docs/process/mvc-package-layout.md` 登记并校验 `mvc_structure.type_layout`。新增、移动或修改 Java 类型须校验实际职责、包、模块与目录；allowed_write_paths 不构成布局豁免。恢复工作单元和独立 Review 使用相同规则及摘要。
