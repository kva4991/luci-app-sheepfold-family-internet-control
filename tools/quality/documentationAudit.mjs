/*
 * Быстрая локальная проверка относительных Markdown-ссылок, §-тегов и буквальных
 * ссылок на тестовый контур. Она не обращается в интернет и не оценивает
 * истинность текста, зато ловит потерянные файлы, команды и контракты сразу после
 * рефакторинга. §qassist
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { repoRoot } from './gitChanges.mjs';

const inlineLinkPattern = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+['"][^'"]*['"])?\s*\)/g;
// Пробел после двоеточия отделяет Markdown reference от PowerShell
// `[Environment]::Method(...)`, который иначе выглядит как сломанная ссылка.
const referenceLinkPattern = /^\s*\[[^\]]+\]:[ \t]+(<[^>]+>|\S+)/gm;
const tagPattern = /§[a-z][a-z0-9]{2,}/g;
const testFilePattern = /(?<![A-Za-z0-9._<>-])([A-Za-z0-9][A-Za-z0-9._-]*\.test\.mjs)(?![A-Za-z0-9._-])/g;
const npmRunPattern = /\bnpm(?:\.cmd)?\s+run\s+([A-Za-z0-9:_-]+)/g;
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

export function documentedTestFiles(source) {
  return [...new Set([...source.matchAll(testFilePattern)].map((match) => match[1]))];
}

export function documentedNpmScripts(source) {
  return [...new Set(
    [...source.matchAll(npmRunPattern)]
      .map((match) => match[1])
      // `test:<category>` является объясняющим шаблоном, а не именем команды.
      .filter((name) => !name.endsWith(':')),
  )];
}

export function auditDocumentation(paths, options = {}) {
  const cwd = options.cwd || repoRoot;
  const read = options.read || ((path) => readFileSync(path, 'utf8'));
  const exists = options.exists || existsSync;
  const tagMapPath = resolve(cwd, 'docs/dev/tag-map.md');
  const knownTags = options.knownTags || registeredTags(read(tagMapPath));
  const knownTestFiles = options.knownTestFiles || new Set(
    readdirSync(resolve(cwd, 'tests'))
      .filter((name) => name.endsWith('.test.mjs')),
  );
  const packageScripts = options.packageScripts || new Set(
    Object.keys(JSON.parse(read(resolve(cwd, 'package.json'))).scripts || {}),
  );
  const brokenLinks = [];
  const unknownTags = [];
  const missingTestFiles = [];
  const missingNpmScripts = [];
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

    for (const testFile of documentedTestFiles(source)) {
      if (!knownTestFiles.has(testFile)) missingTestFiles.push({ file: relativePath, testFile });
    }

    for (const script of documentedNpmScripts(source)) {
      if (!packageScripts.has(script)) missingNpmScripts.push({ file: relativePath, script });
    }
  }

  return { checkedFiles, brokenLinks, unknownTags, missingTestFiles, missingNpmScripts };
}

export function formatDocumentationAudit(report) {
  const lines = [`Проверено Markdown-файлов: ${report.checkedFiles.length}.`];
  if (
    !report.brokenLinks.length
    && !report.unknownTags.length
    && !report.missingTestFiles.length
    && !report.missingNpmScripts.length
  ) {
    lines.push('Ссылки, §-теги, имена тестов и npm-команды исправны.');
    return lines.join('\n');
  }
  for (const item of report.brokenLinks) lines.push(`BROKEN_LINK ${item.file}: ${item.target}`);
  for (const item of report.unknownTags) lines.push(`UNKNOWN_TAG ${item.file}: ${item.tag}`);
  for (const item of report.missingTestFiles) lines.push(`MISSING_TEST ${item.file}: ${item.testFile}`);
  for (const item of report.missingNpmScripts) lines.push(`MISSING_NPM_SCRIPT ${item.file}: ${item.script}`);
  return lines.join('\n');
}
