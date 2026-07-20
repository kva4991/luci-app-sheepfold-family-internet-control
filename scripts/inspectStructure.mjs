/*
 * CLI показывает только изменённые крупные исходники и ничего не переписывает.
 * Он помогает выбрать следующий рефакторинг, но не объявляет размер файла багом
 * без понимания его ответственности и OpenWrt-ограничений. §qassist
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGitChanges } from '../tools/quality/gitChanges.mjs';
import { formatStructureAudit, inspectStructure } from '../tools/quality/structureAudit.mjs';

export function main(args = process.argv.slice(2)) {
  const gitIndex = args.indexOf('--git');
  const base = gitIndex >= 0 && args[gitIndex + 1] && !args[gitIndex + 1].startsWith('--')
    ? args[gitIndex + 1]
    : 'origin/main';
  const changes = collectGitChanges({ base });
  console.log(formatStructureAudit(inspectStructure(changes, { base })));
  return 0;
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) process.exitCode = main();
