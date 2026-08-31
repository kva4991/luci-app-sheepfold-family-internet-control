/*
 * Protects the versioned parent-management API, optimistic UCI transaction and
 * secret-minimizing response. Source-contract checks are appropriate because the
 * real UCI/firewall effects still require the live-router matrix. A passing result
 * does not prove physical Wi-Fi reconnect, wall-clock schedules or SDK packaging.
 * §apicon1 §pairtx1 §roadmap
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const helperPath = 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-admin-config';
const modelPath = 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-lib-admin-config-model';
const modulePaths = {
  common: 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-lib-admin-config-common',
  schedules: 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-lib-admin-config-schedules',
  groups: 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-lib-admin-config-groups',
  wifi: 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-lib-admin-config-wifi',
  notifications: 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-lib-admin-config-notifications',
  devices: 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-lib-admin-config-devices',
};
const dispatcherPath = 'package/luci-app-sheepfold-family-internet-control/root/www/cgi-bin/sheepfold-api';
const formHelperPath = 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-lib-form';
const routerControlLegacyPath = 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control-legacy';
const helper = readFileSync(helperPath, 'utf8');
const model = readFileSync(modelPath, 'utf8');
const modules = Object.fromEntries(
  Object.entries(modulePaths).map(([name, path]) => [name, readFileSync(path, 'utf8')]),
);
const dispatcher = readFileSync(dispatcherPath, 'utf8');
const routerControlLegacy = readFileSync(routerControlLegacyPath, 'utf8');
const packageMakefile = readFileSync(
  'package/luci-app-sheepfold-family-internet-control/Makefile',
  'utf8',
);

test('parent-management shell entrypoints keep valid syntax and AI variant markers', () => {
  for (const path of [
    helperPath, modelPath, ...Object.values(modulePaths), dispatcherPath,
    formHelperPath, routerControlLegacyPath,
  ]) {
    const result = spawnSync('sh', ['-n', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  }
  assert.match(dispatcher, /# SHEEPFOLD_AI_BEGIN[\s\S]*AI_GATE/);
  assert.match(dispatcher, /\/ai-assistant\)/);
  assert.match(dispatcher, /\/api\/v1\/admin-config/);
  assert.match(dispatcher, /\/api\/v1\/admin-config\/wifi\/save/);
  assert.match(dispatcher, /\/api\/v1\/admin-config\/wifi-automation\/save/);
  assert.match(dispatcher, /\/api\/v1\/admin-config\/notifications\/save/);
  assert.match(dispatcher, /\/api\/v1\/admin-config\/device\/save/);
});

test('read-only admin snapshot loads every extracted module and returns valid JSON', () => {
  const shell = String.raw`
uci() {
  while [ "\${1:-}" = -q ]; do shift; done
  case "\${1:-}:\${2:-}" in
    show:sheepfold) printf '%s\n' 'sheepfold.global=global' ;;
    show:wireless) : ;;
    get:sheepfold.global.bedtime) printf '%s\n' '21:00' ;;
  esac
}
SHEEPFOLD_UCI_BIN=uci
SHEEPFOLD_AUTHENTICATED_ADMIN_LOGIN=SuperParent
SHEEPFOLD_LOCK_COMMON="$1"
SHEEPFOLD_FORM_COMMON="$2"
SHEEPFOLD_ADMIN_CONFIG_MODEL="$3"
SHEEPFOLD_ADMIN_CONFIG_COMMON="$4"
SHEEPFOLD_ADMIN_CONFIG_SCHEDULES="$5"
SHEEPFOLD_ADMIN_CONFIG_GROUPS="$6"
SHEEPFOLD_ADMIN_CONFIG_WIFI="$7"
SHEEPFOLD_ADMIN_CONFIG_NOTIFICATIONS="$8"
SHEEPFOLD_ADMIN_CONFIG_DEVICES="$9"
set -- get
. "$ADMIN_CONFIG_ENTRYPOINT"
`;
  const result = spawnSync('sh', ['-c', shell, 'admin-config-test',
    'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-lock-common',
    formHelperPath,
    modelPath,
    modulePaths.common,
    modulePaths.schedules,
    modulePaths.groups,
    modulePaths.wifi,
    modulePaths.notifications,
    modulePaths.devices,
  ], {
    encoding: 'utf8',
    env: { ...process.env, ADMIN_CONFIG_ENTRYPOINT: helperPath },
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const snapshot = JSON.parse(result.stdout);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.bedtime, '21:00');
  assert.equal(snapshot.wifiEnabled, false);
  assert.deepEqual(snapshot.schedules, []);
  assert.equal(snapshot.capabilities.deviceWrite, true);
});

test('dispatcher authenticates and bounds every management request before the helper', () => {
  const routes = dispatcher.slice(dispatcher.indexOf('/api/v1/admin-config'));
  assert.match(routes, /require_admin/);
  assert.match(routes, /enforce_rate_limit admin_read/);
  assert.match(routes, /enforce_rate_limit admin_write/);
  assert.match(dispatcher, /CONTENT_LENGTH/);
  assert.match(dispatcher, /16384/);
  assert.match(dispatcher, /SHEEPFOLD_AUTHENTICATED_ADMIN_LOGIN/);
  assert.match(dispatcher, /authenticate-token "\$bearer" "\$client_ip"/);
  assert.doesNotMatch(dispatcher, /HTTP_X_SHEEPFOLD_DEVICE_(?:ID|MAC)/);
  assert.match(helper, /sheepfold-lib-form/);
  assert.match(helper, /sheepfold-lib-admin-config-model/);
  assert.match(helper, /sheepfold-lib-admin-config-common/);
  assert.match(modules.common, /sheepfold_form_get/);
  assert.match(model, /admin_config_json\(\)/);
  assert.doesNotMatch(model, /uci_read[^\n]*(?:set|add|delete|commit|revert)/);
  assert.doesNotMatch([helper, ...Object.values(modules)].join('\n'), /printf\s+['"]%b|url_decode\(\)/);
});

test('helper uses optimistic revision, one kernel lock and verified rollback', () => {
  assert.match(helper, /SCHEMA_VERSION=1/);
  assert.match(modules.schedules, /expectedRevision/);
  assert.match(modules.common, /revision_conflict/);
  assert.match(modules.common, /sheepfold_lock_acquire/);
  assert.match(modules.common, /trap 'transaction_cleanup \$\?' EXIT/);
  assert.match(modules.common, /-t "\$TX_UCI_DIR" -p "\$TX_UCI_DIR"/);
  assert.match(modules.common, /TX_RESTORE=1[\s\S]*commit sheepfold/);
  assert.match(modules.schedules, /schedule_state_is_valid/);
  assert.match(modules.groups, /group_state_is_valid/);
  assert.match([modules.schedules, modules.groups].join('\n'), /config_verify_failed/);
  assert.match(modules.common, /restore_snapshot/);
  assert.match(modules.wifi, /expectedWifiRevision/);
  assert.match(modules.wifi, /WIFI_TX_RESTORE=1/);
  assert.match(modules.wifi, /wifi_state_is_valid/);
});

test('helper excludes secrets and rejects administrator policy targets', () => {
  const adminProjection = model.slice(
    model.indexOf('json_administrator()'),
    model.indexOf('json_wifi_network()'),
  );
  assert.doesNotMatch(adminProjection, /password_hash|pairing_code|token/);
  assert.doesNotMatch(adminProjection, /["']role["']/);
  assert.match(modules.schedules, /administrator_schedule_forbidden/);
  assert.match(modules.groups, /administrator_group_forbidden/);
  assert.match(modules.groups, /protected_group_name/);
  assert.match(modules.groups, /group_has_schedules/);
  assert.match(modules.groups, /reserved_group_name/);
  assert.match(modules.schedules, /duplicate_schedule_target/);
  assert.match(model, /"deviceWrite":true/);
  assert.match(model, /"wifiAutomationWrite":true/);
  assert.match(helper, /device-save\) device_save/);
  assert.match(modules.devices, /SHEEPFOLD_DEVICE_MANUAL_TYPE/);
  assert.match(modules.devices, /administrator_device_forbidden/);
});

test('device and notification mutations stay revision-safe and explicit', () => {
  assert.match(modules.notifications, /notification_settings_save\(\)/);
  assert.match(modules.notifications, /sim_change_notifications/);
  assert.match(modules.notifications, /child_wifi_network_notifications/);
  assert.match(modules.devices, /device_save\(\)/);
  assert.match(modules.common, /validate_expected_revision/);
  assert.match(modules.devices, /set-device-status/);
  assert.match(modules.devices, /SHEEPFOLD_DEVICE_TYPE_SOURCE/);
  assert.match(modules.devices, /SHEEPFOLD_DEVICE_NO_RESTRICTIONS_EXCLUDED/);
  assert.match(modules.devices, /SHEEPFOLD_DEVICE_PERSONAL_EXCLUDED/);
  assert.match(modules.common, /device_mutation_persisted\(\)/);
  assert.match(modules.devices, /admin_config_json device-save "\$runtime_applied"/);

  const deviceSave = modules.devices;
  assert.doesNotMatch(deviceSave, /uci_read -q commit sheepfold/);
  assert.match(deviceSave, /uci_get sheepfold\.no_restrictions\.name/);
  assert.match(deviceSave, /uci_get sheepfold\.personal_devices\.name/);
  assert.doesNotMatch(deviceSave, /sheepfold\.group_(?:no_restrictions|personal_devices)/);
  assert.match(deviceSave, /device_mutation_persisted[\s\S]*runtime_applied=0/);
  assert.match(deviceSave, /device_save_failed/);
  assert.match(routerControlLegacy, /SHEEPFOLD_DEVICE_PROFILE_UPDATE/);
  assert.match(routerControlLegacy, /manual_device_type=\$manual_type/);
  assert.match(routerControlLegacy, /device_type_source=\$type_source/);
});

test('group schedules have one canonical UCI relation with an upgrade-safe Android contract', () => {
  assert.match(model, /json_group_schedule_ids/);
  assert.match(model, /,"scheduleIds":/);
  assert.match(modules.groups, /scheduleIdsPresent/);
  assert.match(modules.groups, /sync_group_schedule_links/);
  assert.match(modules.groups, /group_schedule_state_is_valid/);
  assert.match(modules.groups, /del_list "sheepfold\.\$schedule_id\.targets=\$old_name"/);
  assert.match(modules.groups, /add_list "sheepfold\.\$schedule_id\.targets=\$section"/);
  assert.match(modules.groups, /group_schedule_type_forbidden/);
  assert.match(packageMakefile, /migrate_group_schedule_links\(\)/);
  assert.match(packageMakefile, /delete "sheepfold\.\$\$group_section\.schedules"/);
  assert.match(packageMakefile, /add_list "sheepfold\.\$\$schedule_section\.targets=\$\$group_section"/);
});

test('Wi-Fi projection and writes stay behind administrator auth and verified rollback', () => {
  assert.match(model, /json_wifi_networks/);
  assert.match(model, /wifiRevision/);
  assert.match(helper, /wifi-save\) wifi_save/);
  assert.match(modules.wifi, /wifi_network_not_found/);
  assert.match(modules.wifi, /wifi_reload_failed/);
  assert.match(model, /json_wifi_automation/);
  assert.match(helper, /wifi-automation-save\) wifi_automation_save/);
  assert.match(modules.wifi, /invalid_wifi_automation_time/);
  assert.match(modules.wifi, /confirmRisk/);
  assert.match(helper, /SHEEPFOLD_AUTHENTICATED_ADMIN_LOGIN/);
});

test('parentDeviceOwnersUseValidatedLoginOnlyForAdminDevices', () => {
  const start = routerControlLegacy.indexOf('list_devices() {');
  const end = routerControlLegacy.indexOf('\n}', start) + 2;
  const shell = String.raw`
uci() {
  while [ "$1" = -q ]; do shift; done
  case "$1:$2" in
    show:sheepfold) printf '%s\n' 'sheepfold.a=device' 'sheepfold.b=device' 'sheepfold.c=device' ;;
    get:sheepfold.a.id) printf 1 ;;
    get:sheepfold.b.id) printf 2 ;;
    get:sheepfold.c.id) printf 3 ;;
    get:*.mac) printf '02:00:00:00:00:01' ;;
    get:sheepfold.a.admin_device|get:sheepfold.c.admin_device) printf 1 ;;
    get:sheepfold.a.admin_login) printf 'Parent+1' ;;
    get:sheepfold.b.admin_login) printf 'stale-owner' ;;
    get:sheepfold.c.admin_login) printf 'bad"login' ;;
    *) return 1 ;;
  esac
}
` + routerControlLegacy.slice(start, end) + '\nlist_devices\n';
  const result = spawnSync('sh', ['-c', shell], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const devices = JSON.parse(result.stdout);
  assert.deepEqual(devices.map(({ adminDevice, adminLogin }) => ({ adminDevice, adminLogin })), [
    { adminDevice: true, adminLogin: 'Parent+1' },
    { adminDevice: false, adminLogin: '' },
    { adminDevice: true, adminLogin: '' },
  ]);
  assert.doesNotMatch(result.stdout, /stale-owner|bad|pairing_code|password_hash/);
});
