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
const adminJson = read('android/app/src/main/java/app/sheepfold/android/router/RouterAdminJson.kt');
const models = read('android/app/src/main/java/app/sheepfold/android/router/RouterAdminModels.kt');
const schedules = read('android/app/src/main/java/app/sheepfold/android/ui/main/SchedulesTab.kt');
const groups = read('android/app/src/main/java/app/sheepfold/android/ui/main/GroupsTab.kt');
const scheduleRules = read('android/app/src/main/java/app/sheepfold/android/ui/main/ScheduleConflictRules.kt');
const operations = read('android/app/src/main/java/app/sheepfold/android/ui/main/RouterOperationsTabs.kt');
const wifi = read('android/app/src/main/java/app/sheepfold/android/ui/main/WifiManagementTab.kt');
const wifiAutomation = read('android/app/src/main/java/app/sheepfold/android/ui/main/WifiAutomationCard.kt');
const settings = read('android/app/src/main/java/app/sheepfold/android/ui/main/SettingsTab.kt');
const controlMenu = read('android/app/src/main/java/app/sheepfold/android/ui/main/ControlMenuTabs.kt');
const devices = read('android/app/src/main/java/app/sheepfold/android/ui/main/DevicesTab.kt');
const deviceEditor = read('android/app/src/main/java/app/sheepfold/android/ui/main/DeviceEditorDialog.kt');
const notifications = read('android/app/src/main/java/app/sheepfold/android/ui/main/NotificationsTab.kt');
const agreement = read('android/app/src/main/java/app/sheepfold/android/ui/setup/AgreementAcceptance.kt');
const activity = read('android/app/src/main/java/app/sheepfold/android/MainActivity.kt');
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
  assert.match(main, /"devices" -> DevicesTab\(/);
  assert.match(main, /"lists" -> DeviceListsTab\(/);
  assert.match(main, /"notifications" -> NotificationsTab\(/);
  assert.doesNotMatch(main, /PlaceholderTab/);
  assert.doesNotMatch(main, /section_router_managed/);
});

test('global internet command keeps loading until refreshed router state is available', () => {
  assert.match(main, /suspend fun reloadRouterState\(\)/);
  assert.match(main, /client\.setGlobalBlock\(enabled\)[\s\S]{0,260}reloadRouterState\(\)/);
  assert.doesNotMatch(main, /\.onSuccess\s*\{[\s\S]{0,160}refresh\(\)/);
});

test('schedule and group editors preserve the shared router contract', () => {
  assert.match(schedules, /client\.saveSchedule\(config, updated\)/);
  assert.match(schedules, /client\.deleteSchedule\(config, schedule\.section\)/);
  assert.match(schedules, /RouterTimeRange/);
  assert.match(schedules, /findOppositeScheduleConflict/);
  assert.match(schedules, /filterNot \{ it\.isAdministrator \}/);
  assert.match(groups, /client\.saveGroup\(config, updated\)/);
  assert.match(groups, /client\.deleteGroup\(config, group\.section\)/);
  assert.match(groups, /afterSuccess = \{ editor = null \}/);
  assert.match(groups, /backendError = message\.takeIf \{ messageIsError \}/);
  assert.match(groups, /group\.protectedGroup/);
  assert.match(groups, /devices\.filterNot \{ it\.isAdministrator \}/);
  assert.match(groups, /groupPastelColors/);
  assert.match(groups, /nextGroupColor\(groups\)/);
  assert.match(groups, /group\.deviceIds\.take\(5\)/);
  assert.match(groups, /R\.drawable\.ic_action_settings/);
  assert.match(groups, /R\.drawable\.ic_delete/);
  assert.match(models, /val scheduleIds: List<String>/);
  assert.match(client, /"scheduleIdsPresent" to "1"/);
  assert.match(client, /"scheduleIds" to group\.scheduleIds/);
  assert.match(groups, /schedules = config\.schedules\.filter \{ it\.targetType == "group" \}/);
  assert.match(groups, /selectedScheduleIds/);
  assert.match(scheduleRules, /findSelectedGroupScheduleConflict/);
  assert.match(scheduleRules, /windowsOverlap/);
  assert.doesNotMatch(groups, /groups_color_format/);
  assert.match(schedules, /afterSuccess = \{ editor = null \}/);
  assert.match(schedules, /backendError = message\.takeIf \{ messageIsError \}/);
});

test('Android client uses a versioned optimistic API and typed models', () => {
  for (const model of [
    'RouterAdminConfig', 'RouterSchedule', 'RouterGroup', 'RouterAdministrator',
    'RouterWifiModule', 'RouterWifiNetwork', 'RouterWifiAutomation', 'RouterTimeRange',
    'RouterNotificationSettings',
  ]) assert.match(models, new RegExp(`data class ${model}\\b`));
  assert.match(client, /ADMIN_CONFIG_PATH = "\/api\/v1\/admin-config"/);
  assert.match(client, /schemaVersion/);
  assert.match(client, /RouterAdminJson\.parseConfig/);
  assert.match(client, /expectedRevision/);
  assert.match(client, /revision_conflict/);
  assert.match(client, /suspend fun loadLog/);
  assert.match(client, /suspend fun clearLog/);
  assert.match(client, /suspend fun saveDevice/);
  assert.match(client, /suspend fun saveNotificationSettings/);
  assert.match(client, /suspend fun saveWifiAutomation/);
  assert.match(adminJson, /internal object RouterAdminJson/);
  assert.match(adminJson, /fun parseConfig/);
  assert.match(adminJson, /deviceWrite/);
  assert.doesNotMatch(client, /private fun parseAdminConfig/);
  assert.doesNotMatch(models, /\bval role:/);
  assert.doesNotMatch(operations, /administrator_role_format/);
});

test('device lists and profile editor perform router-backed explicit mutations', () => {
  assert.match(devices, /client\.saveDevice/);
  assert.match(devices, /config\.capabilities\.deviceWrite/);
  assert.match(devices, /config\.revision\.isNotBlank\(\)/);
  assert.match(devices, /devices_update_router/);
  assert.match(devices, /targetStatus != "blocked" \|\| device\.status != "allow"/);
  assert.match(devices, /selected\.any \{ it\.status == "blocked" \}/);
  assert.match(devices, /R\.drawable\.ic_delete/);
  assert.match(deviceEditor, /deviceTypeOptions/);
  assert.match(deviceEditor, /manualDeviceType = deviceType != "unknown"/);
  assert.match(deviceEditor, /if \(device\.isAdministrator\) "allow" else status/);
  assert.match(notifications, /client\.saveNotificationSettings/);
  assert.match(notifications, /resultIsError/);
});

test('device editor distinguishes saved UCI from pending runtime application', () => {
  assert.match(devices, /management_runtime_pending/);
  assert.match(devices, /mutation\?\.runtimeApplied == false/);
  assert.match(devices, /runtimePending = runtimePending \|\| currentConfig\.mutation\?\.runtimeApplied == false/);
});

test('agreement revision and acceptance time are local and re-consent is isolated', () => {
  assert.match(agreement, /CURRENT_REVISION/);
  assert.match(agreement, /accepted_at_millis/);
  assert.match(agreement, /System\.currentTimeMillis\(\)/);
  assert.match(agreement, /AgreementRenewalScreen/);
  assert.doesNotMatch(agreement, /CAMERA|POST_NOTIFICATIONS|NEARBY_WIFI_DEVICES|RouterConnection/);
  assert.match(activity, /AgreementRenewalScreen/);
});

test('administrator and Wi-Fi security boundaries remain explicit', () => {
  assert.match(operations, /Учётные записи и QR остаются в LuCI/);
  assert.match(wifi, /client\.setWifiEnabled/);
  assert.match(wifi, /client\.saveWifiNetwork/);
  assert.match(wifi, /client\.saveWifiAutomation/);
  assert.match(wifi, /config\.capabilities\.wifiAutomationWrite/);
  assert.match(wifiAutomation, /mutableIntStateOf\(10\)/);
  assert.match(wifiAutomation, /delay\(1_000\)/);
  assert.match(wifiAutomation, /wifi_disable_risk_confirm/);
  assert.match(wifi, /wifiQrPayload/);
  assert.match(wifi, /remember\(network\.ssid, network\.password, network\.encryption\)/);
  assert.doesNotMatch(wifi, /remember\(ssid, password, encryption\)/);
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
