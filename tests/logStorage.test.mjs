import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const storagePanelPath = resolve(
  packageDir,
  'htdocs/luci-static/resources/sheepfold/features/storage/panel.js',
);
const storageBackendPath = resolve(
  packageDir,
  'root/usr/libexec/sheepfold/sheepfold-log-storage',
);

describe('Log storage backends', () => {
  it('routes unified status and archive push through sheepfold-log-storage', () => {
    const legacy = readFileSync(
      resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-router-control-legacy'),
      'utf8',
    );
    const yandex = readFileSync(
      resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-yandex-disk'),
      'utf8',
    );
    const google = readFileSync(
      resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-google-drive'),
      'utf8',
    );
    const dispatcher = readFileSync(storageBackendPath, 'utf8');

    assert.match(legacy, /log-storage-status\)/);
    assert.match(dispatcher, /yandex_disk\)/);
    assert.match(dispatcher, /google_drive\)/);
    assert.match(dispatcher, /archive-push/);
    assert.match(yandex, /archive-push/);
    assert.match(google, /archive-push/);
    assert.match(google, /backups/);
    assert.match(google, /quota_mb/);
    assert.match(google, /cmd_test/);
    assert.match(google, /cmd_list/);
    assert.match(google, /cmd_download/);
    assert.match(google, /cmd_restore_config/);
    assert.match(google, /upload_and_verify/);
    assert.match(legacy, /yandex-disk-test\)/);
    assert.match(legacy, /google-drive-test\)/);
    assert.match(legacy, /google-drive-list\)/);
    assert.match(legacy, /google-drive-restore-config\)/);
  });

  it('translates backend storage messages at the LuCI boundary', () => {
    const panel = readFileSync(storagePanelPath, 'utf8');
    const ru = JSON.parse(readFileSync(
      resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/i18n/ru.json'),
      'utf8',
    ));
    const zhHans = JSON.parse(readFileSync(
      resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/i18n/zh_Hans.json'),
      'utf8',
    ));

    assert.match(panel, /function storageStatusText\(payload\)/);
    assert.match(panel, /return message \? _\(message\) : _\('Could not read storage status\.'\)/);
    assert.doesNotMatch(panel, /text\.textContent = payload && payload\.message \? payload\.message/);
    assert.equal(ru['Journals are stored in RAM'], 'Журналы хранятся в RAM');
    assert.equal(zhHans['Journals are stored in RAM'], '日志存储在内存中');
  });

  it('checks the critical RAM threshold before the warning threshold', () => {
    const backend = readFileSync(storageBackendPath, 'utf8');
    const criticalIndex = backend.indexOf('if [ "$free_kb" -lt 8192 ]');
    const warningIndex = backend.indexOf('elif [ "$free_kb" -lt 16384 ]');

    assert.notEqual(criticalIndex, -1);
    assert.notEqual(warningIndex, -1);
    assert.ok(criticalIndex < warningIndex);
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
    const google = readFileSync(
      resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-google-drive'),
      'utf8',
    );

    assert.match(logHelper, /mirror_to_usb/);
    assert.match(logHelper, /schedule_yandex_push/);
    assert.match(logHelper, /schedule_google_push/);
    assert.match(logHelper, /CLOUD_PUSH_INTERVAL=300/);
    assert.match(yandex, /push-events/);
    assert.match(google, /push-events/);
  });
});
