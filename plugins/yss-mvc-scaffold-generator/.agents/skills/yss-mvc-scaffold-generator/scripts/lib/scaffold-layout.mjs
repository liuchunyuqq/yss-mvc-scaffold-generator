import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HARNESS_ROOT } from './runtime.mjs';
const { loadPackageLayout, hashLayout } = await import(pathToFileURL(path.join(HARNESS_ROOT, 'scripts/lib/mvc-package-layout.mjs')).href);

// 仅用于生成器刚刚写出的确定性样例；不能为现有业务源码自动推断职责。
export async function recordScaffoldLayout(root) {
  const policy = loadPackageLayout(root);
  const types = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, {withFileTypes:true}).catch(e => { if(e.code === 'ENOENT') return []; throw e; })) {
      const file = path.join(dir,entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith('.java')) {
        const rel = path.relative(root,file).replaceAll('\\','/');
        const [module, suffix] = rel.split('/src/main/java/');
        if (!suffix) continue;
        const pkg = path.posix.dirname(suffix).replaceAll('/','.');
        const relativePackage = pkg.slice(policy.basePackage.length + 1);
        const matches = policy.rules.filter(r => r.module === module && !(r.excluded_prefixes ?? []).some(p => relativePackage === p || relativePackage.startsWith(p+'.')) && ((r.prefixes ?? []).some(p => relativePackage === p || relativePackage.startsWith(p+'.')) || (r.exact ?? []).includes(relativePackage)));
        if (matches.length !== 1) throw Error(`生成样例职责不唯一: ${rel}`);
        const rule = matches[0];
        types.push({type:pkg+'.'+entry.name.slice(0,-5), module, feature:'scaffold-example', role:rule.role, package:pkg, path:rel, rule_id:rule.rule_id, source_digest:hashLayout(await readFile(file))});
      }
    }
  }
  for (const module of policy.modules) await walk(path.join(root,module,'src/main/java'));
  await writeFile(path.join(root,'docs/process/mvc-scaffold-layout.json'),JSON.stringify({schema_version:1,policy_id:policy.policy_id,policy_version:policy.policy_version,policy_digest:policy.digest,types},null,2)+'\n');
}
