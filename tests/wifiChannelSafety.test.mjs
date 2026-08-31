/*
 * Исполняет production shell-фильтр каналов с синтетическим контрактом jshn/iwinfo.
 * Проверяет диапазоны, запреты и пустой ответ без iwinfo; не заменяет проверку
 * country/DFS на настоящем радио. Не запускает wifi reload и ничего не устанавливает. §apicon1
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import test from 'node:test';

const base = 'package/luci-app-sheepfold-family-internet-control/root';
const wifiPath = `${base}/usr/libexec/sheepfold/sheepfold-lib-admin-config-wifi`;
const wifi = readFileSync(wifiPath, 'utf8');
const api = readFileSync(`${base}/www/cgi-bin/sheepfold-api`, 'utf8');

function channels(band, mode = 'normal') {
  const parent = resolve('.build/test-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(resolve(parent, 'wifi-channels-'));
  const jshn = resolve(root, 'jshn.sh');
  // Это контрактная заглушка, а не альтернативный JSON-парсер для production.
  writeFileSync(jshn, `json_load() { [ "$1" = '{}' ]; }
json_select() { level="$1"; }
json_get_keys() { keys='1 2 3 4 5 6'; }
json_get_var() {
 case "$2" in
 phyname) phy=phy0 ;;
 channel) case "$level" in 1) channel=1 ;; 2) channel=6 ;; 3) channel=36 ;; 4) channel=161 ;; 5) channel=bad ;; 6) channel=5 ;; esac ;;
 mhz) case "$level" in 1) mhz=2412 ;; 2) mhz=2437 ;; 3) mhz=5180 ;; 4) mhz=5805 ;; 5) mhz=5180 ;; 6) mhz=5975 ;; esac ;;
 restricted) restricted=0; [ "$level" != 2 ] || restricted=1 ;;
 esac
 return 0
}
`, 'utf8');
  const shell = String.raw`
set -eu
. "$1"
valid_section_name() { case "$1" in ''|*[!a-zA-Z0-9_]*) return 1;; esac; }
uci_get() { printf '%s' "$FIXTURE_BAND"; }
ubus_fixture() {
 [ "$1 $2 $3 $4" = '-t 1 call iwinfo' ] || exit 90
 case "$FIXTURE_MODE" in
 missing) return 1 ;;
 oversize) awk 'BEGIN { for (i=0;i<70000;i++) printf "x" }' ;;
 malformed) printf invalid ;;
 *) printf '{}' ;;
 esac
}
SHEEPFOLD_UBUS_BIN=ubus_fixture
wifi_channel_list radio0
`;
  try {
    const result = spawnSync('sh', ['-c', shell, 'wifi-channel-test', wifiPath], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, SHEEPFOLD_JSHN_LIB: relative(process.cwd(), jshn).replaceAll('\\', '/'), FIXTURE_BAND: band, FIXTURE_MODE: mode },
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim().split(/\s+/).filter(Boolean);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('radioBandAndRestrictionsFilterChannels', () => {
  assert.deepEqual(channels('2g'), ['1']);
  assert.deepEqual(channels('5g'), ['36', '161']);
  assert.deepEqual(channels('6g'), ['5']);
  assert.deepEqual(channels('11a'), ['36', '161']);
  assert.deepEqual(channels('unknown'), []);
});
test('failedOrOversizedRpcDoesNotInventChannels', () => {
  for (const mode of ['missing', 'malformed', 'oversize']) assert.deepEqual(channels('5g', mode), []);
});
test('channelsEndpointIsAdminOnlyAndWritesValidateBeforeStaging', () => {
  const route = api.slice(api.indexOf('/api/v1/admin-config/wifi/channels|'));
  assert.match(route.slice(0, route.indexOf(';;')), /\[ "\$method" = "GET" \] \|\| method_not_allowed[\s\S]*require_admin[\s\S]*run_admin_config wifi-channels/);
  assert.match(wifi, /sections_of_config_type wireless wifi-device \| head -n 4/);
  const write = wifi.slice(wifi.indexOf('wifi_save()'));
  assert.ok(write.indexOf('wifi_channel_list "$device"') < write.indexOf('mkdir -p "$TRANSACTION_ROOT"'));
  assert.match(write, /\[ "\$channel" != auto \] && \[ "\$channel" != "\$\(uci_get/);
});
