import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';

const root = process.cwd();
const overviewPath = join(root, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js');
const securePath = join(root, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview-secure.js');
const menuAiPath = join(root, 'package/luci-app-sheepfold-family-internet-control/root/usr/share/luci/menu.d/luci-app-sheepfold-ai.json');
const aclPath = join(root, 'package/luci-app-sheepfold-family-internet-control/root/usr/share/rpcd/acl.d/luci-app-sheepfold-family-internet-control.json');
const configPath = join(root, 'package/luci-app-sheepfold-family-internet-control/root/etc/config/sheepfold');

const overview = readFileSync(overviewPath, 'utf8');
const secure = readFileSync(securePath, 'utf8');
const acl = readFileSync(aclPath, 'utf8');
const config = readFileSync(configPath, 'utf8');

test('AI assistant and router memory live in settings second-level tabs', () => {
  assert.match(overview, /\['ai',\s*T\('AI assistant'\)\]/);
  assert.match(overview, /\['memory',\s*T\('Router memory management'\)\]/);
  assert.match(overview, /renderSettingsPanel\('ai',\s*this\.renderSettingsAi\(\)\)/);
  assert.match(overview, /renderSettingsPanel\('memory',\s*this\.renderSettingsMemory\(\)\)/);
  assert.match(overview, /function usbStorageSettingsField\(\)/);
});

test('separate AI LuCI menu entry is disabled', () => {
  assert.equal(existsSync(menuAiPath), false);
});

test('USB backend is reachable from LuCI ACL and has default UCI section', () => {
  assert.match(acl, /sheepfold-usb-storage/);
  assert.match(config, /config usb_storage 'usb'/);
  assert.match(config, /option role 'logs_only'/);
});

test('secure wrapper no longer removes AI fields by positional slice', () => {
  assert.doesNotMatch(secure, /children\.slice\(5,\s*10\)/);
  assert.match(secure, /Поля ИИ больше не вырезаем/);
});
