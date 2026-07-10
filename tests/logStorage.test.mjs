import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');

describe('Log storage backends', () => {
  it('routes unified status and archive push through sheepfold-log-storage', () => {
    const legacy = readFileSync(
      resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-router-control-legacy'),
      'utf8',
    );
    const logStorage = readFileSync(
      resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-yandex-disk'),
      'utf8',
    );
    const dispatcher = readFileSync(
      resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-log-storage'),
      'utf8',
    );

    assert.match(legacy, /log-storage-status\)/);
    assert.match(dispatcher, /yandex_disk\)/);
    assert.match(dispatcher, /archive-push/);
    assert.match(logStorage, /archive-push/);
    assert.match(logStorage, /backups/);
    assert.match(logStorage, /quota_mb/);
    assert.match(logStorage, /cmd_test/);
    assert.match(logStorage, /cmd_list/);
    assert.match(logStorage, /cmd_download/);
    assert.match(logStorage, /cmd_restore_config/);
    assert.match(logStorage, /upload_and_verify/);
    assert.match(legacy, /yandex-disk-test\)/);
    assert.match(legacy, /yandex-disk-list\)/);
    assert.match(legacy, /yandex-disk-restore-config\)/);
  });

  it('mirrors live events to external storage backends from sheepfold-log', () => {
    const logHelper = readFileSync(
      resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-log'),
      'utf8',
    );
    const yandex = readFileSync(
      resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-yandex-disk'),
      'utf8',
    );

    assert.match(logHelper, /mirror_to_usb/);
    assert.match(logHelper, /schedule_yandex_push/);
    assert.match(logHelper, /YANDEX_PUSH_INTERVAL=300/);
    assert.match(yandex, /push-events/);
  });
});