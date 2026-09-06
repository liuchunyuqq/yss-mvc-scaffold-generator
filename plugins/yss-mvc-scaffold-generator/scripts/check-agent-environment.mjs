import { existsSync, lstatSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { treeHash } from "./lib/skill-supply-chain.mjs";

const root = path.resolve(import.meta.dirname, "..");
const projectLockPath = path.join(root, "skills-lock.json");
const projectLock = JSON.parse(readFileSync(projectLockPath, "utf8"));
const skillUtils = path.resolve(root, projectLock.distribution?.skillUtilsDir ?? "../skillUtils");
const lockPath = path.join(skillUtils, "skills-lock.json");
if (!existsSync(lockPath)) {
  console.error(`技能工具包不存在或缺少锁文件: ${skillUtils}`);
  console.error("请在项目父目录手动安装 skillUtils 后重新执行检查。");
  process.exit(1);
}
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const requiredToolVersion = projectLock.distribution?.requiredToolVersion;
const compatibility = projectLock.distribution?.compatibility;
const utilsMetadataPath = path.join(skillUtils, "skill-utils.yaml");
if (requiredToolVersion || compatibility) {
  if (!existsSync(utilsMetadataPath)) {
    console.error(`技能工具包缺少元数据文件: ${utilsMetadataPath}`);
    process.exit(1);
  }
  const metadata = readFileSync(utilsMetadataPath, "utf8");
  if (requiredToolVersion && !metadata.includes(`tool_version: ${requiredToolVersion}`)) {
    console.error(`skillUtils 工具版本不匹配: required=${requiredToolVersion}`);
    process.exit(1);
  }
  if (compatibility && !metadata.includes(`compatibility: ${compatibility}`)) {
    console.error(`skillUtils 兼容协议不匹配: required=${compatibility}`);
    process.exit(1);
  }
}
const agent = (process.argv.find((arg) => arg.startsWith("--agent="))?.split("=", 2)[1] ?? "codex").toLowerCase();
const profile = process.argv.find((arg) => arg.startsWith("--profile="))?.split("=", 2)[1];
const roots = {
  codex: path.join(skillUtils, ".codex", "skills"),
  claude: path.join(skillUtils, ".claude", "skills"),
  cursor: path.join(skillUtils, ".cursor", "skills"),
  hermes: path.join(skillUtils, ".hermes", "skills"),
  pi: path.join(skillUtils, ".pi", "skills"),
  qoder: path.join(skillUtils, ".qoder", "skills"),
  trae: path.join(skillUtils, ".trae", "skills"),
};

if (!roots[agent]) throw new Error(`不支持的 Agent: ${agent}`);

const allRequired = { ...(lock.skills?.shared ?? {}), ...(lock.skills?.platform?.[`.${agent}/skills`] ?? {}) };
const profileSkills = profile ? projectLock.profiles?.[profile]?.required_skills : null;
if (profile && !Array.isArray(profileSkills)) { console.error(`未知技能治理 Profile: ${profile}`); process.exit(1); }
const required = profileSkills ? Object.fromEntries(profileSkills.filter((name) => allRequired[name]).map((name) => [name, allRequired[name]])) : allRequired;
const missing = [];
const drift = [];
for (const [name, metadata] of Object.entries(required).sort(([a], [b]) => a.localeCompare(b))) {
  const directory = path.join(roots[agent], name);
  if (!existsSync(directory)) {
    missing.push(name);
    continue;
  }
  if (metadata.effectiveHash) {
    const stat = lstatSync(directory);
    const hashTarget = stat.isDirectory() ? directory : path.resolve(path.dirname(directory), readFileSync(directory, "utf8").trim());
    if (!existsSync(hashTarget) || treeHash(hashTarget) !== metadata.effectiveHash) drift.push(name);
  }
}

console.log(`Agent: ${agent}`);
console.log(`技能目录: ${roots[agent]}`);
console.log(`要求数量: ${Object.keys(required).length}`);
if (missing.length || drift.length) {
  if (missing.length) console.log(`缺少技能: ${missing.join(", ")}`);
  if (drift.length) console.log(`版本或内容不匹配: ${drift.join(", ")}`);
  console.log("状态: NOT_READY");
  console.log("请安装或修复上述技能后重新执行本检查；本命令不会自动下载或覆盖技能。");
  process.exitCode = 1;
} else {
  console.log("状态: READY");
}
