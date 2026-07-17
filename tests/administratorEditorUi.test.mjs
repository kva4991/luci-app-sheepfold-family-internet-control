/*
 * Защищает границу модалок администратора: UI может собрать поля, но не имеет
 * доступа к UCI, router-control и генерации одноразовых секретов. Тест читает
 * исходники и не заменяет реальное сопряжение Android с тестовым роутером.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const root = 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/';
const overview = readFileSync(root + 'view/sheepfold/overview.js', 'utf8');
const editor = readFileSync(root + 'sheepfold/features/administrators/editor.js', 'utf8');

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
    assert.match(overview, /function showAdminSettingsModal[\s\S]*activateAdministratorPairingCode/);
    assert.match(overview, /function showAdminSettingsModal[\s\S]*startAdminPairingWatcher/);
  });

  it('keeps blocklist and access cleanup in the protected binding operation', () => {
    const binding = functionBody(overview, 'applyAdminDeviceBindings', 'ensureStaticDhcpSection');

    assert.match(binding, /adminDeviceCanBeBound/);
    assert.match(binding, /group', NOT_CONFIGURED_GROUP/);
    assert.match(binding, /schedules', ''/);
    assert.match(binding, /status', 'allow'/);
    assert.match(binding, /admin_device', '1'/);
    assert.match(binding, /updateMacList\('allowlist', mac, true\)/);
    assert.match(binding, /updateMacList\('blocklist', mac, false\)/);
    assert.match(binding, /saveSheepfoldAccessChanges\(\)/);
  });

  it('creates a fresh pairing code for every settings session', () => {
    const settings = functionBody(overview, 'showAdminSettingsModal', 'pairingButton');

    assert.match(settings, /var temporaryPassword = generatePairingCode\(\)/);
    assert.doesNotMatch(settings, /admin\.temporaryPassword/);
    assert.match(settings, /activateAdministratorPairingCode\(admin, temporaryPassword\)/);
  });

  it('updates administrator and device views after commit without reloading LuCI', () => {
    const add = functionBody(overview, 'persistNewAdministrator', 'showAddAdministratorModal');
    const bind = functionBody(overview, 'persistAdministratorDeviceBindings', 'showAdminDeviceBindingModal');

    assert.match(add, /applyAdminDeviceBindings[\s\S]*refreshUserListsWithoutPageReload/);
    assert.match(bind, /applyAdminDeviceBindings[\s\S]*refreshUserListsWithoutPageReload/);
    assert.doesNotMatch(add, /window\.location\.reload/);
    assert.doesNotMatch(bind, /window\.location\.reload/);
    assert.match(editor, /'readonly': 'readonly'/);
  });
});
