/**
 * Назначение: защищает операционную документацию и матрицу сопутствующих изменений.
 * Вход: AGENTS, focused runbook, нормативная матрица и карта §-тегов.
 * Выход: подтверждение ссылок, обязательных команд, ошибок и связей контрактов.
 * Ограничение: тест проверяет наличие ключевых договорённостей, но не заменяет чтение текста,
 * пробный запуск команд, documentation audit или инженерную оценку полноты матрицы.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(import.meta.dirname, '..');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('operational documentation contract §docops1 §cmpchg1', () => {
  it('makes the companion matrix mandatory from AGENTS', () => {
    const agents = read('AGENTS.md');
    assert.match(agents, /docs\/mandatory-companion-changes\.ru\.md/);
    assert.match(agents, /§cmpchg1/);
    assert.match(agents, /§docops1/);
  });

  it('covers shared settings, API, packaging and support-server changes', () => {
    const matrix = read('docs/mandatory-companion-changes.ru.md');
    for (const contract of [
      'UCI option',
      'CGI/API endpoint',
      'Файл в OpenWrt rootfs',
      'Резервный report endpoint',
      'Новый или существенно изменённый test',
      'Исполняемый script/helper',
    ]) {
      assert.match(matrix, new RegExp(contract.replace('/', '\\/')));
    }
    assert.match(matrix, /ожидаемый результат/i);
    assert.match(matrix, /как запускать нельзя|запрещённые запуски/i);
  });

  it('documents exact endpoint-discovery checks and known failure modes', () => {
    const runbook = read('docs/testing-support-endpoint-discovery.ru.md');
    assert.match(runbook, /node --test tests\/supportEndpointDiscovery\.test\.mjs/);
    assert.match(runbook, /tests\/testIpkPermissions\.test\.mjs tests\/productVariants\.test\.mjs/);
    assert.match(runbook, /spawnSync python EPERM/);
    assert.match(runbook, /manifest_sequence_conflict/);
    assert.match(runbook, /Не запускать два `npm\.cmd test`/);
    assert.match(runbook, /не меняет UCI/i);
  });

  it('keeps the documentation and support-report tag relationships visible', () => {
    const tagMap = read('docs/dev/tag-map.md');
    assert.match(tagMap, /Дерево связей §-тегов/);
    assert.match(tagMap, /§docops1[\s\S]*§testwhy/);
    assert.match(tagMap, /§cmpchg1[\s\S]*§impact1/);
    assert.match(tagMap, /§srep001[\s\S]*§srepdisc1/);
  });

  it('routes substantial documentation work through the project writing skill', () => {
    const agents = read('AGENTS.md');
    const fastStart = read('docs/agent-fast-start.ru.md');
    const standard = read('docs/documentation-writing-standard.ru.md');
    const skill = read('.agents/skills/sheepfold-documentation/SKILL.md');
    assert.match(agents, /sheepfold-documentation/);
    assert.match(fastStart, /documentation-writing-standard\.ru\.md/);
    assert.match(standard, /§docwrit/);
    assert.match(skill, /^---\r?\nname: sheepfold-documentation\r?\ndescription: .+\r?\n---/);
    assert.match(skill, /implemented, experimental, planned/);
  });
});
