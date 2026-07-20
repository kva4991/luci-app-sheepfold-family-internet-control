/*
 * Дополняет git diff --check для untracked-файлов: проверяет trailing whitespace
 * и ровно один финальный перевод строки. Бинарные файлы пропускаются, исходники
 * не переписываются автоматически. §qassist
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from './gitChanges.mjs';

export function inspectWhitespace(source, path = '') {
  const value = Buffer.isBuffer(source) ? source : Buffer.from(String(source), 'utf8');
  if (value.includes(0)) return [];
  const text = value.toString('utf8');
  const issues = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (/[ \t]+$/.test(lines[index])) issues.push({ path, line: index + 1, code: 'trailingWhitespace' });
  }
  if (text && !/\r?\n$/.test(text)) issues.push({ path, line: lines.length, code: 'missingFinalNewline' });
  if (/(?:\r?\n){2,}$/.test(text)) issues.push({ path, line: lines.length, code: 'extraBlankLineAtEof' });
  return issues;
}

export function auditChangedWhitespace(changes, options = {}) {
  const cwd = options.cwd || repoRoot;
  const issues = [];
  for (const change of changes) {
    if (change.status === 'D') continue;
    const absolutePath = resolve(cwd, change.path);
    if (!existsSync(absolutePath)) continue;
    issues.push(...inspectWhitespace(readFileSync(absolutePath), change.path));
  }
  return issues;
}
