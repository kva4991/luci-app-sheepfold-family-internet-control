/* Final source contract for removing coordinator forwarding helpers. §coordclean1 §ovfinal1 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resources = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources');
const read = (path) => readFileSync(resolve(resources, path), 'utf8');
const overview = read('sheepfold/features/overview/application.js');
const deviceController = read('sheepfold/features/devices/controller.js');
const devicePersistence = read('sheepfold/features/devices/persistence.js');
const administratorController = read('sheepfold/features/administrators/controller.js');
const backupController = read('sheepfold/features/settings/backup-controller.js');
const settingsController = read('sheepfold/features/settings/controller.js');
const sharedIcons = read('sheepfold/shared/icons.js');

const removedForwarders = [
  'importedSectionByName', 'stageImportedConfig', 'stageImportedPayload',
  'administratorSectionName', 'activateAdministratorPairingCode', 'pairingStatusForAdministrator',
  'ensureSection', 'ensureSheepfoldDeviceSection', 'ensureSheepfoldListSection', 'updateMacList',
  'applyAdminDeviceBindings', 'ensureStaticDhcpSection', 'saveUciChanges',
  'applySheepfoldAccessRuntime', 'saveSheepfoldAccessChanges', 'stageAdministrator',
  'setDeviceBackendStatus', 'applySettingsSideEffects', 'applyPostSaveSideEffects',
];

describe('LuCI forwarding cleanup §coordclean1', () => {
  it('removes local aliases and wires owning modules explicitly', () => {
    for (const name of removedForwarders)
      assert.doesNotMatch(overview, new RegExp(`function\\s+${name}\\s*\\(`), name);

    assert.match(overview, /var uciPersistence = uciPersistenceModel\.create/);
    assert.match(overview, /var devicePersistence = devicePersistenceModel\.create/);
    assert.match(overview, /var backupController = settingsBackupControllerModel\.create/);
    assert.match(overview, /var settingsSideEffects = settingsSideEffectsModel\.create/);
    assert.match(overview, /administratorControllerModel\.create/);
    assert.match(overview, /settingsControllerModel\.create/);
  });

  it('routes the final access-list action through the device controller and persistence adapter', () => {
    assert.match(devicePersistence, /function removeFromList\(device, listName\)/);
    assert.match(devicePersistence, /updateMacList\(listName, mac, false\)/);
    assert.match(devicePersistence, /deps\.uci\.set\('sheepfold', sectionName, 'status', 'new'\)/);
    assert.match(deviceController, /function removeFromList\(device, listName, button\)/);
    assert.match(deviceController, /deps\.persistence\.removeFromList\(device, listName\)/);
    assert.doesNotMatch(deviceController, /\buci\.(?:set|unset|get|save|apply)\s*\(/);
  });

  it('keeps pairing, backup and Settings runtime calls in their focused owners', () => {
    assert.match(administratorController, /deps\.persistence\.activate\(admin, temporaryPassword\)/);
    assert.match(administratorController, /deps\.persistence\.status\(admin, since\)/);
    assert.match(backupController, /deps\.persistence\.apply\(imported, payload\(true\)\)/);
    assert.match(settingsController, /applyRuntime: deps\.sideEffects\.apply/);
    assert.match(settingsController, /applyPostSave: deps\.sideEffects\.applyPostSave/);
  });

  it('keeps direct UCI apply and Wi-Fi reload out of overview.js', () => {
    assert.doesNotMatch(overview, /\buci\.(?:set|unset|remove|add|save|apply)\s*\(/);
    assert.doesNotMatch(overview, /\bfs\.exec\s*\(/);
    assert.doesNotMatch(overview, /function (?:renderSettingsMisc|persistDeviceSettings|showAdminSettingsModal)\b/);
  });

  it('passes the actual icon-button event to action callbacks', () => {
    assert.match(sharedIcons, /'click': function \(event\)[\s\S]*handler\(event\)/);
  });
});
