#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "./vendor/yaml.mjs";
const root = path.resolve(process.argv[2] || path.dirname(fileURLToPath(import.meta.url)), "..");
try { const p = parseDocument(await readFile(path.join(root, "docs/process/mvc-governance-profile.yaml"), "utf8"), { uniqueKeys: true }).toJS(); if (p.profile_id !== "yss.mvc.backend" || p.architecture_style !== "mvc" || p.runtime_scope !== "backend-only" || p.frontend?.status !== "not-applicable" || p.domain_driven_design?.status !== "not-applicable") throw new Error("MVC Profile 不正确"); console.log("MVC 后端治理 Profile 验证通过"); } catch (e) { console.error(`MVC 后端治理 Profile 验证失败: ${e.message}`); process.exitCode = 1; }
