/*
 * Быстрая локальная проверка относительных Markdown-ссылок и §-тегов. Она не
 * обращается в интернет и не оценивает истинность текста, зато ловит потерянные
 * файлы и незарегистрированные контракты сразу после рефакторинга. §qassist
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { repoRoot } from './gitChanges.mjs';

const inlineLinkPattern = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+['"][^'"]*['"])?\s*\)/g;
// Пробел после двоеточия отделяет Markdown reference от PowerShell
// `[Environment]::Method(...)`, который иначе выглядит как сломанная ссылка.
const referenceLinkPattern = /^\s*\[[^\]]+\]:[ \t]+(<[^>]+>|\S+)/gm;
const tagPattern = /§[a-z][a-z0-9]{2,}/g;
const ignoredExampleTags = new Set(['§xxxxxxx']);

function cleanTarget(rawTarget) {
  const unwrapped = String(rawTarget || '').replace(/^<|>$/g, '');
  try {
    return decodeURIComponent(unwrapped).split('#')[0].split('?')[0];
  } catch {
    return unwrapped.split('#')[0].split('?')[0];
  }
}

function isLocalRelative(target) {
  return Boolean(target)
    && !target.startsWith('#')
    && !target.startsWith('/')
    && !/^[a-z][a-z0-9+.-]*:/i.test(target);
}

export function markdownTargets(source) {
  const targets = [];
  for (const pattern of [inlineLinkPattern, referenceLinkPattern]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) targets.push(match[1]);
  }
  return targets;
}

export function registeredTags(tagMapSource) {
  return new Set([...tagMapSource.matchAll(/`(§[a-zA-Z0-9_-]+)`/g)].map((match) => match[1]));
}

export function auditDocumentation(paths, options = {}) {
  const cwd = options.cwd || repoRoot;
  const read = options.read || ((path) => readFileSync(path, 'utf8'));
  const exists = options.exists || existsSync;
  const tagMapPath = resolve(cwd, 'docs/dev/tag-map.md');
  const knownTags = options.knownTags || registeredTags(read(tagMapPath));
  const brokenLinks = [];
  const unknownTags = [];
  const checkedFiles = [];

  for (const relativePath of [...new Set(paths)].sort()) {
    if (extname(relativePath).toLowerCase() !== '.md') continue;
    const absolutePath = resolve(cwd, relativePath);
    if (!exists(absolutePath)) continue;
    const source = read(absolutePath);
    checkedFiles.push(relativePath);

    for (const rawTarget of markdownTargets(source)) {
      const target = cleanTarget(rawTarget);
      if (!isLocalRelative(target)) continue;
      const resolvedTarget = resolve(dirname(absolutePath), target);
      if (!exists(resolvedTarget)) brokenLinks.push({ file: relativePath, target });
    }

    for (const tag of new Set(source.match(tagPattern) || [])) {
      if (!knownTags.has(tag) && !ignoredExampleTags.has(tag)) unknownTags.push({ file: relativePath, tag });
    }
  }

  return { checkedFiles, brokenLinks, unknownTags };
}

export function formatDocumentationAudit(report) {
  const lines = [`Проверено Markdown-файлов: ${report.checkedFiles.length}.`];
  if (!report.brokenLinks.length && !report.unknownTags.length) {
    lines.push('Относительные ссылки и §-теги исправны.');
    return lines.join('\n');
  }
  for (const item of report.brokenLinks) lines.push(`BROKEN_LINK ${item.file}: ${item.target}`);
  for (const item of report.unknownTags) lines.push(`UNKNOWN_TAG ${item.file}: ${item.tag}`);
  return lines.join('\n');
}
