/*
 * Protects the parent Android release scope: schedule/group editors and the
 * administrator, Wi-Fi and log screens must use authenticated router data rather
 * than local placeholders. Passing does not replace Android Lint, APK assembly,
 * physical-phone pairing/roaming tests or production signing. §roadmap §pairsec
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const main = read('android/app/src/main/java/app/sheepfold/android/ui/main/OperationalMainScreen.kt');
const client = read('android/app/src/main/java/app/sheepfold/android/router/RouterAdminClient.kt');
const schedules = read('android/app/src/main/java/app/sheepfold/android/ui/main/SchedulesTab.kt');
const groups = read('android/app/src/main/java/app/sheepfold/android/ui/main/GroupsTab.kt');
const operations = read('android/app/src/main/java/app/sheepfold/android/ui/main/RouterOperationsTabs.kt');
const wifi = read('android/app/src/main/java/app/sheepfold/android/ui/main/WifiManagementTab.kt');
const settings = read('android/app/src/main/java/app/sheepfold/android/ui/main/SettingsTab.kt');
const controlMenu = read('android/app/src/main/java/app/sheepfold/android/ui/main/ControlMenuTabs.kt');
const strings = read('android/app/src/main/res/values/strings.xml');
const stringsEn = read('android/app/src/main/res/values-en/strings.xml');

test('planned parent placeholders are replaced by router-backed screens', () => {
  assert.match(main, /client\.loadAdminConfig\(\)/);
  assert.match(main, /"schedules" -> SchedulesTab\(/);
  assert.match(main, /"groups" -> GroupsTab\(/);
  assert.match(main, /"administrators" -> AdministratorsTab\(/);
  assert.match(main, /"wifi" -> WifiTab\(/);
  assert.match(main, /"logs" -> LogsTab\(/);
  assert.match(main, /"menu" -> MenuTab\(/);
  assert.doesNotMatch(main, /PlaceholderTab/);
  assert.doesNotMatch(main, /section_router_managed/);
});

test('schedule and group editors preserve the shared router contract', () => {
  assert.match(schedules, /client\.saveSchedule\(config, updated\)/);
  assert.match(schedules, /client\.deleteSchedule\(config, schedule\.section\)/);
  assert.match(schedules, /RouterTimeRange/);
  assert.match(schedules, /findOppositeScheduleConflict/);
  assert.match(schedules, /filterNot \{ it\.isAdministrator \}/);
  assert.match(groups, /client\.saveGroup\(config, updated\)/);
  assert.match(groups, /client\.deleteGroup\(config, group\.section\)/);
  assert.match(groups, /group\.protectedGroup/);
  assert.match(groups, /devices\.filterNot \{ it\.isAdministrator \}/);
});

test('Android client uses a versioned optimistic API and typed models', () => {
  for (const model of [
    'RouterAdminConfig', 'RouterSchedule', 'RouterGroup', 'RouterAdministrator',
    'RouterWifiModule', 'RouterWifiNetwork', 'RouterTimeRange',
  ]) assert.match(client, new RegExp(`data class ${model}\\b`));
  assert.match(client, /ADMIN_CONFIG_PATH = "\/api\/v1\/admin-config"/);
  assert.match(client, /schemaVersion/);
  assert.match(client, /expectedRevision/);
  assert.match(client, /revision_conflict/);
  assert.match(client, /suspend fun loadLog/);
  assert.match(client, /suspend fun clearLog/);
});

test('administrator and Wi-Fi security boundaries remain explicit', () => {
  assert.match(operations, /Учётные записи и QR остаются в LuCI/);
  assert.match(wifi, /client\.setWifiEnabled/);
  assert.match(wifi, /client\.saveWifiNetwork/);
  assert.match(wifi, /wifiQrPayload/);
  assert.match(wifi, /PasswordVisualTransformation/);
  assert.match(operations, /client\.clearLog/);
  assert.match(wifi, /wifi_security_note/);
  assert.doesNotMatch(operations, /pairingCode|password_hash/);
  assert.doesNotMatch(client, /activate-admin-pairing-code|pair-token/);
});

test('parent settings use compact native controls and expose language', () => {
  assert.match(settings, /ExposedDropdownMenuBox/);
  assert.match(settings, /settings_relock_label/);
  assert.match(settings, /ThemeChoice/);
  assert.match(settings, /AppLanguage\.entries/);
  assert.match(controlMenu, /router_now_enabled/);
  assert.match(controlMenu, /R\.drawable\.ic_refresh/);
  assert.match(controlMenu, /height\(108\.dp\)/);
  assert.match(controlMenu, /tint = if \(isLoading\)/);
  assert.match(strings, /name="router_turn_internet_on">Интернет включить</);
  assert.match(strings, /name="router_turn_internet_off">Интернет выключить</);
  assert.match(strings, /name="router_label_format">Название роутера:/);
  assert.match(stringsEn, /name="router_label_format">Router name:/);
});
