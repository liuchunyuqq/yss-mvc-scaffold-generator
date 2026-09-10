import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new TypeError(`不支持的 JSON Schema 引用: ${ref}`);
  return ref.slice(2).split("/").reduce((current, key) => current?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], root);
}

function validate(value, schema, root, location, errors) {
  if (schema.$ref) return validate(value, resolveRef(root, schema.$ref), root, location, errors);
  const place = location || "<root>";
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${place}: 必须等于 ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))) errors.push(`${place}: 不属于允许值 ${JSON.stringify(schema.enum)}`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(value, type))) { errors.push(`${place}: 类型必须是 ${types.join(" 或 ")}`); return; }
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${place}: 长度不得小于 ${schema.minLength}`);
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) errors.push(`${place}: 不匹配模式 ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${place}: 项目数不得小于 ${schema.minItems}`);
    if (schema.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) errors.push(`${place}: 项目必须唯一`);
    if (schema.items) value.forEach((entry, index) => validate(entry, schema.items, root, `${location}[${index}]`, errors));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${place}: 缺少必填属性 ${key}`);
    const properties = schema.properties ?? {};
    const patterns = Object.entries(schema.patternProperties ?? {}).map(([pattern, child]) => [new RegExp(pattern), child]);
    for (const [key, entry] of Object.entries(value)) {
      const childLocation = location ? `${location}.${key}` : key;
      let matched = false;
      if (properties[key]) { validate(entry, properties[key], root, childLocation, errors); matched = true; }
      for (const [pattern, child] of patterns) if (pattern.test(key)) { validate(entry, child, root, childLocation, errors); matched = true; }
      if (!matched && schema.additionalProperties === false) errors.push(`${childLocation}: 不允许的属性`);
      if (!matched && schema.additionalProperties && typeof schema.additionalProperties === "object") validate(entry, schema.additionalProperties, root, childLocation, errors);
    }
  }
}

export function validateJsonSchema(value, schemaPath, { label = "JSON Schema" } = {}) {
  const effectiveSchema = path.resolve(schemaPath);
  if (!existsSync(effectiveSchema)) throw new TypeError(`缺少 ${label}: ${effectiveSchema}`);
  const schema = JSON.parse(readFileSync(effectiveSchema, "utf8"));
  const errors = [];
  validate(value, schema, schema, "", errors);
  if (errors.length) throw new TypeError(errors.join("\n"));
}
