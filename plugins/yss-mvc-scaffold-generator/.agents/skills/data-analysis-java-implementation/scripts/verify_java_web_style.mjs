#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--project-root");
if (rootIndex < 0 || !args[rootIndex + 1]) {
  process.stderr.write("必须提供 --project-root\n");
  process.exit(1);
}

const projectRoot = path.resolve(args[rootIndex + 1]);
const javaRoot = path.join(projectRoot, "server", "src", "main", "java");
const violations = [];

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function controllerFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await controllerFiles(target));
    if (entry.isFile() && entry.name.endsWith("Controller.java") && /[\\/]controller[\\/]/.test(target)) files.push(target);
  }
  return files;
}

function lineOf(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function add(kind, file, line, message) {
  violations.push(`${kind}: ${path.relative(projectRoot, file)}:${line} ${message}`);
}

function tagLines(doc, tag) {
  return [...doc.matchAll(new RegExp(`^\\s*\\*\\s+@${tag}(?:\\s+([^\\s*]+))?`, "gm"))];
}

function validateCommonDoc(doc, file, line, subject) {
  if (!/^\s*\*\s+[^@\s][^\r\n]*$/m.test(doc)) add("smart-doc-javadoc-contract", file, line, `${subject} 缺少业务说明`);
  if (!/^\s*\*\s+@author\s+[^\s*][^\r\n]*$/m.test(doc)) add("smart-doc-javadoc-contract", file, line, `${subject} 缺少独立且非空的 @author`);
  if (!/^\s*\*\s+@date\s+\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}\s*$/m.test(doc)) add("smart-doc-javadoc-contract", file, line, `${subject} 缺少格式为 yyyy/MM/dd HH:mm 的独立 @date`);
}

function splitParameters(parameters) {
  const result = [];
  let current = "";
  let angle = 0;
  let round = 0;
  let square = 0;
  for (const character of parameters) {
    if (character === "<") angle += 1;
    if (character === ">") angle = Math.max(0, angle - 1);
    if (character === "(") round += 1;
    if (character === ")") round = Math.max(0, round - 1);
    if (character === "[") square += 1;
    if (character === "]") square = Math.max(0, square - 1);
    if (character === "," && angle === 0 && round === 0 && square === 0) {
      result.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) result.push(current);
  return result.map((parameter) => {
    const withoutAnnotations = parameter.replace(/@\w+(?:\([^)]*\))?\s*/g, "").replace(/\bfinal\s+/g, "").trim();
    const match = withoutAnnotations.match(/([A-Za-z_$][\w$]*)\s*$/);
    return match ? match[1] : null;
  }).filter(Boolean);
}

function inspectController(file, source) {
  for (const match of source.matchAll(/\/\*\*[^\r\n]*@(author|date|param|return)[^\r\n]*\*\//g)) {
    add("smart-doc-javadoc-contract", file, lineOf(source, match.index), "Javadoc block tag 必须独占一行");
  }
  for (const match of source.matchAll(/@(Post|Get|Put|Delete|Patch|Request)Mapping[^\r\n]*\bpublic\s+/g)) {
    add("java-format-contract", file, lineOf(source, match.index), "Mapping 注解与 public 方法签名必须分行");
  }
  for (const match of source.matchAll(/^\s*public\s+(?!class\b|interface\b)[^\r\n]*\{[^\r\n]*\}\s*$/gm)) {
    add("java-format-contract", file, lineOf(source, match.index), "public 方法签名、方法体和返回语句不得压缩在同一行");
  }

  const classMatch = source.match(/(\/\*\*[\s\S]*?\*\/)\s*@RestController[\s\S]*?public\s+class\s+([A-Za-z_$][\w$]*)/);
  if (!classMatch) {
    add("smart-doc-javadoc-contract", file, 1, "@RestController 类缺少结构化类级 Javadoc");
  } else {
    validateCommonDoc(classMatch[1], file, lineOf(source, classMatch.index), `Controller ${classMatch[2]}`);
  }

  const classDeclarationIndex = source.search(/public\s+class\s+[A-Za-z_$][\w$]*/);
  const methodScope = classDeclarationIndex >= 0 ? source.slice(classDeclarationIndex) : source;
  const mappingCount = [...methodScope.matchAll(/@(Post|Get|Put|Delete|Patch|Request)Mapping\b/g)].length;
  const methodPattern = /(\/\*\*[\s\S]*?\*\/)\s*((?:@(?!Valid\b|RequestBody\b|PathVariable\b)\w+(?:\([^)]*\))?\s*)+)public\s+([^\s]+)\s+([A-Za-z_$][\w$]*)\s*\(([\s\S]*?)\)\s*(?:throws\s+[^{]+)?\{/g;
  let parsedMethods = 0;
  for (const match of source.matchAll(methodPattern)) {
    if (!/@(Post|Get|Put|Delete|Patch|Request)Mapping\b/.test(match[2])) continue;
    parsedMethods += 1;
    const [doc, returnType, methodName, parameters] = [match[1], match[3], match[4], match[5]];
    const line = lineOf(source, match.index);
    validateCommonDoc(doc, file, line, `接口方法 ${methodName}`);
    const documentedParams = new Set(tagLines(doc, "param").map((item) => item[1]));
    for (const parameter of splitParameters(parameters)) {
      if (!documentedParams.has(parameter)) add("smart-doc-javadoc-contract", file, line, `接口方法 ${methodName} 缺少独立 @param ${parameter}`);
    }
    if (returnType !== "void" && tagLines(doc, "return").length === 0) add("smart-doc-javadoc-contract", file, line, `接口方法 ${methodName} 缺少独立 @return`);
  }
  if (parsedMethods !== mappingCount) add("smart-doc-javadoc-contract", file, 1, `Mapping 方法数 ${mappingCount} 与可验证的结构化 Javadoc 方法数 ${parsedMethods} 不一致`);
}

try {
  if (!await exists(javaRoot)) throw new Error(`server Java 源码目录不存在: ${javaRoot}`);
  const files = await controllerFiles(javaRoot);
  if (files.length === 0) throw new Error("server/controller 下未找到 Controller.java");
  for (const file of files) inspectController(file, await readFile(file, "utf8"));
  if (violations.length) {
    process.stderr.write(`${violations.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Java Web 格式与 Smart-doc Javadoc 验证通过：${files.length} 个 Controller\n`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
