/*
 * Проверяет чистые модули локального quality gate: объединение тестов, ссылки,
 * структурный риск и CLI-флаги. Тест ничего не запускает и не меняет Git/роутер;
 * фактический ESLint и полный suite подтверждаются отдельными командами. §qassist §testwhy
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownTargets, registeredTags } from '../tools/quality/documentationAudit.mjs';
import { assessStructure } from '../tools/quality/structureAudit.mjs';
import { selectTestNames } from '../tools/quality/testSelection.mjs';
import { inspectWhitespace } from '../tools/quality/whitespaceAudit.mjs';
import { isPackageReleaseOnly } from '../tools/quality/gitChanges.mjs';
import { diffCheckArgs, parseQualityArgs } from '../scripts/runQualityChecks.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('quality assistant modules §qassist', () => {
  it('deduplicates overlapping categories and direct tests', () => {
    const selected = selectTestNames(['tooling', 'smoke'], ['tests/changeImpact.test.mjs']);
    assert.equal(selected.filter((name) => name === 'changeImpact.test.mjs').length, 1);
    assert.ok(selected.includes('runtimeCompatibilityMatrix.test.mjs'));
  });

  it('extracts local links and only registered concrete tags', () => {
    const source = [
      '[Документ](architecture/README.ru.md) [Сайт](https://example.test)',
      '[справка]: docs/help.md',
      "[Environment]::SetEnvironmentVariable('Path', $value)",
      '§qassist §-tag',
    ].join('\n');
    assert.deepEqual(markdownTargets(source), ['architecture/README.ru.md', 'https://example.test', 'docs/help.md']);
    assert.deepEqual([...registeredTags('| `§qassist` | QUALITY |')], ['§qassist']);
  });

  it('distinguishes growth, unchanged legacy size and an improving split', () => {
    const rows = assessStructure([
      { path: 'growing.js', threshold: 700, currentLines: 900, baseLines: 800 },
      { path: 'legacy.js', threshold: 700, currentLines: 900, baseLines: 900 },
      { path: 'shrinking.js', threshold: 700, currentLines: 800, baseLines: 1_000 },
    ]);
    assert.deepEqual(rows.map((row) => row.status), ['warning', 'notice', 'improved']);
  });

  it('separates quick planning from a strict full gate', () => {
    assert.deepEqual(parseQualityArgs(['--git', 'main', '--plan']), {
      base: 'main', mode: 'base', full: false, strict: false, planOnly: true, skipAndroid: false,
    });
    const gate = parseQualityArgs(['--full', '--strict', '--skip-android']);
    assert.equal(gate.full, true);
    assert.equal(gate.strict, true);
    assert.equal(gate.skipAndroid, true);
  });

  it('checks whitespace against the same Git surface selected for impact', () => {
    assert.deepEqual(diffCheckArgs({ mode: 'base', base: 'main' }), ['diff', '--check', 'main', '--']);
    assert.deepEqual(diffCheckArgs({ mode: 'staged', base: 'ignored' }), ['diff', '--cached', '--check', '--']);
    assert.deepEqual(diffCheckArgs({ mode: 'working', base: 'ignored' }), ['diff', '--check', '--']);
  });

  it('checks untracked text that git diff cannot see yet', () => {
    assert.deepEqual(inspectWhitespace('ok\n', 'ok.md'), []);
    assert.deepEqual(
      inspectWhitespace('bad  \n\n', 'new.md').map((issue) => issue.code),
      ['trailingWhitespace', 'extraBlankLineAtEof'],
    );
  });

  it('accepts the narrow package-release exception only when no executable Makefile line changed', () => {
    const before = 'PKG_VERSION:=0.1.0\nPKG_RELEASE:=239\nDEPENDS:=+foo\n';
    assert.equal(isPackageReleaseOnly('package/app/Makefile', before, before.replace('239', '240')), true);
    assert.equal(isPackageReleaseOnly('package/app/Makefile', before, before.replace('239', '240').replace('+foo', '+bar')), false);
    assert.equal(isPackageReleaseOnly('docs/Makefile', before, before.replace('239', '240')), false);
  });

  it('publishes one documented command path for planning, iteration and push', () => {
    const packageJson = JSON.parse(read('package.json'));
    const docs = read('docs/quality-assistants/README.ru.md');
    assert.match(packageJson.scripts['quality:plan'], /--plan/);
    assert.match(packageJson.scripts['quality:changed'], /runQualityChecks\.mjs/);
    assert.match(packageJson.scripts['quality:gate'], /--full --strict/);
    assert.match(packageJson.scripts['quality:docs:all'], /--all/);
    assert.match(docs, /quality:plan[\s\S]*quality:changed[\s\S]*quality:gate/);
    assert.match(read('docs/dev/tag-map.md'), /§qassist/);
  });
});
