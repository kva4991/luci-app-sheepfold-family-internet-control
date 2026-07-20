/*
 * Проверяет полноту переводимых строк Sheepfold и согласованность каталогов LuCI.
 * Тест только читает исходники/словари и не меняет locale; визуальное размещение
 * длинных переводов подтверждается отдельно браузерным тестом.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePoEntries, poEntriesObject } from '../tools/quality/poCatalog.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const overviewPath = resolve(packageDir, 'htdocs/luci-static/resources/view/sheepfold/overview.js');
const maintenancePath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/features/router/maintenance.js');
const logPanelPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/features/logs/panel.js');
const notificationSettingsPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/features/notifications/settings.js');
const i18nModulePath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/i18n.js');
const ruJsonPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/i18n/ru.json');
const zhHansJsonPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/i18n/zh_Hans.json');
const poPath = resolve(packageDir, 'po/ru/sheepfold.po');
const zhHansPoPath = resolve(repoRoot, 'po/zh_Hans/sheepfold.po');

function readProjectFile(path) {
  return readFileSync(resolve(packageDir, path), 'utf8');
}

describe('overview localization', () => {
  it('uses gettext _() instead of the legacy T() dictionary', () => {
    const source = [overviewPath, maintenancePath, logPanelPath, notificationSettingsPath]
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');

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
    assert.equal(entries.get('Notifications'), 'Уведомления');
    assert.equal(entries.get('Notify administrators about SIM card changes'), 'Уведомлять администраторов о смене SIM-карты');
  });

  it('includes overview.js in xgettext extraction list', () => {
    const xgettext = readProjectFile('xgettext.sh');

    assert.match(xgettext, /MODULE_DIR="htdocs\/luci-static\/resources\/sheepfold"/);
    assert.match(xgettext, /find "\$VIEW_DIR" "\$MODULE_DIR"/);
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
    assert.equal(catalog['Clear log'], 'Очистить журнал');
    assert.equal(catalog['clear log'], 'очистить журнал');
    assert.equal(catalog['Auto-assigned to No restrictions'], 'Автоматически добавлено в "Без ограничений"');
    assert.equal(catalog['Blocklist emergency-useful sites access'], 'Доступ пользователей из чёрного списка к "аварийно-полезным сайтам"');
    assert.equal(catalog['Site lists are applied by Sheepfold.'], 'Списки сайтов применены Sheepfold.');
    assert.equal(
      catalog['The Sheepfold filter is active in AdGuard Home, but the DNS path is not yet verified.'],
      'Фильтр Sheepfold активен в AdGuard Home, но путь DNS-запросов пока не проверен.',
    );
    assert.equal(catalog['AdGuard Home protection is disabled.'], 'Защита AdGuard Home выключена.');
    assert.equal(catalog.Notifications, 'Уведомления');
    assert.equal(
      catalog['Control rules confirmed: %s of %s.'],
      'Контрольные правила подтверждены: %s из %s.',
    );
    assert.equal(
      catalog['The AdGuard Home filter exists, but its control rules are not confirmed.'],
      'Фильтр Sheepfold существует в AdGuard Home, но его контрольные правила не подтверждены.',
    );
  });

  it('keeps committed client catalogs reproducible from their PO sources', () => {
    for (const [sourcePath, jsonPath] of [
      [poPath, ruJsonPath],
      [zhHansPoPath, zhHansJsonPath],
    ]) {
      const poEntries = poEntriesObject(readFileSync(sourcePath, 'utf8'));
      const clientEntries = JSON.parse(readFileSync(jsonPath, 'utf8'));

      assert.deepEqual(clientEntries, poEntries, `${jsonPath} differs from ${sourcePath}`);
    }
  });
});
