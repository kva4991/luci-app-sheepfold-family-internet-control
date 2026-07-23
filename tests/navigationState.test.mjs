import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const root = resolve(process.cwd(), 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources');
const navigationPath = join(root, 'sheepfold/features/navigation/state.js');
const overviewPath = join(root, 'sheepfold/features/overview/application.js');
const shellPath = join(root, 'sheepfold/features/page/shell.js');
const settingsControllerPath = join(root, 'sheepfold/features/settings/controller.js');
const navigationSource = readFileSync(navigationPath, 'utf8');
const overview = readFileSync(overviewPath, 'utf8');
const shell = readFileSync(shellPath, 'utf8');
const settingsController = readFileSync(settingsControllerPath, 'utf8');

function loadNavigation() {
  const source = navigationSource.replace(/^'require .*?';\r?\n/gm, '');
  const context = { module: { exports: {} }, baseclass: { extend: (value) => value }, Object, Array, String };
  vm.runInNewContext(`(function () { ${source.replace('return baseclass.extend(', 'module.exports = baseclass.extend(')} })()`, context);
  return context.module.exports;
}

test('navigation state owns tab definitions and pure transitions', () => {
  const model = loadNavigation();
  const navigation = model.create();

  assert.equal(navigation.snapshot().activeTab, 'users');
  navigation.selectSettings('storage');
  navigation.selectTop('settings');
  assert.equal(navigation.snapshot().activeSettingsTab, 'storage');
  navigation.selectUserList('blocklist');
  navigation.selectTop('users');
  assert.equal(navigation.snapshot().activeUserListTab, 'blocklist');
  navigation.selectManagement('admins');
  navigation.selectTop('management');
  assert.equal(navigation.snapshot().activeManagementTab, 'admins');
  assert.equal(navigation.restoreChildTab('settings'), 'storage');
  navigation.applyDeepLink(new URLSearchParams('view=admins'));
  assert.equal(navigation.snapshot().activeManagementTab, 'admins');
});

test('overview composes navigation and page shell preserves selected child tabs', () => {
  assert.match(overview, /require sheepfold\.features\.navigation\.state as navigationStateModel/);
  assert.match(overview, /var navigation = navigationStateModel\.create\(\)/);
  assert.match(overview, /return pageShellModel\.create\(/);
  assert.match(shell, /deps\.navigation\.selectTop\(tab\)/);
  assert.match(settingsController, /deps\.navigation\.selectSettings\(tab\)/);
  assert.match(shell, /deps\.navigation\.selectUserList\(tab\)/);
  assert.match(shell, /deps\.navigation\.selectManagement\(tab\)/);
  assert.doesNotMatch(shell, /selectSettings\('general'\)/);
  assert.doesNotMatch(shell, /selectUserList\('devices'\)/);
  assert.doesNotMatch(shell, /selectManagement\('schedules'\)/);
});
