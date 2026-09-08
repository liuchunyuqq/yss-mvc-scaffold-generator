#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkJavaWebStyle } from './lib/java-web-style.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
function visit(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.isFile() && entry.name.endsWith('.java')) for (const error of checkJavaWebStyle(readFileSync(file, 'utf8'))) errors.push(`${path.relative(root, file)}: ${error}`);
  }
}
for (const module of ['server', 'client', 'core', 'repository', 'adapter', 'feign-client']) visit(path.join(root, module, 'src/main/java'));
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Java Web/Javadoc 检查通过');
