import { readFileSync } from 'node:fs';
import { selectDevelopmentAction } from './lib/acceptance-policy.mjs';
try {
  const input = JSON.parse(readFileSync(process.argv[2] ?? 0, 'utf8'));
  console.log(JSON.stringify({ next_action: selectDevelopmentAction(input) }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
