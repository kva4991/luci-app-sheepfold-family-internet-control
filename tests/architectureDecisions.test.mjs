/*
 * Защищает ADR как навигационный контракт: последовательные номера, обязательный
 * контекст решения, индекс и живые относительные ссылки. Тест не оценивает истинность
 * решения и не заменяет сверку документа с кодом и владельцем. §adrproc §testwhy
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const decisionDir = resolve(repoRoot, 'docs/architecture/decisions');
const decisionFiles = readdirSync(decisionDir)
  .filter((name) => /^\d{4}-.+\.ru\.md$/.test(name))
  .sort();
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('architecture decision records §adrproc', () => {
  it('keeps a numbered accepted decision set with required reasoning', () => {
    assert.ok(decisionFiles.length >= 10);
    const numbers = [];
    for (const file of decisionFiles) {
      const source = readFileSync(resolve(decisionDir, file), 'utf8');
      const number = file.slice(0, 4);
      numbers.push(Number(number));
      assert.match(source, new RegExp(`^# ADR-${number}: `));
      assert.match(source, /^- Статус: (?:Предложено|Принято|Отклонено|Заменено ADR-\d{4})$/m);
      assert.match(source, /^- Дата: \d{4}-\d{2}-\d{2}$/m);
      assert.match(source, /^- Теги: .*§[a-z0-9]{7}/m);
      for (const heading of ['Контекст', 'Рассмотренные варианты', 'Решение', 'Последствия', 'Проверка', 'Когда пересматривать']) {
        assert.match(source, new RegExp(`^## ${heading}$`, 'm'), `${file} lost ${heading}`);
      }
    }
    assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, index) => index + 1));
  });

  it('indexes every ADR and keeps its local links alive', () => {
    const index = read('docs/architecture/decisions/README.ru.md');
    for (const file of decisionFiles) {
      const number = file.slice(0, 4);
      assert.match(index, new RegExp(`\\[${number}\\]\\(${file.replaceAll('.', '\\.')}\\)`));

      const source = readFileSync(resolve(decisionDir, file), 'utf8');
      for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1];
        if (/^(?:https?:|#)/.test(target)) continue;
        assert.ok(existsSync(resolve(decisionDir, target)), `${file} links missing ${target}`);
      }
    }
  });

  it('connects ADR process to architecture entry points and the tag map', () => {
    const architecture = read('docs/architecture/README.ru.md');
    const tagMap = read('docs/dev/tag-map.md');
    const fastStart = read('docs/agent-fast-start.ru.md');
    assert.match(architecture, /decisions\/README\.ru\.md/);
    assert.match(tagMap, /§adrproc[^\n]*ARCHITECTURE_DECISION_RECORDS/);
    assert.match(fastStart, /architecture\/decisions/);
    assert.equal(basename(decisionDir), 'decisions');
  });
});
