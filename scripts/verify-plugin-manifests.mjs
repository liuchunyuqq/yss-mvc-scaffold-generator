#!/usr/bin/env node
// 校验 Codex 与 Claude Code 两套插件清单保持一致。
// 用法：node scripts/verify-plugin-manifests.mjs
// 退出码：0 一致；1 存在差异或文件缺失。
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginName = "yss-mvc-scaffold-generator";
const pluginRoot = path.join(repositoryRoot, "plugins", pluginName);
const problems = [];

const files = {
  codexMarketplace: path.join(repositoryRoot, ".agents/plugins/marketplace.json"),
  claudeMarketplace: path.join(repositoryRoot, ".claude-plugin/marketplace.json"),
  codexPlugin: path.join(pluginRoot, ".codex-plugin/plugin.json"),
  claudePlugin: path.join(pluginRoot, ".claude-plugin/plugin.json")
};

async function loadJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    problems.push(`无法读取或解析 ${path.relative(repositoryRoot, file)}: ${error.message}`);
    return null;
  }
}

// Codex 本地迭代时会给版本追加 `+codex.<timestamp>` 构建元数据，比较时忽略。
const baseVersion = (value) => String(value ?? "").split("+")[0];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function expectEqual(label, left, right, leftName, rightName) {
  if (!same(left, right)) {
    problems.push(`${label} 不一致：${leftName}=${JSON.stringify(left)} / ${rightName}=${JSON.stringify(right)}`);
  }
}

const [codexMarketplace, claudeMarketplace, codexPlugin, claudePlugin] = await Promise.all([
  loadJson(files.codexMarketplace),
  loadJson(files.claudeMarketplace),
  loadJson(files.codexPlugin),
  loadJson(files.claudePlugin)
]);

if (codexPlugin && claudePlugin) {
  for (const field of ["name", "description", "author", "homepage", "repository", "keywords"]) {
    expectEqual(`plugin.json ${field}`, codexPlugin[field], claudePlugin[field], "codex", "claude");
  }
  expectEqual("plugin.json version（忽略 +codex 后缀）", baseVersion(codexPlugin.version), baseVersion(claudePlugin.version), "codex", "claude");
  expectEqual("plugin.json skills 路径", path.posix.normalize(codexPlugin.skills ?? "./skills/"), path.posix.normalize(claudePlugin.skills ?? "./skills/"), "codex", "claude");
  if (codexPlugin.name !== pluginName) problems.push(`.codex-plugin/plugin.json name 应为 ${pluginName}`);
  if (claudePlugin.name !== pluginName) problems.push(`.claude-plugin/plugin.json name 应为 ${pluginName}`);
  if (!/^[a-z0-9-]+$/.test(claudePlugin.name ?? "")) problems.push("Claude Code 插件名必须是 kebab-case");
  if (/^claude-/.test(claudePlugin.name ?? "")) problems.push("Claude Code 插件名不能以 claude- 开头");
  if (!claudePlugin.version) problems.push(".claude-plugin/plugin.json 缺少 version");
}

if (codexMarketplace && claudeMarketplace) {
  expectEqual("marketplace name", codexMarketplace.name, claudeMarketplace.name, "codex", "claude");
  if (!/^[a-z0-9-]+$/.test(claudeMarketplace.name ?? "")) problems.push("Claude Code marketplace 名称必须是 kebab-case");
  if (["org", "org-provisioned", "unknown"].includes(String(claudeMarketplace.name).toLowerCase())) problems.push(`Claude Code 保留的 marketplace 名称: ${claudeMarketplace.name}`);
  if (!claudeMarketplace.owner?.name) problems.push(".claude-plugin/marketplace.json 缺少 owner.name");
  const codexEntry = (codexMarketplace.plugins ?? []).find((entry) => entry.name === pluginName);
  const claudeEntry = (claudeMarketplace.plugins ?? []).find((entry) => entry.name === pluginName);
  if (!codexEntry) problems.push(`.agents/plugins/marketplace.json 未登记 ${pluginName}`);
  if (!claudeEntry) problems.push(`.claude-plugin/marketplace.json 未登记 ${pluginName}`);
  if (codexEntry && claudeEntry) {
    const codexPath = typeof codexEntry.source === "string" ? codexEntry.source : codexEntry.source?.path;
    const claudePath = typeof claudeEntry.source === "string" ? claudeEntry.source : claudeEntry.source?.path;
    expectEqual("marketplace 插件路径", codexPath, claudePath, "codex", "claude");
    expectEqual("marketplace category", codexEntry.category, claudeEntry.category, "codex", "claude");
    if (typeof claudePath !== "string" || !claudePath.startsWith("./") || claudePath.split("/").includes("..")) problems.push("Claude Code marketplace 相对路径必须以 ./ 开头且不得包含 ..");
    if (claudeEntry.description !== undefined && claudePlugin && claudeEntry.description !== claudePlugin.description) problems.push("Claude Code marketplace 条目 description 与 plugin.json 不一致");
    if (claudeEntry.version !== undefined && claudePlugin && baseVersion(claudeEntry.version) !== baseVersion(claudePlugin.version)) problems.push("Claude Code marketplace 条目 version 与 plugin.json 不一致");
  }
}

// skills 目录与入口 SKILL.md 必须真实存在，否则两个平台都无法发现 Skill。
const skillsDir = path.join(pluginRoot, claudePlugin?.skills ?? "./skills/");
const skillEntry = path.join(skillsDir, pluginName, "SKILL.md");
if (!(await stat(skillEntry).then((info) => info.isFile()).catch(() => false))) {
  problems.push(`缺少 Skill 入口: ${path.relative(repositoryRoot, skillEntry)}`);
} else {
  const skill = await readFile(skillEntry, "utf8");
  const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const skillName = frontmatter?.[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  if (skillName !== pluginName) problems.push(`SKILL.md frontmatter name 应为 ${pluginName}，实际为 ${skillName ?? "缺失"}`);
  if (!frontmatter?.[1].match(/^description:\s*\S/m)) problems.push("SKILL.md frontmatter 缺少 description");
}

if (problems.length) {
  console.error("插件清单校验失败：");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`插件清单校验通过：${pluginName} ${baseVersion(claudePlugin.version)}（Codex + Claude Code，marketplace=${claudeMarketplace.name}）`);
