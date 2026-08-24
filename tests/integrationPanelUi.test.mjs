/*
 * Защищает композицию вкладки интеграций и её узкий callback-контракт. Реальный
 * AdGuard Home/Podkop runtime проверяется отдельными backend и router-тестами.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { readOverviewApplication } from '../tools/quality/overviewApplicationSource.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resources = resolve(root, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources');
const overview = readOverviewApplication(resolve(resources, 'view/sheepfold/overview.js'));
const panel = readFileSync(resolve(resources, 'sheepfold/features/integrations/panel.js'), 'utf8');
const settingsController = readFileSync(resolve(resources, 'sheepfold/features/settings/controller.js'), 'utf8');
const remoteSupportPlan = readFileSync(resolve(root, 'docs/remote-support-access-plan.ru.md'), 'utf8');
const implementationStatus = readFileSync(resolve(root, 'docs/current-implementation-status.md'), 'utf8');

describe('Integration settings panel §frontmod §dompol §ipv6pod', () => {
  it('owns integration and site-filter UI outside the overview composer', () => {
    assert.match(overview, /require sheepfold\.features\.integrations\.panel as integrationPanel/);
    assert.match(settingsController, /panel\('integrations', deps\.integrationPanel\.render\(integrationUi\), active\)/);
    assert.match(panel, /Use together with/);
    assert.match(panel, /Site filtering is performed through/);
    assert.match(panel, /Automatic AdGuard Home management/);
    assert.doesNotMatch(overview, /function siteFilteringIntegrationBox|function integrationModeNotes/);
  });

  it('keeps sensitive persistence and runtime operations in the coordinator', () => {
    assert.match(panel, /deps\.sectionInput/);
    assert.match(panel, /deps\.setOptions/);
    assert.match(panel, /deps\.compactStatus/);
    assert.doesNotMatch(panel, /\buci\.(get|set|unset|remove)|\bfs\.|routerControl|saveUciChanges/);
  });

  it('shows remote support only as an inert and honest placeholder §rsup001', () => {
    const placeholderStart = panel.indexOf('function remoteSupportPlaceholder()');
    const placeholderEnd = panel.indexOf('\nfunction render(', placeholderStart);
    const placeholder = panel.slice(placeholderStart, placeholderEnd);

    assert.ok(placeholderStart >= 0 && placeholderEnd > placeholderStart);
    assert.match(panel, /Remote help from Sheepfold support/);
    assert.match(panel, /The feature is not available yet/);
    assert.match(panel, /No remote access module is installed/);
    assert.match(placeholder, /'type': 'button',\s*'disabled': 'disabled',\s*'title': unavailableNote/);
    assert.doesNotMatch(placeholder, /\bdeps\.|runCommand|runAction|fetch\(|\buci\.|setOption/);
    assert.doesNotMatch(panel, /remote_support_mode|create-access|remote-support install/);
    assert.match(remoteSupportPlan, /в LuCI реализована только неактивная заглушка/);
    assert.match(remoteSupportPlan, /Remote support не отключает IPv6|Удалённая помощь не включает настройку `Выключить IPv6/);
    assert.match(implementationStatus, /only its inert LuCI placeholder/);
  });
});
