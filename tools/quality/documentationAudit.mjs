/*
 * Быстрая локальная проверка ссылок, §-тегов, test/npm-контрактов и объективной
 * структуры Markdown. Она не обращается в интернет и не оценивает истинность или
 * литературное качество текста, зато ловит потерянные связи и сломанную разметку
 * сразу после рефакторинга. §qassist §docwrit
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

export function markdownStructureIssues(source) {
  const issues = [];
  const headings = [];
  let fence = null;
  const lines = String(source || '').split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    // Windows-редакторы могут оставить UTF-8 BOM перед первым Markdown-заголовком.
    const contentLine = index === 0 ? line.replace(/^\uFEFF/, '') : line;
    const fenceMatch = contentLine.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = { char: marker[0], size: marker.length, line: index + 1 };
      else if (marker[0] === fence.char && marker.length >= fence.size) fence = null;
      continue;
    }
    if (fence) continue;

    const headingMatch = contentLine.match(/^(#{1,6})\s+\S/);
    if (headingMatch) headings.push({ level: headingMatch[1].length, line: index + 1 });

    for (const imageMatch of contentLine.matchAll(/!\[([^\]]*)\]\(/g)) {
      if (!imageMatch[1].trim()) {
        issues.push({ code: 'MISSING_IMAGE_ALT', line: index + 1, message: 'У изображения отсутствует alt-текст.' });
      }
    }
  }

  const firstLevelHeadings = headings.filter((heading) => heading.level === 1);
  if (!firstLevelHeadings.length) {
    issues.push({ code: 'MISSING_H1', line: 1, message: 'На странице должен быть один заголовок первого уровня.' });
  } else if (firstLevelHeadings.length > 1) {
    for (const heading of firstLevelHeadings.slice(1)) {
      issues.push({ code: 'MULTIPLE_H1', line: heading.line, message: 'На странице допускается только один заголовок первого уровня.' });
    }
  }

  for (let index = 1; index < headings.length; index++) {
    const previous = headings[index - 1];
    const current = headings[index];
    if (current.level > previous.level + 1) {
      issues.push({
        code: 'HEADING_LEVEL_GAP',
        line: current.line,
        message: `Уровень заголовка перескочил с H${previous.level} на H${current.level}.`,
      });
    }
  }

  if (fence) {
    issues.push({ code: 'UNCLOSED_FENCE', line: fence.line, message: 'Блок кода не закрыт.' });
  }
  return issues;
}

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
  const structureIssues = [];
  const checkedFiles = [];

  for (const relativePath of [...new Set(paths)].sort()) {
    if (extname(relativePath).toLowerCase() !== '.md') continue;
    const absolutePath = resolve(cwd, relativePath);
    if (!exists(absolutePath)) continue;
    const source = read(absolutePath);
    checkedFiles.push(relativePath);

    for (const issue of markdownStructureIssues(source)) {
      structureIssues.push({ file: relativePath, ...issue });
    }

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

  return {
    checkedFiles,
    brokenLinks,
    unknownTags,
    missingTestFiles,
    missingNpmScripts,
    structureIssues,
  };
}

export function hasDocumentationIssues(report) {
  return Boolean(
    report.brokenLinks.length
    || report.unknownTags.length
    || report.missingTestFiles.length
    || report.missingNpmScripts.length
    || report.structureIssues.length
  );
}

export function formatDocumentationAudit(report) {
  const lines = [`Проверено Markdown-файлов: ${report.checkedFiles.length}.`];
  if (!hasDocumentationIssues(report)) {
    lines.push('Ссылки, §-теги, имена тестов, npm-команды и структура Markdown исправны.');
    return lines.join('\n');
  }
  for (const item of report.brokenLinks) lines.push(`BROKEN_LINK ${item.file}: ${item.target}`);
  for (const item of report.unknownTags) lines.push(`UNKNOWN_TAG ${item.file}: ${item.tag}`);
  for (const item of report.missingTestFiles) lines.push(`MISSING_TEST ${item.file}: ${item.testFile}`);
  for (const item of report.missingNpmScripts) lines.push(`MISSING_NPM_SCRIPT ${item.file}: ${item.script}`);
  for (const item of report.structureIssues) {
    lines.push(`${item.code} ${item.file}:${item.line}: ${item.message}`);
  }
  return lines.join('\n');
}
