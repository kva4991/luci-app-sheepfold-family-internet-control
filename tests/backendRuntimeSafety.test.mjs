import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(path, 'utf8');

function readFilesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? readFilesRecursively(path) : [{ path, source: read(path) }];
  });
}

describe('Backend runtime input bounds', () => {
  it('uses BusyBox-safe ASCII ranges for tr across the packaged rootfs §bbxtr01', () => {
    const root = 'package/luci-app-sheepfold-family-internet-control/root';
    const forbiddenOperands = /tr(?:\s+-cd)?\s+['"]\[:(?:lower|upper|alnum):\]['"]/;

    for (const { path, source } of readFilesRecursively(root)) {
      assert.doesNotMatch(source, forbiddenOperands, `${path} использует несовместимый операнд BusyBox tr`);
    }

    const classifier = read(`${root}/usr/libexec/sheepfold/sheepfold-device-classifier`);
    assert.match(classifier, /tr 'A-Z' 'a-z'/);
    assert.match(classifier, /tr 'a-z' 'A-Z'/);
  });

  it('validates the HTTPS API port everywhere it is consumed', () => {
    const init = read('package/luci-app-sheepfold-family-internet-control/root/etc/init.d/sheepfold');
    const api = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-legacy');
    const discovery = read('package/luci-app-sheepfold-family-internet-control/root/www/.well-known/sheepfold.json.sh');
    const testBuilder = read('scripts/build-test-ipk.py');

    assert.match(init, /valid_port/);
    for (const source of [init, api, discovery, testBuilder]) {
      assert.match(source, /-ge 1/);
      assert.match(source, /-le 65535/);
    }
  });

  it('bounds nmap time, retries, port-list length, and host count', () => {
    const detector = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-detector');

    assert.match(detector, /max_seconds.*-le 60/);
    assert.match(detector, /\$\{#ports\}.*-le 256/);
    assert.match(detector, /--max-retries 1/);
    assert.match(detector, /max_hosts.*-le 64/);
  });

  it('rejects an unknown global-block value instead of disabling protection', () => {
    const api = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-legacy');
    const globalBlock = api.slice(
      api.indexOf('global_block_json() {'),
      api.indexOf('log_json() {'),
    );

    assert.match(globalBlock, /1\|true\|on/);
    assert.match(globalBlock, /0\|false\|off/);
    assert.match(globalBlock, /invalid_global_block_value/);
    assert.doesNotMatch(globalBlock, /\*\)\s*\n\s*ctrl_result=.*global-block-off/);
  });

  it('centralizes non-secret hashes without changing the QR pairing contract', () => {
    const runtimeDir = 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold';
    const helperPath = `${runtimeDir}/sheepfold-hash-common`;
    const helper = read(helperPath);
    const consumers = [
      'sheepfold-firewall',
      'sheepfold-device-detector',
      'sheepfold-adguard',
      'sheepfold-admin-notification',
      'sheepfold-site-lists',
    ].map((name) => read(`${runtimeDir}/${name}`));
    const service = read(`${runtimeDir}/sheepfold-service`);
    const pairCommon = read(`${runtimeDir}/sheepfold-pair-common`);

    for (const source of consumers) {
      assert.match(source, /sheepfold-hash-common/);
      assert.doesNotMatch(source, /\bcksum\b/);
    }
    // Событийный detector сравнивает текущий online-снимок по MAC и больше не
    // вычисляет hash всего файла DHCP leases на каждом тике. §detlife1
    assert.doesNotMatch(service, /DHCP_LEASES|LAST_LEASE_HASH|hash_file/);
    assert.match(helper, /sheepfold_state_hash_stdin/);
    assert.match(helper, /sheepfold_secure_hash_text/);
    const secureFunction = helper.slice(helper.indexOf('sheepfold_secure_hash_text'));
    assert.match(secureFunction, /sha256sum/);
    assert.doesNotMatch(secureFunction, /md5sum/);

    // QR и Android pairing остаются на отдельном SHA-256-протоколе. Общий
    // state helper не должен менять формат или проверку одноразового кода.
    assert.match(pairCommon, /pair_sha256\(\)/);
    assert.doesNotMatch(pairCommon, /sheepfold-hash-common/);

    const result = spawnSync('bash', ['-c', `. ${helperPath}; printf abc | sheepfold_state_hash_stdin; sheepfold_secure_hash_text abc`], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const hashes = result.stdout.trim().split(/\r?\n/);
    assert.equal(hashes.length, 2);
    assert.match(hashes[0], /^[0-9a-f]{64}$/);
    assert.equal(hashes[0], hashes[1]);
  });

  it('separates every nftables set inside the cached firewall fingerprint §fwlock1', () => {
    const firewall = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-firewall');
    const stateInput = firewall.slice(
      firewall.indexOf('state_input() {'),
      firewall.indexOf('collect_state() {'),
    );

    for (const marker of [
      'block',
      'restricted',
      'exempt',
      'global-ifaces',
      'emergency',
      'site-allow',
      'site-block-exempt',
      'site-filter-ifaces',
    ]) {
      assert.match(stateInput, new RegExp(`printf '\\[${marker}\\]\\\\n'`));
    }
    assert.match(firewall, /current_hash=.*state_input/);
    assert.doesNotMatch(firewall, /current_hash=.*\$\(cat "\$block_file"/);
  });

  it('serializes every mutating firewall transaction with one kernel lock §fwlock1', () => {
    const firewall = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-firewall');

    assert.match(firewall, /sheepfold-lock-common/);
    assert.match(firewall, /FIREWALL_LOCK=.*firewall-sync\.flock/);
    assert.match(firewall, /SHEEPFOLD_FIREWALL_LOCK_HELD/);
    assert.match(firewall, /sheepfold_lock_acquire "\$FIREWALL_LOCK" 30/);
    assert.match(firewall, /trap 'sheepfold_lock_release' EXIT HUP INT TERM/);
    assert.match(firewall, /unset SHEEPFOLD_FIREWALL_LOCK_HELD;[^\n]*refresh[^\n]*9>&-/);
  });

  it('does not hold the Android pairing response behind firewall synchronization §pairlat1', () => {
    const runtimeDir = 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold';
    const pairCommon = read(`${runtimeDir}/sheepfold-pair-common`);
    const pairDevice = read(`${runtimeDir}/sheepfold-pair-device`);
    const pairApi = read(`${runtimeDir}/sheepfold-api-pair`);

    assert.match(pairCommon, /\[ "\$tries" -lt 3 \]/);
    assert.match(pairDevice, /pair_acquire_admin_lock "\$admin_section" \|\| \{[\s\S]*exit 7[\s\S]*\}/);
    assert.match(pairDevice, /sheepfold-firewall sync[\s\S]*\) <\/dev\/null >\/dev\/null 2>&1 &/);
    assert.match(pairApi, /7\) http_status="409 Conflict"; error_code="pairing_busy"/);
  });

  it('does not replace unknown router LED defaults with an always-on trigger', () => {
    const routerControl = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control-legacy');
    const restoreDefaults = routerControl.slice(
      routerControl.indexOf('led_restore_defaults() {'),
      routerControl.indexOf('led_off_forever() {'),
    );

    assert.match(restoreDefaults, /\[ -r "\$LED_DEFAULTS_FILE" \] \|\| return 0/);
    assert.doesNotMatch(restoreDefaults, /printf\s+['"]?default-on/);
  });
});
