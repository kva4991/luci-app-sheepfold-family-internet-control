/*
 * Компилирует реальные Kotlin session/store классы с изолированными платформенными
 * заглушками: свежая привязка не должна стираться старым 401, включая соревнование потоков
 * Меняет и удаляет только .build; без kotlinc тест явно пропускается
 * Не заменяет сборку обоих APK и тест Android lifecycle/Keystore на телефоне
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { it } from 'node:test';

it('preserves current Kotlin sessions when stale network failures arrive', (context) => {
  if (process.platform === 'win32' || spawnSync('kotlinc', ['-version'], { timeout: 20000 }).status !== 0) {
    context.skip('Нужен доступный kotlinc; Android instrumentation test сохранён отдельно');
    return;
  }
  const root = resolve(import.meta.dirname, '..');
  const parent = join(root, '.build', 'test-fixtures');
  mkdirSync(parent, { recursive: true });
  const fixture = mkdtempSync(join(parent, 'kotlin-session-'));
  const sourceRoot = join(root, 'android/app/src/main/java/app/sheepfold/android/router');
  const doubles = join(root, 'tests/fixtures/sessionRecovery');
  const sources = ['RouterSessionRecovery.kt', 'SheepfoldConnectionStore.kt', 'RouterConnectionRequest.kt', 'PairingSessionToken.kt']
    .map((name) => join(sourceRoot, name));
  sources.push(...readdirSync(doubles).filter((name) => name.endsWith('.kt')).map((name) => join(doubles, name)));
  try {
    const jar = join(fixture, 'session-probe.jar');
    const compile = spawnSync('kotlinc', [...sources, '-include-runtime', '-d', jar], { encoding: 'utf8', timeout: 60000 });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync('java', ['-jar', jar], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.stderr);
    assert.equal((run.stdout.match(/^PASS /gm) || []).length, 5, run.stdout);
    for (const line of run.stdout.trim().split('\n')) context.diagnostic(line);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
