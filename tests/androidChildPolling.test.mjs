// Проверяет статический контракт фоновой работы детского APK: WorkManager для сети и AlarmManager для точного срока.
// Тест не запускает Android scheduler и не доказывает фактические интервалы на прошивке физического телефона.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const childRoot = resolve(repoRoot, 'android-child');
const workerPath = resolve(
  childRoot,
  'app/src/main/java/com/example/sheepfoldchild/polling/StatusPollWorker.kt',
);
const schedulerPath = resolve(
  childRoot,
  'app/src/main/java/com/example/sheepfoldchild/polling/PollingScheduler.kt',
);
const bootReceiverPath = resolve(
  childRoot,
  'app/src/main/java/com/example/sheepfoldchild/notification/SafeBootReceiver.kt',
);
const accessSchedulerPath = resolve(
  childRoot,
  'app/src/main/java/com/example/sheepfoldchild/notification/AccessEndingScheduler.kt',
);
const manifestPath = resolve(childRoot, 'app/src/main/AndroidManifest.xml');
const catalogPath = resolve(childRoot, 'gradle/libs.versions.toml');
const buildPath = resolve(childRoot, 'app/build.gradle.kts');

describe('Android child background polling', () => {
  it('runs periodic network polling in one unique CoroutineWorker', () => {
    const worker = readFileSync(workerPath, 'utf8');
    const scheduler = readFileSync(schedulerPath, 'utf8');

    assert.match(worker, /class StatusPollWorker[\s\S]*CoroutineWorker/);
    assert.match(worker, /override suspend fun doWork\(\): Result/);
    assert.doesNotMatch(
      worker,
      /import android\.content\.BroadcastReceiver|:\s*BroadcastReceiver|goAsync|CoroutineScope/,
    );
    assert.match(scheduler, /enqueueUniquePeriodicWork/);
    assert.match(scheduler, /ExistingPeriodicWorkPolicy\.UPDATE/);
    assert.match(scheduler, /NetworkType\.CONNECTED/);
    assert.match(scheduler, /15L \* 60L \* 1000L/);
    assert.match(scheduler, /30L \* 60L \* 1000L/);
  });

  it('moves boot-time networking out of BroadcastReceiver', () => {
    const receiver = readFileSync(bootReceiverPath, 'utf8');
    const scheduler = readFileSync(schedulerPath, 'utf8');
    const manifest = readFileSync(manifestPath, 'utf8');

    assert.match(receiver, /PollingScheduler\.refreshNow/);
    assert.doesNotMatch(receiver, /goAsync|ClientStatusRepository|CoroutineScope/);
    assert.match(scheduler, /enqueueUniqueWork/);
    assert.doesNotMatch(manifest, /StatusPollReceiver/);
  });

  it('keeps exact access-ending notifications on AlarmManager', () => {
    const accessScheduler = readFileSync(accessSchedulerPath, 'utf8');
    const worker = readFileSync(workerPath, 'utf8');

    assert.match(accessScheduler, /AlarmManager/);
    assert.match(accessScheduler, /setExactAndAllowWhileIdle|setExact/);
    assert.match(worker, /AccessEndingScheduler\.schedule/);
  });

  it('declares WorkManager through the child version catalog', () => {
    const catalog = readFileSync(catalogPath, 'utf8');
    const build = readFileSync(buildPath, 'utf8');

    assert.match(catalog, /workManager = "2\.10\.0"/);
    assert.match(catalog, /androidx-work-runtime-ktx/);
    assert.match(build, /implementation\(libs\.androidx\.work\.runtime\.ktx\)/);
  });
});
