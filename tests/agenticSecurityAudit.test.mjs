/*
 * Защищает ручной LLM-аудит от тихого превращения в автоматическое исправление
 * живого checkout. Тест читает runner и документацию, ничего не отправляет наружу
 * и не доказывает качество находок внешней модели. §secaudit1 §testwhy
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('manual agentic security audit §secaudit1', () => {
  const runner = read('tools/security/runVvaharnessAudit.ps1');
  const docs = read('docs/manual-agentic-security-audit.ru.md');
  const packageJson = JSON.parse(read('package.json'));

  it('keeps source upload and model spending behind two explicit switches', () => {
    assert.match(runner, /\[switch\]\$RunScan/);
    assert.match(runner, /\[switch\]\$ConfirmSourceUpload/);
    assert.match(runner, /\$RunScan -and -not \$ConfirmSourceUpload/);
    assert.match(runner, /'estimate-only'/);
    assert.match(docs, /по умолчанию выполняет только `doctor` и `estimate`/);
  });

  it('scans a detached clean clone instead of the working checkout', () => {
    assert.match(runner, /status --porcelain=v1/);
    assert.match(runner, /has uncommitted changes/);
    assert.match(runner, /'clone',[\s\S]*'--local',[\s\S]*'--no-hardlinks',[\s\S]*'--no-checkout'/);
    assert.match(runner, /'checkout',[\s\S]*'--detach',[\s\S]*\$sourceCommit/);
    assert.match(runner, /Move-Item -LiteralPath \(Join-Path \$scanRepoPath '\.git'\) -Destination \$gitMetadataPath/);
    assert.match(runner, /ScratchRoot must be outside the source repository/);
    assert.match(runner, /SHEEPFOLD_SCRIPT_SCRATCH_ROOT/);
    assert.match(runner, /GetFolderPath\('MyDocuments'\)/);
  });

  it('stops after reporting and never invokes remediation or validation stages', () => {
    assert.match(runner, /'--no-auto-step1'/);
    assert.match(runner, /'--stop-after',[\s\S]*'s9'/);
    assert.doesNotMatch(runner, /['"]remediate['"]/);
    assert.doesNotMatch(runner, /['"]validate['"]/);
    assert.match(runner, /autoRemediation = \$false/);
  });

  it('records provenance and exposes only a manual npm entry point', () => {
    for (const field of [
      'sourceCommit',
      'sourceBranch',
      'sourceWasClean',
      'createdAtUtc',
      'stopAfter',
      'sourceUploadConfirmed',
      'reportDirectory',
      'gitMetadata',
    ])
      assert.match(runner, new RegExp(field));

    assert.match(packageJson.scripts['security:audit:manual'], /runVvaharnessAudit\.ps1/);
    assert.doesNotMatch(packageJson.scripts.test, /vvaharness/i);
    assert.doesNotMatch(packageJson.scripts['quality:gate'], /vvaharness/i);
  });

  it('documents nondeterminism, human review and the missing build proof', () => {
    assert.match(docs, /недетерминирован/);
    assert.match(docs, /не является подтверждённой уязвимостью/);
    assert.match(docs, /не собирает Sheepfold и не\s+запускает его тесты/);
    assert.match(docs, /регрессионн.*тест/);
  });
});
