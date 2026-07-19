/*
 * Защищает сквозной контракт уведомлений о SIM между детским APK, локальным API,
 * UCI, журналом и LuCI. Runtime-часть пишет только во временный каталог `.build`
 * через подменённые UCI/DHCP/helpers и затем удаляет его; роутер не меняется.
 * Успешный тест не доказывает, что конкретная прошивка Android сообщит номер или
 * что уведомление будет доставлено физическому устройству. §testwhy
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const manifest = read('android-child/app/src/main/AndroidManifest.xml');
const collector = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/SimSnapshotCollector.kt');
const repository = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/ClientStatusRepository.kt');
const childStatusScreen = read('android-child/app/src/main/java/com/example/sheepfoldchild/ui/ChildStatusScreen.kt');
const clientStatus = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-client-status-effective');
const clientStatusApi = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-client-status');
const api = read('package/luci-app-sheepfold-family-internet-control/root/www/cgi-bin/sheepfold-api');
const monitorPath = 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-sim-monitor';
const monitor = read(monitorPath);
const settings = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/notifications/settings.js');
const overview = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js');
const defaults = read('package/luci-app-sheepfold-family-internet-control/root/usr/share/sheepfold/sheepfold.uci.defaults');
const makefile = read('package/luci-app-sheepfold-family-internet-control/Makefile');
const notificationQueue = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-admin-notification');
const parentClient = read('android/app/src/main/java/app/sheepfold/android/router/RouterAdminClient.kt');
const parentNotifications = read('android/app/src/main/java/app/sheepfold/android/notifications/SheepfoldNotifications.kt');

function toPosix(path) {
  return relative(process.cwd(), path).replace(/\\/g, '/');
}

function runFirstSimRuntime() {
  mkdirSync(resolve('.build'), { recursive: true });
  const root = mkdtempSync(join(resolve('.build'), 'sheepfold-sim-'));
  const bin = join(root, 'bin');
  const state = join(root, 'uci.txt');
  const leases = join(root, 'dhcp.leases');
  const log = join(root, 'events.log');
  const notifications = join(root, 'notifications.log');
  const lock = join(root, 'lock-common');
  mkdirSync(bin);
  writeFileSync(state, [
    'sheepfold.device_1=device',
    'sheepfold.device_1.mac=6E:6C:FA:88:52:1A',
    'sheepfold.device_1.name=Тестовый телефон',
    'sheepfold.global.sim_change_notifications=new_only',
  ].join('\n') + '\n');
  writeFileSync(leases, '0 6E:6C:FA:88:52:1A 192.168.4.20 child-phone *\n');
  writeFileSync(lock, '#!/bin/sh\nsheepfold_lock_acquire() { return 0; }\nsheepfold_lock_release() { return 0; }\n');

  const helpers = {
    uci: `#!/bin/sh
[ "$1" = "-q" ] && shift
case "$1" in
  show) cat "$SHEEPFOLD_TEST_UCI" ;;
  get)
    value="$(sed -n "s|^$2=||p" "$SHEEPFOLD_TEST_UCI" | sed -n '1p')"
    [ -n "$value" ] || exit 1
    printf '%s\\n' "$value"
    ;;
  set)
    assignment="$2"; key="\${assignment%%=*}"; value="\${assignment#*=}"
    awk -v key="$key" 'index($0, key "=") != 1' "$SHEEPFOLD_TEST_UCI" > "$SHEEPFOLD_TEST_UCI.tmp"
    printf '%s=%s\\n' "$key" "$value" >> "$SHEEPFOLD_TEST_UCI.tmp"
    mv "$SHEEPFOLD_TEST_UCI.tmp" "$SHEEPFOLD_TEST_UCI"
    ;;
  commit) ;;
  *) exit 1 ;;
esac
`,
    deviceId: '#!/bin/sh\nprintf "1\\n"\n',
    logger: '#!/bin/sh\nprintf "%s\\n" "$*" >> "$SHEEPFOLD_TEST_LOG"\n',
    notifier: '#!/bin/sh\nprintf "%s\\n" "$*" >> "$SHEEPFOLD_TEST_NOTIFICATIONS"\n',
  };
  for (const [name, source] of Object.entries(helpers)) {
    const path = join(bin, name);
    writeFileSync(path, source);
    chmodSync(path, 0o755);
  }

  const env = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH || ''}`,
    SHEEPFOLD_TEST_UCI: toPosix(state),
    SHEEPFOLD_TEST_LOG: toPosix(log),
    SHEEPFOLD_TEST_NOTIFICATIONS: toPosix(notifications),
    SHEEPFOLD_DHCP_LEASES: toPosix(leases),
    SHEEPFOLD_ARP_TABLE: toPosix(join(root, 'missing-arp')),
    SHEEPFOLD_SIM_STATE_DIR: toPosix(join(root, 'runtime')),
    SHEEPFOLD_HASH_COMMON: toPosix(resolve('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-hash-common')),
    SHEEPFOLD_LOCK_COMMON: toPosix(lock),
    SHEEPFOLD_DEVICE_ID_HELPER: toPosix(join(bin, 'deviceId')),
    SHEEPFOLD_LOG_HELPER: toPosix(join(bin, 'logger')),
    SHEEPFOLD_NOTIFICATION_HELPER: toPosix(join(bin, 'notifier')),
  };
  const payload = `version=1\nsim=0|${'a'.repeat(64)}|+79991234567|250|01\n`;
  const run = () => spawnSync('bash', [resolve(monitorPath), 'report', '192.168.4.20'], {
    cwd: process.cwd(),
    env,
    input: payload,
    encoding: 'utf8',
  });

  try {
    const first = run();
    const firstLog = readFileSync(log, 'utf8');
    const firstNotifications = readFileSync(notifications, 'utf8');
    const second = run();
    return {
      first,
      firstLog,
      firstNotifications,
      second,
      finalLog: readFileSync(log, 'utf8'),
      finalNotifications: readFileSync(notifications, 'utf8'),
      finalState: readFileSync(state, 'utf8'),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('SIM change monitoring contract', () => {
  it('uses visible Android permissions and best-effort subscription APIs', () => {
    assert.match(manifest, /android\.permission\.READ_PHONE_STATE/);
    assert.match(manifest, /android\.permission\.READ_PHONE_NUMBERS/);
    assert.match(collector, /activeSubscriptionInfoList/);
    assert.match(collector, /getPhoneNumber\(subscription\.subscriptionId\)/);
    assert.match(collector, /PhoneNumberUtils\.normalizeNumber/);
    assert.doesNotMatch(collector, /\.iccId\b|subscriberId|\.deviceId\b|getImei|getSubscriberId/i);
  });

  it('posts the snapshot only through the pinned local HTTPS connection', () => {
    assert.match(repository, /SIM_REPORT_ENDPOINT = "\/cgi-bin\/sheepfold-api\/sim-report"/);
    assert.match(repository, /ChildRouterHttps\.open\(context, url\)/);
    assert.match(repository, /Content-Type", "text\/plain; charset=utf-8"/);
    assert.match(repository, /runCatching \{ reportSimSnapshot\(baseUrl\) \}/);
  });

  it('identifies the reporting device on the router and bounds the public endpoint', () => {
    assert.match(api, /\/sim-report\)/);
    assert.match(api, /rate_limit sim_report 12 300/);
    assert.match(api, /CONTENT_LENGTH[\s\S]*2048/);
    assert.match(api, /"\$SIM_MONITOR" report "\$\{REMOTE_ADDR:-\}"/);
    assert.match(monitor, /mac_for_ip\(\)/);
    assert.match(monitor, /DHCP_LEASES/);
    assert.match(monitor, /ARP_TABLE/);
    assert.doesNotMatch(monitor, /client[_-]?mac|reported[_-]?mac/i);
  });

  it('journals and can notify the SIM already present during app installation', () => {
    assert.match(monitor, /first_observation=1/);
    assert.match(monitor, /if \[ -z "\$current_fingerprints" \][\s\S]*baselineCreated/);
    assert.match(monitor, /обнаружена в телефоне при установке приложения/);
    assert.match(monitor, /notification_title="SIM-карта обнаружена"/);
    assert.match(monitor, /\[ "\$mode" = all \][\s\S]*"\$mode" = new_only[\s\S]*"\$has_new" = 1/);
    assert.match(monitor, /"\$LOG_HELPER" "\$message"/);
    assert.match(monitor, /"\$NOTIFY_HELPER" enqueue sim_change/);
  });

  it('creates exactly one runtime event for the SIM present during installation', () => {
    const result = runFirstSimRuntime();
    assert.equal(result.first.status, 0, result.first.stderr);
    assert.match(result.first.stdout, /"changed":true/);
    assert.match(result.first.stdout, /"baselineCreated":true/);
    assert.match(result.firstLog, /\+79991234567/);
    assert.match(result.firstLog, /\(обнаружена в телефоне при установке приложения\)/);
    assert.match(result.firstNotifications, /SIM-карта обнаружена/);
    assert.match(result.finalState, /sim_phone_history=.*\+79991234567/);
    assert.equal(result.second.status, 0, result.second.stderr);
    assert.match(result.second.stdout, /"changed":false/);
    assert.equal(result.finalLog, result.firstLog);
    assert.equal(result.finalNotifications, result.firstNotifications);
  });

  it('stores bounded fingerprints and phone history without repeated flash writes', () => {
    assert.match(monitor, /MAX_KNOWN_FINGERPRINTS=16/);
    assert.match(monitor, /MAX_PHONE_HISTORY=16/);
    assert.match(monitor, /sim_known_fingerprints/);
    assert.match(monitor, /sim_phone_history/);
    assert.match(monitor, /Android иногда сообщает номер не сразу/);
    assert.match(monitor, /snapshot_hash" = "\$previous_hash"[\s\S]*changed":false/);
  });

  it('exposes the LuCI notification modes with new-only as the default', () => {
    assert.match(settings, /sim_change_notifications/);
    assert.match(settings, /\['all',[\s\S]*\['new_only',[\s\S]*\['off'/);
    assert.match(settings, /first SIM found after child-app installation/);
    assert.match(overview, /\['notifications', 'Notifications'\]/);
    assert.match(overview, /renderSettingsNotifications/);
    assert.match(defaults, /option sim_change_notifications 'new_only'/);
    assert.match(makefile, /ensure_global_option sim_change_notifications 'new_only'/);
  });

  it('keeps the event available to every paired parent phone', () => {
    assert.match(notificationQueue, /события не удаляются после первого чтения/);
    assert.match(notificationQueue, /list_notifications\(\)/);
    assert.match(parentClient, /request\("GET", "\/notifications"\)/);
    assert.match(parentNotifications, /preferences\.getBoolean\(event\.id, false\)/);
  });

  it('reports allowed new devices as enabled and never paints unknown as disabled', () => {
    assert.match(clientStatus, /status=allow[\s\S]*reason=new_device_policy_allow/);
    assert.match(clientStatusApi, /internet_state=enabled[\s\S]*new_device_policy_allow/);
    assert.match(clientStatusApi, /access_mode=default/);
    assert.match(childStatusScreen, /isDisabled = status\.internetState == "disabled"/);
    assert.match(childStatusScreen, /else -> stringResource\(R\.string\.status_unknown\)/);
  });
});
