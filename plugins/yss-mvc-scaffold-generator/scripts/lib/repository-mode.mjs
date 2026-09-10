import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "../vendor/yaml.mjs";

const VALID_MODES = new Set(["template-source", "project-instance"]);

export function readRepositoryMode(root = process.cwd()) {
  const manifestPath = path.join(root, "yss-project.yaml");
  let source;
  try {
    source = readFileSync(manifestPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new TypeError(`缺少 yss-project.yaml: ${error.message}`);
    }
    throw error;
  }
  const document = parseDocument(source, { maxAliasCount: 0, uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new TypeError(`无法解析 yss-project.yaml: ${document.errors[0].message}`);
  }
  let manifest;
  try {
    manifest = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw new TypeError(`无法解析 yss-project.yaml: ${error.message}`);
  }
  if (
    !manifest || typeof manifest !== "object" || Array.isArray(manifest) ||
    Object.keys(manifest).some(key => !["repository_mode", "schema_version", "governance_profile"].includes(key)) ||
    (manifest.governance_profile !== undefined && (typeof manifest.governance_profile !== "string" || !/^docs\/process\/[a-z0-9-]+\.yaml$/.test(manifest.governance_profile))) ||
    manifest.schema_version !== 1 || !VALID_MODES.has(manifest.repository_mode)
  ) {
    throw new TypeError("yss-project.yaml 必须只声明 schema_version: 1 和合法 repository_mode");
  }
  return manifest.repository_mode;
}

export const isTemplateSource = (root) => readRepositoryMode(root) === "template-source";
export const isProjectInstance = (root) => readRepositoryMode(root) === "project-instance";
