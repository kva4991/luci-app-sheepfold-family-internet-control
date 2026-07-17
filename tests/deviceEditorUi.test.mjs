/*
 * Защищает разделение формы устройства и операций доступа/DHCP. Тест проверяет
 * исходники и порядок локального обновления; фактические UCI, DHCP и nftables
 * дополнительно должны проверяться на живом тестовом роутере.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const root = 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/';
const overview = readFileSync(root + 'view/sheepfold/overview.js', 'utf8');
const editor = readFileSync(root + 'sheepfold/features/devices/editor.js', 'utf8');
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
    assert.match(overview, /function showDeviceSettingsModal[\s\S]*deviceEditor\.open/);
    assert.match(editor, /function open\(deps, device\)/);
    assert.match(editor, /error = deps\.validate\(payload\)/);
    assert.match(editor, /deps\.persist\(payload\)/);
    assert.doesNotMatch(editor, /uci\.(?:get|set|unset|remove)|routerControl|saveUciChanges|applySheepfoldAccessRuntime/);
  });

  it('protects administrator devices and explicit access-list conflicts', () => {
    const validation = functionBody(overview, 'validateDeviceSettings', 'persistDeviceSettings');

    assert.match(validation, /isAdminDevice\(device\)/);
    assert.match(validation, /payload\.status !== 'allow'/);
    assert.match(validation, /macInSheepfoldList\('blocklist'/);
    assert.match(validation, /macInSheepfoldList\('allowlist'/);
    assert.match(validation, /Static lease requires an IP address/);
    assert.match(editor, /groupField\.input\.disabled = true/);
    assert.match(editor, /statusField\.input\.disabled = true/);
  });

  it('commits router state before refreshing local tables and group cards', () => {
    const persistence = functionBody(overview, 'persistDeviceSettings', 'showDeviceSettingsModal');

    assert.match(persistence, /markNoRestrictionsAutoExcluded/);
    assert.match(persistence, /markPersonalDevicesAutoExcluded/);
    assert.match(persistence, /updateMacList\('allowlist'/);
    assert.match(persistence, /updateMacList\('blocklist'/);
    assert.match(persistence, /saveUciChanges[\s\S]*applySheepfoldAccessRuntime/);
    assert.ok(persistence.indexOf('applySheepfoldAccessRuntime') < persistence.indexOf('device.name = payload.name'));
    assert.match(persistence, /refreshUserListsWithoutPageReload\(\)/);
    assert.match(persistence, /refreshGroupPanel\(\)/);
    assert.doesNotMatch(persistence, /window\.location\.reload/);
  });

  it('keeps AI-only activity logging removable from the Standard package', () => {
    assert.match(editor, /SHEEPFOLD_AI_BEGIN/);
    assert.match(editor, /SHEEPFOLD_AI_END/);
    assert.match(overview, /activityLogEnabled = !isAdminDevice/);
  });

  it('translates the administrator-device protection message', () => {
    const message = 'Administrator devices must remain in the allowlist and outside ordinary groups.';

    assert.equal(ru[message], 'Админские устройства должны оставаться в белом списке и вне обычных групп.');
    assert.equal(zhHans[message], '管理员设备必须保留在白名单中，且不得加入普通分组。');
  });
});
