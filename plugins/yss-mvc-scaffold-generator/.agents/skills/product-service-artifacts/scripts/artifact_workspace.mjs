#!/usr/bin/env node
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMMANDS = new Set(["register-service", "init-service", "create-feature", "add-work-unit", "verify"]);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function fail(message) { throw new TypeError(message); }
async function exists(target) { try { await access(target); return true; } catch { return false; } }
function yaml(value) { return JSON.stringify(String(value)); }

function parse(argv) {
  const command = argv.shift();
  if (!COMMANDS.has(command)) fail("命令必须是 register-service、init-service、create-feature、add-work-unit 或 verify");
  const values = {
    command,
    service: [],
    allow: [],
    responsibility: [],
    non_responsibility: [],
    business_module: [],
    depends_on: [],
    verification_command: [],
  };
  while (argv.length) {
    const key = argv.shift();
    if (!key?.startsWith("--") || !argv.length) fail(`无效参数: ${key ?? "<empty>"}`);
    const name = key.slice(2).replaceAll("-", "_");
    const value = argv.shift();
    if (Array.isArray(values[name])) values[name].push(value);
    else values[name] = value;
  }
  return values;
}

function requireValue(options, name) {
  const value = options[name];
  if (typeof value !== "string" || !value.trim()) fail(`缺少 --${name.replaceAll("_", "-")}`);
  return value.trim();
}

function requireId(options, name) {
  const value = requireValue(options, name);
  if (!ID.test(value)) fail(`${name} 必须是小写连字符 ID`);
  return value;
}

function absolute(options, name) { return path.resolve(requireValue(options, name)); }

function resolveOwner(options) {
  if (typeof options.owner === "string" && options.owner.trim()) return options.owner.trim();
  const result = spawnSync("git", ["config", "--get", "user.name"], { encoding: "utf8" });
  const owner = result.status === 0 ? result.stdout.trim() : "";
  if (!owner) fail("未提供 --owner，且无法从 git config user.name 读取");
  return owner;
}

function defaultBasePackage(serviceId) {
  const segments = serviceId.split("-").map((segment) => /^\d/.test(segment) ? `p${segment}` : segment);
  return `com.yss.${segments.join(".")}`;
}

function requireList(options, name) {
  const values = options[name].map((value) => value.trim()).filter(Boolean);
  if (!values.length) fail(`至少提供一个 --${name.replaceAll("_", "-")}`);
  return values;
}

function namedSpec(raw, optionName) {
  const separator = raw.indexOf(":");
  if (separator < 1 || !raw.slice(separator + 1).trim()) fail(`--${optionName} 必须是 <id>:<名称或说明>: ${raw}`);
  const id = raw.slice(0, separator);
  if (!ID.test(id)) fail(`--${optionName} 的 id 必须是小写连字符 ID: ${id}`);
  return { id, text: raw.slice(separator + 1).trim() };
}

function serviceInput(options, serviceId) {
  const purpose = typeof options.service_purpose === "string" ? options.service_purpose.trim() : "";
  const responsibilities = options.responsibility.map((value) => value.trim()).filter(Boolean);
  const nonResponsibilities = options.non_responsibility.map((value) => value.trim()).filter(Boolean);
  const modules = options.business_module.map((value) => namedSpec(value, "business-module"));
  const complete = Boolean(purpose && responsibilities.length && nonResponsibilities.length && modules.length);
  return {
    name: typeof options.service_name === "string" && options.service_name.trim() ? options.service_name.trim() : serviceId,
    purpose,
    responsibilities,
    nonResponsibilities,
    modules,
    dependencies: options.depends_on.map((value) => namedSpec(value, "depends-on")),
    verificationCommands: options.verification_command.map((value) => value.trim()).filter(Boolean),
    complete,
  };
}

async function exclusive(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, { encoding: "utf8", flag: "wx" });
}

async function writeIfMissing(target, content) {
  if (!await exists(target)) await exclusive(target, content);
}

function serviceOverview(serviceId, owner, service) {
  const dependencies = service.dependencies.length
    ? service.dependencies.map((item) => `- ${item.id}：${item.text}`).join("\n")
    : "- 无已知服务依赖";
  const pending = "待补充（当前为服务工程骨架，开始具体功能前完成服务语义登记）。";
  return `# ${service.name}\n\n服务 ID：\`${serviceId}\`  \nOwner：${owner}\n初始化状态：\`${service.complete ? "registered" : "skeleton"}\`\n\n## 服务定位\n\n${service.purpose || pending}\n\n## 服务职责\n\n${service.responsibilities.length ? service.responsibilities.map((item) => `- ${item}`).join("\n") : pending}\n\n## 非职责\n\n${service.nonResponsibilities.length ? service.nonResponsibilities.map((item) => `- ${item}`).join("\n") : pending}\n\n## 业务模块\n\n${service.modules.length ? service.modules.map((item) => `- ${item.text}（\`${item.id}\`）`).join("\n") : pending}\n\n## 依赖服务\n\n${dependencies}\n`;
}

