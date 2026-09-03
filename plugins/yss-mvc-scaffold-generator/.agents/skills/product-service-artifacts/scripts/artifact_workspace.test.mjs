import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "artifact_workspace.mjs");
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
const gitUser = spawnSync("git", ["config", "--get", "user.name"], { encoding: "utf8" }).stdout.trim();
const serviceArgs = ["--service-name", "驾驶舱管理服务", "--service-purpose", "管理驾驶舱定义、布局和组件配置", "--responsibility", "驾驶舱定义管理", "--responsibility", "驾驶舱布局管理", "--non-responsibility", "不负责指标数据计算", "--business-module", "dashboard-definition:驾驶舱定义", "--business-module", "dashboard-layout:布局管理", "--depends-on", "system-service:获取用户与权限"];

test("微服务仓库保存服务语义和功能证据", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "service-artifacts-"));
  const service = path.join(root, "cockpit-dashboard-service");

  let result = run("init-service", "--service-id", "dashboard-service", "--owner", "team-dashboard", "--target-dir", service, ...serviceArgs, "--verification-command", "./mvnw test");
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(path.join(service, "docs/service/service-overview.md"), "utf8"), /驾驶舱布局管理/);
  await stat(path.join(service, "docs/service/current-capabilities.yaml"));

  result = run("create-feature", "--service-root", service, "--feature-id", "dashboard-export", "--owner", "developer-a");
  assert.equal(result.status, 0, result.stderr);
  result = run("add-work-unit", "--service-root", service, "--feature-id", "dashboard-export", "--work-unit-id", "query-data", "--owner", "developer-a", "--allow", "core/", "--allow", "repository/");
  assert.equal(result.status, 0, result.stderr);
  result = run("add-work-unit", "--service-root", service, "--feature-id", "dashboard-export", "--work-unit-id", "generate-excel", "--owner", "developer-b", "--allow", "adapter/");
  assert.equal(result.status, 0, result.stderr);

  const first = path.join(service, "docs/.scratch/dashboard-export/implementation/results/query-data.yaml");
  const second = path.join(service, "docs/.scratch/dashboard-export/implementation/results/generate-excel.yaml");
  assert.notEqual(first, second);
  assert.match(await readFile(first, "utf8"), /owner: "developer-a"/);
  assert.match(await readFile(second, "utf8"), /owner: "developer-b"/);

  result = run("verify", "--root", service);
  assert.equal(result.status, 0, result.stderr);
});

test("无服务语义时默认初始化 skeleton，但不得进入功能开发", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "service-artifacts-"));
  const service = path.join(root, "role-service");
  const emptyRoot = path.join(root, "empty");
  const empty = run("init-service", "--service-id", "empty-service", "--owner", "team-role", "--target-dir", emptyRoot);
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(await readFile(path.join(emptyRoot, ".artifact-workspace.yaml"), "utf8"), /initialization_status: skeleton/);
  assert.match(await readFile(path.join(emptyRoot, "docs/service/service-overview.md"), "utf8"), /待补充/);
  assert.equal(run("verify", "--root", emptyRoot).status, 0);
  assert.notEqual(run("create-feature", "--service-root", emptyRoot, "--feature-id", "role-management", "--owner", "developer-a").status, 0);

  assert.equal(run("init-service", "--service-id", "role-service", "--owner", "team-role", "--target-dir", service, ...serviceArgs, "--verification-command", "./mvnw test").status, 0);
  assert.notEqual(run("init-service", "--service-id", "role-service", "--owner", "team-role", "--target-dir", service, ...serviceArgs).status, 0);
  assert.equal(run("create-feature", "--service-root", service, "--feature-id", "role-management", "--owner", "developer-a").status, 0);
  assert.equal(run("add-work-unit", "--service-root", service, "--feature-id", "role-management", "--work-unit-id", "role-query", "--owner", "developer-a", "--allow", "core/").status, 0);
  assert.notEqual(run("add-work-unit", "--service-root", service, "--feature-id", "role-management", "--work-unit-id", "role-query", "--owner", "developer-b", "--allow", "repository/").status, 0);
  assert.notEqual(run("add-work-unit", "--service-root", service, "--feature-id", "role-management", "--work-unit-id", "unsafe", "--owner", "developer-b", "--allow", "docs/").status, 0);
});

test("单次接入只修改目标微服务", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "register-service-"));
  const legacy = path.join(root, "legacy-dashboard-service");
  await mkdir(legacy, { recursive: true });
  await writeFile(path.join(legacy, "pom.xml"), "<project/>");

  const result = run("register-service", "--service-id", "legacy-dashboard-service", "--service-root", legacy, "--owner", "team-dashboard", ...serviceArgs, "--verification-command", "./mvnw test");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(path.join(legacy, "pom.xml"), "utf8"), "<project/>");
  assert.match(await readFile(path.join(legacy, ".artifact-workspace.yaml"), "utf8"), /initialization_status: ready-for-feature/);
  assert.match(await readFile(path.join(legacy, "docs/service/service-overview.md"), "utf8"), /驾驶舱定义管理/);
  assert.equal(run("verify", "--root", legacy).status, 0);

  const plain = path.join(root, "plain-service");
  await mkdir(plain, { recursive: true });
  await writeFile(path.join(plain, "pom.xml"), "<project/>");
  const skeleton = run("register-service", "--service-id", "plain-service", "--service-root", plain);
  assert.equal(skeleton.status, 0, skeleton.stderr);
  assert.match(await readFile(path.join(plain, ".artifact-workspace.yaml"), "utf8"), /initialization_status: skeleton/);
  assert.match(await readFile(path.join(plain, ".artifact-workspace.yaml"), "utf8"), new RegExp(`owner: ${JSON.stringify(gitUser).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  await stat(path.join(plain, "docs/service/current-capabilities.yaml"));
});

test("创建独立微服务优先路由到服务启动而非功能生命周期", async () => {
  const agents = await readFile(path.join(repositoryRoot, "AGENTS.md"), "utf8");
  assert.match(agents, /独立微服务初始化例外/);
  assert.match(agents, /不要因为尚无 Spec、OpenAPI Freeze、Ticket 或 Slice Contract 而拒绝/);
  assert.match(agents, /默认创建独立服务目录，不写入 `apps\/backend\/`/);

  const registry = await readFile(path.join(repositoryRoot, "docs/agents/yss-skill-registry.yaml"), "utf8");
  const entry = registry.match(/  - id: product-service-artifacts[\s\S]*?(?=\n  - id:)/)?.[0] ?? "";
  assert.match(entry, /layer: core/);
  assert.match(entry, /maturity: verified/);
  assert.match(entry, /instance_default_discoverable: true/);
});
