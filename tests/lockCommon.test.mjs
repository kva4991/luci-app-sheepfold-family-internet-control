/*
 * Защищает единый flock-контракт автоопределения устройств. Статическая часть
 * работает на Windows; поведенческая проверка запускается только там, где есть flock.
 * Тест не трогает UCI и использует только временный каталог операционной системы.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold',
);
const lockCommonPath = resolve(runtimeDir, 'sheepfold-lock-common');
const detectorPath = resolve(runtimeDir, 'sheepfold-device-detector');
const reclassifyPath = resolve(runtimeDir, 'sheepfold-device-reclassify');
const servicePath = resolve(runtimeDir, 'sheepfold-service');
const temporaryDirectories = [];
const flockAvailable = spawnSync('sh', ['-c', 'command -v flock >/dev/null 2>&1']).status === 0;

function shellPath(path) {
  return path.replaceAll('\\', '/').replaceAll("'", "'\\''");
}

function waitForFile(path, timeoutMs = 3000) {
  const startedAt = Date.now();
  return new Promise((accept, reject) => {
    const check = () => {
      if (existsSync(path)) {
        accept();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Не дождались файла-маркера ${path}`));
        return;
      }
      setTimeout(check, 25);
    };
    check();
  });
}

function waitForExit(child) {
  return new Promise((accept, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => accept({ code, signal }));
  });
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe('Единая блокировка автоопределения устройств', () => {
  it('сводит фоновый, прямой и ручной запуск к одному flock-файлу', () => {
    const lockCommon = readFileSync(lockCommonPath, 'utf8');
    const detector = readFileSync(detectorPath, 'utf8');
    const reclassify = readFileSync(reclassifyPath, 'utf8');
    const service = readFileSync(servicePath, 'utf8');

    assert.match(lockCommon, /flock -n 9/);
    assert.match(lockCommon, /exec 9>"\$lock_path"/);
    assert.match(lockCommon, /wait_seconds.*300/);
    assert.doesNotMatch(lockCommon, /mkdir "\$lock_path"|rmdir "\$lock_path"/);

    [detector, reclassify, service].forEach((source) => {
      assert.match(source, /sheepfold-lock-common/);
      assert.match(source, /device-detection\.flock/);
    });
    assert.match(detector, /run_scan_locked/);
    assert.match(service, /SHEEPFOLD_DEVICE_LOCK_HELD=1 "\$DETECTOR"/);
    assert.match(reclassify, /SHEEPFOLD_DEVICE_LOCK_HELD=1 "\$DETECTOR" scan full/);
  });

  it('не позволяет второму процессу войти в защищённую секцию', { skip: !flockAvailable }, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'sheepfold-lock-'));
    const markerPath = join(directory, 'held');
    const lockPath = join(directory, 'detector.flock');
    const holderPath = join(directory, 'holder.sh');
    temporaryDirectories.push(directory);

    writeFileSync(holderPath, [
      '#!/bin/sh',
      `. '${shellPath(lockCommonPath)}'`,
      `sheepfold_lock_acquire '${shellPath(lockPath)}' 0 || exit 10`,
      `: > '${shellPath(markerPath)}'`,
      'sleep 1',
      'sheepfold_lock_release',
    ].join('\n'), 'utf8');

    const holder = spawn('sh', [holderPath], { stdio: 'pipe' });
    const holderExit = waitForExit(holder);
    await waitForFile(markerPath);

    const contender = spawnSync('sh', ['-c', [
      `. '${shellPath(lockCommonPath)}'`,
      `sheepfold_lock_acquire '${shellPath(lockPath)}' 0`,
    ].join('; ')], { encoding: 'utf8' });
    assert.equal(contender.status, 1, contender.stderr);

    const completed = await holderExit;
    assert.equal(completed.code, 0, `holder завершился сигналом ${completed.signal || 'none'}`);

    const successor = spawnSync('sh', ['-c', [
      `. '${shellPath(lockCommonPath)}'`,
      `sheepfold_lock_acquire '${shellPath(lockPath)}' 0`,
      'sheepfold_lock_release',
    ].join('; ')], { encoding: 'utf8' });
    assert.equal(successor.status, 0, successor.stderr);
  });
});
