import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const read = (path) => readFileSync(resolve(packageRoot, path), 'utf8');

/*
 * Проверяет постоянство пользовательских #ID статически. Живую атомарность
 * staged UCI при QR-сопряжении дополнительно проверяет стенд OpenWrt.
 */
describe('permanent numeric device IDs', () => {
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
