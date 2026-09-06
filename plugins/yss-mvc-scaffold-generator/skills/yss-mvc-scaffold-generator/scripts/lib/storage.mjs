import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SKILL_ROOT, fail, exists } from './runtime.mjs';

export async function assertEmpty(target) {
  if (!await exists(target)) return;
  if ((await readdir(target)).length) fail(`目标目录非空，拒绝生成: ${target}`);
}

export async function put(root, relative, content, author) {
  const target = path.join(root, relative);
  const rendered = author ? content.replaceAll("@author system", `@author ${author}`) : content;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${rendered.trim()}\n`, "utf8");
}

export async function renderAsset(name, replacements) {
  let content = await readFile(path.join(SKILL_ROOT, "assets", name), "utf8");
  for (const [token, value] of Object.entries(replacements)) content = content.replaceAll(`{{${token}}}`, value);
  return content;
}

export { ensureMvcEnvironment as ensureSkillUtils } from './mvc-environment.mjs';
