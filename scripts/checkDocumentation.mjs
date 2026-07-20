/*
 * CLI проверяет документацию целиком либо только изменённые Markdown-файлы.
 * Сеть и внешние URL намеренно не проверяются, чтобы результат был быстрым и
 * воспроизводимым на Windows, в CI и в ограниченной среде агента. §qassist
 */
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDocumentation, formatDocumentationAudit } from '../tools/quality/documentationAudit.mjs';
import { collectGitChanges, repoRoot } from '../tools/quality/gitChanges.mjs';

function markdownTree(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...markdownTree(path));
    else if (entry.name.endsWith('.md')) files.push(relative(repoRoot, path).replaceAll('\\', '/'));
  }
  return files;
}

export function documentationPaths(args) {
  if (args.includes('--all')) {
    return [
      'AGENTS.md',
      'CODING_RULES.md',
      ...markdownTree(resolve(repoRoot, 'docs')),
    ];
  }
  const gitIndex = args.indexOf('--git');
  const base = gitIndex >= 0 && args[gitIndex + 1] && !args[gitIndex + 1].startsWith('--')
    ? args[gitIndex + 1]
    : 'origin/main';
  return collectGitChanges({ base }).map((change) => change.path);
}

export function main(args = process.argv.slice(2)) {
  const report = auditDocumentation(documentationPaths(args));
  console.log(formatDocumentationAudit(report));
  return report.brokenLinks.length || report.unknownTags.length ? 1 : 0;
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) process.exitCode = main();
