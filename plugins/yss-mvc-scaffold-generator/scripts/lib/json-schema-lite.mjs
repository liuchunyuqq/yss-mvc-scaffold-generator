import { isDeepStrictEqual } from "node:util";

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}
function resolveRef(root, reference) {
  if (!reference.startsWith("#/")) throw new TypeError(`不支持的 JSON Schema $ref: ${reference}`);
  return reference.slice(2).split("/").reduce((value, part) => value?.[part.replaceAll("~1", "/").replaceAll("~0", "~")], root);
}
function validateNode(value, schema, root, location, errors) {
  if (schema === true) return;
  if (schema === false) { errors.push(`${location}: schema rejected value`); return; }
  if (schema.$ref) return validateNode(value, resolveRef(root, schema.$ref), root, location, errors);
  if (schema.allOf) for (const item of schema.allOf) validateNode(value, item, root, location, errors);
  if (schema.if) { const probe = []; validateNode(value, schema.if, root, location, probe); validateNode(value, probe.length === 0 ? schema.then ?? true : schema.else ?? true, root, location, errors); }
  if (schema.const !== undefined && !isDeepStrictEqual(value, schema.const)) errors.push(`${location}: 必须等于 ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((item) => isDeepStrictEqual(item, value))) errors.push(`${location}: 不在允许值 ${JSON.stringify(schema.enum)} 中`);
  const types = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : null;
  if (types && !types.some((type) => typeMatches(value, type))) { errors.push(`${location}: 类型必须为 ${types.join("|")}`); return; }
  if (typeof value === "string") { if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${location}: 长度不能小于 ${schema.minLength}`); if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${location}: 不匹配 ${schema.pattern}`); }
  if (Array.isArray(value)) { if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${location}: 数量不能小于 ${schema.minItems}`); if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${location}: 数组元素必须唯一`); if (schema.items) value.forEach((item, index) => validateNode(item, schema.items, root, `${location}.${index}`, errors)); }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) { for (const name of schema.required ?? []) if (!(name in value)) errors.push(`${location}.${name}: 缺少必填字段`); for (const [name, child] of Object.entries(schema.properties ?? {})) if (name in value) validateNode(value[name], child, root, `${location}.${name}`, errors); if (schema.additionalProperties === false) { const allowed = new Set(Object.keys(schema.properties ?? {})); for (const name of Object.keys(value)) if (!allowed.has(name)) errors.push(`${location}.${name}: 不允许的字段`); } }
}
export function validateJsonSchema(value, schema) { const errors = []; validateNode(value, schema, schema, "<root>", errors); if (errors.length) throw new TypeError(errors.join("\n")); }
