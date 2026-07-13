import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const overviewPath = resolve(packageDir, 'htdocs/luci-static/resources/view/sheepfold/overview.js');
const i18nModulePath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/i18n.js');
const ruJsonPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/i18n/ru.json');
const poPath = resolve(packageDir, 'po/ru/sheepfold.po');

function readProjectFile(path) {
  return readFileSync(resolve(packageDir, path), 'utf8');
}

function parsePoEntries(source) {
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
    if (msgid) {
      entries.set(msgid, msgstr);
    }
  }

  return entries;
}

describe('overview localization', () => {
  it('uses gettext _() instead of the legacy T() dictionary', () => {
    const source = readFileSync(overviewPath, 'utf8');

    assert.doesNotMatch(source, /var translations\s*=/);
    assert.doesNotMatch(source, /function T\(/);
    assert.doesNotMatch(source, /\bT\(/);
    assert.match(source, /_\('No settings changes to save\.'\)/);
    assert.match(source, /_\(status\)/);
    assert.match(source, /_\(entry\.message\)/);
  });

  it('keeps Russian translations for core overview strings in sheepfold.po', () => {
    const entries = parsePoEntries(readFileSync(poPath, 'utf8'));

    assert.equal(entries.get('User lists'), 'Списки пользователей');
    assert.equal(entries.get('Settings'), 'Настройки');
    assert.equal(entries.get('checking'), 'проверяется');
    assert.equal(entries.get('current version'), 'текущая версия');
  });

  it('includes overview.js in xgettext extraction list', () => {
    const xgettext = readProjectFile('xgettext.sh');

    assert.match(xgettext, /overview\.js/);
    assert.doesNotMatch(xgettext, /переходный словарь T\(\)/);
  });

  it('loads Sheepfold UI language from sheepfold.global.language without syncing luci.main.lang', () => {
    const source = readFileSync(overviewPath, 'utf8');
    const i18nModule = readFileSync(i18nModulePath, 'utf8');

    assert.match(source, /require sheepfold\.i18n as sheepfoldI18n/);
    assert.match(source, /sheepfoldI18n\.installApplicationTranslator/);
    assert.match(source, /sheepfoldI18n\.normalizeApplicationLanguage/);
    assert.match(source, /\['zh_Hans',\s*_\('Chinese \(Simplified\)'\)\]/);
    assert.doesNotMatch(source, /uci\.set\('luci', 'main', 'lang'/);
    assert.match(i18nModule, /installApplicationTranslator/);
    assert.match(i18nModule, /sheepfold\/i18n\//);
  });

  it('ships client-side Russian catalog for Sheepfold-only gettext', () => {
    const catalog = JSON.parse(readFileSync(ruJsonPath, 'utf8'));

    assert.equal(catalog['User lists'], 'Списки пользователей');
    assert.equal(catalog.Settings, 'Настройки');
  });
});