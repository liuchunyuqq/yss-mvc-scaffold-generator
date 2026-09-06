import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_REGISTRY, ROOT, loadRegistry, validateRegistry } from "./lib/lifecycle-registry.mjs";
import { validateJsonSchema } from "./lib/json-schema.mjs";
import { isTemplateSource } from "./lib/repository-mode.mjs";

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: ROOT, encoding: "utf8", ...options });
}

try {
  const { values } = parseArgs({ options: { registry: { type: "string" } }, strict: true });
  const registryPath = values.registry ? path.resolve(values.registry) : DEFAULT_REGISTRY;
  const schemaPath = path.join(ROOT, "docs/process/schemas/lifecycle-registry.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  if (schema.properties?.schema_version?.const !== 1) throw new TypeError("生命周期注册表 JSON Schema 缺少 schema_version 约束");
  const registry = loadRegistry(registryPath);
  validateJsonSchema(registry, schemaPath, { label: "生命周期注册表 JSON Schema" });
  validateRegistry(registry);
  if (registryPath === DEFAULT_REGISTRY) {
    const generated = run("node", ["scripts/node-generate-lifecycle-artifacts.mjs", "--check"]);
    if (generated.status !== 0) throw new TypeError(`${generated.stdout}${generated.stderr}`.trim());
    for (const relativePath of ["docs/process/lifecycle-registry.yaml", "docs/process/lifecycle-registry-baseline.json", "docs/process/schemas/lifecycle-registry.schema.json"]) {
      const ignored = run("git", ["check-ignore", "-q", relativePath]);
      if (ignored.status === 0) throw new TypeError(`权威注册表资产不得被 Git 忽略: ${relativePath}`);
    }
    const stalePaths = ["AGENTS.md", "README.md", "docs/user-guide/用户手册.md", ".agents/skills/yss-product-lifecycle/SKILL.md", "docs/process/lifecycle-artifact-map.md"];
    if (isTemplateSource(ROOT)) stalePaths.push(".template-source/derived/harness-work-unit-map.md");
    for (const relativePath of stalePaths) {
      if (/\d+\s*个(?:主阶段|门禁|工作单元|职责点)/.test(readFileSync(path.join(ROOT, relativePath), "utf8"))) {
        throw new TypeError(`${relativePath} 不得手工声明生命周期对象数量；请引用 lifecycle-registry.yaml`);
      }
    }
    const publicSkills = JSON.parse(readFileSync(path.join(ROOT, "yss-public-skills.json"), "utf8"));
    const groups = new Map(publicSkills.groupings.map((group) => [group.title, group.skills]));
    if (!groups.get("后端")?.includes("yss-web-controller")) throw new TypeError("yss-web-controller 必须在后端分组");
    if (groups.get("前端")?.includes("yss-web-controller")) throw new TypeError("yss-web-controller 不得在前端分组");
  }
  process.stdout.write(`生命周期注册表验证通过（${registry.status}）\n`);
} catch (error) {
  process.stderr.write(`生命周期注册表验证失败: ${error.message}\n`);
  process.exitCode = 1;
}
