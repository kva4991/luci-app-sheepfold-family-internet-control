import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const read = (path) => readFileSync(resolve(packageRoot, path), 'utf8');

describe('stable numeric device IDs', () => {
  it('assigns positive monotonic IDs and migrates legacy formatted values', () => {
    const helper = read('root/usr/libexec/sheepfold/sheepfold-device-id');
    const defaults = read('root/usr/share/sheepfold/sheepfold.uci.defaults');

    assert.match(defaults, /option next_device_id '1'/);
    assert.match(helper, /is_positive_id/);
    assert.match(helper, /next_device_id/);
    assert.match(helper, /sed 's\/\[\^0-9\]\[\^0-9\]\*\/ \/g'/);
    assert.doesNotMatch(helper, /printf ['"]D-/);
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
});
