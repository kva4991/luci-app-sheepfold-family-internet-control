import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { applyTestEnvironment } from '../tools/quality/testEnvironment.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const read = (path) => readFileSync(resolve(packageRoot, path), 'utf8');
applyTestEnvironment(repoRoot);

/*
 * Проверяет постоянство #ID и исполняет list_devices с изолированным UCI stub:
 * обычное чтение не должно запускать allocator/commit для каждой строки
 * Не меняет роутер; staged UCI и скорость BusyBox проверяются отдельно на стенде. §testwhy
 */
describe('permanent numeric device IDs', () => {
  function readDevices(ids) {
    const source = read('root/usr/libexec/sheepfold/sheepfold-router-control-legacy');
    const start = source.indexOf('json_escape_device_value() {');
    const end = source.indexOf('\n# -----------------------------------------------------------------------------', start);
    assert.ok(start >= 0 && end > start);
    const listing = source.slice(start, end).replaceAll('/usr/libexec/sheepfold/sheepfold-device-id ensure', 'ensure_id');
    const sections = ids.map((_, index) => `device${index}`);
    const fixture = `
      uci() {
        [ "$1" != -q ] || shift
        case "$1" in
          show) printf '%s\\n' ${sections.map(section => `'sheepfold.${section}=device'`).join(' ')} ;;
          get) case "$2" in
            ${ids.map((id, index) => `sheepfold.device${index}.id) printf '%s' '${id}' ;;`).join('\n')}
            *.mac) printf '02:00:00:00:00:01' ;;
            *.name) printf 'Fixture' ;;
            *.status) printf 'allow' ;;
            *) return 1 ;;
          esac ;;
          *) printf 'Unexpected UCI write\\n' >&2; exit 96 ;;
        esac
      }
      ensure_id() { printf 'ensure:%s\\n' "$1" >&2; printf 101; }
      ${listing}
      list_devices
    `;
    const result = spawnSync('sh', ['-s'], { input: fixture, encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return { devices: JSON.parse(result.stdout), repairs: result.stderr.trim() };
  }

  it('reads valid stored numbers without allocator, locks or UCI commits', () => {
    const result = readDevices(['1', '16', '109']);
    assert.deepEqual(result.devices.map(device => device.id), [1, 16, 109]);
    assert.equal(result.repairs, '');
    assert.equal(result.devices[0].status, 'allow');
  });

  it('delegates missing, legacy, zero, noncanonical and duplicate numbers to the existing allocator', () => {
    for (const id of ['', 'D-0012', '0', '0012', 'invalid', '16']) {
      const result = readDevices(['16', id]);
      assert.deepEqual(result.devices.map(device => device.id), [16, 101]);
      assert.equal(result.repairs, 'ensure:device1');
    }
  });
  it('assigns monotonically increasing IDs and never compacts existing values', () => {
    const helper = read('root/usr/libexec/sheepfold/sheepfold-device-id');
    const defaults = read('root/usr/share/sheepfold/sheepfold.uci.defaults');

    assert.match(defaults, /option next_device_id '1'/);
    assert.match(helper, /is_positive_id/);
    assert.match(helper, /next_device_id/);
    assert.match(helper, /next_unused_id/);
    assert.match(helper, /highest_existing_id/);
    assert.match(helper, /sed 's\/\[\^0-9\]\[\^0-9\]\*\/ \/g'/);
    assert.doesNotMatch(helper, /printf ['"]D-/);
    assert.match(helper, /first_owner_for_id\(\) \{\s+local wanted section current/);
    assert.match(helper, /id_is_used_by_other\(\) \{\s+local wanted owner first_owner/);
    assert.match(helper, /ensure_id_locked\(\) \{\s+local section current candidate next owner/);
    assert.match(helper, /ensure_all\(\) \{\s+local section/);
    assert.doesNotMatch(helper, /compact_ids_locked/);
    assert.match(helper, /device_id_layout_version/);
    assert.match(helper, /legacy_ids/);
    assert.match(helper, /rewrite_legacy_schedule_target/);
    assert.match(helper, /удалённый[\s\S]*ID никогда не выдаётся снова/);
    assert.doesNotMatch(helper, /диапазона 1\.\.N|уплотняем его/);
  });

  it('runs the non-destructive v3 migration during package installation', () => {
    const makefile = read('Makefile');
    assert.match(makefile, /sheepfold-device-id migrate/);
    assert.match(read('root/usr/libexec/sheepfold/sheepfold-device-id'), /device_id_layout_version='3'/);
  });

  it('uses the shared helper in API, logs, pairing, Telegram and client status', () => {
    const files = [
      'root/usr/libexec/sheepfold/sheepfold-router-control-legacy',
      'root/usr/libexec/sheepfold/sheepfold-device-detector',
      'root/usr/libexec/sheepfold/sheepfold-pair-device',
      'root/usr/libexec/sheepfold/sheepfold-telegram-bot',
      'root/usr/libexec/sheepfold/sheepfold-api-client-status',
      'root/usr/libexec/sheepfold/sheepfold-activity-log',
    ];

    for (const file of files) {
      assert.match(read(file), /sheepfold-device-id/);
    }
  });

  it('keeps old bound clients valid only for the same administrator MAC', () => {
    const tokenCommon = read('root/usr/libexec/sheepfold/sheepfold-token-common');
    const aiGate = read('root/usr/libexec/sheepfold/sheepfold-ai-gate');

    assert.match(tokenCommon, /legacy_ids/);
    assert.match(tokenCommon, /\[ "\$mac" = "\$wanted_mac" \] \|\| continue/);
    assert.match(aiGate, /server_legacy_ids/);
    assert.match(aiGate, /device_identity_mismatch/);
  });
});
