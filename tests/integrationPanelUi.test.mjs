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
});
