/*
 * Риск: устройство одновременно затрагивает presence, классификацию, identity,
 * автогруппы, firewall и Android, поэтому частичная документация легко превращает
 * оптимизационный hash в средство доверия или переносит права между MAC. Тест
 * защищает наличие единого контракта и входов в него; он не доказывает соответствие
 * каждой строки документа исполняемому backend-коду.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const passportPath = resolve(repoRoot, 'docs/device-passport-and-control.ru.md');

function readRepoFile(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('device passport documentation §devpas1', () => {
  it('keeps one end-to-end contract with diagrams and separate identity layers', () => {
    const passport = readFileSync(passportPath, 'utf8');

    assert.match(passport, /## Общая схема[\s\S]*```mermaid/);
    assert.match(passport, /### Классификационный fingerprint/);
    assert.match(passport, /### Почему отпечатков именно два/);
    assert.match(passport, /## Доверенный отпечаток личности/);
    assert.match(passport, /## Карантин/);
    assert.match(passport, /## Автоматическое назначение групп/);
    assert.match(passport, /## Как паспорт влияет на доступ/);
    assert.match(passport, /## Android и границы доверия/);
    assert.match(passport, /## Что уже реализовано, а что только планируется/);
  });

  it('links agent entry points and both readmes to the canonical contract', () => {
    for (const path of ['README.md', 'README.ru.md']) {
      const source = readRepoFile(path);
      assert.match(source, /device-passport-and-control\.ru\.md/, `${path} lost passport link`);
    }

    for (const path of ['AGENTS.md', 'docs/agent-playbook.ru.md', 'docs/current-implementation-status.md']) {
      const source = readRepoFile(path);
      assert.match(source, /device-passport-and-control\.ru\.md/, `${path} lost passport link`);
      assert.match(source, /§devpas1/, `${path} lost passport tag`);
    }

    const tagMap = readRepoFile('docs/dev/tag-map.md');
    assert.match(tagMap, /§devpas1[^\n]*DEVICE_PASSPORT_END_TO_END/);
  });
});