async function writeServiceArtifacts(target, serviceId, owner, service, exclusiveMode = false) {
  const readiness = service.complete ? (service.verificationCommands.length ? "ready-for-feature" : "registered") : "skeleton";
  const write = exclusiveMode ? exclusive : writeIfMissing;
  if (exclusiveMode) await exclusive(path.join(target, ".artifact-workspace.yaml"), `schema_version: 2\nkind: service\nservice_id: ${serviceId}\nowner: ${yaml(owner)}\ninitialization_status: ${readiness}\n`);
  await write(path.join(target, "docs/service/service-overview.md"), serviceOverview(serviceId, owner, service));
  await write(path.join(target, "docs/service/module-map.yaml"), `schema_version: 1\nservice_id: ${serviceId}\nbusiness_modules:${service.modules.length ? `\n${service.modules.map((item) => `  - module_id: ${item.id}\n    name: ${yaml(item.text)}\n    responsibility: ${yaml(item.text)}\n    code_locations: []`).join("\n")}` : " []"}\n`);
  await write(path.join(target, "docs/service/dependencies.yaml"), `schema_version: 1\nservice_id: ${serviceId}\ndepends_on:${service.dependencies.length ? `\n${service.dependencies.map((item) => `  - service_id: ${item.id}\n    purpose: ${yaml(item.text)}`).join("\n")}` : " []"}\n`);
  await write(path.join(target, "docs/service/current-capabilities.yaml"), `schema_version: 1\nservice_id: ${serviceId}\ncapabilities: []\n# 功能验证或发布后由独立归档工作单元更新。\n`);
  await write(path.join(target, "docs/service/module-map.md"), `# ${service.name} Module 地图\n\n业务模块的权威数据位于 \`module-map.yaml\`；代码位置确认后补入 \`code_locations\`。\n`);
  await write(path.join(target, "docs/service/current-capabilities.md"), `# ${service.name} 当前能力\n\n权威数据位于 \`current-capabilities.yaml\`，本文件仅作阅读入口。\n`);
}

async function initService(options) {
  const serviceId = requireId(options, "service_id");
  const owner = resolveOwner(options);
  const service = serviceInput(options, serviceId);
  const target = absolute(options, "target_dir");
  await mkdir(target, { recursive: true });
  const marker = path.join(target, ".artifact-workspace.yaml");
  if (await exists(marker)) fail(`微服务产物已经初始化: ${target}`);
  await writeServiceArtifacts(target, serviceId, owner, service, true);
  const gitignore = path.join(target, ".gitignore");
  if (!await exists(gitignore)) await exclusive(gitignore, ".local/\n");
  process.stdout.write(`已初始化微服务产物: ${target}\n`);
}

async function attachServiceArtifacts(serviceRoot, serviceId, owner, service) {
  await mkdir(serviceRoot, { recursive: true });
  const marker = path.join(serviceRoot, ".artifact-workspace.yaml");
  if (await exists(marker)) {
    const current = await readFile(marker, "utf8");
    if (!new RegExp(`service_id:\\s*${serviceId}(?:\\s|$)`).test(current)) fail("服务目录已绑定其他 service_id");
  } else {
    const readiness = service.complete ? (service.verificationCommands.length ? "ready-for-feature" : "registered") : "skeleton";
    await exclusive(marker, `schema_version: 2\nkind: service\nservice_id: ${serviceId}\nowner: ${yaml(owner)}\ninitialization_status: ${readiness}\n`);
  }
  await writeServiceArtifacts(serviceRoot, serviceId, owner, service);
}

async function registerService(options) {
  const serviceId = requireId(options, "service_id");
  const owner = resolveOwner(options);
  const service = serviceInput(options, serviceId);
  const serviceRoot = absolute(options, "service_root");

  if (!await exists(serviceRoot)) {
    const basePackage = typeof options.base_package === "string" && options.base_package.trim() ? options.base_package.trim() : defaultBasePackage(serviceId);
    const generator = path.resolve(SCRIPT_DIR, "../../data-analysis-project-scaffold/scripts/generate_project.mjs");
    const args = [generator, "--project-name", serviceId, "--base-package", basePackage, "--target-dir", serviceRoot, "--database", options.database || "oracle"];
    if (options.with_mock === "true") args.push("--with-mock");
    const generated = spawnSync(process.execPath, args, { encoding: "utf8" });
    if (generated.status !== 0) fail((generated.stderr || generated.stdout).trim());
  }
  await attachServiceArtifacts(serviceRoot, serviceId, owner, service);
  process.stdout.write(`已创建或接入服务 ${serviceId}，并初始化服务研发产物\n`);
}

async function requireServiceRoot(root) {
  const marker = path.join(root, ".artifact-workspace.yaml");
  if (!await exists(marker) || !/kind:\s*service/.test(await readFile(marker, "utf8"))) fail(`不是已初始化的微服务产物根: ${root}`);
}

