/*
 * Запускает автономные Python-тесты экспериментального серверного AI-core, чтобы
 * общий CI замечал поломку safety-ворот и строгих контрактов. Тест не обращается
 * к сети, не вызывает LLM и не подключает эксперимент к IPK или APK; ему нужен
 * Python 3.11+, а в ограниченной Windows-песочнице может понадобиться запуск вне
 * sandbox из-за запрета дочернего процесса. §aisrvexp1 §testwhy
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const python = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');
const coreDirectory = 'experimental/ai-server-core';

test('isolated AI server core keeps its fail-closed Python contracts', () => {
  const result = spawnSync(
    python,
    ['-m', 'unittest', 'discover', '-s', 'tests', '-v'],
    {
      cwd: coreDirectory,
      encoding: 'utf8',
      timeout: 120_000,
      windowsHide: true,
    },
  );

  assert.equal(
    result.status,
    0,
    result.error?.message || [result.stdout, result.stderr].filter(Boolean).join('\n'),
  );
});
