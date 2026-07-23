/*
 * Проверяет локальный путь «детский APK -> роутер -> журнал/уведомление» для
 * впервые увиденной Wi-Fi сети. Runtime использует временные UCI/DHCP/history;
 * реальный роутер и реальные координаты тест не затрагивает. §childwifi1 §testwhy
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const monitorPath = 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-child-wifi-monitor';
const monitor = read(monitorPath);
const api = read('package/luci-app-sheepfold-family-internet-control/root/www/cgi-bin/sheepfold-api');
const statusApi = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-client-status');
const settings = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/notifications/settings.js');
const defaults = read('package/luci-app-sheepfold-family-internet-control/root/usr/share/sheepfold/sheepfold.uci.defaults');
const makefile = read('package/luci-app-sheepfold-family-internet-control/Makefile');
const manifest = read('android-child/app/src/main/AndroidManifest.xml');
const collector = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/WifiNetworkSnapshotCollector.kt');
const reportQueue = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/WifiReportQueue.kt');
const repository = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/ClientStatusRepository.kt');
const pollReceiver = read('android-child/app/src/main/java/com/example/sheepfoldchild/polling/StatusPollWorker.kt');

function posix(path) {
  return relative(process.cwd(), path).replace(/\\/g, '/');
}

function runNetworkRuntime() {
  mkdirSync(resolve('.build'), { recursive: true });
  const root = mkdtempSync(join(resolve('.build'), 'sheepfold-child-wifi-'));
  const bin = join(root, 'bin');
  const state = join(root, 'uci.txt');
  const leases = join(root, 'dhcp.leases');
  const history = join(root, 'history');
  const events = join(root, 'events.log');
  const notifications = join(root, 'notifications.log');
  const lock = join(root, 'lock-common');
  mkdirSync(bin);
  mkdirSync(history);
  writeFileSync(state, [
    'sheepfold.device_1=device',
    'sheepfold.device_1.mac=72:ED:B7:B6:DD:77',
    'sheepfold.device_1.name=Телефон ребёнка',
    'sheepfold.global.child_wifi_network_notifications=with_location',
  ].join('\n') + '\n');
  writeFileSync(leases, '0 72:ED:B7:B6:DD:77 192.168.4.20 child-phone *\n');
  writeFileSync(join(history, 'device-7.networks'),
    `${'b'.repeat(64)}\t1\tOld Wi-Fi\t1.000000\t2.000000\t5\n`);
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
  *) exit 1 ;;
esac
`,
    deviceId: '#!/bin/sh\nprintf "7\\n"\n',
    logger: '#!/bin/sh\nprintf "%s\\n" "$*" >> "$SHEEPFOLD_TEST_LOG"\n',
    notifier: '#!/bin/sh\nprintf "%s\\n" "$*" >> "$SHEEPFOLD_TEST_NOTIFICATIONS"\n',
  };
  for (const [name, source] of Object.entries(helpers)) {
    const helperPath = join(bin, name);
    writeFileSync(helperPath, source);
    chmodSync(helperPath, 0o755);
  }

  const env = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH || ''}`,
    SHEEPFOLD_TEST_UCI: posix(state),
    SHEEPFOLD_TEST_LOG: posix(events),
    SHEEPFOLD_TEST_NOTIFICATIONS: posix(notifications),
    SHEEPFOLD_DHCP_LEASES: posix(leases),
    SHEEPFOLD_ARP_TABLE: posix(join(root, 'missing-arp')),
    SHEEPFOLD_CHILD_WIFI_STATE_DIR: posix(history),
    SHEEPFOLD_LOCK_COMMON: posix(lock),
    SHEEPFOLD_DEVICE_ID_HELPER: posix(join(bin, 'deviceId')),
    SHEEPFOLD_LOG_HELPER: posix(join(bin, 'logger')),
    SHEEPFOLD_NOTIFICATION_HELPER: posix(join(bin, 'notifier')),
  };
  const observedAt = Math.floor(Date.now() / 1000);
  const payload = [
    'version=1',
    `fingerprint=${'a'.repeat(64)}`,
    'ssid=School guest Wi-Fi',
    `observed_at=${observedAt}`,
    `location=55.755800|37.617600|42|${observedAt}`,
    '',
  ].join('\n');
  const run = () => spawnSync('bash', [resolve(monitorPath), 'report', '192.168.4.20'], {
    cwd: process.cwd(), env, input: payload, encoding: 'utf8',
  });

  try {
    const first = run();
    const firstEvent = readFileSync(events, 'utf8');
    const firstNotification = readFileSync(notifications, 'utf8');
    const saved = readFileSync(join(history, 'device-7.networks'), 'utf8');
    const second = run();
    return {
      first, firstEvent, firstNotification, saved, second,
      finalEvent: readFileSync(events, 'utf8'),
      finalNotification: readFileSync(notifications, 'utf8'),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('Child Wi-Fi network notifications §childwifi1', () => {
  it('collects SSID and an optional recent phone location without sending raw BSSID', () => {
    assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
    assert.match(manifest, /android\.permission\.NEARBY_WIFI_DEVICES/);
    assert.match(collector, /NetworkCapabilities\.TRANSPORT_WIFI/);
    assert.match(collector, /connectionInfo/);
    assert.match(collector, /MAX_LOCATION_AGE_MS/);
    assert.match(collector, /sha256\("\$ssid\|\$bssid"\)/);
    assert.doesNotMatch(collector, /appendLine\("bssid=/i);
  });

  it('reports only when the router enables the feature through client status', () => {
    assert.match(statusApi, /child_wifi_network_notifications/);
    assert.match(statusApi, /"wifiNetworkReporting"/);
    assert.match(statusApi, /"wifiLocationReporting"/);
    assert.match(repository, /WIFI_REPORT_ENDPOINT = "\/cgi-bin\/sheepfold-api\/wifi-network-report"/);
    assert.match(repository, /data\?\.wifiNetworkReporting == true/);
    assert.match(reportQueue, /WifiNetworkSnapshotCollector\.payload\(context, includeLocation\)/);
  });

  it('queues reports while the home router is unavailable and flushes them after returning home', () => {
    assert.match(pollReceiver, /repo\.fetchClientStatus\(url\)/);
    assert.match(repository, /private fun fetchFrom[\s\S]*WifiReportQueue\.captureWithSavedPolicy\(context\)/);
    assert.match(repository, /WifiReportQueue\.updatePolicy\(context, wifiEnabled, includeLocation\)/);
    assert.match(repository, /flushWifiReports\(baseUrl\)/);
    assert.match(reportQueue, /MAX_REPORTS = 100/);
    assert.match(reportQueue, /!enabled -> editor\.remove\(KEY_REPORTS\)/);
    assert.match(reportQueue, /!includeLocation[\s\S]*withoutLocation/);
    assert.doesNotMatch(reportQueue, /bssid=/i);
  });

  it('identifies the device on the router, bounds input and protects the history endpoint', () => {
    assert.match(api, /\/wifi-network-report\)/);
    assert.match(api, /rate_limit wifi_network_report 12 300/);
    assert.match(api, /CONTENT_LENGTH[\s\S]*1024/);
    assert.match(api, /"\$CHILD_WIFI_MONITOR" report "\$\{REMOTE_ADDR:-\}"/);
    assert.match(api, /\/child-wifi-networks\)[\s\S]*require_admin/);
    assert.match(api, /\/child-wifi-networks\)[\s\S]*GET\|DELETE[\s\S]*header_json "200 OK"/);
    assert.match(monitor, /mac_for_ip\(\)/);
    assert.match(monitor, /location_is_recent/);
    assert.doesNotMatch(monitor, /client[_-]?mac|reported[_-]?mac/i);
  });

  it('stores and notifies a newly seen network only once', () => {
    const result = runNetworkRuntime();
    assert.equal(result.first.status, 0, result.first.stderr);
    assert.match(result.first.stdout, /"changed":true/);
    assert.match(result.firstEvent, /#7 Телефон ребёнка/);
    assert.match(result.firstEvent, /School guest Wi-Fi/);
    assert.match(result.firstEvent, /55\.755800, 37\.617600/);
    assert.match(result.firstNotification, /child_wifi_network/);
    assert.match(result.saved, /^a{64}\t/);
    assert.doesNotMatch(result.saved, /Old Wi-Fi|1\.000000|2\.000000/);
    assert.doesNotMatch(result.saved, /72:ED:B7:B6:DD:77/i);
    assert.equal(result.second.status, 0, result.second.stderr);
    assert.match(result.second.stdout, /"changed":false/);
    assert.equal(result.finalEvent, result.firstEvent);
    assert.equal(result.finalNotification, result.firstNotification);
  });

  it('is disabled by default and explains that location belongs to the phone, not the access point', () => {
    assert.match(settings, /child_wifi_network_notifications/);
    assert.match(settings, /with_location[\s\S]*network_only[\s\S]*off/);
    assert.match(settings, /last available phone position, not a verified address/);
    assert.match(defaults, /option child_wifi_network_notifications 'off'/);
    assert.match(makefile, /ensure_global_option child_wifi_network_notifications 'off'/);
    assert.match(monitor, /MAX_NETWORKS_PER_DEVICE=100/);
    assert.match(monitor, /HISTORY_RETENTION_SECONDS=.*7776000/);
    assert.match(monitor, /prune_history "\$history_file" "\$now"/);
  });
});
