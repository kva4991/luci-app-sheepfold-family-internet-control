/*
 * Защищает разделение формы устройства и операций доступа/DHCP. Тест проверяет
 * исходники и порядок локального обновления; фактические UCI, DHCP и nftables
 * дополнительно должны проверяться на живом тестовом роутере.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { readOverviewApplication } from '../tools/quality/overviewApplicationSource.mjs';

const root = 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/';
const overview = readOverviewApplication(root + 'view/sheepfold/overview.js');
const editor = readFileSync(root + 'sheepfold/features/devices/editor.js', 'utf8');
const controller = readFileSync(root + 'sheepfold/features/devices/controller.js', 'utf8');
const devicePersistence = readFileSync(root + 'sheepfold/features/devices/persistence.js', 'utf8');
const ru = JSON.parse(readFileSync(root + 'sheepfold/i18n/ru.json', 'utf8'));
const zhHans = JSON.parse(readFileSync(root + 'sheepfold/i18n/zh_Hans.json', 'utf8'));

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} boundaries must exist`);
  return source.slice(start, end);
}

describe('Device editor module §frontmod §devmut', () => {
  it('owns fields but delegates validation and persistence', () => {
    assert.match(overview, /require sheepfold\.features\.devices\.editor as deviceEditor/);
    assert.match(overview, /require sheepfold\.features\.devices\.controller as deviceControllerModel/);
    assert.match(controller, /function showSettings\(device\)[\s\S]*deps\.editor\.open/);
    assert.match(editor, /function open\(deps, device\)/);
    assert.match(editor, /error = deps\.validate\(payload\)/);
    assert.match(editor, /deps\.persist\(payload, event && event\.currentTarget/);
    assert.doesNotMatch(editor, /uci\.(?:get|set|unset|remove)|routerControl|saveUciChanges|applySheepfoldAccessRuntime/);
  });

  it('protects administrator devices and explicit access-list conflicts', () => {
    const validation = functionBody(controller, 'validateSettings', 'applyLocalResult');

    assert.match(validation, /isAdminDevice\(device\)/);
    assert.match(validation, /payload\.status !== 'allow'/);
    assert.match(validation, /macInList\('blocklist'/);
    assert.match(validation, /macInList\('allowlist'/);
    assert.match(validation, /Static lease requires an IP address/);
    assert.match(editor, /groupField\.input\.disabled = true/);
    assert.match(editor, /statusField\.input\.disabled = true/);
  });

  it('commits through the device adapter before refreshing local tables and group cards', () => {
    const coordinator = functionBody(controller, 'persistSettings', 'showSettings');

    assert.match(coordinator, /deps\.persistence\.persistSettings\(device, payload\)/);
    assert.match(controller, /function persistedFailure\(error, message, closeModal\)[\s\S]*error\.persisted/);
    assert.match(coordinator, /refreshViews\(\)/);
    assert.doesNotMatch(coordinator, /uci\.(?:set|unset)|saveUciChanges|window\.location\.reload/);
    assert.match(devicePersistence, /markNoRestrictionsExcluded/);
    assert.match(devicePersistence, /markPersonalDevicesExcluded/);
    assert.match(devicePersistence, /updateMacList\('allowlist'/);
    assert.match(devicePersistence, /updateMacList\('blocklist'/);
    assert.match(devicePersistence, /saveAccess\(configs, function \(\) \{ return stageSettings\(device, payload\); \}\)/);
    assert.match(devicePersistence, /function applyRuntime\(\)[\s\S]*schedule-sync[\s\S]*site-lists-apply/);
  });

  it('keeps AI-only activity logging removable from the Standard package', () => {
    assert.match(editor, /SHEEPFOLD_AI_BEGIN/);
    assert.match(editor, /SHEEPFOLD_AI_END/);
    assert.match(devicePersistence, /activityLogEnabled = !adminDevice/);
  });

  it('translates the administrator-device protection message', () => {
    const message = 'Administrator devices must remain in the allowlist and outside ordinary groups.';

    assert.equal(ru[message], 'Админские устройства должны оставаться в белом списке и вне обычных групп.');
    assert.equal(zhHans[message], '管理员设备必须保留在白名单中，且不得加入普通分组。');
  });
});
