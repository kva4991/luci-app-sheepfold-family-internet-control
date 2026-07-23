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

test('planned parent placeholders are replaced by router-backed screens', () => {
  assert.match(main, /client\.loadAdminConfig\(\)/);
  assert.match(main, /3 -> SchedulesTab\(/);
  assert.match(main, /4 -> GroupsTab\(/);
  assert.match(main, /5 -> AdministratorsTab\(/);
  assert.match(main, /6 -> WifiTab\(/);
  assert.match(main, /logsIndex -> LogsTab\(/);
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
    'RouterWifiModule', 'RouterTimeRange',
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
  assert.match(operations, /client\.setWifiEnabled/);
  assert.match(operations, /client\.clearLog/);
  assert.match(operations, /wifi_security_note/);
  assert.doesNotMatch(operations, /wifiPassword|pairingCode|password_hash/);
  assert.doesNotMatch(client, /activate-admin-pairing-code|pair-token/);
});