async function createFeature(options) {
  const root = absolute(options, "service_root");
  const featureId = requireId(options, "feature_id");
  const owner = requireValue(options, "owner");
  await requireServiceRoot(root);
  const marker = await readFile(path.join(root, ".artifact-workspace.yaml"), "utf8");
  if (!/initialization_status:\s*ready-for-feature/.test(marker)) fail("微服务尚未达到 ready-for-feature；请先登记并验证工程验证命令");
  const feature = path.join(root, "docs/.scratch", featureId);
  if (await exists(feature)) fail(`功能已经存在: ${featureId}`);
  await exclusive(path.join(feature, "feature.md"), `---\nfeature_id: ${featureId}\nowner: ${yaml(owner)}\nstatus: ready-for-human\ndelivery_state: planned\n---\n\n# ${featureId}\n\n## 需求与范围\n\n## 非目标\n\n## 验收标准\n`);
  await exclusive(path.join(feature, "architecture.md"), `# ${featureId} 技术影响\n\n## 受影响 Module\n\n## API 与数据影响\n\n## 事务和风险\n`);
  await exclusive(path.join(feature, "implementation/plan.yaml"), `schema_version: 1\nfeature_id: ${featureId}\nowner: ${yaml(owner)}\nstatus: draft\nwork_units: []\n`);
  await exclusive(path.join(feature, "verification/verification.md"), `# ${featureId} 验证\n\n状态：pending\n`);
  await exclusive(path.join(feature, "review/review.md"), `# ${featureId} Review\n\n状态：draft\n\nReviewer：待分配\n`);
  process.stdout.write(`已创建功能产物: ${featureId}\n`);
}

function validateAllow(value) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || /^[A-Za-z]:/.test(normalized)) fail(`--allow 必须是安全相对路径: ${value}`);
  const broad = new Set([".", "docs", "docs/", "src", "src/", "apps", "apps/", ".git", ".git/"]);
  if (broad.has(normalized)) fail(`--allow 范围过宽: ${value}`);
  return normalized;
}

async function addWorkUnit(options) {
  const root = absolute(options, "service_root");
  const featureId = requireId(options, "feature_id");
  const workUnitId = requireId(options, "work_unit_id");
  const owner = requireValue(options, "owner");
  await requireServiceRoot(root);
  if (!options.allow.length) fail("至少提供一个 --allow");
  const allowed = options.allow.map(validateAllow);
  const feature = path.join(root, "docs/.scratch", featureId);
  if (!await exists(path.join(feature, "feature.md"))) fail(`功能不存在: ${featureId}`);
  const target = path.join(feature, "implementation/results", `${workUnitId}.yaml`);
  await exclusive(target, `schema_version: 1\nfeature_id: ${featureId}\nwork_unit_id: ${workUnitId}\nowner: ${yaml(owner)}\nstatus: planned\nallowed_write_paths:\n${allowed.map((item) => `  - ${yaml(item)}`).join("\n")}\ncommits: []\nchanged_files: []\nverification_results: []\nnew_impacts: []\n`);
  process.stdout.write(`已创建工作单元: ${workUnitId}\n`);
}

async function verify(options) {
  const root = absolute(options, "root");
  const marker = path.join(root, ".artifact-workspace.yaml");
  if (!await exists(marker)) fail("缺少 .artifact-workspace.yaml");
  const content = await readFile(marker, "utf8");
  if (/kind:\s*service/.test(content)) {
    for (const relative of ["docs/service/service-overview.md", "docs/service/module-map.yaml", "docs/service/dependencies.yaml", "docs/service/current-capabilities.yaml"]) if (!await exists(path.join(root, relative))) fail(`微服务缺少 ${relative}`);
    const overview = await readFile(path.join(root, "docs/service/service-overview.md"), "utf8");
    for (const heading of ["服务定位", "服务职责", "非职责", "业务模块", "依赖服务"]) if (!overview.includes(`## ${heading}`)) fail(`服务说明缺少 ${heading}`);
    const modules = await readFile(path.join(root, "docs/service/module-map.yaml"), "utf8");
    const skeleton = /initialization_status:\s*skeleton/.test(content);
    if (!skeleton && (/business_modules:\s*\[\s*\]/m.test(modules) || !/module_id:/m.test(modules))) fail("非 skeleton 微服务至少需要一个业务模块");
    const scratch = path.join(root, "docs/.scratch");
    if (await exists(scratch)) {
      for (const feature of await readdir(scratch)) {
        const base = path.join(scratch, feature);
        for (const relative of ["feature.md", "architecture.md", "implementation/plan.yaml", "verification/verification.md", "review/review.md"]) if (!await exists(path.join(base, relative))) fail(`${feature} 缺少 ${relative}`);
      }
    }
  } else fail("artifact workspace kind 无效");
  process.stdout.write("产物结构验证通过\n");
}

const options = parse(process.argv.slice(2));
const actions = { "register-service": registerService, "init-service": initService, "create-feature": createFeature, "add-work-unit": addWorkUnit, verify };
actions[options.command](options).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
