import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const repo = process.cwd();
const tool = resolve('tools/quality/luciFinalAudit.mjs');

function run(root, extra = []) {
  const result = spawnSync(process.execPath, [tool, root, '--json', ...extra], { encoding: 'utf8' });
  const report = JSON.parse(result.stdout || '{}');
  return { result, report };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sheepfold-final-audit-tool-'));
  cpSync(resolve('package'), join(root, 'package'), { recursive: true });
  return root;
}

describe('final LuCI audit tool §ovaudit3', () => {
  it('accepts the corrected overlay with only declared original-module warnings', () => {
    const { result, report } = run(repo, ['--allow-overlay-missing']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.errors.length, 0);
    assert.ok(report.stats.uciCalls > 80);
    assert.ok(report.stats.createContracts > 20);
  });

  it('rejects an argument-bearing uci.save call', () => {
    const root = fixture();
    try {
      const path = join(root, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/core/persistence/uci.js');
      writeFileSync(path, readFileSync(path, 'utf8').replace('savePromise = deps.uci.save();', "savePromise = deps.uci.save('sheepfold');"));
      const { result, report } = run(root, ['--allow-overlay-missing']);
      assert.notEqual(result.status, 0);
      assert.ok(report.errors.some((error) => error.code === 'uci_call_arity'));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects a missing required dependency injection key', () => {
    const root = fixture();
    try {
      const path = join(root, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/overview/application.js');
      writeFileSync(path, readFileSync(path, 'utf8').replace('definitions: deviceTypes.definitions,', ''));
      const { result, report } = run(root, ['--allow-overlay-missing']);
      assert.notEqual(result.status, 0);
      assert.ok(report.errors.some((error) => error.code === 'missing_dependency' || error.code === 'device_type_definitions_missing'));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects a missing local LuCI module', () => {
    const root = fixture();
    try {
      const application = join(root, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/overview/application.js');
      writeFileSync(application, readFileSync(application, 'utf8').replace(
        "'require sheepfold.features.page.refresh as pageRefreshModel';",
        "'require sheepfold.features.page.missing-refresh as pageRefreshModel';",
      ));
      const { result, report } = run(root, ['--allow-overlay-missing']);
      assert.notEqual(result.status, 0);
      assert.ok(report.errors.some((error) => error.code === 'local_require_missing'));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
