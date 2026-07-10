import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const overviewPath = resolve(packageDir, 'htdocs/luci-static/resources/view/sheepfold/overview.js');
const poPath = resolve(packageDir, 'po/ru/sheepfold.po');
const potPath = resolve(packageDir, 'po/templates/sheepfold.pot');

function parseQuotedPairs(block) {
  const entries = new Map();
  let index = 0;

  while (index < block.length) {
    while (index < block.length && block[index] !== "'") {
      index += 1;
    }
    if (index >= block.length) {
      break;
    }

    index += 1;
    let key = '';
    while (index < block.length) {
      const char = block[index];
      if (char === '\\') {
        key += block[index + 1] || '';
        index += 2;
        continue;
      }
      if (char === "'") {
        index += 1;
        break;
      }
      key += char;
      index += 1;
    }

    while (index < block.length && /\s/.test(block[index])) {
      index += 1;
    }
    if (block[index] !== ':') {
      continue;
    }
    index += 1;
    while (index < block.length && /\s/.test(block[index])) {
      index += 1;
    }
    if (block[index] !== "'") {
      continue;
    }
    index += 1;

    let value = '';
    while (index < block.length) {
      const char = block[index];
      if (char === '\\') {
        value += block[index + 1] || '';
        index += 2;
        continue;
      }
      if (char === "'") {
        index += 1;
        break;
      }
      value += char;
      index += 1;
    }

    entries.set(key, value);
  }

  return entries;
}

function extractTranslations(source) {
  const match = source.match(/var translations = \{([\s\S]*?)\};\s*\nfunction T\(/);
  if (!match) {
    throw new Error('translations dictionary not found in overview.js');
  }
  return parseQuotedPairs(match[1]);
}

function removeTranslationsBlock(source) {
  return source.replace(
    /var translations = \{[\s\S]*?\};\s*\nfunction T\(text\) \{\s*return translations\[text\] \|\| text;\s*\}\s*\n/,
    '',
  );
}

function poEscape(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
}

function formatPoString(text) {
  const escaped = poEscape(text);
  if (!escaped.includes('\\n') && escaped.length <= 100) {
    return `"${escaped}"`;
  }

  const parts = escaped.split('\\n');
  const lines = ['""'];
  parts.forEach((part, partIndex) => {
    const suffix = partIndex < parts.length - 1 ? '\\n' : '';
    lines.push(`"${part}${suffix}"`);
  });
  return lines.join('\n');
}

function parsePo(source) {
  const entries = new Map();
  const blocks = source.split(/\n\n+/);

  for (const block of blocks) {
    const msgidMatch = block.match(/^msgid\s+((?:"[^"]*"|""(?:\n"[^"]*")*)+)/m);
    const msgstrMatch = block.match(/^msgstr\s+((?:"[^"]*"|""(?:\n"[^"]*")*)+)/m);
    if (!msgidMatch || !msgstrMatch) {
      continue;
    }

    const decode = (raw) => raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('"'))
      .map((line) => line.slice(1, -1))
      .join('')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');

    const msgid = decode(msgidMatch[1]);
    const msgstr = decode(msgstrMatch[1]);
    if (!msgid) {
      continue;
    }
    entries.set(msgid, msgstr);
  }

  return entries;
}

function readPoHeader(source) {
  const end = source.indexOf('\n\n');
  return end === -1 ? source : source.slice(0, end + 2);
}

function collectLiteralMsgids(source) {
  const msgids = new Set();
  const pattern = /_\(\s*'((?:\\'|[^'])*)'\s*\)/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    msgids.add(match[1].replace(/\\'/g, "'"));
  }

  return msgids;
}

function buildPoFile(header, entries, references) {
  const sorted = [...entries.keys()].sort((left, right) => left.localeCompare(right));
  const blocks = [header.trimEnd()];

  for (const msgid of sorted) {
    const refs = references.get(msgid) || ['htdocs/luci-static/resources/view/sheepfold/overview.js'];
    const refLines = refs.map((ref) => `#: ${ref}`);
    blocks.push([
      ...refLines,
      `msgid ${formatPoString(msgid)}`,
      `msgstr ${formatPoString(entries.get(msgid) || '')}`,
    ].join('\n'));
  }

  return `${blocks.join('\n\n')}\n`;
}

function buildPotFile(entries, references) {
  const header = [
    '# SOME DESCRIPTIVE TITLE.',
    '# Copyright (C) 2026 THE sheepfold\'S COPYRIGHT HOLDER',
    '# This file is distributed under the same license as the sheepfold package.',
    '#',
    'msgid ""',
    'msgstr ""',
    '"Project-Id-Version: sheepfold\\n"',
    '"Report-Msgid-Bugs-To: \\n"',
    '"POT-Creation-Date: 2026-07-10 12:00+0000\\n"',
    '"PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE\\n"',
    '"Last-Translator: FULL NAME <EMAIL@ADDRESS>\\n"',
    '"Language-Team: LANGUAGE <LL@li.org>\\n"',
    '"MIME-Version: 1.0\\n"',
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
  ].join('\n');

  const sorted = [...entries.keys()].sort((left, right) => left.localeCompare(right));
  const blocks = [header];

  for (const msgid of sorted) {
    const refs = references.get(msgid) || ['htdocs/luci-static/resources/view/sheepfold/overview.js'];
    const refLines = refs.map((ref) => `#: ${ref}`);
    blocks.push([
      ...refLines,
      `msgid ${formatPoString(msgid)}`,
      'msgstr ""',
    ].join('\n'));
  }

  return `${blocks.join('\n\n')}\n`;
}

const overviewSource = readFileSync(overviewPath, 'utf8');
const translations = extractTranslations(overviewSource);
const migratedOverview = removeTranslationsBlock(overviewSource).replace(/\bT\(/g, '_(');
const literalMsgids = collectLiteralMsgids(migratedOverview);

for (const msgid of literalMsgids) {
  if (!translations.has(msgid)) {
    translations.set(msgid, translations.get(msgid) || '');
  }
}

const existingPo = readFileSync(poPath, 'utf8');
const poHeader = readPoHeader(existingPo);
const existingEntries = parsePo(existingPo);
const mergedEntries = new Map(existingEntries);

for (const [msgid, msgstr] of translations) {
  if (msgstr) {
    mergedEntries.set(msgid, msgstr);
  } else if (!mergedEntries.has(msgid)) {
    mergedEntries.set(msgid, '');
  }
}

const references = new Map();
for (const msgid of literalMsgids) {
  references.set(msgid, ['htdocs/luci-static/resources/view/sheepfold/overview.js']);
}
for (const msgid of existingEntries.keys()) {
  if (!references.has(msgid)) {
    references.set(msgid, ['htdocs/luci-static/resources/view/sheepfold/ai.js']);
  }
}

writeFileSync(overviewPath, migratedOverview, 'utf8');
writeFileSync(poPath, buildPoFile(poHeader, mergedEntries, references), 'utf8');
writeFileSync(potPath, buildPotFile(mergedEntries, references), 'utf8');

console.log(`Migrated overview.js: ${literalMsgids.size} _('...') literals`);
console.log(`Updated ru/sheepfold.po: ${mergedEntries.size} entries`);