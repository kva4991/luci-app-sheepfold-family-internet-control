/*
 * CLI печатает консервативную карту влияния и ничего не меняет. Правила, Git и
 * формат отчёта вынесены отдельно, поэтому оболочка остаётся простой и не скрывает
 * ошибки парсинга аргументов за логикой продукта. §impact1 §testwhy
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatImpact, inspectChanges } from '../tools/quality/changeImpact.mjs';
import { collectGitChanges } from '../tools/quality/gitChanges.mjs';

async function stdinPaths() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input.split(/\r?\n/).filter(Boolean);
}

export function parseImpactArgs(args) {
  const result = { json: false, mode: null, base: 'origin/main', paths: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') result.json = true;
    else if (arg === '--staged') result.mode = 'staged';
    else if (arg === '--working-tree') result.mode = 'working';
    else if (arg === '--git') {
      result.mode = 'base';
      if (args[index + 1] && !args[index + 1].startsWith('--')) result.base = args[++index];
    } else result.paths.push(arg);
  }
  return result;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseImpactArgs(args);
  const changes = options.mode
    ? collectGitChanges({ mode: options.mode, base: options.base })
    : (options.paths.length ? options.paths : await stdinPaths());
  const report = inspectChanges(changes);
  if (!report.files.length) {
    console.error('Не получены изменённые пути. Используйте --git, --staged, --working-tree либо передайте пути.');
    return 2;
  }
  console.log(options.json ? JSON.stringify(report, null, 2) : formatImpact(report));
  return 0;
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) process.exitCode = await main();

export { formatImpact, inspectChanges } from '../tools/quality/changeImpact.mjs';
export { collectGitChanges, collectGitPaths, parseNameStatus } from '../tools/quality/gitChanges.mjs';
