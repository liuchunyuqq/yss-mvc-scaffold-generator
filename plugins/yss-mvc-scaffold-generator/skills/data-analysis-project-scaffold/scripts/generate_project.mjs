#!/usr/bin/env node
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULES = ["server", "core", "client", "repository", "adapter", "feign-client"];
const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function findHarnessRoot() {
  let candidate = SKILL_ROOT;
  while (true) {
    if (existsSync(path.join(candidate, ".agents", "skills")) && existsSync(path.join(candidate, "AGENTS.md"))) return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  throw new Error(`未找到插件 Harness 根目录: ${SKILL_ROOT}`);
}
const HARNESS_ROOT = findHarnessRoot();
const SHARED_SKILLS_ROOT = path.join(HARNESS_ROOT, ".agents", "skills");
const SKILL_UTILS_NAME = "skillUtils";
const SKILL_UTILS_DIRECTORIES = [".agents/skills", ".claude/skills", ".codex/skills", ".cursor/skills", ".hermes/skills", ".pi/skills", ".qoder/skills", ".trae/skills"];
const PROJECT_SCRIPT_FILES = [
  "check-agent-environment.mjs", "implementation-path-policy", "repository-mode", "repository-scope-policy",
  "generate-lifecycle-artifacts", "node-generate-lifecycle-artifacts.mjs", "node-verify-lifecycle-registry.mjs",
  "verify-lifecycle-registry", "verify-lifecycle-checkpoint", "verify-frontend-implementation-evidence",
  "verify-yss-dto-openapi-profile"
];
let generatedJavadocAuthor;

function fail(message) { throw new Error(message); }
function parse(argv) {
  const options = { database: "oracle", withMock: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    let token = argv[index];
    if (token === "--with-mock") { options.withMock = true; continue; }
    if (token === "--dry-run") { options.dryRun = true; continue; }
    const equals = token.indexOf("=");
    let value = equals >= 0 ? token.slice(equals + 1) : undefined;
    if (equals >= 0) token = token.slice(0, equals);
    if (!["--project-name", "--base-package", "--target-dir", "--database", "--maven-settings"].includes(token)) fail(`不支持的参数: ${token}`);
    if (value === undefined) value = argv[++index];
    if (!value || value.startsWith("--")) fail(`参数 ${token} 缺少值`);
    options[{ "--project-name": "projectName", "--base-package": "basePackage", "--target-dir": "targetDir", "--database": "database", "--maven-settings": "mavenSettings" }[token]] = value;
  }
  if (!options.projectName || !/^[a-z][a-z0-9-]*$/.test(options.projectName)) fail("--project-name 必须是小写连字符名称");
  if (!options.basePackage || !/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)+$/.test(options.basePackage)) fail("--base-package 不是合法 Java 包名");
  if (!options.targetDir) fail("必须提供 --target-dir");
  if (!["oracle", "oceanbase-oracle"].includes(options.database)) fail("--database 只支持 oracle 或 oceanbase-oracle");
  options.targetDir = path.resolve(options.targetDir);
  if (options.mavenSettings) options.mavenSettings = path.resolve(options.mavenSettings);
  return options;
}
async function exists(target) { try { await stat(target); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
async function assertEmpty(target) { if (!await exists(target)) return; if ((await readdir(target)).length) fail(`目标目录非空，拒绝生成: ${target}`); }
async function populateSkillUtils(destination) {
  await mkdir(destination, { recursive: true });
  for (const relative of SKILL_UTILS_DIRECTORIES) {
    const source = path.join(HARNESS_ROOT, relative);
    if (!await exists(source)) fail(`技能工具包源目录不存在: ${source}`);
    await cp(source, path.join(destination, relative), { recursive: true });
  }
  for (const relative of ["skills-lock.json", "yss-public-skills.json"]) {
    const source = path.join(HARNESS_ROOT, relative);
    if (!await exists(source)) fail(`技能工具包源文件不存在: ${source}`);
    await cp(source, path.join(destination, relative));
  }
  await writeFile(path.join(destination, "skill-utils.yaml"), `schema_version: 1\nkind: yss-skill-utils\ntool_version: 1.0.0\ncompatibility: skill-utils-v1\nsource: ${path.basename(HARNESS_ROOT)}\ncanonical_root: .agents/skills\nprojection_roots:\n  - .codex/skills\n  - .claude/skills\n  - .cursor/skills\n`, "utf8");
}
async function ensureSkillUtils(targetDir, { apply = true } = {}) {
  const parent = path.dirname(targetDir);
  const skillUtils = path.join(parent, SKILL_UTILS_NAME);
  const marker = path.join(skillUtils, "skill-utils.yaml");
  const sourceLock = path.join(HARNESS_ROOT, "skills-lock.json");
  if (!await exists(sourceLock)) fail(`技能工具包源锁文件不存在: ${sourceLock}`);
  if (await exists(skillUtils)) {
    if (!await exists(marker)) fail(`技能工具包目录已存在但不是受支持的 skillUtils: ${skillUtils}`);
    const installedLock = path.join(skillUtils, "skills-lock.json");
    const current = await exists(installedLock) ? await readFile(installedLock, "utf8") : "";
    const expected = await readFile(sourceLock, "utf8");
    if (current === expected) return { path: skillUtils, created: false, refreshed: false, backup: null };
    if (!apply) return { path: skillUtils, created: false, refreshed: true, backup: null };
    const staging = await mkdtemp(path.join(parent, ".skillUtils.refresh-"));
    const backup = path.join(parent, `.skillUtils.backup-${Date.now()}`);
    try {
      await populateSkillUtils(staging);
      await rename(skillUtils, backup);
      try {
        await rename(staging, skillUtils);
      } catch (error) {
        await rename(backup, skillUtils);
        throw error;
      }
    } catch (error) {
      if (await exists(staging)) await rm(staging, { recursive: true, force: true });
      throw error;
    }
    return { path: skillUtils, created: false, refreshed: true, backup };
  }
  if (!apply) return { path: skillUtils, created: true, refreshed: false, backup: null };
  await populateSkillUtils(skillUtils);
  return { path: skillUtils, created: true, refreshed: false, backup: null };
}
const xml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const packagePath = (name) => name.replaceAll(".", "/");
async function put(root, relative, content) {
  const target = path.join(root, relative);
  const rendered = generatedJavadocAuthor ? content.replaceAll("@author system", `@author ${generatedJavadocAuthor}`) : content;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${rendered.trim()}\n`, "utf8");
}
async function renderAsset(name, replacements) {
  let content = await readFile(path.join(SKILL_ROOT, "assets", name), "utf8");
  for (const [token, value] of Object.entries(replacements)) content = content.replaceAll(`{{${token}}}`, value);
  return content;
}
function generatedAtLocal() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
function runGit(args, cwd) { return spawnSync("git", args, { cwd, encoding: "utf8" }); }
function assertGitAvailable() { const result = runGit(["--version"], process.cwd()); if (result.status !== 0) fail("未检测到可用的 Git，无法初始化独立项目仓库"); }
function resolveGitAuthor() {
  const result = runGit(["config", "--get", "user.name"], process.cwd());
  const author = result.status === 0 ? result.stdout.trim() : "";
  if (!author) fail("未配置 Git user.name；请先执行 git config --global user.name \"你的姓名\"");
  if (/[\r\n]|\*\//.test(author)) fail("Git user.name 包含不能安全写入 Javadoc 的字符");
  return author;
}
async function resolveMavenSettings(options) {
  if (options.mavenSettings) {
    if (!await exists(options.mavenSettings)) fail(`Maven settings 不存在: ${options.mavenSettings}`);
    return { path: options.mavenSettings, source: "explicit" };
  }
  if (process.env.YSS_MAVEN_SETTINGS) {
    const environmentPath = path.resolve(process.env.YSS_MAVEN_SETTINGS);
    if (!await exists(environmentPath)) fail(`Maven settings 不存在: ${environmentPath}`);
    return { path: environmentPath, source: "environment" };
  }
  const userSettings = path.join(os.homedir(), ".m2", "settings.xml");
  return await exists(userSettings) ? { path: userSettings, source: "user-home" } : { path: null, source: "maven-default" };
}
function initializeGit(root) {
  let result = runGit(["init", "--initial-branch=main"], root);
  if (result.status !== 0) {
    result = runGit(["init"], root);
    if (result.status === 0) result = runGit(["branch", "-M", "main"], root);
  }
  if (result.status !== 0) fail(`Git 仓库初始化失败: ${(result.stderr || result.stdout).trim()}`);
}
async function projectInstanceEnvelope(o) {
  await put(o.targetDir, "yss-project.yaml", `schema_version: 1\nrepository_mode: project-instance`);
  await put(o.targetDir, ".artifact-workspace.yaml", `schema_version: 1\nkind: service\nservice_id: ${o.projectName}\nowner: ${JSON.stringify(o.gitAuthor)}`);
  await cp(path.join(HARNESS_ROOT, "AGENTS.md"), path.join(o.targetDir, "AGENTS.md"));
  const generatedAgents = await readFile(path.join(o.targetDir, "AGENTS.md"), "utf8");
  await writeFile(path.join(o.targetDir, "AGENTS.md"), generatedAgents
    .replaceAll(".agents/skills", "../skillUtils/.agents/skills")
    .replaceAll(".codex/skills", "../skillUtils/.codex/skills")
    .replace("- `scripts/verify-template` 是模板发布阻断门禁。模板与外部 `create-yss-spec` 的跨仓库契约未完成集成验证时，不得声称可发布。", "- 模板发布门禁只在上游 Harness 模板源执行；当前项目实例不分发或运行 `verify-template`。"), "utf8");
  await put(o.targetDir, "CONTEXT.md", `# 领域上下文\n\n## 业务术语\n\n| 术语 | 定义 | 英文标识 | 避免 / 备注 |\n|---|---|---|---|\n| 分析数据集 | 支撑一个数据分析功能的表结构、字段语义和查询边界。 | AnalysisDataset | 具体业务术语在需求分析后补充 |\n| 分析结果 | 数据分析接口返回的分页明细或聚合结果。 | AnalysisResult | 不表示未经约束的原始结果集 |`);
  for (const relative of ["docs/agents", "docs/process", "docs/templates", "docs/architecture/templates"]) {
    const source = path.join(HARNESS_ROOT, relative);
    if (!await exists(source)) fail(`项目实例治理资产不存在: ${source}`);
    await cp(source, path.join(o.targetDir, relative), { recursive: true });
  }
  const integrationPath = path.join(o.targetDir, "docs/process/implementation-repo-integration.md");
  const integration = (await readFile(integrationPath, "utf8"))
    .replace("模板仓库至少执行：", "以下命令仅由上游 Harness 模板源执行，项目实例不分发这些模板维护工具：")
    .replace("scripts/sync-skills --check\nscripts/update-skill-lock --check\nscripts/verify-template", "在 Harness 模板源执行 Skill 投影同步、锁文件检查和模板发布校验。");
  await writeFile(integrationPath, integration, "utf8");
  const checklistPath = path.join(o.targetDir, "docs/templates/build-architecture-checklist-template.md");
  await writeFile(checklistPath, (await readFile(checklistPath, "utf8")).replace("scripts/verify-implementation-path-scenarios", "node scripts/implementation-path-policy"), "utf8");
  const agentReadmePath = path.join(o.targetDir, "docs/agents/README.md");
  const agentReadme = (await readFile(agentReadmePath, "utf8"))
    .replace("Engineering Skills 的安装、升级和验证说明", "项目实例使用共享 `skillUtils` 的版本检查说明")
    .replace("GitLab、MR、CI 和自动 gitworks 的技能配置与使用规则", "GitLab、MR 和 CI 的 `glab` 使用规则");
  await writeFile(agentReadmePath, agentReadme, "utf8");
  const issueTrackerPath = path.join(o.targetDir, "docs/agents/issue-tracker.md");
  await writeFile(issueTrackerPath, (await readFile(issueTrackerPath, "utf8")).replace("当平台为 GitLab 时，优先使用 `glab` 或项目快捷入口 `scripts/gitworks`。", "当平台为 GitLab 时，使用已认证的 `glab`。"), "utf8");
  const tailoringPath = path.join(o.targetDir, "docs/process/harness-process-tailoring.md");
  await writeFile(tailoringPath, (await readFile(tailoringPath, "utf8")).replace("使用 `scripts/verify-maintenance-checkpoint <file>` 或通过 stdin 传入 YAML / JSON 做只读校验。触发项 ID 与最低等级只由 `docs/process/maintenance-intensity.yaml` 维护；校验器消费该策略。未知触发项必须先更新该权威策略和场景，不能静默接受。", "维护 checkpoint 校验只在上游 Harness 模板源执行。触发项 ID 与最低等级只由 `docs/process/maintenance-intensity.yaml` 维护；未知触发项必须先更新该权威策略和场景，不能静默接受。"), "utf8");
  await put(o.targetDir, "docs/agents/skills-maintenance.md", `# 项目实例 Skill 环境

本项目不维护或发布共享 Skill。共享 Skill 位于相邻的 \`../skillUtils\`，版本由项目根 \`skills-lock.json\` 锁定。

开发前执行：

\`\`\`bash
npm run check-agent-environment
\`\`\`

输出 \`READY\` 表示工具版本、兼容协议、Agent 投影和 canonical Skill hash 一致。输出 \`NOT_READY\` 时停止功能实现，使用上游 Harness 的项目初始化或刷新流程更新 \`skillUtils\`；不要在项目内手工同步、导出或覆盖共享 Skill。

项目实例只消费已提交的 \`scripts/lib/*.mjs\` 和 \`scripts/vendor/*.mjs\`。模板发布、Skill 投影生成、上游来源验证和公开导出均属于 Harness 模板源维护，不在本项目执行。`);
  await put(o.targetDir, "docs/agents/gitlab-workflow-skills.md", `# GitLab 工作流

本项目不分发 GitLab 包装脚本。需要查看 MR、Pipeline 或 CI 时，使用已认证的 \`glab\`，并先确认当前仓库的 \`origin\` 指向目标 GitLab 项目。

常用只读命令：

\`\`\`bash
git status --short --branch
glab mr list
glab ci list
glab ci status
\`\`\`

创建分支、commit、push、MR 或触发 Pipeline 都必须遵守 \`AGENTS.md\` 的显式授权和 checkpoint 规则。Token 只通过 \`glab auth login\` 或环境变量管理，不写入仓库文件。`);
  for (const relative of PROJECT_SCRIPT_FILES) await cp(path.join(HARNESS_ROOT, "scripts", relative), path.join(o.targetDir, "scripts", relative));
  for (const relative of ["lib", "vendor"]) await cp(path.join(HARNESS_ROOT, "scripts", relative), path.join(o.targetDir, "scripts", relative), { recursive: true });
  for (const relative of ["package.json", "skills-lock.json", ".nvmrc"]) {
    const source = path.join(HARNESS_ROOT, relative);
    if (await exists(source)) await cp(source, path.join(o.targetDir, relative));
  }
  const projectRoot = ".";
  await put(o.targetDir, "skills-lock.json", JSON.stringify({ version: 1, distribution: { mode: "sibling-directory", skillUtilsDir: "../skillUtils", required: true, compatibility: "skill-utils-v1", requiredToolVersion: "1.0.0" }, skills: { source: "../skillUtils/skills-lock.json", validation: "scripts/check-agent-environment.mjs" } }, null, 2));
  await put(o.targetDir, "package.json", JSON.stringify({ name: o.projectName, private: true, scripts: { "check-agent-environment": "node scripts/check-agent-environment.mjs", "verify-project": "node scripts/verify-lifecycle-registry", "verify-dto": "node scripts/verify-yss-dto-openapi-profile" } }, null, 2));
  await put(o.targetDir, "docs/process/analysis-project.yaml", `project_name: ${o.projectName}\nproject_type: data-analysis\nrepository_scope: external-repository\nimplementation_root: ${projectRoot}\nruntime_java: 8\npersistence_profile: yss-mybatis-plus\nid_strategy: ASSIGN_ID\ndatabase:\n  type: ${o.database}\n  runtime_connection: true\n  metadata_contract: docs/data-model\nquery:\n  sql_mode: readonly\n  allowed_statement_types: [select, with]\n  parameter_binding_required: true\nmodules:\n${MODULES.map((module) => `  - ${module}`).join("\n")}\nworkflow:\n  - requirement-and-data-contract\n  - specification-freeze\n  - vertical-slice-implementation\n  - automated-gates\n  - single-release-confirmation\n  - runtime-monitoring`);
  await put(o.targetDir, "docs/process/implementation-repo-registry.yaml", `schema_version: 1\nprojects:\n  - project_type: backend\n    project_name: ${o.projectName}\n    project_root: ${projectRoot}\n    git_root: .\n    repository_scope: external-repository\n    scaffold_status: initialized\n    default_branch: main\n    allowed_write_paths:\n      - .\n    verification_commands:\n      - node .agents/skills/data-analysis-java-implementation/scripts/verify_java_web_style.mjs --project-root .\n      - mvnw com.coveo:fmt-maven-plugin:2.9.1:check\n      - mvnw validate\n      - mvnw test\n      - mvnw package\n      - mvnw -pl server -am com.ly.smart-doc:smart-doc-maven-plugin:3.0.5:openapi\n    expected_evidence_files:\n      - docs/.scratch/<feature>/verification/yss-skill-execution-result.yaml\n      - docs/.scratch/<feature>/verification/fresh-verification.md\n      - docs/.scratch/<feature>/verification/smart-doc-verification.md\n    ci: not-configured\n    rollback_point: initial-empty-repository`);
  const implementationRegistryPath = path.join(o.targetDir, "docs/process/implementation-repo-registry.yaml");
  await writeFile(implementationRegistryPath, (await readFile(implementationRegistryPath, "utf8")).replace("node .agents/skills/data-analysis-java-implementation/scripts/verify_java_web_style.mjs", "node ../skillUtils/.agents/skills/data-analysis-java-implementation/scripts/verify_java_web_style.mjs"), "utf8");
  await put(o.targetDir, "docs/.scratch/.gitkeep", "# Local lifecycle artifacts are created in feature subdirectories.");
  await put(o.targetDir, "docs/service/service-overview.md", `# ${o.projectName} 服务说明\n\nOwner: ${o.gitAuthor}\n\n## 职责\n\n提供数据分析服务能力；具体业务职责在产品服务登记和功能 Spec 中维护。\n\n## 非职责\n\n## 依赖服务\n`);
  await put(o.targetDir, "docs/service/module-map.md", `# ${o.projectName} Module 地图\n\n| Module | 职责 | 主要 Interface |\n|---|---|---|\n| server | Web 入口与运行配置 | HTTP Controller |\n| core | 领域与应用行为 | Domain/Application Interface |\n| client | 对外 DTO 与客户端契约 | Request/Response |\n| repository | 数据持久化 | Gateway/Repository |\n| adapter | 外部系统适配 | Adapter |\n| feign-client | 服务间调用客户端 | Feign Interface |\n`);
  await put(o.targetDir, "docs/service/current-capabilities.md", `# ${o.projectName} 当前能力\n\n本文件是发布时生成的派生阅读视图，普通功能开发不手工修改。功能详情位于 \`docs/features/\`，开发中功能位于 \`docs/.scratch/\`。\n`);
  await put(o.targetDir, "docs/engineering/data-analysis-java-conventions.md", `# 数据分析 Java 工程规范\n\n## 命名与注释\n\n变量、参数和字段必须使用业务含义名称。public 类、接口和方法必须有简体中文 Javadoc；注释正文必须描述真实业务职责或接口行为。Controller 类和公开接口方法使用初始化时读取的 Git user.name（本项目为 @author ${o.gitAuthor}）和生成时的 @date，方法参数、返回值分别使用 @param、@return 完整说明。Javadoc 正文、@author、@date、@param、@return 必须分行；Mapping 注解、方法签名、方法体不得压缩在同一行。复杂判断、分页和 Oracle 特殊逻辑必须有代码块注释。\n\n## 包结构\n\n启动类固定放在 server/src/main/java/<base-package>/Application.java。server 其余代码进入 controller、configuration、advice；repository 进入 entity、mapper、convertor、gateway/impl；core 进入 domain、gateway、service；client 进入 command、query、request、response；adapter 进入 mock、oracle 或具体外部系统子包。除启动类外不在模块基础包平铺业务类型。\n\n## 持久层\n\nCRUD 固定走 Gateway -> Mapper -> mapper.xml。所有业务 SQL只能写入 repository/src/main/resources/mapper/*.xml，并使用 MyBatis 参数绑定。Java 中不得出现 JdbcTemplate 业务调用或动态 SQL 拼接。已知表结构必须使用明确的 Request、Response、PO/Entity 和 Domain 类型。\n\n## API 验证\n\nAPI/Controller 变更必须先运行 Java Web/Javadoc 检查和 fmt check，再显式运行 Smart-doc openapi goal。不将 Smart-doc 绑定 Maven execution；必须保留命令退出码、输出目录和接口核对证据。`);
  await put(o.targetDir, ".gitignore", `target/\n**/target/\n.idea/\n*.iml\n.env\n.env.*\n!.env.example\n.local/\n`);
}
function parentPom(o) {
  const modules = MODULES.map((module) => `    <module>${module}</module>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion><parent><groupId>com.yss.cloud</groupId><artifactId>yss-cloud-microservice</artifactId><version>2.0.0-SNAPSHOT</version><relativePath/></parent>
  <groupId>${xml(o.basePackage)}</groupId><artifactId>${o.projectName}</artifactId><version>2.0.0-SNAPSHOT</version><packaging>pom</packaging>
  <properties><java.version>1.8</java.version><maven.compiler.source>1.8</maven.compiler.source><maven.compiler.target>1.8</maven.compiler.target><project.build.sourceEncoding>UTF-8</project.build.sourceEncoding><yss-components.version>2.0.0-SNAPSHOT</yss-components.version></properties>
  <modules>\n${modules}\n  </modules>
  <dependencyManagement><dependencies><dependency><groupId>com.yss.cloud</groupId><artifactId>yss-components-bom</artifactId><version>\${yss-components.version}</version><type>pom</type><scope>import</scope></dependency></dependencies></dependencyManagement>
  <build><plugins><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId></plugin><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-source-plugin</artifactId></plugin><plugin><groupId>com.coveo</groupId><artifactId>fmt-maven-plugin</artifactId><version>2.9.1</version></plugin></plugins></build>
</project>`;
}
function modulePom(o, module) {
  const artifact = (name) => `<dependency><groupId>${xml(o.basePackage)}</groupId><artifactId>${o.projectName}-${name}</artifactId><version>\${project.version}</version></dependency>`;
  const yss = (name) => `<dependency><groupId>com.yss.cloud</groupId><artifactId>${name}</artifactId></dependency>`;
  const databaseDriver = o.database === "oceanbase-oracle" ? `<dependency><groupId>com.oceanbase</groupId><artifactId>oceanbase-client</artifactId><version>2.4.3</version></dependency>` : `<dependency><groupId>com.oracle.database.jdbc</groupId><artifactId>ojdbc8</artifactId><version>19.8.0.0</version></dependency>`;
  const dependencies = {
    client: `${yss("yss-component-dto")}\n${yss("yss-component-validation-jsr303")}\n<dependency><groupId>com.yss.cloud</groupId><artifactId>yss-component-excel-mvc</artifactId><version>\${yss-components.version}</version></dependency>\n<dependency><groupId>org.projectlombok</groupId><artifactId>lombok</artifactId><scope>provided</scope></dependency>`,
    core: `${artifact("client")}\n${yss("yss-component-exception")}\n<dependency><groupId>com.yss.datamiddle</groupId><artifactId>yss-component-userinfo-starter</artifactId></dependency>\n<dependency><groupId>org.mapstruct</groupId><artifactId>mapstruct</artifactId></dependency>`,
    repository: `${artifact("core")}\n${artifact("client")}\n${yss("yss-component-mybatis-starter")}\n${yss("yss-component-distributed-id")}\n${databaseDriver}`,
    adapter: `${artifact("core")}\n${artifact("client")}\n<dependency><groupId>org.springframework</groupId><artifactId>spring-context</artifactId></dependency>\n<dependency><groupId>org.springframework.cloud</groupId><artifactId>spring-cloud-openfeign-core</artifactId></dependency>`,
    "feign-client": `${artifact("client")}\n<dependency><groupId>org.springframework.cloud</groupId><artifactId>spring-cloud-openfeign-core</artifactId></dependency>`,
    server: `<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>\n<dependency><groupId>org.springframework.cloud</groupId><artifactId>spring-cloud-starter-bootstrap</artifactId></dependency>\n${artifact("repository")}\n${artifact("adapter")}\n${artifact("client")}\n${yss("yss-component-audit-log")}\n${yss("yss-component-cache-starter")}\n<dependency><groupId>com.yss.cloud</groupId><artifactId>yss-component-excel-mvc</artifactId><version>\${yss-components.version}</version></dependency>\n${yss("yss-component-distributed-id")}\n<dependency><groupId>com.yss.datamiddle</groupId><artifactId>yss-component-userinfo-starter</artifactId></dependency>\n<dependency><groupId>org.springframework.cloud</groupId><artifactId>spring-cloud-starter-openfeign</artifactId></dependency>\n<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-actuator</artifactId></dependency>\n<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>`
  }[module];
  const profiles = module === "server" ? `<profiles><profile><id>nacos</id><activation><activeByDefault>true</activeByDefault></activation><properties><app.env>dev</app.env><app.profiles>nacos</app.profiles></properties><dependencies><dependency><groupId>com.alibaba.cloud</groupId><artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId></dependency><dependency><groupId>com.alibaba.cloud</groupId><artifactId>spring-cloud-starter-alibaba-nacos-config</artifactId></dependency></dependencies></profile></profiles>` : "";
  const plugin = module === "server" ? `<build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin><plugin><groupId>com.ly.smart-doc</groupId><artifactId>smart-doc-maven-plugin</artifactId><version>3.0.5</version><configuration><configFile>src/main/resources/smart-doc.json</configFile><includes><include>com.yss.cloud:yss-component-dto</include><include>com.yss.cloud:yss-component-exception</include><include>com.yss.cloud:yss-component-cache-starter</include><include>${xml(o.basePackage)}:${o.projectName}-client</include><include>${xml(o.basePackage)}:${o.projectName}-core</include><include>${xml(o.basePackage)}:${o.projectName}-repository</include></includes><projectName>\${project.artifactId}</projectName></configuration></plugin></plugins></build>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><parent><groupId>${xml(o.basePackage)}</groupId><artifactId>${o.projectName}</artifactId><version>2.0.0-SNAPSHOT</version></parent><artifactId>${o.projectName}-${module}</artifactId><dependencies>${dependencies}</dependencies>${profiles}${plugin}</project>`;
}
async function javaSources(o) {
  const root = o.targetDir, pkg = o.basePackage, pp = packagePath(pkg);
  const generatedAt = generatedAtLocal();
  await put(root, `client/src/main/java/${pp}/client/query/AnalysisQuery.java`, `package ${pkg}.client.query;\n\nimport lombok.AllArgsConstructor;\nimport lombok.Data;\nimport lombok.NoArgsConstructor;\n\n/** 数据分析分页查询。 */\n@Data\n@NoArgsConstructor\n@AllArgsConstructor\npublic class AnalysisQuery {\n    private int pageNo;\n    private int pageSize;\n    private String sql;\n}`);
  await put(root, `client/src/main/java/${pp}/client/response/AnalysisResult.java`, `package ${pkg}.client.response;\n\nimport java.util.List;\nimport java.util.Map;\nimport lombok.AllArgsConstructor;\nimport lombok.Data;\nimport lombok.NoArgsConstructor;\n\n/** 数据分析分页结果。 */\n@Data\n@NoArgsConstructor\n@AllArgsConstructor\npublic class AnalysisResult {\n    private int pageNo;\n    private int pageSize;\n    private long total;\n    private List<Map<String, Object>> rows;\n    private String source;\n}`);
  await put(root, `core/src/main/java/${pp}/core/gateway/AnalysisQueryExecutor.java`, `package ${pkg}.core.gateway;\n\nimport ${pkg}.client.query.AnalysisQuery;\nimport ${pkg}.client.response.AnalysisResult;\n\n/** 数据分析执行接口。 */\npublic interface AnalysisQueryExecutor {\n    AnalysisResult execute(AnalysisQuery query);\n}`);
  await put(root, `core/src/main/java/${pp}/core/service/AnalysisQueryService.java`, `package ${pkg}.core.service;\n\nimport ${pkg}.client.query.AnalysisQuery;\nimport ${pkg}.client.response.AnalysisResult;\nimport ${pkg}.core.gateway.AnalysisQueryExecutor;\n\n/** 数据分析查询服务。 */\npublic final class AnalysisQueryService {\n    private final AnalysisQueryExecutor analysisQueryExecutor;\n\n    public AnalysisQueryService(AnalysisQueryExecutor analysisQueryExecutor) {\n        this.analysisQueryExecutor = analysisQueryExecutor;\n    }\n\n    public AnalysisResult execute(AnalysisQuery query) {\n        return analysisQueryExecutor.execute(query);\n    }\n}`);
  await put(root, `adapter/src/main/java/${pp}/adapter/oracle/OracleAnalysisQueryExecutor.java`, `package ${pkg}.adapter.oracle;\n\nimport ${pkg}.client.query.AnalysisQuery;\nimport ${pkg}.client.response.AnalysisResult;\nimport ${pkg}.core.gateway.AnalysisQueryExecutor;\n\n/** Oracle 数据分析执行器占位实现。 */\npublic final class OracleAnalysisQueryExecutor implements AnalysisQueryExecutor {\n    @Override\n    public AnalysisResult execute(AnalysisQuery query) {\n        throw new UnsupportedOperationException("Oracle execution requires an approved vertical slice");\n    }\n}`);
  if (o.withMock) await put(root, `adapter/src/main/java/${pp}/adapter/mock/MockAnalysisQueryExecutor.java`, `package ${pkg}.adapter.mock;\n\nimport ${pkg}.client.query.AnalysisQuery;\nimport ${pkg}.client.response.AnalysisResult;\nimport ${pkg}.core.gateway.AnalysisQueryExecutor;\nimport java.util.ArrayList;\nimport java.util.HashMap;\nimport java.util.List;\nimport java.util.Map;\n\n/** 本地联调数据分析执行器。 */\npublic final class MockAnalysisQueryExecutor implements AnalysisQueryExecutor {\n    @Override\n    public AnalysisResult execute(AnalysisQuery query) {\n        Map<String, Object> row = new HashMap<String, Object>();\n        row.put("metric", "mock-value");\n        row.put("value", 100);\n        List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();\n        rows.add(row);\n        return new AnalysisResult(query.getPageNo(), query.getPageSize(), 1, rows, "mock");\n    }\n}`);
  await put(root, `server/src/main/java/${pp}/Application.java`, `package ${pkg};\n\nimport com.yss.cloud.audit.EnableAuditLog;\nimport com.yss.cloud.cache.EnableYssCloudRedisCache;\nimport com.yss.cloud.excel.annotation.EnableExcelControl;\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\nimport org.springframework.cloud.openfeign.EnableFeignClients;\nimport org.springframework.context.annotation.ComponentScan;\nimport org.springframework.context.annotation.FilterType;\n\n/** 数据分析服务启动入口。 */\n@EnableYssCloudRedisCache\n@EnableExcelControl\n@EnableAuditLog\n@EnableFeignClients\n@ComponentScan(\n    value = {"${pkg}", "com.yss.cloud"},\n    excludeFilters = @ComponentScan.Filter(\n        type = FilterType.REGEX,\n        pattern = {"com\\\\.yss\\\\.cloud\\\\.mybatis\\\\..*", "com\\\\.yss\\\\.cloud\\\\.sankuai\\\\..*"}))\n@SpringBootApplication\npublic class Application {\n    public static void main(String[] args) {\n        SpringApplication.run(Application.class, args);\n    }\n}`);
  await put(root, `server/src/main/java/${pp}/server/configuration/DatabaseInfrastructureConfiguration.java`, `package ${pkg}.server.configuration;\n\nimport com.yss.cloud.EnableDistributedId;\nimport com.yss.cloud.mybatis.config.MapperConfiguration;\nimport org.springframework.context.annotation.Configuration;\nimport org.springframework.context.annotation.Import;\nimport org.springframework.context.annotation.Profile;\n\n/** 数据库及分布式 ID 基础设施配置。 */\n@Configuration\n@Profile("!mock")\n@EnableDistributedId\n@Import(MapperConfiguration.class)\npublic class DatabaseInfrastructureConfiguration {\n}`);
  const mockImport = o.withMock ? `import ${pkg}.adapter.mock.MockAnalysisQueryExecutor;\n` : "";
  const mockBean = o.withMock ? `\n    @Bean\n    @Profile("mock")\n    AnalysisQueryExecutor mockAnalysisQueryExecutor() {\n        return new MockAnalysisQueryExecutor();\n    }\n` : "";
  const databaseRuntimeProfile = o.database === "oceanbase-oracle" ? "oceanbase-oracle" : "oracle";
  const oracleProfile = o.withMock ? `${databaseRuntimeProfile} & !mock` : databaseRuntimeProfile;
  await put(root, `server/src/main/java/${pp}/server/configuration/AnalysisConfiguration.java`, `package ${pkg}.server.configuration;\n\n${mockImport}import ${pkg}.adapter.oracle.OracleAnalysisQueryExecutor;\nimport ${pkg}.core.gateway.AnalysisQueryExecutor;\nimport ${pkg}.core.service.AnalysisQueryService;\nimport org.springframework.context.annotation.Bean;\nimport org.springframework.context.annotation.Configuration;\nimport org.springframework.context.annotation.Profile;\n\n/** 数据分析服务 Bean 配置。 */\n@Configuration\npublic class AnalysisConfiguration {${mockBean}\n    @Bean\n    @Profile("${oracleProfile}")\n    AnalysisQueryExecutor oracleAnalysisQueryExecutor() {\n        return new OracleAnalysisQueryExecutor();\n    }\n\n    @Bean\n    AnalysisQueryService analysisQueryService(AnalysisQueryExecutor analysisQueryExecutor) {\n        return new AnalysisQueryService(analysisQueryExecutor);\n    }\n}`);
  await put(root, `server/src/main/java/${pp}/server/controller/AnalysisController.java`, `package ${pkg}.server.controller;\n\nimport ${pkg}.client.query.AnalysisQuery;\nimport ${pkg}.client.response.AnalysisResult;\nimport ${pkg}.core.service.AnalysisQueryService;\nimport org.springframework.web.bind.annotation.PostMapping;\nimport org.springframework.web.bind.annotation.RequestBody;\nimport org.springframework.web.bind.annotation.RequestMapping;\nimport org.springframework.web.bind.annotation.RestController;\n\n/**\n * 数据分析查询接口。\n *\n * @author system\n * @date ${generatedAt}\n */\n@RestController\n@RequestMapping("/api/analysis")\npublic class AnalysisController {\n    private final AnalysisQueryService analysisQueryService;\n\n    public AnalysisController(AnalysisQueryService analysisQueryService) {\n        this.analysisQueryService = analysisQueryService;\n    }\n\n    /**\n     * 分页查询数据分析结果。\n     *\n     * @author system\n     * @date ${generatedAt}\n     * @param query 数据分析分页查询条件\n     * @return 数据分析分页结果\n     */\n    @PostMapping("/query")\n    public AnalysisResult query(@RequestBody AnalysisQuery query) {\n        return analysisQueryService.execute(query);\n    }\n}`);
  if (o.withMock) await put(root, `server/src/test/java/${pp}/server/controller/AnalysisControllerTest.java`, `package ${pkg}.server.controller;\n\nimport org.junit.jupiter.api.Test;\nimport org.springframework.beans.factory.annotation.Autowired;\nimport org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;\nimport org.springframework.boot.test.context.SpringBootTest;\nimport org.springframework.test.context.ActiveProfiles;\nimport org.springframework.test.web.servlet.MockMvc;\n\nimport static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;\nimport static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;\nimport static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;\n\n@SpringBootTest\n@AutoConfigureMockMvc\n@ActiveProfiles("mock")\nclass AnalysisControllerTest {\n    @Autowired private MockMvc mockMvc;\n\n    @Test\n    void returnsMockAnalysis() throws Exception {\n        mockMvc.perform(post("/api/analysis/query").contentType("application/json").content("{\\\"pageNo\\\":1,\\\"pageSize\\\":10}"))\n            .andExpect(status().isOk())\n            .andExpect(jsonPath("$.source").value("mock"));\n    }\n}`);
}
async function wrapper(root) {
  const source = path.join(SHARED_SKILLS_ROOT, "yss-ddd-scaffold-generator", "assets", "wrapper");
  if (!await exists(source)) fail(`Maven Wrapper 资产不存在: ${source}`);
  await cp(source, root, { recursive: true });
}
async function generate(o) {
  await assertEmpty(o.targetDir);
  const skillUtils = await ensureSkillUtils(o.targetDir, { apply: !o.dryRun });
  assertGitAvailable();
  o.gitAuthor = resolveGitAuthor();
  generatedJavadocAuthor = o.gitAuthor;
  const mavenSettings = await resolveMavenSettings(o);
  o.mavenSettings = mavenSettings.path;
  o.mavenSettingsSource = mavenSettings.source;
  const wrapperSource = path.join(SHARED_SKILLS_ROOT, "yss-ddd-scaffold-generator", "assets", "wrapper");
  if (!await exists(wrapperSource)) fail(`Maven Wrapper 资产不存在: ${wrapperSource}`);
  const backendRelative = ".";
  const driver = o.database === "oceanbase-oracle" ? "com.oceanbase:oceanbase-client:2.4.3" : "com.oracle.database.jdbc:ojdbc8:19.8.0.0";
  const plan = { project_name: o.projectName, project_version: "2.0.0-SNAPSHOT", base_package: o.basePackage, target_dir: o.targetDir, backend_root: backendRelative, skill_utils_dir: path.relative(o.targetDir, skillUtils.path).replaceAll(path.sep, "/"), skill_utils_created: skillUtils.created, skill_utils_refreshed: skillUtils.refreshed, skill_utils_backup: skillUtils.backup, repository_scope: "external-repository", database: o.database, database_driver: driver, runtime_java: "8", parent_pom: "com.yss.cloud:yss-cloud-microservice:2.0.0-SNAPSHOT", components_bom: "com.yss.cloud:yss-components-bom:2.0.0-SNAPSHOT", persistence_profile: "yss-mybatis-plus", id_strategy: "ASSIGN_ID", javadoc_author: o.gitAuthor, maven_settings_mode: "external", maven_settings_source: o.mavenSettingsSource, maven_settings_required: Boolean(o.mavenSettings), features: ["audit", "distributed-id", "excel", "nacos", "redis", "openfeign", "smart-doc", "userinfo", "actuator"], modules: MODULES, mock_enabled: o.withMock, project_instance: true, git_initialized: true, default_branch: "main", endpoint: o.withMock ? "POST /api/analysis/query" : null };
  if (o.dryRun) { console.log(JSON.stringify({ mode: "dry-run", ...plan }, null, 2)); return; }
  const targetParent = path.dirname(o.targetDir);
  await mkdir(targetParent, { recursive: true });
  const staging = await mkdtemp(path.join(targetParent, `.${path.basename(o.targetDir)}.staging-`));
  const work = { ...o, targetDir: staging, backendRoot: staging };
  try {
    for (const module of MODULES) { await put(work.backendRoot, `${module}/pom.xml`, modulePom(work, module)); await mkdir(path.join(work.backendRoot, module, "src/main/resources"), { recursive: true }); }
    await put(work.backendRoot, "pom.xml", parentPom(work));
    const originalTarget = work.targetDir; work.targetDir = work.backendRoot; await javaSources(work); work.targetDir = originalTarget;
    const activeProfiles = `\${app.env:dev},datasource,nacos,${o.database === "oceanbase-oracle" ? "oceanbase-oracle" : "oracle"}${o.withMock ? ",mock" : ""}`;
    await put(work.backendRoot, "server/src/main/resources/bootstrap.yml", `server:\n  port: \${SERVER_PORT:8080}\nspring:\n  application:\n    name: \${APP_NAME:${o.projectName}}\n  profiles:\n    active: ${activeProfiles}\n  main:\n    allow-bean-definition-overriding: true\n  servlet:\n    multipart:\n      max-file-size: \${MAX_FILE_SIZE:100MB}\n      max-request-size: \${MAX_REQUEST_SIZE:100MB}`);
    await put(work.backendRoot, "server/src/main/resources/bootstrap-nacos.yml", `spring:\n  cloud:\n    nacos:\n      discovery:\n        server-addr: \${nacosserver:192.168.165.58:8848}\n        group: \${nacos_group:yss-dm}\n        namespace: \${namespace:yss-datamiddle}\n        enabled: true\n      config:\n        import-check:\n          enabled: false\n        server-addr: \${nacosserver:192.168.165.58:8848}\n        namespace: \${namespace:yss-datamiddle}\n        group: \${nacos_group:yss-dm}\n        file-extension: yml\n        enabled: true`);
    if (o.withMock) await put(work.backendRoot, "server/src/main/resources/bootstrap-mock.yml", `spring:\n  cloud:\n    nacos:\n      discovery:\n        enabled: false\n      config:\n        enabled: false\n        import-check:\n          enabled: false`);
    await put(work.backendRoot, "server/src/main/resources/application-mock.yml", `spring:\n  autoconfigure:\n    exclude:\n      - org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration\n      - com.yss.cloud.mybatis.MybatisPlusConfiguration\n      - com.yss.cloud.sankuai.config.LeafDataSourceConfiguration\n  leaf:\n    leafSegmentEnable: false\n    leafSnowflakeEnable: false\nyss:\n  audit:\n    enabled: false`);
    const driver = o.database === "oceanbase-oracle" ? "com.oceanbase.jdbc.Driver" : "oracle.jdbc.OracleDriver";
    await put(work.backendRoot, `server/src/main/resources/application-${o.database}.yml`, `spring:\n  datasource:\n    driver-class-name: ${driver}\n    url: \${DB_URL:}\n    username: \${DB_USERNAME:}\n    password: \${DB_PASSWORD:}\nyss:\n  id:\n    strategy: ASSIGN_ID`);
    const generatedAt = generatedAtLocal();
    await put(work.backendRoot, "server/src/main/resources/logback-spring.xml", await renderAsset("logback-spring.xml.template", { PROJECT_NAME: o.projectName, BASE_PACKAGE: o.basePackage }));
    await put(work.backendRoot, "server/src/main/resources/smart-doc.json", await renderAsset("smart-doc.json.template", { PROJECT_NAME: o.projectName, BASE_PACKAGE: o.basePackage, GENERATED_AT: generatedAt }));
    await put(staging, "README.md", `# ${o.projectName}\n\n项目根即 Maven 后端工程根。固定模块：${MODULES.join("、")}。\n\nMock：运行 \`mvnw.cmd spring-boot:run -pl ${o.projectName}-server -Dspring-boot.run.profiles=mock\`。`);
    await projectInstanceEnvelope(work);
    await wrapper(work.backendRoot);
    if (process.env.NODE_ENV === "test" && process.env.YSS_SCAFFOLD_TEST_FAIL_AFTER_STAGING === "1") fail("测试注入：staging 后失败");
    initializeGit(staging);
    await put(staging, ".yss/scaffold-generation.json", JSON.stringify({ schema_version: 1, skill: "data-analysis-project-scaffold", generation_mode: "controlled-generation", generated_at: new Date().toISOString(), ...plan }, null, 2));
    if (process.env.NODE_ENV === "test" && process.env.YSS_SCAFFOLD_TEST_WRITE_TARGET_DURING_STAGING === "1") await put(o.targetDir, "keep.txt", "concurrent content");
    if (await exists(o.targetDir)) await rmdir(o.targetDir);
    await rename(staging, o.targetDir);
  } catch (error) {
    if (await exists(staging)) await rm(staging, { recursive: true, force: true });
    throw error;
  }
  console.log(JSON.stringify({ mode: "generated", ...plan }, null, 2));
}

generate(parse(process.argv.slice(2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
