/*
 * CLI проверяет документацию целиком либо только изменённые Markdown-файлы.
 * Сеть и внешние URL намеренно не проверяются, чтобы результат был быстрым и
 * воспроизводимым на Windows, в CI и в ограниченной среде агента. §qassist
 */
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditDocumentation,
  formatDocumentationAudit,
  hasDocumentationIssues,
} from '../tools/quality/documentationAudit.mjs';
import { collectGitChanges, repoRoot } from '../tools/quality/gitChanges.mjs';

// Скачанные SDK, Gradle и browser/tool caches содержат чужие README с ссылками
// на отсутствующие части их исходных репозиториев. Аудитируем только документацию
// Sheepfold, а не содержимое воспроизводимо создаваемых каталогов.
const ignoredTreeDirectories = new Set([
  '.build',
  '.cache',
  '.git',
  '.gradle',
  'build',
  'local',
  'node_modules',
]);

function markdownTree(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredTreeDirectories.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...markdownTree(path));
    else if (entry.name.endsWith('.md')) files.push(relative(repoRoot, path).replaceAll('\\', '/'));
  }
  return files;
}

export function documentationPaths(args) {
  if (args.includes('--all')) {
    // `--all` означает всю документацию репозитория, включая README тестов,
    // Android-проектов и устанавливаемые privacy notices.
    return markdownTree(repoRoot);
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
  return hasDocumentationIssues(report) ? 1 : 0;
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) process.exitCode = main();
