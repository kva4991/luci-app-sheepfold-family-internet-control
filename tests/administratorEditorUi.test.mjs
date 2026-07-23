/*
 * Защищает границу модалок администратора: UI может собрать поля, но не имеет
 * доступа к UCI, router-control и генерации одноразовых секретов. Тест читает
 * исходники и не заменяет реальное сопряжение Android с тестовым роутером.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { readOverviewApplication } from '../tools/quality/overviewApplicationSource.mjs';

const root = 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/';
const overview = readOverviewApplication(root + 'view/sheepfold/overview.js');
const editor = readFileSync(root + 'sheepfold/features/administrators/editor.js', 'utf8');
const controller = readFileSync(root + 'sheepfold/features/administrators/controller.js', 'utf8');
const pairingPersistence = readFileSync(root + 'sheepfold/features/pairing/persistence.js', 'utf8');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0, `${name} must exist`);
  return source.slice(start, end >= 0 ? end : source.length);
}

describe('Administrator editor module §frontmod §pairsec', () => {
  it('delegates all persistence and keeps privileged operations in the coordinator', () => {
    assert.match(overview, /require sheepfold\.features\.administrators\.editor as administratorEditor/);
    assert.match(editor, /function openAdd\(deps, onSave\)/);
    assert.match(editor, /function openBinding\(deps, admin, onSave\)/);
    assert.match(editor, /function openSettings\(deps, admin, pairing, callbacks\)/);
    assert.doesNotMatch(editor, /uci\.(?:get|set|unset|remove)|routerControl|generatePairingCode|activateAdministratorPairingCode|pairingPayload\(/);
    assert.match(overview, /require sheepfold\.features\.administrators\.controller as administratorControllerModel/);
    assert.match(controller, /function showSettings\(admin\)[\s\S]*deps\.persistence\.activate\(admin, temporaryPassword\)/);
    assert.match(controller, /function showSettings\(admin\)[\s\S]*startWatcher\(admin/);
  });

  it('keeps blocklist and access cleanup in the protected binding adapter', () => {
    assert.doesNotMatch(overview, /function applyAdminDeviceBindings/);
    assert.match(pairingPersistence, /deps\.canBind\(device\)/);
    assert.match(pairingPersistence, /group', notConfigured/);
    assert.match(pairingPersistence, /schedules', ''/);
    assert.match(pairingPersistence, /status', 'allow'/);
    assert.match(pairingPersistence, /admin_device', '1'/);
    assert.match(pairingPersistence, /devicePersistence\.updateMacList\('allowlist', mac, true\)/);
    assert.match(pairingPersistence, /devicePersistence\.updateMacList\('blocklist', mac, false\)/);
    assert.match(pairingPersistence, /devicePersistence\.saveAccess\(\['sheepfold'\], function/);
    assert.doesNotMatch(pairingPersistence, /document|window|ui\.showModal|\bE\s*\(/);
  });

  it('creates a fresh pairing code for every settings session', () => {
    const settings = functionBody(controller, 'showSettings', 'createSelector');

    assert.match(settings, /var temporaryPassword = deps\.random\.pairingCode\(\)/);
    assert.doesNotMatch(settings, /admin\.temporaryPassword/);
    assert.match(settings, /deps\.persistence\.activate\(admin, temporaryPassword\)/);
    assert.match(settings, /loadTlsFingerprint\(\)\.then\(function \(fingerprint\) \{[\s\S]*deps\.persistence\.activate\(admin, temporaryPassword\)\.then\(function \(\) \{ openActivated\(fingerprint\)/);
    assert.match(settings, /Preparing secure pairing\.\.\./);
  });

  it('updates administrator and device views after commit without reloading LuCI', () => {
    const add = functionBody(controller, 'persistNew', 'showAdd');
    const bind = functionBody(controller, 'persistBindings', 'showBindings');

    assert.match(add, /deps\.persistence\.persistBindings[\s\S]*reloadAndRefreshDevices/);
    assert.match(bind, /deps\.persistence\.persistBindings[\s\S]*reloadAndRefreshDevices/);
    assert.doesNotMatch(add, /window\.location\.reload/);
    assert.doesNotMatch(bind, /window\.location\.reload/);
    assert.match(editor, /'readonly': 'readonly'/);
  });
});
