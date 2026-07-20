import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';

const root = process.cwd();
const overviewPath = join(root, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js');
const securePath = join(root, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview-secure.js');
const menuAiPath = join(root, 'package/luci-app-sheepfold-family-internet-control/root/usr/share/luci/menu.d/luci-app-sheepfold-ai.json');
const aclPath = join(root, 'package/luci-app-sheepfold-family-internet-control/root/usr/share/rpcd/acl.d/luci-app-sheepfold-family-internet-control.json');
const defaultsPath = join(root, 'package/luci-app-sheepfold-family-internet-control/root/usr/share/sheepfold/sheepfold.uci.defaults');
const makefilePath = join(root, 'package/luci-app-sheepfold-family-internet-control/Makefile');
const storagePanelPath = join(root, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/storage/panel.js');

const overview = readFileSync(overviewPath, 'utf8');
const secure = readFileSync(securePath, 'utf8');
const acl = readFileSync(aclPath, 'utf8');
const defaults = readFileSync(defaultsPath, 'utf8');
const makefile = readFileSync(makefilePath, 'utf8');
const storagePanel = readFileSync(storagePanelPath, 'utf8');

test('AI assistant and router memory live in settings second-level tabs', () => {
  assert.match(overview, /settingsTabsSecondary/);
  assert.match(overview, /\['ai',\s*'AI assistant'\]/);
  assert.match(overview, /\['storage',\s*'Router memory management'\]/);
  assert.match(overview, /renderSettingsPanel\('ai',\s*this\.renderSettingsAi\(\)\)/);
  assert.match(overview, /renderSettingsPanel\('storage',\s*this\.renderSettingsStorage\(\)\)/);
  assert.match(overview, /sf-settings-tabs-secondary/);
});

test('separate AI LuCI menu entry is disabled', () => {
  assert.equal(existsSync(menuAiPath), false);
});

test('AI provider defaults to not configured in UCI templates', () => {
  assert.match(defaults, /option ai_provider 'none'/);
  assert.match(makefile, /ensure_global_option ai_provider 'none'/);
});

test('storage backends are reachable from LuCI ACL and have default UCI sections', () => {
  assert.match(acl, /sheepfold-usb-storage/);
  assert.match(acl, /sheepfold-yandex-disk/);
  assert.match(acl, /sheepfold-google-drive/);
  assert.match(acl, /sheepfold-log-storage/);
  assert.match(makefile, /ensure_named_section usb usb/);
  assert.match(makefile, /ensure_named_section cloud yandex_disk/);
  assert.match(makefile, /ensure_named_section gdrive google_drive/);
  assert.match(defaults, /option log_storage 'ram'/);
  assert.match(defaults, /config yandex_disk 'cloud'/);
  assert.match(defaults, /config google_drive 'gdrive'/);
});

test('storage tab exposes cloud storage backends and storage status UI', () => {
  assert.match(overview, /require sheepfold\.features\.storage\.panel as storagePanelModel/);
  assert.match(overview, /storagePanel\.render\(\)/);
  assert.doesNotMatch(overview, /function logStorageLocationField|function yandexDiskMaintenancePanel|function googleDriveMaintenancePanel/);
  assert.match(storagePanel, /function logStorageLocationField/);
  assert.match(storagePanel, /yandex_disk/);
  assert.match(storagePanel, /google_drive/);
  assert.match(storagePanel, /sf-storage-status-lamp/);
  assert.match(storagePanel, /router operational memory, cleared on reboot/);
  assert.match(storagePanel, /yandexDiskMaintenancePanel/);
  assert.match(storagePanel, /googleDriveMaintenancePanel/);
  assert.match(storagePanel, /function cloudMaintenancePanel\(config\)/);
  assert.match(storagePanel, /commandPrefix: 'yandex-disk'/);
  assert.match(storagePanel, /commandPrefix: 'google-drive'/);
  assert.match(storagePanel, /config\.commandPrefix \+ '-test'/);
  assert.match(storagePanel, /config\.commandPrefix \+ '-list'/);
  assert.match(storagePanel, /config\.commandPrefix \+ '-restore-config'/);
  assert.match(storagePanel, /config\.commandPrefix \+ '-sync-status'/);
  assert.match(storagePanel, /classPrefix: 'sf-yandex-disk'/);
  assert.match(storagePanel, /classPrefix: 'sf-google-drive'/);
  assert.match(storagePanel, /classPrefix \+ '-backup-select'/);
  assert.match(storagePanel, /Refresh sync status/);
  assert.doesNotMatch(storagePanel, /RAM only \(recommended\)/);
  assert.doesNotMatch(storagePanel, /\buci\.(get|set|unset|remove)/);
});

test('secure wrapper uses valid LuCI inheritance', () => {
  assert.doesNotMatch(secure, /children\.slice\(5,\s*10\)/);
  assert.match(secure, /return view\.extend\(/);
  assert.doesNotMatch(secure, /BaseView\.extend\(/);
});
