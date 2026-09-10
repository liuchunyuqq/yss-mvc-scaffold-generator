function parameters(signature) {
  const values = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < signature.length; i++) {
    if ('(<['.includes(signature[i])) depth++;
    if (')>]'.includes(signature[i])) depth--;
    if (signature[i] === ',' && depth === 0) { values.push(signature.slice(start, i)); start = i + 1; }
  }
  values.push(signature.slice(start));
  return values;
}

export function checkJavaWebStyle(source) {
  const errors = [];
  if (!/@RestController\b|@Controller\b/.test(source)) return errors;
  const declarations = [...source.matchAll(/(?:public\s+(?:final\s+)?class\s+\w+|public\s+(?:[\w.$<>?,\[\]]+\s+)+\w+\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s*(?:throws\s+[\w.,\s]+)?\{)/g)];
  for (const declaration of declarations) {
    const prefix = source.slice(0, declaration.index);
    const start = prefix.lastIndexOf('/**');
    const end = prefix.indexOf('*/', start);
    const between = prefix.slice(end + 2);
    if (start < 0 || end < 0 || /[{};]/.test(between.replace(/"(?:\\.|[^"\\])*"/g, '""'))) {
      errors.push('Controller 类和公开方法需要紧邻的 Javadoc');
      continue;
    }
    const doc = prefix.slice(start, end + 2);
    for (const tag of ['author', 'date']) if (!new RegExp('^\\s*\\* @' + tag + ' .+$', 'm').test(doc)) errors.push(`Javadoc 缺少独立行 @${tag}`);
    if (!/\* @date \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}\s*$/m.test(doc)) errors.push('Javadoc 日期格式不正确');
    if (!/class\s/.test(declaration[0])) {
      const args = declaration[0].slice(declaration[0].indexOf('(') + 1, declaration[0].lastIndexOf(')'));
      for (const argument of parameters(args)) {
        const name = argument.trim().match(/([\w$]+)\s*$/)?.[1];
        if (name && !new RegExp('\\* @param ' + name + '\\s+\\S').test(doc)) errors.push(`Javadoc 缺少 @param ${name}`);
      }
      if (!/public\s+void\s/.test(declaration[0]) && !/\* @return\s+\S/.test(doc)) errors.push('Javadoc 缺少 @return');
    }
  }
  if (/@(?:\w*Mapping)[^\r\n]*\bpublic\b/.test(source)) errors.push('Mapping 与方法签名不得同行');
  if (/\)\s*\{[^\r\n]*\S[^\r\n]*\}/.test(source)) errors.push('方法体不得单行压缩');
  return [...new Set(errors)];
}
